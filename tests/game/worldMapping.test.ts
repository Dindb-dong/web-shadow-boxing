import { mapBodyPointToWorld, trajectoryToWorld } from "../../src/game/worldMapping";

describe("worldMapping", () => {
  it("mirrors x positions so the 3d scene matches the mirrored webcam view", () => {
    expect(mapBodyPointToWorld({ x: 0.25, y: 0, z: 0 }).x).toBeCloseTo(-0.7);
    expect(mapBodyPointToWorld({ x: -0.25, y: 0, z: 0 }).x).toBeCloseTo(0.7);
  });

  it("projects attacking wrist trajectories toward the opponent plane instead of leaving them near the user body", () => {
    const world = trajectoryToWorld(
      [
        [
          { x: -0.68, y: 0.02, z: -0.28 },
          { x: -0.62, y: 0.03, z: -0.38 },
          { x: -0.54, y: 0.05, z: -0.48 },
          { x: -0.45, y: 0.07, z: -0.58 },
          { x: -0.36, y: 0.08, z: -0.66 },
          { x: -0.28, y: 0.1, z: -0.72 }
        ],
        [
          { x: 0.56, y: -0.15, z: -0.06 },
          { x: 0.57, y: -0.16, z: -0.08 },
          { x: 0.58, y: -0.16, z: -0.09 },
          { x: 0.58, y: -0.16, z: -0.1 },
          { x: 0.58, y: -0.16, z: -0.1 },
          { x: 0.58, y: -0.16, z: -0.1 }
        ]
      ],
      {
        shoulderCenter: { x: 0, y: 0, z: 0 },
        shoulderScale: 1
      }
    );

    expect(world[0][5].z).toBeLessThan(-1.7);
    expect(Math.abs(world[0][5].x)).toBeLessThan(Math.abs(world[0][0].x));
    expect(world[0][5].y).toBeGreaterThan(world[1][5].y);
  });

  it("keeps wide hook-like punches entering from the edge instead of collapsing into a narrow lane", () => {
    const world = trajectoryToWorld(
      [
        [
          { x: -0.72, y: 0.06, z: -0.26 },
          { x: -0.66, y: 0.08, z: -0.34 },
          { x: -0.58, y: 0.09, z: -0.44 },
          { x: -0.48, y: 0.11, z: -0.54 },
          { x: -0.38, y: 0.12, z: -0.62 },
          { x: -0.28, y: 0.14, z: -0.7 }
        ],
        [
          { x: 0.52, y: -0.14, z: -0.08 },
          { x: 0.53, y: -0.14, z: -0.09 },
          { x: 0.54, y: -0.15, z: -0.1 },
          { x: 0.54, y: -0.15, z: -0.11 },
          { x: 0.54, y: -0.15, z: -0.11 },
          { x: 0.54, y: -0.15, z: -0.11 }
        ]
      ],
      {
        shoulderCenter: { x: 0, y: 0, z: 0 },
        shoulderScale: 1
      }
    );

    expect(Math.abs(world[0][0].x)).toBeGreaterThan(1.5);
    expect(Math.abs(world[0][5].x)).toBeGreaterThan(0.35);
    expect(Math.abs(world[0][5].x)).toBeLessThan(Math.abs(world[0][0].x));
  });
});
