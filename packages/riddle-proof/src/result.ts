import type {
  RiddleProofEvidenceBundle,
  RiddleProofRunResult,
  RiddleProofRunState,
  RiddleProofStatus,
  RiddleProofTerminalMetadata,
} from "./types";

export function isTerminalStatus(status: RiddleProofStatus): boolean {
  return status === "blocked" || status === "failed" || status === "ready_to_ship" || status === "shipped" || status === "completed";
}

export function isSuccessfulStatus(status: RiddleProofStatus): boolean {
  return status !== "blocked" && status !== "failed";
}

export function compactRecord<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== "")) as Partial<T>;
}

export function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export interface TerminalMetadataInput {
  riddleState?: Record<string, unknown> | null;
  engineResult?: Record<string, unknown> | null;
  checkpointDetails?: Record<string, unknown> | null;
}

export function normalizeTerminalMetadata(input: TerminalMetadataInput): RiddleProofTerminalMetadata {
  const riddleState = recordValue(input.riddleState) || {};
  const result = recordValue(input.engineResult) || {};
  const contract = recordValue(result.checkpointContract) || {};
  const details = recordValue(input.checkpointDetails) || recordValue(contract.details) || {};
  const markedReady = riddleState.marked_ready ?? result.marked_ready ?? result.markedReady ?? details.marked_ready ?? details.markedReady;
  const finalized = riddleState.finalized ?? result.finalized ?? details.finalized;
  return compactRecord({
    pr_url:
      nonEmptyString(riddleState.pr_url) ||
      nonEmptyString(result.pr_url) ||
      nonEmptyString(result.prUrl) ||
      nonEmptyString(details.pr_url) ||
      nonEmptyString(details.prUrl),
    marked_ready: typeof markedReady === "boolean" ? markedReady : undefined,
    notification:
      recordValue(riddleState.notification) ||
      recordValue(riddleState.discord_notification) ||
      recordValue(result.notification) ||
      recordValue(result.discord_notification),
    proof_decision: nonEmptyString(riddleState.proof_decision) || nonEmptyString(result.proof_decision),
    merge_recommendation: nonEmptyString(riddleState.merge_recommendation) || nonEmptyString(result.merge_recommendation),
    finalized: typeof finalized === "boolean" ? finalized : undefined,
  }) as RiddleProofTerminalMetadata;
}

export function applyTerminalMetadata<T extends RiddleProofRunState>(state: T, metadata: RiddleProofTerminalMetadata): T {
  const prUrl = nonEmptyString(metadata.pr_url);
  if (prUrl) state.pr_url = prUrl;
  if (typeof metadata.marked_ready === "boolean") state.marked_ready = metadata.marked_ready;
  const notification = recordValue(metadata.notification);
  if (notification) state.notification = notification;
  const proofDecision = nonEmptyString(metadata.proof_decision);
  if (proofDecision) state.proof_decision = proofDecision;
  const mergeRecommendation = nonEmptyString(metadata.merge_recommendation);
  if (mergeRecommendation) state.merge_recommendation = mergeRecommendation;
  if (typeof metadata.finalized === "boolean") state.finalized = metadata.finalized;
  return state;
}

export function createRunResult(input: {
  state: RiddleProofRunState;
  status?: RiddleProofStatus;
  state_path?: string | null;
  last_summary?: string | null;
  metadata?: RiddleProofTerminalMetadata;
  evidence_bundle?: RiddleProofEvidenceBundle;
  raw?: Record<string, unknown>;
}): RiddleProofRunResult {
  const status = input.status || input.state.status;
  const ok = isSuccessfulStatus(status);
  const state = input.metadata ? applyTerminalMetadata(input.state, input.metadata) : input.state;
  state.status = status;
  state.ok = ok;
  return compactRecord({
    ok,
    status,
    run_id: state.run_id,
    state_path: input.state_path ?? state.state_path ?? null,
    worktree_path: state.worktree_path ?? null,
    branch: state.branch ?? null,
    current_stage: state.current_stage ?? null,
    iterations: state.iterations,
    last_checkpoint: state.last_checkpoint ?? null,
    last_summary: input.last_summary ?? null,
    event_count: state.events.length,
    pr_url: state.pr_url,
    marked_ready: state.marked_ready,
    notification: state.notification,
    proof_decision: state.proof_decision,
    merge_recommendation: state.merge_recommendation,
    finalized: state.finalized,
    blocker: state.blocker,
    evidence_bundle: input.evidence_bundle,
    raw: input.raw,
  }) as RiddleProofRunResult;
}
