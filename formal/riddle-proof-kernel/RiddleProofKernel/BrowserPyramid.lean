import RiddleProofKernel.MeaningKernel

namespace RiddleProofKernel.BrowserPyramid

open SemanticComposition SemanticClosure MeaningKernel

/-!
A browser-specific instance of the checked-meaning kernel.

The tree is deliberately small and exact: four grounded observations become
two reusable intermediate claims and then one sealed-profile-satisfied claim. The rule
registry is constructed here rather than accepted from the run, so the three
composition rules are a pinned trust input.

This module proves only the composition boundary.  It does not prove that a
browser, Git checkout, screenshot, or signed runtime capture told the truth;
those facts remain grounding premises.
-/

def claim (canonicalParameters claimId : String) : ClaimKey where
  claimId := claimId
  claimVersion := "1"
  canonicalParameters := canonicalParameters

/-!
The runtime canonical-parameter object has exactly these six common fields:
`profile_name`, `repository`, `revision`, `environment`, `target`, and
`proof_attempt`.  Lean keeps their values structured and treats the runtime's
canonical JSON encoder as an explicit boundary function.
-/
structure CommonParameters where
  profileName : String
  repository : String
  revision : String
  environment : String
  target : String
  proofAttempt : String
  deriving DecidableEq, Repr, BEq

abbrev EncodeCommonParameters := CommonParameters → String

namespace CommonParameters

def scope (parameters : CommonParameters) : Scope where
  repository := parameters.repository
  revision := parameters.revision
  environment := parameters.environment
  target := parameters.target
  proofAttempt := parameters.proofAttempt

end CommonParameters

def captureBoundToScopeClaim (canonicalParameters : String) : ClaimKey :=
  claim canonicalParameters "riddle-proof.browser.capture-bound-to-scope"

def routeMatchedClaim (canonicalParameters : String) : ClaimKey :=
  claim canonicalParameters "riddle-proof.browser.route-matched"

def declaredProfilePassedClaim (canonicalParameters : String) : ClaimKey :=
  claim canonicalParameters "riddle-proof.browser.declared-profile-passed"

def capturedRuntimeCleanClaim (canonicalParameters : String) : ClaimKey :=
  claim canonicalParameters "riddle-proof.browser.captured-runtime-clean"

def targetConfirmedClaim (canonicalParameters : String) : ClaimKey :=
  claim canonicalParameters "riddle-proof.browser.target-confirmed"

def behaviorConfirmedClaim (canonicalParameters : String) : ClaimKey :=
  claim canonicalParameters "riddle-proof.browser.behavior-confirmed"

def sealedProfileSatisfiedClaim (canonicalParameters : String) : ClaimKey :=
  claim canonicalParameters "riddle-proof.browser.sealed-profile-satisfied"

def ruleDefinitionDigest (definition : RuleDefinition) : String :=
  "browser-rule-definition:" ++ reprStr definition

def addressed (definition : RuleDefinition) : ContentAddressedRule where
  definition := definition
  definitionDigest := ruleDefinitionDigest definition

def targetConfirmedDefinition (canonicalParameters : String) : RuleDefinition where
  engine := fixedMeaningRuleEngine
  ruleId := "riddle-proof.browser.target-confirmed"
  ruleVersion := "1"
  leftPremise := captureBoundToScopeClaim canonicalParameters
  rightPremise := routeMatchedClaim canonicalParameters
  conclusion := targetConfirmedClaim canonicalParameters
  canonicalParameters := canonicalParameters

def behaviorConfirmedDefinition (canonicalParameters : String) : RuleDefinition where
  engine := fixedMeaningRuleEngine
  ruleId := "riddle-proof.browser.behavior-confirmed"
  ruleVersion := "1"
  leftPremise := declaredProfilePassedClaim canonicalParameters
  rightPremise := capturedRuntimeCleanClaim canonicalParameters
  conclusion := behaviorConfirmedClaim canonicalParameters
  canonicalParameters := canonicalParameters

def sealedProfileSatisfiedDefinition
    (canonicalParameters : String) : RuleDefinition where
  engine := fixedMeaningRuleEngine
  ruleId := "riddle-proof.browser.sealed-profile-satisfied"
  ruleVersion := "1"
  leftPremise := targetConfirmedClaim canonicalParameters
  rightPremise := behaviorConfirmedClaim canonicalParameters
  conclusion := sealedProfileSatisfiedClaim canonicalParameters
  canonicalParameters := canonicalParameters

def targetConfirmedRule (canonicalParameters : String) : ContentAddressedRule :=
  addressed (targetConfirmedDefinition canonicalParameters)

def behaviorConfirmedRule (canonicalParameters : String) : ContentAddressedRule :=
  addressed (behaviorConfirmedDefinition canonicalParameters)

def sealedProfileSatisfiedRule
    (canonicalParameters : String) : ContentAddressedRule :=
  addressed (sealedProfileSatisfiedDefinition canonicalParameters)

def trustedRegistry (canonicalParameters : String) : FixedRuleRegistry where
  rules := [targetConfirmedRule canonicalParameters,
    behaviorConfirmedRule canonicalParameters,
    sealedProfileSatisfiedRule canonicalParameters]

theorem trusted_registry_contains_exactly_three_rules
    (canonicalParameters : String) :
    (trustedRegistry canonicalParameters).rules =
      [targetConfirmedRule canonicalParameters,
       behaviorConfirmedRule canonicalParameters,
       sealedProfileSatisfiedRule canonicalParameters] := by
  rfl

def groundedLeaf
    (scope : Scope)
    (canonicalParameters certificateId groundingId claimId : String)
    (issuedAt validThrough : Nat) : GroundedLeaf where
  certificateId := certificateId
  groundingId := groundingId
  scope := scope
  claim := claim canonicalParameters claimId
  issuedAt := issuedAt
  validThrough := validThrough

def targetConfirmedTree
    (scope : Scope)
    (canonicalParameters : String)
    (captureLeaf routeLeaf : GroundedLeaf) : MeaningTree :=
  .compose scope (targetConfirmedClaim canonicalParameters)
    (targetConfirmedRule canonicalParameters)
    (.grounded captureLeaf) (.grounded routeLeaf)

def behaviorConfirmedTree
    (scope : Scope)
    (canonicalParameters : String)
    (profileLeaf runtimeLeaf : GroundedLeaf) : MeaningTree :=
  .compose scope (behaviorConfirmedClaim canonicalParameters)
    (behaviorConfirmedRule canonicalParameters)
    (.grounded profileLeaf) (.grounded runtimeLeaf)

def browserPyramid
    (scope : Scope)
    (canonicalParameters : String)
    (captureLeaf routeLeaf profileLeaf runtimeLeaf : GroundedLeaf) : MeaningTree :=
  .compose scope (sealedProfileSatisfiedClaim canonicalParameters)
    (sealedProfileSatisfiedRule canonicalParameters)
    (targetConfirmedTree scope canonicalParameters captureLeaf routeLeaf)
    (behaviorConfirmedTree scope canonicalParameters profileLeaf runtimeLeaf)

def sealedBrowserPyramid
    (encode : EncodeCommonParameters)
    (parameters : CommonParameters)
    (captureLeaf routeLeaf profileLeaf runtimeLeaf : GroundedLeaf) :
    MeaningTree :=
  browserPyramid parameters.scope (encode parameters) captureLeaf routeLeaf
    profileLeaf runtimeLeaf

def exactLeafRequirement
    (scope : Scope)
    (expectedClaim : ClaimKey)
    (now : Nat)
    (leaf : GroundedLeaf) : Bool :=
  decide (leaf.scope = scope) &&
    (decide (leaf.claim = expectedClaim) && leaf.wellFormedAt now)

/-!
The checked root is a lossless logical checkpoint for the exact four declared
leaf obligations.  It is not a byte-compression theorem: the full tree and its
grounding references remain available for replay.
-/
theorem browser_root_checked_iff_exact_requirements
    (encode : EncodeCommonParameters)
    (parameters : CommonParameters)
    (now : Nat)
    (captureLeaf routeLeaf profileLeaf runtimeLeaf : GroundedLeaf) :
    checked ruleDefinitionDigest (trustedRegistry (encode parameters)) now
        (sealedBrowserPyramid encode parameters captureLeaf routeLeaf
          profileLeaf runtimeLeaf) = true ↔
      exactLeafRequirement parameters.scope
          (captureBoundToScopeClaim (encode parameters)) now captureLeaf = true ∧
      exactLeafRequirement parameters.scope
          (routeMatchedClaim (encode parameters)) now routeLeaf = true ∧
      exactLeafRequirement parameters.scope
          (declaredProfilePassedClaim (encode parameters)) now profileLeaf = true ∧
      exactLeafRequirement parameters.scope
          (capturedRuntimeCleanClaim (encode parameters)) now runtimeLeaf = true := by
  simp [checked, checkedAux, sealedBrowserPyramid, browserPyramid,
    targetConfirmedTree,
    behaviorConfirmedTree, MeaningTree.rootScope, MeaningTree.rootClaim,
    compositionBoundaryValid, trustedRegistry,
    FixedRuleRegistry.wellFormed, FixedRuleRegistry.identities,
    FixedRuleRegistry.accepts, FixedRuleRegistry.containsExact,
    ContentAddressedRule.valid, RuleDefinition.wellFormed,
    RuleDefinition.identity, targetConfirmedRule, behaviorConfirmedRule,
    sealedProfileSatisfiedRule, addressed, ruleDefinitionDigest,
    targetConfirmedDefinition, behaviorConfirmedDefinition,
    sealedProfileSatisfiedDefinition, exactLeafRequirement, claimKeyWellFormed,
    captureBoundToScopeClaim, routeMatchedClaim, declaredProfilePassedClaim,
    capturedRuntimeCleanClaim, targetConfirmedClaim, behaviorConfirmedClaim,
    sealedProfileSatisfiedClaim, claim]
  constructor
  · rintro ⟨⟨⟨hCaptureScope, hRouteScope, hCaptureClaim,
        hRouteClaim⟩, hCaptureWellFormed, hRouteWellFormed⟩,
      ⟨⟨hProfileScope, hRuntimeScope, hProfileClaim, hRuntimeClaim⟩,
        hProfileWellFormed, hRuntimeWellFormed⟩⟩
    exact ⟨⟨hCaptureScope, hCaptureClaim, hCaptureWellFormed⟩,
      ⟨hRouteScope, hRouteClaim, hRouteWellFormed⟩,
      ⟨hProfileScope, hProfileClaim, hProfileWellFormed⟩,
      hRuntimeScope, hRuntimeClaim, hRuntimeWellFormed⟩
  · rintro ⟨⟨hCaptureScope, hCaptureClaim, hCaptureWellFormed⟩,
      ⟨hRouteScope, hRouteClaim, hRouteWellFormed⟩,
      ⟨hProfileScope, hProfileClaim, hProfileWellFormed⟩,
      hRuntimeScope, hRuntimeClaim, hRuntimeWellFormed⟩
    exact ⟨⟨⟨hCaptureScope, hRouteScope, hCaptureClaim, hRouteClaim⟩,
        hCaptureWellFormed, hRouteWellFormed⟩,
      ⟨⟨hProfileScope, hRuntimeScope, hProfileClaim, hRuntimeClaim⟩,
        hProfileWellFormed, hRuntimeWellFormed⟩⟩

/-!
The intended semantic interpretation makes the root exactly the conjunction
of the four grounded meanings.  This is the semantic-compaction claim; it does
not infer any leaf meaning from structural checking alone.
-/
def browserMeaning
    (canonicalParameters : String)
    (captureBoundToScope routeMatched declaredProfilePassed
      capturedRuntimeClean : Prop) :
    ClaimInterpretation :=
  fun _ claimKey =>
    if claimKey = captureBoundToScopeClaim canonicalParameters then
      captureBoundToScope
    else if claimKey = routeMatchedClaim canonicalParameters then
      routeMatched
    else if claimKey = declaredProfilePassedClaim canonicalParameters then
      declaredProfilePassed
    else if claimKey = capturedRuntimeCleanClaim canonicalParameters then
      capturedRuntimeClean
    else if claimKey = targetConfirmedClaim canonicalParameters then
      captureBoundToScope ∧ routeMatched
    else if claimKey = behaviorConfirmedClaim canonicalParameters then
      declaredProfilePassed ∧ capturedRuntimeClean
    else if claimKey = sealedProfileSatisfiedClaim canonicalParameters then
      (captureBoundToScope ∧ routeMatched) ∧
        (declaredProfilePassed ∧ capturedRuntimeClean)
    else False

theorem sealed_profile_satisfied_meaning_iff_exact_leaf_meanings
    (scope : Scope)
    (canonicalParameters : String)
    (captureBoundToScope routeMatched declaredProfilePassed
      capturedRuntimeClean : Prop) :
    browserMeaning canonicalParameters captureBoundToScope routeMatched
        declaredProfilePassed capturedRuntimeClean scope
        (sealedProfileSatisfiedClaim canonicalParameters) ↔
      (captureBoundToScope ∧ routeMatched) ∧
        (declaredProfilePassed ∧ capturedRuntimeClean) := by
  simp [browserMeaning, sealedProfileSatisfiedClaim, targetConfirmedClaim,
    behaviorConfirmedClaim, captureBoundToScopeClaim, routeMatchedClaim,
    declaredProfilePassedClaim, capturedRuntimeCleanClaim, claim]

theorem target_confirmed_rule_is_sound
    (canonicalParameters : String)
    (captureBoundToScope routeMatched declaredProfilePassed
      capturedRuntimeClean : Prop) :
    RuleSound
      (browserMeaning canonicalParameters captureBoundToScope routeMatched
        declaredProfilePassed capturedRuntimeClean)
      (targetConfirmedDefinition canonicalParameters) := by
  intro ruleScope hCapture hRoute
  simpa [browserMeaning, targetConfirmedDefinition, captureBoundToScopeClaim,
    routeMatchedClaim, declaredProfilePassedClaim, capturedRuntimeCleanClaim,
    targetConfirmedClaim, behaviorConfirmedClaim,
    sealedProfileSatisfiedClaim, claim]
    using And.intro hCapture hRoute

theorem behavior_confirmed_rule_is_sound
    (canonicalParameters : String)
    (captureBoundToScope routeMatched declaredProfilePassed
      capturedRuntimeClean : Prop) :
    RuleSound
      (browserMeaning canonicalParameters captureBoundToScope routeMatched
        declaredProfilePassed capturedRuntimeClean)
      (behaviorConfirmedDefinition canonicalParameters) := by
  intro ruleScope hProfile hRuntime
  simpa [browserMeaning, behaviorConfirmedDefinition, captureBoundToScopeClaim,
    routeMatchedClaim, declaredProfilePassedClaim, capturedRuntimeCleanClaim,
    targetConfirmedClaim, behaviorConfirmedClaim,
    sealedProfileSatisfiedClaim, claim]
    using And.intro hProfile hRuntime

theorem sealed_profile_satisfied_rule_is_sound
    (canonicalParameters : String)
    (captureBoundToScope routeMatched declaredProfilePassed
      capturedRuntimeClean : Prop) :
    RuleSound
      (browserMeaning canonicalParameters captureBoundToScope routeMatched
        declaredProfilePassed capturedRuntimeClean)
      (sealedProfileSatisfiedDefinition canonicalParameters) := by
  intro ruleScope hTarget hBehavior
  simpa [browserMeaning, sealedProfileSatisfiedDefinition,
    captureBoundToScopeClaim, routeMatchedClaim, declaredProfilePassedClaim,
    capturedRuntimeCleanClaim, targetConfirmedClaim, behaviorConfirmedClaim,
    sealedProfileSatisfiedClaim, claim]
    using And.intro hTarget hBehavior

theorem trusted_registry_is_sound
    (canonicalParameters : String)
    (captureBoundToScope routeMatched declaredProfilePassed
      capturedRuntimeClean : Prop) :
    RegistrySound
      (browserMeaning canonicalParameters captureBoundToScope routeMatched
        declaredProfilePassed capturedRuntimeClean)
      (trustedRegistry canonicalParameters) := by
  intro rule hRule
  simp [trustedRegistry] at hRule
  rcases hRule with rfl | rfl | rfl
  · exact target_confirmed_rule_is_sound canonicalParameters
      captureBoundToScope routeMatched declaredProfilePassed
      capturedRuntimeClean
  · exact behavior_confirmed_rule_is_sound canonicalParameters
      captureBoundToScope routeMatched declaredProfilePassed
      capturedRuntimeClean
  · exact sealed_profile_satisfied_rule_is_sound canonicalParameters
      captureBoundToScope routeMatched declaredProfilePassed
      capturedRuntimeClean

/-!
Structural checking plus the four grounded meanings and the pinned rule
semantics establishes the root meaning.  The grounding facts are explicit
premises, so this theorem cannot turn a structurally valid packet into a claim
about the outside world by itself.
-/
theorem checked_browser_pyramid_with_grounded_meanings_establishes_root
    (scope : Scope)
    (canonicalParameters : String)
    (now : Nat)
    (captureLeaf routeLeaf profileLeaf runtimeLeaf : GroundedLeaf)
    (captureBoundToScope routeMatched declaredProfilePassed
      capturedRuntimeClean : Prop)
    (hChecked :
      checked ruleDefinitionDigest (trustedRegistry canonicalParameters) now
        (browserPyramid scope canonicalParameters captureLeaf routeLeaf
          profileLeaf runtimeLeaf) = true)
    (hLeaves : GroundedLeafMeaningsHold
      (browserMeaning canonicalParameters captureBoundToScope routeMatched
        declaredProfilePassed capturedRuntimeClean)
      (browserPyramid scope canonicalParameters captureLeaf routeLeaf
        profileLeaf runtimeLeaf)) :
    browserMeaning canonicalParameters captureBoundToScope routeMatched
      declaredProfilePassed capturedRuntimeClean scope
      (sealedProfileSatisfiedClaim canonicalParameters) := by
  have hRoot := checked_tree_with_sound_registry_establishes_root_meaning
    ruleDefinitionDigest (trustedRegistry canonicalParameters) now
    (browserMeaning canonicalParameters captureBoundToScope routeMatched
      declaredProfilePassed capturedRuntimeClean)
    (browserPyramid scope canonicalParameters captureLeaf routeLeaf profileLeaf
      runtimeLeaf)
    hChecked hLeaves
    (trusted_registry_is_sound canonicalParameters captureBoundToScope
      routeMatched declaredProfilePassed capturedRuntimeClean)
  simpa [browserPyramid, MeaningTree.rootScope, MeaningTree.rootClaim] using hRoot

namespace Hostile

def fixtureCommonParameters : CommonParameters where
  profileName := "browser-pyramid-fixture"
  repository := "riddledc/browser-fixture"
  revision := "revision-a"
  environment := "playwright"
  target := "https://example.invalid/fixture"
  proofAttempt := "browser-pyramid-fixture"

def fixtureEncode : EncodeCommonParameters := fun parameters =>
  reprStr parameters

def fixtureScope : Scope := fixtureCommonParameters.scope

def fixtureParameters : String :=
  fixtureEncode fixtureCommonParameters

def leaf (certificateId groundingId : String) (claimKey : ClaimKey) : GroundedLeaf where
  certificateId := certificateId
  groundingId := groundingId
  scope := fixtureScope
  claim := claimKey
  issuedAt := 40
  validThrough := 60

def captureLeaf : GroundedLeaf :=
  leaf "cert-capture" "ground-capture"
    (captureBoundToScopeClaim fixtureParameters)

def routeLeaf : GroundedLeaf :=
  leaf "cert-route" "ground-route" (routeMatchedClaim fixtureParameters)

def profileLeaf : GroundedLeaf :=
  leaf "cert-profile" "ground-profile"
    (declaredProfilePassedClaim fixtureParameters)

def runtimeLeaf : GroundedLeaf :=
  leaf "cert-runtime" "ground-runtime"
    (capturedRuntimeCleanClaim fixtureParameters)

def positiveTree : MeaningTree :=
  sealedBrowserPyramid fixtureEncode fixtureCommonParameters captureLeaf
    routeLeaf profileLeaf runtimeLeaf

theorem positive_browser_pyramid_is_checked :
    checked ruleDefinitionDigest (trustedRegistry fixtureParameters) 50
      positiveTree = true := by
  native_decide

/-! Reusing the route leaf in the capture slot cannot hide the missing leaf. -/
def missingCaptureLeafTree : MeaningTree :=
  browserPyramid fixtureScope fixtureParameters routeLeaf routeLeaf profileLeaf
    runtimeLeaf

theorem missing_required_capture_leaf_is_rejected :
    disposition ruleDefinitionDigest (trustedRegistry fixtureParameters) 50
      missingCaptureLeafTree = .unresolved := by
  native_decide

def substitutedRevisionScope : Scope :=
  { fixtureScope with revision := "revision-b" }

def substitutedRevisionCaptureLeaf : GroundedLeaf :=
  { captureLeaf with scope := substitutedRevisionScope }

def substitutedRevisionTree : MeaningTree :=
  browserPyramid fixtureScope fixtureParameters substitutedRevisionCaptureLeaf
    routeLeaf profileLeaf runtimeLeaf

theorem substituted_revision_scope_is_rejected :
    disposition ruleDefinitionDigest (trustedRegistry fixtureParameters) 50
      substitutedRevisionTree = .unresolved := by
  native_decide

def substitutedParameters : String :=
  fixtureEncode { fixtureCommonParameters with
    profileName := "different-profile" }

def substitutedParameterLeaf : GroundedLeaf :=
  { captureLeaf with claim := captureBoundToScopeClaim substitutedParameters }

def substitutedParameterTree : MeaningTree :=
  browserPyramid fixtureScope fixtureParameters substitutedParameterLeaf
    routeLeaf profileLeaf runtimeLeaf

theorem substituted_claim_parameters_are_rejected :
    disposition ruleDefinitionDigest (trustedRegistry fixtureParameters) 50
      substitutedParameterTree = .unresolved := by
  native_decide

end Hostile

end RiddleProofKernel.BrowserPyramid
