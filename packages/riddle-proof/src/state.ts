import type {
  IntegrationContext,
  RiddleProofEvent,
  RiddleProofRunParams,
  RiddleProofRunStatusSnapshot,
  RiddleProofRunState,
  RiddleProofStage,
  RiddleProofStatus,
} from "./types";
import { compactRecord, nonEmptyString, recordValue } from "./result";

export const RIDDLE_PROOF_RUN_STATE_VERSION = "riddle-proof.run-state.v1" as const;

export interface CreateRunStateInput {
  request: RiddleProofRunParams;
  run_id?: string;
  status?: RiddleProofStatus;
  state_path?: string;
  worktree_path?: string;
  branch?: string;
  current_stage?: RiddleProofStage | null;
  stage_started_at?: string | null;
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

function createRunId(createdAt: string): string {
  const stamp = createdAt.replace(/\D/g, "").slice(0, 14) || "unknown";
  const entropy = Math.random().toString(36).slice(2, 8) || "run";
  return `rp_${stamp}_${entropy}`;
}

function elapsedMs(start?: string | null, end?: string | null): number | undefined {
  const startMs = start ? Date.parse(start) : NaN;
  const endMs = end ? Date.parse(end) : NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return undefined;
  return Math.max(0, endMs - startMs);
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
    engine_state_path: input.engine_state_path,
    harness_state_path: input.harness_state_path,
    max_iterations: input.max_iterations,
    auto_approve: input.auto_approve,
    dry_run: input.dry_run,
    integration_context: normalizeIntegrationContext(input.integration_context),
  }) as RiddleProofRunParams;
}

export function createRunState(input: CreateRunStateInput): RiddleProofRunState {
  const createdAt = input.created_at || timestamp();
  return compactRecord({
    version: RIDDLE_PROOF_RUN_STATE_VERSION,
    run_id: input.run_id || createRunId(createdAt),
    state_path: input.state_path,
    worktree_path: input.worktree_path,
    branch: input.branch || input.request.branch,
    current_stage: input.current_stage ?? null,
    stage_started_at: input.stage_started_at ?? null,
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
  if (input.stage !== undefined) {
    if (state.current_stage !== input.stage) state.stage_started_at = event.ts;
    state.current_stage = input.stage;
  }
  state.updated_at = event.ts;
  return state;
}

export function appendStageHeartbeat<T extends RiddleProofRunState>(state: T, input: {
  stage: RiddleProofStage;
  summary?: string;
  checkpoint?: string;
  wait_reason?: string;
  blocker?: string;
  details?: Record<string, unknown>;
  ts?: string;
}): T {
  const at = input.ts || timestamp();
  return appendRunEvent(state, {
    ts: at,
    kind: "stage.heartbeat",
    checkpoint: input.checkpoint || `${input.stage}_heartbeat`,
    stage: input.stage,
    summary: input.summary || `${input.stage} stage is active.`,
    details: compactRecord({
      elapsed_ms: elapsedMs(state.created_at, at),
      stage_elapsed_ms: elapsedMs(state.stage_started_at, at),
      wait_reason: input.wait_reason,
      blocker: input.blocker,
      ...input.details,
    }) as Record<string, unknown>,
  });
}

export function createRunStatusSnapshot(state: RiddleProofRunState, at = timestamp()): RiddleProofRunStatusSnapshot {
  const latestEvent = state.events[state.events.length - 1];
  const runId = state.run_id || "unknown";
  return compactRecord({
    run_id: runId,
    status: state.status,
    current_stage: state.current_stage ?? null,
    state_path: state.state_path ?? null,
    worktree_path: state.worktree_path ?? null,
    branch: state.branch ?? null,
    iterations: state.iterations,
    last_checkpoint: state.last_checkpoint ?? null,
    updated_at: state.updated_at,
    elapsed_ms: elapsedMs(state.created_at, at),
    stage_elapsed_ms: elapsedMs(state.stage_started_at, at),
    blocker: state.blocker,
    latest_event: latestEvent,
  }) as RiddleProofRunStatusSnapshot;
}

export function setRunStatus<T extends RiddleProofRunState>(state: T, status: RiddleProofStatus, at = timestamp()): T {
  state.status = status;
  state.ok = status !== "blocked" && status !== "failed";
  state.updated_at = at;
  return state;
}
