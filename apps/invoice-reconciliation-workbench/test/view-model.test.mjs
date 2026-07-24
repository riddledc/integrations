import assert from "node:assert/strict";
import { test } from "node:test";

import {
  branchActionLabel,
  correctionIsAvailable,
  dispositionLabel,
  ordinaryState,
} from "../public/view-model.js";
import {
  checkedConformingState,
  checkedFailingState,
  correctedReadyState,
  readyState,
} from "./fixtures.mjs";

test("ordinary state presents document, result, correction, and history meaning", () => {
  const view = ordinaryState(checkedFailingState());

  assert.equal(view.task.title, "Reconcile invoice INV-1001");
  assert.equal(view.record_set.records.length, 3);
  assert.deepEqual(
    view.record_set.records.map((document) => document.kind),
    ["invoice", "purchase_order", "receipt"],
  );
  assert.equal(view.current_check.disposition, "does_not_conform");
  assert.equal(view.current_check.findings.length, 3);
  assert.equal(view.current_check.passed_checks.length, 6);
  assert.equal(
    view.current_check.passed_checks[2].explanation,
    "$87.50 + $7.00 stated tax = $94.50.",
    "the browser projects deterministic arithmetic text without recalculating it",
  );
  assert.equal(view.correction.available, true);
  assert.equal(view.correction.changes.length, 5);
  assert.deepEqual(view.correction.changes[0], {
    field: "line_items[0].quantity",
    label: "WIDGET-A quantity",
    from: "3",
    to: "2",
  });
  assert.equal(view.history.length, 1);
  assert.equal(view.can_check, false);
  assert.equal(view.can_correct, true);
});

test("ordinary state drops crypto, proof bodies, raw records, and unknown fields", () => {
  const hostile = {
    ...checkedFailingState(),
    nonce: "must-not-leak",
    signing_key: "must-not-leak",
    signature: "must-not-leak",
    certificate: { body: "must-not-leak" },
    proof_envelope: { raw: "must-not-leak" },
    private_rule_bundle: { content: "must-not-leak" },
    source_binding: {
      workbook_digest: "must-not-leak",
      normalized_invoice_digest: "must-not-leak",
      extraction_binding_digest: "must-not-leak",
      private_trace_digest: "must-not-leak",
      cell_values: "must-not-leak",
      formulas: "must-not-leak",
      cached_values: "must-not-leak",
    },
    record_set: {
      ...checkedFailingState().record_set,
      raw_document_bytes: "must-not-leak",
      records: [
        ...checkedFailingState().record_set.records,
        {
          kind: "unsupported_secret_record",
          document_id: "SECRET",
          raw: "must-not-leak",
        },
      ],
    },
    current_check: {
      ...checkedFailingState().current_check,
      root_certificate_id: "must-not-leak",
      evidence_bytes: "must-not-leak",
      xlsx_source_binding: {
        workbook_digest: "must-not-leak",
        extraction_binding_digest: "must-not-leak",
      },
    },
  };

  const serialized = JSON.stringify(ordinaryState(hostile));
  for (const forbidden of [
    "must-not-leak",
    "nonce",
    "signing_key",
    "signature",
    "certificate",
    "proof_envelope",
    "private_rule_bundle",
    "source_binding",
    "workbook_digest",
    "normalized_invoice_digest",
    "extraction_binding_digest",
    "private_trace_digest",
    "cell_values",
    "formulas",
    "cached_values",
    "xlsx_source_binding",
    "raw_document_bytes",
    "root_certificate_id",
    "evidence_bytes",
  ]) {
    assert.equal(
      serialized.includes(forbidden),
      false,
      `${forbidden} must not reach the ordinary view`,
    );
  }
});

test("correction availability fails closed", () => {
  assert.equal(correctionIsAvailable(readyState()), false);
  assert.equal(correctionIsAvailable(checkedFailingState()), true);
  assert.equal(correctionIsAvailable(correctedReadyState()), false);
  assert.equal(correctionIsAvailable(checkedConformingState()), false);

  const callerClaimsAvailable = {
    ...checkedConformingState(),
    can_correct: true,
    correction: {
      available: true,
      label: "Unsafe correction",
      reason: "A caller should not make this appear.",
      changes: [{
        field: "line_items[0].quantity",
        label: "Quantity",
        from: "2",
        to: "99",
      }],
    },
  };
  assert.equal(
    correctionIsAvailable(callerClaimsAvailable),
    false,
    "a conforming result cannot expose a correction",
  );

  const emptyTypedChange = {
    ...checkedFailingState(),
    correction: {
      available: true,
      label: "Empty correction",
      reason: "No typed changes supplied.",
      changes: [],
    },
  };
  assert.equal(
    correctionIsAvailable(emptyTypedChange),
    false,
    "correction requires at least one complete typed change",
  );

  const partlyMalformedChange = {
    ...checkedFailingState(),
    correction: {
      ...checkedFailingState().correction,
      changes: [
        ...checkedFailingState().correction.changes,
        { field: "total_minor", label: "Hidden change", from: "$94.50" },
      ],
    },
  };
  assert.equal(
    correctionIsAvailable(partlyMalformedChange),
    false,
    "one malformed entry invalidates the entire displayed correction",
  );

  const nonCurrentFailure = {
    ...checkedFailingState(),
    current_check: {
      ...checkedFailingState().current_check,
      current: false,
    },
  };
  assert.equal(
    correctionIsAvailable(nonCurrentFailure),
    false,
    "a historical failure cannot authorize a current correction",
  );
});

test("revised record set exposes reuse without inheriting the old result", () => {
  const corrected = ordinaryState(correctedReadyState());
  assert.equal(corrected.current_check, null);
  assert.equal(corrected.can_check, true);
  assert.equal(corrected.history.length, 1);
  assert.equal(corrected.history[0].current, false);
  assert.deepEqual(
    corrected.reuse.branches.map(({ branch_id, action }) => ({
      branch_id,
      action,
    })),
    [
      { branch_id: "purchase-order-capture", action: "unchanged" },
      { branch_id: "receipt-capture", action: "unchanged" },
      { branch_id: "invoice-workbook-extraction", action: "new" },
      { branch_id: "invoice-capture", action: "new" },
    ],
  );

  const checked = ordinaryState(checkedConformingState());
  assert.equal(checked.current_check.disposition, "conforms");
  assert.equal(checked.history.length, 2);
  assert.equal(checked.history[0].current, false);
  assert.equal(checked.history[1].current, true);
  assert.deepEqual(
    checked.reuse.branches
      .filter((branch) => branch.action === "reused")
      .map((branch) => branch.branch_id),
    ["purchase-order-capture", "receipt-capture"],
  );
  assert.deepEqual(
    checked.reuse.branches
      .filter((branch) => branch.action === "recomputed")
      .map((branch) => branch.branch_id),
    [
      "invoice-workbook-extraction",
      "invoice-capture",
      "invoice-to-purchase-order",
      "invoice-to-receipt",
      "three-record-root",
    ],
  );
  assert.deepEqual(
    checked.reuse.branches.find(
      (branch) => branch.branch_id === "invoice-workbook-extraction",
    ),
    {
      branch_id: "invoice-workbook-extraction",
      label: "Workbook capture and extraction",
      action: "recomputed",
      reason:
        "Revision 2 is a new immutable XLSX specimen with a new extraction binding.",
    },
    "the ordinary interface explains the newly recomputed workbook branch without exposing its digest",
  );
});

test("labels stay ordinary and domain-specific", () => {
  assert.equal(dispositionLabel("conforms"), "Records agree");
  assert.equal(dispositionLabel("does_not_conform"), "Needs correction");
  assert.equal(dispositionLabel("stale"), "Check is out of date");
  assert.equal(dispositionLabel("could_not_check"), "Could not check");
  assert.equal(branchActionLabel("reused"), "Reused");
  assert.equal(branchActionLabel("refreshed"), "Refreshed");
  assert.equal(branchActionLabel("recomputed"), "Checked again");
  assert.equal(branchActionLabel("unknown"), "Unknown");
});
