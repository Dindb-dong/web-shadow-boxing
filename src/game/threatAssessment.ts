import { THREAT_PROBABILITY_THRESHOLD } from "./constants";
import { isThreateningOutput } from "../model/modelAdapter";
import type { ModelOutput } from "../types/game";

export const TRAJECTORY_RENDER_PROBABILITY_THRESHOLD = 0.62;

/** Returns whether a threatening trajectory should emit exactly once for a new punch window. */
export function shouldEmitThreatTrajectory(
  previousOutput: ModelOutput | null,
  nextOutput: ModelOutput | null
): boolean {
  const previousThreat =
    previousOutput !== null &&
    previousOutput.state_name === "attacking" &&
    previousOutput.attacking_prob >= TRAJECTORY_RENDER_PROBABILITY_THRESHOLD &&
    isThreateningOutput(previousOutput, THREAT_PROBABILITY_THRESHOLD);
  const nextThreat =
    nextOutput !== null &&
    nextOutput.state_name === "attacking" &&
    nextOutput.attacking_prob >= TRAJECTORY_RENDER_PROBABILITY_THRESHOLD &&
    isThreateningOutput(nextOutput, THREAT_PROBABILITY_THRESHOLD);

  return !previousThreat && nextThreat;
}
