import { TextDecoder } from "node:util";

import {
  assessRiddleProofCheckedMeaningClosure,
  matchRiddleProofCheckedMeaningClosure,
  RIDDLE_PROOF_CHECKED_MEANING_RULE_ENGINE,
  type RiddleProofCheckedMeaningClosure,
  type RiddleProofCheckedMeaningRuleRef,
  type RiddleProofCheckedMeaningRuleRegistration,
} from "./checked-meaning";
import { resolveRiddleProofRuleTrustRoot } from "./rule-trust-root";
import type { RiddleProofGroundedReplayContext } from "./grounded-evidence";
import type {
  RiddleProofGroundedReplayConfiguration,
} from "./grounded-evidence";
import {
  materializeRiddleProofEvidenceTrustProfile,
  resolveRiddleProofEvidenceTrustRoot,
  validateRiddleProofEvidenceObservationSchema,
  type RiddleProofEvidenceTrustProfile,
  type RiddleProofEvidenceTrustRootRef,
} from "./evidence-trust-root";
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
import {
  validateRiddleProofSemanticCertificateClosure,
  type RiddleProofSemanticCertificate,
  type RiddleProofSemanticScope,
} from "./semantic-certificate";

export const RIDDLE_PROOF_PRIVILEGED_REVIEW_PACKET_VERSION =
  "riddle-proof.privileged-review-packet.v1" as const;
export const RIDDLE_PROOF_REVIEW_PACKET_RECEIPT_VERSION =
  "riddle-proof.review-packet-receipt.v1" as const;
export const RIDDLE_PROOF_SNAPSHOT_CURRENTNESS_WITNESS_VERSION =
  "riddle-proof.snapshot-currentness-witness.v1" as const;
export const RIDDLE_PROOF_PACKET_COMPLETE_CLAIM_ID =
  "amendment-review-packet-complete" as const;
export const RIDDLE_PROOF_PACKET_COMPLETE_CLAIM_VERSION = "1" as const;
export const RIDDLE_PROOF_PRIVILEGED_PACKET_DIGEST_DOMAIN =
  "riddle-proof.privileged-review-packet.v1\0" as const;
export const RIDDLE_PROOF_REVIEW_PACKET_RECEIPT_DIGEST_DOMAIN =
  "riddle-proof.review-packet-receipt.v1\0" as const;
export const RIDDLE_PROOF_AGENT_EXECUTION_DIGEST_DOMAIN =
  "riddle-proof.agent-execution.v1\0" as const;
export const RIDDLE_PROOF_APPROVED_EXECUTION_POLICY_VERSION =
  "riddle-proof.approved-execution-policy.v1" as const;
export const RIDDLE_PROOF_APPROVED_EXECUTION_POLICY_DIGEST_DOMAIN =
  "riddle-proof.approved-execution-policy.v1\0" as const;

export const RIDDLE_PROOF_REVIEW_ASSERTION_CLASSIFICATIONS = [
  "document_observation",
  "deterministic_check",
  "agent_interpretation",
  "agent_proposal",
  "agent_uncertainty",
] as const;

export type RiddleProofReviewAssertionClassification =
  typeof RIDDLE_PROOF_REVIEW_ASSERTION_CLASSIFICATIONS[number];

export interface RiddleProofRuleTrustRootReference {
  trust_root_id: string;
  trust_root_version: string;
  bundle_digest: string;
}

export interface RiddleProofAgentExecutionRef {
  execution_id: string;
  provider_adapter_id: string;
  model_id: string;
  protocol_version: string;
  prompt_version: string;
  routing_decision_code: string;
  attempt_count: number;
  escalation_reason_code?: string;
}

export interface RiddleProofApprovedExecutionPolicy {
  version: typeof RIDDLE_PROOF_APPROVED_EXECUTION_POLICY_VERSION;
  policy_id: string;
  policy_version: string;
  provider_adapter_id: string;
  allowed_model_ids: [string, ...string[]];
  allowed_protocol_versions: [string, ...string[]];
  allowed_prompt_versions: [string, ...string[]];
  allowed_routing_decision_codes: [string, ...string[]];
  allowed_escalation_reason_codes: string[];
  allow_no_escalation: boolean;
  max_attempt_count: number;
  deterministic_components: Array<{
    component_id: string;
    component_version: string;
  }>;
}

export type RiddleProofReviewAssertionIssuer =
  | {
      kind: "deterministic";
      component_id: string;
      component_version: string;
    }
  | {
      kind: "agent";
      execution_id: string;
    };

export interface RiddleProofReviewAssertionProjection {
  entry_id: string;
  classification: RiddleProofReviewAssertionClassification;
  issuer: RiddleProofReviewAssertionIssuer;
  evidence_certificate_ids: [string, ...string[]];
  blocking: boolean;
}

export interface RiddleProofPrivilegedReviewAssertion
  extends RiddleProofReviewAssertionProjection {
  /** Legal text and reasoning stay only in the privileged packet. */
  content: JsonValue;
}

export interface RiddleProofPrivilegedReviewPacket {
  version: typeof RIDDLE_PROOF_PRIVILEGED_REVIEW_PACKET_VERSION;
  packet_id: string;
  snapshot_id: string;
  manifest_digest: string;
  rule_trust_root: RiddleProofRuleTrustRootReference;
  protocol_version: string;
  execution_metadata_digest: string;
  assertions: RiddleProofPrivilegedReviewAssertion[];
  /** Exact IDs of every agent_uncertainty assertion, including an empty list. */
  uncertainty_entry_ids: string[];
}

export interface RiddleProofPrivilegedPacketRef {
  packet_id: string;
  media_type: "application/vnd.riddle-proof.privileged-review+json";
  byte_length: number;
  packet_digest: string;
  reference: { kind: "opaque"; id: string };
}

export interface RiddleProofReviewPacketReceipt {
  version: typeof RIDDLE_PROOF_REVIEW_PACKET_RECEIPT_VERSION;
  receipt_id: string;
  snapshot_id: string;
  manifest_digest: string;
  rule_trust_root: RiddleProofRuleTrustRootReference;
  evidence_trust_root: RiddleProofEvidenceTrustRootRef;
  packet: RiddleProofPrivilegedPacketRef;
  execution: RiddleProofAgentExecutionRef;
  execution_metadata_digest: string;
  assertion_index: RiddleProofReviewAssertionProjection[];
  uncertainty_entry_ids: string[];
  checked_root_certificate_id: string;
  currentness_certificate_id: string;
  issued_at: string;
}

export interface RiddleProofSnapshotCurrentnessWitness {
  version: typeof RIDDLE_PROOF_SNAPSHOT_CURRENTNESS_WITNESS_VERSION;
  status: "current";
  expected_snapshot_id: string;
  expected_manifest_digest: string;
  observed_snapshot_id: string;
  observed_manifest_digest: string;
  checked_at: string;
  certificate_id: string;
}

export interface CreateRiddleProofReviewPacketReceiptInput {
  privileged_packet_bytes: Uint8Array;
  opaque_reference_id: string;
  execution: RiddleProofAgentExecutionRef;
  checked_root_certificate_id: string;
  currentness_certificate_id: string;
  /** Pinned by the deterministic workbench, never selected from packet bytes. */
  evidence_trust_root: RiddleProofEvidenceTrustRootRef;
  issued_at: string;
}

export interface VerifyRiddleProofReviewPacketInput {
  receipt: unknown;
  privileged_packet_bytes: Uint8Array;
  checked_closure: unknown;
  evidence_trust_root_bundle: unknown;
  expected_evidence_trust_root: RiddleProofEvidenceTrustRootRef;
  /** Complete bundle resolved again inside verification against the pinned ref. */
  rule_trust_root_bundle: unknown;
  expected_rule_trust_root: RiddleProofRuleTrustRootReference;
  expected_scope: RiddleProofSemanticScope;
  expected_root_certificate_id: string;
  expected_packet_complete_rule: RiddleProofCheckedMeaningRuleRef;
  expected_protocol_version: string;
  approved_execution_policy: RiddleProofApprovedExecutionPolicy;
  currentness_witness: unknown;
  /** Explicit consumer clock; verification never reads ambient time. */
  verification_time: string;
  max_grounded_age_ms: number;
  max_currentness_age_ms: number;
  max_future_skew_ms: number;
}

export type RiddleProofReviewPacketErrorCode =
  | "invalid_input"
  | "invalid_privileged_packet"
  | "invalid_receipt"
  | "packet_digest_mismatch"
  | "packet_projection_mismatch"
  | "rule_trust_root_mismatch"
  | "evidence_trust_root_mismatch"
  | "execution_mismatch"
  | "receipt_chronology_invalid"
  | "currentness_invalid"
  | "currentness_stale"
  | "checked_closure_invalid"
  | "checked_closure_stale"
  | "checked_root_mismatch"
  | "evidence_unresolved";

export interface RiddleProofReviewPacketError {
  code: RiddleProofReviewPacketErrorCode;
  /** Fixed diagnostic category; never contains privileged packet content. */
  message: string;
}

export type RiddleProofReviewPacketReceiptCreationResult =
  | {
      ok: true;
      receipt: RiddleProofReviewPacketReceipt;
      privileged_packet: RiddleProofPrivilegedReviewPacket;
    }
  | { ok: false; error: RiddleProofReviewPacketError };

export type RiddleProofReviewPacketVerificationResult =
  | {
      ok: true;
      conclusion: typeof RIDDLE_PROOF_PACKET_COMPLETE_CLAIM_ID;
      receipt_id: string;
      packet_id: string;
      snapshot_id: string;
      packet_digest: string;
      checked_root_certificate_id: string;
      currentness_certificate_id: string;
      assertion_count: number;
      uncertainty_count: number;
      verified_at: string;
      /** This conclusion is procedural and never asserts legal correctness. */
      legal_correctness_established: false;
    }
  | { ok: false; error: RiddleProofReviewPacketError };

const PACKET_ID_PATTERN = /^rpp_[A-Za-z0-9_-]{43}$/u;
const PACKET_REFERENCE_PATTERN = /^rpar_[A-Za-z0-9_-]{43}$/u;
const RECEIPT_ID_PATTERN = /^rprr_[A-Za-z0-9_-]{43}$/u;
const SNAPSHOT_ID_PATTERN = /^rpds_[A-Za-z0-9_-]{43}$/u;
const CERTIFICATE_ID_PATTERN = /^rpsc_[0-9a-f]{64}$/u;
const EXECUTION_ID_PATTERN = /^rpex_[A-Za-z0-9_-]{43}$/u;
const ENTRY_ID_PATTERN = /^rpae_[A-Za-z0-9_-]{43}$/u;
const MAX_PACKET_BYTES = 16 * 1024 * 1024;
const MAX_ASSERTIONS = 4096;
const MAX_CONTENT_NODES = 200_000;

function fail(
  code: RiddleProofReviewPacketErrorCode,
  message: string,
): { ok: false; error: RiddleProofReviewPacketError } {
  return { ok: false, error: { code, message } };
}

function parseTrustRootRef(value: unknown, context: string): RiddleProofRuleTrustRootReference {
  assertProtocolRecord(value, context);
  assertProtocolKeys(
    value,
    ["trust_root_id", "trust_root_version", "bundle_digest"],
    [],
    context,
  );
  return {
    trust_root_id: protocolCode(protocolField(value, "trust_root_id", context), `${context}.trust_root_id`),
    trust_root_version: protocolCode(
      protocolField(value, "trust_root_version", context),
      `${context}.trust_root_version`,
    ),
    bundle_digest: protocolDigest(protocolField(value, "bundle_digest", context), `${context}.bundle_digest`),
  };
}

function sameTrustRoot(
  left: RiddleProofRuleTrustRootReference,
  right: RiddleProofRuleTrustRootReference,
): boolean {
  return left.trust_root_id === right.trust_root_id
    && left.trust_root_version === right.trust_root_version
    && left.bundle_digest === right.bundle_digest;
}

function parseExecution(value: unknown, context: string): RiddleProofAgentExecutionRef {
  assertProtocolRecord(value, context);
  assertProtocolKeys(value, [
    "execution_id",
    "provider_adapter_id",
    "model_id",
    "protocol_version",
    "prompt_version",
    "routing_decision_code",
    "attempt_count",
  ], ["escalation_reason_code"], context);
  const escalation = protocolOptionalField(value, "escalation_reason_code");
  return {
    execution_id: protocolString(
      protocolField(value, "execution_id", context),
      `${context}.execution_id`,
      48,
      EXECUTION_ID_PATTERN,
    ),
    provider_adapter_id: protocolCode(
      protocolField(value, "provider_adapter_id", context),
      `${context}.provider_adapter_id`,
    ),
    model_id: protocolCode(protocolField(value, "model_id", context), `${context}.model_id`),
    protocol_version: protocolCode(
      protocolField(value, "protocol_version", context),
      `${context}.protocol_version`,
    ),
    prompt_version: protocolCode(
      protocolField(value, "prompt_version", context),
      `${context}.prompt_version`,
    ),
    routing_decision_code: protocolCode(
      protocolField(value, "routing_decision_code", context),
      `${context}.routing_decision_code`,
    ),
    attempt_count: protocolInteger(
      protocolField(value, "attempt_count", context),
      `${context}.attempt_count`,
      1,
      1024,
    ),
    ...(escalation === undefined
      ? {}
      : { escalation_reason_code: protocolCode(escalation, `${context}.escalation_reason_code`) }),
  };
}

function parseUniqueCodeArray(
  value: unknown,
  context: string,
  allowEmpty: boolean,
): string[] {
  const values = protocolArray(value, context, 256).map((entry, index) =>
    protocolCode(entry, `${context}[${index}]`));
  if (!allowEmpty && values.length === 0) throw new Error(`${context} must not be empty.`);
  if (new Set(values).size !== values.length) throw new Error(`${context} must not contain duplicates.`);
  return [...values].sort();
}

function parseApprovedExecutionPolicy(
  value: unknown,
  context: string,
): RiddleProofApprovedExecutionPolicy {
  assertProtocolRecord(value, context);
  assertProtocolKeys(value, [
    "version",
    "policy_id",
    "policy_version",
    "provider_adapter_id",
    "allowed_model_ids",
    "allowed_protocol_versions",
    "allowed_prompt_versions",
    "allowed_routing_decision_codes",
    "allowed_escalation_reason_codes",
    "allow_no_escalation",
    "max_attempt_count",
    "deterministic_components",
  ], [], context);
  if (protocolField(value, "version", context) !== RIDDLE_PROOF_APPROVED_EXECUTION_POLICY_VERSION) {
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
    const leftKey = `${left.component_id}\0${left.component_version}`;
    const rightKey = `${right.component_id}\0${right.component_version}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  const componentKeys = components.map((entry) => `${entry.component_id}\0${entry.component_version}`);
  if (new Set(componentKeys).size !== componentKeys.length) {
    throw new Error(`${context}.deterministic_components must not contain duplicates.`);
  }
  return {
    version: RIDDLE_PROOF_APPROVED_EXECUTION_POLICY_VERSION,
    policy_id: protocolCode(protocolField(value, "policy_id", context), `${context}.policy_id`),
    policy_version: protocolCode(
      protocolField(value, "policy_version", context),
      `${context}.policy_version`,
    ),
    provider_adapter_id: protocolCode(
      protocolField(value, "provider_adapter_id", context),
      `${context}.provider_adapter_id`,
    ),
    allowed_model_ids: parseUniqueCodeArray(
      protocolField(value, "allowed_model_ids", context),
      `${context}.allowed_model_ids`,
      false,
    ) as [string, ...string[]],
    allowed_protocol_versions: parseUniqueCodeArray(
      protocolField(value, "allowed_protocol_versions", context),
      `${context}.allowed_protocol_versions`,
      false,
    ) as [string, ...string[]],
    allowed_prompt_versions: parseUniqueCodeArray(
      protocolField(value, "allowed_prompt_versions", context),
      `${context}.allowed_prompt_versions`,
      false,
    ) as [string, ...string[]],
    allowed_routing_decision_codes: parseUniqueCodeArray(
      protocolField(value, "allowed_routing_decision_codes", context),
      `${context}.allowed_routing_decision_codes`,
      false,
    ) as [string, ...string[]],
    allowed_escalation_reason_codes: parseUniqueCodeArray(
      protocolField(value, "allowed_escalation_reason_codes", context),
      `${context}.allowed_escalation_reason_codes`,
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

export function digestRiddleProofAgentExecution(execution: unknown): string {
  return protocolSha256(
    RIDDLE_PROOF_AGENT_EXECUTION_DIGEST_DOMAIN,
    parseExecution(execution, "agent execution"),
  );
}

export function digestRiddleProofApprovedExecutionPolicy(policy: unknown): string {
  return protocolSha256(
    RIDDLE_PROOF_APPROVED_EXECUTION_POLICY_DIGEST_DOMAIN,
    parseApprovedExecutionPolicy(policy, "approved execution policy"),
  );
}

function parseCertificateId(value: unknown, context: string): string {
  return protocolString(value, context, 69, CERTIFICATE_ID_PATTERN);
}

function parseCheckedMeaningRuleRef(
  value: unknown,
  context: string,
): RiddleProofCheckedMeaningRuleRef {
  assertProtocolRecord(value, context);
  assertProtocolKeys(
    value,
    ["rule_id", "rule_version", "engine", "implementation_digest"],
    [],
    context,
  );
  if (protocolField(value, "engine", context) !== RIDDLE_PROOF_CHECKED_MEANING_RULE_ENGINE) {
    throw new Error(`${context}.engine is unsupported.`);
  }
  return {
    rule_id: protocolCode(protocolField(value, "rule_id", context), `${context}.rule_id`),
    rule_version: protocolCode(
      protocolField(value, "rule_version", context),
      `${context}.rule_version`,
    ),
    engine: RIDDLE_PROOF_CHECKED_MEANING_RULE_ENGINE,
    implementation_digest: protocolDigest(
      protocolField(value, "implementation_digest", context),
      `${context}.implementation_digest`,
    ),
  };
}

function parseIssuer(
  value: unknown,
  classification: RiddleProofReviewAssertionClassification,
  context: string,
): RiddleProofReviewAssertionIssuer {
  assertProtocolRecord(value, context);
  const kind = protocolField(value, "kind", context);
  if (classification === "document_observation" || classification === "deterministic_check") {
    assertProtocolKeys(value, ["kind", "component_id", "component_version"], [], context);
    if (kind !== "deterministic") throw new Error(`${context} has an impermissible issuer/class pair.`);
    return {
      kind,
      component_id: protocolCode(protocolField(value, "component_id", context), `${context}.component_id`),
      component_version: protocolCode(
        protocolField(value, "component_version", context),
        `${context}.component_version`,
      ),
    };
  }
  if (
    classification === "agent_interpretation"
    || classification === "agent_proposal"
    || classification === "agent_uncertainty"
  ) {
    assertProtocolKeys(value, ["kind", "execution_id"], [], context);
    if (kind !== "agent") throw new Error(`${context} has an impermissible issuer/class pair.`);
    return {
      kind,
      execution_id: protocolCode(protocolField(value, "execution_id", context), `${context}.execution_id`),
    };
  }
  throw new Error(`${context} has an unsupported assertion classification.`);
}

function parseAssertionProjection(
  value: unknown,
  context: string,
  allowContent: boolean,
): RiddleProofReviewAssertionProjection | RiddleProofPrivilegedReviewAssertion {
  assertProtocolRecord(value, context);
  assertProtocolKeys(value, [
    "entry_id",
    "classification",
    "issuer",
    "evidence_certificate_ids",
    "blocking",
    ...(allowContent ? ["content"] : []),
  ], [], context);
  const classification = protocolString(
    protocolField(value, "classification", context),
    `${context}.classification`,
    64,
  );
  if (!(RIDDLE_PROOF_REVIEW_ASSERTION_CLASSIFICATIONS as readonly string[]).includes(classification)) {
    throw new Error(`${context}.classification is unsupported.`);
  }
  const evidenceValues = protocolArray(
    protocolField(value, "evidence_certificate_ids", context),
    `${context}.evidence_certificate_ids`,
    256,
  );
  if (evidenceValues.length === 0) throw new Error(`${context} must link at least one evidence certificate.`);
  const evidenceCertificateIds = evidenceValues.map((entry, index) =>
    parseCertificateId(entry, `${context}.evidence_certificate_ids[${index}]`));
  if (new Set(evidenceCertificateIds).size !== evidenceCertificateIds.length) {
    throw new Error(`${context} repeats an evidence certificate.`);
  }
  const blocking = protocolField(value, "blocking", context);
  if (typeof blocking !== "boolean") throw new Error(`${context}.blocking must be boolean.`);
  const projection: RiddleProofReviewAssertionProjection = {
    entry_id: protocolString(
      protocolField(value, "entry_id", context),
      `${context}.entry_id`,
      133,
      ENTRY_ID_PATTERN,
    ),
    classification: classification as RiddleProofReviewAssertionClassification,
    issuer: parseIssuer(
      protocolField(value, "issuer", context),
      classification as RiddleProofReviewAssertionClassification,
      `${context}.issuer`,
    ),
    evidence_certificate_ids: evidenceCertificateIds as [string, ...string[]],
    blocking,
  };
  if (!allowContent) return projection;
  const content = protocolField(value, "content", context) as JsonValue;
  validatePrivilegedContent(content);
  return { ...projection, content };
}

function validatePrivilegedContent(value: unknown): void {
  let nodes = 0;
  const ancestors = new Set<object>();
  const visit = (entry: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > MAX_CONTENT_NODES || depth > 64) {
      throw new Error("Privileged packet content exceeds structural limits.");
    }
    if (entry === null || typeof entry === "string" || typeof entry === "boolean") return;
    if (typeof entry === "number" && Number.isFinite(entry)) return;
    if (typeof entry !== "object") throw new Error("Privileged packet content must be JSON data.");
    if (ancestors.has(entry)) throw new Error("Privileged packet content must not be cyclic.");
    ancestors.add(entry);
    if (Array.isArray(entry)) {
      for (const item of protocolArray(entry, "privileged packet content", MAX_CONTENT_NODES)) {
        visit(item, depth + 1);
      }
    } else {
      assertProtocolRecord(entry, "privileged packet content");
      for (const key of Reflect.ownKeys(entry)) {
        if (typeof key !== "string") throw new Error("Privileged packet content contains a symbol field.");
        const descriptor = Object.getOwnPropertyDescriptor(entry, key);
        if (!descriptor || !descriptor.enumerable || descriptor.get || descriptor.set) {
          throw new Error("Privileged packet content contains a non-data field.");
        }
        visit(descriptor.value, depth + 1);
      }
    }
    ancestors.delete(entry);
  };
  visit(value, 0);
}

function parsePrivilegedPacket(bytes: Uint8Array): RiddleProofPrivilegedReviewPacket {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 2 || bytes.byteLength > MAX_PACKET_BYTES) {
    throw new Error("Privileged packet bytes are invalid.");
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value = JSON.parse(text) as unknown;
  assertProtocolRecord(value, "privileged packet");
  assertProtocolKeys(value, [
    "version",
    "packet_id",
    "snapshot_id",
    "manifest_digest",
    "rule_trust_root",
    "protocol_version",
    "execution_metadata_digest",
    "assertions",
    "uncertainty_entry_ids",
  ], [], "privileged packet");
  if (protocolField(value, "version", "privileged packet") !== RIDDLE_PROOF_PRIVILEGED_REVIEW_PACKET_VERSION) {
    throw new Error("Privileged packet version is unsupported.");
  }
  const assertionValues = protocolArray(
    protocolField(value, "assertions", "privileged packet"),
    "privileged packet.assertions",
    MAX_ASSERTIONS,
  );
  if (assertionValues.length === 0) throw new Error("Privileged packet assertions must not be empty.");
  const assertions = assertionValues.map((entry, index) =>
    parseAssertionProjection(entry, `privileged packet.assertions[${index}]`, true)) as
      RiddleProofPrivilegedReviewAssertion[];
  const entryIds = assertions.map((entry) => entry.entry_id);
  if (new Set(entryIds).size !== entryIds.length) throw new Error("Privileged packet repeats an entry ID.");
  const uncertaintyValues = protocolArray(
    protocolField(value, "uncertainty_entry_ids", "privileged packet"),
    "privileged packet.uncertainty_entry_ids",
    MAX_ASSERTIONS,
  );
  const uncertaintyEntryIds = uncertaintyValues.map((entry, index) =>
    protocolString(entry, `privileged packet.uncertainty_entry_ids[${index}]`, 133, ENTRY_ID_PATTERN));
  const classifiedUncertainties = assertions
    .filter((entry) => entry.classification === "agent_uncertainty")
    .map((entry) => entry.entry_id);
  if (canonicalProtocolJson(uncertaintyEntryIds) !== canonicalProtocolJson(classifiedUncertainties)) {
    throw new Error("Privileged packet must explicitly enumerate every uncertainty entry in assertion order.");
  }
  return {
    version: RIDDLE_PROOF_PRIVILEGED_REVIEW_PACKET_VERSION,
    packet_id: protocolString(
      protocolField(value, "packet_id", "privileged packet"),
      "privileged packet.packet_id",
      47,
      PACKET_ID_PATTERN,
    ),
    snapshot_id: protocolString(
      protocolField(value, "snapshot_id", "privileged packet"),
      "privileged packet.snapshot_id",
      48,
      SNAPSHOT_ID_PATTERN,
    ),
    manifest_digest: protocolDigest(
      protocolField(value, "manifest_digest", "privileged packet"),
      "privileged packet.manifest_digest",
    ),
    rule_trust_root: parseTrustRootRef(
      protocolField(value, "rule_trust_root", "privileged packet"),
      "privileged packet.rule_trust_root",
    ),
    protocol_version: protocolCode(
      protocolField(value, "protocol_version", "privileged packet"),
      "privileged packet.protocol_version",
    ),
    execution_metadata_digest: protocolDigest(
      protocolField(value, "execution_metadata_digest", "privileged packet"),
      "privileged packet.execution_metadata_digest",
    ),
    assertions,
    uncertainty_entry_ids: uncertaintyEntryIds,
  };
}

function parsePacketRef(value: unknown, context: string): RiddleProofPrivilegedPacketRef {
  assertProtocolRecord(value, context);
  assertProtocolKeys(value, [
    "packet_id", "media_type", "byte_length", "packet_digest", "reference",
  ], [], context);
  if (protocolField(value, "media_type", context)
    !== "application/vnd.riddle-proof.privileged-review+json") {
    throw new Error(`${context}.media_type is unsupported.`);
  }
  const reference = protocolField(value, "reference", context);
  assertProtocolRecord(reference, `${context}.reference`);
  assertProtocolKeys(reference, ["kind", "id"], [], `${context}.reference`);
  if (protocolField(reference, "kind", `${context}.reference`) !== "opaque") {
    throw new Error(`${context}.reference must be opaque.`);
  }
  return {
    packet_id: protocolString(protocolField(value, "packet_id", context), `${context}.packet_id`, 47, PACKET_ID_PATTERN),
    media_type: "application/vnd.riddle-proof.privileged-review+json",
    byte_length: protocolInteger(protocolField(value, "byte_length", context), `${context}.byte_length`, 2, MAX_PACKET_BYTES),
    packet_digest: protocolDigest(protocolField(value, "packet_digest", context), `${context}.packet_digest`),
    reference: {
      kind: "opaque",
      id: protocolString(
        protocolField(reference, "id", `${context}.reference`),
        `${context}.reference.id`,
        48,
        PACKET_REFERENCE_PATTERN,
      ),
    },
  };
}

function receiptBody(receipt: RiddleProofReviewPacketReceipt): Omit<RiddleProofReviewPacketReceipt, "receipt_id"> {
  const { receipt_id: _receiptId, ...body } = receipt;
  return body;
}

function receiptId(body: Omit<RiddleProofReviewPacketReceipt, "receipt_id">): string {
  const digest = protocolSha256(RIDDLE_PROOF_REVIEW_PACKET_RECEIPT_DIGEST_DOMAIN, body);
  return `rprr_${Buffer.from(digest.slice("sha256:".length), "hex").toString("base64url")}`;
}

function parseReceipt(value: unknown): RiddleProofReviewPacketReceipt {
  assertProtocolRecord(value, "review receipt");
  assertProtocolKeys(value, [
    "version",
    "receipt_id",
    "snapshot_id",
    "manifest_digest",
    "rule_trust_root",
    "evidence_trust_root",
    "packet",
    "execution",
    "execution_metadata_digest",
    "assertion_index",
    "uncertainty_entry_ids",
    "checked_root_certificate_id",
    "currentness_certificate_id",
    "issued_at",
  ], [], "review receipt");
  if (protocolField(value, "version", "review receipt") !== RIDDLE_PROOF_REVIEW_PACKET_RECEIPT_VERSION) {
    throw new Error("Review receipt version is unsupported.");
  }
  const assertionValues = protocolArray(
    protocolField(value, "assertion_index", "review receipt"),
    "review receipt.assertion_index",
    MAX_ASSERTIONS,
  );
  if (assertionValues.length === 0) throw new Error("Review receipt assertion index must not be empty.");
  const assertionIndex = assertionValues.map((entry, index) =>
    parseAssertionProjection(entry, `review receipt.assertion_index[${index}]`, false)) as
      RiddleProofReviewAssertionProjection[];
  const uncertaintyEntryIds = protocolArray(
    protocolField(value, "uncertainty_entry_ids", "review receipt"),
    "review receipt.uncertainty_entry_ids",
    MAX_ASSERTIONS,
  ).map((entry, index) =>
    protocolString(entry, `review receipt.uncertainty_entry_ids[${index}]`, 133, ENTRY_ID_PATTERN));
  const receipt: RiddleProofReviewPacketReceipt = {
    version: RIDDLE_PROOF_REVIEW_PACKET_RECEIPT_VERSION,
    receipt_id: protocolString(
      protocolField(value, "receipt_id", "review receipt"),
      "review receipt.receipt_id",
      48,
      RECEIPT_ID_PATTERN,
    ),
    snapshot_id: protocolString(
      protocolField(value, "snapshot_id", "review receipt"),
      "review receipt.snapshot_id",
      48,
      SNAPSHOT_ID_PATTERN,
    ),
    manifest_digest: protocolDigest(
      protocolField(value, "manifest_digest", "review receipt"),
      "review receipt.manifest_digest",
    ),
    rule_trust_root: parseTrustRootRef(
      protocolField(value, "rule_trust_root", "review receipt"),
      "review receipt.rule_trust_root",
    ),
    evidence_trust_root: parseTrustRootRef(
      protocolField(value, "evidence_trust_root", "review receipt"),
      "review receipt.evidence_trust_root",
    ),
    packet: parsePacketRef(protocolField(value, "packet", "review receipt"), "review receipt.packet"),
    execution: parseExecution(protocolField(value, "execution", "review receipt"), "review receipt.execution"),
    execution_metadata_digest: protocolDigest(
      protocolField(value, "execution_metadata_digest", "review receipt"),
      "review receipt.execution_metadata_digest",
    ),
    assertion_index: assertionIndex,
    uncertainty_entry_ids: uncertaintyEntryIds,
    checked_root_certificate_id: parseCertificateId(
      protocolField(value, "checked_root_certificate_id", "review receipt"),
      "review receipt.checked_root_certificate_id",
    ),
    currentness_certificate_id: parseCertificateId(
      protocolField(value, "currentness_certificate_id", "review receipt"),
      "review receipt.currentness_certificate_id",
    ),
    issued_at: protocolTimestamp(protocolField(value, "issued_at", "review receipt"), "review receipt.issued_at"),
  };
  if (receipt.receipt_id !== receiptId(receiptBody(receipt))) {
    throw new Error("Review receipt ID does not match its canonical body.");
  }
  return receipt;
}

function projectPacket(packet: RiddleProofPrivilegedReviewPacket): RiddleProofReviewAssertionProjection[] {
  return packet.assertions.map(({ content: _content, ...projection }) => projection);
}

export function createRiddleProofReviewPacketReceipt(
  input: CreateRiddleProofReviewPacketReceiptInput,
): RiddleProofReviewPacketReceiptCreationResult {
  try {
    assertProtocolRecord(input, "review receipt creation input");
    assertProtocolKeys(input, [
      "privileged_packet_bytes",
      "opaque_reference_id",
      "execution",
      "checked_root_certificate_id",
      "currentness_certificate_id",
      "evidence_trust_root",
      "issued_at",
    ], [], "review receipt creation input");
    const packet = parsePrivilegedPacket(
      protocolField(input, "privileged_packet_bytes", "review receipt creation input") as Uint8Array,
    );
    const execution = parseExecution(
      protocolField(input, "execution", "review receipt creation input"),
      "review receipt creation input.execution",
    );
    for (const assertion of packet.assertions) {
      if (assertion.issuer.kind === "agent" && assertion.issuer.execution_id !== execution.execution_id) {
        throw new Error("Agent assertion execution does not match the recorded execution.");
      }
    }
    if (packet.protocol_version !== execution.protocol_version) {
      throw new Error("Packet and execution protocol versions differ.");
    }
    const executionMetadataDigest = digestRiddleProofAgentExecution(execution);
    if (packet.execution_metadata_digest !== executionMetadataDigest) {
      throw new Error("Packet does not bind the exact recorded execution metadata.");
    }
    const bytes = input.privileged_packet_bytes;
    const body: Omit<RiddleProofReviewPacketReceipt, "receipt_id"> = {
      version: RIDDLE_PROOF_REVIEW_PACKET_RECEIPT_VERSION,
      snapshot_id: packet.snapshot_id,
      manifest_digest: packet.manifest_digest,
      rule_trust_root: packet.rule_trust_root,
      evidence_trust_root: parseTrustRootRef(
        protocolField(input, "evidence_trust_root", "review receipt creation input"),
        "review receipt creation input.evidence_trust_root",
      ),
      packet: {
        packet_id: packet.packet_id,
        media_type: "application/vnd.riddle-proof.privileged-review+json",
        byte_length: bytes.byteLength,
        packet_digest: protocolBytesSha256(RIDDLE_PROOF_PRIVILEGED_PACKET_DIGEST_DOMAIN, bytes),
        reference: {
          kind: "opaque",
          id: protocolString(
            protocolField(input, "opaque_reference_id", "review receipt creation input"),
            "review receipt creation input.opaque_reference_id",
            48,
            PACKET_REFERENCE_PATTERN,
          ),
        },
      },
      execution,
      execution_metadata_digest: executionMetadataDigest,
      assertion_index: projectPacket(packet),
      uncertainty_entry_ids: packet.uncertainty_entry_ids,
      checked_root_certificate_id: parseCertificateId(
        protocolField(input, "checked_root_certificate_id", "review receipt creation input"),
        "review receipt creation input.checked_root_certificate_id",
      ),
      currentness_certificate_id: parseCertificateId(
        protocolField(input, "currentness_certificate_id", "review receipt creation input"),
        "review receipt creation input.currentness_certificate_id",
      ),
      issued_at: protocolTimestamp(
        protocolField(input, "issued_at", "review receipt creation input"),
        "review receipt creation input.issued_at",
      ),
    };
    return { ok: true, receipt: { ...body, receipt_id: receiptId(body) }, privileged_packet: packet };
  } catch {
    return fail(
      "invalid_input",
      "Review receipt creation failed; privileged packet content was not emitted.",
    );
  }
}

function parseCurrentnessWitness(value: unknown): RiddleProofSnapshotCurrentnessWitness {
  assertProtocolRecord(value, "currentness witness");
  assertProtocolKeys(value, [
    "version",
    "status",
    "expected_snapshot_id",
    "expected_manifest_digest",
    "observed_snapshot_id",
    "observed_manifest_digest",
    "checked_at",
    "certificate_id",
  ], [], "currentness witness");
  if (protocolField(value, "version", "currentness witness")
      !== RIDDLE_PROOF_SNAPSHOT_CURRENTNESS_WITNESS_VERSION
    || protocolField(value, "status", "currentness witness") !== "current") {
    throw new Error("Currentness witness does not establish a current snapshot.");
  }
  return {
    version: RIDDLE_PROOF_SNAPSHOT_CURRENTNESS_WITNESS_VERSION,
    status: "current",
    expected_snapshot_id: protocolString(
      protocolField(value, "expected_snapshot_id", "currentness witness"),
      "currentness witness.expected_snapshot_id",
      48,
      SNAPSHOT_ID_PATTERN,
    ),
    expected_manifest_digest: protocolDigest(
      protocolField(value, "expected_manifest_digest", "currentness witness"),
      "currentness witness.expected_manifest_digest",
    ),
    observed_snapshot_id: protocolString(
      protocolField(value, "observed_snapshot_id", "currentness witness"),
      "currentness witness.observed_snapshot_id",
      48,
      SNAPSHOT_ID_PATTERN,
    ),
    observed_manifest_digest: protocolDigest(
      protocolField(value, "observed_manifest_digest", "currentness witness"),
      "currentness witness.observed_manifest_digest",
    ),
    checked_at: protocolTimestamp(
      protocolField(value, "checked_at", "currentness witness"),
      "currentness witness.checked_at",
    ),
    certificate_id: parseCertificateId(
      protocolField(value, "certificate_id", "currentness witness"),
      "currentness witness.certificate_id",
    ),
  };
}

function deriveTrustedReplayContexts(
  checkedClosure: unknown,
  profiles: RiddleProofEvidenceTrustProfile[],
  expectedScope: RiddleProofSemanticScope,
): [RiddleProofGroundedReplayContext, ...RiddleProofGroundedReplayContext[]] {
  assertProtocolRecord(checkedClosure, "checked review closure");
  assertProtocolKeys(
    checkedClosure,
    ["version", "grounded_closure", "rule_bindings"],
    [],
    "checked review closure",
  );
  const groundedClosure = protocolField(
    checkedClosure,
    "grounded_closure",
    "checked review closure",
  );
  assertProtocolRecord(groundedClosure, "checked review closure.grounded_closure");
  assertProtocolKeys(
    groundedClosure,
    ["version", "closure", "groundings"],
    [],
    "checked review closure.grounded_closure",
  );
  const semanticClosureResult = validateRiddleProofSemanticCertificateClosure(
    protocolField(
      groundedClosure,
      "closure",
      "checked review closure.grounded_closure",
    ),
  );
  if (!semanticClosureResult.ok) throw new Error("semantic certificate closure is invalid");
  const certificates = new Map(
    semanticClosureResult.closure.certificates.map((certificate) => [
      certificate.certificate_id,
      certificate,
    ]),
  );
  const groundingValues = protocolArray(
    protocolField(
      groundedClosure,
      "groundings",
      "checked review closure.grounded_closure",
    ),
    "checked review closure.grounded_closure.groundings",
    4096,
  );
  if (groundingValues.length === 0) throw new Error("grounded closure has no groundings");
  const seenCertificateIds = new Set<string>();
  const contexts = groundingValues.map((grounding, index) => {
    const context = `checked review closure.grounded_closure.groundings[${index}]`;
    assertProtocolRecord(grounding, context);
    assertProtocolKeys(grounding, ["certificate_id", "bundle", "receipt"], [], context);
    const certificateId = parseCertificateId(
      protocolField(grounding, "certificate_id", context),
      `${context}.certificate_id`,
    );
    if (seenCertificateIds.has(certificateId)) throw new Error("grounding certificate is duplicated");
    seenCertificateIds.add(certificateId);
    const certificate = certificates.get(certificateId);
    if (!certificate) throw new Error("grounding certificate is absent from semantic closure");
    const matchingProfiles = profiles.filter((candidate) =>
      candidate.claim.claim_id === certificate.claim.claim_id
      && candidate.claim.claim_version === certificate.claim.claim_version);
    if (matchingProfiles.length !== 1) {
      throw new Error("grounded claim is absent from the independently pinned evidence profiles");
    }
    const profile = matchingProfiles[0];

    const bundle = protocolField(grounding, "bundle", context);
    assertProtocolRecord(bundle, `${context}.bundle`);
    const statement = protocolField(bundle, "statement", `${context}.bundle`);
    assertProtocolRecord(statement, `${context}.bundle.statement`);
    const nonce = protocolString(
      protocolField(statement, "nonce", `${context}.bundle.statement`),
      `${context}.bundle.statement.nonce`,
      128,
    );

    const receipt = protocolField(grounding, "receipt", context);
    assertProtocolRecord(receipt, `${context}.receipt`);
    const materialized = materializeRiddleProofEvidenceTrustProfile({
      profile,
      claim: certificate.claim,
      observation: protocolField(receipt, "observation", `${context}.receipt`),
      expected_scope: expectedScope,
    });
    if (!materialized.ok) {
      throw new Error("grounded claim cannot be materialized from its pinned evidence profile");
    }
    const observation = protocolField(receipt, "observation", `${context}.receipt`);
    const schemaValidation = validateRiddleProofEvidenceObservationSchema({
      schema: profile.observation_schema,
      observation,
      claim_parameters: certificate.claim.parameters ?? {},
    });
    if (!schemaValidation.ok) {
      throw new Error("grounded observation does not match the exact pinned content-free schema");
    }
    const expectedContractDescriptor = {
      contract_id: materialized.contract_registration.contract_id,
      contract_version: materialized.contract_registration.contract_version,
      implementation_digest: materialized.contract_registration.implementation_digest,
      trust_basis: materialized.contract_registration.trust_basis,
      label: materialized.contract_registration.label,
      claim: materialized.contract_registration.claim,
    };
    if (canonicalProtocolJson(protocolField(receipt, "contract", `${context}.receipt`))
      !== canonicalProtocolJson(expectedContractDescriptor)) {
      throw new Error("grounding receipt contract is not the deterministic pinned materialization");
    }
    const authority = materialized.replay_authority;
    const statementArtifacts = protocolArray(
      protocolField(statement, "artifacts", `${context}.bundle.statement`),
      `${context}.bundle.statement.artifacts`,
      256,
    );
    const pinnedArtifact = authority.verifier_registry[0].program.artifact;
    const exactAllowedArtifactRoles = authority.required_artifact_roles;
    if (
      statementArtifacts.length !== 1
      || exactAllowedArtifactRoles.length !== 1
      || exactAllowedArtifactRoles[0] !== pinnedArtifact.role
    ) {
      throw new Error(
        "grounded capture artifact count is not exactly allowed by the pinned evidence profile",
      );
    }
    const statementArtifact = statementArtifacts[0];
    const statementArtifactContext = `${context}.bundle.statement.artifacts[0]`;
    assertProtocolRecord(statementArtifact, statementArtifactContext);
    for (const [fieldName, expectedValue] of [
      ["artifact_id", pinnedArtifact.artifact_id],
      ["role", pinnedArtifact.role],
      ["media_type", pinnedArtifact.media_type],
    ] as const) {
      if (protocolString(
        protocolField(statementArtifact, fieldName, statementArtifactContext),
        `${statementArtifactContext}.${fieldName}`,
        256,
      ) !== expectedValue) {
        throw new Error(
          "grounded capture artifact identity is not exactly allowed by the pinned evidence profile",
        );
      }
    }
    const policy = protocolField(receipt, "policy", `${context}.receipt`);
    assertProtocolRecord(policy, `${context}.receipt.policy`);
    const expectedBundleId = protocolOptionalField(policy, "expected_bundle_id");
    const expectedStatementDigest = protocolOptionalField(policy, "expected_statement_digest");
    const replayConfiguration: RiddleProofGroundedReplayConfiguration = {
      policy: {
        expected_scope: expectedScope,
        expected_nonce: nonce,
        expected_collector: authority.expected_collector,
        expected_sensor: authority.expected_sensor,
        expected_verifier: authority.expected_verifier,
        expected_signer: authority.expected_signer,
        verification_time: protocolTimestamp(
          protocolField(policy, "verification_time", `${context}.receipt.policy`),
          `${context}.receipt.policy.verification_time`,
        ),
        max_capture_age_ms: protocolInteger(
          protocolField(policy, "max_capture_age_ms", `${context}.receipt.policy`),
          `${context}.receipt.policy.max_capture_age_ms`,
          0,
          Number.MAX_SAFE_INTEGER,
        ),
        max_future_skew_ms: protocolInteger(
          protocolField(policy, "max_future_skew_ms", `${context}.receipt.policy`),
          `${context}.receipt.policy.max_future_skew_ms`,
          0,
          Number.MAX_SAFE_INTEGER,
        ),
        required_artifact_roles: authority.required_artifact_roles,
        ...(expectedBundleId === undefined
          ? {}
          : {
              expected_bundle_id: protocolString(
                expectedBundleId,
                `${context}.receipt.policy.expected_bundle_id`,
                128,
              ),
            }),
        ...(expectedStatementDigest === undefined
          ? {}
          : {
              expected_statement_digest: protocolDigest(
                expectedStatementDigest,
                `${context}.receipt.policy.expected_statement_digest`,
              ),
            }),
      },
      trusted_signers: authority.trusted_signers,
      verifier_registry: authority.verifier_registry,
      contract_registry: authority.contract_registry,
      expected_contract: authority.expected_contract,
    };
    return { certificate_id: certificateId, ...replayConfiguration };
  });
  return contexts as [RiddleProofGroundedReplayContext, ...RiddleProofGroundedReplayContext[]];
}

export function verifyRiddleProofReviewPacket(
  input: VerifyRiddleProofReviewPacketInput,
): RiddleProofReviewPacketVerificationResult {
  let rawInput: ProtocolRecord;
  let receipt: RiddleProofReviewPacketReceipt;
  let packet: RiddleProofPrivilegedReviewPacket;
  let witness: RiddleProofSnapshotCurrentnessWitness;
  let verificationTime: string;
  let privilegedPacketBytes: Uint8Array;
  let expectedRuleTrustRoot: RiddleProofRuleTrustRootReference;
  let expectedEvidenceTrustRoot: RiddleProofEvidenceTrustRootRef;
  let expectedPacketCompleteRule: RiddleProofCheckedMeaningRuleRef;
  let approvedExecutionPolicy: RiddleProofApprovedExecutionPolicy;
  let approvedExecutionPolicyDigest: string;
  let expectedProtocolVersion: string;
  let expectedRootCertificateId: string;
  let maxGroundedAgeMs: number;
  let maxCurrentnessAgeMs: number;
  let maxFutureSkewMs: number;
  try {
    assertProtocolRecord(input, "review verification input");
    rawInput = input;
    assertProtocolKeys(rawInput, [
      "receipt",
      "privileged_packet_bytes",
      "checked_closure",
      "evidence_trust_root_bundle",
      "expected_evidence_trust_root",
      "rule_trust_root_bundle",
      "expected_rule_trust_root",
      "expected_scope",
      "expected_root_certificate_id",
      "expected_packet_complete_rule",
      "expected_protocol_version",
      "approved_execution_policy",
      "currentness_witness",
      "verification_time",
      "max_grounded_age_ms",
      "max_currentness_age_ms",
      "max_future_skew_ms",
    ], [], "review verification input");
    const packetBytes = protocolField(
      rawInput,
      "privileged_packet_bytes",
      "review verification input",
    );
    if (!(packetBytes instanceof Uint8Array)) {
      throw new Error("review verification input.privileged_packet_bytes is invalid.");
    }
    privilegedPacketBytes = packetBytes;
    expectedRuleTrustRoot = parseTrustRootRef(
      protocolField(rawInput, "expected_rule_trust_root", "review verification input"),
      "review verification input.expected_rule_trust_root",
    );
    expectedEvidenceTrustRoot = parseTrustRootRef(
      protocolField(rawInput, "expected_evidence_trust_root", "review verification input"),
      "review verification input.expected_evidence_trust_root",
    );
    expectedPacketCompleteRule = parseCheckedMeaningRuleRef(
      protocolField(rawInput, "expected_packet_complete_rule", "review verification input"),
      "review verification input.expected_packet_complete_rule",
    );
    approvedExecutionPolicy = parseApprovedExecutionPolicy(
      protocolField(rawInput, "approved_execution_policy", "review verification input"),
      "review verification input.approved_execution_policy",
    );
    approvedExecutionPolicyDigest = digestRiddleProofApprovedExecutionPolicy(approvedExecutionPolicy);
    expectedProtocolVersion = protocolCode(
      protocolField(rawInput, "expected_protocol_version", "review verification input"),
      "review verification input.expected_protocol_version",
    );
    expectedRootCertificateId = parseCertificateId(
      protocolField(rawInput, "expected_root_certificate_id", "review verification input"),
      "review verification input.expected_root_certificate_id",
    );
    verificationTime = protocolTimestamp(
      protocolField(rawInput, "verification_time", "review verification input"),
      "review verification input.verification_time",
    );
    maxGroundedAgeMs = protocolInteger(
      protocolField(rawInput, "max_grounded_age_ms", "review verification input"),
      "review verification input.max_grounded_age_ms",
      0,
      Number.MAX_SAFE_INTEGER,
    );
    maxCurrentnessAgeMs = protocolInteger(
      protocolField(rawInput, "max_currentness_age_ms", "review verification input"),
      "review verification input.max_currentness_age_ms",
      0,
      Number.MAX_SAFE_INTEGER,
    );
    maxFutureSkewMs = protocolInteger(
      protocolField(rawInput, "max_future_skew_ms", "review verification input"),
      "review verification input.max_future_skew_ms",
      0,
      Number.MAX_SAFE_INTEGER,
    );
  } catch {
    return fail("invalid_input", "Review verification input validation failed.");
  }
  try {
    receipt = parseReceipt(protocolField(rawInput, "receipt", "review verification input"));
  } catch {
    return fail("invalid_receipt", "Review receipt validation failed.");
  }
  try {
    packet = parsePrivilegedPacket(privilegedPacketBytes);
  } catch {
    return fail("invalid_privileged_packet", "Privileged review packet validation failed.");
  }
  try {
    witness = parseCurrentnessWitness(
      protocolField(rawInput, "currentness_witness", "review verification input"),
    );
  } catch {
    return fail("currentness_invalid", "Currentness witness validation failed.");
  }

  const packetDigest = protocolBytesSha256(
    RIDDLE_PROOF_PRIVILEGED_PACKET_DIGEST_DOMAIN,
    privilegedPacketBytes,
  );
  if (receipt.packet.byte_length !== privilegedPacketBytes.byteLength
    || receipt.packet.packet_digest !== packetDigest
    || receipt.packet.packet_id !== packet.packet_id) {
    return fail("packet_digest_mismatch", "Privileged packet bytes do not match the content-free receipt.");
  }
  if (receipt.snapshot_id !== packet.snapshot_id
    || receipt.manifest_digest !== packet.manifest_digest
    || !sameTrustRoot(receipt.rule_trust_root, packet.rule_trust_root)) {
    return fail("packet_projection_mismatch", "Privileged packet identity does not match its receipt projection.");
  }
  const verificationMs = Date.parse(verificationTime);
  const receiptIssuedMs = Date.parse(receipt.issued_at);
  if (receiptIssuedMs - verificationMs > maxFutureSkewMs) {
    return fail(
      "receipt_chronology_invalid",
      "Review receipt issuance is outside the explicit verification clock window.",
    );
  }
  const observedExecutionDigest = digestRiddleProofAgentExecution(receipt.execution);
  if (packet.execution_metadata_digest !== receipt.execution_metadata_digest
    || receipt.execution_metadata_digest !== observedExecutionDigest) {
    return fail("execution_mismatch", "Execution metadata does not match its packet binding.");
  }
  if (canonicalProtocolJson(receipt.assertion_index) !== canonicalProtocolJson(projectPacket(packet))
    || canonicalProtocolJson(receipt.uncertainty_entry_ids)
      !== canonicalProtocolJson(packet.uncertainty_entry_ids)) {
    return fail("packet_projection_mismatch", "Privileged packet assertions do not match their public projection.");
  }
  if (receipt.execution.protocol_version !== expectedProtocolVersion
    || packet.protocol_version !== expectedProtocolVersion) {
    return fail("execution_mismatch", "Execution protocol version is not independently expected.");
  }
  const execution = receipt.execution;
  if (execution.provider_adapter_id !== approvedExecutionPolicy.provider_adapter_id
    || !approvedExecutionPolicy.allowed_model_ids.includes(execution.model_id)
    || !approvedExecutionPolicy.allowed_protocol_versions.includes(execution.protocol_version)
    || !approvedExecutionPolicy.allowed_prompt_versions.includes(execution.prompt_version)
    || !approvedExecutionPolicy.allowed_routing_decision_codes.includes(
      execution.routing_decision_code,
    )
    || execution.attempt_count > approvedExecutionPolicy.max_attempt_count
    || (execution.escalation_reason_code === undefined
      ? !approvedExecutionPolicy.allow_no_escalation
      : !approvedExecutionPolicy.allowed_escalation_reason_codes.includes(
        execution.escalation_reason_code,
      ))) {
    return fail("execution_mismatch", "Execution metadata is outside the approved execution policy.");
  }
  for (const assertion of receipt.assertion_index) {
    const issuer = assertion.issuer;
    if (issuer.kind === "agent"
      && issuer.execution_id !== receipt.execution.execution_id) {
      return fail("execution_mismatch", "Agent assertion execution reference is unresolved.");
    }
    if (issuer.kind === "deterministic"
      && !approvedExecutionPolicy.deterministic_components.some((component) =>
        component.component_id === issuer.component_id
        && component.component_version === issuer.component_version)) {
      return fail("execution_mismatch", "Deterministic assertion issuer is outside the approved policy.");
    }
  }
  if (!sameTrustRoot(receipt.rule_trust_root, expectedRuleTrustRoot)) {
    return fail("rule_trust_root_mismatch", "Review packet rule trust root is not independently pinned.");
  }
  if (!sameTrustRoot(receipt.evidence_trust_root, expectedEvidenceTrustRoot)) {
    return fail(
      "evidence_trust_root_mismatch",
      "Review packet evidence trust root is not independently pinned.",
    );
  }
  const resolvedRuleTrust = resolveRiddleProofRuleTrustRoot({
    bundle: protocolField(rawInput, "rule_trust_root_bundle", "review verification input"),
    expected_trust_root: expectedRuleTrustRoot,
  });
  if (!resolvedRuleTrust.ok) {
    return fail(
      "rule_trust_root_mismatch",
      "Review packet rule bundle does not resolve against the independently pinned trust root.",
    );
  }
  const resolvedEvidenceTrust = resolveRiddleProofEvidenceTrustRoot({
    bundle: protocolField(rawInput, "evidence_trust_root_bundle", "review verification input"),
    expected_trust_root: expectedEvidenceTrustRoot,
  });
  if (!resolvedEvidenceTrust.ok) {
    return fail(
      "evidence_trust_root_mismatch",
      "Evidence trust bundle does not resolve against the independently pinned trust root.",
    );
  }
  const rootRuleIsPinned = resolvedRuleTrust.trusted_rules.some((rule) =>
    canonicalProtocolJson(rule) === canonicalProtocolJson(expectedPacketCompleteRule));
  if (!rootRuleIsPinned) {
    return fail(
      "rule_trust_root_mismatch",
      "Expected packet-complete rule is absent from the independently pinned rule bundle.",
    );
  }
  if (receipt.checked_root_certificate_id !== expectedRootCertificateId) {
    return fail("checked_root_mismatch", "Review receipt checked root is not independently expected.");
  }
  if (witness.expected_snapshot_id !== receipt.snapshot_id
    || witness.observed_snapshot_id !== receipt.snapshot_id
    || witness.expected_manifest_digest !== receipt.manifest_digest
    || witness.observed_manifest_digest !== receipt.manifest_digest
    || witness.certificate_id !== receipt.currentness_certificate_id) {
    return fail("currentness_invalid", "Currentness witness does not bind the exact reviewed snapshot.");
  }
  const checkedMs = Date.parse(witness.checked_at);
  if (verificationMs - checkedMs > maxCurrentnessAgeMs
    || checkedMs - verificationMs > maxFutureSkewMs) {
    return fail("currentness_stale", "Currentness witness is outside the explicit verification window.");
  }

  let replayContexts: [RiddleProofGroundedReplayContext, ...RiddleProofGroundedReplayContext[]];
  try {
    replayContexts = deriveTrustedReplayContexts(
      protocolField(rawInput, "checked_closure", "review verification input"),
      resolvedEvidenceTrust.trusted_profiles,
      protocolField(rawInput, "expected_scope", "review verification input") as
        RiddleProofSemanticScope,
    );
  } catch {
    return fail(
      "evidence_trust_root_mismatch",
      "Checked evidence does not resolve exclusively through the pinned evidence trust root.",
    );
  }

  const assessment = assessRiddleProofCheckedMeaningClosure({
    checked_closure: protocolField(rawInput, "checked_closure", "review verification input"),
    replay_contexts: replayContexts,
    rule_registry: resolvedRuleTrust.rule_registry,
    trusted_rules: resolvedRuleTrust.trusted_rules,
    consumption_time: verificationTime,
    max_grounded_age_ms: maxGroundedAgeMs,
    max_future_skew_ms: maxFutureSkewMs,
  });
  if (assessment.disposition === "stale") {
    return fail("checked_closure_stale", "Checked review closure contains stale grounded evidence.");
  }
  if (assessment.disposition !== "checked") {
    return fail("checked_closure_invalid", "Checked review closure replay failed.");
  }
  const expectedClaim = {
    claim_id: RIDDLE_PROOF_PACKET_COMPLETE_CLAIM_ID,
    claim_version: RIDDLE_PROOF_PACKET_COMPLETE_CLAIM_VERSION,
    parameters: {
      snapshot_id: receipt.snapshot_id,
      manifest_digest: receipt.manifest_digest,
      packet_digest: receipt.packet.packet_digest,
      rule_trust_root_digest: receipt.rule_trust_root.bundle_digest,
      protocol_version: receipt.execution.protocol_version,
      execution_metadata_digest: receipt.execution_metadata_digest,
      execution_policy_digest: approvedExecutionPolicyDigest,
    },
  };
  const matched = matchRiddleProofCheckedMeaningClosure({
    checked_closure: protocolField(rawInput, "checked_closure", "review verification input"),
    replay_contexts: replayContexts,
    rule_registry: resolvedRuleTrust.rule_registry,
    trusted_rules: resolvedRuleTrust.trusted_rules,
    expected_root_certificate_id: expectedRootCertificateId,
    expected_scope: protocolField(rawInput, "expected_scope", "review verification input") as
      RiddleProofSemanticScope,
    expected_claim: expectedClaim,
    expected_root_rule: expectedPacketCompleteRule,
  });
  if (!matched.ok) return fail("checked_root_mismatch", "Checked review root does not match the procedural claim.");

  if (Date.parse(matched.root_certificate.issued_at) > receiptIssuedMs) {
    return fail(
      "receipt_chronology_invalid",
      "Review receipt predates the exact checked root it records.",
    );
  }

  if (matched.root_certificate.derivation.kind !== "composition") {
    return fail("checked_root_mismatch", "Checked review root is not a packet composition.");
  }
  const directPremises = matched.root_certificate.derivation.premises;
  const expectedDirectPremiseClaims = [
    {
      claim_id: "local-document-snapshot-captured",
      claim_version: "1",
      parameters: {
        snapshot_id: receipt.snapshot_id,
        manifest_digest: receipt.manifest_digest,
      },
    },
    {
      claim_id: "local-document-required-roles-present",
      claim_version: "1",
      parameters: {
        snapshot_id: receipt.snapshot_id,
        manifest_digest: receipt.manifest_digest,
      },
    },
    {
      claim_id: "amendment-review-procedure-observed",
      claim_version: "1",
      parameters: expectedClaim.parameters,
    },
    {
      claim_id: "local-document-snapshot-current-at-check",
      claim_version: "1",
      parameters: {
        snapshot_id: receipt.snapshot_id,
        manifest_digest: receipt.manifest_digest,
        checked_at: witness.checked_at,
      },
    },
  ];
  if (directPremises.length !== expectedDirectPremiseClaims.length) {
    return fail(
      "checked_root_mismatch",
      "Checked review root does not contain exactly four direct procedural premises.",
    );
  }
  const mismatchedDirectPremiseIndex = directPremises.findIndex(
    (premise, index) => canonicalProtocolJson({
      claim_id: premise.claim.claim_id,
      claim_version: premise.claim.claim_version,
      parameters: premise.claim.parameters ?? {},
    }) !== canonicalProtocolJson(expectedDirectPremiseClaims[index]),
  );
  if (mismatchedDirectPremiseIndex === 3) {
    return fail(
      "currentness_invalid",
      "Review root currentness premise does not certify the exact currentness witness.",
    );
  }
  if (mismatchedDirectPremiseIndex !== -1) {
    return fail(
      "checked_root_mismatch",
      "Checked review root does not contain the exact four direct procedural premises.",
    );
  }
  if (directPremises[3].certificate_id !== receipt.currentness_certificate_id) {
    return fail(
      "currentness_invalid",
      "Currentness certificate is not the exact currentness premise consumed by the review root.",
    );
  }

  const certificateIds = new Set(
    (matched.checked_closure as RiddleProofCheckedMeaningClosure)
      .grounded_closure.closure.certificates.map((certificate) => certificate.certificate_id),
  );
  if (!certificateIds.has(receipt.currentness_certificate_id)) {
    return fail("evidence_unresolved", "Currentness certificate is absent from the checked closure.");
  }
  const certificates = (matched.checked_closure as RiddleProofCheckedMeaningClosure)
    .grounded_closure.closure.certificates;
  const expectedSnapshotClaim = {
    claim_id: "local-document-snapshot-captured",
    claim_version: "1",
    parameters: {
      snapshot_id: receipt.snapshot_id,
      manifest_digest: receipt.manifest_digest,
    },
  };
  const snapshotCertificate = certificates.find((certificate) =>
    certificate.claim.claim_id === expectedSnapshotClaim.claim_id
    && certificate.claim.claim_version === expectedSnapshotClaim.claim_version
    && canonicalProtocolJson(certificate.claim.parameters ?? {})
      === canonicalProtocolJson(expectedSnapshotClaim.parameters));
  if (!snapshotCertificate) {
    return fail("evidence_unresolved", "Exact reviewed snapshot certificate is absent from the checked closure.");
  }
  const currentnessCertificate = certificates.find((certificate) =>
    certificate.certificate_id === receipt.currentness_certificate_id);
  const expectedCurrentnessClaim = {
    snapshot_id: receipt.snapshot_id,
    manifest_digest: receipt.manifest_digest,
    checked_at: witness.checked_at,
  };
  if (!currentnessCertificate
    || currentnessCertificate.claim.claim_id !== "local-document-snapshot-current-at-check"
    || currentnessCertificate.claim.claim_version !== "1"
    || canonicalProtocolJson(currentnessCertificate.claim.parameters ?? {})
      !== canonicalProtocolJson(expectedCurrentnessClaim)
    || Date.parse(currentnessCertificate.issued_at) < checkedMs) {
    return fail(
      "currentness_invalid",
      "Currentness certificate does not certify the exact witness snapshot, digest, and check time.",
    );
  }
  for (const assertion of receipt.assertion_index) {
    if (assertion.evidence_certificate_ids.some((certificateId) => !certificateIds.has(certificateId))) {
      return fail("evidence_unresolved", "An assertion evidence reference is absent from the checked closure.");
    }
  }

  return {
    ok: true,
    conclusion: RIDDLE_PROOF_PACKET_COMPLETE_CLAIM_ID,
    receipt_id: receipt.receipt_id,
    packet_id: receipt.packet.packet_id,
    snapshot_id: receipt.snapshot_id,
    packet_digest: receipt.packet.packet_digest,
    checked_root_certificate_id: receipt.checked_root_certificate_id,
    currentness_certificate_id: receipt.currentness_certificate_id,
    assertion_count: receipt.assertion_index.length,
    uncertainty_count: receipt.uncertainty_entry_ids.length,
    verified_at: verificationTime,
    legal_correctness_established: false,
  };
}
