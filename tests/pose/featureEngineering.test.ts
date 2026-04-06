import {
  PoseSequenceBuffer,
  buildFeatureFrame,
  buildFeatureSequence,
  createBasis,
  denormalizePoint,
  normalizePoint,
  normalizePoseFrame,
  resolvePoseFrame,
  smoothPoseFrame
} from "../../src/pose/featureEngineering";
import type { PoseFrame, ResolvedPoseFrame } from "../../src/types/game";

function createResolvedFrame(timestamp: number): ResolvedPoseFrame {
  return {
    timestamp,
    nose: { x: 0, y: 0.3, z: 0.02 },
    leftShoulder: { x: -0.3, y: 0.2, z: 0 },
    leftElbow: { x: -0.42, y: 0.08, z: -0.08 },
    leftWrist: { x: -0.52 + timestamp * 0.01, y: -0.02, z: -0.12 - timestamp * 0.015 },
    rightShoulder: { x: 0.3, y: 0.2, z: 0 },
    rightElbow: { x: 0.38, y: 0.09, z: -0.06 },
    rightWrist: { x: 0.5 - timestamp * 0.008, y: -0.01, z: -0.14 - timestamp * 0.01 },
    interpolated: false
  };
}

function toPoseFrame(frame: ResolvedPoseFrame): PoseFrame {
  return {
    timestamp: frame.timestamp,
    nose: frame.nose,
    leftShoulder: frame.leftShoulder,
    leftElbow: frame.leftElbow,
    leftWrist: frame.leftWrist,
    rightShoulder: frame.rightShoulder,
    rightElbow: frame.rightElbow,
    rightWrist: frame.rightWrist
  };
}

describe("featureEngineering", () => {
  it("restores normalized coordinates back into the original basis", () => {
    const frame = createResolvedFrame(4);
    const basis = createBasis(frame);
    const normalized = normalizePoint(frame.leftWrist, basis);
    const restored = denormalizePoint(normalized, basis);

    expect(restored.x).toBeCloseTo(frame.leftWrist.x);
    expect(restored.y).toBeCloseTo(frame.leftWrist.y);
    expect(restored.z).toBeCloseTo(frame.leftWrist.z);
  });

  it("rejects incomplete pose frames instead of backfilling missing joints", () => {
    const resolved = resolvePoseFrame({
      timestamp: 1,
      nose: { x: 0, y: 0, z: 0 },
      leftShoulder: { x: -0.2, y: 0.2, z: 0 },
      leftElbow: null,
      leftWrist: { x: -0.3, y: 0.1, z: -0.1 },
      rightShoulder: { x: 0.2, y: 0.2, z: 0 },
      rightElbow: { x: 0.3, y: 0.1, z: -0.1 },
      rightWrist: { x: 0.4, y: 0.05, z: -0.15 }
    });

    expect(resolved).toBeNull();
  });

  it("keeps the first feature frame's velocity and acceleration at zero", () => {
    const featureFrame = buildFeatureFrame([normalizePoseFrame(createResolvedFrame(0))]);

    expect(featureFrame).toHaveLength(54);
    expect(featureFrame.slice(3, 9)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("computes acceleration from the latest three normalized poses", () => {
    const frames = [0, 1, 2].map((timestamp) => normalizePoseFrame(createResolvedFrame(timestamp)));
    const featureFrame = buildFeatureFrame(frames);

    expect(featureFrame).toHaveLength(54);
    expect(featureFrame.slice(24, 27).some((value) => value !== 0)).toBe(true);
  });

  it("applies boxer_ai EMA smoothing after normalization", () => {
    const previous = normalizePoseFrame(createResolvedFrame(0));
    const current = normalizePoseFrame(createResolvedFrame(1));
    const smoothed = smoothPoseFrame(current, previous, 0.3);

    expect(smoothed.leftWrist.x).toBeCloseTo(previous.leftWrist.x * 0.3 + current.leftWrist.x * 0.7);
  });

  it("emits a ready 12-step feature window only after collecting 12 feature frames", () => {
    const buffer = new PoseSequenceBuffer();
    let latest = buffer.push(toPoseFrame(createResolvedFrame(0)));

    expect(latest.tracking).toBe(true);
    expect(latest.ready).toBe(false);

    for (let index = 1; index < 12; index += 1) {
      latest = buffer.push(toPoseFrame(createResolvedFrame(index)));
    }

    expect(latest.ready).toBe(true);
    expect(latest.features).toHaveLength(12);
    latest.features.forEach((featureFrame) => {
      expect(featureFrame).toHaveLength(54);
    });
    expect(buildFeatureSequence(latest.features)).toHaveLength(12);
  });

  it("keeps tracking alive for short gaps but stops producing model input", () => {
    const buffer = new PoseSequenceBuffer();
    buffer.push(toPoseFrame(createResolvedFrame(0)));
    const gap = buffer.push(null);

    expect(gap.tracking).toBe(true);
    expect(gap.ready).toBe(false);
    expect(gap.features).toEqual([]);
    expect(gap.currentPose).toBeNull();
  });
});
