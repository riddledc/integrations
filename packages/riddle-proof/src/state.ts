import type {
  IntegrationContext,
  RiddleProofEvent,
  RiddleProofPrLifecycleState,
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

function normalizePrStatus(value: unknown): RiddleProofPrLifecycleState["status"] {
  const status = nonEmptyString(value)?.toLowerCase();
  if (status === "merged") return "merged";
  if (status === "open") return "open";
  if (status === "closed") return "closed";
  if (status === "not_found" || status === "not-found") return "not_found";
  if (status === "unavailable") return "unavailable";
  return status || "unknown";
}

export function normalizePrLifecycleState(
  input?: Partial<RiddleProofPrLifecycleState> | Record<string, unknown> | null,
  checkedAt = timestamp(),
): RiddleProofPrLifecycleState | undefined {
  const value = recordValue(input);
  if (!value) return undefined;

  const cleanup = recordValue(value.cleanup);
  const mergeCommit =
    nonEmptyString(value.merge_commit) ||
    nonEmptyString(value.mergeCommit) ||
    nonEmptyString(recordValue(value.mergeCommit)?.oid);
  return compactRecord({
    status: normalizePrStatus(value.status || value.state),
    pr_url: nonEmptyString(value.pr_url) || nonEmptyString(value.prUrl) || nonEmptyString(value.url),
    pr_number: nonEmptyString(value.pr_number) || nonEmptyString(value.prNumber) || (
      typeof value.number === "number" ? String(value.number) : undefined
    ),
    repo: nonEmptyString(value.repo) || nonEmptyString(value.repository),
    head_branch: nonEmptyString(value.head_branch) || nonEmptyString(value.headBranch) || nonEmptyString(value.headRefName),
    base_branch: nonEmptyString(value.base_branch) || nonEmptyString(value.baseBranch) || nonEmptyString(value.baseRefName),
    merge_commit: mergeCommit,
    merged_at: nonEmptyString(value.merged_at) || nonEmptyString(value.mergedAt),
    closed_at: nonEmptyString(value.closed_at) || nonEmptyString(value.closedAt),
    checked_at: nonEmptyString(value.checked_at) || nonEmptyString(value.checkedAt) || checkedAt,
    source: nonEmptyString(value.source),
    next_action: nonEmptyString(value.next_action) || nonEmptyString(value.nextAction),
    cleanup: cleanup && Object.keys(cleanup).length ? cleanup : undefined,
  }) as RiddleProofPrLifecycleState;
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
    leave_draft: input.leave_draft,
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
    pr_url: state.pr_url ?? null,
    pr_branch: state.pr_branch ?? null,
    pr_state: state.pr_state,
    ci_status: state.ci_status,
    ship_commit: state.ship_commit,
    ship_remote_head: state.ship_remote_head,
    merge_commit: state.merge_commit,
    merged_at: state.merged_at,
    proof_comment_url: state.proof_comment_url,
    cleanup_report: state.cleanup_report,
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

export function applyPrLifecycleState<T extends RiddleProofRunState>(
  state: T,
  input?: Partial<RiddleProofPrLifecycleState> | Record<string, unknown> | null,
  at = timestamp(),
): T {
  const prState = normalizePrLifecycleState(input, at);
  if (!prState) return state;

  state.pr_state = prState;
  if (prState.pr_url) state.pr_url = prState.pr_url;
  if (prState.head_branch) state.pr_branch = prState.head_branch;
  if (prState.merge_commit) state.merge_commit = prState.merge_commit;
  if (prState.merged_at) state.merged_at = prState.merged_at;
  if (prState.cleanup) state.cleanup_report = prState.cleanup;

  if (prState.status === "merged") {
    state.finalized = true;
    state.status = "completed";
    state.ok = true;
  }

  state.updated_at = at;
  return state;
}
