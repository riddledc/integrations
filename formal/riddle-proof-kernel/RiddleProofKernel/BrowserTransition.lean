import RiddleProofKernel.BrowserPyramid

namespace RiddleProofKernel.BrowserTransition

open SemanticComposition SemanticClosure MeaningKernel

/-!
The exact four-way browser-transition composition used by the runtime:

* `B + A -> T`: a before checkpoint and action/immediate-after checkpoint
  establish that the declared transition was observed;
* `T + R -> PR`: the same transition plus an independent reload checkpoint
  establish that it survived reload;
* `T + F -> PF`: the same transition plus an independent fresh-context
  checkpoint establish that it was visible in a fresh browser context;
* `PR + PF -> D`: the two branches establish the durable-transition root.

This Lean module starts *after* each `sealed-profile-satisfied` checkpoint
meaning has been supplied.  It proves the abstract composition algebra and the
meaning retained by the root.  It does not prove that Playwright observed the
outside world truthfully; that exact profile bytes and captured evidence were
deterministically reassessed; that consumer-supplied policy, signer, verifier,
and contract authority was used; or that artifact hashes and signatures are
correct.  It also does not prove the runtime requirements that the transition
ID equals the scope proof attempt, profile digests and signed bundle IDs are
distinct, or signed capture times satisfy `before <= action <= reload` and
`action <= freshContext`.

The runtime's canonical JSON, full TypeScript rule materializations, and their
correspondence to these smaller Lean definitions are separate conformance
obligations.  Distinct bundles do not imply independent signers, sensors, or
runners.  All of these facts remain runtime and trust-boundary obligations.

`MeaningTree` is an inductive tree, whereas the runtime serializes a
content-addressed DAG.  The definition below binds `T` once and feeds that same
value to both branches; unfolding the tree duplicates its representation but
not its rule, claim, parameters, or semantic meaning.
-/

/-!
These strings are the runtime's canonical JSON encodings at each boundary.
Keeping them distinct exposes canonicalization as an explicit runtime/Lean
boundary instead of pretending Lean computes the TypeScript encoding.
-/
structure CanonicalParameters where
  beforeProfile : String
  actionProfile : String
  reloadProfile : String
  freshContextProfile : String
  transitionObserved : String
  transitionSurvivedReload : String
  transitionVisibleInFreshContext : String
  durableStateTransitionObserved : String
  deriving DecidableEq, Repr, BEq

def transitionObservedClaim (canonicalParameters : String) : ClaimKey :=
  BrowserPyramid.claim canonicalParameters
    "riddle-proof.browser.transition-observed"

def transitionSurvivedReloadClaim
    (canonicalParameters : String) : ClaimKey :=
  BrowserPyramid.claim canonicalParameters
    "riddle-proof.browser.transition-survived-reload"

def transitionVisibleInFreshContextClaim
    (canonicalParameters : String) : ClaimKey :=
  BrowserPyramid.claim canonicalParameters
    "riddle-proof.browser.transition-visible-in-fresh-context"

def durableStateTransitionObservedClaim
    (canonicalParameters : String) : ClaimKey :=
  BrowserPyramid.claim canonicalParameters
    "riddle-proof.browser.durable-state-transition-observed"

def transitionObservedDefinition
    (parameters : CanonicalParameters) : RuleDefinition where
  engine := fixedMeaningRuleEngine
  ruleId := "riddle-proof.browser.transition-observed"
  ruleVersion := "1"
  leftPremise := BrowserPyramid.sealedProfileSatisfiedClaim
    parameters.beforeProfile
  rightPremise := BrowserPyramid.sealedProfileSatisfiedClaim
    parameters.actionProfile
  conclusion := transitionObservedClaim parameters.transitionObserved
  canonicalParameters := parameters.transitionObserved

def transitionSurvivedReloadDefinition
    (parameters : CanonicalParameters) : RuleDefinition where
  engine := fixedMeaningRuleEngine
  ruleId := "riddle-proof.browser.transition-survived-reload"
  ruleVersion := "1"
  leftPremise := transitionObservedClaim parameters.transitionObserved
  rightPremise := BrowserPyramid.sealedProfileSatisfiedClaim
    parameters.reloadProfile
  conclusion := transitionSurvivedReloadClaim
    parameters.transitionSurvivedReload
  canonicalParameters := parameters.transitionSurvivedReload

def transitionVisibleInFreshContextDefinition
    (parameters : CanonicalParameters) : RuleDefinition where
  engine := fixedMeaningRuleEngine
  ruleId := "riddle-proof.browser.transition-visible-in-fresh-context"
  ruleVersion := "1"
  leftPremise := transitionObservedClaim parameters.transitionObserved
  rightPremise := BrowserPyramid.sealedProfileSatisfiedClaim
    parameters.freshContextProfile
  conclusion := transitionVisibleInFreshContextClaim
    parameters.transitionVisibleInFreshContext
  canonicalParameters := parameters.transitionVisibleInFreshContext

def durableStateTransitionObservedDefinition
    (parameters : CanonicalParameters) : RuleDefinition where
  engine := fixedMeaningRuleEngine
  ruleId := "riddle-proof.browser.durable-state-transition-observed"
  ruleVersion := "1"
  leftPremise := transitionSurvivedReloadClaim
    parameters.transitionSurvivedReload
  rightPremise := transitionVisibleInFreshContextClaim
    parameters.transitionVisibleInFreshContext
  conclusion := durableStateTransitionObservedClaim
    parameters.durableStateTransitionObserved
  canonicalParameters := parameters.durableStateTransitionObserved

def transitionObservedRule
    (parameters : CanonicalParameters) : ContentAddressedRule :=
  BrowserPyramid.addressed (transitionObservedDefinition parameters)

def transitionSurvivedReloadRule
    (parameters : CanonicalParameters) : ContentAddressedRule :=
  BrowserPyramid.addressed (transitionSurvivedReloadDefinition parameters)

def transitionVisibleInFreshContextRule
    (parameters : CanonicalParameters) : ContentAddressedRule :=
  BrowserPyramid.addressed
    (transitionVisibleInFreshContextDefinition parameters)

def durableStateTransitionObservedRule
    (parameters : CanonicalParameters) : ContentAddressedRule :=
  BrowserPyramid.addressed
    (durableStateTransitionObservedDefinition parameters)

def trustedRegistry (parameters : CanonicalParameters) : FixedRuleRegistry where
  rules := [transitionObservedRule parameters,
    transitionSurvivedReloadRule parameters,
    transitionVisibleInFreshContextRule parameters,
    durableStateTransitionObservedRule parameters]

theorem trusted_registry_contains_exactly_four_transition_rules
    (parameters : CanonicalParameters) :
    (trustedRegistry parameters).rules =
      [transitionObservedRule parameters,
       transitionSurvivedReloadRule parameters,
       transitionVisibleInFreshContextRule parameters,
       durableStateTransitionObservedRule parameters] := by
  rfl

def transitionObservedTree
    (scope : Scope)
    (parameters : CanonicalParameters)
    (beforeLeaf actionLeaf : GroundedLeaf) : MeaningTree :=
  .compose scope (transitionObservedClaim parameters.transitionObserved)
    (transitionObservedRule parameters)
    (.grounded beforeLeaf) (.grounded actionLeaf)

def transitionSurvivedReloadTree
    (scope : Scope)
    (parameters : CanonicalParameters)
    (transitionTree : MeaningTree)
    (reloadLeaf : GroundedLeaf) : MeaningTree :=
  .compose scope
    (transitionSurvivedReloadClaim parameters.transitionSurvivedReload)
    (transitionSurvivedReloadRule parameters)
    transitionTree (.grounded reloadLeaf)

def transitionVisibleInFreshContextTree
    (scope : Scope)
    (parameters : CanonicalParameters)
    (transitionTree : MeaningTree)
    (freshContextLeaf : GroundedLeaf) : MeaningTree :=
  .compose scope
    (transitionVisibleInFreshContextClaim
      parameters.transitionVisibleInFreshContext)
    (transitionVisibleInFreshContextRule parameters)
    transitionTree (.grounded freshContextLeaf)

def browserTransitionTree
    (scope : Scope)
    (parameters : CanonicalParameters)
    (beforeLeaf actionLeaf reloadLeaf freshContextLeaf : GroundedLeaf) :
    MeaningTree :=
  let transition := transitionObservedTree scope parameters beforeLeaf actionLeaf
  .compose scope
    (durableStateTransitionObservedClaim
      parameters.durableStateTransitionObserved)
    (durableStateTransitionObservedRule parameters)
    (transitionSurvivedReloadTree scope parameters transition reloadLeaf)
    (transitionVisibleInFreshContextTree scope parameters transition
      freshContextLeaf)

/-!
The four definitions below are the semantic fan-out.  In particular, both
branches reuse `transitionObservedMeaning`; neither is permitted to silently
redefine what `T` means.
-/
def transitionObservedMeaning
    (checkpointMeaning : ClaimKey → Prop)
    (parameters : CanonicalParameters) : Prop :=
  checkpointMeaning
      (BrowserPyramid.sealedProfileSatisfiedClaim parameters.beforeProfile) ∧
    checkpointMeaning
      (BrowserPyramid.sealedProfileSatisfiedClaim parameters.actionProfile)

def transitionSurvivedReloadMeaning
    (checkpointMeaning : ClaimKey → Prop)
    (parameters : CanonicalParameters) : Prop :=
  transitionObservedMeaning checkpointMeaning parameters ∧
    checkpointMeaning
      (BrowserPyramid.sealedProfileSatisfiedClaim parameters.reloadProfile)

def transitionVisibleInFreshContextMeaning
    (checkpointMeaning : ClaimKey → Prop)
    (parameters : CanonicalParameters) : Prop :=
  transitionObservedMeaning checkpointMeaning parameters ∧
    checkpointMeaning
      (BrowserPyramid.sealedProfileSatisfiedClaim
        parameters.freshContextProfile)

def durableStateTransitionObservedMeaning
    (checkpointMeaning : ClaimKey → Prop)
    (parameters : CanonicalParameters) : Prop :=
  transitionSurvivedReloadMeaning checkpointMeaning parameters ∧
    transitionVisibleInFreshContextMeaning checkpointMeaning parameters

/-!
Unknown claims retain the interpretation supplied at the sealed-checkpoint
boundary.  Only the four exact transition claim IDs acquire new meanings here.
-/
def browserTransitionMeaning
    (checkpointMeaning : ClaimKey → Prop)
    (parameters : CanonicalParameters) : ClaimInterpretation :=
  fun _ claimKey =>
    if claimKey = durableStateTransitionObservedClaim
        parameters.durableStateTransitionObserved then
      durableStateTransitionObservedMeaning checkpointMeaning parameters
    else if claimKey = transitionSurvivedReloadClaim
        parameters.transitionSurvivedReload then
      transitionSurvivedReloadMeaning checkpointMeaning parameters
    else if claimKey = transitionVisibleInFreshContextClaim
        parameters.transitionVisibleInFreshContext then
      transitionVisibleInFreshContextMeaning checkpointMeaning parameters
    else if claimKey = transitionObservedClaim
        parameters.transitionObserved then
      transitionObservedMeaning checkpointMeaning parameters
    else checkpointMeaning claimKey

/-!
This is the semantic-compaction result.  The durable root means exactly the
four sealed checkpoint meanings; the duplicated use of `T` adds no hidden
fifth premise and drops none of the four.
-/
theorem durable_root_meaning_iff_four_checkpoint_meanings
    (scope : Scope)
    (checkpointMeaning : ClaimKey → Prop)
    (parameters : CanonicalParameters) :
    browserTransitionMeaning checkpointMeaning parameters scope
        (durableStateTransitionObservedClaim
          parameters.durableStateTransitionObserved) ↔
      checkpointMeaning
          (BrowserPyramid.sealedProfileSatisfiedClaim
            parameters.beforeProfile) ∧
      checkpointMeaning
          (BrowserPyramid.sealedProfileSatisfiedClaim
            parameters.actionProfile) ∧
      checkpointMeaning
          (BrowserPyramid.sealedProfileSatisfiedClaim
            parameters.reloadProfile) ∧
      checkpointMeaning
          (BrowserPyramid.sealedProfileSatisfiedClaim
            parameters.freshContextProfile) := by
  simp only [browserTransitionMeaning, if_pos,
    durableStateTransitionObservedMeaning,
    transitionSurvivedReloadMeaning,
    transitionVisibleInFreshContextMeaning,
    transitionObservedMeaning]
  constructor
  · rintro ⟨⟨⟨hBefore, hAction⟩, hReload⟩,
      ⟨_, hFreshContext⟩⟩
    exact ⟨hBefore, hAction, hReload, hFreshContext⟩
  · rintro ⟨hBefore, hAction, hReload, hFreshContext⟩
    exact ⟨⟨⟨hBefore, hAction⟩, hReload⟩,
      ⟨⟨hBefore, hAction⟩, hFreshContext⟩⟩

theorem transition_observed_rule_is_sound
    (checkpointMeaning : ClaimKey → Prop)
    (parameters : CanonicalParameters) :
    RuleSound (browserTransitionMeaning checkpointMeaning parameters)
      (transitionObservedDefinition parameters) := by
  intro ruleScope hBefore hAction
  simpa [browserTransitionMeaning, transitionObservedMeaning,
    transitionObservedDefinition, transitionSurvivedReloadClaim,
    transitionVisibleInFreshContextClaim,
    durableStateTransitionObservedClaim, transitionObservedClaim,
    BrowserPyramid.sealedProfileSatisfiedClaim, BrowserPyramid.claim]
    using And.intro hBefore hAction

theorem transition_survived_reload_rule_is_sound
    (checkpointMeaning : ClaimKey → Prop)
    (parameters : CanonicalParameters) :
    RuleSound (browserTransitionMeaning checkpointMeaning parameters)
      (transitionSurvivedReloadDefinition parameters) := by
  intro ruleScope hTransition hReload
  simpa [browserTransitionMeaning, transitionSurvivedReloadMeaning,
    transitionObservedMeaning, transitionSurvivedReloadDefinition,
    transitionSurvivedReloadClaim, transitionVisibleInFreshContextClaim,
    durableStateTransitionObservedClaim, transitionObservedClaim,
    BrowserPyramid.sealedProfileSatisfiedClaim, BrowserPyramid.claim]
    using And.intro hTransition hReload

theorem transition_visible_in_fresh_context_rule_is_sound
    (checkpointMeaning : ClaimKey → Prop)
    (parameters : CanonicalParameters) :
    RuleSound (browserTransitionMeaning checkpointMeaning parameters)
      (transitionVisibleInFreshContextDefinition parameters) := by
  intro ruleScope hTransition hFreshContext
  simpa [browserTransitionMeaning, transitionVisibleInFreshContextMeaning,
    transitionObservedMeaning, transitionVisibleInFreshContextDefinition,
    transitionSurvivedReloadClaim, transitionVisibleInFreshContextClaim,
    durableStateTransitionObservedClaim, transitionObservedClaim,
    BrowserPyramid.sealedProfileSatisfiedClaim, BrowserPyramid.claim]
    using And.intro hTransition hFreshContext

theorem durable_state_transition_observed_rule_is_sound
    (checkpointMeaning : ClaimKey → Prop)
    (parameters : CanonicalParameters) :
    RuleSound (browserTransitionMeaning checkpointMeaning parameters)
      (durableStateTransitionObservedDefinition parameters) := by
  intro ruleScope hReloadBranch hFreshContextBranch
  simpa [browserTransitionMeaning, durableStateTransitionObservedMeaning,
    durableStateTransitionObservedDefinition, transitionSurvivedReloadClaim,
    transitionVisibleInFreshContextClaim, durableStateTransitionObservedClaim,
    transitionObservedClaim, BrowserPyramid.claim]
    using And.intro hReloadBranch hFreshContextBranch

theorem trusted_registry_is_sound
    (checkpointMeaning : ClaimKey → Prop)
    (parameters : CanonicalParameters) :
    RegistrySound (browserTransitionMeaning checkpointMeaning parameters)
      (trustedRegistry parameters) := by
  intro rule hRule
  simp [trustedRegistry] at hRule
  rcases hRule with rfl | rfl | rfl | rfl
  · exact transition_observed_rule_is_sound checkpointMeaning parameters
  · exact transition_survived_reload_rule_is_sound checkpointMeaning parameters
  · exact transition_visible_in_fresh_context_rule_is_sound
      checkpointMeaning parameters
  · exact durable_state_transition_observed_rule_is_sound
      checkpointMeaning parameters

/-!
Structural checking plus explicit meanings for every reachable sealed
checkpoint establishes the durable root.  The theorem cannot manufacture any
checkpoint meaning from a structurally valid packet alone.
-/
theorem checked_transition_with_checkpoint_meanings_establishes_durable_root
    (scope : Scope)
    (parameters : CanonicalParameters)
    (now : Nat)
    (beforeLeaf actionLeaf reloadLeaf freshContextLeaf : GroundedLeaf)
    (checkpointMeaning : ClaimKey → Prop)
    (hChecked :
      checked BrowserPyramid.ruleDefinitionDigest (trustedRegistry parameters)
        now (browserTransitionTree scope parameters beforeLeaf actionLeaf
          reloadLeaf freshContextLeaf) = true)
    (hLeaves : GroundedLeafMeaningsHold
      (browserTransitionMeaning checkpointMeaning parameters)
      (browserTransitionTree scope parameters beforeLeaf actionLeaf reloadLeaf
        freshContextLeaf)) :
    browserTransitionMeaning checkpointMeaning parameters scope
      (durableStateTransitionObservedClaim
        parameters.durableStateTransitionObserved) := by
  have hRoot := checked_tree_with_sound_registry_establishes_root_meaning
    BrowserPyramid.ruleDefinitionDigest (trustedRegistry parameters) now
    (browserTransitionMeaning checkpointMeaning parameters)
    (browserTransitionTree scope parameters beforeLeaf actionLeaf reloadLeaf
      freshContextLeaf)
    hChecked hLeaves (trusted_registry_is_sound checkpointMeaning parameters)
  simpa [browserTransitionTree, transitionSurvivedReloadTree,
    transitionVisibleInFreshContextTree, MeaningTree.rootScope,
    MeaningTree.rootClaim] using hRoot

namespace Hostile

def fixtureScope : Scope where
  repository := "riddledc/browser-transition-fixture"
  revision := "revision-a"
  environment := "playwright"
  target := "https://example.invalid/browser-transition"
  proofAttempt := "browser-transition-fixture"

def fixtureParameters : CanonicalParameters where
  beforeProfile := "canonical:profile-before:digest-before"
  actionProfile := "canonical:profile-action:digest-action"
  reloadProfile := "canonical:profile-reload:digest-reload"
  freshContextProfile := "canonical:profile-fresh:digest-fresh"
  transitionObserved := "canonical:transition-observed"
  transitionSurvivedReload := "canonical:transition-survived-reload"
  transitionVisibleInFreshContext := "canonical:transition-visible-fresh"
  durableStateTransitionObserved := "canonical:durable-transition"

def checkpointLeaf
    (certificateId groundingId canonicalParameters : String) : GroundedLeaf :=
  BrowserPyramid.groundedLeaf fixtureScope canonicalParameters certificateId
    groundingId "riddle-proof.browser.sealed-profile-satisfied" 40 60

def beforeLeaf : GroundedLeaf :=
  checkpointLeaf "cert-before" "ground-before"
    fixtureParameters.beforeProfile

def actionLeaf : GroundedLeaf :=
  checkpointLeaf "cert-action" "ground-action"
    fixtureParameters.actionProfile

def reloadLeaf : GroundedLeaf :=
  checkpointLeaf "cert-reload" "ground-reload"
    fixtureParameters.reloadProfile

def freshContextLeaf : GroundedLeaf :=
  checkpointLeaf "cert-fresh" "ground-fresh"
    fixtureParameters.freshContextProfile

def positiveTree : MeaningTree :=
  browserTransitionTree fixtureScope fixtureParameters beforeLeaf actionLeaf
    reloadLeaf freshContextLeaf

theorem positive_browser_transition_is_checked :
    checked BrowserPyramid.ruleDefinitionDigest
      (trustedRegistry fixtureParameters) 50 positiveTree = true := by
  native_decide

/-! A reload checkpoint cannot be reused in the fresh-context position. -/
def reusedReloadAsFreshContextTree : MeaningTree :=
  browserTransitionTree fixtureScope fixtureParameters beforeLeaf actionLeaf
    reloadLeaf reloadLeaf

theorem reused_reload_as_fresh_context_is_rejected :
    disposition BrowserPyramid.ruleDefinitionDigest
      (trustedRegistry fixtureParameters) 50 reusedReloadAsFreshContextTree =
      .unresolved := by
  native_decide

def substitutedScope : Scope :=
  { fixtureScope with revision := "revision-b" }

def wrongScopeFreshContextLeaf : GroundedLeaf :=
  { freshContextLeaf with scope := substitutedScope }

def wrongScopeTree : MeaningTree :=
  browserTransitionTree fixtureScope fixtureParameters beforeLeaf actionLeaf
    reloadLeaf wrongScopeFreshContextLeaf

theorem substituted_checkpoint_scope_is_rejected :
    disposition BrowserPyramid.ruleDefinitionDigest
      (trustedRegistry fixtureParameters) 50 wrongScopeTree = .unresolved := by
  native_decide

end Hostile

end RiddleProofKernel.BrowserTransition
