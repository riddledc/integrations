import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as signBytes,
  verify as verifyBytes,
} from "node:crypto";
import { TextDecoder } from "node:util";

import type { JsonValue } from "./json";
import {
  RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_MAX_CERTIFICATES,
  composeRiddleProofSemanticCertificateClosures,
  createRiddleProofSemanticAtomicCertificateClosure,
  createRiddleProofSemanticCertificate,
  matchRiddleProofSemanticCertificateClosure,
  parseRiddleProofSemanticCertificate,
  validateRiddleProofSemanticCertificateClosure,
} from "./semantic-certificate";
import type {
  RiddleProofSemanticAssurance,
  RiddleProofSemanticCertificate,
  RiddleProofSemanticCertificateClosure,
  RiddleProofSemanticClaim,
  RiddleProofSemanticClaimExpectation,
  RiddleProofSemanticClaimRef,
  RiddleProofSemanticEvidenceBundle,
  RiddleProofSemanticRule,
  RiddleProofSemanticScope,
} from "./semantic-certificate";

export const RIDDLE_PROOF_GROUNDED_CAPTURE_STATEMENT_VERSION =
  "riddle-proof.grounded-capture-statement.v0" as const;

export const RIDDLE_PROOF_SIGNED_CAPTURE_BUNDLE_VERSION =
  "riddle-proof.signed-capture-bundle.v0" as const;

export const RIDDLE_PROOF_GROUNDED_VERIFICATION_RECEIPT_VERSION =
  "riddle-proof.grounded-verification-receipt.v0" as const;

export const RIDDLE_PROOF_GROUNDED_SEMANTIC_CERTIFICATE_CLOSURE_VERSION =
  "riddle-proof.grounded-semantic-certificate-closure.v0" as const;

export const RIDDLE_PROOF_SIGNED_CAPTURE_SIGNATURE_DOMAIN =
  "riddle-proof.signed-capture-bundle.v0\0" as const;

export const RIDDLE_PROOF_GROUNDED_DECLARATIVE_JSON_VERIFIER_ENGINE =
  "riddle-proof.grounded-declarative-json-verifier.v0" as const;

export const RIDDLE_PROOF_GROUNDED_DECLARATIVE_JSON_CONTRACT_ENGINE =
  "riddle-proof.grounded-declarative-json-contract.v0" as const;

export const RIDDLE_PROOF_GROUNDED_DECLARATIVE_DEFINITION_DIGEST_DOMAIN =
  "riddle-proof.grounded-declarative-definition.v0\0" as const;

export const RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_ARTIFACTS = 64;
export const RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
export const RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_TOTAL_ARTIFACT_BYTES = 64 * 1024 * 1024;
export const RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_OBSERVATION_BYTES = 1024 * 1024;
export const RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_TIME_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;
export const RIDDLE_PROOF_GROUNDED_SEMANTIC_CLOSURE_MAX_TOTAL_ARTIFACT_BYTES =
  256 * 1024 * 1024;
export const RIDDLE_PROOF_GROUNDED_SEMANTIC_CLOSURE_MAX_METADATA_BYTES =
  64 * 1024 * 1024;
export const RIDDLE_PROOF_GROUNDED_REPLAY_MAX_AGGREGATE_REGISTRY_ENTRIES = 16_384;
export const RIDDLE_PROOF_GROUNDED_REPLAY_MAX_AGGREGATE_TRUSTED_KEY_BYTES =
  4 * 1024 * 1024;
export const RIDDLE_PROOF_GROUNDED_REPLAY_MAX_AGGREGATE_CONFIG_BYTES =
  16 * 1024 * 1024;
export const RIDDLE_PROOF_GROUNDED_DECLARATIVE_MAX_DEFINITION_BYTES = 64 * 1024;
export const RIDDLE_PROOF_GROUNDED_DECLARATIVE_MAX_POINTER_BYTES = 4 * 1024;
export const RIDDLE_PROOF_GROUNDED_DECLARATIVE_MAX_POINTER_SEGMENTS = 128;
export const RIDDLE_PROOF_GROUNDED_DECLARATIVE_MAX_ASSERTIONS = 64;

const MAX_IDENTIFIER_LENGTH = 256;
const MAX_LABEL_LENGTH = 4096;
const MAX_MEDIA_TYPE_LENGTH = 256;
const MAX_KEY_BYTES = 16 * 1024;

const SCOPE_FIELDS = [
  "repository",
  "revision",
  "environment",
  "target",
  "proof_attempt",
] as const;

export interface RiddleProofGroundedCollectorRef {
  collector_id: string;
  collector_version: string;
  implementation_digest: string;
}

/** The callback digest is an assertion made by an independently trusted registry. */
export type RiddleProofGroundedExternalRegistryTrustBasis = {
  kind: "external_registry";
};

/** The runtime recomputes the recipe digest and uses only its fixed v0 interpreter. */
export type RiddleProofGroundedDeclarativeJsonVerifierTrustBasis = {
  kind: "builtin_declarative_json";
  engine: typeof RIDDLE_PROOF_GROUNDED_DECLARATIVE_JSON_VERIFIER_ENGINE;
};

/** The runtime recomputes the recipe digest and uses only its fixed v0 interpreter. */
export type RiddleProofGroundedDeclarativeJsonContractTrustBasis = {
  kind: "builtin_declarative_json";
  engine: typeof RIDDLE_PROOF_GROUNDED_DECLARATIVE_JSON_CONTRACT_ENGINE;
};

export type RiddleProofGroundedImplementationTrustBasis =
  | RiddleProofGroundedExternalRegistryTrustBasis
  | RiddleProofGroundedDeclarativeJsonVerifierTrustBasis
  | RiddleProofGroundedDeclarativeJsonContractTrustBasis;

export type RiddleProofGroundedVerifierTrustBasis =
  | RiddleProofGroundedExternalRegistryTrustBasis
  | RiddleProofGroundedDeclarativeJsonVerifierTrustBasis;

export type RiddleProofGroundedSemanticContractTrustBasis =
  | RiddleProofGroundedExternalRegistryTrustBasis
  | RiddleProofGroundedDeclarativeJsonContractTrustBasis;

export interface RiddleProofGroundedVerifierRef {
  verifier_id: string;
  verifier_version: string;
  implementation_digest: string;
  trust_basis: RiddleProofGroundedVerifierTrustBasis;
}

export interface RiddleProofGroundedDeclarativeJsonVerifierProgram {
  artifact: {
    artifact_id: string;
    role: string;
    media_type: "application/json";
  };
  /** RFC 6901 JSON Pointer; the empty string selects the parsed document root. */
  pointer: string;
}

export interface RiddleProofGroundedDeclarativeJsonVerifierDefinition {
  verifier_id: string;
  verifier_version: string;
  program: RiddleProofGroundedDeclarativeJsonVerifierProgram;
}

export type RiddleProofGroundedSensorKind =
  | "browser"
  | "command"
  | "api"
  | "human"
  | "other";

export interface RiddleProofGroundedSensorRef {
  kind: RiddleProofGroundedSensorKind;
  name: string;
  version: string;
  observed_target: string;
  metadata?: Record<string, JsonValue>;
}

export interface RiddleProofGroundedArtifactManifestEntry {
  artifact_id: string;
  role: string;
  media_type: string;
  byte_length: number;
  artifact_digest: string;
}

export interface RiddleProofGroundedCaptureArtifactInput {
  artifact_id: string;
  role: string;
  media_type: string;
  bytes_base64: string;
}

export interface RiddleProofGroundedInlineArtifact {
  artifact_id: string;
  encoding: "base64";
  bytes_base64: string;
}

export interface RiddleProofGroundedCaptureStatement {
  version: typeof RIDDLE_PROOF_GROUNDED_CAPTURE_STATEMENT_VERSION;
  scope: RiddleProofSemanticScope;
  nonce: string;
  captured_at: string;
  collector: RiddleProofGroundedCollectorRef;
  sensor: RiddleProofGroundedSensorRef;
  verifier: RiddleProofGroundedVerifierRef;
  artifacts: RiddleProofGroundedArtifactManifestEntry[];
}

export interface RiddleProofGroundedCaptureProvenance {
  algorithm: "ed25519";
  key_id: string;
  signature_base64: string;
}

export interface RiddleProofSignedCaptureBundle {
  version: typeof RIDDLE_PROOF_SIGNED_CAPTURE_BUNDLE_VERSION;
  statement: RiddleProofGroundedCaptureStatement;
  inline_artifacts: RiddleProofGroundedInlineArtifact[];
  provenance: RiddleProofGroundedCaptureProvenance;
}

export interface RiddleProofGroundedSigningKey {
  key_id: string;
  private_key_pkcs8_base64: string;
}

export interface CreateRiddleProofSignedCaptureBundleInput {
  scope: RiddleProofSemanticScope;
  nonce: string;
  captured_at: string;
  collector: RiddleProofGroundedCollectorRef;
  sensor: RiddleProofGroundedSensorRef;
  verifier: RiddleProofGroundedVerifierRef;
  artifacts: [
    RiddleProofGroundedCaptureArtifactInput,
    ...RiddleProofGroundedCaptureArtifactInput[],
  ];
  signing_key: RiddleProofGroundedSigningKey;
}

export interface RiddleProofGroundedTrustedSigner {
  key_id: string;
  public_key_spki_base64: string;
}

export interface RiddleProofGroundedExpectedSigner {
  key_id: string;
  public_key_spki_sha256: string;
}

export interface RiddleProofGroundedCaptureVerificationPolicy {
  expected_scope: RiddleProofSemanticScope;
  expected_nonce: string;
  expected_collector: RiddleProofGroundedCollectorRef;
  expected_sensor: RiddleProofGroundedSensorRef;
  expected_verifier: RiddleProofGroundedVerifierRef;
  expected_signer: RiddleProofGroundedExpectedSigner;
  verification_time: string;
  max_capture_age_ms: number;
  max_future_skew_ms: number;
  required_artifact_roles: [string, ...string[]];
  expected_bundle_id?: string;
  expected_statement_digest?: string;
}

export interface RiddleProofGroundedVerifierArtifact {
  artifact_id: string;
  role: string;
  media_type: string;
  byte_length: number;
  artifact_digest: string;
  bytes: Uint8Array;
}

export interface RiddleProofGroundedVerifierInput {
  scope: RiddleProofSemanticScope;
  nonce: string;
  captured_at: string;
  collector: RiddleProofGroundedCollectorRef;
  sensor: RiddleProofGroundedSensorRef;
  artifacts: RiddleProofGroundedVerifierArtifact[];
}

export interface RiddleProofGroundedExternalVerifierRegistration
  extends RiddleProofGroundedVerifierRef {
  trust_basis: RiddleProofGroundedExternalRegistryTrustBasis;
  verify: (input: RiddleProofGroundedVerifierInput) => unknown;
}

export interface RiddleProofGroundedDeclarativeJsonVerifierRegistration
  extends RiddleProofGroundedVerifierRef {
  trust_basis: RiddleProofGroundedDeclarativeJsonVerifierTrustBasis;
  program: RiddleProofGroundedDeclarativeJsonVerifierProgram;
}

export type RiddleProofGroundedVerifierRegistration =
  | RiddleProofGroundedExternalVerifierRegistration
  | RiddleProofGroundedDeclarativeJsonVerifierRegistration;

function isDeclarativeJsonVerifierRegistration(
  registration: RiddleProofGroundedVerifierRegistration,
): registration is RiddleProofGroundedDeclarativeJsonVerifierRegistration {
  return registration.trust_basis.kind === "builtin_declarative_json"
    && registration.trust_basis.engine
      === RIDDLE_PROOF_GROUNDED_DECLARATIVE_JSON_VERIFIER_ENGINE;
}

export type RiddleProofGroundedDeclarativeJsonVerifierDefinitionResult =
  | {
      ok: true;
      verifier_ref: RiddleProofGroundedVerifierRef;
      registration: RiddleProofGroundedDeclarativeJsonVerifierRegistration;
    }
  | { ok: false; error: RiddleProofGroundedCaptureError };

export interface VerifyRiddleProofSignedCaptureBundleInput {
  bundle: unknown;
  policy: RiddleProofGroundedCaptureVerificationPolicy;
  trusted_signers: [
    RiddleProofGroundedTrustedSigner,
    ...RiddleProofGroundedTrustedSigner[],
  ];
  verifier_registry: [
    RiddleProofGroundedVerifierRegistration,
    ...RiddleProofGroundedVerifierRegistration[],
  ];
}

export interface RiddleProofVerifiedSignedCapture {
  bundle_id: string;
  statement_digest: string;
  artifact_manifest_digest: string;
  signer: {
    algorithm: "ed25519";
    key_id: string;
    public_key_spki_sha256: string;
  };
  verification_time: string;
  max_capture_age_ms: number;
  max_future_skew_ms: number;
  required_artifact_roles: [string, ...string[]];
  expected_bundle_id?: string;
  expected_statement_digest?: string;
  observation: JsonValue;
  observation_digest: string;
}

export type RiddleProofGroundedCaptureErrorCode =
  | "invalid_input"
  | "invalid_bundle"
  | "artifact_mismatch"
  | "policy_mismatch"
  | "capture_stale"
  | "capture_from_future"
  | "signer_not_trusted"
  | "signature_invalid"
  | "verifier_not_registered"
  | "verifier_error"
  | "verifier_rejected"
  | "verifier_nondeterministic";

export interface RiddleProofGroundedCaptureError {
  code: RiddleProofGroundedCaptureErrorCode;
  message: string;
}

export type RiddleProofSignedCaptureBundleCreationResult =
  | { ok: true; bundle: RiddleProofSignedCaptureBundle }
  | { ok: false; error: RiddleProofGroundedCaptureError };

export type RiddleProofSignedCaptureBundleVerificationResult =
  | {
      ok: true;
      bundle: RiddleProofSignedCaptureBundle;
      verified_capture: RiddleProofVerifiedSignedCapture;
    }
  | { ok: false; error: RiddleProofGroundedCaptureError };

type PlainRecord = Record<string, unknown>;

interface ParsedBundle {
  bundle: RiddleProofSignedCaptureBundle;
  decoded_artifacts: Uint8Array[];
}

function isPlainRecord(value: unknown): value is PlainRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeErrorMessage(error: unknown): string {
  try {
    if (error instanceof Error) return String(error.message);
  } catch {
    // Continue to the guarded generic representation.
  }
  try {
    return String(error);
  } catch {
    return "unprintable thrown value";
  }
}

function failure(
  code: RiddleProofGroundedCaptureErrorCode,
  message: string,
): { ok: false; error: RiddleProofGroundedCaptureError } {
  return { ok: false, error: { code, message } };
}

function assertOnlyKeys(
  record: PlainRecord,
  allowed: readonly string[],
  context: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== "string") {
      throw new Error(`${context} contains an unsupported symbol field.`);
    }
    if (!allowedSet.has(key)) {
      throw new Error(`${context} contains unsupported field ${key}.`);
    }
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

function requiredField(record: PlainRecord, key: string, context: string): unknown {
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
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) return undefined;
  if (
    descriptor.enumerable !== true
    || descriptor.get !== undefined
    || descriptor.set !== undefined
  ) {
    throw new Error(`${context}.${key} must be an enumerable data field.`);
  }
  return descriptor.value;
}

function readDenseDataArray(
  value: unknown,
  context: string,
  maximumLength: number,
): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(`${context} must be a plain array.`);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    !lengthDescriptor
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
  ) {
    throw new Error(`${context}.length must be an own safe-integer data field.`);
  }
  const length = lengthDescriptor.value as number;
  if (length > maximumLength) {
    throw new Error(`${context} exceeds ${maximumLength} entries.`);
  }
  const entries: Array<[number, unknown]> = [];
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string") {
      throw new Error(`${context} contains an unsupported symbol field.`);
    }
    const index = Number(key);
    if (
      !Number.isInteger(index)
      || index < 0
      || index >= length
      || index >= 2 ** 32 - 1
      || String(index) !== key
    ) {
      throw new Error(`${context} contains unsupported array field ${key}.`);
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
  if (entries.length !== length) {
    throw new Error(`${context} must not contain sparse or inherited entries.`);
  }
  entries.sort(([left], [right]) => left - right);
  return entries.map(([, entry]) => entry);
}

function exactString(
  value: unknown,
  context: string,
  maximumLength = MAX_LABEL_LENGTH,
): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maximumLength
    || value.trim() !== value
  ) {
    throw new Error(`${context} must be a non-empty, already-trimmed string of at most ${maximumLength} characters.`);
  }
  return value;
}

function requiredString(
  record: PlainRecord,
  key: string,
  context: string,
  maximumLength?: number,
): string {
  return exactString(requiredField(record, key, context), `${context}.${key}`, maximumLength);
}

function fullSha256(value: unknown, context: string): string {
  const digest = exactString(value, context, 71);
  if (!/^sha256:[0-9a-f]{64}$/u.test(digest)) {
    throw new Error(`${context} must be a lowercase full sha256 digest.`);
  }
  return digest;
}

function parseSafeMilliseconds(value: unknown, context: string): number {
  if (
    !Number.isSafeInteger(value)
    || (value as number) < 0
    || (value as number) > RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_TIME_WINDOW_MS
  ) {
    throw new Error(`${context} must be a non-negative safe integer no greater than ${RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_TIME_WINDOW_MS}.`);
  }
  return value as number;
}

function parseCanonicalTimestamp(value: unknown, context: string): string {
  const timestamp = exactString(value, context, 24);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(timestamp)) {
    throw new Error(`${context} must be a canonical UTC timestamp with millisecond precision.`);
  }
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== timestamp) {
    throw new Error(`${context} must be a real canonical UTC timestamp.`);
  }
  return timestamp;
}

function decodeCanonicalBase64(
  value: unknown,
  context: string,
  maximumBytes: number,
): Uint8Array {
  if (typeof value !== "string") throw new Error(`${context} must be a base64 string.`);
  const maximumCharacters = Math.ceil(maximumBytes / 3) * 4;
  if (value.length > maximumCharacters) {
    throw new Error(`${context} exceeds the encoded limit for ${maximumBytes} bytes.`);
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    throw new Error(`${context} must be canonical padded base64.`);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.length > maximumBytes || decoded.toString("base64") !== value) {
    throw new Error(`${context} must canonically encode at most ${maximumBytes} bytes.`);
  }
  return new Uint8Array(decoded);
}

function parseNonce(value: unknown, context: string): string {
  const nonce = exactString(value, context, 43);
  if (!/^[A-Za-z0-9_-]{43}$/u.test(nonce)) {
    throw new Error(`${context} must be an unpadded base64url encoding of exactly 32 bytes.`);
  }
  const decoded = Buffer.from(nonce, "base64url");
  if (decoded.length !== 32 || decoded.toString("base64url") !== nonce) {
    throw new Error(`${context} must canonically encode exactly 32 bytes.`);
  }
  return nonce;
}

function cloneJsonValue(
  value: unknown,
  context: string,
  ancestors = new Set<object>(),
): JsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length > RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_OBSERVATION_BYTES) {
      throw new Error(`${context} contains an oversized string.`);
    }
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${context} must contain only finite numbers.`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new Error(`${context} must not be cyclic.`);
    ancestors.add(value);
    const entries = readDenseDataArray(
      value,
      context,
      RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_OBSERVATION_BYTES,
    );
    const cloned = entries.map((entry, index) =>
      cloneJsonValue(entry, `${context}[${index}]`, ancestors));
    ancestors.delete(value);
    return cloned;
  }
  if (!isPlainRecord(value)) throw new Error(`${context} must contain only JSON data.`);
  if (ancestors.has(value)) throw new Error(`${context} must not be cyclic.`);
  ancestors.add(value);
  const cloned: Record<string, JsonValue> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      throw new Error(`${context} contains an unsupported symbol field.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor
      || descriptor.enumerable !== true
      || descriptor.get !== undefined
      || descriptor.set !== undefined
    ) {
      throw new Error(`${context}.${key} must be an enumerable data field.`);
    }
    Object.defineProperty(cloned, key, {
      value: cloneJsonValue(descriptor.value, `${context}.${key}`, ancestors),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  ancestors.delete(value);
  return cloned;
}

function parseJsonObject(value: unknown, context: string): Record<string, JsonValue> {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain JSON object.`);
  strictJsonByteSize(value, context, RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_OBSERVATION_BYTES);
  const cloned = cloneJsonValue(value, context);
  if (!isPlainRecord(cloned)) throw new Error(`${context} must remain a JSON object.`);
  const size = Buffer.byteLength(stableJson(cloned), "utf8");
  if (size > RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_OBSERVATION_BYTES) {
    throw new Error(`${context} exceeds ${RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_OBSERVATION_BYTES} canonical bytes.`);
  }
  return cloned;
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
  if (encoded === undefined) throw new Error("Grounded evidence contains non-JSON data.");
  return encoded;
}

function strictJsonByteSize(
  value: unknown,
  context: string,
  maximumBytes: number,
  ancestors = new Set<object>(),
  depth = 0,
): number {
  if (depth > 128) throw new Error(`${context} exceeds the maximum JSON nesting depth.`);
  const ensureBudget = (size: number): number => {
    if (size > maximumBytes) throw new Error(`${context} exceeds its canonical byte budget.`);
    return size;
  };
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
    || typeof value === "number"
  ) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error(`${context} must contain only finite numbers.`);
    }
    const encoded = JSON.stringify(Object.is(value, -0) ? 0 : value);
    if (encoded === undefined) throw new Error(`${context} contains non-JSON data.`);
    return ensureBudget(Buffer.byteLength(encoded, "utf8"));
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new Error(`${context} must not be cyclic.`);
    ancestors.add(value);
    const entries = readDenseDataArray(
      value,
      context,
      Math.min(
        RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_OBSERVATION_BYTES,
        Math.max(0, maximumBytes),
      ),
    );
    let size = 2 + Math.max(0, entries.length - 1);
    for (let index = 0; index < entries.length; index += 1) {
      size += strictJsonByteSize(
        entries[index],
        `${context}[${index}]`,
        maximumBytes - Math.min(size, maximumBytes),
        ancestors,
        depth + 1,
      );
      ensureBudget(size);
    }
    ancestors.delete(value);
    return size;
  }
  if (!isPlainRecord(value)) throw new Error(`${context} must contain only plain JSON data.`);
  if (ancestors.has(value)) throw new Error(`${context} must not be cyclic.`);
  ancestors.add(value);
  const entries: Array<[string, unknown]> = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new Error(`${context} contains a symbol field.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor
      || descriptor.enumerable !== true
      || descriptor.get !== undefined
      || descriptor.set !== undefined
    ) {
      throw new Error(`${context}.${key} must be an enumerable data field.`);
    }
    entries.push([key, descriptor.value]);
  }
  entries.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  let size = 2 + Math.max(0, entries.length - 1);
  for (const [key, entry] of entries) {
    size += Buffer.byteLength(JSON.stringify(key), "utf8") + 1;
    ensureBudget(size);
    size += strictJsonByteSize(
      entry,
      `${context}.${key}`,
      maximumBytes - Math.min(size, maximumBytes),
      ancestors,
      depth + 1,
    );
    ensureBudget(size);
  }
  ancestors.delete(value);
  return size;
}

function deepFreezeNormalized<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const entry of value) deepFreezeNormalized(entry);
    return Object.freeze(value);
  }
  if (isPlainRecord(value)) {
    for (const key of Object.keys(value)) deepFreezeNormalized(value[key]);
    return Object.freeze(value) as T;
  }
  return value;
}

function sha256Bytes(value: Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256Json(value: unknown): string {
  return sha256Bytes(Buffer.from(stableJson(value), "utf8"));
}

function parseScope(value: unknown, context: string): RiddleProofSemanticScope {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, SCOPE_FIELDS, context);
  return {
    repository: requiredString(value, "repository", context, MAX_LABEL_LENGTH),
    revision: requiredString(value, "revision", context, MAX_LABEL_LENGTH),
    environment: requiredString(value, "environment", context, MAX_LABEL_LENGTH),
    target: requiredString(value, "target", context, MAX_LABEL_LENGTH),
    proof_attempt: requiredString(value, "proof_attempt", context, MAX_LABEL_LENGTH),
  };
}

function parseCollector(value: unknown, context: string): RiddleProofGroundedCollectorRef {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["collector_id", "collector_version", "implementation_digest"], context);
  return {
    collector_id: requiredString(value, "collector_id", context, MAX_IDENTIFIER_LENGTH),
    collector_version: requiredString(value, "collector_version", context, MAX_IDENTIFIER_LENGTH),
    implementation_digest: fullSha256(
      requiredField(value, "implementation_digest", context),
      `${context}.implementation_digest`,
    ),
  };
}

function parseImplementationTrustBasisForEngine(
  value: unknown,
  context: string,
  engine:
    | typeof RIDDLE_PROOF_GROUNDED_DECLARATIVE_JSON_VERIFIER_ENGINE
    | typeof RIDDLE_PROOF_GROUNDED_DECLARATIVE_JSON_CONTRACT_ENGINE,
): RiddleProofGroundedImplementationTrustBasis {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  const kind = requiredField(value, "kind", context);
  if (kind === "external_registry") {
    assertOnlyKeys(value, ["kind"], context);
    return { kind: "external_registry" };
  }
  if (kind !== "builtin_declarative_json") {
    throw new Error(`${context}.kind must be external_registry or builtin_declarative_json.`);
  }
  assertOnlyKeys(value, ["kind", "engine"], context);
  if (requiredField(value, "engine", context) !== engine) {
    throw new Error(`${context}.engine must be ${engine}.`);
  }
  return { kind: "builtin_declarative_json", engine };
}

function parseVerifierTrustBasis(
  value: unknown,
  context: string,
): RiddleProofGroundedVerifierTrustBasis {
  return parseImplementationTrustBasisForEngine(
    value,
    context,
    RIDDLE_PROOF_GROUNDED_DECLARATIVE_JSON_VERIFIER_ENGINE,
  ) as RiddleProofGroundedVerifierTrustBasis;
}

function parseContractTrustBasis(
  value: unknown,
  context: string,
): RiddleProofGroundedSemanticContractTrustBasis {
  return parseImplementationTrustBasisForEngine(
    value,
    context,
    RIDDLE_PROOF_GROUNDED_DECLARATIVE_JSON_CONTRACT_ENGINE,
  ) as RiddleProofGroundedSemanticContractTrustBasis;
}

function parseVerifierRef(value: unknown, context: string): RiddleProofGroundedVerifierRef {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(
    value,
    ["verifier_id", "verifier_version", "implementation_digest", "trust_basis"],
    context,
  );
  return {
    verifier_id: requiredString(value, "verifier_id", context, MAX_IDENTIFIER_LENGTH),
    verifier_version: requiredString(value, "verifier_version", context, MAX_IDENTIFIER_LENGTH),
    implementation_digest: fullSha256(
      requiredField(value, "implementation_digest", context),
      `${context}.implementation_digest`,
    ),
    trust_basis: parseVerifierTrustBasis(
      requiredField(value, "trust_basis", context),
      `${context}.trust_basis`,
    ),
  };
}

function parseSensor(value: unknown, context: string): RiddleProofGroundedSensorRef {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["kind", "name", "version", "observed_target", "metadata"], context);
  const kind = requiredString(value, "kind", context, 16);
  if (!["browser", "command", "api", "human", "other"].includes(kind)) {
    throw new Error(`${context}.kind is unsupported.`);
  }
  const metadataValue = optionalField(value, "metadata", context);
  return {
    kind: kind as RiddleProofGroundedSensorKind,
    name: requiredString(value, "name", context, MAX_IDENTIFIER_LENGTH),
    version: requiredString(value, "version", context, MAX_IDENTIFIER_LENGTH),
    observed_target: requiredString(value, "observed_target", context, MAX_LABEL_LENGTH),
    ...(metadataValue === undefined
      ? {}
      : { metadata: parseJsonObject(metadataValue, `${context}.metadata`) }),
  };
}

function parseManifestEntry(
  value: unknown,
  context: string,
): RiddleProofGroundedArtifactManifestEntry {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(
    value,
    ["artifact_id", "role", "media_type", "byte_length", "artifact_digest"],
    context,
  );
  const byteLength = requiredField(value, "byte_length", context);
  if (
    !Number.isSafeInteger(byteLength)
    || (byteLength as number) < 0
    || (byteLength as number) > RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_ARTIFACT_BYTES
  ) {
    throw new Error(`${context}.byte_length must be a safe integer between 0 and ${RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_ARTIFACT_BYTES}.`);
  }
  return {
    artifact_id: requiredString(value, "artifact_id", context, MAX_IDENTIFIER_LENGTH),
    role: requiredString(value, "role", context, MAX_IDENTIFIER_LENGTH),
    media_type: requiredString(value, "media_type", context, MAX_MEDIA_TYPE_LENGTH),
    byte_length: byteLength as number,
    artifact_digest: fullSha256(
      requiredField(value, "artifact_digest", context),
      `${context}.artifact_digest`,
    ),
  };
}

function parseInlineArtifact(value: unknown, context: string): RiddleProofGroundedInlineArtifact {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["artifact_id", "encoding", "bytes_base64"], context);
  if (requiredField(value, "encoding", context) !== "base64") {
    throw new Error(`${context}.encoding must be base64.`);
  }
  const bytesBase64 = requiredField(value, "bytes_base64", context);
  decodeCanonicalBase64(
    bytesBase64,
    `${context}.bytes_base64`,
    RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_ARTIFACT_BYTES,
  );
  return {
    artifact_id: requiredString(value, "artifact_id", context, MAX_IDENTIFIER_LENGTH),
    encoding: "base64",
    bytes_base64: bytesBase64 as string,
  };
}

function parseStatement(value: unknown, context: string): RiddleProofGroundedCaptureStatement {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(
    value,
    ["version", "scope", "nonce", "captured_at", "collector", "sensor", "verifier", "artifacts"],
    context,
  );
  if (requiredField(value, "version", context) !== RIDDLE_PROOF_GROUNDED_CAPTURE_STATEMENT_VERSION) {
    throw new Error(`${context}.version is unsupported.`);
  }
  const scope = parseScope(requiredField(value, "scope", context), `${context}.scope`);
  const sensor = parseSensor(requiredField(value, "sensor", context), `${context}.sensor`);
  if (sensor.observed_target !== scope.target) {
    throw new Error(`${context}.sensor.observed_target must exactly match scope.target.`);
  }
  const artifactValues = readDenseDataArray(
    requiredField(value, "artifacts", context),
    `${context}.artifacts`,
    RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_ARTIFACTS,
  );
  if (artifactValues.length === 0) throw new Error(`${context}.artifacts must not be empty.`);
  const artifacts = artifactValues.map((entry, index) =>
    parseManifestEntry(entry, `${context}.artifacts[${index}]`));
  assertArtifactIdsUniqueAndSorted(artifacts, `${context}.artifacts`);
  const total = artifacts.reduce((sum, artifact) => sum + artifact.byte_length, 0);
  if (total > RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_TOTAL_ARTIFACT_BYTES) {
    throw new Error(`${context}.artifacts exceed the total decoded byte limit.`);
  }
  return {
    version: RIDDLE_PROOF_GROUNDED_CAPTURE_STATEMENT_VERSION,
    scope,
    nonce: parseNonce(requiredField(value, "nonce", context), `${context}.nonce`),
    captured_at: parseCanonicalTimestamp(
      requiredField(value, "captured_at", context),
      `${context}.captured_at`,
    ),
    collector: parseCollector(requiredField(value, "collector", context), `${context}.collector`),
    sensor,
    verifier: parseVerifierRef(requiredField(value, "verifier", context), `${context}.verifier`),
    artifacts,
  };
}

function parseProvenance(value: unknown, context: string): RiddleProofGroundedCaptureProvenance {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["algorithm", "key_id", "signature_base64"], context);
  if (requiredField(value, "algorithm", context) !== "ed25519") {
    throw new Error(`${context}.algorithm must be ed25519.`);
  }
  const signature = requiredField(value, "signature_base64", context);
  const decodedSignature = decodeCanonicalBase64(signature, `${context}.signature_base64`, 64);
  if (decodedSignature.length !== 64) {
    throw new Error(`${context}.signature_base64 must encode exactly 64 bytes.`);
  }
  return {
    algorithm: "ed25519",
    key_id: requiredString(value, "key_id", context, MAX_IDENTIFIER_LENGTH),
    signature_base64: signature as string,
  };
}

function parseBundle(value: unknown): ParsedBundle {
  const context = "signed capture bundle";
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["version", "statement", "inline_artifacts", "provenance"], context);
  if (requiredField(value, "version", context) !== RIDDLE_PROOF_SIGNED_CAPTURE_BUNDLE_VERSION) {
    throw new Error(`${context}.version is unsupported.`);
  }
  const statement = parseStatement(requiredField(value, "statement", context), `${context}.statement`);
  const inlineValues = readDenseDataArray(
    requiredField(value, "inline_artifacts", context),
    `${context}.inline_artifacts`,
    RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_ARTIFACTS,
  );
  if (inlineValues.length !== statement.artifacts.length) {
    throw new Error(`${context}.inline_artifacts must exactly match the signed manifest count.`);
  }
  const inlineArtifacts = inlineValues.map((entry, index) =>
    parseInlineArtifact(entry, `${context}.inline_artifacts[${index}]`));
  const decodedArtifacts: Uint8Array[] = [];
  let totalBytes = 0;
  for (let index = 0; index < statement.artifacts.length; index += 1) {
    const manifest = statement.artifacts[index];
    const inline = inlineArtifacts[index];
    if (inline.artifact_id !== manifest.artifact_id) {
      throw new Error(`${context}.inline_artifacts[${index}] must have the manifest artifact_id at the same index.`);
    }
    const decoded = decodeCanonicalBase64(
      inline.bytes_base64,
      `${context}.inline_artifacts[${index}].bytes_base64`,
      RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_ARTIFACT_BYTES,
    );
    if (decoded.byteLength !== manifest.byte_length) {
      throw new Error(`${context}.inline_artifacts[${index}] byte length does not match its signed manifest.`);
    }
    if (sha256Bytes(decoded) !== manifest.artifact_digest) {
      throw new Error(`${context}.inline_artifacts[${index}] digest does not match its signed manifest.`);
    }
    totalBytes += decoded.byteLength;
    if (totalBytes > RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_TOTAL_ARTIFACT_BYTES) {
      throw new Error(`${context} exceeds the total decoded byte limit.`);
    }
    decodedArtifacts.push(decoded);
  }
  return {
    bundle: {
      version: RIDDLE_PROOF_SIGNED_CAPTURE_BUNDLE_VERSION,
      statement,
      inline_artifacts: inlineArtifacts,
      provenance: parseProvenance(
        requiredField(value, "provenance", context),
        `${context}.provenance`,
      ),
    },
    decoded_artifacts: decodedArtifacts,
  };
}

function assertArtifactIdsUniqueAndSorted(
  artifacts: ReadonlyArray<{ artifact_id: string }>,
  context: string,
): void {
  const seen = new Set<string>();
  for (let index = 0; index < artifacts.length; index += 1) {
    const id = artifacts[index].artifact_id;
    if (seen.has(id)) throw new Error(`${context} repeats artifact_id ${id}.`);
    seen.add(id);
    if (index > 0 && artifacts[index - 1].artifact_id >= id) {
      throw new Error(`${context} must be strictly sorted by artifact_id.`);
    }
  }
}

function parseArtifactInput(
  value: unknown,
  context: string,
): { manifest: RiddleProofGroundedArtifactManifestEntry; inline: RiddleProofGroundedInlineArtifact } {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["artifact_id", "role", "media_type", "bytes_base64"], context);
  const bytesBase64 = requiredField(value, "bytes_base64", context);
  const bytes = decodeCanonicalBase64(
    bytesBase64,
    `${context}.bytes_base64`,
    RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_ARTIFACT_BYTES,
  );
  const artifactId = requiredString(value, "artifact_id", context, MAX_IDENTIFIER_LENGTH);
  return {
    manifest: {
      artifact_id: artifactId,
      role: requiredString(value, "role", context, MAX_IDENTIFIER_LENGTH),
      media_type: requiredString(value, "media_type", context, MAX_MEDIA_TYPE_LENGTH),
      byte_length: bytes.byteLength,
      artifact_digest: sha256Bytes(bytes),
    },
    inline: {
      artifact_id: artifactId,
      encoding: "base64",
      bytes_base64: bytesBase64 as string,
    },
  };
}

function signaturePayload(
  statement: RiddleProofGroundedCaptureStatement,
  protectedHeader: {
    bundle_version: typeof RIDDLE_PROOF_SIGNED_CAPTURE_BUNDLE_VERSION;
    algorithm: "ed25519";
    key_id: string;
  },
): Uint8Array {
  return Buffer.concat([
    Buffer.from(RIDDLE_PROOF_SIGNED_CAPTURE_SIGNATURE_DOMAIN, "utf8"),
    Buffer.from(stableJson(protectedHeader), "utf8"),
    Buffer.from("\0", "utf8"),
    Buffer.from(stableJson(statement), "utf8"),
  ]);
}

function parseSigningKey(value: unknown): RiddleProofGroundedSigningKey {
  const context = "signed capture input.signing_key";
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["key_id", "private_key_pkcs8_base64"], context);
  const privateKeyBase64 = requiredField(value, "private_key_pkcs8_base64", context);
  decodeCanonicalBase64(privateKeyBase64, `${context}.private_key_pkcs8_base64`, MAX_KEY_BYTES);
  return {
    key_id: requiredString(value, "key_id", context, MAX_IDENTIFIER_LENGTH),
    private_key_pkcs8_base64: privateKeyBase64 as string,
  };
}

export function createRiddleProofSignedCaptureBundle(
  input: CreateRiddleProofSignedCaptureBundleInput,
): RiddleProofSignedCaptureBundleCreationResult {
  try {
    const context = "signed capture input";
    if (!isPlainRecord(input)) throw new Error(`${context} must be a plain object.`);
    assertOnlyKeys(
      input,
      ["scope", "nonce", "captured_at", "collector", "sensor", "verifier", "artifacts", "signing_key"],
      context,
    );
    const scope = parseScope(requiredField(input, "scope", context), `${context}.scope`);
    const sensor = parseSensor(requiredField(input, "sensor", context), `${context}.sensor`);
    if (sensor.observed_target !== scope.target) {
      throw new Error(`${context}.sensor.observed_target must exactly match scope.target.`);
    }
    const artifactValues = readDenseDataArray(
      requiredField(input, "artifacts", context),
      `${context}.artifacts`,
      RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_ARTIFACTS,
    );
    if (artifactValues.length === 0) throw new Error(`${context}.artifacts must not be empty.`);
    const artifacts: Array<ReturnType<typeof parseArtifactInput>> = [];
    let totalBytes = 0;
    for (let index = 0; index < artifactValues.length; index += 1) {
      const artifact = parseArtifactInput(
        artifactValues[index],
        `${context}.artifacts[${index}]`,
      );
      totalBytes += artifact.manifest.byte_length;
      if (totalBytes > RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_TOTAL_ARTIFACT_BYTES) {
        throw new Error(
          `${context}.artifacts exceed the total decoded byte limit at artifact ${index}.`,
        );
      }
      artifacts.push(artifact);
    }
    artifacts.sort((left, right) => left.manifest.artifact_id < right.manifest.artifact_id
        ? -1
        : left.manifest.artifact_id > right.manifest.artifact_id ? 1 : 0);
    assertArtifactIdsUniqueAndSorted(artifacts.map((entry) => entry.manifest), `${context}.artifacts`);
    const statement: RiddleProofGroundedCaptureStatement = {
      version: RIDDLE_PROOF_GROUNDED_CAPTURE_STATEMENT_VERSION,
      scope,
      nonce: parseNonce(requiredField(input, "nonce", context), `${context}.nonce`),
      captured_at: parseCanonicalTimestamp(
        requiredField(input, "captured_at", context),
        `${context}.captured_at`,
      ),
      collector: parseCollector(requiredField(input, "collector", context), `${context}.collector`),
      sensor,
      verifier: parseVerifierRef(requiredField(input, "verifier", context), `${context}.verifier`),
      artifacts: artifacts.map((entry) => entry.manifest),
    };
    const signingKey = parseSigningKey(requiredField(input, "signing_key", context));
    const privateKeyBytes = decodeCanonicalBase64(
      signingKey.private_key_pkcs8_base64,
      `${context}.signing_key.private_key_pkcs8_base64`,
      MAX_KEY_BYTES,
    );
    const privateKey = createPrivateKey({ key: Buffer.from(privateKeyBytes), format: "der", type: "pkcs8" });
    if (privateKey.asymmetricKeyType !== "ed25519") {
      throw new Error(`${context}.signing_key must contain an Ed25519 PKCS8 private key.`);
    }
    const canonicalPrivateKey = privateKey.export({ format: "der", type: "pkcs8" });
    if (!Buffer.from(privateKeyBytes).equals(canonicalPrivateKey)) {
      throw new Error(
        `${context}.signing_key.private_key_pkcs8_base64 must contain canonical DER without trailing bytes.`,
      );
    }
    const signature = signBytes(null, signaturePayload(statement, {
      bundle_version: RIDDLE_PROOF_SIGNED_CAPTURE_BUNDLE_VERSION,
      algorithm: "ed25519",
      key_id: signingKey.key_id,
    }), privateKey);
    const bundle: RiddleProofSignedCaptureBundle = {
      version: RIDDLE_PROOF_SIGNED_CAPTURE_BUNDLE_VERSION,
      statement,
      inline_artifacts: artifacts.map((entry) => entry.inline),
      provenance: {
        algorithm: "ed25519",
        key_id: signingKey.key_id,
        signature_base64: signature.toString("base64"),
      },
    };
    return { ok: true, bundle };
  } catch (error) {
    return failure("invalid_input", `Signed capture bundle creation failed: ${safeErrorMessage(error)}`);
  }
}

function parseExpectedSigner(value: unknown, context: string): RiddleProofGroundedExpectedSigner {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["key_id", "public_key_spki_sha256"], context);
  return {
    key_id: requiredString(value, "key_id", context, MAX_IDENTIFIER_LENGTH),
    public_key_spki_sha256: fullSha256(
      requiredField(value, "public_key_spki_sha256", context),
      `${context}.public_key_spki_sha256`,
    ),
  };
}

function parseRequiredArtifactRoles(value: unknown, context: string): [string, ...string[]] {
  const entries = readDenseDataArray(
    value,
    context,
    RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_ARTIFACTS,
  );
  if (entries.length === 0) throw new Error(`${context} must not be empty.`);
  const roles = entries.map((entry, index) =>
    exactString(entry, `${context}[${index}]`, MAX_IDENTIFIER_LENGTH));
  const seen = new Set<string>();
  for (const role of roles) {
    if (seen.has(role)) throw new Error(`${context} repeats role ${role}.`);
    seen.add(role);
  }
  return roles as [string, ...string[]];
}

function parseOptionalBundleId(value: unknown, context: string): string | undefined {
  if (value === undefined) return undefined;
  const id = exactString(value, context, 69);
  if (!/^rpgb_[0-9a-f]{64}$/u.test(id)) {
    throw new Error(`${context} must be a full lowercase rpgb content ID.`);
  }
  return id;
}

function parsePolicy(value: unknown): RiddleProofGroundedCaptureVerificationPolicy {
  const context = "signed capture verification policy";
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(
    value,
    [
      "expected_scope",
      "expected_nonce",
      "expected_collector",
      "expected_sensor",
      "expected_verifier",
      "expected_signer",
      "verification_time",
      "max_capture_age_ms",
      "max_future_skew_ms",
      "required_artifact_roles",
      "expected_bundle_id",
      "expected_statement_digest",
    ],
    context,
  );
  const expectedBundleId = parseOptionalBundleId(
    optionalField(value, "expected_bundle_id", context),
    `${context}.expected_bundle_id`,
  );
  const expectedStatementDigestValue = optionalField(
    value,
    "expected_statement_digest",
    context,
  );
  const expectedStatementDigest = expectedStatementDigestValue === undefined
    ? undefined
    : fullSha256(expectedStatementDigestValue, `${context}.expected_statement_digest`);
  if (expectedBundleId && expectedStatementDigest) {
    throw new Error(`${context} may bind expected_bundle_id or expected_statement_digest, not both.`);
  }
  return {
    expected_scope: parseScope(requiredField(value, "expected_scope", context), `${context}.expected_scope`),
    expected_nonce: parseNonce(requiredField(value, "expected_nonce", context), `${context}.expected_nonce`),
    expected_collector: parseCollector(
      requiredField(value, "expected_collector", context),
      `${context}.expected_collector`,
    ),
    expected_sensor: parseSensor(
      requiredField(value, "expected_sensor", context),
      `${context}.expected_sensor`,
    ),
    expected_verifier: parseVerifierRef(
      requiredField(value, "expected_verifier", context),
      `${context}.expected_verifier`,
    ),
    expected_signer: parseExpectedSigner(
      requiredField(value, "expected_signer", context),
      `${context}.expected_signer`,
    ),
    verification_time: parseCanonicalTimestamp(
      requiredField(value, "verification_time", context),
      `${context}.verification_time`,
    ),
    max_capture_age_ms: parseSafeMilliseconds(
      requiredField(value, "max_capture_age_ms", context),
      `${context}.max_capture_age_ms`,
    ),
    max_future_skew_ms: parseSafeMilliseconds(
      requiredField(value, "max_future_skew_ms", context),
      `${context}.max_future_skew_ms`,
    ),
    required_artifact_roles: parseRequiredArtifactRoles(
      requiredField(value, "required_artifact_roles", context),
      `${context}.required_artifact_roles`,
    ),
    ...(expectedBundleId ? { expected_bundle_id: expectedBundleId } : {}),
    ...(expectedStatementDigest ? { expected_statement_digest: expectedStatementDigest } : {}),
  };
}

function parseTrustedSigners(value: unknown): Array<{
  entry: RiddleProofGroundedTrustedSigner;
  key_bytes: Uint8Array;
  fingerprint: string;
}> {
  const entries = readDenseDataArray(value, "trusted signer registry", 256);
  if (entries.length === 0) throw new Error("trusted signer registry must not be empty.");
  const seen = new Set<string>();
  return entries.map((valueEntry, index) => {
    const context = `trusted signer registry[${index}]`;
    if (!isPlainRecord(valueEntry)) throw new Error(`${context} must be a plain object.`);
    assertOnlyKeys(valueEntry, ["key_id", "public_key_spki_base64"], context);
    const keyId = requiredString(valueEntry, "key_id", context, MAX_IDENTIFIER_LENGTH);
    if (seen.has(keyId)) throw new Error(`trusted signer registry repeats key_id ${keyId}.`);
    seen.add(keyId);
    const encoded = requiredField(valueEntry, "public_key_spki_base64", context);
    const keyBytes = decodeCanonicalBase64(encoded, `${context}.public_key_spki_base64`, MAX_KEY_BYTES);
    const publicKey = createPublicKey({ key: Buffer.from(keyBytes), format: "der", type: "spki" });
    if (publicKey.asymmetricKeyType !== "ed25519") {
      throw new Error(`${context} must contain an Ed25519 SPKI public key.`);
    }
    const canonicalPublicKey = publicKey.export({ format: "der", type: "spki" });
    if (!Buffer.from(keyBytes).equals(canonicalPublicKey)) {
      throw new Error(
        `${context}.public_key_spki_base64 must contain canonical DER without trailing bytes.`,
      );
    }
    return {
      entry: { key_id: keyId, public_key_spki_base64: encoded as string },
      key_bytes: keyBytes,
      fingerprint: sha256Bytes(keyBytes),
    };
  });
}

function parseVerifierRegistry(value: unknown): RiddleProofGroundedVerifierRegistration[] {
  const entries = readDenseDataArray(value, "grounded verifier registry", 256);
  if (entries.length === 0) throw new Error("grounded verifier registry must not be empty.");
  const seen = new Set<string>();
  return entries.map((entry, index) => {
    const context = `grounded verifier registry[${index}]`;
    if (!isPlainRecord(entry)) throw new Error(`${context} must be a plain object.`);
    const trustBasis = parseVerifierTrustBasis(
      requiredField(entry, "trust_basis", context),
      `${context}.trust_basis`,
    );
    const ref: RiddleProofGroundedVerifierRef = {
      verifier_id: requiredString(entry, "verifier_id", context, MAX_IDENTIFIER_LENGTH),
      verifier_version: requiredString(entry, "verifier_version", context, MAX_IDENTIFIER_LENGTH),
      implementation_digest: fullSha256(
        requiredField(entry, "implementation_digest", context),
        `${context}.implementation_digest`,
      ),
      trust_basis: trustBasis,
    };
    const identity = stableJson(ref);
    if (seen.has(identity)) throw new Error(`${context} repeats a verifier identity.`);
    seen.add(identity);
    if (trustBasis.kind === "external_registry") {
      assertOnlyKeys(
        entry,
        ["verifier_id", "verifier_version", "implementation_digest", "trust_basis", "verify"],
        context,
      );
      const verify = requiredField(entry, "verify", context);
      if (typeof verify !== "function") throw new Error(`${context}.verify must be a function.`);
      return deepFreezeNormalized({
        ...ref,
        trust_basis: trustBasis,
        verify: verify as RiddleProofGroundedExternalVerifierRegistration["verify"],
      });
    }
    assertOnlyKeys(
      entry,
      ["verifier_id", "verifier_version", "implementation_digest", "trust_basis", "program"],
      context,
    );
    const built = buildDeclarativeJsonVerifierDefinition({
      verifier_id: ref.verifier_id,
      verifier_version: ref.verifier_version,
      program: requiredField(entry, "program", context),
    });
    if (built.verifier_ref.implementation_digest !== ref.implementation_digest) {
      throw new Error(
        `${context}.implementation_digest does not match its canonical declarative definition.`,
      );
    }
    return built.registration;
  });
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function verifierInput(
  statement: RiddleProofGroundedCaptureStatement,
  decodedArtifacts: Uint8Array[],
): RiddleProofGroundedVerifierInput {
  return {
    scope: { ...statement.scope },
    nonce: statement.nonce,
    captured_at: statement.captured_at,
    collector: { ...statement.collector },
    sensor: {
      ...statement.sensor,
      ...(statement.sensor.metadata
        ? { metadata: parseJsonObject(statement.sensor.metadata, "verified sensor metadata") }
        : {}),
    },
    artifacts: statement.artifacts.map((artifact, index) => ({
      ...artifact,
      bytes: new Uint8Array(decodedArtifacts[index]),
    })),
  };
}

function parseVerifierObservation(value: unknown, context: string): JsonValue {
  strictJsonByteSize(value, context, RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_OBSERVATION_BYTES);
  const observation = cloneJsonValue(value, context);
  if (Buffer.byteLength(stableJson(observation), "utf8") > RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_OBSERVATION_BYTES) {
    throw new Error(`${context} exceeds the canonical observation byte limit.`);
  }
  return observation;
}

function bundleId(bundle: RiddleProofSignedCaptureBundle): string {
  const identityBody = {
    version: bundle.version,
    statement: bundle.statement,
    provenance: bundle.provenance,
  };
  return `rpgb_${sha256Json(identityBody).slice("sha256:".length)}`;
}

export function verifyRiddleProofSignedCaptureBundle(
  input: VerifyRiddleProofSignedCaptureBundleInput,
): RiddleProofSignedCaptureBundleVerificationResult {
  let parsed: ParsedBundle;
  try {
    if (!isPlainRecord(input)) throw new Error("signed capture verification input must be a plain object.");
    assertOnlyKeys(
      input,
      ["bundle", "policy", "trusted_signers", "verifier_registry"],
      "signed capture verification input",
    );
    parsed = parseBundle(requiredField(input, "bundle", "signed capture verification input"));
  } catch (error) {
    return failure("invalid_bundle", `Signed capture bundle did not parse: ${safeErrorMessage(error)}`);
  }

  let policy: RiddleProofGroundedCaptureVerificationPolicy;
  let trustedSigners: ReturnType<typeof parseTrustedSigners>;
  let verifierRegistry: RiddleProofGroundedVerifierRegistration[];
  try {
    policy = parsePolicy(requiredField(input, "policy", "signed capture verification input"));
    trustedSigners = parseTrustedSigners(
      requiredField(input, "trusted_signers", "signed capture verification input"),
    );
    verifierRegistry = parseVerifierRegistry(
      requiredField(input, "verifier_registry", "signed capture verification input"),
    );
  } catch (error) {
    return failure("invalid_input", `Signed capture verification configuration is invalid: ${safeErrorMessage(error)}`);
  }

  const { bundle, decoded_artifacts: decodedArtifacts } = parsed;
  const { statement } = bundle;
  const observedBundleId = bundleId(bundle);
  const observedStatementDigest = sha256Json(statement);
  if (policy.expected_bundle_id && policy.expected_bundle_id !== observedBundleId) {
    return failure("policy_mismatch", "Signed capture bundle does not match expected_bundle_id.");
  }
  if (
    policy.expected_statement_digest
    && policy.expected_statement_digest !== observedStatementDigest
  ) {
    return failure(
      "policy_mismatch",
      "Signed capture statement does not match expected_statement_digest.",
    );
  }
  if (!sameJson(statement.scope, policy.expected_scope)) {
    return failure("policy_mismatch", "Signed capture scope does not match the independent expected scope.");
  }
  if (statement.nonce !== policy.expected_nonce) {
    return failure("policy_mismatch", "Signed capture nonce does not match the independent expected challenge nonce.");
  }
  if (!sameJson(statement.collector, policy.expected_collector)) {
    return failure("policy_mismatch", "Signed capture collector does not match the independent expected collector.");
  }
  if (!sameJson(statement.sensor, policy.expected_sensor)) {
    return failure("policy_mismatch", "Signed capture sensor does not match the independent expected sensor.");
  }
  if (!sameJson(statement.verifier, policy.expected_verifier)) {
    return failure("policy_mismatch", "Signed capture verifier does not match the independent expected verifier.");
  }
  if (bundle.provenance.key_id !== policy.expected_signer.key_id) {
    return failure("policy_mismatch", "Signed capture signer key_id does not match the independent expected signer.");
  }
  const observedRoles = new Set(statement.artifacts.map((artifact) => artifact.role));
  for (const requiredRole of policy.required_artifact_roles) {
    if (!observedRoles.has(requiredRole)) {
      return failure(
        "policy_mismatch",
        `Signed capture is missing independently required artifact role ${requiredRole}.`,
      );
    }
  }

  const capturedMilliseconds = Date.parse(statement.captured_at);
  const verificationMilliseconds = Date.parse(policy.verification_time);
  if (capturedMilliseconds < verificationMilliseconds - policy.max_capture_age_ms) {
    return failure("capture_stale", "Signed capture is older than the allowed capture age.");
  }
  if (capturedMilliseconds > verificationMilliseconds + policy.max_future_skew_ms) {
    return failure("capture_from_future", "Signed capture is later than the allowed future clock skew.");
  }

  const signer = trustedSigners.find((candidate) =>
    candidate.entry.key_id === bundle.provenance.key_id
    && candidate.fingerprint === policy.expected_signer.public_key_spki_sha256);
  if (!signer) {
    return failure(
      "signer_not_trusted",
      "No independently trusted signer matches both the expected key_id and SPKI fingerprint.",
    );
  }
  try {
    const publicKey = createPublicKey({ key: Buffer.from(signer.key_bytes), format: "der", type: "spki" });
    const signature = decodeCanonicalBase64(
      bundle.provenance.signature_base64,
      "signed capture provenance.signature_base64",
      64,
    );
    if (!verifyBytes(null, signaturePayload(statement, {
      bundle_version: bundle.version,
      algorithm: bundle.provenance.algorithm,
      key_id: bundle.provenance.key_id,
    }), publicKey, signature)) {
      return failure("signature_invalid", "Signed capture provenance signature is invalid.");
    }
  } catch (error) {
    return failure("signature_invalid", `Signed capture signature verification failed: ${safeErrorMessage(error)}`);
  }

  const verifier = verifierRegistry.find((candidate) =>
    sameJson(
      {
        verifier_id: candidate.verifier_id,
        verifier_version: candidate.verifier_version,
        implementation_digest: candidate.implementation_digest,
        trust_basis: candidate.trust_basis,
      },
      statement.verifier,
    ));
  if (!verifier) {
    return failure(
      "verifier_not_registered",
      "No trusted verifier registration matches the signed verifier id, version, implementation digest, and trust basis.",
    );
  }

  let firstObservation: JsonValue;
  let secondObservation: JsonValue;
  if (isDeclarativeJsonVerifierRegistration(verifier)) {
    const interpreted = interpretDeclarativeJsonVerifier(
      verifier,
      verifierInput(statement, decodedArtifacts),
    );
    if (!interpreted.ok) return failure("verifier_rejected", interpreted.message);
    try {
      firstObservation = parseVerifierObservation(
        interpreted.observation,
        "grounded declarative verifier observation",
      );
      secondObservation = cloneJsonValue(
        firstObservation,
        "grounded declarative verifier deterministic observation",
      );
    } catch (error) {
      return failure(
        "verifier_rejected",
        `Grounded declarative verifier observation is invalid: ${safeErrorMessage(error)}`,
      );
    }
  } else {
    try {
      const verifyCallback = verifier.verify;
      firstObservation = parseVerifierObservation(
        Reflect.apply(verifyCallback, undefined, [verifierInput(statement, decodedArtifacts)]),
        "grounded verifier first observation",
      );
      secondObservation = parseVerifierObservation(
        Reflect.apply(verifyCallback, undefined, [verifierInput(statement, decodedArtifacts)]),
        "grounded verifier second observation",
      );
    } catch (error) {
      return failure("verifier_error", `Grounded verifier failed: ${safeErrorMessage(error)}`);
    }
  }
  if (!sameJson(firstObservation, secondObservation)) {
    return failure(
      "verifier_nondeterministic",
      "Grounded verifier returned different canonical observations for identical artifact bytes.",
    );
  }

  return {
    ok: true,
    bundle,
    verified_capture: {
      bundle_id: observedBundleId,
      statement_digest: observedStatementDigest,
      artifact_manifest_digest: sha256Json(statement.artifacts),
      signer: {
        algorithm: "ed25519",
        key_id: signer.entry.key_id,
        public_key_spki_sha256: signer.fingerprint,
      },
      verification_time: policy.verification_time,
      max_capture_age_ms: policy.max_capture_age_ms,
      max_future_skew_ms: policy.max_future_skew_ms,
      required_artifact_roles: [...policy.required_artifact_roles] as [string, ...string[]],
      ...(policy.expected_bundle_id ? { expected_bundle_id: policy.expected_bundle_id } : {}),
      ...(policy.expected_statement_digest
        ? { expected_statement_digest: policy.expected_statement_digest }
        : {}),
      observation: firstObservation,
      observation_digest: sha256Json(firstObservation),
    },
  };
}

export interface RiddleProofGroundedSemanticContractRef {
  contract_id: string;
  contract_version: string;
  implementation_digest: string;
  trust_basis: RiddleProofGroundedSemanticContractTrustBasis;
}

export interface RiddleProofGroundedSemanticContractDescriptor
  extends RiddleProofGroundedSemanticContractRef {
  label: string;
  claim: RiddleProofSemanticClaim;
}

export type RiddleProofGroundedDeclarativeJsonSource = "observation" | "scope";

export type RiddleProofGroundedDeclarativeJsonAssertion =
  | {
      op: "exists";
      source: RiddleProofGroundedDeclarativeJsonSource;
      pointer: string;
    }
  | {
      op: "equals";
      source: RiddleProofGroundedDeclarativeJsonSource;
      pointer: string;
      value: JsonValue;
    }
  | {
      op: "type_is";
      source: RiddleProofGroundedDeclarativeJsonSource;
      pointer: string;
      type: "null" | "boolean" | "number" | "string" | "array" | "object";
    };

export interface RiddleProofGroundedDeclarativeJsonContractProgram {
  all: [
    RiddleProofGroundedDeclarativeJsonAssertion,
    ...RiddleProofGroundedDeclarativeJsonAssertion[],
  ];
}

export interface RiddleProofGroundedDeclarativeJsonContractDefinition {
  contract_id: string;
  contract_version: string;
  label: string;
  claim: RiddleProofSemanticClaim;
  program: RiddleProofGroundedDeclarativeJsonContractProgram;
}

export interface RiddleProofGroundedExternalSemanticContractRegistration<Observation = JsonValue>
  extends RiddleProofGroundedSemanticContractDescriptor {
  trust_basis: RiddleProofGroundedExternalRegistryTrustBasis;
  accepts: (scope: RiddleProofSemanticScope, observation: Observation) => boolean;
}

export interface RiddleProofGroundedDeclarativeJsonContractRegistration
  extends RiddleProofGroundedSemanticContractDescriptor {
  trust_basis: RiddleProofGroundedDeclarativeJsonContractTrustBasis;
  program: RiddleProofGroundedDeclarativeJsonContractProgram;
}

export type RiddleProofGroundedSemanticContractRegistration<Observation = JsonValue> =
  | RiddleProofGroundedExternalSemanticContractRegistration<Observation>
  | RiddleProofGroundedDeclarativeJsonContractRegistration;

function isDeclarativeJsonContractRegistration(
  registration: RiddleProofGroundedSemanticContractRegistration,
): registration is RiddleProofGroundedDeclarativeJsonContractRegistration {
  return registration.trust_basis.kind === "builtin_declarative_json"
    && registration.trust_basis.engine
      === RIDDLE_PROOF_GROUNDED_DECLARATIVE_JSON_CONTRACT_ENGINE;
}

export type RiddleProofGroundedDeclarativeJsonContractDefinitionResult =
  | {
      ok: true;
      contract_ref: RiddleProofGroundedSemanticContractRef;
      registration: RiddleProofGroundedDeclarativeJsonContractRegistration;
    }
  | { ok: false; error: RiddleProofGroundedSemanticError };

export interface RiddleProofGroundedVerificationReceiptBody {
  version: typeof RIDDLE_PROOF_GROUNDED_VERIFICATION_RECEIPT_VERSION;
  bundle_id: string;
  statement_digest: string;
  artifact_manifest_digest: string;
  signer: RiddleProofVerifiedSignedCapture["signer"];
  policy: RiddleProofGroundedCaptureVerificationPolicy;
  verifier: RiddleProofGroundedVerifierRef;
  artifacts: RiddleProofGroundedArtifactManifestEntry[];
  observation: JsonValue;
  observation_digest: string;
  contract: RiddleProofGroundedSemanticContractDescriptor;
  issued_at: string;
}

export interface RiddleProofGroundedVerificationReceipt
  extends RiddleProofGroundedVerificationReceiptBody {
  receipt_id: string;
}

export interface RiddleProofGroundedSemanticCertificateBinding {
  certificate_id: string;
  bundle: RiddleProofSignedCaptureBundle;
  receipt: RiddleProofGroundedVerificationReceipt;
}

export interface RiddleProofGroundedSemanticCertificateClosure {
  version: typeof RIDDLE_PROOF_GROUNDED_SEMANTIC_CERTIFICATE_CLOSURE_VERSION;
  closure: RiddleProofSemanticCertificateClosure;
  groundings: [
    RiddleProofGroundedSemanticCertificateBinding,
    ...RiddleProofGroundedSemanticCertificateBinding[],
  ];
}

export interface RiddleProofGroundedReplayConfiguration {
  policy: RiddleProofGroundedCaptureVerificationPolicy;
  trusted_signers: [
    RiddleProofGroundedTrustedSigner,
    ...RiddleProofGroundedTrustedSigner[],
  ];
  verifier_registry: [
    RiddleProofGroundedVerifierRegistration,
    ...RiddleProofGroundedVerifierRegistration[],
  ];
  contract_registry: [
    RiddleProofGroundedSemanticContractRegistration,
    ...RiddleProofGroundedSemanticContractRegistration[],
  ];
  expected_contract: RiddleProofGroundedSemanticContractRef;
}

export interface RiddleProofGroundedReplayContext
  extends RiddleProofGroundedReplayConfiguration {
  certificate_id: string;
}

export interface CreateRiddleProofGroundedSemanticCertificateInput
  extends Omit<VerifyRiddleProofSignedCaptureBundleInput, "bundle"> {
  bundle: unknown;
  contract_registry: [
    RiddleProofGroundedSemanticContractRegistration,
    ...RiddleProofGroundedSemanticContractRegistration[],
  ];
  expected_contract: RiddleProofGroundedSemanticContractRef;
  issued_at: string;
}

export interface ReplayRiddleProofGroundedSemanticCertificateInput {
  grounding: unknown;
  configuration: RiddleProofGroundedReplayConfiguration;
}

export interface CreateRiddleProofGroundedSemanticAtomicCertificateClosureInput {
  certificate: unknown;
  grounding: unknown;
  configuration: RiddleProofGroundedReplayConfiguration;
}

export interface ComposeRiddleProofGroundedSemanticCertificateClosuresInput {
  rule: RiddleProofSemanticRule;
  closures: [unknown, ...unknown[]];
  issued_at: string;
  replay_contexts: [RiddleProofGroundedReplayContext, ...RiddleProofGroundedReplayContext[]];
}

export interface ValidateRiddleProofGroundedSemanticCertificateClosureInput {
  grounded_closure: unknown;
  replay_contexts: [RiddleProofGroundedReplayContext, ...RiddleProofGroundedReplayContext[]];
}

export interface MatchRiddleProofGroundedSemanticCertificateClosureInput
  extends ValidateRiddleProofGroundedSemanticCertificateClosureInput {
  expected_root_certificate_id: string;
  expected_scope: RiddleProofSemanticScope;
  expected_claim: RiddleProofSemanticClaimExpectation;
  expected_assurance: RiddleProofSemanticAssurance;
}

export type RiddleProofGroundedSemanticErrorCode =
  | RiddleProofGroundedCaptureErrorCode
  | "contract_not_registered"
  | "contract_error"
  | "contract_rejected"
  | "contract_nondeterministic"
  | "invalid_receipt"
  | "receipt_mismatch"
  | "certificate_mismatch"
  | "invalid_grounding"
  | "invalid_grounded_closure"
  | "duplicate_grounding"
  | "missing_grounding"
  | "extra_grounding"
  | "composite_grounding"
  | "replay_context_mismatch"
  | "semantic_closure_invalid"
  | "semantic_composition_failed"
  | "root_mismatch";

export interface RiddleProofGroundedSemanticError {
  code: RiddleProofGroundedSemanticErrorCode;
  message: string;
  cause?: unknown;
}

export type RiddleProofGroundedSemanticCertificateResult =
  | {
      ok: true;
      certificate: RiddleProofSemanticCertificate;
      receipt: RiddleProofGroundedVerificationReceipt;
      grounding: RiddleProofGroundedSemanticCertificateBinding;
    }
  | { ok: false; error: RiddleProofGroundedSemanticError };

export type RiddleProofGroundedSemanticCertificateReplayResult =
  | {
      ok: true;
      certificate: RiddleProofSemanticCertificate;
      receipt: RiddleProofGroundedVerificationReceipt;
      grounding: RiddleProofGroundedSemanticCertificateBinding;
    }
  | { ok: false; error: RiddleProofGroundedSemanticError };

export type RiddleProofGroundedSemanticCertificateClosureValidationResult =
  | {
      ok: true;
      grounded_closure: RiddleProofGroundedSemanticCertificateClosure;
      root_certificate: RiddleProofSemanticCertificate;
    }
  | { ok: false; error: RiddleProofGroundedSemanticError };

export type RiddleProofGroundedSemanticCertificateClosureCompositionResult =
  | {
      ok: true;
      certificate: RiddleProofSemanticCertificate;
      grounded_closure: RiddleProofGroundedSemanticCertificateClosure;
    }
  | { ok: false; error: RiddleProofGroundedSemanticError };

export type RiddleProofGroundedSemanticCertificateClosureMatchResult =
  | {
      ok: true;
      grounded_closure: RiddleProofGroundedSemanticCertificateClosure;
      root_certificate: RiddleProofSemanticCertificate;
    }
  | { ok: false; error: RiddleProofGroundedSemanticError };

function groundedFailure(
  code: RiddleProofGroundedSemanticErrorCode,
  message: string,
  cause?: unknown,
): { ok: false; error: RiddleProofGroundedSemanticError } {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(cause === undefined ? {} : { cause }),
    },
  };
}

function parseSemanticClaimRef(
  value: unknown,
  context: string,
  requireLabel: boolean,
): RiddleProofSemanticClaim | RiddleProofSemanticClaimRef {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(
    value,
    ["claim_id", "claim_version", "parameters", ...(requireLabel ? ["label"] : [])],
    context,
  );
  const parametersValue = optionalField(value, "parameters", context);
  const base: RiddleProofSemanticClaimRef = {
    claim_id: requiredString(value, "claim_id", context, MAX_IDENTIFIER_LENGTH),
    claim_version: requiredString(value, "claim_version", context, MAX_IDENTIFIER_LENGTH),
    ...(parametersValue === undefined
      ? {}
      : { parameters: parseJsonObject(parametersValue, `${context}.parameters`) }),
  };
  return requireLabel
    ? { ...base, label: requiredString(value, "label", context, MAX_LABEL_LENGTH) }
    : base;
}

function parseDeclarativeJsonPointer(value: unknown, context: string): string[] {
  if (typeof value !== "string") throw new Error(`${context} must be a JSON Pointer string.`);
  if (Buffer.byteLength(value, "utf8") > RIDDLE_PROOF_GROUNDED_DECLARATIVE_MAX_POINTER_BYTES) {
    throw new Error(
      `${context} exceeds ${RIDDLE_PROOF_GROUNDED_DECLARATIVE_MAX_POINTER_BYTES} UTF-8 bytes.`,
    );
  }
  if (value === "") return [];
  if (!value.startsWith("/")) throw new Error(`${context} must be empty or begin with /.`);
  const encodedSegments = value.slice(1).split("/");
  if (encodedSegments.length > RIDDLE_PROOF_GROUNDED_DECLARATIVE_MAX_POINTER_SEGMENTS) {
    throw new Error(
      `${context} exceeds ${RIDDLE_PROOF_GROUNDED_DECLARATIVE_MAX_POINTER_SEGMENTS} segments.`,
    );
  }
  return encodedSegments.map((encoded, index) => {
    for (let offset = 0; offset < encoded.length; offset += 1) {
      if (encoded[offset] !== "~") continue;
      const escaped = encoded[offset + 1];
      if (escaped !== "0" && escaped !== "1") {
        throw new Error(`${context} segment ${index} contains an invalid ~ escape.`);
      }
      offset += 1;
    }
    const decoded = encoded.replace(/~1/gu, "/").replace(/~0/gu, "~");
    if (decoded.length > MAX_IDENTIFIER_LENGTH) {
      throw new Error(`${context} segment ${index} exceeds ${MAX_IDENTIFIER_LENGTH} characters.`);
    }
    return decoded;
  });
}

function resolveDeclarativeJsonPointer(
  root: unknown,
  pointer: string,
): { found: true; value: unknown } | { found: false } {
  let current = root;
  for (const segment of parseDeclarativeJsonPointer(pointer, "declarative JSON Pointer")) {
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/u.test(segment)) return { found: false };
      const index = Number(segment);
      if (!Number.isSafeInteger(index) || index >= current.length) return { found: false };
      const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
      if (!descriptor || descriptor.get || descriptor.set || descriptor.enumerable !== true) {
        return { found: false };
      }
      current = descriptor.value;
      continue;
    }
    if (!isPlainRecord(current)) return { found: false };
    const descriptor = Object.getOwnPropertyDescriptor(current, segment);
    if (!descriptor || descriptor.get || descriptor.set || descriptor.enumerable !== true) {
      return { found: false };
    }
    current = descriptor.value;
  }
  return { found: true, value: current };
}

function parseDeclarativeJsonVerifierProgram(
  value: unknown,
  context: string,
): RiddleProofGroundedDeclarativeJsonVerifierProgram {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["artifact", "pointer"], context);
  const artifactValue = requiredField(value, "artifact", context);
  if (!isPlainRecord(artifactValue)) throw new Error(`${context}.artifact must be a plain object.`);
  assertOnlyKeys(artifactValue, ["artifact_id", "role", "media_type"], `${context}.artifact`);
  const mediaType = requiredString(
    artifactValue,
    "media_type",
    `${context}.artifact`,
    MAX_MEDIA_TYPE_LENGTH,
  );
  if (mediaType !== "application/json") {
    throw new Error(`${context}.artifact.media_type must be application/json.`);
  }
  const pointer = requiredField(value, "pointer", context);
  parseDeclarativeJsonPointer(pointer, `${context}.pointer`);
  return deepFreezeNormalized({
    artifact: {
      artifact_id: requiredString(
        artifactValue,
        "artifact_id",
        `${context}.artifact`,
        MAX_IDENTIFIER_LENGTH,
      ),
      role: requiredString(artifactValue, "role", `${context}.artifact`, MAX_IDENTIFIER_LENGTH),
      media_type: "application/json" as const,
    },
    pointer: pointer as string,
  });
}

function parseDeclarativeJsonSource(value: unknown, context: string) {
  if (value !== "observation" && value !== "scope") {
    throw new Error(`${context} must be observation or scope.`);
  }
  return value;
}

function parseDeclarativeJsonAssertion(
  value: unknown,
  context: string,
): RiddleProofGroundedDeclarativeJsonAssertion {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  const op = requiredField(value, "op", context);
  const source = parseDeclarativeJsonSource(requiredField(value, "source", context), `${context}.source`);
  const pointerValue = requiredField(value, "pointer", context);
  parseDeclarativeJsonPointer(pointerValue, `${context}.pointer`);
  const pointer = pointerValue as string;
  if (op === "exists") {
    assertOnlyKeys(value, ["op", "source", "pointer"], context);
    return deepFreezeNormalized({ op, source, pointer });
  }
  if (op === "equals") {
    assertOnlyKeys(value, ["op", "source", "pointer", "value"], context);
    return deepFreezeNormalized({
      op,
      source,
      pointer,
      value: cloneJsonValue(requiredField(value, "value", context), `${context}.value`),
    });
  }
  if (op === "type_is") {
    assertOnlyKeys(value, ["op", "source", "pointer", "type"], context);
    const expectedType = requiredField(value, "type", context);
    if (![
      "null",
      "boolean",
      "number",
      "string",
      "array",
      "object",
    ].includes(expectedType as string)) {
      throw new Error(`${context}.type is unsupported.`);
    }
    return deepFreezeNormalized({
      op,
      source,
      pointer,
      type: expectedType as "null" | "boolean" | "number" | "string" | "array" | "object",
    });
  }
  throw new Error(`${context}.op must be exists, equals, or type_is.`);
}

function parseDeclarativeJsonContractProgram(
  value: unknown,
  context: string,
): RiddleProofGroundedDeclarativeJsonContractProgram {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["all"], context);
  const assertions = readDenseDataArray(
    requiredField(value, "all", context),
    `${context}.all`,
    RIDDLE_PROOF_GROUNDED_DECLARATIVE_MAX_ASSERTIONS,
  );
  if (assertions.length === 0) throw new Error(`${context}.all must not be empty.`);
  return deepFreezeNormalized({
    all: assertions.map((assertion, index) =>
      parseDeclarativeJsonAssertion(assertion, `${context}.all[${index}]`)) as [
        RiddleProofGroundedDeclarativeJsonAssertion,
        ...RiddleProofGroundedDeclarativeJsonAssertion[],
      ],
  });
}

function declarativeDefinitionDigest(
  engine:
    | typeof RIDDLE_PROOF_GROUNDED_DECLARATIVE_JSON_VERIFIER_ENGINE
    | typeof RIDDLE_PROOF_GROUNDED_DECLARATIVE_JSON_CONTRACT_ENGINE,
  definition: unknown,
): string {
  return sha256Bytes(Buffer.from(
    `${RIDDLE_PROOF_GROUNDED_DECLARATIVE_DEFINITION_DIGEST_DOMAIN}${stableJson({
      engine,
      definition,
    })}`,
    "utf8",
  ));
}

function normalizeDeclarativeJsonVerifierDefinition(
  value: unknown,
  context: string,
): RiddleProofGroundedDeclarativeJsonVerifierDefinition {
  strictJsonByteSize(value, context, RIDDLE_PROOF_GROUNDED_DECLARATIVE_MAX_DEFINITION_BYTES);
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["verifier_id", "verifier_version", "program"], context);
  return deepFreezeNormalized({
    verifier_id: requiredString(value, "verifier_id", context, MAX_IDENTIFIER_LENGTH),
    verifier_version: requiredString(value, "verifier_version", context, MAX_IDENTIFIER_LENGTH),
    program: parseDeclarativeJsonVerifierProgram(
      requiredField(value, "program", context),
      `${context}.program`,
    ),
  });
}

function normalizeDeclarativeJsonContractDefinition(
  value: unknown,
  context: string,
): RiddleProofGroundedDeclarativeJsonContractDefinition {
  strictJsonByteSize(value, context, RIDDLE_PROOF_GROUNDED_DECLARATIVE_MAX_DEFINITION_BYTES);
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(
    value,
    ["contract_id", "contract_version", "label", "claim", "program"],
    context,
  );
  return deepFreezeNormalized({
    contract_id: requiredString(value, "contract_id", context, MAX_IDENTIFIER_LENGTH),
    contract_version: requiredString(value, "contract_version", context, MAX_IDENTIFIER_LENGTH),
    label: requiredString(value, "label", context, MAX_LABEL_LENGTH),
    claim: parseSemanticClaimRef(
      requiredField(value, "claim", context),
      `${context}.claim`,
      true,
    ) as RiddleProofSemanticClaim,
    program: parseDeclarativeJsonContractProgram(
      requiredField(value, "program", context),
      `${context}.program`,
    ),
  });
}

function buildDeclarativeJsonVerifierDefinition(value: unknown) {
  const definition = normalizeDeclarativeJsonVerifierDefinition(
    value,
    "grounded declarative JSON verifier definition",
  );
  const implementationDigest = declarativeDefinitionDigest(
    RIDDLE_PROOF_GROUNDED_DECLARATIVE_JSON_VERIFIER_ENGINE,
    definition,
  );
  const trustBasis: RiddleProofGroundedDeclarativeJsonVerifierTrustBasis = {
    kind: "builtin_declarative_json",
    engine: RIDDLE_PROOF_GROUNDED_DECLARATIVE_JSON_VERIFIER_ENGINE,
  };
  const verifierRef: RiddleProofGroundedVerifierRef = deepFreezeNormalized({
    verifier_id: definition.verifier_id,
    verifier_version: definition.verifier_version,
    implementation_digest: implementationDigest,
    trust_basis: trustBasis,
  });
  const registration: RiddleProofGroundedDeclarativeJsonVerifierRegistration =
    deepFreezeNormalized({ ...verifierRef, program: definition.program }) as
      RiddleProofGroundedDeclarativeJsonVerifierRegistration;
  return { verifier_ref: verifierRef, registration };
}

function buildDeclarativeJsonContractDefinition(value: unknown) {
  const definition = normalizeDeclarativeJsonContractDefinition(
    value,
    "grounded declarative JSON contract definition",
  );
  const implementationDigest = declarativeDefinitionDigest(
    RIDDLE_PROOF_GROUNDED_DECLARATIVE_JSON_CONTRACT_ENGINE,
    definition,
  );
  const trustBasis: RiddleProofGroundedDeclarativeJsonContractTrustBasis = {
    kind: "builtin_declarative_json",
    engine: RIDDLE_PROOF_GROUNDED_DECLARATIVE_JSON_CONTRACT_ENGINE,
  };
  const contractRef: RiddleProofGroundedSemanticContractRef = deepFreezeNormalized({
    contract_id: definition.contract_id,
    contract_version: definition.contract_version,
    implementation_digest: implementationDigest,
    trust_basis: trustBasis,
  });
  const registration: RiddleProofGroundedDeclarativeJsonContractRegistration =
    deepFreezeNormalized({
      ...contractRef,
      label: definition.label,
      claim: definition.claim,
      program: definition.program,
    }) as RiddleProofGroundedDeclarativeJsonContractRegistration;
  return { contract_ref: contractRef, registration };
}

export function createRiddleProofGroundedDeclarativeJsonVerifier(
  definition: RiddleProofGroundedDeclarativeJsonVerifierDefinition,
): RiddleProofGroundedDeclarativeJsonVerifierDefinitionResult {
  try {
    return { ok: true, ...buildDeclarativeJsonVerifierDefinition(definition) };
  } catch (error) {
    return failure(
      "invalid_input",
      `Grounded declarative JSON verifier definition is invalid: ${safeErrorMessage(error)}`,
    );
  }
}

export function createRiddleProofGroundedDeclarativeJsonContract(
  definition: RiddleProofGroundedDeclarativeJsonContractDefinition,
): RiddleProofGroundedDeclarativeJsonContractDefinitionResult {
  try {
    return { ok: true, ...buildDeclarativeJsonContractDefinition(definition) };
  } catch (error) {
    return groundedFailure(
      "invalid_input",
      `Grounded declarative JSON contract definition is invalid: ${safeErrorMessage(error)}`,
    );
  }
}

function interpretDeclarativeJsonVerifier(
  registration: RiddleProofGroundedDeclarativeJsonVerifierRegistration,
  input: RiddleProofGroundedVerifierInput,
): { ok: true; observation: unknown } | { ok: false; message: string } {
  const expected = registration.program.artifact;
  const artifact = input.artifacts.find((candidate) => candidate.artifact_id === expected.artifact_id);
  if (!artifact) return { ok: false, message: `Required artifact ${expected.artifact_id} is absent.` };
  if (artifact.role !== expected.role || artifact.media_type !== expected.media_type) {
    return { ok: false, message: `Artifact ${expected.artifact_id} has the wrong role or media type.` };
  }
  if (
    artifact.bytes.length >= 3
    && artifact.bytes[0] === 0xef
    && artifact.bytes[1] === 0xbb
    && artifact.bytes[2] === 0xbf
  ) {
    return { ok: false, message: `Artifact ${expected.artifact_id} must not contain a UTF-8 BOM.` };
  }
  let parsed: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(artifact.bytes);
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    return {
      ok: false,
      message: `Artifact ${expected.artifact_id} is not strict UTF-8 JSON: ${safeErrorMessage(error)}`,
    };
  }
  const selected = resolveDeclarativeJsonPointer(parsed, registration.program.pointer);
  if (!selected.found) {
    return {
      ok: false,
      message: `Artifact ${expected.artifact_id} does not contain the required JSON Pointer.`,
    };
  }
  return { ok: true, observation: selected.value };
}

function declarativeJsonValueType(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value === "object" ? "object" : typeof value;
}

function evaluateDeclarativeJsonContract(
  registration: RiddleProofGroundedDeclarativeJsonContractRegistration,
  scope: RiddleProofSemanticScope,
  observation: JsonValue,
): boolean {
  for (const assertion of registration.program.all) {
    const root = assertion.source === "scope" ? scope : observation;
    const selected = resolveDeclarativeJsonPointer(root, assertion.pointer);
    if (assertion.op === "exists") {
      if (!selected.found) return false;
      continue;
    }
    if (!selected.found) return false;
    if (assertion.op === "equals") {
      if (!sameJson(selected.value, assertion.value)) return false;
      continue;
    }
    if (declarativeJsonValueType(selected.value) !== assertion.type) return false;
  }
  return true;
}

function parseSemanticClaimExpectationSnapshot(
  value: unknown,
  context: string,
): RiddleProofSemanticClaimExpectation {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["claim_id", "claim_version", "parameters", "label"], context);
  const parametersValue = optionalField(value, "parameters", context);
  const labelValue = optionalField(value, "label", context);
  return deepFreezeNormalized({
    claim_id: requiredString(value, "claim_id", context, MAX_IDENTIFIER_LENGTH),
    claim_version: requiredString(value, "claim_version", context, MAX_IDENTIFIER_LENGTH),
    ...(parametersValue === undefined
      ? {}
      : { parameters: parseJsonObject(parametersValue, `${context}.parameters`) }),
    ...(labelValue === undefined
      ? {}
      : { label: exactString(labelValue, `${context}.label`, MAX_LABEL_LENGTH) }),
  });
}

function parseSemanticRuleSnapshot(value: unknown, context: string): RiddleProofSemanticRule {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["rule_id", "rule_version", "label", "premises", "conclusion"], context);
  const premiseValues = readDenseDataArray(
    requiredField(value, "premises", context),
    `${context}.premises`,
    RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_MAX_CERTIFICATES,
  );
  if (premiseValues.length === 0) throw new Error(`${context}.premises must not be empty.`);
  const premises = premiseValues.map((premise, index) =>
    parseSemanticClaimRef(
      premise,
      `${context}.premises[${index}]`,
      false,
    ) as RiddleProofSemanticClaimRef);
  return deepFreezeNormalized({
    rule_id: requiredString(value, "rule_id", context, MAX_IDENTIFIER_LENGTH),
    rule_version: requiredString(value, "rule_version", context, MAX_IDENTIFIER_LENGTH),
    label: requiredString(value, "label", context, MAX_LABEL_LENGTH),
    premises: premises as RiddleProofSemanticRule["premises"],
    conclusion: parseSemanticClaimRef(
      requiredField(value, "conclusion", context),
      `${context}.conclusion`,
      true,
    ) as RiddleProofSemanticClaim,
  });
}

function parseGroundedContractRef(
  value: unknown,
  context: string,
): RiddleProofGroundedSemanticContractRef {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(
    value,
    ["contract_id", "contract_version", "implementation_digest", "trust_basis"],
    context,
  );
  return {
    contract_id: requiredString(value, "contract_id", context, MAX_IDENTIFIER_LENGTH),
    contract_version: requiredString(value, "contract_version", context, MAX_IDENTIFIER_LENGTH),
    implementation_digest: fullSha256(
      requiredField(value, "implementation_digest", context),
      `${context}.implementation_digest`,
    ),
    trust_basis: parseContractTrustBasis(
      requiredField(value, "trust_basis", context),
      `${context}.trust_basis`,
    ),
  };
}

function parseGroundedContractDescriptor(
  value: unknown,
  context: string,
): RiddleProofGroundedSemanticContractDescriptor {
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
    ],
    context,
  );
  return {
    contract_id: requiredString(value, "contract_id", context, MAX_IDENTIFIER_LENGTH),
    contract_version: requiredString(value, "contract_version", context, MAX_IDENTIFIER_LENGTH),
    implementation_digest: fullSha256(
      requiredField(value, "implementation_digest", context),
      `${context}.implementation_digest`,
    ),
    trust_basis: parseContractTrustBasis(
      requiredField(value, "trust_basis", context),
      `${context}.trust_basis`,
    ),
    label: requiredString(value, "label", context, MAX_LABEL_LENGTH),
    claim: parseSemanticClaimRef(
      requiredField(value, "claim", context),
      `${context}.claim`,
      true,
    ) as RiddleProofSemanticClaim,
  };
}

function contractRefOf(
  contract: RiddleProofGroundedSemanticContractDescriptor,
): RiddleProofGroundedSemanticContractRef {
  return {
    contract_id: contract.contract_id,
    contract_version: contract.contract_version,
    implementation_digest: contract.implementation_digest,
    trust_basis: { ...contract.trust_basis },
  };
}

function parseContractRegistry(
  value: unknown,
): RiddleProofGroundedSemanticContractRegistration[] {
  const values = readDenseDataArray(value, "grounded contract registry", 256);
  if (values.length === 0) throw new Error("grounded contract registry must not be empty.");
  const seen = new Set<string>();
  return values.map((entry, index) => {
    const context = `grounded contract registry[${index}]`;
    if (!isPlainRecord(entry)) throw new Error(`${context} must be a plain object.`);
    const trustBasis = parseContractTrustBasis(
      requiredField(entry, "trust_basis", context),
      `${context}.trust_basis`,
    );
    const descriptor: RiddleProofGroundedSemanticContractDescriptor = {
      contract_id: requiredString(entry, "contract_id", context, MAX_IDENTIFIER_LENGTH),
      contract_version: requiredString(entry, "contract_version", context, MAX_IDENTIFIER_LENGTH),
      implementation_digest: fullSha256(
        requiredField(entry, "implementation_digest", context),
        `${context}.implementation_digest`,
      ),
      trust_basis: trustBasis,
      label: requiredString(entry, "label", context, MAX_LABEL_LENGTH),
      claim: parseSemanticClaimRef(
        requiredField(entry, "claim", context),
        `${context}.claim`,
        true,
      ) as RiddleProofSemanticClaim,
    };
    const identity = stableJson(contractRefOf(descriptor));
    if (seen.has(identity)) throw new Error(`${context} repeats a contract identity.`);
    seen.add(identity);
    if (trustBasis.kind === "external_registry") {
      assertOnlyKeys(
        entry,
        [
          "contract_id",
          "contract_version",
          "implementation_digest",
          "trust_basis",
          "label",
          "claim",
          "accepts",
        ],
        context,
      );
      const accepts = requiredField(entry, "accepts", context);
      if (typeof accepts !== "function") throw new Error(`${context}.accepts must be a function.`);
      return deepFreezeNormalized({
        ...descriptor,
        trust_basis: trustBasis,
        accepts: accepts as RiddleProofGroundedExternalSemanticContractRegistration["accepts"],
      });
    }
    assertOnlyKeys(
      entry,
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
    const built = buildDeclarativeJsonContractDefinition({
      contract_id: descriptor.contract_id,
      contract_version: descriptor.contract_version,
      label: descriptor.label,
      claim: descriptor.claim,
      program: requiredField(entry, "program", context),
    });
    if (built.contract_ref.implementation_digest !== descriptor.implementation_digest) {
      throw new Error(
        `${context}.implementation_digest does not match its canonical declarative definition.`,
      );
    }
    return built.registration;
  });
}

function findContract(
  registry: RiddleProofGroundedSemanticContractRegistration[],
  expected: RiddleProofGroundedSemanticContractRef,
): RiddleProofGroundedSemanticContractRegistration | undefined {
  return registry.find((candidate) => sameJson(contractRefOf(candidate), expected));
}

function receiptBody(
  bundle: RiddleProofSignedCaptureBundle,
  verified: RiddleProofVerifiedSignedCapture,
  policy: RiddleProofGroundedCaptureVerificationPolicy,
  contract: RiddleProofGroundedSemanticContractRegistration,
  issuedAt: string,
): RiddleProofGroundedVerificationReceiptBody {
  return {
    version: RIDDLE_PROOF_GROUNDED_VERIFICATION_RECEIPT_VERSION,
    bundle_id: verified.bundle_id,
    statement_digest: verified.statement_digest,
    artifact_manifest_digest: verified.artifact_manifest_digest,
    signer: { ...verified.signer },
    policy: {
      expected_scope: { ...policy.expected_scope },
      expected_nonce: policy.expected_nonce,
      expected_collector: { ...policy.expected_collector },
      expected_sensor: {
        ...policy.expected_sensor,
        ...(policy.expected_sensor.metadata
          ? { metadata: parseJsonObject(policy.expected_sensor.metadata, "receipt expected sensor metadata") }
          : {}),
      },
      expected_verifier: { ...policy.expected_verifier },
      expected_signer: { ...policy.expected_signer },
      verification_time: policy.verification_time,
      max_capture_age_ms: policy.max_capture_age_ms,
      max_future_skew_ms: policy.max_future_skew_ms,
      required_artifact_roles: [...policy.required_artifact_roles] as [string, ...string[]],
      ...(policy.expected_bundle_id ? { expected_bundle_id: policy.expected_bundle_id } : {}),
      ...(policy.expected_statement_digest
        ? { expected_statement_digest: policy.expected_statement_digest }
        : {}),
    },
    verifier: { ...bundle.statement.verifier },
    artifacts: bundle.statement.artifacts.map((artifact) => ({ ...artifact })),
    observation: cloneJsonValue(verified.observation, "verification receipt observation"),
    observation_digest: verified.observation_digest,
    contract: {
      ...contractRefOf(contract),
      label: contract.label,
      claim: parseSemanticClaimRef(
        contract.claim,
        "verification receipt contract claim",
        true,
      ) as RiddleProofSemanticClaim,
    },
    issued_at: issuedAt,
  };
}

function withReceiptId(
  body: RiddleProofGroundedVerificationReceiptBody,
): RiddleProofGroundedVerificationReceipt {
  const digest = sha256Json(body);
  return { ...body, receipt_id: `rpgr_${digest.slice("sha256:".length)}` };
}

function receiptContentDigest(receipt: RiddleProofGroundedVerificationReceipt): string {
  const { receipt_id: _receiptId, ...body } = receipt;
  return sha256Json(body);
}

function evidenceFromReceipt(
  receipt: RiddleProofGroundedVerificationReceipt,
): RiddleProofSemanticEvidenceBundle {
  return [
    {
      receipt_id: receipt.receipt_id,
      artifact_digest: receiptContentDigest(receipt),
      role: "grounded_verification_receipt",
    },
    ...receipt.artifacts.map((artifact) => ({
      receipt_id: receipt.receipt_id,
      artifact_digest: artifact.artifact_digest,
      role: artifact.role,
    })),
  ];
}

function semanticRuntimeContract(
  contract: RiddleProofGroundedSemanticContractRegistration,
) {
  if (isDeclarativeJsonContractRegistration(contract)) {
    return {
      contract_id: contract.contract_id,
      contract_version: contract.contract_version,
      label: contract.label,
      claim: contract.claim,
      accepts: (scope: RiddleProofSemanticScope, observation: JsonValue) =>
        evaluateDeclarativeJsonContract(contract, scope, observation),
    };
  }
  const accepts = contract.accepts;
  return {
    contract_id: contract.contract_id,
    contract_version: contract.contract_version,
    label: contract.label,
    claim: contract.claim,
    accepts: (scope: RiddleProofSemanticScope, observation: JsonValue) =>
      Reflect.apply(accepts, undefined, [scope, observation]) === true,
  };
}

function evaluateContractOnce(
  contract: RiddleProofGroundedSemanticContractRegistration,
  scope: RiddleProofSemanticScope,
  observation: JsonValue,
): { ok: true; accepted: boolean } | { ok: false; message: string } {
  try {
    const normalizedObservation = cloneJsonValue(observation, "grounded contract observation");
    const accepted = isDeclarativeJsonContractRegistration(contract)
      ? evaluateDeclarativeJsonContract(contract, { ...scope }, normalizedObservation)
      : Reflect.apply(contract.accepts, undefined, [
          { ...scope },
          normalizedObservation,
        ]) === true;
    return { ok: true, accepted };
  } catch (error) {
    return { ok: false, message: safeErrorMessage(error) };
  }
}

function parseCreateGroundedInput(
  input: CreateRiddleProofGroundedSemanticCertificateInput,
): {
  policy: RiddleProofGroundedCaptureVerificationPolicy;
  contract_registry: RiddleProofGroundedSemanticContractRegistration[];
  expected_contract: RiddleProofGroundedSemanticContractRef;
  issued_at: string;
} {
  const context = "grounded semantic certificate input";
  if (!isPlainRecord(input)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(
    input,
    [
      "bundle",
      "policy",
      "trusted_signers",
      "verifier_registry",
      "contract_registry",
      "expected_contract",
      "issued_at",
    ],
    context,
  );
  const preflightCertificateId = `rpsc_${"0".repeat(64)}`;
  preflightReplayContexts([{
    certificate_id: preflightCertificateId,
    policy: requiredField(input, "policy", context),
    trusted_signers: requiredField(input, "trusted_signers", context),
    verifier_registry: requiredField(input, "verifier_registry", context),
    contract_registry: requiredField(input, "contract_registry", context),
    expected_contract: requiredField(input, "expected_contract", context),
  }], new Set([preflightCertificateId]));
  const policy = parsePolicy(requiredField(input, "policy", context));
  const issuedAt = parseCanonicalTimestamp(
    requiredField(input, "issued_at", context),
    `${context}.issued_at`,
  );
  if (issuedAt !== policy.verification_time) {
    throw new Error(
      `${context}.issued_at must exactly equal the independently supplied policy.verification_time.`,
    );
  }
  return {
    policy,
    contract_registry: parseContractRegistry(requiredField(input, "contract_registry", context)),
    expected_contract: parseGroundedContractRef(
      requiredField(input, "expected_contract", context),
      `${context}.expected_contract`,
    ),
    issued_at: issuedAt,
  };
}

export function createRiddleProofGroundedSemanticCertificate(
  input: CreateRiddleProofGroundedSemanticCertificateInput,
): RiddleProofGroundedSemanticCertificateResult {
  let configuration: ReturnType<typeof parseCreateGroundedInput>;
  try {
    configuration = parseCreateGroundedInput(input);
  } catch (error) {
    return groundedFailure(
      "invalid_input",
      `Grounded semantic certificate input is invalid: ${safeErrorMessage(error)}`,
    );
  }
  const inputRecord = input as unknown as PlainRecord;
  const capture = verifyRiddleProofSignedCaptureBundle({
    bundle: requiredField(inputRecord, "bundle", "grounded semantic certificate input"),
    policy: configuration.policy,
    trusted_signers: requiredField(
      inputRecord,
      "trusted_signers",
      "grounded semantic certificate input",
    ) as VerifyRiddleProofSignedCaptureBundleInput["trusted_signers"],
    verifier_registry: requiredField(
      inputRecord,
      "verifier_registry",
      "grounded semantic certificate input",
    ) as VerifyRiddleProofSignedCaptureBundleInput["verifier_registry"],
  });
  if (!capture.ok) return groundedFailure(capture.error.code, capture.error.message);
  const contract = findContract(configuration.contract_registry, configuration.expected_contract);
  if (!contract) {
    return groundedFailure(
      "contract_not_registered",
      "No trusted contract registration matches the expected contract id, version, and implementation digest.",
    );
  }
  const firstEvaluation = evaluateContractOnce(
    contract,
    capture.bundle.statement.scope,
    capture.verified_capture.observation,
  );
  if (!firstEvaluation.ok) {
    return groundedFailure(
      "contract_error",
      `Grounded semantic contract evaluation failed: ${firstEvaluation.message}`,
    );
  }
  if (!firstEvaluation.accepted) {
    return groundedFailure(
      "contract_rejected",
      "Grounded semantic contract rejected the verifier-derived observation.",
    );
  }
  const receipt = withReceiptId(receiptBody(
    capture.bundle,
    capture.verified_capture,
    configuration.policy,
    contract,
    configuration.issued_at,
  ));
  const certification = createRiddleProofSemanticCertificate({
    scope: capture.bundle.statement.scope,
    evidence: evidenceFromReceipt(receipt),
    observation: cloneJsonValue(
      capture.verified_capture.observation,
      "grounded semantic certification observation",
    ),
    contract: semanticRuntimeContract(contract),
    issued_at: configuration.issued_at,
  });
  if (!certification.ok) {
    if (certification.error.code === "contract_rejected") {
      return groundedFailure(
        "contract_nondeterministic",
        "Grounded semantic contract accepted once and rejected when reconstructing the certificate.",
      );
    }
    return groundedFailure(
      "contract_error",
      `Grounded semantic contract failed when reconstructing the certificate: ${certification.error.message}`,
    );
  }
  const grounding: RiddleProofGroundedSemanticCertificateBinding = {
    certificate_id: certification.certificate.certificate_id,
    bundle: capture.bundle,
    receipt,
  };
  return {
    ok: true,
    certificate: certification.certificate,
    receipt,
    grounding,
  };
}

function parseReceiptSigner(
  value: unknown,
  context: string,
): RiddleProofVerifiedSignedCapture["signer"] {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["algorithm", "key_id", "public_key_spki_sha256"], context);
  if (requiredField(value, "algorithm", context) !== "ed25519") {
    throw new Error(`${context}.algorithm must be ed25519.`);
  }
  return {
    algorithm: "ed25519",
    key_id: requiredString(value, "key_id", context, MAX_IDENTIFIER_LENGTH),
    public_key_spki_sha256: fullSha256(
      requiredField(value, "public_key_spki_sha256", context),
      `${context}.public_key_spki_sha256`,
    ),
  };
}

function parseVerificationReceipt(value: unknown): RiddleProofGroundedVerificationReceipt {
  const context = "grounded verification receipt";
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(
    value,
    [
      "version",
      "receipt_id",
      "bundle_id",
      "statement_digest",
      "artifact_manifest_digest",
      "signer",
      "policy",
      "verifier",
      "artifacts",
      "observation",
      "observation_digest",
      "contract",
      "issued_at",
    ],
    context,
  );
  if (requiredField(value, "version", context) !== RIDDLE_PROOF_GROUNDED_VERIFICATION_RECEIPT_VERSION) {
    throw new Error(`${context}.version is unsupported.`);
  }
  const artifactsValue = readDenseDataArray(
    requiredField(value, "artifacts", context),
    `${context}.artifacts`,
    RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_ARTIFACTS,
  );
  if (artifactsValue.length === 0) throw new Error(`${context}.artifacts must not be empty.`);
  const artifacts = artifactsValue.map((entry, index) =>
    parseManifestEntry(entry, `${context}.artifacts[${index}]`));
  assertArtifactIdsUniqueAndSorted(artifacts, `${context}.artifacts`);
  const observation = cloneJsonValue(
    requiredField(value, "observation", context),
    `${context}.observation`,
  );
  if (Buffer.byteLength(stableJson(observation), "utf8") > RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_OBSERVATION_BYTES) {
    throw new Error(`${context}.observation exceeds the canonical byte limit.`);
  }
  const body: RiddleProofGroundedVerificationReceiptBody = {
    version: RIDDLE_PROOF_GROUNDED_VERIFICATION_RECEIPT_VERSION,
    bundle_id: parseOptionalBundleId(
      requiredField(value, "bundle_id", context),
      `${context}.bundle_id`,
    ) as string,
    statement_digest: fullSha256(
      requiredField(value, "statement_digest", context),
      `${context}.statement_digest`,
    ),
    artifact_manifest_digest: fullSha256(
      requiredField(value, "artifact_manifest_digest", context),
      `${context}.artifact_manifest_digest`,
    ),
    signer: parseReceiptSigner(requiredField(value, "signer", context), `${context}.signer`),
    policy: parsePolicy(requiredField(value, "policy", context)),
    verifier: parseVerifierRef(requiredField(value, "verifier", context), `${context}.verifier`),
    artifacts,
    observation,
    observation_digest: fullSha256(
      requiredField(value, "observation_digest", context),
      `${context}.observation_digest`,
    ),
    contract: parseGroundedContractDescriptor(
      requiredField(value, "contract", context),
      `${context}.contract`,
    ),
    issued_at: parseCanonicalTimestamp(
      requiredField(value, "issued_at", context),
      `${context}.issued_at`,
    ),
  };
  if (body.observation_digest !== sha256Json(body.observation)) {
    throw new Error(`${context}.observation_digest must match the canonical observation.`);
  }
  if (body.artifact_manifest_digest !== sha256Json(body.artifacts)) {
    throw new Error(`${context}.artifact_manifest_digest must match the canonical artifact manifest.`);
  }
  if (body.issued_at !== body.policy.verification_time) {
    throw new Error(
      `${context}.issued_at must exactly equal its independently recorded policy.verification_time.`,
    );
  }
  const receiptId = requiredString(value, "receipt_id", context, 69);
  if (!/^rpgr_[0-9a-f]{64}$/u.test(receiptId)) {
    throw new Error(`${context}.receipt_id must be a full lowercase rpgr content ID.`);
  }
  const expectedReceiptId = withReceiptId(body).receipt_id;
  if (receiptId !== expectedReceiptId) {
    throw new Error(`${context}.receipt_id must match its canonical body.`);
  }
  return { ...body, receipt_id: receiptId };
}

function parseGrounding(
  value: unknown,
): RiddleProofGroundedSemanticCertificateBinding {
  const context = "grounded semantic certificate binding";
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["certificate_id", "bundle", "receipt"], context);
  const certificateId = requiredString(value, "certificate_id", context, 69);
  if (!/^rpsc_[0-9a-f]{64}$/u.test(certificateId)) {
    throw new Error(`${context}.certificate_id must be a full lowercase rpsc content ID.`);
  }
  const grounding: RiddleProofGroundedSemanticCertificateBinding = {
    certificate_id: certificateId,
    bundle: parseBundle(requiredField(value, "bundle", context)).bundle,
    receipt: parseVerificationReceipt(requiredField(value, "receipt", context)),
  };
  if (
    groundingMetadataByteSize(grounding)
    > RIDDLE_PROOF_GROUNDED_SEMANTIC_CLOSURE_MAX_METADATA_BYTES
  ) {
    throw new Error(`${context} exceeds the standalone grounding metadata limit.`);
  }
  return grounding;
}

function groundingMetadataByteSize(
  grounding: RiddleProofGroundedSemanticCertificateBinding,
): number {
  return Buffer.byteLength(stableJson({
    certificate_id: grounding.certificate_id,
    bundle: {
      version: grounding.bundle.version,
      statement: grounding.bundle.statement,
      inline_artifacts: grounding.bundle.inline_artifacts.map((artifact) => ({
        artifact_id: artifact.artifact_id,
        encoding: artifact.encoding,
      })),
      provenance: grounding.bundle.provenance,
    },
    receipt: grounding.receipt,
  }), "utf8");
}

function parseReplayConfiguration(
  value: unknown,
  context: string,
): {
  configuration: RiddleProofGroundedReplayConfiguration;
  policy: RiddleProofGroundedCaptureVerificationPolicy;
  contract_registry: RiddleProofGroundedSemanticContractRegistration[];
  expected_contract: RiddleProofGroundedSemanticContractRef;
} {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(
    value,
    [
      "policy",
      "trusted_signers",
      "verifier_registry",
      "contract_registry",
      "expected_contract",
    ],
    context,
  );
  const preflightCertificateId = `rpsc_${"0".repeat(64)}`;
  preflightReplayContexts([{
    certificate_id: preflightCertificateId,
    policy: requiredField(value, "policy", context),
    trusted_signers: requiredField(value, "trusted_signers", context),
    verifier_registry: requiredField(value, "verifier_registry", context),
    contract_registry: requiredField(value, "contract_registry", context),
    expected_contract: requiredField(value, "expected_contract", context),
  }], new Set([preflightCertificateId]));
  const policy = parsePolicy(requiredField(value, "policy", context));
  const trustedSigners = parseTrustedSigners(requiredField(value, "trusted_signers", context));
  const verifierRegistry = parseVerifierRegistry(requiredField(value, "verifier_registry", context));
  const contractRegistry = parseContractRegistry(requiredField(value, "contract_registry", context));
  const expectedContract = parseGroundedContractRef(
    requiredField(value, "expected_contract", context),
    `${context}.expected_contract`,
  );
  return {
    configuration: {
      policy,
      trusted_signers: trustedSigners.map((entry) => entry.entry) as
        RiddleProofGroundedReplayConfiguration["trusted_signers"],
      verifier_registry: verifierRegistry as
        RiddleProofGroundedReplayConfiguration["verifier_registry"],
      contract_registry: contractRegistry as
        RiddleProofGroundedReplayConfiguration["contract_registry"],
      expected_contract: expectedContract,
    },
    policy,
    contract_registry: contractRegistry,
    expected_contract: expectedContract,
  };
}

export function replayRiddleProofGroundedSemanticCertificate(
  input: ReplayRiddleProofGroundedSemanticCertificateInput,
): RiddleProofGroundedSemanticCertificateReplayResult {
  let grounding: RiddleProofGroundedSemanticCertificateBinding;
  let parsedConfiguration: ReturnType<typeof parseReplayConfiguration>;
  try {
    const context = "grounded semantic certificate replay input";
    if (!isPlainRecord(input)) throw new Error(`${context} must be a plain object.`);
    assertOnlyKeys(input, ["grounding", "configuration"], context);
    grounding = parseGrounding(requiredField(input, "grounding", context));
    parsedConfiguration = parseReplayConfiguration(
      requiredField(input, "configuration", context),
      `${context}.configuration`,
    );
  } catch (error) {
    return groundedFailure(
      "invalid_grounding",
      `Grounded semantic certificate replay input is invalid: ${safeErrorMessage(error)}`,
    );
  }
  if (!sameJson(contractRefOf(grounding.receipt.contract), parsedConfiguration.expected_contract)) {
    return groundedFailure(
      "receipt_mismatch",
      "Grounded receipt contract does not match the independently expected contract identity.",
    );
  }
  const contract = findContract(
    parsedConfiguration.contract_registry,
    parsedConfiguration.expected_contract,
  );
  if (!contract) {
    return groundedFailure(
      "contract_not_registered",
      "No trusted contract registration matches the expected grounded contract identity.",
    );
  }
  if (!sameJson(
    {
      ...contractRefOf(contract),
      label: contract.label,
      claim: contract.claim,
    },
    grounding.receipt.contract,
  )) {
    return groundedFailure(
      "receipt_mismatch",
      "Grounded receipt contract descriptor does not match the trusted registered contract.",
    );
  }
  const capture = verifyRiddleProofSignedCaptureBundle({
    bundle: grounding.bundle,
    policy: parsedConfiguration.configuration.policy,
    trusted_signers: parsedConfiguration.configuration.trusted_signers,
    verifier_registry: parsedConfiguration.configuration.verifier_registry,
  });
  if (!capture.ok) return groundedFailure(capture.error.code, capture.error.message);
  const expectedReceipt = withReceiptId(receiptBody(
    capture.bundle,
    capture.verified_capture,
    parsedConfiguration.policy,
    contract,
    grounding.receipt.issued_at,
  ));
  if (!sameJson(expectedReceipt, grounding.receipt)) {
    return groundedFailure(
      "receipt_mismatch",
      "Grounded verification receipt does not exactly reconstruct from the signed bundle, policy, verifier output, and registered contract.",
    );
  }
  const firstEvaluation = evaluateContractOnce(
    contract,
    capture.bundle.statement.scope,
    capture.verified_capture.observation,
  );
  if (!firstEvaluation.ok) {
    return groundedFailure(
      "contract_error",
      `Grounded contract replay failed: ${firstEvaluation.message}`,
    );
  }
  if (!firstEvaluation.accepted) {
    return groundedFailure(
      "contract_rejected",
      "Grounded contract rejected the replayed verifier-derived observation.",
    );
  }
  const certification = createRiddleProofSemanticCertificate({
    scope: capture.bundle.statement.scope,
    evidence: evidenceFromReceipt(expectedReceipt),
    observation: cloneJsonValue(
      capture.verified_capture.observation,
      "replayed grounded semantic observation",
    ),
    contract: semanticRuntimeContract(contract),
    issued_at: expectedReceipt.issued_at,
  });
  if (!certification.ok) {
    return groundedFailure(
      certification.error.code === "contract_rejected"
        ? "contract_nondeterministic"
        : "contract_error",
      `Grounded contract did not reproduce its certificate: ${certification.error.message}`,
    );
  }
  if (certification.certificate.certificate_id !== grounding.certificate_id) {
    return groundedFailure(
      "certificate_mismatch",
      "Replayed grounded certificate does not match the binding certificate_id.",
    );
  }
  return {
    ok: true,
    certificate: certification.certificate,
    receipt: expectedReceipt,
    grounding: {
      certificate_id: certification.certificate.certificate_id,
      bundle: capture.bundle,
      receipt: expectedReceipt,
    },
  };
}

function parseGroundedClosureStructural(
  value: unknown,
  artifactByteBudget = RIDDLE_PROOF_GROUNDED_SEMANTIC_CLOSURE_MAX_TOTAL_ARTIFACT_BYTES,
  metadataByteBudget = RIDDLE_PROOF_GROUNDED_SEMANTIC_CLOSURE_MAX_METADATA_BYTES,
): {
  grounded_closure: RiddleProofGroundedSemanticCertificateClosure;
  root_certificate: RiddleProofSemanticCertificate;
  artifact_bytes: number;
  metadata_bytes: number;
} {
  const context = "grounded semantic certificate closure";
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["version", "closure", "groundings"], context);
  if (
    requiredField(value, "version", context)
    !== RIDDLE_PROOF_GROUNDED_SEMANTIC_CERTIFICATE_CLOSURE_VERSION
  ) {
    throw new Error(`${context}.version is unsupported.`);
  }
  const semanticClosureValue = requiredField(value, "closure", context);
  let aggregateMetadataBytes = strictJsonByteSize(
    semanticClosureValue,
    `${context}.closure`,
    metadataByteBudget,
  );
  const semanticValidation = validateRiddleProofSemanticCertificateClosure(
    semanticClosureValue,
  );
  if (!semanticValidation.ok) {
    throw new Error(`embedded Semantic closure is invalid: ${semanticValidation.error.message}`);
  }
  for (const certificate of semanticValidation.closure.certificates) {
    parseCanonicalTimestamp(
      certificate.issued_at,
      `${context}.closure certificate ${certificate.certificate_id}.issued_at`,
    );
  }
  const groundingValues = readDenseDataArray(
    requiredField(value, "groundings", context),
    `${context}.groundings`,
    RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_MAX_CERTIFICATES,
  );
  if (groundingValues.length === 0) throw new Error(`${context}.groundings must not be empty.`);
  const groundings: RiddleProofGroundedSemanticCertificateBinding[] = [];
  let aggregateArtifactBytes = 0;
  for (let index = 0; index < groundingValues.length; index += 1) {
    const grounding = parseGrounding(groundingValues[index]);
    aggregateArtifactBytes += grounding.bundle.statement.artifacts.reduce(
      (bundleTotal, artifact) => bundleTotal + artifact.byte_length,
      0,
    );
    if (aggregateArtifactBytes > artifactByteBudget) {
      throw new Error(
        `${context} exceeds its ${artifactByteBudget}-byte aggregate replay limit at grounding ${index}.`,
      );
    }
    aggregateMetadataBytes += groundingMetadataByteSize(grounding);
    if (aggregateMetadataBytes > metadataByteBudget) {
      throw new Error(
        `${context} exceeds its ${metadataByteBudget}-byte aggregate metadata limit at grounding ${index}.`,
      );
    }
    groundings.push(grounding);
  }
  const byId = new Map<string, RiddleProofGroundedSemanticCertificateBinding>();
  for (const grounding of groundings) {
    if (byId.has(grounding.certificate_id)) {
      throw new Error(`${context} repeats grounding for ${grounding.certificate_id}.`);
    }
    byId.set(grounding.certificate_id, grounding);
  }
  const certificatesById = new Map(
    semanticValidation.closure.certificates.map((certificate) => [
      certificate.certificate_id,
      certificate,
    ]),
  );
  for (const certificate of semanticValidation.closure.certificates) {
    if (certificate.derivation.kind !== "composition") continue;
    for (const premise of certificate.derivation.premises) {
      const premiseBody = certificatesById.get(premise.certificate_id);
      if (
        !premiseBody
        || Date.parse(certificate.issued_at) < Date.parse(premiseBody.issued_at)
      ) {
        throw new Error(
          `${context} composition certificate ${certificate.certificate_id} predates direct premise ${premise.certificate_id}.`,
        );
      }
    }
  }
  for (const grounding of groundings) {
    const certificate = certificatesById.get(grounding.certificate_id);
    if (!certificate) {
      throw new Error(`${context} has an extra grounding for a certificate outside the closure.`);
    }
    if (certificate.derivation.kind !== "contract") {
      throw new Error(`${context} must not attach grounding to composition certificate ${certificate.certificate_id}.`);
    }
  }
  for (const certificate of semanticValidation.closure.certificates) {
    if (certificate.derivation.kind === "contract" && !byId.has(certificate.certificate_id)) {
      throw new Error(`${context} is missing grounding for contract certificate ${certificate.certificate_id}.`);
    }
  }
  const normalizedGroundings = semanticValidation.closure.certificates
    .filter((certificate) => certificate.derivation.kind === "contract")
    .map((certificate) => byId.get(certificate.certificate_id) as
      RiddleProofGroundedSemanticCertificateBinding);
  return {
    grounded_closure: {
      version: RIDDLE_PROOF_GROUNDED_SEMANTIC_CERTIFICATE_CLOSURE_VERSION,
      closure: semanticValidation.closure,
      groundings: normalizedGroundings as
        RiddleProofGroundedSemanticCertificateClosure["groundings"],
    },
    root_certificate: semanticValidation.root_certificate,
    artifact_bytes: aggregateArtifactBytes,
    metadata_bytes: aggregateMetadataBytes,
  };
}

function parseReplayContexts(
  value: unknown,
): RiddleProofGroundedReplayContext[] {
  const values = readDenseDataArray(
    value,
    "grounded replay contexts",
    RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_MAX_CERTIFICATES,
  );
  if (values.length === 0) throw new Error("grounded replay contexts must not be empty.");
  const seen = new Set<string>();
  return values.map((entry, index) => {
    const context = `grounded replay contexts[${index}]`;
    if (!isPlainRecord(entry)) throw new Error(`${context} must be a plain object.`);
    assertOnlyKeys(
      entry,
      [
        "certificate_id",
        "policy",
        "trusted_signers",
        "verifier_registry",
        "contract_registry",
        "expected_contract",
      ],
      context,
    );
    const certificateId = requiredString(entry, "certificate_id", context, 69);
    if (!/^rpsc_[0-9a-f]{64}$/u.test(certificateId)) {
      throw new Error(`${context}.certificate_id must be a full lowercase rpsc content ID.`);
    }
    if (seen.has(certificateId)) throw new Error(`${context} repeats certificate_id ${certificateId}.`);
    seen.add(certificateId);
    const rawConfiguration = {
      policy: requiredField(entry, "policy", context),
      trusted_signers: requiredField(entry, "trusted_signers", context),
      verifier_registry: requiredField(entry, "verifier_registry", context),
      contract_registry: requiredField(entry, "contract_registry", context),
      expected_contract: requiredField(entry, "expected_contract", context),
    };
    const parsed = parseReplayConfiguration(rawConfiguration, `${context} configuration`);
    return { certificate_id: certificateId, ...parsed.configuration };
  });
}

function preflightReplayContexts(
  value: unknown,
  expectedCertificateIds: Set<string>,
): void {
  const values = readDenseDataArray(
    value,
    "grounded replay contexts",
    RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_MAX_CERTIFICATES,
  );
  if (values.length !== expectedCertificateIds.size) {
    throw new Error(
      `grounded replay contexts must contain exactly ${expectedCertificateIds.size} leaf context(s).`,
    );
  }
  const observedIds = new Set<string>();
  let aggregateRegistryEntries = 0;
  let aggregateTrustedKeyBytes = 0;
  let aggregateConfigBytes = 0;
  const addConfigBytes = (configValue: unknown, configContext: string): void => {
    const remaining = RIDDLE_PROOF_GROUNDED_REPLAY_MAX_AGGREGATE_CONFIG_BYTES
      - aggregateConfigBytes;
    aggregateConfigBytes += strictJsonByteSize(
      configValue,
      configContext,
      remaining,
    );
    if (aggregateConfigBytes > RIDDLE_PROOF_GROUNDED_REPLAY_MAX_AGGREGATE_CONFIG_BYTES) {
      throw new Error(
        `grounded replay contexts exceed the aggregate ${RIDDLE_PROOF_GROUNDED_REPLAY_MAX_AGGREGATE_CONFIG_BYTES}-byte canonical configuration limit.`,
      );
    }
  };
  for (let index = 0; index < values.length; index += 1) {
    const context = `grounded replay contexts[${index}]`;
    const entry = values[index];
    if (!isPlainRecord(entry)) throw new Error(`${context} must be a plain object.`);
    assertOnlyKeys(
      entry,
      [
        "certificate_id",
        "policy",
        "trusted_signers",
        "verifier_registry",
        "contract_registry",
        "expected_contract",
      ],
      context,
    );
    const certificateId = requiredString(entry, "certificate_id", context, 69);
    if (!/^rpsc_[0-9a-f]{64}$/u.test(certificateId)) {
      throw new Error(`${context}.certificate_id must be a full lowercase rpsc content ID.`);
    }
    if (!expectedCertificateIds.has(certificateId)) {
      throw new Error(`${context}.certificate_id has no matching contract leaf.`);
    }
    if (observedIds.has(certificateId)) {
      throw new Error(`${context} repeats certificate_id ${certificateId}.`);
    }
    observedIds.add(certificateId);
    addConfigBytes(requiredField(entry, "policy", context), `${context}.policy`);
    addConfigBytes(
      requiredField(entry, "expected_contract", context),
      `${context}.expected_contract`,
    );

    const signerValues = readDenseDataArray(
      requiredField(entry, "trusted_signers", context),
      `${context}.trusted_signers`,
      256,
    );
    const verifierValues = readDenseDataArray(
      requiredField(entry, "verifier_registry", context),
      `${context}.verifier_registry`,
      256,
    );
    const contractValues = readDenseDataArray(
      requiredField(entry, "contract_registry", context),
      `${context}.contract_registry`,
      256,
    );
    aggregateRegistryEntries += signerValues.length + verifierValues.length + contractValues.length;
    if (
      aggregateRegistryEntries
      > RIDDLE_PROOF_GROUNDED_REPLAY_MAX_AGGREGATE_REGISTRY_ENTRIES
    ) {
      throw new Error(
        `grounded replay contexts exceed the aggregate ${RIDDLE_PROOF_GROUNDED_REPLAY_MAX_AGGREGATE_REGISTRY_ENTRIES}-entry registry limit.`,
      );
    }
    for (let signerIndex = 0; signerIndex < signerValues.length; signerIndex += 1) {
      const signerContext = `${context}.trusted_signers[${signerIndex}]`;
      const signer = signerValues[signerIndex];
      if (!isPlainRecord(signer)) throw new Error(`${signerContext} must be a plain object.`);
      addConfigBytes(signer, signerContext);
      const encoded = requiredField(signer, "public_key_spki_base64", signerContext);
      if (typeof encoded !== "string" || encoded.length > Math.ceil(MAX_KEY_BYTES / 3) * 4) {
        throw new Error(`${signerContext}.public_key_spki_base64 exceeds the key limit.`);
      }
      aggregateTrustedKeyBytes += Math.ceil(encoded.length * 3 / 4);
      if (
        aggregateTrustedKeyBytes
        > RIDDLE_PROOF_GROUNDED_REPLAY_MAX_AGGREGATE_TRUSTED_KEY_BYTES
      ) {
        throw new Error(
          `grounded replay contexts exceed the aggregate ${RIDDLE_PROOF_GROUNDED_REPLAY_MAX_AGGREGATE_TRUSTED_KEY_BYTES}-byte trusted-key limit.`,
        );
      }
    }
    for (let verifierIndex = 0; verifierIndex < verifierValues.length; verifierIndex += 1) {
      const verifierContext = `${context}.verifier_registry[${verifierIndex}]`;
      const verifier = verifierValues[verifierIndex];
      if (!isPlainRecord(verifier)) throw new Error(`${verifierContext} must be a plain object.`);
      const program = optionalField(verifier, "program", verifierContext);
      addConfigBytes({
        verifier_id: requiredField(verifier, "verifier_id", verifierContext),
        verifier_version: requiredField(verifier, "verifier_version", verifierContext),
        implementation_digest: requiredField(verifier, "implementation_digest", verifierContext),
        trust_basis: requiredField(verifier, "trust_basis", verifierContext),
        ...(program === undefined ? {} : { program }),
      }, `${verifierContext} descriptor`);
    }
    for (let contractIndex = 0; contractIndex < contractValues.length; contractIndex += 1) {
      const contractContext = `${context}.contract_registry[${contractIndex}]`;
      const contract = contractValues[contractIndex];
      if (!isPlainRecord(contract)) throw new Error(`${contractContext} must be a plain object.`);
      const program = optionalField(contract, "program", contractContext);
      addConfigBytes({
        contract_id: requiredField(contract, "contract_id", contractContext),
        contract_version: requiredField(contract, "contract_version", contractContext),
        implementation_digest: requiredField(contract, "implementation_digest", contractContext),
        trust_basis: requiredField(contract, "trust_basis", contractContext),
        label: requiredField(contract, "label", contractContext),
        claim: requiredField(contract, "claim", contractContext),
        ...(program === undefined ? {} : { program }),
      }, `${contractContext} descriptor`);
    }
  }
  if (observedIds.size !== expectedCertificateIds.size) {
    throw new Error("grounded replay contexts do not cover every contract leaf exactly once.");
  }
}

function validateParsedGroundedClosureWithContexts(
  structural: ReturnType<typeof parseGroundedClosureStructural>,
  contexts: RiddleProofGroundedReplayContext[],
): RiddleProofGroundedSemanticCertificateClosureValidationResult {
  const groundingIds = new Set(
    structural.grounded_closure.groundings.map((grounding) => grounding.certificate_id),
  );
  const contextsById = new Map(contexts.map((context) => [context.certificate_id, context]));
  for (const context of contexts) {
    if (!groundingIds.has(context.certificate_id)) {
      return groundedFailure(
        "replay_context_mismatch",
        `Grounded replay context ${context.certificate_id} has no matching leaf grounding.`,
      );
    }
  }
  for (const grounding of structural.grounded_closure.groundings) {
    const replayContext = contextsById.get(grounding.certificate_id);
    if (!replayContext) {
      return groundedFailure(
        "replay_context_mismatch",
        `Grounded leaf ${grounding.certificate_id} has no independent replay context.`,
      );
    }
    const replay = replayRiddleProofGroundedSemanticCertificate({
      grounding,
      configuration: {
        policy: replayContext.policy,
        trusted_signers: replayContext.trusted_signers,
        verifier_registry: replayContext.verifier_registry,
        contract_registry: replayContext.contract_registry,
        expected_contract: replayContext.expected_contract,
      },
    });
    if (!replay.ok) {
      return groundedFailure(
        replay.error.code,
        `Grounded leaf ${grounding.certificate_id} failed replay: ${replay.error.message}`,
        replay.error,
      );
    }
    const certificate = structural.grounded_closure.closure.certificates.find(
      (candidate) => candidate.certificate_id === grounding.certificate_id,
    );
    if (!certificate || !sameJson(certificate, replay.certificate)) {
      return groundedFailure(
        "certificate_mismatch",
        `Grounded leaf ${grounding.certificate_id} does not exactly equal its replayed certificate body.`,
      );
    }
  }
  return {
    ok: true,
    grounded_closure: structural.grounded_closure,
    root_certificate: structural.root_certificate,
  };
}

function validateGroundedClosureWithContexts(
  groundedClosureValue: unknown,
  contexts: RiddleProofGroundedReplayContext[],
): RiddleProofGroundedSemanticCertificateClosureValidationResult {
  try {
    return validateParsedGroundedClosureWithContexts(
      parseGroundedClosureStructural(groundedClosureValue),
      contexts,
    );
  } catch (error) {
    return groundedFailure(
      "invalid_grounded_closure",
      `Grounded semantic closure is structurally invalid: ${safeErrorMessage(error)}`,
    );
  }
}

export function validateRiddleProofGroundedSemanticCertificateClosure(
  input: ValidateRiddleProofGroundedSemanticCertificateClosureInput,
): RiddleProofGroundedSemanticCertificateClosureValidationResult {
  let structural: ReturnType<typeof parseGroundedClosureStructural>;
  let contexts: RiddleProofGroundedReplayContext[];
  try {
    const context = "grounded semantic closure validation input";
    if (!isPlainRecord(input)) throw new Error(`${context} must be a plain object.`);
    assertOnlyKeys(input, ["grounded_closure", "replay_contexts"], context);
    const groundedClosure = requiredField(input, "grounded_closure", context);
    structural = parseGroundedClosureStructural(groundedClosure);
    const expectedIds = new Set(
      structural.grounded_closure.groundings.map((grounding) => grounding.certificate_id),
    );
    const replayContexts = requiredField(input, "replay_contexts", context);
    preflightReplayContexts(replayContexts, expectedIds);
    contexts = parseReplayContexts(replayContexts);
  } catch (error) {
    return groundedFailure(
      "invalid_input",
      `Grounded semantic closure validation input is invalid: ${safeErrorMessage(error)}`,
    );
  }
  return validateParsedGroundedClosureWithContexts(structural, contexts);
}

export function createRiddleProofGroundedSemanticAtomicCertificateClosure(
  input: CreateRiddleProofGroundedSemanticAtomicCertificateClosureInput,
): RiddleProofGroundedSemanticCertificateClosureValidationResult {
  let certificate: RiddleProofSemanticCertificate;
  let grounding: RiddleProofGroundedSemanticCertificateBinding;
  let certificateMetadataBytes: number;
  let configuration: ReturnType<typeof parseReplayConfiguration>;
  try {
    const context = "grounded atomic closure input";
    if (!isPlainRecord(input)) throw new Error(`${context} must be a plain object.`);
    assertOnlyKeys(input, ["certificate", "grounding", "configuration"], context);
    const certificateValue = requiredField(input, "certificate", context);
    certificateMetadataBytes = strictJsonByteSize(
      certificateValue,
      `${context}.certificate`,
      RIDDLE_PROOF_GROUNDED_SEMANTIC_CLOSURE_MAX_METADATA_BYTES,
    );
    certificate = parseRiddleProofSemanticCertificate(certificateValue);
    grounding = parseGrounding(requiredField(input, "grounding", context));
    if (
      certificateMetadataBytes + groundingMetadataByteSize(grounding)
      > RIDDLE_PROOF_GROUNDED_SEMANTIC_CLOSURE_MAX_METADATA_BYTES
    ) {
      throw new Error(`${context} exceeds the aggregate atomic metadata limit.`);
    }
    configuration = parseReplayConfiguration(
      requiredField(input, "configuration", context),
      `${context}.configuration`,
    );
  } catch (error) {
    return groundedFailure(
      "invalid_input",
      `Grounded atomic closure input is invalid: ${safeErrorMessage(error)}`,
    );
  }
  if (certificate.derivation.kind !== "contract") {
    return groundedFailure(
      "composite_grounding",
      "A grounded atomic closure requires a contract-derived Semantic certificate.",
    );
  }
  if (grounding.certificate_id !== certificate.certificate_id) {
    return groundedFailure(
      "certificate_mismatch",
      "Grounded atomic closure certificate and grounding IDs differ.",
    );
  }
  const replay = replayRiddleProofGroundedSemanticCertificate({
    grounding,
    configuration: configuration.configuration,
  });
  if (!replay.ok) return groundedFailure(replay.error.code, replay.error.message, replay.error);
  if (!sameJson(certificate, replay.certificate)) {
    return groundedFailure(
      "certificate_mismatch",
      "Grounded atomic closure certificate does not exactly equal its replayed body.",
    );
  }
  const atomic = createRiddleProofSemanticAtomicCertificateClosure({ certificate });
  if (!atomic.ok) {
    return groundedFailure(
      "semantic_closure_invalid",
      `Semantic atomic closure failed: ${atomic.error.message}`,
      atomic.error,
    );
  }
  const groundedClosure: RiddleProofGroundedSemanticCertificateClosure = {
    version: RIDDLE_PROOF_GROUNDED_SEMANTIC_CERTIFICATE_CLOSURE_VERSION,
    closure: atomic.closure,
    groundings: [grounding],
  };
  return validateGroundedClosureWithContexts(groundedClosure, [{
    certificate_id: certificate.certificate_id,
    ...configuration.configuration,
  }]);
}

export function composeRiddleProofGroundedSemanticCertificateClosures(
  input: ComposeRiddleProofGroundedSemanticCertificateClosuresInput,
): RiddleProofGroundedSemanticCertificateClosureCompositionResult {
  let closureValues: unknown[];
  let replayContextsValue: unknown;
  let rule: RiddleProofSemanticRule;
  let ruleMetadataBytes: number;
  let issuedAt: string;
  try {
    const context = "grounded semantic closure composition input";
    if (!isPlainRecord(input)) throw new Error(`${context} must be a plain object.`);
    assertOnlyKeys(input, ["rule", "closures", "issued_at", "replay_contexts"], context);
    closureValues = readDenseDataArray(
      requiredField(input, "closures", context),
      `${context}.closures`,
      RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_MAX_CERTIFICATES,
    );
    if (closureValues.length === 0) throw new Error(`${context}.closures must not be empty.`);
    replayContextsValue = requiredField(input, "replay_contexts", context);
    const ruleValue = requiredField(input, "rule", context);
    ruleMetadataBytes = strictJsonByteSize(
      ruleValue,
      `${context}.rule`,
      RIDDLE_PROOF_GROUNDED_SEMANTIC_CLOSURE_MAX_METADATA_BYTES,
    );
    rule = parseSemanticRuleSnapshot(
      ruleValue,
      `${context}.rule`,
    );
    if (closureValues.length !== rule.premises.length) {
      throw new Error(
        `${context}.closures must exactly match the ${rule.premises.length} declared rule premise(s).`,
      );
    }
    issuedAt = parseCanonicalTimestamp(
      requiredField(input, "issued_at", context),
      `${context}.issued_at`,
    );
  } catch (error) {
    return groundedFailure(
      "invalid_input",
      `Grounded semantic closure composition input is invalid: ${safeErrorMessage(error)}`,
    );
  }

  const structuralInputs: Array<ReturnType<typeof parseGroundedClosureStructural>> = [];
  const combinedLeafIds = new Set<string>();
  let combinedPreflightBytes = 0;
  let combinedPreflightMetadataBytes = ruleMetadataBytes;
  for (let index = 0; index < closureValues.length; index += 1) {
    let structural: ReturnType<typeof parseGroundedClosureStructural>;
    try {
      structural = parseGroundedClosureStructural(
        closureValues[index],
        RIDDLE_PROOF_GROUNDED_SEMANTIC_CLOSURE_MAX_TOTAL_ARTIFACT_BYTES
          - combinedPreflightBytes,
        RIDDLE_PROOF_GROUNDED_SEMANTIC_CLOSURE_MAX_METADATA_BYTES
          - combinedPreflightMetadataBytes,
      );
    } catch (error) {
      return groundedFailure(
        "invalid_grounded_closure",
        `Grounded input closure ${index} is invalid: ${safeErrorMessage(error)}`,
      );
    }
    combinedPreflightBytes += structural.artifact_bytes;
    combinedPreflightMetadataBytes += structural.metadata_bytes;
    if (
      combinedPreflightBytes
      > RIDDLE_PROOF_GROUNDED_SEMANTIC_CLOSURE_MAX_TOTAL_ARTIFACT_BYTES
    ) {
      return groundedFailure(
        "invalid_input",
        `Combined grounded composition inputs exceed the aggregate ${RIDDLE_PROOF_GROUNDED_SEMANTIC_CLOSURE_MAX_TOTAL_ARTIFACT_BYTES}-byte replay-work limit.`,
      );
    }
    if (
      combinedPreflightMetadataBytes
      > RIDDLE_PROOF_GROUNDED_SEMANTIC_CLOSURE_MAX_METADATA_BYTES
    ) {
      return groundedFailure(
        "invalid_input",
        `Combined grounded composition inputs exceed the aggregate ${RIDDLE_PROOF_GROUNDED_SEMANTIC_CLOSURE_MAX_METADATA_BYTES}-byte metadata limit.`,
      );
    }
    structuralInputs.push(structural);
    for (const grounding of structural.grounded_closure.groundings) {
      combinedLeafIds.add(grounding.certificate_id);
    }
  }

  let contexts: RiddleProofGroundedReplayContext[];
  try {
    preflightReplayContexts(replayContextsValue, combinedLeafIds);
    contexts = parseReplayContexts(replayContextsValue);
  } catch (error) {
    return groundedFailure(
      "invalid_input",
      `Grounded composition replay contexts failed preflight: ${safeErrorMessage(error)}`,
    );
  }

  const validatedInputs: RiddleProofGroundedSemanticCertificateClosure[] = [];
  for (let index = 0; index < structuralInputs.length; index += 1) {
    const structural = structuralInputs[index];
    const ids = new Set(
      structural.grounded_closure.groundings.map((grounding) => grounding.certificate_id),
    );
    const relevantContexts = contexts.filter((context) => ids.has(context.certificate_id));
    const validation = validateParsedGroundedClosureWithContexts(
      structural,
      relevantContexts,
    );
    if (!validation.ok) {
      return groundedFailure(
        validation.error.code,
        `Grounded input closure ${index} failed replay: ${validation.error.message}`,
        validation.error,
      );
    }
    validatedInputs.push(validation.grounded_closure);
  }

  let latestPremiseIssuedAt: string | undefined;
  for (const closure of validatedInputs) {
    const root = closure.closure.certificates.find(
      (certificate) => certificate.certificate_id === closure.closure.root_certificate_id,
    );
    if (
      root
      && (
        latestPremiseIssuedAt === undefined
        || Date.parse(root.issued_at) > Date.parse(latestPremiseIssuedAt)
      )
    ) {
      latestPremiseIssuedAt = root.issued_at;
    }
  }
  if (
    latestPremiseIssuedAt !== undefined
    && Date.parse(issuedAt) < Date.parse(latestPremiseIssuedAt)
  ) {
    return groundedFailure(
      "invalid_input",
      `Grounded composition issued_at must not precede latest premise root issued_at ${latestPremiseIssuedAt}.`,
    );
  }

  const semanticComposition = composeRiddleProofSemanticCertificateClosures({
    rule,
    closures: validatedInputs.map((closure) => closure.closure) as
      [RiddleProofSemanticCertificateClosure, ...RiddleProofSemanticCertificateClosure[]],
    issued_at: issuedAt,
  });
  if (!semanticComposition.ok) {
    return groundedFailure(
      "semantic_composition_failed",
      `Grounded Semantic composition failed: ${semanticComposition.error.message}`,
      semanticComposition.error,
    );
  }

  const mergedGroundings: RiddleProofGroundedSemanticCertificateBinding[] = [];
  const groundingById = new Map<string, RiddleProofGroundedSemanticCertificateBinding>();
  for (const closure of validatedInputs) {
    for (const grounding of closure.groundings) {
      const existing = groundingById.get(grounding.certificate_id);
      if (existing) {
        if (!sameJson(existing, grounding)) {
          return groundedFailure(
            "duplicate_grounding",
            `Shared grounded leaf ${grounding.certificate_id} has unequal sidecar bodies.`,
          );
        }
        continue;
      }
      groundingById.set(grounding.certificate_id, grounding);
      mergedGroundings.push(grounding);
    }
  }
  const composed: RiddleProofGroundedSemanticCertificateClosure = {
    version: RIDDLE_PROOF_GROUNDED_SEMANTIC_CERTIFICATE_CLOSURE_VERSION,
    closure: semanticComposition.closure,
    groundings: mergedGroundings as
      RiddleProofGroundedSemanticCertificateClosure["groundings"],
  };
  const outputValidation = validateGroundedClosureWithContexts(composed, contexts);
  if (!outputValidation.ok) {
    return groundedFailure(
      outputValidation.error.code,
      `Composed grounded closure failed final replay: ${outputValidation.error.message}`,
      outputValidation.error,
    );
  }
  return {
    ok: true,
    certificate: semanticComposition.certificate,
    grounded_closure: outputValidation.grounded_closure,
  };
}

export function matchRiddleProofGroundedSemanticCertificateClosure(
  input: MatchRiddleProofGroundedSemanticCertificateClosureInput,
): RiddleProofGroundedSemanticCertificateClosureMatchResult {
  let groundedClosureValue: unknown;
  let replayContextsValue: unknown;
  let expectedRootCertificateId: string;
  let expectedScope: RiddleProofSemanticScope;
  let expectedClaim: RiddleProofSemanticClaimExpectation;
  let expectedAssurance: RiddleProofSemanticAssurance;
  try {
    const context = "grounded semantic closure match input";
    if (!isPlainRecord(input)) throw new Error(`${context} must be a plain object.`);
    assertOnlyKeys(
      input,
      [
        "grounded_closure",
        "replay_contexts",
        "expected_root_certificate_id",
        "expected_scope",
        "expected_claim",
        "expected_assurance",
      ],
      context,
    );
    groundedClosureValue = requiredField(input, "grounded_closure", context);
    replayContextsValue = requiredField(input, "replay_contexts", context);
    expectedRootCertificateId = requiredString(
      input,
      "expected_root_certificate_id",
      context,
      69,
    );
    if (!/^rpsc_[0-9a-f]{64}$/u.test(expectedRootCertificateId)) {
      throw new Error(`${context}.expected_root_certificate_id must be a full lowercase rpsc ID.`);
    }
    expectedScope = deepFreezeNormalized(parseScope(
      requiredField(input, "expected_scope", context),
      `${context}.expected_scope`,
    ));
    expectedClaim = parseSemanticClaimExpectationSnapshot(
      requiredField(input, "expected_claim", context),
      `${context}.expected_claim`,
    );
    const assurance = requiredString(input, "expected_assurance", context, 64);
    if (
      assurance !== "runtime_contract_accepted"
      && assurance !== "declared_runtime_rule"
    ) {
      throw new Error(`${context}.expected_assurance is unsupported.`);
    }
    expectedAssurance = assurance;
  } catch (error) {
    return groundedFailure(
      "invalid_input",
      `Grounded semantic closure match input is invalid: ${safeErrorMessage(error)}`,
    );
  }

  const validation = validateRiddleProofGroundedSemanticCertificateClosure({
    grounded_closure: groundedClosureValue,
    replay_contexts: replayContextsValue as
      MatchRiddleProofGroundedSemanticCertificateClosureInput["replay_contexts"],
  });
  if (!validation.ok) return validation;

  try {
    const semanticMatch = matchRiddleProofSemanticCertificateClosure({
      closure: validation.grounded_closure.closure,
      expected_root_certificate_id: expectedRootCertificateId,
      expected_scope: expectedScope,
      expected_claim: expectedClaim,
      expected_assurance: expectedAssurance,
    });
    if (!semanticMatch.ok) {
      return groundedFailure(
        "root_mismatch",
        `Fully replayed grounded closure does not match the trusted root expectation: ${semanticMatch.error.message}`,
        semanticMatch.error,
      );
    }
    return {
      ok: true,
      grounded_closure: validation.grounded_closure,
      root_certificate: semanticMatch.root_certificate,
    };
  } catch (error) {
    return groundedFailure(
      "invalid_input",
      `Trusted grounded root expectation is invalid: ${safeErrorMessage(error)}`,
    );
  }
}
