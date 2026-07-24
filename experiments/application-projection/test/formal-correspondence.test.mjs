import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * This is deliberately a source-level correspondence guard, not a claim that
 * Lean executes or verifies the TypeScript runtime. The Lean build proves the
 * projection invariants; the runtime suites execute the same hostile vectors.
 * These checks prevent their shared vocabulary and named obligations from
 * silently drifting apart.
 */
const lean = readFileSync(
  new URL(
    "../../../formal/riddle-proof-kernel/RiddleProofKernel/ApplicationProjection.lean",
    import.meta.url,
  ),
  "utf8",
);
const runtimeTypes = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
const browserExample = readFileSync(
  new URL("../examples/browser-publishing.ts", import.meta.url),
  "utf8",
);
const commercialExample = readFileSync(
  new URL("../examples/commercial-records.ts", import.meta.url),
  "utf8",
);

test("Lean and TypeScript retain the same four application dispositions", () => {
  const dispositions = [
    ["conforms", "conforms"],
    ["does_not_conform", "doesNotConform"],
    ["stale", "stale"],
    ["could_not_check", "couldNotCheck"],
  ];
  for (const [runtimeName, leanName] of dispositions) {
    assert.ok(
      runtimeTypes.includes(`| "${runtimeName}"`),
      `TypeScript disposition ${runtimeName} must remain explicit`,
    );
    assert.match(
      lean,
      new RegExp(`\\| ${leanName}\\b`, "u"),
      `Lean disposition ${leanName} must remain explicit`,
    );
  }
});

test("the formal kernel retains every runtime fail-closed obligation", () => {
  const obligations = [
    "disposition_conforms_iff_conformance_basis",
    "report_authority_mismatch_cannot_conform",
    "report_subject_mismatch_cannot_conform",
    "replacement_subject_requires_replacement_bound_report",
    "missing_required_requirement_cannot_conform",
    "duplicate_pinned_requirement_cannot_conform",
    "duplicate_reported_requirement_cannot_conform",
    "extra_reported_requirement_cannot_conform",
    "unresolved_requirement_cannot_project_does_not_conform",
    "unresolved_requirement_cannot_project_stale",
    "does_not_conform_implies_unestablished_distinct_root",
    "projected_finding_has_exact_failed_source",
    "projected_finding_evidence_is_in_exact_frontier",
    "missing_independent_requirement_evidence_could_not_be_checked",
    "progressive_views_share_exact_proof_id",
    "technical_view_expands_exact_full_binding_and_frontier",
    "projected_technical_view_expands_exact_pinned_authority",
    "commercial_failure_mixed_with_unresolved_could_not_be_checked",
  ];
  for (const obligation of obligations) {
    assert.match(
      lean,
      new RegExp(`\\b(?:theorem|def) ${obligation}\\b`, "u"),
      `missing Lean application-projection obligation ${obligation}`,
    );
  }
});

test("both domain examples bind the exact roots used by the Lean examples", () => {
  const roots = [
    [
      "riddle-proof.browser.durable-state-transition-observed",
      browserExample,
    ],
    [
      "riddle-proof.commercial-record.captured-fields-agree-under-policy",
      commercialExample,
    ],
  ];
  for (const [claimId, exampleSource] of roots) {
    assert.equal(
      lean.split(`"${claimId}"`).length - 1,
      1,
      `${claimId} must occur exactly once in the Lean application examples`,
    );
    assert.equal(
      exampleSource.split(`"${claimId}"`).length - 1,
      1,
      `${claimId} must occur exactly once in its TypeScript domain adapter`,
    );
  }
});
