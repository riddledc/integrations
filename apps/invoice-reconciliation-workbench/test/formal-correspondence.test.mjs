import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const reconciliationLean = readFileSync(
  new URL(
    "../../../formal/riddle-proof-kernel/RiddleProofKernel/SyntheticRecordReconciliation.lean",
    import.meta.url,
  ),
  "utf8",
);
const projectionLean = readFileSync(
  new URL(
    "../../../formal/riddle-proof-kernel/RiddleProofKernel/ApplicationProjection.lean",
    import.meta.url,
  ),
  "utf8",
);
const syntheticInvoice = JSON.parse(readFileSync(
  new URL("../fixtures/over-invoiced/invoice.v1.json", import.meta.url),
  "utf8",
));
const syntheticPurchaseOrder = JSON.parse(readFileSync(
  new URL("../fixtures/over-invoiced/purchase-order.json", import.meta.url),
  "utf8",
));

function assertLeanLinesMatchFixture({
  definitionName,
  nextDeclaration,
  lines,
}) {
  const start = reconciliationLean.indexOf(`def ${definitionName}`);
  const end = reconciliationLean.indexOf(nextDeclaration, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const fixtureBlock = reconciliationLean.slice(start, end);
  for (const line of lines) {
    for (const expectedSource of [
      `lineId := ${JSON.stringify(line.line_id)}`,
      `itemId := ${JSON.stringify(line.sku)}`,
      `quantity := ${line.quantity}`,
      `unitPriceMinor := ${line.unit_price_minor}`,
      `extendedMinor := ${line.extended_minor}`,
    ]) {
      assert.ok(
        fixtureBlock.includes(expectedSource),
        `${definitionName} is missing ${expectedSource}`,
      );
    }
  }
}

test("Lean retains the workbench composition and revision obligations", () => {
  for (const theorem of [
    "MultiLineArithmeticRecomputed",
    "exact_line_extensions_have_exact_recomputed_sum",
    "multi_line_arithmetic_implies_exact_total_from_terms",
    "workbench_over_invoiced_two_line_arithmetic_holds",
    "workbench_corrected_two_line_arithmetic_holds",
    "three_source_meaning_iff_exact_declared_premises",
    "invoice_replacement_preserves_purchase_order_meaning",
    "invoice_replacement_preserves_receipt_meaning",
    "changed_invoice_ref_forces_changed_three_source_parameters",
    "invoice_replacement_changes_three_source_conclusion",
    "revised_root_requires_replacement_bound_invoice_premises",
  ]) {
    assert.match(
      reconciliationLean,
      new RegExp(`\\b(?:theorem|def) ${theorem}\\b`, "u"),
      `${theorem} must remain in the formal reconciliation boundary`,
    );
  }
  assert.match(
    projectionLean,
    /\btheorem replacement_subject_requires_replacement_bound_report\b/u,
  );
  assert.match(
    reconciliationLean,
    /Lean does not prove this property of canonical JSON/u,
    "runtime extraction and canonicalization must remain outside Lean",
  );
});

test("the proved two-line arithmetic fixture retains the public synthetic values", () => {
  assert.equal(syntheticInvoice.line_items.length, 2);
  assertLeanLinesMatchFixture({
    definitionName: "workbenchOverInvoicedLines",
    nextDeclaration: "def workbenchCorrectedLines",
    lines: syntheticInvoice.line_items,
  });
  assert.match(
    reconciliationLean,
    new RegExp(
      `workbenchOverInvoicedLines\\s+${syntheticInvoice.subtotal_minor}\\s+`
      + `${syntheticInvoice.tax_minor}\\s+${syntheticInvoice.total_minor}`,
      "u",
    ),
    "Lean theorem must retain the fixture subtotal, stated tax, and total",
  );
});

test("the proved corrected arithmetic fixture retains the purchase-order target values", () => {
  assert.equal(syntheticPurchaseOrder.line_items.length, 2);
  assertLeanLinesMatchFixture({
    definitionName: "workbenchCorrectedLines",
    nextDeclaration: "theorem workbench_over_invoiced_two_line_arithmetic_holds",
    lines: syntheticPurchaseOrder.line_items,
  });
  assert.match(
    reconciliationLean,
    new RegExp(
      `workbenchCorrectedLines\\s+${syntheticPurchaseOrder.subtotal_minor}\\s+`
      + `${syntheticPurchaseOrder.tax_minor}\\s+`
      + `${syntheticPurchaseOrder.total_minor}`,
      "u",
    ),
    "Lean corrected theorem must retain the PO subtotal, stated tax, and total",
  );
});
