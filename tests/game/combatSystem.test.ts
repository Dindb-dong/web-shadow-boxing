import { CombatSystem } from "../../src/game/combatSystem";
import type { ModelOutput, ResolvedPoseFrame, WristPairTrajectory } from "../../src/types/game";

function createThreatTrajectory(): WristPairTrajectory {
  return [
    [
      { x: -0.1, y: 1.72, z: -1.86 },
      { x: -0.05, y: 1.76, z: -1.84 },
      { x: 0, y: 1.8, z: -1.82 },
      { x: 0.04, y: 1.74, z: -1.8 },
      { x: 0.06, y: 1.7, z: -1.78 },
      { x: 0.08, y: 1.66, z: -1.76 }
    ],
    [
      { x: 0.22, y: 1.18, z: -1.92 },
      { x: 0.24, y: 1.2, z: -1.9 },
      { x: 0.26, y: 1.22, z: -1.88 },
      { x: 0.28, y: 1.24, z: -1.86 },
      { x: 0.3, y: 1.26, z: -1.84 },
      { x: 0.32, y: 1.28, z: -1.82 }
    ]
  ];
}

function createOutput(stateName: "idle" | "attacking", probability: number): ModelOutput {
  return {
    state_idx: stateName === "attacking" ? 1 : 0,
    state_name: stateName,
    attacking_prob: probability,
    traj: [
      Array.from({ length: 6 }, () => ({ x: 0, y: 0, z: 0 })) as any,
      Array.from({ length: 6 }, () => ({ x: 0, y: 0, z: 0 })) as any
    ],
    raw: {}
  };
}

function createGuardPose(guarding: boolean): ResolvedPoseFrame {
  const nose = { x: 0, y: 0.3, z: 0 };

  return {
    timestamp: 1,
    nose,
    leftShoulder: { x: -0.2, y: 0.2, z: 0 },
    leftElbow: { x: -0.25, y: 0.08, z: 0 },
    leftWrist: guarding ? { x: 0.05, y: 0.3, z: 0 } : { x: -0.45, y: -0.12, z: 0.1 },
    rightShoulder: { x: 0.2, y: 0.2, z: 0 },
    rightElbow: { x: 0.25, y: 0.08, z: 0 },
    rightWrist: guarding ? { x: -0.04, y: 0.28, z: 0 } : { x: 0.45, y: -0.12, z: 0.1 },
    interpolated: false
  };
}

describe("combatSystem", () => {
  it("triggers a dodge and resolves a successful guard on counter", () => {
    const system = new CombatSystem();
    const output = createOutput("attacking", 0.82);
    const threatTrajectory = createThreatTrajectory();

    const first = system.update({
      now: 100,
      modelMode: "mock",
      tracking: true,
      output,
      worldTraj: threatTrajectory,
      userPose: createGuardPose(false)
    });
    const second = system.update({
      now: 850,
      modelMode: "mock",
      tracking: true,
      output,
      worldTraj: threatTrajectory,
      userPose: createGuardPose(true)
    });

    expect(first.triggerDodge).not.toBeNull();
    expect(second.triggerCounter?.result).toBe("guarded");
    expect(second.triggerCounter?.move).toBeDefined();
    expect(second.snapshot.lastGuardResult).toBe("guarded");
  });

  it("does not dodge idle predictions even if a path exists", () => {
    const system = new CombatSystem();
    const output = createOutput("idle", 0.2);

    const result = system.update({
      now: 100,
      modelMode: "mock",
      tracking: true,
      output,
      worldTraj: createThreatTrajectory(),
      userPose: createGuardPose(false)
    });

    expect(result.triggerDodge).toBeNull();
    expect(result.snapshot.activeThreat.stateName).toBe("idle");
  });

  it("fails to dodge when stamina is drained and allows a hit through", () => {
    const system = new CombatSystem();
    const output = createOutput("attacking", 0.9);
    const threatTrajectory = createThreatTrajectory();
    let exhaustedResult = null;

    for (let cycle = 0; cycle < 12; cycle += 1) {
      const attackResult = system.update({
        now: cycle * 1000 + 100,
        modelMode: "mock",
        tracking: true,
        output,
        worldTraj: threatTrajectory,
        userPose: createGuardPose(false)
      });
      if (attackResult.triggerDodge === null) {
        exhaustedResult = attackResult;
        break;
      }
      system.update({
        now: cycle * 1000 + 900,
        modelMode: "mock",
        tracking: true,
        output: createOutput("idle", 0.1),
        worldTraj: threatTrajectory,
        userPose: createGuardPose(false)
      });
    }

    expect(exhaustedResult).not.toBeNull();
    expect(exhaustedResult?.triggerDodge).toBeNull();
    expect(exhaustedResult?.snapshot.statusText).toContain("exhausted");
  });

  it("maps dodge direction to structured counter families", () => {
    const system = new CombatSystem();
    const leftThreat: WristPairTrajectory = [
      Array.from({ length: 6 }, (_, index) => ({ x: 0.18 + index * 0.01, y: 1.78, z: -1.82 + index * 0.01 })) as any,
      Array.from({ length: 6 }, (_, index) => ({ x: 0.12 + index * 0.01, y: 1.72, z: -1.8 + index * 0.01 })) as any
    ];
    const first = system.update({
      now: 120,
      modelMode: "mock",
      tracking: true,
      output: createOutput("attacking", 0.88),
      worldTraj: leftThreat,
      userPose: createGuardPose(false)
    });

    expect(first.triggerDodge).toBe("left_weave");
    expect(first.snapshot.counterMove === "left_hook" || first.snapshot.counterMove === "right_straight").toBe(true);
  });
});
