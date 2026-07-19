import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";

import * as grounded from "./dist/grounded-evidence.js";
import * as root from "./dist/index.js";

const requiredFunctions = [
  "createRiddleProofSignedCaptureBundle",
  "verifyRiddleProofSignedCaptureBundle",
  "createRiddleProofGroundedDeclarativeJsonVerifier",
  "createRiddleProofGroundedDeclarativeJsonContract",
];
for (const name of requiredFunctions) {
  assert.equal(typeof grounded[name], "function", `${name} subpath export`);
  assert.equal(typeof root[name], "function", `${name} root export`);
}

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyBytes = privateKey.export({ format: "der", type: "pkcs8" });
const publicKeyBytes = publicKey.export({ format: "der", type: "spki" });
const publicKeyFingerprint = `sha256:${createHash("sha256").update(publicKeyBytes).digest("hex")}`;

const scope = {
  repository: "riddledc/integrations",
  revision: "grounded-test-revision",
  environment: "local-playwright",
  target: "https://fixture.example.test/pass",
  proof_attempt: "grounded-test-1",
};
const nonce = Buffer.alloc(32, 7).toString("base64url");
const collector = {
  collector_id: "riddle-proof.local-playwright",
  collector_version: "1",
  implementation_digest: `sha256:${"1".repeat(64)}`,
};
const sensor = {
  kind: "browser",
  name: "chromium",
  version: "test-browser-1",
  observed_target: scope.target,
  metadata: {
    user_agent: "grounded-test-browser",
    capture_policy: "navigation_and_profile_checks",
  },
};
const verifierRef = {
  verifier_id: "riddle-proof.browser-profile-evidence",
  verifier_version: "1",
  implementation_digest: `sha256:${"2".repeat(64)}`,
  trust_basis: { kind: "external_registry" },
};
const artifacts = [
  {
    artifact_id: "profile-evidence.json",
    role: "browser_observation",
    media_type: "application/json",
    bytes_base64: Buffer.from(JSON.stringify({ route_ok: true, console_errors: 0 })).toString("base64"),
  },
  {
    artifact_id: "screenshots/desktop.png",
    role: "screenshot",
    media_type: "image/png",
    bytes_base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"),
  },
  {
    artifact_id: "dom-summary.json",
    role: "dom_summary",
    media_type: "application/json",
    bytes_base64: Buffer.from(JSON.stringify({ text: "Fixture ready" })).toString("base64"),
  },
];

const created = grounded.createRiddleProofSignedCaptureBundle({
  scope,
  nonce,
  captured_at: "2026-07-19T14:30:00.000Z",
  collector,
  sensor,
  verifier: verifierRef,
  artifacts,
  signing_key: {
    key_id: "grounded-test-key",
    private_key_pkcs8_base64: privateKeyBytes.toString("base64"),
  },
});
assert.equal(created.ok, true, created.ok ? undefined : created.error.message);
const bundle = created.bundle;
assert.deepEqual(
  bundle.statement.artifacts.map((artifact) => artifact.artifact_id),
  ["dom-summary.json", "profile-evidence.json", "screenshots/desktop.png"],
  "the signed manifest is canonical and artifact-id sorted",
);

const verifier = {
  ...verifierRef,
  verify(input) {
    const profileEvidence = input.artifacts.find((artifact) => artifact.role === "browser_observation");
    const domSummary = input.artifacts.find((artifact) => artifact.role === "dom_summary");
    assert.ok(profileEvidence);
    assert.ok(domSummary);
    return {
      scope: input.scope,
      route: JSON.parse(Buffer.from(profileEvidence.bytes).toString("utf8")),
      dom: JSON.parse(Buffer.from(domSummary.bytes).toString("utf8")),
      screenshot_digest: input.artifacts.find((artifact) => artifact.role === "screenshot")?.artifact_digest,
    };
  },
};

const policy = {
  expected_scope: scope,
  expected_nonce: nonce,
  expected_collector: collector,
  expected_sensor: sensor,
  expected_verifier: verifierRef,
  expected_signer: {
    key_id: "grounded-test-key",
    public_key_spki_sha256: publicKeyFingerprint,
  },
  required_artifact_roles: ["browser_observation", "dom_summary", "screenshot"],
  verification_time: "2026-07-19T14:30:01.000Z",
  max_capture_age_ms: 60_000,
  max_future_skew_ms: 1_000,
};
const trustedSigners = [{
  key_id: "grounded-test-key",
  public_key_spki_base64: publicKeyBytes.toString("base64"),
}];

function verify(overrides = {}) {
  return grounded.verifyRiddleProofSignedCaptureBundle({
    bundle,
    policy,
    trusted_signers: trustedSigners,
    verifier_registry: [verifier],
    ...overrides,
  });
}

const verified = verify();
assert.equal(verified.ok, true, verified.ok ? undefined : verified.error.message);
assert.match(verified.verified_capture.bundle_id, /^rpgb_[0-9a-f]{64}$/u);
assert.match(verified.verified_capture.statement_digest, /^sha256:[0-9a-f]{64}$/u);
assert.match(verified.verified_capture.observation_digest, /^sha256:[0-9a-f]{64}$/u);
assert.equal(verified.verified_capture.observation.route.route_ok, true);
assert.equal(verified.verified_capture.observation.dom.text, "Fixture ready");

const changedBytes = structuredClone(bundle);
changedBytes.inline_artifacts[0].bytes_base64 = Buffer.from(JSON.stringify({ text: "Forged" })).toString("base64");
const changedBytesResult = verify({ bundle: changedBytes });
assert.equal(changedBytesResult.ok, false);
assert.equal(changedBytesResult.error.code, "invalid_bundle");

const reorderedBytes = structuredClone(bundle);
reorderedBytes.inline_artifacts.reverse();
const reorderedBytesResult = verify({ bundle: reorderedBytes });
assert.equal(reorderedBytesResult.ok, false);
assert.equal(reorderedBytesResult.error.code, "invalid_bundle");

const unsupportedStatementVersion = structuredClone(bundle);
unsupportedStatementVersion.statement.version = "riddle-proof.grounded-capture-statement.unsupported";
const unsupportedStatementVersionResult = verify({ bundle: unsupportedStatementVersion });
assert.equal(unsupportedStatementVersionResult.ok, false);
assert.equal(unsupportedStatementVersionResult.error.code, "invalid_bundle");

const wrongNonceResult = verify({
  policy: { ...policy, expected_nonce: Buffer.alloc(32, 8).toString("base64url") },
});
assert.equal(wrongNonceResult.ok, false);
assert.equal(wrongNonceResult.error.code, "policy_mismatch");

const staleResult = verify({
  policy: { ...policy, verification_time: "2026-07-19T14:32:00.000Z", max_capture_age_ms: 1_000 },
});
assert.equal(staleResult.ok, false);
assert.equal(staleResult.error.code, "capture_stale");

const futureResult = verify({
  policy: { ...policy, verification_time: "2026-07-19T14:29:00.000Z", max_future_skew_ms: 1_000 },
});
assert.equal(futureResult.ok, false);
assert.equal(futureResult.error.code, "capture_from_future");

const badSignature = structuredClone(bundle);
badSignature.provenance.signature_base64 = Buffer.alloc(64, 9).toString("base64");
const badSignatureResult = verify({ bundle: badSignature });
assert.equal(badSignatureResult.ok, false);
assert.equal(badSignatureResult.error.code, "signature_invalid");

const aliasedKeyIdBundle = structuredClone(bundle);
aliasedKeyIdBundle.provenance.key_id = "grounded-test-key-alias";
const aliasedKeyIdResult = verify({
  bundle: aliasedKeyIdBundle,
  policy: {
    ...policy,
    expected_signer: {
      key_id: "grounded-test-key-alias",
      public_key_spki_sha256: publicKeyFingerprint,
    },
  },
  trusted_signers: [{
    key_id: "grounded-test-key-alias",
    public_key_spki_base64: publicKeyBytes.toString("base64"),
  }],
});
assert.equal(aliasedKeyIdResult.ok, false);
assert.equal(
  aliasedKeyIdResult.error.code,
  "signature_invalid",
  "the protected signature header must bind key_id, not only statement bytes",
);

const trailingPublicDerResult = verify({
  trusted_signers: [{
    key_id: "grounded-test-key",
    public_key_spki_base64: Buffer.concat([publicKeyBytes, Buffer.from([0])]).toString("base64"),
  }],
});
assert.equal(trailingPublicDerResult.ok, false);
assert.equal(trailingPublicDerResult.error.code, "invalid_input");

const trailingPrivateDerCreation = grounded.createRiddleProofSignedCaptureBundle({
  scope,
  nonce,
  captured_at: "2026-07-19T14:30:00.000Z",
  collector,
  sensor,
  verifier: verifierRef,
  artifacts,
  signing_key: {
    key_id: "grounded-test-key",
    private_key_pkcs8_base64: Buffer.concat([privateKeyBytes, Buffer.from([0])]).toString("base64"),
  },
});
assert.equal(trailingPrivateDerCreation.ok, false);
assert.equal(trailingPrivateDerCreation.error.code, "invalid_input");

const wrongVerifierResult = verify({ verifier_registry: [{
  ...verifier,
  implementation_digest: `sha256:${"3".repeat(64)}`,
}] });
assert.equal(wrongVerifierResult.ok, false);
assert.equal(wrongVerifierResult.error.code, "verifier_not_registered");

let nondeterministicCounter = 0;
const nondeterministicResult = verify({ verifier_registry: [{
  ...verifierRef,
  verify: () => ({ counter: nondeterministicCounter += 1 }),
}] });
assert.equal(nondeterministicResult.ok, false);
assert.equal(nondeterministicResult.error.code, "verifier_nondeterministic");

const asyncVerifierResult = verify({ verifier_registry: [{
  ...verifierRef,
  verify: async () => ({ should_not: "be accepted" }),
}] });
assert.equal(asyncVerifierResult.ok, false);
assert.equal(asyncVerifierResult.error.code, "verifier_error");

let verifierThis = "not-called";
const isolatedThisResult = verify({ verifier_registry: [{
  ...verifierRef,
  verify(input) {
    verifierThis = this;
    return {
      artifact_count: input.artifacts.length,
      nonce: input.nonce,
    };
  },
}] });
assert.equal(isolatedThisResult.ok, true, isolatedThisResult.ok ? undefined : isolatedThisResult.error.message);
assert.equal(verifierThis, undefined, "registry callbacks must not receive their descriptor as this");

Object.defineProperty(Object.prototype, "program", {
  configurable: true,
  enumerable: false,
  value: {
    artifact: {
      artifact_id: "profile-evidence.json",
      role: "browser_observation",
      media_type: "application/json",
    },
    pointer: "/route_ok",
  },
});
try {
  const prototypePollutedExternalVerifierResult = verify();
  assert.equal(
    prototypePollutedExternalVerifierResult.ok,
    true,
    prototypePollutedExternalVerifierResult.ok
      ? undefined
      : prototypePollutedExternalVerifierResult.error.message,
  );
  assert.deepEqual(
    prototypePollutedExternalVerifierResult.verified_capture.observation,
    verified.verified_capture.observation,
    "inherited program data must not switch an external verifier onto the built-in interpreter",
  );
} finally {
  delete Object.prototype.program;
}

const rejectingExternalContractRef = {
  contract_id: "riddle-proof.prototype-pollution-rejector",
  contract_version: "1",
  implementation_digest: `sha256:${"6".repeat(64)}`,
  trust_basis: { kind: "external_registry" },
};
Object.defineProperty(Object.prototype, "program", {
  configurable: true,
  enumerable: false,
  value: {
    all: [{ op: "equals", source: "observation", pointer: "/route/route_ok", value: true }],
  },
});
try {
  const prototypePollutedExternalContractResult =
    grounded.createRiddleProofGroundedSemanticCertificate({
      bundle,
      policy,
      trusted_signers: trustedSigners,
      verifier_registry: [verifier],
      contract_registry: [{
        ...rejectingExternalContractRef,
        label: "Always reject despite inherited built-in-looking program data",
        claim: {
          claim_id: "prototype-pollution-must-not-bypass-callback",
          claim_version: "1",
          label: "The external rejecting callback remained authoritative",
        },
        accepts: () => false,
      }],
      expected_contract: rejectingExternalContractRef,
      issued_at: policy.verification_time,
    });
  assert.equal(prototypePollutedExternalContractResult.ok, false);
  assert.equal(prototypePollutedExternalContractResult.error.code, "contract_rejected");
} finally {
  delete Object.prototype.program;
}

let toJsonCalled = false;
const toJsonVerifierResult = verify({ verifier_registry: [{
  ...verifierRef,
  verify: () => ({
    fact: true,
    toJSON() {
      toJsonCalled = true;
      return { fact: false };
    },
  }),
}] });
assert.equal(toJsonVerifierResult.ok, false);
assert.equal(toJsonCalled, false, "untrusted verifier output toJSON must never execute");

const sparseArtifacts = new Array(1);
const sparseCreation = grounded.createRiddleProofSignedCaptureBundle({
  scope,
  nonce,
  captured_at: "2026-07-19T14:30:00.000Z",
  collector,
  sensor,
  verifier: verifierRef,
  artifacts: sparseArtifacts,
  signing_key: {
    key_id: "grounded-test-key",
    private_key_pkcs8_base64: privateKeyBytes.toString("base64"),
  },
});
assert.equal(sparseCreation.ok, false);
assert.equal(sparseCreation.error.code, "invalid_input");

const declarativeVerifierDefinition = {
  verifier_id: "riddle-proof.browser-profile-evidence.declarative",
  verifier_version: "1",
  program: {
    artifact: {
      artifact_id: "profile-evidence.json",
      role: "browser_observation",
      media_type: "application/json",
    },
    pointer: "",
  },
};
const declarativeVerifier = grounded.createRiddleProofGroundedDeclarativeJsonVerifier(
  declarativeVerifierDefinition,
);
assert.equal(
  declarativeVerifier.ok,
  true,
  declarativeVerifier.ok ? undefined : declarativeVerifier.error.message,
);
assert.equal(declarativeVerifier.verifier_ref.trust_basis.kind, "builtin_declarative_json");
assert.equal("verify" in declarativeVerifier.registration, false, "built-in verifier is data-only");
assert.ok(Object.isFrozen(declarativeVerifier.registration));
assert.ok(Object.isFrozen(declarativeVerifier.registration.program));

const reorderedDeclarativeVerifier = grounded.createRiddleProofGroundedDeclarativeJsonVerifier({
  program: {
    pointer: "",
    artifact: {
      media_type: "application/json",
      role: "browser_observation",
      artifact_id: "profile-evidence.json",
    },
  },
  verifier_version: "1",
  verifier_id: "riddle-proof.browser-profile-evidence.declarative",
});
assert.equal(reorderedDeclarativeVerifier.ok, true);
assert.equal(
  reorderedDeclarativeVerifier.verifier_ref.implementation_digest,
  declarativeVerifier.verifier_ref.implementation_digest,
  "canonical definition hashing is independent of JavaScript insertion order",
);

function createDeclarativeBundle(
  verifierReference = declarativeVerifier.verifier_ref,
  captureArtifacts = artifacts,
) {
  const result = grounded.createRiddleProofSignedCaptureBundle({
    scope,
    nonce,
    captured_at: "2026-07-19T14:30:00.000Z",
    collector,
    sensor,
    verifier: verifierReference,
    artifacts: captureArtifacts,
    signing_key: {
      key_id: "grounded-test-key",
      private_key_pkcs8_base64: privateKeyBytes.toString("base64"),
    },
  });
  assert.equal(result.ok, true, result.ok ? undefined : result.error.message);
  return result.bundle;
}

function withProfileBytes(bytes) {
  return artifacts.map((artifact) => artifact.artifact_id === "profile-evidence.json"
    ? { ...artifact, bytes_base64: Buffer.from(bytes).toString("base64") }
    : { ...artifact });
}

const declarativeBundle = createDeclarativeBundle();
const declarativePolicy = {
  ...policy,
  expected_verifier: declarativeVerifier.verifier_ref,
};
function verifyDeclarative(overrides = {}) {
  return grounded.verifyRiddleProofSignedCaptureBundle({
    bundle: declarativeBundle,
    policy: declarativePolicy,
    trusted_signers: trustedSigners,
    verifier_registry: [declarativeVerifier.registration],
    ...overrides,
  });
}

const declarativeVerification = verifyDeclarative();
assert.equal(
  declarativeVerification.ok,
  true,
  declarativeVerification.ok ? undefined : declarativeVerification.error.message,
);
assert.deepEqual(declarativeVerification.verified_capture.observation, {
  route_ok: true,
  console_errors: 0,
});
const repeatedDeclarativeVerification = verifyDeclarative();
assert.equal(repeatedDeclarativeVerification.ok, true);
assert.equal(
  repeatedDeclarativeVerification.verified_capture.observation_digest,
  declarativeVerification.verified_capture.observation_digest,
  "fixed interpreter is deterministic",
);

const forgedDeclarativeRegistration = structuredClone(declarativeVerifier.registration);
forgedDeclarativeRegistration.implementation_digest = `sha256:${"f".repeat(64)}`;
const forgedDeclarativeResult = verifyDeclarative({
  verifier_registry: [forgedDeclarativeRegistration],
});
assert.equal(forgedDeclarativeResult.ok, false);
assert.equal(forgedDeclarativeResult.error.code, "invalid_input");
assert.match(forgedDeclarativeResult.error.message, /does not match its canonical declarative definition/u);

const tamperedDeclarativeRegistration = structuredClone(declarativeVerifier.registration);
tamperedDeclarativeRegistration.program.pointer = "/route_ok";
const tamperedDeclarativeResult = verifyDeclarative({
  verifier_registry: [tamperedDeclarativeRegistration],
});
assert.equal(tamperedDeclarativeResult.ok, false);
assert.equal(tamperedDeclarativeResult.error.code, "invalid_input");

let hostileVerifierGetterCalled = false;
const hostileDeclarativeRegistration = structuredClone(declarativeVerifier.registration);
Object.defineProperty(hostileDeclarativeRegistration, "verify", {
  enumerable: true,
  get() {
    hostileVerifierGetterCalled = true;
    return () => ({ forged: true });
  },
});
const hostileDeclarativeResult = verifyDeclarative({
  verifier_registry: [hostileDeclarativeRegistration],
});
assert.equal(hostileDeclarativeResult.ok, false);
assert.equal(hostileDeclarativeResult.error.code, "invalid_input");
assert.equal(hostileVerifierGetterCalled, false, "built-in registry never reads a callback getter");

const missingPointerVerifier = grounded.createRiddleProofGroundedDeclarativeJsonVerifier({
  ...declarativeVerifierDefinition,
  program: { ...declarativeVerifierDefinition.program, pointer: "/missing" },
});
assert.equal(missingPointerVerifier.ok, true);
const missingPointerBundle = createDeclarativeBundle(missingPointerVerifier.verifier_ref);
const missingPointerResult = verifyDeclarative({
  bundle: missingPointerBundle,
  policy: { ...declarativePolicy, expected_verifier: missingPointerVerifier.verifier_ref },
  verifier_registry: [missingPointerVerifier.registration],
});
assert.equal(missingPointerResult.ok, false);
assert.equal(missingPointerResult.error.code, "verifier_rejected");

const wrongRoleVerifier = grounded.createRiddleProofGroundedDeclarativeJsonVerifier({
  ...declarativeVerifierDefinition,
  program: {
    ...declarativeVerifierDefinition.program,
    artifact: { ...declarativeVerifierDefinition.program.artifact, role: "wrong_role" },
  },
});
assert.equal(wrongRoleVerifier.ok, true);
const wrongRoleBundle = createDeclarativeBundle(wrongRoleVerifier.verifier_ref);
const wrongRoleResult = verifyDeclarative({
  bundle: wrongRoleBundle,
  policy: { ...declarativePolicy, expected_verifier: wrongRoleVerifier.verifier_ref },
  verifier_registry: [wrongRoleVerifier.registration],
});
assert.equal(wrongRoleResult.ok, false);
assert.equal(wrongRoleResult.error.code, "verifier_rejected");

const invalidUtf8Bundle = createDeclarativeBundle(
  declarativeVerifier.verifier_ref,
  withProfileBytes(new Uint8Array([0xc3, 0x28])),
);
const invalidUtf8Result = verifyDeclarative({ bundle: invalidUtf8Bundle });
assert.equal(invalidUtf8Result.ok, false);
assert.equal(invalidUtf8Result.error.code, "verifier_rejected");

const bomBundle = createDeclarativeBundle(
  declarativeVerifier.verifier_ref,
  withProfileBytes(Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(JSON.stringify({ route_ok: true, console_errors: 0 })),
  ])),
);
const bomResult = verifyDeclarative({ bundle: bomBundle });
assert.equal(bomResult.ok, false);
assert.equal(bomResult.error.code, "verifier_rejected");

const escapedPointerVerifier = grounded.createRiddleProofGroundedDeclarativeJsonVerifier({
  ...declarativeVerifierDefinition,
  program: { ...declarativeVerifierDefinition.program, pointer: "/a~1b/~0key/1" },
});
assert.equal(escapedPointerVerifier.ok, true);
const escapedPointerBundle = createDeclarativeBundle(
  escapedPointerVerifier.verifier_ref,
  withProfileBytes(Buffer.from(JSON.stringify({ "a/b": { "~key": ["zero", "one"] } }))),
);
const escapedPointerResult = verifyDeclarative({
  bundle: escapedPointerBundle,
  policy: { ...declarativePolicy, expected_verifier: escapedPointerVerifier.verifier_ref },
  verifier_registry: [escapedPointerVerifier.registration],
});
assert.equal(escapedPointerResult.ok, true);
assert.equal(escapedPointerResult.verified_capture.observation, "one");

const invalidPointerDefinition = grounded.createRiddleProofGroundedDeclarativeJsonVerifier({
  ...declarativeVerifierDefinition,
  program: { ...declarativeVerifierDefinition.program, pointer: "/bad~2escape" },
});
assert.equal(invalidPointerDefinition.ok, false);
assert.equal(invalidPointerDefinition.error.code, "invalid_input");
const oversizedPointerDefinition = grounded.createRiddleProofGroundedDeclarativeJsonVerifier({
  ...declarativeVerifierDefinition,
  program: { ...declarativeVerifierDefinition.program, pointer: `/${"x".repeat(4097)}` },
});
assert.equal(oversizedPointerDefinition.ok, false);
const tooManyPointerSegmentsDefinition = grounded.createRiddleProofGroundedDeclarativeJsonVerifier({
  ...declarativeVerifierDefinition,
  program: {
    ...declarativeVerifierDefinition.program,
    pointer: Array.from({ length: 129 }, () => "/x").join(""),
  },
});
assert.equal(tooManyPointerSegmentsDefinition.ok, false);

const oversizedObservationBundle = createDeclarativeBundle(
  declarativeVerifier.verifier_ref,
  withProfileBytes(Buffer.from(JSON.stringify({
    oversized: "x".repeat(grounded.RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_OBSERVATION_BYTES),
  }))),
);
const oversizedObservationResult = verifyDeclarative({ bundle: oversizedObservationBundle });
assert.equal(oversizedObservationResult.ok, false);
assert.equal(oversizedObservationResult.error.code, "verifier_rejected");

const declarativeContractDefinition = {
  contract_id: "riddle-proof.browser-profile-accepted.declarative",
  contract_version: "1",
  label: "Browser profile evidence passed fixed JSON assertions",
  claim: {
    claim_id: "browser-profile-accepted",
    claim_version: "1",
    label: "Browser profile evidence was accepted",
  },
  program: {
    all: [
      { op: "equals", source: "observation", pointer: "/route_ok", value: true },
      { op: "equals", source: "observation", pointer: "/console_errors", value: 0 },
      { op: "type_is", source: "observation", pointer: "/route_ok", type: "boolean" },
      { op: "equals", source: "scope", pointer: "/revision", value: scope.revision },
    ],
  },
};
const declarativeContract = grounded.createRiddleProofGroundedDeclarativeJsonContract(
  declarativeContractDefinition,
);
assert.equal(
  declarativeContract.ok,
  true,
  declarativeContract.ok ? undefined : declarativeContract.error.message,
);
assert.equal("accepts" in declarativeContract.registration, false, "built-in contract is data-only");
assert.notEqual(
  declarativeContract.contract_ref.implementation_digest,
  declarativeVerifier.verifier_ref.implementation_digest,
  "contract and verifier definitions have separate digest domains",
);

const changedClaimContract = grounded.createRiddleProofGroundedDeclarativeJsonContract({
  ...declarativeContractDefinition,
  claim: { ...declarativeContractDefinition.claim, label: "Different semantic meaning" },
});
assert.equal(changedClaimContract.ok, true);
assert.notEqual(
  changedClaimContract.contract_ref.implementation_digest,
  declarativeContract.contract_ref.implementation_digest,
  "declarative contract digest binds its meaning descriptor",
);

const groundedCertification = grounded.createRiddleProofGroundedSemanticCertificate({
  bundle: declarativeBundle,
  policy: declarativePolicy,
  trusted_signers: trustedSigners,
  verifier_registry: [declarativeVerifier.registration],
  contract_registry: [declarativeContract.registration],
  expected_contract: declarativeContract.contract_ref,
  issued_at: declarativePolicy.verification_time,
});
assert.equal(
  groundedCertification.ok,
  true,
  groundedCertification.ok ? undefined : groundedCertification.error.message,
);
assert.equal(
  groundedCertification.receipt.observation_digest,
  declarativeVerification.verified_capture.observation_digest,
);
const groundedReplay = grounded.replayRiddleProofGroundedSemanticCertificate({
  grounding: groundedCertification.grounding,
  configuration: {
    policy: declarativePolicy,
    trusted_signers: trustedSigners,
    verifier_registry: [declarativeVerifier.registration],
    contract_registry: [declarativeContract.registration],
    expected_contract: declarativeContract.contract_ref,
  },
});
assert.equal(groundedReplay.ok, true, groundedReplay.ok ? undefined : groundedReplay.error.message);
assert.equal(groundedReplay.certificate.certificate_id, groundedCertification.certificate.certificate_id);

const rejectingContract = grounded.createRiddleProofGroundedDeclarativeJsonContract({
  ...declarativeContractDefinition,
  program: {
    all: [{ op: "equals", source: "observation", pointer: "/console_errors", value: 1 }],
  },
});
assert.equal(rejectingContract.ok, true);
const rejectedCertification = grounded.createRiddleProofGroundedSemanticCertificate({
  bundle: declarativeBundle,
  policy: declarativePolicy,
  trusted_signers: trustedSigners,
  verifier_registry: [declarativeVerifier.registration],
  contract_registry: [rejectingContract.registration],
  expected_contract: rejectingContract.contract_ref,
  issued_at: declarativePolicy.verification_time,
});
assert.equal(rejectedCertification.ok, false);
assert.equal(rejectedCertification.error.code, "contract_rejected");

const forgedContractRegistration = structuredClone(declarativeContract.registration);
forgedContractRegistration.program.all[0].value = false;
let hostileContractCallbackCalled = false;
forgedContractRegistration.accepts = () => {
  hostileContractCallbackCalled = true;
  return true;
};
const forgedContractCertification = grounded.createRiddleProofGroundedSemanticCertificate({
  bundle: declarativeBundle,
  policy: declarativePolicy,
  trusted_signers: trustedSigners,
  verifier_registry: [declarativeVerifier.registration],
  contract_registry: [forgedContractRegistration],
  expected_contract: declarativeContract.contract_ref,
  issued_at: declarativePolicy.verification_time,
});
assert.equal(forgedContractCertification.ok, false);
assert.equal(forgedContractCertification.error.code, "invalid_input");
assert.equal(hostileContractCallbackCalled, false, "built-in contract never invokes caller code");

const tooManyAssertionsContract = grounded.createRiddleProofGroundedDeclarativeJsonContract({
  ...declarativeContractDefinition,
  program: {
    all: Array.from({ length: 65 }, () => ({
      op: "exists",
      source: "observation",
      pointer: "",
    })),
  },
});
assert.equal(tooManyAssertionsContract.ok, false);

const oversizedDefinitionContract = grounded.createRiddleProofGroundedDeclarativeJsonContract({
  ...declarativeContractDefinition,
  program: {
    all: Array.from({ length: 64 }, (_, index) => ({
      op: "equals",
      source: "observation",
      pointer: `/field-${index}`,
      value: "x".repeat(1_100),
    })),
  },
});
assert.equal(oversizedDefinitionContract.ok, false);

const tooManyArtifactsCreation = grounded.createRiddleProofSignedCaptureBundle({
  scope,
  nonce,
  captured_at: "2026-07-19T14:30:00.000Z",
  collector,
  sensor,
  verifier: verifierRef,
  artifacts: Array.from({ length: 65 }, (_, index) => ({
    artifact_id: `resource-limit-${String(index).padStart(2, "0")}.json`,
    role: "resource_limit_fixture",
    media_type: "application/json",
    bytes_base64: Buffer.from("{}").toString("base64"),
  })),
  signing_key: {
    key_id: "grounded-test-key",
    private_key_pkcs8_base64: privateKeyBytes.toString("base64"),
  },
});
assert.equal(tooManyArtifactsCreation.ok, false);
assert.equal(tooManyArtifactsCreation.error.code, "invalid_input");

console.log(JSON.stringify({
  ok: true,
  bundle_id: verified.verified_capture.bundle_id,
  artifacts: bundle.statement.artifacts.length,
  observation_digest: verified.verified_capture.observation_digest,
  declarative_bundle_id: declarativeVerification.verified_capture.bundle_id,
  declarative_certificate_id: groundedCertification.certificate.certificate_id,
}));
