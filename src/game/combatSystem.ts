import {
  AI_HIT_DAMAGE,
  AI_HP_MAX,
  AI_STAMINA_DODGE_COST,
  AI_STAMINA_MAX,
  AI_STAMINA_RECOVERY_PER_SEC,
  COUNTER_DELAY_MS,
  DODGE_DURATION_MS,
  GUARD_DISTANCE_THRESHOLD,
  PLAYER_HP_MAX,
  THREAT_PROBABILITY_THRESHOLD
} from "./constants";
import type {
  CombatSnapshot,
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
import { distanceVec3 } from "../utils/vector";
import { isThreateningOutput } from "../model/modelAdapter";

interface SphereHitbox {
  center: Vec3;
  radius: number;
}

const HITBOXES: SphereHitbox[] = [
  { center: { x: 0, y: 1.78, z: -1.85 }, radius: 0.34 },
  { center: { x: 0, y: 1.22, z: -1.9 }, radius: 0.52 }
];

function pointInsideSphere(point: Vec3, sphere: SphereHitbox): boolean {
  return distanceVec3(point, sphere.center) <= sphere.radius;
}

function trajectoryIntersectsHitboxes(traj: WristPairTrajectory): boolean {
  return traj.some((wristSteps) => wristSteps.some((point) => HITBOXES.some((hitbox) => pointInsideSphere(point, hitbox))));
}

function chooseDodgeType(traj: WristPairTrajectory): DodgeType {
  const averageX =
    traj.flat().reduce((sum, point) => sum + point.x, 0) / Math.max(traj.flat().length, 1);
  const averageY = traj.flat().reduce((sum, point) => sum + point.y, 0) / Math.max(traj.flat().length, 1);
  const dodgeSide = averageX >= 0 ? "left" : "right";
  const dodgeStyle = averageY >= 1.48 ? "weave" : "duck";

  return `${dodgeSide}_${dodgeStyle}` as DodgeType;
}

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

function isGuarding(pose: ResolvedPoseFrame | null): boolean {
  if (!pose) {
    return false;
  }

  return (
    distanceVec3(pose.leftWrist, pose.nose) <= GUARD_DISTANCE_THRESHOLD ||
    distanceVec3(pose.rightWrist, pose.nose) <= GUARD_DISTANCE_THRESHOLD
  );
}

/** Encapsulates dodge, stamina, counter, and guard state transitions. */
export class CombatSystem {
  private aiHp = AI_HP_MAX;
  private playerHp = PLAYER_HP_MAX;
  private aiStamina = AI_STAMINA_MAX;
  private lastUpdateTime: number | null = null;
  private threatExpiresAt: number | null = null;
  private aiHitCooldownUntil: number | null = null;
  private counterDueAt: number | null = null;
  private lastGuardResult: GuardResult = "none";
  private dodgeType: DodgeType | null = null;
  private counterState: "idle" | "primed" | "resolved" = "idle";
  private counterMove: CounterMove | null = null;
  private counterIndex = 0;
  private statusText = "Warming up tracker";
  private threatStateName: StateName = "idle";
  private threatProbability = 0;

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
    triggerCounter: { move: CounterMove; result: GuardResult } | null;
  } {
    const { now, modelMode, tracking, output, worldTraj, userPose } = params;
    if (this.lastUpdateTime !== null) {
      const elapsedSeconds = Math.max((now - this.lastUpdateTime) / 1000, 0);
      this.aiStamina = Math.min(AI_STAMINA_MAX, this.aiStamina + elapsedSeconds * AI_STAMINA_RECOVERY_PER_SEC);
    }
    this.lastUpdateTime = now;

    let triggerDodge: DodgeType | null = null;
    let triggerCounter: { move: CounterMove; result: GuardResult } | null = null;

    if (!tracking || !output || !worldTraj) {
      this.statusText = tracking ? "Collecting model-ready frames" : "Tracking lost";
      this.threatExpiresAt = null;
      this.threatStateName = output?.state_name ?? "idle";
      this.threatProbability = output?.attacking_prob ?? 0;
      return {
        snapshot: this.createSnapshot(modelMode, tracking),
        triggerDodge,
        triggerCounter
      };
    }

    this.threatStateName = output.state_name;
    this.threatProbability = output.attacking_prob;
    const threatening = isThreateningOutput(output, THREAT_PROBABILITY_THRESHOLD);
    const intersects = threatening && trajectoryIntersectsHitboxes(worldTraj);

    if (intersects) {
      this.threatExpiresAt = now + DODGE_DURATION_MS;
    }

    if (intersects && this.dodgeType === null && this.counterState === "idle") {
      if (this.aiStamina >= AI_STAMINA_DODGE_COST) {
        this.aiStamina -= AI_STAMINA_DODGE_COST;
        this.dodgeType = chooseDodgeType(worldTraj);
        this.counterMove = chooseCounterMove(this.dodgeType, this.counterIndex);
        this.counterIndex += 1;
        this.counterDueAt = now + COUNTER_DELAY_MS;
        this.counterState = "primed";
        this.lastGuardResult = "none";
        this.statusText = `AI ${this.dodgeType.replace("_", " ")} and loads ${this.counterMove.replace("_", " ")}`;
        triggerDodge = this.dodgeType;
      } else if (this.aiHitCooldownUntil === null || now >= this.aiHitCooldownUntil) {
        this.aiHp = Math.max(this.aiHp - AI_HIT_DAMAGE, 0);
        this.aiHitCooldownUntil = now + DODGE_DURATION_MS;
        this.counterDueAt = null;
        this.counterMove = null;
        this.lastGuardResult = "none";
        this.statusText = this.aiHp > 0 ? "AI got clipped while exhausted" : "AI is down";
      } else {
        this.statusText = "AI is exhausted and cannot dodge";
      }
    } else if (threatening) {
      this.statusText = "Threat detected";
    } else {
      this.statusText = "Reading movement";
    }

    if (this.dodgeType !== null && this.threatExpiresAt !== null && now >= this.threatExpiresAt) {
      this.dodgeType = null;
    }

    if (this.counterDueAt !== null && now >= this.counterDueAt) {
      const guardResult = isGuarding(userPose) ? "guarded" : "hit";
      this.lastGuardResult = guardResult;
      this.counterState = "resolved";
      this.counterDueAt = null;
      if (guardResult === "hit") {
        this.playerHp = Math.max(this.playerHp - 12, 0);
        this.statusText = `${this.counterMove?.replace("_", " ") ?? "counter"} landed cleanly`;
      } else {
        this.statusText = `${this.counterMove?.replace("_", " ") ?? "counter"} was blocked`;
      }
      if (this.counterMove) {
        triggerCounter = { move: this.counterMove, result: guardResult };
      }
    }

    if (this.counterState === "resolved" && !threatening) {
      this.counterState = "idle";
      this.counterMove = null;
    }

    return {
      snapshot: this.createSnapshot(modelMode, tracking),
      triggerDodge,
      triggerCounter
    };
  }

  /** Creates an immutable HUD-friendly snapshot. */
  private createSnapshot(modelMode: ModelMode, tracking: boolean): CombatSnapshot {
    return {
      aiHp: this.aiHp,
      playerHp: this.playerHp,
      aiStamina: this.aiStamina,
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
}
