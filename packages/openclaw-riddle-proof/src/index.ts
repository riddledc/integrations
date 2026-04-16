import { Type } from "@sinclair/typebox";
import {
  appendRunEvent,
  createRunResult,
  createRunState,
  setRunStatus,
  type RiddleProofRunResult,
} from "@riddledc/riddle-proof";
import {
  toRiddleProofRunParams,
  type OpenClawProofedChangeParams,
} from "@riddledc/riddle-proof/openclaw";

export const RIDDLE_PROOF_CHANGE_TOOL_NAME = "riddle_proof_change";

export type RiddleProofChangeParams = OpenClawProofedChangeParams;

export interface CreateOpenClawRiddleProofResultOptions {
  implementationConfigured?: boolean;
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
  discord_channel: optionalString("Discord channel id for notifications or thread context."),
  discord_thread_id: optionalString("Discord thread id for notifications or thread context."),
  discord_message_id: optionalString("Discord source message id."),
  discord_source_url: optionalString("Discord source message URL."),
});

export default function register(api: any) {
  api.registerTool(
    {
      name: RIDDLE_PROOF_CHANGE_TOOL_NAME,
      description:
        "Normalize an OpenClaw proofed-change request into the Riddle Proof run contract. " +
        "This initial wrapper returns a blocked result until the execution adapter is wired.",
      parameters: riddleProofChangeParameters,
      async execute(_id: string, params: RiddleProofChangeParams) {
        const result = createOpenClawRiddleProofResult(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    },
    { optional: true },
  );
}
