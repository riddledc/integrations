import Std
import RiddleProofKernel.SemanticComposition
import RiddleProofKernel.SemanticClosure

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
  | proofInsufficient
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

def hasInsufficientCheck (input : VerdictInput) : Bool :=
  hasCheck CheckStatus.proofInsufficient input.checkStatuses

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
  else if hasInsufficientCheck input = true then
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
  else if hasInsufficientCheck input = true then
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

theorem insufficient_check_yields_insufficient
    (input : VerdictInput)
    (hEvidence : input.evidencePresent ≠ false)
    (hViewports : input.observedViewportCount ≠ 0)
    (hChecks : input.checkStatuses ≠ [])
    (hNavigation : input.hasNavigationError ≠ true)
    (hExpected : missingExpectedViewports input ≠ true)
    (hArtifact : missingRequiredArtifact input ≠ true)
    (hInsufficient : hasInsufficientCheck input = true) :
    verdict input = Verdict.proofInsufficient := by
  simp [
    verdict,
    hEvidence,
    hViewports,
    hChecks,
    hNavigation,
    hExpected,
    hArtifact,
    hInsufficient
  ]

theorem insufficient_check_never_passes
    (input : VerdictInput)
    (hEvidence : input.evidencePresent ≠ false)
    (hViewports : input.observedViewportCount ≠ 0)
    (hChecks : input.checkStatuses ≠ [])
    (hNavigation : input.hasNavigationError ≠ true)
    (hExpected : missingExpectedViewports input ≠ true)
    (hArtifact : missingRequiredArtifact input ≠ true)
    (hInsufficient : hasInsufficientCheck input = true) :
    verdict input ≠ Verdict.passed := by
  simp [
    verdict,
    hEvidence,
    hViewports,
    hChecks,
    hNavigation,
    hExpected,
    hArtifact,
    hInsufficient
  ]

theorem human_review_check_yields_review
    (input : VerdictInput)
    (hEvidence : input.evidencePresent ≠ false)
    (hViewports : input.observedViewportCount ≠ 0)
    (hChecks : input.checkStatuses ≠ [])
    (hNavigation : input.hasNavigationError ≠ true)
    (hExpected : missingExpectedViewports input ≠ true)
    (hArtifact : missingRequiredArtifact input ≠ true)
    (hInsufficient : hasInsufficientCheck input ≠ true)
    (hReview : hasHumanReviewCheck input = true) :
    verdict input = Verdict.needsHumanReview := by
  simp [verdict, hEvidence, hViewports, hChecks, hNavigation, hExpected, hArtifact, hInsufficient, hReview]

theorem human_review_check_never_passes
    (input : VerdictInput)
    (hEvidence : input.evidencePresent ≠ false)
    (hViewports : input.observedViewportCount ≠ 0)
    (hChecks : input.checkStatuses ≠ [])
    (hNavigation : input.hasNavigationError ≠ true)
    (hExpected : missingExpectedViewports input ≠ true)
    (hArtifact : missingRequiredArtifact input ≠ true)
    (hInsufficient : hasInsufficientCheck input ≠ true)
    (hReview : hasHumanReviewCheck input = true) :
    verdict input ≠ Verdict.passed := by
  simp [verdict, hEvidence, hViewports, hChecks, hNavigation, hExpected, hArtifact, hInsufficient, hReview]

theorem failed_check_yields_product_regression
    (input : VerdictInput)
    (hEvidence : input.evidencePresent ≠ false)
    (hViewports : input.observedViewportCount ≠ 0)
    (hChecks : input.checkStatuses ≠ [])
    (hNavigation : input.hasNavigationError ≠ true)
    (hExpected : missingExpectedViewports input ≠ true)
    (hArtifact : missingRequiredArtifact input ≠ true)
    (hInsufficient : hasInsufficientCheck input ≠ true)
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
    hInsufficient,
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
    (hInsufficient : hasInsufficientCheck input ≠ true)
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
    hInsufficient,
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
    (hInsufficient : hasInsufficientCheck input ≠ true)
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
    hInsufficient,
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

inductive ProofAssessmentStage where
  | ship
  | author
  | verify
  | recon
  | implement
  | unknown
  deriving DecidableEq, Repr, BEq

def canonicalProofAssessmentStage : ProofAssessmentDecision → ProofAssessmentStage
  | ProofAssessmentDecision.readyToShip => ProofAssessmentStage.ship
  | ProofAssessmentDecision.needsRicherProof => ProofAssessmentStage.author
  | ProofAssessmentDecision.reviseCapture => ProofAssessmentStage.verify
  | ProofAssessmentDecision.needsRecon => ProofAssessmentStage.recon
  | ProofAssessmentDecision.needsImplementation => ProofAssessmentStage.implement
  | ProofAssessmentDecision.unknown => ProofAssessmentStage.unknown

structure ProofAssessmentRouting where
  decision : ProofAssessmentDecision
  stageHint : ProofAssessmentStage
  deriving Repr

def normalizedProofAssessmentStage (routing : ProofAssessmentRouting) : ProofAssessmentStage :=
  canonicalProofAssessmentStage routing.decision

def proofAssessmentRequestsShip (routing : ProofAssessmentRouting) : Bool :=
  match routing.decision with
  | ProofAssessmentDecision.readyToShip => true
  | _ => false

def proofAssessmentStageHintRequestsShip (routing : ProofAssessmentRouting) : Bool :=
  routing.stageHint == ProofAssessmentStage.ship

theorem proof_assessment_requests_ship_implies_ready_decision
    (routing : ProofAssessmentRouting)
    (hShip : proofAssessmentRequestsShip routing = true) :
    routing.decision = ProofAssessmentDecision.readyToShip := by
  cases routing with
  | mk decision stageHint =>
      cases decision <;> simp [proofAssessmentRequestsShip] at hShip ⊢

def exampleContradictoryNeedsRicherProofRoute : ProofAssessmentRouting where
  decision := ProofAssessmentDecision.needsRicherProof
  stageHint := ProofAssessmentStage.ship

theorem contradictory_stage_hint_does_not_request_ship :
    proofAssessmentRequestsShip exampleContradictoryNeedsRicherProofRoute = false
      ∧ normalizedProofAssessmentStage exampleContradictoryNeedsRicherProofRoute =
          ProofAssessmentStage.author
      ∧ proofAssessmentStageHintRequestsShip
          exampleContradictoryNeedsRicherProofRoute = true := by
  native_decide

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

/-!
Layer 3.1: interaction proof evidence obligations.

Interaction proofs have a stronger author-to-verify contract than ordinary
visual or proof captures. The author packet must describe a terminal route and
an active browser action, and the verify evidence must include structured proof
evidence for that terminal interaction. A screenshot or generic telemetry alone
is not enough to satisfy an interaction proof.
-/

inductive VerificationMode where
  | proof
  | visual
  | interaction
  | audio
  | gameplay
  | unknown
  deriving Repr, DecidableEq, BEq

def interactionVerificationMode : VerificationMode → Bool
  | VerificationMode.interaction => true
  | _ => false

structure InteractionProofContract where
  verificationMode : VerificationMode
  terminalRouteAuthored : Bool
  activeInteractionAuthored : Bool
  structuredProofEvidencePresent : Bool
  terminalRouteMatched : Bool
  failedAssertionPresent : Bool
  captureFailedBeforeEvidence : Bool
  deriving Repr, DecidableEq

def interactionProofEvidenceComplete
    (contract : InteractionProofContract) : Bool :=
  if interactionVerificationMode contract.verificationMode then
    contract.terminalRouteAuthored
      && contract.activeInteractionAuthored
      && contract.structuredProofEvidencePresent
      && contract.terminalRouteMatched
      && !contract.failedAssertionPresent
      && !contract.captureFailedBeforeEvidence
  else
    true

def interactionProofHardBlockerPresent
    (contract : InteractionProofContract) : Bool :=
  interactionVerificationMode contract.verificationMode
    && !interactionProofEvidenceComplete contract

structure InteractionWholeFlowState where
  flow : WholeFlowState
  interaction : InteractionProofContract
  deriving Repr

def wholeFlowInteractionShipGateOk
    (state : InteractionWholeFlowState) : Bool :=
  wholeFlowShipGateOk state.flow
    && interactionProofEvidenceComplete state.interaction

def wholeFlowInteractionVerdict
    (state : InteractionWholeFlowState) : Verdict :=
  if wholeFlowInteractionShipGateOk state then
    verdict (wholeFlowVerdictInput state.flow)
  else
    Verdict.proofInsufficient

theorem interaction_flow_passed_implies_ship_gate_ok
    (state : InteractionWholeFlowState)
    (hPassed : wholeFlowInteractionVerdict state = Verdict.passed) :
    wholeFlowShipGateOk state.flow = true := by
  cases hGate : wholeFlowInteractionShipGateOk state with
  | false =>
      simp [wholeFlowInteractionVerdict, hGate] at hPassed
  | true =>
      have hBoth :
          wholeFlowShipGateOk state.flow = true
            ∧ interactionProofEvidenceComplete state.interaction = true := by
        simpa [wholeFlowInteractionShipGateOk] using hGate
      exact hBoth.1

theorem interaction_flow_passed_implies_interaction_contract_complete
    (state : InteractionWholeFlowState)
    (hPassed : wholeFlowInteractionVerdict state = Verdict.passed) :
    interactionProofEvidenceComplete state.interaction = true := by
  cases hGate : wholeFlowInteractionShipGateOk state with
  | false =>
      simp [wholeFlowInteractionVerdict, hGate] at hPassed
  | true =>
      have hBoth :
          wholeFlowShipGateOk state.flow = true
            ∧ interactionProofEvidenceComplete state.interaction = true := by
        simpa [wholeFlowInteractionShipGateOk] using hGate
      exact hBoth.2

theorem missing_interaction_proof_evidence_is_hard_blocker
    (contract : InteractionProofContract)
    (hMode : contract.verificationMode = VerificationMode.interaction)
    (hEvidence : contract.structuredProofEvidencePresent = false) :
    interactionProofHardBlockerPresent contract = true := by
  simp [
    interactionProofHardBlockerPresent,
    interactionProofEvidenceComplete,
    interactionVerificationMode,
    hMode,
    hEvidence
  ]

theorem interaction_route_mismatch_is_hard_blocker
    (contract : InteractionProofContract)
    (hMode : contract.verificationMode = VerificationMode.interaction)
    (hMatched : contract.terminalRouteMatched = false) :
    interactionProofHardBlockerPresent contract = true := by
  by_cases hTerminal : contract.terminalRouteAuthored = false
  · simp [
      interactionProofHardBlockerPresent,
      interactionProofEvidenceComplete,
      interactionVerificationMode,
      hMode,
      hTerminal
    ]
  · by_cases hAction : contract.activeInteractionAuthored = false
    · simp [
        interactionProofHardBlockerPresent,
        interactionProofEvidenceComplete,
        interactionVerificationMode,
        hMode,
        hTerminal,
        hAction
      ]
    · by_cases hEvidence : contract.structuredProofEvidencePresent = false
      · simp [
          interactionProofHardBlockerPresent,
          interactionProofEvidenceComplete,
          interactionVerificationMode,
          hMode,
          hTerminal,
          hAction,
          hEvidence
        ]
      · simp [
          interactionProofHardBlockerPresent,
          interactionProofEvidenceComplete,
          interactionVerificationMode,
          hMode,
          hTerminal,
          hAction,
          hEvidence,
          hMatched
        ]

theorem passive_interaction_authoring_is_hard_blocker
    (contract : InteractionProofContract)
    (hMode : contract.verificationMode = VerificationMode.interaction)
    (hAction : contract.activeInteractionAuthored = false) :
    interactionProofHardBlockerPresent contract = true := by
  by_cases hTerminal : contract.terminalRouteAuthored = false
  · simp [
      interactionProofHardBlockerPresent,
      interactionProofEvidenceComplete,
      interactionVerificationMode,
      hMode,
      hTerminal
    ]
  · simp [
      interactionProofHardBlockerPresent,
      interactionProofEvidenceComplete,
      interactionVerificationMode,
      hMode,
      hTerminal,
      hAction
    ]

def exampleCompleteInteractionProofContract : InteractionProofContract where
  verificationMode := VerificationMode.interaction
  terminalRouteAuthored := true
  activeInteractionAuthored := true
  structuredProofEvidencePresent := true
  terminalRouteMatched := true
  failedAssertionPresent := false
  captureFailedBeforeEvidence := false

def exampleMissingInteractionProofEvidence : InteractionProofContract :=
  { exampleCompleteInteractionProofContract with
    structuredProofEvidencePresent := false }

def exampleInteractionRouteMismatch : InteractionProofContract :=
  { exampleCompleteInteractionProofContract with
    terminalRouteMatched := false }

def examplePassiveInteractionProofContract : InteractionProofContract :=
  { exampleCompleteInteractionProofContract with
    activeInteractionAuthored := false }

def exampleNonInteractionProofContract : InteractionProofContract where
  verificationMode := VerificationMode.proof
  terminalRouteAuthored := false
  activeInteractionAuthored := false
  structuredProofEvidencePresent := false
  terminalRouteMatched := false
  failedAssertionPresent := true
  captureFailedBeforeEvidence := true

def exampleInteractionFlowCleanBase : WholeFlowState where
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
  artifactManifest :=
    ArtifactManifest.known [
      Artifact.proofJson,
      Artifact.screenshot,
      Artifact.consoleJson
    ]

def exampleWholeFlowInteractionClean : InteractionWholeFlowState where
  flow := exampleInteractionFlowCleanBase
  interaction := exampleCompleteInteractionProofContract

def exampleWholeFlowInteractionMissingEvidence : InteractionWholeFlowState where
  flow := exampleInteractionFlowCleanBase
  interaction := exampleMissingInteractionProofEvidence

def exampleWholeFlowInteractionRouteMismatch : InteractionWholeFlowState where
  flow := exampleInteractionFlowCleanBase
  interaction := exampleInteractionRouteMismatch

#eval interactionProofEvidenceComplete exampleCompleteInteractionProofContract
#eval interactionProofEvidenceComplete exampleMissingInteractionProofEvidence
#eval interactionProofEvidenceComplete exampleInteractionRouteMismatch
#eval interactionProofEvidenceComplete exampleNonInteractionProofContract
#eval wholeFlowInteractionVerdict exampleWholeFlowInteractionClean
#eval wholeFlowInteractionVerdict exampleWholeFlowInteractionMissingEvidence

theorem complete_interaction_proof_contract_satisfies_gate :
    interactionProofEvidenceComplete exampleCompleteInteractionProofContract = true
      ∧ interactionProofHardBlockerPresent
        exampleCompleteInteractionProofContract = false := by
  native_decide

theorem missing_interaction_proof_evidence_blocks_flow_pass :
    interactionProofHardBlockerPresent
        exampleMissingInteractionProofEvidence = true
      ∧ wholeFlowInteractionVerdict
        exampleWholeFlowInteractionMissingEvidence =
          Verdict.proofInsufficient := by
  native_decide

theorem route_mismatched_interaction_proof_blocks_flow_pass :
    interactionProofHardBlockerPresent
        exampleInteractionRouteMismatch = true
      ∧ wholeFlowInteractionVerdict
        exampleWholeFlowInteractionRouteMismatch =
          Verdict.proofInsufficient := by
  native_decide

theorem passive_interaction_author_packet_blocks_flow_pass :
    interactionProofHardBlockerPresent
        examplePassiveInteractionProofContract = true := by
  native_decide

theorem non_interaction_mode_does_not_require_interaction_packet :
    interactionProofEvidenceComplete exampleNonInteractionProofContract = true
      ∧ interactionProofHardBlockerPresent
        exampleNonInteractionProofContract = false := by
  native_decide

/-!
Layer 4: checkpoint response semantics.

The runtime checkpoint protocol has two visible JSON surfaces:

- `riddle-proof.checkpoint.v1`, the active packet with run/checkpoint identity,
  packet lineage, an optional resume token, and an advertised
  `allowed_decisions` list.
- `riddle-proof.checkpoint_response.v1`, the supervising response.

The semantic contract is narrower than JSON shape validation: an accepted
response must match the active packet lineage and must use a decision
advertised by that packet. Late responses after protected terminal states are
ignored rather than reopening the run.
-/

inductive CheckpointDecision where
  | continueStage
  | retryStage
  | readyForAuthor
  | retryRecon
  | reconStuck
  | needsRecon
  | needsImplementation
  | needsAuthor
  | implementationComplete
  | authorPacket
  | readyToShip
  | needsRicherProof
  | reviseCapture
  | blocked
  | humanReview
  deriving Repr, DecidableEq

inductive CheckpointRunStatus where
  | running
  | awaitingCheckpoint
  | readyToShip
  | completed
  | blocked
  deriving Repr, DecidableEq

inductive CheckpointBlocker where
  | duplicate
  | withoutPacket
  | mismatch
  | resumeTokenMismatch
  | packetLineageMismatch
  | decisionNotAllowed
  deriving Repr, DecidableEq

inductive CheckpointResponseOutcome where
  | accepted
  | ignoredFinal
  | blocked (reason : CheckpointBlocker)
  deriving Repr, DecidableEq

structure CheckpointPacket where
  runId : Nat
  checkpointId : Nat
  packetLineage : Nat
  resumeToken : Option Nat
  allowedDecisions : List CheckpointDecision
  deriving Repr

structure CheckpointResponse where
  runId : Nat
  checkpointId : Nat
  packetLineage : Option Nat
  resumeToken : Option Nat
  decision : CheckpointDecision
  deriving Repr

structure CheckpointRunState where
  status : CheckpointRunStatus
  packet : Option CheckpointPacket
  responseAlreadyAccepted : Bool
  deriving Repr

def protectedFinalStatus : CheckpointRunStatus → Bool
  | CheckpointRunStatus.readyToShip => true
  | CheckpointRunStatus.completed => true
  | _ => false

def decisionAdvertised
    (decision : CheckpointDecision)
    (allowed : List CheckpointDecision) : Bool :=
  match allowed with
  | [] => false
  | head :: tail =>
      if head = decision then
        true
      else
        decisionAdvertised decision tail

def sameRunAndCheckpoint (packet : CheckpointPacket) (response : CheckpointResponse) : Bool :=
  packet.runId = response.runId && packet.checkpointId = response.checkpointId

def resumeTokenMatches (packet : CheckpointPacket) (response : CheckpointResponse) : Bool :=
  match packet.resumeToken with
  | none => true
  | some token => response.resumeToken = some token

def packetLineageMatches (packet : CheckpointPacket) (response : CheckpointResponse) : Bool :=
  response.packetLineage = some packet.packetLineage

def activePacketAccepts (packet : CheckpointPacket) (response : CheckpointResponse) : Bool :=
  sameRunAndCheckpoint packet response
    && resumeTokenMatches packet response
    && packetLineageMatches packet response
    && decisionAdvertised response.decision packet.allowedDecisions

def checkpointResponseOutcome
    (state : CheckpointRunState)
    (response : CheckpointResponse) : CheckpointResponseOutcome :=
  if state.responseAlreadyAccepted then
    CheckpointResponseOutcome.blocked CheckpointBlocker.duplicate
  else if protectedFinalStatus state.status && state.packet.isNone then
    CheckpointResponseOutcome.ignoredFinal
  else
    match state.packet with
    | none =>
        CheckpointResponseOutcome.blocked CheckpointBlocker.withoutPacket
    | some packet =>
        if sameRunAndCheckpoint packet response = false then
          CheckpointResponseOutcome.blocked CheckpointBlocker.mismatch
        else if resumeTokenMatches packet response = false then
          CheckpointResponseOutcome.blocked CheckpointBlocker.resumeTokenMismatch
        else if packetLineageMatches packet response = false then
          CheckpointResponseOutcome.blocked CheckpointBlocker.packetLineageMismatch
        else if decisionAdvertised response.decision packet.allowedDecisions = false then
          CheckpointResponseOutcome.blocked CheckpointBlocker.decisionNotAllowed
        else
          CheckpointResponseOutcome.accepted

/-!
An intentionally incomplete acceptance model. It matches the active packet
identity, resume token, and packet lineage, but forgets to require the decision
to be advertised by the packet. This mirrors the class of drift where response
parsing/continuation accepts a decision that `allowed_decisions` did not expose.
-/
def checkpointResponseOutcomeWithoutAllowedGuard
    (state : CheckpointRunState)
    (response : CheckpointResponse) : CheckpointResponseOutcome :=
  if state.responseAlreadyAccepted then
    CheckpointResponseOutcome.blocked CheckpointBlocker.duplicate
  else if protectedFinalStatus state.status && state.packet.isNone then
    CheckpointResponseOutcome.ignoredFinal
  else
    match state.packet with
    | none =>
        CheckpointResponseOutcome.blocked CheckpointBlocker.withoutPacket
    | some packet =>
        if sameRunAndCheckpoint packet response = false then
          CheckpointResponseOutcome.blocked CheckpointBlocker.mismatch
        else if resumeTokenMatches packet response = false then
          CheckpointResponseOutcome.blocked CheckpointBlocker.resumeTokenMismatch
        else if packetLineageMatches packet response = false then
          CheckpointResponseOutcome.blocked CheckpointBlocker.packetLineageMismatch
        else
          CheckpointResponseOutcome.accepted

def checkpointResponseOutcomeWithoutLineageGuard
    (state : CheckpointRunState)
    (response : CheckpointResponse) : CheckpointResponseOutcome :=
  if state.responseAlreadyAccepted then
    CheckpointResponseOutcome.blocked CheckpointBlocker.duplicate
  else if protectedFinalStatus state.status && state.packet.isNone then
    CheckpointResponseOutcome.ignoredFinal
  else
    match state.packet with
    | none =>
        CheckpointResponseOutcome.blocked CheckpointBlocker.withoutPacket
    | some packet =>
        if sameRunAndCheckpoint packet response = false then
          CheckpointResponseOutcome.blocked CheckpointBlocker.mismatch
        else if resumeTokenMatches packet response = false then
          CheckpointResponseOutcome.blocked CheckpointBlocker.resumeTokenMismatch
        else if decisionAdvertised response.decision packet.allowedDecisions = false then
          CheckpointResponseOutcome.blocked CheckpointBlocker.decisionNotAllowed
        else
          CheckpointResponseOutcome.accepted

theorem ready_to_ship_without_packet_ignores_nonduplicate_response
    (response : CheckpointResponse) :
    checkpointResponseOutcome {
      status := CheckpointRunStatus.readyToShip
      packet := none
      responseAlreadyAccepted := false
    } response = CheckpointResponseOutcome.ignoredFinal := by
  simp [checkpointResponseOutcome, protectedFinalStatus]

theorem completed_without_packet_ignores_nonduplicate_response
    (response : CheckpointResponse) :
    checkpointResponseOutcome {
      status := CheckpointRunStatus.completed
      packet := none
      responseAlreadyAccepted := false
    } response = CheckpointResponseOutcome.ignoredFinal := by
  simp [checkpointResponseOutcome, protectedFinalStatus]

theorem duplicate_response_blocks_before_final_ignore
    (status : CheckpointRunStatus)
    (response : CheckpointResponse) :
    checkpointResponseOutcome {
      status := status
      packet := none
      responseAlreadyAccepted := true
    } response =
      CheckpointResponseOutcome.blocked CheckpointBlocker.duplicate := by
  simp [checkpointResponseOutcome]

theorem active_packet_accepts_implies_identity_and_advertised
    (packet : CheckpointPacket)
    (response : CheckpointResponse)
    (hAccepted : activePacketAccepts packet response = true) :
    sameRunAndCheckpoint packet response = true
      ∧ resumeTokenMatches packet response = true
      ∧ packetLineageMatches packet response = true
      ∧ decisionAdvertised response.decision packet.allowedDecisions = true := by
  simp [activePacketAccepts] at hAccepted
  exact ⟨hAccepted.1.1.1, hAccepted.1.1.2, hAccepted.1.2, hAccepted.2⟩

theorem accepted_response_has_matching_advertised_packet
    (packet : CheckpointPacket)
    (response : CheckpointResponse)
    (hAccepted :
      checkpointResponseOutcome {
        status := CheckpointRunStatus.awaitingCheckpoint
        packet := some packet
        responseAlreadyAccepted := false
      } response = CheckpointResponseOutcome.accepted) :
    sameRunAndCheckpoint packet response = true
      ∧ resumeTokenMatches packet response = true
      ∧ packetLineageMatches packet response = true
      ∧ decisionAdvertised response.decision packet.allowedDecisions = true := by
  by_cases hSame : sameRunAndCheckpoint packet response = false
  · simp [checkpointResponseOutcome, hSame] at hAccepted
  · have hSameTrue : sameRunAndCheckpoint packet response = true := by
      cases h : sameRunAndCheckpoint packet response with
      | false => contradiction
      | true => rfl
    by_cases hToken : resumeTokenMatches packet response = false
    · simp [checkpointResponseOutcome, hSameTrue, hToken] at hAccepted
    · have hTokenTrue : resumeTokenMatches packet response = true := by
        cases h : resumeTokenMatches packet response with
        | false => contradiction
        | true => rfl
      by_cases hLineage : packetLineageMatches packet response = false
      · simp [checkpointResponseOutcome, hSameTrue, hTokenTrue, hLineage] at hAccepted
      · have hLineageTrue : packetLineageMatches packet response = true := by
          cases h : packetLineageMatches packet response with
          | false => contradiction
          | true => rfl
        by_cases hAllowed : decisionAdvertised response.decision packet.allowedDecisions = false
        · simp [checkpointResponseOutcome, hSameTrue, hTokenTrue, hLineageTrue, hAllowed] at hAccepted
        · have hAllowedTrue : decisionAdvertised response.decision packet.allowedDecisions = true := by
            cases h : decisionAdvertised response.decision packet.allowedDecisions with
            | false => contradiction
            | true => rfl
          exact ⟨hSameTrue, hTokenTrue, hLineageTrue, hAllowedTrue⟩

def exampleReconPacketBeforeAllowedFix : CheckpointPacket where
  runId := 7
  checkpointId := 11
  packetLineage := 101
  resumeToken := some 19
  allowedDecisions := [
    CheckpointDecision.readyForAuthor,
    CheckpointDecision.retryRecon,
    CheckpointDecision.reconStuck,
    CheckpointDecision.blocked,
    CheckpointDecision.humanReview
  ]

def exampleReconPacketAfterAllowedFix : CheckpointPacket where
  runId := 7
  checkpointId := 11
  packetLineage := 101
  resumeToken := some 19
  allowedDecisions := [
    CheckpointDecision.readyForAuthor,
    CheckpointDecision.retryRecon,
    CheckpointDecision.reconStuck,
    CheckpointDecision.needsRecon,
    CheckpointDecision.blocked,
    CheckpointDecision.humanReview
  ]

def exampleReconNeedsReconResponse : CheckpointResponse where
  runId := 7
  checkpointId := 11
  packetLineage := some 101
  resumeToken := some 19
  decision := CheckpointDecision.needsRecon

def exampleReconForgedAuthorPacketResponse : CheckpointResponse where
  runId := 7
  checkpointId := 11
  packetLineage := some 101
  resumeToken := some 19
  decision := CheckpointDecision.authorPacket

def exampleReconStaleLineageResponse : CheckpointResponse where
  runId := 7
  checkpointId := 11
  packetLineage := some 100
  resumeToken := some 19
  decision := CheckpointDecision.needsRecon

def exampleReconBeforeAllowedState : CheckpointRunState where
  status := CheckpointRunStatus.awaitingCheckpoint
  packet := some exampleReconPacketBeforeAllowedFix
  responseAlreadyAccepted := false

def exampleReconAfterAllowedState : CheckpointRunState where
  status := CheckpointRunStatus.awaitingCheckpoint
  packet := some exampleReconPacketAfterAllowedFix
  responseAlreadyAccepted := false

def exampleGenericPacketBeforeRetryAllowedFix : CheckpointPacket where
  runId := 8
  checkpointId := 13
  packetLineage := 201
  resumeToken := some 21
  allowedDecisions := [
    CheckpointDecision.continueStage,
    CheckpointDecision.needsRecon,
    CheckpointDecision.needsImplementation,
    CheckpointDecision.blocked,
    CheckpointDecision.humanReview
  ]

def exampleGenericPacketAfterRetryAllowedFix : CheckpointPacket where
  runId := 8
  checkpointId := 13
  packetLineage := 201
  resumeToken := some 21
  allowedDecisions := [
    CheckpointDecision.continueStage,
    CheckpointDecision.retryStage,
    CheckpointDecision.needsRecon,
    CheckpointDecision.needsImplementation,
    CheckpointDecision.blocked,
    CheckpointDecision.humanReview
  ]

def exampleGenericRetryStageResponse : CheckpointResponse where
  runId := 8
  checkpointId := 13
  packetLineage := some 201
  resumeToken := some 21
  decision := CheckpointDecision.retryStage

def exampleGenericBeforeRetryAllowedState : CheckpointRunState where
  status := CheckpointRunStatus.awaitingCheckpoint
  packet := some exampleGenericPacketBeforeRetryAllowedFix
  responseAlreadyAccepted := false

def exampleGenericAfterRetryAllowedState : CheckpointRunState where
  status := CheckpointRunStatus.awaitingCheckpoint
  packet := some exampleGenericPacketAfterRetryAllowedFix
  responseAlreadyAccepted := false

#eval checkpointResponseOutcomeWithoutAllowedGuard exampleReconBeforeAllowedState exampleReconNeedsReconResponse
#eval checkpointResponseOutcome exampleReconBeforeAllowedState exampleReconNeedsReconResponse
#eval checkpointResponseOutcome exampleReconAfterAllowedState exampleReconNeedsReconResponse
#eval checkpointResponseOutcomeWithoutAllowedGuard exampleReconAfterAllowedState exampleReconForgedAuthorPacketResponse
#eval checkpointResponseOutcome exampleReconAfterAllowedState exampleReconForgedAuthorPacketResponse
#eval checkpointResponseOutcomeWithoutLineageGuard exampleReconAfterAllowedState exampleReconStaleLineageResponse
#eval checkpointResponseOutcome exampleReconAfterAllowedState exampleReconStaleLineageResponse

#eval checkpointResponseOutcomeWithoutAllowedGuard exampleGenericBeforeRetryAllowedState exampleGenericRetryStageResponse
#eval checkpointResponseOutcome exampleGenericBeforeRetryAllowedState exampleGenericRetryStageResponse
#eval checkpointResponseOutcome exampleGenericAfterRetryAllowedState exampleGenericRetryStageResponse

theorem unadvertised_recon_response_was_accepted_without_allowed_guard :
    checkpointResponseOutcomeWithoutAllowedGuard
        exampleReconBeforeAllowedState
        exampleReconNeedsReconResponse = CheckpointResponseOutcome.accepted
      ∧ checkpointResponseOutcome
        exampleReconBeforeAllowedState
        exampleReconNeedsReconResponse =
          CheckpointResponseOutcome.blocked CheckpointBlocker.decisionNotAllowed := by
  native_decide

theorem advertised_recon_response_is_accepted :
    checkpointResponseOutcome
      exampleReconAfterAllowedState
      exampleReconNeedsReconResponse = CheckpointResponseOutcome.accepted := by
  native_decide

theorem forged_author_packet_recon_response_requires_allowed_guard :
    checkpointResponseOutcomeWithoutAllowedGuard
        exampleReconAfterAllowedState
        exampleReconForgedAuthorPacketResponse = CheckpointResponseOutcome.accepted
      ∧ checkpointResponseOutcome
        exampleReconAfterAllowedState
        exampleReconForgedAuthorPacketResponse =
          CheckpointResponseOutcome.blocked CheckpointBlocker.decisionNotAllowed := by
  native_decide

theorem stale_checkpoint_lineage_requires_lineage_guard :
    checkpointResponseOutcomeWithoutLineageGuard
        exampleReconAfterAllowedState
        exampleReconStaleLineageResponse = CheckpointResponseOutcome.accepted
      ∧ checkpointResponseOutcome
        exampleReconAfterAllowedState
        exampleReconStaleLineageResponse =
          CheckpointResponseOutcome.blocked CheckpointBlocker.packetLineageMismatch := by
  native_decide

theorem unadvertised_retry_stage_was_accepted_without_allowed_guard :
    checkpointResponseOutcomeWithoutAllowedGuard
        exampleGenericBeforeRetryAllowedState
        exampleGenericRetryStageResponse = CheckpointResponseOutcome.accepted
      ∧ checkpointResponseOutcome
        exampleGenericBeforeRetryAllowedState
        exampleGenericRetryStageResponse =
          CheckpointResponseOutcome.blocked CheckpointBlocker.decisionNotAllowed := by
  native_decide

theorem advertised_retry_stage_response_is_accepted :
    checkpointResponseOutcome
      exampleGenericAfterRetryAllowedState
      exampleGenericRetryStageResponse = CheckpointResponseOutcome.accepted := by
  native_decide

/-!
Layer 4.1: checkpoint proof-assessment source authority.

Packet identity and allowed-decision checks say a response belongs to the active
checkpoint. They do not by themselves say the response is allowed to approve
shipping. A proof checkpoint response can hold `ready_to_ship` only when its
response source maps to a trusted proof-assessment source.
-/

inductive CheckpointResponseSourceKind where
  | missing
  | openclawMain
  | openclawSubagent
  | codex
  | claudeCode
  | human
  | ci
  | unknown
  deriving Repr, DecidableEq

def proofAssessmentSourceFromCheckpointResponseKind :
    CheckpointResponseSourceKind → ProofAssessmentSource
  | CheckpointResponseSourceKind.missing => ProofAssessmentSource.supervisingAgent
  | CheckpointResponseSourceKind.openclawMain => ProofAssessmentSource.supervisingAgent
  | CheckpointResponseSourceKind.codex => ProofAssessmentSource.supervisingAgent
  | CheckpointResponseSourceKind.claudeCode => ProofAssessmentSource.supervisingAgent
  | CheckpointResponseSourceKind.human => ProofAssessmentSource.supervisor
  | CheckpointResponseSourceKind.openclawSubagent => ProofAssessmentSource.runner
  | CheckpointResponseSourceKind.ci => ProofAssessmentSource.runner
  | CheckpointResponseSourceKind.unknown => ProofAssessmentSource.unknown

def checkpointResponseReadyHoldWithoutSourceGuard
    (state : CheckpointRunState)
    (response : CheckpointResponse) : Bool :=
  decide (checkpointResponseOutcome state response = CheckpointResponseOutcome.accepted)
    && decide (response.decision = CheckpointDecision.readyToShip)

def checkpointResponseReadyHoldWithSourceGuard
    (state : CheckpointRunState)
    (response : CheckpointResponse)
    (source : CheckpointResponseSourceKind) : Bool :=
  checkpointResponseReadyHoldWithoutSourceGuard state response
    && supervisorSourceAccepted
      (proofAssessmentSourceFromCheckpointResponseKind source)

def exampleVerifyProofPacket : CheckpointPacket where
  runId := 9
  checkpointId := 17
  packetLineage := 301
  resumeToken := some 23
  allowedDecisions := [
    CheckpointDecision.readyToShip,
    CheckpointDecision.needsRicherProof,
    CheckpointDecision.reviseCapture,
    CheckpointDecision.needsRecon,
    CheckpointDecision.needsImplementation,
    CheckpointDecision.blocked,
    CheckpointDecision.humanReview
  ]

def exampleVerifyProofState : CheckpointRunState where
  status := CheckpointRunStatus.awaitingCheckpoint
  packet := some exampleVerifyProofPacket
  responseAlreadyAccepted := false

def exampleVerifyReadyToShipResponse : CheckpointResponse where
  runId := 9
  checkpointId := 17
  packetLineage := some 301
  resumeToken := some 23
  decision := CheckpointDecision.readyToShip

#eval checkpointResponseReadyHoldWithoutSourceGuard
  exampleVerifyProofState
  exampleVerifyReadyToShipResponse
#eval checkpointResponseReadyHoldWithSourceGuard
  exampleVerifyProofState
  exampleVerifyReadyToShipResponse
  CheckpointResponseSourceKind.ci
#eval checkpointResponseReadyHoldWithSourceGuard
  exampleVerifyProofState
  exampleVerifyReadyToShipResponse
  CheckpointResponseSourceKind.codex

theorem ci_checkpoint_response_source_cannot_hold_ready_to_ship :
    checkpointResponseReadyHoldWithoutSourceGuard
        exampleVerifyProofState
        exampleVerifyReadyToShipResponse = true
      ∧ checkpointResponseReadyHoldWithSourceGuard
        exampleVerifyProofState
        exampleVerifyReadyToShipResponse
        CheckpointResponseSourceKind.ci = false := by
  native_decide

theorem subagent_checkpoint_response_source_cannot_hold_ready_to_ship :
    checkpointResponseReadyHoldWithoutSourceGuard
        exampleVerifyProofState
        exampleVerifyReadyToShipResponse = true
      ∧ checkpointResponseReadyHoldWithSourceGuard
        exampleVerifyProofState
        exampleVerifyReadyToShipResponse
        CheckpointResponseSourceKind.openclawSubagent = false := by
  native_decide

theorem codex_checkpoint_response_source_can_hold_ready_to_ship :
    checkpointResponseReadyHoldWithSourceGuard
      exampleVerifyProofState
      exampleVerifyReadyToShipResponse
      CheckpointResponseSourceKind.codex = true := by
  native_decide

theorem human_checkpoint_response_source_can_hold_ready_to_ship :
    checkpointResponseReadyHoldWithSourceGuard
      exampleVerifyProofState
      exampleVerifyReadyToShipResponse
      CheckpointResponseSourceKind.human = true := by
  native_decide

def checkpointResponseReadyHoldWithProofGate
    (state : CheckpointRunState)
    (response : CheckpointResponse)
    (source : CheckpointResponseSourceKind)
    (hardBlockersPresent : Bool) : Bool :=
  checkpointResponseReadyHoldWithSourceGuard state response source
    && !hardBlockersPresent

theorem human_checkpoint_response_with_hard_blocker_cannot_hold_ready_to_ship :
    checkpointResponseReadyHoldWithSourceGuard
        exampleVerifyProofState
        exampleVerifyReadyToShipResponse
        CheckpointResponseSourceKind.human = true
      ∧ checkpointResponseReadyHoldWithProofGate
        exampleVerifyProofState
        exampleVerifyReadyToShipResponse
        CheckpointResponseSourceKind.human
        true = false := by
  native_decide

theorem human_checkpoint_response_without_hard_blocker_can_hold_ready_to_ship :
    checkpointResponseReadyHoldWithProofGate
      exampleVerifyProofState
      exampleVerifyReadyToShipResponse
      CheckpointResponseSourceKind.human
      false = true := by
  native_decide

/-!
Layer 4.5: checkpoint lifecycle summary semantics.

Once a checkpoint response passes the active-packet guard above, the runtime also
projects a compact lifecycle summary from durable state. This model keeps that
post-admission contract separate from the parser/identity guard:

- accepted advancing responses count once and clear the pending packet
- accepted blocking/manual-stop responses count once and retain the packet
- rejected responses are blockers, not accepted responses
- duplicate responses are tracked separately and do not replay acceptance
-/

inductive CheckpointLifecycleResponse where
  | acceptedAdvancing
  | acceptedBlocking
  | rejected
  | duplicate
  | ignored
  deriving Repr, DecidableEq

structure CheckpointLifecycleState where
  pendingPacket : Bool
  acceptedResponseCount : Nat
  duplicateResponseCount : Nat
  rejectedResponseCount : Nat
  ignoredResponseCount : Nat
  deriving Repr, DecidableEq

structure CheckpointLifecycleSummary where
  pending : Bool
  responseCount : Nat
  duplicateResponseCount : Nat
  rejectedResponseCount : Nat
  ignoredResponseCount : Nat
  deriving Repr, DecidableEq

def checkpointLifecycleSummary (state : CheckpointLifecycleState) : CheckpointLifecycleSummary where
  pending := state.pendingPacket
  responseCount := state.acceptedResponseCount
  duplicateResponseCount := state.duplicateResponseCount
  rejectedResponseCount := state.rejectedResponseCount
  ignoredResponseCount := state.ignoredResponseCount

def applyCheckpointLifecycleResponse
    (state : CheckpointLifecycleState)
    (response : CheckpointLifecycleResponse) : CheckpointLifecycleState :=
  match response with
  | CheckpointLifecycleResponse.acceptedAdvancing =>
      { state with
        pendingPacket := false
        acceptedResponseCount := state.acceptedResponseCount + 1 }
  | CheckpointLifecycleResponse.acceptedBlocking =>
      { state with
        acceptedResponseCount := state.acceptedResponseCount + 1 }
  | CheckpointLifecycleResponse.rejected =>
      { state with
        rejectedResponseCount := state.rejectedResponseCount + 1 }
  | CheckpointLifecycleResponse.duplicate =>
      { state with
        duplicateResponseCount := state.duplicateResponseCount + 1 }
  | CheckpointLifecycleResponse.ignored =>
      { state with
        ignoredResponseCount := state.ignoredResponseCount + 1 }

/-!
Two intentionally broken lifecycle projections. The first clears the pending
packet after a blocking response; the second counts rejected blockers as
accepted responses.
-/
def checkpointLifecycleClearsBlocking
    (state : CheckpointLifecycleState)
    (response : CheckpointLifecycleResponse) : CheckpointLifecycleState :=
  match response with
  | CheckpointLifecycleResponse.acceptedAdvancing =>
      { state with
        pendingPacket := false
        acceptedResponseCount := state.acceptedResponseCount + 1 }
  | CheckpointLifecycleResponse.acceptedBlocking =>
      { state with
        pendingPacket := false
        acceptedResponseCount := state.acceptedResponseCount + 1 }
  | CheckpointLifecycleResponse.rejected =>
      { state with
        rejectedResponseCount := state.rejectedResponseCount + 1 }
  | CheckpointLifecycleResponse.duplicate =>
      { state with
        duplicateResponseCount := state.duplicateResponseCount + 1 }
  | CheckpointLifecycleResponse.ignored =>
      { state with
        ignoredResponseCount := state.ignoredResponseCount + 1 }

def checkpointLifecycleCountsRejected
    (state : CheckpointLifecycleState)
    (response : CheckpointLifecycleResponse) : CheckpointLifecycleState :=
  match response with
  | CheckpointLifecycleResponse.rejected =>
      { (applyCheckpointLifecycleResponse state response) with
        acceptedResponseCount := state.acceptedResponseCount + 1 }
  | _ =>
      applyCheckpointLifecycleResponse state response

def checkpointLifecycleCountsIgnored
    (state : CheckpointLifecycleState)
    (response : CheckpointLifecycleResponse) : CheckpointLifecycleState :=
  match response with
  | CheckpointLifecycleResponse.ignored =>
      { (applyCheckpointLifecycleResponse state response) with
        acceptedResponseCount := state.acceptedResponseCount + 1 }
  | _ =>
      applyCheckpointLifecycleResponse state response

theorem accepted_advancing_response_clears_pending_packet
    (state : CheckpointLifecycleState) :
    (applyCheckpointLifecycleResponse
      state
      CheckpointLifecycleResponse.acceptedAdvancing).pendingPacket = false := by
  rfl

theorem accepted_advancing_response_increments_response_count
    (state : CheckpointLifecycleState) :
    (applyCheckpointLifecycleResponse
      state
      CheckpointLifecycleResponse.acceptedAdvancing).acceptedResponseCount =
        state.acceptedResponseCount + 1 := by
  rfl

theorem accepted_blocking_response_retains_pending_packet
    (state : CheckpointLifecycleState)
    (hPending : state.pendingPacket = true) :
    (applyCheckpointLifecycleResponse
      state
      CheckpointLifecycleResponse.acceptedBlocking).pendingPacket = true := by
  simp [applyCheckpointLifecycleResponse, hPending]

theorem accepted_blocking_response_increments_response_count
    (state : CheckpointLifecycleState) :
    (applyCheckpointLifecycleResponse
      state
      CheckpointLifecycleResponse.acceptedBlocking).acceptedResponseCount =
        state.acceptedResponseCount + 1 := by
  rfl

theorem rejected_response_does_not_increment_response_count
    (state : CheckpointLifecycleState) :
    (applyCheckpointLifecycleResponse
      state
      CheckpointLifecycleResponse.rejected).acceptedResponseCount =
        state.acceptedResponseCount := by
  rfl

theorem rejected_response_increments_rejected_count
    (state : CheckpointLifecycleState) :
    (applyCheckpointLifecycleResponse
      state
      CheckpointLifecycleResponse.rejected).rejectedResponseCount =
        state.rejectedResponseCount + 1 := by
  rfl

theorem rejected_response_retains_pending_packet
    (state : CheckpointLifecycleState) :
    (applyCheckpointLifecycleResponse
      state
      CheckpointLifecycleResponse.rejected).pendingPacket =
        state.pendingPacket := by
  rfl

theorem duplicate_response_does_not_increment_response_count
    (state : CheckpointLifecycleState) :
    (applyCheckpointLifecycleResponse
      state
      CheckpointLifecycleResponse.duplicate).acceptedResponseCount =
        state.acceptedResponseCount := by
  rfl

theorem duplicate_response_increments_duplicate_count
    (state : CheckpointLifecycleState) :
    (applyCheckpointLifecycleResponse
      state
      CheckpointLifecycleResponse.duplicate).duplicateResponseCount =
        state.duplicateResponseCount + 1 := by
  rfl

theorem ignored_response_does_not_increment_response_count
    (state : CheckpointLifecycleState) :
    (applyCheckpointLifecycleResponse
      state
      CheckpointLifecycleResponse.ignored).acceptedResponseCount =
        state.acceptedResponseCount := by
  rfl

theorem ignored_response_increments_ignored_count
    (state : CheckpointLifecycleState) :
    (applyCheckpointLifecycleResponse
      state
      CheckpointLifecycleResponse.ignored).ignoredResponseCount =
        state.ignoredResponseCount + 1 := by
  rfl

theorem ignored_response_retains_pending_packet
    (state : CheckpointLifecycleState) :
    (applyCheckpointLifecycleResponse
      state
      CheckpointLifecycleResponse.ignored).pendingPacket =
        state.pendingPacket := by
  rfl

theorem checkpoint_lifecycle_summary_projects_state
    (state : CheckpointLifecycleState) :
    (checkpointLifecycleSummary state).pending = state.pendingPacket
      ∧ (checkpointLifecycleSummary state).responseCount = state.acceptedResponseCount
      ∧ (checkpointLifecycleSummary state).duplicateResponseCount =
        state.duplicateResponseCount
      ∧ (checkpointLifecycleSummary state).rejectedResponseCount =
        state.rejectedResponseCount
      ∧ (checkpointLifecycleSummary state).ignoredResponseCount =
        state.ignoredResponseCount := by
  simp [checkpointLifecycleSummary]

structure CheckpointTokenMatchInput where
  packetHasToken : Bool
  responseSeen : Bool
  responseHasToken : Bool
  tokenValuesEqual : Bool
  deriving Repr, DecidableEq

def checkpointTokenMatchSummary (input : CheckpointTokenMatchInput) : Option Bool :=
  if input.responseSeen = false then
    none
  else if input.packetHasToken && input.responseHasToken then
    some input.tokenValuesEqual
  else if input.packetHasToken || input.responseHasToken then
    some false
  else
    none

/-!
The old projection treated a pending packet token without any response as a
token mismatch. That is not a comparison result; it means no response has been
seen yet.
-/
def checkpointTokenMatchSummaryBeforePendingGuard
    (input : CheckpointTokenMatchInput) : Option Bool :=
  if input.packetHasToken && input.responseHasToken then
    some input.tokenValuesEqual
  else if input.packetHasToken || input.responseHasToken then
    some false
  else
    none

theorem pending_packet_without_response_has_no_token_match_verdict :
    checkpointTokenMatchSummary {
      packetHasToken := true
      responseSeen := false
      responseHasToken := false
      tokenValuesEqual := false
    } = none
      ∧ checkpointTokenMatchSummaryBeforePendingGuard {
        packetHasToken := true
        responseSeen := false
        responseHasToken := false
        tokenValuesEqual := false
      } = some false := by
  native_decide

theorem matching_response_token_reports_true :
    checkpointTokenMatchSummary {
      packetHasToken := true
      responseSeen := true
      responseHasToken := true
      tokenValuesEqual := true
    } = some true := by
  native_decide

theorem mismatched_response_token_reports_false :
    checkpointTokenMatchSummary {
      packetHasToken := true
      responseSeen := true
      responseHasToken := true
      tokenValuesEqual := false
    } = some false := by
  native_decide

def examplePendingCheckpointLifecycle : CheckpointLifecycleState where
  pendingPacket := true
  acceptedResponseCount := 0
  duplicateResponseCount := 0
  rejectedResponseCount := 0
  ignoredResponseCount := 0

theorem clearing_blocking_response_loses_pending_packet :
    (applyCheckpointLifecycleResponse
      examplePendingCheckpointLifecycle
      CheckpointLifecycleResponse.acceptedBlocking).pendingPacket = true
      ∧ (checkpointLifecycleClearsBlocking
        examplePendingCheckpointLifecycle
        CheckpointLifecycleResponse.acceptedBlocking).pendingPacket = false := by
  native_decide

theorem counting_rejected_response_inflates_accepted_count :
    (applyCheckpointLifecycleResponse
      examplePendingCheckpointLifecycle
      CheckpointLifecycleResponse.rejected).acceptedResponseCount = 0
      ∧ (applyCheckpointLifecycleResponse
        examplePendingCheckpointLifecycle
        CheckpointLifecycleResponse.rejected).rejectedResponseCount = 1
      ∧ (checkpointLifecycleCountsRejected
        examplePendingCheckpointLifecycle
        CheckpointLifecycleResponse.rejected).acceptedResponseCount = 1 := by
  native_decide

theorem counting_ignored_response_inflates_accepted_count :
    (applyCheckpointLifecycleResponse
      examplePendingCheckpointLifecycle
      CheckpointLifecycleResponse.ignored).acceptedResponseCount = 0
      ∧ (applyCheckpointLifecycleResponse
        examplePendingCheckpointLifecycle
        CheckpointLifecycleResponse.ignored).ignoredResponseCount = 1
      ∧ (checkpointLifecycleCountsIgnored
        examplePendingCheckpointLifecycle
        CheckpointLifecycleResponse.ignored).acceptedResponseCount = 1 := by
  native_decide

/-!
Layer 4.6: checkpoint recovery readiness.

A supervising checkpoint response may say `ready_to_ship`, but a recovery
checkpoint still has to respect the framework-owned evidence gate. If visual or
other required recovery evidence is incomplete, the response is routed back into
recovery instead of terminalizing the run as ready.
-/

inductive RecoveryEvidence where
  | incomplete
  | complete
  deriving Repr, DecidableEq

inductive ReadyCheckpointDisposition where
  | terminalReady
  | continueRecovery
  deriving Repr, DecidableEq

def readyCheckpointDispositionWithRecoveryGate
    (evidence : RecoveryEvidence) : ReadyCheckpointDisposition :=
  match evidence with
  | RecoveryEvidence.complete =>
      ReadyCheckpointDisposition.terminalReady
  | RecoveryEvidence.incomplete =>
      ReadyCheckpointDisposition.continueRecovery

def readyCheckpointDispositionWithoutRecoveryGate
    (_evidence : RecoveryEvidence) : ReadyCheckpointDisposition :=
  ReadyCheckpointDisposition.terminalReady

theorem incomplete_recovery_ready_response_continues_recovery :
    readyCheckpointDispositionWithRecoveryGate RecoveryEvidence.incomplete =
      ReadyCheckpointDisposition.continueRecovery := by
  native_decide

theorem complete_recovery_ready_response_can_terminalize :
    readyCheckpointDispositionWithRecoveryGate RecoveryEvidence.complete =
      ReadyCheckpointDisposition.terminalReady := by
  native_decide

theorem recovery_gate_prevents_passed_after_incomplete_recovery :
    readyCheckpointDispositionWithoutRecoveryGate RecoveryEvidence.incomplete =
        ReadyCheckpointDisposition.terminalReady
      ∧ readyCheckpointDispositionWithRecoveryGate RecoveryEvidence.incomplete =
        ReadyCheckpointDisposition.continueRecovery := by
  native_decide

/-!
Layer 5: run lifecycle and run-card projection.

The runtime has a durable run state plus derived public surfaces: status
snapshots, run cards, and terminal results. The semantic contract is that those
public surfaces are projections of the run state. They cannot invent a
successful terminal status independently of the state, and finalized protected
states cannot be reopened by stale lower-priority updates.
-/

inductive RunLifecycleStatus where
  | running
  | awaitingCheckpoint
  | blocked
  | failed
  | readyToShip
  | shipped
  | completed
  deriving Repr, DecidableEq, BEq

def isProtectedLifecycleFinalStatus : RunLifecycleStatus → Bool
  | RunLifecycleStatus.readyToShip => true
  | RunLifecycleStatus.shipped => true
  | RunLifecycleStatus.completed => true
  | _ => false

def isRunLifecycleTerminal : RunLifecycleStatus → Bool
  | RunLifecycleStatus.blocked => true
  | RunLifecycleStatus.failed => true
  | RunLifecycleStatus.readyToShip => true
  | RunLifecycleStatus.shipped => true
  | RunLifecycleStatus.completed => true
  | _ => false

def isRunLifecycleSuccessful : RunLifecycleStatus → Bool
  | RunLifecycleStatus.blocked => false
  | RunLifecycleStatus.failed => false
  | _ => true

structure RunLifecycleState where
  status : RunLifecycleStatus
  finalized : Bool
  blockerVisible : Bool
  proofDecisionReady : Bool
  mergeRecommendationReady : Bool
  shipGateOk : Bool
  shipHeld : Bool
  shippingDisabled : Bool
  shipAuthorized : Bool
  deriving Repr

def applyTerminalRunStatus
    (state : RunLifecycleState)
    (status : RunLifecycleStatus) : RunLifecycleState :=
  { state with
    status := status
    finalized := state.finalized || isProtectedLifecycleFinalStatus status }

def shouldPreserveFinalizedRunState
    (existing incoming : RunLifecycleState) : Bool :=
  if existing.finalized && isProtectedLifecycleFinalStatus existing.status then
    if !incoming.finalized then
      true
    else if existing.status = incoming.status then
      false
    else
      !(existing.status = RunLifecycleStatus.readyToShip
        && incoming.status = RunLifecycleStatus.shipped)
  else
    false

def applyCheckpointResponseWithoutPendingPacket
    (state : RunLifecycleState) : RunLifecycleState :=
  if isProtectedLifecycleFinalStatus state.status then
    state
  else
    { state with
      status := RunLifecycleStatus.blocked
      blockerVisible := true }

theorem protected_terminal_run_status_finalizes
    (state : RunLifecycleState)
    (status : RunLifecycleStatus)
    (hProtected : isProtectedLifecycleFinalStatus status = true) :
    (applyTerminalRunStatus state status).finalized = true := by
  simp [applyTerminalRunStatus, hProtected]

theorem finalized_protected_state_preserves_nonfinal_incoming
    (existing incoming : RunLifecycleState)
    (hExistingFinal : existing.finalized = true)
    (hProtected : isProtectedLifecycleFinalStatus existing.status = true)
    (hIncomingFinal : incoming.finalized = false) :
    shouldPreserveFinalizedRunState existing incoming = true := by
  simp [
    shouldPreserveFinalizedRunState,
    hExistingFinal,
    hProtected,
    hIncomingFinal
  ]

theorem finalized_ready_to_ship_allows_shipped_transition
    (existing incoming : RunLifecycleState)
    (hExistingStatus : existing.status = RunLifecycleStatus.readyToShip)
    (hIncomingStatus : incoming.status = RunLifecycleStatus.shipped)
    (hExistingFinal : existing.finalized = true)
    (hIncomingFinal : incoming.finalized = true) :
    shouldPreserveFinalizedRunState existing incoming = false := by
  simp [
    shouldPreserveFinalizedRunState,
    hExistingStatus,
    hIncomingStatus,
    hExistingFinal,
    hIncomingFinal,
    isProtectedLifecycleFinalStatus
  ]

theorem checkpoint_response_without_packet_preserves_protected_status
    (state : RunLifecycleState)
    (hProtected : isProtectedLifecycleFinalStatus state.status = true) :
    (applyCheckpointResponseWithoutPendingPacket state).status = state.status := by
  simp [applyCheckpointResponseWithoutPendingPacket, hProtected]

theorem checkpoint_response_without_packet_blocks_unprotected_status
    (state : RunLifecycleState)
    (hProtected : isProtectedLifecycleFinalStatus state.status = false) :
    (applyCheckpointResponseWithoutPendingPacket state).status =
      RunLifecycleStatus.blocked := by
  simp [applyCheckpointResponseWithoutPendingPacket, hProtected]

structure RunCardSummary where
  status : RunLifecycleStatus
  terminal : Bool
  monitorShouldContinue : Bool
  blockerVisible : Bool
  proofDecisionReady : Bool
  shipHeld : Bool
  shippingDisabled : Bool
  shipAuthorized : Bool
  deriving Repr

def runCardSummaryFromState (state : RunLifecycleState) : RunCardSummary where
  status := state.status
  terminal := isRunLifecycleTerminal state.status
  monitorShouldContinue := !isRunLifecycleTerminal state.status
  blockerVisible := state.blockerVisible
  proofDecisionReady := state.proofDecisionReady
  shipHeld := state.shipHeld
  shippingDisabled := state.shippingDisabled
  shipAuthorized := state.shipAuthorized

def runCardProjectsState
    (state : RunLifecycleState)
    (card : RunCardSummary) : Prop :=
  card.status = state.status
    ∧ card.terminal = isRunLifecycleTerminal state.status
    ∧ card.monitorShouldContinue = !isRunLifecycleTerminal state.status
    ∧ card.shipHeld = state.shipHeld
    ∧ card.shippingDisabled = state.shippingDisabled
    ∧ card.shipAuthorized = state.shipAuthorized

def runCardPassClaim
    (state : RunLifecycleState)
    (card : RunCardSummary) : Prop :=
  runCardProjectsState state card
    ∧ card.terminal = true
    ∧ isRunLifecycleSuccessful state.status = true
    ∧ state.shipGateOk = true
    ∧ state.proofDecisionReady = true

def runCardShipClaim
    (state : RunLifecycleState)
    (card : RunCardSummary) : Prop :=
  runCardPassClaim state card
    ∧ card.shipHeld = false
    ∧ card.shipAuthorized = true

structure RunResultSummary where
  status : RunLifecycleStatus
  ok : Bool
  finalized : Bool
  shipHeld : Bool
  shippingDisabled : Bool
  shipAuthorized : Bool
  runCard : RunCardSummary
  deriving Repr

def runResultSummaryFromState (state : RunLifecycleState) : RunResultSummary where
  status := state.status
  ok := isRunLifecycleSuccessful state.status
  finalized := state.finalized
  shipHeld := state.shipHeld
  shippingDisabled := state.shippingDisabled
  shipAuthorized := state.shipAuthorized
  runCard := runCardSummaryFromState state

theorem run_card_status_projects_state_status
    (state : RunLifecycleState) :
    (runCardSummaryFromState state).status = state.status := by
  rfl

theorem run_card_terminal_projects_state_status
    (state : RunLifecycleState) :
    (runCardSummaryFromState state).terminal =
      isRunLifecycleTerminal state.status := by
  rfl

theorem run_card_projects_state
    (state : RunLifecycleState) :
    runCardProjectsState state (runCardSummaryFromState state) := by
  exact ⟨rfl, rfl, rfl, rfl, rfl, rfl⟩

theorem run_card_pass_claim_requires_ship_gate
    (state : RunLifecycleState)
    (hPass : runCardPassClaim state (runCardSummaryFromState state)) :
    state.shipGateOk = true :=
  hPass.2.2.2.1

theorem run_card_pass_claim_requires_trusted_decision
    (state : RunLifecycleState)
    (hPass : runCardPassClaim state (runCardSummaryFromState state)) :
    state.proofDecisionReady = true :=
  hPass.2.2.2.2

theorem run_card_ship_claim_requires_not_held
    (state : RunLifecycleState)
    (hShip : runCardShipClaim state (runCardSummaryFromState state)) :
    state.shipHeld = false := by
  exact hShip.2.1

theorem run_card_ship_claim_requires_ship_authorized
    (state : RunLifecycleState)
    (hShip : runCardShipClaim state (runCardSummaryFromState state)) :
    state.shipAuthorized = true := by
  exact hShip.2.2

theorem run_result_status_projects_state_status
    (state : RunLifecycleState) :
    (runResultSummaryFromState state).status = state.status := by
  rfl

theorem run_result_ok_projects_success_predicate
    (state : RunLifecycleState) :
    (runResultSummaryFromState state).ok =
      isRunLifecycleSuccessful state.status := by
  rfl

theorem run_result_run_card_projects_state
    (state : RunLifecycleState) :
    runCardProjectsState state (runResultSummaryFromState state).runCard :=
  run_card_projects_state state

def exampleRunningUngatedState : RunLifecycleState where
  status := RunLifecycleStatus.running
  finalized := false
  blockerVisible := false
  proofDecisionReady := false
  mergeRecommendationReady := false
  shipGateOk := false
  shipHeld := false
  shippingDisabled := false
  shipAuthorized := false

def independentReadyRunCard : RunCardSummary where
  status := RunLifecycleStatus.readyToShip
  terminal := true
  monitorShouldContinue := false
  blockerVisible := false
  proofDecisionReady := true
  shipHeld := false
  shippingDisabled := false
  shipAuthorized := true

def exampleCompletedFinalState : RunLifecycleState where
  status := RunLifecycleStatus.completed
  finalized := true
  blockerVisible := false
  proofDecisionReady := true
  mergeRecommendationReady := true
  shipGateOk := true
  shipHeld := false
  shippingDisabled := false
  shipAuthorized := true

def exampleReadyIncomingFinalState : RunLifecycleState where
  status := RunLifecycleStatus.readyToShip
  finalized := true
  blockerVisible := false
  proofDecisionReady := true
  mergeRecommendationReady := true
  shipGateOk := true
  shipHeld := false
  shippingDisabled := false
  shipAuthorized := true

def exampleHeldReadyNoShipState : RunLifecycleState where
  status := RunLifecycleStatus.readyToShip
  finalized := true
  blockerVisible := false
  proofDecisionReady := true
  mergeRecommendationReady := true
  shipGateOk := true
  shipHeld := true
  shippingDisabled := true
  shipAuthorized := false

#eval shouldPreserveFinalizedRunState exampleCompletedFinalState exampleReadyIncomingFinalState
#eval runCardSummaryFromState exampleRunningUngatedState
#eval independentReadyRunCard

theorem finalized_completed_blocks_ready_to_ship_overwrite :
    shouldPreserveFinalizedRunState
      exampleCompletedFinalState
      exampleReadyIncomingFinalState = true := by
  native_decide

theorem independent_run_card_can_invent_success :
    independentReadyRunCard.status = RunLifecycleStatus.readyToShip
      ∧ independentReadyRunCard.terminal = true
      ∧ exampleRunningUngatedState.status = RunLifecycleStatus.running
      ∧ exampleRunningUngatedState.shipGateOk = false := by
  native_decide

theorem projected_run_card_rejects_forged_success :
    ¬ runCardProjectsState exampleRunningUngatedState independentReadyRunCard := by
  simp [runCardProjectsState, exampleRunningUngatedState, independentReadyRunCard]

theorem held_ready_is_successful_terminal_but_not_ship_authorized :
    isRunLifecycleTerminal exampleHeldReadyNoShipState.status = true
      ∧ isRunLifecycleSuccessful exampleHeldReadyNoShipState.status = true
      ∧ (runResultSummaryFromState exampleHeldReadyNoShipState).shipHeld = true
      ∧ (runResultSummaryFromState exampleHeldReadyNoShipState).shippingDisabled = true
      ∧ (runResultSummaryFromState exampleHeldReadyNoShipState).shipAuthorized = false := by
  native_decide

theorem held_ready_run_card_is_not_ship_claim :
    ¬ runCardShipClaim
      exampleHeldReadyNoShipState
      (runCardSummaryFromState exampleHeldReadyNoShipState) := by
  simp [
    runCardShipClaim,
    runCardPassClaim,
    runCardProjectsState,
    runCardSummaryFromState,
    exampleHeldReadyNoShipState
  ]

/-!
Layer 6: published report projection.

The ship runtime publishes public surfaces: PR comments, proof artifact links,
hosted proof views, and terminal `ship_report` JSON. The semantic contract is
that a published pass report is still a projection of ship-gate facts. It must
not be a second status-only surface that can independently claim success.
-/

inductive PublicReportStatus where
  | notPublished
  | publishedPass
  | publishedBlocked
  deriving Repr, DecidableEq, BEq

structure PublicShipGateProjection where
  authoredRequirementsPreserved : Bool
  referenceValid : Bool
  requiredBaselinesPresent : Bool
  reconRequiredBaselinesPresent : Bool
  reconBaselineUnderstandingPresent : Bool
  authorProofPlanPresent : Bool
  authorCaptureScriptPresent : Bool
  implementationOk : Bool
  afterEvidencePresent : Bool
  verifyCaptured : Bool
  trustedAssessmentSourceAccepted : Bool
  proofAssessmentReady : Bool
  visualDeltaOk : Bool
  hardBlockersClear : Bool
  artifactManifestKnown : Bool
  requiredArtifactsComplete : Bool
  deriving Repr

def publicShipGateProjectionOk (projection : PublicShipGateProjection) : Bool :=
  projection.authoredRequirementsPreserved
    && projection.referenceValid
    && projection.requiredBaselinesPresent
    && projection.reconRequiredBaselinesPresent
    && projection.reconBaselineUnderstandingPresent
    && projection.authorProofPlanPresent
    && projection.authorCaptureScriptPresent
    && projection.implementationOk
    && projection.afterEvidencePresent
    && projection.verifyCaptured
    && projection.trustedAssessmentSourceAccepted
    && projection.proofAssessmentReady
    && projection.visualDeltaOk
    && projection.hardBlockersClear
    && projection.artifactManifestKnown
    && projection.requiredArtifactsComplete

def publicShipGateProjectionFromFlow (flow : WholeFlowState) : PublicShipGateProjection where
  authoredRequirementsPreserved := flow.authoredRequirementsPreserved
  referenceValid := referenceValid flow.reference
  requiredBaselinesPresent := requiredFlowBaselinesPresent flow
  reconRequiredBaselinesPresent := flow.reconRequiredBaselinesPresent
  reconBaselineUnderstandingPresent := flow.reconBaselineUnderstandingPresent
  authorProofPlanPresent := flow.authorProofPlanPresent
  authorCaptureScriptPresent := flow.authorCaptureScriptPresent
  implementationOk := flow.implementationOk
  afterEvidencePresent := flow.afterEvidencePresent
  verifyCaptured := flow.verifyStatus == VerifyStatus.evidenceCaptured
  trustedAssessmentSourceAccepted := supervisorSourceAccepted flow.proofAssessmentSource
  proofAssessmentReady := flow.proofAssessmentDecision == ProofAssessmentDecision.readyToShip
  visualDeltaOk := flow.visualDeltaOk
  hardBlockersClear := !flow.hardBlockersPresent
  artifactManifestKnown := artifactManifestKnown flow.artifactManifest
  requiredArtifactsComplete := decide (missingRequiredArtifact (wholeFlowVerdictInput flow) ≠ true)

structure PublicShipReport where
  status : PublicReportStatus
  shipGate : PublicShipGateProjection
  deriving Repr

def publicShipReportPassClaim (report : PublicShipReport) : Bool :=
  (report.status == PublicReportStatus.publishedPass)
    && publicShipGateProjectionOk report.shipGate

def publicShipReportVerdict (report : PublicShipReport) : Verdict :=
  if publicShipReportPassClaim report then
    Verdict.passed
  else
    Verdict.proofInsufficient

def publicShipReportFromFlow
    (flow : WholeFlowState)
    (status : PublicReportStatus) : PublicShipReport where
  status := status
  shipGate := publicShipGateProjectionFromFlow flow

structure StatusOnlyPublicReport where
  status : PublicReportStatus
  deriving Repr

def statusOnlyPublicReportVerdict (report : StatusOnlyPublicReport) : Verdict :=
  if report.status == PublicReportStatus.publishedPass then
    Verdict.passed
  else
    Verdict.proofInsufficient

theorem public_report_pass_implies_projected_ship_gate_ok
    (report : PublicShipReport)
    (hPassed : publicShipReportVerdict report = Verdict.passed) :
    publicShipGateProjectionOk report.shipGate = true := by
  have hPassClaim : publicShipReportPassClaim report = true := by
    cases hClaim : publicShipReportPassClaim report with
    | false =>
        simp [publicShipReportVerdict, hClaim] at hPassed
    | true =>
        rfl
  cases hStatus : report.status == PublicReportStatus.publishedPass with
  | false =>
      simp [publicShipReportPassClaim, hStatus] at hPassClaim
  | true =>
      simpa [publicShipReportPassClaim, hStatus] using hPassClaim

theorem public_ship_gate_projection_from_flow_matches_ship_gate
    (flow : WholeFlowState) :
    publicShipGateProjectionOk (publicShipGateProjectionFromFlow flow)
      = wholeFlowShipGateOk flow := by
  simp [
    publicShipGateProjectionOk,
    publicShipGateProjectionFromFlow,
    wholeFlowShipGateOk
  ]

theorem public_report_from_flow_pass_implies_ship_gate_ok
    (flow : WholeFlowState)
    (hPassed :
      publicShipReportVerdict
        (publicShipReportFromFlow flow PublicReportStatus.publishedPass)
          = Verdict.passed) :
    wholeFlowShipGateOk flow = true := by
  have hProjected :
      publicShipGateProjectionOk
        (publicShipReportFromFlow flow PublicReportStatus.publishedPass).shipGate = true :=
    public_report_pass_implies_projected_ship_gate_ok
      (publicShipReportFromFlow flow PublicReportStatus.publishedPass)
      hPassed
  simpa [
    publicShipReportFromFlow,
    public_ship_gate_projection_from_flow_matches_ship_gate
  ] using hProjected

/-!
Layer 6.1: proof-report provenance projection.

A public report that carries the right ship-gate facts can still be unsafe if
it mixes facts from different runs or proof attempts. This layer models the
Riddle-owned identity chain that a public report must expose: run, checkpoint
packet, evidence bundle, artifact manifest, and proof assessment.
-/

structure ProofProvenance where
  runId : Nat
  checkpointPacketId : Nat
  evidenceBundleId : Nat
  artifactManifestId : Nat
  proofAssessmentId : Nat
  deriving Repr, DecidableEq

structure ProvenancedPublicShipReport where
  report : PublicShipReport
  provenance : ProofProvenance
  deriving Repr

def publicShipReportWithProvenanceVerdict
    (expected : ProofProvenance)
    (report : ProvenancedPublicShipReport) : Verdict :=
  if report.provenance = expected then
    publicShipReportVerdict report.report
  else
    Verdict.proofInsufficient

def publicShipReportWithoutProvenanceVerdict
    (_expected : ProofProvenance)
    (report : ProvenancedPublicShipReport) : Verdict :=
  publicShipReportVerdict report.report

theorem public_report_with_provenance_pass_implies_provenance_matches
    (expected : ProofProvenance)
    (report : ProvenancedPublicShipReport)
    (hPassed :
      publicShipReportWithProvenanceVerdict expected report =
        Verdict.passed) :
    report.provenance = expected := by
  by_cases hProvenance : report.provenance = expected
  · exact hProvenance
  · simp [publicShipReportWithProvenanceVerdict, hProvenance] at hPassed

theorem public_report_with_provenance_pass_implies_ship_gate_ok
    (expected : ProofProvenance)
    (report : ProvenancedPublicShipReport)
    (hPassed :
      publicShipReportWithProvenanceVerdict expected report =
        Verdict.passed) :
    publicShipGateProjectionOk report.report.shipGate = true := by
  by_cases hProvenance : report.provenance = expected
  · have hReportPassed :
        publicShipReportVerdict report.report = Verdict.passed := by
      simpa [publicShipReportWithProvenanceVerdict, hProvenance] using hPassed
    exact public_report_pass_implies_projected_ship_gate_ok
      report.report
      hReportPassed
  · simp [publicShipReportWithProvenanceVerdict, hProvenance] at hPassed

def examplePassingPublicShipGateProjection : PublicShipGateProjection where
  authoredRequirementsPreserved := true
  referenceValid := true
  requiredBaselinesPresent := true
  reconRequiredBaselinesPresent := true
  reconBaselineUnderstandingPresent := true
  authorProofPlanPresent := true
  authorCaptureScriptPresent := true
  implementationOk := true
  afterEvidencePresent := true
  verifyCaptured := true
  trustedAssessmentSourceAccepted := true
  proofAssessmentReady := true
  visualDeltaOk := true
  hardBlockersClear := true
  artifactManifestKnown := true
  requiredArtifactsComplete := true

def examplePublishedPassingReport : PublicShipReport where
  status := PublicReportStatus.publishedPass
  shipGate := examplePassingPublicShipGateProjection

def exampleExpectedProofProvenance : ProofProvenance where
  runId := 1
  checkpointPacketId := 2
  evidenceBundleId := 3
  artifactManifestId := 4
  proofAssessmentId := 5

def exampleMixedEvidenceProvenance : ProofProvenance :=
  { exampleExpectedProofProvenance with evidenceBundleId := 99 }

def exampleCorrectProvenanceReport : ProvenancedPublicShipReport where
  report := examplePublishedPassingReport
  provenance := exampleExpectedProofProvenance

def exampleMixedProvenanceReport : ProvenancedPublicShipReport where
  report := examplePublishedPassingReport
  provenance := exampleMixedEvidenceProvenance

#eval publicShipReportWithProvenanceVerdict
  exampleExpectedProofProvenance
  exampleCorrectProvenanceReport
#eval publicShipReportWithoutProvenanceVerdict
  exampleExpectedProofProvenance
  exampleMixedProvenanceReport
#eval publicShipReportWithProvenanceVerdict
  exampleExpectedProofProvenance
  exampleMixedProvenanceReport

theorem matching_provenance_public_report_can_pass :
    publicShipReportWithProvenanceVerdict
      exampleExpectedProofProvenance
      exampleCorrectProvenanceReport = Verdict.passed := by
  native_decide

theorem gate_only_public_report_can_invent_mixed_provenance_pass :
    publicShipReportWithoutProvenanceVerdict
        exampleExpectedProofProvenance
        exampleMixedProvenanceReport = Verdict.passed
      ∧ publicShipReportWithProvenanceVerdict
        exampleExpectedProofProvenance
        exampleMixedProvenanceReport = Verdict.proofInsufficient := by
  native_decide

/-!
Layer 7: ship-gate implementation parity.

Riddle Proof currently has more than one implementation surface for the same
semantic gate: the TypeScript engine gate and the Python runtime ship/report
gate. The formal obligation is not that their JSON shapes are byte-identical;
it is that their semantic gate projections agree.
-/

theorem ship_gate_projection_parity_implies_ok_agreement
    (engine runtime : PublicShipGateProjection)
    (hParity : engine = runtime) :
    publicShipGateProjectionOk engine =
      publicShipGateProjectionOk runtime := by
  rw [hParity]

def runtimeProjectionWithoutReferenceOrHardBlockers
    (projection : PublicShipGateProjection) : PublicShipGateProjection :=
  { projection with
    referenceValid := true
    hardBlockersClear := true }

/-!
Layer 8: public state summary projection.

`summarizeRiddleProofPublicState` is the generic product-facing projection for
agent wrappers, PR comments, hosted proof views, and status monitors. It is not
OpenClaw-specific. The contract here is about safe public claims:

* checkpoint, failed, and blocked handoff states dominate stale success-shaped
  status fields
* held and no-ship proof states cannot become merge/sync/ship authorization
* `merge_ready` / `sync_allowed` are handoff permissions, not proof that a PR
  has already shipped
* checkpoint audit counters require disclosure instead of the claim that all
  checkpoint responses were accepted
-/

inductive PublicRunStatus where
  | running
  | awaitingCheckpoint
  | blocked
  | failed
  | productRegression
  | proofInsufficient
  | environmentBlocked
  | configurationError
  | needsHumanReview
  | readyToShip
  | shipped
  | completed
  | passed
  | unknown
  deriving Repr, DecidableEq, BEq

inductive PublicHandoffState where
  | none
  | proofCheckpointRequired
  | proofReviewRequired
  | proofBlocked
  | proofFailed
  | proofCompleteShipDisabled
  | proofComplete
  deriving Repr, DecidableEq, BEq

inductive PublicPolicyState where
  | awaitingCheckpoint
  | proofBlocked
  | proofFailed
  | proofCompleteShipDisabled
  | proofPassedShipHeld
  | shipAuthorized
  | proofPassed
  | proofInProgress
  | unknown
  deriving Repr, DecidableEq, BEq

structure PublicCheckpointProjection where
  acceptedResponseCount : Nat
  rejectedResponseCount : Nat
  ignoredResponseCount : Nat
  duplicateResponseCount : Nat
  deriving Repr, DecidableEq

structure PublicStateInput where
  status : PublicRunStatus
  ok : Option Bool
  handoffState : PublicHandoffState
  handoffProofComplete : Bool
  shipModeNone : Bool
  shippingDisabledExplicit : Option Bool
  shipAuthorizedExplicit : Option Bool
  authorizationEvidence : Bool
  shipHeldExplicit : Option Bool
  mergeReadyExplicit : Option Bool
  normalPrAllowed : Option Bool
  checkpoint : PublicCheckpointProjection
  deriving Repr

structure PublicStateSummary where
  policyState : PublicPolicyState
  proofComplete : Bool
  proofPassed : Bool
  shipHeld : Bool
  shippingDisabled : Bool
  shipAuthorized : Bool
  mergeReady : Bool
  syncAllowed : Bool
  checkpointAuditDisclosureRequired : Bool
  deriving Repr, DecidableEq

def optionBoolTrue : Option Bool → Bool
  | some true => true
  | _ => false

def optionBoolFalse : Option Bool → Bool
  | some false => true
  | _ => false

def optionBoolGetD (value : Option Bool) (fallback : Bool) : Bool :=
  match value with
  | some bool => bool
  | none => fallback

def publicStatusProofComplete : PublicRunStatus → Bool
  | PublicRunStatus.readyToShip => true
  | PublicRunStatus.shipped => true
  | PublicRunStatus.completed => true
  | PublicRunStatus.passed => true
  | _ => false

def publicShippingDisabled (input : PublicStateInput) : Bool :=
  optionBoolTrue input.shippingDisabledExplicit
    || input.shipModeNone
    || input.handoffState == PublicHandoffState.proofCompleteShipDisabled

def publicShipAuthorizedBeforeHold (input : PublicStateInput) : Bool :=
  optionBoolGetD input.shipAuthorizedExplicit input.authorizationEvidence

def publicShipHeld (input : PublicStateInput) : Bool :=
  optionBoolTrue input.shipHeldExplicit
    || (input.status == PublicRunStatus.readyToShip
      && publicShippingDisabled input
      && !publicShipAuthorizedBeforeHold input)

def publicShipAuthorized (input : PublicStateInput) : Bool :=
  if publicShipHeld input then
    false
  else
    publicShipAuthorizedBeforeHold input

def publicProofComplete (input : PublicStateInput) : Bool :=
  publicStatusProofComplete input.status
    || optionBoolTrue input.ok
    || input.handoffProofComplete

def publicBlockedOrWaiting (input : PublicStateInput) : Bool :=
  input.status == PublicRunStatus.blocked
    || input.status == PublicRunStatus.failed
    || input.status == PublicRunStatus.productRegression
    || input.status == PublicRunStatus.proofInsufficient
    || input.status == PublicRunStatus.environmentBlocked
    || input.status == PublicRunStatus.configurationError
    || input.status == PublicRunStatus.needsHumanReview
    || input.status == PublicRunStatus.awaitingCheckpoint
    || input.handoffState == PublicHandoffState.proofBlocked
    || input.handoffState == PublicHandoffState.proofReviewRequired
    || input.handoffState == PublicHandoffState.proofFailed
    || input.handoffState == PublicHandoffState.proofCheckpointRequired

def publicProofPassed (input : PublicStateInput) : Bool :=
  publicProofComplete input && !publicBlockedOrWaiting input

def publicBaseHandoffAllowed (input : PublicStateInput) : Bool :=
  !publicBlockedOrWaiting input
    && !publicShipHeld input
    && !publicShippingDisabled input

def publicMergeReady (input : PublicStateInput) : Bool :=
  publicBaseHandoffAllowed input
    && !optionBoolFalse input.normalPrAllowed
    && optionBoolGetD input.mergeReadyExplicit (publicShipAuthorized input)

def publicSyncAllowed (input : PublicStateInput) : Bool :=
  publicMergeReady input

def publicCheckpointAuditDisclosureRequired (input : PublicStateInput) : Bool :=
  decide
    (input.checkpoint.rejectedResponseCount > 0
      ∨ input.checkpoint.ignoredResponseCount > 0
      ∨ input.checkpoint.duplicateResponseCount > 0)

def publicPolicyState (input : PublicStateInput) : PublicPolicyState :=
  if input.status == PublicRunStatus.awaitingCheckpoint
      || input.handoffState == PublicHandoffState.proofCheckpointRequired then
    PublicPolicyState.awaitingCheckpoint
  else if input.status == PublicRunStatus.failed
      || input.status == PublicRunStatus.productRegression
      || input.handoffState == PublicHandoffState.proofFailed then
    PublicPolicyState.proofFailed
  else if input.status == PublicRunStatus.blocked
      || input.status == PublicRunStatus.proofInsufficient
      || input.status == PublicRunStatus.environmentBlocked
      || input.status == PublicRunStatus.configurationError
      || input.status == PublicRunStatus.needsHumanReview
      || input.handoffState == PublicHandoffState.proofBlocked
      || input.handoffState == PublicHandoffState.proofReviewRequired then
    PublicPolicyState.proofBlocked
  else if input.handoffState == PublicHandoffState.proofCompleteShipDisabled then
    PublicPolicyState.proofCompleteShipDisabled
  else if publicProofComplete input
      && publicShipHeld input
      && !publicShipAuthorized input then
    PublicPolicyState.proofPassedShipHeld
  else if publicProofComplete input
      && publicShippingDisabled input
      && !publicShipAuthorized input then
    PublicPolicyState.proofCompleteShipDisabled
  else if publicShipAuthorized input then
    PublicPolicyState.shipAuthorized
  else if publicProofPassed input then
    PublicPolicyState.proofPassed
  else if input.status == PublicRunStatus.running then
    PublicPolicyState.proofInProgress
  else
    PublicPolicyState.unknown

def publicStateSummary (input : PublicStateInput) : PublicStateSummary where
  policyState := publicPolicyState input
  proofComplete := publicProofComplete input
  proofPassed := publicProofPassed input
  shipHeld := publicShipHeld input
  shippingDisabled := publicShippingDisabled input
  shipAuthorized := publicShipAuthorized input
  mergeReady := publicMergeReady input
  syncAllowed := publicSyncAllowed input
  checkpointAuditDisclosureRequired :=
    publicCheckpointAuditDisclosureRequired input

def publicProhibitsShipAuthorizationClaim (input : PublicStateInput) : Bool :=
  !publicShipAuthorized input || publicShipHeld input || publicShippingDisabled input

def publicProhibitsMergeReadyClaim (input : PublicStateInput) : Bool :=
  !publicMergeReady input

def publicProhibitsSyncAllowedClaim (input : PublicStateInput) : Bool :=
  !publicSyncAllowed input

def publicProhibitsAllCheckpointResponsesAcceptedClaim
    (input : PublicStateInput) : Bool :=
  publicCheckpointAuditDisclosureRequired input

theorem public_sync_allowed_matches_merge_ready
    (input : PublicStateInput) :
    publicSyncAllowed input = publicMergeReady input := by
  rfl

theorem public_summary_sync_allowed_matches_merge_ready
    (input : PublicStateInput) :
    (publicStateSummary input).syncAllowed =
      (publicStateSummary input).mergeReady := by
  rfl

theorem public_held_state_is_not_ship_authorized
    (input : PublicStateInput)
    (hHeld : publicShipHeld input = true) :
    publicShipAuthorized input = false := by
  simp [publicShipAuthorized, hHeld]

theorem public_blocked_or_waiting_blocks_merge_ready
    (input : PublicStateInput)
    (hBlocked : publicBlockedOrWaiting input = true) :
    publicMergeReady input = false := by
  simp [publicMergeReady, publicBaseHandoffAllowed, hBlocked]

theorem public_blocked_or_waiting_blocks_sync
    (input : PublicStateInput)
    (hBlocked : publicBlockedOrWaiting input = true) :
    publicSyncAllowed input = false := by
  simp [
    publicSyncAllowed,
    public_blocked_or_waiting_blocks_merge_ready input hBlocked
  ]

theorem public_blocked_or_waiting_blocks_proof_passed
    (input : PublicStateInput)
    (hBlocked : publicBlockedOrWaiting input = true) :
    publicProofPassed input = false := by
  simp [publicProofPassed, hBlocked]

/-!
Layer 9: public-state consumer conformance.

Consumer surfaces are comments, hosted summaries, agent summaries, or any other
text/artifact derived from public state. They must not reintroduce claims that
the public state explicitly prohibits.
-/

structure PublicConsumerSurface where
  claimsShipAuthorized : Bool
  claimsMergeReady : Bool
  claimsSyncAllowed : Bool
  claimsProofPassed : Bool
  disclosesShipControl : Bool
  disclosesCheckpointAudit : Bool
  deriving Repr, DecidableEq

def publicConsumerSurfaceConforms
    (input : PublicStateInput)
    (surface : PublicConsumerSurface) : Bool :=
  (if publicProhibitsShipAuthorizationClaim input then
      !surface.claimsShipAuthorized
    else
      true)
    && (if publicProhibitsMergeReadyClaim input then
      !surface.claimsMergeReady
    else
      true)
    && (if publicProhibitsSyncAllowedClaim input then
      !surface.claimsSyncAllowed
    else
      true)
    && (if publicBlockedOrWaiting input then
      !surface.claimsProofPassed
    else
      true)
    && (if publicShipHeld input || publicShippingDisabled input then
      surface.disclosesShipControl
    else
      true)
    && (if publicCheckpointAuditDisclosureRequired input then
      surface.disclosesCheckpointAudit
    else
      true)

def publicConsumerSurfaceFromState
    (input : PublicStateInput) : PublicConsumerSurface where
  claimsShipAuthorized :=
    if publicProhibitsShipAuthorizationClaim input then
      false
    else
      publicShipAuthorized input
  claimsMergeReady :=
    if publicProhibitsMergeReadyClaim input then
      false
    else
      publicMergeReady input
  claimsSyncAllowed :=
    if publicProhibitsSyncAllowedClaim input then
      false
    else
      publicSyncAllowed input
  claimsProofPassed :=
    if publicBlockedOrWaiting input then
      false
    else
      publicProofPassed input
  disclosesShipControl :=
    publicShipHeld input || publicShippingDisabled input
  disclosesCheckpointAudit :=
    publicCheckpointAuditDisclosureRequired input

def publicHostedProofViewSurfaceFromState
    (input : PublicStateInput) : PublicConsumerSurface :=
  publicConsumerSurfaceFromState input

def publicAgentSummarySurfaceFromState
    (input : PublicStateInput) : PublicConsumerSurface :=
  publicConsumerSurfaceFromState input

theorem public_consumer_surface_from_state_conforms
    (input : PublicStateInput) :
    publicConsumerSurfaceConforms input
      (publicConsumerSurfaceFromState input) = true := by
  by_cases hShip : publicProhibitsShipAuthorizationClaim input <;>
  by_cases hMerge : publicProhibitsMergeReadyClaim input <;>
  by_cases hSync : publicProhibitsSyncAllowedClaim input <;>
  by_cases hBlocked : publicBlockedOrWaiting input <;>
  by_cases hShipControl : publicShipHeld input || publicShippingDisabled input <;>
  by_cases hAudit : publicCheckpointAuditDisclosureRequired input <;>
  simp [
    publicConsumerSurfaceConforms,
    publicConsumerSurfaceFromState,
    hShip,
    hMerge,
    hSync,
    hBlocked,
    hShipControl,
    hAudit
  ]

/-!
Layer 10: runner and text-evidence conformance.

Local Playwright and hosted Riddle workers are different execution substrates,
but once either runner has produced a profile evidence packet the same verdict
contract must apply. This layer also models the hosted cold-start case observed
in live testing: a job that remains unsubmitted is blocked, not passed; retry
or artifact recovery can pass only through the recovered/final evidence packet.

The text-evidence model captures a practical authoring lesson from real copy
proofs: broad page-level absence of old text is not the right proof shape for
punctuation-only or substring-preserving changes. Exact slot assertions can
prove the changed field while page-level absence may correctly fail.
-/

inductive ProfileRunnerKind where
  | localPlaywright
  | hostedRiddle
  deriving DecidableEq, Repr, BEq

def runnerContractVerdict
    (_runner : ProfileRunnerKind)
    (input : VerdictInput) : Verdict :=
  verdict input

theorem local_and_hosted_same_verdict_contract
    (input : VerdictInput) :
    runnerContractVerdict ProfileRunnerKind.localPlaywright input =
      runnerContractVerdict ProfileRunnerKind.hostedRiddle input := by
  rfl

inductive HostedProfileOutcome where
  | terminal (input : VerdictInput)
  | blockedUnsubmitted
  | recoveredFromArtifacts (input : VerdictInput)
  | retryRecovered (staleJobCount : Nat) (finalInput : VerdictInput)
  deriving Repr

def hostedProfileVerdict : HostedProfileOutcome → Verdict
  | HostedProfileOutcome.terminal input => verdict input
  | HostedProfileOutcome.blockedUnsubmitted => Verdict.environmentBlocked
  | HostedProfileOutcome.recoveredFromArtifacts input => verdict input
  | HostedProfileOutcome.retryRecovered _ finalInput => verdict finalInput

theorem blocked_unsubmitted_hosted_profile_never_passes :
    hostedProfileVerdict HostedProfileOutcome.blockedUnsubmitted ≠
      Verdict.passed := by
  simp [hostedProfileVerdict]

theorem verdict_passed_implies_evidence_present
    (input : VerdictInput)
    (hPassed : verdict input = Verdict.passed) :
    input.evidencePresent ≠ false := by
  intro hMissing
  simp [verdict, hMissing] at hPassed

theorem recovered_artifact_profile_passed_excludes_missing_required_artifact
    (input : VerdictInput)
    (hPassed :
      hostedProfileVerdict
        (HostedProfileOutcome.recoveredFromArtifacts input) = Verdict.passed) :
    missingRequiredArtifact input ≠ true :=
  verdict_satisfies_artifact_completeness_spec
    input
    (by simpa [hostedProfileVerdict] using hPassed)

theorem retry_recovery_passed_implies_final_verdict_passed
    (staleJobCount : Nat)
    (finalInput : VerdictInput)
    (hPassed :
      hostedProfileVerdict
        (HostedProfileOutcome.retryRecovered staleJobCount finalInput) =
          Verdict.passed) :
    verdict finalInput = Verdict.passed := by
  simpa [hostedProfileVerdict] using hPassed

theorem retry_recovery_passed_implies_recovered_evidence_present
    (staleJobCount : Nat)
    (finalInput : VerdictInput)
    (hPassed :
      hostedProfileVerdict
        (HostedProfileOutcome.retryRecovered staleJobCount finalInput) =
          Verdict.passed) :
    finalInput.evidencePresent ≠ false :=
  verdict_passed_implies_evidence_present
    finalInput
    (retry_recovery_passed_implies_final_verdict_passed
      staleJobCount
      finalInput
      hPassed)

theorem retry_recovery_passed_excludes_missing_required_artifact
    (staleJobCount : Nat)
    (finalInput : VerdictInput)
    (hPassed :
      hostedProfileVerdict
        (HostedProfileOutcome.retryRecovered staleJobCount finalInput) =
          Verdict.passed) :
    missingRequiredArtifact finalInput ≠ true :=
  verdict_satisfies_artifact_completeness_spec
    finalInput
    (retry_recovery_passed_implies_final_verdict_passed
      staleJobCount
      finalInput
      hPassed)

structure TextObservation where
  pageContainsOldText : Bool
  slotEqualsOldText : Bool
  slotEqualsNewText : Bool
  oldTextIsSubstringOfNewText : Bool
  deriving Repr

def broadOldTextAbsent (observation : TextObservation) : Bool :=
  !observation.pageContainsOldText

def exactSlotUpdated (observation : TextObservation) : Bool :=
  observation.slotEqualsNewText && !observation.slotEqualsOldText

theorem exact_slot_update_excludes_old_slot
    (observation : TextObservation)
    (hExact : exactSlotUpdated observation = true) :
    observation.slotEqualsOldText ≠ true := by
  cases hOld : observation.slotEqualsOldText
  · simp
  · simp [exactSlotUpdated, hOld] at hExact

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

#eval runnerContractVerdict ProfileRunnerKind.localPlaywright exampleClean
#eval runnerContractVerdict ProfileRunnerKind.hostedRiddle exampleClean

#eval hostedProfileVerdict HostedProfileOutcome.blockedUnsubmitted
#eval hostedProfileVerdict (HostedProfileOutcome.retryRecovered 2 exampleClean)
#eval hostedProfileVerdict (HostedProfileOutcome.retryRecovered 2 exampleMissingScreenshot)

theorem retry_recovery_can_pass_with_complete_final_evidence :
    hostedProfileVerdict
      (HostedProfileOutcome.retryRecovered 2 exampleClean) = Verdict.passed := by
  native_decide

theorem retry_recovery_missing_final_artifact_does_not_pass :
    hostedProfileVerdict
      (HostedProfileOutcome.retryRecovered 2 exampleMissingScreenshot) =
        Verdict.proofInsufficient := by
  native_decide

def examplePunctuationOnlyCopyObservation : TextObservation where
  pageContainsOldText := true
  slotEqualsOldText := false
  slotEqualsNewText := true
  oldTextIsSubstringOfNewText := true

#eval broadOldTextAbsent examplePunctuationOnlyCopyObservation
#eval exactSlotUpdated examplePunctuationOnlyCopyObservation

theorem exact_slot_update_can_pass_while_broad_page_absence_fails :
    exactSlotUpdated examplePunctuationOnlyCopyObservation = true
      ∧ broadOldTextAbsent examplePunctuationOnlyCopyObservation = false
      ∧ examplePunctuationOnlyCopyObservation.oldTextIsSubstringOfNewText = true := by
  native_decide

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

def exampleWholeFlowInvalidReference : WholeFlowState :=
  { exampleWholeFlowClean with reference := FlowReference.invalid }

def exampleWholeFlowHardBlocker : WholeFlowState :=
  { exampleWholeFlowClean with hardBlockersPresent := true }

def exampleStatusOnlyPublishedPass : StatusOnlyPublicReport where
  status := PublicReportStatus.publishedPass

#eval wholeFlowVerdict exampleWholeFlowClean

#eval wholeFlowVerdictWithoutShipGate exampleWholeFlowMissingReconBaseline
#eval wholeFlowVerdict exampleWholeFlowMissingReconBaseline

#eval wholeFlowVerdictWithoutShipGate exampleWholeFlowMissingVerify
#eval wholeFlowVerdict exampleWholeFlowMissingVerify

#eval wholeFlowVerdictWithoutShipGate exampleWholeFlowRunnerAssessment
#eval wholeFlowVerdict exampleWholeFlowRunnerAssessment

#eval wholeFlowVerdictWithoutShipGate exampleWholeFlowUnknownArtifactManifest
#eval wholeFlowVerdict exampleWholeFlowUnknownArtifactManifest

#eval publicShipReportVerdict
  (publicShipReportFromFlow exampleWholeFlowClean PublicReportStatus.publishedPass)
#eval publicShipReportVerdict
  (publicShipReportFromFlow exampleWholeFlowHardBlocker PublicReportStatus.publishedPass)
#eval statusOnlyPublicReportVerdict exampleStatusOnlyPublishedPass
#eval publicShipGateProjectionOk
  (runtimeProjectionWithoutReferenceOrHardBlockers
    (publicShipGateProjectionFromFlow exampleWholeFlowInvalidReference))
#eval publicShipGateProjectionOk
  (publicShipGateProjectionFromFlow exampleWholeFlowInvalidReference)

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

theorem status_only_public_report_can_invent_pass :
    statusOnlyPublicReportVerdict exampleStatusOnlyPublishedPass = Verdict.passed
      ∧ publicShipReportVerdict
        (publicShipReportFromFlow exampleWholeFlowHardBlocker PublicReportStatus.publishedPass)
          = Verdict.proofInsufficient
      ∧ wholeFlowShipGateOk exampleWholeFlowHardBlocker = false := by
  native_decide

theorem runtime_projection_without_reference_or_hard_blockers_can_disagree :
    publicShipGateProjectionOk
      (runtimeProjectionWithoutReferenceOrHardBlockers
        (publicShipGateProjectionFromFlow exampleWholeFlowInvalidReference)) = true
      ∧ publicShipGateProjectionOk
        (publicShipGateProjectionFromFlow exampleWholeFlowInvalidReference) = false
      ∧ publicShipGateProjectionOk
        (runtimeProjectionWithoutReferenceOrHardBlockers
          (publicShipGateProjectionFromFlow exampleWholeFlowHardBlocker)) = true
      ∧ publicShipGateProjectionOk
        (publicShipGateProjectionFromFlow exampleWholeFlowHardBlocker) = false := by
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

def publicNoCheckpointCounters : PublicCheckpointProjection where
  acceptedResponseCount := 0
  rejectedResponseCount := 0
  ignoredResponseCount := 0
  duplicateResponseCount := 0

def publicExampleHeldReadyNoShip : PublicStateInput where
  status := PublicRunStatus.readyToShip
  ok := some true
  handoffState := PublicHandoffState.none
  handoffProofComplete := false
  shipModeNone := true
  shippingDisabledExplicit := none
  shipAuthorizedExplicit := some false
  authorizationEvidence := false
  shipHeldExplicit := none
  mergeReadyExplicit := none
  normalPrAllowed := none
  checkpoint := publicNoCheckpointCounters

def publicExampleNoShipHandoff : PublicStateInput where
  status := PublicRunStatus.readyToShip
  ok := some true
  handoffState := PublicHandoffState.proofCompleteShipDisabled
  handoffProofComplete := true
  shipModeNone := true
  shippingDisabledExplicit := some true
  shipAuthorizedExplicit := some false
  authorizationEvidence := false
  shipHeldExplicit := none
  mergeReadyExplicit := some false
  normalPrAllowed := some false
  checkpoint := publicNoCheckpointCounters

def publicExampleHandoffReadyNotAuthorized : PublicStateInput where
  status := PublicRunStatus.readyToShip
  ok := some true
  handoffState := PublicHandoffState.proofComplete
  handoffProofComplete := true
  shipModeNone := false
  shippingDisabledExplicit := none
  shipAuthorizedExplicit := none
  authorizationEvidence := false
  shipHeldExplicit := none
  mergeReadyExplicit := some true
  normalPrAllowed := some true
  checkpoint := publicNoCheckpointCounters

def publicExampleBlockedStaleCompleted : PublicStateInput where
  status := PublicRunStatus.completed
  ok := some true
  handoffState := PublicHandoffState.proofReviewRequired
  handoffProofComplete := false
  shipModeNone := false
  shippingDisabledExplicit := none
  shipAuthorizedExplicit := none
  authorizationEvidence := false
  shipHeldExplicit := none
  mergeReadyExplicit := some true
  normalPrAllowed := some true
  checkpoint := publicNoCheckpointCounters

def publicExampleShippedAuthorized : PublicStateInput where
  status := PublicRunStatus.shipped
  ok := some true
  handoffState := PublicHandoffState.none
  handoffProofComplete := false
  shipModeNone := false
  shippingDisabledExplicit := none
  shipAuthorizedExplicit := some true
  authorizationEvidence := true
  shipHeldExplicit := none
  mergeReadyExplicit := none
  normalPrAllowed := none
  checkpoint := publicNoCheckpointCounters

def publicExampleCheckpointAudit : PublicStateInput where
  status := PublicRunStatus.readyToShip
  ok := some true
  handoffState := PublicHandoffState.proofComplete
  handoffProofComplete := true
  shipModeNone := false
  shippingDisabledExplicit := none
  shipAuthorizedExplicit := none
  authorizationEvidence := false
  shipHeldExplicit := none
  mergeReadyExplicit := some true
  normalPrAllowed := some true
  checkpoint := {
    acceptedResponseCount := 1
    rejectedResponseCount := 2
    ignoredResponseCount := 1
    duplicateResponseCount := 1
  }

def publicExampleProductRegression : PublicStateInput where
  status := PublicRunStatus.productRegression
  ok := some false
  handoffState := PublicHandoffState.none
  handoffProofComplete := false
  shipModeNone := false
  shippingDisabledExplicit := none
  shipAuthorizedExplicit := none
  authorizationEvidence := false
  shipHeldExplicit := none
  mergeReadyExplicit := some true
  normalPrAllowed := some true
  checkpoint := publicNoCheckpointCounters

def publicExampleProofInsufficient : PublicStateInput where
  status := PublicRunStatus.proofInsufficient
  ok := some false
  handoffState := PublicHandoffState.none
  handoffProofComplete := false
  shipModeNone := false
  shippingDisabledExplicit := none
  shipAuthorizedExplicit := none
  authorizationEvidence := false
  shipHeldExplicit := none
  mergeReadyExplicit := some true
  normalPrAllowed := some true
  checkpoint := publicNoCheckpointCounters

def publicExampleEnvironmentBlocked : PublicStateInput where
  status := PublicRunStatus.environmentBlocked
  ok := some false
  handoffState := PublicHandoffState.none
  handoffProofComplete := false
  shipModeNone := false
  shippingDisabledExplicit := none
  shipAuthorizedExplicit := none
  authorizationEvidence := false
  shipHeldExplicit := none
  mergeReadyExplicit := some true
  normalPrAllowed := some true
  checkpoint := publicNoCheckpointCounters

def publicExampleNeedsHumanReview : PublicStateInput where
  status := PublicRunStatus.needsHumanReview
  ok := some false
  handoffState := PublicHandoffState.none
  handoffProofComplete := false
  shipModeNone := false
  shippingDisabledExplicit := none
  shipAuthorizedExplicit := none
  authorizationEvidence := false
  shipHeldExplicit := none
  mergeReadyExplicit := some true
  normalPrAllowed := some true
  checkpoint := publicNoCheckpointCounters

#eval publicStateSummary publicExampleHeldReadyNoShip
#eval publicStateSummary publicExampleNoShipHandoff
#eval publicStateSummary publicExampleHandoffReadyNotAuthorized
#eval publicStateSummary publicExampleBlockedStaleCompleted
#eval publicStateSummary publicExampleShippedAuthorized
#eval publicStateSummary publicExampleCheckpointAudit
#eval publicStateSummary publicExampleProductRegression
#eval publicStateSummary publicExampleProofInsufficient
#eval publicStateSummary publicExampleEnvironmentBlocked
#eval publicStateSummary publicExampleNeedsHumanReview

theorem public_held_ready_no_ship_blocks_public_handoff :
    publicPolicyState publicExampleHeldReadyNoShip =
        PublicPolicyState.proofPassedShipHeld
      ∧ publicShipHeld publicExampleHeldReadyNoShip = true
      ∧ publicShippingDisabled publicExampleHeldReadyNoShip = true
      ∧ publicShipAuthorized publicExampleHeldReadyNoShip = false
      ∧ publicMergeReady publicExampleHeldReadyNoShip = false
      ∧ publicSyncAllowed publicExampleHeldReadyNoShip = false := by
  native_decide

theorem public_no_ship_handoff_blocks_public_handoff :
    publicPolicyState publicExampleNoShipHandoff =
        PublicPolicyState.proofCompleteShipDisabled
      ∧ publicShippingDisabled publicExampleNoShipHandoff = true
      ∧ publicShipAuthorized publicExampleNoShipHandoff = false
      ∧ publicMergeReady publicExampleNoShipHandoff = false
      ∧ publicSyncAllowed publicExampleNoShipHandoff = false := by
  native_decide

theorem public_handoff_ready_can_merge_without_ship_authorization :
    publicPolicyState publicExampleHandoffReadyNotAuthorized =
        PublicPolicyState.proofPassed
      ∧ publicShipAuthorized publicExampleHandoffReadyNotAuthorized = false
      ∧ publicMergeReady publicExampleHandoffReadyNotAuthorized = true
      ∧ publicSyncAllowed publicExampleHandoffReadyNotAuthorized = true
      ∧ publicProhibitsShipAuthorizationClaim
        publicExampleHandoffReadyNotAuthorized = true
      ∧ publicProhibitsMergeReadyClaim
        publicExampleHandoffReadyNotAuthorized = false := by
  native_decide

theorem public_blocked_handoff_dominates_stale_completed_status :
    publicPolicyState publicExampleBlockedStaleCompleted =
        PublicPolicyState.proofBlocked
      ∧ publicProofPassed publicExampleBlockedStaleCompleted = false
      ∧ publicMergeReady publicExampleBlockedStaleCompleted = false
      ∧ publicSyncAllowed publicExampleBlockedStaleCompleted = false := by
  native_decide

theorem public_shipped_status_authorizes_ship_and_sync :
    publicPolicyState publicExampleShippedAuthorized =
        PublicPolicyState.shipAuthorized
      ∧ publicShipAuthorized publicExampleShippedAuthorized = true
      ∧ publicMergeReady publicExampleShippedAuthorized = true
      ∧ publicSyncAllowed publicExampleShippedAuthorized = true := by
  native_decide

theorem public_checkpoint_audit_counters_require_disclosure :
    publicCheckpointAuditDisclosureRequired publicExampleCheckpointAudit = true
      ∧ publicProhibitsAllCheckpointResponsesAcceptedClaim
        publicExampleCheckpointAudit = true := by
  native_decide

theorem public_profile_regression_blocks_public_success_claims :
    publicPolicyState publicExampleProductRegression =
        PublicPolicyState.proofFailed
      ∧ publicProofPassed publicExampleProductRegression = false
      ∧ publicMergeReady publicExampleProductRegression = false
      ∧ publicSyncAllowed publicExampleProductRegression = false
      ∧ publicBlockedOrWaiting publicExampleProductRegression = true := by
  native_decide

theorem public_proof_insufficient_blocks_public_success_claims :
    publicPolicyState publicExampleProofInsufficient =
        PublicPolicyState.proofBlocked
      ∧ publicProofPassed publicExampleProofInsufficient = false
      ∧ publicMergeReady publicExampleProofInsufficient = false
      ∧ publicSyncAllowed publicExampleProofInsufficient = false
      ∧ publicBlockedOrWaiting publicExampleProofInsufficient = true := by
  native_decide

theorem public_environment_blocked_blocks_public_success_claims :
    publicPolicyState publicExampleEnvironmentBlocked =
        PublicPolicyState.proofBlocked
      ∧ publicProofPassed publicExampleEnvironmentBlocked = false
      ∧ publicMergeReady publicExampleEnvironmentBlocked = false
      ∧ publicSyncAllowed publicExampleEnvironmentBlocked = false
      ∧ publicBlockedOrWaiting publicExampleEnvironmentBlocked = true := by
  native_decide

theorem public_human_review_blocks_public_success_claims :
    publicPolicyState publicExampleNeedsHumanReview =
        PublicPolicyState.proofBlocked
      ∧ publicProofPassed publicExampleNeedsHumanReview = false
      ∧ publicMergeReady publicExampleNeedsHumanReview = false
      ∧ publicSyncAllowed publicExampleNeedsHumanReview = false
      ∧ publicBlockedOrWaiting publicExampleNeedsHumanReview = true := by
  native_decide

def publicConsumerStaleMergeRecommendation : PublicConsumerSurface where
  claimsShipAuthorized := false
  claimsMergeReady := true
  claimsSyncAllowed := true
  claimsProofPassed := true
  disclosesShipControl := true
  disclosesCheckpointAudit := false

def publicConsumerMissingCheckpointAuditDisclosure : PublicConsumerSurface where
  claimsShipAuthorized := false
  claimsMergeReady := true
  claimsSyncAllowed := true
  claimsProofPassed := true
  disclosesShipControl := false
  disclosesCheckpointAudit := false

theorem stale_merge_recommendation_consumer_violates_held_public_state :
    publicConsumerSurfaceConforms publicExampleHeldReadyNoShip
      publicConsumerStaleMergeRecommendation = false := by
  native_decide

theorem missing_checkpoint_audit_consumer_violates_public_state :
    publicConsumerSurfaceConforms publicExampleCheckpointAudit
      publicConsumerMissingCheckpointAuditDisclosure = false := by
  native_decide

theorem generated_public_consumer_surface_handles_held_no_ship :
    publicConsumerSurfaceConforms publicExampleHeldReadyNoShip
        (publicConsumerSurfaceFromState publicExampleHeldReadyNoShip) = true
      ∧ (publicConsumerSurfaceFromState
          publicExampleHeldReadyNoShip).claimsShipAuthorized = false
      ∧ (publicConsumerSurfaceFromState
          publicExampleHeldReadyNoShip).claimsMergeReady = false
      ∧ (publicConsumerSurfaceFromState
          publicExampleHeldReadyNoShip).claimsSyncAllowed = false
      ∧ (publicConsumerSurfaceFromState
          publicExampleHeldReadyNoShip).disclosesShipControl = true := by
  native_decide

theorem generated_public_consumer_surface_handles_handoff_ready :
    publicConsumerSurfaceConforms publicExampleHandoffReadyNotAuthorized
        (publicConsumerSurfaceFromState
          publicExampleHandoffReadyNotAuthorized) = true
      ∧ (publicConsumerSurfaceFromState
          publicExampleHandoffReadyNotAuthorized).claimsShipAuthorized = false
      ∧ (publicConsumerSurfaceFromState
          publicExampleHandoffReadyNotAuthorized).claimsMergeReady = true
      ∧ (publicConsumerSurfaceFromState
          publicExampleHandoffReadyNotAuthorized).claimsSyncAllowed = true := by
  native_decide

theorem generated_run_status_surface_from_public_state_conforms
    (input : PublicStateInput) :
    publicConsumerSurfaceConforms input
      (publicConsumerSurfaceFromState input) = true := by
  exact public_consumer_surface_from_state_conforms input

theorem generated_hosted_proof_view_surface_from_public_state_conforms
    (input : PublicStateInput) :
    publicConsumerSurfaceConforms input
      (publicHostedProofViewSurfaceFromState input) = true := by
  exact public_consumer_surface_from_state_conforms input

theorem generated_agent_summary_surface_from_public_state_conforms
    (input : PublicStateInput) :
    publicConsumerSurfaceConforms input
      (publicAgentSummarySurfaceFromState input) = true := by
  exact public_consumer_surface_from_state_conforms input

theorem generated_hosted_proof_view_blocks_profile_regression_claims :
    publicConsumerSurfaceConforms publicExampleProductRegression
        (publicHostedProofViewSurfaceFromState
          publicExampleProductRegression) = true
      ∧ (publicHostedProofViewSurfaceFromState
          publicExampleProductRegression).claimsProofPassed = false
      ∧ (publicHostedProofViewSurfaceFromState
          publicExampleProductRegression).claimsMergeReady = false
      ∧ (publicHostedProofViewSurfaceFromState
          publicExampleProductRegression).claimsSyncAllowed = false := by
  native_decide

theorem generated_agent_summary_blocks_proof_insufficient_claims :
    publicConsumerSurfaceConforms publicExampleProofInsufficient
        (publicAgentSummarySurfaceFromState
          publicExampleProofInsufficient) = true
      ∧ (publicAgentSummarySurfaceFromState
          publicExampleProofInsufficient).claimsProofPassed = false
      ∧ (publicAgentSummarySurfaceFromState
          publicExampleProofInsufficient).claimsMergeReady = false
      ∧ (publicAgentSummarySurfaceFromState
          publicExampleProofInsufficient).claimsSyncAllowed = false := by
  native_decide

theorem stale_run_status_surface_violates_held_public_state :
    publicConsumerSurfaceConforms publicExampleHeldReadyNoShip
      publicConsumerStaleMergeRecommendation = false := by
  native_decide

theorem stale_hosted_proof_view_surface_violates_held_public_state :
    publicConsumerSurfaceConforms publicExampleHeldReadyNoShip
      publicConsumerStaleMergeRecommendation = false := by
  native_decide

theorem stale_agent_summary_surface_violates_held_public_state :
    publicConsumerSurfaceConforms publicExampleHeldReadyNoShip
      publicConsumerStaleMergeRecommendation = false := by
  native_decide

/-!
Layer 6: ordered temporal trace semantics.

The browser supplies a finite trace and the runtime supplies one witness index
for each required event. This model does not prove that a sample describes the
physical world. It proves the framework rule that missing trace fields are
insufficient and that a passing event sequence has complete, strictly ordered
witnesses.
-/

def strictlyIncreasing : List Nat → Bool
  | [] => true
  | [_] => true
  | first :: second :: rest =>
      decide (first < second) && strictlyIncreasing (second :: rest)

structure OrderedTraceInput where
  tracePresent : Bool
  requiredFieldsPresent : Bool
  expectedEventCount : Nat
  witnessIndices : List Nat
  deriving Repr

def orderedTraceCheckStatus (input : OrderedTraceInput) : CheckStatus :=
  if input.tracePresent = false then
    CheckStatus.proofInsufficient
  else if input.requiredFieldsPresent = false then
    CheckStatus.proofInsufficient
  else if input.witnessIndices.length ≠ input.expectedEventCount then
    CheckStatus.failed
  else if strictlyIncreasing input.witnessIndices = false then
    CheckStatus.failed
  else
    CheckStatus.passed

theorem ordered_trace_missing_is_insufficient
    (input : OrderedTraceInput)
    (hMissing : input.tracePresent = false) :
    orderedTraceCheckStatus input = CheckStatus.proofInsufficient := by
  simp [orderedTraceCheckStatus, hMissing]

theorem ordered_trace_missing_fields_is_insufficient
    (input : OrderedTraceInput)
    (hTrace : input.tracePresent ≠ false)
    (hFields : input.requiredFieldsPresent = false) :
    orderedTraceCheckStatus input = CheckStatus.proofInsufficient := by
  simp [orderedTraceCheckStatus, hTrace, hFields]

theorem ordered_trace_pass_has_complete_strict_witnesses
    (input : OrderedTraceInput)
    (hPassed : orderedTraceCheckStatus input = CheckStatus.passed) :
    input.tracePresent ≠ false
      ∧ input.requiredFieldsPresent ≠ false
      ∧ input.witnessIndices.length = input.expectedEventCount
      ∧ strictlyIncreasing input.witnessIndices ≠ false := by
  by_cases hTrace : input.tracePresent = false
  · simp [orderedTraceCheckStatus, hTrace] at hPassed
  by_cases hFields : input.requiredFieldsPresent = false
  · simp [orderedTraceCheckStatus, hTrace, hFields] at hPassed
  by_cases hCount : input.witnessIndices.length = input.expectedEventCount
  · by_cases hStrict : strictlyIncreasing input.witnessIndices = false
    · simp [orderedTraceCheckStatus, hTrace, hFields, hCount, hStrict] at hPassed
    · exact ⟨hTrace, hFields, hCount, hStrict⟩
  · simp [orderedTraceCheckStatus, hTrace, hFields, hCount] at hPassed

theorem ordered_trace_same_sample_cannot_witness_two_events
    (index : Nat) :
    orderedTraceCheckStatus {
      tracePresent := true
      requiredFieldsPresent := true
      expectedEventCount := 2
      witnessIndices := [index, index]
    } = CheckStatus.failed := by
  simp [orderedTraceCheckStatus, strictlyIncreasing]

def exampleWeightShiftTrace : OrderedTraceInput where
  tracePresent := true
  requiredFieldsPresent := true
  expectedEventCount := 5
  witnessIndices := [0, 1, 2, 3, 5]

theorem example_weight_shift_trace_passes :
    orderedTraceCheckStatus exampleWeightShiftTrace = CheckStatus.passed := by
  native_decide

/-!
Layer 7: before/after change proof contracts.

This models the "two grouped contracts" shape:

* a before page-proof verdict,
* an after page-proof verdict,
* explicit delta checks comparing the two groups.

The model deliberately does not say how a browser run discovers a delta. It
only proves the collapse rule: a change proof cannot pass when either group is
blocked or insufficient, when there is no delta evidence, or when a required
delta failed.
-/

inductive DeltaStatus where
  | passed
  | failed
  | missing
  deriving DecidableEq, Repr, BEq

def checkStatusTransitionDelta
    (beforeObserved afterObserved : Option CheckStatus)
    (beforeExpected afterExpected : CheckStatus) : DeltaStatus :=
  match beforeObserved, afterObserved with
  | some beforeStatus, some afterStatus =>
      if beforeStatus = beforeExpected ∧ afterStatus = afterExpected then
        DeltaStatus.passed
      else
        DeltaStatus.failed
  | _, _ => DeltaStatus.missing

theorem failed_to_passed_check_transition_passes :
    checkStatusTransitionDelta
      (some CheckStatus.failed)
      (some CheckStatus.passed)
      CheckStatus.failed
      CheckStatus.passed = DeltaStatus.passed := by
  native_decide

theorem missing_check_transition_is_missing
    (afterObserved : Option CheckStatus)
    (beforeExpected afterExpected : CheckStatus) :
    checkStatusTransitionDelta
      none
      afterObserved
      beforeExpected
      afterExpected = DeltaStatus.missing := by
  cases afterObserved <;> rfl

inductive SourceBindingStatus where
  | notRequired
  | matched
  | missing
  | mismatched
  | stale
  deriving DecidableEq, Repr, BEq

structure ChangeProofInput where
  beforeVerdict : Verdict
  afterVerdict : Verdict
  beforeSourceBinding : SourceBindingStatus
  afterSourceBinding : SourceBindingStatus
  deltaStatuses : List DeltaStatus
  deriving Repr

def hasDeltaStatus
    (status : DeltaStatus)
    (deltas : List DeltaStatus) : Bool :=
  deltas.any (fun delta => delta == status)

def beforeGroupUsable (verdict : Verdict) : Bool :=
  verdict == Verdict.passed || verdict == Verdict.productRegression

def afterGroupUsable (verdict : Verdict) : Bool :=
  verdict == Verdict.passed

def changeBlocked (input : ChangeProofInput) : Bool :=
  input.beforeVerdict == Verdict.environmentBlocked
    || input.afterVerdict == Verdict.environmentBlocked

def changeGroupEvidenceMissing (input : ChangeProofInput) : Bool :=
  input.beforeVerdict == Verdict.proofInsufficient
    || input.afterVerdict == Verdict.proofInsufficient

def changeNeedsHumanReview (input : ChangeProofInput) : Bool :=
  input.beforeVerdict == Verdict.needsHumanReview
    || input.afterVerdict == Verdict.needsHumanReview

def changeDeltaEvidenceMissing (input : ChangeProofInput) : Bool :=
  input.deltaStatuses = []
    || hasDeltaStatus DeltaStatus.missing input.deltaStatuses

def changeDeltaFailed (input : ChangeProofInput) : Bool :=
  hasDeltaStatus DeltaStatus.failed input.deltaStatuses

def sourceBindingUsable (status : SourceBindingStatus) : Bool :=
  status == SourceBindingStatus.notRequired
    || status == SourceBindingStatus.matched

@[simp] theorem missing_source_binding_is_unusable :
    sourceBindingUsable SourceBindingStatus.missing = false := by
  native_decide

@[simp] theorem mismatched_source_binding_is_unusable :
    sourceBindingUsable SourceBindingStatus.mismatched = false := by
  native_decide

@[simp] theorem stale_source_binding_is_unusable :
    sourceBindingUsable SourceBindingStatus.stale = false := by
  native_decide

def changeSourceBindingMissing (input : ChangeProofInput) : Bool :=
  sourceBindingUsable input.beforeSourceBinding = false
    || sourceBindingUsable input.afterSourceBinding = false

def changeVerdict (input : ChangeProofInput) : Verdict :=
  if changeBlocked input = true then
    Verdict.environmentBlocked
  else if changeGroupEvidenceMissing input = true then
    Verdict.proofInsufficient
  else if changeNeedsHumanReview input = true then
    Verdict.needsHumanReview
  else if changeSourceBindingMissing input = true then
    Verdict.proofInsufficient
  else if beforeGroupUsable input.beforeVerdict = false then
    Verdict.proofInsufficient
  else if afterGroupUsable input.afterVerdict = false then
    Verdict.productRegression
  else if changeDeltaEvidenceMissing input = true then
    Verdict.proofInsufficient
  else if changeDeltaFailed input = true then
    Verdict.productRegression
  else
    Verdict.passed

theorem change_blocked_dominates
    (input : ChangeProofInput)
    (hBlocked : changeBlocked input = true) :
    changeVerdict input = Verdict.environmentBlocked := by
  simp [changeVerdict, hBlocked]

theorem change_group_evidence_missing_is_insufficient
    (input : ChangeProofInput)
    (hBlocked : changeBlocked input ≠ true)
    (hMissing : changeGroupEvidenceMissing input = true) :
    changeVerdict input = Verdict.proofInsufficient := by
  simp [changeVerdict, hBlocked, hMissing]

theorem change_delta_evidence_missing_is_insufficient
    (input : ChangeProofInput)
    (hBlocked : changeBlocked input ≠ true)
    (hGroupMissing : changeGroupEvidenceMissing input ≠ true)
    (hReview : changeNeedsHumanReview input ≠ true)
    (hBinding : changeSourceBindingMissing input ≠ true)
    (hBefore : beforeGroupUsable input.beforeVerdict ≠ false)
    (hAfter : afterGroupUsable input.afterVerdict ≠ false)
    (hDeltaMissing : changeDeltaEvidenceMissing input = true) :
    changeVerdict input = Verdict.proofInsufficient := by
  simp [
    changeVerdict,
    hBlocked,
    hGroupMissing,
    hReview,
    hBinding,
    hBefore,
    hAfter,
    hDeltaMissing
  ]

theorem change_delta_failed_is_regression
    (input : ChangeProofInput)
    (hBlocked : changeBlocked input ≠ true)
    (hGroupMissing : changeGroupEvidenceMissing input ≠ true)
    (hReview : changeNeedsHumanReview input ≠ true)
    (hBinding : changeSourceBindingMissing input ≠ true)
    (hBefore : beforeGroupUsable input.beforeVerdict ≠ false)
    (hAfter : afterGroupUsable input.afterVerdict ≠ false)
    (hDeltaMissing : changeDeltaEvidenceMissing input ≠ true)
    (hDeltaFailed : changeDeltaFailed input = true) :
    changeVerdict input = Verdict.productRegression := by
  simp [
    changeVerdict,
    hBlocked,
    hGroupMissing,
    hReview,
    hBinding,
    hBefore,
    hAfter,
    hDeltaMissing,
    hDeltaFailed
  ]

theorem change_source_binding_invalid_is_insufficient
    (input : ChangeProofInput)
    (hBlocked : changeBlocked input ≠ true)
    (hGroupMissing : changeGroupEvidenceMissing input ≠ true)
    (hReview : changeNeedsHumanReview input ≠ true)
    (hBinding : changeSourceBindingMissing input = true) :
    changeVerdict input = Verdict.proofInsufficient := by
  simp [changeVerdict, hBlocked, hGroupMissing, hReview, hBinding]

def changeExamplePasses : ChangeProofInput where
  beforeVerdict := Verdict.productRegression
  afterVerdict := Verdict.passed
  beforeSourceBinding := SourceBindingStatus.notRequired
  afterSourceBinding := SourceBindingStatus.matched
  deltaStatuses := [DeltaStatus.passed]

def changeExampleMissingBefore : ChangeProofInput where
  beforeVerdict := Verdict.proofInsufficient
  afterVerdict := Verdict.passed
  beforeSourceBinding := SourceBindingStatus.notRequired
  afterSourceBinding := SourceBindingStatus.matched
  deltaStatuses := [DeltaStatus.passed]

def changeExampleMissingDelta : ChangeProofInput where
  beforeVerdict := Verdict.productRegression
  afterVerdict := Verdict.passed
  beforeSourceBinding := SourceBindingStatus.notRequired
  afterSourceBinding := SourceBindingStatus.matched
  deltaStatuses := []

def changeExampleFailedDelta : ChangeProofInput where
  beforeVerdict := Verdict.productRegression
  afterVerdict := Verdict.passed
  beforeSourceBinding := SourceBindingStatus.notRequired
  afterSourceBinding := SourceBindingStatus.matched
  deltaStatuses := [DeltaStatus.failed]

def changeExampleMismatchedSource : ChangeProofInput where
  beforeVerdict := Verdict.productRegression
  afterVerdict := Verdict.passed
  beforeSourceBinding := SourceBindingStatus.notRequired
  afterSourceBinding := SourceBindingStatus.mismatched
  deltaStatuses := [DeltaStatus.passed]

theorem change_example_passes :
    changeVerdict changeExamplePasses = Verdict.passed := by
  native_decide

theorem change_example_missing_before_is_insufficient :
    changeVerdict changeExampleMissingBefore = Verdict.proofInsufficient := by
  native_decide

theorem change_example_missing_delta_is_insufficient :
    changeVerdict changeExampleMissingDelta = Verdict.proofInsufficient := by
  native_decide

theorem change_example_failed_delta_is_regression :
    changeVerdict changeExampleFailedDelta = Verdict.productRegression := by
  native_decide

theorem change_example_mismatched_source_is_insufficient :
    changeVerdict changeExampleMismatchedSource = Verdict.proofInsufficient := by
  native_decide

/-!
Layer 7: Preview source binding and handoff projection.

This layer models only receipt semantics. It does not claim that Git, a CDN,
or a browser told the truth; it proves how recorded evidence must collapse.
-/

structure PreviewBindingEvidence where
  required : Bool
  receiptPresent : Bool
  digestPresent : Bool
  targetMatchesReceipt : Bool
  revisionPresent : Bool
  revisionMatches : Bool
  cleanStatePresent : Bool
  sourceClean : Bool
  unexpired : Bool
  deriving Repr

def previewBindingStatus (input : PreviewBindingEvidence) : SourceBindingStatus :=
  if input.required = false then
    SourceBindingStatus.notRequired
  else if input.receiptPresent = false
      || input.digestPresent = false
      || input.revisionPresent = false
      || input.cleanStatePresent = false then
    SourceBindingStatus.missing
  else if input.targetMatchesReceipt = false
      || input.revisionMatches = false
      || input.sourceClean = false then
    SourceBindingStatus.mismatched
  else if input.unexpired = false then
    SourceBindingStatus.stale
  else
    SourceBindingStatus.matched

theorem required_preview_missing_receipt_is_unusable
    (input : PreviewBindingEvidence)
    (hRequired : input.required = true)
    (hReceipt : input.receiptPresent = false) :
    sourceBindingUsable (previewBindingStatus input) = false := by
  simp [previewBindingStatus, hRequired, hReceipt]

theorem required_preview_mismatched_revision_is_unusable
    (input : PreviewBindingEvidence)
    (hRequired : input.required = true)
    (hReceipt : input.receiptPresent = true)
    (hDigest : input.digestPresent = true)
    (hTarget : input.targetMatchesReceipt = true)
    (hRevision : input.revisionPresent = true)
    (hCleanState : input.cleanStatePresent = true)
    (hMismatch : input.revisionMatches = false) :
    sourceBindingUsable (previewBindingStatus input) = false := by
  simp [
    previewBindingStatus,
    hRequired,
    hReceipt,
    hDigest,
    hTarget,
    hRevision,
    hCleanState,
    hMismatch
  ]

theorem required_preview_wrong_target_is_unusable
    (input : PreviewBindingEvidence)
    (hRequired : input.required = true)
    (hReceipt : input.receiptPresent = true)
    (hDigest : input.digestPresent = true)
    (hRevision : input.revisionPresent = true)
    (hCleanState : input.cleanStatePresent = true)
    (hTarget : input.targetMatchesReceipt = false) :
    sourceBindingUsable (previewBindingStatus input) = false := by
  simp [
    previewBindingStatus,
    hRequired,
    hReceipt,
    hDigest,
    hRevision,
    hCleanState,
    hTarget
  ]

theorem required_preview_expired_is_unusable
    (input : PreviewBindingEvidence)
    (hRequired : input.required = true)
    (hReceipt : input.receiptPresent = true)
    (hDigest : input.digestPresent = true)
    (hTarget : input.targetMatchesReceipt = true)
    (hRevision : input.revisionPresent = true)
    (hRevisionMatches : input.revisionMatches = true)
    (hCleanState : input.cleanStatePresent = true)
    (hClean : input.sourceClean = true)
    (hExpired : input.unexpired = false) :
    sourceBindingUsable (previewBindingStatus input) = false := by
  simp [
    previewBindingStatus,
    hRequired,
    hReceipt,
    hDigest,
    hTarget,
    hRevision,
    hRevisionMatches,
    hCleanState,
    hClean,
    hExpired
  ]

inductive ChangeRecommendation where
  | mergeRecommended
  | mergeNotRecommended
  deriving DecidableEq, Repr, BEq

def recommendationForVerdict (verdict : Verdict) : ChangeRecommendation :=
  if verdict == Verdict.passed then
    ChangeRecommendation.mergeRecommended
  else
    ChangeRecommendation.mergeNotRecommended

structure HandoffReceiptModel where
  changeVerdict : Verdict
  handoffVerdict : Verdict
  recommendation : ChangeRecommendation
  canonicalPairMatchesChange : Bool
  shippingAuthorized : Bool
  deriving Repr

def handoffReceiptConforms (receipt : HandoffReceiptModel) : Bool :=
  decide (
    receipt.handoffVerdict = receipt.changeVerdict
      ∧ receipt.recommendation = recommendationForVerdict receipt.changeVerdict
      ∧ receipt.canonicalPairMatchesChange = true)

theorem conforming_handoff_preserves_change_verdict
    (receipt : HandoffReceiptModel)
    (hConforms : handoffReceiptConforms receipt = true) :
    receipt.handoffVerdict = receipt.changeVerdict := by
  exact (of_decide_eq_true hConforms).1

theorem conforming_handoff_preserves_canonical_pair
    (receipt : HandoffReceiptModel)
    (hConforms : handoffReceiptConforms receipt = true) :
    receipt.canonicalPairMatchesChange = true := by
  exact (of_decide_eq_true hConforms).2.2

def mergeRecommendedWithoutAuthorization : HandoffReceiptModel where
  changeVerdict := Verdict.passed
  handoffVerdict := Verdict.passed
  recommendation := ChangeRecommendation.mergeRecommended
  canonicalPairMatchesChange := true
  shippingAuthorized := false

theorem merge_recommendation_does_not_grant_shipping_authorization :
    handoffReceiptConforms mergeRecommendedWithoutAuthorization = true
      ∧ mergeRecommendedWithoutAuthorization.shippingAuthorized = false := by
  native_decide

/-!
Experimental semantic composition adapter.

The generic algebra lives in `RiddleProofKernel.SemanticComposition`. This
section connects it to the existing ordered-trace theorem and gives one finite
Tidepool-style example of atomic observations becoming temporal claims and then
a higher behavior claim. It is a helper/model layer: runtime conformance remains
responsible for the actual observation receipt and browser trace.
-/

namespace SemanticCompositionExample

open SemanticComposition

def completeOrderedTraceClaim (input : OrderedTraceInput) : Claim where
  label := "ordered trace has complete strict witnesses"
  holdsAt _ :=
    input.tracePresent ≠ false
      ∧ input.requiredFieldsPresent ≠ false
      ∧ input.witnessIndices.length = input.expectedEventCount
      ∧ strictlyIncreasing input.witnessIndices ≠ false

def certificateOfPassedOrderedTrace
    (scope : Scope)
    (input : OrderedTraceInput)
    (evidence : EvidenceRef)
    (hPassed : orderedTraceCheckStatus input = CheckStatus.passed) :
    Certified (completeOrderedTraceClaim input) scope :=
  Certified.fromProof
    evidence
    (ordered_trace_pass_has_complete_strict_witnesses input hPassed)

def tidepoolPreviewScope : Scope where
  repository := "riddledc/lilarcade"
  revision := "after-wavefront-crossing"
  environment := "preview"
  target := "tidepool-drift"
  proofAttempt := "wave-collision-example"

def tidepoolNextRevisionScope : Scope where
  repository := "riddledc/lilarcade"
  revision := "next-unverified-revision"
  environment := "preview"
  target := "tidepool-drift"
  proofAttempt := "wave-collision-example"

theorem tidepool_revision_scopes_differ :
    tidepoolPreviewScope ≠ tidepoolNextRevisionScope := by
  native_decide

theorem tidepool_revision_scopes_are_incompatible :
    Scope.compatible tidepoolPreviewScope tidepoolNextRevisionScope = false := by
  native_decide

def orderedTraceEvidence : EvidenceRef where
  receiptId := "observation:ordered-trace"
  artifactDigest := "sha256:ordered-trace-example"
  role := "ordered_trace"

def exampleOrderedTraceCertificate :
    Certified
      (completeOrderedTraceClaim exampleWeightShiftTrace)
      tidepoolPreviewScope :=
  certificateOfPassedOrderedTrace
    tidepoolPreviewScope
    exampleWeightShiftTrace
    orderedTraceEvidence
    example_weight_shift_trace_passes

structure TidepoolSample where
  touchRippleCount : Nat
  touchCollisionCount : Nat
  collisionSoundCount : Nat
  touchWaveCollisionTriggered : Bool
  deriving DecidableEq, Repr, BEq

def touchSample : TidepoolSample where
  touchRippleCount := 1
  touchCollisionCount := 0
  collisionSoundCount := 0
  touchWaveCollisionTriggered := false

def earlySample : TidepoolSample where
  touchRippleCount := 1
  touchCollisionCount := 0
  collisionSoundCount := 0
  touchWaveCollisionTriggered := false

def middleSample : TidepoolSample where
  touchRippleCount := 1
  touchCollisionCount := 0
  collisionSoundCount := 0
  touchWaveCollisionTriggered := false

def laterSample : TidepoolSample where
  touchRippleCount := 1
  touchCollisionCount := 1
  collisionSoundCount := 1
  touchWaveCollisionTriggered := true

def tidepoolTrace : List TidepoolSample :=
  [touchSample, earlySample, middleSample, laterSample]

def touchCreatesRipple (sample : TidepoolSample) : Prop :=
  0 < sample.touchRippleCount

def earlyHasNoCollisionOrSound (sample : TidepoolSample) : Prop :=
  0 < sample.touchRippleCount
    ∧ sample.touchCollisionCount = 0
    ∧ sample.collisionSoundCount = 0
    ∧ sample.touchWaveCollisionTriggered = false

def laterHasCollisionAndSound (sample : TidepoolSample) : Prop :=
  0 < sample.touchCollisionCount
    ∧ 0 < sample.collisionSoundCount
    ∧ sample.touchWaveCollisionTriggered = true

def rippleClaim : Claim :=
  eventAtClaim
    "touch creates ripple"
    tidepoolTrace
    touchCreatesRipple
    0

def earlyClaim : Claim :=
  eventAtClaim
    "early sample has no collision or sound"
    tidepoolTrace
    earlyHasNoCollisionOrSound
    1

def laterClaim : Claim :=
  eventAtClaim
    "later sample has collision and sound"
    tidepoolTrace
    laterHasCollisionAndSound
    3

def rippleEvidence : EvidenceRef where
  receiptId := "observation:tidepool-ripple"
  artifactDigest := "sha256:tidepool-trace-example"
  role := "ripple"

def earlyEvidence : EvidenceRef where
  receiptId := "observation:tidepool-early"
  artifactDigest := "sha256:tidepool-trace-example"
  role := "early"

def laterEvidence : EvidenceRef where
  receiptId := "observation:tidepool-later"
  artifactDigest := "sha256:tidepool-trace-example"
  role := "later"

def scopeEvidence : EvidenceRef where
  receiptId := "preview:tidepool-scope"
  artifactDigest := "sha256:tidepool-preview-example"
  role := "source_binding"

def rippleCertificate : Certified rippleClaim tidepoolPreviewScope :=
  Contract.certify
    (eventAtContract
      "touch creates ripple"
      tidepoolTrace
      touchCreatesRipple
      0)
    tidepoolPreviewScope
    tidepoolTrace
    rippleEvidence
    (by
      constructor
      · rfl
      · exact ⟨touchSample, rfl, by simp [touchCreatesRipple, touchSample]⟩)

def earlyCertificate : Certified earlyClaim tidepoolPreviewScope :=
  Contract.certify
    (eventAtContract
      "early sample has no collision or sound"
      tidepoolTrace
      earlyHasNoCollisionOrSound
      1)
    tidepoolPreviewScope
    tidepoolTrace
    earlyEvidence
    (by
      constructor
      · rfl
      · exact
          ⟨earlySample, rfl, by
            simp [earlyHasNoCollisionOrSound, earlySample]⟩)

def laterCertificate : Certified laterClaim tidepoolPreviewScope :=
  Contract.certify
    (eventAtContract
      "later sample has collision and sound"
      tidepoolTrace
      laterHasCollisionAndSound
      3)
    tidepoolPreviewScope
    tidepoolTrace
    laterEvidence
    (by
      constructor
      · rfl
      · exact
          ⟨laterSample, rfl, by
            simp [laterHasCollisionAndSound, laterSample]⟩)

def rippleBeforeEarlyClaim : Claim :=
  beforeAtClaim
    ("touch creates ripple" ++
      " before " ++
      "early sample has no collision or sound")
    tidepoolTrace
    touchCreatesRipple
    earlyHasNoCollisionOrSound
    0
    1

def earlyBeforeLaterClaim : Claim :=
  beforeAtClaim
    ("early sample has no collision or sound" ++
      " before " ++
      "later sample has collision and sound")
    tidepoolTrace
    earlyHasNoCollisionOrSound
    laterHasCollisionAndSound
    1
    3

def rippleBeforeEarlyCertificate :
    Certified rippleBeforeEarlyClaim tidepoolPreviewScope :=
  Certified.before rippleCertificate earlyCertificate (by decide)

def earlyBeforeLaterCertificate :
    Certified earlyBeforeLaterClaim tidepoolPreviewScope :=
  Certified.before earlyCertificate laterCertificate (by decide)

def orderedPhasesClaim : Claim :=
  Claim.both rippleBeforeEarlyClaim earlyBeforeLaterClaim

def orderedPhasesCertificate :
    Certified orderedPhasesClaim tidepoolPreviewScope :=
  Certified.both rippleBeforeEarlyCertificate earlyBeforeLaterCertificate

structure TidepoolScopeMatches (scope : Scope) : Prop where
  repositoryMatches : scope.repository = "riddledc/lilarcade"
  revisionMatches : scope.revision = "after-wavefront-crossing"
  environmentMatches : scope.environment = "preview"
  targetMatches : scope.target = "tidepool-drift"

def tidepoolScopeClaim : Claim where
  label := "scope matches the observed Tidepool preview"
  holdsAt := TidepoolScopeMatches

def tidepoolScopeCertificate :
    Certified tidepoolScopeClaim tidepoolPreviewScope :=
  Certified.fromProof scopeEvidence ⟨rfl, rfl, rfl, rfl⟩

structure ObservedWaveCollisionBehavior (scope : Scope) : Prop where
  scopeMatches : TidepoolScopeMatches scope
  rippleBeforeEarly :
    BeforeAt
      tidepoolTrace
      touchCreatesRipple
      earlyHasNoCollisionOrSound
      0
      1
  earlyBeforeLater :
    BeforeAt
      tidepoolTrace
      earlyHasNoCollisionOrSound
      laterHasCollisionAndSound
      1
      3

def observedWaveCollisionBehaviorClaim : Claim where
  label := "observed wave collision behavior"
  holdsAt := ObservedWaveCollisionBehavior

theorem scoped_ordered_phases_establish_observed_behavior :
    Claim.entails
      (Claim.both tidepoolScopeClaim orderedPhasesClaim)
      observedWaveCollisionBehaviorClaim := by
  intro scope evidence
  exact {
    scopeMatches := evidence.1
    rippleBeforeEarly := evidence.2.1
    earlyBeforeLater := evidence.2.2
  }

def scopedOrderedPhasesCertificate :
    Certified
      (Claim.both tidepoolScopeClaim orderedPhasesClaim)
      tidepoolPreviewScope :=
  Certified.both tidepoolScopeCertificate orderedPhasesCertificate

def tidepoolBehaviorCertificate :
    Certified observedWaveCollisionBehaviorClaim tidepoolPreviewScope :=
  Certified.map
    scoped_ordered_phases_establish_observed_behavior
    scopedOrderedPhasesCertificate

theorem tidepool_behavior_certificate_establishes_meaning :
    observedWaveCollisionBehaviorClaim.holdsAt tidepoolPreviewScope :=
  tidepoolBehaviorCertificate.holds

theorem tidepool_behavior_certificate_preserves_evidence :
    tidepoolBehaviorCertificate.evidence.toList =
      tidepoolScopeCertificate.evidence.toList ++
        orderedPhasesCertificate.evidence.toList := by
  simp [tidepoolBehaviorCertificate, scopedOrderedPhasesCertificate,
    Certified.map, Certified.both]

def laterCertificateAtNextRevision :
    Certified laterClaim tidepoolNextRevisionScope :=
  Contract.certify
    (eventAtContract
      "later sample has collision and sound"
      tidepoolTrace
      laterHasCollisionAndSound
      3)
    tidepoolNextRevisionScope
    tidepoolTrace
    laterEvidence
    (by
      constructor
      · rfl
      · exact
          ⟨laterSample, rfl, by
            simp [laterHasCollisionAndSound, laterSample]⟩)

theorem mismatched_revision_composition_is_rejected :
    Certified.combineChecked?
      rippleCertificate
      laterCertificateAtNextRevision = none := by
  exact Certified.combine_checked_mismatch_is_none
    rippleCertificate
    laterCertificateAtNextRevision
    tidepool_revision_scopes_differ

end SemanticCompositionExample

end RiddleProofKernel
