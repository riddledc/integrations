import Std

namespace RiddleProofKernel.SemanticComposition

universe u

/-!
An experimental algebra for turning scoped Riddle Proof observations into
reusable, composable claims.

The scope is part of the certificate's type. Ordinary composition therefore
works only when repository, revision, environment, target, and proof-attempt
identity all match. Moving a certificate to another scope requires an explicit
proof that the scopes are equal.

This module deliberately starts *after* evidence collection. Runtime code is
still responsible for parsing receipts and for browser, Git, filesystem, CDN,
and screenshot truth. Lean proves only what follows from the scoped observation
data supplied at that boundary.
-/

structure Scope where
  repository : String
  revision : String
  environment : String
  target : String
  proofAttempt : String
  deriving DecidableEq, Repr, BEq

namespace Scope

def compatible (left right : Scope) : Bool :=
  decide (left = right)

theorem compatible_implies_equal
    {left right : Scope}
    (hCompatible : compatible left right = true) :
    left = right := by
  exact of_decide_eq_true hCompatible

@[simp] theorem compatible_self (scope : Scope) :
    compatible scope scope = true := by
  simp [compatible]

end Scope

structure EvidenceRef where
  receiptId : String
  artifactDigest : String
  role : String
  deriving DecidableEq, Repr, BEq

/-! A certificate always retains at least one audit reference. -/
structure EvidenceBundle where
  first : EvidenceRef
  rest : List EvidenceRef
  deriving DecidableEq, Repr, BEq

namespace EvidenceBundle

def singleton (evidence : EvidenceRef) : EvidenceBundle where
  first := evidence
  rest := []

def append (left right : EvidenceBundle) : EvidenceBundle where
  first := left.first
  rest := left.rest ++ (right.first :: right.rest)

def toList (bundle : EvidenceBundle) : List EvidenceRef :=
  bundle.first :: bundle.rest

@[simp] theorem toList_singleton (evidence : EvidenceRef) :
    (singleton evidence).toList = [evidence] := by
  rfl

@[simp] theorem toList_append (left right : EvidenceBundle) :
    (append left right).toList = left.toList ++ right.toList := by
  simp [append, toList]

@[simp] theorem toList_ne_nil (bundle : EvidenceBundle) :
    bundle.toList ≠ [] := by
  simp [toList]

end EvidenceBundle

/-!
A claim carries a human-readable label and a proposition whose meaning is
indexed by scope. Indexing the proposition itself prevents a claim about one
revision or environment from being relabeled as a fact about another.
-/
structure Claim where
  label : String
  holdsAt : Scope → Prop

namespace Claim

def both (left right : Claim) : Claim where
  label := left.label ++ " and " ++ right.label
  holdsAt scope := left.holdsAt scope ∧ right.holdsAt scope

def rename (label : String) (claim : Claim) : Claim where
  label := label
  holdsAt := claim.holdsAt

def entails (source target : Claim) : Prop :=
  ∀ scope, source.holdsAt scope → target.holdsAt scope

/-!
The conservative claim produced directly from an empirical predicate: some
supplied observation satisfied that predicate at this exact scope. This does
not assert that the supplying runtime or browser was truthful.
-/
def observed
    {Observation : Type u}
    (label : String)
    (predicate : Scope → Observation → Prop) : Claim where
  label := label
  holdsAt scope := ∃ observation, predicate scope observation

end Claim

/-!
`Certified claim scope` is the compressed result. The detailed observation may
be forgotten, while evidence references remain available for audit and the
Lean proof preserves the claim's meaning at the exact scope.
-/
structure Certified (claim : Claim) (scope : Scope) where
  evidence : EvidenceBundle
  holds : claim.holdsAt scope

namespace Certified

def fromProof
    {claim : Claim}
    {scope : Scope}
    (evidence : EvidenceRef)
    (holds : claim.holdsAt scope) :
    Certified claim scope where
  evidence := EvidenceBundle.singleton evidence
  holds := holds

def both
    {leftClaim rightClaim : Claim}
    {scope : Scope}
    (left : Certified leftClaim scope)
    (right : Certified rightClaim scope) :
    Certified (Claim.both leftClaim rightClaim) scope where
  evidence := left.evidence.append right.evidence
  holds := ⟨left.holds, right.holds⟩

@[simp] theorem both_preserves_evidence
    {leftClaim rightClaim : Claim}
    {scope : Scope}
    (left : Certified leftClaim scope)
    (right : Certified rightClaim scope) :
    (both left right).evidence.toList =
      left.evidence.toList ++ right.evidence.toList := by
  simp [both]

/-! Apply a reusable semantic rule without changing empirical scope. -/
def map
    {source target : Claim}
    {scope : Scope}
    (rule : Claim.entails source target)
    (input : Certified source scope) :
    Certified target scope where
  evidence := input.evidence
  holds := rule scope input.holds

@[simp] theorem map_preserves_evidence
    {source target : Claim}
    {scope : Scope}
    (rule : Claim.entails source target)
    (input : Certified source scope) :
    (map rule input).evidence = input.evidence := by
  rfl

def combine
    {leftClaim rightClaim target : Claim}
    {scope : Scope}
    (rule : ∀ scope,
      leftClaim.holdsAt scope →
      rightClaim.holdsAt scope →
      target.holdsAt scope)
    (left : Certified leftClaim scope)
    (right : Certified rightClaim scope) :
    Certified target scope where
  evidence := left.evidence.append right.evidence
  holds := rule scope left.holds right.holds

@[simp] theorem combine_preserves_evidence
    {leftClaim rightClaim target : Claim}
    {scope : Scope}
    (rule : ∀ scope,
      leftClaim.holdsAt scope →
      rightClaim.holdsAt scope →
      target.holdsAt scope)
    (left : Certified leftClaim scope)
    (right : Certified rightClaim scope) :
    (combine rule left right).evidence.toList =
      left.evidence.toList ++ right.evidence.toList := by
  simp [combine]

def renamed
    {claim : Claim}
    {scope : Scope}
    (label : String)
    (input : Certified claim scope) :
    Certified (Claim.rename label claim) scope where
  evidence := input.evidence
  holds := input.holds

/-!
Re-scoping is intentionally explicit. Lean requires equality of every scope
field; there is no generic weakening from one revision or environment to
another.
-/
def transport
    {sourceScope targetScope : Scope}
    {claim : Claim}
    (sameScope : sourceScope = targetScope)
    (input : Certified claim sourceScope) :
    Certified claim targetScope := by
  cases sameScope
  exact input

/-! Runtime-facing composition fails closed when parsed scopes differ. -/
def combineChecked?
    {leftScope rightScope : Scope}
    {leftClaim rightClaim : Claim}
    (left : Certified leftClaim leftScope)
    (right : Certified rightClaim rightScope) :
    Option (Certified (Claim.both leftClaim rightClaim) leftScope) :=
  if h : rightScope = leftScope then
    some (both left (transport h right))
  else
    none

@[simp] theorem combine_checked_mismatch_is_none
    {leftScope rightScope : Scope}
    {leftClaim rightClaim : Claim}
    (left : Certified leftClaim leftScope)
    (right : Certified rightClaim rightScope)
    (hMismatch : leftScope ≠ rightScope) :
    combineChecked? left right = none := by
  have hReverse : rightScope ≠ leftScope :=
    fun equality => hMismatch equality.symm
  simp [combineChecked?, hReverse]

end Certified

/-!
A contract is the checked bridge from runtime-supplied observation data to a
named, scoped claim. `establishes` is the semantic rule that makes the bridge
honest inside Lean.
-/
structure Contract (Observation : Type u) (claim : Claim) where
  name : String
  accepts : Scope → Observation → Prop
  establishes : ∀ {scope observation},
    accepts scope observation → claim.holdsAt scope

namespace Contract

def certify
    {Observation : Type u}
    {claim : Claim}
    (contract : Contract Observation claim)
    (scope : Scope)
    (observation : Observation)
    (evidence : EvidenceRef)
    (accepted : contract.accepts scope observation) :
    Certified claim scope where
  evidence := EvidenceBundle.singleton evidence
  holds := contract.establishes accepted

/-!
Build the conservative contract whose meaning is exactly that an accepted
observation exists at this scope.
-/
def fromPredicate
    {Observation : Type u}
    (label : String)
    (predicate : Scope → Observation → Prop) :
    Contract Observation (Claim.observed label predicate) where
  name := label
  accepts := predicate
  establishes := fun accepted => ⟨_, accepted⟩

end Contract

/-! Generic finite temporal claims for observation traces. -/
def EventAt
    {Event : Type u}
    (trace : List Event)
    (predicate : Event → Prop)
    (index : Nat) : Prop :=
  ∃ sample, trace[index]? = some sample ∧ predicate sample

structure BeforeAt
    {Event : Type u}
    (trace : List Event)
    (first second : Event → Prop)
    (firstIndex secondIndex : Nat) : Prop where
  firstHolds : EventAt trace first firstIndex
  secondHolds : EventAt trace second secondIndex
  ordered : firstIndex < secondIndex

def eventAtClaim
    {Event : Type u}
    (label : String)
    (trace : List Event)
    (predicate : Event → Prop)
    (index : Nat) : Claim where
  label := label
  holdsAt _ := EventAt trace predicate index

/-!
An exact finite-trace adapter. Acceptance checks the supplied trace against the
trace named by the claim and checks the event predicate at its declared index.
-/
def eventAtContract
    {Event : Type u}
    (label : String)
    (trace : List Event)
    (predicate : Event → Prop)
    (index : Nat) :
    Contract (List Event) (eventAtClaim label trace predicate index) where
  name := label
  accepts _ observation :=
    observation = trace ∧ EventAt observation predicate index
  establishes := by
    intro scope observation accepted
    rcases accepted with ⟨rfl, eventHolds⟩
    exact eventHolds

def beforeAtClaim
    {Event : Type u}
    (label : String)
    (trace : List Event)
    (first second : Event → Prop)
    (firstIndex secondIndex : Nat) : Claim where
  label := label
  holdsAt _ := BeforeAt trace first second firstIndex secondIndex

def Certified.before
    {Event : Type u}
    {scope : Scope}
    {trace : List Event}
    {first second : Event → Prop}
    {firstIndex secondIndex : Nat}
    {firstLabel secondLabel : String}
    (firstCertificate :
      Certified (eventAtClaim firstLabel trace first firstIndex) scope)
    (secondCertificate :
      Certified (eventAtClaim secondLabel trace second secondIndex) scope)
    (ordered : firstIndex < secondIndex) :
    Certified
      (beforeAtClaim
        (firstLabel ++ " before " ++ secondLabel)
        trace
        first
        second
        firstIndex
        secondIndex)
      scope where
  evidence := firstCertificate.evidence.append secondCertificate.evidence
  holds := ⟨firstCertificate.holds, secondCertificate.holds, ordered⟩

end RiddleProofKernel.SemanticComposition
