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
  | "setup"
  | "recon"
  | "author"
  | "implement"
  | "verify"
  | "ship"
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
  context?: string;
  reviewer?: string;
  server_path?: string;
  wait_for_selector?: string;
  ship_mode?: "none" | "ship";
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
  state_path?: string;
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
  state_path?: string | null;
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
  url?: string;
  path?: string;
  observed_path?: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface EvidenceArtifact {
  name: string;
  kind?: "screenshot" | "json" | "log" | "metric" | "audio" | "video" | (string & {});
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
