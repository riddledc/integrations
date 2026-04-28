import { Type } from "@sinclair/typebox";
import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import {
  appendRunEvent,
  createRunResult,
  createRunState,
  createRunStatusSnapshot,
  readRiddleProofRunStatus,
  runRiddleProofEngineHarness,
  setRunStatus,
  type RiddleProofAgentAdapter,
  type RiddleProofEngine,
  type RiddleProofRunParams,
  type RiddleProofRunResult,
  type RiddleProofRunState,
  type RiddleProofRunStatusSnapshot,
  type RiddleProofWorkflowParams,
} from "@riddledc/riddle-proof";
import {
  toRiddleProofRunParams,
  type OpenClawProofedChangeParams,
} from "@riddledc/riddle-proof/openclaw";
import {
  createCodexExecAgentAdapter,
  type CodexExecAgentConfig,
} from "./codex-exec-agent";

export {
  createCodexExecAgentAdapter,
  createCodexExecJsonRunner,
  runCodexExecAgentDoctor,
} from "./codex-exec-agent";
export type {
  CodexExecAgentConfig,
  CodexJsonRequest,
  CodexJsonResult,
  CodexJsonRunner,
} from "./codex-exec-agent";
export {
  buildOpenClawAgentInvocationPlan,
  buildOpenClawAgentSessionKey,
} from "./oc-agent-routing";
export type {
  OpenClawAgentInvocationPlan,
  OpenClawAgentInvocationRequest,
  OpenClawAgentRoutingMode,
  OpenClawAgentThinking,
} from "./oc-agent-routing";

export const RIDDLE_PROOF_CHANGE_TOOL_NAME = "riddle_proof_change";
export const RIDDLE_PROOF_STATUS_TOOL_NAME = "riddle_proof_status";
export const RIDDLE_PROOF_WAIT_TOOL_NAME = "riddle_proof_wait";
export const RIDDLE_PROOF_REVIEW_TOOL_NAME = "riddle_proof_review";
export const RIDDLE_PROOF_SYNC_TOOL_NAME = "riddle_proof_sync";
const MIN_DEFAULT_MAX_ITERATIONS = 12;
export const RIDDLE_PROOF_INSPECT_TOOL_NAME = "riddle_proof_inspect";
const STRUCTURED_FIRST_VERIFICATION_MODES = new Set([
  "api",
  "audio",
  "data",
  "json",
  "log",
  "logs",
  "metric",
  "metrics",
  "telemetry",
  "text",
]);

export type OpenClawRiddleProofPackageMetadata = {
  plugin_package: string | null;
  plugin_version: string | null;
  dependency_package: string;
  dependency_version: string | null;
};

declare const __RIDDLE_PROOF_PACKAGE_METADATA__: OpenClawRiddleProofPackageMetadata;

function riddleProofPackageMetadata() {
  return __RIDDLE_PROOF_PACKAGE_METADATA__;
}

export type OpenClawRiddleProofRunMode = "blocking" | "background";
export type RiddleProofReportMode = "checkpoint" | "terminal_only";
type OpenClawRiddleProofRunModeSource = "background_param" | "run_mode_param" | "config_default" | "wrapper_default";
export type RiddleProofChangeParams = OpenClawProofedChangeParams & {
  run_mode?: OpenClawRiddleProofRunMode;
  background?: boolean;
  report_mode?: RiddleProofReportMode;
  wait_for_terminal?: boolean;
};
export type OpenClawRiddleProofExecutionMode = "disabled" | "engine";
export type OpenClawRiddleProofAgentMode = "disabled" | "codex_exec";
export type OpenClawRiddleProofReviewMode = "codex_exec" | "main_agent";

export interface RiddleProofReviewParams {
  state_path: string;
  decision: "ready_to_ship" | "needs_richer_proof" | "revise_capture" | "needs_recon" | "needs_implementation";
  summary: string;
  recommended_stage?: "ship" | "author" | "implement" | "recon" | "verify";
  continue_with_stage?: "ship" | "author" | "implement" | "recon" | "verify";
  escalation_target?: "agent" | "human";
  reasons?: string[];
}

export interface RiddleProofSyncParams {
  state_path: string;
  cleanup?: boolean;
  fetch_base?: boolean;
  update_base_checkout?: boolean;
}

export interface RiddleProofStatusParams {
  state_path: string;
  debug?: boolean;
}

export interface RiddleProofWaitParams {
  state_path: string;
  timeout_ms?: number;
  debug?: boolean;
}

export interface RiddleProofInspectParams {
  state_path: string;
  debug?: boolean;
}

export interface OpenClawRiddleProofMonitorContract {
  contract_version: "riddle_proof.oc_wrapper.v1";
  report_mode: RiddleProofReportMode;
  wait_for_terminal: boolean;
  response_gate: "checkpoint_ok" | "hold_for_terminal" | "hold_for_implementation_outcome" | "release_terminal";
  should_report_now: boolean;
  should_continue_monitoring: boolean;
}

export interface CreateOpenClawRiddleProofResultOptions {
  implementationConfigured?: boolean;
}

export interface OpenClawRiddleProofRuntimeConfig {
  executionMode?: OpenClawRiddleProofExecutionMode;
  agentMode?: OpenClawRiddleProofAgentMode;
  proofReviewMode?: OpenClawRiddleProofReviewMode;
  engine?: RiddleProofEngine | (() => Promise<RiddleProofEngine>);
  agent?: RiddleProofAgentAdapter;
  riddleEngineModuleUrl?: string;
  riddleProofDir?: string;
  defaultReviewer?: string;
  stateDir?: string;
  defaultMaxIterations?: number;
  defaultShipMode?: "none" | "ship";
  defaultRunMode?: OpenClawRiddleProofRunMode;
  autoReviewShipModeNone?: boolean;
  codexCommand?: CodexExecAgentConfig["codexCommand"];
  codexHome?: CodexExecAgentConfig["codexHome"];
  codexModel?: CodexExecAgentConfig["codexModel"];
  codexTimeoutMs?: CodexExecAgentConfig["codexTimeoutMs"];
  codexSandbox?: CodexExecAgentConfig["codexSandbox"];
  codexFullAuto?: CodexExecAgentConfig["codexFullAuto"];
}

interface BackgroundWorkerData {
  kind: "openclaw-riddle-proof-background";
  request: RiddleProofRunParams;
  state_path: string;
  config: OpenClawRiddleProofRuntimeConfig;
}

export function createOpenClawRiddleProofResult(
  params: RiddleProofChangeParams,
  options: CreateOpenClawRiddleProofResultOptions = {},
): RiddleProofRunResult {
  const request = applyWrapperMonitorSettings(toRiddleProofRunParams(params), params);
  const state = createRunState({ request });

  appendRunEvent(state, {
    kind: "request.normalized",
    checkpoint: "request_normalized",
    stage: "setup",
    summary: "OpenClaw request normalized into Riddle Proof run params.",
    details: {
      verification_mode: request.verification_mode,
      integration_source: request.integration_context?.source,
      has_assertions: request.assertions !== undefined,
    },
  });

  if (!options.implementationConfigured) {
    state.blocker = {
      code: "execution_adapter_not_configured",
      message:
        "The OpenClaw Riddle Proof wrapper is installed, but no implementation adapter is configured yet.",
      checkpoint: "request_normalized",
      details: {
        next_step:
          "Wire the server-backed execution harness behind this wrapper after parity tests pass.",
        required_adapters: [
          "preflight",
          "setup",
          "implementation",
          "proof",
          "judge",
          "ship",
          "notification",
        ],
      },
    };
    setRunStatus(state, "blocked");
    return createRunResult({
      state,
      status: "blocked",
      last_summary: "Riddle Proof request normalized; execution adapter is not configured.",
      raw: {
        request,
      },
    });
  }

  setRunStatus(state, "running");
  return createRunResult({
    state,
    status: "running",
    last_summary: "Riddle Proof request normalized and ready for an implementation adapter.",
    raw: {
      request,
    },
  });
}

function runtimeConfigFrom(api: any): OpenClawRiddleProofRuntimeConfig {
  const cfg = (api.pluginConfig ?? {}) as Record<string, unknown>;
  const executionMode = cfg.executionMode === "engine" ? "engine" : "disabled";
  const agentMode = cfg.agentMode === "codex_exec" ? "codex_exec" : "disabled";
  const proofReviewMode = cfg.proofReviewMode === "main_agent" ? "main_agent" : "codex_exec";
  const defaultShipMode = cfg.defaultShipMode === "none" ? "none" : cfg.defaultShipMode === "ship" ? "ship" : undefined;
  const defaultRunMode = cfg.defaultRunMode === "background" ? "background" : cfg.defaultRunMode === "blocking" ? "blocking" : undefined;
  const autoReviewShipModeNone = cfg.autoReviewShipModeNone === false ? false : true;
  const codexSandbox =
    cfg.codexSandbox === "read-only" ||
    cfg.codexSandbox === "workspace-write" ||
    cfg.codexSandbox === "danger-full-access"
      ? cfg.codexSandbox
      : undefined;
  return {
    executionMode,
    agentMode,
    proofReviewMode,
    riddleEngineModuleUrl: typeof cfg.riddleEngineModuleUrl === "string" ? cfg.riddleEngineModuleUrl : undefined,
    riddleProofDir: typeof cfg.riddleProofDir === "string" ? cfg.riddleProofDir : undefined,
    defaultReviewer: typeof cfg.defaultReviewer === "string" ? cfg.defaultReviewer : undefined,
    stateDir: typeof cfg.stateDir === "string" ? cfg.stateDir : undefined,
    defaultMaxIterations: normalizeDefaultMaxIterations(cfg.defaultMaxIterations),
    defaultShipMode,
    defaultRunMode,
    autoReviewShipModeNone,
    codexCommand: typeof cfg.codexCommand === "string" ? cfg.codexCommand : undefined,
    codexHome: typeof cfg.codexHome === "string" ? cfg.codexHome : undefined,
    codexModel: typeof cfg.codexModel === "string" ? cfg.codexModel : undefined,
    codexTimeoutMs: typeof cfg.codexTimeoutMs === "number" ? cfg.codexTimeoutMs : undefined,
    codexSandbox,
    codexFullAuto: typeof cfg.codexFullAuto === "boolean" ? cfg.codexFullAuto : undefined,
  };
}

function normalizeDefaultMaxIterations(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(MIN_DEFAULT_MAX_ITERATIONS, Math.trunc(value));
}

function effectiveMaxIterations(request: RiddleProofRunParams, config: OpenClawRiddleProofRuntimeConfig) {
  return normalizeDefaultMaxIterations(request.max_iterations ?? config.defaultMaxIterations);
}

function effectiveHarnessConfig(config: OpenClawRiddleProofRuntimeConfig) {
  return {
    riddleEngineModuleUrl: config.riddleEngineModuleUrl,
    riddleProofDir: config.riddleProofDir,
    defaultReviewer: config.defaultReviewer,
    stateDir: config.stateDir,
    defaultMaxIterations: normalizeDefaultMaxIterations(config.defaultMaxIterations),
    defaultShipMode: config.defaultShipMode,
  };
}

function timestamp() {
  return new Date().toISOString();
}

function createHarnessStatePath(stateDir = "/tmp") {
  const stamp = timestamp().replace(/\D/g, "").slice(0, 14) || "unknown";
  return path.join(stateDir, `riddle-proof-run-${stamp}-${crypto.randomUUID().slice(0, 8)}.json`);
}

function persistRunState(state: RiddleProofRunState) {
  if (!state.state_path) return;
  mkdirSync(path.dirname(state.state_path), { recursive: true });
  writeFileSync(state.state_path, JSON.stringify(state, null, 2) + "\n");
}

function isProtectedFinalWrapperState(state: RiddleProofRunState | null | undefined) {
  return Boolean(
    state?.finalized === true &&
    (state.status === "ready_to_ship" || state.status === "shipped" || state.status === "completed"),
  );
}

function wakeNextToolsFor(result: RiddleProofRunResult) {
  if (result.blocker?.code === "main_agent_proof_review_required") {
    return [RIDDLE_PROOF_INSPECT_TOOL_NAME, RIDDLE_PROOF_REVIEW_TOOL_NAME, RIDDLE_PROOF_STATUS_TOOL_NAME];
  }
  if (result.status === "running") return [RIDDLE_PROOF_WAIT_TOOL_NAME, RIDDLE_PROOF_STATUS_TOOL_NAME];
  if (result.status === "ready_to_ship" || result.status === "shipped") {
    return [RIDDLE_PROOF_STATUS_TOOL_NAME, RIDDLE_PROOF_SYNC_TOOL_NAME];
  }
  return [RIDDLE_PROOF_STATUS_TOOL_NAME, RIDDLE_PROOF_INSPECT_TOOL_NAME];
}

function appendWakeRequest(state: RiddleProofRunState, result: RiddleProofRunResult) {
  const engineStatePath = stringValue(state.request.engine_state_path);
  const engineState = engineStatePath ? readJsonRecord(engineStatePath) : null;
  const timingSummary = buildTimingSummary(createRunStatusSnapshot(state), state, engineState);
  const monitorContract = monitorContractFor(result.status, state.request);
  appendRunEvent(state, {
    kind: "run.wake.requested",
    checkpoint: result.last_checkpoint || state.last_checkpoint || null,
    stage: state.current_stage || null,
    summary:
      result.blocker?.message ||
      result.last_summary ||
      `Riddle Proof background run reached status=${result.status}.`,
    details: {
      status: result.status,
      state_path: state.state_path || result.state_path || null,
      run_id: state.run_id || result.run_id || null,
      blocker: result.blocker,
      timing_summary: timingSummary,
      next_tools: wakeNextToolsFor(result),
      monitor_contract: monitorContract,
      note:
        "Host/channel integrations should treat this durable event as the signal to re-enter the conversation with a status or review packet.",
    },
  });
  persistRunState(state);
}

function serializableBackgroundConfig(config: OpenClawRiddleProofRuntimeConfig): OpenClawRiddleProofRuntimeConfig {
  return {
    executionMode: config.executionMode,
    agentMode: config.agentMode,
    proofReviewMode: config.proofReviewMode,
    riddleEngineModuleUrl: config.riddleEngineModuleUrl,
    riddleProofDir: config.riddleProofDir,
    defaultReviewer: config.defaultReviewer,
    stateDir: config.stateDir,
    defaultMaxIterations: normalizeDefaultMaxIterations(config.defaultMaxIterations),
    defaultShipMode: config.defaultShipMode,
    defaultRunMode: config.defaultRunMode,
    autoReviewShipModeNone: config.autoReviewShipModeNone,
    codexCommand: config.codexCommand,
    codexHome: config.codexHome,
    codexModel: config.codexModel,
    codexTimeoutMs: config.codexTimeoutMs,
    codexSandbox: config.codexSandbox,
    codexFullAuto: config.codexFullAuto,
  };
}

function markBackgroundWorkerFailed(statePath: string, message: string) {
  const state = readRunState(statePath);
  if (!state) return;
  if (isProtectedFinalWrapperState(state)) {
    appendRunEvent(state, {
      kind: "run.background.failure_ignored",
      checkpoint: state.last_checkpoint || "background_worker",
      stage: state.current_stage || "setup",
      summary: "Ignored background worker failure because the run already has a finalized terminal status.",
      details: { message },
    });
    persistRunState(state);
    return;
  }
  state.blocker = {
    code: "background_worker_failed",
    checkpoint: state.last_checkpoint || "background_worker",
    message,
  };
  appendRunEvent(state, {
    kind: "run.background.failed",
    checkpoint: state.blocker.checkpoint,
    stage: state.current_stage || "setup",
    summary: message,
    details: { code: state.blocker.code },
  });
  setRunStatus(state, "failed");
  persistRunState(state);
  appendWakeRequest(state, createRunResult({
    state,
    status: "failed",
    last_summary: message,
  }));
}

async function runBackgroundWorkerJob(data: BackgroundWorkerData) {
  const config = data.config || {};
  const result = await runRiddleProofEngineHarness({
    request: data.request,
    state_path: data.state_path,
    max_iterations: effectiveMaxIterations(data.request, config),
    dry_run: data.request.dry_run,
    auto_approve: data.request.auto_approve,
    engine: config.engine,
    agent: agentFromConfig(config),
    config: effectiveHarnessConfig(config),
  });
  const state = readRunState(data.state_path);
  if (state) {
    if (isProtectedFinalWrapperState(state) && state.status !== result.status) {
      appendRunEvent(state, {
        kind: "run.background.result_ignored",
        checkpoint: state.last_checkpoint || result.last_checkpoint || null,
        stage: state.current_stage || null,
        summary: "Ignored stale background worker result because the run already has a finalized terminal status.",
        details: {
          preserved_status: state.status,
          ignored_status: result.status,
          ignored_blocker: result.blocker || null,
        },
      });
      persistRunState(state);
    } else {
      appendWakeRequest(state, result);
    }
  }
  return result;
}

function startBackgroundWorker(request: RiddleProofRunParams, statePath: string, config: OpenClawRiddleProofRuntimeConfig) {
  const worker = new Worker(new URL(import.meta.url), {
    workerData: {
      kind: "openclaw-riddle-proof-background",
      request,
      state_path: statePath,
      config: serializableBackgroundConfig(config),
    } satisfies BackgroundWorkerData,
  });
  worker.unref();
  worker.on("error", (error) => {
    markBackgroundWorkerFailed(statePath, error instanceof Error ? error.message : String(error));
  });
  worker.on("exit", (code) => {
    if (code !== 0) markBackgroundWorkerFailed(statePath, `Riddle Proof background worker exited with code ${code}.`);
  });
}

function runModeFrom(
  params: RiddleProofChangeParams,
  config: OpenClawRiddleProofRuntimeConfig,
): OpenClawRiddleProofRunMode {
  return runModeDecisionFrom(params, config).mode;
}

function runModeDecisionFrom(
  params: RiddleProofChangeParams,
  config: OpenClawRiddleProofRuntimeConfig,
): { mode: OpenClawRiddleProofRunMode; source: OpenClawRiddleProofRunModeSource } {
  if (params.background === true) return { mode: "background", source: "background_param" };
  if (params.run_mode === "background" || params.run_mode === "blocking") {
    return { mode: params.run_mode, source: "run_mode_param" };
  }
  if (config.defaultRunMode === "background" || config.defaultRunMode === "blocking") {
    return { mode: config.defaultRunMode, source: "config_default" };
  }
  return { mode: "background", source: "wrapper_default" };
}

function isTerminalStatusLike(status: string | null | undefined) {
  return (
    status === "blocked" ||
    status === "failed" ||
    status === "ready_to_ship" ||
    status === "shipped" ||
    status === "completed"
  );
}

function resumableCheckpointLike(
  status: string | null | undefined,
  checkpoint: string | null | undefined,
  blockerCode?: string | null,
) {
  if (!checkpoint || !ROUTABLE_CHECKPOINTS.has(checkpoint)) return false;
  if (blockerCode === "main_agent_proof_review_required") return false;
  if (blockerCode && !ROUTABLE_BLOCKER_CODES.has(blockerCode)) return false;
  if (REVIEW_CHECKPOINTS.has(checkpoint)) return false;
  return status === "running" || status === "blocked";
}

function reportModeFromParams(params: Pick<RiddleProofChangeParams, "report_mode" | "wait_for_terminal">) {
  if (params.report_mode === "terminal_only" || params.wait_for_terminal === true) return "terminal_only" as const;
  if (params.report_mode === "checkpoint") return "checkpoint" as const;
  return undefined;
}

function readWrapperMetadata(request: RiddleProofRunParams) {
  return recordValue(request.integration_context?.metadata) || {};
}

function applyWrapperMonitorSettings(
  request: RiddleProofRunParams,
  params: Pick<RiddleProofChangeParams, "report_mode" | "wait_for_terminal">,
) {
  const metadata = {
    ...readWrapperMetadata(request),
  };
  const reportMode = reportModeFromParams(params);
  if (reportMode) metadata.report_mode = reportMode;
  if (typeof params.wait_for_terminal === "boolean") metadata.wait_for_terminal = params.wait_for_terminal;
  request.integration_context = {
    ...(request.integration_context || {}),
    metadata: Object.keys(metadata).length ? metadata : undefined,
  };
  return request;
}

function reportModeFromRequest(request: RiddleProofRunParams): RiddleProofReportMode {
  return readWrapperMetadata(request).report_mode === "terminal_only" ? "terminal_only" : "checkpoint";
}

function waitForTerminalFromRequest(request: RiddleProofRunParams) {
  const metadata = readWrapperMetadata(request);
  return metadata.wait_for_terminal === true || metadata.report_mode === "terminal_only";
}

function requestMetadataFor(
  request: RiddleProofRunParams | null | undefined,
  engineState?: Record<string, unknown> | null,
) {
  const integrationMetadata = request ? readWrapperMetadata(request) : {};
  const referenceInputIgnored = stringValue(integrationMetadata.reference_input_ignored);
  const requestReference = stringValue(request?.reference);
  const engineRequestedReference = stringValue(engineState?.requested_reference);
  const engineReference = stringValue(engineState?.reference);
  const referenceResolution = recordValue(engineState?.reference_resolution);
  const resolutionEffectiveReference = stringValue(referenceResolution?.effective_reference);
  const resolutionRequestedReference = stringValue(referenceResolution?.requested_reference);
  const effectiveReference = resolutionEffectiveReference || engineReference || requestReference || engineRequestedReference;
  const requestedReference = engineRequestedReference || resolutionRequestedReference;
  return compactRecordValue({
    reference: requestReference || null,
    effective_reference: effectiveReference || null,
    requested_reference: requestedReference || null,
    reference_input_ignored: referenceInputIgnored || null,
    reference_resolution: referenceResolution,
    prod_reference_skipped: referenceResolution?.prod_reference_skipped === true ? true : null,
    prod_reference_skip_reason: stringValue(referenceResolution?.prod_reference_skip_reason) || null,
    integration_metadata: Object.keys(integrationMetadata).length ? integrationMetadata : null,
  });
}

function monitorContractFor(
  status: string | null | undefined,
  request: RiddleProofRunParams,
  options: {
    checkpoint?: string | null;
    blockerCode?: string | null;
    implementationGapOrigin?: string | null;
  } = {},
): OpenClawRiddleProofMonitorContract {
  const reportMode = reportModeFromRequest(request);
  const waitForTerminal = waitForTerminalFromRequest(request);
  const resumable = resumableCheckpointLike(status, options.checkpoint, options.blockerCode);
  const terminal = !resumable && isTerminalStatusLike(status);
  const implementationInFlight = options.implementationGapOrigin === "during_agent_attempt";
  const responseGate =
    implementationInFlight
      ? "hold_for_implementation_outcome"
      : waitForTerminal && !terminal
      ? "hold_for_terminal"
      : terminal
        ? "release_terminal"
        : "checkpoint_ok";
  return {
    contract_version: "riddle_proof.oc_wrapper.v1",
    report_mode: reportMode,
    wait_for_terminal: waitForTerminal,
    response_gate: responseGate,
    should_report_now: responseGate === "checkpoint_ok" || responseGate === "release_terminal",
    should_continue_monitoring:
      responseGate === "hold_for_terminal" || responseGate === "hold_for_implementation_outcome",
  };
}

function startOpenClawRiddleProofBackground(
  params: RiddleProofChangeParams,
  config: OpenClawRiddleProofRuntimeConfig,
): RiddleProofRunResult {
  const request = applyWrapperMonitorSettings(toRiddleProofRunParams(params), params);
  const runModeDecision = runModeDecisionFrom(params, config);
  const statePath = request.harness_state_path || createHarnessStatePath(config.stateDir);
  request.harness_state_path = statePath;
  const state = createRunState({
    request,
    state_path: statePath,
    status: "running",
  });
  appendRunEvent(state, {
    kind: "run.background.started",
    checkpoint: "background_started",
    stage: "setup",
    summary:
      `Riddle Proof background run accepted; prefer ${RIDDLE_PROOF_WAIT_TOOL_NAME} when available, ` +
      `or poll ${RIDDLE_PROOF_STATUS_TOOL_NAME} using monitor_should_continue.`,
    details: {
      state_path: statePath,
      run_mode: runModeDecision.mode,
      run_mode_source: runModeDecision.source,
      background_requested: params.background === true,
      monitor_contract: monitorContractFor("running", request),
      next_tools: [
        RIDDLE_PROOF_WAIT_TOOL_NAME,
        RIDDLE_PROOF_INSPECT_TOOL_NAME,
        RIDDLE_PROOF_REVIEW_TOOL_NAME,
      ],
    },
  });
  setRunStatus(state, "running");
  persistRunState(state);

  if (config.engine || config.agent) {
    setImmediate(() => {
      void runBackgroundWorkerJob({
        kind: "openclaw-riddle-proof-background",
        request,
        state_path: statePath,
        config,
      }).catch((error) => {
        markBackgroundWorkerFailed(statePath, error instanceof Error ? error.message : String(error));
      });
    });
  } else {
    startBackgroundWorker(request, statePath, config);
  }

  return createRunResult({
    state,
    status: "running",
    last_summary:
      `Riddle Proof background run accepted; use ${RIDDLE_PROOF_WAIT_TOOL_NAME} when available, ` +
      `or poll ${RIDDLE_PROOF_STATUS_TOOL_NAME} until monitor_should_continue is false.`,
    raw: {
      background: true,
      background_requested: params.background === true,
      run_mode: runModeDecision.mode,
      run_mode_source: runModeDecision.source,
      run_mode_defaulted: runModeDecision.source === "config_default" || runModeDecision.source === "wrapper_default",
      state_path: statePath,
      monitor_contract: monitorContractFor("running", request),
      next_actions: [
        `Call ${RIDDLE_PROOF_WAIT_TOOL_NAME} with state_path=${statePath} when available to wait for the next reportable state without ad hoc sleep loops.`,
        `If ${RIDDLE_PROOF_WAIT_TOOL_NAME} is not exposed in this surface, poll ${RIDDLE_PROOF_STATUS_TOOL_NAME} with state_path=${statePath} and stop when monitor_should_continue is false.`,
        `Call ${RIDDLE_PROOF_STATUS_TOOL_NAME} with state_path=${statePath} for one-off debug or final inspection snapshots.`,
        `Call ${RIDDLE_PROOF_INSPECT_TOOL_NAME} with state_path=${statePath} when proof review is needed.`,
        `Call ${RIDDLE_PROOF_REVIEW_TOOL_NAME} with state_path=${statePath} to resume after a proof judgment.`,
      ],
    },
  });
}

function agentFromConfig(config: OpenClawRiddleProofRuntimeConfig): RiddleProofAgentAdapter | undefined {
  const wrapForReview = (agent: RiddleProofAgentAdapter) =>
    config.proofReviewMode === "main_agent" ? createMainAgentProofReviewAdapter(agent, config) : agent;
  if (config.agent) return wrapForReview(config.agent);
  if (config.agentMode !== "codex_exec") return undefined;
  return wrapForReview(createCodexExecAgentAdapter({
    codexCommand: config.codexCommand,
    codexHome: config.codexHome,
    codexModel: config.codexModel,
    codexTimeoutMs: config.codexTimeoutMs,
    codexSandbox: config.codexSandbox,
    codexFullAuto: config.codexFullAuto,
  }));
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function verificationModeRequiresScreenshot(mode: unknown) {
  return !STRUCTURED_FIRST_VERIFICATION_MODES.has(stringValue(mode).toLowerCase());
}

function artifactContractRequiresScreenshot(
  artifactContract: Record<string, unknown> | null,
  verificationMode: unknown,
) {
  const required = recordValue(artifactContract?.required);
  if (typeof required?.screenshot === "boolean") return required.screenshot;
  return verificationModeRequiresScreenshot(verificationMode);
}

function compactRecordValue<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""),
  ) as Partial<T>;
}

function compactValue(value: unknown, limit = 1200) {
  if (value === undefined || value === null || value === "") return "";
  let text = "";
  try {
    text = JSON.stringify(value);
  } catch {
    text = String(value);
  }
  return text.length <= limit ? text : `${text.slice(0, limit - 20).trimEnd()}...`;
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function isoToMs(value: unknown): number | null {
  const text = stringValue(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function summarizeWrapperStageDurations(state: RiddleProofRunState | null, snapshot: RiddleProofRunStatusSnapshot) {
  const events = Array.isArray(state?.events) ? state.events : [];
  const totals: Record<string, number> = {};
  let activeStage = "";
  let activeStartedMs: number | null = null;

  for (const event of events) {
    const record = recordValue(event);
    const stage = stringValue(record?.stage);
    const tsMs = isoToMs(record?.ts);
    if (!stage || tsMs === null) continue;
    if (!activeStage) {
      activeStage = stage;
      activeStartedMs = tsMs;
      continue;
    }
    if (stage === activeStage) continue;
    if (activeStartedMs !== null) {
      totals[activeStage] = (totals[activeStage] || 0) + Math.max(0, tsMs - activeStartedMs);
    }
    activeStage = stage;
    activeStartedMs = tsMs;
  }

  const finishedAtMs = isoToMs(snapshot.updated_at) ?? Date.now();
  if (activeStage && activeStartedMs !== null) {
    totals[activeStage] = (totals[activeStage] || 0) + Math.max(0, finishedAtMs - activeStartedMs);
  }

  return Object.keys(totals).length ? totals : null;
}

function summarizeRuntimeStepDurations(engineState: Record<string, unknown> | null) {
  const events = Array.isArray(engineState?.runtime_events) ? engineState.runtime_events : [];
  const totals: Record<string, number> = {};
  for (const event of events) {
    const record = recordValue(event);
    if (!record || stringValue(record.kind) !== "workflow.step.finished") continue;
    const step = stringValue(record.step);
    const details = recordValue(record.details);
    const durationMs = numericValue(details?.duration_ms);
    if (!step || durationMs === null) continue;
    totals[step] = (totals[step] || 0) + durationMs;
  }
  return Object.keys(totals).length ? totals : null;
}

function summarizeRuntimePhaseDurations(engineState: Record<string, unknown> | null) {
  const events = Array.isArray(engineState?.runtime_events) ? engineState.runtime_events : [];
  const totals: Record<string, number> = {};
  const active = new Map<string, number>();

  for (const event of events) {
    const record = recordValue(event);
    if (!record) continue;
    const kind = stringValue(record.kind);
    const step = stringValue(record.step);
    const phase = stringValue(record.phase);
    const tsMs = isoToMs(record.ts);
    if (!step || !phase || tsMs === null) continue;
    const key = `${step}:${phase}`;
    if (kind === "workflow.phase.started") {
      active.set(key, tsMs);
      continue;
    }
    if (kind === "workflow.phase.finished") {
      const startedMs = active.get(key);
      if (startedMs !== undefined) {
        totals[key] = (totals[key] || 0) + Math.max(0, tsMs - startedMs);
        active.delete(key);
      }
    }
  }

  return Object.keys(totals).length ? totals : null;
}

function summarizeStagePhaseDurations(
  engineState: Record<string, unknown> | null,
  stage: string,
) {
  const phaseDurations = summarizeRuntimePhaseDurations(engineState);
  if (!phaseDurations) return null;
  const prefix = `${stage}:`;
  const totals: Record<string, number> = {};
  for (const [key, durationMs] of Object.entries(phaseDurations)) {
    if (!key.startsWith(prefix)) continue;
    totals[key.slice(prefix.length)] = durationMs;
  }
  return Object.keys(totals).length ? totals : null;
}

function summarizeRetryCounts(engineState: Record<string, unknown> | null) {
  const stageAttempts = recordValue(engineState?.stage_attempts);
  if (!stageAttempts) return null;
  const retries: Record<string, number> = {};
  for (const [stage, value] of Object.entries(stageAttempts)) {
    const attempt = recordValue(value);
    const count = numericValue(attempt?.count);
    if (count !== null && count > 1) retries[stage] = count - 1;
  }
  return Object.keys(retries).length ? retries : null;
}

function summarizeCaptureHint(engineState: Record<string, unknown> | null) {
  const captureHint = recordValue(engineState?.capture_hint);
  if (!captureHint) return null;
  const selected = recordValue(captureHint.selected);
  const saved = recordValue(engineState?.capture_hint_saved);
  const appliedFields = Array.isArray(captureHint.applied_fields) ? captureHint.applied_fields.map(String) : [];
  const reconResults = recordValue(engineState?.recon_results);
  const currentPlan = recordValue(reconResults?.current_plan);
  const selectedServerPath = stringValue(selected?.server_path) || null;
  const selectedWaitForSelector = stringValue(selected?.wait_for_selector) || null;
  const fallbackChanges = recordValue(captureHint.fallback_changes);
  return {
    applied: Boolean(captureHint.applied),
    applied_fields: appliedFields,
    matched_tokens: Array.isArray(captureHint.matched_tokens) ? captureHint.matched_tokens : [],
    selection_reason: stringValue(captureHint.selection_reason) || null,
    source: stringValue(captureHint.source) || null,
    server_path: selectedServerPath,
    selected_server_path: selectedServerPath,
    server_path_applied: appliedFields.includes("server_path"),
    effective_server_path: stringValue(engineState?.server_path) || stringValue(currentPlan?.target_path) || null,
    wait_for_selector: selectedWaitForSelector,
    selected_wait_for_selector: selectedWaitForSelector,
    wait_for_selector_applied: appliedFields.includes("wait_for_selector"),
    effective_wait_for_selector: stringValue(engineState?.wait_for_selector) || stringValue(currentPlan?.wait_for_selector) || null,
    fallback_triggered: captureHint.fallback_triggered === true,
    fallback_reason: stringValue(captureHint.fallback_reason) || null,
    fallback_changes: fallbackChanges || null,
    saved_status: stringValue(saved?.status) || null,
  };
}

function buildTimingSummary(
  snapshot: RiddleProofRunStatusSnapshot,
  wrapperState: RiddleProofRunState | null,
  engineState: Record<string, unknown> | null,
) {
  const currentRuntimeStep = recordValue(engineState?.current_runtime_step);
  return {
    total_elapsed_ms: numericValue(snapshot.elapsed_ms) ?? null,
    current_stage_elapsed_ms: numericValue(snapshot.stage_elapsed_ms) ?? null,
    wrapper_stage_durations_ms: summarizeWrapperStageDurations(wrapperState, snapshot),
    workflow_step_durations_ms: summarizeRuntimeStepDurations(engineState),
    workflow_phase_durations_ms: summarizeRuntimePhaseDurations(engineState),
    recon_subphase_durations_ms: summarizeStagePhaseDurations(engineState, "recon"),
    verify_subphase_durations_ms: summarizeStagePhaseDurations(engineState, "verify"),
    retry_counts: summarizeRetryCounts(engineState),
    active_runtime_step: currentRuntimeStep ? {
      step: stringValue(currentRuntimeStep.step) || null,
      phase: stringValue(currentRuntimeStep.phase) || null,
      status: stringValue(currentRuntimeStep.status) || null,
      elapsed_ms: currentRuntimeStep.status === "running" ? elapsedMsSince(currentRuntimeStep.started_at) : null,
      phase_elapsed_ms: currentRuntimeStep.phase_status === "running" ? elapsedMsSince(currentRuntimeStep.phase_started_at) : null,
    } : null,
    capture_hint: summarizeCaptureHint(engineState),
  };
}

function latestWakeTimingSummary(wrapperState: RiddleProofRunState | null) {
  const events = Array.isArray(wrapperState?.events) ? wrapperState.events : [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const record = recordValue(events[index]);
    if (stringValue(record?.kind) !== "run.wake.requested") continue;
    const details = recordValue(record?.details);
    const timingSummary = recordValue(details?.timing_summary);
    if (timingSummary) return timingSummary;
  }
  return null;
}

function mergeTimingSummary(
  liveSummary: ReturnType<typeof buildTimingSummary>,
  wakeSummary: Record<string, unknown> | null,
) {
  if (!wakeSummary) return liveSummary;
  const merged: Record<string, unknown> = {
    ...wakeSummary,
    ...liveSummary,
  };
  for (const [key, value] of Object.entries(liveSummary)) {
    if ((value === null || value === undefined) && wakeSummary[key] !== undefined) {
      merged[key] = wakeSummary[key];
    }
  }
  return merged;
}

function compactDebugEvent(event: unknown) {
  const record = recordValue(event);
  if (!record) return null;
  const details = recordValue(record.details);
  return {
    ts: stringValue(record.ts) || null,
    kind: stringValue(record.kind) || null,
    checkpoint: stringValue(record.checkpoint) || null,
    stage: stringValue(record.stage) || null,
    step: stringValue(record.step) || null,
    phase: stringValue(record.phase) || null,
    summary: stringValue(record.summary) || null,
    status: stringValue(details?.status) || null,
    duration_ms: numericValue(details?.duration_ms),
    error: stringValue(details?.error) || null,
  };
}

function buildDebugPayload(wrapperState: RiddleProofRunState | null, engineState: Record<string, unknown> | null) {
  const wrapperEvents = Array.isArray(wrapperState?.events) ? wrapperState.events : [];
  const runtimeEvents = Array.isArray(engineState?.runtime_events) ? engineState.runtime_events : [];
  const captureDiagnostics = Array.isArray(engineState?.capture_diagnostics) ? engineState.capture_diagnostics : [];
  const stageAttempts = recordValue(engineState?.stage_attempts);
  return {
    wrapper_events_recent: wrapperEvents.slice(-8).map(compactDebugEvent).filter(Boolean),
    engine_runtime_events_recent: runtimeEvents.slice(-8).map(compactDebugEvent).filter(Boolean),
    capture_diagnostics_recent: captureDiagnostics.slice(-4),
    stage_attempts: stageAttempts || null,
  };
}

function parseJsonRecord(value: string) {
  if (!value) return null;
  try {
    return recordValue(JSON.parse(value));
  } catch {
    return null;
  }
}

function evidenceKeyMeansClaim(key: string) {
  if (!key) return false;
  const lower = key.toLowerCase();
  return (
    /(?:visible|present|exists?|matches?|matched|found|detected|passed|valid|changed|applied|rendered|loaded|shown|contains|includes|removed|absent|gone|cleared)/.test(lower) ||
    /(?:has|is)[A-Z]/.test(key)
  );
}

function evidenceKeyMeansKnownNonClaim(key: string) {
  return /(?:count|index|width|height|x|y|ms|duration|elapsed|sample|snippet|text|copy|path|route|url|href)$/i.test(key);
}

function evidenceFalseMeansExpectedAbsence(key: string) {
  const lower = key.toLowerCase();
  if (/(?:absent|removed|gone|cleared)/.test(lower)) return false;
  if (/still(?:visible|present|found|detected|shown|exists?)/.test(lower)) return true;
  return (
    /(?:old|stale|previous|legacy|forbidden|unexpected).*(?:visible|present|exists?|found|detected|shown|contains|includes)/.test(lower) ||
    /(?:visible|present|exists?|found|detected|shown|contains|includes).*(?:old|stale|previous|legacy|forbidden|unexpected)/.test(lower)
  );
}

function proofEvidenceConcerns(proofEvidence: unknown, proofEvidenceSample: string) {
  const source = recordValue(proofEvidence) || parseJsonRecord(proofEvidenceSample);
  if (!source) return [];
  return Object.entries(source)
    .filter(([key, value]) => (
      value === false &&
      evidenceKeyMeansClaim(key) &&
      !evidenceKeyMeansKnownNonClaim(key) &&
      !evidenceFalseMeansExpectedAbsence(key)
    ))
    .slice(0, 12)
    .map(([key, value]) => ({
      key,
      value,
      reason:
        "Structured proof evidence contains a failed boolean claim. Reconcile this with the screenshots/text evidence before auto-reviewing.",
    }));
}

function scratchCleanupStatusLabel(scratchCleanup: Record<string, unknown> | null) {
  if (!scratchCleanup) return null;
  const errors = listValue(scratchCleanup.errors, 12);
  if (errors.length > 0) return "cleanup_error";
  const removed = listValue(scratchCleanup.removed, 12);
  if (removed.length > 0) return "removed_worktrees";
  const skipped = stringValue(scratchCleanup.skipped);
  if (skipped) return `skipped_${skipped}`;
  const status = stringValue(scratchCleanup.status);
  if (status && status !== "recorded") return status;
  if (scratchCleanup.requested === true) return "requested";
  return status || "recorded";
}

function summarizeImplementationAgent(wrapperState: RiddleProofRunState | null | undefined) {
  const events = Array.isArray(wrapperState?.events) ? wrapperState.events : [];
  const implementationEvents = events
    .map((event) => recordValue(event))
    .filter((event): event is Record<string, unknown> => Boolean(event) && stringValue(event?.kind || "").startsWith("agent.implementation."));
  const attempts = implementationEvents.filter((event) => stringValue(event.kind) === "agent.implementation.started");
  const lastEvent = implementationEvents.length ? implementationEvents[implementationEvents.length - 1] : null;
  const lastOutcome = [...implementationEvents].reverse().find((event) => stringValue(event.kind) !== "agent.implementation.started") || null;
  return {
    attempt_count: attempts.length,
    last_event: lastEvent ? {
      kind: stringValue(lastEvent.kind) || null,
      summary: stringValue(lastEvent.summary) || null,
      ts: stringValue(lastEvent.ts) || null,
      details: recordValue(lastEvent.details) || null,
    } : null,
    last_outcome: lastOutcome ? {
      kind: stringValue(lastOutcome.kind) || null,
      summary: stringValue(lastOutcome.summary) || null,
      ts: stringValue(lastOutcome.ts) || null,
      details: recordValue(lastOutcome.details) || null,
    } : null,
  };
}

function implementationGapOrigin(
  snapshot: RiddleProofRunStatusSnapshot,
  implementationAgent: ReturnType<typeof summarizeImplementationAgent>,
) {
  const checkpoint = stringValue(snapshot.last_checkpoint) || stringValue(snapshot.blocker?.checkpoint) || stringValue(snapshot.blocker?.code);
  const isImplementationGap = checkpoint === "implement_changes_missing" || checkpoint === "implement_required";
  if (!isImplementationGap) return null;
  if (implementationAgent.attempt_count === 0) return "before_agent_edit";
  if (!implementationAgent.last_outcome) return "during_agent_attempt";
  return "after_agent_attempt";
}

function waitStopCondition(
  responseGate: OpenClawRiddleProofMonitorContract["response_gate"] | undefined,
  suggestedNextAction: string | null | undefined,
) {
  if (responseGate === "hold_for_implementation_outcome") {
    return "implementation outcome, reportable state, or terminal status";
  }
  if (suggestedNextAction === "continue_monitoring") {
    return "suggested_next_action != continue_monitoring or terminal status";
  }
  return "already_reportable";
}

function statusLoopMonitorPlan(statePath: string, pollAfterMs: number | null, stopWhen: string) {
  return {
    preferred_tool: RIDDLE_PROOF_STATUS_TOOL_NAME,
    optional_wait_tool: RIDDLE_PROOF_WAIT_TOOL_NAME,
    state_path: statePath,
    continue_while: "monitor_should_continue",
    stop_when: stopWhen,
    poll_after_ms: pollAfterMs,
  };
}

function collectImageArtifacts(value: unknown, output: Array<Record<string, unknown>> = [], seen = new Set<string>()) {
  if (output.length >= 16 || !value) return output;
  if (typeof value === "string") {
    if (/^https?:\/\/.+\.(png|jpe?g|webp)(\?|#|$)/i.test(value) && !seen.has(value)) {
      seen.add(value);
      output.push({ role: "artifact", url: value });
    }
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectImageArtifacts(item, output, seen);
    return output;
  }
  const record = recordValue(value);
  if (!record) return output;
  const url = stringValue(record.url);
  const name = stringValue(record.name) || stringValue(record.label);
  const kind = stringValue(record.kind);
  const role = stringValue(record.role);
  if (
    url &&
    !seen.has(url) &&
    (/^https?:\/\/.+\.(png|jpe?g|webp)(\?|#|$)/i.test(url) || kind === "screenshot" || /\.(png|jpe?g|webp)$/i.test(name))
  ) {
    seen.add(url);
    output.push({
      role: role || kind || "artifact",
      name: name || undefined,
      url,
    });
  }
  for (const nested of Object.values(record)) collectImageArtifacts(nested, output, seen);
  return output;
}

function listValue(value: unknown, limit: number) {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

function semanticObservation(label: string, observation: unknown) {
  const record = recordValue(observation) || {};
  const details = recordValue(record.details) || {};
  const valid = typeof record.valid === "boolean" ? record.valid : typeof record.ok === "boolean" ? record.ok : false;
  return {
    label,
    valid,
    reason: stringValue(record.reason),
    telemetry_ready: Boolean(record.telemetry_ready),
    url: stringValue(record.url),
    capture_url: stringValue(record.capture_url),
    observed_path: stringValue(details.observed_path),
    observed_path_raw: stringValue(details.observed_path_raw),
    title: stringValue(details.title),
    visible_text_sample: stringValue(details.visible_text_sample),
    headings: listValue(details.headings, 8),
    buttons: listValue(details.buttons, 12),
    links: listValue(details.links, 12),
    canvas_count: typeof details.canvas_count === "number" ? details.canvas_count : 0,
    interactive_elements: typeof details.interactive_elements === "number" ? details.interactive_elements : 0,
    visible_interactive_elements: typeof details.visible_interactive_elements === "number" ? details.visible_interactive_elements : 0,
    semantic_anchor_count: typeof details.semantic_anchor_count === "number" ? details.semantic_anchor_count : 0,
    large_visible_elements: listValue(details.large_visible_elements, 10),
  };
}

function buildSemanticContext(
  assessmentRequest: Record<string, unknown>,
  evidenceBundle: Record<string, unknown>,
  fullState: Record<string, unknown>,
) {
  const existing = recordValue(assessmentRequest.semantic_context) || recordValue(evidenceBundle.semantic_context);
  if (existing) return existing;

  const baseline = recordValue(evidenceBundle.baseline) || {};
  const beforeBaseline = recordValue(baseline.before) || {};
  const prodBaseline = recordValue(baseline.prod) || {};
  const after = recordValue(evidenceBundle.after) || {};
  const beforeSemantic = semanticObservation("before", beforeBaseline.observation);
  const prodSemantic = semanticObservation("prod", prodBaseline.observation);
  const afterSemantic = semanticObservation("after", after.observation || assessmentRequest.after_observation);
  const expectedPath = stringValue(assessmentRequest.expected_path) || stringValue(evidenceBundle.expected_path) || stringValue(fullState.server_path);
  return {
    expected_path: expectedPath || null,
    reference: stringValue(evidenceBundle.reference) || stringValue(fullState.reference) || null,
    requested_change: stringValue(fullState.change_request) || null,
    success_criteria: stringValue(fullState.success_criteria) || null,
    route: {
      expected_path: expectedPath || null,
      before_observed_path: stringValue(beforeSemantic.observed_path) || stringValue(beforeBaseline.path) || null,
      prod_observed_path: stringValue(prodSemantic.observed_path) || stringValue(prodBaseline.path) || null,
      after_observed_path: stringValue(afterSemantic.observed_path) || null,
    },
    before: beforeSemantic,
    prod: prodSemantic,
    after: afterSemantic,
  };
}

function routeMatches(route: Record<string, unknown> | null) {
  if (!route) return false;
  const expected = stringValue(route.expected_path);
  if (!expected) return false;
  const after = stringValue(route.after_observed_path);
  if (!routeMatchesExpected(expected, after)) return false;
  const observed = [
    stringValue(route.before_observed_path),
    stringValue(route.prod_observed_path),
  ].filter(Boolean);
  return observed.every((item) => routeMatchesExpected(expected, item));
}

function normalizedRouteUrl(value: string) {
  try {
    const parsed = new URL(value, "http://riddle-proof.local");
    let pathname = parsed.pathname || "/";
    const parts = pathname.split("/");
    if (parts.length >= 4 && parts[1] === "s") {
      pathname = `/${parts.slice(3).join("/")}`;
    }
    pathname = pathname.replace(/\/+$/, "") || "/";
    return {
      pathname,
      searchParams: Array.from(parsed.searchParams.entries()),
    };
  } catch {
    return {
      pathname: value.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/",
      searchParams: [] as Array<[string, string]>,
    };
  }
}

function routeMatchesExpected(expected: string, observed: string) {
  if (!expected || !observed) return false;
  const expectedRoute = normalizedRouteUrl(expected);
  const observedRoute = normalizedRouteUrl(observed);
  if (expectedRoute.pathname !== observedRoute.pathname) return false;
  if (expectedRoute.searchParams.length === 0) return true;
  const remaining = [...observedRoute.searchParams];
  for (const pair of expectedRoute.searchParams) {
    const index = remaining.findIndex(([key, value]) => key === pair[0] && value === pair[1]);
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  return true;
}

function uniqueStrings(values: unknown[], limit: number) {
  const output: string[] = [];
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : "";
    if (text && !output.includes(text)) output.push(text);
    if (output.length >= limit) break;
  }
  return output;
}

function semanticRecord(value: unknown) {
  return recordValue(value) || {};
}

function buildVisibleChangeSummary(semanticContext: Record<string, unknown>) {
  const before = semanticRecord(semanticContext.before);
  const prod = semanticRecord(semanticContext.prod);
  const after = semanticRecord(semanticContext.after);
  const baselineAnchors = new Set([
    ...uniqueStrings(listValue(before.headings, 12), 12),
    ...uniqueStrings(listValue(before.buttons, 16), 16),
    ...uniqueStrings(listValue(prod.headings, 12), 12),
    ...uniqueStrings(listValue(prod.buttons, 16), 16),
  ]);
  const afterAnchors = uniqueStrings([
    ...listValue(after.headings, 12),
    ...listValue(after.buttons, 16),
    ...listValue(after.links, 16),
  ], 24);
  const newAnchors = afterAnchors.filter((item) => !baselineAnchors.has(item)).slice(0, 8);
  return {
    before_text_sample: stringValue(before.visible_text_sample),
    prod_text_sample: stringValue(prod.visible_text_sample),
    after_text_sample: stringValue(after.visible_text_sample),
    after_headings: uniqueStrings(listValue(after.headings, 12), 12),
    after_buttons: uniqueStrings(listValue(after.buttons, 16), 16),
    new_after_anchors: newAnchors,
  };
}

function buildProofInspection(
  wrapperState: RiddleProofRunState,
  fullState: Record<string, unknown>,
  checkpoint?: string | null,
  options: { debug?: boolean } = {},
) {
  const implementationAgent = summarizeImplementationAgent(wrapperState);
  const implementationGap = implementationGapOrigin(createRunStatusSnapshot(wrapperState), implementationAgent);
  const assessmentRequest =
    recordValue(fullState.proof_assessment_request) ||
    recordValue(recordValue(fullState.verify_decision_request)?.assessment_request) ||
    {};
  const evidenceBundle =
    recordValue(fullState.evidence_bundle) ||
    recordValue(assessmentRequest.evidence_bundle) ||
    {};
  const after = recordValue(evidenceBundle.after) || {};
  const visualDelta = recordValue(after.visual_delta) || recordValue(assessmentRequest.visual_delta) || null;
  const supportingArtifacts = recordValue(after.supporting_artifacts) || {};
  const proofEvidence = evidenceBundle.proof_evidence ?? after.proof_evidence ?? null;
  const artifactContract = recordValue(evidenceBundle.artifact_contract) || recordValue(assessmentRequest.artifact_contract) || null;
  const artifactProduction = recordValue(evidenceBundle.artifact_production) || recordValue(assessmentRequest.artifact_production) || null;
  const artifactUsage = recordValue(evidenceBundle.artifact_usage) || recordValue(assessmentRequest.artifact_usage) || null;
  const proofEvidenceSample =
    stringValue(evidenceBundle.proof_evidence_sample) ||
    stringValue(after.proof_evidence_sample) ||
    stringValue(supportingArtifacts.proof_evidence_sample) ||
    compactValue(proofEvidence);
  const proofEvidenceConcernList = proofEvidenceConcerns(proofEvidence, proofEvidenceSample);
  const semanticContext = buildSemanticContext(assessmentRequest, evidenceBundle, fullState);
  const route = recordValue(semanticContext.route);
  const imageArtifacts: Array<Record<string, unknown>> = [];
  for (const [role, url] of [
    ["before", fullState.before_cdn],
    ["prod", fullState.prod_cdn],
    ["after", fullState.after_cdn],
  ] as const) {
    const normalized = stringValue(url);
    if (normalized) imageArtifacts.push({ role, url: normalized });
  }
  collectImageArtifacts(evidenceBundle, imageArtifacts, new Set(imageArtifacts.map((item) => String(item.url || ""))));
  const profile = recordValue(fullState.proof_profile);
  const visibleChange = buildVisibleChangeSummary(semanticContext);
  const verificationMode = fullState.verification_mode || wrapperState.request.verification_mode;
  const screenshotRequired = artifactContractRequiresScreenshot(artifactContract, verificationMode);
  const hasAfterScreenshot = imageArtifacts.some((item) => item.role === "after" || item.name === "after");
  const missingRequiredSignals = listValue(recordValue(artifactUsage)?.missing_required_signals, 12)
    .map((item) => stringValue(item))
    .filter(Boolean);
  const proofEvidenceRequired = recordValue(recordValue(artifactContract)?.required)?.proof_evidence === true;
  const proofEvidencePresent = Boolean(proofEvidence !== null && proofEvidence !== undefined) || Boolean(supportingArtifacts.proof_evidence_present);
  const readyCandidate = Boolean(
    routeMatches(route) &&
    semanticRecord(semanticContext.after).valid !== false &&
    (!screenshotRequired || hasAfterScreenshot) &&
    (!proofEvidenceRequired || proofEvidencePresent) &&
    missingRequiredSignals.length === 0 &&
    (visualDelta?.status === "measured" ? visualDelta?.passed !== false : true),
  );
  const readyToShipCandidate = readyCandidate && proofEvidenceConcernList.length === 0;
  const scratchCleanup = recordValue(fullState.scratch_cleanup);
  const implementationDetection = recordValue(fullState.implementation_detection);
  const inspection = {
    ok: true,
    package_metadata: riddleProofPackageMetadata(),
    status: wrapperState.status,
    run_id: wrapperState.run_id || null,
    state_path: wrapperState.state_path || null,
    engine_state_path: wrapperState.request.engine_state_path || null,
    checkpoint: checkpoint || wrapperState.last_checkpoint || null,
    repo: wrapperState.request.repo || fullState.repo || null,
    branch: stringValue(fullState.branch) || wrapperState.branch || wrapperState.request.branch || null,
    change_request: wrapperState.request.change_request || fullState.change_request || "",
    verification_mode: wrapperState.request.verification_mode || fullState.verification_mode || "proof",
    request_metadata: requestMetadataFor(wrapperState.request, fullState),
    monitor_contract: monitorContractFor(wrapperState.status, wrapperState.request, {
      checkpoint: checkpoint || wrapperState.last_checkpoint || null,
      blockerCode: wrapperState.blocker?.code || null,
      implementationGapOrigin: implementationGap,
    }),
    proof_profile_applied: Boolean(profile),
    proof_profile: profile,
    expected_path: stringValue(assessmentRequest.expected_path) || stringValue(evidenceBundle.expected_path) || stringValue(fullState.server_path) || null,
    route,
    route_matched: routeMatches(route),
    artifact_contract: artifactContract,
    artifact_production: artifactProduction,
    artifact_usage: artifactUsage,
    image_artifacts: imageArtifacts,
    visual_delta: visualDelta,
    structured_evidence: {
      proof_evidence_present: proofEvidencePresent,
      proof_evidence_sample: proofEvidenceSample,
      proof_evidence_has_concerns: proofEvidenceConcernList.length > 0,
      proof_evidence_concerns: proofEvidenceConcernList,
      data_outputs: listValue(supportingArtifacts.data_outputs, 12),
      result_keys: listValue(supportingArtifacts.result_keys, 12),
      structured_result_keys: listValue(supportingArtifacts.structured_result_keys, 12),
    },
    scratch_cleanup: scratchCleanup,
    scratch_cleanup_status: scratchCleanupStatusLabel(scratchCleanup),
    implementation_status: stringValue(fullState.implementation_status) || null,
    implementation_summary: stringValue(fullState.implementation_summary) || null,
    implementation_detection_summary: stringValue(fullState.implementation_detection_summary) || null,
    implementation_detection: implementationDetection,
    implementation_agent_attempt_count: implementationAgent.attempt_count,
    implementation_agent_last_event: implementationAgent.last_event,
    implementation_agent_last_outcome: implementationAgent.last_outcome,
    implementation_gap_origin: implementationGap,
    capture_hint: summarizeCaptureHint(fullState),
    timing_summary: buildTimingSummary(
      createRunStatusSnapshot(wrapperState),
      wrapperState,
      fullState,
    ),
    visible_change: visibleChange,
    semantic_context: semanticContext,
    ready_to_ship_candidate: readyToShipCandidate,
    next_action: readyToShipCandidate
      ? screenshotRequired
        ? `If the screenshots visually satisfy the request, resume with ${RIDDLE_PROOF_REVIEW_TOOL_NAME} decision=ready_to_ship.`
        : `If the required proof artifacts satisfy the request, resume with ${RIDDLE_PROOF_REVIEW_TOOL_NAME} decision=ready_to_ship.`
      : "Use this inspection packet to choose needs_implementation, needs_richer_proof, revise_capture, or needs_recon.",
  };
  if (options.debug) {
    return {
      ...inspection,
      debug: buildDebugPayload(wrapperState, fullState),
    };
  }
  return inspection;
}

function buildMainAgentProofReviewPacket(context: Parameters<RiddleProofAgentAdapter["assessProof"]>[0]) {
  const fullState = recordValue(context.fullRiddleState) || {};
  const assessmentRequest =
    recordValue(fullState.proof_assessment_request) ||
    recordValue(recordValue(fullState.verify_decision_request)?.assessment_request) ||
    recordValue(context.engineResult.decisionRequest) ||
    {};
  const evidenceBundle =
    recordValue(fullState.evidence_bundle) ||
    recordValue(assessmentRequest.evidence_bundle) ||
    {};
  const after = recordValue(evidenceBundle.after) || {};
  const visualDelta = recordValue(after.visual_delta) || recordValue(assessmentRequest.visual_delta) || null;
  const semanticContext = buildSemanticContext(assessmentRequest, evidenceBundle, fullState);
  const artifactContract = recordValue(evidenceBundle.artifact_contract) || recordValue(assessmentRequest.artifact_contract) || null;
  const artifactProduction = recordValue(evidenceBundle.artifact_production) || recordValue(assessmentRequest.artifact_production) || null;
  const artifactUsage = recordValue(evidenceBundle.artifact_usage) || recordValue(assessmentRequest.artifact_usage) || null;
  const verificationMode = context.request.verification_mode || stringValue(fullState.verification_mode) || "proof";
  const screenshotRequired = artifactContractRequiresScreenshot(artifactContract, verificationMode);
  const imageArtifacts: Array<Record<string, unknown>> = [];
  for (const [role, url] of [
    ["before", fullState.before_cdn],
    ["prod", fullState.prod_cdn],
    ["after", fullState.after_cdn],
  ] as const) {
    const normalized = stringValue(url);
    if (normalized) imageArtifacts.push({ role, url: normalized });
  }
  collectImageArtifacts(evidenceBundle, imageArtifacts, new Set(imageArtifacts.map((item) => String(item.url || ""))));

  return {
    mode: screenshotRequired ? "main_agent_visual_review" : "main_agent_artifact_review",
    run_id: context.state.run_id || null,
    state_path: context.state.state_path || null,
    engine_state_path: context.engineResult.state_path || context.request.engine_state_path || null,
    checkpoint: context.checkpoint,
    repo: context.request.repo || null,
    branch: stringValue(fullState.branch) || context.state.branch || context.request.branch || null,
    change_request: context.request.change_request || "",
    context: context.request.context || "",
    verification_mode: verificationMode,
    success_criteria: context.request.success_criteria || "",
    expected_path: stringValue(assessmentRequest.expected_path) || stringValue(evidenceBundle.expected_path) || null,
    artifact_contract: artifactContract,
    artifact_production: artifactProduction,
    artifact_usage: artifactUsage,
    image_artifacts: imageArtifacts,
    visual_delta: visualDelta,
    semantic_context: semanticContext,
    scratch_cleanup: recordValue(fullState.scratch_cleanup),
    proof_assessment_request: assessmentRequest,
    review_prompt: screenshotRequired
      ? [
          "Inspect the before/prod and after screenshots as images, not just as URLs or pixel counts.",
          "Use semantic_context.route, headings, buttons, and text anchors to ground route/content judgment before calling the proof wrong-route.",
          "Confirm whether the after screenshot visibly satisfies the requested change and route/content still match the target.",
          "Reject subtle, ambiguous, wrong-route, blank, loading-only, or incidental screenshot changes.",
          "For visual/UI polish, do not use ready_to_ship based on CSS, code diff, or intent alone. The screenshots must prove the visible result at normal PR-review scale.",
          "If visual_delta is unmeasured and the before/after images look nearly identical or require zooming/code inspection to believe, choose needs_implementation or needs_richer_proof.",
          `Resume with ${RIDDLE_PROOF_REVIEW_TOOL_NAME} using decision=ready_to_ship only if the visible result is convincing.`,
        ]
      : [
          "Review artifact_contract, artifact_usage, proof_evidence, semantic_context, and any image artifacts if present.",
          "Use semantic_context.route and structured proof evidence to ground route/content judgment before calling the proof wrong-route.",
          "Confirm whether the captured required artifacts satisfy the requested change and route/content still match the target.",
          "Reject missing required signals, ambiguous evidence, wrong-route captures, or evidence that only proves implementation intent.",
          "For structured modes, do not require screenshots when artifact_contract.required.screenshot is false, but do require the declared proof evidence signals.",
          `Resume with ${RIDDLE_PROOF_REVIEW_TOOL_NAME} using decision=ready_to_ship only if the required proof artifacts are convincing.`,
        ],
    response_schema: {
      state_path: context.state.state_path || null,
      decision: "ready_to_ship | needs_richer_proof | revise_capture | needs_recon | needs_implementation",
      summary: screenshotRequired
        ? "Concrete visual judgment grounded in the screenshots."
        : "Concrete proof judgment grounded in the required artifacts.",
      recommended_stage: "ship | author | implement | recon | verify",
      continue_with_stage: "ship | author | implement | recon | verify",
      escalation_target: "agent | human",
      reasons: ["string"],
    },
  };
}

function effectiveShipMode(
  request: Parameters<RiddleProofAgentAdapter["assessProof"]>[0]["request"],
  config: OpenClawRiddleProofRuntimeConfig,
) {
  return request.ship_mode || config.defaultShipMode || "ship";
}

function afterScreenshotArtifact(inspection: Record<string, unknown>) {
  const artifacts = Array.isArray(inspection.image_artifacts) ? inspection.image_artifacts : [];
  return artifacts.some((item) => {
    const record = recordValue(item);
    return record && (record.role === "after" || record.name === "after") && stringValue(record.url);
  });
}

function inspectionRequiresScreenshot(inspection: Record<string, unknown>) {
  return artifactContractRequiresScreenshot(
    recordValue(inspection.artifact_contract),
    inspection.verification_mode,
  );
}

function inspectionMissingRequiredSignals(inspection: Record<string, unknown>) {
  return listValue(recordValue(inspection.artifact_usage)?.missing_required_signals, 12)
    .map((item) => stringValue(item))
    .filter(Boolean);
}

function proofInspectionCanAutoAdvance(inspection: Record<string, unknown>) {
  const visualDelta = recordValue(inspection.visual_delta);
  const structuredEvidence = recordValue(inspection.structured_evidence);
  const screenshotRequired = inspectionRequiresScreenshot(inspection);
  return Boolean(
    inspection.ok === true &&
    inspection.ready_to_ship_candidate === true &&
    inspection.route_matched === true &&
    (!screenshotRequired || afterScreenshotArtifact(inspection)) &&
    inspectionMissingRequiredSignals(inspection).length === 0 &&
    structuredEvidence?.proof_evidence_has_concerns !== true &&
    (visualDelta?.status === "measured" ? visualDelta?.passed !== false : true),
  );
}

function autoShipModeNoneAssessment(inspection: Record<string, unknown>) {
  const screenshotRequired = inspectionRequiresScreenshot(inspection);
  const reasons = [
    "ship_mode is none, so advancing can only reach the non-shipping ready_to_ship state.",
    "The inspection packet marked the proof as a ready_to_ship_candidate.",
    "The target route matched across available observations.",
    "Required artifact signals are present for the verification mode.",
    "No failed visual delta was reported.",
    "No structured proof evidence concerns were reported.",
  ];
  if (screenshotRequired) {
    reasons.splice(4, 0, "An after screenshot artifact was captured.");
  }
  return {
    decision: "ready_to_ship",
    summary:
      "Auto-reviewed proof for ship_mode=none. The inspection packet marks this as a ready-to-ship candidate, the target route matched, required artifact signals are present, and this mode can only advance to a held ready state without shipping.",
    recommended_stage: "ship",
    continue_with_stage: "ship",
    escalation_target: "agent",
    reasons,
    source: "openclaw_auto_ship_mode_none",
    inspection_summary: {
      expected_path: inspection.expected_path || null,
      route_matched: inspection.route_matched,
      visual_delta: inspection.visual_delta || null,
      screenshot_required: screenshotRequired,
      image_artifact_count: Array.isArray(inspection.image_artifacts) ? inspection.image_artifacts.length : 0,
    },
  };
}

function createMainAgentProofReviewAdapter(
  delegate: RiddleProofAgentAdapter,
  config: OpenClawRiddleProofRuntimeConfig,
): RiddleProofAgentAdapter {
  return {
    assessRecon: (context) => delegate.assessRecon(context),
    authorProofPacket: (context) => delegate.authorProofPacket(context),
    implementChange: (context) => delegate.implementChange(context),
    async assessProof(context) {
      const fullState = recordValue(context.fullRiddleState) || {};
      const inspection = buildProofInspection(context.state, fullState, context.checkpoint);
      if (
        config.autoReviewShipModeNone !== false &&
        effectiveShipMode(context.request, config) === "none" &&
        proofInspectionCanAutoAdvance(inspection)
      ) {
        const payload = autoShipModeNoneAssessment(inspection);
        return {
          ok: true,
          payload,
          summary: payload.summary,
        };
      }
      const proofReview = buildMainAgentProofReviewPacket(context);
      return {
        ok: false,
        blocker: {
          code: "main_agent_proof_review_required",
          checkpoint: context.checkpoint,
          message:
            "Riddle Proof captured evidence and is waiting for the main OpenClaw agent to inspect the screenshots before shipping or iterating.",
          details: {
            proof_review: proofReview,
          },
        },
      };
    },
  };
}

export async function runOpenClawRiddleProof(
  params: RiddleProofChangeParams,
  config: OpenClawRiddleProofRuntimeConfig = {},
): Promise<RiddleProofRunResult> {
  if (config.executionMode !== "engine") {
    return createOpenClawRiddleProofResult(params);
  }

  const request = applyWrapperMonitorSettings(toRiddleProofRunParams(params), params);
  if (runModeFrom(params, config) === "background") {
    return startOpenClawRiddleProofBackground(params, config);
  }

  return runRiddleProofEngineHarness({
    request,
    state_path: request.harness_state_path,
    max_iterations: effectiveMaxIterations(request, config),
    dry_run: request.dry_run,
    auto_approve: request.auto_approve,
    engine: config.engine,
    agent: agentFromConfig(config),
    config: effectiveHarnessConfig(config),
  });
}

function latestRuntimeEvent(engineState: Record<string, unknown> | null) {
  const events = Array.isArray(engineState?.runtime_events)
    ? engineState.runtime_events
    : [];
  return recordValue(events[events.length - 1]);
}

function elapsedMsSince(isoTime: unknown) {
  const startedAt = stringValue(isoTime);
  if (!startedAt) return null;
  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) return null;
  return Math.max(0, Date.now() - startedMs);
}

function recommendedPollAfterMs(activeSubstep: Record<string, unknown> | null, snapshot: RiddleProofRunStatusSnapshot) {
  const checkpoint = snapshot.last_checkpoint || snapshot.blocker?.checkpoint || null;
  const resumable = resumableCheckpointLike(snapshot.status, checkpoint, snapshot.blocker?.code);
  if (snapshot.status !== "running" && !resumable) return null;

  const step = stringValue(activeSubstep?.step) || snapshot.current_stage || null;
  const phase = stringValue(activeSubstep?.phase);
  if (phase.endsWith("_deps")) return 60_000;
  if (step === "implement") return 5_000;
  if (step === "author") return 10_000;
  if (step === "recon" || step === "verify") return 15_000;
  if (activeSubstep?.status === "running") return 20_000;
  if (resumable) return 10_000;
  return 10_000;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitSnapshotKey(snapshot: Record<string, unknown>) {
  const activeSubstep = recordValue(snapshot.active_substep);
  return JSON.stringify({
    status: stringValue(snapshot.status),
    checkpoint: stringValue(snapshot.checkpoint) || stringValue(snapshot.last_checkpoint),
    suggested_next_action: stringValue(snapshot.suggested_next_action),
    current_stage: stringValue(snapshot.current_stage),
    engine_current_stage: stringValue(snapshot.engine_current_stage),
    active_step: stringValue(activeSubstep?.step),
    active_phase: stringValue(activeSubstep?.phase),
    active_status: stringValue(activeSubstep?.status),
    engine_runtime_event_count: numericValue(snapshot.engine_runtime_event_count),
  });
}

const ROUTABLE_CHECKPOINTS = new Set([
  "awaiting_stage_advance",
  "recon_supervisor_judgment",
  "author_supervisor_judgment",
  "verify_capture_retry",
  "verify_agent_retry",
  "implement_changes_missing",
  "implement_required",
  "implement_review",
  "verify_supervisor_judgment",
]);

const ROUTABLE_BLOCKER_CODES = new Set([
  "implement_changes_missing",
  "implement_required",
]);

const REVIEW_CHECKPOINTS = new Set([
  "main_agent_proof_review_required",
  "verify_human_escalation",
  "recon_human_escalation",
]);

function checkpointStatus(snapshot: RiddleProofRunStatusSnapshot) {
  const snapshotRecord = snapshot as RiddleProofRunStatusSnapshot & Record<string, unknown>;
  const checkpoint = snapshot.last_checkpoint || snapshot.blocker?.checkpoint || null;
  const resumable = resumableCheckpointLike(snapshot.status, checkpoint, snapshot.blocker?.code);
  const implementationGap = Boolean(
    checkpoint === "implement_changes_missing" ||
    checkpoint === "implement_required" ||
    snapshot.blocker?.code === "implement_changes_missing" ||
    snapshot.blocker?.code === "implement_required",
  );
  const implementationGapOriginValue = stringValue(snapshotRecord.implementation_gap_origin);
  const implementationInFlight = implementationGap && implementationGapOriginValue === "during_agent_attempt";
  const isTerminal = typeof snapshotRecord.is_terminal === "boolean"
    ? snapshotRecord.is_terminal && !resumable
    : snapshot.status !== "running" && !resumable;
  const isRoutable = Boolean(resumable) && !implementationInFlight;
  const isReviewRequired = Boolean(
    snapshot.blocker?.code === "main_agent_proof_review_required" ||
    (checkpoint && REVIEW_CHECKPOINTS.has(checkpoint)),
  );
  const monitorShouldContinue = !isTerminal && !isReviewRequired;
  return {
    checkpoint,
    is_terminal: isTerminal,
    is_routable_checkpoint: isRoutable,
    monitor_should_continue: monitorShouldContinue,
    checkpoint_classification:
      isTerminal ? "terminal" :
        isReviewRequired ? "review_required" :
          implementationInFlight ? "in_progress" :
          isRoutable ? "routable" :
            snapshot.status === "running" ? "in_progress" :
            "blocked",
    checkpoint_disposition:
      isTerminal ? "terminal" :
        isReviewRequired ? "review_required" :
          implementationInFlight ? "implementation_in_flight" :
          implementationGap ? "retryable_implementation_gap" :
            isRoutable ? "routable" :
              snapshot.status === "running" ? "in_progress" :
                "blocked",
    suggested_next_action:
      monitorShouldContinue ? "continue_monitoring" :
        isReviewRequired ? "inspect_or_review" :
          isTerminal ? "report_terminal_status" :
            "inspect_blocker",
  };
}

export function readOpenClawRiddleProofStatus(state_path: string, options: { debug?: boolean } = {}): RiddleProofRunStatusSnapshot | null {
  const snapshot = readRiddleProofRunStatus(state_path);
  if (!snapshot) return null;
  const wrapperState = readRunState(state_path);
  const implementationAgent = summarizeImplementationAgent(wrapperState);
  const implementationGap = implementationGapOrigin(snapshot, implementationAgent);
  const checkpoint = checkpointStatus({
    ...snapshot,
    implementation_gap_origin: implementationGap,
  } as RiddleProofRunStatusSnapshot);
  const wakeTimingSummary = latestWakeTimingSummary(wrapperState);
  const monitorContract = wrapperState
    ? monitorContractFor(snapshot.status, wrapperState.request, {
        checkpoint: checkpoint.checkpoint,
        blockerCode: snapshot.blocker?.code || null,
        implementationGapOrigin: implementationGap,
      })
    : undefined;

  const engineStatePath = stringValue(wrapperState?.request.engine_state_path);
  if (!engineStatePath) {
    const recommendedPollMs = recommendedPollAfterMs(null, snapshot);
    const baseStatus = {
      ...snapshot,
      package_metadata: riddleProofPackageMetadata(),
      request_metadata: requestMetadataFor(wrapperState?.request, null),
      monitor_contract: monitorContract,
      timing_summary: mergeTimingSummary(buildTimingSummary(snapshot, wrapperState, null), wakeTimingSummary),
      recommended_poll_after_ms: recommendedPollMs,
      ...checkpoint,
      monitor_plan: statusLoopMonitorPlan(
        state_path,
        recommendedPollMs,
        waitStopCondition(monitorContract?.response_gate, checkpoint.suggested_next_action),
      ),
    } as RiddleProofRunStatusSnapshot & Record<string, unknown>;
    if (options.debug) baseStatus.debug = buildDebugPayload(wrapperState, null);
    return baseStatus;
  }

  const engineState = readJsonRecord(engineStatePath);
  const activeSubstep = recordValue(engineState?.current_runtime_step);
  const runtimeEvents = Array.isArray(engineState?.runtime_events) ? engineState.runtime_events : [];
  const engineCurrentStage = stringValue(activeSubstep?.step);
  const effectiveStage = snapshot.status === "running" && engineCurrentStage ? engineCurrentStage : snapshot.current_stage;
  const scratchCleanup = recordValue(engineState?.scratch_cleanup);
  const implementationDetection = recordValue(engineState?.implementation_detection);
  const recommendedPollMs = recommendedPollAfterMs(activeSubstep, snapshot);
  const status = {
    ...snapshot,
    package_metadata: riddleProofPackageMetadata(),
    request_metadata: requestMetadataFor(wrapperState?.request, engineState),
    monitor_contract: monitorContract,
    current_stage: effectiveStage,
    wrapper_current_stage: snapshot.current_stage ?? null,
    engine_current_stage: engineCurrentStage || null,
    engine_state_path: engineStatePath,
    active_substep: activeSubstep,
    substep_elapsed_ms: activeSubstep?.status === "running" ? elapsedMsSince(activeSubstep.started_at) : null,
    phase_elapsed_ms: activeSubstep?.phase_status === "running" ? elapsedMsSince(activeSubstep.phase_started_at) : null,
    engine_latest_event: latestRuntimeEvent(engineState),
    engine_runtime_event_count: runtimeEvents.length,
    scratch_cleanup: scratchCleanup,
    scratch_cleanup_status: scratchCleanupStatusLabel(scratchCleanup),
    implementation_status: stringValue(engineState?.implementation_status) || null,
    implementation_summary: stringValue(engineState?.implementation_summary) || null,
    implementation_detection_summary: stringValue(engineState?.implementation_detection_summary) || null,
    implementation_detection: implementationDetection,
    implementation_agent_attempt_count: implementationAgent.attempt_count,
    implementation_agent_last_event: implementationAgent.last_event,
    implementation_agent_last_outcome: implementationAgent.last_outcome,
    implementation_gap_origin: implementationGap,
    capture_hint: summarizeCaptureHint(engineState),
    timing_summary: mergeTimingSummary(buildTimingSummary(snapshot, wrapperState, engineState), wakeTimingSummary),
    recommended_poll_after_ms: recommendedPollMs,
    ...checkpoint,
    monitor_plan: statusLoopMonitorPlan(
      state_path,
      recommendedPollMs,
      waitStopCondition(monitorContract?.response_gate, checkpoint.suggested_next_action),
    ),
    wake_strategy: {
      signal: "run.wake.requested",
      recommendation:
        `For detached status-loop monitoring, poll ${RIDDLE_PROOF_STATUS_TOOL_NAME} at poll_after_ms and stop when monitor_should_continue is false. ` +
        `If ${RIDDLE_PROOF_WAIT_TOOL_NAME} is exposed, it can replace the sleep between status checks.`,
    },
  } as RiddleProofRunStatusSnapshot & Record<string, unknown>;
  if (options.debug) status.debug = buildDebugPayload(wrapperState, engineState);
  return status;
}

export async function waitOpenClawRiddleProof(params: RiddleProofWaitParams) {
  const timeoutMs = Math.max(1_000, Math.min(15 * 60 * 1000, Math.trunc(params.timeout_ms ?? 5 * 60 * 1000)));
  const startedAt = Date.now();
  let snapshot = readOpenClawRiddleProofStatus(params.state_path, { debug: params.debug === true });
  if (!snapshot) {
    return {
      ok: false,
      status: "not_found",
      state_path: params.state_path,
      message: "No readable Riddle Proof wrapper run state exists at state_path. Pass the wrapper state_path returned by riddle_proof_change, not the underlying engine state path.",
      diagnostics: statePathDiagnostics(params.state_path),
    };
  }

  let snapshotRecord = snapshot as RiddleProofRunStatusSnapshot & Record<string, unknown>;
  const initialKey = waitSnapshotKey(snapshotRecord);
  if (snapshotRecord.monitor_should_continue !== true || stringValue(snapshotRecord.suggested_next_action) !== "continue_monitoring") {
    return {
      ...snapshotRecord,
      wait_result: "already_reportable",
      waited_ms: 0,
      poll_count: 0,
    };
  }

  let pollCount = 0;
  let lastKey = initialKey;
  while (Date.now() - startedAt < timeoutMs) {
    const sleepMs = Math.max(1_000, Math.min(60_000, Math.trunc(numericValue(snapshotRecord.recommended_poll_after_ms) ?? 10_000)));
    await delay(sleepMs);
    pollCount += 1;
    const nextSnapshot = readOpenClawRiddleProofStatus(params.state_path, { debug: params.debug === true });
    if (!nextSnapshot) {
      return {
        ok: false,
        status: "not_found",
        state_path: params.state_path,
        message: "Riddle Proof wrapper run state disappeared while waiting.",
        waited_ms: Date.now() - startedAt,
        poll_count: pollCount,
      };
    }
    snapshot = nextSnapshot;
    snapshotRecord = snapshot as RiddleProofRunStatusSnapshot & Record<string, unknown>;
    const nextKey = waitSnapshotKey(snapshotRecord);
    if (snapshotRecord.monitor_should_continue !== true || stringValue(snapshotRecord.suggested_next_action) !== "continue_monitoring") {
      return {
        ...snapshotRecord,
        wait_result: "reportable_state",
        waited_ms: Date.now() - startedAt,
        poll_count: pollCount,
      };
    }
    if (nextKey !== lastKey) {
      lastKey = nextKey;
      continue;
    }
  }

  return {
    ...snapshotRecord,
    wait_result: "timeout",
    waited_ms: Date.now() - startedAt,
    poll_count: pollCount,
  };
}

function readRunState(statePath: string): RiddleProofRunState | null {
  if (!statePath || !existsSync(statePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf-8"));
    return parsed?.version === "riddle-proof.run-state.v1" && Array.isArray(parsed.events)
      ? parsed as RiddleProofRunState
      : null;
  } catch {
    return null;
  }
}

function statePathDiagnostics(statePath: string) {
  const diagnostics: Record<string, unknown> = {
    path_exists: false,
    expected_state_path_type: "wrapper_run_state",
  };
  if (!statePath || !existsSync(statePath)) return diagnostics;

  diagnostics.path_exists = true;
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf-8"));
    const record = recordValue(parsed);
    const version = stringValue(record?.version);
    diagnostics.path_version = version || null;
    diagnostics.is_wrapper_run_state = version === "riddle-proof.run-state.v1" && Array.isArray(record?.events);
    diagnostics.looks_like_engine_state = !diagnostics.is_wrapper_run_state && (
      Array.isArray(record?.runtime_events) ||
      Boolean(record?.repo && record?.stage) ||
      Boolean(record?.run_id && record?.status)
    );
    const request = recordValue(record?.request);
    const wrapperPath =
      stringValue(record?.harness_state_path) ||
      stringValue(request?.harness_state_path) ||
      stringValue(record?.wrapper_state_path);
    if (wrapperPath) diagnostics.wrapper_state_path = wrapperPath;
  } catch (error) {
    diagnostics.parse_error = error instanceof Error ? error.message : String(error);
  }
  return diagnostics;
}

function readJsonRecord(statePath: string): Record<string, unknown> | null {
  if (!statePath || !existsSync(statePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf-8"));
    return recordValue(parsed);
  } catch {
    return null;
  }
}

function stageForReviewDecision(decision: RiddleProofReviewParams["decision"]) {
  if (decision === "ready_to_ship") return "ship";
  if (decision === "needs_implementation") return "implement";
  if (decision === "needs_recon") return "recon";
  return "author";
}

export function inspectOpenClawRiddleProof(params: RiddleProofInspectParams) {
  const state = readRunState(params.state_path);
  if (!state) {
    return {
      ok: false,
      status: "not_found",
      state_path: params.state_path,
      message: "No readable Riddle Proof wrapper run state exists at state_path. Pass the wrapper state_path returned by riddle_proof_change, not the underlying engine state path.",
      diagnostics: statePathDiagnostics(params.state_path),
    };
  }

  const engineStatePath = state.request.engine_state_path;
  const engineState = engineStatePath ? readJsonRecord(engineStatePath) : null;
  if (!engineState) {
    return {
      ok: false,
      status: "not_found",
      state_path: params.state_path,
      engine_state_path: engineStatePath || null,
      message: "No readable Riddle Proof engine state exists for this wrapper run.",
      diagnostics: engineStatePath ? statePathDiagnostics(engineStatePath) : null,
    };
  }

  return buildProofInspection(state, engineState, state.last_checkpoint, { debug: params.debug === true });
}

export async function submitOpenClawRiddleProofReview(
  params: RiddleProofReviewParams,
  config: OpenClawRiddleProofRuntimeConfig = {},
): Promise<RiddleProofRunResult> {
  if (config.executionMode !== "engine") {
    const request = createRunState({ request: {} });
    request.blocker = {
      code: "execution_adapter_not_configured",
      message: "Riddle Proof review submission requires executionMode=engine.",
      details: { state_path: params.state_path },
    };
    return createRunResult({ state: request, status: "blocked", last_summary: request.blocker.message });
  }

  const state = readRunState(params.state_path);
  if (!state) {
    const request = createRunState({ request: {} });
    request.blocker = {
      code: "riddle_proof_run_state_not_found",
      message: "No readable Riddle Proof wrapper run state exists at state_path.",
      details: { state_path: params.state_path },
    };
    return createRunResult({ state: request, status: "blocked", last_summary: request.blocker.message });
  }

  const engineStatePath = state.request.engine_state_path;
  if (!engineStatePath) {
    state.blocker = {
      code: "riddle_proof_engine_state_missing",
      message: "The wrapper run state does not include an engine_state_path to resume.",
      details: { state_path: params.state_path },
    };
    return createRunResult({ state, status: "blocked", last_summary: state.blocker.message });
  }

  const stage = params.continue_with_stage || params.recommended_stage || stageForReviewDecision(params.decision);
  const assessment = {
    decision: params.decision,
    summary: params.summary,
    recommended_stage: params.recommended_stage || stage,
    continue_with_stage: params.continue_with_stage || stage,
    escalation_target: params.escalation_target || "agent",
    reasons: Array.isArray(params.reasons) ? params.reasons.filter((item): item is string => typeof item === "string") : [],
    source: "supervising_agent",
  };
  if (effectiveShipMode(state.request, config) !== "ship" && stage === "ship") {
    appendRunEvent(state, {
      kind: "agent.proof_assessment.completed",
      checkpoint: state.last_checkpoint || "verify_supervisor_judgment",
      stage: "verify",
      summary: params.summary,
      details: { payload: assessment },
    });
    state.current_stage = "verify";
    state.proof_decision = "ready_to_ship";
    state.merge_recommendation = "ready_to_ship (supervising-agent proof assessment)";
    state.finalized = true;
    setRunStatus(state, "ready_to_ship");
    persistRunState(state);
    return createRunResult({
      state,
      status: "ready_to_ship",
      last_summary: params.summary,
      raw: {
        ship_held: true,
        engine_state_path: engineStatePath,
        proof_assessment: assessment,
      },
    });
  }
  const resumeParams: RiddleProofWorkflowParams = {
    action: "run",
    state_path: engineStatePath,
    continue_from_checkpoint: true,
    proof_assessment_json: JSON.stringify(assessment),
  };

  return runRiddleProofEngineHarness({
    request: {
      ...state.request,
      harness_state_path: params.state_path,
      engine_state_path: engineStatePath,
    },
    state,
    state_path: params.state_path,
    resume_params: resumeParams,
    max_iterations: effectiveMaxIterations(state.request, config),
    dry_run: state.request.dry_run,
    auto_approve: state.request.auto_approve,
    engine: config.engine,
    agent: agentFromConfig(config),
    config: effectiveHarnessConfig(config),
  });
}

export async function syncOpenClawRiddleProof(
  params: RiddleProofSyncParams,
  config: OpenClawRiddleProofRuntimeConfig = {},
): Promise<RiddleProofRunResult> {
  if (config.executionMode !== "engine") {
    const request = createRunState({ request: {} });
    request.blocker = {
      code: "execution_adapter_not_configured",
      message: "Riddle Proof PR sync requires executionMode=engine.",
      details: { state_path: params.state_path },
    };
    return createRunResult({ state: request, status: "blocked", last_summary: request.blocker.message });
  }

  const state = readRunState(params.state_path);
  if (!state) {
    const request = createRunState({ request: {} });
    request.blocker = {
      code: "riddle_proof_run_state_not_found",
      message: "No readable Riddle Proof wrapper run state exists at state_path.",
      details: { state_path: params.state_path },
    };
    return createRunResult({ state: request, status: "blocked", last_summary: request.blocker.message });
  }

  const engineStatePath = state.request.engine_state_path;
  if (!engineStatePath) {
    state.blocker = {
      code: "riddle_proof_engine_state_missing",
      message: "The wrapper run state does not include an engine_state_path to sync.",
      details: { state_path: params.state_path },
    };
    return createRunResult({ state, status: "blocked", last_summary: state.blocker.message });
  }

  const resumeParams: RiddleProofWorkflowParams = {
    action: "sync",
    state_path: engineStatePath,
    cleanup_merged_pr: params.cleanup !== false,
    fetch_base: params.fetch_base !== false,
    update_base_checkout: params.update_base_checkout !== false,
  };

  return runRiddleProofEngineHarness({
    request: {
      ...state.request,
      harness_state_path: params.state_path,
      engine_state_path: engineStatePath,
    },
    state,
    state_path: params.state_path,
    resume_params: resumeParams,
    max_iterations: 1,
    dry_run: state.request.dry_run,
    auto_approve: state.request.auto_approve,
    engine: config.engine,
    agent: agentFromConfig(config),
    config: effectiveHarnessConfig(config),
  });
}

const optionalString = (description: string) => Type.Optional(Type.String({ description }));
const optionalBoolean = (description: string) => Type.Optional(Type.Boolean({ description }));

export const riddleProofChangeParameters = Type.Object({
  repo: optionalString("Repository to change, such as owner/repo or a local repository path."),
  branch: optionalString("Working branch name to use or create."),
  change_request: Type.String({ description: "Plain-language change request for the coding agent." }),
  commit_message: optionalString("Preferred commit message for the agent-authored change."),
  prod_url: optionalString("Production URL or baseline URL for proof capture."),
  capture_script: optionalString("Capture script or instructions for gathering proof evidence."),
  success_criteria: optionalString("Criteria the proof evidence must satisfy."),
  assertions_json: optionalString("Optional JSON assertions string. Non-JSON text is preserved as a string assertion."),
  verification_mode: optionalString("Proof type, such as visual, interaction, data, json, audio, logs, or metrics."),
  reference: optionalString("Baseline reference source. Valid values are prod, before, or both; other text is ignored as a baseline selector and preserved as metadata."),
  base_branch: optionalString("Base branch for comparison or pull request targeting."),
  before_ref: optionalString("Explicit before ref for comparison."),
  allow_static_preview_fallback: optionalBoolean("Allow static preview fallback when the requested server path fails."),
  context: optionalString("Additional context for the change."),
  reviewer: optionalString("Reviewer or review target."),
  mode: optionalString("Compatibility mode carried through to the implementation adapter."),
  build_command: optionalString("Build command for the changed project."),
  build_output: optionalString("Expected build output directory."),
  server_image: optionalString("Container image for server-based preview."),
  server_command: optionalString("Server start command for preview."),
  server_port: Type.Optional(Type.Number({ description: "Server port for preview." })),
  server_path: optionalString("Server path to request during preview capture."),
  use_auth: optionalBoolean("Whether proof capture should use an environment-specific configured auth helper."),
  auth_localStorage_json: optionalString("JSON object of localStorage entries to inject for authenticated proof runs."),
  auth_cookies_json: optionalString("JSON object or array of cookies to inject for authenticated proof runs."),
  auth_headers_json: optionalString("JSON object of request headers to use for authenticated proof runs."),
  color_scheme: optionalString("Preferred color scheme for capture."),
  wait_for_selector: optionalString("Selector to wait for before capture."),
  ship_after_verify: optionalBoolean("Compatibility flag that maps to ship_mode=ship."),
  ship_mode: Type.Optional(Type.Union([
    Type.Literal("none"),
    Type.Literal("ship"),
  ], { description: "Whether to ship after verification." })),
  run_mode: Type.Optional(Type.Union([
    Type.Literal("blocking"),
    Type.Literal("background"),
  ], {
    description:
      "background returns an accepted run state immediately so chat surfaces can watch status instead of holding one long reply open. This is the default; use blocking only for synchronous debug runs.",
  })),
  background: optionalBoolean("Compatibility shortcut for run_mode=background."),
  report_mode: Type.Optional(Type.Union([
    Type.Literal("checkpoint"),
    Type.Literal("terminal_only"),
  ], {
    description:
      "checkpoint allows partial/progress reports at meaningful checkpoints; terminal_only tells wrappers and monitors to hold replies until terminal state.",
  })),
  wait_for_terminal: optionalBoolean("Compatibility shortcut for report_mode=terminal_only."),
  leave_draft: optionalBoolean("Opt-in escape hatch: keep the PR as draft after proof and CI instead of marking it ready."),
  state_path: optionalString("Existing underlying Riddle Proof engine state path to resume."),
  harness_state_path: optionalString("Existing Riddle Proof wrapper run state path to resume."),
  max_iterations: Type.Optional(Type.Number({ description: "Maximum engine/checkpoint iterations before returning a blocker." })),
  auto_approve: optionalBoolean("Pass through Riddle Proof approval gates where supported."),
  dry_run: optionalBoolean("Stop at the first checkpoint and return a concrete blocker instead of applying agent output."),
  discord_channel: optionalString("Discord channel id for notifications or thread context."),
  discord_thread_id: optionalString("Discord thread id for notifications or thread context."),
  discord_message_id: optionalString("Discord source message id."),
  discord_source_url: optionalString("Discord source message URL."),
});

export const riddleProofStatusParameters = Type.Object({
  state_path: Type.String({ description: "Riddle Proof wrapper run state path returned by riddle_proof_change." }),
  debug: optionalBoolean("When true, include recent wrapper/runtime events and diagnostics for debugging slow or stuck runs."),
});

export const riddleProofWaitParameters = Type.Object({
  state_path: Type.String({ description: "Riddle Proof wrapper run state path returned by riddle_proof_change." }),
  timeout_ms: Type.Optional(Type.Number({ description: "Maximum wait time before returning the latest snapshot. Defaults to 300000." })),
  debug: optionalBoolean("When true, include recent wrapper/runtime events and diagnostics in the returned snapshot."),
});

export const riddleProofInspectParameters = Type.Object({
  state_path: Type.String({ description: "Riddle Proof wrapper run state path returned by riddle_proof_change." }),
  debug: optionalBoolean("When true, include recent wrapper/runtime events and diagnostics for debugging slow or ambiguous proof packets."),
});

export const riddleProofSyncParameters = Type.Object({
  state_path: Type.String({ description: "Riddle Proof wrapper run state path returned by riddle_proof_change." }),
  cleanup: optionalBoolean("When true, prune proof worktrees and temporary proof branches after the PR is merged. Defaults to true."),
  fetch_base: optionalBoolean("When true, fetch the PR base branch after a merge so later runs start from fresh origin/<base>. Defaults to true."),
  update_base_checkout: optionalBoolean("When true, safely fast-forward the clean local base checkout after merge. Defaults to true."),
});

export const riddleProofReviewParameters = Type.Object({
  state_path: Type.String({ description: "Riddle Proof wrapper run state path returned by riddle_proof_change." }),
  decision: Type.Union([
    Type.Literal("ready_to_ship"),
    Type.Literal("needs_richer_proof"),
    Type.Literal("revise_capture"),
    Type.Literal("needs_recon"),
    Type.Literal("needs_implementation"),
  ], { description: "Main-agent proof judgment." }),
  summary: Type.String({ description: "Concrete visual or evidence-based judgment." }),
  recommended_stage: Type.Optional(Type.Union([
    Type.Literal("ship"),
    Type.Literal("author"),
    Type.Literal("implement"),
    Type.Literal("recon"),
    Type.Literal("verify"),
  ])),
  continue_with_stage: Type.Optional(Type.Union([
    Type.Literal("ship"),
    Type.Literal("author"),
    Type.Literal("implement"),
    Type.Literal("recon"),
    Type.Literal("verify"),
  ])),
  escalation_target: Type.Optional(Type.Union([
    Type.Literal("agent"),
    Type.Literal("human"),
  ])),
  reasons: Type.Optional(Type.Array(Type.String())),
});

export default function register(api: any) {
  const runtimeConfig = runtimeConfigFrom(api);

  api.registerTool(
    {
      name: RIDDLE_PROOF_CHANGE_TOOL_NAME,
      description:
        "Run or normalize an OpenClaw proofed-change request through the Riddle Proof run contract. " +
        "By default this wrapper returns a blocked normalization result; engine mode is configured explicitly.",
      parameters: riddleProofChangeParameters,
      async execute(_id: string, params: RiddleProofChangeParams) {
        const result = await runOpenClawRiddleProof(params, runtimeConfig);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: RIDDLE_PROOF_STATUS_TOOL_NAME,
      description:
        `Return a cheap status snapshot for a Riddle Proof wrapper run state path. ` +
        `For monitoring loops, prefer ${RIDDLE_PROOF_WAIT_TOOL_NAME} when available; ` +
        `otherwise poll status and stop when monitor_should_continue is false.`,
      parameters: riddleProofStatusParameters,
      async execute(_id: string, params: RiddleProofStatusParams) {
        const snapshot = readOpenClawRiddleProofStatus(params.state_path, { debug: params.debug === true });
        const result = snapshot || {
          ok: false,
          status: "not_found",
          state_path: params.state_path,
          message: "No readable Riddle Proof wrapper run state exists at state_path. Pass the wrapper state_path returned by riddle_proof_change, not the underlying engine state path.",
          diagnostics: statePathDiagnostics(params.state_path),
        };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: RIDDLE_PROOF_WAIT_TOOL_NAME,
      description:
        "Wait for the next reportable Riddle Proof status instead of manual sleep loops. Uses the wrapper's own monitor contract and recommended poll cadence.",
      parameters: riddleProofWaitParameters,
      async execute(_id: string, params: RiddleProofWaitParams) {
        const result = await waitOpenClawRiddleProof(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: RIDDLE_PROOF_INSPECT_TOOL_NAME,
      description:
        "Return a compact proof inspection packet for review: route match, profile use, artifacts, visual delta, semantic anchors, and visible text samples.",
      parameters: riddleProofInspectParameters,
      async execute(_id: string, params: RiddleProofInspectParams) {
        const result = inspectOpenClawRiddleProof(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: RIDDLE_PROOF_SYNC_TOOL_NAME,
      description:
        "Synchronize a shipped Riddle Proof run after PR review or merge. Checks the PR lifecycle, updates run state, and cleans proof worktrees after merge.",
      parameters: riddleProofSyncParameters,
      async execute(_id: string, params: RiddleProofSyncParams) {
        const result = await syncOpenClawRiddleProof(params, runtimeConfig);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: RIDDLE_PROOF_REVIEW_TOOL_NAME,
      description:
        "Submit a main-agent proof judgment for a Riddle Proof run that blocked at main_agent_proof_review_required, then resume the workflow.",
      parameters: riddleProofReviewParameters,
      async execute(_id: string, params: RiddleProofReviewParams) {
        const result = await submitOpenClawRiddleProofReview(params, runtimeConfig);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    },
    { optional: true },
  );
}

if (!isMainThread) {
  const data = workerData as BackgroundWorkerData | undefined;
  if (data?.kind === "openclaw-riddle-proof-background") {
    void runBackgroundWorkerJob(data).then((result) => {
      parentPort?.postMessage({
        ok: true,
        status: result.status,
        state_path: result.state_path,
      });
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      markBackgroundWorkerFailed(data.state_path, message);
      parentPort?.postMessage({ ok: false, error: message, state_path: data.state_path });
    });
  }
}
