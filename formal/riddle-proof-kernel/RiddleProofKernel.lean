import Std

namespace RiddleProofKernel

/-!
A small Lean model of Riddle Proof's Layer 1 verdict kernel.

This intentionally models only the framework-level status collapse:
evidence shape, viewport coverage, navigation blockage, check results, and
required artifact completeness. It does not try to prove that a screenshot,
DOM dump, or browser trace accurately represents the outside world.
-/

inductive CheckStatus where
  | passed
  | failed
  | skipped
  | needsHumanReview
  deriving DecidableEq, Repr, BEq

inductive Verdict where
  | passed
  | productRegression
  | proofInsufficient
  | environmentBlocked
  | needsHumanReview
  deriving DecidableEq, Repr, BEq

inductive Artifact where
  | proofJson
  | consoleJson
  | domSummary
  | screenshot
  | networkLog
  deriving DecidableEq, Repr, BEq

structure VerdictInput where
  evidencePresent : Bool
  observedViewportCount : Nat
  expectedViewportCount : Nat
  checkStatuses : List CheckStatus
  hasNavigationError : Bool
  requiredArtifacts : List Artifact
  observedArtifacts : List Artifact
  deriving Repr

def hasCheck (status : CheckStatus) (checks : List CheckStatus) : Bool :=
  checks.any (fun check => check == status)

def missingExpectedViewports (input : VerdictInput) : Bool :=
  decide (input.expectedViewportCount ≠ 0 ∧ input.observedViewportCount < input.expectedViewportCount)

def allRequiredArtifactsPresent (input : VerdictInput) : Bool :=
  input.requiredArtifacts.all (fun artifact => input.observedArtifacts.contains artifact)

def missingRequiredArtifact (input : VerdictInput) : Bool :=
  !allRequiredArtifactsPresent input

def hasHumanReviewCheck (input : VerdictInput) : Bool :=
  hasCheck CheckStatus.needsHumanReview input.checkStatuses

def hasFailedCheck (input : VerdictInput) : Bool :=
  hasCheck CheckStatus.failed input.checkStatuses

/-!
`currentProfileStatusFromEvidence` mirrors the current Riddle Proof profile
status collapse we inspected in `profile.ts`: it has no artifact completeness
input in the verdict decision.
-/
def currentProfileStatusFromEvidence (input : VerdictInput) : Verdict :=
  if input.evidencePresent = false then
    Verdict.proofInsufficient
  else if input.observedViewportCount = 0 then
    Verdict.proofInsufficient
  else if input.checkStatuses = [] then
    Verdict.proofInsufficient
  else if input.hasNavigationError = true then
    Verdict.environmentBlocked
  else if missingExpectedViewports input = true then
    Verdict.proofInsufficient
  else if hasHumanReviewCheck input = true then
    Verdict.needsHumanReview
  else if hasFailedCheck input = true then
    Verdict.productRegression
  else
    Verdict.passed

def artifactCompletenessSpec (statusFn : VerdictInput → Verdict) : Prop :=
  ∀ input, statusFn input = Verdict.passed → missingRequiredArtifact input ≠ true

structure ArtifactCompleteHandoff where
  input : VerdictInput
  artifactComplete : missingRequiredArtifact input ≠ true

def currentStatusAfterArtifactCompleteHandoff
    (handoff : ArtifactCompleteHandoff) : Verdict :=
  currentProfileStatusFromEvidence handoff.input

def verdict (input : VerdictInput) : Verdict :=
  if input.evidencePresent = false then
    Verdict.proofInsufficient
  else if input.observedViewportCount = 0 then
    Verdict.proofInsufficient
  else if input.checkStatuses = [] then
    Verdict.proofInsufficient
  else if input.hasNavigationError = true then
    Verdict.environmentBlocked
  else if missingExpectedViewports input = true then
    Verdict.proofInsufficient
  else if missingRequiredArtifact input = true then
    Verdict.proofInsufficient
  else if hasHumanReviewCheck input = true then
    Verdict.needsHumanReview
  else if hasFailedCheck input = true then
    Verdict.productRegression
  else
    Verdict.passed

theorem no_evidence_is_insufficient
    (input : VerdictInput)
    (hEvidence : input.evidencePresent = false) :
    verdict input = Verdict.proofInsufficient := by
  simp [verdict, hEvidence]

theorem no_evidence_never_passes
    (input : VerdictInput)
    (hEvidence : input.evidencePresent = false) :
    verdict input ≠ Verdict.passed := by
  simp [verdict, hEvidence]

theorem no_viewports_is_insufficient
    (input : VerdictInput)
    (hEvidence : input.evidencePresent ≠ false)
    (hViewports : input.observedViewportCount = 0) :
    verdict input = Verdict.proofInsufficient := by
  simp [verdict, hEvidence, hViewports]

theorem no_viewports_never_passes
    (input : VerdictInput)
    (hEvidence : input.evidencePresent ≠ false)
    (hViewports : input.observedViewportCount = 0) :
    verdict input ≠ Verdict.passed := by
  simp [verdict, hEvidence, hViewports]

theorem no_checks_is_insufficient
    (input : VerdictInput)
    (hEvidence : input.evidencePresent ≠ false)
    (hViewports : input.observedViewportCount ≠ 0)
    (hChecks : input.checkStatuses = []) :
    verdict input = Verdict.proofInsufficient := by
  simp [verdict, hEvidence, hViewports, hChecks]

theorem no_checks_never_passes
    (input : VerdictInput)
    (hEvidence : input.evidencePresent ≠ false)
    (hViewports : input.observedViewportCount ≠ 0)
    (hChecks : input.checkStatuses = []) :
    verdict input ≠ Verdict.passed := by
  simp [verdict, hEvidence, hViewports, hChecks]

theorem navigation_error_dominates
    (input : VerdictInput)
    (hEvidence : input.evidencePresent ≠ false)
    (hViewports : input.observedViewportCount ≠ 0)
    (hChecks : input.checkStatuses ≠ [])
    (hNavigation : input.hasNavigationError = true) :
    verdict input = Verdict.environmentBlocked := by
  simp [verdict, hEvidence, hViewports, hChecks, hNavigation]

theorem navigation_error_never_passes
    (input : VerdictInput)
    (hEvidence : input.evidencePresent ≠ false)
    (hViewports : input.observedViewportCount ≠ 0)
    (hChecks : input.checkStatuses ≠ [])
    (hNavigation : input.hasNavigationError = true) :
    verdict input ≠ Verdict.passed := by
  simp [verdict, hEvidence, hViewports, hChecks, hNavigation]

theorem missing_expected_viewports_is_insufficient
    (input : VerdictInput)
    (hEvidence : input.evidencePresent ≠ false)
    (hViewports : input.observedViewportCount ≠ 0)
    (hChecks : input.checkStatuses ≠ [])
    (hNavigation : input.hasNavigationError ≠ true)
    (hExpected : missingExpectedViewports input = true) :
    verdict input = Verdict.proofInsufficient := by
  simp [verdict, hEvidence, hViewports, hChecks, hNavigation, hExpected]

theorem missing_expected_viewports_never_passes
    (input : VerdictInput)
    (hEvidence : input.evidencePresent ≠ false)
    (hViewports : input.observedViewportCount ≠ 0)
    (hChecks : input.checkStatuses ≠ [])
    (hNavigation : input.hasNavigationError ≠ true)
    (hExpected : missingExpectedViewports input = true) :
    verdict input ≠ Verdict.passed := by
  simp [verdict, hEvidence, hViewports, hChecks, hNavigation, hExpected]

theorem missing_required_artifact_is_insufficient
    (input : VerdictInput)
    (hEvidence : input.evidencePresent ≠ false)
    (hViewports : input.observedViewportCount ≠ 0)
    (hChecks : input.checkStatuses ≠ [])
    (hNavigation : input.hasNavigationError ≠ true)
    (hExpected : missingExpectedViewports input ≠ true)
    (hArtifact : missingRequiredArtifact input = true) :
    verdict input = Verdict.proofInsufficient := by
  simp [verdict, hEvidence, hViewports, hChecks, hNavigation, hExpected, hArtifact]

theorem missing_required_artifact_never_passes
    (input : VerdictInput)
    (hEvidence : input.evidencePresent ≠ false)
    (hViewports : input.observedViewportCount ≠ 0)
    (hChecks : input.checkStatuses ≠ [])
    (hNavigation : input.hasNavigationError ≠ true)
    (hExpected : missingExpectedViewports input ≠ true)
    (hArtifact : missingRequiredArtifact input = true) :
    verdict input ≠ Verdict.passed := by
  simp [verdict, hEvidence, hViewports, hChecks, hNavigation, hExpected, hArtifact]

theorem human_review_check_yields_review
    (input : VerdictInput)
    (hEvidence : input.evidencePresent ≠ false)
    (hViewports : input.observedViewportCount ≠ 0)
    (hChecks : input.checkStatuses ≠ [])
    (hNavigation : input.hasNavigationError ≠ true)
    (hExpected : missingExpectedViewports input ≠ true)
    (hArtifact : missingRequiredArtifact input ≠ true)
    (hReview : hasHumanReviewCheck input = true) :
    verdict input = Verdict.needsHumanReview := by
  simp [verdict, hEvidence, hViewports, hChecks, hNavigation, hExpected, hArtifact, hReview]

theorem human_review_check_never_passes
    (input : VerdictInput)
    (hEvidence : input.evidencePresent ≠ false)
    (hViewports : input.observedViewportCount ≠ 0)
    (hChecks : input.checkStatuses ≠ [])
    (hNavigation : input.hasNavigationError ≠ true)
    (hExpected : missingExpectedViewports input ≠ true)
    (hArtifact : missingRequiredArtifact input ≠ true)
    (hReview : hasHumanReviewCheck input = true) :
    verdict input ≠ Verdict.passed := by
  simp [verdict, hEvidence, hViewports, hChecks, hNavigation, hExpected, hArtifact, hReview]

theorem failed_check_yields_product_regression
    (input : VerdictInput)
    (hEvidence : input.evidencePresent ≠ false)
    (hViewports : input.observedViewportCount ≠ 0)
    (hChecks : input.checkStatuses ≠ [])
    (hNavigation : input.hasNavigationError ≠ true)
    (hExpected : missingExpectedViewports input ≠ true)
    (hArtifact : missingRequiredArtifact input ≠ true)
    (hReview : hasHumanReviewCheck input ≠ true)
    (hFailed : hasFailedCheck input = true) :
    verdict input = Verdict.productRegression := by
  simp [
    verdict,
    hEvidence,
    hViewports,
    hChecks,
    hNavigation,
    hExpected,
    hArtifact,
    hReview,
    hFailed
  ]

theorem failed_check_never_passes
    (input : VerdictInput)
    (hEvidence : input.evidencePresent ≠ false)
    (hViewports : input.observedViewportCount ≠ 0)
    (hChecks : input.checkStatuses ≠ [])
    (hNavigation : input.hasNavigationError ≠ true)
    (hExpected : missingExpectedViewports input ≠ true)
    (hArtifact : missingRequiredArtifact input ≠ true)
    (hReview : hasHumanReviewCheck input ≠ true)
    (hFailed : hasFailedCheck input = true) :
    verdict input ≠ Verdict.passed := by
  simp [
    verdict,
    hEvidence,
    hViewports,
    hChecks,
    hNavigation,
    hExpected,
    hArtifact,
    hReview,
    hFailed
  ]

theorem clean_complete_evidence_passes
    (input : VerdictInput)
    (hEvidence : input.evidencePresent ≠ false)
    (hViewports : input.observedViewportCount ≠ 0)
    (hChecks : input.checkStatuses ≠ [])
    (hNavigation : input.hasNavigationError ≠ true)
    (hExpected : missingExpectedViewports input ≠ true)
    (hArtifact : missingRequiredArtifact input ≠ true)
    (hReview : hasHumanReviewCheck input ≠ true)
    (hFailed : hasFailedCheck input ≠ true) :
    verdict input = Verdict.passed := by
  simp [
    verdict,
    hEvidence,
    hViewports,
    hChecks,
    hNavigation,
    hExpected,
    hArtifact,
    hReview,
    hFailed
  ]

theorem passed_excludes_missing_required_artifact
    (input : VerdictInput)
    (hEvidence : input.evidencePresent ≠ false)
    (hViewports : input.observedViewportCount ≠ 0)
    (hChecks : input.checkStatuses ≠ [])
    (hNavigation : input.hasNavigationError ≠ true)
    (hExpected : missingExpectedViewports input ≠ true)
    (hPassed : verdict input = Verdict.passed) :
    missingRequiredArtifact input ≠ true := by
  intro hMissing
  have hInsufficient :
      verdict input = Verdict.proofInsufficient :=
    missing_required_artifact_is_insufficient
      input
      hEvidence
      hViewports
      hChecks
      hNavigation
      hExpected
      hMissing
  rw [hPassed] at hInsufficient
  contradiction

theorem verdict_satisfies_artifact_completeness_spec :
    artifactCompletenessSpec verdict := by
  intro input hPassed hMissing
  by_cases hEvidence : input.evidencePresent = false
  · simp [verdict, hEvidence] at hPassed
  by_cases hViewports : input.observedViewportCount = 0
  · simp [verdict, hEvidence, hViewports] at hPassed
  by_cases hChecks : input.checkStatuses = []
  · simp [verdict, hEvidence, hViewports, hChecks] at hPassed
  by_cases hNavigation : input.hasNavigationError = true
  · simp [verdict, hEvidence, hViewports, hChecks, hNavigation] at hPassed
  by_cases hExpected : missingExpectedViewports input = true
  · simp [verdict, hEvidence, hViewports, hChecks, hNavigation, hExpected] at hPassed
  simp [verdict, hEvidence, hViewports, hChecks, hNavigation, hExpected, hMissing] at hPassed

theorem checked_handoff_passed_excludes_missing_required_artifact
    (handoff : ArtifactCompleteHandoff)
    (_hPassed :
      currentStatusAfterArtifactCompleteHandoff handoff = Verdict.passed) :
    missingRequiredArtifact handoff.input ≠ true :=
  handoff.artifactComplete

/-!
Layer 1.5: artifact-manifest ingestion.

This models the wrapper around the verdict kernel. The runtime can either have
unknown artifact state, or it can have a known manifest. A known empty manifest
is still a manifest and must be checked.
-/

inductive ArtifactManifest where
  | unknown
  | known (observedArtifacts : List Artifact)
  deriving DecidableEq, Repr, BEq

def applyArtifactCompletenessFromManifest
    (input : VerdictInput)
    (manifest : ArtifactManifest) : Verdict :=
  match manifest with
  | ArtifactManifest.unknown =>
      currentProfileStatusFromEvidence input
  | ArtifactManifest.known artifacts =>
      let checkedInput := { input with observedArtifacts := artifacts }
      let status := currentProfileStatusFromEvidence input
      if status = Verdict.passed ∧ missingRequiredArtifact checkedInput = true then
        Verdict.proofInsufficient
      else
        status

def directManifestBeforeFix (artifacts : List Artifact) : ArtifactManifest :=
  if artifacts = [] then
    ArtifactManifest.unknown
  else
    ArtifactManifest.known artifacts

def directManifestAfterFix (artifacts : List Artifact) : ArtifactManifest :=
  ArtifactManifest.known artifacts

def directRunVerdictBeforeFix
    (input : VerdictInput)
    (artifacts : List Artifact) : Verdict :=
  applyArtifactCompletenessFromManifest input (directManifestBeforeFix artifacts)

def directRunVerdictAfterFix
    (input : VerdictInput)
    (artifacts : List Artifact) : Verdict :=
  applyArtifactCompletenessFromManifest input (directManifestAfterFix artifacts)

theorem known_manifest_passed_excludes_missing_required_artifact
    (input : VerdictInput)
    (artifacts : List Artifact)
    (hPassed :
      applyArtifactCompletenessFromManifest
        input
        (ArtifactManifest.known artifacts) = Verdict.passed) :
    missingRequiredArtifact { input with observedArtifacts := artifacts } ≠ true := by
  intro hMissing
  by_cases hStatus : currentProfileStatusFromEvidence input = Verdict.passed
  · simp [applyArtifactCompletenessFromManifest, hStatus, hMissing] at hPassed
  · simp [applyArtifactCompletenessFromManifest, hStatus, hMissing] at hPassed

theorem direct_after_fix_passed_excludes_missing_required_artifact
    (input : VerdictInput)
    (artifacts : List Artifact)
    (hPassed : directRunVerdictAfterFix input artifacts = Verdict.passed) :
    missingRequiredArtifact { input with observedArtifacts := artifacts } ≠ true :=
  known_manifest_passed_excludes_missing_required_artifact input artifacts hPassed

/-!
Layer 2: a small process-boundary model.

This still does not model the outside network or the browser as truthful. It
models the parts Riddle Proof owns before verdict collapse:

* source profile authoring
* normalized profile handoff
* recon/planning obligations
* runtime adapter evidence packets
* reporting that must not upgrade a verdict

The key contract is that upstream stages contribute obligations; they are not
proof by themselves. A final `passed` verdict is allowed only after those
obligations have survived normalization and have runtime witnesses.
-/

structure AuthoredProfile where
  expectedViewportCount : Nat
  requiredArtifacts : List Artifact
  deriving Repr

structure NormalizedProfile where
  expectedViewportCount : Nat
  requiredArtifacts : List Artifact
  deriving Repr

structure ReconPlan where
  requiredArtifacts : List Artifact
  deriving Repr

structure RuntimePacket where
  evidencePresent : Bool
  observedViewportCount : Nat
  checkStatuses : List CheckStatus
  hasNavigationError : Bool
  observedArtifacts : List Artifact
  deriving Repr

structure RiddleProofProcess where
  authoredProfile : AuthoredProfile
  normalizedProfile : NormalizedProfile
  reconPlan : ReconPlan
  runtime : RuntimePacket
  deriving Repr

def authoredRequirementsPreserved
    (authored : AuthoredProfile)
    (normalized : NormalizedProfile) : Bool :=
  authored.requiredArtifacts.all
    (fun artifact => normalized.requiredArtifacts.contains artifact)

def processRequiredArtifacts (process : RiddleProofProcess) : List Artifact :=
  process.authoredProfile.requiredArtifacts ++ process.reconPlan.requiredArtifacts

def processVerdictInput (process : RiddleProofProcess) : VerdictInput where
  evidencePresent := process.runtime.evidencePresent
  observedViewportCount := process.runtime.observedViewportCount
  expectedViewportCount := process.authoredProfile.expectedViewportCount
  checkStatuses := process.runtime.checkStatuses
  hasNavigationError := process.runtime.hasNavigationError
  requiredArtifacts := processRequiredArtifacts process
  observedArtifacts := process.runtime.observedArtifacts

def processVerdict (process : RiddleProofProcess) : Verdict :=
  if authoredRequirementsPreserved process.authoredProfile process.normalizedProfile = false then
    Verdict.proofInsufficient
  else
    verdict (processVerdictInput process)

def reportedVerdict (process : RiddleProofProcess) : Verdict :=
  processVerdict process

/-!
Two intentionally incomplete process models. They are useful as executable
specification tests for the bugs this Layer 2 boundary is meant to expose.
-/
def processVerdictWithoutAuthoringGuard (process : RiddleProofProcess) : Verdict :=
  verdict {
    processVerdictInput process with
    expectedViewportCount := process.normalizedProfile.expectedViewportCount
    requiredArtifacts := process.normalizedProfile.requiredArtifacts
  }

def processVerdictWithoutReconArtifacts (process : RiddleProofProcess) : Verdict :=
  if authoredRequirementsPreserved process.authoredProfile process.normalizedProfile = false then
    Verdict.proofInsufficient
  else
    verdict {
      processVerdictInput process with
      requiredArtifacts := process.authoredProfile.requiredArtifacts
    }

theorem authoring_gap_is_insufficient
    (process : RiddleProofProcess)
    (hDropped :
      authoredRequirementsPreserved
        process.authoredProfile
        process.normalizedProfile = false) :
    processVerdict process = Verdict.proofInsufficient := by
  simp [processVerdict, hDropped]

theorem process_passed_implies_authoring_preserved
    (process : RiddleProofProcess)
    (hPassed : processVerdict process = Verdict.passed) :
    authoredRequirementsPreserved
      process.authoredProfile
      process.normalizedProfile ≠ false := by
  intro hDropped
  simp [processVerdict, hDropped] at hPassed

theorem process_passed_excludes_missing_required_artifact
    (process : RiddleProofProcess)
    (hPassed : processVerdict process = Verdict.passed) :
    missingRequiredArtifact (processVerdictInput process) ≠ true := by
  by_cases hPreserved :
      authoredRequirementsPreserved
        process.authoredProfile
        process.normalizedProfile = false
  · simp [processVerdict, hPreserved] at hPassed
  · have hVerdict :
        verdict (processVerdictInput process) = Verdict.passed := by
      simpa [processVerdict, hPreserved] using hPassed
    exact verdict_satisfies_artifact_completeness_spec
      (processVerdictInput process)
      hVerdict

theorem report_passed_implies_process_passed
    (process : RiddleProofProcess)
    (hPassed : reportedVerdict process = Verdict.passed) :
    processVerdict process = Verdict.passed := by
  simpa [reportedVerdict] using hPassed

theorem report_passed_excludes_missing_required_artifact
    (process : RiddleProofProcess)
    (hPassed : reportedVerdict process = Verdict.passed) :
    missingRequiredArtifact (processVerdictInput process) ≠ true :=
  process_passed_excludes_missing_required_artifact
    process
    (report_passed_implies_process_passed process hPassed)

/-!
Layer 3: end-to-end Riddle Proof-owned flow gate.

This is still not a proof that the website, browser, network, or CDN tells the
truth. It models the framework-owned handoffs that decide whether the final
report may say `passed`:

* authored obligations survived normalization
* recon baselines and baseline understanding exist
* authoring produced a proof plan and capture script
* implementation stage completed according to the runner
* required before/prod baselines exist for the selected reference mode
* after evidence was captured
* verify status is `evidence_captured`
* the supervising agent, not an untrusted source, chose `ready_to_ship`
* visual delta and hard blocker gates are clear
* the artifact manifest is known and complete
-/

inductive FlowReference where
  | before
  | prod
  | both
  | invalid
  deriving DecidableEq, Repr, BEq

inductive VerifyStatus where
  | evidenceCaptured
  | captureIncomplete
  | captureError
  | unknown
  deriving DecidableEq, Repr, BEq

inductive ProofAssessmentSource where
  | supervisingAgent
  | supervisor
  | runner
  | unknown
  deriving DecidableEq, Repr, BEq

inductive ProofAssessmentDecision where
  | readyToShip
  | needsRicherProof
  | reviseCapture
  | needsRecon
  | needsImplementation
  | unknown
  deriving DecidableEq, Repr, BEq

structure WholeFlowState where
  authoredRequirementsPreserved : Bool
  reconRequiredBaselinesPresent : Bool
  reconBaselineUnderstandingPresent : Bool
  authorProofPlanPresent : Bool
  authorCaptureScriptPresent : Bool
  implementationOk : Bool
  reference : FlowReference
  beforeBaselinePresent : Bool
  prodUrlPresent : Bool
  prodBaselinePresent : Bool
  afterEvidencePresent : Bool
  verifyStatus : VerifyStatus
  proofAssessmentSource : ProofAssessmentSource
  proofAssessmentDecision : ProofAssessmentDecision
  visualDeltaOk : Bool
  hardBlockersPresent : Bool
  evidencePresent : Bool
  observedViewportCount : Nat
  expectedViewportCount : Nat
  checkStatuses : List CheckStatus
  hasNavigationError : Bool
  requiredArtifacts : List Artifact
  artifactManifest : ArtifactManifest
  deriving Repr

def referenceValid : FlowReference → Bool
  | FlowReference.invalid => false
  | _ => true

def beforeBaselineRequired : FlowReference → Bool
  | FlowReference.before => true
  | FlowReference.both => true
  | _ => false

def prodBaselineRequired : FlowReference → Bool
  | FlowReference.prod => true
  | FlowReference.both => true
  | _ => false

def requiredFlowBaselinesPresent (flow : WholeFlowState) : Bool :=
  (!beforeBaselineRequired flow.reference || flow.beforeBaselinePresent)
    && (!prodBaselineRequired flow.reference || (flow.prodUrlPresent && flow.prodBaselinePresent))

def artifactManifestKnown : ArtifactManifest → Bool
  | ArtifactManifest.unknown => false
  | ArtifactManifest.known _ => true

def artifactManifestObservedArtifacts : ArtifactManifest → List Artifact
  | ArtifactManifest.unknown => []
  | ArtifactManifest.known artifacts => artifacts

def wholeFlowVerdictInput (flow : WholeFlowState) : VerdictInput where
  evidencePresent := flow.evidencePresent
  observedViewportCount := flow.observedViewportCount
  expectedViewportCount := flow.expectedViewportCount
  checkStatuses := flow.checkStatuses
  hasNavigationError := flow.hasNavigationError
  requiredArtifacts := flow.requiredArtifacts
  observedArtifacts := artifactManifestObservedArtifacts flow.artifactManifest

def supervisorSourceAccepted (source : ProofAssessmentSource) : Bool :=
  source == ProofAssessmentSource.supervisingAgent
    || source == ProofAssessmentSource.supervisor

def wholeFlowShipGateOk (flow : WholeFlowState) : Bool :=
  flow.authoredRequirementsPreserved
    && referenceValid flow.reference
    && requiredFlowBaselinesPresent flow
    && flow.reconRequiredBaselinesPresent
    && flow.reconBaselineUnderstandingPresent
    && flow.authorProofPlanPresent
    && flow.authorCaptureScriptPresent
    && flow.implementationOk
    && flow.afterEvidencePresent
    && (flow.verifyStatus == VerifyStatus.evidenceCaptured)
    && supervisorSourceAccepted flow.proofAssessmentSource
    && (flow.proofAssessmentDecision == ProofAssessmentDecision.readyToShip)
    && flow.visualDeltaOk
    && !flow.hardBlockersPresent
    && artifactManifestKnown flow.artifactManifest
    && decide (missingRequiredArtifact (wholeFlowVerdictInput flow) ≠ true)

def wholeFlowVerdict (flow : WholeFlowState) : Verdict :=
  if wholeFlowShipGateOk flow then
    verdict (wholeFlowVerdictInput flow)
  else
    Verdict.proofInsufficient

def reportedWholeFlowVerdict (flow : WholeFlowState) : Verdict :=
  wholeFlowVerdict flow

/-!
An intentionally incomplete final report model. It ignores the ship gate and
therefore demonstrates why the final report must be tied to the gate rather
than only to the lower-level evidence verdict.
-/
def wholeFlowVerdictWithoutShipGate (flow : WholeFlowState) : Verdict :=
  verdict (wholeFlowVerdictInput flow)

theorem whole_flow_passed_implies_ship_gate_ok
    (flow : WholeFlowState)
    (hPassed : wholeFlowVerdict flow = Verdict.passed) :
    wholeFlowShipGateOk flow = true := by
  cases hGate : wholeFlowShipGateOk flow with
  | false =>
      simp [wholeFlowVerdict, hGate] at hPassed
  | true =>
      rfl

theorem reported_whole_flow_passed_implies_ship_gate_ok
    (flow : WholeFlowState)
    (hPassed : reportedWholeFlowVerdict flow = Verdict.passed) :
    wholeFlowShipGateOk flow = true :=
  whole_flow_passed_implies_ship_gate_ok flow (by
    simpa [reportedWholeFlowVerdict] using hPassed)

def exampleClean : VerdictInput where
  evidencePresent := true
  observedViewportCount := 2
  expectedViewportCount := 2
  checkStatuses := [CheckStatus.passed]
  hasNavigationError := false
  requiredArtifacts := [Artifact.proofJson, Artifact.screenshot]
  observedArtifacts := [Artifact.proofJson, Artifact.screenshot, Artifact.consoleJson]

def exampleMissingScreenshot : VerdictInput where
  evidencePresent := true
  observedViewportCount := 2
  expectedViewportCount := 2
  checkStatuses := [CheckStatus.passed]
  hasNavigationError := false
  requiredArtifacts := [Artifact.proofJson, Artifact.screenshot]
  observedArtifacts := [Artifact.proofJson]

#eval verdict exampleClean
#eval verdict exampleMissingScreenshot

#eval currentProfileStatusFromEvidence exampleMissingScreenshot

def exampleDirectNoArtifactRefs : VerdictInput where
  evidencePresent := true
  observedViewportCount := 1
  expectedViewportCount := 1
  checkStatuses := [CheckStatus.passed]
  hasNavigationError := false
  requiredArtifacts := [Artifact.proofJson, Artifact.screenshot]
  observedArtifacts := []

#eval directRunVerdictBeforeFix exampleDirectNoArtifactRefs []
#eval directRunVerdictAfterFix exampleDirectNoArtifactRefs []

theorem current_impl_passes_with_missing_required_artifact :
    currentProfileStatusFromEvidence exampleMissingScreenshot = Verdict.passed
      ∧ missingRequiredArtifact exampleMissingScreenshot = true := by
  native_decide

theorem current_impl_violates_artifact_completeness_spec :
    ¬ artifactCompletenessSpec currentProfileStatusFromEvidence := by
  intro hSpec
  exact
    (hSpec
      exampleMissingScreenshot
      current_impl_passes_with_missing_required_artifact.left)
      current_impl_passes_with_missing_required_artifact.right

theorem erasing_known_empty_manifest_allows_direct_pass :
    directRunVerdictBeforeFix exampleDirectNoArtifactRefs [] = Verdict.passed
      ∧ directRunVerdictAfterFix exampleDirectNoArtifactRefs [] = Verdict.proofInsufficient := by
  native_decide

def exampleWholeFlowClean : WholeFlowState where
  authoredRequirementsPreserved := true
  reconRequiredBaselinesPresent := true
  reconBaselineUnderstandingPresent := true
  authorProofPlanPresent := true
  authorCaptureScriptPresent := true
  implementationOk := true
  reference := FlowReference.before
  beforeBaselinePresent := true
  prodUrlPresent := false
  prodBaselinePresent := false
  afterEvidencePresent := true
  verifyStatus := VerifyStatus.evidenceCaptured
  proofAssessmentSource := ProofAssessmentSource.supervisingAgent
  proofAssessmentDecision := ProofAssessmentDecision.readyToShip
  visualDeltaOk := true
  hardBlockersPresent := false
  evidencePresent := true
  observedViewportCount := 1
  expectedViewportCount := 1
  checkStatuses := [CheckStatus.passed]
  hasNavigationError := false
  requiredArtifacts := [Artifact.proofJson, Artifact.screenshot]
  artifactManifest := ArtifactManifest.known [Artifact.proofJson, Artifact.screenshot, Artifact.consoleJson]

def exampleWholeFlowMissingReconBaseline : WholeFlowState :=
  { exampleWholeFlowClean with reconRequiredBaselinesPresent := false }

def exampleWholeFlowMissingVerify : WholeFlowState :=
  { exampleWholeFlowClean with verifyStatus := VerifyStatus.captureIncomplete }

def exampleWholeFlowRunnerAssessment : WholeFlowState :=
  { exampleWholeFlowClean with proofAssessmentSource := ProofAssessmentSource.runner }

def exampleWholeFlowUnknownArtifactManifest : WholeFlowState :=
  { exampleWholeFlowClean with artifactManifest := ArtifactManifest.unknown }

#eval wholeFlowVerdict exampleWholeFlowClean

#eval wholeFlowVerdictWithoutShipGate exampleWholeFlowMissingReconBaseline
#eval wholeFlowVerdict exampleWholeFlowMissingReconBaseline

#eval wholeFlowVerdictWithoutShipGate exampleWholeFlowMissingVerify
#eval wholeFlowVerdict exampleWholeFlowMissingVerify

#eval wholeFlowVerdictWithoutShipGate exampleWholeFlowRunnerAssessment
#eval wholeFlowVerdict exampleWholeFlowRunnerAssessment

#eval wholeFlowVerdictWithoutShipGate exampleWholeFlowUnknownArtifactManifest
#eval wholeFlowVerdict exampleWholeFlowUnknownArtifactManifest

theorem missing_recon_gate_allows_pass_without_ship_gate :
    wholeFlowVerdictWithoutShipGate exampleWholeFlowMissingReconBaseline = Verdict.passed
      ∧ wholeFlowVerdict exampleWholeFlowMissingReconBaseline = Verdict.proofInsufficient := by
  native_decide

theorem missing_verify_gate_allows_pass_without_ship_gate :
    wholeFlowVerdictWithoutShipGate exampleWholeFlowMissingVerify = Verdict.passed
      ∧ wholeFlowVerdict exampleWholeFlowMissingVerify = Verdict.proofInsufficient := by
  native_decide

theorem runner_assessment_allows_pass_without_ship_gate :
    wholeFlowVerdictWithoutShipGate exampleWholeFlowRunnerAssessment = Verdict.passed
      ∧ wholeFlowVerdict exampleWholeFlowRunnerAssessment = Verdict.proofInsufficient := by
  native_decide

theorem unknown_artifact_manifest_blocks_even_without_ship_gate :
    wholeFlowVerdictWithoutShipGate exampleWholeFlowUnknownArtifactManifest = Verdict.proofInsufficient
      ∧ wholeFlowVerdict exampleWholeFlowUnknownArtifactManifest = Verdict.proofInsufficient := by
  native_decide

def exampleAuthoringDropProcess : RiddleProofProcess where
  authoredProfile := {
    expectedViewportCount := 1
    requiredArtifacts := [Artifact.proofJson, Artifact.screenshot]
  }
  normalizedProfile := {
    expectedViewportCount := 1
    requiredArtifacts := [Artifact.proofJson]
  }
  reconPlan := {
    requiredArtifacts := []
  }
  runtime := {
    evidencePresent := true
    observedViewportCount := 1
    checkStatuses := [CheckStatus.passed]
    hasNavigationError := false
    observedArtifacts := [Artifact.proofJson]
  }

def exampleMissingReconArtifactProcess : RiddleProofProcess where
  authoredProfile := {
    expectedViewportCount := 1
    requiredArtifacts := [Artifact.proofJson]
  }
  normalizedProfile := {
    expectedViewportCount := 1
    requiredArtifacts := [Artifact.proofJson]
  }
  reconPlan := {
    requiredArtifacts := [Artifact.screenshot]
  }
  runtime := {
    evidencePresent := true
    observedViewportCount := 1
    checkStatuses := [CheckStatus.passed]
    hasNavigationError := false
    observedArtifacts := [Artifact.proofJson]
  }

#eval processVerdictWithoutAuthoringGuard exampleAuthoringDropProcess
#eval processVerdict exampleAuthoringDropProcess

#eval processVerdictWithoutReconArtifacts exampleMissingReconArtifactProcess
#eval processVerdict exampleMissingReconArtifactProcess

theorem missing_authoring_guard_passes_after_erasing_required_artifact :
    processVerdictWithoutAuthoringGuard exampleAuthoringDropProcess = Verdict.passed
      ∧ processVerdict exampleAuthoringDropProcess = Verdict.proofInsufficient := by
  native_decide

theorem missing_recon_guard_passes_with_unwitnessed_required_recon_artifact :
    processVerdictWithoutReconArtifacts exampleMissingReconArtifactProcess = Verdict.passed
      ∧ processVerdict exampleMissingReconArtifactProcess = Verdict.proofInsufficient := by
  native_decide

end RiddleProofKernel
