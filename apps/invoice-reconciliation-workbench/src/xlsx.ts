import { inflateRawSync } from "node:zlib";

import {
  canonicalDigest,
  canonicalPrettyJson,
  deepFreeze,
  jsonClone,
  sha256Bytes,
  stableJson,
} from "./canonical.js";
import { parseInvoice } from "./records.js";
import type {
  InvoiceRecord,
  InvoiceWorkbookExtraction,
  TypedInvoiceCorrection,
} from "./types.js";

const XLSX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_WORKBOOK_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_INFLATED_BYTES = 320 * 1024;
const MAX_COMPRESSION_RATIO = 100;
const XML_DECLARATION =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const SPREADSHEET_NAMESPACE =
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const OFFICE_RELATIONSHIP_NAMESPACE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_RELATIONSHIP_NAMESPACE =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const CONTENT_TYPE_NAMESPACE =
  "http://schemas.openxmlformats.org/package/2006/content-types";
const WORKBOOK_SCHEMA = "riddle.synthetic.invoice-workbook.v1";

const CONTENT_TYPES_XML = `${XML_DECLARATION}<Types xmlns="${CONTENT_TYPE_NAMESPACE}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
const ROOT_RELATIONSHIPS_XML = `${XML_DECLARATION}<Relationships xmlns="${PACKAGE_RELATIONSHIP_NAMESPACE}"><Relationship Id="rId1" Type="${OFFICE_RELATIONSHIP_NAMESPACE}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const WORKBOOK_XML = `${XML_DECLARATION}<workbook xmlns="${SPREADSHEET_NAMESPACE}" xmlns:r="${OFFICE_RELATIONSHIP_NAMESPACE}"><sheets><sheet name="Invoice" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const WORKBOOK_RELATIONSHIPS_XML = `${XML_DECLARATION}<Relationships xmlns="${PACKAGE_RELATIONSHIP_NAMESPACE}"><Relationship Id="rId1" Type="${OFFICE_RELATIONSHIP_NAMESPACE}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
const PINNED_SHEET_PROPERTIES_XML =
  '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>';
const PINNED_COLUMN_WIDTHS_XML = '<cols><col min="1" max="1" width="22" customWidth="1"/><col min="2" max="2" width="42" customWidth="1"/><col min="3" max="3" width="14" customWidth="1"/><col min="4" max="4" width="22" customWidth="1"/><col min="5" max="5" width="20" customWidth="1"/></cols>';
const PINNED_PRINT_LAYOUT_XML =
  '<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0" footer="0"/><pageSetup paperSize="1" orientation="landscape" fitToWidth="1" fitToHeight="1"/>';
const PINNED_ROW_NUMBERS = [
  1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 13, 14, 15, 17,
] as const;
const PINNED_CELL_KINDS = {
  A1: "inline",
  B1: "inline",
  A2: "inline",
  B2: "inline",
  A3: "inline",
  B3: "inline",
  A4: "inline",
  B4: "inline",
  A5: "inline",
  B5: "inline",
  A6: "inline",
  B6: "inline",
  A7: "inline",
  B7: "inline",
  A9: "inline",
  B9: "inline",
  C9: "inline",
  D9: "inline",
  E9: "inline",
  A10: "inline",
  B10: "inline",
  C10: "number",
  D10: "number",
  E10: "formula",
  A11: "inline",
  B11: "inline",
  C11: "number",
  D11: "number",
  E11: "formula",
  A13: "inline",
  E13: "formula",
  A14: "inline",
  E14: "number",
  A15: "inline",
  E15: "formula",
  A17: "inline",
  B17: "inline",
} as const;
const PINNED_FIXED_INLINE_VALUES = {
  A1: "schema",
  B1: WORKBOOK_SCHEMA,
  A2: "buyer_id",
  A3: "supplier_id",
  A4: "invoice_id",
  A5: "po_id",
  A6: "currency",
  A7: "payment_terms",
  A9: "line_id",
  B9: "sku",
  C9: "quantity",
  D9: "unit_price_minor",
  E9: "extended_minor",
  A13: "subtotal_minor",
  A14: "tax_minor",
  A15: "total_minor",
  A17: "memo",
} as const;
const PINNED_DYNAMIC_INVOICE_FIELDS = {
  B2: "buyer_id",
  B3: "supplier_id",
  B4: "invoice_id",
  B5: "po_id",
  B6: "currency",
  B7: "payment_terms",
  A10: "line_items[0].line_id",
  B10: "line_items[0].sku",
  C10: "line_items[0].quantity",
  D10: "line_items[0].unit_price_minor",
  E10: "line_items[0].extended_minor",
  A11: "line_items[1].line_id",
  B11: "line_items[1].sku",
  C11: "line_items[1].quantity",
  D11: "line_items[1].unit_price_minor",
  E11: "line_items[1].extended_minor",
  E13: "subtotal_minor",
  E14: "tax_minor",
  E15: "total_minor",
  B17: "memo",
} as const;
const PINNED_FORMULAS = {
  E10: "C10*D10",
  E11: "C11*D11",
  E13: "SUM(E10:E11)",
  E15: "E13+E14",
} as const;
const PINNED_NUMERIC_MINIMUMS = {
  C10: 1,
  D10: 0,
  C11: 1,
  D11: 0,
  E14: 0,
} as const;

const ENTRY_PROFILE = [
  {
    name: "[Content_Types].xml",
    maxInflatedBytes: 16 * 1024,
    exactXml: CONTENT_TYPES_XML,
  },
  {
    name: "_rels/.rels",
    maxInflatedBytes: 16 * 1024,
    exactXml: ROOT_RELATIONSHIPS_XML,
  },
  {
    name: "xl/workbook.xml",
    maxInflatedBytes: 16 * 1024,
    exactXml: WORKBOOK_XML,
  },
  {
    name: "xl/_rels/workbook.xml.rels",
    maxInflatedBytes: 16 * 1024,
    exactXml: WORKBOOK_RELATIONSHIPS_XML,
  },
  {
    name: "xl/worksheets/sheet1.xml",
    maxInflatedBytes: 256 * 1024,
  },
] as const;

export const SYNTHETIC_XLSX_INVOICE_POLICY_DEFINITION = deepFreeze({
  schema: "riddle-proof.synthetic-xlsx-invoice-policy.v1",
  policy_id: "riddle-proof.synthetic-xlsx-invoice-exact-profile",
  policy_version: "1",
  media_type: XLSX_MEDIA_TYPE,
  archive: {
    exact_entries: ENTRY_PROFILE.map((entry) => entry.name),
    compression_methods: ["stored", "deflate"],
    zip64: false,
    encryption: false,
    data_descriptors: false,
    max_workbook_bytes: MAX_WORKBOOK_BYTES,
    max_total_inflated_bytes: MAX_TOTAL_INFLATED_BYTES,
    max_compression_ratio: MAX_COMPRESSION_RATIO,
  },
  exact_static_package_parts: {
    "[Content_Types].xml": CONTENT_TYPES_XML,
    "_rels/.rels": ROOT_RELATIONSHIPS_XML,
    "xl/workbook.xml": WORKBOOK_XML,
    "xl/_rels/workbook.xml.rels": WORKBOOK_RELATIONSHIPS_XML,
  },
  workbook: {
    sheet_name: "Invoice",
    sheet_id: "1",
    relationship_id: "rId1",
    dimension: "A1:E17",
    line_rows: [10, 11],
    worksheet_markup: {
      xml_declaration: XML_DECLARATION,
      namespace: SPREADSHEET_NAMESPACE,
      sheet_properties_xml: PINNED_SHEET_PROPERTIES_XML,
      column_widths_xml: PINNED_COLUMN_WIDTHS_XML,
      print_layout_xml: PINNED_PRINT_LAYOUT_XML,
    },
    exact_row_numbers: PINNED_ROW_NUMBERS,
    exact_cell_kinds: PINNED_CELL_KINDS,
    fixed_inline_values: PINNED_FIXED_INLINE_VALUES,
    dynamic_invoice_fields: PINNED_DYNAMIC_INVOICE_FIELDS,
    numeric_minimums: PINNED_NUMERIC_MINIMUMS,
    print_layout: {
      paper_size: "letter",
      orientation: "landscape",
      fit_to_width_pages: 1,
      fit_to_height_pages: 1,
      margins_inches: {
        left: 0.3,
        right: 0.3,
        top: 0.5,
        bottom: 0.5,
        header: 0,
        footer: 0,
      },
    },
    formulas: PINNED_FORMULAS,
  },
  numeric_units: "nonnegative safe integer minor units",
  non_conclusions: [
    "source authenticity",
    "tax-rate correctness",
    "approval to pay",
    "arbitrary workbook extraction",
  ],
} as const);

export const SYNTHETIC_XLSX_INVOICE_POLICY = Object.freeze({
  id: SYNTHETIC_XLSX_INVOICE_POLICY_DEFINITION.policy_id,
  version: SYNTHETIC_XLSX_INVOICE_POLICY_DEFINITION.policy_version,
  digest: canonicalDigest(SYNTHETIC_XLSX_INVOICE_POLICY_DEFINITION),
});

export class InvoiceWorkbookInputError extends Error {
  readonly code: string;

  constructor(code: string) {
    super("The selected synthetic invoice workbook could not be checked.");
    this.name = "InvoiceWorkbookInputError";
    this.code = code;
  }
}

function fail(code: string): never {
  throw new InvoiceWorkbookInputError(code);
}

function readUInt16(bytes: Buffer, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.byteLength) {
    fail("xlsx_zip_structure_invalid");
  }
  return bytes.readUInt16LE(offset);
}

function readUInt32(bytes: Buffer, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) {
    fail("xlsx_zip_structure_invalid");
  }
  return bytes.readUInt32LE(offset);
}

let crcTable: Uint32Array | undefined;

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let value = 0; value < 256; value += 1) {
      let current = value;
      for (let bit = 0; bit < 8; bit += 1) {
        current = (current & 1) === 1
          ? 0xedb88320 ^ (current >>> 1)
          : current >>> 1;
      }
      crcTable[value] = current >>> 0;
    }
  }
  let current = 0xffffffff;
  for (const byte of bytes) {
    current = crcTable[(current ^ byte) & 0xff]! ^ (current >>> 8);
  }
  return (current ^ 0xffffffff) >>> 0;
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

function decodeEntryName(bytes: Uint8Array): string {
  let name: string;
  try {
    name = utf8.decode(bytes);
  } catch {
    fail("xlsx_zip_entry_name_invalid");
  }
  if (
    name.length < 1
    || name.length > 64
    || !/^[\x20-\x7e]+$/u.test(name)
    || name.includes("\\")
    || name.includes("\u0000")
    || name.startsWith("/")
    || name.split("/").some((segment) =>
      segment.length === 0 || segment === "." || segment === "..")
  ) {
    fail("xlsx_zip_entry_name_invalid");
  }
  return name;
}

type CentralEntry = {
  name: string;
  flags: number;
  method: number;
  modifiedTime: number;
  modifiedDate: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
};

function supportedFlags(flags: number): boolean {
  return flags === 0 || flags === 0x0800;
}

function parseCentralDirectory(
  archive: Buffer,
  centralOffset: number,
  centralSize: number,
): CentralEntry[] {
  const entries: CentralEntry[] = [];
  let cursor = centralOffset;
  const centralEnd = centralOffset + centralSize;
  for (let index = 0; index < ENTRY_PROFILE.length; index += 1) {
    if (
      cursor + 46 > centralEnd
      || readUInt32(archive, cursor) !== 0x02014b50
    ) {
      fail("xlsx_zip_structure_invalid");
    }
    const flags = readUInt16(archive, cursor + 8);
    const method = readUInt16(archive, cursor + 10);
    const modifiedTime = readUInt16(archive, cursor + 12);
    const modifiedDate = readUInt16(archive, cursor + 14);
    const crc = readUInt32(archive, cursor + 16);
    const compressedSize = readUInt32(archive, cursor + 20);
    const uncompressedSize = readUInt32(archive, cursor + 24);
    const nameLength = readUInt16(archive, cursor + 28);
    const extraLength = readUInt16(archive, cursor + 30);
    const commentLength = readUInt16(archive, cursor + 32);
    const diskStart = readUInt16(archive, cursor + 34);
    const localOffset = readUInt32(archive, cursor + 42);
    if (
      compressedSize === 0xffffffff
      || uncompressedSize === 0xffffffff
      || localOffset === 0xffffffff
      || diskStart !== 0
      || extraLength !== 0
      || commentLength !== 0
    ) {
      fail("xlsx_zip_feature_unsupported");
    }
    if (!supportedFlags(flags) || (method !== 0 && method !== 8)) {
      fail("xlsx_zip_feature_unsupported");
    }
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > centralEnd) fail("xlsx_zip_structure_invalid");
    const name = decodeEntryName(archive.subarray(nameStart, nameEnd));
    const profile = ENTRY_PROFILE[index]!;
    if (name !== profile.name) fail("xlsx_package_profile_invalid");
    if (
      uncompressedSize < 1
      || uncompressedSize > profile.maxInflatedBytes
      || compressedSize < 1
      || uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO
    ) {
      fail("xlsx_zip_limit_exceeded");
    }
    entries.push({
      name,
      flags,
      method,
      modifiedTime,
      modifiedDate,
      crc,
      compressedSize,
      uncompressedSize,
      localOffset,
    });
    cursor = nameEnd;
  }
  if (cursor !== centralEnd) fail("xlsx_zip_structure_invalid");
  if (
    new Set(entries.map((entry) => entry.name)).size !== entries.length
    || new Set(entries.map((entry) => entry.name.toLowerCase())).size
      !== entries.length
  ) {
    fail("xlsx_zip_duplicate_entry");
  }
  return entries;
}

function inflateEntry(
  archive: Buffer,
  entry: CentralEntry,
  profile: (typeof ENTRY_PROFILE)[number],
  expectedOffset: number,
): { bytes: Buffer; nextOffset: number } {
  const cursor = entry.localOffset;
  if (
    cursor !== expectedOffset
    || cursor + 30 > archive.byteLength
    || readUInt32(archive, cursor) !== 0x04034b50
  ) {
    fail("xlsx_zip_structure_invalid");
  }
  const flags = readUInt16(archive, cursor + 6);
  const method = readUInt16(archive, cursor + 8);
  const modifiedTime = readUInt16(archive, cursor + 10);
  const modifiedDate = readUInt16(archive, cursor + 12);
  const crc = readUInt32(archive, cursor + 14);
  const compressedSize = readUInt32(archive, cursor + 18);
  const uncompressedSize = readUInt32(archive, cursor + 22);
  const nameLength = readUInt16(archive, cursor + 26);
  const extraLength = readUInt16(archive, cursor + 28);
  if (extraLength !== 0) fail("xlsx_zip_feature_unsupported");
  const nameStart = cursor + 30;
  const nameEnd = nameStart + nameLength;
  const dataEnd = nameEnd + compressedSize;
  if (dataEnd > archive.byteLength) fail("xlsx_zip_structure_invalid");
  const name = decodeEntryName(archive.subarray(nameStart, nameEnd));
  if (
    name !== entry.name
    || flags !== entry.flags
    || method !== entry.method
    || modifiedTime !== entry.modifiedTime
    || modifiedDate !== entry.modifiedDate
    || crc !== entry.crc
    || compressedSize !== entry.compressedSize
    || uncompressedSize !== entry.uncompressedSize
  ) {
    fail("xlsx_zip_header_mismatch");
  }
  const compressed = archive.subarray(nameEnd, dataEnd);
  let bytes: Buffer;
  if (method === 0) {
    if (compressedSize !== uncompressedSize) {
      fail("xlsx_zip_header_mismatch");
    }
    bytes = Buffer.from(compressed);
  } else {
    try {
      bytes = inflateRawSync(compressed, {
        maxOutputLength: profile.maxInflatedBytes,
      });
    } catch {
      fail("xlsx_zip_limit_exceeded");
    }
  }
  if (bytes.byteLength !== uncompressedSize) {
    fail("xlsx_zip_header_mismatch");
  }
  if (crc32(bytes) !== crc) fail("xlsx_zip_crc_invalid");
  return { bytes, nextOffset: dataEnd };
}

function parseArchive(input: Uint8Array): ReadonlyMap<string, Buffer> {
  if (!(input instanceof Uint8Array)) {
    fail("xlsx_zip_structure_invalid");
  }
  const archive = Buffer.from(input);
  if (
    archive.byteLength < 22
    || archive.byteLength > MAX_WORKBOOK_BYTES
  ) {
    fail("xlsx_zip_limit_exceeded");
  }
  const eocdOffset = archive.byteLength - 22;
  if (readUInt32(archive, eocdOffset) !== 0x06054b50) {
    fail("xlsx_zip_structure_invalid");
  }
  const disk = readUInt16(archive, eocdOffset + 4);
  const centralDisk = readUInt16(archive, eocdOffset + 6);
  const diskEntries = readUInt16(archive, eocdOffset + 8);
  const totalEntries = readUInt16(archive, eocdOffset + 10);
  const centralSize = readUInt32(archive, eocdOffset + 12);
  const centralOffset = readUInt32(archive, eocdOffset + 16);
  const commentLength = readUInt16(archive, eocdOffset + 20);
  if (
    disk !== 0
    || centralDisk !== 0
    || commentLength !== 0
    || diskEntries === 0xffff
    || totalEntries === 0xffff
  ) {
    fail("xlsx_zip_feature_unsupported");
  }
  if (
    diskEntries !== ENTRY_PROFILE.length
    || totalEntries !== ENTRY_PROFILE.length
  ) {
    fail("xlsx_package_profile_invalid");
  }
  if (
    centralOffset < 1
    || centralSize < 1
    || centralOffset + centralSize !== eocdOffset
  ) {
    fail("xlsx_zip_structure_invalid");
  }
  const central = parseCentralDirectory(
    archive,
    centralOffset,
    centralSize,
  );
  const output = new Map<string, Buffer>();
  let expectedOffset = 0;
  let totalInflated = 0;
  for (let index = 0; index < central.length; index += 1) {
    const entry = central[index]!;
    const profile = ENTRY_PROFILE[index]!;
    const inflated = inflateEntry(
      archive,
      entry,
      profile,
      expectedOffset,
    );
    expectedOffset = inflated.nextOffset;
    totalInflated += inflated.bytes.byteLength;
    if (totalInflated > MAX_TOTAL_INFLATED_BYTES) {
      fail("xlsx_zip_limit_exceeded");
    }
    output.set(entry.name, inflated.bytes);
  }
  if (expectedOffset !== centralOffset) {
    fail("xlsx_zip_structure_invalid");
  }
  return output;
}

function decodeXml(bytes: Uint8Array): string {
  let value: string;
  try {
    value = utf8.decode(bytes);
  } catch {
    fail("xlsx_xml_unsupported");
  }
  if (
    value.charCodeAt(0) === 0xfeff
    || /<!DOCTYPE|<!ENTITY|<!\[CDATA\[|<!--|<\?(?!xml )/u.test(value)
  ) {
    fail("xlsx_xml_unsupported");
  }
  return value;
}

function exactPackageXml(parts: ReadonlyMap<string, Buffer>): void {
  for (const profile of ENTRY_PROFILE.slice(0, 4)) {
    const bytes = parts.get(profile.name);
    if (!bytes) fail("xlsx_package_profile_invalid");
    const xml = decodeXml(bytes);
    if (!("exactXml" in profile) || xml !== profile.exactXml) {
      if (
        /vbaProject|macroEnabled|macrosheet/iu.test(xml)
      ) {
        fail("xlsx_macro_forbidden");
      }
      if (
        /externalLink|TargetMode="External"|connections|queryTable|oleObject|activeX/iu
          .test(xml)
      ) {
        fail("xlsx_external_reference_forbidden");
      }
      fail("xlsx_package_profile_invalid");
    }
  }
}

function decodeXmlText(raw: string): string {
  if (raw.length > 4_096) fail("xlsx_cell_ambiguous");
  const entityStripped = raw.replace(
    /&(?:amp|lt|gt|quot|apos);/gu,
    "",
  );
  if (entityStripped.includes("&")) fail("xlsx_xml_unsupported");
  const decoded = raw.replace(
    /&(?:amp|lt|gt|quot|apos);/gu,
    (entity) => {
      switch (entity) {
        case "&amp;": return "&";
        case "&lt;": return "<";
        case "&gt;": return ">";
        case "&quot;": return '"';
        case "&apos;": return "'";
        default: return "";
      }
    },
  );
  if (
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(decoded)
  ) {
    fail("xlsx_xml_unsupported");
  }
  return decoded;
}

function integerCell(raw: string, minimum = 0): number {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(raw)) {
    fail("xlsx_number_invalid");
  }
  const parsed = BigInt(raw);
  if (
    parsed < BigInt(minimum)
    || parsed > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    fail("xlsx_number_invalid");
  }
  return Number(parsed);
}

type ParsedCell =
  | { kind: "inline"; value: string }
  | { kind: "number"; raw: string; value: number }
  | {
      kind: "formula";
      formula: string;
      cachedRaw: string;
      cachedValue: number;
    };

function parseCells(
  rowNumber: number,
  body: string,
): ReadonlyMap<string, ParsedCell> {
  const cells = new Map<string, ParsedCell>();
  let rest = body;
  while (rest.length > 0) {
    const opening = /^<c r="([A-E][1-9][0-9]*)"( t="inlineStr")?>/u
      .exec(rest);
    if (!opening) fail("xlsx_layout_invalid");
    const reference = opening[1]!;
    if (
      Number(reference.replace(/^[A-E]/u, "")) !== rowNumber
      || cells.has(reference)
    ) {
      fail("xlsx_cell_ambiguous");
    }
    const bodyStart = opening[0].length;
    const end = rest.indexOf("</c>", bodyStart);
    if (end < 0) fail("xlsx_layout_invalid");
    const cellBody = rest.slice(bodyStart, end);
    if (opening[2]) {
      const inline = /^<is><t>([^<]*)<\/t><\/is>$/u.exec(cellBody);
      if (!inline) fail("xlsx_cell_ambiguous");
      cells.set(reference, {
        kind: "inline",
        value: decodeXmlText(inline[1]!),
      });
    } else {
      const formula =
        /^<f>([^<]*)<\/f><v>([^<]*)<\/v>$/u.exec(cellBody);
      if (formula) {
        cells.set(reference, {
          kind: "formula",
          formula: decodeXmlText(formula[1]!),
          cachedRaw: formula[2]!,
          cachedValue: integerCell(formula[2]!),
        });
      } else {
        const number = /^<v>([^<]*)<\/v>$/u.exec(cellBody);
        if (!number) fail("xlsx_cell_ambiguous");
        cells.set(reference, {
          kind: "number",
          raw: number[1]!,
          value: integerCell(number[1]!),
        });
      }
    }
    rest = rest.slice(end + "</c>".length);
  }
  return cells;
}

function parseWorksheet(
  bytes: Uint8Array,
): ReadonlyMap<string, ParsedCell> {
  const xml = decodeXml(bytes);
  const prefix = `${XML_DECLARATION}<worksheet xmlns="${SPREADSHEET_NAMESPACE}">${PINNED_SHEET_PROPERTIES_XML}<dimension ref="A1:E17"/>${PINNED_COLUMN_WIDTHS_XML}<sheetData>`;
  const suffix = `</sheetData>${PINNED_PRINT_LAYOUT_XML}</worksheet>`;
  if (!xml.startsWith(prefix) || !xml.endsWith(suffix)) {
    if (/externalLink|TargetMode="External"/iu.test(xml)) {
      fail("xlsx_external_reference_forbidden");
    }
    if (/vba|macro/iu.test(xml)) fail("xlsx_macro_forbidden");
    fail("xlsx_layout_invalid");
  }
  let rest = xml.slice(prefix.length, -suffix.length);
  const rows = new Map<number, ReadonlyMap<string, ParsedCell>>();
  while (rest.length > 0) {
    const opening = /^<row r="([1-9][0-9]*)">/u.exec(rest);
    if (!opening) fail("xlsx_layout_invalid");
    const rowNumber = Number(opening[1]);
    if (rows.has(rowNumber)) fail("xlsx_cell_ambiguous");
    const bodyStart = opening[0].length;
    const end = rest.indexOf("</row>", bodyStart);
    if (end < 0) fail("xlsx_layout_invalid");
    rows.set(
      rowNumber,
      parseCells(rowNumber, rest.slice(bodyStart, end)),
    );
    rest = rest.slice(end + "</row>".length);
  }
  if (
    stableJson([...rows.keys()]) !== stableJson(PINNED_ROW_NUMBERS)
  ) {
    fail("xlsx_layout_invalid");
  }
  const cells = new Map<string, ParsedCell>();
  for (const rowCells of rows.values()) {
    for (const [reference, cell] of rowCells) {
      if (cells.has(reference)) fail("xlsx_cell_ambiguous");
      cells.set(reference, cell);
    }
  }
  if (
    stableJson([...cells.keys()])
      !== stableJson(Object.keys(PINNED_CELL_KINDS))
  ) {
    fail("xlsx_layout_invalid");
  }
  for (const [reference, kind] of Object.entries(PINNED_CELL_KINDS)) {
    if (cells.get(reference)?.kind !== kind) {
      fail("xlsx_cell_ambiguous");
    }
  }
  return cells;
}

function inline(
  cells: ReadonlyMap<string, ParsedCell>,
  reference: string,
): string {
  const cell = cells.get(reference);
  if (!cell || cell.kind !== "inline") fail("xlsx_cell_ambiguous");
  return cell.value;
}

function number(
  cells: ReadonlyMap<string, ParsedCell>,
  reference: string,
  minimum = 0,
): number {
  const cell = cells.get(reference);
  if (!cell || cell.kind !== "number") fail("xlsx_cell_ambiguous");
  return integerCell(cell.raw, minimum);
}

function formula(
  cells: ReadonlyMap<string, ParsedCell>,
  reference: string,
  expectedFormula: string,
  expectedValue: bigint,
): number {
  const cell = cells.get(reference);
  if (!cell || cell.kind !== "formula") fail("xlsx_cell_ambiguous");
  if (cell.formula !== expectedFormula) {
    if (
      /\[[^\]]+\]|WEBSERVICE|DDE|https?:|file:/iu.test(cell.formula)
    ) {
      fail("xlsx_external_reference_forbidden");
    }
    fail("xlsx_formula_invalid");
  }
  if (
    expectedValue < 0n
    || expectedValue > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    fail("xlsx_number_invalid");
  }
  if (BigInt(cell.cachedValue) !== expectedValue) {
    fail("xlsx_formula_cached_value_mismatch");
  }
  return cell.cachedValue;
}

function label(
  cells: ReadonlyMap<string, ParsedCell>,
  reference: string,
  expected: string,
): void {
  if (inline(cells, reference) !== expected) {
    fail("xlsx_layout_invalid");
  }
}

function normalizedInvoiceFromCells(
  cells: ReadonlyMap<string, ParsedCell>,
): {
  invoice: InvoiceRecord;
  trace: unknown;
} {
  for (
    const [reference, expected]
    of Object.entries(PINNED_FIXED_INLINE_VALUES)
  ) {
    label(cells, reference, expected);
  }
  const line1Quantity = number(
    cells,
    "C10",
    PINNED_NUMERIC_MINIMUMS.C10,
  );
  const line1UnitPrice = number(
    cells,
    "D10",
    PINNED_NUMERIC_MINIMUMS.D10,
  );
  const line2Quantity = number(
    cells,
    "C11",
    PINNED_NUMERIC_MINIMUMS.C11,
  );
  const line2UnitPrice = number(
    cells,
    "D11",
    PINNED_NUMERIC_MINIMUMS.D11,
  );
  const line1Extended = formula(
    cells,
    "E10",
    PINNED_FORMULAS.E10,
    BigInt(line1Quantity) * BigInt(line1UnitPrice),
  );
  const line2Extended = formula(
    cells,
    "E11",
    PINNED_FORMULAS.E11,
    BigInt(line2Quantity) * BigInt(line2UnitPrice),
  );
  const subtotal = formula(
    cells,
    "E13",
    PINNED_FORMULAS.E13,
    BigInt(line1Extended) + BigInt(line2Extended),
  );
  const tax = number(cells, "E14", PINNED_NUMERIC_MINIMUMS.E14);
  const total = formula(
    cells,
    "E15",
    PINNED_FORMULAS.E15,
    BigInt(subtotal) + BigInt(tax),
  );
  const candidate = {
    schema: "riddle.synthetic.invoice.v1",
    buyer_id: inline(cells, "B2"),
    supplier_id: inline(cells, "B3"),
    invoice_id: inline(cells, "B4"),
    po_id: inline(cells, "B5"),
    currency: inline(cells, "B6"),
    payment_terms: inline(cells, "B7"),
    line_items: [
      {
        line_id: inline(cells, "A10"),
        sku: inline(cells, "B10"),
        quantity: line1Quantity,
        unit_price_minor: line1UnitPrice,
        extended_minor: line1Extended,
      },
      {
        line_id: inline(cells, "A11"),
        sku: inline(cells, "B11"),
        quantity: line2Quantity,
        unit_price_minor: line2UnitPrice,
        extended_minor: line2Extended,
      },
    ],
    subtotal_minor: subtotal,
    tax_minor: tax,
    total_minor: total,
    memo: inline(cells, "B17"),
  };
  let invoice: InvoiceRecord;
  try {
    invoice = parseInvoice(
      Buffer.from(canonicalPrettyJson(candidate), "utf8"),
    );
  } catch {
    fail("xlsx_normalized_invoice_invalid");
  }
  return {
    invoice,
    trace: {
      version: "riddle-proof.synthetic-xlsx-invoice-private-trace.v1",
      profile_digest: SYNTHETIC_XLSX_INVOICE_POLICY.digest,
      cells: [...cells.entries()].map(([reference, cell]) => {
        if (cell.kind === "inline") {
          return { reference, kind: cell.kind, value: cell.value };
        }
        if (cell.kind === "number") {
          return { reference, kind: cell.kind, value: cell.raw };
        }
        return {
          reference,
          kind: cell.kind,
          formula: cell.formula,
          cached: cell.cachedRaw,
        };
      }),
    },
  };
}

export function extractSyntheticInvoiceWorkbook(
  bytes: Uint8Array,
): InvoiceWorkbookExtraction {
  const parts = parseArchive(bytes);
  exactPackageXml(parts);
  const worksheet = parts.get("xl/worksheets/sheet1.xml");
  if (!worksheet) fail("xlsx_package_profile_invalid");
  const normalized = normalizedInvoiceFromCells(parseWorksheet(worksheet));
  const normalizedInvoiceBytes = Buffer.from(
    canonicalPrettyJson(normalized.invoice),
    "utf8",
  );
  const workbookDigest = sha256Bytes(bytes);
  const normalizedInvoiceDigest = sha256Bytes(normalizedInvoiceBytes);
  const privateTraceDigest = canonicalDigest({
    ...normalized.trace as object,
    workbook_digest: workbookDigest,
    normalized_invoice_digest: normalizedInvoiceDigest,
  });
  const bindingDigest = canonicalDigest({
    version: "riddle-proof.synthetic-xlsx-invoice-binding.v1",
    policy: SYNTHETIC_XLSX_INVOICE_POLICY,
    workbook_digest: workbookDigest,
    normalized_invoice_digest: normalizedInvoiceDigest,
    private_trace_digest: privateTraceDigest,
  });
  return {
    policy: { ...SYNTHETIC_XLSX_INVOICE_POLICY },
    workbook_digest: workbookDigest,
    normalized_invoice: normalized.invoice,
    normalized_invoice_bytes: normalizedInvoiceBytes,
    normalized_invoice_digest: normalizedInvoiceDigest,
    private_trace_digest: privateTraceDigest,
    binding_digest: bindingDigest,
  };
}

function xmlText(value: string): string {
  if (
    value.length < 1
    || value.length > 4_096
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)
  ) {
    fail("xlsx_normalized_invoice_invalid");
  }
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function inlineCell(reference: string, value: string): string {
  return `<c r="${reference}" t="inlineStr"><is><t>${xmlText(value)}</t></is></c>`;
}

function numberCell(reference: string, value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail("xlsx_number_invalid");
  }
  return `<c r="${reference}"><v>${value}</v></c>`;
}

function formulaCell(
  reference: string,
  formulaValue: string,
  cached: number,
): string {
  if (!Number.isSafeInteger(cached) || cached < 0) {
    fail("xlsx_number_invalid");
  }
  return `<c r="${reference}"><f>${formulaValue}</f><v>${cached}</v></c>`;
}

function row(numberValue: number, cells: readonly string[]): string {
  return `<row r="${numberValue}">${cells.join("")}</row>`;
}

function worksheetXml(invoice: InvoiceRecord): string {
  if (invoice.line_items.length !== 2) {
    fail("xlsx_normalized_invoice_invalid");
  }
  const first = invoice.line_items[0]!;
  const second = invoice.line_items[1]!;
  return `${XML_DECLARATION}<worksheet xmlns="${SPREADSHEET_NAMESPACE}">${PINNED_SHEET_PROPERTIES_XML}<dimension ref="A1:E17"/>${PINNED_COLUMN_WIDTHS_XML}<sheetData>${[
    row(1, [
      inlineCell("A1", PINNED_FIXED_INLINE_VALUES.A1),
      inlineCell("B1", PINNED_FIXED_INLINE_VALUES.B1),
    ]),
    row(2, [
      inlineCell("A2", PINNED_FIXED_INLINE_VALUES.A2),
      inlineCell("B2", invoice.buyer_id),
    ]),
    row(3, [
      inlineCell("A3", PINNED_FIXED_INLINE_VALUES.A3),
      inlineCell("B3", invoice.supplier_id),
    ]),
    row(4, [
      inlineCell("A4", PINNED_FIXED_INLINE_VALUES.A4),
      inlineCell("B4", invoice.invoice_id),
    ]),
    row(5, [
      inlineCell("A5", PINNED_FIXED_INLINE_VALUES.A5),
      inlineCell("B5", invoice.po_id),
    ]),
    row(6, [
      inlineCell("A6", PINNED_FIXED_INLINE_VALUES.A6),
      inlineCell("B6", invoice.currency),
    ]),
    row(7, [
      inlineCell("A7", PINNED_FIXED_INLINE_VALUES.A7),
      inlineCell("B7", invoice.payment_terms),
    ]),
    row(9, [
      inlineCell("A9", PINNED_FIXED_INLINE_VALUES.A9),
      inlineCell("B9", PINNED_FIXED_INLINE_VALUES.B9),
      inlineCell("C9", PINNED_FIXED_INLINE_VALUES.C9),
      inlineCell("D9", PINNED_FIXED_INLINE_VALUES.D9),
      inlineCell("E9", PINNED_FIXED_INLINE_VALUES.E9),
    ]),
    row(10, [
      inlineCell("A10", first.line_id),
      inlineCell("B10", first.sku),
      numberCell("C10", first.quantity),
      numberCell("D10", first.unit_price_minor),
      formulaCell("E10", PINNED_FORMULAS.E10, first.extended_minor),
    ]),
    row(11, [
      inlineCell("A11", second.line_id),
      inlineCell("B11", second.sku),
      numberCell("C11", second.quantity),
      numberCell("D11", second.unit_price_minor),
      formulaCell("E11", PINNED_FORMULAS.E11, second.extended_minor),
    ]),
    row(13, [
      inlineCell("A13", PINNED_FIXED_INLINE_VALUES.A13),
      formulaCell("E13", PINNED_FORMULAS.E13, invoice.subtotal_minor),
    ]),
    row(14, [
      inlineCell("A14", PINNED_FIXED_INLINE_VALUES.A14),
      numberCell("E14", invoice.tax_minor),
    ]),
    row(15, [
      inlineCell("A15", PINNED_FIXED_INLINE_VALUES.A15),
      formulaCell("E15", PINNED_FORMULAS.E15, invoice.total_minor),
    ]),
    row(17, [
      inlineCell("A17", PINNED_FIXED_INLINE_VALUES.A17),
      inlineCell("B17", invoice.memo),
    ]),
  ].join("")}</sheetData>${PINNED_PRINT_LAYOUT_XML}</worksheet>`;
}

function writeUInt16(value: number): Buffer {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value, 0);
  return bytes;
}

function writeUInt32(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value >>> 0, 0);
  return bytes;
}

function storedArchive(parts: ReadonlyArray<readonly [string, Buffer]>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, bytes] of parts) {
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(bytes);
    const local = Buffer.concat([
      writeUInt32(0x04034b50),
      writeUInt16(10),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(crc),
      writeUInt32(bytes.byteLength),
      writeUInt32(bytes.byteLength),
      writeUInt16(nameBytes.byteLength),
      writeUInt16(0),
      nameBytes,
      bytes,
    ]);
    locals.push(local);
    centrals.push(Buffer.concat([
      writeUInt32(0x02014b50),
      writeUInt16(20),
      writeUInt16(10),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(crc),
      writeUInt32(bytes.byteLength),
      writeUInt32(bytes.byteLength),
      writeUInt16(nameBytes.byteLength),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(0),
      writeUInt32(offset),
      nameBytes,
    ]));
    offset += local.byteLength;
  }
  const localBytes = Buffer.concat(locals);
  const centralBytes = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    writeUInt32(0x06054b50),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(parts.length),
    writeUInt16(parts.length),
    writeUInt32(centralBytes.byteLength),
    writeUInt32(localBytes.byteLength),
    writeUInt16(0),
  ]);
  return Buffer.concat([localBytes, centralBytes, eocd]);
}

function workbookBytes(invoice: InvoiceRecord): Buffer {
  return storedArchive([
    ["[Content_Types].xml", Buffer.from(CONTENT_TYPES_XML, "utf8")],
    ["_rels/.rels", Buffer.from(ROOT_RELATIONSHIPS_XML, "utf8")],
    ["xl/workbook.xml", Buffer.from(WORKBOOK_XML, "utf8")],
    [
      "xl/_rels/workbook.xml.rels",
      Buffer.from(WORKBOOK_RELATIONSHIPS_XML, "utf8"),
    ],
    [
      "xl/worksheets/sheet1.xml",
      Buffer.from(worksheetXml(invoice), "utf8"),
    ],
  ]);
}

/**
 * Narrow fixture/revision authoring surface for the one synthetic profile.
 * It is not an arbitrary XLSX writer.
 */
export function createSyntheticInvoiceWorkbookFixture(
  invoice: InvoiceRecord,
): Uint8Array {
  let parsed: InvoiceRecord;
  try {
    parsed = parseInvoice(
      Buffer.from(canonicalPrettyJson(invoice), "utf8"),
    );
  } catch {
    fail("xlsx_normalized_invoice_invalid");
  }
  if (stableJson(parsed) !== stableJson(invoice)) {
    fail("xlsx_normalized_invoice_invalid");
  }
  const bytes = workbookBytes(parsed);
  const extraction = extractSyntheticInvoiceWorkbook(bytes);
  if (
    !Buffer.from(extraction.normalized_invoice_bytes).equals(
      Buffer.from(canonicalPrettyJson(parsed), "utf8"),
    )
  ) {
    fail("xlsx_fixture_roundtrip_failed");
  }
  return bytes;
}

function exactCorrectionInvoice(input: {
  extraction: InvoiceWorkbookExtraction;
  correction: TypedInvoiceCorrection;
}): InvoiceRecord {
  const invoice = input.extraction.normalized_invoice;
  const correction = input.correction;
  const correctionNumbers = [
    correction.from_quantity,
    correction.to_quantity,
    correction.from_extended_minor,
    correction.to_extended_minor,
    correction.from_subtotal_minor,
    correction.to_subtotal_minor,
    correction.from_tax_minor,
    correction.to_tax_minor,
    correction.from_total_minor,
    correction.to_total_minor,
  ];
  if (
    correction.version !== "riddle.synthetic.invoice-correction.v1"
    || correction.kind
      !== "align_invoice_line_to_ordered_and_received_quantity"
    || correctionNumbers.some((value) =>
      !Number.isSafeInteger(value) || value < 0)
    || correction.from_quantity < 1
    || correction.to_quantity < 1
    || correction.base_invoice_digest
      !== input.extraction.normalized_invoice_digest
    || correction.from_subtotal_minor !== invoice.subtotal_minor
    || correction.from_tax_minor !== invoice.tax_minor
    || correction.from_total_minor !== invoice.total_minor
  ) {
    fail("xlsx_correction_invalid");
  }
  const revised = jsonClone(invoice);
  const matches = revised.line_items.filter((line) =>
    line.line_id === correction.line_id && line.sku === correction.sku);
  if (matches.length !== 1) fail("xlsx_correction_invalid");
  const line = matches[0]!;
  if (
    line.quantity !== correction.from_quantity
    || line.extended_minor !== correction.from_extended_minor
    || BigInt(correction.to_quantity) * BigInt(line.unit_price_minor)
      !== BigInt(correction.to_extended_minor)
  ) {
    fail("xlsx_correction_invalid");
  }
  line.quantity = correction.to_quantity;
  line.extended_minor = correction.to_extended_minor;
  revised.subtotal_minor = correction.to_subtotal_minor;
  revised.tax_minor = correction.to_tax_minor;
  revised.total_minor = correction.to_total_minor;
  let parsed: InvoiceRecord;
  try {
    parsed = parseInvoice(Buffer.from(canonicalPrettyJson(revised), "utf8"));
  } catch {
    fail("xlsx_correction_invalid");
  }
  return parsed;
}

export function reviseSyntheticInvoiceWorkbook(input: {
  workbook_bytes: Uint8Array;
  base_extraction: InvoiceWorkbookExtraction;
  correction: TypedInvoiceCorrection;
  expected_invoice: InvoiceRecord;
}): {
  workbook_bytes: Uint8Array;
  extraction: InvoiceWorkbookExtraction;
} {
  const observedBase = extractSyntheticInvoiceWorkbook(input.workbook_bytes);
  if (
    observedBase.workbook_digest
      !== input.base_extraction.workbook_digest
    || observedBase.binding_digest
      !== input.base_extraction.binding_digest
    || observedBase.normalized_invoice_digest
      !== input.base_extraction.normalized_invoice_digest
  ) {
    fail("xlsx_correction_base_mismatch");
  }
  const corrected = exactCorrectionInvoice({
    extraction: observedBase,
    correction: input.correction,
  });
  if (stableJson(corrected) !== stableJson(input.expected_invoice)) {
    fail("xlsx_correction_expected_invoice_mismatch");
  }
  const nextWorkbook = workbookBytes(corrected);
  const extraction = extractSyntheticInvoiceWorkbook(nextWorkbook);
  if (
    !Buffer.from(extraction.normalized_invoice_bytes).equals(
      Buffer.from(canonicalPrettyJson(input.expected_invoice), "utf8"),
    )
    || extraction.workbook_digest === observedBase.workbook_digest
  ) {
    fail("xlsx_correction_roundtrip_failed");
  }
  return {
    workbook_bytes: nextWorkbook,
    extraction,
  };
}
