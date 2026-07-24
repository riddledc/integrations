import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  DURABLE_TEXT_TRANSITION_CONTRACT,
} from "riddle-proof-guided-web-change-experiment";

import {
  FIXED_DURABLE_SETTING_CONTRACT,
} from "../dist/application.js";

const leanSource = readFileSync(
  new URL(
    "../../../formal/riddle-proof-kernel/RiddleProofKernel/ProofGuidedWebChange.lean",
    import.meta.url,
  ),
  "utf8",
);

/*
 * This is a source-vocabulary drift check, not a claim that Lean executes or
 * verifies the TypeScript app. The repository's formal build separately asks
 * Lean to compile the complete kernel.
 */
test("the app pins its runtime contract and retains the Lean repair vocabulary", () => {
  assert.deepEqual(
    FIXED_DURABLE_SETTING_CONTRACT,
    {
      id: DURABLE_TEXT_TRANSITION_CONTRACT.id,
      version: DURABLE_TEXT_TRANSITION_CONTRACT.version,
      digest: DURABLE_TEXT_TRANSITION_CONTRACT.digest,
      protocol_version:
        DURABLE_TEXT_TRANSITION_CONTRACT.protocol_version,
      transition_id: DURABLE_TEXT_TRANSITION_CONTRACT.transition_id,
    },
    "the visible app pins the exact runtime contract used by the proof client",
  );

  for (const theorem of [
    "repair_preserves_pinned_contract",
    "repair_changes_subject_and_authority_not_contract",
    "changed_subject_cannot_reuse_attempt_result",
    "fresh_attempt_preserves_revision_and_changes_subject_and_authority",
    "fresh_attempt_cannot_reuse_previous_result",
    "durable_success_iff_every_checkpoint_passed",
    "complete_resolved_substantive_failure_is_nonconforming",
    "unresolved_dominates_substantive_failure",
  ]) {
    assert.match(
      leanSource,
      new RegExp(`\\btheorem ${theorem}\\b`, "u"),
      `Lean retains ${theorem}`,
    );
  }
  assert.match(
    leanSource,
    /A repair is another attempt prepared by the same pinned controller/u,
  );
  assert.match(
    leanSource,
    /one-shot consumption of the previous[\s\S]*remains a runtime obligation/u,
  );
  assert.match(
    leanSource,
    /Lean does not resolve a[\s\S]*inspect a browser[\s\S]*verify a signature/u,
    "the formal boundary remains explicit",
  );
  assert.doesNotMatch(leanSource, /\b(?:sorry|admit)\b/u);
});
