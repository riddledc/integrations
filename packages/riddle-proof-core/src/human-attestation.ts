import { createHash, createPublicKey } from "node:crypto";

import {
  createRiddleProofGroundedDeclarativeJsonVerifier,
  createRiddleProofSignedCaptureBundle,
  verifyRiddleProofSignedCaptureBundle,
} from "./grounded-evidence";
import type {
  RiddleProofGroundedCaptureArtifactInput,
  RiddleProofGroundedCollectorRef,
  RiddleProofGroundedDeclarativeJsonVerifierDefinition,
  RiddleProofGroundedDeclarativeJsonVerifierRegistration,
  RiddleProofGroundedSensorRef,
  RiddleProofGroundedSigningKey,
  RiddleProofGroundedVerifierRef,
  RiddleProofSignedCaptureBundle,
} from "./grounded-evidence";
import type { RiddleProofSemanticScope } from "./semantic-certificate";
import {
  assertProtocolKeys,
  assertProtocolRecord,
  canonicalProtocolJson,
  protocolArray,
  protocolCode,
  protocolDigest,
  protocolErrorMessage,
  protocolField,
  protocolInteger,
  protocolSha256,
  protocolString,
  protocolTimestamp,
} from "./protocol-internal";

export const RIDDLE_PROOF_HUMAN_ATTESTATION_VERSION =
  "riddle-proof.human-attestation.v1" as const;

export const RIDDLE_PROOF_HUMAN_ATTESTATION_ARTIFACT_ROLE =
  "human_attestation" as const;

export type RiddleProofHumanAttestationKind =
  | "submitted_for_legal_review"
  | "legal_approved";

/**
 * Content-free body authenticated by the existing grounded-capture signature.
 * Actor identity is deliberately absent: it is derived from an independent key
 * registry during replay rather than accepted as a signer assertion.
 */
export interface RiddleProofHumanAttestationBody {
  version: typeof RIDDLE_PROOF_HUMAN_ATTESTATION_VERSION;
  kind: RiddleProofHumanAttestationKind;
  snapshot_id: string;
  manifest_digest: string;
  packet_receipt_id: string;
  packet_digest: string;
  packet_complete_certificate_id: string;
  issued_at: string;
  nonce: string;
}

export type RiddleProofHumanActorType = "human" | "agent";

/** Independently administered identity and authorization data. */
export interface RiddleProofHumanActorRegistration {
  actor_id: string;
  actor_type: RiddleProofHumanActorType;
  key_id: string;
  public_key_spki_base64: string;
  public_key_spki_sha256: string;
  allowed_kinds: [RiddleProofHumanAttestationKind, ...RiddleProofHumanAttestationKind[]];
}

export interface RiddleProofHumanAttestationGroundingRecipe {
  body: RiddleProofHumanAttestationBody;
  body_json: string;
  scope: RiddleProofSemanticScope;
  collector: RiddleProofGroundedCollectorRef;
  sensor: RiddleProofGroundedSensorRef;
  artifact: RiddleProofGroundedCaptureArtifactInput;
  verifier_definition: RiddleProofGroundedDeclarativeJsonVerifierDefinition;
  verifier_ref: RiddleProofGroundedVerifierRef;
  verifier_registration: RiddleProofGroundedDeclarativeJsonVerifierRegistration;
}

export interface CreateRiddleProofHumanAttestationInput {
  body: RiddleProofHumanAttestationBody;
  signing_key: RiddleProofGroundedSigningKey;
}

export interface VerifyRiddleProofHumanAttestationInput {
  bundle: unknown;
  /** Independent expected body; never inferred from the signed artifact. */
  expected_body: RiddleProofHumanAttestationBody;
  actor_registry: [
    RiddleProofHumanActorRegistration,
    ...RiddleProofHumanActorRegistration[],
  ];
  verification_time: string;
  max_attestation_age_ms: number;
  max_future_skew_ms: number;
}

export type RiddleProofHumanAttestationErrorCode =
  | "invalid_input"
  | "invalid_body"
  | "signer_unlisted"
  | "actor_not_human"
  | "kind_not_allowed"
  | "grounding_failed"
  | "body_mismatch";

export interface RiddleProofHumanAttestationError {
  code: RiddleProofHumanAttestationErrorCode;
  message: string;
}

export type RiddleProofHumanAttestationCreationResult =
  | {
      ok: true;
      body: RiddleProofHumanAttestationBody;
      bundle: RiddleProofSignedCaptureBundle;
      recipe: RiddleProofHumanAttestationGroundingRecipe;
    }
  | { ok: false; error: RiddleProofHumanAttestationError };

export type RiddleProofHumanAttestationVerificationResult =
  | {
      ok: true;
      body: RiddleProofHumanAttestationBody;
      actor: {
        actor_id: string;
        actor_type: "human";
        key_id: string;
        public_key_spki_sha256: string;
      };
      grounding: {
        bundle_id: string;
        statement_digest: string;
        observation_digest: string;
        verified_at: string;
      };
    }
  | { ok: false; error: RiddleProofHumanAttestationError };

const HUMAN_ATTESTATION_ARTIFACT_ID = "human-attestation-body";
const MAX_ACTOR_REGISTRY_ENTRIES = 256;
const MAX_PUBLIC_KEY_BYTES = 16 * 1024;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const SNAPSHOT_ID_PATTERN = /^rpds_[A-Za-z0-9_-]{43}$/u;
const PACKET_RECEIPT_ID_PATTERN = /^rprr_[A-Za-z0-9_-]{43}$/u;
const CERTIFICATE_ID_PATTERN = /^rpsc_[0-9a-f]{64}$/u;

function failure(
  code: RiddleProofHumanAttestationErrorCode,
  message: string,
): { ok: false; error: RiddleProofHumanAttestationError } {
  return { ok: false, error: { code, message } };
}

function parseKind(value: unknown, context: string): RiddleProofHumanAttestationKind {
  if (value !== "submitted_for_legal_review" && value !== "legal_approved") {
    throw new Error(`${context} is unsupported.`);
  }
  return value;
}

function parseNonce(value: unknown, context: string): string {
  const nonce = protocolString(value, context, 43, NONCE_PATTERN);
  const bytes = Buffer.from(nonce, "base64url");
  if (bytes.byteLength !== 32 || bytes.toString("base64url") !== nonce) {
    throw new Error(`${context} must canonically encode exactly 32 bytes.`);
  }
  return nonce;
}

function parseBody(value: unknown, context: string): RiddleProofHumanAttestationBody {
  assertProtocolRecord(value, context);
  assertProtocolKeys(
    value,
    [
      "version",
      "kind",
      "snapshot_id",
      "manifest_digest",
      "packet_receipt_id",
      "packet_digest",
      "packet_complete_certificate_id",
      "issued_at",
      "nonce",
    ],
    [],
    context,
  );
  if (protocolField(value, "version", context) !== RIDDLE_PROOF_HUMAN_ATTESTATION_VERSION) {
    throw new Error(`${context}.version is unsupported.`);
  }
  return {
    version: RIDDLE_PROOF_HUMAN_ATTESTATION_VERSION,
    kind: parseKind(protocolField(value, "kind", context), `${context}.kind`),
    snapshot_id: protocolString(
      protocolField(value, "snapshot_id", context),
      `${context}.snapshot_id`,
      48,
      SNAPSHOT_ID_PATTERN,
    ),
    manifest_digest: protocolDigest(
      protocolField(value, "manifest_digest", context),
      `${context}.manifest_digest`,
    ),
    packet_receipt_id: protocolString(
      protocolField(value, "packet_receipt_id", context),
      `${context}.packet_receipt_id`,
      48,
      PACKET_RECEIPT_ID_PATTERN,
    ),
    packet_digest: protocolDigest(
      protocolField(value, "packet_digest", context),
      `${context}.packet_digest`,
    ),
    packet_complete_certificate_id: protocolString(
      protocolField(value, "packet_complete_certificate_id", context),
      `${context}.packet_complete_certificate_id`,
      69,
      CERTIFICATE_ID_PATTERN,
    ),
    issued_at: protocolTimestamp(
      protocolField(value, "issued_at", context),
      `${context}.issued_at`,
    ),
    nonce: parseNonce(protocolField(value, "nonce", context), `${context}.nonce`),
  };
}

function decodeCanonicalPublicKey(
  value: unknown,
  context: string,
): { encoded: string; bytes: Uint8Array; fingerprint: string } {
  if (typeof value !== "string" || value.length > Math.ceil(MAX_PUBLIC_KEY_BYTES / 3) * 4) {
    throw new Error(`${context} must be a bounded canonical base64 string.`);
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    throw new Error(`${context} must be canonical padded base64.`);
  }
  const bytes = Buffer.from(value, "base64");
  if (
    bytes.byteLength > MAX_PUBLIC_KEY_BYTES
    || bytes.toString("base64") !== value
  ) {
    throw new Error(`${context} must be canonical padded base64.`);
  }
  const publicKey = createPublicKey({ key: bytes, format: "der", type: "spki" });
  if (publicKey.asymmetricKeyType !== "ed25519") {
    throw new Error(`${context} must contain an Ed25519 SPKI public key.`);
  }
  const canonical = publicKey.export({ format: "der", type: "spki" });
  if (!bytes.equals(canonical)) {
    throw new Error(`${context} must contain canonical DER without trailing bytes.`);
  }
  return {
    encoded: value,
    bytes: new Uint8Array(bytes),
    fingerprint: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  };
}

function parseActorRegistry(value: unknown): RiddleProofHumanActorRegistration[] {
  const entries = protocolArray(value, "human actor registry", MAX_ACTOR_REGISTRY_ENTRIES);
  if (entries.length === 0) throw new Error("human actor registry must not be empty.");
  const actorIds = new Set<string>();
  const keyIds = new Set<string>();
  const keyFingerprints = new Set<string>();
  return entries.map((entry, index) => {
    const context = `human actor registry[${index}]`;
    assertProtocolRecord(entry, context);
    assertProtocolKeys(
      entry,
      [
        "actor_id",
        "actor_type",
        "key_id",
        "public_key_spki_base64",
        "public_key_spki_sha256",
        "allowed_kinds",
      ],
      [],
      context,
    );
    const actorId = protocolCode(protocolField(entry, "actor_id", context), `${context}.actor_id`);
    const keyId = protocolCode(protocolField(entry, "key_id", context), `${context}.key_id`);
    if (actorIds.has(actorId)) throw new Error(`${context} repeats actor_id ${actorId}.`);
    if (keyIds.has(keyId)) throw new Error(`${context} repeats key_id ${keyId}.`);
    actorIds.add(actorId);
    keyIds.add(keyId);

    const actorType = protocolField(entry, "actor_type", context);
    if (actorType !== "human" && actorType !== "agent") {
      throw new Error(`${context}.actor_type is unsupported.`);
    }
    const publicKey = decodeCanonicalPublicKey(
      protocolField(entry, "public_key_spki_base64", context),
      `${context}.public_key_spki_base64`,
    );
    const expectedFingerprint = protocolDigest(
      protocolField(entry, "public_key_spki_sha256", context),
      `${context}.public_key_spki_sha256`,
    );
    if (publicKey.fingerprint !== expectedFingerprint) {
      throw new Error(`${context}.public_key_spki_sha256 does not match the registered key.`);
    }
    if (keyFingerprints.has(expectedFingerprint)) {
      throw new Error(`${context} repeats a public-key fingerprint.`);
    }
    keyFingerprints.add(expectedFingerprint);
    const allowedValues = protocolArray(
      protocolField(entry, "allowed_kinds", context),
      `${context}.allowed_kinds`,
      2,
    );
    if (allowedValues.length === 0) throw new Error(`${context}.allowed_kinds must not be empty.`);
    const allowedKinds = allowedValues.map((kind, allowedIndex) =>
      parseKind(kind, `${context}.allowed_kinds[${allowedIndex}]`));
    if (new Set(allowedKinds).size !== allowedKinds.length) {
      throw new Error(`${context}.allowed_kinds must not contain duplicates.`);
    }
    return {
      actor_id: actorId,
      actor_type: actorType,
      key_id: keyId,
      public_key_spki_base64: publicKey.encoded,
      public_key_spki_sha256: expectedFingerprint,
      allowed_kinds: allowedKinds as [
        RiddleProofHumanAttestationKind,
        ...RiddleProofHumanAttestationKind[],
      ],
    };
  });
}

function sameBody(
  left: RiddleProofHumanAttestationBody,
  right: unknown,
): boolean {
  try {
    return canonicalProtocolJson(left) === canonicalProtocolJson(parseBody(right, "observed body"));
  } catch {
    return false;
  }
}

/**
 * Deterministically maps the typed body into the fixed grounded-capture recipe.
 * It has no ambient clock, actor lookup, or caller-selected verifier.
 */
export function createRiddleProofHumanAttestationGroundingRecipe(
  body: RiddleProofHumanAttestationBody,
): RiddleProofHumanAttestationGroundingRecipe {
  const normalizedBody = parseBody(body, "human attestation body");
  const bodyJson = canonicalProtocolJson(normalizedBody);
  const target = `human-attestation:${normalizedBody.packet_complete_certificate_id}`;
  const verifierDefinition: RiddleProofGroundedDeclarativeJsonVerifierDefinition = {
    verifier_id: "riddle-proof-human-attestation-json",
    verifier_version: "1",
    program: {
      artifact: {
        artifact_id: HUMAN_ATTESTATION_ARTIFACT_ID,
        role: RIDDLE_PROOF_HUMAN_ATTESTATION_ARTIFACT_ROLE,
        media_type: "application/json",
      },
      pointer: "",
    },
  };
  const verifier = createRiddleProofGroundedDeclarativeJsonVerifier(verifierDefinition);
  if (!verifier.ok) {
    throw new Error(`Fixed human-attestation verifier is invalid: ${verifier.error.message}`);
  }
  const collectorDefinition = {
    collector_id: "riddle-proof-human-attestation",
    collector_version: "1",
    input: "canonical-content-free-body",
  };
  return {
    body: normalizedBody,
    body_json: bodyJson,
    scope: {
      repository: "riddle-proof-core",
      revision: normalizedBody.manifest_digest,
      environment: "human-attestation",
      target,
      proof_attempt: normalizedBody.nonce,
    },
    collector: {
      collector_id: collectorDefinition.collector_id,
      collector_version: collectorDefinition.collector_version,
      implementation_digest: protocolSha256(
        "riddle-proof.human-attestation.collector.v1\0",
        collectorDefinition,
      ),
    },
    sensor: {
      kind: "human",
      name: "riddle-proof-human-attestation",
      version: "1",
      observed_target: target,
      metadata: { attestation_kind: normalizedBody.kind },
    },
    artifact: {
      artifact_id: HUMAN_ATTESTATION_ARTIFACT_ID,
      role: RIDDLE_PROOF_HUMAN_ATTESTATION_ARTIFACT_ROLE,
      media_type: "application/json",
      bytes_base64: Buffer.from(bodyJson, "utf8").toString("base64"),
    },
    verifier_definition: verifierDefinition,
    verifier_ref: verifier.verifier_ref,
    verifier_registration: verifier.registration,
  };
}

export function createRiddleProofHumanAttestation(
  input: CreateRiddleProofHumanAttestationInput,
): RiddleProofHumanAttestationCreationResult {
  try {
    assertProtocolRecord(input, "human attestation creation input");
    assertProtocolKeys(
      input,
      ["body", "signing_key"],
      [],
      "human attestation creation input",
    );
    const recipe = createRiddleProofHumanAttestationGroundingRecipe(
      protocolField(input, "body", "human attestation creation input") as
        RiddleProofHumanAttestationBody,
    );
    const created = createRiddleProofSignedCaptureBundle({
      scope: recipe.scope,
      nonce: recipe.body.nonce,
      captured_at: recipe.body.issued_at,
      collector: recipe.collector,
      sensor: recipe.sensor,
      verifier: recipe.verifier_ref,
      artifacts: [recipe.artifact],
      signing_key: protocolField(
        input,
        "signing_key",
        "human attestation creation input",
      ) as RiddleProofGroundedSigningKey,
    });
    if (!created.ok) return failure("grounding_failed", created.error.message);
    return { ok: true, body: recipe.body, bundle: created.bundle, recipe };
  } catch (error) {
    return failure(
      "invalid_body",
      `Human attestation creation failed: ${protocolErrorMessage(error)}`,
    );
  }
}

export function verifyRiddleProofHumanAttestation(
  input: VerifyRiddleProofHumanAttestationInput,
): RiddleProofHumanAttestationVerificationResult {
  let body: RiddleProofHumanAttestationBody;
  let recipe: RiddleProofHumanAttestationGroundingRecipe;
  let registry: RiddleProofHumanActorRegistration[];
  let verificationTime: string;
  let maxAttestationAgeMs: number;
  let maxFutureSkewMs: number;
  let bundle: unknown;
  try {
    assertProtocolRecord(input, "human attestation verification input");
    assertProtocolKeys(
      input,
      [
        "bundle",
        "expected_body",
        "actor_registry",
        "verification_time",
        "max_attestation_age_ms",
        "max_future_skew_ms",
      ],
      [],
      "human attestation verification input",
    );
    body = parseBody(
      protocolField(input, "expected_body", "human attestation verification input"),
      "independent expected human attestation body",
    );
    recipe = createRiddleProofHumanAttestationGroundingRecipe(body);
    registry = parseActorRegistry(
      protocolField(input, "actor_registry", "human attestation verification input"),
    );
    verificationTime = protocolTimestamp(
      protocolField(input, "verification_time", "human attestation verification input"),
      "human attestation verification input.verification_time",
    );
    maxAttestationAgeMs = protocolInteger(
      protocolField(input, "max_attestation_age_ms", "human attestation verification input"),
      "human attestation verification input.max_attestation_age_ms",
      0,
      365 * 24 * 60 * 60 * 1000,
    );
    maxFutureSkewMs = protocolInteger(
      protocolField(input, "max_future_skew_ms", "human attestation verification input"),
      "human attestation verification input.max_future_skew_ms",
      0,
      365 * 24 * 60 * 60 * 1000,
    );
    bundle = protocolField(input, "bundle", "human attestation verification input");
  } catch (error) {
    return failure(
      "invalid_input",
      `Human attestation verification input is invalid: ${protocolErrorMessage(error)}`,
    );
  }

  const keyId = (() => {
    try {
      assertProtocolRecord(bundle, "human attestation signed bundle");
      const provenance = protocolField(bundle, "provenance", "human attestation signed bundle");
      assertProtocolRecord(provenance, "human attestation signed bundle.provenance");
      return protocolCode(
        protocolField(provenance, "key_id", "human attestation signed bundle.provenance"),
        "human attestation signed bundle.provenance.key_id",
      );
    } catch {
      return undefined;
    }
  })();
  if (keyId === undefined) {
    return failure("grounding_failed", "Human attestation signed bundle is malformed.");
  }
  const actor = registry.find((entry) => entry.key_id === keyId);
  if (!actor) {
    return failure("signer_unlisted", "Human attestation signer is not in the independent actor registry.");
  }

  const verified = verifyRiddleProofSignedCaptureBundle({
    bundle,
    policy: {
      expected_scope: recipe.scope,
      expected_nonce: body.nonce,
      expected_collector: recipe.collector,
      expected_sensor: recipe.sensor,
      expected_verifier: recipe.verifier_ref,
      expected_signer: {
        key_id: actor.key_id,
        public_key_spki_sha256: actor.public_key_spki_sha256,
      },
      verification_time: verificationTime,
      max_capture_age_ms: maxAttestationAgeMs,
      max_future_skew_ms: maxFutureSkewMs,
      required_artifact_roles: [RIDDLE_PROOF_HUMAN_ATTESTATION_ARTIFACT_ROLE],
    },
    trusted_signers: [{
      key_id: actor.key_id,
      public_key_spki_base64: actor.public_key_spki_base64,
    }],
    verifier_registry: [recipe.verifier_registration],
  });
  if (!verified.ok) {
    return failure("grounding_failed", `Human attestation grounding failed: ${verified.error.message}`);
  }
  if (
    verified.bundle.statement.artifacts.length !== 1
    || verified.bundle.inline_artifacts.length !== 1
    || verified.bundle.statement.artifacts[0].artifact_id !== recipe.artifact.artifact_id
    || verified.bundle.statement.artifacts[0].role !== recipe.artifact.role
    || verified.bundle.statement.artifacts[0].media_type !== recipe.artifact.media_type
    || verified.bundle.inline_artifacts[0].artifact_id !== recipe.artifact.artifact_id
    || verified.bundle.inline_artifacts[0].bytes_base64 !== recipe.artifact.bytes_base64
  ) {
    return failure(
      "body_mismatch",
      "Human attestation must contain exactly the canonical content-free body artifact.",
    );
  }
  if (actor.actor_type !== "human") {
    return failure("actor_not_human", "Only a registered human actor may make a human attestation.");
  }
  if (!actor.allowed_kinds.includes(body.kind)) {
    return failure(
      "kind_not_allowed",
      "Registered human actor is not authorized for this attestation kind.",
    );
  }
  if (verified.bundle.statement.captured_at !== body.issued_at) {
    return failure("body_mismatch", "Human attestation time does not match the independent expected body.");
  }
  if (!sameBody(body, verified.verified_capture.observation)) {
    return failure(
      "body_mismatch",
      "Human attestation body does not match the independent expected snapshot and packet bindings.",
    );
  }
  return {
    ok: true,
    body,
    actor: {
      actor_id: actor.actor_id,
      actor_type: "human",
      key_id: actor.key_id,
      public_key_spki_sha256: actor.public_key_spki_sha256,
    },
    grounding: {
      bundle_id: verified.verified_capture.bundle_id,
      statement_digest: verified.verified_capture.statement_digest,
      observation_digest: verified.verified_capture.observation_digest,
      verified_at: verificationTime,
    },
  };
}
