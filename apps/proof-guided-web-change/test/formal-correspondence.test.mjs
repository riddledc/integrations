import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  DURABLE_TEXT_TRANSITION_CONTRACT,
} from "riddle-proof-guided-web-change-experiment";
import {
  CTA_REQUIREMENT_IDS,
  PINNED_CTA_CHANGE_CONTRACT,
} from "riddle-proof-guided-cta-change-experiment";

import {
  FIXED_DURABLE_SETTING_CONTRACT,
} from "../dist/application.js";
import {
  CTA_MUTATION_POLICY_DIGEST,
} from "../dist/cta-agent.js";
import {
  FIXED_CTA_CHANGE_CONTRACT,
} from "../dist/cta-application.js";

const proofGuidedWebChangeLeanSource = readFileSync(
  new URL(
    "../../../formal/riddle-proof-kernel/RiddleProofKernel/ProofGuidedWebChange.lean",
    import.meta.url,
  ),
  "utf8",
);
const ctaWebChangeLeanSource = readFileSync(
  new URL(
    "../../../formal/riddle-proof-kernel/RiddleProofKernel/CtaWebChange.lean",
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
      proofGuidedWebChangeLeanSource,
      new RegExp(`\\btheorem ${theorem}\\b`, "u"),
      `Lean retains ${theorem}`,
    );
  }
  assert.match(
    proofGuidedWebChangeLeanSource,
    /A repair is another attempt prepared by the same pinned controller/u,
  );
  assert.match(
    proofGuidedWebChangeLeanSource,
    /one-shot consumption of the previous[\s\S]*remains a runtime obligation/u,
  );
  assert.match(
    proofGuidedWebChangeLeanSource,
    /Lean does not resolve a[\s\S]*inspect a browser[\s\S]*verify a signature/u,
    "the formal boundary remains explicit",
  );
  assert.doesNotMatch(
    proofGuidedWebChangeLeanSource,
    /\b(?:sorry|admit)\b/u,
  );
});

test("the CTA runtime vocabulary remains aligned with its bounded Lean model", () => {
  assert.deepEqual(
    FIXED_CTA_CHANGE_CONTRACT,
    {
      id: PINNED_CTA_CHANGE_CONTRACT.id,
      version: PINNED_CTA_CHANGE_CONTRACT.version,
      digest: PINNED_CTA_CHANGE_CONTRACT.digest,
      protocol_version:
        PINNED_CTA_CHANGE_CONTRACT.protocol_version,
    },
    "the CTA app pins the exact runtime contract used by the proof client",
  );

  const runtimeRequirementIds =
    PINNED_CTA_CHANGE_CONTRACT.requirements.map(
      ({ requirement_id: requirementId }) => requirementId,
    );
  assert.deepEqual(
    runtimeRequirementIds,
    [...CTA_REQUIREMENT_IDS],
    "the executable CTA contract retains the exact four ordered requirement IDs",
  );

  const leanRequirementList = ctaWebChangeLeanSource.match(
    /def ctaRequirementIds\s*:\s*List String\s*:=\s*\[([\s\S]*?)\]/u,
  );
  assert.ok(
    leanRequirementList,
    "Lean retains the concrete CTA requirement list",
  );
  const leanRequirementIds = [
    ...leanRequirementList[1].matchAll(/"([^"]+)"/gu),
  ].map((match) => match[1]);
  assert.deepEqual(
    leanRequirementIds,
    runtimeRequirementIds,
    "Lean and the runtime contract use the same exact four requirement IDs and order",
  );

  for (const theorem of [
    "prepared_proposal_is_bound_to_exact_input_and_resolved_revision",
    "prepared_proposal_preserves_pinned_contract_and_policy",
    "changed_revision_invalidates_previous_result",
    "projection_input_preserves_pinned_authority",
    "projection_input_preserves_runtime_report",
    "conforming_prepared_change_requires_current_verified_new_subject",
  ]) {
    assert.match(
      proofGuidedWebChangeLeanSource,
      new RegExp(`\\btheorem ${theorem}\\b`, "u"),
      `the generic Lean model retains ${theorem}`,
    );
  }

  for (const theorem of [
    "cta_requirement_ids_are_exactly_four_and_nodup",
    "pinned_cta_required_ids_are_exact",
    "conforming_cta_change_has_exact_coverage_and_all_passed",
    "conforming_prepared_cta_change_requires_current_verified_new_subject_and_exact_requirements",
  ]) {
    assert.match(
      ctaWebChangeLeanSource,
      new RegExp(`\\btheorem ${theorem}\\b`, "u"),
      `the CTA Lean model retains ${theorem}`,
    );
  }

  for (const structure of [
    "PinnedMutationPolicy",
    "ChangeProposal",
    "ChangeController",
    "PreparedChangeProposal",
  ]) {
    assert.match(
      proofGuidedWebChangeLeanSource,
      new RegExp(`\\bstructure ${structure}\\b`, "u"),
      `the bounded proposal model retains ${structure}`,
    );
  }

  assert.match(
    CTA_MUTATION_POLICY_DIGEST,
    /^sha256:[0-9a-f]{64}$/u,
    "the runtime pins a complete SHA-256 mutation-policy digest",
  );

  assert.match(
    proofGuidedWebChangeLeanSource,
    /Lean does not resolve a[\s\S]*inspect a browser[\s\S]*verify a signature[\s\S]*prove collision resistance/u,
    "the generic formal file leaves browser, signature, and cryptographic facts at the runtime boundary",
  );
  assert.match(
    proofGuidedWebChangeLeanSource,
    /Lean does not hash source bytes[\s\S]*inspect a diff[\s\S]*authenticate the agent/u,
    "the generic formal file leaves proposal bytes, diffs, and agent identity at the runtime boundary",
  );
  assert.match(
    ctaWebChangeLeanSource,
    /Lean does not inspect the CTA[\s\S]*browser capture[\s\S]*signatures, or hashes[\s\S]*runtime premises/u,
    "the CTA formal file explicitly treats captured browser and cryptographic facts as runtime premises",
  );
  assert.doesNotMatch(
    `${proofGuidedWebChangeLeanSource}\n${ctaWebChangeLeanSource}`,
    /\b(?:sorry|admit)\b/u,
  );
});
