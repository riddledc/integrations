import type { JsonValue } from "./types";
import {
  assessRiddleProofOrderedTrace,
  assessRiddleProofOrderedTraceSetupResults,
  collectRiddleProofProfileWarnings,
  resolveRiddleProofProfileTargetUrl,
  slugifyRiddleProofProfileName,
} from "@riddledc/riddle-proof-core/profile";
import type {
  RiddleProofProfile,
  RiddleProofProfileCheck,
  RiddleProofProfileHttpStatusBodyJsonAssertion,
  RiddleProofProfileHttpStatusBodyJsonAssertionResult,
  RiddleProofProfileHttpStatusPreflightCheckResult,
  RiddleProofProfileHttpStatusPreflightFetch,
  RiddleProofProfileHttpStatusPreflightFetchResponse,
  RiddleProofProfileHttpStatusPreflightOptions,
  RiddleProofProfileHttpStatusPreflightResult,
  RiddleProofProfileJsonValueType,
} from "@riddledc/riddle-proof-core/profile";


function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toJsonValue(child)]));
  return String(value);
}

function jsonValueType(value: unknown): RiddleProofProfileJsonValueType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  return "object";
}

function compactJsonAssertionSample(value: unknown, depth = 0): JsonValue {
  if (typeof value === "string") return value.length > 240 ? `${value.slice(0, 237)}...` : value;
  if (value === null || typeof value === "boolean" || typeof value === "number") return toJsonValue(value);
  if (Array.isArray(value)) {
    if (depth >= 2) return `[array:${value.length}]`;
    return value.slice(0, 3).map((item) => compactJsonAssertionSample(item, depth + 1));
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).slice(0, 8);
    if (depth >= 2) return `[object:${Object.keys(value).length} keys]`;
    return Object.fromEntries(entries.map(([key, child]) => [key, compactJsonAssertionSample(child, depth + 1)]));
  }
  return String(value);
}

function attachJsonAssertionObservedValue(
  result: RiddleProofProfileHttpStatusBodyJsonAssertionResult,
  value: unknown,
): void {
  const type = jsonValueType(value);
  if (type === "array" && Array.isArray(value)) {
    result.observed_length = value.length;
    result.observed_omitted_count = Math.max(0, value.length - 3);
    result.observed_sample = compactJsonAssertionSample(value);
    return;
  }
  if (type === "object" && isRecord(value)) {
    const keyCount = Object.keys(value).length;
    result.observed_key_count = keyCount;
    result.observed_omitted_count = Math.max(0, keyCount - 8);
    result.observed_sample = compactJsonAssertionSample(value);
    return;
  }
  result.observed = toJsonValue(value);
}

function deepJsonEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== typeof right) return false;
  if (left === null || right === null) return left === right;
  if (typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => deepJsonEqual(item, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (!deepJsonEqual(leftKeys, rightKeys)) return false;
  return leftKeys.every((key) => deepJsonEqual(left[key], right[key]));
}

function jsonContains(observed: unknown, expected: unknown): boolean {
  if (typeof observed === "string" && typeof expected === "string") {
    return observed.includes(expected);
  }
  if (Array.isArray(observed)) {
    return observed.some((item) => deepJsonEqual(item, expected));
  }
  if (isRecord(observed) && isRecord(expected)) {
    return Object.entries(expected).every(([key, value]) => hasOwn(observed, key) && deepJsonEqual(observed[key], value));
  }
  return false;
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

function evaluateHttpStatusBodyJsonAssertion(
  root: unknown,
  assertion: RiddleProofProfileHttpStatusBodyJsonAssertion,
): RiddleProofProfileHttpStatusBodyJsonAssertionResult {
  const resolved = resolveJsonPath(root, assertion.path);
  const errors: string[] = [];
  const result: RiddleProofProfileHttpStatusBodyJsonAssertionResult = {
    label: assertion.label || assertion.path,
    path: assertion.path,
    ok: true,
    exists: resolved.exists,
    observed_type: resolved.exists ? jsonValueType(resolved.value) : "missing",
  };
  if (resolved.exists) attachJsonAssertionObservedValue(result, resolved.value);
  if (resolved.error) errors.push(resolved.error);

  if (hasOwn(assertion, "exists")) {
    result.expected_exists = assertion.exists;
    if (resolved.exists !== assertion.exists) errors.push(`expected exists=${assertion.exists}`);
  }
  if (hasOwn(assertion, "type")) {
    result.type = assertion.type;
    if (!resolved.exists || jsonValueType(resolved.value) !== assertion.type) errors.push(`expected type ${assertion.type}`);
  }
  if (hasOwn(assertion, "equals")) {
    result.equals = assertion.equals;
    if (!resolved.exists || !deepJsonEqual(resolved.value, assertion.equals)) errors.push("expected JSON value equality");
  }
  if (hasOwn(assertion, "not_equals")) {
    result.not_equals = assertion.not_equals;
    if (resolved.exists && deepJsonEqual(resolved.value, assertion.not_equals)) errors.push("expected JSON value inequality");
  }
  if (hasOwn(assertion, "contains")) {
    result.contains = assertion.contains;
    if (!resolved.exists || !jsonContains(resolved.value, assertion.contains)) errors.push("expected JSON value containment");
  }

  result.ok = errors.length === 0;
  if (errors.length) result.errors = errors;
  return result;
}

function evaluateHttpStatusBodyJsonAssertions(
  bodyText: string,
  assertions: RiddleProofProfileHttpStatusBodyJsonAssertion[] | undefined,
): RiddleProofProfileHttpStatusBodyJsonAssertionResult[] {
  const expected = assertions?.filter((assertion) => assertion.path) ?? [];
  if (!expected.length) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch (error) {
    const message = `response body is not valid JSON: ${String(error instanceof Error ? error.message : error).slice(0, 200)}`;
    return expected.map((assertion) => ({
      label: assertion.label || assertion.path,
      path: assertion.path,
      ok: false,
      exists: false,
      observed_type: "missing",
      errors: [message],
    }));
  }
  return expected.map((assertion) => evaluateHttpStatusBodyJsonAssertion(parsed, assertion));
}

function checkLabel(check: RiddleProofProfileCheck): string | undefined {
  return check.label || check.type;
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

function httpStatusAllowedStatuses(check: RiddleProofProfileCheck): number[] | undefined {
  if (check.allowed_statuses?.length) return check.allowed_statuses;
  if (check.expected_status !== undefined) return [check.expected_status];
  return undefined;
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

function responseHeader(
  response: RiddleProofProfileHttpStatusPreflightFetchResponse,
  name: string,
): string | null {
  const getter = response.headers?.get;
  if (typeof getter !== "function") return null;
  return getter.call(response.headers, name);
}

function responseContentLength(response: RiddleProofProfileHttpStatusPreflightFetchResponse): number | null {
  const value = responseHeader(response, "content-length");
  return value && /^\d+$/.test(value) ? Number(value) : null;
}

async function responseBodyText(response: RiddleProofProfileHttpStatusPreflightFetchResponse): Promise<{ text: string; bytes: number | null }> {
  if (typeof response.arrayBuffer === "function") {
    const buffer = await response.arrayBuffer();
    return {
      text: new TextDecoder().decode(buffer),
      bytes: buffer.byteLength,
    };
  }
  if (typeof response.text === "function") {
    const text = await response.text();
    return {
      text,
      bytes: new TextEncoder().encode(text).byteLength,
    };
  }
  return { text: "", bytes: null };
}

function httpStatusRequestBody(check: RiddleProofProfileCheck): { headers: Record<string, string>; body?: string } {
  const headers = isRecord(check.headers)
    ? Object.fromEntries(Object.entries(check.headers).map(([key, value]) => [key, String(value)]).filter(([key]) => key.trim()))
    : {};
  if (check.body_json !== undefined) {
    if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
      headers["content-type"] = "application/json";
    }
    return { headers, body: JSON.stringify(check.body_json) };
  }
  if (typeof check.body === "string") {
    return { headers, body: check.body };
  }
  return { headers };
}

async function preflightHttpStatusCheck(
  check: RiddleProofProfileCheck,
  index: number,
  targetUrl: string,
  fetchImpl: RiddleProofProfileHttpStatusPreflightFetch,
): Promise<RiddleProofProfileHttpStatusPreflightCheckResult> {
  const url = httpStatusRequestUrl(check, targetUrl);
  const method = httpStatusMethod(check);
  const request = httpStatusRequestBody(check);
  const init: Record<string, unknown> = {
    method,
    redirect: "follow",
    cache: "no-store",
    headers: request.headers,
  };
  if (request.body !== undefined && method !== "GET" && method !== "HEAD") {
    init.body = request.body;
  }

  const result: Record<string, unknown> = {
    status: null,
    content_type: null,
    content_length: null,
    bytes: null,
  };
  let error: string | null = null;
  let statusText = "";

  try {
    const response = await fetchImpl(url, init);
    result.status = typeof response.status === "number" && Number.isFinite(response.status) ? response.status : null;
    statusText = typeof response.statusText === "string" ? response.statusText : "";
    result.content_type = responseHeader(response, "content-type");
    result.content_length = responseContentLength(response);

    const shouldReadBody = check.require_nonzero_bytes === true
      || typeof check.min_bytes === "number"
      || Boolean(check.body_contains?.length)
      || Boolean(check.body_not_contains?.length)
      || Boolean(check.body_not_patterns?.length)
      || Boolean(check.body_json_assertions?.length);
    if (shouldReadBody && method !== "HEAD") {
      const body = await responseBodyText(response);
      result.bytes = body.bytes;
      if (check.body_contains?.length) {
        result.body_contains = Object.fromEntries(check.body_contains.filter(Boolean).map((snippet) => [snippet, body.text.includes(snippet)]));
      }
      if (check.body_not_contains?.length) {
        result.body_not_contains = Object.fromEntries(check.body_not_contains.filter(Boolean).map((snippet) => [snippet, body.text.includes(snippet)]));
      }
      if (check.body_not_patterns?.length) {
        result.body_not_patterns = Object.fromEntries(check.body_not_patterns.filter(Boolean).map((pattern) => [pattern, new RegExp(pattern).test(body.text)]));
      }
      if (check.body_json_assertions?.length) {
        result.body_json_assertions = evaluateHttpStatusBodyJsonAssertions(body.text, check.body_json_assertions);
      }
    }
  } catch (caught) {
    error = String(caught instanceof Error ? caught.message : caught).slice(0, 500);
    result.error = error;
  }

  const bodyContainsMissing = httpStatusBodyContainsFailures(result, check);
  const bodyNotContainsFound = httpStatusBodyNotContainsFailures(result, check);
  const bodyNotPatternsFound = httpStatusBodyNotPatternFailures(result, check);
  const bodyJsonAssertionsFailed = httpStatusBodyJsonAssertionFailures(result, check);
  const ok = !error && linkStatusResultOk(result, check);

  return {
    index,
    label: checkLabel(check) || `checks[${index}]`,
    url,
    method,
    ok,
    status: numberValue(result.status) ?? null,
    status_text: statusText,
    error,
    content_type: stringValue(result.content_type) ?? null,
    content_length: numberValue(result.content_length) ?? null,
    bytes: numberValue(result.bytes) ?? null,
    body_contains: isRecord(result.body_contains) ? Object.fromEntries(Object.entries(result.body_contains).map(([key, value]) => [key, value === true])) : null,
    body_contains_missing: bodyContainsMissing,
    body_not_contains: isRecord(result.body_not_contains) ? Object.fromEntries(Object.entries(result.body_not_contains).map(([key, value]) => [key, value === true])) : null,
    body_not_contains_found: bodyNotContainsFound,
    body_not_patterns: isRecord(result.body_not_patterns) ? Object.fromEntries(Object.entries(result.body_not_patterns).map(([key, value]) => [key, value === true])) : null,
    body_not_patterns_found: bodyNotPatternsFound,
    body_json_assertions: Array.isArray(result.body_json_assertions) ? result.body_json_assertions as unknown as RiddleProofProfileHttpStatusBodyJsonAssertionResult[] : null,
    body_json_assertions_failed: bodyJsonAssertionsFailed,
  };
}

export async function preflightRiddleProofProfileHttpStatusChecks(
  profile: RiddleProofProfile,
  options: RiddleProofProfileHttpStatusPreflightOptions = {},
): Promise<RiddleProofProfileHttpStatusPreflightResult> {
  const targetUrl = options.target_url || resolveRiddleProofProfileTargetUrl(profile);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("profile http_status preflight requires fetch support or options.fetchImpl.");
  }

  const httpStatusChecks = profile.checks
    .map((check, index) => ({ check, index }))
    .filter((item) => item.check.type === "http_status");
  const checks = await Promise.all(httpStatusChecks.map((item) => (
    preflightHttpStatusCheck(item.check, item.index, targetUrl, fetchImpl as RiddleProofProfileHttpStatusPreflightFetch)
  )));
  const failed = checks.filter((check) => !check.ok).length;
  return {
    version: "riddle-proof.profile-http-status-preflight.v1",
    ok: failed === 0,
    profile_name: profile.name,
    target_url: targetUrl,
    checked: checks.length,
    failed,
    checks,
    summary: failed === 0
      ? `${profile.name} http_status preflight passed ${checks.length} check(s).`
      : `${profile.name} http_status preflight failed ${failed} of ${checks.length} check(s).`,
  };
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

function runtimeScriptAssessmentSource(includeOrderedTrace = false) {
  const orderedTraceSource = includeOrderedTrace
    ? String.raw`
const assessRiddleProofOrderedTrace = ${assessRiddleProofOrderedTrace.toString()};
const assessRiddleProofOrderedTraceSetupResults = ${assessRiddleProofOrderedTraceSetupResults.toString()};`
    : "";
  return String.raw`
${orderedTraceSource}
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
function setupActionExpectedRoute(action) {
  const expectedUrl = typeof action.expected_url === "string" && action.expected_url.trim()
    ? action.expected_url.trim()
    : typeof action.expectedUrl === "string" && action.expectedUrl.trim()
      ? action.expectedUrl.trim()
      : "";
  const expectedPath = typeof action.expected_path === "string" && action.expected_path.trim()
    ? action.expected_path.trim()
    : typeof action.expectedPath === "string" && action.expectedPath.trim()
      ? action.expectedPath.trim()
      : "";
  if (!expectedUrl && !expectedPath) return null;
  return { expected_url: expectedUrl || undefined, expected_path: expectedPath || undefined };
}
function setupUrlMatchesExpectedRoute(href, expected) {
  if (!expected) return true;
  let observedUrl;
  try {
    observedUrl = new URL(href, targetUrl);
  } catch {
    return false;
  }
  if (expected.expected_url) {
    let expectedUrl;
    try {
      expectedUrl = new URL(expected.expected_url, targetUrl);
    } catch {
      return false;
    }
    return observedUrl.href === expectedUrl.href;
  }
  const expectedPath = expected.expected_path || "/";
  if (/[?#]/.test(expectedPath)) {
    const observedRoute = observedUrl.pathname + observedUrl.search + observedUrl.hash;
    const normalizedObservedRoute = observedRoute === "/" ? "/" : observedRoute.replace(/\/+(?=[?#]|$)/, "");
    const normalizedExpectedRoute = expectedPath === "/" ? "/" : expectedPath.replace(/\/+(?=[?#]|$)/, "");
    return normalizedObservedRoute === normalizedExpectedRoute;
  }
  return routePathMatches(observedUrl.pathname, expectedPath, targetUrl);
}
function setupObservedRouteEvidence(expected, waitError) {
  let observedUrl = page.url();
  let observedPath = "";
  let observedRoute = "";
  try {
    const url = new URL(observedUrl, targetUrl);
    observedUrl = url.href;
    observedPath = url.pathname;
    observedRoute = url.pathname + url.search + url.hash;
  } catch {
    observedPath = "";
    observedRoute = "";
  }
  return {
    expected_url: expected && expected.expected_url || undefined,
    expected_path: expected && expected.expected_path || undefined,
    observed_url: observedUrl,
    observed_path: observedPath,
    observed_route: observedRoute,
    route_matched: setupUrlMatchesExpectedRoute(observedUrl, expected),
    route_wait_error: waitError ? String(waitError && waitError.message ? waitError.message : waitError).slice(0, 1000) : undefined,
  };
}
async function waitForSetupActionRoute(action, timeout) {
  const expected = setupActionExpectedRoute(action);
  if (!expected) return null;
  let waitError;
  try {
    await page.waitForURL((url) => setupUrlMatchesExpectedRoute(url.href, expected), { timeout: Math.min(timeout, 20000) });
  } catch (error) {
    waitError = error;
  }
  return setupObservedRouteEvidence(expected, waitError);
}
function routeOk(route, targetUrl) {
  return Boolean(route && (route.matched || routePathMatches(route.observed, route.expected_path, targetUrl)) && !route.error && (route.http_status == null || route.http_status < 400));
}
function routeReadinessFailed(route, targetUrl) {
  const matched = route && (route.matched || routePathMatches(route.observed, route.expected_path, targetUrl));
  const httpOk = route && (route.http_status == null || route.http_status < 400);
  return Boolean(matched && httpOk && route.error);
}
function compactRouteError(error) {
  const text = typeof error === "string" ? error.replace(/\s+/g, " ").trim() : "";
  return text ? text.slice(0, 240) : undefined;
}
function routeLoadedFailureMessage(failedRoutes, expectedPath, targetUrl) {
  const readinessFailures = failedRoutes.filter((route) => routeReadinessFailed(route, targetUrl));
  if (readinessFailures.length === failedRoutes.length && readinessFailures.length) {
    const sampleRoute = readinessFailures.find((route) => route && route.error);
    const sample = compactRouteError(sampleRoute && sampleRoute.error);
    return "Route matched " + expectedPath + ", but readiness failed in " + readinessFailures.length + " viewport(s)" + (sample ? ": " + sample : ".");
  }
  if (readinessFailures.length) {
    const sampleRoute = readinessFailures.find((route) => route && route.error);
    const sample = compactRouteError(sampleRoute && sampleRoute.error);
    return "Route did not become ready as " + expectedPath + " in " + failedRoutes.length + " viewport(s); " + readinessFailures.length + " matched path and HTTP but failed readiness" + (sample ? ": " + sample : ".");
  }
  return "Route did not load as " + expectedPath + " in " + failedRoutes.length + " viewport(s).";
}
function parseEvidenceUrl(value, targetUrl) {
  if (!value) return null;
  try { return targetUrl ? new URL(value, targetUrl) : new URL(value); } catch {}
  try { return new URL(value); } catch {}
  return null;
}
function observedUrlForViewport(viewport, targetUrl) {
  return parseEvidenceUrl(viewport && viewport.url, targetUrl)
    || parseEvidenceUrl(viewport && viewport.route && viewport.route.observed, targetUrl)
    || parseEvidenceUrl(viewport && viewport.route && viewport.route.requested, targetUrl)
    || parseEvidenceUrl(targetUrl, null);
}
function searchParamObservation(viewport, targetUrl, param) {
  const url = observedUrlForViewport(viewport, targetUrl);
  const values = url ? url.searchParams.getAll(param) : [];
  return {
    viewport: viewport && viewport.name,
    url: url ? url.href : null,
    value: values.length ? values[0] : null,
    values,
    present: values.length > 0,
  };
}
function textMatches(sample, check) {
  if (check.pattern) {
    try { return new RegExp(check.pattern, check.flags || "").test(sample || ""); } catch { return false; }
  }
  return String(sample || "").includes(check.text || "");
}
function compactTextEvidenceSample(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
function textSampleAroundMatch(sample, index, length) {
  if (index < 0) return undefined;
  const source = String(sample || "");
  const context = 120;
  const start = Math.max(0, index - context);
  const end = Math.min(source.length, index + Math.max(length, 1) + context);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < source.length ? "..." : "";
  const compacted = compactTextEvidenceSample(prefix + source.slice(start, end) + suffix);
  return compacted ? compacted.slice(0, 240) : undefined;
}
function textMatchSamples(sample, check) {
  const source = String(sample || "");
  if (!source) return [];
  if (check.pattern) {
    try {
      const flags = Array.from(new Set(String(check.flags || "").replace(/[gy]/g, "").split(""))).join("");
      const match = new RegExp(check.pattern, flags).exec(source);
      const sampleText = match ? textSampleAroundMatch(source, match.index, match[0] ? match[0].length : 1) : undefined;
      return sampleText ? [sampleText] : [];
    } catch { return []; }
  }
  const text = check.text || "";
  if (!text) return [];
  const sampleText = textSampleAroundMatch(source, source.indexOf(text), text.length);
  return sampleText ? [sampleText] : [];
}
function textCaseInsensitiveSamples(sample, check) {
  const source = String(sample || "");
  const text = check.pattern ? "" : check.text || "";
  if (!source || !text) return [];
  const sampleText = textSampleAroundMatch(source, source.toLowerCase().indexOf(text.toLowerCase()), text.length);
  return sampleText ? [sampleText] : [];
}
function textCaseInsensitiveSequenceSamples(texts, check) {
  const text = check.pattern ? "" : compactTextEvidenceSample(check.text || "");
  if (!text) return [];
  const expected = text.toLowerCase();
  return (texts || [])
    .map((candidate) => compactTextEvidenceSample(candidate))
    .filter((candidate) => candidate && candidate.toLowerCase().includes(expected))
    .slice(0, 3)
    .map((candidate) => candidate.slice(0, 240));
}
function textCaseInsensitiveFailureSamples(viewport, check) {
  const key = check.pattern ? "pattern:" + check.pattern + "/" + (check.flags || "") : "text:" + (check.text || "");
  const captured = viewport && viewport.text_case_insensitive_samples && Array.isArray(viewport.text_case_insensitive_samples[key]) ? viewport.text_case_insensitive_samples[key] : [];
  const capturedSamples = captured
    .map((sample) => compactTextEvidenceSample(sample).slice(0, 240))
    .filter(Boolean);
  if (capturedSamples.length) return capturedSamples.slice(0, 3);
  return textCaseInsensitiveSamples(viewport && viewport.body_text_sample || "", check).slice(0, 3);
}
function textCheckFailureSamples(viewport, check) {
  const key = check.pattern ? "pattern:" + check.pattern + "/" + (check.flags || "") : "text:" + (check.text || "");
  const captured = viewport && viewport.text_match_samples && Array.isArray(viewport.text_match_samples[key]) ? viewport.text_match_samples[key] : [];
  const capturedSamples = captured
    .map((sample) => compactTextEvidenceSample(sample).slice(0, 240))
    .filter(Boolean);
  if (capturedSamples.length) return capturedSamples.slice(0, 3);
  const matchedSamples = textMatchSamples(viewport && viewport.body_text_sample || "", check);
  if (matchedSamples.length) return matchedSamples.slice(0, 3);
  const fallback = compactTextEvidenceSample(viewport && viewport.body_text_sample || "").slice(0, 240);
  return fallback ? [fallback] : [];
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
function consoleEventLocationUrl(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  if (!input.location || typeof input.location !== "object" || Array.isArray(input.location)) return undefined;
  return typeof input.location.url === "string" && input.location.url.trim() ? input.location.url.trim() : undefined;
}
function expectedFailedNetworkMockEvents(evidence) {
  return ((evidence && evidence.network_mocks) || []).filter((event) => {
    if (!event || typeof event !== "object" || Array.isArray(event) || event.ok === false) return false;
    const status = typeof event.status === "number" && Number.isFinite(event.status) ? event.status : undefined;
    const url = typeof event.url === "string" && event.url.trim() ? event.url.trim() : undefined;
    const abortErrorCode = typeof event.abort_error_code === "string" && event.abort_error_code.trim() ? event.abort_error_code.trim() : undefined;
    return ((status !== undefined && status >= 400) || (event.abort === true && Boolean(abortErrorCode))) && Boolean(url);
  });
}
function matchingExpectedFailedNetworkMockConsoleEvent(event, evidence) {
  const sample = allowedMessageSample(event);
  if (!/Failed to load resource/i.test(sample)) return undefined;
  const eventUrl = consoleEventLocationUrl(event);
  if (!eventUrl) return undefined;
  return expectedFailedNetworkMockEvents(evidence).find((mockEvent) => {
    const status = typeof mockEvent.status === "number" && Number.isFinite(mockEvent.status) ? mockEvent.status : undefined;
    const mockUrl = typeof mockEvent.url === "string" && mockEvent.url.trim() ? mockEvent.url.trim() : undefined;
    const abortErrorCode = typeof mockEvent.abort_error_code === "string" && mockEvent.abort_error_code.trim() ? mockEvent.abort_error_code.trim() : undefined;
    return mockUrl === eventUrl && ((status !== undefined && sample.includes(String(status))) || (Boolean(abortErrorCode) && /Failed to load resource/i.test(sample)));
  });
}
function isExpectedFailedNetworkMockConsoleEvent(event, evidence) {
  return Boolean(matchingExpectedFailedNetworkMockConsoleEvent(event, evidence));
}
function expectedFailedNetworkMockConsoleEventSummary(event, evidence) {
  const match = matchingExpectedFailedNetworkMockConsoleEvent(event, evidence);
  const sample = allowedMessageSample(event);
  return {
    url: consoleEventLocationUrl(event) || null,
    status: match && typeof match.status === "number" && Number.isFinite(match.status) ? match.status : null,
    abort_error_code: match && typeof match.abort_error_code === "string" && match.abort_error_code.trim() ? match.abort_error_code.trim() : null,
    label: match && typeof match.label === "string" && match.label.trim() ? match.label.trim() : null,
    response_label: match && typeof match.response_label === "string" && match.response_label.trim() ? match.response_label.trim() : null,
    text: event && typeof event === "object" && !Array.isArray(event) && typeof event.text === "string" ? event.text.slice(0, 300) : sample.slice(0, 300),
  };
}
function textSequenceForCheck(viewport, check) {
  const key = check.selector || "";
  const sequence = viewport.text_sequences && viewport.text_sequences[key];
  if (sequence && typeof sequence === "object") {
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
function linkStatusSelector(check) {
  return check.selector || check.link_selector || "a[href]";
}
function httpStatusRequestUrl(check, baseUrl) {
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
function httpStatusMethod(check) {
  return String(check.method || "GET").toUpperCase();
}
function httpStatusKey(check, baseUrl) {
  return httpStatusMethod(check) + " " + httpStatusRequestUrl(check, baseUrl);
}
function httpStatusAllowedStatuses(check) {
  if (Array.isArray(check.allowed_statuses) && check.allowed_statuses.length) return check.allowed_statuses;
  if (typeof check.expected_status === "number" && Number.isFinite(check.expected_status)) return [check.expected_status];
  return undefined;
}
function linkStatusAllowedStatuses(check) {
  return httpStatusAllowedStatuses(check);
}
function httpStatusIsAllowed(status, check) {
  if (typeof status !== "number" || !Number.isFinite(status)) return false;
  const allowed = httpStatusAllowedStatuses(check);
  return Array.isArray(allowed) && allowed.length ? allowed.includes(status) : status >= 200 && status < 400;
}
function linkStatusIsAllowed(status, check) {
  return httpStatusIsAllowed(status, check);
}
function linkStatusObservedBytes(result) {
  const bytes = typeof result.bytes === "number" && Number.isFinite(result.bytes) ? result.bytes : undefined;
  const contentLength = typeof result.content_length === "number" && Number.isFinite(result.content_length) ? result.content_length : undefined;
  const observed = Math.max(bytes || 0, contentLength || 0);
  return observed > 0 ? observed : undefined;
}
function normalizeLinkStatusContentType(value) {
  if (typeof value !== "string") return undefined;
  const normalized = (value.split(";")[0] || "").trim().toLowerCase();
  return normalized || undefined;
}
function linkStatusContentTypesMatch(actual, expected) {
  if (!actual || !expected) return false;
  if (expected.endsWith("/*")) return actual.startsWith(expected.slice(0, -1));
  if (actual === expected) return true;
  const yamlTypes = new Set(["application/yaml", "application/x-yaml", "text/yaml", "text/x-yaml"]);
  return yamlTypes.has(actual) && yamlTypes.has(expected);
}
function linkStatusContentTypeOk(result, check) {
  if (!Array.isArray(check.allowed_content_types) || !check.allowed_content_types.length) return true;
  const actual = normalizeLinkStatusContentType(result.content_type);
  if (!actual) return false;
  return check.allowed_content_types.some((contentType) => {
    const normalized = normalizeLinkStatusContentType(contentType);
    if (!normalized) return false;
    return linkStatusContentTypesMatch(actual, normalized);
  });
}
function httpStatusBodyContainsFailures(result, check) {
  const expected = Array.isArray(check.body_contains) ? check.body_contains.filter(Boolean) : [];
  if (!expected.length) return [];
  const observed = result && typeof result.body_contains === "object" && !Array.isArray(result.body_contains)
    ? result.body_contains
    : {};
  return expected.filter((text) => observed[text] !== true);
}
function httpStatusBodyNotContainsFailures(result, check) {
  const forbidden = Array.isArray(check.body_not_contains) ? check.body_not_contains.filter(Boolean) : [];
  if (!forbidden.length) return [];
  const observed = result && typeof result.body_not_contains === "object" && !Array.isArray(result.body_not_contains)
    ? result.body_not_contains
    : {};
  return forbidden.filter((text) => observed[text] !== false);
}
function httpStatusBodyNotPatternFailures(result, check) {
  const forbidden = Array.isArray(check.body_not_patterns) ? check.body_not_patterns.filter(Boolean) : [];
  if (!forbidden.length) return [];
  const observed = result && typeof result.body_not_patterns === "object" && !Array.isArray(result.body_not_patterns)
    ? result.body_not_patterns
    : {};
  return forbidden.filter((pattern) => observed[pattern] !== false);
}
function httpStatusBodyJsonAssertionFailures(result, check) {
  const expected = Array.isArray(check.body_json_assertions) ? check.body_json_assertions.filter((assertion) => assertion && assertion.path) : [];
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
    .filter((assertion) => assertion && typeof assertion === "object" && assertion.ok !== true)
    .map((assertion) => ({
      label: typeof assertion.label === "string" && assertion.label ? assertion.label : typeof assertion.path === "string" && assertion.path ? assertion.path : "json assertion",
      path: typeof assertion.path === "string" ? assertion.path : "",
      ok: false,
      exists: assertion.exists === true,
      observed: Object.hasOwn(assertion, "observed") ? assertion.observed : undefined,
      observed_sample: Object.hasOwn(assertion, "observed_sample") ? assertion.observed_sample : undefined,
      observed_length: typeof assertion.observed_length === "number" && Number.isFinite(assertion.observed_length) ? assertion.observed_length : undefined,
      observed_key_count: typeof assertion.observed_key_count === "number" && Number.isFinite(assertion.observed_key_count) ? assertion.observed_key_count : undefined,
      observed_omitted_count: typeof assertion.observed_omitted_count === "number" && Number.isFinite(assertion.observed_omitted_count) ? assertion.observed_omitted_count : undefined,
      observed_type: typeof assertion.observed_type === "string" && assertion.observed_type ? assertion.observed_type : "missing",
      expected_exists: typeof assertion.expected_exists === "boolean" ? assertion.expected_exists : undefined,
      equals: Object.hasOwn(assertion, "equals") ? assertion.equals : undefined,
      not_equals: Object.hasOwn(assertion, "not_equals") ? assertion.not_equals : undefined,
      contains: Object.hasOwn(assertion, "contains") ? assertion.contains : undefined,
      type: typeof assertion.type === "string" ? assertion.type : undefined,
      errors: Array.isArray(assertion.errors) ? assertion.errors.map(String) : undefined,
    }));
}
function linkStatusResultOk(result, check) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return false;
  if (!httpStatusIsAllowed(result.status, check)) return false;
  if (typeof result.error === "string" && result.error.trim()) return false;
  if (result.ok === false) return false;
  if (!linkStatusContentTypeOk(result, check)) return false;
  if (check.require_nonzero_bytes === true) {
    const observedBytes = linkStatusObservedBytes(result);
    if (observedBytes === undefined || observedBytes <= 0) return false;
  }
  if (typeof check.min_bytes === "number" && Number.isFinite(check.min_bytes)) {
    const observedBytes = linkStatusObservedBytes(result);
    if (observedBytes === undefined || observedBytes < check.min_bytes) return false;
  }
  if (httpStatusBodyContainsFailures(result, check).length) return false;
  if (httpStatusBodyNotContainsFailures(result, check).length) return false;
  if (httpStatusBodyNotPatternFailures(result, check).length) return false;
  if (httpStatusBodyJsonAssertionFailures(result, check).length) return false;
  return true;
}
function summarizeHttpStatusEvidence(viewport, check) {
  const key = httpStatusKey(check, viewport && viewport.url);
  const statusEvidence = viewport && viewport.http_statuses && viewport.http_statuses[key];
  if (!statusEvidence || typeof statusEvidence !== "object" || Array.isArray(statusEvidence)) {
    return {
      viewport: viewport && viewport.name,
      key,
      url: httpStatusRequestUrl(check, viewport && viewport.url),
      method: httpStatusMethod(check),
      ok: false,
      status: null,
      failures: [{ code: "http_status_evidence_missing" }],
    };
  }
  const failures = [];
  const bodyContainsMissing = httpStatusBodyContainsFailures(statusEvidence, check);
  const bodyNotContainsFound = httpStatusBodyNotContainsFailures(statusEvidence, check);
  const bodyNotPatternsFound = httpStatusBodyNotPatternFailures(statusEvidence, check);
  const bodyJsonAssertionsFailed = httpStatusBodyJsonAssertionFailures(statusEvidence, check);
  if (!linkStatusResultOk(statusEvidence, check)) {
    failures.push({
      code: "http_status_failed",
      url: typeof statusEvidence.url === "string" ? statusEvidence.url : httpStatusRequestUrl(check, viewport && viewport.url),
      status: typeof statusEvidence.status === "number" && Number.isFinite(statusEvidence.status) ? statusEvidence.status : null,
      method: typeof statusEvidence.method === "string" ? statusEvidence.method : httpStatusMethod(check),
      error: typeof statusEvidence.error === "string" ? statusEvidence.error : null,
      content_type: typeof statusEvidence.content_type === "string" ? statusEvidence.content_type : null,
      bytes: linkStatusObservedBytes(statusEvidence) ?? null,
      allowed_statuses: httpStatusAllowedStatuses(check) || ["2xx", "3xx"],
      min_bytes: typeof check.min_bytes === "number" && Number.isFinite(check.min_bytes) ? check.min_bytes : null,
      allowed_content_types: Array.isArray(check.allowed_content_types) ? check.allowed_content_types : null,
      body_contains: Array.isArray(check.body_contains) ? check.body_contains : null,
      body_contains_missing: bodyContainsMissing,
      body_not_contains: Array.isArray(check.body_not_contains) ? check.body_not_contains : null,
      body_not_contains_found: bodyNotContainsFound,
      body_not_patterns: Array.isArray(check.body_not_patterns) ? check.body_not_patterns : null,
      body_not_patterns_found: bodyNotPatternsFound,
      body_json_assertions: Array.isArray(check.body_json_assertions) ? check.body_json_assertions : null,
      body_json_assertions_failed: bodyJsonAssertionsFailed,
      body_sample: typeof statusEvidence.body_sample === "string" ? statusEvidence.body_sample : null,
    });
  }
  return {
    viewport: viewport && viewport.name,
    key,
    url: typeof statusEvidence.url === "string" ? statusEvidence.url : httpStatusRequestUrl(check, viewport && viewport.url),
    method: typeof statusEvidence.method === "string" ? statusEvidence.method : httpStatusMethod(check),
    status: typeof statusEvidence.status === "number" && Number.isFinite(statusEvidence.status) ? statusEvidence.status : null,
    status_text: typeof statusEvidence.status_text === "string" ? statusEvidence.status_text : null,
    ok: failures.length === 0,
    error: typeof statusEvidence.error === "string" ? statusEvidence.error : null,
    content_type: typeof statusEvidence.content_type === "string" ? statusEvidence.content_type : null,
    content_length: typeof statusEvidence.content_length === "number" && Number.isFinite(statusEvidence.content_length) ? statusEvidence.content_length : null,
    bytes: linkStatusObservedBytes(statusEvidence) ?? null,
    body_contains: statusEvidence.body_contains && typeof statusEvidence.body_contains === "object" && !Array.isArray(statusEvidence.body_contains)
      ? statusEvidence.body_contains
      : null,
    body_contains_missing: bodyContainsMissing,
    body_not_contains: statusEvidence.body_not_contains && typeof statusEvidence.body_not_contains === "object" && !Array.isArray(statusEvidence.body_not_contains)
      ? statusEvidence.body_not_contains
      : null,
    body_not_contains_found: bodyNotContainsFound,
    body_not_patterns: statusEvidence.body_not_patterns && typeof statusEvidence.body_not_patterns === "object" && !Array.isArray(statusEvidence.body_not_patterns)
      ? statusEvidence.body_not_patterns
      : null,
    body_not_patterns_found: bodyNotPatternsFound,
    body_json_assertions: Array.isArray(statusEvidence.body_json_assertions) ? statusEvidence.body_json_assertions : null,
    body_json_assertions_failed: bodyJsonAssertionsFailed,
    body_sample: typeof statusEvidence.body_sample === "string" ? statusEvidence.body_sample : null,
    failures,
  };
}
function summarizeLinkStatusEvidence(viewport, check) {
  const selector = linkStatusSelector(check);
  const linkEvidence = viewport && viewport.link_statuses && viewport.link_statuses[selector];
  if (!linkEvidence || typeof linkEvidence !== "object" || Array.isArray(linkEvidence)) {
    return {
      viewport: viewport && viewport.name,
      selector,
      total_count: 0,
      ok_count: 0,
      failed_count: 1,
      failures: [{ code: "link_status_evidence_missing" }],
    };
  }
  const results = Array.isArray(linkEvidence.results) ? linkEvidence.results.filter((result) => result && typeof result === "object" && !Array.isArray(result)) : [];
  const totalCount = typeof linkEvidence.total_count === "number" && Number.isFinite(linkEvidence.total_count) ? linkEvidence.total_count : results.length;
  const resultCount = typeof linkEvidence.result_count === "number" && Number.isFinite(linkEvidence.result_count) ? linkEvidence.result_count : totalCount;
  const storedResultCount = typeof linkEvidence.stored_result_count === "number" && Number.isFinite(linkEvidence.stored_result_count) ? linkEvidence.stored_result_count : results.length;
  const omittedResultCount = typeof linkEvidence.omitted_result_count === "number" && Number.isFinite(linkEvidence.omitted_result_count) ? linkEvidence.omitted_result_count : Math.max(0, resultCount - storedResultCount);
  const omittedSuccessCount = typeof linkEvidence.omitted_success_count === "number" && Number.isFinite(linkEvidence.omitted_success_count) ? linkEvidence.omitted_success_count : 0;
  const okCount = results.filter((result) => linkStatusResultOk(result, check)).length;
  const failures = results
    .filter((result) => !linkStatusResultOk(result, check))
    .map((result) => ({
      code: "link_status_failed",
      url: typeof result.url === "string" ? result.url : null,
      status: typeof result.status === "number" && Number.isFinite(result.status) ? result.status : null,
      method: typeof result.method === "string" ? result.method : null,
      error: typeof result.error === "string" ? result.error : null,
      content_type: typeof result.content_type === "string" ? result.content_type : null,
      bytes: linkStatusObservedBytes(result) ?? null,
      min_bytes: typeof check.min_bytes === "number" && Number.isFinite(check.min_bytes) ? check.min_bytes : null,
      allowed_content_types: Array.isArray(check.allowed_content_types) ? check.allowed_content_types : null,
    }));
  if (typeof linkEvidence.error === "string" && linkEvidence.error.trim()) {
    failures.push({ code: "link_status_capture_failed", error: linkEvidence.error });
  }
  const recordedFailedCount = typeof linkEvidence.failed_count === "number" && Number.isFinite(linkEvidence.failed_count) ? linkEvidence.failed_count : 0;
  if (!failures.length && recordedFailedCount > 0) {
    failures.push({
      code: "link_status_recorded_failures",
      failed_count: recordedFailedCount,
      failures: Array.isArray(linkEvidence.failures) ? linkEvidence.failures.slice(0, 20) : [],
    });
  }
  if (linkEvidence.truncated === true) {
    failures.push({
      code: "link_status_probe_truncated",
      discovered_count: typeof linkEvidence.discovered_count === "number" ? linkEvidence.discovered_count : totalCount,
      max_links: typeof linkEvidence.max_links === "number" ? linkEvidence.max_links : check.max_links || 100,
    });
  }
  if (typeof check.expected_count === "number" && Number.isFinite(check.expected_count) && totalCount !== check.expected_count) {
    failures.push({ code: "link_status_count_mismatch", expected: check.expected_count, actual: totalCount });
  }
  if (typeof check.min_count === "number" && Number.isFinite(check.min_count) && totalCount < check.min_count) {
    failures.push({ code: "link_status_count_below_minimum", min_count: check.min_count, actual: totalCount });
  }
  return {
    viewport: viewport && viewport.name,
    selector,
    total_count: totalCount,
    discovered_count: typeof linkEvidence.discovered_count === "number" ? linkEvidence.discovered_count : totalCount,
    ok_count: typeof linkEvidence.ok_count === "number" ? linkEvidence.ok_count : okCount,
    failed_count: failures.length,
    truncated: linkEvidence.truncated === true,
    max_links: typeof linkEvidence.max_links === "number" ? linkEvidence.max_links : check.max_links || 100,
    result_count: resultCount,
    stored_result_count: storedResultCount,
    omitted_result_count: omittedResultCount,
    omitted_success_count: omittedSuccessCount,
    results_compacted: linkEvidence.results_compacted === true || omittedResultCount > 0,
    min_bytes: typeof check.min_bytes === "number" && Number.isFinite(check.min_bytes) ? check.min_bytes : null,
    allowed_content_types: Array.isArray(check.allowed_content_types) ? check.allowed_content_types : null,
    status_counts: linkEvidence.status_counts && typeof linkEvidence.status_counts === "object" && !Array.isArray(linkEvidence.status_counts) ? linkEvidence.status_counts : {},
    failures: failures.slice(0, 20),
  };
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
function setupActionAppliesToViewport(action, viewportName) {
  if (!Array.isArray(action.viewports) || !action.viewports.length) return true;
  return Boolean(viewportName && action.viewports.includes(viewportName));
}
function setupActionsForViewport(actions, viewportName) {
  return (actions || []).filter((action) => setupActionAppliesToViewport(action, viewportName));
}
function summarizeRouteInventory(viewport, inventory) {
  const directRoutes = Array.isArray(inventory.direct_routes) ? inventory.direct_routes : [];
  const clickthroughs = Array.isArray(inventory.clickthroughs) ? inventory.clickthroughs : [];
  const sourceLinkCount = typeof inventory.source_link_count === "number" ? inventory.source_link_count : typeof inventory.home_game_link_count === "number" ? inventory.home_game_link_count : null;
  const sourceUniqueLinkCount = typeof inventory.source_unique_link_count === "number" ? inventory.source_unique_link_count : typeof inventory.home_unique_game_link_count === "number" ? inventory.home_unique_game_link_count : null;
  const sourceCandidateCount = typeof inventory.source_candidate_count === "number" ? inventory.source_candidate_count : null;
  const sourceCandidateUniqueLinkCount = typeof inventory.source_candidate_unique_link_count === "number" ? inventory.source_candidate_unique_link_count : null;
  const sourceLinkScope = typeof inventory.source_link_scope === "string" ? inventory.source_link_scope : null;
  const duplicateSourceLinks = Array.isArray(inventory.duplicate_source_link_paths) ? inventory.duplicate_source_link_paths.map((path) => String(path)) : [];
  const duplicateSourceLinkCount = typeof inventory.duplicate_source_link_count === "number" ? inventory.duplicate_source_link_count : sourceLinkCount !== null && sourceUniqueLinkCount !== null ? Math.max(0, sourceLinkCount - sourceUniqueLinkCount) : null;
  const failures = Array.isArray(inventory.failures) ? inventory.failures : [];
  return {
    viewport,
    source_link_scope: sourceLinkScope,
    source_candidate_count: sourceCandidateCount == null ? sourceLinkCount : sourceCandidateCount,
    source_candidate_unique_link_count: sourceCandidateUniqueLinkCount == null ? sourceUniqueLinkCount : sourceCandidateUniqueLinkCount,
    source_link_count: sourceLinkCount,
    source_unique_link_count: sourceUniqueLinkCount,
    duplicate_source_link_count: duplicateSourceLinkCount,
    duplicate_source_links: duplicateSourceLinks,
    direct_route_count: directRoutes.length,
    clickthrough_count: clickthroughs.length,
    failure_count: failures.length,
  };
}
function routeInventoryExpectedRouteSummaries(value, fallback) {
  const rawRoutes = Array.isArray(value) ? value : Array.isArray(fallback) ? fallback : [];
  return rawRoutes.map((route) => {
    if (typeof route === "string") {
      const path = route.trim();
      return path ? { path } : null;
    }
    if (!route || typeof route !== "object" || Array.isArray(route)) return null;
    const path = typeof route.path === "string" && route.path.trim() ? route.path.trim() : "";
    if (!path) return null;
    const name = typeof route.name === "string" && route.name.trim() ? route.name.trim() : "";
    return name ? { name, path } : { path };
  }).filter(Boolean);
}
function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function isDialogCountCheckType(type) {
  return type === "dialog_count_equals"
    || type === "dialog_accept_count_equals"
    || type === "dialog_dismiss_count_equals";
}
function dialogCountFieldForCheckType(type) {
  if (type === "dialog_accept_count_equals") return "dialog_accept_count";
  if (type === "dialog_dismiss_count_equals") return "dialog_dismiss_count";
  return "dialog_count";
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
function compactProfileSetupSummaryText(value, limit) {
  limit = limit || 160;
  const text = typeof value === "string" ? value.replace(/\\s+/g, " ").trim() : "";
  if (!text) return undefined;
  if (text.length <= limit) return text;
  return text.slice(0, Math.max(0, limit - 15)).trimEnd() + "... (" + text.length + " chars)";
}
function profileSetupResultAction(result) {
  const action = result && (result.action || result.type);
  return typeof action === "string" && action ? action : "unknown";
}
function profileSetupFrameUrls(viewport) {
  const urls = [];
  const frames = viewport && viewport.frames || {};
  for (const container of Object.values(frames)) {
    if (!container || typeof container !== "object" || Array.isArray(container) || !Array.isArray(container.frames)) continue;
    for (const frame of container.frames) {
      if (!frame || typeof frame !== "object" || Array.isArray(frame)) continue;
      const url = typeof frame.url === "string" ? frame.url : null;
      if (url && !urls.includes(url)) urls.push(url);
    }
  }
  return urls.slice(0, 10);
}
function profileSetupActionCounts(results) {
  const counts = {};
  for (const result of results || []) {
    const action = profileSetupResultAction(result);
    counts[action] = (counts[action] || 0) + 1;
  }
  return counts;
}
function profileSetupScreenshotLabels(results) {
  return (results || [])
    .filter((result) => result && profileSetupResultAction(result) === "screenshot" && result.ok !== false && typeof result.screenshot_label === "string")
    .map((result) => result.screenshot_label)
    .filter(Boolean);
}
function profileSetupWindowCallUntilReceipts(results) {
  return (results || [])
    .filter((result) => result && profileSetupResultAction(result) === "window_call_until")
    .map((result) => ({
      ordinal: result.ordinal ?? null,
      ok: result.ok !== false,
      path: result.path ?? null,
      until_path: result.until_path ?? null,
      until_value: result.until_value ?? null,
      until_expected_value: result.until_expected_value ?? null,
      call_count: result.call_count ?? null,
      max_calls: result.max_calls ?? null,
      reason: result.reason || result.error || null,
    }));
}
function profileSetupWindowCallReceipts(results) {
  return (results || [])
    .filter((result) => result && profileSetupResultAction(result) === "window_call")
    .map((result) => {
      const receipt = {
        ordinal: result.ordinal ?? null,
        label: result.label ?? null,
        ok: result.ok !== false,
        path: result.path ?? null,
        return_captured: result.return_captured ?? null,
        return_stored_to: result.return_stored_to ?? null,
        reason: result.reason || result.store_reason || null,
      };
      if (result.error !== undefined) receipt.error = result.error;
      if (result.returned !== undefined) receipt.returned = result.returned;
      if (result.expected_return !== undefined) receipt.expected_return = result.expected_return;
      const returnSummary = profileSetupReturnSummary(result);
      if (returnSummary.length) receipt.return_summary = returnSummary;
      return receipt;
    });
}
function profileSetupWindowEvalReceipts(results) {
  return (results || [])
    .filter((result) => result && profileSetupResultAction(result) === "window_eval")
    .map((result) => {
      const receipt = {
        ordinal: result.ordinal ?? null,
        label: result.label ?? null,
        ok: result.ok !== false,
        script_length: result.script_length ?? null,
        return_captured: result.return_captured ?? null,
        return_stored_to: result.return_stored_to ?? null,
        reason: result.reason || result.store_reason || null,
      };
      if (result.error !== undefined) receipt.error = result.error;
      if (result.returned !== undefined) receipt.returned = result.returned;
      if (result.expected_return !== undefined) receipt.expected_return = result.expected_return;
      const returnSummary = profileSetupReturnSummary(result);
      if (returnSummary.length) receipt.return_summary = returnSummary;
      return receipt;
    });
}
function profileSetupDeterministicRuntimeReceipts(results) {
  return (results || [])
    .filter((result) => result && profileSetupResultAction(result) === "deterministic_runtime")
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
      reason: result.reason || result.error || null,
    }));
}
function profileSetupReturnSummaryFields(result) {
  const input = result && result.return_summary_fields;
  if (!Array.isArray(input)) return [];
  const fields = [];
  for (const item of input) {
    if (typeof item === "string") {
      const path = item.trim();
      if (path) fields.push({ path });
      continue;
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const path = String(item.path || item.key || item.json_path || item.jsonPath || "").trim();
    if (!path) continue;
    const label = String(item.label || item.name || item.title || "").trim();
    fields.push(label ? { path, label } : { path });
  }
  return fields;
}
function profileSetupReturnSummary(result) {
  if (!result || result.returned === undefined) return [];
  return profileSetupReturnSummaryFields(result).map((field) => {
    const resolved = resolveJsonProbePath(result.returned, field.path);
    const receipt = {
      label: field.label || field.path,
      path: field.path,
      exists: Boolean(resolved.exists),
    };
    if (resolved.exists) receipt.value = setupJsonValue(resolved.value);
    if (resolved.error) receipt.reason = resolved.error;
    return receipt;
  });
}
function profileSetupRangeValueReceipts(results) {
  return (results || [])
    .filter((result) => result && profileSetupResultAction(result) === "set_range_value")
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
      reason: result.reason || result.error || null,
    }));
}
function profileSetupDragReceipts(results) {
  return (results || [])
    .filter((result) => result && profileSetupResultAction(result) === "drag")
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
      reason: result.reason || result.error || null,
    }));
}
function profileSetupTapReceipts(results) {
  return (results || [])
    .filter((result) => result && profileSetupResultAction(result) === "tap")
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
      reason: result.reason || result.error || null,
    }));
}
function profileSetupTapUntilReceipts(results) {
  return (results || [])
    .filter((result) => result && profileSetupResultAction(result) === "tap_until")
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
      reason: result.reason || result.error || null,
    }));
}
function profileSetupKeyboardReceipts(results) {
  return (results || [])
    .filter((result) => result && ["press", "key_down", "key_up"].includes(profileSetupResultAction(result)))
    .map((result) => ({
      action: profileSetupResultAction(result),
      ordinal: result.ordinal ?? null,
      ok: result.ok !== false,
      selector: result.selector ?? null,
      frame_selector: result.frame_selector ?? null,
      key: result.key ?? null,
      hold_ms: result.hold_ms ?? null,
      reason: result.reason || result.error || null,
    }));
}
function profileSetupCanvasSignatureReceipts(results) {
  return (results || [])
    .filter((result) => result && profileSetupResultAction(result) === "canvas_signature")
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
      reason: result.reason || result.error || null,
    }));
}
function profileSetupCanvasSignatureStableHashGroups(results) {
  const groups = new Map();
  for (const receipt of profileSetupCanvasSignatureReceipts(results)) {
    if (receipt.ok === false) continue;
    const hash = typeof receipt.hash === "string" && receipt.hash.trim() ? receipt.hash.trim() : undefined;
    if (!hash) continue;
    const selector = typeof receipt.selector === "string" && receipt.selector.trim() ? receipt.selector.trim() : "canvas";
    const frameSelector = typeof receipt.frame_selector === "string" && receipt.frame_selector.trim() ? receipt.frame_selector.trim() : undefined;
    const key = String(frameSelector || "") + "\\n" + selector;
    const group = groups.get(key) || { selector, frame_selector: frameSelector, receipts: [] };
    const ordinal = typeof receipt.ordinal === "number" && Number.isFinite(receipt.ordinal) ? receipt.ordinal : undefined;
    const label = typeof receipt.label === "string" && receipt.label.trim()
      ? receipt.label.trim()
      : ordinal === undefined
        ? "capture-" + (group.receipts.length + 1)
        : "#" + ordinal;
    group.receipts.push({ hash, label, ordinal });
    groups.set(key, group);
  }
  const warnings = [];
  for (const group of groups.values()) {
    const receiptsByHash = new Map();
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
        frame_selector: group.frame_selector || null,
        hash,
        count: receipts.length,
        label_count: labels.length,
        labels: visibleLabels,
        omitted_label_count: Math.max(0, labels.length - visibleLabels.length),
        ordinals: receipts
          .map((receipt) => receipt.ordinal)
          .filter((value) => value !== undefined)
          .slice(0, 12),
        reason: "stable_canvas_signature_hash",
      });
    }
  }
  return warnings;
}
function profileSetupClickSequenceReceipts(clickedItems) {
  const nthChildPattern = /:nth-child\((\d+)\)/;
  const nthChildTemplatePattern = /:nth-child\(\d+\)/g;
  const groups = new Map();
  for (const item of clickedItems || []) {
    const selector = typeof item.selector === "string" && item.selector.trim() ? item.selector.trim() : undefined;
    if (!selector) continue;
    const frameSelector = typeof item.frame_selector === "string" && item.frame_selector.trim() ? item.frame_selector.trim() : undefined;
    const clickCountValue = typeof item.click_count === "number" && Number.isFinite(item.click_count) ? item.click_count : undefined;
    const clickCount = clickCountValue === undefined ? 1 : Math.max(1, Math.min(100, Math.floor(clickCountValue)));
    const ordinal = typeof item.ordinal === "number" && Number.isFinite(item.ordinal) ? item.ordinal : undefined;
    const match = nthChildPattern.exec(selector);
    const selectorTemplate = match
      ? selector.replace(nthChildTemplatePattern, ":nth-child(*)")
      : selector;
    const valueSource = match ? "nth-child" : "same-selector";
    const key = valueSource + "\\n" + String(frameSelector || "") + "\\n" + selectorTemplate;
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
        frame_selector: group.frame_selector || null,
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
function sampleProfileSetupSummaryItems(items, limit) {
  if ((items || []).length <= limit) return items || [];
  const firstCount = Math.floor(limit / 2);
  const lastCount = limit - firstCount;
  return [...items.slice(0, firstCount), ...items.slice(-lastCount)];
}
function profileScreenshotLabels(viewports) {
  const labels = [];
  for (const viewport of viewports || []) {
    if (viewport && viewport.screenshot_label) labels.push(viewport.screenshot_label);
    labels.push(...profileSetupScreenshotLabels(viewport && viewport.setup_action_results || []));
  }
  return labels;
}
function profileFinalScreenshotLabels(viewports) {
  return (viewports || []).map((viewport) => viewport && viewport.screenshot_label).filter(Boolean);
}
function profileAllSetupScreenshotLabels(viewports) {
  return (viewports || []).flatMap((viewport) => profileSetupScreenshotLabels(viewport && viewport.setup_action_results || []));
}
function profileSetupSummary(viewports, actionCount, expectedActionCountsByViewport, finalScreenshotFullPage) {
  const normalizedFinalScreenshotFullPage = finalScreenshotFullPage === undefined
    ? undefined
    : finalScreenshotFullPage !== false;
  const finalScreenshotCount = (viewports || []).filter((viewport) => viewport && typeof viewport.screenshot_label === "string" && viewport.screenshot_label.trim()).length;
  return {
    viewport_count: (viewports || []).length,
    action_count: actionCount ?? null,
    final_screenshot_count: finalScreenshotCount,
    final_screenshot_full_page: normalizedFinalScreenshotFullPage ?? null,
    final_screenshot_mode: normalizedFinalScreenshotFullPage === undefined
      ? null
      : normalizedFinalScreenshotFullPage
        ? "full_page"
        : "viewport",
    viewports: (viewports || []).map((viewport) => {
      const expectedActionCount = expectedActionCountsByViewport && expectedActionCountsByViewport[viewport.name] !== undefined
        ? expectedActionCountsByViewport[viewport.name]
        : actionCount;
      const viewportFinalScreenshotFullPage = typeof viewport.screenshot_full_page === "boolean"
        ? viewport.screenshot_full_page
        : normalizedFinalScreenshotFullPage;
      const results = viewport.setup_action_results || [];
      const failed = results.filter((result) => result && result.ok === false && result.optional !== true);
      const optionalFailed = results.filter((result) => result && result.ok === false && result.optional === true);
      const successfulClicks = results.filter((result) => result && profileSetupResultAction(result) === "click" && result.ok !== false);
      const clickCountValues = successfulClicks
        .map((result) => typeof result.click_count === "number" && Number.isFinite(result.click_count) && result.click_count > 1 ? result.click_count : undefined)
        .filter((value) => value !== undefined);
      const windowCallUntilReceipts = profileSetupWindowCallUntilReceipts(results);
      const windowCallUntilCallCounts = windowCallUntilReceipts
        .map((result) => typeof result.call_count === "number" && Number.isFinite(result.call_count) ? result.call_count : undefined)
        .filter((value) => value !== undefined);
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
        .filter((value) => value !== undefined);
      const sampledTapUntilReceipts = sampleProfileSetupSummaryItems(tapUntilReceipts, 8);
      const keyboardReceipts = profileSetupKeyboardReceipts(results);
      const sampledKeyboardReceipts = sampleProfileSetupSummaryItems(keyboardReceipts, 8);
      const canvasSignatureReceipts = profileSetupCanvasSignatureReceipts(results);
      const sampledCanvasSignatureReceipts = sampleProfileSetupSummaryItems(canvasSignatureReceipts, 8);
      const clickedItems = results
        .filter((result) => result && profileSetupResultAction(result) === "click" && result.ok !== false)
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
      const textSamples = results
        .filter((result) => result && result.ok !== false && typeof result.text === "string" && (
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
        observed_path: viewport.route && viewport.route.observed || null,
        final_url: viewport.url || null,
        action_counts: profileSetupActionCounts(results),
        frame_action_count: results.filter((result) => result && result.frame_selector).length,
        frame_urls: profileSetupFrameUrls(viewport),
        final_screenshot: viewport.screenshot_label || null,
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
        text_samples: textSamples,
        failed: failed.map((result) => ({
          ordinal: result.ordinal ?? null,
          action: profileSetupResultAction(result),
          selector: result.selector ?? null,
          frame_selector: result.frame_selector ?? null,
          reason: result.reason || result.error || null,
          error: result.error || null,
          case_insensitive_text: compactProfileSetupSummaryText(result.case_insensitive_text),
        })),
        optional_failed: optionalFailed.map((result) => ({
          ordinal: result.ordinal ?? null,
          action: profileSetupResultAction(result),
          selector: result.selector ?? null,
          frame_selector: result.frame_selector ?? null,
          reason: result.reason || result.error || null,
          error: result.error || null,
          case_insensitive_text: compactProfileSetupSummaryText(result.case_insensitive_text),
        })),
      };
    }),
  };
}
function assessProfile(profile, evidence) {
  const checks = [];
  const viewports = evidence.viewports || [];
  if (profile.target && Array.isArray(profile.target.network_mocks) && profile.target.network_mocks.length) {
    const events = evidence.network_mocks || [];
    const requiredMocks = profile.target.network_mocks.filter((mock) => mock && mock.required !== false);
    const failed = [];
    const hitCountForMock = (mock) => events.filter((event) => event && event.label === mock.label && event.ok !== false).length;
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
    for (const mock of profile.target.network_mocks) {
      if (!mock || mock.max_hit_count === undefined) continue;
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
    const maxHitsByLabel = {};
    const responseHitsByLabel = {};
    for (const mock of profile.target.network_mocks) {
      hitsByLabel[mock.label] = hitCountForMock(mock);
      if (mock && mock.required !== false) requiredHitsByLabel[mock.label] = requiredNetworkMockHitCount(mock);
      if (mock && mock.max_hit_count !== undefined) maxHitsByLabel[mock.label] = mock.max_hit_count;
    }
    for (const event of events) {
      if (!event || event.ok === false) continue;
      const label = typeof event.label === "string" ? event.label : "";
      const responseLabel = typeof event.response_label === "string" ? event.response_label : "";
      const hasSequenceResponse = typeof event.response_index === "number" || event.sequence_cycle === true || Boolean(responseLabel && responseLabel !== label);
      if (!label || !responseLabel || !hasSequenceResponse) continue;
      responseHitsByLabel[label] ||= {};
      responseHitsByLabel[label][responseLabel] = (responseHitsByLabel[label][responseLabel] || 0) + 1;
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
        max_hits_by_label: maxHitsByLabel,
        response_hits_by_label: responseHitsByLabel,
        failed,
      },
      message: failed.length ? "Network mocks failed or hit-count contracts failed for " + failed.length + " mock(s)." : undefined,
    });
  }
  if (profile.target && Array.isArray(profile.target.setup_actions) && profile.target.setup_actions.length) {
    const actionCount = profile.target.setup_actions.length;
    const failed = [];
    const expectedActionCountsByViewport = {};
    for (const viewport of viewports) {
      const expectedActionCount = setupActionsForViewport(profile.target.setup_actions, viewport.name).length;
      expectedActionCountsByViewport[viewport.name] = expectedActionCount;
      const results = viewport.setup_action_results || [];
      for (const result of results) {
        if (result && result.ok === false && result.optional !== true) {
          failed.push({
            viewport: viewport.name,
          action: result.action || result.type || null,
          selector: result.selector || null,
          frame_selector: result.frame_selector || null,
          frame_index: result.frame_index ?? null,
          reason: result.reason || result.error || null,
        });
        }
      }
      if (results.length < expectedActionCount && results.every((result) => !result || result.ok !== false || result.optional === true)) {
        failed.push({
          viewport: viewport.name,
          action: "setup_actions",
          selector: null,
          reason: "missing setup action results: " + results.length + "/" + expectedActionCount,
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
          expected_action_count: expectedActionCountsByViewport[viewport.name] ?? actionCount,
          ok: (viewport.setup_action_results || []).length >= (expectedActionCountsByViewport[viewport.name] ?? actionCount)
            && (viewport.setup_action_results || []).every((result) => !result || result.ok !== false || result.optional === true),
          result_count: (viewport.setup_action_results || []).length,
        })),
        setup_summary: profileSetupSummary(viewports, actionCount, expectedActionCountsByViewport, profile.target && profile.target.screenshot_full_page),
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
    if (isDialogCountCheckType(check.type)) {
      const field = dialogCountFieldForCheckType(check.type);
      const expectedCount = check.expected_count == null ? 0 : check.expected_count;
      const actualCount = numberValue(evidence.dom_summary && evidence.dom_summary[field]) ?? 0;
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: actualCount === expectedCount ? "passed" : "failed",
        evidence: { field, expected_count: expectedCount, count: actualCount },
        message: actualCount === expectedCount ? undefined : field + " did not equal " + expectedCount + "; observed " + actualCount + ".",
      });
      continue;
    }
    if (check.type === "route_loaded") {
      const expectedPath = check.expected_path || new URL(evidence.target_url).pathname || "/";
      const routes = checkViewports.map((viewport) => {
        const route = { ...(viewport.route || {}), expected_path: expectedPath };
        route.matched = routePathMatches(route.observed, expectedPath, evidence.target_url) || route.matched;
        return route;
      });
      const failed = routes.filter((route) => !routeOk(route, evidence.target_url));
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failed.length ? "failed" : "passed",
        evidence: {
          expected_path: expectedPath,
          observed_paths: checkViewports.map((viewport) => viewport.route && viewport.route.observed),
          http_statuses: checkViewports.map((viewport) => viewport.route ? viewport.route.http_status ?? null : null),
          route_errors: checkViewports.map((viewport) => viewport.route ? viewport.route.error ?? null : null),
        },
        message: failed.length ? routeLoadedFailureMessage(failed, expectedPath, evidence.target_url) : undefined,
      });
      continue;
    }
    if (check.type === "url_search_param_equals") {
      const param = check.param || "";
      const expectedValue = check.expected_value == null ? "" : String(check.expected_value);
      const observations = checkViewports.map((viewport) => searchParamObservation(viewport, evidence.target_url, param));
      const failed = observations.filter((observation) => observation.value !== expectedValue);
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failed.length ? "failed" : "passed",
        evidence: {
          param,
          expected_value: expectedValue,
          observed_values: observations.map((observation) => observation.value),
          observed_all_values: observations.map((observation) => observation.values),
          observed_urls: observations.map((observation) => observation.url),
          viewports: observations,
        },
        message: failed.length ? "URL search param " + param + " did not equal " + JSON.stringify(expectedValue) + " in " + failed.length + " viewport(s)." : undefined,
      });
      continue;
    }
    if (check.type === "url_search_param_absent") {
      const param = check.param || "";
      const observations = checkViewports.map((viewport) => searchParamObservation(viewport, evidence.target_url, param));
      const failed = observations.filter((observation) => observation.present);
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failed.length ? "failed" : "passed",
        evidence: {
          param,
          observed_values: observations.map((observation) => observation.value),
          observed_all_values: observations.map((observation) => observation.values),
          observed_urls: observations.map((observation) => observation.url),
          viewports: observations,
        },
        message: failed.length ? "URL search param " + param + " was present in " + failed.length + " viewport(s)." : undefined,
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
    if (check.type === "selector_text_visible" || check.type === "selector_text_absent") {
      const selector = check.selector || "";
      const expectedVisible = check.type === "selector_text_visible";
      const results = checkViewports.map((viewport) => {
        const texts = textSequenceForCheck(viewport, check);
        const matches = texts.filter((text) => textMatches(text, check));
        const matched = matches.length > 0;
        const failedAgainstExpectation = matched !== expectedVisible;
        const sampleTexts = matches.length ? matches : failedAgainstExpectation ? texts : [];
        const caseInsensitiveSamples = failedAgainstExpectation && expectedVisible && !matched
          ? textCaseInsensitiveSequenceSamples(texts, check)
          : [];
        return {
          viewport: viewport.name,
          selector_count: viewport.selectors && viewport.selectors[selector] ? viewport.selectors[selector].count : 0,
          visible_count: viewport.selectors && viewport.selectors[selector] ? viewport.selectors[selector].visible_count : 0,
          matched_count: matches.length,
          matched,
          samples: sampleTexts.slice(0, 3).map((text) => text.slice(0, 240)),
          case_insensitive_samples: caseInsensitiveSamples,
        };
      });
      const failed = results.filter((result) => result.matched !== expectedVisible).length;
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failed ? "failed" : "passed",
        evidence: { selector, text: check.text || null, pattern: check.pattern || null, viewports: results },
        message: failed ? "Selector " + selector + " text assertion failed in " + failed + " viewport(s)." : undefined,
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
          visible_texts: texts.slice(0, 20).map((text) => text.slice(0, 240)),
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
    if (check.type === "ordered_trace") {
      const assessments = checkViewports.map((viewport) => ({
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
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: insufficient.length ? "proof_insufficient" : failed.length ? "failed" : "passed",
        evidence: {
          setup_action_label: check.setup_action_label || "",
          trace_path: check.trace_path || "",
          events: (check.events || []).map((event) => event.label),
          viewports: assessments,
        },
        message: insufficient.length
          ? "Ordered trace evidence was insufficient in " + insufficient.length + " viewport(s)."
          : failed.length
            ? "Ordered trace did not contain the required event sequence in " + failed.length + " viewport(s)."
            : undefined,
      });
      continue;
    }
    if (check.type === "observe_within") {
      const key = observeWithinKey(check);
      const timeoutMs = observeWithinTimeoutMs(check);
      const results = checkViewports.map((viewport) => {
        const observation = viewport.observations && viewport.observations[key] && typeof viewport.observations[key] === "object"
          ? viewport.observations[key]
          : {};
        return {
          viewport: viewport.name,
          matched: observation.matched === true,
          elapsed_ms: typeof observation.elapsed_ms === "number" && Number.isFinite(observation.elapsed_ms) ? observation.elapsed_ms : null,
          timeout_ms: typeof observation.timeout_ms === "number" && Number.isFinite(observation.timeout_ms) ? observation.timeout_ms : timeoutMs,
          attempts: typeof observation.attempts === "number" && Number.isFinite(observation.attempts) ? observation.attempts : null,
          selector_count: typeof observation.selector_count === "number" && Number.isFinite(observation.selector_count) ? observation.selector_count : null,
          visible_count: typeof observation.visible_count === "number" && Number.isFinite(observation.visible_count) ? observation.visible_count : null,
          matched_count: typeof observation.matched_count === "number" && Number.isFinite(observation.matched_count) ? observation.matched_count : null,
          sample: typeof observation.sample === "string" && observation.sample.trim() ? observation.sample.trim() : null,
          error: typeof observation.error === "string" && observation.error.trim() ? observation.error.trim() : null,
        };
      });
      const failed = results.filter((result) => !result.matched).length;
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failed ? "failed" : "passed",
        evidence: { selector: check.selector || null, text: check.text || null, pattern: check.pattern || null, timeout_ms: timeoutMs, viewports: results },
        message: failed ? "Observation did not match within " + timeoutMs + "ms in " + failed + " viewport(s)." : undefined,
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
    if (check.type === "frame_url_equals" || check.type === "frame_url_matches") {
      const selector = check.selector || "";
      const expectedUrl = check.expected_url || check.expected_value || "";
      const results = checkViewports.map((viewport) => {
        const frames = frameEvidenceForSelector(viewport, selector);
        const urls = frames.map((frame) => String(frame.url || "")).filter(Boolean);
        const matches = urls.filter((url) => check.type === "frame_url_equals" ? url === expectedUrl : textMatches(url, check));
        return {
          viewport: viewport.name,
          frame_count: frames.length,
          matched_count: matches.length,
          matched: matches.length > 0,
          urls: urls.slice(0, 10),
        };
      });
      const failed = results.filter((result) => !result.matched).length;
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failed ? "failed" : "passed",
        evidence: {
          selector,
          expected_url: check.type === "frame_url_equals" ? expectedUrl : null,
          pattern: check.type === "frame_url_matches" ? check.pattern || null : null,
          viewports: results,
        },
        message: failed ? "Frame selector " + selector + " URL assertion failed in " + failed + " viewport(s)." : undefined,
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
      const results = checkViewports.map((viewport) => {
        const matched = viewport.text_matches && typeof viewport.text_matches[key] === "boolean" ? viewport.text_matches[key] : textMatches(viewport.body_text_sample || "", check);
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
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failed ? "failed" : "passed",
        evidence: { text: check.text, pattern: check.pattern, matches, viewports: results },
        message: failed ? "Text assertion failed in " + failed + " viewport(s)." : undefined,
      });
      continue;
    }
    if (check.type === "http_status") {
      const url = httpStatusRequestUrl(check, evidence.target_url);
      const method = httpStatusMethod(check);
      const summaries = checkViewports.map((viewport) => summarizeHttpStatusEvidence(viewport, check));
      const failed = summaries.filter((summary) => Array.isArray(summary.failures) && summary.failures.length > 0);
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failed.length ? "failed" : "passed",
        evidence: {
          url,
          method,
          allowed_statuses: httpStatusAllowedStatuses(check) || ["2xx", "3xx"],
          require_nonzero_bytes: check.require_nonzero_bytes === true,
          min_bytes: check.min_bytes ?? null,
          allowed_content_types: check.allowed_content_types ?? null,
          viewports: summaries,
          failures: failed.flatMap((summary) => Array.isArray(summary.failures)
            ? summary.failures.map((failure) => ({ viewport: summary.viewport || null, failure }))
            : []),
        },
        message: failed.length ? "HTTP status failed in " + failed.length + " viewport(s)." : undefined,
      });
      continue;
    }
    if (check.type === "link_status" || check.type === "artifact_link_status") {
      const selector = linkStatusSelector(check);
      const summaries = checkViewports.map((viewport) => summarizeLinkStatusEvidence(viewport, check));
      const failed = summaries.filter((summary) => summary.failed_count > 0);
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failed.length ? "failed" : "passed",
        evidence: {
          selector,
          expected_count: check.expected_count ?? null,
          min_count: check.min_count ?? null,
          allowed_statuses: linkStatusAllowedStatuses(check) || ["2xx", "3xx"],
          require_nonzero_bytes: check.require_nonzero_bytes === true,
          min_bytes: check.min_bytes ?? null,
          allowed_content_types: check.allowed_content_types ?? null,
          viewports: summaries,
          failures: failed.flatMap((summary) => Array.isArray(summary.failures)
            ? summary.failures.map((failure) => ({ viewport: summary.viewport || null, failure }))
            : []),
        },
        message: failed.length ? "Link status failed in " + failed.length + " viewport(s)." : undefined,
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
          evidence: {
            expected_count: (check.expected_routes || []).length,
            expected_routes: routeInventoryExpectedRouteSummaries(undefined, check.expected_routes),
          },
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
      const sourceCandidateCount = typeof first.source_candidate_count === "number" ? first.source_candidate_count : null;
      const sourceCandidateUniqueLinkCount = typeof first.source_candidate_unique_link_count === "number" ? first.source_candidate_unique_link_count : null;
      const sourceLinkScope = typeof first.source_link_scope === "string" ? first.source_link_scope : null;
      const duplicateSourceLinks = Array.isArray(first.duplicate_source_link_paths) ? first.duplicate_source_link_paths.map((path) => String(path)) : [];
      const duplicateSourceLinkCount = typeof first.duplicate_source_link_count === "number" ? first.duplicate_source_link_count : sourceLinkCount !== null && sourceUniqueLinkCount !== null ? Math.max(0, sourceLinkCount - sourceUniqueLinkCount) : null;
      const expectedRoutes = routeInventoryExpectedRouteSummaries(first.expected_routes, check.expected_routes);
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: failures.length ? "failed" : "passed",
        evidence: {
          expected_count: (check.expected_routes || []).length,
          expected_routes: expectedRoutes,
          source_link_scope: sourceLinkScope,
          source_candidate_count: sourceCandidateCount == null ? sourceLinkCount : sourceCandidateCount,
          source_candidate_unique_link_count: sourceCandidateUniqueLinkCount == null ? sourceUniqueLinkCount : sourceCandidateUniqueLinkCount,
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
        const mobileOnly = check.type === "no_mobile_horizontal_overflow";
        checks.push({
          type: check.type,
          label: check.label || check.type,
          status: mobileOnly ? "skipped" : "failed",
          evidence: { max_overflow_px: maxOverflow, viewports: [] },
          message: mobileOnly
            ? "No mobile viewport evidence was captured; mobile overflow check skipped."
            : "No applicable viewport evidence was captured for overflow check.",
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
          explicitly_allowed_console_fatal_count: explicitlyAllowedConsoleEvents.length,
          allowed_expected_network_mock_console_count: expectedNetworkMockConsoleEvents.length,
          allowed_expected_network_mock_console_events: expectedNetworkMockConsoleEvents.slice(0, 5).map((event) => expectedFailedNetworkMockConsoleEventSummary(event, evidence)),
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
    if (check.type === "no_console_warnings") {
      const warningConsoleEvents = ((evidence.console && evidence.console.events) || []).filter((event) => event && (event.type === "warning" || event.type === "warn"));
      const allowedConsoleEvents = warningConsoleEvents.filter((event) => matchesAllowedMessage(event, check.allowed_console_texts, check.allowed_console_patterns));
      const unallowedConsoleEvents = warningConsoleEvents.filter((event) => !matchesAllowedMessage(event, check.allowed_console_texts, check.allowed_console_patterns));
      checks.push({
        type: check.type,
        label: check.label || check.type,
        status: unallowedConsoleEvents.length ? "failed" : "passed",
        evidence: {
          console_warning_count: unallowedConsoleEvents.length,
          total_console_warning_count: warningConsoleEvents.length,
          allowed_console_warning_count: allowedConsoleEvents.length,
          allowed_console_texts: check.allowed_console_texts || [],
          allowed_console_patterns: check.allowed_console_patterns || [],
          unallowed_console_warning_samples: unallowedConsoleEvents.slice(0, 5).map((event) => allowedMessageSample(event)),
          allowed_console_warning_samples: allowedConsoleEvents.slice(0, 5).map((event) => allowedMessageSample(event)),
        },
        message: unallowedConsoleEvents.length ? String(unallowedConsoleEvents.length) + " console warning(s) were captured." : undefined,
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
  else if (checks.some((check) => check.status === "proof_insufficient")) status = "proof_insufficient";
  else if (checks.some((check) => check.status === "needs_human_review")) status = "needs_human_review";
  else if (checks.some((check) => check.status === "failed")) status = "product_regression";
  const screenshotLabels = profileScreenshotLabels(viewports);
  const canonicalScreenshotLabels = profileFinalScreenshotLabels(viewports);
  const setupScreenshotLabels = profileAllSetupScreenshotLabels(viewports);
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
    artifacts: {
      screenshots: screenshotLabels,
      canonical_screenshots: canonicalScreenshotLabels,
      setup_screenshots: setupScreenshotLabels,
      console: "console.json",
      proof_json: "proof.json",
      dom_summary: "dom-summary.json"
    },
    checks,
    summary,
    captured_at: evidence.captured_at,
    metadata: profile.metadata,
    warnings: profileWarnings.length ? profileWarnings : undefined,
    evidence,
  };
}
`;
}

export function buildRiddleProofProfileScript(profile: RiddleProofProfile) {
  const targetUrl = resolveRiddleProofProfileTargetUrl(profile);
  const slug = slugifyRiddleProofProfileName(profile.name);
  const profileWarnings = collectRiddleProofProfileWarnings(profile);
  const serializableProfile = JSON.stringify(profile);
  const serializableProfileWarnings = JSON.stringify(profileWarnings);
  const serializableTargetUrl = JSON.stringify(targetUrl);
  const serializableSlug = JSON.stringify(slug);
  return String.raw`
const profile = ${serializableProfile};
const profileWarnings = ${serializableProfileWarnings};
const targetUrl = ${serializableTargetUrl};
const profileSlug = ${serializableSlug};
const capturedAt = new Date().toISOString();
const consoleEvents = [];
const pageErrors = [];
const networkMockEvents = [];
const dialogEvents = [];
let dialogResponseConfig = null;
let dialogHandlerInstalled = false;
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
function setupDialogMessageMatches(message, config) {
  if (!config) return true;
  if (config.message_pattern) {
    try { return new RegExp(config.message_pattern, config.flags || "").test(message || ""); } catch { return false; }
  }
  if (config.message_text) return String(message || "").includes(config.message_text);
  return true;
}
function ensureDialogHandler() {
  if (dialogHandlerInstalled) return;
  dialogHandlerInstalled = true;
  page.on("dialog", async (dialog) => {
    const config = dialogResponseConfig || { accept: false };
    const message = typeof dialog.message === "function" ? dialog.message() : "";
    const type = typeof dialog.type === "function" ? dialog.type() : "dialog";
    const defaultValue = typeof dialog.defaultValue === "function" ? dialog.defaultValue() : "";
    const accept = config.accept !== false;
    const event = {
      type,
      message: String(message || "").slice(0, 1000),
      default_value: String(defaultValue || "").slice(0, 500),
      configured: Boolean(dialogResponseConfig),
      response: accept ? "accept" : "dismiss",
      message_matches: setupDialogMessageMatches(message, config),
      expected_message_text: config.message_text || undefined,
      expected_message_pattern: config.message_pattern || undefined,
    };
    try {
      if (accept) {
        const promptText = config.prompt_text === undefined ? undefined : String(config.prompt_text);
        await dialog.accept(promptText);
      } else {
        await dialog.dismiss();
      }
      dialogEvents.push({ ...event, ok: true });
    } catch (error) {
      dialogEvents.push({
        ...event,
        ok: false,
        error: String(error && error.message ? error.message : error).slice(0, 1000),
      });
    }
  });
}
function textKey(check) {
  return check.pattern ? "pattern:" + check.pattern + "/" + (check.flags || "") : "text:" + (check.text || "");
}
function observeWithinTimeoutMs(check) {
  const raw = Number(check && check.timeout_ms);
  return Number.isFinite(raw) && raw > 0 ? Math.min(Math.round(raw), 60000) : 2000;
}
function observeWithinKey(check) {
  const target = check && check.selector ? "selector:" + check.selector : "page";
  const expectation = check && check.pattern
    ? "pattern:" + check.pattern + "/" + (check.flags || "")
    : check && check.text
      ? "text:" + check.text
      : "visible";
  return target + "|" + expectation + "|within:" + observeWithinTimeoutMs(check);
}
function textMatches(sample, check) {
  if (check.pattern) {
    try { return new RegExp(check.pattern, check.flags || "").test(sample || ""); } catch { return false; }
  }
  return String(sample || "").includes(check.text || "");
}
function compactTextEvidenceSample(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
function textSampleAroundMatch(sample, index, length) {
  if (index < 0) return undefined;
  const source = String(sample || "");
  const context = 120;
  const start = Math.max(0, index - context);
  const end = Math.min(source.length, index + Math.max(length, 1) + context);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < source.length ? "..." : "";
  const compacted = compactTextEvidenceSample(prefix + source.slice(start, end) + suffix);
  return compacted ? compacted.slice(0, 240) : undefined;
}
function textMatchSamples(sample, check) {
  const source = String(sample || "");
  if (!source) return [];
  if (check.pattern) {
    try {
      const flags = Array.from(new Set(String(check.flags || "").replace(/[gy]/g, "").split(""))).join("");
      const match = new RegExp(check.pattern, flags).exec(source);
      const sampleText = match ? textSampleAroundMatch(source, match.index, match[0] ? match[0].length : 1) : undefined;
      return sampleText ? [sampleText] : [];
    } catch { return []; }
  }
  const text = check.text || "";
  if (!text) return [];
  const sampleText = textSampleAroundMatch(source, source.indexOf(text), text.length);
  return sampleText ? [sampleText] : [];
}
function profileCheckAppliesToViewport(check, viewport) {
  if (!Array.isArray(check.viewports) || !check.viewports.length) return true;
  return Boolean(viewport && viewport.name && check.viewports.includes(viewport.name));
}
function setupActionType(action) {
  return String(action && action.type ? action.type : "").replace(/-/g, "_");
}
function setupNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}
function setupFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
function normalizeSetupMatchText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
function setupTextMatches(sample, action) {
  const rawSample = String(sample || "");
  if (action.pattern) {
    try {
      const rawPattern = new RegExp(action.pattern, action.flags || "");
      if (rawPattern.test(rawSample)) return true;
      return new RegExp(action.pattern, action.flags || "").test(normalizeSetupMatchText(rawSample));
    } catch { return false; }
  }
  const expected = String(action.text || "");
  return rawSample.includes(expected)
    || normalizeSetupMatchText(rawSample).includes(normalizeSetupMatchText(expected));
}
function setupCaseInsensitiveTextSample(sample, action) {
  if (!action || action.pattern || !action.text) return "";
  const normalizedSample = normalizeSetupMatchText(sample);
  const normalizedExpected = normalizeSetupMatchText(action.text);
  if (!normalizedSample || !normalizedExpected) return "";
  if (!normalizedSample.toLowerCase().includes(normalizedExpected.toLowerCase())) return "";
  return compactSetupResultText(normalizedSample);
}
async function selectorVisibilityDiagnostic(context, selector) {
  return await context.locator(selector).evaluateAll((elements) => {
    const isVisible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style && style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const describeElement = (element) => {
      const tag = String(element.tagName || "element").toLowerCase();
      const id = element.id ? "#" + String(element.id).slice(0, 40) : "";
      const classes = String(element.getAttribute("class") || "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .map((name) => "." + name.slice(0, 32))
        .join("");
      return (tag + id + classes).slice(0, 120);
    };
    const describeBox = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const width = Math.round(rect.width * 10) / 10;
      const height = Math.round(rect.height * 10) / 10;
      return describeElement(element)
        + " " + width + "x" + height
        + " display=" + (style ? style.display : "unknown")
        + " visibility=" + (style ? style.visibility : "unknown");
    };
    if (!elements.length) return "selector_not_found";
    const visibleCount = elements.filter(isVisible).length;
    let visibleDescendant = null;
    for (let index = 0; index < elements.length && !visibleDescendant; index += 1) {
      const descendants = Array.from(elements[index].querySelectorAll("*"));
      const match = descendants.find(isVisible);
      if (match) {
        visibleDescendant = {
          parent_index: index,
          label: describeElement(match),
          box: describeBox(match),
          text: String(match.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
        };
      }
    }
    const parts = ["no_visible_match", "matched " + elements.length, "visible " + visibleCount];
    if (visibleDescendant) {
      parts.push("visible_descendant " + visibleDescendant.label + " parent_index=" + visibleDescendant.parent_index);
      parts.push("visible_descendant_box " + visibleDescendant.box);
      if (visibleDescendant.text) parts.push("visible_descendant_text " + JSON.stringify(visibleDescendant.text));
    }
    parts.push("first " + describeBox(elements[0]));
    return parts.join("; ").slice(0, 500);
  }).catch((error) => "no_visible_match; diagnostic_error " + String(error && error.message ? error.message : error).slice(0, 240));
}
async function waitForAnyVisibleSelector(context, selector, timeout) {
  const deadline = Date.now() + setupNumber(timeout, 15000);
  let lastReason = "selector_not_found";
  while (Date.now() <= deadline) {
    try {
      const locator = context.locator(selector);
      const count = await locator.count();
      if (!count) {
        lastReason = "selector_not_found";
      } else {
        lastReason = await selectorVisibilityDiagnostic(context, selector);
        for (let index = 0; index < count; index += 1) {
          if (await locator.nth(index).isVisible().catch(() => false)) {
            return { ok: true, count, index };
          }
        }
      }
    } catch (error) {
      lastReason = String(error && error.message ? error.message : error).slice(0, 500);
    }
    await page.waitForTimeout(200);
  }
  throw new Error("No visible match for selector " + selector + ": " + lastReason);
}
async function dispatchSetupTapPoint(point, pointerType, durationMs) {
  if (pointerType === "touch" || pointerType === "pen") {
    const client = await page.context().newCDPSession(page);
    try {
      if (pointerType === "touch") {
        const touchPoint = {
          x: point.x,
          y: point.y,
          radiusX: 1,
          radiusY: 1,
          force: 1,
          id: 11,
        };
        await client.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [touchPoint],
        });
        if (durationMs) await page.waitForTimeout(durationMs);
        await client.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
      } else {
        await client.send("Input.dispatchMouseEvent", {
          type: "mousePressed",
          x: point.x,
          y: point.y,
          button: "left",
          buttons: 1,
          clickCount: 1,
          pointerType: "pen",
        });
        if (durationMs) await page.waitForTimeout(durationMs);
        await client.send("Input.dispatchMouseEvent", {
          type: "mouseReleased",
          x: point.x,
          y: point.y,
          button: "left",
          buttons: 0,
          clickCount: 1,
          pointerType: "pen",
        });
      }
    } finally {
      await client.detach().catch(() => {});
    }
  } else {
    await page.mouse.click(point.x, point.y);
  }
}
async function resolveSetupTapTarget(action, base, scope, timeout) {
  const locator = scope.context.locator(action.selector);
  const count = await locator.count();
  if (!count) return { result: { ...base, ...setupScopeEvidence(scope), reason: "selector_not_found", count } };
  const targetIndex = Number.isInteger(action.index) ? action.index : 0;
  if (targetIndex < 0 || targetIndex >= count) return { result: { ...base, ...setupScopeEvidence(scope), reason: "index_out_of_range", count, target_index: targetIndex } };
  const target = locator.nth(targetIndex);
  await target.waitFor({ state: "visible", timeout });
  const box = await target.boundingBox();
  if (!box) return { result: { ...base, ...setupScopeEvidence(scope), reason: "bounding_box_unavailable", count, target_index: targetIndex } };
  const fromX = setupFiniteNumber(action.from_x ?? action.fromX ?? action.x ?? action.click_x ?? action.clickX);
  const fromY = setupFiniteNumber(action.from_y ?? action.fromY ?? action.y ?? action.click_y ?? action.clickY);
  const hasTapPosition = fromX !== undefined || fromY !== undefined;
  if (hasTapPosition && (fromX === undefined || fromY === undefined)) return { result: { ...base, ...setupScopeEvidence(scope), reason: "missing_tap_coordinates", count, target_index: targetIndex } };
  const mode = String(action.coordinate_mode || action.coordinateMode || (hasTapPosition ? "pixels" : "ratio")).trim();
  if (hasTapPosition && mode === "ratio" && [fromX, fromY].some((value) => value < 0 || value > 1)) return { result: { ...base, ...setupScopeEvidence(scope), reason: "invalid_ratio_coordinates", count, target_index: targetIndex } };
  if (hasTapPosition && mode !== "ratio" && [fromX, fromY].some((value) => value < 0)) return { result: { ...base, ...setupScopeEvidence(scope), reason: "invalid_pixel_coordinates", count, target_index: targetIndex } };
  const coordinate = (value, size) => mode === "ratio" ? value * size : value;
  const localX = hasTapPosition && fromX !== undefined ? fromX : 0.5;
  const localY = hasTapPosition && fromY !== undefined ? fromY : 0.5;
  const point = {
    x: box.x + coordinate(localX, box.width),
    y: box.y + coordinate(localY, box.height),
  };
  const durationMs = setupNumber(action.duration_ms ?? action.durationMs, 0);
  const pointerType = String(action.pointer_type || action.pointerType || "touch").trim().toLowerCase();
  return {
    target: {
      count,
      targetIndex,
      point,
      mode,
      fromX,
      fromY,
      hasTapPosition,
      pointerType,
      durationMs,
    },
  };
}
function setupTapTargetEvidence(tapTarget) {
  return {
    count: tapTarget.count,
    target_index: tapTarget.targetIndex,
    coordinate_mode: tapTarget.hasTapPosition ? tapTarget.mode : undefined,
    x: tapTarget.hasTapPosition ? tapTarget.fromX : undefined,
    y: tapTarget.hasTapPosition ? tapTarget.fromY : undefined,
    pointer_type: tapTarget.pointerType,
    input_dispatch: tapTarget.pointerType === "touch" || tapTarget.pointerType === "pen" ? "cdp" : "playwright_mouse",
    duration_ms: tapTarget.durationMs || undefined,
  };
}
function setupHasOwn(action, key) {
  return Boolean(action) && Object.keys(action).includes(key);
}
function setupActionValue(action) {
  if (setupHasOwn(action, "value_json")) return JSON.stringify(action.value_json);
  if (setupHasOwn(action, "value")) return String(action.value ?? "");
  return "";
}
function setupJsonValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(setupJsonValue);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, setupJsonValue(child)]));
  }
  return String(value);
}
function setupValuesEqual(left, right) {
  return JSON.stringify(setupJsonValue(left)) === JSON.stringify(setupJsonValue(right));
}
async function ensureProfilePageHelpers(context) {
  try {
    await context.evaluate(({ targetUrl }) => {
      const asPathname = (path) => {
        const value = String(path || "/");
        return value.startsWith("/") ? value : "/" + value;
      };
      const normalizePathname = (path) => {
        const value = asPathname(path);
        return value === "/" ? "/" : value.replace(/\/+$/, "") || "/";
      };
      const previewMountPrefix = (pathname) => {
        const value = normalizePathname(pathname);
        const apiPreview = value.match(/^(\/s\/[^/]+)(?:\/|$)/);
        if (apiPreview) return apiPreview[1];
        const internalPreview = value.match(/^(\/preview\/[^/]+\/[^/]+)(?:\/|$)/);
        return internalPreview ? internalPreview[1] : "";
      };
      const targetMountPrefix = () => {
        try {
          return previewMountPrefix(new URL(String(targetUrl || ""), window.location.href).pathname);
        } catch {
          return "";
        }
      };
      const currentRoute = () => {
        const pathname = asPathname(window.location.pathname);
        const normalizedPathname = normalizePathname(pathname);
        const currentBasePath = previewMountPrefix(normalizedPathname);
        const basePath = currentBasePath || targetMountPrefix();
        const suffix = String(window.location.search || "") + String(window.location.hash || "");
        const appPath = currentBasePath && (normalizedPathname === currentBasePath || normalizedPathname.startsWith(currentBasePath + "/"))
          ? normalizePathname(normalizedPathname.slice(currentBasePath.length) || "/")
          : normalizedPathname;
        return {
          url: window.location.href,
          origin: window.location.origin,
          pathname,
          search: window.location.search,
          hash: window.location.hash,
          basePath,
          previewMountPrefix: basePath,
          currentBasePath,
          appPath,
          appRoute: appPath + suffix,
          mountedPath: normalizedPathname,
          mountedRoute: normalizedPathname + suffix,
          isPreviewMounted: Boolean(currentBasePath),
        };
      };
      const parseRoute = (route) => {
        const raw = String(route || "/").trim() || "/";
        if (/^https?:\/\//i.test(raw)) {
          try {
            const url = new URL(raw);
            if (url.origin !== window.location.origin) return { external: true, value: raw };
            return { external: false, pathname: normalizePathname(url.pathname), suffix: url.search + url.hash };
          } catch {
            return { external: false, pathname: normalizePathname(raw), suffix: "" };
          }
        }
        try {
          const url = new URL(raw, window.location.origin);
          return { external: false, pathname: normalizePathname(url.pathname), suffix: url.search + url.hash };
        } catch {
          const hashIndex = raw.indexOf("#");
          const beforeHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
          const hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";
          const searchIndex = beforeHash.indexOf("?");
          const pathname = searchIndex >= 0 ? beforeHash.slice(0, searchIndex) : beforeHash;
          const search = searchIndex >= 0 ? beforeHash.slice(searchIndex) : "";
          return { external: false, pathname: normalizePathname(pathname), suffix: search + hash };
        }
      };
      const joinRoute = (route) => {
        const parsed = parseRoute(route);
        if (parsed.external) return parsed.value;
        const current = currentRoute();
        const basePath = current.basePath || "";
        const routePath = parsed.pathname || "/";
        if (!basePath) return routePath + (parsed.suffix || "");
        if (routePath === basePath || routePath.startsWith(basePath + "/")) return routePath + (parsed.suffix || "");
        return (routePath === "/" ? basePath + "/" : basePath + routePath) + (parsed.suffix || "");
      };
      const existing = window.__riddleProofProfile && typeof window.__riddleProofProfile === "object"
        ? window.__riddleProofProfile
        : {};
      const refreshSnapshot = () => {
        const route = currentRoute();
        existing.current = route;
        existing.appPath = route.appPath;
        existing.appRoute = route.appRoute;
        existing.basePath = route.basePath;
        existing.previewMountPrefix = route.previewMountPrefix;
        existing.mountedPath = route.mountedPath;
        existing.mountedRoute = route.mountedRoute;
        return route;
      };
      existing.version = "riddle-proof.profile-helper.v1";
      existing.route = currentRoute;
      existing.getRoute = currentRoute;
      existing.refresh = refreshSnapshot;
      existing.joinRoute = joinRoute;
      refreshSnapshot();
      window.__riddleProofProfile = existing;
    }, { targetUrl });
  } catch {
    // Profile helper injection is best-effort so existing window actions keep their old behavior.
  }
}
async function setupReadWindowValue(context, path) {
  await ensureProfilePageHelpers(context);
  return await context.evaluate(({ path }) => {
    const toJsonValue = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === "string" || typeof value === "boolean") return value;
      if (typeof value === "number") return Number.isFinite(value) ? value : null;
      if (Array.isArray(value)) return value.map(toJsonValue);
      if (typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toJsonValue(child)]));
      }
      return String(value);
    };
    const pathParts = String(path || "").split(".").map((part) => part.trim()).filter(Boolean);
    if (!pathParts.length) return { ok: false, reason: "missing_path" };
    let current = window;
    for (const part of pathParts) {
      if (current === null || current === undefined) return { ok: false, reason: "path_not_found", missing_part: part };
      current = current[part];
      if (current === undefined) return { ok: false, reason: "path_not_found", missing_part: part };
    }
    return { ok: true, value: toJsonValue(current) };
  }, { path });
}
async function setupCallWindowFunction(context, path, args, storeReturnTo, captureReturn) {
  await ensureProfilePageHelpers(context);
  return await context.evaluate(async ({ path, args, storeReturnTo, captureReturn }) => {
    const toJsonValue = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === "string" || typeof value === "boolean") return value;
      if (typeof value === "number") return Number.isFinite(value) ? value : null;
      if (Array.isArray(value)) return value.map(toJsonValue);
      if (typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toJsonValue(child)]));
      }
      return String(value);
    };
    const storeWindowReturn = (storePath, value) => {
      const pathParts = String(storePath || "").split(".").map((part) => part.trim()).filter(Boolean);
      if (pathParts[0] === "window") pathParts.shift();
      if (!pathParts.length) return { ok: false, reason: "missing_store_path" };
      let target = window;
      for (let index = 0; index < pathParts.length - 1; index += 1) {
        const part = pathParts[index];
        if (target[part] === null || typeof target[part] !== "object") target[part] = {};
        target = target[part];
      }
      target[pathParts[pathParts.length - 1]] = value;
      return { ok: true, path: pathParts.join(".") };
    };
    const pathParts = String(path || "").split(".").map((part) => part.trim()).filter(Boolean);
    let parent = window;
    let current = window;
    for (const part of pathParts) {
      parent = current;
      current = current?.[part];
    }
    if (typeof current !== "function") return { ok: false, reason: "missing_function" };
    try {
      const returned = await current.apply(parent, Array.isArray(args) ? args : []);
      const jsonReturned = toJsonValue(returned);
      const returnedForResult = captureReturn === false ? undefined : jsonReturned;
      if (storeReturnTo) {
        const stored = storeWindowReturn(storeReturnTo, jsonReturned);
        if (!stored.ok) return { ok: false, reason: "return_store_failed", store_reason: stored.reason, returned: returnedForResult };
        return { ok: true, returned: returnedForResult, return_stored_to: stored.path };
      }
      return { ok: true, returned: returnedForResult };
    } catch (error) {
      return { ok: false, reason: "function_threw", error: String(error && error.message ? error.message : error).slice(0, 1000) };
    }
  }, { path, args, storeReturnTo, captureReturn });
}
async function setupEvaluateWindowScript(context, script, args, storeReturnTo, captureReturn) {
  await ensureProfilePageHelpers(context);
  return await context.evaluate(async ({ script, args, storeReturnTo, captureReturn }) => {
    const toJsonValue = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === "string" || typeof value === "boolean") return value;
      if (typeof value === "number") return Number.isFinite(value) ? value : null;
      if (Array.isArray(value)) return value.map(toJsonValue);
      if (typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toJsonValue(child)]));
      }
      return String(value);
    };
    const storeWindowReturn = (storePath, value) => {
      const pathParts = String(storePath || "").split(".").map((part) => part.trim()).filter(Boolean);
      if (pathParts[0] === "window") pathParts.shift();
      if (!pathParts.length) return { ok: false, reason: "missing_store_path" };
      let target = window;
      for (let index = 0; index < pathParts.length - 1; index += 1) {
        const part = pathParts[index];
        if (target[part] === null || typeof target[part] !== "object") target[part] = {};
        target = target[part];
      }
      target[pathParts[pathParts.length - 1]] = value;
      return { ok: true, path: pathParts.join(".") };
    };
    const body = String(script || "");
    if (!body.trim()) return { ok: false, reason: "missing_script" };
    try {
      const evaluator = window[["ev", "al"].join("")];
      if (typeof evaluator !== "function") return { ok: false, reason: "missing_evaluator" };
      const argsJson = JSON.stringify(Array.isArray(args) ? args : []);
      const wrapped = "\"use strict\"; (async () => { const args = " + argsJson + ";\n" + body + "\n})()";
      const returned = await evaluator.call(window, wrapped);
      const jsonReturned = toJsonValue(returned);
      const returnedForResult = captureReturn === false ? undefined : jsonReturned;
      if (storeReturnTo) {
        const stored = storeWindowReturn(storeReturnTo, jsonReturned);
        if (!stored.ok) return { ok: false, reason: "return_store_failed", store_reason: stored.reason, returned: returnedForResult };
        return { ok: true, returned: returnedForResult, return_stored_to: stored.path };
      }
      return { ok: true, returned: returnedForResult };
    } catch (error) {
      return { ok: false, reason: "script_threw", error: String(error && error.message ? error.message : error).slice(0, 1000) };
    }
  }, { script, args, storeReturnTo, captureReturn });
}
function setupFrameSelector(action) {
  return String(action?.frame_selector || action?.frameSelector || action?.iframe_selector || action?.iframeSelector || "").trim();
}
function setupFrameIndex(action) {
  const raw = action?.frame_index ?? action?.frameIndex ?? action?.iframe_index ?? action?.iframeIndex ?? 0;
  const number = Number(raw);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}
function setupScopeEvidence(scope) {
  if (!scope || !scope.frame_selector) return {};
  return {
    frame_selector: scope.frame_selector,
    frame_index: scope.frame_index,
    frame_count: scope.frame_count,
  };
}
function setupScopeFailure(base, scope) {
  return {
    ...base,
    ...setupScopeEvidence(scope),
    reason: scope?.reason || "frame_scope_unavailable",
    error: scope?.error || undefined,
  };
}
async function setupActionScope(action, timeout) {
  const frameSelector = setupFrameSelector(action);
  if (!frameSelector) return { ok: true, context: page };
  const frameIndex = setupFrameIndex(action);
  let frameCount = 0;
  let locator = null;
  try {
    await page.waitForSelector(frameSelector, { state: "attached", timeout });
    locator = page.locator(frameSelector);
    frameCount = await locator.count();
  } catch (error) {
    return {
      ok: false,
      reason: "frame_selector_not_found",
      frame_selector: frameSelector,
      frame_index: frameIndex,
      frame_count: frameCount,
      error: String(error && error.message ? error.message : error).slice(0, 1000),
    };
  }
  if (!frameCount) {
    return { ok: false, reason: "frame_selector_not_found", frame_selector: frameSelector, frame_index: frameIndex, frame_count: frameCount };
  }
  if (frameIndex >= frameCount) {
    return { ok: false, reason: "frame_index_out_of_range", frame_selector: frameSelector, frame_index: frameIndex, frame_count: frameCount };
  }
  const handle = await locator.nth(frameIndex).elementHandle({ timeout }).catch((error) => ({ __riddle_error: error }));
  if (!handle || handle.__riddle_error) {
    return {
      ok: false,
      reason: "frame_element_unavailable",
      frame_selector: frameSelector,
      frame_index: frameIndex,
      frame_count: frameCount,
      error: handle?.__riddle_error ? String(handle.__riddle_error && handle.__riddle_error.message ? handle.__riddle_error.message : handle.__riddle_error).slice(0, 1000) : undefined,
    };
  }
  const frame = typeof handle.contentFrame === "function" ? await handle.contentFrame().catch((error) => ({ __riddle_error: error })) : null;
  if (!frame || frame.__riddle_error) {
    return {
      ok: false,
      reason: "content_frame_unavailable",
      frame_selector: frameSelector,
      frame_index: frameIndex,
      frame_count: frameCount,
      error: frame?.__riddle_error ? String(frame.__riddle_error && frame.__riddle_error.message ? frame.__riddle_error.message : frame.__riddle_error).slice(0, 1000) : undefined,
    };
  }
  return { ok: true, context: frame, frame_selector: frameSelector, frame_index: frameIndex, frame_count: frameCount };
}
async function setupLocatorText(locator, index) {
  const target = locator.nth(index);
  return await target.innerText({ timeout: 1000 })
    .catch(async () => await target.textContent({ timeout: 1000 }).catch(() => ""));
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
function networkMockHasRequestBodyContract(source) {
  return Boolean(source) && (
    networkMockStringList(source.request_body_contains).length > 0
    || networkMockStringList(source.request_body_patterns).length > 0
    || networkMockStringList(source.request_body_not_contains).length > 0
    || networkMockStringList(source.request_body_not_patterns).length > 0
  );
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
function selectNetworkMockResponseByRequestBody(mock, responses, requestBody) {
  if (!Array.isArray(responses) || !responses.length) return null;
  const candidates = responses
    .map((response, index) => ({ response, index }))
    .filter((candidate) => networkMockHasRequestBodyContract(candidate.response));
  if (!candidates.length) return null;
  const matched = candidates.find((candidate) => networkMockRequestBodyFailures(requestBody, mock, candidate.response).length === 0);
  return matched ? matched.index : null;
}
async function setupLocatorVisible(locator, index) {
  return await locator.nth(index).isVisible({ timeout: 1000 }).catch(() => false);
}
async function registerNetworkMocks(mocks) {
  for (const mock of mocks || []) {
    let hitCount = 0;
    const scopedHitCounts = {};
    await page.route(mock.url, async (route) => {
      const request = route.request();
      const method = request.method ? request.method() : "";
      if (mock.method && method.toUpperCase() !== String(mock.method).toUpperCase()) {
        if (typeof route.fallback === "function") {
          await route.fallback();
        } else {
          await route.continue();
        }
        return;
      }
      try {
        const responses = Array.isArray(mock.responses) ? mock.responses : [];
        const hitIndex = hitCount;
        hitCount += 1;
        const sequenceScope = mock.sequence_scope === "viewport" ? "viewport" : "global";
        const viewportName = activeViewportName || null;
        const sequenceScopeKey = sequenceScope === "viewport" ? (viewportName || "__unknown_viewport__") : "__global__";
        const sequenceHitIndex = sequenceScope === "viewport" ? (scopedHitCounts[sequenceScopeKey] || 0) : hitIndex;
        if (sequenceScope === "viewport") scopedHitCounts[sequenceScopeKey] = sequenceHitIndex + 1;
        const sequenceResponseIndex = responses.length
          ? (mock.repeat_responses ? sequenceHitIndex % responses.length : Math.min(sequenceHitIndex, responses.length - 1))
          : null;
        let responseIndex = sequenceResponseIndex;
        let responseSelection = responseIndex === null ? "mock" : "sequence";
        const shouldCaptureRequestBodyForAnyResponse = networkMockShouldCaptureRequestBody(mock, ...responses);
        const requestBody = shouldCaptureRequestBodyForAnyResponse && request.postData ? request.postData() || "" : "";
        const requestBodyResponseIndex = shouldCaptureRequestBodyForAnyResponse
          ? selectNetworkMockResponseByRequestBody(mock, responses, requestBody)
          : null;
        if (requestBodyResponseIndex !== null) {
          responseIndex = requestBodyResponseIndex;
          responseSelection = "request_body";
        }
        const response = responseIndex === null ? mock : responses[responseIndex];
        const headers = { ...(response.headers || mock.headers || {}) };
        let body = response.body || "";
        let contentType = response.content_type || headers["content-type"] || headers["Content-Type"] || "text/plain";
        if (response.body_json !== undefined) {
          body = JSON.stringify(response.body_json);
          contentType = response.content_type || headers["content-type"] || headers["Content-Type"] || "application/json";
        }
        const responseBodyContract = responseIndex === null ? null : response;
        const shouldCaptureRequestBody = shouldCaptureRequestBodyForAnyResponse || networkMockShouldCaptureRequestBody(mock, responseBodyContract);
        const requestBodyFailures = shouldCaptureRequestBody ? networkMockRequestBodyFailures(requestBody, mock, responseBodyContract) : [];
        const status = response.status || mock.status || 200;
        const delayMs = numberValue(response.delay_ms) || 0;
        const shouldAbort = response.abort === true;
        const abortErrorCode = typeof response.abort_error_code === "string" && response.abort_error_code.trim()
          ? response.abort_error_code.trim()
          : "failed";
        const event = {
          ok: true,
          label: mock.label,
          response_label: response.label || null,
          hit_index: hitIndex,
          sequence_hit_index: responseIndex === null ? undefined : sequenceHitIndex,
          sequence_scope: responseIndex === null ? undefined : sequenceScope,
          viewport: viewportName,
          response_index: responseIndex,
          sequence_response_index: responseSelection === "request_body" ? sequenceResponseIndex : undefined,
          response_selection: responseIndex === null ? null : responseSelection,
          sequence_reused: responseSelection === "sequence" && responseIndex !== null && !mock.repeat_responses && sequenceHitIndex >= responses.length,
          sequence_cycle: responseSelection === "sequence" && responseIndex !== null && mock.repeat_responses === true && sequenceHitIndex >= responses.length,
          url: request.url(),
          method,
        };
        if (shouldAbort) {
          event.abort = true;
          event.abort_error_code = abortErrorCode;
        } else {
          event.status = status;
        }
        if (delayMs) event.delay_ms = delayMs;
        if (shouldCaptureRequestBody) {
          event.request_body_matches = requestBodyFailures.length === 0;
          event.request_body_failures = requestBodyFailures;
          event.request_body_length = requestBody.length;
          event.request_body_sample = compactNetworkMockRequestBody(requestBody);
        }
        networkMockEvents.push(event);
        if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (shouldAbort) {
          await route.abort(abortErrorCode);
          return;
        }
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
let activeViewportName = null;
async function executeSetupAction(action, ordinal, viewport) {
  const type = setupActionType(action);
  const frameSelector = setupFrameSelector(action);
  const base = { ok: false, action: type || "unknown", ordinal, label: action.label || null, selector: action.selector || null, frame_selector: frameSelector || null, optional: action.optional === true };
  const timeout = setupNumber(action.timeout_ms, 5000);
  try {
    if (type === "wait") {
      const ms = setupNumber(action.ms, 500);
      await page.waitForTimeout(ms);
      return { ...base, ok: true, ms };
    }
    if (type === "screenshot") {
      const rawLabel = String(action.label || action.name || action.screenshot_label || action.screenshotLabel || ("setup-" + ordinal));
      const labelPart = rawLabel
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || ("setup-" + ordinal);
      const viewportName = viewport && viewport.name ? viewport.name : "viewport";
      const label = profileSlug + "-" + viewportName + "-" + labelPart;
      if (typeof saveScreenshot !== "function") return { ...base, reason: "save_screenshot_unavailable", label: rawLabel };
      const screenshotOptions = {};
      if (action.full_page !== undefined) screenshotOptions.fullPage = action.full_page !== false;
      await saveScreenshot(label, screenshotOptions);
      return { ...base, ok: true, label: rawLabel, screenshot_label: label, full_page: action.full_page === undefined ? null : action.full_page !== false };
    }
    if (type === "clear_console") {
      const cleared_console_event_count = consoleEvents.length;
      const cleared_page_error_count = pageErrors.length;
      consoleEvents.length = 0;
      pageErrors.length = 0;
      return { ...base, ok: true, cleared_console_event_count, cleared_page_error_count };
    }
    if (type === "dialog_response") {
      ensureDialogHandler();
      dialogResponseConfig = {
        accept: action.accept !== false,
        prompt_text: action.prompt_text,
        message_text: action.message_text,
        message_pattern: action.message_pattern,
        flags: action.flags || "",
      };
      return {
        ...base,
        ok: true,
        response: dialogResponseConfig.accept ? "accept" : "dismiss",
        message_text: dialogResponseConfig.message_text || undefined,
        message_pattern: dialogResponseConfig.message_pattern || undefined,
        prompt_text_length: dialogResponseConfig.prompt_text === undefined ? undefined : String(dialogResponseConfig.prompt_text).length,
      };
    }
    if (type === "wait_for_selector") {
      const scope = await setupActionScope(action, timeout);
      if (!scope.ok) return setupScopeFailure(base, scope);
      await waitForAnyVisibleSelector(scope.context, action.selector, timeout);
      return { ...base, ...setupScopeEvidence(scope), ok: true, timeout_ms: timeout };
    }
    if (type === "tap") {
      const scope = await setupActionScope(action, timeout);
      if (!scope.ok) return setupScopeFailure(base, scope);
      const prepared = await resolveSetupTapTarget(action, base, scope, timeout);
      if (prepared.result) return prepared.result;
      await dispatchSetupTapPoint(prepared.target.point, prepared.target.pointerType, prepared.target.durationMs);
      const routeEvidence = await waitForSetupActionRoute(action, timeout);
      if (routeEvidence && !routeEvidence.route_matched) {
        return {
          ...base,
          ...setupScopeEvidence(scope),
          ...setupTapTargetEvidence(prepared.target),
          ...routeEvidence,
          reason: "expected_route_not_reached",
        };
      }
      return {
        ...base,
        ...setupScopeEvidence(scope),
        ok: true,
        ...setupTapTargetEvidence(prepared.target),
        ...routeEvidence,
      };
    }
    if (type === "tap_until") {
      const untilPath = String(action.until_path || action.untilPath || action.until_state_path || action.untilStatePath || action.until_window_path || action.untilWindowPath || action.until || "");
      const hasUntilExpected = setupHasOwn(action, "until_expected_value")
        || setupHasOwn(action, "untilExpectedValue")
        || setupHasOwn(action, "until_expected")
        || setupHasOwn(action, "untilExpected")
        || setupHasOwn(action, "until_value")
        || setupHasOwn(action, "untilValue")
        || setupHasOwn(action, "expected_value")
        || setupHasOwn(action, "expectedValue")
        || setupHasOwn(action, "expected");
      const untilExpected = setupHasOwn(action, "until_expected_value")
        ? action.until_expected_value
        : setupHasOwn(action, "untilExpectedValue")
          ? action.untilExpectedValue
          : setupHasOwn(action, "until_expected")
            ? action.until_expected
            : setupHasOwn(action, "untilExpected")
              ? action.untilExpected
              : setupHasOwn(action, "until_value")
                ? action.until_value
                : setupHasOwn(action, "untilValue")
                  ? action.untilValue
                  : setupHasOwn(action, "expected_value")
                    ? action.expected_value
                    : setupHasOwn(action, "expectedValue")
                      ? action.expectedValue
                      : action.expected;
      if (!untilPath) return { ...base, reason: "missing_until_path" };
      if (!hasUntilExpected) return { ...base, until_path: untilPath, reason: "missing_until_expected_value" };
      const maxTaps = Math.min(100, Math.max(1, Math.floor(setupNumber(action.max_taps ?? action.maxTaps ?? action.tap_limit ?? action.tapLimit ?? action.max_calls ?? action.maxCalls ?? action.max_attempts ?? action.maxAttempts ?? action.attempts, 1) || 1)));
      const tapBurstSize = Math.min(maxTaps, Math.min(100, Math.max(1, Math.floor(setupNumber(action.tap_burst_size ?? action.tapBurstSize ?? action.burst_size ?? action.burstSize ?? action.check_every_taps ?? action.checkEveryTaps ?? action.predicate_interval_taps ?? action.predicateIntervalTaps, 1) || 1))));
      const settleMs = Math.min(10000, Math.max(0, Math.floor(setupNumber(action.settle_ms ?? action.settleMs ?? action.predicate_settle_ms ?? action.predicateSettleMs ?? action.post_burst_wait_ms ?? action.postBurstWaitMs ?? action.after_burst_ms ?? action.afterBurstMs ?? action.settle_after_tap_ms ?? action.settleAfterTapMs, 0) || 0)));
      const intervalMs = Math.min(5000, Math.max(0, Math.floor(setupNumber(action.interval_ms ?? action.intervalMs ?? action.poll_ms ?? action.pollMs ?? action.tap_interval_ms ?? action.tapIntervalMs, 100) || 0)));
      const scope = await setupActionScope(action, timeout);
      if (!scope.ok) return setupScopeFailure(base, scope);
      const prepared = await resolveSetupTapTarget(action, base, scope, timeout);
      if (prepared.result) return prepared.result;
      const startedAt = Date.now();
      let tapCount = 0;
      let conditionCheckCount = 1;
      let lastPredicateResult = await setupReadWindowValue(scope.context, untilPath);
      const targetEvidence = setupTapTargetEvidence(prepared.target);
      if (lastPredicateResult.ok && setupValuesEqual(lastPredicateResult.value, untilExpected)) {
        const elapsedMs = Date.now() - startedAt;
        return {
          ...base,
          ...setupScopeEvidence(scope),
          ok: true,
          ...targetEvidence,
          until_path: untilPath,
          until_value: setupJsonValue(lastPredicateResult.value),
          until_expected_value: setupJsonValue(untilExpected),
          tap_count: tapCount,
          max_taps: maxTaps,
          max_calls: maxTaps,
          tap_burst_size: tapBurstSize,
          condition_check_count: conditionCheckCount,
          settle_ms: settleMs,
          elapsed_ms: elapsedMs,
          interval_ms: intervalMs,
          timeout_ms: timeout,
        };
      }
      while (tapCount < maxTaps && Date.now() - startedAt <= timeout) {
        const burstCount = Math.min(tapBurstSize, maxTaps - tapCount);
        for (let burstIndex = 0; burstIndex < burstCount && Date.now() - startedAt <= timeout; burstIndex += 1) {
          await dispatchSetupTapPoint(prepared.target.point, prepared.target.pointerType, prepared.target.durationMs);
          tapCount += 1;
          if (tapCount < maxTaps && burstIndex < burstCount - 1 && intervalMs) await page.waitForTimeout(intervalMs);
        }
        if (settleMs) await page.waitForTimeout(settleMs);
        lastPredicateResult = await setupReadWindowValue(scope.context, untilPath);
        conditionCheckCount += 1;
        if (lastPredicateResult.ok && setupValuesEqual(lastPredicateResult.value, untilExpected)) {
          const elapsedMs = Date.now() - startedAt;
          return {
            ...base,
            ...setupScopeEvidence(scope),
            ok: true,
            ...targetEvidence,
            until_path: untilPath,
            until_value: setupJsonValue(lastPredicateResult.value),
            until_expected_value: setupJsonValue(untilExpected),
            tap_count: tapCount,
            max_taps: maxTaps,
            max_calls: maxTaps,
            tap_burst_size: tapBurstSize,
            condition_check_count: conditionCheckCount,
            settle_ms: settleMs,
            elapsed_ms: elapsedMs,
            interval_ms: intervalMs,
            timeout_ms: timeout,
          };
        }
        if (tapCount < maxTaps && intervalMs) await page.waitForTimeout(intervalMs);
      }
      const elapsedMs = Date.now() - startedAt;
      return {
        ...base,
        ...setupScopeEvidence(scope),
        ...targetEvidence,
        until_path: untilPath,
        until_value: setupJsonValue(lastPredicateResult?.value),
        until_expected_value: setupJsonValue(untilExpected),
        tap_count: tapCount,
        max_taps: maxTaps,
        max_calls: maxTaps,
        tap_burst_size: tapBurstSize,
        condition_check_count: conditionCheckCount,
        settle_ms: settleMs,
        elapsed_ms: elapsedMs,
        interval_ms: intervalMs,
        timeout_ms: timeout,
        reason: elapsedMs > timeout ? "timeout" : "until_condition_not_met",
        missing_part: lastPredicateResult?.missing_part || undefined,
      };
    }
    if (type === "drag") {
      const scope = await setupActionScope(action, timeout);
      if (!scope.ok) return setupScopeFailure(base, scope);
      const locator = scope.context.locator(action.selector);
      const count = await locator.count();
      if (!count) return { ...base, ...setupScopeEvidence(scope), reason: "selector_not_found", count };
      const targetIndex = Number.isInteger(action.index) ? action.index : 0;
      if (targetIndex < 0 || targetIndex >= count) return { ...base, ...setupScopeEvidence(scope), reason: "index_out_of_range", count, target_index: targetIndex };
      const target = locator.nth(targetIndex);
      await target.waitFor({ state: "visible", timeout });
      const box = await target.boundingBox();
      if (!box) return { ...base, ...setupScopeEvidence(scope), reason: "bounding_box_unavailable", count, target_index: targetIndex };
      const mode = String(action.coordinate_mode || action.coordinateMode || "pixels").trim();
      const coordinate = (value, size) => mode === "ratio" ? value * size : value;
      const fromX = setupFiniteNumber(action.from_x ?? action.fromX ?? action.start_x ?? action.startX ?? action.x1);
      const fromY = setupFiniteNumber(action.from_y ?? action.fromY ?? action.start_y ?? action.startY ?? action.y1);
      const toX = setupFiniteNumber(action.to_x ?? action.toX ?? action.end_x ?? action.endX ?? action.x2);
      const toY = setupFiniteNumber(action.to_y ?? action.toY ?? action.end_y ?? action.endY ?? action.y2);
      if (fromX === undefined || fromY === undefined || toX === undefined || toY === undefined) return { ...base, ...setupScopeEvidence(scope), reason: "missing_drag_coordinates", count, target_index: targetIndex };
      if (mode === "ratio" && [fromX, fromY, toX, toY].some((value) => value < 0 || value > 1)) return { ...base, ...setupScopeEvidence(scope), reason: "invalid_ratio_coordinates", count, target_index: targetIndex };
      if (mode !== "ratio" && [fromX, fromY, toX, toY].some((value) => value < 0)) return { ...base, ...setupScopeEvidence(scope), reason: "invalid_pixel_coordinates", count, target_index: targetIndex };
      const start = {
        x: box.x + coordinate(fromX, box.width),
        y: box.y + coordinate(fromY, box.height),
      };
      const end = {
        x: box.x + coordinate(toX, box.width),
        y: box.y + coordinate(toY, box.height),
      };
      const requestedSteps = setupNumber(action.steps, 8);
      const steps = Math.min(100, Math.max(1, Math.floor(requestedSteps || 8)));
      const durationMs = setupNumber(action.duration_ms ?? action.durationMs, 0);
      const pointerType = String(action.pointer_type || action.pointerType || "mouse").trim().toLowerCase();
      if (pointerType === "touch" || pointerType === "pen") {
        const client = await page.context().newCDPSession(page);
        try {
          if (pointerType === "touch") {
            const touchPoint = (x, y) => ({
              x,
              y,
              radiusX: 1,
              radiusY: 1,
              force: 1,
              id: 11,
            });
            await client.send("Input.dispatchTouchEvent", {
              type: "touchStart",
              touchPoints: [touchPoint(start.x, start.y)],
            });
            for (let step = 1; step <= steps; step += 1) {
              const progress = step / steps;
              await client.send("Input.dispatchTouchEvent", {
                type: "touchMove",
                touchPoints: [
                  touchPoint(
                    start.x + (end.x - start.x) * progress,
                    start.y + (end.y - start.y) * progress,
                  ),
                ],
              });
              if (durationMs && steps > 1) await page.waitForTimeout(durationMs / steps);
            }
            await client.send("Input.dispatchTouchEvent", {
              type: "touchEnd",
              touchPoints: [],
            });
          } else {
            await client.send("Input.dispatchMouseEvent", {
              type: "mouseMoved",
              x: start.x,
              y: start.y,
              pointerType: "pen",
            });
            await client.send("Input.dispatchMouseEvent", {
              type: "mousePressed",
              x: start.x,
              y: start.y,
              button: "left",
              buttons: 1,
              clickCount: 1,
              pointerType: "pen",
            });
            for (let step = 1; step <= steps; step += 1) {
              const progress = step / steps;
              await client.send("Input.dispatchMouseEvent", {
                type: "mouseMoved",
                x: start.x + (end.x - start.x) * progress,
                y: start.y + (end.y - start.y) * progress,
                button: "left",
                buttons: 1,
                pointerType: "pen",
              });
              if (durationMs && steps > 1) await page.waitForTimeout(durationMs / steps);
            }
            await client.send("Input.dispatchMouseEvent", {
              type: "mouseReleased",
              x: end.x,
              y: end.y,
              button: "left",
              buttons: 0,
              clickCount: 1,
              pointerType: "pen",
            });
          }
        } finally {
          await client.detach().catch(() => {});
        }
      } else {
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        try {
          if (durationMs && steps > 1) {
            for (let step = 1; step <= steps; step += 1) {
              const progress = step / steps;
              await page.mouse.move(
                start.x + (end.x - start.x) * progress,
                start.y + (end.y - start.y) * progress,
              );
              await page.waitForTimeout(durationMs / steps);
            }
          } else {
            await page.mouse.move(end.x, end.y, { steps });
          }
        } finally {
          await page.mouse.up().catch(() => {});
        }
      }
      return {
        ...base,
        ...setupScopeEvidence(scope),
        ok: true,
        count,
        target_index: targetIndex,
        coordinate_mode: mode,
        from_x: fromX,
        from_y: fromY,
        to_x: toX,
        to_y: toY,
        pointer_type: pointerType,
        input_dispatch: pointerType === "touch" || pointerType === "pen" ? "cdp" : "playwright_mouse",
        steps,
        duration_ms: durationMs || undefined,
      };
    }
    if (type === "key_down" || type === "key_up") {
      const key = String(action.key || "").trim();
      if (!key) return { ...base, reason: "missing_key" };
      const scope = await setupActionScope(action, timeout);
      if (!scope.ok) return setupScopeFailure(base, scope);
      let count;
      let targetIndex;
      if (action.selector) {
        const locator = scope.context.locator(action.selector);
        count = await locator.count();
        if (!count) return { ...base, reason: "selector_not_found", count, key };
        targetIndex = Number.isInteger(action.index) ? action.index : 0;
        if (targetIndex < 0 || targetIndex >= count) return { ...base, reason: "index_out_of_range", count, target_index: targetIndex, key };
        await locator.nth(targetIndex).focus({ timeout }).catch(() => {});
      } else if (scope.frame_selector) {
        await scope.context.locator("body").focus({ timeout }).catch(() => {});
      }
      if (type === "key_down") {
        await page.keyboard.down(key);
      } else {
        await page.keyboard.up(key);
      }
      return {
        ...base,
        ...setupScopeEvidence(scope),
        ok: true,
        count,
        target_index: targetIndex,
        key,
      };
    }
    if (type === "press") {
      const key = String(action.key || "").trim();
      if (!key) return { ...base, reason: "missing_key" };
      const holdMs = Math.min(30000, Math.max(0, Math.floor(setupNumber(action.hold_ms ?? action.holdMs ?? action.key_down_ms ?? action.keyDownMs ?? action.down_ms ?? action.downMs ?? action.duration_ms ?? action.durationMs, 0) || 0)));
      const scope = await setupActionScope(action, timeout);
      if (!scope.ok) return setupScopeFailure(base, scope);
      if (!action.selector) {
        if (holdMs > 0) {
          if (scope.frame_selector) {
            await scope.context.locator("body").focus({ timeout }).catch(() => {});
          }
          await page.keyboard.down(key);
          try {
            await page.waitForTimeout(holdMs);
          } finally {
            await page.keyboard.up(key).catch(() => {});
          }
          return { ...base, ...setupScopeEvidence(scope), ok: true, key, hold_ms: holdMs };
        }
        if (scope.frame_selector) {
          await scope.context.locator("body").press(key, { timeout });
        } else {
          await page.keyboard.press(key);
        }
        return { ...base, ...setupScopeEvidence(scope), ok: true, key };
      }
      const locator = scope.context.locator(action.selector);
      const count = await locator.count();
      if (!count) return { ...base, reason: "selector_not_found", count, key };
      const targetIndex = Number.isInteger(action.index) ? action.index : 0;
      if (targetIndex < 0 || targetIndex >= count) return { ...base, reason: "index_out_of_range", count, target_index: targetIndex, key };
      if (holdMs > 0) {
        await locator.nth(targetIndex).focus({ timeout });
        await page.keyboard.down(key);
        try {
          await page.waitForTimeout(holdMs);
        } finally {
          await page.keyboard.up(key).catch(() => {});
        }
        return { ...base, ...setupScopeEvidence(scope), ok: true, count, target_index: targetIndex, key, hold_ms: holdMs };
      }
      await locator.nth(targetIndex).press(key, { timeout });
      return { ...base, ...setupScopeEvidence(scope), ok: true, count, target_index: targetIndex, key };
    }
    if (type === "local_storage" || type === "session_storage") {
      const value = setupActionValue(action);
      const scope = await setupActionScope(action, timeout);
      if (!scope.ok) return setupScopeFailure(base, scope);
      await scope.context.evaluate(({ type, key, value }) => {
        const storage = type === "session_storage" ? window.sessionStorage : window.localStorage;
        storage.setItem(key, value);
      }, { type, key: action.key, value });
      if (action.reload === true) {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
      }
      return { ...base, ...setupScopeEvidence(scope), ok: true, key: action.key, value_length: value.length, reload: action.reload === true };
    }
    if (type === "clear_storage") {
      const storage = action.storage || "both";
      const scope = await setupActionScope(action, timeout);
      if (!scope.ok) return setupScopeFailure(base, scope);
      await scope.context.evaluate(({ storage }) => {
        if (storage === "local" || storage === "both") window.localStorage.clear();
        if (storage === "session" || storage === "both") window.sessionStorage.clear();
      }, { storage });
      if (action.reload === true) {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
      }
      return { ...base, ...setupScopeEvidence(scope), ok: true, storage, reload: action.reload === true };
    }
    if (type === "deterministic_runtime") {
      const scope = await setupActionScope(action, timeout);
      if (!scope.ok) return setupScopeFailure(base, scope);
      const randomQueue = Array.isArray(action.random_queue)
        ? action.random_queue
        : Array.isArray(action.randomQueue)
          ? action.randomQueue
          : null;
      const now = setupFiniteNumber(action.now ?? action.date_now ?? action.dateNow ?? action.mock_now ?? action.mockNow ?? action.clock ?? action.timestamp ?? action.time_ms ?? action.timeMs);
      const advanceMs = setupFiniteNumber(action.advance_ms ?? action.advanceMs ?? action.tick_ms ?? action.tickMs ?? action.add_ms ?? action.addMs);
      const append = action.append === true || action.append_random === true || action.appendRandom === true;
      const restore = action.restore === true || action.reset === true || action.restore_originals === true || action.restoreOriginals === true;
      const runtimeResult = await scope.context.evaluate((payload) => {
        const root = window;
        const stateKey = "__RIDDLE_PROOF_DETERMINISTIC_RUNTIME__";
        const state = root[stateKey] && typeof root[stateKey] === "object" && !Array.isArray(root[stateKey])
          ? root[stateKey]
          : {};
        root[stateKey] = state;
        if (typeof state.originalRandom !== "function") state.originalRandom = Math.random;
        if (typeof state.originalDateNow !== "function") state.originalDateNow = Date.now;
        const previousNow = typeof state.now === "number" && Number.isFinite(state.now)
          ? state.now
          : Date.now === state.originalDateNow
            ? null
            : Date.now();
        if (payload.restore) {
          Math.random = state.originalRandom;
          Date.now = state.originalDateNow;
          delete root[stateKey];
          return {
            ok: true,
            restored: true,
            random_enabled: false,
            random_queue_added: 0,
            random_queue_length: 0,
            random_queue_mode: null,
            random_underflow_count: typeof state.randomUnderflowCount === "number" ? state.randomUnderflowCount : 0,
            clock_enabled: false,
            previous_now: previousNow,
            now: null,
            advance_ms: null,
          };
        }
        let randomQueueAdded = null;
        let randomQueueMode = null;
        if (Array.isArray(payload.random_queue)) {
          const queue = payload.random_queue.filter((value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 1);
          const existing = Array.isArray(state.randomQueue) ? state.randomQueue : [];
          state.randomQueue = payload.append ? existing.concat(queue) : queue.slice();
          randomQueueAdded = queue.length;
          randomQueueMode = payload.append ? "append" : "replace";
          Math.random = function riddleProofMockRandom() {
            const activeQueue = Array.isArray(state.randomQueue) ? state.randomQueue : [];
            if (activeQueue.length) return activeQueue.shift();
            state.randomUnderflowCount = (typeof state.randomUnderflowCount === "number" ? state.randomUnderflowCount : 0) + 1;
            return 0;
          };
        }
        if (typeof payload.now === "number" && Number.isFinite(payload.now)) {
          state.now = payload.now;
          Date.now = function riddleProofMockDateNow() {
            return state.now;
          };
        }
        if (typeof payload.advance_ms === "number" && Number.isFinite(payload.advance_ms)) {
          const baseNow = typeof state.now === "number" && Number.isFinite(state.now)
            ? state.now
            : Date.now();
          state.now = baseNow + payload.advance_ms;
          Date.now = function riddleProofMockDateNow() {
            return state.now;
          };
        }
        return {
          ok: true,
          restored: false,
          random_enabled: Math.random !== state.originalRandom,
          random_queue_added: randomQueueAdded,
          random_queue_length: Array.isArray(state.randomQueue) ? state.randomQueue.length : 0,
          random_queue_mode: randomQueueMode,
          random_underflow_count: typeof state.randomUnderflowCount === "number" ? state.randomUnderflowCount : 0,
          clock_enabled: Date.now !== state.originalDateNow,
          previous_now: previousNow,
          now: typeof state.now === "number" && Number.isFinite(state.now) ? state.now : null,
          advance_ms: typeof payload.advance_ms === "number" && Number.isFinite(payload.advance_ms) ? payload.advance_ms : null,
        };
      }, { random_queue: randomQueue, now, advance_ms: advanceMs, append, restore });
      return {
        ...base,
        ...setupScopeEvidence(scope),
        ok: runtimeResult && runtimeResult.ok === true,
        random_enabled: runtimeResult?.random_enabled,
        random_queue_added: runtimeResult?.random_queue_added,
        random_queue_length: runtimeResult?.random_queue_length,
        random_queue_mode: runtimeResult?.random_queue_mode,
        random_underflow_count: runtimeResult?.random_underflow_count,
        clock_enabled: runtimeResult?.clock_enabled,
        previous_now: runtimeResult?.previous_now,
        now: runtimeResult?.now,
        advance_ms: runtimeResult?.advance_ms,
        restored: runtimeResult?.restored,
        reason: runtimeResult && runtimeResult.ok === true ? undefined : runtimeResult?.reason || "deterministic_runtime_not_applied",
      };
    }
    if (type === "window_eval") {
      const script = String(action.script || action.code || action.source || action.body || "");
      const args = Array.isArray(action.args) ? action.args : [];
      const storeReturnTo = String(action.store_return_to || action.storeReturnTo || action.save_return_to || action.saveReturnTo || action.assign_return_to || action.assignReturnTo || action.return_state_path || action.returnStatePath || "").trim();
      const returnSummaryFields = Array.isArray(action.return_summary_fields) ? action.return_summary_fields : [];
      if (!script.trim()) return { ...base, reason: "missing_script" };
      const scope = await setupActionScope(action, timeout);
      if (!scope.ok) return setupScopeFailure(base, scope);
      const hasExpectation = setupHasOwn(action, "expect_return")
        || setupHasOwn(action, "expectReturn")
        || setupHasOwn(action, "expected_return")
        || setupHasOwn(action, "expectedReturn");
      const expected = setupHasOwn(action, "expect_return")
        ? action.expect_return
        : setupHasOwn(action, "expectReturn")
          ? action.expectReturn
        : setupHasOwn(action, "expected_return")
          ? action.expected_return
          : action.expectedReturn;
      const captureReturn = action.capture_return === false || action.captureReturn === false || action.include_return === false || action.includeReturn === false || action.omit_return === true || action.omitReturn === true
        ? hasExpectation
        : true;
      const result = await setupEvaluateWindowScript(scope.context, script, args, storeReturnTo, captureReturn);
      const expectationMet = !hasExpectation || setupValuesEqual(result.returned, expected);
      return {
        ...base,
        ...setupScopeEvidence(scope),
        ok: Boolean(result.ok && expectationMet),
        script_length: script.length,
        arg_count: args.length,
        returned: captureReturn ? setupJsonValue(result.returned) : undefined,
        return_captured: captureReturn,
        expected_return: hasExpectation ? setupJsonValue(expected) : undefined,
        return_stored_to: result.return_stored_to || storeReturnTo || undefined,
        return_summary_fields: returnSummaryFields.length ? setupJsonValue(returnSummaryFields) : undefined,
        reason: result.ok ? (expectationMet ? undefined : "unexpected_return_value") : result.reason,
        store_reason: result.store_reason || undefined,
        error: result.error || undefined,
      };
    }
    if (type === "window_call") {
      const path = String(action.path || action.function_path || action.functionPath || "");
      const args = Array.isArray(action.args) ? action.args : [];
      const storeReturnTo = String(action.store_return_to || action.storeReturnTo || action.save_return_to || action.saveReturnTo || action.assign_return_to || action.assignReturnTo || action.return_state_path || action.returnStatePath || "").trim();
      const returnSummaryFields = Array.isArray(action.return_summary_fields) ? action.return_summary_fields : [];
      if (!path) return { ...base, path, reason: "missing_path" };
      const scope = await setupActionScope(action, timeout);
      if (!scope.ok) return setupScopeFailure(base, scope);
      const hasExpectation = setupHasOwn(action, "expect_return")
        || setupHasOwn(action, "expectReturn")
        || setupHasOwn(action, "expected_return")
        || setupHasOwn(action, "expectedReturn");
      const expected = setupHasOwn(action, "expect_return")
        ? action.expect_return
        : setupHasOwn(action, "expectReturn")
          ? action.expectReturn
        : setupHasOwn(action, "expected_return")
          ? action.expected_return
          : action.expectedReturn;
      const captureReturn = action.capture_return === false || action.captureReturn === false || action.include_return === false || action.includeReturn === false || action.omit_return === true || action.omitReturn === true
        ? hasExpectation
        : true;
      const result = await setupCallWindowFunction(scope.context, path, args, storeReturnTo, captureReturn);
      const expectationMet = !hasExpectation || setupValuesEqual(result.returned, expected);
      return {
        ...base,
        ...setupScopeEvidence(scope),
        ok: Boolean(result.ok && expectationMet),
        path,
        arg_count: args.length,
        returned: captureReturn ? setupJsonValue(result.returned) : undefined,
        return_captured: captureReturn,
        expected_return: hasExpectation ? setupJsonValue(expected) : undefined,
        return_stored_to: result.return_stored_to || storeReturnTo || undefined,
        return_summary_fields: returnSummaryFields.length ? setupJsonValue(returnSummaryFields) : undefined,
        reason: result.ok ? (expectationMet ? undefined : "unexpected_return_value") : result.reason,
        store_reason: result.store_reason || undefined,
        error: result.error || undefined,
      };
    }
    if (type === "window_call_until") {
      const path = String(action.path || action.function_path || action.functionPath || "");
      const untilPath = String(action.until_path || action.untilPath || action.until_state_path || action.untilStatePath || action.until_window_path || action.untilWindowPath || action.until || "");
      const args = Array.isArray(action.args) ? action.args : [];
      const storeReturnTo = String(action.store_return_to || action.storeReturnTo || action.save_return_to || action.saveReturnTo || action.assign_return_to || action.assignReturnTo || action.return_state_path || action.returnStatePath || "").trim();
      if (!path) return { ...base, path, reason: "missing_path" };
      if (!untilPath) return { ...base, path, reason: "missing_until_path" };
      const hasUntilExpected = setupHasOwn(action, "until_expected_value")
        || setupHasOwn(action, "untilExpectedValue")
        || setupHasOwn(action, "until_expected")
        || setupHasOwn(action, "untilExpected")
        || setupHasOwn(action, "until_value")
        || setupHasOwn(action, "untilValue")
        || setupHasOwn(action, "expected_value")
        || setupHasOwn(action, "expectedValue")
        || setupHasOwn(action, "expected");
      const untilExpected = setupHasOwn(action, "until_expected_value")
        ? action.until_expected_value
        : setupHasOwn(action, "untilExpectedValue")
          ? action.untilExpectedValue
          : setupHasOwn(action, "until_expected")
            ? action.until_expected
            : setupHasOwn(action, "untilExpected")
              ? action.untilExpected
              : setupHasOwn(action, "until_value")
                ? action.until_value
                : setupHasOwn(action, "untilValue")
                  ? action.untilValue
                  : setupHasOwn(action, "expected_value")
                    ? action.expected_value
                    : setupHasOwn(action, "expectedValue")
                      ? action.expectedValue
                      : action.expected;
      if (!hasUntilExpected) return { ...base, path, until_path: untilPath, reason: "missing_until_expected_value" };
      const maxCalls = Math.min(100, Math.max(1, Math.floor(setupNumber(action.max_calls ?? action.maxCalls ?? action.max_attempts ?? action.maxAttempts ?? action.attempts, 1) || 1)));
      const intervalMs = Math.min(5000, Math.max(0, Math.floor(setupNumber(action.interval_ms ?? action.intervalMs ?? action.poll_ms ?? action.pollMs ?? action.call_interval_ms ?? action.callIntervalMs, 100) || 0)));
      const hasReturnExpectation = setupHasOwn(action, "expect_return")
        || setupHasOwn(action, "expectReturn")
        || setupHasOwn(action, "expected_return")
        || setupHasOwn(action, "expectedReturn");
      const expectedReturn = setupHasOwn(action, "expect_return")
        ? action.expect_return
        : setupHasOwn(action, "expectReturn")
          ? action.expectReturn
          : setupHasOwn(action, "expected_return")
            ? action.expected_return
            : action.expectedReturn;
      const captureReturn = action.capture_return === false || action.captureReturn === false || action.include_return === false || action.includeReturn === false || action.omit_return === true || action.omitReturn === true
        ? hasReturnExpectation
        : true;
      const scope = await setupActionScope(action, timeout);
      if (!scope.ok) return setupScopeFailure(base, scope);
      const startedAt = Date.now();
      let callCount = 0;
      let lastCallResult = null;
      let lastPredicateResult = await setupReadWindowValue(scope.context, untilPath);
      if (lastPredicateResult.ok && setupValuesEqual(lastPredicateResult.value, untilExpected)) {
        return {
          ...base,
          ...setupScopeEvidence(scope),
          ok: true,
          path,
          arg_count: args.length,
          until_path: untilPath,
          until_value: setupJsonValue(lastPredicateResult.value),
          until_expected_value: setupJsonValue(untilExpected),
          call_count: callCount,
          max_calls: maxCalls,
          interval_ms: intervalMs,
          timeout_ms: timeout,
        };
      }
      while (callCount < maxCalls && Date.now() - startedAt <= timeout) {
        lastCallResult = await setupCallWindowFunction(scope.context, path, args, storeReturnTo, captureReturn);
        callCount += 1;
        if (!lastCallResult.ok) break;
        if (hasReturnExpectation && !setupValuesEqual(lastCallResult.returned, expectedReturn)) break;
        lastPredicateResult = await setupReadWindowValue(scope.context, untilPath);
        if (lastPredicateResult.ok && setupValuesEqual(lastPredicateResult.value, untilExpected)) {
          return {
            ...base,
            ...setupScopeEvidence(scope),
            ok: true,
            path,
            arg_count: args.length,
            returned: captureReturn ? setupJsonValue(lastCallResult.returned) : undefined,
            return_captured: captureReturn,
            expected_return: hasReturnExpectation ? setupJsonValue(expectedReturn) : undefined,
            return_stored_to: lastCallResult.return_stored_to || storeReturnTo || undefined,
            until_path: untilPath,
            until_value: setupJsonValue(lastPredicateResult.value),
            until_expected_value: setupJsonValue(untilExpected),
            call_count: callCount,
            max_calls: maxCalls,
            interval_ms: intervalMs,
            timeout_ms: timeout,
          };
        }
        if (callCount < maxCalls && intervalMs) await page.waitForTimeout(intervalMs);
      }
      const returnExpectationMet = !hasReturnExpectation || setupValuesEqual(lastCallResult?.returned, expectedReturn);
      return {
        ...base,
        ...setupScopeEvidence(scope),
        path,
        arg_count: args.length,
        returned: captureReturn ? setupJsonValue(lastCallResult?.returned) : undefined,
        return_captured: captureReturn,
        expected_return: hasReturnExpectation ? setupJsonValue(expectedReturn) : undefined,
        return_stored_to: lastCallResult?.return_stored_to || storeReturnTo || undefined,
        until_path: untilPath,
        until_value: setupJsonValue(lastPredicateResult?.value),
        until_expected_value: setupJsonValue(untilExpected),
        call_count: callCount,
        max_calls: maxCalls,
        interval_ms: intervalMs,
        timeout_ms: timeout,
        reason: lastCallResult && !lastCallResult.ok
          ? lastCallResult.reason
          : hasReturnExpectation && !returnExpectationMet
            ? "unexpected_return_value"
            : Date.now() - startedAt > timeout
              ? "timeout"
              : "until_condition_not_met",
        error: lastCallResult?.error || undefined,
        store_reason: lastCallResult?.store_reason || undefined,
        missing_part: lastPredicateResult?.missing_part || undefined,
      };
    }
    if (type === "assert_window_value") {
      const path = String(action.path || action.window_path || action.windowPath || "");
      const hasExpected = setupHasOwn(action, "expected_value")
        || setupHasOwn(action, "expectedValue")
        || setupHasOwn(action, "expected")
        || setupHasOwn(action, "expect_value")
        || setupHasOwn(action, "expectValue")
        || setupHasOwn(action, "expect");
      const expected = setupHasOwn(action, "expected_value")
        ? action.expected_value
        : setupHasOwn(action, "expectedValue")
          ? action.expectedValue
          : setupHasOwn(action, "expected")
            ? action.expected
            : setupHasOwn(action, "expect_value")
              ? action.expect_value
              : setupHasOwn(action, "expectValue")
                ? action.expectValue
                : action.expect;
      if (!path) return { ...base, path, reason: "missing_path" };
      if (!hasExpected) return { ...base, path, reason: "missing_expected_value" };
      const scope = await setupActionScope(action, timeout);
      if (!scope.ok) return setupScopeFailure(base, scope);
      const startedAt = Date.now();
      let result = null;
      while (Date.now() - startedAt <= timeout) {
        result = await setupReadWindowValue(scope.context, path);
        if (result.ok && setupValuesEqual(result.value, expected)) {
          return {
            ...base,
            ...setupScopeEvidence(scope),
            ok: true,
            path,
            value: setupJsonValue(result.value),
            expected_value: setupJsonValue(expected),
            timeout_ms: timeout,
          };
        }
        await page.waitForTimeout(100);
      }
      return {
        ...base,
        ...setupScopeEvidence(scope),
        path,
        reason: result?.ok ? "unexpected_value" : result?.reason || "path_not_found",
        missing_part: result?.missing_part || undefined,
        value: setupJsonValue(result?.value),
        expected_value: setupJsonValue(expected),
        timeout_ms: timeout,
      };
    }
    if (type === "assert_window_number") {
      const path = String(action.path || action.window_path || action.windowPath || "");
      const expected = setupFiniteNumber(action.expected_value ?? action.expectedValue ?? action.expected ?? action.expect_value ?? action.expectValue ?? action.expect);
      const minValue = setupFiniteNumber(action.min_value ?? action.minValue ?? action.minimum ?? action.min ?? action.at_least ?? action.atLeast ?? action.gte);
      const maxValue = setupFiniteNumber(action.max_value ?? action.maxValue ?? action.maximum ?? action.max ?? action.at_most ?? action.atMost ?? action.lte);
      const hasExpected = expected !== undefined;
      if (!path) return { ...base, path, reason: "missing_path" };
      if (!hasExpected && minValue === undefined && maxValue === undefined) return { ...base, path, reason: "missing_number_expectation" };
      const scope = await setupActionScope(action, timeout);
      if (!scope.ok) return setupScopeFailure(base, scope);
      const startedAt = Date.now();
      let result = null;
      let lastReason = "path_not_found";
      while (Date.now() - startedAt <= timeout) {
        result = await setupReadWindowValue(scope.context, path);
        if (result.ok) {
          const actual = setupFiniteNumber(result.value);
          if (actual === undefined) {
            lastReason = "non_numeric_value";
          } else if (hasExpected && actual !== expected) {
            lastReason = "unexpected_number";
          } else if (minValue !== undefined && actual < minValue) {
            lastReason = "number_below_min";
          } else if (maxValue !== undefined && actual > maxValue) {
            lastReason = "number_above_max";
          } else {
            return {
              ...base,
              ...setupScopeEvidence(scope),
              ok: true,
              path,
              value: actual,
              expected_value: hasExpected ? expected : undefined,
              min_value: minValue,
              max_value: maxValue,
              timeout_ms: timeout,
            };
          }
        } else {
          lastReason = result.reason || "path_not_found";
        }
        await page.waitForTimeout(100);
      }
      return {
        ...base,
        ...setupScopeEvidence(scope),
        path,
        reason: lastReason,
        missing_part: result?.missing_part || undefined,
        value: setupJsonValue(result?.value),
        expected_value: hasExpected ? expected : undefined,
        min_value: minValue,
        max_value: maxValue,
        timeout_ms: timeout,
      };
    }
    if (type === "click") {
      const scope = await setupActionScope(action, timeout);
      if (!scope.ok) return setupScopeFailure(base, scope);
      const locator = scope.context.locator(action.selector);
      const count = await locator.count();
      if (!count) return { ...base, reason: "selector_not_found", count };
      let targetIndex = Number.isInteger(action.index) ? action.index : 0;
      let matchedText = null;
      let caseInsensitiveText = null;
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
          } else if (!caseInsensitiveText) {
            caseInsensitiveText = setupCaseInsensitiveTextSample(text, action) || null;
          }
        }
        if (targetIndex < 0 && hiddenMatchIndex >= 0) return { ...base, reason: "matching_element_not_visible", count, target_index: hiddenMatchIndex, text: hiddenMatchedText };
        if (targetIndex < 0) return { ...base, reason: "text_not_found", count, case_insensitive_text: caseInsensitiveText || undefined };
      }
      if (targetIndex < 0 || targetIndex >= count) return { ...base, reason: "index_out_of_range", count, target_index: targetIndex };
      const clickOptions = action.force === true
        ? { timeout, noWaitAfter: true, force: true }
        : { timeout, noWaitAfter: true };
      const clickCount = setupNumber(action.click_count, 1);
      if (Number.isInteger(clickCount) && clickCount > 1) clickOptions.clickCount = clickCount;
      const target = locator.nth(targetIndex);
      const fromX = setupFiniteNumber(action.from_x ?? action.fromX ?? action.x ?? action.click_x ?? action.clickX);
      const fromY = setupFiniteNumber(action.from_y ?? action.fromY ?? action.y ?? action.click_y ?? action.clickY);
      const hasClickPosition = fromX !== undefined || fromY !== undefined;
      let position;
      let mode;
      if (hasClickPosition) {
        if (fromX === undefined || fromY === undefined) return { ...base, ...setupScopeEvidence(scope), reason: "missing_click_coordinates", count, target_index: targetIndex };
        const box = await target.boundingBox();
        if (!box) return { ...base, ...setupScopeEvidence(scope), reason: "bounding_box_unavailable", count, target_index: targetIndex };
        mode = String(action.coordinate_mode || action.coordinateMode || "pixels").trim();
        const coordinate = (value, size) => mode === "ratio" ? value * size : value;
        position = { x: coordinate(fromX, box.width), y: coordinate(fromY, box.height) };
        clickOptions.position = position;
      }
      try {
        await target.click(clickOptions);
      } catch (error) {
        if (action.fallback_to_tap !== true) throw error;
        const box = await target.boundingBox();
        if (!box) {
          return {
            ...base,
            ...setupScopeEvidence(scope),
            reason: "fallback_bounding_box_unavailable",
            count,
            target_index: targetIndex,
            click_error: String(error && error.message ? error.message : error).slice(0, 1000),
          };
        }
        const fallbackPoint = position
          ? { x: box.x + position.x, y: box.y + position.y }
          : { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        if (clickCount > 1) await page.mouse.click(fallbackPoint.x, fallbackPoint.y, { clickCount });
        else await page.mouse.click(fallbackPoint.x, fallbackPoint.y);
        const routeEvidence = await waitForSetupActionRoute(action, timeout);
        if (routeEvidence && !routeEvidence.route_matched) {
          return {
            ...base,
            ...setupScopeEvidence(scope),
            count,
            target_index: targetIndex,
            text: matchedText,
            force: action.force === true || undefined,
            fallback_to_tap: true,
            input_dispatch: "playwright_mouse",
            click_error: String(error && error.message ? error.message : error).slice(0, 1000),
            click_count: clickCount > 1 ? clickCount : undefined,
            coordinate_mode: mode,
            x: position ? fromX : undefined,
            y: position ? fromY : undefined,
            ...routeEvidence,
            reason: "expected_route_not_reached",
          };
        }
        return {
          ...base,
          ...setupScopeEvidence(scope),
          ok: true,
          count,
          target_index: targetIndex,
          text: matchedText,
          force: action.force === true || undefined,
          fallback_to_tap: true,
          input_dispatch: "playwright_mouse",
          click_error: String(error && error.message ? error.message : error).slice(0, 1000),
          click_count: clickCount > 1 ? clickCount : undefined,
          coordinate_mode: mode,
          x: position ? fromX : undefined,
          y: position ? fromY : undefined,
          ...routeEvidence,
        };
      }
      const routeEvidence = await waitForSetupActionRoute(action, timeout);
      if (routeEvidence && !routeEvidence.route_matched) {
        return {
          ...base,
          ...setupScopeEvidence(scope),
          count,
          target_index: targetIndex,
          text: matchedText,
          force: action.force === true || undefined,
          click_count: clickCount > 1 ? clickCount : undefined,
          coordinate_mode: mode,
          x: position ? fromX : undefined,
          y: position ? fromY : undefined,
          ...routeEvidence,
          reason: "expected_route_not_reached",
        };
      }
      return {
        ...base,
        ...setupScopeEvidence(scope),
        ok: true,
        count,
        target_index: targetIndex,
        text: matchedText,
        force: action.force === true || undefined,
        click_count: clickCount > 1 ? clickCount : undefined,
        coordinate_mode: mode,
        x: position ? fromX : undefined,
        y: position ? fromY : undefined,
        ...routeEvidence,
      };
    }
    if (type === "fill" || type === "set_input_value") {
      const scope = await setupActionScope(action, timeout);
      if (!scope.ok) return setupScopeFailure(base, scope);
      const locator = scope.context.locator(action.selector);
      const count = await locator.count();
      if (!count) return { ...base, reason: "selector_not_found", count };
      const targetIndex = Number.isInteger(action.index) ? action.index : 0;
      if (targetIndex < 0 || targetIndex >= count) return { ...base, reason: "index_out_of_range", count, target_index: targetIndex };
      const value = setupActionValue(action);
      await locator.nth(targetIndex).fill(value, { timeout });
      return { ...base, ...setupScopeEvidence(scope), ok: true, count, target_index: targetIndex, value_length: value.length };
    }
    if (type === "set_range_value") {
      const scope = await setupActionScope(action, timeout);
      if (!scope.ok) return setupScopeFailure(base, scope);
      const locator = scope.context.locator(action.selector);
      const count = await locator.count();
      if (!count) return { ...base, reason: "selector_not_found", count };
      const targetIndex = Number.isInteger(action.index) ? action.index : 0;
      if (targetIndex < 0 || targetIndex >= count) return { ...base, reason: "index_out_of_range", count, target_index: targetIndex };
      const target = locator.nth(targetIndex);
      await target.waitFor({ state: "visible", timeout });
      const requestedValue = setupActionValue(action);
      const rangeResult = await target.evaluate((element, value) => {
        const tag = String(element && element.tagName ? element.tagName : "").toLowerCase();
        const inputType = tag === "input" ? String(element.type || "").toLowerCase() : "";
        if (tag !== "input" || inputType !== "range") {
          return { ok: false, reason: "not_range_input", tag, input_type: inputType };
        }
        const beforeValue = String(element.value);
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        if (typeof valueSetter === "function") valueSetter.call(element, String(value));
        else element.value = String(value);
        element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        const valueAsNumber = Number(element.valueAsNumber);
        return {
          ok: true,
          before_value: beforeValue,
          actual_value: String(element.value),
          value_as_number: Number.isFinite(valueAsNumber) ? valueAsNumber : null,
          min: element.min || null,
          max: element.max || null,
          step: element.step || null,
        };
      }, requestedValue);
      return {
        ...base,
        ...setupScopeEvidence(scope),
        ok: rangeResult && rangeResult.ok === true,
        count,
        target_index: targetIndex,
        requested_value: requestedValue,
        actual_value: rangeResult?.actual_value,
        before_value: rangeResult?.before_value,
        value_as_number: rangeResult?.value_as_number,
        min: rangeResult?.min,
        max: rangeResult?.max,
        step: rangeResult?.step,
        tag: rangeResult?.tag,
        input_type: rangeResult?.input_type,
        reason: rangeResult && rangeResult.ok === true ? undefined : rangeResult?.reason || "range_value_not_set",
      };
    }
    if (type === "canvas_signature") {
      const scope = await setupActionScope(action, timeout);
      if (!scope.ok) return setupScopeFailure(base, scope);
      const locator = scope.context.locator(action.selector);
      const count = await locator.count();
      if (!count) return { ...base, ...setupScopeEvidence(scope), reason: "selector_not_found", count };
      const targetIndex = Number.isInteger(action.index) ? action.index : 0;
      if (targetIndex < 0 || targetIndex >= count) return { ...base, ...setupScopeEvidence(scope), reason: "index_out_of_range", count, target_index: targetIndex };
      const target = locator.nth(targetIndex);
      await target.waitFor({ state: "visible", timeout });
      const storeReturnTo = String(action.store_return_to || action.storeReturnTo || action.save_return_to || action.saveReturnTo || action.store_signature_to || action.storeSignatureTo || action.signature_path || action.signaturePath || "").trim();
      const compareTo = String(action.compare_to || action.compareTo || action.previous_signature_path || action.previousSignaturePath || action.previous_path || action.previousPath || action.changed_from || action.changedFrom || "").trim();
      const expectChanged = action.expect_changed === true || action.expectChanged === true || action.should_change === true || action.shouldChange === true || action.changed === true
        ? true
        : action.expect_changed === false || action.expectChanged === false || action.should_change === false || action.shouldChange === false || action.changed === false
          ? false
          : undefined;
      const signatureResult = await target.evaluate((element, payload) => {
        const toJsonValue = (value) => {
          if (value === null || value === undefined) return null;
          if (typeof value === "string" || typeof value === "boolean") return value;
          if (typeof value === "number") return Number.isFinite(value) ? value : null;
          if (Array.isArray(value)) return value.map(toJsonValue);
          if (typeof value === "object") {
            return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toJsonValue(child)]));
          }
          return String(value);
        };
        const pathParts = (path) => String(path || "").split(".").map((part) => part.trim()).filter(Boolean);
        const readWindowPath = (path) => {
          const parts = pathParts(path);
          if (parts[0] === "window") parts.shift();
          if (!parts.length) return { ok: false, reason: "missing_path" };
          let current = window;
          for (const part of parts) {
            if (current === null || current === undefined) return { ok: false, reason: "path_not_found", missing_part: part };
            current = current[part];
            if (current === undefined) return { ok: false, reason: "path_not_found", missing_part: part };
          }
          return { ok: true, value: toJsonValue(current) };
        };
        const storeWindowValue = (path, value) => {
          const parts = pathParts(path);
          if (parts[0] === "window") parts.shift();
          if (!parts.length) return { ok: false, reason: "missing_store_path" };
          let target = window;
          for (let index = 0; index < parts.length - 1; index += 1) {
            const part = parts[index];
            if (target[part] === null || typeof target[part] !== "object") target[part] = {};
            target = target[part];
          }
          target[parts[parts.length - 1]] = value;
          return { ok: true, path: parts.join(".") };
        };
        const hashText = (text) => {
          let hash = 2166136261;
          const step = Math.max(1, Math.floor((text.length || 1) / 4000));
          for (let index = 0; index < text.length; index += step) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619) >>> 0;
          }
          return String(hash);
        };
        const tag = String(element && element.tagName ? element.tagName : "").toLowerCase();
        if (tag !== "canvas") return { ok: false, reason: "not_canvas_element", tag };
        const rect = element.getBoundingClientRect();
        let data = "";
        try {
          data = element.toDataURL("image/png");
        } catch (error) {
          return {
            ok: false,
            reason: "canvas_read_failed",
            error: String(error && error.message ? error.message : error).slice(0, 1000),
            width: element.width || 0,
            height: element.height || 0,
            css_width: Math.round(rect.width || 0),
            css_height: Math.round(rect.height || 0),
          };
        }
        const result = {
          ok: Boolean(element.width > 0 && element.height > 0 && data.length > 0),
          reason: element.width > 0 && element.height > 0 && data.length > 0 ? undefined : "empty_canvas_signature",
          hash: hashText(data),
          data_length: data.length,
          width: element.width || 0,
          height: element.height || 0,
          css_width: Math.round(rect.width || 0),
          css_height: Math.round(rect.height || 0),
          compare_to: payload.compareTo || undefined,
          previous_hash: null,
          changed: null,
        };
        if (payload.compareTo) {
          const previous = readWindowPath(payload.compareTo);
          if (!previous.ok) {
            result.ok = false;
            result.reason = previous.reason || "compare_path_not_found";
            result.missing_part = previous.missing_part || undefined;
          } else {
            const previousValue = previous.value;
            const previousHash = previousValue && typeof previousValue === "object" && !Array.isArray(previousValue)
              ? previousValue.hash || previousValue.signature || previousValue.canvas_hash || null
              : typeof previousValue === "string"
                ? previousValue
                : null;
            result.previous_hash = previousHash === null || previousHash === undefined ? null : String(previousHash);
            result.changed = result.previous_hash === null ? null : result.previous_hash !== result.hash;
            if (payload.expectChanged === true && result.changed !== true) {
              result.ok = false;
              result.reason = "canvas_signature_unchanged";
            } else if (payload.expectChanged === false && result.changed !== false) {
              result.ok = false;
              result.reason = "canvas_signature_changed";
            }
          }
        }
        if (payload.storeReturnTo) {
          const stored = storeWindowValue(payload.storeReturnTo, result);
          if (!stored.ok) {
            return { ...result, ok: false, reason: "signature_store_failed", store_reason: stored.reason };
          }
          return { ...result, return_stored_to: stored.path };
        }
        return result;
      }, { compareTo, expectChanged, storeReturnTo });
      return {
        ...base,
        ...setupScopeEvidence(scope),
        ok: signatureResult && signatureResult.ok === true,
        count,
        target_index: targetIndex,
        label: action.label || action.name || undefined,
        hash: signatureResult?.hash,
        data_length: signatureResult?.data_length,
        width: signatureResult?.width,
        height: signatureResult?.height,
        css_width: signatureResult?.css_width,
        css_height: signatureResult?.css_height,
        compare_to: signatureResult?.compare_to || compareTo || undefined,
        previous_hash: signatureResult?.previous_hash,
        changed: signatureResult?.changed,
        return_stored_to: signatureResult?.return_stored_to || storeReturnTo || undefined,
        missing_part: signatureResult?.missing_part || undefined,
        store_reason: signatureResult?.store_reason || undefined,
        tag: signatureResult?.tag,
        reason: signatureResult && signatureResult.ok === true ? undefined : signatureResult?.reason || "canvas_signature_failed",
        error: signatureResult?.error || undefined,
      };
    }
    if (type === "assert_selector_count") {
      const scope = await setupActionScope(action, timeout);
      if (!scope.ok) return setupScopeFailure(base, scope);
      const locator = scope.context.locator(action.selector);
      const expectedCount = setupNumber(action.expected_count, -1);
      if (!Number.isInteger(expectedCount) || expectedCount < 0) return { ...base, reason: "invalid_expected_count", expected_count: action.expected_count };
      const startedAt = Date.now();
      let count = 0;
      while (Date.now() - startedAt <= timeout) {
        count = await locator.count().catch(() => 0);
        if (count === expectedCount) return { ...base, ...setupScopeEvidence(scope), ok: true, count, expected_count: expectedCount, timeout_ms: timeout };
        await page.waitForTimeout(100);
      }
      return { ...base, ...setupScopeEvidence(scope), reason: "selector_count_mismatch", count, expected_count: expectedCount, timeout_ms: timeout };
    }
    if (type === "wait_for_text") {
      const scope = await setupActionScope(action, timeout);
      if (!scope.ok) return setupScopeFailure(base, scope);
      const locator = scope.context.locator(action.selector);
      const startedAt = Date.now();
      let lastText = "";
      let caseInsensitiveText = "";
      while (Date.now() - startedAt <= timeout) {
        const count = await locator.count().catch(() => 0);
        for (let index = 0; index < count; index += 1) {
          const text = await setupLocatorText(locator, index);
          lastText = text || lastText;
          if (setupTextMatches(text, action)) {
            return { ...base, ...setupScopeEvidence(scope), ok: true, text: compactSetupResultText(text), target_index: index, timeout_ms: timeout };
          }
          caseInsensitiveText = caseInsensitiveText || setupCaseInsensitiveTextSample(text, action);
        }
        await page.waitForTimeout(100);
      }
      return { ...base, ...setupScopeEvidence(scope), reason: "text_not_found", text: compactSetupResultText(lastText), case_insensitive_text: caseInsensitiveText || undefined, timeout_ms: timeout };
    }
    if (type === "assert_text_visible" || type === "assert_text_absent") {
      const scope = await setupActionScope(action, timeout);
      if (!scope.ok) return setupScopeFailure(base, scope);
      const locator = scope.context.locator(action.selector);
      const startedAt = Date.now();
      let lastText = "";
      let matchedText = "";
      let caseInsensitiveText = "";
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
                return { ...base, ...setupScopeEvidence(scope), ok: true, count, text: compactSetupResultText(text), target_index: index, timeout_ms: timeout };
              }
              hiddenMatch = true;
              break;
            }
            break;
          }
          caseInsensitiveText = caseInsensitiveText || setupCaseInsensitiveTextSample(text, action);
        }
        if (type === "assert_text_absent" && !matched) {
          return { ...base, ...setupScopeEvidence(scope), ok: true, count, timeout_ms: timeout };
        }
        await page.waitForTimeout(100);
      }
      if (type === "assert_text_visible") {
        if (hiddenMatch) {
          return { ...base, ...setupScopeEvidence(scope), reason: "matching_element_not_visible", text: compactSetupResultText(matchedText), timeout_ms: timeout };
        }
        return { ...base, ...setupScopeEvidence(scope), reason: "text_not_found", text: compactSetupResultText(lastText), case_insensitive_text: caseInsensitiveText || undefined, timeout_ms: timeout };
      }
      return { ...base, ...setupScopeEvidence(scope), reason: "text_still_present", text: compactSetupResultText(matchedText || lastText), timeout_ms: timeout };
    }
    return { ...base, reason: "unsupported_action" };
  } catch (error) {
    return { ...base, error: String(error && error.message ? error.message : error).slice(0, 1000) };
  }
}
async function executeSetupActions(actions, viewport) {
  const results = [];
  for (let index = 0; index < (actions || []).length; index += 1) {
    const action = actions[index] || {};
    const requestedRepeat = setupNumber(action.repeat, 1);
    const repeatCount = Math.min(100, Math.max(1, Math.floor(requestedRepeat || 1)));
    let shouldStop = false;
    for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex += 1) {
      const result = await executeSetupAction(action, index, viewport);
      results.push(repeatCount > 1
        ? { ...result, repeat_index: repeatIndex, repeat_count: repeatCount }
        : result);
      const afterMs = setupNumber(action.after_ms, 0);
      if (afterMs) await page.waitForTimeout(afterMs);
      if (result.ok === false && action.continue_on_failure !== true && action.optional !== true) {
        shouldStop = true;
        break;
      }
    }
    if (shouldStop) break;
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
    const matchText = (value) => String(value || "").replace(/\s+/g, " ").trim().slice(0, 8000);
    const isVisible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style && style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const rows = elements.map((element, index) => ({
      index,
      text: compact(element.innerText || element.textContent || ""),
      match_text: matchText(element.innerText || element.textContent || ""),
      visible: isVisible(element),
    }));
    return {
      count: rows.length,
      visible_count: rows.filter((row) => row.visible).length,
      texts: rows.map((row) => row.text).filter(Boolean).slice(0, 40),
      visible_texts: rows.filter((row) => row.visible).map((row) => row.text).filter(Boolean).slice(0, 40),
      match_texts: rows.map((row) => row.match_text).filter(Boolean).slice(0, 40),
      visible_match_texts: rows.filter((row) => row.visible).map((row) => row.match_text).filter(Boolean).slice(0, 40),
    };
  }).catch((error) => ({ count: 0, visible_count: 0, texts: [], visible_texts: [], match_texts: [], visible_match_texts: [], error: String(error && error.message ? error.message : error).slice(0, 500) }));
}
async function observeWithinSnapshot(check) {
  const payload = {
    selector: check.selector || "",
    text: check.text || "",
    pattern: check.pattern || "",
    flags: check.flags || "",
    wants_text: Boolean(check.text || check.pattern),
  };
  if (payload.selector) {
    return page.locator(payload.selector).evaluateAll((elements, input) => {
      const compact = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const matchText = (value) => {
        const source = compact(value);
        if (input.pattern) {
          try { return new RegExp(input.pattern, input.flags || "").test(source); } catch { return false; }
        }
        return source.includes(input.text || "");
      };
      const isVisible = (element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style && style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      };
      const rows = elements.map((element, index) => {
        const text = compact(element.innerText || element.textContent || "");
        const visible = isVisible(element);
        return { index, text, visible, matched: input.wants_text ? matchText(text) : visible };
      });
      const visibleRows = rows.filter((row) => row.visible);
      const matches = input.wants_text ? visibleRows.filter((row) => row.matched) : visibleRows;
      const sampleRow = matches[0] || visibleRows[0] || rows[0] || null;
      return {
        selector: input.selector,
        text: input.text || null,
        pattern: input.pattern || null,
        selector_count: rows.length,
        visible_count: visibleRows.length,
        matched_count: matches.length,
        matched: matches.length > 0,
        sample: sampleRow && sampleRow.text ? sampleRow.text.slice(0, 240) : null,
      };
    }, payload).catch((error) => ({
      selector: payload.selector,
      text: payload.text || null,
      pattern: payload.pattern || null,
      selector_count: 0,
      visible_count: 0,
      matched_count: 0,
      matched: false,
      sample: null,
      error: String(error && error.message ? error.message : error).slice(0, 500),
    }));
  }
  return page.evaluate((input) => {
    const compact = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const sample = compact(document.body ? document.body.innerText || document.body.textContent || "" : "");
    let matched = false;
    if (input.pattern) {
      try { matched = new RegExp(input.pattern, input.flags || "").test(sample); } catch { matched = false; }
    } else {
      matched = sample.includes(input.text || "");
    }
    return {
      selector: null,
      text: input.text || null,
      pattern: input.pattern || null,
      matched,
      matched_count: matched ? 1 : 0,
      sample: sample.slice(0, 240),
    };
  }, payload).catch((error) => ({
    selector: null,
    text: payload.text || null,
    pattern: payload.pattern || null,
    matched: false,
    matched_count: 0,
    sample: null,
    error: String(error && error.message ? error.message : error).slice(0, 500),
  }));
}
async function observeWithin(check) {
  const timeoutMs = observeWithinTimeoutMs(check);
  const startedAt = Date.now();
  let attempts = 0;
  let last = null;
  while (true) {
    attempts += 1;
    last = await observeWithinSnapshot(check);
    const elapsedMs = Date.now() - startedAt;
    if (last && last.matched === true) {
      return { ...last, timeout_ms: timeoutMs, elapsed_ms: elapsedMs, attempts };
    }
    if (elapsedMs >= timeoutMs) {
      return { ...(last || {}), matched: false, timeout_ms: timeoutMs, elapsed_ms: elapsedMs, attempts };
    }
    await page.waitForTimeout(Math.min(100, Math.max(25, timeoutMs - elapsedMs)));
  }
}
function linkProbeMaxLinks(check) {
  const value = Number(check.max_links || check.maxLinks || check.limit || 100);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 500) : 100;
}
function linkProbeDedupe(check) {
  return check.dedupe !== false;
}
function linkProbeSameOriginOnly(check) {
  return check.same_origin_only === true;
}
async function collectLinkCandidates(selector) {
  return page.locator(selector).evaluateAll((elements) => {
    const compact = (value, limit) => String(value || "").replace(/\s+/g, " ").trim().slice(0, limit || 160);
    return elements.map((element, index) => {
      const tag = element && element.tagName ? element.tagName.toLowerCase() : "element";
      const href = element && typeof element.href === "string" ? element.href : "";
      const src = element && typeof element.src === "string" ? element.src : "";
      const currentSrc = element && typeof element.currentSrc === "string" ? element.currentSrc : "";
      const attrHref = element && typeof element.getAttribute === "function" ? element.getAttribute("href") || "" : "";
      const attrSrc = element && typeof element.getAttribute === "function" ? element.getAttribute("src") || "" : "";
      const attrPoster = element && typeof element.getAttribute === "function" ? element.getAttribute("poster") || "" : "";
      const raw = href || currentSrc || src || attrHref || attrSrc || attrPoster;
      if (!raw) return null;
      let url = "";
      try {
        url = new URL(raw, location.href).href;
      } catch {}
      if (!url) return null;
      return {
        index,
        tag,
        url,
        raw,
        text: compact(element.innerText || element.textContent || "", 160),
        alt: compact(element.getAttribute && element.getAttribute("alt"), 80),
      };
    }).filter(Boolean);
  }).catch((error) => ({ error: String(error && error.message ? error.message : error).slice(0, 500) }));
}
function linkProbeAllowed(status, check) {
  if (typeof status !== "number" || !Number.isFinite(status)) return false;
  const allowed = Array.isArray(check.allowed_statuses) && check.allowed_statuses.length
    ? check.allowed_statuses
    : typeof check.expected_status === "number" && Number.isFinite(check.expected_status)
      ? [check.expected_status]
      : null;
  return allowed ? allowed.includes(status) : status >= 200 && status < 400;
}
function linkProbeObservedBytes(result) {
  const bytes = typeof result.bytes === "number" && Number.isFinite(result.bytes) ? result.bytes : undefined;
  const contentLength = typeof result.content_length === "number" && Number.isFinite(result.content_length) ? result.content_length : undefined;
  const observed = Math.max(bytes || 0, contentLength || 0);
  return observed > 0 ? observed : undefined;
}
function normalizeLinkProbeContentType(value) {
  if (typeof value !== "string") return undefined;
  const normalized = (value.split(";")[0] || "").trim().toLowerCase();
  return normalized || undefined;
}
function linkProbeContentTypesMatch(actual, expected) {
  if (!actual || !expected) return false;
  if (expected.endsWith("/*")) return actual.startsWith(expected.slice(0, -1));
  if (actual === expected) return true;
  const yamlTypes = new Set(["application/yaml", "application/x-yaml", "text/yaml", "text/x-yaml"]);
  return yamlTypes.has(actual) && yamlTypes.has(expected);
}
function linkProbeContentTypeAllowed(result, check) {
  if (!Array.isArray(check.allowed_content_types) || !check.allowed_content_types.length) return true;
  const actual = normalizeLinkProbeContentType(result.content_type);
  if (!actual) return false;
  return check.allowed_content_types.some((contentType) => {
    const normalized = normalizeLinkProbeContentType(contentType);
    if (!normalized) return false;
    return linkProbeContentTypesMatch(actual, normalized);
  });
}
function linkProbeResponseFields(response, method) {
  const contentLengthHeader = response.headers && typeof response.headers.get === "function" ? response.headers.get("content-length") : null;
  const contentLength = contentLengthHeader && /^\d+$/.test(contentLengthHeader) ? Number(contentLengthHeader) : null;
  return {
    method,
    status: response.status,
    redirected: Boolean(response.redirected),
    final_url: response.url || null,
    content_type: response.headers && typeof response.headers.get === "function" ? response.headers.get("content-type") : null,
    content_length: contentLength,
  };
}
function jsonProbeValueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  return "object";
}
function compactJsonProbeSample(value, depth) {
  const level = typeof depth === "number" ? depth : 0;
  if (typeof value === "string") return value.length > 240 ? value.slice(0, 237) + "..." : value;
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) {
    if (level >= 2) return "[array:" + value.length + "]";
    return value.slice(0, 3).map((item) => compactJsonProbeSample(item, level + 1));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (level >= 2) return "[object:" + entries.length + " keys]";
    return Object.fromEntries(entries.slice(0, 8).map(([key, child]) => [key, compactJsonProbeSample(child, level + 1)]));
  }
  return String(value);
}
function attachJsonProbeObservedValue(result, value) {
  const type = jsonProbeValueType(value);
  if (type === "array" && Array.isArray(value)) {
    result.observed_length = value.length;
    result.observed_omitted_count = Math.max(0, value.length - 3);
    result.observed_sample = compactJsonProbeSample(value, 0);
    return;
  }
  if (type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    const keyCount = Object.keys(value).length;
    result.observed_key_count = keyCount;
    result.observed_omitted_count = Math.max(0, keyCount - 8);
    result.observed_sample = compactJsonProbeSample(value, 0);
    return;
  }
  result.observed = value;
}
function jsonProbeDeepEqual(left, right) {
  if (left === right) return true;
  if (typeof left !== typeof right) return false;
  if (left === null || right === null) return left === right;
  if (typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => jsonProbeDeepEqual(item, right[index]));
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (!jsonProbeDeepEqual(leftKeys, rightKeys)) return false;
  return leftKeys.every((key) => jsonProbeDeepEqual(left[key], right[key]));
}
function jsonProbeContains(observed, expected) {
  if (typeof observed === "string" && typeof expected === "string") return observed.includes(expected);
  if (Array.isArray(observed)) return observed.some((item) => jsonProbeDeepEqual(item, expected));
  if (observed && expected && typeof observed === "object" && typeof expected === "object" && !Array.isArray(observed) && !Array.isArray(expected)) {
    return Object.entries(expected).every(([key, value]) => Object.hasOwn(observed, key) && jsonProbeDeepEqual(observed[key], value));
  }
  return false;
}
function parseJsonProbePathSegments(path) {
  let input = String(path || "").trim();
  if (!input) throw new Error("path is empty");
  if (input === "$") return [];
  if (input.startsWith("$.")) input = input.slice(2);
  else if (input.startsWith("$[")) input = input.slice(1);
  const segments = [];
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
    if (closeIndex === -1) throw new Error("unterminated bracket at " + index);
    const bracket = input.slice(index + 1, closeIndex).trim();
    if (!bracket) throw new Error("empty bracket at " + index);
    if (/^\d+$/.test(bracket)) {
      segments.push(Number(bracket));
    } else if ((bracket.startsWith('"') && bracket.endsWith('"')) || (bracket.startsWith("'") && bracket.endsWith("'"))) {
      const quoted = bracket.startsWith("'")
        ? '"' + bracket.slice(1, -1).replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + '"'
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
function resolveJsonProbePath(root, path) {
  let segments;
  try {
    segments = parseJsonProbePathSegments(path);
  } catch (error) {
    return { exists: false, error: String(error && error.message ? error.message : error) };
  }
  let current = root;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (segment === "length") {
        current = current.length;
        continue;
      }
      const index = typeof segment === "number" ? segment : (/^\d+$/.test(segment) ? Number(segment) : -1);
      if (index < 0 || index >= current.length) return { exists: false };
      current = current[index];
      continue;
    }
    if (typeof segment === "number") return { exists: false };
    if (!current || typeof current !== "object" || Array.isArray(current) || !Object.hasOwn(current, segment)) {
      return { exists: false };
    }
    current = current[segment];
  }
  return { exists: true, value: current };
}
function evaluateJsonProbeAssertion(root, assertion) {
  const resolved = resolveJsonProbePath(root, assertion.path);
  const errors = [];
  const result = {
    label: assertion.label || assertion.path,
    path: assertion.path,
    ok: true,
    exists: resolved.exists,
    observed_type: resolved.exists ? jsonProbeValueType(resolved.value) : "missing",
  };
  if (resolved.exists) attachJsonProbeObservedValue(result, resolved.value);
  if (resolved.error) errors.push(resolved.error);
  if (Object.hasOwn(assertion, "exists")) {
    result.expected_exists = assertion.exists;
    if (resolved.exists !== assertion.exists) errors.push("expected exists=" + assertion.exists);
  }
  if (Object.hasOwn(assertion, "type")) {
    result.type = assertion.type;
    if (!resolved.exists || jsonProbeValueType(resolved.value) !== assertion.type) errors.push("expected type " + assertion.type);
  }
  if (Object.hasOwn(assertion, "equals")) {
    result.equals = assertion.equals;
    if (!resolved.exists || !jsonProbeDeepEqual(resolved.value, assertion.equals)) errors.push("expected JSON value equality");
  }
  if (Object.hasOwn(assertion, "not_equals")) {
    result.not_equals = assertion.not_equals;
    if (resolved.exists && jsonProbeDeepEqual(resolved.value, assertion.not_equals)) errors.push("expected JSON value inequality");
  }
  if (Object.hasOwn(assertion, "contains")) {
    result.contains = assertion.contains;
    if (!resolved.exists || !jsonProbeContains(resolved.value, assertion.contains)) errors.push("expected JSON value containment");
  }
  result.ok = errors.length === 0;
  if (errors.length) result.errors = errors;
  return result;
}
function evaluateJsonProbeAssertions(text, assertions) {
  const expected = Array.isArray(assertions) ? assertions.filter((assertion) => assertion && assertion.path) : [];
  if (!expected.length) return [];
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = "response body is not valid JSON: " + String(error && error.message ? error.message : error).slice(0, 200);
    return expected.map((assertion) => ({
      label: assertion.label || assertion.path,
      path: assertion.path,
      ok: false,
      exists: false,
      observed_type: "missing",
      errors: [message],
    }));
  }
  return expected.map((assertion) => evaluateJsonProbeAssertion(parsed, assertion));
}
async function collectHttpStatus(check) {
  const url = httpStatusRequestUrl(check, page.url() || targetUrl);
  const method = httpStatusMethod(check);
  const headers = check.headers && typeof check.headers === "object" && !Array.isArray(check.headers)
    ? Object.fromEntries(Object.entries(check.headers).map(([key, value]) => [key, String(value)]).filter(([key]) => key.trim()))
    : {};
  let body;
  if (check.body_json !== undefined) {
    body = JSON.stringify(check.body_json);
    if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) headers["content-type"] = "application/json";
  } else if (typeof check.body === "string") {
    body = check.body;
  }
  const bodyContains = Array.isArray(check.body_contains) ? check.body_contains.filter(Boolean) : [];
  const bodyNotContains = Array.isArray(check.body_not_contains) ? check.body_not_contains.filter(Boolean) : [];
  const bodyNotPatterns = Array.isArray(check.body_not_patterns) ? check.body_not_patterns.filter(Boolean) : [];
  const bodyJsonAssertions = Array.isArray(check.body_json_assertions) ? check.body_json_assertions.filter((assertion) => assertion && assertion.path) : [];
  const options = {
    method,
    redirect: "follow",
    cache: "no-store",
    headers,
  };
  if (body !== undefined && method !== "GET" && method !== "HEAD") options.body = body;
  const result = {
    version: "riddle-proof.http-status.v1",
    url,
    method,
    status: null,
    ok: false,
    error: null,
    request_body_bytes: typeof body === "string" ? body.length : 0,
    allowed_statuses: httpStatusAllowedStatuses(check) || ["2xx", "3xx"],
    require_nonzero_bytes: check.require_nonzero_bytes === true,
    min_bytes: typeof check.min_bytes === "number" && Number.isFinite(check.min_bytes) ? check.min_bytes : null,
    allowed_content_types: Array.isArray(check.allowed_content_types) ? check.allowed_content_types : null,
  };
  try {
    const response = await fetch(url, options);
    Object.assign(result, linkProbeResponseFields(response, method));
    result.url = url;
    result.status_text = response.statusText || "";
    const shouldReadBody = check.require_nonzero_bytes === true || (typeof check.min_bytes === "number" && Number.isFinite(check.min_bytes)) || bodyContains.length > 0 || bodyNotContains.length > 0 || bodyNotPatterns.length > 0 || bodyJsonAssertions.length > 0;
    if (shouldReadBody) {
      try {
        const buffer = await response.arrayBuffer();
        result.bytes = buffer.byteLength;
        if (bodyContains.length || bodyNotContains.length || bodyNotPatterns.length || bodyJsonAssertions.length) {
          const text = new TextDecoder().decode(buffer);
          result.body_sample = text.slice(0, 1000);
          if (bodyContains.length) result.body_contains = Object.fromEntries(bodyContains.map((expected) => [expected, text.includes(expected)]));
          if (bodyNotContains.length) result.body_not_contains = Object.fromEntries(bodyNotContains.map((forbidden) => [forbidden, text.includes(forbidden)]));
          if (bodyNotPatterns.length) result.body_not_patterns = Object.fromEntries(bodyNotPatterns.map((pattern) => [pattern, new RegExp(pattern).test(text)]));
          if (bodyJsonAssertions.length) result.body_json_assertions = evaluateJsonProbeAssertions(text, bodyJsonAssertions);
        }
      } catch (error) {
        result.error = String(error && error.message ? error.message : error).slice(0, 500);
      }
    }
    result.ok = linkProbeAllowed(result.status, check)
      && linkProbeContentTypeAllowed(result, check)
      && (check.require_nonzero_bytes !== true || ((linkProbeObservedBytes(result) || 0) > 0))
      && (!(typeof check.min_bytes === "number" && Number.isFinite(check.min_bytes)) || ((linkProbeObservedBytes(result) || 0) >= check.min_bytes))
      && (!bodyContains.length || bodyContains.every((expected) => result.body_contains && result.body_contains[expected] === true))
      && (!bodyNotContains.length || bodyNotContains.every((forbidden) => result.body_not_contains && result.body_not_contains[forbidden] === false))
      && (!bodyNotPatterns.length || bodyNotPatterns.every((pattern) => result.body_not_patterns && result.body_not_patterns[pattern] === false))
      && (!bodyJsonAssertions.length || (Array.isArray(result.body_json_assertions) && result.body_json_assertions.every((assertion) => assertion.ok === true)))
      && !result.error;
    return result;
  } catch (error) {
    result.error = String(error && error.message ? error.message : error).slice(0, 500);
    result.ok = false;
    return result;
  }
}
async function probeLinkStatus(candidate, check) {
  const requireNonzeroBytes = check.require_nonzero_bytes === true;
  const minBytes = typeof check.min_bytes === "number" && Number.isFinite(check.min_bytes) ? Math.max(1, Math.floor(check.min_bytes)) : null;
  const allowGetFallback = check.allow_get_fallback !== false;
  const result = {
    url: candidate.url,
    tag: candidate.tag,
    text: candidate.text || null,
    status: null,
    method: null,
    ok: false,
    content_type: null,
    content_length: null,
    bytes: null,
    redirected: false,
    final_url: null,
    error: null,
  };
  const applyResponse = async (response, method, readBytes) => {
    Object.assign(result, linkProbeResponseFields(response, method));
    if (readBytes) {
      try {
        const buffer = await response.arrayBuffer();
        result.bytes = buffer.byteLength;
      } catch (error) {
        result.error = String(error && error.message ? error.message : error).slice(0, 500);
      }
    }
    result.ok = linkProbeAllowed(result.status, check)
      && linkProbeContentTypeAllowed(result, check)
      && (!requireNonzeroBytes || ((linkProbeObservedBytes(result) || 0) > 0))
      && (minBytes === null || ((linkProbeObservedBytes(result) || 0) >= minBytes))
      && !result.error;
  };
  try {
    const response = await fetch(candidate.url, { method: "HEAD", redirect: "follow", cache: "no-store" });
    await applyResponse(response, "HEAD", false);
    if (result.ok || !allowGetFallback) return result;
  } catch (error) {
    result.error = String(error && error.message ? error.message : error).slice(0, 500);
    if (!allowGetFallback) return result;
  }
  try {
    result.error = null;
    const response = await fetch(candidate.url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: { Range: "bytes=0-" + String((minBytes || 1) - 1) },
    });
    await applyResponse(response, "GET", requireNonzeroBytes || minBytes !== null);
    return result;
  } catch (error) {
    result.error = String(error && error.message ? error.message : error).slice(0, 500);
    result.ok = false;
    return result;
  }
}
function compactLinkProbeResults(results) {
  const allResults = Array.isArray(results) ? results : [];
  if (allResults.length <= 20) {
    return {
      result_count: allResults.length,
      stored_result_count: allResults.length,
      omitted_result_count: 0,
      omitted_success_count: 0,
      results_compacted: false,
      results: allResults,
    };
  }
  const successResults = allResults.filter((result) => result && result.ok);
  const sampledSuccesses = new Set(successResults.slice(0, 5));
  const storedResults = allResults.filter((result) => result && (!result.ok || sampledSuccesses.has(result)));
  return {
    result_count: allResults.length,
    stored_result_count: storedResults.length,
    omitted_result_count: allResults.length - storedResults.length,
    omitted_success_count: Math.max(0, successResults.length - sampledSuccesses.size),
    results_compacted: storedResults.length < allResults.length,
    results: storedResults,
  };
}
async function collectLinkStatus(check) {
  const selector = linkStatusSelector(check);
  const candidateResult = await collectLinkCandidates(selector);
  if (candidateResult && candidateResult.error) {
    return {
      version: "riddle-proof.link-status.v1",
      selector,
      total_count: 0,
      discovered_count: 0,
      ok_count: 0,
      failed_count: 1,
      failures: [{ code: "link_status_capture_failed", error: candidateResult.error }],
      results: [],
      status_counts: {},
      error: candidateResult.error,
    };
  }
  const baseUrl = page.url() || targetUrl;
  let candidates = Array.isArray(candidateResult) ? candidateResult : [];
  if (linkProbeSameOriginOnly(check)) {
    const origin = new URL(baseUrl).origin;
    candidates = candidates.filter((candidate) => {
      try { return new URL(candidate.url).origin === origin; } catch { return false; }
    });
  }
  const discoveredCount = candidates.length;
  if (linkProbeDedupe(check)) {
    const seen = new Set();
    candidates = candidates.filter((candidate) => {
      if (seen.has(candidate.url)) return false;
      seen.add(candidate.url);
      return true;
    });
  }
  const maxLinks = linkProbeMaxLinks(check);
  const selected = candidates.slice(0, maxLinks);
  const results = [];
  for (const candidate of selected) {
    results.push(await probeLinkStatus(candidate, check));
  }
  const failures = results.filter((result) => !result.ok).map((result) => ({
    code: "link_status_failed",
    url: result.url,
    status: result.status,
    method: result.method,
    error: result.error,
    content_type: result.content_type,
    bytes: linkProbeObservedBytes(result) || null,
    min_bytes: typeof check.min_bytes === "number" && Number.isFinite(check.min_bytes) ? check.min_bytes : null,
    allowed_content_types: Array.isArray(check.allowed_content_types) ? check.allowed_content_types : null,
  }));
  const statusCounts = {};
  for (const result of results) {
    const key = result.status == null ? "error" : String(result.status);
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  }
  const compactedResults = compactLinkProbeResults(results);
  return {
    version: "riddle-proof.link-status.v1",
    selector,
    max_links: maxLinks,
    same_origin_only: linkProbeSameOriginOnly(check),
    dedupe: linkProbeDedupe(check),
    require_nonzero_bytes: check.require_nonzero_bytes === true,
    min_bytes: typeof check.min_bytes === "number" && Number.isFinite(check.min_bytes) ? check.min_bytes : null,
    allowed_content_types: Array.isArray(check.allowed_content_types) ? check.allowed_content_types : null,
    allowed_statuses: Array.isArray(check.allowed_statuses) && check.allowed_statuses.length
      ? check.allowed_statuses
      : typeof check.expected_status === "number"
        ? [check.expected_status]
        : ["2xx", "3xx"],
    discovered_count: discoveredCount,
    total_count: selected.length,
    truncated: candidates.length > selected.length,
    ok_count: results.filter((result) => result.ok).length,
    failed_count: failures.length,
    status_counts: statusCounts,
    failures: failures.slice(0, 20),
    ...compactedResults,
  };
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
        function isHandledByHorizontalOverflowAncestor(element, rect) {
          let current = element.parentElement;
          while (current && current !== body && current !== documentElement) {
            const style = window.getComputedStyle(current);
            const overflowX = style.overflowX || style.overflow || "";
            if ((overflowX === "auto" || overflowX === "scroll") && current.scrollWidth > current.clientWidth + 1) {
              const currentRect = current.getBoundingClientRect();
              const contained = currentRect.left >= -0.5 && currentRect.right <= viewportWidth + 0.5;
              if (contained) return true;
            }
            if (overflowX === "hidden" || overflowX === "clip" || style.overflow === "hidden" || style.overflow === "clip") {
              const currentRect = current.getBoundingClientRect();
              const clippedByAncestor = rect.left < currentRect.left - 0.5 || rect.right > currentRect.right + 0.5;
              if (clippedByAncestor) return true;
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
          if (isHandledByHorizontalOverflowAncestor(element, rect)) continue;
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
    const selectedLinks = links.filter((link) => (
      routePathPrefix ? link.app_path.startsWith(routePathPrefix) : expectedSet.has(link.app_path)
    ));
    return {
      links: selectedLinks,
      candidate_count: links.length,
      candidate_unique_link_count: Array.from(new Set(links.map((link) => link.app_path))).length,
      source_link_scope: routePathPrefix ? "route_path_prefix" : "expected_routes",
    };
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
async function waitForInventoryLinkIndex(check, expectedPath) {
  const timeout = Math.min(inventoryCheckTimeout(check), 15000);
  const started = Date.now();
  let index = await findInventoryLinkIndex(check, expectedPath);
  while (index < 0 && Date.now() - started < timeout) {
    await page.waitForTimeout(250);
    index = await findInventoryLinkIndex(check, expectedPath);
  }
  return index;
}
async function collectRouteInventory(check, viewport) {
  const expectedRoutes = check.expected_routes || [];
  const expectedPaths = expectedRoutes.map((route) => normalizeRoutePath(route.path));
  const expectedSet = new Set(expectedPaths);
  const failures = [];
  const homeLinkCapture = await collectInventoryHomeLinks(check);
  const homeLinks = Array.isArray(homeLinkCapture) ? homeLinkCapture : Array.isArray(homeLinkCapture && homeLinkCapture.links) ? homeLinkCapture.links : [];
  const sourceCandidateCount = typeof homeLinkCapture?.candidate_count === "number" ? homeLinkCapture.candidate_count : homeLinks.length;
  const sourceCandidateUniqueLinkCount = typeof homeLinkCapture?.candidate_unique_link_count === "number" ? homeLinkCapture.candidate_unique_link_count : new Set(homeLinks.map((link) => link.app_path)).size;
  const sourceLinkScope = typeof homeLinkCapture?.source_link_scope === "string" ? homeLinkCapture.source_link_scope : check.route_path_prefix ? "route_path_prefix" : "expected_routes";
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
          await waitForAnyVisibleSelector(page, profile.target.wait_for_selector, 15000).catch(() => {});
        }
        const index = await waitForInventoryLinkIndex(check, expectedRoute.path);
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
    source_link_scope: sourceLinkScope,
    source_candidate_count: sourceCandidateCount,
    source_candidate_unique_link_count: sourceCandidateUniqueLinkCount,
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
  activeViewportName = viewport && viewport.name ? viewport.name : null;
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
      await waitForAnyVisibleSelector(page, profile.target.wait_for_selector, 15000);
    } catch (error) {
      waitError = String(error && error.message ? error.message : error).slice(0, 1000);
    }
  }
  if (!navigationError && profile.target.wait_ms) {
    await page.waitForTimeout(profile.target.wait_ms);
  }
  const setupActionResults = (!navigationError && !waitError)
    ? await executeSetupActions(setupActionsForViewport(profile.target.setup_actions || [], viewport.name), viewport)
    : [];
  const dom = await page.evaluate(() => {
    const body = document.body;
    const documentElement = document.documentElement;
    const text = (body ? body.innerText : "").replace(/\s+/g, " ").trim();
    const clientWidth = documentElement ? documentElement.clientWidth : window.innerWidth;
    const scrollWidth = documentElement ? documentElement.scrollWidth : 0;
    const viewportWidth = clientWidth || window.innerWidth;
    const overflowOffenders = [];
    function isHandledByHorizontalOverflowAncestor(element, rect) {
      let current = element.parentElement;
      while (current && current !== body && current !== documentElement) {
        const style = window.getComputedStyle(current);
        const overflowX = style.overflowX || style.overflow || "";
        if ((overflowX === "auto" || overflowX === "scroll") && current.scrollWidth > current.clientWidth + 1) {
          const currentRect = current.getBoundingClientRect();
          const contained = currentRect.left >= -0.5 && currentRect.right <= viewportWidth + 0.5;
          if (contained) return true;
        }
        if (overflowX === "hidden" || overflowX === "clip" || style.overflow === "hidden" || style.overflow === "clip") {
          const currentRect = current.getBoundingClientRect();
          const clippedByAncestor = rect.left < currentRect.left - 0.5 || rect.right > currentRect.right + 0.5;
          if (clippedByAncestor) return true;
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
      if (isHandledByHorizontalOverflowAncestor(element, rect)) continue;
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
  const text_match_samples = {};
  const text_case_insensitive_samples = {};
  const observations = {};
  const http_statuses = {};
  const link_statuses = {};
  for (const check of profile.checks || []) {
    if (!profileCheckAppliesToViewport(check, viewport)) continue;
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
    if ((check.type === "selector_text_order" || check.type === "selector_text_visible" || check.type === "selector_text_absent") && check.selector) {
      selectors[check.selector] = selectors[check.selector] || await selectorStats(check.selector);
      text_sequences[check.selector] = await selectorTextSequence(check.selector);
    }
    if (check.type === "observe_within") {
      const key = observeWithinKey(check);
      observations[key] = observations[key] || await observeWithin(check);
    }
    if ((check.type === "text_visible" || check.type === "text_absent") && (check.text || check.pattern)) {
      const key = textKey(check);
      const sample = dom.body_text || dom.body_text_sample || "";
      text_matches[key] = textMatches(sample, check);
      text_match_samples[key] = textMatchSamples(sample, check);
      text_case_insensitive_samples[key] = textCaseInsensitiveSamples(sample, check);
    }
    if ((check.type === "frame_text_visible" || check.type === "frame_url_equals" || check.type === "frame_url_matches" || check.type === "frame_no_horizontal_overflow") && check.selector) {
      selectors[check.selector] = selectors[check.selector] || await selectorStats(check.selector);
      frames[check.selector] = frames[check.selector] || await frameEvidence(check.selector);
    }
    if (check.type === "http_status") {
      const key = httpStatusKey(check, page.url() || targetUrl);
      http_statuses[key] = http_statuses[key] || await collectHttpStatus(check);
    }
    if (check.type === "link_status" || check.type === "artifact_link_status") {
      const selector = linkStatusSelector(check);
      link_statuses[selector] = link_statuses[selector] || await collectLinkStatus(check);
    }
  }
  const screenshotLabel = profileSlug + "-" + viewport.name;
  let screenshotFullPage = null;
  try {
    const screenshotOptions = {};
    if (profile.target && profile.target.screenshot_full_page !== undefined) {
      screenshotFullPage = profile.target.screenshot_full_page !== false;
      screenshotOptions.fullPage = screenshotFullPage;
    }
    if (typeof saveScreenshot === "function") await saveScreenshot(screenshotLabel, screenshotOptions);
  } catch (error) {
    pageErrors.push({ message: "saveScreenshot failed: " + String(error && error.message ? error.message : error).slice(0, 500) });
  }
  let routeInventory;
  const routeInventoryCheck = (profile.checks || []).find((check) => check.type === "route_inventory" && profileCheckAppliesToViewport(check, viewport));
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
        source_link_scope: routeInventoryCheck.route_path_prefix ? "route_path_prefix" : "expected_routes",
        source_candidate_count: 0,
        source_candidate_unique_link_count: 0,
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
    text_match_samples,
    text_case_insensitive_samples,
    observations,
    http_statuses,
    link_statuses,
    route_inventory: routeInventory,
    setup_action_results: setupActionResults,
    screenshot_label: screenshotLabel,
    screenshot_full_page: screenshotFullPage,
    navigation_error: navigationError,
    wait_error: waitError,
  };
}
${runtimeScriptAssessmentSource(profile.checks.some((check) => check.type === "ordered_trace"))}
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
    dialogs: dialogEvents.slice(),
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
      http_status: currentViewports
        .filter((viewport) => viewport.http_statuses && Object.keys(viewport.http_statuses).length)
        .map((viewport) => ({
          viewport: viewport.name,
          requests: Object.entries(viewport.http_statuses || {}).map(([key, statusSet]) => ({
            key,
            url: statusSet && statusSet.url,
            method: statusSet && statusSet.method,
            status: statusSet && statusSet.status,
            ok: statusSet && statusSet.ok === true,
            error: statusSet && statusSet.error,
          })),
        })),
      link_status: currentViewports
        .filter((viewport) => viewport.link_statuses && Object.keys(viewport.link_statuses).length)
        .map((viewport) => ({
          viewport: viewport.name,
          selectors: Object.entries(viewport.link_statuses || {}).map(([selector, statusSet]) => ({
            selector,
            total_count: statusSet && statusSet.total_count,
            ok_count: statusSet && statusSet.ok_count,
            failed_count: statusSet && statusSet.failed_count,
            truncated: statusSet && statusSet.truncated === true,
          })),
        })),
      route_inventory: currentViewports
        .filter((viewport) => viewport.route_inventory)
        .map((viewport) => ({
          viewport: viewport.name,
          expected_count: (viewport.route_inventory.expected_routes || []).length,
          source_link_scope: viewport.route_inventory.source_link_scope,
          source_candidate_count: viewport.route_inventory.source_candidate_count,
          source_candidate_unique_link_count: viewport.route_inventory.source_candidate_unique_link_count,
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
      dialog_count: dialogEvents.length,
      dialog_accept_count: dialogEvents.filter((event) => event.response === "accept" && event.ok !== false).length,
      dialog_dismiss_count: dialogEvents.filter((event) => event.response === "dismiss" && event.ok !== false).length,
    },
  };
}
async function saveProfileArtifacts(currentViewports) {
  const evidence = buildProfileEvidence(currentViewports);
  const result = assessProfile(profile, evidence);
  if (typeof saveJson === "function") {
    await saveJson("proof.json", result);
    await saveJson("console.json", { events: consoleEvents, page_errors: pageErrors, dialogs: dialogEvents });
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
