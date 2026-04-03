import { SAMPLE_INTERVAL_MS } from "./constants";
import { CombatSystem } from "./combatSystem";
import {
  TRAJECTORY_RENDER_PROBABILITY_THRESHOLD,
  shouldEmitThreatTrajectory
} from "./threatAssessment";
import { trajectoryToWorld } from "./worldMapping";
import { BoxerAiPredictor } from "../model/boxerAiPredictor";
import type { TrajectoryPredictor } from "../model/trajectoryPredictor";
import { PoseSequenceBuffer } from "../pose/featureEngineering";
import { PoseTracker } from "../pose/poseTracker";
import { SceneManager } from "../render/sceneManager";
import type { HudSnapshot, ModelOutput, WristPairTrajectory } from "../types/game";
import { HudController } from "../ui/hud";
import { PoseOverlayRenderer } from "../ui/poseOverlay";
import { createAppShell } from "../ui/shell";

/** Orchestrates webcam tracking, model inference, combat state, and rendering. */
export class ShadowboxingGame {
  private static readonly MAX_DEBUG_LOG_LINES = 6;
  private readonly shell;
  private readonly hud: HudController;
  private readonly scene: SceneManager;
  private readonly poseOverlay: PoseOverlayRenderer;
  private readonly combat = new CombatSystem();
  private readonly poseBuffer = new PoseSequenceBuffer();
  private readonly poseTracker = new PoseTracker();
  private readonly predictor: TrajectoryPredictor;
  private poseLoopTimer: number | null = null;
  private renderFrameId: number | null = null;
  private inferenceBusy = false;
  private lastThreatAssessmentAt: number | null = null;
  private stableOutput: ModelOutput | null = null;
  private stableWorldTrajectory: WristPairTrajectory | null = null;
  private lastRawOutput: ModelOutput | null = null;
  private wristsVisible = false;
  private leftWristVisibility = 0;
  private rightWristVisibility = 0;
  private predictionGatedReason = "booting";
  private lastTrajectoryEmitRawProb: number | null = null;
  private combatHitboxOverlapLabel = "n/a";
  private dodgeChanceRollLabel = "n/a";
  private attackStartedEdgeLabel = "no";
  private threatAssessmentRefreshCount = 0;
  private threatTrajectoryEmitCount = 0;
  private lastDebugEvent = "Booting debug HUD";
  private debugLogLines = ["Booting debug HUD"];
  private latestHudSnapshot: HudSnapshot = {
    aiHp: 100,
    playerHp: 100,
    aiStamina: 100,
    successfulHits: 0,
    guardedCounters: 0,
    tracking: false,
    modelMode: "real",
    activeThreat: {
      stateName: "idle",
      attackingProb: 0,
      active: false,
      expiresAt: null
    },
    lastGuardResult: "none",
    counterState: "idle",
    counterMove: null,
    statusText: "Preparing camera permissions",
    dodgeType: null,
    trackingLabel: "Booting",
    stateLabel: "idle",
    attackingProbLabel: "0.00",
    debug: {
      rawThreatLabel: "idle / 0.00",
      rawAttackingProbLabel: "0.00",
      trajectoryEmitRawProbLabel: "n/a",
      stableThreatLabel: "idle / 0.00",
      wristsVisibleLabel: "no",
      leftWristVisibilityLabel: "0.00",
      rightWristVisibilityLabel: "0.00",
      predictionGatedLabel: "booting",
      combatHitboxOverlapLabel: "n/a",
      dodgeChanceRollLabel: "n/a",
      attackStartedEdgeLabel: "no",
      assessmentAgeLabel: "n/a",
      refreshCountLabel: "0",
      emitCountLabel: "0",
      lastEventLabel: "Booting debug HUD",
      logLines: ["Booting debug HUD"]
    }
  };

  constructor(root: HTMLElement, predictor: TrajectoryPredictor = new BoxerAiPredictor()) {
    this.predictor = predictor;
    this.shell = createAppShell(root);
    this.hud = new HudController(this.shell);
    this.scene = new SceneManager(this.shell.sceneHost);
    this.poseOverlay = new PoseOverlayRenderer(this.shell.videoOverlay);
    window.addEventListener("resize", this.handleResize);
  }

  /** Starts webcam permissions, pose detection, and both runtime loops. */
  async start(): Promise<void> {
    this.hud.update(this.latestHudSnapshot);

    try {
      await this.scene.initialize();
      await this.poseTracker.initialize(this.shell.videoPreview);
      await this.predictor.initialize();
      this.latestHudSnapshot.statusText = "Camera live. Building sequence buffer";
      this.hud.update(this.latestHudSnapshot);
      this.schedulePoseLoop();
      this.scheduleRenderLoop();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown camera error";
      this.latestHudSnapshot.statusText = message;
      this.latestHudSnapshot.trackingLabel = "Unavailable";
      this.hud.update(this.latestHudSnapshot);
    }
  }

  /** Releases browser resources and scheduled callbacks. */
  dispose(): void {
    if (this.poseLoopTimer !== null) {
      window.clearTimeout(this.poseLoopTimer);
    }
    if (this.renderFrameId !== null) {
      window.cancelAnimationFrame(this.renderFrameId);
    }
    this.poseTracker.dispose();
    this.scene.dispose();
    window.removeEventListener("resize", this.handleResize);
  }

  private readonly handleResize = (): void => {
    this.scene.resize();
    this.poseOverlay.resize();
  };

  /** Clears the stable threat assessment when tracking becomes unusable. */
  private resetThreatAssessment(): void {
    this.lastThreatAssessmentAt = null;
    this.lastRawOutput = null;
    this.stableOutput = null;
    this.stableWorldTrajectory = null;
    this.combatHitboxOverlapLabel = "n/a";
    this.dodgeChanceRollLabel = "n/a";
    this.attackStartedEdgeLabel = "no";
  }

  /** Tracks the current reason, if any, that prediction is being suppressed. */
  private setPredictionGatedReason(reason: string): void {
    this.predictionGatedReason = reason;
  }

  /** Adds one human-readable debug event to the on-screen log. */
  private recordDebugEvent(now: number, label: string): void {
    if (label === this.lastDebugEvent) {
      return;
    }

    this.lastDebugEvent = label;
    const timestampSeconds = (now / 1000).toFixed(2);
    this.debugLogLines = [`t=${timestampSeconds}s ${label}`, ...this.debugLogLines].slice(
      0,
      ShadowboxingGame.MAX_DEBUG_LOG_LINES
    );
  }

  /** Formats one model output into a compact HUD label. */
  private formatThreatLabel(output: ModelOutput | null): string {
    return output ? `${output.state_name} / ${output.attacking_prob.toFixed(2)}` : "n/a";
  }

  /** Builds the debug HUD payload from the latest raw and stabilized state. */
  private buildDebugSnapshot(now: number): HudSnapshot["debug"] {
    return {
      rawThreatLabel: this.formatThreatLabel(this.lastRawOutput),
      rawAttackingProbLabel: this.lastRawOutput?.attacking_prob.toFixed(2) ?? "0.00",
      trajectoryEmitRawProbLabel:
        this.lastTrajectoryEmitRawProb === null ? "n/a" : this.lastTrajectoryEmitRawProb.toFixed(2),
      stableThreatLabel: this.formatThreatLabel(this.stableOutput),
      wristsVisibleLabel: this.wristsVisible ? "yes" : "no",
      leftWristVisibilityLabel: this.leftWristVisibility.toFixed(2),
      rightWristVisibilityLabel: this.rightWristVisibility.toFixed(2),
      predictionGatedLabel: this.predictionGatedReason,
      combatHitboxOverlapLabel: this.combatHitboxOverlapLabel,
      dodgeChanceRollLabel: this.dodgeChanceRollLabel,
      attackStartedEdgeLabel: this.attackStartedEdgeLabel,
      assessmentAgeLabel:
        this.lastThreatAssessmentAt === null ? "n/a" : `${Math.max(now - this.lastThreatAssessmentAt, 0).toFixed(0)} ms`,
      refreshCountLabel: `${this.threatAssessmentRefreshCount}`,
      emitCountLabel: `${this.threatTrajectoryEmitCount}`,
      lastEventLabel: this.lastDebugEvent,
      logLines: [...this.debugLogLines]
    };
  }

  private schedulePoseLoop(): void {
    this.poseLoopTimer = window.setTimeout(async () => {
      await this.runPoseStep();
      this.schedulePoseLoop();
    }, SAMPLE_INTERVAL_MS);
  }

  private scheduleRenderLoop(): void {
    this.renderFrameId = window.requestAnimationFrame((now) => {
      this.scene.render(now);
      this.hud.update(this.latestHudSnapshot);
      this.scheduleRenderLoop();
    });
  }

  private async runPoseStep(): Promise<void> {
    if (this.inferenceBusy) {
      return;
    }

    const now = performance.now();
    const sampled = this.poseTracker.sample();
    const overlayPoints = this.poseTracker.getLastOverlayPoints();
    const leftWristVisibility = overlayPoints[15]?.visibility ?? 0;
    const rightWristVisibility = overlayPoints[16]?.visibility ?? 0;
    const wristsVisible = leftWristVisibility >= 0.5 || rightWristVisibility >= 0.5;
    this.leftWristVisibility = leftWristVisibility;
    this.rightWristVisibility = rightWristVisibility;
    this.wristsVisible = wristsVisible;
    this.poseOverlay.draw(overlayPoints, this.shell.videoPreview.videoWidth, this.shell.videoPreview.videoHeight);
    const bufferSnapshot = this.poseBuffer.push(sampled);

    if (!bufferSnapshot.ready || !bufferSnapshot.basis) {
      this.resetThreatAssessment();
      this.setPredictionGatedReason(bufferSnapshot.tracking ? "buffering-sequence" : "tracking-unready");
      const combatUpdate = this.combat.update({
        now,
        modelMode: this.predictor.mode,
        tracking: bufferSnapshot.tracking,
        output: null,
        worldTraj: null,
        userPose: bufferSnapshot.currentPose
      });
      this.latestHudSnapshot = this.toHudSnapshot(combatUpdate.snapshot, now);
      return;
    }

    if (!wristsVisible) {
      this.resetThreatAssessment();
      this.setPredictionGatedReason("wrists-hidden");
      this.recordDebugEvent(now, "prediction gated -> wrists hidden");
      const combatUpdate = this.combat.update({
        now,
        modelMode: this.predictor.mode,
        tracking: bufferSnapshot.tracking,
        output: null,
        worldTraj: null,
        userPose: bufferSnapshot.currentPose
      });
      this.latestHudSnapshot = this.toHudSnapshot(combatUpdate.snapshot, now);
      return;
    }

    this.inferenceBusy = true;

    try {
      const previousOutput = this.stableOutput;
      const prediction = await this.predictor.predict(bufferSnapshot.features);
      this.setPredictionGatedReason(prediction ? "no" : "predictor-null");
      this.lastThreatAssessmentAt = now;
      this.lastRawOutput = prediction;
      this.stableOutput = prediction;
      this.stableWorldTrajectory =
        prediction && bufferSnapshot.basis ? trajectoryToWorld(prediction.traj, bufferSnapshot.basis) : null;
      this.threatAssessmentRefreshCount += 1;
      this.recordDebugEvent(now, `prediction update -> ${this.formatThreatLabel(prediction)}`);

      const evaluatedOutput = this.stableOutput;
      const evaluatedWorldTraj = this.stableWorldTrajectory;
      const combatUpdate = this.combat.update({
        now,
        modelMode: this.predictor.mode,
        tracking: bufferSnapshot.tracking,
        output: evaluatedOutput,
        worldTraj: evaluatedWorldTraj,
        userPose: bufferSnapshot.currentPose
      });
      this.combatHitboxOverlapLabel = combatUpdate.debug.avatarOverlap ? "avatar=yes" : "avatar=no";
      this.dodgeChanceRollLabel =
        combatUpdate.debug.dodgeChance === null || combatUpdate.debug.dodgeRoll === null
          ? "n/a"
          : `${combatUpdate.debug.dodgeChance.toFixed(2)} / ${combatUpdate.debug.dodgeRoll.toFixed(2)}`;
      this.attackStartedEdgeLabel = combatUpdate.debug.attackStartedEdge ? "yes" : "no";

      if (
        shouldEmitThreatTrajectory(previousOutput, evaluatedOutput) &&
        evaluatedWorldTraj &&
        evaluatedOutput &&
        evaluatedOutput.state_name === "attacking" &&
        evaluatedOutput.attacking_prob >= TRAJECTORY_RENDER_PROBABILITY_THRESHOLD
      ) {
        this.lastTrajectoryEmitRawProb = evaluatedOutput.attacking_prob;
        console.groupCollapsed("[ShadowboxingGame] trajectory emit");
        console.log("rawProb", evaluatedOutput.attacking_prob);
        console.log(
          "worldTrajectory",
          evaluatedWorldTraj.map((wristSteps, wristIndex) => ({
            wrist: wristIndex === 0 ? "left" : "right",
            steps: wristSteps.map((point, stepIndex) => ({
              step: stepIndex + 1,
              x: Number(point.x.toFixed(3)),
              y: Number(point.y.toFixed(3)),
              z: Number(point.z.toFixed(3))
            }))
          }))
        );
        console.groupEnd();
        this.scene.setThreatTrajectory(evaluatedWorldTraj, now);
        this.threatTrajectoryEmitCount += 1;
        this.recordDebugEvent(now, `trajectory emit -> ${this.formatThreatLabel(evaluatedOutput)}`);
      }
      if (combatUpdate.debug.attackStartedEdge) {
        console.groupCollapsed("[CombatDebug] attack edge");
        console.log("rawProb", evaluatedOutput?.attacking_prob ?? null);
        console.log("attackStartedEdge", combatUpdate.debug.attackStartedEdge);
        console.log("avatarOverlap", combatUpdate.debug.avatarOverlap);
        console.log(
          "dodgeChanceRoll",
          combatUpdate.debug.dodgeChance === null || combatUpdate.debug.dodgeRoll === null
            ? null
            : {
                chance: Number(combatUpdate.debug.dodgeChance.toFixed(4)),
                roll: Number(combatUpdate.debug.dodgeRoll.toFixed(4))
              }
        );
        console.log("aiHitCooldown", "disabled");
        console.groupEnd();
      }
      if (combatUpdate.triggerDodge) {
        this.scene.triggerDodge(combatUpdate.triggerDodge, now);
        this.recordDebugEvent(now, `AI dodge -> ${combatUpdate.triggerDodge}`);
      }
      if (combatUpdate.triggerCounter) {
        this.scene.triggerCounter(
          combatUpdate.triggerCounter.move,
          combatUpdate.triggerCounter.result,
          now,
          combatUpdate.triggerCounter.target
        );
        this.recordDebugEvent(now, `AI counter -> ${combatUpdate.triggerCounter.move}`);
      }
      if (combatUpdate.snapshot.aiHp <= 0 && this.latestHudSnapshot.aiHp > 0) {
        this.scene.triggerVictory(now);
        this.recordDebugEvent(now, "Victory -> AI down");
      }

      this.latestHudSnapshot = this.toHudSnapshot(combatUpdate.snapshot, now);
    } finally {
      this.inferenceBusy = false;
    }
  }

  private toHudSnapshot(
    snapshot: Omit<HudSnapshot, "trackingLabel" | "stateLabel" | "attackingProbLabel" | "debug">,
    now: number
  ): HudSnapshot {
    return {
      ...snapshot,
      trackingLabel: snapshot.tracking ? "Locked" : "Searching",
      stateLabel: snapshot.activeThreat.stateName,
      attackingProbLabel: snapshot.activeThreat.attackingProb.toFixed(2),
      debug: this.buildDebugSnapshot(now)
    };
  }
}
