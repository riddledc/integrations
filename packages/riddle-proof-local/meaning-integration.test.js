import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as checked from "../riddle-proof-core/dist/checked-meaning.js";
import * as grounded from "../riddle-proof-core/dist/grounded-evidence.js";
import * as packetProtocol from "../riddle-proof-core/dist/packet.js";
import * as ruleTrust from "../riddle-proof-core/dist/rule-trust-root.js";
import {
  captureDocumentSnapshot,
  createDocumentSnapshotCurrentnessGroundingRecipe,
  createDocumentSnapshotGroundingRecipe,
  recaptureDocumentSnapshotCurrentness,
} from "./dist/index.js";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(packageRoot, "fixtures", "document-set");
const files = [
  { role: "source", path: join(fixtureRoot, "source.txt") },
  { role: "template", path: join(fixtureRoot, "template.txt") },
  { role: "working", path: join(fixtureRoot, "working.txt") },
  { role: "rendered", path: join(fixtureRoot, "rendered.pdf") },
];
const snapshotCapturedAt = "2026-07-19T20:00:00.000Z";
const snapshotVerifiedAt = "2026-07-19T20:00:01.000Z";
const currentnessCheckedAt = "2026-07-19T20:00:02.000Z";
const currentnessVerifiedAt = "2026-07-19T20:00:03.000Z";
const rootIssuedAt = "2026-07-19T20:00:04.000Z";
const receiptIssuedAt = "2026-07-19T20:00:05.000Z";
const consumptionTime = "2026-07-19T20:00:06.000Z";

const documentReceipt = await captureDocumentSnapshot({
  files,
  capturedAt: snapshotCapturedAt,
});
const currentness = await recaptureDocumentSnapshotCurrentness({
  expectedReceipt: documentReceipt,
  files: [...files].reverse(),
  checkedAt: currentnessCheckedAt,
});
assert.equal(currentness.status, "current");
assert.equal(currentness.observed_snapshot_id, documentReceipt.snapshot.snapshot_id);
assert.equal(currentness.observed_manifest_digest, documentReceipt.snapshot.manifest_digest);

const scope = {
  repository: "synthetic/local-document-set",
  revision: documentReceipt.snapshot.snapshot_id,
  environment: "local-read-only",
  target: "selected-document-set",
  proof_attempt: "synthetic-packet-composition-1",
};
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyBytes = privateKey.export({ format: "der", type: "pkcs8" });
const publicKeyBytes = publicKey.export({ format: "der", type: "spki" });
const publicKeyFingerprint = `sha256:${createHash("sha256").update(publicKeyBytes).digest("hex")}`;
const keyId = "synthetic-local-document-set-key";

function issueGroundedLeaf({
  name,
  recipe,
  capturedAt,
  verificationTime,
  nonceByte,
}) {
  const verifier = grounded.createRiddleProofGroundedDeclarativeJsonVerifier(
    recipe.verifier_definition,
  );
  const contract = grounded.createRiddleProofGroundedDeclarativeJsonContract(
    recipe.contract_definition,
  );
  assert.equal(verifier.ok, true, verifier.ok ? undefined : verifier.error.message);
  assert.equal(contract.ok, true, contract.ok ? undefined : contract.error.message);
  if (!verifier.ok || !contract.ok) throw new Error("fixture definitions did not validate");
  const nonce = Buffer.alloc(32, nonceByte).toString("base64url");
  const collector = {
    collector_id: `riddle-proof.fixture-${name}`,
    collector_version: "1",
    implementation_digest: `sha256:${String(nonceByte % 10).repeat(64)}`,
  };
  const sensor = {
    kind: "other",
    name: `fixture-${name}`,
    version: "1",
    observed_target: scope.target,
    metadata: { read_only: true },
  };
  const signed = grounded.createRiddleProofSignedCaptureBundle({
    scope,
    nonce,
    captured_at: capturedAt,
    collector,
    sensor,
    verifier: verifier.verifier_ref,
    artifacts: recipe.artifacts,
    signing_key: {
      key_id: keyId,
      private_key_pkcs8_base64: privateKeyBytes.toString("base64"),
    },
  });
  assert.equal(signed.ok, true, signed.ok ? undefined : signed.error.message);
  if (!signed.ok) throw new Error(signed.error.message);
  const configuration = {
    policy: {
      expected_scope: scope,
      expected_nonce: nonce,
      expected_collector: collector,
      expected_sensor: sensor,
      expected_verifier: verifier.verifier_ref,
      expected_signer: {
        key_id: keyId,
        public_key_spki_sha256: publicKeyFingerprint,
      },
      verification_time: verificationTime,
      max_capture_age_ms: 60_000,
      max_future_skew_ms: 1_000,
      required_artifact_roles: [recipe.artifacts[0].role],
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
    bundle: signed.bundle,
    ...configuration,
    issued_at: verificationTime,
  });
  assert.equal(issued.ok, true, issued.ok ? undefined : issued.error.message);
  if (!issued.ok) throw new Error(issued.error.message);
  const groundedClosure = grounded.createRiddleProofGroundedSemanticAtomicCertificateClosure({
    certificate: issued.certificate,
    grounding: issued.grounding,
    configuration,
  });
  assert.equal(
    groundedClosure.ok,
    true,
    groundedClosure.ok ? undefined : groundedClosure.error.message,
  );
  if (!groundedClosure.ok) throw new Error(groundedClosure.error.message);
  const replayContext = {
    certificate_id: issued.certificate.certificate_id,
    ...configuration,
  };
  const checkedClosure = checked.createRiddleProofCheckedMeaningAtomicClosure({
    grounded_closure: groundedClosure.grounded_closure,
    replay_contexts: [replayContext],
  });
  assert.equal(
    checkedClosure.ok,
    true,
    checkedClosure.ok ? undefined : checkedClosure.error.message,
  );
  if (!checkedClosure.ok) throw new Error(checkedClosure.error.message);
  return {
    certificate: issued.certificate,
    checkedClosure: checkedClosure.checked_closure,
    replayContext,
  };
}

const snapshotLeaf = issueGroundedLeaf({
  name: "snapshot",
  recipe: createDocumentSnapshotGroundingRecipe(documentReceipt),
  capturedAt: snapshotCapturedAt,
  verificationTime: snapshotVerifiedAt,
  nonceByte: 31,
});
const currentnessLeaf = issueGroundedLeaf({
  name: "currentness",
  recipe: createDocumentSnapshotCurrentnessGroundingRecipe(currentness),
  capturedAt: currentnessCheckedAt,
  verificationTime: currentnessVerifiedAt,
  nonceByte: 32,
});
assert.deepEqual(currentnessLeaf.certificate.claim.parameters, {
  snapshot_id: documentReceipt.snapshot.snapshot_id,
  manifest_digest: documentReceipt.snapshot.manifest_digest,
  checked_at: currentnessCheckedAt,
});

const rootRuleDefinition = {
  rule_id: "fixture.document-set-current",
  rule_version: "1",
  label: "Derive a current document-set fixture from independently grounded observations",
  premises: [
    {
      claim_id: "local-document-snapshot-captured",
      claim_version: "1",
      parameters: {
        snapshot_id: { op: "any" },
        manifest_digest: { op: "any" },
      },
    },
    {
      claim_id: "local-document-snapshot-current-at-check",
      claim_version: "1",
      parameters: {
        snapshot_id: { op: "any" },
        manifest_digest: { op: "any" },
        checked_at: { op: "equals", value: currentnessCheckedAt },
      },
    },
  ],
  conclusion: {
    claim_id: "fixture.document-set-ready",
    claim_version: "1",
    label: "The exact synthetic document set was current at the pinned check",
    parameters: {
      snapshot_id: { op: "from_premise", premise_index: 0, parameter: "snapshot_id" },
      manifest_digest: { op: "from_premise", premise_index: 0, parameter: "manifest_digest" },
      checked_at: { op: "from_premise", premise_index: 1, parameter: "checked_at" },
    },
  },
  constraints: {
    all_of: true,
    parameter_equalities: [
      {
        members: [
          { premise_index: 0, parameter: "snapshot_id" },
          { premise_index: 1, parameter: "snapshot_id" },
        ],
      },
      {
        members: [
          { premise_index: 0, parameter: "manifest_digest" },
          { premise_index: 1, parameter: "manifest_digest" },
        ],
      },
    ],
    ordered_premise_chronology: true,
    max_age_ms: 60_000,
  },
};
const rootRule = checked.createRiddleProofCheckedMeaningRule({
  definition: rootRuleDefinition,
});
assert.equal(rootRule.ok, true, rootRule.ok ? undefined : rootRule.error.message);
if (!rootRule.ok) throw new Error(rootRule.error.message);
const root = checked.composeRiddleProofCheckedMeaningClosures({
  expected_rule: rootRule.rule_ref,
  closures: [snapshotLeaf.checkedClosure, currentnessLeaf.checkedClosure],
  issued_at: rootIssuedAt,
  replay_contexts: [snapshotLeaf.replayContext, currentnessLeaf.replayContext],
  rule_registry: [rootRule.registration],
  trusted_rules: [rootRule.rule_ref],
});
assert.equal(root.ok, true, root.ok ? undefined : root.error.message);
if (!root.ok) throw new Error(root.error.message);
assert.deepEqual(
  root.certificate.derivation.premises.map((premise) => premise.certificate_id),
  [snapshotLeaf.certificate.certificate_id, currentnessLeaf.certificate.certificate_id],
);

// A fresh consumer independently replays and matches the checked root before
// relying on any packet binding.
const serializedClosure = JSON.parse(JSON.stringify(root.checked_closure));
const replayContexts = JSON.parse(JSON.stringify([
  snapshotLeaf.replayContext,
  currentnessLeaf.replayContext,
]));
const matched = checked.matchRiddleProofCheckedMeaningClosure({
  checked_closure: serializedClosure,
  replay_contexts: replayContexts,
  rule_registry: [rootRule.registration],
  trusted_rules: [rootRule.rule_ref],
  expected_root_certificate_id: root.certificate.certificate_id,
  expected_scope: scope,
  expected_claim: root.certificate.claim,
  expected_root_rule: rootRule.rule_ref,
});
assert.equal(matched.ok, true, matched.ok ? undefined : matched.error.message);
if (!matched.ok) throw new Error(matched.error.message);
const resolvedCertificateIds = matched.checked_closure.grounded_closure.closure.certificates
  .map((certificate) => certificate.certificate_id)
  .sort();
assert.equal(resolvedCertificateIds.length, 3);
assert.equal(new Set(resolvedCertificateIds).size, resolvedCertificateIds.length);
const assessed = checked.assessRiddleProofCheckedMeaningClosure({
  checked_closure: serializedClosure,
  replay_contexts: replayContexts,
  rule_registry: [rootRule.registration],
  trusted_rules: [rootRule.rule_ref],
  consumption_time: consumptionTime,
  max_grounded_age_ms: 10_000,
  max_future_skew_ms: 0,
});
assert.equal(assessed.disposition, "checked");

const createdRuleTrust = ruleTrust.createRiddleProofRuleTrustRoot({
  trust_root_id: "fixture.document-set-rules",
  trust_root_version: "1",
  rule_definitions: [rootRuleDefinition],
});
assert.equal(
  createdRuleTrust.ok,
  true,
  createdRuleTrust.ok ? undefined : createdRuleTrust.error.message,
);
if (!createdRuleTrust.ok) throw new Error(createdRuleTrust.error.message);
const evidenceTrustRoot = {
  trust_root_id: "fixture.document-set-evidence",
  trust_root_version: "1",
  bundle_digest: `sha256:${"e".repeat(64)}`,
};
const execution = {
  execution_id: `rpex_${"x".repeat(43)}`,
  adapter_id: "fixture.packet-producer",
  runtime_id: "fixture.runtime",
  protocol_version: "fixture.packet-protocol.v1",
  configuration_version: "fixture.configuration.v1",
  route_code: "primary",
  attempt_count: 1,
};
const executionPolicy = {
  version: packetProtocol.RIDDLE_PROOF_EXECUTION_POLICY_VERSION,
  policy_id: "fixture.packet-execution-policy",
  policy_version: "1",
  adapter_id: execution.adapter_id,
  allowed_runtime_ids: [execution.runtime_id],
  allowed_protocol_versions: [execution.protocol_version],
  allowed_configuration_versions: [execution.configuration_version],
  allowed_route_codes: [execution.route_code],
  allowed_escalation_codes: [],
  allow_no_escalation: true,
  max_attempt_count: 1,
  deterministic_components: [],
};
const privatePacket = {
  version: packetProtocol.RIDDLE_PROOF_PRIVATE_PACKET_VERSION,
  packet_id: `rpp_${"p".repeat(43)}`,
  subject_id: documentReceipt.snapshot.snapshot_id,
  subject_digest: documentReceipt.snapshot.manifest_digest,
  rule_trust_root: createdRuleTrust.trust_root,
  protocol_version: execution.protocol_version,
  execution_digest: packetProtocol.digestRiddleProofExecution(execution),
  entries: [{
    entry_id: `rpe_${"q".repeat(43)}`,
    classification: "fixture.summary",
    issuer: { kind: "execution", execution_id: execution.execution_id },
    evidence_certificate_ids: [
      snapshotLeaf.certificate.certificate_id,
      currentnessLeaf.certificate.certificate_id,
    ],
    blocking: false,
    content: { private_fixture_text: "PRIVATE_PACKET_SENTINEL" },
  }],
};
const privatePacketBytes = Buffer.from(JSON.stringify(privatePacket), "utf8");
const packetReceipt = packetProtocol.createRiddleProofPacketReceipt({
  private_packet_bytes: privatePacketBytes,
  opaque_reference_id: `rpar_${"r".repeat(43)}`,
  execution,
  execution_policy: executionPolicy,
  evidence_trust_root: evidenceTrustRoot,
  checked_root_certificate_id: root.certificate.certificate_id,
  currentness_certificate_id: currentnessLeaf.certificate.certificate_id,
  issued_at: receiptIssuedAt,
});
assert.equal(
  packetReceipt.ok,
  true,
  packetReceipt.ok ? undefined : packetReceipt.error.message,
);
if (!packetReceipt.ok) throw new Error(packetReceipt.error.message);
assert.equal(JSON.stringify(packetReceipt.receipt).includes("PRIVATE_PACKET_SENTINEL"), false);

const packetVerified = packetProtocol.verifyRiddleProofPacketReceipt({
  receipt: JSON.parse(JSON.stringify(packetReceipt.receipt)),
  private_packet_bytes: privatePacketBytes,
  expected_subject_id: documentReceipt.snapshot.snapshot_id,
  expected_subject_digest: documentReceipt.snapshot.manifest_digest,
  expected_rule_trust_root: createdRuleTrust.trust_root,
  expected_evidence_trust_root: evidenceTrustRoot,
  expected_protocol_version: execution.protocol_version,
  expected_root_certificate_id: root.certificate.certificate_id,
  expected_root_certificate_issued_at: root.certificate.issued_at,
  expected_currentness_certificate_id: currentnessLeaf.certificate.certificate_id,
  expected_currentness_certificate_issued_at: currentnessLeaf.certificate.issued_at,
  resolved_certificate_ids: resolvedCertificateIds,
  execution_policy: executionPolicy,
  verification_time: consumptionTime,
  max_receipt_age_ms: 10_000,
  max_future_skew_ms: 0,
});
assert.equal(packetVerified.ok, true, packetVerified.ok ? undefined : packetVerified.error.message);

const backdatedReceipt = packetProtocol.createRiddleProofPacketReceipt({
  private_packet_bytes: privatePacketBytes,
  opaque_reference_id: `rpar_${"s".repeat(43)}`,
  execution,
  execution_policy: executionPolicy,
  evidence_trust_root: evidenceTrustRoot,
  checked_root_certificate_id: root.certificate.certificate_id,
  currentness_certificate_id: currentnessLeaf.certificate.certificate_id,
  issued_at: "2026-07-19T20:00:03.999Z",
});
assert.equal(backdatedReceipt.ok, true);
if (!backdatedReceipt.ok) throw new Error(backdatedReceipt.error.message);
const chronologyRejected = packetProtocol.verifyRiddleProofPacketReceipt({
  ...{
    receipt: backdatedReceipt.receipt,
    private_packet_bytes: privatePacketBytes,
    expected_subject_id: documentReceipt.snapshot.snapshot_id,
    expected_subject_digest: documentReceipt.snapshot.manifest_digest,
    expected_rule_trust_root: createdRuleTrust.trust_root,
    expected_evidence_trust_root: evidenceTrustRoot,
    expected_protocol_version: execution.protocol_version,
    expected_root_certificate_id: root.certificate.certificate_id,
    expected_root_certificate_issued_at: root.certificate.issued_at,
    expected_currentness_certificate_id: currentnessLeaf.certificate.certificate_id,
    expected_currentness_certificate_issued_at: currentnessLeaf.certificate.issued_at,
    resolved_certificate_ids: resolvedCertificateIds,
    execution_policy: executionPolicy,
    verification_time: consumptionTime,
    max_receipt_age_ms: 10_000,
    max_future_skew_ms: 0,
  },
});
assert.equal(chronologyRejected.ok, false);
if (chronologyRejected.ok) throw new Error("backdated packet receipt unexpectedly verified");
assert.equal(chronologyRejected.error.code, "receipt_chronology_invalid");

const inventedRoot = JSON.parse(JSON.stringify(serializedClosure));
const inventedCertificate = inventedRoot.grounded_closure.closure.certificates.find(
  (certificate) => certificate.certificate_id
    === inventedRoot.grounded_closure.closure.root_certificate_id,
);
inventedCertificate.claim.label = "Invented fixture meaning";
const invented = checked.matchRiddleProofCheckedMeaningClosure({
  checked_closure: inventedRoot,
  replay_contexts: replayContexts,
  rule_registry: [rootRule.registration],
  trusted_rules: [rootRule.rule_ref],
  expected_root_certificate_id: root.certificate.certificate_id,
  expected_scope: scope,
  expected_claim: root.certificate.claim,
  expected_root_rule: rootRule.rule_ref,
});
assert.equal(invented.ok, false, "rewritten client meaning must not survive replay");

console.log(JSON.stringify({
  ok: true,
  suite: "riddle-proof.local-generic-packet-composition",
  snapshot_id: documentReceipt.snapshot.snapshot_id,
  currentness_certificate_id: currentnessLeaf.certificate.certificate_id,
  root_certificate_id: root.certificate.certificate_id,
  checked_root_matched: true,
  currentness_verified: true,
  packet_binding_verified: true,
  receipt_chronology_enforced: true,
  invented_meaning_rejected: true,
}));
