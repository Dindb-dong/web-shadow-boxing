import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DODGE_DURATION_MS } from "../game/constants";
import type { CounterMove, DodgeType, GuardResult, Vec3, WristPairTrajectory, WristTrajectory } from "../types/game";

const COUNTER_ANIMATION_MS = 540;
const VICTORY_ANIMATION_MS = 1100;
const THREAT_IMPACT_POOL_SIZE = 14;
const THREAT_IMPACT_DURATION_MS = 320;
const THREAT_FLASH_BASE_OPACITY = 0.92;
const THREAT_RING_BASE_OPACITY = 0.82;
const THREAT_SPARK_BASE_OPACITY = 0.9;
const FIGHTER_ASSET_PATH = "/assets/characters3d.com - Titan Boxer.glb";

interface PunchPose {
  leadX: number;
  leadY: number;
  leadZ: number;
  rearX: number;
  rearY: number;
  rearZ: number;
  leadShoulderX: number;
  leadShoulderY: number;
  leadShoulderZ: number;
  rearShoulderX: number;
  rearShoulderY: number;
  rearShoulderZ: number;
  torsoYaw: number;
  torsoRoll: number;
  torsoPitch: number;
  torsoDriveX: number;
  torsoDriveY: number;
  torsoDriveZ: number;
}

interface DodgeMotion {
  leftWristOffset: Vec3;
  rightWristOffset: Vec3;
  rootPosition: Vec3;
  rootRotation: Vec3;
  torsoPosition: Vec3;
  torsoRotation: Vec3;
}

interface AimBlendWeights {
  x: number;
  y: number;
  z: number;
}

export interface ArmRigPose {
  leftShoulder: Vec3;
  rightShoulder: Vec3;
  leftElbow: Vec3;
  rightElbow: Vec3;
  leftWrist: Vec3;
  rightWrist: Vec3;
}

interface ArmRigProfile {
  leftShoulder: Vec3;
  rightShoulder: Vec3;
  leftGuard: Vec3;
  rightGuard: Vec3;
  leftFallen: Vec3;
  rightFallen: Vec3;
}

interface BonePoseState {
  bone: THREE.Bone;
  restQuaternion: THREE.Quaternion;
  restDirectionParent: THREE.Vector3;
}

interface FingerCurlState {
  bone: THREE.Bone;
  restQuaternion: THREE.Quaternion;
  restScale: THREE.Vector3;
}

interface ArmBoneChain {
  shoulder: BonePoseState;
  upperArm: BonePoseState;
  lowerArm: BonePoseState;
  hand: BonePoseState;
  fingerCurlBones: FingerCurlState[];
  upperLength: number;
  lowerLength: number;
  side: -1 | 1;
}

interface RiggedAvatarState {
  fighter: THREE.Object3D;
  head: THREE.Bone;
  leftArm: ArmBoneChain;
  rightArm: ArmBoneChain;
}

interface ArmViewOrder {
  screenLeftFrom: "left" | "right";
  screenRightFrom: "left" | "right";
}

export interface ArmRigInputs {
  idleSwing: number;
  idleDip: number;
  dodgeType: DodgeType | null;
  dodgeProgress: number;
  counterMove: CounterMove | null;
  counterProgress: number;
  targetLocal: Vec3 | null;
  victoryProgress: number | null;
}

interface ThreatImpactSpark {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  angle: number;
}

interface ThreatImpactSlot {
  group: THREE.Group;
  flash: THREE.Mesh;
  flashMaterial: THREE.MeshBasicMaterial;
  ring: THREE.Mesh;
  ringMaterial: THREE.MeshBasicMaterial;
  sparks: ThreatImpactSpark[];
  active: boolean;
  startedAt: number;
  expiresAt: number;
  spinOffset: number;
}

interface ArmRigVisual {
  shoulder: THREE.Mesh;
  upperArm: THREE.Mesh;
  elbow: THREE.Mesh;
  forearm: THREE.Mesh;
}

/** Smoothly accelerates and decelerates lightweight combat motions. */
function easeInOutSine(value: number): number {
  return -(Math.cos(Math.PI * value) - 1) / 2;
}

/** Clamps a normalized interpolation value into the safe 0-1 range. */
function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1);
}

/** Returns a single 0-1-0 pulse with a configurable peak point. */
function resolvePulse(progress: number, peakAt = 0.5): number {
  const clamped = clamp01(progress);
  if (clamped <= peakAt) {
    return easeInOutSine(clamped / Math.max(peakAt, 1e-4));
  }

  return 1 - easeInOutSine((clamped - peakAt) / Math.max(1 - peakAt, 1e-4));
}

/** Returns a smooth ramp that stays flat, then rises toward the end of the motion. */
function resolveLateRise(progress: number, startAt: number): number {
  if (progress <= startAt) {
    return 0;
  }

  return easeInOutSine(clamp01((progress - startAt) / Math.max(1 - startAt, 1e-4)));
}

export interface FingerCurlPose {
  x: number;
  y: number;
  z: number;
  scale: number;
}

export interface HandPose {
  x: number;
  y: number;
  z: number;
}

/** Scores one wrist path so rendering can prefer the hand that actually threw the punch. */
function scoreThreatPath(path: WristTrajectory): number {
  let pathLength = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    pathLength += Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
  }

  const start = path[0];
  const end = path[path.length - 1];
  const displacement = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
  const faceProgress = Math.max(0, start.z - end.z);

  return pathLength * 1.1 + displacement * 0.9 + faceProgress * 0.7;
}

/** Chooses the single wrist path that should be visualized for the current punch. */
export function resolveRenderableThreatPath(traj: WristPairTrajectory): WristTrajectory {
  const [leftPath, rightPath] = traj;
  return scoreThreatPath(leftPath) >= scoreThreatPath(rightPath) ? leftPath : rightPath;
}

/** Returns the final contact point for the dominant punch path so impact FX can burst there. */
export function resolveThreatImpactPoint(traj: WristPairTrajectory): Vec3 {
  const path = resolveRenderableThreatPath(traj);
  const impactPoint = path[path.length - 1];
  return {
    x: impactPoint.x,
    y: impactPoint.y,
    z: impactPoint.z
  };
}

/** Converts a dodge type to a signed lateral direction. */
function resolveDodgeSide(type: DodgeType): -1 | 1 {
  return type.startsWith("left") ? -1 : 1;
}

/** Returns a lightly animated boxing guard position for one glove. */
function resolveGuardWrist(side: -1 | 1, idleSwing: number, idleDip: number, profile: ArmRigProfile): Vec3 {
  const base = side < 0 ? profile.leftGuard : profile.rightGuard;
  return {
    x: base.x + idleSwing * 0.014 + side * idleDip * 0.008,
    y: base.y + idleDip * 0.016 + Math.abs(idleSwing) * 0.005,
    z: base.z + Math.abs(idleSwing) * 0.02
  };
}

/** Linearly interpolates between two Vec3 values. */
function lerpVec3(start: Vec3, end: Vec3, alpha: number): Vec3 {
  return {
    x: THREE.MathUtils.lerp(start.x, end.x, alpha),
    y: THREE.MathUtils.lerp(start.y, end.y, alpha),
    z: THREE.MathUtils.lerp(start.z, end.z, alpha)
  };
}

/** Offsets a Vec3 without mutating the source object. */
function offsetVec3(source: Vec3, offset: Partial<Vec3>): Vec3 {
  return {
    x: source.x + (offset.x ?? 0),
    y: source.y + (offset.y ?? 0),
    z: source.z + (offset.z ?? 0)
  };
}

/** Blends each axis independently so punch shape survives target steering. */
function blendVec3ByAxis(start: Vec3, end: Vec3, alpha: number, weights: AimBlendWeights): Vec3 {
  return {
    x: THREE.MathUtils.lerp(start.x, end.x, alpha * weights.x),
    y: THREE.MathUtils.lerp(start.y, end.y, alpha * weights.y),
    z: THREE.MathUtils.lerp(start.z, end.z, alpha * weights.z)
  };
}

const DEFAULT_ARM_RIG_PROFILE: ArmRigProfile = {
  leftShoulder: { x: -0.42, y: 1.22, z: -1.86 },
  rightShoulder: { x: 0.42, y: 1.22, z: -1.86 },
  leftGuard: { x: -0.4, y: 1.32, z: -1.5 },
  rightGuard: { x: 0.4, y: 1.32, z: -1.5 },
  leftFallen: { x: -0.58, y: 0.7, z: -1.06 },
  rightFallen: { x: 0.2, y: 0.38, z: -0.92 }
};

/** Derives shoulder and glove anchors from the loaded static fighter mesh bounds. */
function createArmRigProfileFromBounds(bounds: THREE.Box3): ArmRigProfile {
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const shoulderY = bounds.min.y + size.y * 0.78;
  const guardY = bounds.min.y + size.y * 0.865;
  const fallenY = bounds.min.y + size.y * 0.46;
  const shoulderZ = bounds.min.z + size.z * 0.56;
  const guardZ = bounds.max.z + size.z * 0.08;

  return {
    leftShoulder: { x: center.x - size.x * 0.26, y: shoulderY, z: shoulderZ },
    rightShoulder: { x: center.x + size.x * 0.26, y: shoulderY, z: shoulderZ },
    leftGuard: { x: center.x - size.x * 0.18, y: guardY, z: guardZ },
    rightGuard: { x: center.x + size.x * 0.18, y: guardY, z: guardZ },
    leftFallen: { x: center.x - size.x * 0.26, y: fallenY, z: bounds.max.z + size.z * 0.34 },
    rightFallen: { x: center.x + size.x * 0.09, y: bounds.min.y + size.y * 0.36, z: bounds.max.z + size.z * 0.52 }
  };
}

/** Solves the elbow position for a two-bone limb that bends toward a pole direction. */
export function solveLimbJoint(
  shoulder: Vec3,
  target: Vec3,
  upperLength: number,
  lowerLength: number,
  poleDirection: Vec3
): Vec3 {
  const shoulderVec = new THREE.Vector3(shoulder.x, shoulder.y, shoulder.z);
  const targetVec = new THREE.Vector3(target.x, target.y, target.z);
  const toTarget = new THREE.Vector3().subVectors(targetVec, shoulderVec);
  const distance = THREE.MathUtils.clamp(toTarget.length(), 1e-4, Math.max(upperLength + lowerLength - 1e-4, 1e-4));
  const forward = toTarget.normalize();
  const pole = new THREE.Vector3(poleDirection.x, poleDirection.y, poleDirection.z);
  pole.addScaledVector(forward, -forward.dot(pole));

  if (pole.lengthSq() <= 1e-6) {
    pole.set(0, 0, 1).addScaledVector(forward, -forward.z);
    if (pole.lengthSq() <= 1e-6) {
      pole.set(1, 0, 0).addScaledVector(forward, -forward.x);
    }
  }

  pole.normalize();
  const shoulderReach = (upperLength * upperLength - lowerLength * lowerLength + distance * distance) / (2 * distance);
  const bendHeight = Math.sqrt(Math.max(upperLength * upperLength - shoulderReach * shoulderReach, 0));
  const elbow = shoulderVec
    .clone()
    .addScaledVector(forward, shoulderReach)
    .addScaledVector(pole, bendHeight);

  return { x: elbow.x, y: elbow.y, z: elbow.z };
}

/** Maps anatomical rig labels onto the actual screen-left / screen-right ordering. */
export function resolveArmViewOrder(anatomicalLeftX: number, anatomicalRightX: number): ArmViewOrder {
  if (anatomicalLeftX <= anatomicalRightX) {
    return {
      screenLeftFrom: "left",
      screenRightFrom: "right"
    };
  }

  return {
    screenLeftFrom: "right",
    screenRightFrom: "left"
  };
}

/** Biases a world-space target slightly toward the viewer so fists stay in front of the face. */
export function biasTargetTowardViewer(target: Vec3, viewer: Vec3, distance: number): Vec3 {
  const direction = new THREE.Vector3(viewer.x - target.x, viewer.y - target.y, viewer.z - target.z);
  if (direction.lengthSq() <= 1e-6 || distance <= 0) {
    return { ...target };
  }

  direction.normalize().multiplyScalar(distance);
  return {
    x: target.x + direction.x,
    y: target.y + direction.y,
    z: target.z + direction.z
  };
}

/** Keeps a guard anchor on its own side of the face so the forearms do not cross at rest. */
export function resolveGuardAnchorX(shoulderX: number, headX: number, side: -1 | 1): number {
  if (side < 0) {
    return Math.min(headX - 0.36, shoulderX + 0.44);
  }

  return Math.max(headX + 0.36, shoulderX - 0.44);
}

/** Pushes the raised guard in front of the face rather than letting it collapse into the skull plane. */
export function resolveGuardAnchorZ(headZ: number): number {
  return headZ + 0.22;
}

/** Keeps the guard closer to chin height so the gloves do not float too high. */
export function resolveGuardAnchorY(headY: number): number {
  return headY - 0.36;
}

/** Twists the arms inward so the palms face the avatar's own face in guard. */
export function resolveArmInwardTwist(side: -1 | 1): number {
  return -side * 0.34;
}

/** Returns a lowered elbow pole so the guard reads wide at the elbows but tight at the fists. */
export function resolveElbowPole(side: -1 | 1): Vec3 {
  return {
    x: side * 0.58,
    y: -1.38,
    z: 0.2
  };
}

/** Returns one named bone when the loaded humanoid skeleton contains the requested suffix. */
function findBoneBySuffix(root: THREE.Object3D, suffix: string): THREE.Bone | null {
  let found: THREE.Bone | null = null;
  root.traverse((child) => {
    if (!found && child instanceof THREE.Bone && child.name.endsWith(suffix)) {
      found = child;
    }
  });
  return found;
}

/** Captures one bone's bind-pose orientation so runtime animation can stay relative to the imported rig. */
function captureBonePoseState(bone: THREE.Bone, child: THREE.Object3D): BonePoseState {
  const restQuaternion = bone.quaternion.clone();
  const restDirectionParent = child.position.clone().normalize().applyQuaternion(restQuaternion);
  return {
    bone,
    restQuaternion,
    restDirectionParent
  };
}

/** Captures the finger joints used to fake a closed fist over the imported hand. */
function captureFingerCurlStates(root: THREE.Object3D, prefix: "L" | "R"): FingerCurlState[] {
  const suffixes = [
    `${prefix}_Index_Proximal`,
    `${prefix}_Index_Intermediate`,
    `${prefix}_Index_Distal`,
    `${prefix}_Middle_Proximal`,
    `${prefix}_Middle_Intermediate`,
    `${prefix}_Middle_Distal`,
    `${prefix}_Ring_Proximal`,
    `${prefix}_Ring_Intermediate`,
    `${prefix}_Ring_Distal`,
    `${prefix}_Little_Proximal`,
    `${prefix}_Little_Intermediate`,
    `${prefix}_Little_Distal`,
    `${prefix}_Pinky_Proximal`,
    `${prefix}_Pinky_Intermediate`,
    `${prefix}_Pinky_Distal`,
    `${prefix}_Thumb_Proximal`,
    `${prefix}_Thumb_Intermediate`,
    `${prefix}_Thumb_Distal`
  ];

  return suffixes
    .map((suffix) => findBoneBySuffix(root, suffix))
    .filter((bone): bone is THREE.Bone => bone !== null)
    .map((bone) => ({
      bone,
      restQuaternion: bone.quaternion.clone(),
      restScale: bone.scale.clone()
    }));
}

/** Reads one left/right arm chain from the humanoid skeleton. */
function captureArmBoneChain(root: THREE.Object3D, side: -1 | 1): ArmBoneChain | null {
  const prefix = side < 0 ? "L" : "R";
  const shoulder = findBoneBySuffix(root, `${prefix}_Shoulder`);
  const upperArm = findBoneBySuffix(root, `${prefix}_Upper_Arm`);
  const lowerArm = findBoneBySuffix(root, `${prefix}_Lower_Arm`);
  const hand = findBoneBySuffix(root, `${prefix}_Hand`);
  if (!shoulder || !upperArm || !lowerArm || !hand) {
    return null;
  }

  return {
    shoulder: captureBonePoseState(shoulder, upperArm),
    upperArm: captureBonePoseState(upperArm, lowerArm),
    lowerArm: captureBonePoseState(lowerArm, hand),
    hand: {
      bone: hand,
      restQuaternion: hand.quaternion.clone(),
      restDirectionParent: new THREE.Vector3(0, 1, 0)
    },
    fingerCurlBones: captureFingerCurlStates(root, prefix),
    upperLength: lowerArm.position.length(),
    lowerLength: hand.position.length(),
    side
  };
}

/** Returns the imported finger curl offsets needed for a tighter boxing fist pose. */
export function resolveFingerCurlPose(boneName: string, side: -1 | 1): FingerCurlPose {
  const isThumb = boneName.includes("Thumb");
  const isPinky = boneName.includes("Pinky") || boneName.includes("Little");
  const isProximal = boneName.includes("Proximal");
  const isIntermediate = boneName.includes("Intermediate");

  if (isThumb) {
    // The Titan Boxer thumb reads best when it curls sideways across the fist,
    // not when it points upward or drops straight down.
    return {
      x: isProximal ? -0.8 : isIntermediate ? 0.58 : 0.34,
      y: side * (isProximal ? 0.34 : isIntermediate ? 0.24 : 0.08),
      z: side * (isProximal ? 0.02 : isIntermediate ? 0.02 : 0.01),
      scale: isProximal ? 0.84 : isIntermediate ? 0.88 : 0.93
    };
  }

  const baseX = isPinky ? (isProximal ? 2.08 : isIntermediate ? 1.52 : 1.24) : isProximal ? 1.68 : isIntermediate ? 1.1 : 0.88;
  return {
    x: baseX,
    y: isPinky ? side * 0.12 : 0,
    z: isPinky ? side * -0.34 : 0,
    scale: isPinky ? 0.72 : 0.82
  };
}

/** Rotates the whole hand so the fist presents knuckles, not an open palm, toward the camera. */
export function resolveHandPose(side: -1 | 1): HandPose {
  return {
    x: 0.01,
    y: -side * 0.1,
    z: side * 0.02
  };
}

/** Estimates an elbow joint so the arm keeps a readable boxer silhouette. */
export function resolveElbowJoint(shoulder: Vec3, wrist: Vec3, side: -1 | 1, collapse = 0): Vec3 {
  const dx = wrist.x - shoulder.x;
  const dy = wrist.y - shoulder.y;
  const dz = wrist.z - shoulder.z;
  const reach = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const reachRatio = clamp01((reach - 0.28) / 0.82);
  const forwardLift = Math.max(dz, 0) * 0.26;

  return {
    x: shoulder.x + dx * 0.52 + side * (0.18 - 0.08 * reachRatio) - collapse * side * 0.05,
    y: shoulder.y + dy * 0.45 - (0.2 - 0.07 * reachRatio) + Math.max(dy, 0) * 0.18 - collapse * 0.24,
    z: shoulder.z + dz * 0.46 - 0.18 + 0.1 * reachRatio + forwardLift - collapse * 0.1
  };
}

/** Returns the body and glove motion used by each dodge family. */
function resolveDodgeMotion(type: DodgeType, progress: number): DodgeMotion {
  const side = resolveDodgeSide(type);
  const normalized = clamp01(progress);
  const isDuck = type.endsWith("duck");
  const offLine = resolvePulse(normalized, isDuck ? 0.44 : 0.5);
  const returnBeat = resolveLateRise(normalized, isDuck ? 0.48 : 0.58);

  if (isDuck) {
    const outsideHand = {
      x: side * 0.052 * offLine,
      y: -0.13 * offLine,
      z: -0.024 * offLine
    };
    const insideHand = {
      x: side * 0.016 * offLine,
      y: -0.085 * offLine,
      z: -0.018 * offLine
    };

    return {
      leftWristOffset: side < 0 ? outsideHand : insideHand,
      rightWristOffset: side > 0 ? outsideHand : insideHand,
      rootPosition: {
        x: side * 0.19 * offLine,
        y: -0.33 * offLine,
        z: -0.085 * offLine + 0.028 * returnBeat
      },
      rootRotation: {
        x: 0.12 * offLine,
        y: side * 0.08 * offLine,
        z: side * 0.09 * offLine
      },
      torsoPosition: {
        x: side * 0.045 * offLine,
        y: -0.02 * offLine,
        z: -0.012 * offLine
      },
      torsoRotation: {
        x: 0.065 * offLine,
        y: -side * 0.22 * offLine,
        z: -side * 0.11 * offLine
      }
    };
  }

  const outsideHand = {
    x: side * 0.085 * offLine,
    y: -0.02 * offLine,
    z: -0.018 * offLine
  };
  const insideHand = {
    x: side * 0.03 * offLine,
    y: -0.012 * offLine,
    z: -0.012 * offLine
  };

  return {
    leftWristOffset: side < 0 ? outsideHand : insideHand,
    rightWristOffset: side > 0 ? outsideHand : insideHand,
    rootPosition: {
      x: side * 0.32 * offLine,
      y: -0.085 * offLine,
      z: -0.035 * offLine + 0.018 * returnBeat
    },
    rootRotation: {
      x: 0.03 * offLine,
      y: side * 0.1 * offLine,
      z: side * 0.24 * offLine
    },
    torsoPosition: {
      x: side * 0.08 * offLine,
      y: 0,
      z: -0.01 * offLine
    },
    torsoRotation: {
      x: -0.01 * offLine,
      y: -side * 0.34 * offLine,
      z: -side * 0.14 * offLine
    }
  };
}

/** Returns the active punch pose for the requested counter animation frame. */
function resolvePunchPose(move: CounterMove, progress: number): PunchPose {
  const side = move.startsWith("left") ? -1 : 1;
  const normalized = clamp01(progress);
  const loadProgress =
    normalized < 0.24
      ? easeInOutSine(normalized / 0.24)
      : normalized < 0.48
        ? 1 - easeInOutSine((normalized - 0.24) / 0.24)
        : 0;
  const driveProgress =
    normalized < 0.22
      ? 0
      : normalized < 0.64
        ? easeInOutSine((normalized - 0.22) / 0.42)
        : 1 - easeInOutSine((normalized - 0.64) / 0.36);
  const recoveryProgress = resolveLateRise(normalized, 0.68);

  if (move.endsWith("straight")) {
    return {
      leadX: side * 0.11 * loadProgress - side * 0.26 * driveProgress + side * 0.05 * recoveryProgress,
      leadY: -0.03 * loadProgress + 0.025 * driveProgress - 0.02 * recoveryProgress,
      leadZ: 0.08 * loadProgress + 0.92 * driveProgress - 0.34 * recoveryProgress,
      rearX: side * 0.012 * loadProgress + side * 0.05 * driveProgress - side * 0.01 * recoveryProgress,
      rearY: 0.018 * loadProgress + 0.012 * driveProgress,
      rearZ: -0.01 * loadProgress - 0.045 * driveProgress + 0.018 * recoveryProgress,
      leadShoulderX: -side * (0.018 * loadProgress + 0.05 * driveProgress - 0.018 * recoveryProgress),
      leadShoulderY: 0.01 * loadProgress + 0.018 * driveProgress - 0.006 * recoveryProgress,
      leadShoulderZ: 0.03 * loadProgress + 0.16 * driveProgress - 0.05 * recoveryProgress,
      rearShoulderX: -side * (0.01 * loadProgress + 0.024 * driveProgress - 0.008 * recoveryProgress),
      rearShoulderY: -0.004 * driveProgress,
      rearShoulderZ: -0.012 * loadProgress - 0.06 * driveProgress + 0.02 * recoveryProgress,
      torsoYaw: -side * (0.26 * loadProgress + 0.7 * driveProgress - 0.24 * recoveryProgress),
      torsoRoll: -side * (0.05 * loadProgress + 0.16 * driveProgress - 0.04 * recoveryProgress),
      torsoPitch: -0.03 * loadProgress + 0.07 * driveProgress - 0.028 * recoveryProgress,
      torsoDriveX: side * 0.05 * loadProgress - side * 0.11 * driveProgress + side * 0.034 * recoveryProgress,
      torsoDriveY: -0.015 * loadProgress + 0.025 * driveProgress - 0.01 * recoveryProgress,
      torsoDriveZ: 0.08 * loadProgress + 0.22 * driveProgress - 0.07 * recoveryProgress
    };
  }

  if (move.endsWith("hook")) {
    return {
      leadX: side * 0.14 * loadProgress - side * 0.34 * driveProgress + side * 0.12 * recoveryProgress,
      leadY: 0.035 * loadProgress + 0.09 * driveProgress - 0.045 * recoveryProgress,
      leadZ: 0.03 * loadProgress + 0.34 * driveProgress - 0.13 * recoveryProgress,
      rearX: side * 0.018 * loadProgress + side * 0.04 * driveProgress - side * 0.012 * recoveryProgress,
      rearY: 0.02 * loadProgress + 0.012 * driveProgress,
      rearZ: -0.015 * loadProgress - 0.03 * driveProgress + 0.015 * recoveryProgress,
      leadShoulderX: -side * (0.015 * loadProgress + 0.04 * driveProgress - 0.014 * recoveryProgress),
      leadShoulderY: 0.012 * driveProgress,
      leadShoulderZ: 0.02 * loadProgress + 0.11 * driveProgress - 0.04 * recoveryProgress,
      rearShoulderX: -side * (0.01 * loadProgress + 0.02 * driveProgress - 0.007 * recoveryProgress),
      rearShoulderY: -0.006 * driveProgress,
      rearShoulderZ: -0.01 * loadProgress - 0.045 * driveProgress + 0.016 * recoveryProgress,
      torsoYaw: -side * (0.36 * loadProgress + 0.78 * driveProgress - 0.25 * recoveryProgress),
      torsoRoll: -side * (0.14 * loadProgress + 0.22 * driveProgress - 0.08 * recoveryProgress),
      torsoPitch: -0.01 * loadProgress + 0.022 * driveProgress - 0.008 * recoveryProgress,
      torsoDriveX: side * 0.035 * loadProgress - side * 0.12 * driveProgress + side * 0.04 * recoveryProgress,
      torsoDriveY: -0.006 * loadProgress + 0.018 * driveProgress - 0.008 * recoveryProgress,
      torsoDriveZ: 0.02 * loadProgress + 0.07 * driveProgress - 0.028 * recoveryProgress
    };
  }

  return {
    leadX: side * 0.04 * loadProgress - side * 0.12 * driveProgress + side * 0.04 * recoveryProgress,
    leadY: -0.11 * loadProgress + 0.38 * driveProgress - 0.09 * recoveryProgress,
    leadZ: 0.02 * loadProgress + 0.4 * driveProgress - 0.15 * recoveryProgress,
    rearX: side * 0.012 * loadProgress + side * 0.038 * driveProgress - side * 0.012 * recoveryProgress,
    rearY: 0.018 * loadProgress + 0.012 * driveProgress,
    rearZ: -0.015 * loadProgress - 0.03 * driveProgress + 0.012 * recoveryProgress,
    leadShoulderX: -side * (0.012 * loadProgress + 0.03 * driveProgress - 0.012 * recoveryProgress),
    leadShoulderY: -0.02 * loadProgress + 0.016 * driveProgress - 0.005 * recoveryProgress,
    leadShoulderZ: 0.012 * loadProgress + 0.1 * driveProgress - 0.035 * recoveryProgress,
    rearShoulderX: -side * (0.008 * loadProgress + 0.018 * driveProgress - 0.006 * recoveryProgress),
    rearShoulderY: -0.012 * loadProgress - 0.008 * driveProgress + 0.003 * recoveryProgress,
    rearShoulderZ: -0.008 * loadProgress - 0.04 * driveProgress + 0.014 * recoveryProgress,
    torsoYaw: -side * (0.18 * loadProgress + 0.34 * driveProgress - 0.11 * recoveryProgress),
    torsoRoll: -side * (0.08 * loadProgress + 0.14 * driveProgress - 0.05 * recoveryProgress),
    torsoPitch: -0.15 * loadProgress + 0.1 * driveProgress - 0.03 * recoveryProgress,
    torsoDriveX: side * 0.02 * loadProgress - side * 0.06 * driveProgress + side * 0.022 * recoveryProgress,
    torsoDriveY: -0.07 * loadProgress + 0.085 * driveProgress - 0.025 * recoveryProgress,
    torsoDriveZ: 0.018 * loadProgress + 0.055 * driveProgress - 0.022 * recoveryProgress
  };
}

/** Resolves the visible arm rig pose for guard, dodge, counter, and down states. */
export function resolveArmRigPose(inputs: ArmRigInputs, profile: ArmRigProfile = DEFAULT_ARM_RIG_PROFILE): ArmRigPose {
  let leftShoulder = { ...profile.leftShoulder };
  let rightShoulder = { ...profile.rightShoulder };
  let leftWrist = resolveGuardWrist(-1, inputs.idleSwing, inputs.idleDip, profile);
  let rightWrist = resolveGuardWrist(1, inputs.idleSwing, inputs.idleDip, profile);

  if (inputs.dodgeType) {
    const dodgeMotion = resolveDodgeMotion(inputs.dodgeType, inputs.dodgeProgress);
    leftWrist = offsetVec3(leftWrist, dodgeMotion.leftWristOffset);
    rightWrist = offsetVec3(rightWrist, dodgeMotion.rightWristOffset);
  }

  if (inputs.counterMove) {
    const punchPose = resolvePunchPose(inputs.counterMove, clamp01(inputs.counterProgress));
    const moveKind = inputs.counterMove.endsWith("straight")
      ? "straight"
      : inputs.counterMove.endsWith("hook")
        ? "hook"
        : "uppercut";
    const targetBlend = inputs.targetLocal
      ? moveKind === "straight"
        ? (inputs.counterProgress < 0.22 ? 0 : clamp01((inputs.counterProgress - 0.22) / 0.34) * 0.88)
        : moveKind === "hook"
          ? (inputs.counterProgress < 0.32 ? 0 : clamp01((inputs.counterProgress - 0.32) / 0.28) * 0.42)
          : (inputs.counterProgress < 0.28 ? 0 : clamp01((inputs.counterProgress - 0.28) / 0.28) * 0.5)
      : 0;
    const targetWeights: AimBlendWeights =
      moveKind === "straight"
        ? { x: 0.76, y: 0.64, z: 0.92 }
        : moveKind === "hook"
          ? { x: 0.24, y: 0.18, z: 0.45 }
          : { x: 0.18, y: 0.34, z: 0.52 };
    const activeIsLeft = inputs.counterMove.startsWith("left");
    const activeSide: -1 | 1 = activeIsLeft ? -1 : 1;
    const activeBase = activeIsLeft ? leftWrist : rightWrist;
    const supportBase = activeIsLeft ? rightWrist : leftWrist;
    const activeShoulderBase = activeIsLeft ? leftShoulder : rightShoulder;
    const supportShoulderBase = activeIsLeft ? rightShoulder : leftShoulder;
    let activeWrist = offsetVec3(activeBase, {
      x: punchPose.leadX,
      y: punchPose.leadY,
      z: punchPose.leadZ
    });
    const supportGuard = offsetVec3(supportBase, {
      x: -activeSide * 0.008,
      y: 0.008,
      z: 0.01
    });
    const supportDrift = offsetVec3(supportGuard, {
      x: punchPose.rearX * 0.08,
      y: punchPose.rearY * 0.06,
      z: punchPose.rearZ * 0.08
    });
    const supportHold = THREE.MathUtils.smoothstep(inputs.counterProgress, 0.12, 0.64);
    const supportWrist = lerpVec3(supportDrift, supportGuard, supportHold);
    let activeShoulder = offsetVec3(activeShoulderBase, {
      x: punchPose.leadShoulderX,
      y: punchPose.leadShoulderY,
      z: punchPose.leadShoulderZ
    });
    let supportShoulder = offsetVec3(supportShoulderBase, {
      x: punchPose.rearShoulderX,
      y: punchPose.rearShoulderY,
      z: punchPose.rearShoulderZ
    });
    const shoulderRotateDrive =
      moveKind === "straight"
        ? THREE.MathUtils.smoothstep(inputs.counterProgress, 0.18, 0.52)
        : THREE.MathUtils.smoothstep(inputs.counterProgress, 0.24, 0.58);
    const shoulderLeadBoost = moveKind === "straight" ? 0.17 : moveKind === "hook" ? 0.118 : 0.096;
    const shoulderRearPull = moveKind === "straight" ? 0.138 : moveKind === "hook" ? 0.102 : 0.084;
    activeShoulder = offsetVec3(activeShoulder, {
      x: -activeSide * 0.052 * shoulderRotateDrive,
      z: shoulderLeadBoost * shoulderRotateDrive
    });
    supportShoulder = offsetVec3(supportShoulder, {
      x: activeSide * 0.034 * shoulderRotateDrive,
      z: -shoulderRearPull * shoulderRotateDrive
    });

    if (inputs.targetLocal) {
      activeWrist = blendVec3ByAxis(activeWrist, inputs.targetLocal, targetBlend, targetWeights);
    }

    if (activeIsLeft) {
      leftShoulder = activeShoulder;
      rightShoulder = supportShoulder;
      leftWrist = activeWrist;
      rightWrist = supportWrist;
    } else {
      rightShoulder = activeShoulder;
      leftShoulder = supportShoulder;
      rightWrist = activeWrist;
      leftWrist = supportWrist;
    }
  }

  const collapse = inputs.victoryProgress ?? 0;
  if (collapse > 0) {
    leftWrist = lerpVec3(leftWrist, profile.leftFallen, collapse);
    rightWrist = lerpVec3(rightWrist, profile.rightFallen, collapse);
  }

  return {
    leftShoulder,
    rightShoulder,
    leftElbow: resolveElbowJoint(leftShoulder, leftWrist, -1, collapse),
    rightElbow: resolveElbowJoint(rightShoulder, rightWrist, 1, collapse),
    leftWrist,
    rightWrist
  };
}

/** Builds one opaque sleeve or joint mesh for the arm rig overlay. */
function createArmMesh(geometry: THREE.BufferGeometry, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.48,
      metalness: 0.08
    })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.renderOrder = 3;
  return mesh;
}

/** Places a cylinder so it visually connects two arm joints. */
function positionSegment(mesh: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3): void {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  if (length <= 1e-4) {
    mesh.visible = false;
    return;
  }

  mesh.visible = true;
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.scale.set(1, length, 1);
}

/** Handles the Three.js scene, the avatar mesh, and lightweight combat animations. */
export class SceneManager {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly avatarGroup = new THREE.Group();
  private readonly avatarVisualGroup = new THREE.Group();
  private readonly armRigGroup = new THREE.Group();
  private armRigProfile: ArmRigProfile = DEFAULT_ARM_RIG_PROFILE;
  private riggedAvatar: RiggedAvatarState | null = null;
  private readonly fallbackAvatar = new THREE.Group();
  private readonly armUpperGeometry = new THREE.CylinderGeometry(0.054, 0.046, 1, 12, 1, false);
  private readonly armForeGeometry = new THREE.CylinderGeometry(0.046, 0.04, 1, 12, 1, false);
  private readonly armJointGeometry = new THREE.SphereGeometry(0.056, 18, 18);
  private readonly leftArm: ArmRigVisual = {
    shoulder: createArmMesh(this.armJointGeometry, 0x334657),
    upperArm: createArmMesh(this.armUpperGeometry, 0x334657),
    elbow: createArmMesh(this.armJointGeometry, 0x3d5367),
    forearm: createArmMesh(this.armForeGeometry, 0x42596f)
  };
  private readonly rightArm: ArmRigVisual = {
    shoulder: createArmMesh(this.armJointGeometry, 0x334657),
    upperArm: createArmMesh(this.armUpperGeometry, 0x334657),
    elbow: createArmMesh(this.armJointGeometry, 0x3d5367),
    forearm: createArmMesh(this.armForeGeometry, 0x42596f)
  };
  private readonly leftGlove = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 18, 18),
    new THREE.MeshStandardMaterial({ color: 0xd62839, roughness: 0.38, metalness: 0.05 })
  );
  private readonly rightGlove = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 18, 18),
    new THREE.MeshStandardMaterial({ color: 0xd62839, roughness: 0.38, metalness: 0.05 })
  );
  private readonly threatGroup = new THREE.Group();
  private readonly threatFlashGeometry = new THREE.SphereGeometry(0.12, 16, 16);
  private readonly threatRingGeometry = new THREE.TorusGeometry(0.18, 0.032, 10, 36);
  private readonly threatSparkGeometry = new THREE.PlaneGeometry(0.065, 0.34);
  private readonly threatImpacts: ThreatImpactSlot[] = [];
  private readonly shadowPlane = new THREE.Mesh(
    new THREE.CircleGeometry(0.78, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 })
  );
  private dodgeState: { type: DodgeType; startedAt: number } | null = null;
  private counterState: { startedAt: number; result: GuardResult; move: CounterMove; target: Vec3 } | null = null;
  private victoryState: { startedAt: number } | null = null;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.host.appendChild(this.renderer.domElement);
    this.bootstrapScene();
    this.resize();
  }

  /** Loads the external fighter avatar model and swaps it into the scene. */
  async initialize(): Promise<void> {
    const loader = new GLTFLoader();

    try {
      const fighter = (await loader.loadAsync(FIGHTER_ASSET_PATH)).scene;
      const bounds = new THREE.Box3().setFromObject(fighter);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const targetHeight = 3.2;
      const scale = size.y > 0 ? targetHeight / size.y : 1.4;
      const yFloorOffset = bounds.min.y * scale;
      fighter.scale.setScalar(scale);
      fighter.position.set(-center.x * scale, -yFloorOffset - 1.55, -2.04 - center.z * scale * 0.12);
      fighter.rotation.y = 0;
      fighter.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.SkinnedMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.material = Array.isArray(child.material)
            ? child.material.map((material) => material.clone())
            : child.material.clone();
        }
      });
      this.fallbackAvatar.visible = false;
      this.avatarVisualGroup.add(fighter);
      fighter.updateMatrixWorld(true);
      this.riggedAvatar = this.captureRiggedAvatar(fighter);
      this.armRigProfile = this.riggedAvatar
        ? this.buildArmRigProfileFromRig(this.riggedAvatar)
        : createArmRigProfileFromBounds(new THREE.Box3().setFromObject(fighter));
    } catch (error) {
      console.warn("Unable to load fighter avatar, keeping fallback mesh.", error);
      this.fallbackAvatar.visible = true;
    }
  }

  /** Builds the static scene elements. */
  private bootstrapScene(): void {
    this.scene.background = new THREE.Color("#050d14");
    this.scene.fog = new THREE.Fog("#050d14", 4.2, 11.5);

    this.camera.position.set(0, 1.72, 1.28);
    this.camera.lookAt(0, 1.46, -2.12);

    const ambient = new THREE.AmbientLight(0xffffff, 0.75);
    const keyLight = new THREE.DirectionalLight(0xb2dbff, 1.35);
    keyLight.position.set(2.5, 4, 1.5);
    keyLight.castShadow = true;
    const rimLight = new THREE.PointLight(0xff7a59, 2.4, 12, 2);
    rimLight.position.set(-1.5, 2.8, -2.5);
    const topLight = new THREE.SpotLight(0xffffff, 22, 20, 0.48, 0.6, 1.4);
    topLight.position.set(0, 5.5, -0.5);
    topLight.target.position.set(0, 1.4, -2.1);
    topLight.castShadow = true;
    this.scene.add(ambient, keyLight, rimLight, topLight, topLight.target);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(6, 48),
      new THREE.MeshStandardMaterial({ color: 0x152733, roughness: 0.9, metalness: 0.04 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    this.scene.add(floor);

    const ringPlatform = new THREE.Mesh(
      new THREE.CylinderGeometry(2.45, 2.6, 0.18, 48),
      new THREE.MeshStandardMaterial({ color: 0x101c24, roughness: 0.85, metalness: 0.08 })
    );
    ringPlatform.position.set(0, 0.09, -2.05);
    this.scene.add(ringPlatform);

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.42, 1.15, 10, 20),
      new THREE.MeshStandardMaterial({ color: 0x446b82, roughness: 0.45, metalness: 0.12 })
    );
    body.position.set(0, 1.05, -1.95);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.27, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0xf7c59f, roughness: 0.68, metalness: 0.04 })
    );
    head.position.set(0, 1.85, -1.9);

    const leftShoulder = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 18, 18),
      new THREE.MeshStandardMaterial({ color: 0x1d3557 })
    );
    leftShoulder.position.set(-0.42, 1.55, -1.88);

    const rightShoulder = leftShoulder.clone();
    rightShoulder.position.x = 0.42;

    this.fallbackAvatar.add(body, head, leftShoulder, rightShoulder);
    this.avatarGroup.add(this.fallbackAvatar);
    this.shadowPlane.rotation.x = -Math.PI / 2;
    this.shadowPlane.position.set(0, 0.02, -1.98);
    this.leftGlove.position.set(
      this.armRigProfile.leftGuard.x,
      this.armRigProfile.leftGuard.y,
      this.armRigProfile.leftGuard.z
    );
    this.rightGlove.position.set(
      this.armRigProfile.rightGuard.x,
      this.armRigProfile.rightGuard.y,
      this.armRigProfile.rightGuard.z
    );
    this.leftGlove.castShadow = true;
    this.rightGlove.castShadow = true;
    this.leftGlove.renderOrder = 4;
    this.rightGlove.renderOrder = 4;
    this.bootstrapArmRig();
    this.avatarVisualGroup.add(this.fallbackAvatar);
    this.armRigGroup.visible = false;
    this.avatarVisualGroup.add(this.leftGlove, this.rightGlove);
    this.avatarGroup.add(this.avatarVisualGroup, this.shadowPlane);
    this.scene.add(this.avatarGroup, this.threatGroup);
    this.bootstrapThreatPool();
  }

  /** Updates renderer size to match the host. */
  resize(): void {
    const width = Math.max(this.host.clientWidth, 1);
    const height = Math.max(this.host.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /** Bursts a short impact effect at the final contact point of the dominant predicted punch. */
  setThreatTrajectory(traj: WristPairTrajectory | null, now: number): void {
    if (!traj) {
      return;
    }

    const impactPoint = resolveThreatImpactPoint(traj);
    this.activateThreatImpact(new THREE.Vector3(impactPoint.x, impactPoint.y, impactPoint.z), now);
  }

  /** Starts a dodge animation. */
  triggerDodge(type: DodgeType, now: number): void {
    this.dodgeState = { type, startedAt: now };
  }

  /** Starts a counter animation colored by the guard result. */
  triggerCounter(move: CounterMove, result: GuardResult, now: number, target: Vec3): void {
    this.counterState = { move, result, target, startedAt: now };
  }

  /** Starts the opponent downed motion once the AI HP reaches zero. */
  triggerVictory(now: number): void {
    if (this.victoryState) {
      return;
    }

    this.dodgeState = null;
    this.counterState = null;
    this.victoryState = { startedAt: now };
  }

  /** Advances scene animation and renders one frame. */
  render(now: number): void {
    this.updateThreatEffects(now);
    this.updateAvatarAnimation(now);
    this.renderer.render(this.scene, this.camera);
  }

  /** Releases WebGL resources. */
  dispose(): void {
    for (const slot of this.threatImpacts) {
      slot.flashMaterial.dispose();
      slot.ringMaterial.dispose();
      for (const spark of slot.sparks) {
        spark.material.dispose();
      }
    }
    this.threatFlashGeometry.dispose();
    this.threatRingGeometry.dispose();
    this.threatSparkGeometry.dispose();
    this.armUpperGeometry.dispose();
    this.armForeGeometry.dispose();
    this.armJointGeometry.dispose();
    this.renderer.dispose();
  }

  private updateThreatEffects(now: number): void {
    let activeCount = 0;
    for (const slot of this.threatImpacts) {
      if (!slot.active) {
        continue;
      }

      const progress = clamp01((now - slot.startedAt) / THREAT_IMPACT_DURATION_MS);
      if (progress >= 1) {
        slot.active = false;
        slot.group.visible = false;
        continue;
      }

      activeCount += 1;
      const fade = 1 - progress;
      const flashPulse = resolvePulse(Math.min(progress / 0.72, 1), 0.24);
      slot.group.visible = true;
      slot.group.quaternion.copy(this.camera.quaternion);
      slot.group.rotateZ(slot.spinOffset + progress * 0.42);
      slot.flash.scale.setScalar(0.42 + flashPulse * 1.28);
      slot.flashMaterial.opacity = THREAT_FLASH_BASE_OPACITY * Math.pow(fade, 1.45);
      slot.ring.scale.setScalar(0.5 + progress * 1.65);
      slot.ringMaterial.opacity = THREAT_RING_BASE_OPACITY * Math.pow(fade, 1.2);

      for (const spark of slot.sparks) {
        const radius = 0.12 + progress * 0.34;
        spark.mesh.position.set(Math.cos(spark.angle) * radius, Math.sin(spark.angle) * radius, 0);
        spark.mesh.scale.set(0.55 - progress * 0.18, 0.7 + progress * 1.35, 1);
        spark.material.opacity = THREAT_SPARK_BASE_OPACITY * Math.pow(fade, 1.65);
      }
    }

    this.threatGroup.visible = activeCount > 0;
  }

  private updateAvatarAnimation(now: number): void {
    const idleSwing = Math.sin(now * 0.0023);
    const idleDip = Math.sin(now * 0.0038);
    let dodgeProgress = 0;
    let counterProgress = 0;
    let victoryProgress: number | null = null;
    let counterTargetLocal: Vec3 | null = null;

    this.avatarGroup.position.set(idleSwing * 0.035, idleDip * 0.018, 0);
    this.avatarGroup.rotation.set(0, idleSwing * 0.08, idleSwing * 0.018);
    this.avatarVisualGroup.position.set(0, 0, 0);
    this.avatarVisualGroup.rotation.set(idleDip * 0.04, idleSwing * 0.08, idleSwing * 0.02);

    if (this.dodgeState) {
      dodgeProgress = Math.min((now - this.dodgeState.startedAt) / DODGE_DURATION_MS, 1);
      const dodgeMotion = resolveDodgeMotion(this.dodgeState.type, dodgeProgress);
      this.avatarGroup.position.x += dodgeMotion.rootPosition.x;
      this.avatarGroup.position.y += dodgeMotion.rootPosition.y;
      this.avatarGroup.position.z += dodgeMotion.rootPosition.z;
      this.avatarGroup.rotation.x += dodgeMotion.rootRotation.x;
      this.avatarGroup.rotation.y += dodgeMotion.rootRotation.y;
      this.avatarGroup.rotation.z += dodgeMotion.rootRotation.z;
      this.avatarVisualGroup.position.x += dodgeMotion.torsoPosition.x;
      this.avatarVisualGroup.position.y += dodgeMotion.torsoPosition.y;
      this.avatarVisualGroup.position.z += dodgeMotion.torsoPosition.z;
      this.avatarVisualGroup.rotation.x += dodgeMotion.torsoRotation.x;
      this.avatarVisualGroup.rotation.y += dodgeMotion.torsoRotation.y;
      this.avatarVisualGroup.rotation.z += dodgeMotion.torsoRotation.z;

      if (dodgeProgress >= 1) {
        this.dodgeState = null;
      }
    }

    this.leftGlove.scale.setScalar(1);
    this.rightGlove.scale.setScalar(1);
    (this.leftGlove.material as THREE.MeshStandardMaterial).color.set("#d62839");
    (this.rightGlove.material as THREE.MeshStandardMaterial).color.set("#d62839");
    this.shadowPlane.scale.set(1, 1, 1);
    if (this.counterState) {
      counterProgress = Math.min((now - this.counterState.startedAt) / COUNTER_ANIMATION_MS, 1);
      const activeGlove = this.counterState.move.startsWith("left") ? this.leftGlove : this.rightGlove;
      const isGuarded = this.counterState.result === "guarded";
      const punchPose = resolvePunchPose(this.counterState.move, counterProgress);
      (activeGlove.material as THREE.MeshStandardMaterial).color.set(isGuarded ? "#80ed99" : "#ff5a5f");
      activeGlove.scale.setScalar(isGuarded ? 1.06 : 1.12);
      this.avatarVisualGroup.position.x += punchPose.torsoDriveX;
      this.avatarVisualGroup.position.y += punchPose.torsoDriveY;
      this.avatarVisualGroup.position.z += punchPose.torsoDriveZ;
      this.avatarVisualGroup.rotation.x += punchPose.torsoPitch;
      this.avatarVisualGroup.rotation.y += punchPose.torsoYaw;
      this.avatarVisualGroup.rotation.z += punchPose.torsoRoll;
      this.avatarGroup.updateMatrixWorld(true);
      counterTargetLocal = this.avatarVisualGroup.worldToLocal(
        new THREE.Vector3(this.counterState.target.x, this.counterState.target.y, this.counterState.target.z)
      );
      this.shadowPlane.scale.set(1 + Math.abs(punchPose.torsoDriveX) * 0.6, 1 + punchPose.torsoDriveY * 1.2, 1);
      if (counterProgress >= 1) {
        this.counterState = null;
      }
    }

    if (this.victoryState) {
      const progress = Math.min((now - this.victoryState.startedAt) / VICTORY_ANIMATION_MS, 1);
      const impact = easeInOutSine(Math.min(progress / 0.32, 1));
      const collapse = progress <= 0.18 ? 0 : easeInOutSine((progress - 0.18) / 0.82);
      victoryProgress = collapse;
      this.avatarGroup.position.x += 0.08 * impact + 0.42 * collapse;
      this.avatarGroup.position.y += -0.1 * impact - 0.96 * collapse;
      this.avatarGroup.position.z += 0.12 * collapse;
      this.avatarGroup.rotation.x += -0.14 * impact - 0.42 * collapse;
      this.avatarGroup.rotation.y += -0.18 * impact - 0.22 * collapse;
      this.avatarGroup.rotation.z += 0.2 * impact + 1.32 * collapse;
      this.avatarVisualGroup.rotation.x += -0.08 * collapse;
      this.avatarVisualGroup.rotation.z += 0.16 * collapse;
      this.shadowPlane.scale.set(1.08 + collapse * 0.54, 0.94 + collapse * 0.28, 1);
    }

    const armPose = resolveArmRigPose(
      {
        idleSwing,
        idleDip,
        dodgeType: this.dodgeState?.type ?? null,
        dodgeProgress,
        counterMove: this.counterState?.move ?? null,
        counterProgress,
        targetLocal: counterTargetLocal,
        victoryProgress
      },
      this.armRigProfile
    );
    if (this.riggedAvatar) {
      this.applyRiggedAvatarPose(armPose);
    } else {
      this.applyArmRigPose(armPose);
    }
  }

  /** Captures the humanoid skeleton when the loaded GLB contains a usable arm rig. */
  private captureRiggedAvatar(fighter: THREE.Object3D): RiggedAvatarState | null {
    const head = findBoneBySuffix(fighter, "Head");
    const anatomicalLeftArm = captureArmBoneChain(fighter, -1);
    const anatomicalRightArm = captureArmBoneChain(fighter, 1);
    if (!head || !anatomicalLeftArm || !anatomicalRightArm) {
      return null;
    }

    const anatomicalLeftX = this.objectPositionInAvatarLocal(anatomicalLeftArm.upperArm.bone).x;
    const anatomicalRightX = this.objectPositionInAvatarLocal(anatomicalRightArm.upperArm.bone).x;
    const armViewOrder = resolveArmViewOrder(anatomicalLeftX, anatomicalRightX);
    const leftArm = armViewOrder.screenLeftFrom === "left" ? anatomicalLeftArm : anatomicalRightArm;
    const rightArm = armViewOrder.screenRightFrom === "right" ? anatomicalRightArm : anatomicalLeftArm;
    leftArm.side = -1;
    rightArm.side = 1;

    return {
      fighter,
      head,
      leftArm,
      rightArm
    };
  }

  /** Builds the boxer guard anchors from the imported skeleton instead of a fake overlay arm. */
  private buildArmRigProfileFromRig(rig: RiggedAvatarState): ArmRigProfile {
    const leftShoulder = this.objectPositionInAvatarLocal(rig.leftArm.upperArm.bone);
    const rightShoulder = this.objectPositionInAvatarLocal(rig.rightArm.upperArm.bone);
    const head = this.objectPositionInAvatarLocal(rig.head);
    const leftGuardX = resolveGuardAnchorX(leftShoulder.x, head.x, -1);
    const rightGuardX = resolveGuardAnchorX(rightShoulder.x, head.x, 1);
    const guardY = resolveGuardAnchorY(head.y);
    const guardZ = resolveGuardAnchorZ(head.z);

    return {
      leftShoulder,
      rightShoulder,
      leftGuard: { x: leftGuardX, y: guardY, z: guardZ },
      rightGuard: { x: rightGuardX, y: guardY, z: guardZ },
      leftFallen: { x: leftShoulder.x - 0.18, y: leftShoulder.y - 0.66, z: leftShoulder.z + 0.54 },
      rightFallen: { x: rightShoulder.x + 0.18, y: rightShoulder.y - 0.9, z: rightShoulder.z + 0.72 }
    };
  }

  /** Converts an object's world position into the avatar visual group's local space. */
  private objectPositionInAvatarLocal(object: THREE.Object3D): Vec3 {
    const world = object.getWorldPosition(new THREE.Vector3());
    const local = this.avatarVisualGroup.worldToLocal(world);
    return { x: local.x, y: local.y, z: local.z };
  }

  /** Resets one imported arm chain to bind pose before solving the new frame. */
  private resetArmBoneChain(chain: ArmBoneChain): void {
    chain.shoulder.bone.quaternion.copy(chain.shoulder.restQuaternion);
    chain.upperArm.bone.quaternion.copy(chain.upperArm.restQuaternion);
    chain.lowerArm.bone.quaternion.copy(chain.lowerArm.restQuaternion);
    chain.hand.bone.quaternion.copy(chain.hand.restQuaternion);
    for (const finger of chain.fingerCurlBones) {
      finger.bone.quaternion.copy(finger.restQuaternion);
      finger.bone.scale.copy(finger.restScale);
    }
  }

  /** Rotates one imported bone from its bind pose toward a desired world-space direction. */
  private orientBoneTowardDirection(state: BonePoseState, desiredDirectionWorld: THREE.Vector3, strength = 1): void {
    if (desiredDirectionWorld.lengthSq() <= 1e-6) {
      state.bone.quaternion.copy(state.restQuaternion);
      return;
    }

    const parentWorldQuat = state.bone.parent
      ? state.bone.parent.getWorldQuaternion(new THREE.Quaternion())
      : new THREE.Quaternion();
    const desiredDirectionParent = desiredDirectionWorld.clone().normalize().applyQuaternion(parentWorldQuat.invert());
    const delta = new THREE.Quaternion().setFromUnitVectors(state.restDirectionParent, desiredDirectionParent);
    const targetQuaternion = delta.multiply(state.restQuaternion.clone());
    state.bone.quaternion.copy(state.restQuaternion);
    state.bone.quaternion.slerp(targetQuaternion, strength);
  }

  /** Twists a solved arm bone around its pointing axis so the forearm can pronate into a boxing guard. */
  private twistBoneAroundAimAxis(state: BonePoseState, angleRadians: number): void {
    if (Math.abs(angleRadians) <= 1e-6) {
      return;
    }

    const axis = state.restDirectionParent.clone().normalize();
    const twist = new THREE.Quaternion().setFromAxisAngle(axis, angleRadians);
    state.bone.quaternion.multiply(twist);
  }

  /** Solves one imported arm chain so the real skeleton keeps guard and throws the counter punch. */
  private applyRiggedArmChain(chain: ArmBoneChain, wristTargetWorld: THREE.Vector3): void {
    const avatarWorldQuat = this.avatarVisualGroup.getWorldQuaternion(new THREE.Quaternion());
    const shoulderWorld = chain.shoulder.bone.getWorldPosition(new THREE.Vector3());
    const shoulderLiftDirection = wristTargetWorld.clone().sub(shoulderWorld);
    this.orientBoneTowardDirection(chain.shoulder, shoulderLiftDirection, 0.06);
    this.avatarVisualGroup.updateMatrixWorld(true);

    const upperArmWorld = chain.upperArm.bone.getWorldPosition(new THREE.Vector3());
    const elbowPole = resolveElbowPole(chain.side);
    const poleWorld = new THREE.Vector3(elbowPole.x, elbowPole.y, elbowPole.z).applyQuaternion(avatarWorldQuat).normalize();
    const elbow = solveLimbJoint(
      { x: upperArmWorld.x, y: upperArmWorld.y, z: upperArmWorld.z },
      { x: wristTargetWorld.x, y: wristTargetWorld.y, z: wristTargetWorld.z },
      chain.upperLength,
      chain.lowerLength,
      { x: poleWorld.x, y: poleWorld.y, z: poleWorld.z }
    );
    const elbowWorld = new THREE.Vector3(elbow.x, elbow.y, elbow.z);
    this.orientBoneTowardDirection(chain.upperArm, elbowWorld.clone().sub(upperArmWorld));
    this.twistBoneAroundAimAxis(chain.upperArm, resolveArmInwardTwist(chain.side) * 0.34);
    this.avatarVisualGroup.updateMatrixWorld(true);

    const lowerArmWorld = chain.lowerArm.bone.getWorldPosition(new THREE.Vector3());
    this.orientBoneTowardDirection(chain.lowerArm, wristTargetWorld.clone().sub(lowerArmWorld));
    this.twistBoneAroundAimAxis(chain.lowerArm, resolveArmInwardTwist(chain.side) * 0.6);
    this.avatarVisualGroup.updateMatrixWorld(true);
    this.applyRiggedHandPose(chain);
    this.avatarVisualGroup.updateMatrixWorld(true);
  }

  /** Rotates the hand and finger chains into a fist-like boxing guard. */
  private applyRiggedHandPose(chain: ArmBoneChain): void {
    const handPose = resolveHandPose(chain.side);
    const handEuler = new THREE.Euler(handPose.x, handPose.y, handPose.z, "XYZ");
    chain.hand.bone.quaternion.copy(chain.hand.restQuaternion);
    chain.hand.bone.quaternion.multiply(new THREE.Quaternion().setFromEuler(handEuler));

    for (const finger of chain.fingerCurlBones) {
      finger.bone.quaternion.copy(finger.restQuaternion);
      finger.bone.scale.copy(finger.restScale);
      const curlPose = resolveFingerCurlPose(finger.bone.name, chain.side);
      const curlEuler = new THREE.Euler(curlPose.x, curlPose.y, curlPose.z, "XYZ");
      finger.bone.quaternion.multiply(new THREE.Quaternion().setFromEuler(curlEuler));
      finger.bone.scale.multiplyScalar(curlPose.scale);
    }
  }

  /** Places the red glove effect directly on the animated hand bone. */
  private syncGloveToHand(glove: THREE.Mesh, hand: THREE.Bone, side: -1 | 1): void {
    const handWorld = hand.getWorldPosition(new THREE.Vector3());
    const viewerDirection = this.camera.position.clone().sub(handWorld).normalize();
    const avatarWorldQuat = this.avatarVisualGroup.getWorldQuaternion(new THREE.Quaternion());
    const outwardDirection = new THREE.Vector3(side, 0, 0).applyQuaternion(avatarWorldQuat).normalize();
    const gloveWorld = handWorld
      .clone()
      .addScaledVector(viewerDirection, 0.14)
      .addScaledVector(outwardDirection, 0.02)
      .add(new THREE.Vector3(0, 0.015, 0));
    glove.position.copy(this.avatarVisualGroup.worldToLocal(gloveWorld));
  }

  /** Applies the boxer guard / counter target pose onto the imported rigged skeleton. */
  private applyRiggedAvatarPose(pose: ArmRigPose): void {
    if (!this.riggedAvatar) {
      return;
    }

    this.armRigGroup.visible = false;
    this.resetArmBoneChain(this.riggedAvatar.leftArm);
    this.resetArmBoneChain(this.riggedAvatar.rightArm);
    this.avatarVisualGroup.updateMatrixWorld(true);

    const leftTargetWorldRaw = this.avatarVisualGroup.localToWorld(
      new THREE.Vector3(pose.leftWrist.x, pose.leftWrist.y, pose.leftWrist.z)
    );
    const rightTargetWorldRaw = this.avatarVisualGroup.localToWorld(
      new THREE.Vector3(pose.rightWrist.x, pose.rightWrist.y, pose.rightWrist.z)
    );
    const viewer = { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
    const leftTargetWorldBiased = biasTargetTowardViewer(
      { x: leftTargetWorldRaw.x, y: leftTargetWorldRaw.y, z: leftTargetWorldRaw.z },
      viewer,
      0.14
    );
    const rightTargetWorldBiased = biasTargetTowardViewer(
      { x: rightTargetWorldRaw.x, y: rightTargetWorldRaw.y, z: rightTargetWorldRaw.z },
      viewer,
      0.14
    );
    const leftTargetWorld = new THREE.Vector3(leftTargetWorldBiased.x, leftTargetWorldBiased.y, leftTargetWorldBiased.z);
    const rightTargetWorld = new THREE.Vector3(rightTargetWorldBiased.x, rightTargetWorldBiased.y, rightTargetWorldBiased.z);

    this.applyRiggedArmChain(this.riggedAvatar.leftArm, leftTargetWorld);
    this.applyRiggedArmChain(this.riggedAvatar.rightArm, rightTargetWorld);
    this.syncGloveToHand(this.leftGlove, this.riggedAvatar.leftArm.hand.bone, -1);
    this.syncGloveToHand(this.rightGlove, this.riggedAvatar.rightArm.hand.bone, 1);
  }

  /** Builds the visible boxer forearms so the gloves stay connected during counters. */
  private bootstrapArmRig(): void {
    for (const mesh of [
      this.leftArm.shoulder,
      this.leftArm.upperArm,
      this.leftArm.elbow,
      this.leftArm.forearm,
      this.rightArm.shoulder,
      this.rightArm.upperArm,
      this.rightArm.elbow,
      this.rightArm.forearm
    ]) {
      this.armRigGroup.add(mesh);
    }
  }

  /** Applies the current shoulder-elbow-wrist pose to the overlay arm rig and gloves. */
  private applyArmRigPose(pose: ArmRigPose): void {
    const leftShoulder = new THREE.Vector3(pose.leftShoulder.x, pose.leftShoulder.y, pose.leftShoulder.z);
    const rightShoulder = new THREE.Vector3(pose.rightShoulder.x, pose.rightShoulder.y, pose.rightShoulder.z);
    const leftElbow = new THREE.Vector3(pose.leftElbow.x, pose.leftElbow.y, pose.leftElbow.z);
    const rightElbow = new THREE.Vector3(pose.rightElbow.x, pose.rightElbow.y, pose.rightElbow.z);
    const leftWrist = new THREE.Vector3(pose.leftWrist.x, pose.leftWrist.y, pose.leftWrist.z);
    const rightWrist = new THREE.Vector3(pose.rightWrist.x, pose.rightWrist.y, pose.rightWrist.z);

    this.leftArm.shoulder.position.copy(leftShoulder);
    this.rightArm.shoulder.position.copy(rightShoulder);
    this.leftArm.elbow.position.copy(leftElbow);
    this.rightArm.elbow.position.copy(rightElbow);
    positionSegment(this.leftArm.upperArm, leftShoulder, leftElbow);
    positionSegment(this.leftArm.forearm, leftElbow, leftWrist);
    positionSegment(this.rightArm.upperArm, rightShoulder, rightElbow);
    positionSegment(this.rightArm.forearm, rightElbow, rightWrist);
    this.leftGlove.position.copy(leftWrist);
    this.rightGlove.position.copy(rightWrist);
  }

  /** Pre-allocates impact burst meshes so each punch endpoint can flash without new allocations. */
  private bootstrapThreatPool(): void {
    for (let index = 0; index < THREAT_IMPACT_POOL_SIZE; index += 1) {
      const group = new THREE.Group();
      const flashMaterial = new THREE.MeshBasicMaterial({
        color: 0xfff1b8,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const flash = new THREE.Mesh(this.threatFlashGeometry, flashMaterial);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xff6a3d,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const ring = new THREE.Mesh(this.threatRingGeometry, ringMaterial);
      const sparks: ThreatImpactSpark[] = [];
      for (let sparkIndex = 0; sparkIndex < 8; sparkIndex += 1) {
        const angle = (sparkIndex / 8) * Math.PI * 2;
        const material = new THREE.MeshBasicMaterial({
          color: sparkIndex % 2 === 0 ? 0xfff1b8 : 0xff6138,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        const mesh = new THREE.Mesh(this.threatSparkGeometry, material);
        mesh.rotation.z = angle - Math.PI / 2;
        group.add(mesh);
        sparks.push({ mesh, material, angle });
      }

      flash.scale.setScalar(0.01);
      ring.scale.setScalar(0.01);
      group.visible = false;
      group.renderOrder = 8;
      group.add(ring, flash);
      this.threatGroup.add(group);
      this.threatImpacts.push({
        group,
        flash,
        flashMaterial,
        ring,
        ringMaterial,
        sparks,
        active: false,
        startedAt: 0,
        expiresAt: 0,
        spinOffset: 0
      });
    }
  }

  /** Activates one pooled impact burst at the predicted contact point. */
  private activateThreatImpact(position: THREE.Vector3, now: number): void {
    const slot = this.findReusableThreatSlot();
    slot.active = true;
    slot.startedAt = now;
    slot.expiresAt = now + THREAT_IMPACT_DURATION_MS;
    slot.spinOffset = (now * 0.013) % (Math.PI * 2);
    slot.group.position.copy(position);
    slot.group.visible = true;
    slot.flash.scale.setScalar(0.38);
    slot.ring.scale.setScalar(0.48);
    slot.flashMaterial.opacity = THREAT_FLASH_BASE_OPACITY;
    slot.ringMaterial.opacity = THREAT_RING_BASE_OPACITY;
    for (const spark of slot.sparks) {
      spark.mesh.position.set(Math.cos(spark.angle) * 0.12, Math.sin(spark.angle) * 0.12, 0);
      spark.mesh.scale.set(0.55, 0.7, 1);
      spark.material.opacity = THREAT_SPARK_BASE_OPACITY;
    }
  }

  /** Returns an inactive slot when available, otherwise recycles the oldest active one. */
  private findReusableThreatSlot(): ThreatImpactSlot {
    const inactive = this.threatImpacts.find((slot) => !slot.active);
    if (inactive) {
      return inactive;
    }

    let oldest = this.threatImpacts[0];
    for (const slot of this.threatImpacts) {
      if (slot.expiresAt < oldest.expiresAt) {
        oldest = slot;
      }
    }
    return oldest;
  }
}
