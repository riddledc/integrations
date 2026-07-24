import {
  APPLICATION_PROOF_ENVELOPE_VERSION,
  APPLICATION_VERIFICATION_VERSION,
  type ApplicationAuthority,
  type ApplicationAuthorityRef,
  type ApplicationChallenge,
  type ApplicationClaimRef,
  type ApplicationProofEnvelope,
  type ApplicationSpecificationRef,
  type ApplicationSubjectRef,
  type ApplicationVerification,
  type JsonValue,
} from "./types.js";

const SHA256 = /^sha256:[0-9a-f]{64}$/u;

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function assertExactKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  context: string,
): asserts value is Record<string, unknown> {
  if (!isPlainRecord(value)) throw new TypeError(`${context} must be a plain object.`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      throw new TypeError(`${context} contains an unsupported symbol field.`);
    }
    if (!allowed.has(key)) throw new TypeError(`${context} contains unsupported field ${key}.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor
      || descriptor.enumerable !== true
      || !Object.hasOwn(descriptor, "value")
      || descriptor.get !== undefined
      || descriptor.set !== undefined
    ) {
      throw new TypeError(`${context}.${key} must be an enumerable data field.`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new TypeError(`${context} is missing ${key}.`);
  }
}

function assertDenseArray(value: unknown, context: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${context} must be an array.`);
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/u.test(key)) {
      throw new TypeError(`${context} contains an unsupported array field.`);
    }
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index >= value.length) {
      throw new TypeError(`${context} contains an invalid array index.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor
      || descriptor.enumerable !== true
      || !Object.hasOwn(descriptor, "value")
      || descriptor.get !== undefined
      || descriptor.set !== undefined
    ) {
      throw new TypeError(`${context}[${key}] must be an enumerable data field.`);
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw new TypeError(`${context} must not be sparse.`);
  }
}

export function assertNonemptyString(value: unknown, context: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${context} must be a nonempty string.`);
  }
}

export function assertDigest(value: unknown, context: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new TypeError(`${context} must be a full lowercase sha256 digest.`);
  }
}

export function assertTimestamp(value: unknown, context: string): asserts value is string {
  assertNonemptyString(value, context);
  if (!Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${context} must be an ISO-compatible timestamp.`);
  }
}

function assertNonnegativeInteger(value: unknown, context: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${context} must be a nonnegative safe integer.`);
  }
}

function assertJsonValue(value: unknown, context: string): asserts value is JsonValue {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${context} contains a non-finite number.`);
    return;
  }
  if (Array.isArray(value)) {
    assertDenseArray(value, context);
    value.forEach((entry, index) => assertJsonValue(entry, `${context}[${index}]`));
    return;
  }
  if (!isPlainRecord(value)) throw new TypeError(`${context} must contain only JSON values.`);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      throw new TypeError(`${context} contains an unsupported symbol field.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor
      || descriptor.enumerable !== true
      || !Object.hasOwn(descriptor, "value")
      || descriptor.get !== undefined
      || descriptor.set !== undefined
    ) {
      throw new TypeError(`${context}.${key} must be an enumerable data field.`);
    }
    assertJsonValue(descriptor.value, `${context}.${key}`);
  }
}

export function assertSpecificationRef(
  value: unknown,
  context: string,
): asserts value is ApplicationSpecificationRef {
  assertExactKeys(value, ["id", "version", "digest"], [], context);
  assertNonemptyString(value.id, `${context}.id`);
  assertNonemptyString(value.version, `${context}.version`);
  assertDigest(value.digest, `${context}.digest`);
}

export function assertSubjectRef(
  value: unknown,
  context: string,
): asserts value is ApplicationSubjectRef {
  assertExactKeys(value, ["id", "digest"], ["kind"], context);
  assertNonemptyString(value.id, `${context}.id`);
  assertDigest(value.digest, `${context}.digest`);
  if (Object.hasOwn(value, "kind")) assertNonemptyString(value.kind, `${context}.kind`);
}

export function assertClaimRef(
  value: unknown,
  context: string,
): asserts value is ApplicationClaimRef {
  assertExactKeys(value, ["claim_id", "claim_version"], ["parameters"], context);
  assertNonemptyString(value.claim_id, `${context}.claim_id`);
  assertNonemptyString(value.claim_version, `${context}.claim_version`);
  if (Object.hasOwn(value, "parameters")) {
    if (!isPlainRecord(value.parameters)) {
      throw new TypeError(`${context}.parameters must be a plain JSON object.`);
    }
    assertJsonValue(value.parameters, `${context}.parameters`);
  }
}

function assertUniqueStrings(
  value: unknown,
  context: string,
  options: { nonempty?: boolean } = {},
): asserts value is string[] {
  assertDenseArray(value, context);
  if (options.nonempty && value.length === 0) {
    throw new TypeError(`${context} must contain at least one entry.`);
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    assertNonemptyString(entry, `${context}[${index}]`);
    if (seen.has(entry)) throw new TypeError(`${context} contains duplicate entry ${entry}.`);
    seen.add(entry);
  });
}

export function assertApplicationAuthority(
  value: unknown,
): asserts value is ApplicationAuthority {
  assertExactKeys(
    value,
    ["authority_id", "authority_version", "authority_digest", "specification"],
    [],
    "authority",
  );
  assertNonemptyString(value.authority_id, "authority.authority_id");
  assertNonemptyString(value.authority_version, "authority.authority_version");
  assertDigest(value.authority_digest, "authority.authority_digest");
  assertExactKeys(
    value.specification,
    ["ref", "expected_root", "requirements"],
    ["non_conclusions"],
    "authority.specification",
  );
  assertSpecificationRef(value.specification.ref, "authority.specification.ref");
  assertClaimRef(value.specification.expected_root, "authority.specification.expected_root");
  assertDenseArray(
    value.specification.requirements,
    "authority.specification.requirements",
  );
  if (value.specification.requirements.length === 0) {
    throw new TypeError("authority.specification.requirements must be a nonempty array.");
  }
  const requirementIds = new Set<string>();
  value.specification.requirements.forEach((requirement, index) => {
    const context = `authority.specification.requirements[${index}]`;
    assertExactKeys(
      requirement,
      ["requirement_id", "label", "failure_summary"],
      ["repair_guidance"],
      context,
    );
    assertNonemptyString(requirement.requirement_id, `${context}.requirement_id`);
    assertNonemptyString(requirement.label, `${context}.label`);
    assertNonemptyString(requirement.failure_summary, `${context}.failure_summary`);
    if (Object.hasOwn(requirement, "repair_guidance")) {
      assertNonemptyString(requirement.repair_guidance, `${context}.repair_guidance`);
    }
    if (requirementIds.has(requirement.requirement_id)) {
      throw new TypeError(
        `authority.specification.requirements contains duplicate requirement ${requirement.requirement_id}.`,
      );
    }
    requirementIds.add(requirement.requirement_id);
  });
  if (Object.hasOwn(value.specification, "non_conclusions")) {
    assertUniqueStrings(
      value.specification.non_conclusions,
      "authority.specification.non_conclusions",
    );
  }
}

export function assertApplicationAuthorityRef(
  value: unknown,
  context = "authority reference",
): asserts value is ApplicationAuthorityRef {
  assertExactKeys(
    value,
    ["authority_id", "authority_version", "authority_digest"],
    [],
    context,
  );
  assertNonemptyString(value.authority_id, `${context}.authority_id`);
  assertNonemptyString(value.authority_version, `${context}.authority_version`);
  assertDigest(value.authority_digest, `${context}.authority_digest`);
}

function assertCurrentness(value: unknown, context: string): void {
  if (!isPlainRecord(value)) throw new TypeError(`${context} must be a plain object.`);
  if (value.status === "current") {
    assertExactKeys(value, ["status", "consumption_time"], [], context);
    assertTimestamp(value.consumption_time, `${context}.consumption_time`);
    return;
  }
  if (value.status === "stale") {
    assertExactKeys(
      value,
      ["status", "consumption_time", "stale_certificate_ids"],
      [],
      context,
    );
    assertTimestamp(value.consumption_time, `${context}.consumption_time`);
    assertUniqueStrings(value.stale_certificate_ids, `${context}.stale_certificate_ids`, {
      nonempty: true,
    });
    return;
  }
  if (value.status === "unresolved") {
    assertExactKeys(value, ["status", "diagnostic_code"], [], context);
    assertNonemptyString(value.diagnostic_code, `${context}.diagnostic_code`);
    return;
  }
  throw new TypeError(`${context}.status is unsupported.`);
}

function assertExplanation(value: unknown, context: string): void {
  assertExactKeys(
    value,
    [
      "root_certificate_id",
      "node_count",
      "grounded_leaf_count",
      "checked_composition_count",
      "node_certificate_ids",
      "grounded_frontier",
    ],
    [],
    context,
  );
  assertNonemptyString(value.root_certificate_id, `${context}.root_certificate_id`);
  assertNonnegativeInteger(value.node_count, `${context}.node_count`);
  assertNonnegativeInteger(value.grounded_leaf_count, `${context}.grounded_leaf_count`);
  assertNonnegativeInteger(
    value.checked_composition_count,
    `${context}.checked_composition_count`,
  );
  assertUniqueStrings(value.node_certificate_ids, `${context}.node_certificate_ids`, {
    nonempty: true,
  });
  if (value.node_count !== value.node_certificate_ids.length) {
    throw new TypeError(`${context}.node_count must equal node_certificate_ids.length.`);
  }
  if (
    (value.grounded_leaf_count as number) + (value.checked_composition_count as number)
    !== value.node_count
  ) {
    throw new TypeError(`${context} node-kind counts must add up to node_count.`);
  }
  if (!value.node_certificate_ids.includes(value.root_certificate_id)) {
    throw new TypeError(`${context}.node_certificate_ids must include the root certificate.`);
  }
  assertDenseArray(value.grounded_frontier, `${context}.grounded_frontier`);
  if (value.grounded_frontier.length === 0) {
    throw new TypeError(`${context}.grounded_frontier must be a nonempty array.`);
  }
  value.grounded_frontier.forEach((entry, index) => {
    const entryContext = `${context}.grounded_frontier[${index}]`;
    assertExactKeys(
      entry,
      [
        "certificate_id",
        "bundle_id",
        "receipt_id",
        "statement_digest",
        "artifact_manifest_digest",
        "observation_digest",
        "captured_at",
      ],
      [],
      entryContext,
    );
    assertNonemptyString(entry.certificate_id, `${entryContext}.certificate_id`);
    assertNonemptyString(entry.bundle_id, `${entryContext}.bundle_id`);
    assertNonemptyString(entry.receipt_id, `${entryContext}.receipt_id`);
    assertDigest(entry.statement_digest, `${entryContext}.statement_digest`);
    assertDigest(entry.artifact_manifest_digest, `${entryContext}.artifact_manifest_digest`);
    assertDigest(entry.observation_digest, `${entryContext}.observation_digest`);
    assertTimestamp(entry.captured_at, `${entryContext}.captured_at`);
  });
}

export function assertApplicationVerification(
  value: unknown,
): asserts value is ApplicationVerification {
  if (!isPlainRecord(value)) throw new TypeError("verification must be a plain object.");
  if (value.status === "rejected" || value.status === "unresolved") {
    assertExactKeys(
      value,
      [
        "version",
        "verification_kind",
        "status",
        "proof_id",
        "authority",
        "diagnostic_code",
      ],
      [],
      "verification",
    );
    if (value.version !== APPLICATION_VERIFICATION_VERSION) {
      throw new TypeError("verification.version is unsupported.");
    }
    if (value.verification_kind !== "checked_meaning_replay") {
      throw new TypeError("verification.verification_kind is unsupported.");
    }
    assertNonemptyString(value.proof_id, "verification.proof_id");
    assertApplicationAuthorityRef(value.authority, "verification.authority");
    assertNonemptyString(value.diagnostic_code, "verification.diagnostic_code");
    return;
  }
  if (value.status !== "verified") throw new TypeError("verification.status is unsupported.");
  assertExactKeys(
    value,
    [
      "version",
      "verification_kind",
      "status",
      "proof_id",
      "authority",
      "spec",
      "subject",
      "replayed_at",
      "proof_root",
      "currentness",
      "requirements",
      "explanation",
    ],
    [],
    "verification",
  );
  if (value.version !== APPLICATION_VERIFICATION_VERSION) {
    throw new TypeError("verification.version is unsupported.");
  }
  if (value.verification_kind !== "checked_meaning_replay") {
    throw new TypeError("verification.verification_kind is unsupported.");
  }
  assertNonemptyString(value.proof_id, "verification.proof_id");
  assertApplicationAuthorityRef(value.authority, "verification.authority");
  assertSpecificationRef(value.spec, "verification.spec");
  assertSubjectRef(value.subject, "verification.subject");
  assertTimestamp(value.replayed_at, "verification.replayed_at");
  assertExactKeys(
    value.proof_root,
    ["root_certificate_id", "claim", "expected_root_established"],
    [],
    "verification.proof_root",
  );
  assertNonemptyString(
    value.proof_root.root_certificate_id,
    "verification.proof_root.root_certificate_id",
  );
  assertClaimRef(value.proof_root.claim, "verification.proof_root.claim");
  if (typeof value.proof_root.expected_root_established !== "boolean") {
    throw new TypeError(
      "verification.proof_root.expected_root_established must be boolean.",
    );
  }
  assertCurrentness(value.currentness, "verification.currentness");
  assertDenseArray(value.requirements, "verification.requirements");
  value.requirements.forEach((requirement, index) => {
    const context = `verification.requirements[${index}]`;
    assertExactKeys(
      requirement,
      ["requirement_id", "status", "evidence_ids"],
      ["diagnostic_code"],
      context,
    );
    assertNonemptyString(requirement.requirement_id, `${context}.requirement_id`);
    if (
      requirement.status !== "satisfied"
      && requirement.status !== "failed"
      && requirement.status !== "unresolved"
    ) {
      throw new TypeError(`${context}.status is unsupported.`);
    }
    assertUniqueStrings(requirement.evidence_ids, `${context}.evidence_ids`, {
      nonempty: requirement.status !== "unresolved",
    });
    if (Object.hasOwn(requirement, "diagnostic_code")) {
      assertNonemptyString(requirement.diagnostic_code, `${context}.diagnostic_code`);
    }
    if (requirement.status === "unresolved" && !requirement.diagnostic_code) {
      throw new TypeError(`${context}.diagnostic_code is required when unresolved.`);
    }
  });
  assertExplanation(value.explanation, "verification.explanation");
}

export function assertChallenge(value: unknown): asserts value is ApplicationChallenge {
  assertExactKeys(
    value,
    ["challenge_id", "nonce", "issued_at"],
    ["expires_at"],
    "challenge",
  );
  assertNonemptyString(value.challenge_id, "challenge.challenge_id");
  assertNonemptyString(value.nonce, "challenge.nonce");
  assertTimestamp(value.issued_at, "challenge.issued_at");
  if (Object.hasOwn(value, "expires_at")) {
    assertTimestamp(value.expires_at, "challenge.expires_at");
    if (Date.parse(value.expires_at) <= Date.parse(value.issued_at)) {
      throw new TypeError("challenge.expires_at must be later than issued_at.");
    }
  }
}

export function assertProofEnvelope<ProofPayload>(
  value: unknown,
): asserts value is ApplicationProofEnvelope<ProofPayload> {
  assertExactKeys(
    value,
    [
      "version",
      "proof_id",
      "authority",
      "spec",
      "subject",
      "challenge_id",
      "produced_at",
      "payload",
    ],
    [],
    "proof envelope",
  );
  if (value.version !== APPLICATION_PROOF_ENVELOPE_VERSION) {
    throw new TypeError("proof envelope.version is unsupported.");
  }
  assertNonemptyString(value.proof_id, "proof envelope.proof_id");
  assertApplicationAuthorityRef(value.authority, "proof envelope.authority");
  assertSpecificationRef(value.spec, "proof envelope.spec");
  assertSubjectRef(value.subject, "proof envelope.subject");
  assertNonemptyString(value.challenge_id, "proof envelope.challenge_id");
  assertTimestamp(value.produced_at, "proof envelope.produced_at");
  if (!Object.hasOwn(value, "payload")) {
    throw new TypeError("proof envelope.payload is required.");
  }
}

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortJson);
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortJson(value[key] as JsonValue)]),
    );
  }
  return value;
}

export function sameJson(left: JsonValue, right: JsonValue): boolean {
  return JSON.stringify(sortJson(left)) === JSON.stringify(sortJson(right));
}

export function sameSpecificationRef(
  left: ApplicationSpecificationRef,
  right: ApplicationSpecificationRef,
): boolean {
  return left.id === right.id && left.version === right.version && left.digest === right.digest;
}

export function sameApplicationAuthorityRef(
  left: ApplicationAuthorityRef,
  right: ApplicationAuthorityRef,
): boolean {
  return (
    left.authority_id === right.authority_id
    && left.authority_version === right.authority_version
    && left.authority_digest === right.authority_digest
  );
}

export function sameSubjectRef(
  left: ApplicationSubjectRef,
  right: ApplicationSubjectRef,
): boolean {
  return (
    left.id === right.id
    && left.digest === right.digest
    && (left.kind ?? null) === (right.kind ?? null)
  );
}

export function sameClaimRef(left: ApplicationClaimRef, right: ApplicationClaimRef): boolean {
  return (
    left.claim_id === right.claim_id
    && left.claim_version === right.claim_version
    && sameJson((left.parameters ?? {}) as JsonValue, (right.parameters ?? {}) as JsonValue)
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    if (ArrayBuffer.isView(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

export function clonePinnedAuthority(authority: ApplicationAuthority): ApplicationAuthority {
  assertApplicationAuthority(authority);
  return deepFreeze(JSON.parse(JSON.stringify(authority)) as ApplicationAuthority);
}

export function cloneStructuredFrozen<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

export function applicationAuthorityRef(
  authority: ApplicationAuthority,
): ApplicationAuthorityRef {
  assertApplicationAuthority(authority);
  return cloneStructuredFrozen({
    authority_id: authority.authority_id,
    authority_version: authority.authority_version,
    authority_digest: authority.authority_digest,
  });
}
