import serializedWeights from "./assets/boxerAiWeights.json";
import { loadBoxerAiWeights, runBoxerAiInference, type BoxerAiModelWeights } from "./gruRuntime";
import type { TrajectoryPredictor } from "./trajectoryPredictor";
import type { FeatureSequence, ModelOutput } from "../types/game";
import { SEQUENCE_LENGTH } from "../game/constants";

/** Browser-side predictor that mirrors the boxer_ai GRU inference stack. */
export class BoxerAiPredictor implements TrajectoryPredictor {
  readonly mode = "real" as const;
  private weights: BoxerAiModelWeights | null = null;

  async initialize(): Promise<void> {
    if (this.weights !== null) {
      return;
    }

    this.weights = loadBoxerAiWeights(serializedWeights);
  }

  async predict(sequence: FeatureSequence): Promise<ModelOutput | null> {
    if (this.weights === null) {
      throw new Error("BoxerAiPredictor.initialize() must be called before predict().");
    }

    if (sequence.length < SEQUENCE_LENGTH) {
      return null;
    }

    return runBoxerAiInference(this.weights, sequence.slice(-SEQUENCE_LENGTH));
  }
}
