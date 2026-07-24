import {
  captureDocumentSnapshot,
  recaptureDocumentSnapshotCurrentness,
  verifyDocumentSnapshotReceipt,
  type DocumentSnapshotArtifact,
} from "@riddledc/riddle-proof-local";

import {
  canonicalDigest,
  canonicalPrettyJson,
  sha256Bytes,
} from "./canonical.js";
import type {
  CapturedRecordSet,
  InvoiceWorkbookExtraction,
  RecordBytes,
  RecordSetSelection,
} from "./types.js";
import {
  computeInvoiceWorkbookSpecimenDigest,
} from "./specimen.js";
import {
  SYNTHETIC_XLSX_INVOICE_POLICY,
  extractSyntheticInvoiceWorkbook,
} from "./xlsx.js";

const EXPECTED_ROLES = [
  "invoice_workbook",
  "purchase_order",
  "receipt",
] as const;
const MAX_RECORD_BYTES = 4 * 1024 * 1024;

type CapturedSourceBytes = {
  invoice_workbook: Uint8Array;
  purchase_order: Uint8Array;
  receipt: Uint8Array;
};

function selections(input: RecordSetSelection) {
  return [
    {
      role: "invoice_workbook",
      path: input.invoice_workbook_path,
      mediaType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
): CapturedSourceBytes {
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
  })) as unknown as CapturedSourceBytes;
  return bytes;
}

function assertExtractionMatchesCapturedWorkbook(input: {
  extraction: InvoiceWorkbookExtraction;
  workbook_bytes: Uint8Array;
}): void {
  const canonicalInvoiceBytes = Buffer.from(
    canonicalPrettyJson(input.extraction.normalized_invoice),
    "utf8",
  );
  if (
    input.extraction.policy.id !== SYNTHETIC_XLSX_INVOICE_POLICY.id
    || input.extraction.policy.version
      !== SYNTHETIC_XLSX_INVOICE_POLICY.version
    || input.extraction.policy.digest
      !== SYNTHETIC_XLSX_INVOICE_POLICY.digest
    || input.extraction.workbook_digest
      !== sha256Bytes(input.workbook_bytes)
    || input.extraction.normalized_invoice_digest
      !== sha256Bytes(input.extraction.normalized_invoice_bytes)
    || !Buffer.from(input.extraction.normalized_invoice_bytes)
      .equals(canonicalInvoiceBytes)
  ) {
    throw new Error(
      "The XLSX extraction did not bind the captured workbook to one canonical invoice.",
    );
  }
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
  const sourceBytes = fullBytes(privateFull.snapshot.artifacts);
  const artifactDigests = Object.fromEntries(
    digestOnly.snapshot.artifacts.map((artifact) => [
      artifact.role,
      artifact.digest,
    ]),
  ) as Record<string, string>;
  for (const role of EXPECTED_ROLES) {
    if (sha256Bytes(sourceBytes[role]) !== artifactDigests[role]) {
      throw new Error("Captured record bytes do not match the content-light receipt.");
    }
  }
  const extraction = extractSyntheticInvoiceWorkbook(
    sourceBytes.invoice_workbook,
  );
  assertExtractionMatchesCapturedWorkbook({
    extraction,
    workbook_bytes: sourceBytes.invoice_workbook,
  });
  if (
    artifactDigests.invoice_workbook !== extraction.workbook_digest
  ) {
    throw new Error(
      "The XLSX extraction does not identify the captured workbook artifact.",
    );
  }
  const bytes: RecordBytes = {
    invoice: Buffer.from(extraction.normalized_invoice_bytes),
    purchase_order: Buffer.from(sourceBytes.purchase_order),
    receipt: Buffer.from(sourceBytes.receipt),
  };
  const normalizedDigests = {
    invoice: extraction.normalized_invoice_digest,
    purchase_order: artifactDigests.purchase_order!,
    receipt: artifactDigests.receipt!,
  };
  const normalizedRecordSetDigest = canonicalDigest({
    version: "riddle.synthetic.invoice-record-set.v1",
    invoice_digest: normalizedDigests.invoice,
    purchase_order_digest: normalizedDigests.purchase_order,
    receipt_digest: normalizedDigests.receipt,
  });
  const specimenRecordSetDigest = computeInvoiceWorkbookSpecimenDigest({
    workbook_policy: extraction.policy,
    workbook_digest: extraction.workbook_digest,
    normalized_invoice_digest: extraction.normalized_invoice_digest,
    normalized_record_set_digest: normalizedRecordSetDigest,
    extraction_binding_digest: extraction.binding_digest,
  });
  return {
    selection: { ...input.selection },
    receipt: digestOnly,
    invoice_workbook_bytes: Buffer.from(sourceBytes.invoice_workbook),
    invoice_workbook_extraction: extraction,
    bytes,
    digests: {
      ...normalizedDigests,
      record_set: normalizedRecordSetDigest,
    },
    specimen_digests: {
      invoice_workbook: extraction.workbook_digest,
      normalized_invoice: extraction.normalized_invoice_digest,
      normalized_record_set: normalizedRecordSetDigest,
      extraction_binding: extraction.binding_digest,
      record_set: specimenRecordSetDigest,
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
