import type { HudSnapshot } from "../types/game";
import { clamp } from "../utils/vector";

/** Updates the overlay HUD using the latest combat snapshot. */
export class HudController {
  constructor(
    private readonly refs: {
      aiHpBar: HTMLDivElement;
      aiHpValue: HTMLSpanElement;
      successfulHitsValue: HTMLSpanElement;
      guardedCountersValue: HTMLSpanElement;
      tightGuardDefenseValue: HTMLSpanElement;
      duckDefenseValue: HTMLSpanElement;
      weaveDefenseValue: HTMLSpanElement;
      swayDefenseValue: HTMLSpanElement;
      trackingValue: HTMLSpanElement;
      stateValue: HTMLSpanElement;
      probabilityValue: HTMLSpanElement;
      modelValue: HTMLSpanElement;
      statusValue: HTMLParagraphElement;
      playerHpBar: HTMLDivElement;
      aiStaminaBar: HTMLDivElement;
      guardValue: HTMLSpanElement;
      debugRawThreatValue: HTMLSpanElement;
      debugRawAttackingProbValue: HTMLSpanElement;
      debugTrajectoryEmitRawProbValue: HTMLSpanElement;
      debugStableThreatValue: HTMLSpanElement;
      debugWristsVisibleValue: HTMLSpanElement;
      debugLeftWristVisibilityValue: HTMLSpanElement;
      debugRightWristVisibilityValue: HTMLSpanElement;
      debugPredictionGatedValue: HTMLSpanElement;
      debugCombatHitboxOverlapValue: HTMLSpanElement;
      debugDodgeChanceRollValue: HTMLSpanElement;
      debugAttackStartedEdgeValue: HTMLSpanElement;
      debugAssessmentAgeValue: HTMLSpanElement;
      debugRefreshCountValue: HTMLSpanElement;
      debugEmitCountValue: HTMLSpanElement;
      debugLastEventValue: HTMLParagraphElement;
      debugLogValue: HTMLPreElement;
    }
  ) {}

  /** Pushes fresh text and bar values into the DOM. */
  update(snapshot: HudSnapshot): void {
    this.refs.aiHpBar.style.width = `${clamp(snapshot.aiHp, 0, 100)}%`;
    this.refs.aiHpValue.textContent = `${Math.round(clamp(snapshot.aiHp, 0, 100))}%`;
    this.refs.successfulHitsValue.textContent = `${snapshot.successfulHits}`;
    this.refs.guardedCountersValue.textContent = `${snapshot.guardedCounters}`;
    this.refs.tightGuardDefenseValue.textContent = `${snapshot.counterDefenseStats.tightGuard}`;
    this.refs.duckDefenseValue.textContent = `${snapshot.counterDefenseStats.duck}`;
    this.refs.weaveDefenseValue.textContent = `${snapshot.counterDefenseStats.weave}`;
    this.refs.swayDefenseValue.textContent = `${snapshot.counterDefenseStats.sway}`;
    this.refs.trackingValue.textContent = snapshot.trackingLabel;
    this.refs.stateValue.textContent = snapshot.stateLabel;
    this.refs.probabilityValue.textContent = snapshot.attackingProbLabel;
    this.refs.modelValue.textContent = snapshot.modelMode;
    this.refs.statusValue.textContent = snapshot.counterMove
      ? `${snapshot.statusText} • ${snapshot.counterMove.replace("_", " ")}`
      : snapshot.statusText;
    this.refs.guardValue.textContent = snapshot.lastGuardResult;
    this.refs.playerHpBar.style.width = `${clamp(snapshot.playerHp, 0, 100)}%`;
    this.refs.aiStaminaBar.style.width = `${clamp(snapshot.aiStamina, 0, 100)}%`;
    this.refs.debugRawThreatValue.textContent = snapshot.debug.rawThreatLabel;
    this.refs.debugRawAttackingProbValue.textContent = snapshot.debug.rawAttackingProbLabel;
    this.refs.debugTrajectoryEmitRawProbValue.textContent = snapshot.debug.trajectoryEmitRawProbLabel;
    this.refs.debugStableThreatValue.textContent = snapshot.debug.stableThreatLabel;
    this.refs.debugWristsVisibleValue.textContent = snapshot.debug.wristsVisibleLabel;
    this.refs.debugLeftWristVisibilityValue.textContent = snapshot.debug.leftWristVisibilityLabel;
    this.refs.debugRightWristVisibilityValue.textContent = snapshot.debug.rightWristVisibilityLabel;
    this.refs.debugPredictionGatedValue.textContent = snapshot.debug.predictionGatedLabel;
    this.refs.debugCombatHitboxOverlapValue.textContent = snapshot.debug.combatHitboxOverlapLabel;
    this.refs.debugDodgeChanceRollValue.textContent = snapshot.debug.dodgeChanceRollLabel;
    this.refs.debugAttackStartedEdgeValue.textContent = snapshot.debug.attackStartedEdgeLabel;
    this.refs.debugAssessmentAgeValue.textContent = snapshot.debug.assessmentAgeLabel;
    this.refs.debugRefreshCountValue.textContent = snapshot.debug.refreshCountLabel;
    this.refs.debugEmitCountValue.textContent = snapshot.debug.emitCountLabel;
    this.refs.debugLastEventValue.textContent = snapshot.debug.lastEventLabel;
    this.refs.debugLogValue.textContent = snapshot.debug.logLines.join("\n");
  }
}
