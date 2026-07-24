import {
  dispositionLabel,
  ordinaryView,
} from "/view-model.js";

const RUN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const RUN_TOKEN_STORAGE_KEY = "riddle_web_change_run";

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
  candidateLabel: document.querySelector("#candidate-label"),
  candidateRevision: document.querySelector("#candidate-revision"),
  candidateAttempt: document.querySelector("#candidate-attempt"),
  candidateState: document.querySelector("#candidate-state"),
  preview: document.querySelector("#candidate-preview"),
  previewUnavailable: document.querySelector("#preview-unavailable"),
  checkButton: document.querySelector("#check-button"),
  retryButton: document.querySelector("#retry-button"),
  lastActivity: document.querySelector("#last-activity"),
  resultSection: document.querySelector("#result-section"),
  resultHeading: document.querySelector("#result-heading"),
  resultNextAction: document.querySelector("#result-next-action"),
  findingsRegion: document.querySelector("#findings-region"),
  findingsList: document.querySelector("#findings-list"),
  scopeRegion: document.querySelector("#scope-region"),
  scopeList: document.querySelector("#scope-list"),
  repairRegion: document.querySelector("#repair-region"),
  repairReason: document.querySelector("#repair-reason"),
  repairButton: document.querySelector("#repair-button"),
  historyEmpty: document.querySelector("#history-empty"),
  historyList: document.querySelector("#history-list"),
  auditPanel: document.querySelector("#audit-panel"),
  auditOutput: document.querySelector("#audit-output"),
};

let busy = false;
let view = ordinaryView({});

function clear(element) {
  element.replaceChildren();
}

function setBusy(nextBusy, message) {
  busy = nextBusy;
  elements.main.setAttribute("aria-busy", String(nextBusy));
  elements.checkButton.disabled = nextBusy;
  elements.repairButton.disabled = nextBusy;
  elements.retryButton.disabled = nextBusy;
  if (message) elements.liveStatus.textContent = message;
}

function stateClass(disposition) {
  return disposition ? `state-${disposition.replaceAll("_", "-")}` : "state-idle";
}

function renderRequirements(requirements) {
  clear(elements.requirements);
  for (const requirement of requirements) {
    const item = document.createElement("li");
    item.textContent = requirement;
    elements.requirements.append(item);
  }
  if (requirements.length === 0) {
    const item = document.createElement("li");
    item.textContent = "The installed task has no displayable requirements.";
    elements.requirements.append(item);
  }
}

function renderPreview(candidate) {
  if (candidate.preview_url) {
    if (elements.preview.src !== candidate.preview_url) {
      elements.preview.src = candidate.preview_url;
    }
    elements.preview.title = `Live preview of ${candidate.label}`;
    elements.preview.hidden = false;
    elements.previewUnavailable.hidden = true;
  } else {
    elements.preview.removeAttribute("src");
    elements.preview.hidden = true;
    elements.previewUnavailable.hidden = false;
  }
}

function renderFindings(findings) {
  clear(elements.findingsList);
  for (const finding of findings) {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = finding.label;
    item.append(title);
    if (finding.explanation) {
      const explanation = document.createElement("p");
      explanation.textContent = finding.explanation;
      item.append(explanation);
    }
    if (finding.repair_guidance) {
      const guidance = document.createElement("p");
      guidance.className = "guidance";
      guidance.textContent = finding.repair_guidance;
      item.append(guidance);
    }
    elements.findingsList.append(item);
  }
  elements.findingsRegion.hidden = findings.length === 0;
}

function renderScope(boundaries) {
  clear(elements.scopeList);
  for (const boundary of boundaries) {
    const item = document.createElement("li");
    item.textContent = boundary;
    elements.scopeList.append(item);
  }
  elements.scopeRegion.hidden = boundaries.length === 0;
}

function auditButton(entry) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button-quiet";
  button.textContent = "View audit";
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
    const item = document.createElement("li");
    const body = document.createElement("div");
    const heading = document.createElement("strong");
    heading.textContent = entry.headline;
    const meta = document.createElement("p");
    meta.textContent = entry.checked_at
      ? `${entry.revision} · ${entry.attempt} · ${entry.checked_at}`
      : `${entry.revision} · ${entry.attempt}`;
    body.append(heading, meta);
    const actions = document.createElement("div");
    const status = document.createElement("span");
    status.className = `state-pill ${stateClass(entry.disposition)}`;
    status.textContent = dispositionLabel(entry.disposition);
    actions.append(status, auditButton(entry));
    item.append(body, actions);
    elements.historyList.append(item);
  }
}

function render(snapshot) {
  view = ordinaryView(snapshot);
  elements.taskTitle.textContent = view.task.title;
  elements.taskDescription.textContent = view.task.description;
  renderRequirements(view.task.requirements);
  elements.candidateLabel.textContent = view.candidate.label;
  elements.candidateRevision.textContent = view.candidate.revision;
  elements.candidateAttempt.textContent = view.candidate.attempt;
  renderPreview(view.candidate);
  const lastActivity = view.last_activity;
  elements.lastActivity.hidden = lastActivity === null;
  elements.lastActivity.textContent = lastActivity === null
    ? ""
    : `Last change: ${lastActivity.summary}`;

  const current = view.current_check;
  elements.candidateState.textContent = dispositionLabel(
    current?.disposition,
  );
  elements.candidateState.className =
    `state-pill ${stateClass(current?.disposition)}`;
  elements.checkButton.disabled = busy || !view.can_check;
  elements.checkButton.textContent = view.can_check
    ? "Check current candidate"
    : "Candidate already checked";
  elements.resultSection.hidden = current === null;
  if (current) {
    elements.resultHeading.textContent = current.headline;
    elements.resultNextAction.textContent = current.next_action;
    renderFindings(current.findings);
    renderScope(current.non_conclusions);
  } else {
    elements.resultHeading.textContent = "Result";
    elements.resultNextAction.textContent = "";
    renderFindings([]);
    renderScope([]);
  }

  const canRepair = view.repair.available;
  elements.repairRegion.hidden = !canRepair;
  elements.repairButton.hidden = !canRepair;
  elements.repairButton.disabled = busy || !canRepair;
  elements.repairButton.textContent = view.repair.label;
  elements.repairReason.textContent = view.repair.reason
    || "Apply the configured repair, then check the new candidate.";
  const canRetry = view.retry.available;
  elements.retryButton.hidden = !canRetry;
  elements.retryButton.disabled = busy || !canRetry;
  elements.retryButton.textContent = view.retry.label;
  elements.retryButton.title = view.retry.reason;
  renderHistory(view.history);
}

async function jsonRequest(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: {
      accept: "application/json",
      "x-riddle-web-change-run": runCapability,
      ...(options?.method === "POST"
        ? { "content-type": "application/json" }
        : {}),
    },
  });
  const value = await response.json();
  if (!response.ok) {
    const message = value?.error?.message || "The local operation failed.";
    throw new Error(message);
  }
  return value;
}

async function refresh() {
  try {
    const snapshot = await jsonRequest("/api/snapshot");
    render(snapshot);
    elements.liveStatus.textContent = view.current_check
      ? view.current_check.headline
      : "Current candidate is ready to check.";
  } catch (error) {
    elements.liveStatus.textContent =
      error instanceof Error ? error.message : "The local state could not be loaded.";
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
      render(await jsonRequest("/api/snapshot"));
    } catch {
      // Keep the last complete local view if state refresh also fails.
    }
    elements.liveStatus.textContent =
      error instanceof Error ? error.message : "The local operation failed.";
  } finally {
    setBusy(false);
    render(view);
  }
}

async function loadAudit(checkRef) {
  if (!checkRef || busy) return;
  setBusy(true, "Loading requested audit details…");
  try {
    const audit = await jsonRequest(
      `/api/audit/${encodeURIComponent(checkRef)}`,
    );
    elements.auditOutput.textContent = JSON.stringify(audit, null, 2);
    elements.auditPanel.open = true;
    elements.auditOutput.focus();
    elements.liveStatus.textContent = "Audit details loaded.";
  } catch (error) {
    elements.liveStatus.textContent =
      error instanceof Error ? error.message : "Audit details could not be loaded.";
  } finally {
    setBusy(false);
    render(view);
  }
}

elements.checkButton.addEventListener("click", () => {
  void runOperation(
    "/api/check",
    "Checking the current candidate…",
    (currentView) => currentView.current_check?.headline || "Check complete.",
  );
});

elements.repairButton.addEventListener("click", () => {
  if (!view.repair.available) return;
  void runOperation(
    "/api/repair",
    "Applying the explicit repair and preparing the new candidate…",
    (currentView) =>
      currentView.current_check?.headline
      || "The repaired candidate is ready to check.",
  );
});

elements.retryButton.addEventListener("click", () => {
  if (!view.retry.available) return;
  void runOperation(
    "/api/retry",
    "Preparing a fresh attempt from the unchanged source…",
    () => "A fresh attempt is ready to check.",
  );
});

void refresh();
