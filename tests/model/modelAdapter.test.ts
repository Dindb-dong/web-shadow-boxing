import { adaptModelOutput, isThreateningOutput } from "../../src/model/modelAdapter";

describe("modelAdapter", () => {
  it("accepts the agreed Step 3 model output format", () => {
    const adapted = adaptModelOutput({
      state_idx: 1,
      state_name: "attacking",
      attacking_prob: 1.2,
      traj: [
        Array.from({ length: 6 }, (_, index) => ({ x: index, y: index * 0.1, z: -index })),
        Array.from({ length: 6 }, (_, index) => ({ x: -index, y: index * 0.2, z: -index * 0.8 }))
      ],
      raw: { logits: [0.2, 0.8] }
    });

    expect(adapted).not.toBeNull();
    expect(adapted?.attacking_prob).toBe(1);
    expect(adapted?.traj[0]).toHaveLength(6);
    expect(isThreateningOutput(adapted!, 0.3)).toBe(true);
  });

  it("rejects malformed trajectory shapes", () => {
    const adapted = adaptModelOutput({
      state_idx: 0,
      state_name: "idle",
      attacking_prob: 0.2,
      traj: [[{ x: 0, y: 0, z: 0 }]],
      raw: {}
    });

    expect(adapted).toBeNull();
  });

  it("does not treat extremely low-probability attacking labels as active threats", () => {
    const adapted = adaptModelOutput({
      state_idx: 1,
      state_name: "attacking",
      attacking_prob: 0.12,
      traj: [
        Array.from({ length: 6 }, (_, index) => ({ x: index * 0.01, y: index * 0.02, z: -index * 0.03 })),
        Array.from({ length: 6 }, (_, index) => ({ x: -index * 0.01, y: index * 0.02, z: -index * 0.03 }))
      ]
    });

    expect(adapted).not.toBeNull();
    expect(isThreateningOutput(adapted!, 0.3)).toBe(false);
  });
});
