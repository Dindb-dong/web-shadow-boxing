import {
  AI_COUNTER_VULNERABLE_HIT_DAMAGE,
  AI_DODGE_CHANCE_MAX,
  AI_DODGE_CHANCE_MIN,
  AI_HIT_DAMAGE,
  AI_HP_MAX,
  AI_STAMINA_DODGE_COST,
  AI_STAMINA_MAX,
  AI_STAMINA_RECOVERY_PER_SEC,
  COUNTER_BLOCK_DISTANCE_THRESHOLD,
  COUNTER_FACE_HIT_THRESHOLD,
  COUNTER_LAUNCH_DELAY_MS,
  COUNTER_RESOLVE_DELAY_MS,
  COUNTER_SWAY_Z_THRESHOLD,
  DODGE_DURATION_MS,
  PLAYER_HP_MAX,
  THREAT_PROBABILITY_THRESHOLD
} from "./constants";
import type {
  CombatSnapshot,
  CounterTrigger,
  CounterMove,
  DodgeType,
  GuardResult,
  ModelMode,
  ModelOutput,
  ResolvedPoseFrame,
  StateName,
  Vec3,
  WristPairTrajectory
} from "../types/game";
import { clamp, distanceVec3 } from "../utils/vector";
import { isThreateningOutput } from "../model/modelAdapter";
import { mapBodyPointToWorld } from "./worldMapping";

interface SphereHitbox {
  center: Vec3;
  radius: number;
}

interface CounterResolution {
  result: GuardResult;
  reason: "hit" | "blocked" | "sway" | "missed";
}

interface CombatDebugTelemetry {
  avatarOverlap: boolean;
  dodgeChance: number | null;
  dodgeRoll: number | null;
  attackStartedEdge: boolean;
}
type DodgeSide = "left" | "right";

const AI_FACE_HITBOX: SphereHitbox = { center: { x: 0, y: 1.82, z: -1.88 }, radius: 0.34 };
const AI_TORSO_HITBOX: SphereHitbox = { center: { x: 0, y: 1.2, z: -1.96 }, radius: 0.5 };
const AI_AVATAR_HITBOXES: SphereHitbox[] = [AI_FACE_HITBOX, AI_TORSO_HITBOX];

/** Returns whether the sampled trajectory point overlaps a spherical hitbox. */
function pointInsideSphere(point: Vec3, sphere: SphereHitbox): boolean {
  return distanceVec3(point, sphere.center) <= sphere.radius;
}

/** Returns whether one trajectory segment intersects a spherical hitbox. */
function segmentIntersectsSphere(start: Vec3, end: Vec3, sphere: SphereHitbox): boolean {
  const directionX = end.x - start.x;
  const directionY = end.y - start.y;
  const directionZ = end.z - start.z;
  const segmentLengthSquared = directionX * directionX + directionY * directionY + directionZ * directionZ;

  if (segmentLengthSquared <= 1e-8) {
    return pointInsideSphere(start, sphere);
  }

  const toCenterX = sphere.center.x - start.x;
  const toCenterY = sphere.center.y - start.y;
  const toCenterZ = sphere.center.z - start.z;
  const rawProjection =
    (toCenterX * directionX + toCenterY * directionY + toCenterZ * directionZ) / segmentLengthSquared;
  const projected = clamp(rawProjection, 0, 1);
  const nearestPoint: Vec3 = {
    x: start.x + directionX * projected,
    y: start.y + directionY * projected,
    z: start.z + directionZ * projected
  };

  return pointInsideSphere(nearestPoint, sphere);
}

/** Returns whether one trajectory segment intersects any avatar hitbox. */
function segmentIntersectsAnyHitbox(start: Vec3, end: Vec3, hitboxes: SphereHitbox[]): boolean {
  return hitboxes.some((sphere) => segmentIntersectsSphere(start, end, sphere));
}

/** Returns whether either wrist path reaches the visible AI avatar volume. */
function trajectoryIntersectsAvatar(traj: WristPairTrajectory): boolean {
  return traj.some((wristSteps) => {
    for (let index = 0; index < wristSteps.length; index += 1) {
      const point = wristSteps[index];
      if (AI_AVATAR_HITBOXES.some((sphere) => pointInsideSphere(point, sphere))) {
        return true;
      }
      if (
        index < wristSteps.length - 1 &&
        segmentIntersectsAnyHitbox(point, wristSteps[index + 1], AI_AVATAR_HITBOXES)
      ) {
        return true;
      }
    }

    return false;
  });
}

/** Converts the user's current head position into scene world coordinates. */
function resolveCounterTarget(pose: ResolvedPoseFrame | null): Vec3 | null {
  return pose ? mapBodyPointToWorld(pose.nose) : null;
}

/** Computes the AI dodge chance from its current stamina and the detected attack confidence. */
function computeDodgeChance(aiStamina: number, attackingProb: number): number {
  const staminaRatio = clamp(aiStamina / AI_STAMINA_MAX, 0, 1);
  const attackBias = clamp((attackingProb - THREAT_PROBABILITY_THRESHOLD) * 0.22, 0, 0.12);

  return clamp(
    AI_DODGE_CHANCE_MIN + staminaRatio * (AI_DODGE_CHANCE_MAX - AI_DODGE_CHANCE_MIN) + attackBias,
    AI_DODGE_CHANCE_MIN,
    AI_DODGE_CHANCE_MAX
  );
}

/** Chooses a dodge side from threat position and lateral wrist travel. */
function chooseDodgeSide(traj: WristPairTrajectory, random: () => number, previousSide: DodgeSide | null): DodgeSide {
  const flat = traj.flat();
  const pointCount = Math.max(flat.length, 1);
  const averageX = flat.reduce((sum, point) => sum + point.x, 0) / pointCount;
  const lateralTravel =
    traj.reduce((sum, wristSteps) => sum + (wristSteps[wristSteps.length - 1].x - wristSteps[0].x), 0) /
    Math.max(traj.length, 1);
  const sideSignal = averageX * 0.62 + lateralTravel * 1.35;
  const leftProbability = clamp(0.5 + sideSignal * 0.75, 0.2, 0.8);
  const sampledSide: DodgeSide = random() <= leftProbability ? "left" : "right";

  if (previousSide && sampledSide === previousSide && Math.abs(sideSignal) < 0.16) {
    return previousSide === "left" ? "right" : "left";
  }
  return sampledSide;
}

/** Chooses a dodge family from incoming wrist trajectory and current side history. */
function chooseDodgeType(
  traj: WristPairTrajectory,
  random: () => number,
  previousSide: DodgeSide | null
): DodgeType {
  const averageY = traj.flat().reduce((sum, point) => sum + point.y, 0) / Math.max(traj.flat().length, 1);
  const dodgeSide = chooseDodgeSide(traj, random, previousSide);
  const dodgeStyle = averageY >= 1.48 ? "weave" : "duck";
  return `${dodgeSide}_${dodgeStyle}` as DodgeType;
}

/** Rotates through counter patterns that match the chosen dodge. */
function chooseCounterMove(dodgeType: DodgeType, counterIndex: number): CounterMove {
  const patterns: Record<DodgeType, [CounterMove, CounterMove]> = {
    left_duck: ["left_uppercut", "right_straight"],
    right_duck: ["right_uppercut", "left_straight"],
    left_weave: ["left_hook", "right_straight"],
    right_weave: ["right_hook", "left_straight"]
  };

  const options = patterns[dodgeType];
  return options[counterIndex % options.length];
}

/** Resolves whether the AI counter found the user's face or was defended. */
function resolveCounterResult(pose: ResolvedPoseFrame | null, target: Vec3 | null): CounterResolution {
  if (!pose || !target) {
    return { result: "guarded", reason: "missed" };
  }

  const noseWorld = mapBodyPointToWorld(pose.nose);
  if (distanceVec3(noseWorld, target) <= COUNTER_FACE_HIT_THRESHOLD) {
    return { result: "hit", reason: "hit" };
  }

  if (noseWorld.z > target.z + COUNTER_SWAY_Z_THRESHOLD) {
    return { result: "guarded", reason: "sway" };
  }

  const defensePoints = [
    pose.leftWrist,
    pose.rightWrist,
    pose.leftElbow,
    pose.rightElbow,
    pose.leftShoulder,
    pose.rightShoulder
  ].map((point) => mapBodyPointToWorld(point));

  if (defensePoints.some((point) => distanceVec3(point, target) <= COUNTER_BLOCK_DISTANCE_THRESHOLD)) {
    return { result: "guarded", reason: "blocked" };
  }

  return { result: "guarded", reason: "missed" };
}

/** Encapsulates dodge, stamina, counter, and guard state transitions. */
export class CombatSystem {
  constructor(private readonly random: () => number = Math.random) {}

  private aiHp = AI_HP_MAX;
  private playerHp = PLAYER_HP_MAX;
  private aiStamina = AI_STAMINA_MAX;
  private successfulHits = 0;
  private guardedCounters = 0;
  private lastUpdateTime: number | null = null;
  private threatExpiresAt: number | null = null;
  private counterLaunchAt: number | null = null;
  private counterResolveAt: number | null = null;
  private counterTarget: Vec3 | null = null;
  private lastGuardResult: GuardResult = "none";
  private dodgeType: DodgeType | null = null;
  private counterState: "idle" | "primed" | "resolved" = "idle";
  private counterMove: CounterMove | null = null;
  private counterIndex = 0;
  private lastDodgeSide: DodgeSide | null = null;
  private statusText = "Warming up tracker";
  private threatStateName: StateName = "idle";
  private threatProbability = 0;
  private attackActive = false;
  private attackResolved = false;

  /** Advances combat state using the latest prediction and user pose. */
  update(params: {
    now: number;
    modelMode: ModelMode;
    tracking: boolean;
    output: ModelOutput | null;
    worldTraj: WristPairTrajectory | null;
    userPose: ResolvedPoseFrame | null;
  }): {
    snapshot: CombatSnapshot;
    triggerDodge: DodgeType | null;
    triggerCounter: CounterTrigger | null;
    debug: CombatDebugTelemetry;
  } {
    const { now, modelMode, tracking, output, worldTraj, userPose } = params;
    if (this.lastUpdateTime !== null) {
      const elapsedSeconds = Math.max((now - this.lastUpdateTime) / 1000, 0);
      this.aiStamina = Math.min(AI_STAMINA_MAX, this.aiStamina + elapsedSeconds * AI_STAMINA_RECOVERY_PER_SEC);
    }
    this.lastUpdateTime = now;

    let triggerDodge: DodgeType | null = null;
    let triggerCounter: CounterTrigger | null = null;
    let debug: CombatDebugTelemetry = {
      avatarOverlap: false,
      dodgeChance: null,
      dodgeRoll: null,
      attackStartedEdge: false
    };

    if (this.aiHp <= 0) {
      this.statusText = "Victory. AI is down";
      this.threatExpiresAt = null;
      this.threatStateName = "idle";
      this.threatProbability = 0;
      this.attackActive = false;
      this.attackResolved = true;
      this.cancelCounter();
      this.dodgeType = null;
      return {
        snapshot: this.createSnapshot(modelMode, tracking),
        triggerDodge,
        triggerCounter,
        debug
      };
    }

    if (!tracking || !output || !worldTraj) {
      this.statusText = tracking ? "Collecting model-ready frames" : "Tracking lost";
      this.threatExpiresAt = null;
      this.threatStateName = output?.state_name ?? "idle";
      this.threatProbability = output?.attacking_prob ?? 0;
      this.attackActive = false;
      this.attackResolved = false;
      return {
        snapshot: this.createSnapshot(modelMode, tracking),
        triggerDodge,
        triggerCounter,
        debug
      };
    }

    this.threatStateName = output.state_name;
    this.threatProbability = output.attacking_prob;
    const threatening = isThreateningOutput(output, THREAT_PROBABILITY_THRESHOLD);
    const avatarThreat = threatening && trajectoryIntersectsAvatar(worldTraj);
    const attackStarted = threatening && !this.attackActive;
    const vulnerableToPunish = this.counterState === "primed" && this.counterLaunchAt !== null;
    debug = {
      avatarOverlap: avatarThreat,
      dodgeChance: null,
      dodgeRoll: null,
      attackStartedEdge: attackStarted
    };

    if (threatening) {
      this.threatExpiresAt = now + DODGE_DURATION_MS;
    }
    if (attackStarted) {
      this.attackActive = true;
      this.attackResolved = false;
    } else if (!threatening) {
      this.attackActive = false;
      this.attackResolved = false;
    }

    if (attackStarted && threatening && !this.attackResolved && vulnerableToPunish && avatarThreat) {
      this.applyAiHit(AI_COUNTER_VULNERABLE_HIT_DAMAGE);
      this.cancelCounter();
      this.attackResolved = true;
      this.statusText = this.aiHp > 0 ? "You punished the AI during its counter" : "Victory. AI is down";
    } else if (attackStarted && !this.attackResolved && avatarThreat) {
      if (this.counterState === "idle" && this.dodgeType === null) {
        const dodgeChance = computeDodgeChance(this.aiStamina, output.attacking_prob);
        const dodgeRoll = this.random();
        const canDodge = this.aiStamina >= AI_STAMINA_DODGE_COST && dodgeRoll <= dodgeChance;
        debug.dodgeChance = dodgeChance;
        debug.dodgeRoll = dodgeRoll;

        if (canDodge) {
          this.aiStamina -= AI_STAMINA_DODGE_COST;
          this.dodgeType = chooseDodgeType(worldTraj, this.random, this.lastDodgeSide);
          this.lastDodgeSide = this.dodgeType.startsWith("left") ? "left" : "right";
          this.counterMove = chooseCounterMove(this.dodgeType, this.counterIndex);
          this.counterIndex += 1;
          this.counterLaunchAt = now + COUNTER_LAUNCH_DELAY_MS;
          this.counterResolveAt = now + COUNTER_LAUNCH_DELAY_MS + COUNTER_RESOLVE_DELAY_MS;
          this.counterTarget = resolveCounterTarget(userPose);
          this.counterState = "primed";
          this.lastGuardResult = "none";
          this.attackResolved = true;
          this.statusText = `AI ${this.dodgeType.replace("_", " ")} dodged and is loading a counter`;
          triggerDodge = this.dodgeType;
        } else {
          this.applyAiHit(AI_HIT_DAMAGE);
          this.attackResolved = true;
          this.statusText = this.aiHp > 0 ? "Your punch landed on the AI" : "Victory. AI is down";
        }
      } else {
        this.applyAiHit(AI_HIT_DAMAGE);
        this.attackResolved = true;
        this.statusText = this.aiHp > 0 ? "Your punch caught the AI mid-motion" : "Victory. AI is down";
      }
    } else if (threatening && this.counterState === "primed") {
      this.statusText = this.counterLaunchAt !== null ? "AI counter is locked on your last head position" : "AI counter is in motion";
    } else if (avatarThreat && this.dodgeType !== null) {
      this.statusText = `AI ${this.dodgeType.replace("_", " ")} is slipping the punch`;
    } else if (threatening) {
      this.statusText = "Threat detected";
    } else {
      this.statusText = "Reading movement";
    }

    if (this.dodgeType !== null && this.threatExpiresAt !== null && now >= this.threatExpiresAt) {
      this.dodgeType = null;
    }

    let launchedCounterNow = false;
    if (this.counterLaunchAt !== null && now >= this.counterLaunchAt && this.counterMove) {
      launchedCounterNow = true;
      this.counterLaunchAt = null;
      const target = this.counterTarget ?? AI_FACE_HITBOX.center;
      this.statusText = `${this.counterMove.replace("_", " ")} launched`;
      triggerCounter = { move: this.counterMove, result: "none", target };
    }

    if (!launchedCounterNow && this.counterResolveAt !== null && now >= this.counterResolveAt) {
      const resolution = resolveCounterResult(userPose, this.counterTarget);
      const guardResult = resolution.result;
      this.lastGuardResult = guardResult;
      this.counterState = "resolved";
      this.counterResolveAt = null;
      this.counterTarget = null;
      if (guardResult === "hit") {
        this.playerHp = Math.max(this.playerHp - 12, 0);
        this.statusText = `${this.counterMove?.replace("_", " ") ?? "counter"} found your face`;
      } else {
        this.guardedCounters += 1;
        this.statusText =
          resolution.reason === "blocked"
            ? `${this.counterMove?.replace("_", " ") ?? "counter"} was blocked by your arms`
            : resolution.reason === "sway"
              ? `${this.counterMove?.replace("_", " ") ?? "counter"} missed as you slipped back`
              : `${this.counterMove?.replace("_", " ") ?? "counter"} missed off line`;
      }
    }

    if (this.counterState === "resolved" && !threatening) {
      this.counterState = "idle";
      this.counterMove = null;
    }

    return {
      snapshot: this.createSnapshot(modelMode, tracking),
      triggerDodge,
      triggerCounter,
      debug
    };
  }

  /** Creates an immutable HUD-friendly snapshot. */
  private createSnapshot(modelMode: ModelMode, tracking: boolean): CombatSnapshot {
    return {
      aiHp: this.aiHp,
      playerHp: this.playerHp,
      aiStamina: this.aiStamina,
      successfulHits: this.successfulHits,
      guardedCounters: this.guardedCounters,
      tracking,
      modelMode,
      activeThreat: {
        stateName: this.threatStateName,
        attackingProb: this.threatProbability,
        active: this.threatExpiresAt !== null,
        expiresAt: this.threatExpiresAt
      },
      lastGuardResult: this.lastGuardResult,
      counterState: this.counterState,
      counterMove: this.counterMove,
      statusText: this.statusText,
      dodgeType: this.dodgeType
    };
  }

  /** Applies one confirmed hit to the AI. */
  private applyAiHit(damage: number): void {
    this.aiHp = Math.max(this.aiHp - damage, 0);
    this.successfulHits += 1;
    this.lastGuardResult = "none";
    if (this.aiHp === 0) {
      this.statusText = "Victory. AI is down";
      this.threatExpiresAt = null;
      this.threatStateName = "idle";
      this.threatProbability = 0;
      this.attackActive = false;
      this.attackResolved = true;
      this.cancelCounter();
      this.dodgeType = null;
    }
  }

  /** Cancels the currently primed counter after the AI gets interrupted. */
  private cancelCounter(): void {
    this.counterLaunchAt = null;
    this.counterResolveAt = null;
    this.counterTarget = null;
    this.counterMove = null;
    this.counterState = "idle";
  }
}
