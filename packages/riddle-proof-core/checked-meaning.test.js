import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { createRequire } from "node:module";

import * as checked from "./dist/checked-meaning.js";
import * as core from "./dist/index.js";
import * as grounded from "./dist/grounded-evidence.js";

const require = createRequire(import.meta.url);
const checkedCjs = require("./dist/checked-meaning.cjs");
const coreCjs = require("./dist/index.cjs");

for (const name of [
  "createRiddleProofCheckedMeaningRule",
  "createRiddleProofCheckedMeaningAtomicClosure",
  "composeRiddleProofCheckedMeaningClosures",
  "validateRiddleProofCheckedMeaningClosure",
  "replayRiddleProofCheckedMeaningClosure",
  "assessRiddleProofCheckedMeaningClosure",
  "matchRiddleProofCheckedMeaningClosure",
]) {
  assert.equal(typeof checked[name], "function", `${name} ESM subpath export`);
  assert.equal(core[name], checked[name], `${name} ESM root export`);
  assert.equal(typeof checkedCjs[name], "function", `${name} CJS subpath export`);
  assert.equal(typeof coreCjs[name], "function", `${name} CJS root export`);
}
assert.equal(
  core.RIDDLE_PROOF_CHECKED_MEANING_MAX_CONSUMPTION_WINDOW_MS,
  checked.RIDDLE_PROOF_CHECKED_MEANING_MAX_CONSUMPTION_WINDOW_MS,
);
assert.equal(
  coreCjs.RIDDLE_PROOF_CHECKED_MEANING_MAX_CONSUMPTION_WINDOW_MS,
  checkedCjs.RIDDLE_PROOF_CHECKED_MEANING_MAX_CONSUMPTION_WINDOW_MS,
);

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
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
  revision: "checked-meaning-runtime-test",
  environment: "local",
  target: "document://fixture/item-7",
  proof_attempt: "checked-meaning-1",
};

const collector = {
  collector_id: "riddle-proof.checked-meaning-test",
  collector_version: "1",
  implementation_digest: `sha256:${"1".repeat(64)}`,
};

function makeLeaf({
  name,
  claimId,
  documentId,
  revision,
  nonceByte,
  capturedAt,
  verificationTime,
}) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyBytes = privateKey.export({ format: "der", type: "pkcs8" });
  const publicKeyBytes = publicKey.export({ format: "der", type: "spki" });
  const nonce = Buffer.alloc(32, nonceByte).toString("base64url");
  const artifactId = `observations/${name}.json`;
  const artifactRole = `checked_meaning_${name}`;
  const claim = {
    claim_id: claimId,
    claim_version: "1",
    parameters: { document_id: documentId, revision },
    label: `The ${name} fact was grounded`,
  };
  const verifier = grounded.createRiddleProofGroundedDeclarativeJsonVerifier({
    verifier_id: `riddle-proof.checked-meaning-verifier-${name}`,
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
  assert.equal(verifier.ok, true, verifier.ok ? undefined : verifier.error.message);
  const contract = grounded.createRiddleProofGroundedDeclarativeJsonContract({
    contract_id: `riddle-proof.checked-meaning-contract-${name}`,
    contract_version: "1",
    label: `Accept exact ${name} observation`,
    claim,
    program: {
      all: [
        { op: "equals", source: "observation", pointer: "/name", value: name },
        { op: "equals", source: "observation", pointer: "/document_id", value: documentId },
        { op: "equals", source: "observation", pointer: "/revision", value: revision },
        { op: "equals", source: "scope", pointer: "/revision", value: scope.revision },
      ],
    },
  });
  assert.equal(contract.ok, true, contract.ok ? undefined : contract.error.message);
  const keyId = `checked-meaning-key-${name}`;
  const sensor = {
    kind: "api",
    name: `fixture-document-sensor-${name}`,
    version: "1",
    observed_target: scope.target,
    metadata: { mode: "synthetic-read-only" },
  };
  const bundle = grounded.createRiddleProofSignedCaptureBundle({
    scope,
    nonce,
    captured_at: capturedAt,
    collector,
    sensor,
    verifier: verifier.verifier_ref,
    artifacts: [{
      artifact_id: artifactId,
      role: artifactRole,
      media_type: "application/json",
      bytes_base64: Buffer.from(JSON.stringify({ name, document_id: documentId, revision })).toString("base64"),
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
      expected_verifier: verifier.verifier_ref,
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
    verifier_registry: [verifier.registration],
    contract_registry: [contract.registration],
    expected_contract: contract.contract_ref,
  };
  const issued = grounded.createRiddleProofGroundedSemanticCertificate({
    bundle: bundle.bundle,
    ...configuration,
    issued_at: verificationTime,
  });
  assert.equal(issued.ok, true, issued.ok ? undefined : issued.error.message);
  const atomicGrounded = grounded.createRiddleProofGroundedSemanticAtomicCertificateClosure({
    certificate: issued.certificate,
    grounding: issued.grounding,
    configuration,
  });
  assert.equal(atomicGrounded.ok, true, atomicGrounded.ok ? undefined : atomicGrounded.error.message);
  const replayContext = { certificate_id: issued.certificate.certificate_id, ...configuration };
  const atomic = checked.createRiddleProofCheckedMeaningAtomicClosure({
    grounded_closure: atomicGrounded.grounded_closure,
    replay_contexts: [replayContext],
  });
  assert.equal(atomic.ok, true, atomic.ok ? undefined : atomic.error.message);
  assert.equal(atomic.checked_closure.rule_bindings.length, 0);
  assert.equal(atomic.root_assurance, "grounded_contract_leaf");
  return {
    claim,
    issued,
    grounded: atomicGrounded.grounded_closure,
    checked: atomic.checked_closure,
    replayContext,
  };
}

const requestLeaf = makeLeaf({
  name: "accepted-request",
  claimId: "fixture.accepted-request",
  documentId: "doc-7",
  revision: "rev-42",
  nonceByte: 31,
  capturedAt: "2026-07-19T17:00:00.000Z",
  verificationTime: "2026-07-19T17:00:01.000Z",
});
const readbackLeaf = makeLeaf({
  name: "readback",
  claimId: "fixture.readback",
  documentId: "doc-7",
  revision: "rev-42",
  nonceByte: 32,
  capturedAt: "2026-07-19T17:00:02.000Z",
  verificationTime: "2026-07-19T17:00:03.000Z",
});
const wrongReadbackLeaf = makeLeaf({
  name: "wrong-readback",
  claimId: "fixture.readback",
  documentId: "doc-8",
  revision: "rev-42",
  nonceByte: 33,
  capturedAt: "2026-07-19T17:00:02.000Z",
  verificationTime: "2026-07-19T17:00:03.000Z",
});

const replayContexts = [requestLeaf.replayContext, readbackLeaf.replayContext];
const allReplayContexts = [...replayContexts, wrongReadbackLeaf.replayContext];

function anyDocumentParameters() {
  return {
    document_id: { op: "any" },
    revision: { op: "any" },
  };
}

const roundTripDefinition = {
  rule_id: "fixture.checked-save-round-trip",
  rule_version: "1",
  label: "Derive a bounded save round trip from request and readback",
  premises: [
    {
      claim_id: "fixture.accepted-request",
      claim_version: "1",
      parameters: anyDocumentParameters(),
    },
    {
      claim_id: "fixture.readback",
      claim_version: "1",
      parameters: anyDocumentParameters(),
    },
  ],
  conclusion: {
    claim_id: "fixture.bounded-save-round-trip",
    claim_version: "1",
    label: "The same document revision was accepted and read back",
    parameters: {
      document_id: { op: "from_premise", premise_index: 0, parameter: "document_id" },
      revision: { op: "from_premise", premise_index: 1, parameter: "revision" },
      mode: { op: "literal", value: "observed" },
    },
  },
  constraints: {
    all_of: true,
    parameter_equalities: [
      {
        members: [
          { premise_index: 0, parameter: "document_id" },
          { premise_index: 1, parameter: "document_id" },
        ],
      },
      {
        members: [
          { premise_index: 0, parameter: "revision" },
          { premise_index: 1, parameter: "revision" },
        ],
      },
    ],
    ordered_premise_chronology: true,
    max_age_ms: 5_000,
  },
};

const roundTripRule = checked.createRiddleProofCheckedMeaningRule({
  definition: roundTripDefinition,
});
assert.equal(roundTripRule.ok, true, roundTripRule.ok ? undefined : roundTripRule.error.message);
assert.match(roundTripRule.rule_ref.implementation_digest, /^sha256:[0-9a-f]{64}$/u);
assert.equal(JSON.stringify(roundTripRule.registration).includes("function"), false);

const executableRule = checked.createRiddleProofCheckedMeaningRule({
  definition: {
    ...jsonClone(roundTripDefinition),
    accepts: () => true,
  },
});
assert.equal(executableRule.ok, false);
assert.equal(executableRule.error.code, "invalid_rule_definition");

let hostileGetterRead = false;
const getterRuleDefinition = jsonClone(roundTripDefinition);
Object.defineProperty(getterRuleDefinition, "label", {
  enumerable: true,
  get() {
    hostileGetterRead = true;
    return "This getter must never execute";
  },
});
const getterRule = checked.createRiddleProofCheckedMeaningRule({
  definition: getterRuleDefinition,
});
assert.equal(getterRule.ok, false);
assert.equal(getterRule.error.code, "invalid_rule_definition");
assert.equal(hostileGetterRead, false);

const notAllOfRule = checked.createRiddleProofCheckedMeaningRule({
  definition: {
    ...jsonClone(roundTripDefinition),
    constraints: {
      ...jsonClone(roundTripDefinition.constraints),
      all_of: false,
    },
  },
});
assert.equal(notAllOfRule.ok, false);
assert.equal(notAllOfRule.error.code, "invalid_rule_definition");

const recreatedRoundTripRule = checked.createRiddleProofCheckedMeaningRule({
  definition: jsonClone(roundTripDefinition),
});
assert.equal(recreatedRoundTripRule.ok, true);
assert.deepEqual(recreatedRoundTripRule.rule_ref, roundTripRule.rule_ref);

const changedRoundTripRule = checked.createRiddleProofCheckedMeaningRule({
  definition: {
    ...jsonClone(roundTripDefinition),
    conclusion: {
      ...jsonClone(roundTripDefinition.conclusion),
      label: "A changed meaning under the same public ID",
    },
  },
});
assert.equal(changedRoundTripRule.ok, true);
assert.notEqual(
  changedRoundTripRule.rule_ref.implementation_digest,
  roundTripRule.rule_ref.implementation_digest,
);

const roundTrip = checked.composeRiddleProofCheckedMeaningClosures({
  expected_rule: roundTripRule.rule_ref,
  closures: [requestLeaf.checked, readbackLeaf.checked],
  issued_at: "2026-07-19T17:00:04.000Z",
  replay_contexts: replayContexts,
  rule_registry: [roundTripRule.registration],
  trusted_rules: [roundTripRule.rule_ref],
});
assert.equal(roundTrip.ok, true, roundTrip.ok ? undefined : roundTrip.error.message);
assert.equal(roundTrip.assurance, "checked_allowlisted_rule");
assert.deepEqual(roundTrip.certificate.claim.parameters, {
  document_id: "doc-7",
  revision: "rev-42",
  mode: "observed",
});
assert.equal(roundTrip.checked_closure.rule_bindings.length, 1);
assert.equal(roundTrip.checked_closure.grounded_closure.groundings.length, 2);

const roundTripValidation = checked.validateRiddleProofCheckedMeaningClosure({
  checked_closure: jsonClone(roundTrip.checked_closure),
  replay_contexts: jsonClone(replayContexts),
  rule_registry: [roundTripRule.registration],
  trusted_rules: [roundTripRule.rule_ref],
});
assert.equal(roundTripValidation.ok, true, roundTripValidation.ok ? undefined : roundTripValidation.error.message);
assert.equal(roundTripValidation.root_assurance, "checked_allowlisted_rule");
assert.deepEqual(roundTripValidation.root_certificate, roundTrip.certificate);

const replayedRoundTrip = checked.replayRiddleProofCheckedMeaningClosure({
  checked_closure: JSON.parse(JSON.stringify(roundTrip.checked_closure)),
  replay_contexts: JSON.parse(JSON.stringify(replayContexts)),
  rule_registry: JSON.parse(JSON.stringify([roundTripRule.registration])),
  trusted_rules: JSON.parse(JSON.stringify([roundTripRule.rule_ref])),
});
assert.equal(replayedRoundTrip.ok, true, replayedRoundTrip.ok ? undefined : replayedRoundTrip.error.message);

const roundTripMatch = checked.matchRiddleProofCheckedMeaningClosure({
  checked_closure: roundTrip.checked_closure,
  replay_contexts: replayContexts,
  rule_registry: [roundTripRule.registration],
  trusted_rules: [roundTripRule.rule_ref],
  expected_root_certificate_id: roundTrip.certificate.certificate_id,
  expected_scope: scope,
  expected_claim: roundTrip.certificate.claim,
  expected_root_rule: roundTripRule.rule_ref,
});
assert.equal(roundTripMatch.ok, true, roundTripMatch.ok ? undefined : roundTripMatch.error.message);

// Reusing the same rule against a different document is rejected by the
// explicit parameter-equality constraint before a Semantic root is issued.
const parameterMismatch = checked.composeRiddleProofCheckedMeaningClosures({
  expected_rule: roundTripRule.rule_ref,
  closures: [requestLeaf.checked, wrongReadbackLeaf.checked],
  issued_at: "2026-07-19T17:00:04.000Z",
  replay_contexts: [requestLeaf.replayContext, wrongReadbackLeaf.replayContext],
  rule_registry: [roundTripRule.registration],
  trusted_rules: [roundTripRule.rule_ref],
});
assert.equal(parameterMismatch.ok, false);
assert.equal(parameterMismatch.error.code, "parameter_mismatch");

const backdated = checked.composeRiddleProofCheckedMeaningClosures({
  expected_rule: roundTripRule.rule_ref,
  closures: [requestLeaf.checked, readbackLeaf.checked],
  issued_at: "2026-07-19T17:00:00.000Z",
  replay_contexts: replayContexts,
  rule_registry: [roundTripRule.registration],
  trusted_rules: [roundTripRule.rule_ref],
});
assert.equal(backdated.ok, false);
assert.equal(backdated.error.code, "chronology_mismatch");

const stale = checked.composeRiddleProofCheckedMeaningClosures({
  expected_rule: roundTripRule.rule_ref,
  closures: [requestLeaf.checked, readbackLeaf.checked],
  issued_at: "2026-07-19T17:00:07.000Z",
  replay_contexts: replayContexts,
  rule_registry: [roundTripRule.registration],
  trusted_rules: [roundTripRule.rule_ref],
});
assert.equal(stale.ok, false);
assert.equal(stale.error.code, "stale_premise");

// Replay must enforce freshness too: a caller can bypass the checked composer
// and still create a content-valid grounded composition at a later timestamp.
const staleGrounded = grounded.composeRiddleProofGroundedSemanticCertificateClosures({
  rule: jsonClone(roundTrip.certificate.derivation.rule),
  closures: [requestLeaf.grounded, readbackLeaf.grounded],
  issued_at: "2026-07-19T17:00:07.000Z",
  replay_contexts: replayContexts,
});
assert.equal(staleGrounded.ok, true, staleGrounded.ok ? undefined : staleGrounded.error.message);
const staleChecked = {
  version: checked.RIDDLE_PROOF_CHECKED_MEANING_CLOSURE_VERSION,
  grounded_closure: staleGrounded.grounded_closure,
  rule_bindings: [{
    ...jsonClone(roundTrip.checked_closure.rule_bindings[0]),
    certificate_id: staleGrounded.certificate.certificate_id,
  }],
};
const staleValidation = checked.replayRiddleProofCheckedMeaningClosure({
  checked_closure: staleChecked,
  replay_contexts: replayContexts,
  rule_registry: [roundTripRule.registration],
  trusted_rules: [roundTripRule.rule_ref],
});
assert.equal(staleValidation.ok, false);
assert.equal(staleValidation.error.code, "stale_premise");

const reversedDefinition = {
  rule_id: "fixture.checked-reversed-chronology",
  rule_version: "1",
  label: "Attempt to compose later then earlier",
  premises: [
    { claim_id: "fixture.readback", claim_version: "1", parameters: anyDocumentParameters() },
    { claim_id: "fixture.accepted-request", claim_version: "1", parameters: anyDocumentParameters() },
  ],
  conclusion: {
    claim_id: "fixture.reversed",
    claim_version: "1",
    label: "A reversed chronology",
  },
  constraints: {
    all_of: true,
    ordered_premise_chronology: true,
  },
};
const reversedRule = checked.createRiddleProofCheckedMeaningRule({ definition: reversedDefinition });
assert.equal(reversedRule.ok, true);
const reversed = checked.composeRiddleProofCheckedMeaningClosures({
  expected_rule: reversedRule.rule_ref,
  closures: [readbackLeaf.checked, requestLeaf.checked],
  issued_at: "2026-07-19T17:00:04.000Z",
  replay_contexts: replayContexts,
  rule_registry: [reversedRule.registration],
  trusted_rules: [reversedRule.rule_ref],
});
assert.equal(reversed.ok, false);
assert.equal(reversed.error.code, "chronology_mismatch");

// Build a second branch from the shared request leaf, then compose the two
// branches. Both grounded leaves and prior checked-rule bindings deduplicate.
const retainDefinition = {
  rule_id: "fixture.checked-retain-request",
  rule_version: "1",
  label: "Retain the accepted request as a checked fact",
  premises: [{
    claim_id: "fixture.accepted-request",
    claim_version: "1",
    parameters: anyDocumentParameters(),
  }],
  conclusion: {
    claim_id: "fixture.retained-request",
    claim_version: "1",
    label: "The accepted request remains available",
    parameters: {
      document_id: { op: "from_premise", premise_index: 0, parameter: "document_id" },
    },
  },
  constraints: { all_of: true, ordered_premise_chronology: true, max_age_ms: 5_000 },
};
const retainRule = checked.createRiddleProofCheckedMeaningRule({ definition: retainDefinition });
assert.equal(retainRule.ok, true);
const retained = checked.composeRiddleProofCheckedMeaningClosures({
  expected_rule: retainRule.rule_ref,
  closures: [requestLeaf.checked],
  issued_at: "2026-07-19T17:00:04.500Z",
  replay_contexts: [requestLeaf.replayContext],
  rule_registry: [retainRule.registration],
  trusted_rules: [retainRule.rule_ref],
});
assert.equal(retained.ok, true, retained.ok ? undefined : retained.error.message);

const finalDefinition = {
  rule_id: "fixture.checked-final-sense",
  rule_version: "1",
  label: "Compose save round trip with retained request identity",
  premises: [
    {
      claim_id: "fixture.bounded-save-round-trip",
      claim_version: "1",
      parameters: {
        document_id: { op: "any" },
        revision: { op: "any" },
        mode: { op: "equals", value: "observed" },
      },
    },
    {
      claim_id: "fixture.retained-request",
      claim_version: "1",
      parameters: { document_id: { op: "any" } },
    },
  ],
  conclusion: {
    claim_id: "fixture.document-save-sense",
    claim_version: "1",
    label: "The bounded document save behavior may be relied on",
    parameters: {
      document_id: { op: "from_premise", premise_index: 0, parameter: "document_id" },
      revision: { op: "from_premise", premise_index: 0, parameter: "revision" },
    },
  },
  constraints: {
    all_of: true,
    parameter_equalities: [{
      members: [
        { premise_index: 0, parameter: "document_id" },
        { premise_index: 1, parameter: "document_id" },
      ],
    }],
    ordered_premise_chronology: true,
    max_age_ms: 5_000,
  },
};
const finalRule = checked.createRiddleProofCheckedMeaningRule({ definition: finalDefinition });
assert.equal(finalRule.ok, true);
const registry = [roundTripRule.registration, retainRule.registration, finalRule.registration];
const trusted = [roundTripRule.rule_ref, retainRule.rule_ref, finalRule.rule_ref];
const nested = checked.composeRiddleProofCheckedMeaningClosures({
  expected_rule: finalRule.rule_ref,
  closures: [roundTrip.checked_closure, retained.checked_closure],
  issued_at: "2026-07-19T17:00:05.000Z",
  replay_contexts: replayContexts,
  rule_registry: registry,
  trusted_rules: trusted,
});
assert.equal(nested.ok, true, nested.ok ? undefined : nested.error.message);
assert.equal(nested.checked_closure.grounded_closure.groundings.length, 2);
assert.equal(nested.checked_closure.grounded_closure.closure.certificates.length, 5);
assert.equal(nested.checked_closure.rule_bindings.length, 3);
assert.equal(new Set(nested.checked_closure.rule_bindings.map((binding) => binding.certificate_id)).size, 3);
for (const certificate of nested.checked_closure.grounded_closure.closure.certificates) {
  const count = nested.checked_closure.rule_bindings.filter(
    (binding) => binding.certificate_id === certificate.certificate_id,
  ).length;
  assert.equal(count, certificate.derivation.kind === "composition" ? 1 : 0);
}

const nestedMatch = checked.matchRiddleProofCheckedMeaningClosure({
  checked_closure: nested.checked_closure,
  replay_contexts: replayContexts,
  rule_registry: registry,
  trusted_rules: trusted,
  expected_root_certificate_id: nested.certificate.certificate_id,
  expected_scope: scope,
  expected_claim: nested.certificate.claim,
  expected_root_rule: finalRule.rule_ref,
});
assert.equal(nestedMatch.ok, true, nestedMatch.ok ? undefined : nestedMatch.error.message);

const assessmentInput = {
  checked_closure: nested.checked_closure,
  replay_contexts: replayContexts,
  rule_registry: registry,
  trusted_rules: trusted,
  consumption_time: "2026-07-19T17:00:05.000Z",
  max_grounded_age_ms: 5_000,
  max_future_skew_ms: 0,
};

// A capture exactly at the age limit remains checked; "older" is strict.
const exactAgeAssessment = checked.assessRiddleProofCheckedMeaningClosure(assessmentInput);
assert.equal(exactAgeAssessment.disposition, "checked");
assert.deepEqual(exactAgeAssessment.stale_certificate_ids, []);
assert.equal(exactAgeAssessment.root_certificate.certificate_id, nested.certificate.certificate_id);
assert.equal(exactAgeAssessment.root_assurance, "checked_allowlisted_rule");

// The assessment policy and closure remain entirely JSON-serializable.
const serializedAssessment = checked.assessRiddleProofCheckedMeaningClosure(
  JSON.parse(JSON.stringify(assessmentInput)),
);
assert.equal(serializedAssessment.disposition, "checked");
assert.deepEqual(serializedAssessment.checked_closure, exactAgeAssessment.checked_closure);

const staleAssessment = checked.assessRiddleProofCheckedMeaningClosure({
  ...assessmentInput,
  consumption_time: "2026-07-19T17:00:05.001Z",
});
assert.equal(staleAssessment.disposition, "stale");
assert.deepEqual(staleAssessment.stale_certificate_ids, [
  requestLeaf.issued.certificate.certificate_id,
]);

// Future bounds are strict too: the root at exactly consumption + skew passes.
const exactFutureBoundary = checked.assessRiddleProofCheckedMeaningClosure({
  ...assessmentInput,
  consumption_time: "2026-07-19T17:00:04.000Z",
  max_grounded_age_ms: 4_000,
  max_future_skew_ms: 1_000,
});
assert.equal(exactFutureBoundary.disposition, "checked");

const futureRootAssessment = checked.assessRiddleProofCheckedMeaningClosure({
  ...assessmentInput,
  consumption_time: "2026-07-19T17:00:04.999Z",
});
assert.equal(futureRootAssessment.disposition, "unresolved");
assert.equal(futureRootAssessment.error.code, "future_timestamp");
assert.equal(
  futureRootAssessment.error.future_root_certificate_id,
  nested.certificate.certificate_id,
);
assert.equal(futureRootAssessment.error.future_capture_certificate_ids, undefined);

const futureCaptureAssessment = checked.assessRiddleProofCheckedMeaningClosure({
  ...assessmentInput,
  consumption_time: "2026-07-19T17:00:01.999Z",
});
assert.equal(futureCaptureAssessment.disposition, "unresolved");
assert.equal(futureCaptureAssessment.error.code, "future_timestamp");
assert.deepEqual(futureCaptureAssessment.error.future_capture_certificate_ids, [
  readbackLeaf.issued.certificate.certificate_id,
]);
assert.equal(
  futureCaptureAssessment.error.future_root_certificate_id,
  nested.certificate.certificate_id,
);

const tamperedForAssessment = jsonClone(nested.checked_closure);
const originalSignature = tamperedForAssessment.grounded_closure.groundings[0]
  .bundle.provenance.signature_base64;
tamperedForAssessment.grounded_closure.groundings[0].bundle.provenance.signature_base64 =
  `${originalSignature[0] === "A" ? "B" : "A"}${originalSignature.slice(1)}`;
const tamperedAssessment = checked.assessRiddleProofCheckedMeaningClosure({
  ...assessmentInput,
  checked_closure: tamperedForAssessment,
});
assert.equal(tamperedAssessment.disposition, "unresolved");
assert.equal(tamperedAssessment.error.code, "closure_unresolved");
assert.equal(tamperedAssessment.error.cause.code, "grounded_validation_failed");

const invalidAssessmentBound = checked.assessRiddleProofCheckedMeaningClosure({
  ...assessmentInput,
  max_grounded_age_ms:
    checked.RIDDLE_PROOF_CHECKED_MEANING_MAX_CONSUMPTION_WINDOW_MS + 1,
});
assert.equal(invalidAssessmentBound.disposition, "unresolved");
assert.equal(invalidAssessmentBound.error.code, "invalid_assessment_input");

const noncanonicalAssessmentTime = checked.assessRiddleProofCheckedMeaningClosure({
  ...assessmentInput,
  consumption_time: "2026-07-19T17:00:05Z",
});
assert.equal(noncanonicalAssessmentTime.disposition, "unresolved");
assert.equal(noncanonicalAssessmentTime.error.code, "invalid_assessment_input");

function validateMutation(checkedClosure, overrides = {}) {
  return checked.validateRiddleProofCheckedMeaningClosure({
    checked_closure: checkedClosure,
    replay_contexts: replayContexts,
    rule_registry: registry,
    trusted_rules: trusted,
    ...overrides,
  });
}

const missingBindingClosure = jsonClone(nested.checked_closure);
missingBindingClosure.rule_bindings.pop();
const missingBinding = validateMutation(missingBindingClosure);
assert.equal(missingBinding.ok, false);
assert.equal(missingBinding.error.code, "missing_rule_binding");

const duplicateBindingClosure = jsonClone(nested.checked_closure);
duplicateBindingClosure.rule_bindings.push(jsonClone(duplicateBindingClosure.rule_bindings[0]));
const duplicateBinding = validateMutation(duplicateBindingClosure);
assert.equal(duplicateBinding.ok, false);
assert.equal(duplicateBinding.error.code, "invalid_checked_closure");

const leafBindingClosure = jsonClone(nested.checked_closure);
leafBindingClosure.rule_bindings.push({
  ...jsonClone(leafBindingClosure.rule_bindings[0]),
  certificate_id: requestLeaf.issued.certificate.certificate_id,
});
const leafBinding = validateMutation(leafBindingClosure);
assert.equal(leafBinding.ok, false);
assert.equal(leafBinding.error.code, "extra_rule_binding");

const missingTrust = validateMutation(nested.checked_closure, {
  trusted_rules: [retainRule.rule_ref, finalRule.rule_ref],
});
assert.equal(missingTrust.ok, false);
assert.equal(missingTrust.error.code, "rule_not_trusted");

const changedUnderSameIdentity = checked.validateRiddleProofCheckedMeaningClosure({
  checked_closure: roundTrip.checked_closure,
  replay_contexts: replayContexts,
  rule_registry: [changedRoundTripRule.registration],
  trusted_rules: [roundTripRule.rule_ref],
});
assert.equal(changedUnderSameIdentity.ok, false);
assert.equal(changedUnderSameIdentity.error.code, "rule_digest_mismatch");

// A malicious caller can create an otherwise valid, content-addressed grounded
// composition with an invented conclusion. The checked sidecar cannot bless it
// as the allowlisted rule because replay materializes a different exact rule.
const inventedClaim = {
  claim_id: "fixture.invented-success",
  claim_version: "1",
  label: "An invented conclusion",
};
const inventedGrounded = grounded.composeRiddleProofGroundedSemanticCertificateClosures({
  rule: {
    rule_id: roundTripDefinition.rule_id,
    rule_version: roundTripDefinition.rule_version,
    label: roundTripDefinition.label,
    premises: [claimRef(requestLeaf.claim), claimRef(readbackLeaf.claim)],
    conclusion: inventedClaim,
  },
  closures: [requestLeaf.grounded, readbackLeaf.grounded],
  issued_at: "2026-07-19T17:00:04.000Z",
  replay_contexts: replayContexts,
});
assert.equal(inventedGrounded.ok, true, inventedGrounded.ok ? undefined : inventedGrounded.error.message);
const inventedChecked = {
  version: checked.RIDDLE_PROOF_CHECKED_MEANING_CLOSURE_VERSION,
  grounded_closure: inventedGrounded.grounded_closure,
  rule_bindings: [{
    ...jsonClone(roundTrip.checked_closure.rule_bindings[0]),
    certificate_id: inventedGrounded.certificate.certificate_id,
  }],
};
const inventedValidation = checked.validateRiddleProofCheckedMeaningClosure({
  checked_closure: inventedChecked,
  replay_contexts: replayContexts,
  rule_registry: [roundTripRule.registration],
  trusted_rules: [roundTripRule.rule_ref],
});
assert.equal(inventedValidation.ok, false);
assert.equal(inventedValidation.error.code, "rule_binding_mismatch");

const wrongRootMatch = checked.matchRiddleProofCheckedMeaningClosure({
  checked_closure: nested.checked_closure,
  replay_contexts: replayContexts,
  rule_registry: registry,
  trusted_rules: trusted,
  expected_root_certificate_id: `rpsc_${"f".repeat(64)}`,
  expected_scope: scope,
  expected_claim: nested.certificate.claim,
  expected_root_rule: finalRule.rule_ref,
});
assert.equal(wrongRootMatch.ok, false);
assert.equal(wrongRootMatch.error.code, "root_mismatch");

const wrongRootRuleMatch = checked.matchRiddleProofCheckedMeaningClosure({
  checked_closure: nested.checked_closure,
  replay_contexts: replayContexts,
  rule_registry: registry,
  trusted_rules: trusted,
  expected_root_certificate_id: nested.certificate.certificate_id,
  expected_scope: scope,
  expected_claim: nested.certificate.claim,
  expected_root_rule: retainRule.rule_ref,
});
assert.equal(wrongRootRuleMatch.ok, false);
assert.equal(wrongRootRuleMatch.error.code, "root_mismatch");

const arrayParametersMatch = checked.matchRiddleProofCheckedMeaningClosure({
  checked_closure: nested.checked_closure,
  replay_contexts: replayContexts,
  rule_registry: registry,
  trusted_rules: trusted,
  expected_root_certificate_id: nested.certificate.certificate_id,
  expected_scope: scope,
  expected_claim: {
    claim_id: nested.certificate.claim.claim_id,
    claim_version: nested.certificate.claim.claim_version,
    parameters: [],
  },
  expected_root_rule: finalRule.rule_ref,
});
assert.equal(arrayParametersMatch.ok, false);
assert.equal(arrayParametersMatch.error.code, "invalid_input");

console.log(JSON.stringify({
  ok: true,
  suite: "riddle-proof.checked-meaning",
  grounded_leaves: nested.checked_closure.grounded_closure.groundings.length,
  certificates: nested.checked_closure.grounded_closure.closure.certificates.length,
  checked_rule_bindings: nested.checked_closure.rule_bindings.length,
  root_certificate_id: nested.certificate.certificate_id,
  assurance: nested.assurance,
  rejected: [
    "untrusted_rule",
    "changed_definition_same_identity",
    "missing_binding",
    "extra_leaf_binding",
    "duplicate_binding",
    "parameter_mismatch",
    "backdating",
    "stale_premise",
    "reversed_chronology",
    "invented_conclusion",
    "wrong_trusted_root",
    "non_object_expected_parameters",
    "stale_at_consumption",
    "future_at_consumption",
    "tampered_unresolved",
  ],
}));
