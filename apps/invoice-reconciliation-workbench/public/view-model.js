const DISPOSITIONS = new Set([
  "conforms",
  "does_not_conform",
  "stale",
  "could_not_check",
]);

const RECORD_KINDS = new Set([
  "invoice",
  "purchase_order",
  "receipt",
]);

const BRANCH_ACTIONS = new Set([
  "reused",
  "recomputed",
  "new",
  "unchanged",
]);

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function boolean(value) {
  return value === true;
}

function integer(value, fallback = 0) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function disposition(value) {
  return DISPOSITIONS.has(value) ? value : null;
}

function displayPair(value) {
  const source = record(value);
  const label = text(source.label);
  const pairValue = text(source.value);
  return label && pairValue ? { label, value: pairValue } : null;
}

function documentLine(value) {
  const source = record(value);
  return {
    line_id: text(source.line_id),
    item: text(source.item, "Item"),
    quantity: text(source.quantity, "—"),
    unit_price: text(source.unit_price, "—"),
    amount: text(source.amount, "—"),
  };
}

function documentTotal(value) {
  const source = record(value);
  const label = text(source.label);
  const totalValue = text(source.value);
  if (!label || !totalValue) return null;
  return {
    label,
    value: totalValue,
    emphasis: boolean(source.emphasis),
  };
}

function displayDocument(value) {
  const source = record(value);
  const kind = RECORD_KINDS.has(source.kind) ? source.kind : null;
  if (!kind) return null;
  return {
    kind,
    label: text(source.label, {
      invoice: "Invoice",
      purchase_order: "Purchase order",
      receipt: "Receipt",
    }[kind]),
    document_id: text(source.document_id, "Unknown"),
    revision: text(source.revision, "Revision unavailable"),
    status: text(source.status, "Captured"),
    metadata: array(source.metadata)
      .map(displayPair)
      .filter((pair) => pair !== null),
    lines: array(source.lines).map(documentLine),
    totals: array(source.totals)
      .map(documentTotal)
      .filter((total) => total !== null),
  };
}

function requirementResult(value) {
  const source = record(value);
  return {
    requirement_id: text(source.requirement_id),
    label: text(source.label, "Requirement"),
    explanation: text(source.explanation),
    sources: array(source.sources)
      .map((entry) => text(entry))
      .filter(Boolean),
    repair_guidance: text(source.repair_guidance),
  };
}

function currentCheck(value) {
  const source = record(value);
  const checkDisposition = disposition(source.disposition);
  if (!checkDisposition) return null;
  return {
    check_ref: text(source.check_ref),
    disposition: checkDisposition,
    current: boolean(source.current),
    headline: text(source.headline, "Check complete"),
    summary: text(source.summary),
    next_action: text(source.next_action),
    findings: array(source.findings).map(requirementResult),
    passed_checks: array(source.passed_checks).map(requirementResult),
    non_conclusions: array(source.non_conclusions)
      .map((entry) => text(entry))
      .filter(Boolean),
  };
}

function correctionChange(value) {
  const source = record(value);
  const field = text(source.field);
  const label = text(source.label);
  const before = text(source.from);
  const after = text(source.to);
  if (!field || !label || !before || !after) return null;
  return { field, label, from: before, to: after };
}

function reuseBranch(value) {
  const source = record(value);
  const action = BRANCH_ACTIONS.has(source.action)
    ? source.action
    : null;
  const branchId = text(source.branch_id);
  const label = text(source.label);
  if (!action || !branchId || !label) return null;
  return {
    branch_id: branchId,
    label,
    action,
    reason: text(source.reason),
  };
}

function historyEntry(value) {
  const source = record(value);
  const entryDisposition = disposition(source.disposition);
  if (!entryDisposition) return null;
  return {
    check_ref: text(source.check_ref),
    record_set_ref: text(source.record_set_ref),
    revision: text(source.revision, "Unknown revision"),
    attempt: text(source.attempt, "Unknown attempt"),
    disposition: entryDisposition,
    current: boolean(source.current),
    headline: text(source.headline, "Check complete"),
    checked_at: text(source.checked_at),
    reused_branch_count: integer(source.reused_branch_count),
    recomputed_branch_count: integer(source.recomputed_branch_count),
  };
}

function activity(value) {
  const source = record(value);
  const summary = text(source.summary);
  if (!summary) return null;
  return {
    kind: text(source.kind),
    summary,
    revision: text(source.revision),
    attempt: text(source.attempt),
  };
}

/**
 * Selects display-safe application meaning from the private workbench state.
 *
 * Unknown input—including proof envelopes, nonces, signatures, digests, and
 * certificate bodies—is deliberately dropped. This function performs no
 * arithmetic and makes no proof decision.
 */
export function ordinaryState(value) {
  const source = record(value);
  const task = record(source.task);
  const recordSet = record(source.record_set);
  const correction = record(source.correction);
  const reuse = record(source.reuse);
  const check = currentCheck(source.current_check);
  const unsafeChanges = array(correction.changes);
  const normalizedChanges = unsafeChanges.map(correctionChange);
  const changesWellFormed = (
    unsafeChanges.length > 0
    && normalizedChanges.every((change) => change !== null)
  );
  const changes = normalizedChanges.filter((change) => change !== null);
  const correctionAvailable = (
    source.can_correct === true
    && correction.available === true
    && check?.disposition === "does_not_conform"
    && check.current === true
    && changesWellFormed
  );
  return {
    task: {
      title: text(task.title, "Invoice reconciliation"),
      description: text(
        task.description,
        "Check one invoice against its purchase order and receipt.",
      ),
      requirements: array(task.requirements)
        .map((entry) => text(entry))
        .filter(Boolean),
    },
    record_set: {
      record_set_ref: text(recordSet.record_set_ref),
      label: text(recordSet.label, "Current record set"),
      revision: text(recordSet.revision, "Unknown revision"),
      attempt: text(recordSet.attempt, "Unknown attempt"),
      records: array(recordSet.records)
        .map(displayDocument)
        .filter((document) => document !== null),
    },
    current_check: check,
    correction: {
      available: correctionAvailable,
      label: text(correction.label, "Create corrected invoice revision"),
      reason: text(correction.reason),
      changes,
    },
    reuse: {
      summary: text(reuse.summary),
      branches: array(reuse.branches)
        .map(reuseBranch)
        .filter((branch) => branch !== null),
    },
    last_activity: activity(source.last_activity),
    can_check: source.can_check === true,
    can_correct: correctionAvailable,
    history: array(source.history)
      .map(historyEntry)
      .filter((entry) => entry !== null),
  };
}

export function correctionIsAvailable(value) {
  return ordinaryState(value).correction.available;
}

export function dispositionLabel(value) {
  switch (value) {
    case "conforms":
      return "Records agree";
    case "does_not_conform":
      return "Needs correction";
    case "stale":
      return "Check is out of date";
    case "could_not_check":
      return "Could not check";
    default:
      return "Not checked";
  }
}

export function branchActionLabel(value) {
  switch (value) {
    case "reused":
      return "Reused";
    case "recomputed":
      return "Checked again";
    case "new":
      return "New";
    case "unchanged":
      return "Unchanged";
    default:
      return "Unknown";
  }
}
