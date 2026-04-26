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
import type {
  RiddleProofBlocker,
  RiddleProofRunParams,
  RiddleProofRunResult,
  RiddleProofRunState,
  RiddleProofRunStatusSnapshot,
  RiddleProofStage,
  RiddleProofStatus,
} from "./types";

export type RiddleProofShipMode = "none" | "ship";

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

function persist(state: RiddleProofRunState) {
  if (state.state_path) writeJson(state.state_path, state);
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
  if (params.author_packet_json) return "implement";
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

function checkpointContinueStage(result: RiddleProofEngineResult) {
  const resume = recordValue(result.checkpointContract?.resume);
  return nonEmptyString(resume?.continue_with_stage);
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
  const decision = String(payload.decision || "");
  const recommendedStage = String(payload.recommended_stage || "");
  const continueStage = String(payload.continue_with_stage || "");
  return decision === "ready_to_ship" || recommendedStage === "ship" || continueStage === "ship";
}

function proofAssessmentContinuation(
  result: RiddleProofEngineResult,
  payload: Record<string, unknown>,
): RiddleProofWorkflowParams {
  const proof_assessment_json = jsonParam(payload);
  return { ...baseContinuation(result), proof_assessment_json };
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
  setRunStatus(state, status);
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
  recordEvent(state, {
    kind: "run.blocked",
    checkpoint: blocker.checkpoint || result?.checkpoint || null,
    stage: stageFromCheckpoint(result || {}),
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

  const implementation = await agent.implementChange({ ...context, workdir });
  if (implementation.blocker || implementation.ok === false) {
    recordEvent(state, {
      kind: "agent.implementation.blocked",
      checkpoint: result.checkpoint || null,
      stage: "implement",
      summary: implementation.summary || implementation.blocker?.message || "Implementation adapter reported a blocker.",
      details: compactRecord({
        worktree_path: workdir || null,
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
        changed_files: implementation.changedFiles || [],
        tests_run: implementation.testsRun || [],
        implementation_notes: implementation.implementationNotes || null,
        adapter_details: implementation.details || null,
      }) as Record<string, unknown>,
    });
    return {
      blocker: {
        code: "implementation_diff_missing",
        checkpoint: result.checkpoint || null,
        message:
          "The implementation adapter returned, but the after worktree has no detectable git diff. The harness will not advance to verify.",
        details: compactRecord({
          worktree_path: workdir || null,
          changed_files: implementation.changedFiles || [],
          tests_run: implementation.testsRun || [],
          implementation_notes: implementation.implementationNotes || null,
          adapter_details: implementation.details || null,
        }) as Record<string, unknown>,
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
      ...baseContinuation(result),
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

  const failureBlocker = engineFailureBlocker(result, checkpoint);
  if (failureBlocker) {
    return { blocker: failureBlocker };
  }

  if ([
    "recon_human_escalation",
    "verify_human_escalation",
    "ship_gate_blocked",
    "verify_required",
    "verify_supervisor_judgment_required",
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
      terminal: terminalResult(state, "ready_to_ship", result, result.summary || "Riddle Proof is ready to ship.", {
        ship_held: true,
      }),
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
    const assessment = await agent.assessRecon(context);
    const blocker = requirePayload("recon_assessment", assessment, state, result);
    if (blocker) return { blocker };
    recordEvent(state, {
      kind: "agent.recon_assessment.completed",
      checkpoint,
      stage: "recon",
      summary: assessment.summary,
      details: { payload: assessment.payload },
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
    const packet = await agent.authorProofPacket(context);
    const blocker = requirePayload("author_packet", packet, state, result);
    if (blocker) return { blocker };
    recordEvent(state, {
      kind: "agent.author_packet.completed",
      checkpoint,
      stage: "author",
      summary: packet.summary,
      details: { payload: packet.payload },
    });
    return {
      next: { ...baseContinuation(result), author_packet_json: jsonParam(packet.payload as Record<string, unknown>) },
    };
  }

  if (
    checkpoint === "implement_changes_missing" ||
    checkpoint === "implement_required" ||
    (checkpoint === "verify_agent_retry" && continueStage === "implement")
  ) {
    return handleImplementation(request, state, result, agent);
  }

  if (checkpoint === "implement_review") {
    return { next: { action: "run", state_path: String(result.state_path || ""), advance_stage: "verify" } };
  }

  if (checkpoint === "verify_supervisor_judgment") {
    const assessment = await agent.assessProof(context);
    const blocker = requirePayload("proof_assessment", assessment, state, result);
    if (blocker) return { blocker };
    const payload = assessment.payload as Record<string, unknown>;
    recordEvent(state, {
      kind: "agent.proof_assessment.completed",
      checkpoint,
      stage: "verify",
      summary: assessment.summary,
      details: { payload },
    });
    if (effectiveShipMode(request, input.config) !== "ship" && proofAssessmentRequestsShip(payload)) {
      return {
        terminal: terminalResult(
          state,
          "ready_to_ship",
          result,
          assessment.summary || result.summary || "Riddle Proof is ready to ship.",
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
  }

  if (checkpoint === "awaiting_stage_advance") {
    const next = recommendedContinuation(result) || defaultAwaitingStageContinuation(result);
    if (next) {
      if (String(next.advance_stage || "") === "ship" && effectiveShipMode(request, input.config) !== "ship") {
        return {
          terminal: terminalResult(state, "ready_to_ship", result, result.summary || "Riddle Proof is ready to ship.", {
            ship_held: true,
          }),
        };
      }
      return { next };
    }
  }

  if (checkpoint.endsWith("_review")) {
    const next = recommendedContinuation(result);
    if (next) return { next };
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

  let nextParams = input.resume_params || initialRunParams(request, input, state);
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
    nextParams = routed.next;
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
