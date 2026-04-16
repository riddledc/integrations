import type {
  RiddleProofEvidenceBundle,
  RiddleProofPrLifecycleState,
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

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const normalized = nonEmptyString(value);
    if (normalized) return normalized;
  }
  return undefined;
}

function firstBoolean(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return undefined;
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

function normalizePrLifecycleStateInput(input?: Record<string, unknown>): RiddleProofPrLifecycleState | undefined {
  if (!input) return undefined;
  const cleanup = recordValue(input.cleanup);
  const mergeCommit =
    nonEmptyString(input.merge_commit) ||
    nonEmptyString(input.mergeCommit) ||
    nonEmptyString(recordValue(input.mergeCommit)?.oid);
  return compactRecord({
    status: normalizePrStatus(input.status || input.state),
    pr_url: nonEmptyString(input.pr_url) || nonEmptyString(input.prUrl) || nonEmptyString(input.url),
    pr_number: nonEmptyString(input.pr_number) || nonEmptyString(input.prNumber) || (
      typeof input.number === "number" ? String(input.number) : undefined
    ),
    repo: nonEmptyString(input.repo) || nonEmptyString(input.repository),
    head_branch: nonEmptyString(input.head_branch) || nonEmptyString(input.headBranch) || nonEmptyString(input.headRefName),
    base_branch: nonEmptyString(input.base_branch) || nonEmptyString(input.baseBranch) || nonEmptyString(input.baseRefName),
    merge_commit: mergeCommit,
    merged_at: nonEmptyString(input.merged_at) || nonEmptyString(input.mergedAt),
    closed_at: nonEmptyString(input.closed_at) || nonEmptyString(input.closedAt),
    checked_at: nonEmptyString(input.checked_at) || nonEmptyString(input.checkedAt),
    source: nonEmptyString(input.source),
    next_action: nonEmptyString(input.next_action) || nonEmptyString(input.nextAction),
    cleanup: cleanup && Object.keys(cleanup).length ? cleanup : undefined,
  }) as RiddleProofPrLifecycleState;
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
  const shipReport =
    recordValue(riddleState.ship_report) ||
    recordValue(result.ship_report) ||
    recordValue(result.shipReport) ||
    recordValue(details.ship_report) ||
    recordValue(details.shipReport) ||
    {};
  const markedReady = firstBoolean(
    riddleState.marked_ready,
    result.marked_ready,
    result.markedReady,
    details.marked_ready,
    details.markedReady,
    shipReport.marked_ready,
  );
  const leftDraft = firstBoolean(
    riddleState.left_draft,
    result.left_draft,
    result.leftDraft,
    details.left_draft,
    details.leftDraft,
    shipReport.left_draft,
  );
  const finalized = firstBoolean(riddleState.finalized, result.finalized, details.finalized);
  const prState = normalizePrLifecycleStateInput(
    recordValue(riddleState.pr_state) ||
      recordValue(riddleState.prState) ||
      recordValue(result.pr_state) ||
      recordValue(result.prState) ||
      recordValue(details.pr_state) ||
      recordValue(details.prState) ||
      recordValue(shipReport.pr_state) ||
      recordValue(shipReport.prState),
  );
  const cleanupReport =
    recordValue(riddleState.cleanup_report) ||
    recordValue(riddleState.cleanupReport) ||
    recordValue(result.cleanup_report) ||
    recordValue(result.cleanupReport) ||
    recordValue(details.cleanup_report) ||
    recordValue(details.cleanupReport) ||
    recordValue(prState?.cleanup);
  return compactRecord({
    pr_url: firstNonEmptyString(riddleState.pr_url, result.pr_url, result.prUrl, details.pr_url, details.prUrl, shipReport.pr_url),
    pr_branch: firstNonEmptyString(
      riddleState.pr_branch,
      riddleState.target_branch,
      result.pr_branch,
      result.prBranch,
      details.pr_branch,
      details.prBranch,
      shipReport.pr_branch,
      shipReport.branch,
      prState?.head_branch,
    ),
    pr_state: prState,
    marked_ready: markedReady,
    left_draft: leftDraft,
    ci_status: firstNonEmptyString(riddleState.ci_status, result.ci_status, result.ciStatus, details.ci_status, details.ciStatus, shipReport.ci_status),
    ship_commit: firstNonEmptyString(riddleState.ship_commit, result.ship_commit, result.shipCommit, details.ship_commit, details.shipCommit, shipReport.shipped_commit, shipReport.ship_commit),
    ship_remote_head: firstNonEmptyString(riddleState.ship_remote_head, result.ship_remote_head, result.shipRemoteHead, details.ship_remote_head, details.shipRemoteHead, shipReport.ship_remote_head),
    merge_commit: firstNonEmptyString(riddleState.merge_commit, riddleState.mergeCommit, result.merge_commit, result.mergeCommit, details.merge_commit, details.mergeCommit, prState?.merge_commit),
    merged_at: firstNonEmptyString(riddleState.merged_at, riddleState.mergedAt, result.merged_at, result.mergedAt, details.merged_at, details.mergedAt, prState?.merged_at),
    proof_comment_url: firstNonEmptyString(riddleState.proof_comment_url, result.proof_comment_url, result.proofCommentUrl, details.proof_comment_url, details.proofCommentUrl, shipReport.proof_comment_url),
    before_artifact_url: firstNonEmptyString(riddleState.before_artifact_url, riddleState.before_cdn, result.before_artifact_url, result.beforeArtifactUrl, details.before_artifact_url, details.beforeArtifactUrl, shipReport.before_artifact_url),
    prod_artifact_url: firstNonEmptyString(riddleState.prod_artifact_url, riddleState.prod_cdn, result.prod_artifact_url, result.prodArtifactUrl, details.prod_artifact_url, details.prodArtifactUrl, shipReport.prod_artifact_url),
    after_artifact_url: firstNonEmptyString(riddleState.after_artifact_url, riddleState.after_cdn, result.after_artifact_url, result.afterArtifactUrl, details.after_artifact_url, details.afterArtifactUrl, shipReport.after_artifact_url),
    ship_report: Object.keys(shipReport).length ? shipReport : undefined,
    cleanup_report: cleanupReport,
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
  if (metadata.pr_state) {
    state.pr_state = metadata.pr_state;
    if (metadata.pr_state.pr_url) state.pr_url = metadata.pr_state.pr_url;
    if (metadata.pr_state.head_branch) state.pr_branch = metadata.pr_state.head_branch;
    if (metadata.pr_state.merge_commit) state.merge_commit = metadata.pr_state.merge_commit;
    if (metadata.pr_state.merged_at) state.merged_at = metadata.pr_state.merged_at;
    if (metadata.pr_state.cleanup) state.cleanup_report = metadata.pr_state.cleanup;
    if (metadata.pr_state.status === "merged") state.finalized = true;
  }
  const prUrl = nonEmptyString(metadata.pr_url);
  if (prUrl) state.pr_url = prUrl;
  const prBranch = nonEmptyString(metadata.pr_branch);
  if (prBranch) state.pr_branch = prBranch;
  if (typeof metadata.marked_ready === "boolean") state.marked_ready = metadata.marked_ready;
  if (typeof metadata.left_draft === "boolean") state.left_draft = metadata.left_draft;
  const ciStatus = nonEmptyString(metadata.ci_status);
  if (ciStatus) state.ci_status = ciStatus;
  const shipCommit = nonEmptyString(metadata.ship_commit);
  if (shipCommit) state.ship_commit = shipCommit;
  const shipRemoteHead = nonEmptyString(metadata.ship_remote_head);
  if (shipRemoteHead) state.ship_remote_head = shipRemoteHead;
  const mergeCommit = nonEmptyString(metadata.merge_commit);
  if (mergeCommit) state.merge_commit = mergeCommit;
  const mergedAt = nonEmptyString(metadata.merged_at);
  if (mergedAt) state.merged_at = mergedAt;
  const proofCommentUrl = nonEmptyString(metadata.proof_comment_url);
  if (proofCommentUrl) state.proof_comment_url = proofCommentUrl;
  const beforeArtifactUrl = nonEmptyString(metadata.before_artifact_url);
  if (beforeArtifactUrl) state.before_artifact_url = beforeArtifactUrl;
  const prodArtifactUrl = nonEmptyString(metadata.prod_artifact_url);
  if (prodArtifactUrl) state.prod_artifact_url = prodArtifactUrl;
  const afterArtifactUrl = nonEmptyString(metadata.after_artifact_url);
  if (afterArtifactUrl) state.after_artifact_url = afterArtifactUrl;
  const shipReport = recordValue(metadata.ship_report);
  if (shipReport) state.ship_report = shipReport;
  const cleanupReport = recordValue(metadata.cleanup_report);
  if (cleanupReport) state.cleanup_report = cleanupReport;
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
    pr_branch: state.pr_branch,
    pr_state: state.pr_state as RiddleProofPrLifecycleState | undefined,
    marked_ready: state.marked_ready,
    left_draft: state.left_draft,
    ci_status: state.ci_status,
    ship_commit: state.ship_commit,
    ship_remote_head: state.ship_remote_head,
    merge_commit: state.merge_commit,
    merged_at: state.merged_at,
    proof_comment_url: state.proof_comment_url,
    before_artifact_url: state.before_artifact_url,
    prod_artifact_url: state.prod_artifact_url,
    after_artifact_url: state.after_artifact_url,
    ship_report: state.ship_report,
    cleanup_report: state.cleanup_report,
    notification: state.notification,
    proof_decision: state.proof_decision,
    merge_recommendation: state.merge_recommendation,
    finalized: state.finalized,
    blocker: state.blocker,
    evidence_bundle: input.evidence_bundle,
    raw: input.raw,
  }) as RiddleProofRunResult;
}
