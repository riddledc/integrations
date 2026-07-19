import Std
import RiddleProofKernel.SemanticComposition

namespace RiddleProofKernel.SemanticClosure

open SemanticComposition

theorem bool_and_eq_true_iff (left right : Bool) :
    left && right = true ↔ left = true ∧ right = true := by
  cases left <;> cases right <;> simp

/-!
An executable model of a normalized, complete Semantic certificate closure.

The runtime representation is a dependency-first list of complete certificate
bodies. Every composition premise must resolve to an exact earlier body, the
root is the final body, certificate identifiers are unique, and every listed
body must be reachable from the root. This gives a finite topological witness:
there are no dangling or forward references, hence no dependency cycle.

Certificate identifiers and canonical claim parameters are deliberately
abstract strings here. Runtime code remains responsible for JSON parsing,
canonical serialization, and SHA-256 content-ID verification. Lean proves the
closure invariants after that boundary; it does not prove hash collision
resistance or the truth of referenced artifacts and runtime rules.
-/

abbrev CertificateId := String

structure ClaimKey where
  claimId : String
  claimVersion : String
  canonicalParameters : String
  deriving DecidableEq, Repr, BEq

structure ClaimDescriptor where
  key : ClaimKey
  label : String
  deriving DecidableEq, Repr, BEq

inductive DerivationKind where
  | contract
  | composition
  deriving DecidableEq, Repr, BEq

inductive Assurance where
  | runtimeContractAccepted
  | declaredRuntimeRule
  deriving DecidableEq, Repr, BEq

structure PremiseSnapshot where
  certificateId : CertificateId
  derivationKind : DerivationKind
  assurance : Assurance
  scope : Scope
  claim : ClaimDescriptor
  evidence : EvidenceBundle
  deriving DecidableEq, Repr, BEq

structure RuleDescriptor where
  ruleId : String
  ruleVersion : String
  premiseClaims : List ClaimKey
  conclusion : ClaimKey
  deriving DecidableEq, Repr, BEq

inductive Derivation where
  | contract (contractClaim : ClaimKey)
  | composition
      (rule : RuleDescriptor)
      (premises : List PremiseSnapshot)
  deriving DecidableEq, Repr, BEq

structure CertificateNode where
  certificateId : CertificateId
  /-- Opaque identity of the complete canonical runtime body, including fields
  such as issuance time and full rule/contract descriptors not modeled here. -/
  canonicalBodyWitness : String
  scope : Scope
  claim : ClaimDescriptor
  evidence : EvidenceBundle
  derivation : Derivation
  deriving DecidableEq, Repr, BEq

namespace CertificateNode

def derivationKind (node : CertificateNode) : DerivationKind :=
  match node.derivation with
  | .contract _ => .contract
  | .composition _ _ => .composition

def assurance (node : CertificateNode) : Assurance :=
  match node.derivation with
  | .contract _ => .runtimeContractAccepted
  | .composition _ _ => .declaredRuntimeRule

def summary (node : CertificateNode) : PremiseSnapshot where
  certificateId := node.certificateId
  derivationKind := node.derivationKind
  assurance := node.assurance
  scope := node.scope
  claim := node.claim
  evidence := node.evidence

def premises (node : CertificateNode) : List PremiseSnapshot :=
  match node.derivation with
  | .contract _ => []
  | .composition _ premises => premises

/-!
Local consistency mirrors the checks on one parsed runtime certificate. Labels
are presentation, while `ClaimKey` is semantic identity. Evidence order remains
significant.
-/
def locallyConsistent (node : CertificateNode) : Bool :=
  match node.derivation with
  | .contract contractClaim =>
      decide (node.claim.key = contractClaim)
  | .composition rule premises =>
      decide (premises ≠ []) &&
      (decide (premises.map (fun premise => premise.claim.key) =
        rule.premiseClaims) &&
      (decide (node.claim.key = rule.conclusion) &&
      (premises.all (fun premise => decide (premise.scope = node.scope)) &&
      decide (node.evidence.toList =
        premises.flatMap (fun premise => premise.evidence.toList)))))

theorem locally_consistent_composition_preserves_ordered_evidence
    (node : CertificateNode)
    (rule : RuleDescriptor)
    (premises : List PremiseSnapshot)
    (hConsistent :
      ({ node with derivation := .composition rule premises }).locallyConsistent = true) :
    node.evidence.toList =
      premises.flatMap (fun premise => premise.evidence.toList) := by
  simp [locallyConsistent] at hConsistent
  exact hConsistent.2.2.2.2

end CertificateNode

namespace PremiseSnapshot

def resolvedIn
    (premise : PremiseSnapshot)
    (bodies : List CertificateNode) : Bool :=
  bodies.any (fun body => decide (body.summary = premise))

theorem resolved_in_iff
    (premise : PremiseSnapshot)
    (bodies : List CertificateNode) :
    premise.resolvedIn bodies = true ↔
      ∃ body ∈ bodies, body.summary = premise := by
  simp [resolvedIn]

end PremiseSnapshot

/-!
The Boolean checker and the logical predicate below deliberately have the same
recursive shape. `seen` contains exactly the strict prefix of bodies already
accepted, so resolving in `seen` is a concrete topological-order witness.
-/
def orderedResolvedAux
    (seen : List CertificateNode) :
    List CertificateNode → Bool
  | [] => true
  | node :: remaining =>
      node.locallyConsistent &&
      (node.premises.all (fun premise => premise.resolvedIn seen) &&
      orderedResolvedAux (seen ++ [node]) remaining)

def DependencyFirstAux
    (seen : List CertificateNode) :
    List CertificateNode → Prop
  | [] => True
  | node :: remaining =>
      node.locallyConsistent = true ∧
      (∀ premise ∈ node.premises,
        ∃ body ∈ seen, body.summary = premise) ∧
      DependencyFirstAux (seen ++ [node]) remaining

theorem ordered_resolved_aux_sound
    (seen remaining : List CertificateNode)
    (hResolved : orderedResolvedAux seen remaining = true) :
    DependencyFirstAux seen remaining := by
  induction remaining generalizing seen with
  | nil =>
      trivial
  | cons node remaining inductionHypothesis =>
      simp only [orderedResolvedAux, Bool.and_eq_true] at hResolved
      refine ⟨hResolved.1, ?_, ?_⟩
      · intro premise hPremise
        have hExact :=
          (List.all_eq_true.mp hResolved.2.1) premise hPremise
        exact (PremiseSnapshot.resolved_in_iff premise seen).mp hExact
      · exact inductionHypothesis (seen ++ [node]) hResolved.2.2

structure Closure where
  rootId : CertificateId
  certificates : List CertificateNode
  deriving DecidableEq, Repr, BEq

namespace Closure

def certificateIds (closure : Closure) : List CertificateId :=
  closure.certificates.map (fun body => body.certificateId)

def rootIsLast (closure : Closure) : Bool :=
  match closure.certificates.getLast? with
  | none => false
  | some root => decide (root.certificateId = closure.rootId)

def uniqueCertificateIds (closure : Closure) : Bool :=
  decide closure.certificateIds.Nodup

def orderedResolved (closure : Closure) : Bool :=
  orderedResolvedAux [] closure.certificates

/-! A redundant whole-list check gives a direct, executable no-dangling gate. -/
def allPremisesResolved (closure : Closure) : Bool :=
  closure.certificates.all (fun node =>
    node.premises.all (fun premise =>
      premise.resolvedIn closure.certificates))

/-!
Reverse traversal is valid because the serialized list is dependency-first and
the root is last. When a reachable parent is visited, its premise IDs become
reachable before the traversal arrives at their earlier bodies.
-/
def reachabilityStep
    (node : CertificateNode)
    (reachable : List CertificateId) : List CertificateId :=
  if node.certificateId ∈ reachable then
    node.premises.map (fun premise => premise.certificateId) ++ reachable
  else
    reachable

def reachableIds (closure : Closure) : List CertificateId :=
  closure.certificates.foldr reachabilityStep [closure.rootId]

/-! Relational reachability prevents the executable worklist from becoming an
uninterpreted bit of bookkeeping: every identifier it produces has an actual
root-to-premise path in the modeled closure. -/
inductive Reachable (closure : Closure) : CertificateId → Prop where
  | root : Reachable closure closure.rootId
  | premise
      {parent : CertificateNode}
      {premise : PremiseSnapshot}
      (parentReachable : Reachable closure parent.certificateId)
      (parentPresent : parent ∈ closure.certificates)
      (premisePresent : premise ∈ parent.premises) :
      Reachable closure premise.certificateId

theorem reachability_step_sound
    (closure : Closure)
    (node : CertificateNode)
    (reachable : List CertificateId)
    (hNode : node ∈ closure.certificates)
    (hReachable : ∀ id ∈ reachable, Reachable closure id) :
    ∀ id ∈ reachabilityStep node reachable, Reachable closure id := by
  intro id hId
  unfold reachabilityStep at hId
  split at hId
  next hParent =>
    simp only [List.mem_append, List.mem_map] at hId
    rcases hId with ⟨premise, hPremise, rfl⟩ | hPreviouslyReachable
    · exact Reachable.premise
        (hReachable node.certificateId hParent)
        hNode
        hPremise
    · exact hReachable id hPreviouslyReachable
  next _ =>
    exact hReachable id hId

theorem reachability_fold_sound
    (closure : Closure)
    (nodes : List CertificateNode)
    (seed : List CertificateId)
    (hNodes : ∀ node ∈ nodes, node ∈ closure.certificates)
    (hSeed : ∀ id ∈ seed, Reachable closure id) :
    ∀ id ∈ nodes.foldr reachabilityStep seed, Reachable closure id := by
  induction nodes generalizing seed with
  | nil =>
      exact hSeed
  | cons node remaining inductionHypothesis =>
      apply reachability_step_sound closure node _
      · exact hNodes node (by simp)
      · apply inductionHypothesis
        · intro candidate hCandidate
          exact hNodes candidate (by simp [hCandidate])
        · exact hSeed

theorem reachable_ids_are_semantically_reachable
    (closure : Closure) :
    ∀ id ∈ closure.reachableIds, Reachable closure id := by
  apply reachability_fold_sound closure closure.certificates [closure.rootId]
  · intro node hNode
    exact hNode
  · intro id hId
    simp only [List.mem_singleton] at hId
    cases hId
    exact Reachable.root

def allCertificatesReachable (closure : Closure) : Bool :=
  closure.certificates.all (fun node =>
    decide (node.certificateId ∈ closure.reachableIds))

def allScopesMatchRoot (closure : Closure) : Bool :=
  match closure.certificates.getLast? with
  | none => false
  | some root =>
      closure.certificates.all (fun node => decide (node.scope = root.scope))

/-!
`wellFormed` is the executable specification used by the smart constructor.
The explicit whole-list resolution and root-scope checks are redundant with
the topological and reachability facts, but make the trust boundary fail closed
and give downstream consumers direct projection theorems.
-/
def wellFormed (closure : Closure) : Bool :=
  closure.rootIsLast &&
  (closure.uniqueCertificateIds &&
  (closure.orderedResolved &&
  (closure.allPremisesResolved &&
  (closure.allCertificatesReachable &&
  closure.allScopesMatchRoot))))

theorem well_formed_implies_root_is_last
    {closure : Closure}
    (hValid : closure.wellFormed = true) :
    closure.rootIsLast = true := by
  simp only [wellFormed, Bool.and_eq_true] at hValid
  exact hValid.1

theorem well_formed_implies_unique_certificate_ids
    {closure : Closure}
    (hValid : closure.wellFormed = true) :
    closure.certificateIds.Nodup := by
  have hUnique : closure.uniqueCertificateIds = true :=
    by
      simp only [wellFormed, Bool.and_eq_true] at hValid
      exact hValid.2.1
  exact of_decide_eq_true hUnique

theorem well_formed_implies_dependency_first
    {closure : Closure}
    (hValid : closure.wellFormed = true) :
    DependencyFirstAux [] closure.certificates := by
  have hOrdered : closure.orderedResolved = true :=
    by
      simp only [wellFormed, Bool.and_eq_true] at hValid
      exact hValid.2.2.1
  exact ordered_resolved_aux_sound [] closure.certificates hOrdered

/-!
This theorem is the acyclicity witness: every edge resolves to an exact body in
the strict serialized prefix. Along any dependency path, list position strictly
decreases, so a dependency cannot return to its starting node.
-/
theorem well_formed_dependencies_are_acyclic_by_order
    {closure : Closure}
    (hValid : closure.wellFormed = true) :
    DependencyFirstAux [] closure.certificates :=
  well_formed_implies_dependency_first hValid

theorem well_formed_implies_no_dangling_premises
    {closure : Closure}
    (hValid : closure.wellFormed = true)
    {node : CertificateNode}
    (hNode : node ∈ closure.certificates)
    {premise : PremiseSnapshot}
    (hPremise : premise ∈ node.premises) :
    ∃ body ∈ closure.certificates, body.summary = premise := by
  have hAll : closure.allPremisesResolved = true :=
    by
      simp only [wellFormed, Bool.and_eq_true] at hValid
      exact hValid.2.2.2.1
  have hNodeResolved := (List.all_eq_true.mp hAll) node hNode
  have hPremiseResolved :=
    (List.all_eq_true.mp hNodeResolved) premise hPremise
  exact
    (PremiseSnapshot.resolved_in_iff premise closure.certificates).mp
      hPremiseResolved

theorem well_formed_premise_evidence_matches_body
    {closure : Closure}
    (hValid : closure.wellFormed = true)
    {node : CertificateNode}
    (hNode : node ∈ closure.certificates)
    {premise : PremiseSnapshot}
    (hPremise : premise ∈ node.premises) :
    ∃ body ∈ closure.certificates,
      body.summary = premise ∧ body.evidence = premise.evidence := by
  rcases well_formed_implies_no_dangling_premises
      hValid hNode hPremise with ⟨body, hBody, hSummary⟩
  refine ⟨body, hBody, hSummary, ?_⟩
  simpa [CertificateNode.summary] using
    congrArg PremiseSnapshot.evidence hSummary

theorem well_formed_implies_every_certificate_in_reachable_ids
    {closure : Closure}
    (hValid : closure.wellFormed = true)
    {node : CertificateNode}
    (hNode : node ∈ closure.certificates) :
    node.certificateId ∈ closure.reachableIds := by
  have hReachable : closure.allCertificatesReachable = true :=
    by
      simp only [wellFormed, Bool.and_eq_true] at hValid
      exact hValid.2.2.2.2.1
  have hNodeReachable := (List.all_eq_true.mp hReachable) node hNode
  exact of_decide_eq_true hNodeReachable

theorem well_formed_implies_every_certificate_reachable
    {closure : Closure}
    (hValid : closure.wellFormed = true)
    {node : CertificateNode}
    (hNode : node ∈ closure.certificates) :
    Reachable closure node.certificateId :=
  reachable_ids_are_semantically_reachable closure
    node.certificateId
    (well_formed_implies_every_certificate_in_reachable_ids hValid hNode)

theorem well_formed_implies_no_unreachable_certificates
    {closure : Closure}
    (hValid : closure.wellFormed = true) :
    ∀ node ∈ closure.certificates,
      Reachable closure node.certificateId := by
  intro node hNode
  exact well_formed_implies_every_certificate_reachable hValid hNode

theorem well_formed_implies_root_scope
    {closure : Closure}
    (hValid : closure.wellFormed = true) :
    ∃ root,
      closure.certificates.getLast? = some root ∧
      root.certificateId = closure.rootId ∧
      ∀ node ∈ closure.certificates, node.scope = root.scope := by
  have hLast := well_formed_implies_root_is_last hValid
  have hScopes : closure.allScopesMatchRoot = true :=
    by
      simp only [wellFormed, Bool.and_eq_true] at hValid
      exact hValid.2.2.2.2.2
  cases hGetLast : closure.certificates.getLast? with
  | none =>
      simp [rootIsLast, hGetLast] at hLast
  | some root =>
      have hRootId : root.certificateId = closure.rootId := by
        have hDecide : decide (root.certificateId = closure.rootId) = true := by
          simpa [rootIsLast, hGetLast] using hLast
        exact of_decide_eq_true hDecide
      refine ⟨root, rfl, hRootId, ?_⟩
      intro node hNode
      have hAllScopes :
          closure.certificates.all
            (fun candidate => decide (candidate.scope = root.scope)) = true := by
        simpa [allScopesMatchRoot, hGetLast] using hScopes
      exact of_decide_eq_true ((List.all_eq_true.mp hAllScopes) node hNode)

theorem well_formed_implies_exact_root
    {closure : Closure}
    (hValid : closure.wellFormed = true) :
    ∃ root,
      closure.certificates.getLast? = some root ∧
      root.certificateId = closure.rootId := by
  rcases well_formed_implies_root_scope hValid with
    ⟨root, hLast, hRootId, _hScopes⟩
  exact ⟨root, hLast, hRootId⟩

structure Validated where
  raw : Closure
  valid : raw.wellFormed = true

def validate (closure : Closure) : Option Validated :=
  if h : closure.wellFormed = true then
    some ⟨closure, h⟩
  else
    none

theorem validate_some_implies_well_formed
    {closure : Closure}
    {validated : Validated}
    (hResult : validate closure = some validated) :
    closure.wellFormed = true := by
  unfold validate at hResult
  split at hResult
  next hValid => exact hValid
  next hInvalid => contradiction

end Closure

/-! Stable merge rejects an identifier collision with unequal full bodies. -/
def mergeCertificateBodies? :
    List CertificateNode →
    List CertificateNode →
    Option (List CertificateNode)
  | accumulated, [] => some accumulated
  | accumulated, body :: remaining =>
      match accumulated.find? (fun candidate =>
          candidate.certificateId = body.certificateId) with
      | none =>
          mergeCertificateBodies? (accumulated ++ [body]) remaining
      | some existing =>
          if existing = body then
            mergeCertificateBodies? accumulated remaining
          else
            none

def mergeValidatedClosures? :
    List CertificateNode →
    List Closure.Validated →
    Option (List CertificateNode)
  | accumulated, [] => some accumulated
  | accumulated, closure :: remaining => do
      let merged ←
        mergeCertificateBodies? accumulated closure.raw.certificates
      mergeValidatedClosures? merged remaining

/-!
Composition is intentionally final-validation based. Even if merging or root
construction changes later, this function's return type prevents an unchecked
closure from escaping.
-/
def composeChecked?
    (newRoot : CertificateNode)
    (inputs : List Closure.Validated) :
    Option Closure.Validated :=
  if _hRoots :
      inputs ≠ [] ∧
      inputs.map (fun closure =>
        closure.raw.certificates.getLast?.map CertificateNode.summary) =
      newRoot.premises.map some then
    do
      let merged ← mergeValidatedClosures? [] inputs
      Closure.validate {
        rootId := newRoot.certificateId
        certificates := merged ++ [newRoot]
      }
  else
    none

theorem compose_checked_some_is_well_formed
    {newRoot : CertificateNode}
    {inputs : List Closure.Validated}
    {output : Closure.Validated}
    (_hResult : composeChecked? newRoot inputs = some output) :
    output.raw.wellFormed = true :=
  output.valid

theorem compose_checked_some_uses_each_input_root
    {newRoot : CertificateNode}
    {inputs : List Closure.Validated}
    {output : Closure.Validated}
    (hResult : composeChecked? newRoot inputs = some output) :
    inputs ≠ [] ∧
    inputs.map (fun closure =>
      closure.raw.certificates.getLast?.map CertificateNode.summary) =
    newRoot.premises.map some := by
  unfold composeChecked? at hResult
  split at hResult
  next hRoots => exact hRoots
  next _ => simp at hResult

/-! Finite executable examples. -/
namespace Examples

def scope : Scope where
  repository := "riddledc/integrations"
  revision := "semantic-closure-example"
  environment := "local"
  target := "semantic-certificate"
  proofAttempt := "closure-example"

def evidence (name : String) : EvidenceBundle :=
  EvidenceBundle.singleton {
    receiptId := "receipt:" ++ name
    artifactDigest := "sha256:" ++ name
    role := name
  }

def claimKey (name : String) : ClaimKey where
  claimId := "claim." ++ name
  claimVersion := "v1"
  canonicalParameters := "{}"

def claim (name : String) : ClaimDescriptor where
  key := claimKey name
  label := name

def atomicA : CertificateNode where
  certificateId := "certificate-a"
  canonicalBodyWitness := "body-a"
  scope := scope
  claim := claim "a"
  evidence := evidence "a"
  derivation := .contract (claimKey "a")

def atomicB : CertificateNode where
  certificateId := "certificate-b"
  canonicalBodyWitness := "body-b"
  scope := scope
  claim := claim "b"
  evidence := evidence "b"
  derivation := .contract (claimKey "b")

def unaryNode
    (certificateId name : String)
    (premise : CertificateNode) : CertificateNode where
  certificateId := certificateId
  canonicalBodyWitness := "body-" ++ name
  scope := scope
  claim := claim name
  evidence := premise.evidence
  derivation := .composition {
    ruleId := "rule." ++ name
    ruleVersion := "v1"
    premiseClaims := [premise.claim.key]
    conclusion := claimKey name
  } [premise.summary]

def leftFromA : CertificateNode :=
  unaryNode "certificate-left" "left" atomicA

def rightFromA : CertificateNode :=
  unaryNode "certificate-right" "right" atomicA

def joinedRoot : CertificateNode where
  certificateId := "certificate-root"
  canonicalBodyWitness := "body-root"
  scope := scope
  claim := claim "joined"
  evidence := leftFromA.evidence.append rightFromA.evidence
  derivation := .composition {
    ruleId := "rule.joined"
    ruleVersion := "v1"
    premiseClaims := [leftFromA.claim.key, rightFromA.claim.key]
    conclusion := claimKey "joined"
  } [leftFromA.summary, rightFromA.summary]

def atomicClosure : Closure where
  rootId := atomicA.certificateId
  certificates := [atomicA]

def leftClosure : Closure where
  rootId := leftFromA.certificateId
  certificates := [atomicA, leftFromA]

def rightClosure : Closure where
  rootId := rightFromA.certificateId
  certificates := [atomicA, rightFromA]

theorem atomic_closure_is_valid : atomicClosure.wellFormed = true := by
  native_decide

theorem left_closure_is_valid : leftClosure.wellFormed = true := by
  native_decide

theorem right_closure_is_valid : rightClosure.wellFormed = true := by
  native_decide

def validatedLeft : Closure.Validated :=
  ⟨leftClosure, left_closure_is_valid⟩

def validatedRight : Closure.Validated :=
  ⟨rightClosure, right_closure_is_valid⟩

def sharedDescendantCompositionSucceeded : Bool :=
  match composeChecked? joinedRoot [validatedLeft, validatedRight] with
  | some _ => true
  | none => false

def sharedDescendantCompositionIds : List CertificateId :=
  match composeChecked? joinedRoot [validatedLeft, validatedRight] with
  | some closure => closure.raw.certificateIds
  | none => []

theorem shared_descendant_is_deduplicated_and_composes :
    sharedDescendantCompositionSucceeded = true := by
  native_decide

theorem shared_descendant_occurs_once :
    sharedDescendantCompositionIds =
      [atomicA.certificateId,
        leftFromA.certificateId,
        rightFromA.certificateId,
        joinedRoot.certificateId] := by
  native_decide

def emptyInputCompositionSucceeded : Bool :=
  match composeChecked? atomicA [] with
  | some _ => true
  | none => false

theorem composition_requires_at_least_one_input_root :
    emptyInputCompositionSucceeded = false := by
  native_decide

def skippedInputRootCompositionSucceeded : Bool :=
  match composeChecked? joinedRoot [validatedLeft] with
  | some _ => true
  | none => false

theorem composition_must_use_each_input_root_in_order :
    skippedInputRootCompositionSucceeded = false := by
  native_decide

def atomicAWithConflictingBody : CertificateNode :=
  { atomicA with canonicalBodyWitness := "different-canonical-body" }

def unequalSharedBodyMergeSucceeded : Bool :=
  match mergeCertificateBodies? [atomicA] [atomicAWithConflictingBody] with
  | some _ => true
  | none => false

theorem equal_id_with_unequal_complete_body_is_rejected :
    unequalSharedBodyMergeSucceeded = false := by
  native_decide

def missingTransitiveBody : Closure where
  rootId := leftFromA.certificateId
  certificates := [leftFromA]

theorem missing_transitive_body_is_rejected :
    missingTransitiveBody.wellFormed = false := by
  native_decide

def duplicateCertificate : Closure where
  rootId := leftFromA.certificateId
  certificates := [atomicA, atomicA, leftFromA]

theorem duplicate_certificate_id_is_rejected :
    duplicateCertificate.wellFormed = false := by
  native_decide

def rootAboveForwardReference : CertificateNode :=
  unaryNode "certificate-forward-root" "forward-root" leftFromA

def forwardReference : Closure where
  rootId := rootAboveForwardReference.certificateId
  certificates := [leftFromA, atomicA, rootAboveForwardReference]

theorem forward_reference_is_rejected :
    forwardReference.wellFormed = false := by
  native_decide

def unrelatedExtra : Closure where
  rootId := leftFromA.certificateId
  certificates := [atomicA, atomicB, leftFromA]

theorem unrelated_extra_certificate_is_rejected :
    unrelatedExtra.wellFormed = false := by
  native_decide

def mismatchedSnapshot : PremiseSnapshot :=
  { atomicA.summary with
    claim := claim "b" }

def snapshotMismatchRoot : CertificateNode where
  certificateId := "certificate-snapshot-mismatch"
  canonicalBodyWitness := "body-snapshot-mismatch"
  scope := scope
  claim := claim "snapshot-mismatch"
  evidence := mismatchedSnapshot.evidence
  derivation := .composition {
    ruleId := "rule.snapshot-mismatch"
    ruleVersion := "v1"
    premiseClaims := [mismatchedSnapshot.claim.key]
    conclusion := claimKey "snapshot-mismatch"
  } [mismatchedSnapshot]

def snapshotMismatch : Closure where
  rootId := snapshotMismatchRoot.certificateId
  certificates := [atomicA, snapshotMismatchRoot]

theorem snapshot_body_mismatch_is_rejected :
    snapshotMismatch.wellFormed = false := by
  native_decide

end Examples

end RiddleProofKernel.SemanticClosure
