import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  RIDDLE_PROOF_BROWSER_CHECK_REPORT_ROLES,
  RIDDLE_PROOF_BROWSER_CHECK_REPORT_STATUSES,
} from "../dist/src/index.js";

const leanSource = readFileSync(
  new URL(
    "../../../formal/riddle-proof-kernel/RiddleProofKernel/ProofGuidedWebChange.lean",
    import.meta.url,
  ),
  "utf8",
);

/*
 * This is deliberately a source-vocabulary drift check, not a claim that Lean
 * executes or verifies the TypeScript. The package test separately runs the
 * Lean compiler over the complete kernel.
 */
test("runtime vocabulary retains the compiled Lean decision model boundary", () => {
  assert.deepEqual(
    RIDDLE_PROOF_BROWSER_CHECK_REPORT_ROLES,
    ["before", "action", "reload", "fresh_context"],
  );
  assert.deepEqual(
    RIDDLE_PROOF_BROWSER_CHECK_REPORT_STATUSES,
    [
      "passed",
      "product_regression",
      "proof_insufficient",
      "environment_blocked",
    ],
  );

  for (const constructor of [
    "passed",
    "productRegression",
    "proofInsufficient",
    "environmentBlocked",
  ]) {
    assert.match(
      leanSource,
      new RegExp(`\\| ${constructor}\\b`, "u"),
      `Lean retains CheckOutcome.${constructor}`,
    );
  }
  for (const theorem of [
    "prepared_attempt_uses_exact_resolver_scope_and_contract_derived_subject_and_authority",
    "subject_deterministically_depends_on_contract_and_scope",
    "authority_deterministically_depends_on_contract_and_scope",
    "repair_preserves_pinned_contract",
    "changed_subject_cannot_reuse_unhashed_authority",
    "changed_subject_cannot_reuse_attempt_result",
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
    /structure ResolvedScope where\s+repository : String\s+candidateRevision : String\s+environment : String\s+targetIdentity : String/u,
    "the resolver boundary contains only repository/revision/environment/target scope",
  );
  assert.match(
    leanSource,
    /structure Controller where\s+pinnedContract : PinnedChangeContract\s+resolveScope : CandidateRef → Option ResolvedScope\s+subjectFor : PinnedChangeContract → ResolvedScope → SubjectRef\s+expectedRootFor : AuthorityMaterial → ClaimKey/u,
    "the controller pins the contract, resolves scope, and separately derives the subject",
  );
  assert.doesNotMatch(
    leanSource,
    /\bresolveSubject\b/u,
    "a resolver must never supply a full subject",
  );
  assert.match(
    leanSource,
    /def deriveSubject[\s\S]*?subject := controller\.subjectFor controller\.pinnedContract scope\s+scope := scope/u,
    "subject construction consumes the controller's pinned contract and exact resolved scope",
  );
  assert.match(
    leanSource,
    /def prepareAttempt[\s\S]*?match controller\.resolveScope candidateRef with[\s\S]*?\| some scope =>[\s\S]*?resolvedScope := scope\s+resolvedSubject := controller\.deriveSubject scope\s+authority := controller\.deriveAuthority scope/u,
    "attempt preparation derives subject and authority after scope resolution",
  );
  assert.match(
    leanSource,
    /theorem prepared_attempt_uses_exact_resolver_scope_and_contract_derived_subject_and_authority[\s\S]*?controller\.resolveScope candidateRef = some attempt\.resolvedScope[\s\S]*?attempt\.resolvedSubject =\s+controller\.deriveSubject attempt\.resolvedScope[\s\S]*?attempt\.authority =\s+controller\.deriveAuthority attempt\.resolvedScope/u,
    "the compiled theorem binds prepared attempts to exact scope and contract-derived subject/authority",
  );

  assert.match(
    leanSource,
    /Lean does not resolve a[\s\S]*inspect a browser[\s\S]*verify a signature/u,
  );
  assert.doesNotMatch(leanSource, /\b(?:sorry|admit)\b/u);
});
