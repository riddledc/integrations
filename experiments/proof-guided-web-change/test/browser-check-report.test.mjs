import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
} from "node:crypto";
import test from "node:test";

import {
  assessRiddleProofProfileEvidence,
  composeRiddleProofCheckedMeaningClosures,
  createRiddleProofCheckedMeaningAtomicClosure,
  createRiddleProofGroundedSemanticAtomicCertificateClosure,
  createRiddleProofGroundedSemanticCertificate,
  createRiddleProofSignedCaptureBundle,
  normalizeRiddleProofProfile,
} from "@riddledc/riddle-proof-core";

import {
  RIDDLE_PROOF_BROWSER_CHECK_REPORT_CLAIMS,
  assessRiddleProofBrowserTransitionCheckReport,
  createRiddleProofBrowserCheckReportObservationVerifier,
  createRiddleProofBrowserTransitionCheckReport,
  createRiddleProofBrowserTransitionCheckReportProtocol,
  replayRiddleProofBrowserTransitionCheckReport,
} from "../dist/src/browser-check-report.js";

const ROLES = [
  "before",
  "action",
  "reload",
  "fresh_context",
];

const TARGET = "https://example.invalid/specimen/";
const TRANSITION_ID = "durable-text-transition-v1";
const SCOPE = {
  repository: "https://example.invalid/proof-guided-web-change.git",
  revision: "candidate-revision-negative-1",
  environment: "synthetic-signed-browser-evidence",
  target: TARGET,
  proof_attempt: TRANSITION_ID,
};

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function plusMilliseconds(timestamp, milliseconds) {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function profileFor(role) {
  return normalizeRiddleProofProfile({
    version: "riddle-proof.profile.v1",
    name: `check-report-${role}`,
    target: {
      url: TARGET,
      viewports: [
        { name: "desktop", width: 960, height: 720 },
        ...(role === "reload"
          ? [{ name: "mobile", width: 390, height: 844 }]
          : []),
      ],
    },
    checks: [{
      type: "selector_visible",
      selector: `#${role}`,
    }],
    artifacts: [],
    baseline_policy: "invariant_only",
    failure_policy: {
      product_regression: "fail",
      proof_insufficient: "fail",
      environment_blocked: "fail",
    },
  });
}

const normalizedProfiles = Object.fromEntries(
  ROLES.map((role) => [role, profileFor(role)]),
);
const profileBytes = Object.fromEntries(
  ROLES.map((role) => [
    role,
    Buffer.from(JSON.stringify(normalizedProfiles[role], null, 2)),
  ]),
);
const profiles = Object.fromEntries(
  ROLES.map((role) => [role, {
    profile_name: normalizedProfiles[role].name,
    profile_digest: sha256(profileBytes[role]),
  }]),
);

function evidenceFor(role, status, capturedAt) {
  const base = {
    version: "riddle-proof.profile-evidence.v1",
    profile_name: normalizedProfiles[role].name,
    target_url: TARGET,
    baseline_policy: "invariant_only",
    captured_at: capturedAt,
    viewports: [{
      name: "desktop",
      width: 960,
      height: 720,
      url: TARGET,
      route: {
        requested: TARGET,
        observed: TARGET,
        matched: true,
      },
      selectors: {
        [`#${role}`]: {
          count: status === "product_regression" ? 0 : 1,
          visible_count: status === "product_regression" ? 0 : 1,
        },
      },
    }],
    console: { events: [], fatal_count: 0 },
    page_errors: [],
    dom_summary: { partial: false },
  };
  if (status === "proof_insufficient") return base;
  if (status === "environment_blocked") {
    return {
      ...base,
      viewports: [{
        ...base.viewports[0],
        route: {
          requested: TARGET,
          observed: "https://example.invalid/blocked",
          expected_path: "/",
          matched: false,
          error: "synthetic_navigation_blocked",
        },
        navigation_error: "synthetic_navigation_blocked",
      }],
    };
  }
  return base;
}

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyBytes = privateKey.export({ format: "der", type: "pkcs8" });
const publicKeyBytes = publicKey.export({ format: "der", type: "spki" });
const KEY_ID = "browser-check-report-test-key";
const COLLECTOR = {
  collector_id: "browser-check-report-test",
  collector_version: "1",
  implementation_digest: `sha256:${"9".repeat(64)}`,
};
const verifier =
  createRiddleProofBrowserCheckReportObservationVerifier();

function signedRole(role, status, capturedAt, ordinal, declaredStatus = status) {
  const evidence = evidenceFor(role, status, capturedAt);
  const assessed = assessRiddleProofProfileEvidence(
    normalizedProfiles[role],
    evidence,
    { runner: "local-playwright" },
  );
  assert.equal(assessed.status, status);
  const result = {
    ...assessed,
    status: declaredStatus,
  };
  const sensor = {
    kind: "browser",
    name: "synthetic-browser",
    version: "1",
    observed_target: TARGET,
    metadata: {
      requested_url: TARGET,
      observed_url: status === "environment_blocked"
        ? "https://example.invalid/blocked"
        : TARGET,
    },
  };
  const nonce = Buffer.alloc(32, ordinal).toString("base64url");
  const created = createRiddleProofSignedCaptureBundle({
    scope: SCOPE,
    nonce,
    captured_at: capturedAt,
    collector: COLLECTOR,
    sensor,
    verifier: verifier.verifier_ref,
    artifacts: [
      {
        artifact_id: "normalized-profile.json",
        role: "profile_contract",
        media_type: "application/json",
        bytes_base64: profileBytes[role].toString("base64"),
      },
      {
        artifact_id: "profile-result.json",
        role: "derived_result",
        media_type: "application/json",
        bytes_base64: Buffer.from(
          JSON.stringify(result, null, 2),
        ).toString("base64"),
      },
    ],
    signing_key: {
      key_id: KEY_ID,
      private_key_pkcs8_base64: privateKeyBytes.toString("base64"),
    },
  });
  assert.equal(
    created.ok,
    true,
    created.ok ? undefined : created.error.message,
  );
  return { bundle: created.bundle, nonce, sensor };
}

function authorityFor(capture, verificationTime) {
  return {
    policy: {
      expected_scope: SCOPE,
      expected_nonce: capture.nonce,
      expected_collector: COLLECTOR,
      expected_sensor: capture.sensor,
      expected_verifier: verifier.verifier_ref,
      expected_signer: {
        key_id: KEY_ID,
        public_key_spki_sha256: sha256(publicKeyBytes),
      },
      verification_time: verificationTime,
      max_capture_age_ms: 10 * 60 * 1000,
      max_future_skew_ms: 0,
      required_artifact_roles: [
        "profile_contract",
        "derived_result",
      ],
    },
    trusted_signers: [{
      key_id: KEY_ID,
      public_key_spki_base64: publicKeyBytes.toString("base64"),
    }],
  };
}

function createReportFixture({
  base = "2026-07-24T06:00:00.000Z",
  ordinalOffset = 20,
  captureTimes = {},
} = {}) {
  const statuses = {
    before: "passed",
    action: "product_regression",
    reload: "proof_insufficient",
    fresh_context: "environment_blocked",
  };
  const captures = Object.fromEntries(
    ROLES.map((role, index) => [
      role,
      signedRole(
        role,
        statuses[role],
        captureTimes[role] ?? plusMilliseconds(base, index * 1_000),
        ordinalOffset + index,
      ),
    ]),
  );
  const verificationTime = plusMilliseconds(base, 10_000);
  const authorities = Object.fromEntries(
    ROLES.map((role) => [
      role,
      authorityFor(captures[role], verificationTime),
    ]),
  );
  const bundles = Object.fromEntries(
    ROLES.map((role) => [role, captures[role].bundle]),
  );
  const roleIssuedAt = Object.fromEntries(
    ROLES.map((role, index) => [
      role,
      plusMilliseconds(verificationTime, 1_000 + index),
    ]),
  );
  const created = createRiddleProofBrowserTransitionCheckReport({
    bundles,
    authorities,
    expected_scope: SCOPE,
    transition_id: TRANSITION_ID,
    profiles,
    role_issued_at: roleIssuedAt,
    root_issued_at: plusMilliseconds(verificationTime, 2_000),
  });
  return {
    statuses,
    captures,
    verificationTime,
    authorities,
    bundles,
    roleIssuedAt,
    created,
  };
}

function replayFixture(fixture, overrides = {}) {
  assert.equal(
    fixture.created.ok,
    true,
    fixture.created.ok ? undefined : fixture.created.error.message,
  );
  return replayRiddleProofBrowserTransitionCheckReport({
    checked_closure: jsonClone(fixture.created.checked_closure),
    authorities: jsonClone(fixture.authorities),
    expected_root_certificate_id:
      fixture.created.root_certificate.certificate_id,
    expected_scope: jsonClone(SCOPE),
    transition_id: TRANSITION_ID,
    profiles: jsonClone(profiles),
    ...overrides,
  });
}

function assertRejectedAt(result, expectedStage) {
  assert.equal(result.ok, false, "the hostile report must be rejected");
  assert.equal(result.error.stage, expectedStage);
}

function issueCheckedLeaf({ bundle, authority, verifier, contract }) {
  const configuration = {
    policy: authority.policy,
    trusted_signers: authority.trusted_signers,
    verifier_registry: [verifier.registration],
    contract_registry: [contract.registration],
    expected_contract: contract.contract_ref,
  };
  const issued = createRiddleProofGroundedSemanticCertificate({
    bundle,
    ...configuration,
    issued_at: authority.policy.verification_time,
  });
  assert.equal(issued.ok, true, issued.ok ? undefined : issued.error.message);
  const grounded = createRiddleProofGroundedSemanticAtomicCertificateClosure({
    certificate: issued.certificate,
    grounding: issued.grounding,
    configuration,
  });
  assert.equal(
    grounded.ok,
    true,
    grounded.ok ? undefined : grounded.error.message,
  );
  const replayContext = {
    certificate_id: issued.certificate.certificate_id,
    ...configuration,
  };
  const checked = createRiddleProofCheckedMeaningAtomicClosure({
    grounded_closure: grounded.grounded_closure,
    replay_contexts: [replayContext],
  });
  assert.equal(
    checked.ok,
    true,
    checked.ok ? undefined : checked.error.message,
  );
  return {
    checked_closure: checked.checked_closure,
    replay_context: replayContext,
  };
}

function protocolTrust(protocol) {
  const rules = [
    ...ROLES.map((role) => protocol.rules.roles[role]),
    protocol.rules.transition_check_report,
  ];
  return {
    rule_registry: rules.map((rule) => rule.registration),
    trusted_rules: rules.map((rule) => rule.rule_ref),
  };
}

test("signed four-role report replays exact positive, negative, and unresolved statuses", () => {
  const base = "2026-07-24T04:00:00.000Z";
  const expectedStatuses = {
    before: "passed",
    action: "product_regression",
    reload: "proof_insufficient",
    fresh_context: "environment_blocked",
  };
  const captures = {
    before: signedRole("before", expectedStatuses.before, base, 1),
    action: signedRole(
      "action",
      expectedStatuses.action,
      plusMilliseconds(base, 1_000),
      2,
    ),
    reload: signedRole(
      "reload",
      expectedStatuses.reload,
      plusMilliseconds(base, 2_000),
      3,
    ),
    fresh_context: signedRole(
      "fresh_context",
      expectedStatuses.fresh_context,
      plusMilliseconds(base, 3_000),
      4,
    ),
  };
  const verificationTime = plusMilliseconds(base, 10_000);
  const authorities = Object.fromEntries(
    ROLES.map((role) => [
      role,
      authorityFor(captures[role], verificationTime),
    ]),
  );
  const bundles = Object.fromEntries(
    ROLES.map((role) => [role, captures[role].bundle]),
  );
  const roleIssuedAt = Object.fromEntries(
    ROLES.map((role) => [
      role,
      plusMilliseconds(verificationTime, 1_000),
    ]),
  );

  const created = createRiddleProofBrowserTransitionCheckReport({
    bundles,
    authorities,
    expected_scope: SCOPE,
    transition_id: TRANSITION_ID,
    profiles,
    role_issued_at: roleIssuedAt,
    root_issued_at: plusMilliseconds(verificationTime, 2_000),
  });
  assert.equal(created.ok, true, created.ok ? undefined : created.error.message);
  assert.deepEqual(created.reported_statuses, expectedStatuses);
  assert.equal(
    created.requirements.declared_transition_observed.status,
    "failed",
  );
  assert.equal(
    created.requirements.transition_survived_reload.status,
    "unresolved",
  );
  assert.equal(
    created.requirements.transition_visible_in_fresh_context.status,
    "unresolved",
  );
  assert.equal(created.explanation.grounded_leaf_count, 8);
  assert.equal(created.explanation.checked_composition_count, 5);
  assert.equal(new Set(
    Object.values(created.capture_points).map((capture) => capture.bundle_id),
  ).size, 4);

  const replayed = replayRiddleProofBrowserTransitionCheckReport({
    checked_closure: JSON.parse(JSON.stringify(created.checked_closure)),
    authorities,
    expected_root_certificate_id: created.root_certificate.certificate_id,
    expected_scope: SCOPE,
    transition_id: TRANSITION_ID,
    profiles,
  });
  assert.equal(
    replayed.ok,
    true,
    replayed.ok ? undefined : replayed.error.message,
  );
  assert.deepEqual(replayed.reported_statuses, expectedStatuses);

  const current = assessRiddleProofBrowserTransitionCheckReport({
    report: replayed,
    consumption_time: plusMilliseconds(verificationTime, 5_000),
    max_grounded_age_ms: 60 * 60 * 1000,
    max_future_skew_ms: 0,
  });
  assert.equal(current.disposition, "checked");
  const stale = assessRiddleProofBrowserTransitionCheckReport({
    report: replayed,
    consumption_time: plusMilliseconds(verificationTime, 2 * 60 * 60 * 1000),
    max_grounded_age_ms: 30 * 60 * 1000,
    max_future_skew_ms: 0,
  });
  assert.equal(stale.disposition, "stale");
});

test("a signed producer status that disagrees with deterministic reassessment is rejected", () => {
  const base = "2026-07-24T05:00:00.000Z";
  const dishonestAction = signedRole(
    "action",
    "product_regression",
    plusMilliseconds(base, 1_000),
    8,
    "passed",
  );
  const captures = {
    before: signedRole("before", "passed", base, 7),
    action: dishonestAction,
    reload: signedRole(
      "reload",
      "proof_insufficient",
      plusMilliseconds(base, 2_000),
      9,
    ),
    fresh_context: signedRole(
      "fresh_context",
      "product_regression",
      plusMilliseconds(base, 3_000),
      10,
    ),
  };
  const verificationTime = plusMilliseconds(base, 10_000);
  const created = createRiddleProofBrowserTransitionCheckReport({
    bundles: Object.fromEntries(
      ROLES.map((role) => [role, captures[role].bundle]),
    ),
    authorities: Object.fromEntries(
      ROLES.map((role) => [
        role,
        authorityFor(captures[role], verificationTime),
      ]),
    ),
    expected_scope: SCOPE,
    transition_id: TRANSITION_ID,
    profiles,
    role_issued_at: Object.fromEntries(
      ROLES.map((role) => [
        role,
        plusMilliseconds(verificationTime, 1_000),
      ]),
    ),
    root_issued_at: plusMilliseconds(verificationTime, 2_000),
  });
  assert.equal(created.ok, false);
  assert.equal(created.error.stage, "preverify:action");
  assert.match(created.error.message, /deterministic reassessment/u);
});

test("replay rejects a substituted independently expected scope", () => {
  const fixture = createReportFixture();
  const replayed = replayFixture(fixture, {
    expected_scope: {
      ...SCOPE,
      revision: "attacker-substituted-revision",
    },
  });
  assertRejectedAt(replayed, "replay_contexts:before");
});

test("replay rejects profile name and digest substitution", async (t) => {
  const fixture = createReportFixture({
    base: "2026-07-24T06:10:00.000Z",
    ordinalOffset: 30,
  });

  await t.test("profile name", () => {
    const substitutedProfiles = jsonClone(profiles);
    substitutedProfiles.action.profile_name =
      "attacker-substituted-action-profile";
    assertRejectedAt(
      replayFixture(fixture, { profiles: substitutedProfiles }),
      "replay_contexts:action",
    );
  });

  await t.test("profile digest", () => {
    const substitutedProfiles = jsonClone(profiles);
    substitutedProfiles.action.profile_digest = sha256(
      Buffer.from("attacker-substituted-action-profile"),
    );
    assert.notEqual(
      substitutedProfiles.action.profile_digest,
      profiles.action.profile_digest,
    );
    assertRejectedAt(
      replayFixture(fixture, { profiles: substitutedProfiles }),
      "replay_contexts:action",
    );
  });
});

test("replay rejects grounded role and reported status tampering", async (t) => {
  const fixture = createReportFixture({
    base: "2026-07-24T06:20:00.000Z",
    ordinalOffset: 40,
  });

  await t.test("grounded role", () => {
    const changed = jsonClone(fixture.created.checked_closure);
    const actionBinding = changed.grounded_closure.closure.certificates.find(
      (certificate) =>
        certificate.claim.claim_id
          ===
          RIDDLE_PROOF_BROWSER_CHECK_REPORT_CLAIMS.capture_bound_to_profile
            .claim_id
        && certificate.claim.parameters.role === "action",
    );
    assert.ok(actionBinding);
    actionBinding.claim.parameters.role = "reload";
    assertRejectedAt(
      replayFixture(fixture, { checked_closure: changed }),
      "replay_contexts:action",
    );
  });

  await t.test("root status", () => {
    const changed = jsonClone(fixture.created.checked_closure);
    const root = changed.grounded_closure.closure.certificates.find(
      (certificate) =>
        certificate.certificate_id
          === fixture.created.root_certificate.certificate_id,
    );
    assert.ok(root);
    root.claim.parameters.action_status = "passed";
    assertRejectedAt(
      replayFixture(fixture, { checked_closure: changed }),
      "replay_contexts:action",
    );
  });
});

test("replay rejects a signer and authority substitution", () => {
  const fixture = createReportFixture({
    base: "2026-07-24T06:30:00.000Z",
    ordinalOffset: 50,
  });
  const { publicKey: attackerPublicKey } = generateKeyPairSync("ed25519");
  const attackerPublicKeyBytes = attackerPublicKey.export({
    format: "der",
    type: "spki",
  });
  const authorities = jsonClone(fixture.authorities);
  authorities.action.policy.expected_signer = {
    key_id: "attacker-browser-check-report-key",
    public_key_spki_sha256: sha256(attackerPublicKeyBytes),
  };
  authorities.action.trusted_signers = [{
    key_id: "attacker-browser-check-report-key",
    public_key_spki_base64: attackerPublicKeyBytes.toString("base64"),
  }];
  assertRejectedAt(
    replayFixture(fixture, { authorities }),
    "checked_replay",
  );
});

test("creation rejects reuse of one signed bundle for a different role", () => {
  const fixture = createReportFixture({
    base: "2026-07-24T06:40:00.000Z",
    ordinalOffset: 60,
  });
  assert.equal(
    fixture.created.ok,
    true,
    fixture.created.ok ? undefined : fixture.created.error.message,
  );
  const bundles = {
    ...fixture.bundles,
    action: fixture.captures.before.bundle,
  };
  const authorities = {
    ...fixture.authorities,
    action: authorityFor(
      fixture.captures.before,
      fixture.verificationTime,
    ),
  };
  const created = createRiddleProofBrowserTransitionCheckReport({
    bundles,
    authorities,
    expected_scope: SCOPE,
    transition_id: TRANSITION_ID,
    profiles,
    role_issued_at: fixture.roleIssuedAt,
    root_issued_at: plusMilliseconds(fixture.verificationTime, 2_000),
  });
  assertRejectedAt(created, "preverify:action");
  assert.match(created.error.message, /expected digest/u);
});

test("replay rejects binding and outcome leaves grounded in different same-role captures", () => {
  const base = "2026-07-24T06:45:00.000Z";
  const fixture = createReportFixture({
    base,
    ordinalOffset: 80,
  });
  assert.equal(
    fixture.created.ok,
    true,
    fixture.created.ok ? undefined : fixture.created.error.message,
  );
  const alternateAction = signedRole(
    "action",
    fixture.statuses.action,
    plusMilliseconds(base, 1_500),
    81,
  );
  assert.equal(
    alternateAction.nonce,
    fixture.captures.action.nonce,
    "the independent action capture intentionally satisfies one pinned authority",
  );
  assert.notEqual(
    alternateAction.bundle.provenance.signature_base64,
    fixture.captures.action.bundle.provenance.signature_base64,
    "the two leaves still come from distinct signed observations",
  );

  const protocolResult =
    createRiddleProofBrowserTransitionCheckReportProtocol({
      expected_scope: SCOPE,
      transition_id: TRANSITION_ID,
      profiles,
      reported_statuses: fixture.statuses,
    });
  assert.equal(
    protocolResult.ok,
    true,
    protocolResult.ok ? undefined : protocolResult.error.message,
  );
  const protocol = protocolResult.protocol;
  const trust = protocolTrust(protocol);
  const roleReports = {};
  const replayContexts = [];

  for (const role of ROLES) {
    const binding = issueCheckedLeaf({
      bundle: fixture.bundles[role],
      authority: fixture.authorities[role],
      verifier: protocol.verifier,
      contract: protocol.contracts[role].capture_bound_to_profile,
    });
    const outcome = issueCheckedLeaf({
      bundle: role === "action"
        ? alternateAction.bundle
        : fixture.bundles[role],
      authority: fixture.authorities[role],
      verifier: protocol.verifier,
      contract: protocol.contracts[role].profile_status_reassessed,
    });
    replayContexts.push(
      binding.replay_context,
      outcome.replay_context,
    );
    const roleReport = composeRiddleProofCheckedMeaningClosures({
      expected_rule: protocol.rules.roles[role].rule_ref,
      closures: [
        binding.checked_closure,
        outcome.checked_closure,
      ],
      issued_at: fixture.roleIssuedAt[role],
      replay_contexts: [
        binding.replay_context,
        outcome.replay_context,
      ],
      ...trust,
    });
    assert.equal(
      roleReport.ok,
      true,
      roleReport.ok ? undefined : roleReport.error.message,
    );
    roleReports[role] = roleReport;
  }

  const root = composeRiddleProofCheckedMeaningClosures({
    expected_rule: protocol.rules.transition_check_report.rule_ref,
    closures: ROLES.map((role) => roleReports[role].checked_closure),
    issued_at: plusMilliseconds(fixture.verificationTime, 2_000),
    replay_contexts: replayContexts,
    ...trust,
  });
  assert.equal(root.ok, true, root.ok ? undefined : root.error.message);

  const replayed = replayRiddleProofBrowserTransitionCheckReport({
    checked_closure: root.checked_closure,
    authorities: fixture.authorities,
    expected_root_certificate_id: root.certificate.certificate_id,
    expected_scope: SCOPE,
    transition_id: TRANSITION_ID,
    profiles,
  });
  assertRejectedAt(replayed, "capture_identity");
  assert.match(
    replayed.error.message,
    /both grounded action leaves must come from one exact signed capture/iu,
  );
});

test("creation rejects signed capture chronology that puts before after action", () => {
  const base = "2026-07-24T06:50:00.000Z";
  const fixture = createReportFixture({
    base,
    ordinalOffset: 70,
    captureTimes: {
      before: plusMilliseconds(base, 2_000),
      action: plusMilliseconds(base, 1_000),
      reload: plusMilliseconds(base, 3_000),
      fresh_context: plusMilliseconds(base, 4_000),
    },
  });
  assertRejectedAt(fixture.created, "capture_chronology");
  assert.match(fixture.created.error.message, /before no later than action/u);
});
