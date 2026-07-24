import type {
  ApplicationAuthority,
  ApplicationSubjectRef,
  JsonValue,
} from "../src/types.js";

export const COMMERCIAL_RECORD_ROOT = {
  claim_id:
    "riddle-proof.commercial-record.captured-fields-agree-under-policy",
  claim_version: "1",
} as const;

export const COMMERCIAL_RECORD_REQUIREMENT_CLAIMS = [
  {
    requirement_id: "invoice_arithmetic_consistent",
    claim_id:
      "riddle-proof.commercial-record.invoice-captured-arithmetic-consistent",
    claim_version: "1",
  },
  {
    requirement_id: "purchase_order_arithmetic_consistent",
    claim_id:
      "riddle-proof.commercial-record.purchase-order-captured-consistent",
    claim_version: "1",
  },
  {
    requirement_id: "receipt_captured",
    claim_id: "riddle-proof.commercial-record.receipt-captured",
    claim_version: "1",
  },
  {
    requirement_id: "payment_captured",
    claim_id: "riddle-proof.commercial-record.payment-record-captured",
    claim_version: "1",
  },
  {
    requirement_id: "invoice_register_entry_counted",
    claim_id:
      "riddle-proof.commercial-record.invoice-register-entry-counted",
    claim_version: "1",
  },
  {
    requirement_id: "invoice_purchase_order_terms_match",
    claim_id:
      "riddle-proof.commercial-record.invoice-purchase-order-terms-match",
    claim_version: "1",
  },
  {
    requirement_id: "invoice_receipt_quantities_match",
    claim_id:
      "riddle-proof.commercial-record.invoice-receipt-quantities-match",
    claim_version: "1",
  },
  {
    requirement_id: "invoice_payment_amount_match",
    claim_id:
      "riddle-proof.commercial-record.invoice-payment-amount-match",
    claim_version: "1",
  },
  {
    requirement_id: "invoice_identity_unique",
    claim_id:
      "riddle-proof.commercial-record.invoice-identity-unique-in-register",
    claim_version: "1",
  },
] as const;

const LABELS_AND_GUIDANCE = {
  invoice_arithmetic_consistent: [
    "Invoice line extensions, subtotal, tax, and total are internally consistent",
    "The invoice arithmetic is not internally consistent.",
    "Correct the invoice arithmetic and capture the revised invoice.",
  ],
  purchase_order_arithmetic_consistent: [
    "Purchase-order line extensions, subtotal, tax, and total are internally consistent",
    "The purchase-order arithmetic is not internally consistent.",
    "Correct the purchase-order arithmetic or select the intended purchase order.",
  ],
  receipt_captured: [
    "The receipt quantities were captured",
    "The required receipt quantities were not established.",
    "Capture the receipt record required by the pinned policy.",
  ],
  payment_captured: [
    "The posted payment record was captured",
    "The required posted payment record was not established.",
    "Capture the posted payment record required by the pinned policy.",
  ],
  invoice_register_entry_counted: [
    "The invoice identity was counted in the supplied register",
    "The invoice identity count was not established in the supplied register.",
    "Supply the intended invoice-register snapshot and capture it again.",
  ],
  invoice_purchase_order_terms_match: [
    "Invoice and purchase-order terms match under the pinned policy",
    "The invoice and purchase-order terms do not match under the pinned policy.",
    "Bring the invoice terms into agreement with the selected purchase order or resolve the mismatch.",
  ],
  invoice_receipt_quantities_match: [
    "Invoice and receipt quantities match under the pinned policy",
    "The invoice and receipt quantities do not match under the pinned policy.",
    "Correct the invoice quantities or resolve the receiving discrepancy.",
  ],
  invoice_payment_amount_match: [
    "Invoice and posted-payment amounts match under the pinned policy",
    "The invoice and posted-payment amounts do not match under the pinned policy.",
    "Correct the invoice or resolve the payment mismatch.",
  ],
  invoice_identity_unique: [
    "The invoice identity occurs exactly once in the supplied register",
    "The invoice identity is not unique in the supplied register.",
    "Resolve the duplicate or supply the intended complete register snapshot.",
  ],
} as const;

export function createCommercialRecordAuthority(input: {
  authority_digest: string;
  policy_id: string;
  policy_version: string;
  policy_digest: string;
  expected_root_parameters: Readonly<Record<string, JsonValue>>;
}): ApplicationAuthority {
  return {
    authority_id: "riddle-proof.example.synthetic-commercial-records",
    authority_version: "1",
    authority_digest: input.authority_digest,
    specification: {
      ref: {
        id: input.policy_id,
        version: input.policy_version,
        digest: input.policy_digest,
      },
      expected_root: {
        ...COMMERCIAL_RECORD_ROOT,
        parameters: input.expected_root_parameters,
      },
      requirements: COMMERCIAL_RECORD_REQUIREMENT_CLAIMS.map(
        ({ requirement_id }) => ({
          requirement_id,
          label: LABELS_AND_GUIDANCE[requirement_id][0],
          failure_summary: LABELS_AND_GUIDANCE[requirement_id][1],
          repair_guidance: LABELS_AND_GUIDANCE[requirement_id][2],
        }),
      ),
      non_conclusions: [
        "record authenticity",
        "authorization",
        "legal validity",
        "fraud absence",
        "completeness outside the supplied register",
        "approval to pay",
        "actual movement of money",
      ],
    },
  };
}

export function createCommercialRecordSubject(input: {
  reconciliation_scope: string;
  record_set_digest: string;
}): ApplicationSubjectRef {
  return {
    id: input.reconciliation_scope,
    digest: input.record_set_digest,
    kind: "commercial_record_set",
  };
}
