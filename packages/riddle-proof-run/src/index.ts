import { Type } from "@sinclair/typebox";
import {
  createRiddleProofEngine,
} from "./engine.js";
import {
  readState,
  resolveConfig,
  summarizeState,
  type WorkflowParams,
} from "./core.js";

export { createRiddleProofEngine, executeWorkflow } from "./engine.js";

function result(data: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

const plugin = {
  id: "riddle-proof-run",
  name: "Riddle Proof Run",
  description: "Evidence-backed wrapper around the riddle-proof setup, recon-baseline, author, implement, verify, and ship workflow",
  configSchema: Type.Object({
    riddleProofDir: Type.Optional(Type.String()),
    statePath: Type.Optional(Type.String()),
    defaultReviewer: Type.Optional(Type.String()),
  }),
  register(api: any) {
    api.registerTool(
      {
        name: "riddle_proof_run",
        description: "Run the evidence-backed riddle-proof workflow through setup, recon, author, implement, verify, ship, status, or staged run checkpoints.",
        parameters: Type.Object({
          action: Type.Union([
            Type.Literal("setup"),
            Type.Literal("recon"),
            Type.Literal("author"),
            Type.Literal("implement"),
            Type.Literal("verify"),
            Type.Literal("ship"),
            Type.Literal("status"),
            Type.Literal("sync"),
            Type.Literal("run"),
          ]),
          repo: Type.Optional(Type.String({ description: "owner/repo for setup or run" })),
          branch: Type.Optional(Type.String({ description: "feature branch for setup or run" })),
          change_request: Type.Optional(Type.String({ description: "human-readable change or verification request" })),
          commit_message: Type.Optional(Type.String({ description: "commit message / PR title; defaults to change_request during setup" })),
          prod_url: Type.Optional(Type.String({ description: "production reference URL when prod comparison is needed" })),
          capture_script: Type.Optional(Type.String({ description: "Playwright capture script for verify once recon/author have established the proof plan" })),
          success_criteria: Type.Optional(Type.String({ description: "plain-English definition of what counts as fixed" })),
          assertions_json: Type.Optional(Type.String({ description: "optional JSON array/object of checks to satisfy" })),
          verification_mode: Type.Optional(Type.String({ description: "proof, visual, interaction, render, data, or custom label" })),
          reference: Type.Optional(Type.Union([Type.Literal("prod"), Type.Literal("before"), Type.Literal("both")], { description: "comparison reference; setup falls back to before until a prod URL is known" })),
          base_branch: Type.Optional(Type.String({ description: "target branch for PR base; defaults to main" })),
          before_ref: Type.Optional(Type.String({ description: "detached baseline ref for before preview; defaults to origin/<base_branch>" })),
          allow_static_preview_fallback: Type.Optional(Type.Boolean({ description: "allow server mode to fall back to static preview; keep false for routed/interactive apps" })),
          context: Type.Optional(Type.String()),
          reviewer: Type.Optional(Type.String()),
          mode: Type.Optional(Type.Union([Type.Literal("server"), Type.Literal("static")], { description: "preview mode" })),
          build_command: Type.Optional(Type.String()),
          build_output: Type.Optional(Type.String()),
          server_image: Type.Optional(Type.String()),
          server_command: Type.Optional(Type.String()),
          server_port: Type.Optional(Type.Number()),
          server_path: Type.Optional(Type.String()),
          use_auth: Type.Optional(Type.Boolean()),
          auth_localStorage_json: Type.Optional(Type.String({ description: "JSON object of localStorage entries to inject for authenticated proof runs" })),
          auth_cookies_json: Type.Optional(Type.String({ description: "JSON object or array of cookies to inject for authenticated proof runs" })),
          auth_headers_json: Type.Optional(Type.String({ description: "JSON object of request headers to use for authenticated proof runs" })),
          color_scheme: Type.Optional(Type.Union([Type.Literal("dark"), Type.Literal("light")])) ,
          wait_for_selector: Type.Optional(Type.String()),
          discord_channel: Type.Optional(Type.String({ description: "Discord parent channel ID for the user request, when invoked from Discord" })),
          discord_thread_id: Type.Optional(Type.String({ description: "Discord thread ID for the user request; final ready notifications should post here when available" })),
          discord_message_id: Type.Optional(Type.String({ description: "Discord message ID of the user request, used as a reply reference when no thread ID is available" })),
          discord_source_url: Type.Optional(Type.String({ description: "Discord permalink for the user request, for traceability" })),
          recon_assessment_json: Type.Optional(Type.String({ description: "JSON recon assessment authored by the supervising agent: decision, summary, baseline_understanding, continue_with_stage, escalation_target, refined_inputs, reasons" })),
          proof_plan: Type.Optional(Type.String({ description: "recon-derived notes about the exact proof to capture during verify" })),
          author_packet_json: Type.Optional(Type.String({ description: "JSON proof packet authored by the supervising agent: proof_plan, capture_script, baseline_understanding_used, refined_inputs, rationale, confidence" })),
          implementation_notes: Type.Optional(Type.String({ description: "optional summary of the code change made between recon and verify" })),
          proof_assessment_json: Type.Optional(Type.String({ description: "JSON proof assessment authored by the supervising agent: decision, summary, recommended_stage, continue_with_stage, escalation_target, reasons" })),
          state_path: Type.Optional(Type.String({ description: "Existing riddle-proof state file to resume; setup/run return this for concurrent-safe continuation" })),
          auto_approve: Type.Optional(Type.Boolean({ description: "auto-resume lobster approval gates for this call" })),
          continue_from_checkpoint: Type.Optional(Type.Boolean({ description: "For action=run, continue from the active checkpoint using its recorded continue/recommended stage." })),
          ship_after_verify: Type.Optional(Type.Boolean({ description: "when explicitly requested, allow a verify advance to continue into ship" })),
          leave_draft: Type.Optional(Type.Boolean({ description: "Opt-in escape hatch: keep the PR draft after proof and CI instead of marking it ready." })),
          cleanup_merged_pr: Type.Optional(Type.Boolean({ description: "For action=sync, prune proof worktrees and temporary proof branches after the PR is merged. Defaults to true." })),
          fetch_base: Type.Optional(Type.Boolean({ description: "For action=sync, fetch the PR base branch after merge. Defaults to true." })),
          update_base_checkout: Type.Optional(Type.Boolean({ description: "For action=sync, fast-forward the clean local base checkout after merge when it can be done safely. Defaults to true." })),
          advance_stage: Type.Optional(Type.Union([
            Type.Literal("setup"),
            Type.Literal("recon"),
            Type.Literal("author"),
            Type.Literal("implement"),
            Type.Literal("verify"),
            Type.Literal("ship"),
          ], { description: "For action=run, explicitly choose the next stage attempt instead of relying on wrapper guesses." })),
        }),
        async execute(_id: string, params: WorkflowParams) {
          const config = resolveConfig(api.pluginConfig ?? {}, params || ({} as WorkflowParams));
          const engine = createRiddleProofEngine(api.pluginConfig ?? {});
          try {
            const payload = await engine.execute(params);
            return result(payload);
          } catch (error: any) {
            return result({
              ok: false,
              action: params?.action || null,
              error: error?.message || String(error),
              state_path: config.statePath,
              stage: summarizeState(readState(config.statePath)).stage,
            });
          }
        },
      },
      { optional: true },
    );
  },
};

export default plugin;
