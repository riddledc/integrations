import type { IntegrationContext, JsonValue, RiddleProofRunParams } from "./types";
import { compactRecord } from "./result";
import { normalizeIntegrationContext, normalizeRunParams } from "./state";

export interface OpenClawProofedChangeParams {
  repo?: string;
  branch?: string;
  change_request?: string;
  commit_message?: string;
  prod_url?: string;
  capture_script?: string;
  success_criteria?: string;
  assertions_json?: string;
  verification_mode?: string;
  reference?: "prod" | "before" | "both";
  base_branch?: string;
  before_ref?: string;
  allow_static_preview_fallback?: boolean;
  context?: string;
  reviewer?: string;
  mode?: string;
  build_command?: string;
  build_output?: string;
  server_image?: string;
  server_command?: string;
  server_port?: number;
  server_path?: string;
  use_auth?: boolean;
  color_scheme?: "dark" | "light" | (string & {});
  wait_for_selector?: string;
  ship_after_verify?: boolean;
  ship_mode?: "none" | "ship";
  leave_draft?: boolean;
  state_path?: string;
  harness_state_path?: string;
  max_iterations?: number;
  auto_approve?: boolean;
  dry_run?: boolean;
  discord_channel?: string;
  discord_thread_id?: string;
  discord_message_id?: string;
  discord_source_url?: string;
}

export function parseOpenClawAssertions(value: unknown): JsonValue | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return value as JsonValue;

  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as JsonValue;
  } catch {
    return trimmed;
  }
}

export function openClawIntegrationContext(params: OpenClawProofedChangeParams): IntegrationContext {
  const hasDiscordContext = Boolean(params.discord_channel || params.discord_thread_id || params.discord_message_id || params.discord_source_url);
  return normalizeIntegrationContext({
    source: hasDiscordContext ? "discord" : "openclaw",
    channel_id: params.discord_channel,
    thread_id: params.discord_thread_id,
    message_id: params.discord_message_id,
    source_url: params.discord_source_url,
    metadata: compactRecord({
      wrapper: "openclaw",
      tool: "proofed_change_run",
    }) as Record<string, unknown>,
  }, "openclaw") as IntegrationContext;
}

export function toRiddleProofRunParams(params: OpenClawProofedChangeParams): RiddleProofRunParams {
  return normalizeRunParams({
    repo: params.repo,
    branch: params.branch,
    change_request: params.change_request,
    commit_message: params.commit_message,
    prod_url: params.prod_url,
    capture_script: params.capture_script,
    success_criteria: params.success_criteria,
    assertions: parseOpenClawAssertions(params.assertions_json),
    verification_mode: params.verification_mode,
    reference: params.reference,
    base_branch: params.base_branch,
    before_ref: params.before_ref,
    allow_static_preview_fallback: params.allow_static_preview_fallback,
    context: params.context,
    reviewer: params.reviewer,
    mode: params.mode,
    build_command: params.build_command,
    build_output: params.build_output,
    server_image: params.server_image,
    server_command: params.server_command,
    server_port: params.server_port,
    server_path: params.server_path,
    use_auth: params.use_auth,
    color_scheme: params.color_scheme,
    wait_for_selector: params.wait_for_selector,
    ship_mode: params.ship_mode || (params.ship_after_verify ? "ship" : undefined),
    leave_draft: params.leave_draft,
    engine_state_path: params.state_path,
    harness_state_path: params.harness_state_path,
    max_iterations: params.max_iterations,
    auto_approve: params.auto_approve,
    dry_run: params.dry_run,
    integration_context: openClawIntegrationContext(params),
  });
}
