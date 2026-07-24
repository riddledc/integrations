import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applicationAuthorityRef,
  inspectApplicationResult,
  projectApplicationResult,
} from "../dist/src/index.js";
import {
  BROWSER_PUBLISHING_REQUIREMENT_CLAIMS,
  createBrowserPublishingAuthority,
  createBrowserPublishingSubject,
} from "../dist/examples/browser-publishing.js";
import {
  applicationVerificationFromCheckedMeaning,
} from "../dist/examples/checked-meaning.js";
import {
  COMMERCIAL_RECORD_REQUIREMENT_CLAIMS,
  createCommercialRecordAuthority,
  createCommercialRecordSubject,
} from "../dist/examples/commercial-records.js";

const digest = (character) => `sha256:${character.repeat(64)}`;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function explanationFixture({ rootClaim, requirementClaims, prefix, leafCount }) {
  const leafClaims = requirementClaims.slice(0, leafCount);
  const frontier = leafClaims.map((requirement, index) => ({
    certificate_id: `${prefix}-certificate-${index}`,
    bundle_id: `${prefix}-bundle-${index}`,
    receipt_id: `${prefix}-receipt-${index}`,
    statement_digest: digest(((index + 1) % 10).toString()),
    artifact_manifest_digest: digest(((index + 2) % 10).toString()),
    observation_digest: digest(((index + 3) % 10).toString()),
    captured_at: `2026-07-23T01:00:${String(index).padStart(2, "0")}.000Z`,
  }));
  const nodes = requirementClaims.map((requirement, index) => ({
    certificate_id: `${prefix}-certificate-${index}`,
    claim: {
      claim_id: requirement.claim_id,
      claim_version: requirement.claim_version,
    },
  }));
  const rootCertificateId = `${prefix}-root`;
  nodes.push({
    certificate_id: rootCertificateId,
    claim: clone(rootClaim),
  });
  return {
    ok: true,
    explanation: {
      root_certificate_id: rootCertificateId,
      node_count: nodes.length,
      grounded_leaf_count: frontier.length,
      checked_composition_count: nodes.length - frontier.length,
      nodes,
      grounded_frontier: frontier,
    },
  };
}

function verificationFixture({
  authority,
  subject,
  requirementClaims,
  leafCount,
  prefix,
}) {
  const rootClaim = authority.specification.expected_root;
  const explanation = explanationFixture({
    rootClaim,
    requirementClaims,
    prefix,
    leafCount,
  });
  const replay = {
    ok: true,
    root_certificate: {
      certificate_id: explanation.explanation.root_certificate_id,
      claim: clone(rootClaim),
    },
  };
  return applicationVerificationFromCheckedMeaning({
    authority: applicationAuthorityRef(authority),
    specification: authority.specification.ref,
    expected_root: rootClaim,
    subject,
    replayed_at: "2026-07-23T01:01:00.000Z",
    replay,
    assessment: {
      disposition: "checked",
      root_certificate: replay.root_certificate,
      consumption_time: "2026-07-23T01:01:00.000Z",
    },
    explanation,
    requirement_claims: requirementClaims,
  });
}

const browserExpectedRootParameters = {
  repository: "https://github.com/riddledc/integrations.git",
  revision: "browser-publishing-example",
  environment: "synthetic-local",
  target: "http://127.0.0.1:4173/",
  proof_attempt: "browser-transition-marker-7c83",
};
const browserAuthority = createBrowserPublishingAuthority({
  authority_digest: digest("a"),
  specification_digest: digest("b"),
  expected_root_parameters: browserExpectedRootParameters,
});
const browserSubject = createBrowserPublishingSubject({
  repository: browserExpectedRootParameters.repository,
  revision: browserExpectedRootParameters.revision,
  target: browserExpectedRootParameters.target,
  digest: digest("c"),
});
const browserVerification = verificationFixture({
  authority: browserAuthority,
  subject: browserSubject,
  requirementClaims: BROWSER_PUBLISHING_REQUIREMENT_CLAIMS,
  leafCount: 1,
  prefix: "browser",
});

const commercialExpectedRootParameters = {
  reconciliation_scope: "synthetic-ap-batch-2026-07-23",
  policy_id: "synthetic-commercial-record.strict-exact-match",
  policy_version: "1",
  policy_digest: digest("d"),
  invoice_digest: digest("e"),
  purchase_order_digest: digest("f"),
  receipt_digest: digest("1"),
  payment_digest: digest("2"),
  invoice_register_digest: digest("3"),
};
const commercialAuthority = createCommercialRecordAuthority({
  authority_digest: digest("4"),
  policy_id: commercialExpectedRootParameters.policy_id,
  policy_version: commercialExpectedRootParameters.policy_version,
  policy_digest: commercialExpectedRootParameters.policy_digest,
  expected_root_parameters: commercialExpectedRootParameters,
});
const commercialSubject = createCommercialRecordSubject({
  reconciliation_scope: commercialExpectedRootParameters.reconciliation_scope,
  record_set_digest: digest("5"),
});
const commercialVerification = verificationFixture({
  authority: commercialAuthority,
  subject: commercialSubject,
  requirementClaims: COMMERCIAL_RECORD_REQUIREMENT_CLAIMS,
  leafCount: 5,
  prefix: "commercial",
});

test("browser publishing and commercial records share one application vocabulary", () => {
  const browser = projectApplicationResult({
    authority: browserAuthority,
    subject: browserSubject,
    verification: browserVerification,
  });
  const commercial = projectApplicationResult({
    authority: commercialAuthority,
    subject: commercialSubject,
    verification: commercialVerification,
  });

  assert.equal(browser.disposition, "conforms");
  assert.equal(commercial.disposition, "conforms");
  assert.equal(browser.current, true);
  assert.equal(commercial.current, true);
  assert.equal(browser.findings.length, 0);
  assert.equal(commercial.findings.length, 0);
  assert.equal(
    browser.observed_root.claim_id,
    "riddle-proof.browser.durable-state-transition-observed",
  );
  assert.equal(
    commercial.observed_root.claim_id,
    "riddle-proof.commercial-record.captured-fields-agree-under-policy",
  );
});

test("progressive views expand one proof identity", () => {
  const result = projectApplicationResult({
    authority: commercialAuthority,
    subject: commercialSubject,
    verification: commercialVerification,
  });
  const outcome = inspectApplicationResult(result, "outcome");
  const meaning = inspectApplicationResult(result, "meaning");
  const audit = inspectApplicationResult(result, "audit");

  assert.deepEqual(outcome.identity, meaning.identity);
  assert.deepEqual(meaning.identity, audit.identity);
  assert.equal(outcome.identity.proof_id, commercialVerification.proof_id);
  assert.equal(JSON.stringify(outcome).includes("sha256:"), false);
  assert.equal(JSON.stringify(meaning).includes("sha256:"), false);
  assert.equal(JSON.stringify(audit).includes("sha256:"), true);
  assert.equal("expected_root" in outcome, false);
  assert.equal("expected_root" in meaning, false);
  assert.equal("explanation" in meaning, false);
  assert.equal(
    audit.expected_root.claim_id,
    commercialAuthority.specification.expected_root.claim_id,
  );
  assert.equal(
    audit.explanation.root_certificate_id,
    audit.binding.root_certificate_id,
  );
  assert.deepEqual(
    audit.binding.authority,
    applicationAuthorityRef(commercialAuthority),
  );
  assert.equal(
    audit.explanation.grounded_frontier.length,
    commercialVerification.explanation.grounded_frontier.length,
  );
  assert.ok(
    meaning.non_conclusions.includes("actual movement of money"),
    "the compact meaning view retains the domain boundary",
  );
});

test("stale replay stays inspectable but cannot project current conformance", () => {
  const stale = clone(browserVerification);
  stale.currentness = {
    status: "stale",
    consumption_time: "2026-07-23T03:00:00.000Z",
    stale_certificate_ids: [
      browserVerification.explanation.grounded_frontier[0].certificate_id,
    ],
  };
  const result = projectApplicationResult({
    authority: browserAuthority,
    subject: browserSubject,
    verification: stale,
  });

  assert.equal(result.disposition, "stale");
  assert.equal(result.current, false);
  assert.equal(result.identity.proof_id, browserVerification.proof_id);
  assert.equal(result.explanation.root_certificate_id, browserVerification.proof_id);
  assert.deepEqual(result.diagnostics, [{ code: "proof_stale" }]);
});

test("specification and expected-root substitutions fail closed", () => {
  const wrongSpec = clone(commercialVerification);
  wrongSpec.spec.digest = digest("6");
  const specResult = projectApplicationResult({
    authority: commercialAuthority,
    subject: commercialSubject,
    verification: wrongSpec,
  });
  assert.equal(specResult.disposition, "could_not_check");
  assert.deepEqual(specResult.diagnostics, [
    { code: "specification_binding_mismatch" },
  ]);

  const wrongRoot = clone(commercialVerification);
  wrongRoot.proof_root.claim = {
    claim_id: "riddle-proof.commercial-record.some-other-root",
    claim_version: "1",
  };
  wrongRoot.proof_root.expected_root_established = false;
  const rootResult = projectApplicationResult({
    authority: commercialAuthority,
    subject: commercialSubject,
    verification: wrongRoot,
  });
  assert.equal(rootResult.disposition, "could_not_check");
  assert.deepEqual(rootResult.diagnostics, [
    { code: "conformance_basis_missing" },
  ]);
});

test("the same specification under a substituted authority fails closed", () => {
  const substitutedAuthority = clone(browserVerification);
  substitutedAuthority.authority = {
    ...substitutedAuthority.authority,
    authority_digest: digest("7"),
  };
  const result = projectApplicationResult({
    authority: browserAuthority,
    subject: browserSubject,
    verification: substitutedAuthority,
  });

  assert.equal(result.disposition, "could_not_check");
  assert.deepEqual(result.diagnostics, [
    { code: "authority_binding_mismatch" },
  ]);
  assert.deepEqual(
    result.identity.authority,
    applicationAuthorityRef(browserAuthority),
  );
});

test("unresolved evidence and failed requirements remain distinct", () => {
  const unresolved = clone(browserVerification);
  unresolved.proof_root.claim = {
    claim_id: "riddle-proof.browser.transition-check-report",
    claim_version: "1",
  };
  unresolved.proof_root.expected_root_established = false;
  unresolved.requirements[1] = {
    requirement_id: "transition_survived_reload",
    status: "unresolved",
    evidence_ids: [],
    diagnostic_code: "reload_capture_unavailable",
  };
  const unresolvedResult = projectApplicationResult({
    authority: browserAuthority,
    subject: browserSubject,
    verification: unresolved,
  });
  assert.equal(unresolvedResult.disposition, "could_not_check");
  assert.equal(unresolvedResult.findings.length, 0);
  assert.equal(unresolvedResult.repair_guidance.length, 0);
  assert.deepEqual(unresolvedResult.diagnostics, [
    { code: "requirement_unresolved" },
  ]);

  const failed = clone(unresolved);
  failed.requirements[1] = {
    requirement_id: "transition_survived_reload",
    status: "failed",
    evidence_ids: [
      browserVerification.requirements[1].evidence_ids[0],
    ],
    diagnostic_code: "reload_value_mismatch",
  };
  const failedResult = projectApplicationResult({
    authority: browserAuthority,
    subject: browserSubject,
    verification: failed,
  });
  assert.equal(failedResult.disposition, "does_not_conform");
  assert.equal(failedResult.findings.length, 1);
  assert.equal(
    failedResult.findings[0].label,
    "The resulting state survived reload",
  );
  assert.equal(
    failedResult.findings[0].failure_summary,
    "The resulting state did not survive reload.",
  );
  assert.deepEqual(failedResult.repair_guidance, [
    "Persist the state beyond the current page and rerun the pinned reload profile.",
  ]);
});

test("producer-authored findings and evidence outside the replay frontier are rejected", () => {
  const inventedFinding = {
    ...clone(browserVerification),
    findings: [{
      requirement_id: "invented",
      label: "Producer says this failed",
    }],
  };
  const inventedResult = projectApplicationResult({
    authority: browserAuthority,
    subject: browserSubject,
    verification: inventedFinding,
  });
  assert.equal(inventedResult.disposition, "could_not_check");
  assert.deepEqual(inventedResult.diagnostics, [
    { code: "verification_shape_invalid" },
  ]);

  const inventedEvidence = clone(browserVerification);
  inventedEvidence.requirements[0].evidence_ids = ["not-in-replayed-frontier"];
  const evidenceResult = projectApplicationResult({
    authority: browserAuthority,
    subject: browserSubject,
    verification: inventedEvidence,
  });
  assert.equal(evidenceResult.disposition, "could_not_check");
  assert.deepEqual(evidenceResult.diagnostics, [
    { code: "requirement_coverage_invalid" },
  ]);
});

test("required-result coverage rejects missing, duplicate, and extra requirements", () => {
  const missing = clone(browserVerification);
  missing.requirements.pop();

  const duplicate = clone(browserVerification);
  duplicate.requirements[2] = clone(duplicate.requirements[0]);

  const extra = clone(browserVerification);
  extra.requirements.push({
    requirement_id: "producer_added_requirement",
    status: "satisfied",
    evidence_ids: [browserVerification.proof_id],
  });

  for (const [label, verification] of [
    ["missing", missing],
    ["duplicate", duplicate],
    ["extra", extra],
  ]) {
    const result = projectApplicationResult({
      authority: browserAuthority,
      subject: browserSubject,
      verification,
    });
    assert.equal(result.disposition, "could_not_check", label);
    assert.deepEqual(
      result.diagnostics,
      [{ code: "requirement_coverage_invalid" }],
      label,
    );
  }
});
