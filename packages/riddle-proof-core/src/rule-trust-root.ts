import { createHash } from "node:crypto";

import {
  createRiddleProofCheckedMeaningRule,
  RIDDLE_PROOF_CHECKED_MEANING_MAX_RULES,
  RIDDLE_PROOF_CHECKED_MEANING_RULE_ENGINE,
  type RiddleProofCheckedMeaningRuleRef,
  type RiddleProofCheckedMeaningRuleRegistration,
} from "./checked-meaning";

export const RIDDLE_PROOF_RULE_TRUST_ROOT_VERSION =
  "riddle-proof.rule-trust-root.v1" as const;

export const RIDDLE_PROOF_RULE_TRUST_ROOT_DIGEST_DOMAIN =
  "riddle-proof.rule-trust-root.v1\0" as const;

export interface RiddleProofRuleTrustRootBundle {
  version: typeof RIDDLE_PROOF_RULE_TRUST_ROOT_VERSION;
  trust_root_id: string;
  trust_root_version: string;
  rules: [
    RiddleProofCheckedMeaningRuleRegistration,
    ...RiddleProofCheckedMeaningRuleRegistration[],
  ];
}

/**
 * A reference pinned independently from a run. The complete bundle is useful
 * input to resolution, but it does not get to declare its own trust.
 */
export interface RiddleProofRuleTrustRootRef {
  trust_root_id: string;
  trust_root_version: string;
  bundle_digest: string;
}

export interface CreateRiddleProofRuleTrustRootInput {
  trust_root_id: string;
  trust_root_version: string;
  rule_definitions: [unknown, ...unknown[]];
}

export interface ResolveRiddleProofRuleTrustRootInput {
  bundle: unknown;
  expected_trust_root: unknown;
}

export type RiddleProofRuleTrustRootErrorCode =
  | "invalid_input"
  | "invalid_rule_definition"
  | "duplicate_rule"
  | "invalid_bundle"
  | "trust_root_mismatch";

export interface RiddleProofRuleTrustRootError {
  code: RiddleProofRuleTrustRootErrorCode;
  message: string;
}

export type RiddleProofRuleTrustRootCreationResult =
  | {
      ok: true;
      bundle: RiddleProofRuleTrustRootBundle;
      trust_root: RiddleProofRuleTrustRootRef;
    }
  | { ok: false; error: RiddleProofRuleTrustRootError };

export type RiddleProofRuleTrustRootResolutionResult =
  | {
      ok: true;
      bundle: RiddleProofRuleTrustRootBundle;
      trust_root: RiddleProofRuleTrustRootRef;
      rule_registry: [
        RiddleProofCheckedMeaningRuleRegistration,
        ...RiddleProofCheckedMeaningRuleRegistration[],
      ];
      trusted_rules: [RiddleProofCheckedMeaningRuleRef, ...RiddleProofCheckedMeaningRuleRef[]];
    }
  | { ok: false; error: RiddleProofRuleTrustRootError };

function failure(
  code: RiddleProofRuleTrustRootErrorCode,
  message: string,
): { ok: false; error: RiddleProofRuleTrustRootError } {
  return { ok: false, error: { code, message } };
}

function safeErrorMessage(error: unknown): string {
  try {
    if (error instanceof Error) return String(error.message);
  } catch {
    // Fall through without inspecting hostile input further.
  }
  return "unreadable validation error";
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

function canonicalString(value: unknown, context: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error(`${context} must be a non-empty canonical string.`);
  }
  if (value.length > 512) throw new Error(`${context} exceeds 512 characters.`);
  return value;
}

function trustRootCode(value: unknown, context: string): string {
  const text = canonicalString(value, context);
  if (text.length > 256 || !/^[A-Za-z0-9][A-Za-z0-9._:@/+~-]*$/u.test(text)) {
    throw new Error(`${context} must be a canonical protocol code.`);
  }
  return text;
}

function digest(value: unknown, context: string): string {
  const text = canonicalString(value, context);
  if (!/^sha256:[0-9a-f]{64}$/u.test(text)) {
    throw new Error(`${context} must be a full lowercase sha256 digest.`);
  }
  return text;
}

function denseArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(`${context} must be a plain array.`);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !Number.isSafeInteger(lengthDescriptor.value)) {
    throw new Error(`${context}.length must be a data field.`);
  }
  const length = lengthDescriptor.value as number;
  if (length === 0) throw new Error(`${context} requires at least one entry.`);
  if (length > RIDDLE_PROOF_CHECKED_MEANING_MAX_RULES) {
    throw new Error(`${context} exceeds ${RIDDLE_PROOF_CHECKED_MEANING_MAX_RULES} entries.`);
  }
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

function compareRegistrations(
  left: RiddleProofCheckedMeaningRuleRegistration,
  right: RiddleProofCheckedMeaningRuleRegistration,
): number {
  if (left.rule_id < right.rule_id) return -1;
  if (left.rule_id > right.rule_id) return 1;
  if (left.rule_version < right.rule_version) return -1;
  if (left.rule_version > right.rule_version) return 1;
  return 0;
}

function canonicalizeRegistrations(
  registrations: RiddleProofCheckedMeaningRuleRegistration[],
): [RiddleProofCheckedMeaningRuleRegistration, ...RiddleProofCheckedMeaningRuleRegistration[]] {
  registrations.sort(compareRegistrations);
  for (let index = 1; index < registrations.length; index += 1) {
    if (compareRegistrations(registrations[index - 1], registrations[index]) === 0) {
      throw new Error(
        `duplicate checked-meaning rule ${registrations[index].rule_id}@${registrations[index].rule_version}`,
      );
    }
  }
  return registrations as [
    RiddleProofCheckedMeaningRuleRegistration,
    ...RiddleProofCheckedMeaningRuleRegistration[],
  ];
}

function createRegistration(
  definition: unknown,
  context: string,
): RiddleProofCheckedMeaningRuleRegistration {
  const created = createRiddleProofCheckedMeaningRule({ definition });
  if (!created.ok) throw new Error(`${context}: ${created.error.message}`);
  return created.registration;
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
  const ruleId = canonicalString(field(value, "rule_id", context), `${context}.rule_id`);
  const ruleVersion = canonicalString(
    field(value, "rule_version", context),
    `${context}.rule_version`,
  );
  if (field(value, "engine", context) !== RIDDLE_PROOF_CHECKED_MEANING_RULE_ENGINE) {
    throw new Error(`${context}.engine is unsupported.`);
  }
  const implementationDigest = digest(
    field(value, "implementation_digest", context),
    `${context}.implementation_digest`,
  );
  const registration = createRegistration(field(value, "definition", context), `${context}.definition`);
  if (
    registration.rule_id !== ruleId
    || registration.rule_version !== ruleVersion
    || registration.implementation_digest !== implementationDigest
  ) {
    throw new Error(`${context} does not match its complete checked-meaning definition.`);
  }
  return registration;
}

function bundleDigest(bundle: RiddleProofRuleTrustRootBundle): string {
  return `sha256:${createHash("sha256")
    .update(RIDDLE_PROOF_RULE_TRUST_ROOT_DIGEST_DOMAIN)
    .update(stableJson(bundle))
    .digest("hex")}`;
}

function parseTrustRootRef(value: unknown): RiddleProofRuleTrustRootRef {
  if (!isPlainRecord(value)) throw new Error("expected trust root must be a plain object.");
  assertOnlyKeys(
    value,
    ["trust_root_id", "trust_root_version", "bundle_digest"],
    "expected trust root",
  );
  return {
    trust_root_id: trustRootCode(field(value, "trust_root_id", "expected trust root"), "expected trust root.trust_root_id"),
    trust_root_version: trustRootCode(
      field(value, "trust_root_version", "expected trust root"),
      "expected trust root.trust_root_version",
    ),
    bundle_digest: digest(
      field(value, "bundle_digest", "expected trust root"),
      "expected trust root.bundle_digest",
    ),
  };
}

function parseBundle(value: unknown): RiddleProofRuleTrustRootBundle {
  if (!isPlainRecord(value)) throw new Error("rule trust root bundle must be a plain object.");
  assertOnlyKeys(value, ["version", "trust_root_id", "trust_root_version", "rules"], "rule trust root bundle");
  if (field(value, "version", "rule trust root bundle") !== RIDDLE_PROOF_RULE_TRUST_ROOT_VERSION) {
    throw new Error("rule trust root bundle.version is unsupported.");
  }
  const registrations = denseArray(
    field(value, "rules", "rule trust root bundle"),
    "rule trust root bundle.rules",
  ).map((entry, index) => parseRegistration(entry, `rule trust root bundle.rules[${index}]`));
  return {
    version: RIDDLE_PROOF_RULE_TRUST_ROOT_VERSION,
    trust_root_id: trustRootCode(
      field(value, "trust_root_id", "rule trust root bundle"),
      "rule trust root bundle.trust_root_id",
    ),
    trust_root_version: trustRootCode(
      field(value, "trust_root_version", "rule trust root bundle"),
      "rule trust root bundle.trust_root_version",
    ),
    rules: canonicalizeRegistrations(registrations),
  };
}

export function createRiddleProofRuleTrustRoot(
  input: CreateRiddleProofRuleTrustRootInput,
): RiddleProofRuleTrustRootCreationResult {
  try {
    if (!isPlainRecord(input)) throw new Error("rule trust root input must be a plain object.");
    assertOnlyKeys(
      input,
      ["trust_root_id", "trust_root_version", "rule_definitions"],
      "rule trust root input",
    );
    const definitions = denseArray(
      field(input, "rule_definitions", "rule trust root input"),
      "rule trust root input.rule_definitions",
    );
    const registrations: RiddleProofCheckedMeaningRuleRegistration[] = [];
    for (let index = 0; index < definitions.length; index += 1) {
      registrations.push(createRegistration(definitions[index], `rule definition[${index}]`));
    }
    const bundle: RiddleProofRuleTrustRootBundle = {
      version: RIDDLE_PROOF_RULE_TRUST_ROOT_VERSION,
      trust_root_id: trustRootCode(
        field(input, "trust_root_id", "rule trust root input"),
        "rule trust root input.trust_root_id",
      ),
      trust_root_version: trustRootCode(
        field(input, "trust_root_version", "rule trust root input"),
        "rule trust root input.trust_root_version",
      ),
      rules: canonicalizeRegistrations(registrations),
    };
    return {
      ok: true,
      bundle,
      trust_root: {
        trust_root_id: bundle.trust_root_id,
        trust_root_version: bundle.trust_root_version,
        bundle_digest: bundleDigest(bundle),
      },
    };
  } catch (error) {
    const message = safeErrorMessage(error);
    if (message.startsWith("duplicate checked-meaning rule ")) {
      return failure("duplicate_rule", `Rule trust root creation failed: ${message}`);
    }
    if (message.startsWith("rule definition[")) {
      return failure("invalid_rule_definition", `Rule trust root creation failed: ${message}`);
    }
    return failure("invalid_input", `Rule trust root creation failed: ${message}`);
  }
}

export function resolveRiddleProofRuleTrustRoot(
  input: ResolveRiddleProofRuleTrustRootInput,
): RiddleProofRuleTrustRootResolutionResult {
  try {
    if (!isPlainRecord(input)) throw new Error("rule trust root resolution input must be a plain object.");
    assertOnlyKeys(
      input,
      ["bundle", "expected_trust_root"],
      "rule trust root resolution input",
    );
    const expected = parseTrustRootRef(
      field(input, "expected_trust_root", "rule trust root resolution input"),
    );
    const bundle = parseBundle(field(input, "bundle", "rule trust root resolution input"));
    const actual: RiddleProofRuleTrustRootRef = {
      trust_root_id: bundle.trust_root_id,
      trust_root_version: bundle.trust_root_version,
      bundle_digest: bundleDigest(bundle),
    };
    if (
      actual.trust_root_id !== expected.trust_root_id
      || actual.trust_root_version !== expected.trust_root_version
      || actual.bundle_digest !== expected.bundle_digest
    ) {
      return failure(
        "trust_root_mismatch",
        "Rule trust root resolution failed: bundle id, version, or digest does not match the independently pinned trust root.",
      );
    }
    const trustedRules = bundle.rules.map(({ definition: _definition, ...ruleRef }) => ruleRef) as [
      RiddleProofCheckedMeaningRuleRef,
      ...RiddleProofCheckedMeaningRuleRef[],
    ];
    return {
      ok: true,
      bundle,
      trust_root: expected,
      rule_registry: bundle.rules,
      trusted_rules: trustedRules,
    };
  } catch (error) {
    return failure(
      "invalid_bundle",
      `Rule trust root resolution failed: ${safeErrorMessage(error)}`,
    );
  }
}
