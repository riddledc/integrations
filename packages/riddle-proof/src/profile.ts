import type { JsonValue } from "./types";

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
  "selector_visible",
  "selector_absent",
  "selector_count_at_least",
  "selector_count_equals",
  "selector_count_equal",
  "selector_count_eq",
  "selector_text_order",
  "frame_text_visible",
  "frame_no_horizontal_overflow",
  "text_visible",
  "text_absent",
  "route_inventory",
  "no_horizontal_overflow",
  "no_mobile_horizontal_overflow",
  "no_fatal_console_errors",
] as const;

export const RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES = [
  "click",
  "fill",
  "set_input_value",
  "assert_text_visible",
  "assert_text_absent",
  "assert_selector_count",
  "local_storage",
  "session_storage",
  "clear_storage",
  "wait",
  "wait_for_selector",
  "wait_for_text",
] as const;

export type RiddleProofProfileStatus = typeof RIDDLE_PROOF_PROFILE_STATUSES[number];
export type RiddleProofProfileCheckType = typeof RIDDLE_PROOF_PROFILE_CHECK_TYPES[number];
export type RiddleProofProfileSetupActionType = typeof RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES[number];
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

export interface RiddleProofProfileViewport {
  name: string;
  width: number;
  height: number;
}

export interface RiddleProofProfileSetupAction {
  type: RiddleProofProfileSetupActionType;
  selector?: string;
  key?: string;
  value?: string;
  value_json?: JsonValue;
  text?: string;
  pattern?: string;
  flags?: string;
  index?: number;
  expected_count?: number;
  ms?: number;
  timeout_ms?: number;
  after_ms?: number;
  reload?: boolean;
  storage?: "local" | "session" | "both";
  continue_on_failure?: boolean;
}

export interface RiddleProofProfileNetworkMockResponse {
  label?: string;
  status: number;
  content_type?: string;
  headers?: Record<string, string>;
  body?: string;
  body_json?: JsonValue;
  delay_ms?: number;
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
  required_hit_count?: number;
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
  setup_actions?: RiddleProofProfileSetupAction[];
  network_mocks?: RiddleProofProfileNetworkMock[];
}

export interface RiddleProofProfileCheck {
  type: RiddleProofProfileCheckType;
  label?: string;
  expected_path?: string;
  expected_routes?: RiddleProofProfileRouteInventoryRoute[];
  selector?: string;
  expected_texts?: string[];
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
  route_inventory?: Record<string, JsonValue>;
  setup_action_results?: Array<Record<string, JsonValue>>;
  screenshot_label?: string;
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
  status: "passed" | "failed" | "skipped" | "needs_human_review";
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
    console?: string;
    proof_json?: string;
    dom_summary?: string;
    riddle_artifacts?: RiddleProofProfileArtifactRef[];
  };
  checks: RiddleProofProfileCheckResult[];
  summary: string;
  captured_at: string;
  evidence?: RiddleProofProfileEvidence;
  riddle?: {
    job_id?: string;
    status?: string | null;
    terminal?: boolean;
  };
  error?: string;
}

export interface RiddleProofProfileArtifactRef {
  name: string;
  url?: string;
  path?: string;
  kind?: string;
  content_type?: string;
  source?: string;
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

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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
  return {
    name: normalizeName(input.name || input.label, `viewport-${index + 1}`),
    width: Math.round(width),
    height: Math.round(height),
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
  const normalized = normalizedInput === "clear_browser_storage" ? "clear_storage" : normalizedInput;
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

function normalizeSetupAction(input: unknown, index: number): RiddleProofProfileSetupAction {
  if (!isRecord(input)) throw new Error(`target.setup_actions[${index}] must be an object.`);
  const type = normalizeSetupActionType(stringValue(input.type), index);
  const selector = stringValue(input.selector);
  if ((type === "click" || type === "fill" || type === "set_input_value" || type === "wait_for_selector" || type === "wait_for_text" || type === "assert_text_visible" || type === "assert_text_absent" || type === "assert_selector_count") && !selector) {
    throw new Error(`target.setup_actions[${index}] ${type} requires selector.`);
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
  if ((type === "fill" || type === "set_input_value") && value === undefined && !hasJsonValue) {
    throw new Error(`target.setup_actions[${index}] ${type} requires value.`);
  }
  const key = stringValue(input.key);
  if ((type === "local_storage" || type === "session_storage") && !key) {
    throw new Error(`target.setup_actions[${index}] ${type} requires key.`);
  }
  if ((type === "local_storage" || type === "session_storage") && value === undefined && !hasJsonValue) {
    throw new Error(`target.setup_actions[${index}] ${type} requires value.`);
  }
  return {
    type,
    selector,
    key,
    value,
    value_json: hasJsonValue ? toJsonValue(input.value_json ?? input.valueJson ?? input.json) : undefined,
    text: stringValue(input.text),
    pattern: stringValue(input.pattern),
    flags: stringValue(input.flags),
    index: numberValue(input.index),
    expected_count: expectedCount,
    ms: numberValue(input.ms) ?? numberValue(input.wait_ms) ?? numberValue(input.waitMs),
    timeout_ms: numberValue(input.timeout_ms) ?? numberValue(input.timeoutMs),
    after_ms: numberValue(input.after_ms) ?? numberValue(input.afterMs),
    reload: input.reload === true,
    storage: normalizeSetupActionStorage(input.storage, index),
    continue_on_failure: input.continue_on_failure === true || input.continueOnFailure === true,
  };
}

function normalizeSetupActions(value: unknown): RiddleProofProfileSetupAction[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("target.setup_actions must be an array.");
  return value.map(normalizeSetupAction);
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
    required_hit_count: requiredHitCount,
    required: input.required === false ? false : true,
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
  return {
    label: stringValue(input.label) || stringValue(input.name) || defaults.label,
    status,
    content_type: stringValue(input.content_type) || stringValue(input.contentType) || defaults.content_type,
    headers: stringRecord(input.headers) || defaults.headers,
    body,
    body_json: hasJsonBody ? toJsonValue(input.body_json ?? input.bodyJson ?? input.json) : defaults.body_json,
    delay_ms: normalizeNetworkMockDelay(input, label, defaults.delay_ms),
    capture_request_body: requestBody.capture_request_body,
    request_body_contains: requestBody.request_body_contains,
    request_body_patterns: requestBody.request_body_patterns,
    request_body_not_contains: requestBody.request_body_not_contains,
    request_body_not_patterns: requestBody.request_body_not_patterns,
  };
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

function normalizeCheck(input: unknown, index: number): RiddleProofProfileCheck {
  if (!isRecord(input)) throw new Error(`checks[${index}] must be an object.`);
  const type = stringValue(input.type);
  if (!type) throw new Error(`checks[${index}].type is required.`);
  if (!isSupportedCheckType(type)) {
    throw new Error(`checks[${index}].type ${type} is not supported. Supported checks: ${RIDDLE_PROOF_PROFILE_CHECK_TYPES.join(", ")}`);
  }
  if (
    (
      type === "selector_visible"
      || type === "selector_absent"
      || type === "selector_count_at_least"
      || type === "selector_count_equals"
      || type === "selector_count_equal"
      || type === "selector_count_eq"
    ) && !stringValue(input.selector)
  ) {
    throw new Error(`checks[${index}] ${type} requires selector.`);
  }
  if ((type === "frame_text_visible" || type === "frame_no_horizontal_overflow") && !stringValue(input.selector)) {
    throw new Error(`checks[${index}] ${type} requires selector.`);
  }
  if (type === "frame_text_visible" && !stringValue(input.text) && !stringValue(input.pattern)) {
    throw new Error(`checks[${index}] frame_text_visible requires text or pattern.`);
  }
  if ((type === "text_visible" || type === "text_absent") && !stringValue(input.text) && !stringValue(input.pattern)) {
    throw new Error(`checks[${index}] ${type} requires text or pattern.`);
  }
  if (type === "selector_count_at_least" && numberValue(input.min_count) === undefined) {
    throw new Error(`checks[${index}] selector_count_at_least requires min_count.`);
  }
  const expectedCount = numberValue(input.expected_count) ?? numberValue(input.expectedCount) ?? numberValue(input.count);
  if (
    (
      type === "selector_count_equals"
      || type === "selector_count_equal"
      || type === "selector_count_eq"
    ) && expectedCount === undefined
  ) {
    throw new Error(`checks[${index}] ${type} requires expected_count.`);
  }
  const expectedTexts = normalizeExpectedTexts(input.expected_texts ?? input.expectedTexts, index);
  if (type === "selector_text_order") {
    if (!stringValue(input.selector)) throw new Error(`checks[${index}] selector_text_order requires selector.`);
    if (!expectedTexts?.length) throw new Error(`checks[${index}] selector_text_order requires expected_texts.`);
  }
  const expectedRoutes = normalizeRouteInventoryRoutes(input.expected_routes ?? input.expectedRoutes, index);
  if (type === "route_inventory" && !expectedRoutes?.length) {
    throw new Error(`checks[${index}] route_inventory requires expected_routes.`);
  }
  return {
    type,
    label: stringValue(input.label),
    expected_path: stringValue(input.expected_path),
    expected_routes: expectedRoutes,
    selector: stringValue(input.selector),
    expected_texts: expectedTexts,
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
    min_count: numberValue(input.min_count),
    expected_count: expectedCount,
    max_overflow_px: numberValue(input.max_overflow_px),
    timeout_ms: numberValue(input.timeout_ms) ?? numberValue(input.timeoutMs),
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
      setup_actions: normalizeSetupActions(targetInput.setup_actions ?? targetInput.setupActions),
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

function textKey(check: RiddleProofProfileCheck) {
  return check.pattern ? `pattern:${check.pattern}/${check.flags || ""}` : `text:${check.text || ""}`;
}

function textSequenceForCheck(viewport: RiddleProofProfileViewportEvidence, check: RiddleProofProfileCheck): string[] {
  const key = selectorKey(check);
  const sequence = viewport.text_sequences?.[key];
  if (isRecord(sequence)) {
    const visibleTexts = Array.isArray(sequence.visible_texts) ? sequence.visible_texts : [];
    const texts = Array.isArray(sequence.texts) ? sequence.texts : [];
    const candidates = visibleTexts.length ? visibleTexts : texts;
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
  const duplicateSourceLinks = Array.isArray(inventory.duplicate_source_link_paths)
    ? inventory.duplicate_source_link_paths.map((path) => String(path))
    : [];
  const duplicateSourceLinkCount = numberValue(inventory.duplicate_source_link_count)
    ?? (sourceLinkCount !== null && sourceUniqueLinkCount !== null ? Math.max(0, sourceLinkCount - sourceUniqueLinkCount) : null);
  const failures = Array.isArray(inventory.failures) ? inventory.failures : [];
  return {
    viewport,
    source_link_count: sourceLinkCount,
    source_unique_link_count: sourceUniqueLinkCount,
    duplicate_source_link_count: duplicateSourceLinkCount,
    duplicate_source_links: duplicateSourceLinks,
    direct_route_count: directRoutes.length,
    clickthrough_count: clickthroughs.length,
    failure_count: failures.length,
  };
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

function viewportsForCheck(
  check: RiddleProofProfileCheck,
  viewports: RiddleProofProfileViewportEvidence[],
): RiddleProofProfileViewportEvidence[] {
  if (!check.viewports?.length) return viewports;
  const names = new Set(check.viewports);
  return viewports.filter((viewport) => names.has(viewport.name));
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

  if (check.type === "route_loaded") {
      const expectedPath = check.expected_path || new URL(evidence.target_url).pathname || "/";
      const failed = viewports.filter((viewport) => !successfulRoute({
        ...viewport.route,
        expected_path: expectedPath,
        matched: routePathMatches(viewport.route.observed, expectedPath, evidence.target_url) || viewport.route.matched,
      }, evidence.target_url));
    return {
      type: check.type,
      label: checkLabel(check),
      status: failed.length ? "failed" : "passed",
      evidence: {
        expected_path: expectedPath,
        observed_paths: viewports.map((viewport) => viewport.route.observed),
        http_statuses: viewports.map((viewport) => viewport.route.http_status ?? null),
      },
      message: failed.length ? `Route did not load as ${expectedPath} in ${failed.length} viewport(s).` : undefined,
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
        visible_texts: texts.slice(0, 20),
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
    const matches = viewports.map((viewport) => {
      const fromEvidence = viewport.text_matches?.[key];
      return typeof fromEvidence === "boolean"
        ? fromEvidence
        : matchText(viewport.body_text_sample || "", check);
    });
    const failed = matches.filter((matched) => matched !== expectedVisible).length;
    return {
      type: check.type,
      label: checkLabel(check),
      status: failed ? "failed" : "passed",
      evidence: {
        text: check.text || null,
        pattern: check.pattern || null,
        matches,
      },
      message: failed ? `Text assertion failed in ${failed} viewport(s).` : undefined,
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
        evidence: { expected_count: check.expected_routes?.length || 0 },
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
    const duplicateSourceLinks = Array.isArray(first?.duplicate_source_link_paths)
      ? first.duplicate_source_link_paths.map((path) => String(path))
      : [];
    const duplicateSourceLinkCount = numberValue(first?.duplicate_source_link_count)
      ?? (sourceLinkCount !== null && sourceUniqueLinkCount !== null ? Math.max(0, sourceLinkCount - sourceUniqueLinkCount) : null);
    return {
      type: check.type,
      label: checkLabel(check),
      status: failures.length ? "failed" : "passed",
      evidence: {
        expected_count: check.expected_routes?.length || 0,
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
      return {
        type: check.type,
        label: checkLabel(check),
        status: "failed",
        evidence: { max_overflow_px: maxOverflow },
        message: "No applicable viewport evidence was captured for overflow check.",
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
    const allowedConsoleEvents = fatalConsoleEvents.filter((event) => matchesAllowedMessage(event, check.allowed_console_texts, check.allowed_console_patterns));
    const unallowedConsoleEvents = fatalConsoleEvents.filter((event) => !matchesAllowedMessage(event, check.allowed_console_texts, check.allowed_console_patterns));
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
        allowed_page_error_count: allowedPageErrors.length,
        allowed_console_texts: check.allowed_console_texts || [],
        allowed_console_patterns: check.allowed_console_patterns || [],
        allowed_page_error_texts: check.allowed_page_error_texts || [],
        allowed_page_error_patterns: check.allowed_page_error_patterns || [],
      },
      message: fatalCount ? `${fatalCount} fatal browser error(s) were captured.` : undefined,
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
  for (const viewport of viewports) {
    const results = viewport.setup_action_results || [];
    for (const result of results) {
      if (result.ok === false) {
        failed.push({
          viewport: viewport.name,
          action: result.action ?? result.type ?? null,
          selector: result.selector ?? null,
          reason: result.reason ?? result.error ?? null,
        });
      }
    }
    if (results.length < actionCount && results.every((result) => result.ok !== false)) {
      failed.push({
        viewport: viewport.name,
        action: "setup_actions",
        selector: null,
        reason: `missing setup action results: ${results.length}/${actionCount}`,
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
        ok: (viewport.setup_action_results || []).length >= actionCount
          && (viewport.setup_action_results || []).every((result) => result.ok !== false),
        result_count: (viewport.setup_action_results || []).length,
      })),
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
  for (const mock of requiredMocks) {
    const hits = events.filter((event) => event.label === mock.label && event.ok !== false).length;
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
        events.filter((event) => event.label === mock.label && event.ok !== false).length,
      ])),
      required_hits_by_label: Object.fromEntries(requiredMocks.map((mock) => [
        mock.label,
        requiredNetworkMockHitCount(mock),
      ])),
      failed,
    },
    message: failed.length ? `Network mocks failed or were not hit for ${failed.length} mock(s).` : undefined,
  };
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
  if (checks.some((check) => check.status === "needs_human_review")) return "needs_human_review";
  if (checks.some((check) => check.status === "failed")) return "product_regression";
  return "passed";
}

export function assessRiddleProofProfileEvidence(
  profile: RiddleProofProfile,
  evidence: RiddleProofProfileEvidence | undefined,
  options: { runner?: RiddleProofProfileRunner; riddle?: RiddleProofProfileResult["riddle"]; artifacts?: RiddleProofProfileArtifactRef[] } = {},
): RiddleProofProfileResult {
  const capturedAt = evidence?.captured_at || new Date().toISOString();
  const checks = evidence
    ? [
      assessNetworkMocksFromEvidence(profile, evidence),
      assessSetupActionsFromEvidence(profile, evidence),
      ...profile.checks.map((check) => assessCheckFromEvidence(check, evidence)),
    ].filter((check): check is RiddleProofProfileCheckResult => Boolean(check))
    : [];
  const status = profileStatusFromEvidence(profile, evidence, checks);
  const firstViewport = evidence?.viewports?.[0];
  const screenshots = (evidence?.viewports || [])
    .map((viewport) => viewport.screenshot_label)
    .filter((label): label is string => Boolean(label));
  return {
    version: RIDDLE_PROOF_PROFILE_RESULT_VERSION,
    profile_name: profile.name,
    runner: options.runner || "riddle",
    status,
    baseline_policy: profile.baseline_policy,
    route: routeForViewport(firstViewport, evidence?.target_url),
    artifacts: {
      screenshots,
      console: "console.json",
      proof_json: "proof.json",
      dom_summary: "dom-summary.json",
      riddle_artifacts: options.artifacts,
    },
    checks,
    summary: summarizeRiddleProofProfileResult({ profile_name: profile.name, status, checks, viewports: evidence?.viewports || [] }),
    captured_at: capturedAt,
    evidence,
    riddle: options.riddle,
  };
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
  name: string,
  error: unknown,
  runner: RiddleProofProfileRunner = "riddle",
): RiddleProofProfileResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    version: RIDDLE_PROOF_PROFILE_RESULT_VERSION,
    profile_name: name,
    runner,
    status: "configuration_error",
    baseline_policy: "invariant_only",
    route: { requested: "", observed: "", matched: false, error: message },
    artifacts: { screenshots: [], proof_json: "proof.json" },
    checks: [],
    summary: `${name} has a profile configuration error.`,
    captured_at: new Date().toISOString(),
    error: message,
  };
}

export function createRiddleProofProfileEnvironmentBlockedResult(input: {
  profile: RiddleProofProfile;
  runner?: RiddleProofProfileRunner;
  error?: unknown;
  riddle?: RiddleProofProfileResult["riddle"];
  artifacts?: RiddleProofProfileArtifactRef[];
}): RiddleProofProfileResult {
  const message = input.error instanceof Error ? input.error.message : input.error ? String(input.error) : "Riddle runner did not complete successfully.";
  return {
    version: RIDDLE_PROOF_PROFILE_RESULT_VERSION,
    profile_name: input.profile.name,
    runner: input.runner || "riddle",
    status: "environment_blocked",
    baseline_policy: input.profile.baseline_policy,
    route: { requested: resolveRiddleProofProfileTargetUrl(input.profile), observed: "", matched: false, error: message },
    artifacts: { screenshots: [], proof_json: "proof.json", riddle_artifacts: input.artifacts },
    checks: [],
    summary: `${input.profile.name} could not collect reliable evidence because the runner was blocked.`,
    captured_at: new Date().toISOString(),
    riddle: input.riddle,
    error: message,
  };
}

export function createRiddleProofProfileInsufficientResult(input: {
  profile: RiddleProofProfile;
  runner?: RiddleProofProfileRunner;
  error?: unknown;
  riddle?: RiddleProofProfileResult["riddle"];
  artifacts?: RiddleProofProfileArtifactRef[];
}): RiddleProofProfileResult {
  const message = input.error instanceof Error ? input.error.message : input.error ? String(input.error) : "No proof.json profile result artifact was found.";
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
    riddle: input.riddle,
    error: message,
  };
}

function runtimeScriptAssessmentSource() {
  return String.raw`
function normalizeRoutePath(path) {
  const value = path || "/";
  if (value === "/") return "/";
  return value.replace(/\/+$/, "") || "/";
}
function previewMountPrefix(pathname) {
  const value = pathname || "/";
  const apiPreview = value.match(/^(\/s\/[^/]+)(?:\/|$)/);
  if (apiPreview) return apiPreview[1];
  const internalPreview = value.match(/^(\/preview\/[^/]+\/[^/]+)(?:\/|$)/);
  return internalPreview ? internalPreview[1] : "";
}
function joinMountedRoutePath(mountPrefix, routePath) {
  const route = routePath.startsWith("/") ? routePath : "/" + routePath;
  if (!mountPrefix) return route;
  if (route === mountPrefix || route.startsWith(mountPrefix + "/")) return route;
  return mountPrefix + route;
}
function mountedExpectedRoutePath(targetUrl, expected) {
  if (!targetUrl || !expected || !expected.startsWith("/")) return expected;
  const mountPrefix = previewMountPrefix(new URL(targetUrl).pathname);
  return mountPrefix ? joinMountedRoutePath(mountPrefix, expected) : expected;
}
function routePathMatches(observed, expected, targetUrl) {
  const normalizedObserved = normalizeRoutePath(observed);
  const normalizedExpected = normalizeRoutePath(expected);
  if (normalizedObserved === normalizedExpected) return true;
  return normalizedObserved === normalizeRoutePath(mountedExpectedRoutePath(targetUrl, expected));
}
function routeOk(route, targetUrl) {
  return Boolean(route && (route.matched || routePathMatches(route.observed, route.expected_path, targetUrl)) && !route.error && (route.http_status == null || route.http_status < 400));
}
function textMatches(sample, check) {
  if (check.pattern) {
    try { return new RegExp(check.pattern, check.flags || "").test(sample || ""); } catch { return false; }
  }
  return String(sample || "").includes(check.text || "");
}
function allowedMessageSample(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return String(input || "");
  const parts = [
    input.text,
    input.message,
    input.location && typeof input.location === "object" ? input.location.url : undefined,
  ];
  return parts.map((part) => String(part || "")).filter(Boolean).join(" ");
}
function matchesAllowedMessage(input, texts, patterns) {
  const sample = allowedMessageSample(input);
  if ((texts || []).some((text) => sample.includes(text))) return true;
  for (const pattern of patterns || []) {
    try {
      if (new RegExp(pattern).test(sample)) return true;
    } catch {}
  }
  return false;
}
function textSequenceForCheck(viewport, check) {
  const key = check.selector || "";
  const sequence = viewport.text_sequences && viewport.text_sequences[key];
  if (sequence && typeof sequence === "object") {
    const visibleTexts = Array.isArray(sequence.visible_texts) ? sequence.visible_texts : [];
    const texts = Array.isArray(sequence.texts) ? sequence.texts : [];
    const candidates = visibleTexts.length ? visibleTexts : texts;
    return candidates.map((text) => String(text || "").replace(/\s+/g, " ").trim()).filter(Boolean);
  }
  return [];
}
function textOrderMatch(texts, expectedTexts) {
  const positions = [];
  let startAt = 0;
  for (const expected of expectedTexts || []) {
    const index = texts.findIndex((text, offset) => offset >= startAt && text.includes(expected));
    if (index < 0) return { matched: false, positions };
    positions.push(index);
    startAt = index + 1;
  }
  return { matched: true, positions };
}
function frameEvidenceForSelector(viewport, selector) {
  const container = viewport.frames && viewport.frames[selector || ""];
  if (!container || typeof container !== "object" || Array.isArray(container)) return [];
  const frames = Array.isArray(container.frames) ? container.frames : [];
  return frames.filter((frame) => frame && typeof frame === "object" && !Array.isArray(frame));
}
function frameTextSample(frame) {
  return [
    frame && frame.title,
    frame && frame.text_sample,
    frame && frame.body_text_sample,
    frame && frame.body_text,
    frame && frame.text,
  ].map((part) => String(part || "")).filter(Boolean).join(" ");
}
function viewportsForCheck(check, viewports) {
  if (!Array.isArray(check.viewports) || !check.viewports.length) return viewports;
  const names = new Set(check.viewports);
  return viewports.filter((viewport) => names.has(viewport.name));
}
function summarizeRouteInventory(viewport, inventory) {
  const directRoutes = Array.isArray(inventory.direct_routes) ? inventory.direct_routes : [];
  const clickthroughs = Array.isArray(inventory.clickthroughs) ? inventory.clickthroughs : [];
  const sourceLinkCount = typeof inventory.source_link_count === "number" ? inventory.source_link_count : typeof inventory.home_game_link_count === "number" ? inventory.home_game_link_count : null;
  const sourceUniqueLinkCount = typeof inventory.source_unique_link_count === "number" ? inventory.source_unique_link_count : typeof inventory.home_unique_game_link_count === "number" ? inventory.home_unique_game_link_count : null;
  const duplicateSourceLinks = Array.isArray(inventory.duplicate_source_link_paths) ? inventory.duplicate_source_link_paths.map((path) => String(path)) : [];
  const duplicateSourceLinkCount = typeof inventory.duplicate_source_link_count === "number" ? inventory.duplicate_source_link_count : sourceLinkCount !== null && sourceUniqueLinkCount !== null ? Math.max(0, sourceLinkCount - sourceUniqueLinkCount) : null;
  const failures = Array.isArray(inventory.failures) ? inventory.failures : [];
  return {
    viewport,
    source_link_count: sourceLinkCount,
    source_unique_link_count: sourceUniqueLinkCount,
    duplicate_source_link_count: duplicateSourceLinkCount,
    duplicate_source_links: duplicateSourceLinks,
    direct_route_count: directRoutes.length,
    clickthrough_count: clickthroughs.length,
    failure_count: failures.length,
  };
}
function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function maxPositiveNumber() {
  let max = 0;
  for (const value of arguments) {
    const number = numberValue(value);
    if (number !== undefined && number > max) max = number;
  }
  return max;
}
function roundPixels(value) {
  return Math.round(value * 100) / 100;
}
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function boundsOffendersForEvidence(value) {
  if (!isRecord(value)) return [];
  const offenders = []
    .concat(Array.isArray(value.overflow_offenders) ? value.overflow_offenders : [])
    .concat(Array.isArray(value.overflowOffenders) ? value.overflowOffenders : [])
    .concat(Array.isArray(value.bounds_offenders) ? value.bounds_offenders : [])
    .concat(Array.isArray(value.boundsOffenders) ? value.boundsOffenders : [])
    .concat(Array.isArray(value.clipped_elements) ? value.clipped_elements : [])
    .concat(Array.isArray(value.clippedElements) ? value.clippedElements : [])
    .concat(Array.isArray(value.clipping_offenders) ? value.clipping_offenders : [])
    .concat(Array.isArray(value.clippingOffenders) ? value.clippingOffenders : []);
  return offenders.filter(isRecord).sort((a, b) => horizontalOffenderOverflowPx(b) - horizontalOffenderOverflowPx(a));
}
function horizontalOffenderOverflowPx(value) {
  if (!isRecord(value)) return 0;
  let max = maxPositiveNumber(
    value.overflow,
    value.overflow_px,
    value.bounds_overflow_px,
    value.horizontal_overflow_px,
    value.left_overflow_px,
    value.right_overflow_px,
    value.leftOverflowPx,
    value.rightOverflowPx
  );
  const clipped = value.clipped || value.clip || value.clipping;
  if (isRecord(clipped)) {
    max = Math.max(max, maxPositiveNumber(clipped.left, clipped.right, clipped.left_px, clipped.right_px, clipped.leftPx, clipped.rightPx));
  }
  const rect = value.rect || value.bounds || value.bounding_rect || value.boundingRect;
  const viewportWidth = numberValue(value.viewport_width != null ? value.viewport_width : value.viewportWidth);
  if (isRecord(rect) && viewportWidth !== undefined) {
    const left = numberValue(rect.left);
    const right = numberValue(rect.right);
    if (left !== undefined && left < 0) max = Math.max(max, Math.abs(left));
    if (right !== undefined && right > viewportWidth) max = Math.max(max, right - viewportWidth);
  }
  return roundPixels(max);
}
function horizontalBoundsOverflowPx(value) {
  if (!isRecord(value)) return 0;
  let max = maxPositiveNumber(
    value.overflow_px,
    value.overflow,
    value.bounds_overflow_px,
    value.horizontal_overflow_px,
    value.left_overflow_px,
    value.right_overflow_px
  );
  for (const offender of boundsOffendersForEvidence(value)) {
    max = Math.max(max, horizontalOffenderOverflowPx(offender));
  }
  return roundPixels(max);
}
function requiredNetworkMockHitCount(mock) {
  if (!mock || mock.required === false) return 0;
  if (Number.isInteger(mock.required_hit_count) && mock.required_hit_count > 0) return mock.required_hit_count;
  if (Array.isArray(mock.responses) && mock.responses.length) return mock.responses.length;
  return 1;
}
function assessProfile(profile, evidence) {
  const checks = [];
  const viewports = evidence.viewports || [];
  if (profile.target && Array.isArray(profile.target.network_mocks) && profile.target.network_mocks.length) {
    const events = evidence.network_mocks || [];
    const requiredMocks = profile.target.network_mocks.filter((mock) => mock && mock.required !== false);
    const failed = [];
    for (const mock of requiredMocks) {
      const hits = events.filter((event) => event && event.label === mock.label && event.ok !== false).length;
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
    for (const event of events) {
      if (event && event.ok === false) {
        failed.push({
          label: event.label || null,
          url: event.url || null,
          method: event.method || null,
          reason: event.reason || event.error || "mock_failed",
        });
      }
      if (event && event.request_body_matches === false) {
        failed.push({
          label: event.label || null,
          response_label: event.response_label || null,
          hit_index: event.hit_index ?? null,
          response_index: event.response_index ?? null,
          url: event.url || null,
          method: event.method || null,
          reason: "request_body_mismatch",
          request_body_failures: event.request_body_failures || [],
          request_body_length: event.request_body_length || null,
          request_body_sample: event.request_body_sample || null,
        });
      }
    }
    const hitsByLabel = {};
    const requiredHitsByLabel = {};
    for (const mock of profile.target.network_mocks) {
      hitsByLabel[mock.label] = events.filter((event) => event && event.label === mock.label && event.ok !== false).length;
      if (mock && mock.required !== false) requiredHitsByLabel[mock.label] = requiredNetworkMockHitCount(mock);
    }
    checks.push({
      type: "network_mocks_succeeded",
      label: "network mocks succeeded",
      status: failed.length ? "failed" : "passed",
      evidence: {
        mock_count: profile.target.network_mocks.length,
        required_count: requiredMocks.length,
        hit_count: events.filter((event) => event && event.ok !== false).length,
        hits_by_label: hitsByLabel,
        required_hits_by_label: requiredHitsByLabel,
        failed,
      },
      message: failed.length ? "Network mocks failed or were not hit for " + failed.length + " mock(s)." : undefined,
    });
  }
  if (profile.target && Array.isArray(profile.target.setup_actions) && profile.target.setup_actions.length) {
    const actionCount = profile.target.setup_actions.length;
    const failed = [];
    for (const viewport of viewports) {
      const results = viewport.setup_action_results || [];
      for (const result of results) {
        if (result && result.ok === false) {
          failed.push({
            viewport: viewport.name,
            action: result.action || result.type || null,
            selector: result.selector || null,
            reason: result.reason || result.error || null,
          });
        }
      }
      if (results.length < actionCount && results.every((result) => !result || result.ok !== false)) {
        failed.push({
          viewport: viewport.name,
          action: "setup_actions",
          selector: null,
          reason: "missing setup action results: " + results.length + "/" + actionCount,
        });
      }
    }
    checks.push({
      type: "setup_actions_succeeded",
      label: "setup actions succeeded",
      status: failed.length ? "failed" : "passed",
      evidence: {
        action_count: actionCount,
        viewports: viewports.map((viewport) => ({
          name: viewport.name,
          ok: (viewport.setup_action_results || []).length >= actionCount
            && (viewport.setup_action_results || []).every((result) => !result || result.ok !== false),
          result_count: (viewport.setup_action_results || []).length,
        })),
        failed,
      },
      message: failed.length ? "Setup actions failed in " + failed.length + " viewport action(s)." : undefined,
    });
  }
  for (const check of profile.checks || []) {
    const checkViewports = viewportsForCheck(check, viewports);
    if (!checkViewports.length) {
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: "failed",
        evidence: { expected_viewports: check.viewports || [] },
        message: Array.isArray(check.viewports) && check.viewports.length
          ? "No matching viewport evidence was captured for " + check.viewports.join(", ") + "."
          : "No viewport evidence was captured.",
      });
      continue;
    }
    if (check.type === "route_loaded") {
      const expectedPath = check.expected_path || new URL(evidence.target_url).pathname || "/";
      const failed = checkViewports.filter((viewport) => {
        const route = { ...(viewport.route || {}), expected_path: expectedPath };
        route.matched = routePathMatches(route.observed, expectedPath, evidence.target_url) || route.matched;
        return !routeOk(route, evidence.target_url);
      });
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failed.length ? "failed" : "passed",
        evidence: {
          expected_path: expectedPath,
          observed_paths: checkViewports.map((viewport) => viewport.route && viewport.route.observed),
          http_statuses: checkViewports.map((viewport) => viewport.route ? viewport.route.http_status ?? null : null),
        },
        message: failed.length ? "Route did not load as " + expectedPath + " in " + failed.length + " viewport(s)." : undefined,
      });
      continue;
    }
    if (check.type === "selector_visible") {
      const selector = check.selector || "";
      const failed = checkViewports.filter((viewport) => !viewport.selectors || !viewport.selectors[selector] || viewport.selectors[selector].visible_count < 1);
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failed.length ? "failed" : "passed",
        evidence: { selector, visible_counts: checkViewports.map((viewport) => viewport.selectors && viewport.selectors[selector] ? viewport.selectors[selector].visible_count : 0) },
        message: failed.length ? "Selector " + selector + " was not visible in " + failed.length + " viewport(s)." : undefined,
      });
      continue;
    }
    if (check.type === "selector_absent") {
      const selector = check.selector || "";
      const failed = checkViewports.filter((viewport) => viewport.selectors && viewport.selectors[selector] && viewport.selectors[selector].count > 0);
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failed.length ? "failed" : "passed",
        evidence: { selector, counts: checkViewports.map((viewport) => viewport.selectors && viewport.selectors[selector] ? viewport.selectors[selector].count : 0) },
        message: failed.length ? "Selector " + selector + " was present in " + failed.length + " viewport(s)." : undefined,
      });
      continue;
    }
    if (check.type === "selector_count_at_least") {
      const selector = check.selector || "";
      const minCount = check.min_count == null ? 1 : check.min_count;
      const failed = checkViewports.filter((viewport) => !viewport.selectors || !viewport.selectors[selector] || viewport.selectors[selector].count < minCount);
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failed.length ? "failed" : "passed",
        evidence: { selector, min_count: minCount, counts: checkViewports.map((viewport) => viewport.selectors && viewport.selectors[selector] ? viewport.selectors[selector].count : 0) },
        message: failed.length ? "Selector " + selector + " count was below " + minCount + " in " + failed.length + " viewport(s)." : undefined,
      });
      continue;
    }
    if (check.type === "selector_count_equals" || check.type === "selector_count_equal" || check.type === "selector_count_eq") {
      const selector = check.selector || "";
      const expectedCount = check.expected_count == null ? 0 : check.expected_count;
      const failed = checkViewports.filter((viewport) => (viewport.selectors && viewport.selectors[selector] ? viewport.selectors[selector].count : 0) !== expectedCount);
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failed.length ? "failed" : "passed",
        evidence: { selector, expected_count: expectedCount, counts: checkViewports.map((viewport) => viewport.selectors && viewport.selectors[selector] ? viewport.selectors[selector].count : 0) },
        message: failed.length ? "Selector " + selector + " count did not equal " + expectedCount + " in " + failed.length + " viewport(s)." : undefined,
      });
      continue;
    }
    if (check.type === "selector_text_order") {
      const selector = check.selector || "";
      const expectedTexts = check.expected_texts || [];
      const results = checkViewports.map((viewport) => {
        const texts = textSequenceForCheck(viewport, check);
        const match = textOrderMatch(texts, expectedTexts);
        return {
          viewport: viewport.name,
          matched: match.matched,
          matched_positions: match.positions,
          visible_texts: texts.slice(0, 20),
        };
      });
      const failed = results.filter((result) => !result.matched).length;
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failed ? "failed" : "passed",
        evidence: { selector, expected_texts: expectedTexts, viewports: results },
        message: failed ? "Selector " + selector + " text order failed in " + failed + " viewport(s)." : undefined,
      });
      continue;
    }
    if (check.type === "frame_text_visible") {
      const selector = check.selector || "";
      const results = checkViewports.map((viewport) => {
        const frames = frameEvidenceForSelector(viewport, selector);
        const matches = frames
          .map((frame, index) => ({ index, frame, matched: textMatches(frameTextSample(frame), check) }))
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
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failed ? "failed" : "passed",
        evidence: { selector, text: check.text || null, pattern: check.pattern || null, viewports: results },
        message: failed ? "Frame selector " + selector + " did not contain expected text in " + failed + " viewport(s)." : undefined,
      });
      continue;
    }
    if (check.type === "frame_no_horizontal_overflow") {
      const selector = check.selector || "";
      const maxOverflow = check.max_overflow_px == null ? 4 : check.max_overflow_px;
      const results = checkViewports.map((viewport) => {
        const frames = frameEvidenceForSelector(viewport, selector);
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
          frames: frameOverflows,
        };
      });
      const failed = results.filter((result) => result.frame_count < 1 || result.failed_frame_count > 0).length;
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failed ? "failed" : "passed",
        evidence: { selector, max_overflow_px: maxOverflow, viewports: results },
        message: failed ? "Frame selector " + selector + " overflow exceeded " + maxOverflow + "px or was missing in " + failed + " viewport(s)." : undefined,
      });
      continue;
    }
    if (check.type === "text_visible" || check.type === "text_absent") {
      const key = check.pattern ? "pattern:" + check.pattern + "/" + (check.flags || "") : "text:" + (check.text || "");
      const expectedVisible = check.type === "text_visible";
      const matches = checkViewports.map((viewport) => viewport.text_matches && typeof viewport.text_matches[key] === "boolean" ? viewport.text_matches[key] : textMatches(viewport.body_text_sample || "", check));
      const failed = matches.filter((matched) => matched !== expectedVisible).length;
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failed ? "failed" : "passed",
        evidence: { text: check.text, pattern: check.pattern, matches },
        message: failed ? "Text assertion failed in " + failed + " viewport(s)." : undefined,
      });
      continue;
    }
    if (check.type === "route_inventory") {
      const inventories = checkViewports
        .map((viewport) => ({ viewport: viewport.name, inventory: viewport.route_inventory }))
        .filter((item) => item.inventory && typeof item.inventory === "object");
      if (!inventories.length) {
        checks.push({
          type: check.type,
          label: check.label || check.type,
          status: "failed",
          evidence: { expected_count: (check.expected_routes || []).length },
          message: "No route inventory evidence was captured.",
        });
        continue;
      }
      const viewportSummaries = inventories.map((item) => summarizeRouteInventory(item.viewport, item.inventory || {}));
      const failures = [];
      for (const item of inventories) {
        for (const failure of Array.isArray(item.inventory.failures) ? item.inventory.failures : []) {
          failures.push({ viewport: item.viewport, failure });
        }
      }
      const first = inventories[0].inventory || {};
      const directRoutes = Array.isArray(first.direct_routes) ? first.direct_routes : [];
      const clickthroughs = Array.isArray(first.clickthroughs) ? first.clickthroughs : [];
      const sourceLinkCount = typeof first.source_link_count === "number" ? first.source_link_count : typeof first.home_game_link_count === "number" ? first.home_game_link_count : null;
      const sourceUniqueLinkCount = typeof first.source_unique_link_count === "number" ? first.source_unique_link_count : typeof first.home_unique_game_link_count === "number" ? first.home_unique_game_link_count : null;
      const duplicateSourceLinks = Array.isArray(first.duplicate_source_link_paths) ? first.duplicate_source_link_paths.map((path) => String(path)) : [];
      const duplicateSourceLinkCount = typeof first.duplicate_source_link_count === "number" ? first.duplicate_source_link_count : sourceLinkCount !== null && sourceUniqueLinkCount !== null ? Math.max(0, sourceLinkCount - sourceUniqueLinkCount) : null;
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failures.length ? "failed" : "passed",
        evidence: {
          expected_count: (check.expected_routes || []).length,
          source_link_count: sourceLinkCount,
          source_unique_link_count: sourceUniqueLinkCount,
          duplicate_source_link_count: duplicateSourceLinkCount,
          duplicate_source_links: duplicateSourceLinks,
          duplicates_allowed: check.require_unique_routes === false,
          homepage_link_count: typeof first.home_game_link_count === "number" ? first.home_game_link_count : sourceLinkCount,
          homepage_unique_link_count: typeof first.home_unique_game_link_count === "number" ? first.home_unique_game_link_count : sourceUniqueLinkCount,
          direct_route_count: directRoutes.length,
          clickthrough_count: clickthroughs.length,
          viewport_count: inventories.length,
          viewports: viewportSummaries,
          failures,
        },
        message: failures.length ? "Route inventory failed with " + failures.length + " issue(s)." : undefined,
      });
      continue;
    }
    if (check.type === "no_horizontal_overflow" || check.type === "no_mobile_horizontal_overflow") {
      const maxOverflow = check.max_overflow_px == null ? 4 : check.max_overflow_px;
      const applicable = check.type === "no_mobile_horizontal_overflow" ? checkViewports.filter((viewport) => viewport.width <= 820) : checkViewports;
      if (!applicable.length) {
        checks.push({
          type: check.type,
          label: check.label || check.type,
          status: "failed",
          evidence: { max_overflow_px: maxOverflow },
          message: "No applicable viewport evidence was captured for overflow check.",
        });
        continue;
      }
      const failed = applicable.filter((viewport) => horizontalBoundsOverflowPx(viewport) > maxOverflow);
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failed.length ? "failed" : "passed",
        evidence: {
          max_overflow_px: maxOverflow,
          overflow_px: applicable.map((viewport) => viewport.overflow_px ?? null),
          bounds_overflow_px: applicable.map((viewport) => horizontalBoundsOverflowPx(viewport)),
          overflow_offender_counts: applicable.map((viewport) => boundsOffendersForEvidence(viewport).length),
          viewports: applicable.map((viewport) => viewport.name)
        },
        message: failed.length ? "Horizontal bounds overflow exceeded " + maxOverflow + "px in " + failed.length + " viewport(s)." : undefined,
      });
      continue;
    }
    if (check.type === "no_fatal_console_errors") {
      const fatalConsoleEvents = ((evidence.console && evidence.console.events) || []).filter((event) => event && (event.type === "error" || event.type === "assert"));
      const allowedConsoleEvents = fatalConsoleEvents.filter((event) => matchesAllowedMessage(event, check.allowed_console_texts, check.allowed_console_patterns));
      const unallowedConsoleEvents = fatalConsoleEvents.filter((event) => !matchesAllowedMessage(event, check.allowed_console_texts, check.allowed_console_patterns));
      const pageErrors = evidence.page_errors || [];
      const allowedPageErrors = pageErrors.filter((error) => matchesAllowedMessage(error, check.allowed_page_error_texts, check.allowed_page_error_patterns));
      const unallowedPageErrors = pageErrors.filter((error) => !matchesAllowedMessage(error, check.allowed_page_error_texts, check.allowed_page_error_patterns));
      const fatalCount = unallowedConsoleEvents.length + unallowedPageErrors.length;
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: fatalCount ? "failed" : "passed",
        evidence: {
          console_fatal_count: unallowedConsoleEvents.length,
          page_error_count: unallowedPageErrors.length,
          total_console_fatal_count: fatalConsoleEvents.length,
          total_page_error_count: pageErrors.length,
          allowed_console_fatal_count: allowedConsoleEvents.length,
          allowed_page_error_count: allowedPageErrors.length,
          allowed_console_texts: check.allowed_console_texts || [],
          allowed_console_patterns: check.allowed_console_patterns || [],
          allowed_page_error_texts: check.allowed_page_error_texts || [],
          allowed_page_error_patterns: check.allowed_page_error_patterns || [],
        },
        message: fatalCount ? String(fatalCount) + " fatal browser error(s) were captured." : undefined,
      });
      continue;
    }
    checks.push({ type: check.type, label: check.label || check.type, status: "needs_human_review", evidence: {}, message: "Unsupported check type." });
  }
  let status = "passed";
  const expectedViewportCount = profile.target && Array.isArray(profile.target.viewports) ? profile.target.viewports.length : 0;
  if (!viewports.length || !checks.length) status = "proof_insufficient";
  else if (viewports.some((viewport) => viewport.navigation_error)) status = "environment_blocked";
  else if (expectedViewportCount && viewports.length < expectedViewportCount) status = "proof_insufficient";
  else if (checks.some((check) => check.status === "needs_human_review")) status = "needs_human_review";
  else if (checks.some((check) => check.status === "failed")) status = "product_regression";
  const screenshotLabels = viewports.map((viewport) => viewport.screenshot_label).filter(Boolean);
  const route = viewports[0] && viewports[0].route ? viewports[0].route : { requested: evidence.target_url, observed: "", matched: false, error: "missing viewport evidence" };
  const passedChecks = checks.filter((check) => check.status === "passed").length;
  const failedChecks = checks.filter((check) => check.status === "failed").length;
  const viewportNames = viewports.map((viewport) => viewport.name).join(", ");
  let summary = profile.name + " collected artifacts but needs human review.";
  if (status === "passed") summary = profile.name + " passed " + passedChecks + " check(s) across " + viewports.length + " viewport(s)" + (viewportNames ? " (" + viewportNames + ")." : ".");
  if (status === "product_regression") summary = profile.name + " failed " + failedChecks + " product invariant(s) across " + viewports.length + " viewport(s).";
  if (status === "environment_blocked") summary = profile.name + " could not collect reliable evidence because navigation or the browser environment was blocked.";
  if (status === "proof_insufficient") summary = profile.name + " did not produce enough evidence for a profile judgment.";
  return {
    version: "riddle-proof.profile-result.v1",
    profile_name: profile.name,
    runner: "riddle",
    status,
    baseline_policy: profile.baseline_policy || "invariant_only",
    route,
    artifacts: { screenshots: screenshotLabels, console: "console.json", proof_json: "proof.json", dom_summary: "dom-summary.json" },
    checks,
    summary,
    captured_at: evidence.captured_at,
    evidence,
  };
}
`;
}

export function buildRiddleProofProfileScript(profile: RiddleProofProfile) {
  const targetUrl = resolveRiddleProofProfileTargetUrl(profile);
  const slug = slugifyRiddleProofProfileName(profile.name);
  const serializableProfile = JSON.stringify(profile);
  const serializableTargetUrl = JSON.stringify(targetUrl);
  const serializableSlug = JSON.stringify(slug);
  return String.raw`
const profile = ${serializableProfile};
const targetUrl = ${serializableTargetUrl};
const profileSlug = ${serializableSlug};
const capturedAt = new Date().toISOString();
const consoleEvents = [];
const pageErrors = [];
const networkMockEvents = [];
page.on("console", (message) => {
  const type = message.type();
  if (type === "error" || type === "warning" || type === "assert") {
    consoleEvents.push({
      type,
      text: message.text().slice(0, 1000),
      location: message.location ? message.location() : undefined,
    });
  }
});
page.on("pageerror", (error) => {
  pageErrors.push({ message: String(error && error.message ? error.message : error).slice(0, 1000) });
});
function textKey(check) {
  return check.pattern ? "pattern:" + check.pattern + "/" + (check.flags || "") : "text:" + (check.text || "");
}
function textMatches(sample, check) {
  if (check.pattern) {
    try { return new RegExp(check.pattern, check.flags || "").test(sample || ""); } catch { return false; }
  }
  return String(sample || "").includes(check.text || "");
}
function setupActionType(action) {
  return String(action && action.type ? action.type : "").replace(/-/g, "_");
}
function setupNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}
function setupTextMatches(sample, action) {
  if (action.pattern) {
    try { return new RegExp(action.pattern, action.flags || "").test(sample || ""); } catch { return false; }
  }
  return String(sample || "").includes(action.text || "");
}
function setupHasOwn(action, key) {
  return Boolean(action) && Object.keys(action).includes(key);
}
function setupActionValue(action) {
  if (setupHasOwn(action, "value_json")) return JSON.stringify(action.value_json);
  if (setupHasOwn(action, "value")) return String(action.value ?? "");
  return "";
}
async function setupLocatorText(locator, index) {
  return await locator.nth(index).textContent({ timeout: 1000 }).catch(() => "");
}
function compactSetupResultText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= 500) return text;
  return text.slice(0, 500) + "... (" + text.length + " chars)";
}
function compactNetworkMockRequestBody(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= 1000) return text;
  return text.slice(0, 1000) + "... (" + text.length + " chars)";
}
function networkMockStringList(value) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}
function networkMockShouldCaptureRequestBody(...sources) {
  return sources.some((source) => source && (
    source.capture_request_body === true
    || networkMockStringList(source.request_body_contains).length > 0
    || networkMockStringList(source.request_body_patterns).length > 0
    || networkMockStringList(source.request_body_not_contains).length > 0
    || networkMockStringList(source.request_body_not_patterns).length > 0
  ));
}
function networkMockRequestBodyFailuresForSource(body, source) {
  const failures = [];
  if (!source) return failures;
  const rawBody = String(body || "");
  const compactBody = compactNetworkMockRequestBody(rawBody);
  for (const expected of networkMockStringList(source.request_body_contains)) {
    if (!rawBody.includes(expected) && !compactBody.includes(expected)) {
      failures.push({
        type: "request_body_missing_text",
        text: String(expected).slice(0, 200),
      });
    }
  }
  for (const pattern of networkMockStringList(source.request_body_patterns)) {
    try {
      const regex = new RegExp(pattern);
      if (!regex.test(rawBody) && !regex.test(compactBody)) {
        failures.push({
          type: "request_body_pattern_not_matched",
          pattern: String(pattern).slice(0, 200),
        });
      }
    } catch (error) {
      failures.push({
        type: "request_body_invalid_pattern",
        pattern: String(pattern).slice(0, 200),
        error: String(error && error.message ? error.message : error).slice(0, 500),
      });
    }
  }
  for (const forbidden of networkMockStringList(source.request_body_not_contains)) {
    if (rawBody.includes(forbidden) || compactBody.includes(forbidden)) {
      failures.push({
        type: "request_body_forbidden_text",
        text: String(forbidden).slice(0, 200),
      });
    }
  }
  for (const pattern of networkMockStringList(source.request_body_not_patterns)) {
    try {
      const regex = new RegExp(pattern);
      if (regex.test(rawBody) || regex.test(compactBody)) {
        failures.push({
          type: "request_body_forbidden_pattern_matched",
          pattern: String(pattern).slice(0, 200),
        });
      }
    } catch (error) {
      failures.push({
        type: "request_body_invalid_pattern",
        pattern: String(pattern).slice(0, 200),
        error: String(error && error.message ? error.message : error).slice(0, 500),
      });
    }
  }
  return failures;
}
function networkMockRequestBodyFailures(body, ...sources) {
  return sources.flatMap((source) => networkMockRequestBodyFailuresForSource(body, source));
}
async function setupLocatorVisible(locator, index) {
  return await locator.nth(index).isVisible({ timeout: 1000 }).catch(() => false);
}
async function registerNetworkMocks(mocks) {
  for (const mock of mocks || []) {
    let hitCount = 0;
    await page.route(mock.url, async (route) => {
      const request = route.request();
      const method = request.method ? request.method() : "";
      if (mock.method && method.toUpperCase() !== String(mock.method).toUpperCase()) {
        await route.continue();
        return;
      }
      try {
        const responses = Array.isArray(mock.responses) ? mock.responses : [];
        const hitIndex = hitCount;
        hitCount += 1;
        const responseIndex = responses.length
          ? (mock.repeat_responses ? hitIndex % responses.length : Math.min(hitIndex, responses.length - 1))
          : null;
        const response = responseIndex === null ? mock : responses[responseIndex];
        const headers = { ...(response.headers || mock.headers || {}) };
        let body = response.body || "";
        let contentType = response.content_type || headers["content-type"] || headers["Content-Type"] || "text/plain";
        if (response.body_json !== undefined) {
          body = JSON.stringify(response.body_json);
          contentType = response.content_type || headers["content-type"] || headers["Content-Type"] || "application/json";
        }
        const responseBodyContract = responseIndex === null ? null : response;
        const shouldCaptureRequestBody = networkMockShouldCaptureRequestBody(mock, responseBodyContract);
        const requestBody = shouldCaptureRequestBody && request.postData ? request.postData() || "" : "";
        const requestBodyFailures = shouldCaptureRequestBody ? networkMockRequestBodyFailures(requestBody, mock, responseBodyContract) : [];
        const status = response.status || mock.status || 200;
        const delayMs = numberValue(response.delay_ms) || 0;
        const event = {
          ok: true,
          label: mock.label,
          response_label: response.label || null,
          hit_index: hitIndex,
          response_index: responseIndex,
          sequence_reused: responseIndex !== null && !mock.repeat_responses && hitIndex >= responses.length,
          sequence_cycle: responseIndex !== null && mock.repeat_responses === true && hitIndex >= responses.length,
          url: request.url(),
          method,
          status,
        };
        if (delayMs) event.delay_ms = delayMs;
        if (shouldCaptureRequestBody) {
          event.request_body_matches = requestBodyFailures.length === 0;
          event.request_body_failures = requestBodyFailures;
          event.request_body_length = requestBody.length;
          event.request_body_sample = compactNetworkMockRequestBody(requestBody);
        }
        networkMockEvents.push(event);
        if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
        await route.fulfill({
          status,
          headers,
          contentType,
          body,
        });
      } catch (error) {
        networkMockEvents.push({
          ok: false,
          label: mock.label,
          url: request.url(),
          method,
          error: String(error && error.message ? error.message : error).slice(0, 1000),
        });
        throw error;
      }
    });
  }
}
async function executeSetupAction(action, ordinal) {
  const type = setupActionType(action);
  const base = { ok: false, action: type || "unknown", ordinal, selector: action.selector || null };
  const timeout = setupNumber(action.timeout_ms, 5000);
  try {
    if (type === "wait") {
      const ms = setupNumber(action.ms, 500);
      await page.waitForTimeout(ms);
      return { ...base, ok: true, ms };
    }
    if (type === "wait_for_selector") {
      await page.waitForSelector(action.selector, { state: "visible", timeout });
      return { ...base, ok: true, timeout_ms: timeout };
    }
    if (type === "local_storage" || type === "session_storage") {
      const value = setupActionValue(action);
      await page.evaluate(({ type, key, value }) => {
        const storage = type === "session_storage" ? window.sessionStorage : window.localStorage;
        storage.setItem(key, value);
      }, { type, key: action.key, value });
      if (action.reload === true) {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
      }
      return { ...base, ok: true, key: action.key, value_length: value.length, reload: action.reload === true };
    }
    if (type === "clear_storage") {
      const storage = action.storage || "both";
      await page.evaluate(({ storage }) => {
        if (storage === "local" || storage === "both") window.localStorage.clear();
        if (storage === "session" || storage === "both") window.sessionStorage.clear();
      }, { storage });
      if (action.reload === true) {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
      }
      return { ...base, ok: true, storage, reload: action.reload === true };
    }
    if (type === "click") {
      const locator = page.locator(action.selector);
      const count = await locator.count();
      if (!count) return { ...base, reason: "selector_not_found", count };
      let targetIndex = Number.isInteger(action.index) ? action.index : 0;
      let matchedText = null;
      let hiddenMatchIndex = -1;
      let hiddenMatchedText = null;
      if (action.text || action.pattern) {
        targetIndex = -1;
        for (let index = 0; index < count; index += 1) {
          const text = await setupLocatorText(locator, index);
          if (setupTextMatches(text, action)) {
            const visible = await setupLocatorVisible(locator, index);
            if (visible) {
              targetIndex = index;
              matchedText = compactSetupResultText(text);
              break;
            }
            if (hiddenMatchIndex < 0) {
              hiddenMatchIndex = index;
              hiddenMatchedText = compactSetupResultText(text);
            }
          }
        }
        if (targetIndex < 0 && hiddenMatchIndex >= 0) return { ...base, reason: "matching_element_not_visible", count, target_index: hiddenMatchIndex, text: hiddenMatchedText };
        if (targetIndex < 0) return { ...base, reason: "text_not_found", count };
      }
      if (targetIndex < 0 || targetIndex >= count) return { ...base, reason: "index_out_of_range", count, target_index: targetIndex };
      await locator.nth(targetIndex).click({ timeout, noWaitAfter: true });
      return { ...base, ok: true, count, target_index: targetIndex, text: matchedText };
    }
    if (type === "fill" || type === "set_input_value") {
      const locator = page.locator(action.selector);
      const count = await locator.count();
      if (!count) return { ...base, reason: "selector_not_found", count };
      const targetIndex = Number.isInteger(action.index) ? action.index : 0;
      if (targetIndex < 0 || targetIndex >= count) return { ...base, reason: "index_out_of_range", count, target_index: targetIndex };
      const value = setupActionValue(action);
      await locator.nth(targetIndex).fill(value, { timeout });
      return { ...base, ok: true, count, target_index: targetIndex, value_length: value.length };
    }
    if (type === "assert_selector_count") {
      const locator = page.locator(action.selector);
      const expectedCount = setupNumber(action.expected_count, -1);
      if (!Number.isInteger(expectedCount) || expectedCount < 0) return { ...base, reason: "invalid_expected_count", expected_count: action.expected_count };
      const startedAt = Date.now();
      let count = 0;
      while (Date.now() - startedAt <= timeout) {
        count = await locator.count().catch(() => 0);
        if (count === expectedCount) return { ...base, ok: true, count, expected_count: expectedCount, timeout_ms: timeout };
        await page.waitForTimeout(100);
      }
      return { ...base, reason: "selector_count_mismatch", count, expected_count: expectedCount, timeout_ms: timeout };
    }
    if (type === "wait_for_text") {
      const locator = page.locator(action.selector);
      const startedAt = Date.now();
      let lastText = "";
      while (Date.now() - startedAt <= timeout) {
        const count = await locator.count().catch(() => 0);
        for (let index = 0; index < count; index += 1) {
          const text = await setupLocatorText(locator, index);
          lastText = text || lastText;
          if (setupTextMatches(text, action)) {
            return { ...base, ok: true, text: compactSetupResultText(text), target_index: index, timeout_ms: timeout };
          }
        }
        await page.waitForTimeout(100);
      }
      return { ...base, reason: "text_not_found", text: compactSetupResultText(lastText), timeout_ms: timeout };
    }
    if (type === "assert_text_visible" || type === "assert_text_absent") {
      const locator = page.locator(action.selector);
      const startedAt = Date.now();
      let lastText = "";
      let matchedText = "";
      let hiddenMatch = false;
      while (Date.now() - startedAt <= timeout) {
        const count = await locator.count().catch(() => 0);
        let matched = false;
        matchedText = "";
        hiddenMatch = false;
        for (let index = 0; index < count; index += 1) {
          const text = await setupLocatorText(locator, index);
          lastText = text || lastText;
          if (setupTextMatches(text, action)) {
            matched = true;
            matchedText = text;
            if (type === "assert_text_visible") {
              const visible = await setupLocatorVisible(locator, index);
              if (visible) {
                return { ...base, ok: true, count, text: compactSetupResultText(text), target_index: index, timeout_ms: timeout };
              }
              hiddenMatch = true;
              break;
            }
            break;
          }
        }
        if (type === "assert_text_absent" && !matched) {
          return { ...base, ok: true, count, timeout_ms: timeout };
        }
        await page.waitForTimeout(100);
      }
      if (type === "assert_text_visible") {
        if (hiddenMatch) {
          return { ...base, reason: "matching_element_not_visible", text: compactSetupResultText(matchedText), timeout_ms: timeout };
        }
        return { ...base, reason: "text_not_found", text: compactSetupResultText(lastText), timeout_ms: timeout };
      }
      return { ...base, reason: "text_still_present", text: compactSetupResultText(matchedText || lastText), timeout_ms: timeout };
    }
    return { ...base, reason: "unsupported_action" };
  } catch (error) {
    return { ...base, error: String(error && error.message ? error.message : error).slice(0, 1000) };
  }
}
async function executeSetupActions(actions) {
  const results = [];
  for (let index = 0; index < (actions || []).length; index += 1) {
    const action = actions[index] || {};
    const result = await executeSetupAction(action, index);
    results.push(result);
    const afterMs = setupNumber(action.after_ms, 0);
    if (afterMs) await page.waitForTimeout(afterMs);
    if (result.ok === false && action.continue_on_failure !== true) break;
  }
  return results;
}
function expectedPathFor(check) {
  return check.expected_path || new URL(targetUrl).pathname || "/";
}
async function selectorStats(selector) {
  return page.locator(selector).evaluateAll((elements) => {
    const isVisible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style && style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    return { count: elements.length, visible_count: elements.filter(isVisible).length };
  }).catch((error) => ({ count: 0, visible_count: 0, error: String(error && error.message ? error.message : error).slice(0, 500) }));
}
async function selectorTextSequence(selector) {
  return page.locator(selector).evaluateAll((elements) => {
    const compact = (value) => String(value || "").replace(/\s+/g, " ").trim().slice(0, 240);
    const isVisible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style && style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const rows = elements.map((element, index) => ({
      index,
      text: compact(element.innerText || element.textContent || ""),
      visible: isVisible(element),
    }));
    return {
      count: rows.length,
      visible_count: rows.filter((row) => row.visible).length,
      texts: rows.map((row) => row.text).filter(Boolean).slice(0, 40),
      visible_texts: rows.filter((row) => row.visible).map((row) => row.text).filter(Boolean).slice(0, 40),
    };
  }).catch((error) => ({ count: 0, visible_count: 0, texts: [], visible_texts: [], error: String(error && error.message ? error.message : error).slice(0, 500) }));
}
async function frameEvidence(selector) {
  const result = { selector, count: 0, frame_count: 0, frames: [], errors: [] };
  let handles = [];
  try {
    const locator = page.locator(selector);
    result.count = await locator.count();
    handles = await locator.elementHandles();
  } catch (error) {
    result.errors.push(String(error && error.message ? error.message : error).slice(0, 500));
    return result;
  }
  for (let index = 0; index < handles.length; index += 1) {
    const handle = handles[index];
    try {
      const frame = typeof handle.contentFrame === "function" ? await handle.contentFrame() : null;
      if (!frame) {
        result.frames.push({ index, attached: false, error: "content_frame_unavailable" });
        continue;
      }
      const snapshot = await frame.evaluate(() => {
        const body = document.body;
        const documentElement = document.documentElement;
        const text = (body ? body.innerText : "").replace(/\s+/g, " ").trim();
        const clientWidth = documentElement ? documentElement.clientWidth : window.innerWidth;
        const clientHeight = documentElement ? documentElement.clientHeight : window.innerHeight;
        const scrollWidth = documentElement ? documentElement.scrollWidth : 0;
        const viewportWidth = clientWidth || window.innerWidth;
        const overflowOffenders = [];
        function isContainedByHorizontalScroller(element) {
          let current = element.parentElement;
          while (current && current !== body && current !== documentElement) {
            const style = window.getComputedStyle(current);
            const overflowX = style.overflowX || style.overflow || "";
            if ((overflowX === "auto" || overflowX === "scroll") && current.scrollWidth > current.clientWidth + 1) {
              const currentRect = current.getBoundingClientRect();
              const contained = currentRect.left >= -0.5 && currentRect.right <= viewportWidth + 0.5;
              if (contained) return true;
            }
            current = current.parentElement;
          }
          return false;
        }
        for (const element of Array.from(body ? body.querySelectorAll("*") : [])) {
          const rect = element.getBoundingClientRect();
          if (!rect || rect.width < 1 || rect.height < 1) continue;
          const style = window.getComputedStyle(element);
          if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
          const leftOverflow = Math.max(0, -rect.left);
          const rightOverflow = Math.max(0, rect.right - viewportWidth);
          const overflow = Math.max(leftOverflow, rightOverflow);
          if (overflow <= 0.5) continue;
          if (isContainedByHorizontalScroller(element)) continue;
          const tag = element.tagName ? element.tagName.toLowerCase() : "element";
          const id = element.id ? "#" + element.id : "";
          const className = typeof element.className === "string"
            ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".")
            : "";
          overflowOffenders.push({
            selector: tag + id + (className ? "." + className : ""),
            tag,
            text: (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
            overflow,
            left_overflow_px: leftOverflow,
            right_overflow_px: rightOverflow,
            viewport_width: viewportWidth,
            rect: {
              left: rect.left,
              right: rect.right,
              width: rect.width,
            },
          });
        }
        overflowOffenders.sort((a, b) => b.overflow - a.overflow);
        const boundsOverflowPx = Math.max(
          0,
          scrollWidth - (clientWidth || viewportWidth),
          ...overflowOffenders.map((offender) => offender.overflow),
        );
        return {
          url: location.href,
          title: document.title,
          text_length: text.length,
          text_sample: text.slice(0, 8000),
          body_text_sample: text.slice(0, 8000),
          viewport_width: viewportWidth,
          viewport_height: clientHeight || window.innerHeight,
          scroll_width: scrollWidth,
          client_width: clientWidth,
          overflow_px: Math.max(0, scrollWidth - (clientWidth || viewportWidth)),
          bounds_overflow_px: Math.round(boundsOverflowPx * 100) / 100,
          overflow_offender_count: overflowOffenders.length,
          overflow_offenders: overflowOffenders.slice(0, 10),
        };
      });
      result.frames.push({ index, attached: true, ...snapshot });
    } catch (error) {
      result.frames.push({ index, attached: false, error: String(error && error.message ? error.message : error).slice(0, 1000) });
    }
  }
  result.frame_count = result.frames.filter((frame) => frame && frame.attached !== false && !frame.error).length;
  return result;
}
function inventoryAppPathFromUrl(urlLike) {
  const url = new URL(String(urlLike), targetUrl);
  const mountPrefix = previewMountPrefix(new URL(targetUrl).pathname);
  let pathname = url.pathname || "/";
  if (mountPrefix && (pathname === mountPrefix || pathname.startsWith(mountPrefix + "/"))) {
    pathname = pathname.slice(mountPrefix.length) || "/";
  }
  return normalizeRoutePath(pathname);
}
function inventoryRouteUrl(expectedPath) {
  const base = new URL(targetUrl);
  const route = new URL(expectedPath, base.origin);
  const mountPrefix = previewMountPrefix(base.pathname);
  base.pathname = mountPrefix ? joinMountedRoutePath(mountPrefix, route.pathname) : route.pathname;
  base.search = route.search;
  base.hash = route.hash;
  return base.href;
}
function inventorySlugFromPath(path) {
  return String(path || "route").split("/").filter(Boolean).pop()?.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "route";
}
function inventorySlugFromViewport(viewport) {
  return String(viewport && viewport.name || "viewport").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "viewport";
}
function inventoryScreenshotLabel(check, viewport, phase, path) {
  const viewportPart = check.run_all_viewports ? "-" + inventorySlugFromViewport(viewport) : "";
  return profileSlug + viewportPart + "-" + phase + "-" + inventorySlugFromPath(path);
}
function inventoryCheckTimeout(check) {
  const timeout = Number(check && check.timeout_ms);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : 45000;
}
async function collectInventoryHomeLinks(check) {
  const linkSelector = check.link_selector || "a[href]";
  const expectedPaths = (check.expected_routes || []).map((route) => route.path);
  const routePathPrefix = check.route_path_prefix || "";
  return await page.evaluate(({ linkSelector, expectedPaths, routePathPrefix, targetUrl }) => {
    const previewMountPrefix = (pathname) => {
      const value = pathname || "/";
      const apiPreview = value.match(/^(\/s\/[^/]+)(?:\/|$)/);
      if (apiPreview) return apiPreview[1];
      const internalPreview = value.match(/^(\/preview\/[^/]+\/[^/]+)(?:\/|$)/);
      return internalPreview ? internalPreview[1] : "";
    };
    const normalizeRoutePath = (path) => {
      const value = path || "/";
      if (value === "/") return "/";
      return value.replace(/\/+$/, "") || "/";
    };
    const appPathFromHref = (href) => {
      const url = new URL(href, location.href);
      const mountPrefix = previewMountPrefix(new URL(targetUrl).pathname);
      let pathname = url.pathname || "/";
      if (mountPrefix && (pathname === mountPrefix || pathname.startsWith(mountPrefix + "/"))) {
        pathname = pathname.slice(mountPrefix.length) || "/";
      }
      return normalizeRoutePath(pathname);
    };
    const expectedSet = new Set(expectedPaths);
    const links = Array.from(document.querySelectorAll(linkSelector)).map((anchor) => {
      const href = anchor.getAttribute("href") || "";
      const appPath = appPathFromHref(href || anchor.href || location.href);
      return {
        text: (anchor.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240),
        href,
        pathname: new URL(href || anchor.href || location.href, location.href).pathname,
        app_path: appPath,
      };
    });
    return links.filter((link) => (
      routePathPrefix ? link.app_path.startsWith(routePathPrefix) : expectedSet.has(link.app_path)
    ));
  }, { linkSelector, expectedPaths, routePathPrefix, targetUrl });
}
async function waitForInventoryRouteHealth(check, expectedPath) {
  const timeout = inventoryCheckTimeout(check);
  await page.waitForURL((url) => inventoryAppPathFromUrl(url.href) === normalizeRoutePath(expectedPath), { timeout: Math.min(timeout, 20000) });
  if (check.route_ready_selector) {
    await page.waitForSelector(check.route_ready_selector, { state: "visible", timeout });
    return;
  }
  await page.waitForFunction(({ expectedPath, sourceSelector, routeReadyText, routeReadyPattern, routeReadyFlags, targetUrl }) => {
    const previewMountPrefix = (pathname) => {
      const value = pathname || "/";
      const apiPreview = value.match(/^(\/s\/[^/]+)(?:\/|$)/);
      if (apiPreview) return apiPreview[1];
      const internalPreview = value.match(/^(\/preview\/[^/]+\/[^/]+)(?:\/|$)/);
      return internalPreview ? internalPreview[1] : "";
    };
    const normalizeRoutePath = (path) => {
      const value = path || "/";
      if (value === "/") return "/";
      return value.replace(/\/+$/, "") || "/";
    };
    const mountPrefix = previewMountPrefix(new URL(targetUrl).pathname);
    let pathname = location.pathname || "/";
    if (mountPrefix && (pathname === mountPrefix || pathname.startsWith(mountPrefix + "/"))) {
      pathname = pathname.slice(mountPrefix.length) || "/";
    }
    if (normalizeRoutePath(pathname) !== normalizeRoutePath(expectedPath)) return false;
    if (sourceSelector && document.querySelector(sourceSelector)) return false;
    const text = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
    if (routeReadyPattern) {
      try {
        if (!new RegExp(routeReadyPattern, routeReadyFlags || "").test(text)) return false;
      } catch {
        return false;
      }
    }
    if (routeReadyText && !text.includes(routeReadyText)) return false;
    const loadingOnly = /^loading\.?$/i.test(text) || (/^loading/i.test(text) && text.length < 40);
    if (document.querySelectorAll("canvas").length > 0) return true;
    if (document.querySelectorAll("button").length > 0 && !loadingOnly) return true;
    return text.length > 30 && !loadingOnly && !/not found|cannot get/i.test(text);
  }, {
    expectedPath,
    sourceSelector: check.source_selector || "",
    routeReadyText: check.route_ready_text || "",
    routeReadyPattern: check.route_ready_pattern || "",
    routeReadyFlags: check.route_ready_flags || "",
    targetUrl,
  }, { timeout });
}
async function collectInventoryRouteSnapshot(expectedRoute, phase, check, error) {
  return await page.evaluate(({ expectedRoute, phase, sourceSelector, error, targetUrl }) => {
    const previewMountPrefix = (pathname) => {
      const value = pathname || "/";
      const apiPreview = value.match(/^(\/s\/[^/]+)(?:\/|$)/);
      if (apiPreview) return apiPreview[1];
      const internalPreview = value.match(/^(\/preview\/[^/]+\/[^/]+)(?:\/|$)/);
      return internalPreview ? internalPreview[1] : "";
    };
    const normalizeRoutePath = (path) => {
      const value = path || "/";
      if (value === "/") return "/";
      return value.replace(/\/+$/, "") || "/";
    };
    const mountPrefix = previewMountPrefix(new URL(targetUrl).pathname);
    let pathname = location.pathname || "/";
    if (mountPrefix && (pathname === mountPrefix || pathname.startsWith(mountPrefix + "/"))) {
      pathname = pathname.slice(mountPrefix.length) || "/";
    }
    const sourceCount = sourceSelector ? document.querySelectorAll(sourceSelector).length : 0;
    const text = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
    return {
      phase,
      name: expectedRoute.name || null,
      path: expectedRoute.path,
      loaded: !error,
      error: error || null,
      actual_path: location.pathname,
      actual_app_path: normalizeRoutePath(pathname),
      source_selector: sourceSelector || null,
      source_count: sourceCount,
      source_visible: sourceCount > 0,
      title: document.title,
      body_text_sample: text.slice(0, 900),
      canvas_count: document.querySelectorAll("canvas").length,
      button_texts: Array.from(document.querySelectorAll("button")).slice(0, 12).map((button) => (
        (button.textContent || "").replace(/\s+/g, " ").trim()
      )),
      heading_texts: Array.from(document.querySelectorAll("h1,h2,h3")).slice(0, 8).map((heading) => (
        (heading.textContent || "").replace(/\s+/g, " ").trim()
      )),
    };
  }, { expectedRoute, phase, sourceSelector: check.source_selector || "", error: error || "", targetUrl });
}
async function findInventoryLinkIndex(check, expectedPath) {
  const locator = page.locator(check.link_selector || "a[href]");
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const appPath = await locator.nth(index).evaluate((anchor, targetUrl) => {
      const previewMountPrefix = (pathname) => {
        const value = pathname || "/";
        const apiPreview = value.match(/^(\/s\/[^/]+)(?:\/|$)/);
        if (apiPreview) return apiPreview[1];
        const internalPreview = value.match(/^(\/preview\/[^/]+\/[^/]+)(?:\/|$)/);
        return internalPreview ? internalPreview[1] : "";
      };
      const normalizeRoutePath = (path) => {
        const value = path || "/";
        if (value === "/") return "/";
        return value.replace(/\/+$/, "") || "/";
      };
      const href = anchor.getAttribute("href") || anchor.href || location.href;
      const url = new URL(href, location.href);
      const mountPrefix = previewMountPrefix(new URL(targetUrl).pathname);
      let pathname = url.pathname || "/";
      if (mountPrefix && (pathname === mountPrefix || pathname.startsWith(mountPrefix + "/"))) {
        pathname = pathname.slice(mountPrefix.length) || "/";
      }
      return normalizeRoutePath(pathname);
    }, targetUrl).catch(() => "");
    if (appPath === normalizeRoutePath(expectedPath)) return index;
  }
  return -1;
}
async function collectRouteInventory(check, viewport) {
  const expectedRoutes = check.expected_routes || [];
  const expectedPaths = expectedRoutes.map((route) => normalizeRoutePath(route.path));
  const expectedSet = new Set(expectedPaths);
  const failures = [];
  const homeLinks = await collectInventoryHomeLinks(check);
  const homeLinkPaths = homeLinks.map((link) => link.app_path);
  const uniqueHomeLinkPaths = Array.from(new Set(homeLinkPaths));
  const duplicateHomeLinkPaths = homeLinkPaths.filter((path, index) => homeLinkPaths.indexOf(path) !== index);
  const duplicateHomeLinkPathSet = Array.from(new Set(duplicateHomeLinkPaths));
  if (check.require_unique_routes !== false && duplicateHomeLinkPaths.length) {
    failures.push({ code: "duplicate_source_links", paths: duplicateHomeLinkPathSet });
  }
  for (const route of expectedRoutes) {
    if (!homeLinkPaths.includes(normalizeRoutePath(route.path))) {
      failures.push({ code: "expected_route_missing_from_source", name: route.name || null, path: route.path });
    }
  }
  const unexpectedRoutes = uniqueHomeLinkPaths.filter((path) => !expectedSet.has(path));
  if (!check.allow_unexpected_routes && unexpectedRoutes.length) {
    failures.push({ code: "unexpected_source_links", paths: unexpectedRoutes });
  }
  if (!check.allow_unexpected_routes && uniqueHomeLinkPaths.length !== expectedRoutes.length) {
    failures.push({ code: "source_link_count_mismatch", expected: expectedRoutes.length, actual_unique: uniqueHomeLinkPaths.length, actual_total: homeLinkPaths.length });
  }

  const directRoutes = [];
  if (check.run_direct_routes !== false) {
    for (const expectedRoute of expectedRoutes) {
      let error = "";
      try {
        await page.goto(inventoryRouteUrl(expectedRoute.path), { waitUntil: "domcontentloaded", timeout: 90000 });
        await waitForInventoryRouteHealth(check, expectedRoute.path);
      } catch (caught) {
        error = String(caught && caught.message ? caught.message : caught).slice(0, 1000);
      }
      const snapshot = await collectInventoryRouteSnapshot(expectedRoute, "direct", check, error);
      directRoutes.push(snapshot);
      if (check.save_route_screenshots) {
        await saveScreenshot(inventoryScreenshotLabel(check, viewport, "direct", expectedRoute.path)).catch(() => {});
      }
      if (error) failures.push({ code: "direct_route_unhealthy", name: expectedRoute.name || null, path: expectedRoute.path, error });
      else if (snapshot.actual_app_path !== normalizeRoutePath(expectedRoute.path)) failures.push({ code: "direct_route_wrong_path", name: expectedRoute.name || null, path: expectedRoute.path, actual_app_path: snapshot.actual_app_path });
      else if (check.source_selector && snapshot.source_visible) failures.push({ code: "direct_route_kept_source_surface", name: expectedRoute.name || null, path: expectedRoute.path, source_selector: check.source_selector });
    }
  }

  const clickthroughs = [];
  if (check.run_clickthroughs !== false) {
    for (const expectedRoute of expectedRoutes) {
      const result = { name: expectedRoute.name || null, path: expectedRoute.path, clicked: false, snapshot: null, error: null };
      try {
        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
        if (profile.target.wait_for_selector) {
          await page.waitForSelector(profile.target.wait_for_selector, { state: "visible", timeout: 15000 }).catch(() => {});
        }
        const index = await findInventoryLinkIndex(check, expectedRoute.path);
        if (index < 0) {
          result.error = "source_link_not_found";
          failures.push({ code: "source_link_clickthrough_missing", name: expectedRoute.name || null, path: expectedRoute.path });
        } else {
          const locator = page.locator(check.link_selector || "a[href]").nth(index);
          await locator.scrollIntoViewIfNeeded();
          await locator.click({ timeout: inventoryCheckTimeout(check), noWaitAfter: true });
          result.clicked = true;
          await waitForInventoryRouteHealth(check, expectedRoute.path);
        }
      } catch (caught) {
        result.error = String(caught && caught.message ? caught.message : caught).slice(0, 1000);
      }
      result.snapshot = await collectInventoryRouteSnapshot(expectedRoute, "clickthrough", check, result.error || "");
      clickthroughs.push(result);
      if (check.save_route_screenshots) {
        await saveScreenshot(inventoryScreenshotLabel(check, viewport, "click", expectedRoute.path)).catch(() => {});
      }
      if (result.error && result.error !== "source_link_not_found") failures.push({ code: "source_link_clickthrough_unhealthy", name: expectedRoute.name || null, path: expectedRoute.path, error: result.error });
      else if (result.snapshot.actual_app_path !== normalizeRoutePath(expectedRoute.path)) failures.push({ code: "source_link_clickthrough_wrong_path", name: expectedRoute.name || null, path: expectedRoute.path, actual_app_path: result.snapshot.actual_app_path });
      else if (check.source_selector && result.snapshot.source_visible) failures.push({ code: "source_link_clickthrough_kept_source_surface", name: expectedRoute.name || null, path: expectedRoute.path, source_selector: check.source_selector });
    }
  }

  return {
    version: "riddle-proof.route-inventory.v1",
    viewport: viewport.name,
    expected_routes: expectedRoutes,
    link_selector: check.link_selector || "a[href]",
    source_selector: check.source_selector || null,
    source_link_count: homeLinkPaths.length,
    source_unique_link_count: uniqueHomeLinkPaths.length,
    duplicate_source_link_count: duplicateHomeLinkPaths.length,
    duplicate_source_link_paths: duplicateHomeLinkPathSet,
    duplicates_allowed: check.require_unique_routes === false,
    home_game_link_count: homeLinkPaths.length,
    home_unique_game_link_count: uniqueHomeLinkPaths.length,
    home_links: homeLinks,
    direct_routes: directRoutes,
    clickthroughs,
    failures,
  };
}
async function captureViewport(viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  let httpStatus = null;
  let navigationError;
  let waitError;
  try {
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    httpStatus = response ? response.status() : null;
  } catch (error) {
    navigationError = String(error && error.message ? error.message : error).slice(0, 1000);
  }
  if (!navigationError && profile.target.wait_for_selector) {
    try {
      await page.waitForSelector(profile.target.wait_for_selector, { state: "visible", timeout: 15000 });
    } catch (error) {
      waitError = String(error && error.message ? error.message : error).slice(0, 1000);
    }
  }
  if (!navigationError && profile.target.wait_ms) {
    await page.waitForTimeout(profile.target.wait_ms);
  }
  const setupActionResults = (!navigationError && !waitError)
    ? await executeSetupActions(profile.target.setup_actions || [])
    : [];
  const dom = await page.evaluate(() => {
    const body = document.body;
    const documentElement = document.documentElement;
    const text = (body ? body.innerText : "").replace(/\s+/g, " ").trim();
    const clientWidth = documentElement ? documentElement.clientWidth : window.innerWidth;
    const scrollWidth = documentElement ? documentElement.scrollWidth : 0;
    const viewportWidth = clientWidth || window.innerWidth;
    const overflowOffenders = [];
    function isContainedByHorizontalScroller(element) {
      let current = element.parentElement;
      while (current && current !== body && current !== documentElement) {
        const style = window.getComputedStyle(current);
        const overflowX = style.overflowX || style.overflow || "";
        if ((overflowX === "auto" || overflowX === "scroll") && current.scrollWidth > current.clientWidth + 1) {
          const currentRect = current.getBoundingClientRect();
          const contained = currentRect.left >= -0.5 && currentRect.right <= viewportWidth + 0.5;
          if (contained) return true;
        }
        current = current.parentElement;
      }
      return false;
    }
    for (const element of Array.from(body ? body.querySelectorAll("*") : [])) {
      const rect = element.getBoundingClientRect();
      if (!rect || rect.width < 1 || rect.height < 1) continue;
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
      const leftOverflow = Math.max(0, -rect.left);
      const rightOverflow = Math.max(0, rect.right - viewportWidth);
      const overflow = Math.max(leftOverflow, rightOverflow);
      if (overflow <= 0.5) continue;
      if (isContainedByHorizontalScroller(element)) continue;
      const tag = element.tagName ? element.tagName.toLowerCase() : "element";
      const id = element.id ? "#" + element.id : "";
      const className = typeof element.className === "string"
        ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".")
        : "";
      overflowOffenders.push({
        selector: tag + id + (className ? "." + className : ""),
        tag,
        text: (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
        overflow,
        left_overflow_px: leftOverflow,
        right_overflow_px: rightOverflow,
        viewport_width: viewportWidth,
        rect: {
          left: rect.left,
          right: rect.right,
          width: rect.width,
        },
      });
    }
    overflowOffenders.sort((a, b) => b.overflow - a.overflow);
    const boundsOverflowPx = Math.max(
      0,
      scrollWidth - (clientWidth || viewportWidth),
      ...overflowOffenders.map((offender) => offender.overflow),
    );
    return {
      url: location.href,
      pathname: location.pathname,
      title: document.title,
      body_text_length: text.length,
      body_text: text,
      body_text_sample: text.slice(0, 8000),
      scroll_width: scrollWidth,
      client_width: clientWidth,
      bounds_overflow_px: Math.round(boundsOverflowPx * 100) / 100,
      overflow_offenders: overflowOffenders.slice(0, 10),
    };
  }).catch((error) => ({
    url: page.url(),
    pathname: "",
    title: "",
    body_text_length: 0,
    body_text_sample: "",
    scroll_width: 0,
    client_width: viewport.width,
    bounds_overflow_px: 0,
    overflow_offenders: [],
    evaluation_error: String(error && error.message ? error.message : error).slice(0, 1000),
  }));
  const selectors = {};
  const frames = {};
  const text_sequences = {};
  const text_matches = {};
  for (const check of profile.checks || []) {
    if (
      (
        check.type === "selector_visible"
        || check.type === "selector_absent"
        || check.type === "selector_count_at_least"
        || check.type === "selector_count_equals"
        || check.type === "selector_count_equal"
        || check.type === "selector_count_eq"
      ) && check.selector
    ) {
      selectors[check.selector] = await selectorStats(check.selector);
    }
    if (check.type === "selector_text_order" && check.selector) {
      selectors[check.selector] = selectors[check.selector] || await selectorStats(check.selector);
      text_sequences[check.selector] = await selectorTextSequence(check.selector);
    }
    if ((check.type === "text_visible" || check.type === "text_absent") && (check.text || check.pattern)) {
      text_matches[textKey(check)] = textMatches(dom.body_text || dom.body_text_sample || "", check);
    }
    if ((check.type === "frame_text_visible" || check.type === "frame_no_horizontal_overflow") && check.selector) {
      selectors[check.selector] = selectors[check.selector] || await selectorStats(check.selector);
      frames[check.selector] = frames[check.selector] || await frameEvidence(check.selector);
    }
  }
  const screenshotLabel = profileSlug + "-" + viewport.name;
  try {
    if (typeof saveScreenshot === "function") await saveScreenshot(screenshotLabel);
  } catch (error) {
    pageErrors.push({ message: "saveScreenshot failed: " + String(error && error.message ? error.message : error).slice(0, 500) });
  }
  let routeInventory;
  const routeInventoryCheck = (profile.checks || []).find((check) => check.type === "route_inventory");
  const firstViewportName = (profile.target.viewports || [])[0] && (profile.target.viewports || [])[0].name;
  if (routeInventoryCheck && (routeInventoryCheck.run_all_viewports || !firstViewportName || viewport.name === firstViewportName)) {
    try {
      routeInventory = await collectRouteInventory(routeInventoryCheck, viewport);
    } catch (error) {
      routeInventory = {
        version: "riddle-proof.route-inventory.v1",
        viewport: viewport.name,
        expected_routes: routeInventoryCheck.expected_routes || [],
        link_selector: routeInventoryCheck.link_selector || "a[href]",
        source_selector: routeInventoryCheck.source_selector || null,
        source_link_count: 0,
        source_unique_link_count: 0,
        duplicate_source_link_count: 0,
        duplicate_source_link_paths: [],
        duplicates_allowed: routeInventoryCheck.require_unique_routes === false,
        home_game_link_count: 0,
        home_unique_game_link_count: 0,
        home_links: [],
        direct_routes: [],
        clickthroughs: [],
        failures: [{
          code: "route_inventory_capture_failed",
          error: String(error && error.message ? error.message : error).slice(0, 1000),
        }],
      };
    }
  }
  const expectedPath = profile.checks.find((check) => check.type === "route_loaded" && check.expected_path)?.expected_path || new URL(targetUrl).pathname || "/";
  return {
    name: viewport.name,
    width: viewport.width,
    height: viewport.height,
    url: dom.url,
    route: {
      requested: targetUrl,
      observed: dom.pathname,
      expected_path: expectedPath,
      matched: routePathMatches(dom.pathname, expectedPath, targetUrl),
      http_status: httpStatus,
      error: navigationError || waitError || undefined,
    },
    title: dom.title,
    body_text_length: dom.body_text_length,
    body_text_sample: dom.body_text_sample,
    scroll_width: dom.scroll_width,
    client_width: dom.client_width,
    overflow_px: Math.max(0, (dom.scroll_width || 0) - (dom.client_width || viewport.width)),
    bounds_overflow_px: dom.bounds_overflow_px,
    overflow_offenders: dom.overflow_offenders || [],
    selectors,
    frames,
    text_sequences,
    text_matches,
    route_inventory: routeInventory,
    setup_action_results: setupActionResults,
    screenshot_label: screenshotLabel,
    navigation_error: navigationError,
    wait_error: waitError,
  };
}
${runtimeScriptAssessmentSource()}
const viewports = [];
function buildProfileEvidence(currentViewports) {
  const expectedViewportCount = (profile.target.viewports || []).length;
  return {
    version: "riddle-proof.profile-evidence.v1",
    profile_name: profile.name,
    target_url: targetUrl,
    baseline_policy: profile.baseline_policy || "invariant_only",
    captured_at: capturedAt,
    viewports: currentViewports.slice(),
    console: {
      events: consoleEvents,
      fatal_count: consoleEvents.filter((event) => event.type === "error" || event.type === "assert").length,
    },
    page_errors: pageErrors,
    network_mocks: networkMockEvents.slice(),
    dom_summary: {
      expected_viewport_count: expectedViewportCount,
      viewport_count: currentViewports.length,
      partial: expectedViewportCount > 0 && currentViewports.length < expectedViewportCount,
      routes: currentViewports.map((viewport) => viewport.route),
      titles: currentViewports.map((viewport) => viewport.title),
      overflow_px: currentViewports.map((viewport) => viewport.overflow_px),
      bounds_overflow_px: currentViewports.map((viewport) => viewport.bounds_overflow_px),
      overflow_offender_counts: currentViewports.map((viewport) => (viewport.overflow_offenders || []).length),
      frames: currentViewports
        .filter((viewport) => viewport.frames)
        .map((viewport) => ({
          viewport: viewport.name,
          selectors: Object.entries(viewport.frames || {}).map(([selector, frameSet]) => ({
            selector,
            count: frameSet && frameSet.count,
            frame_count: frameSet && frameSet.frame_count,
            max_bounds_overflow_px: Math.max(
              0,
              ...((frameSet && Array.isArray(frameSet.frames) ? frameSet.frames : [])).map((frame) => horizontalBoundsOverflowPx(frame)),
            ),
          })),
        })),
      route_inventory: currentViewports
        .filter((viewport) => viewport.route_inventory)
        .map((viewport) => ({
          viewport: viewport.name,
          expected_count: (viewport.route_inventory.expected_routes || []).length,
          source_link_count: viewport.route_inventory.source_link_count == null ? viewport.route_inventory.home_game_link_count : viewport.route_inventory.source_link_count,
          source_unique_link_count: viewport.route_inventory.source_unique_link_count == null ? viewport.route_inventory.home_unique_game_link_count : viewport.route_inventory.source_unique_link_count,
          duplicate_source_link_count: viewport.route_inventory.duplicate_source_link_count,
          home_unique_game_link_count: viewport.route_inventory.home_unique_game_link_count,
          direct_route_count: (viewport.route_inventory.direct_routes || []).length,
          clickthrough_count: (viewport.route_inventory.clickthroughs || []).length,
          failure_count: (viewport.route_inventory.failures || []).length,
        })),
      network_mock_count: (profile.target.network_mocks || []).length,
      network_mock_hit_count: networkMockEvents.filter((event) => event.ok !== false).length,
    },
  };
}
async function saveProfileArtifacts(currentViewports) {
  const evidence = buildProfileEvidence(currentViewports);
  const result = assessProfile(profile, evidence);
  if (typeof saveJson === "function") {
    await saveJson("proof.json", result);
    await saveJson("console.json", { events: consoleEvents, page_errors: pageErrors });
    await saveJson("dom-summary.json", evidence.dom_summary);
  }
  return result;
}
await registerNetworkMocks(profile.target.network_mocks || []);
consoleEvents.length = 0;
pageErrors.length = 0;
let result = await saveProfileArtifacts(viewports);
for (const viewport of profile.target.viewports || []) {
  viewports.push(await captureViewport(viewport));
  result = await saveProfileArtifacts(viewports);
}
return result;
`.trim();
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
