import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";

import {
  createInvoiceReconciliationWorkbench,
} from "../dist/application.js";
import { ordinaryState } from "../public/view-model.js";
import {
  fixtureRoot,
  freshWorkspace,
  keyPair,
  sequenceClock,
} from "./helpers.mjs";
import {
  BASE_INVOICE,
  workbookForInvoice,
} from "./xlsx-builder.mjs";

test("the workbench completes fail → typed correction → fresh conforming check", async (t) => {
  const workspace = freshWorkspace(t, "invoice-workbench-e2e-");
  const application = await createInvoiceReconciliationWorkbench({
    fixture_directory: fixtureRoot,
    workspace_directory: workspace,
    session_id: "session_application_001",
    signing_key: keyPair("application-test-key"),
    clock: sequenceClock([
      "2026-07-24T19:00:00.000Z",
      "2026-07-24T19:00:01.000Z",
      "2026-07-24T19:00:02.000Z",
      "2026-07-24T19:00:03.000Z",
    ]),
  });
  const originalInvoice = readFileSync(
    join(application.paths.records, "invoice.r1.xlsx"),
  );
  const originalPo = readFileSync(
    join(application.paths.records, "purchase-order.json"),
  );
  const originalReceipt = readFileSync(
    join(application.paths.records, "receipt.json"),
  );
  const ready = await application.snapshot();
  assert.equal(ready.can_check, true);
  assert.equal(ready.current_check, null);

  const failed = await application.checkCurrent();
  assert.equal(failed.current_check.disposition, "does_not_conform");
  assert.deepEqual(
    failed.current_check.findings.map(({ requirement_id }) => requirement_id),
    [
      "invoice_purchase_order_line_terms",
      "invoice_purchase_order_total",
      "invoice_receipt_quantities",
    ],
  );
  assert.match(
    failed.current_check.findings[0].explanation,
    /observed 12; expected 10/u,
  );
  assert.equal(failed.correction.available, true);
  assert.equal(failed.correction.changes.length, 5);
  const failedView = ordinaryState(failed);
  assert.equal(failedView.record_set.records.length, 3);
  assert.equal(failedView.current_check.findings.length, 3);
  assert.equal(failedView.current_check.passed_checks.length, 8);
  assert.equal(failedView.can_correct, true);

  const corrected = await application.applyCorrection();
  assert.equal(corrected.current_check, null);
  assert.equal(corrected.can_check, true);
  assert.equal(corrected.history[0].disposition, "stale");
  assert.equal(corrected.history[0].current, false);
  assert.deepEqual(
    readFileSync(join(application.paths.records, "invoice.r1.xlsx")),
    originalInvoice,
    "the original invoice specimen remains immutable",
  );
  assert.deepEqual(
    readFileSync(join(application.paths.records, "purchase-order.json")),
    originalPo,
  );
  assert.deepEqual(
    readFileSync(join(application.paths.records, "receipt.json")),
    originalReceipt,
  );
  assert.notDeepEqual(
    readFileSync(join(application.paths.records, "invoice.r2.xlsx")),
    originalInvoice,
  );

  const conformed = await application.checkCurrent();
  assert.equal(conformed.current_check.disposition, "conforms");
  const conformedView = ordinaryState(conformed);
  assert.equal(conformedView.current_check.findings.length, 0);
  assert.equal(conformedView.current_check.passed_checks.length, 11);
  assert.equal(conformedView.can_correct, false);
  assert.deepEqual(
    conformed.reuse.branches
      .filter(({ action }) => action === "reused")
      .map(({ branch_id }) => branch_id),
    ["purchase-order-capture", "receipt-capture"],
  );
  assert.deepEqual(
    conformed.reuse.branches
      .filter(({ action }) => action === "recomputed")
      .map(({ branch_id }) => branch_id),
    [
      "invoice-workbook-extraction",
      "invoice-capture",
      "invoice-to-purchase-order",
      "invoice-to-receipt",
      "three-record-root",
    ],
  );

  const oldAudit = await application.audit("invoicecheck_1");
  const newAudit = await application.audit("invoicecheck_2");
  assert.equal(oldAudit.disposition, "stale");
  assert.equal(newAudit.disposition, "conforms");
  assert.equal(newAudit.replay.ok, true);
  assert.equal(
    newAudit.subject.digest,
    newAudit.xlsx_source_binding.specimen_record_set_digest,
  );
  for (const value of Object.values(newAudit.xlsx_source_binding)
    .flatMap((entry) => typeof entry === "object"
      ? Object.values(entry)
      : [entry])) {
    assert.match(value, /^(?:sha256:[0-9a-f]{64}|[a-z0-9._-]+|1)$/u);
  }
  assert.deepEqual(
    oldAudit.cacheable_branch_certificate_ids.purchase_order,
    newAudit.cacheable_branch_certificate_ids.purchase_order,
  );
  assert.deepEqual(
    oldAudit.cacheable_branch_certificate_ids.receipt,
    newAudit.cacheable_branch_certificate_ids.receipt,
  );
  assert.deepEqual(newAudit.branch_cache_actions, {
    purchase_order: "reused",
    receipt: "reused",
  });
  const auditText = JSON.stringify(newAudit);
  for (const forbidden of [
    workspace,
    "invoice.r2.xlsx",
    "Synthetic fixture:",
    "buyer-northwind",
    "WIDGET-A",
    "C10*D10",
    "SUM(E10:E11)",
    "signature_base64",
    "private_key",
    "inline_artifacts",
    "checked_closure",
  ]) {
    assert.equal(auditText.includes(forbidden), false, `${forbidden} leaked`);
  }
  for (const directory of [
    application.paths.root,
    application.paths.records,
  ]) {
    assert.equal(statSync(directory).mode & 0o777, 0o700);
  }
  for (const filename of [
    "invoice.r1.xlsx",
    "invoice.r2.xlsx",
    "purchase-order.json",
    "receipt.json",
  ]) {
    assert.equal(
      statSync(join(application.paths.records, filename)).mode & 0o777,
      0o600,
    );
  }
});

test("a correction after the one-hour capture window refreshes unchanged branches and still conforms", async (t) => {
  const workspace = freshWorkspace(
    t,
    "invoice-workbench-expired-reuse-",
  );
  const application = await createInvoiceReconciliationWorkbench({
    fixture_directory: fixtureRoot,
    workspace_directory: workspace,
    session_id: "session_application_expired_reuse",
    signing_key: keyPair("application-expired-reuse-key"),
    clock: sequenceClock([
      "2026-07-24T18:00:00.000Z",
      "2026-07-24T18:00:00.001Z",
      "2026-07-24T19:00:00.002Z",
      "2026-07-24T19:00:00.003Z",
    ]),
  });

  const failed = await application.checkCurrent();
  assert.equal(failed.current_check.disposition, "does_not_conform");
  const oldAudit = await application.audit("invoicecheck_1");

  await application.applyCorrection();
  const conformed = await application.checkCurrent();
  assert.equal(conformed.current_check.disposition, "conforms");
  assert.equal(conformed.current_check.current, true);
  assert.match(
    conformed.reuse.summary,
    /branches were refreshed because their prior captures were outside the current one-hour freshness window/u,
  );
  assert.deepEqual(
    conformed.reuse.branches
      .filter(({ action }) => action === "refreshed")
      .map(({ branch_id }) => branch_id),
    ["purchase-order-capture", "receipt-capture"],
  );
  assert.deepEqual(
    conformed.reuse.branches
      .filter(({ action }) => action === "reused")
      .map(({ branch_id }) => branch_id),
    [],
  );
  assert.deepEqual(
    conformed.reuse.branches
      .filter(({ action }) => action === "recomputed")
      .map(({ branch_id }) => branch_id),
    [
      "invoice-workbook-extraction",
      "invoice-capture",
      "invoice-to-purchase-order",
      "invoice-to-receipt",
      "three-record-root",
    ],
  );
  assert.deepEqual(
    {
      reused: conformed.history[1].reused_branch_count,
      refreshed: conformed.history[1].refreshed_branch_count,
      recomputed: conformed.history[1].recomputed_branch_count,
    },
    { reused: 0, refreshed: 2, recomputed: 5 },
  );

  const newAudit = await application.audit("invoicecheck_2");
  assert.equal(newAudit.disposition, "conforms");
  assert.equal(newAudit.replay.ok, true);
  assert.notDeepEqual(
    oldAudit.cacheable_branch_certificate_ids.purchase_order,
    newAudit.cacheable_branch_certificate_ids.purchase_order,
    "expired purchase-order certificates are freshly issued",
  );
  assert.notDeepEqual(
    oldAudit.cacheable_branch_certificate_ids.receipt,
    newAudit.cacheable_branch_certificate_ids.receipt,
    "expired receipt certificates are freshly issued",
  );
  assert.deepEqual(newAudit.branch_cache_actions, {
    purchase_order: "refreshed",
    receipt: "refreshed",
  });
});

test("an out-of-band record change is stale/unavailable, never silently rebased", async (t) => {
  const workspace = freshWorkspace(t, "invoice-workbench-stale-");
  const application = await createInvoiceReconciliationWorkbench({
    fixture_directory: fixtureRoot,
    workspace_directory: workspace,
    session_id: "session_application_002",
    signing_key: keyPair("stale-test-key"),
    clock: sequenceClock([
      "2026-07-24T19:30:00.000Z",
      "2026-07-24T19:30:01.000Z",
    ]),
  });
  const poPath = join(application.paths.records, "purchase-order.json");
  const po = JSON.parse(readFileSync(poPath, "utf8"));
  po.currency = "EUR";
  writeFileSync(poPath, `${JSON.stringify(po, null, 2)}\n`, { mode: 0o600 });
  const result = await application.checkCurrent();
  assert.equal(result.current_check.disposition, "stale");
  assert.equal(result.can_correct, false);
  const audit = await application.audit("invoicecheck_1");
  assert.equal(audit.current, false);
  assert.equal(audit.historical_disposition, "could_not_check");
  assert.equal(
    audit.diagnostic_code,
    "selected_record_set_changed_outside_workbench",
  );
});

test("a post-check file change makes correction unavailable before any revision is written", async (t) => {
  const workspace = freshWorkspace(
    t,
    "invoice-workbench-correction-stale-",
  );
  const application = await createInvoiceReconciliationWorkbench({
    fixture_directory: fixtureRoot,
    workspace_directory: workspace,
    session_id: "session_application_003",
    signing_key: keyPair("correction-currentness-key"),
    clock: sequenceClock([
      "2026-07-24T19:40:00.000Z",
      "2026-07-24T19:40:01.000Z",
      "2026-07-24T19:40:02.000Z",
    ]),
  });
  await application.checkCurrent();
  const invoicePath = join(
    application.paths.records,
    "invoice.r1.xlsx",
  );
  const invoice = readFileSync(invoicePath);
  writeFileSync(invoicePath, Buffer.concat([invoice, Buffer.from([0])]), {
    mode: 0o600,
  });

  const stale = await application.snapshot();
  assert.equal(stale.current_check.current, false);
  assert.equal(stale.current_check.disposition, "stale");
  assert.equal(stale.can_correct, false);
  assert.equal(stale.history[0].disposition, "stale");
  await assert.rejects(
    application.applyCorrection(),
    /changed after the failed check/u,
  );
  assert.equal(
    existsSync(join(application.paths.records, "invoice.r2.xlsx")),
    false,
  );
});

test("a byte-distinct valid workbook with identical facts still makes the prior result stale", async (t) => {
  const workspace = freshWorkspace(
    t,
    "invoice-workbench-same-facts-stale-",
  );
  const application = await createInvoiceReconciliationWorkbench({
    fixture_directory: fixtureRoot,
    workspace_directory: workspace,
    session_id: "session_application_same_facts",
    signing_key: keyPair("same-facts-currentness-key"),
    clock: sequenceClock([
      "2026-07-24T19:45:00.000Z",
      "2026-07-24T19:45:01.000Z",
    ]),
  });
  const checked = await application.checkCurrent();
  assert.equal(checked.current_check.disposition, "does_not_conform");
  writeFileSync(
    join(application.paths.records, "invoice.r1.xlsx"),
    workbookForInvoice(BASE_INVOICE, { method: 8 }),
    { mode: 0o600 },
  );

  const stale = await application.snapshot();
  assert.equal(stale.current_check.current, false);
  assert.equal(stale.current_check.disposition, "stale");
  assert.equal(stale.can_correct, false);
  assert.equal(stale.record_set.records[0].lines[1].quantity, "12");
  const audit = await application.audit("invoicecheck_1");
  assert.equal(audit.current, false);
  assert.equal(audit.historical_disposition, "does_not_conform");
  assert.equal(audit.replay.ok, true);
});

test("a post-conformance file change makes state and audit stale while preserving historical replay", async (t) => {
  const workspace = freshWorkspace(t, "invoice-workbench-audit-stale-");
  const application = await createInvoiceReconciliationWorkbench({
    fixture_directory: fixtureRoot,
    workspace_directory: workspace,
    session_id: "session_application_004",
    signing_key: keyPair("audit-currentness-key"),
    clock: sequenceClock([
      "2026-07-24T19:50:00.000Z",
      "2026-07-24T19:50:01.000Z",
      "2026-07-24T19:50:02.000Z",
      "2026-07-24T19:50:03.000Z",
    ]),
  });
  await application.checkCurrent();
  await application.applyCorrection();
  await application.checkCurrent();
  const receiptPath = join(
    application.paths.records,
    "receipt.json",
  );
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  receipt.received_at = "2026-07-23T10:00:00.000Z";
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    mode: 0o600,
  });

  const stale = await application.snapshot();
  assert.equal(stale.current_check.current, false);
  assert.equal(stale.current_check.disposition, "stale");
  assert.equal(stale.history[1].disposition, "stale");
  const audit = await application.audit("invoicecheck_2");
  assert.equal(audit.current, false);
  assert.equal(audit.disposition, "stale");
  assert.equal(audit.historical_disposition, "conforms");
  assert.equal(audit.replay.ok, true);
});

test("workspace creation rejects existing and symlink targets without changing them", async (t) => {
  const existingWorkspace = freshWorkspace(
    t,
    "invoice-workbench-existing-root-",
  );
  mkdirSync(existingWorkspace, { mode: 0o755 });
  const sentinel = join(existingWorkspace, "do-not-touch.txt");
  writeFileSync(sentinel, "preserve me\n", { mode: 0o640 });
  const beforeMode = statSync(existingWorkspace).mode & 0o777;
  await assert.rejects(
    createInvoiceReconciliationWorkbench({
      fixture_directory: fixtureRoot,
      workspace_directory: existingWorkspace,
    }),
    /must be a new path/u,
  );
  assert.equal(readFileSync(sentinel, "utf8"), "preserve me\n");
  assert.equal(statSync(existingWorkspace).mode & 0o777, beforeMode);
  assert.deepEqual(readdirSync(existingWorkspace), ["do-not-touch.txt"]);

  const symlinkWorkspace = freshWorkspace(
    t,
    "invoice-workbench-symlink-root-",
  );
  const symlinkTarget = join(dirname(symlinkWorkspace), "unrelated-target");
  mkdirSync(symlinkTarget, { mode: 0o755 });
  symlinkSync(symlinkTarget, symlinkWorkspace, "dir");
  await assert.rejects(
    createInvoiceReconciliationWorkbench({
      fixture_directory: fixtureRoot,
      workspace_directory: symlinkWorkspace,
    }),
    /must be a new path/u,
  );
  assert.deepEqual(readdirSync(symlinkTarget), []);
  assert.equal(statSync(symlinkTarget).mode & 0o777, 0o755);
});

test("fixture symlinks are rejected before a workspace is created", async (t) => {
  const workspace = freshWorkspace(t, "invoice-workbench-fixture-link-");
  const fixtureDirectory = join(dirname(workspace), "fixtures");
  mkdirSync(fixtureDirectory, { mode: 0o700 });
  copyFileSync(
    join(fixtureRoot, "purchase-order.json"),
    join(fixtureDirectory, "purchase-order.json"),
  );
  copyFileSync(
    join(fixtureRoot, "receipt.json"),
    join(fixtureDirectory, "receipt.json"),
  );
  symlinkSync(
    join(fixtureRoot, "invoice.v1.xlsx"),
    join(fixtureDirectory, "invoice.v1.xlsx"),
  );

  await assert.rejects(
    createInvoiceReconciliationWorkbench({
      fixture_directory: fixtureDirectory,
      workspace_directory: workspace,
    }),
  );
  assert.equal(existsSync(workspace), false);
});
