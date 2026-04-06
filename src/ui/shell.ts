import { GAME_VERSION } from "../version";

/** Creates the core DOM skeleton used by the app. */
export function createAppShell(container: HTMLElement): {
  sceneHost: HTMLDivElement;
  videoPreview: HTMLVideoElement;
  videoOverlay: HTMLCanvasElement;
  cameraSelect: HTMLSelectElement;
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
  liveThreatPanel: HTMLDivElement;
  liveStateValue: HTMLSpanElement;
  liveProbabilityValue: HTMLSpanElement;
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
          <div class="metric-row"><span>Tight Guard</span><strong data-role="defense-tight-guard">0</strong></div>
          <div class="metric-row"><span>Duck</span><strong data-role="defense-duck">0</strong></div>
          <div class="metric-row"><span>Weave</span><strong data-role="defense-weave">0</strong></div>
          <div class="metric-row"><span>Sway</span><strong data-role="defense-sway">0</strong></div>
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
        <div class="hud-panel live-threat-panel" data-role="live-threat-panel" data-threat="idle">
          <p class="eyebrow">Live Threat</p>
          <strong class="live-threat-state" data-role="live-state">IDLE</strong>
          <div class="live-threat-probability">
            <span>Attack Probability</span>
            <strong data-role="live-probability">0%</strong>
          </div>
        </div>
        <div class="hud-panel debug-panel">
          <p class="eyebrow">Debug HUD</p>
          <div class="metric-row"><span>Raw Threat</span><strong data-role="debug-raw-threat">idle / 0.00</strong></div>
          <div class="metric-row"><span>Raw Attacking Prob</span><strong data-role="debug-raw-attacking-prob">0.00</strong></div>
          <div class="metric-row"><span>Last Emit Raw Prob</span><strong data-role="debug-emit-raw-prob">n/a</strong></div>
          <div class="metric-row"><span>Stable Threat</span><strong data-role="debug-stable-threat">idle / 0.00</strong></div>
          <div class="metric-row"><span>Wrists Visible</span><strong data-role="debug-wrists-visible">no</strong></div>
          <div class="metric-row"><span>Left Wrist Vis</span><strong data-role="debug-left-wrist-visibility">0.00</strong></div>
          <div class="metric-row"><span>Right Wrist Vis</span><strong data-role="debug-right-wrist-visibility">0.00</strong></div>
          <div class="metric-row"><span>Prediction Gated</span><strong data-role="debug-prediction-gated">booting</strong></div>
          <div class="metric-row"><span>Combat Overlap</span><strong data-role="debug-combat-hitbox-overlap">n/a</strong></div>
          <div class="metric-row"><span>Dodge Chance/Roll</span><strong data-role="debug-dodge-chance-roll">n/a</strong></div>
          <div class="metric-row"><span>AttackStarted Edge</span><strong data-role="debug-attack-started-edge">no</strong></div>
          <div class="metric-row"><span>Assessment Age</span><strong data-role="debug-assessment-age">n/a</strong></div>
          <div class="metric-row"><span>Refresh Count</span><strong data-role="debug-refresh-count">0</strong></div>
          <div class="metric-row"><span>Trajectory Emits</span><strong data-role="debug-emit-count">0</strong></div>
          <p class="debug-last-event" data-role="debug-last-event">Booting debug HUD</p>
          <pre class="debug-log" data-role="debug-log">Booting debug HUD</pre>
        </div>
        <div class="hud-grid">
          <div class="hud-panel video-panel">
            <div class="video-header">
              <div class="video-label">Player Pose Feed</div>
              <div class="camera-controls">
                <label class="camera-select-label" for="camera-select">Camera</label>
                <select id="camera-select" class="camera-select" data-role="camera-select">
                  <option value="">Default camera</option>
                </select>
              </div>
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
  const cameraSelect = container.querySelector<HTMLSelectElement>("[data-role='camera-select']");
  const aiHpBar = container.querySelector<HTMLDivElement>("[data-role='ai-hp']");
  const aiHpValue = container.querySelector<HTMLSpanElement>("[data-role='ai-hp-value']");
  const successfulHitsValue = container.querySelector<HTMLSpanElement>("[data-role='successful-hits']");
  const guardedCountersValue = container.querySelector<HTMLSpanElement>("[data-role='guarded-counters']");
  const tightGuardDefenseValue = container.querySelector<HTMLSpanElement>("[data-role='defense-tight-guard']");
  const duckDefenseValue = container.querySelector<HTMLSpanElement>("[data-role='defense-duck']");
  const weaveDefenseValue = container.querySelector<HTMLSpanElement>("[data-role='defense-weave']");
  const swayDefenseValue = container.querySelector<HTMLSpanElement>("[data-role='defense-sway']");
  const trackingValue = container.querySelector<HTMLSpanElement>("[data-role='tracking']");
  const stateValue = container.querySelector<HTMLSpanElement>("[data-role='state']");
  const probabilityValue = container.querySelector<HTMLSpanElement>("[data-role='probability']");
  const liveThreatPanel = container.querySelector<HTMLDivElement>("[data-role='live-threat-panel']");
  const liveStateValue = container.querySelector<HTMLSpanElement>("[data-role='live-state']");
  const liveProbabilityValue = container.querySelector<HTMLSpanElement>("[data-role='live-probability']");
  const modelValue = container.querySelector<HTMLSpanElement>("[data-role='model']");
  const statusValue = container.querySelector<HTMLParagraphElement>("[data-role='status']");
  const playerHpBar = container.querySelector<HTMLDivElement>("[data-role='player-hp']");
  const aiStaminaBar = container.querySelector<HTMLDivElement>("[data-role='ai-stamina']");
  const guardValue = container.querySelector<HTMLSpanElement>("[data-role='guard']");
  const debugRawThreatValue = container.querySelector<HTMLSpanElement>("[data-role='debug-raw-threat']");
  const debugRawAttackingProbValue = container.querySelector<HTMLSpanElement>("[data-role='debug-raw-attacking-prob']");
  const debugTrajectoryEmitRawProbValue = container.querySelector<HTMLSpanElement>("[data-role='debug-emit-raw-prob']");
  const debugStableThreatValue = container.querySelector<HTMLSpanElement>("[data-role='debug-stable-threat']");
  const debugWristsVisibleValue = container.querySelector<HTMLSpanElement>("[data-role='debug-wrists-visible']");
  const debugLeftWristVisibilityValue = container.querySelector<HTMLSpanElement>("[data-role='debug-left-wrist-visibility']");
  const debugRightWristVisibilityValue = container.querySelector<HTMLSpanElement>("[data-role='debug-right-wrist-visibility']");
  const debugPredictionGatedValue = container.querySelector<HTMLSpanElement>("[data-role='debug-prediction-gated']");
  const debugCombatHitboxOverlapValue = container.querySelector<HTMLSpanElement>("[data-role='debug-combat-hitbox-overlap']");
  const debugDodgeChanceRollValue = container.querySelector<HTMLSpanElement>("[data-role='debug-dodge-chance-roll']");
  const debugAttackStartedEdgeValue = container.querySelector<HTMLSpanElement>("[data-role='debug-attack-started-edge']");
  const debugAssessmentAgeValue = container.querySelector<HTMLSpanElement>("[data-role='debug-assessment-age']");
  const debugRefreshCountValue = container.querySelector<HTMLSpanElement>("[data-role='debug-refresh-count']");
  const debugEmitCountValue = container.querySelector<HTMLSpanElement>("[data-role='debug-emit-count']");
  const debugLastEventValue = container.querySelector<HTMLParagraphElement>("[data-role='debug-last-event']");
  const debugLogValue = container.querySelector<HTMLPreElement>("[data-role='debug-log']");

  if (
    !sceneHost ||
    !videoPreview ||
    !videoOverlay ||
    !cameraSelect ||
    !aiHpBar ||
    !aiHpValue ||
    !successfulHitsValue ||
    !guardedCountersValue ||
    !tightGuardDefenseValue ||
    !duckDefenseValue ||
    !weaveDefenseValue ||
    !swayDefenseValue ||
    !trackingValue ||
    !stateValue ||
    !probabilityValue ||
    !liveThreatPanel ||
    !liveStateValue ||
    !liveProbabilityValue ||
    !modelValue ||
    !statusValue ||
    !playerHpBar ||
    !aiStaminaBar ||
    !guardValue ||
    !debugRawThreatValue ||
    !debugRawAttackingProbValue ||
    !debugTrajectoryEmitRawProbValue ||
    !debugStableThreatValue ||
    !debugWristsVisibleValue ||
    !debugLeftWristVisibilityValue ||
    !debugRightWristVisibilityValue ||
    !debugPredictionGatedValue ||
    !debugCombatHitboxOverlapValue ||
    !debugDodgeChanceRollValue ||
    !debugAttackStartedEdgeValue ||
    !debugAssessmentAgeValue ||
    !debugRefreshCountValue ||
    !debugEmitCountValue ||
    !debugLastEventValue ||
    !debugLogValue
  ) {
    throw new Error("App shell could not be created.");
  }

  return {
    sceneHost,
    videoPreview,
    videoOverlay,
    cameraSelect,
    aiHpBar,
    aiHpValue,
    successfulHitsValue,
    guardedCountersValue,
    tightGuardDefenseValue,
    duckDefenseValue,
    weaveDefenseValue,
    swayDefenseValue,
    trackingValue,
    stateValue,
    probabilityValue,
    liveThreatPanel,
    liveStateValue,
    liveProbabilityValue,
    modelValue,
    statusValue,
    playerHpBar,
    aiStaminaBar,
    guardValue,
    debugRawThreatValue,
    debugRawAttackingProbValue,
    debugTrajectoryEmitRawProbValue,
    debugStableThreatValue,
    debugWristsVisibleValue,
    debugLeftWristVisibilityValue,
    debugRightWristVisibilityValue,
    debugPredictionGatedValue,
    debugCombatHitboxOverlapValue,
    debugDodgeChanceRollValue,
    debugAttackStartedEdgeValue,
    debugAssessmentAgeValue,
    debugRefreshCountValue,
    debugEmitCountValue,
    debugLastEventValue,
    debugLogValue
  };
}
