import Std
import RiddleProofKernel.SemanticClosure

namespace RiddleProofKernel.MeaningKernel

open SemanticComposition SemanticClosure

/-!
A minimal checked kernel for building a higher-level meaning from grounded
claims.

The serialized side of the model contains only data: complete rule
definitions, an abstract content digest of each definition, grounded-leaf
references, and a binary derivation tree.  A fixed registry decides which
exact rule definitions may be used.  The semantic side is deliberately kept
separate: an interpretation assigns a proposition to each scoped claim, and a
rule is sound only when those premise propositions imply its conclusion.

This separation prevents either a rule name or a successful structural check
from manufacturing meaning.  The principal theorem below requires both the
meaning of every reachable grounded leaf and the soundness of every reachable
composition rule.  It then proves the meaning of the root.

The v0 tree is intentionally binary.  Larger rules are represented as a
pyramid of small rules, making every semantic step explicit and reusable.
Runtime code remains responsible for canonical encoding, cryptographic hash
correctness, registry distribution, and establishing the grounded leaves.
-/

def fixedMeaningRuleEngine : String :=
  "riddle-proof.checked-meaning-rule.v0"

theorem fixed_meaning_rule_engine_matches_runtime_identifier :
    fixedMeaningRuleEngine = "riddle-proof.checked-meaning-rule.v0" := by
  rfl

/-! A complete, data-only definition of one binary semantic rule. -/
structure RuleDefinition where
  engine : String
  ruleId : String
  ruleVersion : String
  leftPremise : ClaimKey
  rightPremise : ClaimKey
  conclusion : ClaimKey
  canonicalParameters : String
  deriving DecidableEq, Repr, BEq

abbrev DigestRuleDefinition := RuleDefinition → String

/-!
The digest is stored beside the complete definition.  `valid` below recomputes
it with the runtime-supplied digest function; merely retaining the same rule
ID or version is insufficient.
-/
structure ContentAddressedRule where
  definition : RuleDefinition
  definitionDigest : String
  deriving DecidableEq, Repr, BEq

structure RuleIdentity where
  ruleId : String
  ruleVersion : String
  deriving DecidableEq, Repr, BEq

def claimKeyWellFormed (claim : ClaimKey) : Bool :=
  decide (claim.claimId ≠ "") && decide (claim.claimVersion ≠ "")

namespace RuleDefinition

def identity (definition : RuleDefinition) : RuleIdentity where
  ruleId := definition.ruleId
  ruleVersion := definition.ruleVersion

def wellFormed (definition : RuleDefinition) : Bool :=
  decide (definition.engine = fixedMeaningRuleEngine) &&
  (decide (definition.ruleId ≠ "") &&
  (decide (definition.ruleVersion ≠ "") &&
  (claimKeyWellFormed definition.leftPremise &&
  (claimKeyWellFormed definition.rightPremise &&
  claimKeyWellFormed definition.conclusion))))

end RuleDefinition

namespace ContentAddressedRule

def valid
    (digestDefinition : DigestRuleDefinition)
    (rule : ContentAddressedRule) : Bool :=
  rule.definition.wellFormed &&
    decide (rule.definitionDigest = digestDefinition rule.definition)

theorem valid_implies_complete_definition_digest
    {digestDefinition : DigestRuleDefinition}
    {rule : ContentAddressedRule}
    (hValid : rule.valid digestDefinition = true) :
    rule.definitionDigest = digestDefinition rule.definition := by
  simp [valid] at hValid
  exact hValid.2

end ContentAddressedRule

/-!
The registry is the fixed trust input.  Exact rule membership is checked, and
one ID/version pair cannot silently designate two different definitions.
-/
structure FixedRuleRegistry where
  rules : List ContentAddressedRule
  deriving DecidableEq, Repr, BEq

namespace FixedRuleRegistry

def identities (registry : FixedRuleRegistry) : List RuleIdentity :=
  registry.rules.map (fun rule => rule.definition.identity)

def containsExact
    (registry : FixedRuleRegistry)
    (rule : ContentAddressedRule) : Bool :=
  registry.rules.any (fun candidate => decide (candidate = rule))

theorem contains_exact_iff
    (registry : FixedRuleRegistry)
    (rule : ContentAddressedRule) :
    registry.containsExact rule = true ↔ rule ∈ registry.rules := by
  simp [containsExact]

def wellFormed
    (digestDefinition : DigestRuleDefinition)
    (registry : FixedRuleRegistry) : Bool :=
  decide registry.identities.Nodup &&
    registry.rules.all (fun rule => rule.valid digestDefinition)

def accepts
    (digestDefinition : DigestRuleDefinition)
    (registry : FixedRuleRegistry)
    (rule : ContentAddressedRule) : Bool :=
  rule.valid digestDefinition && registry.containsExact rule

theorem accepts_implies_exact_registry_membership
    {digestDefinition : DigestRuleDefinition}
    {registry : FixedRuleRegistry}
    {rule : ContentAddressedRule}
    (hAccepted : registry.accepts digestDefinition rule = true) :
    rule ∈ registry.rules := by
  simp only [accepts, Bool.and_eq_true] at hAccepted
  exact (contains_exact_iff registry rule).mp hAccepted.2

theorem accepts_implies_complete_definition_digest
    {digestDefinition : DigestRuleDefinition}
    {registry : FixedRuleRegistry}
    {rule : ContentAddressedRule}
    (hAccepted : registry.accepts digestDefinition rule = true) :
    rule.definitionDigest = digestDefinition rule.definition := by
  simp [accepts, ContentAddressedRule.valid] at hAccepted
  exact hAccepted.1.2

end FixedRuleRegistry

/-!
`GroundedLeaf` points back to a grounding certificate/sidecar already checked
at the lower evidence layer.  Its time interval controls whether that meaning
may still be relied upon for this evaluation.  This record does not itself
prove the outside-world fact; that proposition is a premise of the main
theorem.
-/
structure GroundedLeaf where
  certificateId : CertificateId
  groundingId : String
  scope : Scope
  claim : ClaimKey
  issuedAt : Nat
  validThrough : Nat
  deriving DecidableEq, Repr, BEq

namespace GroundedLeaf

def freshAt (now : Nat) (leaf : GroundedLeaf) : Bool :=
  decide (leaf.issuedAt ≤ now) && decide (now ≤ leaf.validThrough)

theorem fresh_at_iff_inside_interval (now : Nat) (leaf : GroundedLeaf) :
    leaf.freshAt now = true ↔
      leaf.issuedAt ≤ now ∧ now ≤ leaf.validThrough := by
  simp [freshAt]

def structurallyWellFormed (leaf : GroundedLeaf) : Bool :=
  decide (leaf.certificateId ≠ "") &&
  (decide (leaf.groundingId ≠ "") &&
  (claimKeyWellFormed leaf.claim &&
  decide (leaf.issuedAt ≤ leaf.validThrough)))

def wellFormedAt (now : Nat) (leaf : GroundedLeaf) : Bool :=
  leaf.structurallyWellFormed && leaf.freshAt now

theorem well_formed_implies_fresh
    {now : Nat}
    {leaf : GroundedLeaf}
    (hValid : leaf.wellFormedAt now = true) :
    leaf.issuedAt ≤ now ∧ now ≤ leaf.validThrough := by
  simp [wellFormedAt, structurallyWellFormed, freshAt] at hValid
  omega

end GroundedLeaf

/-!
The claimed conclusion is stored independently of the rule definition so the
checker can reject an invented conclusion rather than constructing it away.
-/
inductive MeaningTree where
  | grounded (leaf : GroundedLeaf)
  | compose
      (scope : Scope)
      (claimedConclusion : ClaimKey)
      (rule : ContentAddressedRule)
      (left right : MeaningTree)
  deriving Repr

namespace MeaningTree

def rootScope : MeaningTree → Scope
  | .grounded leaf => leaf.scope
  | .compose scope _ _ _ _ => scope

def rootClaim : MeaningTree → ClaimKey
  | .grounded leaf => leaf.claim
  | .compose _ claimedConclusion _ _ _ => claimedConclusion

def containsFutureLeaf (now : Nat) : MeaningTree → Bool
  | .grounded leaf => decide (now < leaf.issuedAt)
  | .compose _ _ _ left right =>
      left.containsFutureLeaf now || right.containsFutureLeaf now

def containsExpiredLeaf (now : Nat) : MeaningTree → Bool
  | .grounded leaf => decide (leaf.validThrough < now)
  | .compose _ _ _ left right =>
      left.containsExpiredLeaf now || right.containsExpiredLeaf now

end MeaningTree

def compositionBoundaryValid
    (digestDefinition : DigestRuleDefinition)
    (registry : FixedRuleRegistry)
    (scope : Scope)
    (claimedConclusion : ClaimKey)
    (rule : ContentAddressedRule)
    (left right : MeaningTree) : Bool :=
  registry.accepts digestDefinition rule &&
  (decide (claimedConclusion = rule.definition.conclusion) &&
  (decide (left.rootScope = scope) &&
  (decide (right.rootScope = scope) &&
  (decide (left.rootClaim = rule.definition.leftPremise) &&
  decide (right.rootClaim = rule.definition.rightPremise)))))

theorem composition_boundary_valid_sound
    {digestDefinition : DigestRuleDefinition}
    {registry : FixedRuleRegistry}
    {scope : Scope}
    {claimedConclusion : ClaimKey}
    {rule : ContentAddressedRule}
    {left right : MeaningTree}
    (hValid : compositionBoundaryValid digestDefinition registry scope
      claimedConclusion rule left right = true) :
    registry.accepts digestDefinition rule = true ∧
    claimedConclusion = rule.definition.conclusion ∧
    left.rootScope = scope ∧
    right.rootScope = scope ∧
    left.rootClaim = rule.definition.leftPremise ∧
    right.rootClaim = rule.definition.rightPremise := by
  simpa [compositionBoundaryValid] using hValid

def checkedAux
    (digestDefinition : DigestRuleDefinition)
    (registry : FixedRuleRegistry)
    (now : Nat) : MeaningTree → Bool
  | .grounded leaf => leaf.wellFormedAt now
  | .compose scope claimedConclusion rule left right =>
      compositionBoundaryValid digestDefinition registry scope
        claimedConclusion rule left right &&
      (checkedAux digestDefinition registry now left &&
       checkedAux digestDefinition registry now right)

/-!
The structural pass deliberately omits consumption-time freshness.  Runtime
assessment likewise resolves and replays the complete closure before deciding
whether an otherwise valid signed capture is future-dated or expired.
-/
def structurallyCheckedAux
    (digestDefinition : DigestRuleDefinition)
    (registry : FixedRuleRegistry) : MeaningTree → Bool
  | .grounded leaf => leaf.structurallyWellFormed
  | .compose scope claimedConclusion rule left right =>
      compositionBoundaryValid digestDefinition registry scope
        claimedConclusion rule left right &&
      (structurallyCheckedAux digestDefinition registry left &&
       structurallyCheckedAux digestDefinition registry right)

def structurallyChecked
    (digestDefinition : DigestRuleDefinition)
    (registry : FixedRuleRegistry)
    (tree : MeaningTree) : Bool :=
  registry.wellFormed digestDefinition &&
    structurallyCheckedAux digestDefinition registry tree

def checked
    (digestDefinition : DigestRuleDefinition)
    (registry : FixedRuleRegistry)
    (now : Nat)
    (tree : MeaningTree) : Bool :=
  registry.wellFormed digestDefinition &&
    checkedAux digestDefinition registry now tree

structure Validated
    (digestDefinition : DigestRuleDefinition)
    (registry : FixedRuleRegistry)
    (now : Nat) where
  raw : MeaningTree
  valid : checked digestDefinition registry now raw = true

def validate
    (digestDefinition : DigestRuleDefinition)
    (registry : FixedRuleRegistry)
    (now : Nat)
    (tree : MeaningTree) :
    Option (Validated digestDefinition registry now) :=
  if h : checked digestDefinition registry now tree = true then
    some ⟨tree, h⟩
  else
    none

inductive KernelDisposition where
  | checked
  | unresolved
  | stale
  deriving DecidableEq, Repr, BEq

/-!
Failure to validate is not proof that the root claim is false.  Structurally
unknown or mismatched material is `unresolved`.  After the structural pass, a
future grounding is also `unresolved`, while an expired grounding is reported
separately as `stale`.  Thus malformed material cannot be relabeled as merely
stale, and future timestamps take precedence over expiry as in the runtime
consumption assessor.
-/
def disposition
    (digestDefinition : DigestRuleDefinition)
    (registry : FixedRuleRegistry)
    (now : Nat)
    (tree : MeaningTree) : KernelDisposition :=
  if structurallyChecked digestDefinition registry tree then
    if tree.containsFutureLeaf now then
      .unresolved
    else if tree.containsExpiredLeaf now then
      .stale
    else if checked digestDefinition registry now tree then
      .checked
    else
      .unresolved
  else
    .unresolved

/-! The semantic interpretation of a content-addressed scoped claim. -/
abbrev ClaimInterpretation := Scope → ClaimKey → Prop

def RuleSound
    (meaning : ClaimInterpretation)
    (definition : RuleDefinition) : Prop :=
  ∀ scope,
    meaning scope definition.leftPremise →
    meaning scope definition.rightPremise →
    meaning scope definition.conclusion

/-! Reachability follows the root-to-premise tree, not registry membership. -/
inductive ReachableLeaf : MeaningTree → GroundedLeaf → Prop where
  | root (leaf : GroundedLeaf) : ReachableLeaf (.grounded leaf) leaf
  | left
      {scope conclusion rule leftTree rightTree leaf}
      (reachable : ReachableLeaf leftTree leaf) :
      ReachableLeaf (.compose scope conclusion rule leftTree rightTree) leaf
  | right
      {scope conclusion rule leftTree rightTree leaf}
      (reachable : ReachableLeaf rightTree leaf) :
      ReachableLeaf (.compose scope conclusion rule leftTree rightTree) leaf

inductive ReachableRule : MeaningTree → ContentAddressedRule → Prop where
  | root
      (scope conclusion rule left right) :
      ReachableRule (.compose scope conclusion rule left right) rule
  | left
      {scope conclusion parentRule leftTree rightTree rule}
      (reachable : ReachableRule leftTree rule) :
      ReachableRule
        (.compose scope conclusion parentRule leftTree rightTree) rule
  | right
      {scope conclusion parentRule leftTree rightTree rule}
      (reachable : ReachableRule rightTree rule) :
      ReachableRule
        (.compose scope conclusion parentRule leftTree rightTree) rule

def GroundedLeafMeaningsHold
    (meaning : ClaimInterpretation)
    (tree : MeaningTree) : Prop :=
  ∀ leaf, ReachableLeaf tree leaf → meaning leaf.scope leaf.claim

def ReachableRulesSound
    (meaning : ClaimInterpretation)
    (tree : MeaningTree) : Prop :=
  ∀ rule, ReachableRule tree rule → RuleSound meaning rule.definition

def RegistrySound
    (meaning : ClaimInterpretation)
    (registry : FixedRuleRegistry) : Prop :=
  ∀ rule ∈ registry.rules, RuleSound meaning rule.definition

theorem checked_aux_reachable_rules_are_exactly_registered
    {digestDefinition : DigestRuleDefinition}
    {registry : FixedRuleRegistry}
    {now : Nat}
    {tree : MeaningTree}
    (hChecked : checkedAux digestDefinition registry now tree = true) :
    ∀ rule, ReachableRule tree rule → rule ∈ registry.rules := by
  intro rule hReachable
  induction hReachable with
  | root scope conclusion currentRule left right =>
      simp only [checkedAux, Bool.and_eq_true] at hChecked
      have hBoundary := composition_boundary_valid_sound hChecked.1
      exact FixedRuleRegistry.accepts_implies_exact_registry_membership
        hBoundary.1
  | left reachable inductionHypothesis =>
      simp only [checkedAux, Bool.and_eq_true] at hChecked
      exact inductionHypothesis hChecked.2.1
  | right reachable inductionHypothesis =>
      simp only [checkedAux, Bool.and_eq_true] at hChecked
      exact inductionHypothesis hChecked.2.2

/-!
The meaning theorem.  Structural validity alone is insufficient: every
reachable grounded leaf must have its interpreted meaning, and every reachable
rule must be semantically sound.  Under exactly those premises, the checked
root has its interpreted meaning.
-/
theorem checked_aux_tree_with_grounded_leaves_and_sound_reachable_rules_establishes_root_meaning
    (digestDefinition : DigestRuleDefinition)
    (registry : FixedRuleRegistry)
    (now : Nat)
    (meaning : ClaimInterpretation)
    (tree : MeaningTree)
    (hChecked : checkedAux digestDefinition registry now tree = true)
    (hLeaves : GroundedLeafMeaningsHold meaning tree)
    (hRules : ReachableRulesSound meaning tree) :
    meaning tree.rootScope tree.rootClaim := by
  induction tree with
  | grounded leaf =>
      exact hLeaves leaf (ReachableLeaf.root leaf)
  | compose scope claimedConclusion rule left right leftIH rightIH =>
      simp only [checkedAux, Bool.and_eq_true] at hChecked
      have hBoundary := composition_boundary_valid_sound hChecked.1
      have hLeft : meaning left.rootScope left.rootClaim := by
        apply leftIH hChecked.2.1
        · intro leaf reachable
          exact hLeaves leaf (ReachableLeaf.left reachable)
        · intro reachableRule reachable
          exact hRules reachableRule (ReachableRule.left reachable)
      have hRight : meaning right.rootScope right.rootClaim := by
        apply rightIH hChecked.2.2
        · intro leaf reachable
          exact hLeaves leaf (ReachableLeaf.right reachable)
        · intro reachableRule reachable
          exact hRules reachableRule (ReachableRule.right reachable)
      have hRuleSound : RuleSound meaning rule.definition :=
        hRules rule (ReachableRule.root scope claimedConclusion rule left right)
      have hConclusion : meaning scope rule.definition.conclusion :=
        hRuleSound scope
          (by simpa [hBoundary.2.2.1, hBoundary.2.2.2.2.1] using hLeft)
          (by simpa [hBoundary.2.2.2.1, hBoundary.2.2.2.2.2] using hRight)
      simpa [MeaningTree.rootScope, MeaningTree.rootClaim, hBoundary.2.1] using
        hConclusion

theorem checked_tree_with_grounded_leaves_and_sound_reachable_rules_establishes_root_meaning
    (digestDefinition : DigestRuleDefinition)
    (registry : FixedRuleRegistry)
    (now : Nat)
    (meaning : ClaimInterpretation)
    (tree : MeaningTree)
    (hChecked : checked digestDefinition registry now tree = true)
    (hLeaves : GroundedLeafMeaningsHold meaning tree)
    (hRules : ReachableRulesSound meaning tree) :
    meaning tree.rootScope tree.rootClaim := by
  simp only [checked, Bool.and_eq_true] at hChecked
  exact checked_aux_tree_with_grounded_leaves_and_sound_reachable_rules_establishes_root_meaning
    digestDefinition registry now meaning tree hChecked.2 hLeaves hRules

theorem checked_tree_with_sound_registry_establishes_root_meaning
    (digestDefinition : DigestRuleDefinition)
    (registry : FixedRuleRegistry)
    (now : Nat)
    (meaning : ClaimInterpretation)
    (tree : MeaningTree)
    (hChecked : checked digestDefinition registry now tree = true)
    (hLeaves : GroundedLeafMeaningsHold meaning tree)
    (hRegistrySound : RegistrySound meaning registry) :
    meaning tree.rootScope tree.rootClaim := by
  apply checked_tree_with_grounded_leaves_and_sound_reachable_rules_establishes_root_meaning
    digestDefinition registry now meaning tree hChecked hLeaves
  intro rule reachable
  have hAux : checkedAux digestDefinition registry now tree = true := by
    simp only [checked, Bool.and_eq_true] at hChecked
    exact hChecked.2
  exact hRegistrySound rule
    (checked_aux_reachable_rules_are_exactly_registered hAux rule reachable)

namespace Examples

def claim (claimId : String) : ClaimKey where
  claimId := claimId
  claimVersion := "v1"
  canonicalParameters := "{\"challenge\":\"fresh-42\"}"

def requestClaim : ClaimKey := claim "request_contains_challenge"
def singleMutationClaim : ClaimKey := claim "single_matching_mutation"
def acknowledgedClaim : ClaimKey := claim "server_acknowledged"
def readBackClaim : ClaimKey := claim "same_value_read_after_reload"
def submittedClaim : ClaimKey := claim "observed_single_accepted_mutation"
def returnedClaim : ClaimKey := claim "observed_value_returned_after_ack"
def roundTripClaim : ClaimKey := claim "observed_bounded_save_round_trip"
def inventedClaim : ClaimKey := claim "saved_forever_in_every_replica"

def scope : Scope where
  repository := "riddledc/meaning-fixture"
  revision := "fixture-revision"
  environment := "lean"
  target := "save-round-trip"
  proofAttempt := "meaning-kernel-positive"

def ruleDefinitionDigest (definition : RuleDefinition) : String :=
  "complete-fixture-digest:" ++ reprStr definition

def addressed (definition : RuleDefinition) : ContentAddressedRule where
  definition := definition
  definitionDigest := ruleDefinitionDigest definition

def submittedDefinition : RuleDefinition where
  engine := fixedMeaningRuleEngine
  ruleId := "save.submitted"
  ruleVersion := "v1"
  leftPremise := requestClaim
  rightPremise := singleMutationClaim
  conclusion := submittedClaim
  canonicalParameters := "{}"

def returnedDefinition : RuleDefinition where
  engine := fixedMeaningRuleEngine
  ruleId := "save.returned"
  ruleVersion := "v1"
  leftPremise := acknowledgedClaim
  rightPremise := readBackClaim
  conclusion := returnedClaim
  canonicalParameters := "{}"

def roundTripDefinition : RuleDefinition where
  engine := fixedMeaningRuleEngine
  ruleId := "save.round-trip"
  ruleVersion := "v1"
  leftPremise := submittedClaim
  rightPremise := returnedClaim
  conclusion := roundTripClaim
  canonicalParameters := "{\"ordering\":\"ack-before-reload\"}"

def submittedRule : ContentAddressedRule := addressed submittedDefinition
def returnedRule : ContentAddressedRule := addressed returnedDefinition
def roundTripRule : ContentAddressedRule := addressed roundTripDefinition

def registry : FixedRuleRegistry where
  rules := [submittedRule, returnedRule, roundTripRule]

def leaf (certificateId groundingId : String) (claimKey : ClaimKey) :
    GroundedLeaf where
  certificateId := certificateId
  groundingId := groundingId
  scope := scope
  claim := claimKey
  issuedAt := 40
  validThrough := 60

def requestLeaf : MeaningTree :=
  .grounded (leaf "cert-request" "ground-request" requestClaim)

def mutationLeaf : MeaningTree :=
  .grounded (leaf "cert-mutation" "ground-mutation" singleMutationClaim)

def acknowledgedLeaf : MeaningTree :=
  .grounded (leaf "cert-ack" "ground-ack" acknowledgedClaim)

def readBackLeaf : MeaningTree :=
  .grounded (leaf "cert-readback" "ground-readback" readBackClaim)

def submittedTree : MeaningTree :=
  .compose scope submittedClaim submittedRule requestLeaf mutationLeaf

def returnedTree : MeaningTree :=
  .compose scope returnedClaim returnedRule acknowledgedLeaf readBackLeaf

def positiveTree : MeaningTree :=
  .compose scope roundTripClaim roundTripRule submittedTree returnedTree

theorem positive_tree_is_checked :
    checked ruleDefinitionDigest registry 50 positiveTree = true := by
  native_decide

theorem positive_tree_disposition_is_checked :
    disposition ruleDefinitionDigest registry 50 positiveTree =
      .checked := by
  native_decide

def inventedConclusionTree : MeaningTree :=
  .compose scope inventedClaim roundTripRule submittedTree returnedTree

theorem invented_conclusion_is_unresolved_not_established :
    disposition ruleDefinitionDigest registry 50 inventedConclusionTree =
      .unresolved := by
  native_decide

def unknownDefinition : RuleDefinition where
  engine := fixedMeaningRuleEngine
  ruleId := "save.unknown-shortcut"
  ruleVersion := "v1"
  leftPremise := submittedClaim
  rightPremise := returnedClaim
  conclusion := roundTripClaim
  canonicalParameters := "{}"

def unknownRuleTree : MeaningTree :=
  .compose scope roundTripClaim (addressed unknownDefinition)
    submittedTree returnedTree

theorem unknown_rule_is_unresolved_not_established :
    disposition ruleDefinitionDigest registry 50 unknownRuleTree =
      .unresolved := by
  native_decide

def staleRequestLeaf : MeaningTree :=
  .grounded
    { leaf "cert-request" "ground-request" requestClaim with
      validThrough := 49 }

def staleTree : MeaningTree :=
  .compose scope roundTripClaim roundTripRule
    (.compose scope submittedClaim submittedRule staleRequestLeaf mutationLeaf)
    returnedTree

theorem stale_grounding_is_stale_not_established :
    disposition ruleDefinitionDigest registry 50 staleTree = .stale := by
  native_decide

def futureRequestLeaf : MeaningTree :=
  .grounded
    { leaf "cert-request" "ground-request" requestClaim with
      issuedAt := 51 }

def futureTree : MeaningTree :=
  .compose scope roundTripClaim roundTripRule
    (.compose scope submittedClaim submittedRule futureRequestLeaf mutationLeaf)
    returnedTree

theorem not_yet_current_grounding_is_unresolved_not_established :
    disposition ruleDefinitionDigest registry 50 futureTree = .unresolved := by
  native_decide

def inventedConclusionWithStaleGroundingTree : MeaningTree :=
  .compose scope inventedClaim roundTripRule
    (.compose scope submittedClaim submittedRule staleRequestLeaf mutationLeaf)
    returnedTree

theorem structural_failure_dominates_expired_grounding :
    disposition ruleDefinitionDigest registry 50
      inventedConclusionWithStaleGroundingTree = .unresolved := by
  native_decide

def changedRoundTripDefinition : RuleDefinition :=
  { roundTripDefinition with canonicalParameters :=
      "{\"ordering\":\"none\"}" }

def changedDefinitionWithOldDigest : ContentAddressedRule where
  definition := changedRoundTripDefinition
  definitionDigest := roundTripRule.definitionDigest

def changedDefinitionTree : MeaningTree :=
  .compose scope roundTripClaim changedDefinitionWithOldDigest
    submittedTree returnedTree

theorem changed_definition_with_old_digest_is_unresolved :
    disposition ruleDefinitionDigest registry 50 changedDefinitionTree =
      .unresolved := by
  native_decide

def changedDefinitionWithNewDigest : ContentAddressedRule :=
  addressed changedRoundTripDefinition

def changedDefinitionWithNewDigestTree : MeaningTree :=
  .compose scope roundTripClaim changedDefinitionWithNewDigest
    submittedTree returnedTree

theorem changed_definition_with_same_identity_and_new_digest_is_unresolved :
    disposition ruleDefinitionDigest registry 50
      changedDefinitionWithNewDigestTree = .unresolved := by
  native_decide

/-!
The fixture interpretation assigns actual conjunction semantics to the three
higher claims.  Unknown claims mean `False`; rejection never turns that
absence of a proof into a proof of negation.
-/
def saveMeaning
    (requestMatches singleMutation acknowledged readBackMatches : Prop) :
    ClaimInterpretation :=
  fun _ claimKey =>
    if claimKey = requestClaim then requestMatches
    else if claimKey = singleMutationClaim then singleMutation
    else if claimKey = acknowledgedClaim then acknowledged
    else if claimKey = readBackClaim then readBackMatches
    else if claimKey = submittedClaim then requestMatches ∧ singleMutation
    else if claimKey = returnedClaim then acknowledged ∧ readBackMatches
    else if claimKey = roundTripClaim then
      (requestMatches ∧ singleMutation) ∧ (acknowledged ∧ readBackMatches)
    else False

theorem submitted_rule_is_sound
    (requestMatches singleMutation acknowledged readBackMatches : Prop) :
    RuleSound
      (saveMeaning requestMatches singleMutation acknowledged readBackMatches)
      submittedDefinition := by
  intro ruleScope hRequest hMutation
  simpa [saveMeaning, submittedDefinition, requestClaim, singleMutationClaim,
    acknowledgedClaim, readBackClaim, submittedClaim, returnedClaim,
    roundTripClaim, claim] using And.intro hRequest hMutation

theorem returned_rule_is_sound
    (requestMatches singleMutation acknowledged readBackMatches : Prop) :
    RuleSound
      (saveMeaning requestMatches singleMutation acknowledged readBackMatches)
      returnedDefinition := by
  intro ruleScope hAcknowledged hReadBack
  simpa [saveMeaning, returnedDefinition, requestClaim, singleMutationClaim,
    acknowledgedClaim, readBackClaim, submittedClaim, returnedClaim,
    roundTripClaim, claim] using And.intro hAcknowledged hReadBack

theorem round_trip_rule_is_sound
    (requestMatches singleMutation acknowledged readBackMatches : Prop) :
    RuleSound
      (saveMeaning requestMatches singleMutation acknowledged readBackMatches)
      roundTripDefinition := by
  intro ruleScope hSubmitted hReturned
  simpa [saveMeaning, roundTripDefinition, requestClaim, singleMutationClaim,
    acknowledgedClaim, readBackClaim, submittedClaim, returnedClaim,
    roundTripClaim, claim] using And.intro hSubmitted hReturned

def allTrueMeaning : ClaimInterpretation :=
  saveMeaning True True True True

theorem positive_grounded_leaf_meanings_hold :
    GroundedLeafMeaningsHold allTrueMeaning positiveTree := by
  intro groundedLeaf reachable
  cases reachable with
  | left reachableSubmitted =>
      cases reachableSubmitted with
      | left reachableRequest =>
          cases reachableRequest
          simp [allTrueMeaning, saveMeaning, leaf, requestClaim, claim]
      | right reachableMutation =>
          cases reachableMutation
          simp [allTrueMeaning, saveMeaning, leaf, requestClaim,
            singleMutationClaim, claim]
  | right reachableReturned =>
      cases reachableReturned with
      | left reachableAcknowledged =>
          cases reachableAcknowledged
          simp [allTrueMeaning, saveMeaning, leaf, requestClaim,
            singleMutationClaim, acknowledgedClaim, claim]
      | right reachableReadBack =>
          cases reachableReadBack
          simp [allTrueMeaning, saveMeaning, leaf, requestClaim,
            singleMutationClaim, acknowledgedClaim, readBackClaim,
            claim]

theorem positive_registry_is_sound : RegistrySound allTrueMeaning registry := by
  intro rule hRule
  simp [registry] at hRule
  rcases hRule with rfl | rfl | rfl
  · exact submitted_rule_is_sound True True True True
  · exact returned_rule_is_sound True True True True
  · exact round_trip_rule_is_sound True True True True

theorem positive_root_has_bounded_round_trip_meaning :
    allTrueMeaning positiveTree.rootScope positiveTree.rootClaim := by
  exact checked_tree_with_sound_registry_establishes_root_meaning
    ruleDefinitionDigest registry 50 allTrueMeaning positiveTree
    positive_tree_is_checked positive_grounded_leaf_meanings_hold
    positive_registry_is_sound

end Examples

end RiddleProofKernel.MeaningKernel
