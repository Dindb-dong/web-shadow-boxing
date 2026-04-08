import { FEATURE_DIMENSION, MAX_TRACKING_GAP, SEQUENCE_LENGTH } from "../game/constants";
import type {
  Basis,
  FeatureSequence,
  NormalizedPoseFrame,
  PoseFrame,
  ResolvedPoseFrame,
  Vec3
} from "../types/game";
import { distanceVec3, midpointVec3, scaleVec3, subVec3, vec3 } from "../utils/vector";

const POSE_SMOOTHING_BETA = 0.3;
const RECENT_POSES_MAXLEN = 3;

const ARM_POINT_KEYS = [
  "leftShoulder",
  "leftElbow",
  "leftWrist",
  "rightShoulder",
  "rightElbow",
  "rightWrist"
] as const;

/** Returns a fully-populated pose frame only when all six boxer_ai joints are available. */
export function resolvePoseFrame(frame: PoseFrame | null): ResolvedPoseFrame | null {
  if (
    !frame?.nose ||
    !frame.leftShoulder ||
    !frame.leftElbow ||
    !frame.leftWrist ||
    !frame.rightShoulder ||
    !frame.rightElbow ||
    !frame.rightWrist
  ) {
    return null;
  }

  return {
    timestamp: frame.timestamp,
    nose: frame.nose,
    leftShoulder: frame.leftShoulder,
    leftElbow: frame.leftElbow,
    leftWrist: frame.leftWrist,
    rightShoulder: frame.rightShoulder,
    rightElbow: frame.rightElbow,
    rightWrist: frame.rightWrist,
    interpolated: false
  };
}

/** Computes boxer_ai normalization basis from the current shoulder geometry. */
export function createBasis(frame: ResolvedPoseFrame): Basis {
  return {
    shoulderCenter: midpointVec3(frame.leftShoulder, frame.rightShoulder),
    shoulderScale: Math.max(distanceVec3(frame.leftShoulder, frame.rightShoulder), 1e-6)
  };
}

/** Normalizes one point around the shoulder center and shoulder distance. */
export function normalizePoint(point: Vec3, basis: Basis): Vec3 {
  return scaleVec3(subVec3(point, basis.shoulderCenter), 1 / basis.shoulderScale);
}

/** Restores a normalized point back into raw pose space. */
export function denormalizePoint(point: Vec3, basis: Basis): Vec3 {
  return {
    x: point.x * basis.shoulderScale + basis.shoulderCenter.x,
    y: point.y * basis.shoulderScale + basis.shoulderCenter.y,
    z: point.z * basis.shoulderScale + basis.shoulderCenter.z
  };
}

/** Converts the current resolved pose into boxer_ai normalized coordinates. */
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
    interpolated: false
  };
}

/** Applies boxer_ai EMA smoothing after normalization. */
export function smoothPoseFrame(
  current: NormalizedPoseFrame,
  previous: NormalizedPoseFrame,
  beta = POSE_SMOOTHING_BETA
): NormalizedPoseFrame {
  if (beta < 0 || beta > 1) {
    throw new Error("Pose smoothing beta must stay between 0 and 1.");
  }

  const smoothJoint = (currentJoint: Vec3, previousJoint: Vec3): Vec3 => ({
    x: beta * previousJoint.x + (1 - beta) * currentJoint.x,
    y: beta * previousJoint.y + (1 - beta) * currentJoint.y,
    z: beta * previousJoint.z + (1 - beta) * currentJoint.z
  });

  return {
    ...current,
    nose: smoothJoint(current.nose, previous.nose),
    leftShoulder: smoothJoint(current.leftShoulder, previous.leftShoulder),
    leftElbow: smoothJoint(current.leftElbow, previous.leftElbow),
    leftWrist: smoothJoint(current.leftWrist, previous.leftWrist),
    rightShoulder: smoothJoint(current.rightShoulder, previous.rightShoulder),
    rightElbow: smoothJoint(current.rightElbow, previous.rightElbow),
    rightWrist: smoothJoint(current.rightWrist, previous.rightWrist)
  };
}

/** Builds one boxer_ai feature frame from the latest 1-3 normalized poses. */
export function buildFeatureFrame(recentPoses: NormalizedPoseFrame[]): number[] {
  if (recentPoses.length === 0) {
    throw new Error("At least one normalized pose is required to build a feature frame.");
  }

  const poses = recentPoses.slice(-RECENT_POSES_MAXLEN);
  const current = poses[poses.length - 1];
  const previous = poses[poses.length - 2] ?? null;
  const prePrevious = poses[poses.length - 3] ?? null;
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

/** Clamps a feature stream to the latest boxer_ai inference window. */
export function buildFeatureSequence(featureFrames: FeatureSequence): FeatureSequence {
  return featureFrames.slice(-SEQUENCE_LENGTH);
}

/** Maintains boxer_ai's rolling pose history and 12-step feature window. */
export class PoseSequenceBuffer {
  private readonly recentPoses: NormalizedPoseFrame[] = [];
  private readonly recentFeatures: FeatureSequence = [];
  private missingCount = 0;

  /** Pushes a raw frame and returns the model-ready feature window when available. */
  push(frame: PoseFrame | null): {
    tracking: boolean;
    ready: boolean;
    features: FeatureSequence;
    basis: Basis | null;
    currentPose: ResolvedPoseFrame | null;
  } {
    const resolved = resolvePoseFrame(frame);
    if (!resolved) {
      this.missingCount += 1;
      return {
        tracking: this.recentFeatures.length > 0 && this.missingCount <= MAX_TRACKING_GAP,
        ready: false,
        features: [],
        basis: null,
        currentPose: null
      };
    }

    this.missingCount = 0;
    const basis = createBasis(resolved);
    const normalized = normalizePoseFrame(resolved);
    const smoothed =
      this.recentPoses.length > 0
        ? smoothPoseFrame(normalized, this.recentPoses[this.recentPoses.length - 1])
        : normalized;

    this.recentPoses.push(smoothed);
    if (this.recentPoses.length > RECENT_POSES_MAXLEN) {
      this.recentPoses.shift();
    }

    this.recentFeatures.push(buildFeatureFrame(this.recentPoses));
    if (this.recentFeatures.length > SEQUENCE_LENGTH) {
      this.recentFeatures.shift();
    }

    return {
      tracking: true,
      ready: this.recentFeatures.length >= SEQUENCE_LENGTH,
      features: buildFeatureSequence(this.recentFeatures),
      basis,
      currentPose: resolved
    };
  }

  /** Clears rolling pose/features so a new match starts from a clean sequence window. */
  reset(): void {
    this.recentPoses.length = 0;
    this.recentFeatures.length = 0;
    this.missingCount = 0;
  }
}

export { FEATURE_DIMENSION };
