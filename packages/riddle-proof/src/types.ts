export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type RiddleProofStatus =
  | "running"
  | "awaiting_checkpoint"
  | "blocked"
  | "failed"
  | "ready_to_ship"
  | "shipped"
  | "completed";

export type RiddleProofPrLifecycleStatus =
  | "unknown"
  | "open"
  | "merged"
  | "closed"
  | "not_found"
  | "unavailable"
  | (string & {});

export type RiddleProofVerificationMode =
  | "proof"
  | "visual"
  | "interaction"
  | "playable"
  | "gameplay"
  | "render"
  | "data"
  | "json"
  | "audio"
  | "log"
  | "logs"
  | "metric"
  | "metrics"
  | (string & {});

export type RiddleProofDecision =
  | "ready_to_ship"
  | "needs_richer_proof"
  | "revise_capture"
  | "needs_recon"
  | "needs_implementation"
  | (string & {});

export type RiddleProofStage =
  | "preflight"
  | "setup"
  | "recon"
  | "author"
  | "implement"
  | "prove"
  | "verify"
  | "ship"
  | "notify"
  | (string & {});

export type RiddleProofArtifactRole =
  | "baseline"
  | "after_proof"
  | "incidental"
  | "diagnostic"
  | (string & {});

export interface RiddleProofViewportCapture {
  name?: string;
  slug?: string;
  width?: number;
  height?: number;
  screenshot_label?: string;
  screenshot_url?: string;
}

export interface RiddleProofViewportMatrixStatus {
  status?: "not_requested" | "not_run" | "complete" | "incomplete" | (string & {});
  requested?: RiddleProofViewportCapture[];
  executed?: RiddleProofViewportCapture[];
  missing?: RiddleProofViewportCapture[];
}

export interface RiddleProofRunParams {
  repo?: string;
  branch?: string;
  change_request?: string;
  commit_message?: string;
  prod_url?: string;
  capture_script?: string;
  success_criteria?: string;
  assertions?: JsonValue;
  verification_mode?: RiddleProofVerificationMode;
  resume_session?: string;
  target_image_url?: string;
  target_image_hash?: string;
  viewport_matrix?: JsonValue;
  deterministic_setup?: JsonValue;
  reference?: "prod" | "before" | "both";
  base_branch?: string;
  before_ref?: string;
  allow_static_preview_fallback?: boolean;
  context?: string;
  reviewer?: string;
  mode?: string;
  implementation_mode?: "change" | "none" | (string & {});
  require_diff?: boolean;
  allow_code_changes?: boolean;
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
  color_scheme?: "dark" | "light" | (string & {});
  wait_for_selector?: string;
  ship_mode?: "none" | "ship";
  leave_draft?: boolean;
  engine_state_path?: string;
  harness_state_path?: string;
  riddle_engine_module_url?: string;
  max_iterations?: number;
  auto_approve?: boolean;
  dry_run?: boolean;
  integration_context?: IntegrationContext;
}

export type RiddleProofCheckpointVisibility =
  | "liveblog"
  | "quiet"
  | "terminal_only"
  | "manual"
  | (string & {});

export type RiddleProofCheckpointRole =
  | "main_agent"
  | "builder_agent"
  | "proof_author"
  | "proof_judge"
  | "human"
  | "mechanical"
  | (string & {});

export interface RiddleProofCheckpointArtifact {
  role:
    | "before"
    | "prod"
    | "after"
    | "diff"
    | "log"
    | "json"
    | "har"
    | "video"
    | (string & {});
  url?: string;
  path?: string;
  name?: string;
  mime_type?: string;
  summary?: string;
}

export interface RiddleProofCheckpointRoutingHint {
  suggested_role?: RiddleProofCheckpointRole;
  visibility?: RiddleProofCheckpointVisibility;
  urgency?: "low" | "normal" | "high" | (string & {});
  can_auto_answer?: boolean;
}

export interface RiddleProofCheckpointPacket {
  version: "riddle-proof.checkpoint.v1";
  run_id: string;
  state_path?: string;
  packet_id?: string;
  stage: RiddleProofStage;
  checkpoint: string;
  kind:
    | "assess_recon"
    | "author_proof"
    | "implement_change"
    | "assess_proof"
    | "recover_evidence"
    | "human_review"
    | "advance_decision"
    | (string & {});
  summary: string;
  question: string;
  change_request: string;
  context?: string;
  artifacts?: RiddleProofCheckpointArtifact[];
  state_excerpt?: Record<string, unknown>;
  evidence_excerpt?: Record<string, unknown>;
  artifact_contract?: Record<string, unknown>;
  allowed_decisions: string[];
  response_schema: Record<string, unknown>;
  routing_hint?: RiddleProofCheckpointRoutingHint;
  resume_token?: string;
  created_at: string;
}

export interface RiddleProofCheckpointResponse {
  version: "riddle-proof.checkpoint_response.v1";
  run_id: string;
  checkpoint: string;
  packet_id?: string;
  resume_token?: string;
  decision: string;
  summary: string;
  payload?: Record<string, unknown>;
  reasons?: string[];
  continue_with_stage?: RiddleProofStage;
  source?: {
    kind:
      | "openclaw-main"
      | "openclaw-subagent"
      | "codex"
      | "claude-code"
      | "human"
      | "ci"
      | (string & {});
    session_id?: string;
    user_id?: string;
  };
  created_at: string;
}

export interface RiddleProofStatePaths {
  wrapper_state_path?: string | null;
  engine_state_path?: string | null;
  resume_state_path?: string | null;
}

export interface RiddleProofCheckpointSummary {
  pending: boolean;
  packet_count: number;
  response_count: number;
  duplicate_response_count?: number;
  latest_checkpoint?: string | null;
  latest_stage?: RiddleProofStage | null;
  latest_kind?: string | null;
  latest_decision?: string | null;
  latest_packet_summary?: string | null;
  latest_response_summary?: string | null;
  latest_packet_id?: string | null;
  latest_response_packet_id?: string | null;
  packet_id_matches?: boolean | null;
  latest_resume_token?: string | null;
  latest_response_token?: string | null;
  token_matches?: boolean | null;
  last_packet_at?: string | null;
  last_response_at?: string | null;
  state_paths?: RiddleProofStatePaths;
}

export interface RiddleProofProofContract {
  version: "riddle-proof.proof-contract.v1";
  checkpoint?: string | null;
  source_response?: {
    run_id?: string;
    checkpoint?: string;
    resume_token?: string;
    decision?: string;
    summary?: string;
    created_at?: string;
  };
  proof_plan?: string;
  capture_script?: string;
  artifact_contract?: Record<string, unknown>;
  assertions?: unknown;
  interaction_contract?: Record<string, unknown>;
  baseline_understanding?: Record<string, unknown>;
  route_assumptions?: Record<string, unknown>;
  stop_condition?: string;
  rationale?: unknown;
  verdict_dimensions?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  created_at: string;
}

export interface RiddleProofRunCard {
  version: "riddle-proof.run-card.v1";
  run_id: string;
  status: RiddleProofStatus;
  goal: {
    repo?: string;
    branch?: string;
    change_request?: string;
    verification_mode?: RiddleProofVerificationMode;
    success_criteria?: string;
  };
  durable_state: RiddleProofStatePaths & {
    worktree_path?: string | null;
    branch?: string | null;
  };
  current_phase: {
    stage?: RiddleProofStage | null;
    checkpoint?: string | null;
    latest_event?: string | null;
    elapsed_ms?: number;
    stage_elapsed_ms?: number;
    iterations?: number;
  };
  owner_next_action: {
    owner?: string;
    action?: string;
    checkpoint_kind?: string | null;
    allowed_decisions?: string[];
    retryable?: boolean;
    reason?: string | null;
  };
  evidence_contract: {
    verification_mode?: RiddleProofVerificationMode;
    required?: Record<string, unknown>;
    artifact_contract?: Record<string, unknown>;
    proof_plan?: string;
    stop_condition?: string;
  };
  latest_evidence: {
    before_url?: string | null;
    prod_url?: string | null;
    after_url?: string | null;
    visual_delta?: Record<string, unknown> | null;
    evidence_issue_code?: string | null;
    proof_evidence_present?: boolean;
    viewport_matrix?: RiddleProofViewportMatrixStatus;
    artifacts?: RiddleProofCheckpointArtifact[];
  };
  observability?: {
    engine_call_count?: number;
    agent_call_count?: number;
    engine_total_ms?: number;
    agent_total_ms?: number;
    max_agent_prompt_chars?: number;
    total_agent_prompt_chars?: number;
    recent_engine_timings?: Array<Record<string, unknown>>;
    recent_agent_timings?: Array<Record<string, unknown>>;
    retry_event_count?: number;
    recent_retry_reasons?: Array<Record<string, unknown>>;
  };
  stop_condition: {
    status: RiddleProofStatus;
    terminal?: boolean;
    ship_held?: boolean;
    shipping_disabled?: boolean;
    ship_authorized?: boolean;
    blocker_code?: string | null;
    blocker_message?: string | null;
    proof_decision?: RiddleProofDecision;
    merge_recommendation?: string;
    monitor_should_continue?: boolean;
  };
  updated_at: string;
}

export interface IntegrationContext {
  source?: "openclaw" | "discord" | "github" | "cli" | "riddle" | (string & {});
  channel_id?: string;
  thread_id?: string;
  message_id?: string;
  source_url?: string;
  metadata?: Record<string, unknown>;
}

export interface RiddleProofBlocker {
  code: string;
  message: string;
  checkpoint?: string | null;
  details?: Record<string, unknown>;
}

export interface RiddleProofEvent {
  ts: string;
  kind: string;
  checkpoint?: string | null;
  stage?: RiddleProofStage | null;
  summary?: string | null;
  details?: Record<string, unknown>;
}

export interface RiddleProofRunState {
  version: "riddle-proof.run-state.v1";
  run_id?: string;
  state_path?: string;
  worktree_path?: string;
  branch?: string;
  current_stage?: RiddleProofStage | null;
  stage_started_at?: string | null;
  status: RiddleProofStatus;
  ok?: boolean;
  created_at: string;
  updated_at: string;
  request: RiddleProofRunParams;
  iterations: number;
  last_checkpoint?: string | null;
  pr_url?: string;
  pr_branch?: string;
  pr_state?: RiddleProofPrLifecycleState;
  marked_ready?: boolean;
  left_draft?: boolean;
  ship_held?: boolean;
  shipping_disabled?: boolean;
  ship_authorized?: boolean;
  ci_status?: string;
  ship_commit?: string;
  ship_remote_head?: string;
  merge_commit?: string;
  merged_at?: string;
  proof_comment_url?: string;
  before_artifact_url?: string;
  prod_artifact_url?: string;
  after_artifact_url?: string;
  ship_report?: Record<string, unknown>;
  cleanup_report?: Record<string, unknown>;
  notification?: Record<string, unknown>;
  proof_decision?: RiddleProofDecision;
  merge_recommendation?: string;
  implementation_detection_summary?: string | null;
  implementation_detection?: Record<string, unknown> | null;
  proof_session?: RiddleProofVisualSession;
  viewport_matrix_status?: RiddleProofViewportMatrixStatus;
  finalized?: boolean;
  blocker?: RiddleProofBlocker;
  checkpoint_packet?: RiddleProofCheckpointPacket;
  checkpoint_summary?: RiddleProofCheckpointSummary;
  state_paths?: RiddleProofStatePaths;
  proof_contract?: RiddleProofProofContract;
  run_card?: RiddleProofRunCard;
  checkpoint_history?: Array<{
    ts: string;
    packet?: RiddleProofCheckpointPacket;
    response?: RiddleProofCheckpointResponse;
  }>;
  events: RiddleProofEvent[];
}

export interface RiddleProofRunResult {
  ok: boolean;
  status: RiddleProofStatus;
  run_id?: string;
  state_path?: string | null;
  worktree_path?: string | null;
  branch?: string | null;
  current_stage?: RiddleProofStage | null;
  iterations?: number;
  last_checkpoint?: string | null;
  last_summary?: string | null;
  event_count?: number;
  pr_url?: string;
  pr_branch?: string;
  pr_state?: RiddleProofPrLifecycleState;
  marked_ready?: boolean;
  left_draft?: boolean;
  ship_held?: boolean;
  shipping_disabled?: boolean;
  ship_authorized?: boolean;
  ci_status?: string;
  ship_commit?: string;
  ship_remote_head?: string;
  merge_commit?: string;
  merged_at?: string;
  proof_comment_url?: string;
  before_artifact_url?: string;
  prod_artifact_url?: string;
  after_artifact_url?: string;
  ship_report?: Record<string, unknown>;
  cleanup_report?: Record<string, unknown>;
  notification?: Record<string, unknown>;
  proof_decision?: RiddleProofDecision;
  merge_recommendation?: string;
  finalized?: boolean;
  blocker?: RiddleProofBlocker;
  checkpoint_packet?: RiddleProofCheckpointPacket;
  checkpoint_summary?: RiddleProofCheckpointSummary;
  state_paths?: RiddleProofStatePaths;
  proof_contract?: RiddleProofProofContract;
  run_card?: RiddleProofRunCard;
  proof_session?: RiddleProofVisualSession;
  viewport_matrix_status?: RiddleProofViewportMatrixStatus;
  evidence_bundle?: RiddleProofEvidenceBundle;
  raw?: Record<string, unknown>;
}

export interface RiddleProofRunStatusSnapshot {
  run_id: string;
  status: RiddleProofStatus;
  is_terminal?: boolean;
  monitor_should_continue?: boolean;
  current_stage?: RiddleProofStage | null;
  state_path?: string | null;
  worktree_path?: string | null;
  branch?: string | null;
  pr_url?: string | null;
  pr_branch?: string | null;
  pr_state?: RiddleProofPrLifecycleState;
  ship_held?: boolean;
  shipping_disabled?: boolean;
  ship_authorized?: boolean;
  ci_status?: string;
  ship_commit?: string;
  ship_remote_head?: string;
  merge_commit?: string;
  merged_at?: string;
  proof_comment_url?: string;
  cleanup_report?: Record<string, unknown>;
  implementation_detection_summary?: string | null;
  implementation_detection?: Record<string, unknown> | null;
  iterations: number;
  last_checkpoint?: string | null;
  updated_at: string;
  elapsed_ms?: number;
  stage_elapsed_ms?: number;
  blocker?: RiddleProofBlocker;
  checkpoint_packet?: RiddleProofCheckpointPacket;
  checkpoint_summary?: RiddleProofCheckpointSummary;
  state_paths?: RiddleProofStatePaths;
  proof_contract?: RiddleProofProofContract;
  run_card?: RiddleProofRunCard;
  viewport_matrix_status?: RiddleProofViewportMatrixStatus;
  latest_event?: RiddleProofEvent;
}

export interface RiddleProofEvidenceBundle {
  verification_mode: RiddleProofVerificationMode;
  baselines?: EvidenceReference[];
  after?: EvidenceReference;
  artifacts?: EvidenceArtifact[];
  proof_session?: RiddleProofVisualSession;
  viewport_matrix?: RiddleProofViewportMatrixStatus;
  proof_evidence?: unknown;
  playability_evidence?: unknown;
  proof_evidence_sample?: unknown;
  assertions?: JsonValue;
  semantic_context?: Record<string, unknown>;
  summary?: string;
  notes?: string[];
}

export interface EvidenceReference {
  kind: "before" | "prod" | "after" | "comparison" | (string & {});
  role?: RiddleProofArtifactRole;
  url?: string;
  path?: string;
  observed_path?: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface EvidenceArtifact {
  name: string;
  kind?: "screenshot" | "json" | "log" | "metric" | "audio" | "video" | (string & {});
  role?: RiddleProofArtifactRole;
  url?: string;
  path?: string;
  content_type?: string;
  size_bytes?: number;
  metadata?: Record<string, unknown>;
}

export interface RiddleProofAssessment {
  decision: RiddleProofDecision;
  summary: string;
  recommended_stage?: RiddleProofStage;
  continue_with_stage?: RiddleProofStage;
  escalation_target?: "agent" | "human" | (string & {});
  reasons?: string[];
  source?: "supervising_agent" | "supervisor" | "human" | (string & {});
}

export interface PreflightAdapterInput {
  request: RiddleProofRunParams;
  state: RiddleProofRunState;
}

export interface PreflightAdapterResult {
  ok: boolean;
  warnings?: string[];
  degraded_capabilities?: string[];
  blockers?: string[];
  raw?: Record<string, unknown>;
}

export interface PreflightAdapter {
  preflight(input: PreflightAdapterInput): Promise<PreflightAdapterResult>;
}

export interface SetupAdapterInput {
  request: RiddleProofRunParams;
  state: RiddleProofRunState;
}

export interface SetupAdapterResult {
  ok: boolean;
  workdir?: string;
  worktree_path?: string;
  branch?: string;
  cleanup_policy?: "reuse" | "delete_on_success" | "delete_on_finish" | "leave_for_debug" | (string & {});
  evidence_context?: RiddleProofEvidenceBundle;
  blockers?: string[];
  raw?: Record<string, unknown>;
}

export interface SetupAdapter {
  setup(input: SetupAdapterInput): Promise<SetupAdapterResult>;
}

export interface ImplementationAdapterInput {
  workdir: string;
  change_request: string;
  evidence_context?: RiddleProofEvidenceBundle;
  state?: RiddleProofRunState;
}

export interface ImplementationAdapterResult {
  ok: boolean;
  changed_files?: string[];
  implementation_notes?: string;
  tests_run?: string[];
  blockers?: string[];
  raw?: Record<string, unknown>;
}

export interface ImplementationAdapter {
  implement(input: ImplementationAdapterInput): Promise<ImplementationAdapterResult>;
}

export interface ProofAdapterInput {
  state: RiddleProofRunState;
  implementation?: ImplementationAdapterResult;
  evidence_context?: RiddleProofEvidenceBundle;
}

export interface ProofAdapterResult {
  ok: boolean;
  evidence_bundle?: RiddleProofEvidenceBundle;
  blockers?: string[];
  raw?: Record<string, unknown>;
}

export interface ProofAdapter {
  prove(input: ProofAdapterInput): Promise<ProofAdapterResult>;
}

export interface JudgeAdapter {
  assessProof(input: {
    state: RiddleProofRunState;
    evidence_bundle: RiddleProofEvidenceBundle;
  }): Promise<RiddleProofAssessment>;
}

export interface ShipAdapter {
  ship(input: {
    state: RiddleProofRunState;
    assessment: RiddleProofAssessment;
  }): Promise<RiddleProofTerminalMetadata>;
}

export interface NotificationAdapter {
  notify(input: {
    state: RiddleProofRunState;
    result: RiddleProofRunResult;
  }): Promise<Record<string, unknown>>;
}

export interface RiddleProofTerminalMetadata {
  pr_url?: string;
  pr_branch?: string;
  pr_state?: RiddleProofPrLifecycleState;
  marked_ready?: boolean;
  left_draft?: boolean;
  ship_held?: boolean;
  shipping_disabled?: boolean;
  ship_authorized?: boolean;
  ci_status?: string;
  ship_commit?: string;
  ship_remote_head?: string;
  merge_commit?: string;
  merged_at?: string;
  proof_comment_url?: string;
  before_artifact_url?: string;
  prod_artifact_url?: string;
  after_artifact_url?: string;
  ship_report?: Record<string, unknown>;
  cleanup_report?: Record<string, unknown>;
  notification?: Record<string, unknown>;
  proof_decision?: RiddleProofDecision;
  merge_recommendation?: string;
  finalized?: boolean;
}

export interface RiddleProofPrLifecycleState {
  status: RiddleProofPrLifecycleStatus;
  pr_url?: string;
  pr_number?: string;
  repo?: string;
  head_branch?: string;
  base_branch?: string;
  merge_commit?: string;
  merged_at?: string;
  closed_at?: string;
  checked_at?: string;
  source?: string;
  next_action?: string;
  cleanup?: Record<string, unknown>;
}

export interface RiddleProofVisualSession {
  version: "riddle-proof.visual-session.v1";
  session_id: string;
  run_id?: string;
  parent_session_id?: string | null;
  parent_fingerprint?: string | null;
  created_at: string;
  fingerprint: string;
  fingerprint_basis: RiddleProofVisualSessionFingerprintBasis;
  repo?: string;
  branch?: string;
  route?: {
    path?: string;
    observed_after_path?: string;
  };
  reference?: string;
  verification_mode?: string;
  target_image?: {
    url?: string;
    hash?: string;
  };
  viewport_matrix?: JsonValue;
  deterministic_setup?: JsonValue;
  capture?: {
    proof_plan?: string;
    capture_script?: string;
    wait_for_selector?: string;
  };
  assertions?: JsonValue;
  artifacts?: {
    before?: string;
    prod?: string;
    after?: string;
    session?: string;
    outputs?: EvidenceArtifact[];
  };
  evidence?: {
    visual_delta?: JsonValue;
    viewport_matrix?: RiddleProofViewportMatrixStatus;
    semantic_context?: JsonValue;
    artifact_contract?: JsonValue;
    artifact_usage?: JsonValue;
  };
  status?: string;
}

export interface RiddleProofVisualSessionFingerprintBasis {
  version: "riddle-proof.visual-session.fingerprint.v1";
  repo?: string;
  route?: string;
  wait_for_selector?: string;
  reference?: string;
  verification_mode?: string;
  target_image_url?: string;
  target_image_hash?: string;
  viewport_matrix?: JsonValue;
  deterministic_setup?: JsonValue;
  assertions?: JsonValue;
  capture_script_hash?: string;
}
