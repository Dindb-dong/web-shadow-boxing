import { PREDICTION_HORIZON } from "../game/constants";
import { AttackDetector } from "../logic/AttackDetector";
import type { FeatureSequence, ModelOutput, StateName, Vec3, WristPairTrajectory, WristTrajectory } from "../types/game";
import { lerpVec3, scaleVec3, vec3 } from "../utils/vector";

/** Describes the predictor contract used by the game controller. */
export interface TrajectoryPredictor {
  predict(sequence: FeatureSequence): Promise<ModelOutput>;
  readonly mode: "mock" | "real";
}

function toVec3(values: number[]): Vec3 {
  return { x: values[0] ?? 0, y: values[1] ?? 0, z: values[2] ?? 0 };
}

function computeFuturePath(position: Vec3, velocity: Vec3, acceleration: Vec3): WristTrajectory {
  const steps: Vec3[] = [];

  for (let index = 1; index <= PREDICTION_HORIZON; index += 1) {
    const horizon = index;
    steps.push({
      x: position.x + velocity.x * horizon + 0.5 * acceleration.x * horizon * horizon,
      y: position.y + velocity.y * horizon + 0.5 * acceleration.y * horizon * horizon,
      z: position.z + velocity.z * horizon + 0.5 * acceleration.z * horizon * horizon
    });
  }

  return steps as WristTrajectory;
}

/** Produces Step 3-compatible predictions from recent feature vectors without a trained model. */
export class MockPredictor implements TrajectoryPredictor {
  readonly mode = "mock" as const;
  private readonly attackDetector = new AttackDetector();
  private sampleTick = 0;
  private state: StateName = "idle";
  private lockedThrust: { left: Vec3; right: Vec3 } | null = null;

  /** Synthesizes state classification and future wrist trajectories from recent velocities. */
  async predict(sequence: FeatureSequence): Promise<ModelOutput> {
    const current = sequence[sequence.length - 1];

    if (!current) {
      return {
        state_idx: 0,
        state_name: "idle",
        attacking_prob: 0,
        traj: [
          [vec3(), vec3(), vec3(), vec3(), vec3(), vec3()],
          [vec3(), vec3(), vec3(), vec3(), vec3(), vec3()]
        ],
        raw: { reason: "empty-sequence" }
      };
    }

    this.sampleTick += 1;
    const leftPosition = toVec3(current.slice(18, 21));
    const leftVelocity = toVec3(current.slice(21, 24));
    const leftAcceleration = toVec3(current.slice(24, 27));
    const leftShoulder = toVec3(current.slice(0, 3));
    const rightPosition = toVec3(current.slice(45, 48));
    const rightVelocity = toVec3(current.slice(48, 51));
    const rightAcceleration = toVec3(current.slice(51, 54));
    const rightShoulder = toVec3(current.slice(27, 30));

    const attack = this.attackDetector.update({
      timestamp: this.sampleTick,
      leftShoulder,
      leftWrist: leftPosition,
      rightShoulder,
      rightWrist: rightPosition
    });
    const stateName = attack.state;
    if (this.state === "idle" && stateName === "attacking") {
      this.lockedThrust = {
        left: { ...leftVelocity },
        right: { ...rightVelocity }
      };
    } else if (stateName === "idle") {
      this.lockedThrust = null;
    }
    this.state = stateName;

    const leftLaunchVelocity = this.lockedThrust ? lerpVec3(leftVelocity, this.lockedThrust.left, 0.7) : leftVelocity;
    const rightLaunchVelocity = this.lockedThrust ? lerpVec3(rightVelocity, this.lockedThrust.right, 0.7) : rightVelocity;
    const leftDeceleration = stateName === "attacking" ? scaleVec3(leftLaunchVelocity, -0.22) : vec3();
    const rightDeceleration = stateName === "attacking" ? scaleVec3(rightLaunchVelocity, -0.22) : vec3();
    const leftPredictAcceleration = {
      x: leftAcceleration.x + leftDeceleration.x,
      y: leftAcceleration.y + leftDeceleration.y,
      z: leftAcceleration.z + leftDeceleration.z
    };
    const rightPredictAcceleration = {
      x: rightAcceleration.x + rightDeceleration.x,
      y: rightAcceleration.y + rightDeceleration.y,
      z: rightAcceleration.z + rightDeceleration.z
    };

    const attackingProb = attack.probability;
    const stateIdx = stateName === "attacking" ? 1 : 0;
    const traj: WristPairTrajectory = [
      computeFuturePath(leftPosition, leftLaunchVelocity, leftPredictAcceleration),
      computeFuturePath(rightPosition, rightLaunchVelocity, rightPredictAcceleration)
    ];

    return {
      state_idx: stateIdx,
      state_name: stateName,
      attacking_prob: attackingProb,
      traj,
      raw: {
        attackScore: attack.score,
        velocity: attack.velocity,
        forwardVelocity: attack.forwardVelocity,
        acceleration: attack.acceleration,
        extensionRate: attack.extensionRate,
        zDepthChange: attack.zDepthChange,
        thrustLocked: this.lockedThrust !== null
      }
    };
  }
}
