import {
  RIDDLE_PROOF_PROFILE_VERSION,
  type RiddleProofProfile,
  type RiddleProofProfileCheck,
  type RiddleProofProfileSetupAction,
  type RiddleProofProfileViewport,
} from "./profile";
import type { JsonValue } from "./types";

export const RIDDLE_PROOF_PROFILE_SUGGESTIONS_VERSION = "riddle-proof.profile-suggestions.v1" as const;

export interface RiddleProofProfileChangedTextInput {
  text?: string;
  expected_text?: string;
  selector?: string;
  label?: string;
}

export interface RiddleProofProfileSuggestionInput {
  name?: string;
  route?: string;
  url?: string;
  changed_files?: string[];
  selectors?: string[];
  changed_text?: Array<string | RiddleProofProfileChangedTextInput>;
  include_mobile?: boolean;
  include_screenshot?: boolean;
}

export interface RiddleProofProfileSuggestion {
  id: string;
  reason: string;
  checks: RiddleProofProfileCheck[];
  setup_actions?: RiddleProofProfileSetupAction[];
}

export interface RiddleProofProfileSuggestionsResult {
  version: typeof RIDDLE_PROOF_PROFILE_SUGGESTIONS_VERSION;
  profile: RiddleProofProfile;
  suggestions: RiddleProofProfileSuggestion[];
  warnings: string[];
}

const UI_FILE_PATTERN = /\.(css|html?|jsx?|tsx?|vue|svelte|mdx)$/i;
const VISUAL_ASSET_PATTERN = /\.(avif|gif|jpe?g|png|svg|webp)$/i;

function nonEmptyStrings(values: unknown[] | undefined): string[] {
  return Array.from(new Set(
    (values || [])
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean),
  ));
}

function normalizeRoute(value: string | undefined) {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return undefined;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function routeFromUrl(value: string | undefined) {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value);
    return normalizeRoute(`${url.pathname}${url.search || ""}`);
  } catch {
    return undefined;
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "suggested-profile";
}

function inferRouteFromFile(file: string) {
  const normalized = file.replace(/\\/g, "/");
  const routeMatch = normalized.match(/(?:^|\/)(?:pages|routes|app)\/(.+?)(?:\.[^.\/]+)?$/);
  if (!routeMatch) return undefined;
  const route = routeMatch[1]
    .replace(/\/index$/i, "")
    .replace(/\/page$/i, "")
    .replace(/\[[^/\]]+\]/g, ":param");
  return normalizeRoute(route || "/");
}

function inferRouteFromFiles(files: string[]) {
  for (const file of files) {
    const route = inferRouteFromFile(file);
    if (route) return route;
  }
  return undefined;
}

function uniqueChecks(checks: RiddleProofProfileCheck[]) {
  const seen = new Set<string>();
  return checks.filter((check) => {
    const key = JSON.stringify(check);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function changedTextEntryText(entry: string | RiddleProofProfileChangedTextInput) {
  return typeof entry === "string"
    ? entry.trim()
    : (entry.expected_text || entry.text || "").trim();
}

function changedTextEntrySelector(entry: string | RiddleProofProfileChangedTextInput) {
  return typeof entry === "string" ? undefined : entry.selector?.trim() || undefined;
}

function changedTextEntryLabel(entry: string | RiddleProofProfileChangedTextInput) {
  return typeof entry === "string" ? undefined : entry.label?.trim() || undefined;
}

function suggestionProfileName(input: RiddleProofProfileSuggestionInput, route: string | undefined, files: string[]) {
  if (input.name?.trim()) return input.name.trim();
  return `suggested-${slugify(route || files[0] || "profile")}`;
}

function defaultViewports(includeMobile: boolean | undefined): RiddleProofProfileViewport[] {
  const viewports: RiddleProofProfileViewport[] = [
    { name: "desktop", width: 1280, height: 800 },
  ];
  if (includeMobile !== false) {
    viewports.push({ name: "mobile", width: 390, height: 844 });
  }
  return viewports;
}

export function suggestRiddleProofProfileChecks(input: RiddleProofProfileSuggestionInput): RiddleProofProfileSuggestionsResult {
  const changedFiles = nonEmptyStrings(input.changed_files);
  const selectors = nonEmptyStrings(input.selectors);
  const changedText = input.changed_text || [];
  const route = normalizeRoute(input.route) || inferRouteFromFiles(changedFiles) || routeFromUrl(input.url);
  const uiFiles = changedFiles.filter((file) => UI_FILE_PATTERN.test(file));
  const visualAssets = changedFiles.filter((file) => VISUAL_ASSET_PATTERN.test(file));
  const warnings: string[] = [];
  const suggestions: RiddleProofProfileSuggestion[] = [];
  const setupActions: RiddleProofProfileSetupAction[] = [];

  if (!route && !input.url?.trim()) {
    warnings.push("No route or URL was supplied; the draft profile defaults to route /.");
  }
  if ((uiFiles.length || visualAssets.length) && !changedText.length && !selectors.length) {
    warnings.push("UI or visual files changed, but no changed text or selectors were supplied; add focused checks before trusting this profile.");
  }

  const routeOrDefault = route || "/";
  const routeChecks: RiddleProofProfileCheck[] = [
    { type: "route_loaded", expected_path: routeOrDefault },
  ];
  suggestions.push({
    id: "route-loaded",
    reason: "Every browser proof should first prove that the intended route loaded.",
    checks: routeChecks,
  });

  const hygieneChecks: RiddleProofProfileCheck[] = [
    { type: "no_fatal_console_errors" },
    { type: "no_mobile_horizontal_overflow" },
  ];
  suggestions.push({
    id: "runtime-hygiene",
    reason: "UI changes should not introduce fatal console errors or mobile overflow.",
    checks: hygieneChecks,
  });

  for (const selector of selectors) {
    suggestions.push({
      id: `selector-${slugify(selector)}`,
      reason: `Changed selector ${selector} should remain visible.`,
      checks: [{ type: "selector_visible", selector }],
    });
  }

  for (const entry of changedText) {
    const text = changedTextEntryText(entry);
    if (!text) continue;
    const selector = changedTextEntrySelector(entry);
    const label = changedTextEntryLabel(entry);
    const check: RiddleProofProfileCheck = selector
      ? { type: "selector_text_visible", selector, text, label }
      : { type: "text_visible", text, label };
    suggestions.push({
      id: `text-${slugify(`${selector || "page"}-${text}`)}`,
      reason: selector
        ? `Expected text should be visible inside ${selector}.`
        : "Expected text should be visible on the route.",
      checks: [check],
    });
  }

  if (input.include_screenshot !== false && (uiFiles.length || visualAssets.length || selectors.length || changedText.length)) {
    setupActions.push({ type: "screenshot", label: "suggested-proof-screenshot", full_page: true });
    suggestions.push({
      id: "screenshot-artifact",
      reason: "A screenshot artifact keeps the proof packet inspectable by humans and hosted renderers.",
      checks: [],
      setup_actions: setupActions,
    });
  }

  const checks = uniqueChecks(suggestions.flatMap((suggestion) => suggestion.checks));
  const target = {
    ...(input.url?.trim() ? { url: input.url.trim() } : { route: routeOrDefault }),
    viewports: defaultViewports(input.include_mobile),
    setup_actions: setupActions.length ? setupActions : undefined,
  };
  const profile: RiddleProofProfile = {
    version: RIDDLE_PROOF_PROFILE_VERSION,
    name: suggestionProfileName(input, routeOrDefault, changedFiles),
    target,
    checks,
    artifacts: ["screenshot", "console", "proof_json"],
    baseline_policy: "invariant_only",
    failure_policy: {
      product_regression: "fail",
      proof_insufficient: "review",
      environment_blocked: "neutral",
      configuration_error: "fail",
      needs_human_review: "review",
    },
    metadata: {
      suggestion_input: {
        changed_files: changedFiles,
        selectors,
        changed_text_count: changedText.length,
      } as Record<string, JsonValue>,
    },
  };

  return {
    version: RIDDLE_PROOF_PROFILE_SUGGESTIONS_VERSION,
    profile,
    suggestions,
    warnings,
  };
}
