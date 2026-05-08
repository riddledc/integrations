#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import {
  createDisabledRiddleProofAgentAdapter,
  readRiddleProofRunStatus,
  runRiddleProofEngineHarness,
  type RiddleProofAgentAdapter,
  type RiddleProofCheckpointMode,
} from "./engine-harness";
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
    "  riddle-proof-loop respond --state-path <path> --response-json <file|json|->",
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

function readRunState(statePath: string): RiddleProofRunState {
  const parsed = readJsonValue(statePath, "--state-path");
  if (parsed.version !== "riddle-proof.run-state.v1" || !Array.isArray(parsed.events)) {
    throw new Error(`${statePath} is not a riddle-proof.run-state.v1 file.`);
  }
  return parsed as unknown as RiddleProofRunState;
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

  if (command === "run" || command === "respond") {
    const statePath = optionString(options, "statePath");
    const request = requestForRun(options);
    const response = command === "respond"
      ? readJsonValue(optionString(options, "responseJson"), "--response-json") as unknown as RiddleProofCheckpointResponse
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
