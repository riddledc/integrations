import type {
  RiddleProofGroundedCollectorRef,
  RiddleProofProfile,
  RiddleProofSourceIdentity,
} from "@riddledc/riddle-proof-core";
import type {
  ApplicationDiagnostic,
  ApplicationFinding,
  ApplicationProjectionResult,
  ApplicationVerification,
} from "riddle-proof-application-projection-experiment";

export const PROOF_GUIDED_CTA_CHANGE_CONTRACT_VERSION =
  "riddle-proof.proof-guided-cta-change-contract.v1" as const;
export const PROOF_GUIDED_CTA_CHANGE_PROTOCOL_VERSION =
  "riddle-proof.proof-guided-cta-change.v1" as const;
export const PROOF_GUIDED_CTA_CHANGE_AUTHORITY_VERSION =
  "riddle-proof.proof-guided-cta-change-authority.v1" as const;

export const CTA_REQUIREMENT_IDS = [
  "primary-cta-correct",
  "routes-preserved",
  "responsive-layout-healthy",
  "runtime-healthy",
] as const;

export type CtaRequirementId = (typeof CTA_REQUIREMENT_IDS)[number];
export type CtaRequirementStatus = "satisfied" | "failed" | "unresolved";
export type CtaDisposition =
  | "conforms"
  | "does_not_conform"
  | "stale"
  | "could_not_check";

export type CtaJsonValue =
  | null
  | boolean
  | number
  | string
  | { readonly [key: string]: CtaJsonValue }
  | readonly CtaJsonValue[];

export interface CtaClaimRef {
  claim_id: string;
  claim_version: string;
  parameters?: Readonly<Record<string, CtaJsonValue>>;
}

export interface CtaRequirementDefinition {
  requirement_id: CtaRequirementId;
  label: string;
  failure_summary: string;
  repair_guidance: string;
}

export interface PinnedCtaChangeContract {
  contract_format: typeof PROOF_GUIDED_CTA_CHANGE_CONTRACT_VERSION;
  id: string;
  version: string;
  digest: string;
  protocol_version: typeof PROOF_GUIDED_CTA_CHANGE_PROTOCOL_VERSION;
  profile: {
    profile_name: string;
    source_json: string;
    source_digest: string;
  };
  expected_root: {
    claim_id: string;
    claim_version: string;
  };
  requirements: readonly CtaRequirementDefinition[];
  non_conclusions: readonly string[];
}

export interface CtaResolvedCandidateScope {
  repository: string;
  revision: string;
  environment: string;
  target: string;
}

export interface CtaSemanticScope extends CtaResolvedCandidateScope {
  proof_attempt: string;
}

export interface CtaCandidateResolution {
  candidate_ref: string;
  scope: CtaResolvedCandidateScope;
}

export interface CtaCandidateResolver {
  resolve(input: {
    candidate_ref: string;
    contract: PinnedCtaChangeContract;
  }): Promise<CtaCandidateResolution>;
}

export interface ResolvedCtaCandidate {
  candidate_ref: string;
  subject: {
    id: string;
    digest: string;
    kind: "browser_cta_change";
  };
  scope: CtaSemanticScope;
  profile: {
    profile_name: string;
    source_digest: string;
    profile_digest: string;
    normalized_profile: RiddleProofProfile;
  };
}

export interface CtaAttemptAuthority {
  authority_id: string;
  authority_version: string;
  authority_digest: string;
  specification: {
    ref: {
      id: string;
      version: string;
      digest: string;
    };
    expected_root: CtaClaimRef;
    requirements: readonly CtaRequirementDefinition[];
    non_conclusions: readonly string[];
  };
}

export interface CtaReportProviderInput {
  contract: PinnedCtaChangeContract;
  candidate: ResolvedCtaCandidate;
  authority: CtaAttemptAuthority;
}

export interface CtaReportProvider {
  check(input: CtaReportProviderInput): Promise<ApplicationVerification>;
}

export type CtaProjectionResult = ApplicationProjectionResult;
export type CtaProjectionFinding = ApplicationFinding;
export type CtaProjectionDiagnostic = ApplicationDiagnostic;

export type CtaInspectionLevel = "outcome" | "meaning" | "audit";

export interface CtaOutcomeView {
  level: "outcome";
  check_ref: string;
  candidate_ref: string;
  disposition: CtaDisposition;
  current: boolean;
  headline: string;
  next_action: string;
}

export interface CtaMeaningView extends Omit<CtaOutcomeView, "level"> {
  level: "meaning";
  findings: readonly {
    requirement_id: string;
    label: string;
    explanation: string;
    repair_guidance?: string;
  }[];
  non_conclusions: readonly string[];
}

export interface CtaAuditView extends Omit<CtaMeaningView, "level"> {
  level: "audit";
  contract: { id: string; version: string; digest: string };
  subject: ResolvedCtaCandidate["subject"] | null;
  authority: {
    authority_id: string;
    authority_version: string;
    authority_digest: string;
  } | null;
  specification: CtaAttemptAuthority["specification"]["ref"] | null;
  profile_digest: string | null;
  proof_id: string | null;
  root_certificate_id: string | null;
  observed_root: CtaClaimRef | null;
  expected_root: CtaClaimRef | null;
  verification: CtaProjectionResult["verification"] | null;
  diagnostics: readonly CtaProjectionDiagnostic[];
}

export type CtaInspectionView =
  | CtaOutcomeView
  | CtaMeaningView
  | CtaAuditView;

export interface CtaCheckRecord {
  check_ref: string;
  candidate_ref: string;
  contract: PinnedCtaChangeContract;
  candidate: ResolvedCtaCandidate | null;
  authority: CtaAttemptAuthority | null;
  projection: CtaProjectionResult | null;
  diagnostics: readonly CtaProjectionDiagnostic[];
}

export interface ProofGuidedCtaChangeClient {
  readonly contract: PinnedCtaChangeContract;
  check(request: { candidate_ref: string }): Promise<CtaOutcomeView>;
  inspect(check_ref: string, level?: CtaInspectionLevel): CtaInspectionView;
}

export interface ProofGuidedCtaChangeClientConfiguration {
  contract: PinnedCtaChangeContract;
  candidate_resolver: CtaCandidateResolver;
  report_provider: CtaReportProvider;
}

export interface LocalCtaBrowserReportSigningKey {
  key_id: string;
  private_key_pkcs8_base64: string;
  public_key_spki_base64: string;
}

export interface LocalCtaBrowserReportAttempt {
  candidate_ref: string;
  statuses: Readonly<Record<CtaRequirementId, CtaRequirementStatus>>;
  check_report_id: string;
  sealed_root_id: string | null;
  profile_status: string;
}

export interface LocalCtaReportProviderConfiguration {
  artifacts_directory: string;
  signing_key: LocalCtaBrowserReportSigningKey;
  collector: RiddleProofGroundedCollectorRef;
  source_for(input: { candidate: ResolvedCtaCandidate }): RiddleProofSourceIdentity;
  extra_http_headers_for?(input: {
    candidate: ResolvedCtaCandidate;
  }): Promise<Readonly<Record<string, string>> | undefined>
    | Readonly<Record<string, string>>
    | undefined;
  timeout_seconds_for?(input: {
    candidate: ResolvedCtaCandidate;
  }): number | undefined;
  consumption_time_for?(input: {
    candidate: ResolvedCtaCandidate;
    ordinary_consumption_time: string;
  }): string;
  max_capture_age_ms?: number;
  max_grounded_age_ms?: number;
  max_capture_future_skew_ms?: number;
  max_assessment_future_skew_ms?: number;
  on_attempt?(input: LocalCtaBrowserReportAttempt): void;
}
