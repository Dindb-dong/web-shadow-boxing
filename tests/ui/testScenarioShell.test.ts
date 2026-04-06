import { createTestScenarioShell } from "../../src/ui/testScenarioShell";

describe("createTestScenarioShell", () => {
  it("renders the title, button, links, and scene host for a test page", () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector<HTMLElement>("#app");

    expect(root).not.toBeNull();

    const shell = createTestScenarioShell(root!, {
      title: "Counter Test",
      description: "Scenario description",
      buttonLabel: "테스트 실행"
    });

    expect(shell.sceneHost.className).toContain("test-scene");
    expect(shell.runButton.textContent).toBe("테스트 실행");
    expect(shell.statusValue.textContent).toContain("대기");
    expect(root?.textContent).toContain("Counter Test");
    expect(root?.textContent).toContain("테스트 허브");
    expect(root?.textContent).toContain("메인 게임");
  });
});
