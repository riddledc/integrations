import Std
import RiddleProofKernel.GroundedEvidence
import RiddleProofKernel.MeaningKernel

namespace RiddleProofKernel.ReviewProtocol

open GroundedEvidence MeaningKernel SemanticClosure SemanticComposition

/-!
An executable structural model of the agent-facing amendment-review protocol.

Unlike the first draft of this model, `reviewAccepted` below is the single
acceptance boundary.  It connects the independently pinned rule bundle to the
exact registry used by the checked tree, connects the independently pinned
evidence-template bundle to replay-valid certificate records, and binds the
accepted execution policy and execution metadata into the exact root claim.

This is deliberately smaller than the wire implementation.  Canonical JSON
parsing, JSON Pointer fidelity, SHA-256, signature verification, certificate
body parsing, clock conversion, filesystem stability, and sensor truth remain
explicit runtime premises.  Lean proves what follows once those deterministic
functions and replay decisions are supplied; it does not prove legal
correctness, rule soundness, actor profession, or an outside-world fact.
-/

/-! ## Independently pinned rule authority -/

structure RuleTrustRootRef where
  trustRootId : String
  trustRootVersion : String
  bundleDigest : String
  deriving DecidableEq, Repr, BEq

namespace RuleTrustRootRef

def matchesExpected (observed expected : RuleTrustRootRef) : Bool :=
  decide (observed = expected)

theorem matchesExpected_iff_exact
    (observed expected : RuleTrustRootRef) :
    observed.matchesExpected expected = true ↔ observed = expected := by
  simp [matchesExpected]

end RuleTrustRootRef

/-!
The public checked-meaning runtime uses N-ary parametric rules.  This exact
reference is the independently pinned runtime identity: the engine and complete
implementation digest are part of the identity, not descriptive metadata.
-/
structure RuntimeCheckedMeaningRuleRef where
  ruleId : String
  ruleVersion : String
  engine : String
  implementationDigest : String
  deriving DecidableEq, Repr, BEq

def RuntimeCheckedMeaningRuleRef.identity
    (rule : RuntimeCheckedMeaningRuleRef) : String × String :=
  (rule.ruleId, rule.ruleVersion)

/-!
The bundle owns the actual `FixedRuleRegistry`.  The supplied digest function
stands for the runtime's domain-separated canonical bundle digest.
-/
structure RuleTrustBundle where
  version : String
  trustRootId : String
  trustRootVersion : String
  registry : FixedRuleRegistry
  /-- Exact N-ary runtime rule references owned by this pinned bundle. -/
  runtimeRuleRefs : List RuntimeCheckedMeaningRuleRef
  deriving DecidableEq, Repr, BEq

abbrev DigestRuleTrustBundle := RuleTrustBundle → String

def RuleTrustBundle.reference
    (digestBundle : DigestRuleTrustBundle)
    (bundle : RuleTrustBundle) : RuleTrustRootRef := {
  trustRootId := bundle.trustRootId
  trustRootVersion := bundle.trustRootVersion
  bundleDigest := digestBundle bundle
}

def RuleTrustBundle.resolves
    (digestBundle : DigestRuleTrustBundle)
    (bundle : RuleTrustBundle)
    (expected : RuleTrustRootRef) : Bool :=
  bundle.reference digestBundle |>.matchesExpected expected

def RuleTrustBundle.resolvesRuntimeRule
    (bundle : RuleTrustBundle)
    (expected : RuntimeCheckedMeaningRuleRef) : Bool :=
  decide (bundle.runtimeRuleRefs ≠ []) &&
  (decide (bundle.runtimeRuleRefs.map
      RuntimeCheckedMeaningRuleRef.identity).Nodup &&
  bundle.runtimeRuleRefs.any fun rule => decide (rule = expected))

theorem resolved_runtime_rule_is_exact_bundle_member
    {bundle : RuleTrustBundle}
    {expected : RuntimeCheckedMeaningRuleRef}
    (hResolved : bundle.resolvesRuntimeRule expected = true) :
    expected ∈ bundle.runtimeRuleRefs := by
  simp only [RuleTrustBundle.resolvesRuntimeRule, Bool.and_eq_true] at hResolved
  obtain ⟨rule, hRule, hExact⟩ := List.any_eq_true.mp hResolved.2.2
  simpa [of_decide_eq_true hExact] using hRule

theorem resolved_rule_bundle_binds_exact_owned_registry_digest
    (digestBundle : DigestRuleTrustBundle)
    (bundle : RuleTrustBundle)
    (expected : RuleTrustRootRef)
    (hResolved : bundle.resolves digestBundle expected = true) :
    bundle.trustRootId = expected.trustRootId ∧
    bundle.trustRootVersion = expected.trustRootVersion ∧
    digestBundle bundle = expected.bundleDigest := by
  have hRef : bundle.reference digestBundle = expected :=
    (RuleTrustRootRef.matchesExpected_iff_exact _ _).mp hResolved
  exact ⟨congrArg RuleTrustRootRef.trustRootId hRef,
    congrArg RuleTrustRootRef.trustRootVersion hRef,
    congrArg RuleTrustRootRef.bundleDigest hRef⟩

theorem changed_rule_bundle_digest_prevents_resolution
    (digestBundle : DigestRuleTrustBundle)
    (bundle : RuleTrustBundle)
    (expected : RuleTrustRootRef)
    (hDigest : digestBundle bundle ≠ expected.bundleDigest) :
    bundle.resolves digestBundle expected = false := by
  simp only [RuleTrustBundle.resolves, RuleTrustRootRef.matchesExpected]
  apply decide_eq_false_iff_not.mpr
  intro hEqual
  exact hDigest (congrArg RuleTrustRootRef.bundleDigest hEqual)

theorem resolved_checked_tree_reachable_rules_are_in_owned_pinned_registry
    {digestDefinition : DigestRuleDefinition}
    {digestBundle : DigestRuleTrustBundle}
    {bundle : RuleTrustBundle}
    {expected : RuleTrustRootRef}
    {now : Nat}
    {tree : MeaningTree}
    (hResolved : bundle.resolves digestBundle expected = true)
    (hChecked : checkedAux digestDefinition bundle.registry now tree = true) :
    bundle.reference digestBundle = expected ∧
    ∀ rule, ReachableRule tree rule → rule ∈ bundle.registry.rules := by
  constructor
  · exact (RuleTrustRootRef.matchesExpected_iff_exact _ _).mp hResolved
  · exact checked_aux_reachable_rules_are_exactly_registered hChecked

/-! ## Reusable evidence-template authority and deterministic materialization -/

inductive JsonType where
  | null
  | boolean
  | number
  | string
  | array
  | object
  deriving DecidableEq, Repr, BEq

/-!
The wire parser remains an explicit runtime premise, but its semantic output is
recursive rather than an opaque root type tag.  That lets Lean express the
runtime's exact-object/no-extra-properties rule at every depth and the exact
shape of every array item.
-/
structure JsonNumber where
  canonicalValue : String
  safeInteger : Option Int
  deriving DecidableEq, Repr, BEq

mutual
  inductive JsonValue where
    | null
    | boolean (value : Bool)
    | number (value : JsonNumber)
    | string (value : String)
    | array (items : JsonValueList)
    | object (properties : JsonPropertyList)

  inductive JsonValueList where
    | nil
    | cons (head : JsonValue) (tail : JsonValueList)

  inductive JsonPropertyList where
    | nil
    | cons (name : String) (value : JsonValue) (tail : JsonPropertyList)
end

deriving instance DecidableEq, Repr, BEq for
  JsonValue, JsonValueList, JsonPropertyList

namespace JsonValue

def jsonType : JsonValue → JsonType
  | .null => .null
  | .boolean _ => .boolean
  | .number _ => .number
  | .string _ => .string
  | .array _ => .array
  | .object _ => .object

end JsonValue

/-!
Object-property lists are canonical key order, as supplied by the deterministic
wire/schema parser.  Exact key-list equality therefore rejects both missing and
extra properties.  Array schemas are position-specific lists with exact length
and order.  This mirrors the runtime schema rather than treating an array as a
uniform bag of values.
-/
inductive JsonScalar where
  | null
  | boolean (value : Bool)
  | number (canonicalValue : String)
  | string (value : String)
  deriving DecidableEq, Repr, BEq

mutual
  inductive ExactObservationSchema where
    | literal (value : JsonScalar)
    | claimParameter (name : String)
    | sha256
    | integer (minimum maximum : Int)
    | array (items : ExactObservationSchemaList)
    | object (properties : ExactObservationPropertyList)

  inductive ExactObservationSchemaList where
    | nil
    | cons (head : ExactObservationSchema)
        (tail : ExactObservationSchemaList)

  inductive ExactObservationPropertyList where
    | nil
    | cons (name : String) (schema : ExactObservationSchema)
        (tail : ExactObservationPropertyList)
end

deriving instance DecidableEq, Repr, BEq for
  ExactObservationSchema, ExactObservationSchemaList,
  ExactObservationPropertyList

def JsonScalar.matches : JsonScalar → JsonValue → Bool
  | .null, .null => true
  | .boolean expected, .boolean observed => decide (expected = observed)
  | .number expected, .number observed =>
      decide (expected = observed.canonicalValue)
  | .string expected, .string observed => decide (expected = observed)
  | _, _ => false

def observationParameterValue?
    (parameters : List (String × JsonValue))
    (name : String) : Option JsonValue :=
  (parameters.find? fun entry => entry.1 = name).map Prod.snd

def lowerHexCharacter (character : Char) : Bool :=
  (decide ('0' ≤ character ∧ character ≤ '9')) ||
  decide ('a' ≤ character ∧ character ≤ 'f')

def exactSha256String (value : String) : Bool :=
  value.startsWith "sha256:" &&
  (decide (value.length = 71) &&
  (value.toList.drop 7).all lowerHexCharacter)

def JsonValueList.length : JsonValueList → Nat
  | .nil => 0
  | .cons _ tail => tail.length + 1

def ExactObservationSchemaList.length : ExactObservationSchemaList → Nat
  | .nil => 0
  | .cons _ tail => tail.length + 1

def JsonPropertyList.names : JsonPropertyList → List String
  | .nil => []
  | .cons name _ tail => name :: tail.names

def ExactObservationPropertyList.names :
    ExactObservationPropertyList → List String
  | .nil => []
  | .cons name _ tail => name :: tail.names

mutual
  def exactObservationMatches
      (parameters : List (String × JsonValue)) :
      ExactObservationSchema → JsonValue → Bool
    | .literal expected, observed => expected.matches observed
    | .claimParameter name, observed =>
        decide (observationParameterValue? parameters name = some observed)
    | .sha256, .string observed => exactSha256String observed
    | .integer minimum maximum, .number observed =>
        match observed.safeInteger with
        | none => false
        | some integer => decide (minimum ≤ integer ∧ integer ≤ maximum)
    | .array expected, .array observed =>
        decide (expected.length = observed.length) &&
        exactObservationArrayMatches parameters expected observed
    | .object expected, .object observed =>
        decide (expected.names = observed.names) &&
        exactObservationObjectMatches parameters expected observed
    | _, _ => false

  def exactObservationArrayMatches
      (parameters : List (String × JsonValue)) :
      ExactObservationSchemaList → JsonValueList → Bool
    | .nil, .nil => true
    | .cons schema schemaTail, .cons value valueTail =>
        exactObservationMatches parameters schema value &&
        exactObservationArrayMatches parameters schemaTail valueTail
    | _, _ => false

  def exactObservationObjectMatches
      (parameters : List (String × JsonValue)) :
      ExactObservationPropertyList → JsonPropertyList → Bool
    | .nil, .nil => true
    | .cons expectedName schema schemaTail,
        .cons observedName value valueTail =>
        decide (expectedName = observedName) &&
        (exactObservationMatches parameters schema value &&
        exactObservationObjectMatches parameters schemaTail valueTail)
    | _, _ => false
end

mutual
  def ExactObservationSchema.wellFormed
      (parameterNames : List String) : ExactObservationSchema → Bool
    | .literal _ => true
    | .claimParameter name =>
        decide (name ≠ "") && parameterNames.contains name
    | .sha256 => true
    | .integer minimum maximum => decide (minimum ≤ maximum)
    | .array items => items.wellFormed parameterNames
    | .object properties =>
        decide (properties ≠ .nil) &&
        (decide properties.names.Nodup &&
        properties.wellFormed parameterNames)

  def ExactObservationSchemaList.wellFormed
      (parameterNames : List String) : ExactObservationSchemaList → Bool
    | .nil => true
    | .cons schema tail =>
        schema.wellFormed parameterNames && tail.wellFormed parameterNames

  def ExactObservationPropertyList.wellFormed
      (parameterNames : List String) : ExactObservationPropertyList → Bool
    | .nil => true
    | .cons name schema tail =>
        decide (name ≠ "") &&
        (schema.wellFormed parameterNames && tail.wellFormed parameterNames)
end

theorem root_extra_observation_field_is_rejected
    {parameters : List (String × JsonValue)}
    {expected : ExactObservationPropertyList}
    {values : JsonPropertyList}
    (hExtra : expected.names ≠ values.names) :
    exactObservationMatches parameters (.object expected) (.object values) = false := by
  simp [exactObservationMatches, hExtra]

theorem nested_extra_observation_field_is_rejected
    {parameters : List (String × JsonValue)}
    {outer : String}
    {expected : ExactObservationPropertyList}
    {values : JsonPropertyList}
    (hExtra : expected.names ≠ values.names) :
    exactObservationMatches parameters
      (.object (.cons outer (.object expected) .nil))
      (.object (.cons outer (.object values) .nil)) = false := by
  simp [exactObservationMatches, exactObservationObjectMatches, hExtra]

theorem invalid_array_item_shape_is_rejected
    {parameters : List (String × JsonValue)}
    {schema : ExactObservationSchema}
    {schemaTail : ExactObservationSchemaList}
    {head : JsonValue}
    {tail : JsonValueList}
    (hInvalid : exactObservationMatches parameters schema head = false) :
    exactObservationMatches parameters
      (.array (.cons schema schemaTail))
      (.array (.cons head tail)) = false := by
  simp [exactObservationMatches, exactObservationArrayMatches, hInvalid]

theorem array_length_mismatch_is_rejected
    {parameters : List (String × JsonValue)}
    {schemas : ExactObservationSchemaList}
    {values : JsonValueList}
    (hLength : schemas.length ≠ values.length) :
    exactObservationMatches parameters (.array schemas) (.array values) = false := by
  simp [exactObservationMatches, hLength]

abbrev SelectObservationPointer := JsonValue → String → Option JsonValue
abbrev SelectScopePointer := Scope → String → Option JsonValue

inductive EvidenceAssertionSource where
  | observation
  | scope
  deriving DecidableEq, Repr, BEq

inductive EvidenceAssertionOperation where
  | exists
  | equals (value : JsonValue)
  | typeIs (jsonType : JsonType)
  deriving DecidableEq, Repr, BEq

structure EvidenceRequiredAssertion where
  source : EvidenceAssertionSource
  pointer : String
  operation : EvidenceAssertionOperation
  deriving DecidableEq, Repr, BEq

structure EvidenceParameterBinding where
  parameterName : String
  /--
  Every pointer is an independent observation of the same claim parameter.
  This is a list (rather than a single pointer) because currentness binds both
  the expected and observed snapshot/digest fields to one exact claim value.
  -/
  observationPointers : List String
  allowedTypes : List JsonType
  deriving DecidableEq, Repr, BEq

/-!
The pinned artifact surface is an exact ordered metadata set, not merely a list
of roles that must be present.  Canonical parser order makes equality
order-insensitive at the wire boundary while retaining a simple formal list.
Exact equality binds artifact ID, role, media type, and count.
-/
structure EvidenceArtifactMetadata where
  artifactId : String
  role : String
  mediaType : String
  deriving DecidableEq, Repr, BEq

structure EvidenceProfileTemplate where
  profileId : String
  profileVersion : String
  claimId : String
  claimVersion : String
  claimLabel : String
  collectorId : String
  collectorVersion : String
  collectorDigest : String
  sensorKind : String
  sensorName : String
  sensorVersion : String
  sensorMetadataDigest : String
  signerFingerprint : String
  verifierId : String
  verifierVersion : String
  verifierDigest : String
  contractId : String
  contractVersion : String
  contractLabel : String
  requiredAssertions : List EvidenceRequiredAssertion
  parameterBindings : List EvidenceParameterBinding
  observationSchema : ExactObservationSchema
  requiredArtifacts : List EvidenceArtifactMetadata
  requiredArtifactRoles : List String
  deriving DecidableEq, Repr, BEq

def EvidenceProfileTemplate.identity
    (profile : EvidenceProfileTemplate) : String × String :=
  (profile.profileId, profile.profileVersion)

def EvidenceProfileTemplate.claimIdentity
    (profile : EvidenceProfileTemplate) : String × String :=
  (profile.claimId, profile.claimVersion)

def EvidenceProfileTemplate.wellFormed
    (profile : EvidenceProfileTemplate) : Bool :=
  let observationPointers :=
    profile.parameterBindings.flatMap EvidenceParameterBinding.observationPointers
  let parameterNames :=
    profile.parameterBindings.map EvidenceParameterBinding.parameterName
  decide (profile.profileId ≠ "") &&
  decide (profile.profileVersion ≠ "") &&
  decide (profile.claimId ≠ "") &&
  decide (profile.claimVersion ≠ "") &&
  decide (profile.requiredAssertions ≠ []) &&
  decide (profile.parameterBindings ≠ []) &&
  decide (profile.requiredArtifacts ≠ []) &&
  decide (profile.requiredArtifacts.length = 1) &&
  decide (profile.requiredArtifactRoles ≠ []) &&
  decide (profile.requiredArtifacts.map
      EvidenceArtifactMetadata.artifactId).Nodup &&
  decide (profile.requiredArtifacts.map
      EvidenceArtifactMetadata.role).Nodup &&
  decide profile.requiredArtifactRoles.Nodup &&
  decide (profile.requiredArtifactRoles =
      profile.requiredArtifacts.map EvidenceArtifactMetadata.role) &&
  profile.observationSchema.wellFormed parameterNames &&
  (profile.requiredArtifacts.all fun artifact =>
    decide (artifact.artifactId ≠ "") &&
    decide (artifact.role ≠ "") &&
    decide (artifact.mediaType ≠ "")) &&
  decide parameterNames.Nodup &&
  decide observationPointers.Nodup &&
  (profile.parameterBindings.all fun binding =>
    decide (binding.parameterName ≠ "") &&
    decide (binding.observationPointers ≠ []) &&
    (binding.observationPointers.all fun pointer => decide (pointer ≠ "")) &&
    decide (binding.allowedTypes ≠ []) &&
    decide binding.allowedTypes.Nodup)

structure EvidenceTemplateTrustRootRef where
  trustRootId : String
  trustRootVersion : String
  bundleDigest : String
  deriving DecidableEq, Repr, BEq

namespace EvidenceTemplateTrustRootRef

def matchesExpected
    (observed expected : EvidenceTemplateTrustRootRef) : Bool :=
  decide (observed = expected)

theorem matchesExpected_iff_exact
    (observed expected : EvidenceTemplateTrustRootRef) :
    observed.matchesExpected expected = true ↔ observed = expected := by
  simp [matchesExpected]

end EvidenceTemplateTrustRootRef

structure EvidenceTemplateTrustBundle where
  version : String
  trustRootId : String
  trustRootVersion : String
  profiles : List EvidenceProfileTemplate
  deriving DecidableEq, Repr, BEq

abbrev DigestEvidenceTemplateBundle := EvidenceTemplateTrustBundle → String

def EvidenceTemplateTrustBundle.wellFormed
    (bundle : EvidenceTemplateTrustBundle) : Bool :=
  decide (bundle.profiles ≠ []) &&
  (decide (bundle.profiles.map EvidenceProfileTemplate.identity).Nodup &&
  (decide (bundle.profiles.map EvidenceProfileTemplate.claimIdentity).Nodup &&
  bundle.profiles.all EvidenceProfileTemplate.wellFormed))

def EvidenceTemplateTrustBundle.reference
    (digestBundle : DigestEvidenceTemplateBundle)
    (bundle : EvidenceTemplateTrustBundle) : EvidenceTemplateTrustRootRef := {
  trustRootId := bundle.trustRootId
  trustRootVersion := bundle.trustRootVersion
  bundleDigest := digestBundle bundle
}

def EvidenceTemplateTrustBundle.resolves
    (digestBundle : DigestEvidenceTemplateBundle)
    (bundle : EvidenceTemplateTrustBundle)
    (expected : EvidenceTemplateTrustRootRef) : Bool :=
  bundle.wellFormed &&
    (bundle.reference digestBundle |>.matchesExpected expected)

theorem resolved_evidence_bundle_is_well_formed_and_exact
    {digestBundle : DigestEvidenceTemplateBundle}
    {bundle : EvidenceTemplateTrustBundle}
    {expected : EvidenceTemplateTrustRootRef}
    (hResolved : bundle.resolves digestBundle expected = true) :
    bundle.wellFormed = true ∧ bundle.reference digestBundle = expected := by
  simp only [EvidenceTemplateTrustBundle.resolves, Bool.and_eq_true] at hResolved
  exact ⟨hResolved.1,
    (EvidenceTemplateTrustRootRef.matchesExpected_iff_exact _ _).mp hResolved.2⟩

theorem resolved_evidence_bundle_has_unique_profile_and_claim_identities
    {digestBundle : DigestEvidenceTemplateBundle}
    {bundle : EvidenceTemplateTrustBundle}
    {expected : EvidenceTemplateTrustRootRef}
    (hResolved : bundle.resolves digestBundle expected = true) :
    (bundle.profiles.map EvidenceProfileTemplate.identity).Nodup ∧
    (bundle.profiles.map EvidenceProfileTemplate.claimIdentity).Nodup := by
  have hWellFormed :=
    (resolved_evidence_bundle_is_well_formed_and_exact hResolved).1
  simp only [EvidenceTemplateTrustBundle.wellFormed, Bool.and_eq_true] at hWellFormed
  exact ⟨of_decide_eq_true hWellFormed.2.1,
    of_decide_eq_true hWellFormed.2.2.1⟩

structure MaterializedEvidenceClaim where
  claimId : String
  claimVersion : String
  label : String
  parameters : List (String × JsonValue)
  deriving DecidableEq, Repr, BEq

structure MaterializedEvidenceAuthority where
  profileId : String
  profileVersion : String
  claim : MaterializedEvidenceClaim
  collectorId : String
  collectorVersion : String
  collectorDigest : String
  sensorKind : String
  sensorName : String
  sensorVersion : String
  sensorMetadataDigest : String
  sensorObservedTarget : String
  signerFingerprint : String
  verifierId : String
  verifierVersion : String
  verifierDigest : String
  contractId : String
  contractVersion : String
  contractLabel : String
  contractImplementationDigest : String
  receiptContractImplementationDigest : String
  fixedAssertions : List EvidenceRequiredAssertion
  parameterBindings : List EvidenceParameterBinding
  observationSchema : ExactObservationSchema
  requiredArtifacts : List EvidenceArtifactMetadata
  requiredArtifactRoles : List String
  deriving DecidableEq, Repr, BEq

abbrev DigestMaterializedContract :=
  EvidenceProfileTemplate → MaterializedEvidenceClaim → String

def parameterValue?
    (parameters : List (String × JsonValue))
    (name : String) : Option JsonValue :=
  (parameters.find? fun entry => entry.1 = name).map Prod.snd

def requiredAssertionHolds
    (selectObservation : SelectObservationPointer)
    (selectScope : SelectScopePointer)
    (observation : JsonValue)
    (scope : Scope)
    (assertion : EvidenceRequiredAssertion) : Bool :=
  let selected := match assertion.source with
    | .observation => selectObservation observation assertion.pointer
    | .scope => selectScope scope assertion.pointer
  match assertion.operation with
  | .exists => selected.isSome
  | .equals expected => decide (selected = some expected)
  | .typeIs expectedType =>
      match selected with
      | none => false
      | some value => decide (value.jsonType = expectedType)

def parameterBindingHolds
    (selectObservation : SelectObservationPointer)
    (observation : JsonValue)
    (claim : MaterializedEvidenceClaim)
    (binding : EvidenceParameterBinding) : Bool :=
  binding.observationPointers.all fun pointer =>
    match selectObservation observation pointer with
    | none => false
    | some observed =>
        binding.allowedTypes.contains observed.jsonType &&
        decide (parameterValue? claim.parameters binding.parameterName = some observed)

theorem parameter_binding_holds_every_pointer_matches_exact_claim_value
    {selectObservation : SelectObservationPointer}
    {observation : JsonValue}
    {claim : MaterializedEvidenceClaim}
    {binding : EvidenceParameterBinding}
    (hBinding : parameterBindingHolds selectObservation observation claim binding = true) :
    ∀ pointer ∈ binding.observationPointers,
      ∃ observed,
        selectObservation observation pointer = some observed ∧
        binding.allowedTypes.contains observed.jsonType = true ∧
        parameterValue? claim.parameters binding.parameterName = some observed := by
  intro pointer hPointer
  have hPointerValid := (List.all_eq_true.mp hBinding) pointer hPointer
  cases hSelected : selectObservation observation pointer with
  | none => simp [hSelected] at hPointerValid
  | some observed =>
      simp only [hSelected, Bool.and_eq_true] at hPointerValid
      exact ⟨observed, rfl, hPointerValid.1,
        of_decide_eq_true hPointerValid.2⟩

def evidenceMaterializes
    (selectObservation : SelectObservationPointer)
    (selectScope : SelectScopePointer)
    (digestContract : DigestMaterializedContract)
    (template : EvidenceProfileTemplate)
    (observation : JsonValue)
    (scope : Scope)
    (materialized : MaterializedEvidenceAuthority) : Bool :=
  decide (materialized.profileId = template.profileId) &&
  (decide (materialized.profileVersion = template.profileVersion) &&
  (decide (materialized.claim.claimId = template.claimId) &&
  (decide (materialized.claim.claimVersion = template.claimVersion) &&
  (decide (materialized.claim.label = template.claimLabel) &&
  (decide (materialized.claim.parameters.map Prod.fst =
      template.parameterBindings.map EvidenceParameterBinding.parameterName) &&
  (exactObservationMatches materialized.claim.parameters
      template.observationSchema observation &&
  (template.requiredAssertions.all
      (requiredAssertionHolds selectObservation selectScope observation scope) &&
  (template.parameterBindings.all
      (parameterBindingHolds selectObservation observation materialized.claim) &&
  (decide (materialized.collectorId = template.collectorId) &&
  (decide (materialized.collectorVersion = template.collectorVersion) &&
  (decide (materialized.collectorDigest = template.collectorDigest) &&
  (decide (materialized.sensorKind = template.sensorKind) &&
  (decide (materialized.sensorName = template.sensorName) &&
  (decide (materialized.sensorVersion = template.sensorVersion) &&
  (decide (materialized.sensorMetadataDigest = template.sensorMetadataDigest) &&
  (decide (materialized.sensorObservedTarget = scope.target) &&
  (decide (materialized.signerFingerprint = template.signerFingerprint) &&
  (decide (materialized.verifierId = template.verifierId) &&
  (decide (materialized.verifierVersion = template.verifierVersion) &&
  (decide (materialized.verifierDigest = template.verifierDigest) &&
  (decide (materialized.contractId = template.contractId) &&
  (decide (materialized.contractVersion = template.contractVersion) &&
  (decide (materialized.contractLabel = template.contractLabel) &&
  (decide (materialized.fixedAssertions = template.requiredAssertions) &&
  (decide (materialized.parameterBindings = template.parameterBindings) &&
  (decide (materialized.observationSchema = template.observationSchema) &&
  (decide (materialized.requiredArtifacts = template.requiredArtifacts) &&
  (decide (materialized.requiredArtifactRoles = template.requiredArtifactRoles) &&
  (decide (materialized.contractImplementationDigest =
      digestContract template materialized.claim) &&
  decide (materialized.receiptContractImplementationDigest =
      materialized.contractImplementationDigest))))))))))))))))))))))))))))))

theorem materialized_evidence_uses_observed_values_and_scope_target
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {template : EvidenceProfileTemplate}
    {observation : JsonValue}
    {scope : Scope}
    {materialized : MaterializedEvidenceAuthority}
    (hMaterialized : evidenceMaterializes selectObservation selectScope
      digestContract template observation scope materialized = true) :
    materialized.claim.parameters.map Prod.fst =
        template.parameterBindings.map EvidenceParameterBinding.parameterName ∧
    (∀ assertion ∈ template.requiredAssertions,
      requiredAssertionHolds selectObservation selectScope observation scope
        assertion = true) ∧
    (∀ binding ∈ template.parameterBindings,
      parameterBindingHolds selectObservation observation
        materialized.claim binding = true) ∧
    materialized.sensorObservedTarget = scope.target ∧
    materialized.fixedAssertions = template.requiredAssertions ∧
    materialized.contractImplementationDigest =
      digestContract template materialized.claim ∧
    materialized.receiptContractImplementationDigest =
      materialized.contractImplementationDigest := by
  simp only [evidenceMaterializes, Bool.and_eq_true] at hMaterialized
  obtain ⟨_, _, _, _, _, hParameterNames, _, hAssertions, hBindings,
    _, _, _, _, _, _, _, hTarget, _, _, _, _, _, _, _, hFixed,
    _, _, _, _, hContract, hReceipt⟩ := hMaterialized
  exact ⟨of_decide_eq_true hParameterNames,
    List.all_eq_true.mp hAssertions,
    List.all_eq_true.mp hBindings,
    of_decide_eq_true hTarget,
    of_decide_eq_true hFixed,
    of_decide_eq_true hContract,
    of_decide_eq_true hReceipt⟩

theorem inexact_observation_schema_prevents_materialization
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {template : EvidenceProfileTemplate}
    {observation : JsonValue}
    {scope : Scope}
    {materialized : MaterializedEvidenceAuthority}
    (hMismatch : exactObservationMatches materialized.claim.parameters
      template.observationSchema observation = false) :
    evidenceMaterializes selectObservation selectScope digestContract
      template observation scope materialized = false := by
  simp [evidenceMaterializes, hMismatch]

theorem root_extra_observation_field_prevents_materialization
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {template : EvidenceProfileTemplate}
    {scope : Scope}
    {materialized : MaterializedEvidenceAuthority}
    {expected : ExactObservationPropertyList}
    {values : JsonPropertyList}
    (hSchema : template.observationSchema = .object expected)
    (hExtra : expected.names ≠ values.names) :
    evidenceMaterializes selectObservation selectScope digestContract
      template (.object values) scope materialized = false := by
  apply inexact_observation_schema_prevents_materialization
  simpa [hSchema] using
    (root_extra_observation_field_is_rejected
      (parameters := materialized.claim.parameters) hExtra)

theorem nested_extra_observation_field_prevents_materialization
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {template : EvidenceProfileTemplate}
    {scope : Scope}
    {materialized : MaterializedEvidenceAuthority}
    {outer : String}
    {expected : ExactObservationPropertyList}
    {values : JsonPropertyList}
    (hSchema : template.observationSchema =
      .object (.cons outer (.object expected) .nil))
    (hExtra : expected.names ≠ values.names) :
    evidenceMaterializes selectObservation selectScope digestContract
      template (.object (.cons outer (.object values) .nil))
      scope materialized = false := by
  apply inexact_observation_schema_prevents_materialization
  simpa [hSchema] using
    (nested_extra_observation_field_is_rejected
      (parameters := materialized.claim.parameters)
      (outer := outer) hExtra)

theorem materialization_binds_exact_observation_schema_and_artifacts
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {template : EvidenceProfileTemplate}
    {observation : JsonValue}
    {scope : Scope}
    {materialized : MaterializedEvidenceAuthority}
    (hMaterialized : evidenceMaterializes selectObservation selectScope
      digestContract template observation scope materialized = true) :
    exactObservationMatches materialized.claim.parameters
        template.observationSchema observation = true ∧
    materialized.observationSchema = template.observationSchema ∧
    materialized.requiredArtifacts = template.requiredArtifacts ∧
    materialized.requiredArtifactRoles = template.requiredArtifactRoles := by
  simp only [evidenceMaterializes, Bool.and_eq_true] at hMaterialized
  exact ⟨hMaterialized.2.2.2.2.2.2.1,
    of_decide_eq_true
      hMaterialized.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.1,
    of_decide_eq_true
      hMaterialized.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.1,
    of_decide_eq_true
      hMaterialized.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.1⟩

theorem changed_observation_binding_prevents_materialization
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {template : EvidenceProfileTemplate}
    {observation : JsonValue}
    {scope : Scope}
    {materialized : MaterializedEvidenceAuthority}
    {binding : EvidenceParameterBinding}
    (hBinding : binding ∈ template.parameterBindings)
    (hChanged : parameterBindingHolds selectObservation observation
      materialized.claim binding = false) :
    evidenceMaterializes selectObservation selectScope digestContract
      template observation scope materialized = false := by
  apply Bool.eq_false_iff.mpr
  intro hTrue
  have hFacts := materialized_evidence_uses_observed_values_and_scope_target hTrue
  have hExpected := hFacts.2.2.1 binding hBinding
  simp [hChanged] at hExpected

theorem changed_sensor_target_prevents_materialization
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {template : EvidenceProfileTemplate}
    {observation : JsonValue}
    {scope : Scope}
    {materialized : MaterializedEvidenceAuthority}
    (hChanged : materialized.sensorObservedTarget ≠ scope.target) :
    evidenceMaterializes selectObservation selectScope digestContract
      template observation scope materialized = false := by
  apply Bool.eq_false_iff.mpr
  intro hTrue
  have hFacts := materialized_evidence_uses_observed_values_and_scope_target hTrue
  exact hChanged hFacts.2.2.2.1

theorem changed_profile_identity_prevents_materialization
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {template : EvidenceProfileTemplate}
    {observation : JsonValue}
    {scope : Scope}
    {materialized : MaterializedEvidenceAuthority}
    (hChanged : materialized.profileId ≠ template.profileId) :
    evidenceMaterializes selectObservation selectScope digestContract
      template observation scope materialized = false := by
  apply Bool.eq_false_iff.mpr
  intro hTrue
  simp only [evidenceMaterializes, Bool.and_eq_true] at hTrue
  exact hChanged (of_decide_eq_true hTrue.1)

theorem changed_receipt_contract_digest_prevents_materialization
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {template : EvidenceProfileTemplate}
    {observation : JsonValue}
    {scope : Scope}
    {materialized : MaterializedEvidenceAuthority}
    (hChanged : materialized.receiptContractImplementationDigest ≠
      materialized.contractImplementationDigest) :
    evidenceMaterializes selectObservation selectScope digestContract
      template observation scope materialized = false := by
  apply Bool.eq_false_iff.mpr
  intro hTrue
  have hFacts := materialized_evidence_uses_observed_values_and_scope_target hTrue
  exact hChanged hFacts.2.2.2.2.2.2

def materializedByBundle
    (selectObservation : SelectObservationPointer)
    (selectScope : SelectScopePointer)
    (digestContract : DigestMaterializedContract)
    (bundle : EvidenceTemplateTrustBundle)
    (observation : JsonValue)
    (scope : Scope)
    (materialized : MaterializedEvidenceAuthority) : Bool :=
  bundle.profiles.any fun template =>
    evidenceMaterializes selectObservation selectScope digestContract
      template observation scope materialized

/-!
`replayAccepted` is an explicit runtime premise covering signature,
receipt, contract, and certificate-body replay.  Exact observation shape and
signed-statement artifact metadata are checked structurally before the overall
review can accept, rather than being hidden in that premise.
-/
structure SignedCaptureStatementProjection where
  capturedAtText : String
  artifacts : List EvidenceArtifactMetadata
  deriving DecidableEq, Repr, BEq

abbrev SignedStatementProjectionFromCanonicalStatement :=
  String → Option SignedCaptureStatementProjection

/-! Compatibility name retained for the existing theorem parameter surface. -/
abbrev CapturedAtTextFromCanonicalStatement :=
  SignedStatementProjectionFromCanonicalStatement

structure ReplayCertificateRecord where
  certificateId : CertificateId
  groundingId : String
  scope : Scope
  claim : ClaimKey
  /-- Exact signed certificate-body bytes (or their canonical runtime witness). -/
  canonicalBodyWitness : String
  /-- Parsed from `canonicalBodyWitness`; never accepted merely as producer data. -/
  issuedAt : Nat
  /-- Exact canonical signed-capture statement witness replayed for this leaf. -/
  canonicalSignedStatementWitness : String
  /-- Exact ISO-8601 capture text extracted from the signed statement. -/
  capturedAtText : String
  /-- Canonical artifact metadata extracted from that same signed statement. -/
  observedArtifacts : List EvidenceArtifactMetadata
  /-- Milliseconds obtained from `capturedAtText` through the supplied parser. -/
  capturedAtMs : Nat
  observation : JsonValue
  materialized : MaterializedEvidenceAuthority
  deriving DecidableEq, Repr, BEq

abbrev ReplayAccepted :=
  EvidenceTemplateTrustBundle → ReplayCertificateRecord → Bool

def ReplayCertificateRecord.exactArtifactMetadata
    (signedStatementProjectionFromCanonicalStatement :
      SignedStatementProjectionFromCanonicalStatement)
    (record : ReplayCertificateRecord) : Bool :=
  decide (signedStatementProjectionFromCanonicalStatement
      record.canonicalSignedStatementWitness = some {
        capturedAtText := record.capturedAtText
        artifacts := record.observedArtifacts
      }) &&
  (decide (record.observedArtifacts.map
      EvidenceArtifactMetadata.artifactId).Nodup &&
  (decide (record.observedArtifacts.map
      EvidenceArtifactMetadata.role).Nodup &&
  (decide (record.materialized.requiredArtifacts.map
      EvidenceArtifactMetadata.artifactId).Nodup &&
  (decide (record.materialized.requiredArtifacts.map
      EvidenceArtifactMetadata.role).Nodup &&
  (decide (record.observedArtifacts = record.materialized.requiredArtifacts) &&
  decide (record.materialized.requiredArtifactRoles =
      record.materialized.requiredArtifacts.map EvidenceArtifactMetadata.role))))))

theorem missing_pinned_artifact_metadata_is_rejected
    {extract : SignedStatementProjectionFromCanonicalStatement}
    {record : ReplayCertificateRecord}
    {artifact : EvidenceArtifactMetadata}
    (hPinned : artifact ∈ record.materialized.requiredArtifacts)
    (hMissing : artifact ∉ record.observedArtifacts) :
    record.exactArtifactMetadata extract = false := by
  apply Bool.eq_false_iff.mpr
  intro hExact
  simp only [ReplayCertificateRecord.exactArtifactMetadata,
    Bool.and_eq_true] at hExact
  have hEquality : record.observedArtifacts =
      record.materialized.requiredArtifacts :=
    of_decide_eq_true hExact.2.2.2.2.2.1
  apply hMissing
  simpa [hEquality] using hPinned

theorem extra_signed_statement_artifact_metadata_is_rejected
    {extract : SignedStatementProjectionFromCanonicalStatement}
    {record : ReplayCertificateRecord}
    {artifact : EvidenceArtifactMetadata}
    (hObserved : artifact ∈ record.observedArtifacts)
    (hExtra : artifact ∉ record.materialized.requiredArtifacts) :
    record.exactArtifactMetadata extract = false := by
  apply Bool.eq_false_iff.mpr
  intro hExact
  simp only [ReplayCertificateRecord.exactArtifactMetadata,
    Bool.and_eq_true] at hExact
  have hEquality : record.observedArtifacts =
      record.materialized.requiredArtifacts :=
    of_decide_eq_true hExact.2.2.2.2.2.1
  apply hExtra
  simpa [hEquality] using hObserved

theorem duplicate_signed_statement_artifact_role_is_rejected
    {extract : SignedStatementProjectionFromCanonicalStatement}
    {record : ReplayCertificateRecord}
    (hDuplicate : ¬ (record.observedArtifacts.map
      EvidenceArtifactMetadata.role).Nodup) :
    record.exactArtifactMetadata extract = false := by
  simp [ReplayCertificateRecord.exactArtifactMetadata, hDuplicate]

theorem exact_artifact_metadata_binds_pinned_count_and_fields
    {extract : SignedStatementProjectionFromCanonicalStatement}
    {record : ReplayCertificateRecord}
    (hExact : record.exactArtifactMetadata extract = true) :
    extract record.canonicalSignedStatementWitness = some {
      capturedAtText := record.capturedAtText
      artifacts := record.observedArtifacts
    } ∧
    record.observedArtifacts = record.materialized.requiredArtifacts ∧
    record.observedArtifacts.length =
      record.materialized.requiredArtifacts.length ∧
    (record.observedArtifacts.map EvidenceArtifactMetadata.artifactId).Nodup ∧
    (record.observedArtifacts.map EvidenceArtifactMetadata.role).Nodup := by
  simp only [ReplayCertificateRecord.exactArtifactMetadata,
    Bool.and_eq_true] at hExact
  have hMetadata : record.observedArtifacts =
      record.materialized.requiredArtifacts :=
    of_decide_eq_true hExact.2.2.2.2.2.1
  exact ⟨of_decide_eq_true hExact.1, hMetadata,
    congrArg List.length hMetadata,
    of_decide_eq_true hExact.2.1,
    of_decide_eq_true hExact.2.2.1⟩

abbrev EncodeClaimParameters := List (String × JsonValue) → String

def MaterializedEvidenceClaim.key
    (encodeParameters : EncodeClaimParameters)
    (claim : MaterializedEvidenceClaim) : ClaimKey := {
  claimId := claim.claimId
  claimVersion := claim.claimVersion
  canonicalParameters := encodeParameters claim.parameters
}

def replayRecordValid
    (selectObservation : SelectObservationPointer)
    (selectScope : SelectScopePointer)
    (digestContract : DigestMaterializedContract)
    (encodeParameters : EncodeClaimParameters)
    (replayAccepted : ReplayAccepted)
    (bundle : EvidenceTemplateTrustBundle)
    (record : ReplayCertificateRecord) : Bool :=
  materializedByBundle selectObservation selectScope digestContract bundle
      record.observation record.scope record.materialized &&
  (decide (record.claim = record.materialized.claim.key encodeParameters) &&
  replayAccepted bundle record)

def resolvedCertificate
    (selectObservation : SelectObservationPointer)
    (selectScope : SelectScopePointer)
    (digestContract : DigestMaterializedContract)
    (encodeParameters : EncodeClaimParameters)
    (replayAccepted : ReplayAccepted)
    (bundle : EvidenceTemplateTrustBundle)
    (records : List ReplayCertificateRecord)
    (certificateId : CertificateId) : Bool :=
  records.any fun record =>
    decide (record.certificateId = certificateId) &&
    replayRecordValid selectObservation selectScope digestContract
      encodeParameters replayAccepted bundle record

def resolvedExactClaim
    (selectObservation : SelectObservationPointer)
    (selectScope : SelectScopePointer)
    (digestContract : DigestMaterializedContract)
    (encodeParameters : EncodeClaimParameters)
    (replayAccepted : ReplayAccepted)
    (bundle : EvidenceTemplateTrustBundle)
    (records : List ReplayCertificateRecord)
    (scope : Scope)
    (claim : ClaimKey) : Bool :=
  records.any fun record =>
    decide (record.scope = scope ∧ record.claim = claim) &&
    replayRecordValid selectObservation selectScope digestContract
      encodeParameters replayAccepted bundle record

def resolvedExactCertificateClaim
    (selectObservation : SelectObservationPointer)
    (selectScope : SelectScopePointer)
    (digestContract : DigestMaterializedContract)
    (encodeParameters : EncodeClaimParameters)
    (replayAccepted : ReplayAccepted)
    (bundle : EvidenceTemplateTrustBundle)
    (records : List ReplayCertificateRecord)
    (certificateId : CertificateId)
    (scope : Scope)
    (claim : ClaimKey) : Bool :=
  records.any fun record =>
    decide (record.certificateId = certificateId ∧
      record.scope = scope ∧ record.claim = claim) &&
    replayRecordValid selectObservation selectScope digestContract
      encodeParameters replayAccepted bundle record

structure GroundedLeafReplayRef where
  certificateId : CertificateId
  groundingId : String
  scope : Scope
  claim : ClaimKey
  issuedAt : Nat
  deriving DecidableEq, Repr, BEq

def ReplayCertificateRecord.leafRef
    (record : ReplayCertificateRecord) : GroundedLeafReplayRef := {
  certificateId := record.certificateId
  groundingId := record.groundingId
  scope := record.scope
  claim := record.claim
  issuedAt := record.issuedAt
}

def GroundedLeaf.replayRef (leaf : GroundedLeaf) : GroundedLeafReplayRef := {
  certificateId := leaf.certificateId
  groundingId := leaf.groundingId
  scope := leaf.scope
  claim := leaf.claim
  issuedAt := leaf.issuedAt
}

def MeaningTree.reachableGroundedLeaves : MeaningTree → List GroundedLeaf
  | .grounded leaf => [leaf]
  | .compose _ _ _ left right =>
      MeaningTree.reachableGroundedLeaves left ++
        MeaningTree.reachableGroundedLeaves right

/-! ## Execution, assertion, packet, and currentness projections -/

inductive AssertionClass where
  | documentObservation
  | deterministicCheck
  | agentInterpretation
  | agentProposal
  | agentUncertainty
  deriving DecidableEq, Repr, BEq

structure DeterministicComponent where
  componentId : String
  componentVersion : String
  deriving DecidableEq, Repr, BEq

inductive AssertionIssuer where
  | deterministic (component : DeterministicComponent)
  | agent (executionId : String)
  deriving DecidableEq, Repr, BEq

structure ExecutionMetadata where
  executionId : String
  providerAdapterId : String
  modelId : String
  protocolVersion : String
  promptVersion : String
  routingDecisionCode : String
  attemptCount : Nat
  escalationReasonCode : Option String
  deriving DecidableEq, Repr, BEq

structure ApprovedExecutionPolicy where
  policyId : String
  policyVersion : String
  providerAdapterId : String
  allowedModelIds : List String
  allowedProtocolVersions : List String
  allowedPromptVersions : List String
  allowedRoutingDecisionCodes : List String
  allowedEscalationReasonCodes : List String
  allowNoEscalation : Bool
  maxAttemptCount : Nat
  deterministicComponents : List DeterministicComponent
  deriving DecidableEq, Repr, BEq

def executionAllowed
    (policy : ApprovedExecutionPolicy)
    (execution : ExecutionMetadata) : Bool :=
  decide (execution.providerAdapterId = policy.providerAdapterId) &&
  (policy.allowedModelIds.contains execution.modelId &&
  (policy.allowedProtocolVersions.contains execution.protocolVersion &&
  (policy.allowedPromptVersions.contains execution.promptVersion &&
  (policy.allowedRoutingDecisionCodes.contains execution.routingDecisionCode &&
  (decide (0 < execution.attemptCount) &&
  (decide (execution.attemptCount ≤ policy.maxAttemptCount) &&
  match execution.escalationReasonCode with
  | none => policy.allowNoEscalation
  | some reason => policy.allowedEscalationReasonCodes.contains reason))))))

def issuerAllowed
    (policy : ApprovedExecutionPolicy)
    (execution : ExecutionMetadata)
    (issuer : AssertionIssuer)
    (classification : AssertionClass) : Bool :=
  match issuer, classification with
  | .deterministic component, .documentObservation =>
      policy.deterministicComponents.contains component
  | .deterministic component, .deterministicCheck =>
      policy.deterministicComponents.contains component
  | .agent executionId, .agentInterpretation =>
      decide (executionId = execution.executionId)
  | .agent executionId, .agentProposal =>
      decide (executionId = execution.executionId)
  | .agent executionId, .agentUncertainty =>
      decide (executionId = execution.executionId)
  | _, _ => false

structure AssertionProjection where
  entryId : String
  classification : AssertionClass
  issuer : AssertionIssuer
  evidenceCertificateIds : List CertificateId
  blocking : Bool
  deriving DecidableEq, Repr, BEq

def assertionValid
    (certificateResolved : CertificateId → Bool)
    (policy : ApprovedExecutionPolicy)
    (execution : ExecutionMetadata)
    (assertion : AssertionProjection) : Bool :=
  decide (assertion.entryId ≠ "") &&
  (issuerAllowed policy execution assertion.issuer assertion.classification &&
  (decide (assertion.evidenceCertificateIds ≠ []) &&
  assertion.evidenceCertificateIds.all certificateResolved))

def uncertaintyEntryIds (assertions : List AssertionProjection) : List String :=
  assertions.filterMap fun assertion =>
    if assertion.classification == .agentUncertainty then
      some assertion.entryId
    else
      none

structure PacketCompleteParameters where
  snapshotId : String
  manifestDigest : String
  packetDigest : String
  ruleTrustRootDigest : String
  protocolVersion : String
  executionMetadataDigest : String
  executionPolicyDigest : String
  deriving DecidableEq, Repr, BEq

def PacketCompleteParameters.asJson
    (parameters : PacketCompleteParameters) : List (String × JsonValue) := [
  ("snapshot_id", .string parameters.snapshotId),
  ("manifest_digest", .string parameters.manifestDigest),
  ("packet_digest", .string parameters.packetDigest),
  ("rule_trust_root_digest", .string parameters.ruleTrustRootDigest),
  ("protocol_version", .string parameters.protocolVersion),
  ("execution_metadata_digest", .string parameters.executionMetadataDigest),
  ("execution_policy_digest", .string parameters.executionPolicyDigest)
]

def packetCompleteClaim
    (encodeParameters : EncodeClaimParameters)
    (parameters : PacketCompleteParameters) : ClaimKey := {
  claimId := "amendment-review-packet-complete"
  claimVersion := "1"
  canonicalParameters := encodeParameters parameters.asJson
}

/-!
The transfer workbench's public self-test signer is intentionally confined to
a claim namespace that is disjoint from every production review premise and
conclusion.  Runtime provisioning additionally rejects the exact public key ID
and SPKI anywhere in a production trust bundle; this smaller formal fact makes
the semantic namespace separation explicit without pretending to parse JSON or
public keys in Lean.
-/
def publicDiagnosticReviewClaimIds : List String := [
  "riddle-proof.diagnostic.snapshot-captured",
  "riddle-proof.diagnostic.required-roles-present",
  "riddle-proof.diagnostic.procedure-observed",
  "riddle-proof.diagnostic.snapshot-current-at-check",
  "riddle-proof.diagnostic.review-packet-complete"
]

def productionReviewClaimIds : List String := [
  "local-document-snapshot-captured",
  "local-document-required-roles-present",
  "amendment-review-procedure-observed",
  "local-document-snapshot-current-at-check",
  "amendment-review-packet-complete"
]

def claimIdListsDisjoint (left right : List String) : Bool :=
  left.all fun claimId => !(right.contains claimId)

theorem claim_id_lists_disjoint_sound
    {left right : List String}
    (hDisjoint : claimIdListsDisjoint left right = true) :
    ∀ claimId ∈ left, claimId ∉ right := by
  intro claimId hLeft hRight
  have hAbsent := List.all_eq_true.mp hDisjoint claimId hLeft
  simp [hRight] at hAbsent

theorem public_diagnostic_review_claim_ids_disjoint_from_production :
    claimIdListsDisjoint publicDiagnosticReviewClaimIds
      productionReviewClaimIds = true := by
  native_decide

structure ReviewReceiptProjection where
  snapshotId : String
  manifestDigest : String
  packetDigest : String
  ruleTrustRoot : RuleTrustRootRef
  evidenceTrustRoot : EvidenceTemplateTrustRootRef
  protocolVersion : String
  execution : ExecutionMetadata
  executionMetadataDigest : String
  assertions : List AssertionProjection
  uncertaintyEntryIds : List String
  checkedRootCertificateId : CertificateId
  currentnessCertificateId : CertificateId
  /-- Exact ISO-8601 text carried by the content-addressed receipt. -/
  issuedAtText : String
  /-- Milliseconds obtained only through the supplied parser relation. -/
  issuedAtMs : Nat
  deriving DecidableEq, Repr, BEq

/-!
This is the deterministic, content-free projection parsed from the privileged
packet bytes.  The bytes, canonical parser, and digest implementation remain
runtime premises; `packetProjectionBound` below prevents the formal model from
silently starting only after the packet/receipt comparison.
-/
structure PrivilegedReviewPacketProjection where
  snapshotId : String
  manifestDigest : String
  packetDigest : String
  ruleTrustRoot : RuleTrustRootRef
  protocolVersion : String
  executionMetadataDigest : String
  assertions : List AssertionProjection
  uncertaintyEntryIds : List String
  deriving DecidableEq, Repr, BEq

structure CheckedReviewRoot where
  certificateId : CertificateId
  scope : Scope
  claim : ClaimKey
  tree : MeaningTree
  deriving Repr

/-!
Direct projection of the runtime's N-ary packet-complete root.  This is not an
opaque "parity accepted" bit.  The acceptance predicate checks the exact rule
reference, exact four premise IDs and claims, shared scope, and conclusion.
The general runtime N-ary interpreter is still outside Lean; this structure
models only the public amendment packet rule exercised by the local E2E path.
-/
structure RuntimePacketRootProjection where
  certificateId : CertificateId
  scope : Scope
  rule : RuntimeCheckedMeaningRuleRef
  /-- Exact canonical composite-certificate body witness. -/
  canonicalBodyWitness : String
  /-- Parsed from the root canonical body, not accepted as producer metadata. -/
  issuedAt : Nat
  premiseCertificateIds : List CertificateId
  premiseClaims : List ClaimKey
  conclusion : ClaimKey
  deriving DecidableEq, Repr, BEq

/-!
The full deterministic projection of the exact canonical root body.  Certificate
addressing/digest fidelity remains a runtime premise, but the supplied extractor
must return every field that the four-premise gate consumes.  In particular,
premise IDs/claims and the designated currentness position cannot be supplied
independently from the signed/content-addressed root witness.
-/
structure CanonicalRuntimePacketRootProjection where
  certificateId : CertificateId
  scope : Scope
  rule : RuntimeCheckedMeaningRuleRef
  issuedAt : Nat
  premiseCertificateIds : List CertificateId
  premiseClaims : List ClaimKey
  conclusion : ClaimKey
  deriving DecidableEq, Repr, BEq

def RuntimePacketRootProjection.canonicalProjection
    (root : RuntimePacketRootProjection) : CanonicalRuntimePacketRootProjection := {
  certificateId := root.certificateId
  scope := root.scope
  rule := root.rule
  issuedAt := root.issuedAt
  premiseCertificateIds := root.premiseCertificateIds
  premiseClaims := root.premiseClaims
  conclusion := root.conclusion
}

abbrev RuntimePacketRootProjectionFromCanonicalBody :=
  String → Option CanonicalRuntimePacketRootProjection

def RuntimePacketRootProjection.canonicalBodyBound
    (extract : RuntimePacketRootProjectionFromCanonicalBody)
    (root : RuntimePacketRootProjection) : Bool :=
  decide (extract root.canonicalBodyWitness = some root.canonicalProjection)

structure CurrentnessPolicy where
  now : Nat
  maxAge : Nat
  maxFutureSkew : Nat
  deriving DecidableEq, Repr, BEq

structure GroundedEvidencePolicy where
  now : Nat
  maxAge : Nat
  maxFutureSkew : Nat
  deriving DecidableEq, Repr, BEq

structure CurrentnessWitness where
  expectedSnapshotId : String
  expectedManifestDigest : String
  observedSnapshotId : String
  observedManifestDigest : String
  /-- Exact ISO-8601 text carried by the claim. -/
  checkedAtText : String
  /-- Milliseconds obtained only through the supplied parser relation. -/
  checkedAtMs : Nat
  certificateId : CertificateId
  deriving DecidableEq, Repr, BEq

abbrev ParseIsoMilliseconds := String → Option Nat

def CurrentnessWitness.freshUnder
    (parseIsoMilliseconds : ParseIsoMilliseconds)
    (policy : CurrentnessPolicy)
    (witness : CurrentnessWitness) : Bool :=
  decide (parseIsoMilliseconds witness.checkedAtText = some witness.checkedAtMs) &&
  (decide (witness.checkedAtMs ≤ policy.now + policy.maxFutureSkew) &&
  decide (policy.now ≤ witness.checkedAtMs + policy.maxAge))

def snapshotClaim
    (encodeParameters : EncodeClaimParameters)
    (snapshotId manifestDigest : String) : ClaimKey := {
  claimId := "local-document-snapshot-captured"
  claimVersion := "1"
  canonicalParameters := encodeParameters [
    ("snapshot_id", .string snapshotId),
    ("manifest_digest", .string manifestDigest)
  ]
}

def requiredRolesClaim
    (encodeParameters : EncodeClaimParameters)
    (snapshotId manifestDigest : String) : ClaimKey := {
  claimId := "local-document-required-roles-present"
  claimVersion := "1"
  canonicalParameters := encodeParameters [
    ("snapshot_id", .string snapshotId),
    ("manifest_digest", .string manifestDigest)
  ]
}

def currentnessClaim
    (encodeParameters : EncodeClaimParameters)
    (witness : CurrentnessWitness) : ClaimKey := {
  claimId := "local-document-snapshot-current-at-check"
  claimVersion := "1"
  canonicalParameters := encodeParameters [
    ("snapshot_id", .string witness.expectedSnapshotId),
    ("manifest_digest", .string witness.expectedManifestDigest),
    ("checked_at", .string witness.checkedAtText)
  ]
}

def procedureObservedClaim
    (encodeParameters : EncodeClaimParameters)
    (parameters : PacketCompleteParameters) : ClaimKey := {
  claimId := "amendment-review-procedure-observed"
  claimVersion := "1"
  canonicalParameters := encodeParameters parameters.asJson
}

structure ReviewAuthority where
  expectedRuleTrustRoot : RuleTrustRootRef
  expectedEvidenceTrustRoot : EvidenceTemplateTrustRootRef
  expectedScope : Scope
  expectedRootCertificateId : CertificateId
  expectedRootRule : RuntimeCheckedMeaningRuleRef
  expectedProtocolVersion : String
  executionPolicy : ApprovedExecutionPolicy
  groundedEvidencePolicy : GroundedEvidencePolicy
  currentnessPolicy : CurrentnessPolicy
  deriving DecidableEq, Repr, BEq

structure ReviewAcceptanceInput where
  authority : ReviewAuthority
  ruleBundle : RuleTrustBundle
  evidenceBundle : EvidenceTemplateTrustBundle
  receipt : ReviewReceiptProjection
  privilegedPacket : PrivilegedReviewPacketProjection
  root : CheckedReviewRoot
  runtimeRoot : RuntimePacketRootProjection
  replayRecords : List ReplayCertificateRecord
  currentness : CurrentnessWitness
  deriving Repr

abbrev DigestExecutionMetadata := ExecutionMetadata → String
abbrev DigestExecutionPolicy := ApprovedExecutionPolicy → String

def authorityResolved
    (digestRuleBundle : DigestRuleTrustBundle)
    (digestEvidenceBundle : DigestEvidenceTemplateBundle)
    (input : ReviewAcceptanceInput) : Bool :=
  input.ruleBundle.resolves digestRuleBundle
      input.authority.expectedRuleTrustRoot &&
  (input.ruleBundle.resolvesRuntimeRule input.authority.expectedRootRule &&
  (input.evidenceBundle.resolves digestEvidenceBundle
      input.authority.expectedEvidenceTrustRoot &&
  (input.receipt.ruleTrustRoot.matchesExpected
      input.authority.expectedRuleTrustRoot &&
  input.receipt.evidenceTrustRoot.matchesExpected
      input.authority.expectedEvidenceTrustRoot)))

def receiptPacketProjection
    (receipt : ReviewReceiptProjection) : PrivilegedReviewPacketProjection := {
  snapshotId := receipt.snapshotId
  manifestDigest := receipt.manifestDigest
  packetDigest := receipt.packetDigest
  ruleTrustRoot := receipt.ruleTrustRoot
  protocolVersion := receipt.protocolVersion
  executionMetadataDigest := receipt.executionMetadataDigest
  assertions := receipt.assertions
  uncertaintyEntryIds := receipt.uncertaintyEntryIds
}

def packetProjectionBound (input : ReviewAcceptanceInput) : Bool :=
  decide (input.privilegedPacket = receiptPacketProjection input.receipt)

def executionBound
    (digestExecution : DigestExecutionMetadata)
    (input : ReviewAcceptanceInput) : Bool :=
  executionAllowed input.authority.executionPolicy input.receipt.execution &&
  (decide (digestExecution input.receipt.execution =
      input.receipt.executionMetadataDigest) &&
  (decide (input.receipt.protocolVersion =
      input.authority.expectedProtocolVersion) &&
  decide (input.receipt.execution.protocolVersion =
      input.authority.expectedProtocolVersion)))

def rootBound
    (digestRuleDefinition : DigestRuleDefinition)
    (digestExecutionPolicy : DigestExecutionPolicy)
    (encodeParameters : EncodeClaimParameters)
    (input : ReviewAcceptanceInput) : Bool :=
  let expectedParameters : PacketCompleteParameters := {
    snapshotId := input.receipt.snapshotId
    manifestDigest := input.receipt.manifestDigest
    packetDigest := input.receipt.packetDigest
    ruleTrustRootDigest := input.receipt.ruleTrustRoot.bundleDigest
    protocolVersion := input.receipt.protocolVersion
    executionMetadataDigest := input.receipt.executionMetadataDigest
    executionPolicyDigest := digestExecutionPolicy input.authority.executionPolicy
  }
  decide (input.receipt.checkedRootCertificateId =
      input.authority.expectedRootCertificateId) &&
  (decide (input.root.certificateId = input.receipt.checkedRootCertificateId) &&
  (decide (input.root.scope = input.authority.expectedScope) &&
  (decide (input.root.claim = packetCompleteClaim encodeParameters expectedParameters) &&
  (decide (input.root.tree.rootScope = input.root.scope) &&
  (decide (input.root.tree.rootClaim = input.root.claim) &&
  structurallyChecked digestRuleDefinition input.ruleBundle.registry
    input.root.tree)))))

def ReplayCertificateRecord.certificateChronologyBound
    (issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody)
    (record : ReplayCertificateRecord) : Bool :=
  decide (issuedAtFromCanonicalBody record.canonicalBodyWitness =
      some record.issuedAt)

/-!
Grounded freshness is measured from the signed capture statement's
`captured_at`, never from the later certificate issuance time.  Extraction of
the ISO text from the canonical signed statement and ISO-to-millisecond parsing
are independent deterministic runtime premises.
-/
def ReplayCertificateRecord.captureFresh
    (capturedAtTextFromCanonicalStatement :
      CapturedAtTextFromCanonicalStatement)
    (parseIsoMilliseconds : ParseIsoMilliseconds)
    (policy : GroundedEvidencePolicy)
    (record : ReplayCertificateRecord) : Bool :=
  record.exactArtifactMetadata capturedAtTextFromCanonicalStatement &&
  (decide (parseIsoMilliseconds record.capturedAtText =
      some record.capturedAtMs) &&
  (decide (record.capturedAtMs ≤ record.issuedAt) &&
  (decide (record.capturedAtMs ≤ policy.now + policy.maxFutureSkew) &&
  decide (policy.now ≤ record.capturedAtMs + policy.maxAge))))

def exactReplayLeafCover (input : ReviewAcceptanceInput) : Bool :=
  let leaves := MeaningTree.reachableGroundedLeaves input.root.tree
  let recordIds := input.replayRecords.map ReplayCertificateRecord.certificateId
  let leafIds := leaves.map GroundedLeaf.certificateId
  decide (input.replayRecords ≠ []) &&
  (decide (leaves ≠ []) &&
  (decide recordIds.Nodup &&
  (decide leafIds.Nodup &&
  ((input.replayRecords.all fun record =>
    leaves.any fun leaf => decide (record.leafRef = GroundedLeaf.replayRef leaf)) &&
  (leaves.all fun leaf =>
    input.replayRecords.any fun record =>
      decide (record.leafRef = GroundedLeaf.replayRef leaf))))))

def replayClosureBound
    (issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody)
    (capturedAtTextFromCanonicalStatement :
      CapturedAtTextFromCanonicalStatement)
    (parseIsoMilliseconds : ParseIsoMilliseconds)
    (selectObservation : SelectObservationPointer)
    (selectScope : SelectScopePointer)
    (digestContract : DigestMaterializedContract)
    (encodeParameters : EncodeClaimParameters)
    (replayAccepted : ReplayAccepted)
    (input : ReviewAcceptanceInput) : Bool :=
  exactReplayLeafCover input &&
  ((input.replayRecords.all fun record =>
    replayRecordValid selectObservation selectScope digestContract
      encodeParameters replayAccepted input.evidenceBundle record) &&
  ((input.replayRecords.all
    (ReplayCertificateRecord.certificateChronologyBound
      issuedAtFromCanonicalBody)) &&
  input.replayRecords.all
    (ReplayCertificateRecord.captureFresh
      capturedAtTextFromCanonicalStatement parseIsoMilliseconds
      input.authority.groundedEvidencePolicy)))

def expectedPacketParameters
    (digestExecutionPolicy : DigestExecutionPolicy)
    (input : ReviewAcceptanceInput) : PacketCompleteParameters := {
  snapshotId := input.receipt.snapshotId
  manifestDigest := input.receipt.manifestDigest
  packetDigest := input.receipt.packetDigest
  ruleTrustRootDigest := input.receipt.ruleTrustRoot.bundleDigest
  protocolVersion := input.receipt.protocolVersion
  executionMetadataDigest := input.receipt.executionMetadataDigest
  executionPolicyDigest := digestExecutionPolicy input.authority.executionPolicy
}

def expectedRuntimePacketPremiseClaims
    (digestExecutionPolicy : DigestExecutionPolicy)
    (encodeParameters : EncodeClaimParameters)
    (input : ReviewAcceptanceInput) : List ClaimKey := [
  snapshotClaim encodeParameters input.receipt.snapshotId input.receipt.manifestDigest,
  requiredRolesClaim encodeParameters input.receipt.snapshotId input.receipt.manifestDigest,
  procedureObservedClaim encodeParameters
    (expectedPacketParameters digestExecutionPolicy input),
  currentnessClaim encodeParameters input.currentness
]

def runtimePremiseRecordsResolve (input : ReviewAcceptanceInput) : Bool :=
  (input.runtimeRoot.premiseCertificateIds.zip
    input.runtimeRoot.premiseClaims).all fun premise =>
      input.replayRecords.any fun record =>
        decide (record.certificateId = premise.1 ∧
          record.scope = input.runtimeRoot.scope ∧ record.claim = premise.2)

def exactOrderedRuntimePremiseRecords
    (input : ReviewAcceptanceInput) : Bool :=
  decide (input.runtimeRoot.premiseCertificateIds =
      input.replayRecords.map ReplayCertificateRecord.certificateId) &&
  decide (input.runtimeRoot.premiseClaims =
      input.replayRecords.map ReplayCertificateRecord.claim)

/-!
The formal amendment path is intentionally the exact four-grounded-leaf
specialization.  This relation binds the binary auxiliary tree's ordered leaf
frontier to the canonical root's exact ordered direct premises.  It does not
identify the auxiliary tree's internal binary topology or intermediate rules;
those remain subject to `structurallyChecked`.  General nested N-ary runtime
closures remain outside this model.
-/
def exactRuntimePremiseTreeLeaves (input : ReviewAcceptanceInput) : Bool :=
  let leaves := MeaningTree.reachableGroundedLeaves input.root.tree
  decide (input.runtimeRoot.premiseCertificateIds =
      leaves.map GroundedLeaf.certificateId) &&
  decide (input.runtimeRoot.premiseClaims = leaves.map GroundedLeaf.claim)

def adjacentPremiseIssuanceNondecreasing
    (records : List ReplayCertificateRecord) : Bool :=
  (records.zip records.tail).all fun pair =>
    decide (pair.1.issuedAt ≤ pair.2.issuedAt)

def runtimePacketRuleMaxAgeMs : Nat := 60000

def runtimePremiseChronologyBound
    (issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody)
    (input : ReviewAcceptanceInput) : Bool :=
  decide (issuedAtFromCanonicalBody input.runtimeRoot.canonicalBodyWitness =
      some input.runtimeRoot.issuedAt) &&
  (decide (input.runtimeRoot.issuedAt ≤
      input.authority.groundedEvidencePolicy.now +
        input.authority.groundedEvidencePolicy.maxFutureSkew) &&
  (adjacentPremiseIssuanceNondecreasing input.replayRecords &&
  input.replayRecords.all fun record =>
    decide (record.issuedAt ≤ input.runtimeRoot.issuedAt) &&
    decide (input.runtimeRoot.issuedAt ≤
      record.issuedAt + runtimePacketRuleMaxAgeMs)))

def runtimePacketRuleBound
    (issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody)
    (runtimeRootFromCanonicalBody :
      RuntimePacketRootProjectionFromCanonicalBody)
    (digestExecutionPolicy : DigestExecutionPolicy)
    (encodeParameters : EncodeClaimParameters)
    (input : ReviewAcceptanceInput) : Bool :=
  let expectedParameters := expectedPacketParameters digestExecutionPolicy input
  let expectedPremises := expectedRuntimePacketPremiseClaims
    digestExecutionPolicy encodeParameters input
  input.runtimeRoot.canonicalBodyBound runtimeRootFromCanonicalBody &&
  (decide (input.runtimeRoot.certificateId =
      input.authority.expectedRootCertificateId) &&
  (decide (input.runtimeRoot.certificateId = input.root.certificateId) &&
  (decide (input.runtimeRoot.scope = input.authority.expectedScope) &&
  (decide (input.runtimeRoot.scope = input.root.scope) &&
  (decide (input.root.tree.rootScope = input.runtimeRoot.scope) &&
  (decide (input.root.tree.rootClaim = input.runtimeRoot.conclusion) &&
  (decide (input.runtimeRoot.rule = input.authority.expectedRootRule) &&
  (decide (input.runtimeRoot.premiseCertificateIds.length = 4) &&
  (decide input.runtimeRoot.premiseCertificateIds.Nodup &&
  (decide (input.runtimeRoot.premiseClaims = expectedPremises) &&
  (exactOrderedRuntimePremiseRecords input &&
  (exactRuntimePremiseTreeLeaves input &&
  (decide (input.runtimeRoot.premiseCertificateIds[3]? =
      some input.receipt.currentnessCertificateId) &&
  (runtimePremiseRecordsResolve input &&
  (runtimePremiseChronologyBound issuedAtFromCanonicalBody input &&
  (decide (input.runtimeRoot.conclusion =
      packetCompleteClaim encodeParameters expectedParameters) &&
  decide (input.runtimeRoot.conclusion = input.root.claim)))))))))))))))))

def assertionsBound
    (selectObservation : SelectObservationPointer)
    (selectScope : SelectScopePointer)
    (digestContract : DigestMaterializedContract)
    (encodeParameters : EncodeClaimParameters)
    (replayAccepted : ReplayAccepted)
    (input : ReviewAcceptanceInput) : Bool :=
  let certificateResolved := resolvedCertificate selectObservation selectScope
    digestContract encodeParameters replayAccepted input.evidenceBundle
    input.replayRecords
  decide (input.receipt.assertions ≠ []) &&
  (decide (input.receipt.assertions.map AssertionProjection.entryId).Nodup &&
  (input.receipt.assertions.all
      (assertionValid certificateResolved input.authority.executionPolicy
        input.receipt.execution) &&
  decide (input.receipt.uncertaintyEntryIds =
    uncertaintyEntryIds input.receipt.assertions)))

def currentnessBound
    (parseIsoMilliseconds : ParseIsoMilliseconds)
    (selectObservation : SelectObservationPointer)
    (selectScope : SelectScopePointer)
    (digestContract : DigestMaterializedContract)
    (encodeParameters : EncodeClaimParameters)
    (replayAccepted : ReplayAccepted)
    (input : ReviewAcceptanceInput) : Bool :=
  let exactClaim := resolvedExactClaim selectObservation selectScope
    digestContract encodeParameters replayAccepted input.evidenceBundle
    input.replayRecords input.authority.expectedScope
  let exactCurrentnessRecord := input.replayRecords.any fun record =>
    decide (record.certificateId = input.receipt.currentnessCertificateId ∧
      record.scope = input.authority.expectedScope ∧
      record.claim = currentnessClaim encodeParameters input.currentness ∧
      input.currentness.checkedAtMs ≤ record.issuedAt) &&
    replayRecordValid selectObservation selectScope digestContract
      encodeParameters replayAccepted input.evidenceBundle record
  decide (input.currentness.expectedSnapshotId = input.receipt.snapshotId) &&
  (decide (input.currentness.observedSnapshotId = input.receipt.snapshotId) &&
  (decide (input.currentness.expectedManifestDigest = input.receipt.manifestDigest) &&
  (decide (input.currentness.observedManifestDigest = input.receipt.manifestDigest) &&
  (decide (input.currentness.certificateId =
      input.receipt.currentnessCertificateId) &&
  (input.currentness.freshUnder parseIsoMilliseconds
      input.authority.currentnessPolicy &&
  (exactClaim (snapshotClaim encodeParameters input.receipt.snapshotId
      input.receipt.manifestDigest) &&
  exactCurrentnessRecord))))))

/-!
The runtime accepts one explicit verification time and one future-skew value.
Keeping two policy projections is useful for their distinct age limits, but
they may not disagree about that shared clock or skew.
-/
def receiptChronologyBound
    (parseIsoMilliseconds : ParseIsoMilliseconds)
    (input : ReviewAcceptanceInput) : Bool :=
  decide (parseIsoMilliseconds input.receipt.issuedAtText =
      some input.receipt.issuedAtMs) &&
  (decide (input.runtimeRoot.issuedAt ≤ input.receipt.issuedAtMs) &&
  decide (input.receipt.issuedAtMs ≤
      input.authority.currentnessPolicy.now +
        input.authority.currentnessPolicy.maxFutureSkew))

def verificationPoliciesAligned
    (parseIsoMilliseconds : ParseIsoMilliseconds)
    (input : ReviewAcceptanceInput) : Bool :=
  decide (input.authority.groundedEvidencePolicy.now =
      input.authority.currentnessPolicy.now) &&
  (decide (input.authority.groundedEvidencePolicy.maxFutureSkew =
      input.authority.currentnessPolicy.maxFutureSkew) &&
  receiptChronologyBound parseIsoMilliseconds input)

/-!
The one post-parse deterministic acceptance boundary.  Its nine named
conjuncts make packet projection, grounded closure coverage, the direct N-ary
packet rule, and currentness independently visible.  It does not treat model
agreement as verification.
-/
def reviewAccepted
    (digestRuleBundle : DigestRuleTrustBundle)
    (digestEvidenceBundle : DigestEvidenceTemplateBundle)
    (digestRuleDefinition : DigestRuleDefinition)
    (digestExecution : DigestExecutionMetadata)
    (digestExecutionPolicy : DigestExecutionPolicy)
    (issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody)
    (runtimeRootFromCanonicalBody :
      RuntimePacketRootProjectionFromCanonicalBody)
    (capturedAtTextFromCanonicalStatement :
      CapturedAtTextFromCanonicalStatement)
    (parseIsoMilliseconds : ParseIsoMilliseconds)
    (selectObservation : SelectObservationPointer)
    (selectScope : SelectScopePointer)
    (digestContract : DigestMaterializedContract)
    (encodeParameters : EncodeClaimParameters)
    (replayAccepted : ReplayAccepted)
    (input : ReviewAcceptanceInput) : Bool :=
  authorityResolved digestRuleBundle digestEvidenceBundle input &&
  (packetProjectionBound input &&
  (executionBound digestExecution input &&
  (rootBound digestRuleDefinition digestExecutionPolicy encodeParameters input &&
  (replayClosureBound issuedAtFromCanonicalBody
      capturedAtTextFromCanonicalStatement parseIsoMilliseconds
      selectObservation selectScope digestContract encodeParameters
      replayAccepted input &&
  (runtimePacketRuleBound issuedAtFromCanonicalBody
      runtimeRootFromCanonicalBody digestExecutionPolicy
      encodeParameters input &&
  (assertionsBound selectObservation selectScope digestContract encodeParameters
      replayAccepted input &&
  (currentnessBound parseIsoMilliseconds selectObservation selectScope
      digestContract encodeParameters replayAccepted input &&
  verificationPoliciesAligned parseIsoMilliseconds input)))))))

theorem review_accepted_implies_all_authority_and_binding_facts
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hAccepted : reviewAccepted digestRuleBundle digestEvidenceBundle
      digestRuleDefinition digestExecution digestExecutionPolicy
      issuedAtFromCanonicalBody runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement parseIsoMilliseconds selectObservation
      selectScope digestContract encodeParameters
      replayAccepted input = true) :
    authorityResolved digestRuleBundle digestEvidenceBundle input = true ∧
    packetProjectionBound input = true ∧
    executionBound digestExecution input = true ∧
    rootBound digestRuleDefinition digestExecutionPolicy encodeParameters input = true ∧
    replayClosureBound issuedAtFromCanonicalBody
      capturedAtTextFromCanonicalStatement parseIsoMilliseconds
      selectObservation selectScope digestContract encodeParameters
      replayAccepted input = true ∧
    runtimePacketRuleBound issuedAtFromCanonicalBody runtimeRootFromCanonicalBody digestExecutionPolicy
      encodeParameters input = true ∧
    assertionsBound selectObservation selectScope digestContract encodeParameters
      replayAccepted input = true ∧
    currentnessBound parseIsoMilliseconds selectObservation selectScope
      digestContract encodeParameters
      replayAccepted input = true ∧
    verificationPoliciesAligned parseIsoMilliseconds input = true := by
  simpa [reviewAccepted] using hAccepted

theorem review_accepted_implies_exact_independent_authority
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hAccepted : reviewAccepted digestRuleBundle digestEvidenceBundle
      digestRuleDefinition digestExecution digestExecutionPolicy
      issuedAtFromCanonicalBody runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement parseIsoMilliseconds selectObservation
      selectScope digestContract encodeParameters
      replayAccepted input = true) :
    input.ruleBundle.reference digestRuleBundle =
        input.authority.expectedRuleTrustRoot ∧
    input.evidenceBundle.reference digestEvidenceBundle =
        input.authority.expectedEvidenceTrustRoot ∧
    input.authority.expectedRootRule ∈ input.ruleBundle.runtimeRuleRefs ∧
    input.receipt.ruleTrustRoot = input.authority.expectedRuleTrustRoot ∧
    input.receipt.evidenceTrustRoot = input.authority.expectedEvidenceTrustRoot := by
  have hFacts := review_accepted_implies_all_authority_and_binding_facts hAccepted
  have hAuthority := hFacts.1
  simp only [authorityResolved, Bool.and_eq_true] at hAuthority
  exact ⟨(RuleTrustRootRef.matchesExpected_iff_exact _ _).mp hAuthority.1,
    (resolved_evidence_bundle_is_well_formed_and_exact hAuthority.2.2.1).2,
    resolved_runtime_rule_is_exact_bundle_member hAuthority.2.1,
    (RuleTrustRootRef.matchesExpected_iff_exact _ _).mp hAuthority.2.2.2.1,
    (EvidenceTemplateTrustRootRef.matchesExpected_iff_exact _ _).mp
      hAuthority.2.2.2.2⟩

theorem review_accepted_implies_execution_policy_and_exact_root_claim
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hAccepted : reviewAccepted digestRuleBundle digestEvidenceBundle
      digestRuleDefinition digestExecution digestExecutionPolicy
      issuedAtFromCanonicalBody runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement parseIsoMilliseconds selectObservation
      selectScope digestContract encodeParameters
      replayAccepted input = true) :
    executionAllowed input.authority.executionPolicy input.receipt.execution = true ∧
    digestExecution input.receipt.execution = input.receipt.executionMetadataDigest ∧
    input.root.claim = packetCompleteClaim encodeParameters {
      snapshotId := input.receipt.snapshotId
      manifestDigest := input.receipt.manifestDigest
      packetDigest := input.receipt.packetDigest
      ruleTrustRootDigest := input.receipt.ruleTrustRoot.bundleDigest
      protocolVersion := input.receipt.protocolVersion
      executionMetadataDigest := input.receipt.executionMetadataDigest
      executionPolicyDigest := digestExecutionPolicy input.authority.executionPolicy
    } := by
  have hFacts := review_accepted_implies_all_authority_and_binding_facts hAccepted
  have hExecution := hFacts.2.2.1
  have hRoot := hFacts.2.2.2.1
  simp only [executionBound, Bool.and_eq_true] at hExecution
  simp only [rootBound, Bool.and_eq_true] at hRoot
  exact ⟨hExecution.1, of_decide_eq_true hExecution.2.1,
    of_decide_eq_true hRoot.2.2.2.1⟩

theorem review_accepted_implies_assertion_evidence_replay_resolves
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hAccepted : reviewAccepted digestRuleBundle digestEvidenceBundle
      digestRuleDefinition digestExecution digestExecutionPolicy
      issuedAtFromCanonicalBody runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement parseIsoMilliseconds selectObservation
      selectScope digestContract encodeParameters
      replayAccepted input = true) :
    ∀ assertion ∈ input.receipt.assertions,
      issuerAllowed input.authority.executionPolicy input.receipt.execution
        assertion.issuer assertion.classification = true ∧
      assertion.evidenceCertificateIds ≠ [] ∧
      ∀ certificateId ∈ assertion.evidenceCertificateIds,
        resolvedCertificate selectObservation selectScope digestContract
          encodeParameters replayAccepted input.evidenceBundle
          input.replayRecords certificateId = true := by
  have hFacts := review_accepted_implies_all_authority_and_binding_facts hAccepted
  have hAssertionsBound := hFacts.2.2.2.2.2.2.1
  simp only [assertionsBound, Bool.and_eq_true] at hAssertionsBound
  have hAssertions := hAssertionsBound.2.2.1
  intro assertion hAssertion
  have hValid := (List.all_eq_true.mp hAssertions) assertion hAssertion
  simp only [assertionValid, Bool.and_eq_true] at hValid
  exact ⟨hValid.2.1, of_decide_eq_true hValid.2.2.1,
    List.all_eq_true.mp hValid.2.2.2⟩

theorem changed_execution_policy_digest_prevents_review_acceptance
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hMismatch : input.root.claim ≠ packetCompleteClaim encodeParameters {
      snapshotId := input.receipt.snapshotId
      manifestDigest := input.receipt.manifestDigest
      packetDigest := input.receipt.packetDigest
      ruleTrustRootDigest := input.receipt.ruleTrustRoot.bundleDigest
      protocolVersion := input.receipt.protocolVersion
      executionMetadataDigest := input.receipt.executionMetadataDigest
      executionPolicyDigest := digestExecutionPolicy input.authority.executionPolicy
    }) :
    reviewAccepted digestRuleBundle digestEvidenceBundle digestRuleDefinition
      digestExecution digestExecutionPolicy issuedAtFromCanonicalBody
      runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement parseIsoMilliseconds selectObservation selectScope digestContract
      encodeParameters replayAccepted input = false := by
  simp [reviewAccepted, rootBound, hMismatch]

theorem review_accepted_implies_exact_four_premise_runtime_rule
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hAccepted : reviewAccepted digestRuleBundle digestEvidenceBundle
      digestRuleDefinition digestExecution digestExecutionPolicy
      issuedAtFromCanonicalBody runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement parseIsoMilliseconds selectObservation
      selectScope digestContract encodeParameters replayAccepted input = true) :
    input.runtimeRoot.rule = input.authority.expectedRootRule ∧
    input.runtimeRoot.premiseCertificateIds.length = 4 ∧
    input.runtimeRoot.premiseClaims = expectedRuntimePacketPremiseClaims
      digestExecutionPolicy encodeParameters input ∧
    input.runtimeRoot.premiseCertificateIds[3]? =
      some input.receipt.currentnessCertificateId ∧
    runtimePremiseRecordsResolve input = true ∧
    exactOrderedRuntimePremiseRecords input = true ∧
    exactRuntimePremiseTreeLeaves input = true ∧
    runtimePremiseChronologyBound issuedAtFromCanonicalBody input = true := by
  have hFacts := review_accepted_implies_all_authority_and_binding_facts hAccepted
  have hRuntime := hFacts.2.2.2.2.2.1
  simp only [runtimePacketRuleBound, Bool.and_eq_true] at hRuntime
  obtain ⟨_, _, _, _, _, _, _, hRule, hLength, _, hClaims, hExact,
    hTreeLeaves, hCurrent,
    hResolve, hChronology, _, _⟩ := hRuntime
  exact ⟨of_decide_eq_true hRule, of_decide_eq_true hLength,
    of_decide_eq_true hClaims, of_decide_eq_true hCurrent,
    hResolve, hExact, hTreeLeaves, hChronology⟩

theorem runtime_packet_rule_bound_binds_canonical_root_and_ordered_leaf_frontier
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {encodeParameters : EncodeClaimParameters}
    {input : ReviewAcceptanceInput}
    (hBound : runtimePacketRuleBound issuedAtFromCanonicalBody
      runtimeRootFromCanonicalBody digestExecutionPolicy
      encodeParameters input = true) :
    runtimeRootFromCanonicalBody input.runtimeRoot.canonicalBodyWitness =
        some input.runtimeRoot.canonicalProjection ∧
    input.runtimeRoot.certificateId = input.root.certificateId ∧
    input.runtimeRoot.scope = input.root.scope ∧
    input.root.tree.rootScope = input.runtimeRoot.scope ∧
    input.root.tree.rootClaim = input.runtimeRoot.conclusion ∧
    input.runtimeRoot.premiseCertificateIds =
      (MeaningTree.reachableGroundedLeaves input.root.tree).map
        GroundedLeaf.certificateId ∧
    input.runtimeRoot.premiseClaims =
      (MeaningTree.reachableGroundedLeaves input.root.tree).map
        GroundedLeaf.claim ∧
    input.runtimeRoot.conclusion = input.root.claim := by
  simp only [runtimePacketRuleBound, Bool.and_eq_true] at hBound
  obtain ⟨hCanonical, _, hCertificate, _, hScope, hTreeScope,
    hTreeClaim, _, _, _, _, _, hPremiseLeaves, _, _, _, _, hConclusion⟩ := hBound
  simp only [RuntimePacketRootProjection.canonicalBodyBound] at hCanonical
  simp only [exactRuntimePremiseTreeLeaves, Bool.and_eq_true] at hPremiseLeaves
  exact ⟨of_decide_eq_true hCanonical,
    of_decide_eq_true hCertificate,
    of_decide_eq_true hScope,
    of_decide_eq_true hTreeScope,
    of_decide_eq_true hTreeClaim,
    of_decide_eq_true hPremiseLeaves.1,
    of_decide_eq_true hPremiseLeaves.2,
    of_decide_eq_true hConclusion⟩

theorem fabricated_runtime_premise_tree_fails_packet_rule
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {encodeParameters : EncodeClaimParameters}
    {input : ReviewAcceptanceInput}
    (hFabricated : exactRuntimePremiseTreeLeaves input = false) :
    runtimePacketRuleBound issuedAtFromCanonicalBody
      runtimeRootFromCanonicalBody digestExecutionPolicy
      encodeParameters input = false := by
  simp [runtimePacketRuleBound, hFabricated]

theorem fabricated_runtime_root_projection_fails_packet_rule
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {encodeParameters : EncodeClaimParameters}
    {input : ReviewAcceptanceInput}
    (hFabricated : runtimeRootFromCanonicalBody
      input.runtimeRoot.canonicalBodyWitness ≠
        some input.runtimeRoot.canonicalProjection) :
    runtimePacketRuleBound issuedAtFromCanonicalBody
      runtimeRootFromCanonicalBody digestExecutionPolicy
      encodeParameters input = false := by
  simp [runtimePacketRuleBound,
    RuntimePacketRootProjection.canonicalBodyBound, hFabricated]

theorem fabricated_runtime_root_projection_prevents_review_acceptance
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hFabricated : runtimeRootFromCanonicalBody
      input.runtimeRoot.canonicalBodyWitness ≠
        some input.runtimeRoot.canonicalProjection) :
    reviewAccepted digestRuleBundle digestEvidenceBundle digestRuleDefinition
      digestExecution digestExecutionPolicy issuedAtFromCanonicalBody
      runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement
      parseIsoMilliseconds selectObservation selectScope digestContract
      encodeParameters replayAccepted input = false := by
  have hRuntime := fabricated_runtime_root_projection_fails_packet_rule
    (issuedAtFromCanonicalBody := issuedAtFromCanonicalBody)
    (runtimeRootFromCanonicalBody := runtimeRootFromCanonicalBody)
    (digestExecutionPolicy := digestExecutionPolicy)
    (encodeParameters := encodeParameters)
    (input := input) hFabricated
  simp [reviewAccepted, hRuntime]

theorem fabricated_runtime_premise_tree_prevents_review_acceptance
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hFabricated : exactRuntimePremiseTreeLeaves input = false) :
    reviewAccepted digestRuleBundle digestEvidenceBundle digestRuleDefinition
      digestExecution digestExecutionPolicy issuedAtFromCanonicalBody
      runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement
      parseIsoMilliseconds selectObservation selectScope digestContract
      encodeParameters replayAccepted input = false := by
  have hRuntime := fabricated_runtime_premise_tree_fails_packet_rule
    (issuedAtFromCanonicalBody := issuedAtFromCanonicalBody)
    (runtimeRootFromCanonicalBody := runtimeRootFromCanonicalBody)
    (digestExecutionPolicy := digestExecutionPolicy)
    (encodeParameters := encodeParameters)
    (input := input) hFabricated
  simp [reviewAccepted, hRuntime]

theorem runtime_premise_chronology_bound_extracts_fixed_rule_constraints
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {input : ReviewAcceptanceInput}
    (hBound : runtimePremiseChronologyBound issuedAtFromCanonicalBody input = true) :
    issuedAtFromCanonicalBody input.runtimeRoot.canonicalBodyWitness =
        some input.runtimeRoot.issuedAt ∧
    input.runtimeRoot.issuedAt ≤
        input.authority.groundedEvidencePolicy.now +
          input.authority.groundedEvidencePolicy.maxFutureSkew ∧
    adjacentPremiseIssuanceNondecreasing input.replayRecords = true ∧
    ∀ record ∈ input.replayRecords,
      record.issuedAt ≤ input.runtimeRoot.issuedAt ∧
      input.runtimeRoot.issuedAt ≤
        record.issuedAt + runtimePacketRuleMaxAgeMs := by
  simp only [runtimePremiseChronologyBound, Bool.and_eq_true] at hBound
  refine ⟨of_decide_eq_true hBound.1, of_decide_eq_true hBound.2.1,
    hBound.2.2.1, ?_⟩
  intro record hRecord
  have hRecordBound := (List.all_eq_true.mp hBound.2.2.2) record hRecord
  simp only [Bool.and_eq_true] at hRecordBound
  exact ⟨of_decide_eq_true hRecordBound.1,
    of_decide_eq_true hRecordBound.2⟩

theorem out_of_order_premises_fail_runtime_chronology
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {input : ReviewAcceptanceInput}
    (hOutOfOrder : adjacentPremiseIssuanceNondecreasing
      input.replayRecords = false) :
    runtimePremiseChronologyBound issuedAtFromCanonicalBody input = false := by
  simp [runtimePremiseChronologyBound, hOutOfOrder]

theorem premise_older_than_fixed_rule_window_fails_runtime_chronology
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {input : ReviewAcceptanceInput}
    {record : ReplayCertificateRecord}
    (hRecord : record ∈ input.replayRecords)
    (hTooOld : record.issuedAt + runtimePacketRuleMaxAgeMs <
      input.runtimeRoot.issuedAt) :
    runtimePremiseChronologyBound issuedAtFromCanonicalBody input = false := by
  apply Bool.eq_false_iff.mpr
  intro hBound
  simp only [runtimePremiseChronologyBound, Bool.and_eq_true] at hBound
  have hRecordBound := (List.all_eq_true.mp hBound.2.2.2) record hRecord
  simp only [Bool.and_eq_true] at hRecordBound
  have hWithin := of_decide_eq_true hRecordBound.2
  omega

theorem review_accepted_implies_exact_ordered_runtime_record_chronology
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hAccepted : reviewAccepted digestRuleBundle digestEvidenceBundle
      digestRuleDefinition digestExecution digestExecutionPolicy
      issuedAtFromCanonicalBody runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement
      parseIsoMilliseconds selectObservation selectScope digestContract
      encodeParameters replayAccepted input = true) :
    input.runtimeRoot.premiseCertificateIds =
        input.replayRecords.map ReplayCertificateRecord.certificateId ∧
    input.runtimeRoot.premiseClaims =
        input.replayRecords.map ReplayCertificateRecord.claim ∧
    issuedAtFromCanonicalBody input.runtimeRoot.canonicalBodyWitness =
        some input.runtimeRoot.issuedAt ∧
    input.runtimeRoot.issuedAt ≤
        input.authority.groundedEvidencePolicy.now +
          input.authority.groundedEvidencePolicy.maxFutureSkew ∧
    adjacentPremiseIssuanceNondecreasing input.replayRecords = true ∧
    ∀ record ∈ input.replayRecords,
      record.issuedAt ≤ input.runtimeRoot.issuedAt ∧
      input.runtimeRoot.issuedAt ≤
        record.issuedAt + runtimePacketRuleMaxAgeMs := by
  have hFour := review_accepted_implies_exact_four_premise_runtime_rule hAccepted
  obtain ⟨_, _, _, _, _, hExact, _, hChronology⟩ := hFour
  simp only [exactOrderedRuntimePremiseRecords, Bool.and_eq_true] at hExact
  have hChronologyFacts :=
    runtime_premise_chronology_bound_extracts_fixed_rule_constraints hChronology
  exact ⟨of_decide_eq_true hExact.1, of_decide_eq_true hExact.2,
    hChronologyFacts⟩

theorem exact_replay_leaf_cover_record_is_reachable
    {input : ReviewAcceptanceInput}
    (hCover : exactReplayLeafCover input = true)
    {record : ReplayCertificateRecord}
    (hRecord : record ∈ input.replayRecords) :
    ∃ leaf ∈ MeaningTree.reachableGroundedLeaves input.root.tree,
      record.leafRef = GroundedLeaf.replayRef leaf := by
  simp only [exactReplayLeafCover, Bool.and_eq_true] at hCover
  have hForward := hCover.2.2.2.2.1
  have hFound := (List.all_eq_true.mp hForward) record hRecord
  obtain ⟨leaf, hLeaf, hSame⟩ := List.any_eq_true.mp hFound
  exact ⟨leaf, hLeaf, of_decide_eq_true hSame⟩

theorem review_accepted_implies_every_replay_record_is_same_root_reachable
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hAccepted : reviewAccepted digestRuleBundle digestEvidenceBundle
      digestRuleDefinition digestExecution digestExecutionPolicy
      issuedAtFromCanonicalBody runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement parseIsoMilliseconds selectObservation
      selectScope digestContract encodeParameters replayAccepted input = true) :
    ∀ record ∈ input.replayRecords,
      ∃ leaf ∈ MeaningTree.reachableGroundedLeaves input.root.tree,
        record.leafRef = GroundedLeaf.replayRef leaf ∧
        issuedAtFromCanonicalBody record.canonicalBodyWitness =
          some record.issuedAt ∧
        capturedAtTextFromCanonicalStatement
            record.canonicalSignedStatementWitness =
          some {
            capturedAtText := record.capturedAtText
            artifacts := record.observedArtifacts
          } ∧
        record.observedArtifacts = record.materialized.requiredArtifacts ∧
        (record.observedArtifacts.map
          EvidenceArtifactMetadata.artifactId).Nodup ∧
        (record.observedArtifacts.map
          EvidenceArtifactMetadata.role).Nodup ∧
        parseIsoMilliseconds record.capturedAtText =
          some record.capturedAtMs ∧
        record.capturedAtMs ≤ record.issuedAt ∧
        record.capturedAtMs ≤ input.authority.groundedEvidencePolicy.now +
          input.authority.groundedEvidencePolicy.maxFutureSkew ∧
        input.authority.groundedEvidencePolicy.now ≤
          record.capturedAtMs + input.authority.groundedEvidencePolicy.maxAge := by
  have hFacts := review_accepted_implies_all_authority_and_binding_facts hAccepted
  have hReplay := hFacts.2.2.2.2.1
  simp only [replayClosureBound, Bool.and_eq_true] at hReplay
  intro record hRecord
  obtain ⟨leaf, hLeaf, hSame⟩ :=
    exact_replay_leaf_cover_record_is_reachable hReplay.1 hRecord
  have hCertificate := (List.all_eq_true.mp hReplay.2.2.1) record hRecord
  have hCapture := (List.all_eq_true.mp hReplay.2.2.2) record hRecord
  simp only [ReplayCertificateRecord.certificateChronologyBound] at hCertificate
  simp only [ReplayCertificateRecord.captureFresh, Bool.and_eq_true] at hCapture
  have hArtifact := hCapture.1
  simp only [ReplayCertificateRecord.exactArtifactMetadata,
    Bool.and_eq_true] at hArtifact
  exact ⟨leaf, hLeaf, hSame, of_decide_eq_true hCertificate,
    of_decide_eq_true hArtifact.1,
    of_decide_eq_true hArtifact.2.2.2.2.2.1,
    of_decide_eq_true hArtifact.2.1,
    of_decide_eq_true hArtifact.2.2.1,
    of_decide_eq_true hCapture.2.1,
    of_decide_eq_true hCapture.2.2.1,
    of_decide_eq_true hCapture.2.2.2.1,
    of_decide_eq_true hCapture.2.2.2.2⟩

theorem review_accepted_implies_currentness_same_record_and_parsed_time
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hAccepted : reviewAccepted digestRuleBundle digestEvidenceBundle
      digestRuleDefinition digestExecution digestExecutionPolicy
      issuedAtFromCanonicalBody runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement parseIsoMilliseconds selectObservation
      selectScope digestContract encodeParameters replayAccepted input = true) :
    parseIsoMilliseconds input.currentness.checkedAtText =
        some input.currentness.checkedAtMs ∧
    ∃ record ∈ input.replayRecords,
      record.certificateId = input.receipt.currentnessCertificateId ∧
      record.scope = input.authority.expectedScope ∧
      record.claim = currentnessClaim encodeParameters input.currentness ∧
      input.currentness.checkedAtMs ≤ record.issuedAt ∧
      replayRecordValid selectObservation selectScope digestContract
        encodeParameters replayAccepted input.evidenceBundle record = true := by
  have hFacts := review_accepted_implies_all_authority_and_binding_facts hAccepted
  have hCurrent := hFacts.2.2.2.2.2.2.2.1
  simp only [currentnessBound, Bool.and_eq_true] at hCurrent
  have hFresh := hCurrent.2.2.2.2.2.1
  simp only [CurrentnessWitness.freshUnder, Bool.and_eq_true] at hFresh
  have hAny := hCurrent.2.2.2.2.2.2.2
  obtain ⟨record, hRecord, hValid⟩ := List.any_eq_true.mp hAny
  simp only [Bool.and_eq_true] at hValid
  have hIdentity := of_decide_eq_true hValid.1
  exact ⟨of_decide_eq_true hFresh.1, record, hRecord,
    hIdentity.1, hIdentity.2.1, hIdentity.2.2.1, hIdentity.2.2.2,
    hValid.2⟩

theorem review_accepted_implies_shared_verification_clock_and_skew
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hAccepted : reviewAccepted digestRuleBundle digestEvidenceBundle
      digestRuleDefinition digestExecution digestExecutionPolicy
      issuedAtFromCanonicalBody runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement
      parseIsoMilliseconds selectObservation selectScope digestContract
      encodeParameters replayAccepted input = true) :
    input.authority.groundedEvidencePolicy.now =
        input.authority.currentnessPolicy.now ∧
    input.authority.groundedEvidencePolicy.maxFutureSkew =
        input.authority.currentnessPolicy.maxFutureSkew := by
  have hFacts := review_accepted_implies_all_authority_and_binding_facts hAccepted
  have hAligned := hFacts.2.2.2.2.2.2.2.2
  simp only [verificationPoliciesAligned, Bool.and_eq_true] at hAligned
  exact ⟨of_decide_eq_true hAligned.1, of_decide_eq_true hAligned.2.1⟩

theorem review_accepted_implies_receipt_chronology
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hAccepted : reviewAccepted digestRuleBundle digestEvidenceBundle
      digestRuleDefinition digestExecution digestExecutionPolicy
      issuedAtFromCanonicalBody runtimeRootFromCanonicalBody
      capturedAtTextFromCanonicalStatement parseIsoMilliseconds
      selectObservation selectScope digestContract encodeParameters
      replayAccepted input = true) :
    parseIsoMilliseconds input.receipt.issuedAtText =
        some input.receipt.issuedAtMs ∧
    input.runtimeRoot.issuedAt ≤ input.receipt.issuedAtMs ∧
    input.receipt.issuedAtMs ≤ input.authority.currentnessPolicy.now +
      input.authority.currentnessPolicy.maxFutureSkew := by
  have hFacts := review_accepted_implies_all_authority_and_binding_facts hAccepted
  have hAligned := hFacts.2.2.2.2.2.2.2.2
  simp only [verificationPoliciesAligned, Bool.and_eq_true] at hAligned
  have hReceipt := hAligned.2.2
  simp only [receiptChronologyBound, Bool.and_eq_true] at hReceipt
  exact ⟨of_decide_eq_true hReceipt.1,
    of_decide_eq_true hReceipt.2.1,
    of_decide_eq_true hReceipt.2.2⟩

theorem stale_signed_capture_prevents_replay_closure
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    {record : ReplayCertificateRecord}
    (hRecord : record ∈ input.replayRecords)
    (hStale : record.capturedAtMs +
      input.authority.groundedEvidencePolicy.maxAge <
      input.authority.groundedEvidencePolicy.now) :
    replayClosureBound issuedAtFromCanonicalBody
      capturedAtTextFromCanonicalStatement parseIsoMilliseconds
      selectObservation selectScope digestContract encodeParameters
      replayAccepted input = false := by
  apply Bool.eq_false_iff.mpr
  intro hBound
  simp only [replayClosureBound, Bool.and_eq_true] at hBound
  have hCapture := (List.all_eq_true.mp hBound.2.2.2) record hRecord
  simp only [ReplayCertificateRecord.captureFresh, Bool.and_eq_true] at hCapture
  have hFresh := of_decide_eq_true hCapture.2.2.2.2
  omega

theorem stale_capture_with_recent_certificate_prevents_review_acceptance
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    {record : ReplayCertificateRecord}
    (hRecord : record ∈ input.replayRecords)
    (hRecentCertificate : record.issuedAt =
      input.authority.groundedEvidencePolicy.now)
    (hCapturePredatesWindow : record.capturedAtMs +
      input.authority.groundedEvidencePolicy.maxAge < record.issuedAt) :
    reviewAccepted digestRuleBundle digestEvidenceBundle digestRuleDefinition
      digestExecution digestExecutionPolicy issuedAtFromCanonicalBody
      runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement parseIsoMilliseconds
      selectObservation selectScope digestContract encodeParameters
      replayAccepted input = false := by
  have hStale : record.capturedAtMs +
      input.authority.groundedEvidencePolicy.maxAge <
      input.authority.groundedEvidencePolicy.now := by
    simpa [hRecentCertificate] using hCapturePredatesWindow
  have hReplay := stale_signed_capture_prevents_replay_closure
    (issuedAtFromCanonicalBody := issuedAtFromCanonicalBody)
    (capturedAtTextFromCanonicalStatement :=
      capturedAtTextFromCanonicalStatement)
    (parseIsoMilliseconds := parseIsoMilliseconds)
    (selectObservation := selectObservation)
    (selectScope := selectScope)
    (digestContract := digestContract)
    (encodeParameters := encodeParameters)
    (replayAccepted := replayAccepted)
    hRecord hStale
  simp [reviewAccepted, hReplay]

theorem changed_runtime_root_rule_prevents_review_acceptance
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hMismatch : input.runtimeRoot.rule ≠ input.authority.expectedRootRule) :
    reviewAccepted digestRuleBundle digestEvidenceBundle digestRuleDefinition
      digestExecution digestExecutionPolicy issuedAtFromCanonicalBody
      runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement parseIsoMilliseconds selectObservation selectScope digestContract
      encodeParameters replayAccepted input = false := by
  simp [reviewAccepted, runtimePacketRuleBound, hMismatch]

theorem invalid_runtime_premise_chronology_prevents_review_acceptance
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hChronology : runtimePremiseChronologyBound
      issuedAtFromCanonicalBody input = false) :
    reviewAccepted digestRuleBundle digestEvidenceBundle digestRuleDefinition
      digestExecution digestExecutionPolicy issuedAtFromCanonicalBody
      runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement parseIsoMilliseconds
      selectObservation selectScope digestContract encodeParameters
      replayAccepted input = false := by
  simp [reviewAccepted, runtimePacketRuleBound, hChronology]

theorem changed_runtime_premise_record_order_prevents_review_acceptance
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hChanged : exactOrderedRuntimePremiseRecords input = false) :
    reviewAccepted digestRuleBundle digestEvidenceBundle digestRuleDefinition
      digestExecution digestExecutionPolicy issuedAtFromCanonicalBody
      runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement parseIsoMilliseconds
      selectObservation selectScope digestContract encodeParameters
      replayAccepted input = false := by
  simp [reviewAccepted, runtimePacketRuleBound, hChanged]

theorem future_runtime_root_prevents_review_acceptance
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hFuture : input.authority.groundedEvidencePolicy.now +
      input.authority.groundedEvidencePolicy.maxFutureSkew <
      input.runtimeRoot.issuedAt) :
    reviewAccepted digestRuleBundle digestEvidenceBundle digestRuleDefinition
      digestExecution digestExecutionPolicy issuedAtFromCanonicalBody
      runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement parseIsoMilliseconds
      selectObservation selectScope digestContract encodeParameters
      replayAccepted input = false := by
  have hNotFutureBound : ¬ (input.runtimeRoot.issuedAt ≤
      input.authority.groundedEvidencePolicy.now +
        input.authority.groundedEvidencePolicy.maxFutureSkew) := by
    omega
  have hChronology : runtimePremiseChronologyBound
      issuedAtFromCanonicalBody input = false := by
    simp [runtimePremiseChronologyBound, hNotFutureBound]
  exact invalid_runtime_premise_chronology_prevents_review_acceptance hChronology

theorem invalid_receipt_chronology_prevents_review_acceptance
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hChronology : receiptChronologyBound parseIsoMilliseconds input = false) :
    reviewAccepted digestRuleBundle digestEvidenceBundle digestRuleDefinition
      digestExecution digestExecutionPolicy issuedAtFromCanonicalBody
      runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement
      parseIsoMilliseconds selectObservation selectScope digestContract
      encodeParameters replayAccepted input = false := by
  simp [reviewAccepted, verificationPoliciesAligned, hChronology]

theorem backdated_receipt_prevents_review_acceptance
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hBackdated : input.receipt.issuedAtMs < input.runtimeRoot.issuedAt) :
    reviewAccepted digestRuleBundle digestEvidenceBundle digestRuleDefinition
      digestExecution digestExecutionPolicy issuedAtFromCanonicalBody
      runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement
      parseIsoMilliseconds selectObservation selectScope digestContract
      encodeParameters replayAccepted input = false := by
  have hNotBound : ¬ (input.runtimeRoot.issuedAt ≤ input.receipt.issuedAtMs) := by
    omega
  have hChronology : receiptChronologyBound parseIsoMilliseconds input = false := by
    simp [receiptChronologyBound, hNotBound]
  exact invalid_receipt_chronology_prevents_review_acceptance hChronology

theorem future_dated_receipt_prevents_review_acceptance
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hFuture : input.authority.currentnessPolicy.now +
      input.authority.currentnessPolicy.maxFutureSkew <
        input.receipt.issuedAtMs) :
    reviewAccepted digestRuleBundle digestEvidenceBundle digestRuleDefinition
      digestExecution digestExecutionPolicy issuedAtFromCanonicalBody
      runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement
      parseIsoMilliseconds selectObservation selectScope digestContract
      encodeParameters replayAccepted input = false := by
  have hNotBound : ¬ (input.receipt.issuedAtMs ≤
      input.authority.currentnessPolicy.now +
        input.authority.currentnessPolicy.maxFutureSkew) := by
    omega
  have hChronology : receiptChronologyBound parseIsoMilliseconds input = false := by
    simp [receiptChronologyBound, hNotBound]
  exact invalid_receipt_chronology_prevents_review_acceptance hChronology

theorem divergent_verification_times_prevent_review_acceptance
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hMismatch : input.authority.groundedEvidencePolicy.now ≠
      input.authority.currentnessPolicy.now) :
    reviewAccepted digestRuleBundle digestEvidenceBundle digestRuleDefinition
      digestExecution digestExecutionPolicy issuedAtFromCanonicalBody
      runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement parseIsoMilliseconds
      selectObservation selectScope digestContract encodeParameters
      replayAccepted input = false := by
  simp [reviewAccepted, verificationPoliciesAligned, hMismatch]

theorem divergent_future_skew_prevents_review_acceptance
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hMismatch : input.authority.groundedEvidencePolicy.maxFutureSkew ≠
      input.authority.currentnessPolicy.maxFutureSkew) :
    reviewAccepted digestRuleBundle digestEvidenceBundle digestRuleDefinition
      digestExecution digestExecutionPolicy issuedAtFromCanonicalBody
      runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement parseIsoMilliseconds
      selectObservation selectScope digestContract encodeParameters
      replayAccepted input = false := by
  simp [reviewAccepted, verificationPoliciesAligned, hMismatch]

theorem changed_privileged_packet_projection_prevents_review_acceptance
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hMismatch : input.privilegedPacket ≠ receiptPacketProjection input.receipt) :
    reviewAccepted digestRuleBundle digestEvidenceBundle digestRuleDefinition
      digestExecution digestExecutionPolicy issuedAtFromCanonicalBody
      runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement parseIsoMilliseconds selectObservation selectScope digestContract
      encodeParameters replayAccepted input = false := by
  simp [reviewAccepted, packetProjectionBound, hMismatch]

theorem incomplete_replay_leaf_cover_prevents_review_acceptance
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hIncomplete : exactReplayLeafCover input = false) :
    reviewAccepted digestRuleBundle digestEvidenceBundle digestRuleDefinition
      digestExecution digestExecutionPolicy issuedAtFromCanonicalBody
      runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement parseIsoMilliseconds selectObservation selectScope digestContract
      encodeParameters replayAccepted input = false := by
  simp [reviewAccepted, replayClosureBound, hIncomplete]

theorem changed_runtime_premise_claims_prevent_review_acceptance
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hMismatch : input.runtimeRoot.premiseClaims ≠
      expectedRuntimePacketPremiseClaims digestExecutionPolicy encodeParameters input) :
    reviewAccepted digestRuleBundle digestEvidenceBundle digestRuleDefinition
      digestExecution digestExecutionPolicy issuedAtFromCanonicalBody
      runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement parseIsoMilliseconds selectObservation selectScope digestContract
      encodeParameters replayAccepted input = false := by
  simp [reviewAccepted, runtimePacketRuleBound, hMismatch]

theorem unparsed_currentness_time_prevents_review_acceptance
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuleDefinition : DigestRuleDefinition}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {runtimeRootFromCanonicalBody : RuntimePacketRootProjectionFromCanonicalBody}
    {capturedAtTextFromCanonicalStatement : CapturedAtTextFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {input : ReviewAcceptanceInput}
    (hParse : parseIsoMilliseconds input.currentness.checkedAtText ≠
      some input.currentness.checkedAtMs) :
    reviewAccepted digestRuleBundle digestEvidenceBundle digestRuleDefinition
      digestExecution digestExecutionPolicy issuedAtFromCanonicalBody
      runtimeRootFromCanonicalBody capturedAtTextFromCanonicalStatement parseIsoMilliseconds selectObservation selectScope digestContract
      encodeParameters replayAccepted input = false := by
  simp [reviewAccepted, currentnessBound, CurrentnessWitness.freshUnder, hParse]

/-! ## Human attestations remain a separate authenticated conclusion -/

inductive HumanAttestationKind where
  | submittedForLegalReview
  | legalApproved
  deriving DecidableEq, Repr, BEq

inductive ActorType where
  | human
  | agent
  deriving DecidableEq, Repr, BEq

structure HumanAttestationBody where
  version : String
  kind : HumanAttestationKind
  snapshotId : String
  manifestDigest : String
  packetReceiptId : String
  packetDigest : String
  packetCompleteCertificateId : String
  issuedAt : Nat
  nonce : String
  deriving DecidableEq, Repr, BEq

structure HumanAuthorization where
  actorId : String
  actorType : ActorType
  keyId : String
  keyFingerprint : String
  /-- Canonical verification-key bytes or runtime key witness. -/
  verificationKey : String
  allowedKinds : List HumanAttestationKind
  deriving DecidableEq, Repr, BEq

def HumanAuthorization.keyIdentity
    (authorization : HumanAuthorization) : String × String :=
  (authorization.keyId, authorization.keyFingerprint)

structure HumanAttestationEnvelope where
  body : HumanAttestationBody
  keyId : String
  signerFingerprint : String
  capturedAt : Nat
  signature : String
  deriving DecidableEq, Repr, BEq

/-!
Cryptographic verification is an independently supplied deterministic
predicate over every signed envelope field plus the signature bytes.  The
producer cannot smuggle in a precomputed `signatureAccepted` Boolean.
-/
abbrev VerifyHumanAttestationSignature :=
  HumanAuthorization → HumanAttestationEnvelope → Bool

structure HumanAttestationFreshnessPolicy where
  now : Nat
  maxAge : Nat
  maxFutureSkew : Nat
  deriving DecidableEq, Repr, BEq

def humanAuthorizationRegistryWellFormed
    (registry : List HumanAuthorization) : Bool :=
  decide (registry.map HumanAuthorization.actorId).Nodup &&
  (decide (registry.map HumanAuthorization.keyId).Nodup &&
  (decide (registry.map HumanAuthorization.keyFingerprint).Nodup &&
  registry.all fun authorization =>
    decide (authorization.actorId ≠ "") &&
    (decide (authorization.keyId ≠ "") &&
    (decide (authorization.keyFingerprint ≠ "") &&
    (decide (authorization.verificationKey ≠ "") &&
    decide authorization.allowedKinds.Nodup)))))

def humanAttestationAccepted
    (verifySignature : VerifyHumanAttestationSignature)
    (registry : List HumanAuthorization)
    (policy : HumanAttestationFreshnessPolicy)
    (expected : HumanAttestationBody)
    (envelope : HumanAttestationEnvelope) : Bool :=
  humanAuthorizationRegistryWellFormed registry &&
  (decide (envelope.body = expected) &&
  (decide (envelope.capturedAt = expected.issuedAt) &&
  (decide (expected.issuedAt ≤ policy.now + policy.maxFutureSkew) &&
  (decide (policy.now ≤ expected.issuedAt + policy.maxAge) &&
  registry.any fun authorization =>
    decide (authorization.actorType = .human) &&
    (decide (authorization.keyId = envelope.keyId) &&
    (decide (authorization.keyFingerprint = envelope.signerFingerprint) &&
    (authorization.allowedKinds.contains envelope.body.kind &&
    verifySignature authorization envelope)))))))

theorem submitted_and_approved_are_distinct :
    HumanAttestationKind.submittedForLegalReview ≠
      HumanAttestationKind.legalApproved := by
  decide

inductive Conclusion where
  | amendmentReviewPacketComplete
  | humanAttestation (kind : HumanAttestationKind)
  deriving DecidableEq, Repr, BEq

theorem procedural_completion_is_not_submission :
    Conclusion.amendmentReviewPacketComplete ≠
      Conclusion.humanAttestation .submittedForLegalReview := by
  decide

theorem procedural_completion_is_not_legal_approval :
    Conclusion.amendmentReviewPacketComplete ≠
      Conclusion.humanAttestation .legalApproved := by
  decide

theorem accepted_legal_approval_binds_fresh_exact_body_and_registered_human
    {verifySignature : VerifyHumanAttestationSignature}
    {registry : List HumanAuthorization}
    {policy : HumanAttestationFreshnessPolicy}
    {expected : HumanAttestationBody}
    {envelope : HumanAttestationEnvelope}
    (hKind : expected.kind = .legalApproved)
    (hAccepted : humanAttestationAccepted verifySignature registry policy
      expected envelope = true) :
    humanAuthorizationRegistryWellFormed registry = true ∧
    envelope.body = expected ∧
    envelope.capturedAt = expected.issuedAt ∧
    expected.issuedAt ≤ policy.now + policy.maxFutureSkew ∧
    policy.now ≤ expected.issuedAt + policy.maxAge ∧
    ∃ authorization ∈ registry,
      authorization.actorType = .human ∧
      authorization.keyId = envelope.keyId ∧
      authorization.keyFingerprint = envelope.signerFingerprint ∧
      authorization.allowedKinds.contains
        HumanAttestationKind.legalApproved = true ∧
      verifySignature authorization envelope = true := by
  simp only [humanAttestationAccepted, Bool.and_eq_true] at hAccepted
  have hSome := List.any_eq_true.mp hAccepted.2.2.2.2.2
  obtain ⟨authorization, hAuthorization, hValid⟩ := hSome
  simp only [Bool.and_eq_true] at hValid
  have hBody : envelope.body = expected := of_decide_eq_true hAccepted.2.1
  refine ⟨hAccepted.1, hBody, of_decide_eq_true hAccepted.2.2.1,
    of_decide_eq_true hAccepted.2.2.2.1,
    of_decide_eq_true hAccepted.2.2.2.2.1,
    authorization, hAuthorization, of_decide_eq_true hValid.1,
    of_decide_eq_true hValid.2.1, of_decide_eq_true hValid.2.2.1, ?_,
    hValid.2.2.2.2⟩
  simpa [hBody, hKind] using hValid.2.2.2.1

theorem changed_attestation_snapshot_is_rejected
    {verifySignature : VerifyHumanAttestationSignature}
    {registry : List HumanAuthorization}
    {policy : HumanAttestationFreshnessPolicy}
    {expected : HumanAttestationBody}
    {envelope : HumanAttestationEnvelope}
    (hSnapshot : envelope.body.snapshotId ≠ expected.snapshotId) :
    humanAttestationAccepted verifySignature registry policy expected envelope = false := by
  have hBody : envelope.body ≠ expected := by
    intro hEqual
    exact hSnapshot (congrArg HumanAttestationBody.snapshotId hEqual)
  simp [humanAttestationAccepted, hBody]

theorem rejected_signature_prevents_human_attestation
    {verifySignature : VerifyHumanAttestationSignature}
    {registry : List HumanAuthorization}
    {policy : HumanAttestationFreshnessPolicy}
    {expected : HumanAttestationBody}
    {envelope : HumanAttestationEnvelope}
    (hRejected : ∀ authorization ∈ registry,
      verifySignature authorization envelope = false) :
    humanAttestationAccepted verifySignature registry policy expected envelope = false := by
  apply Bool.eq_false_iff.mpr
  intro hAccepted
  simp only [humanAttestationAccepted, Bool.and_eq_true] at hAccepted
  obtain ⟨authorization, hAuthorization, hValid⟩ :=
    List.any_eq_true.mp hAccepted.2.2.2.2.2
  simp only [Bool.and_eq_true] at hValid
  have hSignature := hValid.2.2.2.2
  simp [hRejected authorization hAuthorization] at hSignature

theorem duplicate_human_authorization_key_prevents_attestation
    {verifySignature : VerifyHumanAttestationSignature}
    {registry : List HumanAuthorization}
    {policy : HumanAttestationFreshnessPolicy}
    {expected : HumanAttestationBody}
    {envelope : HumanAttestationEnvelope}
    (hDuplicate : ¬ (registry.map HumanAuthorization.keyId).Nodup) :
    humanAttestationAccepted verifySignature registry policy expected envelope = false := by
  simp [humanAttestationAccepted, humanAuthorizationRegistryWellFormed, hDuplicate]

theorem duplicate_human_actor_prevents_attestation
    {verifySignature : VerifyHumanAttestationSignature}
    {registry : List HumanAuthorization}
    {policy : HumanAttestationFreshnessPolicy}
    {expected : HumanAttestationBody}
    {envelope : HumanAttestationEnvelope}
    (hDuplicate : ¬ (registry.map HumanAuthorization.actorId).Nodup) :
    humanAttestationAccepted verifySignature registry policy expected envelope = false := by
  simp [humanAttestationAccepted, humanAuthorizationRegistryWellFormed, hDuplicate]

/-!
Final boundary reminder: acceptance proves exact structural agreement with the
supplied digest, selector, encoder, replay, canonical certificate-body parser,
canonical signed-statement capture-time extractor, ISO clock parser, and
signature-verification projections.  It does not prove that those runtime
functions implement SHA-256, JSON Pointer, wire parsing, canonicalization, or
cryptography correctly, that a signer controls a real-world identity, that a
sensor observed reality, or that legal analysis is correct.
-/

end RiddleProofKernel.ReviewProtocol
