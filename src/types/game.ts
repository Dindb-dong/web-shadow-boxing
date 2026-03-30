export type StateName = "idle" | "attacking";
export type DodgeType = "left_weave" | "right_weave" | "left_duck" | "right_duck";
export type GuardResult = "guarded" | "hit" | "none";
export type ModelMode = "mock" | "real";
export type CounterMove =
  | "left_hook"
  | "right_hook"
  | "left_uppercut"
  | "right_uppercut"
  | "left_straight"
  | "right_straight";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PoseOverlayPoint {
  x: number;
  y: number;
  visibility: number;
}

export interface Basis {
  shoulderCenter: Vec3;
  shoulderScale: number;
}

export interface PoseFrame {
  timestamp: number;
  nose: Vec3 | null;
  leftShoulder: Vec3 | null;
  leftElbow: Vec3 | null;
  leftWrist: Vec3 | null;
  rightShoulder: Vec3 | null;
  rightElbow: Vec3 | null;
  rightWrist: Vec3 | null;
}

export interface ResolvedPoseFrame {
  timestamp: number;
  nose: Vec3;
  leftShoulder: Vec3;
  leftElbow: Vec3;
  leftWrist: Vec3;
  rightShoulder: Vec3;
  rightElbow: Vec3;
  rightWrist: Vec3;
  interpolated: boolean;
}

export interface NormalizedPoseFrame {
  timestamp: number;
  basis: Basis;
  nose: Vec3;
  leftShoulder: Vec3;
  leftElbow: Vec3;
  leftWrist: Vec3;
  rightShoulder: Vec3;
  rightElbow: Vec3;
  rightWrist: Vec3;
  interpolated: boolean;
}

export type FeatureFrame = number[];
export type FeatureSequence = FeatureFrame[];
export type WristTrajectory = [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3];
export type WristPairTrajectory = [WristTrajectory, WristTrajectory];

export interface ModelOutput {
  state_idx: number;
  state_name: StateName;
  attacking_prob: number;
  traj: WristPairTrajectory;
  raw: unknown;
}

export interface PredictionFrame {
  model: ModelOutput;
  basis: Basis;
}

export interface ThreatSnapshot {
  stateName: StateName;
  attackingProb: number;
  active: boolean;
  expiresAt: number | null;
}

export interface CombatSnapshot {
  aiHp: number;
  playerHp: number;
  aiStamina: number;
  successfulHits: number;
  guardedCounters: number;
  tracking: boolean;
  modelMode: ModelMode;
  activeThreat: ThreatSnapshot;
  lastGuardResult: GuardResult;
  counterState: "idle" | "primed" | "resolved";
  counterMove: CounterMove | null;
  statusText: string;
  dodgeType: DodgeType | null;
}

export interface CounterTrigger {
  move: CounterMove;
  result: GuardResult;
  target: Vec3;
}

export interface HudSnapshot extends CombatSnapshot {
  trackingLabel: string;
  stateLabel: string;
  attackingProbLabel: string;
}
