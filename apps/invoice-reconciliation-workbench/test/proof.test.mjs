import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { captureExactRecordSet } from "../dist/capture.js";
import { applyTypedInvoiceCorrection, proposeTypedInvoiceCorrection } from "../dist/records.js";
import { createInvoiceProofEngine } from "../dist/proof.js";
import { reviseSyntheticInvoiceWorkbook } from "../dist/xlsx.js";
import {
  copyFixtureSet,
  fixtureBytes,
  keyPair,
} from "./helpers.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("signed replay composes a negative report, then a fresh positive root with exact branch reuse", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "invoice-proof-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const selection = copyFixtureSet(directory);
  const firstAt = "2026-07-24T18:00:00.000Z";
  const firstCapture = await captureExactRecordSet({
    selection,
    captured_at: firstAt,
  });
  assert.deepEqual(
    Buffer.from(firstCapture.bytes.invoice),
    fixtureBytes().invoice,
    "the pinned workbook feeds the unchanged canonical JSON invoice contract",
  );
  const engine = createInvoiceProofEngine({
    session_id: "session_proof_001",
    signing_key: keyPair(),
  });
  const first = engine.prove({ captured: firstCapture, issued_at: firstAt });
  assert.equal(first.projection.disposition, "does_not_conform");
  assert.deepEqual(first.reusable_branch_actions, {
    purchase_order: "new",
    receipt: "new",
  });
  assert.equal(first.verification.explanation.node_count, 18);
  assert.deepEqual(engine.replay({ proof: first }), {
    ok: true,
    root_certificate_id: first.projection.identity.root_certificate_id,
  });

  const correction = proposeTypedInvoiceCorrection(first.analysis);
  assert.ok(correction);
  const revised = applyTypedInvoiceCorrection({
    analysis: first.analysis,
    correction,
  });
  const revisedWorkbook = reviseSyntheticInvoiceWorkbook({
    workbook_bytes: firstCapture.invoice_workbook_bytes,
    base_extraction: firstCapture.invoice_workbook_extraction,
    correction,
    expected_invoice: revised.invoice,
  });
  const secondInvoicePath = join(directory, "invoice.v2.xlsx");
  writeFileSync(secondInvoicePath, revisedWorkbook.workbook_bytes, {
    mode: 0o600,
  });
  const secondAt = "2026-07-24T19:00:00.000Z";
  const secondCapture = await captureExactRecordSet({
    selection: {
      ...selection,
      invoice_workbook_path: secondInvoicePath,
      revision: "r2",
    },
    captured_at: secondAt,
  });
  const second = engine.prove({
    captured: secondCapture,
    issued_at: secondAt,
  });
  assert.equal(second.projection.disposition, "conforms");
  assert.deepEqual(second.reusable_branch_actions, {
    purchase_order: "reused",
    receipt: "reused",
  });
  assert.equal(second.verification.explanation.node_count, 19);
  assert.deepEqual(
    second.reusable_certificate_ids.purchase_order,
    first.reusable_certificate_ids.purchase_order,
  );
  assert.deepEqual(
    second.reusable_certificate_ids.receipt,
    first.reusable_certificate_ids.receipt,
  );
  assert.notEqual(
    second.certificate_ids.invoice_line_extensions,
    first.certificate_ids.invoice_line_extensions,
  );
  assert.notEqual(
    second.projection.identity.root_certificate_id,
    first.projection.identity.root_certificate_id,
  );
  assert.equal(
    second.projection.identity.subject.digest,
    secondCapture.specimen_digests.record_set,
  );
  assert.notEqual(
    second.projection.identity.subject.digest,
    first.projection.identity.subject.digest,
  );
  assert.equal(
    engine.replay({
      proof: second,
      checked_closure: first.authoritative_closure,
    }).ok,
    false,
    "the prior closure cannot establish a result for the revised subject",
  );

  const rollbackAt = "2026-07-24T17:59:59.000Z";
  const rollbackCapture = await captureExactRecordSet({
    selection: {
      ...selection,
      invoice_workbook_path: secondInvoicePath,
      revision: "r2",
    },
    captured_at: rollbackAt,
  });
  const afterClockRollback = engine.prove({
    captured: rollbackCapture,
    issued_at: rollbackAt,
  });
  assert.equal(afterClockRollback.projection.disposition, "conforms");
  assert.deepEqual(afterClockRollback.reusable_branch_actions, {
    purchase_order: "refreshed",
    receipt: "refreshed",
  });
  assert.notDeepEqual(
    afterClockRollback.reusable_certificate_ids.purchase_order,
    second.reusable_certificate_ids.purchase_order,
    "a cached capture from the future is never reused",
  );
  assert.notDeepEqual(
    afterClockRollback.reusable_certificate_ids.receipt,
    second.reusable_certificate_ids.receipt,
    "a cached capture from the future is never reused",
  );
});

test("byte, signature, policy, and record-role substitution fail replay or proof", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "invoice-proof-hostile-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const selection = copyFixtureSet(directory);
  const at = "2026-07-24T18:30:00.000Z";
  const captured = await captureExactRecordSet({
    selection,
    captured_at: at,
  });
  const engine = createInvoiceProofEngine({
    session_id: "session_proof_002",
    signing_key: keyPair("hostile-test-key"),
  });
  const proof = engine.prove({ captured, issued_at: at });

  const signatureTampered = clone(proof.authoritative_closure);
  const provenance =
    signatureTampered.grounded_closure.groundings[0].bundle.provenance;
  provenance.signature_base64 =
    `${provenance.signature_base64[0] === "A" ? "B" : "A"}${provenance.signature_base64.slice(1)}`;
  assert.equal(
    engine.replay({ proof, checked_closure: signatureTampered }).ok,
    false,
  );

  const nonceTampered = clone(proof.authoritative_closure);
  const statement =
    nonceTampered.grounded_closure.groundings[0].bundle.statement;
  statement.nonce =
    `${statement.nonce[0] === "A" ? "B" : "A"}${statement.nonce.slice(1)}`;
  assert.equal(
    engine.replay({ proof, checked_closure: nonceTampered }).ok,
    false,
  );

  const byteTampered = clone(proof.authoritative_closure);
  const inline =
    byteTampered.grounded_closure.groundings[0].bundle.inline_artifacts[0];
  const bytes = Buffer.from(inline.bytes_base64, "base64");
  bytes[0] ^= 1;
  inline.bytes_base64 = bytes.toString("base64");
  assert.equal(
    engine.replay({ proof, checked_closure: byteTampered }).ok,
    false,
  );

  const policyTampered = clone(proof.authoritative_closure);
  const root = policyTampered.grounded_closure.closure.certificates.find(
    ({ certificate_id }) =>
      certificate_id ===
      policyTampered.grounded_closure.closure.root_certificate_id,
  );
  root.claim.parameters.policy_digest =
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  assert.equal(
    engine.replay({ proof, checked_closure: policyTampered }).ok,
    false,
  );

  await assert.rejects(
    captureExactRecordSet({
      selection: {
        invoice_workbook_path: selection.purchase_order_path,
        purchase_order_path: selection.invoice_workbook_path,
        receipt_path: selection.receipt_path,
        revision: "swapped",
      },
      captured_at: "2026-07-24T18:30:01.000Z",
    }),
  );
});

test("digest-only receipts and audit identities contain no selected bytes, paths, or raw crypto material", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "invoice-proof-audit-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const selection = copyFixtureSet(directory);
  const at = "2026-07-24T18:45:00.000Z";
  const captured = await captureExactRecordSet({
    selection,
    captured_at: at,
  });
  const proof = createInvoiceProofEngine({
    session_id: "session_proof_003",
    signing_key: keyPair("audit-redaction-key"),
  }).prove({ captured, issued_at: at });
  assert.equal(captured.receipt.artifact_policy, "digest_only");
  assert.match(captured.digests.record_set, /^sha256:[0-9a-f]{64}$/u);
  assert.match(
    captured.specimen_digests.record_set,
    /^sha256:[0-9a-f]{64}$/u,
  );
  assert.notEqual(
    captured.specimen_digests.record_set,
    captured.digests.record_set,
  );
  assert.deepEqual(
    captured.receipt.snapshot.artifacts.map(({ role }) => role).sort(),
    ["invoice_workbook", "purchase_order", "receipt"],
  );
  for (const artifact of captured.receipt.snapshot.artifacts) {
    assert.equal(artifact.reference.kind, "opaque");
    assert.equal("content_base64" in artifact, false);
    assert.equal("path" in artifact, false);
  }

  const rawSecrets = new Set();
  function collectRawSecrets(value) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (
        ["nonce", "signature_base64", "bytes_base64"].includes(key)
        && typeof child === "string"
        && child.length > 0
      ) {
        rawSecrets.add(child);
      }
      collectRawSecrets(child);
    }
  }
  collectRawSecrets(proof.authoritative_closure);
  assert.ok(rawSecrets.size > 3);
  const auditText = JSON.stringify(proof.audit);
  for (const secret of rawSecrets) {
    assert.equal(
      auditText.includes(secret),
      false,
      "raw nonce, signature, and inline artifact values stay out of audit",
    );
  }
  for (const selectedPath of [
    selection.invoice_workbook_path,
    selection.purchase_order_path,
    selection.receipt_path,
  ]) {
    assert.equal(auditText.includes(selectedPath), false);
  }
});
