import { createHash, createPublicKey } from "node:crypto";

import {
  createRiddleProofGroundedDeclarativeJsonContract,
  createRiddleProofGroundedDeclarativeJsonVerifier,
  RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_ARTIFACTS,
  RIDDLE_PROOF_GROUNDED_DECLARATIVE_MAX_ASSERTIONS,
  type RiddleProofGroundedCollectorRef,
  type RiddleProofGroundedDeclarativeJsonContractDefinition,
  type RiddleProofGroundedDeclarativeJsonContractRegistration,
  type RiddleProofGroundedDeclarativeJsonVerifierDefinition,
  type RiddleProofGroundedDeclarativeJsonVerifierRegistration,
  type RiddleProofGroundedExpectedSigner,
  type RiddleProofGroundedSemanticContractRef,
  type RiddleProofGroundedSensorRef,
  type RiddleProofGroundedTrustedSigner,
  type RiddleProofGroundedVerifierRef,
} from "./grounded-evidence";
import type { JsonValue } from "./json";
import type {
  RiddleProofSemanticClaim,
  RiddleProofSemanticScope,
} from "./semantic-certificate";

export const RIDDLE_PROOF_EVIDENCE_TRUST_ROOT_MAX_PROFILES = 256;

export interface RiddleProofEvidenceTrustClaimRef {
  claim_id: string;
  claim_version: string;
}

type PlainRecord = Record<string, unknown>;

function safeErrorMessage(error: unknown): string {
  try {
    if (error instanceof Error) return String(error.message);
  } catch {
    // Hostile values are not inspected further.
  }
  return "unreadable validation error";
}

function isPlainRecord(value: unknown): value is PlainRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertOnlyKeys(
  record: PlainRecord,
  allowed: readonly string[],
  context: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== "string") throw new Error(`${context} contains a symbol field.`);
    if (!allowedSet.has(key)) throw new Error(`${context} contains unsupported field ${key}.`);
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (
      !descriptor
      || descriptor.enumerable !== true
      || descriptor.get !== undefined
      || descriptor.set !== undefined
    ) {
      throw new Error(`${context}.${key} must be an enumerable data field.`);
    }
  }
}

function field(record: PlainRecord, key: string, context: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) throw new Error(`${context}.${key} is required.`);
  if (
    descriptor.enumerable !== true
    || descriptor.get !== undefined
    || descriptor.set !== undefined
  ) {
    throw new Error(`${context}.${key} must be an enumerable data field.`);
  }
  return descriptor.value;
}

function optionalField(record: PlainRecord, key: string, context: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  return field(record, key, context);
}

function canonicalString(value: unknown, context: string, maxLength = 256): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
    || value.length > maxLength
  ) {
    throw new Error(`${context} must be a non-empty canonical string of at most ${maxLength} characters.`);
  }
  return value;
}

function protocolCode(value: unknown, context: string): string {
  const text = canonicalString(value, context);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/+~-]*$/u.test(text)) {
    throw new Error(`${context} must be a canonical protocol code.`);
  }
  return text;
}

function fullSha256(value: unknown, context: string): string {
  const text = canonicalString(value, context, 71);
  if (!/^sha256:[0-9a-f]{64}$/u.test(text)) {
    throw new Error(`${context} must be a full lowercase sha256 digest.`);
  }
  return text;
}

function denseArray(
  value: unknown,
  context: string,
  maxLength: number,
  allowEmpty = false,
): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(`${context} must be a plain array.`);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !Number.isSafeInteger(lengthDescriptor.value)) {
    throw new Error(`${context}.length must be a data field.`);
  }
  const length = lengthDescriptor.value as number;
  if (length === 0 && !allowEmpty) throw new Error(`${context} requires at least one entry.`);
  if (length > maxLength) throw new Error(`${context} exceeds ${maxLength} entries.`);
  const entries: Array<[number, unknown]> = [];
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/u.test(key)) {
      throw new Error(`${context} contains unsupported array field ${String(key)}.`);
    }
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index >= length) {
      throw new Error(`${context} contains an out-of-range array field.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor
      || descriptor.enumerable !== true
      || descriptor.get !== undefined
      || descriptor.set !== undefined
    ) {
      throw new Error(`${context}[${key}] must be an enumerable data field.`);
    }
    entries.push([index, descriptor.value]);
  }
  if (entries.length !== length) throw new Error(`${context} must not be sparse.`);
  entries.sort(([left], [right]) => left - right);
  return entries.map(([, entry]) => entry);
}

function canonicalJson(value: unknown, context: string, depth = 0): JsonValue {
  if (depth > 64) throw new Error(`${context} exceeds the maximum nesting depth.`);
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error(`${context} contains a non-canonical number.`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return denseArray(value, context, 65_536, true).map((entry, index) =>
      canonicalJson(entry, `${context}[${index}]`, depth + 1));
  }
  if (!isPlainRecord(value)) throw new Error(`${context} must contain only plain JSON data.`);
  const output: Record<string, JsonValue> = {};
  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    if (typeof key !== "string") throw new Error(`${context} contains a symbol field.`);
  }
  for (const key of (keys as string[]).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor
      || descriptor.enumerable !== true
      || descriptor.get !== undefined
      || descriptor.set !== undefined
    ) {
      throw new Error(`${context}.${key} must be an enumerable data field.`);
    }
    output[key] = canonicalJson(descriptor.value, `${context}.${key}`, depth + 1);
  }
  return output;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isPlainRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("value is not canonical JSON data");
  return encoded;
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function canonicalBase64(value: unknown, context: string): { encoded: string; bytes: Buffer } {
  const encoded = canonicalString(value, context, 24 * 1024);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) {
    throw new Error(`${context} must be canonical base64.`);
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0 || bytes.length > 16 * 1024 || bytes.toString("base64") !== encoded) {
    throw new Error(`${context} must contain canonical base64 within the key size limit.`);
  }
  return { encoded, bytes };
}

function parseClaim(value: unknown, context: string): RiddleProofEvidenceTrustClaimRef {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["claim_id", "claim_version"], context);
  return {
    claim_id: canonicalString(field(value, "claim_id", context), `${context}.claim_id`),
    claim_version: canonicalString(
      field(value, "claim_version", context),
      `${context}.claim_version`,
    ),
  };
}

function parseCollector(value: unknown, context: string): RiddleProofGroundedCollectorRef {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["collector_id", "collector_version", "implementation_digest"], context);
  return {
    collector_id: canonicalString(field(value, "collector_id", context), `${context}.collector_id`),
    collector_version: canonicalString(
      field(value, "collector_version", context),
      `${context}.collector_version`,
    ),
    implementation_digest: fullSha256(
      field(value, "implementation_digest", context),
      `${context}.implementation_digest`,
    ),
  };
}

function parseTrustedSigner(
  value: unknown,
  context: string,
): { trusted_signer: RiddleProofGroundedTrustedSigner; expected_signer: RiddleProofGroundedExpectedSigner } {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["key_id", "public_key_spki_base64"], context);
  const keyId = canonicalString(field(value, "key_id", context), `${context}.key_id`);
  const decoded = canonicalBase64(
    field(value, "public_key_spki_base64", context),
    `${context}.public_key_spki_base64`,
  );
  const publicKey = createPublicKey({ key: decoded.bytes, format: "der", type: "spki" });
  if (publicKey.asymmetricKeyType !== "ed25519") {
    throw new Error(`${context}.public_key_spki_base64 must contain an Ed25519 public key.`);
  }
  const canonicalDer = publicKey.export({ format: "der", type: "spki" });
  if (!decoded.bytes.equals(canonicalDer)) {
    throw new Error(`${context}.public_key_spki_base64 must contain canonical DER without trailing bytes.`);
  }
  return {
    trusted_signer: {
      key_id: keyId,
      public_key_spki_base64: decoded.encoded,
    },
    expected_signer: {
      key_id: keyId,
      public_key_spki_sha256: `sha256:${createHash("sha256").update(canonicalDer).digest("hex")}`,
    },
  };
}

function parseExpectedSigner(value: unknown, context: string): RiddleProofGroundedExpectedSigner {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["key_id", "public_key_spki_sha256"], context);
  return {
    key_id: canonicalString(field(value, "key_id", context), `${context}.key_id`),
    public_key_spki_sha256: fullSha256(
      field(value, "public_key_spki_sha256", context),
      `${context}.public_key_spki_sha256`,
    ),
  };
}

function parseRoles(value: unknown, context: string): [string, ...string[]] {
  const roles = denseArray(value, context, RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_ARTIFACTS)
    .map((entry, index) => canonicalString(entry, `${context}[${index}]`));
  roles.sort();
  for (let index = 1; index < roles.length; index += 1) {
    if (roles[index - 1] === roles[index]) {
      throw new Error(`${context} contains duplicate role ${roles[index]}.`);
    }
  }
  return roles as [string, ...string[]];
}

function createVerifierRegistration(
  definition: unknown,
  context: string,
): {
  registration: RiddleProofGroundedDeclarativeJsonVerifierRegistration;
  ref: RiddleProofGroundedVerifierRef;
} {
  // Clone first so functions, accessors, prototypes, symbols, and non-JSON data
  // are rejected before the fixed declarative constructor sees the value.
  const normalized = canonicalJson(definition, context);
  const created = createRiddleProofGroundedDeclarativeJsonVerifier(
    normalized as unknown as RiddleProofGroundedDeclarativeJsonVerifierDefinition,
  );
  if (!created.ok) throw new Error(`${context}: ${created.error.message}`);
  return { registration: created.registration, ref: created.verifier_ref };
}

function createContractRegistration(
  definition: unknown,
  context: string,
): {
  registration: RiddleProofGroundedDeclarativeJsonContractRegistration;
  ref: RiddleProofGroundedSemanticContractRef;
} {
  const normalized = canonicalJson(definition, context);
  const created = createRiddleProofGroundedDeclarativeJsonContract(
    normalized as unknown as RiddleProofGroundedDeclarativeJsonContractDefinition,
  );
  if (!created.ok) throw new Error(`${context}: ${created.error.message}`);
  return { registration: created.registration, ref: created.contract_ref };
}

function verifierRefFromRegistration(
  registration: RiddleProofGroundedDeclarativeJsonVerifierRegistration,
): RiddleProofGroundedVerifierRef {
  return {
    verifier_id: registration.verifier_id,
    verifier_version: registration.verifier_version,
    implementation_digest: registration.implementation_digest,
    trust_basis: registration.trust_basis,
  };
}

function parseVerifierRegistration(
  value: unknown,
  context: string,
): RiddleProofGroundedDeclarativeJsonVerifierRegistration {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(
    value,
    ["verifier_id", "verifier_version", "implementation_digest", "trust_basis", "program"],
    context,
  );
  const recreated = createVerifierRegistration({
    verifier_id: field(value, "verifier_id", context),
    verifier_version: field(value, "verifier_version", context),
    program: field(value, "program", context),
  }, context);
  const normalizedInput = canonicalJson(value, context);
  if (!sameJson(normalizedInput, recreated.registration)) {
    throw new Error(`${context} does not match its complete declarative verifier definition.`);
  }
  return recreated.registration;
}

function parseVerifierRef(value: unknown, context: string): RiddleProofGroundedVerifierRef {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(
    value,
    ["verifier_id", "verifier_version", "implementation_digest", "trust_basis"],
    context,
  );
  const normalized = canonicalJson(value, context);
  return normalized as unknown as RiddleProofGroundedVerifierRef;
}

function parseContractRegistration(
  value: unknown,
  context: string,
): RiddleProofGroundedDeclarativeJsonContractRegistration {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(
    value,
    [
      "contract_id",
      "contract_version",
      "implementation_digest",
      "trust_basis",
      "label",
      "claim",
      "program",
    ],
    context,
  );
  const recreated = createContractRegistration({
    contract_id: field(value, "contract_id", context),
    contract_version: field(value, "contract_version", context),
    label: field(value, "label", context),
    claim: field(value, "claim", context),
    program: field(value, "program", context),
  }, context);
  const normalizedInput = canonicalJson(value, context);
  if (!sameJson(normalizedInput, recreated.registration)) {
    throw new Error(`${context} does not match its complete declarative contract definition.`);
  }
  return recreated.registration;
}

// ---------------------------------------------------------------------------
// Reusable declarative-template authority
// ---------------------------------------------------------------------------

export const RIDDLE_PROOF_EVIDENCE_TRUST_ROOT_VERSION =
  "riddle-proof.evidence-trust-root.v1" as const;

export const RIDDLE_PROOF_EVIDENCE_TRUST_ROOT_DIGEST_DOMAIN =
  "riddle-proof.evidence-trust-root.v1\0" as const;

export const RIDDLE_PROOF_EVIDENCE_TEMPLATE_PROFILE_MODE =
  "declarative_template" as const;

export const RIDDLE_PROOF_EVIDENCE_SENSOR_TARGET_BINDING =
  "expected_scope.target" as const;

export type RiddleProofEvidenceJsonType =
  | "null"
  | "boolean"
  | "number"
  | "string"
  | "array"
  | "object";

export const RIDDLE_PROOF_EVIDENCE_OBSERVATION_SCHEMA_MAX_NODES = 4096;
export const RIDDLE_PROOF_EVIDENCE_OBSERVATION_SCHEMA_MAX_DEPTH = 32;
export const RIDDLE_PROOF_EVIDENCE_OBSERVATION_SCHEMA_MAX_PROPERTIES = 256;
export const RIDDLE_PROOF_EVIDENCE_OBSERVATION_SCHEMA_MAX_ARRAY_ITEMS = 256;

/**
 * A bounded, data-only schema for the exact content-free observation carried by
 * a trusted evidence profile. Arrays are tuples, not open-ended item schemas,
 * and objects reject every property not named here.
 */
export type RiddleProofEvidenceObservationSchema =
  | { kind: "literal"; value: null | boolean | number | string }
  | { kind: "claim_parameter"; parameter: string }
  | { kind: "sha256" }
  | { kind: "integer"; minimum: number; maximum: number }
  | {
      kind: "object";
      properties: Record<string, RiddleProofEvidenceObservationSchema>;
    }
  | {
      kind: "array";
      items: RiddleProofEvidenceObservationSchema[];
    };

export type RiddleProofEvidenceContractRequiredAssertion =
  | {
      op: "exists";
      source: "observation" | "scope";
      pointer: string;
    }
  | {
      op: "equals";
      source: "observation" | "scope";
      pointer: string;
      value: JsonValue;
    }
  | {
      op: "type_is";
      source: "observation" | "scope";
      pointer: string;
      type: RiddleProofEvidenceJsonType;
    };

export interface RiddleProofEvidenceClaimParameterBinding {
  parameter: string;
  observation_pointers: [string, ...string[]];
  allowed_json_types: [RiddleProofEvidenceJsonType, ...RiddleProofEvidenceJsonType[]];
}

export interface RiddleProofEvidenceContractTemplate {
  contract_id: string;
  contract_version: string;
  label: string;
  claim: {
    claim_id: string;
    claim_version: string;
    label: string;
  };
  required_assertions: [
    RiddleProofEvidenceContractRequiredAssertion,
    ...RiddleProofEvidenceContractRequiredAssertion[],
  ];
  parameter_bindings: [
    RiddleProofEvidenceClaimParameterBinding,
    ...RiddleProofEvidenceClaimParameterBinding[],
  ];
}

export interface RiddleProofEvidenceSensorTemplate {
  kind: RiddleProofGroundedSensorRef["kind"];
  name: string;
  version: string;
  metadata?: Record<string, JsonValue>;
  observed_target_binding: typeof RIDDLE_PROOF_EVIDENCE_SENSOR_TARGET_BINDING;
}

export interface RiddleProofEvidenceTrustProfileDefinition {
  mode: typeof RIDDLE_PROOF_EVIDENCE_TEMPLATE_PROFILE_MODE;
  profile_id: string;
  profile_version: string;
  collector: RiddleProofGroundedCollectorRef;
  sensor_template: RiddleProofEvidenceSensorTemplate;
  trusted_signer: RiddleProofGroundedTrustedSigner;
  verifier_definition: RiddleProofGroundedDeclarativeJsonVerifierDefinition;
  observation_schema: RiddleProofEvidenceObservationSchema;
  contract_template: RiddleProofEvidenceContractTemplate;
  required_artifact_roles: [string, ...string[]];
}

/** A run-independent profile resolved only from an independently pinned root. */
export interface RiddleProofEvidenceTrustProfile {
  mode: typeof RIDDLE_PROOF_EVIDENCE_TEMPLATE_PROFILE_MODE;
  profile_id: string;
  profile_version: string;
  claim: RiddleProofEvidenceTrustClaimRef;
  expected_collector: RiddleProofGroundedCollectorRef;
  sensor_template: RiddleProofEvidenceSensorTemplate;
  trusted_signer: RiddleProofGroundedTrustedSigner;
  expected_signer: RiddleProofGroundedExpectedSigner;
  verifier_registration: RiddleProofGroundedDeclarativeJsonVerifierRegistration;
  expected_verifier: RiddleProofGroundedVerifierRef;
  observation_schema: RiddleProofEvidenceObservationSchema;
  contract_template: RiddleProofEvidenceContractTemplate;
  required_artifact_roles: [string, ...string[]];
}

export interface RiddleProofEvidenceTrustRootBundle {
  version: typeof RIDDLE_PROOF_EVIDENCE_TRUST_ROOT_VERSION;
  trust_root_id: string;
  trust_root_version: string;
  profiles: [RiddleProofEvidenceTrustProfile, ...RiddleProofEvidenceTrustProfile[]];
}

export interface RiddleProofEvidenceTrustRootRef {
  trust_root_id: string;
  trust_root_version: string;
  bundle_digest: string;
}

export interface CreateRiddleProofEvidenceTrustRootInput {
  trust_root_id: string;
  trust_root_version: string;
  profile_templates: [unknown, ...unknown[]];
}

export interface ResolveRiddleProofEvidenceTrustRootInput {
  bundle: unknown;
  expected_trust_root: unknown;
}

export type RiddleProofEvidenceTrustRootErrorCode =
  | "invalid_input"
  | "invalid_profile_template"
  | "duplicate_profile"
  | "duplicate_claim"
  | "invalid_bundle"
  | "trust_root_mismatch";

export interface RiddleProofEvidenceTrustRootError {
  code: RiddleProofEvidenceTrustRootErrorCode;
  message: string;
}

export type RiddleProofEvidenceTrustRootCreationResult =
  | {
      ok: true;
      bundle: RiddleProofEvidenceTrustRootBundle;
      trust_root: RiddleProofEvidenceTrustRootRef;
    }
  | { ok: false; error: RiddleProofEvidenceTrustRootError };

export type RiddleProofEvidenceTrustRootResolutionResult =
  | {
      ok: true;
      bundle: RiddleProofEvidenceTrustRootBundle;
      trust_root: RiddleProofEvidenceTrustRootRef;
      trusted_profiles: [
        RiddleProofEvidenceTrustProfile,
        ...RiddleProofEvidenceTrustProfile[],
      ];
    }
  | { ok: false; error: RiddleProofEvidenceTrustRootError };

export interface MaterializeRiddleProofEvidenceTrustProfileInput {
  profile: unknown;
  claim: unknown;
  observation: unknown;
  expected_scope: unknown;
  /** When present, exact equality with the deterministic materialization is required. */
  actual_contract_registration?: unknown;
}

export interface ValidateRiddleProofEvidenceObservationSchemaInput {
  schema: unknown;
  observation: unknown;
  claim_parameters: unknown;
}

export type RiddleProofEvidenceObservationSchemaValidationResult =
  | {
      ok: true;
      schema: RiddleProofEvidenceObservationSchema;
      observation: JsonValue;
    }
  | { ok: false };

export interface RiddleProofMaterializedEvidenceReplayAuthority {
  expected_collector: RiddleProofGroundedCollectorRef;
  expected_sensor: RiddleProofGroundedSensorRef;
  trusted_signers: [RiddleProofGroundedTrustedSigner];
  expected_signer: RiddleProofGroundedExpectedSigner;
  verifier_registry: [RiddleProofGroundedDeclarativeJsonVerifierRegistration];
  expected_verifier: RiddleProofGroundedVerifierRef;
  contract_registry: [RiddleProofGroundedDeclarativeJsonContractRegistration];
  expected_contract: RiddleProofGroundedSemanticContractRef;
  required_artifact_roles: [string, ...string[]];
}

export type RiddleProofEvidenceMaterializationErrorCode =
  | "invalid_input"
  | "profile_mismatch"
  | "parameter_mismatch"
  | "observation_mismatch"
  | "contract_mismatch";

export interface RiddleProofEvidenceMaterializationError {
  code: RiddleProofEvidenceMaterializationErrorCode;
  message: string;
}

export type RiddleProofEvidenceMaterializationResult =
  | {
      ok: true;
      profile: RiddleProofEvidenceTrustProfile;
      claim: RiddleProofSemanticClaim;
      contract_definition: RiddleProofGroundedDeclarativeJsonContractDefinition;
      contract_registration: RiddleProofGroundedDeclarativeJsonContractRegistration;
      expected_contract: RiddleProofGroundedSemanticContractRef;
      replay_authority: RiddleProofMaterializedEvidenceReplayAuthority;
    }
  | { ok: false; error: RiddleProofEvidenceMaterializationError };

function templateFailure(
  code: RiddleProofEvidenceTrustRootErrorCode,
  message: string,
): { ok: false; error: RiddleProofEvidenceTrustRootError } {
  return { ok: false, error: { code, message } };
}

function materializationFailure(
  code: RiddleProofEvidenceMaterializationErrorCode,
  message: string,
): { ok: false; error: RiddleProofEvidenceMaterializationError } {
  return { ok: false, error: { code, message } };
}

function parseJsonPointer(value: unknown, context: string): string {
  if (typeof value !== "string" || value.length > 4096) {
    throw new Error(`${context} must be a JSON Pointer of at most 4096 characters.`);
  }
  if (value === "") return value;
  if (!value.startsWith("/")) throw new Error(`${context} must be empty or begin with /.`);
  const segments = value.slice(1).split("/");
  if (segments.length > 128) throw new Error(`${context} exceeds 128 segments.`);
  for (const [index, segment] of segments.entries()) {
    for (let offset = 0; offset < segment.length; offset += 1) {
      if (segment[offset] !== "~") continue;
      if (segment[offset + 1] !== "0" && segment[offset + 1] !== "1") {
        throw new Error(`${context} segment ${index} contains an invalid ~ escape.`);
      }
      offset += 1;
    }
  }
  return value;
}

function resolveJsonPointer(
  root: JsonValue | RiddleProofSemanticScope,
  pointer: string,
): { found: true; value: unknown } | { found: false } {
  let current: unknown = root;
  if (pointer === "") return { found: true, value: current };
  const segments = pointer.slice(1).split("/").map((segment) =>
    segment.replace(/~1/gu, "/").replace(/~0/gu, "~"));
  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/u.test(segment)) return { found: false };
      const index = Number(segment);
      if (!Number.isSafeInteger(index) || index >= current.length) return { found: false };
      current = current[index];
      continue;
    }
    if (!isPlainRecord(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return { found: false };
    }
    current = current[segment];
  }
  return { found: true, value: current };
}

function jsonType(value: unknown): RiddleProofEvidenceJsonType | undefined {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0)) return "number";
  if (typeof value === "string") return "string";
  if (isPlainRecord(value)) return "object";
  return undefined;
}

type ObservationSchemaParseState = { nodes: number };

function parseObservationSchema(
  value: unknown,
  context: string,
  state: ObservationSchemaParseState = { nodes: 0 },
  depth = 0,
): RiddleProofEvidenceObservationSchema {
  state.nodes += 1;
  if (state.nodes > RIDDLE_PROOF_EVIDENCE_OBSERVATION_SCHEMA_MAX_NODES) {
    throw new Error(
      `${context} exceeds ${RIDDLE_PROOF_EVIDENCE_OBSERVATION_SCHEMA_MAX_NODES} schema nodes.`,
    );
  }
  if (depth > RIDDLE_PROOF_EVIDENCE_OBSERVATION_SCHEMA_MAX_DEPTH) {
    throw new Error(
      `${context} exceeds schema depth ${RIDDLE_PROOF_EVIDENCE_OBSERVATION_SCHEMA_MAX_DEPTH}.`,
    );
  }
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  const kind = field(value, "kind", context);
  if (kind === "literal") {
    assertOnlyKeys(value, ["kind", "value"], context);
    const literal = field(value, "value", context);
    if (
      literal !== null
      && typeof literal !== "boolean"
      && typeof literal !== "string"
      && !(typeof literal === "number" && Number.isFinite(literal) && !Object.is(literal, -0))
    ) {
      throw new Error(`${context}.value must be a scalar canonical JSON value.`);
    }
    if (typeof literal === "string" && literal.length > 4096) {
      throw new Error(`${context}.value exceeds 4096 characters.`);
    }
    return { kind, value: literal as null | boolean | number | string };
  }
  if (kind === "claim_parameter") {
    assertOnlyKeys(value, ["kind", "parameter"], context);
    return {
      kind,
      parameter: protocolCode(field(value, "parameter", context), `${context}.parameter`),
    };
  }
  if (kind === "sha256") {
    assertOnlyKeys(value, ["kind"], context);
    return { kind };
  }
  if (kind === "integer") {
    assertOnlyKeys(value, ["kind", "minimum", "maximum"], context);
    const minimum = field(value, "minimum", context);
    const maximum = field(value, "maximum", context);
    if (
      !Number.isSafeInteger(minimum)
      || !Number.isSafeInteger(maximum)
      || (minimum as number) > (maximum as number)
    ) {
      throw new Error(`${context} must have ordered safe-integer bounds.`);
    }
    return { kind, minimum: minimum as number, maximum: maximum as number };
  }
  if (kind === "object") {
    assertOnlyKeys(value, ["kind", "properties"], context);
    const propertiesValue = field(value, "properties", context);
    if (!isPlainRecord(propertiesValue)) {
      throw new Error(`${context}.properties must be a plain object.`);
    }
    const propertyNames = Reflect.ownKeys(propertiesValue);
    if (
      propertyNames.length === 0
      || propertyNames.length > RIDDLE_PROOF_EVIDENCE_OBSERVATION_SCHEMA_MAX_PROPERTIES
    ) {
      throw new Error(
        `${context}.properties must contain 1 through ${RIDDLE_PROOF_EVIDENCE_OBSERVATION_SCHEMA_MAX_PROPERTIES} entries.`,
      );
    }
    const properties: Record<string, RiddleProofEvidenceObservationSchema> = Object.create(null);
    for (const propertyName of propertyNames) {
      if (
        typeof propertyName !== "string"
        || !/^[A-Za-z][A-Za-z0-9_]{0,127}$/u.test(propertyName)
      ) {
        throw new Error(`${context}.properties contains an invalid property name.`);
      }
    }
    for (const propertyName of (propertyNames as string[]).sort()) {
      properties[propertyName] = parseObservationSchema(
        field(propertiesValue, propertyName, `${context}.properties`),
        `${context}.properties.${propertyName}`,
        state,
        depth + 1,
      );
    }
    return { kind, properties };
  }
  if (kind === "array") {
    assertOnlyKeys(value, ["kind", "items"], context);
    const items = denseArray(
      field(value, "items", context),
      `${context}.items`,
      RIDDLE_PROOF_EVIDENCE_OBSERVATION_SCHEMA_MAX_ARRAY_ITEMS,
      true,
    ).map((entry, index) =>
      parseObservationSchema(entry, `${context}.items[${index}]`, state, depth + 1));
    return { kind, items };
  }
  throw new Error(`${context}.kind is unsupported.`);
}

function observationSchemaParameters(
  schema: RiddleProofEvidenceObservationSchema,
  output = new Set<string>(),
): Set<string> {
  if (schema.kind === "claim_parameter") output.add(schema.parameter);
  if (schema.kind === "object") {
    for (const child of Object.values(schema.properties)) {
      observationSchemaParameters(child, output);
    }
  }
  if (schema.kind === "array") {
    for (const child of schema.items) observationSchemaParameters(child, output);
  }
  return output;
}

function observationMatchesSchema(
  schema: RiddleProofEvidenceObservationSchema,
  value: JsonValue,
  claimParameters: Record<string, JsonValue>,
): boolean {
  if (schema.kind === "literal") return sameJson(value, schema.value);
  if (schema.kind === "claim_parameter") {
    return Object.prototype.hasOwnProperty.call(claimParameters, schema.parameter)
      && sameJson(value, claimParameters[schema.parameter]);
  }
  if (schema.kind === "sha256") {
    return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
  }
  if (schema.kind === "integer") {
    return Number.isSafeInteger(value)
      && (value as number) >= schema.minimum
      && (value as number) <= schema.maximum;
  }
  if (schema.kind === "array") {
    return Array.isArray(value)
      && value.length === schema.items.length
      && schema.items.every((itemSchema, index) =>
        observationMatchesSchema(itemSchema, value[index], claimParameters));
  }
  if (!isPlainRecord(value)) return false;
  const expectedKeys = Object.keys(schema.properties).sort();
  const actualKeys = Object.keys(value).sort();
  return sameJson(expectedKeys, actualKeys)
    && expectedKeys.every((key) =>
      observationMatchesSchema(schema.properties[key], value[key] as JsonValue, claimParameters));
}

export function validateRiddleProofEvidenceObservationSchema(
  input: ValidateRiddleProofEvidenceObservationSchemaInput,
): RiddleProofEvidenceObservationSchemaValidationResult {
  try {
    if (!isPlainRecord(input)) throw new Error("schema validation input must be a plain object");
    assertOnlyKeys(
      input,
      ["schema", "observation", "claim_parameters"],
      "evidence observation schema validation input",
    );
    const schema = parseObservationSchema(
      field(input, "schema", "evidence observation schema validation input"),
      "evidence observation schema validation input.schema",
    );
    const observation = canonicalJson(
      field(input, "observation", "evidence observation schema validation input"),
      "evidence observation schema validation input.observation",
    );
    const parameters = canonicalJson(
      field(input, "claim_parameters", "evidence observation schema validation input"),
      "evidence observation schema validation input.claim_parameters",
    );
    if (!isPlainRecord(parameters)) throw new Error("claim_parameters must be a JSON object");
    if (!observationMatchesSchema(
      schema,
      observation,
      parameters as Record<string, JsonValue>,
    )) {
      return { ok: false };
    }
    return { ok: true, schema, observation };
  } catch {
    return { ok: false };
  }
}

function parseAllowedJsonTypes(
  value: unknown,
  context: string,
): [RiddleProofEvidenceJsonType, ...RiddleProofEvidenceJsonType[]] {
  const allowed = new Set<RiddleProofEvidenceJsonType>([
    "null",
    "boolean",
    "number",
    "string",
    "array",
    "object",
  ]);
  const entries = denseArray(value, context, allowed.size).map((entry, index) => {
    if (typeof entry !== "string" || !allowed.has(entry as RiddleProofEvidenceJsonType)) {
      throw new Error(`${context}[${index}] is not an allowed JSON type.`);
    }
    return entry as RiddleProofEvidenceJsonType;
  });
  entries.sort();
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index - 1] === entries[index]) {
      throw new Error(`${context} contains duplicate type ${entries[index]}.`);
    }
  }
  return entries as [RiddleProofEvidenceJsonType, ...RiddleProofEvidenceJsonType[]];
}

function parseRequiredAssertion(
  value: unknown,
  context: string,
): RiddleProofEvidenceContractRequiredAssertion {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  const op = field(value, "op", context);
  const source = field(value, "source", context);
  if (source !== "observation" && source !== "scope") {
    throw new Error(`${context}.source must be observation or scope.`);
  }
  const pointer = parseJsonPointer(field(value, "pointer", context), `${context}.pointer`);
  if (op === "exists") {
    assertOnlyKeys(value, ["op", "source", "pointer"], context);
    return { op, source, pointer };
  }
  if (op === "equals") {
    assertOnlyKeys(value, ["op", "source", "pointer", "value"], context);
    return {
      op,
      source,
      pointer,
      value: canonicalJson(field(value, "value", context), `${context}.value`),
    };
  }
  if (op === "type_is") {
    assertOnlyKeys(value, ["op", "source", "pointer", "type"], context);
    const type = field(value, "type", context);
    if (!["null", "boolean", "number", "string", "array", "object"].includes(type as string)) {
      throw new Error(`${context}.type is unsupported.`);
    }
    return { op, source, pointer, type: type as RiddleProofEvidenceJsonType };
  }
  throw new Error(`${context}.op is unsupported.`);
}

function parseRequiredAssertions(
  value: unknown,
  context: string,
): [
  RiddleProofEvidenceContractRequiredAssertion,
  ...RiddleProofEvidenceContractRequiredAssertion[],
] {
  const assertions = denseArray(value, context, 64).map((entry, index) =>
    parseRequiredAssertion(entry, `${context}[${index}]`));
  assertions.sort((left, right) => {
    const leftJson = stableJson(left);
    const rightJson = stableJson(right);
    return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0;
  });
  for (let index = 1; index < assertions.length; index += 1) {
    if (sameJson(assertions[index - 1], assertions[index])) {
      throw new Error(`${context} contains a duplicate assertion.`);
    }
  }
  return assertions as [
    RiddleProofEvidenceContractRequiredAssertion,
    ...RiddleProofEvidenceContractRequiredAssertion[],
  ];
}

function parseParameterBinding(
  value: unknown,
  context: string,
): RiddleProofEvidenceClaimParameterBinding {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(
    value,
    ["parameter", "observation_pointers", "allowed_json_types"],
    context,
  );
  const observationPointers = denseArray(
    field(value, "observation_pointers", context),
    `${context}.observation_pointers`,
    RIDDLE_PROOF_GROUNDED_DECLARATIVE_MAX_ASSERTIONS,
  ).map((pointer, index) =>
    parseJsonPointer(pointer, `${context}.observation_pointers[${index}]`));
  observationPointers.sort();
  for (let index = 1; index < observationPointers.length; index += 1) {
    if (observationPointers[index - 1] === observationPointers[index]) {
      throw new Error(`${context}.observation_pointers contains a duplicate pointer.`);
    }
  }
  return {
    parameter: protocolCode(field(value, "parameter", context), `${context}.parameter`),
    observation_pointers: observationPointers as [string, ...string[]],
    allowed_json_types: parseAllowedJsonTypes(
      field(value, "allowed_json_types", context),
      `${context}.allowed_json_types`,
    ),
  };
}

function parseParameterBindings(
  value: unknown,
  context: string,
): [RiddleProofEvidenceClaimParameterBinding, ...RiddleProofEvidenceClaimParameterBinding[]] {
  const bindings = denseArray(value, context, 64).map((entry, index) =>
    parseParameterBinding(entry, `${context}[${index}]`));
  bindings.sort((left, right) =>
    left.parameter < right.parameter ? -1 : left.parameter > right.parameter ? 1 : 0);
  const pointers = new Set<string>();
  for (let index = 0; index < bindings.length; index += 1) {
    const binding = bindings[index];
    if (index > 0 && bindings[index - 1].parameter === binding.parameter) {
      throw new Error(`${context} contains duplicate parameter ${binding.parameter}.`);
    }
    for (const pointer of binding.observation_pointers) {
      if (pointers.has(pointer)) {
        throw new Error(`${context} contains duplicate observation pointer ${pointer}.`);
      }
      pointers.add(pointer);
    }
  }
  return bindings as [
    RiddleProofEvidenceClaimParameterBinding,
    ...RiddleProofEvidenceClaimParameterBinding[],
  ];
}

function parseTemplateClaim(
  value: unknown,
  context: string,
): RiddleProofEvidenceContractTemplate["claim"] {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["claim_id", "claim_version", "label"], context);
  return {
    claim_id: canonicalString(field(value, "claim_id", context), `${context}.claim_id`),
    claim_version: canonicalString(
      field(value, "claim_version", context),
      `${context}.claim_version`,
    ),
    label: canonicalString(field(value, "label", context), `${context}.label`, 4096),
  };
}

function parseContractTemplate(
  value: unknown,
  context: string,
): RiddleProofEvidenceContractTemplate {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(
    value,
    [
      "contract_id",
      "contract_version",
      "label",
      "claim",
      "required_assertions",
      "parameter_bindings",
    ],
    context,
  );
  const requiredAssertions = parseRequiredAssertions(
    field(value, "required_assertions", context),
    `${context}.required_assertions`,
  );
  const parameterBindings = parseParameterBindings(
    field(value, "parameter_bindings", context),
    `${context}.parameter_bindings`,
  );
  if (
    requiredAssertions.length
      + parameterBindings.reduce((count, binding) => count + binding.observation_pointers.length, 0)
    > RIDDLE_PROOF_GROUNDED_DECLARATIVE_MAX_ASSERTIONS
  ) {
    throw new Error(
      `${context} materializes more than ${RIDDLE_PROOF_GROUNDED_DECLARATIVE_MAX_ASSERTIONS} assertions.`,
    );
  }
  return {
    contract_id: canonicalString(field(value, "contract_id", context), `${context}.contract_id`),
    contract_version: canonicalString(
      field(value, "contract_version", context),
      `${context}.contract_version`,
    ),
    label: canonicalString(field(value, "label", context), `${context}.label`, 4096),
    claim: parseTemplateClaim(field(value, "claim", context), `${context}.claim`),
    required_assertions: requiredAssertions,
    parameter_bindings: parameterBindings,
  };
}

function parseSensorTemplate(
  value: unknown,
  context: string,
): RiddleProofEvidenceSensorTemplate {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(
    value,
    ["kind", "name", "version", "metadata", "observed_target_binding"],
    context,
  );
  const kind = field(value, "kind", context);
  if (!["browser", "command", "api", "human", "other"].includes(kind as string)) {
    throw new Error(`${context}.kind is unsupported.`);
  }
  if (
    field(value, "observed_target_binding", context)
    !== RIDDLE_PROOF_EVIDENCE_SENSOR_TARGET_BINDING
  ) {
    throw new Error(`${context}.observed_target_binding is unsupported.`);
  }
  const metadataValue = optionalField(value, "metadata", context);
  let metadata: Record<string, JsonValue> | undefined;
  if (metadataValue !== undefined) {
    const normalized = canonicalJson(metadataValue, `${context}.metadata`);
    if (!isPlainRecord(normalized)) throw new Error(`${context}.metadata must be a JSON object.`);
    metadata = normalized as Record<string, JsonValue>;
  }
  return {
    kind: kind as RiddleProofGroundedSensorRef["kind"],
    name: canonicalString(field(value, "name", context), `${context}.name`),
    version: canonicalString(field(value, "version", context), `${context}.version`),
    ...(metadata === undefined ? {} : { metadata }),
    observed_target_binding: RIDDLE_PROOF_EVIDENCE_SENSOR_TARGET_BINDING,
  };
}

function parseTemplateProfileDefinition(
  value: unknown,
  context: string,
): RiddleProofEvidenceTrustProfile {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(
    value,
    [
      "mode",
      "profile_id",
      "profile_version",
      "collector",
      "sensor_template",
      "trusted_signer",
      "verifier_definition",
      "observation_schema",
      "contract_template",
      "required_artifact_roles",
    ],
    context,
  );
  if (field(value, "mode", context) !== RIDDLE_PROOF_EVIDENCE_TEMPLATE_PROFILE_MODE) {
    throw new Error(`${context}.mode is unsupported.`);
  }
  const signer = parseTrustedSigner(
    field(value, "trusted_signer", context),
    `${context}.trusted_signer`,
  );
  const verifier = createVerifierRegistration(
    field(value, "verifier_definition", context),
    `${context}.verifier_definition`,
  );
  const contractTemplate = parseContractTemplate(
    field(value, "contract_template", context),
    `${context}.contract_template`,
  );
  const observationSchema = parseObservationSchema(
    field(value, "observation_schema", context),
    `${context}.observation_schema`,
  );
  const boundParameters = new Set(
    contractTemplate.parameter_bindings.map((binding) => binding.parameter),
  );
  for (const parameter of observationSchemaParameters(observationSchema)) {
    if (!boundParameters.has(parameter)) {
      throw new Error(`${context}.observation_schema references unbound parameter ${parameter}.`);
    }
  }
  const requiredArtifactRoles = parseRoles(
    field(value, "required_artifact_roles", context),
    `${context}.required_artifact_roles`,
  );
  if (
    requiredArtifactRoles.length !== 1
    || requiredArtifactRoles[0] !== verifier.registration.program.artifact.role
  ) {
    throw new Error(`${context}.required_artifact_roles must exactly match the verifier artifact role.`);
  }
  return {
    mode: RIDDLE_PROOF_EVIDENCE_TEMPLATE_PROFILE_MODE,
    profile_id: protocolCode(field(value, "profile_id", context), `${context}.profile_id`),
    profile_version: protocolCode(
      field(value, "profile_version", context),
      `${context}.profile_version`,
    ),
    claim: {
      claim_id: contractTemplate.claim.claim_id,
      claim_version: contractTemplate.claim.claim_version,
    },
    expected_collector: parseCollector(
      field(value, "collector", context),
      `${context}.collector`,
    ),
    sensor_template: parseSensorTemplate(
      field(value, "sensor_template", context),
      `${context}.sensor_template`,
    ),
    trusted_signer: signer.trusted_signer,
    expected_signer: signer.expected_signer,
    verifier_registration: verifier.registration,
    expected_verifier: verifier.ref,
    observation_schema: observationSchema,
    contract_template: contractTemplate,
    required_artifact_roles: requiredArtifactRoles,
  };
}

function parseTemplateProfile(
  value: unknown,
  context: string,
): RiddleProofEvidenceTrustProfile {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(
    value,
    [
      "mode",
      "profile_id",
      "profile_version",
      "claim",
      "expected_collector",
      "sensor_template",
      "trusted_signer",
      "expected_signer",
      "verifier_registration",
      "expected_verifier",
      "observation_schema",
      "contract_template",
      "required_artifact_roles",
    ],
    context,
  );
  if (field(value, "mode", context) !== RIDDLE_PROOF_EVIDENCE_TEMPLATE_PROFILE_MODE) {
    throw new Error(`${context}.mode is unsupported.`);
  }
  const contractTemplate = parseContractTemplate(
    field(value, "contract_template", context),
    `${context}.contract_template`,
  );
  const observationSchema = parseObservationSchema(
    field(value, "observation_schema", context),
    `${context}.observation_schema`,
  );
  const boundParameters = new Set(
    contractTemplate.parameter_bindings.map((binding) => binding.parameter),
  );
  for (const parameter of observationSchemaParameters(observationSchema)) {
    if (!boundParameters.has(parameter)) {
      throw new Error(`${context}.observation_schema references unbound parameter ${parameter}.`);
    }
  }
  const claim = parseClaim(field(value, "claim", context), `${context}.claim`);
  if (
    claim.claim_id !== contractTemplate.claim.claim_id
    || claim.claim_version !== contractTemplate.claim.claim_version
  ) {
    throw new Error(`${context}.claim does not match its contract template.`);
  }
  const signer = parseTrustedSigner(
    field(value, "trusted_signer", context),
    `${context}.trusted_signer`,
  );
  const expectedSigner = parseExpectedSigner(
    field(value, "expected_signer", context),
    `${context}.expected_signer`,
  );
  if (!sameJson(signer.expected_signer, expectedSigner)) {
    throw new Error(`${context}.expected_signer does not match its trusted Ed25519 key.`);
  }
  const verifierRegistration = parseVerifierRegistration(
    field(value, "verifier_registration", context),
    `${context}.verifier_registration`,
  );
  const expectedVerifier = parseVerifierRef(
    field(value, "expected_verifier", context),
    `${context}.expected_verifier`,
  );
  if (!sameJson(verifierRefFromRegistration(verifierRegistration), expectedVerifier)) {
    throw new Error(`${context}.expected_verifier does not match its declarative registration.`);
  }
  const requiredArtifactRoles = parseRoles(
    field(value, "required_artifact_roles", context),
    `${context}.required_artifact_roles`,
  );
  if (
    requiredArtifactRoles.length !== 1
    || requiredArtifactRoles[0] !== verifierRegistration.program.artifact.role
  ) {
    throw new Error(`${context}.required_artifact_roles must exactly match the verifier artifact role.`);
  }
  return {
    mode: RIDDLE_PROOF_EVIDENCE_TEMPLATE_PROFILE_MODE,
    profile_id: protocolCode(field(value, "profile_id", context), `${context}.profile_id`),
    profile_version: protocolCode(
      field(value, "profile_version", context),
      `${context}.profile_version`,
    ),
    claim,
    expected_collector: parseCollector(
      field(value, "expected_collector", context),
      `${context}.expected_collector`,
    ),
    sensor_template: parseSensorTemplate(
      field(value, "sensor_template", context),
      `${context}.sensor_template`,
    ),
    trusted_signer: signer.trusted_signer,
    expected_signer: expectedSigner,
    verifier_registration: verifierRegistration,
    expected_verifier: expectedVerifier,
    observation_schema: observationSchema,
    contract_template: contractTemplate,
    required_artifact_roles: requiredArtifactRoles,
  };
}

function compareTemplateProfiles(
  left: RiddleProofEvidenceTrustProfile,
  right: RiddleProofEvidenceTrustProfile,
): number {
  if (left.profile_id < right.profile_id) return -1;
  if (left.profile_id > right.profile_id) return 1;
  if (left.profile_version < right.profile_version) return -1;
  if (left.profile_version > right.profile_version) return 1;
  return 0;
}

function canonicalizeTemplateProfiles(
  profiles: RiddleProofEvidenceTrustProfile[],
): [RiddleProofEvidenceTrustProfile, ...RiddleProofEvidenceTrustProfile[]] {
  profiles.sort(compareTemplateProfiles);
  const claims = new Set<string>();
  for (let index = 0; index < profiles.length; index += 1) {
    const profile = profiles[index];
    if (index > 0 && compareTemplateProfiles(profiles[index - 1], profile) === 0) {
      throw new Error(`duplicate evidence template profile ${profile.profile_id}@${profile.profile_version}`);
    }
    const claimIdentity = `${profile.claim.claim_id}\0${profile.claim.claim_version}`;
    if (claims.has(claimIdentity)) {
      throw new Error(`duplicate evidence template claim ${profile.claim.claim_id}@${profile.claim.claim_version}`);
    }
    claims.add(claimIdentity);
  }
  return profiles as [RiddleProofEvidenceTrustProfile, ...RiddleProofEvidenceTrustProfile[]];
}

function templateBundleDigest(bundle: RiddleProofEvidenceTrustRootBundle): string {
  return `sha256:${createHash("sha256")
    .update(RIDDLE_PROOF_EVIDENCE_TRUST_ROOT_DIGEST_DOMAIN)
    .update(stableJson(bundle))
    .digest("hex")}`;
}

function parseTemplateTrustRootRef(value: unknown): RiddleProofEvidenceTrustRootRef {
  if (!isPlainRecord(value)) throw new Error("expected evidence template trust root must be a plain object.");
  assertOnlyKeys(
    value,
    ["trust_root_id", "trust_root_version", "bundle_digest"],
    "expected evidence template trust root",
  );
  return {
    trust_root_id: protocolCode(
      field(value, "trust_root_id", "expected evidence template trust root"),
      "expected evidence template trust root.trust_root_id",
    ),
    trust_root_version: protocolCode(
      field(value, "trust_root_version", "expected evidence template trust root"),
      "expected evidence template trust root.trust_root_version",
    ),
    bundle_digest: fullSha256(
      field(value, "bundle_digest", "expected evidence template trust root"),
      "expected evidence template trust root.bundle_digest",
    ),
  };
}

function parseTemplateBundle(value: unknown): RiddleProofEvidenceTrustRootBundle {
  if (!isPlainRecord(value)) throw new Error("evidence template trust root bundle must be a plain object.");
  assertOnlyKeys(
    value,
    ["version", "trust_root_id", "trust_root_version", "profiles"],
    "evidence template trust root bundle",
  );
  if (
    field(value, "version", "evidence template trust root bundle")
    !== RIDDLE_PROOF_EVIDENCE_TRUST_ROOT_VERSION
  ) {
    throw new Error("evidence template trust root bundle.version is unsupported.");
  }
  const profiles = denseArray(
    field(value, "profiles", "evidence template trust root bundle"),
    "evidence template trust root bundle.profiles",
    RIDDLE_PROOF_EVIDENCE_TRUST_ROOT_MAX_PROFILES,
  ).map((profile, index) =>
    parseTemplateProfile(profile, `evidence template trust root bundle.profiles[${index}]`));
  return {
    version: RIDDLE_PROOF_EVIDENCE_TRUST_ROOT_VERSION,
    trust_root_id: protocolCode(
      field(value, "trust_root_id", "evidence template trust root bundle"),
      "evidence template trust root bundle.trust_root_id",
    ),
    trust_root_version: protocolCode(
      field(value, "trust_root_version", "evidence template trust root bundle"),
      "evidence template trust root bundle.trust_root_version",
    ),
    profiles: canonicalizeTemplateProfiles(profiles),
  };
}

export function createRiddleProofEvidenceTrustRoot(
  input: CreateRiddleProofEvidenceTrustRootInput,
): RiddleProofEvidenceTrustRootCreationResult {
  try {
    if (!isPlainRecord(input)) {
      throw new Error("evidence template trust root input must be a plain object.");
    }
    assertOnlyKeys(
      input,
      ["trust_root_id", "trust_root_version", "profile_templates"],
      "evidence template trust root input",
    );
    const definitions = denseArray(
      field(input, "profile_templates", "evidence template trust root input"),
      "evidence template trust root input.profile_templates",
      RIDDLE_PROOF_EVIDENCE_TRUST_ROOT_MAX_PROFILES,
    );
    const profiles = canonicalizeTemplateProfiles(definitions.map((definition, index) =>
      parseTemplateProfileDefinition(definition, `evidence profile template[${index}]`)));
    const bundle: RiddleProofEvidenceTrustRootBundle = {
      version: RIDDLE_PROOF_EVIDENCE_TRUST_ROOT_VERSION,
      trust_root_id: protocolCode(
        field(input, "trust_root_id", "evidence template trust root input"),
        "evidence template trust root input.trust_root_id",
      ),
      trust_root_version: protocolCode(
        field(input, "trust_root_version", "evidence template trust root input"),
        "evidence template trust root input.trust_root_version",
      ),
      profiles,
    };
    return {
      ok: true,
      bundle,
      trust_root: {
        trust_root_id: bundle.trust_root_id,
        trust_root_version: bundle.trust_root_version,
        bundle_digest: templateBundleDigest(bundle),
      },
    };
  } catch (error) {
    const message = safeErrorMessage(error);
    if (message.startsWith("duplicate evidence template profile ")) {
      return templateFailure("duplicate_profile", `Evidence template trust root creation failed: ${message}`);
    }
    if (message.startsWith("duplicate evidence template claim ")) {
      return templateFailure("duplicate_claim", `Evidence template trust root creation failed: ${message}`);
    }
    if (message.startsWith("evidence profile template[")) {
      return templateFailure(
        "invalid_profile_template",
        `Evidence template trust root creation failed: ${message}`,
      );
    }
    return templateFailure("invalid_input", `Evidence template trust root creation failed: ${message}`);
  }
}

export function resolveRiddleProofEvidenceTrustRoot(
  input: ResolveRiddleProofEvidenceTrustRootInput,
): RiddleProofEvidenceTrustRootResolutionResult {
  try {
    if (!isPlainRecord(input)) {
      throw new Error("evidence template trust root resolution input must be a plain object.");
    }
    assertOnlyKeys(
      input,
      ["bundle", "expected_trust_root"],
      "evidence template trust root resolution input",
    );
    const expected = parseTemplateTrustRootRef(
      field(input, "expected_trust_root", "evidence template trust root resolution input"),
    );
    const bundle = parseTemplateBundle(
      field(input, "bundle", "evidence template trust root resolution input"),
    );
    const actual: RiddleProofEvidenceTrustRootRef = {
      trust_root_id: bundle.trust_root_id,
      trust_root_version: bundle.trust_root_version,
      bundle_digest: templateBundleDigest(bundle),
    };
    if (
      actual.trust_root_id !== expected.trust_root_id
      || actual.trust_root_version !== expected.trust_root_version
      || actual.bundle_digest !== expected.bundle_digest
    ) {
      return templateFailure(
        "trust_root_mismatch",
        "Evidence template trust root resolution failed: bundle id, version, or digest does not match the independently pinned trust root.",
      );
    }
    return {
      ok: true,
      bundle,
      trust_root: expected,
      trusted_profiles: bundle.profiles,
    };
  } catch (error) {
    return templateFailure(
      "invalid_bundle",
      `Evidence template trust root resolution failed: ${safeErrorMessage(error)}`,
    );
  }
}

function parseScope(value: unknown, context: string): RiddleProofSemanticScope {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(
    value,
    ["repository", "revision", "environment", "target", "proof_attempt"],
    context,
  );
  return {
    repository: canonicalString(field(value, "repository", context), `${context}.repository`, 4096),
    revision: canonicalString(field(value, "revision", context), `${context}.revision`, 4096),
    environment: canonicalString(field(value, "environment", context), `${context}.environment`, 4096),
    target: canonicalString(field(value, "target", context), `${context}.target`, 4096),
    proof_attempt: canonicalString(field(value, "proof_attempt", context), `${context}.proof_attempt`, 4096),
  };
}

function parseMaterializedClaim(
  value: unknown,
  template: RiddleProofEvidenceContractTemplate,
): RiddleProofSemanticClaim {
  const context = "materialized evidence claim";
  if (!isPlainRecord(value)) throw new Error(`PROFILE:${context} must be a plain object.`);
  assertOnlyKeys(value, ["claim_id", "claim_version", "label", "parameters"], context);
  const claimId = canonicalString(field(value, "claim_id", context), `${context}.claim_id`);
  const claimVersion = canonicalString(
    field(value, "claim_version", context),
    `${context}.claim_version`,
  );
  const label = canonicalString(field(value, "label", context), `${context}.label`, 4096);
  if (
    claimId !== template.claim.claim_id
    || claimVersion !== template.claim.claim_version
    || label !== template.claim.label
  ) {
    throw new Error("PROFILE:claim id, version, or label is not authorized by the evidence template");
  }
  const parametersValue = field(value, "parameters", context);
  const parameters = canonicalJson(parametersValue, `${context}.parameters`);
  if (!isPlainRecord(parameters)) {
    throw new Error("PARAMETER:claim.parameters must be a JSON object");
  }
  const expectedNames = template.parameter_bindings.map((binding) => binding.parameter).sort();
  const actualNames = Object.keys(parameters).sort();
  if (!sameJson(expectedNames, actualNames)) {
    throw new Error("PARAMETER:claim parameters do not exactly match the template bindings");
  }
  return {
    claim_id: claimId,
    claim_version: claimVersion,
    label,
    parameters: parameters as Record<string, JsonValue>,
  };
}

function assertionSatisfied(
  assertion: RiddleProofEvidenceContractRequiredAssertion,
  observation: JsonValue,
  scope: RiddleProofSemanticScope,
): boolean {
  const root = assertion.source === "observation" ? observation : scope;
  const selected = resolveJsonPointer(root, assertion.pointer);
  if (assertion.op === "exists") return selected.found;
  if (!selected.found) return false;
  if (assertion.op === "equals") return sameJson(selected.value, assertion.value);
  return jsonType(selected.value) === assertion.type;
}

export function materializeRiddleProofEvidenceTrustProfile(
  input: MaterializeRiddleProofEvidenceTrustProfileInput,
): RiddleProofEvidenceMaterializationResult {
  try {
    if (!isPlainRecord(input)) {
      throw new Error("materialization input must be a plain object");
    }
    assertOnlyKeys(
      input,
      ["profile", "claim", "observation", "expected_scope", "actual_contract_registration"],
      "evidence template materialization input",
    );
    const profile = parseTemplateProfile(
      field(input, "profile", "evidence template materialization input"),
      "evidence template materialization input.profile",
    );
    const claim = parseMaterializedClaim(
      field(input, "claim", "evidence template materialization input"),
      profile.contract_template,
    );
    const observation = canonicalJson(
      field(input, "observation", "evidence template materialization input"),
      "evidence template materialization input.observation",
    );
    const schemaValidation = validateRiddleProofEvidenceObservationSchema({
      schema: profile.observation_schema,
      observation,
      claim_parameters: claim.parameters ?? {},
    });
    if (!schemaValidation.ok) {
      throw new Error("OBSERVATION:observation does not match the exact pinned content-free schema");
    }
    const scope = parseScope(
      field(input, "expected_scope", "evidence template materialization input"),
      "evidence template materialization input.expected_scope",
    );
    for (const assertion of profile.contract_template.required_assertions) {
      if (!assertionSatisfied(assertion, observation, scope)) {
        throw new Error(`OBSERVATION:required assertion ${stableJson(assertion)} is not satisfied`);
      }
    }
    const parameterAssertions = profile.contract_template.parameter_bindings.flatMap((binding) => {
      const parameterValue = claim.parameters?.[binding.parameter];
      return binding.observation_pointers.map((pointer) => {
        const selected = resolveJsonPointer(observation, pointer);
        if (!selected.found) {
          throw new Error(`OBSERVATION:bound observation pointer ${pointer} is absent`);
        }
        const selectedType = jsonType(selected.value);
        if (!selectedType || !binding.allowed_json_types.includes(selectedType)) {
          throw new Error(
            `PARAMETER:bound parameter ${binding.parameter} has a disallowed JSON type`,
          );
        }
        if (!sameJson(selected.value, parameterValue)) {
          throw new Error(
            `OBSERVATION:bound observation value does not match claim parameter ${binding.parameter}`,
          );
        }
        return {
          op: "equals" as const,
          source: "observation" as const,
          pointer,
          value: parameterValue as JsonValue,
        };
      });
    });
    const contractDefinition: RiddleProofGroundedDeclarativeJsonContractDefinition = {
      contract_id: profile.contract_template.contract_id,
      contract_version: profile.contract_template.contract_version,
      label: profile.contract_template.label,
      claim,
      program: {
        all: [
          ...profile.contract_template.required_assertions,
          ...parameterAssertions,
        ] as RiddleProofGroundedDeclarativeJsonContractDefinition["program"]["all"],
      },
    };
    const created = createRiddleProofGroundedDeclarativeJsonContract(contractDefinition);
    if (!created.ok) {
      throw new Error(`CONTRACT:deterministic contract materialization failed: ${created.error.message}`);
    }
    if (Object.prototype.hasOwnProperty.call(input, "actual_contract_registration")) {
      const actual = parseContractRegistration(
        field(input, "actual_contract_registration", "evidence template materialization input"),
        "evidence template materialization input.actual_contract_registration",
      );
      if (!sameJson(actual, created.registration)) {
        throw new Error(
          "CONTRACT:actual contract registration does not exactly match deterministic materialization",
        );
      }
    }
    const expectedSensor: RiddleProofGroundedSensorRef = {
      kind: profile.sensor_template.kind,
      name: profile.sensor_template.name,
      version: profile.sensor_template.version,
      observed_target: scope.target,
      ...(profile.sensor_template.metadata === undefined
        ? {}
        : { metadata: profile.sensor_template.metadata }),
    };
    const replayAuthority: RiddleProofMaterializedEvidenceReplayAuthority = {
      expected_collector: profile.expected_collector,
      expected_sensor: expectedSensor,
      trusted_signers: [profile.trusted_signer],
      expected_signer: profile.expected_signer,
      verifier_registry: [profile.verifier_registration],
      expected_verifier: profile.expected_verifier,
      contract_registry: [created.registration],
      expected_contract: created.contract_ref,
      required_artifact_roles: profile.required_artifact_roles,
    };
    return {
      ok: true,
      profile,
      claim,
      contract_definition: contractDefinition,
      contract_registration: created.registration,
      expected_contract: created.contract_ref,
      replay_authority: replayAuthority,
    };
  } catch (error) {
    const message = safeErrorMessage(error);
    if (message.startsWith("PROFILE:")) {
      return materializationFailure("profile_mismatch", `Evidence template materialization failed: ${message.slice(8)}`);
    }
    if (message.startsWith("PARAMETER:")) {
      return materializationFailure("parameter_mismatch", `Evidence template materialization failed: ${message.slice(10)}`);
    }
    if (message.startsWith("OBSERVATION:")) {
      return materializationFailure("observation_mismatch", `Evidence template materialization failed: ${message.slice(12)}`);
    }
    if (message.startsWith("CONTRACT:")) {
      return materializationFailure("contract_mismatch", `Evidence template materialization failed: ${message.slice(9)}`);
    }
    return materializationFailure("invalid_input", `Evidence template materialization failed: ${message}`);
  }
}
