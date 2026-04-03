import type { FeatureSequence, ModelOutput } from "../types/game";

/** Describes the predictor contract used by the game controller. */
export interface TrajectoryPredictor {
  initialize(): Promise<void>;
  predict(sequence: FeatureSequence): Promise<ModelOutput | null>;
  readonly mode: "mock" | "real";
}
