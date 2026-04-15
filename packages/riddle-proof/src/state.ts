import type {
  IntegrationContext,
  RiddleProofEvent,
  RiddleProofRunParams,
  RiddleProofRunState,
  RiddleProofStatus,
} from "./types";
import { compactRecord, nonEmptyString, recordValue } from "./result";

export const RIDDLE_PROOF_RUN_STATE_VERSION = "riddle-proof.run-state.v1" as const;

export interface CreateRunStateInput {
  request: RiddleProofRunParams;
  status?: RiddleProofStatus;
  state_path?: string;
  created_at?: string;
  updated_at?: string;
  iterations?: number;
  last_checkpoint?: string | null;
  events?: RiddleProofEvent[];
}

export type RunEventInput = Omit<RiddleProofEvent, "ts"> & { ts?: string };

function timestamp() {
  return new Date().toISOString();
}

export function normalizeIntegrationContext(
  input?: Partial<IntegrationContext> | Record<string, unknown> | null,
  fallbackSource?: IntegrationContext["source"],
): IntegrationContext | undefined {
  const value = recordValue(input);
  if (!value) {
    return fallbackSource ? { source: fallbackSource } : undefined;
  }

  const metadata = recordValue(value.metadata);
  return compactRecord({
    source: nonEmptyString(value.source) || fallbackSource,
    channel_id: nonEmptyString(value.channel_id),
    thread_id: nonEmptyString(value.thread_id),
    message_id: nonEmptyString(value.message_id),
    source_url: nonEmptyString(value.source_url),
    metadata: metadata && Object.keys(metadata).length ? metadata : undefined,
  }) as IntegrationContext;
}

export function normalizeRunParams(input: RiddleProofRunParams): RiddleProofRunParams {
  return compactRecord({
    repo: input.repo,
    branch: input.branch,
    change_request: input.change_request,
    commit_message: input.commit_message,
    prod_url: input.prod_url,
    capture_script: input.capture_script,
    success_criteria: input.success_criteria,
    assertions: input.assertions,
    verification_mode: input.verification_mode,
    reference: input.reference,
    base_branch: input.base_branch,
    before_ref: input.before_ref,
    allow_static_preview_fallback: input.allow_static_preview_fallback,
    context: input.context,
    reviewer: input.reviewer,
    mode: input.mode,
    build_command: input.build_command,
    build_output: input.build_output,
    server_image: input.server_image,
    server_command: input.server_command,
    server_port: input.server_port,
    server_path: input.server_path,
    use_auth: input.use_auth,
    color_scheme: input.color_scheme,
    wait_for_selector: input.wait_for_selector,
    ship_mode: input.ship_mode,
    integration_context: normalizeIntegrationContext(input.integration_context),
  }) as RiddleProofRunParams;
}

export function createRunState(input: CreateRunStateInput): RiddleProofRunState {
  const createdAt = input.created_at || timestamp();
  return compactRecord({
    version: RIDDLE_PROOF_RUN_STATE_VERSION,
    state_path: input.state_path,
    status: input.status || "running",
    created_at: createdAt,
    updated_at: input.updated_at || createdAt,
    request: normalizeRunParams(input.request),
    iterations: input.iterations ?? 0,
    last_checkpoint: input.last_checkpoint ?? null,
    events: input.events ? [...input.events] : [],
  }) as RiddleProofRunState;
}

export function appendRunEvent<T extends RiddleProofRunState>(state: T, input: RunEventInput): T {
  const event: RiddleProofEvent = {
    ts: input.ts || timestamp(),
    kind: input.kind,
    checkpoint: input.checkpoint,
    stage: input.stage,
    summary: input.summary,
    details: input.details,
  };

  state.events.push(compactRecord({
    ts: event.ts,
    kind: event.kind,
    checkpoint: event.checkpoint,
    stage: event.stage,
    summary: event.summary,
    details: event.details,
  }) as RiddleProofEvent);
  if (input.checkpoint !== undefined) state.last_checkpoint = input.checkpoint;
  state.updated_at = event.ts;
  return state;
}

export function setRunStatus<T extends RiddleProofRunState>(state: T, status: RiddleProofStatus, at = timestamp()): T {
  state.status = status;
  state.ok = status !== "blocked" && status !== "failed";
  state.updated_at = at;
  return state;
}
