import { describe, expect, it } from "vitest";
import {
  biasTargetTowardViewer,
  resolveRenderableThreatPath,
  resolveElbowPole,
  resolveFingerCurlPose,
  resolveArmInwardTwist,
  resolveArmRigPose,
  resolveArmViewOrder,
  resolveGuardAnchorX,
  resolveGuardAnchorY,
  resolveGuardAnchorZ,
  solveLimbJoint,
  type ArmRigInputs
} from "../../src/render/sceneManager";
import type { Vec3 } from "../../src/types/game";

const BASE_INPUTS: ArmRigInputs = {
  idleSwing: 0,
  idleDip: 0,
  dodgeType: null,
  dodgeProgress: 0,
  counterMove: null,
  counterProgress: 0,
  targetLocal: null,
  victoryProgress: null
};

/** Measures Euclidean distance between two 3D points. */
function distance3(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

describe("resolveArmRigPose", () => {
  it("keeps both gloves in a raised boxing guard at rest", () => {
    const pose = resolveArmRigPose(BASE_INPUTS);

    expect(pose.leftWrist.y).toBeGreaterThan(pose.leftShoulder.y);
    expect(pose.rightWrist.y).toBeGreaterThan(pose.rightShoulder.y);
    expect(pose.leftWrist.z).toBeGreaterThan(pose.leftShoulder.z);
    expect(pose.rightWrist.z).toBeGreaterThan(pose.rightShoulder.z);
    expect(pose.leftElbow.y).toBeLessThan(pose.leftWrist.y);
    expect(pose.rightElbow.y).toBeLessThan(pose.rightWrist.y);
    expect(pose.leftWrist.x).toBeLessThan(0);
    expect(pose.rightWrist.x).toBeGreaterThan(0);
  });

  it("pushes the active glove toward the counter target while the rear hand stays guarding", () => {
    const guardPose = resolveArmRigPose(BASE_INPUTS);
    const target = { x: 0.02, y: 2.02, z: -0.86 };
    const pose = resolveArmRigPose({
      ...BASE_INPUTS,
      counterMove: "right_straight",
      counterProgress: 0.68,
      targetLocal: target
    });

    expect(distance3(pose.rightWrist, target)).toBeLessThan(0.3);
    expect(distance3(pose.leftWrist, guardPose.leftWrist)).toBeLessThan(0.18);
    expect(pose.rightWrist.z).toBeGreaterThan(guardPose.rightWrist.z);
    expect(pose.rightElbow.z).toBeGreaterThan(guardPose.rightElbow.z);
  });

  it("drops both gloves when the avatar enters the downed state", () => {
    const guardPose = resolveArmRigPose(BASE_INPUTS);
    const downPose = resolveArmRigPose({
      ...BASE_INPUTS,
      victoryProgress: 1
    });

    expect(downPose.leftWrist.y).toBeLessThan(guardPose.leftWrist.y - 0.6);
    expect(downPose.rightWrist.y).toBeLessThan(guardPose.rightWrist.y - 0.85);
    expect(downPose.leftElbow.y).toBeLessThan(guardPose.leftElbow.y - 0.35);
    expect(downPose.rightElbow.y).toBeLessThan(guardPose.rightElbow.y - 0.35);
  });
});

describe("solveLimbJoint", () => {
  it("returns a reachable elbow point that preserves both arm segment lengths", () => {
    const shoulder = { x: 0, y: 0, z: 0 };
    const target = { x: 0.2, y: 0.75, z: 0.25 };
    const elbow = solveLimbJoint(shoulder, target, 0.52, 0.48, { x: 0.6, y: -0.2, z: 0.8 });

    expect(distance3(shoulder, elbow)).toBeCloseTo(0.52, 5);
    expect(distance3(elbow, target)).toBeCloseTo(0.48, 5);
    expect(elbow.z).toBeGreaterThan(0);
  });
});

describe("resolveArmViewOrder", () => {
  it("swaps anatomical arm labels when the fighter faces the camera", () => {
    const order = resolveArmViewOrder(0.34, -0.31);

    expect(order.screenLeftFrom).toBe("right");
    expect(order.screenRightFrom).toBe("left");
  });
});

describe("resolveRenderableThreatPath", () => {
  it("renders only the dominant attacking wrist path when one hand clearly drives the punch", () => {
    const leftDominant = resolveRenderableThreatPath([
      [
        { x: 1.95, y: 1.58, z: -0.98 },
        { x: 1.62, y: 1.62, z: -1.14 },
        { x: 1.28, y: 1.66, z: -1.31 },
        { x: 0.92, y: 1.71, z: -1.48 },
        { x: 0.56, y: 1.76, z: -1.67 },
        { x: 0.24, y: 1.79, z: -1.84 }
      ],
      [
        { x: -0.62, y: 1.39, z: -0.98 },
        { x: -0.61, y: 1.39, z: -1.01 },
        { x: -0.6, y: 1.39, z: -1.02 },
        { x: -0.6, y: 1.39, z: -1.03 },
        { x: -0.59, y: 1.39, z: -1.03 },
        { x: -0.59, y: 1.39, z: -1.03 }
      ]
    ]);

    const rightDominant = resolveRenderableThreatPath([
      [
        { x: 0.61, y: 1.38, z: -0.98 },
        { x: 0.61, y: 1.38, z: -1.01 },
        { x: 0.6, y: 1.38, z: -1.02 },
        { x: 0.6, y: 1.38, z: -1.02 },
        { x: 0.59, y: 1.38, z: -1.03 },
        { x: 0.59, y: 1.38, z: -1.03 }
      ],
      [
        { x: -1.94, y: 1.57, z: -0.98 },
        { x: -1.6, y: 1.61, z: -1.15 },
        { x: -1.25, y: 1.66, z: -1.32 },
        { x: -0.89, y: 1.71, z: -1.5 },
        { x: -0.54, y: 1.75, z: -1.68 },
        { x: -0.24, y: 1.79, z: -1.84 }
      ]
    ]);

    expect(leftDominant[0].x).toBeGreaterThan(1.8);
    expect(leftDominant[5].x).toBeCloseTo(0.24);
    expect(rightDominant[0].x).toBeLessThan(-1.8);
    expect(rightDominant[5].x).toBeCloseTo(-0.24);
  });
});

describe("biasTargetTowardViewer", () => {
  it("pulls the wrist target toward the camera so guard fists stay in front", () => {
    const target = { x: 0, y: 1.5, z: -2 };
    const viewer = { x: 0, y: 1.7, z: 1.2 };
    const biased = biasTargetTowardViewer(target, viewer, 0.22);

    expect(biased.z).toBeGreaterThan(target.z);
    expect(distance3(target, biased)).toBeCloseTo(0.22, 5);
  });
});

describe("resolveGuardAnchorX", () => {
  it("keeps the default left and right guard anchors on their own side of the face", () => {
    const leftX = resolveGuardAnchorX(-0.31, 0, -1);
    const rightX = resolveGuardAnchorX(0.33, 0, 1);

    expect(leftX).toBeLessThan(-0.23);
    expect(rightX).toBeGreaterThan(0.23);
    expect(leftX).toBeLessThan(rightX);
  });
});

describe("resolveGuardAnchorZ", () => {
  it("keeps the raised guard slightly in front of the head plane", () => {
    expect(resolveGuardAnchorZ(-1.95)).toBeCloseTo(-1.87);
  });
});

describe("resolveGuardAnchorY", () => {
  it("keeps the guard near eyebrow height instead of dropping toward the chest", () => {
    expect(resolveGuardAnchorY(1.8)).toBeCloseTo(1.9);
  });
});

describe("resolveArmInwardTwist", () => {
  it("twists left and right arms inward toward the face with opposite signs", () => {
    expect(resolveArmInwardTwist(-1)).toBeCloseTo(1.08);
    expect(resolveArmInwardTwist(1)).toBeCloseTo(-1.08);
  });
});

describe("resolveElbowPole", () => {
  it("keeps both elbow poles tucked instead of flaring wide", () => {
    const leftPole = resolveElbowPole(-1);
    const rightPole = resolveElbowPole(1);

    expect(leftPole.x).toBeLessThan(0);
    expect(rightPole.x).toBeGreaterThan(0);
    expect(Math.abs(leftPole.x)).toBeLessThan(0.3);
    expect(Math.abs(rightPole.x)).toBeLessThan(0.3);
    expect(leftPole.y).toBeLessThan(-0.8);
    expect(rightPole.y).toBeLessThan(-0.8);
  });
});

describe("resolveFingerCurlPose", () => {
  it("uses a deeper thumb opposition pose instead of leaving the thumb extended", () => {
    const thumbProximal = resolveFingerCurlPose("L_Thumb_Proximal", -1);
    const thumbDistal = resolveFingerCurlPose("L_Thumb_Distal", -1);

    expect(thumbProximal.x).toBeGreaterThan(0.8);
    expect(Math.abs(thumbProximal.y)).toBeGreaterThan(0.35);
    expect(Math.abs(thumbProximal.z)).toBeGreaterThan(0.65);
    expect(thumbDistal.scale).toBeLessThan(0.95);
  });

  it("keeps the pinky tighter than the index while also drawing it inward for a fist cup", () => {
    const pinkyProximal = resolveFingerCurlPose("R_Pinky_Proximal", 1);
    const indexProximal = resolveFingerCurlPose("R_Index_Proximal", 1);

    expect(pinkyProximal.x).toBeGreaterThan(indexProximal.x);
    expect(pinkyProximal.scale).toBeLessThan(indexProximal.scale);
    expect(pinkyProximal.y).toBeGreaterThan(0.1);
    expect(pinkyProximal.z).toBeLessThan(-0.3);
  });

  it("treats Little finger bones as the pinky chain used by the Titan Boxer rig", () => {
    const littleProximal = resolveFingerCurlPose("R_Little_Proximal", 1);
    const pinkyProximal = resolveFingerCurlPose("R_Pinky_Proximal", 1);

    expect(littleProximal).toEqual(pinkyProximal);
  });
});
