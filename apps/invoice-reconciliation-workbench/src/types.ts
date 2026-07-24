import type {
  ApplicationProjectionResult,
  ApplicationVerification,
} from "riddle-proof-application-projection-experiment";
import type {
  DocumentSnapshotReceipt,
} from "@riddledc/riddle-proof-local";

export const INVOICE_REQUIREMENT_IDS = [
  "invoice_line_extensions",
  "invoice_subtotal",
  "invoice_tax_total",
  "purchase_order_line_extensions",
  "purchase_order_subtotal",
  "purchase_order_tax_total",
  "invoice_purchase_order_identity_terms",
  "invoice_purchase_order_line_terms",
  "invoice_purchase_order_total",
  "invoice_receipt_identity",
  "invoice_receipt_quantities",
] as const;

export type InvoiceRequirementId =
  (typeof INVOICE_REQUIREMENT_IDS)[number];

export type RequirementStatus = "satisfied" | "failed" | "unresolved";
export type RecordRole = "invoice" | "purchase_order" | "receipt" | "record_set";

export interface PricedLine {
  line_id: string;
  sku: string;
  quantity: number;
  unit_price_minor: number;
  extended_minor: number;
}

export interface QuantityLine {
  line_id: string;
  sku: string;
  quantity: number;
}

export interface InvoiceRecord {
  schema: "riddle.synthetic.invoice.v1";
  buyer_id: string;
  supplier_id: string;
  invoice_id: string;
  po_id: string;
  currency: string;
  payment_terms: string;
  line_items: PricedLine[];
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  memo: string;
}

export interface PurchaseOrderRecord {
  schema: "riddle.synthetic.purchase-order.v1";
  buyer_id: string;
  supplier_id: string;
  po_id: string;
  currency: string;
  payment_terms: string;
  line_items: PricedLine[];
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
}

export interface ReceiptRecord {
  schema: "riddle.synthetic.receipt.v1";
  buyer_id: string;
  supplier_id: string;
  receipt_id: string;
  po_id: string;
  received_at: string;
  line_items: QuantityLine[];
}

export interface RecordBytes {
  invoice: Uint8Array;
  purchase_order: Uint8Array;
  receipt: Uint8Array;
}

export interface RecordDigests {
  invoice: string;
  purchase_order: string;
  receipt: string;
  record_set: string;
}

/**
 * The narrow XLSX adapter's deterministic output. The workbook and private
 * extraction trace stay in the local process; only their content-addressed
 * identities may cross into an audit projection.
 */
export interface InvoiceWorkbookExtraction {
  policy: {
    id: string;
    version: string;
    digest: string;
  };
  workbook_digest: string;
  normalized_invoice: InvoiceRecord;
  normalized_invoice_bytes: Uint8Array;
  normalized_invoice_digest: string;
  private_trace_digest: string;
  binding_digest: string;
}

export interface SpecimenRecordSetDigests {
  invoice_workbook: string;
  normalized_invoice: string;
  normalized_record_set: string;
  extraction_binding: string;
  record_set: string;
}

export interface ReconciliationDifference {
  field: string;
  observed: string | number;
  expected: string | number;
}

export interface ReconciliationCheck {
  requirement_id: InvoiceRequirementId;
  status: Exclude<RequirementStatus, "unresolved">;
  record_role: RecordRole;
  evidence_roles: readonly RecordRole[];
  differences: readonly ReconciliationDifference[];
  detail_digest: string;
}

export interface ParsedRecordSet {
  invoice: InvoiceRecord;
  purchase_order: PurchaseOrderRecord;
  receipt: ReceiptRecord;
  digests: RecordDigests;
}

export interface ReconciliationAnalysis {
  records: ParsedRecordSet;
  checks: readonly ReconciliationCheck[];
}

export const INVOICE_CORRECTION_KIND =
  "align_invoice_line_to_ordered_and_received_quantity" as const;

export interface TypedInvoiceCorrection {
  version: "riddle.synthetic.invoice-correction.v1";
  kind: typeof INVOICE_CORRECTION_KIND;
  base_invoice_digest: string;
  purchase_order_digest: string;
  receipt_digest: string;
  line_id: string;
  sku: string;
  from_quantity: number;
  to_quantity: number;
  from_extended_minor: number;
  to_extended_minor: number;
  from_subtotal_minor: number;
  to_subtotal_minor: number;
  from_tax_minor: number;
  to_tax_minor: number;
  from_total_minor: number;
  to_total_minor: number;
}

export interface RecordSetSelection {
  invoice_workbook_path: string;
  purchase_order_path: string;
  receipt_path: string;
  revision: string;
}

export interface CapturedRecordSet {
  selection: RecordSetSelection;
  receipt: DocumentSnapshotReceipt;
  invoice_workbook_bytes: Uint8Array;
  invoice_workbook_extraction: InvoiceWorkbookExtraction;
  bytes: RecordBytes;
  /**
   * Normalized JSON identities consumed by the existing reconciliation proof.
   * `record_set` deliberately retains its original meaning.
   */
  digests: RecordDigests;
  /**
   * Outer immutable-specimen identity. This also changes for a byte-distinct
   * workbook that normalizes to identical invoice facts.
   */
  specimen_digests: SpecimenRecordSetDigests;
}

export interface ReconciliationProofResult {
  projection: ApplicationProjectionResult;
  verification: ApplicationVerification;
  analysis: ReconciliationAnalysis;
  /**
   * Authoritative replay object. It can contain inline synthetic record bytes
   * and must never be serialized by the ordinary or audit UI projections.
   */
  authoritative_closure: unknown;
  certificate_ids: Readonly<Record<InvoiceRequirementId, string>>;
  reusable_certificate_ids: {
    purchase_order: readonly string[];
    receipt: readonly string[];
  };
  /**
   * How each digest-stable branch was obtained for this proof. A cached branch
   * is refreshed once its grounded capture is older than the proof freshness
   * window, even when its source bytes are unchanged.
   */
  reusable_branch_actions: {
    purchase_order: "new" | "reused" | "refreshed" | "recomputed";
    receipt: "new" | "reused" | "refreshed" | "recomputed";
  };
  audit: {
    snapshot_receipt: DocumentSnapshotReceipt;
    policy: {
      id: string;
      version: string;
      digest: string;
    };
    signed_bundle_ids: readonly string[];
    nonce_ids: readonly string[];
  };
}

export interface WorkbenchClock {
  now(): string;
}

export interface WorkbenchSigningKey {
  key_id: string;
  private_key_pkcs8_base64: string;
  public_key_spki_base64: string;
}

export interface WorkbenchPaths {
  root: string;
  records: string;
}
