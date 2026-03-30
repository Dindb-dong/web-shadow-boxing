/** Describes the static content shown above the test scene. */
export interface TestScenarioShellConfig {
  title: string;
  description: string;
  buttonLabel: string;
}

/** Builds a lightweight scene test page with one action button and status area. */
export function createTestScenarioShell(
  container: HTMLElement,
  config: TestScenarioShellConfig
): {
  sceneHost: HTMLDivElement;
  runButton: HTMLButtonElement;
  statusValue: HTMLParagraphElement;
} {
  container.innerHTML = `
    <div class="test-page">
      <div class="test-card">
        <p class="eyebrow">Combat Motion Test</p>
        <h1>${config.title}</h1>
        <p class="test-description">${config.description}</p>
        <div class="test-actions">
          <button class="test-button" type="button">${config.buttonLabel}</button>
          <a class="test-link" href="/combat-test-hub.html">테스트 허브</a>
          <a class="test-link" href="/">메인 게임</a>
        </div>
        <p class="test-status">대기 중</p>
      </div>
      <div class="test-scene-panel">
        <div class="test-scene"></div>
      </div>
    </div>
  `;

  const sceneHost = container.querySelector<HTMLDivElement>(".test-scene");
  const runButton = container.querySelector<HTMLButtonElement>(".test-button");
  const statusValue = container.querySelector<HTMLParagraphElement>(".test-status");

  if (!sceneHost || !runButton || !statusValue) {
    throw new Error("Test scenario shell could not be created.");
  }

  return { sceneHost, runButton, statusValue };
}
