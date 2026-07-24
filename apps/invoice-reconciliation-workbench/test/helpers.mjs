import { generateKeyPairSync } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const appRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const fixtureRoot = join(appRoot, "fixtures", "over-invoiced");

export function freshWorkspace(t, prefix = "invoice-workbench-") {
  const parent = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return join(parent, "workbench");
}

export function fixtureBytes() {
  return {
    invoice: readFileSync(join(fixtureRoot, "invoice.v1.json")),
    purchase_order: readFileSync(join(fixtureRoot, "purchase-order.json")),
    receipt: readFileSync(join(fixtureRoot, "receipt.json")),
  };
}

export function workbookFixtureBytes() {
  return readFileSync(join(fixtureRoot, "invoice.v1.xlsx"));
}

export function parseFixture(name) {
  return JSON.parse(readFileSync(join(fixtureRoot, name), "utf8"));
}

export function keyPair(keyId = "invoice-workbench-test-key") {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    key_id: keyId,
    private_key_pkcs8_base64: privateKey
      .export({ format: "der", type: "pkcs8" })
      .toString("base64"),
    public_key_spki_base64: publicKey
      .export({ format: "der", type: "spki" })
      .toString("base64"),
  };
}

export function copyFixtureSet(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const paths = {
    invoice_workbook_path: join(directory, "invoice.v1.xlsx"),
    purchase_order_path: join(directory, "purchase-order.json"),
    receipt_path: join(directory, "receipt.json"),
    revision: "r1",
  };
  for (const [source, destination] of [
    [
      join(fixtureRoot, "invoice.v1.xlsx"),
      paths.invoice_workbook_path,
    ],
    [join(fixtureRoot, "purchase-order.json"), paths.purchase_order_path],
    [join(fixtureRoot, "receipt.json"), paths.receipt_path],
  ]) {
    copyFileSync(source, destination);
    chmodSync(destination, 0o600);
  }
  return paths;
}

export function writeJson(filename, value) {
  writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  chmodSync(filename, 0o600);
}

export function sequenceClock(values) {
  const queue = [...values];
  return {
    now() {
      const value = queue.shift();
      if (!value) throw new Error("Test clock exhausted.");
      return value;
    },
  };
}
