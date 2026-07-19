import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { createRequire } from "node:module";

import * as grounded from "./dist/grounded-evidence.js";
import * as root from "./dist/index.js";
import { validateRiddleProofSemanticCertificateClosure } from "./dist/semantic-certificate.js";

const require = createRequire(import.meta.url);
const cjsGrounded = require("./dist/grounded-evidence.cjs");
const cjsRoot = require("./dist/index.cjs");

const groundedFunctions = [
  "createRiddleProofSignedCaptureBundle",
  "verifyRiddleProofSignedCaptureBundle",
  "createRiddleProofGroundedDeclarativeJsonVerifier",
  "createRiddleProofGroundedDeclarativeJsonContract",
  "createRiddleProofGroundedSemanticCertificate",
  "replayRiddleProofGroundedSemanticCertificate",
  "createRiddleProofGroundedSemanticAtomicCertificateClosure",
  "composeRiddleProofGroundedSemanticCertificateClosures",
  "validateRiddleProofGroundedSemanticCertificateClosure",
  "matchRiddleProofGroundedSemanticCertificateClosure",
];
for (const name of groundedFunctions) {
  assert.equal(typeof grounded[name], "function", `${name} ESM subpath export`);
  assert.equal(root[name], grounded[name], `${name} ESM root export`);
  assert.equal(typeof cjsGrounded[name], "function", `${name} CJS subpath export`);
  assert.equal(typeof cjsRoot[name], "function", `${name} CJS root export`);
}
assert.equal(
  root.RIDDLE_PROOF_GROUNDED_SEMANTIC_CERTIFICATE_CLOSURE_VERSION,
  grounded.RIDDLE_PROOF_GROUNDED_SEMANTIC_CERTIFICATE_CLOSURE_VERSION,
  "the grounded closure version should be available from the ESM root",
);
assert.equal(
  cjsRoot.RIDDLE_PROOF_GROUNDED_SEMANTIC_CERTIFICATE_CLOSURE_VERSION,
  cjsGrounded.RIDDLE_PROOF_GROUNDED_SEMANTIC_CERTIFICATE_CLOSURE_VERSION,
  "the grounded closure version should be available from the CJS root",
);

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("test fixture contains non-JSON data");
  return encoded;
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function receiptId(receipt) {
  const { receipt_id: _oldReceiptId, ...body } = receipt;
  return `rpgr_${sha256Hex(stableJson(body))}`;
}

function semanticCertificateId(certificate) {
  const { certificate_id: _oldCertificateId, ...body } = certificate;
  return `rpsc_${sha256Hex(stableJson(body))}`;
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function claimRef(claim) {
  return {
    claim_id: claim.claim_id,
    claim_version: claim.claim_version,
    ...(claim.parameters === undefined ? {} : { parameters: jsonClone(claim.parameters) }),
  };
}

const scope = {
  repository: "riddledc/integrations",
  revision: "grounded-semantic-closure-test",
  environment: "local",
  target: "https://fixture.example.test/grounded-closure",
  proof_attempt: "grounded-semantic-closure-1",
};

const collector = {
  collector_id: "riddle-proof.grounded-semantic-test",
  collector_version: "1",
  implementation_digest: `sha256:${"1".repeat(64)}`,
};

function makeLeaf({
  name,
  nonceByte,
  capturedAt,
  verificationTime,
  value,
  claim,
  digestByte,
}) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyBytes = privateKey.export({ format: "der", type: "pkcs8" });
  const publicKeyBytes = publicKey.export({ format: "der", type: "spki" });
  const keyId = `grounded-semantic-key-${name}`;
  const nonce = Buffer.alloc(32, nonceByte).toString("base64url");
  const sensor = {
    kind: "browser",
    name: `fixture-browser-${name}`,
    version: "1",
    observed_target: scope.target,
    metadata: { leaf: name, capture_policy: "fixture-observation" },
  };
  const verifierRef = {
    verifier_id: `riddle-proof.fixture-verifier-${name}`,
    verifier_version: "1",
    implementation_digest: `sha256:${digestByte.repeat(64)}`,
    trust_basis: { kind: "external_registry" },
  };
  const artifactRole = `fixture_observation_${name}`;
  const artifactId = `observations/${name}.json`;
  const artifactBody = { leaf: name, value };
  const creation = grounded.createRiddleProofSignedCaptureBundle({
    scope,
    nonce,
    captured_at: capturedAt,
    collector,
    sensor,
    verifier: verifierRef,
    artifacts: [{
      artifact_id: artifactId,
      role: artifactRole,
      media_type: "application/json",
      bytes_base64: Buffer.from(JSON.stringify(artifactBody)).toString("base64"),
    }],
    signing_key: {
      key_id: keyId,
      private_key_pkcs8_base64: privateKeyBytes.toString("base64"),
    },
  });
  assert.equal(creation.ok, true, creation.ok ? undefined : creation.error.message);

  function verifyArtifact(input) {
    assert.equal(this, undefined, "trusted verifier callbacks must not receive a registry object as this");
    const artifact = input.artifacts.find((candidate) => candidate.artifact_id === artifactId);
    assert.ok(artifact, `signed artifact ${artifactId} should be present`);
    return JSON.parse(Buffer.from(artifact.bytes).toString("utf8"));
  }
  const verifier = { ...verifierRef, verify: verifyArtifact };
  const publicKeyFingerprint = `sha256:${sha256Hex(publicKeyBytes)}`;
  const policy = {
    expected_scope: scope,
    expected_nonce: nonce,
    expected_collector: collector,
    expected_sensor: sensor,
    expected_verifier: verifierRef,
    expected_signer: {
      key_id: keyId,
      public_key_spki_sha256: publicKeyFingerprint,
    },
    verification_time: verificationTime,
    max_capture_age_ms: 60_000,
    max_future_skew_ms: 1_000,
    required_artifact_roles: [artifactRole],
  };
  const trustedSigner = {
    key_id: keyId,
    public_key_spki_base64: publicKeyBytes.toString("base64"),
  };
  const contractRef = {
    contract_id: `riddle-proof.fixture-contract-${name}`,
    contract_version: "1",
    implementation_digest: `sha256:${String(Number(digestByte) + 2).repeat(64)}`,
    trust_basis: { kind: "external_registry" },
  };
  function accepts(_observedScope, observation) {
    assert.equal(this, undefined, "trusted contract callbacks must not receive a registry object as this");
    return observation.leaf === name && observation.value === value;
  }
  const contract = {
    ...contractRef,
    label: `Accept fixture observation ${name}`,
    claim,
    accepts,
  };
  const configuration = {
    policy,
    trusted_signers: [trustedSigner],
    verifier_registry: [verifier],
    contract_registry: [contract],
    expected_contract: contractRef,
  };

  const issued = grounded.createRiddleProofGroundedSemanticCertificate({
    bundle: creation.bundle,
    ...configuration,
    issued_at: verificationTime,
  });
  assert.equal(issued.ok, true, issued.ok ? undefined : issued.error.message);
  assert.equal(issued.receipt.issued_at, policy.verification_time);
  assert.equal(issued.receipt.policy.expected_nonce, nonce);

  const replayed = grounded.replayRiddleProofGroundedSemanticCertificate({
    grounding: issued.grounding,
    configuration,
  });
  assert.equal(replayed.ok, true, replayed.ok ? undefined : replayed.error.message);
  assert.deepEqual(replayed.certificate, issued.certificate);
  assert.deepEqual(replayed.receipt, issued.receipt);

  const atomic = grounded.createRiddleProofGroundedSemanticAtomicCertificateClosure({
    certificate: issued.certificate,
    grounding: issued.grounding,
    configuration,
  });
  assert.equal(atomic.ok, true, atomic.ok ? undefined : atomic.error.message);
  assert.equal(atomic.grounded_closure.groundings.length, 1);
  assert.equal(atomic.grounded_closure.closure.root_certificate_id, issued.certificate.certificate_id);

  return {
    name,
    nonce,
    keyId,
    verifierRef,
    verifier,
    contractRef,
    contract,
    configuration,
    issued,
    atomic: atomic.grounded_closure,
  };
}

const earlyClaim = {
  claim_id: "fixture.early-state",
  claim_version: "1",
  parameters: { sample: 1 },
  label: "The early fixture state was observed",
};
const laterClaim = {
  claim_id: "fixture.later-state",
  claim_version: "1",
  parameters: { sample: 2 },
  label: "The later fixture state was observed",
};

const early = makeLeaf({
  name: "early",
  nonceByte: 11,
  capturedAt: "2026-07-19T15:00:00.000Z",
  verificationTime: "2026-07-19T15:00:01.000Z",
  value: "quiet",
  claim: earlyClaim,
  digestByte: "2",
});
const later = makeLeaf({
  name: "later",
  nonceByte: 12,
  capturedAt: "2026-07-19T15:00:02.000Z",
  verificationTime: "2026-07-19T15:00:03.000Z",
  value: "active",
  claim: laterClaim,
  digestByte: "3",
});

assert.notEqual(early.keyId, later.keyId, "the leaves should be independently signed");
assert.notEqual(early.nonce, later.nonce, "the leaves should use independent freshness challenges");
assert.notEqual(
  early.issued.receipt.signer.public_key_spki_sha256,
  later.issued.receipt.signer.public_key_spki_sha256,
  "the leaves should verify against independent signer keys",
);
assert.notDeepEqual(
  early.issued.receipt.policy,
  later.issued.receipt.policy,
  "each leaf should retain its independently supplied policy",
);

const replayContexts = [early, later].map((leaf) => ({
  certificate_id: leaf.issued.certificate.certificate_id,
  ...leaf.configuration,
}));

const behaviorClaim = {
  claim_id: "fixture.quiet-then-active",
  claim_version: "1",
  label: "The grounded fixture moved from quiet to active",
};
const behaviorRule = {
  rule_id: "fixture.compose-observations",
  rule_version: "1",
  label: "Compose the independent grounded observations",
  premises: [claimRef(earlyClaim), claimRef(laterClaim)],
  conclusion: behaviorClaim,
};
const behavior = grounded.composeRiddleProofGroundedSemanticCertificateClosures({
  rule: behaviorRule,
  closures: [early.atomic, later.atomic],
  issued_at: "2026-07-19T15:00:04.000Z",
  replay_contexts: replayContexts,
});
assert.equal(behavior.ok, true, behavior.ok ? undefined : behavior.error.message);

const retainedEarlyClaim = {
  claim_id: "fixture.retained-early-state",
  claim_version: "1",
  label: "The independently grounded early state remains available",
};
const retainedEarly = grounded.composeRiddleProofGroundedSemanticCertificateClosures({
  rule: {
    rule_id: "fixture.retain-early",
    rule_version: "1",
    label: "Retain the early leaf through a separate branch",
    premises: [claimRef(earlyClaim)],
    conclusion: retainedEarlyClaim,
  },
  closures: [early.atomic],
  issued_at: "2026-07-19T15:00:05.000Z",
  replay_contexts: [replayContexts[0]],
});
assert.equal(retainedEarly.ok, true, retainedEarly.ok ? undefined : retainedEarly.error.message);

const sharedConclusion = {
  claim_id: "fixture.shared-leaf-composition",
  claim_version: "1",
  parameters: { shared_leaf: "early" },
  label: "The nested grounded result reuses one exact early leaf",
};
const nested = grounded.composeRiddleProofGroundedSemanticCertificateClosures({
  rule: {
    rule_id: "fixture.compose-shared-branches",
    rule_version: "1",
    label: "Compose two grounded branches with one shared descendant",
    premises: [claimRef(behaviorClaim), claimRef(retainedEarlyClaim)],
    conclusion: sharedConclusion,
  },
  closures: [behavior.grounded_closure, retainedEarly.grounded_closure],
  issued_at: "2026-07-19T15:00:06.000Z",
  replay_contexts: replayContexts,
});
assert.equal(nested.ok, true, nested.ok ? undefined : nested.error.message);
assert.equal(nested.grounded_closure.groundings.length, 2);
assert.equal(
  nested.grounded_closure.groundings.filter(
    (binding) => binding.certificate_id === early.issued.certificate.certificate_id,
  ).length,
  1,
  "a shared grounded leaf should have exactly one replay sidecar",
);
assert.equal(
  nested.grounded_closure.closure.certificates.filter(
    (certificate) => certificate.certificate_id === early.issued.certificate.certificate_id,
  ).length,
  1,
  "a shared Semantic leaf should have exactly one certificate body",
);

const validated = grounded.validateRiddleProofGroundedSemanticCertificateClosure({
  grounded_closure: nested.grounded_closure,
  replay_contexts: replayContexts,
});
assert.equal(validated.ok, true, validated.ok ? undefined : validated.error.message);
assert.deepEqual(validated.root_certificate, nested.certificate);

const exactMatchInput = {
  grounded_closure: nested.grounded_closure,
  replay_contexts: replayContexts,
  expected_root_certificate_id: nested.certificate.certificate_id,
  expected_scope: scope,
  expected_claim: sharedConclusion,
  expected_assurance: "declared_runtime_rule",
};
const exactMatch = grounded.matchRiddleProofGroundedSemanticCertificateClosure(exactMatchInput);
assert.equal(exactMatch.ok, true, exactMatch.ok ? undefined : exactMatch.error.message);
assert.deepEqual(exactMatch.root_certificate, nested.certificate);

// Recomputing a forged receipt ID cannot make a backdated issued_at internally
// consistent with the receipt's independently recorded verification time.
const forgedIssuedAtOnly = jsonClone(early.issued.grounding);
forgedIssuedAtOnly.receipt.issued_at = "2026-07-19T15:00:00.000Z";
forgedIssuedAtOnly.receipt.receipt_id = receiptId(forgedIssuedAtOnly.receipt);
const forgedIssuedAtOnlyReplay = grounded.replayRiddleProofGroundedSemanticCertificate({
  grounding: forgedIssuedAtOnly,
  configuration: early.configuration,
});
assert.equal(forgedIssuedAtOnlyReplay.ok, false);
assert.equal(forgedIssuedAtOnlyReplay.error.code, "invalid_grounding");
assert.match(
  forgedIssuedAtOnlyReplay.error.message,
  /issued_at must exactly equal its independently recorded policy\.verification_time/u,
);

// Even rewriting the receipt's policy to make the hostile body internally
// consistent is insufficient: the independent replay policy reconstructs a
// different receipt.
const forgedReceiptGrounding = jsonClone(early.issued.grounding);
forgedReceiptGrounding.receipt.issued_at = "2026-07-19T15:00:00.000Z";
forgedReceiptGrounding.receipt.policy.verification_time = "2026-07-19T15:00:00.000Z";
forgedReceiptGrounding.receipt.receipt_id = receiptId(forgedReceiptGrounding.receipt);
assert.match(forgedReceiptGrounding.receipt.receipt_id, /^rpgr_[0-9a-f]{64}$/u);
assert.notEqual(
  forgedReceiptGrounding.receipt.receipt_id,
  early.issued.receipt.receipt_id,
  "the hostile receipt should be correctly content-addressed for its forged body",
);
const forgedReceiptReplay = grounded.replayRiddleProofGroundedSemanticCertificate({
  grounding: forgedReceiptGrounding,
  configuration: early.configuration,
});
assert.equal(forgedReceiptReplay.ok, false);
assert.equal(forgedReceiptReplay.error.code, "receipt_mismatch");

function assertInvalidGroundingShape(groundings, pattern) {
  const result = grounded.validateRiddleProofGroundedSemanticCertificateClosure({
    grounded_closure: { ...nested.grounded_closure, groundings },
    replay_contexts: replayContexts,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "invalid_input");
  assert.match(result.error.message, pattern);
}

assertInvalidGroundingShape(
  nested.grounded_closure.groundings.slice(0, 1),
  /missing grounding for contract certificate/u,
);
assertInvalidGroundingShape(
  [
    ...nested.grounded_closure.groundings,
    {
      ...jsonClone(early.issued.grounding),
      certificate_id: `rpsc_${"e".repeat(64)}`,
    },
  ],
  /extra grounding for a certificate outside the closure/u,
);
assertInvalidGroundingShape(
  [...nested.grounded_closure.groundings, jsonClone(nested.grounded_closure.groundings[0])],
  /repeats grounding/u,
);
assertInvalidGroundingShape(
  [
    ...nested.grounded_closure.groundings,
    {
      ...jsonClone(early.issued.grounding),
      certificate_id: nested.certificate.certificate_id,
    },
  ],
  /must not attach grounding to composition certificate/u,
);

const missingReplayContext = grounded.validateRiddleProofGroundedSemanticCertificateClosure({
  grounded_closure: nested.grounded_closure,
  replay_contexts: [replayContexts[0]],
});
assert.equal(missingReplayContext.ok, false);
assert.equal(missingReplayContext.error.code, "invalid_input");
assert.match(missingReplayContext.error.message, /exactly 2 leaf context/u);

const wrongReplayContext = grounded.validateRiddleProofGroundedSemanticCertificateClosure({
  grounded_closure: nested.grounded_closure,
  replay_contexts: [
    { ...replayContexts[0], certificate_id: `rpsc_${"d".repeat(64)}` },
    replayContexts[1],
  ],
});
assert.equal(wrongReplayContext.ok, false);
assert.equal(wrongReplayContext.error.code, "invalid_input");
assert.match(wrongReplayContext.error.message, /has no matching contract leaf/u);

const backdatedPublicComposition = grounded.composeRiddleProofGroundedSemanticCertificateClosures({
  rule: {
    rule_id: "fixture.backdated-public-composition",
    rule_version: "1",
    label: "A hostile caller attempts to predate its premise",
    premises: [claimRef(earlyClaim)],
    conclusion: retainedEarlyClaim,
  },
  closures: [early.atomic],
  issued_at: "2026-07-19T15:00:00.000Z",
  replay_contexts: [replayContexts[0]],
});
assert.equal(backdatedPublicComposition.ok, false);
assert.equal(backdatedPublicComposition.error.code, "invalid_input");
assert.match(backdatedPublicComposition.error.message, /must not precede latest premise root issued_at/u);

// The ordinary Semantic closure is correctly content-addressed and otherwise
// valid, but the grounded layer rejects its hostile chronology.
const hostileChronology = jsonClone(retainedEarly.grounded_closure);
const hostileRoot = hostileChronology.closure.certificates.find(
  (certificate) => certificate.certificate_id === hostileChronology.closure.root_certificate_id,
);
assert.ok(hostileRoot);
hostileRoot.issued_at = "2026-07-19T15:00:00.000Z";
hostileRoot.certificate_id = semanticCertificateId(hostileRoot);
hostileChronology.closure.root_certificate_id = hostileRoot.certificate_id;
const ordinarySemanticValidation = validateRiddleProofSemanticCertificateClosure(
  hostileChronology.closure,
);
assert.equal(
  ordinarySemanticValidation.ok,
  true,
  ordinarySemanticValidation.ok ? undefined : ordinarySemanticValidation.error.message,
);
const hostileChronologyValidation = grounded.validateRiddleProofGroundedSemanticCertificateClosure({
  grounded_closure: hostileChronology,
  replay_contexts: [replayContexts[0]],
});
assert.equal(hostileChronologyValidation.ok, false);
assert.equal(hostileChronologyValidation.error.code, "invalid_input");
assert.match(hostileChronologyValidation.error.message, /predates direct premise/u);

// Snapshot trusted expectations before any verifier or contract callback runs.
// Both callbacks also verify that registry membership does not become `this`.
const verifierThisValues = [];
const contractThisValues = [];
let mutationMatchInput;
const mutationVerifier = {
  ...early.verifierRef,
  verify: function mutationVerifierCallback(input) {
    verifierThisValues.push(this);
    mutationMatchInput.expected_root_certificate_id = `rpsc_${"c".repeat(64)}`;
    mutationMatchInput.expected_scope.revision = "attacker-mutated-revision";
    mutationMatchInput.expected_claim.claim_id = "attacker.mutated-claim";
    mutationMatchInput.expected_assurance = "runtime_contract_accepted";
    return Reflect.apply(early.verifier.verify, undefined, [input]);
  },
};
const mutationContract = {
  ...early.contractRef,
  label: early.contract.label,
  claim: early.contract.claim,
  accepts: function mutationContractCallback(observedScope, observation) {
    contractThisValues.push(this);
    mutationMatchInput.expected_scope.environment = "attacker-mutated-environment";
    return Reflect.apply(early.contract.accepts, undefined, [observedScope, observation]);
  },
};
const mutationReplayContexts = [
  {
    ...replayContexts[0],
    verifier_registry: [mutationVerifier],
    contract_registry: [mutationContract],
  },
  replayContexts[1],
];
mutationMatchInput = {
  grounded_closure: nested.grounded_closure,
  replay_contexts: mutationReplayContexts,
  expected_root_certificate_id: nested.certificate.certificate_id,
  expected_scope: jsonClone(scope),
  expected_claim: jsonClone(sharedConclusion),
  expected_assurance: "declared_runtime_rule",
};
const mutationResistantMatch = grounded.matchRiddleProofGroundedSemanticCertificateClosure(
  mutationMatchInput,
);
assert.equal(
  mutationResistantMatch.ok,
  true,
  mutationResistantMatch.ok ? undefined : mutationResistantMatch.error.message,
);
assert.ok(verifierThisValues.length >= 2, "the hostile verifier should run during replay");
assert.ok(contractThisValues.length >= 2, "the hostile contract should run during replay");
assert.ok(verifierThisValues.every((value) => value === undefined));
assert.ok(contractThisValues.every((value) => value === undefined));
assert.equal(mutationMatchInput.expected_scope.revision, "attacker-mutated-revision");
assert.equal(mutationMatchInput.expected_claim.claim_id, "attacker.mutated-claim");

// Exercise the callback-free path across the full compositional boundary. The
// only replay material below is data that survives JSON serialization: exact
// signed bytes, policies, keys, declarative verifier/contract programs, and the
// grounded Semantic closure. No function registry is available after the
// handoff.
function makeDeclarativeLeaf({ name, value, nonceByte, capturedAt, verificationTime }) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyBytes = privateKey.export({ format: "der", type: "pkcs8" });
  const publicKeyBytes = publicKey.export({ format: "der", type: "spki" });
  const keyId = `grounded-declarative-composition-key-${name}`;
  const nonce = Buffer.alloc(32, nonceByte).toString("base64url");
  const artifactId = `declarative/${name}.json`;
  const artifactRole = `declarative_observation_${name}`;

  const declarativeVerifier = grounded.createRiddleProofGroundedDeclarativeJsonVerifier({
    verifier_id: `riddle-proof.declarative-composition-verifier-${name}`,
    verifier_version: "1",
    program: {
      artifact: {
        artifact_id: artifactId,
        role: artifactRole,
        media_type: "application/json",
      },
      pointer: "",
    },
  });
  assert.equal(
    declarativeVerifier.ok,
    true,
    declarativeVerifier.ok ? undefined : declarativeVerifier.error.message,
  );

  const claim = {
    claim_id: `fixture.declarative-${name}`,
    claim_version: "1",
    parameters: { value },
    label: `The declarative ${name} observation was accepted`,
  };
  const declarativeContract = grounded.createRiddleProofGroundedDeclarativeJsonContract({
    contract_id: `riddle-proof.declarative-composition-contract-${name}`,
    contract_version: "1",
    label: `Accept the exact declarative ${name} observation`,
    claim,
    program: {
      all: [
        { op: "equals", source: "observation", pointer: "/leaf", value: name },
        { op: "equals", source: "observation", pointer: "/value", value },
        { op: "equals", source: "scope", pointer: "/revision", value: scope.revision },
        { op: "type_is", source: "observation", pointer: "/value", type: "string" },
      ],
    },
  });
  assert.equal(
    declarativeContract.ok,
    true,
    declarativeContract.ok ? undefined : declarativeContract.error.message,
  );

  const sensor = {
    kind: "browser",
    name: `fixture-declarative-browser-${name}`,
    version: "1",
    observed_target: scope.target,
    metadata: { leaf: name, capture_policy: "declarative-composition-fixture" },
  };
  const bundle = grounded.createRiddleProofSignedCaptureBundle({
    scope,
    nonce,
    captured_at: capturedAt,
    collector,
    sensor,
    verifier: declarativeVerifier.verifier_ref,
    artifacts: [{
      artifact_id: artifactId,
      role: artifactRole,
      media_type: "application/json",
      bytes_base64: Buffer.from(JSON.stringify({ leaf: name, value })).toString("base64"),
    }],
    signing_key: {
      key_id: keyId,
      private_key_pkcs8_base64: privateKeyBytes.toString("base64"),
    },
  });
  assert.equal(bundle.ok, true, bundle.ok ? undefined : bundle.error.message);

  const configuration = {
    policy: {
      expected_scope: scope,
      expected_nonce: nonce,
      expected_collector: collector,
      expected_sensor: sensor,
      expected_verifier: declarativeVerifier.verifier_ref,
      expected_signer: {
        key_id: keyId,
        public_key_spki_sha256: `sha256:${sha256Hex(publicKeyBytes)}`,
      },
      verification_time: verificationTime,
      max_capture_age_ms: 60_000,
      max_future_skew_ms: 1_000,
      required_artifact_roles: [artifactRole],
    },
    trusted_signers: [{
      key_id: keyId,
      public_key_spki_base64: publicKeyBytes.toString("base64"),
    }],
    verifier_registry: [declarativeVerifier.registration],
    contract_registry: [declarativeContract.registration],
    expected_contract: declarativeContract.contract_ref,
  };
  const issued = grounded.createRiddleProofGroundedSemanticCertificate({
    bundle: bundle.bundle,
    ...configuration,
    issued_at: verificationTime,
  });
  assert.equal(issued.ok, true, issued.ok ? undefined : issued.error.message);
  const atomic = grounded.createRiddleProofGroundedSemanticAtomicCertificateClosure({
    certificate: issued.certificate,
    grounding: issued.grounding,
    configuration,
  });
  assert.equal(atomic.ok, true, atomic.ok ? undefined : atomic.error.message);

  return { claim, issued, atomic: atomic.grounded_closure, configuration };
}

const declarativeEarly = makeDeclarativeLeaf({
  name: "early",
  value: "quiet",
  nonceByte: 21,
  capturedAt: "2026-07-19T16:00:00.000Z",
  verificationTime: "2026-07-19T16:00:01.000Z",
});
const declarativeLater = makeDeclarativeLeaf({
  name: "later",
  value: "active",
  nonceByte: 22,
  capturedAt: "2026-07-19T16:00:02.000Z",
  verificationTime: "2026-07-19T16:00:03.000Z",
});

const serializedDeclarativeLeaves = jsonClone({
  closures: [declarativeEarly.atomic, declarativeLater.atomic],
  replay_contexts: [
    {
      certificate_id: declarativeEarly.issued.certificate.certificate_id,
      ...declarativeEarly.configuration,
    },
    {
      certificate_id: declarativeLater.issued.certificate.certificate_id,
      ...declarativeLater.configuration,
    },
  ],
});
const serializedDeclarativeLeafText = JSON.stringify(serializedDeclarativeLeaves);
assert.equal(serializedDeclarativeLeafText.includes('"external_registry"'), false);
assert.equal(serializedDeclarativeLeafText.includes('"verify"'), false);
assert.equal(serializedDeclarativeLeafText.includes('"accepts"'), false);

const declarativeBehaviorClaim = {
  claim_id: "fixture.declarative-quiet-then-active",
  claim_version: "1",
  label: "The serialized declarative fixture moved from quiet to active",
};
const declarativeBehavior = grounded.composeRiddleProofGroundedSemanticCertificateClosures({
  rule: {
    rule_id: "fixture.compose-serialized-declarative-observations",
    rule_version: "1",
    label: "Compose two callback-free grounded observations",
    premises: [claimRef(declarativeEarly.claim), claimRef(declarativeLater.claim)],
    conclusion: declarativeBehaviorClaim,
  },
  closures: serializedDeclarativeLeaves.closures,
  issued_at: "2026-07-19T16:00:04.000Z",
  replay_contexts: serializedDeclarativeLeaves.replay_contexts,
});
assert.equal(
  declarativeBehavior.ok,
  true,
  declarativeBehavior.ok ? undefined : declarativeBehavior.error.message,
);

const declarativeRetainedClaim = {
  claim_id: "fixture.declarative-retained-early",
  claim_version: "1",
  label: "The serialized declarative early observation remains available",
};
const declarativeRetained = grounded.composeRiddleProofGroundedSemanticCertificateClosures({
  rule: {
    rule_id: "fixture.retain-serialized-declarative-early",
    rule_version: "1",
    label: "Retain the callback-free early leaf through another branch",
    premises: [claimRef(declarativeEarly.claim)],
    conclusion: declarativeRetainedClaim,
  },
  closures: [serializedDeclarativeLeaves.closures[0]],
  issued_at: "2026-07-19T16:00:05.000Z",
  replay_contexts: [serializedDeclarativeLeaves.replay_contexts[0]],
});
assert.equal(
  declarativeRetained.ok,
  true,
  declarativeRetained.ok ? undefined : declarativeRetained.error.message,
);

const declarativeSharedClaim = {
  claim_id: "fixture.declarative-shared-leaf-composition",
  claim_version: "1",
  label: "The serialized callback-free closure reuses one exact early leaf",
};
const declarativeNested = grounded.composeRiddleProofGroundedSemanticCertificateClosures({
  rule: {
    rule_id: "fixture.compose-serialized-declarative-shared-branches",
    rule_version: "1",
    label: "Compose serialized callback-free branches with a shared descendant",
    premises: [claimRef(declarativeBehaviorClaim), claimRef(declarativeRetainedClaim)],
    conclusion: declarativeSharedClaim,
  },
  closures: jsonClone([
    declarativeBehavior.grounded_closure,
    declarativeRetained.grounded_closure,
  ]),
  issued_at: "2026-07-19T16:00:06.000Z",
  replay_contexts: serializedDeclarativeLeaves.replay_contexts,
});
assert.equal(
  declarativeNested.ok,
  true,
  declarativeNested.ok ? undefined : declarativeNested.error.message,
);
assert.equal(declarativeNested.grounded_closure.groundings.length, 2);
assert.equal(declarativeNested.grounded_closure.closure.certificates.length, 5);

const serializedDeclarativeHandoff = JSON.parse(JSON.stringify({
  grounded_closure: declarativeNested.grounded_closure,
  replay_contexts: serializedDeclarativeLeaves.replay_contexts,
}));
const declarativeHandoffValidation =
  grounded.validateRiddleProofGroundedSemanticCertificateClosure(serializedDeclarativeHandoff);
assert.equal(
  declarativeHandoffValidation.ok,
  true,
  declarativeHandoffValidation.ok ? undefined : declarativeHandoffValidation.error.message,
);
const declarativeHandoffMatch = grounded.matchRiddleProofGroundedSemanticCertificateClosure({
  ...serializedDeclarativeHandoff,
  expected_root_certificate_id: declarativeNested.certificate.certificate_id,
  expected_scope: scope,
  expected_claim: declarativeSharedClaim,
  expected_assurance: "declared_runtime_rule",
});
assert.equal(
  declarativeHandoffMatch.ok,
  true,
  declarativeHandoffMatch.ok ? undefined : declarativeHandoffMatch.error.message,
);

console.log(JSON.stringify({
  ok: true,
  leaves: nested.grounded_closure.groundings.length,
  certificates: nested.grounded_closure.closure.certificates.length,
  root_certificate_id: nested.certificate.certificate_id,
  hostile_chronology_rejected: true,
  expectation_toctou_rejected: true,
  declarative_serialized_composition: {
    leaves: declarativeNested.grounded_closure.groundings.length,
    certificates: declarativeNested.grounded_closure.closure.certificates.length,
    root_certificate_id: declarativeNested.certificate.certificate_id,
  },
}));
