import assert from "node:assert/strict";

import {
  RIDDLE_PROOF_APPROVED_EXECUTION_POLICY_VERSION,
  createRiddleProofReviewPacketReceipt,
  digestRiddleProofAgentExecution,
  verifyRiddleProofReviewPacket,
} from "./dist/review-protocol.js";

const certificate = (digit) => `rpsc_${digit.repeat(64)}`;
const snapshotId = `rpds_${"s".repeat(43)}`;
const manifestDigest = `sha256:${"a".repeat(64)}`;
const trustRoot = {
  trust_root_id: "synthetic-amendment-rules",
  trust_root_version: "1",
  bundle_digest: `sha256:${"b".repeat(64)}`,
};
const evidenceTrustRoot = {
  trust_root_id: "synthetic-amendment-evidence",
  trust_root_version: "1",
  bundle_digest: `sha256:${"c".repeat(64)}`,
};
const execution = {
  execution_id: `rpex_${"e".repeat(43)}`,
  provider_adapter_id: "company-configured-claude-surface",
  model_id: "configured-model",
  protocol_version: "amendment-review-v1",
  prompt_version: "synthetic-prompt-v1",
  routing_decision_code: "standard_review",
  attempt_count: 1,
  escalation_reason_code: "none",
};
const approvedExecutionPolicy = {
  version: RIDDLE_PROOF_APPROVED_EXECUTION_POLICY_VERSION,
  policy_id: "synthetic-approved-execution",
  policy_version: "1",
  provider_adapter_id: execution.provider_adapter_id,
  allowed_model_ids: [execution.model_id],
  allowed_protocol_versions: [execution.protocol_version],
  allowed_prompt_versions: [execution.prompt_version],
  allowed_routing_decision_codes: [execution.routing_decision_code],
  allowed_escalation_reason_codes: [execution.escalation_reason_code],
  allow_no_escalation: false,
  max_attempt_count: 1,
  deterministic_components: [{
    component_id: "synthetic-document-sensor",
    component_version: "1",
  }],
};
const privilegedSentinels = {
  source: "SENTINEL_CONTRACT_CLAUSE",
  path: "/private/company/matter/customer-amendment.docx",
  prompt: "SENTINEL_PRIVILEGED_PROMPT",
};
const packet = {
  version: "riddle-proof.privileged-review-packet.v1",
  packet_id: `rpp_${"p".repeat(43)}`,
  snapshot_id: snapshotId,
  manifest_digest: manifestDigest,
  rule_trust_root: trustRoot,
  protocol_version: execution.protocol_version,
  execution_metadata_digest: digestRiddleProofAgentExecution(execution),
  assertions: [
    {
      entry_id: `rpae_${"d".repeat(43)}`,
      classification: "document_observation",
      issuer: {
        kind: "deterministic",
        component_id: "synthetic-document-sensor",
        component_version: "1",
      },
      evidence_certificate_ids: [certificate("1")],
      blocking: false,
      content: privilegedSentinels,
    },
    {
      entry_id: `rpae_${"u".repeat(43)}`,
      classification: "agent_uncertainty",
      issuer: { kind: "agent", execution_id: execution.execution_id },
      evidence_certificate_ids: [certificate("1")],
      blocking: true,
      content: { question: "SENTINEL_PRIVILEGED_QUESTION" },
    },
  ],
  uncertainty_entry_ids: [`rpae_${"u".repeat(43)}`],
};

const packetBytes = Buffer.from(JSON.stringify(packet), "utf8");
const created = createRiddleProofReviewPacketReceipt({
  privileged_packet_bytes: packetBytes,
  opaque_reference_id: `rpar_${"r".repeat(43)}`,
  execution,
  checked_root_certificate_id: certificate("2"),
  currentness_certificate_id: certificate("3"),
  evidence_trust_root: evidenceTrustRoot,
  issued_at: "2026-07-19T22:00:00.000Z",
});
assert.equal(created.ok, true, created.ok ? undefined : created.error.message);
assert.equal(created.receipt.assertion_index.length, 2);
assert.deepEqual(created.receipt.uncertainty_entry_ids, packet.uncertainty_entry_ids);
assert.equal(created.receipt.execution.model_id, execution.model_id);

const publicReceiptText = JSON.stringify(created.receipt);
for (const sentinel of [
  ...Object.values(privilegedSentinels),
  "SENTINEL_PRIVILEGED_QUESTION",
  "content",
]) {
  assert.equal(publicReceiptText.includes(sentinel), false, `receipt leaked ${sentinel}`);
}
assert.equal(publicReceiptText.includes("filename"), false);
assert.equal(publicReceiptText.includes("prompt_version"), true);

const badIssuerPacket = structuredClone(packet);
badIssuerPacket.assertions[0].issuer = {
  kind: "agent",
  execution_id: execution.execution_id,
};
const badIssuer = createRiddleProofReviewPacketReceipt({
  privileged_packet_bytes: Buffer.from(JSON.stringify(badIssuerPacket)),
  opaque_reference_id: `rpar_${"r".repeat(43)}`,
  execution,
  checked_root_certificate_id: certificate("2"),
  currentness_certificate_id: certificate("3"),
  evidence_trust_root: evidenceTrustRoot,
  issued_at: "2026-07-19T22:00:00.000Z",
});
assert.equal(badIssuer.ok, false, "an agent cannot self-label as deterministic");
assert.equal(JSON.stringify(badIssuer).includes(privilegedSentinels.source), false);

const omittedUncertaintyPacket = structuredClone(packet);
omittedUncertaintyPacket.uncertainty_entry_ids = [];
const omittedUncertainty = createRiddleProofReviewPacketReceipt({
  privileged_packet_bytes: Buffer.from(JSON.stringify(omittedUncertaintyPacket)),
  opaque_reference_id: `rpar_${"r".repeat(43)}`,
  execution,
  checked_root_certificate_id: certificate("2"),
  currentness_certificate_id: certificate("3"),
  evidence_trust_root: evidenceTrustRoot,
  issued_at: "2026-07-19T22:00:00.000Z",
});
assert.equal(omittedUncertainty.ok, false, "uncertainties must be explicitly enumerated");

const currentnessWitness = {
  version: "riddle-proof.snapshot-currentness-witness.v1",
  status: "current",
  expected_snapshot_id: snapshotId,
  expected_manifest_digest: manifestDigest,
  observed_snapshot_id: snapshotId,
  observed_manifest_digest: manifestDigest,
  checked_at: "2026-07-19T22:00:00.000Z",
  certificate_id: certificate("3"),
};
const verificationBase = {
  receipt: created.receipt,
  privileged_packet_bytes: packetBytes,
  checked_closure: {},
  evidence_trust_root_bundle: {},
  expected_evidence_trust_root: evidenceTrustRoot,
  rule_trust_root_bundle: {},
  expected_rule_trust_root: trustRoot,
  expected_scope: {
    repository: "synthetic",
    revision: "snapshot",
    environment: "local",
    target: "amendment",
    proof_attempt: "1",
  },
  expected_root_certificate_id: certificate("2"),
  expected_packet_complete_rule: {
    rule_id: "packet-complete",
    rule_version: "1",
    engine: "riddle-proof.checked-meaning-rule.v0",
    implementation_digest: `sha256:${"c".repeat(64)}`,
  },
  expected_protocol_version: execution.protocol_version,
  approved_execution_policy: approvedExecutionPolicy,
  currentness_witness: currentnessWitness,
  verification_time: "2026-07-19T22:00:01.000Z",
  max_grounded_age_ms: 60_000,
  max_currentness_age_ms: 60_000,
  max_future_skew_ms: 0,
};

const producerReplayContextRejected = verifyRiddleProofReviewPacket({
  ...verificationBase,
  replay_contexts: [],
});
assert.equal(producerReplayContextRejected.ok, false);
assert.equal(producerReplayContextRejected.error.code, "invalid_input");

const substitutedEvidenceTrust = verifyRiddleProofReviewPacket({
  ...verificationBase,
  expected_evidence_trust_root: {
    ...evidenceTrustRoot,
    bundle_digest: `sha256:${"d".repeat(64)}`,
  },
});
assert.equal(substitutedEvidenceTrust.ok, false);
assert.equal(substitutedEvidenceTrust.error.code, "evidence_trust_root_mismatch");

const tamperedPacket = structuredClone(packet);
tamperedPacket.assertions[0].content.source = "tampered privileged bytes";
const tampered = verifyRiddleProofReviewPacket({
  receipt: created.receipt,
  privileged_packet_bytes: Buffer.from(JSON.stringify(tamperedPacket)),
  checked_closure: {},
  evidence_trust_root_bundle: {},
  expected_evidence_trust_root: evidenceTrustRoot,
  rule_trust_root_bundle: {},
  expected_rule_trust_root: trustRoot,
  expected_scope: {
    repository: "synthetic",
    revision: "snapshot",
    environment: "local",
    target: "amendment",
    proof_attempt: "1",
  },
  expected_root_certificate_id: certificate("2"),
  expected_packet_complete_rule: {
    rule_id: "packet-complete",
    rule_version: "1",
    engine: "riddle-proof.checked-meaning-rule.v0",
    implementation_digest: `sha256:${"c".repeat(64)}`,
  },
  expected_protocol_version: execution.protocol_version,
  approved_execution_policy: approvedExecutionPolicy,
  currentness_witness: currentnessWitness,
  verification_time: "2026-07-19T22:00:01.000Z",
  max_grounded_age_ms: 60_000,
  max_currentness_age_ms: 60_000,
  max_future_skew_ms: 0,
});
assert.equal(tampered.ok, false);
assert.equal(tampered.error.code, "packet_digest_mismatch");

const substitutedTrust = verifyRiddleProofReviewPacket({
  receipt: created.receipt,
  privileged_packet_bytes: packetBytes,
  checked_closure: {},
  evidence_trust_root_bundle: {},
  expected_evidence_trust_root: evidenceTrustRoot,
  rule_trust_root_bundle: {},
  expected_rule_trust_root: { ...trustRoot, bundle_digest: `sha256:${"f".repeat(64)}` },
  expected_scope: {
    repository: "synthetic",
    revision: "snapshot",
    environment: "local",
    target: "amendment",
    proof_attempt: "1",
  },
  expected_root_certificate_id: certificate("2"),
  expected_packet_complete_rule: {
    rule_id: "packet-complete",
    rule_version: "1",
    engine: "riddle-proof.checked-meaning-rule.v0",
    implementation_digest: `sha256:${"c".repeat(64)}`,
  },
  expected_protocol_version: execution.protocol_version,
  approved_execution_policy: approvedExecutionPolicy,
  currentness_witness: currentnessWitness,
  verification_time: "2026-07-19T22:00:01.000Z",
  max_grounded_age_ms: 60_000,
  max_currentness_age_ms: 60_000,
  max_future_skew_ms: 0,
});
assert.equal(substitutedTrust.ok, false);
assert.equal(substitutedTrust.error.code, "rule_trust_root_mismatch");

console.log("riddle proof review protocol tests passed", {
  receipt_id: created.receipt.receipt_id,
  content_free_projection: true,
  issuer_class_enforced: true,
  explicit_uncertainties: true,
  tamper_rejected: true,
});
