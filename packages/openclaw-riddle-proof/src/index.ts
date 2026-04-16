import { Type } from "@sinclair/typebox";
import {
  appendRunEvent,
  createRunResult,
  createRunState,
  readRiddleProofRunStatus,
  runRiddleProofEngineHarness,
  setRunStatus,
  type RiddleProofRunResult,
  type RiddleProofRunStatusSnapshot,
} from "@riddledc/riddle-proof";
import {
  toRiddleProofRunParams,
  type OpenClawProofedChangeParams,
} from "@riddledc/riddle-proof/openclaw";

export const RIDDLE_PROOF_CHANGE_TOOL_NAME = "riddle_proof_change";
export const RIDDLE_PROOF_STATUS_TOOL_NAME = "riddle_proof_status";

export type RiddleProofChangeParams = OpenClawProofedChangeParams;
export type OpenClawRiddleProofExecutionMode = "disabled" | "engine";

export interface CreateOpenClawRiddleProofResultOptions {
  implementationConfigured?: boolean;
}

export interface OpenClawRiddleProofRuntimeConfig {
  executionMode?: OpenClawRiddleProofExecutionMode;
  riddleEngineModuleUrl?: string;
  riddleProofDir?: string;
  defaultReviewer?: string;
  stateDir?: string;
  defaultMaxIterations?: number;
  defaultShipMode?: "none" | "ship";
}

export function createOpenClawRiddleProofResult(
  params: RiddleProofChangeParams,
  options: CreateOpenClawRiddleProofResultOptions = {},
): RiddleProofRunResult {
  const request = toRiddleProofRunParams(params);
  const state = createRunState({ request });

  appendRunEvent(state, {
    kind: "request.normalized",
    checkpoint: "request_normalized",
    stage: "setup",
    summary: "OpenClaw request normalized into Riddle Proof run params.",
    details: {
      verification_mode: request.verification_mode,
      integration_source: request.integration_context?.source,
      has_assertions: request.assertions !== undefined,
    },
  });

  if (!options.implementationConfigured) {
    state.blocker = {
      code: "execution_adapter_not_configured",
      message:
        "The OpenClaw Riddle Proof wrapper is installed, but no implementation adapter is configured yet.",
      checkpoint: "request_normalized",
      details: {
        next_step:
          "Wire the server-backed execution harness behind this wrapper after parity tests pass.",
        required_adapters: [
          "preflight",
          "setup",
          "implementation",
          "proof",
          "judge",
          "ship",
          "notification",
        ],
      },
    };
    setRunStatus(state, "blocked");
    return createRunResult({
      state,
      status: "blocked",
      last_summary: "Riddle Proof request normalized; execution adapter is not configured.",
      raw: {
        request,
      },
    });
  }

  setRunStatus(state, "running");
  return createRunResult({
    state,
    status: "running",
    last_summary: "Riddle Proof request normalized and ready for an implementation adapter.",
    raw: {
      request,
    },
  });
}

function runtimeConfigFrom(api: any): OpenClawRiddleProofRuntimeConfig {
  const cfg = (api.pluginConfig ?? {}) as Record<string, unknown>;
  const executionMode = cfg.executionMode === "engine" ? "engine" : "disabled";
  const defaultShipMode = cfg.defaultShipMode === "none" ? "none" : cfg.defaultShipMode === "ship" ? "ship" : undefined;
  return {
    executionMode,
    riddleEngineModuleUrl: typeof cfg.riddleEngineModuleUrl === "string" ? cfg.riddleEngineModuleUrl : undefined,
    riddleProofDir: typeof cfg.riddleProofDir === "string" ? cfg.riddleProofDir : undefined,
    defaultReviewer: typeof cfg.defaultReviewer === "string" ? cfg.defaultReviewer : undefined,
    stateDir: typeof cfg.stateDir === "string" ? cfg.stateDir : undefined,
    defaultMaxIterations: typeof cfg.defaultMaxIterations === "number" ? cfg.defaultMaxIterations : undefined,
    defaultShipMode,
  };
}

export async function runOpenClawRiddleProof(
  params: RiddleProofChangeParams,
  config: OpenClawRiddleProofRuntimeConfig = {},
): Promise<RiddleProofRunResult> {
  if (config.executionMode !== "engine") {
    return createOpenClawRiddleProofResult(params);
  }

  const request = toRiddleProofRunParams(params);
  return runRiddleProofEngineHarness({
    request,
    state_path: request.harness_state_path,
    max_iterations: request.max_iterations ?? config.defaultMaxIterations,
    dry_run: request.dry_run,
    auto_approve: request.auto_approve,
    config: {
      riddleEngineModuleUrl: config.riddleEngineModuleUrl,
      riddleProofDir: config.riddleProofDir,
      defaultReviewer: config.defaultReviewer,
      stateDir: config.stateDir,
      defaultMaxIterations: config.defaultMaxIterations,
      defaultShipMode: config.defaultShipMode,
    },
  });
}

export function readOpenClawRiddleProofStatus(state_path: string): RiddleProofRunStatusSnapshot | null {
  return readRiddleProofRunStatus(state_path);
}

const optionalString = (description: string) => Type.Optional(Type.String({ description }));
const optionalBoolean = (description: string) => Type.Optional(Type.Boolean({ description }));

export const riddleProofChangeParameters = Type.Object({
  repo: optionalString("Repository to change, such as owner/repo or a local repository path."),
  branch: optionalString("Working branch name to use or create."),
  change_request: Type.String({ description: "Plain-language change request for the coding agent." }),
  commit_message: optionalString("Preferred commit message for the agent-authored change."),
  prod_url: optionalString("Production URL or baseline URL for proof capture."),
  capture_script: optionalString("Capture script or instructions for gathering proof evidence."),
  success_criteria: optionalString("Criteria the proof evidence must satisfy."),
  assertions_json: optionalString("Optional JSON assertions string. Non-JSON text is preserved as a string assertion."),
  verification_mode: optionalString("Proof type, such as visual, interaction, data, json, audio, logs, or metrics."),
  reference: Type.Optional(Type.Union([
    Type.Literal("prod"),
    Type.Literal("before"),
    Type.Literal("both"),
  ], { description: "Baseline reference source." })),
  base_branch: optionalString("Base branch for comparison or pull request targeting."),
  before_ref: optionalString("Explicit before ref for comparison."),
  allow_static_preview_fallback: optionalBoolean("Allow static preview fallback when the requested server path fails."),
  context: optionalString("Additional context for the change."),
  reviewer: optionalString("Reviewer or review target."),
  mode: optionalString("Compatibility mode carried through to the implementation adapter."),
  build_command: optionalString("Build command for the changed project."),
  build_output: optionalString("Expected build output directory."),
  server_image: optionalString("Container image for server-based preview."),
  server_command: optionalString("Server start command for preview."),
  server_port: Type.Optional(Type.Number({ description: "Server port for preview." })),
  server_path: optionalString("Server path to request during preview capture."),
  use_auth: optionalBoolean("Whether proof capture needs configured authentication."),
  color_scheme: optionalString("Preferred color scheme for capture."),
  wait_for_selector: optionalString("Selector to wait for before capture."),
  ship_after_verify: optionalBoolean("Compatibility flag that maps to ship_mode=ship."),
  ship_mode: Type.Optional(Type.Union([
    Type.Literal("none"),
    Type.Literal("ship"),
  ], { description: "Whether to ship after verification." })),
  state_path: optionalString("Existing underlying Riddle Proof engine state path to resume."),
  harness_state_path: optionalString("Existing Riddle Proof wrapper run state path to resume."),
  max_iterations: Type.Optional(Type.Number({ description: "Maximum engine/checkpoint iterations before returning a blocker." })),
  auto_approve: optionalBoolean("Pass through Riddle Proof approval gates where supported."),
  dry_run: optionalBoolean("Stop at the first checkpoint and return a concrete blocker instead of applying agent output."),
  discord_channel: optionalString("Discord channel id for notifications or thread context."),
  discord_thread_id: optionalString("Discord thread id for notifications or thread context."),
  discord_message_id: optionalString("Discord source message id."),
  discord_source_url: optionalString("Discord source message URL."),
});

export const riddleProofStatusParameters = Type.Object({
  state_path: Type.String({ description: "Riddle Proof wrapper run state path returned by riddle_proof_change." }),
});

export default function register(api: any) {
  const runtimeConfig = runtimeConfigFrom(api);

  api.registerTool(
    {
      name: RIDDLE_PROOF_CHANGE_TOOL_NAME,
      description:
        "Run or normalize an OpenClaw proofed-change request through the Riddle Proof run contract. " +
        "By default this wrapper returns a blocked normalization result; engine mode is configured explicitly.",
      parameters: riddleProofChangeParameters,
      async execute(_id: string, params: RiddleProofChangeParams) {
        const result = await runOpenClawRiddleProof(params, runtimeConfig);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: RIDDLE_PROOF_STATUS_TOOL_NAME,
      description: "Return a cheap status snapshot for a Riddle Proof wrapper run state path.",
      parameters: riddleProofStatusParameters,
      async execute(_id: string, params: { state_path: string }) {
        const snapshot = readOpenClawRiddleProofStatus(params.state_path);
        const result = snapshot || {
          ok: false,
          status: "not_found",
          state_path: params.state_path,
          message: "No readable Riddle Proof run state exists at state_path.",
        };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    },
    { optional: true },
  );
}
