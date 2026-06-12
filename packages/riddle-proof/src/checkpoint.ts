import crypto from "node:crypto";
import type {
  RiddleProofCheckpointArtifact,
  RiddleProofCheckpointPacket,
  RiddleProofCheckpointResponse,
  RiddleProofCheckpointSummary,
  RiddleProofProofContract,
  RiddleProofRunParams,
  RiddleProofRunState,
  RiddleProofStage,
  RiddleProofStatePaths,
} from "./types";
import { compactRecord, nonEmptyString, recordValue } from "./result";

export const RIDDLE_PROOF_CHECKPOINT_PACKET_VERSION = "riddle-proof.checkpoint.v1" as const;
export const RIDDLE_PROOF_CHECKPOINT_RESPONSE_VERSION = "riddle-proof.checkpoint_response.v1" as const;

function timestamp() {
  return new Date().toISOString();
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

function jsonCloneValue(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = recordValue(value);
  if (record) {
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function compactText(value: unknown, limit = 1600): string | undefined {
  const text = nonEmptyString(value);
  if (!text) return undefined;
  return text.length <= limit ? text : `${text.slice(0, limit - 20).trimEnd()}...`;
}

export function statePathsForRunState(
  state: RiddleProofRunState,
  engineStatePath?: string | null,
): RiddleProofStatePaths {
  return compactRecord({
    wrapper_state_path: state.state_path || state.request.harness_state_path || null,
    engine_state_path: engineStatePath || state.request.engine_state_path || null,
    resume_state_path: engineStatePath || state.request.engine_state_path || null,
  }) as RiddleProofStatePaths;
}

function responseSchemaForAuthorPacket() {
  return {
    type: "object",
    required: ["version", "run_id", "checkpoint", "decision", "summary", "payload", "created_at"],
    additionalProperties: false,
    properties: {
      version: { const: RIDDLE_PROOF_CHECKPOINT_RESPONSE_VERSION },
      run_id: { type: "string" },
      checkpoint: { type: "string" },
      resume_token: { type: "string" },
      decision: {
        type: "string",
        enum: ["author_packet", "needs_recon", "blocked", "human_review"],
      },
      summary: { type: "string" },
      payload: {
        type: "object",
        description:
          "For decision=author_packet, provide the proof packet itself or {author_packet:{...}} with proof_plan, capture_script, refined_inputs.expected_terminal_path, and interaction_contract when the proof changes route, query, or hash.",
      },
      reasons: { type: "array", items: { type: "string" } },
      continue_with_stage: { type: "string", enum: ["author", "recon"] },
      source: {
        type: "object",
        properties: {
          kind: { type: "string" },
          session_id: { type: "string" },
          user_id: { type: "string" },
        },
      },
      created_at: { type: "string" },
    },
  };
}

function responseSchemaForProofAssessmentPacket() {
  return {
    type: "object",
    required: ["version", "run_id", "checkpoint", "decision", "summary", "created_at"],
    additionalProperties: false,
    properties: {
      version: { const: RIDDLE_PROOF_CHECKPOINT_RESPONSE_VERSION },
      run_id: { type: "string" },
      checkpoint: { type: "string" },
      resume_token: { type: "string" },
      decision: {
        type: "string",
        enum: [
          "ready_to_ship",
          "needs_richer_proof",
          "revise_capture",
          "needs_recon",
          "needs_implementation",
          "blocked",
          "human_review",
        ],
      },
      summary: { type: "string" },
      payload: {
        type: "object",
        description:
          "Optional structured assessment details, including recommended_stage, continue_with_stage, visual_delta notes, or blocker diagnostics.",
      },
      reasons: { type: "array", items: { type: "string" } },
      continue_with_stage: { type: "string", enum: ["ship", "author", "implement", "recon", "verify"] },
      source: {
        type: "object",
        properties: {
          kind: { type: "string" },
          session_id: { type: "string" },
          user_id: { type: "string" },
        },
      },
      created_at: { type: "string" },
    },
  };
}

function responseSchemaForReconPacket() {
  return {
    type: "object",
    required: ["version", "run_id", "checkpoint", "decision", "summary", "created_at"],
    additionalProperties: false,
    properties: {
      version: { const: RIDDLE_PROOF_CHECKPOINT_RESPONSE_VERSION },
      run_id: { type: "string" },
      checkpoint: { type: "string" },
      resume_token: { type: "string" },
      decision: {
        type: "string",
        enum: ["ready_for_author", "retry_recon", "recon_stuck", "needs_recon", "blocked", "human_review"],
      },
      summary: { type: "string" },
      payload: {
        type: "object",
        description:
          "Optional recon assessment details such as baseline_understanding, refined_inputs, reasons, or diagnostic blocker context.",
      },
      reasons: { type: "array", items: { type: "string" } },
      continue_with_stage: { type: "string", enum: ["recon", "author"] },
      source: {
        type: "object",
        properties: {
          kind: { type: "string" },
          session_id: { type: "string" },
          user_id: { type: "string" },
        },
      },
      created_at: { type: "string" },
    },
  };
}

function responseSchemaForImplementationPacket() {
  return {
    type: "object",
    required: ["version", "run_id", "checkpoint", "decision", "summary", "created_at"],
    additionalProperties: false,
    properties: {
      version: { const: RIDDLE_PROOF_CHECKPOINT_RESPONSE_VERSION },
      run_id: { type: "string" },
      checkpoint: { type: "string" },
      resume_token: { type: "string" },
      decision: {
        type: "string",
        enum: ["implementation_complete", "needs_author", "needs_recon", "blocked", "human_review"],
      },
      summary: { type: "string" },
      payload: {
        type: "object",
        description:
          "Implementation details such as changed_files, tests_run, and implementation_notes. The changed worktree must contain a real git diff before verify can advance.",
      },
      reasons: { type: "array", items: { type: "string" } },
      continue_with_stage: { type: "string", enum: ["implement", "verify", "author", "recon"] },
      source: {
        type: "object",
        properties: {
          kind: { type: "string" },
          session_id: { type: "string" },
          user_id: { type: "string" },
        },
      },
      created_at: { type: "string" },
    },
  };
}

function responseSchemaForAdvancePacket(stage: RiddleProofStage) {
  return {
    type: "object",
    required: ["version", "run_id", "checkpoint", "decision", "summary", "created_at"],
    additionalProperties: false,
    properties: {
      version: { const: RIDDLE_PROOF_CHECKPOINT_RESPONSE_VERSION },
      run_id: { type: "string" },
      checkpoint: { type: "string" },
      resume_token: { type: "string" },
      decision: {
        type: "string",
        enum: ["continue_stage", "retry_stage", "needs_recon", "needs_implementation", "blocked", "human_review"],
      },
      summary: { type: "string" },
      payload: { type: "object" },
      reasons: { type: "array", items: { type: "string" } },
      continue_with_stage: { type: "string", enum: ["recon", "author", "implement", "verify", "ship", stage] },
      source: {
        type: "object",
        properties: {
          kind: { type: "string" },
          session_id: { type: "string" },
          user_id: { type: "string" },
        },
      },
      created_at: { type: "string" },
    },
  };
}

function resumeTokenFor(input: {
  runId: string;
  statePath?: string | null;
  checkpoint: string;
  stage: RiddleProofStage;
}) {
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 24);
  return `rpchk_${hash}`;
}

function artifactsFromState(state: Record<string, unknown> | null): RiddleProofCheckpointArtifact[] {
  const artifacts: RiddleProofCheckpointArtifact[] = [];
  for (const role of ["before", "prod", "after"] as const) {
    const url = nonEmptyString(state?.[`${role}_cdn`]);
    if (url) artifacts.push({ role, url, name: `${role}.png`, mime_type: "image/png" });
  }
  const authorRequest = recordValue(state?.author_request);
  const latestAttempt = recordValue(authorRequest?.latest_attempt);
  const observations = recordValue(latestAttempt?.observations);
  for (const [label, observation] of Object.entries(observations || {})) {
    const record = recordValue(observation);
    const url = nonEmptyString(record?.url);
    if (url && !artifacts.some((artifact) => artifact.url === url)) {
      artifacts.push({
        role: label === "before" || label === "prod" ? label : "json",
        url,
        name: `${label}-observation`,
        summary: compactText(record?.reason, 240),
      });
    }
  }
  return artifacts.slice(0, 16);
}

function stageFromCheckpoint(checkpoint: string): RiddleProofStage {
  if (checkpoint.startsWith("recon_")) return "recon";
  if (checkpoint.startsWith("author_")) return "author";
  if (checkpoint.startsWith("implement_")) return "implement";
  if (checkpoint.startsWith("verify_")) return "verify";
  if (checkpoint.startsWith("ship_")) return "ship";
  if (checkpoint.startsWith("pr_sync_")) return "notify";
  if (checkpoint.includes("capture")) return "prove";
  return "setup";
}

function allowedDecisionsForStage(stage: RiddleProofStage, checkpoint: string) {
  if (stage === "recon") return ["ready_for_author", "retry_recon", "recon_stuck", "needs_recon", "blocked", "human_review"];
  if (stage === "implement") return ["implementation_complete", "needs_author", "needs_recon", "blocked", "human_review"];
  if (stage === "ship") return ["continue_stage", "retry_stage", "needs_implementation", "needs_recon", "blocked", "human_review"];
  if (checkpoint === "awaiting_stage_advance") return ["continue_stage", "retry_stage", "needs_recon", "needs_implementation", "blocked", "human_review"];
  return ["continue_stage", "retry_stage", "needs_recon", "needs_implementation", "blocked", "human_review"];
}

function packetKindForStage(stage: RiddleProofStage, checkpoint: string): RiddleProofCheckpointPacket["kind"] {
  if (stage === "recon") return "assess_recon";
  if (stage === "implement") return "implement_change";
  if (checkpoint.includes("human")) return "human_review";
  return "advance_decision";
}

function responseSchemaForStage(stage: RiddleProofStage, checkpoint: string) {
  if (stage === "recon") return responseSchemaForReconPacket();
  if (stage === "implement") return responseSchemaForImplementationPacket();
  return responseSchemaForAdvancePacket(stage);
}

function questionForStage(stage: RiddleProofStage, checkpoint: string) {
  if (stage === "recon") {
    return "Assess the baseline/recon evidence. Return ready_for_author only when the baseline is trustworthy; otherwise choose retry_recon, recon_stuck, blocked, or human_review.";
  }
  if (stage === "implement") {
    return "Implement the requested change in the after worktree, leave a real git diff, then return implementation_complete with changed_files/tests_run/implementation_notes. Choose blocked or human_review if implementation cannot honestly advance.";
  }
  if (stage === "ship") {
    return "Assess whether the ship gate can continue. Return continue_stage only if proof, PR, and policy gates are satisfied; otherwise route to the appropriate earlier stage or block with a concrete reason.";
  }
  return "Choose the next Riddle Proof stage for this durable run, or block with a concrete reason if the run cannot honestly advance.";
}

export function buildStageCheckpointPacket(input: {
  request: RiddleProofRunParams;
  runState: RiddleProofRunState;
  engineResult: {
    state_path?: string | null;
    checkpoint?: string | null;
    checkpointContract?: Record<string, unknown> | null;
    decisionRequest?: Record<string, unknown> | null;
    summary?: string;
    stage?: string | null;
  };
  fullRiddleState?: Record<string, unknown> | null;
  visibility?: "liveblog" | "quiet" | "terminal_only" | "manual" | string;
  created_at?: string;
}): RiddleProofCheckpointPacket {
  const checkpoint = nonEmptyString(input.engineResult.checkpoint) || "stage_checkpoint";
  const stage = (nonEmptyString(input.engineResult.stage) || stageFromCheckpoint(checkpoint)) as RiddleProofStage;
  const runId = input.runState.run_id || "unknown";
  const fullState = input.fullRiddleState || {};
  const decisionDetails = recordValue(input.engineResult.decisionRequest?.details);
  const checkpointContract = recordValue(input.engineResult.checkpointContract);
  const summary =
    nonEmptyString(input.engineResult.summary) ||
    nonEmptyString(fullState.stage_summary) ||
    `${stage} checkpoint needs a supervising decision.`;
  const kind = packetKindForStage(stage, checkpoint);

  return {
    version: RIDDLE_PROOF_CHECKPOINT_PACKET_VERSION,
    run_id: runId,
    state_path: input.runState.state_path,
    stage,
    checkpoint,
    kind,
    summary,
    question: questionForStage(stage, checkpoint),
    change_request: input.request.change_request || nonEmptyString(fullState.change_request) || "",
    context: input.request.context,
    artifacts: artifactsFromState(fullState),
    state_excerpt: compactRecord({
      repo: input.request.repo || fullState.repo,
      branch: input.request.branch || fullState.branch,
      after_worktree: fullState.after_worktree || input.runState.worktree_path,
      verification_mode: input.request.verification_mode || fullState.verification_mode,
      reference: input.request.reference || fullState.reference,
      server_path: fullState.server_path,
      wait_for_selector: fullState.wait_for_selector,
      recon_status: fullState.recon_status,
      author_status: fullState.author_status,
      implementation_status: fullState.implementation_status,
      verify_status: fullState.verify_status,
      stage_decision_request: jsonCloneRecord(fullState.stage_decision_request),
    }) as Record<string, unknown>,
    evidence_excerpt: compactRecord({
      before_cdn: fullState.before_cdn || null,
      prod_cdn: fullState.prod_cdn || null,
      after_cdn: fullState.after_cdn || null,
      recon_results: jsonCloneRecord(fullState.recon_results),
      checkpoint_contract: jsonCloneRecord(checkpointContract),
      decision_details: jsonCloneRecord(decisionDetails),
    }) as Record<string, unknown>,
    allowed_decisions: allowedDecisionsForStage(stage, checkpoint),
    response_schema: responseSchemaForStage(stage, checkpoint),
    routing_hint: {
      suggested_role:
        stage === "implement" ? "builder_agent" :
          checkpoint.includes("human") ? "human" :
            "main_agent",
      visibility: input.visibility || "quiet",
      urgency: stage === "ship" ? "high" : "normal",
      can_auto_answer: input.visibility !== "manual",
    },
    resume_token: resumeTokenFor({
      runId,
      statePath: input.engineResult.state_path || input.request.engine_state_path || null,
      checkpoint,
      stage,
    }),
    created_at: input.created_at || timestamp(),
  };
}

export function buildAuthorCheckpointPacket(input: {
  request: RiddleProofRunParams;
  runState: RiddleProofRunState;
  engineResult: {
    state_path?: string | null;
    checkpoint?: string | null;
    checkpointContract?: Record<string, unknown> | null;
    decisionRequest?: Record<string, unknown> | null;
    summary?: string;
  };
  fullRiddleState?: Record<string, unknown> | null;
  visibility?: "liveblog" | "quiet" | "terminal_only" | "manual" | string;
  created_at?: string;
}): RiddleProofCheckpointPacket {
  const checkpoint = nonEmptyString(input.engineResult.checkpoint) || "author_supervisor_judgment";
  const stage = "author" as const;
  const runId = input.runState.run_id || "unknown";
  const fullState = input.fullRiddleState || {};
  const decisionDetails = recordValue(input.engineResult.decisionRequest?.details);
  const authorRequest =
    recordValue(fullState.author_request) ||
    recordValue(fullState.proof_plan_request) ||
    recordValue(decisionDetails?.authorRequest) ||
    {};
  const fallbackDefaults = recordValue(authorRequest.fallback_defaults) || {};
  const reconResults = recordValue(fullState.recon_results);
  const checkpointContract = recordValue(input.engineResult.checkpointContract);
  const summary =
    nonEmptyString(input.engineResult.summary) ||
    nonEmptyString(fullState.author_summary) ||
    "Author checkpoint needs a supervising proof packet.";

  return {
    version: RIDDLE_PROOF_CHECKPOINT_PACKET_VERSION,
    run_id: runId,
    state_path: input.runState.state_path,
    stage,
    checkpoint,
    kind: "author_proof",
    summary,
    question:
      "Author the proof packet for this Riddle Proof run. Return a CheckpointResponse with decision=author_packet and payload containing proof_plan and capture_script.",
    change_request: input.request.change_request || nonEmptyString(fullState.change_request) || "",
    context: input.request.context,
    artifacts: artifactsFromState(fullState),
    state_excerpt: compactRecord({
      repo: input.request.repo || fullState.repo,
      branch: input.request.branch || fullState.branch,
      verification_mode: input.request.verification_mode || fullState.verification_mode,
      success_criteria: fullState.success_criteria,
      reference: input.request.reference || fullState.reference,
      server_path: fullState.server_path,
      wait_for_selector: fullState.wait_for_selector,
      expected_start_path: fullState.expected_start_path,
      expected_terminal_path: fullState.expected_terminal_path,
      requested_expected_terminal_path: fullState.requested_expected_terminal_path,
      interaction_contract: jsonCloneRecord(fullState.interaction_contract),
      route_expectation: jsonCloneRecord(fullState.route_expectation),
      author_summary: fullState.author_summary,
      author_request: jsonCloneRecord(authorRequest),
      recon_baseline_understanding: jsonCloneRecord(fullState.recon_baseline_understanding),
      fallback_defaults: jsonCloneRecord(fallbackDefaults),
    }) as Record<string, unknown>,
    evidence_excerpt: compactRecord({
      recon_results: jsonCloneRecord(reconResults),
      checkpoint_contract: jsonCloneRecord(checkpointContract),
    }) as Record<string, unknown>,
    allowed_decisions: ["author_packet", "needs_recon", "blocked", "human_review"],
    response_schema: responseSchemaForAuthorPacket(),
    routing_hint: {
      suggested_role: "proof_author",
      visibility: input.visibility || "quiet",
      urgency: "normal",
      can_auto_answer: input.visibility !== "manual",
    },
    resume_token: resumeTokenFor({
      runId,
      statePath: input.engineResult.state_path || input.request.engine_state_path || null,
      checkpoint,
      stage,
    }),
    created_at: input.created_at || timestamp(),
  };
}

function visualDeltaFromState(fullState: Record<string, unknown>) {
  const bundle = recordValue(fullState.evidence_bundle);
  const after = recordValue(bundle?.after);
  const afterDelta = recordValue(after?.visual_delta);
  if (afterDelta && Object.keys(afterDelta).length) return afterDelta;
  const proofAssessmentRequest = recordValue(fullState.proof_assessment_request);
  return recordValue(proofAssessmentRequest?.visual_delta) || null;
}

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function noImplementationModeForCheckpoint(
  request: RiddleProofRunParams | Record<string, unknown> | null | undefined,
  fullState: Record<string, unknown>,
) {
  const requestRecord = recordValue(request) || {};
  const mode = normalizedText(
    requestRecord.mode ||
    requestRecord.workflow_mode ||
    fullState.mode ||
    fullState.workflow_mode,
  );
  const implementationMode = normalizedText(requestRecord.implementation_mode || fullState.implementation_mode);
  const requireDiff = requestRecord.require_diff ?? fullState.require_diff;
  const allowCodeChanges = requestRecord.allow_code_changes ?? fullState.allow_code_changes;
  return (
    mode === "audit" ||
    mode === "profile" ||
    implementationMode === "none" ||
    requireDiff === false ||
    allowCodeChanges === false
  );
}

function visualDeltaNotApplicableForNoImplementation(visualDelta: Record<string, unknown> | null) {
  if (String(visualDelta?.status || "").trim() !== "not_applicable") return false;
  const reason = String(visualDelta?.reason || "").toLowerCase();
  return (
    reason.includes("audit/no-diff") ||
    reason.includes("does not require a before/after implementation delta")
  );
}

function verificationModeRequiresVisualDelta(value: unknown) {
  const mode = String(value || "proof").trim().toLowerCase();
  return [
    "visual",
    "render",
    "interaction",
    "ui",
    "layout",
    "screenshot",
    "canvas",
    "animation",
  ].includes(mode);
}

function visualDeltaIssueCode(visualDelta: Record<string, unknown> | null, required: boolean) {
  const status = String(visualDelta?.status || "").trim();
  const reason = String(visualDelta?.reason || "").toLowerCase();
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
  if (status === "measured" && visualDelta?.passed === false) return "semantic_proof_failed";
  if (required && status !== "measured") return "visual_delta_unmeasured";
  return null;
}

export function buildProofAssessmentCheckpointPacket(input: {
  request: RiddleProofRunParams;
  runState: RiddleProofRunState;
  engineResult: {
    state_path?: string | null;
    checkpoint?: string | null;
    checkpointContract?: Record<string, unknown> | null;
    decisionRequest?: Record<string, unknown> | null;
    summary?: string;
  };
  fullRiddleState?: Record<string, unknown> | null;
  visibility?: "liveblog" | "quiet" | "terminal_only" | "manual" | string;
  created_at?: string;
}): RiddleProofCheckpointPacket {
  const checkpoint = nonEmptyString(input.engineResult.checkpoint) || "verify_supervisor_judgment";
  const stage = "verify" as const;
  const runId = input.runState.run_id || "unknown";
  const fullState = input.fullRiddleState || {};
  const proofAssessmentRequest =
    recordValue(fullState.proof_assessment_request) ||
    recordValue(recordValue(fullState.verify_decision_request)?.assessment_request) ||
    recordValue(input.engineResult.decisionRequest?.details) ||
    {};
  const bundle = recordValue(fullState.evidence_bundle);
  const artifactContract = recordValue(proofAssessmentRequest.artifact_contract) || recordValue(bundle?.artifact_contract);
  const requiredSignals = recordValue(recordValue(artifactContract)?.required);
  const visualDelta = visualDeltaFromState(fullState);
  const verificationMode =
    nonEmptyString(bundle?.verification_mode) ||
    nonEmptyString(fullState.verification_mode) ||
    nonEmptyString(input.request.verification_mode) ||
    "proof";
  const noImplementationMode = noImplementationModeForCheckpoint(input.request, fullState);
  const noImplementationVisualDelta = visualDeltaNotApplicableForNoImplementation(visualDelta);
  const visualDeltaRequired =
    !noImplementationMode &&
    !noImplementationVisualDelta &&
    requiredSignals?.visual_delta !== false && (
      requiredSignals?.visual_delta === true ||
      verificationModeRequiresVisualDelta(verificationMode)
    );
  const evidenceIssueCode = visualDeltaIssueCode(visualDelta, visualDeltaRequired);
  const summary =
    nonEmptyString(input.engineResult.summary) ||
    nonEmptyString(fullState.verify_summary) ||
    "Verify captured evidence and needs a supervising proof assessment.";
  const recoveryHint = evidenceIssueCode
    ? "Required visual_delta evidence is incomplete. Keep this same run in verify/evidence recovery with decision=revise_capture and continue_with_stage=verify unless the evidence proves an implementation or recon problem."
    : "Assess whether the current artifacts prove the requested change, then choose the next stage.";

  return {
    version: RIDDLE_PROOF_CHECKPOINT_PACKET_VERSION,
    run_id: runId,
    state_path: input.runState.state_path,
    stage,
    checkpoint,
    kind: evidenceIssueCode ? "recover_evidence" : "assess_proof",
    summary,
    question:
      `Assess the current Riddle Proof evidence. ${recoveryHint} Return a CheckpointResponse using one allowed decision.`,
    change_request: input.request.change_request || nonEmptyString(fullState.change_request) || "",
    context: input.request.context,
    artifacts: artifactsFromState(fullState),
    state_excerpt: compactRecord({
      repo: input.request.repo || fullState.repo,
      branch: input.request.branch || fullState.branch,
      verification_mode: verificationMode,
      reference: input.request.reference || fullState.reference,
      server_path: fullState.server_path,
      wait_for_selector: fullState.wait_for_selector,
      implementation_status: fullState.implementation_status,
      implementation_summary: fullState.implementation_summary,
      changed_files: jsonCloneValue(fullState.changed_files),
      proof_plan: compactText(fullState.proof_plan, 1200),
    }) as Record<string, unknown>,
    evidence_excerpt: compactRecord({
      before_cdn: fullState.before_cdn || null,
      prod_cdn: fullState.prod_cdn || null,
      after_cdn: fullState.after_cdn || null,
      visual_delta_required: visualDeltaRequired,
      visual_delta_ready: !visualDeltaRequired || (visualDelta?.status === "measured" && visualDelta?.passed === true),
      visual_delta: jsonCloneRecord(visualDelta),
      evidence_issue_code: evidenceIssueCode,
      proof_assessment_request: jsonCloneRecord(proofAssessmentRequest),
      verify_decision_request: jsonCloneRecord(fullState.verify_decision_request),
      checkpoint_contract: jsonCloneRecord(input.engineResult.checkpointContract),
    }) as Record<string, unknown>,
    artifact_contract: jsonCloneRecord(artifactContract),
    allowed_decisions: [
      "ready_to_ship",
      "needs_richer_proof",
      "revise_capture",
      "needs_recon",
      "needs_implementation",
      "blocked",
      "human_review",
    ],
    response_schema: responseSchemaForProofAssessmentPacket(),
    routing_hint: {
      suggested_role: evidenceIssueCode ? "proof_judge" : "proof_judge",
      visibility: input.visibility || "quiet",
      urgency: evidenceIssueCode ? "high" : "normal",
      can_auto_answer: input.visibility !== "manual",
    },
    resume_token: resumeTokenFor({
      runId,
      statePath: input.engineResult.state_path || input.request.engine_state_path || null,
      checkpoint,
      stage,
    }),
    created_at: input.created_at || timestamp(),
  };
}

export function buildCheckpointPacketForEngineResult(input: {
  request: RiddleProofRunParams;
  runState: RiddleProofRunState;
  engineResult: {
    state_path?: string | null;
    checkpoint?: string | null;
    checkpointContract?: Record<string, unknown> | null;
    decisionRequest?: Record<string, unknown> | null;
    summary?: string;
  };
  fullRiddleState?: Record<string, unknown> | null;
  visibility?: "liveblog" | "quiet" | "terminal_only" | "manual" | string;
  created_at?: string;
}): RiddleProofCheckpointPacket {
  const checkpoint = nonEmptyString(input.engineResult.checkpoint) || "";
  if (
    checkpoint === "verify_supervisor_judgment" ||
    checkpoint === "verify_supervisor_judgment_required" ||
    checkpoint === "verify_human_escalation"
  ) {
    return buildProofAssessmentCheckpointPacket(input);
  }
  const resume = recordValue(input.engineResult.checkpointContract?.resume);
  const continueStage = nonEmptyString(resume?.continue_with_stage);
  if (
    checkpoint === "author_supervisor_judgment" ||
    checkpoint === "verify_capture_retry" ||
    (checkpoint === "verify_agent_retry" && continueStage === "author")
  ) {
    return buildAuthorCheckpointPacket(input);
  }
  return buildStageCheckpointPacket(input);
}

export function normalizeCheckpointResponse(value: unknown): RiddleProofCheckpointResponse | null {
  const record = recordValue(value);
  if (!record) return null;
  const version = nonEmptyString(record.version);
  const runId = nonEmptyString(record.run_id);
  const checkpoint = nonEmptyString(record.checkpoint);
  const decision = nonEmptyString(record.decision);
  const summary = nonEmptyString(record.summary);
  if (version !== RIDDLE_PROOF_CHECKPOINT_RESPONSE_VERSION || !runId || !checkpoint || !decision || !summary) {
    return null;
  }
  return compactRecord({
    version: RIDDLE_PROOF_CHECKPOINT_RESPONSE_VERSION,
    run_id: runId,
    checkpoint,
    resume_token: nonEmptyString(record.resume_token),
    decision,
    summary,
    payload: jsonCloneRecord(record.payload),
    reasons: Array.isArray(record.reasons) ? record.reasons.filter((item): item is string => typeof item === "string") : undefined,
    continue_with_stage: nonEmptyString(record.continue_with_stage) as RiddleProofStage | undefined,
    source: jsonCloneRecord(record.source),
    created_at: nonEmptyString(record.created_at) || timestamp(),
  }) as RiddleProofCheckpointResponse;
}

function defaultContinueStage(packet: RiddleProofCheckpointPacket, decision: string): RiddleProofStage | undefined {
  if (decision === "ready_for_author" || decision === "author_packet" || decision === "needs_author") return "author";
  if (decision === "implementation_complete") return "verify";
  if (decision === "ready_to_ship") return "ship";
  if (decision === "revise_capture") return "verify";
  if (decision === "retry_recon" || decision === "recon_stuck" || decision === "needs_recon") return "recon";
  if (decision === "needs_implementation") return "implement";
  if (decision === "continue_stage" || decision === "retry_stage") return packet.stage;
  return undefined;
}

function templatePayloadFor(packet: RiddleProofCheckpointPacket, decision: string): Record<string, unknown> | undefined {
  if (decision === "author_packet") {
    const expectedTerminalPath =
      packet.state_excerpt?.expected_terminal_path ||
      packet.state_excerpt?.requested_expected_terminal_path ||
      null;
    const expectedStartPath = packet.state_excerpt?.expected_start_path || packet.state_excerpt?.server_path || null;
    return {
      proof_plan: "TODO: describe the exact proof plan and stop condition.",
      capture_script: "TODO: provide the capture script that collects required artifacts/evidence.",
      refined_inputs: {
        server_path: packet.state_excerpt?.server_path || null,
        wait_for_selector: packet.state_excerpt?.wait_for_selector || null,
        reference: packet.state_excerpt?.reference || null,
        expected_start_path: expectedStartPath,
        expected_terminal_path: expectedTerminalPath,
      },
      interaction_contract: {
        start_path: expectedStartPath,
        expected_terminal_path: expectedTerminalPath,
        action: "TODO: describe the browser interaction, for example click the visible Proof nav link.",
        assertions: [],
      },
      summary: "TODO: summarize why this proof packet targets the requested change.",
    };
  }
  if (decision === "implementation_complete") {
    return {
      changed_files: [],
      tests_run: [],
      implementation_notes: "TODO: summarize the direct edits made in the after worktree.",
    };
  }
  if (decision === "ready_for_author") {
    return {
      baseline_understanding: {
        reference: "TODO",
        target_route: "TODO",
        before_evidence_url: "TODO",
        visible_before_state: "TODO",
        relevant_elements: [],
        requested_change: packet.change_request,
        proof_focus: "TODO",
        stop_condition: "TODO",
        quality_risks: [],
      },
      refined_inputs: {
        server_path: null,
        wait_for_selector: null,
        reference: null,
      },
    };
  }
  if (packet.kind === "assess_proof" || packet.kind === "recover_evidence" || packet.stage === "verify") {
    return {
      recommended_stage: defaultContinueStage(packet, decision) || packet.stage,
      evidence_issue_code: packet.evidence_excerpt?.evidence_issue_code || null,
      visual_delta: packet.evidence_excerpt?.visual_delta || null,
    };
  }
  return undefined;
}

export function createCheckpointResponseTemplate(
  packet: RiddleProofCheckpointPacket,
  input: {
    decision?: string;
    summary?: string;
    payload?: Record<string, unknown>;
    reasons?: string[];
    continue_with_stage?: RiddleProofStage;
    source_kind?: NonNullable<RiddleProofCheckpointResponse["source"]>["kind"];
    created_at?: string;
  } = {},
): RiddleProofCheckpointResponse {
  const allowed = Array.isArray(packet.allowed_decisions) ? packet.allowed_decisions : [];
  const decision = input.decision && allowed.includes(input.decision)
    ? input.decision
    : allowed[0] || "blocked";
  const continueStage = input.continue_with_stage || defaultContinueStage(packet, decision);
  return compactRecord({
    version: RIDDLE_PROOF_CHECKPOINT_RESPONSE_VERSION,
    run_id: packet.run_id,
    checkpoint: packet.checkpoint,
    resume_token: packet.resume_token,
    decision,
    summary: input.summary || `TODO: explain checkpoint decision ${decision}.`,
    payload: input.payload || templatePayloadFor(packet, decision),
    reasons: input.reasons || ["TODO: replace with concrete reason(s)."],
    continue_with_stage: continueStage,
    source: {
      kind: input.source_kind || "codex",
    },
    created_at: input.created_at || timestamp(),
  }) as RiddleProofCheckpointResponse;
}

export function checkpointSummaryFromState(
  state: RiddleProofRunState,
  engineStatePath?: string | null,
): RiddleProofCheckpointSummary {
  const history = state.checkpoint_history || [];
  const packets = history.filter((entry) => entry.packet);
  const responses = history.filter((entry) => entry.response);
  const duplicateResponses = (state.events || []).filter((event) => event.kind === "checkpoint.response.duplicate");
  const latestPacketEntry = [...history].reverse().find((entry) => entry.packet);
  const latestResponseEntry = [...history].reverse().find((entry) => entry.response);
  const latestPacket = state.checkpoint_packet || latestPacketEntry?.packet;
  const latestResponse = latestResponseEntry?.response;
  const latestResumeToken = latestPacket?.resume_token || null;
  const latestResponseToken = latestResponse?.resume_token || null;
  const tokenMatches =
    !latestResponse ? null :
      latestResumeToken && latestResponseToken ? latestResumeToken === latestResponseToken :
        latestResumeToken || latestResponseToken ? false :
          null;
  return compactRecord({
    pending: Boolean(state.checkpoint_packet),
    packet_count: packets.length,
    response_count: responses.length,
    duplicate_response_count: duplicateResponses.length,
    latest_checkpoint: state.checkpoint_packet?.checkpoint || latestResponse?.checkpoint || state.last_checkpoint || null,
    latest_stage: state.checkpoint_packet?.stage || latestResponse?.continue_with_stage || state.current_stage || null,
    latest_kind: state.checkpoint_packet?.kind || latestPacket?.kind || null,
    latest_decision: latestResponse?.decision || null,
    latest_packet_summary: latestPacket?.summary || null,
    latest_response_summary: latestResponse?.summary || null,
    latest_resume_token: latestResumeToken,
    latest_response_token: latestResponseToken,
    token_matches: tokenMatches,
    last_packet_at: latestPacketEntry?.ts || null,
    last_response_at: latestResponseEntry?.ts || null,
    state_paths: statePathsForRunState(state, engineStatePath),
  }) as RiddleProofCheckpointSummary;
}

export function isDuplicateCheckpointResponse(
  state: RiddleProofRunState,
  response: RiddleProofCheckpointResponse,
) {
  const identity = checkpointResponseIdentity(response);
  return (state.checkpoint_history || []).some((entry) => (
    entry.response ? checkpointResponseIdentity(entry.response) === identity : false
  ));
}

export function checkpointResponseIdentity(response: RiddleProofCheckpointResponse) {
  const logicalResponse = compactRecord({
    run_id: response.run_id,
    checkpoint: response.checkpoint,
    resume_token: response.resume_token,
    decision: response.decision,
    summary: response.summary,
    payload: response.payload,
    reasons: response.reasons,
    continue_with_stage: response.continue_with_stage,
    source: response.source,
  });
  return crypto.createHash("sha256").update(stableJson(logicalResponse)).digest("hex").slice(0, 24);
}

export function authorPacketPayloadFromCheckpointResponse(
  response: RiddleProofCheckpointResponse,
): Record<string, unknown> | null {
  if (response.decision !== "author_packet") return null;
  const payload = recordValue(response.payload);
  if (!payload) return null;
  const nested = recordValue(payload.author_packet);
  const candidate = nested || payload;
  if (!nonEmptyString(candidate.proof_plan) || !nonEmptyString(candidate.capture_script)) return null;
  return candidate;
}

export function proofContractFromAuthorCheckpointResponse(
  response: RiddleProofCheckpointResponse,
  packet: RiddleProofCheckpointPacket,
  payload: Record<string, unknown>,
): RiddleProofProofContract {
  const refinedInputs = recordValue(payload.refined_inputs) || {};
  return compactRecord({
    version: "riddle-proof.proof-contract.v1",
    checkpoint: packet.checkpoint,
    source_response: compactRecord({
      run_id: response.run_id,
      checkpoint: response.checkpoint,
      resume_token: response.resume_token,
      decision: response.decision,
      summary: response.summary,
      created_at: response.created_at,
    }),
    proof_plan: nonEmptyString(payload.proof_plan),
    capture_script: nonEmptyString(payload.capture_script),
    artifact_contract: jsonCloneRecord(payload.artifact_contract),
    assertions: jsonCloneValue(payload.assertions),
    interaction_contract:
      jsonCloneRecord(payload.interaction_contract) ||
      jsonCloneRecord(payload.interactionContract),
    baseline_understanding:
      jsonCloneRecord(payload.baseline_understanding) ||
      jsonCloneRecord(payload.recon_baseline_understanding) ||
      jsonCloneRecord(packet.state_excerpt?.recon_baseline_understanding),
    route_assumptions: compactRecord({
      server_path:
        nonEmptyString(refinedInputs.server_path) ||
        nonEmptyString(payload.server_path) ||
        nonEmptyString(packet.state_excerpt?.server_path),
      wait_for_selector:
        nonEmptyString(refinedInputs.wait_for_selector) ||
        nonEmptyString(payload.wait_for_selector) ||
        nonEmptyString(packet.state_excerpt?.wait_for_selector),
      reference: nonEmptyString(refinedInputs.reference) || nonEmptyString(payload.reference),
      expected_path: nonEmptyString(payload.expected_path) || nonEmptyString(refinedInputs.expected_path),
      expected_terminal_path:
        nonEmptyString(refinedInputs.expected_terminal_path) ||
        nonEmptyString(payload.expected_terminal_path) ||
        nonEmptyString(refinedInputs.expected_after_path) ||
        nonEmptyString(payload.expected_after_path),
    }),
    stop_condition: nonEmptyString(payload.stop_condition),
    rationale: jsonCloneValue(payload.rationale),
    verdict_dimensions: jsonCloneRecord(payload.verdict_dimensions),
    payload: jsonCloneRecord(payload),
    created_at: timestamp(),
  }) as RiddleProofProofContract;
}
