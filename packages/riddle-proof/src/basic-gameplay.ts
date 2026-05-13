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
  | "primary_control_inert"
  | "progression_assertion_failed"
  | "responsive_setup_failed";

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
  visual_sample_hash?: string | null;
  viewport_screenshot_hash?: string | null;
  artifact_screenshot_hash?: string | null;
  artifact_screenshot?: BasicGameplayProofArtifact | null;
  dom_signature_hash?: string | null;
  body_text_hash?: string | null;
  body_text_length?: number;
  visible_large_node_count?: number;
  enabled_clickable_count?: number;
  reset_control_count?: number;
  visible_canvas_count?: number;
  canvases?: BasicGameplayCanvasState[];
  first_canvas_hash?: string | null;
  first_canvas_visual_sample_hash?: string | null;
  [key: string]: unknown;
}

export interface BasicGameplayActionResult {
  ok?: boolean;
  action?: string;
  [key: string]: unknown;
}

export const BASIC_GAMEPLAY_ACTION_TYPES = [
  "wait",
  "key",
  "key-down",
  "key-up",
  "hold-key",
  "repeat",
  "click",
  "click-by-text",
  "set-input-value",
  "canvas-click",
  "canvas-pointer-down",
  "canvas-pointer-move",
  "canvas-pointer-up",
  "wait-for-text",
  "window-call",
  "evaluate",
] as const;

export const BASIC_GAMEPLAY_PROGRESS_CHECK_TYPES = [
  "selector_count_increases",
  "selector_count_at_least",
  "selector_count_equals",
  "selector_count_equal",
  "selector_count_eq",
  "selector_absent",
  "selector_text_matches",
  "number_increases",
  "number_decreases",
  "number_at_least",
  "number_gte",
  "number_unchanged",
  "number_stays_equal",
  "number_equals",
  "canvas_hash_changes",
  "screenshot_hash_changes",
  "visual_hash_changes",
  "state_changes",
] as const;

export type BasicGameplayActionType = typeof BASIC_GAMEPLAY_ACTION_TYPES[number] | (string & {});
export type BasicGameplayProgressCheckType = typeof BASIC_GAMEPLAY_PROGRESS_CHECK_TYPES[number] | (string & {});

export interface BasicGameplayMetric {
  phase?: string;
  label?: string;
  selector?: string | null;
  state_path?: string | null;
  state_call?: string | null;
  property_path?: string | null;
  present?: boolean;
  text?: string | null;
  pattern_matched?: boolean | null;
  number?: number | null;
  count?: number | null;
  value_type?: string | null;
  error?: string | null;
  screenshot_hash?: string | null;
  visual_sample_hash?: string | null;
  viewport_screenshot_hash?: string | null;
  artifact_screenshot_hash?: string | null;
  artifact_screenshot?: BasicGameplayProofArtifact | null;
  dom_signature_hash?: string | null;
  body_text_hash?: string | null;
  first_canvas_hash?: string | null;
  first_canvas_visual_sample_hash?: string | null;
  visible_canvas_count?: number | null;
  [key: string]: unknown;
}

export interface BasicGameplayArtifactResolution {
  source: "riddle_screenshot_artifacts" | (string & {});
  before_hash?: string | null;
  after_hash?: string | null;
  [key: string]: unknown;
}

export interface BasicGameplayProgressionCheck {
  label?: string;
  type?: BasicGameplayProgressCheckType;
  selector?: string | null;
  state_path?: string | null;
  state_call?: string | null;
  property_path?: string | null;
  from_phase?: string;
  to_phase?: string;
  expected?: unknown;
  value?: unknown;
  min?: unknown;
  max?: unknown;
  pattern?: string;
  flags?: string;
  ok?: boolean;
  reason?: string | null;
  before?: BasicGameplayMetric | null;
  after?: BasicGameplayMetric | null;
  artifact_resolution?: BasicGameplayArtifactResolution;
  [key: string]: unknown;
}

export interface BasicGameplaySuiteFailure {
  code: "progression_assertion_failed" | "responsive_setup_failed";
  label?: string;
  reason?: string | null;
  selector?: string | null;
  state_path?: string | null;
  state_call?: string | null;
  property_path?: string | null;
  viewport?: {
    label?: string | null;
    width?: number | null;
    height?: number | null;
    phase?: string | null;
  };
  action_result?: BasicGameplayActionResult;
}

export interface BasicGameplayResponsiveViewportEvidence {
  label?: string;
  width?: number;
  height?: number;
  phase?: string;
  setup_action_results?: BasicGameplayActionResult[];
  setupActionResults?: BasicGameplayActionResult[];
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
  after_continue?: BasicGameplaySnapshot;
  afterContinue?: BasicGameplaySnapshot;
  after_cleanup?: BasicGameplaySnapshot;
  afterCleanup?: BasicGameplaySnapshot;
  mobile?: BasicGameplayMobileEvidence;
  action_results?: BasicGameplayActionResult[];
  actionResults?: BasicGameplayActionResult[];
  continued_action_results?: BasicGameplayActionResult[];
  continuedActionResults?: BasicGameplayActionResult[];
  continued_cleanup_action_results?: BasicGameplayActionResult[];
  continuedCleanupActionResults?: BasicGameplayActionResult[];
  restart_action_results?: BasicGameplayActionResult[];
  restartActionResults?: BasicGameplayActionResult[];
  responsive_viewports?: BasicGameplayResponsiveViewportEvidence[];
  responsiveViewports?: BasicGameplayResponsiveViewportEvidence[];
  progression_checks?: BasicGameplayProgressionCheck[];
  progressionChecks?: BasicGameplayProgressionCheck[];
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
  suite_failures?: BasicGameplaySuiteFailure[];
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
    after_continue?: BasicGameplayChangeSummary;
    after_cleanup?: BasicGameplayChangeSummary;
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
    suite_failures?: BasicGameplaySuiteFailure[];
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

export interface BasicGameplayRouteReference {
  name?: string;
  path?: string;
  [key: string]: unknown;
}

export interface AttachBasicGameplayArtifactOptions {
  routes?: BasicGameplayRouteReference[];
  artifacts?: BasicGameplayProofArtifact[];
}

export interface BasicGameplayCatchRecord {
  site?: string | null;
  route?: string;
  path?: string;
  code: string;
  label?: string;
  type?: string;
  selector?: string | null;
  state_path?: string | null;
  state_call?: string | null;
  property_path?: string | null;
  reason?: string | null;
  phase?: string;
  from_phase?: string;
  to_phase?: string;
  before?: BasicGameplayMetric | null;
  after?: BasicGameplayMetric | null;
  action_result?: BasicGameplayActionResult;
  console_errors?: unknown[];
  page_errors?: unknown[];
  summary: string;
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

const ARTIFACT_VISUAL_CHANGE_CHECKS = new Set<string>([
  "canvas_hash_changes",
  "screenshot_hash_changes",
  "state_changes",
  "visual_hash_changes",
]);

const PHASE_SCREENSHOT_SUFFIXES: Record<string, string> = {
  initial: "before",
  after_action: "after",
  after_continue: "after-continue",
  after_cleanup: "after-cleanup",
  after_restart: "after-restart",
  revisit: "revisit",
};

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

  const routeResults = (run.results || [])
    .map((route) => augmentRouteAssessmentWithProgressionChecks(
      assessBasicGameplayRoute(route, options),
      route,
    ));
  const failingRoutes = routeResults
    .filter((result) => !result.ok)
    .map((result) => ({
      name: result.name,
      path: result.path,
      failures: result.failures,
      warnings: result.warnings,
      suite_failures: result.suite_failures,
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
  const afterContinue = route.after_continue || route.afterContinue || {};
  const afterCleanup = route.after_cleanup || route.afterCleanup || {};
  const mobile = route.mobile || {};
  const timedChange = changed(initial, timed);
  const actionChange = changed(timed, afterAction);
  const continuedActionChange = changed(afterAction, afterContinue);
  const cleanupBase = route.after_continue || route.afterContinue ? afterContinue : afterAction;
  const cleanupActionChange = changed(cleanupBase, afterCleanup);
  const surfaceVisible = numberValue(initial.visible_canvas_count) > 0 ||
    numberValue(initial.enabled_clickable_count) > 0 ||
    numberValue(initial.visible_large_node_count) >= minSurfaceLargeNodes;
  const actionResults = listValue(route.action_results || route.actionResults) as BasicGameplayActionResult[];
  const continuedActionResults = listValue(route.continued_action_results || route.continuedActionResults) as BasicGameplayActionResult[];
  const continuedCleanupActionResults = listValue(route.continued_cleanup_action_results || route.continuedCleanupActionResults) as BasicGameplayActionResult[];
  const restartActionResults = listValue(route.restart_action_results || route.restartActionResults) as BasicGameplayActionResult[];
  const primaryActionResults = [...actionResults, ...continuedActionResults];
  const actionAttempted = primaryActionResults.some((result) => result.ok === true && result.action !== "wait");
  const actionFailed = [...primaryActionResults, ...continuedCleanupActionResults].some((result) => result.ok === false && result.action !== "wait");
  const restartActionAttempted = restartActionResults.some((result) => result.ok === true && result.action !== "wait");
  const stateChangeObserved = actionChange.changed || continuedActionChange.changed || cleanupActionChange.changed || timedChange.changed;
  const resetPathPresent = numberValue(initial.reset_control_count) > 0 ||
    numberValue(timed.reset_control_count) > 0 ||
    numberValue(afterAction.reset_control_count) > 0 ||
    numberValue(afterContinue.reset_control_count) > 0 ||
    numberValue(afterCleanup.reset_control_count) > 0 ||
    restartActionAttempted;
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
      first_interaction_observed: actionChange.changed || continuedActionChange.changed,
      state_change_observed: stateChangeObserved,
      mobile_overflow_absent: mobileOverflowPx <= maxMobileOverflowPx,
      reset_path_present: resetPathPresent,
      fatal_errors_absent: pageErrorCount === 0,
    },
    diffs: {
      timed: timedChange,
      after_action: actionChange,
      after_continue: continuedActionChange,
      after_cleanup: cleanupActionChange,
    },
  };
}

export function sanitizeBasicGameplayJsonString(value: unknown): string {
  const text = String(value ?? "");
  let output = "";
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        output += text[index] + text[index + 1];
        index += 1;
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue;
    output += text[index];
  }
  return output;
}

export function compactBasicGameplayText(value: unknown, max = 160): string {
  const compacted = sanitizeBasicGameplayJsonString(value).replace(/\s+/g, " ").trim();
  return Array.from(compacted).slice(0, max).join("");
}

export function assessBasicGameplayProgressionCheck(
  check: BasicGameplayProgressionCheck,
): BasicGameplayProgressionCheck {
  const before = metricValue(check.before);
  const after = metricValue(check.after);
  const type = String(check.type || "");
  const hasExplicitResult = typeof check.ok === "boolean";
  let ok = hasExplicitResult ? check.ok === true : true;
  let reason: string | null = check.reason ?? null;

  if (type === "selector_count_increases") {
    ok = numberValue(after?.count) > numberValue(before?.count);
    reason = ok ? null : "selector_count_did_not_increase";
  } else if (type === "selector_count_at_least") {
    if (numericValue(check.min) === null && hasExplicitResult) return resolveBasicGameplayProgressionCheckWithArtifactScreenshots({ ...check, ok, reason });
    ok = numberValue(after?.count) >= numberValue(check.min);
    reason = ok ? null : "selector_count_below_min";
  } else if (type === "selector_count_equals" || type === "selector_count_equal" || type === "selector_count_eq") {
    const expected = numericValue(check.expected ?? check.count ?? check.value);
    if (expected === null && hasExplicitResult) return resolveBasicGameplayProgressionCheckWithArtifactScreenshots({ ...check, ok, reason });
    ok = numericValue(after?.count) !== null &&
      expected !== null &&
      numberValue(after?.count) === expected;
    reason = ok ? null : "selector_count_did_not_equal_expected";
  } else if (type === "selector_absent") {
    ok = !after?.present || numberValue(after?.count) === 0;
    reason = ok ? null : "selector_still_present";
  } else if (type === "selector_text_matches") {
    if (!check.pattern && hasExplicitResult) return resolveBasicGameplayProgressionCheckWithArtifactScreenshots({ ...check, ok, reason });
    ok = after?.pattern_matched === true || textMatches(after?.text, check.pattern, check.flags);
    reason = ok ? null : "selector_text_did_not_match";
  } else if (type === "number_increases") {
    ok = numericValue(before?.number) !== null &&
      numericValue(after?.number) !== null &&
      numberValue(after?.number) > numberValue(before?.number);
    reason = ok ? null : "number_did_not_increase";
  } else if (type === "number_decreases") {
    ok = numericValue(before?.number) !== null &&
      numericValue(after?.number) !== null &&
      numberValue(after?.number) < numberValue(before?.number);
    reason = ok ? null : "number_did_not_decrease";
  } else if (type === "number_at_least" || type === "number_gte") {
    const min = numericValue(check.min ?? check.expected ?? check.value);
    if (min === null && hasExplicitResult) return resolveBasicGameplayProgressionCheckWithArtifactScreenshots({ ...check, ok, reason });
    ok = numericValue(after?.number) !== null &&
      min !== null &&
      numberValue(after?.number) >= min;
    reason = ok ? null : "number_below_minimum";
  } else if (type === "number_unchanged" || type === "number_stays_equal") {
    ok = numericValue(before?.number) !== null &&
      numericValue(after?.number) !== null &&
      numberValue(after?.number) === numberValue(before?.number);
    reason = ok ? null : "number_changed";
  } else if (type === "number_equals") {
    const expected = numericValue(check.expected ?? check.value);
    if (expected === null && hasExplicitResult) return resolveBasicGameplayProgressionCheckWithArtifactScreenshots({ ...check, ok, reason });
    ok = numericValue(after?.number) !== null &&
      expected !== null &&
      numberValue(after?.number) === expected;
    reason = ok ? null : "number_did_not_equal_expected";
  } else if (type === "canvas_hash_changes") {
    ok = hashChanged(before, after, ["first_canvas_hash", "first_canvas_visual_sample_hash", "visual_sample_hash"]);
    reason = ok ? null : "canvas_or_visual_sample_hash_did_not_change";
  } else if (type === "screenshot_hash_changes") {
    ok = hashChanged(before, after, ["screenshot_hash", "visual_sample_hash", "artifact_screenshot_hash"]);
    reason = ok ? null : "screenshot_hash_did_not_change";
  } else if (type === "visual_hash_changes") {
    ok = hashChanged(before, after, ["visual_sample_hash", "screenshot_hash", "artifact_screenshot_hash"]);
    reason = ok ? null : "visual_hash_did_not_change";
  } else if (type === "state_changes") {
    ok = hashChanged(before, after, [
      "dom_signature_hash",
      "body_text_hash",
      "screenshot_hash",
      "visual_sample_hash",
      "artifact_screenshot_hash",
      "first_canvas_hash",
      "first_canvas_visual_sample_hash",
    ]);
    reason = ok ? null : "state_hash_did_not_change";
  }

  const assessed = {
    ...check,
    ok,
    reason,
  };
  return resolveBasicGameplayProgressionCheckWithArtifactScreenshots(assessed);
}

export function assessBasicGameplayProgressionChecks(
  route: RiddleProofBasicGameplayRouteEvidence,
): BasicGameplayProgressionCheck[] {
  return progressionChecksForRoute(route).map((check) => assessBasicGameplayProgressionCheck(check));
}

export function augmentBasicGameplayAssessmentWithProgressionChecks(
  assessment: RiddleProofBasicGameplayAssessment,
  evidence: unknown,
): RiddleProofBasicGameplayAssessment {
  const run = extractBasicGameplayEvidence(evidence);
  if (!run?.results?.length) return assessment;
  const routeResults = assessment.route_results.map((result, index) =>
    augmentRouteAssessmentWithProgressionChecks(result, run.results?.[index] || {}),
  );
  const failingRoutes = routeResults
    .filter((result) => !result.ok)
    .map((result) => ({
      name: result.name,
      path: result.path,
      failures: result.failures,
      warnings: result.warnings,
      suite_failures: result.suite_failures,
    }));
  return {
    ...assessment,
    passed: failingRoutes.length === 0,
    passing_routes: routeResults.filter((result) => result.ok).length,
    failing_routes: failingRoutes,
    failure_counts: countCodes(routeResults.flatMap((result) => result.failures)),
    warning_counts: countCodes(routeResults.flatMap((result) => result.warnings)),
    route_results: routeResults,
  };
}

export function resolveBasicGameplayProgressionCheckWithArtifactScreenshots(
  check: BasicGameplayProgressionCheck,
): BasicGameplayProgressionCheck {
  if (check.ok !== false) return check;
  if (!ARTIFACT_VISUAL_CHANGE_CHECKS.has(String(check.type || ""))) return check;
  const beforeHash = stringValue(metricValue(check.before)?.artifact_screenshot_hash);
  const afterHash = stringValue(metricValue(check.after)?.artifact_screenshot_hash);
  if (!beforeHash || !afterHash || beforeHash === afterHash) return check;
  return {
    ...check,
    ok: true,
    reason: null,
    artifact_resolution: {
      source: "riddle_screenshot_artifacts",
      before_hash: beforeHash,
      after_hash: afterHash,
    },
  };
}

export function attachBasicGameplayArtifactScreenshotHashes(
  evidence: RiddleProofBasicGameplayEvidence,
  routesOrOptions: BasicGameplayRouteReference[] | AttachBasicGameplayArtifactOptions = {},
  maybeArtifacts: BasicGameplayProofArtifact[] = [],
): RiddleProofBasicGameplayEvidence {
  const routes = Array.isArray(routesOrOptions) ? routesOrOptions : routesOrOptions.routes || [];
  const artifacts = Array.isArray(routesOrOptions) ? maybeArtifacts : routesOrOptions.artifacts || [];
  if (!evidence?.results?.length || !artifacts.length) return evidence;
  const artifactsByName = screenshotArtifactIndex(artifacts);
  if (!artifactsByName.size) return evidence;

  for (const [index, routeEvidence] of evidence.results.entries()) {
    const routeContract = routes[index] || {};
    for (const phase of Object.keys(PHASE_SCREENSHOT_SUFFIXES)) {
      attachPhaseArtifactHash(routeEvidence, routeContract, phase, artifactsByName);
    }
    const checks = progressionChecksForRoute(routeEvidence);
    const resolvedChecks = checks.map((check) => {
      const fromPhase = check.from_phase || "initial";
      const toPhase = check.to_phase || "after_action";
      if (check.before) attachPhaseArtifactHash({ ...routeEvidence, [fromPhase]: check.before }, routeContract, fromPhase, artifactsByName);
      if (check.after) attachPhaseArtifactHash({ ...routeEvidence, [toPhase]: check.after }, routeContract, toPhase, artifactsByName);
      return resolveBasicGameplayProgressionCheckWithArtifactScreenshots(check);
    });
    if (routeEvidence.progression_checks) routeEvidence.progression_checks = resolvedChecks;
    else if (routeEvidence.progressionChecks) routeEvidence.progressionChecks = resolvedChecks;
    routeEvidence.progression_failure_count = resolvedChecks.filter((check) => check.ok === false).length;
  }

  return evidence;
}

export function createBasicGameplayCatchRecords(
  assessment: RiddleProofBasicGameplayAssessment,
  evidence: unknown,
): BasicGameplayCatchRecord[] {
  const run = extractBasicGameplayEvidence(evidence);
  if (!run?.results?.length) return [];
  const catches: BasicGameplayCatchRecord[] = [];
  for (const route of run.results) {
    if (numberValue(route.page_error_count) > 0) {
      catches.push({
        site: run.site || null,
        route: route.name,
        path: route.path,
        code: "fatal_page_error",
        label: "page runtime error",
        type: "page_error",
        selector: null,
        reason: stringValue(route.first_page_error) || "page_error",
        page_errors: listValue(route.page_errors),
        summary: `${route.name || route.path || "Route"}: page runtime error (${stringValue(route.first_page_error) || "page_error"})`,
      });
    }
    if (numberValue(route.console_error_count) > 0) {
      catches.push({
        site: run.site || null,
        route: route.name,
        path: route.path,
        code: "critical_console_error",
        label: "console error",
        type: "console_error",
        selector: null,
        reason: stringValue(route.first_console_error) || "console_error",
        console_errors: listValue(route.console_errors),
        summary: `${route.name || route.path || "Route"}: console error (${stringValue(route.first_console_error) || "console_error"})`,
      });
    }
    for (const [group, phase] of [
      ["action_results", "after_action"],
      ["continued_action_results", "after_continue"],
      ["continued_cleanup_action_results", "after_cleanup"],
      ["restart_action_results", "after_restart"],
    ] as const) {
      for (const actionResult of listValue(route[group]) as BasicGameplayActionResult[]) {
        if (!actionResult || actionResult.ok !== false) continue;
        const action = stringValue(actionResult.action) || group;
        const reason = stringValue(actionResult.reason) || "action_failed";
        catches.push({
          site: run.site || null,
          route: route.name,
          path: route.path,
          code: "action_failed",
          label: action,
          type: action,
          selector: stringValue(actionResult.selector),
          reason,
          phase,
          action_result: actionResult,
          summary: `${route.name || route.path || "Route"}: ${action} failed (${reason})`,
        });
      }
    }
    for (const failure of responsiveSetupFailures(route)) {
      catches.push({
        site: run.site || null,
        route: route.name,
        path: route.path,
        code: failure.code,
        label: failure.label,
        type: failure.action_result?.action || "responsive_setup",
        selector: stringValue(failure.action_result?.selector),
        reason: failure.reason || "responsive_setup_failed",
        phase: failure.viewport?.phase || undefined,
        viewport: failure.viewport,
        action_result: failure.action_result,
        summary: `${route.name || route.path || "Route"}: responsive setup failed on ${failure.viewport?.label || "viewport"} (${failure.reason || "responsive_setup_failed"})`,
      });
    }
    for (const check of assessBasicGameplayProgressionChecks(route).filter((item) => item.ok === false)) {
      catches.push({
        site: run.site || null,
        route: route.name,
        path: route.path,
        code: "progression_assertion_failed",
        label: check.label,
        type: String(check.type || ""),
        selector: check.selector || null,
        state_path: check.state_path || null,
        state_call: check.state_call || null,
        property_path: check.property_path || null,
        reason: check.reason || "progression_assertion_failed",
        from_phase: check.from_phase,
        to_phase: check.to_phase,
        before: compactCatchMetric(check.before),
        after: compactCatchMetric(check.after),
        summary: `${route.name || route.path || "Route"}: ${check.label || check.type || "progression check"} failed (${check.reason || "progression_assertion_failed"})`,
      });
    }
  }
  if (!catches.length && assessment.failing_routes.length) {
    for (const route of assessment.failing_routes) {
      for (const code of route.failures || []) {
        catches.push({
          site: run.site || null,
          route: route.name,
          path: route.path,
          code,
          label: code,
          type: code,
          reason: code,
          summary: `${route.name || route.path || "Route"}: ${code}`,
        });
      }
    }
  }
  return catches;
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
    record.after_cleanup ||
    record.afterCleanup ||
    record.action_results ||
    record.actionResults ||
    record.continued_cleanup_action_results ||
    record.continuedCleanupActionResults ||
    record.responsive_viewports ||
    record.responsiveViewports
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

function augmentRouteAssessmentWithProgressionChecks(
  result: RiddleProofBasicGameplayRouteAssessment,
  route: RiddleProofBasicGameplayRouteEvidence,
): RiddleProofBasicGameplayRouteAssessment {
  const progressionFailures = assessBasicGameplayProgressionChecks(route).filter((check) => check.ok === false);
  const responsiveFailures = responsiveSetupFailures(route);
  if (!progressionFailures.length && !responsiveFailures.length) return result;
  const failures = new Set(result.failures);
  if (progressionFailures.length) failures.add("progression_assertion_failed");
  for (const failure of responsiveFailures) failures.add(failure.code);
  return {
    ...result,
    ok: false,
    failures: [...failures],
    suite_failures: [
      ...(result.suite_failures || []),
      ...progressionFailures.map((check) => ({
        code: "progression_assertion_failed" as const,
        label: check.label,
        reason: check.reason,
        selector: check.selector || null,
        state_path: check.state_path || null,
        state_call: check.state_call || null,
        property_path: check.property_path || null,
      })),
      ...responsiveFailures,
    ],
  };
}

function responsiveSetupFailures(route: RiddleProofBasicGameplayRouteEvidence): BasicGameplaySuiteFailure[] {
  const failures: BasicGameplaySuiteFailure[] = [];
  for (const viewport of responsiveViewportsForRoute(route)) {
    for (const actionResult of listValue(viewport.setup_action_results || viewport.setupActionResults) as BasicGameplayActionResult[]) {
      if (!actionResult || actionResult.ok !== false) continue;
      failures.push({
        code: "responsive_setup_failed",
        label: `${viewport.label || "responsive"} ${actionResult.action || "setup action"}`,
        reason: stringValue(actionResult.reason) || "responsive_setup_failed",
        selector: stringValue(actionResult.selector),
        viewport: {
          label: viewport.label || null,
          width: numberValue(viewport.width) || null,
          height: numberValue(viewport.height) || null,
          phase: viewport.phase || null,
        },
        action_result: actionResult,
      });
    }
  }
  return failures;
}

function responsiveViewportsForRoute(route: RiddleProofBasicGameplayRouteEvidence): BasicGameplayResponsiveViewportEvidence[] {
  return listValue(route.responsive_viewports || route.responsiveViewports)
    .filter((item): item is BasicGameplayResponsiveViewportEvidence => Boolean(recordValue(item)));
}

function progressionChecksForRoute(route: RiddleProofBasicGameplayRouteEvidence): BasicGameplayProgressionCheck[] {
  return listValue(route.progression_checks || route.progressionChecks)
    .filter((item): item is BasicGameplayProgressionCheck => Boolean(recordValue(item)));
}

function metricValue(value: unknown): BasicGameplayMetric | null {
  return recordValue(value) as BasicGameplayMetric | null;
}

function textMatches(text: unknown, pattern: unknown, flags: unknown) {
  if (!pattern) return Boolean(text);
  try {
    return new RegExp(String(pattern), typeof flags === "string" ? flags : "i").test(String(text ?? ""));
  } catch {
    return false;
  }
}

function hashChanged(before: BasicGameplayMetric | null, after: BasicGameplayMetric | null, keys: string[]) {
  if (!before || !after) return false;
  return keys.some((key) => {
    const beforeValue = stringValue(before[key]);
    const afterValue = stringValue(after[key]);
    return Boolean(beforeValue && afterValue && beforeValue !== afterValue);
  });
}

function screenshotArtifactIndex(artifacts: BasicGameplayProofArtifact[]) {
  const index = new Map<string, BasicGameplayProofArtifact>();
  for (const artifact of artifacts || []) {
    const hash = stringValue(artifact.sha256 || artifact.hash);
    if (!hash) continue;
    if (String(artifact.kind || "").toLowerCase() !== "screenshot" && !/\.png($|\?)/i.test(`${artifact.name || ""} ${artifact.path || ""} ${artifact.url || ""}`)) continue;
    const filename = artifactBasename(artifact.path || artifact.name || artifact.url);
    if (!filename) continue;
    index.set(filename.toLowerCase(), {
      ...artifact,
      sha256: hash,
    });
  }
  return index;
}

function attachPhaseArtifactHash(
  routeEvidence: RiddleProofBasicGameplayRouteEvidence,
  routeContract: BasicGameplayRouteReference,
  phase: string,
  artifactsByName: Map<string, BasicGameplayProofArtifact>,
) {
  const suffix = PHASE_SCREENSHOT_SUFFIXES[phase];
  if (!suffix) return null;
  const metric = metricValue(routeEvidence[phase]);
  if (!metric) return null;
  const filename = `${routeArtifactSlug(routeEvidence, routeContract)}-${suffix}.png`.toLowerCase();
  const artifact = artifactsByName.get(filename);
  if (!artifact?.sha256) return null;
  metric.artifact_screenshot_hash = artifact.sha256;
  metric.artifact_screenshot = {
    name: artifact.name || artifactBasename(artifact.path || filename),
    path: artifact.path,
    url: artifact.url,
    kind: artifact.kind,
    sha256: artifact.sha256,
  };
  return artifact.sha256;
}

function routeArtifactSlug(
  routeEvidence: RiddleProofBasicGameplayRouteEvidence,
  routeContract: BasicGameplayRouteReference,
) {
  return slug(routeContract.name || routeEvidence.name || routeContract.path || routeEvidence.path || "route");
}

function artifactBasename(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.pathname.split("/").filter(Boolean).pop() || "";
  } catch {
    return raw.split(/[\\/]/).filter(Boolean).pop() || raw;
  }
}

function compactCatchMetric(metric: unknown): BasicGameplayMetric | null {
  const value = metricValue(metric);
  if (!value) return null;
  return {
    phase: value.phase,
    text: value.text,
    number: value.number,
    count: value.count,
    present: value.present,
    state_path: value.state_path,
    state_call: value.state_call,
    property_path: value.property_path,
    screenshot_hash: value.screenshot_hash,
    visual_sample_hash: value.visual_sample_hash,
    viewport_screenshot_hash: value.viewport_screenshot_hash,
    artifact_screenshot_hash: value.artifact_screenshot_hash,
    dom_signature_hash: value.dom_signature_hash,
    body_text_hash: value.body_text_hash,
    first_canvas_hash: value.first_canvas_hash,
    first_canvas_visual_sample_hash: value.first_canvas_visual_sample_hash,
    visible_canvas_count: value.visible_canvas_count,
  };
}

function slug(value: unknown) {
  return String(value || "artifact")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "artifact";
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

function stringValue(value: unknown) {
  return typeof value === "string" && value.length ? value : null;
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
