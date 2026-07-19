import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

import * as rootExports from "./dist/index.js";
import {
  RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_MAX_CERTIFICATES,
  RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_VERSION,
  RIDDLE_PROOF_SEMANTIC_CERTIFICATE_VERSION,
  composeRiddleProofSemanticCertificateClosures,
  composeRiddleProofSemanticCertificates,
  createRiddleProofSemanticAtomicCertificateClosure,
  createRiddleProofSemanticCertificate,
  matchRiddleProofSemanticCertificateClosure,
  matchRiddleProofSemanticCertificate,
  parseRiddleProofSemanticCertificate,
  riddleProofSemanticScopesEqual,
  validateRiddleProofSemanticCertificateClosure,
} from "./dist/semantic-certificate.js";

const require = createRequire(import.meta.url);
const cjsRootExports = require("./dist/index.cjs");
const cjsSubpathExports = require("./dist/semantic-certificate.cjs");

assert.equal(
  rootExports.createRiddleProofSemanticCertificate,
  createRiddleProofSemanticCertificate,
  "root ESM export should expose the Semantic certificate API",
);
assert.equal(
  cjsRootExports.RIDDLE_PROOF_SEMANTIC_CERTIFICATE_VERSION,
  RIDDLE_PROOF_SEMANTIC_CERTIFICATE_VERSION,
  "root CJS export should expose the Semantic certificate API",
);
assert.equal(typeof cjsRootExports.composeRiddleProofSemanticCertificates, "function");
assert.equal(typeof rootExports.matchRiddleProofSemanticCertificate, "function");
assert.equal(typeof cjsRootExports.matchRiddleProofSemanticCertificate, "function");
assert.equal(
  rootExports.RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_VERSION,
  RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_VERSION,
);
assert.equal(
  rootExports.RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_MAX_CERTIFICATES,
  RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_MAX_CERTIFICATES,
);
assert.equal(typeof rootExports.validateRiddleProofSemanticCertificateClosure, "function");
assert.equal(typeof cjsRootExports.createRiddleProofSemanticAtomicCertificateClosure, "function");
assert.equal(typeof cjsRootExports.composeRiddleProofSemanticCertificateClosures, "function");
assert.equal(typeof cjsRootExports.matchRiddleProofSemanticCertificateClosure, "function");
assert.equal(
  typeof cjsSubpathExports.composeRiddleProofSemanticCertificates,
  "function",
  "CJS subpath should expose the composition helper",
);
assert.equal(
  typeof cjsSubpathExports.matchRiddleProofSemanticCertificate,
  "function",
  "CJS subpath should expose the downstream matcher",
);
assert.equal(
  typeof cjsSubpathExports.validateRiddleProofSemanticCertificateClosure,
  "function",
  "CJS subpath should expose the closure validator",
);
assert.equal(
  typeof cjsSubpathExports.createRiddleProofSemanticAtomicCertificateClosure,
  "function",
  "CJS subpath should expose the atomic closure helper",
);
assert.equal(
  typeof cjsSubpathExports.composeRiddleProofSemanticCertificateClosures,
  "function",
  "CJS subpath should expose closure composition",
);
assert.equal(
  typeof cjsSubpathExports.matchRiddleProofSemanticCertificateClosure,
  "function",
  "CJS subpath should expose closure matching",
);

const baseScope = {
  repository: "riddledc/lilarcade",
  revision: "abc123",
  environment: "preview",
  target: "https://preview.example.test/tidepool",
  proof_attempt: "attempt-42",
};

const earlyClaim = {
  claim_id: "tidepool.early-quiescence",
  claim_version: "1",
  parameters: { sample_index: 1 },
  label: "The early sample has no collision and no sound",
};
const laterClaim = {
  claim_id: "tidepool.later-collision-sound",
  claim_version: "1",
  parameters: { sample_index: 4 },
  label: "The later sample has a collision and sound",
};
const behaviorClaim = {
  claim_id: "tidepool.observed-wave-collision-behavior",
  claim_version: "1",
  parameters: { early_index: 1, later_index: 4 },
  label: "A quiet early wave is followed by collision and sound",
};

const earlyEvidence = {
  receipt_id: "obs_tidepool_early",
  artifact_digest: `sha256:${"1".repeat(64)}`,
  role: "ordered_trace_witness",
  artifact_path: "artifacts/tidepool/ordered-trace.json",
};
const laterEvidence = {
  receipt_id: "obs_tidepool_later",
  artifact_digest: `sha256:${"2".repeat(64)}`,
  role: "ordered_trace_witness",
  artifact_path: "artifacts/tidepool/ordered-trace.json",
};

function certify({
  scope = baseScope,
  claim,
  evidence,
  observation,
  accepts,
  issuedAt,
}) {
  const result = createRiddleProofSemanticCertificate({
    scope,
    evidence: [evidence],
    observation,
    contract: {
      contract_id: `contract.${claim.claim_id}`,
      contract_version: "1",
      label: `Contract for ${claim.label}`,
      claim,
      accepts,
    },
    issued_at: issuedAt,
  });
  assert.equal(result.ok, true, result.ok ? undefined : result.error.message);
  return result.certificate;
}

const earlyCertificate = certify({
  claim: earlyClaim,
  evidence: earlyEvidence,
  observation: { collision: false, sound: false },
  accepts: (_scope, observation) => observation.collision === false && observation.sound === false,
  issuedAt: "2026-07-19T04:30:00.000Z",
});
const laterCertificate = certify({
  claim: laterClaim,
  evidence: laterEvidence,
  observation: { collision: true, sound: true },
  accepts: (_scope, observation) => observation.collision === true && observation.sound === true,
  issuedAt: "2026-07-19T04:30:01.000Z",
});

assert.match(earlyCertificate.certificate_id, /^rpsc_[0-9a-f]{64}$/);
assert.deepEqual(
  parseRiddleProofSemanticCertificate(JSON.parse(JSON.stringify(earlyCertificate))),
  earlyCertificate,
  "an atomic certificate should round-trip through its parser",
);
assert.equal(riddleProofSemanticScopesEqual(baseScope, { ...baseScope }), true);
assert.equal(riddleProofSemanticScopesEqual(baseScope, { ...baseScope, revision: "def456" }), false);

const rejected = createRiddleProofSemanticCertificate({
  scope: baseScope,
  evidence: [earlyEvidence],
  observation: { collision: true },
  contract: {
    contract_id: "contract.reject-collision",
    contract_version: "1",
    label: "Collision must be absent",
    claim: earlyClaim,
    accepts: (_scope, observation) => observation.collision === false,
  },
  issued_at: "2026-07-19T04:30:02.000Z",
});
assert.deepEqual(rejected, {
  ok: false,
  error: {
    code: "contract_rejected",
    contract: {
      contract_id: "contract.reject-collision",
      contract_version: "1",
      label: "Collision must be absent",
    },
    message: "Semantic contract rejected the supplied observation at this scope.",
  },
});

const contractError = createRiddleProofSemanticCertificate({
  scope: baseScope,
  evidence: [earlyEvidence],
  observation: {},
  contract: {
    contract_id: "contract.throwing",
    contract_version: "1",
    label: "Throwing test contract",
    claim: earlyClaim,
    accepts: () => { throw new Error("missing instrumentation"); },
  },
  issued_at: "2026-07-19T04:30:03.000Z",
});
assert.equal(contractError.ok, false);
assert.equal(contractError.error.code, "contract_error");
assert.match(contractError.error.message, /missing instrumentation/);
const unprintableContractThrownValue = {
  [Symbol.toPrimitive]() {
    throw new Error("contract error stringification must stay contained");
  },
};
const unprintableContractError = createRiddleProofSemanticCertificate({
  scope: baseScope,
  evidence: [earlyEvidence],
  observation: {},
  contract: {
    contract_id: "contract.unprintable-error",
    contract_version: "1",
    label: "Unprintable error contract",
    claim: earlyClaim,
    accepts: () => { throw unprintableContractThrownValue; },
  },
});
assert.equal(unprintableContractError.ok, false);
assert.equal(unprintableContractError.error.code, "contract_error");
assert.match(unprintableContractError.error.message, /unprintable thrown value/);

assert.throws(() => createRiddleProofSemanticCertificate({
  scope: baseScope,
  evidence: [],
  observation: {},
  contract: {
    contract_id: "contract.empty-evidence",
    contract_version: "1",
    label: "Empty evidence test",
    claim: earlyClaim,
    accepts: () => true,
  },
}), /at least one evidence reference/);
const sparseEvidence = new Array(1);
assert.throws(() => createRiddleProofSemanticCertificate({
  scope: baseScope,
  evidence: sparseEvidence,
  observation: {},
  contract: {
    contract_id: "contract.sparse-evidence",
    contract_version: "1",
    label: "Sparse evidence test",
    claim: earlyClaim,
    accepts: () => true,
  },
}), /must not contain sparse or inherited entries/);
let evidenceGetterExecuted = false;
const accessorEvidence = [];
Object.defineProperty(accessorEvidence, "0", {
  enumerable: true,
  get() {
    evidenceGetterExecuted = true;
    return earlyEvidence;
  },
});
assert.throws(() => createRiddleProofSemanticCertificate({
  scope: baseScope,
  evidence: accessorEvidence,
  observation: {},
  contract: {
    contract_id: "contract.accessor-evidence",
    contract_version: "1",
    label: "Accessor evidence test",
    claim: earlyClaim,
    accepts: () => true,
  },
}), /evidence\[0\] must be an enumerable data field/);
assert.equal(evidenceGetterExecuted, false, "evidence accessors must not execute");
const proxyEvidence = new Proxy(new Array(1), {
  ownKeys() {
    return ["0", "length"];
  },
  getOwnPropertyDescriptor(target, key) {
    if (key === "0") {
      return {
        value: earlyEvidence,
        enumerable: true,
        configurable: true,
        writable: true,
      };
    }
    return Reflect.getOwnPropertyDescriptor(target, key);
  },
  has(_target, key) {
    return key === "length";
  },
});
const proxyEvidenceResult = createRiddleProofSemanticCertificate({
  scope: baseScope,
  evidence: proxyEvidence,
  observation: {},
  contract: {
    contract_id: "contract.proxy-evidence",
    contract_version: "1",
    label: "Proxy evidence normalization test",
    claim: earlyClaim,
    accepts: () => true,
  },
  issued_at: "2026-07-19T04:30:05.000Z",
});
assert.equal(proxyEvidenceResult.ok, true);
assert.equal(proxyEvidenceResult.certificate.evidence.length, 1);
assert.equal(Object.hasOwn(proxyEvidenceResult.certificate.evidence, 0), true);
assert.throws(() => createRiddleProofSemanticCertificate({
  scope: baseScope,
  evidence: [{ ...earlyEvidence, artifact_digest: "not-a-digest" }],
  observation: {},
  contract: {
    contract_id: "contract.invalid-digest",
    contract_version: "1",
    label: "Invalid digest test",
    claim: earlyClaim,
    accepts: () => true,
  },
}), /must be a full sha256 digest/);
assert.throws(() => createRiddleProofSemanticCertificate({
  scope: { ...baseScope, revision: "" },
  evidence: [earlyEvidence],
  observation: {},
  contract: {
    contract_id: "contract.incomplete-scope",
    contract_version: "1",
    label: "Incomplete scope test",
    claim: earlyClaim,
    accepts: () => true,
  },
}), /scope\.revision must be a non-empty string/);
assert.throws(() => createRiddleProofSemanticCertificate({
  scope: baseScope,
  evidence: [earlyEvidence],
  observation: {},
  contract: {
    contract_id: "contract.non-json-parameters",
    contract_version: "1",
    label: "Non-JSON parameter test",
    claim: { ...earlyClaim, parameters: new Date("2026-07-19T00:00:00.000Z") },
    accepts: () => true,
  },
}), /parameters must be a JSON object/);
let parameterToJsonExecuted = false;
const parametersWithToJson = { apparent: "trusted" };
Object.defineProperty(parametersWithToJson, "toJSON", {
  enumerable: false,
  value() {
    parameterToJsonExecuted = true;
    return { transformed: "attacker-controlled" };
  },
});
assert.throws(() => createRiddleProofSemanticCertificate({
  scope: baseScope,
  evidence: [earlyEvidence],
  observation: {},
  contract: {
    contract_id: "contract.to-json-parameters",
    contract_version: "1",
    label: "toJSON parameter test",
    claim: { ...earlyClaim, parameters: parametersWithToJson },
    accepts: () => true,
  },
}), /parameters\.toJSON must be an enumerable data field/);
assert.equal(parameterToJsonExecuted, false, "parameter toJSON hooks must not execute");

const behaviorRule = {
  rule_id: "tidepool.quiet-then-collision",
  rule_version: "1",
  label: "Compose the early and later Tidepool observations",
  premises: [earlyClaim, laterClaim],
  conclusion: behaviorClaim,
};
const behaviorResult = composeRiddleProofSemanticCertificates({
  rule: behaviorRule,
  certificates: [earlyCertificate, laterCertificate],
  issued_at: "2026-07-19T04:31:00.000Z",
});
assert.equal(behaviorResult.ok, true, behaviorResult.ok ? undefined : behaviorResult.error.message);
const behaviorCertificate = behaviorResult.certificate;
const trustedEarlyCertificateId =
  "rpsc_9f8f609642efbf4eb3beb448dee583bd39adb2fbe2da3ee815bc62c02c848b19";
const trustedBehaviorCertificateId =
  "rpsc_69f057579f354b542a729488cce025de4f6ff306598eef8c14fd3cfd1a41da5b";
assert.equal(earlyCertificate.certificate_id, trustedEarlyCertificateId);
assert.equal(behaviorCertificate.certificate_id, trustedBehaviorCertificateId);
assert.deepEqual(behaviorCertificate.evidence, [earlyEvidence, laterEvidence]);
assert.deepEqual(
  behaviorCertificate.derivation.premises.map((premise) => premise.certificate_id),
  [earlyCertificate.certificate_id, laterCertificate.certificate_id],
);
assert.deepEqual(parseRiddleProofSemanticCertificate(behaviorCertificate), behaviorCertificate);
assert.equal(earlyCertificate.derivation.assurance, "runtime_contract_accepted");
assert.equal(behaviorCertificate.derivation.assurance, "declared_runtime_rule");
for (const field of [
  "authority",
  "status",
  "verdict",
  "ready_to_ship",
  "merge_ready",
  "sync_allowed",
  "merge_recommended",
  "shipping_authorization",
]) {
  assert.equal(Object.hasOwn(behaviorCertificate, field), false, `${field} must remain outside Semantic certificates`);
}

const behaviorExpectation = {
  certificate: behaviorCertificate,
  expected_certificate_id: trustedBehaviorCertificateId,
  expected_scope: baseScope,
  expected_claim: behaviorClaim,
  expected_assurance: "declared_runtime_rule",
};
const exactBehaviorMatch = matchRiddleProofSemanticCertificate(behaviorExpectation);
assert.equal(exactBehaviorMatch.ok, true);
assert.deepEqual(exactBehaviorMatch.certificate, behaviorCertificate);

const exactAtomicMatch = matchRiddleProofSemanticCertificate({
  certificate: earlyCertificate,
  expected_certificate_id: trustedEarlyCertificateId,
  expected_scope: baseScope,
  expected_claim: earlyClaim,
  expected_assurance: "runtime_contract_accepted",
});
assert.equal(exactAtomicMatch.ok, true);
assert.deepEqual(exactAtomicMatch.certificate.evidence, [earlyEvidence]);

const certificateIdMismatch = matchRiddleProofSemanticCertificate({
  ...behaviorExpectation,
  expected_certificate_id: `rpsc_${"f".repeat(64)}`,
});
assert.equal(certificateIdMismatch.ok, false);
assert.equal(certificateIdMismatch.error.code, "certificate_id_mismatch");
assert.equal(certificateIdMismatch.error.expected, `rpsc_${"f".repeat(64)}`);
assert.equal(certificateIdMismatch.error.observed, behaviorCertificate.certificate_id);

for (const field of [
  "repository",
  "revision",
  "environment",
  "target",
  "proof_attempt",
]) {
  const expectedScope = { ...baseScope, [field]: `${baseScope[field]}-other` };
  const scopeMismatch = matchRiddleProofSemanticCertificate({
    ...behaviorExpectation,
    expected_scope: expectedScope,
  });
  assert.equal(scopeMismatch.ok, false);
  assert.equal(scopeMismatch.error.code, "scope_mismatch");
  assert.equal(scopeMismatch.error.field, field);
  assert.equal(scopeMismatch.error.expected, expectedScope[field]);
  assert.equal(scopeMismatch.error.observed, baseScope[field]);
}

for (const expectedClaim of [
  { ...behaviorClaim, claim_id: "tidepool.other-behavior" },
  { ...behaviorClaim, claim_version: "2" },
  { ...behaviorClaim, parameters: { early_index: 2, later_index: 4 } },
]) {
  const claimMismatch = matchRiddleProofSemanticCertificate({
    ...behaviorExpectation,
    expected_claim: expectedClaim,
  });
  assert.equal(claimMismatch.ok, false);
  assert.equal(claimMismatch.error.code, "claim_mismatch");
}

const presentationIndependentMatch = matchRiddleProofSemanticCertificate({
  ...behaviorExpectation,
  expected_claim: {
    ...behaviorClaim,
    parameters: { later_index: 4, early_index: 1 },
    label: "Different presentation text does not change claim identity",
  },
});
assert.equal(presentationIndependentMatch.ok, true);

for (const [certificate, expectedClaim, expectedAssurance] of [
  [behaviorCertificate, behaviorClaim, "runtime_contract_accepted"],
  [earlyCertificate, earlyClaim, "declared_runtime_rule"],
]) {
  const assuranceMismatch = matchRiddleProofSemanticCertificate({
    certificate,
    expected_certificate_id: certificate.certificate_id,
    expected_scope: baseScope,
    expected_claim: expectedClaim,
    expected_assurance: expectedAssurance,
  });
  assert.equal(assuranceMismatch.ok, false);
  assert.equal(assuranceMismatch.error.code, "assurance_mismatch");
  assert.equal(assuranceMismatch.error.expected, expectedAssurance);
  assert.equal(assuranceMismatch.error.observed, certificate.derivation.assurance);
}

const idPrecedence = matchRiddleProofSemanticCertificate({
  ...behaviorExpectation,
  expected_certificate_id: `rpsc_${"e".repeat(64)}`,
  expected_scope: { ...baseScope, revision: "wrong" },
  expected_claim: earlyClaim,
  expected_assurance: "runtime_contract_accepted",
});
assert.equal(idPrecedence.ok, false);
assert.equal(idPrecedence.error.code, "certificate_id_mismatch");

const scopePrecedence = matchRiddleProofSemanticCertificate({
  ...behaviorExpectation,
  expected_scope: { ...baseScope, revision: "wrong" },
  expected_claim: earlyClaim,
  expected_assurance: "runtime_contract_accepted",
});
assert.equal(scopePrecedence.ok, false);
assert.equal(scopePrecedence.error.code, "scope_mismatch");

const claimPrecedence = matchRiddleProofSemanticCertificate({
  ...behaviorExpectation,
  expected_claim: earlyClaim,
  expected_assurance: "runtime_contract_accepted",
});
assert.equal(claimPrecedence.ok, false);
assert.equal(claimPrecedence.error.code, "claim_mismatch");

const invalidCertificateMatch = matchRiddleProofSemanticCertificate({
  ...behaviorExpectation,
  certificate: {
    ...behaviorCertificate,
    claim: { ...behaviorCertificate.claim, label: "tampered" },
  },
});
assert.equal(invalidCertificateMatch.ok, false);
assert.equal(invalidCertificateMatch.error.code, "invalid_certificate");
assert.match(invalidCertificateMatch.error.message, /certificate_id must match its content/);

const unprintableThrownValue = {
  [Symbol.toPrimitive]() {
    throw new Error("stringification must stay contained");
  },
};
const hostileCertificate = new Proxy({}, {
  getPrototypeOf() {
    throw unprintableThrownValue;
  },
});
const hostileCertificateMatch = matchRiddleProofSemanticCertificate({
  ...behaviorExpectation,
  certificate: hostileCertificate,
});
assert.equal(hostileCertificateMatch.ok, false);
assert.equal(hostileCertificateMatch.error.code, "invalid_certificate");
assert.match(hostileCertificateMatch.error.message, /unprintable thrown value/);

assert.throws(
  () => matchRiddleProofSemanticCertificate({
    ...behaviorExpectation,
    expected_certificate_id: "not-a-certificate-id",
  }),
  /expected_certificate_id must be a full rpsc content ID/,
);
assert.throws(
  () => matchRiddleProofSemanticCertificate({
    ...behaviorExpectation,
    expected_scope: { ...baseScope, revision: "" },
  }),
  /expected_scope\.revision must be a non-empty string/,
);
assert.throws(
  () => matchRiddleProofSemanticCertificate({
    ...behaviorExpectation,
    expected_claim: { claim_id: "", claim_version: "1" },
  }),
  /expected_claim\.claim_id must be a non-empty string/,
);
assert.throws(
  () => matchRiddleProofSemanticCertificate({
    ...behaviorExpectation,
    expected_assurance: "mathematically_proved",
  }),
  /expected_assurance must be runtime_contract_accepted or declared_runtime_rule/,
);
assert.throws(
  () => matchRiddleProofSemanticCertificate({
    ...behaviorExpectation,
    ready_to_ship: true,
  }),
  /input contains unsupported field ready_to_ship/,
);

const inheritedExpectation = Object.assign(Object.create({
  expected_certificate_id: trustedBehaviorCertificateId,
  expected_scope: baseScope,
  expected_claim: behaviorClaim,
  expected_assurance: "declared_runtime_rule",
}), {
  certificate: behaviorCertificate,
});
assert.throws(
  () => matchRiddleProofSemanticCertificate(inheritedExpectation),
  /must be a plain object/,
);
assert.throws(
  () => matchRiddleProofSemanticCertificate({
    ...behaviorExpectation,
    expected_scope: Object.create(baseScope),
  }),
  /expected_scope must be an object/,
);
const accessorExpectation = { ...behaviorExpectation };
Object.defineProperty(accessorExpectation, "expected_certificate_id", {
  enumerable: true,
  get() {
    return trustedBehaviorCertificateId;
  },
});
assert.throws(
  () => matchRiddleProofSemanticCertificate(accessorExpectation),
  /expected_certificate_id must be an enumerable data field/,
);
const symbolExpectation = {
  ...behaviorExpectation,
  [Symbol("authority")]: true,
};
assert.throws(
  () => matchRiddleProofSemanticCertificate(symbolExpectation),
  /unsupported symbol field/,
);

const authorityTamper = { ...behaviorCertificate, ready_to_ship: true };
assert.throws(
  () => parseRiddleProofSemanticCertificate(authorityTamper),
  /must not contain authority field ready_to_ship/,
);
const unsupportedFieldTamper = { ...behaviorCertificate, approved: true };
assert.throws(
  () => parseRiddleProofSemanticCertificate(unsupportedFieldTamper),
  /unsupported field approved/,
);
assert.throws(() => createRiddleProofSemanticCertificate({
  scope: baseScope,
  evidence: [earlyEvidence],
  observation: { collision: false, sound: false },
  contract: {
    contract_id: "contract.metadata-authority",
    contract_version: "1",
    label: "Metadata authority test",
    claim: earlyClaim,
    accepts: () => true,
  },
  metadata: { nested: { ready_to_ship: true } },
}), /input contains unsupported field metadata/);
for (const nestedTamper of [
  (() => {
    const value = JSON.parse(JSON.stringify(behaviorCertificate));
    value.scope.ready_to_ship = true;
    return value;
  })(),
  (() => {
    const value = JSON.parse(JSON.stringify(behaviorCertificate));
    value.evidence[0].ready_to_ship = true;
    return value;
  })(),
  (() => {
    const value = JSON.parse(JSON.stringify(behaviorCertificate));
    value.derivation.ready_to_ship = true;
    return value;
  })(),
]) {
  assert.throws(
    () => parseRiddleProofSemanticCertificate(nestedTamper),
    /contains unsupported field ready_to_ship/,
  );
}
const versionTamper = { ...behaviorCertificate, version: "riddle-proof.semantic-certificate.v1" };
assert.throws(() => parseRiddleProofSemanticCertificate(versionTamper), /Unsupported Semantic certificate version/);
const idTamper = { ...behaviorCertificate, claim: { ...behaviorCertificate.claim, label: "tampered" } };
assert.throws(() => parseRiddleProofSemanticCertificate(idTamper), /certificate_id must match its content/);

const reorderedEvidence = JSON.parse(JSON.stringify(behaviorCertificate));
reorderedEvidence.evidence.reverse();
assert.throws(
  () => parseRiddleProofSemanticCertificate(reorderedEvidence),
  /ordered concatenation of premise evidence/,
);
const premiseScopeTamper = JSON.parse(JSON.stringify(behaviorCertificate));
premiseScopeTamper.derivation.premises[1].scope.revision = "different";
assert.throws(
  () => parseRiddleProofSemanticCertificate(premiseScopeTamper),
  /premise 1 must have the certificate scope/,
);

for (const [index, field] of [
  "repository",
  "revision",
  "environment",
  "target",
  "proof_attempt",
].entries()) {
  const mismatchedScope = { ...baseScope, [field]: `${baseScope[field]}-other` };
  const mismatchedLater = certify({
    scope: mismatchedScope,
    claim: laterClaim,
    evidence: laterEvidence,
    observation: { collision: true, sound: true },
    accepts: () => true,
    issuedAt: `2026-07-19T04:32:0${index}.000Z`,
  });
  const mismatchResult = composeRiddleProofSemanticCertificates({
    rule: behaviorRule,
    certificates: [earlyCertificate, mismatchedLater],
  });
  assert.equal(mismatchResult.ok, false);
  assert.equal(mismatchResult.error.code, "scope_mismatch");
  assert.equal(mismatchResult.error.field, field);
}

const premiseCountMismatch = composeRiddleProofSemanticCertificates({
  rule: behaviorRule,
  certificates: [earlyCertificate],
});
assert.equal(premiseCountMismatch.ok, false);
assert.equal(premiseCountMismatch.error.code, "premise_count_mismatch");

const premiseMismatch = composeRiddleProofSemanticCertificates({
  rule: { ...behaviorRule, premises: [laterClaim, earlyClaim] },
  certificates: [earlyCertificate, laterCertificate],
});
assert.equal(premiseMismatch.ok, false);
assert.equal(premiseMismatch.error.code, "premise_mismatch");
assert.equal(premiseMismatch.error.input_index, 0);

const mappedClaim = {
  claim_id: "tidepool.early-state-understood",
  claim_version: "1",
  label: "The early Tidepool state is understood",
};
const mapResult = composeRiddleProofSemanticCertificates({
  rule: {
    rule_id: "tidepool.interpret-early-state",
    rule_version: "1",
    label: "Interpret the early trace state",
    premises: [earlyClaim],
    conclusion: mappedClaim,
  },
  certificates: [earlyCertificate],
  issued_at: "2026-07-19T04:33:00.000Z",
});
assert.equal(mapResult.ok, true);
assert.deepEqual(mapResult.certificate.evidence, earlyCertificate.evidence);

const routeClaim = {
  claim_id: "tidepool.route-persisted",
  claim_version: "1",
  label: "The Tidepool route remained active through the trace",
};
const routeEvidence = {
  receipt_id: "obs_tidepool_route",
  artifact_digest: `sha256:${"3".repeat(64)}`,
  role: "route_witness",
};
const routeCertificate = certify({
  claim: routeClaim,
  evidence: routeEvidence,
  observation: { route: "/tidepool" },
  accepts: (_scope, observation) => observation.route === "/tidepool",
  issuedAt: "2026-07-19T04:34:00.000Z",
});
const playableBehaviorClaim = {
  claim_id: "tidepool.playable-wave-collision-behavior",
  claim_version: "1",
  label: "The scoped Tidepool route exhibited the composed collision behavior",
};
const nestedResult = composeRiddleProofSemanticCertificates({
  rule: {
    rule_id: "tidepool.behavior-on-route",
    rule_version: "1",
    label: "Combine observed behavior with route persistence",
    premises: [behaviorClaim, routeClaim],
    conclusion: playableBehaviorClaim,
  },
  certificates: [behaviorCertificate, routeCertificate],
  issued_at: "2026-07-19T04:34:01.000Z",
});
assert.equal(nestedResult.ok, true);
assert.deepEqual(nestedResult.certificate.evidence, [earlyEvidence, laterEvidence, routeEvidence]);
assert.deepEqual(
  nestedResult.certificate.derivation.premises.map((premise) => ({
    derivation_kind: premise.derivation_kind,
    assurance: premise.assurance,
  })),
  [
    { derivation_kind: "composition", assurance: "declared_runtime_rule" },
    { derivation_kind: "contract", assurance: "runtime_contract_accepted" },
  ],
);
assert.deepEqual(parseRiddleProofSemanticCertificate(nestedResult.certificate), nestedResult.certificate);

function closeAtomic(certificate) {
  const result = createRiddleProofSemanticAtomicCertificateClosure({ certificate });
  assert.equal(result.ok, true, result.ok ? undefined : result.error.message);
  return result.closure;
}

function stableJsonForTest(value) {
  if (Array.isArray(value)) return `[${value.map(stableJsonForTest).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJsonForTest(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function readdressCertificate(certificate) {
  const clone = JSON.parse(JSON.stringify(certificate));
  delete clone.certificate_id;
  const digest = createHash("sha256").update(stableJsonForTest(clone)).digest("hex");
  return { ...clone, certificate_id: `rpsc_${digest}` };
}

const earlyClosure = closeAtomic(earlyCertificate);
const laterClosure = closeAtomic(laterCertificate);
const routeClosure = closeAtomic(routeCertificate);
assert.equal(earlyClosure.version, RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_VERSION);
assert.deepEqual(earlyClosure.certificates, [earlyCertificate]);

const sparseClosureCertificates = new Array(1);
const sparseClosure = validateRiddleProofSemanticCertificateClosure({
  ...earlyClosure,
  certificates: sparseClosureCertificates,
});
assert.equal(sparseClosure.ok, false);
assert.equal(sparseClosure.error.code, "invalid_closure");
assert.match(sparseClosure.error.message, /must not contain sparse or inherited entries/);

const noIoClaim = {
  claim_id: "tidepool.no-evidence-io",
  claim_version: "1",
  label: "Certificate handling does not open evidence references",
};
const noIoCertificate = certify({
  claim: noIoClaim,
  evidence: {
    receipt_id: "obs_no_io",
    artifact_digest: `sha256:${"5".repeat(64)}`,
    role: "nonexistent_reference",
    artifact_url: "http://127.0.0.1:1/must-not-be-requested",
    artifact_path: "/definitely-not-opened-by-riddle-proof/missing.json",
  },
  observation: true,
  accepts: (_scope, observation) => observation === true,
  issuedAt: "2026-07-19T04:30:04.000Z",
});
const noIoClosure = closeAtomic(noIoCertificate);
const noIoMatch = matchRiddleProofSemanticCertificateClosure({
  closure: noIoClosure,
  expected_root_certificate_id: noIoCertificate.certificate_id,
  expected_scope: baseScope,
  expected_claim: noIoClaim,
  expected_assurance: "runtime_contract_accepted",
});
assert.equal(noIoMatch.ok, true, noIoMatch.ok ? undefined : noIoMatch.error.message);

const rootOnlyComposite = createRiddleProofSemanticAtomicCertificateClosure({
  certificate: behaviorCertificate,
});
assert.equal(rootOnlyComposite.ok, false);
assert.equal(rootOnlyComposite.error.code, "invalid_closure");
assert.match(rootOnlyComposite.error.message, /requires a contract-derived certificate/);

const deepDanglingClosure = validateRiddleProofSemanticCertificateClosure({
  version: RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_VERSION,
  root_certificate_id: behaviorCertificate.certificate_id,
  certificates: [laterCertificate, behaviorCertificate],
});
assert.equal(deepDanglingClosure.ok, false);
assert.equal(deepDanglingClosure.error.code, "dangling_premise");
assert.equal(
  deepDanglingClosure.error.parent_certificate_id,
  behaviorCertificate.certificate_id,
);
assert.equal(deepDanglingClosure.error.premise_index, 0);

const behaviorClosureResult = composeRiddleProofSemanticCertificateClosures({
  rule: behaviorRule,
  closures: [earlyClosure, laterClosure],
  issued_at: "2026-07-19T04:31:00.000Z",
});
assert.equal(
  behaviorClosureResult.ok,
  true,
  behaviorClosureResult.ok ? undefined : behaviorClosureResult.error.message,
);
assert.deepEqual(behaviorClosureResult.certificate, behaviorCertificate);
const behaviorClosure = behaviorClosureResult.closure;
assert.deepEqual(
  behaviorClosure.certificates.map((certificate) => certificate.certificate_id),
  [
    earlyCertificate.certificate_id,
    laterCertificate.certificate_id,
    behaviorCertificate.certificate_id,
  ],
  "closure bodies should be normalized dependency-first with the root last",
);

const nestedClosureResult = composeRiddleProofSemanticCertificateClosures({
  rule: {
    rule_id: "tidepool.behavior-on-route",
    rule_version: "1",
    label: "Combine observed behavior with route persistence",
    premises: [behaviorClaim, routeClaim],
    conclusion: playableBehaviorClaim,
  },
  closures: [behaviorClosure, routeClosure],
  issued_at: "2026-07-19T04:34:01.000Z",
});
assert.equal(
  nestedClosureResult.ok,
  true,
  nestedClosureResult.ok ? undefined : nestedClosureResult.error.message,
);
assert.deepEqual(nestedClosureResult.certificate, nestedResult.certificate);
const nestedClosure = nestedClosureResult.closure;
const trustedNestedCertificateId =
  "rpsc_606dcd6b76dbc699025a4d178b517e8818856e88f57551df568fe9b61b62ebfa";
assert.equal(nestedClosure.root_certificate_id, trustedNestedCertificateId);
assert.deepEqual(
  nestedClosure.certificates.map((certificate) => certificate.certificate_id),
  [
    earlyCertificate.certificate_id,
    laterCertificate.certificate_id,
    behaviorCertificate.certificate_id,
    routeCertificate.certificate_id,
    trustedNestedCertificateId,
  ],
);

const shuffledClosure = validateRiddleProofSemanticCertificateClosure({
  version: RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_VERSION,
  root_certificate_id: trustedNestedCertificateId,
  certificates: [
    nestedResult.certificate,
    routeCertificate,
    behaviorCertificate,
    laterCertificate,
    earlyCertificate,
  ],
});
assert.equal(shuffledClosure.ok, true);
assert.deepEqual(shuffledClosure.closure, nestedClosure);

const identityEarlyRule = {
  rule_id: "tidepool.identity-early",
  rule_version: "1",
  label: "Retain the early claim through a declared rule",
  premises: [earlyClaim],
  conclusion: earlyClaim,
};
const identityEarlyClosureResult = composeRiddleProofSemanticCertificateClosures({
  rule: identityEarlyRule,
  closures: [earlyClosure],
  issued_at: "2026-07-19T04:35:00.000Z",
});
assert.equal(identityEarlyClosureResult.ok, true);
const sharedConclusion = {
  claim_id: "tidepool.behavior-with-reused-early-premise",
  claim_version: "1",
  label: "The behavior closure and a second interpretation share one exact early body",
};
const sharedClosureResult = composeRiddleProofSemanticCertificateClosures({
  rule: {
    rule_id: "tidepool.shared-descendant",
    rule_version: "1",
    label: "Compose two branches that share the early certificate",
    premises: [behaviorClaim, earlyClaim],
    conclusion: sharedConclusion,
  },
  closures: [behaviorClosure, identityEarlyClosureResult.closure],
  issued_at: "2026-07-19T04:35:01.000Z",
});
assert.equal(sharedClosureResult.ok, true);
assert.equal(
  sharedClosureResult.closure.certificates.filter(
    (certificate) => certificate.certificate_id === earlyCertificate.certificate_id,
  ).length,
  1,
  "a shared transitive body should appear exactly once",
);

const duplicateClosure = validateRiddleProofSemanticCertificateClosure({
  ...earlyClosure,
  certificates: [earlyCertificate, earlyCertificate],
});
assert.equal(duplicateClosure.ok, false);
assert.equal(duplicateClosure.error.code, "duplicate_certificate_id");
assert.equal(duplicateClosure.error.first_index, 0);
assert.equal(duplicateClosure.error.duplicate_index, 1);

const atLimitClosure = validateRiddleProofSemanticCertificateClosure({
  ...earlyClosure,
  certificates: new Array(
    RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_MAX_CERTIFICATES,
  ).fill(earlyCertificate),
});
assert.equal(atLimitClosure.ok, false);
assert.equal(
  atLimitClosure.error.code,
  "duplicate_certificate_id",
  "the exported maximum should pass the size gate before ordinary validation",
);

const oversizedClosure = validateRiddleProofSemanticCertificateClosure({
  ...earlyClosure,
  certificates: new Array(
    RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_MAX_CERTIFICATES + 1,
  ).fill(earlyCertificate),
});
assert.equal(oversizedClosure.ok, false);
assert.equal(oversizedClosure.error.code, "invalid_closure");
assert.match(
  oversizedClosure.error.message,
  new RegExp(`exceeds ${RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_MAX_CERTIFICATES} entries`),
);

const missingRootClosure = validateRiddleProofSemanticCertificateClosure({
  version: RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_VERSION,
  root_certificate_id: `rpsc_${"f".repeat(64)}`,
  certificates: [earlyCertificate],
});
assert.equal(missingRootClosure.ok, false);
assert.equal(missingRootClosure.error.code, "root_certificate_missing");

const unreachableClosureValue = {
  version: RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_VERSION,
  root_certificate_id: earlyCertificate.certificate_id,
  certificates: [routeCertificate, earlyCertificate],
};
const unreachableClosure = validateRiddleProofSemanticCertificateClosure(unreachableClosureValue);
assert.equal(unreachableClosure.ok, false);
assert.equal(unreachableClosure.error.code, "unreachable_certificates");
assert.deepEqual(unreachableClosure.error.certificate_ids, [routeCertificate.certificate_id]);

const invalidUnreachableCertificate = JSON.parse(JSON.stringify(routeCertificate));
invalidUnreachableCertificate.claim.label = "tampered unreachable body";
const invalidUnreachableClosure = validateRiddleProofSemanticCertificateClosure({
  version: RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_VERSION,
  root_certificate_id: earlyCertificate.certificate_id,
  certificates: [earlyCertificate, invalidUnreachableCertificate],
});
assert.equal(invalidUnreachableClosure.ok, false);
assert.equal(invalidUnreachableClosure.error.code, "invalid_closure_certificate");
assert.equal(invalidUnreachableClosure.error.input_index, 1);

function behaviorRootPointingTo(certificateId) {
  const forged = JSON.parse(JSON.stringify(behaviorCertificate));
  forged.derivation.premises[0].certificate_id = certificateId;
  return readdressCertificate(forged);
}

const identityEarlyCertificate = identityEarlyClosureResult.certificate;
const kindMismatchRoot = behaviorRootPointingTo(identityEarlyCertificate.certificate_id);
const kindMismatchClosure = validateRiddleProofSemanticCertificateClosure({
  version: RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_VERSION,
  root_certificate_id: kindMismatchRoot.certificate_id,
  certificates: [earlyCertificate, identityEarlyCertificate, laterCertificate, kindMismatchRoot],
});
assert.equal(kindMismatchClosure.ok, false);
assert.equal(kindMismatchClosure.error.code, "premise_snapshot_mismatch");
assert.equal(kindMismatchClosure.error.field, "derivation_kind");

const alternateClaim = {
  claim_id: "tidepool.alternate-early-claim",
  claim_version: "1",
  parameters: { sample_index: 1 },
  label: "An alternate claim over the same early evidence",
};
const alternateClaimCertificate = certify({
  claim: alternateClaim,
  evidence: earlyEvidence,
  observation: { collision: false, sound: false },
  accepts: () => true,
  issuedAt: "2026-07-19T04:36:00.000Z",
});
const claimMismatchRoot = behaviorRootPointingTo(alternateClaimCertificate.certificate_id);
const claimSnapshotMismatch = validateRiddleProofSemanticCertificateClosure({
  version: RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_VERSION,
  root_certificate_id: claimMismatchRoot.certificate_id,
  certificates: [alternateClaimCertificate, laterCertificate, claimMismatchRoot],
});
assert.equal(claimSnapshotMismatch.ok, false);
assert.equal(claimSnapshotMismatch.error.code, "premise_snapshot_mismatch");
assert.equal(claimSnapshotMismatch.error.field, "claim");

const alternateScopeCertificate = certify({
  scope: { ...baseScope, revision: "alternate-revision" },
  claim: earlyClaim,
  evidence: earlyEvidence,
  observation: { collision: false, sound: false },
  accepts: () => true,
  issuedAt: "2026-07-19T04:36:01.000Z",
});
const scopeMismatchRootForClosure = behaviorRootPointingTo(
  alternateScopeCertificate.certificate_id,
);
const scopeSnapshotMismatch = validateRiddleProofSemanticCertificateClosure({
  version: RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_VERSION,
  root_certificate_id: scopeMismatchRootForClosure.certificate_id,
  certificates: [alternateScopeCertificate, laterCertificate, scopeMismatchRootForClosure],
});
assert.equal(scopeSnapshotMismatch.ok, false);
assert.equal(scopeSnapshotMismatch.error.code, "premise_snapshot_mismatch");
assert.equal(scopeSnapshotMismatch.error.field, "scope");

const alternateEvidence = {
  ...earlyEvidence,
  artifact_digest: `sha256:${"4".repeat(64)}`,
};
const alternateEvidenceCertificate = certify({
  claim: earlyClaim,
  evidence: alternateEvidence,
  observation: { collision: false, sound: false },
  accepts: () => true,
  issuedAt: "2026-07-19T04:36:02.000Z",
});
const evidenceMismatchRoot = behaviorRootPointingTo(
  alternateEvidenceCertificate.certificate_id,
);
const evidenceSnapshotMismatch = validateRiddleProofSemanticCertificateClosure({
  version: RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_VERSION,
  root_certificate_id: evidenceMismatchRoot.certificate_id,
  certificates: [alternateEvidenceCertificate, laterCertificate, evidenceMismatchRoot],
});
assert.equal(evidenceSnapshotMismatch.ok, false);
assert.equal(evidenceSnapshotMismatch.error.code, "premise_snapshot_mismatch");
assert.equal(evidenceSnapshotMismatch.error.field, "evidence");

const invalidInputComposition = composeRiddleProofSemanticCertificateClosures({
  rule: behaviorRule,
  closures: [earlyClosure, unreachableClosureValue],
});
assert.equal(invalidInputComposition.ok, false);
assert.equal(invalidInputComposition.error.code, "input_closure_invalid");
assert.equal(invalidInputComposition.error.input_index, 1);
assert.equal(invalidInputComposition.error.cause.code, "unreachable_certificates");

const closureExpectation = {
  closure: nestedClosure,
  expected_root_certificate_id: trustedNestedCertificateId,
  expected_scope: baseScope,
  expected_claim: playableBehaviorClaim,
  expected_assurance: "declared_runtime_rule",
};
const exactClosureMatch = matchRiddleProofSemanticCertificateClosure(closureExpectation);
assert.equal(exactClosureMatch.ok, true);
assert.deepEqual(exactClosureMatch.closure, nestedClosure);
assert.deepEqual(exactClosureMatch.root_certificate, nestedResult.certificate);

const alternateSelfConsistentRoot = composeRiddleProofSemanticCertificateClosures({
  rule: nestedResult.certificate.derivation.rule,
  closures: [behaviorClosure, routeClosure],
  issued_at: "2026-07-19T04:34:02.000Z",
});
assert.equal(alternateSelfConsistentRoot.ok, true);
assert.notEqual(
  alternateSelfConsistentRoot.closure.root_certificate_id,
  trustedNestedCertificateId,
);
const alternateRootMatch = matchRiddleProofSemanticCertificateClosure({
  ...closureExpectation,
  closure: alternateSelfConsistentRoot.closure,
});
assert.equal(alternateRootMatch.ok, false);
assert.equal(alternateRootMatch.error.code, "certificate_id_mismatch");

const closureRootMismatch = matchRiddleProofSemanticCertificateClosure({
  ...closureExpectation,
  expected_root_certificate_id: `rpsc_${"e".repeat(64)}`,
});
assert.equal(closureRootMismatch.ok, false);
assert.equal(closureRootMismatch.error.code, "certificate_id_mismatch");

const closureScopeMismatch = matchRiddleProofSemanticCertificateClosure({
  ...closureExpectation,
  expected_scope: { ...baseScope, revision: "wrong" },
});
assert.equal(closureScopeMismatch.ok, false);
assert.equal(closureScopeMismatch.error.code, "scope_mismatch");

const closureClaimMismatch = matchRiddleProofSemanticCertificateClosure({
  ...closureExpectation,
  expected_claim: behaviorClaim,
});
assert.equal(closureClaimMismatch.ok, false);
assert.equal(closureClaimMismatch.error.code, "claim_mismatch");

const closureAssuranceMismatch = matchRiddleProofSemanticCertificateClosure({
  ...closureExpectation,
  expected_assurance: "runtime_contract_accepted",
});
assert.equal(closureAssuranceMismatch.ok, false);
assert.equal(closureAssuranceMismatch.error.code, "assurance_mismatch");

const validationBeforeExpectation = matchRiddleProofSemanticCertificateClosure({
  ...closureExpectation,
  closure: unreachableClosureValue,
  expected_root_certificate_id: `rpsc_${"e".repeat(64)}`,
});
assert.equal(validationBeforeExpectation.ok, false);
assert.equal(validationBeforeExpectation.error.code, "unreachable_certificates");
const malformedExpectationAfterValidation = matchRiddleProofSemanticCertificateClosure({
  ...closureExpectation,
  closure: unreachableClosureValue,
  expected_root_certificate_id: "malformed",
});
assert.equal(malformedExpectationAfterValidation.ok, false);
assert.equal(malformedExpectationAfterValidation.error.code, "unreachable_certificates");
assert.throws(
  () => matchRiddleProofSemanticCertificateClosure({
    ...closureExpectation,
    expected_root_certificate_id: "malformed",
  }),
  /expected_root_certificate_id must be a full rpsc content ID/,
);

const closureAuthorityField = validateRiddleProofSemanticCertificateClosure({
  ...nestedClosure,
  ready_to_ship: true,
});
assert.equal(closureAuthorityField.ok, false);
assert.equal(closureAuthorityField.error.code, "invalid_closure");
assert.match(closureAuthorityField.error.message, /unsupported field ready_to_ship/);

const symbolClosure = {
  ...nestedClosure,
  [Symbol("authority")]: true,
};
const symbolClosureResult = validateRiddleProofSemanticCertificateClosure(symbolClosure);
assert.equal(symbolClosureResult.ok, false);
assert.equal(symbolClosureResult.error.code, "invalid_closure");
assert.match(symbolClosureResult.error.message, /unsupported symbol field/);

const accessorClosure = { ...nestedClosure };
Object.defineProperty(accessorClosure, "root_certificate_id", {
  enumerable: true,
  get() {
    return trustedNestedCertificateId;
  },
});
const accessorClosureResult = validateRiddleProofSemanticCertificateClosure(accessorClosure);
assert.equal(accessorClosureResult.ok, false);
assert.equal(accessorClosureResult.error.code, "invalid_closure");
assert.match(accessorClosureResult.error.message, /must be an enumerable data field/);

const hostileClosure = new Proxy({}, {
  getPrototypeOf() {
    throw unprintableThrownValue;
  },
});
const hostileClosureResult = validateRiddleProofSemanticCertificateClosure(hostileClosure);
assert.equal(hostileClosureResult.ok, false);
assert.equal(hostileClosureResult.error.code, "invalid_closure");
assert.match(hostileClosureResult.error.message, /unprintable thrown value/);

const inheritedClosureExpectation = Object.assign(Object.create(closureExpectation), {});
assert.throws(
  () => matchRiddleProofSemanticCertificateClosure(inheritedClosureExpectation),
  /must be a plain object/,
);

console.log(JSON.stringify({
  ok: true,
  version: RIDDLE_PROOF_SEMANTIC_CERTIFICATE_VERSION,
  closure_version: RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_VERSION,
  atomic_certificate_id: earlyCertificate.certificate_id,
  composite_certificate_id: behaviorCertificate.certificate_id,
  nested_certificate_id: nestedResult.certificate.certificate_id,
  nested_closure_body_count: nestedClosure.certificates.length,
}));
