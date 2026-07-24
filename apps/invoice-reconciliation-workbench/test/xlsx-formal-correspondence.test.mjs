import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workbookLean = readFileSync(
  new URL(
    "../../../formal/riddle-proof-kernel/RiddleProofKernel/WorkbookInvoiceExtraction.lean",
    import.meta.url,
  ),
  "utf8",
);
const kernelRoot = readFileSync(
  new URL(
    "../../../formal/riddle-proof-kernel/RiddleProofKernel.lean",
    import.meta.url,
  ),
  "utf8",
);

test("Lean retains the typed workbook-to-invoice arithmetic bridge", () => {
  for (const declaration of [
    "WorkbookSchemaRef",
    "WorkbookFormulaCell",
    "WorkbookPricedLine",
    "WorkbookExtractionBinding",
    "WorkbookInvoiceProjection",
    "formulaCellAgrees",
    "WorkbookFormulaArithmeticExact",
    "WorkbookNormalizationBound",
    "WorkbookProjectionBound",
    "accepted_workbook_projection_implies_multi_line_arithmetic",
    "changed_workbook_ref_requires_changed_extraction_binding",
  ]) {
    assert.match(
      workbookLean,
      new RegExp(`\\b(?:structure|def|theorem) ${declaration}\\b`, "u"),
      `${declaration} must remain in the formal XLSX boundary`,
    );
  }

  assert.match(
    workbookLean,
    /cell\.observedFormula = cell\.expectedFormula/u,
    "accepted formula observations must match the pinned expected formula",
  );
  assert.match(
    workbookLean,
    /cell\.cachedMinor = recomputedMinor/u,
    "accepted cached values must match the independently recomputed value",
  );
  assert.match(
    workbookLean,
    /projection\.extractionBinding\.workbookSource = projection\.source/u,
    "the extraction binding must retain the exact workbook source reference",
  );
  assert.match(
    workbookLean,
    /normalized-invoice digest equals or must change with the workbook digest/u,
    "the formal boundary must allow identical facts from byte-distinct workbooks",
  );
});

test("the formal boundary does not pretend Lean parsed or authenticated XLSX", () => {
  for (const boundary of [
    /Lean does not parse ZIP or OOXML bytes/u,
    /authenticate cell addresses or values/u,
    /evaluate Excel formulas/u,
    /detect macros or external links/u,
    /compute hashes/u,
    /establish capture\s+currentness/u,
  ]) {
    assert.match(
      workbookLean,
      boundary,
      `formal XLSX boundary must retain: ${boundary.source}`,
    );
  }

  assert.match(
    kernelRoot,
    /import RiddleProofKernel\.WorkbookInvoiceExtraction/u,
    "the kernel root must build the workbook extraction model",
  );
});
