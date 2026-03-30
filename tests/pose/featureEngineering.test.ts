import {
  PoseSequenceBuffer,
  buildFeatureSequence,
  createBasis,
  denormalizePoint,
  normalizePoint,
  normalizePoseFrame,
  resolvePoseFrame
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
  it("builds a fixed 12x54 feature tensor", () => {
    const frames = Array.from({ length: 12 }, (_, index) => normalizePoseFrame(createResolvedFrame(index)));
    const sequence = buildFeatureSequence(frames);

    expect(sequence).toHaveLength(12);
    sequence.forEach((featureFrame) => {
      expect(featureFrame).toHaveLength(54);
    });
  });

  it("zero-pads velocity and acceleration for the first sequence frame", () => {
    const sequence = buildFeatureSequence([
      normalizePoseFrame(createResolvedFrame(0)),
      normalizePoseFrame(createResolvedFrame(1))
    ]);

    expect(sequence[10].slice(3, 9)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("restores normalized coordinates back into the original basis", () => {
    const frame = createResolvedFrame(4);
    const basis = createBasis(frame);
    const normalized = normalizePoint(frame.leftWrist, basis);
    const restored = denormalizePoint(normalized, basis);

    expect(restored.x).toBeCloseTo(frame.leftWrist.x);
    expect(restored.y).toBeCloseTo(frame.leftWrist.y);
    expect(restored.z).toBeCloseTo(frame.leftWrist.z);
  });

  it("keeps short null gaps alive in the rolling buffer", () => {
    const buffer = new PoseSequenceBuffer();
    const resolved = createResolvedFrame(1);
    const pushed = buffer.push(toPoseFrame(resolved));
    const gap = buffer.push(null);

    expect(pushed.tracking).toBe(true);
    expect(gap.tracking).toBe(true);
    expect(gap.currentPose?.leftWrist.x).toBeCloseTo(resolved.leftWrist.x);
  });

  it("fills missing keypoints from the previous resolved frame", () => {
    const previous = createResolvedFrame(2);
    const sparseFrame: PoseFrame = {
      timestamp: 3,
      nose: null,
      leftShoulder: previous.leftShoulder,
      leftElbow: null,
      leftWrist: null,
      rightShoulder: previous.rightShoulder,
      rightElbow: null,
      rightWrist: null
    };

    const resolved = resolvePoseFrame(sparseFrame, previous);

    expect(resolved).not.toBeNull();
    expect(resolved?.leftWrist.x).toBeCloseTo(previous.leftWrist.x);
    expect(resolved?.interpolated).toBe(true);
  });
});
