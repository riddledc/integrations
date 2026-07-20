import Std
import RiddleProofKernel.GroundedEvidence
import RiddleProofKernel.SemanticClosure

namespace RiddleProofKernel.GenericProtocol

open GroundedEvidence SemanticClosure SemanticComposition

/-!
An executable structural model of a domain-neutral, consumer-verifiable packet
protocol.

`packetAccepted` below is the single
acceptance boundary.  It connects the independently pinned rule bundle to the
exact definition references used by composition sidecars, connects the independently pinned
evidence-template bundle to replay-valid certificate records, and binds the
accepted execution policy and execution metadata into the exact root claim.
The accepted rule bundle owns exact N-ary runtime definition references, while
one-to-one sidecars bind every materialized composition descriptor back to a
definition through an explicit runtime materialization decision.

This is deliberately smaller than the wire implementation.  Canonical JSON
parsing, JSON Pointer fidelity, SHA-256, signature verification, certificate
body parsing, clock conversion, filesystem stability, and sensor truth remain
explicit runtime premises.  Lean proves what follows once those deterministic
functions and replay decisions are supplied; it does not prove domain
correctness, rule soundness, actor identity, or an outside-world fact.
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

/-! The supplied digest function stands for the runtime's domain-separated
canonical digest of this exact runtime-definition reference bundle. -/
structure RuleTrustBundle where
  version : String
  trustRootId : String
  trustRootVersion : String
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

theorem resolved_rule_bundle_binds_exact_runtime_reference_bundle_digest
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
consumer can accept, rather than being hidden in that premise.
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

/-! ## Packet execution, byte identity, and content-free projections -/

structure DeterministicComponent where
  componentId : String
  componentVersion : String
  deriving DecidableEq, Repr, BEq

inductive AssertionIssuer where
  | deterministic (component : DeterministicComponent)
  | execution (executionId : String)
  deriving DecidableEq, Repr, BEq

structure ExecutionMetadata where
  executionId : String
  adapterId : String
  runtimeId : String
  protocolVersion : String
  configurationVersion : String
  routeCode : String
  attemptCount : Nat
  escalationCode : Option String
  deriving DecidableEq, Repr, BEq

structure ApprovedExecutionPolicy where
  policyId : String
  policyVersion : String
  adapterId : String
  allowedRuntimeIds : List String
  allowedProtocolVersions : List String
  allowedConfigurationVersions : List String
  allowedRouteCodes : List String
  allowedEscalationCodes : List String
  allowNoEscalation : Bool
  maxAttemptCount : Nat
  deterministicComponents : List DeterministicComponent
  deriving DecidableEq, Repr, BEq

def executionAllowed
    (policy : ApprovedExecutionPolicy)
    (execution : ExecutionMetadata) : Bool :=
  decide (execution.adapterId = policy.adapterId) &&
  (policy.allowedRuntimeIds.contains execution.runtimeId &&
  (policy.allowedProtocolVersions.contains execution.protocolVersion &&
  (policy.allowedConfigurationVersions.contains execution.configurationVersion &&
  (policy.allowedRouteCodes.contains execution.routeCode &&
  (decide (0 < execution.attemptCount) &&
  (decide (execution.attemptCount ≤ policy.maxAttemptCount) &&
  match execution.escalationCode with
  | none => policy.allowNoEscalation
  | some reason => policy.allowedEscalationCodes.contains reason))))))

def issuerAllowed
    (policy : ApprovedExecutionPolicy)
    (execution : ExecutionMetadata)
    (issuer : AssertionIssuer) : Bool :=
  match issuer with
  | .deterministic component =>
      policy.deterministicComponents.contains component
  | .execution executionId =>
      decide (executionId = execution.executionId)

structure PacketEntryProjection where
  entryId : String
  /-- Opaque consumer-selected classification; core assigns it no meaning. -/
  classification : String
  issuer : AssertionIssuer
  evidenceCertificateIds : List CertificateId
  blocking : Bool
  deriving DecidableEq, Repr, BEq

def packetEntryValid
    (certificateResolved : CertificateId → Bool)
    (policy : ApprovedExecutionPolicy)
    (execution : ExecutionMetadata)
    (entry : PacketEntryProjection) : Bool :=
  decide (entry.entryId ≠ "") &&
  (decide (entry.classification ≠ "") &&
  (issuerAllowed policy execution entry.issuer &&
  entry.evidenceCertificateIds.all certificateResolved))

/-!
The private packet parser exposes only these content-free fields. The entry
contents remain inside exact private bytes and are represented here only by the
separately computed byte length and packet digest.
-/
structure PrivatePacketProjection where
  packetId : String
  subjectId : String
  subjectDigest : String
  ruleTrustRoot : RuleTrustRootRef
  protocolVersion : String
  executionDigest : String
  entryIndex : List PacketEntryProjection
  deriving DecidableEq, Repr, BEq

/-- Deterministically computed from the exact private packet bytes. -/
structure PacketBytesIdentity where
  byteLength : Nat
  packetDigest : String
  deriving DecidableEq, Repr, BEq

/-- Receipt-only reference fields; none are parsed from private packet content. -/
structure PrivatePacketReceiptRef where
  packetId : String
  mediaType : String
  byteLength : Nat
  packetDigest : String
  opaqueReferenceId : String
  deriving DecidableEq, Repr, BEq

structure PacketReceiptProjection where
  /-- Runtime content ID of the canonical receipt body. -/
  receiptId : String
  subjectId : String
  subjectDigest : String
  ruleTrustRoot : RuleTrustRootRef
  /-- Independently supplied at receipt creation; absent from private bytes. -/
  evidenceTrustRoot : EvidenceTemplateTrustRootRef
  packet : PrivatePacketReceiptRef
  execution : ExecutionMetadata
  executionDigest : String
  executionPolicyDigest : String
  entryIndex : List PacketEntryProjection
  checkedRootCertificateId : CertificateId
  currentnessCertificateId : CertificateId
  issuedAtText : String
  issuedAtMs : Nat
  deriving DecidableEq, Repr, BEq

/-!
Receipt ID verification, canonical private-byte decoding, length, and digest
calculation are deterministic runtime operations. Their implementation fidelity
is explicit at the Lean boundary rather than silently treated as a theorem.
-/
abbrev ReceiptIdentityAccepted := PacketReceiptProjection → Bool

def receiptShapeAndIdentityBound
    (receiptIdentityAccepted : ReceiptIdentityAccepted)
    (receipt : PacketReceiptProjection) : Bool :=
  decide (receipt.receiptId ≠ "") &&
  (decide (receipt.packet.packetId ≠ "") &&
  (decide (receipt.packet.mediaType ≠ "") &&
  (decide (0 < receipt.packet.byteLength) &&
  (decide (receipt.packet.packetDigest ≠ "") &&
  (decide (receipt.packet.opaqueReferenceId ≠ "") &&
  receiptIdentityAccepted receipt)))))

def privatePacketProjectionBound
    (packet : PrivatePacketProjection)
    (receipt : PacketReceiptProjection) : Bool :=
  decide (packet.packetId = receipt.packet.packetId) &&
  (decide (packet.subjectId = receipt.subjectId) &&
  (decide (packet.subjectDigest = receipt.subjectDigest) &&
  (packet.ruleTrustRoot.matchesExpected receipt.ruleTrustRoot &&
  decide (packet.entryIndex = receipt.entryIndex))))

def packetBytesIdentityBound
    (identity : PacketBytesIdentity)
    (receipt : PacketReceiptProjection) : Bool :=
  decide (identity.byteLength = receipt.packet.byteLength) &&
  decide (identity.packetDigest = receipt.packet.packetDigest)

/-! ## Exact checked-meaning conclusion vocabulary -/

structure PacketClaimDescriptor where
  claimId : String
  claimVersion : String
  deriving DecidableEq, Repr, BEq

structure PacketBindingParameters where
  subjectId : String
  subjectDigest : String
  packetDigest : String
  ruleTrustRootDigest : String
  evidenceTrustRootDigest : String
  protocolVersion : String
  executionDigest : String
  executionPolicyDigest : String
  deriving DecidableEq, Repr, BEq

/-!
These eight keys are the exact runtime checked-meaning parameter vocabulary.
Changing a key is therefore a semantic change, not presentation-only renaming.
-/
def PacketBindingParameters.asJson
    (parameters : PacketBindingParameters) : List (String × JsonValue) := [
  ("subject_id", .string parameters.subjectId),
  ("subject_digest", .string parameters.subjectDigest),
  ("packet_digest", .string parameters.packetDigest),
  ("rule_trust_root_digest", .string parameters.ruleTrustRootDigest),
  ("evidence_trust_root_digest", .string parameters.evidenceTrustRootDigest),
  ("protocol_version", .string parameters.protocolVersion),
  ("execution_digest", .string parameters.executionDigest),
  ("execution_policy_digest", .string parameters.executionPolicyDigest)
]

def packetConclusionClaim
    (encodeParameters : EncodeClaimParameters)
    (descriptor : PacketClaimDescriptor)
    (parameters : PacketBindingParameters) : ClaimKey := {
  claimId := descriptor.claimId
  claimVersion := descriptor.claimVersion
  canonicalParameters := encodeParameters parameters.asJson
}

def identityClaim
    (encodeParameters : EncodeClaimParameters)
    (descriptor : PacketClaimDescriptor)
    (snapshotId manifestDigest : String) : ClaimKey := {
  claimId := descriptor.claimId
  claimVersion := descriptor.claimVersion
  canonicalParameters := encodeParameters [
    ("snapshot_id", .string snapshotId),
    ("manifest_digest", .string manifestDigest)
  ]
}

/-! ## Independently checked closure, runtime rule, replay, and chronology -/

structure RuntimeRuleBinding where
  certificateId : CertificateId
  expectedRef : RuntimeCheckedMeaningRuleRef
  actualRule : RuleDescriptor
  /-- Digest of the materialized descriptor, not the definition digest. -/
  materializedRuleDigest : String
  deriving DecidableEq, Repr, BEq

abbrev DigestRuntimeRuleDescriptor := RuleDescriptor → String
/-!
The runtime owns the exact definition-to-materialized-descriptor operation.
Lean requires its explicit decision for every composition node; it does not
confuse a definition implementation digest with a materialized rule digest.
-/
abbrev RuntimeRuleMaterializes :=
  RuntimeCheckedMeaningRuleRef → RuleDescriptor → Bool
abbrev DigestExecutionMetadata := ExecutionMetadata → String
abbrev DigestExecutionPolicy := ApprovedExecutionPolicy → String
abbrev ParseIsoMilliseconds := String → Option Nat

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
  checkedAtText : String
  checkedAtMs : Nat
  certificateId : CertificateId
  deriving DecidableEq, Repr, BEq

def CurrentnessWitness.freshUnder
    (parseIsoMilliseconds : ParseIsoMilliseconds)
    (policy : CurrentnessPolicy)
    (witness : CurrentnessWitness) : Bool :=
  decide (parseIsoMilliseconds witness.checkedAtText = some witness.checkedAtMs) &&
  (decide (witness.checkedAtMs ≤ policy.now + policy.maxFutureSkew) &&
  decide (policy.now ≤ witness.checkedAtMs + policy.maxAge))

def currentnessClaim
    (encodeParameters : EncodeClaimParameters)
    (descriptor : PacketClaimDescriptor)
    (witness : CurrentnessWitness) : ClaimKey := {
  claimId := descriptor.claimId
  claimVersion := descriptor.claimVersion
  canonicalParameters := encodeParameters [
    ("snapshot_id", .string witness.expectedSnapshotId),
    ("manifest_digest", .string witness.expectedManifestDigest),
    ("checked_at", .string witness.checkedAtText)
  ]
}

structure PacketAuthority where
  expectedRuleTrustRoot : RuleTrustRootRef
  expectedEvidenceTrustRoot : EvidenceTemplateTrustRootRef
  expectedScope : Scope
  expectedRootCertificateId : CertificateId
  expectedRootRule : RuntimeCheckedMeaningRuleRef
  expectedConclusionDescriptor : PacketClaimDescriptor
  identityClaimDescriptor : PacketClaimDescriptor
  currentnessClaimDescriptor : PacketClaimDescriptor
  /--
  Exact root-node premise snapshots are pinned by ID and claim. They may resolve
  to composite certificates; they are not equated with grounded replay leaves.
  -/
  expectedDirectPremiseCertificateIds : List CertificateId
  expectedDirectPremiseClaims : List ClaimKey
  expectedProtocolVersion : String
  executionPolicy : ApprovedExecutionPolicy
  groundedEvidencePolicy : GroundedEvidencePolicy
  currentnessPolicy : CurrentnessPolicy
  runtimeRuleMaxAgeMs : Nat
  maxReceiptAgeMs : Nat
  deriving DecidableEq, Repr, BEq

structure PacketAcceptanceInput where
  authority : PacketAuthority
  ruleBundle : RuleTrustBundle
  evidenceBundle : EvidenceTemplateTrustBundle
  receipt : PacketReceiptProjection
  privatePacket : PrivatePacketProjection
  packetBytesIdentity : PacketBytesIdentity
  checkedClosure : Closure
  runtimeRuleBindings : List RuntimeRuleBinding
  /--
  Nonempty unique IDs derived by the consumer from the separately replayed
  checked closure. Extensional set equality below binds them to this closure.
  -/
  resolvedCertificateIds : List CertificateId
  replayRecords : List ReplayCertificateRecord
  currentness : CurrentnessWitness
  rootIssuedAtMs : Nat
  deriving Repr

def expectedPacketParameters
    (digestExecutionPolicy : DigestExecutionPolicy)
    (input : PacketAcceptanceInput) : PacketBindingParameters := {
  subjectId := input.privatePacket.subjectId
  subjectDigest := input.privatePacket.subjectDigest
  packetDigest := input.packetBytesIdentity.packetDigest
  ruleTrustRootDigest := input.authority.expectedRuleTrustRoot.bundleDigest
  evidenceTrustRootDigest := input.authority.expectedEvidenceTrustRoot.bundleDigest
  protocolVersion := input.authority.expectedProtocolVersion
  executionDigest := input.privatePacket.executionDigest
  executionPolicyDigest := digestExecutionPolicy input.authority.executionPolicy
}

def expectedPacketConclusion
    (digestExecutionPolicy : DigestExecutionPolicy)
    (encodeParameters : EncodeClaimParameters)
    (input : PacketAcceptanceInput) : ClaimKey :=
  packetConclusionClaim encodeParameters
    input.authority.expectedConclusionDescriptor
    (expectedPacketParameters digestExecutionPolicy input)

def authorityResolved
    (digestRuleBundle : DigestRuleTrustBundle)
    (digestEvidenceBundle : DigestEvidenceTemplateBundle)
    (input : PacketAcceptanceInput) : Bool :=
  input.ruleBundle.resolves digestRuleBundle
      input.authority.expectedRuleTrustRoot &&
  (input.ruleBundle.resolvesRuntimeRule input.authority.expectedRootRule &&
  (input.evidenceBundle.resolves digestEvidenceBundle
      input.authority.expectedEvidenceTrustRoot &&
  (input.privatePacket.ruleTrustRoot.matchesExpected
      input.authority.expectedRuleTrustRoot &&
  (input.receipt.ruleTrustRoot.matchesExpected
      input.authority.expectedRuleTrustRoot &&
  input.receipt.evidenceTrustRoot.matchesExpected
      input.authority.expectedEvidenceTrustRoot))))

def packetProjectionBound
    (receiptIdentityAccepted : ReceiptIdentityAccepted)
    (input : PacketAcceptanceInput) : Bool :=
  receiptShapeAndIdentityBound receiptIdentityAccepted input.receipt &&
  (privatePacketProjectionBound input.privatePacket input.receipt &&
  packetBytesIdentityBound input.packetBytesIdentity input.receipt)

def executionBound
    (digestExecution : DigestExecutionMetadata)
    (digestExecutionPolicy : DigestExecutionPolicy)
    (input : PacketAcceptanceInput) : Bool :=
  executionAllowed input.authority.executionPolicy input.receipt.execution &&
  (decide (digestExecution input.receipt.execution =
      input.receipt.executionDigest) &&
  (decide (input.privatePacket.executionDigest =
      input.receipt.executionDigest) &&
  (decide (digestExecutionPolicy input.authority.executionPolicy =
      input.receipt.executionPolicyDigest) &&
  (decide (input.privatePacket.protocolVersion =
      input.authority.expectedProtocolVersion) &&
  decide (input.receipt.execution.protocolVersion =
      input.authority.expectedProtocolVersion)))))

def closureRootNode? (closure : Closure) : Option CertificateNode :=
  closure.certificates.getLast?

def closureContractCertificates (closure : Closure) : List CertificateNode :=
  closure.certificates.filter fun node =>
    match node.derivation with
    | .contract _ => true
    | .composition _ _ => false

def closureCompositionCertificates (closure : Closure) : List CertificateNode :=
  closure.certificates.filter fun node =>
    match node.derivation with
    | .contract _ => false
    | .composition _ _ => true

structure CompositionRuleRef where
  certificateId : CertificateId
  actualRule : RuleDescriptor
  deriving DecidableEq, Repr, BEq

def RuntimeRuleBinding.compositionRef
    (binding : RuntimeRuleBinding) : CompositionRuleRef := {
  certificateId := binding.certificateId
  actualRule := binding.actualRule
}

def certificateCompositionRef? (node : CertificateNode) :
    Option CompositionRuleRef :=
  match node.derivation with
  | .contract _ => none
  | .composition rule _ => some {
      certificateId := node.certificateId
      actualRule := rule
    }

structure ContractReplayRef where
  certificateId : CertificateId
  scope : Scope
  claim : ClaimKey
  deriving DecidableEq, Repr, BEq

def ReplayCertificateRecord.contractRef
    (record : ReplayCertificateRecord) : ContractReplayRef := {
  certificateId := record.certificateId
  scope := record.scope
  claim := record.claim
}

def certificateContractRef (node : CertificateNode) : ContractReplayRef := {
  certificateId := node.certificateId
  scope := node.scope
  claim := node.claim.key
}

def exactContractReplayCover (input : PacketAcceptanceInput) : Bool :=
  let leaves := closureContractCertificates input.checkedClosure
  let recordIds := input.replayRecords.map ReplayCertificateRecord.certificateId
  let leafIds := leaves.map CertificateNode.certificateId
  decide (input.replayRecords ≠ []) &&
  decide (leaves ≠ []) &&
  decide recordIds.Nodup &&
  decide leafIds.Nodup &&
  (input.replayRecords.all fun record =>
    leaves.any fun leaf => decide (record.contractRef = certificateContractRef leaf)) &&
  (leaves.all fun leaf =>
    input.replayRecords.any fun record =>
      decide (record.contractRef = certificateContractRef leaf))

def ReplayCertificateRecord.certificateChronologyBound
    (issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody)
    (record : ReplayCertificateRecord) : Bool :=
  decide (issuedAtFromCanonicalBody record.canonicalBodyWitness =
      some record.issuedAt)

def ReplayCertificateRecord.captureFresh
    (signedStatementProjectionFromCanonicalStatement :
      SignedStatementProjectionFromCanonicalStatement)
    (parseIsoMilliseconds : ParseIsoMilliseconds)
    (policy : GroundedEvidencePolicy)
    (record : ReplayCertificateRecord) : Bool :=
  record.exactArtifactMetadata signedStatementProjectionFromCanonicalStatement &&
  (decide (parseIsoMilliseconds record.capturedAtText =
      some record.capturedAtMs) &&
  (decide (record.capturedAtMs ≤ record.issuedAt) &&
  (decide (record.capturedAtMs ≤ policy.now + policy.maxFutureSkew) &&
  decide (policy.now ≤ record.capturedAtMs + policy.maxAge))))

def replayClosureBound
    (issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody)
    (signedStatementProjectionFromCanonicalStatement :
      SignedStatementProjectionFromCanonicalStatement)
    (parseIsoMilliseconds : ParseIsoMilliseconds)
    (selectObservation : SelectObservationPointer)
    (selectScope : SelectScopePointer)
    (digestContract : DigestMaterializedContract)
    (encodeParameters : EncodeClaimParameters)
    (replayAccepted : ReplayAccepted)
    (input : PacketAcceptanceInput) : Bool :=
  exactContractReplayCover input &&
  ((input.replayRecords.all fun record =>
    replayRecordValid selectObservation selectScope digestContract
      encodeParameters replayAccepted input.evidenceBundle record) &&
  ((input.replayRecords.all
    (ReplayCertificateRecord.certificateChronologyBound
      issuedAtFromCanonicalBody)) &&
  input.replayRecords.all
    (ReplayCertificateRecord.captureFresh
      signedStatementProjectionFromCanonicalStatement parseIsoMilliseconds
      input.authority.groundedEvidencePolicy)))

def entryEvidenceIdsResolved (input : PacketAcceptanceInput) : Bool :=
  input.receipt.entryIndex.all fun entry =>
    entry.evidenceCertificateIds.all fun certificateId =>
      input.resolvedCertificateIds.contains certificateId

def sameCertificateIdSet (left right : List CertificateId) : Bool :=
  (left.all fun certificateId => right.contains certificateId) &&
  right.all fun certificateId => left.contains certificateId

def resolvedCertificateIdsBound (input : PacketAcceptanceInput) : Bool :=
  decide (input.resolvedCertificateIds ≠ []) &&
  (decide input.resolvedCertificateIds.Nodup &&
  (sameCertificateIdSet input.resolvedCertificateIds
      input.checkedClosure.certificateIds &&
  (input.resolvedCertificateIds.contains
      input.receipt.checkedRootCertificateId &&
  (input.resolvedCertificateIds.contains
      input.receipt.currentnessCertificateId &&
  entryEvidenceIdsResolved input))))

def allCertificateChronologyBound
    (issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody)
    (input : PacketAcceptanceInput) : Bool :=
  decide (input.rootIssuedAtMs ≤
      input.authority.currentnessPolicy.now +
        input.authority.currentnessPolicy.maxFutureSkew) &&
  input.checkedClosure.certificates.all fun node =>
    match issuedAtFromCanonicalBody node.canonicalBodyWitness with
    | none => false
    | some issuedAt =>
        decide (issuedAt ≤ input.rootIssuedAtMs) &&
        decide (input.rootIssuedAtMs ≤
          issuedAt + input.authority.runtimeRuleMaxAgeMs)

def closureRootBound
    (issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody)
    (digestExecutionPolicy : DigestExecutionPolicy)
    (encodeParameters : EncodeClaimParameters)
    (input : PacketAcceptanceInput) : Bool :=
  input.checkedClosure.wellFormed &&
  (resolvedCertificateIdsBound input &&
  (decide (input.receipt.checkedRootCertificateId =
      input.authority.expectedRootCertificateId) &&
  match closureRootNode? input.checkedClosure with
  | none => false
  | some root =>
      decide (root.certificateId = input.authority.expectedRootCertificateId) &&
      (decide (root.scope = input.authority.expectedScope) &&
      (decide (root.claim.key = expectedPacketConclusion
          digestExecutionPolicy encodeParameters input) &&
      (decide (issuedAtFromCanonicalBody root.canonicalBodyWitness =
          some input.rootIssuedAtMs) &&
      allCertificateChronologyBound issuedAtFromCanonicalBody input)))))

def exactCompositionRuleBindingCover (input : PacketAcceptanceInput) : Bool :=
  let composites := closureCompositionCertificates input.checkedClosure
  let bindingIds := input.runtimeRuleBindings.map RuntimeRuleBinding.certificateId
  let compositeIds := composites.map CertificateNode.certificateId
  decide (input.runtimeRuleBindings ≠ []) &&
  decide (composites ≠ []) &&
  decide bindingIds.Nodup &&
  decide compositeIds.Nodup &&
  (input.runtimeRuleBindings.all fun binding =>
    composites.any fun node =>
      decide (certificateCompositionRef? node = some binding.compositionRef)) &&
  (composites.all fun node =>
    input.runtimeRuleBindings.any fun binding =>
      decide (certificateCompositionRef? node = some binding.compositionRef))

def runtimeRuleBindingValid
    (digestRuntimeRule : DigestRuntimeRuleDescriptor)
    (runtimeRuleMaterializes : RuntimeRuleMaterializes)
    (input : PacketAcceptanceInput)
    (binding : RuntimeRuleBinding) : Bool :=
  input.ruleBundle.runtimeRuleRefs.contains binding.expectedRef &&
  (decide (binding.expectedRef.ruleId = binding.actualRule.ruleId) &&
  (decide (binding.expectedRef.ruleVersion = binding.actualRule.ruleVersion) &&
  (decide (binding.expectedRef.engine ≠ "") &&
  (decide (binding.expectedRef.implementationDigest ≠ "") &&
  (decide (digestRuntimeRule binding.actualRule =
      binding.materializedRuleDigest) &&
  runtimeRuleMaterializes binding.expectedRef binding.actualRule)))))

def rootRuntimeRuleBound
    (digestExecutionPolicy : DigestExecutionPolicy)
    (encodeParameters : EncodeClaimParameters)
    (input : PacketAcceptanceInput) : Bool :=
  match closureRootNode? input.checkedClosure with
  | none => false
  | some root =>
      match root.derivation with
      | .contract _ => false
      | .composition actualRule directPremises =>
          (input.runtimeRuleBindings.any fun binding =>
            decide (binding.certificateId = root.certificateId ∧
              binding.expectedRef = input.authority.expectedRootRule ∧
              binding.actualRule = actualRule)) &&
          (decide (input.authority.expectedDirectPremiseCertificateIds ≠ []) &&
          (decide (input.authority.expectedDirectPremiseCertificateIds.Nodup) &&
          (decide (directPremises.map PremiseSnapshot.certificateId =
              input.authority.expectedDirectPremiseCertificateIds) &&
          (decide (directPremises.map (fun premise => premise.claim.key) =
              input.authority.expectedDirectPremiseClaims) &&
          (decide (actualRule.premiseClaims =
              input.authority.expectedDirectPremiseClaims) &&
          (decide (actualRule.conclusion = expectedPacketConclusion
              digestExecutionPolicy encodeParameters input) &&
          (decide (root.claim.key = actualRule.conclusion) &&
          directPremises.all fun premise =>
            premise.resolvedIn input.checkedClosure.certificates)))))))

def runtimeRuleBindingsBound
    (digestRuntimeRule : DigestRuntimeRuleDescriptor)
    (runtimeRuleMaterializes : RuntimeRuleMaterializes)
    (digestExecutionPolicy : DigestExecutionPolicy)
    (encodeParameters : EncodeClaimParameters)
    (input : PacketAcceptanceInput) : Bool :=
  exactCompositionRuleBindingCover input &&
  ((input.runtimeRuleBindings.all
    (runtimeRuleBindingValid digestRuntimeRule runtimeRuleMaterializes input)) &&
  rootRuntimeRuleBound digestExecutionPolicy encodeParameters input)

def entriesBound (input : PacketAcceptanceInput) : Bool :=
  let certificateResolved := fun certificateId =>
    input.resolvedCertificateIds.contains certificateId
  decide (input.receipt.entryIndex ≠ []) &&
  (decide (input.receipt.entryIndex.map PacketEntryProjection.entryId).Nodup &&
  input.receipt.entryIndex.all
    (packetEntryValid certificateResolved input.authority.executionPolicy
      input.receipt.execution))

def currentnessBound
    (parseIsoMilliseconds : ParseIsoMilliseconds)
    (selectObservation : SelectObservationPointer)
    (selectScope : SelectScopePointer)
    (digestContract : DigestMaterializedContract)
    (encodeParameters : EncodeClaimParameters)
    (replayAccepted : ReplayAccepted)
    (input : PacketAcceptanceInput) : Bool :=
  let exactIdentity := input.replayRecords.any fun record =>
    decide (record.scope = input.authority.expectedScope ∧
      record.claim = identityClaim encodeParameters
        input.authority.identityClaimDescriptor
        input.receipt.subjectId input.receipt.subjectDigest) &&
    replayRecordValid selectObservation selectScope digestContract
      encodeParameters replayAccepted input.evidenceBundle record
  let exactCurrentness := input.replayRecords.any fun record =>
    decide (record.certificateId = input.receipt.currentnessCertificateId ∧
      record.scope = input.authority.expectedScope ∧
      record.claim = currentnessClaim encodeParameters
        input.authority.currentnessClaimDescriptor input.currentness ∧
      input.currentness.checkedAtMs ≤ record.issuedAt) &&
    replayRecordValid selectObservation selectScope digestContract
      encodeParameters replayAccepted input.evidenceBundle record
  decide (input.currentness.expectedSnapshotId = input.receipt.subjectId) &&
  (decide (input.currentness.observedSnapshotId = input.receipt.subjectId) &&
  (decide (input.currentness.expectedManifestDigest =
      input.receipt.subjectDigest) &&
  (decide (input.currentness.observedManifestDigest =
      input.receipt.subjectDigest) &&
  (decide (input.currentness.certificateId =
      input.receipt.currentnessCertificateId) &&
  (input.currentness.freshUnder parseIsoMilliseconds
      input.authority.currentnessPolicy &&
  (exactIdentity && exactCurrentness))))))

def receiptChronologyBound
    (parseIsoMilliseconds : ParseIsoMilliseconds)
    (input : PacketAcceptanceInput) : Bool :=
  let currentnessPredatesReceipt :=
    input.replayRecords.any fun record =>
      decide (record.certificateId =
        input.receipt.currentnessCertificateId ∧
        record.issuedAt ≤ input.receipt.issuedAtMs)
  decide (parseIsoMilliseconds input.receipt.issuedAtText =
      some input.receipt.issuedAtMs) &&
  (decide (input.rootIssuedAtMs ≤ input.receipt.issuedAtMs) &&
  (currentnessPredatesReceipt &&
  (decide (input.receipt.issuedAtMs ≤
      input.authority.currentnessPolicy.now +
        input.authority.currentnessPolicy.maxFutureSkew) &&
  decide (input.authority.currentnessPolicy.now ≤
      input.receipt.issuedAtMs + input.authority.maxReceiptAgeMs))))

def verificationPoliciesAligned
    (parseIsoMilliseconds : ParseIsoMilliseconds)
    (input : PacketAcceptanceInput) : Bool :=
  decide (input.authority.groundedEvidencePolicy.now =
      input.authority.currentnessPolicy.now) &&
  (decide (input.authority.groundedEvidencePolicy.maxFutureSkew =
      input.authority.currentnessPolicy.maxFutureSkew) &&
  receiptChronologyBound parseIsoMilliseconds input)

/-!
The one post-parse deterministic acceptance boundary. Direct root premises,
grounded replay leaves, independently resolved certificate IDs, policy digest,
private bytes, and receipt identity remain distinct inputs and are linked here.
-/
def packetAccepted
    (digestRuleBundle : DigestRuleTrustBundle)
    (digestEvidenceBundle : DigestEvidenceTemplateBundle)
    (digestRuntimeRule : DigestRuntimeRuleDescriptor)
    (runtimeRuleMaterializes : RuntimeRuleMaterializes)
    (digestExecution : DigestExecutionMetadata)
    (digestExecutionPolicy : DigestExecutionPolicy)
    (issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody)
    (signedStatementProjectionFromCanonicalStatement :
      SignedStatementProjectionFromCanonicalStatement)
    (parseIsoMilliseconds : ParseIsoMilliseconds)
    (selectObservation : SelectObservationPointer)
    (selectScope : SelectScopePointer)
    (digestContract : DigestMaterializedContract)
    (encodeParameters : EncodeClaimParameters)
    (replayAccepted : ReplayAccepted)
    (receiptIdentityAccepted : ReceiptIdentityAccepted)
    (input : PacketAcceptanceInput) : Bool :=
  authorityResolved digestRuleBundle digestEvidenceBundle input &&
  (packetProjectionBound receiptIdentityAccepted input &&
  (executionBound digestExecution digestExecutionPolicy input &&
  (closureRootBound issuedAtFromCanonicalBody digestExecutionPolicy
      encodeParameters input &&
  (runtimeRuleBindingsBound digestRuntimeRule runtimeRuleMaterializes
      digestExecutionPolicy encodeParameters input &&
  (replayClosureBound issuedAtFromCanonicalBody
      signedStatementProjectionFromCanonicalStatement parseIsoMilliseconds
      selectObservation selectScope digestContract encodeParameters
      replayAccepted input &&
  (entriesBound input &&
  (currentnessBound parseIsoMilliseconds selectObservation selectScope
      digestContract encodeParameters replayAccepted input &&
  verificationPoliciesAligned parseIsoMilliseconds input)))))))

theorem packet_accepted_implies_all_authority_and_binding_facts
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuntimeRule : DigestRuntimeRuleDescriptor}
    {runtimeRuleMaterializes : RuntimeRuleMaterializes}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {signedStatementProjectionFromCanonicalStatement :
      SignedStatementProjectionFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {receiptIdentityAccepted : ReceiptIdentityAccepted}
    {input : PacketAcceptanceInput}
    (hAccepted : packetAccepted digestRuleBundle digestEvidenceBundle
      digestRuntimeRule runtimeRuleMaterializes digestExecution digestExecutionPolicy
      issuedAtFromCanonicalBody
      signedStatementProjectionFromCanonicalStatement parseIsoMilliseconds
      selectObservation selectScope digestContract encodeParameters
      replayAccepted receiptIdentityAccepted input = true) :
    authorityResolved digestRuleBundle digestEvidenceBundle input = true ∧
    packetProjectionBound receiptIdentityAccepted input = true ∧
    executionBound digestExecution digestExecutionPolicy input = true ∧
    closureRootBound issuedAtFromCanonicalBody digestExecutionPolicy
      encodeParameters input = true ∧
    runtimeRuleBindingsBound digestRuntimeRule runtimeRuleMaterializes
      digestExecutionPolicy encodeParameters input = true ∧
    replayClosureBound issuedAtFromCanonicalBody
      signedStatementProjectionFromCanonicalStatement parseIsoMilliseconds
      selectObservation selectScope digestContract encodeParameters
      replayAccepted input = true ∧
    entriesBound input = true ∧
    currentnessBound parseIsoMilliseconds selectObservation selectScope
      digestContract encodeParameters replayAccepted input = true ∧
    verificationPoliciesAligned parseIsoMilliseconds input = true := by
  simpa [packetAccepted] using hAccepted

theorem packet_accepted_implies_exact_runtime_rule_and_direct_premises
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuntimeRule : DigestRuntimeRuleDescriptor}
    {runtimeRuleMaterializes : RuntimeRuleMaterializes}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {signedStatementProjectionFromCanonicalStatement :
      SignedStatementProjectionFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {receiptIdentityAccepted : ReceiptIdentityAccepted}
    {input : PacketAcceptanceInput}
    (hAccepted : packetAccepted digestRuleBundle digestEvidenceBundle
      digestRuntimeRule runtimeRuleMaterializes digestExecution
      digestExecutionPolicy issuedAtFromCanonicalBody
      signedStatementProjectionFromCanonicalStatement parseIsoMilliseconds
      selectObservation selectScope digestContract encodeParameters
      replayAccepted receiptIdentityAccepted input = true) :
    ∃ root actualRule directPremises binding,
      closureRootNode? input.checkedClosure = some root ∧
      root.derivation = .composition actualRule directPremises ∧
      binding ∈ input.runtimeRuleBindings ∧
      binding.certificateId = root.certificateId ∧
      binding.expectedRef = input.authority.expectedRootRule ∧
      binding.actualRule = actualRule ∧
      runtimeRuleBindingValid digestRuntimeRule runtimeRuleMaterializes
        input binding = true ∧
      directPremises.map PremiseSnapshot.certificateId =
        input.authority.expectedDirectPremiseCertificateIds ∧
      directPremises.map (fun premise => premise.claim.key) =
        input.authority.expectedDirectPremiseClaims ∧
      (∀ premise ∈ directPremises,
        ∃ node ∈ input.checkedClosure.certificates,
          node.summary = premise) := by
  have hFacts := packet_accepted_implies_all_authority_and_binding_facts hAccepted
  have hRules := hFacts.2.2.2.2.1
  simp only [runtimeRuleBindingsBound, Bool.and_eq_true] at hRules
  have hRootBound := hRules.2.2
  unfold rootRuntimeRuleBound at hRootBound
  cases hRoot : closureRootNode? input.checkedClosure with
  | none => simp [hRoot] at hRootBound
  | some root =>
      cases hDerivation : root.derivation with
      | contract claim =>
          simp [hRoot, hDerivation] at hRootBound
      | composition actualRule directPremises =>
          simp only [hRoot, hDerivation, Bool.and_eq_true] at hRootBound
          obtain ⟨binding, hBinding, hMatch⟩ :=
            List.any_eq_true.mp hRootBound.1
          have hMatchFacts := of_decide_eq_true hMatch
          have hBindingValid :=
            (List.all_eq_true.mp hRules.2.1) binding hBinding
          refine ⟨root, actualRule, directPremises, binding,
            rfl, hDerivation, hBinding,
            hMatchFacts.1, hMatchFacts.2.1, hMatchFacts.2.2,
            hBindingValid, ?_, ?_, ?_⟩
          · exact of_decide_eq_true hRootBound.2.2.2.1
          · exact of_decide_eq_true hRootBound.2.2.2.2.1
          · intro premise hPremise
            have hResolved :=
              (List.all_eq_true.mp hRootBound.2.2.2.2.2.2.2.2)
                premise hPremise
            exact (PremiseSnapshot.resolved_in_iff _ _).mp hResolved

theorem packet_accepted_implies_replay_covers_exact_contract_frontier
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuntimeRule : DigestRuntimeRuleDescriptor}
    {runtimeRuleMaterializes : RuntimeRuleMaterializes}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {signedStatementProjectionFromCanonicalStatement :
      SignedStatementProjectionFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {receiptIdentityAccepted : ReceiptIdentityAccepted}
    {input : PacketAcceptanceInput}
    (hAccepted : packetAccepted digestRuleBundle digestEvidenceBundle
      digestRuntimeRule runtimeRuleMaterializes digestExecution digestExecutionPolicy
      issuedAtFromCanonicalBody
      signedStatementProjectionFromCanonicalStatement parseIsoMilliseconds
      selectObservation selectScope digestContract encodeParameters
      replayAccepted receiptIdentityAccepted input = true) :
    (∀ record ∈ input.replayRecords,
      ∃ leaf ∈ closureContractCertificates input.checkedClosure,
        record.contractRef = certificateContractRef leaf) ∧
    (∀ leaf ∈ closureContractCertificates input.checkedClosure,
      ∃ record ∈ input.replayRecords,
        record.contractRef = certificateContractRef leaf) := by
  have hFacts := packet_accepted_implies_all_authority_and_binding_facts hAccepted
  have hReplay := hFacts.2.2.2.2.2.1
  simp only [replayClosureBound, Bool.and_eq_true] at hReplay
  have hCover := hReplay.1
  simp only [exactContractReplayCover, Bool.and_eq_true] at hCover
  have hForward := hCover.1.2
  have hReverse := hCover.2
  constructor
  · intro record hRecord
    have hFound := (List.all_eq_true.mp hForward) record hRecord
    obtain ⟨leaf, hLeaf, hSame⟩ := List.any_eq_true.mp hFound
    exact ⟨leaf, hLeaf, of_decide_eq_true hSame⟩
  · intro leaf hLeaf
    have hFound := (List.all_eq_true.mp hReverse) leaf hLeaf
    obtain ⟨record, hRecord, hSame⟩ := List.any_eq_true.mp hFound
    exact ⟨record, hRecord, of_decide_eq_true hSame⟩

theorem packet_accepted_binds_exact_policy_and_root_claim
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuntimeRule : DigestRuntimeRuleDescriptor}
    {runtimeRuleMaterializes : RuntimeRuleMaterializes}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {signedStatementProjectionFromCanonicalStatement :
      SignedStatementProjectionFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {receiptIdentityAccepted : ReceiptIdentityAccepted}
    {input : PacketAcceptanceInput}
    (hAccepted : packetAccepted digestRuleBundle digestEvidenceBundle
      digestRuntimeRule runtimeRuleMaterializes digestExecution digestExecutionPolicy
      issuedAtFromCanonicalBody
      signedStatementProjectionFromCanonicalStatement parseIsoMilliseconds
      selectObservation selectScope digestContract encodeParameters
      replayAccepted receiptIdentityAccepted input = true) :
    input.receipt.executionPolicyDigest =
        digestExecutionPolicy input.authority.executionPolicy ∧
    ∃ root, closureRootNode? input.checkedClosure = some root ∧
      root.claim.key = expectedPacketConclusion
        digestExecutionPolicy encodeParameters input := by
  have hFacts := packet_accepted_implies_all_authority_and_binding_facts hAccepted
  have hExecution := hFacts.2.2.1
  simp only [executionBound, Bool.and_eq_true] at hExecution
  have hRoot := hFacts.2.2.2.1
  unfold closureRootBound at hRoot
  simp only [Bool.and_eq_true] at hRoot
  cases hLast : closureRootNode? input.checkedClosure with
  | none => simp [hLast] at hRoot
  | some root =>
      simp only [hLast, Bool.and_eq_true] at hRoot
      exact ⟨(of_decide_eq_true hExecution.2.2.2.1).symm,
        root, rfl, of_decide_eq_true hRoot.2.2.2.2.2.1⟩

/-! ## Generic hostile-change theorems -/

theorem dangling_entry_evidence_prevents_packet_acceptance
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuntimeRule : DigestRuntimeRuleDescriptor}
    {runtimeRuleMaterializes : RuntimeRuleMaterializes}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {signedStatementProjectionFromCanonicalStatement :
      SignedStatementProjectionFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {receiptIdentityAccepted : ReceiptIdentityAccepted}
    {input : PacketAcceptanceInput}
    {entry : PacketEntryProjection}
    {certificateId : CertificateId}
    (hEntry : entry ∈ input.receipt.entryIndex)
    (hEvidence : certificateId ∈ entry.evidenceCertificateIds)
    (hDangling : certificateId ∉ input.resolvedCertificateIds) :
    packetAccepted digestRuleBundle digestEvidenceBundle digestRuntimeRule
      runtimeRuleMaterializes digestExecution digestExecutionPolicy issuedAtFromCanonicalBody
      signedStatementProjectionFromCanonicalStatement parseIsoMilliseconds
      selectObservation selectScope digestContract encodeParameters
      replayAccepted receiptIdentityAccepted input = false := by
  apply Bool.eq_false_iff.mpr
  intro hAccepted
  have hFacts := packet_accepted_implies_all_authority_and_binding_facts hAccepted
  have hEntries := hFacts.2.2.2.2.2.2.1
  simp only [entriesBound, Bool.and_eq_true] at hEntries
  have hEntryValid := (List.all_eq_true.mp hEntries.2.2) entry hEntry
  simp only [packetEntryValid, Bool.and_eq_true] at hEntryValid
  have hResolved :=
    (List.all_eq_true.mp hEntryValid.2.2.2) certificateId hEvidence
  simp [hDangling] at hResolved

theorem changed_execution_policy_digest_prevents_packet_acceptance
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuntimeRule : DigestRuntimeRuleDescriptor}
    {runtimeRuleMaterializes : RuntimeRuleMaterializes}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {signedStatementProjectionFromCanonicalStatement :
      SignedStatementProjectionFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {receiptIdentityAccepted : ReceiptIdentityAccepted}
    {input : PacketAcceptanceInput}
    (hChanged : input.receipt.executionPolicyDigest ≠
      digestExecutionPolicy input.authority.executionPolicy) :
    packetAccepted digestRuleBundle digestEvidenceBundle digestRuntimeRule
      runtimeRuleMaterializes digestExecution digestExecutionPolicy issuedAtFromCanonicalBody
      signedStatementProjectionFromCanonicalStatement parseIsoMilliseconds
      selectObservation selectScope digestContract encodeParameters
      replayAccepted receiptIdentityAccepted input = false := by
  apply Bool.eq_false_iff.mpr
  intro hAccepted
  have hFacts := packet_accepted_implies_all_authority_and_binding_facts hAccepted
  have hExecution := hFacts.2.2.1
  simp only [executionBound, Bool.and_eq_true] at hExecution
  have hPolicy := of_decide_eq_true hExecution.2.2.2.1
  exact hChanged hPolicy.symm

theorem evidence_root_substitution_prevents_packet_acceptance
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuntimeRule : DigestRuntimeRuleDescriptor}
    {runtimeRuleMaterializes : RuntimeRuleMaterializes}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {signedStatementProjectionFromCanonicalStatement :
      SignedStatementProjectionFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {receiptIdentityAccepted : ReceiptIdentityAccepted}
    {input : PacketAcceptanceInput}
    (hChanged : input.receipt.evidenceTrustRoot ≠
      input.authority.expectedEvidenceTrustRoot) :
    packetAccepted digestRuleBundle digestEvidenceBundle digestRuntimeRule
      runtimeRuleMaterializes digestExecution digestExecutionPolicy issuedAtFromCanonicalBody
      signedStatementProjectionFromCanonicalStatement parseIsoMilliseconds
      selectObservation selectScope digestContract encodeParameters
      replayAccepted receiptIdentityAccepted input = false := by
  simp [packetAccepted, authorityResolved,
    EvidenceTemplateTrustRootRef.matchesExpected, hChanged]

theorem missing_replay_leaf_prevents_packet_acceptance
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuntimeRule : DigestRuntimeRuleDescriptor}
    {runtimeRuleMaterializes : RuntimeRuleMaterializes}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {signedStatementProjectionFromCanonicalStatement :
      SignedStatementProjectionFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {receiptIdentityAccepted : ReceiptIdentityAccepted}
    {input : PacketAcceptanceInput}
    {leaf : CertificateNode}
    (hLeaf : leaf ∈ closureContractCertificates input.checkedClosure)
    (hMissing : ∀ record ∈ input.replayRecords,
      record.contractRef ≠ certificateContractRef leaf) :
    packetAccepted digestRuleBundle digestEvidenceBundle digestRuntimeRule
      runtimeRuleMaterializes digestExecution digestExecutionPolicy issuedAtFromCanonicalBody
      signedStatementProjectionFromCanonicalStatement parseIsoMilliseconds
      selectObservation selectScope digestContract encodeParameters
      replayAccepted receiptIdentityAccepted input = false := by
  apply Bool.eq_false_iff.mpr
  intro hAccepted
  have hCover :=
    (packet_accepted_implies_replay_covers_exact_contract_frontier hAccepted).2
  obtain ⟨record, hRecord, hSame⟩ := hCover leaf hLeaf
  exact hMissing record hRecord hSame

theorem stale_receipt_prevents_packet_acceptance
    {digestRuleBundle : DigestRuleTrustBundle}
    {digestEvidenceBundle : DigestEvidenceTemplateBundle}
    {digestRuntimeRule : DigestRuntimeRuleDescriptor}
    {runtimeRuleMaterializes : RuntimeRuleMaterializes}
    {digestExecution : DigestExecutionMetadata}
    {digestExecutionPolicy : DigestExecutionPolicy}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {signedStatementProjectionFromCanonicalStatement :
      SignedStatementProjectionFromCanonicalStatement}
    {parseIsoMilliseconds : ParseIsoMilliseconds}
    {selectObservation : SelectObservationPointer}
    {selectScope : SelectScopePointer}
    {digestContract : DigestMaterializedContract}
    {encodeParameters : EncodeClaimParameters}
    {replayAccepted : ReplayAccepted}
    {receiptIdentityAccepted : ReceiptIdentityAccepted}
    {input : PacketAcceptanceInput}
    (hStale : input.receipt.issuedAtMs + input.authority.maxReceiptAgeMs <
      input.authority.currentnessPolicy.now) :
    packetAccepted digestRuleBundle digestEvidenceBundle digestRuntimeRule
      runtimeRuleMaterializes digestExecution digestExecutionPolicy issuedAtFromCanonicalBody
      signedStatementProjectionFromCanonicalStatement parseIsoMilliseconds
      selectObservation selectScope digestContract encodeParameters
      replayAccepted receiptIdentityAccepted input = false := by
  apply Bool.eq_false_iff.mpr
  intro hAccepted
  have hFacts := packet_accepted_implies_all_authority_and_binding_facts hAccepted
  have hAligned := hFacts.2.2.2.2.2.2.2.2
  simp only [verificationPoliciesAligned, Bool.and_eq_true] at hAligned
  have hReceipt := hAligned.2.2
  simp only [receiptChronologyBound, Bool.and_eq_true] at hReceipt
  exact (Nat.not_le_of_lt hStale) (of_decide_eq_true hReceipt.2.2.2.2)

/-! ## Concrete non-vacuity vector: four leaves, two composites, one root -/

namespace PositiveVector

def scope : Scope := {
  repository := "repo"
  revision := "revision"
  environment := "environment"
  target := "target"
  proofAttempt := "attempt"
}

def encodeParameters : EncodeClaimParameters := fun parameters => reprStr parameters

def digestRuleBundle : DigestRuleTrustBundle := fun _ => "rule-bundle-digest"
def digestEvidenceBundle : DigestEvidenceTemplateBundle :=
  fun _ => "evidence-bundle-digest"
def digestExecution : DigestExecutionMetadata := fun _ => "execution-digest"
def digestExecutionPolicy : DigestExecutionPolicy := fun _ => "policy-digest"
def digestRuntimeRule : DigestRuntimeRuleDescriptor :=
  fun rule => "materialized:" ++ rule.ruleId ++ ":" ++ rule.ruleVersion

def artifact (suffix role : String) : EvidenceArtifactMetadata := {
  artifactId := "artifact-" ++ suffix
  role := role
  mediaType := "application/octet-stream"
}

def assertion (pointer : String) : EvidenceRequiredAssertion := {
  source := .observation
  pointer := pointer
  operation := .exists
}

def binding (name pointer : String) : EvidenceParameterBinding := {
  parameterName := name
  observationPointers := [pointer]
  allowedTypes := [.string]
}

def identitySchema : ExactObservationSchema :=
  .object (.cons "snapshot_id" (.claimParameter "snapshot_id")
    (.cons "manifest_digest" (.claimParameter "manifest_digest") .nil))

def simpleSchema : ExactObservationSchema :=
  .object (.cons "value" (.claimParameter "value") .nil)

def currentnessSchema : ExactObservationSchema :=
  .object (.cons "snapshot_id" (.claimParameter "snapshot_id")
    (.cons "manifest_digest" (.claimParameter "manifest_digest")
      (.cons "checked_at" (.claimParameter "checked_at") .nil)))

def profile
    (suffix claimId claimLabel : String)
    (assertions : List EvidenceRequiredAssertion)
    (bindings : List EvidenceParameterBinding)
    (schema : ExactObservationSchema)
    (role : String) : EvidenceProfileTemplate := {
  profileId := "profile-" ++ suffix
  profileVersion := "1"
  claimId := claimId
  claimVersion := "1"
  claimLabel := claimLabel
  collectorId := "collector"
  collectorVersion := "1"
  collectorDigest := "collector-digest"
  sensorKind := "deterministic"
  sensorName := "sensor"
  sensorVersion := "1"
  sensorMetadataDigest := "sensor-digest"
  signerFingerprint := "signer"
  verifierId := "verifier"
  verifierVersion := "1"
  verifierDigest := "verifier-digest"
  contractId := "contract-" ++ suffix
  contractVersion := "1"
  contractLabel := "contract " ++ suffix
  requiredAssertions := assertions
  parameterBindings := bindings
  observationSchema := schema
  requiredArtifacts := [artifact suffix role]
  requiredArtifactRoles := [role]
}

def identityDescriptor : PacketClaimDescriptor := {
  claimId := "subject-identity"
  claimVersion := "1"
}

def currentnessDescriptor : PacketClaimDescriptor := {
  claimId := "subject-current"
  claimVersion := "1"
}

def conclusionDescriptor : PacketClaimDescriptor := {
  claimId := "packet-conclusion"
  claimVersion := "1"
}

def identityProfile : EvidenceProfileTemplate :=
  profile "identity" identityDescriptor.claimId "subject identity"
    [assertion "/snapshot_id", assertion "/manifest_digest"]
    [binding "snapshot_id" "/snapshot_id",
      binding "manifest_digest" "/manifest_digest"]
    identitySchema "identity"

def signalAProfile : EvidenceProfileTemplate :=
  profile "signal-a" "signal-a" "signal a"
    [assertion "/value"] [binding "value" "/value"]
    simpleSchema "signal-a"

def signalBProfile : EvidenceProfileTemplate :=
  profile "signal-b" "signal-b" "signal b"
    [assertion "/value"] [binding "value" "/value"]
    simpleSchema "signal-b"

def currentnessProfile : EvidenceProfileTemplate :=
  profile "currentness" currentnessDescriptor.claimId "subject current"
    [assertion "/snapshot_id", assertion "/manifest_digest",
      assertion "/checked_at"]
    [binding "snapshot_id" "/snapshot_id",
      binding "manifest_digest" "/manifest_digest",
      binding "checked_at" "/checked_at"]
    currentnessSchema "currentness"

def evidenceBundle : EvidenceTemplateTrustBundle := {
  version := "1"
  trustRootId := "evidence-root"
  trustRootVersion := "1"
  profiles := [identityProfile, signalAProfile, signalBProfile,
    currentnessProfile]
}

def evidenceRoot : EvidenceTemplateTrustRootRef :=
  evidenceBundle.reference digestEvidenceBundle

def parameterValue (properties : JsonPropertyList) (name : String) :
    Option JsonValue :=
  match properties with
  | .nil => none
  | .cons candidate value tail =>
      if candidate = name then some value else parameterValue tail name

def selectObservation : SelectObservationPointer :=
  fun observation pointer =>
    match observation with
    | .object properties =>
        if pointer = "/snapshot_id" then parameterValue properties "snapshot_id"
        else if pointer = "/manifest_digest" then
          parameterValue properties "manifest_digest"
        else if pointer = "/checked_at" then
          parameterValue properties "checked_at"
        else if pointer = "/value" then parameterValue properties "value"
        else none
    | _ => none

def selectScope : SelectScopePointer := fun _ _ => none

def digestContract : DigestMaterializedContract :=
  fun template claim =>
    "contract:" ++ template.profileId ++ ":" ++ claim.claimId

def materialized
    (template : EvidenceProfileTemplate)
    (parameters : List (String × JsonValue)) :
    MaterializedEvidenceAuthority :=
  let claim : MaterializedEvidenceClaim := {
    claimId := template.claimId
    claimVersion := template.claimVersion
    label := template.claimLabel
    parameters := parameters
  }
  {
    profileId := template.profileId
    profileVersion := template.profileVersion
    claim := claim
    collectorId := template.collectorId
    collectorVersion := template.collectorVersion
    collectorDigest := template.collectorDigest
    sensorKind := template.sensorKind
    sensorName := template.sensorName
    sensorVersion := template.sensorVersion
    sensorMetadataDigest := template.sensorMetadataDigest
    sensorObservedTarget := scope.target
    signerFingerprint := template.signerFingerprint
    verifierId := template.verifierId
    verifierVersion := template.verifierVersion
    verifierDigest := template.verifierDigest
    contractId := template.contractId
    contractVersion := template.contractVersion
    contractLabel := template.contractLabel
    contractImplementationDigest := digestContract template claim
    receiptContractImplementationDigest := digestContract template claim
    fixedAssertions := template.requiredAssertions
    parameterBindings := template.parameterBindings
    observationSchema := template.observationSchema
    requiredArtifacts := template.requiredArtifacts
    requiredArtifactRoles := template.requiredArtifactRoles
  }

def identityParameters : List (String × JsonValue) := [
  ("snapshot_id", .string "subject"),
  ("manifest_digest", .string "sha256:subject")
]

def signalAParameters : List (String × JsonValue) := [
  ("value", .string "signal-a")
]

def signalBParameters : List (String × JsonValue) := [
  ("value", .string "signal-b")
]

def currentnessParameters : List (String × JsonValue) := [
  ("snapshot_id", .string "subject"),
  ("manifest_digest", .string "sha256:subject"),
  ("checked_at", .string "checked-time")
]

def identityObservation : JsonValue :=
  .object (.cons "snapshot_id" (.string "subject")
    (.cons "manifest_digest" (.string "sha256:subject") .nil))

def signalAObservation : JsonValue :=
  .object (.cons "value" (.string "signal-a") .nil)

def signalBObservation : JsonValue :=
  .object (.cons "value" (.string "signal-b") .nil)

def currentnessObservation : JsonValue :=
  .object (.cons "snapshot_id" (.string "subject")
    (.cons "manifest_digest" (.string "sha256:subject")
      (.cons "checked_at" (.string "checked-time") .nil)))

def record
    (suffix certificateId body signed captureText : String)
    (issuedAt capturedAt : Nat)
    (template : EvidenceProfileTemplate)
    (parameters : List (String × JsonValue))
    (observation : JsonValue) : ReplayCertificateRecord :=
  let authority := materialized template parameters
  {
    certificateId := certificateId
    groundingId := "grounding-" ++ suffix
    scope := scope
    claim := authority.claim.key encodeParameters
    canonicalBodyWitness := body
    issuedAt := issuedAt
    canonicalSignedStatementWitness := signed
    capturedAtText := captureText
    observedArtifacts := template.requiredArtifacts
    capturedAtMs := capturedAt
    observation := observation
    materialized := authority
  }

def identityRecord : ReplayCertificateRecord :=
  record "identity" "leaf-identity" "body-identity" "signed-identity"
    "capture-identity" 10 5 identityProfile identityParameters
    identityObservation

def signalARecord : ReplayCertificateRecord :=
  record "signal-a" "leaf-signal-a" "body-signal-a" "signed-signal-a"
    "capture-signal-a" 20 15 signalAProfile signalAParameters
    signalAObservation

def signalBRecord : ReplayCertificateRecord :=
  record "signal-b" "leaf-signal-b" "body-signal-b" "signed-signal-b"
    "capture-signal-b" 40 35 signalBProfile signalBParameters
    signalBObservation

def currentnessRecord : ReplayCertificateRecord :=
  record "currentness" "leaf-currentness" "body-currentness"
    "signed-currentness" "capture-currentness" 50 45 currentnessProfile
    currentnessParameters currentnessObservation

def replayRecords : List ReplayCertificateRecord :=
  [identityRecord, signalARecord, signalBRecord, currentnessRecord]

def issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody :=
  fun body =>
    if body = "body-identity" then some 10
    else if body = "body-signal-a" then some 20
    else if body = "body-intermediate-a" then some 30
    else if body = "body-signal-b" then some 40
    else if body = "body-currentness" then some 50
    else if body = "body-intermediate-b" then some 60
    else if body = "body-root" then some 70
    else none

def parseIsoMilliseconds : ParseIsoMilliseconds :=
  fun text =>
    if text = "capture-identity" then some 5
    else if text = "capture-signal-a" then some 15
    else if text = "capture-signal-b" then some 35
    else if text = "capture-currentness" then some 45
    else if text = "checked-time" then some 45
    else if text = "receipt-time" then some 75
    else none

def signedProjection
    (template : EvidenceProfileTemplate)
    (capturedAtText : String) : SignedCaptureStatementProjection := {
  capturedAtText := capturedAtText
  artifacts := template.requiredArtifacts
}

def signedStatementProjectionFromCanonicalStatement :
    SignedStatementProjectionFromCanonicalStatement :=
  fun statement =>
    if statement = "signed-identity" then
      some (signedProjection identityProfile "capture-identity")
    else if statement = "signed-signal-a" then
      some (signedProjection signalAProfile "capture-signal-a")
    else if statement = "signed-signal-b" then
      some (signedProjection signalBProfile "capture-signal-b")
    else if statement = "signed-currentness" then
      some (signedProjection currentnessProfile "capture-currentness")
    else none

def replayAccepted : ReplayAccepted := fun _ _ => true

def evidenceRef (suffix role : String) : EvidenceRef := {
  receiptId := "capture-" ++ suffix
  artifactDigest := "digest-" ++ suffix
  role := role
}

def identityEvidence : EvidenceBundle :=
  .singleton (evidenceRef "identity" "identity")

def signalAEvidence : EvidenceBundle :=
  .singleton (evidenceRef "signal-a" "signal-a")

def signalBEvidence : EvidenceBundle :=
  .singleton (evidenceRef "signal-b" "signal-b")

def currentnessEvidence : EvidenceBundle :=
  .singleton (evidenceRef "currentness" "currentness")

def identityNode : CertificateNode := {
  certificateId := identityRecord.certificateId
  canonicalBodyWitness := identityRecord.canonicalBodyWitness
  scope := scope
  claim := { key := identityRecord.claim, label := "identity" }
  evidence := identityEvidence
  derivation := .contract identityRecord.claim
}

def signalANode : CertificateNode := {
  certificateId := signalARecord.certificateId
  canonicalBodyWitness := signalARecord.canonicalBodyWitness
  scope := scope
  claim := { key := signalARecord.claim, label := "signal a" }
  evidence := signalAEvidence
  derivation := .contract signalARecord.claim
}

def signalBNode : CertificateNode := {
  certificateId := signalBRecord.certificateId
  canonicalBodyWitness := signalBRecord.canonicalBodyWitness
  scope := scope
  claim := { key := signalBRecord.claim, label := "signal b" }
  evidence := signalBEvidence
  derivation := .contract signalBRecord.claim
}

def currentnessNode : CertificateNode := {
  certificateId := currentnessRecord.certificateId
  canonicalBodyWitness := currentnessRecord.canonicalBodyWitness
  scope := scope
  claim := { key := currentnessRecord.claim, label := "currentness" }
  evidence := currentnessEvidence
  derivation := .contract currentnessRecord.claim
}

def intermediateAClaim : ClaimKey := {
  claimId := "intermediate-a"
  claimVersion := "1"
  canonicalParameters := encodeParameters [
    ("subject_id", .string "subject"),
    ("subject_digest", .string "sha256:subject")
  ]
}

def intermediateBClaim : ClaimKey := {
  claimId := "intermediate-b"
  claimVersion := "1"
  canonicalParameters := encodeParameters [
    ("subject_id", .string "subject"),
    ("subject_digest", .string "sha256:subject"),
    ("packet_digest", .string "packet-digest"),
    ("rule_trust_root_digest", .string "rule-bundle-digest"),
    ("evidence_trust_root_digest", .string "evidence-bundle-digest"),
    ("protocol_version", .string "protocol-1"),
    ("execution_digest", .string "execution-digest"),
    ("execution_policy_digest", .string "policy-digest"),
    ("checked_at", .string "checked-time")
  ]
}

def intermediateARule : RuleDescriptor := {
  ruleId := "rule-intermediate-a"
  ruleVersion := "1"
  premiseClaims := [identityNode.claim.key, signalANode.claim.key]
  conclusion := intermediateAClaim
}

def intermediateBRule : RuleDescriptor := {
  ruleId := "rule-intermediate-b"
  ruleVersion := "1"
  premiseClaims := [signalBNode.claim.key, currentnessNode.claim.key]
  conclusion := intermediateBClaim
}

def intermediateANode : CertificateNode := {
  certificateId := "intermediate-a"
  canonicalBodyWitness := "body-intermediate-a"
  scope := scope
  claim := { key := intermediateAClaim, label := "intermediate a" }
  evidence := identityEvidence.append signalAEvidence
  derivation := .composition intermediateARule
    [identityNode.summary, signalANode.summary]
}

def intermediateBNode : CertificateNode := {
  certificateId := "intermediate-b"
  canonicalBodyWitness := "body-intermediate-b"
  scope := scope
  claim := { key := intermediateBClaim, label := "intermediate b" }
  evidence := signalBEvidence.append currentnessEvidence
  derivation := .composition intermediateBRule
    [signalBNode.summary, currentnessNode.summary]
}

def policy : ApprovedExecutionPolicy := {
  policyId := "policy"
  policyVersion := "1"
  adapterId := "adapter"
  allowedRuntimeIds := ["runtime"]
  allowedProtocolVersions := ["protocol-1"]
  allowedConfigurationVersions := ["configuration-1"]
  allowedRouteCodes := ["route"]
  allowedEscalationCodes := []
  allowNoEscalation := true
  maxAttemptCount := 1
  deterministicComponents := [{
    componentId := "deterministic-component"
    componentVersion := "1"
  }]
}

def execution : ExecutionMetadata := {
  executionId := "execution"
  adapterId := "adapter"
  runtimeId := "runtime"
  protocolVersion := "protocol-1"
  configurationVersion := "configuration-1"
  routeCode := "route"
  attemptCount := 1
  escalationCode := none
}

def ruleRoot : RuleTrustRootRef := {
  trustRootId := "rule-root"
  trustRootVersion := "1"
  bundleDigest := "rule-bundle-digest"
}

def privatePacket : PrivatePacketProjection := {
  packetId := "packet"
  subjectId := "subject"
  subjectDigest := "sha256:subject"
  ruleTrustRoot := ruleRoot
  protocolVersion := "protocol-1"
  executionDigest := "execution-digest"
  entryIndex := [{
    entryId := "entry"
    classification := "classification"
    issuer := .deterministic {
      componentId := "deterministic-component"
      componentVersion := "1"
    }
    evidenceCertificateIds := [identityNode.certificateId,
      intermediateBNode.certificateId]
    blocking := false
  }]
}

def bytesIdentity : PacketBytesIdentity := {
  byteLength := 512
  packetDigest := "packet-digest"
}

def receipt : PacketReceiptProjection := {
  receiptId := "receipt"
  subjectId := privatePacket.subjectId
  subjectDigest := privatePacket.subjectDigest
  ruleTrustRoot := ruleRoot
  evidenceTrustRoot := evidenceRoot
  packet := {
    packetId := privatePacket.packetId
    mediaType := "application/vnd.riddle-proof.private-packet+json"
    byteLength := bytesIdentity.byteLength
    packetDigest := bytesIdentity.packetDigest
    opaqueReferenceId := "opaque-reference"
  }
  execution := execution
  executionDigest := "execution-digest"
  executionPolicyDigest := "policy-digest"
  entryIndex := privatePacket.entryIndex
  checkedRootCertificateId := "root"
  currentnessCertificateId := currentnessNode.certificateId
  issuedAtText := "receipt-time"
  issuedAtMs := 75
}

def currentness : CurrentnessWitness := {
  expectedSnapshotId := privatePacket.subjectId
  expectedManifestDigest := privatePacket.subjectDigest
  observedSnapshotId := privatePacket.subjectId
  observedManifestDigest := privatePacket.subjectDigest
  checkedAtText := "checked-time"
  checkedAtMs := 45
  certificateId := currentnessNode.certificateId
}

def packetParameters : PacketBindingParameters := {
  subjectId := privatePacket.subjectId
  subjectDigest := privatePacket.subjectDigest
  packetDigest := bytesIdentity.packetDigest
  ruleTrustRootDigest := ruleRoot.bundleDigest
  evidenceTrustRootDigest := evidenceRoot.bundleDigest
  protocolVersion := privatePacket.protocolVersion
  executionDigest := privatePacket.executionDigest
  executionPolicyDigest := "policy-digest"
}

def rootClaim : ClaimKey :=
  packetConclusionClaim encodeParameters conclusionDescriptor packetParameters

def rootRule : RuleDescriptor := {
  ruleId := "rule-root"
  ruleVersion := "1"
  premiseClaims := [intermediateANode.claim.key, intermediateBNode.claim.key]
  conclusion := rootClaim
}

def rootNode : CertificateNode := {
  certificateId := "root"
  canonicalBodyWitness := "body-root"
  scope := scope
  claim := { key := rootClaim, label := "root" }
  evidence := intermediateANode.evidence.append intermediateBNode.evidence
  derivation := .composition rootRule
    [intermediateANode.summary, intermediateBNode.summary]
}

def closure : Closure := {
  rootId := rootNode.certificateId
  certificates := [identityNode, signalANode, intermediateANode,
    signalBNode, currentnessNode, intermediateBNode, rootNode]
}

def intermediateARuleRef : RuntimeCheckedMeaningRuleRef := {
  ruleId := intermediateARule.ruleId
  ruleVersion := intermediateARule.ruleVersion
  engine := "riddle-proof-checked-meaning"
  implementationDigest := "definition:rule-intermediate-a:1"
}

def intermediateBRuleRef : RuntimeCheckedMeaningRuleRef := {
  ruleId := intermediateBRule.ruleId
  ruleVersion := intermediateBRule.ruleVersion
  engine := "riddle-proof-checked-meaning"
  implementationDigest := "definition:rule-intermediate-b:1"
}

def rootRuleRef : RuntimeCheckedMeaningRuleRef := {
  ruleId := rootRule.ruleId
  ruleVersion := rootRule.ruleVersion
  engine := "riddle-proof-checked-meaning"
  implementationDigest := "definition:rule-root:1"
}

def ruleBundle : RuleTrustBundle := {
  version := "1"
  trustRootId := ruleRoot.trustRootId
  trustRootVersion := ruleRoot.trustRootVersion
  runtimeRuleRefs := [intermediateARuleRef, intermediateBRuleRef, rootRuleRef]
}

def authority : PacketAuthority := {
  expectedRuleTrustRoot := ruleRoot
  expectedEvidenceTrustRoot := evidenceRoot
  expectedScope := scope
  expectedRootCertificateId := rootNode.certificateId
  expectedRootRule := rootRuleRef
  expectedConclusionDescriptor := conclusionDescriptor
  identityClaimDescriptor := identityDescriptor
  currentnessClaimDescriptor := currentnessDescriptor
  expectedDirectPremiseCertificateIds :=
    [intermediateANode.certificateId, intermediateBNode.certificateId]
  expectedDirectPremiseClaims :=
    [intermediateANode.claim.key, intermediateBNode.claim.key]
  expectedProtocolVersion := "protocol-1"
  executionPolicy := policy
  groundedEvidencePolicy := { now := 80, maxAge := 100, maxFutureSkew := 2 }
  currentnessPolicy := { now := 80, maxAge := 100, maxFutureSkew := 2 }
  runtimeRuleMaxAgeMs := 100
  maxReceiptAgeMs := 20
}

def runtimeRuleMaterializes : RuntimeRuleMaterializes :=
  fun reference rule => decide (
    (reference = intermediateARuleRef ∧ rule = intermediateARule) ∨
    (reference = intermediateBRuleRef ∧ rule = intermediateBRule) ∨
    (reference = rootRuleRef ∧ rule = rootRule))

def runtimeRuleBindings : List RuntimeRuleBinding := [{
  certificateId := intermediateANode.certificateId
  expectedRef := intermediateARuleRef
  actualRule := intermediateARule
  materializedRuleDigest := digestRuntimeRule intermediateARule
}, {
  certificateId := intermediateBNode.certificateId
  expectedRef := intermediateBRuleRef
  actualRule := intermediateBRule
  materializedRuleDigest := digestRuntimeRule intermediateBRule
}, {
  certificateId := rootNode.certificateId
  expectedRef := rootRuleRef
  actualRule := rootRule
  materializedRuleDigest := digestRuntimeRule rootRule
}]

def input : PacketAcceptanceInput := {
  authority := authority
  ruleBundle := ruleBundle
  evidenceBundle := evidenceBundle
  receipt := receipt
  privatePacket := privatePacket
  packetBytesIdentity := bytesIdentity
  checkedClosure := closure
  runtimeRuleBindings := runtimeRuleBindings
  resolvedCertificateIds := ["intermediate-a", "intermediate-b",
    "leaf-currentness", "leaf-identity", "leaf-signal-a",
    "leaf-signal-b", "root"]
  replayRecords := replayRecords
  currentness := currentness
  rootIssuedAtMs := 70
}

def receiptIdentityAccepted : ReceiptIdentityAccepted :=
  fun candidate => decide (candidate.receiptId = receipt.receiptId)

def accepted : Bool :=
  packetAccepted digestRuleBundle digestEvidenceBundle digestRuntimeRule
    runtimeRuleMaterializes digestExecution digestExecutionPolicy
    issuedAtFromCanonicalBody
    signedStatementProjectionFromCanonicalStatement parseIsoMilliseconds
    selectObservation selectScope digestContract encodeParameters
    replayAccepted receiptIdentityAccepted input

theorem closure_is_three_rule_pyramid :
    closure.wellFormed = true := by
  simp [closure, SemanticClosure.Closure.wellFormed,
    SemanticClosure.Closure.rootIsLast,
    SemanticClosure.Closure.uniqueCertificateIds,
    SemanticClosure.Closure.certificateIds,
    SemanticClosure.Closure.orderedResolved,
    SemanticClosure.orderedResolvedAux,
    SemanticClosure.Closure.allPremisesResolved,
    SemanticClosure.Closure.allCertificatesReachable,
    SemanticClosure.Closure.reachableIds,
    SemanticClosure.Closure.reachabilityStep,
    SemanticClosure.Closure.allScopesMatchRoot,
    SemanticClosure.CertificateNode.locallyConsistent,
    SemanticClosure.CertificateNode.premises,
    SemanticClosure.CertificateNode.summary,
    SemanticClosure.CertificateNode.derivationKind,
    SemanticClosure.CertificateNode.assurance,
    SemanticClosure.PremiseSnapshot.resolvedIn,
    identityNode, signalANode, signalBNode, currentnessNode,
    identityRecord, signalARecord, signalBRecord, currentnessRecord, record,
    intermediateANode, intermediateBNode, rootNode,
    intermediateARule, intermediateBRule, rootRule,
    intermediateAClaim, intermediateBClaim, rootClaim,
    identityEvidence, signalAEvidence, signalBEvidence,
    currentnessEvidence, EvidenceBundle.append,
    EvidenceBundle.singleton, EvidenceBundle.toList]

theorem packetAccepted_is_nonvacuous :
    accepted = true := by native_decide

end PositiveVector

#print axioms PositiveVector.closure_is_three_rule_pyramid
#print axioms PositiveVector.packetAccepted_is_nonvacuous
#print axioms packet_accepted_implies_exact_runtime_rule_and_direct_premises
#print axioms packet_accepted_implies_replay_covers_exact_contract_frontier
#print axioms packet_accepted_binds_exact_policy_and_root_claim
#print axioms dangling_entry_evidence_prevents_packet_acceptance
#print axioms changed_execution_policy_digest_prevents_packet_acceptance
#print axioms evidence_root_substitution_prevents_packet_acceptance
#print axioms missing_replay_leaf_prevents_packet_acceptance
#print axioms stale_receipt_prevents_packet_acceptance

/-!
Final boundary: packet acceptance proves exact structural agreement with the
supplied canonical parser, digest, selector, encoder, replay, clock, and receipt
identity functions. It does not prove those runtime functions correct,
authenticate outside-world identity, establish sensor truth, or assign
consumer-specific meaning to opaque classifications.
-/

end RiddleProofKernel.GenericProtocol
