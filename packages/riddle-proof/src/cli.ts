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
  type RiddlePollJobResult,
  type RiddlePollProgressSnapshot,
  type RiddlePollSummary,
  type RiddleClientConfig,
} from "./riddle-client";
import {
  assessRiddleProofProfileEvidence,
  buildRiddleProofProfileScript,
  collectRiddleProfileArtifactRefs,
  createRiddleProofProfileEnvironmentBlockedResult,
  createRiddleProofProfileInsufficientResult,
  deriveRiddleProofArtifactBodyAssertions,
  extractRiddleProofProfileResult,
  normalizeRiddleProofProfile,
  preflightRiddleProofProfileHttpStatusChecks,
  RIDDLE_PROOF_PROFILE_EVIDENCE_VERSION,
  profileStatusExitCode,
  resolveRiddleProofProfileTargetUrl,
  resolveRiddleProofProfileTimeoutSec,
  type RiddleProofProfile,
  type RiddleProofProfileArtifactRef,
  type RiddleProofProfileEvidence,
  type RiddleProofProfileHttpStatusPreflightResult,
  type RiddleProofProfileResult,
  type RiddleProofProfileRunner,
  type RiddleProofProfileViewport,
} from "./profile";
import type { JsonValue, RiddleProofCheckpointResponse, RiddleProofRunParams, RiddleProofRunState } from "./types";

type CliOptions = Record<string, string | boolean>;
type RiddleApiClient = ReturnType<typeof createRiddleApiClient>;

function usage() {
  return [
    "Usage:",
    "  riddle-proof-loop run --request-json <file|json|-> [--agent disabled|local] [--checkpoint-mode yield|auto]",
    "  riddle-proof-loop checkpoint --state-path <path> [--decision <decision>] [--format json|markdown]",
    "  riddle-proof-loop respond --state-path <path> --response-json <file|json|->",
    "  riddle-proof-loop respond --state-path <path> --decision <decision> --summary <text> [--payload-json <file|json|->]",
    "  riddle-proof-loop status --state-path <path>",
    "  riddle-proof-loop run-profile --profile <file|json|-> --url <base-url> [--runner riddle] [--strict true|false; default false] [--split-viewports true|false; default false] [--poll-attempts n] [--output <dir>|--output-dir <dir>] [--quiet]",
    "  riddle-proof-loop profile-body-assertions --artifact <file|url|-> --candidates-json <file|json|-> [--required-json <file|json|->] [--format json|body-contains]",
    "  riddle-proof-loop profile-http-status-preflight --profile <file|json|-> --url <base-url> [--format json|summary]",
    "  riddle-proof-loop riddle-preview-deploy <build-dir> <label> [--framework spa|static]",
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

function runProfileSplitViewportsOption(options: CliOptions) {
  return optionBoolean(options, "splitViewports") ?? false;
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

function previewFrameworkOption(options: CliOptions) {
  const framework = optionString(options, "framework") ?? "static";
  if (framework === "spa" || framework === "static") return framework;
  throw new Error("--framework must be spa or static.");
}

function readStdin() {
  return readFileSync(0, "utf-8");
}

async function readTextValue(value: string | undefined, label: string): Promise<string> {
  if (!value) throw new Error(`${label} is required.`);
  if (value === "-") return readStdin();
  if (/^https?:\/\//i.test(value)) {
    const response = await fetch(value);
    const text = await response.text();
    if (!response.ok) throw new Error(`${label} URL failed HTTP ${response.status}: ${text.slice(0, 500)}`);
    return text;
  }
  if (existsSync(value)) return readFileSync(value, "utf-8");
  throw new Error(`${label} must be a readable file path, URL, or -.`);
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
    ? ` waiting_for_submit=${formatPollDuration(snapshot.pre_submission_elapsed_ms)}${snapshot.queue_elapsed_ms !== null ? ` queued_for=${formatPollDuration(snapshot.queue_elapsed_ms)}` : ""}`
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

function profileHttpStatusPreflightSummary(result: RiddleProofProfileHttpStatusPreflightResult): string {
  const lines = [
    result.summary,
    `Profile: ${result.profile_name}`,
    `Target: ${result.target_url}`,
    `Checked: ${result.checked}`,
    `Failed: ${result.failed}`,
  ];
  for (const check of result.checks) {
    lines.push(`- ${check.ok ? "passed" : "failed"}: ${check.method} ${check.url}`);
    if (!check.ok) {
      if (check.status !== null) lines.push(`  status: ${check.status}`);
      if (check.error) lines.push(`  error: ${check.error}`);
      if (check.body_contains_missing.length) lines.push(`  missing body_contains: ${check.body_contains_missing.join(", ")}`);
      if (check.body_not_contains_found.length) lines.push(`  found body_not_contains: ${check.body_not_contains_found.join(", ")}`);
      if (check.body_not_patterns_found.length) lines.push(`  found body_not_patterns: ${check.body_not_patterns_found.join(", ")}`);
    }
  }
  return `${lines.join("\n")}\n`;
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
  ];
  if (Array.isArray(result.warnings) && result.warnings.length) {
    lines.push("## Profile Warnings", "");
    for (const warning of result.warnings.slice(0, 12)) {
      lines.push(`- ${warning}`);
    }
    if (result.warnings.length > 12) lines.push(`- ${result.warnings.length - 12} additional warning(s) omitted.`);
    lines.push("");
  }
  lines.push("## Checks", "");
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
  const linkStatusSummaryLines = profileLinkStatusSummaryMarkdown(result);
  if (linkStatusSummaryLines.length) {
    lines.push("", "## Link Status", "", ...linkStatusSummaryLines);
  }
  const httpStatusSummaryLines = profileHttpStatusSummaryMarkdown(result);
  if (httpStatusSummaryLines.length) {
    lines.push("", "## HTTP Status", "", ...httpStatusSummaryLines);
  }
  const environmentBlockerLines = profileEnvironmentBlockerMarkdown(result);
  if (environmentBlockerLines.length) {
    lines.push("", "## Environment Blocker", "", ...environmentBlockerLines);
  }
  const riddleJobLines = profileRiddleJobMarkdown(result);
  if (riddleJobLines.length) {
    lines.push("", "## Riddle Job", "", ...riddleJobLines);
  }
  if (result.artifacts.riddle_artifacts?.length) {
    lines.push("", "## Riddle Artifacts", "");
    for (const artifact of result.artifacts.riddle_artifacts.slice(0, 40)) {
      lines.push(`- ${artifact.name || artifact.kind || "artifact"}${artifact.url ? `: ${artifact.url}` : ""}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function profileRiddleJobMarkdown(result: RiddleProofProfileResult): string[] {
  const riddle = cliRecord(result.riddle);
  if (!riddle) return [];
  const jobId = cliString(riddle.job_id);
  const mode = cliString(riddle.mode);
  const jobCount = cliFiniteNumber(riddle.job_count);
  const status = cliString(riddle.status);
  const terminal = typeof riddle.terminal === "boolean" ? riddle.terminal : undefined;
  const queueElapsedMs = cliFiniteNumber(riddle.queue_elapsed_ms);
  const elapsedMs = cliFiniteNumber(riddle.elapsed_ms);
  const preSubmissionElapsedMs = cliFiniteNumber(riddle.pre_submission_elapsed_ms);
  const attempt = cliFiniteNumber(riddle.attempt);
  const attempts = cliFiniteNumber(riddle.attempts);
  const submittedAt = cliString(riddle.submitted_at);
  const completedAt = cliString(riddle.completed_at);
  const parts = [
    mode ? `mode ${markdownInlineCode(mode)}` : "",
    jobCount === undefined ? "" : `jobs ${jobCount}`,
    jobId ? `job ${markdownInlineCode(jobId)}` : "",
    status ? `status ${markdownInlineCode(status)}` : "",
    terminal === undefined ? "" : `terminal ${terminal ? "true" : "false"}`,
  ].filter(Boolean);
  const lines = parts.length ? [`- ${parts.join(", ")}`] : [];
  if (queueElapsedMs !== undefined || elapsedMs !== undefined || attempt !== undefined || attempts !== undefined) {
    lines.push(
      `- poll: queue ${formatPollDuration(queueElapsedMs)}, elapsed ${formatPollDuration(elapsedMs)}${preSubmissionElapsedMs === undefined || preSubmissionElapsedMs < 1000 ? "" : `, pre-submit ${formatPollDuration(preSubmissionElapsedMs)}`}${attempt === undefined ? "" : `, attempt ${attempt}${attempts === undefined ? "" : `/${attempts}`}`}`,
    );
  }
  if (submittedAt || completedAt) {
    lines.push(`- timing:${submittedAt ? ` submitted ${markdownInlineCode(submittedAt)}` : ""}${completedAt ? ` completed ${markdownInlineCode(completedAt)}` : ""}`);
  }
  const splitJobs = Array.isArray(riddle.split_jobs)
    ? riddle.split_jobs.map(cliRecord).filter((job): job is Record<string, unknown> => Boolean(job))
    : [];
  for (const job of splitJobs.slice(0, 12)) {
    const viewport = cliString(job.viewport) || "viewport";
    const splitJobId = cliString(job.job_id);
    const splitStatus = cliString(job.status);
    const splitTerminal = typeof job.terminal === "boolean" ? job.terminal : undefined;
    const splitElapsedMs = cliFiniteNumber(job.elapsed_ms);
    const splitPreSubmissionElapsedMs = cliFiniteNumber(job.pre_submission_elapsed_ms);
    lines.push(
      `- ${viewport}: ${[
        splitJobId ? `job ${markdownInlineCode(splitJobId)}` : "",
        splitStatus ? `status ${markdownInlineCode(splitStatus)}` : "",
        splitTerminal === undefined ? "" : `terminal ${splitTerminal ? "true" : "false"}`,
        splitElapsedMs === undefined ? "" : `elapsed ${formatPollDuration(splitElapsedMs)}`,
        splitPreSubmissionElapsedMs === undefined || splitPreSubmissionElapsedMs < 1000 ? "" : `pre-submit ${formatPollDuration(splitPreSubmissionElapsedMs)}`,
      ].filter(Boolean).join(", ") || "job metadata unavailable"}`,
    );
  }
  if (splitJobs.length > 12) lines.push(`- ${splitJobs.length - 12} additional split job(s) omitted.`);
  return lines;
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
  if (check.type === "selector_text_visible" || check.type === "selector_text_absent") {
    const textTarget = profileCheckTextTarget(evidence);
    const verb = check.type === "selector_text_absent" ? "does not contain" : "contains";
    if (selector && textTarget) return `${markdownInlineCode(selector)} ${verb} ${textTarget}`;
    if (textTarget && check.type === "selector_text_absent") return `${verb} ${textTarget}`;
    return selector ? markdownInlineCode(selector) : textTarget;
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
  if (check.type === "http_status") {
    const url = cliString(evidence.url);
    const method = cliString(evidence.method);
    const statuses = Array.isArray(evidence.allowed_statuses)
      ? evidence.allowed_statuses.map((status) => cliString(status) || String(status)).filter(Boolean)
      : [];
    const target = [method, url ? markdownInlineCode(url) : ""].filter(Boolean).join(" ");
    return statuses.length ? `${target} -> ${statuses.join("/")}` : target || undefined;
  }
  if (check.type === "link_status" || check.type === "artifact_link_status") {
    const expectedCount = cliFiniteNumber(evidence.expected_count);
    const minCount = cliFiniteNumber(evidence.min_count);
    const minBytes = cliFiniteNumber(evidence.min_bytes);
    const parts: string[] = [];
    if (expectedCount !== undefined) parts.push(`probed links = ${expectedCount}`);
    else if (minCount !== undefined) parts.push(`probed links >= ${minCount}`);
    if (minBytes !== undefined) parts.push(`bytes >= ${minBytes}`);
    if (selector && parts.length) return `${markdownInlineCode(selector)} ${parts.join(", ")}`;
    return selector ? markdownInlineCode(selector) : parts.join(", ") || undefined;
  }
  if (check.type === "no_horizontal_overflow" || check.type === "no_mobile_horizontal_overflow") {
    const maxOverflow = cliFiniteNumber(evidence.max_overflow_px);
    return maxOverflow !== undefined ? `<= ${maxOverflow}px` : undefined;
  }
  if (check.type === "no_fatal_console_errors") {
    const fatalCount = cliFiniteNumber(evidence.console_fatal_count)
      ?? cliFiniteNumber(evidence.fatal_error_count)
      ?? 0;
    const totalConsoleCount = cliFiniteNumber(evidence.total_console_fatal_count);
    const allowedConsoleCount = cliFiniteNumber(evidence.allowed_console_fatal_count);
    const parts = [`${fatalCount} unallowed fatal error${fatalCount === 1 ? "" : "s"}`];
    if (totalConsoleCount !== undefined && allowedConsoleCount !== undefined) {
      parts.push(`${allowedConsoleCount}/${totalConsoleCount} console fatal allowed`);
    }
    return parts.join(", ");
  }
  if (check.type === "no_console_warnings") {
    const warningCount = cliFiniteNumber(evidence.console_warning_count) ?? 0;
    return `${warningCount} unallowed warning${warningCount === 1 ? "" : "s"}`;
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

function cliValueLabel(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" && serialized ? serialized : String(value);
  } catch {
    return String(value);
  }
}

function cliStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())) : [];
}

type CliRouteInventoryRoute = { name?: string; path: string };

function cliRouteInventoryRoutes(value: unknown): CliRouteInventoryRoute[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (typeof entry === "string") {
      const pathValue = entry.trim();
      return pathValue ? { path: pathValue } : undefined;
    }
    const route = cliRecord(entry);
    if (!route) return undefined;
    const pathValue = cliString(route.path);
    if (!pathValue) return undefined;
    const nameValue = cliString(route.name);
    return nameValue ? { name: nameValue, path: pathValue } : { path: pathValue };
  }).filter((route): route is CliRouteInventoryRoute => Boolean(route));
}

function cliRouteInventoryRouteLabel(route: CliRouteInventoryRoute): string {
  return route.name && route.name !== route.path ? `${route.name} (${route.path})` : route.path;
}

function cliRouteInventoryRouteList(routes: CliRouteInventoryRoute[]): string {
  const visible = routes.slice(0, 12).map(cliRouteInventoryRouteLabel);
  const omitted = routes.length > 12 ? `; ${routes.length - 12} more` : "";
  return `${visible.join("; ")}${omitted}`;
}

function cliRouteInventorySourceScopeLabel(value: unknown): string | undefined {
  const scope = cliString(value);
  if (scope === "expected_routes") return "expected routes";
  if (scope === "route_path_prefix") return "route path prefix";
  return scope;
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

function profileCliDiagnosticLine(result: RiddleProofProfileResult): string | undefined {
  if (result.status !== "environment_blocked") return undefined;

  const blocker = cliRecord(result.environment_blocker);
  if (blocker?.reason === "insufficient_balance") {
    const requiredSeconds = cliFiniteNumber(blocker.required_seconds);
    const availableSeconds = cliFiniteNumber(blocker.available_seconds);
    const deficitSeconds = cliFiniteNumber(blocker.deficit_seconds);
    const parts = [
      requiredSeconds === undefined ? "" : `required=${requiredSeconds}s`,
      availableSeconds === undefined ? "" : `available=${availableSeconds}s`,
      deficitSeconds === undefined ? "" : `deficit=${deficitSeconds}s`,
    ].filter(Boolean);
    return `[riddle-profile] environment_blocked insufficient_balance${parts.length ? ` ${parts.join(" ")}` : ""}`;
  }

  const source = cliString(blocker?.source);
  const endpoint = cliString(blocker?.endpoint);
  const httpStatus = cliFiniteNumber(blocker?.http_status);
  if (source || endpoint || httpStatus !== undefined) {
    return `[riddle-profile] environment_blocked${source ? ` source=${source}` : ""}${endpoint ? ` endpoint=${endpoint}` : ""}${httpStatus === undefined ? "" : ` http_status=${httpStatus}`}`;
  }

  return `[riddle-profile] environment_blocked ${result.summary}`;
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
  const finalScreenshotCount = cliFiniteNumber(setupSummary.final_screenshot_count)
    ?? viewports.reduce((sum, viewport) => sum + (cliString(viewport.final_screenshot) || cliString(viewport.screenshot_label) ? 1 : 0), 0);
  const finalScreenshotMode = cliString(setupSummary.final_screenshot_mode);
  const setupScreenshots = viewports.reduce((sum, viewport) => {
    const labels = Array.isArray(viewport.setup_screenshots) ? viewport.setup_screenshots : [];
    return sum + labels.filter((label) => typeof label === "string" && label.trim()).length;
  }, 0);
  const clickedTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.clicked_total) || 0), 0);
  const clickCountActionTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.click_count_action_total) || 0), 0);
  const clickCountValueTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.click_count_value_total) || 0), 0);
  const windowCallTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.window_call_total) || 0), 0);
  const windowCallStoredTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.window_call_stored_total) || 0), 0);
  const windowCallCapturedTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.window_call_captured_total) || 0), 0);
  const windowEvalTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.window_eval_total) || 0), 0);
  const windowEvalStoredTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.window_eval_stored_total) || 0), 0);
  const windowEvalCapturedTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.window_eval_captured_total) || 0), 0);
  const windowCallUntilTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.window_call_until_total) || 0), 0);
  const windowCallUntilCallTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.window_call_until_call_total) || 0), 0);
  const rangeValueTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.set_range_value_total) || 0), 0);
  const failedTotal = viewports.reduce((sum, viewport) => (
    sum + (Array.isArray(viewport.failed) ? viewport.failed.length : 0)
  ), 0);

  const lines = [
    `- setup actions: ${declaredActions === undefined ? "unknown" : declaredActions} declared, ${totalResults} recorded result(s) across ${viewports.length} viewport(s)`,
    ...(finalScreenshotMode ? [`- final screenshots: ${finalScreenshotCount}, mode ${finalScreenshotMode}`] : []),
    `- setup screenshots: ${setupScreenshots}`,
    `- clicked targets: ${clickedTotal}${failedTotal ? `; failed setup actions: ${failedTotal}` : ""}`,
  ];
  if (clickCountActionTotal) {
    lines.push(`- click counts: ${clickCountActionTotal} action(s), click_count total ${clickCountValueTotal}`);
  }
  if (windowCallTotal) {
    lines.push(`- window_call: ${windowCallTotal} action(s), stored returns ${windowCallStoredTotal}, captured returns ${windowCallCapturedTotal}`);
  }
  if (windowEvalTotal) {
    lines.push(`- window_eval: ${windowEvalTotal} action(s), stored returns ${windowEvalStoredTotal}, captured returns ${windowEvalCapturedTotal}`);
  }
  if (windowCallUntilTotal) {
    lines.push(`- window_call_until: ${windowCallUntilTotal} action(s), call_count total ${windowCallUntilCallTotal}`);
  }
  if (rangeValueTotal) {
    lines.push(`- set_range_value: ${rangeValueTotal} action(s)`);
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
    const windowCallActions = cliFiniteNumber(viewport.window_call_total) || 0;
    const windowCallStored = cliFiniteNumber(viewport.window_call_stored_total) || 0;
    const windowCallCaptured = cliFiniteNumber(viewport.window_call_captured_total) || 0;
    const windowEvalActions = cliFiniteNumber(viewport.window_eval_total) || 0;
    const windowEvalStored = cliFiniteNumber(viewport.window_eval_stored_total) || 0;
    const windowEvalCaptured = cliFiniteNumber(viewport.window_eval_captured_total) || 0;
    const windowCallUntilActions = cliFiniteNumber(viewport.window_call_until_total) || 0;
    const windowCallUntilCalls = cliFiniteNumber(viewport.window_call_until_call_total) || 0;
    const rangeValueActions = cliFiniteNumber(viewport.set_range_value_total) || 0;
    const observedPath = cliString(viewport.observed_path);
    lines.push(`- ${name}: ${ok}, ${resultCount} result(s), ${screenshotCount} setup screenshot(s), ${clicked} click(s)${clickCountActions ? `, ${clickCountActions} click_count action(s)` : ""}${rangeValueActions ? `, ${rangeValueActions} set_range_value action(s)` : ""}${windowCallActions ? `, ${windowCallActions} window_call action(s), ${windowCallStored} stored return(s), ${windowCallCaptured} captured return(s)` : ""}${windowEvalActions ? `, ${windowEvalActions} window_eval action(s), ${windowEvalStored} stored return(s), ${windowEvalCaptured} captured return(s)` : ""}${windowCallUntilActions ? `, ${windowCallUntilActions} window_call_until action(s), ${windowCallUntilCalls} call(s)` : ""}${observedPath ? `, path ${observedPath}` : ""}`);
  }
  const rangeValueDetails = viewports.flatMap((viewport) => {
    const name = cliString(viewport.name) || "viewport";
    const receipts = Array.isArray(viewport.set_range_value)
      ? viewport.set_range_value.map(cliRecord).filter((item): item is Record<string, unknown> => Boolean(item))
      : [];
    return receipts.map((receipt) => ({ name, receipt }));
  });
  for (const { name, receipt } of rangeValueDetails.slice(0, 12)) {
    const selector = cliString(receipt.selector) || "input[type=range]";
    const requested = cliValueLabel(receipt.requested_value);
    const actual = cliValueLabel(receipt.actual_value);
    const before = cliValueLabel(receipt.before_value);
    const valueAsNumber = cliFiniteNumber(receipt.value_as_number);
    const min = cliValueLabel(receipt.min);
    const max = cliValueLabel(receipt.max);
    const step = cliValueLabel(receipt.step);
    const ok = receipt.ok === false ? "failed" : "ok";
    const reason = cliString(receipt.reason);
    lines.push(`- ${name} set_range_value: ${ok}, ${markdownInlineCode(selector)}${requested === undefined ? "" : ` requested ${markdownInlineCode(requested, 80)}`}${actual === undefined ? "" : ` -> ${markdownInlineCode(actual, 80)}`}${before === undefined ? "" : `, before ${markdownInlineCode(before, 80)}`}${valueAsNumber === undefined ? "" : `, number ${valueAsNumber}`}${min === undefined && max === undefined ? "" : `, range ${min === undefined ? "?" : markdownInlineCode(min, 40)}..${max === undefined ? "?" : markdownInlineCode(max, 40)}`}${step === undefined ? "" : ` step ${markdownInlineCode(step, 40)}`}${reason ? `, reason ${markdownInlineCode(reason, 100)}` : ""}`);
  }
  if (rangeValueDetails.length > 12) lines.push(`- ${rangeValueDetails.length - 12} additional set_range_value receipt(s) omitted.`);
  const windowCallDetails = viewports.flatMap((viewport) => {
    const name = cliString(viewport.name) || "viewport";
    const receipts = Array.isArray(viewport.window_call)
      ? viewport.window_call.map(cliRecord).filter((item): item is Record<string, unknown> => Boolean(item))
      : [];
    return receipts.map((receipt) => ({ name, receipt }));
  });
  for (const { name, receipt } of windowCallDetails.slice(0, 12)) {
    const path = cliString(receipt.path) || "window_function";
    const storedTo = cliString(receipt.return_stored_to);
    const returned = cliValueLabel(receipt.returned);
    const expected = cliValueLabel(receipt.expected_return);
    const captured = receipt.return_captured === true ? "captured" : receipt.return_captured === false ? "not captured" : "capture unknown";
    const ok = receipt.ok === false ? "failed" : "ok";
    const reason = cliString(receipt.reason);
    lines.push(`- ${name} window_call: ${ok}, ${markdownInlineCode(path)}${storedTo ? `, stored ${markdownInlineCode(storedTo)}` : ""}, return ${captured}${expected === undefined ? "" : `, expected ${markdownInlineCode(expected, 80)}`}${returned === undefined ? "" : `, returned ${markdownInlineCode(returned, 80)}`}${reason ? `, reason ${markdownInlineCode(reason, 100)}` : ""}`);
  }
  if (windowCallDetails.length > 12) lines.push(`- ${windowCallDetails.length - 12} additional window_call receipt(s) omitted.`);
  const windowEvalDetails = viewports.flatMap((viewport) => {
    const name = cliString(viewport.name) || "viewport";
    const receipts = Array.isArray(viewport.window_eval)
      ? viewport.window_eval.map(cliRecord).filter((item): item is Record<string, unknown> => Boolean(item))
      : [];
    return receipts.map((receipt) => ({ name, receipt }));
  });
  for (const { name, receipt } of windowEvalDetails.slice(0, 12)) {
    const scriptLength = cliFiniteNumber(receipt.script_length);
    const storedTo = cliString(receipt.return_stored_to);
    const returned = cliValueLabel(receipt.returned);
    const expected = cliValueLabel(receipt.expected_return);
    const captured = receipt.return_captured === true ? "captured" : receipt.return_captured === false ? "not captured" : "capture unknown";
    const ok = receipt.ok === false ? "failed" : "ok";
    const reason = cliString(receipt.reason);
    lines.push(`- ${name} window_eval: ${ok}${scriptLength === undefined ? "" : `, script ${scriptLength} chars`}${storedTo ? `, stored ${markdownInlineCode(storedTo)}` : ""}, return ${captured}${expected === undefined ? "" : `, expected ${markdownInlineCode(expected, 80)}`}${returned === undefined ? "" : `, returned ${markdownInlineCode(returned, 80)}`}${reason ? `, reason ${markdownInlineCode(reason, 100)}` : ""}`);
  }
  if (windowEvalDetails.length > 12) lines.push(`- ${windowEvalDetails.length - 12} additional window_eval receipt(s) omitted.`);
  const windowCallUntilDetails = viewports.flatMap((viewport) => {
    const name = cliString(viewport.name) || "viewport";
    const receipts = Array.isArray(viewport.window_call_until)
      ? viewport.window_call_until.map(cliRecord).filter((item): item is Record<string, unknown> => Boolean(item))
      : [];
    return receipts.map((receipt) => ({ name, receipt }));
  });
  for (const { name, receipt } of windowCallUntilDetails.slice(0, 12)) {
    const path = cliString(receipt.path) || "window_function";
    const untilPath = cliString(receipt.until_path) || "until_path";
    const expected = cliValueLabel(receipt.until_expected_value);
    const actual = cliValueLabel(receipt.until_value);
    const callCount = cliFiniteNumber(receipt.call_count);
    const maxCalls = cliFiniteNumber(receipt.max_calls);
    const ok = receipt.ok === false ? "failed" : "ok";
    const reason = cliString(receipt.reason);
    const callText = callCount === undefined
      ? ""
      : ` in ${callCount}${maxCalls === undefined ? "" : `/${maxCalls}`} call(s)`;
    lines.push(`- ${name} window_call_until: ${ok}, ${markdownInlineCode(path)} until ${markdownInlineCode(untilPath)}${expected === undefined ? "" : ` == ${markdownInlineCode(expected, 80)}`}${callText}${actual === undefined ? "" : `, observed ${markdownInlineCode(actual, 80)}`}${reason ? `, reason ${markdownInlineCode(reason, 100)}` : ""}`);
  }
  if (windowCallUntilDetails.length > 12) lines.push(`- ${windowCallUntilDetails.length - 12} additional window_call_until receipt(s) omitted.`);
  const failedDetails = viewports.flatMap((viewport) => {
    const name = cliString(viewport.name) || "viewport";
    const failed = Array.isArray(viewport.failed)
      ? viewport.failed.map(cliRecord).filter((item): item is Record<string, unknown> => Boolean(item))
      : [];
    return failed.map((failure) => ({ name, failure }));
  });
  for (const { name, failure } of failedDetails.slice(0, 8)) {
    const action = cliString(failure.action) || "setup_action";
    const selector = cliString(failure.selector);
    const reason = cliString(failure.reason);
    const caseInsensitiveText = cliString(failure.case_insensitive_text);
    lines.push(`- failed ${name}: ${action}${selector ? ` ${markdownInlineCode(selector)}` : ""}${reason ? ` reason ${markdownInlineCode(reason)}` : ""}${caseInsensitiveText ? `; case-insensitive sample ${markdownInlineCode(caseInsensitiveText, 140)}` : ""}`);
  }
  if (failedDetails.length > 8) lines.push(`- ${failedDetails.length - 8} additional failed setup action(s) omitted.`);
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
    const sourceCandidateCount = cliFiniteNumber(evidence.source_candidate_count);
    const sourceCandidateUniqueLinkCount = cliFiniteNumber(evidence.source_candidate_unique_link_count);
    const sourceScopeLabel = cliRouteInventorySourceScopeLabel(evidence.source_link_scope);
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

    const expectedRoutes = cliRouteInventoryRoutes(evidence.expected_routes);
    if (expectedRoutes.length) {
      lines.push(`- ${label} expected routes: ${cliRouteInventoryRouteList(expectedRoutes)}`);
    }

    if (sourceScopeLabel || sourceCandidateCount !== undefined) {
      const candidateText = sourceCandidateCount === undefined
        ? ""
        : `; selector candidates ${sourceCandidateCount}${sourceCandidateUniqueLinkCount === undefined ? "" : ` (${sourceCandidateUniqueLinkCount} unique)`}`;
      lines.push(`- ${label} source scope: ${sourceScopeLabel || "unknown"}${candidateText}`);
    }

    for (const viewport of viewports.slice(0, 8)) {
      const viewportName = cliString(viewport.viewport) || cliString(viewport.name) || "viewport";
      const viewportSourceLinkCount = cliFiniteNumber(viewport.source_link_count);
      const viewportSourceUniqueLinkCount = cliFiniteNumber(viewport.source_unique_link_count);
      const viewportSourceCandidateCount = cliFiniteNumber(viewport.source_candidate_count);
      const viewportSourceCandidateUniqueLinkCount = cliFiniteNumber(viewport.source_candidate_unique_link_count);
      const viewportDirectRouteCount = cliFiniteNumber(viewport.direct_route_count);
      const viewportClickthroughCount = cliFiniteNumber(viewport.clickthrough_count);
      const viewportFailureCount = cliFiniteNumber(viewport.failure_count) || 0;
      lines.push(
        `- ${label} ${viewportName}: source ${viewportSourceLinkCount ?? "unknown"}${viewportSourceUniqueLinkCount === undefined ? "" : ` (${viewportSourceUniqueLinkCount} unique)`}${viewportSourceCandidateCount === undefined ? "" : `, selector candidates ${viewportSourceCandidateCount}${viewportSourceCandidateUniqueLinkCount === undefined ? "" : ` (${viewportSourceCandidateUniqueLinkCount} unique)`}`}, direct ${viewportDirectRouteCount ?? "unknown"}, clickthrough ${viewportClickthroughCount ?? "unknown"}, failures ${viewportFailureCount}`,
      );
    }
    if (viewports.length > 8) lines.push(`- ${label}: ${viewports.length - 8} additional viewport(s) omitted from route inventory summary.`);
  }

  return lines;
}

function profileLinkStatusSummaryMarkdown(result: RiddleProofProfileResult): string[] {
  const linkStatusChecks = result.checks.filter((check) => check.type === "link_status" || check.type === "artifact_link_status");
  const lines: string[] = [];

  for (const check of linkStatusChecks) {
    const evidence = cliRecord(check.evidence);
    if (!evidence) continue;
    const label = check.label || check.type;
    const selector = cliString(evidence.selector);
    const viewports = Array.isArray(evidence.viewports)
      ? evidence.viewports.map(cliRecord).filter((viewport): viewport is Record<string, unknown> => Boolean(viewport))
      : [];
    const totals = viewports.map((viewport) => cliFiniteNumber(viewport.total_count)).filter((count): count is number => count !== undefined);
    const discoveredTotals = viewports.map((viewport) => cliFiniteNumber(viewport.discovered_count)).filter((count): count is number => count !== undefined);
    const okTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.ok_count) || 0), 0);
    const failedTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.failed_count) || 0), 0);
    const truncatedTotal = viewports.filter((viewport) => viewport.truncated === true).length;
    const omittedTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.omitted_result_count) || 0), 0);
    const minBytes = cliFiniteNumber(evidence.min_bytes);
    const allowedContentTypes = Array.isArray(evidence.allowed_content_types)
      ? evidence.allowed_content_types.map(cliString).filter((value): value is string => Boolean(value))
      : [];
    const countText = totals.length ? totals.join("/") : "unknown";
    const discoveredText = discoveredTotals.length && discoveredTotals.some((count, index) => count !== totals[index])
      ? `, discovered ${discoveredTotals.join("/")}`
      : "";
    lines.push(
      `- ${label}${selector ? ` ${markdownInlineCode(selector)}` : ""}: probed links ${countText}${discoveredText}, ok ${okTotal}, failures ${failedTotal}${omittedTotal ? `, compacted ${omittedTotal} result row(s)` : ""}${truncatedTotal ? `, truncated viewports ${truncatedTotal}` : ""}${minBytes !== undefined ? `, min bytes ${minBytes}` : ""}${allowedContentTypes.length ? `, content types ${allowedContentTypes.map((value) => markdownInlineCode(value)).join(", ")}` : ""}`,
    );
  }

  return lines;
}

function profileHttpStatusAssertionCount(
  viewports: Record<string, unknown>[],
  field: string,
  expected: string[],
  passValue: boolean,
): { passed: number; total: number } | undefined {
  if (!expected.length || !viewports.length) return undefined;
  let passed = 0;
  for (const viewport of viewports) {
    const observed = cliRecord(viewport[field]);
    for (const value of expected) {
      if (observed?.[value] === passValue) passed += 1;
    }
  }
  return { passed, total: expected.length * viewports.length };
}

function profileHttpStatusAssertionKeys(
  evidence: Record<string, unknown>,
  viewports: Record<string, unknown>[],
  field: string,
): string[] {
  const explicit = cliStringArray(evidence[field]);
  if (explicit.length) return explicit;
  const keys = new Set<string>();
  for (const viewport of viewports) {
    const observed = cliRecord(viewport[field]);
    if (!observed) continue;
    for (const key of Object.keys(observed)) {
      if (key) keys.add(key);
    }
  }
  return [...keys];
}

function profileHttpStatusJsonAssertionCount(
  viewports: Record<string, unknown>[],
): { passed: number; total: number } | undefined {
  if (!viewports.length) return undefined;
  let passed = 0;
  let total = 0;
  for (const viewport of viewports) {
    if (!Array.isArray(viewport.body_json_assertions)) continue;
    for (const assertion of viewport.body_json_assertions) {
      const record = cliRecord(assertion);
      if (!record) continue;
      total += 1;
      if (record.ok === true) passed += 1;
    }
  }
  return total ? { passed, total } : undefined;
}

function profileHttpStatusSummaryMarkdown(result: RiddleProofProfileResult): string[] {
  const httpStatusChecks = result.checks.filter((check) => check.type === "http_status");
  const lines: string[] = [];

  for (const check of httpStatusChecks) {
    const evidence = cliRecord(check.evidence);
    if (!evidence) continue;
    const label = check.label || check.type;
    const url = cliString(evidence.url);
    const method = cliString(evidence.method) || "GET";
    const viewports = Array.isArray(evidence.viewports)
      ? evidence.viewports.map(cliRecord).filter((viewport): viewport is Record<string, unknown> => Boolean(viewport))
      : [];
    const statuses = viewports
      .map((viewport) => cliFiniteNumber(viewport.status))
      .map((status) => status === undefined ? "error" : String(status));
    const failedTotal = Array.isArray(evidence.failures) ? evidence.failures.length : 0;
    const bodyContains = profileHttpStatusAssertionCount(
      viewports,
      "body_contains",
      profileHttpStatusAssertionKeys(evidence, viewports, "body_contains"),
      true,
    );
    const bodyNotContains = profileHttpStatusAssertionCount(
      viewports,
      "body_not_contains",
      profileHttpStatusAssertionKeys(evidence, viewports, "body_not_contains"),
      false,
    );
    const bodyNotPatterns = profileHttpStatusAssertionCount(
      viewports,
      "body_not_patterns",
      profileHttpStatusAssertionKeys(evidence, viewports, "body_not_patterns"),
      false,
    );
    const bodyJsonAssertions = profileHttpStatusJsonAssertionCount(viewports);
    const bodyParts = [
      bodyContains ? `body_contains ${bodyContains.passed}/${bodyContains.total}` : "",
      bodyNotContains ? `body_not_contains clean ${bodyNotContains.passed}/${bodyNotContains.total}` : "",
      bodyNotPatterns ? `body_not_patterns clean ${bodyNotPatterns.passed}/${bodyNotPatterns.total}` : "",
      bodyJsonAssertions ? `body_json_assertions ${bodyJsonAssertions.passed}/${bodyJsonAssertions.total}` : "",
    ].filter(Boolean);
    lines.push(
      `- ${label}: ${method}${url ? ` ${markdownInlineCode(url)}` : ""}, statuses ${statuses.length ? statuses.join("/") : "unknown"}${bodyParts.length ? `, ${bodyParts.join(", ")}` : ""}, failures ${failedTotal}`,
    );
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
    poll?: RiddlePollSummary;
    artifacts?: RiddleProofProfileArtifactRef[];
  },
): RiddleProofProfileResult {
  const poll = input.poll;
  return {
    ...result,
    riddle: {
      ...(result.riddle || {}),
      job_id: input.job_id || result.riddle?.job_id,
      status: input.status ?? result.riddle?.status,
      terminal: input.terminal ?? result.riddle?.terminal,
      created_at: poll?.created_at ?? result.riddle?.created_at,
      submitted_at: poll?.submitted_at ?? result.riddle?.submitted_at,
      completed_at: poll?.completed_at ?? result.riddle?.completed_at,
      queue_elapsed_ms: poll?.queue_elapsed_ms ?? result.riddle?.queue_elapsed_ms,
      pre_submission_elapsed_ms: poll?.pre_submission_elapsed_ms ?? result.riddle?.pre_submission_elapsed_ms,
      elapsed_ms: poll?.elapsed_ms ?? result.riddle?.elapsed_ms,
      attempt: poll?.attempt ?? result.riddle?.attempt,
      attempts: poll?.attempts ?? result.riddle?.attempts,
      timed_out: poll?.timed_out ?? result.riddle?.timed_out,
    },
    artifacts: {
      ...result.artifacts,
      riddle_artifacts: input.artifacts || result.artifacts.riddle_artifacts,
    },
  };
}

function riddleMetadataFromPoll(
  jobId: string,
  poll: RiddlePollJobResult,
): RiddleProofProfileResult["riddle"] {
  return {
    job_id: jobId,
    status: poll.status,
    terminal: poll.terminal,
    created_at: poll.poll?.created_at,
    submitted_at: poll.poll?.submitted_at,
    completed_at: poll.poll?.completed_at,
    queue_elapsed_ms: poll.poll?.queue_elapsed_ms,
    pre_submission_elapsed_ms: poll.poll?.pre_submission_elapsed_ms,
    elapsed_ms: poll.poll?.elapsed_ms,
    attempt: poll.poll?.attempt,
    attempts: poll.poll?.attempts,
    timed_out: poll.poll?.timed_out,
  };
}

interface SplitViewportRunResult {
  viewport: RiddleProofProfileViewport;
  profile: RiddleProofProfile;
  result: RiddleProofProfileResult;
}

function profileForSplitViewport(profile: RiddleProofProfile, viewport: RiddleProofProfileViewport): RiddleProofProfile {
  return {
    ...profile,
    name: `${profile.name}-${viewport.name || `${viewport.width}x${viewport.height}`}`,
    target: {
      ...profile.target,
      viewports: [viewport],
    },
    metadata: {
      ...(profile.metadata || {}),
      split_parent_profile: profile.name,
      split_viewport: viewport.name,
    },
  };
}

function safeProfileOutputSegment(value: string) {
  const safe = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return safe || "viewport";
}

function splitViewportOutputDir(outputDir: string, viewportName: string, seen: Map<string, number>) {
  const base = safeProfileOutputSegment(viewportName);
  const count = seen.get(base) || 0;
  seen.set(base, count + 1);
  return path.join(outputDir, count ? `${base}-${count + 1}` : base);
}

function splitViewportArtifactRefs(input: SplitViewportRunResult): RiddleProofProfileArtifactRef[] {
  return (input.result.artifacts.riddle_artifacts || []).map((artifact) => ({
    ...artifact,
    name: `${safeProfileOutputSegment(input.viewport.name)}/${artifact.name || artifact.kind || "artifact"}`,
  }));
}

function sumDefinedNumbers(values: Array<number | null | undefined>) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) : undefined;
}

function splitViewportRiddleMetadata(childRuns: SplitViewportRunResult[]): RiddleProofProfileResult["riddle"] {
  const splitJobs = childRuns.map(({ viewport, result }) => ({
    viewport: viewport.name,
    job_id: result.riddle?.job_id,
    status: result.riddle?.status,
    terminal: result.riddle?.terminal,
    queue_elapsed_ms: result.riddle?.queue_elapsed_ms,
    pre_submission_elapsed_ms: result.riddle?.pre_submission_elapsed_ms,
    elapsed_ms: result.riddle?.elapsed_ms,
    attempt: result.riddle?.attempt,
    attempts: result.riddle?.attempts,
    timed_out: result.riddle?.timed_out,
  }));
  return {
    mode: "split-viewports",
    job_count: childRuns.length,
    status: "split-viewports",
    terminal: childRuns.every(({ result }) => result.riddle?.terminal !== false),
    queue_elapsed_ms: sumDefinedNumbers(splitJobs.map((job) => job.queue_elapsed_ms)),
    pre_submission_elapsed_ms: sumDefinedNumbers(splitJobs.map((job) => job.pre_submission_elapsed_ms)),
    elapsed_ms: sumDefinedNumbers(splitJobs.map((job) => job.elapsed_ms)),
    split_jobs: splitJobs,
  };
}

function latestCapturedAt(evidences: RiddleProofProfileEvidence[]) {
  let latest = "";
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const evidence of evidences) {
    const parsed = Date.parse(evidence.captured_at);
    if (Number.isFinite(parsed) && parsed >= latestMs) {
      latest = evidence.captured_at;
      latestMs = parsed;
    }
  }
  return latest || new Date().toISOString();
}

function splitViewportDomSummary(
  profile: RiddleProofProfile,
  childRuns: SplitViewportRunResult[],
  evidence: Pick<RiddleProofProfileEvidence, "viewports" | "console" | "page_errors" | "network_mocks">,
): Record<string, JsonValue> {
  return {
    split_viewports: true,
    expected_viewport_count: profile.target.viewports.length,
    viewport_count: evidence.viewports.length,
    child_result_count: childRuns.length,
    child_statuses: childRuns.map(({ viewport, result }) => ({
      viewport: viewport.name,
      profile_name: result.profile_name,
      status: result.status,
      job_id: result.riddle?.job_id || null,
    })),
    routes: evidence.viewports.map((viewport) => ({
      viewport: viewport.name,
      requested: viewport.route.requested,
      observed: viewport.route.observed,
      matched: viewport.route.matched,
      http_status: viewport.route.http_status ?? null,
    })),
    titles: evidence.viewports.map((viewport) => viewport.title).filter((title): title is string => Boolean(title)),
    overflow_px: evidence.viewports.map((viewport) => viewport.overflow_px ?? null),
    bounds_overflow_px: evidence.viewports.map((viewport) => viewport.bounds_overflow_px ?? null),
    overflow_offender_counts: evidence.viewports.map((viewport) => (viewport.overflow_offenders || []).length),
    console_event_count: evidence.console.events.length,
    console_fatal_count: evidence.console.fatal_count,
    page_error_count: evidence.page_errors.length,
    network_mock_count: (profile.target.network_mocks || []).length,
    network_mock_hit_count: (evidence.network_mocks || []).filter((event) => event.ok !== false).length,
  };
}

function aggregateSplitViewportEvidence(
  profile: RiddleProofProfile,
  childRuns: SplitViewportRunResult[],
): RiddleProofProfileEvidence {
  const evidences = childRuns
    .map(({ result }) => result.evidence)
    .filter((evidence): evidence is RiddleProofProfileEvidence => Boolean(evidence));
  const viewports = evidences.flatMap((evidence) => evidence.viewports || []);
  const consoleEvents = evidences.flatMap((evidence) => evidence.console?.events || []);
  const pageErrors = evidences.flatMap((evidence) => evidence.page_errors || []);
  const networkMocks = evidences.flatMap((evidence) => evidence.network_mocks || []);
  const evidence: RiddleProofProfileEvidence = {
    version: RIDDLE_PROOF_PROFILE_EVIDENCE_VERSION,
    profile_name: profile.name,
    target_url: resolveRiddleProofProfileTargetUrl(profile),
    baseline_policy: profile.baseline_policy,
    captured_at: latestCapturedAt(evidences),
    viewports,
    console: {
      events: consoleEvents,
      fatal_count: evidences.reduce((sum, item) => sum + (item.console?.fatal_count || 0), 0),
    },
    page_errors: pageErrors,
    network_mocks: networkMocks.length ? networkMocks : undefined,
  };
  evidence.dom_summary = splitViewportDomSummary(profile, childRuns, evidence);
  return evidence;
}

function splitViewportBlockedMessage(childRuns: SplitViewportRunResult[]) {
  const blocked = childRuns
    .filter(({ result }) => !result.evidence || result.status === "environment_blocked" || result.status === "configuration_error")
    .map(({ viewport, result }) => `${viewport.name}: ${result.status}${result.error ? ` (${result.error})` : ""}`);
  return `Split viewport run did not produce reliable evidence for ${blocked.join("; ")}.`;
}

function withSplitViewportWarnings(profile: RiddleProofProfile, result: RiddleProofProfileResult): RiddleProofProfileResult {
  const warnings: string[] = [];
  if (profile.target.network_mocks?.length) {
    warnings.push("Split viewport mode runs each viewport in a separate Riddle job; global network mock sequencing is assessed from aggregated events.");
  }
  if (!warnings.length) return result;
  return {
    ...result,
    warnings: [...new Set([...(result.warnings || []), ...warnings])],
  };
}

async function runSingleRiddleProfileForCli(
  profile: RiddleProofProfile,
  options: CliOptions,
  input: { client: RiddleApiClient; runner: RiddleProofProfileRunner },
): Promise<RiddleProofProfileResult> {
  const { client, runner } = input;
  const targetUrl = resolveRiddleProofProfileTargetUrl(profile);
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
      riddle: riddleMetadataFromPoll(jobId, poll),
      artifacts,
    });
  }

  const artifactResult = await profileResultFromRiddleArtifacts(profile, artifacts, [poll.job, poll.artifacts, created]);
  if (!artifactResult) {
    return createRiddleProofProfileInsufficientResult({
      profile,
      runner,
      riddle: riddleMetadataFromPoll(jobId, poll),
      artifacts,
    });
  }
  return withRiddleMetadata(artifactResult, {
    job_id: jobId,
    status: poll.status,
    terminal: poll.terminal,
    poll: poll.poll,
    artifacts,
  });
}

async function runSplitViewportProfileForCli(
  profile: RiddleProofProfile,
  options: CliOptions,
  input: { client: RiddleApiClient; runner: RiddleProofProfileRunner },
): Promise<RiddleProofProfileResult> {
  const outputDir = profileOutputDirOption(options);
  const seenOutputNames = new Map<string, number>();
  const childRuns: SplitViewportRunResult[] = [];
  for (const viewport of profile.target.viewports) {
    const childProfile = profileForSplitViewport(profile, viewport);
    const result = await runSingleRiddleProfileForCli(childProfile, options, input);
    if (outputDir) {
      writeProfileOutput(splitViewportOutputDir(outputDir, viewport.name, seenOutputNames), result);
    }
    childRuns.push({ viewport, profile: childProfile, result });
  }

  const artifacts = childRuns.flatMap(splitViewportArtifactRefs);
  const blocked = childRuns.filter(({ result }) => !result.evidence || result.status === "environment_blocked" || result.status === "configuration_error");
  if (blocked.length) {
    return createRiddleProofProfileEnvironmentBlockedResult({
      profile,
      runner: input.runner,
      error: splitViewportBlockedMessage(childRuns),
      riddle: splitViewportRiddleMetadata(childRuns),
      artifacts,
    });
  }

  const evidence = aggregateSplitViewportEvidence(profile, childRuns);
  const result = assessRiddleProofProfileEvidence(profile, evidence, {
    runner: input.runner,
    riddle: splitViewportRiddleMetadata(childRuns),
    artifacts,
  });
  return withSplitViewportWarnings(profile, result);
}

async function runProfileForCli(profile: RiddleProofProfile, options: CliOptions): Promise<RiddleProofProfileResult> {
  const runner = (optionString(options, "runner") || "riddle") as RiddleProofProfileRunner;
  if (runner !== "riddle") {
    throw new Error(`Unsupported --runner ${runner}. The current CLI supports --runner riddle.`);
  }
  const client = createRiddleApiClient(riddleClientConfig(options));
  if (runProfileSplitViewportsOption(options) && profile.target.viewports.length > 1) {
    return runSplitViewportProfileForCli(profile, options, { client, runner });
  }
  return runSingleRiddleProfileForCli(profile, options, { client, runner });
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
    const diagnosticLine = profileCliDiagnosticLine(result);
    if (diagnosticLine && optionBoolean(options, "quiet") !== true) {
      process.stderr.write(`${diagnosticLine}\n`);
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = profileStatusExitCode(profile, result.status);
    return;
  }

  if (command === "profile-http-status-preflight") {
    const profile = normalizeProfileForCli(options);
    const result = await preflightRiddleProofProfileHttpStatusChecks(profile);
    const format = optionString(options, "format") || "json";
    if (format === "summary") {
      process.stdout.write(profileHttpStatusPreflightSummary(result));
    } else if (format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      throw new Error("--format must be json or summary.");
    }
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "profile-body-assertions") {
    const artifactText = await readTextValue(optionString(options, "artifact") ?? optionString(options, "input"), "--artifact");
    const candidates = readOptionalJsonStringArray(optionString(options, "candidatesJson") ?? optionString(options, "candidateJson"), "--candidates-json") ?? [];
    const required = readOptionalJsonStringArray(optionString(options, "requiredJson"), "--required-json");
    if (!candidates.length && !required?.length) {
      throw new Error("--candidates-json or --required-json must provide at least one snippet.");
    }
    const result = deriveRiddleProofArtifactBodyAssertions({
      artifact_text: artifactText,
      candidates,
      required,
    });
    const format = optionString(options, "format") || "json";
    if (format === "body-contains") {
      process.stdout.write(`${JSON.stringify(result.body_contains, null, 2)}\n`);
    } else if (format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      throw new Error("--format must be json or body-contains.");
    }
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "riddle-preview-deploy") {
    const buildDir = positional[1];
    const label = positional[2];
    const result = await createRiddleApiClient(riddleClientConfig(options)).deployPreview(buildDir, label, previewFrameworkOption(options));
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
