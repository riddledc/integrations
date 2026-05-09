export const RIDDLE_PROOF_BASIC_GAMEPLAY_VERSION = "riddle-proof.basic-gameplay.v1";
export const RIDDLE_PROOF_BASIC_GAMEPLAY_ASSESSMENT_VERSION = "riddle-proof.basic-gameplay.assessment.v1";
export const RIDDLE_PROOF_BASIC_GAMEPLAY_CATCH_VERSION = "riddle-proof.basic-gameplay.catch.v1";

export type BasicGameplayFailureCode =
  | "route_http_error"
  | "fatal_page_error"
  | "route_blank_or_thin"
  | "no_game_surface"
  | "mobile_horizontal_overflow"
  | "primary_control_missing"
  | "primary_control_inert";

export type BasicGameplayWarningCode =
  | "canvas_inert"
  | "some_actions_failed"
  | "missing_reset_path"
  | "critical_console_error";

export interface BasicGameplayCanvasState {
  index?: number;
  width?: number;
  height?: number;
  css_width?: number;
  css_height?: number;
  visible?: boolean;
  readable?: boolean;
  hash?: string | null;
}

export interface BasicGameplaySnapshot {
  screenshot_hash?: string | null;
  body_text_hash?: string | null;
  body_text_length?: number;
  visible_large_node_count?: number;
  enabled_clickable_count?: number;
  reset_control_count?: number;
  visible_canvas_count?: number;
  canvases?: BasicGameplayCanvasState[];
  [key: string]: unknown;
}

export interface BasicGameplayActionResult {
  ok?: boolean;
  action?: string;
  [key: string]: unknown;
}

export interface BasicGameplayMobileEvidence {
  overflow_px?: number;
  [key: string]: unknown;
}

export interface RiddleProofBasicGameplayRouteEvidence {
  name?: string;
  path?: string;
  http_status?: number | null;
  response_status?: number | null;
  status?: number | null;
  console_error_count?: number;
  page_error_count?: number;
  initial?: BasicGameplaySnapshot;
  timed?: BasicGameplaySnapshot;
  after_action?: BasicGameplaySnapshot;
  afterAction?: BasicGameplaySnapshot;
  mobile?: BasicGameplayMobileEvidence;
  action_results?: BasicGameplayActionResult[];
  actionResults?: BasicGameplayActionResult[];
  requires_reset?: boolean;
  [key: string]: unknown;
}

export interface RiddleProofBasicGameplayEvidence {
  version?: typeof RIDDLE_PROOF_BASIC_GAMEPLAY_VERSION | string;
  site?: string | null;
  base_url?: string;
  results?: RiddleProofBasicGameplayRouteEvidence[];
  [key: string]: unknown;
}

export interface AssessBasicGameplayOptions {
  maxMobileOverflowPx?: number;
  minBodyTextLength?: number;
  minVisibleLargeNodes?: number;
  minSurfaceLargeNodes?: number;
  warnOnMissingResetPath?: boolean;
  warnOnConsoleError?: boolean;
  failOnConsoleError?: boolean;
}

export interface BasicGameplayChangeSummary {
  body_text_changed: boolean;
  screenshot_changed: boolean;
  canvas_changed: boolean;
  changed: boolean;
}

export interface RiddleProofBasicGameplayRouteAssessment {
  name?: string;
  path?: string;
  ok: boolean;
  failures: BasicGameplayFailureCode[];
  warnings: BasicGameplayWarningCode[];
  signals: {
    route_loaded: boolean;
    surface_visible: boolean;
    action_attempted: boolean;
    timed_progression_observed: boolean;
    first_interaction_observed: boolean;
    state_change_observed: boolean;
    mobile_overflow_absent: boolean;
    reset_path_present: boolean;
    fatal_errors_absent: boolean;
  };
  diffs: {
    timed: BasicGameplayChangeSummary;
    after_action: BasicGameplayChangeSummary;
  };
}

export interface RiddleProofBasicGameplayAssessment {
  version: typeof RIDDLE_PROOF_BASIC_GAMEPLAY_ASSESSMENT_VERSION;
  evidence_present: boolean;
  passed: boolean;
  checked_routes: number;
  passing_routes: number;
  failing_routes: Array<{
    name?: string;
    path?: string;
    failures: BasicGameplayFailureCode[];
    warnings: BasicGameplayWarningCode[];
  }>;
  failure_counts: Record<string, number>;
  warning_counts: Record<string, number>;
  route_results: RiddleProofBasicGameplayRouteAssessment[];
}

export interface BasicGameplayProofArtifact {
  name: string;
  role?: string;
  kind?: string;
  url?: string;
  path?: string;
  sha256?: string;
  [key: string]: unknown;
}

export interface BasicGameplayFixReference {
  repo?: string;
  commit?: string;
  pr_url?: string;
  summary?: string;
  [key: string]: unknown;
}

export interface CreateBasicGameplayCatchSummaryInput {
  title?: string;
  site?: string;
  route?: string;
  detected_at?: string;
  before: unknown;
  after?: unknown;
  fix?: BasicGameplayFixReference;
  artifacts?: BasicGameplayProofArtifact[];
}

export interface BasicGameplayAssessmentSummary {
  evidence_present: boolean;
  passed: boolean;
  checked_routes: number;
  passing_routes: number;
  failing_routes: RiddleProofBasicGameplayAssessment["failing_routes"];
  failure_counts: Record<string, number>;
  warning_counts: Record<string, number>;
  notable_codes: string[];
}

export interface RiddleProofBasicGameplayCatchSummary {
  version: typeof RIDDLE_PROOF_BASIC_GAMEPLAY_CATCH_VERSION;
  title: string;
  site?: string;
  route?: string;
  detected_at: string;
  before: BasicGameplayAssessmentSummary;
  after?: BasicGameplayAssessmentSummary;
  fixed: boolean;
  fix?: BasicGameplayFixReference;
  artifacts: BasicGameplayProofArtifact[];
  summary_lines: string[];
  marketing_summary: string;
}

const BASIC_GAMEPLAY_CONTAINER_KEYS = [
  "basic_gameplay",
  "basicGameplay",
  "basic_gameplay_evidence",
  "basicGameplayEvidence",
  "gameplay_proof",
  "gameplayProof",
];

export function assessBasicGameplayEvidence(
  evidence: unknown,
  options: AssessBasicGameplayOptions = {},
): RiddleProofBasicGameplayAssessment {
  const run = extractBasicGameplayEvidence(evidence);
  if (!run) {
    return {
      version: RIDDLE_PROOF_BASIC_GAMEPLAY_ASSESSMENT_VERSION,
      evidence_present: false,
      passed: false,
      checked_routes: 0,
      passing_routes: 0,
      failing_routes: [],
      failure_counts: {},
      warning_counts: {},
      route_results: [],
    };
  }

  const routeResults = (run.results || []).map((route) => assessBasicGameplayRoute(route, options));
  const failingRoutes = routeResults
    .filter((result) => !result.ok)
    .map((result) => ({
      name: result.name,
      path: result.path,
      failures: result.failures,
      warnings: result.warnings,
    }));

  return {
    version: RIDDLE_PROOF_BASIC_GAMEPLAY_ASSESSMENT_VERSION,
    evidence_present: true,
    passed: failingRoutes.length === 0,
    checked_routes: routeResults.length,
    passing_routes: routeResults.filter((result) => result.ok).length,
    failing_routes: failingRoutes,
    failure_counts: countCodes(routeResults.flatMap((result) => result.failures)),
    warning_counts: countCodes(routeResults.flatMap((result) => result.warnings)),
    route_results: routeResults,
  };
}

export function assessBasicGameplayRoute(
  route: RiddleProofBasicGameplayRouteEvidence,
  options: AssessBasicGameplayOptions = {},
): RiddleProofBasicGameplayRouteAssessment {
  const maxMobileOverflowPx = options.maxMobileOverflowPx ?? 4;
  const minBodyTextLength = options.minBodyTextLength ?? 20;
  const minVisibleLargeNodes = options.minVisibleLargeNodes ?? 3;
  const minSurfaceLargeNodes = options.minSurfaceLargeNodes ?? 8;
  const warnOnMissingResetPath = options.warnOnMissingResetPath ?? true;
  const warnOnConsoleError = options.warnOnConsoleError ?? true;
  const failOnConsoleError = options.failOnConsoleError ?? false;

  const failures: BasicGameplayFailureCode[] = [];
  const warnings: BasicGameplayWarningCode[] = [];
  const initial = route.initial || {};
  const timed = route.timed || {};
  const afterAction = route.after_action || route.afterAction || {};
  const mobile = route.mobile || {};
  const timedChange = changed(initial, timed);
  const actionChange = changed(timed, afterAction);
  const surfaceVisible = numberValue(initial.visible_canvas_count) > 0 ||
    numberValue(initial.enabled_clickable_count) > 0 ||
    numberValue(initial.visible_large_node_count) >= minSurfaceLargeNodes;
  const actionResults = listValue(route.action_results || route.actionResults) as BasicGameplayActionResult[];
  const actionAttempted = actionResults.some((result) => result.ok === true && result.action !== "wait");
  const actionFailed = actionResults.some((result) => result.ok === false && result.action !== "wait");
  const stateChangeObserved = actionChange.changed || timedChange.changed;
  const resetPathPresent = numberValue(initial.reset_control_count) > 0 ||
    numberValue(timed.reset_control_count) > 0 ||
    numberValue(afterAction.reset_control_count) > 0;
  const responseStatus = firstNumber(route.http_status, route.response_status, route.status);
  const pageErrorCount = numberValue(route.page_error_count);
  const consoleErrorCount = numberValue(route.console_error_count);
  const mobileOverflowPx = numberValue(mobile.overflow_px);

  if (responseStatus !== null && responseStatus >= 400) failures.push("route_http_error");
  if (pageErrorCount > 0) failures.push("fatal_page_error");
  if (numberValue(initial.body_text_length) < minBodyTextLength && numberValue(initial.visible_large_node_count) < minVisibleLargeNodes) {
    failures.push("route_blank_or_thin");
  }
  if (!surfaceVisible) failures.push("no_game_surface");
  if (mobileOverflowPx > maxMobileOverflowPx) failures.push("mobile_horizontal_overflow");
  if (!actionAttempted && !timedChange.changed) failures.push("primary_control_missing");
  if (actionAttempted && !stateChangeObserved) failures.push("primary_control_inert");
  if (failOnConsoleError && consoleErrorCount > 0) failures.push("fatal_page_error");

  if (numberValue(initial.visible_canvas_count) > 0 && actionAttempted && !timedChange.canvas_changed && !actionChange.canvas_changed && !actionChange.screenshot_changed) {
    warnings.push("canvas_inert");
  }
  if (actionFailed) warnings.push("some_actions_failed");
  if (warnOnMissingResetPath && !resetPathPresent && route.requires_reset !== false && actionAttempted && stateChangeObserved) {
    warnings.push("missing_reset_path");
  }
  if (warnOnConsoleError && consoleErrorCount > 0) warnings.push("critical_console_error");

  return {
    name: route.name,
    path: route.path,
    ok: failures.length === 0,
    failures,
    warnings,
    signals: {
      route_loaded: !failures.includes("route_http_error") && !failures.includes("route_blank_or_thin"),
      surface_visible: surfaceVisible,
      action_attempted: actionAttempted,
      timed_progression_observed: timedChange.changed,
      first_interaction_observed: actionChange.changed,
      state_change_observed: stateChangeObserved,
      mobile_overflow_absent: mobileOverflowPx <= maxMobileOverflowPx,
      reset_path_present: resetPathPresent,
      fatal_errors_absent: pageErrorCount === 0,
    },
    diffs: {
      timed: timedChange,
      after_action: actionChange,
    },
  };
}

export function createBasicGameplayCatchSummary(
  input: CreateBasicGameplayCatchSummaryInput,
  options: AssessBasicGameplayOptions = {},
): RiddleProofBasicGameplayCatchSummary {
  const before = summarizeAssessment(assessBasicGameplayEvidence(input.before, options));
  const after = input.after === undefined ? undefined : summarizeAssessment(assessBasicGameplayEvidence(input.after, options));
  const fixed = Boolean(after && before.notable_codes.length > 0 && after.passed && after.notable_codes.length === 0);
  const title = input.title || [
    input.site || "Basic gameplay",
    input.route ? `${input.route} proof catch` : "proof catch",
  ].join(" ");
  const beforeCodes = before.notable_codes.length ? before.notable_codes.join(", ") : "no failing or warning codes";
  const afterCodes = after
    ? after.notable_codes.length ? after.notable_codes.join(", ") : "no failing or warning codes"
    : "not verified";
  const summaryLines = [
    `Before: ${before.checked_routes} checked, ${before.passing_routes} passing, codes: ${beforeCodes}.`,
    after ? `After: ${after.checked_routes} checked, ${after.passing_routes} passing, codes: ${afterCodes}.` : "After: not provided.",
  ];
  if (input.fix?.summary) summaryLines.push(`Fix: ${input.fix.summary}`);
  if (input.artifacts?.length) summaryLines.push(`Artifacts: ${input.artifacts.length} attached.`);

  return {
    version: RIDDLE_PROOF_BASIC_GAMEPLAY_CATCH_VERSION,
    title,
    site: input.site,
    route: input.route,
    detected_at: input.detected_at || new Date().toISOString(),
    before,
    after,
    fixed,
    fix: input.fix,
    artifacts: input.artifacts || [],
    summary_lines: summaryLines,
    marketing_summary: fixed
      ? `${title}: Riddle Proof caught ${beforeCodes}; after the fix, ${afterCodes}.`
      : `${title}: Riddle Proof caught ${beforeCodes}; after evidence is ${after ? "not yet clean" : "not yet attached"}.`,
  };
}

export function extractBasicGameplayEvidence(...sources: unknown[]): RiddleProofBasicGameplayEvidence | null {
  const seen = new Set<unknown>();
  for (const source of sources) {
    const found = findBasicGameplayEvidence(source, seen);
    if (found) return found;
  }
  return null;
}

function summarizeAssessment(assessment: RiddleProofBasicGameplayAssessment): BasicGameplayAssessmentSummary {
  return {
    evidence_present: assessment.evidence_present,
    passed: assessment.passed,
    checked_routes: assessment.checked_routes,
    passing_routes: assessment.passing_routes,
    failing_routes: assessment.failing_routes,
    failure_counts: assessment.failure_counts,
    warning_counts: assessment.warning_counts,
    notable_codes: [
      ...Object.keys(assessment.failure_counts),
      ...Object.keys(assessment.warning_counts),
    ].sort(),
  };
}

function findBasicGameplayEvidence(
  value: unknown,
  seen: Set<unknown>,
  depth = 0,
): RiddleProofBasicGameplayEvidence | null {
  if (depth > 6 || value === null || value === undefined) return null;

  if (typeof value === "string") {
    const parsed = parseJson(value);
    return parsed === null ? null : findBasicGameplayEvidence(parsed, seen, depth + 1);
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return null;
    seen.add(value);
    if (value.some((item) => hasRouteShape(recordValue(item)))) {
      return { results: value.filter((item): item is RiddleProofBasicGameplayRouteEvidence => hasRouteShape(recordValue(item))) };
    }
    for (const item of value) {
      const found = findBasicGameplayEvidence(item, seen, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const record = recordValue(value);
  if (!record || seen.has(record)) return null;
  seen.add(record);

  if (record.version === RIDDLE_PROOF_BASIC_GAMEPLAY_VERSION || Array.isArray(record.results)) {
    return {
      ...record,
      results: listValue(record.results).filter((item): item is RiddleProofBasicGameplayRouteEvidence => Boolean(recordValue(item))),
    } as RiddleProofBasicGameplayEvidence;
  }

  if (hasRouteShape(record)) {
    return { results: [record as RiddleProofBasicGameplayRouteEvidence] };
  }

  for (const key of BASIC_GAMEPLAY_CONTAINER_KEYS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      const nested = findBasicGameplayEvidence(record[key], seen, depth + 1);
      if (nested) return nested;
    }
  }

  for (const item of Object.values(record)) {
    const found = findBasicGameplayEvidence(item, seen, depth + 1);
    if (found) return found;
  }
  return null;
}

function hasRouteShape(record: Record<string, unknown> | null) {
  return Boolean(record && (
    record.initial ||
    record.after_action ||
    record.afterAction ||
    record.action_results ||
    record.actionResults
  ) && (record.path || record.name));
}

function changed(before: BasicGameplaySnapshot, after: BasicGameplaySnapshot): BasicGameplayChangeSummary {
  const bodyTextChanged = Boolean(before.body_text_hash && after.body_text_hash && before.body_text_hash !== after.body_text_hash);
  const screenshotChanged = Boolean(before.screenshot_hash && after.screenshot_hash && before.screenshot_hash !== after.screenshot_hash);
  const beforeCanvasHashes = canvasHashes(before.canvases);
  const afterCanvasHashes = canvasHashes(after.canvases);
  const canvasChanged = Boolean(beforeCanvasHashes && afterCanvasHashes && beforeCanvasHashes !== afterCanvasHashes);
  return {
    body_text_changed: bodyTextChanged,
    screenshot_changed: screenshotChanged,
    canvas_changed: canvasChanged,
    changed: bodyTextChanged || screenshotChanged || canvasChanged,
  };
}

function canvasHashes(canvases: BasicGameplayCanvasState[] | undefined) {
  return (canvases || []).map((canvas) => canvas.hash).filter(Boolean).join("|");
}

function countCodes(codes: string[]) {
  const counts: Record<string, number> = {};
  for (const code of codes) counts[code] = (counts[code] || 0) + 1;
  return counts;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const number = numericValue(value);
    if (number !== null) return number;
  }
  return null;
}

function numberValue(value: unknown) {
  return numericValue(value) ?? 0;
}

function numericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function listValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseJson(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed || !/^[{[]/.test(trimmed)) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
