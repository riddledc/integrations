#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  createDisabledRiddleProofAgentAdapter,
  readRiddleProofRunStatus,
  runRiddleProofEngineHarness,
  type RiddleProofAgentAdapter,
  type RiddleProofCheckpointMode,
} from "./engine-harness";
import { createCheckpointResponseTemplate } from "./checkpoint";
import {
  createLocalAgentAdapter,
  runLocalAgentDoctor,
  type LocalAgentConfig,
} from "./local-agent";
import {
  createRiddleApiClient,
  parseRiddleViewport,
  type RiddlePollProgressSnapshot,
  type RiddleClientConfig,
} from "./riddle-client";
import {
  assessRiddleProofProfileEvidence,
  buildRiddleProofProfileScript,
  collectRiddleProfileArtifactRefs,
  createRiddleProofProfileEnvironmentBlockedResult,
  createRiddleProofProfileInsufficientResult,
  extractRiddleProofProfileResult,
  normalizeRiddleProofProfile,
  profileStatusExitCode,
  resolveRiddleProofProfileTargetUrl,
  resolveRiddleProofProfileTimeoutSec,
  type RiddleProofProfile,
  type RiddleProofProfileArtifactRef,
  type RiddleProofProfileEvidence,
  type RiddleProofProfileResult,
  type RiddleProofProfileRunner,
  type RiddleProofProfileViewport,
} from "./profile";
import type { RiddleProofCheckpointResponse, RiddleProofRunParams, RiddleProofRunState } from "./types";

type CliOptions = Record<string, string | boolean>;

function usage() {
  return [
    "Usage:",
    "  riddle-proof-loop run --request-json <file|json|-> [--agent disabled|local] [--checkpoint-mode yield|auto]",
    "  riddle-proof-loop checkpoint --state-path <path> [--decision <decision>] [--format json|markdown]",
    "  riddle-proof-loop respond --state-path <path> --response-json <file|json|->",
    "  riddle-proof-loop respond --state-path <path> --decision <decision> --summary <text> [--payload-json <file|json|->]",
    "  riddle-proof-loop status --state-path <path>",
    "  riddle-proof-loop run-profile --profile <file|json|-> --url <base-url> [--runner riddle] [--strict true|false] [--poll-attempts n] [--output <dir>|--output-dir <dir>] [--quiet]",
    "  riddle-proof-loop riddle-preview-deploy <build-dir> <label>",
    "  riddle-proof-loop riddle-server-preview <directory> --script-file <file> [--path /route] [--wait-for-selector selector]",
    "  riddle-proof-loop riddle-run-script --url <url> --script-file <file> [--viewport 1280x720] [--strict true|false]",
    "  riddle-proof-loop riddle-poll <job-id> [--wait] [--attempts n] [--quiet]",
    "  riddle-proof-loop doctor local [--codex-command <path>]",
    "",
    "The default CLI run mode is checkpoint-mode=yield unless --agent local is used.",
    "Compatibility aliases: --agent codex_exec and doctor codex_exec.",
  ].join("\n");
}

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const options: CliOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const raw = arg.slice(2);
    const equalIndex = raw.indexOf("=");
    const rawKey = equalIndex >= 0 ? raw.slice(0, equalIndex) : raw;
    const key = rawKey.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    if (equalIndex >= 0) {
      options[key] = raw.slice(equalIndex + 1);
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return { positional, options };
}

function optionString(options: CliOptions, key: string) {
  const value = options[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionBoolean(options: CliOptions, key: string) {
  const value = options[key];
  if (typeof value === "undefined") return undefined;
  if (typeof value === "boolean") return value;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  const flag = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  throw new Error(`--${flag} must be true or false.`);
}

function runProfileStrictOption(options: CliOptions) {
  return optionBoolean(options, "strict") ?? false;
}

function optionNumber(options: CliOptions, ...keys: string[]) {
  for (const key of keys) {
    const value = optionString(options, key);
    if (value !== undefined) return Number(value);
  }
  return undefined;
}

function profileOutputDirOption(options: CliOptions) {
  return optionString(options, "output") ?? optionString(options, "outputDir");
}

function readStdin() {
  return readFileSync(0, "utf-8");
}

function formatPollDuration(ms: number | null | undefined) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "n/a";
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m${String(remainder).padStart(2, "0")}s` : `${seconds}s`;
}

function riddlePollProgressLine(snapshot: RiddlePollProgressSnapshot) {
  const submittedAt = snapshot.submitted_at || "not-submitted";
  const queuePart = snapshot.running_without_submission
    ? ` queued_for=${formatPollDuration(snapshot.queue_elapsed_ms)}`
    : snapshot.queue_elapsed_ms !== null
      ? ` queue=${formatPollDuration(snapshot.queue_elapsed_ms)}`
      : "";
  const terminalPart = snapshot.terminal ? " terminal=true" : "";
  return [
    "[riddle-poll]",
    snapshot.job_id,
    `status=${snapshot.status || "unknown"}`,
    `attempt=${snapshot.attempt}/${snapshot.attempts}`,
    `elapsed=${formatPollDuration(snapshot.elapsed_ms)}`,
    `submitted_at=${submittedAt}${queuePart}${terminalPart}`,
  ].join(" ");
}

function readJsonValue(value: string | undefined, label: string): Record<string, unknown> {
  if (!value) throw new Error(`${label} is required.`);
  const raw = value === "-"
    ? readStdin()
    : existsSync(value)
      ? readFileSync(value, "utf-8")
      : value;
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function readOptionalJsonRecord(value: string | undefined, label: string): Record<string, unknown> | undefined {
  if (!value) return undefined;
  return readJsonValue(value, label);
}

function readOptionalJsonStringArray(value: string | undefined, label: string): string[] | undefined {
  if (!value) return undefined;
  const parsed = value === "-"
    ? JSON.parse(readStdin())
    : existsSync(value)
      ? JSON.parse(readFileSync(value, "utf-8"))
      : JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be a JSON array of strings.`);
  }
  return parsed;
}

function readRunState(statePath: string): RiddleProofRunState {
  const parsed = readJsonValue(statePath, "--state-path");
  if (parsed.version !== "riddle-proof.run-state.v1" || !Array.isArray(parsed.events)) {
    throw new Error(`${statePath} is not a riddle-proof.run-state.v1 file.`);
  }
  return parsed as unknown as RiddleProofRunState;
}

function hasPlaceholderValue(value: unknown): boolean {
  if (typeof value === "string") return /\bTODO\b/.test(value);
  if (Array.isArray(value)) return value.some(hasPlaceholderValue);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasPlaceholderValue);
  }
  return false;
}

function markdownJson(value: unknown) {
  return JSON.stringify(value ?? null, null, 2);
}

function formatCheckpointMarkdown(input: {
  statePath: string;
  status?: string;
  checkpointPacket: NonNullable<RiddleProofRunState["checkpoint_packet"]>;
  runCard?: RiddleProofRunState["run_card"] | null;
  responseTemplate: RiddleProofCheckpointResponse;
}) {
  const packet = input.checkpointPacket;
  const runCard = input.runCard;
  const lines = [
    "# Riddle Proof Checkpoint",
    "",
    `Run: ${packet.run_id}`,
    `State: ${input.statePath}`,
    `Status: ${input.status || "awaiting_checkpoint"}`,
    `Stage: ${packet.stage}`,
    `Checkpoint: ${packet.checkpoint}`,
    `Kind: ${packet.kind}`,
    "",
    "## Goal",
    "",
    runCard?.goal?.change_request || packet.change_request,
    "",
    "## Next Action",
    "",
    packet.question,
    "",
    "## Allowed Decisions",
    "",
    ...packet.allowed_decisions.map((decision) => `- ${decision}`),
    "",
  ];
  if (packet.artifacts?.length) {
    lines.push("## Artifacts", "");
    for (const artifact of packet.artifacts) {
      lines.push(`- ${artifact.role}: ${artifact.url || artifact.path || artifact.name || "available"}`);
    }
    lines.push("");
  }
  if (packet.evidence_excerpt && Object.keys(packet.evidence_excerpt).length) {
    lines.push("## Evidence Excerpt", "", "```json", markdownJson(packet.evidence_excerpt), "```", "");
  }
  if (packet.state_excerpt && Object.keys(packet.state_excerpt).length) {
    lines.push("## State Excerpt", "", "```json", markdownJson(packet.state_excerpt), "```", "");
  }
  lines.push(
    "## Response Template",
    "",
    "```json",
    markdownJson(input.responseTemplate),
    "```",
    "",
    "## Next Command",
    "",
    "```sh",
    `riddle-proof-loop respond --state-path ${input.statePath} --decision ${input.responseTemplate.decision} --summary <summary> --payload-json <file|json|->`,
    "```",
    "",
  );
  return `${lines.join("\n")}\n`;
}

function checkpointResponseForFlags(statePath: string, options: CliOptions): RiddleProofCheckpointResponse {
  const state = readRunState(statePath);
  if (!state.checkpoint_packet) {
    throw new Error(`${statePath} has no pending checkpoint packet. Use status to inspect the current run state.`);
  }
  const decision = optionString(options, "decision");
  const summary = optionString(options, "summary");
  if (!decision || !summary) {
    throw new Error("--decision and --summary are required when --response-json is not supplied.");
  }
  if (!state.checkpoint_packet.allowed_decisions.includes(decision)) {
    throw new Error(`--decision ${decision} is not allowed for ${state.checkpoint_packet.checkpoint}. Allowed decisions: ${state.checkpoint_packet.allowed_decisions.join(", ")}`);
  }
  const payload = readOptionalJsonRecord(optionString(options, "payloadJson"), "--payload-json");
  const reasons = readOptionalJsonStringArray(optionString(options, "reasonsJson"), "--reasons-json");
  const response = createCheckpointResponseTemplate(state.checkpoint_packet, {
    decision,
    summary,
    payload,
    reasons,
    continue_with_stage: optionString(options, "continueWithStage") as RiddleProofCheckpointResponse["continue_with_stage"],
    source_kind: optionString(options, "sourceKind") as NonNullable<RiddleProofCheckpointResponse["source"]>["kind"] || "codex",
    created_at: optionString(options, "createdAt"),
  });
  if (!payload && hasPlaceholderValue(response.payload)) {
    throw new Error(`--payload-json is required for ${decision} at ${state.checkpoint_packet.checkpoint}; the generated template contains placeholders.`);
  }
  if (!reasons && hasPlaceholderValue(response.reasons)) {
    delete response.reasons;
  }
  return response;
}

function codexConfig(options: CliOptions): LocalAgentConfig {
  const codexFullAuto = optionString(options, "codexFullAuto");
  return {
    codexCommand: optionString(options, "codexCommand"),
    codexHome: optionString(options, "codexHome"),
    codexModel: optionString(options, "codexModel"),
    codexTimeoutMs: optionString(options, "codexTimeoutMs")
      ? Number(optionString(options, "codexTimeoutMs"))
      : undefined,
    codexSandbox: optionString(options, "codexSandbox") as LocalAgentConfig["codexSandbox"],
    codexFullAuto: codexFullAuto === "false" ? false : undefined,
  };
}

function isLocalAgentMode(value: string | undefined) {
  return value === "local" || value === "local_exec" || value === "codex_exec";
}

function agentFor(options: CliOptions): RiddleProofAgentAdapter {
  const agentMode = optionString(options, "agent") || "disabled";
  if (isLocalAgentMode(agentMode)) return createLocalAgentAdapter(codexConfig(options));
  if (agentMode === "disabled") return createDisabledRiddleProofAgentAdapter();
  throw new Error(`Unsupported --agent ${agentMode}. Use disabled or local.`);
}

function riddleClientConfig(options: CliOptions): RiddleClientConfig {
  return {
    apiKey: optionString(options, "apiKey"),
    apiKeyFile: optionString(options, "apiKeyFile"),
    apiBaseUrl: optionString(options, "apiBaseUrl"),
  };
}

function parseProfileViewports(value: string | undefined): RiddleProofProfileViewport[] | undefined {
  if (!value) return undefined;
  return value.split(",").map((part, index) => {
    const trimmed = part.trim();
    const named = /^([a-zA-Z0-9_-]+)=(\d+x\d+)$/.exec(trimmed);
    const viewport = parseRiddleViewport(named ? named[2] : trimmed);
    if (!viewport) throw new Error(`Invalid viewport ${trimmed}.`);
    return {
      name: named ? named[1] : `viewport-${index + 1}`,
      width: viewport.width,
      height: viewport.height,
    };
  });
}

function normalizeProfileForCli(options: CliOptions): RiddleProofProfile {
  const rawProfile = readJsonValue(optionString(options, "profile"), "--profile");
  return normalizeRiddleProofProfile(rawProfile, {
    url: optionString(options, "url"),
    route: optionString(options, "route"),
    viewports: parseProfileViewports(optionString(options, "viewports") || optionString(options, "viewport")),
  });
}

function profileResultMarkdown(result: RiddleProofProfileResult) {
  const lines = [
    `# Riddle Proof Profile: ${result.profile_name}`,
    "",
    `Status: ${result.status}`,
    `Runner: ${result.runner}`,
    `Captured: ${result.captured_at}`,
    "",
    result.summary,
    "",
    "## Checks",
    "",
  ];
  for (const check of result.checks) {
    lines.push(`- ${check.status}: ${profileCheckMarkdownLabel(check)}`);
    if (check.message) lines.push(`  ${check.message}`);
  }
  const setupSummaryLines = profileSetupSummaryMarkdown(result);
  if (setupSummaryLines.length) {
    lines.push("", "## Setup Summary", "", ...setupSummaryLines);
  }
  const networkMockSummaryLines = profileNetworkMockSummaryMarkdown(result);
  if (networkMockSummaryLines.length) {
    lines.push("", "## Network Mocks", "", ...networkMockSummaryLines);
  }
  const routeInventorySummaryLines = profileRouteInventorySummaryMarkdown(result);
  if (routeInventorySummaryLines.length) {
    lines.push("", "## Route Inventory", "", ...routeInventorySummaryLines);
  }
  const environmentBlockerLines = profileEnvironmentBlockerMarkdown(result);
  if (environmentBlockerLines.length) {
    lines.push("", "## Environment Blocker", "", ...environmentBlockerLines);
  }
  if (result.artifacts.riddle_artifacts?.length) {
    lines.push("", "## Riddle Artifacts", "");
    for (const artifact of result.artifacts.riddle_artifacts.slice(0, 40)) {
      lines.push(`- ${artifact.name || artifact.kind || "artifact"}${artifact.url ? `: ${artifact.url}` : ""}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function markdownInlineCode(value: string, maxLength = 80): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const clipped = normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
    : normalized;
  return `\`${clipped.replace(/`/g, "'")}\``;
}

function profileCheckTextTarget(evidence: Record<string, unknown>): string | undefined {
  const text = cliString(evidence.text);
  if (text) return markdownInlineCode(text);
  const pattern = cliString(evidence.pattern);
  return pattern ? `pattern ${markdownInlineCode(pattern)}` : undefined;
}

function profileCheckMarkdownTarget(check: RiddleProofProfileResult["checks"][number]): string | undefined {
  const evidence = cliRecord(check.evidence);
  if (!evidence) return undefined;

  const selector = cliString(evidence.selector);
  if (check.type === "route_loaded") {
    const expectedPath = cliString(evidence.expected_path);
    return expectedPath ? markdownInlineCode(expectedPath) : undefined;
  }
  if (check.type === "selector_visible" || check.type === "selector_absent") {
    return selector ? markdownInlineCode(selector) : undefined;
  }
  if (check.type === "selector_count_at_least") {
    const minCount = cliFiniteNumber(evidence.min_count);
    return selector && minCount !== undefined ? `${markdownInlineCode(selector)} >= ${minCount}` : undefined;
  }
  if (check.type === "selector_count_equals" || check.type === "selector_count_equal" || check.type === "selector_count_eq") {
    const expectedCount = cliFiniteNumber(evidence.expected_count);
    return selector && expectedCount !== undefined ? `${markdownInlineCode(selector)} = ${expectedCount}` : undefined;
  }
  if (check.type === "selector_text_order") {
    return selector ? `${markdownInlineCode(selector)} text order` : undefined;
  }
  if (check.type === "text_visible" || check.type === "text_absent") {
    return profileCheckTextTarget(evidence);
  }
  if (check.type === "frame_text_visible") {
    const textTarget = profileCheckTextTarget(evidence);
    if (selector && textTarget) return `${markdownInlineCode(selector)} contains ${textTarget}`;
    return selector ? markdownInlineCode(selector) : textTarget;
  }
  if (check.type === "frame_url_equals") {
    const expectedUrl = cliString(evidence.expected_url);
    if (selector && expectedUrl) return `${markdownInlineCode(selector)} = ${markdownInlineCode(expectedUrl)}`;
    return selector ? markdownInlineCode(selector) : expectedUrl ? markdownInlineCode(expectedUrl) : undefined;
  }
  if (check.type === "frame_url_matches") {
    const pattern = cliString(evidence.pattern);
    if (selector && pattern) return `${markdownInlineCode(selector)} matches ${markdownInlineCode(pattern)}`;
    return selector ? markdownInlineCode(selector) : pattern ? `pattern ${markdownInlineCode(pattern)}` : undefined;
  }
  if (check.type === "frame_no_horizontal_overflow") {
    const maxOverflow = cliFiniteNumber(evidence.max_overflow_px);
    if (selector && maxOverflow !== undefined) return `${markdownInlineCode(selector)} <= ${maxOverflow}px`;
    return selector ? markdownInlineCode(selector) : maxOverflow !== undefined ? `<= ${maxOverflow}px` : undefined;
  }
  if (check.type === "no_horizontal_overflow" || check.type === "no_mobile_horizontal_overflow") {
    const maxOverflow = cliFiniteNumber(evidence.max_overflow_px);
    return maxOverflow !== undefined ? `<= ${maxOverflow}px` : undefined;
  }
  if (check.type === "no_fatal_console_errors") {
    return "0 unallowed fatal errors";
  }
  return undefined;
}

function profileCheckMarkdownLabel(check: RiddleProofProfileResult["checks"][number]) {
  const label = check.label || check.type;
  const target = profileCheckMarkdownTarget(check);
  return target ? `${label} (${target})` : label;
}

function cliRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function cliFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function cliString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cliStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())) : [];
}

function profileEnvironmentBlockerMarkdown(result: RiddleProofProfileResult): string[] {
  const blocker = cliRecord(result.environment_blocker);
  if (!blocker) return [];

  const lines: string[] = [];
  const reason = cliString(blocker.reason);
  const source = cliString(blocker.source);
  const endpoint = cliString(blocker.endpoint);
  const httpStatus = cliFiniteNumber(blocker.http_status);
  const error = cliString(blocker.error);
  const requiredSeconds = cliFiniteNumber(blocker.required_seconds);
  const availableSeconds = cliFiniteNumber(blocker.available_seconds);
  const deficitSeconds = cliFiniteNumber(blocker.deficit_seconds);
  const minimumPurchaseDollars = cliFiniteNumber(blocker.minimum_purchase_dollars);

  if (reason) lines.push(`- reason: ${reason}`);
  if (source || endpoint || httpStatus !== undefined) {
    lines.push(`- source: ${source || "runner"}${endpoint ? ` ${endpoint}` : ""}${httpStatus === undefined ? "" : ` HTTP ${httpStatus}`}`);
  }
  if (error) lines.push(`- error: ${error}`);
  if (requiredSeconds !== undefined || availableSeconds !== undefined || deficitSeconds !== undefined) {
    lines.push(`- seconds: required ${requiredSeconds ?? "unknown"}, available ${availableSeconds ?? "unknown"}, deficit ${deficitSeconds ?? "unknown"}`);
  }
  if (minimumPurchaseDollars !== undefined) lines.push(`- minimum purchase: $${minimumPurchaseDollars}`);
  return lines;
}

function profileSetupSummaryMarkdown(result: RiddleProofProfileResult): string[] {
  const setupCheck = result.checks.find((check) => check.type === "setup_actions_succeeded");
  const setupSummary = cliRecord(setupCheck?.evidence?.setup_summary);
  if (!setupSummary) return [];

  const viewports = Array.isArray(setupSummary.viewports)
    ? setupSummary.viewports.map(cliRecord).filter((viewport): viewport is Record<string, unknown> => Boolean(viewport))
    : [];
  if (!viewports.length) return [];

  const declaredActions = cliFiniteNumber(setupSummary.action_count);
  const totalResults = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.result_count) || 0), 0);
  const setupScreenshots = viewports.reduce((sum, viewport) => {
    const labels = Array.isArray(viewport.setup_screenshots) ? viewport.setup_screenshots : [];
    return sum + labels.filter((label) => typeof label === "string" && label.trim()).length;
  }, 0);
  const clickedTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.clicked_total) || 0), 0);
  const clickCountActionTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.click_count_action_total) || 0), 0);
  const clickCountValueTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.click_count_value_total) || 0), 0);
  const failedTotal = viewports.reduce((sum, viewport) => (
    sum + (Array.isArray(viewport.failed) ? viewport.failed.length : 0)
  ), 0);

  const lines = [
    `- setup actions: ${declaredActions === undefined ? "unknown" : declaredActions} declared, ${totalResults} recorded result(s) across ${viewports.length} viewport(s)`,
    `- setup screenshots: ${setupScreenshots}`,
    `- clicked targets: ${clickedTotal}${failedTotal ? `; failed setup actions: ${failedTotal}` : ""}`,
  ];
  if (clickCountActionTotal) {
    lines.push(`- click counts: ${clickCountActionTotal} action(s), click_count total ${clickCountValueTotal}`);
  }

  for (const viewport of viewports.slice(0, 8)) {
    const name = cliString(viewport.name) || "viewport";
    const ok = viewport.ok === false ? "failed" : "ok";
    const resultCount = cliFiniteNumber(viewport.result_count) || 0;
    const screenshotCount = Array.isArray(viewport.setup_screenshots)
      ? viewport.setup_screenshots.filter((label) => typeof label === "string" && label.trim()).length
      : 0;
    const clicked = cliFiniteNumber(viewport.clicked_total) || 0;
    const clickCountActions = cliFiniteNumber(viewport.click_count_action_total) || 0;
    const observedPath = cliString(viewport.observed_path);
    lines.push(`- ${name}: ${ok}, ${resultCount} result(s), ${screenshotCount} setup screenshot(s), ${clicked} click(s)${clickCountActions ? `, ${clickCountActions} click_count action(s)` : ""}${observedPath ? `, path ${observedPath}` : ""}`);
  }
  if (viewports.length > 8) lines.push(`- ${viewports.length - 8} additional viewport(s) omitted from setup summary.`);
  return lines;
}

function cliRecordNumber(value: Record<string, unknown>, key: string): number | undefined {
  return cliFiniteNumber(value[key]);
}

function profileNetworkMockSummaryMarkdown(result: RiddleProofProfileResult): string[] {
  const networkCheck = result.checks.find((check) => check.type === "network_mocks_succeeded");
  const evidence = cliRecord(networkCheck?.evidence);
  if (!evidence) return [];

  const hitsByLabel = cliRecord(evidence.hits_by_label) || {};
  const requiredHitsByLabel = cliRecord(evidence.required_hits_by_label) || {};
  const maxHitsByLabel = cliRecord(evidence.max_hits_by_label) || {};
  const responseHitsByLabel = cliRecord(evidence.response_hits_by_label) || {};
  const labels = Array.from(new Set([
    ...Object.keys(hitsByLabel),
    ...Object.keys(requiredHitsByLabel),
    ...Object.keys(maxHitsByLabel),
    ...Object.keys(responseHitsByLabel),
  ])).sort();
  const mockCount = cliFiniteNumber(evidence.mock_count);
  const requiredCount = cliFiniteNumber(evidence.required_count);
  const hitCount = cliFiniteNumber(evidence.hit_count);
  const failed = Array.isArray(evidence.failed) ? evidence.failed : [];
  if (!labels.length && mockCount === undefined && hitCount === undefined && !failed.length) return [];

  const lines = [
    `- mocks: ${mockCount === undefined ? labels.length : mockCount}; total hits: ${hitCount === undefined ? "unknown" : hitCount}${requiredCount === undefined ? "" : `; required mocks: ${requiredCount}`}`,
    `- failed mocks: ${failed.length}`,
  ];

  for (const label of labels.slice(0, 16)) {
    const parts = [`hits ${cliRecordNumber(hitsByLabel, label) ?? 0}`];
    const requiredHits = cliRecordNumber(requiredHitsByLabel, label);
    const maxHits = cliRecordNumber(maxHitsByLabel, label);
    if (requiredHits !== undefined) parts.push(`required ${requiredHits}`);
    if (maxHits !== undefined) parts.push(`max ${maxHits}`);
    lines.push(`- ${label}: ${parts.join(", ")}`);
    const responseHits = cliRecord(responseHitsByLabel[label]);
    const responseLabels = responseHits ? Object.keys(responseHits).sort() : [];
    if (responseHits && responseLabels.length) {
      const responseParts = responseLabels
        .slice(0, 8)
        .map((responseLabel) => `${responseLabel} ${cliRecordNumber(responseHits, responseLabel) ?? 0}`);
      const omitted = responseLabels.length > 8 ? `; ${responseLabels.length - 8} additional response label(s) omitted` : "";
      lines.push(`- ${label} responses: ${responseParts.join("; ")}${omitted}`);
    }
  }
  if (labels.length > 16) lines.push(`- ${labels.length - 16} additional network mock label(s) omitted from summary.`);
  return lines;
}

function profileRouteInventorySummaryMarkdown(result: RiddleProofProfileResult): string[] {
  const routeInventoryChecks = result.checks.filter((check) => check.type === "route_inventory");
  const lines: string[] = [];

  for (const check of routeInventoryChecks) {
    const evidence = cliRecord(check.evidence);
    if (!evidence) continue;
    const label = check.label || check.type;
    const expectedCount = cliFiniteNumber(evidence.expected_count);
    const sourceLinkCount = cliFiniteNumber(evidence.source_link_count);
    const sourceUniqueLinkCount = cliFiniteNumber(evidence.source_unique_link_count);
    const directRouteCount = cliFiniteNumber(evidence.direct_route_count);
    const clickthroughCount = cliFiniteNumber(evidence.clickthrough_count);
    const topLevelFailures = Array.isArray(evidence.failures) ? evidence.failures.length : undefined;
    const viewports = Array.isArray(evidence.viewports)
      ? evidence.viewports.map(cliRecord).filter((viewport): viewport is Record<string, unknown> => Boolean(viewport))
      : [];
    const viewportFailureTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.failure_count) || 0), 0);
    const failureCount = topLevelFailures === undefined ? viewportFailureTotal : topLevelFailures;

    lines.push(
      `- ${label}: expected ${expectedCount ?? "unknown"}, source links ${sourceLinkCount ?? "unknown"}${sourceUniqueLinkCount === undefined ? "" : ` (${sourceUniqueLinkCount} unique)`}, direct ${directRouteCount ?? "unknown"}, clickthrough ${clickthroughCount ?? "unknown"}, failures ${failureCount}`,
    );

    const duplicateCount = cliFiniteNumber(evidence.duplicate_source_link_count) || 0;
    const duplicateLinks = cliStringArray(evidence.duplicate_source_links);
    if (duplicateCount || duplicateLinks.length) {
      const duplicateText = duplicateLinks.length ? `: ${duplicateLinks.slice(0, 8).join(", ")}${duplicateLinks.length > 8 ? `, ${duplicateLinks.length - 8} more` : ""}` : "";
      lines.push(`- ${label} duplicate source links: ${duplicateCount}${evidence.duplicates_allowed === true ? " allowed" : ""}${duplicateText}`);
    }

    for (const viewport of viewports.slice(0, 8)) {
      const viewportName = cliString(viewport.viewport) || cliString(viewport.name) || "viewport";
      const viewportSourceLinkCount = cliFiniteNumber(viewport.source_link_count);
      const viewportSourceUniqueLinkCount = cliFiniteNumber(viewport.source_unique_link_count);
      const viewportDirectRouteCount = cliFiniteNumber(viewport.direct_route_count);
      const viewportClickthroughCount = cliFiniteNumber(viewport.clickthrough_count);
      const viewportFailureCount = cliFiniteNumber(viewport.failure_count) || 0;
      lines.push(
        `- ${label} ${viewportName}: source ${viewportSourceLinkCount ?? "unknown"}${viewportSourceUniqueLinkCount === undefined ? "" : ` (${viewportSourceUniqueLinkCount} unique)`}, direct ${viewportDirectRouteCount ?? "unknown"}, clickthrough ${viewportClickthroughCount ?? "unknown"}, failures ${viewportFailureCount}`,
      );
    }
    if (viewports.length > 8) lines.push(`- ${label}: ${viewports.length - 8} additional viewport(s) omitted from route inventory summary.`);
  }

  return lines;
}

function writeProfileOutput(outputDir: string | undefined, result: RiddleProofProfileResult) {
  if (!outputDir) return;
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, "profile-result.json"), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(path.join(outputDir, "summary.md"), profileResultMarkdown(result));
  if (result.evidence) writeFileSync(path.join(outputDir, "proof.json"), `${JSON.stringify(result, null, 2)}\n`);
  if (result.evidence?.console) writeFileSync(path.join(outputDir, "console.json"), `${JSON.stringify(result.evidence.console, null, 2)}\n`);
  if (result.evidence?.dom_summary) writeFileSync(path.join(outputDir, "dom-summary.json"), `${JSON.stringify(result.evidence.dom_summary, null, 2)}\n`);
}

async function readArtifactJson(artifact: RiddleProofProfileArtifactRef): Promise<Record<string, unknown> | undefined> {
  const target = artifact.url || artifact.path;
  if (!target) return undefined;
  try {
    const raw = artifact.url
      ? await (await fetch(artifact.url)).text()
      : existsSync(target)
        ? readFileSync(target, "utf-8")
        : "";
    if (!raw.trim()) return undefined;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

async function profileResultFromRiddleArtifacts(
  profile: RiddleProofProfile,
  artifacts: RiddleProofProfileArtifactRef[],
  fallbackInputs: unknown[],
): Promise<RiddleProofProfileResult | undefined> {
  for (const input of fallbackInputs) {
    const result = extractRiddleProofProfileResult(input);
    if (result) return result;
  }
  const proofArtifacts = artifacts
    .filter((artifact) => /(^|\/)proof\.json(?:\.json)?$/i.test(artifact.name || artifact.url || artifact.path || ""))
    .sort((left, right) => {
      const leftName = left.name || left.url || left.path || "";
      const rightName = right.name || right.url || right.path || "";
      return Number(/proof\.json\.json$/i.test(rightName)) - Number(/proof\.json\.json$/i.test(leftName));
    });
  for (const artifact of proofArtifacts) {
    const parsed = await readArtifactJson(artifact);
    const result = extractRiddleProofProfileResult(parsed);
    if (result) return result;
  }
  const evidenceArtifacts = artifacts.filter((artifact) => /profile-evidence|evidence\.json/i.test(artifact.name || artifact.url || artifact.path || ""));
  for (const artifact of evidenceArtifacts) {
    const parsed = await readArtifactJson(artifact);
    if (parsed?.version === "riddle-proof.profile-evidence.v1") {
      return assessRiddleProofProfileEvidence(profile, parsed as unknown as RiddleProofProfileEvidence, { artifacts });
    }
  }
  return undefined;
}

function withRiddleMetadata(
  result: RiddleProofProfileResult,
  input: {
    job_id?: string;
    status?: string | null;
    terminal?: boolean;
    artifacts?: RiddleProofProfileArtifactRef[];
  },
): RiddleProofProfileResult {
  return {
    ...result,
    riddle: {
      ...(result.riddle || {}),
      job_id: input.job_id || result.riddle?.job_id,
      status: input.status ?? result.riddle?.status,
      terminal: input.terminal ?? result.riddle?.terminal,
    },
    artifacts: {
      ...result.artifacts,
      riddle_artifacts: input.artifacts || result.artifacts.riddle_artifacts,
    },
  };
}

async function runProfileForCli(profile: RiddleProofProfile, options: CliOptions): Promise<RiddleProofProfileResult> {
  const runner = (optionString(options, "runner") || "riddle") as RiddleProofProfileRunner;
  if (runner !== "riddle") {
    throw new Error(`Unsupported --runner ${runner}. The current CLI supports --runner riddle.`);
  }
  const targetUrl = resolveRiddleProofProfileTargetUrl(profile);
  const client = createRiddleApiClient(riddleClientConfig(options));
  let created: Record<string, unknown> | undefined;
  try {
    created = await client.runScript({
      url: targetUrl,
      script: buildRiddleProofProfileScript(profile),
      viewport: profile.target.viewports[0],
      timeoutSec: resolveRiddleProofProfileTimeoutSec(
        profile,
        optionString(options, "timeout") ? Number(optionString(options, "timeout")) : undefined,
      ),
      strict: runProfileStrictOption(options),
      sync: options.sync === true ? true : undefined,
    });
  } catch (error) {
    return createRiddleProofProfileEnvironmentBlockedResult({ profile, runner, error });
  }

  const jobId = typeof created.job_id === "string"
    ? created.job_id
    : typeof created.id === "string"
      ? created.id
      : "";
  if (!jobId) {
    const directResult = extractRiddleProofProfileResult(created);
    return directResult
      ? withRiddleMetadata(directResult, { artifacts: collectRiddleProfileArtifactRefs(created) })
      : createRiddleProofProfileInsufficientResult({ profile, runner, error: "Riddle run response was missing job_id.", artifacts: collectRiddleProfileArtifactRefs(created) });
  }

  const poll = await client.pollJob(jobId, {
    wait: true,
    attempts: optionNumber(options, "pollAttempts", "attempts"),
    intervalMs: optionNumber(options, "intervalMs"),
    progressEveryMs: optionNumber(options, "progressEveryMs"),
    onProgress: options.quiet !== true
      ? (snapshot) => {
          process.stderr.write(`${riddlePollProgressLine(snapshot)}\n`);
        }
      : undefined,
  });
  const artifacts = collectRiddleProfileArtifactRefs(poll.artifacts);
  if (!poll.ok || !poll.terminal) {
    return createRiddleProofProfileEnvironmentBlockedResult({
      profile,
      runner,
      error: `Riddle job ${jobId} ended with status ${poll.status || "unknown"}.`,
      riddle: { job_id: jobId, status: poll.status, terminal: poll.terminal },
      artifacts,
    });
  }

  const artifactResult = await profileResultFromRiddleArtifacts(profile, artifacts, [poll.job, poll.artifacts, created]);
  if (!artifactResult) {
    return createRiddleProofProfileInsufficientResult({
      profile,
      runner,
      riddle: { job_id: jobId, status: poll.status, terminal: poll.terminal },
      artifacts,
    });
  }
  return withRiddleMetadata(artifactResult, {
    job_id: jobId,
    status: poll.status,
    terminal: poll.terminal,
    artifacts,
  });
}

function requestForRun(options: CliOptions): RiddleProofRunParams {
  const statePath = optionString(options, "statePath");
  const withEngineModuleUrl = (request: RiddleProofRunParams): RiddleProofRunParams => {
    const moduleUrl = optionString(options, "riddleEngineModuleUrl");
    return moduleUrl && !request.riddle_engine_module_url
      ? { ...request, riddle_engine_module_url: moduleUrl }
      : request;
  };
  if (optionString(options, "requestJson")) {
    return withEngineModuleUrl(readJsonValue(optionString(options, "requestJson"), "--request-json") as RiddleProofRunParams);
  }
  if (statePath) return withEngineModuleUrl(readRunState(statePath).request);
  throw new Error("--request-json is required unless --state-path points to an existing run state.");
}

function riddleEngineModuleUrlFor(options: CliOptions, request: RiddleProofRunParams) {
  return optionString(options, "riddleEngineModuleUrl") ||
    (typeof request.riddle_engine_module_url === "string" && request.riddle_engine_module_url.trim()
      ? request.riddle_engine_module_url.trim()
      : undefined);
}

function checkpointModeFor(options: CliOptions) {
  const explicit = optionString(options, "checkpointMode") as RiddleProofCheckpointMode | undefined;
  if (explicit) return explicit;
  return isLocalAgentMode(optionString(options, "agent")) ? "auto" : "yield";
}

async function main() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  const command = positional[0];
  if (!command || command === "help" || command === "--help") {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  if (command === "doctor") {
    const subject = positional[1];
    if (!isLocalAgentMode(subject)) throw new Error("Only `doctor local` is supported.");
    const result = await runLocalAgentDoctor(codexConfig(options));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "status") {
    const statePath = optionString(options, "statePath");
    if (!statePath) throw new Error("--state-path is required.");
    const snapshot = readRiddleProofRunStatus(statePath);
    if (!snapshot) throw new Error(`${statePath} is not a readable Riddle Proof run state.`);
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return;
  }

  if (command === "run-profile") {
    const profile = normalizeProfileForCli(options);
    const result = await runProfileForCli(profile, options);
    writeProfileOutput(profileOutputDirOption(options), result);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = profileStatusExitCode(profile, result.status);
    return;
  }

  if (command === "riddle-preview-deploy") {
    const buildDir = positional[1];
    const label = positional[2];
    const result = await createRiddleApiClient(riddleClientConfig(options)).deployStaticPreview(buildDir, label);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "riddle-server-preview") {
    const directory = positional[1];
    const scriptFile = optionString(options, "scriptFile");
    if (!directory || !scriptFile) throw new Error("riddle-server-preview requires <directory> and --script-file.");
    const result = await createRiddleApiClient(riddleClientConfig(options)).runServerPreview({
      directory,
      script: readFileSync(scriptFile, "utf-8"),
      image: optionString(options, "image"),
      command: optionString(options, "command"),
      port: optionString(options, "port") ? Number(optionString(options, "port")) : undefined,
      path: optionString(options, "path"),
      readinessPath: optionString(options, "readinessPath"),
      readinessTimeoutSec: optionString(options, "readinessTimeout") ? Number(optionString(options, "readinessTimeout")) : undefined,
      waitForSelector: optionString(options, "waitForSelector"),
      navigationTimeoutSec: optionString(options, "navigationTimeout") ? Number(optionString(options, "navigationTimeout")) : undefined,
      viewport: parseRiddleViewport(optionString(options, "viewport")),
      timeoutSec: optionString(options, "timeout") ? Number(optionString(options, "timeout")) : undefined,
      pollAttempts: optionString(options, "pollAttempts") ? Number(optionString(options, "pollAttempts")) : undefined,
      pollIntervalMs: optionString(options, "pollIntervalMs") ? Number(optionString(options, "pollIntervalMs")) : undefined,
      exclude: optionString(options, "exclude")?.split(",").map((item) => item.trim()).filter(Boolean),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "riddle-run-script") {
    const url = optionString(options, "url");
    const scriptFile = optionString(options, "scriptFile");
    if (!url || !scriptFile) throw new Error("riddle-run-script requires --url and --script-file.");
    const result = await createRiddleApiClient(riddleClientConfig(options)).runScript({
      url,
      script: readFileSync(scriptFile, "utf-8"),
      viewport: parseRiddleViewport(optionString(options, "viewport")),
      timeoutSec: optionString(options, "timeout") ? Number(optionString(options, "timeout")) : undefined,
      strict: optionBoolean(options, "strict"),
      sync: options.sync === true ? true : undefined,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "riddle-poll") {
    const jobId = positional[1];
    if (!jobId) throw new Error("riddle-poll requires <job-id>.");
    const wait = options.wait === true;
    const result = await createRiddleApiClient(riddleClientConfig(options)).pollJob(jobId, {
      wait,
      attempts: optionString(options, "attempts") ? Number(optionString(options, "attempts")) : undefined,
      intervalMs: optionString(options, "intervalMs") ? Number(optionString(options, "intervalMs")) : undefined,
      progressEveryMs: optionString(options, "progressEveryMs") ? Number(optionString(options, "progressEveryMs")) : undefined,
      onProgress: wait && options.quiet !== true
        ? (snapshot) => {
            process.stderr.write(`${riddlePollProgressLine(snapshot)}\n`);
          }
        : undefined,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "checkpoint") {
    const statePath = optionString(options, "statePath");
    if (!statePath) throw new Error("--state-path is required.");
    const state = readRunState(statePath);
    const snapshot = readRiddleProofRunStatus(statePath);
    if (!state.checkpoint_packet) {
      throw new Error(`${statePath} has no pending checkpoint packet.`);
    }
    const responseTemplate = createCheckpointResponseTemplate(state.checkpoint_packet, {
      decision: optionString(options, "decision"),
      source_kind: optionString(options, "sourceKind") as NonNullable<RiddleProofCheckpointResponse["source"]>["kind"] || "codex",
    });
    const format = optionString(options, "format") || "json";
    if (format === "markdown" || format === "md") {
      process.stdout.write(formatCheckpointMarkdown({
        statePath,
        status: snapshot?.status || state.status,
        checkpointPacket: state.checkpoint_packet,
        runCard: snapshot?.run_card || state.run_card || null,
        responseTemplate,
      }));
      return;
    }
    if (format !== "json") throw new Error("--format must be json or markdown.");
    process.stdout.write(`${JSON.stringify({
      checkpoint_packet: state.checkpoint_packet,
      run_card: snapshot?.run_card || state.run_card || null,
      response_template: responseTemplate,
      next_commands: [
        `riddle-proof-loop respond --state-path ${statePath} --decision ${responseTemplate.decision} --summary <summary> --payload-json <file|json|->`,
        `riddle-proof-loop status --state-path ${statePath}`,
      ],
    }, null, 2)}\n`);
    return;
  }

  if (command === "run" || command === "respond") {
    const statePath = optionString(options, "statePath");
    const request = requestForRun(options);
    const response = command === "respond"
      ? optionString(options, "responseJson")
        ? readJsonValue(optionString(options, "responseJson"), "--response-json") as unknown as RiddleProofCheckpointResponse
        : checkpointResponseForFlags(statePath || "", options)
      : undefined;
    const result = await runRiddleProofEngineHarness({
      request,
      state_path: statePath,
      checkpoint_response: response,
      checkpoint_mode: checkpointModeFor(options),
      checkpoint_visibility: optionString(options, "checkpointVisibility") || "manual",
      max_iterations: optionString(options, "maxIterations") ? Number(optionString(options, "maxIterations")) : undefined,
      agent: agentFor(options),
      config: {
        stateDir: optionString(options, "stateDir"),
        riddleEngineModuleUrl: riddleEngineModuleUrlFor(options, request),
        riddleProofDir: optionString(options, "riddleProofDir"),
        defaultReviewer: optionString(options, "defaultReviewer"),
        defaultShipMode: optionString(options, "defaultShipMode") as "none" | "ship" | undefined,
      },
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.ok || result.status === "awaiting_checkpoint" ? 0 : 1;
    return;
  }

  throw new Error(`Unknown command: ${command}\n${usage()}`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
