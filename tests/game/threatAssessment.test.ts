import { shouldEmitThreatTrajectory } from "../../src/game/threatAssessment";
import type { ModelOutput } from "../../src/types/game";

function createOutput(
  probability: number,
  stateName: "idle" | "attacking" = probability >= 0.7 ? "attacking" : "idle"
): ModelOutput {
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

describe("threatAssessment", () => {
  it("emits on a new threatening punch window", () => {
    expect(shouldEmitThreatTrajectory(createOutput(0.12, "idle"), createOutput(0.84, "attacking"))).toBe(
      true
    );
  });

  it("does not emit again while the same threatening window stays active", () => {
    expect(
      shouldEmitThreatTrajectory(createOutput(0.86, "attacking"), createOutput(0.82, "attacking"))
    ).toBe(false);
  });

  it("re-arms after the attack drops back below the emit threshold", () => {
    expect(shouldEmitThreatTrajectory(createOutput(0.84, "attacking"), createOutput(0.2, "idle"))).toBe(
      false
    );
    expect(shouldEmitThreatTrajectory(createOutput(0.2, "idle"), createOutput(0.84, "attacking"))).toBe(
      true
    );
  });

  it("treats 0.7 as the threatening cutoff for emit gating", () => {
    expect(shouldEmitThreatTrajectory(createOutput(0.69, "idle"), createOutput(0.71, "attacking"))).toBe(
      true
    );
  });
});
