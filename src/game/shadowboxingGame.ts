import { SAMPLE_INTERVAL_MS } from "./constants";
import { CombatSystem } from "./combatSystem";
import { trajectoryToWorld } from "./worldMapping";
import { adaptModelOutput } from "../model/modelAdapter";
import { MockPredictor, type TrajectoryPredictor } from "../model/mockPredictor";
import { PoseSequenceBuffer } from "../pose/featureEngineering";
import { PoseTracker } from "../pose/poseTracker";
import { SceneManager } from "../render/sceneManager";
import type { HudSnapshot } from "../types/game";
import { HudController } from "../ui/hud";
import { PoseOverlayRenderer } from "../ui/poseOverlay";
import { createAppShell } from "../ui/shell";

/** Orchestrates webcam tracking, model inference, combat state, and rendering. */
export class ShadowboxingGame {
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
  private latestHudSnapshot: HudSnapshot = {
    aiHp: 100,
    playerHp: 100,
    aiStamina: 100,
    tracking: false,
    modelMode: "mock",
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
    attackingProbLabel: "0.00"
  };

  constructor(root: HTMLElement, predictor: TrajectoryPredictor = new MockPredictor()) {
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
    const sampled = this.poseTracker.sample(now);
    this.poseOverlay.draw(
      this.poseTracker.getLastOverlayPoints(),
      this.shell.videoPreview.videoWidth,
      this.shell.videoPreview.videoHeight
    );
    const bufferSnapshot = this.poseBuffer.push(sampled);

    if (!bufferSnapshot.ready || !bufferSnapshot.basis) {
      const combatUpdate = this.combat.update({
        now,
        modelMode: this.predictor.mode,
        tracking: bufferSnapshot.tracking,
        output: null,
        worldTraj: null,
        userPose: bufferSnapshot.currentPose
      });
      this.latestHudSnapshot = this.toHudSnapshot(combatUpdate.snapshot);
      return;
    }

    this.inferenceBusy = true;

    try {
      const rawPrediction = await this.predictor.predict(bufferSnapshot.features);
      const adapted = adaptModelOutput(rawPrediction);
      const worldTraj = adapted ? trajectoryToWorld(adapted.traj, bufferSnapshot.basis) : null;
      const combatUpdate = this.combat.update({
        now,
        modelMode: this.predictor.mode,
        tracking: bufferSnapshot.tracking,
        output: adapted,
        worldTraj,
        userPose: bufferSnapshot.currentPose
      });

      if (worldTraj) {
        this.scene.setThreatTrajectory(worldTraj, now);
      }
      if (combatUpdate.triggerDodge) {
        this.scene.triggerDodge(combatUpdate.triggerDodge, now);
      }
      if (combatUpdate.triggerCounter) {
        this.scene.triggerCounter(combatUpdate.triggerCounter.move, combatUpdate.triggerCounter.result, now);
      }

      this.latestHudSnapshot = this.toHudSnapshot(combatUpdate.snapshot);
    } finally {
      this.inferenceBusy = false;
    }
  }

  private toHudSnapshot(snapshot: Omit<HudSnapshot, "trackingLabel" | "stateLabel" | "attackingProbLabel">): HudSnapshot {
    return {
      ...snapshot,
      trackingLabel: snapshot.tracking ? "Locked" : "Searching",
      stateLabel: snapshot.activeThreat.stateName,
      attackingProbLabel: snapshot.activeThreat.attackingProb.toFixed(2)
    };
  }
}
