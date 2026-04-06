import type { ModelOutput, Vec3, WristPairTrajectory } from "../types/game";

export interface SerializedTensor {
  shape: number[];
  data: unknown;
}

export interface SerializedWeights {
  config: {
    input_dim?: number;
    hidden_dim?: number;
    num_layers?: number;
    dropout?: number;
    future_steps?: number;
  };
  tensors: Record<string, SerializedTensor>;
}

interface TensorView {
  shape: number[];
  data: Float32Array;
}

export interface BoxerAiModelWeights {
  readonly inputDim: number;
  readonly hiddenDim: number;
  readonly futureSteps: number;
  readonly gruWeightInput: TensorView;
  readonly gruWeightHidden: TensorView;
  readonly gruBiasInput: TensorView;
  readonly gruBiasHidden: TensorView;
  readonly stateHiddenWeight: TensorView;
  readonly stateHiddenBias: TensorView;
  readonly stateOutputWeight: TensorView;
  readonly stateOutputBias: TensorView;
  readonly trajectoryHiddenWeight: TensorView;
  readonly trajectoryHiddenBias: TensorView;
  readonly trajectoryOutputWeight: TensorView;
  readonly trajectoryOutputBias: TensorView;
}

function flattenTensorData(data: unknown, target: number[]): void {
  if (Array.isArray(data)) {
    data.forEach((value) => flattenTensorData(value, target));
    return;
  }

  if (typeof data !== "number") {
    throw new Error("Serialized tensor data must contain only numeric values.");
  }

  target.push(data);
}

function toTensorView(serialized: SerializedTensor): TensorView {
  const values: number[] = [];
  flattenTensorData(serialized.data, values);

  return {
    shape: [...serialized.shape],
    data: Float32Array.from(values)
  };
}

function getRequiredTensor(tensors: Record<string, SerializedTensor>, name: string): TensorView {
  const tensor = tensors[name];
  if (!tensor) {
    throw new Error(`Missing tensor in boxer_ai export: ${name}`);
  }
  return toTensorView(tensor);
}

/** Hydrates one exported boxer_ai checkpoint into typed weight views. */
export function loadBoxerAiWeights(serialized: SerializedWeights): BoxerAiModelWeights {
  return {
    inputDim: serialized.config.input_dim ?? 54,
    hiddenDim: serialized.config.hidden_dim ?? 128,
    futureSteps: serialized.config.future_steps ?? 6,
    gruWeightInput: getRequiredTensor(serialized.tensors, "gru.weight_ih_l0"),
    gruWeightHidden: getRequiredTensor(serialized.tensors, "gru.weight_hh_l0"),
    gruBiasInput: getRequiredTensor(serialized.tensors, "gru.bias_ih_l0"),
    gruBiasHidden: getRequiredTensor(serialized.tensors, "gru.bias_hh_l0"),
    stateHiddenWeight: getRequiredTensor(serialized.tensors, "state_head.0.weight"),
    stateHiddenBias: getRequiredTensor(serialized.tensors, "state_head.0.bias"),
    stateOutputWeight: getRequiredTensor(serialized.tensors, "state_head.2.weight"),
    stateOutputBias: getRequiredTensor(serialized.tensors, "state_head.2.bias"),
    trajectoryHiddenWeight: getRequiredTensor(serialized.tensors, "traj_head.0.weight"),
    trajectoryHiddenBias: getRequiredTensor(serialized.tensors, "traj_head.0.bias"),
    trajectoryOutputWeight: getRequiredTensor(serialized.tensors, "traj_head.2.weight"),
    trajectoryOutputBias: getRequiredTensor(serialized.tensors, "traj_head.2.bias")
  };
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function relu(value: number): number {
  return value > 0 ? value : 0;
}

function multiplyMatrixVector(weight: TensorView, input: Float32Array): Float32Array {
  const [rows, cols] = weight.shape;
  if (input.length !== cols) {
    throw new Error(`Matrix/vector shape mismatch: expected ${cols}, received ${input.length}`);
  }

  const result = new Float32Array(rows);
  for (let row = 0; row < rows; row += 1) {
    const offset = row * cols;
    let sum = 0;
    for (let col = 0; col < cols; col += 1) {
      sum += weight.data[offset + col] * input[col];
    }
    result[row] = sum;
  }
  return result;
}

function addBias(values: Float32Array, bias: TensorView): Float32Array {
  if (bias.data.length !== values.length) {
    throw new Error(`Bias shape mismatch: expected ${values.length}, received ${bias.data.length}`);
  }

  const result = new Float32Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    result[index] = values[index] + bias.data[index];
  }
  return result;
}

function linear(weight: TensorView, bias: TensorView, input: Float32Array): Float32Array {
  return addBias(multiplyMatrixVector(weight, input), bias);
}

function runGru(weights: BoxerAiModelWeights, sequence: number[][]): Float32Array {
  const hidden = new Float32Array(weights.hiddenDim);
  const gateSize = weights.hiddenDim;

  for (const frame of sequence) {
    const x = Float32Array.from(frame);
    const gateInput = addBias(multiplyMatrixVector(weights.gruWeightInput, x), weights.gruBiasInput);
    const gateHidden = addBias(multiplyMatrixVector(weights.gruWeightHidden, hidden), weights.gruBiasHidden);
    const nextHidden = new Float32Array(weights.hiddenDim);

    for (let index = 0; index < gateSize; index += 1) {
      const resetGate = sigmoid(gateInput[index] + gateHidden[index]);
      const updateGate = sigmoid(gateInput[gateSize + index] + gateHidden[gateSize + index]);
      const newGate = Math.tanh(
        gateInput[gateSize * 2 + index] + resetGate * gateHidden[gateSize * 2 + index]
      );
      nextHidden[index] = (1 - updateGate) * newGate + updateGate * hidden[index];
    }

    hidden.set(nextHidden);
  }

  return hidden;
}

function softmax(logits: Float32Array): Float32Array {
  const max = Math.max(...logits);
  const exp = Float32Array.from(logits, (value) => Math.exp(value - max));
  const sum = exp.reduce((accumulator, value) => accumulator + value, 0);
  return Float32Array.from(exp, (value) => value / sum);
}

function reshapeTrajectory(flat: Float32Array, futureSteps: number): WristPairTrajectory {
  const traj: Vec3[][] = [[], []];
  let cursor = 0;

  for (let wristIndex = 0; wristIndex < 2; wristIndex += 1) {
    for (let stepIndex = 0; stepIndex < futureSteps; stepIndex += 1) {
      traj[wristIndex].push({
        x: flat[cursor],
        y: flat[cursor + 1],
        z: flat[cursor + 2]
      });
      cursor += 3;
    }
  }

  return traj as WristPairTrajectory;
}

/** Runs one boxer_ai GRU forward pass and converts it into the shared app contract. */
export function runBoxerAiInference(
  weights: BoxerAiModelWeights,
  sequence: number[][]
): ModelOutput {
  if (sequence.length === 0) {
    throw new Error("boxer_ai inference requires at least one feature frame.");
  }

  const hiddenState = runGru(weights, sequence);
  const stateHidden = Float32Array.from(
    linear(weights.stateHiddenWeight, weights.stateHiddenBias, hiddenState),
    relu
  );
  const stateLogits = linear(weights.stateOutputWeight, weights.stateOutputBias, stateHidden);
  const stateProb = softmax(stateLogits);
  const stateIdx = stateProb[1] >= stateProb[0] ? 1 : 0;

  const trajectoryHidden = Float32Array.from(
    linear(weights.trajectoryHiddenWeight, weights.trajectoryHiddenBias, hiddenState),
    relu
  );
  const trajectoryFlat = linear(
    weights.trajectoryOutputWeight,
    weights.trajectoryOutputBias,
    trajectoryHidden
  );

  return {
    state_idx: stateIdx,
    state_name: stateIdx === 1 ? "attacking" : "idle",
    attacking_prob: stateProb[1],
    traj: reshapeTrajectory(trajectoryFlat, weights.futureSteps),
    raw: {
      state_logits: Array.from(stateLogits),
      state_prob: Array.from(stateProb)
    }
  };
}
