import { GAME_VERSION } from "../version";

/** Creates the core DOM skeleton used by the app. */
export function createAppShell(container: HTMLElement): {
  sceneHost: HTMLDivElement;
  videoPreview: HTMLVideoElement;
  videoOverlay: HTMLCanvasElement;
  aiHpBar: HTMLDivElement;
  aiHpValue: HTMLSpanElement;
  successfulHitsValue: HTMLSpanElement;
  guardedCountersValue: HTMLSpanElement;
  trackingValue: HTMLSpanElement;
  stateValue: HTMLSpanElement;
  probabilityValue: HTMLSpanElement;
  modelValue: HTMLSpanElement;
  statusValue: HTMLParagraphElement;
  playerHpBar: HTMLDivElement;
  aiStaminaBar: HTMLDivElement;
  guardValue: HTMLSpanElement;
} {
  container.innerHTML = `
    <div class="game-shell">
      <div class="scene-host"></div>
      <div class="hud-overlay">
        <div class="hud-panel game-version-badge">v${GAME_VERSION}</div>
        <div class="hud-panel combat-stats-panel">
          <p class="eyebrow">Combat Stats</p>
          <div class="metric-row"><span>Successful Hits</span><strong data-role="successful-hits">0</strong></div>
          <div class="metric-row"><span>Defended Counters</span><strong data-role="guarded-counters">0</strong></div>
        </div>
        <div class="hud-panel ai-health-panel">
          <div class="ai-health-header">
            <span class="eyebrow">Opponent Vital</span>
            <strong data-role="ai-hp-value">100%</strong>
          </div>
          <div class="bar-track ai-health-track"><div class="bar-fill ai-hp-fill" data-role="ai-hp"></div></div>
        </div>
        <div class="hud-panel hero-panel">
          <p class="eyebrow">Shadowboxing Partner</p>
          <h1>Live Sparring Arena</h1>
          <p class="status-line" data-role="status">Camera warmup in progress</p>
        </div>
        <div class="hud-grid">
          <div class="hud-panel video-panel">
            <div class="video-header">
              <div class="video-label">Player Pose Feed</div>
              <div class="video-hint">MediaPipe overlay active</div>
            </div>
            <div class="camera-stack">
              <video class="camera-preview" autoplay muted playsinline></video>
              <canvas class="camera-overlay"></canvas>
            </div>
          </div>
          <div class="hud-panel metrics-panel">
            <div class="metric-row"><span>Tracking</span><strong data-role="tracking">Booting</strong></div>
            <div class="metric-row"><span>State</span><strong data-role="state">idle</strong></div>
            <div class="metric-row"><span>Attacking Prob</span><strong data-role="probability">0.00</strong></div>
            <div class="metric-row"><span>Model</span><strong data-role="model">mock</strong></div>
            <div class="metric-row"><span>Guard</span><strong data-role="guard">none</strong></div>
          </div>
          <div class="hud-panel bars-panel">
            <label>Player HP</label>
            <div class="bar-track"><div class="bar-fill hp-fill" data-role="player-hp"></div></div>
            <label>AI Stamina</label>
            <div class="bar-track"><div class="bar-fill stamina-fill" data-role="ai-stamina"></div></div>
            <p class="combat-tip">Raise your hands or sway back to defend the AI counter.</p>
          </div>
        </div>
      </div>
    </div>
  `;

  const sceneHost = container.querySelector<HTMLDivElement>(".scene-host");
  const videoPreview = container.querySelector<HTMLVideoElement>(".camera-preview");
  const videoOverlay = container.querySelector<HTMLCanvasElement>(".camera-overlay");
  const aiHpBar = container.querySelector<HTMLDivElement>("[data-role='ai-hp']");
  const aiHpValue = container.querySelector<HTMLSpanElement>("[data-role='ai-hp-value']");
  const successfulHitsValue = container.querySelector<HTMLSpanElement>("[data-role='successful-hits']");
  const guardedCountersValue = container.querySelector<HTMLSpanElement>("[data-role='guarded-counters']");
  const trackingValue = container.querySelector<HTMLSpanElement>("[data-role='tracking']");
  const stateValue = container.querySelector<HTMLSpanElement>("[data-role='state']");
  const probabilityValue = container.querySelector<HTMLSpanElement>("[data-role='probability']");
  const modelValue = container.querySelector<HTMLSpanElement>("[data-role='model']");
  const statusValue = container.querySelector<HTMLParagraphElement>("[data-role='status']");
  const playerHpBar = container.querySelector<HTMLDivElement>("[data-role='player-hp']");
  const aiStaminaBar = container.querySelector<HTMLDivElement>("[data-role='ai-stamina']");
  const guardValue = container.querySelector<HTMLSpanElement>("[data-role='guard']");

  if (
    !sceneHost ||
    !videoPreview ||
    !videoOverlay ||
    !aiHpBar ||
    !aiHpValue ||
    !successfulHitsValue ||
    !guardedCountersValue ||
    !trackingValue ||
    !stateValue ||
    !probabilityValue ||
    !modelValue ||
    !statusValue ||
    !playerHpBar ||
    !aiStaminaBar ||
    !guardValue
  ) {
    throw new Error("App shell could not be created.");
  }

  return {
    sceneHost,
    videoPreview,
    videoOverlay,
    aiHpBar,
    aiHpValue,
    successfulHitsValue,
    guardedCountersValue,
    trackingValue,
    stateValue,
    probabilityValue,
    modelValue,
    statusValue,
    playerHpBar,
    aiStaminaBar,
    guardValue
  };
}
