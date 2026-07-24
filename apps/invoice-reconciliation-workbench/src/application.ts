import { generateKeyPairSync, randomBytes } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { basename, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  compareDocumentSnapshotReceipts,
} from "@riddledc/riddle-proof-local";
import {
  createApplicationUnavailableResult,
  type ApplicationProjectionResult,
  type ApplicationSubjectRef,
} from "riddle-proof-application-projection-experiment";

import {
  captureExactRecordSet,
  recaptureExactRecordSetCurrentness,
} from "./capture.js";
import {
  deepFreeze,
} from "./canonical.js";
import {
  INVOICE_POLICY,
  INVOICE_POLICY_DEFINITION,
  INVOICE_REQUIREMENTS,
  createInvoiceApplicationAuthority,
} from "./contract.js";
import {
  RecordInputError,
  analyzeRecordSet,
  applyTypedInvoiceCorrection,
  proposeTypedInvoiceCorrection,
} from "./records.js";
import {
  createInvoiceProofEngine,
  type InvoiceProofEngine,
} from "./proof.js";
import {
  InvoiceWorkbookInputError,
  reviseSyntheticInvoiceWorkbook,
} from "./xlsx.js";
import type {
  CapturedRecordSet,
  InvoiceRequirementId,
  ParsedRecordSet,
  ReconciliationAnalysis,
  ReconciliationCheck,
  ReconciliationProofResult,
  RecordSetSelection,
  TypedInvoiceCorrection,
  WorkbenchClock,
  WorkbenchPaths,
  WorkbenchSigningKey,
} from "./types.js";

const TASK_REQUIREMENTS = [
  "Extract one exact, pinned synthetic XLSX worksheet into canonical invoice facts and reject ambiguous formulas or cached values.",
  "Recompute every invoice and purchase-order line extension in integer minor units.",
  "Confirm each subtotal equals its stated line extensions and each total equals subtotal plus stated tax.",
  "Require exact invoice and purchase-order identities, currency, terms, lines, prices, quantities, and total.",
  "Require exact invoice and receipt identities, line identities, and quantities.",
] as const;

type CheckRecord = {
  check_ref: string;
  /**
   * Outer specimen identity: raw workbook, extraction binding, and normalized
   * three-record set. This—not the normalized record-set digest alone—governs
   * application currentness.
   */
  record_set_digest: string;
  normalized_record_set_digest: string;
  source_binding: {
    policy: {
      id: string;
      version: string;
      digest: string;
    };
    invoice_workbook_digest: string;
    normalized_invoice_digest: string;
    normalized_record_set_digest: string;
    extraction_binding_digest: string;
    specimen_record_set_digest: string;
  };
  revision: string;
  attempt: string;
  checked_at: string;
  projection: ApplicationProjectionResult;
  proof: ReconciliationProofResult | null;
  analysis: ReconciliationAnalysis | null;
  diagnostic_code?: string;
  reused_branch_count: number;
  refreshed_branch_count: number;
  recomputed_branch_count: number;
};

const MAX_PRIVATE_FIXTURE_BYTES = 4 * 1024 * 1024;

export interface InvoiceWorkbenchSnapshot {
  task: {
    title: string;
    description: string;
    requirements: readonly string[];
  };
  record_set: {
    record_set_ref: string;
    label: string;
    revision: string;
    attempt: string;
    records: readonly unknown[];
  };
  current_check: unknown;
  correction: unknown;
  reuse: unknown;
  last_activity: unknown;
  can_check: boolean;
  can_correct: boolean;
  history: readonly unknown[];
}

export interface InvoiceReconciliationWorkbench {
  readonly paths: WorkbenchPaths;
  snapshot(): Promise<InvoiceWorkbenchSnapshot>;
  checkCurrent(): Promise<InvoiceWorkbenchSnapshot>;
  applyCorrection(): Promise<InvoiceWorkbenchSnapshot>;
  audit(checkRef: string): Promise<unknown>;
  close(): Promise<void>;
}

export interface CreateInvoiceReconciliationWorkbenchInput {
  fixture_directory: string;
  workspace_directory: string;
  clock?: WorkbenchClock;
  signing_key?: WorkbenchSigningKey;
  session_id?: string;
}

function defaultClock(): WorkbenchClock {
  return { now: () => new Date().toISOString() };
}

function createSigningKey(): WorkbenchSigningKey {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    key_id: `invoice-workbench-${randomBytes(12).toString("base64url")}`,
    private_key_pkcs8_base64: privateKey
      .export({ format: "der", type: "pkcs8" })
      .toString("base64"),
    public_key_spki_base64: publicKey
      .export({ format: "der", type: "spki" })
      .toString("base64"),
  };
}

function assertCanonicalTimestamp(value: string): void {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new TypeError("The workbench clock must return canonical UTC time.");
  }
}

function hasDiagnosticCode(value: unknown): value is { code: string } {
  return value !== null
    && typeof value === "object"
    && "code" in value
    && typeof value.code === "string"
    && value.code.length > 0;
}

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(value / 100);
  } catch {
    return `${currency} ${(value / 100).toFixed(2)}`;
  }
}

function displayValue(
  field: string,
  value: string | number,
  currency: string,
): string {
  return typeof value === "number" && field.includes("_minor")
    ? money(value, currency)
    : String(value);
}

function requirementDefinition(requirementId: InvoiceRequirementId) {
  const definition = INVOICE_REQUIREMENTS.find(
    (entry) => entry.requirement_id === requirementId,
  );
  if (!definition) throw new Error(`Unknown requirement ${requirementId}.`);
  return definition;
}

function checkSources(
  check: ReconciliationCheck,
  records: ParsedRecordSet,
  revision: string,
): string[] {
  return check.evidence_roles.map((role) => {
    if (role === "invoice") {
      return `Invoice ${records.invoice.invoice_id} · ${revision}`;
    }
    if (role === "purchase_order") {
      return `Purchase order ${records.purchase_order.po_id}`;
    }
    if (role === "receipt") {
      return `Receipt ${records.receipt.receipt_id}`;
    }
    return "Selected invoice, purchase order, and receipt";
  });
}

function arithmeticExplanation(
  check: ReconciliationCheck,
  records: ParsedRecordSet,
): string | null {
  const invoice = records.invoice;
  const po = records.purchase_order;
  switch (check.requirement_id) {
    case "invoice_line_extensions":
      return invoice.line_items.map((line) =>
        `${line.quantity} × ${money(line.unit_price_minor, invoice.currency)} = ${money(line.extended_minor, invoice.currency)}`)
        .join("; ");
    case "invoice_subtotal":
      return `${invoice.line_items.map((line) =>
        money(line.extended_minor, invoice.currency)).join(" + ")} = ${money(invoice.subtotal_minor, invoice.currency)}.`;
    case "invoice_tax_total":
      return `${money(invoice.subtotal_minor, invoice.currency)} + ${money(invoice.tax_minor, invoice.currency)} stated tax = ${money(invoice.total_minor, invoice.currency)}.`;
    case "purchase_order_line_extensions":
      return po.line_items.map((line) =>
        `${line.quantity} × ${money(line.unit_price_minor, po.currency)} = ${money(line.extended_minor, po.currency)}`)
        .join("; ");
    case "purchase_order_subtotal":
      return `${po.line_items.map((line) =>
        money(line.extended_minor, po.currency)).join(" + ")} = ${money(po.subtotal_minor, po.currency)}.`;
    case "purchase_order_tax_total":
      return `${money(po.subtotal_minor, po.currency)} + ${money(po.tax_minor, po.currency)} stated tax = ${money(po.total_minor, po.currency)}.`;
    case "invoice_purchase_order_identity_terms":
      return `Buyer ${invoice.buyer_id}, supplier ${invoice.supplier_id}, PO ${invoice.po_id}, ${invoice.currency}, and ${invoice.payment_terms} agree exactly.`;
    case "invoice_purchase_order_line_terms":
      return invoice.line_items.map((line) =>
        `${line.quantity} × ${line.sku} at ${money(line.unit_price_minor, invoice.currency)}`)
        .join("; ");
    case "invoice_purchase_order_total":
      return `Both records state ${money(invoice.total_minor, invoice.currency)}.`;
    case "invoice_receipt_identity":
      return `Buyer ${invoice.buyer_id}, supplier ${invoice.supplier_id}, and PO ${invoice.po_id} agree exactly.`;
    case "invoice_receipt_quantities":
      return invoice.line_items.map((line) =>
        `Both records state ${line.quantity} × ${line.sku}`)
        .join("; ");
  }
}

function findingExplanation(
  check: ReconciliationCheck,
  records: ParsedRecordSet,
): string {
  if (check.status === "satisfied") {
    return arithmeticExplanation(check, records)
      ?? "The exact declared fields agree.";
  }
  return check.differences.map((difference) =>
    `${difference.field}: observed ${displayValue(
      difference.field,
      difference.observed,
      records.invoice.currency,
    )}; expected ${displayValue(
      difference.field,
      difference.expected,
      records.invoice.currency,
    )}.`)
    .join(" ");
}

function projectedRequirement(
  check: ReconciliationCheck,
  records: ParsedRecordSet,
  revision: string,
) {
  const definition = requirementDefinition(check.requirement_id);
  return {
    requirement_id: check.requirement_id,
    label: definition.label,
    explanation: findingExplanation(check, records),
    sources: checkSources(check, records, revision),
    ...(check.status === "failed"
      ? { repair_guidance: definition.repair_guidance }
      : {}),
  };
}

function displayRecords(
  records: ParsedRecordSet,
  invoiceRevision: number,
) {
  const invoice = records.invoice;
  const po = records.purchase_order;
  const receipt = records.receipt;
  return [
    {
      kind: "invoice",
      label: "Invoice",
      document_id: invoice.invoice_id,
      revision: `Invoice revision ${invoiceRevision}`,
      status: invoiceRevision === 1 ? "Selected" : "Corrected",
      metadata: [
        { label: "Source", value: "Pinned synthetic XLSX workbook" },
        { label: "Buyer", value: invoice.buyer_id },
        { label: "Supplier", value: invoice.supplier_id },
        { label: "PO", value: invoice.po_id },
        { label: "Terms", value: invoice.payment_terms },
        { label: "Currency", value: invoice.currency },
      ],
      lines: invoice.line_items.map((line) => ({
        line_id: line.line_id,
        item: line.sku,
        quantity: String(line.quantity),
        unit_price: money(line.unit_price_minor, invoice.currency),
        amount: money(line.extended_minor, invoice.currency),
      })),
      totals: [
        { label: "Subtotal", value: money(invoice.subtotal_minor, invoice.currency) },
        { label: "Stated tax", value: money(invoice.tax_minor, invoice.currency) },
        {
          label: "Total",
          value: money(invoice.total_minor, invoice.currency),
          emphasis: true,
        },
      ],
    },
    {
      kind: "purchase_order",
      label: "Purchase order",
      document_id: po.po_id,
      revision: "Captured source · unchanged",
      status: "Captured",
      metadata: [
        { label: "Buyer", value: po.buyer_id },
        { label: "Supplier", value: po.supplier_id },
        { label: "Terms", value: po.payment_terms },
        { label: "Currency", value: po.currency },
      ],
      lines: po.line_items.map((line) => ({
        line_id: line.line_id,
        item: line.sku,
        quantity: String(line.quantity),
        unit_price: money(line.unit_price_minor, po.currency),
        amount: money(line.extended_minor, po.currency),
      })),
      totals: [
        { label: "Subtotal", value: money(po.subtotal_minor, po.currency) },
        { label: "Stated tax", value: money(po.tax_minor, po.currency) },
        {
          label: "Total",
          value: money(po.total_minor, po.currency),
          emphasis: true,
        },
      ],
    },
    {
      kind: "receipt",
      label: "Receipt",
      document_id: receipt.receipt_id,
      revision: "Captured source · unchanged",
      status: "Captured",
      metadata: [
        { label: "Buyer", value: receipt.buyer_id },
        { label: "Supplier", value: receipt.supplier_id },
        { label: "PO", value: receipt.po_id },
        { label: "Received", value: receipt.received_at.slice(0, 10) },
      ],
      lines: receipt.line_items.map((line) => ({
        line_id: line.line_id,
        item: line.sku,
        quantity: String(line.quantity),
        unit_price: "—",
        amount: "—",
      })),
      totals: [],
    },
  ];
}

function correctionChanges(
  correction: TypedInvoiceCorrection,
  currency: string,
) {
  return [
    {
      field: `line_items[${correction.line_id}].quantity`,
      label: `${correction.sku} quantity`,
      from: String(correction.from_quantity),
      to: String(correction.to_quantity),
    },
    {
      field: `line_items[${correction.line_id}].extended_minor`,
      label: `${correction.sku} line amount`,
      from: money(correction.from_extended_minor, currency),
      to: money(correction.to_extended_minor, currency),
    },
    {
      field: "subtotal_minor",
      label: "Subtotal",
      from: money(correction.from_subtotal_minor, currency),
      to: money(correction.to_subtotal_minor, currency),
    },
    {
      field: "tax_minor",
      label: "Stated tax",
      from: money(correction.from_tax_minor, currency),
      to: money(correction.to_tax_minor, currency),
    },
    {
      field: "total_minor",
      label: "Total",
      from: money(correction.from_total_minor, currency),
      to: money(correction.to_total_minor, currency),
    },
  ];
}

function currentHeadline(record: CheckRecord): {
  headline: string;
  summary: string;
  next_action: string;
} {
  if (record.projection.disposition === "conforms") {
    return {
      headline: "The invoice, purchase order, and receipt agree",
      summary:
        "Every declared arithmetic and exact three-way requirement is satisfied under the installed synthetic policy.",
      next_action:
        "No correction is needed. Open Audit only when exact proof identities are useful.",
    };
  }
  if (record.projection.disposition === "does_not_conform") {
    const failed = record.analysis?.checks.filter(
      (entry) => entry.status === "failed",
    ).length ?? 0;
    return {
      headline: "The invoice is internally correct, but the records do not match",
      summary:
        `${failed} exact relationship requirements failed while the passing arithmetic findings remain available.`,
      next_action:
        "Use the exact invoice-only correction, create the new immutable revision, and run a fresh check.",
    };
  }
  return {
    headline: "The selected records could not be checked",
    summary:
      "The workbench did not establish a current conformance conclusion.",
    next_action:
      "Inspect the fixed diagnostic code in Audit and correct the selected structured input.",
  };
}

async function requireFreshWorkspace(paths: WorkbenchPaths): Promise<void> {
  try {
    await lstat(paths.root);
    throw new Error(
      "The private workspace must be a new path that does not already exist.",
    );
  } catch (error) {
    if (
      error instanceof Error
      && "code" in error
      && error.code === "ENOENT"
    ) {
      // The caller selected a fresh leaf path, as required.
    } else {
      throw error;
    }
  }
  await mkdir(paths.root, { mode: 0o700 });
  await chmod(paths.root, 0o700);
  await mkdir(paths.records, { mode: 0o700 });
  await chmod(paths.records, 0o700);
}

async function readPrivateFixture(source: string): Promise<Buffer> {
  if (!Number.isInteger(constants.O_NOFOLLOW)) {
    throw new Error("This platform cannot safely open fixture files.");
  }
  const handle = await open(
    source,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const stats = await handle.stat();
    if (
      !stats.isFile()
      || stats.size < 1
      || stats.size > MAX_PRIVATE_FIXTURE_BYTES
    ) {
      throw new Error("A synthetic fixture source is not a regular file.");
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function writePrivateFixture(
  destination: string,
  bytes: Uint8Array,
): Promise<void> {
  await writeFile(destination, bytes, {
    flag: "wx",
    mode: 0o600,
  });
  await chmod(destination, 0o600);
}

function recordSetRef(sessionId: string, revisionNumber: number): string {
  return `record-set:${sessionId}:r${revisionNumber}`;
}

function checkIsCurrent(
  record: CheckRecord,
  activeDigest: string,
  selectedBytesAreCurrent: boolean,
): boolean {
  return selectedBytesAreCurrent
    && record.record_set_digest === activeDigest;
}

function sourceBinding(captured: CapturedRecordSet): CheckRecord["source_binding"] {
  return {
    policy: {
      id: captured.invoice_workbook_extraction.policy.id,
      version: captured.invoice_workbook_extraction.policy.version,
      digest: captured.invoice_workbook_extraction.policy.digest,
    },
    invoice_workbook_digest:
      captured.specimen_digests.invoice_workbook,
    normalized_invoice_digest:
      captured.specimen_digests.normalized_invoice,
    normalized_record_set_digest:
      captured.specimen_digests.normalized_record_set,
    extraction_binding_digest:
      captured.specimen_digests.extraction_binding,
    specimen_record_set_digest:
      captured.specimen_digests.record_set,
  };
}

function unavailableProjection(input: {
  session_id: string;
  record_set_digest: string;
  diagnostic_code: string;
}) {
  const authority = createInvoiceApplicationAuthority(
    input.record_set_digest,
  );
  const subject: ApplicationSubjectRef = {
    id: input.session_id,
    digest: input.record_set_digest,
    kind: "invoice_record_set",
  };
  return createApplicationUnavailableResult({
    authority,
    subject,
    diagnostic_code: input.diagnostic_code,
  });
}

export async function createInvoiceReconciliationWorkbench(
  input: CreateInvoiceReconciliationWorkbenchInput,
): Promise<InvoiceReconciliationWorkbench> {
  const fixtureRoot = resolve(input.fixture_directory);
  const workspaceRoot = resolve(input.workspace_directory);
  const paths: WorkbenchPaths = {
    root: workspaceRoot,
    records: join(workspaceRoot, "records"),
  };
  const fixtureStats = await lstat(fixtureRoot);
  if (fixtureStats.isSymbolicLink() || !fixtureStats.isDirectory()) {
    throw new Error(
      "The synthetic fixture directory must be a real local directory.",
    );
  }
  const fixtureBytes = {
    invoice_workbook: await readPrivateFixture(
      join(fixtureRoot, "invoice.v1.xlsx"),
    ),
    purchase_order: await readPrivateFixture(
      join(fixtureRoot, "purchase-order.json"),
    ),
    receipt: await readPrivateFixture(
      join(fixtureRoot, "receipt.json"),
    ),
  };
  await requireFreshWorkspace(paths);
  const initialInvoicePath = join(paths.records, "invoice.r1.xlsx");
  const purchaseOrderPath = join(paths.records, "purchase-order.json");
  const receiptPath = join(paths.records, "receipt.json");
  await writePrivateFixture(
    initialInvoicePath,
    fixtureBytes.invoice_workbook,
  );
  await writePrivateFixture(
    purchaseOrderPath,
    fixtureBytes.purchase_order,
  );
  await writePrivateFixture(receiptPath, fixtureBytes.receipt);

  const clock = input.clock ?? defaultClock();
  const sessionId =
    input.session_id ?? `session_${randomBytes(16).toString("base64url")}`;
  const signingKey = input.signing_key ?? createSigningKey();
  const proofEngine: InvoiceProofEngine = createInvoiceProofEngine({
    session_id: sessionId,
    signing_key: signingKey,
  });
  let revisionNumber = 1;
  let attemptNumber = 1;
  let checkOrdinal = 0;
  let selection: RecordSetSelection = {
    invoice_workbook_path: initialInvoicePath,
    purchase_order_path: purchaseOrderPath,
    receipt_path: receiptPath,
    revision: `r${revisionNumber}`,
  };
  const initialAt = clock.now();
  assertCanonicalTimestamp(initialAt);
  let captured: CapturedRecordSet = await captureExactRecordSet({
    selection,
    captured_at: initialAt,
  });
  let currentAnalysis = analyzeRecordSet(captured.bytes);
  let currentCheck: CheckRecord | null = null;
  let lastActivity: unknown = null;
  let reuseState: {
    summary: string;
    branches: readonly unknown[];
  } = { summary: "", branches: [] };
  const checks = new Map<string, CheckRecord>();
  let previousProof: ReconciliationProofResult | null = null;
  let operation: Promise<unknown> | null = null;

  async function selectionMatchesCapturedBytes(): Promise<boolean> {
    return recaptureExactRecordSetCurrentness({
      captured,
      checked_at: new Date().toISOString(),
    });
  }

  function serialize<T>(work: () => Promise<T>): Promise<T> {
    if (operation) {
      throw new Error("Another invoice workbench operation is in progress.");
    }
    const running = work().finally(() => {
      if (operation === running) operation = null;
    });
    operation = running;
    return running;
  }

  function historyEntry(
    record: CheckRecord,
    selectedBytesAreCurrent: boolean,
  ) {
    const current = checkIsCurrent(
      record,
      captured.specimen_digests.record_set,
      selectedBytesAreCurrent,
    );
    const headline = currentHeadline(record);
    return {
      check_ref: record.check_ref,
      record_set_ref: recordSetRef(sessionId, Number(record.revision.slice(1))),
      revision: `Revision ${record.revision.slice(1)}`,
      attempt: `Attempt ${record.attempt.slice(1)}`,
      disposition: current ? record.projection.disposition : "stale",
      current,
      headline: current
        ? headline.headline
        : "This historical check belongs to an earlier immutable record set",
      checked_at: record.checked_at,
      reused_branch_count: record.reused_branch_count,
      refreshed_branch_count: record.refreshed_branch_count,
      recomputed_branch_count: record.recomputed_branch_count,
    };
  }

  function currentCheckView(
    record: CheckRecord | null,
    selectedBytesAreCurrent: boolean,
  ) {
    if (!record) return null;
    const current = checkIsCurrent(
      record,
      captured.specimen_digests.record_set,
      selectedBytesAreCurrent,
    );
    const text = currentHeadline(record);
    const analysis = record.analysis;
    return {
      check_ref: record.check_ref,
      disposition: current ? record.projection.disposition : "stale",
      current,
      ...text,
      findings: analysis
        ? analysis.checks
            .filter((entry) => entry.status === "failed")
            .map((entry) => projectedRequirement(
              entry,
              analysis.records,
              `Revision ${revisionNumber}`,
            ))
        : [],
      passed_checks: analysis
        ? analysis.checks
            .filter((entry) => entry.status === "satisfied")
            .map((entry) => projectedRequirement(
              entry,
              analysis.records,
              `Revision ${revisionNumber}`,
            ))
        : [],
      non_conclusions: [
        ...INVOICE_POLICY_DEFINITION.non_conclusions,
      ],
    };
  }

  function correctionView(selectedBytesAreCurrent: boolean) {
    if (
      !currentCheck
      || currentCheck.projection.disposition !== "does_not_conform"
      || !checkIsCurrent(
        currentCheck,
        captured.specimen_digests.record_set,
        selectedBytesAreCurrent,
      )
      || !currentCheck.analysis
    ) {
      return {
        available: false,
        label: "Create corrected invoice revision",
        reason: "A current, correctable failed check is required.",
        changes: [],
      };
    }
    const correction = proposeTypedInvoiceCorrection(
      currentCheck.analysis,
    );
    if (!correction) {
      return {
        available: false,
        label: "Create corrected invoice revision",
        reason:
          "This failure is not the one exact invoice-only correction supported by the synthetic workbench.",
        changes: [],
      };
    }
    return {
      available: true,
      label: "Create corrected invoice revision",
      reason:
        "The PO and receipt already agree. This typed change modifies only the invoice quantity and its dependent stated amounts.",
      changes: correctionChanges(
        correction,
        currentCheck.analysis.records.invoice.currency,
      ),
    };
  }

  async function snapshot(): Promise<InvoiceWorkbenchSnapshot> {
    const selectedBytesAreCurrent =
      await selectionMatchesCapturedBytes();
    const correction = correctionView(selectedBytesAreCurrent);
    return deepFreeze({
      task: {
        title: `Reconcile invoice ${currentAnalysis.records.invoice.invoice_id}`,
        description:
          `Extract the pinned XLSX invoice and check its exact normalized facts against purchase order ${currentAnalysis.records.purchase_order.po_id} and receipt ${currentAnalysis.records.receipt.receipt_id}.`,
        requirements: TASK_REQUIREMENTS,
      },
      record_set: {
        record_set_ref: recordSetRef(sessionId, revisionNumber),
        label:
          "One pinned XLSX invoice workbook and two structured synthetic records",
        revision: `Revision ${revisionNumber}`,
        attempt: `Attempt ${attemptNumber}`,
        records: displayRecords(
          currentAnalysis.records,
          revisionNumber,
        ),
      },
      current_check: currentCheckView(
        currentCheck,
        selectedBytesAreCurrent,
      ),
      correction,
      reuse: reuseState,
      last_activity: lastActivity,
      can_check: currentCheck === null,
      can_correct: correction.available,
      history: [...checks.values()].map((record) =>
        historyEntry(record, selectedBytesAreCurrent)),
    });
  }

  async function checkCurrent(): Promise<InvoiceWorkbenchSnapshot> {
    return serialize(async () => {
      if (currentCheck) {
        throw new Error("The current immutable record set already has a check.");
      }
      const checkedAt = clock.now();
      assertCanonicalTimestamp(checkedAt);
      let nextCapture: CapturedRecordSet;
      try {
        nextCapture = await captureExactRecordSet({
          selection,
          captured_at: checkedAt,
        });
      } catch (error) {
        const code = (
          error instanceof InvoiceWorkbookInputError
          && hasDiagnosticCode(error)
        )
          ? error.code
          : "record_set_capture_failed";
        const projection = unavailableProjection({
          session_id: sessionId,
          record_set_digest: captured.specimen_digests.record_set,
          diagnostic_code: code,
        });
        checkOrdinal += 1;
        currentCheck = {
          check_ref: `invoicecheck_${checkOrdinal}`,
          record_set_digest: captured.specimen_digests.record_set,
          normalized_record_set_digest: captured.digests.record_set,
          source_binding: sourceBinding(captured),
          revision: `r${revisionNumber}`,
          attempt: `a${attemptNumber}`,
          checked_at: checkedAt,
          projection,
          proof: null,
          analysis: null,
          diagnostic_code: code,
          reused_branch_count: 0,
          refreshed_branch_count: 0,
          recomputed_branch_count: 0,
        };
        checks.set(currentCheck.check_ref, currentCheck);
        return snapshot();
      }
      const comparison = compareDocumentSnapshotReceipts(
        captured.receipt,
        nextCapture.receipt,
      );
      if (comparison.status !== "unchanged") {
        const projection = unavailableProjection({
          session_id: sessionId,
          record_set_digest: captured.specimen_digests.record_set,
          diagnostic_code: "selected_record_set_changed_outside_workbench",
        });
        checkOrdinal += 1;
        currentCheck = {
          check_ref: `invoicecheck_${checkOrdinal}`,
          record_set_digest: captured.specimen_digests.record_set,
          normalized_record_set_digest: captured.digests.record_set,
          source_binding: sourceBinding(captured),
          revision: `r${revisionNumber}`,
          attempt: `a${attemptNumber}`,
          checked_at: checkedAt,
          projection,
          proof: null,
          analysis: null,
          diagnostic_code: "selected_record_set_changed_outside_workbench",
          reused_branch_count: 0,
          refreshed_branch_count: 0,
          recomputed_branch_count: 0,
        };
        checks.set(currentCheck.check_ref, currentCheck);
        return snapshot();
      }
      captured = nextCapture;
      let proof: ReconciliationProofResult;
      try {
        proof = proofEngine.prove({
          captured,
          issued_at: checkedAt,
        });
      } catch (error) {
        const knownInputError = (
          error instanceof RecordInputError
          || error instanceof InvoiceWorkbookInputError
        );
        const code = knownInputError && hasDiagnosticCode(error)
          ? error.code
          : "proof_replay_failed";
        const projection = unavailableProjection({
          session_id: sessionId,
          record_set_digest: captured.specimen_digests.record_set,
          diagnostic_code: code,
        });
        checkOrdinal += 1;
        currentCheck = {
          check_ref: `invoicecheck_${checkOrdinal}`,
          record_set_digest: captured.specimen_digests.record_set,
          normalized_record_set_digest: captured.digests.record_set,
          source_binding: sourceBinding(captured),
          revision: `r${revisionNumber}`,
          attempt: `a${attemptNumber}`,
          checked_at: checkedAt,
          projection,
          proof: null,
          analysis: null,
          diagnostic_code: code,
          reused_branch_count: 0,
          refreshed_branch_count: 0,
          recomputed_branch_count: 0,
        };
        checks.set(currentCheck.check_ref, currentCheck);
        return snapshot();
      }
      let reusedBranchCount = 0;
      let refreshedBranchCount = 0;
      let recomputedBranchCount = 5;
      if (previousProof) {
        const stableBranches = [
          {
            branch_id: "purchase-order-capture",
            label: "Purchase-order arithmetic and capture",
            action: proof.reusable_branch_actions.purchase_order,
            previous_ids:
              previousProof.reusable_certificate_ids.purchase_order,
            current_ids: proof.reusable_certificate_ids.purchase_order,
            record_label: "purchase-order",
          },
          {
            branch_id: "receipt-capture",
            label: "Receipt capture",
            action: proof.reusable_branch_actions.receipt,
            previous_ids: previousProof.reusable_certificate_ids.receipt,
            current_ids: proof.reusable_certificate_ids.receipt,
            record_label: "receipt",
          },
        ] as const;
        for (const branch of stableBranches) {
          const idsUnchanged = isDeepStrictEqual(
            branch.previous_ids,
            branch.current_ids,
          );
          if (
            (branch.action === "reused" && !idsUnchanged)
            || (branch.action === "refreshed" && idsUnchanged)
            || !["reused", "refreshed"].includes(branch.action)
          ) {
            throw new Error(
              `The unchanged ${branch.record_label} proof branch reported inconsistent cache accounting.`,
            );
          }
        }
        reusedBranchCount = stableBranches.filter(
          (branch) => branch.action === "reused",
        ).length;
        refreshedBranchCount = stableBranches.filter(
          (branch) => branch.action === "refreshed",
        ).length;
        if (reusedBranchCount + refreshedBranchCount !== 2) {
          throw new Error(
            "The unchanged purchase-order and receipt proof branches were neither reused nor refreshed.",
          );
        }
        const branchSummary = refreshedBranchCount === 0
          ? "The unchanged purchase-order and receipt certificates were reused within their freshness window"
          : reusedBranchCount === 0
            ? "The unchanged purchase-order and receipt branches were refreshed because their prior captures were outside the current one-hour freshness window"
            : "The unchanged branches were reused while fresh or refreshed when outside the current one-hour freshness window";
        reuseState = {
          summary:
            `${branchSummary}; workbook extraction, every invoice-dependent branch, and the source-bound root were checked again.`,
          branches: [
            ...stableBranches.map((branch) => ({
              branch_id: branch.branch_id,
              label: branch.label,
              action: branch.action,
              reason: branch.action === "reused"
                ? `The exact ${branch.record_label} bytes are unchanged and the prior certificates remain within the one-hour freshness window.`
                : `The exact ${branch.record_label} bytes are unchanged, but the prior capture was outside the current one-hour freshness window, so fresh certificates were issued.`,
            })),
            {
              branch_id: "invoice-workbook-extraction",
              label: "Workbook capture and extraction",
              action: "recomputed",
              reason:
                "The corrected invoice is a new immutable XLSX specimen with a new extraction binding.",
            },
            {
              branch_id: "invoice-capture",
              label: "Normalized invoice arithmetic",
              action: "recomputed",
              reason: "The invoice is a new immutable revision.",
            },
            {
              branch_id: "invoice-to-purchase-order",
              label: "Invoice to purchase-order relationships",
              action: "recomputed",
              reason: "These relationships depend on the revised invoice.",
            },
            {
              branch_id: "invoice-to-receipt",
              label: "Invoice to receipt relationships",
              action: "recomputed",
              reason: "These relationships depend on the revised invoice.",
            },
            {
              branch_id: "three-record-root",
              label: "Source-bound reconciliation conclusion",
              action: "recomputed",
              reason:
                "The root names the new workbook, extraction binding, and normalized record-set digest.",
            },
          ],
        };
      } else {
        recomputedBranchCount = 5;
        reuseState = {
          summary:
            "This is the first proof for the selected record set; all branches were established from their exact captured bytes.",
          branches: [
            {
              branch_id: "purchase-order-capture",
              label: "Purchase-order arithmetic and capture",
              action: "new",
              reason: "First check.",
            },
            {
              branch_id: "receipt-capture",
              label: "Receipt capture",
              action: "new",
              reason: "First check.",
            },
            {
              branch_id: "invoice-workbook-extraction",
              label: "Workbook capture and extraction",
              action: "new",
              reason: "First check.",
            },
            {
              branch_id: "invoice-capture",
              label: "Normalized invoice arithmetic",
              action: "new",
              reason: "First check.",
            },
            {
              branch_id: "three-record-root",
              label: "Source-bound reconciliation status",
              action: "new",
              reason: "First check.",
            },
          ],
        };
      }
      checkOrdinal += 1;
      currentAnalysis = proof.analysis;
      currentCheck = {
        check_ref: `invoicecheck_${checkOrdinal}`,
        record_set_digest: captured.specimen_digests.record_set,
        normalized_record_set_digest: captured.digests.record_set,
        source_binding: sourceBinding(captured),
        revision: `r${revisionNumber}`,
        attempt: `a${attemptNumber}`,
        checked_at: checkedAt,
        projection: proof.projection,
        proof,
        analysis: proof.analysis,
        reused_branch_count: reusedBranchCount,
        refreshed_branch_count: refreshedBranchCount,
        recomputed_branch_count: recomputedBranchCount,
      };
      checks.set(currentCheck.check_ref, currentCheck);
      return snapshot();
    });
  }

  async function applyCorrection(): Promise<InvoiceWorkbenchSnapshot> {
    return serialize(async () => {
      if (
        !currentCheck
        || currentCheck.projection.disposition !== "does_not_conform"
        || !currentCheck.analysis
        || !currentCheck.proof
        || currentCheck.record_set_digest
          !== captured.specimen_digests.record_set
      ) {
        throw new Error("No current typed invoice correction is available.");
      }
      const correctedAt = clock.now();
      assertCanonicalTimestamp(correctedAt);
      let preflightCapture: CapturedRecordSet;
      try {
        preflightCapture = await captureExactRecordSet({
          selection,
          captured_at: correctedAt,
        });
      } catch {
        throw new Error(
          "The selected record set changed after the failed check; correction is unavailable.",
        );
      }
      const preflightComparison = compareDocumentSnapshotReceipts(
        captured.receipt,
        preflightCapture.receipt,
      );
      if (
        preflightComparison.status !== "unchanged"
        || preflightCapture.specimen_digests.record_set
          !== captured.specimen_digests.record_set
      ) {
        throw new Error(
          "The selected record set changed after the failed check; correction is unavailable.",
        );
      }
      captured = preflightCapture;
      const correction = proposeTypedInvoiceCorrection(
        currentCheck.analysis,
      );
      if (!correction) {
        throw new Error("The current failure has no bounded invoice correction.");
      }
      const corrected = applyTypedInvoiceCorrection({
        analysis: currentCheck.analysis,
        correction,
      });
      const revisedWorkbook = reviseSyntheticInvoiceWorkbook({
        workbook_bytes: captured.invoice_workbook_bytes,
        base_extraction: captured.invoice_workbook_extraction,
        correction,
        expected_invoice: corrected.invoice,
      });
      if (
        !Buffer.from(revisedWorkbook.extraction.normalized_invoice_bytes)
          .equals(Buffer.from(corrected.bytes))
        || !isDeepStrictEqual(
          revisedWorkbook.extraction.normalized_invoice,
          corrected.invoice,
        )
      ) {
        throw new Error(
          "The XLSX correction did not produce the exact typed normalized invoice.",
        );
      }
      const nextRevision = revisionNumber + 1;
      const nextInvoicePath = join(
        paths.records,
        `invoice.r${nextRevision}.xlsx`,
      );
      await writeFile(nextInvoicePath, revisedWorkbook.workbook_bytes, {
        flag: "wx",
        mode: 0o600,
      });
      await chmod(nextInvoicePath, 0o600);
      const written = await readFile(nextInvoicePath);
      if (!written.equals(Buffer.from(revisedWorkbook.workbook_bytes))) {
        throw new Error(
          "The immutable XLSX invoice revision was not written exactly.",
        );
      }
      const nextSelection: RecordSetSelection = {
        invoice_workbook_path: nextInvoicePath,
        purchase_order_path: selection.purchase_order_path,
        receipt_path: selection.receipt_path,
        revision: `r${nextRevision}`,
      };
      const nextCaptured = await captureExactRecordSet({
        selection: nextSelection,
        captured_at: correctedAt,
      });
      if (
        nextCaptured.digests.purchase_order
          !== captured.digests.purchase_order
        || nextCaptured.digests.receipt !== captured.digests.receipt
        || nextCaptured.digests.invoice === captured.digests.invoice
        || nextCaptured.specimen_digests.invoice_workbook
          === captured.specimen_digests.invoice_workbook
        || nextCaptured.specimen_digests.extraction_binding
          === captured.specimen_digests.extraction_binding
        || nextCaptured.specimen_digests.normalized_record_set
          === captured.specimen_digests.normalized_record_set
        || nextCaptured.specimen_digests.record_set
          === captured.specimen_digests.record_set
        || nextCaptured.invoice_workbook_extraction.binding_digest
          !== revisedWorkbook.extraction.binding_digest
        || !Buffer.from(nextCaptured.bytes.invoice)
          .equals(Buffer.from(corrected.bytes))
      ) {
        throw new Error(
          "The typed XLSX correction did not preserve PO/receipt bytes and replace only the bound invoice specimen.",
        );
      }
      previousProof = currentCheck.proof;
      revisionNumber = nextRevision;
      attemptNumber += 1;
      selection = nextSelection;
      captured = nextCaptured;
      currentAnalysis = analyzeRecordSet(nextCaptured.bytes);
      currentCheck = null;
      reuseState = {
        summary:
          "The XLSX invoice and its normalized facts changed. The exact purchase-order and receipt bytes remain unchanged; fresh proof will determine certificate reuse.",
        branches: [
          {
            branch_id: "purchase-order-capture",
            label: "Purchase-order arithmetic and capture",
            action: "unchanged",
            reason: "The purchase order was not edited.",
          },
          {
            branch_id: "receipt-capture",
            label: "Receipt capture",
            action: "unchanged",
            reason: "The receipt was not edited.",
          },
          {
            branch_id: "invoice-workbook-extraction",
            label: "Workbook capture and extraction",
            action: "new",
            reason:
              "A new immutable XLSX workbook and extraction binding were created.",
          },
          {
            branch_id: "invoice-capture",
            label: "Normalized invoice arithmetic",
            action: "new",
            reason:
              "The new workbook was re-extracted into a new canonical invoice.",
          },
        ],
      };
      lastActivity = {
        kind: "correction",
        summary:
          `Created XLSX invoice revision ${nextRevision}; the prior proof is historical and cannot apply to this specimen record set.`,
        revision: `Revision ${nextRevision}`,
        attempt: `Attempt ${attemptNumber}`,
      };
      return snapshot();
    });
  }

  async function audit(checkRef: string) {
    if (
      typeof checkRef !== "string"
      || !/^invoicecheck_[1-9][0-9]*$/u.test(checkRef)
    ) {
      throw new TypeError("check_ref is invalid.");
    }
    const record = checks.get(checkRef);
    if (!record) throw new Error(`No check exists for ${checkRef}.`);
    const isCurrent = checkIsCurrent(
      record,
      captured.specimen_digests.record_set,
      await selectionMatchesCapturedBytes(),
    );
    const replay = record.proof
      ? proofEngine.replay({ proof: record.proof })
      : null;
    return deepFreeze({
      level: "audit",
      check_ref: checkRef,
      current: isCurrent,
      disposition: isCurrent
        ? record.projection.disposition
        : "stale",
      historical_disposition: record.projection.disposition,
      diagnostic_code: record.diagnostic_code ?? null,
      policy: {
        id: INVOICE_POLICY.id,
        version: INVOICE_POLICY.version,
        digest: INVOICE_POLICY.digest,
      },
      xlsx_source_binding: record.source_binding,
      subject: record.projection.identity.subject,
      proof_id: record.projection.identity.proof_id,
      root_certificate_id:
        record.projection.identity.root_certificate_id,
      requirement_certificate_ids:
        record.proof?.certificate_ids ?? null,
      cacheable_branch_certificate_ids:
        record.proof?.reusable_certificate_ids ?? null,
      branch_cache_actions:
        record.proof?.reusable_branch_actions ?? null,
      snapshot_receipt: record.proof?.audit.snapshot_receipt ?? null,
      signed_bundle_ids:
        record.proof?.audit.signed_bundle_ids ?? [],
      nonce_ids: record.proof?.audit.nonce_ids ?? [],
      replay,
      non_conclusions: [
        ...INVOICE_POLICY_DEFINITION.non_conclusions,
      ],
      note:
        "This content-light audit intentionally excludes workbook and record bytes, cell values, formulas, cached values, filenames, paths, signing keys, signatures, and the authoritative closure containing inline artifacts.",
    });
  }

  return Object.freeze({
    paths: deepFreeze({ ...paths }),
    snapshot,
    checkCurrent,
    applyCorrection,
    audit,
    async close() {
      // The caller owns retention or deletion of the private workspace.
    },
  });
}
