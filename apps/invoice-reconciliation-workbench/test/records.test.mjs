import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RecordInputError,
  analyzeRecordSet,
  applyTypedInvoiceCorrection,
  proposeTypedInvoiceCorrection,
} from "../dist/records.js";
import { fixtureBytes, parseFixture } from "./helpers.mjs";

test("the initial specimen keeps arithmetic success separate from relationship failure", () => {
  const analysis = analyzeRecordSet(fixtureBytes());
  assert.deepEqual(
    analysis.checks
      .filter(({ status }) => status === "failed")
      .map(({ requirement_id }) => requirement_id),
    [
      "invoice_purchase_order_line_terms",
      "invoice_purchase_order_total",
      "invoice_receipt_quantities",
    ],
  );
  assert.equal(
    analysis.checks.find(
      ({ requirement_id }) =>
        requirement_id === "invoice_line_extensions",
    ).status,
    "satisfied",
  );
  assert.deepEqual(
    analysis.checks.find(
      ({ requirement_id }) =>
        requirement_id === "invoice_receipt_quantities",
    ).differences,
    [{
      field: "line_items[1].quantity",
      observed: 12,
      expected: 10,
    }],
  );
});

test("the only proposed correction is exact, invoice-only, and sufficient", () => {
  const bytes = fixtureBytes();
  const analysis = analyzeRecordSet(bytes);
  const correction = proposeTypedInvoiceCorrection(analysis);
  assert.ok(correction);
  assert.deepEqual(
    {
      kind: correction.kind,
      line_id: correction.line_id,
      from_quantity: correction.from_quantity,
      to_quantity: correction.to_quantity,
      from_total_minor: correction.from_total_minor,
      to_total_minor: correction.to_total_minor,
    },
    {
      kind: "align_invoice_line_to_ordered_and_received_quantity",
      line_id: "line-2",
      from_quantity: 12,
      to_quantity: 10,
      from_total_minor: 19980,
      to_total_minor: 18900,
    },
  );
  const revised = applyTypedInvoiceCorrection({ analysis, correction });
  assert.equal(
    revised.analysis.checks.every(({ status }) => status === "satisfied"),
    true,
  );
  assert.deepEqual(
    revised.analysis.records.purchase_order,
    analysis.records.purchase_order,
  );
  assert.deepEqual(
    revised.analysis.records.receipt,
    analysis.records.receipt,
  );
  assert.equal(
    revised.analysis.records.invoice.memo,
    analysis.records.invoice.memo,
    "the typed quantity/amount correction does not make an undisclosed memo edit",
  );
  assert.notDeepEqual(
    revised.analysis.records.invoice,
    analysis.records.invoice,
  );
  assert.throws(
    () => applyTypedInvoiceCorrection({
      analysis,
      correction: { ...correction, to_quantity: 9 },
    }),
    /exact app-owned proposal/u,
  );
});

test("same-total wrong-SKU, wrong currency, and partial receipt do not pass", () => {
  const invoice = parseFixture("invoice.v1.json");
  const po = parseFixture("purchase-order.json");
  const receipt = parseFixture("receipt.json");

  const wrongSku = structuredClone(po);
  wrongSku.line_items[1].sku = "OTHER-SKU";
  const wrongSkuResult = analyzeRecordSet({
    invoice: Buffer.from(JSON.stringify(invoice)),
    purchase_order: Buffer.from(JSON.stringify(wrongSku)),
    receipt: Buffer.from(JSON.stringify(receipt)),
  });
  assert.equal(
    wrongSkuResult.checks.find(
      ({ requirement_id }) =>
        requirement_id === "invoice_purchase_order_line_terms",
    ).status,
    "failed",
  );

  const wrongCurrency = structuredClone(po);
  wrongCurrency.currency = "EUR";
  const wrongCurrencyResult = analyzeRecordSet({
    invoice: Buffer.from(JSON.stringify(invoice)),
    purchase_order: Buffer.from(JSON.stringify(wrongCurrency)),
    receipt: Buffer.from(JSON.stringify(receipt)),
  });
  assert.equal(
    wrongCurrencyResult.checks.find(
      ({ requirement_id }) =>
        requirement_id === "invoice_purchase_order_identity_terms",
    ).status,
    "failed",
  );

  const partial = structuredClone(receipt);
  partial.line_items[1].quantity = 9;
  const partialResult = analyzeRecordSet({
    invoice: Buffer.from(JSON.stringify(invoice)),
    purchase_order: Buffer.from(JSON.stringify(po)),
    receipt: Buffer.from(JSON.stringify(partial)),
  });
  assert.equal(
    partialResult.checks.find(
      ({ requirement_id }) =>
        requirement_id === "invoice_receipt_quantities",
    ).status,
    "failed",
  );
  assert.equal(proposeTypedInvoiceCorrection(partialResult), null);
});

test("bad arithmetic becomes a precise failed status while unsafe shape fails closed", () => {
  const bytes = fixtureBytes();
  const invoice = parseFixture("invoice.v1.json");
  invoice.line_items[0].extended_minor = 12499;
  const arithmetic = analyzeRecordSet({
    ...bytes,
    invoice: Buffer.from(JSON.stringify(invoice)),
  });
  assert.equal(
    arithmetic.checks.find(
      ({ requirement_id }) =>
        requirement_id === "invoice_line_extensions",
    ).status,
    "failed",
  );
  assert.equal(proposeTypedInvoiceCorrection(arithmetic), null);

  invoice.line_items[0].quantity = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(
    () => analyzeRecordSet({
      ...bytes,
      invoice: Buffer.from(JSON.stringify(invoice)),
    }),
    (error) =>
      error instanceof RecordInputError
      && error.code === "invoice_quantity_invalid",
  );
});
