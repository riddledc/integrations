import {
  captureDocumentSnapshot,
  recaptureDocumentSnapshotCurrentness,
  verifyDocumentSnapshotReceipt,
  type DocumentSnapshotArtifact,
} from "@riddledc/riddle-proof-local";

import { canonicalDigest, sha256Bytes } from "./canonical.js";
import type {
  CapturedRecordSet,
  RecordBytes,
  RecordSetSelection,
} from "./types.js";

const EXPECTED_ROLES = [
  "invoice",
  "purchase_order",
  "receipt",
] as const;
const MAX_RECORD_BYTES = 4 * 1024 * 1024;

function selections(input: RecordSetSelection) {
  return [
    {
      role: "invoice",
      path: input.invoice_path,
      mediaType: "application/json",
    },
    {
      role: "purchase_order",
      path: input.purchase_order_path,
      mediaType: "application/json",
    },
    {
      role: "receipt",
      path: input.receipt_path,
      mediaType: "application/json",
    },
  ] as const;
}

function fullBytes(
  artifacts: readonly DocumentSnapshotArtifact[],
): RecordBytes {
  const byRole = new Map(artifacts.map((artifact) => [
    artifact.role,
    artifact,
  ]));
  const bytes = Object.fromEntries(EXPECTED_ROLES.map((role) => {
    const artifact = byRole.get(role);
    if (!artifact || typeof artifact.content_base64 !== "string") {
      throw new Error("Private full capture omitted an expected record.");
    }
    const decoded = Buffer.from(artifact.content_base64, "base64");
    if (
      decoded.byteLength !== artifact.byte_length
      || sha256Bytes(decoded) !== artifact.digest
    ) {
      throw new Error("Private full capture bytes do not match their digest.");
    }
    return [role, decoded];
  })) as unknown as RecordBytes;
  return bytes;
}

export async function captureExactRecordSet(input: {
  selection: RecordSetSelection;
  captured_at: string;
}): Promise<CapturedRecordSet> {
  const files = selections(input.selection);
  /*
   * The full receipt exists only ephemerally in this function so the proof
   * engine can consume the exact bytes returned by the stable descriptor-set
   * capture. Only the separately matching digest_only receipt crosses the
   * application/audit boundary.
   */
  const privateFull = await captureDocumentSnapshot({
    files: [...files],
    artifactPolicy: "full",
    capturedAt: input.captured_at,
    maxFileBytes: MAX_RECORD_BYTES,
  });
  const digestOnly = await captureDocumentSnapshot({
    files: [...files],
    artifactPolicy: "digest_only",
    capturedAt: input.captured_at,
    maxFileBytes: MAX_RECORD_BYTES,
  });
  const fullVerification = verifyDocumentSnapshotReceipt(privateFull);
  const digestVerification = verifyDocumentSnapshotReceipt(digestOnly);
  if (!fullVerification.ok || !digestVerification.ok) {
    throw new Error("The local record-set receipt failed verification.");
  }
  if (
    privateFull.snapshot.snapshot_id !== digestOnly.snapshot.snapshot_id
    || privateFull.snapshot.manifest_digest
      !== digestOnly.snapshot.manifest_digest
  ) {
    throw new Error("The private byte capture changed before redaction.");
  }
  const bytes = fullBytes(privateFull.snapshot.artifacts);
  const artifactDigests = Object.fromEntries(
    digestOnly.snapshot.artifacts.map((artifact) => [
      artifact.role,
      artifact.digest,
    ]),
  ) as Record<string, string>;
  for (const role of EXPECTED_ROLES) {
    if (sha256Bytes(bytes[role]) !== artifactDigests[role]) {
      throw new Error("Captured record bytes do not match the content-light receipt.");
    }
  }
  return {
    selection: { ...input.selection },
    receipt: digestOnly,
    bytes,
    digests: {
      invoice: artifactDigests.invoice!,
      purchase_order: artifactDigests.purchase_order!,
      receipt: artifactDigests.receipt!,
      record_set: canonicalDigest({
        version: "riddle.synthetic.invoice-record-set.v1",
        invoice_digest: artifactDigests.invoice,
        purchase_order_digest: artifactDigests.purchase_order,
        receipt_digest: artifactDigests.receipt,
      }),
    },
  };
}

export async function recaptureExactRecordSetCurrentness(input: {
  captured: CapturedRecordSet;
  checked_at: string;
}): Promise<boolean> {
  const currentness = await recaptureDocumentSnapshotCurrentness({
    expectedReceipt: input.captured.receipt,
    files: [...selections(input.captured.selection)],
    checkedAt: input.checked_at,
    maxFileBytes: MAX_RECORD_BYTES,
  });
  return currentness.status === "current";
}
