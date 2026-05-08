import type {
  RiddleProofCheckpointArtifact,
  RiddleProofRunCard,
  RiddleProofRunState,
  RiddleProofStatePaths,
} from "./types";
import { compactRecord, isTerminalStatus, nonEmptyString, recordValue } from "./result";
import { statePathsForRunState } from "./checkpoint";

export const RIDDLE_PROOF_RUN_CARD_VERSION = "riddle-proof.run-card.v1" as const;

function elapsedMs(start?: string | null, end?: string | null): number | undefined {
  const startMs = start ? Date.parse(start) : NaN;
  const endMs = end ? Date.parse(end) : NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return undefined;
  return Math.max(0, endMs - startMs);
}

function jsonCloneRecord(value: unknown): Record<string, unknown> | undefined {
  const record = recordValue(value);
  if (!record) return undefined;
  try {
    return JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
  } catch {
    return { ...record };
  }
}

function compactText(value: unknown, limit = 600): string | undefined {
  const text = nonEmptyString(value);
  if (!text) return undefined;
  return text.length <= limit ? text : `${text.slice(0, limit - 20).trimEnd()}...`;
}

function visualDeltaFrom(input: {
  fullRiddleState?: Record<string, unknown> | null;
  runState: RiddleProofRunState;
}): Record<string, unknown> | undefined {
  const fullState = input.fullRiddleState || {};
  const bundle = recordValue(fullState.evidence_bundle);
  const after = recordValue(bundle?.after);
  const afterDelta = recordValue(after?.visual_delta);
  if (afterDelta && Object.keys(afterDelta).length) return afterDelta;
  const requestDelta = recordValue(recordValue(fullState.proof_assessment_request)?.visual_delta);
  if (requestDelta && Object.keys(requestDelta).length) return requestDelta;
  const packetDelta = recordValue(input.runState.checkpoint_packet?.evidence_excerpt?.visual_delta);
  return packetDelta && Object.keys(packetDelta).length ? packetDelta : undefined;
}

function artifactsFrom(input: {
  fullRiddleState?: Record<string, unknown> | null;
  runState: RiddleProofRunState;
}): RiddleProofCheckpointArtifact[] | undefined {
  const packetArtifacts = input.runState.checkpoint_packet?.artifacts;
  if (packetArtifacts?.length) return packetArtifacts.slice(0, 12);
  const fullState = input.fullRiddleState || {};
  const artifacts: RiddleProofCheckpointArtifact[] = [];
  for (const role of ["before", "prod", "after"] as const) {
    const url = nonEmptyString(fullState[`${role}_cdn`]) || nonEmptyString(input.runState[`${role}_artifact_url`]);
    if (url) artifacts.push({ role, url, name: `${role}.png`, mime_type: "image/png" });
  }
  return artifacts.length ? artifacts : undefined;
}

function ownerFor(state: RiddleProofRunState) {
  if (state.status === "awaiting_checkpoint") {
    const role = nonEmptyString(state.checkpoint_packet?.routing_hint?.suggested_role);
    return role || "supervising_agent";
  }
  if (state.status === "running") return "engine";
  if (state.status === "blocked" || state.status === "failed") return "human_or_operator";
  return "none";
}

function actionFor(state: RiddleProofRunState) {
  if (state.status === "awaiting_checkpoint") return state.checkpoint_packet?.question || "Answer the pending checkpoint.";
  if (state.status === "running") return "Continue the current Riddle Proof stage.";
  if (state.status === "blocked" || state.status === "failed") return state.blocker?.message || "Inspect the blocker and decide whether a new run or infrastructure repair is needed.";
  if (state.status === "ready_to_ship") return "Ship is held by policy; review PR/ship policy before advancing.";
  return "No next action; run is terminal.";
}

function evidenceIssueCode(input: {
  fullRiddleState?: Record<string, unknown> | null;
  runState: RiddleProofRunState;
}) {
  const packetIssue = nonEmptyString(input.runState.checkpoint_packet?.evidence_excerpt?.evidence_issue_code);
  if (packetIssue) return packetIssue;
  const assessmentIssue = nonEmptyString(recordValue(input.fullRiddleState?.proof_assessment)?.evidence_issue_code);
  if (assessmentIssue) return assessmentIssue;
  const delta = visualDeltaFrom(input);
  const status = nonEmptyString(delta?.status);
  if (status === "unmeasured") {
    const reason = `${nonEmptyString(delta?.reason) || ""}\n${input.runState.blocker?.message || ""}`.toLowerCase();
    return reason.includes("fetch") ||
      reason.includes("allowlist") ||
      reason.includes("registered domain") ||
      reason.includes("high risk") ||
      reason.includes("comparator")
      ? "comparator_fetch_blocked"
      : "visual_delta_unmeasured";
  }
  if (status === "measured" && delta?.passed === false) return "semantic_proof_failed";
  return undefined;
}

export function createRiddleProofRunCard(
  state: RiddleProofRunState,
  input: {
    fullRiddleState?: Record<string, unknown> | null;
    state_paths?: RiddleProofStatePaths;
    at?: string;
  } = {},
): RiddleProofRunCard {
  const at = input.at || new Date().toISOString();
  const fullState = input.fullRiddleState || {};
  const packet = state.checkpoint_packet;
  const latestEvent = state.events[state.events.length - 1];
  const bundle = recordValue(fullState.evidence_bundle);
  const artifactContract =
    jsonCloneRecord(packet?.artifact_contract) ||
    jsonCloneRecord(recordValue(fullState.proof_assessment_request)?.artifact_contract) ||
    jsonCloneRecord(recordValue(bundle?.artifact_contract)) ||
    jsonCloneRecord(state.proof_contract?.artifact_contract);
  const required = jsonCloneRecord(recordValue(artifactContract)?.required);
  const statePaths = input.state_paths || state.state_paths || statePathsForRunState(state);
  const visualDelta = visualDeltaFrom({ fullRiddleState: fullState, runState: state });
  const artifacts = artifactsFrom({ fullRiddleState: fullState, runState: state });

  return {
    version: RIDDLE_PROOF_RUN_CARD_VERSION,
    run_id: state.run_id || "unknown",
    status: state.status,
    goal: compactRecord({
      repo: state.request.repo || nonEmptyString(fullState.repo),
      branch: state.request.branch || nonEmptyString(fullState.branch),
      change_request: state.request.change_request || nonEmptyString(fullState.change_request),
      verification_mode: state.request.verification_mode || nonEmptyString(fullState.verification_mode),
      success_criteria: state.request.success_criteria,
    }) as RiddleProofRunCard["goal"],
    durable_state: compactRecord({
      ...statePaths,
      worktree_path: state.worktree_path || nonEmptyString(fullState.after_worktree) || null,
      branch: state.branch || nonEmptyString(fullState.branch) || null,
    }),
    current_phase: compactRecord({
      stage: state.current_stage ?? null,
      checkpoint: state.last_checkpoint ?? packet?.checkpoint ?? null,
      latest_event: latestEvent?.kind ?? null,
      elapsed_ms: elapsedMs(state.created_at, at),
      stage_elapsed_ms: elapsedMs(state.stage_started_at, at),
      iterations: state.iterations,
    }),
    owner_next_action: compactRecord({
      owner: ownerFor(state),
      action: actionFor(state),
      checkpoint_kind: packet?.kind || null,
      allowed_decisions: packet?.allowed_decisions,
      retryable: state.status === "running" || state.status === "awaiting_checkpoint",
      reason: state.blocker?.code || packet?.summary || latestEvent?.summary || null,
    }),
    evidence_contract: compactRecord({
      verification_mode: state.request.verification_mode || nonEmptyString(fullState.verification_mode),
      required,
      artifact_contract: artifactContract,
      proof_plan: compactText(state.proof_contract?.proof_plan || fullState.proof_plan, 600),
      stop_condition: compactText(state.proof_contract?.stop_condition, 400),
    }) as RiddleProofRunCard["evidence_contract"],
    latest_evidence: compactRecord({
      before_url: nonEmptyString(fullState.before_cdn) || state.before_artifact_url || null,
      prod_url: nonEmptyString(fullState.prod_cdn) || state.prod_artifact_url || null,
      after_url: nonEmptyString(fullState.after_cdn) || state.after_artifact_url || null,
      visual_delta: visualDelta || null,
      evidence_issue_code: evidenceIssueCode({ fullRiddleState: fullState, runState: state }) || null,
      proof_evidence_present: fullState.proof_evidence_present === true || Boolean(bundle?.proof_evidence || bundle?.proof_evidence_sample),
      artifacts,
    }),
    stop_condition: compactRecord({
      status: state.status,
      terminal: isTerminalStatus(state.status),
      blocker_code: state.blocker?.code || null,
      blocker_message: state.blocker?.message || null,
      proof_decision: state.proof_decision,
      merge_recommendation: state.merge_recommendation,
      monitor_should_continue: !isTerminalStatus(state.status),
    }) as RiddleProofRunCard["stop_condition"],
    updated_at: state.updated_at,
  };
}
