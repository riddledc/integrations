import { deflateRawSync } from "node:zlib";

const XML_DECLARATION =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const SPREADSHEET_NAMESPACE =
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const PINNED_SHEET_PROPERTIES_XML =
  '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>';
const PINNED_COLUMN_WIDTHS_XML = '<cols><col min="1" max="1" width="22" customWidth="1"/><col min="2" max="2" width="42" customWidth="1"/><col min="3" max="3" width="14" customWidth="1"/><col min="4" max="4" width="22" customWidth="1"/><col min="5" max="5" width="20" customWidth="1"/></cols>';
const PINNED_PRINT_LAYOUT_XML =
  '<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0" footer="0"/><pageSetup paperSize="1" orientation="landscape" fitToWidth="1" fitToHeight="1"/>';
const OFFICE_RELATIONSHIP_NAMESPACE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_RELATIONSHIP_NAMESPACE =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const CONTENT_TYPE_NAMESPACE =
  "http://schemas.openxmlformats.org/package/2006/content-types";

export const BASE_INVOICE = Object.freeze({
  schema: "riddle.synthetic.invoice.v1",
  buyer_id: "buyer-northwind",
  supplier_id: "supplier-acme",
  invoice_id: "INV-1042",
  po_id: "PO-7001",
  currency: "USD",
  payment_terms: "NET_30",
  line_items: [
    {
      line_id: "line-1",
      sku: "WIDGET-A",
      quantity: 10,
      unit_price_minor: 1250,
      extended_minor: 12500,
    },
    {
      line_id: "line-2",
      sku: "SERVICE-B",
      quantity: 12,
      unit_price_minor: 500,
      extended_minor: 6000,
    },
  ],
  subtotal_minor: 18500,
  tax_minor: 1480,
  total_minor: 19980,
  memo:
    "Synthetic fixture: line-2 deliberately exceeds the ordered and received quantity.",
});

function xmlText(value) {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function inline(reference, value) {
  return `<c r="${reference}" t="inlineStr"><is><t>${xmlText(value)}</t></is></c>`;
}

function number(reference, value) {
  return `<c r="${reference}"><v>${value}</v></c>`;
}

function formula(reference, expression, cached) {
  return `<c r="${reference}"><f>${expression}</f><v>${cached}</v></c>`;
}

function row(index, cells) {
  return `<row r="${index}">${cells.join("")}</row>`;
}

export function worksheetForInvoice(invoice = BASE_INVOICE) {
  const [first, second] = invoice.line_items;
  return `${XML_DECLARATION}<worksheet xmlns="${SPREADSHEET_NAMESPACE}">${PINNED_SHEET_PROPERTIES_XML}<dimension ref="A1:E17"/>${PINNED_COLUMN_WIDTHS_XML}<sheetData>${[
    row(1, [
      inline("A1", "schema"),
      inline("B1", "riddle.synthetic.invoice-workbook.v1"),
    ]),
    row(2, [inline("A2", "buyer_id"), inline("B2", invoice.buyer_id)]),
    row(3, [
      inline("A3", "supplier_id"),
      inline("B3", invoice.supplier_id),
    ]),
    row(4, [inline("A4", "invoice_id"), inline("B4", invoice.invoice_id)]),
    row(5, [inline("A5", "po_id"), inline("B5", invoice.po_id)]),
    row(6, [inline("A6", "currency"), inline("B6", invoice.currency)]),
    row(7, [
      inline("A7", "payment_terms"),
      inline("B7", invoice.payment_terms),
    ]),
    row(9, [
      inline("A9", "line_id"),
      inline("B9", "sku"),
      inline("C9", "quantity"),
      inline("D9", "unit_price_minor"),
      inline("E9", "extended_minor"),
    ]),
    row(10, [
      inline("A10", first.line_id),
      inline("B10", first.sku),
      number("C10", first.quantity),
      number("D10", first.unit_price_minor),
      formula("E10", "C10*D10", first.extended_minor),
    ]),
    row(11, [
      inline("A11", second.line_id),
      inline("B11", second.sku),
      number("C11", second.quantity),
      number("D11", second.unit_price_minor),
      formula("E11", "C11*D11", second.extended_minor),
    ]),
    row(13, [
      inline("A13", "subtotal_minor"),
      formula("E13", "SUM(E10:E11)", invoice.subtotal_minor),
    ]),
    row(14, [
      inline("A14", "tax_minor"),
      number("E14", invoice.tax_minor),
    ]),
    row(15, [
      inline("A15", "total_minor"),
      formula("E15", "E13+E14", invoice.total_minor),
    ]),
    row(17, [inline("A17", "memo"), inline("B17", invoice.memo)]),
  ].join("")}</sheetData>${PINNED_PRINT_LAYOUT_XML}</worksheet>`;
}

export function canonicalParts(invoice = BASE_INVOICE) {
  return [
    {
      name: "[Content_Types].xml",
      bytes: Buffer.from(
        `${XML_DECLARATION}<Types xmlns="${CONTENT_TYPE_NAMESPACE}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
        "utf8",
      ),
    },
    {
      name: "_rels/.rels",
      bytes: Buffer.from(
        `${XML_DECLARATION}<Relationships xmlns="${PACKAGE_RELATIONSHIP_NAMESPACE}"><Relationship Id="rId1" Type="${OFFICE_RELATIONSHIP_NAMESPACE}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
        "utf8",
      ),
    },
    {
      name: "xl/workbook.xml",
      bytes: Buffer.from(
        `${XML_DECLARATION}<workbook xmlns="${SPREADSHEET_NAMESPACE}" xmlns:r="${OFFICE_RELATIONSHIP_NAMESPACE}"><sheets><sheet name="Invoice" sheetId="1" r:id="rId1"/></sheets></workbook>`,
        "utf8",
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      bytes: Buffer.from(
        `${XML_DECLARATION}<Relationships xmlns="${PACKAGE_RELATIONSHIP_NAMESPACE}"><Relationship Id="rId1" Type="${OFFICE_RELATIONSHIP_NAMESPACE}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
        "utf8",
      ),
    },
    {
      name: "xl/worksheets/sheet1.xml",
      bytes: Buffer.from(worksheetForInvoice(invoice), "utf8"),
    },
  ];
}

let crcTable;

function crc32(bytes) {
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
    current = crcTable[(current ^ byte) & 0xff] ^ (current >>> 8);
  }
  return (current ^ 0xffffffff) >>> 0;
}

function u16(value) {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value, 0);
  return bytes;
}

function u32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value >>> 0, 0);
  return bytes;
}

export function zipParts(parts, options = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const method = part.method ?? options.method ?? 0;
    const flags = part.flags ?? options.flags ?? 0;
    const nameBytes = Buffer.from(part.name, "utf8");
    const raw = Buffer.from(part.bytes);
    const compressed = method === 8 ? deflateRawSync(raw) : raw;
    const checksum = crc32(raw);
    const localName = Buffer.from(part.localName ?? part.name, "utf8");
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(method === 8 ? 20 : 10),
      u16(flags),
      u16(method),
      u16(0),
      u16(0),
      u32(checksum),
      u32(compressed.byteLength),
      u32(raw.byteLength),
      u16(localName.byteLength),
      u16(0),
      localName,
      compressed,
    ]);
    locals.push(local);
    centrals.push(Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(method === 8 ? 20 : 10),
      u16(flags),
      u16(method),
      u16(0),
      u16(0),
      u32(checksum),
      u32(compressed.byteLength),
      u32(raw.byteLength),
      u16(nameBytes.byteLength),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]));
    offset += local.byteLength;
  }
  const localBytes = Buffer.concat(locals);
  const centralBytes = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(parts.length),
    u16(parts.length),
    u32(centralBytes.byteLength),
    u32(localBytes.byteLength),
    u16(0),
  ]);
  return Buffer.concat([localBytes, centralBytes, eocd]);
}

export function workbookForInvoice(invoice = BASE_INVOICE, options = {}) {
  return zipParts(canonicalParts(invoice), options);
}

export function replacePart(parts, name, replacement) {
  return parts.map((part) =>
    part.name === name
      ? { ...part, bytes: Buffer.from(replacement, "utf8") }
      : part);
}
