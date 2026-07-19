import {
  assessRiddleProofOrderedTrace,
  assessRiddleProofOrderedTraceSetupResults,
} from "@riddledc/riddle-proof-core/profile";

export function runtimeScriptAssessmentSource(includeOrderedTrace = false) {
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
