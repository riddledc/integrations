const requirements = [
  "Every invoice line amount equals quantity multiplied by unit price.",
  "Invoice subtotal, tax, and total are internally consistent.",
  "Invoice and purchase order use the same currency, terms, items, quantities, prices, and total.",
  "Invoice and receipt identify the same buyer, supplier, purchase order, items, and quantities.",
];

const boundaries = [
  "Whether any record is authentic or authorized",
  "Whether the tax treatment is legally or accounting-correct",
  "Whether the invoice should be approved or paid",
  "Whether records outside this selected set are complete",
];

const task = {
  title: "Reconcile invoice INV-1001",
  description:
    "Check the synthetic invoice’s arithmetic and exact agreement with purchase order PO-7001 and receipt RCPT-9001.",
  requirements,
};

const purchaseOrder = {
  kind: "purchase_order",
  label: "Purchase order",
  document_id: "PO-7001",
  revision: "PO · captured once",
  status: "Captured",
  metadata: [
    { label: "Buyer", value: "Acme" },
    { label: "Supplier", value: "Lumen" },
    { label: "Terms", value: "NET 30" },
    { label: "Currency", value: "USD" },
  ],
  lines: [
    {
      line_id: "1",
      item: "WIDGET-A",
      quantity: "2",
      unit_price: "$12.50",
      amount: "$25.00",
    },
    {
      line_id: "2",
      item: "SERVICE-B",
      quantity: "1",
      unit_price: "$50.00",
      amount: "$50.00",
    },
  ],
  totals: [
    { label: "Subtotal", value: "$75.00" },
    { label: "Tax", value: "$6.00" },
    { label: "Total", value: "$81.00", emphasis: true },
  ],
};

const receipt = {
  kind: "receipt",
  label: "Receipt",
  document_id: "RCPT-9001",
  revision: "Receipt · captured once",
  status: "Captured",
  metadata: [
    { label: "Buyer", value: "Acme" },
    { label: "Supplier", value: "Lumen" },
    { label: "PO", value: "PO-7001" },
    { label: "Received", value: "July 22, 2026" },
  ],
  lines: [
    {
      line_id: "1",
      item: "WIDGET-A",
      quantity: "2",
      unit_price: "—",
      amount: "—",
    },
    {
      line_id: "2",
      item: "SERVICE-B",
      quantity: "1",
      unit_price: "—",
      amount: "—",
    },
  ],
  totals: [],
};

function invoice(revised) {
  return {
    kind: "invoice",
    label: "Invoice",
    document_id: "INV-1001",
    revision: revised ? "Invoice revision 2" : "Invoice revision 1",
    status: revised ? "Corrected" : "Mismatch found",
    metadata: [
      { label: "Buyer", value: "Acme" },
      { label: "Supplier", value: "Lumen" },
      { label: "PO", value: "PO-7001" },
      { label: "Terms", value: "NET 30" },
    ],
    lines: [
      {
        line_id: "1",
        item: "WIDGET-A",
        quantity: revised ? "2" : "3",
        unit_price: "$12.50",
        amount: revised ? "$25.00" : "$37.50",
      },
      {
        line_id: "2",
        item: "SERVICE-B",
        quantity: "1",
        unit_price: "$50.00",
        amount: "$50.00",
      },
    ],
    totals: [
      {
        label: "Subtotal",
        value: revised ? "$75.00" : "$87.50",
      },
      { label: "Tax", value: revised ? "$6.00" : "$7.00" },
      {
        label: "Total",
        value: revised ? "$81.00" : "$94.50",
        emphasis: true,
      },
    ],
  };
}

const initialCorrection = {
  available: true,
  label: "Create corrected invoice revision",
  reason:
    "The typed correction brings only the invoice quantity and dependent amounts into exact agreement with the unchanged purchase order and receipt.",
  changes: [
    {
      field: "line_items[0].quantity",
      label: "WIDGET-A quantity",
      from: "3",
      to: "2",
    },
    {
      field: "line_items[0].extended_minor",
      label: "WIDGET-A line amount",
      from: "$37.50",
      to: "$25.00",
    },
    {
      field: "subtotal_minor",
      label: "Subtotal",
      from: "$87.50",
      to: "$75.00",
    },
    {
      field: "tax_minor",
      label: "Tax",
      from: "$7.00",
      to: "$6.00",
    },
    {
      field: "total_minor",
      label: "Total",
      from: "$94.50",
      to: "$81.00",
    },
  ],
};

const failingCheck = {
  check_ref: "check:invoice-r1:attempt-1",
  disposition: "does_not_conform",
  current: true,
  headline: "The invoice is internally correct, but it does not match",
  summary:
    "Invoice quantity 3 for WIDGET-A conflicts with ordered and received quantity 2. The difference raises the invoice total from $81.00 to $94.50.",
  next_action:
    "Use the exact invoice-only correction below, then check the new immutable revision.",
  findings: [
    {
      requirement_id: "invoice_purchase_order_line_terms",
      label: "Invoice quantity differs from the purchase order",
      explanation:
        "INV-1001 lists 3 × WIDGET-A; PO-7001 orders 2 × WIDGET-A.",
      sources: ["Invoice INV-1001", "Purchase order PO-7001"],
      repair_guidance:
        "Change only the invoice quantity and amounts derived from it.",
    },
    {
      requirement_id: "invoice_purchase_order_total",
      label: "Invoice total differs from the purchase order",
      explanation:
        "INV-1001 totals $94.50; PO-7001 totals $81.00.",
      sources: ["Invoice INV-1001", "Purchase order PO-7001"],
      repair_guidance:
        "Correct only the invoice amounts derived from the quantity difference.",
    },
    {
      requirement_id: "invoice_receipt_quantities",
      label: "Invoice quantity differs from the receipt",
      explanation:
        "INV-1001 lists 3 × WIDGET-A; RCPT-9001 records 2 × WIDGET-A received.",
      sources: ["Invoice INV-1001", "Receipt RCPT-9001"],
      repair_guidance:
        "Use received quantity 2 unless the receiving record is resolved separately.",
    },
  ],
  passed_checks: [
    {
      requirement_id: "invoice_line_extensions",
      label: "Invoice line amounts are correct",
      explanation: "3 × $12.50 = $37.50 and 1 × $50.00 = $50.00.",
      sources: ["Invoice INV-1001"],
    },
    {
      requirement_id: "invoice_subtotal",
      label: "Invoice subtotal is correct",
      explanation:
        "$37.50 + $50.00 = $87.50.",
      sources: ["Invoice INV-1001"],
    },
    {
      requirement_id: "invoice_tax_total",
      label: "Invoice subtotal, stated tax, and total are correct",
      explanation: "$87.50 + $7.00 stated tax = $94.50.",
      sources: ["Invoice INV-1001"],
    },
    {
      requirement_id: "purchase_order_line_extensions",
      label: "Purchase-order line amounts are correct",
      explanation: "2 × $12.50 = $25.00 and 1 × $50.00 = $50.00.",
      sources: ["Purchase order PO-7001"],
    },
    {
      requirement_id: "invoice_purchase_order_identity_terms",
      label: "Invoice and purchase-order identities and terms agree",
      explanation:
        "Buyer, supplier, PO identity, currency, and NET 30 terms match.",
      sources: ["Invoice INV-1001", "Purchase order PO-7001"],
    },
    {
      requirement_id: "invoice_receipt_identity",
      label: "Invoice and receipt identities agree",
      explanation:
        "Buyer, supplier, purchase-order identity, and line identities match.",
      sources: ["Invoice INV-1001", "Receipt RCPT-9001"],
    },
  ],
  non_conclusions: boundaries,
};

const conformingCheck = {
  check_ref: "check:invoice-r2:attempt-1",
  disposition: "conforms",
  current: true,
  headline: "The invoice, purchase order, and receipt agree",
  summary:
    "All selected arithmetic and exact-match requirements hold for invoice revision 2 under the installed synthetic policy.",
  next_action:
    "No correction is needed for this selected record set. Review Audit only if you need exact proof identities.",
  findings: [],
  passed_checks: [
    {
      requirement_id: "invoice_line_extensions",
      label: "Invoice line amounts are correct",
      explanation:
        "2 × $12.50 = $25.00 and 1 × $50.00 = $50.00.",
      sources: ["Invoice INV-1001 · revision 2"],
    },
    {
      requirement_id: "invoice_purchase_order_line_terms",
      label: "Invoice and purchase order match exactly",
      explanation:
        "Currency, terms, items, quantities, unit prices, and total agree.",
      sources: ["Invoice INV-1001", "Purchase order PO-7001"],
    },
    {
      requirement_id: "invoice_receipt_quantities",
      label: "Invoice and receipt quantities match exactly",
      explanation: "Both records show 2 × WIDGET-A and 1 × SERVICE-B.",
      sources: ["Invoice INV-1001", "Receipt RCPT-9001"],
    },
  ],
  non_conclusions: boundaries,
};

function historyEntry(check, current, reused, recomputed) {
  return {
    check_ref: check.check_ref,
    record_set_ref: check === failingCheck
      ? "record-set:case-001:r1"
      : "record-set:case-001:r2",
    revision: check === failingCheck ? "Revision 1" : "Revision 2",
    attempt: "Attempt 1",
    disposition: check.disposition,
    current,
    headline: check.headline,
    checked_at: check === failingCheck
      ? "2026-07-24T14:00:00.000Z"
      : "2026-07-24T14:02:00.000Z",
    reused_branch_count: reused,
    recomputed_branch_count: recomputed,
  };
}

export function readyState() {
  return {
    task,
    record_set: {
      record_set_ref: "record-set:case-001:r1",
      label: "Case 001 · three selected records",
      revision: "Revision 1",
      attempt: "Attempt 1",
      records: [invoice(false), purchaseOrder, receipt],
    },
    current_check: null,
    correction: { available: false, changes: [] },
    reuse: { branches: [] },
    last_activity: null,
    can_check: true,
    can_correct: false,
    history: [],
  };
}

export function checkedFailingState() {
  return {
    ...readyState(),
    current_check: failingCheck,
    correction: initialCorrection,
    can_check: false,
    can_correct: true,
    history: [historyEntry(failingCheck, true, 0, 5)],
  };
}

export function correctedReadyState() {
  const first = historyEntry(failingCheck, false, 0, 5);
  return {
    task,
    record_set: {
      record_set_ref: "record-set:case-001:r2",
      label: "Case 001 · three selected records",
      revision: "Revision 2",
      attempt: "Attempt 1",
      records: [invoice(true), purchaseOrder, receipt],
    },
    current_check: null,
    correction: { available: false, changes: [] },
    reuse: {
      summary:
        "The invoice changed. The purchase order and receipt bytes remain unchanged; proof reuse will be established by the fresh check.",
      branches: [
        {
          branch_id: "purchase-order-capture",
          label: "Purchase-order capture",
          action: "unchanged",
          reason: "PO-7001 was not edited.",
        },
        {
          branch_id: "receipt-capture",
          label: "Receipt capture",
          action: "unchanged",
          reason: "RCPT-9001 was not edited.",
        },
        {
          branch_id: "invoice-capture",
          label: "Invoice capture and arithmetic",
          action: "new",
          reason: "Invoice revision 2 must be captured and checked independently.",
        },
      ],
    },
    last_activity: {
      kind: "invoice_correction",
      summary:
        "Created invoice revision 2; purchase order and receipt stayed unchanged.",
      revision: "Revision 2",
      attempt: "Attempt 1",
    },
    can_check: true,
    can_correct: false,
    history: [first],
  };
}

export function checkedConformingState() {
  return {
    ...correctedReadyState(),
    current_check: conformingCheck,
    reuse: {
      summary:
        "Two independent grounded branches were reused exactly. Only the changed invoice and its dependent comparisons were checked again.",
      branches: [
        {
          branch_id: "purchase-order-capture",
          label: "Purchase-order capture",
          action: "reused",
          reason: "Same immutable PO bytes and certificate identity.",
        },
        {
          branch_id: "receipt-capture",
          label: "Receipt capture",
          action: "reused",
          reason: "Same immutable receipt bytes and certificate identity.",
        },
        {
          branch_id: "invoice-capture",
          label: "Invoice capture and arithmetic",
          action: "recomputed",
          reason: "Revision 2 has a new immutable invoice identity.",
        },
        {
          branch_id: "invoice-to-purchase-order",
          label: "Invoice ↔ purchase-order match",
          action: "recomputed",
          reason: "This relationship depends on the changed invoice.",
        },
        {
          branch_id: "invoice-to-receipt",
          label: "Invoice ↔ receipt quantity match",
          action: "recomputed",
          reason: "This relationship depends on the changed invoice.",
        },
        {
          branch_id: "three-record-root",
          label: "Three-record agreement",
          action: "recomputed",
          reason: "The composed conclusion binds the revised invoice.",
        },
      ],
    },
    can_check: false,
    history: [
      historyEntry(failingCheck, false, 0, 5),
      historyEntry(conformingCheck, true, 2, 4),
    ],
  };
}

export function auditFor(checkRef) {
  if (
    checkRef !== failingCheck.check_ref
    && checkRef !== conformingCheck.check_ref
  ) {
    return null;
  }
  const revised = checkRef === conformingCheck.check_ref;
  return {
    check_ref: checkRef,
    record_set_ref: revised
      ? "record-set:case-001:r2"
      : "record-set:case-001:r1",
    authority: {
      id: "synthetic-three-record-exact-match",
      version: "1",
      digest: `sha256:${"a".repeat(64)}`,
    },
    proof: {
      root_certificate_id: revised
        ? "certificate:three-record:r2"
        : "certificate:negative-report:r1",
      nonce: revised ? "synthetic-nonce-r2" : "synthetic-nonce-r1",
      signature: `ed25519:${"b".repeat(86)}`,
      replayed_at: revised
        ? "2026-07-24T14:02:00.000Z"
        : "2026-07-24T14:00:00.000Z",
    },
    selective_reuse: revised
      ? {
          reused_certificate_ids: [
            "certificate:purchase-order:1",
            "certificate:receipt:1",
          ],
          recomputed_certificate_ids: [
            "certificate:invoice:2",
            "certificate:invoice-to-po:2",
            "certificate:invoice-to-receipt:2",
            "certificate:three-record:2",
          ],
        }
      : null,
  };
}
