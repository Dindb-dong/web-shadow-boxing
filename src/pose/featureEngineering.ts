import {
  FEATURE_DIMENSION,
  MAX_TRACKING_GAP,
  SEQUENCE_LENGTH
} from "../game/constants";
import type {
  Basis,
  FeatureSequence,
  NormalizedPoseFrame,
  PoseFrame,
  ResolvedPoseFrame,
  Vec3
} from "../types/game";
import { addVec3, distanceVec3, midpointVec3, scaleVec3, subVec3, vec3 } from "../utils/vector";

const ARM_POINT_KEYS = [
  "leftShoulder",
  "leftElbow",
  "leftWrist",
  "rightShoulder",
  "rightElbow",
  "rightWrist"
] as const;

/** Resolves nullable pose points with the previous valid frame to preserve short tracking gaps. */
export function resolvePoseFrame(frame: PoseFrame, previous: ResolvedPoseFrame | null): ResolvedPoseFrame | null {
  const leftShoulder = frame.leftShoulder ?? previous?.leftShoulder ?? null;
  const rightShoulder = frame.rightShoulder ?? previous?.rightShoulder ?? null;

  if (!leftShoulder || !rightShoulder) {
    return null;
  }

  return {
    timestamp: frame.timestamp,
    nose: frame.nose ?? previous?.nose ?? midpointVec3(leftShoulder, rightShoulder),
    leftShoulder,
    leftElbow: frame.leftElbow ?? previous?.leftElbow ?? leftShoulder,
    leftWrist: frame.leftWrist ?? previous?.leftWrist ?? leftShoulder,
    rightShoulder,
    rightElbow: frame.rightElbow ?? previous?.rightElbow ?? rightShoulder,
    rightWrist: frame.rightWrist ?? previous?.rightWrist ?? rightShoulder,
    interpolated:
      frame.nose === null ||
      frame.leftShoulder === null ||
      frame.leftElbow === null ||
      frame.leftWrist === null ||
      frame.rightShoulder === null ||
      frame.rightElbow === null ||
      frame.rightWrist === null
  };
}

/** Computes normalization basis from resolved shoulder coordinates. */
export function createBasis(frame: ResolvedPoseFrame): Basis {
  return {
    shoulderCenter: midpointVec3(frame.leftShoulder, frame.rightShoulder),
    shoulderScale: Math.max(distanceVec3(frame.leftShoulder, frame.rightShoulder), 1e-6)
  };
}

/** Normalizes one point with respect to the current body basis. */
export function normalizePoint(point: Vec3, basis: Basis): Vec3 {
  return scaleVec3(subVec3(point, basis.shoulderCenter), 1 / basis.shoulderScale);
}

/** Restores a normalized point back into original coordinate space. */
export function denormalizePoint(point: Vec3, basis: Basis): Vec3 {
  return addVec3(scaleVec3(point, basis.shoulderScale), basis.shoulderCenter);
}

/** Converts a resolved frame into normalized coordinates. */
export function normalizePoseFrame(frame: ResolvedPoseFrame): NormalizedPoseFrame {
  const basis = createBasis(frame);

  return {
    timestamp: frame.timestamp,
    basis,
    nose: normalizePoint(frame.nose, basis),
    leftShoulder: normalizePoint(frame.leftShoulder, basis),
    leftElbow: normalizePoint(frame.leftElbow, basis),
    leftWrist: normalizePoint(frame.leftWrist, basis),
    rightShoulder: normalizePoint(frame.rightShoulder, basis),
    rightElbow: normalizePoint(frame.rightElbow, basis),
    rightWrist: normalizePoint(frame.rightWrist, basis),
    interpolated: frame.interpolated
  };
}

/** Builds one 54-dimensional feature frame using positions, velocities, and accelerations. */
export function buildFeatureFrame(
  frames: NormalizedPoseFrame[],
  currentIndex: number
): number[] {
  const current = frames[currentIndex];
  const previous = frames[currentIndex - 1] ?? null;
  const prePrevious = frames[currentIndex - 2] ?? null;
  const values: number[] = [];

  for (const key of ARM_POINT_KEYS) {
    const position = current[key];
    const previousPosition = previous?.[key] ?? null;
    const prePreviousPosition = prePrevious?.[key] ?? null;
    const velocity = previousPosition ? subVec3(position, previousPosition) : vec3();
    const previousVelocity =
      previousPosition && prePreviousPosition ? subVec3(previousPosition, prePreviousPosition) : vec3();
    const acceleration = previousPosition ? subVec3(velocity, previousVelocity) : vec3();

    values.push(
      position.x,
      position.y,
      position.z,
      velocity.x,
      velocity.y,
      velocity.z,
      acceleration.x,
      acceleration.y,
      acceleration.z
    );
  }

  return values;
}

/** Converts a normalized frame list into a fixed-size feature sequence. */
export function buildFeatureSequence(frames: NormalizedPoseFrame[]): FeatureSequence {
  const slice = frames.slice(-SEQUENCE_LENGTH);
  const sequence = slice.map((_, index) => buildFeatureFrame(slice, index));

  if (sequence.length === 0) {
    return [];
  }

  while (sequence.length < SEQUENCE_LENGTH) {
    sequence.unshift(new Array(FEATURE_DIMENSION).fill(0));
  }

  return sequence;
}

/** Maintains a rolling pose buffer and emits model-ready features when tracking is healthy. */
export class PoseSequenceBuffer {
  private readonly normalizedFrames: NormalizedPoseFrame[] = [];
  private lastResolved: ResolvedPoseFrame | null = null;
  private missingCount = 0;

  /** Pushes a new frame and returns readiness, tracking, and model inputs. */
  push(frame: PoseFrame | null): {
    tracking: boolean;
    ready: boolean;
    features: FeatureSequence;
    basis: Basis | null;
    currentPose: ResolvedPoseFrame | null;
  } {
    if (frame === null) {
      this.missingCount += 1;
      return {
        tracking: this.missingCount <= MAX_TRACKING_GAP && this.lastResolved !== null,
        ready: false,
        features: [],
        basis: this.normalizedFrames[this.normalizedFrames.length - 1]?.basis ?? null,
        currentPose: this.lastResolved
      };
    }

    const resolved = resolvePoseFrame(frame, this.lastResolved);
    if (!resolved) {
      this.missingCount += 1;
      return {
        tracking: false,
        ready: false,
        features: [],
        basis: null,
        currentPose: this.lastResolved
      };
    }

    this.missingCount = 0;
    this.lastResolved = resolved;
    this.normalizedFrames.push(normalizePoseFrame(resolved));

    if (this.normalizedFrames.length > SEQUENCE_LENGTH) {
      this.normalizedFrames.shift();
    }

    const features = buildFeatureSequence(this.normalizedFrames);
    return {
      tracking: true,
      ready: this.normalizedFrames.length >= SEQUENCE_LENGTH,
      features,
      basis: this.normalizedFrames[this.normalizedFrames.length - 1]?.basis ?? null,
      currentPose: resolved
    };
  }
}
