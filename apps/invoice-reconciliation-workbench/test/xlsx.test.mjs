import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  createSyntheticInvoiceWorkbookFixture,
  extractSyntheticInvoiceWorkbook,
  InvoiceWorkbookInputError,
  reviseSyntheticInvoiceWorkbook,
  SYNTHETIC_XLSX_INVOICE_POLICY,
  SYNTHETIC_XLSX_INVOICE_POLICY_DEFINITION,
} from "../dist/xlsx.js";
import { canonicalDigest } from "../dist/canonical.js";
import {
  BASE_INVOICE,
  canonicalParts,
  replacePart,
  workbookForInvoice,
  worksheetForInvoice,
  zipParts,
} from "./xlsx-builder.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureInvoiceBytes = readFileSync(
  join(
    testDirectory,
    "..",
    "fixtures",
    "over-invoiced",
    "invoice.v1.json",
  ),
);
const fixtureWorkbookBytes = readFileSync(
  join(
    testDirectory,
    "..",
    "fixtures",
    "over-invoiced",
    "invoice.v1.xlsx",
  ),
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectCode(action, code) {
  assert.throws(
    action,
    (error) =>
      error instanceof InvoiceWorkbookInputError
      && error.code === code
      && error.message
        === "The selected synthetic invoice workbook could not be checked.",
  );
}

function worksheetMutation(transform) {
  const worksheet = worksheetForInvoice();
  return zipParts(replacePart(
    canonicalParts(),
    "xl/worksheets/sheet1.xml",
    transform(worksheet),
  ));
}

test("the independent golden builder matches the narrow canonical writer", () => {
  const expected = workbookForInvoice();
  const actual = createSyntheticInvoiceWorkbookFixture(BASE_INVOICE);
  assert.deepEqual(Buffer.from(actual), expected);
  assert.deepEqual(
    fixtureWorkbookBytes,
    expected,
    "the committed XLSX fixture must be exactly reproducible",
  );
  const extraction = extractSyntheticInvoiceWorkbook(actual);
  assert.deepEqual(extraction.normalized_invoice, BASE_INVOICE);
  assert.deepEqual(
    Buffer.from(extraction.normalized_invoice_bytes),
    fixtureInvoiceBytes,
  );
  assert.equal(
    extraction.normalized_invoice_digest,
    `sha256:${/^[0-9a-f]{64}$/u.test(
      extraction.normalized_invoice_digest.slice("sha256:".length),
    )
      ? extraction.normalized_invoice_digest.slice("sha256:".length)
      : ""}`,
  );
  assert.deepEqual(extraction.policy, SYNTHETIC_XLSX_INVOICE_POLICY);
});

test("stored and deflated byte-distinct workbooks bind the same facts to different specimens", () => {
  const stored = workbookForInvoice();
  const deflated = workbookForInvoice(BASE_INVOICE, { method: 8 });
  assert.notDeepEqual(stored, deflated);
  const storedExtraction = extractSyntheticInvoiceWorkbook(stored);
  const deflatedExtraction = extractSyntheticInvoiceWorkbook(deflated);
  assert.equal(
    storedExtraction.normalized_invoice_digest,
    deflatedExtraction.normalized_invoice_digest,
  );
  assert.deepEqual(
    storedExtraction.normalized_invoice_bytes,
    deflatedExtraction.normalized_invoice_bytes,
  );
  assert.notEqual(
    storedExtraction.workbook_digest,
    deflatedExtraction.workbook_digest,
  );
  assert.notEqual(
    storedExtraction.binding_digest,
    deflatedExtraction.binding_digest,
  );
  assert.notEqual(
    storedExtraction.private_trace_digest,
    deflatedExtraction.private_trace_digest,
  );
});

test("XML text is escaped, recovered, and bound without broad XML support", () => {
  const invoice = clone(BASE_INVOICE);
  invoice.memo = 'Synthetic A&B <C> "quoted" and \'apostrophe\'';
  const extraction = extractSyntheticInvoiceWorkbook(
    createSyntheticInvoiceWorkbookFixture(invoice),
  );
  assert.equal(extraction.normalized_invoice.memo, invoice.memo);
});

test("the typed correction authors a new source-bound workbook revision", () => {
  const originalBytes = createSyntheticInvoiceWorkbookFixture(BASE_INVOICE);
  const base = extractSyntheticInvoiceWorkbook(originalBytes);
  const expected = clone(BASE_INVOICE);
  expected.line_items[1].quantity = 10;
  expected.line_items[1].extended_minor = 5000;
  expected.subtotal_minor = 17500;
  expected.tax_minor = 1400;
  expected.total_minor = 18900;
  const correction = {
    version: "riddle.synthetic.invoice-correction.v1",
    kind: "align_invoice_line_to_ordered_and_received_quantity",
    base_invoice_digest: base.normalized_invoice_digest,
    purchase_order_digest: `sha256:${"1".repeat(64)}`,
    receipt_digest: `sha256:${"2".repeat(64)}`,
    line_id: "line-2",
    sku: "SERVICE-B",
    from_quantity: 12,
    to_quantity: 10,
    from_extended_minor: 6000,
    to_extended_minor: 5000,
    from_subtotal_minor: 18500,
    to_subtotal_minor: 17500,
    from_tax_minor: 1480,
    to_tax_minor: 1400,
    from_total_minor: 19980,
    to_total_minor: 18900,
  };
  const revised = reviseSyntheticInvoiceWorkbook({
    workbook_bytes: originalBytes,
    base_extraction: base,
    correction,
    expected_invoice: expected,
  });
  assert.notDeepEqual(
    Buffer.from(revised.workbook_bytes),
    Buffer.from(originalBytes),
  );
  assert.deepEqual(revised.extraction.normalized_invoice, expected);
  assert.notEqual(
    revised.extraction.normalized_invoice_digest,
    base.normalized_invoice_digest,
  );
  assert.notEqual(
    revised.extraction.binding_digest,
    base.binding_digest,
  );
  assert.equal(
    revised.extraction.normalized_invoice.memo,
    BASE_INVOICE.memo,
    "the typed numeric correction must preserve undisclosed fields",
  );

  expectCode(() => reviseSyntheticInvoiceWorkbook({
    workbook_bytes: originalBytes,
    base_extraction: base,
    correction,
    expected_invoice: { ...expected, total_minor: 18901 },
  }), "xlsx_correction_expected_invoice_mismatch");
  expectCode(() => reviseSyntheticInvoiceWorkbook({
    workbook_bytes: workbookForInvoice(BASE_INVOICE, { method: 8 }),
    base_extraction: base,
    correction,
    expected_invoice: expected,
  }), "xlsx_correction_base_mismatch");
});

test("the policy digest binds the exact accepted XLSX profile", () => {
  assert.equal(
    SYNTHETIC_XLSX_INVOICE_POLICY.digest,
    canonicalDigest(SYNTHETIC_XLSX_INVOICE_POLICY_DEFINITION),
  );
  const changedProfile = clone(
    SYNTHETIC_XLSX_INVOICE_POLICY_DEFINITION,
  );
  changedProfile.workbook.worksheet_markup.column_widths_xml =
    changedProfile.workbook.worksheet_markup.column_widths_xml.replace(
      'width="42"',
      'width="41"',
    );
  assert.notEqual(
    canonicalDigest(changedProfile),
    SYNTHETIC_XLSX_INVOICE_POLICY.digest,
  );
});

test("formula caches are recomputed instead of trusted", () => {
  expectCode(
    () => extractSyntheticInvoiceWorkbook(worksheetMutation((xml) =>
      xml.replace(
        "<f>C11*D11</f><v>6000</v>",
        "<f>C11*D11</f><v>5999</v>",
      ))),
    "xlsx_formula_cached_value_mismatch",
  );
  expectCode(
    () => extractSyntheticInvoiceWorkbook(worksheetMutation((xml) =>
      xml.replace(
        "<f>SUM(E10:E11)</f><v>18500</v>",
        "<f>SUM(E10:E11)</f><v>18499</v>",
      ))),
    "xlsx_formula_cached_value_mismatch",
  );
  expectCode(
    () => extractSyntheticInvoiceWorkbook(worksheetMutation((xml) =>
      xml.replace(
        "<f>E13+E14</f><v>19980</v>",
        "<f>E13+E14</f><v>19979</v>",
      ))),
    "xlsx_formula_cached_value_mismatch",
  );
});

test("equivalent, shared, missing, and externally referential formulas fail closed", () => {
  expectCode(
    () => extractSyntheticInvoiceWorkbook(worksheetMutation((xml) =>
      xml.replace("C11*D11", "D11*C11"))),
    "xlsx_formula_invalid",
  );
  expectCode(
    () => extractSyntheticInvoiceWorkbook(worksheetMutation((xml) =>
      xml.replace("<f>C11*D11</f>", '<f t="shared">C11*D11</f>'))),
    "xlsx_cell_ambiguous",
  );
  expectCode(
    () => extractSyntheticInvoiceWorkbook(worksheetMutation((xml) =>
      xml.replace("<f>C11*D11</f>", ""))),
    "xlsx_cell_ambiguous",
  );
  expectCode(
    () => extractSyntheticInvoiceWorkbook(worksheetMutation((xml) =>
      xml.replace("C11*D11", "C11*[vendor.xlsx]Sheet1!D11"))),
    "xlsx_external_reference_forbidden",
  );
});

test("noncanonical and unsafe numeric spellings fail before normalization", () => {
  for (const unsafe of [
    "1e1",
    "12.0",
    "+12",
    "-12",
    " 12",
    "012",
    "9007199254740992",
  ]) {
    expectCode(
      () => extractSyntheticInvoiceWorkbook(worksheetMutation((xml) =>
        xml.replace(
          '<c r="C11"><v>12</v></c>',
          `<c r="C11"><v>${unsafe}</v></c>`,
        ))),
      "xlsx_number_invalid",
    );
  }
  expectCode(
    () => extractSyntheticInvoiceWorkbook(worksheetMutation((xml) =>
      xml
        .replace('<c r="C11"><v>12</v></c>', `<c r="C11"><v>${Number.MAX_SAFE_INTEGER}</v></c>`)
        .replace('<c r="D11"><v>500</v></c>', '<c r="D11"><v>2</v></c>'))),
    "xlsx_number_invalid",
  );
});

test("macros, external relationships, and expanded package capabilities are rejected", () => {
  const macroTypes = canonicalParts()[0].bytes.toString("utf8").replace(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
    "application/vnd.ms-excel.sheet.macroEnabled.main+xml",
  );
  expectCode(
    () => extractSyntheticInvoiceWorkbook(zipParts(replacePart(
      canonicalParts(),
      "[Content_Types].xml",
      macroTypes,
    ))),
    "xlsx_macro_forbidden",
  );

  const externalRelationships = canonicalParts()[3].bytes.toString("utf8")
    .replace(
      'Target="worksheets/sheet1.xml"',
      'Target="https://example.invalid/invoice.xlsx" TargetMode="External"',
    );
  expectCode(
    () => extractSyntheticInvoiceWorkbook(zipParts(replacePart(
      canonicalParts(),
      "xl/_rels/workbook.xml.rels",
      externalRelationships,
    ))),
    "xlsx_external_reference_forbidden",
  );

  expectCode(
    () => extractSyntheticInvoiceWorkbook(zipParts([
      ...canonicalParts(),
      { name: "xl/vbaProject.bin", bytes: Buffer.from("synthetic") },
    ])),
    "xlsx_package_profile_invalid",
  );
});

test("arbitrary sheets, cells, and XML constructs are rejected", () => {
  const secondSheet = canonicalParts()[2].bytes.toString("utf8").replace(
    "</sheets>",
    '<sheet name="Other" sheetId="2" r:id="rId2"/></sheets>',
  );
  expectCode(
    () => extractSyntheticInvoiceWorkbook(zipParts(replacePart(
      canonicalParts(),
      "xl/workbook.xml",
      secondSheet,
    ))),
    "xlsx_package_profile_invalid",
  );
  expectCode(
    () => extractSyntheticInvoiceWorkbook(worksheetMutation((xml) =>
      xml.replace(
        "</row></sheetData>",
        '<c r="E17"><v>1</v></c></row></sheetData>',
      ))),
    "xlsx_layout_invalid",
  );
  expectCode(
    () => extractSyntheticInvoiceWorkbook(worksheetMutation((xml) =>
      xml.replace(
        '<c r="A2" t="inlineStr">',
        '<c r="C2" t="inlineStr">',
      ))),
    "xlsx_layout_invalid",
  );
  expectCode(
    () => extractSyntheticInvoiceWorkbook(worksheetMutation((xml) =>
      xml.replace(
        XML_DECLARATION_FOR_TEST,
        `${XML_DECLARATION_FOR_TEST}<!DOCTYPE worksheet [<!ENTITY x "x">]>`,
      ))),
    "xlsx_xml_unsupported",
  );
});

test("the one-page print layout is pinned and fails closed", () => {
  const worksheet = worksheetForInvoice();
  assert.match(
    worksheet,
    /<pageSetUpPr fitToPage="1"\/>/u,
  );
  assert.match(
    worksheet,
    /<pageSetup paperSize="1" orientation="landscape" fitToWidth="1" fitToHeight="1"\/>/u,
  );
  expectCode(
    () => extractSyntheticInvoiceWorkbook(worksheetMutation((xml) =>
      xml.replace('orientation="landscape"', 'orientation="portrait"'))),
    "xlsx_layout_invalid",
  );
  expectCode(
    () => extractSyntheticInvoiceWorkbook(worksheetMutation((xml) =>
      xml.replace('<pageSetUpPr fitToPage="1"/>', ""))),
    "xlsx_layout_invalid",
  );
});

test("ZIP header, path, feature, integrity, and limit hazards fail closed", () => {
  const badPath = canonicalParts();
  badPath[0] = { ...badPath[0], name: "../content-types.xml" };
  expectCode(
    () => extractSyntheticInvoiceWorkbook(zipParts(badPath)),
    "xlsx_zip_entry_name_invalid",
  );

  const localMismatch = canonicalParts();
  localMismatch[0] = {
    ...localMismatch[0],
    localName: "XContent_Types].xml",
  };
  expectCode(
    () => extractSyntheticInvoiceWorkbook(zipParts(localMismatch)),
    "xlsx_zip_header_mismatch",
  );

  expectCode(
    () => extractSyntheticInvoiceWorkbook(
      zipParts(canonicalParts(), { flags: 1 }),
    ),
    "xlsx_zip_feature_unsupported",
  );

  const badCrc = Buffer.from(workbookForInvoice());
  const firstNameLength = badCrc.readUInt16LE(26);
  badCrc[30 + firstNameLength] ^= 1;
  expectCode(
    () => extractSyntheticInvoiceWorkbook(badCrc),
    "xlsx_zip_crc_invalid",
  );

  expectCode(
    () => extractSyntheticInvoiceWorkbook(
      Buffer.concat([workbookForInvoice(), Buffer.from([0])]),
    ),
    "xlsx_zip_structure_invalid",
  );

  const oversized = replacePart(
    canonicalParts(),
    "xl/worksheets/sheet1.xml",
    "A".repeat(257 * 1024),
  );
  expectCode(
    () => extractSyntheticInvoiceWorkbook(zipParts(oversized)),
    "xlsx_zip_limit_exceeded",
  );

  const bomb = replacePart(
    canonicalParts(),
    "xl/worksheets/sheet1.xml",
    "A".repeat(128 * 1024),
  ).map((part) =>
    part.name === "xl/worksheets/sheet1.xml"
      ? { ...part, method: 8 }
      : part);
  expectCode(
    () => extractSyntheticInvoiceWorkbook(zipParts(bomb)),
    "xlsx_zip_limit_exceeded",
  );
});

const XML_DECLARATION_FOR_TEST =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
