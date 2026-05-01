import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type WorkflowAction = "setup" | "recon" | "author" | "implement" | "verify" | "ship" | "status" | "sync" | "run";
export type WorkflowStage = Exclude<WorkflowAction, "status" | "sync" | "run">;
export const WORKFLOW_STAGE_ORDER: WorkflowStage[] = ["setup", "recon", "author", "implement", "verify", "ship"];

export interface WorkflowParams {
  action: WorkflowAction;
  repo?: string;
  branch?: string;
  change_request?: string;
  commit_message?: string;
  prod_url?: string;
  capture_script?: string;
  success_criteria?: string;
  assertions?: unknown;
  assertions_json?: string;
  verification_mode?: string;
  resume_session?: string;
  target_image_url?: string;
  target_image_hash?: string;
  viewport_matrix?: unknown;
  viewport_matrix_json?: string;
  deterministic_setup?: unknown;
  deterministic_setup_json?: string;
  reference?: "prod" | "before" | "both";
  base_branch?: string;
  before_ref?: string;
  allow_static_preview_fallback?: boolean;
  context?: string;
  reviewer?: string;
  mode?: "server" | "static";
  build_command?: string;
  build_output?: string;
  server_image?: string;
  server_command?: string;
  server_port?: number;
  server_path?: string;
  use_auth?: boolean;
  auth_localStorage_json?: string;
  auth_cookies_json?: string;
  auth_headers_json?: string;
  color_scheme?: "dark" | "light";
  wait_for_selector?: string;
  discord_channel?: string;
  discord_thread_id?: string;
  discord_message_id?: string;
  discord_source_url?: string;
  recon_assessment_json?: string;
  proof_plan?: string;
  author_packet_json?: string;
  implementation_notes?: string;
  proof_assessment_json?: string;
  state_path?: string;
  auto_approve?: boolean;
  continue_from_checkpoint?: boolean;
  ship_after_verify?: boolean;
  leave_draft?: boolean;
  cleanup_merged_pr?: boolean;
  fetch_base?: boolean;
  update_base_checkout?: boolean;
  advance_stage?: WorkflowStage;
}

export interface PluginConfig {
  riddleProofDir?: string;
  statePath?: string;
  defaultReviewer?: string;
}

export const CHECKPOINT_CONTRACT_VERSION = "riddle-proof-run.checkpoint.v1";
function currentDistDir() {
  const meta = typeof import.meta === "object" ? import.meta as { url?: string } : {};
  if (typeof meta.url === "string" && meta.url) {
    return path.dirname(fileURLToPath(meta.url));
  }
  if (typeof __dirname === "string") return __dirname;
  return process.cwd();
}

export const BUNDLED_RIDDLE_PROOF_DIR = path.resolve(
  currentDistDir(),
  "..",
  "runtime",
);
export const RIDDLE_PROOF_DIR_CANDIDATES = [
  BUNDLED_RIDDLE_PROOF_DIR,
];

export interface CheckpointInputContract {
  name: string;
  type: "json" | "string" | "boolean" | "external_action";
  required?: boolean;
  description: string;
}

export interface ShipGateValidation {
  ok: boolean;
  reasons: string[];
  required_baselines: string[];
  evidence: {
    reference: string;
    verification_mode: string | null;
    prod_url: string | null;
    before_cdn: string | null;
    prod_cdn: string | null;
    after_cdn: string | null;
    verify_status: string | null;
    proof_assessment_decision: string | null;
    proof_assessment_source: string | null;
    visual_delta_required: boolean;
    visual_delta_status: string | null;
    visual_delta_passed: boolean | null;
  };
}

function createWorkflowStatePath() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `/tmp/riddle-proof-state-${stamp}-${randomUUID().slice(0, 8)}.json`;
}

function argsPathForStatePath(statePath: string) {
  const base = path.basename(statePath);
  if (base.startsWith("riddle-proof-state")) {
    return path.join(path.dirname(statePath), base.replace("riddle-proof-state", "riddle-proof-args"));
  }
  return path.join(path.dirname(statePath), `${base}.args.json`);
}

function isRiddleProofSkillDir(candidate: string) {
  return existsSync(workflowFile(candidate, "setup"));
}

export function resolveRiddleProofDir(config: PluginConfig = {}) {
  if (config.riddleProofDir) return config.riddleProofDir;

  const candidates = [
    process.env.RIDDLE_PROOF_DIR,
    ...RIDDLE_PROOF_DIR_CANDIDATES,
  ].filter((candidate): candidate is string => Boolean(candidate));

  return (
    candidates.find(isRiddleProofSkillDir)
    || candidates.find((candidate) => existsSync(candidate))
    || RIDDLE_PROOF_DIR_CANDIDATES[0]
  );
}

export function resolveConfig(config: PluginConfig = {}, params: Partial<Pick<WorkflowParams, "action" | "state_path">> = {}) {
  const configuredStatePath = config.statePath || "";
  const shouldIsolateWorkflow =
    !params.state_path &&
    !configuredStatePath &&
    (params.action === "setup" || params.action === "run");
  const statePath = params.state_path || (shouldIsolateWorkflow ? createWorkflowStatePath() : configuredStatePath || "/tmp/riddle-proof-state.json");
  return {
    riddleProofDir: resolveRiddleProofDir(config),
    statePath,
    argsPath: argsPathForStatePath(statePath),
    defaultReviewer: config.defaultReviewer || "davisdiehl",
  };
}

export function ensureAction(action: string): WorkflowAction {
  if (["setup", "recon", "author", "implement", "verify", "ship", "status", "sync", "run"].includes(action)) {
    return action as WorkflowAction;
  }
  throw new Error(`Unsupported action: ${action}`);
}

export function workflowFile(riddleProofDir: string, action: WorkflowStage) {
  return path.join(riddleProofDir, "pipelines", `riddle-proof-${action}.lobster`);
}

function asJsonString(value: unknown) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function buildSetupArgs(params: WorkflowParams, config: ReturnType<typeof resolveConfig>) {
  if (!params.repo) throw new Error("repo is required for setup/run");
  if (!params.change_request) throw new Error("change_request is required for setup/run");
  const commitMessage = (params.commit_message || params.change_request || "").trim();
  const captureScript = (params.capture_script || "").trim();
  const requestedReference = params.reference || (params.prod_url ? "both" : "before");
  if (!commitMessage) throw new Error("commit_message is required for setup/run");
  return {
    repo: params.repo,
    branch: params.branch || "",
    change_request: params.change_request,
    commit_message: commitMessage,
    prod_url: params.prod_url || "",
    capture_script: captureScript,
    success_criteria: params.success_criteria || "",
    assertions_json: params.assertions_json || asJsonString(params.assertions),
    verification_mode: params.verification_mode || "proof",
    resume_session: params.resume_session || "",
    target_image_url: params.target_image_url || "",
    target_image_hash: params.target_image_hash || "",
    viewport_matrix_json: params.viewport_matrix_json || asJsonString(params.viewport_matrix),
    deterministic_setup_json: params.deterministic_setup_json || asJsonString(params.deterministic_setup),
    reference: requestedReference,
    base_branch: params.base_branch || "main",
    before_ref: params.before_ref || "",
    allow_static_preview_fallback: params.allow_static_preview_fallback ? "true" : "",
    context: params.context || "",
    reviewer: params.reviewer || config.defaultReviewer,
    mode: params.mode || "",
    build_command: params.build_command || "npm run build",
    build_output: params.build_output || "build",
    server_image: params.server_image || "node:20-slim",
    server_command: params.server_command || "npm start",
    server_port: String(params.server_port || 3000),
    server_path: params.server_path || "",
    server_path_source: params.server_path ? "user" : "",
    use_auth: params.use_auth ? "true" : "",
    auth_localStorage_json: params.auth_localStorage_json || "",
    auth_cookies_json: params.auth_cookies_json || "",
    auth_headers_json: params.auth_headers_json || "",
    color_scheme: params.color_scheme || "",
    wait_for_selector: params.wait_for_selector || "",
    discord_channel: params.discord_channel || "",
    discord_thread_id: params.discord_thread_id || "",
    discord_message_id: params.discord_message_id || "",
    discord_source_url: params.discord_source_url || "",
    leave_draft: params.leave_draft ? "true" : "",
  };
}

export function readState(statePath: string) {
  if (!existsSync(statePath)) {
    return null;
  }
  return JSON.parse(readFileSync(statePath, "utf-8"));
}

export function writeState(statePath: string, state: Record<string, unknown>) {
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function normalizeOptionalString(value?: string) {
  return typeof value === "string" ? value.trim() : undefined;
}

function knownEnvironmentIssuesFromNotes(notes: string) {
  const text = notes.toLowerCase();
  const issues: Array<Record<string, string>> = [];
  if (
    (text.includes("erofs") || text.includes("read-only file system")) &&
    text.includes("node_modules") &&
    (text.includes(".vite-temp") || text.includes("vite.config"))
  ) {
    issues.push({
      code: "vite_temp_config_erofs",
      source: "implementation_notes",
      severity: "environment",
      summary: "Focused build verification hit the known Vite temp-config EROFS issue in shared node_modules.",
    });
  }
  return issues;
}

function guardProofEvidenceGlobalAssignments(script: string) {
  return script.replace(
    /^(\s*)(globalThis|window|self)\.__riddleProofEvidence\s*=\s*([^;\n]+);\s*$/gm,
    (_match, indent: string, root: string, expression: string) =>
      `${indent}try { if (typeof ${root} !== "undefined" && ${root}) ${root}.__riddleProofEvidence = ${expression.trim()}; } catch {}`,
  );
}

function normalizeCaptureScript(value?: string) {
  const script = normalizeOptionalString(value) || "";
  return script ? guardProofEvidenceGlobalAssignments(script) : "";
}

function appendProofSummaryLine(state: any, line: string) {
  const text = String(line || "").trim();
  if (!text) return;
  const existing = typeof state.proof_summary === "string" ? state.proof_summary.trim() : "";
  if (existing.includes(text)) return;
  state.proof_summary = existing ? `${existing}\n${text}` : text;
}

function hasAuthoredProofPlan(state: any = {}) {
  return Boolean((state?.proof_plan || "").trim()) && Boolean((state?.capture_script || "").trim());
}

function syncAuthoringState(state: any = {}) {
  const reconReady = ["ready_for_proof_plan", "completed"].includes(state?.recon_status || "");
  const reconBlocked = ["needs_agent_decision", "needs_supervisor_judgment"].includes(state?.recon_status || "");
  const reconExhausted = state?.recon_status === "exhausted";

  if (reconBlocked) {
    state.author_status = "needs_recon_judgment";
  } else if (reconExhausted) {
    state.author_status = "recon_exhausted";
  } else if (!reconReady) {
    state.author_status = state.author_status || "pending_recon";
  } else if (state.author_status === "ready" || state.proof_plan_status === "ready") {
    state.author_status = "ready";
  } else {
    state.author_status = "needs_authoring";
  }

  if (reconBlocked) {
    state.proof_plan_status = "needs_recon_judgment";
  } else if (reconExhausted) {
    state.proof_plan_status = "recon_exhausted";
  } else if (state.author_status === "ready" || state.proof_plan_status === "ready") {
    state.proof_plan_status = "ready";
  } else if (reconReady) {
    state.proof_plan_status = "needs_authoring";
  } else {
    state.proof_plan_status = state.proof_plan_status || "pending_recon";
  }

  state.author_request = state.author_request || {};
  state.author_summary = state.author_summary || "";
  return state;
}

export function ensureStageLoopState(state: any = {}) {
  if (!state || typeof state !== "object") return state;
  syncAuthoringState(state);
  state.explicit_stage_gate = true;
  state.stage_attempts = state.stage_attempts || {};
  for (const stage of WORKFLOW_STAGE_ORDER) {
    const current = state.stage_attempts[stage] || {};
    state.stage_attempts[stage] = {
      count: Number(current.count || 0),
      last_status: current.last_status || null,
      last_checkpoint: current.last_checkpoint || null,
      last_summary: current.last_summary || null,
      last_attempted_at: current.last_attempted_at || null,
      history: Array.isArray(current.history) ? current.history : [],
    };
  }
  state.stage_decision_request = state.stage_decision_request || {};
  state.active_checkpoint = state.active_checkpoint || null;
  state.active_checkpoint_stage = state.active_checkpoint_stage || null;
  state.last_requested_advance_stage = state.last_requested_advance_stage || null;
  return state;
}

export function clearStageDecisionRequest(state: any = {}) {
  ensureStageLoopState(state);
  state.stage_decision_request = {};
  state.active_checkpoint = null;
  state.active_checkpoint_stage = null;
  return state;
}

export function recordStageAttempt(
  state: any,
  stage: WorkflowStage,
  entry: {
    status?: string;
    checkpoint?: string | null;
    summary?: string | null;
    requestedAdvanceStage?: WorkflowStage | null;
    haltedForApproval?: boolean;
    autoApproved?: boolean;
    retryable?: boolean;
    checkpointDisposition?: string | null;
    error?: string | null;
    details?: Record<string, unknown>;
  } = {},
) {
  ensureStageLoopState(state);
  const bucket = state.stage_attempts[stage];
  const attemptNumber = Number(bucket.count || 0) + 1;
  const item = {
    attempt: attemptNumber,
    stage,
    status: entry.status || "completed",
    checkpoint: entry.checkpoint || null,
    summary: entry.summary || null,
    requested_advance_stage: entry.requestedAdvanceStage || null,
    halted_for_approval: Boolean(entry.haltedForApproval),
    auto_approved: Boolean(entry.autoApproved),
    retryable: Boolean(entry.retryable),
    checkpoint_disposition: entry.checkpointDisposition || null,
    error: entry.error || null,
    details: entry.details || {},
    attempted_at: new Date().toISOString(),
  };
  bucket.count = attemptNumber;
  bucket.last_status = item.status;
  bucket.last_checkpoint = item.checkpoint;
  bucket.last_summary = item.summary;
  bucket.last_attempted_at = item.attempted_at;
  bucket.history = [...bucket.history, item].slice(-25);
  state.stage_attempts[stage] = bucket;
  state.last_requested_advance_stage = entry.requestedAdvanceStage || state.last_requested_advance_stage || null;
  return item;
}

export function setStageDecisionRequest(
  state: any,
  request: {
    stage: WorkflowStage;
    checkpoint: string;
    summary: string;
    nextActions?: string[];
    advanceOptions?: WorkflowStage[];
    recommendedAdvanceStage?: WorkflowStage | null;
    continueWithStage?: WorkflowStage | null;
    blocking?: boolean;
    details?: Record<string, unknown>;
    checkpointContract?: Record<string, unknown>;
  },
) {
  ensureStageLoopState(state);
  const continueWithStage = request.continueWithStage || request.recommendedAdvanceStage || null;
  state.active_checkpoint = request.checkpoint;
  state.active_checkpoint_stage = request.stage;
  state.stage_decision_request = {
    stage: request.stage,
    checkpoint: request.checkpoint,
    summary: request.summary,
    next_actions: request.nextActions || [],
    advance_options: request.advanceOptions || [],
    recommended_advance_stage: request.recommendedAdvanceStage || null,
    continue_from_checkpoint: Boolean(continueWithStage),
    continue_with_stage: continueWithStage,
    blocking: Boolean(request.blocking),
    details: request.details || {},
    checkpoint_contract: request.checkpointContract || null,
    updated_at: new Date().toISOString(),
  };
  return state.stage_decision_request;
}

export function checkpointContinueStage(state: any): WorkflowStage | null {
  ensureStageLoopState(state);
  const stage = state?.stage_decision_request?.continue_with_stage || state?.stage_decision_request?.recommended_advance_stage || null;
  return WORKFLOW_STAGE_ORDER.includes(stage) ? (stage as WorkflowStage) : null;
}

export function invalidateVerifyEvidence(state: any = {}) {
  if (!state || typeof state !== "object") {
    return { invalidated: false };
  }

  const hadAfterCdn = typeof state.after_cdn === "string" && state.after_cdn.trim().length > 0;
  const hadVerifyResults = Boolean(state.verify_results && Object.keys(state.verify_results).length > 0);
  const hadMergeRecommendation = typeof state.merge_recommendation === "string" && state.merge_recommendation.trim().length > 0;
  const hadProofSummary = typeof state.proof_summary === "string" && state.proof_summary.trim().length > 0;
  const hadVerifyStatus = typeof state.verify_status === "string" && state.verify_status.trim().length > 0;
  const hadVerifySummary = typeof state.verify_summary === "string" && state.verify_summary.trim().length > 0;
  const hadVerifyDecisionRequest = Boolean(state.verify_decision_request && Object.keys(state.verify_decision_request).length > 0);
  const hadEvidenceNotes = Array.isArray(state.evidence_notes) && state.evidence_notes.length > 0;
  const hadProofAssessment = Boolean(state.proof_assessment && Object.keys(state.proof_assessment).length > 0);
  const hadProofAssessmentRequest = Boolean(state.proof_assessment_request && Object.keys(state.proof_assessment_request).length > 0);
  const invalidated = hadAfterCdn || hadVerifyResults || hadMergeRecommendation || hadProofSummary || hadVerifyStatus || hadVerifySummary || hadVerifyDecisionRequest || hadEvidenceNotes || hadProofAssessment || hadProofAssessmentRequest;

  if (invalidated) {
    state.after_cdn = "";
    state.verify_results = {};
    state.verify_status = "";
    state.verify_summary = "";
    state.verify_decision_request = {};
    state.merge_recommendation = null;
    state.proof_summary = "";
    state.evidence_notes = [];
    state.proof_assessment = {};
    state.proof_assessment_source = null;
    state.proof_assessment_request = {};
  }

  return {
    invalidated,
    hadAfterCdn,
    hadVerifyResults,
    hadMergeRecommendation,
    hadProofSummary,
    hadVerifyStatus,
    hadVerifySummary,
    hadVerifyDecisionRequest,
    hadEvidenceNotes,
    hadProofAssessment,
    hadProofAssessmentRequest,
  };
}

function normalizedReference(state: any = {}) {
  const reference = String(state?.requested_reference || state?.reference || "before").trim();
  return reference || "before";
}

function normalizedProofAssessment(state: any = {}) {
  const proofAssessment = state?.proof_assessment || {};
  const source = String(proofAssessment?.source || state?.proof_assessment_source || "").trim().toLowerCase();
  const decision = String(proofAssessment?.decision || "").trim();
  return {
    decision: decision || null,
    source: source || null,
  };
}

const VISUAL_FIRST_MODES = new Set([
  "visual",
  "render",
  "interaction",
  "ui",
  "layout",
  "screenshot",
  "canvas",
  "animation",
]);

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function normalizedVerificationMode(state: any = {}) {
  const bundle = objectValue(state?.evidence_bundle);
  const bundleMode = String(bundle.verification_mode || "").trim().toLowerCase();
  if (bundleMode) return bundleMode;
  return String(state?.verification_mode || "proof").trim().toLowerCase() || "proof";
}

export function visualDeltaRequiredForState(state: any = {}) {
  const bundle = objectValue(state?.evidence_bundle);
  const contract = objectValue(bundle.artifact_contract);
  const required = objectValue(contract.required);
  return required.visual_delta === true || VISUAL_FIRST_MODES.has(normalizedVerificationMode(state));
}

export function visualDeltaForState(state: any = {}) {
  const bundle = objectValue(state?.evidence_bundle);
  const after = objectValue(bundle.after);
  const afterDelta = objectValue(after.visual_delta);
  if (Object.keys(afterDelta).length) return afterDelta;
  const request = objectValue(state?.proof_assessment_request);
  return objectValue(request.visual_delta);
}

export function visualDeltaShipGateReason(state: any = {}) {
  if (!visualDeltaRequiredForState(state)) return null;
  const visualDelta = visualDeltaForState(state);
  if (visualDelta.status === "measured" && visualDelta.passed === true) return null;
  const status = String(visualDelta.status || "missing");
  if (status === "unmeasured") {
    return "visual_delta.status=unmeasured blocks ready_to_ship for visual/UI proof";
  }
  if (status === "measured" && visualDelta.passed === false) {
    return "visual_delta.status=measured but visual_delta.passed=false blocks ready_to_ship for visual/UI proof";
  }
  const reason = String(visualDelta.reason || "").trim();
  if (reason) return `visual_delta.status=${status} blocks ready_to_ship for visual/UI proof: ${reason}`;
  return `visual_delta.status=${status} blocks ready_to_ship for visual/UI proof`;
}

export function requiredBaselineLabelsForState(state: any = {}) {
  const reference = normalizedReference(state);
  const labels: string[] = [];
  if (reference === "before" || reference === "both") labels.push("before");
  if (reference === "prod" || reference === "both") labels.push("prod");
  return labels;
}

export function validateShipGate(state: any = {}): ShipGateValidation {
  const reference = normalizedReference(state);
  const prodUrl = String(state?.prod_url || "").trim();
  const beforeCdn = String(state?.before_cdn || "").trim();
  const prodCdn = String(state?.prod_cdn || "").trim();
  const afterCdn = String(state?.after_cdn || "").trim();
  const verifyStatus = String(state?.verify_status || "").trim();
  const proofAssessment = normalizedProofAssessment(state);
  const verificationMode = normalizedVerificationMode(state);
  const visualDelta = visualDeltaForState(state);
  const visualDeltaRequired = visualDeltaRequiredForState(state);
  const visualDeltaBlocker = visualDeltaShipGateReason(state);
  const reasons: string[] = [];

  if (!["before", "prod", "both"].includes(reference)) {
    reasons.push(`reference must be before, prod, or both; got ${reference}`);
  }

  const requiredBaselines = requiredBaselineLabelsForState(state);
  if (requiredBaselines.includes("before") && !beforeCdn) {
    reasons.push("before_cdn is required before ship");
  }
  if (requiredBaselines.includes("prod")) {
    if (!prodUrl) {
      reasons.push(`prod_url is required when reference=${reference}`);
    }
    if (!prodCdn) {
      reasons.push("prod_cdn is required before ship");
    }
  }
  if (!afterCdn) {
    reasons.push("after_cdn is required before ship");
  }
  if (verifyStatus !== "evidence_captured") {
    reasons.push("verify_status must be evidence_captured before ship");
  }
  if (!["supervising_agent", "supervisor"].includes(proofAssessment.source || "")) {
    reasons.push("proof_assessment.source must be supervising_agent before ship");
  }
  if (proofAssessment.decision !== "ready_to_ship") {
    reasons.push("proof_assessment.decision must be ready_to_ship before ship");
  }
  if (visualDeltaBlocker) {
    reasons.push(visualDeltaBlocker);
  }

  return {
    ok: reasons.length === 0,
    reasons,
    required_baselines: requiredBaselines,
    evidence: {
      reference,
      verification_mode: verificationMode || null,
      prod_url: prodUrl || null,
      before_cdn: beforeCdn || null,
      prod_cdn: prodCdn || null,
      after_cdn: afterCdn || null,
      verify_status: verifyStatus || null,
      proof_assessment_decision: proofAssessment.decision,
      proof_assessment_source: proofAssessment.source,
      visual_delta_required: visualDeltaRequired,
      visual_delta_status: typeof visualDelta.status === "string" ? visualDelta.status : null,
      visual_delta_passed: typeof visualDelta.passed === "boolean" ? visualDelta.passed : null,
    },
  };
}

const CHECKPOINT_CONTRACT_SPECS: Record<string, {
  purpose: string;
  accepted_inputs?: CheckpointInputContract[];
  response_schema?: Record<string, unknown>;
  required_state?: string[];
  include_ship_gate?: boolean;
}> = {
  setup_review: {
    purpose: "Inspect prepared workspace state before moving into recon.",
  },
  recon_supervisor_judgment: {
    purpose: "Supervising agent judges the latest recon attempt and either retries recon, promotes baselines for authoring, or escalates.",
    accepted_inputs: [{
      name: "recon_assessment_json",
      type: "json",
      required: true,
      description: "JSON assessment with decision, summary, baseline_understanding, continue_with_stage, escalation_target, refined_inputs, and reasons.",
    }],
    response_schema: {
      decision: ["retry_recon", "ready_for_author", "recon_stuck"],
      summary: "string",
      baseline_understanding: {
        reference: ["before", "prod", "both", "unknown"],
        target_route: "string",
        before_evidence_url: "string",
        visible_before_state: "string",
        relevant_elements: ["string"],
        requested_change: "string",
        proof_focus: "string",
        stop_condition: "string",
        quality_risks: ["string"],
      },
      continue_with_stage: ["recon", "author"],
      escalation_target: ["agent", "human"],
      refined_inputs: {
        server_path: "string",
        wait_for_selector: "string",
        reference: ["before", "prod", "both"],
      },
      reasons: ["string"],
      source: "supervising_agent",
    },
    required_state: ["recon_assessment_request", "recon_results.attempt_history"],
  },
  recon_review: {
    purpose: "Recon baselines were promoted and the workflow is ready for proof authoring.",
  },
  recon_human_escalation: {
    purpose: "Recon is explicitly blocked for human direction after supervising-agent escalation.",
  },
  author_supervisor_judgment: {
    purpose: "Supervising agent authors the proof packet from recon observations.",
    accepted_inputs: [{
      name: "author_packet_json",
      type: "json",
      required: true,
      description: "JSON proof packet with proof_plan, capture_script, optional refined_inputs, rationale, confidence, and summary.",
    }],
    response_schema: {
      proof_plan: "string",
      capture_script: "string",
      baseline_understanding_used: {
        reference: ["before", "prod", "both", "unknown"],
        target_route: "string",
        before_evidence_url: "string",
        visible_before_state: "string",
        relevant_elements: ["string"],
        requested_change: "string",
        proof_focus: "string",
        stop_condition: "string",
        quality_risks: ["string"],
      },
      refined_inputs: {
        server_path: "string",
        wait_for_selector: "string",
        reference: ["before", "prod", "both"],
      },
      rationale: ["string"],
      confidence: "low | medium | high",
      summary: "string",
    },
    required_state: ["author_request", "recon_results.baselines"],
  },
  author_review: {
    purpose: "Proof packet is ready; choose whether to inspect, re-author, implement, or verify.",
  },
  implement_changes_missing: {
    purpose: "Implementation stage did not detect material code changes.",
    accepted_inputs: [{
      name: "make_code_changes",
      type: "external_action",
      required: true,
      description: "Make the actual code changes in the after worktree, then resume the implement stage.",
    }],
  },
  implement_review: {
    purpose: "Implementation changes were detected and stale verify evidence, if any, was invalidated.",
  },
  implement_required: {
    purpose: "Verify cannot run until implementation changes are recorded.",
    accepted_inputs: [{
      name: "make_code_changes",
      type: "external_action",
      required: true,
      description: "Make the requested code change, then advance the run to implement.",
    }],
  },
  verify_capture_retry: {
    purpose: "Verify capture was incomplete; the agent loop should revise capture authoring before shipping.",
    accepted_inputs: [{
      name: "author_packet_json",
      type: "json",
      description: "Optional revised proof packet if returning to author.",
    }],
    required_state: ["verify_decision_request"],
  },
  verify_supervisor_judgment: {
    purpose: "Supervising agent judges whether captured evidence proves the change is ready to ship.",
    accepted_inputs: [{
      name: "proof_assessment_json",
      type: "json",
      required: true,
      description: "JSON assessment with decision, summary, recommended_stage, continue_with_stage, escalation_target, and reasons.",
    }],
    response_schema: {
      decision: ["ready_to_ship", "needs_richer_proof"],
      summary: "string",
      recommended_stage: ["ship", "author", "implement", "recon", "verify"],
      continue_with_stage: ["ship", "author", "implement", "recon", "verify"],
      escalation_target: ["agent", "human"],
      reasons: ["string"],
      source: "supervising_agent",
    },
    required_state: ["before_cdn or prod_cdn", "after_cdn", "proof_assessment_request"],
    include_ship_gate: true,
  },
  verify_human_escalation: {
    purpose: "Proof loop is explicitly escalated to the human after supervising-agent judgment.",
  },
  verify_agent_retry: {
    purpose: "Supervising agent judged the proof insufficient and kept the workflow inside the internal loop.",
    accepted_inputs: [{
      name: "author_packet_json",
      type: "json",
      description: "Optional revised proof packet if the checkpoint resumes to author.",
    }],
  },
  verify_ship_ready: {
    purpose: "Proof assessment is ready_to_ship and the next continuation should enter ship.",
    include_ship_gate: true,
  },
  verify_required: {
    purpose: "Ship is blocked until verify captures usable after evidence.",
    include_ship_gate: true,
  },
  verify_supervisor_judgment_required: {
    purpose: "Ship is blocked until the supervising agent judges the current evidence ready_to_ship.",
    accepted_inputs: [{
      name: "proof_assessment_json",
      type: "json",
      required: true,
      description: "JSON assessment that must use decision=ready_to_ship before ship can continue.",
    }],
    include_ship_gate: true,
  },
  ship_gate_blocked: {
    purpose: "Ship is blocked because required baseline, after evidence, or supervising-agent proof approval is missing.",
    include_ship_gate: true,
  },
  ship_review: {
    purpose: "Ship completed; inspect the PR, proof comment, and CI status.",
    include_ship_gate: true,
  },
};

export function buildCheckpointContract(
  state: any,
  request: {
    statePath?: string;
    stage: WorkflowStage;
    checkpoint: string;
    summary: string;
    nextActions?: string[];
    advanceOptions?: WorkflowStage[];
    recommendedAdvanceStage?: WorkflowStage | null;
    continueWithStage?: WorkflowStage | null;
    blocking?: boolean;
  },
) {
  const spec = CHECKPOINT_CONTRACT_SPECS[request.checkpoint] || {
    purpose: request.summary,
  };
  const continueWithStage = request.continueWithStage || request.recommendedAdvanceStage || null;
  const payload: Record<string, unknown> = {
    version: CHECKPOINT_CONTRACT_VERSION,
    checkpoint: request.checkpoint,
    stage: request.stage,
    purpose: spec.purpose,
    summary: request.summary,
    blocking: Boolean(request.blocking),
    next_actions: request.nextActions || [],
    advance_options: request.advanceOptions || [],
    accepted_inputs: spec.accepted_inputs || [],
    response_schema: spec.response_schema || null,
    required_state: spec.required_state || [],
    resume: {
      action: "run",
      state_path: request.statePath || null,
      continue_from_checkpoint: Boolean(continueWithStage),
      continue_with_stage: continueWithStage,
    },
  };

  if (spec.include_ship_gate) {
    payload.ship_gate = validateShipGate(state);
  }

  return payload;
}

export function mergeStateFromParams(statePath: string, params: WorkflowParams) {
  const state = readState(statePath);
  if (!state) return null;
  ensureStageLoopState(state);

  const stringFields = [
    "change_request",
    "commit_message",
    "prod_url",
    "capture_script",
    "success_criteria",
    "assertions_json",
    "verification_mode",
    "resume_session",
    "target_image_url",
    "target_image_hash",
    "viewport_matrix_json",
    "deterministic_setup_json",
    "base_branch",
    "before_ref",
    "context",
    "reviewer",
    "build_command",
    "build_output",
    "server_image",
    "server_command",
    "server_path",
    "wait_for_selector",
    "discord_channel",
    "discord_thread_id",
    "discord_message_id",
    "discord_source_url",
    "auth_localStorage_json",
    "auth_cookies_json",
    "auth_headers_json",
    "proof_plan",
    "implementation_notes",
  ] as const;

  for (const field of stringFields) {
    if (params[field] !== undefined) {
      state[field] = normalizeOptionalString(params[field]);
    }
  }
  if (params.server_path !== undefined) {
    state.server_path_source = "tool_param";
  }
  if (params.implementation_notes !== undefined) {
    const issues = knownEnvironmentIssuesFromNotes(state.implementation_notes || "");
    if (issues.length) state.implementation_environment_issues = issues;
  }

  if (params.reference !== undefined) state.reference = params.reference;
  if (params.mode !== undefined) state.mode = params.mode;
  if (params.allow_static_preview_fallback !== undefined) {
    state.allow_static_preview_fallback = params.allow_static_preview_fallback;
  }
  if (params.server_port !== undefined) state.server_port = String(params.server_port);
  if (params.color_scheme !== undefined) state.color_scheme = params.color_scheme || "";
  if (params.use_auth !== undefined) state.use_auth = params.use_auth ? "true" : "";
  if (params.leave_draft !== undefined) state.leave_draft = params.leave_draft ? "true" : "";
  if (params.advance_stage !== undefined) state.last_requested_advance_stage = params.advance_stage;

  if (params.recon_assessment_json !== undefined) {
    const raw = normalizeOptionalString(params.recon_assessment_json) || "";
    if (!raw) {
      state.recon_assessment = {};
      state.recon_assessment_source = null;
    } else {
      const parsed = JSON.parse(raw);
      state.recon_assessment = {
        ...parsed,
        source: (parsed?.source || "supervising_agent").toString(),
      };
      state.recon_assessment_source = state.recon_assessment.source;
      if (parsed?.baseline_understanding && typeof parsed.baseline_understanding === "object") {
        state.recon_baseline_understanding = parsed.baseline_understanding;
      }
      const refined = parsed?.refined_inputs || {};
      if (typeof refined?.server_path === "string") {
        state.server_path = normalizeOptionalString(refined.server_path) || "";
        state.server_path_source = "supervising_agent";
      }
      if (typeof refined?.wait_for_selector === "string") state.wait_for_selector = normalizeOptionalString(refined.wait_for_selector) || "";
      if (typeof refined?.reference === "string" && refined.reference.trim()) state.reference = refined.reference.trim();
    }
  }

  if (params.author_packet_json !== undefined) {
    const raw = normalizeOptionalString(params.author_packet_json) || "";
    if (!raw) {
      state.supervisor_author_packet = null;
    } else {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.capture_script === "string") {
        parsed.capture_script = normalizeCaptureScript(parsed.capture_script);
      }
      state.supervisor_author_packet = parsed;
      if (typeof parsed?.proof_plan === "string") state.proof_plan = normalizeOptionalString(parsed.proof_plan) || "";
      if (typeof parsed?.capture_script === "string") state.capture_script = normalizeCaptureScript(parsed.capture_script);
      if (parsed?.baseline_understanding_used && typeof parsed.baseline_understanding_used === "object") {
        state.author_baseline_understanding_used = parsed.baseline_understanding_used;
      }
      const refined = parsed?.refined_inputs || {};
      if (typeof refined?.server_path === "string") {
        state.server_path = normalizeOptionalString(refined.server_path) || "";
        state.server_path_source = "supervising_agent";
      }
      if (typeof refined?.wait_for_selector === "string") state.wait_for_selector = normalizeOptionalString(refined.wait_for_selector) || "";
      if (typeof refined?.reference === "string" && refined.reference.trim()) state.reference = refined.reference.trim();
      if (typeof parsed?.confidence === "string") state.supervisor_author_confidence = normalizeOptionalString(parsed.confidence) || null;
      if (parsed?.rationale !== undefined) state.supervisor_author_rationale = parsed.rationale;
      if (typeof parsed?.summary === "string") state.supervisor_author_summary = normalizeOptionalString(parsed.summary) || null;
      invalidateVerifyEvidence(state);
    }
  }

  if (params.proof_assessment_json !== undefined) {
    const raw = normalizeOptionalString(params.proof_assessment_json) || "";
    if (!raw) {
      state.proof_assessment = {};
      state.proof_assessment_source = null;
    } else {
      const parsed = JSON.parse(raw);
      const assessment = {
        ...parsed,
        source: (parsed?.source || "supervising_agent").toString(),
      };
      const readyBlocker = assessment?.decision === "ready_to_ship"
        ? visualDeltaShipGateReason({ ...state, proof_assessment: assessment, proof_assessment_source: assessment.source })
        : null;
      if (readyBlocker) {
        assessment.blocked_decision = assessment.decision;
        assessment.decision = "needs_richer_proof";
        if (assessment.recommended_stage === "ship") assessment.recommended_stage = "verify";
        if (assessment.continue_with_stage === "ship") assessment.continue_with_stage = "verify";
        const blockers = Array.isArray(assessment.blockers) ? assessment.blockers : [];
        assessment.blockers = [...blockers, readyBlocker];
      }
      state.proof_assessment = assessment;
      state.proof_assessment_source = state.proof_assessment.source;
      if (typeof state.proof_assessment?.decision === "string") {
        state.proof_decision = state.proof_assessment.decision;
      }
      if (typeof parsed?.summary === "string") {
        state.proof_assessment_summary = normalizeOptionalString(parsed.summary) || null;
      }
      if (state.proof_assessment?.decision === "ready_to_ship") {
        state.merge_recommendation = "ready-to-ship";
      } else if (typeof state.proof_assessment?.decision === "string" && state.proof_assessment.decision.trim()) {
        state.merge_recommendation = "do-not-merge";
      }
      appendProofSummaryLine(state, `Supervising proof assessment: ${state.proof_assessment.decision || "unknown"}`);
      if (readyBlocker) {
        appendProofSummaryLine(state, `Ready-to-ship assessment blocked: ${readyBlocker}`);
      }
      if (state.proof_assessment_summary) {
        appendProofSummaryLine(state, `Assessment summary: ${state.proof_assessment_summary}`);
      }
      const reasons = Array.isArray(parsed?.reasons) ? parsed.reasons.filter((item: unknown) => typeof item === "string" && item.trim()).slice(0, 4) : [];
      if (reasons.length) {
        appendProofSummaryLine(state, `Assessment reasons: ${reasons.join("; ")}`);
      }
    }
  }

  if (params.assertions_json !== undefined) {
    const raw = normalizeOptionalString(params.assertions_json) || "";
    if (!raw) {
      state.parsed_assertions = null;
    } else {
      state.parsed_assertions = JSON.parse(raw);
    }
  }

  if ((params.proof_plan !== undefined || params.capture_script !== undefined) && hasAuthoredProofPlan(state)) {
    state.author_summary = state.author_summary || "Proof authoring inputs were updated from tool params.";
  }

  syncAuthoringState(state);

  writeState(statePath, state);
  return state;
}

export function summarizeState(state: any) {
  if (!state) {
    return {
      stage: "missing",
      summary: "No riddle-proof state file exists yet.",
      state: null,
    };
  }

  ensureStageLoopState(state);
  const attemptCounts = Object.fromEntries(
    WORKFLOW_STAGE_ORDER.map((stage) => [stage, Number(state.stage_attempts?.[stage]?.count || 0)]),
  );

  const selected = {
    workspace_ready: Boolean(state.workspace_ready),
    repo: state.repo || null,
    branch: state.branch || null,
    mode: state.mode || null,
    reference: state.reference || null,
    before_ref: state.before_ref || null,
    allow_static_preview_fallback: Boolean(state.allow_static_preview_fallback),
    commit_message: state.commit_message || null,
    author_status: state.author_status || null,
    author_summary: state.author_summary || null,
    author_request: state.author_request || null,
    proof_plan_status: state.proof_plan_status || null,
    proof_plan: state.proof_plan || null,
    proof_plan_request: state.proof_plan_request || null,
    proof_profile_applied: Boolean(state.proof_profile),
    proof_profile: state.proof_profile || null,
    recon_status: state.recon_status || null,
    recon_assessment: state.recon_assessment || null,
    recon_assessment_request: state.recon_assessment_request || null,
    recon_assessment_source: state.recon_assessment_source || null,
    recon_decision_request: state.recon_decision_request || null,
    recon_attempts_used: Array.isArray(state.recon_results?.attempt_history) ? state.recon_results.attempt_history.length : 0,
    recon_attempts_max: state.recon_results?.max_attempts || null,
    recon_hypothesis: state.recon_hypothesis || null,
    implementation_status: state.implementation_status || null,
    implementation_summary: state.implementation_summary || null,
    implementation_detection_summary: state.implementation_detection_summary || null,
    implementation_detection: state.implementation_detection || null,
    implementation_environment_issues: state.implementation_environment_issues || [],
    verify_status: state.verify_status || null,
    verify_summary: state.verify_summary || null,
    verify_decision_request: state.verify_decision_request || null,
    proof_assessment: state.proof_assessment || null,
    proof_assessment_request: state.proof_assessment_request || null,
    proof_assessment_source: state.proof_assessment_source || null,
    merge_recommendation: state.merge_recommendation || null,
    before_cdn: state.before_cdn || null,
    after_cdn: state.after_cdn || null,
    prod_cdn: state.prod_cdn || null,
    pr_url: state.pr_url || null,
    pr_branch: state.target_branch || state.branch || null,
    pr_state: state.pr_state || null,
    ship_commit: state.ship_commit || null,
    ship_remote_head: state.ship_remote_head || null,
    merge_commit: state.merge_commit || null,
    merged_at: state.merged_at || null,
    ship_push: state.ship_push || null,
    ship_report: state.ship_report || null,
    cleanup_report: state.cleanup_report || null,
    proof_comment_url: state.proof_comment_url || null,
    proof_assessment_comment_url: state.proof_assessment_comment_url || null,
    marked_ready: typeof state.marked_ready === "boolean" ? state.marked_ready : null,
    left_draft: typeof state.left_draft === "boolean" ? state.left_draft : null,
    ci_status: state.ci_status || null,
    reviewer: state.reviewer || null,
    active_checkpoint: state.active_checkpoint || null,
    active_checkpoint_stage: state.active_checkpoint_stage || null,
    continue_with_stage: checkpointContinueStage(state),
    stage_decision_request: state.stage_decision_request || {},
    stage_attempt_counts: attemptCounts,
    explicit_stage_gate: Boolean(state.explicit_stage_gate),
    last_requested_advance_stage: state.last_requested_advance_stage || null,
    recon_results: state.recon_results || null,
    verify_results: state.verify_results || null,
    proof_session: state.proof_session || null,
    parent_proof_session: state.parent_proof_session || null,
    proof_session_artifact_url: state.proof_session_artifact_url || null,
  };

  const parts = [
    state.workspace_ready ? "workspace ready" : "workspace not ready",
    state.mode ? `mode=${state.mode}` : null,
    state.reference ? `reference=${state.reference}` : null,
    state.author_status ? `author=${state.author_status}` : null,
    state.proof_plan_status ? `proof=${state.proof_plan_status}` : null,
    state.recon_status ? `recon=${state.recon_status}` : null,
    state.implementation_status ? `implement=${state.implementation_status}` : null,
    state.verify_status ? `verify=${state.verify_status}` : null,
    state.active_checkpoint ? `checkpoint=${state.active_checkpoint}` : null,
    state.after_cdn ? "after evidence captured" : null,
    state.pr_url ? "PR linked" : null,
  ].filter(Boolean);

  return {
    stage: state.stage || (state.after_cdn ? "verified" : state.workspace_ready ? "setup" : "unknown"),
    summary: parts.length ? parts.join(", ") : "State file present.",
    state: selected,
  };
}
