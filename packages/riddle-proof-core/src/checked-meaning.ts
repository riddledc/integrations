import { createHash } from "node:crypto";

import {
  composeRiddleProofGroundedSemanticCertificateClosures,
  RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_TIME_WINDOW_MS,
  validateRiddleProofGroundedSemanticCertificateClosure,
  type RiddleProofGroundedReplayContext,
  type RiddleProofGroundedSemanticCertificateClosure,
  type RiddleProofGroundedVerificationReceipt,
} from "./grounded-evidence";
import type { JsonValue } from "./json";
import type {
  RiddleProofSemanticClaim,
  RiddleProofSemanticClaimExpectation,
  RiddleProofSemanticClaimRef,
  RiddleProofSemanticCertificate,
  RiddleProofSemanticContractRef,
  RiddleProofSemanticRule,
  RiddleProofSemanticScope,
} from "./semantic-certificate";
import { validateRiddleProofSemanticCertificateClosure } from "./semantic-certificate";

export const RIDDLE_PROOF_CHECKED_MEANING_CLOSURE_VERSION =
  "riddle-proof.checked-meaning-closure.v0" as const;

export const RIDDLE_PROOF_CHECKED_MEANING_EXPLANATION_VERSION =
  "riddle-proof.checked-meaning-explanation.v0" as const;

export const RIDDLE_PROOF_CHECKED_MEANING_RULE_ENGINE =
  "riddle-proof.checked-meaning-rule.v0" as const;

export const RIDDLE_PROOF_CHECKED_MEANING_RULE_DIGEST_DOMAIN =
  "riddle-proof.checked-meaning-rule-definition.v0\0" as const;

export const RIDDLE_PROOF_CHECKED_MEANING_MATERIALIZED_RULE_DIGEST_DOMAIN =
  "riddle-proof.checked-meaning-materialized-rule.v0\0" as const;

export const RIDDLE_PROOF_CHECKED_MEANING_ASSURANCE =
  "checked_allowlisted_rule" as const;

export const RIDDLE_PROOF_CHECKED_MEANING_MAX_RULES = 4096;
export const RIDDLE_PROOF_CHECKED_MEANING_MAX_PREMISES = 64;
export const RIDDLE_PROOF_CHECKED_MEANING_MAX_PARAMETERS = 64;
export const RIDDLE_PROOF_CHECKED_MEANING_MAX_DEFINITION_BYTES = 64 * 1024;
export const RIDDLE_PROOF_CHECKED_MEANING_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

/** Maximum explicit age or clock-skew window accepted by consumption assessment. */
export const RIDDLE_PROOF_CHECKED_MEANING_MAX_CONSUMPTION_WINDOW_MS =
  RIDDLE_PROOF_GROUNDED_CAPTURE_MAX_TIME_WINDOW_MS;

export type RiddleProofCheckedMeaningParameterPattern =
  | { op: "any" }
  | { op: "equals"; value: JsonValue };

export interface RiddleProofCheckedMeaningPremisePattern {
  claim_id: string;
  claim_version: string;
  parameters?: Record<string, RiddleProofCheckedMeaningParameterPattern>;
}

export interface RiddleProofCheckedMeaningParameterSelector {
  premise_index: number;
  parameter: string;
}

export interface RiddleProofCheckedMeaningParameterEquality {
  members: [
    RiddleProofCheckedMeaningParameterSelector,
    RiddleProofCheckedMeaningParameterSelector,
    ...RiddleProofCheckedMeaningParameterSelector[],
  ];
}

export type RiddleProofCheckedMeaningConclusionParameter =
  | {
      op: "from_premise";
      premise_index: number;
      parameter: string;
    }
  | { op: "literal"; value: JsonValue };

export interface RiddleProofCheckedMeaningConclusionTemplate {
  claim_id: string;
  claim_version: string;
  label: string;
  parameters?: Record<string, RiddleProofCheckedMeaningConclusionParameter>;
}

export interface RiddleProofCheckedMeaningConstraints {
  all_of: true;
  parameter_equalities?: [
    RiddleProofCheckedMeaningParameterEquality,
    ...RiddleProofCheckedMeaningParameterEquality[],
  ];
  ordered_premise_chronology: true;
  /** Maximum age of each direct premise at the composition issued_at. */
  max_age_ms?: number;
}

export interface RiddleProofCheckedMeaningRuleDefinition {
  rule_id: string;
  rule_version: string;
  label: string;
  premises: [
    RiddleProofCheckedMeaningPremisePattern,
    ...RiddleProofCheckedMeaningPremisePattern[],
  ];
  conclusion: RiddleProofCheckedMeaningConclusionTemplate;
  constraints: RiddleProofCheckedMeaningConstraints;
}

export interface RiddleProofCheckedMeaningRuleRef {
  rule_id: string;
  rule_version: string;
  engine: typeof RIDDLE_PROOF_CHECKED_MEANING_RULE_ENGINE;
  implementation_digest: string;
}

export interface RiddleProofCheckedMeaningRuleRegistration
  extends RiddleProofCheckedMeaningRuleRef {
  definition: RiddleProofCheckedMeaningRuleDefinition;
}

export interface RiddleProofCheckedMeaningRuleBinding {
  certificate_id: string;
  assurance: typeof RIDDLE_PROOF_CHECKED_MEANING_ASSURANCE;
  rule_ref: RiddleProofCheckedMeaningRuleRef;
  materialized_rule_digest: string;
}

export interface RiddleProofCheckedMeaningClosure {
  version: typeof RIDDLE_PROOF_CHECKED_MEANING_CLOSURE_VERSION;
  grounded_closure: RiddleProofGroundedSemanticCertificateClosure;
  rule_bindings: RiddleProofCheckedMeaningRuleBinding[];
}

export interface CreateRiddleProofCheckedMeaningRuleInput {
  definition: unknown;
}

export interface CreateRiddleProofCheckedMeaningAtomicClosureInput {
  grounded_closure: unknown;
  replay_contexts: [RiddleProofGroundedReplayContext, ...RiddleProofGroundedReplayContext[]];
}

export interface ValidateRiddleProofCheckedMeaningClosureInput {
  checked_closure: unknown;
  replay_contexts: [RiddleProofGroundedReplayContext, ...RiddleProofGroundedReplayContext[]];
  rule_registry: RiddleProofCheckedMeaningRuleRegistration[];
  trusted_rules: RiddleProofCheckedMeaningRuleRef[];
}

export interface AssessRiddleProofCheckedMeaningClosureInput
  extends ValidateRiddleProofCheckedMeaningClosureInput {
  /** Explicit consumer clock; this API never reads ambient time. */
  consumption_time: string;
  /** Maximum age of every reachable signed capture at consumption_time. */
  max_grounded_age_ms: number;
  /** Permitted future skew for signed captures and the root certificate. */
  max_future_skew_ms: number;
}

export interface ComposeRiddleProofCheckedMeaningClosuresInput {
  expected_rule: RiddleProofCheckedMeaningRuleRef;
  closures: [unknown, ...unknown[]];
  issued_at: string;
  replay_contexts: [RiddleProofGroundedReplayContext, ...RiddleProofGroundedReplayContext[]];
  rule_registry: [
    RiddleProofCheckedMeaningRuleRegistration,
    ...RiddleProofCheckedMeaningRuleRegistration[],
  ];
  trusted_rules: [RiddleProofCheckedMeaningRuleRef, ...RiddleProofCheckedMeaningRuleRef[]];
}

export interface MatchRiddleProofCheckedMeaningClosureInput
  extends ValidateRiddleProofCheckedMeaningClosureInput {
  expected_root_certificate_id: string;
  expected_scope: RiddleProofSemanticScope;
  expected_claim: RiddleProofSemanticClaimExpectation;
  expected_root_rule: RiddleProofCheckedMeaningRuleRef;
}

export type RiddleProofCheckedMeaningErrorCode =
  | "invalid_input"
  | "invalid_rule_definition"
  | "rule_digest_mismatch"
  | "rule_not_registered"
  | "rule_not_trusted"
  | "invalid_checked_closure"
  | "grounded_validation_failed"
  | "grounded_composition_failed"
  | "duplicate_rule_binding"
  | "missing_rule_binding"
  | "extra_rule_binding"
  | "rule_binding_mismatch"
  | "premise_mismatch"
  | "parameter_mismatch"
  | "chronology_mismatch"
  | "stale_premise"
  | "root_mismatch";

export interface RiddleProofCheckedMeaningError {
  code: RiddleProofCheckedMeaningErrorCode;
  message: string;
  cause?: unknown;
}

export type RiddleProofCheckedMeaningRuleDefinitionResult =
  | {
      ok: true;
      rule_ref: RiddleProofCheckedMeaningRuleRef;
      registration: RiddleProofCheckedMeaningRuleRegistration;
    }
  | { ok: false; error: RiddleProofCheckedMeaningError };

export type RiddleProofCheckedMeaningClosureValidationResult =
  | {
      ok: true;
      checked_closure: RiddleProofCheckedMeaningClosure;
      root_certificate: RiddleProofSemanticCertificate;
      root_assurance: "grounded_contract_leaf" | typeof RIDDLE_PROOF_CHECKED_MEANING_ASSURANCE;
    }
  | { ok: false; error: RiddleProofCheckedMeaningError };

export interface RiddleProofCheckedMeaningExplanationNode {
  certificate_id: string;
  kind: "grounded_leaf" | "checked_composition";
  assurance: "grounded_contract_leaf" | typeof RIDDLE_PROOF_CHECKED_MEANING_ASSURANCE;
  scope: RiddleProofSemanticScope;
  claim: RiddleProofSemanticClaim;
  issued_at: string;
  premise_certificate_ids: string[];
  evidence: RiddleProofSemanticCertificate["evidence"];
  semantic_contract?: RiddleProofSemanticContractRef;
  checked_rule?: RiddleProofCheckedMeaningRuleBinding;
}

export interface RiddleProofCheckedMeaningExplanationFrontierEntry {
  certificate_id: string;
  bundle_id: string;
  receipt_id: string;
  statement_digest: string;
  artifact_manifest_digest: string;
  observation_digest: string;
  captured_at: string;
  signer: RiddleProofGroundedVerificationReceipt["signer"];
  verifier: RiddleProofGroundedVerificationReceipt["verifier"];
  contract: RiddleProofGroundedVerificationReceipt["contract"];
}

/**
 * A deterministic, content-light expansion of a replayed checked closure.
 *
 * The closure remains the authoritative object. This view makes its exact DAG
 * and grounded evidence frontier convenient to inspect without copying inline
 * artifact bytes or verifier observations into an explanation surface.
 */
export interface RiddleProofCheckedMeaningExplanation {
  version: typeof RIDDLE_PROOF_CHECKED_MEANING_EXPLANATION_VERSION;
  root_certificate_id: string;
  node_count: number;
  grounded_leaf_count: number;
  checked_composition_count: number;
  nodes: RiddleProofCheckedMeaningExplanationNode[];
  grounded_frontier: RiddleProofCheckedMeaningExplanationFrontierEntry[];
}

/**
 * Only `explanation` is the content-light projection. The successful result
 * also returns the authoritative replayed closure, which may contain inline
 * artifact bytes and must not be treated as safe for ordinary logs. The
 * projection itself retains scope and claim data, so content-light does not
 * mean content-free.
 */
export type RiddleProofCheckedMeaningExplanationResult =
  | {
      ok: true;
      explanation: RiddleProofCheckedMeaningExplanation;
      checked_closure: RiddleProofCheckedMeaningClosure;
      root_certificate: RiddleProofSemanticCertificate;
    }
  | { ok: false; error: RiddleProofCheckedMeaningError };

export type RiddleProofCheckedMeaningAssessmentErrorCode =
  | "invalid_assessment_input"
  | "closure_unresolved"
  | "future_timestamp";

export interface RiddleProofCheckedMeaningAssessmentError {
  code: RiddleProofCheckedMeaningAssessmentErrorCode;
  message: string;
  cause?: unknown;
  future_capture_certificate_ids?: string[];
  future_root_certificate_id?: string;
}

interface RiddleProofCheckedMeaningResolvedAssessment {
  checked_closure: RiddleProofCheckedMeaningClosure;
  root_certificate: RiddleProofSemanticCertificate;
  root_assurance: "grounded_contract_leaf" | typeof RIDDLE_PROOF_CHECKED_MEANING_ASSURANCE;
  consumption_time: string;
  max_grounded_age_ms: number;
  max_future_skew_ms: number;
}

export type RiddleProofCheckedMeaningClosureAssessmentResult =
  | (RiddleProofCheckedMeaningResolvedAssessment & {
      disposition: "checked";
      stale_certificate_ids: [];
    })
  | (RiddleProofCheckedMeaningResolvedAssessment & {
      disposition: "stale";
      stale_certificate_ids: [string, ...string[]];
    })
  | {
      disposition: "unresolved";
      error: RiddleProofCheckedMeaningAssessmentError;
    };

export type RiddleProofCheckedMeaningClosureCompositionResult =
  | {
      ok: true;
      certificate: RiddleProofSemanticCertificate;
      checked_closure: RiddleProofCheckedMeaningClosure;
      assurance: typeof RIDDLE_PROOF_CHECKED_MEANING_ASSURANCE;
    }
  | { ok: false; error: RiddleProofCheckedMeaningError };

export type RiddleProofCheckedMeaningClosureMatchResult =
  | {
      ok: true;
      checked_closure: RiddleProofCheckedMeaningClosure;
      root_certificate: RiddleProofSemanticCertificate;
      assurance: typeof RIDDLE_PROOF_CHECKED_MEANING_ASSURANCE;
    }
  | { ok: false; error: RiddleProofCheckedMeaningError };

function failure(
  code: RiddleProofCheckedMeaningErrorCode,
  message: string,
  cause?: unknown,
): { ok: false; error: RiddleProofCheckedMeaningError } {
  return {
    ok: false,
    error: { code, message, ...(cause === undefined ? {} : { cause }) },
  };
}

function safeErrorMessage(error: unknown): string {
  try {
    if (error instanceof Error) return String(error.message);
  } catch {
    // Fall through.
  }
  try {
    return String(error);
  } catch {
    return "unprintable thrown value";
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertOnlyKeys(
  record: Record<string, unknown>,
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

function field(record: Record<string, unknown>, key: string, context: string): unknown {
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

function optionalField(record: Record<string, unknown>, key: string): unknown {
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

function nonemptyString(value: unknown, context: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${context} must be a non-empty string.`);
  }
  const normalized = value.trim();
  if (normalized.length > 512) throw new Error(`${context} exceeds 512 characters.`);
  return normalized;
}

function denseArray(value: unknown, context: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(`${context} must be a plain array.`);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !Number.isSafeInteger(lengthDescriptor.value)) {
    throw new Error(`${context}.length must be a data field.`);
  }
  const length = lengthDescriptor.value as number;
  if (length > maximum) throw new Error(`${context} exceeds ${maximum} entries.`);
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

function cloneJson(
  value: unknown,
  context: string,
  ancestors = new Set<object>(),
  depth = 0,
): JsonValue {
  if (depth > 64) throw new Error(`${context} exceeds the maximum nesting depth.`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${context} contains a non-finite number.`);
    return value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new Error(`${context} must not be cyclic.`);
    ancestors.add(value);
    const result = denseArray(value, context, RIDDLE_PROOF_CHECKED_MEANING_MAX_PARAMETERS)
      .map((entry, index) => cloneJson(entry, `${context}[${index}]`, ancestors, depth + 1));
    ancestors.delete(value);
    return result;
  }
  if (!isPlainRecord(value)) throw new Error(`${context} must contain only JSON data.`);
  if (ancestors.has(value)) throw new Error(`${context} must not be cyclic.`);
  ancestors.add(value);
  const result: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
  const keys = Reflect.ownKeys(value);
  if (keys.length > RIDDLE_PROOF_CHECKED_MEANING_MAX_PARAMETERS) {
    throw new Error(`${context} exceeds ${RIDDLE_PROOF_CHECKED_MEANING_MAX_PARAMETERS} fields.`);
  }
  for (const key of keys) {
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
    result[key] = cloneJson(descriptor.value, `${context}.${key}`, ancestors, depth + 1);
  }
  ancestors.delete(value);
  return result;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isPlainRecord(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("value is not canonical JSON data");
  return encoded;
}

function sha256(domain: string, value: unknown): string {
  return `sha256:${createHash("sha256").update(domain).update(stableJson(value)).digest("hex")}`;
}

function parseDigest(value: unknown, context: string): string {
  const digest = nonemptyString(value, context);
  if (!/^sha256:[0-9a-f]{64}$/u.test(digest)) {
    throw new Error(`${context} must be a full lowercase sha256 digest.`);
  }
  return digest;
}

function canonicalTimestamp(value: unknown, context: string): string {
  const text = nonemptyString(value, context);
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== text) {
    throw new Error(`${context} must be a canonical ISO timestamp.`);
  }
  return text;
}

function canonicalConsumptionTimestamp(value: unknown, context: string): string {
  if (
    typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  ) {
    throw new Error(`${context} must be a canonical UTC timestamp with millisecond precision.`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new Error(`${context} must be a real canonical UTC timestamp.`);
  }
  return value;
}

function consumptionWindowMilliseconds(value: unknown, context: string): number {
  if (
    !Number.isSafeInteger(value)
    || (value as number) < 0
    || (value as number) > RIDDLE_PROOF_CHECKED_MEANING_MAX_CONSUMPTION_WINDOW_MS
  ) {
    throw new Error(
      `${context} must be an integer from 0 through ${RIDDLE_PROOF_CHECKED_MEANING_MAX_CONSUMPTION_WINDOW_MS}.`,
    );
  }
  return value as number;
}

function parseIndex(value: unknown, context: string, premiseCount: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) >= premiseCount) {
    throw new Error(`${context} must identify an existing premise.`);
  }
  return value as number;
}

function parseParameterPattern(
  value: unknown,
  context: string,
): RiddleProofCheckedMeaningParameterPattern {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  const op = nonemptyString(field(value, "op", context), `${context}.op`);
  if (op === "any") {
    assertOnlyKeys(value, ["op"], context);
    return { op };
  }
  if (op === "equals") {
    assertOnlyKeys(value, ["op", "value"], context);
    return { op, value: cloneJson(field(value, "value", context), `${context}.value`) };
  }
  throw new Error(`${context}.op must be any or equals.`);
}

function parsePatternParameters(
  value: unknown,
  context: string,
): Record<string, RiddleProofCheckedMeaningParameterPattern> | undefined {
  if (value === undefined) return undefined;
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  const keys = Reflect.ownKeys(value);
  if (keys.length === 0) throw new Error(`${context} must be omitted instead of empty.`);
  if (keys.length > RIDDLE_PROOF_CHECKED_MEANING_MAX_PARAMETERS) {
    throw new Error(`${context} exceeds ${RIDDLE_PROOF_CHECKED_MEANING_MAX_PARAMETERS} entries.`);
  }
  const result: Record<string, RiddleProofCheckedMeaningParameterPattern> = Object.create(null) as
    Record<string, RiddleProofCheckedMeaningParameterPattern>;
  for (const rawKey of keys) {
    if (typeof rawKey !== "string") throw new Error(`${context} contains a symbol field.`);
    const key = nonemptyString(rawKey, `${context} parameter name`);
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      throw new Error(`${context} contains duplicate normalized parameter ${key}.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, rawKey);
    if (
      !descriptor
      || descriptor.enumerable !== true
      || descriptor.get !== undefined
      || descriptor.set !== undefined
    ) {
      throw new Error(`${context}.${key} must be an enumerable data field.`);
    }
    result[key] = parseParameterPattern(descriptor.value, `${context}.${key}`);
  }
  return result;
}

function parsePremisePattern(
  value: unknown,
  context: string,
): RiddleProofCheckedMeaningPremisePattern {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["claim_id", "claim_version", "parameters"], context);
  const parameters = parsePatternParameters(optionalField(value, "parameters"), `${context}.parameters`);
  return {
    claim_id: nonemptyString(field(value, "claim_id", context), `${context}.claim_id`),
    claim_version: nonemptyString(field(value, "claim_version", context), `${context}.claim_version`),
    ...(parameters ? { parameters } : {}),
  };
}

function parseSelector(
  value: unknown,
  context: string,
  premises: RiddleProofCheckedMeaningPremisePattern[],
): RiddleProofCheckedMeaningParameterSelector {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["premise_index", "parameter"], context);
  const premiseIndex = parseIndex(
    field(value, "premise_index", context),
    `${context}.premise_index`,
    premises.length,
  );
  const parameter = nonemptyString(field(value, "parameter", context), `${context}.parameter`);
  if (!Object.prototype.hasOwnProperty.call(premises[premiseIndex].parameters || {}, parameter)) {
    throw new Error(`${context} selects undeclared premise parameter ${parameter}.`);
  }
  return { premise_index: premiseIndex, parameter };
}

function parseEquality(
  value: unknown,
  context: string,
  premises: RiddleProofCheckedMeaningPremisePattern[],
): RiddleProofCheckedMeaningParameterEquality {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["members"], context);
  const members = denseArray(
    field(value, "members", context),
    `${context}.members`,
    RIDDLE_PROOF_CHECKED_MEANING_MAX_PREMISES,
  );
  if (members.length < 2) throw new Error(`${context}.members requires at least two selectors.`);
  const parsed = members.map((member, index) =>
    parseSelector(member, `${context}.members[${index}]`, premises));
  const seen = new Set<string>();
  for (const selector of parsed) {
    const key = `${selector.premise_index}\0${selector.parameter}`;
    if (seen.has(key)) throw new Error(`${context}.members repeats a selector.`);
    seen.add(key);
  }
  return { members: parsed as RiddleProofCheckedMeaningParameterEquality["members"] };
}

function parseConclusionParameter(
  value: unknown,
  context: string,
  premises: RiddleProofCheckedMeaningPremisePattern[],
): RiddleProofCheckedMeaningConclusionParameter {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  const op = nonemptyString(field(value, "op", context), `${context}.op`);
  if (op === "literal") {
    assertOnlyKeys(value, ["op", "value"], context);
    return { op, value: cloneJson(field(value, "value", context), `${context}.value`) };
  }
  if (op === "from_premise") {
    assertOnlyKeys(value, ["op", "premise_index", "parameter"], context);
    const premiseIndex = parseIndex(
      field(value, "premise_index", context),
      `${context}.premise_index`,
      premises.length,
    );
    const parameter = nonemptyString(field(value, "parameter", context), `${context}.parameter`);
    if (!Object.prototype.hasOwnProperty.call(premises[premiseIndex].parameters || {}, parameter)) {
      throw new Error(`${context} projects undeclared premise parameter ${parameter}.`);
    }
    return { op, premise_index: premiseIndex, parameter };
  }
  throw new Error(`${context}.op must be from_premise or literal.`);
}

function parseConclusionParameters(
  value: unknown,
  context: string,
  premises: RiddleProofCheckedMeaningPremisePattern[],
): Record<string, RiddleProofCheckedMeaningConclusionParameter> | undefined {
  if (value === undefined) return undefined;
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  const keys = Reflect.ownKeys(value);
  if (keys.length === 0) throw new Error(`${context} must be omitted instead of empty.`);
  if (keys.length > RIDDLE_PROOF_CHECKED_MEANING_MAX_PARAMETERS) {
    throw new Error(`${context} exceeds ${RIDDLE_PROOF_CHECKED_MEANING_MAX_PARAMETERS} entries.`);
  }
  const result: Record<string, RiddleProofCheckedMeaningConclusionParameter> = Object.create(null) as
    Record<string, RiddleProofCheckedMeaningConclusionParameter>;
  for (const rawKey of keys) {
    if (typeof rawKey !== "string") throw new Error(`${context} contains a symbol field.`);
    const key = nonemptyString(rawKey, `${context} parameter name`);
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      throw new Error(`${context} contains duplicate normalized parameter ${key}.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, rawKey);
    if (
      !descriptor
      || descriptor.enumerable !== true
      || descriptor.get !== undefined
      || descriptor.set !== undefined
    ) {
      throw new Error(`${context}.${key} must be an enumerable data field.`);
    }
    result[key] = parseConclusionParameter(descriptor.value, `${context}.${key}`, premises);
  }
  return result;
}

function parseDefinition(value: unknown): RiddleProofCheckedMeaningRuleDefinition {
  const context = "checked meaning rule definition";
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["rule_id", "rule_version", "label", "premises", "conclusion", "constraints"], context);
  const premiseValues = denseArray(
    field(value, "premises", context),
    `${context}.premises`,
    RIDDLE_PROOF_CHECKED_MEANING_MAX_PREMISES,
  );
  if (premiseValues.length === 0) throw new Error(`${context}.premises must not be empty.`);
  const premises = premiseValues.map((premise, index) =>
    parsePremisePattern(premise, `${context}.premises[${index}]`));

  const conclusionValue = field(value, "conclusion", context);
  if (!isPlainRecord(conclusionValue)) throw new Error(`${context}.conclusion must be a plain object.`);
  assertOnlyKeys(conclusionValue, ["claim_id", "claim_version", "label", "parameters"], `${context}.conclusion`);
  const conclusionParameters = parseConclusionParameters(
    optionalField(conclusionValue, "parameters"),
    `${context}.conclusion.parameters`,
    premises,
  );
  const conclusion: RiddleProofCheckedMeaningConclusionTemplate = {
    claim_id: nonemptyString(field(conclusionValue, "claim_id", `${context}.conclusion`), `${context}.conclusion.claim_id`),
    claim_version: nonemptyString(field(conclusionValue, "claim_version", `${context}.conclusion`), `${context}.conclusion.claim_version`),
    label: nonemptyString(field(conclusionValue, "label", `${context}.conclusion`), `${context}.conclusion.label`),
    ...(conclusionParameters ? { parameters: conclusionParameters } : {}),
  };

  const constraintsValue = field(value, "constraints", context);
  if (!isPlainRecord(constraintsValue)) throw new Error(`${context}.constraints must be a plain object.`);
  assertOnlyKeys(
    constraintsValue,
    ["all_of", "parameter_equalities", "ordered_premise_chronology", "max_age_ms"],
    `${context}.constraints`,
  );
  if (field(constraintsValue, "all_of", `${context}.constraints`) !== true) {
    throw new Error(`${context}.constraints.all_of must be true.`);
  }
  if (field(constraintsValue, "ordered_premise_chronology", `${context}.constraints`) !== true) {
    throw new Error(`${context}.constraints.ordered_premise_chronology must be true.`);
  }
  const equalityValue = optionalField(constraintsValue, "parameter_equalities");
  let parameterEqualities: RiddleProofCheckedMeaningParameterEquality[] | undefined;
  if (equalityValue !== undefined) {
    const values = denseArray(
      equalityValue,
      `${context}.constraints.parameter_equalities`,
      RIDDLE_PROOF_CHECKED_MEANING_MAX_PARAMETERS,
    );
    if (values.length === 0) {
      throw new Error(`${context}.constraints.parameter_equalities must be omitted instead of empty.`);
    }
    parameterEqualities = values.map((entry, index) =>
      parseEquality(entry, `${context}.constraints.parameter_equalities[${index}]`, premises));
  }
  const maxAgeValue = optionalField(constraintsValue, "max_age_ms");
  let maxAge: number | undefined;
  if (maxAgeValue !== undefined) {
    if (
      !Number.isSafeInteger(maxAgeValue)
      || (maxAgeValue as number) < 0
      || (maxAgeValue as number) > RIDDLE_PROOF_CHECKED_MEANING_MAX_AGE_MS
    ) {
      throw new Error(
        `${context}.constraints.max_age_ms must be an integer from 0 through ${RIDDLE_PROOF_CHECKED_MEANING_MAX_AGE_MS}.`,
      );
    }
    maxAge = maxAgeValue as number;
  }
  const definition: RiddleProofCheckedMeaningRuleDefinition = {
    rule_id: nonemptyString(field(value, "rule_id", context), `${context}.rule_id`),
    rule_version: nonemptyString(field(value, "rule_version", context), `${context}.rule_version`),
    label: nonemptyString(field(value, "label", context), `${context}.label`),
    premises: premises as RiddleProofCheckedMeaningRuleDefinition["premises"],
    conclusion,
    constraints: {
      all_of: true,
      ...(parameterEqualities
        ? { parameter_equalities: parameterEqualities as RiddleProofCheckedMeaningConstraints["parameter_equalities"] }
        : {}),
      ordered_premise_chronology: true,
      ...(maxAge === undefined ? {} : { max_age_ms: maxAge }),
    },
  };
  if (Buffer.byteLength(stableJson(definition), "utf8") > RIDDLE_PROOF_CHECKED_MEANING_MAX_DEFINITION_BYTES) {
    throw new Error(`${context} exceeds ${RIDDLE_PROOF_CHECKED_MEANING_MAX_DEFINITION_BYTES} bytes.`);
  }
  return definition;
}

function ruleDigest(definition: RiddleProofCheckedMeaningRuleDefinition): string {
  return sha256(RIDDLE_PROOF_CHECKED_MEANING_RULE_DIGEST_DOMAIN, definition);
}

function parseRuleRef(value: unknown, context: string): RiddleProofCheckedMeaningRuleRef {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["rule_id", "rule_version", "engine", "implementation_digest"], context);
  if (field(value, "engine", context) !== RIDDLE_PROOF_CHECKED_MEANING_RULE_ENGINE) {
    throw new Error(`${context}.engine is unsupported.`);
  }
  return {
    rule_id: nonemptyString(field(value, "rule_id", context), `${context}.rule_id`),
    rule_version: nonemptyString(field(value, "rule_version", context), `${context}.rule_version`),
    engine: RIDDLE_PROOF_CHECKED_MEANING_RULE_ENGINE,
    implementation_digest: parseDigest(
      field(value, "implementation_digest", context),
      `${context}.implementation_digest`,
    ),
  };
}

function parseRegistration(
  value: unknown,
  context: string,
): RiddleProofCheckedMeaningRuleRegistration {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(
    value,
    ["rule_id", "rule_version", "engine", "implementation_digest", "definition"],
    context,
  );
  const ruleRef = parseRuleRef({
    rule_id: field(value, "rule_id", context),
    rule_version: field(value, "rule_version", context),
    engine: field(value, "engine", context),
    implementation_digest: field(value, "implementation_digest", context),
  }, `${context} reference`);
  const definition = parseDefinition(field(value, "definition", context));
  if (
    definition.rule_id !== ruleRef.rule_id
    || definition.rule_version !== ruleRef.rule_version
  ) {
    throw new Error(`${context} definition identity does not match its reference.`);
  }
  if (ruleDigest(definition) !== ruleRef.implementation_digest) {
    throw new Error(`${context} implementation_digest does not match its complete definition.`);
  }
  return { ...ruleRef, definition };
}

export function createRiddleProofCheckedMeaningRule(
  input: CreateRiddleProofCheckedMeaningRuleInput,
): RiddleProofCheckedMeaningRuleDefinitionResult {
  try {
    if (!isPlainRecord(input)) throw new Error("checked meaning rule input must be a plain object.");
    assertOnlyKeys(input, ["definition"], "checked meaning rule input");
    const definition = parseDefinition(field(input, "definition", "checked meaning rule input"));
    const ruleRef: RiddleProofCheckedMeaningRuleRef = {
      rule_id: definition.rule_id,
      rule_version: definition.rule_version,
      engine: RIDDLE_PROOF_CHECKED_MEANING_RULE_ENGINE,
      implementation_digest: ruleDigest(definition),
    };
    return { ok: true, rule_ref: ruleRef, registration: { ...ruleRef, definition } };
  } catch (error) {
    return failure(
      "invalid_rule_definition",
      `Checked meaning rule definition failed: ${safeErrorMessage(error)}`,
    );
  }
}

function refKey(ref: Pick<RiddleProofCheckedMeaningRuleRef, "rule_id" | "rule_version">): string {
  return `${ref.rule_id}\0${ref.rule_version}`;
}

function sameRuleRef(
  left: RiddleProofCheckedMeaningRuleRef,
  right: RiddleProofCheckedMeaningRuleRef,
): boolean {
  return left.rule_id === right.rule_id
    && left.rule_version === right.rule_version
    && left.engine === right.engine
    && left.implementation_digest === right.implementation_digest;
}

interface ParsedRuleTrust {
  registrations: RiddleProofCheckedMeaningRuleRegistration[];
  trusted: RiddleProofCheckedMeaningRuleRef[];
  registrationByKey: Map<string, RiddleProofCheckedMeaningRuleRegistration>;
  trustedByKey: Map<string, RiddleProofCheckedMeaningRuleRef>;
}

function parseRuleTrust(
  registryValue: unknown,
  trustedValue: unknown,
): ParsedRuleTrust {
  const registryEntries = denseArray(
    registryValue,
    "checked meaning rule registry",
    RIDDLE_PROOF_CHECKED_MEANING_MAX_RULES,
  );
  const trustedEntries = denseArray(
    trustedValue,
    "checked meaning trusted rules",
    RIDDLE_PROOF_CHECKED_MEANING_MAX_RULES,
  );
  const registrations = registryEntries.map((entry, index) =>
    parseRegistration(entry, `checked meaning rule registry[${index}]`));
  const trusted = trustedEntries.map((entry, index) =>
    parseRuleRef(entry, `checked meaning trusted rules[${index}]`));
  const registrationByKey = new Map<string, RiddleProofCheckedMeaningRuleRegistration>();
  for (const registration of registrations) {
    const key = refKey(registration);
    if (registrationByKey.has(key)) {
      throw new Error(`checked meaning rule registry repeats ${registration.rule_id}@${registration.rule_version}.`);
    }
    registrationByKey.set(key, registration);
  }
  const trustedByKey = new Map<string, RiddleProofCheckedMeaningRuleRef>();
  for (const trustedRef of trusted) {
    const key = refKey(trustedRef);
    if (trustedByKey.has(key)) {
      throw new Error(`checked meaning trusted rules repeats ${trustedRef.rule_id}@${trustedRef.rule_version}.`);
    }
    trustedByKey.set(key, trustedRef);
  }
  return { registrations, trusted, registrationByKey, trustedByKey };
}

function resolveTrustedRegistration(
  requested: RiddleProofCheckedMeaningRuleRef,
  trust: ParsedRuleTrust,
):
  | { ok: true; registration: RiddleProofCheckedMeaningRuleRegistration }
  | { ok: false; error: RiddleProofCheckedMeaningError } {
  const key = refKey(requested);
  const trusted = trust.trustedByKey.get(key);
  if (!trusted || !sameRuleRef(trusted, requested)) {
    return failure(
      "rule_not_trusted",
      `Checked meaning rule ${requested.rule_id}@${requested.rule_version} is not independently allowlisted at the requested digest.`,
    );
  }
  const registration = trust.registrationByKey.get(key);
  if (!registration) {
    return failure(
      "rule_not_registered",
      `Checked meaning rule ${requested.rule_id}@${requested.rule_version} is not registered.`,
    );
  }
  if (!sameRuleRef(registration, requested)) {
    return failure(
      "rule_digest_mismatch",
      `Checked meaning rule ${requested.rule_id}@${requested.rule_version} registration does not match its trusted digest.`,
    );
  }
  return { ok: true, registration };
}

function parseBinding(value: unknown, context: string): RiddleProofCheckedMeaningRuleBinding {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(
    value,
    ["certificate_id", "assurance", "rule_ref", "materialized_rule_digest"],
    context,
  );
  const certificateId = nonemptyString(field(value, "certificate_id", context), `${context}.certificate_id`);
  if (!/^rpsc_[0-9a-f]{64}$/u.test(certificateId)) {
    throw new Error(`${context}.certificate_id must be a full rpsc content ID.`);
  }
  if (field(value, "assurance", context) !== RIDDLE_PROOF_CHECKED_MEANING_ASSURANCE) {
    throw new Error(`${context}.assurance is unsupported.`);
  }
  return {
    certificate_id: certificateId,
    assurance: RIDDLE_PROOF_CHECKED_MEANING_ASSURANCE,
    rule_ref: parseRuleRef(field(value, "rule_ref", context), `${context}.rule_ref`),
    materialized_rule_digest: parseDigest(
      field(value, "materialized_rule_digest", context),
      `${context}.materialized_rule_digest`,
    ),
  };
}

function claimRef(claim: RiddleProofSemanticClaim): RiddleProofSemanticClaimRef {
  return {
    claim_id: claim.claim_id,
    claim_version: claim.claim_version,
    ...(claim.parameters === undefined
      ? {}
      : { parameters: cloneJson(claim.parameters, "checked meaning premise parameters") as Record<string, JsonValue> }),
  };
}

function observedParameters(claim: RiddleProofSemanticClaim): Record<string, JsonValue> {
  return claim.parameters === undefined
    ? {}
    : cloneJson(claim.parameters, "checked meaning observed parameters") as Record<string, JsonValue>;
}

function sameKeys(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return stableJson(Object.keys(left).sort()) === stableJson(Object.keys(right).sort());
}

function selectedParameter(
  certificates: RiddleProofSemanticCertificate[],
  selector: RiddleProofCheckedMeaningParameterSelector,
): JsonValue {
  const parameters = observedParameters(certificates[selector.premise_index].claim);
  if (!Object.prototype.hasOwnProperty.call(parameters, selector.parameter)) {
    throw new Error(
      `premise ${selector.premise_index} is missing parameter ${selector.parameter}`,
    );
  }
  return cloneJson(
    parameters[selector.parameter],
    `checked meaning premise ${selector.premise_index} parameter ${selector.parameter}`,
  );
}

type MaterializationResult =
  | { ok: true; rule: RiddleProofSemanticRule; materialized_rule_digest: string }
  | { ok: false; error: RiddleProofCheckedMeaningError };

function materializeRule(
  registration: RiddleProofCheckedMeaningRuleRegistration,
  certificates: RiddleProofSemanticCertificate[],
  issuedAt: string,
): MaterializationResult {
  const definition = registration.definition;
  if (certificates.length !== definition.premises.length) {
    return failure(
      "premise_mismatch",
      `Checked meaning rule expected ${definition.premises.length} direct premises, received ${certificates.length}.`,
    );
  }

  for (let index = 0; index < certificates.length; index += 1) {
    const expected = definition.premises[index];
    const observed = certificates[index].claim;
    if (
      observed.claim_id !== expected.claim_id
      || observed.claim_version !== expected.claim_version
    ) {
      return failure(
        "premise_mismatch",
        `Checked meaning premise ${index} does not match ${expected.claim_id}@${expected.claim_version}.`,
      );
    }
    const expectedParameters = expected.parameters || {};
    const actualParameters = observedParameters(observed);
    if (!sameKeys(expectedParameters, actualParameters)) {
      return failure(
        "parameter_mismatch",
        `Checked meaning premise ${index} has a different parameter set than its rule pattern.`,
      );
    }
    for (const [parameter, pattern] of Object.entries(expectedParameters)) {
      if (
        pattern.op === "equals"
        && stableJson(actualParameters[parameter]) !== stableJson(pattern.value)
      ) {
        return failure(
          "parameter_mismatch",
          `Checked meaning premise ${index} parameter ${parameter} does not equal its fixed rule value.`,
        );
      }
    }
  }

  for (const [index, equality] of (definition.constraints.parameter_equalities || []).entries()) {
    let expectedValue: JsonValue;
    try {
      expectedValue = selectedParameter(certificates, equality.members[0]);
      for (let memberIndex = 1; memberIndex < equality.members.length; memberIndex += 1) {
        const observed = selectedParameter(certificates, equality.members[memberIndex]);
        if (stableJson(observed) !== stableJson(expectedValue)) {
          return failure(
            "parameter_mismatch",
            `Checked meaning parameter equality ${index} failed at member ${memberIndex}.`,
          );
        }
      }
    } catch (error) {
      return failure(
        "parameter_mismatch",
        `Checked meaning parameter equality ${index} could not be evaluated: ${safeErrorMessage(error)}.`,
      );
    }
  }

  const issuedAtMs = Date.parse(issuedAt);
  let previousPremiseMs = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < certificates.length; index += 1) {
    const premiseMs = Date.parse(certificates[index].issued_at);
    if (premiseMs < previousPremiseMs) {
      return failure(
        "chronology_mismatch",
        `Checked meaning premise ${index} predates the preceding ordered premise.`,
      );
    }
    previousPremiseMs = premiseMs;
    if (issuedAtMs < premiseMs) {
      return failure(
        "chronology_mismatch",
        `Checked meaning composition issued_at predates premise ${index}.`,
      );
    }
    if (
      definition.constraints.max_age_ms !== undefined
      && issuedAtMs - premiseMs > definition.constraints.max_age_ms
    ) {
      return failure(
        "stale_premise",
        `Checked meaning premise ${index} is older than the rule's ${definition.constraints.max_age_ms}ms maximum age.`,
      );
    }
  }

  const conclusionParameters: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
  try {
    for (const [name, expression] of Object.entries(definition.conclusion.parameters || {})) {
      conclusionParameters[name] = expression.op === "literal"
        ? cloneJson(expression.value, `checked meaning conclusion parameter ${name}`)
        : selectedParameter(certificates, expression);
    }
  } catch (error) {
    return failure(
      "parameter_mismatch",
      `Checked meaning conclusion parameters could not be materialized: ${safeErrorMessage(error)}.`,
    );
  }
  const conclusion: RiddleProofSemanticClaim = {
    claim_id: definition.conclusion.claim_id,
    claim_version: definition.conclusion.claim_version,
    label: definition.conclusion.label,
    ...(Object.keys(conclusionParameters).length ? { parameters: conclusionParameters } : {}),
  };
  const rule: RiddleProofSemanticRule = {
    rule_id: definition.rule_id,
    rule_version: definition.rule_version,
    label: definition.label,
    premises: certificates.map((certificate) => claimRef(certificate.claim)) as
      RiddleProofSemanticRule["premises"],
    conclusion,
  };
  return {
    ok: true,
    rule,
    materialized_rule_digest: sha256(
      RIDDLE_PROOF_CHECKED_MEANING_MATERIALIZED_RULE_DIGEST_DOMAIN,
      rule,
    ),
  };
}

function parseCheckedEnvelope(value: unknown): {
  grounded_closure: unknown;
  rule_bindings: RiddleProofCheckedMeaningRuleBinding[];
} {
  const context = "checked meaning closure";
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["version", "grounded_closure", "rule_bindings"], context);
  if (field(value, "version", context) !== RIDDLE_PROOF_CHECKED_MEANING_CLOSURE_VERSION) {
    throw new Error(`${context}.version is unsupported.`);
  }
  const bindingValues = denseArray(
    field(value, "rule_bindings", context),
    `${context}.rule_bindings`,
    RIDDLE_PROOF_CHECKED_MEANING_MAX_RULES,
  );
  const ruleBindings = bindingValues.map((binding, index) =>
    parseBinding(binding, `${context}.rule_bindings[${index}]`));
  const seen = new Set<string>();
  for (const binding of ruleBindings) {
    if (seen.has(binding.certificate_id)) {
      throw new Error(`${context} repeats a rule binding for ${binding.certificate_id}.`);
    }
    seen.add(binding.certificate_id);
  }
  return {
    grounded_closure: field(value, "grounded_closure", context),
    rule_bindings: ruleBindings,
  };
}

function validateCertificateRule(
  certificate: RiddleProofSemanticCertificate,
  certificatesById: Map<string, RiddleProofSemanticCertificate>,
  binding: RiddleProofCheckedMeaningRuleBinding,
  trust: ParsedRuleTrust,
): { ok: true } | { ok: false; error: RiddleProofCheckedMeaningError } {
  if (certificate.derivation.kind !== "composition") {
    return failure(
      "extra_rule_binding",
      `Grounded leaf ${certificate.certificate_id} must not carry a checked rule binding.`,
    );
  }
  const resolved = resolveTrustedRegistration(binding.rule_ref, trust);
  if (!resolved.ok) return resolved;
  const premises: RiddleProofSemanticCertificate[] = [];
  for (const premise of certificate.derivation.premises) {
    const full = certificatesById.get(premise.certificate_id);
    if (!full) {
      return failure(
        "rule_binding_mismatch",
        `Checked meaning certificate ${certificate.certificate_id} has a missing direct premise body.`,
      );
    }
    premises.push(full);
  }
  const materialized = materializeRule(
    resolved.registration,
    premises,
    certificate.issued_at,
  );
  if (!materialized.ok) return materialized;
  if (stableJson(certificate.derivation.rule) !== stableJson(materialized.rule)) {
    return failure(
      "rule_binding_mismatch",
      `Checked meaning certificate ${certificate.certificate_id} does not contain the exact materialized allowlisted rule.`,
    );
  }
  if (stableJson(certificate.claim) !== stableJson(materialized.rule.conclusion)) {
    return failure(
      "rule_binding_mismatch",
      `Checked meaning certificate ${certificate.certificate_id} states a conclusion not produced by its allowlisted rule.`,
    );
  }
  if (binding.materialized_rule_digest !== materialized.materialized_rule_digest) {
    return failure(
      "rule_binding_mismatch",
      `Checked meaning certificate ${certificate.certificate_id} has a different materialized rule digest.`,
    );
  }
  return { ok: true };
}

function validateBindingsForCertificates(
  certificates: RiddleProofSemanticCertificate[],
  bindings: RiddleProofCheckedMeaningRuleBinding[],
  trust: ParsedRuleTrust,
):
  | { ok: true; bindings: RiddleProofCheckedMeaningRuleBinding[] }
  | { ok: false; error: RiddleProofCheckedMeaningError } {
  const certificatesById = new Map(
    certificates.map((certificate) => [certificate.certificate_id, certificate]),
  );
  const bindingById = new Map(bindings.map((binding) => [binding.certificate_id, binding]));
  for (const binding of bindings) {
    const certificate = certificatesById.get(binding.certificate_id);
    if (!certificate || certificate.derivation.kind !== "composition") {
      return failure(
        "extra_rule_binding",
        `Checked meaning rule binding ${binding.certificate_id} does not identify a composition certificate in the closure.`,
      );
    }
  }
  for (const certificate of certificates) {
    const binding = bindingById.get(certificate.certificate_id);
    if (certificate.derivation.kind === "contract") {
      if (binding) {
        return failure(
          "extra_rule_binding",
          `Grounded leaf ${certificate.certificate_id} must not carry a checked rule binding.`,
        );
      }
      continue;
    }
    if (!binding) {
      return failure(
        "missing_rule_binding",
        `Composition certificate ${certificate.certificate_id} is missing its checked rule binding.`,
      );
    }
    const ruleValidation = validateCertificateRule(certificate, certificatesById, binding, trust);
    if (!ruleValidation.ok) return ruleValidation;
  }
  return {
    ok: true,
    bindings: certificates
      .filter((certificate) => certificate.derivation.kind === "composition")
      .map((certificate) => bindingById.get(certificate.certificate_id) as RiddleProofCheckedMeaningRuleBinding),
  };
}

function validateCheckedStructureWithParsedTrust(
  checkedClosureValue: unknown,
  trust: ParsedRuleTrust,
):
  | {
      ok: true;
      envelope: ReturnType<typeof parseCheckedEnvelope>;
      root_certificate: RiddleProofSemanticCertificate;
      rule_bindings: RiddleProofCheckedMeaningRuleBinding[];
    }
  | { ok: false; error: RiddleProofCheckedMeaningError } {
  let envelope: ReturnType<typeof parseCheckedEnvelope>;
  try {
    envelope = parseCheckedEnvelope(checkedClosureValue);
    if (!isPlainRecord(envelope.grounded_closure)) {
      throw new Error("embedded grounded closure must be a plain object.");
    }
  } catch (error) {
    return failure(
      "invalid_checked_closure",
      `Checked meaning closure did not parse: ${safeErrorMessage(error)}`,
    );
  }
  const semantic = validateRiddleProofSemanticCertificateClosure(
    field(
      envelope.grounded_closure as Record<string, unknown>,
      "closure",
      "checked meaning embedded grounded closure",
    ),
  );
  if (!semantic.ok) {
    return failure(
      "invalid_checked_closure",
      `Checked meaning embedded Semantic closure is invalid: ${semantic.error.message}`,
      semantic.error,
    );
  }
  const bindings = validateBindingsForCertificates(
    semantic.closure.certificates,
    envelope.rule_bindings,
    trust,
  );
  if (!bindings.ok) return bindings;
  return {
    ok: true,
    envelope,
    root_certificate: semantic.root_certificate,
    rule_bindings: bindings.bindings,
  };
}

function validateWithParsedTrust(
  checkedClosureValue: unknown,
  replayContexts: ValidateRiddleProofCheckedMeaningClosureInput["replay_contexts"],
  trust: ParsedRuleTrust,
): RiddleProofCheckedMeaningClosureValidationResult {
  let envelope: ReturnType<typeof parseCheckedEnvelope>;
  try {
    envelope = parseCheckedEnvelope(checkedClosureValue);
  } catch (error) {
    return failure(
      "invalid_checked_closure",
      `Checked meaning closure did not parse: ${safeErrorMessage(error)}`,
    );
  }
  const grounded = validateRiddleProofGroundedSemanticCertificateClosure({
    grounded_closure: envelope.grounded_closure,
    replay_contexts: replayContexts,
  });
  if (!grounded.ok) {
    return failure(
      "grounded_validation_failed",
      `Checked meaning grounding replay failed: ${grounded.error.message}`,
      grounded.error,
    );
  }
  const certificates = grounded.grounded_closure.closure.certificates;
  const bindings = validateBindingsForCertificates(certificates, envelope.rule_bindings, trust);
  if (!bindings.ok) return bindings;
  return {
    ok: true,
    checked_closure: {
      version: RIDDLE_PROOF_CHECKED_MEANING_CLOSURE_VERSION,
      grounded_closure: grounded.grounded_closure,
      rule_bindings: bindings.bindings,
    },
    root_certificate: grounded.root_certificate,
    root_assurance: grounded.root_certificate.derivation.kind === "composition"
      ? RIDDLE_PROOF_CHECKED_MEANING_ASSURANCE
      : "grounded_contract_leaf",
  };
}

export function validateRiddleProofCheckedMeaningClosure(
  input: ValidateRiddleProofCheckedMeaningClosureInput,
): RiddleProofCheckedMeaningClosureValidationResult {
  try {
    if (!isPlainRecord(input)) throw new Error("checked meaning validation input must be a plain object.");
    assertOnlyKeys(
      input,
      ["checked_closure", "replay_contexts", "rule_registry", "trusted_rules"],
      "checked meaning validation input",
    );
    const trust = parseRuleTrust(
      field(input, "rule_registry", "checked meaning validation input"),
      field(input, "trusted_rules", "checked meaning validation input"),
    );
    return validateWithParsedTrust(
      field(input, "checked_closure", "checked meaning validation input"),
      field(input, "replay_contexts", "checked meaning validation input") as
        ValidateRiddleProofCheckedMeaningClosureInput["replay_contexts"],
      trust,
    );
  } catch (error) {
    return failure(
      "invalid_input",
      `Checked meaning validation input failed: ${safeErrorMessage(error)}`,
    );
  }
}

export function replayRiddleProofCheckedMeaningClosure(
  input: ValidateRiddleProofCheckedMeaningClosureInput,
): RiddleProofCheckedMeaningClosureValidationResult {
  return validateRiddleProofCheckedMeaningClosure(input);
}

export function explainRiddleProofCheckedMeaningClosure(
  input: ValidateRiddleProofCheckedMeaningClosureInput,
): RiddleProofCheckedMeaningExplanationResult {
  const validation = validateRiddleProofCheckedMeaningClosure(input);
  if (!validation.ok) return validation;

  try {
    const clone = <Value>(value: Value): Value =>
      JSON.parse(stableJson(value)) as Value;
    const groundingByCertificateId = new Map(
      validation.checked_closure.grounded_closure.groundings.map((grounding) => [
        grounding.certificate_id,
        grounding,
      ]),
    );
    const bindingByCertificateId = new Map(
      validation.checked_closure.rule_bindings.map((binding) => [
        binding.certificate_id,
        binding,
      ]),
    );

    const nodes = validation.checked_closure.grounded_closure.closure.certificates.map(
      (certificate): RiddleProofCheckedMeaningExplanationNode => {
        if (certificate.derivation.kind === "contract") {
          return {
            certificate_id: certificate.certificate_id,
            kind: "grounded_leaf",
            assurance: "grounded_contract_leaf",
            scope: clone(certificate.scope),
            claim: clone(certificate.claim),
            issued_at: certificate.issued_at,
            premise_certificate_ids: [],
            evidence: clone(certificate.evidence),
            semantic_contract: {
              contract_id: certificate.derivation.contract.contract_id,
              contract_version: certificate.derivation.contract.contract_version,
              label: certificate.derivation.contract.label,
            },
          };
        }
        const checkedRule = bindingByCertificateId.get(certificate.certificate_id);
        if (!checkedRule) {
          // Replay above makes this unreachable; retain a fail-closed guard in
          // case the validated representation changes in a future version.
          throw new Error(
            `Validated composition ${certificate.certificate_id} has no checked rule binding.`,
          );
        }
        return {
          certificate_id: certificate.certificate_id,
          kind: "checked_composition",
          assurance: RIDDLE_PROOF_CHECKED_MEANING_ASSURANCE,
          scope: clone(certificate.scope),
          claim: clone(certificate.claim),
          issued_at: certificate.issued_at,
          premise_certificate_ids: certificate.derivation.premises.map(
            (premise) => premise.certificate_id,
          ),
          evidence: clone(certificate.evidence),
          checked_rule: clone(checkedRule),
        };
      },
    );

    const groundedFrontier = nodes
      .filter((node) => node.kind === "grounded_leaf")
      .map((node): RiddleProofCheckedMeaningExplanationFrontierEntry => {
        const grounding = groundingByCertificateId.get(node.certificate_id);
        if (!grounding) {
          throw new Error(
            `Validated grounded leaf ${node.certificate_id} has no grounding binding.`,
          );
        }
        return {
          certificate_id: node.certificate_id,
          bundle_id: grounding.receipt.bundle_id,
          receipt_id: grounding.receipt.receipt_id,
          statement_digest: grounding.receipt.statement_digest,
          artifact_manifest_digest: grounding.receipt.artifact_manifest_digest,
          observation_digest: grounding.receipt.observation_digest,
          captured_at: grounding.bundle.statement.captured_at,
          signer: clone(grounding.receipt.signer),
          verifier: clone(grounding.receipt.verifier),
          contract: clone(grounding.receipt.contract),
        };
      });
    const groundedLeafCount = groundedFrontier.length;

    return {
      ok: true,
      explanation: {
        version: RIDDLE_PROOF_CHECKED_MEANING_EXPLANATION_VERSION,
        root_certificate_id: validation.root_certificate.certificate_id,
        node_count: nodes.length,
        grounded_leaf_count: groundedLeafCount,
        checked_composition_count: nodes.length - groundedLeafCount,
        nodes,
        grounded_frontier: groundedFrontier,
      },
      checked_closure: validation.checked_closure,
      root_certificate: validation.root_certificate,
    };
  } catch (error) {
    return failure(
      "invalid_checked_closure",
      `Checked meaning explanation failed after replay: ${safeErrorMessage(error)}`,
    );
  }
}

/**
 * Replays a checked closure, then evaluates whether its signed grounded leaves
 * are fresh enough for an explicit consumption time. This is a deterministic
 * consumption policy, not a claim that an allowlisted rule is semantically
 * sound.
 */
export function assessRiddleProofCheckedMeaningClosure(
  input: AssessRiddleProofCheckedMeaningClosureInput,
): RiddleProofCheckedMeaningClosureAssessmentResult {
  let validationInput: ValidateRiddleProofCheckedMeaningClosureInput;
  let consumptionTime: string;
  let maxGroundedAgeMs: number;
  let maxFutureSkewMs: number;
  try {
    const context = "checked meaning assessment input";
    if (!isPlainRecord(input)) throw new Error(`${context} must be a plain object.`);
    assertOnlyKeys(
      input,
      [
        "checked_closure",
        "replay_contexts",
        "rule_registry",
        "trusted_rules",
        "consumption_time",
        "max_grounded_age_ms",
        "max_future_skew_ms",
      ],
      context,
    );
    consumptionTime = canonicalConsumptionTimestamp(
      field(input, "consumption_time", context),
      `${context}.consumption_time`,
    );
    maxGroundedAgeMs = consumptionWindowMilliseconds(
      field(input, "max_grounded_age_ms", context),
      `${context}.max_grounded_age_ms`,
    );
    maxFutureSkewMs = consumptionWindowMilliseconds(
      field(input, "max_future_skew_ms", context),
      `${context}.max_future_skew_ms`,
    );
    validationInput = {
      checked_closure: field(input, "checked_closure", context),
      replay_contexts: field(input, "replay_contexts", context) as
        ValidateRiddleProofCheckedMeaningClosureInput["replay_contexts"],
      rule_registry: field(input, "rule_registry", context) as
        ValidateRiddleProofCheckedMeaningClosureInput["rule_registry"],
      trusted_rules: field(input, "trusted_rules", context) as
        ValidateRiddleProofCheckedMeaningClosureInput["trusted_rules"],
    };
  } catch (error) {
    return {
      disposition: "unresolved",
      error: {
        code: "invalid_assessment_input",
        message: `Checked meaning assessment input failed: ${safeErrorMessage(error)}`,
      },
    };
  }

  const validation = validateRiddleProofCheckedMeaningClosure(validationInput);
  if (!validation.ok) {
    return {
      disposition: "unresolved",
      error: {
        code: "closure_unresolved",
        message: `Checked meaning closure could not be resolved at consumption: ${validation.error.message}`,
        cause: validation.error,
      },
    };
  }

  const consumptionMilliseconds = Date.parse(consumptionTime);
  const latestPermittedMilliseconds = consumptionMilliseconds + maxFutureSkewMs;
  const futureCaptureCertificateIds = validation.checked_closure.grounded_closure.groundings
    .filter((grounding) =>
      Date.parse(grounding.bundle.statement.captured_at) > latestPermittedMilliseconds)
    .map((grounding) => grounding.certificate_id)
    .sort();
  const rootFromFuture =
    Date.parse(validation.root_certificate.issued_at) > latestPermittedMilliseconds;
  if (futureCaptureCertificateIds.length > 0 || rootFromFuture) {
    return {
      disposition: "unresolved",
      error: {
        code: "future_timestamp",
        message: "Checked meaning consumption encountered a signed capture or root certificate beyond the permitted future clock skew.",
        ...(futureCaptureCertificateIds.length > 0
          ? { future_capture_certificate_ids: futureCaptureCertificateIds }
          : {}),
        ...(rootFromFuture
          ? { future_root_certificate_id: validation.root_certificate.certificate_id }
          : {}),
      },
    };
  }

  const staleCertificateIds = validation.checked_closure.grounded_closure.groundings
    .filter((grounding) =>
      consumptionMilliseconds - Date.parse(grounding.bundle.statement.captured_at)
      > maxGroundedAgeMs)
    .map((grounding) => grounding.certificate_id)
    .sort();
  const resolved: RiddleProofCheckedMeaningResolvedAssessment = {
    checked_closure: validation.checked_closure,
    root_certificate: validation.root_certificate,
    root_assurance: validation.root_assurance,
    consumption_time: consumptionTime,
    max_grounded_age_ms: maxGroundedAgeMs,
    max_future_skew_ms: maxFutureSkewMs,
  };
  if (staleCertificateIds.length > 0) {
    return {
      disposition: "stale",
      ...resolved,
      stale_certificate_ids: staleCertificateIds as [string, ...string[]],
    };
  }
  return {
    disposition: "checked",
    ...resolved,
    stale_certificate_ids: [],
  };
}

export function createRiddleProofCheckedMeaningAtomicClosure(
  input: CreateRiddleProofCheckedMeaningAtomicClosureInput,
): RiddleProofCheckedMeaningClosureValidationResult {
  try {
    if (!isPlainRecord(input)) throw new Error("checked meaning atomic input must be a plain object.");
    assertOnlyKeys(input, ["grounded_closure", "replay_contexts"], "checked meaning atomic input");
    const grounded = validateRiddleProofGroundedSemanticCertificateClosure({
      grounded_closure: field(input, "grounded_closure", "checked meaning atomic input"),
      replay_contexts: field(input, "replay_contexts", "checked meaning atomic input") as
        CreateRiddleProofCheckedMeaningAtomicClosureInput["replay_contexts"],
    });
    if (!grounded.ok) {
      return failure(
        "grounded_validation_failed",
        `Checked meaning atomic grounding replay failed: ${grounded.error.message}`,
        grounded.error,
      );
    }
    if (
      grounded.grounded_closure.closure.certificates.length !== 1
      || grounded.root_certificate.derivation.kind !== "contract"
    ) {
      return failure(
        "invalid_checked_closure",
        "A checked meaning atomic closure must contain exactly one grounded contract leaf.",
      );
    }
    return {
      ok: true,
      checked_closure: {
        version: RIDDLE_PROOF_CHECKED_MEANING_CLOSURE_VERSION,
        grounded_closure: grounded.grounded_closure,
        rule_bindings: [],
      },
      root_certificate: grounded.root_certificate,
      root_assurance: "grounded_contract_leaf",
    };
  } catch (error) {
    return failure(
      "invalid_input",
      `Checked meaning atomic input failed: ${safeErrorMessage(error)}`,
    );
  }
}

export function composeRiddleProofCheckedMeaningClosures(
  input: ComposeRiddleProofCheckedMeaningClosuresInput,
): RiddleProofCheckedMeaningClosureCompositionResult {
  try {
    const context = "checked meaning composition input";
    if (!isPlainRecord(input)) throw new Error(`${context} must be a plain object.`);
    assertOnlyKeys(
      input,
      [
        "expected_rule",
        "closures",
        "issued_at",
        "replay_contexts",
        "rule_registry",
        "trusted_rules",
      ],
      context,
    );
    const expectedRule = parseRuleRef(field(input, "expected_rule", context), `${context}.expected_rule`);
    const issuedAt = canonicalTimestamp(field(input, "issued_at", context), `${context}.issued_at`);
    const trust = parseRuleTrust(
      field(input, "rule_registry", context),
      field(input, "trusted_rules", context),
    );
    const resolved = resolveTrustedRegistration(expectedRule, trust);
    if (!resolved.ok) return resolved;
    const closureValues = denseArray(
      field(input, "closures", context),
      `${context}.closures`,
      RIDDLE_PROOF_CHECKED_MEANING_MAX_PREMISES,
    );
    if (closureValues.length === 0) throw new Error(`${context}.closures must not be empty.`);
    const replayContexts = field(input, "replay_contexts", context) as
      ComposeRiddleProofCheckedMeaningClosuresInput["replay_contexts"];

    const structuralClosures: Array<{
      grounded_closure: unknown;
      rule_bindings: RiddleProofCheckedMeaningRuleBinding[];
      root_certificate: RiddleProofSemanticCertificate;
    }> = [];
    for (let index = 0; index < closureValues.length; index += 1) {
      const structural = validateCheckedStructureWithParsedTrust(closureValues[index], trust);
      if (!structural.ok) {
        return failure(
          structural.error.code,
          `Checked meaning input closure ${index} failed: ${structural.error.message}`,
          structural.error,
        );
      }
      structuralClosures.push({
        grounded_closure: structural.envelope.grounded_closure,
        rule_bindings: structural.rule_bindings,
        root_certificate: structural.root_certificate,
      });
    }

    const materialized = materializeRule(
      resolved.registration,
      structuralClosures.map((closure) => closure.root_certificate),
      issuedAt,
    );
    if (!materialized.ok) return materialized;
    const groundedComposition = composeRiddleProofGroundedSemanticCertificateClosures({
      rule: materialized.rule,
      closures: structuralClosures.map((closure) => closure.grounded_closure) as
        [unknown, ...unknown[]],
      issued_at: issuedAt,
      replay_contexts: replayContexts,
    });
    if (!groundedComposition.ok) {
      return failure(
        "grounded_composition_failed",
        `Checked meaning grounded composition failed: ${groundedComposition.error.message}`,
        groundedComposition.error,
      );
    }

    const mergedBindings: RiddleProofCheckedMeaningRuleBinding[] = [];
    const bindingById = new Map<string, RiddleProofCheckedMeaningRuleBinding>();
    for (const closure of structuralClosures) {
      for (const binding of closure.rule_bindings) {
        const existing = bindingById.get(binding.certificate_id);
        if (existing) {
          if (stableJson(existing) !== stableJson(binding)) {
            return failure(
              "duplicate_rule_binding",
              `Shared checked meaning certificate ${binding.certificate_id} has unequal rule sidecars.`,
            );
          }
          continue;
        }
        bindingById.set(binding.certificate_id, binding);
        mergedBindings.push(binding);
      }
    }
    const newBinding: RiddleProofCheckedMeaningRuleBinding = {
      certificate_id: groundedComposition.certificate.certificate_id,
      assurance: RIDDLE_PROOF_CHECKED_MEANING_ASSURANCE,
      rule_ref: expectedRule,
      materialized_rule_digest: materialized.materialized_rule_digest,
    };
    if (bindingById.has(newBinding.certificate_id)) {
      return failure(
        "duplicate_rule_binding",
        `Checked meaning composition produced an already-bound certificate ID ${newBinding.certificate_id}.`,
      );
    }
    mergedBindings.push(newBinding);
    const candidate: RiddleProofCheckedMeaningClosure = {
      version: RIDDLE_PROOF_CHECKED_MEANING_CLOSURE_VERSION,
      grounded_closure: groundedComposition.grounded_closure,
      rule_bindings: mergedBindings,
    };
    const output = validateWithParsedTrust(candidate, replayContexts, trust);
    if (!output.ok) {
      return failure(
        output.error.code,
        `Checked meaning composed closure failed final replay: ${output.error.message}`,
        output.error,
      );
    }
    return {
      ok: true,
      certificate: output.root_certificate,
      checked_closure: output.checked_closure,
      assurance: RIDDLE_PROOF_CHECKED_MEANING_ASSURANCE,
    };
  } catch (error) {
    return failure(
      "invalid_input",
      `Checked meaning composition input failed: ${safeErrorMessage(error)}`,
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
    repository: nonemptyString(field(value, "repository", context), `${context}.repository`),
    revision: nonemptyString(field(value, "revision", context), `${context}.revision`),
    environment: nonemptyString(field(value, "environment", context), `${context}.environment`),
    target: nonemptyString(field(value, "target", context), `${context}.target`),
    proof_attempt: nonemptyString(field(value, "proof_attempt", context), `${context}.proof_attempt`),
  };
}

function parseClaimExpectation(
  value: unknown,
  context: string,
): RiddleProofSemanticClaimExpectation {
  if (!isPlainRecord(value)) throw new Error(`${context} must be a plain object.`);
  assertOnlyKeys(value, ["claim_id", "claim_version", "parameters", "label"], context);
  const parametersValue = optionalField(value, "parameters");
  if (parametersValue !== undefined && !isPlainRecord(parametersValue)) {
    throw new Error(`${context}.parameters must be a plain object.`);
  }
  const parameters = parametersValue === undefined
    ? undefined
    : cloneJson(parametersValue, `${context}.parameters`) as Record<string, JsonValue>;
  const labelValue = optionalField(value, "label");
  return {
    claim_id: nonemptyString(field(value, "claim_id", context), `${context}.claim_id`),
    claim_version: nonemptyString(field(value, "claim_version", context), `${context}.claim_version`),
    ...(parameters === undefined ? {} : { parameters }),
    ...(labelValue === undefined ? {} : { label: nonemptyString(labelValue, `${context}.label`) }),
  };
}

function sameScope(left: RiddleProofSemanticScope, right: RiddleProofSemanticScope): boolean {
  return stableJson(left) === stableJson(right);
}

function sameClaimExpectation(
  expected: RiddleProofSemanticClaimExpectation,
  observed: RiddleProofSemanticClaim,
): boolean {
  return expected.claim_id === observed.claim_id
    && expected.claim_version === observed.claim_version
    && stableJson(expected.parameters || {}) === stableJson(observed.parameters || {});
}

export function matchRiddleProofCheckedMeaningClosure(
  input: MatchRiddleProofCheckedMeaningClosureInput,
): RiddleProofCheckedMeaningClosureMatchResult {
  try {
    const context = "checked meaning match input";
    if (!isPlainRecord(input)) throw new Error(`${context} must be a plain object.`);
    assertOnlyKeys(
      input,
      [
        "checked_closure",
        "replay_contexts",
        "rule_registry",
        "trusted_rules",
        "expected_root_certificate_id",
        "expected_scope",
        "expected_claim",
        "expected_root_rule",
      ],
      context,
    );
    const expectedRootId = nonemptyString(
      field(input, "expected_root_certificate_id", context),
      `${context}.expected_root_certificate_id`,
    );
    if (!/^rpsc_[0-9a-f]{64}$/u.test(expectedRootId)) {
      throw new Error(`${context}.expected_root_certificate_id must be a full rpsc content ID.`);
    }
    const expectedScope = parseScope(field(input, "expected_scope", context), `${context}.expected_scope`);
    const expectedClaim = parseClaimExpectation(field(input, "expected_claim", context), `${context}.expected_claim`);
    const expectedRootRule = parseRuleRef(
      field(input, "expected_root_rule", context),
      `${context}.expected_root_rule`,
    );
    const trust = parseRuleTrust(
      field(input, "rule_registry", context),
      field(input, "trusted_rules", context),
    );
    const validation = validateWithParsedTrust(
      field(input, "checked_closure", context),
      field(input, "replay_contexts", context) as MatchRiddleProofCheckedMeaningClosureInput["replay_contexts"],
      trust,
    );
    if (!validation.ok) return validation;
    const root = validation.root_certificate;
    if (root.certificate_id !== expectedRootId) {
      return failure("root_mismatch", "Checked meaning root certificate ID differs from the trusted expected ID.");
    }
    if (!sameScope(expectedScope, root.scope)) {
      return failure("root_mismatch", "Checked meaning root scope differs from the trusted expected scope.");
    }
    if (!sameClaimExpectation(expectedClaim, root.claim)) {
      return failure("root_mismatch", "Checked meaning root claim differs from the trusted expected claim.");
    }
    if (root.derivation.kind !== "composition") {
      return failure("root_mismatch", "Checked meaning trusted root must be a checked composition certificate.");
    }
    const rootBinding = validation.checked_closure.rule_bindings.find(
      (binding) => binding.certificate_id === root.certificate_id,
    );
    if (!rootBinding || !sameRuleRef(rootBinding.rule_ref, expectedRootRule)) {
      return failure("root_mismatch", "Checked meaning root rule differs from the independently trusted rule reference.");
    }
    return {
      ok: true,
      checked_closure: validation.checked_closure,
      root_certificate: root,
      assurance: RIDDLE_PROOF_CHECKED_MEANING_ASSURANCE,
    };
  } catch (error) {
    return failure(
      "invalid_input",
      `Checked meaning match input failed: ${safeErrorMessage(error)}`,
    );
  }
}
