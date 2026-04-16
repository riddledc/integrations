export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type RiddleProofStatus =
  | "running"
  | "blocked"
  | "failed"
  | "ready_to_ship"
  | "shipped"
  | "completed";

export type RiddleProofVerificationMode =
  | "proof"
  | "visual"
  | "interaction"
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
  reference?: "prod" | "before" | "both";
  base_branch?: string;
  before_ref?: string;
  allow_static_preview_fallback?: boolean;
  context?: string;
  reviewer?: string;
  mode?: string;
  build_command?: string;
  build_output?: string;
  server_image?: string;
  server_command?: string;
  server_port?: number;
  server_path?: string;
  use_auth?: boolean;
  color_scheme?: "dark" | "light" | (string & {});
  wait_for_selector?: string;
  ship_mode?: "none" | "ship";
  engine_state_path?: string;
  harness_state_path?: string;
  max_iterations?: number;
  auto_approve?: boolean;
  dry_run?: boolean;
  integration_context?: IntegrationContext;
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
  marked_ready?: boolean;
  notification?: Record<string, unknown>;
  proof_decision?: RiddleProofDecision;
  merge_recommendation?: string;
  finalized?: boolean;
  blocker?: RiddleProofBlocker;
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
  marked_ready?: boolean;
  notification?: Record<string, unknown>;
  proof_decision?: RiddleProofDecision;
  merge_recommendation?: string;
  finalized?: boolean;
  blocker?: RiddleProofBlocker;
  evidence_bundle?: RiddleProofEvidenceBundle;
  raw?: Record<string, unknown>;
}

export interface RiddleProofRunStatusSnapshot {
  run_id: string;
  status: RiddleProofStatus;
  current_stage?: RiddleProofStage | null;
  state_path?: string | null;
  worktree_path?: string | null;
  branch?: string | null;
  iterations: number;
  last_checkpoint?: string | null;
  updated_at: string;
  elapsed_ms?: number;
  stage_elapsed_ms?: number;
  blocker?: RiddleProofBlocker;
  latest_event?: RiddleProofEvent;
}

export interface RiddleProofEvidenceBundle {
  verification_mode: RiddleProofVerificationMode;
  baselines?: EvidenceReference[];
  after?: EvidenceReference;
  artifacts?: EvidenceArtifact[];
  proof_evidence?: unknown;
  proof_evidence_sample?: unknown;
  assertions?: JsonValue;
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
  marked_ready?: boolean;
  notification?: Record<string, unknown>;
  proof_decision?: RiddleProofDecision;
  merge_recommendation?: string;
  finalized?: boolean;
}
