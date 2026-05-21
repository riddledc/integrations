#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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
  isTerminalRiddleJobStatus,
  parseRiddleViewport,
  type RiddlePollJobResult,
  type RiddlePollJobOptions,
  type RiddlePollProgressSnapshot,
  type RiddlePollSummary,
  type RiddleBalanceResult,
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

const RIDDLE_PROFILE_BALANCE_PREFLIGHT_MIN_SECONDS_PER_JOB = 30;

function usage() {
  return [
    "Usage:",
    "  riddle-proof-loop run --request-json <file|json|-> [--agent disabled|local] [--checkpoint-mode yield|auto]",
    "  riddle-proof-loop checkpoint --state-path <path> [--decision <decision>] [--format json|markdown]",
    "  riddle-proof-loop respond --state-path <path> --response-json <file|json|->",
    "  riddle-proof-loop respond --state-path <path> --decision <decision> --summary <text> [--payload-json <file|json|->]",
    "  riddle-proof-loop status --state-path <path>",
    "  riddle-proof-loop run-profile --profile <file|json|-> --url <base-url> [--runner riddle] [--viewport-name <name[,name...]>] [--strict true|false; default false] [--split-viewports true|false; default false] [--balance-preflight true|false; default true] [--poll-attempts n] [--output <dir>|--output-dir <dir>] [--result-format json|compact-json|summary|none; default json] [--quiet]",
    "  riddle-proof-loop run-profile aggregate --profile <file|json|-> --url <base-url> --input-dir <dir>|--inputs <path[,path...]> [--output <dir>|--output-dir <dir>] [--result-format json|compact-json|summary|none; default json]",
    "  riddle-proof-loop run-profile recover --profile <file|json|-> --url <base-url> --job <job-id> [--viewport-name <name[,name...]>] [--output <dir>|--output-dir <dir>] [--result-format json|compact-json|summary|none; default json]",
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

function runProfileBalancePreflightOption(options: CliOptions) {
  return optionBoolean(options, "balancePreflight") ?? true;
}

function runProfileSplitViewportsOption(options: CliOptions) {
  return optionBoolean(options, "splitViewports") ?? false;
}

function runProfileViewportNamesOption(options: CliOptions) {
  const raw = optionString(options, "viewportName") ?? optionString(options, "viewportNames");
  if (!raw) return [];
  return raw.split(",").map((part) => part.trim()).filter(Boolean);
}

const DEFAULT_PROFILE_UNSUBMITTED_RETRY_TIMEOUT_MS = 90_000;
const DEFAULT_PROFILE_UNSUBMITTED_RETRIES = 2;

function optionNumber(options: CliOptions, ...keys: string[]) {
  for (const key of keys) {
    const value = optionString(options, key);
    if (value !== undefined) return Number(value);
  }
  return undefined;
}

function optionInteger(options: CliOptions, fallback: number, ...keys: string[]) {
  const value = optionNumber(options, ...keys);
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.floor(value);
}

function profileOutputDirOption(options: CliOptions) {
  return optionString(options, "output") ?? optionString(options, "outputDir");
}

function runProfileResultFormatOption(options: CliOptions) {
  const format = optionString(options, "resultFormat") ?? "json";
  if (format === "compact") return "compact-json";
  if (format === "json" || format === "compact-json" || format === "summary" || format === "none") return format;
  throw new Error("--result-format must be json, compact-json, summary, or none.");
}

function compactProfileCheckCounts(result: RiddleProofProfileResult) {
  return result.checks.reduce<Record<string, number>>((counts, check) => {
    const status = String(check.status || "unknown");
    counts[status] = (counts[status] || 0) + 1;
    counts.total = (counts.total || 0) + 1;
    return counts;
  }, { total: 0 });
}

function compactProfileChecks(result: RiddleProofProfileResult) {
  return result.checks.map((check) => ({
    type: check.type,
    label: check.label,
    status: check.status,
    message: check.message,
  }));
}

function compactRunProfileResult(result: RiddleProofProfileResult, options: CliOptions) {
  const outputDir = profileOutputDirOption(options);
  return {
    version: "riddle-proof.profile-compact-result.v1",
    profile_name: result.profile_name,
    runner: result.runner,
    status: result.status,
    summary: result.summary,
    captured_at: result.captured_at,
    baseline_policy: result.baseline_policy,
    route: result.route,
    check_counts: compactProfileCheckCounts(result),
    checks: compactProfileChecks(result),
    warnings: result.warnings,
    environment_blocker: result.environment_blocker,
    metadata: result.metadata,
    riddle: result.riddle,
    artifacts: result.artifacts,
    output_dir: outputDir,
    output_files: outputDir ? {
      profile_result: "profile-result.json",
      summary: "summary.md",
      proof_json: result.evidence ? "proof.json" : undefined,
      console: result.evidence?.console ? "console.json" : undefined,
      dom_summary: result.evidence?.dom_summary ? "dom-summary.json" : undefined,
    } : undefined,
  };
}

function writeRunProfileResult(result: RiddleProofProfileResult, options: CliOptions) {
  const format = runProfileResultFormatOption(options);
  if (format === "none") return;
  if (format === "summary") {
    process.stdout.write(profileResultMarkdown(result));
    return;
  }
  if (format === "compact-json") {
    process.stdout.write(`${JSON.stringify(compactRunProfileResult(result, options), null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
  const packMetadataLines = profilePackMetadataMarkdown(result);
  if (packMetadataLines.length) {
    lines.push("## Proof Pack", "", ...packMetadataLines, "");
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
  const reachabilitySummaryLines = profileReachabilitySummaryMarkdown(result);
  if (reachabilitySummaryLines.length) {
    lines.push("", "## Reachability", "", ...reachabilitySummaryLines);
  }
  const stateContractSummaryLines = profileStateContractSummaryMarkdown(result);
  if (stateContractSummaryLines.length) {
    lines.push("", "## State Contract", "", ...stateContractSummaryLines);
  }
  const sideCaveatSummaryLines = profileSideCaveatSummaryMarkdown(result);
  if (sideCaveatSummaryLines.length) {
    lines.push("", "## Side Caveats", "", ...sideCaveatSummaryLines);
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
  const artifactRecovery = riddle.artifact_recovery === true;
  const retryCount = cliFiniteNumber(riddle.retry_count);
  const staleJobIds = Array.isArray(riddle.stale_job_ids)
    ? riddle.stale_job_ids.map((value) => cliString(value)).filter((value): value is string => Boolean(value))
    : [];
  const splitJobs = Array.isArray(riddle.split_jobs)
    ? riddle.split_jobs.map(cliRecord).filter((job): job is Record<string, unknown> => Boolean(job))
    : [];
  const parts = [
    mode ? `mode ${markdownInlineCode(mode)}` : "",
    jobCount === undefined ? "" : `jobs ${jobCount}`,
    jobId ? `job ${markdownInlineCode(jobId)}` : "",
    status ? `status ${markdownInlineCode(status)}` : "",
    terminal === undefined ? "" : `terminal ${terminal ? "true" : "false"}`,
  ].filter(Boolean);
  const lines = parts.length ? [`- ${parts.join(", ")}`] : [];
  if (queueElapsedMs !== undefined || elapsedMs !== undefined || attempt !== undefined || attempts !== undefined) {
    if (splitJobs.length) {
      const maxChildQueueElapsedMs = maxDefinedNumbers(splitJobs.map((job) => cliFiniteNumber(job.queue_elapsed_ms)));
      const maxChildElapsedMs = maxDefinedNumbers(splitJobs.map((job) => cliFiniteNumber(job.elapsed_ms)));
      const maxChildPreSubmissionElapsedMs = maxDefinedNumbers(splitJobs.map((job) => cliFiniteNumber(job.pre_submission_elapsed_ms)));
      lines.push(
        `- child poll totals: queue ${formatPollDuration(queueElapsedMs)}, elapsed ${formatPollDuration(elapsedMs)}${preSubmissionElapsedMs === undefined || preSubmissionElapsedMs < 1000 ? "" : `, pre-submit ${formatPollDuration(preSubmissionElapsedMs)}`}; max child queue ${formatPollDuration(maxChildQueueElapsedMs)}, max child elapsed ${formatPollDuration(maxChildElapsedMs)}${maxChildPreSubmissionElapsedMs === undefined || maxChildPreSubmissionElapsedMs < 1000 ? "" : `, max child pre-submit ${formatPollDuration(maxChildPreSubmissionElapsedMs)}`}`,
      );
    } else {
      lines.push(
        `- poll: queue ${formatPollDuration(queueElapsedMs)}, elapsed ${formatPollDuration(elapsedMs)}${preSubmissionElapsedMs === undefined || preSubmissionElapsedMs < 1000 ? "" : `, pre-submit ${formatPollDuration(preSubmissionElapsedMs)}`}${attempt === undefined ? "" : `, attempt ${attempt}${attempts === undefined ? "" : `/${attempts}`}`}`,
      );
    }
  }
  if (submittedAt || completedAt) {
    lines.push(`- timing:${submittedAt ? ` submitted ${markdownInlineCode(submittedAt)}` : ""}${completedAt ? ` completed ${markdownInlineCode(completedAt)}` : ""}`);
  }
  if (artifactRecovery) {
    lines.push("- artifact recovery: used artifacts endpoint after non-terminal poll");
  }
  if (retryCount !== undefined && retryCount > 0) {
    lines.push(`- retry recovery: replaced ${retryCount} unsubmitted job${retryCount === 1 ? "" : "s"}${staleJobIds.length ? ` (${staleJobIds.map((value) => markdownInlineCode(value)).join(", ")})` : ""}`);
  }
  for (const job of splitJobs.slice(0, 12)) {
    const viewport = cliString(job.viewport) || "viewport";
    const splitJobId = cliString(job.job_id);
    const splitStatus = cliString(job.status);
    const splitTerminal = typeof job.terminal === "boolean" ? job.terminal : undefined;
    const splitElapsedMs = cliFiniteNumber(job.elapsed_ms);
    const splitPreSubmissionElapsedMs = cliFiniteNumber(job.pre_submission_elapsed_ms);
    const splitArtifactRecovery = job.artifact_recovery === true;
    const splitRetryCount = cliFiniteNumber(job.retry_count);
    lines.push(
      `- ${viewport}: ${[
        splitJobId ? `job ${markdownInlineCode(splitJobId)}` : "",
        splitStatus ? `status ${markdownInlineCode(splitStatus)}` : "",
        splitTerminal === undefined ? "" : `terminal ${splitTerminal ? "true" : "false"}`,
        splitElapsedMs === undefined ? "" : `elapsed ${formatPollDuration(splitElapsedMs)}`,
        splitPreSubmissionElapsedMs === undefined || splitPreSubmissionElapsedMs < 1000 ? "" : `pre-submit ${formatPollDuration(splitPreSubmissionElapsedMs)}`,
        splitRetryCount === undefined || splitRetryCount <= 0 ? "" : `retries ${splitRetryCount}`,
        splitArtifactRecovery ? "artifact recovery" : "",
      ].filter(Boolean).join(", ") || "job metadata unavailable"}`,
    );
  }
  if (splitJobs.length > 12) lines.push(`- ${splitJobs.length - 12} additional split job(s) omitted.`);
  return lines;
}

function maxDefinedNumbers(values: Array<number | undefined>) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return numbers.length ? Math.max(...numbers) : undefined;
}

function profileMetadataStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => typeof item === "string" ? item.trim() : "").filter((item): item is string => Boolean(item))
    : [];
}

function profileSetupSummaryRecord(result: RiddleProofProfileResult): Record<string, unknown> | undefined {
  const setupCheck = result.checks.find((check) => check.type === "setup_actions_succeeded");
  return cliRecord(setupCheck?.evidence?.setup_summary);
}

function profileSetupSummaryViewports(result: RiddleProofProfileResult): Record<string, unknown>[] {
  const setupSummary = profileSetupSummaryRecord(result);
  return Array.isArray(setupSummary?.viewports)
    ? setupSummary.viewports.map(cliRecord).filter((viewport): viewport is Record<string, unknown> => Boolean(viewport))
    : [];
}

function profileHasPassedCheck(result: RiddleProofProfileResult, types: string[]): boolean {
  return result.checks.some((check) => types.includes(check.type) && check.status === "passed");
}

function profileHasCheck(result: RiddleProofProfileResult, types: string[]): boolean {
  return result.checks.some((check) => types.includes(check.type));
}

function profileSetupScreenshotCount(viewports: Record<string, unknown>[]): number {
  return viewports.reduce((sum, viewport) => {
    const setupScreenshots = Array.isArray(viewport.setup_screenshots)
      ? viewport.setup_screenshots.filter((label) => typeof label === "string" && label.trim()).length
      : 0;
    const finalScreenshot = cliString(viewport.final_screenshot) || cliString(viewport.screenshot_label) ? 1 : 0;
    return sum + setupScreenshots + finalScreenshot;
  }, 0);
}

function profileSetupReceiptTotal(viewports: Record<string, unknown>[], key: string): number {
  return viewports.reduce((sum, viewport) => sum + setupReceiptArray(viewport, key).filter((receipt) => receipt.ok !== false).length, 0);
}

function profileSetupActionCount(viewports: Record<string, unknown>[], action: string): number {
  return viewports.reduce((sum, viewport) => {
    const actionCounts = cliRecord(viewport.action_counts);
    return sum + (cliFiniteNumber(actionCounts?.[action]) || 0);
  }, 0);
}

function profileSetupFailureCount(viewports: Record<string, unknown>[]): number {
  return viewports.reduce((sum, viewport) => {
    const failed = Array.isArray(viewport.failed) ? viewport.failed : [];
    return sum + failed.filter((failure) => Boolean(cliRecord(failure))).length;
  }, 0);
}

function profileSetupObstructionCount(viewports: Record<string, unknown>[]): number {
  return viewports.reduce((sum, viewport) => {
    const failed = Array.isArray(viewport.failed)
      ? viewport.failed.map(cliRecord).filter((failure): failure is Record<string, unknown> => Boolean(failure))
      : [];
    return sum + failed.filter((failure) => Boolean(setupFailureObstructionSnippet(cliString(failure.reason)))).length;
  }, 0);
}

function profileResultHasArtifact(result: RiddleProofProfileResult): boolean {
  return Boolean(
    result.artifacts.proof_json
    || result.artifacts.console
    || result.artifacts.dom_summary
    || result.artifacts.screenshots?.length
    || result.artifacts.riddle_artifacts?.some((artifact) => artifact.url || artifact.path || artifact.name),
  );
}

function profileReceiptSignalStatus(
  hasSignal: boolean,
  presentReason: string,
  missingReason: string,
): { status: "present" | "missing"; reason: string } {
  return hasSignal
    ? { status: "present", reason: presentReason }
    : { status: "missing", reason: missingReason };
}

function profileViewportNameList(viewports: Record<string, unknown>[]): string {
  const names = [...new Set(viewports
    .map((viewport) => cliString(viewport.name) || cliString(viewport.viewport))
    .filter((name): name is string => Boolean(name)))];
  if (!names.length) return "unnamed";
  const shown = names.slice(0, 6).join(", ");
  return names.length > 6 ? `${shown}, +${names.length - 6} more` : shown;
}

function profileEveryRouteViewportStatus(
  result: RiddleProofProfileResult,
  setupSummary: Record<string, unknown> | undefined,
  setupViewports: Record<string, unknown>[],
  evidenceViewports: unknown[],
): { status: "present" | "missing"; reason: string } {
  const evidenceViewportRecords = evidenceViewports
    .map(cliRecord)
    .filter((viewport): viewport is Record<string, unknown> => Boolean(viewport));
  const domSummary = cliRecord(result.evidence?.dom_summary);
  const expectedViewportCount = cliFiniteNumber(domSummary?.expected_viewport_count)
    ?? cliFiniteNumber(setupSummary?.viewport_count)
    ?? cliFiniteNumber(domSummary?.viewport_count)
    ?? Math.max(evidenceViewportRecords.length, setupViewports.length);
  const evidenceWithRoute = evidenceViewportRecords.filter((viewport) => (
    Boolean(cliRecord(viewport.route))
    || (Boolean(result.route) && Boolean(cliString(viewport.screenshot_label)))
  ));
  const setupOkCount = setupViewports.filter((viewport) => viewport.ok !== false).length;
  const setupComplete = !setupViewports.length || setupOkCount >= expectedViewportCount;
  if (expectedViewportCount > 0 && evidenceWithRoute.length >= expectedViewportCount && setupComplete) {
    return {
      status: "present",
      reason: `route/setup evidence present for all ${expectedViewportCount} viewport(s): ${profileViewportNameList(evidenceWithRoute)}`,
    };
  }
  const setupPart = setupViewports.length ? `, setup ok ${setupOkCount}/${expectedViewportCount}` : "";
  return {
    status: "missing",
    reason: `route/viewport evidence incomplete: expected ${expectedViewportCount}, route evidence ${evidenceWithRoute.length}${setupPart}`,
  };
}

function compactProfileReceiptReason(value: unknown, limit = 180): string | undefined {
  const text = cliString(value)?.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function profileCleanupInventoryHaystack(receipt: Record<string, unknown>): string {
  const returnStoredTo = cliString(receipt.return_stored_to) || "";
  const reason = cliString(receipt.reason) || "";
  const error = cliString(receipt.error) || "";
  const summary = cliReturnSummaryLabel(receipt.return_summary) || "";
  return `${returnStoredTo} ${reason} ${error} ${summary}`.toLowerCase();
}

function profileIsCleanupInventoryReceipt(receipt: Record<string, unknown>): boolean {
  const haystack = profileCleanupInventoryHaystack(receipt);
  return haystack.includes("cleanup")
    || haystack.includes("post-cleanup")
    || haystack.includes("stale")
    || haystack.includes("statehygiene")
    || haystack.includes("state hygiene")
    || haystack.includes("remained after")
    || haystack.includes("still present");
}

function profileIsCleanupPhaseInventoryReceipt(receipt: Record<string, unknown>): boolean {
  const storedTo = (cliString(receipt.return_stored_to) || "").toLowerCase();
  const storedSegments = storedTo.split(/[.[\]/]/).filter(Boolean);
  const storedSegment = storedSegments[storedSegments.length - 1] || storedTo;
  const state = (cliString(setupReturnSummaryValue(receipt, ["state", "phase"])) || "").toLowerCase();
  const summary = (cliReturnSummaryLabel(receipt.return_summary) || "").toLowerCase();
  const markers = [storedSegment, state, summary];
  return markers.some((marker) => (
    marker === "cleanup"
    || marker === "postcleanup"
    || marker === "post-cleanup"
    || marker === "aftercleanup"
    || marker === "after-cleanup"
    || marker.includes("post-cleanup")
    || marker.includes("after-cleanup")
    || marker.includes("after-clear")
    || marker.includes("after-reset")
    || marker.includes("after-undo")
    || marker.includes("after-discard")
    || marker.includes("after-new")
  ));
}

function profileCleanupPhaseInventoryReceipts(setupViewports: Record<string, unknown>[]): Record<string, unknown>[] {
  return setupViewports.flatMap((viewport) => [
    ...setupReceiptArray(viewport, "window_eval"),
    ...setupReceiptArray(viewport, "window_call"),
  ]).filter((receipt) => profileIsCleanupInventoryReceipt(receipt) && profileIsCleanupPhaseInventoryReceipt(receipt));
}

function profileFailedCleanupInventoryReceiptReason(receipt: Record<string, unknown>): string | undefined {
  if (receipt.ok === false) {
    const error = cliString(receipt.error);
    const reason = cliString(receipt.reason);
    return compactProfileReceiptReason(error) || compactProfileReceiptReason(reason) || "cleanup inventory failed";
  }

  const parts: string[] = [];
  if (setupReturnedSummaryValue(receipt, ["ok"]) === false) parts.push("ok=false");
  if (setupReturnedSummaryValue(receipt, ["success"]) === false) parts.push("success=false");

  const staleCount = cliFiniteNumber(setupReturnSummaryValue(receipt, ["staleCount"]));
  if (staleCount !== undefined && staleCount > 0) parts.push(`staleCount=${staleCount}`);

  const staleNames = setupReturnSummaryValue(receipt, ["staleNames"]);
  if (Array.isArray(staleNames) && staleNames.length > 0) {
    const staleNamesLabel = cliValueLabel(staleNames);
    if (staleNamesLabel) parts.push(`staleNames=${compactProfileReceiptReason(staleNamesLabel, 120) ?? staleNamesLabel}`);
  }

  const productIssue = setupReturnedSummaryValue(receipt, ["productIssue", "issue"]);
  const productIssueLabel = typeof productIssue === "string" ? compactProfileReceiptReason(productIssue, 120) : undefined;
  if (parts.length && productIssueLabel) parts.push(productIssueLabel);

  return parts.length ? parts.join(", ") : undefined;
}

function profileFailedCleanupInventoryReason(setupViewports: Record<string, unknown>[]): string | undefined {
  const receipts = profileCleanupPhaseInventoryReceipts(setupViewports);
  for (const receipt of [...receipts].reverse()) {
    const reason = profileFailedCleanupInventoryReceiptReason(receipt);
    if (reason) return reason;
  }
  return undefined;
}

function profilePassedCleanupInventoryReceiptReason(receipt: Record<string, unknown>): string | undefined {
  if (receipt.ok === false) return undefined;
  if (setupReturnedSummaryValue(receipt, ["ok"]) === false) return undefined;
  if (setupReturnedSummaryValue(receipt, ["success"]) === false) return undefined;
  const staleCount = cliFiniteNumber(setupReturnSummaryValue(receipt, ["staleCount"]));
  const staleNames = setupReturnSummaryValue(receipt, ["staleNames"]);
  if (staleCount !== 0 || !Array.isArray(staleNames) || staleNames.length !== 0) return undefined;
  return "staleCount=0, staleNames=[]";
}

function profilePassedCleanupInventoryReason(setupViewports: Record<string, unknown>[]): string | undefined {
  const receipts = profileCleanupPhaseInventoryReceipts(setupViewports);
  for (const receipt of [...receipts].reverse()) {
    const reason = profilePassedCleanupInventoryReceiptReason(receipt);
    if (reason) return reason;
  }
  return undefined;
}

function profileHasRouteExitAffordanceReceipt(receipts: Record<string, unknown>[]): boolean {
  const affordanceFields = [
    "navVisibleBeforeExit",
    "navVisible",
    "navigationVisible",
    "exitVisible",
    "exitControlVisible",
    "routeExitVisible",
    "homeLinkVisible",
  ];
  const routeFields = ["route", "afterRoute", "nextRoute", "browserPath", "path"];
  return receipts.some((receipt) => {
    if (affordanceFields.some((name) => setupReturnSummaryValue(receipt, [name]) !== undefined)) return true;

    const storedTo = cliString(receipt.return_stored_to) || "";
    const summary = cliReturnSummaryLabel(receipt.return_summary) || "";
    const reason = cliString(receipt.reason) || "";
    const haystack = `${storedTo} ${summary} ${reason}`.toLowerCase();
    const mentionsRouteExit = haystack.includes("routeexit")
      || haystack.includes("route-exit")
      || haystack.includes("route exit")
      || haystack.includes("afterrouteexit")
      || haystack.includes("after route exit");
    if (!mentionsRouteExit) return false;
    return routeFields.some((name) => setupReturnSummaryValue(receipt, [name]) !== undefined)
      || haystack.includes("route=")
      || haystack.includes("browserpath=");
  });
}

function profileCleanupLabelMatches(value: string | undefined): boolean {
  if (!value) return false;
  return /\b(cleanup|clean|clear|reset|undo|discard|new)\b/i.test(value);
}

function profileHasCleanupBoundaryAffordanceReceipt(receipts: Record<string, unknown>[]): boolean {
  const visibleFields = [
    "cleanupControlVisible",
    "cleanupVisible",
    "clearControlVisible",
    "resetControlVisible",
    "undoVisible",
    "discardVisible",
    "newControlVisible",
    "exitControlVisible",
  ];
  const textFields = [
    "cleanupControlText",
    "cleanupText",
    "clearControlText",
    "resetControlText",
    "undoText",
    "discardText",
    "newControlText",
    "exitControlText",
    "controlText",
    "affordanceText",
  ];

  return receipts.some((receipt) => {
    const storedTo = cliString(receipt.return_stored_to) || "";
    const label = cliString(receipt.label) || "";
    const path = cliString(receipt.path) || cliString(receipt.function_name) || "";
    const summary = cliReturnSummaryLabel(receipt.return_summary) || "";
    const haystack = `${storedTo} ${label} ${path} ${summary}`.toLowerCase();
    const mentionsCleanupBoundary = haystack.includes("cleanup")
      || haystack.includes("precleanup")
      || haystack.includes("pre-cleanup")
      || haystack.includes("boundary")
      || haystack.includes("undo")
      || haystack.includes("clear")
      || haystack.includes("reset")
      || haystack.includes("discard");
    const visibleControl = visibleFields.some((name) => setupReturnSummaryValue(receipt, [name]) === true);
    const controlText = textFields
      .map((name) => cliString(setupReturnSummaryValue(receipt, [name])))
      .find((value) => profileCleanupLabelMatches(value));
    return mentionsCleanupBoundary && (visibleControl || Boolean(controlText));
  });
}

function profileVisibleCleanupActionCount(setupViewports: Record<string, unknown>[]): number {
  const keys = new Set<string>();
  const clickedReceipts = setupViewports.flatMap((viewport) => [
    ...setupReceiptArray(viewport, "clicked"),
    ...setupReceiptArray(viewport, "tap"),
    ...setupReceiptArray(viewport, "tap_until"),
  ]);
  clickedReceipts.forEach((receipt, index) => {
    if (receipt.ok === false) return;
    const text = cliString(receipt.text)
      || cliString(receipt.label)
      || cliString(receipt.target)
      || cliString(receipt.selector);
    if (!profileCleanupLabelMatches(text)) return;
    const ordinal = cliFiniteNumber(receipt.ordinal);
    keys.add(ordinal === undefined ? `idx:${index}:${text}` : `ord:${ordinal}:${text}`);
  });
  return keys.size;
}

function profileHasOfflineAudioMetricsReceipt(receipts: Record<string, unknown>[]): boolean {
  const metricFields = [
    "mixPeak",
    "mixRms",
    "maxPeak",
    "avgRms",
    "audioPeak",
    "audioRms",
    "offlinePeak",
    "offlineRms",
    "peak",
    "rms",
  ];
  return receipts.some((receipt) => metricFields.some((name) => {
    const value = cliFiniteNumber(setupReturnSummaryValue(receipt, [name]));
    return value !== undefined && value > 0;
  }));
}

function profileHasActiveRouteLocalProofReceipt(receipts: Record<string, unknown>[]): boolean {
  return receipts.some((receipt) => {
    const route = cliString(setupReturnSummaryValue(receipt, ["route", "browserPath", "path"]));
    if (!route) return false;
    const proofVersion = cliString(setupReturnSummaryValue(receipt, ["proofVersion", "proof_version", "proofKind", "proof_kind"]));
    const globalCount = cliFiniteNumber(setupReturnSummaryValue(receipt, ["globalCount", "activeGlobalCount", "activeGlobals.length"]));
    const globalNames = setupReturnSummaryValue(receipt, ["globalNames", "activeGlobals"]);
    const enabled = setupReturnSummaryValue(receipt, ["enabled", "proofEnabled", "proof_enabled"]) === true;
    const ready = setupReturnSummaryValue(receipt, ["ready", "proofReady", "proof_ready"]) === true;
    const supportsProofFeature = setupReturnSummaryValue(receipt, ["supportsOfflineAudio", "supportsProof", "proofSupported"]) === true;
    const autopilotActive = setupReturnSummaryValue(receipt, ["autopilot", "autopilotEnabled", "autopilot_enabled"]) === true;
    const runtimeMetricPresent = [
      "metricsPresent",
      "frameMetricsPresent",
      "runtimeMetricsPresent",
      "routeMetricsPresent",
    ].some((name) => setupReturnSummaryValue(receipt, [name]) === true);
    const runtimeMetricMeasured = [
      "heightPx",
      "centerPx",
      "targetHeight",
      "frameCount",
      "elapsedMs",
      "distance",
      "speed",
      "velocity",
      "planLength",
      "stepDelta",
      "afterSteps",
      "beforeSteps",
    ].some((name) => cliFiniteNumber(setupReturnSummaryValue(receipt, [name])) !== undefined);
    return Boolean(
      proofVersion
      || enabled
      || ready
      || supportsProofFeature
      || autopilotActive
      || runtimeMetricPresent
      || runtimeMetricMeasured
      || (globalCount !== undefined && globalCount > 0)
      || (Array.isArray(globalNames) && globalNames.length > 0),
    );
  });
}

function profileLowerSummaryValue(receipt: Record<string, unknown>, names: string[]): string {
  return names
    .map((name) => cliString(setupReturnSummaryValue(receipt, [name]))?.toLowerCase())
    .find((value): value is string => Boolean(value)) || "";
}

function profileHasTerminalLossReceipt(receipts: Record<string, unknown>[]): boolean {
  return receipts.some((receipt) => {
    const status = profileLowerSummaryValue(receipt, ["status", "state", "phase"]);
    const outcome = profileLowerSummaryValue(receipt, ["lastOutcome", "outcome", "terminalOutcome", "terminal"]);
    const lastFlightLost = setupReturnSummaryValue(receipt, ["lastFlightLost", "lost"]) === true;
    const outOfBounds = setupReturnSummaryValue(receipt, ["lastFlightOutOfBounds", "outOfBounds"]) === true;
    const storedTo = cliString(receipt.return_stored_to) || "";
    const label = cliString(receipt.label) || "";
    const path = cliString(receipt.path) || cliString(receipt.function_name) || "";
    const haystack = `${storedTo} ${label} ${path}`.toLowerCase();
    const labelsLoss = haystack.includes("loss")
      || haystack.includes("lost")
      || haystack.includes("terminal");
    if (!labelsLoss && !lastFlightLost && !outOfBounds) return false;
    return lastFlightLost
      || outOfBounds
      || ["over", "lost", "loss", "failed", "failure", "game_over", "gameover"].includes(status)
      || ["lost", "loss", "failed", "failure", "game_over", "gameover"].includes(outcome);
  });
}

function profileHasTerminalGameOverReceipt(receipts: Record<string, unknown>[]): boolean {
  return receipts.some((receipt) => {
    const status = profileLowerSummaryValue(receipt, ["status", "state", "phase"]);
    const outcome = profileLowerSummaryValue(receipt, ["lastOutcome", "outcome", "terminalOutcome", "terminal", "result"]);
    const gameOver = setupReturnSummaryValue(receipt, ["gameOver", "game_over", "isGameOver"]) === true;
    const caught = setupReturnSummaryValue(receipt, ["caught", "playerCaught", "wasCaught"]) === true;
    const storedTo = cliString(receipt.return_stored_to) || "";
    const label = cliString(receipt.label) || "";
    const path = cliString(receipt.path) || cliString(receipt.function_name) || "";
    const slot = cliString(setupReturnSummaryValue(receipt, ["slot"])) || "";
    const haystack = `${storedTo} ${label} ${path} ${slot}`.toLowerCase();
    const labelsTerminal = haystack.includes("gameover")
      || haystack.includes("game_over")
      || haystack.includes("game-over")
      || haystack.includes("game over")
      || haystack.includes("terminal")
      || haystack.includes("caught")
      || haystack.includes("catch");
    const terminalStatus = ["over", "game_over", "gameover"].includes(status)
      || ["game_over", "gameover"].includes(outcome);
    if (!labelsTerminal && !caught && !gameOver && !terminalStatus) return false;
    return gameOver
      || caught
      || terminalStatus;
  });
}

function profileHasTerminalSuccessReceipt(receipts: Record<string, unknown>[]): boolean {
  return receipts.some((receipt) => {
    const status = profileLowerSummaryValue(receipt, ["status", "state", "phase"]);
    const outcome = profileLowerSummaryValue(receipt, ["lastOutcome", "outcome", "terminalOutcome", "terminal", "result"]);
    const storedTo = cliString(receipt.return_stored_to) || "";
    const label = cliString(receipt.label) || "";
    const path = cliString(receipt.path) || cliString(receipt.function_name) || "";
    const haystack = `${storedTo} ${label} ${path}`.toLowerCase();
    if (haystack.includes("shot")) return false;
    const labelsSuccess = haystack.includes("success")
      || haystack.includes("terminal")
      || haystack.includes("completed")
      || haystack.includes("complete");
    const success = setupReturnSummaryValue(receipt, ["success", "passed", "completed"]) === true;
    const targetHit = setupReturnSummaryValue(receipt, ["lastFlightTargetHit", "targetHit"]) === true;
    const gateHit = setupReturnSummaryValue(receipt, ["lastFlight.passedThroughGate", "passedThroughGate", "gate"]) === true;
    const bucketHit = setupReturnSummaryValue(receipt, ["lastFlight.bucketHit", "bucketHit", "bucket"]) === true;
    if (!labelsSuccess && !success && !targetHit && !gateHit && !bucketHit) return false;
    return success
      || targetHit
      || gateHit
      || bucketHit
      || ["success", "won", "complete", "completed", "passed"].includes(status)
      || ["success", "won", "complete", "completed", "passed"].includes(outcome);
  });
}

function profileHasControlledLaunchReceipt(receipts: Record<string, unknown>[], expected: "failure" | "success"): boolean {
  return receipts.some((receipt) => {
    const shotKind = profileLowerSummaryValue(receipt, ["lastShotKind", "shotKind", "kind"]);
    const shotStatus = profileLowerSummaryValue(receipt, ["lastShotStatus", "shotStatus"]);
    const outcome = profileLowerSummaryValue(receipt, ["lastOutcome", "outcome"]);
    if (expected === "success") {
      return shotKind === "success" && (!shotStatus || shotStatus === "success" || outcome === "success");
    }
    return ["failure", "failed", "miss", "lost", "loss"].includes(shotKind)
      || ["failure", "failed", "miss", "lost", "loss"].includes(shotStatus)
      || ["failure", "failed", "miss", "lost", "loss"].includes(outcome);
  });
}

function profileHasRouteContinuationReceipt(receipts: Record<string, unknown>[]): boolean {
  return receipts.some((receipt) => {
    const fromRoute = cliString(setupReturnSummaryValue(receipt, ["fromRoute", "from", "previousRoute", "sourceRoute"]));
    const target = cliString(setupReturnSummaryValue(receipt, ["target", "nextHref", "toRoute", "nextRoute", "href"]));
    const afterRoute = cliString(setupReturnSummaryValue(receipt, ["routeAfterPush", "afterRoute", "route", "observedRoute"]));
    if (!fromRoute || (!target && !afterRoute)) return false;

    const storedTo = cliString(receipt.return_stored_to) || "";
    const label = cliString(receipt.label) || "";
    const path = cliString(receipt.path) || cliString(receipt.function_name) || "";
    const summary = cliReturnSummaryLabel(receipt.return_summary) || "";
    const haystack = `${storedTo} ${label} ${path} ${summary}`.toLowerCase();
    return haystack.includes("navigation")
      || haystack.includes("continuation")
      || haystack.includes("route")
      || haystack.includes("next")
      || haystack.includes("target");
  });
}

function profileHasRecoveredStateReceipt(receipts: Record<string, unknown>[]): boolean {
  return receipts.some((receipt) => {
    const storedTo = cliString(receipt.return_stored_to) || "";
    const label = cliString(receipt.label) || "";
    const path = cliString(receipt.path) || cliString(receipt.function_name) || "";
    const summary = cliReturnSummaryLabel(receipt.return_summary) || "";
    const haystack = `${storedTo} ${label} ${path} ${summary}`.toLowerCase();
    const labelsRecovery = haystack.includes("recover")
      || haystack.includes("repaired")
      || haystack.includes("repair")
      || haystack.includes("retry")
      || haystack.includes("restart")
      || haystack.includes("play again")
      || haystack.includes("playagain")
      || haystack.includes("play-again")
      || haystack.includes("try fix")
      || haystack.includes("tryfix")
      || haystack.includes("after-fix")
      || haystack.includes("fixed");
    if (!labelsRecovery) return false;

    const status = profileLowerSummaryValue(receipt, ["status", "state", "phase"]);
    const outcome = profileLowerSummaryValue(receipt, ["lastOutcome", "outcome", "result", "retryOutcome", "retry_outcome"]);
    const hasRecoveredState = ["valid", "success", "recovered", "fixed", "ready"].includes(status)
      || ["valid", "success", "recovered", "fixed", "ready", "running_after_retry", "ready_after_retry"].includes(outcome);
    const hasValid = setupReturnSummaryValue(receipt, ["hasValid", "valid", "isValid"]) === true;
    const hasInvalid = setupReturnSummaryValue(receipt, ["hasInvalid", "invalid", "isInvalid"]);
    const success = setupReturnSummaryValue(receipt, ["success", "recovered", "fixed"]) === true;
    const leftTerminalState = setupReturnSummaryValue(receipt, ["leftTerminalState", "left_terminal_state"]) === true;
    const retrySurfaceReady = setupReturnSummaryValue(receipt, ["retrySurfaceReady", "retry_surface_ready"]) === true;
    return hasRecoveredState || success || (hasValid && hasInvalid === false) || (leftTerminalState && retrySurfaceReady);
  });
}

function profileMetadataHasGeneratedOutputContract(metadata: Record<string, unknown>): boolean {
  const contract = cliRecord(metadata.declared_state_contract);
  if (!contract) return false;
  const keys = Object.keys(contract).join(" ").toLowerCase();
  const values = Object.values(contract)
    .map((value) => cliString(value)?.toLowerCase() || "")
    .join(" ");
  const haystack = `${keys} ${values}`;
  return haystack.includes("generated_output")
    || haystack.includes("generated output")
    || haystack.includes("output-size")
    || haystack.includes("output size")
    || haystack.includes("output result")
    || haystack.includes("optimizer size");
}

function profileHasGeneratedOutputReceipt(receipts: Record<string, unknown>[]): boolean {
  let outputReady = false;
  let outputChanged = false;

  for (const receipt of receipts) {
    const storedTo = cliString(receipt.return_stored_to) || "";
    const label = cliString(receipt.label) || "";
    const path = cliString(receipt.path) || cliString(receipt.function_name) || "";
    const summary = cliReturnSummaryLabel(receipt.return_summary) || "";
    const haystack = `${storedTo} ${label} ${path} ${summary}`.toLowerCase();

    const readySignal = setupReturnSummaryValue(receipt, ["outputReady", "outputStillReady"]) === true
      || cliFiniteNumber(setupReturnSummaryValue(receipt, ["surfaceCount", "before.surfaceCount", "after.surfaceCount"])) !== undefined
      || setupReturnSummaryValue(receipt, ["size", "before.size", "after.size", "size.text", "before.size.text", "after.size.text"]) !== undefined;
    if (readySignal && (haystack.includes("output") || haystack.includes("size") || haystack.includes("result"))) {
      outputReady = true;
    }

    const beforeBytes = cliFiniteNumber(setupReturnSummaryValue(receipt, ["before.size.outputBytes", "before.outputBytes", "beforeBytes"]));
    const afterBytes = cliFiniteNumber(setupReturnSummaryValue(receipt, ["after.size.outputBytes", "after.outputBytes", "afterBytes"]));
    const beforeText = cliString(setupReturnSummaryValue(receipt, ["before.size.text", "before.outputText", "beforeText"]));
    const afterText = cliString(setupReturnSummaryValue(receipt, ["after.size.text", "after.outputText", "afterText"]));
    const explicitChange = setupReturnSummaryValue(receipt, ["sizeChanged", "outputChanged", "resultChanged"]) === true;
    const byteChange = beforeBytes !== undefined && afterBytes !== undefined && beforeBytes !== afterBytes;
    const textChange = Boolean(beforeText && afterText && beforeText !== afterText);
    if (explicitChange || byteChange || textChange) outputChanged = true;
  }

  return outputReady && outputChanged;
}

function profilePackReceiptStatus(
  result: RiddleProofProfileResult,
  metadata: Record<string, unknown>,
  receipt: string,
): { status: "present" | "missing" | "manual" | "failed"; reason: string } {
  const text = receipt.toLowerCase();
  const setupSummary = profileSetupSummaryRecord(result);
  const setupViewports = profileSetupSummaryViewports(result);
  const evidenceViewports = Array.isArray(result.evidence?.viewports) ? result.evidence.viewports : [];
  const setupResultCount = setupViewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.result_count) || 0), 0);
  const setupScreenshotCount = profileSetupScreenshotCount(setupViewports);
  const screenshotCount = (result.artifacts.screenshots?.length || 0)
    + evidenceViewports.filter((viewport) => cliString(viewport.screenshot_label)).length
    + setupScreenshotCount;
  const windowEvalCount = profileSetupReceiptTotal(setupViewports, "window_eval");
  const setupActionValueReceipts = setupViewports
    .flatMap((viewport) => setupReceiptArray(viewport, "setup_action_results"))
    .concat(evidenceViewports.flatMap((viewport) => setupReceiptArray(cliRecord(viewport) || {}, "setup_action_results")))
    .filter((item) => {
      const action = cliString(item.action);
      return action === "window_eval"
        || action === "window_call"
        || action === "window_call_until"
        || action === "assert_window_value"
        || action === "assert_window_number";
    });
  const valueReceipts = [
    ...setupViewports.flatMap((viewport) => setupReceiptArray(viewport, "window_eval")),
    ...setupViewports.flatMap((viewport) => setupReceiptArray(viewport, "window_call")),
    ...setupActionValueReceipts,
  ].filter((item) => item.ok !== false);
  const clickCount = setupViewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.clicked_total) || 0), 0)
    + profileSetupReceiptTotal(setupViewports, "click")
    + profileSetupReceiptTotal(setupViewports, "click_count");
  const clickSequenceCount = setupViewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.click_sequence_total) || 0), 0);
  const clickFallbackTapKeys = new Set<string>();
  [
    ...setupViewports.flatMap((viewport) => setupReceiptArray(viewport, "clicked")),
    ...evidenceViewports.flatMap((viewport) => setupReceiptArray(cliRecord(viewport) || {}, "setup_action_results")),
  ].forEach((receipt, index) => {
    if (receipt.ok === false || receipt.fallback_to_tap !== true) return;
    const action = cliString(receipt.action);
    if (action && action !== "click") return;
    const ordinal = cliFiniteNumber(receipt.ordinal);
    const selector = cliString(receipt.selector) || "";
    const frameSelector = cliString(receipt.frame_selector) || "";
    clickFallbackTapKeys.add(`${ordinal === undefined ? `idx:${index}` : `ord:${ordinal}`}:${frameSelector}:${selector}`);
  });
  const clickFallbackTapCount = clickFallbackTapKeys.size;
  const tapUntilCount = profileSetupReceiptTotal(setupViewports, "tap_until");
  const visibleUiActionCount = clickCount + profileSetupReceiptTotal(setupViewports, "tap") + tapUntilCount;
  const visibleCleanupActionCount = profileVisibleCleanupActionCount(setupViewports);
  const setupFailureCount = profileSetupFailureCount(setupViewports);
  const setupObstructionCount = profileSetupObstructionCount(setupViewports);
  const keyboardReceipts = setupViewports.flatMap((viewport) => setupReceiptArray(viewport, "keyboard")).filter((item) => item.ok !== false);
  const keyboardReceiptDispatchCount = keyboardReceipts.length;
  const keyboardActionDispatchCount = ["press", "key_down", "key_up", "keyboard_sequence"]
    .reduce((sum, action) => sum + profileSetupActionCount(setupViewports, action), 0);
  const keyboardDispatchCount = keyboardReceiptDispatchCount > 0 ? keyboardReceiptDispatchCount : keyboardActionDispatchCount;
  const keyboardKeyMatches = (item: Record<string, unknown>, expected: string) => {
    const key = (cliString(item.key) || cliString(item.code) || "").toLowerCase();
    return key === expected || key.includes(expected);
  };
  const hasKeyboardKeyDownReceipt = keyboardReceipts.some((item) => cliString(item.action) === "key_down")
    || profileSetupActionCount(setupViewports, "key_down") > 0;
  const hasKeyboardKeyUpReceipt = keyboardReceipts.some((item) => cliString(item.action) === "key_up")
    || profileSetupActionCount(setupViewports, "key_up") > 0;
  const hasShiftKeyDownReceipt = keyboardReceipts.some((item) => cliString(item.action) === "key_down" && keyboardKeyMatches(item, "shift"));
  const hasShiftKeyUpReceipt = keyboardReceipts.some((item) => cliString(item.action) === "key_up" && keyboardKeyMatches(item, "shift"));
  const inputDispatchCount = profileSetupReceiptTotal(setupViewports, "drag")
    + profileSetupReceiptTotal(setupViewports, "tap")
    + tapUntilCount
    + clickCount
    + clickSequenceCount
    + profileSetupReceiptTotal(setupViewports, "press")
    + profileSetupReceiptTotal(setupViewports, "keyboard_sequence")
    + keyboardDispatchCount;
  const canvasReceipts = setupViewports.flatMap((viewport) => setupReceiptArray(viewport, "canvas_signature"));
  const hasCanvasChange = canvasReceipts.some((item) => item.ok !== false && item.changed === true);
  const canvasSignatureHashes = canvasReceipts
    .filter((item) => item.ok !== false)
    .map((item) => cliString(item.hash))
    .filter(Boolean);
  const hasCanvasSignatureChange = hasCanvasChange || new Set(canvasSignatureHashes).size >= 2;
  const hasNaturalInput = setupNaturalInputSummaryMarkdown(setupViewports).length > 0;
  const hasStateContract = profileStateContractSummaryMarkdown(result).length > 0 || Boolean(cliRecord(metadata.declared_state_contract));
  const hasInvalidStateReceipt = valueReceipts.some((item) => {
    const state = setupReturnSummaryValue(item, ["state", "nextState"]);
    return typeof state === "string" && state.toLowerCase().includes("invalid");
  });
  const hasErrorDetailReceipt = valueReceipts.some((item) => setupReturnSummaryValue(item, ["hasErrorDetail", "errorDetail", "error_detail"]) === true);
  const hasGridEvidence = valueReceipts.some((item) => (
    setupReturnSummaryValue(item, ["itemCount", "grid.width", "gridWidth", "visibleGridCount"]) !== undefined
  ));
  const hasVisibleControlReceipt = valueReceipts.some((item) => (
    setupReturnSummaryValue(item, ["visibleButtonCount", "visibleControlCount"]) !== undefined
    || setupReturnSummaryValue(item, ["buttonStillVisible", "controlStillVisible"]) === true
  ));
  const hasToolSelectionReceipt = valueReceipts.some((item) => (
    setupReturnSummaryValue(item, ["rectangleChecked", "toolSelected", "toolChecked", "selected"]) === true
  ));
  const hasStateGrowthReceipt = valueReceipts.some((item) => {
    const delta = cliFiniteNumber(setupReturnSummaryValue(item, ["delta", "countDelta", "itemDelta", "stateDelta"]));
    if (delta !== undefined && delta > 0) return true;
    const before = cliFiniteNumber(setupReturnSummaryValue(item, ["before", "beforeCount", "previousCount"]));
    const after = cliFiniteNumber(setupReturnSummaryValue(item, ["after", "afterCount", "itemCount", "count"]));
    return before !== undefined && after !== undefined && after > before;
  });
  const hasReachability = profileReachabilitySummaryMarkdown(result).length > 0
    || result.checks.some((check) => check.type === "selector_visible" && Boolean(cliRecord(check.evidence)?.selector));
  const hasOverflowEvidence = result.checks.some((check) => (
    check.type === "no_horizontal_overflow"
    || check.type === "no_mobile_horizontal_overflow"
    || check.type === "frame_no_horizontal_overflow"
  )) || evidenceViewports.some((viewport) => (
    (cliFiniteNumber(viewport.overflow_px) || 0) > 0
    || (cliFiniteNumber(viewport.bounds_overflow_px) || 0) > 0
    || Boolean(viewport.overflow_offenders?.length)
  ));
  const hasConsoleAccounting = profileHasCheck(result, ["no_console_warnings", "no_fatal_console_errors"])
    || Boolean(result.evidence?.console || result.evidence?.page_errors);
  const hasDomSummary = Boolean(result.artifacts.dom_summary || result.evidence?.dom_summary);
  const hasProofJson = Boolean(result.artifacts.proof_json || result.version === "riddle-proof.profile-result.v1");
  const hasRouteViewport = Boolean(result.route?.requested || result.route?.observed)
    && Boolean(evidenceViewports.length || result.route?.matched !== undefined);
  const hasSetupReceipts = setupResultCount > 0 || Boolean(setupSummary);
  const hasTextVisibility = profileHasPassedCheck(result, ["text_visible", "selector_text_visible", "selector_visible"]);
  const hasTextAbsence = profileHasPassedCheck(result, ["text_absent", "selector_text_absent"]);
  const measuredStateMetricNames = [
    "delta",
    "stateDelta",
    "positionDelta",
    "movementDelta",
    "speedDelta",
    "velocityDelta",
    "distanceDelta",
    "distanceGain",
    "scoreDelta",
    "scoreGain",
    "energyDelta",
    "energyDrop",
    "energyRecovered",
    "progressDelta",
    "progressGain",
    "stepDelta",
    "deliveryDelta",
    "deliveriesDelta",
    "remainingDelta",
  ];
  const hasMeasuredStateMetric = valueReceipts.some((item) => measuredStateMetricNames.some((name) => {
    const value = cliFiniteNumber(setupReturnSummaryValue(item, [name]));
    return value !== undefined && Math.abs(value) > 0;
  }));
  const measuredAbsoluteStateMetricNames = [
    "coins",
    "totalCoins",
    "totalEarned",
    "totalClicks",
    "saveCoins",
    "saveTotalCoins",
    "saveTotalClicks",
    "perClick",
    "perSecond",
    "measuredCps",
    "clickPowerLevel",
    "autoClickerLevel",
    "level",
    "score",
    "count",
    "itemCount",
    "progress",
  ];
  const hasMeasuredAbsoluteStateChange = measuredAbsoluteStateMetricNames.some((name) => {
    const values = valueReceipts
      .map((item) => cliFiniteNumber(setupReturnSummaryValue(item, [name])))
      .filter((value): value is number => value !== undefined && Number.isFinite(value));
    if (values.length < 2) return false;
    return Math.max(...values) > Math.min(...values);
  });
  const hasMeasuredStateChange = hasNaturalInput || hasCanvasChange || valueReceipts.some((item) => (
    setupReturnSummaryValue(item, ["changed"]) === true
    || setupReturnSummaryValue(item, ["nonWhiteDelta", "darkDelta", "pixelDelta", "movementDelta"]) !== undefined
  )) || hasMeasuredStateMetric || hasMeasuredAbsoluteStateChange;
  const hasStorageStabilityReceipt = valueReceipts.some((item) => (
    setupReturnSummaryValue(item, ["storageStable", "storage_stable", "saveStable", "save_stable", "persistenceStable", "persistence_stable"]) === true
  ));
  const hasPersistedReturnStateReceipt = valueReceipts.some((item) => (
    setupReturnSummaryValue(item, ["persistedFromHome", "persisted_from_home", "persistenceRestored", "persistence_restored", "restoredFromStorage", "restored_from_storage"]) === true
    || (
      setupReturnSummaryValue(item, ["persisted", "restored", "reloaded"]) === true
      && (
        setupReturnSummaryValue(item, ["saveCoins", "saveTotalCoins", "saveTotalClicks", "saveTotal", "level", "coins"]) !== undefined
        || cliString(item.return_stored_to)?.toLowerCase().includes("return")
      )
    )
  ));
  const hasMovingPlayabilityReceipt = valueReceipts.some((item) => {
    const started = setupReturnSummaryValue(item, ["started", "runStarted", "playStarted"]) === true;
    const distance = cliFiniteNumber(setupReturnSummaryValue(item, ["distance", "distanceMeters", "travelDistance"]));
    const speed = cliFiniteNumber(setupReturnSummaryValue(item, ["speed", "velocity"]));
    return started && ((distance !== undefined && distance > 0) || (speed !== undefined && speed > 0));
  });
  const hasAcceptedPlayabilityInputReceipt = valueReceipts.some((item) => {
    const accepted = setupReturnSummaryValue(item, ["acceptedInput", "inputAccepted", "steeringAccepted", "touchInputAccepted"]) === true;
    const inputModality = (cliString(setupReturnSummaryValue(item, ["inputModality", "inputKind", "pointerType", "modality"])) || "").toLowerCase();
    const distance = cliFiniteNumber(setupReturnSummaryValue(item, ["distance", "distanceMeters", "travelDistance"]));
    const speed = cliFiniteNumber(setupReturnSummaryValue(item, ["speed", "velocity"]));
    const moving = (distance !== undefined && distance > 0) || (speed !== undefined && speed > 0);
    return accepted && Boolean(inputModality) && inputModality !== "none" && moving;
  });
  const hasRouteExitAffordanceReceipt = profileHasRouteExitAffordanceReceipt(valueReceipts);
  const hasCleanupBoundaryAffordanceReceipt = profileHasCleanupBoundaryAffordanceReceipt(valueReceipts);
  const hasOfflineAudioMetricsReceipt = profileHasOfflineAudioMetricsReceipt(valueReceipts);
  const hasActiveRouteLocalProofReceipt = profileHasActiveRouteLocalProofReceipt(valueReceipts);
  const hasTerminalLossReceipt = profileHasTerminalLossReceipt(valueReceipts);
  const hasTerminalGameOverReceipt = profileHasTerminalGameOverReceipt(valueReceipts);
  const hasTerminalSuccessReceipt = profileHasTerminalSuccessReceipt(valueReceipts);
  const hasControlledFailureLaunchReceipt = profileHasControlledLaunchReceipt(valueReceipts, "failure");
  const hasControlledSuccessLaunchReceipt = profileHasControlledLaunchReceipt(valueReceipts, "success");
  const hasRouteContinuationReceipt = profileHasRouteContinuationReceipt(valueReceipts);
  const hasRecoveredStateReceipt = profileHasRecoveredStateReceipt(valueReceipts);
  const hasGeneratedOutputContract = profileMetadataHasGeneratedOutputContract(metadata);
  const hasGeneratedOutputReceipt = profileHasGeneratedOutputReceipt(valueReceipts);
  const failedCleanupInventoryReason = profileFailedCleanupInventoryReason(setupViewports);
  const passedCleanupInventoryReason = profilePassedCleanupInventoryReason(setupViewports);

  if (text.includes("artifact link") || text.includes("artifact path")) {
    return profileReceiptSignalStatus(profileResultHasArtifact(result), "artifact references listed", "no artifact references found");
  }
  if (text.includes("proof json")) return profileReceiptSignalStatus(hasProofJson, "proof JSON artifact named", "proof JSON artifact missing");
  if (text.includes("dom summary")) return profileReceiptSignalStatus(hasDomSummary, "DOM summary evidence present", "DOM summary evidence missing");
  if (text.includes("console") || text.includes("warning") || text.includes("fatal") || text.includes("browser warning") || text.includes("graphics")) {
    return profileReceiptSignalStatus(hasConsoleAccounting, "console checks or evidence present", "console accounting evidence missing");
  }
  if (text.includes("route") && text.includes("viewport")) {
    if (
      text.includes("every target viewport")
      || text.includes("all target viewport")
      || (text.includes("every") && text.includes("viewport"))
    ) {
      return profileEveryRouteViewportStatus(result, setupSummary, setupViewports, evidenceViewports);
    }
    return profileReceiptSignalStatus(hasRouteViewport, "route and viewport evidence present", "route or viewport evidence missing");
  }
  if (text.includes("setup action")) {
    return profileReceiptSignalStatus(hasSetupReceipts, "setup receipts present", "setup receipts missing");
  }
  if (text.includes("click") && text.includes("fallback") && text.includes("tap")) {
    return profileReceiptSignalStatus(
      clickFallbackTapCount > 0,
      `click fallback tap evidence present (${clickFallbackTapCount})`,
      "click fallback tap evidence missing",
    );
  }
  if (text.includes("tap_until") || text.includes("tap until") || text.includes("tap-until")) {
    return profileReceiptSignalStatus(
      tapUntilCount > 0,
      `tap_until receipt present (${tapUntilCount})`,
      "tap_until receipt missing",
    );
  }
  if (
    text.includes("active")
    && (text.includes("route-local") || text.includes("route local"))
    && (
      text.includes("proof helper")
      || text.includes("proof api")
      || text.includes("proof state")
      || text.includes("proof globals")
      || text.includes("playability state")
      || text.includes("runtime metric")
      || text.includes("runtime metrics")
      || text.includes("route metric")
      || text.includes("route metrics")
    )
  ) {
    return profileReceiptSignalStatus(
      hasActiveRouteLocalProofReceipt,
      "active route-local proof receipt present",
      "active route-local proof receipt missing",
    );
  }
  if (text.includes("declared state contract")) {
    return profileReceiptSignalStatus(hasStateContract, "state contract metadata or receipts present", "state contract evidence missing");
  }
  if (text.includes("stale") || text.includes("absence")) {
    const expectsCleanupInventory = text.includes("cleanup")
      || text.includes("post-cleanup")
      || text.includes("stale-state")
      || text.includes("stale state")
      || text.includes("inventory");
    if (failedCleanupInventoryReason && expectsCleanupInventory) {
      return { status: "failed", reason: `cleanup inventory failed: ${failedCleanupInventoryReason}` };
    }
    if (passedCleanupInventoryReason && expectsCleanupInventory) {
      return { status: "present", reason: `cleanup inventory passed: ${passedCleanupInventoryReason}` };
    }
    return profileReceiptSignalStatus(hasTextAbsence, "absence check passed", "absence check missing");
  }
  if (
    text.includes("generated-output")
    || text.includes("generated output")
    || text.includes("output-size")
    || text.includes("output size")
    || ((text.includes("output") || text.includes("result")) && (text.includes("mutation") || text.includes("final")))
  ) {
    return profileReceiptSignalStatus(
      hasGeneratedOutputContract && hasGeneratedOutputReceipt,
      "generated-output mutation receipt present",
      "generated-output mutation receipt missing",
    );
  }
  if (text.includes("recovered") || text.includes("final state")) {
    return profileReceiptSignalStatus(hasStateContract || hasTextVisibility, "final state receipt present", "final state receipt missing");
  }
  if (text.includes("error detail")) {
    const hasRequiredState = !text.includes("invalid") || hasInvalidStateReceipt;
    return profileReceiptSignalStatus(
      hasRequiredState && hasErrorDetailReceipt,
      "error-detail state receipt present",
      "error-detail state receipt missing",
    );
  }
  if (text.includes("invalid state")) {
    return profileReceiptSignalStatus(hasStateContract || hasInvalidStateReceipt, "invalid-state receipt present", "invalid-state receipt missing");
  }
  if ((text.includes("loss") || text.includes("lost")) && text.includes("terminal")) {
    return profileReceiptSignalStatus(
      hasTerminalLossReceipt,
      "terminal loss receipt present",
      "terminal loss receipt missing",
    );
  }
  if (
    text.includes("terminal")
    && (
      text.includes("game-over")
      || text.includes("game over")
      || text.includes("gameover")
      || text.includes("caught")
      || text.includes("catch")
    )
  ) {
    return profileReceiptSignalStatus(
      hasTerminalGameOverReceipt,
      "terminal game-over receipt present",
      "terminal game-over receipt missing",
    );
  }
  if (text.includes("success") && text.includes("terminal")) {
    return profileReceiptSignalStatus(
      hasTerminalSuccessReceipt,
      "terminal success receipt present",
      "terminal success receipt missing",
    );
  }
  if (text.includes("controlled") && text.includes("launch") && (text.includes("failure") || text.includes("failed") || text.includes("miss"))) {
    return profileReceiptSignalStatus(
      hasControlledFailureLaunchReceipt,
      "controlled failure launch receipt present",
      "controlled failure launch receipt missing",
    );
  }
  if (text.includes("controlled") && text.includes("launch") && text.includes("success")) {
    return profileReceiptSignalStatus(
      hasControlledSuccessLaunchReceipt,
      "controlled success launch receipt present",
      "controlled success launch receipt missing",
    );
  }
  if (
    text.includes("recovery action")
    || text.includes("recover action")
    || text.includes("try fix")
    || ((text.includes("retry") || text.includes("repair")) && text.includes("action"))
  ) {
    return profileReceiptSignalStatus(
      visibleUiActionCount > 0 && hasRecoveredStateReceipt,
      "visible recovery-action receipt present",
      "visible recovery-action receipt missing",
    );
  }
  if (text.includes("route continuation") || text.includes("route-transition") || text.includes("route transition")) {
    return profileReceiptSignalStatus(
      hasRouteContinuationReceipt,
      "route continuation receipt present",
      "route continuation receipt missing",
    );
  }
  if (
    text.includes("storage-stability")
    || text.includes("storage stability")
    || text.includes("storage-stable")
    || text.includes("storage stable")
    || ((text.includes("storage") || text.includes("save data")) && text.includes("stable"))
    || (text.includes("passive income") && text.includes("unmounted"))
  ) {
    return profileReceiptSignalStatus(
      hasStorageStabilityReceipt,
      "storage-stability receipt present",
      "storage-stability receipt missing",
    );
  }
  if (
    text.includes("persisted return-state")
    || text.includes("persisted return state")
    || text.includes("return-state")
    || text.includes("return state")
    || ((text.includes("persisted") || text.includes("persistence")) && (text.includes("return") || text.includes("reload") || text.includes("restored")))
  ) {
    return profileReceiptSignalStatus(
      hasPersistedReturnStateReceipt,
      "persisted return-state receipt present",
      "persisted return-state receipt missing",
    );
  }
  if (
    text.includes("cleanup")
    && text.includes("action")
    && (text.includes("visible ui") || text.includes("visible"))
  ) {
    return profileReceiptSignalStatus(
      visibleCleanupActionCount > 0,
      `visible cleanup action receipt present (${visibleCleanupActionCount})`,
      "visible cleanup action receipt missing",
    );
  }
  if (
    text.includes("through visible ui")
    || text.includes("visible ui action")
    || text.includes("ui-routed")
    || text.includes("ui routed")
    || (text.includes("visible") && text.includes("route") && text.includes("exit") && text.includes("action"))
    || (text.includes("visible") && text.includes("mode") && text.includes("exit") && text.includes("action"))
  ) {
    return profileReceiptSignalStatus(
      visibleUiActionCount > 0,
      "visible UI action receipt present",
      "visible UI action receipt missing",
    );
  }
  if (
    text.includes("route-exit affordance")
    || text.includes("route exit affordance")
    || text.includes("navigation before cleanup")
    || text.includes("exit control")
  ) {
    return profileReceiptSignalStatus(
      hasRouteExitAffordanceReceipt || hasStateContract || clickCount > 0,
      "route-exit affordance receipt present",
      "affordance receipt missing",
    );
  }
  if (
    text.includes("cleanup")
    && (
      text.includes("affordance")
      || text.includes("control")
      || text.includes("boundary")
      || text.includes("inventory")
    )
  ) {
    return profileReceiptSignalStatus(
      hasCleanupBoundaryAffordanceReceipt,
      "visible cleanup affordance receipt present",
      "visible cleanup affordance receipt missing",
    );
  }
  if (text.includes("retry") || text.includes("repair") || text.includes("reset") || text.includes("affordance")) {
    return profileReceiptSignalStatus(hasStateContract || clickCount > 0, "affordance or transition receipt present", "affordance receipt missing");
  }
  if (text.includes("failure") || text.includes("mutation")) {
    return profileReceiptSignalStatus(hasStateContract || windowEvalCount > 0 || clickCount > 0, "failure or mutation receipt present", "failure or mutation receipt missing");
  }
  if (text.includes("initial") && (text.includes("visible") || text.includes("state"))) {
    return profileReceiptSignalStatus(hasTextVisibility || screenshotCount > 0, "initial visible-state evidence present", "initial state evidence missing");
  }
  if (text.includes("state-growth") || text.includes("state growth") || text.includes("growth receipt") || text.includes("grid grows") || (text.includes("state") && text.includes("after the click"))) {
    return profileReceiptSignalStatus(hasStateGrowthReceipt, "state-growth receipt present", "state-growth receipt missing");
  }
  if (text.includes("visible grid") || text.includes("control evidence") || (text.includes("grid") && text.includes("control"))) {
    return profileReceiptSignalStatus(
      hasGridEvidence && (hasVisibleControlReceipt || hasReachability),
      "visible grid/control evidence present",
      "visible grid/control evidence missing",
    );
  }
  if ((text.includes("tool") && text.includes("selected")) || text.includes("rectangle tool")) {
    return profileReceiptSignalStatus(hasToolSelectionReceipt, "tool-selection receipt present", "tool-selection receipt missing");
  }
  if (text.includes("canvas signature")) {
    return profileReceiptSignalStatus(hasCanvasSignatureChange, "canvas signature change evidence present", "canvas signature evidence missing");
  }
  if (text.includes("selector count") || text.includes("visible count") || text.includes("control visibility") || text.includes("reachability gate") || text.includes("visible control")) {
    return profileReceiptSignalStatus(hasReachability, "selector visibility or reachability evidence present", "reachability evidence missing");
  }
  if (text.includes("overflow") || text.includes("clipped") || text.includes("fit")) {
    return profileReceiptSignalStatus(hasOverflowEvidence, "overflow evidence present", "overflow evidence missing");
  }
  if (text.includes("click receipt") || text.includes("obstruction receipt") || text.includes("state mutation")) {
    return profileReceiptSignalStatus(clickCount > 0 || setupObstructionCount > 0, "click or obstruction receipt present", "click or obstruction receipt missing");
  }
  if (text.includes("target selector") || text.includes("target selector/text")) {
    return profileReceiptSignalStatus(hasReachability || hasTextVisibility, "selector or text check evidence present", "selector/text evidence missing");
  }
  if (text.includes("intercepting element")) {
    if (setupObstructionCount > 0) return { status: "present", reason: "obstruction receipt present" };
    return setupFailureCount > 0
      ? { status: "missing", reason: "setup failed without intercepting element evidence" }
      : { status: "manual", reason: "only applies when blocked" };
  }
  if (text.includes("before and after state")) {
    return profileReceiptSignalStatus(
      hasStateContract || valueReceipts.length >= 2 || screenshotCount >= 2,
      "before/after state evidence present",
      "before/after state evidence missing",
    );
  }
  if (text.includes("screenshot")) {
    const needsBoundaryScreenshots = text.includes("each") || text.includes("before and after") || text.includes("state boundary");
    return profileReceiptSignalStatus(
      needsBoundaryScreenshots ? screenshotCount >= 2 : screenshotCount > 0,
      needsBoundaryScreenshots ? "multiple screenshots present" : "screenshot evidence present",
      needsBoundaryScreenshots ? "multiple screenshots missing" : "screenshot evidence missing",
    );
  }
  if (
    text.includes("input")
    && (
      text.includes("playability")
      || text.includes("moving")
      || text.includes("steering")
      || text.includes("real")
      || text.includes("natural")
    )
  ) {
    const needsAcceptedInput = text.includes("steering") || text.includes("accepted");
    const hasInputDispatch = inputDispatchCount > 0 || hasNaturalInput;
    const hasInputStateReceipt = needsAcceptedInput
      ? hasAcceptedPlayabilityInputReceipt
      : (hasAcceptedPlayabilityInputReceipt || hasMovingPlayabilityReceipt);
    return profileReceiptSignalStatus(
      hasInputDispatch && hasInputStateReceipt,
      needsAcceptedInput ? "accepted playability input receipt present" : "playability input receipt present",
      needsAcceptedInput ? "accepted playability input receipt missing" : "playability input receipt missing",
    );
  }
  if (text.includes("input dispatch") || text.includes("pointer") || text.includes("touch") || text.includes("key event") || text.includes("trusted-event")) {
    if (text.includes("key_down") || text.includes("key down") || text.includes("key-up") || text.includes("key_up")) {
      const hasSpecificKeyboardDispatch = text.includes("shift")
        ? hasShiftKeyDownReceipt && hasShiftKeyUpReceipt
        : hasKeyboardKeyDownReceipt && hasKeyboardKeyUpReceipt;
      return profileReceiptSignalStatus(
        hasSpecificKeyboardDispatch,
        "keyboard key_down/key_up dispatch evidence present",
        "keyboard key_down/key_up dispatch evidence missing",
      );
    }
    return profileReceiptSignalStatus(inputDispatchCount > 0 || hasNaturalInput, "input dispatch evidence present", "input dispatch evidence missing");
  }
  if (text.includes("offline audio") || (text.includes("audio") && text.includes("metric"))) {
    return profileReceiptSignalStatus(
      hasOfflineAudioMetricsReceipt,
      "offline audio metric receipt present",
      "offline audio metric receipt missing",
    );
  }
  if (text.includes("measured") || text.includes("state-change") || text.includes("pixel delta") || text.includes("movement receipt") || text.includes("canvas hash")) {
    return profileReceiptSignalStatus(hasMeasuredStateChange, "measured-change evidence present", "measured-change evidence missing");
  }

  return { status: "manual", reason: "semantic receipt requires audit review" };
}

function profilePackMetadataMarkdown(result: RiddleProofProfileResult): string[] {
  const metadata = cliRecord(result.metadata);
  if (!metadata) return [];

  const packId = cliString(metadata.pack_id);
  const packPublicName = cliString(metadata.pack_public_name);
  const requiredReceipts = profileMetadataStringArray(metadata.required_receipts);
  if (!packId && !packPublicName && !requiredReceipts.length) return [];

  const lines: string[] = [];
  const packParts = [
    packId ? markdownInlineCode(packId) : "",
    packPublicName ? packPublicName : "",
  ].filter(Boolean);
  if (packParts.length) lines.push(`- pack: ${packParts.join(" - ")}`);
  if (requiredReceipts.length) {
    const receiptStatuses = requiredReceipts.map((receipt) => ({
      receipt,
      item: profilePackReceiptStatus(result, metadata, receipt),
    }));
    const missingReceipts = receiptStatuses.filter(({ item }) => item.status === "missing").map(({ receipt }) => receipt);
    const failedReceipts = receiptStatuses.filter(({ item }) => item.status === "failed").map(({ receipt }) => receipt);
    const manualCount = receiptStatuses.filter(({ item }) => item.status === "manual").length;
    const presentCount = receiptStatuses.filter(({ item }) => item.status === "present").length;
    const completenessParts = [
      `${presentCount} present`,
      manualCount ? `${manualCount} manual` : "",
      missingReceipts.length ? `${missingReceipts.length} missing` : "",
      failedReceipts.length ? `${failedReceipts.length} failed` : "",
    ].filter(Boolean);
    lines.push(`- pack completeness: ${missingReceipts.length || failedReceipts.length ? "incomplete" : "complete"} (${completenessParts.join(", ")})`);
    if (missingReceipts.length) {
      const listed = missingReceipts.slice(0, 5).map((receipt) => markdownInlineCode(receipt, 120)).join(", ");
      lines.push(`- missing required receipts: ${listed}${missingReceipts.length > 5 ? `, ${missingReceipts.length - 5} more` : ""}`);
    }
    if (failedReceipts.length) {
      const listed = failedReceipts.slice(0, 5).map((receipt) => markdownInlineCode(receipt, 120)).join(", ");
      lines.push(`- failed required receipts: ${listed}${failedReceipts.length > 5 ? `, ${failedReceipts.length - 5} more` : ""}`);
    }
    lines.push(`- required receipts: ${requiredReceipts.length}`);
    for (const { receipt, item } of receiptStatuses.slice(0, 20)) {
      lines.push(`  - ${item.status}: ${receipt} (${item.reason})`);
    }
    if (requiredReceipts.length > 20) lines.push(`  - ${requiredReceipts.length - 20} additional required receipt(s) omitted.`);
  }

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

function observeWithinMarkdownReceipt(evidence: Record<string, unknown>): string | undefined {
  const viewports = Array.isArray(evidence.viewports)
    ? evidence.viewports.map(cliRecord).filter((viewport): viewport is Record<string, unknown> => Boolean(viewport))
    : [];
  if (!viewports.length) return undefined;
  const receipts = viewports.slice(0, 4).map((viewport) => {
    const name = cliString(viewport.viewport) || cliString(viewport.name) || "viewport";
    const matched = viewport.matched === true ? "matched" : viewport.matched === false ? "missed" : "observed";
    const elapsedMs = cliFiniteNumber(viewport.elapsed_ms);
    const attempts = cliFiniteNumber(viewport.attempts);
    const sample = cliString(viewport.sample);
    return `${name} ${matched}${elapsedMs === undefined ? "" : ` in ${elapsedMs}ms`}${attempts === undefined ? "" : `, ${attempts} attempt${attempts === 1 ? "" : "s"}`}${sample ? `, sample ${markdownInlineCode(sample, 70)}` : ""}`;
  });
  if (viewports.length > receipts.length) receipts.push(`${viewports.length - receipts.length} more viewport${viewports.length - receipts.length === 1 ? "" : "s"}`);
  return receipts.join("; ");
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
  if (check.type === "observe_within") {
    const textTarget = profileCheckTextTarget(evidence);
    const timeoutMs = cliFiniteNumber(evidence.timeout_ms);
    const withinLabel = timeoutMs === undefined ? "within timeout" : `within ${timeoutMs}ms`;
    const receipt = observeWithinMarkdownReceipt(evidence);
    const base = selector && textTarget
      ? `${markdownInlineCode(selector)} observes ${textTarget} ${withinLabel}`
      : selector
        ? `${markdownInlineCode(selector)} visible ${withinLabel}`
        : textTarget
          ? `${textTarget} ${withinLabel}`
          : withinLabel;
    return receipt ? `${base}; ${receipt}` : base;
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
    const totalConsoleCount = cliFiniteNumber(evidence.total_console_warning_count);
    const allowedConsoleCount = cliFiniteNumber(evidence.allowed_console_warning_count);
    const allowedTextCount = Array.isArray(evidence.allowed_console_texts)
      ? evidence.allowed_console_texts.filter((value) => typeof value === "string" && value.trim()).length
      : 0;
    const allowedPatternCount = Array.isArray(evidence.allowed_console_patterns)
      ? evidence.allowed_console_patterns.filter((value) => typeof value === "string" && value.trim()).length
      : 0;
    const parts = [`${warningCount} unallowed warning${warningCount === 1 ? "" : "s"}`];
    if (totalConsoleCount !== undefined && allowedConsoleCount !== undefined) {
      parts.push(`${allowedConsoleCount}/${totalConsoleCount} warning${totalConsoleCount === 1 ? "" : "s"} allowed`);
    }
    if (allowedTextCount || allowedPatternCount) {
      parts.push(`allowlist ${allowedTextCount} text${allowedTextCount === 1 ? "" : "s"}, ${allowedPatternCount} pattern${allowedPatternCount === 1 ? "" : "s"}`);
    }
    return parts.join(", ");
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

function cliReturnSummaryLabel(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const parts = value
    .map(cliRecord)
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => {
      const label = cliString(item.label) || cliString(item.path) || "value";
      const observed = item.exists === false ? "missing" : cliValueLabel(item.value);
      return `${label}=${observed ?? "null"}`;
    })
    .filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

function setupFailureObstructionSnippet(reason: string | undefined): string | undefined {
  if (!reason || !reason.includes("intercepts pointer events")) return undefined;
  const line = reason.split(/\r?\n/).find((item) => item.includes("intercepts pointer events"));
  const match = line?.match(/-\s+(.+?)\s+intercepts pointer events/);
  const snippet = match?.[1]?.replace(/\s+/g, " ").trim();
  return snippet || undefined;
}

function setupReceiptArray(viewport: Record<string, unknown>, key: string): Record<string, unknown>[] {
  return Array.isArray(viewport[key])
    ? viewport[key].map(cliRecord).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
}

function setupReturnSummaryValue(receipt: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    if (receipt[name] !== undefined) return receipt[name];
  }
  return setupReturnedSummaryValue(receipt, names);
}

function setupReturnedSummaryValue(receipt: Record<string, unknown>, names: string[]): unknown {
  const returned = cliRecord(receipt.returned);
  for (const name of names) {
    if (returned?.[name] !== undefined) return returned[name];
  }
  const summaries = Array.isArray(receipt.return_summary)
    ? receipt.return_summary.map(cliRecord).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
  for (const item of summaries) {
    const label = cliString(item.label);
    const path = cliString(item.path);
    if (names.some((name) => label === name || path === name)) return item.value;
  }
  return undefined;
}

function setupMetricPart(receipts: Record<string, unknown>[], label: string, names: string[] = [label]): string | undefined {
  for (const receipt of receipts) {
    const value = setupReturnSummaryValue(receipt, names);
    const valueLabel = cliValueLabel(value);
    if (valueLabel !== undefined) return `${label}=${valueLabel}`;
  }
  return undefined;
}

function setupInputReceiptLabel(kind: string, receipt: Record<string, unknown>): string {
  const selector = cliString(receipt.selector);
  const pointerType = cliString(receipt.pointer_type);
  const inputDispatch = cliString(receipt.input_dispatch);
  const key = cliString(receipt.key);
  return [
    kind,
    selector ? markdownInlineCode(selector) : "",
    pointerType ? markdownInlineCode(pointerType) : "",
    key ? markdownInlineCode(key) : "",
    inputDispatch ? `via ${markdownInlineCode(inputDispatch)}` : "",
  ].filter(Boolean).join(" ");
}

function setupCanvasHashChangeLabel(receipts: Record<string, unknown>[]): string | undefined {
  const changed = receipts.find((receipt) => cliString(receipt.previous_hash) && cliString(receipt.hash) && receipt.changed === true);
  if (changed) return `${markdownInlineCode(cliString(changed.previous_hash) || "")} -> ${markdownInlineCode(cliString(changed.hash) || "")}`;

  const hashes = receipts
    .map((receipt) => cliString(receipt.hash))
    .filter((hash): hash is string => Boolean(hash));
  const first = hashes[0];
  const last = [...hashes].reverse().find((hash) => hash !== first);
  return first && last ? `${markdownInlineCode(first)} -> ${markdownInlineCode(last)}` : undefined;
}

function setupNaturalInputSummaryMarkdown(viewports: Record<string, unknown>[]): string[] {
  const lines: string[] = [];
  for (const viewport of viewports.slice(0, 8)) {
    const name = cliString(viewport.name) || "viewport";
    const inputReceipts = [
      ...setupReceiptArray(viewport, "drag").map((receipt) => ({ kind: "drag", receipt })),
      ...setupReceiptArray(viewport, "tap").map((receipt) => ({ kind: "tap", receipt })),
      ...setupReceiptArray(viewport, "tap_until").map((receipt) => ({ kind: "tap_until", receipt })),
      ...setupReceiptArray(viewport, "press").map((receipt) => ({ kind: "press", receipt })),
    ].filter(({ receipt }) => receipt.ok !== false);
    if (!inputReceipts.length) continue;

    const valueReceipts = [
      ...setupReceiptArray(viewport, "window_eval"),
      ...setupReceiptArray(viewport, "window_call"),
    ].filter((receipt) => receipt.ok !== false);
    const canvasReceipts = setupReceiptArray(viewport, "canvas_signature").filter((receipt) => receipt.ok !== false);
    const eventParts = [
      setupMetricPart(valueReceipts, "pointerDowns"),
      setupMetricPart(valueReceipts, "pointerMoves"),
      setupMetricPart(valueReceipts, "pointerUps"),
      setupMetricPart(valueReceipts, "trustedEvents"),
      setupMetricPart(valueReceipts, "eventCount"),
    ].filter((part): part is string => Boolean(part));
    const pixelParts = [
      setupMetricPart(valueReceipts, "nonWhiteDelta"),
      setupMetricPart(valueReceipts, "darkDelta"),
    ].filter((part): part is string => Boolean(part));
    const hashChange = setupCanvasHashChangeLabel(canvasReceipts);
    if (!eventParts.length && !pixelParts.length && !hashChange) continue;

    const inputText = inputReceipts
      .slice(0, 3)
      .map(({ kind, receipt }) => setupInputReceiptLabel(kind, receipt))
      .join(", ");
    const parts = [
      inputText,
      eventParts.length ? `events ${eventParts.join(", ")}` : "",
      pixelParts.length ? `pixel deltas ${pixelParts.join(", ")}` : "",
      hashChange ? `canvas hash ${hashChange}` : "",
    ].filter(Boolean);
    lines.push(`- natural input ${name}: ${parts.join("; ")}`);
  }
  return lines;
}

function reachabilityFailureReason(reason: string | undefined): string | undefined {
  if (!reason) return undefined;
  const noVisibleMatch = /No visible match for selector [\s\S]*?:\s*([^\n]+)/.exec(reason);
  if (noVisibleMatch?.[1]) return noVisibleMatch[1].trim().slice(0, 120);
  if (/no_visible_match/.test(reason)) return "no_visible_match";
  if (/not visible/i.test(reason)) return "not_visible";
  return undefined;
}

function viewportTopBoundsOverflowPx(viewport: Record<string, unknown>): number | undefined {
  const direct = cliFiniteNumber(viewport.bounds_overflow_px);
  if (direct !== undefined && direct > 0) return direct;
  const offenders = Array.isArray(viewport.overflow_offenders)
    ? viewport.overflow_offenders.map(cliRecord).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
  for (const offender of offenders) {
    const overflow = cliFiniteNumber(offender.bounds_overflow_px)
      ?? cliFiniteNumber(offender.overflow_px)
      ?? cliFiniteNumber(offender.overflow);
    if (overflow !== undefined && overflow > 0) return overflow;
  }
  const scrollOverflow = cliFiniteNumber(viewport.overflow_px);
  return scrollOverflow !== undefined && scrollOverflow > 0 ? scrollOverflow : undefined;
}

function profileReachabilitySummaryMarkdown(result: RiddleProofProfileResult): string[] {
  const evidenceViewports = Array.isArray(result.evidence?.viewports)
    ? result.evidence.viewports.map((viewport) => cliRecord(viewport)).filter((viewport): viewport is Record<string, unknown> => Boolean(viewport))
    : [];
  if (!evidenceViewports.length) return [];

  const evidenceByName = new Map<string, Record<string, unknown>>();
  for (const viewport of evidenceViewports) {
    const name = cliString(viewport.name);
    if (name) evidenceByName.set(name, viewport);
  }

  const receipts: string[] = [];
  const seen = new Set<string>();
  const addReceipt = (viewportName: string, selector: string, reason: string | undefined) => {
    const viewport = evidenceByName.get(viewportName);
    if (!viewport) return;
    const selectors = cliRecord(viewport.selectors);
    const selectorEvidence = cliRecord(selectors?.[selector]);
    const count = cliFiniteNumber(selectorEvidence?.count);
    const visibleCount = cliFiniteNumber(selectorEvidence?.visible_count);
    if (count === undefined || count <= 0 || visibleCount === undefined || visibleCount > 0) return;
    const key = `${viewportName}\0${selector}`;
    if (seen.has(key)) return;
    seen.add(key);
    const reasonText = reason || "no_visible_match";
    const boundsOverflow = viewportTopBoundsOverflowPx(viewport);
    receipts.push(`- reachability ${viewportName}: ${markdownInlineCode(selector, 120)} exists ${count}, visible ${visibleCount}, reason ${markdownInlineCode(reasonText, 80)}${boundsOverflow === undefined ? "" : `, top bounds overflow ${boundsOverflow}px`}`);
  };

  const setupCheck = result.checks.find((check) => check.type === "setup_actions_succeeded");
  const setupSummary = cliRecord(setupCheck?.evidence?.setup_summary);
  const setupViewports = Array.isArray(setupSummary?.viewports)
    ? setupSummary.viewports.map(cliRecord).filter((viewport): viewport is Record<string, unknown> => Boolean(viewport))
    : [];
  for (const viewport of setupViewports) {
    const viewportName = cliString(viewport.name) || "viewport";
    const failed = [
      ...(Array.isArray(viewport.failed) ? viewport.failed : []),
      ...(Array.isArray(viewport.optional_failed) ? viewport.optional_failed : []),
    ].map(cliRecord).filter((failure): failure is Record<string, unknown> => Boolean(failure));
    for (const failure of failed) {
      const selector = cliString(failure.selector);
      const reason = reachabilityFailureReason(cliString(failure.reason));
      if (selector && reason) addReceipt(viewportName, selector, reason);
    }
  }

  for (const check of result.checks) {
    if (check.type !== "selector_visible" || check.status !== "failed") continue;
    const evidence = cliRecord(check.evidence);
    const selector = cliString(evidence?.selector);
    if (!selector) continue;
    for (const viewport of evidenceViewports) {
      const viewportName = cliString(viewport.name) || "viewport";
      addReceipt(viewportName, selector, "no_visible_match");
    }
  }

  if (receipts.length > 8) {
    return [...receipts.slice(0, 8), `- ${receipts.length - 8} additional reachability receipt(s) omitted.`];
  }
  return receipts;
}

function stateContractReceiptName(receipt: Record<string, unknown>, fallbackIndex: number): string {
  const storedTo = cliString(receipt.return_stored_to);
  if (!storedTo) return `receipt-${fallbackIndex + 1}`;
  const parts = storedTo.split(".").map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] || storedTo;
}

function stateContractReceiptValue(receipt: Record<string, unknown>): string | undefined {
  const value = setupReturnSummaryValue(receipt, [
    "state",
    "nextState",
    "terminalState",
    "finalState",
    "status",
    "phase",
  ]);
  return cliValueLabel(value);
}

function stateContractSignalParts(receipts: Record<string, unknown>[]): string[] {
  const names = [
    "hasValidate",
    "hasTryFix",
    "hasErrorDetail",
    "hasValid",
    "hasInvalid",
    "invalidGone",
    "staleGone",
    "staleCopyGone",
    "repairedTrailingCommaGone",
    "hasSuccess",
    "hasFailure",
    "hasRetry",
    "hasError",
    "success",
    "recovered",
  ];
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const receipt of receipts) {
    for (const name of names) {
      const value = setupReturnSummaryValue(receipt, [name]);
      if (value === undefined) continue;
      const label = cliValueLabel(value);
      if (label === undefined) continue;
      const part = `${name}=${label}`;
      if (seen.has(part)) continue;
      seen.add(part);
      parts.push(part);
      if (parts.length >= 8) return parts;
    }
  }
  return parts;
}

function profileStateContractSummaryMarkdown(result: RiddleProofProfileResult): string[] {
  const setupCheck = result.checks.find((check) => check.type === "setup_actions_succeeded");
  const setupSummary = cliRecord(setupCheck?.evidence?.setup_summary);
  const viewports = Array.isArray(setupSummary?.viewports)
    ? setupSummary.viewports.map(cliRecord).filter((viewport): viewport is Record<string, unknown> => Boolean(viewport))
    : [];
  const lines: string[] = [];
  for (const viewport of viewports.slice(0, 8)) {
    const name = cliString(viewport.name) || "viewport";
    const receipts = [
      ...setupReceiptArray(viewport, "window_eval"),
      ...setupReceiptArray(viewport, "window_call"),
      ...setupReceiptArray(viewport, "window_call_until"),
    ].filter((receipt) => receipt.ok !== false);
    const states = receipts
      .map((receipt, index) => ({
        name: stateContractReceiptName(receipt, index),
        state: stateContractReceiptValue(receipt),
      }))
      .filter((receipt): receipt is { name: string; state: string } => Boolean(receipt.state));
    if (states.length < 2) continue;
    const stateChain = states
      .slice(0, 6)
      .map((receipt) => `${markdownInlineCode(receipt.name, 60)}=${markdownInlineCode(receipt.state, 80)}`)
      .join(" -> ");
    const omitted = states.length > 6 ? ` (+${states.length - 6} more)` : "";
    const signals = stateContractSignalParts(receipts);
    lines.push(`- state contract ${name}: ${stateChain}${omitted}${signals.length ? `; signals ${signals.map((part) => markdownInlineCode(part, 80)).join(", ")}` : ""}`);
  }
  return lines;
}

function sideCaveatAllowlistPart(evidence: Record<string, unknown>, totalKey: string, allowedKey: string): string | undefined {
  const total = cliFiniteNumber(evidence[totalKey]);
  const allowed = cliFiniteNumber(evidence[allowedKey]);
  if (total === undefined || allowed === undefined || allowed <= 0) return undefined;
  return `${allowed}/${total} allowed`;
}

function sideCaveatAllowlistCounts(evidence: Record<string, unknown>): string | undefined {
  const textCount = Array.isArray(evidence.allowed_console_texts)
    ? evidence.allowed_console_texts.filter((value) => typeof value === "string" && value.trim()).length
    : 0;
  const patternCount = Array.isArray(evidence.allowed_console_patterns)
    ? evidence.allowed_console_patterns.filter((value) => typeof value === "string" && value.trim()).length
    : 0;
  return textCount || patternCount
    ? `allowlist ${textCount} text${textCount === 1 ? "" : "s"}, ${patternCount} pattern${patternCount === 1 ? "" : "s"}`
    : undefined;
}

function overflowCheckFailed(result: RiddleProofProfileResult): boolean {
  return result.checks.some((check) => (
    check.status === "failed"
    && (
      check.type === "no_horizontal_overflow"
      || check.type === "no_mobile_horizontal_overflow"
      || check.type === "frame_no_horizontal_overflow"
    )
  ));
}

function sideCaveatOverflowLine(viewport: Record<string, unknown>): string | undefined {
  const name = cliString(viewport.name) || "viewport";
  const scrollOverflow = cliFiniteNumber(viewport.overflow_px);
  const boundsOverflow = cliFiniteNumber(viewport.bounds_overflow_px);
  if ((scrollOverflow === undefined || scrollOverflow <= 0) && (boundsOverflow === undefined || boundsOverflow <= 0)) return undefined;
  const parts = [
    scrollOverflow !== undefined && scrollOverflow > 0 ? `scroll overflow ${scrollOverflow}px` : "",
    boundsOverflow !== undefined && boundsOverflow > 0 ? `bounds overflow ${boundsOverflow}px` : "",
  ].filter(Boolean);
  const offenders = Array.isArray(viewport.overflow_offenders)
    ? viewport.overflow_offenders.map(cliRecord).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
  const offender = offenders.find((item) => {
    const overflow = cliFiniteNumber(item.bounds_overflow_px) ?? cliFiniteNumber(item.overflow_px) ?? cliFiniteNumber(item.overflow);
    return overflow !== undefined && overflow > 0;
  });
  const offenderSelector = cliString(offender?.selector);
  const offenderOverflow = offender
    ? cliFiniteNumber(offender.bounds_overflow_px) ?? cliFiniteNumber(offender.overflow_px) ?? cliFiniteNumber(offender.overflow)
    : undefined;
  return `- side caveat layout ${name}: ${parts.join(", ")}${offenderSelector && offenderOverflow !== undefined ? `; top offender ${markdownInlineCode(offenderSelector, 100)} ${offenderOverflow}px` : ""}`;
}

function profileSideCaveatSummaryMarkdown(result: RiddleProofProfileResult): string[] {
  const lines: string[] = [];

  for (const check of result.checks) {
    if (check.status !== "passed") continue;
    const evidence = cliRecord(check.evidence);
    if (!evidence) continue;
    if (check.type === "no_console_warnings") {
      const allowed = sideCaveatAllowlistPart(evidence, "total_console_warning_count", "allowed_console_warning_count");
      if (allowed) {
        const allowlist = sideCaveatAllowlistCounts(evidence);
        lines.push(`- side caveat console warnings: ${allowed}${allowlist ? `; ${allowlist}` : ""}`);
      }
    }
    if (check.type === "no_fatal_console_errors") {
      const consoleAllowed = sideCaveatAllowlistPart(evidence, "total_console_fatal_count", "allowed_console_fatal_count");
      const pageAllowed = sideCaveatAllowlistPart(evidence, "total_page_error_count", "allowed_page_error_count");
      const parts = [
        consoleAllowed ? `console fatal ${consoleAllowed}` : "",
        pageAllowed ? `page errors ${pageAllowed}` : "",
        sideCaveatAllowlistCounts(evidence),
      ].filter(Boolean);
      if (parts.length) lines.push(`- side caveat fatal errors: ${parts.join("; ")}`);
    }
  }

  if (!overflowCheckFailed(result) && Array.isArray(result.evidence?.viewports)) {
    for (const viewport of result.evidence.viewports.slice(0, 8)) {
      const line = sideCaveatOverflowLine(cliRecord(viewport) || {});
      if (line) lines.push(line);
    }
    if (result.evidence.viewports.length > 8) lines.push(`- ${result.evidence.viewports.length - 8} additional viewport side caveat(s) omitted.`);
  }

  return lines.slice(0, 12);
}

type CliSetupReceiptDetail = { name: string; receipt: Record<string, unknown> };

function balancedSetupReceiptDetails(groups: CliSetupReceiptDetail[][], limit: number): CliSetupReceiptDetail[] {
  if (limit <= 0) return [];
  const total = groups.reduce((sum, group) => sum + group.length, 0);
  if (total <= limit) return groups.flat();

  const selected: CliSetupReceiptDetail[] = [];
  const selectedKeys = new Set<string>();
  const indexes = new Array(groups.length).fill(0);
  const nonEmptyIndexes = groups
    .map((group, index) => group.length ? index : -1)
    .filter((index) => index >= 0);

  const pushReceipt = (groupIndex: number, itemIndex: number, advance = true) => {
    const receipt = groups[groupIndex][itemIndex];
    if (!receipt) return false;
    const key = `${groupIndex}:${itemIndex}`;
    if (selectedKeys.has(key)) return false;
    selected.push(receipt);
    selectedKeys.add(key);
    if (advance) indexes[groupIndex] = Math.max(indexes[groupIndex], itemIndex + 1);
    return true;
  };

  for (const index of nonEmptyIndexes) {
    if (selected.length >= limit) return selected;
    pushReceipt(index, 0);
  }

  for (const index of nonEmptyIndexes) {
    if (selected.length >= limit) return selected;
    const lastIndex = groups[index].length - 1;
    if (lastIndex > 0) pushReceipt(index, lastIndex, false);
  }

  while (selected.length < limit) {
    let progressed = false;
    for (const index of nonEmptyIndexes) {
      const nextIndex = indexes[index];
      if (nextIndex >= groups[index].length) continue;
      progressed = pushReceipt(index, nextIndex) || progressed;
      if (selected.length >= limit) break;
    }
    if (!progressed) break;
  }
  return selected;
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
  const balancePreflight = blocker.balance_preflight === true;
  const jobCount = cliFiniteNumber(blocker.job_count);
  const secondsPerJob = cliFiniteNumber(blocker.seconds_per_job);
  const apiKeySource = cliString(blocker.api_key_source);
  const apiKeyFile = cliString(blocker.api_key_file);

  if (reason) lines.push(`- reason: ${reason}`);
  if (source || endpoint || httpStatus !== undefined) {
    lines.push(`- source: ${source || "runner"}${endpoint ? ` ${endpoint}` : ""}${httpStatus === undefined ? "" : ` HTTP ${httpStatus}`}`);
  }
  if (balancePreflight) lines.push("- preflight: balance");
  if (error) lines.push(`- error: ${error}`);
  if (jobCount !== undefined || secondsPerJob !== undefined) {
    lines.push(`- job estimate: ${jobCount ?? "unknown"} job(s), ${secondsPerJob ?? "unknown"}s minimum per job`);
  }
  if (requiredSeconds !== undefined || availableSeconds !== undefined || deficitSeconds !== undefined) {
    lines.push(`- seconds: required ${requiredSeconds ?? "unknown"}, available ${availableSeconds ?? "unknown"}, deficit ${deficitSeconds ?? "unknown"}`);
  }
  if (minimumPurchaseDollars !== undefined) lines.push(`- minimum purchase: $${minimumPurchaseDollars}`);
  if (apiKeySource) lines.push(`- auth: ${apiKeySource}${apiKeyFile ? ` ${apiKeyFile}` : ""}`);
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
  const clickSequenceTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.click_sequence_total) || 0), 0);
  const clickCountActionTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.click_count_action_total) || 0), 0);
  const clickCountValueTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.click_count_value_total) || 0), 0);
  const windowCallTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.window_call_total) || 0), 0);
  const windowCallStoredTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.window_call_stored_total) || 0), 0);
  const windowCallCapturedTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.window_call_captured_total) || 0), 0);
  const windowEvalTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.window_eval_total) || 0), 0);
  const windowEvalStoredTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.window_eval_stored_total) || 0), 0);
  const windowEvalCapturedTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.window_eval_captured_total) || 0), 0);
  const deterministicRuntimeTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.deterministic_runtime_total) || 0), 0);
  const windowCallUntilTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.window_call_until_total) || 0), 0);
  const windowCallUntilCallTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.window_call_until_call_total) || 0), 0);
  const rangeValueTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.set_range_value_total) || 0), 0);
  const dragTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.drag_total) || 0), 0);
  const tapTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.tap_total) || 0), 0);
  const tapUntilTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.tap_until_total) || 0), 0);
  const tapUntilTapTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.tap_until_tap_total) || 0), 0);
  const keyboardTotal = viewports.reduce((sum, viewport) => {
    const total = cliFiniteNumber(viewport.keyboard_total);
    return sum + (total === undefined ? (cliFiniteNumber(viewport.press_total) || 0) : total);
  }, 0);
  const canvasSignatureTotal = viewports.reduce((sum, viewport) => sum + (cliFiniteNumber(viewport.canvas_signature_total) || 0), 0);
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
  if (clickSequenceTotal) {
    lines.push(`- click sequences: ${clickSequenceTotal} group(s)`);
  }
  if (windowCallTotal) {
    lines.push(`- window_call: ${windowCallTotal} action(s), stored returns ${windowCallStoredTotal}, captured returns ${windowCallCapturedTotal}`);
  }
  if (windowEvalTotal) {
    lines.push(`- window_eval: ${windowEvalTotal} action(s), stored returns ${windowEvalStoredTotal}, captured returns ${windowEvalCapturedTotal}`);
  }
  if (deterministicRuntimeTotal) {
    lines.push(`- deterministic_runtime: ${deterministicRuntimeTotal} action(s)`);
  }
  if (windowCallUntilTotal) {
    lines.push(`- window_call_until: ${windowCallUntilTotal} action(s), call_count total ${windowCallUntilCallTotal}`);
  }
  if (rangeValueTotal) {
    lines.push(`- set_range_value: ${rangeValueTotal} action(s)`);
  }
  if (dragTotal) {
    lines.push(`- drag: ${dragTotal} action(s)`);
  }
  if (tapTotal) {
    lines.push(`- tap: ${tapTotal} action(s)`);
  }
  if (tapUntilTotal) {
    lines.push(`- tap_until: ${tapUntilTotal} action(s), tap_count total ${tapUntilTapTotal}`);
  }
  if (keyboardTotal) {
    lines.push(`- keyboard: ${keyboardTotal} action(s)`);
  }
  if (canvasSignatureTotal) {
    lines.push(`- canvas_signature: ${canvasSignatureTotal} action(s)`);
  }
  lines.push(...setupNaturalInputSummaryMarkdown(viewports));

  for (const viewport of viewports.slice(0, 8)) {
    const name = cliString(viewport.name) || "viewport";
    const ok = viewport.ok === false ? "failed" : "ok";
    const resultCount = cliFiniteNumber(viewport.result_count) || 0;
    const screenshotCount = Array.isArray(viewport.setup_screenshots)
      ? viewport.setup_screenshots.filter((label) => typeof label === "string" && label.trim()).length
      : 0;
    const clicked = cliFiniteNumber(viewport.clicked_total) || 0;
    const clickSequenceCount = cliFiniteNumber(viewport.click_sequence_total) || 0;
    const clickCountActions = cliFiniteNumber(viewport.click_count_action_total) || 0;
    const windowCallActions = cliFiniteNumber(viewport.window_call_total) || 0;
    const windowCallStored = cliFiniteNumber(viewport.window_call_stored_total) || 0;
    const windowCallCaptured = cliFiniteNumber(viewport.window_call_captured_total) || 0;
    const windowEvalActions = cliFiniteNumber(viewport.window_eval_total) || 0;
    const windowEvalStored = cliFiniteNumber(viewport.window_eval_stored_total) || 0;
    const windowEvalCaptured = cliFiniteNumber(viewport.window_eval_captured_total) || 0;
    const deterministicRuntimeActions = cliFiniteNumber(viewport.deterministic_runtime_total) || 0;
    const windowCallUntilActions = cliFiniteNumber(viewport.window_call_until_total) || 0;
    const windowCallUntilCalls = cliFiniteNumber(viewport.window_call_until_call_total) || 0;
    const rangeValueActions = cliFiniteNumber(viewport.set_range_value_total) || 0;
    const dragActions = cliFiniteNumber(viewport.drag_total) || 0;
    const tapActions = cliFiniteNumber(viewport.tap_total) || 0;
    const tapUntilActions = cliFiniteNumber(viewport.tap_until_total) || 0;
    const tapUntilTaps = cliFiniteNumber(viewport.tap_until_tap_total) || 0;
    const keyboardActions = cliFiniteNumber(viewport.keyboard_total) ?? cliFiniteNumber(viewport.press_total) ?? 0;
    const canvasSignatureActions = cliFiniteNumber(viewport.canvas_signature_total) || 0;
    const observedPath = cliString(viewport.observed_path);
    lines.push(`- ${name}: ${ok}, ${resultCount} result(s), ${screenshotCount} setup screenshot(s), ${clicked} click(s)${clickSequenceCount ? `, ${clickSequenceCount} click sequence(s)` : ""}${clickCountActions ? `, ${clickCountActions} click_count action(s)` : ""}${rangeValueActions ? `, ${rangeValueActions} set_range_value action(s)` : ""}${dragActions ? `, ${dragActions} drag action(s)` : ""}${tapActions ? `, ${tapActions} tap action(s)` : ""}${tapUntilActions ? `, ${tapUntilActions} tap_until action(s), ${tapUntilTaps} tap(s)` : ""}${keyboardActions ? `, ${keyboardActions} keyboard action(s)` : ""}${canvasSignatureActions ? `, ${canvasSignatureActions} canvas_signature action(s)` : ""}${deterministicRuntimeActions ? `, ${deterministicRuntimeActions} deterministic_runtime action(s)` : ""}${windowCallActions ? `, ${windowCallActions} window_call action(s), ${windowCallStored} stored return(s), ${windowCallCaptured} captured return(s)` : ""}${windowEvalActions ? `, ${windowEvalActions} window_eval action(s), ${windowEvalStored} stored return(s), ${windowEvalCaptured} captured return(s)` : ""}${windowCallUntilActions ? `, ${windowCallUntilActions} window_call_until action(s), ${windowCallUntilCalls} call(s)` : ""}${observedPath ? `, path ${observedPath}` : ""}`);
  }
  const clickSequenceGroups = viewports.map((viewport) => {
    const name = cliString(viewport.name) || "viewport";
    const receipts = Array.isArray(viewport.click_sequences)
      ? viewport.click_sequences.map(cliRecord).filter((item): item is Record<string, unknown> => Boolean(item))
      : [];
    return receipts.map((receipt) => ({ name, receipt }));
  });
  const clickSequenceDetails = clickSequenceGroups.flat();
  const sampledClickSequenceDetails = balancedSetupReceiptDetails(clickSequenceGroups, 12);
  for (const { name, receipt } of sampledClickSequenceDetails) {
    const selectorTemplate = cliString(receipt.selector_template) || "target";
    const valueSource = cliString(receipt.value_source);
    const sequence = Array.isArray(receipt.sequence)
      ? receipt.sequence.map((value) => cliFiniteNumber(value)).filter((value): value is number => value !== undefined)
      : [];
    const sequenceText = sequence.join(",");
    const omittedSequenceCount = cliFiniteNumber(receipt.omitted_sequence_count) || 0;
    const clickTotal = cliFiniteNumber(receipt.click_total);
    const resultCount = cliFiniteNumber(receipt.result_count);
    const ordinals = Array.isArray(receipt.ordinals)
      ? receipt.ordinals.map((value) => cliFiniteNumber(value)).filter((value): value is number => value !== undefined)
      : [];
    const ordinalText = ordinals.length ? ordinals.join(",") : "";
    lines.push(`- ${name} click_sequence: ${markdownInlineCode(selectorTemplate)}${valueSource ? ` ${valueSource}` : ""}${sequenceText ? ` sequence ${markdownInlineCode(sequenceText, 160)}` : ""}${omittedSequenceCount ? ` (+${omittedSequenceCount} omitted)` : ""}${clickTotal === undefined ? "" : `, clicks ${clickTotal}`}${resultCount === undefined ? "" : `, results ${resultCount}`}${ordinalText ? `, ordinals ${markdownInlineCode(ordinalText, 120)}` : ""}`);
  }
  if (clickSequenceDetails.length > sampledClickSequenceDetails.length) lines.push(`- ${clickSequenceDetails.length - sampledClickSequenceDetails.length} additional click_sequence receipt(s) omitted.`);
  const dragGroups = viewports.map((viewport) => {
    const name = cliString(viewport.name) || "viewport";
    const receipts = Array.isArray(viewport.drag)
      ? viewport.drag.map(cliRecord).filter((item): item is Record<string, unknown> => Boolean(item))
      : [];
    return receipts.map((receipt) => ({ name, receipt }));
  });
  const dragDetails = dragGroups.flat();
  const sampledDragDetails = balancedSetupReceiptDetails(dragGroups, 12);
  for (const { name, receipt } of sampledDragDetails) {
    const selector = cliString(receipt.selector) || "target";
    const pointerType = cliString(receipt.pointer_type);
    const inputDispatch = cliString(receipt.input_dispatch);
    const coordinateMode = cliString(receipt.coordinate_mode);
    const fromX = cliValueLabel(receipt.from_x);
    const fromY = cliValueLabel(receipt.from_y);
    const toX = cliValueLabel(receipt.to_x);
    const toY = cliValueLabel(receipt.to_y);
    const steps = cliFiniteNumber(receipt.steps);
    const durationMs = cliFiniteNumber(receipt.duration_ms);
    const ok = receipt.ok === false ? "failed" : "ok";
    const reason = cliString(receipt.reason);
    const coordinateText = fromX && fromY && toX && toY
      ? `, ${coordinateMode ? `${coordinateMode} ` : ""}${markdownInlineCode(`${fromX},${fromY}`)} -> ${markdownInlineCode(`${toX},${toY}`)}`
      : "";
    lines.push(`- ${name} drag: ${ok}, ${markdownInlineCode(selector)}${pointerType ? ` ${markdownInlineCode(pointerType)}` : ""}${inputDispatch ? ` via ${markdownInlineCode(inputDispatch)}` : ""}${coordinateText}${steps === undefined ? "" : `, steps ${steps}`}${durationMs === undefined ? "" : `, duration ${durationMs}ms`}${reason ? `, reason ${markdownInlineCode(reason, 100)}` : ""}`);
  }
  if (dragDetails.length > sampledDragDetails.length) lines.push(`- ${dragDetails.length - sampledDragDetails.length} additional drag receipt(s) omitted.`);
  const tapGroups = viewports.map((viewport) => {
    const name = cliString(viewport.name) || "viewport";
    const receipts = Array.isArray(viewport.tap)
      ? viewport.tap.map(cliRecord).filter((item): item is Record<string, unknown> => Boolean(item))
      : [];
    return receipts.map((receipt) => ({ name, receipt }));
  });
  const tapDetails = tapGroups.flat();
  const sampledTapDetails = balancedSetupReceiptDetails(tapGroups, 12);
  for (const { name, receipt } of sampledTapDetails) {
    const selector = cliString(receipt.selector) || "target";
    const pointerType = cliString(receipt.pointer_type);
    const inputDispatch = cliString(receipt.input_dispatch);
    const coordinateMode = cliString(receipt.coordinate_mode);
    const x = cliValueLabel(receipt.x);
    const y = cliValueLabel(receipt.y);
    const durationMs = cliFiniteNumber(receipt.duration_ms);
    const ok = receipt.ok === false ? "failed" : "ok";
    const reason = cliString(receipt.reason);
    const coordinateText = x && y
      ? `, ${coordinateMode ? `${coordinateMode} ` : ""}${markdownInlineCode(`${x},${y}`)}`
      : "";
    lines.push(`- ${name} tap: ${ok}, ${markdownInlineCode(selector)}${pointerType ? ` ${markdownInlineCode(pointerType)}` : ""}${inputDispatch ? ` via ${markdownInlineCode(inputDispatch)}` : ""}${coordinateText}${durationMs === undefined ? "" : `, duration ${durationMs}ms`}${reason ? `, reason ${markdownInlineCode(reason, 100)}` : ""}`);
  }
  if (tapDetails.length > sampledTapDetails.length) lines.push(`- ${tapDetails.length - sampledTapDetails.length} additional tap receipt(s) omitted.`);
  const tapUntilGroups = viewports.map((viewport) => {
    const name = cliString(viewport.name) || "viewport";
    const receipts = Array.isArray(viewport.tap_until)
      ? viewport.tap_until.map(cliRecord).filter((item): item is Record<string, unknown> => Boolean(item))
      : [];
    return receipts.map((receipt) => ({ name, receipt }));
  });
  const tapUntilDetails = tapUntilGroups.flat();
  const sampledTapUntilDetails = balancedSetupReceiptDetails(tapUntilGroups, 12);
  for (const { name, receipt } of sampledTapUntilDetails) {
    const selector = cliString(receipt.selector) || "target";
    const pointerType = cliString(receipt.pointer_type);
    const inputDispatch = cliString(receipt.input_dispatch);
    const coordinateMode = cliString(receipt.coordinate_mode);
    const x = cliValueLabel(receipt.x);
    const y = cliValueLabel(receipt.y);
    const durationMs = cliFiniteNumber(receipt.duration_ms);
    const untilPath = cliString(receipt.until_path) || "until_path";
    const expected = cliValueLabel(receipt.until_expected_value);
    const actual = cliValueLabel(receipt.until_value);
    const tapCount = cliFiniteNumber(receipt.tap_count);
    const maxTaps = cliFiniteNumber(receipt.max_taps) ?? cliFiniteNumber(receipt.max_calls);
    const tapBurstSize = cliFiniteNumber(receipt.tap_burst_size);
    const conditionCheckCount = cliFiniteNumber(receipt.condition_check_count);
    const settleMs = cliFiniteNumber(receipt.settle_ms);
    const elapsedMs = cliFiniteNumber(receipt.elapsed_ms);
    const ok = receipt.ok === false ? "failed" : "ok";
    const reason = cliString(receipt.reason);
    const coordinateText = x && y
      ? `, ${coordinateMode ? `${coordinateMode} ` : ""}${markdownInlineCode(`${x},${y}`)}`
      : "";
    const tapText = tapCount === undefined
      ? ""
      : ` in ${tapCount}${maxTaps === undefined ? "" : `/${maxTaps}`} tap(s)`;
    const burstText = tapBurstSize === undefined || tapBurstSize <= 1 ? "" : `, burst ${tapBurstSize}`;
    const conditionCheckText = conditionCheckCount === undefined ? "" : `, ${conditionCheckCount} check(s)`;
    const settleText = settleMs === undefined || settleMs <= 0 ? "" : `, settle ${settleMs}ms`;
    const elapsedText = elapsedMs === undefined ? "" : `, elapsed ${elapsedMs}ms`;
    lines.push(`- ${name} tap_until: ${ok}, ${markdownInlineCode(selector)}${pointerType ? ` ${markdownInlineCode(pointerType)}` : ""}${inputDispatch ? ` via ${markdownInlineCode(inputDispatch)}` : ""}${coordinateText}${durationMs === undefined ? "" : `, duration ${durationMs}ms`} until ${markdownInlineCode(untilPath)}${expected === undefined ? "" : ` == ${markdownInlineCode(expected, 80)}`}${tapText}${burstText}${conditionCheckText}${settleText}${elapsedText}${actual === undefined ? "" : `, observed ${markdownInlineCode(actual, 80)}`}${reason ? `, reason ${markdownInlineCode(reason, 100)}` : ""}`);
  }
  if (tapUntilDetails.length > sampledTapUntilDetails.length) lines.push(`- ${tapUntilDetails.length - sampledTapUntilDetails.length} additional tap_until receipt(s) omitted.`);
  const keyboardGroups = viewports.map((viewport) => {
    const name = cliString(viewport.name) || "viewport";
    const rawReceipts = Array.isArray(viewport.keyboard) ? viewport.keyboard : viewport.press;
    const receipts = Array.isArray(rawReceipts)
      ? rawReceipts.map(cliRecord).filter((item): item is Record<string, unknown> => Boolean(item))
      : [];
    return receipts.map((receipt) => ({ name, receipt }));
  });
  const keyboardDetails = keyboardGroups.flat();
  for (const group of keyboardGroups.slice(0, 8)) {
    if (!group.length) continue;
    const name = group[0].name;
    const keys = group
      .map(({ receipt }) => cliString(receipt.key) || "key")
      .filter(Boolean);
    const ordinals = group
      .map(({ receipt }) => cliFiniteNumber(receipt.ordinal))
      .filter((value): value is number => value !== undefined);
    const visibleKeys = keys.slice(0, 16);
    const omittedKeyCount = Math.max(0, keys.length - visibleKeys.length);
    const visibleOrdinals = ordinals.slice(0, 16);
    const omittedOrdinalCount = Math.max(0, ordinals.length - visibleOrdinals.length);
    const keyText = visibleKeys.join(",");
    const ordinalText = visibleOrdinals.join(",");
    lines.push(`- ${name} keyboard_sequence: keys ${markdownInlineCode(keyText, 200)}${omittedKeyCount ? ` (+${omittedKeyCount} omitted)` : ""}${ordinalText ? `, ordinals ${markdownInlineCode(ordinalText, 120)}${omittedOrdinalCount ? ` (+${omittedOrdinalCount} omitted)` : ""}` : ""}`);
  }
  const sampledKeyboardDetails = balancedSetupReceiptDetails(keyboardGroups, 12);
  for (const { name, receipt } of sampledKeyboardDetails) {
    const action = cliString(receipt.action) || "press";
    const key = cliString(receipt.key) || "key";
    const selector = cliString(receipt.selector);
    const frameSelector = cliString(receipt.frame_selector);
    const holdMs = cliFiniteNumber(receipt.hold_ms);
    const ok = receipt.ok === false ? "failed" : "ok";
    const reason = cliString(receipt.reason);
    lines.push(`- ${name} ${action}: ${ok}, ${markdownInlineCode(key)}${selector ? ` on ${markdownInlineCode(selector)}` : ""}${frameSelector ? ` in frame ${markdownInlineCode(frameSelector)}` : ""}${holdMs === undefined ? "" : `, held ${holdMs}ms`}${reason ? `, reason ${markdownInlineCode(reason, 100)}` : ""}`);
  }
  if (keyboardDetails.length > sampledKeyboardDetails.length) lines.push(`- ${keyboardDetails.length - sampledKeyboardDetails.length} additional keyboard receipt(s) omitted.`);
  const canvasSignatureGroups = viewports.map((viewport) => {
    const name = cliString(viewport.name) || "viewport";
    const receipts = Array.isArray(viewport.canvas_signature)
      ? viewport.canvas_signature.map(cliRecord).filter((item): item is Record<string, unknown> => Boolean(item))
      : [];
    return receipts.map((receipt) => ({ name, receipt }));
  });
  const canvasSignatureDetails = canvasSignatureGroups.flat();
  const sampledCanvasSignatureDetails = balancedSetupReceiptDetails(canvasSignatureGroups, 12);
  for (const { name, receipt } of sampledCanvasSignatureDetails) {
    const selector = cliString(receipt.selector) || "canvas";
    const label = cliString(receipt.label);
    const hash = cliString(receipt.hash);
    const dataLength = cliFiniteNumber(receipt.data_length);
    const width = cliFiniteNumber(receipt.width);
    const height = cliFiniteNumber(receipt.height);
    const cssWidth = cliFiniteNumber(receipt.css_width);
    const cssHeight = cliFiniteNumber(receipt.css_height);
    const compareTo = cliString(receipt.compare_to);
    const previousHash = cliString(receipt.previous_hash);
    const changed = typeof receipt.changed === "boolean" ? receipt.changed : undefined;
    const storedTo = cliString(receipt.return_stored_to);
    const ok = receipt.ok === false ? "failed" : "ok";
    const reason = cliString(receipt.reason);
    const sizeText = width === undefined || height === undefined ? "" : `, ${width}x${height}`;
    const cssSizeText = cssWidth === undefined || cssHeight === undefined ? "" : `, css ${cssWidth}x${cssHeight}`;
    lines.push(`- ${name} canvas_signature: ${ok}, ${markdownInlineCode(selector)}${label ? ` ${markdownInlineCode(label, 80)}` : ""}${hash ? ` hash ${markdownInlineCode(hash, 80)}` : ""}${sizeText}${cssSizeText}${dataLength === undefined ? "" : `, data chars ${dataLength}`}${compareTo ? `, compared ${markdownInlineCode(compareTo)}` : ""}${previousHash ? ` previous ${markdownInlineCode(previousHash, 80)}` : ""}${changed === undefined ? "" : `, changed ${changed}`}${storedTo ? `, stored ${markdownInlineCode(storedTo)}` : ""}${reason ? `, reason ${markdownInlineCode(reason, 100)}` : ""}`);
  }
  if (canvasSignatureDetails.length > sampledCanvasSignatureDetails.length) lines.push(`- ${canvasSignatureDetails.length - sampledCanvasSignatureDetails.length} additional canvas_signature receipt(s) omitted.`);
  const canvasSignatureWarningGroups = viewports.map((viewport) => {
    const name = cliString(viewport.name) || "viewport";
    const warnings = Array.isArray(viewport.canvas_signature_stable_hash_groups)
      ? viewport.canvas_signature_stable_hash_groups.map(cliRecord).filter((item): item is Record<string, unknown> => Boolean(item))
      : [];
    return warnings.map((warning) => ({ name, receipt: warning }));
  });
  const canvasSignatureWarnings = canvasSignatureWarningGroups.flat();
  const sampledCanvasSignatureWarnings = balancedSetupReceiptDetails(canvasSignatureWarningGroups, 12);
  for (const { name, receipt } of sampledCanvasSignatureWarnings) {
    const selector = cliString(receipt.selector) || "canvas";
    const frameSelector = cliString(receipt.frame_selector);
    const hash = cliString(receipt.hash);
    const count = cliFiniteNumber(receipt.count);
    const labelCount = cliFiniteNumber(receipt.label_count);
    const labels = cliStringArray(receipt.labels);
    const omittedLabelCount = cliFiniteNumber(receipt.omitted_label_count) || 0;
    const labelText = labels.length
      ? ` across ${labels.map((label) => markdownInlineCode(label, 60)).join(", ")}${omittedLabelCount ? `, plus ${omittedLabelCount} more` : ""}`
      : "";
    lines.push(`- ${name} canvas_signature warning: ${markdownInlineCode(selector)}${frameSelector ? ` in frame ${markdownInlineCode(frameSelector)}` : ""} returned the same hash${hash ? ` ${markdownInlineCode(hash, 80)}` : ""} for ${count ?? labelCount ?? "multiple"} labeled capture(s)${labelText}; treat canvas signatures as diagnostic when runtime evidence or screenshots show state changes.`);
  }
  if (canvasSignatureWarnings.length > sampledCanvasSignatureWarnings.length) lines.push(`- ${canvasSignatureWarnings.length - sampledCanvasSignatureWarnings.length} additional canvas_signature warning(s) omitted.`);
  const deterministicRuntimeGroups = viewports.map((viewport) => {
    const name = cliString(viewport.name) || "viewport";
    const receipts = Array.isArray(viewport.deterministic_runtime)
      ? viewport.deterministic_runtime.map(cliRecord).filter((item): item is Record<string, unknown> => Boolean(item))
      : [];
    return receipts.map((receipt) => ({ name, receipt }));
  });
  const deterministicRuntimeDetails = deterministicRuntimeGroups.flat();
  const sampledDeterministicRuntimeDetails = balancedSetupReceiptDetails(deterministicRuntimeGroups, 12);
  for (const { name, receipt } of sampledDeterministicRuntimeDetails) {
    const ok = receipt.ok === false ? "failed" : "ok";
    const randomEnabled = receipt.random_enabled === true ? "on" : receipt.random_enabled === false ? "off" : "unknown";
    const clockEnabled = receipt.clock_enabled === true ? "on" : receipt.clock_enabled === false ? "off" : "unknown";
    const randomQueueAdded = cliFiniteNumber(receipt.random_queue_added);
    const randomQueueLength = cliFiniteNumber(receipt.random_queue_length);
    const randomQueueMode = cliString(receipt.random_queue_mode);
    const randomUnderflowCount = cliFiniteNumber(receipt.random_underflow_count);
    const previousNow = cliFiniteNumber(receipt.previous_now);
    const now = cliFiniteNumber(receipt.now);
    const advanceMs = cliFiniteNumber(receipt.advance_ms);
    const restored = receipt.restored === true;
    const reason = cliString(receipt.reason);
    const randomText = randomQueueAdded === undefined && randomQueueLength === undefined
      ? `random ${randomEnabled}`
      : `random ${randomEnabled}${randomQueueMode ? ` ${randomQueueMode}` : ""}${randomQueueAdded === undefined ? "" : ` +${randomQueueAdded}`}${randomQueueLength === undefined ? "" : ` -> ${randomQueueLength}`}`;
    const clockText = now === undefined
      ? `clock ${clockEnabled}`
      : `clock ${clockEnabled}${previousNow === undefined ? "" : ` ${previousNow} ->`} ${now}`;
    lines.push(`- ${name} deterministic_runtime: ${ok}, ${restored ? "restored, " : ""}${randomText}${randomUnderflowCount ? `, underflows ${randomUnderflowCount}` : ""}, ${clockText}${advanceMs === undefined ? "" : `, advance ${advanceMs}ms`}${reason ? `, reason ${markdownInlineCode(reason, 100)}` : ""}`);
  }
  if (deterministicRuntimeDetails.length > sampledDeterministicRuntimeDetails.length) lines.push(`- ${deterministicRuntimeDetails.length - sampledDeterministicRuntimeDetails.length} additional deterministic_runtime receipt(s) omitted.`);
  const rangeValueGroups = viewports.map((viewport) => {
    const name = cliString(viewport.name) || "viewport";
    const receipts = Array.isArray(viewport.set_range_value)
      ? viewport.set_range_value.map(cliRecord).filter((item): item is Record<string, unknown> => Boolean(item))
      : [];
    return receipts.map((receipt) => ({ name, receipt }));
  });
  const rangeValueDetails = rangeValueGroups.flat();
  const sampledRangeValueDetails = balancedSetupReceiptDetails(rangeValueGroups, 12);
  for (const { name, receipt } of sampledRangeValueDetails) {
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
  if (rangeValueDetails.length > sampledRangeValueDetails.length) lines.push(`- ${rangeValueDetails.length - sampledRangeValueDetails.length} additional set_range_value receipt(s) omitted.`);
  const windowCallGroups = viewports.map((viewport) => {
    const name = cliString(viewport.name) || "viewport";
    const receipts = Array.isArray(viewport.window_call)
      ? viewport.window_call.map(cliRecord).filter((item): item is Record<string, unknown> => Boolean(item))
      : [];
    return receipts.map((receipt) => ({ name, receipt }));
  });
  const windowCallDetails = windowCallGroups.flat();
  const sampledWindowCallDetails = balancedSetupReceiptDetails(windowCallGroups, 12);
  for (const { name, receipt } of sampledWindowCallDetails) {
    const path = cliString(receipt.path) || "window_function";
    const storedTo = cliString(receipt.return_stored_to);
    const returned = cliValueLabel(receipt.returned);
    const expected = cliValueLabel(receipt.expected_return);
    const returnSummary = cliReturnSummaryLabel(receipt.return_summary);
    const captured = receipt.return_captured === true ? "captured" : receipt.return_captured === false ? "not captured" : "capture unknown";
    const ok = receipt.ok === false ? "failed" : "ok";
    const reason = cliString(receipt.reason);
    lines.push(`- ${name} window_call: ${ok}, ${markdownInlineCode(path)}${storedTo ? `, stored ${markdownInlineCode(storedTo)}` : ""}, return ${captured}${expected === undefined ? "" : `, expected ${markdownInlineCode(expected, 80)}`}${returnSummary ? `, summary ${markdownInlineCode(returnSummary, 140)}` : ""}${returned === undefined ? "" : `, returned ${markdownInlineCode(returned, 80)}`}${reason ? `, reason ${markdownInlineCode(reason, 100)}` : ""}`);
  }
  if (windowCallDetails.length > sampledWindowCallDetails.length) lines.push(`- ${windowCallDetails.length - sampledWindowCallDetails.length} additional window_call receipt(s) omitted.`);
  const windowEvalGroups = viewports.map((viewport) => {
    const name = cliString(viewport.name) || "viewport";
    const receipts = Array.isArray(viewport.window_eval)
      ? viewport.window_eval.map(cliRecord).filter((item): item is Record<string, unknown> => Boolean(item))
      : [];
    return receipts.map((receipt) => ({ name, receipt }));
  });
  const windowEvalDetails = windowEvalGroups.flat();
  const sampledWindowEvalDetails = balancedSetupReceiptDetails(windowEvalGroups, 12);
  for (const { name, receipt } of sampledWindowEvalDetails) {
    const scriptLength = cliFiniteNumber(receipt.script_length);
    const storedTo = cliString(receipt.return_stored_to);
    const returned = cliValueLabel(receipt.returned);
    const expected = cliValueLabel(receipt.expected_return);
    const returnSummary = cliReturnSummaryLabel(receipt.return_summary);
    const captured = receipt.return_captured === true ? "captured" : receipt.return_captured === false ? "not captured" : "capture unknown";
    const ok = receipt.ok === false ? "failed" : "ok";
    const reason = cliString(receipt.reason);
    lines.push(`- ${name} window_eval: ${ok}${scriptLength === undefined ? "" : `, script ${scriptLength} chars`}${storedTo ? `, stored ${markdownInlineCode(storedTo)}` : ""}, return ${captured}${expected === undefined ? "" : `, expected ${markdownInlineCode(expected, 80)}`}${returnSummary ? `, summary ${markdownInlineCode(returnSummary, 140)}` : ""}${returned === undefined ? "" : `, returned ${markdownInlineCode(returned, 80)}`}${reason ? `, reason ${markdownInlineCode(reason, 100)}` : ""}`);
  }
  if (windowEvalDetails.length > sampledWindowEvalDetails.length) lines.push(`- ${windowEvalDetails.length - sampledWindowEvalDetails.length} additional window_eval receipt(s) omitted.`);
  const windowCallUntilGroups = viewports.map((viewport) => {
    const name = cliString(viewport.name) || "viewport";
    const receipts = Array.isArray(viewport.window_call_until)
      ? viewport.window_call_until.map(cliRecord).filter((item): item is Record<string, unknown> => Boolean(item))
      : [];
    return receipts.map((receipt) => ({ name, receipt }));
  });
  const windowCallUntilDetails = windowCallUntilGroups.flat();
  const sampledWindowCallUntilDetails = balancedSetupReceiptDetails(windowCallUntilGroups, 12);
  for (const { name, receipt } of sampledWindowCallUntilDetails) {
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
  if (windowCallUntilDetails.length > sampledWindowCallUntilDetails.length) lines.push(`- ${windowCallUntilDetails.length - sampledWindowCallUntilDetails.length} additional window_call_until receipt(s) omitted.`);
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
    const obstruction = setupFailureObstructionSnippet(reason);
    lines.push(`- failed ${name}: ${action}${selector ? ` ${markdownInlineCode(selector)}` : ""}${reason ? ` reason ${markdownInlineCode(reason)}` : ""}${caseInsensitiveText ? `; case-insensitive sample ${markdownInlineCode(caseInsensitiveText, 140)}` : ""}`);
    if (obstruction) {
      lines.push(`- obstruction ${name}: target ${selector ? markdownInlineCode(selector) : markdownInlineCode(action)} intercepted by ${markdownInlineCode(obstruction, 120)}`);
    }
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

function writeRiddleJobReceipt(
  outputDir: string | undefined,
  input: {
    profile: RiddleProofProfile;
    jobId: string;
    targetUrl: string;
    viewport?: RiddleProofProfileViewport;
    created?: Record<string, unknown>;
  },
) {
  if (!outputDir) return;
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, "riddle-job.json"), `${JSON.stringify({
    version: "riddle-proof.riddle-job-receipt.v1",
    profile_name: input.profile.name,
    job_id: input.jobId,
    target_url: input.targetUrl,
    viewport: input.viewport || null,
    captured_at: new Date().toISOString(),
    created: input.created || null,
    recovery_command: `riddle-proof-loop run-profile recover --profile <profile> --job ${input.jobId} --output-dir ${outputDir}`,
  }, null, 2)}\n`);
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
    if (result) return withProfileMetadata(profile, result);
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
    if (result) return withProfileMetadata(profile, result);
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

function withProfileMetadata(profile: RiddleProofProfile, result: RiddleProofProfileResult): RiddleProofProfileResult {
  if (!profile.metadata || !Object.keys(profile.metadata).length) return result;
  return {
    ...result,
    metadata: {
      ...profile.metadata,
      ...(result.metadata || {}),
    },
  };
}

function withRiddleMetadata(
  result: RiddleProofProfileResult,
  input: {
    job_id?: string;
    status?: string | null;
    terminal?: boolean;
    poll?: RiddlePollSummary;
    artifacts?: RiddleProofProfileArtifactRef[];
    artifactRecovery?: boolean;
    retryCount?: number;
    staleJobIds?: string[];
  },
): RiddleProofProfileResult {
  const poll = input.poll;
  const staleJobIds = input.staleJobIds?.filter(Boolean);
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
      retry_count: input.retryCount ?? result.riddle?.retry_count,
      stale_job_ids: staleJobIds?.length ? staleJobIds : result.riddle?.stale_job_ids,
      artifact_recovery: input.artifactRecovery ?? result.riddle?.artifact_recovery,
    },
    artifacts: {
      ...result.artifacts,
      riddle_artifacts: input.artifacts || result.artifacts.riddle_artifacts,
    },
  };
}

function riddleArtifactsPayloadStatus(payload: unknown) {
  const record = cliRecord(payload);
  return cliString(record?.status) ?? cliString(cliRecord(record?.job)?.status);
}

async function recoverProfileResultFromRiddleArtifacts(
  profile: RiddleProofProfile,
  input: {
    client: RiddleApiClient;
    runner: RiddleProofProfileRunner;
    jobId: string;
    poll: RiddlePollJobResult;
    attempts?: number;
    intervalMs?: number;
  },
): Promise<RiddleProofProfileResult | undefined> {
  if (input.poll.poll?.timed_out !== true) return undefined;
  const attempts = Math.max(1, Math.floor(input.attempts ?? 3));
  const intervalMs = Math.max(0, Math.floor(input.intervalMs ?? 0));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let artifactPayload: Record<string, unknown>;
    try {
      artifactPayload = await input.client.requestJson<Record<string, unknown>>(`/v1/jobs/${input.jobId}/artifacts`);
    } catch {
      artifactPayload = {};
    }
    const artifacts = collectRiddleProfileArtifactRefs(artifactPayload);
    if (artifacts.length) {
      const artifactStatus = riddleArtifactsPayloadStatus(artifactPayload);
      const terminal = artifactStatus ? isTerminalRiddleJobStatus(artifactStatus) : true;
      const recoveredPoll: RiddlePollSummary | undefined = input.poll.poll
        ? {
            ...input.poll.poll,
            status: artifactStatus ?? input.poll.poll.status,
            terminal,
          }
        : undefined;
      const artifactResult = await profileResultFromRiddleArtifacts(profile, artifacts, [artifactPayload, input.poll.job]);
      if (artifactResult) {
        return withRiddleMetadata(artifactResult, {
          job_id: input.jobId,
          status: artifactStatus ?? input.poll.status,
          terminal,
          poll: recoveredPoll,
          artifacts,
          artifactRecovery: true,
        });
      }
      if (terminal) {
        return createRiddleProofProfileInsufficientResult({
          profile,
          runner: input.runner,
          error: `Riddle job ${input.jobId} timed out in status ${input.poll.status || "unknown"}, but artifacts were recovered without a proof result.`,
          riddle: {
            ...riddleMetadataFromPoll(input.jobId, input.poll),
            status: artifactStatus ?? input.poll.status,
            terminal,
            artifact_recovery: true,
          },
          artifacts,
        });
      }
    }
    if (attempt + 1 < attempts && intervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  return undefined;
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

function profileUnsubmittedRetryTimeoutMs(options: CliOptions) {
  return Math.max(0, optionInteger(
    options,
    DEFAULT_PROFILE_UNSUBMITTED_RETRY_TIMEOUT_MS,
    "unsubmittedTimeoutMs",
    "unsubmittedJobTimeoutMs",
    "submitTimeoutMs",
  ));
}

function profileUnsubmittedRetryLimit(options: CliOptions) {
  return Math.max(0, optionInteger(
    options,
    DEFAULT_PROFILE_UNSUBMITTED_RETRIES,
    "unsubmittedRetries",
    "unsubmittedJobRetries",
    "submitRetries",
  ));
}

function shouldRetryUnsubmittedRiddleJob(poll: RiddlePollJobResult) {
  return poll.terminal !== true &&
    poll.poll?.unsubmitted_timeout === true &&
    !poll.poll.created_at &&
    !poll.poll.submitted_at;
}

function riddlePollOptionsForProfile(options: CliOptions): RiddlePollJobOptions {
  return {
    wait: true,
    attempts: optionNumber(options, "pollAttempts", "attempts"),
    intervalMs: optionNumber(options, "intervalMs"),
    progressEveryMs: optionNumber(options, "progressEveryMs"),
    unsubmittedTimeoutMs: profileUnsubmittedRetryTimeoutMs(options),
    onProgress: options.quiet !== true
      ? (snapshot) => {
          process.stderr.write(`${riddlePollProgressLine(snapshot)}\n`);
        }
      : undefined,
  };
}

function profileItemAppliesToSplitViewport(item: { viewports?: string[] }, viewport: RiddleProofProfileViewport): boolean {
  if (!item.viewports?.length) return true;
  return Boolean(viewport.name && item.viewports.includes(viewport.name));
}

function profileForSplitViewport(profile: RiddleProofProfile, viewport: RiddleProofProfileViewport): RiddleProofProfile {
  const setupActions = profile.target.setup_actions?.filter((action) => profileItemAppliesToSplitViewport(action, viewport));
  return {
    ...profile,
    name: `${profile.name}-${viewport.name || `${viewport.width}x${viewport.height}`}`,
    checks: profile.checks.filter((check) => profileItemAppliesToSplitViewport(check, viewport)),
    target: {
      ...profile.target,
      viewports: [viewport],
      ...(setupActions ? { setup_actions: setupActions } : {}),
    },
    metadata: {
      ...(profile.metadata || {}),
      split_parent_profile: profile.name,
      split_viewport: viewport.name,
    },
  };
}

function profileItemAppliesToAnySelectedViewport(
  item: { viewports?: string[] },
  viewports: RiddleProofProfileViewport[],
): boolean {
  if (!item.viewports?.length) return true;
  const names = new Set(viewports.map((viewport) => viewport.name).filter(Boolean));
  return item.viewports.some((name) => names.has(name));
}

function profileForSelectedViewports(
  profile: RiddleProofProfile,
  viewports: RiddleProofProfileViewport[],
): RiddleProofProfile {
  const suffix = viewports
    .map((viewport) => viewport.name || `${viewport.width}x${viewport.height}`)
    .join("-");
  const setupActions = profile.target.setup_actions?.filter((action) => profileItemAppliesToAnySelectedViewport(action, viewports));
  return {
    ...profile,
    name: `${profile.name}-${suffix}`,
    checks: profile.checks.filter((check) => profileItemAppliesToAnySelectedViewport(check, viewports)),
    target: {
      ...profile.target,
      viewports,
      ...(setupActions ? { setup_actions: setupActions } : {}),
    },
    metadata: {
      ...(profile.metadata || {}),
      selected_parent_profile: profile.name,
      selected_viewports: viewports.map((viewport) => viewport.name || `${viewport.width}x${viewport.height}`),
    },
  };
}

function profileWithSelectedViewportNamesForCli(profile: RiddleProofProfile, options: CliOptions): RiddleProofProfile {
  const names = runProfileViewportNamesOption(options);
  if (!names.length) return profile;
  const requested = new Set(names);
  const viewports = profile.target.viewports.filter((viewport) => viewport.name && requested.has(viewport.name));
  const matched = new Set(viewports.map((viewport) => viewport.name).filter(Boolean));
  const missing = names.filter((name) => !matched.has(name));
  if (missing.length) {
    const available = profile.target.viewports.map((viewport) => viewport.name).filter(Boolean).join(", ") || "none";
    throw new Error(`Unknown --viewport-name ${missing.join(", ")}. Available viewport names: ${available}.`);
  }
  return profileForSelectedViewports(profile, viewports);
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

function profileResultPathFromInput(inputPath: string): string[] {
  if (!existsSync(inputPath)) throw new Error(`Profile aggregate input path does not exist: ${inputPath}`);
  const stat = statSync(inputPath);
  if (stat.isFile()) return [inputPath];
  if (!stat.isDirectory()) throw new Error(`Profile aggregate input path must be a file or directory: ${inputPath}`);
  const childProfileResults = readdirSync(inputPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(inputPath, entry.name, "profile-result.json"))
    .filter((candidate) => existsSync(candidate));
  if (childProfileResults.length) return childProfileResults;
  const directProfileResult = path.join(inputPath, "profile-result.json");
  if (existsSync(directProfileResult)) return [directProfileResult];
  throw new Error(`Profile aggregate input directory has no child profile-result.json files: ${inputPath}`);
}

function runProfileAggregateInputPathsOption(options: CliOptions): string[] {
  const rawInputs = [
    optionString(options, "input"),
    optionString(options, "inputs"),
    optionString(options, "inputFile"),
    optionString(options, "inputFiles"),
  ].filter((value): value is string => Boolean(value));
  const explicitInputs = rawInputs
    .flatMap((raw) => raw.split(",").map((part) => part.trim()).filter(Boolean));
  const inputDir = optionString(options, "inputDir") ?? optionString(options, "resultsDir") ?? optionString(options, "runDir");
  const discoveredInputs = inputDir ? profileResultPathFromInput(inputDir) : [];
  const paths = [...explicitInputs.flatMap(profileResultPathFromInput), ...discoveredInputs];
  const uniquePaths = [...new Set(paths.map((inputPath) => path.resolve(inputPath)))];
  if (!uniquePaths.length) {
    throw new Error("run-profile aggregate requires --input-dir <dir> or --inputs <path[,path...]>.");
  }
  return uniquePaths;
}

function readProfileResultForAggregate(resultPath: string): RiddleProofProfileResult {
  const parsed = readJsonValue(resultPath, resultPath);
  if (parsed.version !== "riddle-proof.profile-result.v1" || !Array.isArray(parsed.checks)) {
    throw new Error(`Profile aggregate input is not a riddle-proof.profile-result.v1 result: ${resultPath}`);
  }
  return parsed as unknown as RiddleProofProfileResult;
}

function profileResultIsAggregateParent(result: RiddleProofProfileResult): boolean {
  const mode = cliString(cliRecord(result.riddle)?.mode);
  return (mode === "split-viewports" || mode === "named-viewport-aggregate")
    && (result.evidence?.viewports?.length || 0) > 1;
}

function aggregateProfileResultViewportName(result: RiddleProofProfileResult): string | undefined {
  const evidenceViewports = result.evidence?.viewports || [];
  if (evidenceViewports.length === 1) return evidenceViewports[0].name;
  const metadata = cliRecord(result.metadata);
  const splitViewport = cliString(metadata?.split_viewport);
  if (splitViewport) return splitViewport;
  const selectedViewports = Array.isArray(metadata?.selected_viewports)
    ? metadata.selected_viewports.map(cliString).filter((name): name is string => Boolean(name))
    : [];
  if (selectedViewports.length === 1) return selectedViewports[0];
  return undefined;
}

function aggregateProfileResultViewport(
  profile: RiddleProofProfile,
  result: RiddleProofProfileResult,
  resultPath: string,
): RiddleProofProfileViewport {
  const viewportName = aggregateProfileResultViewportName(result);
  const parentViewport = viewportName
    ? profile.target.viewports.find((viewport) => viewport.name === viewportName)
    : undefined;
  if (parentViewport) return parentViewport;
  const evidenceViewport = result.evidence?.viewports?.length === 1 ? result.evidence.viewports[0] : undefined;
  if (
    evidenceViewport
    && typeof evidenceViewport.name === "string"
    && typeof evidenceViewport.width === "number"
    && Number.isFinite(evidenceViewport.width)
    && typeof evidenceViewport.height === "number"
    && Number.isFinite(evidenceViewport.height)
  ) {
    return {
      name: evidenceViewport.name,
      width: evidenceViewport.width,
      height: evidenceViewport.height,
    };
  }
  throw new Error(`Profile aggregate input must be a single named viewport result or include selected viewport metadata: ${resultPath}`);
}

function sortAggregateChildRuns(profile: RiddleProofProfile, childRuns: SplitViewportRunResult[]): SplitViewportRunResult[] {
  const viewportOrder = new Map(profile.target.viewports.map((viewport, index) => [viewport.name, index]));
  return [...childRuns].sort((a, b) => {
    const aIndex = viewportOrder.get(a.viewport.name) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = viewportOrder.get(b.viewport.name) ?? Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return a.viewport.name.localeCompare(b.viewport.name);
  });
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

function splitViewportRiddleMetadata(
  childRuns: SplitViewportRunResult[],
  mode: "split-viewports" | "named-viewport-aggregate" = "split-viewports",
): RiddleProofProfileResult["riddle"] {
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
    retry_count: result.riddle?.retry_count,
    stale_job_ids: result.riddle?.stale_job_ids,
    artifact_recovery: result.riddle?.artifact_recovery,
  }));
  return {
    mode,
    job_count: childRuns.length,
    status: mode,
    terminal: childRuns.every(({ result }) => result.riddle?.terminal !== false),
    artifact_recovery: childRuns.some(({ result }) => result.riddle?.artifact_recovery === true),
    queue_elapsed_ms: sumDefinedNumbers(splitJobs.map((job) => job.queue_elapsed_ms)),
    pre_submission_elapsed_ms: sumDefinedNumbers(splitJobs.map((job) => job.pre_submission_elapsed_ms)),
    elapsed_ms: sumDefinedNumbers(splitJobs.map((job) => job.elapsed_ms)),
    retry_count: splitJobs.reduce((sum, job) => sum + (typeof job.retry_count === "number" && Number.isFinite(job.retry_count) ? job.retry_count : 0), 0),
    stale_job_ids: splitJobs.flatMap((job) => Array.isArray(job.stale_job_ids) ? job.stale_job_ids : []),
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

function withSplitViewportChildStatusCheck(
  profile: RiddleProofProfile,
  result: RiddleProofProfileResult,
  childRuns: SplitViewportRunResult[],
): RiddleProofProfileResult {
  const nonPassed = childRuns.filter(({ result: childResult }) => childResult.status !== "passed");
  if (!nonPassed.length) return result;
  const hasProductRegression = nonPassed.some(({ result: childResult }) => childResult.status === "product_regression");
  const status = hasProductRegression ? "product_regression" : "needs_human_review";
  const checkStatus = hasProductRegression ? "failed" : "needs_human_review";
  const childStatuses = childRuns.map(({ viewport, result: childResult }) => ({
    viewport: viewport.name,
    profile_name: childResult.profile_name,
    status: childResult.status,
    job_id: childResult.riddle?.job_id || null,
  }));
  const failedLabels = nonPassed
    .map(({ viewport, result: childResult }) => `${viewport.name}: ${childResult.status}`)
    .join("; ");
  const checks: RiddleProofProfileResult["checks"] = [
    {
      type: "split_viewport_children",
      label: "split_viewport_children",
      status: checkStatus,
      evidence: { child_statuses: childStatuses },
      message: `Split viewport child run(s) did not all pass: ${failedLabels}.`,
    },
    ...result.checks,
  ];
  const viewportCount = result.evidence?.viewports?.length || profile.target.viewports.length;
  const failedChecks = checks.filter((check) => check.status === "failed").length;
  const summary = status === "product_regression"
    ? `${profile.name} failed ${failedChecks} product invariant(s) across ${viewportCount} viewport(s).`
    : `${profile.name} collected split viewport artifacts but needs human review.`;
  return { ...result, status, checks, summary };
}

function profileRiddleJobCountForCli(profile: RiddleProofProfile, options: CliOptions) {
  return runProfileSplitViewportsOption(options) && profile.target.viewports.length > 1
    ? profile.target.viewports.length
    : 1;
}

function riddleBalanceAvailableSeconds(balance: RiddleBalanceResult): number | undefined {
  const availableSeconds = cliFiniteNumber(balance.available_seconds);
  if (availableSeconds !== undefined) return availableSeconds;
  const totalSeconds = cliFiniteNumber(balance.total_seconds);
  const reservedSeconds = cliFiniteNumber(balance.reserved_seconds) ?? 0;
  return totalSeconds === undefined ? undefined : totalSeconds - reservedSeconds;
}

function riddleBalancePreflightMetadata(profile: RiddleProofProfile, options: CliOptions): RiddleProofProfileResult["riddle"] {
  const split = runProfileSplitViewportsOption(options) && profile.target.viewports.length > 1;
  if (!split) return { status: "balance_preflight_blocked", terminal: false };
  return {
    mode: "split-viewports",
    job_count: profile.target.viewports.length,
    status: "balance_preflight_blocked",
    terminal: false,
    split_jobs: profile.target.viewports.map((viewport) => ({ viewport: viewport.name })),
  };
}

function apiKeySourceBlockerMetadata(client: RiddleApiClient): Record<string, JsonValue> {
  try {
    const source = client.apiKeySource();
    return {
      api_key_source: source.source,
      ...(source.file ? { api_key_file: source.file } : {}),
    };
  } catch {
    return {};
  }
}

function riddleApiErrorBlockerMetadata(error: unknown): Record<string, JsonValue> {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : undefined;
  const status = cliFiniteNumber(record?.status);
  const pathValue = cliString(record?.path);
  const body = cliString(record?.body);
  return {
    ...(pathValue ? { endpoint: pathValue } : {}),
    ...(status === undefined ? {} : { http_status: status }),
    ...(body ? { error: body } : {}),
  };
}

async function preflightRiddleProfileBalanceForCli(
  profile: RiddleProofProfile,
  options: CliOptions,
  input: { client: RiddleApiClient; runner: RiddleProofProfileRunner },
): Promise<RiddleProofProfileResult | undefined> {
  if (!runProfileBalancePreflightOption(options)) return undefined;

  let balance: RiddleBalanceResult;
  try {
    balance = await input.client.getBalance();
  } catch (error) {
    return createRiddleProofProfileEnvironmentBlockedResult({
      profile,
      runner: input.runner,
      error,
      environmentBlocker: {
        source: "riddle_api",
        endpoint: "/v1/balance",
        reason: "balance_preflight_failed",
        balance_preflight: true,
        ...riddleApiErrorBlockerMetadata(error),
        ...apiKeySourceBlockerMetadata(input.client),
      },
      riddle: riddleBalancePreflightMetadata(profile, options),
    });
  }

  const jobCount = profileRiddleJobCountForCli(profile, options);
  const requiredSeconds = jobCount * RIDDLE_PROFILE_BALANCE_PREFLIGHT_MIN_SECONDS_PER_JOB;
  const availableSeconds = riddleBalanceAvailableSeconds(balance);
  if (availableSeconds === undefined || availableSeconds >= requiredSeconds) return undefined;
  const reservedSeconds = cliFiniteNumber(balance.reserved_seconds);
  const totalSeconds = cliFiniteNumber(balance.total_seconds);
  const holdsCount = cliFiniteNumber(balance.holds_count);

  return createRiddleProofProfileEnvironmentBlockedResult({
    profile,
    runner: input.runner,
    error: `Riddle balance preflight failed: ${availableSeconds}s available for ${jobCount} intended hosted job(s), minimum ${requiredSeconds}s required.`,
    environmentBlocker: {
      source: "riddle_api",
      endpoint: "/v1/balance",
      reason: "insufficient_balance",
      error: "Insufficient available balance",
      balance_preflight: true,
      job_count: jobCount,
      seconds_per_job: RIDDLE_PROFILE_BALANCE_PREFLIGHT_MIN_SECONDS_PER_JOB,
      required_seconds: requiredSeconds,
      available_seconds: availableSeconds,
      deficit_seconds: requiredSeconds - availableSeconds,
      ...(reservedSeconds === undefined ? {} : { reserved_seconds: reservedSeconds }),
      ...(totalSeconds === undefined ? {} : { total_seconds: totalSeconds }),
      ...(holdsCount === undefined ? {} : { holds_count: holdsCount }),
      ...apiKeySourceBlockerMetadata(input.client),
    },
    riddle: riddleBalancePreflightMetadata(profile, options),
  });
}

async function runSingleRiddleProfileForCli(
  profile: RiddleProofProfile,
  options: CliOptions,
  input: { client: RiddleApiClient; runner: RiddleProofProfileRunner; outputDir?: string },
): Promise<RiddleProofProfileResult> {
  const { client, runner } = input;
  const targetUrl = resolveRiddleProofProfileTargetUrl(profile);
  let created: Record<string, unknown> | undefined;
  let poll: RiddlePollJobResult | undefined;
  let jobId = "";
  const staleJobIds: string[] = [];
  const retryLimit = profileUnsubmittedRetryLimit(options);
  const pollOptions = riddlePollOptionsForProfile(options);

  for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
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

    jobId = typeof created.job_id === "string"
      ? created.job_id
      : typeof created.id === "string"
        ? created.id
        : "";
    if (!jobId) {
      const directResult = extractRiddleProofProfileResult(created);
      return directResult
        ? withRiddleMetadata(withProfileMetadata(profile, directResult), { artifacts: collectRiddleProfileArtifactRefs(created) })
        : createRiddleProofProfileInsufficientResult({ profile, runner, error: "Riddle run response was missing job_id.", artifacts: collectRiddleProfileArtifactRefs(created) });
    }
    writeRiddleJobReceipt(input.outputDir, {
      profile,
      jobId,
      targetUrl,
      viewport: profile.target.viewports[0],
      created,
    });

    poll = await client.pollJob(jobId, pollOptions);
    if (attempt < retryLimit && shouldRetryUnsubmittedRiddleJob(poll)) {
      const recoveredResult = await recoverProfileResultFromRiddleArtifacts(profile, {
        client,
        runner,
        jobId,
        poll,
        attempts: 3,
        intervalMs: Math.min(2000, Math.max(0, poll.poll?.interval_ms ?? 0)),
      });
      if (recoveredResult) {
        return recoveredResult;
      }
      staleJobIds.push(jobId);
      if (options.quiet !== true) {
        process.stderr.write(`[riddle-poll] ${jobId} stayed unsubmitted for ${formatPollDuration(poll.poll?.pre_submission_elapsed_ms)}; retrying hosted run ${attempt + 1}/${retryLimit}\n`);
      }
      continue;
    }
    break;
  }

  if (!poll) {
    return createRiddleProofProfileEnvironmentBlockedResult({ profile, runner, error: "Riddle job polling did not produce a result." });
  }
  const artifacts = collectRiddleProfileArtifactRefs(poll.artifacts);
  const retryCount = staleJobIds.length || undefined;
  if (!poll.ok || !poll.terminal) {
    const recoveredResult = await recoverProfileResultFromRiddleArtifacts(profile, {
      client,
      runner,
      jobId,
      poll,
      attempts: 3,
      intervalMs: Math.min(2000, Math.max(0, poll.poll?.interval_ms ?? 0)),
    });
    if (recoveredResult) {
      return withRiddleMetadata(recoveredResult, { retryCount, staleJobIds });
    }
    return createRiddleProofProfileEnvironmentBlockedResult({
      profile,
      runner,
      error: `Riddle job ${jobId} ended with status ${poll.status || "unknown"}.`,
      riddle: {
        ...riddleMetadataFromPoll(jobId, poll),
        retry_count: retryCount,
        stale_job_ids: staleJobIds.length ? staleJobIds : undefined,
      },
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
    retryCount,
    staleJobIds,
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
    const childOutputDir = outputDir ? splitViewportOutputDir(outputDir, viewport.name, seenOutputNames) : undefined;
    const result = await runSingleRiddleProfileForCli(childProfile, options, { ...input, outputDir: childOutputDir });
    if (childOutputDir) writeProfileOutput(childOutputDir, result);
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
  return withSplitViewportWarnings(profile, withSplitViewportChildStatusCheck(profile, result, childRuns));
}

async function aggregateProfileResultsForCli(profile: RiddleProofProfile, options: CliOptions): Promise<RiddleProofProfileResult> {
  const resultPaths = runProfileAggregateInputPathsOption(options);
  const seenViewports = new Set<string>();
  const childInputs = resultPaths
    .map((resultPath) => ({ resultPath, result: readProfileResultForAggregate(resultPath) }))
    .filter(({ result }) => !profileResultIsAggregateParent(result));
  if (!childInputs.length) {
    throw new Error("run-profile aggregate found no single-viewport child profile results.");
  }
  const childRuns = sortAggregateChildRuns(profile, childInputs.map(({ resultPath, result }) => {
    const viewport = aggregateProfileResultViewport(profile, result, resultPath);
    if (seenViewports.has(viewport.name)) {
      throw new Error(`Profile aggregate received more than one result for viewport ${viewport.name}.`);
    }
    seenViewports.add(viewport.name);
    return { viewport, profile: profileForSplitViewport(profile, viewport), result };
  }));
  const artifacts = childRuns.flatMap(splitViewportArtifactRefs);
  const blocked = childRuns.filter(({ result }) => !result.evidence || result.status === "environment_blocked" || result.status === "configuration_error");
  if (blocked.length) {
    return createRiddleProofProfileEnvironmentBlockedResult({
      profile,
      runner: "riddle",
      error: splitViewportBlockedMessage(childRuns),
      riddle: splitViewportRiddleMetadata(childRuns, "named-viewport-aggregate"),
      artifacts,
    });
  }
  const evidence = aggregateSplitViewportEvidence(profile, childRuns);
  const result = assessRiddleProofProfileEvidence(profile, evidence, {
    runner: "riddle",
    riddle: splitViewportRiddleMetadata(childRuns, "named-viewport-aggregate"),
    artifacts,
  });
  return withSplitViewportWarnings(profile, withSplitViewportChildStatusCheck(profile, result, childRuns));
}

async function recoverProfileForCli(profile: RiddleProofProfile, options: CliOptions): Promise<RiddleProofProfileResult> {
  const runner = (optionString(options, "runner") || "riddle") as RiddleProofProfileRunner;
  if (runner !== "riddle") {
    throw new Error(`Unsupported --runner ${runner}. The current CLI supports --runner riddle.`);
  }
  const jobId = optionString(options, "job") ?? optionString(options, "jobId");
  if (!jobId) throw new Error("run-profile recover requires --job <job-id>.");
  const client = createRiddleApiClient(riddleClientConfig(options));
  let artifactPayload: Record<string, unknown>;
  try {
    artifactPayload = await client.requestJson<Record<string, unknown>>(`/v1/jobs/${jobId}/artifacts`);
  } catch (error) {
    return createRiddleProofProfileEnvironmentBlockedResult({
      profile,
      runner,
      error,
      riddle: { job_id: jobId, terminal: false },
    });
  }
  const artifacts = collectRiddleProfileArtifactRefs(artifactPayload);
  const artifactStatus = riddleArtifactsPayloadStatus(artifactPayload);
  const terminal = artifactStatus ? isTerminalRiddleJobStatus(artifactStatus) : artifacts.length > 0;
  const recovered = await profileResultFromRiddleArtifacts(profile, artifacts, [artifactPayload]);
  if (recovered) {
    return withRiddleMetadata(recovered, {
      job_id: jobId,
      status: artifactStatus,
      terminal,
      artifacts,
      artifactRecovery: true,
    });
  }
  return createRiddleProofProfileInsufficientResult({
    profile,
    runner,
    error: artifacts.length
      ? `Riddle job ${jobId} artifacts were recovered without a proof result.`
      : `Riddle job ${jobId} had no recoverable artifacts.`,
    riddle: {
      job_id: jobId,
      status: artifactStatus,
      terminal,
      artifact_recovery: artifacts.length > 0,
    },
    artifacts,
  });
}

async function runProfileForCli(profile: RiddleProofProfile, options: CliOptions): Promise<RiddleProofProfileResult> {
  const runner = (optionString(options, "runner") || "riddle") as RiddleProofProfileRunner;
  if (runner !== "riddle") {
    throw new Error(`Unsupported --runner ${runner}. The current CLI supports --runner riddle.`);
  }
  const client = createRiddleApiClient(riddleClientConfig(options));
  const balanceBlocked = await preflightRiddleProfileBalanceForCli(profile, options, { client, runner });
  if (balanceBlocked) return balanceBlocked;
  if (runProfileSplitViewportsOption(options) && profile.target.viewports.length > 1) {
    return runSplitViewportProfileForCli(profile, options, { client, runner });
  }
  return runSingleRiddleProfileForCli(profile, options, { client, runner, outputDir: profileOutputDirOption(options) });
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
    const profile = profileWithSelectedViewportNamesForCli(normalizeProfileForCli(options), options);
    const result = positional[1] === "recover"
      ? await recoverProfileForCli(profile, options)
      : positional[1] === "aggregate"
        ? await aggregateProfileResultsForCli(profile, options)
      : await runProfileForCli(profile, options);
    writeProfileOutput(profileOutputDirOption(options), result);
    const diagnosticLine = profileCliDiagnosticLine(result);
    if (diagnosticLine && optionBoolean(options, "quiet") !== true) {
      process.stderr.write(`${diagnosticLine}\n`);
    }
    writeRunProfileResult(result, options);
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
