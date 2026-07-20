import type { JsonValue } from "./json";


export const RIDDLE_PROOF_PROFILE_VERSION = "riddle-proof.profile.v1" as const;
export const RIDDLE_PROOF_PROFILE_EVIDENCE_VERSION = "riddle-proof.profile-evidence.v1" as const;
export const RIDDLE_PROOF_PROFILE_RESULT_VERSION = "riddle-proof.profile-result.v1" as const;

export const RIDDLE_PROOF_PROFILE_STATUSES = [
  "passed",
  "product_regression",
  "proof_insufficient",
  "environment_blocked",
  "configuration_error",
  "needs_human_review",
] as const;

export const RIDDLE_PROOF_PROFILE_CHECK_TYPES = [
  "route_loaded",
  "url_search_param_equals",
  "url_search_param_absent",
  "selector_visible",
  "selector_absent",
  "selector_count_at_least",
  "selector_count_equals",
  "selector_count_equal",
  "selector_count_eq",
  "dialog_count_equals",
  "dialog_accept_count_equals",
  "dialog_dismiss_count_equals",
  "selector_text_visible",
  "selector_text_absent",
  "selector_text_order",
  "ordered_trace",
  "observe_within",
  "frame_text_visible",
  "frame_url_equals",
  "frame_url_matches",
  "frame_no_horizontal_overflow",
  "text_visible",
  "text_absent",
  "http_status",
  "link_status",
  "artifact_link_status",
  "route_inventory",
  "no_horizontal_overflow",
  "no_mobile_horizontal_overflow",
  "no_fatal_console_errors",
  "no_console_warnings",
] as const;

export const RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES = [
  "click",
  "tap",
  "tap_until",
  "drag",
  "press",
  "key_down",
  "key_up",
  "fill",
  "set_input_value",
  "set_range_value",
  "deterministic_runtime",
  "canvas_signature",
  "assert_text_visible",
  "assert_text_absent",
  "assert_selector_count",
  "assert_window_value",
  "assert_window_number",
  "local_storage",
  "session_storage",
  "clear_storage",
  "clear_console",
  "dialog_response",
  "screenshot",
  "wait",
  "wait_for_selector",
  "wait_for_text",
  "window_eval",
  "window_call",
  "window_call_until",
] as const;

export type RiddleProofProfileStatus = typeof RIDDLE_PROOF_PROFILE_STATUSES[number];
export type RiddleProofProfileCheckType = typeof RIDDLE_PROOF_PROFILE_CHECK_TYPES[number];
export type RiddleProofProfileSetupActionType = typeof RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES[number];
export const RIDDLE_PROOF_PROFILE_NETWORK_ABORT_ERROR_CODES = [
  "aborted",
  "accessdenied",
  "addressunreachable",
  "blockedbyclient",
  "blockedbyresponse",
  "connectionaborted",
  "connectionclosed",
  "connectionfailed",
  "connectionrefused",
  "connectionreset",
  "internetdisconnected",
  "namenotresolved",
  "timedout",
  "failed",
] as const;
export type RiddleProofProfileNetworkAbortErrorCode = typeof RIDDLE_PROOF_PROFILE_NETWORK_ABORT_ERROR_CODES[number];
export type RiddleProofProfileRunner =
  | "riddle"
  | "local-playwright"
  | "browserless"
  | "github-actions"
  | (string & {});
export type RiddleProofProfileFailureAction = "fail" | "neutral" | "review";
export type RiddleProofProfileBaselinePolicy =
  | "invariant_only"
  | "production_comparison"
  | "last_accepted_artifact"
  | "golden_reference_artifact"
  | (string & {});

export interface RiddleProofArtifactBodyAssertionInput {
  artifact_text: string;
  candidates: string[];
  required?: string[];
}

export interface RiddleProofArtifactBodyAssertionResult {
  version: "riddle-proof.artifact-body-assertions.v1";
  ok: boolean;
  body_contains: string[];
  present_candidates: string[];
  missing_candidates: string[];
  missing_required: string[];
  warnings: string[];
}

export interface RiddleProofProfileHttpStatusPreflightFetchResponse {
  status?: number;
  statusText?: string;
  headers?: {
    get?: (name: string) => string | null;
  };
  arrayBuffer?: () => Promise<ArrayBuffer>;
  text?: () => Promise<string>;
}

export type RiddleProofProfileHttpStatusPreflightFetch = (
  url: string,
  init?: Record<string, unknown>,
) => Promise<RiddleProofProfileHttpStatusPreflightFetchResponse>;

export type RiddleProofProfileJsonValueType =
  | "array"
  | "boolean"
  | "null"
  | "number"
  | "object"
  | "string";

export const RIDDLE_PROOF_ORDERED_TRACE_OPERATORS = [
  "exists",
  "equals",
  "not_equals",
  "truthy",
  "falsy",
  "gt",
  "gte",
  "lt",
  "lte",
  "abs_gt",
  "abs_gte",
  "abs_lt",
  "abs_lte",
] as const;

export type RiddleProofOrderedTraceOperator = typeof RIDDLE_PROOF_ORDERED_TRACE_OPERATORS[number];

export interface RiddleProofOrderedTracePredicate {
  path: string;
  op: RiddleProofOrderedTraceOperator;
  value?: JsonValue;
}

export interface RiddleProofOrderedTraceEvent {
  label: string;
  predicates: RiddleProofOrderedTracePredicate[];
}

export interface RiddleProofOrderedTraceWitness {
  label: string;
  index: number;
  observations: Array<{
    path: string;
    op: RiddleProofOrderedTraceOperator;
    expected?: JsonValue;
    observed: JsonValue;
  }>;
}

export interface RiddleProofOrderedTraceAssessment {
  version: "riddle-proof.ordered-trace-assessment.v1";
  status: "passed" | "failed" | "proof_insufficient";
  trace_length: number;
  witnesses: RiddleProofOrderedTraceWitness[];
  missing_event?: string;
  missing_paths?: string[];
  reason?: string;
}

export interface RiddleProofProfileHttpStatusBodyJsonAssertion {
  label?: string;
  path: string;
  exists?: boolean;
  equals?: JsonValue;
  not_equals?: JsonValue;
  contains?: JsonValue;
  type?: RiddleProofProfileJsonValueType;
}

export interface RiddleProofProfileHttpStatusBodyJsonAssertionResult {
  label: string;
  path: string;
  ok: boolean;
  exists: boolean;
  observed?: JsonValue;
  observed_sample?: JsonValue;
  observed_length?: number;
  observed_key_count?: number;
  observed_omitted_count?: number;
  observed_type: RiddleProofProfileJsonValueType | "missing";
  expected_exists?: boolean;
  equals?: JsonValue;
  not_equals?: JsonValue;
  contains?: JsonValue;
  type?: RiddleProofProfileJsonValueType;
  errors?: string[];
}

export interface RiddleProofProfileHttpStatusPreflightOptions {
  fetchImpl?: RiddleProofProfileHttpStatusPreflightFetch;
  target_url?: string;
}

export interface RiddleProofProfileHttpStatusPreflightCheckResult {
  index: number;
  label: string;
  url: string;
  method: string;
  ok: boolean;
  status: number | null;
  status_text: string;
  error: string | null;
  content_type: string | null;
  content_length: number | null;
  bytes: number | null;
  body_contains: Record<string, boolean> | null;
  body_contains_missing: string[];
  body_not_contains: Record<string, boolean> | null;
  body_not_contains_found: string[];
  body_not_patterns: Record<string, boolean> | null;
  body_not_patterns_found: string[];
  body_json_assertions: RiddleProofProfileHttpStatusBodyJsonAssertionResult[] | null;
  body_json_assertions_failed: RiddleProofProfileHttpStatusBodyJsonAssertionResult[];
}

export interface RiddleProofProfileHttpStatusPreflightResult {
  version: "riddle-proof.profile-http-status-preflight.v1";
  ok: boolean;
  profile_name: string;
  target_url: string;
  checked: number;
  failed: number;
  checks: RiddleProofProfileHttpStatusPreflightCheckResult[];
  summary: string;
}

function uniqueNonEmptyStrings(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values ?? []) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function deriveRiddleProofArtifactBodyAssertions(input: RiddleProofArtifactBodyAssertionInput): RiddleProofArtifactBodyAssertionResult {
  const artifactText = typeof input.artifact_text === "string" ? input.artifact_text : "";
  const candidates = uniqueNonEmptyStrings(input.candidates);
  const required = uniqueNonEmptyStrings(input.required);
  const mergedCandidates = uniqueNonEmptyStrings([...required, ...candidates]);
  const presentCandidates = mergedCandidates.filter((snippet) => artifactText.includes(snippet));
  const missingCandidates = mergedCandidates.filter((snippet) => !artifactText.includes(snippet));
  const missingRequired = required.filter((snippet) => !artifactText.includes(snippet));
  const warnings = missingCandidates.map((snippet) => `candidate snippet is not present in artifact body: ${snippet}`);

  return {
    version: "riddle-proof.artifact-body-assertions.v1",
    ok: missingRequired.length === 0,
    body_contains: presentCandidates,
    present_candidates: presentCandidates,
    missing_candidates: missingCandidates,
    missing_required: missingRequired,
    warnings,
  };
}

export interface RiddleProofProfileViewport {
  name: string;
  width: number;
  height: number;
  hasTouch?: boolean;
  isMobile?: boolean;
}

export interface RiddleProofProfileSetupAction {
  type: RiddleProofProfileSetupActionType;
  selector?: string;
  frame_selector?: string;
  frame_index?: number;
  full_page?: boolean;
  force?: boolean;
  fallback_to_tap?: boolean;
  click_count?: number;
  coordinate_mode?: "pixels" | "ratio";
  pointer_type?: "mouse" | "touch" | "pen";
  from_x?: number;
  from_y?: number;
  to_x?: number;
  to_y?: number;
  duration_ms?: number;
  steps?: number;
  key?: string;
  hold_ms?: number;
  value?: string;
  value_json?: JsonValue;
  random_queue?: number[];
  now?: number;
  advance_ms?: number;
  append?: boolean;
  restore?: boolean;
  label?: string;
  script?: string;
  path?: string;
  args?: JsonValue[];
  expect_return?: JsonValue;
  store_return_to?: string;
  capture_return?: boolean;
  return_summary_fields?: RiddleProofProfileReturnSummaryField[];
  compare_to?: string;
  expect_changed?: boolean;
  until_path?: string;
  until_expected_value?: JsonValue;
  expected_path?: string;
  expected_url?: string;
  max_calls?: number;
  tap_burst_size?: number;
  settle_ms?: number;
  interval_ms?: number;
  expected_value?: JsonValue;
  min_value?: number;
  max_value?: number;
  text?: string;
  pattern?: string;
  flags?: string;
  accept?: boolean;
  prompt_text?: string;
  message_text?: string;
  message_pattern?: string;
  index?: number;
  expected_count?: number;
  ms?: number;
  timeout_ms?: number;
  after_ms?: number;
  repeat?: number;
  reload?: boolean;
  storage?: "local" | "session" | "both";
  viewports?: string[];
  optional?: boolean;
  continue_on_failure?: boolean;
}

export interface RiddleProofProfileReturnSummaryField {
  path: string;
  label?: string;
}

export interface RiddleProofProfileNetworkMockResponse {
  label?: string;
  status: number;
  content_type?: string;
  headers?: Record<string, string>;
  body?: string;
  body_json?: JsonValue;
  delay_ms?: number;
  abort?: boolean;
  abort_error_code?: RiddleProofProfileNetworkAbortErrorCode;
  capture_request_body?: boolean;
  request_body_contains?: string[];
  request_body_patterns?: string[];
  request_body_not_contains?: string[];
  request_body_not_patterns?: string[];
}

export interface RiddleProofProfileNetworkMock extends RiddleProofProfileNetworkMockResponse {
  label: string;
  url: string;
  method?: string;
  responses?: RiddleProofProfileNetworkMockResponse[];
  repeat_responses?: boolean;
  sequence_scope?: "global" | "viewport";
  required_hit_count?: number;
  max_hit_count?: number;
  forbidden?: boolean;
  required?: boolean;
  capture_request_body?: boolean;
  request_body_contains?: string[];
  request_body_patterns?: string[];
  request_body_not_contains?: string[];
  request_body_not_patterns?: string[];
}

export interface RiddleProofProfileRouteInventoryRoute {
  name?: string;
  path: string;
}

export interface RiddleProofProfileTarget {
  url?: string;
  route?: string;
  viewports: RiddleProofProfileViewport[];
  auth?: "none" | (string & {});
  timeout_sec?: number;
  wait_for_selector?: string;
  wait_ms?: number;
  screenshot_full_page?: boolean;
  setup_actions?: RiddleProofProfileSetupAction[];
  network_mocks?: RiddleProofProfileNetworkMock[];
}

export interface RiddleProofProfileCheck {
  type: RiddleProofProfileCheckType;
  label?: string;
  expected_path?: string;
  param?: string;
  expected_value?: string;
  expected_url?: string;
  expected_routes?: RiddleProofProfileRouteInventoryRoute[];
  selector?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  body_json?: JsonValue;
  body_contains?: string[];
  body_not_contains?: string[];
  body_not_patterns?: string[];
  body_json_assertions?: RiddleProofProfileHttpStatusBodyJsonAssertion[];
  expected_texts?: string[];
  setup_action_label?: string;
  trace_path?: string;
  events?: RiddleProofOrderedTraceEvent[];
  link_selector?: string;
  source_selector?: string;
  route_path_prefix?: string;
  route_ready_selector?: string;
  route_ready_text?: string;
  route_ready_pattern?: string;
  route_ready_flags?: string;
  text?: string;
  pattern?: string;
  flags?: string;
  viewports?: string[];
  allowed_console_texts?: string[];
  allowed_console_patterns?: string[];
  allowed_page_error_texts?: string[];
  allowed_page_error_patterns?: string[];
  min_count?: number;
  expected_count?: number;
  expected_status?: number;
  allowed_statuses?: number[];
  max_links?: number;
  same_origin_only?: boolean;
  dedupe?: boolean;
  require_nonzero_bytes?: boolean;
  min_bytes?: number;
  allowed_content_types?: string[];
  allow_get_fallback?: boolean;
  max_overflow_px?: number;
  timeout_ms?: number;
  run_direct_routes?: boolean;
  run_clickthroughs?: boolean;
  run_all_viewports?: boolean;
  require_unique_routes?: boolean;
  allow_unexpected_routes?: boolean;
  save_route_screenshots?: boolean;
}

export interface RiddleProofProfile {
  version: typeof RIDDLE_PROOF_PROFILE_VERSION;
  name: string;
  target: RiddleProofProfileTarget;
  checks: RiddleProofProfileCheck[];
  artifacts: string[];
  baseline_policy: RiddleProofProfileBaselinePolicy;
  failure_policy: Partial<Record<RiddleProofProfileStatus, RiddleProofProfileFailureAction>>;
  metadata?: Record<string, JsonValue>;
}

export interface RiddleProofProfileRouteEvidence {
  requested: string;
  observed: string;
  expected_path?: string;
  matched: boolean;
  http_status?: number | null;
  error?: string;
}

export interface RiddleProofProfileBoundsOffender {
  selector?: string | null;
  tag?: string | null;
  text?: string | null;
  overflow?: number;
  overflow_px?: number;
  left_overflow_px?: number;
  right_overflow_px?: number;
  bounds_overflow_px?: number;
  clipped?: Record<string, unknown>;
  rect?: Record<string, unknown>;
  bounds?: Record<string, unknown>;
  viewport_width?: number;
  viewportWidth?: number;
  [key: string]: unknown;
}

export interface RiddleProofProfileViewportEvidence {
  name: string;
  width: number;
  height: number;
  url?: string;
  route: RiddleProofProfileRouteEvidence;
  title?: string;
  body_text_length?: number;
  body_text_sample?: string;
  scroll_width?: number;
  client_width?: number;
  overflow_px?: number;
  bounds_overflow_px?: number;
  overflow_offenders?: RiddleProofProfileBoundsOffender[];
  selectors?: Record<string, { count: number; visible_count: number }>;
  frames?: Record<string, Record<string, JsonValue>>;
  text_sequences?: Record<string, Record<string, JsonValue>>;
  text_matches?: Record<string, boolean>;
  text_match_samples?: Record<string, string[]>;
  text_case_insensitive_samples?: Record<string, string[]>;
  observations?: Record<string, Record<string, JsonValue>>;
  http_statuses?: Record<string, Record<string, JsonValue>>;
  link_statuses?: Record<string, Record<string, JsonValue>>;
  route_inventory?: Record<string, JsonValue>;
  setup_action_results?: Array<Record<string, JsonValue>>;
  screenshot_label?: string;
  screenshot_full_page?: boolean | null;
  navigation_error?: string;
  wait_error?: string;
}

export interface RiddleProofProfileEvidence {
  version: typeof RIDDLE_PROOF_PROFILE_EVIDENCE_VERSION;
  profile_name: string;
  target_url: string;
  baseline_policy: RiddleProofProfileBaselinePolicy;
  captured_at: string;
  viewports: RiddleProofProfileViewportEvidence[];
  console: {
    events: Array<{ type: string; text: string; location?: JsonValue }>;
    fatal_count: number;
  };
  page_errors: Array<{ message: string }>;
  network_mocks?: Array<Record<string, JsonValue>>;
  dom_summary?: Record<string, JsonValue>;
}

export interface RiddleProofProfileCheckResult {
  type: RiddleProofProfileCheckType | (string & {});
  label?: string;
  status: "passed" | "failed" | "skipped" | "proof_insufficient" | "needs_human_review";
  evidence: Record<string, JsonValue>;
  message?: string;
}

export interface RiddleProofProfileResult {
  version: typeof RIDDLE_PROOF_PROFILE_RESULT_VERSION;
  profile_name: string;
  runner: RiddleProofProfileRunner;
  status: RiddleProofProfileStatus;
  baseline_policy: RiddleProofProfileBaselinePolicy;
  route: RiddleProofProfileRouteEvidence;
  artifacts: {
    screenshots: string[];
    canonical_screenshots?: string[];
    setup_screenshots?: string[];
    console?: string;
    proof_json?: string;
    dom_summary?: string;
    riddle_artifacts?: RiddleProofProfileArtifactRef[];
  };
  checks: RiddleProofProfileCheckResult[];
  summary: string;
  captured_at: string;
  metadata?: Record<string, JsonValue>;
  warnings?: string[];
  evidence?: RiddleProofProfileEvidence;
  riddle?: {
    mode?: "split-viewports" | (string & {});
    job_id?: string;
    job_count?: number;
    status?: string | null;
    phase?: string | null;
    terminal?: boolean;
    created_at?: string | null;
    submitted_at?: string | null;
    completed_at?: string | null;
    queue_elapsed_ms?: number | null;
    pre_submission_elapsed_ms?: number;
    elapsed_ms?: number;
    attempt?: number;
    attempts?: number;
    timed_out?: boolean;
    retry_count?: number;
    stale_job_ids?: string[];
    artifact_recovery?: boolean;
    execution?: Record<string, JsonValue>;
    split_jobs?: Array<{
      viewport: string;
      job_id?: string;
      status?: string | null;
      phase?: string | null;
      terminal?: boolean;
      queue_elapsed_ms?: number | null;
      pre_submission_elapsed_ms?: number;
      elapsed_ms?: number;
      attempt?: number;
      attempts?: number;
      timed_out?: boolean;
      retry_count?: number;
      stale_job_ids?: string[];
      artifact_recovery?: boolean;
      execution?: Record<string, JsonValue>;
    }>;
  };
  environment_blocker?: Record<string, JsonValue>;
  configuration_blocker?: Record<string, JsonValue>;
  error?: string;
}

export interface RiddleProofProfileArtifactRef {
  name: string;
  url?: string;
  path?: string;
  kind?: string;
  content_type?: string;
  source?: string;
  role?: "canonical_screenshot" | "setup_screenshot" | "data" | "diagnostic" | "artifact";
}

export interface NormalizeRiddleProofProfileOptions {
  url?: string;
  route?: string;
  viewports?: RiddleProofProfileViewport[];
}

const DEFAULT_VIEWPORTS: RiddleProofProfileViewport[] = [
  { name: "desktop", width: 1280, height: 800 },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function stringFromOwn(input: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    if (hasOwn(input, key)) {
      const value = input[key];
      if (value !== undefined && value !== null) return String(value);
    }
  }
  return undefined;
}

function valueFromOwn(input: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (hasOwn(input, key)) return input[key];
  }
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function horizontalBoundsOverflowPx(value: unknown): number {
  if (!isRecord(value)) return 0;
  let max = maxPositiveNumber(
    value.overflow_px,
    value.overflow,
    value.bounds_overflow_px,
    value.horizontal_overflow_px,
    value.left_overflow_px,
    value.right_overflow_px,
  );
  for (const offender of boundsOffendersForEvidence(value)) {
    max = Math.max(max, horizontalOffenderOverflowPx(offender));
  }
  return roundPixels(max);
}

function horizontalOffenderOverflowPx(value: unknown): number {
  if (!isRecord(value)) return 0;
  let max = maxPositiveNumber(
    value.overflow,
    value.overflow_px,
    value.bounds_overflow_px,
    value.horizontal_overflow_px,
    value.left_overflow_px,
    value.right_overflow_px,
    value.leftOverflowPx,
    value.rightOverflowPx,
  );
  const clipped = isRecord(value.clipped || value.clip || value.clipping) ? value.clipped || value.clip || value.clipping : undefined;
  if (isRecord(clipped)) {
    max = Math.max(max, maxPositiveNumber(
      clipped.left,
      clipped.right,
      clipped.left_px,
      clipped.right_px,
      clipped.leftPx,
      clipped.rightPx,
    ));
  }
  const rect = isRecord(value.rect || value.bounds || value.bounding_rect || value.boundingRect)
    ? value.rect || value.bounds || value.bounding_rect || value.boundingRect
    : undefined;
  const viewportWidth = numberValue(value.viewport_width ?? value.viewportWidth);
  if (isRecord(rect) && viewportWidth !== undefined) {
    const left = numberValue(rect.left);
    const right = numberValue(rect.right);
    if (left !== undefined && left < 0) max = Math.max(max, Math.abs(left));
    if (right !== undefined && right > viewportWidth) max = Math.max(max, right - viewportWidth);
  }
  return roundPixels(max);
}

function boundsOffendersForEvidence(value: unknown): RiddleProofProfileBoundsOffender[] {
  if (!isRecord(value)) return [];
  const offenders = [
    ...(Array.isArray(value.overflow_offenders) ? value.overflow_offenders : []),
    ...(Array.isArray(value.overflowOffenders) ? value.overflowOffenders : []),
    ...(Array.isArray(value.bounds_offenders) ? value.bounds_offenders : []),
    ...(Array.isArray(value.boundsOffenders) ? value.boundsOffenders : []),
    ...(Array.isArray(value.clipped_elements) ? value.clipped_elements : []),
    ...(Array.isArray(value.clippedElements) ? value.clippedElements : []),
    ...(Array.isArray(value.clipping_offenders) ? value.clipping_offenders : []),
    ...(Array.isArray(value.clippingOffenders) ? value.clippingOffenders : []),
  ];
  return offenders
    .filter((item): item is RiddleProofProfileBoundsOffender => isRecord(item))
    .sort((a, b) => horizontalOffenderOverflowPx(b) - horizontalOffenderOverflowPx(a));
}

function maxPositiveNumber(...values: unknown[]): number {
  let max = 0;
  for (const value of values) {
    const number = numberValue(value);
    if (number !== undefined && number > max) max = number;
  }
  return max;
}

function roundPixels(value: number): number {
  return Math.round(value * 100) / 100;
}

function timeoutSecValue(value: unknown): number | undefined {
  const number = numberValue(value);
  return number && number > 0 ? Math.ceil(number) : undefined;
}

function jsonRecord(value: unknown): Record<string, JsonValue> | undefined {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toJsonValue(child)]));
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value)
    .map(([key, child]) => [key, String(child)] as const)
    .filter(([key]) => key.trim());
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toJsonValue(child)]));
  return String(value);
}

function parseJsonPathSegments(path: string): Array<string | number> {
  let input = path.trim();
  if (!input) throw new Error("path is empty");
  if (input === "$") return [];
  if (input.startsWith("$.")) input = input.slice(2);
  else if (input.startsWith("$[")) input = input.slice(1);

  const segments: Array<string | number> = [];
  let token = "";
  const pushToken = () => {
    if (!token) return;
    segments.push(token);
    token = "";
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === ".") {
      pushToken();
      continue;
    }
    if (char !== "[") {
      token += char;
      continue;
    }

    pushToken();
    const closeIndex = input.indexOf("]", index + 1);
    if (closeIndex === -1) throw new Error(`unterminated bracket at ${index}`);
    const bracket = input.slice(index + 1, closeIndex).trim();
    if (!bracket) throw new Error(`empty bracket at ${index}`);
    if (/^\d+$/.test(bracket)) {
      segments.push(Number(bracket));
    } else if (
      (bracket.startsWith("\"") && bracket.endsWith("\""))
      || (bracket.startsWith("'") && bracket.endsWith("'"))
    ) {
      const quoted = bracket.startsWith("'")
        ? `"${bracket.slice(1, -1).replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`
        : bracket;
      segments.push(String(JSON.parse(quoted)));
    } else {
      segments.push(bracket);
    }
    index = closeIndex;
  }
  pushToken();
  return segments;
}

function resolveJsonPath(root: unknown, path: string): { exists: boolean; value?: unknown; error?: string } {
  let segments: Array<string | number>;
  try {
    segments = parseJsonPathSegments(path);
  } catch (error) {
    return { exists: false, error: String(error instanceof Error ? error.message : error) };
  }

  let current = root;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (segment === "length") {
        current = current.length;
        continue;
      }
      const index = typeof segment === "number"
        ? segment
        : (/^\d+$/.test(segment) ? Number(segment) : -1);
      if (index < 0 || index >= current.length) return { exists: false };
      current = current[index];
      continue;
    }
    if (typeof segment === "number") {
      return { exists: false };
    }
    if (!isRecord(current) || !hasOwn(current, segment)) return { exists: false };
    current = current[segment];
  }
  return { exists: true, value: current };
}

export function assessRiddleProofOrderedTrace(
  trace: unknown,
  events: RiddleProofOrderedTraceEvent[],
): RiddleProofOrderedTraceAssessment {
  const insufficient = (
    reason: string,
    traceLength = Array.isArray(trace) ? trace.length : 0,
    witnesses: RiddleProofOrderedTraceWitness[] = [],
    missingEvent?: string,
    missingPaths?: string[],
  ): RiddleProofOrderedTraceAssessment => ({
    version: "riddle-proof.ordered-trace-assessment.v1",
    status: "proof_insufficient",
    trace_length: traceLength,
    witnesses,
    missing_event: missingEvent,
    missing_paths: missingPaths,
    reason,
  });
  const parsePath = (path: string): Array<string | number> => {
    const segments: Array<string | number> = [];
    let token = "";
    const pushToken = () => {
      const value = token.trim();
      if (value) segments.push(value);
      token = "";
    };
    for (let index = 0; index < path.length; index += 1) {
      const char = path[index];
      if (char === ".") {
        pushToken();
        continue;
      }
      if (char !== "[") {
        token += char;
        continue;
      }
      pushToken();
      const closeIndex = path.indexOf("]", index + 1);
      if (closeIndex === -1) throw new Error(`unterminated bracket at ${index}`);
      const bracket = path.slice(index + 1, closeIndex).trim();
      if (!bracket) throw new Error(`empty bracket at ${index}`);
      if (/^\d+$/.test(bracket)) {
        segments.push(Number(bracket));
      } else {
        segments.push(bracket.replace(/^['"]|['"]$/g, ""));
      }
      index = closeIndex;
    }
    pushToken();
    return segments;
  };
  const resolve = (root: unknown, path: string): { exists: boolean; value?: unknown } => {
    let segments: Array<string | number>;
    try {
      segments = parsePath(path);
    } catch {
      return { exists: false };
    }
    let current = root;
    for (const segment of segments) {
      if (Array.isArray(current)) {
        const index = typeof segment === "number" ? segment : /^\d+$/.test(segment) ? Number(segment) : -1;
        if (index < 0 || index >= current.length) return { exists: false };
        current = current[index];
        continue;
      }
      if (typeof segment !== "string" || current === null || typeof current !== "object") return { exists: false };
      if (!Object.hasOwn(current, segment)) return { exists: false };
      current = (current as Record<string, unknown>)[segment];
    }
    return { exists: true, value: current };
  };
  const valuesEqual = (left: unknown, right: unknown): boolean => {
    if (Object.is(left, right)) return true;
    if (Array.isArray(left) || Array.isArray(right)) {
      return Array.isArray(left)
        && Array.isArray(right)
        && left.length === right.length
        && left.every((value, index) => valuesEqual(value, right[index]));
    }
    if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key, index) => key === rightKeys[index] && valuesEqual(leftRecord[key], rightRecord[key]));
  };
  const numericOperator = (op: RiddleProofOrderedTraceOperator) => [
    "gt", "gte", "lt", "lte", "abs_gt", "abs_gte", "abs_lt", "abs_lte",
  ].includes(op);
  const matches = (value: unknown, predicate: RiddleProofOrderedTracePredicate): boolean => {
    if (predicate.op === "exists") return true;
    if (predicate.op === "equals") return valuesEqual(value, predicate.value);
    if (predicate.op === "not_equals") return !valuesEqual(value, predicate.value);
    if (predicate.op === "truthy") return Boolean(value);
    if (predicate.op === "falsy") return !value;
    const observed = typeof value === "number" ? value : Number.NaN;
    const expected = typeof predicate.value === "number" ? predicate.value : Number.NaN;
    if (!Number.isFinite(observed) || !Number.isFinite(expected)) return false;
    const candidate = predicate.op.startsWith("abs_") ? Math.abs(observed) : observed;
    if (predicate.op === "gt" || predicate.op === "abs_gt") return candidate > expected;
    if (predicate.op === "gte" || predicate.op === "abs_gte") return candidate >= expected;
    if (predicate.op === "lt" || predicate.op === "abs_lt") return candidate < expected;
    return candidate <= expected;
  };

  if (!Array.isArray(trace) || trace.length === 0) return insufficient("trace_missing_or_empty");
  if (!Array.isArray(events) || events.length === 0) return insufficient("events_missing", trace.length);

  for (const event of events) {
    const missingPaths = event.predicates
      .filter((predicate) => !trace.some((sample) => {
        const resolved = resolve(sample, predicate.path);
        return resolved.exists && (!numericOperator(predicate.op) || (typeof resolved.value === "number" && Number.isFinite(resolved.value)));
      }))
      .map((predicate) => predicate.path);
    if (missingPaths.length) {
      return insufficient("required_trace_field_missing", trace.length, [], event.label, Array.from(new Set(missingPaths)));
    }
  }

  const witnesses: RiddleProofOrderedTraceWitness[] = [];
  let cursor = 0;
  for (const event of events) {
    let witnessIndex = -1;
    for (let index = cursor; index < trace.length; index += 1) {
      if (event.predicates.every((predicate) => {
        const resolved = resolve(trace[index], predicate.path);
        return resolved.exists && matches(resolved.value, predicate);
      })) {
        witnessIndex = index;
        break;
      }
    }
    if (witnessIndex < 0) {
      return {
        version: "riddle-proof.ordered-trace-assessment.v1",
        status: "failed",
        trace_length: trace.length,
        witnesses,
        missing_event: event.label,
        reason: "ordered_event_not_observed",
      };
    }
    witnesses.push({
      label: event.label,
      index: witnessIndex,
      observations: event.predicates.map((predicate) => {
        const observed = resolve(trace[witnessIndex], predicate.path).value as JsonValue;
        return {
          path: predicate.path,
          op: predicate.op,
          expected: predicate.value,
          observed,
        };
      }),
    });
    cursor = witnessIndex + 1;
  }

  return {
    version: "riddle-proof.ordered-trace-assessment.v1",
    status: "passed",
    trace_length: trace.length,
    witnesses,
  };
}

export function assessRiddleProofOrderedTraceSetupResults(
  results: unknown,
  setupActionLabel: string,
  tracePath: string,
  events: RiddleProofOrderedTraceEvent[],
): RiddleProofOrderedTraceAssessment {
  const insufficient = (reason: string): RiddleProofOrderedTraceAssessment => ({
    version: "riddle-proof.ordered-trace-assessment.v1",
    status: "proof_insufficient",
    trace_length: 0,
    witnesses: [],
    reason,
  });
  if (!Array.isArray(results)) return insufficient("setup_results_missing");
  const source = results.find((item) => item && typeof item === "object" && !Array.isArray(item)
    && (item as Record<string, unknown>).label === setupActionLabel) as Record<string, unknown> | undefined;
  if (!source) return insufficient("setup_action_result_missing");
  if (!Object.hasOwn(source, "returned")) return insufficient("setup_action_return_missing");

  const segments = tracePath.split(".").map((segment) => segment.trim()).filter(Boolean);
  let trace: unknown = source.returned;
  for (const segment of segments) {
    if (trace === null || typeof trace !== "object" || Array.isArray(trace) || !Object.hasOwn(trace, segment)) {
      return insufficient("trace_path_missing");
    }
    trace = (trace as Record<string, unknown>)[segment];
  }
  return assessRiddleProofOrderedTrace(trace, events);
}

function compactProfileSetupSummaryText(value: unknown, limit = 160): string | undefined {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!text) return undefined;
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 15)).trimEnd()}... (${text.length} chars)`;
}

function profileSetupResultAction(value: Record<string, JsonValue>): string {
  const action = value.action ?? value.type;
  return typeof action === "string" && action ? action : "unknown";
}

function profileSetupFrameUrls(viewport: RiddleProofProfileViewportEvidence): string[] {
  const urls: string[] = [];
  const frames = viewport.frames || {};
  for (const container of Object.values(frames)) {
    if (!isRecord(container) || !Array.isArray(container.frames)) continue;
    for (const frame of container.frames) {
      if (!isRecord(frame)) continue;
      const url = typeof frame.url === "string" ? frame.url : undefined;
      if (url && !urls.includes(url)) urls.push(url);
    }
  }
  return urls.slice(0, 10);
}

function profileSetupActionCounts(results: Array<Record<string, JsonValue>>): Record<string, JsonValue> {
  const counts: Record<string, number> = {};
  for (const result of results) {
    const action = profileSetupResultAction(result);
    counts[action] = (counts[action] || 0) + 1;
  }
  return toJsonValue(counts) as Record<string, JsonValue>;
}

function profileSetupScreenshotLabels(results: Array<Record<string, JsonValue>>): string[] {
  return results
    .filter((result) => profileSetupResultAction(result) === "screenshot" && result.ok !== false && typeof result.screenshot_label === "string")
    .map((result) => result.screenshot_label as string)
    .filter(Boolean);
}

function profileSetupWindowCallUntilReceipts(results: Array<Record<string, JsonValue>>): Array<Record<string, JsonValue>> {
  return results
    .filter((result) => profileSetupResultAction(result) === "window_call_until")
    .map((result) => ({
      ordinal: result.ordinal ?? null,
      ok: result.ok !== false,
      path: result.path ?? null,
      until_path: result.until_path ?? null,
      until_value: result.until_value ?? null,
      until_expected_value: result.until_expected_value ?? null,
      call_count: result.call_count ?? null,
      max_calls: result.max_calls ?? null,
      reason: result.reason ?? result.error ?? null,
    }));
}

function profileSetupWindowCallReceipts(results: Array<Record<string, JsonValue>>): Array<Record<string, JsonValue>> {
  return results
    .filter((result) => profileSetupResultAction(result) === "window_call")
    .map((result) => {
      const receipt: Record<string, JsonValue> = {
        ordinal: result.ordinal ?? null,
        label: result.label ?? null,
        ok: result.ok !== false,
        path: result.path ?? null,
        return_captured: result.return_captured ?? null,
        return_stored_to: result.return_stored_to ?? null,
        reason: result.reason ?? result.store_reason ?? null,
      };
      if (result.error !== undefined) receipt.error = result.error;
      if (result.returned !== undefined) receipt.returned = result.returned;
      if (result.expected_return !== undefined) receipt.expected_return = result.expected_return;
      const returnSummary = profileSetupReturnSummary(result);
      if (returnSummary.length) receipt.return_summary = returnSummary;
      return receipt;
    });
}

function profileSetupWindowEvalReceipts(results: Array<Record<string, JsonValue>>): Array<Record<string, JsonValue>> {
  return results
    .filter((result) => profileSetupResultAction(result) === "window_eval")
    .map((result) => {
      const receipt: Record<string, JsonValue> = {
        ordinal: result.ordinal ?? null,
        label: result.label ?? null,
        ok: result.ok !== false,
        script_length: result.script_length ?? null,
        return_captured: result.return_captured ?? null,
        return_stored_to: result.return_stored_to ?? null,
        reason: result.reason ?? result.store_reason ?? null,
      };
      if (result.error !== undefined) receipt.error = result.error;
      if (result.returned !== undefined) receipt.returned = result.returned;
      if (result.expected_return !== undefined) receipt.expected_return = result.expected_return;
      const returnSummary = profileSetupReturnSummary(result);
      if (returnSummary.length) receipt.return_summary = returnSummary;
      return receipt;
    });
}

function profileSetupDeterministicRuntimeReceipts(results: Array<Record<string, JsonValue>>): Array<Record<string, JsonValue>> {
  return results
    .filter((result) => profileSetupResultAction(result) === "deterministic_runtime")
    .map((result) => ({
      ordinal: result.ordinal ?? null,
      ok: result.ok !== false,
      random_enabled: result.random_enabled ?? null,
      random_queue_added: result.random_queue_added ?? null,
      random_queue_length: result.random_queue_length ?? null,
      random_queue_mode: result.random_queue_mode ?? null,
      random_underflow_count: result.random_underflow_count ?? null,
      clock_enabled: result.clock_enabled ?? null,
      previous_now: result.previous_now ?? null,
      now: result.now ?? null,
      advance_ms: result.advance_ms ?? null,
      restored: result.restored ?? null,
      reason: result.reason ?? result.error ?? null,
    }));
}

function profileSetupReturnSummaryFields(result: Record<string, JsonValue>): RiddleProofProfileReturnSummaryField[] {
  const input = result.return_summary_fields;
  if (!Array.isArray(input)) return [];
  const fields: RiddleProofProfileReturnSummaryField[] = [];
  for (const item of input) {
    if (typeof item === "string") {
      const path = item.trim();
      if (path) fields.push({ path });
      continue;
    }
    if (!isRecord(item)) continue;
    const path = stringValue(item.path) ?? stringValue(item.key) ?? stringValue(item.json_path) ?? stringValue(item.jsonPath);
    if (!path) continue;
    const label = stringValue(item.label) ?? stringValue(item.name) ?? stringValue(item.title);
    fields.push(label ? { path, label } : { path });
  }
  return fields;
}

function profileSetupReturnSummary(result: Record<string, JsonValue>): Array<Record<string, JsonValue>> {
  if (result.returned === undefined) return [];
  return profileSetupReturnSummaryFields(result).map((field) => {
    const resolved = resolveJsonPath(result.returned, field.path);
    const receipt: Record<string, JsonValue> = {
      label: field.label || field.path,
      path: field.path,
      exists: resolved.exists,
    };
    if (resolved.exists) receipt.value = toJsonValue(resolved.value);
    if (resolved.error) receipt.reason = resolved.error;
    return receipt;
  });
}

function profileSetupRangeValueReceipts(results: Array<Record<string, JsonValue>>): Array<Record<string, JsonValue>> {
  return results
    .filter((result) => profileSetupResultAction(result) === "set_range_value")
    .map((result) => ({
      ordinal: result.ordinal ?? null,
      ok: result.ok !== false,
      selector: result.selector ?? null,
      frame_selector: result.frame_selector ?? null,
      requested_value: result.requested_value ?? null,
      actual_value: result.actual_value ?? null,
      before_value: result.before_value ?? null,
      value_as_number: result.value_as_number ?? null,
      min: result.min ?? null,
      max: result.max ?? null,
      step: result.step ?? null,
      reason: result.reason ?? result.error ?? null,
    }));
}

function profileSetupDragReceipts(results: Array<Record<string, JsonValue>>): Array<Record<string, JsonValue>> {
  return results
    .filter((result) => profileSetupResultAction(result) === "drag")
    .map((result) => ({
      ordinal: result.ordinal ?? null,
      ok: result.ok !== false,
      selector: result.selector ?? null,
      frame_selector: result.frame_selector ?? null,
      pointer_type: result.pointer_type ?? null,
      input_dispatch: result.input_dispatch ?? null,
      coordinate_mode: result.coordinate_mode ?? null,
      from_x: result.from_x ?? null,
      from_y: result.from_y ?? null,
      to_x: result.to_x ?? null,
      to_y: result.to_y ?? null,
      steps: result.steps ?? null,
      duration_ms: result.duration_ms ?? null,
      reason: result.reason ?? result.error ?? null,
    }));
}

function profileSetupTapReceipts(results: Array<Record<string, JsonValue>>): Array<Record<string, JsonValue>> {
  return results
    .filter((result) => profileSetupResultAction(result) === "tap")
    .map((result) => ({
      ordinal: result.ordinal ?? null,
      ok: result.ok !== false,
      selector: result.selector ?? null,
      frame_selector: result.frame_selector ?? null,
      pointer_type: result.pointer_type ?? null,
      input_dispatch: result.input_dispatch ?? null,
      coordinate_mode: result.coordinate_mode ?? null,
      x: result.x ?? null,
      y: result.y ?? null,
      duration_ms: result.duration_ms ?? null,
      reason: result.reason ?? result.error ?? null,
    }));
}

function profileSetupTapUntilReceipts(results: Array<Record<string, JsonValue>>): Array<Record<string, JsonValue>> {
  return results
    .filter((result) => profileSetupResultAction(result) === "tap_until")
    .map((result) => ({
      ordinal: result.ordinal ?? null,
      ok: result.ok !== false,
      selector: result.selector ?? null,
      frame_selector: result.frame_selector ?? null,
      pointer_type: result.pointer_type ?? null,
      input_dispatch: result.input_dispatch ?? null,
      coordinate_mode: result.coordinate_mode ?? null,
      x: result.x ?? null,
      y: result.y ?? null,
      duration_ms: result.duration_ms ?? null,
      until_path: result.until_path ?? null,
      until_value: result.until_value ?? null,
      until_expected_value: result.until_expected_value ?? null,
      tap_count: result.tap_count ?? null,
      max_taps: result.max_taps ?? result.max_calls ?? null,
      tap_burst_size: result.tap_burst_size ?? null,
      condition_check_count: result.condition_check_count ?? null,
      settle_ms: result.settle_ms ?? null,
      elapsed_ms: result.elapsed_ms ?? null,
      interval_ms: result.interval_ms ?? null,
      timeout_ms: result.timeout_ms ?? null,
      reason: result.reason ?? result.error ?? null,
    }));
}

function profileSetupKeyboardReceipts(results: Array<Record<string, JsonValue>>): Array<Record<string, JsonValue>> {
  return results
    .filter((result) => ["press", "key_down", "key_up"].includes(profileSetupResultAction(result)))
    .map((result) => ({
      action: profileSetupResultAction(result),
      ordinal: result.ordinal ?? null,
      ok: result.ok !== false,
      selector: result.selector ?? null,
      frame_selector: result.frame_selector ?? null,
      key: result.key ?? null,
      hold_ms: result.hold_ms ?? null,
      reason: result.reason ?? result.error ?? null,
    }));
}

function profileSetupCanvasSignatureReceipts(results: Array<Record<string, JsonValue>>): Array<Record<string, JsonValue>> {
  return results
    .filter((result) => profileSetupResultAction(result) === "canvas_signature")
    .map((result) => ({
      ordinal: result.ordinal ?? null,
      ok: result.ok !== false,
      selector: result.selector ?? null,
      frame_selector: result.frame_selector ?? null,
      label: result.label ?? null,
      hash: result.hash ?? null,
      data_length: result.data_length ?? null,
      width: result.width ?? null,
      height: result.height ?? null,
      css_width: result.css_width ?? null,
      css_height: result.css_height ?? null,
      compare_to: result.compare_to ?? null,
      previous_hash: result.previous_hash ?? null,
      changed: result.changed ?? null,
      return_stored_to: result.return_stored_to ?? null,
      reason: result.reason ?? result.error ?? null,
    }));
}

function profileSetupCanvasSignatureStableHashGroups(results: Array<Record<string, JsonValue>>): Array<Record<string, JsonValue>> {
  const groups = new Map<string, {
    selector: string;
    frame_selector?: string;
    receipts: Array<{ hash: string; label: string; ordinal?: number }>;
  }>();

  for (const receipt of profileSetupCanvasSignatureReceipts(results)) {
    if (receipt.ok === false) continue;
    const hash = stringValue(receipt.hash);
    if (!hash) continue;
    const selector = stringValue(receipt.selector) || "canvas";
    const frameSelector = stringValue(receipt.frame_selector);
    const key = String(frameSelector || "") + "\n" + selector;
    const group = groups.get(key) || { selector, frame_selector: frameSelector, receipts: [] };
    const ordinal = numberValue(receipt.ordinal);
    const label = stringValue(receipt.label) || (ordinal === undefined ? `capture-${group.receipts.length + 1}` : `#${ordinal}`);
    group.receipts.push({ hash, label, ordinal });
    groups.set(key, group);
  }

  const warnings: Array<Record<string, JsonValue>> = [];
  for (const group of groups.values()) {
    const receiptsByHash = new Map<string, typeof group.receipts>();
    for (const receipt of group.receipts) {
      const hashReceipts = receiptsByHash.get(receipt.hash) || [];
      hashReceipts.push(receipt);
      receiptsByHash.set(receipt.hash, hashReceipts);
    }
    for (const [hash, receipts] of receiptsByHash.entries()) {
      const labels = [...new Set(receipts.map((receipt) => receipt.label))];
      if (receipts.length < 2 || labels.length < 2) continue;
      const visibleLabels = labels.slice(0, 8);
      warnings.push({
        selector: group.selector,
        frame_selector: group.frame_selector ?? null,
        hash,
        count: receipts.length,
        label_count: labels.length,
        labels: visibleLabels,
        omitted_label_count: Math.max(0, labels.length - visibleLabels.length),
        ordinals: receipts
          .map((receipt) => receipt.ordinal)
          .filter((value): value is number => value !== undefined)
          .slice(0, 12),
        reason: "stable_canvas_signature_hash",
      });
    }
  }
  return warnings;
}

function profileSetupClickSequenceReceipts(clickedItems: Array<Record<string, unknown>>): Array<Record<string, JsonValue>> {
  const nthChildPattern = /:nth-child\((\d+)\)/;
  const nthChildTemplatePattern = /:nth-child\(\d+\)/g;
  const groups = new Map<string, {
    selector_template: string;
    frame_selector?: string;
    value_source: string;
    sequence: number[];
    ordinals: number[];
    result_count: number;
    click_total: number;
  }>();

  for (const item of clickedItems) {
    const selector = stringValue(item.selector);
    if (!selector) continue;
    const frameSelector = stringValue(item.frame_selector);
    const clickCountValue = numberValue(item.click_count);
    const clickCount = clickCountValue === undefined ? 1 : Math.max(1, Math.min(100, Math.floor(clickCountValue)));
    const ordinal = numberValue(item.ordinal);
    const match = nthChildPattern.exec(selector);
    const selectorTemplate = match
      ? selector.replace(nthChildTemplatePattern, ":nth-child(*)")
      : selector;
    const valueSource = match ? "nth-child" : "same-selector";
    const key = `${valueSource}\n${frameSelector || ""}\n${selectorTemplate}`;
    const group = groups.get(key) || {
      selector_template: selectorTemplate,
      frame_selector: frameSelector,
      value_source: valueSource,
      sequence: [],
      ordinals: [],
      result_count: 0,
      click_total: 0,
    };
    if (match) {
      const value = Number(match[1]);
      for (let index = 0; index < clickCount; index += 1) group.sequence.push(value);
    }
    if (ordinal !== undefined) group.ordinals.push(ordinal);
    group.result_count += 1;
    group.click_total += clickCount;
    groups.set(key, group);
  }

  return [...groups.values()]
    .filter((group) => group.result_count >= 4)
    .map((group) => {
      const sequence = group.sequence.slice(0, 32);
      const ordinals = group.ordinals.slice(0, 16);
      return {
        selector_template: group.selector_template,
        frame_selector: group.frame_selector ?? null,
        value_source: group.value_source,
        result_count: group.result_count,
        click_total: group.click_total,
        sequence,
        omitted_sequence_count: Math.max(0, group.sequence.length - sequence.length),
        ordinals,
        omitted_ordinal_count: Math.max(0, group.ordinals.length - ordinals.length),
      };
    });
}

function sampleProfileSetupSummaryItems<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items;
  const firstCount = Math.floor(limit / 2);
  const lastCount = limit - firstCount;
  return [...items.slice(0, firstCount), ...items.slice(-lastCount)];
}

function profileScreenshotLabels(viewports: RiddleProofProfileViewportEvidence[] | undefined): string[] {
  const labels: string[] = [];
  for (const viewport of viewports || []) {
    if (viewport.screenshot_label) labels.push(viewport.screenshot_label);
    labels.push(...profileSetupScreenshotLabels(viewport.setup_action_results || []));
  }
  return labels;
}

function profileFinalScreenshotLabels(viewports: RiddleProofProfileViewportEvidence[] | undefined): string[] {
  return (viewports || [])
    .map((viewport) => viewport.screenshot_label)
    .filter((label): label is string => typeof label === "string" && Boolean(label.trim()));
}

function profileAllSetupScreenshotLabels(viewports: RiddleProofProfileViewportEvidence[] | undefined): string[] {
  return (viewports || []).flatMap((viewport) => profileSetupScreenshotLabels(viewport.setup_action_results || []));
}

function profileSetupSummary(
  viewports: RiddleProofProfileViewportEvidence[],
  actionCount?: number,
  expectedActionCountByViewport?: Map<string, number>,
  finalScreenshotFullPage?: boolean,
): JsonValue {
  const normalizedFinalScreenshotFullPage = finalScreenshotFullPage === undefined
    ? undefined
    : finalScreenshotFullPage !== false;
  const finalScreenshotCount = viewports.filter((viewport) => typeof viewport.screenshot_label === "string" && viewport.screenshot_label.trim()).length;
  return toJsonValue({
    viewport_count: viewports.length,
    action_count: actionCount ?? null,
    final_screenshot_count: finalScreenshotCount,
    final_screenshot_full_page: normalizedFinalScreenshotFullPage ?? null,
    final_screenshot_mode: normalizedFinalScreenshotFullPage === undefined
      ? null
      : normalizedFinalScreenshotFullPage
        ? "full_page"
        : "viewport",
    viewports: viewports.map((viewport) => {
      const expectedActionCount = expectedActionCountByViewport?.get(viewport.name) ?? actionCount;
      const viewportFinalScreenshotFullPage = typeof viewport.screenshot_full_page === "boolean"
        ? viewport.screenshot_full_page
        : normalizedFinalScreenshotFullPage;
      const results = viewport.setup_action_results || [];
      const failed = results.filter((result) => result.ok === false && result.optional !== true);
      const optionalFailed = results.filter((result) => result.ok === false && result.optional === true);
      const successfulClicks = results.filter((result) => profileSetupResultAction(result) === "click" && result.ok !== false);
      const clickCountValues = successfulClicks
        .map((result) => typeof result.click_count === "number" && Number.isFinite(result.click_count) && result.click_count > 1 ? result.click_count : undefined)
        .filter((value): value is number => value !== undefined);
      const windowCallUntilReceipts = profileSetupWindowCallUntilReceipts(results);
      const windowCallUntilCallCounts = windowCallUntilReceipts
        .map((result) => typeof result.call_count === "number" && Number.isFinite(result.call_count) ? result.call_count : undefined)
        .filter((value): value is number => value !== undefined);
      const sampledWindowCallUntilReceipts = sampleProfileSetupSummaryItems(windowCallUntilReceipts, 8);
      const windowCallReceipts = profileSetupWindowCallReceipts(results);
      const windowCallStoredTotal = windowCallReceipts.filter((result) => typeof result.return_stored_to === "string" && result.return_stored_to.trim()).length;
      const windowCallCapturedTotal = windowCallReceipts.filter((result) => result.return_captured === true).length;
      const sampledWindowCallReceipts = sampleProfileSetupSummaryItems(windowCallReceipts, 8);
      const windowEvalReceipts = profileSetupWindowEvalReceipts(results);
      const windowEvalStoredTotal = windowEvalReceipts.filter((result) => typeof result.return_stored_to === "string" && result.return_stored_to.trim()).length;
      const windowEvalCapturedTotal = windowEvalReceipts.filter((result) => result.return_captured === true).length;
      const sampledWindowEvalReceipts = sampleProfileSetupSummaryItems(windowEvalReceipts, 8);
      const deterministicRuntimeReceipts = profileSetupDeterministicRuntimeReceipts(results);
      const sampledDeterministicRuntimeReceipts = sampleProfileSetupSummaryItems(deterministicRuntimeReceipts, 8);
      const rangeValueReceipts = profileSetupRangeValueReceipts(results);
      const sampledRangeValueReceipts = sampleProfileSetupSummaryItems(rangeValueReceipts, 8);
      const dragReceipts = profileSetupDragReceipts(results);
      const sampledDragReceipts = sampleProfileSetupSummaryItems(dragReceipts, 8);
      const tapReceipts = profileSetupTapReceipts(results);
      const sampledTapReceipts = sampleProfileSetupSummaryItems(tapReceipts, 8);
      const tapUntilReceipts = profileSetupTapUntilReceipts(results);
      const tapUntilTapCounts = tapUntilReceipts
        .map((result) => typeof result.tap_count === "number" && Number.isFinite(result.tap_count) ? result.tap_count : undefined)
        .filter((value): value is number => value !== undefined);
      const sampledTapUntilReceipts = sampleProfileSetupSummaryItems(tapUntilReceipts, 8);
      const keyboardReceipts = profileSetupKeyboardReceipts(results);
      const sampledKeyboardReceipts = sampleProfileSetupSummaryItems(keyboardReceipts, 8);
      const canvasSignatureReceipts = profileSetupCanvasSignatureReceipts(results);
      const sampledCanvasSignatureReceipts = sampleProfileSetupSummaryItems(canvasSignatureReceipts, 8);
      const clickedItems = results
        .filter((result) => profileSetupResultAction(result) === "click" && result.ok !== false)
        .map((result) => {
          const clickCount = typeof result.click_count === "number" && Number.isFinite(result.click_count) && result.click_count > 1 ? result.click_count : undefined;
          return {
            ordinal: result.ordinal ?? null,
            selector: result.selector ?? null,
            frame_selector: result.frame_selector ?? null,
            text: compactProfileSetupSummaryText(result.text),
            ...(result.fallback_to_tap === true ? { fallback_to_tap: true } : {}),
            ...(result.input_dispatch ? { input_dispatch: result.input_dispatch } : {}),
            ...(result.click_error ? { click_error: compactProfileSetupSummaryText(result.click_error) } : {}),
            ...(clickCount ? { click_count: clickCount } : {}),
          };
        });
      const clicked = sampleProfileSetupSummaryItems(clickedItems, 8);
      const clickSequences = profileSetupClickSequenceReceipts(clickedItems);
      const sampledClickSequences = sampleProfileSetupSummaryItems(clickSequences, 6);
      const text_samples = results
        .filter((result) => result.ok !== false && typeof result.text === "string" && (
          profileSetupResultAction(result) === "assert_text_visible"
          || profileSetupResultAction(result) === "assert_text_absent"
          || profileSetupResultAction(result) === "wait_for_text"
        ))
        .map((result) => ({
          ordinal: result.ordinal ?? null,
          action: profileSetupResultAction(result),
          frame_selector: result.frame_selector ?? null,
          text: compactProfileSetupSummaryText(result.text),
        }))
        .filter((item) => item.text)
        .slice(-6);
      return {
        name: viewport.name,
        expected_action_count: expectedActionCount ?? null,
        ok: (expectedActionCount === undefined ? results.length > 0 : results.length >= expectedActionCount) && failed.length === 0,
        result_count: results.length,
        observed_path: viewport.route?.observed ?? null,
        final_url: viewport.url ?? null,
        action_counts: profileSetupActionCounts(results),
        frame_action_count: results.filter((result) => result.frame_selector).length,
        frame_urls: profileSetupFrameUrls(viewport),
        final_screenshot: viewport.screenshot_label ?? null,
        final_screenshot_full_page: viewportFinalScreenshotFullPage ?? null,
        setup_screenshots: profileSetupScreenshotLabels(results),
        clicked_total: clickedItems.length,
        clicked_truncated: clickedItems.length > clicked.length,
        click_sequence_total: clickSequences.length,
        click_sequence_truncated: clickSequences.length > sampledClickSequences.length,
        click_sequences: sampledClickSequences,
        click_count_action_total: clickCountValues.length,
        click_count_value_total: clickCountValues.reduce((sum, value) => sum + value, 0),
        window_call_until_total: windowCallUntilReceipts.length,
        window_call_until_call_total: windowCallUntilCallCounts.reduce((sum, value) => sum + value, 0),
        window_call_until_truncated: windowCallUntilReceipts.length > sampledWindowCallUntilReceipts.length,
        window_call_until: sampledWindowCallUntilReceipts,
        window_call_total: windowCallReceipts.length,
        window_call_stored_total: windowCallStoredTotal,
        window_call_captured_total: windowCallCapturedTotal,
        window_call_truncated: windowCallReceipts.length > sampledWindowCallReceipts.length,
        window_call: sampledWindowCallReceipts,
        window_eval_total: windowEvalReceipts.length,
        window_eval_stored_total: windowEvalStoredTotal,
        window_eval_captured_total: windowEvalCapturedTotal,
        window_eval_truncated: windowEvalReceipts.length > sampledWindowEvalReceipts.length,
        window_eval: sampledWindowEvalReceipts,
        deterministic_runtime_total: deterministicRuntimeReceipts.length,
        deterministic_runtime_truncated: deterministicRuntimeReceipts.length > sampledDeterministicRuntimeReceipts.length,
        deterministic_runtime: sampledDeterministicRuntimeReceipts,
        set_range_value_total: rangeValueReceipts.length,
        set_range_value_truncated: rangeValueReceipts.length > sampledRangeValueReceipts.length,
        set_range_value: sampledRangeValueReceipts,
        drag_total: dragReceipts.length,
        drag_truncated: dragReceipts.length > sampledDragReceipts.length,
        drag: sampledDragReceipts,
        tap_total: tapReceipts.length,
        tap_truncated: tapReceipts.length > sampledTapReceipts.length,
        tap: sampledTapReceipts,
        tap_until_total: tapUntilReceipts.length,
        tap_until_tap_total: tapUntilTapCounts.reduce((sum, value) => sum + value, 0),
        tap_until_truncated: tapUntilReceipts.length > sampledTapUntilReceipts.length,
        tap_until: sampledTapUntilReceipts,
        keyboard_total: keyboardReceipts.length,
        keyboard_truncated: keyboardReceipts.length > sampledKeyboardReceipts.length,
        keyboard: sampledKeyboardReceipts,
        canvas_signature_total: canvasSignatureReceipts.length,
        canvas_signature_truncated: canvasSignatureReceipts.length > sampledCanvasSignatureReceipts.length,
        canvas_signature: sampledCanvasSignatureReceipts,
        canvas_signature_stable_hash_groups: profileSetupCanvasSignatureStableHashGroups(results),
        clicked,
        text_samples,
        failed: failed.map((result) => ({
          ordinal: result.ordinal ?? null,
          action: profileSetupResultAction(result),
          selector: result.selector ?? null,
          frame_selector: result.frame_selector ?? null,
          reason: result.reason ?? result.error ?? null,
          error: result.error ?? null,
          case_insensitive_text: compactProfileSetupSummaryText(result.case_insensitive_text),
        })),
        optional_failed: optionalFailed.map((result) => ({
          ordinal: result.ordinal ?? null,
          action: profileSetupResultAction(result),
          selector: result.selector ?? null,
          frame_selector: result.frame_selector ?? null,
          reason: result.reason ?? result.error ?? null,
          error: result.error ?? null,
          case_insensitive_text: compactProfileSetupSummaryText(result.case_insensitive_text),
        })),
      };
    }),
  });
}

function normalizeName(value: unknown, fallback: string): string {
  const name = stringValue(value) || fallback;
  return name.replace(/\s+/g, " ").trim();
}

export function slugifyRiddleProofProfileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "profile";
}

function normalizeViewport(input: unknown, index: number): RiddleProofProfileViewport {
  if (!isRecord(input)) throw new Error(`target.viewports[${index}] must be an object.`);
  const width = numberValue(input.width);
  const height = numberValue(input.height);
  if (!width || !height || width < 100 || height < 100) {
    throw new Error(`target.viewports[${index}] requires numeric width and height >= 100.`);
  }
  const hasTouch = booleanValue(valueFromOwn(input, "hasTouch", "has_touch"));
  const isMobile = booleanValue(valueFromOwn(input, "isMobile", "is_mobile"));
  return {
    name: normalizeName(input.name || input.label, `viewport-${index + 1}`),
    width: Math.round(width),
    height: Math.round(height),
    ...(hasTouch === undefined ? {} : { hasTouch }),
    ...(isMobile === undefined ? {} : { isMobile }),
  };
}

function normalizeViewports(value: unknown): RiddleProofProfileViewport[] {
  if (value === undefined) return [...DEFAULT_VIEWPORTS];
  if (!Array.isArray(value) || value.length === 0) throw new Error("target.viewports must be a non-empty array.");
  return value.map(normalizeViewport);
}

function isSupportedCheckType(value: string): value is RiddleProofProfileCheckType {
  return (RIDDLE_PROOF_PROFILE_CHECK_TYPES as readonly string[]).includes(value);
}

function normalizeSetupActionType(value: string | undefined, index: number): RiddleProofProfileSetupActionType {
  const normalizedInput = String(value || "").trim().replace(/-/g, "_");
  const normalized = normalizedInput === "clear_browser_storage"
    ? "clear_storage"
    : normalizedInput === "reset_console" || normalizedInput === "clear_browser_console" || normalizedInput === "reset_browser_console"
      ? "clear_console"
    : normalizedInput === "pointer_drag" || normalizedInput === "mouse_drag" || normalizedInput === "drag_to"
      ? "drag"
    : normalizedInput === "pointer_tap" || normalizedInput === "touch_tap" || normalizedInput === "canvas_tap"
      ? "tap"
    : normalizedInput === "tap_until" || normalizedInput === "pointer_tap_until" || normalizedInput === "touch_tap_until" || normalizedInput === "canvas_tap_until" || normalizedInput === "tap_repeat_until" || normalizedInput === "repeat_tap_until"
      ? "tap_until"
    : normalizedInput === "keyboard_press" || normalizedInput === "key_press"
      ? "press"
    : normalizedInput === "keyboard_down" || normalizedInput === "key_down" || normalizedInput === "keydown" || normalizedInput === "press_down"
      ? "key_down"
    : normalizedInput === "keyboard_up" || normalizedInput === "key_up" || normalizedInput === "keyup" || normalizedInput === "press_up" || normalizedInput === "release_key" || normalizedInput === "key_release"
      ? "key_up"
    : normalizedInput === "set_slider_value" || normalizedInput === "slider_value" || normalizedInput === "set_slider" || normalizedInput === "set_range" || normalizedInput === "range_value" || normalizedInput === "range_input" || normalizedInput === "set_range_input"
      ? "set_range_value"
    : normalizedInput === "deterministic_runtime" || normalizedInput === "mock_runtime" || normalizedInput === "mock_random" || normalizedInput === "mock_random_queue" || normalizedInput === "seed_random_queue" || normalizedInput === "set_random_queue" || normalizedInput === "mock_clock" || normalizedInput === "set_mock_clock" || normalizedInput === "set_runtime_determinism" || normalizedInput === "runtime_determinism"
      ? "deterministic_runtime"
    : normalizedInput === "canvas_hash" || normalizedInput === "capture_canvas_hash" || normalizedInput === "capture_canvas_signature" || normalizedInput === "canvas_state_signature"
      ? "canvas_signature"
    : normalizedInput === "capture_screenshot" || normalizedInput === "save_screenshot" || normalizedInput === "setup_screenshot"
      ? "screenshot"
    : normalizedInput === "accept_dialog" || normalizedInput === "accept_dialogs" || normalizedInput === "confirm_dialog" || normalizedInput === "set_dialog_response"
      ? "dialog_response"
    : normalizedInput === "dismiss_dialog" || normalizedInput === "dismiss_dialogs" || normalizedInput === "cancel_dialog"
      ? "dialog_response"
    : normalizedInput === "window_call_until" || normalizedInput === "call_until" || normalizedInput === "window_call_repeat_until" || normalizedInput === "repeat_window_call_until"
      ? "window_call_until"
    : normalizedInput === "window_evaluate" || normalizedInput === "browser_eval" || normalizedInput === "browser_evaluate" || normalizedInput === "evaluate_script" || normalizedInput === "profile_script"
      ? "window_eval"
      : normalizedInput;
  if ((RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES as readonly string[]).includes(normalized)) {
    return normalized as RiddleProofProfileSetupActionType;
  }
  throw new Error(`target.setup_actions[${index}].type ${value || "(missing)"} is not supported. Supported actions: ${RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES.join(", ")}`);
}

function normalizeSetupActionStorage(value: unknown, index: number): "local" | "session" | "both" | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = String(value).trim().replace(/-/g, "_");
  if (normalized === "local" || normalized === "local_storage") return "local";
  if (normalized === "session" || normalized === "session_storage") return "session";
  if (normalized === "both" || normalized === "all") return "both";
  throw new Error(`target.setup_actions[${index}].storage ${String(value)} is not supported. Supported storage values: local, session, both.`);
}

function normalizeSetupActionArgs(input: Record<string, unknown>, index: number): JsonValue[] | undefined {
  const argsInput = valueFromOwn(input, "args", "arguments", "args_json", "argsJson");
  if (argsInput === undefined) return undefined;
  if (!Array.isArray(argsInput)) {
    throw new Error(`target.setup_actions[${index}] window_call/window_eval args must be an array.`);
  }
  return argsInput.map(toJsonValue);
}

function normalizeReturnSummaryFields(input: Record<string, unknown>, index: number): RiddleProofProfileReturnSummaryField[] | undefined {
  const fieldsInput = valueFromOwn(
    input,
    "return_summary_fields",
    "returnSummaryFields",
    "summary_fields",
    "summaryFields",
    "receipt_fields",
    "receiptFields",
    "return_receipt_fields",
    "returnReceiptFields",
  );
  if (fieldsInput === undefined) return undefined;
  if (!Array.isArray(fieldsInput)) {
    throw new Error(`target.setup_actions[${index}].return_summary_fields must be an array.`);
  }
  return fieldsInput.map((field, fieldIndex) => {
    if (typeof field === "string") {
      const path = field.trim();
      if (!path) throw new Error(`target.setup_actions[${index}].return_summary_fields[${fieldIndex}] requires path.`);
      return { path };
    }
    if (!isRecord(field)) {
      throw new Error(`target.setup_actions[${index}].return_summary_fields[${fieldIndex}] must be a string path or object.`);
    }
    const path = stringFromOwn(field, "path", "key", "json_path", "jsonPath");
    if (!path) throw new Error(`target.setup_actions[${index}].return_summary_fields[${fieldIndex}] requires path.`);
    const label = stringFromOwn(field, "label", "name", "title");
    return label ? { path, label } : { path };
  });
}

function normalizeSetupActionRepeat(input: Record<string, unknown>, index: number): number | undefined {
  const repeat = numberValue(valueFromOwn(input, "repeat", "repeat_count", "repeatCount", "times"));
  if (repeat === undefined) return undefined;
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 100) {
    throw new Error(`target.setup_actions[${index}].repeat must be an integer from 1 to 100.`);
  }
  return repeat;
}

function normalizeSetupActionClickCount(input: Record<string, unknown>, type: RiddleProofProfileSetupActionType, index: number): number | undefined {
  const clickCountInput = valueFromOwn(input, "click_count", "clickCount", "clicks");
  if (clickCountInput === undefined) return undefined;
  if (type !== "click") {
    throw new Error(`target.setup_actions[${index}].click_count is only supported for click actions.`);
  }
  const clickCount = numberValue(clickCountInput);
  if (clickCount === undefined || !Number.isInteger(clickCount) || clickCount < 1 || clickCount > 10) {
    throw new Error(`target.setup_actions[${index}].click_count must be an integer from 1 to 10.`);
  }
  return clickCount;
}

function normalizeSetupActionCoordinateMode(value: unknown, index: number): "pixels" | "ratio" | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = String(value).trim().replace(/-/g, "_").toLowerCase();
  if (normalized === "pixels" || normalized === "pixel" || normalized === "px") return "pixels";
  if (normalized === "ratio" || normalized === "relative" || normalized === "fraction") return "ratio";
  throw new Error(`target.setup_actions[${index}].coordinate_mode ${String(value)} is not supported. Supported coordinate modes: pixels, ratio.`);
}

function normalizeSetupActionPointerType(value: unknown, type: RiddleProofProfileSetupActionType, index: number): "mouse" | "touch" | "pen" | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (type !== "drag" && type !== "tap" && type !== "tap_until") {
    throw new Error(`target.setup_actions[${index}].pointer_type is only supported for drag/tap/tap_until actions.`);
  }
  const normalized = String(value).trim().replace(/-/g, "_").toLowerCase();
  if (normalized === "mouse") return "mouse";
  if (normalized === "touch" || normalized === "finger") return "touch";
  if (normalized === "pen" || normalized === "stylus") return "pen";
  throw new Error(`target.setup_actions[${index}].pointer_type ${String(value)} is not supported. Supported pointer types: mouse, touch, pen.`);
}

function normalizeSetupActionScreenshotFullPage(input: Record<string, unknown>, type: RiddleProofProfileSetupActionType, index: number): boolean | undefined {
  const directFullPage = booleanValue(valueFromOwn(input, "full_page", "fullPage"));
  const viewportOnly = booleanValue(valueFromOwn(input, "viewport_only", "viewportOnly", "viewport_screenshot", "viewportScreenshot"));
  if (type !== "screenshot") {
    if (
      directFullPage !== undefined
      || viewportOnly !== undefined
      || valueFromOwn(input, "screenshot_mode", "screenshotMode", "capture_mode", "captureMode") !== undefined
    ) {
      throw new Error(`target.setup_actions[${index}].full_page is only supported for screenshot actions.`);
    }
    return undefined;
  }
  const modeInput = stringFromOwn(input, "mode", "screenshot_mode", "screenshotMode", "capture_mode", "captureMode");
  let modeFullPage: boolean | undefined;
  if (modeInput) {
    const mode = modeInput.trim().toLowerCase().replace(/[-\s]+/g, "_");
    if (mode === "full_page" || mode === "fullpage" || mode === "page" || mode === "document") {
      modeFullPage = true;
    } else if (mode === "viewport" || mode === "view") {
      modeFullPage = false;
    } else {
      throw new Error(`target.setup_actions[${index}].mode ${modeInput} is not supported for screenshot actions. Supported modes: full_page, viewport.`);
    }
  }
  const values = [directFullPage, viewportOnly === undefined ? undefined : !viewportOnly, modeFullPage]
    .filter((value): value is boolean => value !== undefined);
  if (!values.length) return undefined;
  if (values.some((value) => value !== values[0])) {
    throw new Error(`target.setup_actions[${index}] has conflicting screenshot full_page / viewport mode options.`);
  }
  return values[0];
}

function normalizeSetupActionRandomQueue(input: Record<string, unknown>, index: number): number[] | undefined {
  const rawQueue = valueFromOwn(
    input,
    "random_queue",
    "randomQueue",
    "random_values",
    "randomValues",
    "random_sequence",
    "randomSequence",
    "math_random",
    "mathRandom",
  );
  if (rawQueue === undefined) return undefined;
  if (!Array.isArray(rawQueue) || rawQueue.length === 0) {
    throw new Error(`target.setup_actions[${index}].random_queue must be a non-empty array of numbers from 0 inclusive to 1 exclusive.`);
  }
  return rawQueue.map((item, queueIndex) => {
    const value = numberValue(item);
    if (value === undefined || value < 0 || value >= 1) {
      throw new Error(`target.setup_actions[${index}].random_queue[${queueIndex}] must be a finite number from 0 inclusive to 1 exclusive.`);
    }
    return value;
  });
}

function normalizeSetupActionNonNegativeNumber(input: Record<string, unknown>, index: number, outputKey: string, ...keys: string[]): number | undefined {
  const rawValue = valueFromOwn(input, ...keys);
  if (rawValue === undefined) return undefined;
  const value = numberValue(rawValue);
  if (value === undefined || value < 0) {
    throw new Error(`target.setup_actions[${index}].${outputKey} must be a finite non-negative number.`);
  }
  return value;
}

function normalizeSetupAction(input: unknown, index: number): RiddleProofProfileSetupAction {
  if (!isRecord(input)) throw new Error(`target.setup_actions[${index}] must be an object.`);
  const type = normalizeSetupActionType(stringValue(input.type), index);
  const rawType = String(input.type || "").trim().replace(/-/g, "_").toLowerCase();
  const selector = stringValue(input.selector);
  const frameSelector = stringFromOwn(input, "frame_selector", "frameSelector", "iframe_selector", "iframeSelector");
  const frameIndex = numberValue(valueFromOwn(input, "frame_index", "frameIndex", "iframe_index", "iframeIndex"));
  if (frameIndex !== undefined && (!Number.isInteger(frameIndex) || frameIndex < 0)) {
    throw new Error(`target.setup_actions[${index}].frame_index must be a non-negative integer.`);
  }
  if ((type === "click" || type === "tap" || type === "tap_until" || type === "drag" || type === "fill" || type === "set_input_value" || type === "set_range_value" || type === "canvas_signature" || type === "wait_for_selector" || type === "wait_for_text" || type === "assert_text_visible" || type === "assert_text_absent" || type === "assert_selector_count") && !selector) {
    throw new Error(`target.setup_actions[${index}] ${type} requires selector.`);
  }
  const fromX = type === "click" || type === "tap" || type === "tap_until"
    ? numberValue(valueFromOwn(input, "from_x", "fromX", "x", "click_x", "clickX", "start_x", "startX", "x1"))
    : numberValue(valueFromOwn(input, "from_x", "fromX", "start_x", "startX", "x1"));
  const fromY = type === "click" || type === "tap" || type === "tap_until"
    ? numberValue(valueFromOwn(input, "from_y", "fromY", "y", "click_y", "clickY", "start_y", "startY", "y1"))
    : numberValue(valueFromOwn(input, "from_y", "fromY", "start_y", "startY", "y1"));
  const toX = numberValue(valueFromOwn(input, "to_x", "toX", "end_x", "endX", "x2"));
  const toY = numberValue(valueFromOwn(input, "to_y", "toY", "end_y", "endY", "y2"));
  const coordinateMode = normalizeSetupActionCoordinateMode(valueFromOwn(input, "coordinate_mode", "coordinateMode", "coords", "units"), index);
  const pointerType = normalizeSetupActionPointerType(valueFromOwn(input, "pointer_type", "pointerType", "input_type", "inputType"), type, index);
  const durationMs = numberValue(input.duration_ms) ?? numberValue(input.durationMs);
  const holdMs = type === "press"
    ? normalizeSetupActionNonNegativeNumber(input, index, "hold_ms", "hold_ms", "holdMs", "key_down_ms", "keyDownMs", "down_ms", "downMs") ?? durationMs
    : undefined;
  if (type === "press" && holdMs !== undefined && (holdMs < 0 || holdMs > 30000)) {
    throw new Error(`target.setup_actions[${index}].hold_ms must be a finite number from 0 to 30000.`);
  }
  if (type === "click") {
    const hasClickCoordinate = fromX !== undefined || fromY !== undefined;
    if (hasClickCoordinate && (fromX === undefined || fromY === undefined)) {
      throw new Error(`target.setup_actions[${index}] click coordinates require both x and y.`);
    }
    if (hasClickCoordinate && fromX !== undefined && fromY !== undefined) {
      const clickCoordinates = [fromX, fromY];
      if (coordinateMode === "ratio" && clickCoordinates.some((value) => value < 0 || value > 1)) {
        throw new Error(`target.setup_actions[${index}] click ratio coordinates must be between 0 and 1.`);
      }
      if ((coordinateMode === undefined || coordinateMode === "pixels") && clickCoordinates.some((value) => value < 0)) {
        throw new Error(`target.setup_actions[${index}] click pixel coordinates must be non-negative.`);
      }
    }
  }
  if (type === "tap" || type === "tap_until") {
    const hasTapCoordinate = fromX !== undefined || fromY !== undefined;
    if (hasTapCoordinate && (fromX === undefined || fromY === undefined)) {
      throw new Error(`target.setup_actions[${index}] ${type} coordinates require both x and y.`);
    }
    if (hasTapCoordinate && fromX !== undefined && fromY !== undefined) {
      const tapCoordinates = [fromX, fromY];
      if (coordinateMode === "ratio" && tapCoordinates.some((value) => value < 0 || value > 1)) {
        throw new Error(`target.setup_actions[${index}] ${type} ratio coordinates must be between 0 and 1.`);
      }
      if ((coordinateMode === undefined || coordinateMode === "pixels") && tapCoordinates.some((value) => value < 0)) {
        throw new Error(`target.setup_actions[${index}] ${type} pixel coordinates must be non-negative.`);
      }
    }
  }
  if (type === "drag") {
    if (fromX === undefined || fromY === undefined || toX === undefined || toY === undefined) {
      throw new Error(`target.setup_actions[${index}] drag requires from_x, from_y, to_x, and to_y.`);
    }
    if (coordinateMode === "ratio" && [fromX, fromY, toX, toY].some((value) => value < 0 || value > 1)) {
      throw new Error(`target.setup_actions[${index}] drag ratio coordinates must be between 0 and 1.`);
    }
    if ((coordinateMode === undefined || coordinateMode === "pixels") && [fromX, fromY, toX, toY].some((value) => value < 0)) {
      throw new Error(`target.setup_actions[${index}] drag pixel coordinates must be non-negative.`);
    }
  }
  if (type === "wait_for_text" && !stringValue(input.text) && !stringValue(input.pattern)) {
    throw new Error(`target.setup_actions[${index}] wait_for_text requires text or pattern.`);
  }
  if ((type === "assert_text_visible" || type === "assert_text_absent") && !stringValue(input.text) && !stringValue(input.pattern)) {
    throw new Error(`target.setup_actions[${index}] ${type} requires text or pattern.`);
  }
  const expectedCount = numberValue(input.expected_count ?? input.expectedCount ?? input.count);
  if (type === "assert_selector_count" && (expectedCount === undefined || !Number.isInteger(expectedCount) || expectedCount < 0)) {
    throw new Error(`target.setup_actions[${index}] ${type} requires non-negative integer expected_count.`);
  }
  const value = stringFromOwn(input, "value", "input_value", "inputValue");
  const hasJsonValue = hasOwn(input, "value_json") || hasOwn(input, "valueJson") || hasOwn(input, "json");
  if ((type === "fill" || type === "set_input_value" || type === "set_range_value") && value === undefined && !hasJsonValue) {
    throw new Error(`target.setup_actions[${index}] ${type} requires value.`);
  }
  const randomQueue = type === "deterministic_runtime" ? normalizeSetupActionRandomQueue(input, index) : undefined;
  const deterministicNow = type === "deterministic_runtime" ? normalizeSetupActionNonNegativeNumber(input, index, "now", "now", "date_now", "dateNow", "mock_now", "mockNow", "clock", "timestamp", "time_ms", "timeMs") : undefined;
  const deterministicAdvanceMs = type === "deterministic_runtime" ? normalizeSetupActionNonNegativeNumber(input, index, "advance_ms", "advance_ms", "advanceMs", "tick_ms", "tickMs", "add_ms", "addMs") : undefined;
  const deterministicAppend = type === "deterministic_runtime" && booleanValue(valueFromOwn(input, "append", "append_random", "appendRandom")) === true;
  const deterministicRestore = type === "deterministic_runtime" && booleanValue(valueFromOwn(input, "restore", "reset", "restore_originals", "restoreOriginals")) === true;
  if (type === "deterministic_runtime" && randomQueue === undefined && deterministicNow === undefined && deterministicAdvanceMs === undefined && !deterministicRestore) {
    throw new Error(`target.setup_actions[${index}] deterministic_runtime requires random_queue, now, advance_ms, or restore.`);
  }
  const key = stringValue(input.key);
  let dialogAccept: boolean | undefined;
  if (type === "dialog_response") {
    const acceptInput = valueFromOwn(input, "accept", "accepted", "should_accept", "shouldAccept");
    const responseInput = stringFromOwn(input, "response", "dialog_response", "dialogResponse", "mode");
    const response = String(responseInput || "").trim().toLowerCase().replace(/-/g, "_");
    if (acceptInput !== undefined) {
      dialogAccept = acceptInput !== false && String(acceptInput).toLowerCase() !== "false";
    } else if (rawType === "dismiss_dialog" || rawType === "dismiss_dialogs" || rawType === "cancel_dialog") {
      dialogAccept = false;
    } else if (response === "dismiss" || response === "cancel" || response === "reject" || response === "no" || response === "false") {
      dialogAccept = false;
    } else {
      dialogAccept = true;
    }
  }
  if ((type === "press" || type === "key_down" || type === "key_up") && !key) {
    throw new Error(`target.setup_actions[${index}] ${type} requires key.`);
  }
  if ((type === "local_storage" || type === "session_storage") && !key) {
    throw new Error(`target.setup_actions[${index}] ${type} requires key.`);
  }
  if ((type === "local_storage" || type === "session_storage") && value === undefined && !hasJsonValue) {
    throw new Error(`target.setup_actions[${index}] ${type} requires value.`);
  }
  const path = stringFromOwn(input, "path", "function_path", "functionPath", "window_path", "windowPath", "state_path", "statePath");
  if ((type === "window_call" || type === "window_call_until" || type === "assert_window_value" || type === "assert_window_number") && !path) {
    throw new Error(`target.setup_actions[${index}] ${type} requires path.`);
  }
  const script = stringFromOwn(input, "script", "code", "source", "body");
  if (type === "window_eval" && !script) {
    throw new Error(`target.setup_actions[${index}] window_eval requires script.`);
  }
  const args = type === "window_call" || type === "window_call_until" || type === "window_eval" ? normalizeSetupActionArgs(input, index) : undefined;
  const hasExpectedValue = hasOwn(input, "expected_value")
    || hasOwn(input, "expectedValue")
    || hasOwn(input, "expected")
    || hasOwn(input, "expect_value")
    || hasOwn(input, "expectValue")
    || hasOwn(input, "expect");
  if (type === "assert_window_value" && !hasExpectedValue) {
    throw new Error(`target.setup_actions[${index}] ${type} requires expected_value.`);
  }
  const rawExpectedValue = valueFromOwn(input, "expected_value", "expectedValue", "expected", "expect_value", "expectValue", "expect");
  const minValue = numberValue(valueFromOwn(input, "min_value", "minValue", "minimum", "min", "at_least", "atLeast", "gte"));
  const maxValue = numberValue(valueFromOwn(input, "max_value", "maxValue", "maximum", "max", "at_most", "atMost", "lte"));
  if (type === "assert_window_number") {
    if (!hasExpectedValue && minValue === undefined && maxValue === undefined) {
      throw new Error(`target.setup_actions[${index}] ${type} requires expected_value, min_value, or max_value.`);
    }
    if (hasExpectedValue && numberValue(rawExpectedValue) === undefined) {
      throw new Error(`target.setup_actions[${index}] ${type} expected_value must be a finite number.`);
    }
  }
  const hasExpectedReturn = hasOwn(input, "expect_return")
    || hasOwn(input, "expectReturn")
    || hasOwn(input, "expected_return")
    || hasOwn(input, "expectedReturn");
  const storeReturnTo = stringFromOwn(
    input,
    "store_return_to",
    "storeReturnTo",
    "save_return_to",
    "saveReturnTo",
    "assign_return_to",
    "assignReturnTo",
    "return_state_path",
    "returnStatePath",
    "store_signature_to",
    "storeSignatureTo",
    "signature_path",
    "signaturePath",
  );
  const captureReturn = input.capture_return === false
    || input.captureReturn === false
    || input.include_return === false
    || input.includeReturn === false
    || input.omit_return === true
    || input.omitReturn === true
    ? false
    : undefined;
  const untilPath = stringFromOwn(input, "until_path", "untilPath", "until_state_path", "untilStatePath", "until_window_path", "untilWindowPath", "until");
  const hasUntilExpectedValue = hasOwn(input, "until_expected_value")
    || hasOwn(input, "untilExpectedValue")
    || hasOwn(input, "until_expected")
    || hasOwn(input, "untilExpected")
    || hasOwn(input, "until_value")
    || hasOwn(input, "untilValue")
    || hasOwn(input, "expected_value")
    || hasOwn(input, "expectedValue")
    || hasOwn(input, "expected");
  if (type === "window_call_until" || type === "tap_until") {
    if (!untilPath) {
      throw new Error(`target.setup_actions[${index}] ${type} requires until_path.`);
    }
    if (!hasUntilExpectedValue) {
      throw new Error(`target.setup_actions[${index}] ${type} requires until_expected_value.`);
    }
  }
  const maxCalls = numberValue(valueFromOwn(input, "max_calls", "maxCalls", "max_attempts", "maxAttempts", "attempts", "max_taps", "maxTaps", "tap_limit", "tapLimit"));
  if ((type === "window_call_until" || type === "tap_until") && (maxCalls === undefined || !Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 100)) {
    throw new Error(`target.setup_actions[${index}].max_calls must be an integer from 1 to 100.`);
  }
  const tapBurstSize = type === "tap_until"
    ? numberValue(valueFromOwn(input, "tap_burst_size", "tapBurstSize", "burst_size", "burstSize", "check_every_taps", "checkEveryTaps", "predicate_interval_taps", "predicateIntervalTaps"))
    : undefined;
  if (type === "tap_until" && tapBurstSize !== undefined && (!Number.isInteger(tapBurstSize) || tapBurstSize < 1 || tapBurstSize > 100)) {
    throw new Error(`target.setup_actions[${index}].tap_burst_size must be an integer from 1 to 100.`);
  }
  const settleMs = type === "tap_until"
    ? numberValue(valueFromOwn(input, "settle_ms", "settleMs", "predicate_settle_ms", "predicateSettleMs", "post_burst_wait_ms", "postBurstWaitMs", "after_burst_ms", "afterBurstMs", "settle_after_tap_ms", "settleAfterTapMs"))
    : undefined;
  if (type === "tap_until" && settleMs !== undefined && (!Number.isInteger(settleMs) || settleMs < 0 || settleMs > 10000)) {
    throw new Error(`target.setup_actions[${index}].settle_ms must be an integer from 0 to 10000.`);
  }
  const intervalMs = numberValue(valueFromOwn(input, "interval_ms", "intervalMs", "poll_ms", "pollMs", "call_interval_ms", "callIntervalMs"));
  if ((type === "window_call_until" || type === "tap_until") && intervalMs !== undefined && (!Number.isInteger(intervalMs) || intervalMs < 0 || intervalMs > 5000)) {
    throw new Error(`target.setup_actions[${index}].interval_ms must be an integer from 0 to 5000.`);
  }
  const steps = numberValue(input.steps);
  if (type === "drag" && steps !== undefined && (!Number.isInteger(steps) || steps < 1 || steps > 100)) {
    throw new Error(`target.setup_actions[${index}].steps must be an integer from 1 to 100.`);
  }
  return {
    type,
    selector,
    frame_selector: frameSelector,
    frame_index: frameIndex,
    full_page: normalizeSetupActionScreenshotFullPage(input, type, index),
    force: type === "click" && (
      input.force === true
      || input.force_click === true
      || input.forceClick === true
    ),
    fallback_to_tap: type === "click" && (
      input.fallback_to_tap === true
      || input.fallbackToTap === true
      || input.fallback_to_pointer_tap === true
      || input.fallbackToPointerTap === true
      || input.pointer_fallback === true
      || input.pointerFallback === true
    ) || undefined,
    click_count: normalizeSetupActionClickCount(input, type, index),
    coordinate_mode: coordinateMode,
    pointer_type: pointerType,
    from_x: fromX,
    from_y: fromY,
    to_x: toX,
    to_y: toY,
    duration_ms: durationMs,
    steps,
    key,
    hold_ms: holdMs,
    value,
    value_json: hasJsonValue ? toJsonValue(input.value_json ?? input.valueJson ?? input.json) : undefined,
    random_queue: randomQueue,
    now: deterministicNow,
    advance_ms: deterministicAdvanceMs,
    append: deterministicAppend || undefined,
    restore: deterministicRestore || undefined,
    label: stringFromOwn(input, "label", "name", "screenshot_label", "screenshotLabel"),
    script,
    path,
    args,
    expect_return: hasExpectedReturn ? toJsonValue(valueFromOwn(input, "expect_return", "expectReturn", "expected_return", "expectedReturn")) : undefined,
    store_return_to: storeReturnTo,
    capture_return: captureReturn,
    return_summary_fields: normalizeReturnSummaryFields(input, index),
    compare_to: stringFromOwn(input, "compare_to", "compareTo", "previous_signature_path", "previousSignaturePath", "previous_path", "previousPath", "changed_from", "changedFrom"),
    expect_changed: booleanValue(valueFromOwn(input, "expect_changed", "expectChanged", "should_change", "shouldChange", "changed")),
    until_path: untilPath,
    until_expected_value: hasUntilExpectedValue ? toJsonValue(valueFromOwn(input, "until_expected_value", "untilExpectedValue", "until_expected", "untilExpected", "until_value", "untilValue", "expected_value", "expectedValue", "expected")) : undefined,
    expected_path: stringFromOwn(input, "expected_path", "expectedPath", "expected_terminal_path", "expectedTerminalPath"),
    expected_url: stringFromOwn(input, "expected_url", "expectedUrl", "expected_terminal_url", "expectedTerminalUrl"),
    max_calls: maxCalls,
    tap_burst_size: tapBurstSize,
    settle_ms: settleMs,
    interval_ms: intervalMs,
    expected_value: hasExpectedValue ? toJsonValue(rawExpectedValue) : undefined,
    min_value: minValue,
    max_value: maxValue,
    text: stringValue(input.text),
    pattern: stringValue(input.pattern),
    flags: stringValue(input.flags),
    accept: dialogAccept,
    prompt_text: stringFromOwn(input, "prompt_text", "promptText", "prompt_value", "promptValue"),
    message_text: stringFromOwn(input, "message_text", "messageText", "dialog_text", "dialogText"),
    message_pattern: stringFromOwn(input, "message_pattern", "messagePattern", "dialog_pattern", "dialogPattern"),
    index: numberValue(valueFromOwn(input, "index", "target_index", "targetIndex")),
    expected_count: expectedCount,
    ms: numberValue(input.ms) ?? numberValue(input.wait_ms) ?? numberValue(input.waitMs),
    timeout_ms: numberValue(input.timeout_ms) ?? numberValue(input.timeoutMs),
    after_ms: numberValue(input.after_ms) ?? numberValue(input.afterMs),
    repeat: normalizeSetupActionRepeat(input, index),
    reload: input.reload === true,
    storage: normalizeSetupActionStorage(input.storage, index),
    viewports: normalizeStringList(input.viewports ?? input.viewport_names ?? input.viewportNames, `target.setup_actions[${index}] viewports`),
    optional: input.optional === true || input.required === false,
    continue_on_failure: input.continue_on_failure === true || input.continueOnFailure === true,
  };
}

function normalizeSetupActions(value: unknown): RiddleProofProfileSetupAction[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("target.setup_actions must be an array.");
  return value.map(normalizeSetupAction);
}

function normalizeTargetScreenshotFullPage(input: Record<string, unknown>): boolean | undefined {
  const directFullPage = booleanValue(valueFromOwn(
    input,
    "screenshot_full_page",
    "screenshotFullPage",
    "final_screenshot_full_page",
    "finalScreenshotFullPage",
    "full_page_screenshots",
    "fullPageScreenshots",
  ));
  const viewportOnly = booleanValue(valueFromOwn(
    input,
    "viewport_screenshots",
    "viewportScreenshots",
    "viewport_only_screenshots",
    "viewportOnlyScreenshots",
  ));
  const modeInput = stringFromOwn(input, "screenshot_mode", "screenshotMode", "final_screenshot_mode", "finalScreenshotMode");
  let modeFullPage: boolean | undefined;
  if (modeInput) {
    const mode = modeInput.trim().toLowerCase().replace(/[-\s]+/g, "_");
    if (mode === "full_page" || mode === "fullpage" || mode === "page" || mode === "document") {
      modeFullPage = true;
    } else if (mode === "viewport" || mode === "view") {
      modeFullPage = false;
    } else {
      throw new Error(`target.screenshot_mode ${modeInput} is not supported. Supported modes: full_page, viewport.`);
    }
  }
  const values = [directFullPage, viewportOnly === undefined ? undefined : !viewportOnly, modeFullPage]
    .filter((value): value is boolean => value !== undefined);
  if (!values.length) return undefined;
  if (values.some((value) => value !== values[0])) {
    throw new Error("target has conflicting screenshot full_page / viewport mode options.");
  }
  return values[0];
}

function normalizeNetworkMock(input: unknown, index: number): RiddleProofProfileNetworkMock {
  if (!isRecord(input)) throw new Error(`target.network_mocks[${index}] must be an object.`);
  const url = stringValue(input.url) || stringValue(input.glob) || stringValue(input.pattern);
  if (!url) throw new Error(`target.network_mocks[${index}] requires url.`);
  const payload = normalizeNetworkMockResponsePayload(input, `target.network_mocks[${index}]`);
  const responsesInput = input.responses ?? input.sequence;
  const responses = normalizeNetworkMockResponses(responsesInput, index, payload);
  const requestBody = normalizeNetworkMockRequestBodyConstraints(input, `target.network_mocks[${index}]`);
  const requiredHitCount = numberValue(
    input.required_hit_count
    ?? input.requiredHitCount
    ?? input.required_hits
    ?? input.requiredHits
    ?? input.min_hits
    ?? input.minHits,
  );
  if (requiredHitCount !== undefined && (!Number.isInteger(requiredHitCount) || requiredHitCount < 1)) {
    throw new Error(`target.network_mocks[${index}].required_hit_count must be a positive integer.`);
  }
  const forbidden = input.forbidden === true
    || input.must_not_hit === true
    || input.mustNotHit === true
    || input.should_not_run === true
    || input.shouldNotRun === true;
  const configuredMaxHitCount = numberValue(
    input.max_hit_count
    ?? input.maxHitCount
    ?? input.max_hits
    ?? input.maxHits,
  );
  if (configuredMaxHitCount !== undefined && (!Number.isInteger(configuredMaxHitCount) || configuredMaxHitCount < 0)) {
    throw new Error(`target.network_mocks[${index}].max_hit_count must be a non-negative integer.`);
  }
  if (forbidden && configuredMaxHitCount !== undefined && configuredMaxHitCount !== 0) {
    throw new Error(`target.network_mocks[${index}].forbidden cannot be combined with max_hit_count greater than 0.`);
  }
  const maxHitCount = forbidden ? 0 : configuredMaxHitCount;
  const required = input.required === false || (maxHitCount === 0 && input.required !== true) ? false : true;
  const effectiveRequiredHitCount = required
    ? requiredHitCount ?? (Array.isArray(responses) && responses.length ? responses.length : 1)
    : 0;
  if (maxHitCount !== undefined && effectiveRequiredHitCount > maxHitCount) {
    throw new Error(`target.network_mocks[${index}].max_hit_count cannot be less than its required hit count.`);
  }
  const sequenceScopeInput = stringValue(
    input.sequence_scope
    ?? input.sequenceScope
    ?? input.response_sequence_scope
    ?? input.responseSequenceScope,
  );
  let sequenceScope: "global" | "viewport" | undefined;
  if (sequenceScopeInput) {
    const normalizedScope = sequenceScopeInput.toLowerCase().replace(/[-\s]+/g, "_");
    if (normalizedScope === "global" || normalizedScope === "profile" || normalizedScope === "run") {
      sequenceScope = "global";
    } else if (normalizedScope === "viewport" || normalizedScope === "per_viewport" || normalizedScope === "viewport_scoped") {
      sequenceScope = "viewport";
    } else {
      throw new Error(`target.network_mocks[${index}].sequence_scope must be "global" or "viewport".`);
    }
  }
  return {
    ...payload,
    label: normalizeName(input.label || input.name, `network-mock-${index + 1}`),
    url,
    method: stringValue(input.method)?.toUpperCase(),
    responses,
    repeat_responses: input.repeat_responses === true
      || input.repeatResponses === true
      || input.cycle_responses === true
      || input.cycleResponses === true,
    sequence_scope: sequenceScope,
    required_hit_count: requiredHitCount,
    max_hit_count: maxHitCount,
    forbidden,
    required,
    capture_request_body: requestBody.capture_request_body,
    request_body_contains: requestBody.request_body_contains,
    request_body_patterns: requestBody.request_body_patterns,
    request_body_not_contains: requestBody.request_body_not_contains,
    request_body_not_patterns: requestBody.request_body_not_patterns,
  };
}

function normalizeNetworkMockRequestBodyConstraints(
  input: Record<string, unknown>,
  label: string,
): Pick<
  RiddleProofProfileNetworkMockResponse,
  | "capture_request_body"
  | "request_body_contains"
  | "request_body_patterns"
  | "request_body_not_contains"
  | "request_body_not_patterns"
> {
  const requestBodyContains = normalizeStringList(
    input.request_body_contains
    ?? input.requestBodyContains
    ?? input.body_contains
    ?? input.bodyContains,
    `${label}.request_body_contains`,
  );
  const requestBodyPatterns = normalizeStringList(
    input.request_body_patterns
    ?? input.requestBodyPatterns
    ?? input.body_patterns
    ?? input.bodyPatterns,
    `${label}.request_body_patterns`,
  );
  validateRegexPatterns(requestBodyPatterns, `${label}.request_body_patterns`);
  const requestBodyNotContains = normalizeStringList(
    input.request_body_not_contains
    ?? input.requestBodyNotContains
    ?? input.request_body_absent
    ?? input.requestBodyAbsent
    ?? input.body_not_contains
    ?? input.bodyNotContains
    ?? input.body_absent
    ?? input.bodyAbsent,
    `${label}.request_body_not_contains`,
  );
  const requestBodyNotPatterns = normalizeStringList(
    input.request_body_not_patterns
    ?? input.requestBodyNotPatterns
    ?? input.request_body_forbidden_patterns
    ?? input.requestBodyForbiddenPatterns
    ?? input.body_not_patterns
    ?? input.bodyNotPatterns
    ?? input.body_forbidden_patterns
    ?? input.bodyForbiddenPatterns,
    `${label}.request_body_not_patterns`,
  );
  validateRegexPatterns(requestBodyNotPatterns, `${label}.request_body_not_patterns`);
  return {
    capture_request_body: input.capture_request_body === true
      || input.captureRequestBody === true
      || Boolean(requestBodyContains?.length)
      || Boolean(requestBodyPatterns?.length)
      || Boolean(requestBodyNotContains?.length)
      || Boolean(requestBodyNotPatterns?.length),
    request_body_contains: requestBodyContains,
    request_body_patterns: requestBodyPatterns,
    request_body_not_contains: requestBodyNotContains,
    request_body_not_patterns: requestBodyNotPatterns,
  };
}

function normalizeNetworkMockResponsePayload(
  input: Record<string, unknown>,
  label: string,
  defaults: Partial<RiddleProofProfileNetworkMockResponse> = {},
): RiddleProofProfileNetworkMockResponse {
  const status = numberValue(input.status) ?? defaults.status ?? 200;
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new Error(`${label}.status must be an HTTP status code.`);
  }
  const body = stringValue(input.body) ?? stringValue(input.body_text) ?? stringValue(input.bodyText) ?? defaults.body;
  const hasJsonBody = Object.prototype.hasOwnProperty.call(input, "body_json")
    || Object.prototype.hasOwnProperty.call(input, "bodyJson")
    || Object.prototype.hasOwnProperty.call(input, "json");
  const requestBody = normalizeNetworkMockRequestBodyConstraints(input, label);
  const abort = normalizeNetworkMockAbort(input, label, defaults.abort, defaults.abort_error_code);
  return {
    label: stringValue(input.label) || stringValue(input.name) || defaults.label,
    status,
    content_type: stringValue(input.content_type) || stringValue(input.contentType) || defaults.content_type,
    headers: stringRecord(input.headers) || defaults.headers,
    body,
    body_json: hasJsonBody ? toJsonValue(input.body_json ?? input.bodyJson ?? input.json) : defaults.body_json,
    delay_ms: normalizeNetworkMockDelay(input, label, defaults.delay_ms),
    abort: abort.abort,
    abort_error_code: abort.abort_error_code,
    capture_request_body: requestBody.capture_request_body,
    request_body_contains: requestBody.request_body_contains,
    request_body_patterns: requestBody.request_body_patterns,
    request_body_not_contains: requestBody.request_body_not_contains,
    request_body_not_patterns: requestBody.request_body_not_patterns,
  };
}

function normalizeNetworkMockAbort(
  input: Record<string, unknown>,
  label: string,
  defaultAbort?: boolean,
  defaultErrorCode?: RiddleProofProfileNetworkAbortErrorCode,
): Pick<RiddleProofProfileNetworkMockResponse, "abort" | "abort_error_code"> {
  const abortInput = input.abort ?? input.route_abort ?? input.routeAbort;
  const explicitAbort = typeof abortInput === "string"
    ? abortInput.trim().length > 0
    : abortInput === true;
  const abort = explicitAbort || defaultAbort === true;
  if (!abort) return {};

  const codeInput = stringValue(
    typeof abortInput === "string"
      ? abortInput
      : input.abort_error_code
        ?? input.abortErrorCode
        ?? input.abort_error
        ?? input.abortError
        ?? input.network_error
        ?? input.networkError,
  ) || defaultErrorCode || "failed";
  const abort_error_code = codeInput.toLowerCase() as RiddleProofProfileNetworkAbortErrorCode;
  if (!RIDDLE_PROOF_PROFILE_NETWORK_ABORT_ERROR_CODES.includes(abort_error_code)) {
    throw new Error(`${label}.abort_error_code must be one of ${RIDDLE_PROOF_PROFILE_NETWORK_ABORT_ERROR_CODES.join(", ")}.`);
  }
  return { abort: true, abort_error_code };
}

function normalizeNetworkMockDelay(
  input: Record<string, unknown>,
  label: string,
  defaultValue?: number,
): number | undefined {
  const value = numberValue(
    input.delay_ms
    ?? input.delayMs
    ?? input.wait_ms
    ?? input.waitMs
    ?? input.latency_ms
    ?? input.latencyMs,
  ) ?? defaultValue;
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0 || value > 60000) {
    throw new Error(`${label}.delay_ms must be an integer from 0 to 60000.`);
  }
  return value;
}

function normalizeNetworkMockResponses(
  value: unknown,
  mockIndex: number,
  defaults: RiddleProofProfileNetworkMockResponse,
): RiddleProofProfileNetworkMockResponse[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`target.network_mocks[${mockIndex}].responses must be an array.`);
  if (!value.length) throw new Error(`target.network_mocks[${mockIndex}].responses must not be empty.`);
  const responseDefaults: Partial<RiddleProofProfileNetworkMockResponse> = {
    label: undefined,
    status: defaults.status,
    content_type: defaults.content_type,
    headers: defaults.headers,
    body: defaults.body,
    body_json: defaults.body_json,
    delay_ms: defaults.delay_ms,
    abort: defaults.abort,
    abort_error_code: defaults.abort_error_code,
  };
  return value.map((response, responseIndex) => {
    if (!isRecord(response)) {
      throw new Error(`target.network_mocks[${mockIndex}].responses[${responseIndex}] must be an object.`);
    }
    return normalizeNetworkMockResponsePayload(
      response,
      `target.network_mocks[${mockIndex}].responses[${responseIndex}]`,
      responseDefaults,
    );
  });
}

function normalizeNetworkMocks(value: unknown): RiddleProofProfileNetworkMock[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("target.network_mocks must be an array.");
  return value.map(normalizeNetworkMock);
}

function profileStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function responseHasRequestBodyContract(response: RiddleProofProfileNetworkMockResponse | undefined): boolean {
  if (!response) return false;
  return profileStringList(response.request_body_contains).length > 0
    || profileStringList(response.request_body_patterns).length > 0
    || profileStringList(response.request_body_not_contains).length > 0
    || profileStringList(response.request_body_not_patterns).length > 0;
}

function responseHasOnlyPositiveTextSelector(response: RiddleProofProfileNetworkMockResponse | undefined): boolean {
  if (!response) return false;
  return profileStringList(response.request_body_contains).length > 0
    && profileStringList(response.request_body_patterns).length === 0
    && profileStringList(response.request_body_not_contains).length === 0
    && profileStringList(response.request_body_not_patterns).length === 0;
}

function responseMayShadowLaterRequestBodyMatch(
  earlier: RiddleProofProfileNetworkMockResponse,
  later: RiddleProofProfileNetworkMockResponse,
): boolean {
  if (!responseHasOnlyPositiveTextSelector(earlier) || !responseHasRequestBodyContract(later)) return false;
  const earlierContains = profileStringList(earlier.request_body_contains);
  const laterContains = profileStringList(later.request_body_contains);
  if (!laterContains.length) return false;
  return earlierContains.every((fragment) => laterContains.includes(fragment));
}

function responseLabel(response: RiddleProofProfileNetworkMockResponse, index: number): string {
  return response.label ? `"${response.label}"` : `responses[${index}]`;
}

export function collectRiddleProofProfileWarnings(profile: RiddleProofProfile): string[] {
  const warnings: string[] = [];
  for (const [mockIndex, mock] of (profile.target.network_mocks || []).entries()) {
    const responses = Array.isArray(mock.responses) ? mock.responses : [];
    if (responses.length < 2) continue;
    for (let laterIndex = 1; laterIndex < responses.length; laterIndex += 1) {
      const later = responses[laterIndex];
      if (!responseHasRequestBodyContract(later)) continue;
      for (let earlierIndex = 0; earlierIndex < laterIndex; earlierIndex += 1) {
        const earlier = responses[earlierIndex];
        if (!responseMayShadowLaterRequestBodyMatch(earlier, later)) continue;
        const mockLabel = mock.label ? ` (${mock.label})` : "";
        warnings.push(
          `target.network_mocks[${mockIndex}]${mockLabel} ${responseLabel(earlier, earlierIndex)} can shadow ${responseLabel(later, laterIndex)} because the earlier request_body_contains fragments are a subset of the later response and have no negative or pattern disambiguator. First matching request-body response wins.`,
        );
        break;
      }
    }
  }
  return warnings;
}

function profileStatusProbeCounts(profile: RiddleProofProfile): { httpStatus: number; linkStatus: number } {
  let httpStatus = 0;
  let linkStatus = 0;
  for (const check of profile.checks || []) {
    if (check.type === "http_status") httpStatus += 1;
    if (check.type === "link_status" || check.type === "artifact_link_status") linkStatus += 1;
  }
  return { httpStatus, linkStatus };
}

function riddleApiStrictSafetyWarnings(blocker: Record<string, JsonValue> | undefined): string[] {
  const rawWarnings = Array.isArray(blocker?.warnings)
    ? blocker.warnings.filter((warning): warning is string => typeof warning === "string")
    : [];
  const errorText = typeof blocker?.error === "string" ? blocker.error.toLowerCase() : "";
  const hasSafetyError = errorText.includes("potentially unsafe operations");
  const hasDirectNetworkWarning = rawWarnings.some((warning) => warning.toLowerCase().includes("direct network operations"));
  return hasSafetyError || hasDirectNetworkWarning ? rawWarnings : [];
}

function collectRiddleProofProfileEnvironmentBlockedWarnings(
  profile: RiddleProofProfile,
  blocker: Record<string, JsonValue> | undefined,
): string[] {
  const warnings = collectRiddleProofProfileWarnings(profile);
  const safetyWarnings = riddleApiStrictSafetyWarnings(blocker);
  if (!safetyWarnings.length) return warnings;

  const counts = profileStatusProbeCounts(profile);
  const statusProbeCount = counts.httpStatus + counts.linkStatus;
  if (!statusProbeCount) return warnings;

  const parts = [
    counts.httpStatus ? `${counts.httpStatus} http_status` : "",
    counts.linkStatus ? `${counts.linkStatus} link_status/artifact_link_status` : "",
  ].filter(Boolean);
  warnings.push(
    `Riddle API strict script validation blocked a hosted profile runner with ${parts.join(" and ")} check(s). These checks intentionally collect endpoint/link evidence from inside the generated browser runner; hosted run-profile defaults to --strict=false, so omit --strict=true or rerun with --strict=false for trusted generated profile runs.`,
  );
  return warnings;
}

function normalizeRouteInventoryPath(value: unknown, label: string): string {
  const path = stringValue(value);
  if (!path) throw new Error(`${label} requires path.`);
  if (!path.startsWith("/")) throw new Error(`${label}.path must start with /.`);
  return normalizeRoutePath(path);
}

function normalizeRouteInventoryRoute(input: unknown, index: number): RiddleProofProfileRouteInventoryRoute {
  if (typeof input === "string") return { path: normalizeRouteInventoryPath(input, `checks route_inventory expected_routes[${index}]`) };
  if (!isRecord(input)) throw new Error(`checks route_inventory expected_routes[${index}] must be a string or object.`);
  return {
    name: stringValue(input.name),
    path: normalizeRouteInventoryPath(input.path, `checks route_inventory expected_routes[${index}]`),
  };
}

function normalizeRouteInventoryRoutes(value: unknown, index: number): RiddleProofProfileRouteInventoryRoute[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`checks[${index}] route_inventory expected_routes must be a non-empty array.`);
  }
  const routes = value.map(normalizeRouteInventoryRoute);
  const seen = new Set<string>();
  for (const route of routes) {
    if (seen.has(route.path)) throw new Error(`checks[${index}] route_inventory expected_routes contains duplicate path ${route.path}.`);
    seen.add(route.path);
  }
  return routes;
}

function normalizeExpectedTexts(value: unknown, index: number): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`checks[${index}] selector_text_order expected_texts must be a non-empty array.`);
  }
  const texts = value.map((item) => String(item).replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!texts.length) throw new Error(`checks[${index}] selector_text_order expected_texts must contain non-empty strings.`);
  return texts;
}

function normalizeStringList(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  const values = value.map((item) => String(item).replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!values.length) throw new Error(`${label} must contain non-empty strings.`);
  return values;
}

function normalizeHttpStatus(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  const status = numberValue(value);
  if (status === undefined || !Number.isInteger(status) || status < 100 || status > 599) {
    throw new Error(`${label} must be an HTTP status code.`);
  }
  return status;
}

function normalizeHttpStatuses(value: unknown, label: string): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  if (!value.length) throw new Error(`${label} must not be empty.`);
  const statuses = value.map((item, index) => normalizeHttpStatus(item, `${label}[${index}]`) as number);
  return Array.from(new Set(statuses));
}

function normalizePositiveInteger(value: unknown, label: string, max?: number): number | undefined {
  if (value === undefined) return undefined;
  const number = numberValue(value);
  if (number === undefined || !Number.isInteger(number) || number < 1 || (max !== undefined && number > max)) {
    throw new Error(`${label} must be an integer from 1 to ${max ?? "unbounded"}.`);
  }
  return number;
}

function validateRegexPatterns(patterns: string[] | undefined, label: string): void {
  for (const pattern of patterns || []) {
    try {
      new RegExp(pattern);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${label} contains invalid regex ${JSON.stringify(pattern)}: ${message}`);
    }
  }
}

function normalizeHttpStatusBodyJsonAssertions(
  value: unknown,
  label: string,
): RiddleProofProfileHttpStatusBodyJsonAssertion[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  if (!value.length) throw new Error(`${label} must not be empty.`);
  return value.map((item, index) => {
    const itemLabel = `${label}[${index}]`;
    if (typeof item === "string") {
      const path = stringValue(item);
      if (!path) throw new Error(`${itemLabel} path must not be empty.`);
      return { path, exists: true };
    }
    if (!isRecord(item)) throw new Error(`${itemLabel} must be an object or JSON path string.`);
    const path = stringFromOwn(item, "path", "json_path", "jsonPath", "key");
    if (!path) throw new Error(`${itemLabel}.path is required.`);

    const assertion: RiddleProofProfileHttpStatusBodyJsonAssertion = {
      label: stringValue(item.label),
      path,
    };
    const exists = booleanValue(valueFromOwn(item, "exists", "present"));
    if (exists !== undefined) assertion.exists = exists;

    const type = stringValue(valueFromOwn(item, "type", "value_type", "valueType"));
    if (type !== undefined) {
      const allowedTypes: RiddleProofProfileJsonValueType[] = ["array", "boolean", "null", "number", "object", "string"];
      if (!allowedTypes.includes(type as RiddleProofProfileJsonValueType)) {
        throw new Error(`${itemLabel}.type must be one of ${allowedTypes.join(", ")}.`);
      }
      assertion.type = type as RiddleProofProfileJsonValueType;
    }

    const equalsValue = valueFromOwn(item, "equals", "expected", "expected_value", "expectedValue", "value");
    if (equalsValue !== undefined) assertion.equals = toJsonValue(equalsValue);
    const notEqualsValue = valueFromOwn(item, "not_equals", "notEquals", "forbidden", "forbidden_value", "forbiddenValue");
    if (notEqualsValue !== undefined) assertion.not_equals = toJsonValue(notEqualsValue);
    const containsValue = valueFromOwn(item, "contains", "includes", "contains_value", "containsValue", "include");
    if (containsValue !== undefined) assertion.contains = toJsonValue(containsValue);

    if (
      assertion.exists === undefined
      && assertion.type === undefined
      && !hasOwn(assertion, "equals")
      && !hasOwn(assertion, "not_equals")
      && !hasOwn(assertion, "contains")
    ) {
      assertion.exists = true;
    }
    return assertion;
  });
}

function isDialogCountCheckType(type: string): boolean {
  return type === "dialog_count_equals"
    || type === "dialog_accept_count_equals"
    || type === "dialog_dismiss_count_equals";
}

function dialogCountFieldForCheckType(type: string): "dialog_count" | "dialog_accept_count" | "dialog_dismiss_count" {
  if (type === "dialog_accept_count_equals") return "dialog_accept_count";
  if (type === "dialog_dismiss_count_equals") return "dialog_dismiss_count";
  return "dialog_count";
}

function normalizeOrderedTraceEvents(value: unknown, label: string): RiddleProofOrderedTraceEvent[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.length) throw new Error(`${label} must be a non-empty array.`);
  const seenLabels = new Set<string>();
  return value.map((item, eventIndex) => {
    const eventLabel = `${label}[${eventIndex}]`;
    if (!isRecord(item)) throw new Error(`${eventLabel} must be an object.`);
    const name = stringFromOwn(item, "label", "name", "event");
    if (!name) throw new Error(`${eventLabel}.label is required.`);
    if (seenLabels.has(name)) throw new Error(`${eventLabel}.label must be unique.`);
    seenLabels.add(name);
    const predicatesInput = item.predicates ?? item.all ?? item.where;
    if (!Array.isArray(predicatesInput) || !predicatesInput.length) {
      throw new Error(`${eventLabel}.predicates must be a non-empty array.`);
    }
    const predicates = predicatesInput.map((predicateInput, predicateIndex): RiddleProofOrderedTracePredicate => {
      const predicateLabel = `${eventLabel}.predicates[${predicateIndex}]`;
      if (!isRecord(predicateInput)) throw new Error(`${predicateLabel} must be an object.`);
      const path = stringFromOwn(predicateInput, "path", "field", "key");
      if (!path) throw new Error(`${predicateLabel}.path is required.`);
      const op = stringFromOwn(predicateInput, "op", "operator") as RiddleProofOrderedTraceOperator | undefined;
      if (!op || !(RIDDLE_PROOF_ORDERED_TRACE_OPERATORS as readonly string[]).includes(op)) {
        throw new Error(`${predicateLabel}.op must be one of ${RIDDLE_PROOF_ORDERED_TRACE_OPERATORS.join(", ")}.`);
      }
      const requiresValue = !["exists", "truthy", "falsy"].includes(op);
      const hasValue = hasOwn(predicateInput, "value") || hasOwn(predicateInput, "expected");
      if (requiresValue && !hasValue) throw new Error(`${predicateLabel}.value is required for ${op}.`);
      const value = hasOwn(predicateInput, "value") ? predicateInput.value : predicateInput.expected;
      if (["gt", "gte", "lt", "lte", "abs_gt", "abs_gte", "abs_lt", "abs_lte"].includes(op)) {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          throw new Error(`${predicateLabel}.value must be a finite number for ${op}.`);
        }
        if (op.startsWith("abs_") && value < 0) {
          throw new Error(`${predicateLabel}.value must be non-negative for ${op}.`);
        }
      }
      return {
        path,
        op,
        value: requiresValue ? toJsonValue(value) : undefined,
      };
    });
    return { label: name, predicates };
  });
}

function normalizeCheck(input: unknown, index: number): RiddleProofProfileCheck {
  if (!isRecord(input)) throw new Error(`checks[${index}] must be an object.`);
  const type = stringValue(input.type);
  if (!type) throw new Error(`checks[${index}].type is required.`);
  if (!isSupportedCheckType(type)) {
    throw new Error(`checks[${index}].type ${type} is not supported. Supported checks: ${RIDDLE_PROOF_PROFILE_CHECK_TYPES.join(", ")}`);
  }
  const isDialogCountCheck = isDialogCountCheckType(type);
  if (
    (
      type === "selector_visible"
      || type === "selector_absent"
      || type === "selector_count_at_least"
      || type === "selector_count_equals"
      || type === "selector_count_equal"
      || type === "selector_count_eq"
      || type === "selector_text_visible"
      || type === "selector_text_absent"
      || (type === "observe_within" && !stringValue(input.text) && !stringValue(input.pattern))
    ) && !stringValue(input.selector)
  ) {
    throw new Error(`checks[${index}] ${type} requires selector.`);
  }
  if ((type === "frame_text_visible" || type === "frame_url_equals" || type === "frame_url_matches" || type === "frame_no_horizontal_overflow") && !stringValue(input.selector)) {
    throw new Error(`checks[${index}] ${type} requires selector.`);
  }
  if (type === "frame_text_visible" && !stringValue(input.text) && !stringValue(input.pattern)) {
    throw new Error(`checks[${index}] frame_text_visible requires text or pattern.`);
  }
  const expectedUrl = stringFromOwn(input, "expected_url", "expectedUrl", "url", "expected_value", "expectedValue", "value");
  if (type === "frame_url_equals" && expectedUrl === undefined) {
    throw new Error(`checks[${index}] frame_url_equals requires expected_url.`);
  }
  if (type === "frame_url_matches" && !stringValue(input.pattern)) {
    throw new Error(`checks[${index}] frame_url_matches requires pattern.`);
  }
  if (
    (
      type === "text_visible"
      || type === "text_absent"
      || type === "selector_text_visible"
      || type === "selector_text_absent"
    ) && !stringValue(input.text) && !stringValue(input.pattern)
  ) {
    throw new Error(`checks[${index}] ${type} requires text or pattern.`);
  }
  if ((type === "url_search_param_equals" || type === "url_search_param_absent") && !stringValue(input.param) && !stringValue(input.search_param) && !stringValue(input.searchParam) && !stringValue(input.key)) {
    throw new Error(`checks[${index}] ${type} requires param.`);
  }
  const expectedValue = stringFromOwn(input, "expected_value", "expectedValue", "value");
  if (type === "url_search_param_equals" && expectedValue === undefined) {
    throw new Error(`checks[${index}] url_search_param_equals requires expected_value.`);
  }
  const minCount = numberValue(input.min_count) ?? numberValue(input.minCount);
  if (type === "selector_count_at_least" && minCount === undefined) {
    throw new Error(`checks[${index}] selector_count_at_least requires min_count.`);
  }
  const expectedCount = numberValue(input.expected_count) ?? numberValue(input.expectedCount) ?? numberValue(input.count);
  if (
    (
      type === "selector_count_equals"
      || type === "selector_count_equal"
      || type === "selector_count_eq"
      || isDialogCountCheck
    ) && expectedCount === undefined
  ) {
    throw new Error(`checks[${index}] ${type} requires expected_count.`);
  }
  if (isDialogCountCheck && (expectedCount === undefined || !Number.isInteger(expectedCount) || expectedCount < 0)) {
    throw new Error(`checks[${index}] ${type} expected_count must be a non-negative integer.`);
  }
  const expectedTexts = normalizeExpectedTexts(input.expected_texts ?? input.expectedTexts, index);
  if (type === "selector_text_order") {
    if (!stringValue(input.selector)) throw new Error(`checks[${index}] selector_text_order requires selector.`);
    if (!expectedTexts?.length) throw new Error(`checks[${index}] selector_text_order requires expected_texts.`);
  }
  const setupActionLabel = stringFromOwn(input, "setup_action_label", "setupActionLabel", "source_action_label", "sourceActionLabel");
  const tracePath = stringFromOwn(input, "trace_path", "tracePath", "path");
  const orderedTraceEvents = normalizeOrderedTraceEvents(
    input.events ?? input.sequence ?? input.ordered_events ?? input.orderedEvents,
    `checks[${index}].events`,
  );
  if (type === "ordered_trace") {
    if (!setupActionLabel) throw new Error(`checks[${index}] ordered_trace requires setup_action_label.`);
    if (!tracePath) throw new Error(`checks[${index}] ordered_trace requires trace_path.`);
    if (!orderedTraceEvents?.length) throw new Error(`checks[${index}] ordered_trace requires events.`);
  }
  const expectedRoutes = normalizeRouteInventoryRoutes(input.expected_routes ?? input.expectedRoutes, index);
  if (type === "route_inventory" && !expectedRoutes?.length) {
    throw new Error(`checks[${index}] route_inventory requires expected_routes.`);
  }
  const isHttpStatusCheck = type === "http_status";
  const isLinkStatusCheck = type === "link_status" || type === "artifact_link_status";
  const isStatusCheck = isHttpStatusCheck || isLinkStatusCheck;
  const requestUrl = stringFromOwn(input, "url", "endpoint_url", "endpointUrl", "endpoint", "request_url", "requestUrl", "path");
  if (isHttpStatusCheck && !requestUrl) {
    throw new Error(`checks[${index}] http_status requires url.`);
  }
  const method = stringFromOwn(input, "method", "http_method", "httpMethod")?.toUpperCase();
  if (isHttpStatusCheck && method && !/^[A-Z]+$/.test(method)) {
    throw new Error(`checks[${index}] http_status method must contain only letters.`);
  }
  const hasBodyJson = hasOwn(input, "body_json") || hasOwn(input, "bodyJson") || hasOwn(input, "json");
  const expectedStatus = isStatusCheck
    ? normalizeHttpStatus(input.expected_status ?? input.expectedStatus ?? input.status, `checks[${index}] expected_status`)
    : undefined;
  const allowedStatuses = isStatusCheck
    ? normalizeHttpStatuses(
      input.allowed_statuses ?? input.allowedStatuses ?? input.expected_statuses ?? input.expectedStatuses,
      `checks[${index}] allowed_statuses`,
    )
    : undefined;
  const maxLinks = isLinkStatusCheck
    ? normalizePositiveInteger(input.max_links ?? input.maxLinks ?? input.limit, `checks[${index}] max_links`, 500)
    : undefined;
  const minBytes = isStatusCheck
    ? normalizePositiveInteger(input.min_bytes ?? input.minBytes ?? input.min_response_bytes ?? input.minResponseBytes, `checks[${index}] min_bytes`)
    : undefined;
  const expectedContentType = isStatusCheck
    ? stringValue(input.expected_content_type) || stringValue(input.expectedContentType) || stringValue(input.content_type) || stringValue(input.contentType)
    : undefined;
  const allowedContentTypes = isStatusCheck
    ? normalizeStringList(
      input.allowed_content_types ?? input.allowedContentTypes ?? input.expected_content_types ?? input.expectedContentTypes,
      `checks[${index}] allowed_content_types`,
    ) ?? (expectedContentType ? [expectedContentType] : undefined)
    : undefined;
  const bodyContains = isHttpStatusCheck
    ? normalizeStringList(
      input.body_contains
        ?? input.bodyContains
        ?? input.expected_body_contains
        ?? input.expectedBodyContains
        ?? input.response_body_contains
        ?? input.responseBodyContains
        ?? input.body_includes
        ?? input.bodyIncludes,
      `checks[${index}] body_contains`,
    )
    : undefined;
  const bodyNotContains = isHttpStatusCheck
    ? normalizeStringList(
      input.body_not_contains
        ?? input.bodyNotContains
        ?? input.expected_body_not_contains
        ?? input.expectedBodyNotContains
        ?? input.response_body_not_contains
        ?? input.responseBodyNotContains
        ?? input.body_absent
        ?? input.bodyAbsent,
      `checks[${index}] body_not_contains`,
    )
    : undefined;
  const bodyNotPatterns = isHttpStatusCheck
    ? normalizeStringList(
      input.body_not_patterns
        ?? input.bodyNotPatterns
        ?? input.expected_body_not_patterns
        ?? input.expectedBodyNotPatterns
        ?? input.response_body_not_patterns
        ?? input.responseBodyNotPatterns
        ?? input.body_forbidden_patterns
        ?? input.bodyForbiddenPatterns,
      `checks[${index}] body_not_patterns`,
    )
    : undefined;
  if (bodyNotPatterns?.length) validateRegexPatterns(bodyNotPatterns, `checks[${index}] body_not_patterns`);
  const bodyJsonAssertions = isHttpStatusCheck
    ? normalizeHttpStatusBodyJsonAssertions(
      input.body_json_assertions
        ?? input.bodyJsonAssertions
        ?? input.json_body_assertions
        ?? input.jsonBodyAssertions
        ?? input.json_assertions
        ?? input.jsonAssertions
        ?? input.response_json_assertions
        ?? input.responseJsonAssertions,
      `checks[${index}] body_json_assertions`,
    )
    : undefined;
  if (isLinkStatusCheck) {
    if (minCount !== undefined && (!Number.isInteger(minCount) || minCount < 0)) {
      throw new Error(`checks[${index}] ${type} min_count must be a non-negative integer.`);
    }
    if (expectedCount !== undefined && (!Number.isInteger(expectedCount) || expectedCount < 0)) {
      throw new Error(`checks[${index}] ${type} expected_count must be a non-negative integer.`);
    }
  }
  return {
    type,
    label: stringValue(input.label),
    expected_path: stringValue(input.expected_path),
    param: stringValue(input.param) || stringValue(input.search_param) || stringValue(input.searchParam) || stringValue(input.key),
    expected_value: expectedValue,
    expected_url: expectedUrl,
    expected_routes: expectedRoutes,
    selector: stringValue(input.selector),
    url: isHttpStatusCheck ? requestUrl : undefined,
    method: isHttpStatusCheck ? method || "GET" : undefined,
    headers: isHttpStatusCheck ? stringRecord(input.headers) : undefined,
    body: isHttpStatusCheck ? stringValue(input.body) : undefined,
    body_json: isHttpStatusCheck && hasBodyJson ? toJsonValue(input.body_json ?? input.bodyJson ?? input.json) : undefined,
    body_contains: bodyContains,
    body_not_contains: bodyNotContains,
    body_not_patterns: bodyNotPatterns,
    body_json_assertions: bodyJsonAssertions,
    expected_texts: expectedTexts,
    setup_action_label: type === "ordered_trace" ? setupActionLabel : undefined,
    trace_path: type === "ordered_trace" ? tracePath : undefined,
    events: type === "ordered_trace" ? orderedTraceEvents : undefined,
    link_selector: stringValue(input.link_selector) || stringValue(input.linkSelector),
    source_selector: stringValue(input.source_selector) || stringValue(input.sourceSelector),
    route_path_prefix: stringValue(input.route_path_prefix) || stringValue(input.routePathPrefix),
    route_ready_selector: stringValue(input.route_ready_selector) || stringValue(input.routeReadySelector),
    route_ready_text: stringValue(input.route_ready_text) || stringValue(input.routeReadyText),
    route_ready_pattern: stringValue(input.route_ready_pattern) || stringValue(input.routeReadyPattern),
    route_ready_flags: stringValue(input.route_ready_flags) || stringValue(input.routeReadyFlags),
    text: stringValue(input.text),
    pattern: stringValue(input.pattern),
    flags: stringValue(input.flags),
    viewports: normalizeStringList(input.viewports ?? input.viewport_names ?? input.viewportNames, `checks[${index}] viewports`),
    allowed_console_texts: normalizeStringList(input.allowed_console_texts ?? input.allowedConsoleTexts ?? input.allow_console_texts ?? input.allowConsoleTexts, `checks[${index}] allowed_console_texts`),
    allowed_console_patterns: normalizeStringList(input.allowed_console_patterns ?? input.allowedConsolePatterns ?? input.allow_console_patterns ?? input.allowConsolePatterns, `checks[${index}] allowed_console_patterns`),
    allowed_page_error_texts: normalizeStringList(input.allowed_page_error_texts ?? input.allowedPageErrorTexts ?? input.allow_page_error_texts ?? input.allowPageErrorTexts, `checks[${index}] allowed_page_error_texts`),
    allowed_page_error_patterns: normalizeStringList(input.allowed_page_error_patterns ?? input.allowedPageErrorPatterns ?? input.allow_page_error_patterns ?? input.allowPageErrorPatterns, `checks[${index}] allowed_page_error_patterns`),
    min_count: minCount,
    expected_count: expectedCount,
    expected_status: expectedStatus,
    allowed_statuses: allowedStatuses,
    max_links: maxLinks,
    same_origin_only: isLinkStatusCheck ? input.same_origin_only === true || input.sameOriginOnly === true : undefined,
    dedupe: isLinkStatusCheck ? input.dedupe === false ? false : true : undefined,
    require_nonzero_bytes: isStatusCheck ? input.require_nonzero_bytes === true || input.requireNonzeroBytes === true : undefined,
    min_bytes: minBytes,
    allowed_content_types: allowedContentTypes,
    allow_get_fallback: isLinkStatusCheck ? input.allow_get_fallback === false || input.allowGetFallback === false ? false : true : undefined,
    max_overflow_px: numberValue(input.max_overflow_px),
    timeout_ms: numberValue(input.timeout_ms) ?? numberValue(input.timeoutMs) ?? numberValue(input.within_ms) ?? numberValue(input.withinMs),
    run_direct_routes: input.run_direct_routes === false || input.runDirectRoutes === false ? false : true,
    run_clickthroughs: input.run_clickthroughs === false || input.runClickthroughs === false ? false : true,
    run_all_viewports: input.run_all_viewports === true || input.runAllViewports === true,
    require_unique_routes: input.require_unique_routes === false || input.requireUniqueRoutes === false ? false : true,
    allow_unexpected_routes: input.allow_unexpected_routes === true || input.allowUnexpectedRoutes === true,
    save_route_screenshots: input.save_route_screenshots === true || input.saveRouteScreenshots === true,
  };
}

function normalizeFailurePolicy(input: unknown): Partial<Record<RiddleProofProfileStatus, RiddleProofProfileFailureAction>> {
  const defaults: Partial<Record<RiddleProofProfileStatus, RiddleProofProfileFailureAction>> = {
    product_regression: "fail",
    proof_insufficient: "fail",
    environment_blocked: "neutral",
    configuration_error: "fail",
    needs_human_review: "fail",
  };
  if (!isRecord(input)) return defaults;
  const next = { ...defaults };
  for (const [key, value] of Object.entries(input)) {
    if (!(RIDDLE_PROOF_PROFILE_STATUSES as readonly string[]).includes(key)) continue;
    if (value === "fail" || value === "neutral" || value === "review") {
      next[key as RiddleProofProfileStatus] = value;
    }
  }
  return next;
}

export function normalizeRiddleProofProfile(
  input: unknown,
  options: NormalizeRiddleProofProfileOptions = {},
): RiddleProofProfile {
  if (!isRecord(input)) throw new Error("profile must be a JSON object.");
  const version = stringValue(input.version) || RIDDLE_PROOF_PROFILE_VERSION;
  if (version !== RIDDLE_PROOF_PROFILE_VERSION) {
    throw new Error(`Unsupported profile version ${version}. Expected ${RIDDLE_PROOF_PROFILE_VERSION}.`);
  }
  const targetInput = isRecord(input.target) ? input.target : {};
  const checks = Array.isArray(input.checks) ? input.checks.map(normalizeCheck) : [];
  if (!checks.length) throw new Error("profile.checks must contain at least one check.");
  const targetUrl = stringValue(options.url) || stringValue(targetInput.url);
  const route = stringValue(options.route) || stringValue(targetInput.route);
  if (!targetUrl && !route) throw new Error("profile.target requires url or route, or pass --url.");
  const setupActions = normalizeSetupActions(targetInput.setup_actions ?? targetInput.setupActions);
  for (const [index, check] of checks.entries()) {
    if (check.type !== "ordered_trace") continue;
    const matches = (setupActions || []).filter((action) => action.label === check.setup_action_label);
    if (matches.length !== 1) {
      throw new Error(`checks[${index}] ordered_trace setup_action_label must match exactly one target.setup_actions label.`);
    }
    if (!["window_eval", "window_call", "window_call_until"].includes(matches[0].type)) {
      throw new Error(`checks[${index}] ordered_trace source action must capture a window_eval, window_call, or window_call_until return.`);
    }
    if (matches[0].capture_return === false) {
      throw new Error(`checks[${index}] ordered_trace source action must not set capture_return to false.`);
    }
  }
  return {
    version: RIDDLE_PROOF_PROFILE_VERSION,
    name: normalizeName(input.name, "riddle-proof-profile"),
    target: {
      url: targetUrl,
      route,
      viewports: options.viewports?.length ? options.viewports : normalizeViewports(targetInput.viewports),
      auth: stringValue(targetInput.auth) || "none",
      timeout_sec: timeoutSecValue(targetInput.timeout_sec)
        ?? timeoutSecValue(targetInput.timeoutSec)
        ?? timeoutSecValue(targetInput.riddle_timeout_sec)
        ?? timeoutSecValue(targetInput.riddleTimeoutSec),
      wait_for_selector: stringValue(targetInput.wait_for_selector) || stringValue(targetInput.waitForSelector),
      wait_ms: numberValue(targetInput.wait_ms) ?? numberValue(targetInput.waitMs),
      screenshot_full_page: normalizeTargetScreenshotFullPage(targetInput),
      setup_actions: setupActions,
      network_mocks: normalizeNetworkMocks(targetInput.network_mocks ?? targetInput.networkMocks),
    },
    checks,
    artifacts: Array.isArray(input.artifacts)
      ? input.artifacts.map((item) => String(item)).filter(Boolean)
      : ["screenshot", "console", "dom_summary", "proof_json"],
    baseline_policy: (stringValue(input.baseline_policy) || stringValue(input.baselinePolicy) || "invariant_only") as RiddleProofProfileBaselinePolicy,
    failure_policy: normalizeFailurePolicy(input.failure_policy || input.failurePolicy),
    metadata: jsonRecord(input.metadata),
  };
}

export function resolveRiddleProofProfileTargetUrl(profile: RiddleProofProfile): string {
  const route = profile.target.route || "";
  const targetUrl = profile.target.url || "";
  if (targetUrl && route) return resolveRiddleProofProfileRouteUrl(targetUrl, route);
  if (/^https?:\/\//i.test(route)) return route;
  if (targetUrl) return targetUrl;
  throw new Error("profile target URL could not be resolved.");
}

export function resolveRiddleProofProfileTimeoutSec(
  profile: RiddleProofProfile,
  requestedTimeoutSec?: number,
): number | undefined {
  return timeoutSecValue(requestedTimeoutSec) ?? timeoutSecValue(profile.target.timeout_sec);
}

function routeForViewport(viewport: RiddleProofProfileViewportEvidence | undefined, targetUrl?: string): RiddleProofProfileRouteEvidence {
  if (viewport?.route) {
    return {
      ...viewport.route,
      matched: viewport.route.matched || routePathMatches(viewport.route.observed, viewport.route.expected_path, targetUrl),
    };
  }
  return {
    requested: "",
    observed: "",
    matched: false,
    error: "missing viewport evidence",
  };
}

function checkLabel(check: RiddleProofProfileCheck): string | undefined {
  return check.label || check.type;
}

function selectorKey(check: RiddleProofProfileCheck) {
  return check.selector || "";
}

function linkStatusSelector(check: RiddleProofProfileCheck) {
  return check.selector || check.link_selector || "a[href]";
}

function httpStatusRequestUrl(check: RiddleProofProfileCheck, baseUrl?: string): string {
  const rawUrl = check.url || "";
  if (!rawUrl) return "";
  try {
    if (baseUrl && rawUrl.startsWith("/") && !rawUrl.startsWith("//")) {
      const base = new URL(baseUrl);
      const mountPrefix = previewMountPrefix(base.pathname);
      if (mountPrefix) {
        const requested = new URL(rawUrl, base.origin);
        base.pathname = joinMountedRoutePath(mountPrefix, requested.pathname);
        base.search = requested.search;
        base.hash = requested.hash;
        return base.href;
      }
    }
    return baseUrl ? new URL(rawUrl, baseUrl).href : new URL(rawUrl).href;
  } catch {
    return rawUrl;
  }
}

function httpStatusMethod(check: RiddleProofProfileCheck): string {
  return (check.method || "GET").toUpperCase();
}

function httpStatusKey(check: RiddleProofProfileCheck, baseUrl?: string): string {
  return `${httpStatusMethod(check)} ${httpStatusRequestUrl(check, baseUrl)}`;
}

function httpStatusAllowedStatuses(check: RiddleProofProfileCheck): number[] | undefined {
  if (check.allowed_statuses?.length) return check.allowed_statuses;
  if (check.expected_status !== undefined) return [check.expected_status];
  return undefined;
}

function linkStatusAllowedStatuses(check: RiddleProofProfileCheck): number[] | undefined {
  return httpStatusAllowedStatuses(check);
}

function httpStatusIsAllowed(status: number | undefined, check: RiddleProofProfileCheck): boolean {
  if (status === undefined) return false;
  const allowed = httpStatusAllowedStatuses(check);
  return allowed?.length ? allowed.includes(status) : status >= 200 && status < 400;
}

function linkStatusObservedBytes(result: Record<string, unknown>): number | undefined {
  const bytes = numberValue(result.bytes);
  const contentLength = numberValue(result.content_length);
  return Math.max(bytes ?? 0, contentLength ?? 0) || undefined;
}

function normalizeLinkStatusContentType(value: string | undefined): string | undefined {
  const normalized = value?.split(";")[0]?.trim().toLowerCase();
  return normalized || undefined;
}

function linkStatusContentTypesMatch(actual: string | undefined, expected: string | undefined): boolean {
  if (!actual || !expected) return false;
  if (expected.endsWith("/*")) return actual.startsWith(expected.slice(0, -1));
  if (actual === expected) return true;
  const yamlTypes = new Set(["application/yaml", "application/x-yaml", "text/yaml", "text/x-yaml"]);
  return yamlTypes.has(actual) && yamlTypes.has(expected);
}

function linkStatusContentTypeOk(result: Record<string, unknown>, check: RiddleProofProfileCheck): boolean {
  const expected = check.allowed_content_types;
  if (!expected?.length) return true;
  const actual = normalizeLinkStatusContentType(stringValue(result.content_type));
  if (!actual) return false;
  return expected.some((contentType) => {
    const normalized = normalizeLinkStatusContentType(contentType);
    if (!normalized) return false;
    return linkStatusContentTypesMatch(actual, normalized);
  });
}

function httpStatusBodyContainsFailures(result: Record<string, unknown>, check: RiddleProofProfileCheck): string[] {
  const expected = check.body_contains?.filter(Boolean) ?? [];
  if (!expected.length) return [];
  const observed = isRecord(result.body_contains) ? result.body_contains : {};
  return expected.filter((text) => observed[text] !== true);
}

function httpStatusBodyNotContainsFailures(result: Record<string, unknown>, check: RiddleProofProfileCheck): string[] {
  const forbidden = check.body_not_contains?.filter(Boolean) ?? [];
  if (!forbidden.length) return [];
  const observed = isRecord(result.body_not_contains) ? result.body_not_contains : {};
  return forbidden.filter((text) => observed[text] !== false);
}

function httpStatusBodyNotPatternFailures(result: Record<string, unknown>, check: RiddleProofProfileCheck): string[] {
  const forbidden = check.body_not_patterns?.filter(Boolean) ?? [];
  if (!forbidden.length) return [];
  const observed = isRecord(result.body_not_patterns) ? result.body_not_patterns : {};
  return forbidden.filter((pattern) => observed[pattern] !== false);
}

function httpStatusBodyJsonAssertionFailures(
  result: Record<string, unknown>,
  check: RiddleProofProfileCheck,
): RiddleProofProfileHttpStatusBodyJsonAssertionResult[] {
  const expected = check.body_json_assertions?.filter((assertion) => assertion.path) ?? [];
  if (!expected.length) return [];
  if (!Array.isArray(result.body_json_assertions)) {
    return expected.map((assertion) => ({
      label: assertion.label || assertion.path,
      path: assertion.path,
      ok: false,
      exists: false,
      observed_type: "missing",
      errors: ["body_json_assertions evidence missing"],
    }));
  }
  return result.body_json_assertions
    .filter((assertion): assertion is RiddleProofProfileHttpStatusBodyJsonAssertionResult => (
      isRecord(assertion) && assertion.ok !== true
    ))
    .map((assertion) => ({
      label: stringValue(assertion.label) || stringValue(assertion.path) || "json assertion",
      path: stringValue(assertion.path) || "",
      ok: false,
      exists: assertion.exists === true,
      observed: hasOwn(assertion, "observed") ? toJsonValue(assertion.observed) : undefined,
      observed_sample: hasOwn(assertion, "observed_sample") ? toJsonValue(assertion.observed_sample) : undefined,
      observed_length: numberValue(assertion.observed_length),
      observed_key_count: numberValue(assertion.observed_key_count),
      observed_omitted_count: numberValue(assertion.observed_omitted_count),
      observed_type: (stringValue(assertion.observed_type) as RiddleProofProfileJsonValueType | "missing") || "missing",
      expected_exists: booleanValue(assertion.expected_exists),
      equals: hasOwn(assertion, "equals") ? toJsonValue(assertion.equals) : undefined,
      not_equals: hasOwn(assertion, "not_equals") ? toJsonValue(assertion.not_equals) : undefined,
      contains: hasOwn(assertion, "contains") ? toJsonValue(assertion.contains) : undefined,
      type: stringValue(assertion.type) as RiddleProofProfileJsonValueType | undefined,
      errors: Array.isArray(assertion.errors) ? assertion.errors.map(String) : undefined,
    }));
}

function linkStatusResultOk(result: Record<string, unknown>, check: RiddleProofProfileCheck): boolean {
  const status = numberValue(result.status);
  if (!httpStatusIsAllowed(status, check)) return false;
  if (stringValue(result.error)) return false;
  if (result.ok === false) return false;
  if (!linkStatusContentTypeOk(result, check)) return false;
  if (check.require_nonzero_bytes) {
    const observedBytes = linkStatusObservedBytes(result);
    if (observedBytes === undefined || observedBytes <= 0) return false;
  }
  if (check.min_bytes !== undefined) {
    const observedBytes = linkStatusObservedBytes(result);
    if (observedBytes === undefined || observedBytes < check.min_bytes) return false;
  }
  if (httpStatusBodyContainsFailures(result, check).length) return false;
  if (httpStatusBodyNotContainsFailures(result, check).length) return false;
  if (httpStatusBodyNotPatternFailures(result, check).length) return false;
  if (httpStatusBodyJsonAssertionFailures(result, check).length) return false;
  return true;
}

function httpStatusEvidenceForCheck(
  viewport: RiddleProofProfileViewportEvidence,
  check: RiddleProofProfileCheck,
): Record<string, unknown> | undefined {
  const evidence = viewport.http_statuses?.[httpStatusKey(check, viewport.url)];
  return isRecord(evidence) ? evidence : undefined;
}

function summarizeHttpStatusEvidence(
  viewport: RiddleProofProfileViewportEvidence,
  check: RiddleProofProfileCheck,
): Record<string, unknown> {
  const key = httpStatusKey(check, viewport.url);
  const statusEvidence = httpStatusEvidenceForCheck(viewport, check);
  if (!statusEvidence) {
    return {
      viewport: viewport.name,
      key,
      url: httpStatusRequestUrl(check, viewport.url),
      method: httpStatusMethod(check),
      ok: false,
      status: null,
      failures: [{ code: "http_status_evidence_missing" }],
    };
  }
  const failures: Array<Record<string, unknown>> = [];
  const bodyContainsMissing = httpStatusBodyContainsFailures(statusEvidence, check);
  const bodyNotContainsFound = httpStatusBodyNotContainsFailures(statusEvidence, check);
  const bodyNotPatternsFound = httpStatusBodyNotPatternFailures(statusEvidence, check);
  const bodyJsonAssertionsFailed = httpStatusBodyJsonAssertionFailures(statusEvidence, check);
  if (!linkStatusResultOk(statusEvidence, check)) {
    failures.push({
      code: "http_status_failed",
      url: stringValue(statusEvidence.url) ?? httpStatusRequestUrl(check, viewport.url),
      status: numberValue(statusEvidence.status) ?? null,
      method: stringValue(statusEvidence.method) ?? httpStatusMethod(check),
      error: stringValue(statusEvidence.error) ?? null,
      content_type: stringValue(statusEvidence.content_type) ?? null,
      bytes: linkStatusObservedBytes(statusEvidence) ?? null,
      allowed_statuses: httpStatusAllowedStatuses(check) ?? ["2xx", "3xx"],
      min_bytes: check.min_bytes ?? null,
      allowed_content_types: check.allowed_content_types ?? null,
      body_contains: check.body_contains ?? null,
      body_contains_missing: bodyContainsMissing,
      body_not_contains: check.body_not_contains ?? null,
      body_not_contains_found: bodyNotContainsFound,
      body_not_patterns: check.body_not_patterns ?? null,
      body_not_patterns_found: bodyNotPatternsFound,
      body_json_assertions: check.body_json_assertions ?? null,
      body_json_assertions_failed: bodyJsonAssertionsFailed.map((assertion) => toJsonValue(assertion)),
      body_sample: stringValue(statusEvidence.body_sample) ?? null,
    });
  }
  return {
    viewport: viewport.name,
    key,
    url: stringValue(statusEvidence.url) ?? httpStatusRequestUrl(check, viewport.url),
    method: stringValue(statusEvidence.method) ?? httpStatusMethod(check),
    status: numberValue(statusEvidence.status) ?? null,
    status_text: stringValue(statusEvidence.status_text) ?? null,
    ok: failures.length === 0,
    error: stringValue(statusEvidence.error) ?? null,
    content_type: stringValue(statusEvidence.content_type) ?? null,
    content_length: numberValue(statusEvidence.content_length) ?? null,
    bytes: linkStatusObservedBytes(statusEvidence) ?? null,
    body_contains: isRecord(statusEvidence.body_contains) ? toJsonValue(statusEvidence.body_contains) : null,
    body_contains_missing: bodyContainsMissing,
    body_not_contains: isRecord(statusEvidence.body_not_contains) ? toJsonValue(statusEvidence.body_not_contains) : null,
    body_not_contains_found: bodyNotContainsFound,
    body_not_patterns: isRecord(statusEvidence.body_not_patterns) ? toJsonValue(statusEvidence.body_not_patterns) : null,
    body_not_patterns_found: bodyNotPatternsFound,
    body_json_assertions: Array.isArray(statusEvidence.body_json_assertions) ? toJsonValue(statusEvidence.body_json_assertions) : null,
    body_json_assertions_failed: bodyJsonAssertionsFailed.map((assertion) => toJsonValue(assertion)),
    body_sample: stringValue(statusEvidence.body_sample) ?? null,
    failures,
  };
}

function linkStatusEvidenceForCheck(
  viewport: RiddleProofProfileViewportEvidence,
  check: RiddleProofProfileCheck,
): Record<string, unknown> | undefined {
  const evidence = viewport.link_statuses?.[linkStatusSelector(check)];
  return isRecord(evidence) ? evidence : undefined;
}

function summarizeLinkStatusEvidence(
  viewport: RiddleProofProfileViewportEvidence,
  check: RiddleProofProfileCheck,
): Record<string, unknown> {
  const linkEvidence = linkStatusEvidenceForCheck(viewport, check);
  if (!linkEvidence) {
    return {
      viewport: viewport.name,
      selector: linkStatusSelector(check),
      total_count: 0,
      ok_count: 0,
      failed_count: 1,
      failures: [{ code: "link_status_evidence_missing" }],
    };
  }
  const results = Array.isArray(linkEvidence.results) ? linkEvidence.results.filter(isRecord) : [];
  const totalCount = numberValue(linkEvidence.total_count) ?? results.length;
  const resultCount = numberValue(linkEvidence.result_count) ?? totalCount;
  const storedResultCount = numberValue(linkEvidence.stored_result_count) ?? results.length;
  const omittedResultCount = numberValue(linkEvidence.omitted_result_count) ?? Math.max(0, resultCount - storedResultCount);
  const omittedSuccessCount = numberValue(linkEvidence.omitted_success_count) ?? 0;
  const okCount = results.filter((result) => linkStatusResultOk(result, check)).length;
  const failures: Array<Record<string, unknown>> = results
    .filter((result) => !linkStatusResultOk(result, check))
    .map((result) => ({
      code: "link_status_failed",
      url: stringValue(result.url) ?? null,
      status: numberValue(result.status) ?? null,
      method: stringValue(result.method) ?? null,
      error: stringValue(result.error) ?? null,
      content_type: stringValue(result.content_type) ?? null,
      bytes: linkStatusObservedBytes(result) ?? null,
      min_bytes: check.min_bytes ?? null,
      allowed_content_types: check.allowed_content_types ?? null,
    }));
  if (stringValue(linkEvidence.error)) {
    failures.push({ code: "link_status_capture_failed", error: stringValue(linkEvidence.error) ?? "" });
  }
  const recordedFailedCount = numberValue(linkEvidence.failed_count) ?? 0;
  if (!failures.length && recordedFailedCount > 0) {
    const recordedFailures = Array.isArray(linkEvidence.failures) ? linkEvidence.failures.slice(0, 20) : [];
    failures.push({
      code: "link_status_recorded_failures",
      failed_count: recordedFailedCount,
      failures: toJsonValue(recordedFailures),
    });
  }
  if (linkEvidence.truncated === true) {
    failures.push({
      code: "link_status_probe_truncated",
      discovered_count: numberValue(linkEvidence.discovered_count) ?? totalCount,
      max_links: numberValue(linkEvidence.max_links) ?? check.max_links ?? 100,
    });
  }
  if (check.expected_count !== undefined && totalCount !== check.expected_count) {
    failures.push({ code: "link_status_count_mismatch", expected: check.expected_count, actual: totalCount });
  }
  if (check.min_count !== undefined && totalCount < check.min_count) {
    failures.push({ code: "link_status_count_below_minimum", min_count: check.min_count, actual: totalCount });
  }
  const statusCounts = isRecord(linkEvidence.status_counts) ? linkEvidence.status_counts : {};
  return {
    viewport: viewport.name,
    selector: linkStatusSelector(check),
    total_count: totalCount,
    discovered_count: numberValue(linkEvidence.discovered_count) ?? totalCount,
    ok_count: numberValue(linkEvidence.ok_count) ?? okCount,
    failed_count: failures.length,
    truncated: linkEvidence.truncated === true,
    max_links: numberValue(linkEvidence.max_links) ?? check.max_links ?? 100,
    result_count: resultCount,
    stored_result_count: storedResultCount,
    omitted_result_count: omittedResultCount,
    omitted_success_count: omittedSuccessCount,
    results_compacted: linkEvidence.results_compacted === true || omittedResultCount > 0,
    min_bytes: check.min_bytes ?? null,
    allowed_content_types: check.allowed_content_types ?? null,
    status_counts: statusCounts,
    failures: failures.slice(0, 20),
  };
}

function textKey(check: RiddleProofProfileCheck) {
  return check.pattern ? `pattern:${check.pattern}/${check.flags || ""}` : `text:${check.text || ""}`;
}

function observeWithinTimeoutMs(check: RiddleProofProfileCheck) {
  const raw = check.timeout_ms;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.min(Math.round(raw), 60_000);
  return 2_000;
}

function observeWithinKey(check: RiddleProofProfileCheck) {
  const target = check.selector ? `selector:${check.selector}` : "page";
  const expectation = check.pattern
    ? `pattern:${check.pattern}/${check.flags || ""}`
    : check.text
      ? `text:${check.text}`
      : "visible";
  return `${target}|${expectation}|within:${observeWithinTimeoutMs(check)}`;
}

function textSequenceForCheck(viewport: RiddleProofProfileViewportEvidence, check: RiddleProofProfileCheck): string[] {
  const key = selectorKey(check);
  const sequence = viewport.text_sequences?.[key];
  if (isRecord(sequence)) {
    const visibleMatchTexts = Array.isArray(sequence.visible_match_texts) ? sequence.visible_match_texts : [];
    const matchTexts = Array.isArray(sequence.match_texts) ? sequence.match_texts : [];
    const visibleTexts = Array.isArray(sequence.visible_texts) ? sequence.visible_texts : [];
    const texts = Array.isArray(sequence.texts) ? sequence.texts : [];
    let candidates;
    if (check.type === "selector_text_visible") {
      candidates = visibleMatchTexts.length ? visibleMatchTexts : visibleTexts;
    } else if (check.type === "selector_text_absent") {
      candidates = matchTexts.length ? matchTexts : texts;
    } else {
      candidates = visibleMatchTexts.length ? visibleMatchTexts : matchTexts.length ? matchTexts : visibleTexts.length ? visibleTexts : texts;
    }
    return candidates.map((text) => String(text).replace(/\s+/g, " ").trim()).filter(Boolean);
  }
  return [];
}

function textOrderMatch(texts: string[], expectedTexts: string[]) {
  const positions: number[] = [];
  let startAt = 0;
  for (const expected of expectedTexts) {
    const index = texts.findIndex((text, offset) => offset >= startAt && text.includes(expected));
    if (index < 0) return { matched: false, positions };
    positions.push(index);
    startAt = index + 1;
  }
  return { matched: true, positions };
}

function frameEvidenceForSelector(viewport: RiddleProofProfileViewportEvidence, selector: string): Record<string, unknown>[] {
  const container = viewport.frames?.[selector];
  if (!isRecord(container)) return [];
  const frames: unknown[] = Array.isArray(container.frames) ? container.frames : [];
  return frames.filter((frame): frame is Record<string, unknown> => isRecord(frame));
}

function frameTextSample(frame: Record<string, unknown>): string {
  const parts = [
    frame.title,
    frame.text_sample,
    frame.body_text_sample,
    frame.body_text,
    frame.text,
  ];
  return parts.map((part) => String(part || "")).filter(Boolean).join(" ");
}

function summarizeRouteInventory(viewport: string, inventory: Record<string, unknown>) {
  const directRoutes = Array.isArray(inventory.direct_routes) ? inventory.direct_routes : [];
  const clickthroughs = Array.isArray(inventory.clickthroughs) ? inventory.clickthroughs : [];
  const sourceLinkCount = numberValue(inventory.source_link_count) ?? numberValue(inventory.home_game_link_count) ?? null;
  const sourceUniqueLinkCount = numberValue(inventory.source_unique_link_count) ?? numberValue(inventory.home_unique_game_link_count) ?? null;
  const sourceCandidateCount = numberValue(inventory.source_candidate_count);
  const sourceCandidateUniqueLinkCount = numberValue(inventory.source_candidate_unique_link_count);
  const sourceLinkScope = stringValue(inventory.source_link_scope);
  const duplicateSourceLinks = Array.isArray(inventory.duplicate_source_link_paths)
    ? inventory.duplicate_source_link_paths.map((path) => String(path))
    : [];
  const duplicateSourceLinkCount = numberValue(inventory.duplicate_source_link_count)
    ?? (sourceLinkCount !== null && sourceUniqueLinkCount !== null ? Math.max(0, sourceLinkCount - sourceUniqueLinkCount) : null);
  const failures = Array.isArray(inventory.failures) ? inventory.failures : [];
  return {
    viewport,
    source_link_scope: sourceLinkScope ?? null,
    source_candidate_count: sourceCandidateCount ?? sourceLinkCount,
    source_candidate_unique_link_count: sourceCandidateUniqueLinkCount ?? sourceUniqueLinkCount,
    source_link_count: sourceLinkCount,
    source_unique_link_count: sourceUniqueLinkCount,
    duplicate_source_link_count: duplicateSourceLinkCount,
    duplicate_source_links: duplicateSourceLinks,
    direct_route_count: directRoutes.length,
    clickthrough_count: clickthroughs.length,
    failure_count: failures.length,
  };
}

function routeInventoryExpectedRouteSummaries(value: unknown, fallback?: RiddleProofProfileRouteInventoryRoute[]) {
  const rawRoutes = Array.isArray(value) ? value : Array.isArray(fallback) ? fallback : [];
  return rawRoutes.map((route) => {
    if (typeof route === "string") {
      const path = route.trim();
      return path ? { path } : undefined;
    }
    if (!isRecord(route)) return undefined;
    const path = stringValue(route.path);
    if (!path) return undefined;
    const name = stringValue(route.name);
    return name ? { name, path } : { path };
  }).filter((route): route is { name?: string; path: string } => Boolean(route));
}

function matchText(sample: string, check: RiddleProofProfileCheck) {
  if (check.pattern) {
    try {
      return new RegExp(check.pattern, check.flags || "").test(sample);
    } catch {
      return false;
    }
  }
  return sample.includes(check.text || "");
}

function compactTextEvidenceSample(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function textSampleAroundMatch(sample: string, index: number, length: number): string | undefined {
  if (index < 0) return undefined;
  const source = String(sample || "");
  const context = 120;
  const start = Math.max(0, index - context);
  const end = Math.min(source.length, index + Math.max(length, 1) + context);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < source.length ? "..." : "";
  const compacted = compactTextEvidenceSample(`${prefix}${source.slice(start, end)}${suffix}`);
  return compacted ? compacted.slice(0, 240) : undefined;
}

function textMatchSamples(sample: string, check: RiddleProofProfileCheck): string[] {
  const source = String(sample || "");
  if (!source) return [];
  if (check.pattern) {
    try {
      const flags = Array.from(new Set(String(check.flags || "").replace(/[gy]/g, "").split(""))).join("");
      const match = new RegExp(check.pattern, flags).exec(source);
      const sampleText = match ? textSampleAroundMatch(source, match.index, match[0]?.length || 1) : undefined;
      return sampleText ? [sampleText] : [];
    } catch {
      return [];
    }
  }
  const text = check.text || "";
  if (!text) return [];
  const index = source.indexOf(text);
  const sampleText = textSampleAroundMatch(source, index, text.length);
  return sampleText ? [sampleText] : [];
}

function textCaseInsensitiveSamples(sample: string, check: RiddleProofProfileCheck): string[] {
  const source = String(sample || "");
  const text = check.pattern ? "" : check.text || "";
  if (!source || !text) return [];
  const index = source.toLowerCase().indexOf(text.toLowerCase());
  const sampleText = textSampleAroundMatch(source, index, text.length);
  return sampleText ? [sampleText] : [];
}

function textCaseInsensitiveSequenceSamples(texts: string[], check: RiddleProofProfileCheck): string[] {
  const text = check.pattern ? "" : compactTextEvidenceSample(check.text || "");
  if (!text) return [];
  const expected = text.toLowerCase();
  return texts
    .map((candidate) => compactTextEvidenceSample(candidate))
    .filter((candidate) => candidate && candidate.toLowerCase().includes(expected))
    .slice(0, 3)
    .map((candidate) => candidate.slice(0, 240));
}

function textCaseInsensitiveFailureSamples(viewport: RiddleProofProfileViewportEvidence, check: RiddleProofProfileCheck): string[] {
  const key = textKey(check);
  const captured = viewport.text_case_insensitive_samples?.[key] || [];
  const capturedSamples = captured
    .map((sample) => compactTextEvidenceSample(sample).slice(0, 240))
    .filter(Boolean);
  if (capturedSamples.length) return capturedSamples.slice(0, 3);
  return textCaseInsensitiveSamples(viewport.body_text_sample || "", check).slice(0, 3);
}

function textCheckFailureSamples(viewport: RiddleProofProfileViewportEvidence, check: RiddleProofProfileCheck): string[] {
  const key = textKey(check);
  const captured = viewport.text_match_samples?.[key] || [];
  const capturedSamples = captured
    .map((sample) => compactTextEvidenceSample(sample).slice(0, 240))
    .filter(Boolean);
  if (capturedSamples.length) return capturedSamples.slice(0, 3);
  const matchedSamples = textMatchSamples(viewport.body_text_sample || "", check);
  if (matchedSamples.length) return matchedSamples.slice(0, 3);
  const fallback = compactTextEvidenceSample(viewport.body_text_sample || "").slice(0, 240);
  return fallback ? [fallback] : [];
}

function allowedMessageSample(input: unknown): string {
  if (!isRecord(input)) return String(input || "");
  const parts = [
    input.text,
    input.message,
    isRecord(input.location) ? input.location.url : undefined,
  ];
  return parts.map((part) => String(part || "")).filter(Boolean).join(" ");
}

function matchesAllowedMessage(input: unknown, texts?: string[], patterns?: string[]): boolean {
  const sample = allowedMessageSample(input);
  if (texts?.some((text) => sample.includes(text))) return true;
  for (const pattern of patterns || []) {
    try {
      if (new RegExp(pattern).test(sample)) return true;
    } catch {
      continue;
    }
  }
  return false;
}

function consoleEventLocationUrl(input: unknown): string | undefined {
  if (!isRecord(input) || !isRecord(input.location)) return undefined;
  return stringValue(input.location.url);
}

function expectedFailedNetworkMockEvents(evidence: RiddleProofProfileEvidence): Array<Record<string, JsonValue>> {
  return (evidence.network_mocks || []).filter((event) => {
    if (!isRecord(event) || event.ok === false) return false;
    const status = numberValue(event.status);
    const isHttpFailure = status !== undefined && status >= 400;
    const isAbortedMock = event.abort === true && Boolean(stringValue(event.abort_error_code));
    return (isHttpFailure || isAbortedMock) && Boolean(stringValue(event.url));
  });
}

function matchingExpectedFailedNetworkMockConsoleEvent(
  event: unknown,
  evidence: RiddleProofProfileEvidence,
): Record<string, JsonValue> | undefined {
  const sample = allowedMessageSample(event);
  if (!/Failed to load resource/i.test(sample)) return undefined;
  const eventUrl = consoleEventLocationUrl(event);
  if (!eventUrl) return undefined;
  return expectedFailedNetworkMockEvents(evidence).find((mockEvent) => {
    const status = numberValue(mockEvent.status);
    const abortErrorCode = stringValue(mockEvent.abort_error_code);
    return stringValue(mockEvent.url) === eventUrl
      && (
        (status !== undefined && sample.includes(String(status)))
        || (Boolean(abortErrorCode) && /Failed to load resource/i.test(sample))
      );
  });
}

function isExpectedFailedNetworkMockConsoleEvent(event: unknown, evidence: RiddleProofProfileEvidence): boolean {
  return Boolean(matchingExpectedFailedNetworkMockConsoleEvent(event, evidence));
}

function expectedFailedNetworkMockConsoleEventSummary(
  event: unknown,
  evidence: RiddleProofProfileEvidence,
): Record<string, JsonValue> {
  const match = matchingExpectedFailedNetworkMockConsoleEvent(event, evidence);
  const sample = allowedMessageSample(event);
  return {
    url: consoleEventLocationUrl(event) ?? null,
    status: match ? numberValue(match.status) ?? null : null,
    abort_error_code: match ? stringValue(match.abort_error_code) ?? null : null,
    label: match ? stringValue(match.label) ?? null : null,
    response_label: match ? stringValue(match.response_label) ?? null : null,
    text: isRecord(event) && typeof event.text === "string" ? event.text.slice(0, 300) : sample.slice(0, 300),
  };
}

function normalizeRoutePath(path: string | undefined) {
  const value = path || "/";
  if (value === "/") return "/";
  return value.replace(/\/+$/, "") || "/";
}

function previewMountPrefix(pathname: string | undefined) {
  const value = pathname || "/";
  const apiPreview = value.match(/^(\/s\/[^/]+)(?:\/|$)/);
  if (apiPreview) return apiPreview[1];
  const internalPreview = value.match(/^(\/preview\/[^/]+\/[^/]+)(?:\/|$)/);
  return internalPreview ? internalPreview[1] : "";
}

function joinMountedRoutePath(mountPrefix: string, routePath: string) {
  const route = routePath.startsWith("/") ? routePath : `/${routePath}`;
  if (!mountPrefix) return route;
  if (route === mountPrefix || route.startsWith(`${mountPrefix}/`)) return route;
  return `${mountPrefix}${route}`;
}

export function resolveRiddleProofProfileRouteUrl(targetUrl: string, route: string): string {
  if (/^https?:\/\//i.test(route)) return route;
  if (!targetUrl) return route;
  if (route.startsWith("/")) {
    const base = new URL(targetUrl);
    const mountPrefix = previewMountPrefix(base.pathname);
    if (mountPrefix) {
      const routeParts = new URL(route, base.origin);
      base.pathname = joinMountedRoutePath(mountPrefix, routeParts.pathname);
      base.search = routeParts.search;
      base.hash = routeParts.hash;
      return base.href;
    }
  }
  return new URL(route, targetUrl).href;
}

function mountedExpectedRoutePath(targetUrl: string | undefined, expected: string | undefined) {
  if (!targetUrl || !expected || !expected.startsWith("/")) return expected;
  const mountPrefix = previewMountPrefix(new URL(targetUrl).pathname);
  return mountPrefix ? joinMountedRoutePath(mountPrefix, expected) : expected;
}

function routePathMatches(observed: string | undefined, expected: string | undefined, targetUrl?: string) {
  const normalizedObserved = normalizeRoutePath(observed);
  const normalizedExpected = normalizeRoutePath(expected);
  if (normalizedObserved === normalizedExpected) return true;
  return normalizedObserved === normalizeRoutePath(mountedExpectedRoutePath(targetUrl, expected));
}

function successfulRoute(route: RiddleProofProfileRouteEvidence, targetUrl?: string) {
  const matched = route.matched || routePathMatches(route.observed, route.expected_path, targetUrl);
  return matched && !route.error && (route.http_status === null || route.http_status === undefined || route.http_status < 400);
}

function routeReadinessFailed(route: RiddleProofProfileRouteEvidence, targetUrl?: string) {
  const matched = route.matched || routePathMatches(route.observed, route.expected_path, targetUrl);
  const httpOk = route.http_status === null || route.http_status === undefined || route.http_status < 400;
  return matched && httpOk && Boolean(route.error);
}

function compactRouteError(error: string | undefined) {
  const text = typeof error === "string" ? error.replace(/\s+/g, " ").trim() : "";
  return text ? text.slice(0, 240) : undefined;
}

function routeLoadedFailureMessage(failedRoutes: RiddleProofProfileRouteEvidence[], expectedPath: string, targetUrl?: string) {
  const readinessFailures = failedRoutes.filter((route) => routeReadinessFailed(route, targetUrl));
  if (readinessFailures.length === failedRoutes.length && readinessFailures.length) {
    const sample = compactRouteError(readinessFailures.find((route) => route.error)?.error);
    return `Route matched ${expectedPath}, but readiness failed in ${readinessFailures.length} viewport(s)${sample ? `: ${sample}` : "."}`;
  }
  if (readinessFailures.length) {
    const sample = compactRouteError(readinessFailures.find((route) => route.error)?.error);
    return `Route did not become ready as ${expectedPath} in ${failedRoutes.length} viewport(s); ${readinessFailures.length} matched path and HTTP but failed readiness${sample ? `: ${sample}` : "."}`;
  }
  return `Route did not load as ${expectedPath} in ${failedRoutes.length} viewport(s).`;
}

function parseEvidenceUrl(value: string | undefined, targetUrl: string | undefined): URL | undefined {
  if (!value) return undefined;
  try {
    return targetUrl ? new URL(value, targetUrl) : new URL(value);
  } catch {
    try {
      return new URL(value);
    } catch {
      return undefined;
    }
  }
}

function observedUrlForViewport(
  viewport: RiddleProofProfileViewportEvidence,
  targetUrl: string | undefined,
): URL | undefined {
  return parseEvidenceUrl(viewport.url, targetUrl)
    || parseEvidenceUrl(viewport.route?.observed, targetUrl)
    || parseEvidenceUrl(viewport.route?.requested, targetUrl)
    || parseEvidenceUrl(targetUrl, undefined);
}

function searchParamObservation(
  viewport: RiddleProofProfileViewportEvidence,
  targetUrl: string | undefined,
  param: string,
) {
  const url = observedUrlForViewport(viewport, targetUrl);
  const values = url ? url.searchParams.getAll(param) : [];
  return {
    viewport: viewport.name,
    url: url?.href || null,
    value: values.length ? values[0] : null,
    values,
    present: values.length > 0,
  };
}

function viewportsForCheck(
  check: RiddleProofProfileCheck,
  viewports: RiddleProofProfileViewportEvidence[],
): RiddleProofProfileViewportEvidence[] {
  if (!check.viewports?.length) return viewports;
  const names = new Set(check.viewports);
  return viewports.filter((viewport) => names.has(viewport.name));
}

function setupActionAppliesToViewport(
  action: RiddleProofProfileSetupAction,
  viewportName: string | undefined,
): boolean {
  if (!action.viewports?.length) return true;
  return Boolean(viewportName && action.viewports.includes(viewportName));
}

function setupActionsForViewport(
  actions: RiddleProofProfileSetupAction[] | undefined,
  viewportName: string | undefined,
): RiddleProofProfileSetupAction[] {
  return (actions || []).filter((action) => setupActionAppliesToViewport(action, viewportName));
}

function assessCheckFromEvidence(
  check: RiddleProofProfileCheck,
  evidence: RiddleProofProfileEvidence,
): RiddleProofProfileCheckResult {
  const viewports = viewportsForCheck(check, evidence.viewports || []);
  if (!viewports.length) {
    return {
      type: check.type,
      label: checkLabel(check),
      status: "failed",
      evidence: {
        expected_viewports: check.viewports || [],
      },
      message: check.viewports?.length
        ? `No matching viewport evidence was captured for ${check.viewports.join(", ")}.`
        : "No viewport evidence was captured.",
    };
  }

  if (isDialogCountCheckType(check.type)) {
    const field = dialogCountFieldForCheckType(check.type);
    const expectedCount = check.expected_count ?? 0;
    const actualCount = numberValue(evidence.dom_summary?.[field]) ?? 0;
    return {
      type: check.type,
      label: checkLabel(check),
      status: actualCount === expectedCount ? "passed" : "failed",
      evidence: {
        field,
        expected_count: expectedCount,
        count: actualCount,
      },
      message: actualCount === expectedCount
        ? undefined
        : `${field} did not equal ${expectedCount}; observed ${actualCount}.`,
    };
  }

  if (check.type === "route_loaded") {
    const expectedPath = check.expected_path || new URL(evidence.target_url).pathname || "/";
    const routes = viewports.map((viewport) => ({
      ...viewport.route,
      expected_path: expectedPath,
      matched: routePathMatches(viewport.route.observed, expectedPath, evidence.target_url) || viewport.route.matched,
    }));
    const failed = routes.filter((route) => !successfulRoute(route, evidence.target_url));
    return {
      type: check.type,
      label: checkLabel(check),
      status: failed.length ? "failed" : "passed",
      evidence: {
        expected_path: expectedPath,
        observed_paths: viewports.map((viewport) => viewport.route.observed),
        http_statuses: viewports.map((viewport) => viewport.route.http_status ?? null),
        route_errors: viewports.map((viewport) => viewport.route.error ?? null),
      },
      message: failed.length ? routeLoadedFailureMessage(failed, expectedPath, evidence.target_url) : undefined,
    };
  }

  if (check.type === "url_search_param_equals") {
    const param = check.param || "";
    const expectedValue = check.expected_value ?? "";
    const observations = viewports.map((viewport) => searchParamObservation(viewport, evidence.target_url, param));
    const failed = observations.filter((observation) => observation.value !== expectedValue);
    return {
      type: check.type,
      label: checkLabel(check),
      status: failed.length ? "failed" : "passed",
      evidence: {
        param,
        expected_value: expectedValue,
        observed_values: observations.map((observation) => observation.value),
        observed_all_values: observations.map((observation) => observation.values),
        observed_urls: observations.map((observation) => observation.url),
        viewports: observations.map((observation) => toJsonValue(observation)),
      },
      message: failed.length ? `URL search param ${param} did not equal ${JSON.stringify(expectedValue)} in ${failed.length} viewport(s).` : undefined,
    };
  }

  if (check.type === "url_search_param_absent") {
    const param = check.param || "";
    const observations = viewports.map((viewport) => searchParamObservation(viewport, evidence.target_url, param));
    const failed = observations.filter((observation) => observation.present);
    return {
      type: check.type,
      label: checkLabel(check),
      status: failed.length ? "failed" : "passed",
      evidence: {
        param,
        observed_values: observations.map((observation) => observation.value),
        observed_all_values: observations.map((observation) => observation.values),
        observed_urls: observations.map((observation) => observation.url),
        viewports: observations.map((observation) => toJsonValue(observation)),
      },
      message: failed.length ? `URL search param ${param} was present in ${failed.length} viewport(s).` : undefined,
    };
  }

  if (check.type === "selector_visible") {
    const key = selectorKey(check);
    const failed = viewports.filter((viewport) => (viewport.selectors?.[key]?.visible_count || 0) < 1);
    return {
      type: check.type,
      label: checkLabel(check),
      status: failed.length ? "failed" : "passed",
      evidence: {
        selector: key,
        visible_counts: viewports.map((viewport) => viewport.selectors?.[key]?.visible_count || 0),
      },
      message: failed.length ? `Selector ${key} was not visible in ${failed.length} viewport(s).` : undefined,
    };
  }

  if (check.type === "selector_absent") {
    const key = selectorKey(check);
    const failed = viewports.filter((viewport) => (viewport.selectors?.[key]?.count || 0) > 0);
    return {
      type: check.type,
      label: checkLabel(check),
      status: failed.length ? "failed" : "passed",
      evidence: {
        selector: key,
        counts: viewports.map((viewport) => viewport.selectors?.[key]?.count || 0),
      },
      message: failed.length ? `Selector ${key} was present in ${failed.length} viewport(s).` : undefined,
    };
  }

  if (check.type === "selector_count_at_least") {
    const key = selectorKey(check);
    const minCount = check.min_count ?? 1;
    const failed = viewports.filter((viewport) => (viewport.selectors?.[key]?.count || 0) < minCount);
    return {
      type: check.type,
      label: checkLabel(check),
      status: failed.length ? "failed" : "passed",
      evidence: {
        selector: key,
        min_count: minCount,
        counts: viewports.map((viewport) => viewport.selectors?.[key]?.count || 0),
      },
      message: failed.length ? `Selector ${key} count was below ${minCount} in ${failed.length} viewport(s).` : undefined,
    };
  }

  if (check.type === "selector_count_equals" || check.type === "selector_count_equal" || check.type === "selector_count_eq") {
    const key = selectorKey(check);
    const expectedCount = check.expected_count ?? 0;
    const failed = viewports.filter((viewport) => (viewport.selectors?.[key]?.count || 0) !== expectedCount);
    return {
      type: check.type,
      label: checkLabel(check),
      status: failed.length ? "failed" : "passed",
      evidence: {
        selector: key,
        expected_count: expectedCount,
        counts: viewports.map((viewport) => viewport.selectors?.[key]?.count || 0),
      },
      message: failed.length ? `Selector ${key} count did not equal ${expectedCount} in ${failed.length} viewport(s).` : undefined,
    };
  }

  if (check.type === "selector_text_visible" || check.type === "selector_text_absent") {
    const key = selectorKey(check);
    const expectedVisible = check.type === "selector_text_visible";
    const results = viewports.map((viewport) => {
      const texts = textSequenceForCheck(viewport, check);
      const matches = texts.filter((text) => matchText(text, check));
      const matched = matches.length > 0;
      const failedAgainstExpectation = matched !== expectedVisible;
      const sampleTexts = matches.length ? matches : failedAgainstExpectation ? texts : [];
      const caseInsensitiveSamples = failedAgainstExpectation && expectedVisible && !matched
        ? textCaseInsensitiveSequenceSamples(texts, check)
        : [];
      return {
        viewport: viewport.name,
        selector_count: viewport.selectors?.[key]?.count || 0,
        visible_count: viewport.selectors?.[key]?.visible_count || 0,
        matched_count: matches.length,
        matched,
        samples: sampleTexts.slice(0, 3).map((text) => text.slice(0, 240)),
        case_insensitive_samples: caseInsensitiveSamples,
      };
    });
    const failed = results.filter((result) => result.matched !== expectedVisible).length;
    return {
      type: check.type,
      label: checkLabel(check),
      status: failed ? "failed" : "passed",
      evidence: {
        selector: key,
        text: check.text || null,
        pattern: check.pattern || null,
        viewports: results.map((result) => toJsonValue(result)),
      },
      message: failed ? `Selector ${key} text assertion failed in ${failed} viewport(s).` : undefined,
    };
  }

  if (check.type === "selector_text_order") {
    const key = selectorKey(check);
    const expectedTexts = check.expected_texts || [];
    const results = viewports.map((viewport) => {
      const texts = textSequenceForCheck(viewport, check);
      const match = textOrderMatch(texts, expectedTexts);
      return {
        viewport: viewport.name,
        matched: match.matched,
        matched_positions: match.positions,
        visible_texts: texts.slice(0, 20).map((text) => text.slice(0, 240)),
      };
    });
    const failed = results.filter((result) => !result.matched).length;
    return {
      type: check.type,
      label: checkLabel(check),
      status: failed ? "failed" : "passed",
      evidence: {
        selector: key,
        expected_texts: expectedTexts,
        viewports: results.map((result) => toJsonValue(result)),
      },
      message: failed ? `Selector ${key} text order failed in ${failed} viewport(s).` : undefined,
    };
  }

  if (check.type === "ordered_trace") {
    const assessments = viewports.map((viewport) => ({
      viewport: viewport.name,
      assessment: assessRiddleProofOrderedTraceSetupResults(
        viewport.setup_action_results,
        check.setup_action_label || "",
        check.trace_path || "",
        check.events || [],
      ),
    }));
    const insufficient = assessments.filter((item) => item.assessment.status === "proof_insufficient");
    const failed = assessments.filter((item) => item.assessment.status === "failed");
    const status = insufficient.length ? "proof_insufficient" : failed.length ? "failed" : "passed";
    return {
      type: check.type,
      label: checkLabel(check),
      status,
      evidence: {
        setup_action_label: check.setup_action_label || "",
        trace_path: check.trace_path || "",
        events: toJsonValue((check.events || []).map((event) => event.label)),
        viewports: toJsonValue(assessments),
      },
      message: insufficient.length
        ? `Ordered trace evidence was insufficient in ${insufficient.length} viewport(s).`
        : failed.length
          ? `Ordered trace did not contain the required event sequence in ${failed.length} viewport(s).`
          : undefined,
    };
  }

  if (check.type === "observe_within") {
    const key = observeWithinKey(check);
    const timeoutMs = observeWithinTimeoutMs(check);
    const results = viewports.map((viewport) => {
      const observation = viewport.observations?.[key];
      const matched = observation?.matched === true;
      return {
        viewport: viewport.name,
        matched,
        elapsed_ms: numberValue(observation?.elapsed_ms) ?? null,
        timeout_ms: numberValue(observation?.timeout_ms) ?? timeoutMs,
        attempts: numberValue(observation?.attempts) ?? null,
        selector_count: numberValue(observation?.selector_count) ?? null,
        visible_count: numberValue(observation?.visible_count) ?? null,
        matched_count: numberValue(observation?.matched_count) ?? null,
        sample: stringValue(observation?.sample) ?? null,
        error: stringValue(observation?.error) ?? null,
      };
    });
    const failed = results.filter((result) => !result.matched).length;
    return {
      type: check.type,
      label: checkLabel(check),
      status: failed ? "failed" : "passed",
      evidence: {
        selector: check.selector || null,
        text: check.text || null,
        pattern: check.pattern || null,
        timeout_ms: timeoutMs,
        viewports: results.map((result) => toJsonValue(result)),
      },
      message: failed ? `Observation did not match within ${timeoutMs}ms in ${failed} viewport(s).` : undefined,
    };
  }

  if (check.type === "frame_text_visible") {
    const key = selectorKey(check);
    const results = viewports.map((viewport) => {
      const frames = frameEvidenceForSelector(viewport, key);
      const matches = frames
        .map((frame, index) => ({ index, frame, matched: matchText(frameTextSample(frame), check) }))
        .filter((item) => item.matched);
      return {
        viewport: viewport.name,
        frame_count: frames.length,
        matched_count: matches.length,
        matched: matches.length > 0,
        urls: frames.map((frame) => String(frame.url || "")).filter(Boolean).slice(0, 10),
        samples: matches.map((item) => frameTextSample(item.frame).replace(/\s+/g, " ").trim().slice(0, 240)).slice(0, 3),
      };
    });
    const failed = results.filter((result) => !result.matched).length;
    return {
      type: check.type,
      label: checkLabel(check),
      status: failed ? "failed" : "passed",
      evidence: {
        selector: key,
        text: check.text || null,
        pattern: check.pattern || null,
        viewports: results.map((result) => toJsonValue(result)),
      },
      message: failed ? `Frame selector ${key} did not contain expected text in ${failed} viewport(s).` : undefined,
    };
  }

  if (check.type === "frame_url_equals" || check.type === "frame_url_matches") {
    const key = selectorKey(check);
    const expectedUrl = check.expected_url || check.expected_value || "";
    const results = viewports.map((viewport) => {
      const frames = frameEvidenceForSelector(viewport, key);
      const urls = frames.map((frame) => String(frame.url || "")).filter(Boolean);
      const matches = urls.filter((url) => (
        check.type === "frame_url_equals"
          ? url === expectedUrl
          : matchText(url, check)
      ));
      return {
        viewport: viewport.name,
        frame_count: frames.length,
        matched_count: matches.length,
        matched: matches.length > 0,
        urls: urls.slice(0, 10),
      };
    });
    const failed = results.filter((result) => !result.matched).length;
    return {
      type: check.type,
      label: checkLabel(check),
      status: failed ? "failed" : "passed",
      evidence: {
        selector: key,
        expected_url: check.type === "frame_url_equals" ? expectedUrl : null,
        pattern: check.type === "frame_url_matches" ? check.pattern || null : null,
        viewports: results.map((result) => toJsonValue(result)),
      },
      message: failed ? `Frame selector ${key} URL assertion failed in ${failed} viewport(s).` : undefined,
    };
  }

  if (check.type === "frame_no_horizontal_overflow") {
    const key = selectorKey(check);
    const maxOverflow = check.max_overflow_px ?? 4;
    const results = viewports.map((viewport) => {
      const frames = frameEvidenceForSelector(viewport, key);
      const frameOverflows = frames.map((frame, index) => ({
        index,
        url: String(frame.url || ""),
        overflow_px: horizontalBoundsOverflowPx(frame),
        offender_count: boundsOffendersForEvidence(frame).length,
      }));
      const maxFrameOverflow = frameOverflows.reduce((max, frame) => Math.max(max, frame.overflow_px), 0);
      return {
        viewport: viewport.name,
        frame_count: frames.length,
        max_overflow_px: roundPixels(maxFrameOverflow),
        failed_frame_count: frameOverflows.filter((frame) => frame.overflow_px > maxOverflow).length,
        frames: frameOverflows.map((frame) => toJsonValue(frame)),
      };
    });
    const failed = results.filter((result) => result.frame_count < 1 || result.failed_frame_count > 0).length;
    return {
      type: check.type,
      label: checkLabel(check),
      status: failed ? "failed" : "passed",
      evidence: {
        selector: key,
        max_overflow_px: maxOverflow,
        viewports: results.map((result) => toJsonValue(result)),
      },
      message: failed ? `Frame selector ${key} overflow exceeded ${maxOverflow}px or was missing in ${failed} viewport(s).` : undefined,
    };
  }

  if (check.type === "text_visible" || check.type === "text_absent") {
    const key = textKey(check);
    const expectedVisible = check.type === "text_visible";
    const results = viewports.map((viewport) => {
      const fromEvidence = viewport.text_matches?.[key];
      const matched = typeof fromEvidence === "boolean"
        ? fromEvidence
        : matchText(viewport.body_text_sample || "", check);
      const failedAgainstExpectation = matched !== expectedVisible;
      return {
        viewport: viewport.name,
        matched,
        samples: failedAgainstExpectation ? textCheckFailureSamples(viewport, check) : [],
        case_insensitive_samples: failedAgainstExpectation && expectedVisible && !matched
          ? textCaseInsensitiveFailureSamples(viewport, check)
          : [],
      };
    });
    const matches = results.map((result) => result.matched);
    const failed = matches.filter((matched) => matched !== expectedVisible).length;
    return {
      type: check.type,
      label: checkLabel(check),
      status: failed ? "failed" : "passed",
      evidence: {
        text: check.text || null,
        pattern: check.pattern || null,
        matches,
        viewports: results.map((result) => toJsonValue(result)),
      },
      message: failed ? `Text assertion failed in ${failed} viewport(s).` : undefined,
    };
  }

  if (check.type === "http_status") {
    const url = httpStatusRequestUrl(check, evidence.target_url);
    const method = httpStatusMethod(check);
    const summaries = viewports.map((viewport) => summarizeHttpStatusEvidence(viewport, check));
    const failed = summaries.filter((summary) => Array.isArray(summary.failures) && summary.failures.length > 0);
    return {
      type: check.type,
      label: checkLabel(check),
      status: failed.length ? "failed" : "passed",
      evidence: {
        url,
        method,
        allowed_statuses: httpStatusAllowedStatuses(check) || ["2xx", "3xx"],
        require_nonzero_bytes: check.require_nonzero_bytes === true,
        min_bytes: check.min_bytes ?? null,
        allowed_content_types: check.allowed_content_types ?? null,
        body_contains: check.body_contains ?? [],
        body_not_contains: check.body_not_contains ?? [],
        body_not_patterns: check.body_not_patterns ?? [],
        body_json_assertions: toJsonValue(check.body_json_assertions ?? []),
        viewports: summaries.map((summary) => toJsonValue(summary)),
        failures: failed.flatMap((summary) => (
          Array.isArray(summary.failures)
            ? summary.failures.map((failure) => toJsonValue({ viewport: stringValue(summary.viewport) ?? null, failure }))
            : []
        )),
      },
      message: failed.length ? `HTTP status failed in ${failed.length} viewport(s).` : undefined,
    };
  }

  if (check.type === "link_status" || check.type === "artifact_link_status") {
    const selector = linkStatusSelector(check);
    const summaries = viewports.map((viewport) => summarizeLinkStatusEvidence(viewport, check));
    const failed = summaries.filter((summary) => (numberValue(summary.failed_count) ?? 0) > 0);
    return {
      type: check.type,
      label: checkLabel(check),
      status: failed.length ? "failed" : "passed",
      evidence: {
        selector,
        expected_count: check.expected_count ?? null,
        min_count: check.min_count ?? null,
        allowed_statuses: linkStatusAllowedStatuses(check) || ["2xx", "3xx"],
        require_nonzero_bytes: check.require_nonzero_bytes === true,
        min_bytes: check.min_bytes ?? null,
        allowed_content_types: check.allowed_content_types ?? null,
        viewports: summaries.map((summary) => toJsonValue(summary)),
        failures: failed.flatMap((summary) => (
          Array.isArray(summary.failures)
            ? summary.failures.map((failure) => toJsonValue({ viewport: stringValue(summary.viewport) ?? null, failure }))
            : []
        )),
      },
      message: failed.length ? `Link status failed in ${failed.length} viewport(s).` : undefined,
    };
  }

  if (check.type === "route_inventory") {
    const inventories = viewports
      .map((viewport) => ({ viewport: viewport.name, inventory: viewport.route_inventory }))
      .filter((item) => isRecord(item.inventory));
    if (!inventories.length) {
      return {
        type: check.type,
        label: checkLabel(check),
        status: "failed",
        evidence: {
          expected_count: check.expected_routes?.length || 0,
          expected_routes: routeInventoryExpectedRouteSummaries(undefined, check.expected_routes),
        },
        message: "No route inventory evidence was captured.",
      };
    }
    const viewportSummaries = inventories.map((item) => (
      summarizeRouteInventory(item.viewport, item.inventory as Record<string, unknown>)
    ));
    const failures = inventories.flatMap((item) => (
      Array.isArray(item.inventory?.failures)
        ? item.inventory.failures.map((failure) => toJsonValue({ viewport: item.viewport, failure }))
        : []
    ));
    const first = inventories[0]?.inventory;
    const directRoutes = Array.isArray(first?.direct_routes) ? first.direct_routes : [];
    const clickthroughs = Array.isArray(first?.clickthroughs) ? first.clickthroughs : [];
    const sourceLinkCount = numberValue(first?.source_link_count) ?? numberValue(first?.home_game_link_count) ?? null;
    const sourceUniqueLinkCount = numberValue(first?.source_unique_link_count) ?? numberValue(first?.home_unique_game_link_count) ?? null;
    const sourceCandidateCount = numberValue(first?.source_candidate_count);
    const sourceCandidateUniqueLinkCount = numberValue(first?.source_candidate_unique_link_count);
    const sourceLinkScope = stringValue(first?.source_link_scope);
    const duplicateSourceLinks = Array.isArray(first?.duplicate_source_link_paths)
      ? first.duplicate_source_link_paths.map((path) => String(path))
      : [];
    const duplicateSourceLinkCount = numberValue(first?.duplicate_source_link_count)
      ?? (sourceLinkCount !== null && sourceUniqueLinkCount !== null ? Math.max(0, sourceLinkCount - sourceUniqueLinkCount) : null);
    const expectedRoutes = routeInventoryExpectedRouteSummaries(first?.expected_routes, check.expected_routes);
    return {
      type: check.type,
      label: checkLabel(check),
      status: failures.length ? "failed" : "passed",
      evidence: {
        expected_count: check.expected_routes?.length || 0,
        expected_routes: expectedRoutes,
        source_link_scope: sourceLinkScope ?? null,
        source_candidate_count: sourceCandidateCount ?? sourceLinkCount,
        source_candidate_unique_link_count: sourceCandidateUniqueLinkCount ?? sourceUniqueLinkCount,
        source_link_count: sourceLinkCount,
        source_unique_link_count: sourceUniqueLinkCount,
        duplicate_source_link_count: duplicateSourceLinkCount,
        duplicate_source_links: duplicateSourceLinks,
        duplicates_allowed: check.require_unique_routes === false,
        homepage_link_count: numberValue(first?.home_game_link_count) ?? sourceLinkCount,
        homepage_unique_link_count: numberValue(first?.home_unique_game_link_count) ?? sourceUniqueLinkCount,
        direct_route_count: directRoutes.length,
        clickthrough_count: clickthroughs.length,
        viewport_count: inventories.length,
        viewports: viewportSummaries.map((summary) => toJsonValue(summary)),
        failures,
      },
      message: failures.length ? `Route inventory failed with ${failures.length} issue(s).` : undefined,
    };
  }

  if (check.type === "no_horizontal_overflow" || check.type === "no_mobile_horizontal_overflow") {
    const maxOverflow = check.max_overflow_px ?? 4;
    const applicable = check.type === "no_mobile_horizontal_overflow"
      ? viewports.filter((viewport) => viewport.width <= 820)
      : viewports;
    if (!applicable.length) {
      const mobileOnly = check.type === "no_mobile_horizontal_overflow";
      return {
        type: check.type,
        label: checkLabel(check),
        status: mobileOnly ? "skipped" : "failed",
        evidence: { max_overflow_px: maxOverflow, viewports: [] },
        message: mobileOnly
          ? "No mobile viewport evidence was captured; mobile overflow check skipped."
          : "No applicable viewport evidence was captured for overflow check.",
      };
    }
    const failed = applicable.filter((viewport) => horizontalBoundsOverflowPx(viewport) > maxOverflow);
    return {
      type: check.type,
      label: checkLabel(check),
      status: failed.length ? "failed" : "passed",
      evidence: {
        max_overflow_px: maxOverflow,
        overflow_px: applicable.map((viewport) => viewport.overflow_px ?? null),
        bounds_overflow_px: applicable.map((viewport) => horizontalBoundsOverflowPx(viewport)),
        overflow_offender_counts: applicable.map((viewport) => boundsOffendersForEvidence(viewport).length),
        viewports: applicable.map((viewport) => viewport.name),
      },
      message: failed.length ? `Horizontal bounds overflow exceeded ${maxOverflow}px in ${failed.length} viewport(s).` : undefined,
    };
  }

  if (check.type === "no_fatal_console_errors") {
    const fatalConsoleEvents = (evidence.console?.events || []).filter((event) => event.type === "error" || event.type === "assert");
    const explicitlyAllowedConsoleEvents = fatalConsoleEvents.filter((event) => matchesAllowedMessage(event, check.allowed_console_texts, check.allowed_console_patterns));
    const expectedNetworkMockConsoleEvents = fatalConsoleEvents.filter((event) => (
      !matchesAllowedMessage(event, check.allowed_console_texts, check.allowed_console_patterns)
        && isExpectedFailedNetworkMockConsoleEvent(event, evidence)
    ));
    const allowedConsoleEvents = fatalConsoleEvents.filter((event) => (
      matchesAllowedMessage(event, check.allowed_console_texts, check.allowed_console_patterns)
        || isExpectedFailedNetworkMockConsoleEvent(event, evidence)
    ));
    const unallowedConsoleEvents = fatalConsoleEvents.filter((event) => (
      !matchesAllowedMessage(event, check.allowed_console_texts, check.allowed_console_patterns)
        && !isExpectedFailedNetworkMockConsoleEvent(event, evidence)
    ));
    const pageErrors = evidence.page_errors || [];
    const allowedPageErrors = pageErrors.filter((error) => matchesAllowedMessage(error, check.allowed_page_error_texts, check.allowed_page_error_patterns));
    const unallowedPageErrors = pageErrors.filter((error) => !matchesAllowedMessage(error, check.allowed_page_error_texts, check.allowed_page_error_patterns));
    const fatalCount = unallowedConsoleEvents.length + unallowedPageErrors.length;
    return {
      type: check.type,
      label: checkLabel(check),
      status: fatalCount ? "failed" : "passed",
      evidence: {
        console_fatal_count: unallowedConsoleEvents.length,
        page_error_count: unallowedPageErrors.length,
        total_console_fatal_count: fatalConsoleEvents.length,
        total_page_error_count: pageErrors.length,
        allowed_console_fatal_count: allowedConsoleEvents.length,
        explicitly_allowed_console_fatal_count: explicitlyAllowedConsoleEvents.length,
        allowed_expected_network_mock_console_count: expectedNetworkMockConsoleEvents.length,
        allowed_expected_network_mock_console_events: expectedNetworkMockConsoleEvents
          .slice(0, 5)
          .map((event) => expectedFailedNetworkMockConsoleEventSummary(event, evidence)),
        allowed_page_error_count: allowedPageErrors.length,
        allowed_console_texts: check.allowed_console_texts || [],
        allowed_console_patterns: check.allowed_console_patterns || [],
        allowed_page_error_texts: check.allowed_page_error_texts || [],
        allowed_page_error_patterns: check.allowed_page_error_patterns || [],
      },
      message: fatalCount ? `${fatalCount} fatal browser error(s) were captured.` : undefined,
    };
  }

  if (check.type === "no_console_warnings") {
    const warningConsoleEvents = (evidence.console?.events || []).filter((event) => event.type === "warning" || event.type === "warn");
    const allowedConsoleEvents = warningConsoleEvents.filter((event) => matchesAllowedMessage(event, check.allowed_console_texts, check.allowed_console_patterns));
    const unallowedConsoleEvents = warningConsoleEvents.filter((event) => !matchesAllowedMessage(event, check.allowed_console_texts, check.allowed_console_patterns));
    return {
      type: check.type,
      label: checkLabel(check),
      status: unallowedConsoleEvents.length ? "failed" : "passed",
      evidence: {
        console_warning_count: unallowedConsoleEvents.length,
        total_console_warning_count: warningConsoleEvents.length,
        allowed_console_warning_count: allowedConsoleEvents.length,
        allowed_console_texts: check.allowed_console_texts || [],
        allowed_console_patterns: check.allowed_console_patterns || [],
        unallowed_console_warning_samples: unallowedConsoleEvents
          .slice(0, 5)
          .map((event) => allowedMessageSample(event)),
        allowed_console_warning_samples: allowedConsoleEvents
          .slice(0, 5)
          .map((event) => allowedMessageSample(event)),
      },
      message: unallowedConsoleEvents.length ? `${unallowedConsoleEvents.length} console warning(s) were captured.` : undefined,
    };
  }

  return {
    type: check.type,
    label: checkLabel(check),
    status: "needs_human_review",
    evidence: {},
    message: "Unsupported check type.",
  };
}

function assessSetupActionsFromEvidence(
  profile: RiddleProofProfile,
  evidence: RiddleProofProfileEvidence,
): RiddleProofProfileCheckResult | undefined {
  if (!profile.target.setup_actions?.length) return undefined;
  const actionCount = profile.target.setup_actions.length;
  const failed: Array<Record<string, JsonValue>> = [];
  const viewports = evidence.viewports || [];
  const expectedActionCountByViewport = new Map<string, number>();
  for (const viewport of viewports) {
    const expectedActionCount = setupActionsForViewport(profile.target.setup_actions, viewport.name).length;
    expectedActionCountByViewport.set(viewport.name, expectedActionCount);
    const results = viewport.setup_action_results || [];
    for (const result of results) {
      if (result.ok === false && result.optional !== true) {
        failed.push({
          viewport: viewport.name,
          action: result.action ?? result.type ?? null,
          selector: result.selector ?? null,
          frame_selector: result.frame_selector ?? null,
          frame_index: result.frame_index ?? null,
          reason: result.reason ?? result.error ?? null,
        });
      }
    }
    if (results.length < expectedActionCount && results.every((result) => result.ok !== false || result.optional === true)) {
      failed.push({
        viewport: viewport.name,
        action: "setup_actions",
        selector: null,
        reason: `missing setup action results: ${results.length}/${expectedActionCount}`,
      });
    }
  }
  return {
    type: "setup_actions_succeeded",
    label: "setup actions succeeded",
    status: failed.length ? "failed" : "passed",
    evidence: {
      action_count: actionCount,
      viewports: viewports.map((viewport) => ({
        name: viewport.name,
        expected_action_count: expectedActionCountByViewport.get(viewport.name) ?? actionCount,
        ok: (viewport.setup_action_results || []).length >= (expectedActionCountByViewport.get(viewport.name) ?? actionCount)
          && (viewport.setup_action_results || []).every((result) => result.ok !== false || result.optional === true),
        result_count: (viewport.setup_action_results || []).length,
      })),
      setup_summary: profileSetupSummary(viewports, actionCount, expectedActionCountByViewport, profile.target.screenshot_full_page),
      failed,
    },
    message: failed.length ? `Setup actions failed in ${failed.length} viewport action(s).` : undefined,
  };
}

function assessNetworkMocksFromEvidence(
  profile: RiddleProofProfile,
  evidence: RiddleProofProfileEvidence,
): RiddleProofProfileCheckResult | undefined {
  const mocks = profile.target.network_mocks || [];
  if (!mocks.length) return undefined;
  const events = evidence.network_mocks || [];
  const failed: Array<Record<string, JsonValue>> = [];
  const requiredMocks = mocks.filter((mock) => mock.required !== false);
  const hitCountForMock = (mock: RiddleProofProfileNetworkMock) => events.filter((event) => event.label === mock.label && event.ok !== false).length;
  for (const mock of requiredMocks) {
    const hits = hitCountForMock(mock);
    const requiredHitCount = requiredNetworkMockHitCount(mock);
    if (hits < requiredHitCount) {
      failed.push({
        label: mock.label,
        url: mock.url,
        method: mock.method || null,
        reason: hits < 1 ? "required_mock_not_hit" : "required_mock_hit_count_not_met",
        required_hit_count: requiredHitCount,
        hit_count: hits,
      });
    }
  }
  for (const mock of mocks) {
    if (mock.max_hit_count === undefined) continue;
    const hits = hitCountForMock(mock);
    if (hits > mock.max_hit_count) {
      failed.push({
        label: mock.label,
        url: mock.url,
        method: mock.method || null,
        reason: mock.max_hit_count === 0 ? "forbidden_mock_hit" : "mock_hit_count_exceeded",
        max_hit_count: mock.max_hit_count,
        hit_count: hits,
      });
    }
  }
  for (const event of events) {
    if (event.ok === false) {
      failed.push({
        label: event.label ?? null,
        url: event.url ?? null,
        method: event.method ?? null,
        reason: event.reason ?? event.error ?? "mock_failed",
      });
    }
    if (event.request_body_matches === false) {
      failed.push({
        label: event.label ?? null,
        response_label: event.response_label ?? null,
        hit_index: event.hit_index ?? null,
        response_index: event.response_index ?? null,
        url: event.url ?? null,
        method: event.method ?? null,
        reason: "request_body_mismatch",
        request_body_failures: event.request_body_failures ?? [],
        request_body_length: event.request_body_length ?? null,
        request_body_sample: event.request_body_sample ?? null,
      });
    }
  }
  return {
    type: "network_mocks_succeeded",
    label: "network mocks succeeded",
    status: failed.length ? "failed" : "passed",
    evidence: {
      mock_count: mocks.length,
      required_count: requiredMocks.length,
      hit_count: events.filter((event) => event.ok !== false).length,
      hits_by_label: Object.fromEntries(mocks.map((mock) => [
        mock.label,
        hitCountForMock(mock),
      ])),
      required_hits_by_label: Object.fromEntries(requiredMocks.map((mock) => [
        mock.label,
        requiredNetworkMockHitCount(mock),
      ])),
      max_hits_by_label: Object.fromEntries(mocks
        .filter((mock) => mock.max_hit_count !== undefined)
        .map((mock) => [mock.label, mock.max_hit_count ?? null])),
      response_hits_by_label: networkMockResponseHitsByLabel(events),
      failed,
    },
    message: failed.length ? `Network mocks failed or hit-count contracts failed for ${failed.length} mock(s).` : undefined,
  };
}

function networkMockResponseHitsByLabel(events: Array<Record<string, JsonValue>>): Record<string, JsonValue> {
  const responseHits: Record<string, Record<string, number>> = {};
  for (const event of events) {
    if (!event || event.ok === false) continue;
    const label = typeof event.label === "string" ? event.label : "";
    const responseLabel = typeof event.response_label === "string" ? event.response_label : "";
    const hasSequenceResponse = typeof event.response_index === "number"
      || event.sequence_cycle === true
      || Boolean(responseLabel && responseLabel !== label);
    if (!label || !responseLabel || !hasSequenceResponse) continue;
    responseHits[label] ||= {};
    responseHits[label][responseLabel] = (responseHits[label][responseLabel] || 0) + 1;
  }
  return responseHits;
}

function requiredNetworkMockHitCount(mock: RiddleProofProfileNetworkMock): number {
  if (mock.required === false) return 0;
  if (mock.required_hit_count !== undefined) return mock.required_hit_count;
  if (Array.isArray(mock.responses) && mock.responses.length) return mock.responses.length;
  return 1;
}

function profileStatusFromEvidence(
  profile: RiddleProofProfile,
  evidence: RiddleProofProfileEvidence | undefined,
  checks: RiddleProofProfileCheckResult[],
): RiddleProofProfileStatus {
  if (!evidence) return "proof_insufficient";
  const viewports = evidence.viewports || [];
  const expectedViewportCount = profile.target.viewports?.length || 0;
  if (!viewports.length || !checks.length) return "proof_insufficient";
  if (viewports.some((viewport) => viewport.navigation_error)) return "environment_blocked";
  if (expectedViewportCount && viewports.length < expectedViewportCount) return "proof_insufficient";
  if (checks.some((check) => check.status === "proof_insufficient")) return "proof_insufficient";
  if (checks.some((check) => check.status === "needs_human_review")) return "needs_human_review";
  if (checks.some((check) => check.status === "failed")) return "product_regression";
  return "passed";
}

export interface RiddleProofProfileArtifactCompleteness {
  ok: boolean;
  required: string[];
  observed: string[];
  missing: string[];
}

export const RIDDLE_PROOF_HOSTED_PROFILE_ARTIFACTS = [
  "screenshot",
  "console",
  "dom_summary",
  "proof_json",
] as const;

export interface RiddleProofProfileRunnerArtifactPreflight {
  ok: boolean;
  runner: RiddleProofProfileRunner;
  requested: string[];
  local_only: string[];
  hosted_artifacts: string[];
  message?: string;
}

export function preflightRiddleProofProfileRunnerArtifacts(
  profile: RiddleProofProfile,
  runner: RiddleProofProfileRunner,
): RiddleProofProfileRunnerArtifactPreflight {
  const requested = uniqueNonEmptyStrings(profile.artifacts || []);
  if (runner !== "riddle") {
    return {
      ok: true,
      runner,
      requested,
      local_only: [],
      hosted_artifacts: [...RIDDLE_PROOF_HOSTED_PROFILE_ARTIFACTS],
    };
  }

  const localOnly = requested.filter(profileArtifactIsHostedLocalOnly);
  const subject = localOnly.join(", ");
  const message = localOnly.length
    ? `${subject} ${localOnly.length === 1 ? "is" : "are"} local-runner output; hosted runs produce proof_json, console, dom_summary, and screenshots. Remove ${localOnly.length === 1 ? "it" : "them"} from profile.artifacts for --runner riddle.`
    : undefined;
  return {
    ok: localOnly.length === 0,
    runner,
    requested,
    local_only: localOnly,
    hosted_artifacts: [...RIDDLE_PROOF_HOSTED_PROFILE_ARTIFACTS],
    message,
  };
}

export function assessRiddleProofProfileArtifactCompleteness(
  profile: RiddleProofProfile,
  result: RiddleProofProfileResult,
  artifacts: RiddleProofProfileArtifactRef[],
): RiddleProofProfileArtifactCompleteness {
  const required = profileRequiredArtifactKeys(profile, result);
  const missing = required.filter((key) => !profileArtifactKeyPresent(key, artifacts));
  return {
    ok: missing.length === 0,
    required,
    observed: artifacts.map((artifact) => profileArtifactObservedLabel(artifact)).filter(Boolean),
    missing,
  };
}

export function applyRiddleProofProfileArtifactCompleteness(
  profile: RiddleProofProfile,
  result: RiddleProofProfileResult,
  artifacts: RiddleProofProfileArtifactRef[] | undefined,
): RiddleProofProfileResult {
  if (artifacts === undefined) return result;
  const completeness = assessRiddleProofProfileArtifactCompleteness(profile, result, artifacts);
  if (result.status !== "passed" || completeness.ok) {
    return {
      ...result,
      artifacts: {
        ...result.artifacts,
        riddle_artifacts: artifacts,
      },
    };
  }

  const missing = completeness.missing.join(", ");
  const message = `Missing required profile artifact(s): ${missing}`;
  const warnings = [...(result.warnings || []), message];
  return {
    ...result,
    status: "proof_insufficient",
    artifacts: {
      ...result.artifacts,
      riddle_artifacts: artifacts,
    },
    summary: `${profile.name} did not produce required profile artifact(s): ${missing}.`,
    warnings,
    error: message,
  };
}

function profileRequiredArtifactKeys(profile: RiddleProofProfile, result: RiddleProofProfileResult): string[] {
  const keys: string[] = [];
  for (const artifact of profile.artifacts || []) {
    const role = normalizeProfileArtifactRole(artifact);
    if (!role) continue;
    if (role === "screenshot") {
      const screenshots = result.artifacts.screenshots || [];
      if (screenshots.length) {
        keys.push(...screenshots.map((label) => `screenshot:${label}`));
      } else {
        keys.push("screenshot");
      }
      continue;
    }
    keys.push(role);
  }
  return uniqueNonEmptyStrings(keys);
}

function normalizeProfileArtifactRole(input: string) {
  const normalized = input.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return "";
  if (normalized === "screenshots") return "screenshot";
  if (normalized === "console" || normalized === "console_json" || normalized === "console.json") return "console.json";
  if (normalized === "dom_summary" || normalized === "dom_summary_json" || normalized === "dom-summary.json") return "dom-summary.json";
  if (normalized === "proof" || normalized === "proof_json" || normalized === "proof.json") return "proof.json";
  return normalizeRiddleProfileArtifactName(input.trim()).toLowerCase();
}

function profileArtifactIsHostedLocalOnly(input: string) {
  const raw = input.trim().toLowerCase();
  const normalized = raw.replace(/[\s-]+/g, "_");
  const role = normalizeProfileArtifactRole(input);
  return [
    raw,
    normalized,
    role,
  ].some((value) => value === "artifact_manifest" || value === "artifact_manifest.json" || value === "artifact-manifest" || value === "artifact-manifest.json");
}

function profileArtifactKeyPresent(key: string, artifacts: RiddleProofProfileArtifactRef[]) {
  if (key.startsWith("screenshot:")) {
    const label = key.slice("screenshot:".length);
    return artifacts.some((artifact) => profileArtifactRefIsScreenshot(artifact) && profileArtifactRefText(artifact).includes(label.toLowerCase()));
  }
  if (key === "screenshot") {
    return artifacts.some((artifact) => profileArtifactRefIsScreenshot(artifact));
  }
  return artifacts.some((artifact) => {
    const name = normalizeRiddleProfileArtifactName(artifact.name || artifactNameFromPath(artifact.url || artifact.path) || "").toLowerCase();
    return name === key || profileArtifactRefText(artifact).includes(key);
  });
}

function profileArtifactRefIsScreenshot(artifact: RiddleProofProfileArtifactRef) {
  const kind = (artifact.kind || "").toLowerCase();
  const contentType = (artifact.content_type || "").toLowerCase();
  const text = profileArtifactRefText(artifact);
  return kind === "screenshot"
    || contentType.startsWith("image/")
    || /\.(png|jpe?g|webp)(?:$|[?#])/i.test(text)
    || /\.(png|jpe?g|webp)$/i.test(text);
}

function profileArtifactRefText(artifact: RiddleProofProfileArtifactRef) {
  return [
    artifact.name,
    artifact.url,
    artifact.path,
    artifact.kind,
    artifact.content_type,
  ].filter(Boolean).join(" ").toLowerCase();
}

function profileArtifactObservedLabel(artifact: RiddleProofProfileArtifactRef) {
  return artifact.name || artifact.url || artifact.path || artifact.kind || "";
}

export function assessRiddleProofProfileEvidence(
  profile: RiddleProofProfile,
  evidence: RiddleProofProfileEvidence | undefined,
  options: { runner?: RiddleProofProfileRunner; riddle?: RiddleProofProfileResult["riddle"]; artifacts?: RiddleProofProfileArtifactRef[] } = {},
): RiddleProofProfileResult {
  const capturedAt = evidence?.captured_at || new Date().toISOString();
  const warnings = collectRiddleProofProfileWarnings(profile);
  const checks = evidence
    ? [
      assessNetworkMocksFromEvidence(profile, evidence),
      assessSetupActionsFromEvidence(profile, evidence),
      ...profile.checks.map((check) => assessCheckFromEvidence(check, evidence)),
    ].filter((check): check is RiddleProofProfileCheckResult => Boolean(check))
    : [];
  const status = profileStatusFromEvidence(profile, evidence, checks);
  const firstViewport = evidence?.viewports?.[0];
  const screenshots = profileScreenshotLabels(evidence?.viewports);
  const canonicalScreenshots = profileFinalScreenshotLabels(evidence?.viewports);
  const setupScreenshots = profileAllSetupScreenshotLabels(evidence?.viewports);
  const result: RiddleProofProfileResult = {
    version: RIDDLE_PROOF_PROFILE_RESULT_VERSION,
    profile_name: profile.name,
    runner: options.runner || "riddle",
    status,
    baseline_policy: profile.baseline_policy,
    route: routeForViewport(firstViewport, evidence?.target_url),
    artifacts: {
      screenshots,
      canonical_screenshots: canonicalScreenshots,
      setup_screenshots: setupScreenshots,
      console: "console.json",
      proof_json: "proof.json",
      dom_summary: "dom-summary.json",
      riddle_artifacts: options.artifacts,
    },
    checks,
    summary: summarizeRiddleProofProfileResult({ profile_name: profile.name, status, checks, viewports: evidence?.viewports || [] }),
    captured_at: capturedAt,
    metadata: profile.metadata,
    warnings: warnings.length ? warnings : undefined,
    evidence,
    riddle: options.riddle,
  };
  return applyRiddleProofProfileArtifactCompleteness(profile, result, options.artifacts);
}

export function summarizeRiddleProofProfileResult(input: {
  profile_name: string;
  status: RiddleProofProfileStatus;
  checks: RiddleProofProfileCheckResult[];
  viewports: RiddleProofProfileViewportEvidence[];
}) {
  const passedChecks = input.checks.filter((check) => check.status === "passed").length;
  const failedChecks = input.checks.filter((check) => check.status === "failed").length;
  const viewportNames = input.viewports.map((viewport) => viewport.name).join(", ");
  if (input.status === "passed") {
    return `${input.profile_name} passed ${passedChecks} check(s) across ${input.viewports.length} viewport(s)${viewportNames ? ` (${viewportNames})` : ""}.`;
  }
  if (input.status === "product_regression") {
    return `${input.profile_name} failed ${failedChecks} product invariant(s) across ${input.viewports.length} viewport(s).`;
  }
  if (input.status === "environment_blocked") {
    return `${input.profile_name} could not collect reliable evidence because navigation or the browser environment was blocked.`;
  }
  if (input.status === "proof_insufficient") {
    return `${input.profile_name} did not produce enough evidence for a profile judgment.`;
  }
  if (input.status === "configuration_error") {
    return `${input.profile_name} has a profile configuration error.`;
  }
  return `${input.profile_name} collected artifacts but needs human review.`;
}

export function profileStatusExitCode(profile: RiddleProofProfile, status: RiddleProofProfileStatus) {
  if (status === "passed") return 0;
  return profile.failure_policy[status] === "neutral" ? 0 : 1;
}

export function createRiddleProofProfileConfigurationError(
  profileOrName: RiddleProofProfile | string,
  error: unknown,
  runner: RiddleProofProfileRunner = "riddle",
  options: { warnings?: string[]; configurationBlocker?: Record<string, JsonValue> } = {},
): RiddleProofProfileResult {
  const profile = typeof profileOrName === "string" ? undefined : profileOrName;
  const name = profile ? profile.name : String(profileOrName);
  const message = error instanceof Error ? error.message : String(error);
  let requested = "";
  if (profile) {
    try {
      requested = resolveRiddleProofProfileTargetUrl(profile);
    } catch {
      requested = "";
    }
  }
  return {
    version: RIDDLE_PROOF_PROFILE_RESULT_VERSION,
    profile_name: name,
    runner,
    status: "configuration_error",
    baseline_policy: profile?.baseline_policy || "invariant_only",
    route: { requested, observed: "", matched: false, error: message },
    artifacts: { screenshots: [], proof_json: "proof.json" },
    checks: [],
    summary: `${name} has a profile configuration error.`,
    captured_at: new Date().toISOString(),
    metadata: profile?.metadata,
    warnings: options.warnings?.length ? options.warnings : undefined,
    configuration_blocker: options.configurationBlocker,
    error: message,
  };
}

export function createRiddleProofProfileEnvironmentBlockedResult(input: {
  profile: RiddleProofProfile;
  runner?: RiddleProofProfileRunner;
  error?: unknown;
  environmentBlocker?: Record<string, JsonValue>;
  riddle?: RiddleProofProfileResult["riddle"];
  artifacts?: RiddleProofProfileArtifactRef[];
}): RiddleProofProfileResult {
  const message = input.error instanceof Error ? input.error.message : input.error ? String(input.error) : "Riddle runner did not complete successfully.";
  const environmentBlocker = input.environmentBlocker || extractRiddleRunnerBlocker(message);
  const warnings = collectRiddleProofProfileEnvironmentBlockedWarnings(input.profile, environmentBlocker);
  return {
    version: RIDDLE_PROOF_PROFILE_RESULT_VERSION,
    profile_name: input.profile.name,
    runner: input.runner || "riddle",
    status: "environment_blocked",
    baseline_policy: input.profile.baseline_policy,
    route: { requested: resolveRiddleProofProfileTargetUrl(input.profile), observed: "", matched: false, error: message },
    artifacts: { screenshots: [], proof_json: "proof.json", riddle_artifacts: input.artifacts },
    checks: [],
    summary: summarizeEnvironmentBlockedRunner(input.profile.name, environmentBlocker),
    captured_at: new Date().toISOString(),
    metadata: input.profile.metadata,
    warnings: warnings.length ? warnings : undefined,
    riddle: input.riddle,
    environment_blocker: environmentBlocker,
    error: message,
  };
}

function extractRiddleRunnerBlocker(message: string): Record<string, JsonValue> | undefined {
  const apiError = message.match(/^Riddle API\s+(\S+)\s+failed HTTP\s+(\d+):\s+(\{[\s\S]*\})$/);
  if (!apiError) return undefined;

  const details: Record<string, JsonValue> = {
    source: "riddle_api",
    endpoint: apiError[1],
    http_status: Number(apiError[2]),
  };

  let payload: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(apiError[3]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    payload = undefined;
  }

  const copyScalar = (key: string) => {
    const value = payload?.[key];
    if (typeof value === "string" || typeof value === "boolean") details[key] = value;
    if (typeof value === "number" && Number.isFinite(value)) details[key] = value;
  };

  for (const key of ["error", "required_seconds", "available_seconds", "deficit_seconds", "minimum_purchase_dollars"]) {
    copyScalar(key);
  }

  const warnings = payload?.warnings;
  if (Array.isArray(warnings)) {
    const warningStrings = warnings.filter((warning): warning is string => typeof warning === "string");
    if (warningStrings.length) details.warnings = warningStrings;
  }

  const httpStatus = typeof details.http_status === "number" ? details.http_status : undefined;
  const errorText = typeof details.error === "string" ? details.error.toLowerCase() : "";
  if (httpStatus === 402 && errorText.includes("balance")) {
    details.reason = "insufficient_balance";
  }

  return details;
}

function summarizeEnvironmentBlockedRunner(profileName: string, blocker: Record<string, JsonValue> | undefined) {
  if (blocker?.reason === "insufficient_balance") {
    const required = typeof blocker.required_seconds === "number" ? blocker.required_seconds : undefined;
    const available = typeof blocker.available_seconds === "number" ? blocker.available_seconds : undefined;
    const deficit = typeof blocker.deficit_seconds === "number" ? blocker.deficit_seconds : undefined;
    const parts = [
      required === undefined ? "" : `required ${required}s`,
      available === undefined ? "" : `available ${available}s`,
      deficit === undefined ? "" : `deficit ${deficit}s`,
    ].filter(Boolean);
    return `${profileName} could not start because Riddle balance was insufficient${parts.length ? ` (${parts.join(", ")})` : ""}.`;
  }
  if (blocker?.source === "riddle_api") {
    const endpoint = typeof blocker.endpoint === "string" ? blocker.endpoint : "Riddle API";
    const status = typeof blocker.http_status === "number" ? blocker.http_status : undefined;
    return `${profileName} could not start because ${endpoint} returned${status === undefined ? "" : ` HTTP ${status}`}.`;
  }
  return `${profileName} could not collect reliable evidence because the runner was blocked.`;
}

export function createRiddleProofProfileInsufficientResult(input: {
  profile: RiddleProofProfile;
  runner?: RiddleProofProfileRunner;
  error?: unknown;
  riddle?: RiddleProofProfileResult["riddle"];
  artifacts?: RiddleProofProfileArtifactRef[];
}): RiddleProofProfileResult {
  const message = input.error instanceof Error ? input.error.message : input.error ? String(input.error) : "No proof.json profile result artifact was found.";
  const warnings = collectRiddleProofProfileWarnings(input.profile);
  return {
    version: RIDDLE_PROOF_PROFILE_RESULT_VERSION,
    profile_name: input.profile.name,
    runner: input.runner || "riddle",
    status: "proof_insufficient",
    baseline_policy: input.profile.baseline_policy,
    route: { requested: resolveRiddleProofProfileTargetUrl(input.profile), observed: "", matched: false, error: message },
    artifacts: { screenshots: [], proof_json: "proof.json", riddle_artifacts: input.artifacts },
    checks: [],
    summary: `${input.profile.name} did not produce enough evidence for a profile judgment.`,
    captured_at: new Date().toISOString(),
    metadata: input.profile.metadata,
    warnings: warnings.length ? warnings : undefined,
    riddle: input.riddle,
    error: message,
  };
}

export function collectRiddleProfileArtifactRefs(input: unknown): RiddleProofProfileArtifactRef[] {
  const refs: RiddleProofProfileArtifactRef[] = [];
  const indexes = new Map<string, number>();
  const priorities = new Map<string, number>();
  function add(item: unknown, source: string) {
    if (!isRecord(item)) return;
    const url = stringValue(item.url);
    const path = stringValue(item.path);
    const rawName = stringValue(item.name) || stringValue(item.filename) || artifactNameFromPath(url || path) || "";
    const name = normalizeRiddleProfileArtifactName(rawName);
    if (!name && !url && !path) return;
    const key = profileArtifactDedupeKey(name, url || path || "");
    const priority = profileArtifactPriority(rawName, name);
    const ref = {
      name,
      url,
      path,
      kind: stringValue(item.kind) || stringValue(item.type),
      content_type: stringValue(item.content_type) || stringValue(item.contentType),
      source,
    };
    const existingIndex = indexes.get(key);
    if (existingIndex !== undefined) {
      if (priority > (priorities.get(key) || 0)) {
        refs[existingIndex] = ref;
        priorities.set(key, priority);
      }
      return;
    }
    indexes.set(key, refs.length);
    priorities.set(key, priority);
    refs.push(ref);
  }
  function visit(value: unknown, source: string) {
    if (Array.isArray(value)) {
      for (const item of value) add(item, source);
      return;
    }
    if (!isRecord(value)) return;
    for (const key of ["artifacts", "outputs", "screenshots", "files"]) {
      if (Array.isArray(value[key])) visit(value[key], key);
    }
  }
  visit(input, "artifacts");
  return refs;
}

function normalizeRiddleProfileArtifactName(name: string) {
  return name.replace(/\.json\.json$/i, ".json");
}

function profileArtifactDedupeKey(name: string, location: string) {
  if (PROFILE_SINGLETON_ARTIFACT_NAMES.has(name.toLowerCase())) return name.toLowerCase();
  return `${name}:${location}`;
}

function profileArtifactPriority(rawName: string, normalizedName: string) {
  const lower = normalizedName.toLowerCase();
  if (!PROFILE_SINGLETON_ARTIFACT_NAMES.has(lower)) return 1;
  return /\.json\.json$/i.test(rawName) ? 2 : 1;
}

function artifactNameFromPath(value: string | undefined) {
  if (!value) return "";
  try {
    return new URL(value).pathname.split("/").filter(Boolean).pop() || "";
  } catch {
    return value.split(/[\\/]/).filter(Boolean).pop() || "";
  }
}

const PROFILE_SINGLETON_ARTIFACT_NAMES = new Set([
  "proof.json",
  "console.json",
  "dom-summary.json",
]);

export function extractRiddleProofProfileResult(input: unknown): RiddleProofProfileResult | undefined {
  if (!isRecord(input)) return undefined;
  if (input.version === RIDDLE_PROOF_PROFILE_RESULT_VERSION) return input as unknown as RiddleProofProfileResult;
  const candidates = [
    input.result,
    input.return_value,
    input.value,
    input.profile_result,
    isRecord(input["proof.json"]) ? input["proof.json"] : undefined,
    isRecord(input._proof_json) ? input._proof_json : undefined,
  ];
  for (const candidate of candidates) {
    const result = extractRiddleProofProfileResult(candidate);
    if (result) return result;
  }
  if (isRecord(input._artifact_json)) {
    return extractRiddleProofProfileResult(input._artifact_json["proof.json"]);
  }
  return undefined;
}
