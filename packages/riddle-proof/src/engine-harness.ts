import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  applyTerminalMetadata,
  compactRecord,
  createRunResult,
  nonEmptyString,
  normalizeTerminalMetadata,
  recordValue,
} from "./result";
import {
  appendRunEvent,
  appendStageHeartbeat,
  createRunState,
  createRunStatusSnapshot,
  normalizeRunParams,
  setRunStatus,
} from "./state";
import { createRiddleProofRunCard } from "./run-card";
import {
  authorPacketPayloadFromCheckpointResponse,
  buildCheckpointPacketForEngineResult,
  checkpointResponseIdentity,
  checkpointSummaryFromState,
  isDuplicateCheckpointResponse,
  normalizeCheckpointResponse,
  proofContractFromAuthorCheckpointResponse,
  statePathsForRunState,
} from "./checkpoint";
import type {
  RiddleProofBlocker,
  RiddleProofCheckpointResponse,
  RiddleProofCheckpointVisibility,
  RiddleProofRunParams,
  RiddleProofRunResult,
  RiddleProofRunState,
  RiddleProofRunStatusSnapshot,
  RiddleProofStage,
  RiddleProofStatus,
} from "./types";
import {
  canonicalProofAssessmentStageForDecision,
  noImplementationModeFor,
  normalizeProofAssessmentStageFields,
  proofAssessmentHardBlockersForState,
  visualDeltaForState,
  visualDeltaRequiredForState,
  visualDeltaShipGateReason,
} from "./proof-run-core";

export type RiddleProofShipMode = "none" | "ship";
export type RiddleProofCheckpointMode = "auto" | "yield";

export interface RiddleProofWorkflowParams extends Record<string, unknown> {
  action: string;
  state_path?: string;
  leave_draft?: boolean;
  cleanup_merged_pr?: boolean;
  fetch_base?: boolean;
  update_base_checkout?: boolean;
}

export interface RiddleProofEngineResult extends Record<string, unknown> {
  ok?: boolean;
  state_path?: string;
  checkpoint?: string | null;
  checkpointContract?: Record<string, unknown> | null;
  decisionRequest?: Record<string, unknown> | null;
  state?: Record<string, unknown> | null;
  summary?: string;
  shipGate?: Record<string, unknown> | null;
}

export interface RiddleProofEngine {
  execute(params: RiddleProofWorkflowParams): Promise<RiddleProofEngineResult>;
}

export interface RiddleProofEngineHarnessConfig {
  riddleProofDir?: string;
  defaultReviewer?: string;
  riddleEngineModuleUrl?: string;
  stateDir?: string;
  defaultMaxIterations?: number;
  defaultShipMode?: RiddleProofShipMode;
}

export interface RiddleProofAgentPayload {
  ok?: boolean;
  payload?: Record<string, unknown>;
  summary?: string;
  blocker?: RiddleProofBlocker;
  diffDetected?: boolean;
  changedFiles?: string[];
  testsRun?: string[];
  implementationNotes?: string;
  details?: Record<string, unknown>;
}

export interface RiddleProofEngineHarnessContext {
  request: RiddleProofRunParams;
  state: RiddleProofRunState;
  engineResult: RiddleProofEngineResult;
  fullRiddleState: Record<string, unknown> | null;
  checkpoint: string;
}

export interface RiddleProofAgentAdapter {
  assessRecon(context: RiddleProofEngineHarnessContext): Promise<RiddleProofAgentPayload>;
  authorProofPacket(context: RiddleProofEngineHarnessContext): Promise<RiddleProofAgentPayload>;
  implementChange(
    context: RiddleProofEngineHarnessContext & { workdir?: string | null },
  ): Promise<RiddleProofAgentPayload>;
  assessProof(context: RiddleProofEngineHarnessContext): Promise<RiddleProofAgentPayload>;
}

export interface RunRiddleProofEngineHarnessInput {
  request: RiddleProofRunParams;
  engine?: RiddleProofEngine | (() => Promise<RiddleProofEngine>);
  agent?: RiddleProofAgentAdapter;
  config?: RiddleProofEngineHarnessConfig;
  state?: RiddleProofRunState;
  state_path?: string;
  resume_params?: RiddleProofWorkflowParams;
  checkpoint_mode?: RiddleProofCheckpointMode;
  checkpoint_visibility?: RiddleProofCheckpointVisibility;
  checkpoint_response?: RiddleProofCheckpointResponse | Record<string, unknown>;
  max_iterations?: number;
  dry_run?: boolean;
  auto_approve?: boolean;
}

const DEFAULT_MAX_ITERATIONS = 12;
const DEFAULT_STAGE_ITERATION_LIMITS: Partial<Record<RiddleProofStage, number>> = {
  setup: 2,
  recon: 4,
  author: 3,
  implement: 3,
  prove: 3,
  verify: 4,
  ship: 2,
  notify: 2,
};

interface RouteResult {
  next?: RiddleProofWorkflowParams;
  terminal?: RiddleProofRunResult;
  blocker?: RiddleProofBlocker;
}

function timestamp() {
  return new Date().toISOString();
}

function createHarnessStatePath(stateDir: string) {
  const stamp = timestamp().replace(/\D/g, "").slice(0, 14) || "unknown";
  return path.join(stateDir, `riddle-proof-run-${stamp}-${crypto.randomUUID().slice(0, 8)}.json`);
}

function createEngineStatePath(state: RiddleProofRunState, config?: RiddleProofEngineHarnessConfig) {
  const existing = nonEmptyString(state.request.engine_state_path);
  if (existing) return existing;

  const harnessStatePath = nonEmptyString(state.state_path);
  if (harnessStatePath) {
    const dir = path.dirname(harnessStatePath);
    const base = path.basename(harnessStatePath);
    if (base.startsWith("riddle-proof-run-")) {
      return path.join(dir, base.replace("riddle-proof-run-", "riddle-proof-state-"));
    }
    return path.join(dir, `${base}.engine-state.json`);
  }

  const stateDir = config?.stateDir || "/tmp";
  const stamp = timestamp().replace(/\D/g, "").slice(0, 14) || "unknown";
  return path.join(stateDir, `riddle-proof-state-${stamp}-${crypto.randomUUID().slice(0, 8)}.json`);
}

function ensureParent(filePath: string) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath?: string | null): Record<string, unknown> | null {
  if (!filePath || !existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function writeJson(filePath: string, payload: unknown) {
  ensureParent(filePath);
  writeFileSync(filePath, JSON.stringify(payload, null, 2) + "\n");
}

function loadRunState(input: RunRiddleProofEngineHarnessInput): RiddleProofRunState {
  if (input.state) return input.state;

  const stateDir = input.config?.stateDir || "/tmp";
  const statePath = input.state_path || input.request.harness_state_path || createHarnessStatePath(stateDir);
  const existing = readJson(statePath);
  if (
    existing?.version === "riddle-proof.run-state.v1" &&
    Array.isArray(existing.events) &&
    existing.request
  ) {
    return existing as unknown as RiddleProofRunState;
  }

  return createRunState({
    request: input.request,
    state_path: statePath,
  });
}

function isProtectedFinalStatus(status: unknown) {
  return status === "ready_to_ship" || status === "shipped" || status === "completed";
}

function shouldPreserveFinalizedRunState(filePath: string, incoming: RiddleProofRunState) {
  const existing = readJson(filePath) as (Partial<RiddleProofRunState> & Record<string, unknown>) | null;
  if (!existing?.finalized || !isProtectedFinalStatus(existing.status)) return false;
  if (!incoming.finalized) return true;
  if (existing.status === incoming.status) return false;
  return !(existing.status === "ready_to_ship" && incoming.status === "shipped");
}

function persist(state: RiddleProofRunState) {
  state.state_paths = statePathsForRunState(state);
  state.checkpoint_summary = checkpointSummaryFromState(state);
  state.run_card = createRiddleProofRunCard(state, {
    fullRiddleState: readJson(state.request.engine_state_path),
    state_paths: state.state_paths,
  });
  if (!state.state_path) return;
  if (shouldPreserveFinalizedRunState(state.state_path, state)) return;
  writeJson(state.state_path, state);
}

function recordEvent(state: RiddleProofRunState, event: Parameters<typeof appendRunEvent>[1]) {
  appendRunEvent(state, event);
  persist(state);
}

function heartbeat(
  state: RiddleProofRunState,
  input: Parameters<typeof appendStageHeartbeat>[1],
) {
  appendStageHeartbeat(state, input);
  persist(state);
}

function jsonParam(payload: Record<string, unknown>) {
  return JSON.stringify(payload);
}

function redactedWorkflowParams(params: RiddleProofWorkflowParams) {
  const secretKeys = new Set([
    "auth_localStorage_json",
    "auth_cookies_json",
    "auth_headers_json",
  ]);
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    output[key] = secretKeys.has(key) && value ? "[redacted]" : value;
  }
  return output;
}

function engineStatePath(result: RiddleProofEngineResult, state: RiddleProofRunState) {
  return nonEmptyString(result.state_path) || nonEmptyString(state.request.engine_state_path);
}

function fullRiddleState(result: RiddleProofEngineResult, state: RiddleProofRunState) {
  return readJson(engineStatePath(result, state)) || recordValue(result.state) || null;
}

function workdirFromState(state: Record<string, unknown> | null) {
  return nonEmptyString(state?.after_worktree) || nonEmptyString(state?.worktree_path) || null;
}

function parseGitStatusPaths(status: string) {
  return status.split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      let item = line.length > 3 ? line.slice(3) : line;
      if (item.includes(" -> ")) item = item.split(" -> ").pop() || item;
      return item.trim();
    })
    .filter(Boolean);
}

function isToolNoisePath(filePath: string) {
  return filePath === ".codex" ||
    filePath.startsWith(".codex/") ||
    filePath === ".oc-smoke" ||
    filePath.startsWith(".oc-smoke/");
}

function hasGitDiff(workdir?: string | null) {
  if (!workdir || !existsSync(workdir)) return false;
  try {
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: workdir,
      encoding: "utf-8",
      timeout: 10_000,
    });
    return parseGitStatusPaths(status).some((filePath) => !isToolNoisePath(filePath));
  } catch {
    return false;
  }
}

function removeEmptyToolArtifacts(workdir?: string | null) {
  if (!workdir || !existsSync(workdir)) return [];
  const artifactPath = path.join(workdir, ".codex");
  if (!existsSync(artifactPath)) return [];
  try {
    const status = execFileSync("git", ["status", "--porcelain", "--", ".codex"], {
      cwd: workdir,
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();
    const stat = statSync(artifactPath);
    if (status.startsWith("?? ") && stat.isFile() && stat.size === 0) {
      unlinkSync(artifactPath);
      return [".codex"];
    }
  } catch {
    return [];
  }
  return [];
}

function stageFromCheckpoint(result: RiddleProofEngineResult): RiddleProofStage {
  const explicitStage = nonEmptyString(result.stage);
  if (explicitStage) return explicitStage as RiddleProofStage;

  const checkpoint = String(result.checkpoint || "");
  if (checkpoint.startsWith("recon_")) return "recon";
  if (checkpoint.startsWith("author_")) return "author";
  if (checkpoint.startsWith("implement_")) return "implement";
  if (checkpoint.startsWith("verify_")) return "verify";
  if (checkpoint.startsWith("ship_")) return "ship";
  if (checkpoint.startsWith("pr_sync_")) return "notify";
  if (checkpoint.includes("capture")) return "prove";
  return "setup";
}

function stageFromWorkflowParams(params: RiddleProofWorkflowParams): RiddleProofStage {
  if (params.action === "sync") return "notify";
  const stage = nonEmptyString(params.advance_stage);
  if (stage) return stage as RiddleProofStage;
  if (params.ship_after_verify) return "ship";
  if (params.proof_assessment_json) return "verify";
  if (params.implementation_notes) return "verify";
  if (params.author_packet_json) return noImplementationModeFor(params) ? "verify" : "implement";
  if (params.recon_assessment_json) return "author";
  return "setup";
}

function baseContinuation(result: RiddleProofEngineResult): RiddleProofWorkflowParams {
  return {
    action: "run",
    state_path: String(result.state_path || ""),
    continue_from_checkpoint: true,
  };
}

function carryRequestControlFlags(
  params: RiddleProofWorkflowParams,
  request: RiddleProofRunParams,
): RiddleProofWorkflowParams {
  if (!noImplementationModeFor(request)) return params;
  return compactRecord({
    ...params,
    mode: request.mode,
    implementation_mode: request.implementation_mode || "none",
    require_diff: request.require_diff ?? false,
    allow_code_changes: request.allow_code_changes ?? false,
  }) as RiddleProofWorkflowParams;
}

function initialRunParams(
  request: RiddleProofRunParams,
  input: RunRiddleProofEngineHarnessInput,
  state: RiddleProofRunState,
): RiddleProofWorkflowParams {
  return compactRecord({
    action: "run",
    repo: request.repo,
    branch: request.branch,
    change_request: request.change_request,
    commit_message: request.commit_message,
    prod_url: request.prod_url,
    capture_script: request.capture_script,
    success_criteria: request.success_criteria,
    assertions_json:
      typeof request.assertions === "string" ? request.assertions :
        request.assertions === undefined ? undefined : JSON.stringify(request.assertions),
    verification_mode: request.verification_mode,
    reference: request.reference,
    base_branch: request.base_branch,
    before_ref: request.before_ref,
    allow_static_preview_fallback: request.allow_static_preview_fallback,
    context: request.context,
    reviewer: request.reviewer,
    mode: request.mode,
    implementation_mode: request.implementation_mode,
    require_diff: request.require_diff,
    allow_code_changes: request.allow_code_changes,
    build_command: request.build_command,
    build_output: request.build_output,
    server_image: request.server_image,
    server_command: request.server_command,
    server_port: request.server_port,
    server_path: request.server_path,
    use_auth: request.use_auth,
    auth_localStorage_json: request.auth_localStorage_json,
    auth_cookies_json: request.auth_cookies_json,
    auth_headers_json: request.auth_headers_json,
    color_scheme: request.color_scheme,
    wait_for_selector: request.wait_for_selector,
    ship_mode: request.ship_mode,
    leave_draft: request.leave_draft || undefined,
    discord_channel: request.integration_context?.channel_id,
    discord_thread_id: request.integration_context?.thread_id,
    discord_message_id: request.integration_context?.message_id,
    discord_source_url: request.integration_context?.source_url,
    state_path: request.engine_state_path || state.request.engine_state_path,
    auto_approve: input.auto_approve ?? request.auto_approve,
  }) as RiddleProofWorkflowParams;
}

function effectiveShipMode(
  request: RiddleProofRunParams,
  config?: RiddleProofEngineHarnessConfig,
): RiddleProofShipMode {
  return request.ship_mode || config?.defaultShipMode || "ship";
}

function continuationRequestsShip(next: RiddleProofWorkflowParams | null | undefined) {
  return Boolean(next && (next.advance_stage === "ship" || next.ship_after_verify === true));
}

function shipHeldTerminal(
  state: RiddleProofRunState,
  result: RiddleProofEngineResult,
): RiddleProofRunResult {
  return terminalResult(
    state,
    "ready_to_ship",
    result,
    result.summary || "Riddle Proof evidence is approved, but ship_mode=none is holding before PR/ship.",
    { ship_held: true },
  );
}

function checkpointContinueStage(result: RiddleProofEngineResult) {
  const resume = recordValue(result.checkpointContract?.resume);
  return nonEmptyString(resume?.continue_with_stage);
}

function checkpointRecommendedStage(result: RiddleProofEngineResult) {
  const resumeStage = checkpointContinueStage(result);
  if (resumeStage) return resumeStage;
  return (
    nonEmptyString(result.checkpointContract?.recommended_advance_stage) ||
    nonEmptyString(result.decisionRequest?.continue_with_stage) ||
    nonEmptyString(result.decisionRequest?.recommended_advance_stage) ||
    nonEmptyString(recordValue(result.decisionRequest)?.continueWithStage) ||
    nonEmptyString(recordValue(result.decisionRequest)?.recommendedAdvanceStage)
  );
}

function stageCheckpointContinuation(result: RiddleProofEngineResult): RiddleProofWorkflowParams | null {
  const stage = checkpointRecommendedStage(result);
  if (!stage) return null;
  return {
    action: "run",
    state_path: String(result.state_path || ""),
    advance_stage: stage,
  };
}

function recommendedContinuation(result: RiddleProofEngineResult): RiddleProofWorkflowParams | null {
  const continueStage = checkpointContinueStage(result);
  if (!continueStage) return null;
  return {
    action: "run",
    state_path: String(result.state_path || ""),
    advance_stage: continueStage,
  };
}

function defaultAwaitingStageContinuation(result: RiddleProofEngineResult): RiddleProofWorkflowParams | null {
  const contract = recordValue(result.checkpointContract) || {};
  const stage = nonEmptyString(contract.stage) || nonEmptyString(result.stage) || "";
  const nextStage =
    stage === "setup" ? "recon" :
      stage === "recon" ? "author" :
        stage === "author" ? "implement" :
          stage === "implement" || stage === "verify" ? "verify" :
            "";
  if (!nextStage) return null;
  return {
    action: "run",
    state_path: String(result.state_path || ""),
    advance_stage: nextStage,
  };
}

function isReadyShipGate(result: RiddleProofEngineResult) {
  const gate = recordValue(result.shipGate) || recordValue(result.checkpointContract?.ship_gate);
  return Boolean(gate && gate.ok === true);
}

function proofAssessmentRequestsShip(payload: Record<string, unknown>) {
  return String(payload.decision || "").trim() === "ready_to_ship";
}

const TRUSTED_PROOF_ASSESSMENT_READY_SOURCES = new Set([
  "supervising_agent",
  "supervisor",
  "openclaw_auto_ship_mode_none",
]);

function proofAssessmentSourceTrustedForShip(payload: Record<string, unknown>) {
  const source = nonEmptyString(payload.source)?.toLowerCase();
  if (!source) return true;
  return TRUSTED_PROOF_ASSESSMENT_READY_SOURCES.has(source);
}

function proofAssessmentSourceBlocker(input: {
  checkpoint?: string | null;
  stage?: RiddleProofStage | string | null;
  payload: Record<string, unknown>;
  response?: RiddleProofCheckpointResponse | null;
  code?: string;
}): RiddleProofBlocker | null {
  if (!proofAssessmentRequestsShip(input.payload)) return null;
  if (proofAssessmentSourceTrustedForShip(input.payload)) return null;
  const source = nonEmptyString(input.payload.source) || "unknown";
  return {
    code: input.code || "proof_assessment_source_not_trusted",
    checkpoint: input.checkpoint || null,
    message: `Riddle Proof cannot mark ready_to_ship from untrusted proof assessment source: ${source}.`,
    details: compactRecord({
      stage: input.stage || null,
      proofAssessment: input.payload,
      checkpoint_response_source: input.response?.source || null,
      response: input.response || null,
    }) as Record<string, unknown>,
  };
}

function proofAssessmentHardBlockers(state: Record<string, unknown> | null, payload: Record<string, unknown>) {
  const blockers = proofAssessmentHardBlockersForState(state || {});
  if (Array.isArray(payload.hard_blockers)) {
    for (const blocker of payload.hard_blockers) {
      if (typeof blocker !== "string") continue;
      const trimmed = blocker.trim();
      if (trimmed && !blockers.includes(trimmed)) blockers.push(trimmed);
    }
  }
  return blockers;
}

function proofAssessmentContinuation(
  result: RiddleProofEngineResult,
  payload: Record<string, unknown>,
): RiddleProofWorkflowParams {
  const proof_assessment_json = jsonParam(payload);
  return { ...baseContinuation(result), proof_assessment_json };
}

function defaultStageForProofCheckpointDecision(decision: string): RiddleProofStage | null {
  return canonicalProofAssessmentStageForDecision(decision) as RiddleProofStage | null;
}

function checkpointContractFromPacket(packet: NonNullable<RiddleProofRunState["checkpoint_packet"]>) {
  return (
    recordValue(packet.evidence_excerpt?.checkpoint_contract) ||
    recordValue(recordValue(packet.state_excerpt?.stage_decision_request)?.checkpoint_contract) ||
    null
  );
}

function stageFromCheckpointResponse(
  response: RiddleProofCheckpointResponse,
  packet: NonNullable<RiddleProofRunState["checkpoint_packet"]>,
): RiddleProofStage | null {
  if (response.decision === "needs_recon") return "recon";
  if (response.decision === "needs_implementation") return "implement";
  const payload = recordValue(response.payload) || {};
  const contract = checkpointContractFromPacket(packet);
  const resume = recordValue(contract?.resume);
  const stage =
    response.continue_with_stage ||
    nonEmptyString(payload.continue_with_stage) ||
    nonEmptyString(payload.recommended_stage) ||
    nonEmptyString(resume?.continue_with_stage) ||
    (response.decision === "retry_stage" ? packet.stage : "");
  return stage ? (stage as RiddleProofStage) : null;
}

function proofAssessmentSourceFromCheckpointResponse(response: RiddleProofCheckpointResponse) {
  const kind = nonEmptyString(response.source?.kind)?.toLowerCase();
  if (!kind) return "supervising_agent";
  if (kind === "human") return "supervisor";
  if (kind === "codex" || kind === "openclaw-main" || kind === "claude-code") {
    return "supervising_agent";
  }
  return `checkpoint_response:${kind}`;
}

function proofAssessmentPayloadFromCheckpointResponse(
  response: RiddleProofCheckpointResponse,
): Record<string, unknown> | null {
  if (
    ![
      "ready_to_ship",
      "needs_richer_proof",
      "revise_capture",
      "needs_recon",
      "needs_implementation",
    ].includes(response.decision)
  ) {
    return null;
  }
  const payload = recordValue(response.payload) || {};
  const stage =
    nonEmptyString(payload.continue_with_stage) ||
    response.continue_with_stage ||
    nonEmptyString(payload.recommended_stage) ||
    defaultStageForProofCheckpointDecision(response.decision);
  return normalizeProofAssessmentStageFields(compactRecord({
    ...payload,
    decision: response.decision,
    summary: response.summary,
    recommended_stage: nonEmptyString(payload.recommended_stage) || stage || undefined,
    continue_with_stage: stage || undefined,
    escalation_target: nonEmptyString(payload.escalation_target) || "agent",
    reasons: Array.isArray(response.reasons)
      ? response.reasons
      : Array.isArray(payload.reasons)
        ? payload.reasons
        : [],
    source: proofAssessmentSourceFromCheckpointResponse(response),
    checkpoint_response_source: response.source || null,
    checkpoint_response_created_at: response.created_at,
  }) as Record<string, unknown>);
}

function reconAssessmentPayloadFromCheckpointResponse(
  response: RiddleProofCheckpointResponse,
): Record<string, unknown> | null {
  if (![
    "ready_for_author",
    "retry_recon",
    "recon_stuck",
    "needs_recon",
  ].includes(response.decision)) {
    return null;
  }
  const payload = recordValue(response.payload) || {};
  const decision = response.decision === "needs_recon" ? "retry_recon" : response.decision;
  const continueStage =
    response.continue_with_stage ||
    nonEmptyString(payload.continue_with_stage) ||
    (decision === "ready_for_author" ? "author" : "recon");
  return compactRecord({
    ...payload,
    decision,
    summary: response.summary,
    continue_with_stage: continueStage,
    escalation_target:
      nonEmptyString(payload.escalation_target) ||
      (decision === "recon_stuck" ? "human" : "agent"),
    reasons: Array.isArray(response.reasons)
      ? response.reasons
      : Array.isArray(payload.reasons)
        ? payload.reasons
        : [],
    source: "supervising_agent",
    checkpoint_response_source: response.source || null,
    checkpoint_response_created_at: response.created_at,
  }) as Record<string, unknown>;
}

function implementationNotesFromCheckpointResponse(response: RiddleProofCheckpointResponse) {
  const payload = recordValue(response.payload) || {};
  const notes =
    nonEmptyString(payload.implementation_notes) ||
    nonEmptyString(payload.implementationNotes) ||
    nonEmptyString(payload.summary) ||
    response.summary;
  const changedFiles = Array.isArray(payload.changed_files) ? payload.changed_files.filter((item) => typeof item === "string") : [];
  const testsRun = Array.isArray(payload.tests_run) ? payload.tests_run.filter((item) => typeof item === "string") : [];
  return [
    notes,
    changedFiles.length ? `changed_files=${changedFiles.join(", ")}` : "",
    testsRun.length ? `tests_run=${testsRun.join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

function proofAssessmentVisualBlocker(
  state: Record<string, unknown> | null,
  payload: Record<string, unknown>,
) {
  if (!proofAssessmentRequestsShip(payload)) return null;
  const source = nonEmptyString(payload.source) || "supervising_agent";
  return visualDeltaShipGateReason({
    ...(state || {}),
    proof_assessment: { ...payload, source },
    proof_assessment_source: source,
  });
}

function visualDeltaBlockerCode(state: Record<string, unknown> | null, blocker: string) {
  const visualDelta = visualDeltaForState(state || {});
  const status = nonEmptyString(visualDelta.status);
  const reason = `${nonEmptyString(visualDelta.reason) || ""}\n${blocker}`.toLowerCase();
  if (status === "unmeasured") {
    if (
      reason.includes("fetch") ||
      reason.includes("allowlist") ||
      reason.includes("registered domain") ||
      reason.includes("high risk") ||
      reason.includes("comparator")
    ) {
      return "comparator_fetch_blocked";
    }
    return "visual_delta_unmeasured";
  }
  if (status === "measured" && visualDelta.passed === false) return "semantic_proof_failed";
  if (visualDeltaRequiredForState(state || {})) return "visual_delta_unmeasured";
  return "semantic_proof_failed";
}

function visualDeltaEvidenceRecoveryAssessment(
  state: Record<string, unknown> | null,
  payload: Record<string, unknown>,
  blocker: string,
) {
  const visualDelta = visualDeltaForState(state || {});
  const blockers = Array.isArray(payload.blockers) ? payload.blockers.filter((item) => typeof item === "string") : [];
  return {
    ...payload,
    blocked_decision: payload.decision || "ready_to_ship",
    decision: "revise_capture",
    recommended_stage: "verify",
    continue_with_stage: "verify",
    evidence_collection_incomplete: true,
    recovery_stage: "verify",
    recovery_reason: blocker,
    evidence_issue_code: visualDeltaBlockerCode(state, blocker),
    visual_delta: Object.keys(visualDelta).length ? visualDelta : null,
    suggested_repair:
      "Keep the same Riddle Proof run in evidence/comparison recovery: repair or retry the visual comparator/fetch path, wait for artifact readiness if applicable, or produce a measured visual_delta artifact before proof review can mark ready_to_ship.",
    blockers: [...blockers, blocker],
  };
}

function isRecoverableStageCheckpoint(checkpoint: string) {
  return [
    "ship_gate_blocked",
    "verify_required",
    "verify_supervisor_judgment_required",
  ].includes(checkpoint);
}

function contextFor(
  request: RiddleProofRunParams,
  state: RiddleProofRunState,
  result: RiddleProofEngineResult,
): RiddleProofEngineHarnessContext {
  return {
    request,
    state,
    engineResult: result,
    fullRiddleState: fullRiddleState(result, state),
    checkpoint: String(result.checkpoint || "unknown"),
  };
}

function requirePayload(
  action: string,
  payload: RiddleProofAgentPayload,
  state: RiddleProofRunState,
  result: RiddleProofEngineResult,
): RiddleProofBlocker | null {
  if (payload.blocker || payload.ok === false) {
    return payload.blocker || {
      code: `${action}_blocked`,
      checkpoint: result.checkpoint || null,
      message: payload.summary || `${action} did not return a usable payload.`,
    };
  }
  if (!payload.payload || typeof payload.payload !== "object") {
    return {
      code: `${action}_missing_payload`,
      checkpoint: result.checkpoint || null,
      message: `${action} did not return the JSON payload required by the riddle-proof checkpoint.`,
      details: {
        run_id: state.run_id,
        state_path: state.state_path,
      },
    };
  }
  return null;
}

function engineFailureBlocker(result: RiddleProofEngineResult, checkpoint: string): RiddleProofBlocker | null {
  if (result.ok !== false) return null;
  if (!checkpoint.endsWith("_failed") && !checkpoint.endsWith("_blocked")) return null;
  return {
    code: checkpoint,
    checkpoint,
    message: result.summary || `Riddle Proof engine stopped at ${checkpoint}.`,
    details: compactRecord({
      error: result.error,
      approval: result.approval,
      checkpointContract: result.checkpointContract || null,
    }),
  };
}

function terminalResult(
  state: RiddleProofRunState,
  status: RiddleProofStatus,
  result: RiddleProofEngineResult | null,
  summary: string,
  raw: Record<string, unknown> = {},
): RiddleProofRunResult {
  if (result) {
    const terminalStage = stageFromCheckpoint(result);
    if (terminalStage !== "setup") state.current_stage = terminalStage;
  }
  setRunStatus(state, status);
  if (isProtectedFinalStatus(status)) state.finalized = true;
  const metadata = normalizeTerminalMetadata({
    riddleState: result ? fullRiddleState(result, state) : null,
    engineResult: result,
  });
  applyTerminalMetadata(state, metadata);
  persist(state);
  return createRunResult({
    state,
    status,
    last_summary: summary,
    metadata,
    raw: {
      engine_state_path: result?.state_path || state.request.engine_state_path || null,
      last_result: result,
      ...raw,
    },
  });
}

function blockerResult(
  state: RiddleProofRunState,
  result: RiddleProofEngineResult | null,
  blocker: RiddleProofBlocker,
): RiddleProofRunResult {
  state.blocker = blocker;
  const blockerStage = nonEmptyString(recordValue(blocker.details)?.stage) as RiddleProofStage | undefined;
  const stage = blockerStage || stageFromCheckpoint(result || { checkpoint: blocker.checkpoint || undefined });
  recordEvent(state, {
    kind: "run.blocked",
    checkpoint: blocker.checkpoint || result?.checkpoint || null,
    stage,
    summary: blocker.message,
    details: {
      code: blocker.code,
      ...blocker.details,
    },
  });
  setRunStatus(state, "blocked");
  persist(state);
  return createRunResult({
    state,
    status: "blocked",
    last_summary: blocker.message,
    raw: {
      engine_state_path: result?.state_path || state.request.engine_state_path || null,
      last_result: result,
    },
  });
}

function checkpointAwaitingResult(
  state: RiddleProofRunState,
  result: RiddleProofEngineResult,
  visibility: RiddleProofCheckpointVisibility | undefined,
): RiddleProofRunResult {
  const packet = buildCheckpointPacketForEngineResult({
    request: state.request,
    runState: state,
    engineResult: result,
    fullRiddleState: fullRiddleState(result, state),
    visibility,
  });
  const at = timestamp();
  state.checkpoint_packet = packet;
  state.checkpoint_history = [
    ...(state.checkpoint_history || []),
    { ts: at, packet },
  ].slice(-25);
  appendRunEvent(state, {
    ts: at,
    kind: "checkpoint.packet.created",
    checkpoint: packet.checkpoint,
    stage: packet.stage,
    summary: packet.summary,
    details: compactRecord({
      kind: packet.kind,
      routing_hint: packet.routing_hint,
      resume_token: packet.resume_token,
    }) as Record<string, unknown>,
  });
  setRunStatus(state, "awaiting_checkpoint", at);
  persist(state);
  return createRunResult({
    state,
    status: "awaiting_checkpoint",
    last_summary: packet.summary,
    raw: {
      engine_state_path: result.state_path || state.request.engine_state_path || null,
      last_result: result,
      checkpoint_packet: packet,
    },
  });
}

function appendCheckpointResponse(
  state: RiddleProofRunState,
  response: RiddleProofCheckpointResponse,
  input: {
    clear_packet?: boolean;
    summary?: string;
  } = {},
) {
  const at = timestamp();
  state.checkpoint_history = [
    ...(state.checkpoint_history || []),
    { ts: at, response },
  ].slice(-25);
  if (input.clear_packet !== false) {
    state.checkpoint_packet = undefined;
  }
  appendRunEvent(state, {
    ts: at,
    kind: "checkpoint.response.accepted",
    checkpoint: response.checkpoint,
    stage: state.current_stage || "author",
    summary: input.summary || response.summary,
    details: compactRecord({
      decision: response.decision,
      resume_token: response.resume_token,
      source: response.source,
    }) as Record<string, unknown>,
  });
  setRunStatus(state, "running", at);
  persist(state);
}

function checkpointResponseContinuation(
  state: RiddleProofRunState,
  value?: RiddleProofCheckpointResponse | Record<string, unknown>,
): { next?: RiddleProofWorkflowParams; terminal?: RiddleProofRunResult; blocker?: RiddleProofBlocker } {
  if (!value) return {};
  const packet = state.checkpoint_packet;
  const response = normalizeCheckpointResponse(value);
  if (!response) {
    return {
      blocker: {
        code: "checkpoint_response_invalid",
        checkpoint: packet?.checkpoint || state.last_checkpoint || null,
        message: "Checkpoint response was not a valid riddle-proof.checkpoint_response.v1 object.",
        details: { checkpoint_packet: packet || null, checkpoint_summary: checkpointSummaryFromState(state) },
      },
    };
  }
  if (isDuplicateCheckpointResponse(state, response)) {
    const stage = packet?.stage || state.current_stage || "author";
    recordEvent(state, {
      kind: "checkpoint.response.duplicate",
      checkpoint: response.checkpoint,
      stage,
      summary: "Duplicate checkpoint response ignored.",
      details: compactRecord({
        decision: response.decision,
        resume_token: response.resume_token,
        response_identity: checkpointResponseIdentity(response),
      }) as Record<string, unknown>,
    });
    return {
      blocker: {
        code: "checkpoint_response_duplicate",
        checkpoint: response.checkpoint,
        message: "Checkpoint response was already accepted for this run/checkpoint/resume token and was not applied again.",
        details: {
          stage,
          duplicate: true,
          response,
          response_identity: checkpointResponseIdentity(response),
          checkpoint_summary: checkpointSummaryFromState(state),
        },
      },
    };
  }
  if (!packet) {
    return {
      blocker: {
        code: "checkpoint_response_without_packet",
        checkpoint: response.checkpoint,
        message: "A checkpoint response was supplied, but the run state has no pending checkpoint packet.",
        details: { response, checkpoint_summary: checkpointSummaryFromState(state) },
      },
    };
  }
  if (response.run_id !== packet.run_id || response.checkpoint !== packet.checkpoint) {
    return {
      blocker: {
        code: "checkpoint_response_mismatch",
        checkpoint: packet.checkpoint,
        message: "Checkpoint response does not match the pending checkpoint packet.",
        details: {
          stage: packet.stage,
          expected: { run_id: packet.run_id, checkpoint: packet.checkpoint },
          actual: { run_id: response.run_id, checkpoint: response.checkpoint },
        },
      },
    };
  }
  if (packet.resume_token && response.resume_token !== packet.resume_token) {
    return {
      blocker: {
        code: "checkpoint_response_resume_token_mismatch",
        checkpoint: packet.checkpoint,
        message: "Checkpoint response resume_token does not match the pending checkpoint packet.",
        details: {
          stage: packet.stage,
          expected_resume_token: packet.resume_token,
          actual_resume_token: response.resume_token || null,
        },
      },
    };
  }
  if (packet.packet_id && response.packet_id !== packet.packet_id) {
    return {
      blocker: {
        code: "checkpoint_response_packet_id_mismatch",
        checkpoint: packet.checkpoint,
        message: "Checkpoint response packet_id does not match the pending checkpoint packet.",
        details: {
          stage: packet.stage,
          expected_packet_id: packet.packet_id,
          actual_packet_id: response.packet_id || null,
          expected_resume_token: packet.resume_token || null,
          actual_resume_token: response.resume_token || null,
        },
      },
    };
  }
  if (!packet.allowed_decisions.includes(response.decision)) {
    return {
      blocker: {
        code: "checkpoint_response_decision_not_allowed",
        checkpoint: packet.checkpoint,
        message: "Checkpoint response decision is not advertised by the pending checkpoint packet.",
        details: {
          stage: packet.stage,
          decision: response.decision,
          allowed_decisions: packet.allowed_decisions,
          response,
        },
      },
    };
  }

  const base = {
    action: "run",
    state_path: state.request.engine_state_path || packet.state_path || "",
    continue_from_checkpoint: true,
  };
  if (response.decision === "author_packet") {
    const payload = authorPacketPayloadFromCheckpointResponse(response);
    if (!payload) {
      return {
        blocker: {
          code: "checkpoint_author_packet_missing",
          checkpoint: packet.checkpoint,
          message: "Checkpoint response decision=author_packet did not include a proof_plan and capture_script payload.",
          details: { stage: packet.stage, response },
        },
      };
    }
    state.proof_contract = proofContractFromAuthorCheckpointResponse(response, packet, payload);
    appendCheckpointResponse(state, response);
    return { next: { ...base, advance_stage: "author", author_packet_json: jsonParam(payload) } };
  }

  if (packet.kind === "assess_recon" || packet.stage === "recon") {
    const assessment = reconAssessmentPayloadFromCheckpointResponse(response);
    if (assessment) {
      appendCheckpointResponse(state, response);
      return { next: { ...base, recon_assessment_json: jsonParam(assessment) } };
    }
    if (response.decision === "blocked" || response.decision === "human_review") {
      appendCheckpointResponse(state, response, { clear_packet: false });
      return {
        blocker: {
          code: `checkpoint_response_${response.decision}`,
          checkpoint: packet.checkpoint,
          message: response.summary || `Checkpoint response stopped recon with decision=${response.decision}.`,
          details: { stage: packet.stage, response },
        },
      };
    }
  }

  if (packet.kind === "implement_change" || packet.stage === "implement") {
    if (response.decision === "implementation_complete") {
      const workdir = nonEmptyString(packet.state_excerpt?.after_worktree) || state.worktree_path;
      if (workdir) state.worktree_path = workdir;
      if (!hasGitDiff(workdir)) {
        return {
          blocker: {
            code: "implementation_diff_missing",
            checkpoint: packet.checkpoint,
            message:
              "Checkpoint response claimed implementation_complete, but the after worktree has no detectable git diff.",
            details: { stage: packet.stage, worktree_path: workdir || null, response },
          },
        };
      }
      appendCheckpointResponse(state, response);
      return {
        next: {
          ...base,
          advance_stage: "implement",
          implementation_notes: implementationNotesFromCheckpointResponse(response),
        },
      };
    }
    if (response.decision === "needs_author") {
      appendCheckpointResponse(state, response);
      return { next: { ...base, advance_stage: "author" } };
    }
    if (response.decision === "needs_recon") {
      appendCheckpointResponse(state, response);
      return { next: { ...base, advance_stage: "recon" } };
    }
    if (response.decision === "blocked" || response.decision === "human_review") {
      appendCheckpointResponse(state, response, { clear_packet: false });
      return {
        blocker: {
          code: `checkpoint_response_${response.decision}`,
          checkpoint: packet.checkpoint,
          message: response.summary || `Checkpoint response stopped implementation with decision=${response.decision}.`,
          details: { stage: packet.stage, response },
        },
      };
    }
  }

  if (response.decision === "needs_recon") {
    appendCheckpointResponse(state, response);
    if (packet.kind === "assess_proof" || packet.kind === "recover_evidence" || packet.stage === "verify") {
      const assessment = proofAssessmentPayloadFromCheckpointResponse(response);
      if (assessment) return { next: { ...base, proof_assessment_json: jsonParam(assessment) } };
    }
    return { next: { ...base, advance_stage: "recon" } };
  }

  if (packet.kind === "assess_proof" || packet.kind === "recover_evidence" || packet.stage === "verify") {
    const assessment = proofAssessmentPayloadFromCheckpointResponse(response);
    if (assessment) {
      const sourceBlocker = proofAssessmentSourceBlocker({
        checkpoint: packet.checkpoint,
        stage: packet.stage,
        payload: assessment,
        response,
        code: "checkpoint_response_source_not_trusted",
      });
      if (sourceBlocker) return { blocker: sourceBlocker };
      appendCheckpointResponse(state, response);
      if (state.request.ship_mode !== "ship" && proofAssessmentRequestsShip(assessment)) {
        const result = {
          ok: true,
          state_path: state.request.engine_state_path || packet.state_path || "",
          checkpoint: packet.checkpoint,
          stage: packet.stage,
          summary: response.summary,
          checkpointContract: checkpointContractFromPacket(packet) || null,
        } as RiddleProofEngineResult;
        return {
          terminal: terminalResult(
            state,
            "ready_to_ship",
            result,
            response.summary || "Riddle Proof evidence is approved, but ship_mode=none is holding before PR/ship.",
            {
              ship_held: true,
              proof_assessment: assessment,
            },
          ),
        };
      }
      return { next: { ...base, proof_assessment_json: jsonParam(assessment) } };
    }
    if (response.decision === "blocked" || response.decision === "human_review") {
      appendCheckpointResponse(state, response, { clear_packet: false });
      return {
        blocker: {
          code: `checkpoint_response_${response.decision}`,
          checkpoint: packet.checkpoint,
          message: response.summary || `Checkpoint response stopped the run with decision=${response.decision}.`,
          details: { stage: packet.stage, response },
        },
      };
    }
  }

  if (response.decision === "continue_stage" || response.decision === "retry_stage" || response.decision === "needs_implementation") {
    const stage = stageFromCheckpointResponse(response, packet);
    if (stage) {
      appendCheckpointResponse(state, response);
      return {
        next: {
          ...base,
          advance_stage: stage,
        },
      };
    }
  }

  appendCheckpointResponse(state, response, { clear_packet: false });
  return {
    blocker: {
      code: `checkpoint_response_${response.decision}`,
      checkpoint: packet.checkpoint,
      message: response.summary || `Checkpoint response stopped the run with decision=${response.decision}.`,
      details: { stage: packet.stage, response },
    },
  };
}

function finalizedCheckpointResponseWithoutPacketResult(
  state: RiddleProofRunState,
  value?: RiddleProofCheckpointResponse | Record<string, unknown>,
): RiddleProofRunResult | null {
  if (!value || state.checkpoint_packet || !isProtectedFinalStatus(state.status)) return null;
  const response = normalizeCheckpointResponse(value);
  if (!response) return null;
  if (isDuplicateCheckpointResponse(state, response)) return null;

  const at = timestamp();
  appendRunEvent(state, {
    ts: at,
    kind: "checkpoint.response.ignored",
    checkpoint: response.checkpoint,
    stage: state.current_stage || "verify",
    summary: "Late checkpoint response ignored because the run is already finalized.",
    details: compactRecord({
      status: state.status,
      decision: response.decision,
      resume_token: response.resume_token,
      source: response.source,
    }) as Record<string, unknown>,
  });
  persist(state);

  return createRunResult({
    state,
    status: state.status,
    last_summary: "Late checkpoint response ignored because the run is already finalized.",
    raw: {
      ignored_checkpoint_response: true,
      response,
    },
  });
}

function disabledAdapterPayload(action: string, context: RiddleProofEngineHarnessContext): RiddleProofAgentPayload {
  return {
    ok: false,
    blocker: {
      code: "agent_adapter_not_configured",
      checkpoint: context.checkpoint,
      message:
        `No agent adapter is configured for ${action}. The engine harness reached the checkpoint safely and stopped before faking agent output.`,
      details: {
        run_id: context.state.run_id,
        state_path: context.state.state_path,
        engine_state_path: context.engineResult.state_path || null,
        checkpointContract: context.engineResult.checkpointContract || null,
      },
    },
  };
}

export function createDisabledRiddleProofAgentAdapter(): RiddleProofAgentAdapter {
  return {
    assessRecon: (context) => Promise.resolve(disabledAdapterPayload("recon assessment", context)),
    authorProofPacket: (context) => Promise.resolve(disabledAdapterPayload("proof packet authoring", context)),
    implementChange: (context) => Promise.resolve(disabledAdapterPayload("implementation", context)),
    assessProof: (context) => Promise.resolve(disabledAdapterPayload("proof assessment", context)),
  };
}

async function resolveEngine(input: RunRiddleProofEngineHarnessInput): Promise<RiddleProofEngine> {
  if (typeof input.engine === "function") return input.engine();
  if (input.engine) return input.engine;

  const moduleUrl = input.config?.riddleEngineModuleUrl;
  if (!moduleUrl) {
    const mod = await import("./proof-run-engine.js");
    return mod.createRiddleProofEngine({
      riddleProofDir: input.config?.riddleProofDir,
      defaultReviewer: input.config?.defaultReviewer,
    }) as RiddleProofEngine;
  }
  const mod = await import(moduleUrl);
  if (typeof mod.createRiddleProofEngine !== "function") {
    throw new Error(`Riddle engine module does not export createRiddleProofEngine: ${moduleUrl}`);
  }
  return mod.createRiddleProofEngine({
    riddleProofDir: input.config?.riddleProofDir,
    defaultReviewer: input.config?.defaultReviewer,
  }) as RiddleProofEngine;
}

async function handleImplementation(
  request: RiddleProofRunParams,
  state: RiddleProofRunState,
  result: RiddleProofEngineResult,
  agent: RiddleProofAgentAdapter,
): Promise<{ next?: RiddleProofWorkflowParams; blocker?: RiddleProofBlocker }> {
  const context = contextFor(request, state, result);
  const workdir = workdirFromState(context.fullRiddleState);
  state.worktree_path = workdir || state.worktree_path;
  state.branch = nonEmptyString(context.fullRiddleState?.branch) || state.branch;
  persist(state);

  if (!workdir || !existsSync(workdir)) {
    return {
      blocker: {
        code: "implementation_worktree_missing",
        checkpoint: result.checkpoint || null,
        message: "The Riddle Proof engine state does not include an isolated after worktree that exists on disk.",
        details: {
          worktree_path: workdir || null,
          engine_state_path: result.state_path || null,
        },
      },
    };
  }

  recordEvent(state, {
    kind: "agent.implementation.started",
    checkpoint: result.checkpoint || null,
    stage: "implement",
    summary: "Implementation agent started working in the after worktree.",
    details: {
      worktree_path: workdir || null,
    },
  });

  const implementationStartedAt = timestamp();
  const implementationStartedMs = Date.now();
  const implementation = await agent.implementChange({ ...context, workdir });
  const implementationDurationMs = Date.now() - implementationStartedMs;
  if (implementation.blocker || implementation.ok === false) {
    recordEvent(state, {
      kind: "agent.implementation.blocked",
      checkpoint: result.checkpoint || null,
      stage: "implement",
      summary: implementation.summary || implementation.blocker?.message || "Implementation adapter reported a blocker.",
      details: compactRecord({
        worktree_path: workdir || null,
        started_at: implementationStartedAt,
        duration_ms: implementationDurationMs,
        changed_files: implementation.changedFiles || [],
        tests_run: implementation.testsRun || [],
        implementation_notes: implementation.implementationNotes || null,
        blocker: implementation.blocker || null,
        adapter_details: implementation.details || null,
      }) as Record<string, unknown>,
    });
    return {
      blocker: implementation.blocker || {
        code: "implementation_blocked",
        checkpoint: result.checkpoint || null,
        message: implementation.summary || "Implementation adapter did not complete.",
      },
    };
  }

  const cleanedArtifacts = removeEmptyToolArtifacts(workdir);
  const diffDetected = implementation.diffDetected === true || hasGitDiff(workdir);
  if (!diffDetected) {
    recordEvent(state, {
      kind: "agent.implementation.no_diff",
      checkpoint: result.checkpoint || null,
      stage: "implement",
      summary: implementation.summary || "Implementation adapter returned without leaving a detectable git diff.",
      details: compactRecord({
        worktree_path: workdir || null,
        started_at: implementationStartedAt,
        duration_ms: implementationDurationMs,
        changed_files: implementation.changedFiles || [],
        tests_run: implementation.testsRun || [],
        implementation_notes: implementation.implementationNotes || null,
        adapter_details: implementation.details || null,
      }) as Record<string, unknown>,
    });
    recordEvent(state, {
      kind: "agent.implementation.retry_requested",
      checkpoint: result.checkpoint || null,
      stage: "implement",
      summary: "Implementation adapter left no detectable diff; retrying the implement checkpoint inside the bounded loop.",
      details: compactRecord({
        worktree_path: workdir || null,
        checkpoint: result.checkpoint || null,
        next_stage: "implement",
        previous_duration_ms: implementationDurationMs,
      }) as Record<string, unknown>,
    });
    return {
      next: {
        action: "run",
        state_path: String(result.state_path || ""),
        advance_stage: "implement",
        implementation_notes:
          implementation.implementationNotes ||
          implementation.summary ||
          "Implementation adapter returned without a detectable git diff; retry the implement checkpoint.",
      },
    };
  }

  recordEvent(state, {
    kind: "agent.implementation.completed",
    checkpoint: result.checkpoint || null,
    stage: "implement",
    summary: implementation.summary || "Implementation adapter reported code changes.",
    details: {
      worktree_path: workdir || null,
      started_at: implementationStartedAt,
      duration_ms: implementationDurationMs,
      diffDetected,
      changed_files: implementation.changedFiles || [],
      tests_run: implementation.testsRun || [],
      implementation_notes: implementation.implementationNotes || null,
      adapter_details: implementation.details || null,
      cleaned_artifacts: cleanedArtifacts,
    },
  });

  return {
    next: compactRecord({
      action: "run",
      state_path: String(result.state_path || ""),
      advance_stage: "implement",
      implementation_notes: implementation.implementationNotes || implementation.summary,
    }) as RiddleProofWorkflowParams,
  };
}

async function routeCheckpoint(
  request: RiddleProofRunParams,
  state: RiddleProofRunState,
  result: RiddleProofEngineResult,
  agent: RiddleProofAgentAdapter,
  input: RunRiddleProofEngineHarnessInput,
): Promise<RouteResult> {
  const checkpoint = String(result.checkpoint || "");
  const context = contextFor(request, state, result);

  if (!checkpoint) {
    return {
      terminal: terminalResult(state, "completed", result, result.summary || "Riddle Proof engine completed."),
    };
  }

  if (isRecoverableStageCheckpoint(checkpoint) && !input.dry_run && !request.dry_run) {
    if (input.checkpoint_mode === "yield") {
      return { terminal: checkpointAwaitingResult(state, result, input.checkpoint_visibility) };
    }
    const next = stageCheckpointContinuation(result);
    if (next) {
      if (continuationRequestsShip(next) && effectiveShipMode(request, input.config) !== "ship") {
        return { terminal: shipHeldTerminal(state, result) };
      }
      recordEvent(state, {
        kind: "checkpoint.recovery_continuation",
        checkpoint,
        stage: stageFromCheckpoint(result),
        summary: `Routing recoverable checkpoint ${checkpoint} back to ${next.advance_stage}.`,
        details: {
          next,
          checkpointContract: result.checkpointContract || null,
        },
      });
      return { next };
    }
  }

  const failureBlocker = engineFailureBlocker(result, checkpoint);
  if (failureBlocker) {
    return { blocker: failureBlocker };
  }

  if ([
    "recon_human_escalation",
    "verify_human_escalation",
  ].includes(checkpoint) && result.ok === false) {
    return {
      blocker: {
        code: checkpoint,
        checkpoint,
        message: result.summary || `Riddle Proof blocked at ${checkpoint}.`,
        details: { checkpointContract: result.checkpointContract || null },
      },
    };
  }

  if (checkpoint === "ship_review") {
    if (effectiveShipMode(request, input.config) !== "ship") {
      return { terminal: shipHeldTerminal(state, result) };
    }
    return {
      terminal: terminalResult(state, "shipped", result, result.summary || "Riddle Proof shipped."),
    };
  }

  if (checkpoint.startsWith("pr_sync_")) {
    const fullState = context.fullRiddleState || {};
    const prState = recordValue(result.pr_state) || recordValue(result.prState) || recordValue(fullState.pr_state) || {};
    const prStatus = nonEmptyString(prState.status);
    const status: RiddleProofStatus =
      prStatus === "merged" ? "completed" :
        prStatus === "open" ? "shipped" :
          result.ok === false ? "blocked" : "completed";
    return {
      terminal: terminalResult(
        state,
        status,
        result,
        result.summary || "Riddle Proof PR lifecycle sync completed.",
        { pr_sync: true },
      ),
    };
  }

  if (checkpoint === "verify_ship_ready") {
    const shipMode = effectiveShipMode(request, input.config);
    if (shipMode === "ship") {
      if (!isReadyShipGate(result)) {
        return {
          blocker: {
            code: "ship_gate_not_ready",
            checkpoint,
            message:
              "The harness reached verify_ship_ready, but the ship gate is not passing. It will not call ship.",
            details: { shipGate: result.shipGate || result.checkpointContract?.ship_gate || null },
          },
        };
      }
      return { next: { ...baseContinuation(result), ship_after_verify: true } };
    }
    return {
      terminal: shipHeldTerminal(state, result),
    };
  }

  if (checkpoint === "verify_audit_complete") {
    return {
      terminal: terminalResult(
        state,
        "completed",
        result,
        result.summary || "Riddle Proof audit complete.",
        {
          audit_complete: true,
          ship_disabled: true,
        },
      ),
    };
  }

  if (input.dry_run || request.dry_run) {
    return {
      blocker: {
        code: "dry_run_checkpoint",
        checkpoint,
        message: "Dry run stopped before applying agent input to the Riddle Proof workflow.",
        details: { checkpointContract: result.checkpointContract || null },
      },
    };
  }

  if (checkpoint === "recon_supervisor_judgment") {
    if (input.checkpoint_mode === "yield") {
      return { terminal: checkpointAwaitingResult(state, result, input.checkpoint_visibility) };
    }
    const startedAt = timestamp();
    const startedMs = Date.now();
    recordEvent(state, {
      kind: "agent.recon_assessment.started",
      checkpoint,
      stage: "recon",
      summary: "Recon assessment agent started.",
      details: { started_at: startedAt },
    });
    const assessment = await agent.assessRecon(context);
    const durationMs = Date.now() - startedMs;
    const blocker = requirePayload("recon_assessment", assessment, state, result);
    if (blocker) {
      recordEvent(state, {
        kind: "agent.recon_assessment.blocked",
        checkpoint,
        stage: "recon",
        summary: blocker.message,
        details: compactRecord({
          started_at: startedAt,
          duration_ms: durationMs,
          blocker,
          adapter_details: assessment.details || null,
        }) as Record<string, unknown>,
      });
      return { blocker };
    }
    recordEvent(state, {
      kind: "agent.recon_assessment.completed",
      checkpoint,
      stage: "recon",
      summary: assessment.summary,
      details: compactRecord({
        payload: assessment.payload,
        started_at: startedAt,
        duration_ms: durationMs,
        adapter_details: assessment.details || null,
      }) as Record<string, unknown>,
    });
    return {
      next: { ...baseContinuation(result), recon_assessment_json: jsonParam(assessment.payload as Record<string, unknown>) },
    };
  }

  const continueStage = checkpointContinueStage(result);
  const checkpointContinuesToAuthor = continueStage === "author";
  if (
    checkpoint === "author_supervisor_judgment" ||
    checkpoint === "verify_capture_retry" ||
    (checkpoint === "verify_agent_retry" && checkpointContinuesToAuthor)
  ) {
    if (input.checkpoint_mode === "yield") {
      return { terminal: checkpointAwaitingResult(state, result, input.checkpoint_visibility) };
    }
    const startedAt = timestamp();
    const startedMs = Date.now();
    recordEvent(state, {
      kind: "agent.author_packet.started",
      checkpoint,
      stage: "author",
      summary: "Proof authoring agent started.",
      details: { started_at: startedAt },
    });
    const packet = await agent.authorProofPacket(context);
    const durationMs = Date.now() - startedMs;
    const blocker = requirePayload("author_packet", packet, state, result);
    if (blocker) {
      recordEvent(state, {
        kind: "agent.author_packet.blocked",
        checkpoint,
        stage: "author",
        summary: blocker.message,
        details: compactRecord({
          started_at: startedAt,
          duration_ms: durationMs,
          blocker,
          adapter_details: packet.details || null,
        }) as Record<string, unknown>,
      });
      return { blocker };
    }
    recordEvent(state, {
      kind: "agent.author_packet.completed",
      checkpoint,
      stage: "author",
      summary: packet.summary,
      details: compactRecord({
        payload: packet.payload,
        started_at: startedAt,
        duration_ms: durationMs,
        adapter_details: packet.details || null,
      }) as Record<string, unknown>,
    });
    return {
      next: { ...baseContinuation(result), advance_stage: "author", author_packet_json: jsonParam(packet.payload as Record<string, unknown>) },
    };
  }

  if (
    checkpoint === "implement_changes_missing" ||
    checkpoint === "implement_required" ||
    (checkpoint === "verify_agent_retry" && continueStage === "implement")
  ) {
    if (input.checkpoint_mode === "yield") {
      const fullState = context.fullRiddleState || {};
      state.worktree_path = workdirFromState(fullState) || state.worktree_path;
      state.branch = nonEmptyString(fullState.branch) || state.branch;
      persist(state);
      return { terminal: checkpointAwaitingResult(state, result, input.checkpoint_visibility) };
    }
    return handleImplementation(request, state, result, agent);
  }

  if (checkpoint === "implement_review") {
    return { next: { action: "run", state_path: String(result.state_path || ""), advance_stage: "verify" } };
  }

  if (checkpoint === "verify_supervisor_judgment") {
    if (input.checkpoint_mode === "yield") {
      return { terminal: checkpointAwaitingResult(state, result, input.checkpoint_visibility) };
    }
    const startedAt = timestamp();
    const startedMs = Date.now();
    recordEvent(state, {
      kind: "agent.proof_assessment.started",
      checkpoint,
      stage: "verify",
      summary: "Proof assessment agent started.",
      details: { started_at: startedAt },
    });
    const assessment = await agent.assessProof(context);
    const durationMs = Date.now() - startedMs;
    const blocker = requirePayload("proof_assessment", assessment, state, result);
    if (blocker) {
      recordEvent(state, {
        kind: "agent.proof_assessment.blocked",
        checkpoint,
        stage: "verify",
        summary: blocker.message,
        details: compactRecord({
          started_at: startedAt,
          duration_ms: durationMs,
          blocker,
          adapter_details: assessment.details || null,
        }) as Record<string, unknown>,
      });
      if (blocker.code === "main_agent_proof_review_required") {
        recordEvent(state, {
          kind: "checkpoint.packet.requested",
          checkpoint,
          stage: "verify",
          summary: "Main-agent proof review is being converted to a portable checkpoint packet.",
          details: { blocker },
        });
        return { terminal: checkpointAwaitingResult(state, result, input.checkpoint_visibility) };
      }
      return { blocker };
    }
    const payload = normalizeProofAssessmentStageFields(assessment.payload as Record<string, unknown>);
    recordEvent(state, {
      kind: "agent.proof_assessment.completed",
      checkpoint,
      stage: "verify",
      summary: assessment.summary,
      details: compactRecord({
        payload,
        started_at: startedAt,
        duration_ms: durationMs,
        adapter_details: assessment.details || null,
      }) as Record<string, unknown>,
    });
    const hardBlockers = proofAssessmentHardBlockers(context.fullRiddleState || {}, payload);
    if (proofAssessmentRequestsShip(payload) && hardBlockers.length) {
      const summary = hardBlockers[0];
      recordEvent(state, {
        kind: "agent.proof_assessment.hard_blocked",
        checkpoint,
        stage: "verify",
        summary,
        details: compactRecord({
          hard_blockers: hardBlockers,
          proof_assessment: payload,
          agent_duration_ms: durationMs,
        }),
      });
      return {
        blocker: {
          code: "proof_hard_blocker",
          checkpoint,
          message: "Riddle Proof cannot mark ready_to_ship while the proof bundle contains a hard blocker: " + summary,
          details: compactRecord({
            hard_blockers: hardBlockers,
            proofAssessment: payload,
            verifyDecisionRequest:
              context.fullRiddleState?.verify_decision_request ||
              result.verifyDecisionRequest ||
              result.checkpointContract?.verify_decision_request ||
              null,
          }) as Record<string, unknown>,
        },
      };
    }
    const sourceBlocker = proofAssessmentSourceBlocker({
      checkpoint,
      stage: "verify",
      payload,
      code: "proof_assessment_source_not_trusted",
    });
    if (sourceBlocker) {
      recordEvent(state, {
        kind: "agent.proof_assessment.source_blocked",
        checkpoint,
        stage: "verify",
        summary: sourceBlocker.message,
        details: compactRecord({
          proof_assessment: payload,
          agent_duration_ms: durationMs,
        }),
      });
      return { blocker: sourceBlocker };
    }
    const visualBlocker = proofAssessmentVisualBlocker({
      ...(context.fullRiddleState || {}),
      verification_mode: context.fullRiddleState?.verification_mode || request.verification_mode,
    }, payload);
    if (visualBlocker) {
      const recoveryAssessment = visualDeltaEvidenceRecoveryAssessment({
        ...(context.fullRiddleState || {}),
        verification_mode: context.fullRiddleState?.verification_mode || request.verification_mode,
      }, payload, visualBlocker);
      recordEvent(state, {
        kind: "agent.proof_assessment.evidence_recovery_required",
        checkpoint,
        stage: "verify",
        summary: visualBlocker,
        details: compactRecord({
          evidence_collection_incomplete: true,
          recovery_stage: "verify",
          evidence_issue_code: recoveryAssessment.evidence_issue_code || null,
          visual_delta: recoveryAssessment.visual_delta || null,
          proof_assessment: recoveryAssessment,
          agent_duration_ms: durationMs,
        }),
      });
      return { next: proofAssessmentContinuation(result, recoveryAssessment) };
    }
    if (effectiveShipMode(request, input.config) !== "ship" && proofAssessmentRequestsShip(payload)) {
      return {
        terminal: terminalResult(
          state,
          "ready_to_ship",
          result,
          assessment.summary || result.summary || "Riddle Proof evidence is approved, but ship_mode=none is holding before PR/ship.",
          {
            ship_held: true,
            proof_assessment: payload,
          },
        ),
      };
    }
    return { next: proofAssessmentContinuation(result, payload) };
  }

  if (checkpoint === "verify_agent_retry") {
    const next = recommendedContinuation(result);
    if (next) return { next };
    return {
      blocker: {
        code: "proof_assessment_blocked",
        checkpoint,
        message:
          result.summary ||
          "The supervising proof assessment did not approve shipping and did not provide a safe retry continuation.",
        details: compactRecord({
          proofAssessment:
            result.proofAssessment ||
            result.checkpointContract?.proof_assessment ||
            recordValue(result.raw)?.proofAssessment ||
            null,
          verifyDecisionRequest:
            result.verifyDecisionRequest ||
            result.checkpointContract?.verify_decision_request ||
            null,
          checkpointContract: result.checkpointContract || null,
        }) as Record<string, unknown>,
      },
    };
  }

  if (checkpoint === "verify_capture_blocked") {
    return {
      blocker: {
        code: "verify_capture_blocked",
        checkpoint,
        message:
          result.summary ||
          "Verify captured conclusive failed browser evidence and stopped instead of retrying proof authoring.",
        details: compactRecord({
          verifyDecisionRequest:
            result.verifyDecisionRequest ||
            result.checkpointContract?.verify_decision_request ||
            null,
          checkpointContract: result.checkpointContract || null,
        }) as Record<string, unknown>,
      },
    };
  }

  if (checkpoint === "awaiting_stage_advance") {
    const next = recommendedContinuation(result) || defaultAwaitingStageContinuation(result);
    if (next) {
      if (String(next.advance_stage || "") === "ship" && effectiveShipMode(request, input.config) !== "ship") {
        return { terminal: shipHeldTerminal(state, result) };
      }
      return { next };
    }
  }

  if (checkpoint.endsWith("_review")) {
    const next = recommendedContinuation(result);
    if (next) {
      if (continuationRequestsShip(next) && effectiveShipMode(request, input.config) !== "ship") {
        return { terminal: shipHeldTerminal(state, result) };
      }
      return { next };
    }
  }

  return {
    blocker: {
      code: "unhandled_checkpoint",
      checkpoint,
      message: `The harness does not yet know how to safely continue checkpoint ${checkpoint}.`,
      details: { checkpointContract: result.checkpointContract || null },
    },
  };
}

export function readRiddleProofRunStatus(state_path: string): RiddleProofRunStatusSnapshot | null {
  const state = readJson(state_path);
  if (state?.version !== "riddle-proof.run-state.v1" || !Array.isArray(state.events)) return null;
  return createRunStatusSnapshot(state as unknown as RiddleProofRunState);
}

export async function runRiddleProofEngineHarness(
  input: RunRiddleProofEngineHarnessInput,
): Promise<RiddleProofRunResult> {
  const state = loadRunState(input);
  state.request = normalizeRunParams({ ...state.request, ...input.request });
  state.request.engine_state_path =
    nonEmptyString(input.resume_params?.state_path) ||
    nonEmptyString(state.request.engine_state_path) ||
    createEngineStatePath(state, input.config);
  const finalizedCheckpointResponse = finalizedCheckpointResponseWithoutPacketResult(state, input.checkpoint_response);
  if (finalizedCheckpointResponse) return finalizedCheckpointResponse;
  const checkpointContinuation = checkpointResponseContinuation(state, input.checkpoint_response);
  if (checkpointContinuation.blocker) {
    return blockerResult(state, null, checkpointContinuation.blocker);
  }
  if (checkpointContinuation.terminal) {
    return checkpointContinuation.terminal;
  }
  const request = state.request;
  const agent = input.agent || createDisabledRiddleProofAgentAdapter();
  const maxIterations = Math.max(
    1,
    Math.trunc(input.max_iterations ?? request.max_iterations ?? input.config?.defaultMaxIterations ?? DEFAULT_MAX_ITERATIONS),
  );

  state.status = "running";
  state.ok = undefined;
  state.blocker = undefined;
  persist(state);

  recordEvent(state, {
    kind: "engine_harness.started",
    checkpoint: "engine_harness_started",
    stage: "setup",
    summary: "Riddle Proof engine harness started.",
    details: {
      run_id: state.run_id,
      state_path: state.state_path,
      engine_state_path: request.engine_state_path || null,
      max_iterations: maxIterations,
      ship_mode: effectiveShipMode(request, input.config),
      checkpoint_mode: input.checkpoint_mode || "auto",
      checkpoint_visibility: input.checkpoint_visibility || null,
      leave_draft: request.leave_draft || false,
    },
  });

  let engine: RiddleProofEngine;
  try {
    engine = await resolveEngine(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return blockerResult(state, null, {
      code: "riddle_engine_not_configured",
      checkpoint: "engine_resolve_failed",
      message,
    });
  }

  let nextParams = carryRequestControlFlags(
    input.resume_params || checkpointContinuation.next || initialRunParams(request, input, state),
    request,
  );
  let lastResult: RiddleProofEngineResult | null = null;
  const stageIterations: Partial<Record<RiddleProofStage, number>> = {};

  for (let index = 0; index < maxIterations; index += 1) {
    if (request.leave_draft && nextParams.leave_draft === undefined) {
      nextParams = { ...nextParams, leave_draft: true };
    }
    state.iterations += 1;
    const stage = stageFromWorkflowParams(nextParams);
    heartbeat(state, {
      stage,
      summary: `${stage} stage is active.`,
      details: {
        iteration: state.iterations,
        run_id: state.run_id,
        state_path: state.state_path,
        engine_state_path: nextParams.state_path || null,
        worktree_path: state.worktree_path || null,
        branch: state.branch || null,
      },
    });
    const engineCallStartedAt = timestamp();
    const engineCallStartedMs = Date.now();
    recordEvent(state, {
      kind: "engine.call",
      checkpoint: "engine_call",
      stage,
      summary: "Calling Riddle Proof engine.",
      details: {
        params: redactedWorkflowParams(nextParams),
        started_at: engineCallStartedAt,
      },
    });

    let result: RiddleProofEngineResult;
    try {
      result = await engine.execute(nextParams);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordEvent(state, {
        kind: "engine.exception",
        checkpoint: "engine_call_failed",
        stage,
        summary: message,
        details: {
          duration_ms: Date.now() - engineCallStartedMs,
          started_at: engineCallStartedAt,
          finished_at: timestamp(),
        },
      });
      return blockerResult(state, lastResult, {
        code: "riddle_engine_exception",
        checkpoint: "engine_call_failed",
        message,
      });
    }
    const engineCallDurationMs = Date.now() - engineCallStartedMs;

    lastResult = result;
    const engineState = engineStatePath(result, state);
    if (engineState) state.request.engine_state_path = engineState;
    state.last_checkpoint = result.checkpoint || state.last_checkpoint || null;

    const resultStage = stageFromCheckpoint(result);
    stageIterations[resultStage] = (stageIterations[resultStage] || 0) + 1;
    heartbeat(state, {
      stage: resultStage,
      summary: `${resultStage} stage is active.`,
      details: {
        iteration: state.iterations,
        run_id: state.run_id,
        state_path: state.state_path,
        engine_state_path: engineState || null,
        checkpoint: result.checkpoint || null,
      },
    });
    recordEvent(state, {
      kind: "engine.result",
      checkpoint: result.checkpoint || null,
      stage: resultStage,
      summary: result.summary,
      details: {
        ok: result.ok ?? null,
        engine_state_path: engineState || null,
        checkpoint: result.checkpoint || null,
        duration_ms: engineCallDurationMs,
        started_at: engineCallStartedAt,
        finished_at: timestamp(),
      },
    });

    const stageLimit = DEFAULT_STAGE_ITERATION_LIMITS[resultStage];
    if (stageLimit && stageIterations[resultStage] > stageLimit) {
      return blockerResult(state, result, {
        code: "stage_iteration_limit_reached",
        checkpoint: result.checkpoint || null,
        message: `The harness exceeded the ${resultStage} stage iteration limit before the proof was ready or shipped.`,
        details: {
          stage: resultStage,
          stage_iterations: stageIterations[resultStage],
          stage_iteration_limit: stageLimit,
          max_iterations: maxIterations,
          lastCheckpoint: result.checkpoint || null,
          lastSummary: result.summary || null,
        },
      });
    }

    const routed = await routeCheckpoint(request, state, result, agent, input);
    if (routed.terminal) return routed.terminal;
    if (routed.blocker) return blockerResult(state, result, routed.blocker);
    if (!routed.next) {
      return blockerResult(state, result, {
        code: "missing_next_step",
        checkpoint: result.checkpoint || null,
        message: "The harness route returned no next step.",
      });
    }
    nextParams = carryRequestControlFlags(routed.next, request);
  }

  return blockerResult(state, lastResult, {
    code: "max_iterations_reached",
    checkpoint: lastResult?.checkpoint || null,
    message: `The harness reached max_iterations=${maxIterations} before the proof was ready or shipped.`,
    details: {
      nextParams,
      lastCheckpoint: lastResult?.checkpoint || null,
      lastSummary: lastResult?.summary || null,
    },
  });
}
