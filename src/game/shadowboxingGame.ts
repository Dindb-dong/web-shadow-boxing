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
import {
  bootstrapPlayer,
  fetchLeaderboard,
  readStoredPlayerId,
  recordMatch,
  renamePlayerId,
  storePlayerId,
  type MatchResult,
  type PlayerSummary
} from "../services/playerStatsApi";
import type { DifficultyLevel, HudSnapshot, ModelOutput, WristPairTrajectory } from "../types/game";
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
  private cameraSwitchInProgress = false;
  private endgameState: "none" | "victory" | "defeat" = "none";
  private selectedDifficulty: DifficultyLevel = "intermediate";
  private pendingDifficultyResolver: ((level: DifficultyLevel) => void) | null = null;
  private pendingGuideResolver: (() => void) | null = null;
  private roundLive = false;
  private roundStartSequence = 0;
  private playerId = "guest";
  private apiOnline = true;
  private hasCombatResultHistory = false;
  private latestHudSnapshot: HudSnapshot = {
    aiHp: 100,
    playerHp: 100,
    aiStamina: 100,
    successfulHits: 0,
    guardedCounters: 0,
    counterDefenseStats: {
      tightGuard: 0,
      duck: 0,
      weave: 0,
      sway: 0
    },
    tracking: false,
    modelMode: "real",
    activeThreat: {
      stateName: "idle",
      attackingProb: 0,
      active: false,
      expiresAt: null
    },
    lastGuardResult: "none",
    lastCounterDefense: "none",
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
    this.shell.cameraSelect.addEventListener("change", this.handleCameraSelectChange);
    this.shell.endgameRestartButton.addEventListener("click", this.handleRestartClick);
    this.shell.guideConfirmButton.addEventListener("click", this.handleGuideConfirmClick);
    this.shell.difficultyBeginnerButton.addEventListener("click", this.handleBeginnerDifficultyClick);
    this.shell.difficultyIntermediateButton.addEventListener("click", this.handleIntermediateDifficultyClick);
    this.shell.difficultyExpertButton.addEventListener("click", this.handleExpertDifficultyClick);
    this.shell.leaderboardOpenButton.addEventListener("click", this.handleLeaderboardOpenClick);
    this.shell.leaderboardCloseButton.addEventListener("click", this.handleLeaderboardCloseClick);
    this.shell.connectIdButton.addEventListener("click", this.handleConnectIdClick);
    this.shell.renameIdButton.addEventListener("click", this.handleRenameIdClick);
    this.shell.leaderboardRefreshButton.addEventListener("click", this.handleLeaderboardRefreshClick);
    window.addEventListener("resize", this.handleResize);
  }

  /** Starts webcam permissions, pose detection, and both runtime loops. */
  async start(): Promise<void> {
    this.hideEndgameOverlay();
    this.hideGuideOverlay();
    this.hideDifficultyOverlay();
    this.hideRoundStartOverlay();
    this.hideLeaderboardOverlay();
    this.resetThreatAssessment();
    this.lastTrajectoryEmitRawProb = null;
    this.roundLive = false;
    const resetSnapshot = this.combat.reset(this.predictor.mode, false);
    this.latestHudSnapshot = this.toHudSnapshot(resetSnapshot);
    this.hud.update(this.latestHudSnapshot);

    try {
      await this.scene.initialize();
      await this.poseTracker.initialize(this.shell.videoPreview);
      await this.predictor.initialize();
      await this.refreshCameraSelect();
      await this.initializePlayerProfile();
      await this.startNewRoundWithDifficulty("start");
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
    this.shell.cameraSelect.removeEventListener("change", this.handleCameraSelectChange);
    this.shell.endgameRestartButton.removeEventListener("click", this.handleRestartClick);
    this.shell.guideConfirmButton.removeEventListener("click", this.handleGuideConfirmClick);
    this.shell.difficultyBeginnerButton.removeEventListener("click", this.handleBeginnerDifficultyClick);
    this.shell.difficultyIntermediateButton.removeEventListener("click", this.handleIntermediateDifficultyClick);
    this.shell.difficultyExpertButton.removeEventListener("click", this.handleExpertDifficultyClick);
    this.shell.leaderboardOpenButton.removeEventListener("click", this.handleLeaderboardOpenClick);
    this.shell.leaderboardCloseButton.removeEventListener("click", this.handleLeaderboardCloseClick);
    this.shell.connectIdButton.removeEventListener("click", this.handleConnectIdClick);
    this.shell.renameIdButton.removeEventListener("click", this.handleRenameIdClick);
    this.shell.leaderboardRefreshButton.removeEventListener("click", this.handleLeaderboardRefreshClick);
    window.removeEventListener("resize", this.handleResize);
  }

  private readonly handleResize = (): void => {
    this.scene.resize();
    this.poseOverlay.resize();
  };

  private readonly handleRestartClick = async (): Promise<void> => {
    const now = performance.now();
    await this.startNewRoundWithDifficulty("restart");
    this.recordDebugEvent(now, `New game started (${this.selectedDifficulty})`);
  };

  private readonly handleGuideConfirmClick = (): void => {
    if (!this.pendingGuideResolver) {
      return;
    }
    const resolve = this.pendingGuideResolver;
    this.pendingGuideResolver = null;
    this.hideGuideOverlay();
    resolve();
  };

  private readonly handleLeaderboardOpenClick = async (): Promise<void> => {
    this.showLeaderboardOverlay();
    await this.refreshLeaderboard();
  };

  private readonly handleLeaderboardCloseClick = (): void => {
    this.hideLeaderboardOverlay();
  };

  private readonly handleConnectIdClick = async (): Promise<void> => {
    const requested = this.shell.connectIdInput.value.trim();
    if (!requested) {
      return;
    }
    await this.bootstrapWithId(requested);
    this.shell.connectIdInput.value = "";
  };

  private readonly handleRenameIdClick = async (): Promise<void> => {
    const nextId = this.shell.renameIdInput.value.trim();
    if (!nextId || !this.apiOnline) {
      return;
    }
    try {
      const player = await renamePlayerId(this.playerId, nextId);
      this.applyPlayerSummary(player);
      this.latestHudSnapshot.statusText = `Player ID changed to ${player.playerId}`;
      this.hud.update(this.latestHudSnapshot);
      await this.refreshLeaderboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "ID 변경 실패";
      this.latestHudSnapshot.statusText = message;
      this.hud.update(this.latestHudSnapshot);
    } finally {
      this.shell.renameIdInput.value = "";
    }
  };

  private readonly handleLeaderboardRefreshClick = async (): Promise<void> => {
    await this.refreshLeaderboard();
  };

  private readonly handleBeginnerDifficultyClick = (): void => {
    this.resolveDifficultySelection("beginner");
  };

  private readonly handleIntermediateDifficultyClick = (): void => {
    this.resolveDifficultySelection("intermediate");
  };

  private readonly handleExpertDifficultyClick = (): void => {
    this.resolveDifficultySelection("expert");
  };

  private resolveDifficultySelection(level: DifficultyLevel): void {
    if (!this.pendingDifficultyResolver) {
      return;
    }

    const resolve = this.pendingDifficultyResolver;
    this.pendingDifficultyResolver = null;
    this.hideDifficultyOverlay();
    resolve(level);
  }

  private hideDifficultyOverlay(): void {
    this.shell.difficultyOverlay.hidden = true;
  }

  private showGuideOverlay(): void {
    this.shell.guideOverlay.hidden = false;
  }

  private hideGuideOverlay(): void {
    this.shell.guideOverlay.hidden = true;
  }

  private hideRoundStartOverlay(): void {
    this.shell.roundStartOverlay.hidden = true;
    this.shell.roundStartText.classList.remove("is-countdown", "is-fight", "is-animating");
  }

  private showLeaderboardOverlay(): void {
    this.shell.leaderboardOverlay.hidden = false;
  }

  private hideLeaderboardOverlay(): void {
    this.shell.leaderboardOverlay.hidden = true;
  }

  private applyPlayerSummary(player: PlayerSummary): void {
    this.playerId = player.playerId;
    this.hasCombatResultHistory =
      player.totalMatches > 0 || player.wins > 0 || player.losses > 0 || this.hasCombatResultHistory;
    this.shell.playerIdValue.textContent = this.playerId;
    storePlayerId(this.playerId);
  }

  private async bootstrapWithId(requestedPlayerId: string | null): Promise<void> {
    try {
      const player = await bootstrapPlayer(requestedPlayerId);
      this.apiOnline = true;
      this.applyPlayerSummary(player);
      this.latestHudSnapshot.statusText = `Player connected: ${player.playerId}`;
      this.hud.update(this.latestHudSnapshot);
      await this.refreshLeaderboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Player bootstrap failed";
      this.apiOnline = false;
      if (!this.playerId || this.playerId === "guest") {
        const fallback = readStoredPlayerId() ?? `guest-${Math.random().toString(36).slice(2, 8)}`;
        this.playerId = fallback;
      }
      this.shell.playerIdValue.textContent = `${this.playerId} (offline)`;
      this.shell.leaderboardList.textContent = "Leaderboard unavailable (Mongo API offline)";
      this.latestHudSnapshot.statusText = message;
      this.hud.update(this.latestHudSnapshot);
    }
  }

  private renderLeaderboardBlock(title: string, entries: Awaited<ReturnType<typeof fetchLeaderboard>>): string {
    const lines = [title];
    if (!entries.length) {
      lines.push("No matches yet");
      return lines.join("\n");
    }
    for (const entry of entries) {
      const winRatePct = (entry.winRate * 100).toFixed(1);
      const ratio = entry.hitGuardRatio.toFixed(2);
      lines.push(
        `${entry.rank}. ${entry.playerId} | WR ${winRatePct}% | M${entry.matches} | W${entry.wins}/L${entry.losses} | H/G ${ratio}`
      );
    }
    return lines.join("\n");
  }

  private async refreshLeaderboard(): Promise<void> {
    if (!this.apiOnline) {
      this.shell.leaderboardList.textContent = "Leaderboard unavailable (Mongo API offline)";
      return;
    }
    this.shell.leaderboardList.textContent = "Loading leaderboard...";
    try {
      const [overall, byDifficulty] = await Promise.all([
        fetchLeaderboard("all", 8),
        fetchLeaderboard(this.selectedDifficulty, 8)
      ]);
      this.shell.leaderboardList.textContent = [
        this.renderLeaderboardBlock("Overall Top", overall),
        "",
        this.renderLeaderboardBlock(`${this.selectedDifficulty.toUpperCase()} Top`, byDifficulty)
      ].join("\n");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Leaderboard fetch failed";
      this.shell.leaderboardList.textContent = `Leaderboard error: ${message}`;
    }
  }

  private async initializePlayerProfile(): Promise<void> {
    const storedPlayerId = readStoredPlayerId();
    await this.bootstrapWithId(storedPlayerId);
  }

  private async persistMatchResult(
    result: MatchResult,
    snapshot: ReturnType<CombatSystem["update"]>["snapshot"]
  ): Promise<void> {
    if (!this.apiOnline) {
      return;
    }
    try {
      await recordMatch({
        playerId: this.playerId,
        difficulty: this.selectedDifficulty,
        result,
        successfulHits: snapshot.successfulHits,
        guardedCounters: snapshot.guardedCounters
      });
      await this.refreshLeaderboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Match record failed";
      this.recordDebugEvent(performance.now(), `record failed: ${message}`);
    }
  }

  private shouldShowGuideModal(): boolean {
    return !this.hasCombatResultHistory;
  }

  private promptGuideModal(): Promise<void> {
    if (this.pendingGuideResolver) {
      this.pendingGuideResolver();
      this.pendingGuideResolver = null;
    }

    this.showGuideOverlay();
    return new Promise((resolve) => {
      this.pendingGuideResolver = resolve;
    });
  }

  private promptDifficultySelection(reason: "start" | "restart"): Promise<DifficultyLevel> {
    if (this.pendingDifficultyResolver) {
      this.pendingDifficultyResolver(this.selectedDifficulty);
      this.pendingDifficultyResolver = null;
    }

    this.shell.difficultyTitle.textContent =
      reason === "start" ? "Choose Your First Round Difficulty" : "Choose Difficulty For New Game";
    this.shell.difficultyDescription.textContent =
      reason === "start"
        ? "Select the sparring level before the opening bell."
        : "Select a difficulty before starting the next round.";
    this.shell.difficultyOverlay.hidden = false;

    return new Promise((resolve) => {
      this.pendingDifficultyResolver = resolve;
    });
  }

  private applyRoundReset(difficulty: DifficultyLevel): void {
    this.roundLive = false;
    this.selectedDifficulty = difficulty;
    this.combat.setDifficulty(difficulty);
    this.scene.resetCombatScene();
    this.poseBuffer.reset();
    this.resetThreatAssessment();
    this.lastTrajectoryEmitRawProb = null;
    this.hideEndgameOverlay();
    this.hideGuideOverlay();
    this.hideRoundStartOverlay();
    const resetSnapshot = this.combat.reset(this.predictor.mode, false);
    this.latestHudSnapshot = this.toHudSnapshot(resetSnapshot);
    this.latestHudSnapshot.statusText = `${difficulty.toUpperCase()} mode selected. Get ready...`;
    this.hud.update(this.latestHudSnapshot);
  }

  private waitForAnimationOrTimeout(element: HTMLElement, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const onAnimationEnd = (): void => {
        finish();
      };
      const finish = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        element.removeEventListener("animationend", onAnimationEnd);
        window.clearTimeout(timeout);
        resolve();
      };
      const timeout = window.setTimeout(finish, timeoutMs);
      element.addEventListener("animationend", onAnimationEnd);
    });
  }

  private async playRoundStartCountdown(sequenceId: number): Promise<void> {
    if (sequenceId !== this.roundStartSequence) {
      return;
    }

    this.shell.roundStartOverlay.hidden = false;
    const cueDurations = [1280, 1280, 1280];
    const cues = ["3", "2", "1"];

    for (let index = 0; index < cues.length; index += 1) {
      if (sequenceId !== this.roundStartSequence) {
        this.hideRoundStartOverlay();
        return;
      }
      this.shell.roundStartText.textContent = cues[index];
      this.shell.roundStartText.classList.remove("is-countdown", "is-fight", "is-animating");
      void this.shell.roundStartText.offsetWidth;
      this.shell.roundStartText.classList.add("is-countdown", "is-animating");
      await this.waitForAnimationOrTimeout(this.shell.roundStartText, cueDurations[index]);
    }

    if (sequenceId !== this.roundStartSequence) {
      this.hideRoundStartOverlay();
      return;
    }

    this.shell.roundStartText.textContent = "Fight!!";
    this.shell.roundStartText.classList.remove("is-countdown", "is-fight", "is-animating");
    void this.shell.roundStartText.offsetWidth;
    this.shell.roundStartText.classList.add("is-fight", "is-animating");
    await this.waitForAnimationOrTimeout(this.shell.roundStartText, 1300);
    this.hideRoundStartOverlay();
  }

  private async startNewRoundWithDifficulty(reason: "start" | "restart"): Promise<void> {
    this.roundLive = false;
    this.roundStartSequence += 1;
    const sequenceId = this.roundStartSequence;
    this.hideRoundStartOverlay();
    this.hideEndgameOverlay();
    this.hideGuideOverlay();
    if (this.shouldShowGuideModal()) {
      this.latestHudSnapshot.statusText = "가이드를 확인해주세요";
      this.hud.update(this.latestHudSnapshot);
      await this.promptGuideModal();
      if (sequenceId !== this.roundStartSequence) {
        return;
      }
    }
    this.latestHudSnapshot.statusText = "Select difficulty to start the round";
    this.hud.update(this.latestHudSnapshot);
    const difficulty = await this.promptDifficultySelection(reason);
    if (sequenceId !== this.roundStartSequence) {
      return;
    }
    this.applyRoundReset(difficulty);
    await this.playRoundStartCountdown(sequenceId);
    if (sequenceId !== this.roundStartSequence) {
      return;
    }
    this.roundLive = true;
    this.latestHudSnapshot.statusText = "Fight!!";
    this.hud.update(this.latestHudSnapshot);
  }

  private readonly handleCameraSelectChange = async (): Promise<void> => {
    const nextDeviceId = this.shell.cameraSelect.value;
    if (this.cameraSwitchInProgress) {
      return;
    }

    this.cameraSwitchInProgress = true;
    this.shell.cameraSelect.disabled = true;
    try {
      this.latestHudSnapshot.statusText = "Switching camera...";
      this.hud.update(this.latestHudSnapshot);
      await this.poseTracker.setVideoDevice(nextDeviceId || undefined);
      await this.refreshCameraSelect();
      this.latestHudSnapshot.statusText = "Camera switched.";
      this.hud.update(this.latestHudSnapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to switch camera";
      this.latestHudSnapshot.statusText = message;
      this.hud.update(this.latestHudSnapshot);
      await this.refreshCameraSelect();
    } finally {
      this.cameraSwitchInProgress = false;
      this.shell.cameraSelect.disabled = false;
    }
  };

  private async refreshCameraSelect(): Promise<void> {
    const devices = await this.poseTracker.getVideoInputDevices();
    const activeDeviceId = this.poseTracker.getCurrentVideoDeviceId();
    this.shell.cameraSelect.innerHTML = "";

    if (!devices.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No camera inputs detected";
      this.shell.cameraSelect.append(option);
      this.shell.cameraSelect.disabled = true;
      return;
    }

    const fallbackOption = document.createElement("option");
    fallbackOption.value = "";
    fallbackOption.textContent = "Default camera";
    this.shell.cameraSelect.append(fallbackOption);

    for (const device of devices) {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Camera ${this.shell.cameraSelect.options.length}`;
      this.shell.cameraSelect.append(option);
    }

    if (activeDeviceId) {
      this.shell.cameraSelect.value = activeDeviceId;
    } else {
      this.shell.cameraSelect.value = "";
    }
    this.shell.cameraSelect.disabled = false;
  }

  /** Clears the stable threat assessment when tracking becomes unusable. */
  private resetThreatAssessment(): void {
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

  /** Shows the final result card once combat reaches victory/defeat. */
  private showEndgameOverlay(result: "victory" | "defeat"): void {
    this.endgameState = result;
    this.shell.endgameOverlay.hidden = false;
    if (result === "victory") {
      this.shell.endgameTitle.textContent = "Victory";
      this.shell.endgameSubtitle.textContent = "AI is down. Start a fresh sparring round.";
      this.shell.endgameOverlay.dataset.result = "victory";
      return;
    }

    this.shell.endgameTitle.textContent = "Defeat";
    this.shell.endgameSubtitle.textContent = "You are down. Reset and challenge the AI again.";
    this.shell.endgameOverlay.dataset.result = "defeat";
  }

  /** Hides the final result card while combat is still active. */
  private hideEndgameOverlay(): void {
    this.endgameState = "none";
    this.shell.endgameOverlay.hidden = true;
    delete this.shell.endgameOverlay.dataset.result;
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
  private buildDebugSnapshot(): HudSnapshot["debug"] {
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

    if (!this.roundLive) {
      this.resetThreatAssessment();
      this.setPredictionGatedReason("round-start-lock");
      this.latestHudSnapshot.tracking = bufferSnapshot.tracking;
      this.latestHudSnapshot.trackingLabel = bufferSnapshot.tracking ? "Locked" : "Searching";
      this.latestHudSnapshot.debug = this.buildDebugSnapshot();
      return;
    }

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
      this.applyCombatUpdate(combatUpdate, now);
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
      this.applyCombatUpdate(combatUpdate, now);
      return;
    }

    this.inferenceBusy = true;

    try {
      const previousOutput = this.stableOutput;
      const prediction = await this.predictor.predict(bufferSnapshot.features);
      this.setPredictionGatedReason(prediction ? "no" : "predictor-null");
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
      this.applyCombatUpdate(combatUpdate, now);
    } finally {
      this.inferenceBusy = false;
    }
  }

  /** Applies combat side effects and HUD refresh for every pose loop path, including prediction-gated frames. */
  private applyCombatUpdate(
    combatUpdate: ReturnType<CombatSystem["update"]>,
    now: number
  ): void {
    this.combatHitboxOverlapLabel = combatUpdate.debug.avatarOverlap ? "avatar=yes" : "avatar=no";
    this.dodgeChanceRollLabel =
      combatUpdate.debug.dodgeChance === null || combatUpdate.debug.dodgeRoll === null
        ? "n/a"
        : `${combatUpdate.debug.dodgeChance.toFixed(2)} / ${combatUpdate.debug.dodgeRoll.toFixed(2)}`;
    this.attackStartedEdgeLabel = combatUpdate.debug.attackStartedEdge ? "yes" : "no";

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
    const aiJustDown = combatUpdate.snapshot.aiHp <= 0 && this.latestHudSnapshot.aiHp > 0;
    const playerJustDown = combatUpdate.snapshot.playerHp <= 0 && this.latestHudSnapshot.playerHp > 0;

    if (aiJustDown) {
      if (this.endgameState !== "victory") {
        this.hasCombatResultHistory = true;
        this.scene.triggerVictory(now);
        this.recordDebugEvent(now, "Victory -> AI down");
        this.showEndgameOverlay("victory");
        void this.persistMatchResult("win", combatUpdate.snapshot);
      }
    } else if (playerJustDown) {
      if (this.endgameState !== "defeat") {
        this.hasCombatResultHistory = true;
        this.scene.triggerDefeat(now);
        this.recordDebugEvent(now, "Defeat -> Player down");
        this.showEndgameOverlay("defeat");
        void this.persistMatchResult("loss", combatUpdate.snapshot);
      }
    } else if (combatUpdate.snapshot.aiHp > 0 && combatUpdate.snapshot.playerHp > 0 && this.endgameState !== "none") {
      this.hideEndgameOverlay();
    }

    this.latestHudSnapshot = this.toHudSnapshot(combatUpdate.snapshot);
  }

  private toHudSnapshot(
    snapshot: Omit<HudSnapshot, "trackingLabel" | "stateLabel" | "attackingProbLabel" | "debug">
  ): HudSnapshot {
    return {
      ...snapshot,
      trackingLabel: snapshot.tracking ? "Locked" : "Searching",
      stateLabel: snapshot.activeThreat.stateName,
      attackingProbLabel: snapshot.activeThreat.attackingProb.toFixed(2),
      debug: this.buildDebugSnapshot()
    };
  }
}
