import type {
  ApplicationAuthority,
  ApplicationRequirementDefinition,
} from "riddle-proof-application-projection-experiment";

import { canonicalDigest, deepFreeze } from "./canonical.js";
import {
  INVOICE_REQUIREMENT_IDS,
  type InvoiceRequirementId,
} from "./types.js";

export const INVOICE_RECONCILIATION_STATUS_CLAIM = {
  claim_id: "riddle-proof.commercial-record.invoice-reconciliation-status-report",
  claim_version: "1",
} as const;

export const INVOICE_RECONCILIATION_SUCCESS_CLAIM = {
  claim_id: "riddle-proof.commercial-record.invoice-po-receipt-match",
  claim_version: "1",
} as const;

export const INVOICE_NORMALIZED_RECONCILIATION_STATUS_CLAIM = {
  claim_id:
    "riddle-proof.private.commercial-record.normalized-invoice-reconciliation-status-report",
  claim_version: "1",
} as const;

export const INVOICE_REQUIREMENT_STATUS_CLAIM = {
  claim_id: "riddle-proof.commercial-record.invoice-requirement-status",
  claim_version: "1",
} as const;

export const INVOICE_RECORD_SET_BINDING_CLAIM = {
  claim_id: "riddle-proof.commercial-record.invoice-record-set-bound",
  claim_version: "1",
} as const;

export const INVOICE_WORKBOOK_EXTRACTION_BINDING_CLAIM = {
  claim_id:
    "riddle-proof.private.commercial-record.invoice-workbook-extraction-bound",
  claim_version: "1",
} as const;

const REQUIREMENT_TEXT: Readonly<
  Record<
    InvoiceRequirementId,
    {
      label: string;
      failure_summary: string;
      repair_guidance: string;
    }
  >
> = {
  invoice_line_extensions: {
    label: "Invoice line extensions equal quantity × unit price",
    failure_summary: "One or more invoice line extensions are arithmetically incorrect.",
    repair_guidance: "Correct the affected invoice line arithmetic and capture a new invoice revision.",
  },
  invoice_subtotal: {
    label: "Invoice subtotal equals the sum of stated line extensions",
    failure_summary: "The invoice subtotal does not equal its stated line extensions.",
    repair_guidance: "Correct the invoice subtotal and capture a new invoice revision.",
  },
  invoice_tax_total: {
    label: "Invoice subtotal plus stated tax equals stated total",
    failure_summary: "The invoice total does not equal its subtotal plus its stated tax.",
    repair_guidance: "Correct the stated invoice tax or total and capture a new invoice revision.",
  },
  purchase_order_line_extensions: {
    label: "Purchase-order line extensions equal quantity × unit price",
    failure_summary: "One or more purchase-order line extensions are arithmetically incorrect.",
    repair_guidance: "Select or correct the intended purchase order before reconciling the invoice.",
  },
  purchase_order_subtotal: {
    label: "Purchase-order subtotal equals the sum of stated line extensions",
    failure_summary: "The purchase-order subtotal does not equal its stated line extensions.",
    repair_guidance: "Select or correct the intended purchase order before reconciling the invoice.",
  },
  purchase_order_tax_total: {
    label: "Purchase-order subtotal plus stated tax equals stated total",
    failure_summary: "The purchase-order total does not equal its subtotal plus its stated tax.",
    repair_guidance: "Select or correct the intended purchase order before reconciling the invoice.",
  },
  invoice_purchase_order_identity_terms: {
    label: "Invoice and purchase-order identities, currency, and payment terms agree",
    failure_summary: "The invoice and purchase order disagree on identity, currency, or payment terms.",
    repair_guidance: "Select the intended purchase order or bring the invoice identifiers and terms into exact agreement.",
  },
  invoice_purchase_order_line_terms: {
    label: "Invoice and purchase-order line identities, quantities, and prices agree",
    failure_summary: "The invoice lines do not exactly match the selected purchase order.",
    repair_guidance: "Bring the invoice line terms into agreement with the selected purchase order or resolve the discrepancy.",
  },
  invoice_purchase_order_total: {
    label: "Invoice and purchase-order totals agree",
    failure_summary: "The invoice total does not equal the selected purchase-order total.",
    repair_guidance: "Correct the invoice or resolve the purchase-order total discrepancy.",
  },
  invoice_receipt_identity: {
    label: "Invoice and receipt buyer, supplier, and purchase-order identities agree",
    failure_summary: "The invoice and receipt do not identify the same buyer, supplier, and purchase order.",
    repair_guidance: "Select the intended receipt or resolve the record-identity discrepancy.",
  },
  invoice_receipt_quantities: {
    label: "Invoice quantities equal the exact received quantities",
    failure_summary: "The invoice quantities do not exactly match the supplied receipt.",
    repair_guidance: "Correct the invoice quantities or resolve the receiving discrepancy.",
  },
};

export const INVOICE_POLICY_DEFINITION = deepFreeze({
  schema: "riddle-proof.synthetic-invoice-reconciliation-policy.v1",
  policy_id: "riddle-proof.synthetic-invoice-exact-three-way-match",
  policy_version: "1",
  currency_units: "integer minor units only",
  line_association: "ordered exact line_id and SKU equality",
  matching: "exact; no tolerances, partial receipt allocation, credits, or foreign exchange",
  correction: {
    kind: "align one invoice line to a PO and receipt quantity that already agree",
    creates_new_invoice: true,
    mutates_source_files: false,
  },
  requirements: INVOICE_REQUIREMENT_IDS.map((requirementId) => ({
    requirement_id: requirementId,
    ...REQUIREMENT_TEXT[requirementId],
  })),
  non_conclusions: [
    "record authenticity",
    "authorization",
    "legal validity",
    "tax-rate or tax-law correctness",
    "fraud absence",
    "completeness outside the three supplied records",
    "approval to pay",
    "actual movement of money",
    "faithful extraction from PDF, DOCX, email, image, OCR, or any XLSX layout other than the separately pinned synthetic invoice-workbook profile",
  ],
});

export const INVOICE_POLICY = deepFreeze({
  id: INVOICE_POLICY_DEFINITION.policy_id,
  version: INVOICE_POLICY_DEFINITION.policy_version,
  digest: canonicalDigest(INVOICE_POLICY_DEFINITION),
});

export const INVOICE_REQUIREMENTS: readonly ApplicationRequirementDefinition[] =
  deepFreeze(
    INVOICE_REQUIREMENT_IDS.map((requirementId) => ({
      requirement_id: requirementId,
      ...REQUIREMENT_TEXT[requirementId],
    })),
  );

export function createInvoiceApplicationAuthority(
  recordSetDigest: string,
): ApplicationAuthority {
  const specification = {
    ref: {
      id: INVOICE_POLICY.id,
      version: INVOICE_POLICY.version,
      digest: INVOICE_POLICY.digest,
    },
    expected_root: {
      ...INVOICE_RECONCILIATION_SUCCESS_CLAIM,
      parameters: {
        policy_id: INVOICE_POLICY.id,
        policy_version: INVOICE_POLICY.version,
        policy_digest: INVOICE_POLICY.digest,
        record_set_digest: recordSetDigest,
      },
    },
    requirements: INVOICE_REQUIREMENTS,
    non_conclusions: INVOICE_POLICY_DEFINITION.non_conclusions,
  } as const;
  return deepFreeze({
    authority_id: "riddle-proof.private.invoice-reconciliation-workbench",
    authority_version: "1",
    authority_digest: canonicalDigest({
      authority_id: "riddle-proof.private.invoice-reconciliation-workbench",
      authority_version: "1",
      specification,
    }),
    specification,
  });
}
