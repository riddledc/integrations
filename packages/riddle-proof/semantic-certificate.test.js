import assert from "node:assert/strict";
import { createRequire } from "node:module";

import * as rootExports from "./dist/index.js";
import {
  RIDDLE_PROOF_SEMANTIC_CERTIFICATE_VERSION,
  composeRiddleProofSemanticCertificates,
  createRiddleProofSemanticCertificate,
  matchRiddleProofSemanticCertificate,
  parseRiddleProofSemanticCertificate,
  riddleProofSemanticScopesEqual,
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
  typeof cjsSubpathExports.composeRiddleProofSemanticCertificates,
  "function",
  "CJS subpath should expose the composition helper",
);
assert.equal(
  typeof cjsSubpathExports.matchRiddleProofSemanticCertificate,
  "function",
  "CJS subpath should expose the downstream matcher",
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
  get() {
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

console.log(JSON.stringify({
  ok: true,
  version: RIDDLE_PROOF_SEMANTIC_CERTIFICATE_VERSION,
  atomic_certificate_id: earlyCertificate.certificate_id,
  composite_certificate_id: behaviorCertificate.certificate_id,
  nested_certificate_id: nestedResult.certificate.certificate_id,
}));
