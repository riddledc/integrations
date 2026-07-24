import {
  branchActionLabel,
  dispositionLabel,
  ordinaryState,
} from "/view-model.js";

const RUN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const RUN_TOKEN_STORAGE_KEY = "riddle_invoice_workbench_run";

function captureRunCapability() {
  const current = new URL(window.location.href);
  const supplied = current.searchParams.get("run");
  if (
    current.pathname === "/"
    && current.searchParams.size === 1
    && RUN_TOKEN_PATTERN.test(supplied ?? "")
  ) {
    window.sessionStorage.setItem(RUN_TOKEN_STORAGE_KEY, supplied);
    current.search = "";
    window.history.replaceState(null, "", current.pathname);
  }
  const retained = window.sessionStorage.getItem(RUN_TOKEN_STORAGE_KEY);
  return RUN_TOKEN_PATTERN.test(retained ?? "") ? retained : "";
}

const runCapability = captureRunCapability();

const elements = {
  main: document.querySelector("#main"),
  liveStatus: document.querySelector("#live-status"),
  taskTitle: document.querySelector("#task-title"),
  taskDescription: document.querySelector("#task-description"),
  requirements: document.querySelector("#requirements-list"),
  recordSetLabel: document.querySelector("#record-set-label"),
  recordSetRevision: document.querySelector("#record-set-revision"),
  recordSetAttempt: document.querySelector("#record-set-attempt"),
  recordSetState: document.querySelector("#record-set-state"),
  recordsGrid: document.querySelector("#records-grid"),
  lastActivity: document.querySelector("#last-activity"),
  checkButton: document.querySelector("#check-button"),
  resultSection: document.querySelector("#result-section"),
  resultHeading: document.querySelector("#result-heading"),
  resultState: document.querySelector("#result-state"),
  resultSummary: document.querySelector("#result-summary"),
  resultNextAction: document.querySelector("#result-next-action"),
  findingsRegion: document.querySelector("#findings-region"),
  findingsList: document.querySelector("#findings-list"),
  passedRegion: document.querySelector("#passed-region"),
  passedList: document.querySelector("#passed-list"),
  scopeRegion: document.querySelector("#scope-region"),
  scopeList: document.querySelector("#scope-list"),
  correctionSection: document.querySelector("#correction-section"),
  correctionReason: document.querySelector("#correction-reason"),
  correctionChanges: document.querySelector("#correction-changes"),
  correctButton: document.querySelector("#correct-button"),
  reuseSection: document.querySelector("#reuse-section"),
  reuseSummary: document.querySelector("#reuse-summary"),
  reuseList: document.querySelector("#reuse-list"),
  historyEmpty: document.querySelector("#history-empty"),
  historyList: document.querySelector("#history-list"),
  auditPanel: document.querySelector("#audit-panel"),
  auditOutput: document.querySelector("#audit-output"),
};

let busy = false;
let view = ordinaryState({});

function clear(element) {
  element.replaceChildren();
}

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function setBusy(nextBusy, message) {
  busy = nextBusy;
  elements.main.setAttribute("aria-busy", String(nextBusy));
  elements.checkButton.disabled = nextBusy || !view.can_check;
  elements.correctButton.disabled = nextBusy || !view.can_correct;
  if (message) elements.liveStatus.textContent = message;
}

function stateClass(value) {
  return value
    ? `state-${value.replaceAll("_", "-")}`
    : "state-idle";
}

function renderRequirements(requirements) {
  clear(elements.requirements);
  for (const requirement of requirements) {
    elements.requirements.append(node("li", requirement));
  }
  if (requirements.length === 0) {
    elements.requirements.append(
      node("li", "The installed policy has no displayable requirements."),
    );
  }
}

function recordKindLabel(kind) {
  switch (kind) {
    case "invoice":
      return "Invoice";
    case "purchase_order":
      return "Purchase order";
    case "receipt":
      return "Receipt";
    default:
      return "Record";
  }
}

function recordCard(record) {
  const article = node("article", "", `document-card document-${record.kind}`);
  const header = node("header");
  const headingGroup = node("div");
  headingGroup.append(
    node("p", recordKindLabel(record.kind), "document-kind"),
    node("h3", record.document_id),
  );
  header.append(headingGroup, node("span", record.status, "document-status"));
  article.append(header);

  const metadata = node("dl", "", "document-meta");
  for (const pair of record.metadata) {
    const group = node("div");
    group.append(node("dt", pair.label), node("dd", pair.value));
    metadata.append(group);
  }
  if (record.metadata.length > 0) article.append(metadata);

  if (record.lines.length > 0) {
    const tableWrap = node("div", "", "document-table-wrap");
    const table = node("table", "", "document-table");
    const caption = node(
      "caption",
      `${record.label} ${record.document_id} lines`,
      "visually-hidden",
    );
    const head = node("thead");
    const headRow = node("tr");
    for (const label of ["Item", "Qty", "Unit", "Amount"]) {
      const cell = node("th", label);
      cell.scope = "col";
      headRow.append(cell);
    }
    head.append(headRow);
    const body = node("tbody");
    for (const line of record.lines) {
      const row = node("tr");
      row.append(
        node("td", line.item),
        node("td", line.quantity),
        node("td", line.unit_price),
        node("td", line.amount),
      );
      body.append(row);
    }
    table.append(caption, head, body);
    tableWrap.append(table);
    article.append(tableWrap);
  }

  if (record.totals.length > 0) {
    const totals = node("dl", "", "document-totals");
    for (const total of record.totals) {
      const group = node(
        "div",
        "",
        total.emphasis ? "total-emphasis" : "",
      );
      group.append(node("dt", total.label), node("dd", total.value));
      totals.append(group);
    }
    article.append(totals);
  }

  article.append(node("p", record.revision, "document-revision"));
  return article;
}

function renderRecords(records) {
  clear(elements.recordsGrid);
  for (const record of records) {
    elements.recordsGrid.append(recordCard(record));
  }
  if (records.length === 0) {
    elements.recordsGrid.append(
      node("p", "No displayable records are available.", "empty-copy"),
    );
  }
}

function requirementItem(result, icon) {
  const item = node("li");
  const marker = node("span", icon, "check-marker");
  marker.setAttribute("aria-hidden", "true");
  const body = node("div");
  body.append(node("strong", result.label));
  if (result.explanation) body.append(node("p", result.explanation));
  if (result.sources.length > 0) {
    body.append(
      node("p", `Compared: ${result.sources.join(" · ")}`, "source-note"),
    );
  }
  if (result.repair_guidance) {
    body.append(node("p", result.repair_guidance, "guidance"));
  }
  item.append(marker, body);
  return item;
}

function renderRequirementResults(results, list, region, icon) {
  clear(list);
  for (const result of results) {
    list.append(requirementItem(result, icon));
  }
  region.hidden = results.length === 0;
}

function renderScope(boundaries) {
  clear(elements.scopeList);
  for (const boundary of boundaries) {
    elements.scopeList.append(node("li", boundary));
  }
  elements.scopeRegion.hidden = boundaries.length === 0;
}

function renderCorrection(correction) {
  clear(elements.correctionChanges);
  for (const change of correction.changes) {
    const row = node("tr");
    const label = node("th", change.label);
    label.scope = "row";
    row.append(
      label,
      node("td", change.from, "change-before"),
      node("td", change.to, "change-after"),
    );
    elements.correctionChanges.append(row);
  }
  elements.correctionReason.textContent = correction.reason;
  elements.correctButton.textContent = correction.label;
  elements.correctButton.disabled = busy || !correction.available;
  elements.correctionSection.hidden = !correction.available;
}

function renderReuse(reuse) {
  clear(elements.reuseList);
  for (const branch of reuse.branches) {
    const item = node("li");
    const body = node("div");
    body.append(node("strong", branch.label));
    if (branch.reason) body.append(node("p", branch.reason));
    item.append(
      body,
      node(
        "span",
        branchActionLabel(branch.action),
        `branch-pill branch-${branch.action}`,
      ),
    );
    elements.reuseList.append(item);
  }
  elements.reuseSummary.textContent = reuse.summary;
  elements.reuseSection.hidden = reuse.branches.length === 0;
}

function auditButton(entry) {
  const button = node("button", "View audit", "button button-quiet");
  button.type = "button";
  button.disabled = !entry.check_ref || busy;
  button.setAttribute(
    "aria-label",
    `View audit for ${entry.revision}, ${entry.attempt}`,
  );
  button.addEventListener("click", () => {
    void loadAudit(entry.check_ref);
  });
  return button;
}

function renderHistory(history) {
  clear(elements.historyList);
  elements.historyEmpty.hidden = history.length > 0;
  for (const entry of history) {
    const item = node("li");
    const body = node("div");
    body.append(node("strong", entry.headline));
    const metaParts = [entry.revision, entry.attempt];
    if (entry.checked_at) metaParts.push(entry.checked_at);
    body.append(node("p", metaParts.join(" · ")));
    if (entry.reused_branch_count || entry.recomputed_branch_count) {
      body.append(node(
        "p",
        `${entry.reused_branch_count} reused · `
          + `${entry.recomputed_branch_count} checked again`,
        "history-reuse",
      ));
    }
    const actions = node("div", "", "history-actions");
    actions.append(
      node(
        "span",
        dispositionLabel(entry.disposition),
        `state-pill ${stateClass(entry.disposition)}`,
      ),
      auditButton(entry),
    );
    item.append(body, actions);
    elements.historyList.append(item);
  }
}

function render(snapshot) {
  view = ordinaryState(snapshot);
  elements.taskTitle.textContent = view.task.title;
  elements.taskDescription.textContent = view.task.description;
  renderRequirements(view.task.requirements);
  elements.recordSetLabel.textContent = view.record_set.label;
  elements.recordSetRevision.textContent = view.record_set.revision;
  elements.recordSetAttempt.textContent = view.record_set.attempt;
  renderRecords(view.record_set.records);

  const activity = view.last_activity;
  elements.lastActivity.hidden = activity === null;
  elements.lastActivity.textContent = activity
    ? `Last change: ${activity.summary}`
    : "";

  const check = view.current_check;
  const checkLabel = dispositionLabel(check?.disposition);
  elements.recordSetState.textContent = checkLabel;
  elements.recordSetState.className =
    `state-pill ${stateClass(check?.disposition)}`;
  elements.checkButton.disabled = busy || !view.can_check;
  elements.checkButton.textContent = view.can_check
    ? "Check current record set"
    : "Current attempt already checked";

  elements.resultSection.hidden = check === null;
  if (check) {
    elements.resultHeading.textContent = check.headline;
    elements.resultState.textContent = checkLabel;
    elements.resultState.className =
      `state-pill ${stateClass(check.disposition)}`;
    elements.resultSummary.textContent = check.summary;
    elements.resultNextAction.textContent = check.next_action;
    renderRequirementResults(
      check.findings,
      elements.findingsList,
      elements.findingsRegion,
      "!",
    );
    renderRequirementResults(
      check.passed_checks,
      elements.passedList,
      elements.passedRegion,
      "✓",
    );
    renderScope(check.non_conclusions);
  } else {
    elements.resultHeading.textContent = "Result";
    elements.resultSummary.textContent = "";
    elements.resultNextAction.textContent = "";
    renderRequirementResults(
      [],
      elements.findingsList,
      elements.findingsRegion,
      "!",
    );
    renderRequirementResults(
      [],
      elements.passedList,
      elements.passedRegion,
      "✓",
    );
    renderScope([]);
  }

  renderCorrection(view.correction);
  renderReuse(view.reuse);
  renderHistory(view.history);
}

async function jsonRequest(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: {
      accept: "application/json",
      "x-riddle-invoice-run": runCapability,
      ...(options?.method === "POST"
        ? { "content-type": "application/json" }
        : {}),
    },
  });
  const value = await response.json();
  if (!response.ok) {
    throw new Error(
      value?.error?.message || "The local operation failed.",
    );
  }
  return value;
}

async function refresh() {
  try {
    const snapshot = await jsonRequest("/api/state");
    render(snapshot);
    elements.liveStatus.textContent = view.current_check
      ? view.current_check.headline
      : "The current immutable record set is ready to check.";
  } catch (error) {
    elements.liveStatus.textContent = error instanceof Error
      ? error.message
      : "The local record state could not be loaded.";
  }
}

async function runOperation(path, runningMessage, completeMessage) {
  if (busy) return;
  setBusy(true, runningMessage);
  try {
    const snapshot = await jsonRequest(path, {
      method: "POST",
      body: "{}",
    });
    render(snapshot);
    elements.liveStatus.textContent = completeMessage(view);
  } catch (error) {
    try {
      render(await jsonRequest("/api/state"));
    } catch {
      // Preserve the last complete local projection if refresh also fails.
    }
    elements.liveStatus.textContent = error instanceof Error
      ? error.message
      : "The local operation failed.";
  } finally {
    setBusy(false);
    render(view);
  }
}

async function loadAudit(checkRef) {
  if (!checkRef || busy) return;
  setBusy(true, "Loading audit details for the selected check…");
  try {
    const audit = await jsonRequest(
      `/api/audit?check_ref=${encodeURIComponent(checkRef)}`,
    );
    elements.auditOutput.textContent = JSON.stringify(audit, null, 2);
    elements.auditPanel.open = true;
    elements.auditOutput.focus();
    elements.liveStatus.textContent = "Audit details loaded.";
  } catch (error) {
    elements.liveStatus.textContent = error instanceof Error
      ? error.message
      : "Audit details could not be loaded.";
  } finally {
    setBusy(false);
    render(view);
  }
}

elements.checkButton.addEventListener("click", () => {
  void runOperation(
    "/api/check",
    "Recomputing arithmetic and checking all three records…",
    (currentView) =>
      currentView.current_check?.headline || "Check complete.",
  );
});

elements.correctButton.addEventListener("click", () => {
  if (!view.correction.available) return;
  void runOperation(
    "/api/correct",
    "Creating the exact invoice-only revision…",
    () => "A corrected immutable invoice revision is ready to check.",
  );
});

void refresh();
