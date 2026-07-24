import Std
import RiddleProofKernel.ApplicationProjection

namespace RiddleProofKernel.ProofGuidedWebChange

open SemanticComposition SemanticClosure
open ApplicationProjection

/-!
`ProofGuidedWebChange` models the small controller and decision algebra for a
proof-guided browser change.

The trust boundary is deliberately explicit.  Lean does not resolve a
candidate reference, inspect a browser, authenticate a deployment, recompute a
profile result, verify a signature, or prove collision resistance.  The
runtime must do those things.  This file starts with:

* a pinned change contract configured on a controller;
* repository, revision, environment, and target scope supplied by an
  independently configured resolver;
* a subject identity derived by the controller from that exact scope and the
  pinned contract; and
* one runtime-supplied outcome for each of the four required checkpoints.

The theorems prove only that the controller cannot silently swap the pinned
contract while preparing a repair, that an attempt is bound to the resolver's
exact scope and the contract-derived subject, that a result for one subject
cannot be reused for another, and that the client-facing disposition follows
the intended complete-vector algebra.
-/

structure PinnedChangeContract where
  specification : SpecificationRef
  changeRequestDigest : String
  profileSuiteDigest : String
  protocolVersion : String
  deriving DecidableEq, Repr, BEq

/-!
Ordinary callers supply only an opaque candidate reference.  They do not
supply a replacement specification, profile suite, or authority.
-/
structure CandidateRef where
  opaqueRef : String
  deriving DecidableEq, Repr, BEq

/-!
The resolver may identify only the outside-world scope to inspect.  It cannot
supply a subject identity, profile-suite authority, or replacement contract.
Lean does not establish that these strings describe the outside world.
-/
structure ResolvedScope where
  repository : String
  candidateRevision : String
  environment : String
  targetIdentity : String
  deriving DecidableEq, Repr, BEq

/-!
`ResolvedSubject` combines the exact resolver scope with a `SubjectRef` derived
by the configured controller from that scope and the pinned contract.  It is
therefore not resolver output.
-/
structure ResolvedSubject where
  subject : SubjectRef
  scope : ResolvedScope
  deriving DecidableEq, Repr, BEq

/-!
The unhashed authority material retains the exact pinned contract and resolved
subject.  A runtime may content-address this material, but equality of a
runtime digest additionally relies on canonical encoding and collision
resistance outside Lean.
-/
structure AuthorityMaterial where
  contract : PinnedChangeContract
  subject : ResolvedSubject
  deriving DecidableEq, Repr, BEq

structure AttemptAuthority where
  material : AuthorityMaterial
  expectedRoot : ClaimKey
  deriving DecidableEq, Repr, BEq

structure PreparedAttempt where
  candidateRef : CandidateRef
  resolvedScope : ResolvedScope
  resolvedSubject : ResolvedSubject
  authority : AttemptAuthority
  deriving DecidableEq, Repr, BEq

namespace PreparedAttempt

def contract (attempt : PreparedAttempt) : PinnedChangeContract :=
  attempt.authority.material.contract

end PreparedAttempt

/-!
The scope resolver, subject construction, and expected-root construction are
controller configuration, not ordinary run input.  `subjectFor` represents the
deterministic runtime derivation of a `SubjectRef` from the pinned contract and
exact resolver scope.  `expectedRootFor` represents the deterministic runtime
construction of the exact success root from the unhashed authority material.
-/
structure Controller where
  pinnedContract : PinnedChangeContract
  resolveScope : CandidateRef → Option ResolvedScope
  subjectFor : PinnedChangeContract → ResolvedScope → SubjectRef
  expectedRootFor : AuthorityMaterial → ClaimKey

namespace Controller

def deriveSubject
    (controller : Controller)
    (scope : ResolvedScope) : ResolvedSubject where
  subject := controller.subjectFor controller.pinnedContract scope
  scope := scope

def authorityMaterial
    (controller : Controller)
    (scope : ResolvedScope) : AuthorityMaterial where
  contract := controller.pinnedContract
  subject := controller.deriveSubject scope

def deriveAuthority
    (controller : Controller)
    (scope : ResolvedScope) : AttemptAuthority :=
  let material := controller.authorityMaterial scope
  {
    material := material
    expectedRoot := controller.expectedRootFor material
  }

def prepareAttempt
    (controller : Controller)
    (candidateRef : CandidateRef) : Option PreparedAttempt :=
  match controller.resolveScope candidateRef with
  | none => none
  | some scope =>
      some {
        candidateRef := candidateRef
        resolvedScope := scope
        resolvedSubject := controller.deriveSubject scope
        authority := controller.deriveAuthority scope
      }

/-!
A repair is another attempt prepared by the same pinned controller.  The old
attempt is accepted only to make that lifecycle relationship explicit; it
cannot contribute a replacement contract or authority.
-/
def prepareRepair
    (controller : Controller)
    (_previous : PreparedAttempt)
    (nextCandidateRef : CandidateRef) : Option PreparedAttempt :=
  controller.prepareAttempt nextCandidateRef

/-!
An unusable one-shot result is retried by preparing another candidate through
the same pinned controller.  The runtime must supply a distinct target while
retaining the exact source revision; Lean keeps those as explicit premises.
This definition prepares a new attempt; one-shot consumption of the previous
attempt remains a runtime obligation.
-/
def prepareFreshAttempt
    (controller : Controller)
    (_previous : PreparedAttempt)
    (nextCandidateRef : CandidateRef) : Option PreparedAttempt :=
  controller.prepareAttempt nextCandidateRef

theorem prepared_attempt_uses_exact_resolver_scope_and_contract_derived_subject_and_authority
    {controller : Controller}
    {candidateRef : CandidateRef}
    {attempt : PreparedAttempt}
    (hPrepared :
      controller.prepareAttempt candidateRef = some attempt) :
    controller.resolveScope candidateRef = some attempt.resolvedScope ∧
      attempt.candidateRef = candidateRef ∧
      attempt.resolvedSubject =
        controller.deriveSubject attempt.resolvedScope ∧
      attempt.authority =
        controller.deriveAuthority attempt.resolvedScope := by
  unfold prepareAttempt at hPrepared
  split at hPrepared
  · contradiction
  · next scope hResolved =>
      simp only [Option.some.injEq] at hPrepared
      subst attempt
      simp [hResolved]

theorem prepared_attempt_uses_pinned_contract
    {controller : Controller}
    {candidateRef : CandidateRef}
    {attempt : PreparedAttempt}
    (hPrepared :
      controller.prepareAttempt candidateRef = some attempt) :
    attempt.contract = controller.pinnedContract := by
  have hAuthority :=
    (prepared_attempt_uses_exact_resolver_scope_and_contract_derived_subject_and_authority
      hPrepared).2.2.2
  simp [PreparedAttempt.contract, hAuthority, deriveAuthority,
    authorityMaterial, deriveSubject]

theorem subject_deterministically_depends_on_contract_and_scope
    (controller : Controller)
    (scope : ResolvedScope) :
    controller.deriveSubject scope =
      {
        subject := controller.subjectFor controller.pinnedContract scope
        scope := scope
      } := by
  rfl

theorem authority_deterministically_depends_on_contract_and_scope
    (controller : Controller)
    (scope : ResolvedScope) :
    (controller.deriveAuthority scope).material =
      {
        contract := controller.pinnedContract
        subject := controller.deriveSubject scope
      } ∧
    (controller.deriveAuthority scope).expectedRoot =
      controller.expectedRootFor {
        contract := controller.pinnedContract
        subject := controller.deriveSubject scope
      } := by
  simp [deriveAuthority, authorityMaterial]

theorem changed_subject_cannot_reuse_unhashed_authority
    {controller : Controller}
    {oldScope newScope : ResolvedScope}
    (hChanged :
      controller.deriveSubject oldScope ≠
        controller.deriveSubject newScope) :
    controller.deriveAuthority oldScope ≠
      controller.deriveAuthority newScope := by
  intro hEqual
  apply hChanged
  exact congrArg (fun authority => authority.material.subject) hEqual

/-!
If a runtime exposes only an encoded authority token, the corresponding
non-reuse claim needs an explicit no-collision premise for that encoding.
-/
theorem changed_subject_cannot_reuse_encoded_authority
    {controller : Controller}
    {oldScope newScope : ResolvedScope}
    (encode : AttemptAuthority → String)
    (hNoCollision : Function.Injective encode)
    (hChanged :
      controller.deriveSubject oldScope ≠
        controller.deriveSubject newScope) :
    encode (controller.deriveAuthority oldScope) ≠
      encode (controller.deriveAuthority newScope) := by
  intro hEncodedEqual
  exact changed_subject_cannot_reuse_unhashed_authority hChanged
    (hNoCollision hEncodedEqual)

structure AttemptResult where
  authority : AttemptAuthority
  resultId : String
  deriving DecidableEq, Repr, BEq

def ResultBelongsTo
    (result : AttemptResult)
    (attempt : PreparedAttempt) : Prop :=
  result.authority = attempt.authority

theorem changed_subject_cannot_reuse_attempt_result
    {controller : Controller}
    {oldCandidateRef newCandidateRef : CandidateRef}
    {oldAttempt newAttempt : PreparedAttempt}
    {result : AttemptResult}
    (hOldPrepared :
      controller.prepareAttempt oldCandidateRef = some oldAttempt)
    (hNewPrepared :
      controller.prepareAttempt newCandidateRef = some newAttempt)
    (hChanged :
      oldAttempt.resolvedSubject ≠ newAttempt.resolvedSubject)
    (hOldResult : ResultBelongsTo result oldAttempt) :
    ¬ ResultBelongsTo result newAttempt := by
  have hOldPreparedParts :=
    prepared_attempt_uses_exact_resolver_scope_and_contract_derived_subject_and_authority
      hOldPrepared
  have hNewPreparedParts :=
    prepared_attempt_uses_exact_resolver_scope_and_contract_derived_subject_and_authority
      hNewPrepared
  have hDerivedChanged :
      controller.deriveSubject oldAttempt.resolvedScope ≠
        controller.deriveSubject newAttempt.resolvedScope := by
    intro hEqual
    apply hChanged
    exact hOldPreparedParts.2.2.1.trans
      (hEqual.trans hNewPreparedParts.2.2.1.symm)
  intro hNewResult
  apply changed_subject_cannot_reuse_unhashed_authority
    (controller := controller) hDerivedChanged
  rw [← hOldPreparedParts.2.2.2, ← hNewPreparedParts.2.2.2]
  exact hOldResult.symm.trans hNewResult

theorem repair_preserves_pinned_contract
    {controller : Controller}
    {oldCandidateRef nextCandidateRef : CandidateRef}
    {oldAttempt nextAttempt : PreparedAttempt}
    (hOldPrepared :
      controller.prepareAttempt oldCandidateRef = some oldAttempt)
    (hRepairPrepared :
      controller.prepareRepair oldAttempt nextCandidateRef = some nextAttempt) :
    nextAttempt.contract = oldAttempt.contract := by
  have hOldContract := prepared_attempt_uses_pinned_contract hOldPrepared
  have hNextPrepared :
      controller.prepareAttempt nextCandidateRef = some nextAttempt := by
    exact hRepairPrepared
  have hNextContract := prepared_attempt_uses_pinned_contract hNextPrepared
  exact hNextContract.trans hOldContract.symm

theorem repair_changes_subject_and_authority_not_contract
    {controller : Controller}
    {oldCandidateRef nextCandidateRef : CandidateRef}
    {oldAttempt nextAttempt : PreparedAttempt}
    (hOldPrepared :
      controller.prepareAttempt oldCandidateRef = some oldAttempt)
    (hRepairPrepared :
      controller.prepareRepair oldAttempt nextCandidateRef = some nextAttempt)
    (hChanged :
      oldAttempt.resolvedSubject ≠ nextAttempt.resolvedSubject) :
    nextAttempt.contract = oldAttempt.contract ∧
      nextAttempt.resolvedSubject ≠ oldAttempt.resolvedSubject ∧
      nextAttempt.authority ≠ oldAttempt.authority := by
  have hNextPrepared :
      controller.prepareAttempt nextCandidateRef = some nextAttempt := by
    exact hRepairPrepared
  refine ⟨repair_preserves_pinned_contract hOldPrepared hRepairPrepared,
    Ne.symm hChanged, ?_⟩
  have hOldPreparedParts :=
    prepared_attempt_uses_exact_resolver_scope_and_contract_derived_subject_and_authority
      hOldPrepared
  have hNextPreparedParts :=
    prepared_attempt_uses_exact_resolver_scope_and_contract_derived_subject_and_authority
      hNextPrepared
  have hDerivedChanged :
      controller.deriveSubject oldAttempt.resolvedScope ≠
        controller.deriveSubject nextAttempt.resolvedScope := by
    intro hEqual
    apply hChanged
    exact hOldPreparedParts.2.2.1.trans
      (hEqual.trans hNextPreparedParts.2.2.1.symm)
  rw [hOldPreparedParts.2.2.2, hNextPreparedParts.2.2.2]
  exact Ne.symm
    (changed_subject_cannot_reuse_unhashed_authority hDerivedChanged)

theorem fresh_attempt_preserves_revision_and_changes_subject_and_authority
    {controller : Controller}
    {oldCandidateRef nextCandidateRef : CandidateRef}
    {oldAttempt nextAttempt : PreparedAttempt}
    (hOldPrepared :
      controller.prepareAttempt oldCandidateRef = some oldAttempt)
    (hFreshPrepared :
      controller.prepareFreshAttempt oldAttempt nextCandidateRef =
        some nextAttempt)
    (hSameRevision :
      nextAttempt.resolvedScope.candidateRevision =
        oldAttempt.resolvedScope.candidateRevision)
    (hDifferentTarget :
      nextAttempt.resolvedScope.targetIdentity ≠
        oldAttempt.resolvedScope.targetIdentity) :
    nextAttempt.contract = oldAttempt.contract ∧
      nextAttempt.resolvedScope.candidateRevision =
        oldAttempt.resolvedScope.candidateRevision ∧
      nextAttempt.resolvedSubject ≠ oldAttempt.resolvedSubject ∧
      nextAttempt.authority ≠ oldAttempt.authority := by
  have hNextPrepared :
      controller.prepareAttempt nextCandidateRef = some nextAttempt := by
    exact hFreshPrepared
  have hOldPreparedParts :=
    prepared_attempt_uses_exact_resolver_scope_and_contract_derived_subject_and_authority
      hOldPrepared
  have hNextPreparedParts :=
    prepared_attempt_uses_exact_resolver_scope_and_contract_derived_subject_and_authority
      hNextPrepared
  have hOldSubjectScope :
      oldAttempt.resolvedSubject.scope = oldAttempt.resolvedScope := by
    rw [hOldPreparedParts.2.2.1]
    rfl
  have hNextSubjectScope :
      nextAttempt.resolvedSubject.scope = nextAttempt.resolvedScope := by
    rw [hNextPreparedParts.2.2.1]
    rfl
  have hSubjectChanged :
      oldAttempt.resolvedSubject ≠ nextAttempt.resolvedSubject := by
    intro hSubjectsEqual
    apply hDifferentTarget
    have hScopesEqual :
        oldAttempt.resolvedScope = nextAttempt.resolvedScope := by
      calc
        oldAttempt.resolvedScope =
            oldAttempt.resolvedSubject.scope := hOldSubjectScope.symm
        _ = nextAttempt.resolvedSubject.scope :=
          congrArg ResolvedSubject.scope hSubjectsEqual
        _ = nextAttempt.resolvedScope := hNextSubjectScope
    exact (congrArg ResolvedScope.targetIdentity hScopesEqual).symm
  have hAsRepair :
      controller.prepareRepair oldAttempt nextCandidateRef =
        some nextAttempt := by
    exact hFreshPrepared
  have hRepairFacts :=
    repair_changes_subject_and_authority_not_contract
      hOldPrepared hAsRepair hSubjectChanged
  exact ⟨hRepairFacts.1, hSameRevision, hRepairFacts.2.1,
    hRepairFacts.2.2⟩

theorem fresh_attempt_cannot_reuse_previous_result
    {controller : Controller}
    {oldCandidateRef nextCandidateRef : CandidateRef}
    {oldAttempt nextAttempt : PreparedAttempt}
    {result : AttemptResult}
    (hOldPrepared :
      controller.prepareAttempt oldCandidateRef = some oldAttempt)
    (hFreshPrepared :
      controller.prepareFreshAttempt oldAttempt nextCandidateRef =
        some nextAttempt)
    (hSameRevision :
      nextAttempt.resolvedScope.candidateRevision =
        oldAttempt.resolvedScope.candidateRevision)
    (hDifferentTarget :
      nextAttempt.resolvedScope.targetIdentity ≠
        oldAttempt.resolvedScope.targetIdentity)
    (hOldResult : ResultBelongsTo result oldAttempt) :
    ¬ ResultBelongsTo result nextAttempt := by
  have hFacts :=
    fresh_attempt_preserves_revision_and_changes_subject_and_authority
      hOldPrepared hFreshPrepared hSameRevision hDifferentTarget
  have hNextPrepared :
      controller.prepareAttempt nextCandidateRef = some nextAttempt := by
    exact hFreshPrepared
  exact changed_subject_cannot_reuse_attempt_result
    hOldPrepared hNextPrepared (Ne.symm hFacts.2.2.1) hOldResult

end Controller

/-!
The browser-transition report is complete by construction: it contains one
outcome for the before, action/immediate, reload, and fresh-context
checkpoints.  `proofInsufficient` and `environmentBlocked` are unresolved
rather than substantive claims that the candidate violates the contract.
-/
inductive CheckOutcome where
  | passed
  | productRegression
  | proofInsufficient
  | environmentBlocked
  deriving DecidableEq, Repr, BEq

structure CompleteCheckVector where
  before : CheckOutcome
  action : CheckOutcome
  reload : CheckOutcome
  freshContext : CheckOutcome
  deriving DecidableEq, Repr, BEq

def CheckOutcome.isUnresolved : CheckOutcome → Bool
  | .proofInsufficient
  | .environmentBlocked => true
  | .passed
  | .productRegression => false

def CheckOutcome.isSubstantiveFailure : CheckOutcome → Bool
  | .productRegression => true
  | .passed
  | .proofInsufficient
  | .environmentBlocked => false

namespace CompleteCheckVector

def allPassed (checks : CompleteCheckVector) : Bool :=
  decide (checks.before = .passed) &&
    decide (checks.action = .passed) &&
    decide (checks.reload = .passed) &&
    decide (checks.freshContext = .passed)

def hasUnresolved (checks : CompleteCheckVector) : Bool :=
  checks.before.isUnresolved ||
    checks.action.isUnresolved ||
    checks.reload.isUnresolved ||
    checks.freshContext.isUnresolved

def hasSubstantiveFailure (checks : CompleteCheckVector) : Bool :=
  checks.before.isSubstantiveFailure ||
    checks.action.isSubstantiveFailure ||
    checks.reload.isSubstantiveFailure ||
    checks.freshContext.isSubstantiveFailure

def establishesDurableSuccess (checks : CompleteCheckVector) : Bool :=
  checks.allPassed

theorem durable_success_iff_every_checkpoint_passed
    (checks : CompleteCheckVector) :
    checks.establishesDurableSuccess = true ↔
      checks.before = .passed ∧
      checks.action = .passed ∧
      checks.reload = .passed ∧
      checks.freshContext = .passed := by
  simp [establishesDurableSuccess, allPassed, and_assoc]

theorem any_nonpassing_checkpoint_blocks_durable_success
    {checks : CompleteCheckVector}
    (hNonpassing :
      checks.before ≠ .passed ∨
      checks.action ≠ .passed ∨
      checks.reload ≠ .passed ∨
      checks.freshContext ≠ .passed) :
    checks.establishesDurableSuccess = false := by
  cases hValue : checks.establishesDurableSuccess with
  | false => rfl
  | true =>
      have hPassed :=
        (durable_success_iff_every_checkpoint_passed checks).mp hValue
      exfalso
      rcases hNonpassing with hBefore | hAction | hReload | hFresh
      · exact hBefore hPassed.1
      · exact hAction hPassed.2.1
      · exact hReload hPassed.2.2.1
      · exact hFresh hPassed.2.2.2

theorem substantive_failure_excludes_all_passed
    {checks : CompleteCheckVector}
    (hFailure : checks.hasSubstantiveFailure = true) :
    checks.allPassed = false := by
  cases checks with
  | mk before action reload freshContext =>
      cases before <;>
      cases action <;>
      cases reload <;>
      cases freshContext <;>
      simp_all [hasSubstantiveFailure, allPassed,
        CheckOutcome.isSubstantiveFailure]

end CompleteCheckVector

inductive Disposition where
  | conforms
  | doesNotConform
  | couldNotCheck
  deriving DecidableEq, Repr, BEq

/-!
Unresolved evidence is tested first.  Therefore a report containing both a
substantive product regression and an unresolved checkpoint remains
`couldNotCheck`: the missing/blocked observation is not silently treated as a
verified violation.
-/
def decideDisposition (checks : CompleteCheckVector) : Disposition :=
  if checks.hasUnresolved then
    .couldNotCheck
  else if checks.establishesDurableSuccess then
    .conforms
  else if checks.hasSubstantiveFailure then
    .doesNotConform
  else
    .couldNotCheck

theorem conforms_iff_complete_all_pass
    (checks : CompleteCheckVector) :
    decideDisposition checks = .conforms ↔
      checks.before = .passed ∧
      checks.action = .passed ∧
      checks.reload = .passed ∧
      checks.freshContext = .passed := by
  constructor
  · intro hConforms
    by_cases hUnresolved : checks.hasUnresolved = true
    · simp [decideDisposition, hUnresolved] at hConforms
    · have hUnresolvedFalse : checks.hasUnresolved = false := by
        cases hValue : checks.hasUnresolved <;> simp_all
      simp only [decideDisposition, hUnresolvedFalse, Bool.false_eq_true,
        ↓reduceIte] at hConforms
      by_cases hSuccess : checks.establishesDurableSuccess = true
      · exact
          (CompleteCheckVector.durable_success_iff_every_checkpoint_passed
            checks).mp hSuccess
      · by_cases hFailure : checks.hasSubstantiveFailure = true
        · simp [hSuccess, hFailure] at hConforms
        · have hFailureFalse :
              checks.hasSubstantiveFailure = false := by
            cases hValue : checks.hasSubstantiveFailure <;> simp_all
          simp [hSuccess, hFailureFalse] at hConforms
  · rintro ⟨hBefore, hAction, hReload, hFresh⟩
    cases checks with
    | mk before action reload freshContext =>
        simp_all [decideDisposition, CompleteCheckVector.hasUnresolved,
          CheckOutcome.isUnresolved,
          CompleteCheckVector.establishesDurableSuccess,
          CompleteCheckVector.allPassed]

theorem unresolved_dominates_substantive_failure
    {checks : CompleteCheckVector}
    (hUnresolved : checks.hasUnresolved = true) :
    decideDisposition checks = .couldNotCheck := by
  simp [decideDisposition, hUnresolved]

theorem complete_resolved_substantive_failure_is_nonconforming
    {checks : CompleteCheckVector}
    (hResolved : checks.hasUnresolved = false)
    (hFailure : checks.hasSubstantiveFailure = true) :
    decideDisposition checks = .doesNotConform := by
  have hNotAllPassed :
      checks.establishesDurableSuccess = false := by
    exact CompleteCheckVector.substantive_failure_excludes_all_passed hFailure
  simp [decideDisposition, hResolved, hNotAllPassed, hFailure]

theorem mixed_failure_and_unresolved_is_not_nonconforming
    {checks : CompleteCheckVector}
    (hUnresolved : checks.hasUnresolved = true)
    (_hFailure : checks.hasSubstantiveFailure = true) :
    decideDisposition checks ≠ .doesNotConform := by
  rw [unresolved_dominates_substantive_failure hUnresolved]
  decide

end RiddleProofKernel.ProofGuidedWebChange
