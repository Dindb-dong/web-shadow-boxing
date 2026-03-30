import { PREDICTION_HORIZON } from "../game/constants";
import type { ModelOutput, StateName, Vec3, WristPairTrajectory, WristTrajectory } from "../types/game";
import { clamp, isVec3 } from "../utils/vector";

function isStateName(value: unknown): value is StateName {
  return value === "idle" || value === "attacking";
}

function isTrajectoryStepList(value: unknown): value is Vec3[] {
  return Array.isArray(value) && value.length === PREDICTION_HORIZON && value.every((step) => isVec3(step));
}

/** Validates and normalizes arbitrary model output into the Step 3 contract. */
export function adaptModelOutput(candidate: unknown): ModelOutput | null {
  if (typeof candidate !== "object" || candidate === null) {
    return null;
  }

  const value = candidate as Record<string, unknown>;
  const { state_idx, state_name, attacking_prob, traj } = value;

  if (typeof state_idx !== "number" || !isStateName(state_name) || typeof attacking_prob !== "number") {
    return null;
  }

  if (!Array.isArray(traj) || traj.length !== 2 || !isTrajectoryStepList(traj[0]) || !isTrajectoryStepList(traj[1])) {
    return null;
  }

  const wristPairTrajectory: WristPairTrajectory = [
    traj[0] as WristTrajectory,
    traj[1] as WristTrajectory
  ];

  return {
    state_idx,
    state_name,
    attacking_prob: clamp(attacking_prob, 0, 1),
    traj: wristPairTrajectory,
    raw: value.raw ?? candidate
  };
}

/** Returns whether the current model output should be treated as an active threat. */
export function isThreateningOutput(output: ModelOutput, threshold: number): boolean {
  return output.attacking_prob >= threshold;
}
