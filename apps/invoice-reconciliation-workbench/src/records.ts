import { isDeepStrictEqual } from "node:util";

import {
  canonicalDigest,
  canonicalPrettyJson,
  jsonClone,
  sha256Bytes,
} from "./canonical.js";
import {
  INVOICE_CORRECTION_KIND,
  INVOICE_REQUIREMENT_IDS,
  type InvoiceRecord,
  type InvoiceRequirementId,
  type ParsedRecordSet,
  type PricedLine,
  type PurchaseOrderRecord,
  type QuantityLine,
  type ReceiptRecord,
  type ReconciliationAnalysis,
  type ReconciliationCheck,
  type ReconciliationDifference,
  type RecordBytes,
  type RecordDigests,
  type RecordRole,
  type TypedInvoiceCorrection,
} from "./types.js";

const decoder = new TextDecoder("utf-8", { fatal: true });
const CURRENCY = /^[A-Z]{3}$/u;
const MAX_RECORD_BYTES = 4 * 1024 * 1024;
const MAX_LINES = 1_000;

export class RecordInputError extends Error {
  readonly code: string;

  constructor(code: string) {
    super("The selected structured record could not be checked.");
    this.name = "RecordInputError";
    this.code = code;
  }
}

function fail(code: string): never {
  throw new RecordInputError(code);
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactObject(
  value: unknown,
  keys: readonly string[],
  code: string,
): Record<string, unknown> {
  if (!plainObject(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (!isDeepStrictEqual(actual, expected)) fail(code);
  return value;
}

function stringValue(value: unknown, code: string): string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.trim() !== value
    || value.length > 4_096
  ) {
    fail(code);
  }
  return value;
}

function safeInteger(
  value: unknown,
  code: string,
  minimum = 0,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) fail(code);
  return value as number;
}

function parseJson(bytes: Uint8Array, code: string): unknown {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 2) fail(code);
  if (bytes.byteLength > MAX_RECORD_BYTES) fail(`${code}_too_large`);
  try {
    return JSON.parse(decoder.decode(bytes)) as unknown;
  } catch {
    fail(code);
  }
}

function parsePricedLines(value: unknown, prefix: string): PricedLine[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_LINES) {
    fail(`${prefix}_shape_invalid`);
  }
  const lineIds = new Set<string>();
  const skus = new Set<string>();
  return value.map((entry, index) => {
    const line = exactObject(entry, [
      "line_id",
      "sku",
      "quantity",
      "unit_price_minor",
      "extended_minor",
    ], `${prefix}_line_shape_invalid`);
    const lineId = stringValue(
      line.line_id,
      `${prefix}_line_id_invalid`,
    );
    const sku = stringValue(line.sku, `${prefix}_sku_invalid`);
    if (lineIds.has(lineId) || skus.has(sku)) {
      fail(`${prefix}_line_identity_duplicate`);
    }
    lineIds.add(lineId);
    skus.add(sku);
    const quantity = safeInteger(
      line.quantity,
      `${prefix}_quantity_invalid`,
      1,
    );
    const unitPrice = safeInteger(
      line.unit_price_minor,
      `${prefix}_unit_price_invalid`,
    );
    const extended = safeInteger(
      line.extended_minor,
      `${prefix}_extended_invalid`,
    );
    if (!Number.isSafeInteger(quantity * unitPrice)) {
      fail(`${prefix}_line_extension_overflow`);
    }
    return {
      line_id: lineId,
      sku,
      quantity,
      unit_price_minor: unitPrice,
      extended_minor: extended,
    };
  });
}

function parseQuantityLines(value: unknown): QuantityLine[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_LINES) {
    fail("receipt_lines_shape_invalid");
  }
  const lineIds = new Set<string>();
  const skus = new Set<string>();
  return value.map((entry) => {
    const line = exactObject(
      entry,
      ["line_id", "sku", "quantity"],
      "receipt_line_shape_invalid",
    );
    const lineId = stringValue(line.line_id, "receipt_line_id_invalid");
    const sku = stringValue(line.sku, "receipt_sku_invalid");
    if (lineIds.has(lineId) || skus.has(sku)) {
      fail("receipt_line_identity_duplicate");
    }
    lineIds.add(lineId);
    skus.add(sku);
    return {
      line_id: lineId,
      sku,
      quantity: safeInteger(
        line.quantity,
        "receipt_quantity_invalid",
        1,
      ),
    };
  });
}

export function parseInvoice(bytes: Uint8Array): InvoiceRecord {
  const input = exactObject(parseJson(bytes, "invoice_json_invalid"), [
    "schema",
    "buyer_id",
    "supplier_id",
    "invoice_id",
    "po_id",
    "currency",
    "payment_terms",
    "line_items",
    "subtotal_minor",
    "tax_minor",
    "total_minor",
    "memo",
  ], "invoice_shape_invalid");
  if (input.schema !== "riddle.synthetic.invoice.v1") {
    fail("invoice_schema_unsupported");
  }
  const currency = stringValue(input.currency, "invoice_currency_invalid");
  if (!CURRENCY.test(currency)) fail("invoice_currency_invalid");
  return {
    schema: "riddle.synthetic.invoice.v1",
    buyer_id: stringValue(input.buyer_id, "invoice_buyer_invalid"),
    supplier_id: stringValue(input.supplier_id, "invoice_supplier_invalid"),
    invoice_id: stringValue(input.invoice_id, "invoice_id_invalid"),
    po_id: stringValue(input.po_id, "invoice_po_id_invalid"),
    currency,
    payment_terms: stringValue(
      input.payment_terms,
      "invoice_payment_terms_invalid",
    ),
    line_items: parsePricedLines(input.line_items, "invoice"),
    subtotal_minor: safeInteger(
      input.subtotal_minor,
      "invoice_subtotal_invalid",
    ),
    tax_minor: safeInteger(input.tax_minor, "invoice_tax_invalid"),
    total_minor: safeInteger(input.total_minor, "invoice_total_invalid"),
    memo: stringValue(input.memo, "invoice_memo_invalid"),
  };
}

export function parsePurchaseOrder(
  bytes: Uint8Array,
): PurchaseOrderRecord {
  const input = exactObject(
    parseJson(bytes, "purchase_order_json_invalid"),
    [
      "schema",
      "buyer_id",
      "supplier_id",
      "po_id",
      "currency",
      "payment_terms",
      "line_items",
      "subtotal_minor",
      "tax_minor",
      "total_minor",
    ],
    "purchase_order_shape_invalid",
  );
  if (input.schema !== "riddle.synthetic.purchase-order.v1") {
    fail("purchase_order_schema_unsupported");
  }
  const currency = stringValue(
    input.currency,
    "purchase_order_currency_invalid",
  );
  if (!CURRENCY.test(currency)) fail("purchase_order_currency_invalid");
  return {
    schema: "riddle.synthetic.purchase-order.v1",
    buyer_id: stringValue(input.buyer_id, "purchase_order_buyer_invalid"),
    supplier_id: stringValue(
      input.supplier_id,
      "purchase_order_supplier_invalid",
    ),
    po_id: stringValue(input.po_id, "purchase_order_id_invalid"),
    currency,
    payment_terms: stringValue(
      input.payment_terms,
      "purchase_order_payment_terms_invalid",
    ),
    line_items: parsePricedLines(input.line_items, "purchase_order"),
    subtotal_minor: safeInteger(
      input.subtotal_minor,
      "purchase_order_subtotal_invalid",
    ),
    tax_minor: safeInteger(
      input.tax_minor,
      "purchase_order_tax_invalid",
    ),
    total_minor: safeInteger(
      input.total_minor,
      "purchase_order_total_invalid",
    ),
  };
}

export function parseReceipt(bytes: Uint8Array): ReceiptRecord {
  const input = exactObject(parseJson(bytes, "receipt_json_invalid"), [
    "schema",
    "buyer_id",
    "supplier_id",
    "receipt_id",
    "po_id",
    "received_at",
    "line_items",
  ], "receipt_shape_invalid");
  if (input.schema !== "riddle.synthetic.receipt.v1") {
    fail("receipt_schema_unsupported");
  }
  const receivedAt = stringValue(
    input.received_at,
    "receipt_timestamp_invalid",
  );
  const receivedDate = new Date(receivedAt);
  if (
    !Number.isFinite(receivedDate.getTime())
    || receivedDate.toISOString() !== receivedAt
  ) {
    fail("receipt_timestamp_invalid");
  }
  return {
    schema: "riddle.synthetic.receipt.v1",
    buyer_id: stringValue(input.buyer_id, "receipt_buyer_invalid"),
    supplier_id: stringValue(input.supplier_id, "receipt_supplier_invalid"),
    receipt_id: stringValue(input.receipt_id, "receipt_id_invalid"),
    po_id: stringValue(input.po_id, "receipt_po_id_invalid"),
    received_at: receivedAt,
    line_items: parseQuantityLines(input.line_items),
  };
}

function recordDigests(bytes: RecordBytes): RecordDigests {
  const invoice = sha256Bytes(bytes.invoice);
  const purchaseOrder = sha256Bytes(bytes.purchase_order);
  const receipt = sha256Bytes(bytes.receipt);
  return {
    invoice,
    purchase_order: purchaseOrder,
    receipt,
    record_set: canonicalDigest({
      version: "riddle.synthetic.invoice-record-set.v1",
      invoice_digest: invoice,
      purchase_order_digest: purchaseOrder,
      receipt_digest: receipt,
    }),
  };
}

export function parseRecordSet(bytes: RecordBytes): ParsedRecordSet {
  const digests = recordDigests(bytes);
  return {
    invoice: parseInvoice(bytes.invoice),
    purchase_order: parsePurchaseOrder(bytes.purchase_order),
    receipt: parseReceipt(bytes.receipt),
    digests,
  };
}

function addSafe(values: readonly number[], code: string): number {
  let sum = 0;
  for (const value of values) {
    sum += value;
    if (!Number.isSafeInteger(sum)) fail(code);
  }
  return sum;
}

function difference(
  field: string,
  observed: string | number,
  expected: string | number,
): ReconciliationDifference | null {
  return observed === expected ? null : { field, observed, expected };
}

function compactDifferences(
  values: readonly (ReconciliationDifference | null)[],
): ReconciliationDifference[] {
  return values.filter(
    (value): value is ReconciliationDifference => value !== null,
  );
}

function check(input: {
  requirement_id: InvoiceRequirementId;
  record_role: RecordRole;
  evidence_roles: readonly RecordRole[];
  differences: readonly ReconciliationDifference[];
}): ReconciliationCheck {
  const body = {
    requirement_id: input.requirement_id,
    status: input.differences.length === 0
      ? "satisfied" as const
      : "failed" as const,
    record_role: input.record_role,
    evidence_roles: [...input.evidence_roles],
    differences: [...input.differences],
  };
  return {
    ...body,
    detail_digest: canonicalDigest(body),
  };
}

function extensionDifferences(
  lines: readonly PricedLine[],
  prefix: string,
): ReconciliationDifference[] {
  return compactDifferences(lines.map((line, index) => difference(
    `${prefix}.line_items[${index}].extended_minor`,
    line.extended_minor,
    line.quantity * line.unit_price_minor,
  )));
}

function lineTermDifferences(
  invoice: readonly PricedLine[],
  expected: readonly PricedLine[],
): ReconciliationDifference[] {
  const output: ReconciliationDifference[] = [];
  const count = Math.max(invoice.length, expected.length);
  for (let index = 0; index < count; index += 1) {
    const observedLine = invoice[index];
    const expectedLine = expected[index];
    if (!observedLine || !expectedLine) {
      output.push({
        field: `line_items[${index}]`,
        observed: observedLine ? "present" : "<missing>",
        expected: expectedLine ? "present" : "<missing>",
      });
      continue;
    }
    output.push(...compactDifferences([
      difference(
        `line_items[${index}].line_id`,
        observedLine.line_id,
        expectedLine.line_id,
      ),
      difference(
        `line_items[${index}].sku`,
        observedLine.sku,
        expectedLine.sku,
      ),
      difference(
        `line_items[${index}].quantity`,
        observedLine.quantity,
        expectedLine.quantity,
      ),
      difference(
        `line_items[${index}].unit_price_minor`,
        observedLine.unit_price_minor,
        expectedLine.unit_price_minor,
      ),
    ]));
  }
  return output;
}

function quantityDifferences(
  invoice: readonly PricedLine[],
  expected: readonly QuantityLine[],
): ReconciliationDifference[] {
  const output: ReconciliationDifference[] = [];
  const count = Math.max(invoice.length, expected.length);
  for (let index = 0; index < count; index += 1) {
    const observedLine = invoice[index];
    const expectedLine = expected[index];
    if (!observedLine || !expectedLine) {
      output.push({
        field: `line_items[${index}]`,
        observed: observedLine ? "present" : "<missing>",
        expected: expectedLine ? "present" : "<missing>",
      });
      continue;
    }
    output.push(...compactDifferences([
      difference(
        `line_items[${index}].line_id`,
        observedLine.line_id,
        expectedLine.line_id,
      ),
      difference(
        `line_items[${index}].sku`,
        observedLine.sku,
        expectedLine.sku,
      ),
      difference(
        `line_items[${index}].quantity`,
        observedLine.quantity,
        expectedLine.quantity,
      ),
    ]));
  }
  return output;
}

export function analyzeRecordSet(bytes: RecordBytes): ReconciliationAnalysis {
  const records = parseRecordSet(bytes);
  const invoiceAnalysis = analyzeInvoiceRecord(bytes.invoice);
  const purchaseOrderAnalysis = analyzePurchaseOrderRecord(
    bytes.purchase_order,
  );
  const invoice = invoiceAnalysis.record;
  const po = purchaseOrderAnalysis.record;
  const receipt = records.receipt;
  const checks: ReconciliationCheck[] = [
    ...invoiceAnalysis.checks,
    ...purchaseOrderAnalysis.checks,
    check({
      requirement_id: "invoice_purchase_order_identity_terms",
      record_role: "record_set",
      evidence_roles: ["invoice", "purchase_order"],
      differences: compactDifferences([
        difference("buyer_id", invoice.buyer_id, po.buyer_id),
        difference("supplier_id", invoice.supplier_id, po.supplier_id),
        difference("po_id", invoice.po_id, po.po_id),
        difference("currency", invoice.currency, po.currency),
        difference(
          "payment_terms",
          invoice.payment_terms,
          po.payment_terms,
        ),
      ]),
    }),
    check({
      requirement_id: "invoice_purchase_order_line_terms",
      record_role: "record_set",
      evidence_roles: ["invoice", "purchase_order"],
      differences: lineTermDifferences(invoice.line_items, po.line_items),
    }),
    check({
      requirement_id: "invoice_purchase_order_total",
      record_role: "record_set",
      evidence_roles: ["invoice", "purchase_order"],
      differences: compactDifferences([
        difference("total_minor", invoice.total_minor, po.total_minor),
      ]),
    }),
    check({
      requirement_id: "invoice_receipt_identity",
      record_role: "record_set",
      evidence_roles: ["invoice", "receipt"],
      differences: compactDifferences([
        difference("buyer_id", invoice.buyer_id, receipt.buyer_id),
        difference("supplier_id", invoice.supplier_id, receipt.supplier_id),
        difference("po_id", invoice.po_id, receipt.po_id),
      ]),
    }),
    check({
      requirement_id: "invoice_receipt_quantities",
      record_role: "record_set",
      evidence_roles: ["invoice", "receipt"],
      differences: quantityDifferences(
        invoice.line_items,
        receipt.line_items,
      ),
    }),
  ];
  if (
    checks.length !== INVOICE_REQUIREMENT_IDS.length
    || checks.some(
      (entry, index) =>
        entry.requirement_id !== INVOICE_REQUIREMENT_IDS[index],
    )
  ) {
    throw new Error("Invoice requirement implementation order is invalid.");
  }
  return { records, checks };
}

export function analyzeInvoiceRecord(bytes: Uint8Array): {
  record: InvoiceRecord;
  digest: string;
  checks: readonly ReconciliationCheck[];
} {
  const invoice = parseInvoice(bytes);
  const invoiceExtensionSum = addSafe(
    invoice.line_items.map((line) => line.extended_minor),
    "invoice_subtotal_overflow",
  );
  const invoiceExpectedTotal = addSafe(
    [invoice.subtotal_minor, invoice.tax_minor],
    "invoice_total_overflow",
  );
  return {
    record: invoice,
    digest: sha256Bytes(bytes),
    checks: [
      check({
        requirement_id: "invoice_line_extensions",
        record_role: "invoice",
        evidence_roles: ["invoice"],
        differences: extensionDifferences(invoice.line_items, "invoice"),
      }),
      check({
        requirement_id: "invoice_subtotal",
        record_role: "invoice",
        evidence_roles: ["invoice"],
        differences: compactDifferences([
          difference(
            "invoice.subtotal_minor",
            invoice.subtotal_minor,
            invoiceExtensionSum,
          ),
        ]),
      }),
      check({
        requirement_id: "invoice_tax_total",
        record_role: "invoice",
        evidence_roles: ["invoice"],
        differences: compactDifferences([
          difference(
            "invoice.total_minor",
            invoice.total_minor,
            invoiceExpectedTotal,
          ),
        ]),
      }),
    ],
  };
}

export function analyzePurchaseOrderRecord(bytes: Uint8Array): {
  record: PurchaseOrderRecord;
  digest: string;
  checks: readonly ReconciliationCheck[];
} {
  const po = parsePurchaseOrder(bytes);
  const poExtensionSum = addSafe(
    po.line_items.map((line) => line.extended_minor),
    "purchase_order_subtotal_overflow",
  );
  const poExpectedTotal = addSafe(
    [po.subtotal_minor, po.tax_minor],
    "purchase_order_total_overflow",
  );
  return {
    record: po,
    digest: sha256Bytes(bytes),
    checks: [
      check({
        requirement_id: "purchase_order_line_extensions",
        record_role: "purchase_order",
        evidence_roles: ["purchase_order"],
        differences: extensionDifferences(po.line_items, "purchase_order"),
      }),
      check({
        requirement_id: "purchase_order_subtotal",
        record_role: "purchase_order",
        evidence_roles: ["purchase_order"],
        differences: compactDifferences([
          difference(
            "purchase_order.subtotal_minor",
            po.subtotal_minor,
            poExtensionSum,
          ),
        ]),
      }),
      check({
        requirement_id: "purchase_order_tax_total",
        record_role: "purchase_order",
        evidence_roles: ["purchase_order"],
        differences: compactDifferences([
          difference(
            "purchase_order.total_minor",
            po.total_minor,
            poExpectedTotal,
          ),
        ]),
      }),
    ],
  };
}

export function inspectReceiptRecord(bytes: Uint8Array): {
  record: ReceiptRecord;
  digest: string;
} {
  return {
    record: parseReceipt(bytes),
    digest: sha256Bytes(bytes),
  };
}

function status(
  analysis: ReconciliationAnalysis,
  requirementId: InvoiceRequirementId,
): ReconciliationCheck["status"] {
  const found = analysis.checks.find(
    (entry) => entry.requirement_id === requirementId,
  );
  if (!found) throw new Error(`Missing requirement ${requirementId}.`);
  return found.status;
}

export function proposeTypedInvoiceCorrection(
  analysis: ReconciliationAnalysis,
): TypedInvoiceCorrection | null {
  for (const requirementId of [
    "invoice_line_extensions",
    "invoice_subtotal",
    "invoice_tax_total",
    "purchase_order_line_extensions",
    "purchase_order_subtotal",
    "purchase_order_tax_total",
    "invoice_purchase_order_identity_terms",
    "invoice_receipt_identity",
  ] as const) {
    if (status(analysis, requirementId) !== "satisfied") return null;
  }
  const { invoice, purchase_order: po, receipt } = analysis.records;
  if (
    invoice.line_items.length !== po.line_items.length
    || invoice.line_items.length !== receipt.line_items.length
  ) {
    return null;
  }
  let mismatch:
    | {
        invoice: PricedLine;
        po: PricedLine;
        receipt: QuantityLine;
      }
    | undefined;
  for (let index = 0; index < invoice.line_items.length; index += 1) {
    const invoiceLine = invoice.line_items[index];
    const poLine = po.line_items[index];
    const receiptLine = receipt.line_items[index];
    if (!invoiceLine || !poLine || !receiptLine) return null;
    if (
      invoiceLine.line_id !== poLine.line_id
      || invoiceLine.line_id !== receiptLine.line_id
      || invoiceLine.sku !== poLine.sku
      || invoiceLine.sku !== receiptLine.sku
      || invoiceLine.unit_price_minor !== poLine.unit_price_minor
      || poLine.quantity !== receiptLine.quantity
    ) {
      return null;
    }
    if (invoiceLine.quantity === poLine.quantity) {
      if (invoiceLine.extended_minor !== poLine.extended_minor) return null;
      continue;
    }
    if (mismatch) return null;
    mismatch = { invoice: invoiceLine, po: poLine, receipt: receiptLine };
  }
  if (!mismatch) return null;
  if (
    status(analysis, "invoice_purchase_order_line_terms") !== "failed"
    || status(analysis, "invoice_purchase_order_total") !== "failed"
    || status(analysis, "invoice_receipt_quantities") !== "failed"
  ) {
    return null;
  }
  return {
    version: "riddle.synthetic.invoice-correction.v1",
    kind: INVOICE_CORRECTION_KIND,
    base_invoice_digest: analysis.records.digests.invoice,
    purchase_order_digest: analysis.records.digests.purchase_order,
    receipt_digest: analysis.records.digests.receipt,
    line_id: mismatch.invoice.line_id,
    sku: mismatch.invoice.sku,
    from_quantity: mismatch.invoice.quantity,
    to_quantity: mismatch.po.quantity,
    from_extended_minor: mismatch.invoice.extended_minor,
    to_extended_minor: mismatch.po.extended_minor,
    from_subtotal_minor: invoice.subtotal_minor,
    to_subtotal_minor: po.subtotal_minor,
    from_tax_minor: invoice.tax_minor,
    to_tax_minor: po.tax_minor,
    from_total_minor: invoice.total_minor,
    to_total_minor: po.total_minor,
  };
}

export function applyTypedInvoiceCorrection(input: {
  analysis: ReconciliationAnalysis;
  correction: TypedInvoiceCorrection;
}): {
  invoice: InvoiceRecord;
  bytes: Uint8Array;
  analysis: ReconciliationAnalysis;
} {
  const expected = proposeTypedInvoiceCorrection(input.analysis);
  if (!expected || !isDeepStrictEqual(input.correction, expected)) {
    throw new TypeError(
      "The correction is not the exact app-owned proposal for this record set.",
    );
  }
  const revised = jsonClone(input.analysis.records.invoice);
  const line = revised.line_items.find(
    (candidate) =>
      candidate.line_id === expected.line_id
      && candidate.sku === expected.sku,
  );
  if (!line) throw new Error("The proposed invoice line no longer exists.");
  line.quantity = expected.to_quantity;
  line.extended_minor = expected.to_extended_minor;
  revised.subtotal_minor = expected.to_subtotal_minor;
  revised.tax_minor = expected.to_tax_minor;
  revised.total_minor = expected.to_total_minor;
  revised.memo = "Synthetic fixture: corrected by the bounded invoice workbench.";
  const revisedBytes = Buffer.from(canonicalPrettyJson(revised), "utf8");
  const analysis = analyzeRecordSet({
    invoice: revisedBytes,
    purchase_order: Buffer.from(
      canonicalPrettyJson(input.analysis.records.purchase_order),
      "utf8",
    ),
    receipt: Buffer.from(
      canonicalPrettyJson(input.analysis.records.receipt),
      "utf8",
    ),
  });
  if (analysis.checks.some((entry) => entry.status !== "satisfied")) {
    throw new Error("The bounded correction did not satisfy the pinned checks.");
  }
  return { invoice: revised, bytes: revisedBytes, analysis };
}
