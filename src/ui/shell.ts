import { GAME_VERSION } from "../version";

/** Creates the core DOM skeleton used by the app. */
export function createAppShell(container: HTMLElement): {
  sceneHost: HTMLDivElement;
  difficultyOverlay: HTMLDivElement;
  difficultyTitle: HTMLHeadingElement;
  difficultyDescription: HTMLParagraphElement;
  difficultyBeginnerButton: HTMLButtonElement;
  difficultyIntermediateButton: HTMLButtonElement;
  difficultyExpertButton: HTMLButtonElement;
  roundStartOverlay: HTMLDivElement;
  roundStartText: HTMLParagraphElement;
  leaderboardOverlay: HTMLDivElement;
  leaderboardOpenButton: HTMLButtonElement;
  leaderboardCloseButton: HTMLButtonElement;
  endgameOverlay: HTMLDivElement;
  endgameTitle: HTMLHeadingElement;
  endgameSubtitle: HTMLParagraphElement;
  endgameRestartButton: HTMLButtonElement;
  videoPreview: HTMLVideoElement;
  videoOverlay: HTMLCanvasElement;
  cameraSelect: HTMLSelectElement;
  playerIdValue: HTMLSpanElement;
  connectIdInput: HTMLInputElement;
  connectIdButton: HTMLButtonElement;
  renameIdInput: HTMLInputElement;
  renameIdButton: HTMLButtonElement;
  leaderboardRefreshButton: HTMLButtonElement;
  leaderboardList: HTMLDivElement;
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
  debugEmitCountValue: HTMLSpanElement;
  debugLastEventValue: HTMLParagraphElement;
  debugLogValue: HTMLPreElement;
} {
  container.innerHTML = `
    <div class="game-shell">
      <div class="scene-host"></div>
      <div class="difficulty-overlay" data-role="difficulty-overlay" hidden>
        <div class="difficulty-card">
          <p class="eyebrow">Difficulty</p>
          <h2 class="difficulty-title" data-role="difficulty-title">Choose Round Difficulty</h2>
          <p class="difficulty-description" data-role="difficulty-description">
            Pick a difficulty before this round starts.
          </p>
          <div class="difficulty-options">
            <button class="difficulty-button" type="button" data-role="difficulty-beginner">
              <span class="difficulty-name">초보</span>
              <span class="difficulty-note">회피 최대 확률이 더 낮습니다.</span>
            </button>
            <button class="difficulty-button" type="button" data-role="difficulty-intermediate">
              <span class="difficulty-name">중수</span>
              <span class="difficulty-note">현재 기본 난이도입니다.</span>
            </button>
            <button class="difficulty-button" type="button" data-role="difficulty-expert">
              <span class="difficulty-name">고수</span>
              <span class="difficulty-note">유저 idle 시 선공하며 회피 최솟값이 더 높습니다.</span>
            </button>
          </div>
        </div>
      </div>
      <div class="round-start-overlay" data-role="round-start-overlay" hidden>
        <p class="round-start-text" data-role="round-start-text">3</p>
      </div>
      <div class="leaderboard-overlay" data-role="leaderboard-overlay" hidden>
        <div class="leaderboard-modal">
          <div class="leaderboard-modal-header">
            <p class="eyebrow">Player & Leaderboard</p>
            <button class="leaderboard-close-button" type="button" data-role="leaderboard-close-button">닫기</button>
          </div>
          <div class="metric-row">
            <span>Player ID</span>
            <strong data-role="player-id">loading...</strong>
          </div>
          <div class="id-row">
            <input
              class="id-input"
              type="text"
              data-role="connect-id-input"
              placeholder="기존 ID 입력"
              maxlength="24"
            />
            <button class="id-button" type="button" data-role="connect-id-button">이어하기</button>
          </div>
          <div class="id-row">
            <input
              class="id-input"
              type="text"
              data-role="rename-id-input"
              placeholder="새 ID 입력"
              maxlength="24"
            />
            <button class="id-button" type="button" data-role="rename-id-button">ID 변경</button>
          </div>
          <button class="id-button id-button-full" type="button" data-role="leaderboard-refresh">
            Leaderboard 새로고침
          </button>
          <div class="leaderboard-list" data-role="leaderboard-list">Loading leaderboard...</div>
        </div>
      </div>
      <div class="endgame-overlay" data-role="endgame-overlay" hidden>
        <div class="endgame-card">
          <p class="eyebrow">Combat Result</p>
          <h2 class="endgame-title" data-role="endgame-title">Victory</h2>
          <p class="endgame-subtitle" data-role="endgame-subtitle">You dropped the AI.</p>
          <button class="endgame-button" type="button" data-role="endgame-restart">New Game Start</button>
        </div>
      </div>
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
          <button class="leaderboard-open-button" type="button" data-role="leaderboard-open-button">
            리더보드 보기
          </button>
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
  const difficultyOverlay = container.querySelector<HTMLDivElement>("[data-role='difficulty-overlay']");
  const difficultyTitle = container.querySelector<HTMLHeadingElement>("[data-role='difficulty-title']");
  const difficultyDescription = container.querySelector<HTMLParagraphElement>("[data-role='difficulty-description']");
  const difficultyBeginnerButton = container.querySelector<HTMLButtonElement>("[data-role='difficulty-beginner']");
  const difficultyIntermediateButton = container.querySelector<HTMLButtonElement>(
    "[data-role='difficulty-intermediate']"
  );
  const difficultyExpertButton = container.querySelector<HTMLButtonElement>("[data-role='difficulty-expert']");
  const roundStartOverlay = container.querySelector<HTMLDivElement>("[data-role='round-start-overlay']");
  const roundStartText = container.querySelector<HTMLParagraphElement>("[data-role='round-start-text']");
  const leaderboardOverlay = container.querySelector<HTMLDivElement>("[data-role='leaderboard-overlay']");
  const leaderboardOpenButton = container.querySelector<HTMLButtonElement>("[data-role='leaderboard-open-button']");
  const leaderboardCloseButton = container.querySelector<HTMLButtonElement>("[data-role='leaderboard-close-button']");
  const endgameOverlay = container.querySelector<HTMLDivElement>("[data-role='endgame-overlay']");
  const endgameTitle = container.querySelector<HTMLHeadingElement>("[data-role='endgame-title']");
  const endgameSubtitle = container.querySelector<HTMLParagraphElement>("[data-role='endgame-subtitle']");
  const endgameRestartButton = container.querySelector<HTMLButtonElement>("[data-role='endgame-restart']");
  const videoPreview = container.querySelector<HTMLVideoElement>(".camera-preview");
  const videoOverlay = container.querySelector<HTMLCanvasElement>(".camera-overlay");
  const cameraSelect = container.querySelector<HTMLSelectElement>("[data-role='camera-select']");
  const playerIdValue = container.querySelector<HTMLSpanElement>("[data-role='player-id']");
  const connectIdInput = container.querySelector<HTMLInputElement>("[data-role='connect-id-input']");
  const connectIdButton = container.querySelector<HTMLButtonElement>("[data-role='connect-id-button']");
  const renameIdInput = container.querySelector<HTMLInputElement>("[data-role='rename-id-input']");
  const renameIdButton = container.querySelector<HTMLButtonElement>("[data-role='rename-id-button']");
  const leaderboardRefreshButton = container.querySelector<HTMLButtonElement>("[data-role='leaderboard-refresh']");
  const leaderboardList = container.querySelector<HTMLDivElement>("[data-role='leaderboard-list']");
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
  const debugEmitCountValue = container.querySelector<HTMLSpanElement>("[data-role='debug-emit-count']");
  const debugLastEventValue = container.querySelector<HTMLParagraphElement>("[data-role='debug-last-event']");
  const debugLogValue = container.querySelector<HTMLPreElement>("[data-role='debug-log']");

  if (
    !sceneHost ||
    !difficultyOverlay ||
    !difficultyTitle ||
    !difficultyDescription ||
    !difficultyBeginnerButton ||
    !difficultyIntermediateButton ||
    !difficultyExpertButton ||
    !roundStartOverlay ||
    !roundStartText ||
    !leaderboardOverlay ||
    !leaderboardOpenButton ||
    !leaderboardCloseButton ||
    !endgameOverlay ||
    !endgameTitle ||
    !endgameSubtitle ||
    !endgameRestartButton ||
    !videoPreview ||
    !videoOverlay ||
    !cameraSelect ||
    !playerIdValue ||
    !connectIdInput ||
    !connectIdButton ||
    !renameIdInput ||
    !renameIdButton ||
    !leaderboardRefreshButton ||
    !leaderboardList ||
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
    !debugEmitCountValue ||
    !debugLastEventValue ||
    !debugLogValue
  ) {
    throw new Error("App shell could not be created.");
  }

  return {
    sceneHost,
    difficultyOverlay,
    difficultyTitle,
    difficultyDescription,
    difficultyBeginnerButton,
    difficultyIntermediateButton,
    difficultyExpertButton,
    roundStartOverlay,
    roundStartText,
    leaderboardOverlay,
    leaderboardOpenButton,
    leaderboardCloseButton,
    endgameOverlay,
    endgameTitle,
    endgameSubtitle,
    endgameRestartButton,
    videoPreview,
    videoOverlay,
    cameraSelect,
    playerIdValue,
    connectIdInput,
    connectIdButton,
    renameIdInput,
    renameIdButton,
    leaderboardRefreshButton,
    leaderboardList,
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
    debugEmitCountValue,
    debugLastEventValue,
    debugLogValue
  };
}
