import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  composeRiddleProofCheckedMeaningClosures,
  createRiddleProofSignedCaptureBundle,
} from "@riddledc/riddle-proof-core";
import {
  RIDDLE_PROOF_BROWSER_SEALED_CLAIMS,
  createRiddleProofBrowserSealedProof,
  createRiddleProofBrowserSealedProtocol,
  replayRiddleProofBrowserSealedProof,
} from "./dist/index.js";

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertRejected(result, expectedStage) {
  assert.equal(result.ok, false);
  if (expectedStage !== undefined) assert.equal(result.error.stage, expectedStage);
}

const scope = {
  repository: "https://github.com/riddledc/integrations.git",
  revision: "browser-pyramid-test-revision",
  environment: "synthetic-local-browser",
  target: "https://example.test/settings",
  proof_attempt: "browser-pyramid-test-attempt",
};
const profileName = "synthetic-settings-profile";
const capturedAt = "2026-07-21T14:00:00.000Z";
const leafIssuedAt = "2026-07-21T14:00:01.000Z";
const targetIssuedAt = "2026-07-21T14:00:02.000Z";
const behaviorIssuedAt = "2026-07-21T14:00:02.000Z";
const rootIssuedAt = "2026-07-21T14:00:03.000Z";
const nonce = Buffer.alloc(32, 41).toString("base64url");
const collector = {
  collector_id: "@riddledc/riddle-proof-runner-playwright",
  collector_version: "browser-pyramid-test",
  implementation_digest: `sha256:${"4".repeat(64)}`,
};

const protocolResult = createRiddleProofBrowserSealedProtocol({
  expected_scope: scope,
  expected_profile_name: profileName,
});
assert.equal(protocolResult.ok, true, protocolResult.ok ? undefined : protocolResult.error.message);
const protocol = protocolResult.protocol;

const leanBrowserPyramid = readFileSync(
  new URL(
    "../../formal/riddle-proof-kernel/RiddleProofKernel/BrowserPyramid.lean",
    import.meta.url,
  ),
  "utf8",
);
for (const claim of Object.values(RIDDLE_PROOF_BROWSER_SEALED_CLAIMS)) {
  assert.ok(
    leanBrowserPyramid.includes(`\"${claim.claim_id}\"`),
    `Lean browser pyramid uses runtime claim id ${claim.claim_id}`,
  );
}
assert.match(leanBrowserPyramid, /claimVersion := "1"/u);
assert.match(leanBrowserPyramid, /ruleVersion := "1"/u);

const recreatedProtocol = createRiddleProofBrowserSealedProtocol({
  expected_scope: jsonClone(scope),
  expected_profile_name: profileName,
});
assert.equal(recreatedProtocol.ok, true);
assert.deepEqual(recreatedProtocol.protocol, protocol, "the pinned protocol is deterministic JSON data");

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyBytes = privateKey.export({ format: "der", type: "pkcs8" });
const publicKeyBytes = publicKey.export({ format: "der", type: "spki" });
const keyId = "browser-pyramid-test-key";
const sensor = {
  kind: "browser",
  name: "chromium",
  version: "synthetic-1",
  observed_target: scope.target,
  metadata: {
    requested_url: scope.target,
    observed_url: scope.target,
    mode: "synthetic-sealed-proof-test",
  },
};
const profileResult = {
  version: "riddle-proof.profile-result.v1",
  profile_name: profileName,
  status: "passed",
  route: {
    requested: scope.target,
    matched: true,
  },
  checks: [
    { type: "selector_visible", selector: "#settings", passed: true },
    { type: "no_fatal_console_errors", passed: true },
  ],
  evidence: {
    console: { fatal_count: 0 },
    page_errors: [],
    dom_summary: { partial: false },
  },
};
function signProfileResult({
  fixtureScope,
  fixtureNonce,
  fixtureSensor,
  fixtureProtocol,
  result,
}) {
  return createRiddleProofSignedCaptureBundle({
    scope: fixtureScope,
    nonce: fixtureNonce,
    captured_at: capturedAt,
    collector,
    sensor: fixtureSensor,
    verifier: fixtureProtocol.verifier.verifier_ref,
    artifacts: [{
      artifact_id: "profile-result.json",
      role: "derived_result",
      media_type: "application/json",
      bytes_base64: Buffer.from(JSON.stringify(result)).toString("base64"),
    }],
    signing_key: {
      key_id: keyId,
      private_key_pkcs8_base64: privateKeyBytes.toString("base64"),
    },
  });
}

function authorityFor({ fixtureScope, fixtureNonce, fixtureSensor, fixtureProtocol }) {
  return {
    policy: {
      expected_scope: fixtureScope,
      expected_nonce: fixtureNonce,
      expected_collector: collector,
      expected_sensor: fixtureSensor,
      expected_verifier: fixtureProtocol.verifier.verifier_ref,
      expected_signer: {
        key_id: keyId,
        public_key_spki_sha256: `sha256:${sha256Hex(publicKeyBytes)}`,
      },
      verification_time: leafIssuedAt,
      max_capture_age_ms: 60_000,
      max_future_skew_ms: 1_000,
      required_artifact_roles: ["derived_result"],
    },
    trusted_signers: [{
      key_id: keyId,
      public_key_spki_base64: publicKeyBytes.toString("base64"),
    }],
  };
}

const signed = signProfileResult({
  fixtureScope: scope,
  fixtureNonce: nonce,
  fixtureSensor: sensor,
  fixtureProtocol: protocol,
  result: profileResult,
});
assert.equal(signed.ok, true, signed.ok ? undefined : signed.error.message);

const authority = authorityFor({
  fixtureScope: scope,
  fixtureNonce: nonce,
  fixtureSensor: sensor,
  fixtureProtocol: protocol,
});
const proofInput = {
  bundle: signed.bundle,
  expected_scope: scope,
  expected_profile_name: profileName,
  authority,
  protocol,
  leaf_issued_at: leafIssuedAt,
  target_issued_at: targetIssuedAt,
  behavior_issued_at: behaviorIssuedAt,
  root_issued_at: rootIssuedAt,
};

const created = createRiddleProofBrowserSealedProof(proofInput);
assert.equal(created.ok, true, created.ok ? undefined : created.error.message);
const recreated = createRiddleProofBrowserSealedProof(jsonClone(proofInput));
assert.equal(recreated.ok, true, recreated.ok ? undefined : recreated.error.message);
assert.deepEqual(recreated.checked_closure, created.checked_closure);
assert.equal(recreated.root_certificate.certificate_id, created.root_certificate.certificate_id);

assert.equal(
  created.root_certificate.claim.claim_id,
  RIDDLE_PROOF_BROWSER_SEALED_CLAIMS.sealed_profile_satisfied.claim_id,
);
assert.deepEqual(created.root_certificate.claim.parameters, protocol.expected_root_claim.parameters);
assert.equal(created.replay_contexts.length, 4, "one independently replayable grounding per leaf");
assert.equal(
  created.checked_closure.grounded_closure.groundings.length,
  4,
  "the sealed root retains all four grounding bindings",
);
assert.equal(
  created.checked_closure.grounded_closure.closure.certificates.length,
  7,
  "four leaves, two intermediate certificates, and one root remain addressable",
);
assert.equal(created.checked_closure.rule_bindings.length, 3);

const certificateIds = created.checked_closure.grounded_closure.closure.certificates.map(
  (certificate) => certificate.certificate_id,
);
assert.equal(new Set(certificateIds).size, 7, "each certificate is retained once");
assert.equal(
  new Set(created.checked_closure.rule_bindings.map((binding) => binding.certificate_id)).size,
  3,
  "each composition rule is bound once",
);
for (const leaf of Object.values(created.leaves)) {
  assert.equal(
    certificateIds.filter((certificateId) => certificateId === leaf.certificate.certificate_id).length,
    1,
    "each branch reuses its leaf without duplicating it in the root DAG",
  );
}
for (const branch of Object.values(created.branches)) {
  assert.equal(
    certificateIds.filter((certificateId) => certificateId === branch.certificate.certificate_id).length,
    1,
    "each intermediate remains an addressable, nonduplicated checkpoint",
  );
}

const replayInput = {
  checked_closure: JSON.parse(JSON.stringify(created.checked_closure)),
  replay_contexts: JSON.parse(JSON.stringify(created.replay_contexts)),
  protocol: JSON.parse(JSON.stringify(protocol)),
  expected_root_certificate_id: created.root_certificate.certificate_id,
  expected_scope: JSON.parse(JSON.stringify(scope)),
  expected_profile_name: profileName,
};
const replayed = replayRiddleProofBrowserSealedProof(replayInput);
assert.equal(replayed.ok, true, replayed.ok ? undefined : replayed.error.message);
assert.equal(replayed.root_certificate.certificate_id, created.root_certificate.certificate_id);

const ruleRegistry = [
  protocol.rules.target_confirmed.registration,
  protocol.rules.behavior_confirmed.registration,
  protocol.rules.sealed_profile_satisfied.registration,
];
const trustedRules = [
  protocol.rules.target_confirmed.rule_ref,
  protocol.rules.behavior_confirmed.rule_ref,
  protocol.rules.sealed_profile_satisfied.rule_ref,
];
const reusedTargetId = created.branches.target_confirmed.certificate.certificate_id;
const recomposedFromBranches = composeRiddleProofCheckedMeaningClosures({
  expected_rule: protocol.rules.sealed_profile_satisfied.rule_ref,
  closures: [
    jsonClone(created.branches.target_confirmed.checked_closure),
    jsonClone(created.branches.behavior_confirmed.checked_closure),
  ],
  issued_at: rootIssuedAt,
  replay_contexts: jsonClone(created.replay_contexts),
  rule_registry: jsonClone(ruleRegistry),
  trusted_rules: jsonClone(trustedRules),
});
assert.equal(
  recomposedFromBranches.ok,
  true,
  recomposedFromBranches.ok ? undefined : recomposedFromBranches.error.message,
);
assert.equal(
  recomposedFromBranches.certificate.certificate_id,
  created.root_certificate.certificate_id,
  "reusing the two compacted branches reproduces the exact root",
);
assert.equal(
  recomposedFromBranches.checked_closure.grounded_closure.closure.certificates.filter(
    (certificate) => certificate.certificate_id === reusedTargetId,
  ).length,
  1,
  "the reused target checkpoint retains its exact identity without duplication",
);

const wrongRootReplay = replayRiddleProofBrowserSealedProof({
  ...replayInput,
  expected_root_certificate_id: `rpsc_${"0".repeat(64)}`,
});
assertRejected(wrongRootReplay);

function closureWithoutClaim(claimId) {
  const changed = jsonClone(created.checked_closure);
  changed.grounded_closure.closure.certificates =
    changed.grounded_closure.closure.certificates.filter(
      (certificate) => certificate.claim.claim_id !== claimId,
    );
  return changed;
}

const missingLeaf = replayRiddleProofBrowserSealedProof({
  ...replayInput,
  checked_closure: closureWithoutClaim(
    RIDDLE_PROOF_BROWSER_SEALED_CLAIMS.capture_bound_to_scope.claim_id,
  ),
});
assertRejected(missingLeaf);

const missingIntermediate = replayRiddleProofBrowserSealedProof({
  ...replayInput,
  checked_closure: closureWithoutClaim(RIDDLE_PROOF_BROWSER_SEALED_CLAIMS.target_confirmed.claim_id),
});
assertRejected(missingIntermediate);

const profileMismatch = replayRiddleProofBrowserSealedProof({
  ...replayInput,
  expected_profile_name: "a-different-profile",
});
assertRejected(profileMismatch, "protocol_trust_root");

const scopeMismatch = replayRiddleProofBrowserSealedProof({
  ...replayInput,
  expected_scope: { ...scope, revision: "a-different-revision" },
});
assertRejected(scopeMismatch, "protocol_trust_root");

function createFromFreshObservation(result) {
  const fresh = signProfileResult({
    fixtureScope: scope,
    fixtureNonce: nonce,
    fixtureSensor: sensor,
    fixtureProtocol: protocol,
    result,
  });
  assert.equal(fresh.ok, true, fresh.ok ? undefined : fresh.error.message);
  assert.notEqual(
    fresh.bundle.provenance.signature_base64,
    signed.bundle.provenance.signature_base64,
    "the negative observation is independently signed rather than a byte-tampered bundle",
  );
  return createRiddleProofBrowserSealedProof({ ...proofInput, bundle: fresh.bundle });
}

const routeRejected = createFromFreshObservation({
  ...jsonClone(profileResult),
  route: { ...profileResult.route, matched: false },
});
assertRejected(routeRejected, "leaf:riddle-proof.browser.route-matched");

const statusRejected = createFromFreshObservation({
  ...jsonClone(profileResult),
  status: "failed",
});
assertRejected(statusRejected, "leaf:riddle-proof.browser.declared-profile-passed");

const runtimeRejected = createFromFreshObservation({
  ...jsonClone(profileResult),
  evidence: {
    ...jsonClone(profileResult.evidence),
    console: { fatal_count: 1 },
  },
});
assertRejected(runtimeRejected, "leaf:riddle-proof.browser.captured-runtime-clean");

const changedArtifactBundle = jsonClone(signed.bundle);
changedArtifactBundle.inline_artifacts[0].bytes_base64 = Buffer.from(
  JSON.stringify({ ...profileResult, status: "failed" }),
).toString("base64");
const changedArtifact = createRiddleProofBrowserSealedProof({
  ...proofInput,
  bundle: changedArtifactBundle,
});
assertRejected(changedArtifact, "leaf:riddle-proof.browser.capture-bound-to-scope");

const changedSignatureBundle = jsonClone(signed.bundle);
changedSignatureBundle.provenance.signature_base64 = Buffer.alloc(64, 0).toString("base64");
const changedSignature = createRiddleProofBrowserSealedProof({
  ...proofInput,
  bundle: changedSignatureBundle,
});
assertRejected(changedSignature, "leaf:riddle-proof.browser.capture-bound-to-scope");

const changedNonceBundle = jsonClone(signed.bundle);
changedNonceBundle.statement.nonce = Buffer.alloc(32, 42).toString("base64url");
const changedNonce = createRiddleProofBrowserSealedProof({
  ...proofInput,
  bundle: changedNonceBundle,
});
assertRejected(changedNonce, "leaf:riddle-proof.browser.capture-bound-to-scope");

const wrongExpectedNonce = createRiddleProofBrowserSealedProof({
  ...proofInput,
  authority: {
    ...authority,
    policy: {
      ...authority.policy,
      expected_nonce: Buffer.alloc(32, 42).toString("base64url"),
    },
  },
});
assertRejected(wrongExpectedNonce, "leaf:riddle-proof.browser.capture-bound-to-scope");

const changedProtocol = jsonClone(protocol);
changedProtocol.rules.target_confirmed.registration.definition.label = "A substituted meaning rule";
const changedRuleCreation = createRiddleProofBrowserSealedProof({
  ...proofInput,
  protocol: changedProtocol,
});
assertRejected(changedRuleCreation, "protocol_trust_root");
const changedRuleReplay = replayRiddleProofBrowserSealedProof({
  ...replayInput,
  protocol: changedProtocol,
});
assertRejected(changedRuleReplay, "protocol_trust_root");

const changedScope = {
  ...scope,
  revision: "browser-pyramid-other-revision",
  proof_attempt: "browser-pyramid-other-attempt",
};
const changedProfileName = "synthetic-settings-profile-v2";
const changedProtocolResult = createRiddleProofBrowserSealedProtocol({
  expected_scope: changedScope,
  expected_profile_name: changedProfileName,
});
assert.equal(changedProtocolResult.ok, true);
const otherProtocol = changedProtocolResult.protocol;
const otherNonce = Buffer.alloc(32, 43).toString("base64url");
const otherSensor = {
  ...sensor,
  metadata: { ...sensor.metadata, mode: "synthetic-other-branch" },
};
const otherResult = {
  ...jsonClone(profileResult),
  profile_name: changedProfileName,
};
const otherSigned = signProfileResult({
  fixtureScope: changedScope,
  fixtureNonce: otherNonce,
  fixtureSensor: otherSensor,
  fixtureProtocol: otherProtocol,
  result: otherResult,
});
assert.equal(otherSigned.ok, true, otherSigned.ok ? undefined : otherSigned.error.message);
const otherProof = createRiddleProofBrowserSealedProof({
  bundle: otherSigned.bundle,
  expected_scope: changedScope,
  expected_profile_name: changedProfileName,
  authority: authorityFor({
    fixtureScope: changedScope,
    fixtureNonce: otherNonce,
    fixtureSensor: otherSensor,
    fixtureProtocol: otherProtocol,
  }),
  protocol: otherProtocol,
  leaf_issued_at: leafIssuedAt,
  target_issued_at: targetIssuedAt,
  behavior_issued_at: behaviorIssuedAt,
  root_issued_at: rootIssuedAt,
});
assert.equal(otherProof.ok, true, otherProof.ok ? undefined : otherProof.error.message);
assert.deepEqual(
  otherProtocol.rules.behavior_confirmed.rule_ref,
  protocol.rules.behavior_confirmed.rule_ref,
  "the generic behavior rule remains reusable across scopes",
);
const mismatchedBranchComposition = composeRiddleProofCheckedMeaningClosures({
  expected_rule: protocol.rules.sealed_profile_satisfied.rule_ref,
  closures: [
    created.branches.target_confirmed.checked_closure,
    otherProof.branches.behavior_confirmed.checked_closure,
  ],
  issued_at: rootIssuedAt,
  replay_contexts: [
    created.leaves.capture_bound_to_scope.replay_context,
    created.leaves.route_matched.replay_context,
    otherProof.leaves.declared_profile_passed.replay_context,
    otherProof.leaves.captured_runtime_clean.replay_context,
  ],
  rule_registry: ruleRegistry,
  trusted_rules: trustedRules,
});
assert.equal(mismatchedBranchComposition.ok, false);
assert.equal(mismatchedBranchComposition.error.code, "parameter_mismatch");

console.log("riddle-proof-runner-playwright sealed browser pyramid tests passed");
