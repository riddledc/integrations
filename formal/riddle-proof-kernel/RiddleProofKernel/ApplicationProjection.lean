import Std
import RiddleProofKernel.MeaningKernel

namespace RiddleProofKernel.ApplicationProjection

open SemanticComposition SemanticClosure MeaningKernel

/-!
`ApplicationProjection` is the domain-neutral boundary between Riddle Proof's
low-level proof machinery and an ordinary application.

An application supplies a specification expectation and a subject snapshot.
The independently configured `PinnedAuthority` remains outside that request.
A runtime report then supplies the result of cryptographic verification,
meaning-kernel evaluation, currentness assessment, and requirement checks.
This module only proves what the deterministic projection may say from those
supplied facts.

In particular, Lean does not perform cryptographic verification, obtain a
nonce, inspect a browser, parse a commercial record, authenticate a source,
or establish that a runtime observation is true.  Those are runtime
obligations.  The theorems below ensure that an application-facing
`conforms` result cannot outrun the pinned specification, expected semantic
root, verified evidence, established derivation, currentness, or requirement
results once those facts cross the boundary.
-/

structure SpecificationRef where
  domain : String
  specificationId : String
  version : String
  digest : String
  deriving DecidableEq, Repr, BEq

structure SubjectRef where
  subjectId : String
  snapshotDigest : String
  deriving DecidableEq, Repr, BEq

structure RequirementDefinition where
  requirementId : String
  label : String
  failureSummary : String
  repairGuidance : String
  deriving DecidableEq, Repr, BEq

structure AuthorityRef where
  authorityId : String
  authorityVersion : String
  authorityDigest : String
  deriving DecidableEq, Repr, BEq

/-!
The authority is configuration, not ordinary run input.  `expectedRoot` is the
exact content-addressed semantic claim that the application is permitted to
interpret as satisfaction of this specification.
-/
structure PinnedAuthority where
  specification : SpecificationRef
  expectedRoot : ClaimKey
  authorityId : String
  authorityVersion : String
  authorityDigest : String
  requirements : List RequirementDefinition
  deriving DecidableEq, Repr, BEq

namespace PinnedAuthority

def ref (authority : PinnedAuthority) : AuthorityRef where
  authorityId := authority.authorityId
  authorityVersion := authority.authorityVersion
  authorityDigest := authority.authorityDigest

end PinnedAuthority

/-!
The request can confirm which pinned specification the caller expects, but it
cannot carry a replacement rule bundle, authority digest, or semantic root.
-/
structure RunRequest where
  expectedSpecification : SpecificationRef
  subject : SubjectRef
  deriving DecidableEq, Repr, BEq

inductive RequirementStatus where
  | passed
  | failed
  | unresolved
  deriving DecidableEq, Repr, BEq

structure RequirementResult where
  requirementId : String
  status : RequirementStatus
  evidence : List EvidenceRef
  deriving DecidableEq, Repr, BEq

inductive Currentness where
  | current
  | stale
  | unresolved
  deriving DecidableEq, Repr, BEq

/-!
Every field in `RunReport` is a value supplied by the deterministic runtime
boundary.  `evidenceVerified` refers to runtime signature/content checking;
`semanticDerivationVerified` refers to checking the declared derivation
against its pinned semantic machinery.  Neither Boolean proves its own truth
inside Lean.
-/
structure RunReport where
  specification : SpecificationRef
  subject : SubjectRef
  authorityRef : AuthorityRef
  proofId : String
  rootCertificateId : CertificateId
  observedRoot : ClaimKey
  expectedRootEstablished : Bool
  evidenceVerified : Bool
  semanticDerivationVerified : Bool
  kernelDisposition : KernelDisposition
  currentness : Currentness
  requirementResults : List RequirementResult
  /-- Independently replay-verified evidence references, not synthesized from
  the requirement results being projected. -/
  verifiedEvidenceFrontier : List EvidenceRef
  deriving DecidableEq, Repr, BEq

structure ProjectionInput where
  authority : PinnedAuthority
  request : RunRequest
  report : RunReport
  deriving DecidableEq, Repr, BEq

namespace ProjectionInput

/-!
Replacing ordinary run input cannot replace the pinned authority.  This small
structural theorem is the formal counterpart of configuring authority on the
controller rather than accepting it as an argument to each check.
-/
def withRequest (input : ProjectionInput) (request : RunRequest) :
    ProjectionInput where
  authority := input.authority
  request := request
  report := input.report

@[simp] theorem with_request_preserves_pinned_authority
    (input : ProjectionInput)
    (request : RunRequest) :
    (input.withRequest request).authority = input.authority := by
  rfl

@[simp] theorem with_request_preserves_runtime_report
    (input : ProjectionInput)
    (request : RunRequest) :
    (input.withRequest request).report = input.report := by
  rfl

end ProjectionInput

/-!
`BaseVerified` is deliberately stronger than "the checker returned
something."  The caller's expectation, the runtime's actual specification,
and the runtime's actual subject must bind back to the independently pinned
authority and exact requested snapshot.  The expected success root is checked
separately only by `ConformanceBasis`: a verified failure must not pretend that
the specification's success meaning was established.
-/
def evidenceRefPresent
    (frontier : List EvidenceRef)
    (evidence : EvidenceRef) : Bool :=
  frontier.any (fun candidate => decide (candidate = evidence))

theorem evidence_ref_present_iff_mem
    {frontier : List EvidenceRef}
    {evidence : EvidenceRef} :
    evidenceRefPresent frontier evidence = true ↔ evidence ∈ frontier := by
  induction frontier with
  | nil =>
      simp [evidenceRefPresent]
  | cons head tail inductionHypothesis =>
      by_cases hHead : head = evidence
      · subst head
        simp [evidenceRefPresent]
      · have hReverse : evidence ≠ head := Ne.symm hHead
        simp [evidenceRefPresent, hHead, hReverse]

def verifiedFrontierCoversRequirementEvidence (report : RunReport) : Bool :=
  report.requirementResults.all (fun result =>
    result.evidence.all (fun evidence =>
      evidenceRefPresent report.verifiedEvidenceFrontier evidence))

def BaseVerified (input : ProjectionInput) : Prop :=
  input.request.expectedSpecification = input.authority.specification ∧
  input.report.specification = input.authority.specification ∧
  input.report.subject = input.request.subject ∧
  input.report.authorityRef = input.authority.ref ∧
  input.report.evidenceVerified = true ∧
  input.report.semanticDerivationVerified = true ∧
  verifiedFrontierCoversRequirementEvidence input.report = true

instance baseVerifiedDecidable (input : ProjectionInput) :
    Decidable (BaseVerified input) := by
  unfold BaseVerified
  infer_instance

def requiredRequirementIds (authority : PinnedAuthority) : List String :=
  authority.requirements.map (fun requirement => requirement.requirementId)

def observedRequirementIds (report : RunReport) : List String :=
  report.requirementResults.map (fun result => result.requirementId)

/-!
Exact coverage is set-like but rejects duplicate IDs on either side.  Thus a
report cannot pass by omitting a pinned check, adding an unpinned check, or
repeating one successful result in place of another.
-/
def exactRequirementCoverage (input : ProjectionInput) : Bool :=
  let required := requiredRequirementIds input.authority
  let observed := observedRequirementIds input.report
  decide (required ≠ []) &&
  (decide required.Nodup &&
  (decide observed.Nodup &&
  (required.all (fun requirementId => observed.contains requirementId) &&
   observed.all (fun requirementId => required.contains requirementId))))

def requirementsSatisfied (results : List RequirementResult) : Bool :=
  decide (results ≠ []) &&
    results.all (fun result => decide (result.status = .passed))

def hasFailedRequirement (results : List RequirementResult) : Bool :=
  results.any (fun result => decide (result.status = .failed))

def noUnresolvedRequirements (results : List RequirementResult) : Bool :=
  results.all (fun result => decide (result.status ≠ .unresolved))

def ConformanceBasis (input : ProjectionInput) : Prop :=
  BaseVerified input ∧
  input.report.expectedRootEstablished = true ∧
  input.report.observedRoot = input.authority.expectedRoot ∧
  exactRequirementCoverage input = true ∧
  input.report.kernelDisposition = .checked ∧
  input.report.currentness = .current ∧
  requirementsSatisfied input.report.requirementResults = true

instance conformanceBasisDecidable (input : ProjectionInput) :
    Decidable (ConformanceBasis input) := by
  unfold ConformanceBasis
  infer_instance

def NonConformanceBasis (input : ProjectionInput) : Prop :=
  BaseVerified input ∧
  input.report.expectedRootEstablished = false ∧
  input.report.observedRoot ≠ input.authority.expectedRoot ∧
  exactRequirementCoverage input = true ∧
  input.report.kernelDisposition = .checked ∧
  input.report.currentness = .current ∧
  hasFailedRequirement input.report.requirementResults = true ∧
  noUnresolvedRequirements input.report.requirementResults = true

instance nonConformanceBasisDecidable (input : ProjectionInput) :
    Decidable (NonConformanceBasis input) := by
  unfold NonConformanceBasis
  infer_instance

/-!
Staleness is available only after the authority/evidence/derivation boundary
has been established.  An unverified or structurally unresolved report is
`couldNotCheck`, not a trustworthy stale proof.
-/
def StaleBasis (input : ProjectionInput) : Prop :=
  BaseVerified input ∧
  exactRequirementCoverage input = true ∧
  ((input.report.expectedRootEstablished = true ∧
      input.report.observedRoot = input.authority.expectedRoot ∧
      requirementsSatisfied input.report.requirementResults = true) ∨
    (input.report.expectedRootEstablished = false ∧
      input.report.observedRoot ≠ input.authority.expectedRoot ∧
      hasFailedRequirement input.report.requirementResults = true ∧
      noUnresolvedRequirements input.report.requirementResults = true)) ∧
  input.report.kernelDisposition ≠ .unresolved ∧
  input.report.currentness ≠ .unresolved ∧
  (input.report.kernelDisposition = .stale ∨
    input.report.currentness = .stale)

instance staleBasisDecidable (input : ProjectionInput) :
    Decidable (StaleBasis input) := by
  unfold StaleBasis
  infer_instance

inductive Disposition where
  | conforms
  | doesNotConform
  | stale
  | couldNotCheck
  deriving DecidableEq, Repr, BEq

def Disposition.isCurrent : Disposition → Bool
  | .conforms
  | .doesNotConform => true
  | .stale
  | .couldNotCheck => false

/-!
The four bases are intentionally disjoint.  Although `conforms` is tested
first, every authority/spec/root mismatch, unverified report, or unresolved
report misses every positive basis and therefore closes as `couldNotCheck`.
Verified staleness becomes `stale`; a current verified failed requirement
becomes `doesNotConform`; and only a nonempty all-passed requirement set may
become `conforms`.
-/
def projectDisposition (input : ProjectionInput) : Disposition :=
  if ConformanceBasis input then
    .conforms
  else if StaleBasis input then
    .stale
  else if NonConformanceBasis input then
    .doesNotConform
  else
    .couldNotCheck

theorem disposition_conforms_iff_conformance_basis
    (input : ProjectionInput) :
    projectDisposition input = .conforms ↔ ConformanceBasis input := by
  by_cases hConforms : ConformanceBasis input
  · simp [projectDisposition, hConforms]
  · by_cases hStale : StaleBasis input
    · simp [projectDisposition, hConforms, hStale]
    · by_cases hFailed : NonConformanceBasis input
      · simp [projectDisposition, hConforms, hStale, hFailed]
      · simp [projectDisposition, hConforms, hStale, hFailed]

structure ConformanceFacts (input : ProjectionInput) : Prop where
  requestUsesPinnedSpecification :
    input.request.expectedSpecification = input.authority.specification
  reportUsesPinnedSpecification :
    input.report.specification = input.authority.specification
  reportUsesRequestedSubject :
    input.report.subject = input.request.subject
  reportUsesPinnedAuthority :
    input.report.authorityRef = input.authority.ref
  evidenceVerified : input.report.evidenceVerified = true
  semanticDerivationVerified :
    input.report.semanticDerivationVerified = true
  requirementEvidenceInVerifiedFrontier :
    verifiedFrontierCoversRequirementEvidence input.report = true
  expectedRootEstablished : input.report.expectedRootEstablished = true
  observedExpectedRoot :
    input.report.observedRoot = input.authority.expectedRoot
  exactCoverage : exactRequirementCoverage input = true
  kernelChecked : input.report.kernelDisposition = .checked
  current : input.report.currentness = .current
  requirementsSatisfied :
    requirementsSatisfied input.report.requirementResults = true

theorem conforms_implies_pinned_spec_expected_root_verified_and_current
    {input : ProjectionInput}
    (hConforms : projectDisposition input = .conforms) :
    ConformanceFacts input := by
  have hBasis :=
    (disposition_conforms_iff_conformance_basis input).mp hConforms
  rcases hBasis with
    ⟨⟨hRequestSpec, hReportSpec, hSubject, hAuthority, hEvidence,
        hDerivation, hEvidenceFrontier⟩,
      hEstablished, hRoot, hCoverage, hKernel, hCurrent, hRequirements⟩
  exact {
    requestUsesPinnedSpecification := hRequestSpec
    reportUsesPinnedSpecification := hReportSpec
    reportUsesRequestedSubject := hSubject
    reportUsesPinnedAuthority := hAuthority
    evidenceVerified := hEvidence
    semanticDerivationVerified := hDerivation
    requirementEvidenceInVerifiedFrontier := hEvidenceFrontier
    expectedRootEstablished := hEstablished
    observedExpectedRoot := hRoot
    exactCoverage := hCoverage
    kernelChecked := hKernel
    current := hCurrent
    requirementsSatisfied := hRequirements
  }

theorem authority_mismatch_cannot_conform
    {input : ProjectionInput}
    (hMismatch :
      input.request.expectedSpecification ≠ input.authority.specification) :
    projectDisposition input ≠ .conforms := by
  intro hConforms
  exact hMismatch
    (conforms_implies_pinned_spec_expected_root_verified_and_current
      hConforms).requestUsesPinnedSpecification

theorem report_specification_mismatch_cannot_conform
    {input : ProjectionInput}
    (hMismatch :
      input.report.specification ≠ input.authority.specification) :
    projectDisposition input ≠ .conforms := by
  intro hConforms
  exact hMismatch
    (conforms_implies_pinned_spec_expected_root_verified_and_current
      hConforms).reportUsesPinnedSpecification

theorem report_authority_mismatch_cannot_conform
    {input : ProjectionInput}
    (hMismatch : input.report.authorityRef ≠ input.authority.ref) :
    projectDisposition input ≠ .conforms := by
  intro hConforms
  exact hMismatch
    (conforms_implies_pinned_spec_expected_root_verified_and_current
      hConforms).reportUsesPinnedAuthority

theorem root_mismatch_cannot_conform
    {input : ProjectionInput}
    (hMismatch : input.report.observedRoot ≠ input.authority.expectedRoot) :
    projectDisposition input ≠ .conforms := by
  intro hConforms
  exact hMismatch
    (conforms_implies_pinned_spec_expected_root_verified_and_current
      hConforms).observedExpectedRoot

theorem unestablished_expected_root_cannot_conform
    {input : ProjectionInput}
    (hUnestablished : input.report.expectedRootEstablished ≠ true) :
    projectDisposition input ≠ .conforms := by
  intro hConforms
  exact hUnestablished
    (conforms_implies_pinned_spec_expected_root_verified_and_current
      hConforms).expectedRootEstablished

theorem unverified_evidence_cannot_conform
    {input : ProjectionInput}
    (hUnverified : input.report.evidenceVerified ≠ true) :
    projectDisposition input ≠ .conforms := by
  intro hConforms
  exact hUnverified
    (conforms_implies_pinned_spec_expected_root_verified_and_current
      hConforms).evidenceVerified

theorem unverified_derivation_cannot_conform
    {input : ProjectionInput}
    (hUnverified : input.report.semanticDerivationVerified ≠ true) :
    projectDisposition input ≠ .conforms := by
  intro hConforms
  exact hUnverified
    (conforms_implies_pinned_spec_expected_root_verified_and_current
      hConforms).semanticDerivationVerified

theorem unresolved_kernel_cannot_conform
    {input : ProjectionInput}
    (hUnresolved : input.report.kernelDisposition = .unresolved) :
    projectDisposition input ≠ .conforms := by
  intro hConforms
  have hChecked :=
    (conforms_implies_pinned_spec_expected_root_verified_and_current
      hConforms).kernelChecked
  simp [hUnresolved] at hChecked

theorem unresolved_currentness_cannot_conform
    {input : ProjectionInput}
    (hUnresolved : input.report.currentness = .unresolved) :
    projectDisposition input ≠ .conforms := by
  intro hConforms
  have hCurrent :=
    (conforms_implies_pinned_spec_expected_root_verified_and_current
      hConforms).current
  simp [hUnresolved] at hCurrent

theorem stale_kernel_cannot_conform
    {input : ProjectionInput}
    (hStale : input.report.kernelDisposition = .stale) :
    projectDisposition input ≠ .conforms := by
  intro hConforms
  have hChecked :=
    (conforms_implies_pinned_spec_expected_root_verified_and_current
      hConforms).kernelChecked
  simp [hStale] at hChecked

theorem stale_currentness_cannot_conform
    {input : ProjectionInput}
    (hStale : input.report.currentness = .stale) :
    projectDisposition input ≠ .conforms := by
  intro hConforms
  have hCurrent :=
    (conforms_implies_pinned_spec_expected_root_verified_and_current
      hConforms).current
  simp [hStale] at hCurrent

theorem empty_requirements_cannot_conform
    {input : ProjectionInput}
    (hEmpty : input.report.requirementResults = []) :
    projectDisposition input ≠ .conforms := by
  intro hConforms
  have hRequirements :=
    (conforms_implies_pinned_spec_expected_root_verified_and_current
      hConforms).requirementsSatisfied
  simp [requirementsSatisfied, hEmpty] at hRequirements

theorem conforms_implies_every_requirement_passed
    {input : ProjectionInput}
    (hConforms : projectDisposition input = .conforms)
    {result : RequirementResult}
    (hMember : result ∈ input.report.requirementResults) :
    result.status = .passed := by
  have hRequirements :=
    (conforms_implies_pinned_spec_expected_root_verified_and_current
      hConforms).requirementsSatisfied
  have hExpanded :
      input.report.requirementResults ≠ [] ∧
      ∀ candidate ∈ input.report.requirementResults,
        candidate.status = .passed := by
    simpa [requirementsSatisfied] using hRequirements
  exact hExpanded.2 result hMember

theorem conforms_implies_exact_requirement_coverage
    {input : ProjectionInput}
    (hConforms : projectDisposition input = .conforms) :
    exactRequirementCoverage input = true :=
  (conforms_implies_pinned_spec_expected_root_verified_and_current
    hConforms).exactCoverage

theorem exact_requirement_coverage_expands
    {input : ProjectionInput}
    (hCoverage : exactRequirementCoverage input = true) :
    requiredRequirementIds input.authority ≠ [] ∧
    (requiredRequirementIds input.authority).Nodup ∧
    (observedRequirementIds input.report).Nodup ∧
    (∀ requirementId ∈ requiredRequirementIds input.authority,
      requirementId ∈ observedRequirementIds input.report) ∧
    (∀ requirementId ∈ observedRequirementIds input.report,
      requirementId ∈ requiredRequirementIds input.authority) := by
  simpa [exactRequirementCoverage] using hCoverage

theorem missing_required_requirement_cannot_conform
    {input : ProjectionInput}
    {requirementId : String}
    (hRequired :
      requirementId ∈ requiredRequirementIds input.authority)
    (hMissing :
      requirementId ∉ observedRequirementIds input.report) :
    projectDisposition input ≠ .conforms := by
  intro hConforms
  have hCoverage := exact_requirement_coverage_expands
    (conforms_implies_exact_requirement_coverage hConforms)
  exact hMissing (hCoverage.2.2.2.1 requirementId hRequired)

theorem duplicate_pinned_requirement_cannot_conform
    {input : ProjectionInput}
    (hDuplicate :
      ¬(requiredRequirementIds input.authority).Nodup) :
    projectDisposition input ≠ .conforms := by
  intro hConforms
  exact hDuplicate
    (exact_requirement_coverage_expands
      (conforms_implies_exact_requirement_coverage hConforms)).2.1

theorem duplicate_reported_requirement_cannot_conform
    {input : ProjectionInput}
    (hDuplicate :
      ¬(observedRequirementIds input.report).Nodup) :
    projectDisposition input ≠ .conforms := by
  intro hConforms
  exact hDuplicate
    (exact_requirement_coverage_expands
      (conforms_implies_exact_requirement_coverage hConforms)).2.2.1

theorem extra_reported_requirement_cannot_conform
    {input : ProjectionInput}
    {requirementId : String}
    (hReported :
      requirementId ∈ observedRequirementIds input.report)
    (hExtra :
      requirementId ∉ requiredRequirementIds input.authority) :
    projectDisposition input ≠ .conforms := by
  intro hConforms
  have hCoverage := exact_requirement_coverage_expands
    (conforms_implies_exact_requirement_coverage hConforms)
  exact hExtra (hCoverage.2.2.2.2 requirementId hReported)

theorem disposition_stale_implies_verified_stale_basis
    {input : ProjectionInput}
    (hStale : projectDisposition input = .stale) :
    StaleBasis input := by
  by_cases hConforms : ConformanceBasis input
  · simp [projectDisposition, hConforms] at hStale
  · simp only [projectDisposition, hConforms, ↓reduceIte] at hStale
    by_cases hBasis : StaleBasis input
    · exact hBasis
    · by_cases hFailed : NonConformanceBasis input
      · simp [hBasis, hFailed] at hStale
      · simp [hBasis, hFailed] at hStale

theorem disposition_does_not_conform_implies_failed_requirement
    {input : ProjectionInput}
    (hFailed : projectDisposition input = .doesNotConform) :
    NonConformanceBasis input := by
  by_cases hConforms : ConformanceBasis input
  · simp [projectDisposition, hConforms] at hFailed
  · simp only [projectDisposition, hConforms, ↓reduceIte] at hFailed
    by_cases hStale : StaleBasis input
    · simp [hStale] at hFailed
    · simp only [hStale, ↓reduceIte] at hFailed
      by_cases hBasis : NonConformanceBasis input
      · exact hBasis
      · simp [hBasis] at hFailed

theorem does_not_conform_implies_unestablished_distinct_root
    {input : ProjectionInput}
    (hDisposition : projectDisposition input = .doesNotConform) :
    input.report.expectedRootEstablished = false ∧
    input.report.observedRoot ≠ input.authority.expectedRoot := by
  have hBasis :=
    disposition_does_not_conform_implies_failed_requirement hDisposition
  exact ⟨hBasis.2.1, hBasis.2.2.1⟩

theorem stale_implies_root_establishment_flag_matches_root_equality
    {input : ProjectionInput}
    (hDisposition : projectDisposition input = .stale) :
    (input.report.expectedRootEstablished = true ∧
      input.report.observedRoot = input.authority.expectedRoot) ∨
    (input.report.expectedRootEstablished = false ∧
      input.report.observedRoot ≠ input.authority.expectedRoot) := by
  have hBasis := disposition_stale_implies_verified_stale_basis hDisposition
  rcases hBasis.2.2.1 with hPositive | hNegative
  · exact Or.inl ⟨hPositive.1, hPositive.2.1⟩
  · exact Or.inr ⟨hNegative.1, hNegative.2.1⟩

theorem unestablished_equal_root_cannot_project_does_not_conform
    {input : ProjectionInput}
    (hEqual : input.report.observedRoot = input.authority.expectedRoot) :
    projectDisposition input ≠ .doesNotConform := by
  intro hDisposition
  exact
    (does_not_conform_implies_unestablished_distinct_root hDisposition).2
      hEqual

theorem established_distinct_root_cannot_project_stale
    {input : ProjectionInput}
    (hEstablished : input.report.expectedRootEstablished = true)
    (hDistinct : input.report.observedRoot ≠ input.authority.expectedRoot) :
    projectDisposition input ≠ .stale := by
  intro hDisposition
  rcases stale_implies_root_establishment_flag_matches_root_equality
      hDisposition with hPositive | hNegative
  · exact hDistinct hPositive.2
  · simp [hEstablished] at hNegative

theorem requirements_satisfied_implies_no_unresolved
    {results : List RequirementResult}
    (hSatisfied : requirementsSatisfied results = true) :
    noUnresolvedRequirements results = true := by
  have hExpanded :
      results ≠ [] ∧
      ∀ result ∈ results, result.status = .passed := by
    simpa [requirementsSatisfied] using hSatisfied
  simp only [noUnresolvedRequirements, List.all_eq_true]
  intro result hResult
  simp [hExpanded.2 result hResult]

theorem does_not_conform_has_no_unresolved_requirements
    {input : ProjectionInput}
    (hDisposition : projectDisposition input = .doesNotConform) :
    noUnresolvedRequirements input.report.requirementResults = true := by
  have hBasis :=
    disposition_does_not_conform_implies_failed_requirement hDisposition
  rcases hBasis with
    ⟨_, _, _, _, _, _, _, hNoUnresolved⟩
  exact hNoUnresolved

theorem stale_has_no_unresolved_requirements
    {input : ProjectionInput}
    (hDisposition : projectDisposition input = .stale) :
    noUnresolvedRequirements input.report.requirementResults = true := by
  have hBasis := disposition_stale_implies_verified_stale_basis hDisposition
  rcases hBasis.2.2.1 with hPositive | hNegative
  · exact requirements_satisfied_implies_no_unresolved hPositive.2.2
  · exact hNegative.2.2.2

theorem unresolved_requirement_cannot_project_does_not_conform
    {input : ProjectionInput}
    {result : RequirementResult}
    (hMember : result ∈ input.report.requirementResults)
    (hUnresolved : result.status = .unresolved) :
    projectDisposition input ≠ .doesNotConform := by
  intro hDisposition
  have hNoUnresolved :=
    does_not_conform_has_no_unresolved_requirements hDisposition
  have hExpanded :
      ∀ candidate ∈ input.report.requirementResults,
        candidate.status ≠ .unresolved := by
    simpa [noUnresolvedRequirements] using hNoUnresolved
  exact (hExpanded result hMember) hUnresolved

theorem unresolved_requirement_cannot_project_stale
    {input : ProjectionInput}
    {result : RequirementResult}
    (hMember : result ∈ input.report.requirementResults)
    (hUnresolved : result.status = .unresolved) :
    projectDisposition input ≠ .stale := by
  intro hDisposition
  have hNoUnresolved :=
    stale_has_no_unresolved_requirements hDisposition
  have hExpanded :
      ∀ candidate ∈ input.report.requirementResults,
        candidate.status ≠ .unresolved := by
    simpa [noUnresolvedRequirements] using hNoUnresolved
  exact (hExpanded result hMember) hUnresolved

structure ProofIdentity where
  proofId : String
  rootCertificateId : CertificateId
  deriving DecidableEq, Repr, BEq

structure ProofBinding where
  proof : ProofIdentity
  authority : AuthorityRef
  specification : SpecificationRef
  subject : SubjectRef
  expectedRoot : ClaimKey
  observedRoot : ClaimKey
  deriving DecidableEq, Repr, BEq

structure Finding where
  requirementId : String
  label : String
  summary : String
  repairGuidance : String
  evidence : List EvidenceRef
  deriving DecidableEq, Repr, BEq

namespace Finding

def fromDefinitionAndResult
    (definition : RequirementDefinition)
    (result : RequirementResult) : Finding where
  requirementId := definition.requirementId
  label := definition.label
  summary := definition.failureSummary
  repairGuidance := definition.repairGuidance
  evidence := result.evidence

end Finding

def findRequirementDefinition
    (requirementId : String) :
    List RequirementDefinition → Option RequirementDefinition
  | [] => none
  | definition :: rest =>
      if definition.requirementId = requirementId then
        some definition
      else
        findRequirementDefinition requirementId rest

theorem find_requirement_definition_some_is_exact_pinned_member
    {requirementId : String}
    {definitions : List RequirementDefinition}
    {definition : RequirementDefinition}
    (hFound :
      findRequirementDefinition requirementId definitions = some definition) :
    definition ∈ definitions ∧ definition.requirementId = requirementId := by
  induction definitions with
  | nil =>
      simp [findRequirementDefinition] at hFound
  | cons head rest inductionHypothesis =>
      by_cases hHead : head.requirementId = requirementId
      · simp [findRequirementDefinition, hHead] at hFound
        subst definition
        exact ⟨by simp, hHead⟩
      · simp only [findRequirementDefinition, hHead, ↓reduceIte] at hFound
        have hTail := inductionHypothesis hFound
        exact ⟨by simp [hTail.1], hTail.2⟩

def findingForResult
    (authority : PinnedAuthority)
    (result : RequirementResult) : Option Finding :=
  if result.status = .failed then
    (findRequirementDefinition result.requirementId authority.requirements).map
      (fun definition => Finding.fromDefinitionAndResult definition result)
  else
    none

def failedFindings (input : ProjectionInput) : List Finding :=
  input.report.requirementResults.filterMap
    (findingForResult input.authority)

def proofFrontier (report : RunReport) : List EvidenceRef :=
  report.verifiedEvidenceFrontier

theorem base_verified_requirement_evidence_is_in_independent_frontier
    {input : ProjectionInput}
    (hBase : BaseVerified input)
    {result : RequirementResult}
    (hResult : result ∈ input.report.requirementResults)
    {evidence : EvidenceRef}
    (hEvidence : evidence ∈ result.evidence) :
    evidence ∈ proofFrontier input.report := by
  have hCoverage :
      verifiedFrontierCoversRequirementEvidence input.report = true :=
    hBase.2.2.2.2.2.2
  have hExpanded :
      ∀ candidate ∈ input.report.requirementResults,
        ∀ candidateEvidence ∈ candidate.evidence,
          evidenceRefPresent input.report.verifiedEvidenceFrontier
            candidateEvidence = true := by
    simpa [verifiedFrontierCoversRequirementEvidence] using hCoverage
  exact evidence_ref_present_iff_mem.mp
    (hExpanded result hResult evidence hEvidence)

structure ApplicationResult where
  binding : ProofBinding
  disposition : Disposition
  findings : List Finding
  repairGuidance : List String
  current : Bool
  evidenceFrontier : List EvidenceRef
  deriving DecidableEq, Repr, BEq

def project (input : ProjectionInput) : ApplicationResult :=
  let disposition := projectDisposition input
  let findings :=
    if disposition = .doesNotConform then failedFindings input else []
  {
    binding := {
      proof := {
        proofId := input.report.proofId
        rootCertificateId := input.report.rootCertificateId
      }
      authority := input.authority.ref
      specification := input.authority.specification
      subject := input.request.subject
      expectedRoot := input.authority.expectedRoot
      observedRoot := input.report.observedRoot
    }
    disposition := disposition
    findings := findings
    repairGuidance := findings.map (fun finding => finding.repairGuidance)
    current := disposition.isCurrent
    evidenceFrontier := proofFrontier input.report
  }

theorem projected_current_iff_trusted_current_disposition
    (input : ProjectionInput) :
    (project input).current = true ↔
      projectDisposition input = .conforms ∨
      projectDisposition input = .doesNotConform := by
  generalize hDisposition :
    projectDisposition input = disposition
  cases disposition <;> simp [project, hDisposition, Disposition.isCurrent]

theorem could_not_check_projects_current_false
    {input : ProjectionInput}
    (hDisposition : projectDisposition input = .couldNotCheck) :
    (project input).current = false := by
  simp [project, hDisposition, Disposition.isCurrent]

theorem stale_projects_current_false
    {input : ProjectionInput}
    (hDisposition : projectDisposition input = .stale) :
    (project input).current = false := by
  simp [project, hDisposition, Disposition.isCurrent]

theorem finding_for_result_some_has_exact_pinned_definition
    {authority : PinnedAuthority}
    {result : RequirementResult}
    {finding : Finding}
    (hFinding : findingForResult authority result = some finding) :
    ∃ definition ∈ authority.requirements,
      definition.requirementId = result.requirementId ∧
      result.status = .failed ∧
      Finding.fromDefinitionAndResult definition result = finding := by
  unfold findingForResult at hFinding
  by_cases hFailed : result.status = .failed
  · simp only [hFailed, ↓reduceIte] at hFinding
    generalize hLookup :
      findRequirementDefinition result.requirementId authority.requirements =
        found at hFinding
    cases found with
    | none =>
        simp at hFinding
    | some definition =>
        simp only [Option.map_some, Option.some.injEq] at hFinding
        have hPinned :=
          find_requirement_definition_some_is_exact_pinned_member hLookup
        exact ⟨definition, hPinned.1, hPinned.2, hFailed, hFinding⟩
  · simp [hFailed] at hFinding

theorem mem_failed_findings_iff_projected_result
    {input : ProjectionInput}
    {finding : Finding} :
    finding ∈ failedFindings input ↔
      ∃ result ∈ input.report.requirementResults,
        findingForResult input.authority result = some finding := by
  simp [failedFindings]

theorem projected_finding_has_exact_failed_source
    {input : ProjectionInput}
    {finding : Finding}
    (hFinding : finding ∈ (project input).findings) :
    ∃ definition ∈ input.authority.requirements,
      ∃ result ∈ input.report.requirementResults,
        definition.requirementId = result.requirementId ∧
        result.status = .failed ∧
        Finding.fromDefinitionAndResult definition result = finding := by
  have hProjected :
      projectDisposition input = .doesNotConform ∧
      finding ∈ failedFindings input := by
    simpa [project] using hFinding
  obtain ⟨result, hResult, hResultFinding⟩ :=
    mem_failed_findings_iff_projected_result.mp hProjected.2
  obtain ⟨definition, hDefinition, hId, hFailed, hExact⟩ :=
    finding_for_result_some_has_exact_pinned_definition hResultFinding
  exact ⟨definition, hDefinition, result, hResult, hId, hFailed, hExact⟩

theorem projected_finding_evidence_is_in_exact_frontier
    {input : ProjectionInput}
    {finding : Finding}
    (hFinding : finding ∈ (project input).findings)
    {evidence : EvidenceRef}
    (hEvidence : evidence ∈ finding.evidence) :
    evidence ∈ (project input).evidenceFrontier := by
  obtain ⟨definition, _, result, hResult, _, _, hExact⟩ :=
    projected_finding_has_exact_failed_source hFinding
  have hDisposition :
      projectDisposition input = .doesNotConform := by
    have hProjected :
        projectDisposition input = .doesNotConform ∧
        finding ∈ failedFindings input := by
      simpa [project] using hFinding
    exact hProjected.1
  have hBase :
      BaseVerified input :=
    (disposition_does_not_conform_implies_failed_requirement hDisposition).1
  subst finding
  have hResultEvidence :
      evidence ∈ result.evidence := by
    simpa [Finding.fromDefinitionAndResult] using hEvidence
  simpa [project] using
    base_verified_requirement_evidence_is_in_independent_frontier
      hBase hResult hResultEvidence

/-!
Three views expose progressively more detail without changing the proof
identity.  The summary is the ordinary application outcome; the semantic view
explains findings and repair guidance; the technical view expands the exact
evidence frontier and low-level root/currentness data.
-/
structure CompactIdentity where
  proofId : String
  specificationId : String
  specificationVersion : String
  subjectId : String
  deriving DecidableEq, Repr, BEq

namespace ProofBinding

def compactIdentity (binding : ProofBinding) : CompactIdentity where
  proofId := binding.proof.proofId
  specificationId := binding.specification.specificationId
  specificationVersion := binding.specification.version
  subjectId := binding.subject.subjectId

end ProofBinding

structure SummaryView where
  identity : CompactIdentity
  disposition : Disposition
  current : Bool
  deriving DecidableEq, Repr, BEq

structure SemanticView where
  identity : CompactIdentity
  disposition : Disposition
  findings : List Finding
  repairGuidance : List String
  deriving DecidableEq, Repr, BEq

structure TechnicalView where
  binding : ProofBinding
  disposition : Disposition
  observedRoot : ClaimKey
  kernelDisposition : KernelDisposition
  currentness : Currentness
  evidenceFrontier : List EvidenceRef
  deriving DecidableEq, Repr, BEq

def summaryView (result : ApplicationResult) : SummaryView where
  identity := result.binding.compactIdentity
  disposition := result.disposition
  current := result.current

def semanticView (result : ApplicationResult) : SemanticView where
  identity := result.binding.compactIdentity
  disposition := result.disposition
  findings := result.findings
  repairGuidance := result.repairGuidance

def technicalView
    (input : ProjectionInput)
    (result : ApplicationResult) : TechnicalView where
  binding := result.binding
  disposition := result.disposition
  observedRoot := input.report.observedRoot
  kernelDisposition := input.report.kernelDisposition
  currentness := input.report.currentness
  evidenceFrontier := result.evidenceFrontier

theorem progressive_views_share_exact_compact_identity
    (input : ProjectionInput)
    (result : ApplicationResult) :
    (summaryView result).identity = (semanticView result).identity ∧
    (semanticView result).identity =
      (technicalView input result).binding.compactIdentity := by
  exact ⟨rfl, rfl⟩

theorem progressive_views_share_exact_proof_id
    (input : ProjectionInput)
    (result : ApplicationResult) :
    (summaryView result).identity.proofId =
        (semanticView result).identity.proofId ∧
    (semanticView result).identity.proofId =
        (technicalView input result).binding.proof.proofId := by
  exact ⟨rfl, rfl⟩

theorem summary_view_preserves_disposition
    (result : ApplicationResult) :
    (summaryView result).disposition = result.disposition := by
  rfl

theorem semantic_view_preserves_exact_findings_and_guidance
    (result : ApplicationResult) :
    (semanticView result).findings = result.findings ∧
    (semanticView result).repairGuidance = result.repairGuidance := by
  exact ⟨rfl, rfl⟩

theorem technical_view_expands_exact_frontier
    (input : ProjectionInput)
    (result : ApplicationResult) :
    (technicalView input result).evidenceFrontier =
      result.evidenceFrontier := by
  rfl

theorem technical_view_expands_exact_full_binding_and_frontier
    (input : ProjectionInput)
    (result : ApplicationResult) :
    (technicalView input result).binding = result.binding ∧
    (technicalView input result).evidenceFrontier =
      result.evidenceFrontier := by
  exact ⟨rfl, rfl⟩

theorem projected_technical_view_expands_exact_pinned_authority
    (input : ProjectionInput) :
    (technicalView input (project input)).binding.authority =
      input.authority.ref := by
  rfl

theorem projected_technical_view_expands_computed_frontier
    (input : ProjectionInput) :
    (technicalView input (project input)).evidenceFrontier =
      proofFrontier input.report := by
  rfl

/-! Small data-only examples for two otherwise unrelated application domains. -/
namespace Examples

def claim (claimId : String) (canonicalParameters : String) : ClaimKey where
  claimId := claimId
  claimVersion := "1"
  canonicalParameters := canonicalParameters

def evidence (receiptId role : String) : EvidenceRef where
  receiptId := receiptId
  artifactDigest := "sha256:" ++ receiptId
  role := role

def requirementDefinition (requirementId : String) : RequirementDefinition where
  requirementId := requirementId
  label := requirementId
  failureSummary := "the pinned requirement failed"
  repairGuidance := "repair the failed requirement and capture a new snapshot"

def passingRequirement (requirementId : String) : RequirementResult where
  requirementId := requirementId
  status := .passed
  evidence := [evidence ("receipt-" ++ requirementId) requirementId]

def failingRequirement (requirementId : String) : RequirementResult where
  requirementId := requirementId
  status := .failed
  evidence := [evidence ("receipt-" ++ requirementId) requirementId]

def unresolvedRequirement (requirementId : String) : RequirementResult where
  requirementId := requirementId
  status := .unresolved
  evidence := [evidence ("receipt-" ++ requirementId) requirementId]

def browserSpecification : SpecificationRef where
  domain := "browser-publishing"
  specificationId := "durable-publish"
  version := "1"
  digest := "sha256:browser-specification"

def browserRoot : ClaimKey :=
  claim "riddle-proof.browser.durable-state-transition-observed"
    "{\"fixture\":\"browser-publishing\"}"

def browserAuthority : PinnedAuthority where
  specification := browserSpecification
  expectedRoot := browserRoot
  authorityId := "browser-authority"
  authorityVersion := "1"
  authorityDigest := "sha256:browser-authority"
  requirements := [
    requirementDefinition "transition-observed",
    requirementDefinition "survived-reload",
    requirementDefinition "visible-fresh-context"
  ]

def browserSubject : SubjectRef where
  subjectId := "preview://fixture"
  snapshotDigest := "sha256:browser-snapshot"

def browserConformingInput : ProjectionInput where
  authority := browserAuthority
  request := {
    expectedSpecification := browserSpecification
    subject := browserSubject
  }
  report := {
    specification := browserSpecification
    subject := browserSubject
    authorityRef := browserAuthority.ref
    proofId := "proof-browser"
    rootCertificateId := "root-browser"
    observedRoot := browserRoot
    expectedRootEstablished := true
    evidenceVerified := true
    semanticDerivationVerified := true
    kernelDisposition := .checked
    currentness := .current
    requirementResults := [
      passingRequirement "transition-observed",
      passingRequirement "survived-reload",
      passingRequirement "visible-fresh-context"
    ]
    verifiedEvidenceFrontier := [
      evidence "receipt-browser-root" "root",
      evidence "receipt-transition-observed" "transition-observed",
      evidence "receipt-survived-reload" "survived-reload",
      evidence "receipt-visible-fresh-context" "visible-fresh-context"
    ]
  }

theorem browser_publishing_projects_to_conforms :
    projectDisposition browserConformingInput = .conforms := by
  native_decide

def commercialSpecification : SpecificationRef where
  domain := "commercial-records"
  specificationId := "synthetic-record-reconciliation"
  version := "1"
  digest := "sha256:commercial-specification"

def commercialRoot : ClaimKey :=
  claim "riddle-proof.commercial-record.captured-fields-agree-under-policy"
    "{\"fixture\":\"commercial-records\"}"

def commercialFailureRoot : ClaimKey :=
  claim "riddle-proof.commercial-record.requirements-not-satisfied"
    "{\"fixture\":\"commercial-records\"}"

def commercialAuthority : PinnedAuthority where
  specification := commercialSpecification
  expectedRoot := commercialRoot
  authorityId := "commercial-authority"
  authorityVersion := "1"
  authorityDigest := "sha256:commercial-authority"
  requirements := [
    requirementDefinition "invoice-arithmetic",
    requirementDefinition "invoice-purchase-order-match"
  ]

def commercialSubject : SubjectRef where
  subjectId := "invoice:synthetic-100"
  snapshotDigest := "sha256:commercial-snapshot"

def commercialFailedInput : ProjectionInput where
  authority := commercialAuthority
  request := {
    expectedSpecification := commercialSpecification
    subject := commercialSubject
  }
  report := {
    specification := commercialSpecification
    subject := commercialSubject
    authorityRef := commercialAuthority.ref
    proofId := "proof-commercial"
    rootCertificateId := "root-commercial"
    observedRoot := commercialFailureRoot
    expectedRootEstablished := false
    evidenceVerified := true
    semanticDerivationVerified := true
    kernelDisposition := .checked
    currentness := .current
    requirementResults := [
      passingRequirement "invoice-arithmetic",
      failingRequirement "invoice-purchase-order-match"
    ]
    verifiedEvidenceFrontier := [
      evidence "receipt-commercial-root" "root",
      evidence "receipt-invoice-arithmetic" "invoice-arithmetic",
      evidence "receipt-invoice-purchase-order-match"
        "invoice-purchase-order-match"
    ]
  }

theorem commercial_record_failure_projects_to_does_not_conform :
    projectDisposition commercialFailedInput = .doesNotConform := by
  native_decide

def commercialInconsistentRootFlagInput : ProjectionInput := {
  commercialFailedInput with
  report := {
    commercialFailedInput.report with
    observedRoot := commercialRoot
  }
}

theorem unestablished_flag_with_equal_root_could_not_be_checked :
    projectDisposition commercialInconsistentRootFlagInput =
      .couldNotCheck := by
  native_decide

def commercialMismatchedAuthorityInput : ProjectionInput := {
  commercialFailedInput with
  report := {
    commercialFailedInput.report with
    authorityRef := {
      authorityId := "different-authority"
      authorityVersion := "1"
      authorityDigest := "sha256:different-authority"
    }
  }
}

theorem mismatched_runtime_authority_could_not_be_checked :
    projectDisposition commercialMismatchedAuthorityInput =
      .couldNotCheck := by
  native_decide

def commercialMissingVerifiedFrontierInput : ProjectionInput := {
  commercialFailedInput with
  report := {
    commercialFailedInput.report with
    verifiedEvidenceFrontier := [
      evidence "receipt-commercial-root" "root"
    ]
  }
}

theorem missing_independent_requirement_evidence_could_not_be_checked :
    projectDisposition commercialMissingVerifiedFrontierInput =
      .couldNotCheck := by
  native_decide

theorem commercial_failed_requirement_evidence_is_in_verified_frontier :
    evidenceRefPresent (project commercialFailedInput).evidenceFrontier
      (evidence "receipt-invoice-purchase-order-match"
        "invoice-purchase-order-match") = true := by
  native_decide

def commercialFailedAndUnresolvedInput : ProjectionInput := {
  commercialFailedInput with
  report := {
    commercialFailedInput.report with
    requirementResults := [
      unresolvedRequirement "invoice-arithmetic",
      failingRequirement "invoice-purchase-order-match"
    ]
  }
}

theorem commercial_failure_mixed_with_unresolved_could_not_be_checked :
    projectDisposition commercialFailedAndUnresolvedInput =
      .couldNotCheck := by
  native_decide

theorem commercial_failure_mixed_with_unresolved_is_not_current :
    (project commercialFailedAndUnresolvedInput).current = false := by
  native_decide

def browserStaleInput : ProjectionInput := {
  browserConformingInput with
  report := {
    browserConformingInput.report with
    kernelDisposition := .stale
    currentness := .stale
  }
}

theorem verified_browser_staleness_projects_to_stale :
    projectDisposition browserStaleInput = .stale := by
  native_decide

theorem verified_browser_staleness_is_not_projected_as_current :
    (project browserStaleInput).current = false := by
  native_decide

def unverifiedCommercialInput : ProjectionInput := {
  commercialFailedInput with
  report := {
    commercialFailedInput.report with
    evidenceVerified := false
  }
}

theorem unverified_commercial_report_could_not_be_checked :
    projectDisposition unverifiedCommercialInput = .couldNotCheck := by
  native_decide

theorem unverified_commercial_report_is_not_projected_as_current :
    (project unverifiedCommercialInput).current = false := by
  native_decide

theorem browser_and_commercial_examples_share_the_same_projection :
    (project browserConformingInput).binding.specification.domain =
      "browser-publishing" ∧
    (project commercialFailedInput).binding.specification.domain =
      "commercial-records" := by
  native_decide

end Examples

end RiddleProofKernel.ApplicationProjection
