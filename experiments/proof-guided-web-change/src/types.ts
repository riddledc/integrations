import type { RiddleProofProfile } from "@riddledc/riddle-proof-core";
import type {
  ApplicationDiagnostic,
  ApplicationFinding,
  ApplicationProjectionResult,
  ApplicationVerification,
} from "riddle-proof-application-projection-experiment";

export const PROOF_GUIDED_WEB_CHANGE_CONTRACT_VERSION =
  "riddle-proof.proof-guided-web-change-contract.v1" as const;

export const PROOF_GUIDED_WEB_CHANGE_CLIENT_VERSION =
  "riddle-proof.proof-guided-web-change-client.v1" as const;

export const PROOF_GUIDED_WEB_CHANGE_AUTHORITY_VERSION =
  "riddle-proof.proof-guided-web-change-authority.v1" as const;

export type WebChangeDisposition =
  | "conforms"
  | "does_not_conform"
  | "stale"
  | "could_not_check";

export type WebChangeProfileRole =
  | "before"
  | "action"
  | "reload"
  | "fresh_context";

export type WebChangeJsonPrimitive = null | boolean | number | string;
export type WebChangeJsonValue =
  | WebChangeJsonPrimitive
  | { readonly [key: string]: WebChangeJsonValue }
  | readonly WebChangeJsonValue[];

export interface WebChangeContractRef {
  id: string;
  version: string;
  digest: string;
}

export interface WebChangeClaimRef {
  claim_id: string;
  claim_version: string;
  parameters?: Readonly<Record<string, WebChangeJsonValue>>;
}

export interface WebChangeProfileTemplateRef {
  profile_name: string;
  source_digest: string;
}

/**
 * Exact UTF-8 JSON bytes installed as part of the contract trust root.
 *
 * Keeping the bytes, rather than accepting a path or caller-supplied profile,
 * makes the source digest independently recomputable before every attempt.
 */
export interface WebChangePinnedProfileTemplate
  extends WebChangeProfileTemplateRef {
  source_json: string;
}

export interface WebChangeRequirementDefinition {
  requirement_id: string;
  label: string;
  failure_summary: string;
  repair_guidance: string;
}

export interface WebChangeContractDefinition {
  id: string;
  version: string;
  protocol_version: string;
  transition_id: string;
  expected_root: {
    claim_id: string;
    claim_version: string;
  };
  profiles: Readonly<
    Record<WebChangeProfileRole, WebChangePinnedProfileTemplate>
  >;
  requirements: readonly WebChangeRequirementDefinition[];
  non_conclusions: readonly string[];
}

/**
 * The contract is configuration authority. It is installed when the client is
 * constructed and cannot be supplied or replaced by an ordinary check request.
 */
export interface PinnedWebChangeContract extends WebChangeContractDefinition {
  contract_format: typeof PROOF_GUIDED_WEB_CHANGE_CONTRACT_VERSION;
  digest: string;
}

export interface WebChangeSemanticScope {
  repository: string;
  revision: string;
  environment: string;
  target: string;
  proof_attempt: string;
}

export interface WebChangeResolvedProfileRef
  extends WebChangeProfileTemplateRef {
  profile_digest: string;
}

export interface WebChangeResolvedProfile
  extends WebChangeResolvedProfileRef {
  normalized_profile: RiddleProofProfile;
}

export interface WebChangeSubjectRef {
  id: string;
  digest: string;
  kind: "browser_target_transition";
}

/**
 * Exact candidate identity established by the configured trusted resolver.
 * The ordinary caller supplies only candidate_ref and cannot directly set any
 * target, revision, digest, scope, or profile.
 */
export interface ResolvedWebChangeCandidate {
  candidate_ref: string;
  subject: WebChangeSubjectRef;
  scope: WebChangeSemanticScope;
  profiles: Readonly<Record<WebChangeProfileRole, WebChangeResolvedProfile>>;
}

export interface WebChangeCheckRequest {
  candidate_ref: string;
}

export interface WebChangeResolvedCandidateScope {
  repository: string;
  revision: string;
  environment: string;
  target: string;
}

/**
 * The entire permitted output of the independently configured resolver.
 * Profiles, profile digests, proof-attempt identity, and subject identity are
 * derived later inside the trusted client from the pinned contract.
 */
export interface WebChangeCandidateResolution {
  candidate_ref: string;
  scope: WebChangeResolvedCandidateScope;
}

export interface WebChangeCandidateResolver {
  resolve(input: {
    candidate_ref: string;
    contract: PinnedWebChangeContract;
  }): Promise<WebChangeCandidateResolution>;
}

export interface WebChangeSpecificationRef {
  id: string;
  version: string;
  digest: string;
}

export interface WebChangeAttemptAuthorityRef {
  authority_id: string;
  authority_version: string;
  authority_digest: string;
}

/**
 * This is deliberately structurally compatible with ApplicationAuthority.
 * The local name keeps the web-change boundary readable while the shared
 * application projector remains the runtime authority for all dispositions.
 */
export interface WebChangeAttemptAuthority
  extends WebChangeAttemptAuthorityRef {
  specification: {
    ref: WebChangeSpecificationRef;
    expected_root: WebChangeClaimRef;
    requirements: readonly WebChangeRequirementDefinition[];
    non_conclusions: readonly string[];
  };
}

export type WebChangeProjectionFinding = ApplicationFinding;
export type WebChangeProjectionDiagnostic = ApplicationDiagnostic;
export type WebChangeProjectionResult = ApplicationProjectionResult;
export type WebChangeVerification = ApplicationVerification;

export interface WebChangeReportProviderInput {
  contract: PinnedWebChangeContract;
  candidate: ResolvedWebChangeCandidate;
  authority: WebChangeAttemptAuthority;
}

/**
 * Browser capture, signatures, and checked-meaning replay live behind this
 * capability. It returns verifier facts only. The trusted client projects
 * those facts into application meaning using the pinned authority, so a
 * provider cannot author a disposition, finding prose, or repair guidance.
 */
export interface WebChangeReportProvider {
  check(
    input: WebChangeReportProviderInput,
  ): Promise<WebChangeVerification>;
}

export type WebChangeInspectionLevel = "outcome" | "meaning" | "audit";

export interface WebChangeOutcomeView {
  level: "outcome";
  check_ref: string;
  candidate_ref: string;
  disposition: WebChangeDisposition;
  current: boolean;
  headline: string;
  next_action: string;
}

export interface WebChangeMeaningFinding {
  requirement_id: string;
  label: string;
  explanation: string;
  repair_guidance?: string;
}

export interface WebChangeMeaningView
  extends Omit<WebChangeOutcomeView, "level"> {
  level: "meaning";
  findings: readonly WebChangeMeaningFinding[];
  non_conclusions: readonly string[];
}

export interface WebChangeAuditView
  extends Omit<WebChangeMeaningView, "level"> {
  level: "audit";
  contract: WebChangeContractRef;
  subject: WebChangeSubjectRef | null;
  authority: WebChangeAttemptAuthorityRef | null;
  specification: WebChangeSpecificationRef | null;
  profile_digests: Readonly<
    Partial<Record<WebChangeProfileRole, string>>
  >;
  proof_id: string | null;
  root_certificate_id: string | null;
  observed_root: WebChangeClaimRef | null;
  expected_root: WebChangeClaimRef | null;
  verification: WebChangeProjectionResult["verification"] | null;
  diagnostics: readonly WebChangeProjectionDiagnostic[];
}

export type WebChangeInspectionView =
  | WebChangeOutcomeView
  | WebChangeMeaningView
  | WebChangeAuditView;

export interface ProofGuidedWebChangeClient {
  readonly contract: PinnedWebChangeContract;
  check(request: WebChangeCheckRequest): Promise<WebChangeOutcomeView>;
  inspect(
    check_ref: string,
    level?: WebChangeInspectionLevel,
  ): WebChangeInspectionView;
}

export interface ProofGuidedWebChangeClientConfiguration {
  contract: PinnedWebChangeContract;
  candidate_resolver: WebChangeCandidateResolver;
  report_provider: WebChangeReportProvider;
}

export interface WebChangeCheckRecord {
  check_ref: string;
  candidate_ref: string;
  contract: PinnedWebChangeContract;
  candidate: ResolvedWebChangeCandidate | null;
  authority: WebChangeAttemptAuthority | null;
  projection: WebChangeProjectionResult | null;
  diagnostics: readonly WebChangeProjectionDiagnostic[];
}
