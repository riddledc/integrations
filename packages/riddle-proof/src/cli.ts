#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
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
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
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

function readStdin() {
  return readFileSync(0, "utf-8");
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

function requestForRun(options: CliOptions): RiddleProofRunParams {
  const statePath = optionString(options, "statePath");
  if (optionString(options, "requestJson")) {
    return readJsonValue(optionString(options, "requestJson"), "--request-json") as RiddleProofRunParams;
  }
  if (statePath) return readRunState(statePath).request;
  throw new Error("--request-json is required unless --state-path points to an existing run state.");
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
        riddleEngineModuleUrl: optionString(options, "riddleEngineModuleUrl"),
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
