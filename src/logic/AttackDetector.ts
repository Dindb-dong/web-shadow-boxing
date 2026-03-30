import type { StateName, Vec3 } from "../types/game";
import { clamp, distanceVec3, lengthVec3, subVec3 } from "../utils/vector";

const DEFAULT_BUFFER_SIZE = 14;
const MIN_FEATURE_FRAMES = 10;
const ATTACK_ENTER_THRESHOLD = 0.8;
const ATTACK_EXIT_THRESHOLD = 0.3;

const ACCELERATION_REF = 0.018;
const EXTENSION_RATE_REF = 0.014;
const Z_DEPTH_RATE_REF = 0.012;
const VELOCITY_REF = 0.03;
const MIN_EXTENSION_FOR_ATTACK = 0.24;
const MIN_FORWARD_VELOCITY_FOR_ATTACK = 0.004;
const MIN_Z_DEPTH_RATE_FOR_ATTACK = 0.003;

interface AttackFrame {
  timestamp: number;
  leftShoulder: Vec3;
  leftWrist: Vec3;
  rightShoulder: Vec3;
  rightWrist: Vec3;
}

export interface AttackDetectorResult {
  state: StateName;
  probability: number;
  score: number;
  velocity: number;
  forwardVelocity: number;
  acceleration: number;
  extensionRate: number;
  zDepthChange: number;
}

/** Converts weighted attack evidence into a smooth 0..1 probability. */
function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

/** Tracks recent wrist kinematics and classifies attack-vs-idle with hysteresis thresholds. */
export class AttackDetector {
  private readonly buffer: AttackFrame[] = [];
  private state: StateName = "idle";

  constructor(private readonly maxBufferSize = DEFAULT_BUFFER_SIZE) {}

  /** Resets rolling history and returns the detector to idle state. */
  reset(): void {
    this.buffer.splice(0, this.buffer.length);
    this.state = "idle";
  }

  /** Ingests one pose frame and returns probability and hysteresis-stable attack state. */
  update(frame: AttackFrame): AttackDetectorResult {
    this.buffer.push(frame);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    if (this.buffer.length < MIN_FEATURE_FRAMES) {
      return {
        state: this.state,
        probability: 0,
        score: 0,
        velocity: 0,
        forwardVelocity: 0,
        acceleration: 0,
        extensionRate: 0,
        zDepthChange: 0
      };
    }

    const history = this.buffer.slice(-MIN_FEATURE_FRAMES);
    const leftVelocities: Vec3[] = [];
    const rightVelocities: Vec3[] = [];
    let velocitySum = 0;
    let forwardVelocitySum = 0;
    let extensionRateSum = 0;
    let zDepthChangeSum = 0;

    for (let index = 1; index < history.length; index += 1) {
      const previous = history[index - 1];
      const current = history[index];
      const leftVelocity = subVec3(current.leftWrist, previous.leftWrist);
      const rightVelocity = subVec3(current.rightWrist, previous.rightWrist);
      const previousLeftExtension = distanceVec3(previous.leftShoulder, previous.leftWrist);
      const previousRightExtension = distanceVec3(previous.rightShoulder, previous.rightWrist);
      const currentLeftExtension = distanceVec3(current.leftShoulder, current.leftWrist);
      const currentRightExtension = distanceVec3(current.rightShoulder, current.rightWrist);

      leftVelocities.push(leftVelocity);
      rightVelocities.push(rightVelocity);
      velocitySum += (lengthVec3(leftVelocity) + lengthVec3(rightVelocity)) * 0.5;
      forwardVelocitySum += (Math.max(-leftVelocity.z, 0) + Math.max(-rightVelocity.z, 0)) * 0.5;
      extensionRateSum +=
        (Math.max(currentLeftExtension - previousLeftExtension, 0) + Math.max(currentRightExtension - previousRightExtension, 0)) * 0.5;
      zDepthChangeSum +=
        (Math.max(previous.leftWrist.z - current.leftWrist.z, 0) + Math.max(previous.rightWrist.z - current.rightWrist.z, 0)) * 0.5;
    }

    let accelerationSum = 0;
    for (let index = 1; index < leftVelocities.length; index += 1) {
      const leftAcceleration = subVec3(leftVelocities[index], leftVelocities[index - 1]);
      const rightAcceleration = subVec3(rightVelocities[index], rightVelocities[index - 1]);
      accelerationSum += (lengthVec3(leftAcceleration) + lengthVec3(rightAcceleration)) * 0.5;
    }

    const velocity = velocitySum / Math.max(history.length - 1, 1);
    const forwardVelocity = forwardVelocitySum / Math.max(history.length - 1, 1);
    const acceleration = accelerationSum / Math.max(leftVelocities.length - 1, 1);
    const extensionRate = extensionRateSum / Math.max(history.length - 1, 1);
    const zDepthChange = zDepthChangeSum / Math.max(history.length - 1, 1);
    const latest = history[history.length - 1];
    const currentExtension =
      (distanceVec3(latest.leftShoulder, latest.leftWrist) + distanceVec3(latest.rightShoulder, latest.rightWrist)) * 0.5;

    const normalizedAcceleration = clamp(acceleration / ACCELERATION_REF, 0, 2);
    const normalizedDepth = clamp(zDepthChange / Z_DEPTH_RATE_REF, 0, 2);
    const normalizedExtension = clamp(extensionRate / EXTENSION_RATE_REF, 0, 2);
    const weightedSum = 1.4 * normalizedAcceleration + 1.1 * normalizedDepth + 1.0 * normalizedExtension;
    const velocityGate = clamp(velocity / VELOCITY_REF, 0, 1);
    const score = weightedSum * (0.35 + velocityGate * 0.65) - 1.45;
    let probability = clamp(sigmoid(score * 2.4), 0, 1);
    const weakForwardIntent = forwardVelocity < MIN_FORWARD_VELOCITY_FOR_ATTACK && zDepthChange < MIN_Z_DEPTH_RATE_FOR_ATTACK;

    if (currentExtension < MIN_EXTENSION_FOR_ATTACK) {
      probability = Math.min(probability, 0.18);
    }
    if (weakForwardIntent) {
      probability = Math.min(probability, 0.22);
    }
    if (velocity < 0.01) {
      probability = Math.min(probability, 0.16);
    }

    if (
      this.state === "idle" &&
      probability >= ATTACK_ENTER_THRESHOLD &&
      !weakForwardIntent &&
      currentExtension >= MIN_EXTENSION_FOR_ATTACK
    ) {
      this.state = "attacking";
    } else if (
      this.state === "attacking" &&
      (probability <= ATTACK_EXIT_THRESHOLD || (weakForwardIntent && probability <= 0.45))
    ) {
      this.state = "idle";
    }

    return {
      state: this.state,
      probability,
      score,
      velocity,
      forwardVelocity,
      acceleration,
      extensionRate,
      zDepthChange
    };
  }
}
