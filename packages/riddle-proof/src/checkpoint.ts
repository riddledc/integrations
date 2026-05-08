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
          "For decision=author_packet, provide the proof packet itself or {author_packet:{...}} with proof_plan and capture_script.",
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
      reference: input.request.reference || fullState.reference,
      server_path: fullState.server_path,
      wait_for_selector: fullState.wait_for_selector,
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
    nonEmptyString(input.request.verification_mode) ||
    nonEmptyString(fullState.verification_mode) ||
    nonEmptyString(bundle?.verification_mode) ||
    "proof";
  const visualDeltaRequired =
    requiredSignals?.visual_delta === true ||
    verificationModeRequiresVisualDelta(verificationMode);
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
      visual_delta_ready: visualDelta?.status === "measured" && visualDelta?.passed === true,
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
  return buildAuthorCheckpointPacket(input);
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
    }),
    stop_condition: nonEmptyString(payload.stop_condition),
    rationale: jsonCloneValue(payload.rationale),
    verdict_dimensions: jsonCloneRecord(payload.verdict_dimensions),
    payload: jsonCloneRecord(payload),
    created_at: timestamp(),
  }) as RiddleProofProofContract;
}
