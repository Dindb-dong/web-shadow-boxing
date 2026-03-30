import type { HudSnapshot } from "../types/game";
import { clamp } from "../utils/vector";

/** Updates the overlay HUD using the latest combat snapshot. */
export class HudController {
  constructor(
    private readonly refs: {
      trackingValue: HTMLSpanElement;
      stateValue: HTMLSpanElement;
      probabilityValue: HTMLSpanElement;
      modelValue: HTMLSpanElement;
      statusValue: HTMLParagraphElement;
      playerHpBar: HTMLDivElement;
      aiStaminaBar: HTMLDivElement;
      guardValue: HTMLSpanElement;
    }
  ) {}

  /** Pushes fresh text and bar values into the DOM. */
  update(snapshot: HudSnapshot): void {
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
  }
}
