export const APPLICATION_VERIFICATION_VERSION =
  "riddle-proof.application-verification.v1" as const;

export const APPLICATION_PROJECTION_VERSION =
  "riddle-proof.application-projection.v1" as const;

export const APPLICATION_PROOF_ENVELOPE_VERSION =
  "riddle-proof.application-proof-envelope.v1" as const;

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue =
  | JsonPrimitive
  | { readonly [key: string]: JsonValue }
  | readonly JsonValue[];

export type ApplicationDisposition =
  | "conforms"
  | "does_not_conform"
  | "stale"
  | "could_not_check";

export interface ApplicationSpecificationRef {
  id: string;
  version: string;
  digest: string;
}

export interface ApplicationSubjectRef {
  id: string;
  digest: string;
  kind?: string;
}

export interface ApplicationClaimRef {
  claim_id: string;
  claim_version: string;
  parameters?: Readonly<Record<string, JsonValue>>;
}

export interface ApplicationRequirementDefinition {
  requirement_id: string;
  label: string;
  failure_summary: string;
  repair_guidance?: string;
}

export interface ApplicationSpecification {
  ref: ApplicationSpecificationRef;
  expected_root: ApplicationClaimRef;
  requirements: readonly ApplicationRequirementDefinition[];
  non_conclusions?: readonly string[];
}

/**
 * A trust root supplied when the application runtime is constructed.
 *
 * It is deliberately not part of ApplicationRunRequest. A caller can select a
 * subject to check, but cannot replace the governing specification, expected
 * semantic root, requirement labels, or repair guidance for that run.
 */
export interface ApplicationAuthority {
  authority_id: string;
  authority_version: string;
  authority_digest: string;
  specification: ApplicationSpecification;
}

export interface ApplicationAuthorityRef {
  authority_id: string;
  authority_version: string;
  authority_digest: string;
}

export interface ApplicationRunRequest {
  subject: ApplicationSubjectRef;
}

export interface ApplicationRequirementVerification {
  requirement_id: string;
  status: "satisfied" | "failed" | "unresolved";
  evidence_ids: readonly string[];
  diagnostic_code?: string;
}

export interface ApplicationCheckedMeaningFrontierEntry {
  certificate_id: string;
  bundle_id: string;
  receipt_id: string;
  statement_digest: string;
  artifact_manifest_digest: string;
  observation_digest: string;
  captured_at: string;
}

/**
 * Content-light structural provenance adapted from
 * explainRiddleProofCheckedMeaningClosure. It contains identities and digests,
 * not captured artifact bytes or producer-authored prose.
 */
export interface ApplicationCheckedMeaningExplanation {
  root_certificate_id: string;
  node_count: number;
  grounded_leaf_count: number;
  checked_composition_count: number;
  node_certificate_ids: readonly string[];
  grounded_frontier: readonly ApplicationCheckedMeaningFrontierEntry[];
}

export type ApplicationCurrentness =
  | {
      status: "current";
      consumption_time: string;
    }
  | {
      status: "stale";
      consumption_time: string;
      stale_certificate_ids: readonly [string, ...string[]];
    }
  | {
      status: "unresolved";
      diagnostic_code: string;
    };

export interface ApplicationVerifiedProofRoot {
  root_certificate_id: string;
  claim: ApplicationClaimRef;
  /**
   * True only when replay established the authority's successful expected
   * semantic root. A replay-verified negative report normally sets this false.
   */
  expected_root_established: boolean;
}

export interface ApplicationVerifiedReplay {
  version: typeof APPLICATION_VERIFICATION_VERSION;
  verification_kind: "checked_meaning_replay";
  status: "verified";
  proof_id: string;
  authority: ApplicationAuthorityRef;
  spec: ApplicationSpecificationRef;
  subject: ApplicationSubjectRef;
  replayed_at: string;
  proof_root: ApplicationVerifiedProofRoot;
  currentness: ApplicationCurrentness;
  requirements: readonly ApplicationRequirementVerification[];
  explanation: ApplicationCheckedMeaningExplanation;
}

export interface ApplicationUnavailableReplay {
  version: typeof APPLICATION_VERIFICATION_VERSION;
  verification_kind: "checked_meaning_replay";
  status: "rejected" | "unresolved";
  proof_id: string;
  authority: ApplicationAuthorityRef;
  diagnostic_code: string;
}

/**
 * This value is produced by the independently configured verifier, never by
 * the capture/producer capability. The "verified" branch is intended to be an
 * adapter projection of actual checked-meaning replay, assessment, and
 * explanation results.
 */
export type ApplicationVerification =
  | ApplicationVerifiedReplay
  | ApplicationUnavailableReplay;

export interface ApplicationFinding {
  requirement_id: string;
  label: string;
  failure_summary: string;
  status: "failed";
  evidence_ids: readonly string[];
  repair_guidance?: string;
}

export interface ApplicationDiagnostic {
  code: string;
}

export interface ApplicationProofIdentity {
  proof_id: string | null;
  authority: ApplicationAuthorityRef;
  spec: ApplicationSpecificationRef;
  subject: ApplicationSubjectRef;
  root_certificate_id: string | null;
}

export interface ApplicationProjectionResult {
  version: typeof APPLICATION_PROJECTION_VERSION;
  disposition: ApplicationDisposition;
  current: boolean;
  summary: string;
  identity: ApplicationProofIdentity;
  expected_root: ApplicationClaimRef;
  observed_root: ApplicationClaimRef | null;
  expected_root_established: boolean;
  findings: readonly ApplicationFinding[];
  repair_guidance: readonly string[];
  non_conclusions: readonly string[];
  diagnostics: readonly ApplicationDiagnostic[];
  verification: {
    kind: "checked_meaning_replay" | "unavailable";
    status: "verified" | "rejected" | "unresolved" | "not_run";
    replayed_at?: string;
  };
  explanation: ApplicationCheckedMeaningExplanation | null;
}

export interface ApplicationChallenge {
  challenge_id: string;
  nonce: string;
  issued_at: string;
  expires_at?: string;
}

export interface ApplicationProofEnvelope<ProofPayload> {
  version: typeof APPLICATION_PROOF_ENVELOPE_VERSION;
  proof_id: string;
  authority: ApplicationAuthorityRef;
  spec: ApplicationSpecificationRef;
  subject: ApplicationSubjectRef;
  challenge_id: string;
  produced_at: string;
  payload: ProofPayload;
}

export interface ApplicationClock {
  now(): string;
}

export interface ApplicationChallengeProvider {
  issue(input: {
    authority: ApplicationAuthority;
    subject: ApplicationSubjectRef;
    requested_at: string;
  }): Promise<ApplicationChallenge>;
}

export interface ApplicationSigningKeyProvider<SigningKeyHandle> {
  get(input: {
    authority: ApplicationAuthority;
    subject: ApplicationSubjectRef;
  }): Promise<SigningKeyHandle>;
}

export interface ApplicationProofProducer<ProofPayload, SigningKeyHandle> {
  capture_and_prove(input: {
    authority: ApplicationAuthority;
    subject: ApplicationSubjectRef;
    challenge: ApplicationChallenge;
    signing_key: SigningKeyHandle;
    requested_at: string;
  }): Promise<ApplicationProofEnvelope<ProofPayload>>;
}

export interface ApplicationProofVerifier<ProofPayload> {
  verify(input: {
    authority: ApplicationAuthority;
    envelope: ApplicationProofEnvelope<ProofPayload>;
    consumption_time: string;
  }): Promise<ApplicationVerification>;
}

export interface ApplicationProofStore<ProofPayload> {
  save(envelope: ApplicationProofEnvelope<ProofPayload>): Promise<void>;
  load(proof_id: string): Promise<ApplicationProofEnvelope<ProofPayload> | null>;
}

export interface ApplicationProofRuntimeConfiguration<
  ProofPayload,
  SigningKeyHandle,
> {
  authority: ApplicationAuthority;
  clock: ApplicationClock;
  challenge_provider: ApplicationChallengeProvider;
  signing_key_provider: ApplicationSigningKeyProvider<SigningKeyHandle>;
  proof_producer: ApplicationProofProducer<ProofPayload, SigningKeyHandle>;
  verifier: ApplicationProofVerifier<ProofPayload>;
  store: ApplicationProofStore<ProofPayload>;
}

export type ApplicationInspectionLevel = "outcome" | "meaning" | "audit";

export interface ApplicationOutcomeIdentity {
  proof_id: string | null;
  specification: {
    id: string;
    version: string;
  };
  subject: {
    id: string;
    kind?: string;
  };
}

export interface ApplicationOutcomeView {
  level: "outcome";
  disposition: ApplicationDisposition;
  current: boolean;
  summary: string;
  identity: ApplicationOutcomeIdentity;
}

export interface ApplicationMeaningView extends Omit<ApplicationOutcomeView, "level"> {
  level: "meaning";
  expected_root_established: boolean;
  findings: readonly ApplicationFinding[];
  repair_guidance: readonly string[];
  non_conclusions: readonly string[];
}

export interface ApplicationAuditView extends Omit<ApplicationMeaningView, "level"> {
  level: "audit";
  binding: ApplicationProofIdentity;
  expected_root: ApplicationClaimRef;
  observed_root: ApplicationClaimRef | null;
  diagnostics: readonly ApplicationDiagnostic[];
  verification: ApplicationProjectionResult["verification"];
  explanation: ApplicationCheckedMeaningExplanation | null;
}

export type ApplicationInspectionView =
  | ApplicationOutcomeView
  | ApplicationMeaningView
  | ApplicationAuditView;

export interface ApplicationProofRuntime {
  readonly authority: ApplicationAuthority;
  check(request: ApplicationRunRequest): Promise<ApplicationProjectionResult>;
  verify(proof_id: string): Promise<ApplicationProjectionResult>;
  inspect(
    result: ApplicationProjectionResult,
    level?: ApplicationInspectionLevel,
  ): ApplicationInspectionView;
}
