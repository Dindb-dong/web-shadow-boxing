import {
  loadBoxerAiWeights,
  runBoxerAiInference,
  type SerializedWeights
} from "../../src/model/gruRuntime";

function createZeroMatrix(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
}

describe("gruRuntime", () => {
  it("runs a deterministic single-layer GRU export and reshapes boxer_ai outputs correctly", () => {
    const serialized: SerializedWeights = {
      config: {
        input_dim: 2,
        hidden_dim: 1,
        future_steps: 2
      },
      tensors: {
        "gru.weight_ih_l0": {
          shape: [3, 2],
          data: [
            [0, 0],
            [0, 0],
            [1, 0]
          ]
        },
        "gru.weight_hh_l0": {
          shape: [3, 1],
          data: [[0], [0], [0]]
        },
        "gru.bias_ih_l0": {
          shape: [3],
          data: [0, -10, 0]
        },
        "gru.bias_hh_l0": {
          shape: [3],
          data: [0, 0, 0]
        },
        "state_head.0.weight": {
          shape: [1, 1],
          data: [[1]]
        },
        "state_head.0.bias": {
          shape: [1],
          data: [0]
        },
        "state_head.2.weight": {
          shape: [2, 1],
          data: [[0], [2]]
        },
        "state_head.2.bias": {
          shape: [2],
          data: [0, 0]
        },
        "traj_head.0.weight": {
          shape: [1, 1],
          data: [[1]]
        },
        "traj_head.0.bias": {
          shape: [1],
          data: [0]
        },
        "traj_head.2.weight": {
          shape: [12, 1],
          data: createZeroMatrix(12, 1).map((_, index) => [index % 3 === 0 ? 1 : 0.5])
        },
        "traj_head.2.bias": {
          shape: [12],
          data: Array.from({ length: 12 }, (_, index) => index * 0.1)
        }
      }
    };

    const weights = loadBoxerAiWeights(serialized);
    const output = runBoxerAiInference(weights, [
      [0, 0],
      [1, 0]
    ]);

    expect(output.state_name).toBe("attacking");
    expect(output.attacking_prob).toBeGreaterThan(0.5);
    expect(output.traj[0]).toHaveLength(2);
    expect(output.traj[1]).toHaveLength(2);
    expect(output.traj[0][0].x).toBeGreaterThan(0);
    expect(output.traj[1][1].z).toBeGreaterThan(output.traj[1][0].z);
  });

  it("converts trajectory deltas into absolute wrist coordinates using the latest frame", () => {
    const serialized: SerializedWeights = {
      config: {
        input_dim: 54,
        hidden_dim: 1,
        future_steps: 1
      },
      tensors: {
        "gru.weight_ih_l0": {
          shape: [3, 54],
          data: createZeroMatrix(3, 54)
        },
        "gru.weight_hh_l0": {
          shape: [3, 1],
          data: [[0], [0], [0]]
        },
        "gru.bias_ih_l0": {
          shape: [3],
          data: [0, 0, 0]
        },
        "gru.bias_hh_l0": {
          shape: [3],
          data: [0, 0, 0]
        },
        "state_head.0.weight": {
          shape: [1, 1],
          data: [[0]]
        },
        "state_head.0.bias": {
          shape: [1],
          data: [0]
        },
        "state_head.2.weight": {
          shape: [2, 1],
          data: [[0], [0]]
        },
        "state_head.2.bias": {
          shape: [2],
          data: [0, 0]
        },
        "traj_head.0.weight": {
          shape: [1, 1],
          data: [[0]]
        },
        "traj_head.0.bias": {
          shape: [1],
          data: [0]
        },
        "traj_head.2.weight": {
          shape: [6, 1],
          data: createZeroMatrix(6, 1)
        },
        "traj_head.2.bias": {
          shape: [6],
          data: [0, 0, 0, 0, 0, 0]
        }
      }
    };

    const weights = loadBoxerAiWeights(serialized);
    const previous = Array.from({ length: 54 }, () => 0);
    const latest = Array.from({ length: 54 }, () => 0);
    latest[18] = -0.12;
    latest[19] = 0.23;
    latest[20] = -0.34;
    latest[45] = 0.45;
    latest[46] = -0.56;
    latest[47] = 0.67;

    const output = runBoxerAiInference(weights, [previous, latest]);

    expect(output.traj[0][0].x).toBeCloseTo(-0.12);
    expect(output.traj[0][0].y).toBeCloseTo(0.23);
    expect(output.traj[0][0].z).toBeCloseTo(-0.34);
    expect(output.traj[1][0].x).toBeCloseTo(0.45);
    expect(output.traj[1][0].y).toBeCloseTo(-0.56);
    expect(output.traj[1][0].z).toBeCloseTo(0.67);
  });
});
