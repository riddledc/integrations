import {
  assessRiddleProofProfileEvidence,
  type RiddleProofProfile,
  type RiddleProofProfileEvidence,
} from "@riddledc/riddle-proof";

export type LocalRunnerCheckResult = {
  status: "passed" | "failed" | "proof_insufficient" | "environment_blocked";
};

export function evaluateRiddleProofChecks(
  profile: RiddleProofProfile,
  evidence: RiddleProofProfileEvidence,
  options?: {
    runner?: string;
  },
) {
  const result = assessRiddleProofProfileEvidence(profile, evidence, {
    runner: options?.runner || "local-playwright",
  });
  return result;
}

export function makeEmptyCheckResult(): LocalRunnerCheckResult {
  return { status: "proof_insufficient" };
}
