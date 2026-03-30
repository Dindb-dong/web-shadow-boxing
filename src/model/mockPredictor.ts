import { PREDICTION_HORIZON } from "../game/constants";
import type { FeatureSequence, ModelOutput, Vec3, WristPairTrajectory, WristTrajectory } from "../types/game";
import { clamp, vec3 } from "../utils/vector";

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
    const damping = 1 - (index - 1) * 0.08;
    steps.push({
      x: position.x + velocity.x * horizon + 0.5 * acceleration.x * horizon * horizon * damping,
      y: position.y + velocity.y * horizon + 0.5 * acceleration.y * horizon * horizon * damping,
      z: position.z + velocity.z * horizon + 0.5 * acceleration.z * horizon * horizon * damping
    });
  }

  return steps as WristTrajectory;
}

/** Produces Step 3-compatible predictions from recent feature vectors without a trained model. */
export class MockPredictor implements TrajectoryPredictor {
  readonly mode = "mock" as const;

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

    const leftPosition = toVec3(current.slice(18, 21));
    const leftVelocity = toVec3(current.slice(21, 24));
    const leftAcceleration = toVec3(current.slice(24, 27));
    const rightPosition = toVec3(current.slice(45, 48));
    const rightVelocity = toVec3(current.slice(48, 51));
    const rightAcceleration = toVec3(current.slice(51, 54));

    const forwardVelocity = Math.max(-leftVelocity.z, -rightVelocity.z, 0);
    const punchSpread = Math.max(Math.abs(leftPosition.x), Math.abs(rightPosition.x));
    const attackScore = forwardVelocity * 2.1 + punchSpread * 0.6 + Math.abs(leftAcceleration.z - rightAcceleration.z) * 0.4;
    const attackingProb = clamp(attackScore, 0, 1);
    const stateName = attackingProb >= 0.55 ? "attacking" : "idle";
    const stateIdx = stateName === "attacking" ? 1 : 0;
    const traj: WristPairTrajectory = [
      computeFuturePath(leftPosition, leftVelocity, leftAcceleration),
      computeFuturePath(rightPosition, rightVelocity, rightAcceleration)
    ];

    return {
      state_idx: stateIdx,
      state_name: stateName,
      attacking_prob: attackingProb,
      traj,
      raw: {
        forwardVelocity,
        punchSpread,
        attackScore
      }
    };
  }
}
