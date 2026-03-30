import { createAppShell } from "../../src/ui/shell";
import { GAME_VERSION } from "../../src/version";

describe("createAppShell", () => {
  it("creates the main scene host and HUD nodes", () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector<HTMLElement>("#app");

    expect(root).not.toBeNull();

    const shell = createAppShell(root!);

    expect(shell.sceneHost.className).toContain("scene-host");
    expect(shell.videoPreview.tagName).toBe("VIDEO");
    expect(shell.videoOverlay.tagName).toBe("CANVAS");
    expect(shell.aiHpBar.tagName).toBe("DIV");
    expect(shell.aiHpValue.textContent).toContain("100");
    expect(shell.successfulHitsValue.textContent).toBe("0");
    expect(shell.guardedCountersValue.textContent).toBe("0");
    expect(root?.textContent).toContain(`v${GAME_VERSION}`);
    expect(root?.textContent).toContain("Successful Hits");
    expect(root?.textContent).toContain("Defended Counters");
    expect(shell.statusValue.textContent).toContain("Camera");
  });
});
