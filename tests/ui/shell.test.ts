import { createAppShell } from "../../src/ui/shell";
import { GAME_VERSION } from "../../src/version";

describe("createAppShell", () => {
  it("creates the main scene host and HUD nodes", () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector<HTMLElement>("#app");

    expect(root).not.toBeNull();

    const shell = createAppShell(root!);

    expect(shell.sceneHost.className).toContain("scene-host");
    expect(shell.endgameOverlay.hidden).toBe(true);
    expect(shell.endgameTitle.textContent).toContain("Victory");
    expect(shell.endgameRestartButton.textContent).toContain("New Game Start");
    expect(shell.videoPreview.tagName).toBe("VIDEO");
    expect(shell.videoOverlay.tagName).toBe("CANVAS");
    expect(shell.cameraSelect.tagName).toBe("SELECT");
    expect(shell.cameraSelect.options[0]?.textContent).toContain("Default camera");
    expect(shell.aiHpBar.tagName).toBe("DIV");
    expect(shell.aiHpValue.textContent).toContain("100");
    expect(shell.successfulHitsValue.textContent).toBe("0");
    expect(shell.guardedCountersValue.textContent).toBe("0");
    expect(shell.tightGuardDefenseValue.textContent).toBe("0");
    expect(shell.duckDefenseValue.textContent).toBe("0");
    expect(shell.weaveDefenseValue.textContent).toBe("0");
    expect(shell.swayDefenseValue.textContent).toBe("0");
    expect(shell.liveStateValue.textContent).toBe("IDLE");
    expect(shell.liveProbabilityValue.textContent).toBe("0%");
    expect(root?.textContent).toContain(`v${GAME_VERSION}`);
    expect(root?.textContent).toContain("Successful Hits");
    expect(root?.textContent).toContain("Defended Counters");
    expect(root?.textContent).toContain("Tight Guard");
    expect(root?.textContent).toContain("Duck");
    expect(root?.textContent).toContain("Weave");
    expect(root?.textContent).toContain("Sway");
    expect(root?.querySelector(".combat-stats-panel")?.textContent).toContain("Tight Guard");
    expect(root?.textContent).toContain("Live Threat");
    expect(root?.textContent).toContain("Attack Probability");
    expect(root?.textContent).toContain("Camera");
    expect(root?.textContent).toContain("Debug HUD");
    expect(root?.textContent).toContain("Raw Attacking Prob");
    expect(root?.textContent).toContain("Last Emit Raw Prob");
    expect(root?.textContent).toContain("Left Wrist Vis");
    expect(root?.textContent).toContain("Right Wrist Vis");
    expect(root?.textContent).toContain("Prediction Gated");
    expect(root?.textContent).toContain("Combat Overlap");
    expect(root?.textContent).toContain("Dodge Chance/Roll");
    expect(root?.textContent).toContain("AttackStarted Edge");
    expect(root?.textContent).not.toContain("Assessment Age");
    expect(root?.textContent).not.toContain("Refresh Count");
    expect(shell.statusValue.textContent).toContain("Camera");
    expect(shell.debugLogValue.textContent).toContain("Booting debug HUD");
  });
});
