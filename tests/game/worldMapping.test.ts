import { mapBodyPointToWorld, trajectoryToWorld } from "../../src/game/worldMapping";

describe("worldMapping", () => {
  it("mirrors x positions so the 3d scene matches the mirrored webcam view", () => {
    expect(mapBodyPointToWorld({ x: 0.25, y: 0, z: 0 }).x).toBeCloseTo(-0.7);
    expect(mapBodyPointToWorld({ x: -0.25, y: 0, z: 0 }).x).toBeCloseTo(0.7);
  });

  it("converts normalized trajectories into mirrored world space", () => {
    const world = trajectoryToWorld(
      [
        [
          { x: 0.2, y: 0, z: 0 },
          { x: 0.1, y: 0.1, z: -0.1 },
          { x: 0, y: 0.2, z: -0.2 },
          { x: -0.1, y: 0.1, z: -0.1 },
          { x: -0.2, y: 0, z: 0 },
          { x: -0.3, y: -0.1, z: 0.1 }
        ],
        [
          { x: -0.1, y: 0, z: 0 },
          { x: -0.1, y: 0, z: 0 },
          { x: -0.1, y: 0, z: 0 },
          { x: -0.1, y: 0, z: 0 },
          { x: -0.1, y: 0, z: 0 },
          { x: -0.1, y: 0, z: 0 }
        ]
      ],
      {
        shoulderCenter: { x: 0, y: 0, z: 0 },
        shoulderScale: 1
      }
    );

    expect(world[0][0].x).toBeCloseTo(-0.56);
    expect(world[0][2].y).toBeCloseTo(1.87);
    expect(world[0][2].z).toBeCloseTo(-0.18);
  });
});
