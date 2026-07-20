import { TextDecoder } from "node:util";

import type { RiddleProofEvidenceTrustRootRef } from "./evidence-trust-root";
import type { JsonValue } from "./json";
import {
  assertProtocolKeys,
  assertProtocolRecord,
  canonicalProtocolJson,
  protocolArray,
  protocolBytesSha256,
  protocolCode,
  protocolDigest,
  protocolField,
  protocolInteger,
  protocolOptionalField,
  protocolSha256,
  protocolString,
  protocolTimestamp,
  type ProtocolRecord,
} from "./protocol-internal";
import type { RiddleProofRuleTrustRootRef } from "./rule-trust-root";

export const RIDDLE_PROOF_PRIVATE_PACKET_VERSION =
  "riddle-proof.private-packet.v1" as const;
export const RIDDLE_PROOF_PACKET_RECEIPT_VERSION =
  "riddle-proof.packet-receipt.v1" as const;
export const RIDDLE_PROOF_PRIVATE_PACKET_MEDIA_TYPE =
  "application/vnd.riddle-proof.private-packet+json" as const;
export const RIDDLE_PROOF_PRIVATE_PACKET_DIGEST_DOMAIN =
  "riddle-proof.private-packet.v1\0" as const;
export const RIDDLE_PROOF_PACKET_RECEIPT_DIGEST_DOMAIN =
  "riddle-proof.packet-receipt.v1\0" as const;
export const RIDDLE_PROOF_EXECUTION_DIGEST_DOMAIN =
  "riddle-proof.execution.v1\0" as const;
export const RIDDLE_PROOF_EXECUTION_POLICY_VERSION =
  "riddle-proof.execution-policy.v1" as const;
export const RIDDLE_PROOF_EXECUTION_POLICY_DIGEST_DOMAIN =
  "riddle-proof.execution-policy.v1\0" as const;

export interface RiddleProofExecutionRef {
  execution_id: string;
  adapter_id: string;
  runtime_id: string;
  protocol_version: string;
  configuration_version: string;
  route_code: string;
  attempt_count: number;
  escalation_code?: string;
}

/** Independently pinned constraints for whichever producer a client uses. */
export interface RiddleProofExecutionPolicy {
  version: typeof RIDDLE_PROOF_EXECUTION_POLICY_VERSION;
  policy_id: string;
  policy_version: string;
  adapter_id: string;
  allowed_runtime_ids: [string, ...string[]];
  allowed_protocol_versions: [string, ...string[]];
  allowed_configuration_versions: [string, ...string[]];
  allowed_route_codes: [string, ...string[]];
  allowed_escalation_codes: string[];
  allow_no_escalation: boolean;
  max_attempt_count: number;
  deterministic_components: Array<{
    component_id: string;
    component_version: string;
  }>;
}

export type RiddleProofPacketEntryIssuer =
  | {
      kind: "deterministic";
      component_id: string;
      component_version: string;
    }
  | {
      kind: "execution";
      execution_id: string;
    };

/**
 * A content-free projection. Classification names are client-defined protocol
 * codes; core deliberately assigns no domain meaning to them.
 */
export interface RiddleProofPacketEntryProjection {
  entry_id: string;
  classification: string;
  issuer: RiddleProofPacketEntryIssuer;
  evidence_certificate_ids: string[];
  blocking: boolean;
}

export interface RiddleProofPrivatePacketEntry
  extends RiddleProofPacketEntryProjection {
  content: JsonValue;
}

/**
 * A generic private payload owned by a consuming application. Core parses it
 * only to bind its exact bytes and content-free projection into a receipt.
 */
export interface RiddleProofPrivatePacket {
  version: typeof RIDDLE_PROOF_PRIVATE_PACKET_VERSION;
  packet_id: string;
  subject_id: string;
  subject_digest: string;
  rule_trust_root: RiddleProofRuleTrustRootRef;
  protocol_version: string;
  execution_digest: string;
  entries: [RiddleProofPrivatePacketEntry, ...RiddleProofPrivatePacketEntry[]];
}

export interface RiddleProofPrivatePacketRef {
  packet_id: string;
  media_type: typeof RIDDLE_PROOF_PRIVATE_PACKET_MEDIA_TYPE;
  byte_length: number;
  packet_digest: string;
  reference: { kind: "opaque"; id: string };
}

export interface RiddleProofPacketReceipt {
  version: typeof RIDDLE_PROOF_PACKET_RECEIPT_VERSION;
  receipt_id: string;
  subject_id: string;
  subject_digest: string;
  rule_trust_root: RiddleProofRuleTrustRootRef;
  evidence_trust_root: RiddleProofEvidenceTrustRootRef;
  packet: RiddleProofPrivatePacketRef;
  execution: RiddleProofExecutionRef;
  execution_digest: string;
  execution_policy_digest: string;
  entry_index: RiddleProofPacketEntryProjection[];
  checked_root_certificate_id: string;
  currentness_certificate_id: string;
  issued_at: string;
}

export interface CreateRiddleProofPacketReceiptInput {
  private_packet_bytes: Uint8Array;
  opaque_reference_id: string;
  execution: RiddleProofExecutionRef;
  /** Independently selected constraints applied before the receipt is issued. */
  execution_policy: RiddleProofExecutionPolicy;
  /** Selected by the consumer, not by the private packet producer. */
  evidence_trust_root: RiddleProofEvidenceTrustRootRef;
  checked_root_certificate_id: string;
  currentness_certificate_id: string;
  issued_at: string;
}

export interface VerifyRiddleProofPacketReceiptInput {
  receipt: unknown;
  private_packet_bytes: Uint8Array;
  expected_subject_id: string;
  expected_subject_digest: string;
  expected_rule_trust_root: RiddleProofRuleTrustRootRef;
  expected_evidence_trust_root: RiddleProofEvidenceTrustRootRef;
  expected_protocol_version: string;
  expected_root_certificate_id: string;
  expected_root_certificate_issued_at: string;
  expected_currentness_certificate_id: string;
  expected_currentness_certificate_issued_at: string;
  /** Derived by the consumer from the separately replayed checked closure. */
  resolved_certificate_ids: [string, ...string[]];
  execution_policy: RiddleProofExecutionPolicy;
  /** Explicit consumer clock; verification never reads ambient time. */
  verification_time: string;
  max_receipt_age_ms: number;
  max_future_skew_ms: number;
}

export type RiddleProofPacketErrorCode =
  | "invalid_input"
  | "invalid_private_packet"
  | "invalid_receipt"
  | "packet_digest_mismatch"
  | "packet_projection_mismatch"
  | "subject_mismatch"
  | "rule_trust_root_mismatch"
  | "evidence_trust_root_mismatch"
  | "execution_mismatch"
  | "certificate_mismatch"
  | "evidence_linkage_mismatch"
  | "receipt_stale"
  | "receipt_chronology_invalid";

export interface RiddleProofPacketError {
  code: RiddleProofPacketErrorCode;
  /** Fixed diagnostic text; private packet content is never interpolated. */
  message: string;
}

export type RiddleProofPacketReceiptCreationResult =
  | { ok: true; receipt: RiddleProofPacketReceipt }
  | { ok: false; error: RiddleProofPacketError };

export type RiddleProofPacketReceiptVerificationResult =
  | {
      ok: true;
      receipt_id: string;
      packet_id: string;
      subject_id: string;
      subject_digest: string;
      packet_digest: string;
      checked_root_certificate_id: string;
      currentness_certificate_id: string;
      entry_count: number;
      verified_at: string;
    }
  | { ok: false; error: RiddleProofPacketError };

const PACKET_ID_PATTERN = /^rpp_[A-Za-z0-9_-]{43}$/u;
const REFERENCE_ID_PATTERN = /^rpar_[A-Za-z0-9_-]{43}$/u;
const RECEIPT_ID_PATTERN = /^rprr_[A-Za-z0-9_-]{43}$/u;
const ENTRY_ID_PATTERN = /^rpe_[A-Za-z0-9_-]{43}$/u;
const CERTIFICATE_ID_PATTERN = /^rpsc_[0-9a-f]{64}$/u;
const EXECUTION_ID_PATTERN = /^rpex_[A-Za-z0-9_-]{43}$/u;
const MAX_PACKET_BYTES = 16 * 1024 * 1024;
const MAX_ENTRIES = 4096;
const MAX_CONTENT_NODES = 200_000;
const MAX_CONTENT_DEPTH = 64;

function fail(
  code: RiddleProofPacketErrorCode,
  message: string,
): { ok: false; error: RiddleProofPacketError } {
  return { ok: false, error: { code, message } };
}

function parseTrustRootRef(value: unknown, context: string): RiddleProofRuleTrustRootRef {
  assertProtocolRecord(value, context);
  assertProtocolKeys(value, ["trust_root_id", "trust_root_version", "bundle_digest"], [], context);
  return {
    trust_root_id: protocolCode(protocolField(value, "trust_root_id", context), `${context}.trust_root_id`),
    trust_root_version: protocolCode(
      protocolField(value, "trust_root_version", context),
      `${context}.trust_root_version`,
    ),
    bundle_digest: protocolDigest(
      protocolField(value, "bundle_digest", context),
      `${context}.bundle_digest`,
    ),
  };
}

function sameTrustRoot(
  left: RiddleProofRuleTrustRootRef,
  right: RiddleProofRuleTrustRootRef,
): boolean {
  return left.trust_root_id === right.trust_root_id
    && left.trust_root_version === right.trust_root_version
    && left.bundle_digest === right.bundle_digest;
}

function parseUniqueCodes(value: unknown, context: string, allowEmpty: boolean): string[] {
  const values = protocolArray(value, context, 256).map((entry, index) =>
    protocolCode(entry, `${context}[${index}]`));
  if (!allowEmpty && values.length === 0) throw new Error(`${context} must not be empty.`);
  if (new Set(values).size !== values.length) throw new Error(`${context} must not repeat values.`);
  return [...values].sort();
}

function parseExecution(value: unknown, context: string): RiddleProofExecutionRef {
  assertProtocolRecord(value, context);
  assertProtocolKeys(value, [
    "execution_id",
    "adapter_id",
    "runtime_id",
    "protocol_version",
    "configuration_version",
    "route_code",
    "attempt_count",
  ], ["escalation_code"], context);
  const escalation = protocolOptionalField(value, "escalation_code");
  return {
    execution_id: protocolString(
      protocolField(value, "execution_id", context),
      `${context}.execution_id`,
      48,
      EXECUTION_ID_PATTERN,
    ),
    adapter_id: protocolCode(protocolField(value, "adapter_id", context), `${context}.adapter_id`),
    runtime_id: protocolCode(protocolField(value, "runtime_id", context), `${context}.runtime_id`),
    protocol_version: protocolCode(
      protocolField(value, "protocol_version", context),
      `${context}.protocol_version`,
    ),
    configuration_version: protocolCode(
      protocolField(value, "configuration_version", context),
      `${context}.configuration_version`,
    ),
    route_code: protocolCode(protocolField(value, "route_code", context), `${context}.route_code`),
    attempt_count: protocolInteger(
      protocolField(value, "attempt_count", context),
      `${context}.attempt_count`,
      1,
      1024,
    ),
    ...(escalation === undefined
      ? {}
      : { escalation_code: protocolCode(escalation, `${context}.escalation_code`) }),
  };
}

function parseExecutionPolicy(value: unknown, context: string): RiddleProofExecutionPolicy {
  assertProtocolRecord(value, context);
  assertProtocolKeys(value, [
    "version",
    "policy_id",
    "policy_version",
    "adapter_id",
    "allowed_runtime_ids",
    "allowed_protocol_versions",
    "allowed_configuration_versions",
    "allowed_route_codes",
    "allowed_escalation_codes",
    "allow_no_escalation",
    "max_attempt_count",
    "deterministic_components",
  ], [], context);
  if (protocolField(value, "version", context) !== RIDDLE_PROOF_EXECUTION_POLICY_VERSION) {
    throw new Error(`${context}.version is unsupported.`);
  }
  const allowNoEscalation = protocolField(value, "allow_no_escalation", context);
  if (typeof allowNoEscalation !== "boolean") {
    throw new Error(`${context}.allow_no_escalation must be boolean.`);
  }
  const components = protocolArray(
    protocolField(value, "deterministic_components", context),
    `${context}.deterministic_components`,
    256,
  ).map((entry, index) => {
    const componentContext = `${context}.deterministic_components[${index}]`;
    assertProtocolRecord(entry, componentContext);
    assertProtocolKeys(entry, ["component_id", "component_version"], [], componentContext);
    return {
      component_id: protocolCode(
        protocolField(entry, "component_id", componentContext),
        `${componentContext}.component_id`,
      ),
      component_version: protocolCode(
        protocolField(entry, "component_version", componentContext),
        `${componentContext}.component_version`,
      ),
    };
  }).sort((left, right) => {
    const a = `${left.component_id}\0${left.component_version}`;
    const b = `${right.component_id}\0${right.component_version}`;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const componentKeys = components.map((entry) =>
    `${entry.component_id}\0${entry.component_version}`);
  if (new Set(componentKeys).size !== componentKeys.length) {
    throw new Error(`${context}.deterministic_components must not repeat values.`);
  }
  return {
    version: RIDDLE_PROOF_EXECUTION_POLICY_VERSION,
    policy_id: protocolCode(protocolField(value, "policy_id", context), `${context}.policy_id`),
    policy_version: protocolCode(
      protocolField(value, "policy_version", context),
      `${context}.policy_version`,
    ),
    adapter_id: protocolCode(protocolField(value, "adapter_id", context), `${context}.adapter_id`),
    allowed_runtime_ids: parseUniqueCodes(
      protocolField(value, "allowed_runtime_ids", context),
      `${context}.allowed_runtime_ids`,
      false,
    ) as [string, ...string[]],
    allowed_protocol_versions: parseUniqueCodes(
      protocolField(value, "allowed_protocol_versions", context),
      `${context}.allowed_protocol_versions`,
      false,
    ) as [string, ...string[]],
    allowed_configuration_versions: parseUniqueCodes(
      protocolField(value, "allowed_configuration_versions", context),
      `${context}.allowed_configuration_versions`,
      false,
    ) as [string, ...string[]],
    allowed_route_codes: parseUniqueCodes(
      protocolField(value, "allowed_route_codes", context),
      `${context}.allowed_route_codes`,
      false,
    ) as [string, ...string[]],
    allowed_escalation_codes: parseUniqueCodes(
      protocolField(value, "allowed_escalation_codes", context),
      `${context}.allowed_escalation_codes`,
      true,
    ),
    allow_no_escalation: allowNoEscalation,
    max_attempt_count: protocolInteger(
      protocolField(value, "max_attempt_count", context),
      `${context}.max_attempt_count`,
      1,
      1024,
    ),
    deterministic_components: components,
  };
}

export function digestRiddleProofExecution(execution: unknown): string {
  return protocolSha256(
    RIDDLE_PROOF_EXECUTION_DIGEST_DOMAIN,
    parseExecution(execution, "execution"),
  );
}

export function digestRiddleProofExecutionPolicy(policy: unknown): string {
  return protocolSha256(
    RIDDLE_PROOF_EXECUTION_POLICY_DIGEST_DOMAIN,
    parseExecutionPolicy(policy, "execution policy"),
  );
}

function parseCertificateId(value: unknown, context: string): string {
  return protocolString(value, context, 69, CERTIFICATE_ID_PATTERN);
}

function parseIssuer(value: unknown, context: string): RiddleProofPacketEntryIssuer {
  assertProtocolRecord(value, context);
  const kind = protocolField(value, "kind", context);
  if (kind === "deterministic") {
    assertProtocolKeys(value, ["kind", "component_id", "component_version"], [], context);
    return {
      kind,
      component_id: protocolCode(
        protocolField(value, "component_id", context),
        `${context}.component_id`,
      ),
      component_version: protocolCode(
        protocolField(value, "component_version", context),
        `${context}.component_version`,
      ),
    };
  }
  if (kind === "execution") {
    assertProtocolKeys(value, ["kind", "execution_id"], [], context);
    return {
      kind,
      execution_id: protocolString(
        protocolField(value, "execution_id", context),
        `${context}.execution_id`,
        48,
        EXECUTION_ID_PATTERN,
      ),
    };
  }
  throw new Error(`${context}.kind is unsupported.`);
}

function validatePrivateContent(value: unknown): asserts value is JsonValue {
  let nodes = 0;
  const ancestors = new Set<object>();
  const visit = (entry: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > MAX_CONTENT_NODES || depth > MAX_CONTENT_DEPTH) {
      throw new Error("Private packet content exceeds structural limits.");
    }
    if (entry === null || typeof entry === "boolean" || typeof entry === "string") return;
    if (typeof entry === "number" && Number.isFinite(entry)) return;
    if (typeof entry !== "object") throw new Error("Private packet content must be JSON data.");
    if (ancestors.has(entry)) throw new Error("Private packet content must not be cyclic.");
    ancestors.add(entry);
    if (Array.isArray(entry)) {
      for (const item of protocolArray(entry, "private packet content", MAX_CONTENT_NODES)) {
        visit(item, depth + 1);
      }
    } else {
      assertProtocolRecord(entry, "private packet content");
      for (const key of Reflect.ownKeys(entry)) {
        if (typeof key !== "string") throw new Error("Private packet content contains a symbol field.");
        const descriptor = Object.getOwnPropertyDescriptor(entry, key);
        if (!descriptor || !descriptor.enumerable || descriptor.get || descriptor.set) {
          throw new Error("Private packet content contains a non-data field.");
        }
        visit(descriptor.value, depth + 1);
      }
    }
    ancestors.delete(entry);
  };
  visit(value, 0);
}

function parseEntry(
  value: unknown,
  context: string,
  includeContent: boolean,
): RiddleProofPacketEntryProjection | RiddleProofPrivatePacketEntry {
  assertProtocolRecord(value, context);
  assertProtocolKeys(value, [
    "entry_id",
    "classification",
    "issuer",
    "evidence_certificate_ids",
    "blocking",
    ...(includeContent ? ["content"] : []),
  ], [], context);
  const certificateIds = protocolArray(
    protocolField(value, "evidence_certificate_ids", context),
    `${context}.evidence_certificate_ids`,
    256,
  ).map((entry, index) =>
    parseCertificateId(entry, `${context}.evidence_certificate_ids[${index}]`));
  if (new Set(certificateIds).size !== certificateIds.length) {
    throw new Error(`${context}.evidence_certificate_ids must not repeat values.`);
  }
  const blocking = protocolField(value, "blocking", context);
  if (typeof blocking !== "boolean") throw new Error(`${context}.blocking must be boolean.`);
  const projection: RiddleProofPacketEntryProjection = {
    entry_id: protocolString(
      protocolField(value, "entry_id", context),
      `${context}.entry_id`,
      47,
      ENTRY_ID_PATTERN,
    ),
    classification: protocolCode(
      protocolField(value, "classification", context),
      `${context}.classification`,
    ),
    issuer: parseIssuer(protocolField(value, "issuer", context), `${context}.issuer`),
    evidence_certificate_ids: certificateIds,
    blocking,
  };
  if (!includeContent) return projection;
  const content = protocolField(value, "content", context);
  validatePrivateContent(content);
  return { ...projection, content };
}

function decodePrivatePacket(bytes: Uint8Array): RiddleProofPrivatePacket {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_PACKET_BYTES) {
    throw new Error("Private packet bytes are invalid.");
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value = JSON.parse(text) as unknown;
  assertProtocolRecord(value, "private packet");
  assertProtocolKeys(value, [
    "version",
    "packet_id",
    "subject_id",
    "subject_digest",
    "rule_trust_root",
    "protocol_version",
    "execution_digest",
    "entries",
  ], [], "private packet");
  if (protocolField(value, "version", "private packet") !== RIDDLE_PROOF_PRIVATE_PACKET_VERSION) {
    throw new Error("Private packet version is unsupported.");
  }
  const entries = protocolArray(
    protocolField(value, "entries", "private packet"),
    "private packet.entries",
    MAX_ENTRIES,
  ).map((entry, index) =>
    parseEntry(entry, `private packet.entries[${index}]`, true)) as RiddleProofPrivatePacketEntry[];
  if (entries.length === 0) throw new Error("Private packet entries must not be empty.");
  const entryIds = entries.map((entry) => entry.entry_id);
  if (new Set(entryIds).size !== entryIds.length) throw new Error("Private packet entry IDs repeat.");
  return {
    version: RIDDLE_PROOF_PRIVATE_PACKET_VERSION,
    packet_id: protocolString(
      protocolField(value, "packet_id", "private packet"),
      "private packet.packet_id",
      47,
      PACKET_ID_PATTERN,
    ),
    subject_id: protocolCode(
      protocolField(value, "subject_id", "private packet"),
      "private packet.subject_id",
    ),
    subject_digest: protocolDigest(
      protocolField(value, "subject_digest", "private packet"),
      "private packet.subject_digest",
    ),
    rule_trust_root: parseTrustRootRef(
      protocolField(value, "rule_trust_root", "private packet"),
      "private packet.rule_trust_root",
    ),
    protocol_version: protocolCode(
      protocolField(value, "protocol_version", "private packet"),
      "private packet.protocol_version",
    ),
    execution_digest: protocolDigest(
      protocolField(value, "execution_digest", "private packet"),
      "private packet.execution_digest",
    ),
    entries: entries as [RiddleProofPrivatePacketEntry, ...RiddleProofPrivatePacketEntry[]],
  };
}

/** Validates the complete private-packet envelope before hashing its exact bytes. */
export function digestRiddleProofPrivatePacketBytes(bytes: Uint8Array): string {
  decodePrivatePacket(bytes);
  return protocolBytesSha256(RIDDLE_PROOF_PRIVATE_PACKET_DIGEST_DOMAIN, bytes);
}

function parsePacketRef(value: unknown, context: string): RiddleProofPrivatePacketRef {
  assertProtocolRecord(value, context);
  assertProtocolKeys(value, ["packet_id", "media_type", "byte_length", "packet_digest", "reference"], [], context);
  if (protocolField(value, "media_type", context) !== RIDDLE_PROOF_PRIVATE_PACKET_MEDIA_TYPE) {
    throw new Error(`${context}.media_type is unsupported.`);
  }
  const reference = protocolField(value, "reference", context);
  assertProtocolRecord(reference, `${context}.reference`);
  assertProtocolKeys(reference, ["kind", "id"], [], `${context}.reference`);
  if (protocolField(reference, "kind", `${context}.reference`) !== "opaque") {
    throw new Error(`${context}.reference.kind must be opaque.`);
  }
  return {
    packet_id: protocolString(protocolField(value, "packet_id", context), `${context}.packet_id`, 47, PACKET_ID_PATTERN),
    media_type: RIDDLE_PROOF_PRIVATE_PACKET_MEDIA_TYPE,
    byte_length: protocolInteger(protocolField(value, "byte_length", context), `${context}.byte_length`, 1, MAX_PACKET_BYTES),
    packet_digest: protocolDigest(protocolField(value, "packet_digest", context), `${context}.packet_digest`),
    reference: {
      kind: "opaque",
      id: protocolString(
        protocolField(reference, "id", `${context}.reference`),
        `${context}.reference.id`,
        48,
        REFERENCE_ID_PATTERN,
      ),
    },
  };
}

function parseReceipt(value: unknown): RiddleProofPacketReceipt {
  assertProtocolRecord(value, "packet receipt");
  assertProtocolKeys(value, [
    "version",
    "receipt_id",
    "subject_id",
    "subject_digest",
    "rule_trust_root",
    "evidence_trust_root",
    "packet",
    "execution",
    "execution_digest",
    "execution_policy_digest",
    "entry_index",
    "checked_root_certificate_id",
    "currentness_certificate_id",
    "issued_at",
  ], [], "packet receipt");
  if (protocolField(value, "version", "packet receipt") !== RIDDLE_PROOF_PACKET_RECEIPT_VERSION) {
    throw new Error("Packet receipt version is unsupported.");
  }
  const entryIndex = protocolArray(
    protocolField(value, "entry_index", "packet receipt"),
    "packet receipt.entry_index",
    MAX_ENTRIES,
  ).map((entry, index) =>
    parseEntry(entry, `packet receipt.entry_index[${index}]`, false)) as RiddleProofPacketEntryProjection[];
  if (entryIndex.length === 0) throw new Error("Packet receipt entry index must not be empty.");
  const entryIds = entryIndex.map((entry) => entry.entry_id);
  if (new Set(entryIds).size !== entryIds.length) throw new Error("Packet receipt entry IDs repeat.");
  return {
    version: RIDDLE_PROOF_PACKET_RECEIPT_VERSION,
    receipt_id: protocolString(
      protocolField(value, "receipt_id", "packet receipt"),
      "packet receipt.receipt_id",
      48,
      RECEIPT_ID_PATTERN,
    ),
    subject_id: protocolCode(protocolField(value, "subject_id", "packet receipt"), "packet receipt.subject_id"),
    subject_digest: protocolDigest(protocolField(value, "subject_digest", "packet receipt"), "packet receipt.subject_digest"),
    rule_trust_root: parseTrustRootRef(protocolField(value, "rule_trust_root", "packet receipt"), "packet receipt.rule_trust_root"),
    evidence_trust_root: parseTrustRootRef(protocolField(value, "evidence_trust_root", "packet receipt"), "packet receipt.evidence_trust_root"),
    packet: parsePacketRef(protocolField(value, "packet", "packet receipt"), "packet receipt.packet"),
    execution: parseExecution(protocolField(value, "execution", "packet receipt"), "packet receipt.execution"),
    execution_digest: protocolDigest(protocolField(value, "execution_digest", "packet receipt"), "packet receipt.execution_digest"),
    execution_policy_digest: protocolDigest(
      protocolField(value, "execution_policy_digest", "packet receipt"),
      "packet receipt.execution_policy_digest",
    ),
    entry_index: entryIndex,
    checked_root_certificate_id: parseCertificateId(
      protocolField(value, "checked_root_certificate_id", "packet receipt"),
      "packet receipt.checked_root_certificate_id",
    ),
    currentness_certificate_id: parseCertificateId(
      protocolField(value, "currentness_certificate_id", "packet receipt"),
      "packet receipt.currentness_certificate_id",
    ),
    issued_at: protocolTimestamp(protocolField(value, "issued_at", "packet receipt"), "packet receipt.issued_at"),
  };
}

function projectPacket(packet: RiddleProofPrivatePacket): RiddleProofPacketEntryProjection[] {
  return packet.entries.map(({ content: _content, ...projection }) => projection);
}

function receiptId(body: Omit<RiddleProofPacketReceipt, "receipt_id">): string {
  return `rprr_${Buffer.from(
    protocolSha256(RIDDLE_PROOF_PACKET_RECEIPT_DIGEST_DOMAIN, body).slice("sha256:".length),
    "hex",
  ).toString("base64url")}`;
}

export function createRiddleProofPacketReceipt(
  input: CreateRiddleProofPacketReceiptInput,
): RiddleProofPacketReceiptCreationResult {
  try {
    assertProtocolRecord(input, "packet receipt creation input");
    assertProtocolKeys(input, [
      "private_packet_bytes",
      "opaque_reference_id",
      "execution",
      "execution_policy",
      "evidence_trust_root",
      "checked_root_certificate_id",
      "currentness_certificate_id",
      "issued_at",
    ], [], "packet receipt creation input");
    const bytes = protocolField(input, "private_packet_bytes", "packet receipt creation input");
    if (!(bytes instanceof Uint8Array)) throw new Error("private_packet_bytes is invalid.");
    const packet = decodePrivatePacket(bytes);
    const execution = parseExecution(
      protocolField(input, "execution", "packet receipt creation input"),
      "packet receipt creation input.execution",
    );
    const executionPolicy = parseExecutionPolicy(
      protocolField(input, "execution_policy", "packet receipt creation input"),
      "packet receipt creation input.execution_policy",
    );
    const executionDigest = digestRiddleProofExecution(execution);
    const entryIndex = projectPacket(packet);
    if (packet.protocol_version !== execution.protocol_version
      || packet.execution_digest !== executionDigest
      || !executionAllowed(execution, entryIndex, executionPolicy)) {
      return fail(
        "execution_mismatch",
        "Private packet execution or issuer binding is outside the supplied execution policy.",
      );
    }
    const body: Omit<RiddleProofPacketReceipt, "receipt_id"> = {
      version: RIDDLE_PROOF_PACKET_RECEIPT_VERSION,
      subject_id: packet.subject_id,
      subject_digest: packet.subject_digest,
      rule_trust_root: packet.rule_trust_root,
      evidence_trust_root: parseTrustRootRef(
        protocolField(input, "evidence_trust_root", "packet receipt creation input"),
        "packet receipt creation input.evidence_trust_root",
      ),
      packet: {
        packet_id: packet.packet_id,
        media_type: RIDDLE_PROOF_PRIVATE_PACKET_MEDIA_TYPE,
        byte_length: bytes.byteLength,
        packet_digest: protocolBytesSha256(RIDDLE_PROOF_PRIVATE_PACKET_DIGEST_DOMAIN, bytes),
        reference: {
          kind: "opaque",
          id: protocolString(
            protocolField(input, "opaque_reference_id", "packet receipt creation input"),
            "packet receipt creation input.opaque_reference_id",
            48,
            REFERENCE_ID_PATTERN,
          ),
        },
      },
      execution,
      execution_digest: executionDigest,
      execution_policy_digest: digestRiddleProofExecutionPolicy(executionPolicy),
      entry_index: entryIndex,
      checked_root_certificate_id: parseCertificateId(
        protocolField(input, "checked_root_certificate_id", "packet receipt creation input"),
        "packet receipt creation input.checked_root_certificate_id",
      ),
      currentness_certificate_id: parseCertificateId(
        protocolField(input, "currentness_certificate_id", "packet receipt creation input"),
        "packet receipt creation input.currentness_certificate_id",
      ),
      issued_at: protocolTimestamp(
        protocolField(input, "issued_at", "packet receipt creation input"),
        "packet receipt creation input.issued_at",
      ),
    };
    return { ok: true, receipt: { ...body, receipt_id: receiptId(body) } };
  } catch {
    return fail("invalid_input", "Packet receipt creation input validation failed.");
  }
}

function executionAllowed(
  execution: RiddleProofExecutionRef,
  entries: RiddleProofPacketEntryProjection[],
  policy: RiddleProofExecutionPolicy,
): boolean {
  if (execution.adapter_id !== policy.adapter_id
    || !policy.allowed_runtime_ids.includes(execution.runtime_id)
    || !policy.allowed_protocol_versions.includes(execution.protocol_version)
    || !policy.allowed_configuration_versions.includes(execution.configuration_version)
    || !policy.allowed_route_codes.includes(execution.route_code)
    || execution.attempt_count > policy.max_attempt_count
    || (execution.escalation_code === undefined
      ? !policy.allow_no_escalation
      : !policy.allowed_escalation_codes.includes(execution.escalation_code))) {
    return false;
  }
  return entries.every((entry) => {
    const issuer = entry.issuer;
    if (issuer.kind === "execution") {
      return issuer.execution_id === execution.execution_id;
    }
    return policy.deterministic_components.some((component) =>
      component.component_id === issuer.component_id
      && component.component_version === issuer.component_version);
  });
}

export function verifyRiddleProofPacketReceipt(
  input: VerifyRiddleProofPacketReceiptInput,
): RiddleProofPacketReceiptVerificationResult {
  let raw: ProtocolRecord;
  let receipt: RiddleProofPacketReceipt;
  let packet: RiddleProofPrivatePacket;
  let bytes: Uint8Array;
  let expectedRule: RiddleProofRuleTrustRootRef;
  let expectedEvidence: RiddleProofEvidenceTrustRootRef;
  let policy: RiddleProofExecutionPolicy;
  let expectedSubjectId: string;
  let expectedSubjectDigest: string;
  let expectedProtocolVersion: string;
  let expectedRootCertificateId: string;
  let expectedRootCertificateIssuedAt: string;
  let expectedCurrentnessCertificateId: string;
  let expectedCurrentnessCertificateIssuedAt: string;
  let resolvedCertificateIds: string[];
  let verificationTime: string;
  let maxReceiptAgeMs: number;
  let maxFutureSkewMs: number;
  try {
    assertProtocolRecord(input, "packet receipt verification input");
    raw = input;
    assertProtocolKeys(raw, [
      "receipt",
      "private_packet_bytes",
      "expected_subject_id",
      "expected_subject_digest",
      "expected_rule_trust_root",
      "expected_evidence_trust_root",
      "expected_protocol_version",
      "expected_root_certificate_id",
      "expected_root_certificate_issued_at",
      "expected_currentness_certificate_id",
      "expected_currentness_certificate_issued_at",
      "resolved_certificate_ids",
      "execution_policy",
      "verification_time",
      "max_receipt_age_ms",
      "max_future_skew_ms",
    ], [], "packet receipt verification input");
    const rawBytes = protocolField(raw, "private_packet_bytes", "packet receipt verification input");
    if (!(rawBytes instanceof Uint8Array)) throw new Error("private_packet_bytes is invalid.");
    bytes = rawBytes;
    expectedSubjectId = protocolCode(
      protocolField(raw, "expected_subject_id", "packet receipt verification input"),
      "packet receipt verification input.expected_subject_id",
    );
    expectedSubjectDigest = protocolDigest(
      protocolField(raw, "expected_subject_digest", "packet receipt verification input"),
      "packet receipt verification input.expected_subject_digest",
    );
    expectedRule = parseTrustRootRef(
      protocolField(raw, "expected_rule_trust_root", "packet receipt verification input"),
      "packet receipt verification input.expected_rule_trust_root",
    );
    expectedEvidence = parseTrustRootRef(
      protocolField(raw, "expected_evidence_trust_root", "packet receipt verification input"),
      "packet receipt verification input.expected_evidence_trust_root",
    );
    expectedProtocolVersion = protocolCode(
      protocolField(raw, "expected_protocol_version", "packet receipt verification input"),
      "packet receipt verification input.expected_protocol_version",
    );
    expectedRootCertificateId = parseCertificateId(
      protocolField(raw, "expected_root_certificate_id", "packet receipt verification input"),
      "packet receipt verification input.expected_root_certificate_id",
    );
    expectedRootCertificateIssuedAt = protocolTimestamp(
      protocolField(raw, "expected_root_certificate_issued_at", "packet receipt verification input"),
      "packet receipt verification input.expected_root_certificate_issued_at",
    );
    expectedCurrentnessCertificateId = parseCertificateId(
      protocolField(raw, "expected_currentness_certificate_id", "packet receipt verification input"),
      "packet receipt verification input.expected_currentness_certificate_id",
    );
    expectedCurrentnessCertificateIssuedAt = protocolTimestamp(
      protocolField(raw, "expected_currentness_certificate_issued_at", "packet receipt verification input"),
      "packet receipt verification input.expected_currentness_certificate_issued_at",
    );
    resolvedCertificateIds = protocolArray(
      protocolField(raw, "resolved_certificate_ids", "packet receipt verification input"),
      "packet receipt verification input.resolved_certificate_ids",
      MAX_ENTRIES,
    ).map((entry, index) => parseCertificateId(
      entry,
      `packet receipt verification input.resolved_certificate_ids[${index}]`,
    ));
    if (resolvedCertificateIds.length === 0
      || new Set(resolvedCertificateIds).size !== resolvedCertificateIds.length) {
      throw new Error("resolved_certificate_ids must be a nonempty unique list.");
    }
    policy = parseExecutionPolicy(
      protocolField(raw, "execution_policy", "packet receipt verification input"),
      "packet receipt verification input.execution_policy",
    );
    verificationTime = protocolTimestamp(
      protocolField(raw, "verification_time", "packet receipt verification input"),
      "packet receipt verification input.verification_time",
    );
    maxReceiptAgeMs = protocolInteger(
      protocolField(raw, "max_receipt_age_ms", "packet receipt verification input"),
      "packet receipt verification input.max_receipt_age_ms",
      0,
      Number.MAX_SAFE_INTEGER,
    );
    maxFutureSkewMs = protocolInteger(
      protocolField(raw, "max_future_skew_ms", "packet receipt verification input"),
      "packet receipt verification input.max_future_skew_ms",
      0,
      Number.MAX_SAFE_INTEGER,
    );
  } catch {
    return fail("invalid_input", "Packet receipt verification input validation failed.");
  }
  try {
    receipt = parseReceipt(protocolField(raw, "receipt", "packet receipt verification input"));
  } catch {
    return fail("invalid_receipt", "Packet receipt validation failed.");
  }
  const { receipt_id: observedReceiptId, ...receiptBody } = receipt;
  if (observedReceiptId !== receiptId(receiptBody)) {
    return fail("invalid_receipt", "Packet receipt identity does not match its canonical body.");
  }
  try {
    packet = decodePrivatePacket(bytes);
  } catch {
    return fail("invalid_private_packet", "Private packet validation failed.");
  }
  const observedPacketDigest = protocolBytesSha256(RIDDLE_PROOF_PRIVATE_PACKET_DIGEST_DOMAIN, bytes);
  if (receipt.packet.byte_length !== bytes.byteLength
    || receipt.packet.packet_digest !== observedPacketDigest
    || receipt.packet.packet_id !== packet.packet_id) {
    return fail("packet_digest_mismatch", "Private packet bytes do not match the receipt.");
  }
  if (receipt.subject_id !== packet.subject_id
    || receipt.subject_digest !== packet.subject_digest
    || !sameTrustRoot(receipt.rule_trust_root, packet.rule_trust_root)
    || canonicalProtocolJson(receipt.entry_index) !== canonicalProtocolJson(projectPacket(packet))) {
    return fail("packet_projection_mismatch", "Private packet projection does not match the receipt.");
  }
  if (receipt.subject_id !== expectedSubjectId || receipt.subject_digest !== expectedSubjectDigest) {
    return fail("subject_mismatch", "Packet subject does not match the independent expectation.");
  }
  if (!sameTrustRoot(receipt.rule_trust_root, expectedRule)) {
    return fail("rule_trust_root_mismatch", "Packet rule trust root is not independently pinned.");
  }
  if (!sameTrustRoot(receipt.evidence_trust_root, expectedEvidence)) {
    return fail("evidence_trust_root_mismatch", "Packet evidence trust root is not independently pinned.");
  }
  const executionDigest = digestRiddleProofExecution(receipt.execution);
  const executionPolicyDigest = digestRiddleProofExecutionPolicy(policy);
  if (packet.execution_digest !== executionDigest
    || receipt.execution_digest !== executionDigest
    || receipt.execution_policy_digest !== executionPolicyDigest
    || packet.protocol_version !== expectedProtocolVersion
    || receipt.execution.protocol_version !== expectedProtocolVersion
    || !executionAllowed(receipt.execution, receipt.entry_index, policy)) {
    return fail("execution_mismatch", "Packet execution is outside the independent execution policy.");
  }
  if (receipt.checked_root_certificate_id !== expectedRootCertificateId
    || receipt.currentness_certificate_id !== expectedCurrentnessCertificateId) {
    return fail("certificate_mismatch", "Packet certificate bindings do not match independent expectations.");
  }
  const resolvedCertificateIdSet = new Set(resolvedCertificateIds);
  if (!resolvedCertificateIdSet.has(receipt.checked_root_certificate_id)
    || !resolvedCertificateIdSet.has(receipt.currentness_certificate_id)
    || receipt.entry_index.some((entry) => entry.evidence_certificate_ids.some(
      (certificateId) => !resolvedCertificateIdSet.has(certificateId),
    ))) {
    return fail(
      "evidence_linkage_mismatch",
      "Packet evidence links do not resolve through the independently replayed certificate set.",
    );
  }
  const verificationMs = Date.parse(verificationTime);
  const issuedMs = Date.parse(receipt.issued_at);
  if (issuedMs < Date.parse(expectedRootCertificateIssuedAt)
    || issuedMs < Date.parse(expectedCurrentnessCertificateIssuedAt)) {
    return fail(
      "receipt_chronology_invalid",
      "Packet receipt predates a certificate whose identity and issuance time were independently supplied.",
    );
  }
  if (issuedMs - verificationMs > maxFutureSkewMs) {
    return fail("receipt_chronology_invalid", "Packet receipt is beyond allowed future skew.");
  }
  if (verificationMs - issuedMs > maxReceiptAgeMs) {
    return fail("receipt_stale", "Packet receipt is outside the allowed age window.");
  }
  return {
    ok: true,
    receipt_id: receipt.receipt_id,
    packet_id: receipt.packet.packet_id,
    subject_id: receipt.subject_id,
    subject_digest: receipt.subject_digest,
    packet_digest: receipt.packet.packet_digest,
    checked_root_certificate_id: receipt.checked_root_certificate_id,
    currentness_certificate_id: receipt.currentness_certificate_id,
    entry_count: receipt.entry_index.length,
    verified_at: verificationTime,
  };
}
