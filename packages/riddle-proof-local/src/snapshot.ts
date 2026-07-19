import { basename, extname, isAbsolute, posix, relative, resolve, sep } from "node:path";
import { lstat, realpath } from "node:fs/promises";
import { canonicalJson, digestToken, sha256Bytes, sha256Canonical } from "./canonical.js";
import {
  DEFAULT_MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_BYTES,
  readStableRegularFile,
} from "./stableRead.js";
import {
  DOCUMENT_SNAPSHOT_CAPTURE_METHOD,
  DOCUMENT_SNAPSHOT_OBSERVATION_VERSION,
  DOCUMENT_SNAPSHOT_RECEIPT_VERSION,
  DOCUMENT_SNAPSHOT_VERSION,
  type CaptureDocumentSnapshotInput,
  type DocumentArtifactPolicy,
  type DocumentSnapshotArtifact,
  type DocumentSnapshotComparison,
  type DocumentSnapshotGroundingRecipe,
  type DocumentSnapshotObservation,
  type DocumentSnapshotReceipt,
  type DocumentSnapshotVerification,
} from "./types.js";

const ROLE_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/u;
const MEDIA_TYPE_PATTERN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const OPAQUE_ID_PATTERN = /^rpa_[A-Za-z0-9_-]{43}$/u;
const SNAPSHOT_ID_PATTERN = /^rpds_[A-Za-z0-9_-]{43}$/u;
const RECEIPT_ID_PATTERN = /^rpdr_[A-Za-z0-9_-]{43}$/u;
const MAX_DOCUMENT_FILES = 32;
const MAX_DOCUMENT_TOTAL_BYTES = 512 * 1024 * 1024;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const MEDIA_TYPES: Record<string, string> = {
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".html": "text/html",
  ".json": "application/json",
  ".md": "text/markdown",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".pdf": "application/pdf",
  ".rtf": "application/rtf",
  ".txt": "text/plain",
};

function validatePolicy(value: unknown): asserts value is DocumentArtifactPolicy {
  if (value !== "digest_only" && value !== "minimal" && value !== "full") {
    throw new TypeError("artifactPolicy must be digest_only, minimal, or full.");
  }
}

function validateRole(value: unknown): asserts value is string {
  if (typeof value !== "string" || !ROLE_PATTERN.test(value)) {
    throw new TypeError("Each file role must match ^[a-z][a-z0-9_-]{0,63}$.");
  }
}

function normalizeMediaType(filePath: string, supplied: string | undefined): string {
  const mediaType = supplied?.trim().toLowerCase()
    ?? MEDIA_TYPES[extname(filePath).toLowerCase()]
    ?? "application/octet-stream";
  if (!MEDIA_TYPE_PATTERN.test(mediaType)) throw new TypeError(`Invalid media type: ${mediaType}`);
  return mediaType;
}

function validateCapturedAt(value: string): void {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new TypeError("capturedAt must be a canonical ISO-8601 UTC timestamp.");
  }
}

function validateLabel(value: string | undefined): void {
  if (value !== undefined && (value.trim() !== value || value.length < 1 || value.length > 4096)) {
    throw new TypeError("label must be a non-empty, trimmed string of at most 4096 characters.");
  }
}

function artifactIdentity(artifact: DocumentSnapshotArtifact) {
  return {
    role: artifact.role,
    media_type: artifact.media_type,
    byte_length: artifact.byte_length,
    digest: artifact.digest,
  };
}

function opaqueReference(role: string, digest: string) {
  const referenceDigest = sha256Canonical("riddle.document-artifact-reference.v1", { role, digest });
  return { kind: "opaque" as const, id: `rpa_${digestToken(referenceDigest)}` };
}

function relativeReference(rootPath: string, sourcePath: string): { kind: "relative"; path: string } {
  const candidate = relative(rootPath, sourcePath);
  if (candidate === "" || candidate === ".." || candidate.startsWith(`..${sep}`) || isAbsolute(candidate)) {
    throw new Error("Selected source is not a descendant of referenceRoot.");
  }
  return { kind: "relative", path: candidate.split(sep).join("/") };
}

export async function captureDocumentSnapshot(
  input: CaptureDocumentSnapshotInput,
): Promise<DocumentSnapshotReceipt> {
  if (!input || typeof input !== "object" || !Array.isArray(input.files) || input.files.length < 1) {
    throw new TypeError("files must contain at least one explicitly selected source.");
  }
  if (input.files.length > MAX_DOCUMENT_FILES) {
    throw new TypeError(`files must contain at most ${MAX_DOCUMENT_FILES} sources.`);
  }
  const artifactPolicy = input.artifactPolicy ?? "digest_only";
  validatePolicy(artifactPolicy);
  validateLabel(input.label);
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  validateCapturedAt(capturedAt);
  const maxFileBytes = input.maxFileBytes ?? DEFAULT_MAX_DOCUMENT_BYTES;
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > MAX_DOCUMENT_BYTES) {
    throw new TypeError(`maxFileBytes must be an integer from 1 through ${MAX_DOCUMENT_BYTES}.`);
  }

  const roles = new Set<string>();
  for (const selection of input.files) {
    if (!selection || typeof selection !== "object") throw new TypeError("Each file selection must be an object.");
    validateRole(selection.role);
    if (roles.has(selection.role)) throw new TypeError(`Duplicate file role: ${selection.role}`);
    roles.add(selection.role);
    if (typeof selection.path !== "string" || selection.path.length < 1 || selection.path.includes("\u0000")) {
      throw new TypeError(`File role ${selection.role} requires a local path.`);
    }
  }

  const resolvedReferenceRoot = input.referenceRoot === undefined
    ? undefined
    : await realpath(resolve(input.referenceRoot));
  const identities = new Set<string>();
  const artifacts: DocumentSnapshotArtifact[] = [];
  let totalBytes = 0;
  for (const selection of [...input.files].sort((left, right) => compareText(left.role, right.role))) {
    const sourcePath = resolve(selection.path);
    const read = await readStableRegularFile(sourcePath, maxFileBytes);
    const identity = `${read.identity.dev}:${read.identity.ino}`;
    if (identities.has(identity)) {
      throw new Error("The same local file was selected for more than one role.");
    }
    identities.add(identity);
    totalBytes += read.bytes.byteLength;
    if (totalBytes > MAX_DOCUMENT_TOTAL_BYTES) {
      throw new Error(`Selected files exceed the ${MAX_DOCUMENT_TOTAL_BYTES}-byte total capture limit.`);
    }
    const digest = sha256Bytes(read.bytes);
    const realSourcePath = await realpath(sourcePath);
    const pathIdentityAfterRead = await lstat(realSourcePath, { bigint: true });
    if (!pathIdentityAfterRead.isFile()
      || BigInt(pathIdentityAfterRead.dev) !== read.identity.dev
      || BigInt(pathIdentityAfterRead.ino) !== read.identity.ino) {
      throw new Error("Selected source identity changed after its stable read.");
    }
    const artifact: DocumentSnapshotArtifact = {
      role: selection.role,
      media_type: normalizeMediaType(sourcePath, selection.mediaType),
      byte_length: read.bytes.byteLength,
      digest,
      reference: artifactPolicy !== "digest_only" && resolvedReferenceRoot !== undefined
        ? relativeReference(resolvedReferenceRoot, realSourcePath)
        : opaqueReference(selection.role, digest),
    };
    if (artifactPolicy !== "digest_only") artifact.source_name = basename(realSourcePath);
    if (artifactPolicy === "full") artifact.content_base64 = read.bytes.toString("base64");
    artifacts.push(artifact);
  }

  const identityManifest = {
    version: DOCUMENT_SNAPSHOT_VERSION,
    artifacts: artifacts.map(artifactIdentity),
  };
  const manifestDigest = sha256Canonical("riddle.document-snapshot-manifest.v1", identityManifest);
  const snapshot = {
    ...identityManifest,
    snapshot_id: `rpds_${digestToken(manifestDigest)}`,
    manifest_digest: manifestDigest,
    artifacts,
  };
  const receiptBody = {
    version: DOCUMENT_SNAPSHOT_RECEIPT_VERSION,
    kind: "document_snapshot" as const,
    captured_at: capturedAt,
    ...(input.label === undefined ? {} : { label: input.label }),
    artifact_policy: artifactPolicy,
    capture_method: DOCUMENT_SNAPSHOT_CAPTURE_METHOD,
    source_documents_mutated: false as const,
    snapshot,
  };
  const receiptDigest = sha256Canonical("riddle.document-snapshot-receipt.v1", receiptBody);
  return {
    ...receiptBody,
    receipt_id: `rpdr_${digestToken(receiptDigest)}`,
  };
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  const actual = Object.keys(value).sort();
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && actual.every((key) => allowed.has(key));
}

function canonicalBase64(value: string): boolean {
  try {
    return Buffer.from(value, "base64").toString("base64") === value;
  } catch {
    return false;
  }
}

export function verifyDocumentSnapshotReceipt(value: unknown): DocumentSnapshotVerification {
  const errors: string[] = [];
  try {
    if (!plainObject(value)) throw new Error("Receipt must be a plain object.");
    if (!exactKeys(value, [
      "version", "kind", "receipt_id", "captured_at", "artifact_policy", "capture_method",
      "source_documents_mutated", "snapshot",
    ], ["label"])) throw new Error("Receipt fields are incomplete or unexpected.");
    if (value.version !== DOCUMENT_SNAPSHOT_RECEIPT_VERSION || value.kind !== "document_snapshot") {
      throw new Error("Receipt version or kind is unsupported.");
    }
    if (typeof value.receipt_id !== "string" || !RECEIPT_ID_PATTERN.test(value.receipt_id)) {
      throw new Error("Receipt ID is malformed.");
    }
    if (typeof value.captured_at !== "string") throw new Error("captured_at is missing.");
    validateCapturedAt(value.captured_at);
    validateLabel(value.label as string | undefined);
    validatePolicy(value.artifact_policy);
    if (value.capture_method !== DOCUMENT_SNAPSHOT_CAPTURE_METHOD || value.source_documents_mutated !== false) {
      throw new Error("Receipt capture guarantees are unsupported.");
    }
    if (!plainObject(value.snapshot) || !exactKeys(value.snapshot, [
      "version", "snapshot_id", "manifest_digest", "artifacts",
    ])) throw new Error("Snapshot fields are incomplete or unexpected.");
    if (value.snapshot.version !== DOCUMENT_SNAPSHOT_VERSION
      || typeof value.snapshot.snapshot_id !== "string"
      || !SNAPSHOT_ID_PATTERN.test(value.snapshot.snapshot_id)
      || typeof value.snapshot.manifest_digest !== "string"
      || !SHA256_PATTERN.test(value.snapshot.manifest_digest)
      || !Array.isArray(value.snapshot.artifacts)
      || value.snapshot.artifacts.length < 1
      || value.snapshot.artifacts.length > MAX_DOCUMENT_FILES) {
      throw new Error("Snapshot identity or artifact list is malformed.");
    }

    const parsedArtifacts: DocumentSnapshotArtifact[] = [];
    let previousRole = "";
    let totalBytes = 0;
    for (const candidate of value.snapshot.artifacts) {
      if (!plainObject(candidate) || !exactKeys(candidate, [
        "role", "media_type", "byte_length", "digest", "reference",
      ], ["source_name", "content_base64"])) throw new Error("Artifact fields are incomplete or unexpected.");
      validateRole(candidate.role);
      if (candidate.role <= previousRole) throw new Error("Artifacts must have unique roles in canonical order.");
      previousRole = candidate.role;
      if (typeof candidate.media_type !== "string" || !MEDIA_TYPE_PATTERN.test(candidate.media_type)
        || typeof candidate.byte_length !== "number" || !Number.isSafeInteger(candidate.byte_length)
        || candidate.byte_length < 0 || candidate.byte_length > MAX_DOCUMENT_BYTES
        || typeof candidate.digest !== "string"
        || !SHA256_PATTERN.test(candidate.digest)) throw new Error("Artifact metadata is malformed.");
      totalBytes += candidate.byte_length;
      if (totalBytes > MAX_DOCUMENT_TOTAL_BYTES) throw new Error("Snapshot byte total exceeds its safety limit.");
      if (!plainObject(candidate.reference)) throw new Error("Artifact reference is malformed.");
      if (candidate.reference.kind === "opaque") {
        if (!exactKeys(candidate.reference, ["kind", "id"])
          || typeof candidate.reference.id !== "string"
          || !OPAQUE_ID_PATTERN.test(candidate.reference.id)
          || candidate.reference.id !== opaqueReference(candidate.role, candidate.digest).id) {
          throw new Error("Opaque artifact reference is malformed or does not match its digest.");
        }
      } else if (candidate.reference.kind === "relative") {
        if (!exactKeys(candidate.reference, ["kind", "path"])
          || typeof candidate.reference.path !== "string"
          || candidate.reference.path.length < 1
          || candidate.reference.path.includes("\\")
          || posix.isAbsolute(candidate.reference.path)
          || candidate.reference.path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
          throw new Error("Relative artifact reference is unsafe.");
        }
        if (value.artifact_policy === "digest_only") {
          throw new Error("digest_only receipts must use opaque artifact references.");
        }
      } else {
        throw new Error("Artifact reference kind is unsupported.");
      }
      if (value.artifact_policy === "digest_only") {
        if (candidate.source_name !== undefined || candidate.content_base64 !== undefined) {
          throw new Error("digest_only receipts contain forbidden source details.");
        }
      } else {
        if (typeof candidate.source_name !== "string" || candidate.source_name.length < 1
          || basename(candidate.source_name) !== candidate.source_name) {
          throw new Error("Minimal/full receipts require a safe source_name.");
        }
        if (value.artifact_policy === "minimal" && candidate.content_base64 !== undefined) {
          throw new Error("minimal receipts must not contain source bytes.");
        }
        if (value.artifact_policy === "full") {
          if (typeof candidate.content_base64 !== "string"
            || candidate.content_base64.length > Math.ceil(candidate.byte_length / 3) * 4 + 4
            || !canonicalBase64(candidate.content_base64)) {
            throw new Error("full receipts require canonical base64 source bytes.");
          }
          const bytes = Buffer.from(candidate.content_base64, "base64");
          if (bytes.byteLength !== candidate.byte_length || sha256Bytes(bytes) !== candidate.digest) {
            throw new Error("Embedded artifact bytes do not match their metadata.");
          }
        }
      }
      parsedArtifacts.push(candidate as unknown as DocumentSnapshotArtifact);
    }

    const identityManifest = {
      version: DOCUMENT_SNAPSHOT_VERSION,
      artifacts: parsedArtifacts.map(artifactIdentity),
    };
    const expectedManifestDigest = sha256Canonical(
      "riddle.document-snapshot-manifest.v1",
      identityManifest,
    );
    if (value.snapshot.manifest_digest !== expectedManifestDigest
      || value.snapshot.snapshot_id !== `rpds_${digestToken(expectedManifestDigest)}`) {
      throw new Error("Snapshot identity does not match its canonical artifact manifest.");
    }
    const { receipt_id: _receiptId, ...receiptBody } = value;
    const expectedReceiptId = `rpdr_${digestToken(
      sha256Canonical("riddle.document-snapshot-receipt.v1", receiptBody),
    )}`;
    if (value.receipt_id !== expectedReceiptId) throw new Error("Receipt ID does not match its canonical body.");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return { ok: errors.length === 0, errors };
}

export function compareDocumentSnapshotReceipts(
  previous: DocumentSnapshotReceipt,
  current: DocumentSnapshotReceipt,
): DocumentSnapshotComparison {
  const previousVerification = verifyDocumentSnapshotReceipt(previous);
  const currentVerification = verifyDocumentSnapshotReceipt(current);
  if (!previousVerification.ok || !currentVerification.ok) {
    throw new Error(`Cannot compare invalid receipts: ${[
      ...previousVerification.errors,
      ...currentVerification.errors,
    ].join("; ")}`);
  }
  const previousArtifacts = new Map(previous.snapshot.artifacts.map((artifact) => [artifact.role, artifact]));
  const currentArtifacts = new Map(current.snapshot.artifacts.map((artifact) => [artifact.role, artifact]));
  const addedRoles = [...currentArtifacts.keys()].filter((role) => !previousArtifacts.has(role)).sort();
  const removedRoles = [...previousArtifacts.keys()].filter((role) => !currentArtifacts.has(role)).sort();
  const changedRoles = [...currentArtifacts.keys()].filter((role) => {
    const before = previousArtifacts.get(role);
    const after = currentArtifacts.get(role);
    return before !== undefined && (before.digest !== after?.digest
      || before.byte_length !== after.byte_length
      || before.media_type !== after.media_type);
  }).sort();
  return {
    status: addedRoles.length === 0 && removedRoles.length === 0 && changedRoles.length === 0
      ? "unchanged"
      : "changed",
    added_roles: addedRoles,
    removed_roles: removedRoles,
    changed_roles: changedRoles,
  };
}

export function createDocumentSnapshotObservation(
  receipt: DocumentSnapshotReceipt,
): DocumentSnapshotObservation {
  const verification = verifyDocumentSnapshotReceipt(receipt);
  if (!verification.ok) throw new Error(`Cannot observe invalid receipt: ${verification.errors.join("; ")}`);
  return {
    version: DOCUMENT_SNAPSHOT_OBSERVATION_VERSION,
    snapshot_id: receipt.snapshot.snapshot_id,
    manifest_digest: receipt.snapshot.manifest_digest,
    artifact_policy: receipt.artifact_policy,
    capture: {
      method: DOCUMENT_SNAPSHOT_CAPTURE_METHOD,
      stable: true,
      source_documents_mutated: false,
    },
    artifacts: receipt.snapshot.artifacts.map(artifactIdentity),
  };
}

export function createDocumentSnapshotGroundingRecipe(
  receipt: DocumentSnapshotReceipt,
): DocumentSnapshotGroundingRecipe {
  const observation = createDocumentSnapshotObservation(receipt);
  const observationJson = canonicalJson(observation);
  const artifact = {
    artifact_id: "document-snapshot-observation.json",
    role: "document_snapshot_observation",
    media_type: "application/json" as const,
    bytes_base64: Buffer.from(observationJson, "utf8").toString("base64"),
  };
  return {
    observation,
    observation_json: observationJson,
    artifacts: [artifact],
    verifier_definition: {
      verifier_id: "riddle-proof.local-document-snapshot.declarative",
      verifier_version: "1",
      program: {
        artifact: {
          artifact_id: artifact.artifact_id,
          role: artifact.role,
          media_type: artifact.media_type,
        },
        pointer: "",
      },
    },
    contract_definition: {
      contract_id: "riddle-proof.local-document-snapshot-captured.declarative",
      contract_version: "1",
      label: "A stable read-only local document snapshot was captured",
      claim: {
        claim_id: "local-document-snapshot-captured",
        claim_version: "1",
        label: "Selected local document bytes were captured without source mutation",
      },
      program: {
        all: [
          {
            op: "equals",
            source: "observation",
            pointer: "/version",
            value: DOCUMENT_SNAPSHOT_OBSERVATION_VERSION,
          },
          { op: "exists", source: "observation", pointer: "/snapshot_id" },
          { op: "type_is", source: "observation", pointer: "/snapshot_id", type: "string" },
          { op: "exists", source: "observation", pointer: "/manifest_digest" },
          { op: "type_is", source: "observation", pointer: "/manifest_digest", type: "string" },
          {
            op: "equals",
            source: "observation",
            pointer: "/capture/method",
            value: DOCUMENT_SNAPSHOT_CAPTURE_METHOD,
          },
          { op: "equals", source: "observation", pointer: "/capture/stable", value: true },
          {
            op: "equals",
            source: "observation",
            pointer: "/capture/source_documents_mutated",
            value: false,
          },
          { op: "type_is", source: "observation", pointer: "/artifacts", type: "array" },
        ],
      },
    },
  };
}
