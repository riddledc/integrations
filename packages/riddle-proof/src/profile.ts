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
  "selector_count_at_least",
  "text_visible",
  "text_absent",
  "no_horizontal_overflow",
  "no_mobile_horizontal_overflow",
  "no_fatal_console_errors",
] as const;

export const RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES = [
  "click",
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
  text?: string;
  pattern?: string;
  flags?: string;
  index?: number;
  ms?: number;
  timeout_ms?: number;
  after_ms?: number;
  continue_on_failure?: boolean;
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
}

export interface RiddleProofProfileCheck {
  type: RiddleProofProfileCheckType;
  label?: string;
  expected_path?: string;
  selector?: string;
  text?: string;
  pattern?: string;
  flags?: string;
  min_count?: number;
  max_overflow_px?: number;
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
  selectors?: Record<string, { count: number; visible_count: number }>;
  text_matches?: Record<string, boolean>;
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

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function timeoutSecValue(value: unknown): number | undefined {
  const number = numberValue(value);
  return number && number > 0 ? Math.ceil(number) : undefined;
}

function jsonRecord(value: unknown): Record<string, JsonValue> | undefined {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toJsonValue(child)]));
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
  const normalized = String(value || "").trim().replace(/-/g, "_");
  if ((RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES as readonly string[]).includes(normalized)) {
    return normalized as RiddleProofProfileSetupActionType;
  }
  throw new Error(`target.setup_actions[${index}].type ${value || "(missing)"} is not supported. Supported actions: ${RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES.join(", ")}`);
}

function normalizeSetupAction(input: unknown, index: number): RiddleProofProfileSetupAction {
  if (!isRecord(input)) throw new Error(`target.setup_actions[${index}] must be an object.`);
  const type = normalizeSetupActionType(stringValue(input.type), index);
  const selector = stringValue(input.selector);
  if ((type === "click" || type === "wait_for_selector" || type === "wait_for_text") && !selector) {
    throw new Error(`target.setup_actions[${index}] ${type} requires selector.`);
  }
  if (type === "wait_for_text" && !stringValue(input.text) && !stringValue(input.pattern)) {
    throw new Error(`target.setup_actions[${index}] wait_for_text requires text or pattern.`);
  }
  return {
    type,
    selector,
    text: stringValue(input.text),
    pattern: stringValue(input.pattern),
    flags: stringValue(input.flags),
    index: numberValue(input.index),
    ms: numberValue(input.ms) ?? numberValue(input.wait_ms) ?? numberValue(input.waitMs),
    timeout_ms: numberValue(input.timeout_ms) ?? numberValue(input.timeoutMs),
    after_ms: numberValue(input.after_ms) ?? numberValue(input.afterMs),
    continue_on_failure: input.continue_on_failure === true || input.continueOnFailure === true,
  };
}

function normalizeSetupActions(value: unknown): RiddleProofProfileSetupAction[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("target.setup_actions must be an array.");
  return value.map(normalizeSetupAction);
}

function normalizeCheck(input: unknown, index: number): RiddleProofProfileCheck {
  if (!isRecord(input)) throw new Error(`checks[${index}] must be an object.`);
  const type = stringValue(input.type);
  if (!type) throw new Error(`checks[${index}].type is required.`);
  if (!isSupportedCheckType(type)) {
    throw new Error(`checks[${index}].type ${type} is not supported. Supported checks: ${RIDDLE_PROOF_PROFILE_CHECK_TYPES.join(", ")}`);
  }
  if ((type === "selector_visible" || type === "selector_count_at_least") && !stringValue(input.selector)) {
    throw new Error(`checks[${index}] ${type} requires selector.`);
  }
  if ((type === "text_visible" || type === "text_absent") && !stringValue(input.text) && !stringValue(input.pattern)) {
    throw new Error(`checks[${index}] ${type} requires text or pattern.`);
  }
  if (type === "selector_count_at_least" && numberValue(input.min_count) === undefined) {
    throw new Error(`checks[${index}] selector_count_at_least requires min_count.`);
  }
  return {
    type,
    label: stringValue(input.label),
    expected_path: stringValue(input.expected_path),
    selector: stringValue(input.selector),
    text: stringValue(input.text),
    pattern: stringValue(input.pattern),
    flags: stringValue(input.flags),
    min_count: numberValue(input.min_count),
    max_overflow_px: numberValue(input.max_overflow_px),
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

function assessCheckFromEvidence(
  check: RiddleProofProfileCheck,
  evidence: RiddleProofProfileEvidence,
): RiddleProofProfileCheckResult {
  const viewports = evidence.viewports || [];
  if (!viewports.length) {
    return {
      type: check.type,
      label: checkLabel(check),
      status: "failed",
      evidence: {},
      message: "No viewport evidence was captured.",
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
    const failed = applicable.filter((viewport) => (viewport.overflow_px ?? 0) > maxOverflow);
    return {
      type: check.type,
      label: checkLabel(check),
      status: failed.length ? "failed" : "passed",
      evidence: {
        max_overflow_px: maxOverflow,
        overflow_px: applicable.map((viewport) => viewport.overflow_px ?? null),
        viewports: applicable.map((viewport) => viewport.name),
      },
      message: failed.length ? `Horizontal overflow exceeded ${maxOverflow}px in ${failed.length} viewport(s).` : undefined,
    };
  }

  if (check.type === "no_fatal_console_errors") {
    const fatalCount = (evidence.console?.fatal_count || 0) + (evidence.page_errors?.length || 0);
    return {
      type: check.type,
      label: checkLabel(check),
      status: fatalCount ? "failed" : "passed",
      evidence: {
        console_fatal_count: evidence.console?.fatal_count || 0,
        page_error_count: evidence.page_errors?.length || 0,
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
function assessProfile(profile, evidence) {
  const checks = [];
  const viewports = evidence.viewports || [];
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
    if (check.type === "route_loaded") {
      const expectedPath = check.expected_path || new URL(evidence.target_url).pathname || "/";
      const failed = viewports.filter((viewport) => {
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
          observed_paths: viewports.map((viewport) => viewport.route && viewport.route.observed),
          http_statuses: viewports.map((viewport) => viewport.route ? viewport.route.http_status ?? null : null),
        },
        message: failed.length ? "Route did not load as " + expectedPath + " in " + failed.length + " viewport(s)." : undefined,
      });
      continue;
    }
    if (check.type === "selector_visible") {
      const selector = check.selector || "";
      const failed = viewports.filter((viewport) => !viewport.selectors || !viewport.selectors[selector] || viewport.selectors[selector].visible_count < 1);
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failed.length ? "failed" : "passed",
        evidence: { selector, visible_counts: viewports.map((viewport) => viewport.selectors && viewport.selectors[selector] ? viewport.selectors[selector].visible_count : 0) },
        message: failed.length ? "Selector " + selector + " was not visible in " + failed.length + " viewport(s)." : undefined,
      });
      continue;
    }
    if (check.type === "selector_count_at_least") {
      const selector = check.selector || "";
      const minCount = check.min_count == null ? 1 : check.min_count;
      const failed = viewports.filter((viewport) => !viewport.selectors || !viewport.selectors[selector] || viewport.selectors[selector].count < minCount);
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failed.length ? "failed" : "passed",
        evidence: { selector, min_count: minCount, counts: viewports.map((viewport) => viewport.selectors && viewport.selectors[selector] ? viewport.selectors[selector].count : 0) },
        message: failed.length ? "Selector " + selector + " count was below " + minCount + " in " + failed.length + " viewport(s)." : undefined,
      });
      continue;
    }
    if (check.type === "text_visible" || check.type === "text_absent") {
      const key = check.pattern ? "pattern:" + check.pattern + "/" + (check.flags || "") : "text:" + (check.text || "");
      const expectedVisible = check.type === "text_visible";
      const matches = viewports.map((viewport) => viewport.text_matches && typeof viewport.text_matches[key] === "boolean" ? viewport.text_matches[key] : textMatches(viewport.body_text_sample || "", check));
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
    if (check.type === "no_horizontal_overflow" || check.type === "no_mobile_horizontal_overflow") {
      const maxOverflow = check.max_overflow_px == null ? 4 : check.max_overflow_px;
      const applicable = check.type === "no_mobile_horizontal_overflow" ? viewports.filter((viewport) => viewport.width <= 820) : viewports;
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
      const failed = applicable.filter((viewport) => (viewport.overflow_px || 0) > maxOverflow);
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failed.length ? "failed" : "passed",
        evidence: { max_overflow_px: maxOverflow, overflow_px: applicable.map((viewport) => viewport.overflow_px ?? null), viewports: applicable.map((viewport) => viewport.name) },
        message: failed.length ? "Horizontal overflow exceeded " + maxOverflow + "px in " + failed.length + " viewport(s)." : undefined,
      });
      continue;
    }
    if (check.type === "no_fatal_console_errors") {
      const fatalCount = ((evidence.console && evidence.console.fatal_count) || 0) + ((evidence.page_errors || []).length);
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: fatalCount ? "failed" : "passed",
        evidence: { console_fatal_count: (evidence.console && evidence.console.fatal_count) || 0, page_error_count: (evidence.page_errors || []).length },
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
async function setupLocatorText(locator, index) {
  return await locator.nth(index).textContent({ timeout: 1000 }).catch(() => "");
}
function compactSetupResultText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= 500) return text;
  return text.slice(0, 500) + "... (" + text.length + " chars)";
}
async function setupLocatorVisible(locator, index) {
  return await locator.nth(index).isVisible({ timeout: 1000 }).catch(() => false);
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
      await locator.nth(targetIndex).click({ timeout });
      return { ...base, ok: true, count, target_index: targetIndex, text: matchedText };
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
    return {
      url: location.href,
      pathname: location.pathname,
      title: document.title,
      body_text_length: text.length,
      body_text_sample: text.slice(0, 8000),
      scroll_width: documentElement ? documentElement.scrollWidth : 0,
      client_width: documentElement ? documentElement.clientWidth : window.innerWidth,
    };
  }).catch((error) => ({
    url: page.url(),
    pathname: "",
    title: "",
    body_text_length: 0,
    body_text_sample: "",
    scroll_width: 0,
    client_width: viewport.width,
    evaluation_error: String(error && error.message ? error.message : error).slice(0, 1000),
  }));
  const selectors = {};
  const text_matches = {};
  for (const check of profile.checks || []) {
    if ((check.type === "selector_visible" || check.type === "selector_count_at_least") && check.selector) {
      selectors[check.selector] = await selectorStats(check.selector);
    }
    if ((check.type === "text_visible" || check.type === "text_absent") && (check.text || check.pattern)) {
      text_matches[textKey(check)] = textMatches(dom.body_text_sample || "", check);
    }
  }
  const screenshotLabel = profileSlug + "-" + viewport.name;
  try {
    if (typeof saveScreenshot === "function") await saveScreenshot(screenshotLabel);
  } catch (error) {
    pageErrors.push({ message: "saveScreenshot failed: " + String(error && error.message ? error.message : error).slice(0, 500) });
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
    selectors,
    text_matches,
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
    dom_summary: {
      expected_viewport_count: expectedViewportCount,
      viewport_count: currentViewports.length,
      partial: expectedViewportCount > 0 && currentViewports.length < expectedViewportCount,
      routes: currentViewports.map((viewport) => viewport.route),
      titles: currentViewports.map((viewport) => viewport.title),
      overflow_px: currentViewports.map((viewport) => viewport.overflow_px),
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
  const seen = new Set<string>();
  function add(item: unknown, source: string) {
    if (!isRecord(item)) return;
    const name = stringValue(item.name) || stringValue(item.filename) || "";
    const url = stringValue(item.url);
    const path = stringValue(item.path);
    if (!name && !url && !path) return;
    const key = `${name}:${url || path || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({
      name,
      url,
      path,
      kind: stringValue(item.kind) || stringValue(item.type),
      content_type: stringValue(item.content_type) || stringValue(item.contentType),
      source,
    });
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
