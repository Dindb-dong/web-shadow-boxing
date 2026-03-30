import type { Vec3 } from "../types/game";

/** Creates a vector instance from coordinates. */
export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

/** Adds two vectors component-wise. */
export function addVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** Subtracts one vector from another. */
export function subVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** Multiplies a vector by a scalar. */
export function scaleVec3(a: Vec3, scale: number): Vec3 {
  return { x: a.x * scale, y: a.y * scale, z: a.z * scale };
}

/** Returns the midpoint between two vectors. */
export function midpointVec3(a: Vec3, b: Vec3): Vec3 {
  return scaleVec3(addVec3(a, b), 0.5);
}

/** Computes Euclidean length. */
export function lengthVec3(a: Vec3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

/** Computes distance between vectors. */
export function distanceVec3(a: Vec3, b: Vec3): number {
  return lengthVec3(subVec3(a, b));
}

/** Clamps a numeric value into an interval. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Applies linear interpolation. */
export function lerp(start: number, end: number, alpha: number): number {
  return start + (end - start) * alpha;
}

/** Interpolates between vectors. */
export function lerpVec3(start: Vec3, end: Vec3, alpha: number): Vec3 {
  return {
    x: lerp(start.x, end.x, alpha),
    y: lerp(start.y, end.y, alpha),
    z: lerp(start.z, end.z, alpha)
  };
}

/** Checks if an unknown value matches a Vec3-like object. */
export function isVec3(value: unknown): value is Vec3 {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.x === "number" && typeof candidate.y === "number" && typeof candidate.z === "number";
}
