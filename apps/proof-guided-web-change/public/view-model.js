const DISPOSITIONS = new Set([
  "conforms",
  "does_not_conform",
  "stale",
  "could_not_check",
]);

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function boolean(value) {
  return value === true;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function disposition(value) {
  return DISPOSITIONS.has(value) ? value : null;
}

function finding(value) {
  const source = record(value);
  return {
    requirement_id: text(source.requirement_id),
    label: text(source.label, "Requirement"),
    explanation: text(source.explanation),
    repair_guidance: text(source.repair_guidance),
  };
}

function check(value) {
  const source = record(value);
  const checkDisposition = disposition(source.disposition);
  if (!checkDisposition) return null;
  return {
    check_ref: text(source.check_ref),
    disposition: checkDisposition,
    current: boolean(source.current),
    headline: text(source.headline, "Check complete"),
    next_action: text(source.next_action),
    findings: array(source.findings).map(finding),
    non_conclusions: array(source.non_conclusions)
      .map((boundary) => text(boundary))
      .filter(Boolean),
  };
}

function historyEntry(value) {
  const source = record(value);
  const entryDisposition = disposition(source.disposition);
  if (!entryDisposition) return null;
  return {
    check_ref: text(source.check_ref),
    candidate_ref: text(source.candidate_ref),
    revision: text(source.revision, "Unknown revision"),
    attempt: text(source.attempt, "Unknown attempt"),
    disposition: entryDisposition,
    current: boolean(source.current),
    headline: text(source.headline, "Check complete"),
    checked_at: text(source.checked_at),
  };
}

function activity(value) {
  const source = record(value);
  const summary = text(source.summary);
  if (!summary) return null;
  return {
    summary,
    kind: text(source.kind),
    revision: text(source.revision),
    attempt: text(source.attempt),
  };
}

/**
 * Selects only ordinary product meaning from an application snapshot.
 * Unknown fields—including audit material—are deliberately dropped.
 */
export function ordinaryView(snapshot) {
  const source = record(snapshot);
  const task = record(source.task);
  const candidate = record(source.candidate);
  const repair = record(source.repair);
  const retry = record(source.retry);
  const currentCheck = check(source.current_check);
  const history = array(source.history)
    .map(historyEntry)
    .filter((entry) => entry !== null);
  return {
    task: {
      title: text(task.title, "Durable website change"),
      description: text(
        task.description,
        "Check the current candidate against its installed change contract.",
      ),
      requirements: array(task.requirements)
        .map((requirement) => text(requirement))
        .filter(Boolean),
    },
    candidate: {
      label: text(candidate.label, "Current candidate"),
      candidate_ref: text(candidate.candidate_ref),
      revision: text(candidate.revision, "Unknown revision"),
      attempt: text(candidate.attempt, "Unknown attempt"),
      preview_url: text(candidate.preview_url),
    },
    current_check: currentCheck,
    repair: {
      available:
        currentCheck?.disposition === "does_not_conform"
        && repair.available === true,
      label: text(repair.label, "Apply repair"),
      reason: text(repair.reason),
      last: activity(repair.last),
    },
    retry: {
      available:
        source.can_retry === true
        && retry.available === true,
      label: text(retry.label, "Prepare fresh attempt"),
      reason: text(retry.reason),
      last: activity(retry.last),
    },
    last_activity: activity(source.last_activity),
    can_check: source.can_check === true,
    can_retry: source.can_retry === true,
    history,
  };
}

export function repairIsAvailable(snapshot) {
  return ordinaryView(snapshot).repair.available;
}

export function dispositionLabel(value) {
  switch (value) {
    case "conforms":
      return "Matches requested change";
    case "does_not_conform":
      return "Not yet in spec";
    case "stale":
      return "Check is out of date";
    case "could_not_check":
      return "Could not check";
    default:
      return "Not checked";
  }
}
