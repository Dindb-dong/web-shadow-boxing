import { AttackDetector } from "../../src/logic/AttackDetector";
import type { Vec3 } from "../../src/types/game";

function createBaseFrame(timestamp: number, leftWrist: Vec3, rightWrist: Vec3) {
  return {
    timestamp,
    leftShoulder: { x: -0.28, y: 0.22, z: 0.02 },
    rightShoulder: { x: 0.28, y: 0.22, z: 0.02 },
    leftWrist,
    rightWrist
  };
}

describe("attackDetector", () => {
  it("stays idle on weak guard jitter", () => {
    const detector = new AttackDetector();
    let result = detector.update(
      createBaseFrame(0, { x: -0.22, y: 0.16, z: -0.02 }, { x: 0.22, y: 0.16, z: -0.02 })
    );

    for (let index = 1; index <= 14; index += 1) {
      const wobble = (index % 2 === 0 ? 1 : -1) * 0.002;
      result = detector.update(
        createBaseFrame(
          index,
          { x: -0.22 + wobble, y: 0.16 - wobble, z: -0.02 + wobble },
          { x: 0.22 - wobble, y: 0.16 + wobble, z: -0.02 - wobble }
        )
      );
    }

    expect(result.state).toBe("idle");
    expect(result.probability).toBeLessThan(0.8);
  });

  it("switches to attacking on rapid forward extension", () => {
    const detector = new AttackDetector();
    const rightPunchFrames: Vec3[] = [
      { x: 0.22, y: 0.17, z: -0.02 },
      { x: 0.24, y: 0.18, z: -0.05 },
      { x: 0.29, y: 0.2, z: -0.12 },
      { x: 0.36, y: 0.22, z: -0.22 },
      { x: 0.43, y: 0.24, z: -0.31 },
      { x: 0.47, y: 0.25, z: -0.36 },
      { x: 0.49, y: 0.25, z: -0.38 }
    ];
    let result = detector.update(
      createBaseFrame(0, { x: -0.22, y: 0.16, z: -0.02 }, { x: 0.22, y: 0.16, z: -0.02 })
    );

    for (let index = 1; index <= 12; index += 1) {
      result = detector.update(
        createBaseFrame(index, { x: -0.22, y: 0.16, z: -0.02 }, { ...rightPunchFrames[Math.min(index - 1, rightPunchFrames.length - 1)] })
      );
    }

    expect(result.state).toBe("attacking");
    expect(result.probability).toBeGreaterThanOrEqual(0.8);
  });

  it("returns to idle when attack probability decays below hysteresis exit threshold", () => {
    const detector = new AttackDetector();
    const punchFrames: Vec3[] = [
      { x: 0.22, y: 0.16, z: -0.02 },
      { x: 0.25, y: 0.18, z: -0.06 },
      { x: 0.31, y: 0.2, z: -0.14 },
      { x: 0.39, y: 0.23, z: -0.25 },
      { x: 0.45, y: 0.25, z: -0.33 }
    ];

    for (let index = 0; index < 10; index += 1) {
      detector.update(
        createBaseFrame(index, { x: -0.22, y: 0.16, z: -0.02 }, { ...punchFrames[Math.min(index, punchFrames.length - 1)] })
      );
    }

    let result = detector.update(
      createBaseFrame(11, { x: -0.22, y: 0.16, z: -0.02 }, { x: 0.46, y: 0.25, z: -0.35 })
    );
    expect(result.state).toBe("attacking");

    for (let index = 12; index <= 26; index += 1) {
      result = detector.update(
        createBaseFrame(index, { x: -0.22, y: 0.16, z: -0.02 }, { x: 0.22, y: 0.16, z: -0.02 })
      );
    }

    expect(result.probability).toBeLessThanOrEqual(0.3);
    expect(result.state).toBe("idle");
  });
});
