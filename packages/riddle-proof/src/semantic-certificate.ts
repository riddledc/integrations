import { createHash } from "node:crypto";
import type { JsonValue } from "./types";

export const RIDDLE_PROOF_SEMANTIC_CERTIFICATE_VERSION =
  "riddle-proof.semantic-certificate.v0" as const;

export const RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_VERSION =
  "riddle-proof.semantic-certificate-closure.v0" as const;

export const RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_MAX_CERTIFICATES = 4096;

export interface RiddleProofSemanticScope {
  repository: string;
  revision: string;
  environment: string;
  target: string;
  proof_attempt: string;
}

export interface RiddleProofSemanticClaimRef {
  claim_id: string;
  claim_version: string;
  parameters?: Record<string, JsonValue>;
}

export interface RiddleProofSemanticClaim extends RiddleProofSemanticClaimRef {
  label: string;
}

export interface RiddleProofSemanticClaimExpectation
  extends RiddleProofSemanticClaimRef {
  label?: string;
}

export interface RiddleProofSemanticEvidenceRef {
  receipt_id: string;
  artifact_digest: string;
  role: string;
  artifact_url?: string;
  artifact_path?: string;
}

export type RiddleProofSemanticEvidenceBundle = [
  RiddleProofSemanticEvidenceRef,
  ...RiddleProofSemanticEvidenceRef[],
];

export interface RiddleProofSemanticContractRef {
  contract_id: string;
  contract_version: string;
  label: string;
}

export interface RiddleProofSemanticContract extends RiddleProofSemanticContractRef {
  claim: RiddleProofSemanticClaim;
}

export interface RiddleProofSemanticRuntimeContract<Observation>
  extends RiddleProofSemanticContract {
  accepts: (scope: RiddleProofSemanticScope, observation: Observation) => boolean;
}

export interface RiddleProofSemanticRule {
  rule_id: string;
  rule_version: string;
  label: string;
  premises: [RiddleProofSemanticClaimRef, ...RiddleProofSemanticClaimRef[]];
  conclusion: RiddleProofSemanticClaim;
}

export type RiddleProofSemanticAssurance =
  | "runtime_contract_accepted"
  | "declared_runtime_rule";

export interface RiddleProofSemanticPremise {
  certificate_id: string;
  derivation_kind: RiddleProofSemanticDerivation["kind"];
  assurance: RiddleProofSemanticAssurance;
  scope: RiddleProofSemanticScope;
  claim: RiddleProofSemanticClaim;
  evidence: RiddleProofSemanticEvidenceBundle;
}

export interface RiddleProofSemanticContractDerivation {
  kind: "contract";
  assurance: "runtime_contract_accepted";
  contract: RiddleProofSemanticContract;
}

export interface RiddleProofSemanticCompositionDerivation {
  kind: "composition";
  assurance: "declared_runtime_rule";
  rule: RiddleProofSemanticRule;
  premises: [RiddleProofSemanticPremise, ...RiddleProofSemanticPremise[]];
}

export type RiddleProofSemanticDerivation =
  | RiddleProofSemanticContractDerivation
  | RiddleProofSemanticCompositionDerivation;

export interface RiddleProofSemanticCertificate {
  version: typeof RIDDLE_PROOF_SEMANTIC_CERTIFICATE_VERSION;
  certificate_id: string;
  scope: RiddleProofSemanticScope;
  claim: RiddleProofSemanticClaim;
  evidence: RiddleProofSemanticEvidenceBundle;
  derivation: RiddleProofSemanticDerivation;
  issued_at: string;
}

export interface CreateRiddleProofSemanticCertificateInput<Observation> {
  scope: RiddleProofSemanticScope;
  evidence: RiddleProofSemanticEvidenceBundle;
  observation: Observation;
  contract: RiddleProofSemanticRuntimeContract<Observation>;
  issued_at?: string;
}

export interface RiddleProofSemanticContractRejected {
  code: "contract_rejected";
  contract: RiddleProofSemanticContractRef;
  message: string;
}

export interface RiddleProofSemanticContractError {
  code: "contract_error";
  contract: RiddleProofSemanticContractRef;
  message: string;
}

export type RiddleProofSemanticCertificationResult =
  | { ok: true; certificate: RiddleProofSemanticCertificate }
  | { ok: false; error: RiddleProofSemanticContractRejected | RiddleProofSemanticContractError };

export interface ComposeRiddleProofSemanticCertificatesInput {
  rule: RiddleProofSemanticRule;
  certificates: [RiddleProofSemanticCertificate, ...RiddleProofSemanticCertificate[]];
  issued_at?: string;
}

export type RiddleProofSemanticScopeField = keyof RiddleProofSemanticScope;

export interface RiddleProofSemanticScopeMismatch {
  code: "scope_mismatch";
  input_index: number;
  field: RiddleProofSemanticScopeField;
  expected: string;
  observed: string;
  message: string;
}

export interface RiddleProofSemanticPremiseCountMismatch {
  code: "premise_count_mismatch";
  expected: number;
  observed: number;
  message: string;
}

export interface RiddleProofSemanticPremiseMismatch {
  code: "premise_mismatch";
  input_index: number;
  expected: RiddleProofSemanticClaimRef;
  observed: RiddleProofSemanticClaimRef;
  message: string;
}

export type RiddleProofSemanticCompositionError =
  | RiddleProofSemanticScopeMismatch
  | RiddleProofSemanticPremiseCountMismatch
  | RiddleProofSemanticPremiseMismatch;

export type RiddleProofSemanticCompositionResult =
  | { ok: true; certificate: RiddleProofSemanticCertificate }
  | { ok: false; error: RiddleProofSemanticCompositionError };

export interface RiddleProofSemanticCertificateClosure {
  version: typeof RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_VERSION;
  root_certificate_id: string;
  certificates: [
    RiddleProofSemanticCertificate,
    ...RiddleProofSemanticCertificate[],
  ];
}

export type RiddleProofSemanticPremiseSnapshotField =
  | "derivation_kind"
  | "assurance"
  | "scope"
  | "claim"
  | "evidence";

export interface RiddleProofSemanticCertificateClosureInvalid {
  code: "invalid_closure";
  message: string;
}

export interface RiddleProofSemanticCertificateClosureCertificateInvalid {
  code: "invalid_closure_certificate";
  input_index: number;
  message: string;
}

export interface RiddleProofSemanticCertificateClosureDuplicateId {
  code: "duplicate_certificate_id";
  certificate_id: string;
  first_index: number;
  duplicate_index: number;
  message: string;
}

export interface RiddleProofSemanticCertificateClosureRootMissing {
  code: "root_certificate_missing";
  root_certificate_id: string;
  message: string;
}

export interface RiddleProofSemanticCertificateClosureDanglingPremise {
  code: "dangling_premise";
  parent_certificate_id: string;
  premise_index: number;
  premise_certificate_id: string;
  message: string;
}

export interface RiddleProofSemanticCertificateClosurePremiseMismatch {
  code: "premise_snapshot_mismatch";
  parent_certificate_id: string;
  premise_index: number;
  premise_certificate_id: string;
  field: RiddleProofSemanticPremiseSnapshotField;
  message: string;
}

export interface RiddleProofSemanticCertificateClosureCycle {
  code: "certificate_cycle";
  certificate_ids: string[];
  message: string;
}

export interface RiddleProofSemanticCertificateClosureUnreachable {
  code: "unreachable_certificates";
  certificate_ids: string[];
  message: string;
}

export type RiddleProofSemanticCertificateClosureValidationError =
  | RiddleProofSemanticCertificateClosureInvalid
  | RiddleProofSemanticCertificateClosureCertificateInvalid
  | RiddleProofSemanticCertificateClosureDuplicateId
  | RiddleProofSemanticCertificateClosureRootMissing
  | RiddleProofSemanticCertificateClosureDanglingPremise
  | RiddleProofSemanticCertificateClosurePremiseMismatch
  | RiddleProofSemanticCertificateClosureCycle
  | RiddleProofSemanticCertificateClosureUnreachable;

export type RiddleProofSemanticCertificateClosureValidationResult =
  | {
      ok: true;
      closure: RiddleProofSemanticCertificateClosure;
      root_certificate: RiddleProofSemanticCertificate;
    }
  | { ok: false; error: RiddleProofSemanticCertificateClosureValidationError };

export interface CreateRiddleProofSemanticAtomicCertificateClosureInput {
  certificate: unknown;
}

export interface ComposeRiddleProofSemanticCertificateClosuresInput {
  rule: RiddleProofSemanticRule;
  closures: [unknown, ...unknown[]];
  issued_at?: string;
}

export interface RiddleProofSemanticCertificateClosureInputInvalid {
  code: "input_closure_invalid";
  input_index: number;
  cause: RiddleProofSemanticCertificateClosureValidationError;
  message: string;
}

export interface RiddleProofSemanticCertificateClosureIdCollision {
  code: "certificate_id_collision";
  certificate_id: string;
  message: string;
}

export interface RiddleProofSemanticCertificateClosureConstructionFailed {
  code: "closure_construction_failed";
  cause: RiddleProofSemanticCertificateClosureValidationError;
  message: string;
}

export type RiddleProofSemanticCertificateClosureCompositionError =
  | RiddleProofSemanticCompositionError
  | RiddleProofSemanticCertificateClosureInputInvalid
  | RiddleProofSemanticCertificateClosureIdCollision
  | RiddleProofSemanticCertificateClosureConstructionFailed;

export type RiddleProofSemanticCertificateClosureCompositionResult =
  | {
      ok: true;
      certificate: RiddleProofSemanticCertificate;
      closure: RiddleProofSemanticCertificateClosure;
    }
  | { ok: false; error: RiddleProofSemanticCertificateClosureCompositionError };

export interface MatchRiddleProofSemanticCertificateInput {
  certificate: unknown;
  expected_certificate_id: string;
  expected_scope: RiddleProofSemanticScope;
  expected_claim: RiddleProofSemanticClaimExpectation;
  expected_assurance: RiddleProofSemanticAssurance;
}

export interface RiddleProofSemanticCertificateInvalid {
  code: "invalid_certificate";
  message: string;
}

export interface RiddleProofSemanticCertificateIdMismatch {
  code: "certificate_id_mismatch";
  expected: string;
  observed: string;
  message: string;
}

export interface RiddleProofSemanticCertificateMatchScopeMismatch {
  code: "scope_mismatch";
  field: RiddleProofSemanticScopeField;
  expected: string;
  observed: string;
  message: string;
}

export interface RiddleProofSemanticCertificateClaimMismatch {
  code: "claim_mismatch";
  expected: RiddleProofSemanticClaimRef;
  observed: RiddleProofSemanticClaimRef;
  message: string;
}

export interface RiddleProofSemanticCertificateAssuranceMismatch {
  code: "assurance_mismatch";
  expected: RiddleProofSemanticAssurance;
  observed: RiddleProofSemanticAssurance;
  message: string;
}

export type RiddleProofSemanticCertificateMatchError =
  | RiddleProofSemanticCertificateInvalid
  | RiddleProofSemanticCertificateIdMismatch
  | RiddleProofSemanticCertificateMatchScopeMismatch
  | RiddleProofSemanticCertificateClaimMismatch
  | RiddleProofSemanticCertificateAssuranceMismatch;

export type RiddleProofSemanticCertificateMatchResult =
  | { ok: true; certificate: RiddleProofSemanticCertificate }
  | { ok: false; error: RiddleProofSemanticCertificateMatchError };

export interface MatchRiddleProofSemanticCertificateClosureInput {
  closure: unknown;
  expected_root_certificate_id: string;
  expected_scope: RiddleProofSemanticScope;
  expected_claim: RiddleProofSemanticClaimExpectation;
  expected_assurance: RiddleProofSemanticAssurance;
}

export type RiddleProofSemanticCertificateClosureMatchError =
  | RiddleProofSemanticCertificateClosureValidationError
  | RiddleProofSemanticCertificateMatchError;

export type RiddleProofSemanticCertificateClosureMatchResult =
  | {
      ok: true;
      closure: RiddleProofSemanticCertificateClosure;
      root_certificate: RiddleProofSemanticCertificate;
    }
  | { ok: false; error: RiddleProofSemanticCertificateClosureMatchError };

type RiddleProofSemanticCertificateBody = Omit<
  RiddleProofSemanticCertificate,
  "certificate_id"
>;

const SCOPE_FIELDS: readonly RiddleProofSemanticScopeField[] = [
  "repository",
  "revision",
  "environment",
  "target",
  "proof_attempt",
];

const AUTHORITY_FIELDS = [
  "authority",
  "status",
  "verdict",
  "ready_to_ship",
  "merge_ready",
  "sync_allowed",
  "ship_authorized",
  "shipping_authorized",
  "shipping_disabled",
  "merge_recommended",
  "merge_recommendation",
  "shipping_authorization",
] as const;

const CERTIFICATE_FIELDS = new Set([
  "version",
  "certificate_id",
  "scope",
  "claim",
  "evidence",
  "derivation",
  "issued_at",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeErrorMessage(error: unknown): string {
  try {
    if (error instanceof Error) return String(error.message);
  } catch {
    // Fall through to generic stringification.
  }
  try {
    return String(error);
  } catch {
    return "unprintable thrown value";
  }
}

function assertOnlyKeys(
  record: Record<string, unknown>,
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

function readDenseDataArray(
  value: unknown,
  context: string,
  maximumLength?: number,
): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(`${context} must be a plain array.`);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    !lengthDescriptor
    || typeof lengthDescriptor.value !== "number"
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
  ) {
    throw new Error(`${context}.length must be an own data field.`);
  }
  const length = lengthDescriptor.value;
  if (maximumLength !== undefined && length > maximumLength) {
    throw new Error(`${context} exceeds ${maximumLength} entries.`);
  }
  const indexedElements: Array<[number, unknown]> = [];
  let elementCount = 0;
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
    indexedElements.push([index, descriptor.value]);
    elementCount += 1;
  }
  if (elementCount !== length) {
    throw new Error(`${context} must not contain sparse or inherited entries.`);
  }
  indexedElements.sort(([left], [right]) => left - right);
  return indexedElements.map(([, entry]) => entry);
}

function requiredField(
  record: Record<string, unknown>,
  key: string,
  context: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) {
    throw new Error(`${context}.${key} is required.`);
  }
  if (
    descriptor.enumerable !== true
    || descriptor.get !== undefined
    || descriptor.set !== undefined
  ) {
    throw new Error(`${context}.${key} must be an enumerable data field.`);
  }
  return descriptor.value;
}

function optionalField(
  record: Record<string, unknown>,
  key: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) return undefined;
  if (
    descriptor.enumerable !== true
    || descriptor.get !== undefined
    || descriptor.set !== undefined
  ) {
    throw new Error(`${key} must be an enumerable data field.`);
  }
  return descriptor.value;
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
  context: string,
): string {
  const value = requiredField(record, key, context);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${context}.${key} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  context: string,
): string | undefined {
  if (optionalField(record, key) === undefined) return undefined;
  return requiredString(record, key, context);
}

function cloneJsonValue(
  value: unknown,
  context: string,
  ancestors = new Set<object>(),
): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${context} must contain only finite numbers.`);
    return value;
  }
  if (Array.isArray(value)) {
    const elements = readDenseDataArray(value, context);
    if (ancestors.has(value)) throw new Error(`${context} must not be cyclic.`);
    ancestors.add(value);
    const cloned = elements.map((entry, index) =>
      cloneJsonValue(entry, `${context}[${index}]`, ancestors));
    ancestors.delete(value);
    return cloned;
  }
  if (!isRecord(value)) throw new Error(`${context} must contain only JSON values.`);
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

function parseJsonObject(
  value: unknown,
  context: string,
): Record<string, JsonValue> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error(`${context} must be a JSON object.`);
  }
  const cloned = cloneJsonValue(value, context);
  if (!isRecord(cloned)) {
    throw new Error(`${context} must remain a JSON object when serialized.`);
  }
  return cloned;
}

function parseIssuedAt(value: unknown, context: string): string {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${context} must be a valid timestamp.`);
  }
  return value.trim();
}

function parseScope(value: unknown, context: string): RiddleProofSemanticScope {
  if (!isRecord(value)) throw new Error(`${context} must be an object.`);
  assertOnlyKeys(value, SCOPE_FIELDS, context);
  return {
    repository: requiredString(value, "repository", context),
    revision: requiredString(value, "revision", context),
    environment: requiredString(value, "environment", context),
    target: requiredString(value, "target", context),
    proof_attempt: requiredString(value, "proof_attempt", context),
  };
}

function parseClaimRef(
  value: unknown,
  context: string,
  allowedExtras: readonly string[] = [],
): RiddleProofSemanticClaimRef {
  if (!isRecord(value)) throw new Error(`${context} must be an object.`);
  assertOnlyKeys(value, ["claim_id", "claim_version", "parameters", ...allowedExtras], context);
  const parameters = parseJsonObject(optionalField(value, "parameters"), `${context}.parameters`);
  return {
    claim_id: requiredString(value, "claim_id", context),
    claim_version: requiredString(value, "claim_version", context),
    ...(parameters ? { parameters } : {}),
  };
}

function parseClaim(value: unknown, context: string): RiddleProofSemanticClaim {
  if (!isRecord(value)) throw new Error(`${context} must be an object.`);
  return {
    ...parseClaimRef(value, context, ["label"]),
    label: requiredString(value, "label", context),
  };
}

function parseEvidenceRef(value: unknown, context: string): RiddleProofSemanticEvidenceRef {
  if (!isRecord(value)) throw new Error(`${context} must be an object.`);
  assertOnlyKeys(
    value,
    ["receipt_id", "artifact_digest", "role", "artifact_url", "artifact_path"],
    context,
  );
  const artifactDigest = requiredString(value, "artifact_digest", context).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/u.test(artifactDigest)) {
    throw new Error(`${context}.artifact_digest must be a full sha256 digest.`);
  }
  const artifactUrl = optionalString(value, "artifact_url", context);
  const artifactPath = optionalString(value, "artifact_path", context);
  return {
    receipt_id: requiredString(value, "receipt_id", context),
    artifact_digest: artifactDigest,
    role: requiredString(value, "role", context),
    ...(artifactUrl ? { artifact_url: artifactUrl } : {}),
    ...(artifactPath ? { artifact_path: artifactPath } : {}),
  };
}

function parseEvidenceBundle(value: unknown, context: string): RiddleProofSemanticEvidenceBundle {
  const entries = readDenseDataArray(value, context);
  if (entries.length === 0) {
    throw new Error(`${context} must contain at least one evidence reference.`);
  }
  return entries.map((entry, index) =>
    parseEvidenceRef(entry, `${context}[${index}]`)) as RiddleProofSemanticEvidenceBundle;
}

function parseContractRef(value: unknown, context: string): RiddleProofSemanticContractRef {
  if (!isRecord(value)) throw new Error(`${context} must be an object.`);
  return {
    contract_id: requiredString(value, "contract_id", context),
    contract_version: requiredString(value, "contract_version", context),
    label: requiredString(value, "label", context),
  };
}

function parseContract(
  value: unknown,
  context: string,
  allowRuntimePredicate = false,
): RiddleProofSemanticContract {
  if (!isRecord(value)) throw new Error(`${context} must be an object.`);
  assertOnlyKeys(
    value,
    ["contract_id", "contract_version", "label", "claim", ...(allowRuntimePredicate ? ["accepts"] : [])],
    context,
  );
  if (allowRuntimePredicate && typeof requiredField(value, "accepts", context) !== "function") {
    throw new Error(`${context}.accepts must be a function.`);
  }
  return {
    ...parseContractRef(value, context),
    claim: parseClaim(requiredField(value, "claim", context), `${context}.claim`),
  };
}

function parseRule(
  value: unknown,
  context: string,
  allowFullPremises = false,
): RiddleProofSemanticRule {
  if (!isRecord(value)) throw new Error(`${context} must be an object.`);
  assertOnlyKeys(value, ["rule_id", "rule_version", "label", "premises", "conclusion"], context);
  const premises = requiredField(value, "premises", context);
  const premiseValues = readDenseDataArray(premises, `${context}.premises`);
  if (premiseValues.length === 0) {
    throw new Error(`${context}.premises must contain at least one claim reference.`);
  }
  return {
    rule_id: requiredString(value, "rule_id", context),
    rule_version: requiredString(value, "rule_version", context),
    label: requiredString(value, "label", context),
    premises: premiseValues.map((premise, index) =>
      parseClaimRef(
        premise,
        `${context}.premises[${index}]`,
        allowFullPremises ? ["label"] : [],
      )) as RiddleProofSemanticRule["premises"],
    conclusion: parseClaim(requiredField(value, "conclusion", context), `${context}.conclusion`),
  };
}

function parsePremise(value: unknown, context: string): RiddleProofSemanticPremise {
  if (!isRecord(value)) throw new Error(`${context} must be an object.`);
  assertOnlyKeys(
    value,
    ["certificate_id", "derivation_kind", "assurance", "scope", "claim", "evidence"],
    context,
  );
  const derivationKind = requiredString(value, "derivation_kind", context);
  const assurance = requiredString(value, "assurance", context);
  const validAssurance = (derivationKind === "contract" && assurance === "runtime_contract_accepted")
    || (derivationKind === "composition" && assurance === "declared_runtime_rule");
  if (!validAssurance) {
    throw new Error(`${context} must preserve a valid derivation_kind and assurance pair.`);
  }
  return {
    certificate_id: requiredString(value, "certificate_id", context),
    derivation_kind: derivationKind as RiddleProofSemanticPremise["derivation_kind"],
    assurance: assurance as RiddleProofSemanticPremise["assurance"],
    scope: parseScope(requiredField(value, "scope", context), `${context}.scope`),
    claim: parseClaim(requiredField(value, "claim", context), `${context}.claim`),
    evidence: parseEvidenceBundle(requiredField(value, "evidence", context), `${context}.evidence`),
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Semantic certificate contains a non-JSON value.");
  return encoded;
}

function sameClaimRef(
  left: RiddleProofSemanticClaimRef,
  right: RiddleProofSemanticClaimRef,
): boolean {
  return left.claim_id === right.claim_id
    && left.claim_version === right.claim_version
    && stableJson(left.parameters || {}) === stableJson(right.parameters || {});
}

function sameEvidence(
  left: RiddleProofSemanticEvidenceBundle,
  right: RiddleProofSemanticEvidenceBundle,
): boolean {
  return stableJson(left) === stableJson(right);
}

function certificateId(body: RiddleProofSemanticCertificateBody): string {
  const digest = createHash("sha256").update(stableJson(body)).digest("hex");
  return `rpsc_${digest}`;
}

function withCertificateId(
  body: RiddleProofSemanticCertificateBody,
): RiddleProofSemanticCertificate {
  return { ...body, certificate_id: certificateId(body) };
}

function parseDerivation(value: unknown, context: string): RiddleProofSemanticDerivation {
  if (!isRecord(value)) throw new Error(`${context} must be an object.`);
  const kind = requiredString(value, "kind", context);
  if (kind === "contract") {
    assertOnlyKeys(value, ["kind", "assurance", "contract"], context);
    if (requiredField(value, "assurance", context) !== "runtime_contract_accepted") {
      throw new Error(`${context}.assurance must be runtime_contract_accepted.`);
    }
    return {
      kind,
      assurance: "runtime_contract_accepted",
      contract: parseContract(requiredField(value, "contract", context), `${context}.contract`),
    };
  }
  if (kind === "composition") {
    assertOnlyKeys(value, ["kind", "assurance", "rule", "premises"], context);
    if (requiredField(value, "assurance", context) !== "declared_runtime_rule") {
      throw new Error(`${context}.assurance must be declared_runtime_rule.`);
    }
    const premises = requiredField(value, "premises", context);
    const premiseValues = readDenseDataArray(premises, `${context}.premises`);
    if (premiseValues.length === 0) {
      throw new Error(`${context}.premises must contain at least one certificate premise.`);
    }
    return {
      kind,
      assurance: "declared_runtime_rule",
      rule: parseRule(requiredField(value, "rule", context), `${context}.rule`),
      premises: premiseValues.map((premise, index) =>
        parsePremise(premise, `${context}.premises[${index}]`)) as RiddleProofSemanticCompositionDerivation["premises"],
    };
  }
  throw new Error(`${context}.kind must be contract or composition.`);
}

export function riddleProofSemanticScopesEqual(
  left: RiddleProofSemanticScope,
  right: RiddleProofSemanticScope,
): boolean {
  return SCOPE_FIELDS.every((field) => left[field] === right[field]);
}

export function createRiddleProofSemanticCertificate<Observation>(
  input: CreateRiddleProofSemanticCertificateInput<Observation>,
): RiddleProofSemanticCertificationResult {
  if (!isRecord(input)) throw new Error("Semantic certificate input must be an object.");
  assertOnlyKeys(
    input,
    ["scope", "evidence", "observation", "contract", "issued_at"],
    "semantic certificate input",
  );
  const scope = parseScope(requiredField(input, "scope", "semantic certificate input"), "semantic certificate scope");
  const evidence = parseEvidenceBundle(
    requiredField(input, "evidence", "semantic certificate input"),
    "semantic certificate evidence",
  );
  const runtimeContract = requiredField(
    input,
    "contract",
    "semantic certificate input",
  ) as RiddleProofSemanticRuntimeContract<Observation>;
  const contract = parseContract(runtimeContract, "semantic certificate contract", true);
  const accepts = requiredField(
    runtimeContract as unknown as Record<string, unknown>,
    "accepts",
    "semantic certificate contract",
  );
  if (typeof accepts !== "function") {
    throw new Error("semantic certificate contract.accepts must be a function.");
  }
  const contractRef: RiddleProofSemanticContractRef = {
    contract_id: contract.contract_id,
    contract_version: contract.contract_version,
    label: contract.label,
  };
  const claim = contract.claim;
  let accepted: boolean;
  try {
    accepted = accepts(
      { ...scope },
      requiredField(input, "observation", "semantic certificate input") as Observation,
    ) === true;
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "contract_error",
        contract: contractRef,
        message: `Semantic contract evaluation failed: ${safeErrorMessage(error)}.`,
      },
    };
  }
  if (!accepted) {
    return {
      ok: false,
      error: {
        code: "contract_rejected",
        contract: contractRef,
        message: "Semantic contract rejected the supplied observation at this scope.",
      },
    };
  }
  const body: RiddleProofSemanticCertificateBody = {
    version: RIDDLE_PROOF_SEMANTIC_CERTIFICATE_VERSION,
    scope,
    claim,
    evidence,
    derivation: { kind: "contract", assurance: "runtime_contract_accepted", contract },
    issued_at: parseIssuedAt(
      optionalField(input, "issued_at") || new Date().toISOString(),
      "semantic certificate issued_at",
    ),
  };
  return { ok: true, certificate: withCertificateId(body) };
}

export function parseRiddleProofSemanticCertificate(
  value: unknown,
): RiddleProofSemanticCertificate {
  if (!isRecord(value)) throw new Error("Semantic certificate must be an object.");
  const version = optionalField(value, "version");
  if (version !== RIDDLE_PROOF_SEMANTIC_CERTIFICATE_VERSION) {
    throw new Error(`Unsupported Semantic certificate version ${String(version || "missing")}.`);
  }
  for (const field of AUTHORITY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(value, field)) {
      throw new Error(`Semantic certificate must not contain authority field ${field}.`);
    }
  }
  assertOnlyKeys(value, [...CERTIFICATE_FIELDS], "Semantic certificate");

  const scope = parseScope(requiredField(value, "scope", "semantic certificate"), "semantic certificate scope");
  const claim = parseClaim(requiredField(value, "claim", "semantic certificate"), "semantic certificate claim");
  const evidence = parseEvidenceBundle(
    requiredField(value, "evidence", "semantic certificate"),
    "semantic certificate evidence",
  );
  const derivation = parseDerivation(
    requiredField(value, "derivation", "semantic certificate"),
    "semantic certificate derivation",
  );
  if (derivation.kind === "contract" && !sameClaimRef(claim, derivation.contract.claim)) {
    throw new Error("Semantic contract-derived claim must match its contract claim.");
  }
  if (derivation.kind === "composition") {
    if (derivation.premises.length !== derivation.rule.premises.length) {
      throw new Error("Semantic composition premises must match the rule premise count.");
    }
    derivation.premises.forEach((premise, index) => {
      if (!riddleProofSemanticScopesEqual(scope, premise.scope)) {
        throw new Error(`Semantic composition premise ${index} must have the certificate scope.`);
      }
      if (!sameClaimRef(premise.claim, derivation.rule.premises[index])) {
        throw new Error(`Semantic composition premise ${index} must match its rule claim.`);
      }
    });
    if (!sameClaimRef(claim, derivation.rule.conclusion)) {
      throw new Error("Semantic composition claim must match its rule conclusion.");
    }
    const expectedEvidence = derivation.premises.flatMap((premise) => premise.evidence) as
      RiddleProofSemanticEvidenceBundle;
    if (!sameEvidence(evidence, expectedEvidence)) {
      throw new Error("Semantic composition evidence must be the ordered concatenation of premise evidence.");
    }
  }

  const body: RiddleProofSemanticCertificateBody = {
    version: RIDDLE_PROOF_SEMANTIC_CERTIFICATE_VERSION,
    scope,
    claim,
    evidence,
    derivation,
    issued_at: parseIssuedAt(
      requiredField(value, "issued_at", "semantic certificate"),
      "semantic certificate issued_at",
    ),
  };
  const observedId = requiredString(value, "certificate_id", "semantic certificate");
  const expectedId = certificateId(body);
  if (observedId !== expectedId) {
    throw new Error("Semantic certificate_id must match its content.");
  }
  return { ...body, certificate_id: observedId };
}

export function matchRiddleProofSemanticCertificate(
  input: MatchRiddleProofSemanticCertificateInput,
): RiddleProofSemanticCertificateMatchResult {
  if (!isRecord(input)) throw new Error("Semantic certificate match input must be a plain object.");
  assertOnlyKeys(
    input,
    [
      "certificate",
      "expected_certificate_id",
      "expected_scope",
      "expected_claim",
      "expected_assurance",
    ],
    "semantic certificate match input",
  );
  const expectedCertificateId = requiredString(
    input,
    "expected_certificate_id",
    "semantic certificate match input",
  );
  if (!/^rpsc_[0-9a-f]{64}$/u.test(expectedCertificateId)) {
    throw new Error(
      "Semantic certificate match input.expected_certificate_id must be a full rpsc content ID.",
    );
  }
  const expectedScope = parseScope(
    requiredField(input, "expected_scope", "semantic certificate match input"),
    "semantic certificate match expected_scope",
  );
  const expectedClaim = parseClaimRef(
    requiredField(input, "expected_claim", "semantic certificate match input"),
    "semantic certificate match expected_claim",
    ["label"],
  );
  const expectedAssurance = requiredString(
    input,
    "expected_assurance",
    "semantic certificate match input",
  );
  if (
    expectedAssurance !== "runtime_contract_accepted"
    && expectedAssurance !== "declared_runtime_rule"
  ) {
    throw new Error(
      "Semantic certificate match input.expected_assurance must be runtime_contract_accepted or declared_runtime_rule.",
    );
  }

  let certificate: RiddleProofSemanticCertificate;
  try {
    certificate = parseRiddleProofSemanticCertificate(
      requiredField(input, "certificate", "semantic certificate match input"),
    );
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "invalid_certificate",
        message: `Semantic certificate did not parse: ${safeErrorMessage(error)}`,
      },
    };
  }

  if (certificate.certificate_id !== expectedCertificateId) {
    return {
      ok: false,
      error: {
        code: "certificate_id_mismatch",
        expected: expectedCertificateId,
        observed: certificate.certificate_id,
        message: "Semantic certificate does not match the trusted expected content ID.",
      },
    };
  }

  const scopeMismatch = firstScopeMismatch(expectedScope, certificate.scope);
  if (scopeMismatch) {
    return {
      ok: false,
      error: {
        code: "scope_mismatch",
        ...scopeMismatch,
        message: `Semantic certificate has a different ${scopeMismatch.field} than the consumer expected.`,
      },
    };
  }

  if (!sameClaimRef(expectedClaim, certificate.claim)) {
    return {
      ok: false,
      error: {
        code: "claim_mismatch",
        expected: expectedClaim,
        observed: parseClaimRef(
          certificate.claim,
          "semantic certificate match observed claim",
          ["label"],
        ),
        message: "Semantic certificate does not state the claim the consumer expected.",
      },
    };
  }

  if (certificate.derivation.assurance !== expectedAssurance) {
    return {
      ok: false,
      error: {
        code: "assurance_mismatch",
        expected: expectedAssurance,
        observed: certificate.derivation.assurance,
        message: "Semantic certificate does not have the assurance the consumer expected.",
      },
    };
  }

  return { ok: true, certificate };
}

function firstScopeMismatch(
  expected: RiddleProofSemanticScope,
  observed: RiddleProofSemanticScope,
): { field: RiddleProofSemanticScopeField; expected: string; observed: string } | undefined {
  for (const field of SCOPE_FIELDS) {
    if (expected[field] !== observed[field]) {
      return { field, expected: expected[field], observed: observed[field] };
    }
  }
  return undefined;
}

function premiseFromCertificate(
  certificate: RiddleProofSemanticCertificate,
): RiddleProofSemanticPremise {
  return {
    certificate_id: certificate.certificate_id,
    derivation_kind: certificate.derivation.kind,
    assurance: certificate.derivation.assurance,
    scope: { ...certificate.scope },
    claim: parseClaim(certificate.claim, "semantic composition premise claim"),
    evidence: certificate.evidence.map((entry) => ({ ...entry })) as RiddleProofSemanticEvidenceBundle,
  };
}

export function composeRiddleProofSemanticCertificates(
  input: ComposeRiddleProofSemanticCertificatesInput,
): RiddleProofSemanticCompositionResult {
  if (!isRecord(input)) throw new Error("Semantic composition input must be an object.");
  assertOnlyKeys(
    input,
    ["rule", "certificates", "issued_at"],
    "semantic composition input",
  );
  const rule = parseRule(
    requiredField(input, "rule", "semantic composition input"),
    "semantic composition rule",
    true,
  );
  const inputCertificates = requiredField(input, "certificates", "semantic composition input");
  const certificateValues = readDenseDataArray(
    inputCertificates,
    "semantic composition input.certificates",
  );
  if (certificateValues.length === 0) {
    throw new Error("Semantic composition requires at least one certificate.");
  }
  const certificates = certificateValues.map((certificate) =>
    parseRiddleProofSemanticCertificate(certificate));
  if (certificates.length !== rule.premises.length) {
    return {
      ok: false,
      error: {
        code: "premise_count_mismatch",
        expected: rule.premises.length,
        observed: certificates.length,
        message: `Semantic rule expected ${rule.premises.length} certificate(s), received ${certificates.length}.`,
      },
    };
  }

  const expectedScope = certificates[0].scope;
  for (let index = 1; index < certificates.length; index += 1) {
    const mismatch = firstScopeMismatch(expectedScope, certificates[index].scope);
    if (mismatch) {
      return {
        ok: false,
        error: {
          code: "scope_mismatch",
          input_index: index,
          ...mismatch,
          message: `Semantic certificate ${index} has a different ${mismatch.field}.`,
        },
      };
    }
  }

  for (let index = 0; index < certificates.length; index += 1) {
    const expected = rule.premises[index];
    const observed = certificates[index].claim;
    if (!sameClaimRef(expected, observed)) {
      return {
        ok: false,
        error: {
          code: "premise_mismatch",
          input_index: index,
          expected,
          observed: parseClaimRef(observed, "semantic composition observed claim", ["label"]),
          message: `Semantic certificate ${index} does not satisfy its declared rule premise.`,
        },
      };
    }
  }

  const evidence = certificates.flatMap((certificate) => certificate.evidence) as
    RiddleProofSemanticEvidenceBundle;
  const body: RiddleProofSemanticCertificateBody = {
    version: RIDDLE_PROOF_SEMANTIC_CERTIFICATE_VERSION,
    scope: { ...expectedScope },
    claim: { ...rule.conclusion },
    evidence,
    derivation: {
      kind: "composition",
      assurance: "declared_runtime_rule",
      rule,
      premises: certificates.map(premiseFromCertificate) as RiddleProofSemanticCompositionDerivation["premises"],
    },
    issued_at: parseIssuedAt(
      optionalField(input, "issued_at") || new Date().toISOString(),
      "semantic certificate issued_at",
    ),
  };
  return { ok: true, certificate: withCertificateId(body) };
}

function invalidClosure(
  message: string,
): RiddleProofSemanticCertificateClosureValidationResult {
  return { ok: false, error: { code: "invalid_closure", message } };
}

function firstPremiseSnapshotMismatch(
  snapshot: RiddleProofSemanticPremise,
  certificate: RiddleProofSemanticCertificate,
): RiddleProofSemanticPremiseSnapshotField | undefined {
  const observed = premiseFromCertificate(certificate);
  if (snapshot.derivation_kind !== observed.derivation_kind) return "derivation_kind";
  if (snapshot.assurance !== observed.assurance) return "assurance";
  if (stableJson(snapshot.scope) !== stableJson(observed.scope)) return "scope";
  if (stableJson(snapshot.claim) !== stableJson(observed.claim)) return "claim";
  if (stableJson(snapshot.evidence) !== stableJson(observed.evidence)) return "evidence";
  return undefined;
}

function validateSemanticCertificateClosureInternal(
  value: unknown,
): RiddleProofSemanticCertificateClosureValidationResult {
  if (!isRecord(value)) {
    return invalidClosure("Semantic certificate closure must be a plain object.");
  }
  assertOnlyKeys(
    value,
    ["version", "root_certificate_id", "certificates"],
    "Semantic certificate closure",
  );
  if (
    requiredField(value, "version", "Semantic certificate closure")
    !== RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_VERSION
  ) {
    return invalidClosure("Unsupported Semantic certificate closure version.");
  }
  const rootCertificateId = requiredString(
    value,
    "root_certificate_id",
    "Semantic certificate closure",
  );
  if (!/^rpsc_[0-9a-f]{64}$/u.test(rootCertificateId)) {
    return invalidClosure(
      "Semantic certificate closure.root_certificate_id must be a full rpsc content ID.",
    );
  }
  const inputCertificates = requiredField(
    value,
    "certificates",
    "Semantic certificate closure",
  );
  const certificateValues = readDenseDataArray(
    inputCertificates,
    "Semantic certificate closure.certificates",
    RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_MAX_CERTIFICATES,
  );
  if (certificateValues.length === 0) {
    return invalidClosure("Semantic certificate closure must contain at least one certificate.");
  }

  const certificates: RiddleProofSemanticCertificate[] = [];
  for (let index = 0; index < certificateValues.length; index += 1) {
    try {
      certificates.push(parseRiddleProofSemanticCertificate(certificateValues[index]));
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "invalid_closure_certificate",
          input_index: index,
          message: `Semantic certificate closure certificate ${index} did not parse: ${safeErrorMessage(error)}`,
        },
      };
    }
  }

  const certificatesById = new Map<string, RiddleProofSemanticCertificate>();
  const firstIndexById = new Map<string, number>();
  for (let index = 0; index < certificates.length; index += 1) {
    const certificate = certificates[index];
    const firstIndex = firstIndexById.get(certificate.certificate_id);
    if (firstIndex !== undefined) {
      return {
        ok: false,
        error: {
          code: "duplicate_certificate_id",
          certificate_id: certificate.certificate_id,
          first_index: firstIndex,
          duplicate_index: index,
          message: `Semantic certificate closure repeats certificate ${certificate.certificate_id}.`,
        },
      };
    }
    firstIndexById.set(certificate.certificate_id, index);
    certificatesById.set(certificate.certificate_id, certificate);
  }

  const rootCertificate = certificatesById.get(rootCertificateId);
  if (!rootCertificate) {
    return {
      ok: false,
      error: {
        code: "root_certificate_missing",
        root_certificate_id: rootCertificateId,
        message: "Semantic certificate closure does not contain its declared root certificate.",
      },
    };
  }

  type TraversalFrame = {
    certificate: RiddleProofSemanticCertificate;
    next_premise_index: number;
  };
  const states = new Map<string, "visiting" | "visited">();
  const stack: TraversalFrame[] = [{ certificate: rootCertificate, next_premise_index: 0 }];
  const dependencyFirst: RiddleProofSemanticCertificate[] = [];
  states.set(rootCertificateId, "visiting");

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    const premises = frame.certificate.derivation.kind === "composition"
      ? frame.certificate.derivation.premises
      : [];
    if (frame.next_premise_index < premises.length) {
      const premiseIndex = frame.next_premise_index;
      frame.next_premise_index += 1;
      const snapshot = premises[premiseIndex];
      const child = certificatesById.get(snapshot.certificate_id);
      if (!child) {
        return {
          ok: false,
          error: {
            code: "dangling_premise",
            parent_certificate_id: frame.certificate.certificate_id,
            premise_index: premiseIndex,
            premise_certificate_id: snapshot.certificate_id,
            message: `Semantic certificate ${frame.certificate.certificate_id} premise ${premiseIndex} has no full certificate body.`,
          },
        };
      }
      const mismatch = firstPremiseSnapshotMismatch(snapshot, child);
      if (mismatch) {
        return {
          ok: false,
          error: {
            code: "premise_snapshot_mismatch",
            parent_certificate_id: frame.certificate.certificate_id,
            premise_index: premiseIndex,
            premise_certificate_id: snapshot.certificate_id,
            field: mismatch,
            message: `Semantic certificate ${frame.certificate.certificate_id} premise ${premiseIndex} has a different ${mismatch} than its full certificate body.`,
          },
        };
      }
      const childState = states.get(child.certificate_id);
      if (childState === "visiting") {
        const cycleStart = stack.findIndex(
          (candidate) => candidate.certificate.certificate_id === child.certificate_id,
        );
        const certificateIds = stack
          .slice(Math.max(0, cycleStart))
          .map((candidate) => candidate.certificate.certificate_id);
        certificateIds.push(child.certificate_id);
        return {
          ok: false,
          error: {
            code: "certificate_cycle",
            certificate_ids: certificateIds,
            message: "Semantic certificate closure contains a certificate cycle.",
          },
        };
      }
      if (childState !== "visited") {
        states.set(child.certificate_id, "visiting");
        stack.push({ certificate: child, next_premise_index: 0 });
      }
      continue;
    }
    stack.pop();
    states.set(frame.certificate.certificate_id, "visited");
    dependencyFirst.push(frame.certificate);
  }

  if (dependencyFirst.length !== certificates.length) {
    const reachable = new Set(dependencyFirst.map((certificate) => certificate.certificate_id));
    const unreachable = certificates
      .filter((certificate) => !reachable.has(certificate.certificate_id))
      .map((certificate) => certificate.certificate_id)
      .sort();
    return {
      ok: false,
      error: {
        code: "unreachable_certificates",
        certificate_ids: unreachable,
        message: "Semantic certificate closure contains certificates unreachable from its root.",
      },
    };
  }

  const closure: RiddleProofSemanticCertificateClosure = {
    version: RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_VERSION,
    root_certificate_id: rootCertificateId,
    certificates: dependencyFirst as RiddleProofSemanticCertificateClosure["certificates"],
  };
  return { ok: true, closure, root_certificate: rootCertificate };
}

export function validateRiddleProofSemanticCertificateClosure(
  value: unknown,
): RiddleProofSemanticCertificateClosureValidationResult {
  try {
    return validateSemanticCertificateClosureInternal(value);
  } catch (error) {
    return invalidClosure(
      `Semantic certificate closure did not parse: ${safeErrorMessage(error)}`,
    );
  }
}

export function createRiddleProofSemanticAtomicCertificateClosure(
  input: CreateRiddleProofSemanticAtomicCertificateClosureInput,
): RiddleProofSemanticCertificateClosureValidationResult {
  if (!isRecord(input)) throw new Error("Semantic certificate closure input must be a plain object.");
  assertOnlyKeys(input, ["certificate"], "Semantic certificate closure input");
  const certificate = requiredField(input, "certificate", "Semantic certificate closure input");
  let parsedCertificate: RiddleProofSemanticCertificate;
  try {
    parsedCertificate = parseRiddleProofSemanticCertificate(certificate);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "invalid_closure_certificate",
        input_index: 0,
        message: `Semantic certificate closure certificate 0 did not parse: ${safeErrorMessage(error)}`,
      },
    };
  }
  if (parsedCertificate.derivation.kind !== "contract") {
    return invalidClosure(
      "An atomic Semantic certificate closure requires a contract-derived certificate.",
    );
  }
  return validateRiddleProofSemanticCertificateClosure({
    version: RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_VERSION,
    root_certificate_id: parsedCertificate.certificate_id,
    certificates: [certificate],
  });
}

export function composeRiddleProofSemanticCertificateClosures(
  input: ComposeRiddleProofSemanticCertificateClosuresInput,
): RiddleProofSemanticCertificateClosureCompositionResult {
  if (!isRecord(input)) throw new Error("Semantic closure composition input must be a plain object.");
  assertOnlyKeys(
    input,
    ["rule", "closures", "issued_at"],
    "Semantic closure composition input",
  );
  const inputClosures = requiredField(
    input,
    "closures",
    "Semantic closure composition input",
  );
  const closureValues = readDenseDataArray(
    inputClosures,
    "Semantic closure composition input.closures",
  );
  if (closureValues.length === 0) {
    throw new Error("Semantic closure composition requires at least one closure.");
  }
  const validatedClosures: RiddleProofSemanticCertificateClosureValidationResult[] = [];
  for (let index = 0; index < closureValues.length; index += 1) {
    const result = validateRiddleProofSemanticCertificateClosure(closureValues[index]);
    if (!result.ok) {
      return {
        ok: false,
        error: {
          code: "input_closure_invalid",
          input_index: index,
          cause: result.error,
          message: `Semantic input closure ${index} is invalid: ${result.error.message}`,
        },
      };
    }
    validatedClosures.push(result);
  }

  const roots = validatedClosures.map((result) => {
    if (!result.ok) throw new Error("Validated Semantic closure unexpectedly became invalid.");
    return result.root_certificate;
  }) as [RiddleProofSemanticCertificate, ...RiddleProofSemanticCertificate[]];
  const composition = composeRiddleProofSemanticCertificates({
    rule: requiredField(input, "rule", "Semantic closure composition input") as RiddleProofSemanticRule,
    certificates: roots,
    issued_at: optionalField(input, "issued_at") as string | undefined,
  });
  if (!composition.ok) return composition;

  const merged: RiddleProofSemanticCertificate[] = [];
  const byId = new Map<string, RiddleProofSemanticCertificate>();
  for (const result of validatedClosures) {
    if (!result.ok) continue;
    for (const certificate of result.closure.certificates) {
      const existing = byId.get(certificate.certificate_id);
      if (existing) {
        if (stableJson(existing) !== stableJson(certificate)) {
          return {
            ok: false,
            error: {
              code: "certificate_id_collision",
              certificate_id: certificate.certificate_id,
              message: `Semantic closures contain unequal bodies for ${certificate.certificate_id}.`,
            },
          };
        }
        continue;
      }
      byId.set(certificate.certificate_id, certificate);
      merged.push(certificate);
    }
  }
  if (byId.has(composition.certificate.certificate_id)) {
    return {
      ok: false,
      error: {
        code: "certificate_id_collision",
        certificate_id: composition.certificate.certificate_id,
        message: "Semantic composition produced a root ID already present in its premise closures.",
      },
    };
  }
  merged.push(composition.certificate);

  const validation = validateRiddleProofSemanticCertificateClosure({
    version: RIDDLE_PROOF_SEMANTIC_CERTIFICATE_CLOSURE_VERSION,
    root_certificate_id: composition.certificate.certificate_id,
    certificates: merged,
  });
  if (!validation.ok) {
    return {
      ok: false,
      error: {
        code: "closure_construction_failed",
        cause: validation.error,
        message: `Semantic closure construction failed: ${validation.error.message}`,
      },
    };
  }
  return {
    ok: true,
    certificate: composition.certificate,
    closure: validation.closure,
  };
}

export function matchRiddleProofSemanticCertificateClosure(
  input: MatchRiddleProofSemanticCertificateClosureInput,
): RiddleProofSemanticCertificateClosureMatchResult {
  if (!isRecord(input)) throw new Error("Semantic certificate closure match input must be a plain object.");
  assertOnlyKeys(
    input,
    [
      "closure",
      "expected_root_certificate_id",
      "expected_scope",
      "expected_claim",
      "expected_assurance",
    ],
    "Semantic certificate closure match input",
  );
  const validation = validateRiddleProofSemanticCertificateClosure(
    requiredField(input, "closure", "Semantic certificate closure match input"),
  );
  if (!validation.ok) return validation;
  const expectedRootCertificateId = requiredString(
    input,
    "expected_root_certificate_id",
    "Semantic certificate closure match input",
  );
  if (!/^rpsc_[0-9a-f]{64}$/u.test(expectedRootCertificateId)) {
    throw new Error(
      "Semantic certificate closure match input.expected_root_certificate_id must be a full rpsc content ID.",
    );
  }
  const rootMatch = matchRiddleProofSemanticCertificate({
    certificate: validation.root_certificate,
    expected_certificate_id: expectedRootCertificateId,
    expected_scope: requiredField(
      input,
      "expected_scope",
      "Semantic certificate closure match input",
    ) as RiddleProofSemanticScope,
    expected_claim: requiredField(
      input,
      "expected_claim",
      "Semantic certificate closure match input",
    ) as RiddleProofSemanticClaimExpectation,
    expected_assurance: requiredField(
      input,
      "expected_assurance",
      "Semantic certificate closure match input",
    ) as RiddleProofSemanticAssurance,
  });
  if (!rootMatch.ok) return rootMatch;
  return {
    ok: true,
    closure: validation.closure,
    root_certificate: rootMatch.certificate,
  };
}
