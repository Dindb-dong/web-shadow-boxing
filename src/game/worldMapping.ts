import type { Basis, Vec3, WristPairTrajectory } from "../types/game";
import { denormalizePoint } from "../pose/featureEngineering";

const WORLD_X_SCALE = 2.8;
const WORLD_Y_SCALE = 2.1;
const WORLD_Z_SCALE = 3.1;
const WORLD_Y_OFFSET = 1.45;
const WORLD_Z_OFFSET = -0.8;

/** Moves denormalized user-body coordinates into the stylized Three.js combat space. */
export function mapBodyPointToWorld(point: Vec3): Vec3 {
  return {
    x: point.x * WORLD_X_SCALE,
    y: point.y * WORLD_Y_SCALE + WORLD_Y_OFFSET,
    z: -point.z * WORLD_Z_SCALE + WORLD_Z_OFFSET
  };
}

/** Restores model output into current body space and then into scene world space. */
export function trajectoryToWorld(traj: WristPairTrajectory, basis: Basis): WristPairTrajectory {
  return traj.map((wristSteps) =>
    wristSteps.map((step) => mapBodyPointToWorld(denormalizePoint(step, basis)))
  ) as WristPairTrajectory;
}
