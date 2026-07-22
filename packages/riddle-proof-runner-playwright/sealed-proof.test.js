import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  assessRiddleProofProfileEvidence,
  composeRiddleProofCheckedMeaningClosures,
  createRiddleProofCheckedMeaningAtomicClosure,
  createRiddleProofGroundedDeclarativeJsonContract,
  createRiddleProofGroundedSemanticAtomicCertificateClosure,
  createRiddleProofGroundedSemanticCertificate,
  createRiddleProofSignedCaptureBundle,
  normalizeRiddleProofProfile,
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
const normalizedProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: profileName,
  target: { route: "/settings", viewports: [{ name: "desktop", width: 1280, height: 800 }] },
  checks: [
    { type: "selector_visible", selector: "#settings" },
    { type: "no_fatal_console_errors" },
  ],
  artifacts: ["proof_json"],
  baseline_policy: "invariant_only",
  failure_policy: {},
}, { url: scope.target });
function normalizedProfileBytes(profile) {
  return Buffer.from(JSON.stringify(profile, null, 2));
}
function normalizedProfileDigest(profile) {
  return `sha256:${sha256Hex(normalizedProfileBytes(profile))}`;
}
const profileDigest = normalizedProfileDigest(normalizedProfile);
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
  expected_profile_digest: profileDigest,
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
  expected_profile_digest: profileDigest,
});
assert.equal(recreatedProtocol.ok, true);
assert.deepEqual(
  jsonClone(recreatedProtocol.protocol),
  jsonClone(protocol),
  "the pinned protocol is deterministic JSON data",
);

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
const profileEvidence = {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: profileName,
  target_url: scope.target,
  baseline_policy: "invariant_only",
  captured_at: capturedAt,
  viewports: [{
    name: "desktop",
    width: 1280,
    height: 800,
    url: scope.target,
    route: {
      requested: scope.target,
      observed: "/settings",
      expected_path: "/settings",
      matched: true,
      http_status: 200,
    },
    selectors: { "#settings": { count: 1, visible_count: 1 } },
  }],
  console: { events: [], fatal_count: 0 },
  page_errors: [],
  dom_summary: { expected_viewport_count: 1, viewport_count: 1, partial: false },
};
const profileResult = assessRiddleProofProfileEvidence(
  normalizedProfile,
  profileEvidence,
  { runner: "local-playwright" },
);
function signProfileResult({
  fixtureScope,
  fixtureNonce,
  fixtureSensor,
  fixtureProtocol,
  fixtureProfile,
  result,
}) {
  const profileBytes = normalizedProfileBytes(fixtureProfile);
  return createRiddleProofSignedCaptureBundle({
    scope: fixtureScope,
    nonce: fixtureNonce,
    captured_at: capturedAt,
    collector,
    sensor: fixtureSensor,
    verifier: fixtureProtocol.verifier.verifier_ref,
    artifacts: [
      {
        artifact_id: "normalized-profile.json",
        role: "profile_contract",
        media_type: "application/json",
        bytes_base64: profileBytes.toString("base64"),
      },
      {
        artifact_id: "profile-result.json",
        role: "derived_result",
        media_type: "application/json",
        bytes_base64: Buffer.from(JSON.stringify(result)).toString("base64"),
      },
    ],
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
      required_artifact_roles: ["profile_contract", "derived_result"],
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
  fixtureProfile: normalizedProfile,
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
  expected_profile_digest: profileDigest,
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
  authority: JSON.parse(JSON.stringify(authority)),
  protocol: JSON.parse(JSON.stringify(protocol)),
  expected_root_certificate_id: created.root_certificate.certificate_id,
  expected_scope: JSON.parse(JSON.stringify(scope)),
  expected_profile_name: profileName,
  expected_profile_digest: profileDigest,
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

const { privateKey: attackerPrivateKey, publicKey: attackerPublicKey } =
  generateKeyPairSync("ed25519");
const attackerPrivateKeyBytes = attackerPrivateKey.export({ format: "der", type: "pkcs8" });
const attackerPublicKeyBytes = attackerPublicKey.export({ format: "der", type: "spki" });
const attackerKeyId = "browser-pyramid-attacker-key";
const attackerNonce = Buffer.alloc(32, 99).toString("base64url");
const attackerBundle = createRiddleProofSignedCaptureBundle({
  scope,
  nonce: attackerNonce,
  captured_at: capturedAt,
  collector,
  sensor,
  verifier: protocol.verifier.verifier_ref,
  artifacts: [
    {
      artifact_id: "normalized-profile.json",
      role: "profile_contract",
      media_type: "application/json",
      bytes_base64: normalizedProfileBytes(normalizedProfile).toString("base64"),
    },
    {
      artifact_id: "profile-result.json",
      role: "derived_result",
      media_type: "application/json",
      bytes_base64: Buffer.from(JSON.stringify(profileResult)).toString("base64"),
    },
  ],
  signing_key: {
    key_id: attackerKeyId,
    private_key_pkcs8_base64: attackerPrivateKeyBytes.toString("base64"),
  },
});
assert.equal(attackerBundle.ok, true, attackerBundle.ok ? undefined : attackerBundle.error.message);
const attackerVerifierRegistration = {
  ...protocol.verifier.verifier_ref,
  verify: () => ({ attacker_selected: true }),
};
const attackerReplayContexts = [];
const attackerLeaves = [];
for (const exactContract of Object.values(protocol.contracts)) {
  const permissiveContract = createRiddleProofGroundedDeclarativeJsonContract({
    contract_id: exactContract.contract_ref.contract_id,
    contract_version: exactContract.contract_ref.contract_version,
    label: "Attacker-selected permissive browser contract",
    claim: jsonClone(exactContract.registration.claim),
    program: {
      all: [{
        op: "equals",
        source: "scope",
        pointer: "/repository",
        value: scope.repository,
      }],
    },
  });
  assert.equal(
    permissiveContract.ok,
    true,
    permissiveContract.ok ? undefined : permissiveContract.error.message,
  );
  assert.notEqual(
    permissiveContract.contract_ref.implementation_digest,
    exactContract.contract_ref.implementation_digest,
  );
  const attackerConfiguration = {
    policy: {
      expected_scope: scope,
      expected_nonce: attackerNonce,
      expected_collector: collector,
      expected_sensor: sensor,
      expected_verifier: protocol.verifier.verifier_ref,
      expected_signer: {
        key_id: attackerKeyId,
        public_key_spki_sha256: `sha256:${sha256Hex(attackerPublicKeyBytes)}`,
      },
      verification_time: leafIssuedAt,
      max_capture_age_ms: 60_000,
      max_future_skew_ms: 1_000,
      required_artifact_roles: ["profile_contract", "derived_result"],
    },
    trusted_signers: [{
      key_id: attackerKeyId,
      public_key_spki_base64: attackerPublicKeyBytes.toString("base64"),
    }],
    verifier_registry: [attackerVerifierRegistration],
    contract_registry: [permissiveContract.registration],
    expected_contract: permissiveContract.contract_ref,
  };
  const attackerIssued = createRiddleProofGroundedSemanticCertificate({
    bundle: attackerBundle.bundle,
    ...attackerConfiguration,
    issued_at: leafIssuedAt,
  });
  assert.equal(attackerIssued.ok, true, attackerIssued.ok ? undefined : attackerIssued.error.message);
  const attackerGrounded = createRiddleProofGroundedSemanticAtomicCertificateClosure({
    certificate: attackerIssued.certificate,
    grounding: attackerIssued.grounding,
    configuration: attackerConfiguration,
  });
  assert.equal(
    attackerGrounded.ok,
    true,
    attackerGrounded.ok ? undefined : attackerGrounded.error.message,
  );
  const attackerReplayContext = {
    certificate_id: attackerIssued.certificate.certificate_id,
    ...attackerConfiguration,
  };
  const attackerAtomic = createRiddleProofCheckedMeaningAtomicClosure({
    grounded_closure: attackerGrounded.grounded_closure,
    replay_contexts: [attackerReplayContext],
  });
  assert.equal(attackerAtomic.ok, true, attackerAtomic.ok ? undefined : attackerAtomic.error.message);
  attackerReplayContexts.push(attackerReplayContext);
  attackerLeaves.push(attackerAtomic.checked_closure);
}
const attackerTarget = composeRiddleProofCheckedMeaningClosures({
  expected_rule: protocol.rules.target_confirmed.rule_ref,
  closures: [attackerLeaves[0], attackerLeaves[1]],
  issued_at: targetIssuedAt,
  replay_contexts: attackerReplayContexts.slice(0, 2),
  rule_registry: ruleRegistry,
  trusted_rules: trustedRules,
});
assert.equal(attackerTarget.ok, true, attackerTarget.ok ? undefined : attackerTarget.error.message);
const attackerBehavior = composeRiddleProofCheckedMeaningClosures({
  expected_rule: protocol.rules.behavior_confirmed.rule_ref,
  closures: [attackerLeaves[2], attackerLeaves[3]],
  issued_at: behaviorIssuedAt,
  replay_contexts: attackerReplayContexts.slice(2),
  rule_registry: ruleRegistry,
  trusted_rules: trustedRules,
});
assert.equal(attackerBehavior.ok, true, attackerBehavior.ok ? undefined : attackerBehavior.error.message);
const attackerRoot = composeRiddleProofCheckedMeaningClosures({
  expected_rule: protocol.rules.sealed_profile_satisfied.rule_ref,
  closures: [attackerTarget.checked_closure, attackerBehavior.checked_closure],
  issued_at: rootIssuedAt,
  replay_contexts: attackerReplayContexts,
  rule_registry: ruleRegistry,
  trusted_rules: trustedRules,
});
assert.equal(attackerRoot.ok, true, attackerRoot.ok ? undefined : attackerRoot.error.message);
const independentlyRejectedAttackerRoot = replayRiddleProofBrowserSealedProof({
  ...replayInput,
  checked_closure: jsonClone(attackerRoot.checked_closure),
  expected_root_certificate_id: attackerRoot.certificate.certificate_id,
});
assertRejected(independentlyRejectedAttackerRoot);

const reusedTargetId = created.branches.target_confirmed.certificate.certificate_id;
const recomposedFromBranches = composeRiddleProofCheckedMeaningClosures({
  expected_rule: protocol.rules.sealed_profile_satisfied.rule_ref,
  closures: [
    jsonClone(created.branches.target_confirmed.checked_closure),
    jsonClone(created.branches.behavior_confirmed.checked_closure),
  ],
  issued_at: rootIssuedAt,
  replay_contexts: created.replay_contexts,
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
    fixtureProfile: normalizedProfile,
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
assertRejected(routeRejected, "leaf:riddle-proof.browser.capture-bound-to-scope");

const inconsistentObservedRoute = createFromFreshObservation({
  ...jsonClone(profileResult),
  route: { ...profileResult.route, observed: "/attacker-route", matched: true },
});
assertRejected(inconsistentObservedRoute, "leaf:riddle-proof.browser.capture-bound-to-scope");

const statusRejected = createFromFreshObservation({
  ...jsonClone(profileResult),
  status: "failed",
});
assertRejected(statusRejected, "leaf:riddle-proof.browser.capture-bound-to-scope");

const failedInternalCheckResult = jsonClone(profileResult);
failedInternalCheckResult.checks[0].status = "failed";
const failedInternalCheck = createFromFreshObservation(failedInternalCheckResult);
assertRejected(failedInternalCheck, "leaf:riddle-proof.browser.capture-bound-to-scope");

const emptyCheckSet = createFromFreshObservation({
  ...jsonClone(profileResult),
  checks: [],
});
assertRejected(emptyCheckSet, "leaf:riddle-proof.browser.capture-bound-to-scope");

const missingCheckSetResult = jsonClone(profileResult);
delete missingCheckSetResult.checks;
const missingCheckSet = createFromFreshObservation(missingCheckSetResult);
assertRejected(missingCheckSet, "leaf:riddle-proof.browser.capture-bound-to-scope");

const omittedDeclaredCheck = createFromFreshObservation({
  ...jsonClone(profileResult),
  checks: jsonClone(profileResult.checks.slice(0, 1)),
});
assertRejected(omittedDeclaredCheck, "leaf:riddle-proof.browser.capture-bound-to-scope");

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
const changedNormalizedProfile = {
  ...jsonClone(normalizedProfile),
  name: changedProfileName,
};
const changedProfileDigest = normalizedProfileDigest(changedNormalizedProfile);
const changedProtocolResult = createRiddleProofBrowserSealedProtocol({
  expected_scope: changedScope,
  expected_profile_name: changedProfileName,
  expected_profile_digest: changedProfileDigest,
});
assert.equal(changedProtocolResult.ok, true);
const otherProtocol = changedProtocolResult.protocol;
const otherNonce = Buffer.alloc(32, 43).toString("base64url");
const otherSensor = {
  ...sensor,
  metadata: { ...sensor.metadata, mode: "synthetic-other-branch" },
};
const otherResult = assessRiddleProofProfileEvidence(
  changedNormalizedProfile,
  {
    ...jsonClone(profileEvidence),
    profile_name: changedProfileName,
  },
  { runner: "local-playwright" },
);
const otherSigned = signProfileResult({
  fixtureScope: changedScope,
  fixtureNonce: otherNonce,
  fixtureSensor: otherSensor,
  fixtureProtocol: otherProtocol,
  fixtureProfile: changedNormalizedProfile,
  result: otherResult,
});
assert.equal(otherSigned.ok, true, otherSigned.ok ? undefined : otherSigned.error.message);
const otherProof = createRiddleProofBrowserSealedProof({
  bundle: otherSigned.bundle,
  expected_scope: changedScope,
  expected_profile_name: changedProfileName,
  expected_profile_digest: changedProfileDigest,
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
