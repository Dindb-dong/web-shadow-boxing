import type { Basis, Vec3, WristPairTrajectory } from "../types/game";
import { denormalizePoint } from "../pose/featureEngineering";
import { clamp, distanceVec3, lerp } from "../utils/vector";

const WORLD_X_SCALE = 2.8;
const WORLD_Y_SCALE = 2.1;
const WORLD_Z_SCALE = 3.1;
const WORLD_Y_OFFSET = 1.45;
const WORLD_Z_OFFSET = -0.8;
const THREAT_GUARD_PLANE_Z = -0.96;
const THREAT_FACE_PLANE_Z = -1.84;
const THREAT_FACE_Y = 1.78;
const THREAT_REACH_MIN = 0.5;
const THREAT_REACH_RANGE = 0.3;
const THREAT_X_COMPRESSION = 0.16;
const THREAT_Y_PULL = 0.42;

/** Moves denormalized user-body coordinates into the stylized Three.js combat space. */
export function mapBodyPointToWorld(point: Vec3): Vec3 {
  return {
    x: -point.x * WORLD_X_SCALE,
    y: point.y * WORLD_Y_SCALE + WORLD_Y_OFFSET,
    z: -point.z * WORLD_Z_SCALE + WORLD_Z_OFFSET
  };
}

/** Estimates how far a normalized wrist has progressed from guard toward a punch extension. */
function computeThreatReach(step: Vec3, wristIndex: number, stepIndex: number, stepCount: number): number {
  const shoulderAnchor: Vec3 = wristIndex === 0 ? { x: -0.5, y: 0, z: 0 } : { x: 0.5, y: 0, z: 0 };
  const extension = distanceVec3(step, shoulderAnchor);
  const extensionAlpha = clamp((extension - THREAT_REACH_MIN) / THREAT_REACH_RANGE, 0, 1);
  const horizonAlpha = stepCount <= 1 ? 1 : stepIndex / (stepCount - 1);
  return clamp(extensionAlpha * 0.78 + horizonAlpha * 0.22, 0, 1);
}

/** Restores model output and projects punch threats into opponent-facing world space. */
export function trajectoryToWorld(traj: WristPairTrajectory, basis: Basis): WristPairTrajectory {
  return traj.map((wristSteps, wristIndex) =>
    wristSteps.map((step, stepIndex) => {
      const worldPoint = mapBodyPointToWorld(denormalizePoint(step, basis));
      const reachAlpha = computeThreatReach(step, wristIndex, stepIndex, wristSteps.length);
      const lateralCompression = lerp(1, THREAT_X_COMPRESSION, reachAlpha);

      return {
        x: worldPoint.x * lateralCompression,
        y: lerp(worldPoint.y, THREAT_FACE_Y, reachAlpha * THREAT_Y_PULL),
        z: lerp(THREAT_GUARD_PLANE_Z, THREAT_FACE_PLANE_Z, reachAlpha)
      };
    })
  ) as WristPairTrajectory;
}
