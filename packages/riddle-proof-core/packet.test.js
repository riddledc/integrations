import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  RIDDLE_PROOF_EXECUTION_POLICY_VERSION,
  RIDDLE_PROOF_PACKET_RECEIPT_DIGEST_DOMAIN,
  RIDDLE_PROOF_PRIVATE_PACKET_VERSION,
  createRiddleProofPacketReceipt,
  digestRiddleProofExecution,
  digestRiddleProofExecutionPolicy,
  digestRiddleProofPrivatePacketBytes,
  verifyRiddleProofPacketReceipt,
} from "./dist/packet.js";

const sha256 = (character) => `sha256:${character.repeat(64)}`;
const token = (character) => character.repeat(43);
const certificateId = (character) => `rpsc_${character.repeat(64)}`;

const ruleTrustRoot = {
  trust_root_id: "fixture.rules",
  trust_root_version: "1",
  bundle_digest: sha256("1"),
};
const evidenceTrustRoot = {
  trust_root_id: "fixture.evidence",
  trust_root_version: "1",
  bundle_digest: sha256("2"),
};
const execution = {
  execution_id: `rpex_${token("3")}`,
  adapter_id: "fixture.adapter",
  runtime_id: "fixture.runtime",
  protocol_version: "fixture.protocol.v1",
  configuration_version: "fixture.configuration.v1",
  route_code: "primary",
  attempt_count: 1,
};
const policy = {
  version: RIDDLE_PROOF_EXECUTION_POLICY_VERSION,
  policy_id: "fixture.execution-policy",
  policy_version: "1",
  adapter_id: execution.adapter_id,
  allowed_runtime_ids: [execution.runtime_id],
  allowed_protocol_versions: [execution.protocol_version],
  allowed_configuration_versions: [execution.configuration_version],
  allowed_route_codes: [execution.route_code],
  allowed_escalation_codes: ["manual_route"],
  allow_no_escalation: true,
  max_attempt_count: 2,
  deterministic_components: [{
    component_id: "fixture.checker",
    component_version: "1",
  }],
};
const privateSentinels = {
  source: "PRIVATE_SOURCE_SENTINEL",
  reasoning: "PRIVATE_REASONING_SENTINEL",
};
const packet = {
  version: RIDDLE_PROOF_PRIVATE_PACKET_VERSION,
  packet_id: `rpp_${token("4")}`,
  subject_id: "subject:fixture-7",
  subject_digest: sha256("5"),
  rule_trust_root: ruleTrustRoot,
  protocol_version: execution.protocol_version,
  execution_digest: digestRiddleProofExecution(execution),
  entries: [
    {
      entry_id: `rpe_${token("6")}`,
      classification: "fixture.observation",
      issuer: {
        kind: "deterministic",
        component_id: "fixture.checker",
        component_version: "1",
      },
      evidence_certificate_ids: [certificateId("7")],
      blocking: false,
      content: privateSentinels,
    },
    {
      entry_id: `rpe_${token("8")}`,
      classification: "fixture.inference",
      issuer: { kind: "execution", execution_id: execution.execution_id },
      evidence_certificate_ids: [],
      blocking: true,
      content: { detail: "PRIVATE_DETAIL_SENTINEL" },
    },
  ],
};
const packetBytes = Buffer.from(JSON.stringify(packet), "utf8");
const packetDigest = digestRiddleProofPrivatePacketBytes(packetBytes);
const rootCertificateId = certificateId("a");
const currentnessCertificateId = certificateId("b");
const resolvedCertificateIds = [
  rootCertificateId,
  currentnessCertificateId,
  packet.entries[0].evidence_certificate_ids[0],
];

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function recomputeReceiptId(receipt) {
  const { receipt_id: _receiptId, ...body } = receipt;
  const digest = createHash("sha256")
    .update(RIDDLE_PROOF_PACKET_RECEIPT_DIGEST_DOMAIN)
    .update(canonicalJson(body))
    .digest();
  return `rprr_${digest.toString("base64url")}`;
}

const created = createRiddleProofPacketReceipt({
  private_packet_bytes: packetBytes,
  opaque_reference_id: `rpar_${token("c")}`,
  execution,
  execution_policy: policy,
  evidence_trust_root: evidenceTrustRoot,
  checked_root_certificate_id: rootCertificateId,
  currentness_certificate_id: currentnessCertificateId,
  issued_at: "2026-07-19T20:00:00.000Z",
});
assert.equal(created.ok, true);
if (!created.ok) throw new Error(created.error.message);
assert.equal(created.receipt.entry_index.length, 2);
assert.equal(created.receipt.packet.packet_digest, packetDigest);
assert.equal(
  created.receipt.execution_policy_digest,
  digestRiddleProofExecutionPolicy(policy),
);
assert.equal(Object.hasOwn(created, "private_packet"), false);
const serializedReceipt = JSON.stringify(created.receipt);
for (const sentinel of [...Object.values(privateSentinels), "PRIVATE_DETAIL_SENTINEL"]) {
  assert.equal(serializedReceipt.includes(sentinel), false);
}

const verifyInput = {
  receipt: created.receipt,
  private_packet_bytes: packetBytes,
  expected_subject_id: packet.subject_id,
  expected_subject_digest: packet.subject_digest,
  expected_rule_trust_root: ruleTrustRoot,
  expected_evidence_trust_root: evidenceTrustRoot,
  expected_protocol_version: execution.protocol_version,
  expected_root_certificate_id: rootCertificateId,
  expected_root_certificate_issued_at: "2026-07-19T19:59:58.000Z",
  expected_currentness_certificate_id: currentnessCertificateId,
  expected_currentness_certificate_issued_at: "2026-07-19T19:59:59.000Z",
  resolved_certificate_ids: resolvedCertificateIds,
  execution_policy: policy,
  verification_time: "2026-07-19T20:03:00.000Z",
  max_receipt_age_ms: 5 * 60 * 1000,
  max_future_skew_ms: 1000,
};

const verified = verifyRiddleProofPacketReceipt(verifyInput);
assert.equal(verified.ok, true);
if (!verified.ok) throw new Error(verified.error.message);
assert.equal(verified.entry_count, 2);
assert.equal(Object.hasOwn(verified, "conclusion"), false);
assert.equal(Object.hasOwn(verified, "content"), false);
assert.equal(digestRiddleProofExecutionPolicy(policy), digestRiddleProofExecutionPolicy({ ...policy }));

function expectFailure(changes, code) {
  const result = verifyRiddleProofPacketReceipt({ ...verifyInput, ...changes });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error(`${code} unexpectedly verified`);
  assert.equal(result.error.code, code);
  for (const sentinel of [...Object.values(privateSentinels), "PRIVATE_DETAIL_SENTINEL"]) {
    assert.equal(JSON.stringify(result).includes(sentinel), false);
  }
}

const byteTamperedPacket = structuredClone(packet);
byteTamperedPacket.entries[0].content.source = "TAMPERED_PRIVATE_VALUE";
expectFailure(
  { private_packet_bytes: Buffer.from(JSON.stringify(byteTamperedPacket), "utf8") },
  "packet_digest_mismatch",
);

expectFailure({ expected_subject_digest: sha256("d") }, "subject_mismatch");
expectFailure({ expected_rule_trust_root: { ...ruleTrustRoot, bundle_digest: sha256("e") } }, "rule_trust_root_mismatch");
expectFailure({ expected_evidence_trust_root: { ...evidenceTrustRoot, bundle_digest: sha256("f") } }, "evidence_trust_root_mismatch");
expectFailure({ execution_policy: { ...policy, allowed_runtime_ids: ["other.runtime"] } }, "execution_mismatch");
expectFailure({ execution_policy: { ...policy, policy_id: "fixture.substituted-policy" } }, "execution_mismatch");
expectFailure({ expected_root_certificate_id: certificateId("c") }, "certificate_mismatch");
expectFailure({ expected_currentness_certificate_id: certificateId("d") }, "certificate_mismatch");
expectFailure({
  resolved_certificate_ids: resolvedCertificateIds.filter((id) => id !== rootCertificateId),
}, "evidence_linkage_mismatch");
expectFailure({
  resolved_certificate_ids: resolvedCertificateIds.filter((id) => id !== currentnessCertificateId),
}, "evidence_linkage_mismatch");
expectFailure({
  resolved_certificate_ids: resolvedCertificateIds.filter(
    (id) => id !== packet.entries[0].evidence_certificate_ids[0],
  ),
}, "evidence_linkage_mismatch");
expectFailure({ resolved_certificate_ids: [] }, "invalid_input");
expectFailure({
  resolved_certificate_ids: [rootCertificateId, rootCertificateId],
}, "invalid_input");
expectFailure({
  expected_root_certificate_issued_at: "2026-07-19T20:00:00.001Z",
}, "receipt_chronology_invalid");
expectFailure({
  expected_currentness_certificate_issued_at: "2026-07-19T20:00:00.001Z",
}, "receipt_chronology_invalid");
expectFailure({ verification_time: "2026-07-19T20:06:00.001Z" }, "receipt_stale");
expectFailure({ verification_time: "2026-07-19T19:59:58.999Z" }, "receipt_chronology_invalid");

const malformedProjectionTamper = structuredClone(created.receipt);
malformedProjectionTamper.entry_index[0].classification = "fixture.changed";
expectFailure({ receipt: malformedProjectionTamper }, "invalid_receipt");

const receiptProjectionTamper = structuredClone(malformedProjectionTamper);
receiptProjectionTamper.receipt_id = recomputeReceiptId(receiptProjectionTamper);
expectFailure({ receipt: receiptProjectionTamper }, "packet_projection_mismatch");

const receiptIdTamper = structuredClone(created.receipt);
receiptIdTamper.receipt_id = `rprr_${token("z")}`;
expectFailure({ receipt: receiptIdTamper }, "invalid_receipt");

const unapprovedIssuerPacket = structuredClone(packet);
unapprovedIssuerPacket.entries[0].issuer.component_id = "fixture.unapproved-checker";
unapprovedIssuerPacket.execution_digest = digestRiddleProofExecution(execution);
const unapprovedBytes = Buffer.from(JSON.stringify(unapprovedIssuerPacket), "utf8");
const unapprovedCreated = createRiddleProofPacketReceipt({
  private_packet_bytes: unapprovedBytes,
  opaque_reference_id: `rpar_${token("f")}`,
  execution,
  execution_policy: policy,
  evidence_trust_root: evidenceTrustRoot,
  checked_root_certificate_id: rootCertificateId,
  currentness_certificate_id: currentnessCertificateId,
  issued_at: "2026-07-19T20:00:00.000Z",
});
assert.equal(unapprovedCreated.ok, false);
if (unapprovedCreated.ok) throw new Error("unapproved issuer unexpectedly received a receipt");
assert.equal(unapprovedCreated.error.code, "execution_mismatch");

const unapprovedExecutionCreated = createRiddleProofPacketReceipt({
  private_packet_bytes: packetBytes,
  opaque_reference_id: `rpar_${token("i")}`,
  execution,
  execution_policy: { ...policy, allowed_runtime_ids: ["fixture.other-runtime"] },
  evidence_trust_root: evidenceTrustRoot,
  checked_root_certificate_id: rootCertificateId,
  currentness_certificate_id: currentnessCertificateId,
  issued_at: "2026-07-19T20:00:00.000Z",
});
assert.equal(unapprovedExecutionCreated.ok, false);
if (unapprovedExecutionCreated.ok) {
  throw new Error("unapproved execution unexpectedly received a receipt");
}
assert.equal(unapprovedExecutionCreated.error.code, "execution_mismatch");

const danglingEvidencePacket = structuredClone(packet);
danglingEvidencePacket.entries[0].evidence_certificate_ids = [certificateId("9")];
const danglingEvidenceBytes = Buffer.from(JSON.stringify(danglingEvidencePacket), "utf8");
const danglingEvidenceCreated = createRiddleProofPacketReceipt({
  private_packet_bytes: danglingEvidenceBytes,
  opaque_reference_id: `rpar_${token("h")}`,
  execution,
  execution_policy: policy,
  evidence_trust_root: evidenceTrustRoot,
  checked_root_certificate_id: rootCertificateId,
  currentness_certificate_id: currentnessCertificateId,
  issued_at: "2026-07-19T20:00:00.000Z",
});
assert.equal(danglingEvidenceCreated.ok, true);
if (!danglingEvidenceCreated.ok) throw new Error(danglingEvidenceCreated.error.message);
expectFailure({
  receipt: danglingEvidenceCreated.receipt,
  private_packet_bytes: danglingEvidenceBytes,
}, "evidence_linkage_mismatch");

const extraPacketField = { ...packet, workflow_meaning: "client-owned" };
assert.throws(() => digestRiddleProofPrivatePacketBytes(
  Buffer.from(JSON.stringify(extraPacketField), "utf8"),
));
const extraFieldCreation = createRiddleProofPacketReceipt({
  private_packet_bytes: Buffer.from(JSON.stringify(extraPacketField), "utf8"),
  opaque_reference_id: `rpar_${token("g")}`,
  execution,
  execution_policy: policy,
  evidence_trust_root: evidenceTrustRoot,
  checked_root_certificate_id: rootCertificateId,
  currentness_certificate_id: currentnessCertificateId,
  issued_at: "2026-07-19T20:00:00.000Z",
});
assert.equal(extraFieldCreation.ok, false);

process.stdout.write(`${JSON.stringify({
  ok: true,
  entry_count: verified.entry_count,
  hostile_cases: 24,
})}\n`);
