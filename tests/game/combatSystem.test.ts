import { CombatSystem } from "../../src/game/combatSystem";
import type { ModelOutput, ResolvedPoseFrame, WristPairTrajectory } from "../../src/types/game";

function createFaceThreatTrajectory(): WristPairTrajectory {
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
      { x: 0.2, y: 1.05, z: -1.55 },
      { x: 0.24, y: 1.08, z: -1.52 },
      { x: 0.28, y: 1.1, z: -1.49 },
      { x: 0.3, y: 1.12, z: -1.46 },
      { x: 0.32, y: 1.14, z: -1.43 },
      { x: 0.34, y: 1.16, z: -1.4 }
    ]
  ];
}

function createCenteredFaceThreatTrajectory(): WristPairTrajectory {
  return [
    [
      { x: -0.03, y: 1.74, z: -1.87 },
      { x: -0.01, y: 1.76, z: -1.85 },
      { x: 0.01, y: 1.79, z: -1.84 },
      { x: 0.03, y: 1.77, z: -1.83 },
      { x: 0.05, y: 1.75, z: -1.81 },
      { x: 0.06, y: 1.73, z: -1.8 }
    ],
    [
      { x: -0.02, y: 1.72, z: -1.88 },
      { x: 0, y: 1.74, z: -1.86 },
      { x: 0.02, y: 1.76, z: -1.84 },
      { x: 0.03, y: 1.75, z: -1.83 },
      { x: 0.05, y: 1.73, z: -1.82 },
      { x: 0.06, y: 1.71, z: -1.8 }
    ]
  ];
}

function createBodyThreatTrajectory(): WristPairTrajectory {
  return [
    [
      { x: -0.24, y: 1.18, z: -1.96 },
      { x: -0.18, y: 1.2, z: -1.94 },
      { x: -0.12, y: 1.22, z: -1.92 },
      { x: -0.06, y: 1.24, z: -1.9 },
      { x: 0, y: 1.26, z: -1.88 },
      { x: 0.06, y: 1.28, z: -1.86 }
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

function createSegmentCrossingFaceTrajectory(): WristPairTrajectory {
  return [
    [
      { x: -0.62, y: 1.78, z: -1.85 },
      { x: -0.42, y: 1.78, z: -1.85 },
      { x: -0.31, y: 1.78, z: -1.85 },
      { x: 0.31, y: 1.78, z: -1.85 },
      { x: 0.42, y: 1.78, z: -1.85 },
      { x: 0.62, y: 1.78, z: -1.85 }
    ],
    [
      { x: -0.5, y: 1.06, z: -1.58 },
      { x: -0.4, y: 1.08, z: -1.56 },
      { x: -0.3, y: 1.1, z: -1.54 },
      { x: -0.2, y: 1.12, z: -1.52 },
      { x: -0.1, y: 1.14, z: -1.5 },
      { x: 0, y: 1.16, z: -1.48 }
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

function createShiftedBlockPose(): ResolvedPoseFrame {
  return {
    timestamp: 2,
    nose: { x: 0.2, y: 0.3, z: 0 },
    leftShoulder: { x: -0.1, y: 0.2, z: 0 },
    leftElbow: { x: -0.04, y: 0.24, z: 0 },
    leftWrist: { x: 0.02, y: 0.3, z: 0 },
    rightShoulder: { x: 0.28, y: 0.2, z: 0 },
    rightElbow: { x: 0.3, y: 0.08, z: 0 },
    rightWrist: { x: 0.42, y: -0.08, z: 0.1 },
    interpolated: false
  };
}

function createSwayBackPose(): ResolvedPoseFrame {
  const pose = createGuardPose(false);

  return {
    ...pose,
    timestamp: 3,
    nose: { x: 0, y: 0.3, z: -0.35 }
  };
}

describe("combatSystem", () => {
  it("dodges, launches a counter first, then resolves hit/guard on a later tick", () => {
    const system = new CombatSystem(() => 0);
    const output = createOutput("attacking", 0.82);
    const threatTrajectory = createFaceThreatTrajectory();

    const first = system.update({
      now: 100,
      modelMode: "mock",
      tracking: true,
      output,
      worldTraj: threatTrajectory,
      userPose: createGuardPose(false)
    });
    const launched = system.update({
      now: 450,
      modelMode: "mock",
      tracking: true,
      output,
      worldTraj: threatTrajectory,
      userPose: createGuardPose(false)
    });
    const resolved = system.update({
      now: 950,
      modelMode: "mock",
      tracking: true,
      output,
      worldTraj: threatTrajectory,
      userPose: createGuardPose(false)
    });

    expect(first.triggerDodge).not.toBeNull();
    expect(first.snapshot.aiHp).toBe(100);
    expect(launched.triggerCounter?.result).toBe("none");
    expect(launched.snapshot.playerHp).toBe(100);
    expect(launched.snapshot.lastGuardResult).toBe("none");
    expect(launched.triggerCounter?.move).toBeDefined();
    expect(launched.triggerCounter?.target?.x).toBeCloseTo(0);
    expect(launched.triggerCounter?.target?.y).toBeCloseTo(2.08);
    expect(launched.triggerCounter?.target?.z).toBeCloseTo(-0.8);
    expect(resolved.triggerCounter).toBeNull();
    expect(resolved.snapshot.playerHp).toBe(88);
    expect(resolved.snapshot.lastGuardResult).toBe("hit");
  });

  it("does not dodge idle predictions even if a path exists", () => {
    const system = new CombatSystem();
    const output = createOutput("idle", 0.2);

    const result = system.update({
      now: 100,
      modelMode: "mock",
      tracking: true,
      output,
      worldTraj: createFaceThreatTrajectory(),
      userPose: createGuardPose(false)
    });

    expect(result.triggerDodge).toBeNull();
    expect(result.snapshot.activeThreat.stateName).toBe("idle");
  });

  it("blocks a counter with the arm when the face moved off the target line", () => {
    const system = new CombatSystem(() => 0);
    const output = createOutput("attacking", 0.9);
    const first = system.update({
      now: 100,
      modelMode: "mock",
      tracking: true,
      output,
      worldTraj: createFaceThreatTrajectory(),
      userPose: createGuardPose(false)
    });
    const launched = system.update({
      now: 450,
      modelMode: "mock",
      tracking: true,
      output,
      worldTraj: createFaceThreatTrajectory(),
      userPose: createGuardPose(false)
    });
    const result = system.update({
      now: 950,
      modelMode: "mock",
      tracking: true,
      output,
      worldTraj: createFaceThreatTrajectory(),
      userPose: createShiftedBlockPose()
    });

    expect(first.triggerDodge).not.toBeNull();
    expect(launched.triggerCounter?.result).toBe("none");
    expect(result.triggerCounter).toBeNull();
    expect(result.snapshot.guardedCounters).toBe(1);
    expect(result.snapshot.playerHp).toBe(100);
    expect(result.snapshot.statusText).toContain("blocked");
  });

  it("treats a sway-back movement as a defended counter", () => {
    const system = new CombatSystem(() => 0);
    const output = createOutput("attacking", 0.9);

    system.update({
      now: 100,
      modelMode: "mock",
      tracking: true,
      output,
      worldTraj: createFaceThreatTrajectory(),
      userPose: createGuardPose(false)
    });
    const launched = system.update({
      now: 450,
      modelMode: "mock",
      tracking: true,
      output,
      worldTraj: createFaceThreatTrajectory(),
      userPose: createGuardPose(false)
    });

    const result = system.update({
      now: 950,
      modelMode: "mock",
      tracking: true,
      output,
      worldTraj: createFaceThreatTrajectory(),
      userPose: createSwayBackPose()
    });

    expect(launched.triggerCounter?.result).toBe("none");
    expect(result.triggerCounter).toBeNull();
    expect(result.snapshot.guardedCounters).toBe(1);
    expect(result.snapshot.statusText).toContain("slipped back");
  });

  it("does not reduce AI hp when the face trajectory is dodged", () => {
    const system = new CombatSystem(() => 0);
    const result = system.update({
      now: 100,
      modelMode: "mock",
      tracking: true,
      output: createOutput("attacking", 0.9),
      worldTraj: createFaceThreatTrajectory(),
      userPose: createGuardPose(false)
    });

    expect(result.triggerDodge).not.toBeNull();
    expect(result.snapshot.aiHp).toBe(100);
    expect(result.snapshot.successfulHits).toBe(0);
  });

  it("lands a clean hit on the AI face when the dodge roll fails", () => {
    const system = new CombatSystem(() => 0.99);
    const result = system.update({
      now: 100,
      modelMode: "mock",
      tracking: true,
      output: createOutput("attacking", 0.9),
      worldTraj: createFaceThreatTrajectory(),
      userPose: createGuardPose(false)
    });

    expect(result.triggerDodge).toBeNull();
    expect(result.snapshot.statusText).toContain("landed");
    expect(result.snapshot.aiHp).toBe(86);
    expect(result.snapshot.successfulHits).toBe(1);
  });

  it("lets the player interrupt the AI while the counter is primed", () => {
    const system = new CombatSystem(() => 0);
    const output = createOutput("attacking", 0.9);

    const first = system.update({
      now: 100,
      modelMode: "mock",
      tracking: true,
      output,
      worldTraj: createFaceThreatTrajectory(),
      userPose: createGuardPose(false)
    });
    system.update({
      now: 250,
      modelMode: "mock",
      tracking: true,
      output: createOutput("idle", 0.1),
      worldTraj: createFaceThreatTrajectory(),
      userPose: createGuardPose(false)
    });
    const punish = system.update({
      now: 300,
      modelMode: "mock",
      tracking: true,
      output,
      worldTraj: createFaceThreatTrajectory(),
      userPose: createGuardPose(false)
    });

    expect(first.triggerDodge).not.toBeNull();
    expect(punish.triggerDodge).toBeNull();
    expect(punish.snapshot.aiHp).toBe(72);
    expect(punish.snapshot.successfulHits).toBe(1);
    expect(punish.snapshot.statusText).toContain("punished");
    expect(punish.snapshot.counterState).toBe("idle");
  });

  it("applies damage when the trajectory intersects the visible AI torso even if it misses the face", () => {
    const system = new CombatSystem(() => 0.99);
    const result = system.update({
      now: 100,
      modelMode: "mock",
      tracking: true,
      output: createOutput("attacking", 0.92),
      worldTraj: createBodyThreatTrajectory(),
      userPose: createGuardPose(false)
    });

    expect(result.triggerDodge).toBeNull();
    expect(result.snapshot.aiHp).toBe(86);
    expect(result.snapshot.successfulHits).toBe(1);
  });

  it("applies AI damage when a trajectory segment crosses the face hitbox between sampled points", () => {
    const system = new CombatSystem(() => 0.99);
    const result = system.update({
      now: 100,
      modelMode: "mock",
      tracking: true,
      output: createOutput("attacking", 0.92),
      worldTraj: createSegmentCrossingFaceTrajectory(),
      userPose: createGuardPose(false)
    });

    expect(result.triggerDodge).toBeNull();
    expect(result.snapshot.aiHp).toBe(86);
    expect(result.snapshot.successfulHits).toBe(1);
  });

  it("maps dodge direction to structured counter families", () => {
    const system = new CombatSystem(() => 0);
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

  it("alternates side on repeated neutral threats instead of sticking to one dodge side", () => {
    const system = new CombatSystem(() => 0);
    const output = createOutput("attacking", 0.9);
    const neutralThreat = createCenteredFaceThreatTrajectory();
    const first = system.update({
      now: 100,
      modelMode: "mock",
      tracking: true,
      output,
      worldTraj: neutralThreat,
      userPose: createGuardPose(false)
    });
    system.update({
      now: 980,
      modelMode: "mock",
      tracking: true,
      output,
      worldTraj: neutralThreat,
      userPose: createGuardPose(true)
    });
    system.update({
      now: 1700,
      modelMode: "mock",
      tracking: true,
      output: createOutput("idle", 0.1),
      worldTraj: neutralThreat,
      userPose: createGuardPose(false)
    });
    const second = system.update({
      now: 1900,
      modelMode: "mock",
      tracking: true,
      output,
      worldTraj: neutralThreat,
      userPose: createGuardPose(false)
    });

    expect(first.triggerDodge?.startsWith("left")).toBe(true);
    expect(second.triggerDodge?.startsWith("right")).toBe(true);
  });
});
