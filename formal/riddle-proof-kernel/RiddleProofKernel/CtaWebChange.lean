import Std
import RiddleProofKernel.ProofGuidedWebChange

namespace RiddleProofKernel.CtaWebChange

open ApplicationProjection
open ProofGuidedWebChange

/-!
`CtaWebChange` is the first concrete client of the generic application
projection for a static proof-guided web change.  It pins exactly four
application requirements.  The requirement IDs correspond to the public CTA
contract; labels and guidance are presentation metadata.

Lean does not inspect the CTA, routes, layout, console, screenshots, source
diff, browser capture, signatures, or hashes.  Those are runtime premises.
This file proves only that a conforming application projection using this
pinned requirement list has exact nonduplicated coverage and that every
reported requirement passed.
-/

def ctaRequirementIds : List String := [
  "primary-cta-correct",
  "routes-preserved",
  "responsive-layout-healthy",
  "runtime-healthy"
]

def ctaRequirements : List RequirementDefinition := [
  {
    requirementId := "primary-cta-correct"
    label := "Primary CTA matches the requested destination and wording"
    failureSummary :=
      "The one visible primary CTA did not use the exact pinned /pricing destination and “View pricing” wording."
    repairGuidance :=
      "Change only the primary CTA so its href is /pricing and its visible text is View pricing."
  },
  {
    requirementId := "routes-preserved"
    label := "Pinned routes remain present and healthy"
    failureSummary :=
      "The home, features, or pricing route surface no longer matched the pinned route inventory and health checks."
    repairGuidance :=
      "Restore the exact Home, Features, and Pricing route inventory and make every pinned route load successfully."
  },
  {
    requirementId := "responsive-layout-healthy"
    label := "Declared mobile and desktop layouts remain within horizontal bounds"
    failureSummary :=
      "The page exceeded the pinned horizontal-overflow tolerance at a declared viewport."
    repairGuidance :=
      "Remove the horizontal overflow without weakening the pinned mobile or desktop viewport contract."
  },
  {
    requirementId := "runtime-healthy"
    label := "Captured browser runtime remains complete and free of fatal errors"
    failureSummary :=
      "The browser capture contained a fatal console/page error or incomplete DOM evidence."
    repairGuidance :=
      "Fix the runtime error and rerun the unchanged pinned profile with complete DOM evidence."
  }
]

def PinnedCtaRequirements (authority : PinnedAuthority) : Prop :=
  authority.requirements = ctaRequirements

theorem cta_requirement_ids_are_exactly_four_and_nodup :
    ctaRequirementIds.length = 4 ∧ ctaRequirementIds.Nodup := by
  native_decide

theorem pinned_cta_required_ids_are_exact
    {authority : PinnedAuthority}
    (hPinned : PinnedCtaRequirements authority) :
    requiredRequirementIds authority = ctaRequirementIds := by
  unfold PinnedCtaRequirements at hPinned
  unfold requiredRequirementIds
  rw [hPinned]
  rfl

structure CtaConformanceFacts (input : ProjectionInput) : Prop where
  pinnedRequiredIds :
    requiredRequirementIds input.authority = ctaRequirementIds
  exactCoverage : exactRequirementCoverage input = true
  requirementsSatisfied :
    ApplicationProjection.requirementsSatisfied
      input.report.requirementResults = true
  observedIdsNodup :
    (observedRequirementIds input.report).Nodup
  observedIdsAreExactlyPinned :
    ∀ requirementId,
      requirementId ∈ observedRequirementIds input.report ↔
        requirementId ∈ ctaRequirementIds
  everyObservedRequirementPassed :
    ∀ result ∈ input.report.requirementResults,
      result.status = .passed

theorem conforming_cta_change_has_exact_coverage_and_all_passed
    {input : ProjectionInput}
    (hPinned : PinnedCtaRequirements input.authority)
    (hConforms :
      ApplicationProjection.projectDisposition input = .conforms) :
    CtaConformanceFacts input := by
  have hRequiredIds :=
    pinned_cta_required_ids_are_exact hPinned
  have hProjectionFacts :=
    conforms_implies_pinned_spec_expected_root_verified_and_current hConforms
  have hCoverage :=
    exact_requirement_coverage_expands hProjectionFacts.exactCoverage
  refine {
    pinnedRequiredIds := hRequiredIds
    exactCoverage := hProjectionFacts.exactCoverage
    requirementsSatisfied := hProjectionFacts.requirementsSatisfied
    observedIdsNodup := hCoverage.2.2.1
    observedIdsAreExactlyPinned := ?_
    everyObservedRequirementPassed := ?_
  }
  · intro requirementId
    constructor
    · intro hObserved
      rw [← hRequiredIds]
      exact hCoverage.2.2.2.2 requirementId hObserved
    · intro hRequired
      apply hCoverage.2.2.2.1 requirementId
      rw [hRequiredIds]
      exact hRequired
  · intro result hResult
    exact conforms_implies_every_requirement_passed hConforms hResult

/-!
This combined theorem is the concrete handoff point for the agent-mediated CTA
workflow: conformance is about the prepared new subject, under the preserved
application authority, with the exact four CTA requirements.
-/
theorem conforming_prepared_cta_change_requires_current_verified_new_subject_and_exact_requirements
    {prepared : ProofGuidedWebChange.PreparedChangeProposal}
    {configured : ProjectionInput}
    (hPinned : PinnedCtaRequirements configured.authority)
    (hConforms :
      ApplicationProjection.projectDisposition
        (ProofGuidedWebChange.PreparedChangeProposal.projectionInput
          prepared configured) = .conforms) :
    (configured.report.subject =
        prepared.newAttempt.resolvedSubject.subject ∧
      configured.report.evidenceVerified = true ∧
      configured.report.semanticDerivationVerified = true ∧
      configured.report.kernelDisposition = .checked ∧
      configured.report.currentness = .current) ∧
    CtaConformanceFacts
      (ProofGuidedWebChange.PreparedChangeProposal.projectionInput
        prepared configured) := by
  constructor
  · exact
      ProofGuidedWebChange.PreparedChangeProposal.conforming_prepared_change_requires_current_verified_new_subject
        hConforms
  · apply conforming_cta_change_has_exact_coverage_and_all_passed
      (input :=
        ProofGuidedWebChange.PreparedChangeProposal.projectionInput
          prepared configured)
    · simpa [PinnedCtaRequirements] using hPinned
    · exact hConforms

end RiddleProofKernel.CtaWebChange
