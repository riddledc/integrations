import { createHash } from "node:crypto";
import type { JsonValue } from "./types";

export const RIDDLE_PROOF_SEMANTIC_CERTIFICATE_VERSION =
  "riddle-proof.semantic-certificate.v0" as const;

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
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) {
      throw new Error(`${context} contains unsupported field ${key}.`);
    }
  }
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
  context: string,
): string {
  const value = record[key];
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
  if (record[key] === undefined) return undefined;
  return requiredString(record, key, context);
}

function isJsonValue(value: unknown, ancestors = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    if (ancestors.has(value)) return false;
    ancestors.add(value);
    const valid = value.every((entry) => isJsonValue(entry, ancestors));
    ancestors.delete(value);
    return valid;
  }
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Object.values(value).every((entry) => isJsonValue(entry, ancestors));
  ancestors.delete(value);
  return valid;
}

function parseJsonObject(
  value: unknown,
  context: string,
): Record<string, JsonValue> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isJsonValue(value)) {
    throw new Error(`${context} must be a JSON object.`);
  }
  const cloned = JSON.parse(JSON.stringify(value)) as unknown;
  if (!isRecord(cloned) || !isJsonValue(cloned)) {
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
  const parameters = parseJsonObject(value.parameters, `${context}.parameters`);
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
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} must contain at least one evidence reference.`);
  }
  return value.map((entry, index) =>
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
  if (allowRuntimePredicate && typeof value.accepts !== "function") {
    throw new Error(`${context}.accepts must be a function.`);
  }
  return {
    ...parseContractRef(value, context),
    claim: parseClaim(value.claim, `${context}.claim`),
  };
}

function parseRule(
  value: unknown,
  context: string,
  allowFullPremises = false,
): RiddleProofSemanticRule {
  if (!isRecord(value)) throw new Error(`${context} must be an object.`);
  assertOnlyKeys(value, ["rule_id", "rule_version", "label", "premises", "conclusion"], context);
  if (!Array.isArray(value.premises) || value.premises.length === 0) {
    throw new Error(`${context}.premises must contain at least one claim reference.`);
  }
  return {
    rule_id: requiredString(value, "rule_id", context),
    rule_version: requiredString(value, "rule_version", context),
    label: requiredString(value, "label", context),
    premises: value.premises.map((premise, index) =>
      parseClaimRef(
        premise,
        `${context}.premises[${index}]`,
        allowFullPremises ? ["label"] : [],
      )) as RiddleProofSemanticRule["premises"],
    conclusion: parseClaim(value.conclusion, `${context}.conclusion`),
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
    scope: parseScope(value.scope, `${context}.scope`),
    claim: parseClaim(value.claim, `${context}.claim`),
    evidence: parseEvidenceBundle(value.evidence, `${context}.evidence`),
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
    if (value.assurance !== "runtime_contract_accepted") {
      throw new Error(`${context}.assurance must be runtime_contract_accepted.`);
    }
    return {
      kind,
      assurance: "runtime_contract_accepted",
      contract: parseContract(value.contract, `${context}.contract`),
    };
  }
  if (kind === "composition") {
    assertOnlyKeys(value, ["kind", "assurance", "rule", "premises"], context);
    if (value.assurance !== "declared_runtime_rule") {
      throw new Error(`${context}.assurance must be declared_runtime_rule.`);
    }
    if (!Array.isArray(value.premises) || value.premises.length === 0) {
      throw new Error(`${context}.premises must contain at least one certificate premise.`);
    }
    return {
      kind,
      assurance: "declared_runtime_rule",
      rule: parseRule(value.rule, `${context}.rule`),
      premises: value.premises.map((premise, index) =>
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
  const scope = parseScope(input.scope, "semantic certificate scope");
  const evidence = parseEvidenceBundle(input.evidence, "semantic certificate evidence");
  const contract = parseContract(input.contract, "semantic certificate contract", true);
  const contractRef: RiddleProofSemanticContractRef = {
    contract_id: contract.contract_id,
    contract_version: contract.contract_version,
    label: contract.label,
  };
  const claim = contract.claim;
  let accepted: boolean;
  try {
    accepted = input.contract.accepts({ ...scope }, input.observation) === true;
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "contract_error",
        contract: contractRef,
        message: `Semantic contract evaluation failed: ${error instanceof Error ? error.message : String(error)}.`,
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
    issued_at: parseIssuedAt(input.issued_at || new Date().toISOString(), "semantic certificate issued_at"),
  };
  return { ok: true, certificate: withCertificateId(body) };
}

export function parseRiddleProofSemanticCertificate(
  value: unknown,
): RiddleProofSemanticCertificate {
  if (!isRecord(value)) throw new Error("Semantic certificate must be an object.");
  if (value.version !== RIDDLE_PROOF_SEMANTIC_CERTIFICATE_VERSION) {
    throw new Error(`Unsupported Semantic certificate version ${String(value.version || "missing")}.`);
  }
  for (const field of AUTHORITY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(value, field)) {
      throw new Error(`Semantic certificate must not contain authority field ${field}.`);
    }
  }
  for (const field of Object.keys(value)) {
    if (!CERTIFICATE_FIELDS.has(field)) {
      throw new Error(`Semantic certificate contains unsupported field ${field}.`);
    }
  }

  const scope = parseScope(value.scope, "semantic certificate scope");
  const claim = parseClaim(value.claim, "semantic certificate claim");
  const evidence = parseEvidenceBundle(value.evidence, "semantic certificate evidence");
  const derivation = parseDerivation(value.derivation, "semantic certificate derivation");
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
    issued_at: parseIssuedAt(value.issued_at, "semantic certificate issued_at"),
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
  if (!isRecord(input)) throw new Error("Semantic certificate match input must be an object.");
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
    input.expected_scope,
    "semantic certificate match expected_scope",
  );
  const expectedClaim = parseClaimRef(
    input.expected_claim,
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
    certificate = parseRiddleProofSemanticCertificate(input.certificate);
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
  const rule = parseRule(input.rule, "semantic composition rule", true);
  if (!Array.isArray(input.certificates) || input.certificates.length === 0) {
    throw new Error("Semantic composition requires at least one certificate.");
  }
  const certificates = input.certificates.map((certificate) =>
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
    issued_at: parseIssuedAt(input.issued_at || new Date().toISOString(), "semantic certificate issued_at"),
  };
  return { ok: true, certificate: withCertificateId(body) };
}
