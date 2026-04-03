import { CombatSystem } from "../../src/game/combatSystem";
import { trajectoryToWorld } from "../../src/game/worldMapping";
import { BoxerAiPredictor } from "../../src/model/boxerAiPredictor";
import { PoseSequenceBuffer } from "../../src/pose/featureEngineering";
import type { PoseFrame, ResolvedPoseFrame, Vec3 } from "../../src/types/game";

function createResolvedPunchFrame(timestamp: number, rightWrist: Vec3): ResolvedPoseFrame {
  return {
    timestamp,
    nose: { x: 0, y: 0.31, z: 0 },
    leftShoulder: { x: -0.28, y: 0.22, z: 0.02 },
    leftElbow: { x: -0.36, y: 0.12, z: -0.04 },
    leftWrist: { x: -0.24, y: 0.16, z: -0.02 },
    rightShoulder: { x: 0.28, y: 0.22, z: 0.02 },
    rightElbow: { x: 0.34, y: 0.16, z: -0.08 },
    rightWrist,
    interpolated: false
  };
}

function toPoseFrame(frame: ResolvedPoseFrame): PoseFrame {
  return {
    timestamp: frame.timestamp,
    nose: frame.nose,
    leftShoulder: frame.leftShoulder,
    leftElbow: frame.leftElbow,
    leftWrist: frame.leftWrist,
    rightShoulder: frame.rightShoulder,
    rightElbow: frame.rightElbow,
    rightWrist: frame.rightWrist
  };
}

describe("trajectory pipeline", () => {
  it("turns a punch-like pose sequence into a valid boxer_ai prediction and world trajectory", async () => {
    const rightPunchFrames: Vec3[] = [
      { x: 0.22, y: 0.16, z: -0.02 },
      { x: 0.23, y: 0.17, z: -0.04 },
      { x: 0.24, y: 0.18, z: -0.06 },
      { x: 0.27, y: 0.18, z: -0.1 },
      { x: 0.31, y: 0.2, z: -0.16 },
      { x: 0.36, y: 0.22, z: -0.24 },
      { x: 0.41, y: 0.24, z: -0.33 },
      { x: 0.46, y: 0.25, z: -0.42 },
      { x: 0.5, y: 0.25, z: -0.48 },
      { x: 0.52, y: 0.25, z: -0.5 },
      { x: 0.52, y: 0.25, z: -0.5 },
      { x: 0.52, y: 0.25, z: -0.5 }
    ];
    const resolvedFrames = rightPunchFrames.map((rightWrist, index) =>
      createResolvedPunchFrame(index, rightWrist)
    );
    const predictor = new BoxerAiPredictor();
    const buffer = new PoseSequenceBuffer();
    await predictor.initialize();

    let latest = buffer.push(toPoseFrame(resolvedFrames[0]));
    for (let index = 1; index < resolvedFrames.length; index += 1) {
      latest = buffer.push(toPoseFrame(resolvedFrames[index]));
    }

    expect(latest.ready).toBe(true);
    expect(latest.basis).not.toBeNull();

    const output = await predictor.predict(latest.features);

    expect(output).not.toBeNull();
    expect(output?.attacking_prob).toBeGreaterThan(0);
    expect(output?.attacking_prob).toBeLessThanOrEqual(1);
    expect(output?.traj[0]).toHaveLength(6);
    expect(output?.traj[1]).toHaveLength(6);

    const worldTraj = trajectoryToWorld(output!.traj, latest.basis!);
    const system = new CombatSystem(() => 0.99);
    const result = system.update({
      now: 100,
      modelMode: predictor.mode,
      tracking: true,
      output: output!,
      worldTraj,
      userPose: resolvedFrames[resolvedFrames.length - 1]
    });

    expect(worldTraj[1][5].z).toBeLessThan(worldTraj[1][0].z);
    expect(Math.abs(worldTraj[1][5].x)).toBeLessThanOrEqual(Math.abs(worldTraj[1][0].x));
    expect(result.snapshot.activeThreat.attackingProb).toBeCloseTo(output!.attacking_prob);
  });
});
