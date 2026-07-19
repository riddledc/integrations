import Std
import RiddleProofKernel.SemanticClosure

namespace RiddleProofKernel.GroundedEvidence

open SemanticComposition SemanticClosure

/-!
An executable model of grounded Semantic-certificate issuance and handoff.

The model starts with exact artifact bytes, a signed capture statement, a
trusted verification policy, and a deterministic observation verifier. A
successful issuance has no caller-supplied observation: the observation stored
in its verification receipt is exactly the value returned by the verifier, and
the registered contract must accept that same value.

Cryptographic and runtime identifiers remain abstract. The supplied digest,
signature, and content-addressing functions stand for the corresponding
runtime implementations. Consequently, the theorems below establish exact
agreement with those functions and preserve the resulting grounding through a
complete Semantic closure; they do not prove SHA-256 collision resistance,
Ed25519 implementation correctness, key custody, browser fidelity, clock
truth, nonce generation, or the semantic calibration of verifier code.
-/

abbrev ArtifactBytes := List UInt8
abbrev DigestBytes := ArtifactBytes → String

def groundedCaptureStatementVersion : String :=
  "riddle-proof.grounded-capture-statement.v0"

def declarativeJsonVerifierEngine : String :=
  "riddle-proof.grounded-declarative-json-verifier.v0"

def declarativeJsonContractEngine : String :=
  "riddle-proof.grounded-declarative-json-contract.v0"

structure SensorDescriptor where
  sensorId : String
  sensorVersion : String
  deriving DecidableEq, Repr, BEq

/-! An external registry asserts the relationship between an implementation
digest and callback code. The built-in declarative basis names the fixed
interpreter; the sibling `implementationDigest` stores the digest recomputed
from the complete data-only definition, matching the runtime descriptor shape.
Digest correctness and collision resistance remain runtime assumptions. -/
inductive TrustBasis where
  | externalRegistry
  | builtinDeclarativeJson (engine : String)
  deriving DecidableEq, Repr, BEq

structure VerifierDescriptor where
  verifierId : String
  verifierVersion : String
  implementationDigest : String
  trustBasis : TrustBasis
  deriving DecidableEq, Repr, BEq

structure ArtifactDescriptor where
  artifactId : String
  role : String
  mediaType : String
  byteLength : Nat
  digest : String
  deriving DecidableEq, Repr, BEq

structure MaterializedArtifact where
  descriptor : ArtifactDescriptor
  bytes : ArtifactBytes
  deriving DecidableEq, Repr, BEq

structure CaptureStatement where
  statementVersion : String
  scope : Scope
  challengeNonce : String
  challengeNonceByteLength : Nat
  capturedAt : Nat
  sensor : SensorDescriptor
  verifier : VerifierDescriptor
  artifacts : List ArtifactDescriptor
  deriving DecidableEq, Repr, BEq

structure SignedCapture where
  statement : CaptureStatement
  signerFingerprint : String
  signature : String
  artifacts : List MaterializedArtifact
  deriving DecidableEq, Repr, BEq

abbrev VerifyCaptureSignature :=
  String → CaptureStatement → String → Bool

structure VerificationPolicy where
  expectedScope : Scope
  expectedNonce : String
  now : Nat
  maxAge : Nat
  maxFutureSkew : Nat
  allowedSignerFingerprints : List String
  allowedSensors : List SensorDescriptor
  expectedVerifier : VerifierDescriptor
  requiredArtifactRoles : List String
  deriving DecidableEq, Repr, BEq

def descriptorIds (descriptors : List ArtifactDescriptor) : List String :=
  descriptors.map ArtifactDescriptor.artifactId

def descriptorRoles (descriptors : List ArtifactDescriptor) : List String :=
  descriptors.map ArtifactDescriptor.role

/-! Runtime canonicalization sorts the signed manifest by artifact identifier.
This adjacent comparison is sufficient because `String.compare` is a total
order. -/
def artifactDescriptorsStrictlySorted : List ArtifactDescriptor → Bool
  | [] => true
  | [_] => true
  | left :: right :: remaining =>
      (compare left.artifactId right.artifactId == .lt) &&
      artifactDescriptorsStrictlySorted (right :: remaining)

def artifactPayloadAgrees
    (digestBytes : DigestBytes)
    (artifact : MaterializedArtifact) : Bool :=
  decide (artifact.bytes.length = artifact.descriptor.byteLength) &&
  decide (digestBytes artifact.bytes = artifact.descriptor.digest)

def artifactManifestValid
    (digestBytes : DigestBytes)
    (capture : SignedCapture) : Bool :=
  decide (capture.artifacts ≠ []) &&
  (decide (capture.artifacts.map MaterializedArtifact.descriptor =
      capture.statement.artifacts) &&
  (decide (descriptorIds capture.statement.artifacts).Nodup &&
  (artifactDescriptorsStrictlySorted capture.statement.artifacts &&
  capture.artifacts.all (artifactPayloadAgrees digestBytes))))

def capturePolicyValid
    (policy : VerificationPolicy)
    (capture : SignedCapture) : Bool :=
  decide (capture.statement.scope = policy.expectedScope) &&
  (decide (capture.statement.challengeNonce = policy.expectedNonce) &&
  (decide (capture.statement.challengeNonceByteLength = 32) &&
  (decide (capture.statement.capturedAt ≤ policy.now + policy.maxFutureSkew) &&
  (decide (policy.now ≤ capture.statement.capturedAt + policy.maxAge) &&
  (decide (capture.statement.verifier = policy.expectedVerifier) &&
  (policy.requiredArtifactRoles.all (fun role =>
    descriptorRoles capture.statement.artifacts |>.contains role) &&
  decide (capture.statement.statementVersion =
    groundedCaptureStatementVersion)))))))

def captureProvenanceValid
    (verifySignature : VerifyCaptureSignature)
    (policy : VerificationPolicy)
    (capture : SignedCapture) : Bool :=
  policy.allowedSignerFingerprints.contains capture.signerFingerprint &&
  (policy.allowedSensors.contains capture.statement.sensor &&
  verifySignature
    capture.signerFingerprint
    capture.statement
    capture.signature)

def captureWellFormed
    (digestBytes : DigestBytes)
    (verifySignature : VerifyCaptureSignature)
    (policy : VerificationPolicy)
    (capture : SignedCapture) : Bool :=
  artifactManifestValid digestBytes capture &&
  (capturePolicyValid policy capture &&
  captureProvenanceValid verifySignature policy capture)

namespace CaptureValidation

structure Validated
    (digestBytes : DigestBytes)
    (verifySignature : VerifyCaptureSignature)
    (policy : VerificationPolicy) where
  raw : SignedCapture
  valid : captureWellFormed digestBytes verifySignature policy raw = true

def validate
    (digestBytes : DigestBytes)
    (verifySignature : VerifyCaptureSignature)
    (policy : VerificationPolicy)
    (capture : SignedCapture) :
    Option (Validated digestBytes verifySignature policy) :=
  if h : captureWellFormed digestBytes verifySignature policy capture = true then
    some ⟨capture, h⟩
  else
    none

theorem validate_some_implies_well_formed
    {digestBytes : DigestBytes}
    {verifySignature : VerifyCaptureSignature}
    {policy : VerificationPolicy}
    {capture : SignedCapture}
    {validated : Validated digestBytes verifySignature policy}
    (hResult : validate digestBytes verifySignature policy capture = some validated) :
    captureWellFormed digestBytes verifySignature policy capture = true := by
  unfold validate at hResult
  split at hResult
  next hValid => exact hValid
  next _ => simp at hResult

theorem well_formed_implies_exact_manifest
    {digestBytes : DigestBytes}
    {verifySignature : VerifyCaptureSignature}
    {policy : VerificationPolicy}
    {capture : SignedCapture}
    (hValid : captureWellFormed digestBytes verifySignature policy capture = true) :
    capture.artifacts.map MaterializedArtifact.descriptor =
      capture.statement.artifacts := by
  simp only [captureWellFormed, Bool.and_eq_true] at hValid
  have hManifest := hValid.1
  simp only [artifactManifestValid, Bool.and_eq_true] at hManifest
  exact of_decide_eq_true hManifest.2.1

theorem well_formed_implies_every_artifact_digest_agrees
    {digestBytes : DigestBytes}
    {verifySignature : VerifyCaptureSignature}
    {policy : VerificationPolicy}
    {capture : SignedCapture}
    (hValid : captureWellFormed digestBytes verifySignature policy capture = true) :
    ∀ artifact ∈ capture.artifacts,
      artifact.bytes.length = artifact.descriptor.byteLength ∧
      digestBytes artifact.bytes = artifact.descriptor.digest := by
  intro artifact hArtifact
  simp only [captureWellFormed, Bool.and_eq_true] at hValid
  have hManifest := hValid.1
  simp only [artifactManifestValid, Bool.and_eq_true] at hManifest
  have hArtifactValid :=
    (List.all_eq_true.mp hManifest.2.2.2.2) artifact hArtifact
  simp only [artifactPayloadAgrees, Bool.and_eq_true] at hArtifactValid
  exact ⟨of_decide_eq_true hArtifactValid.1,
    of_decide_eq_true hArtifactValid.2⟩

theorem well_formed_implies_expected_scope_and_nonce
    {digestBytes : DigestBytes}
    {verifySignature : VerifyCaptureSignature}
    {policy : VerificationPolicy}
    {capture : SignedCapture}
    (hValid : captureWellFormed digestBytes verifySignature policy capture = true) :
    capture.statement.scope = policy.expectedScope ∧
    capture.statement.challengeNonce = policy.expectedNonce := by
  simp only [captureWellFormed, Bool.and_eq_true] at hValid
  have hPolicy := hValid.2.1
  simp only [capturePolicyValid, Bool.and_eq_true] at hPolicy
  exact ⟨of_decide_eq_true hPolicy.1,
    of_decide_eq_true hPolicy.2.1⟩

theorem well_formed_implies_supported_statement_version
    {digestBytes : DigestBytes}
    {verifySignature : VerifyCaptureSignature}
    {policy : VerificationPolicy}
    {capture : SignedCapture}
    (hValid : captureWellFormed digestBytes verifySignature policy capture = true) :
    capture.statement.statementVersion = groundedCaptureStatementVersion := by
  simp only [captureWellFormed, Bool.and_eq_true] at hValid
  have hPolicy := hValid.2.1
  simp only [capturePolicyValid, Bool.and_eq_true] at hPolicy
  exact of_decide_eq_true hPolicy.2.2.2.2.2.2.2

theorem unsupported_statement_version_is_rejected
    (digestBytes : DigestBytes)
    (verifySignature : VerifyCaptureSignature)
    (policy : VerificationPolicy)
    (capture : SignedCapture)
    (hUnsupported :
      capture.statement.statementVersion ≠ groundedCaptureStatementVersion) :
    captureWellFormed digestBytes verifySignature policy capture = false := by
  simp [captureWellFormed, capturePolicyValid, hUnsupported]

theorem well_formed_implies_fresh
    {digestBytes : DigestBytes}
    {verifySignature : VerifyCaptureSignature}
    {policy : VerificationPolicy}
    {capture : SignedCapture}
    (hValid : captureWellFormed digestBytes verifySignature policy capture = true) :
    capture.statement.capturedAt ≤ policy.now + policy.maxFutureSkew ∧
    policy.now ≤ capture.statement.capturedAt + policy.maxAge := by
  simp only [captureWellFormed, Bool.and_eq_true] at hValid
  have hPolicy := hValid.2.1
  simp only [capturePolicyValid, Bool.and_eq_true] at hPolicy
  exact ⟨of_decide_eq_true hPolicy.2.2.2.1,
    of_decide_eq_true hPolicy.2.2.2.2.1⟩

theorem well_formed_implies_trusted_provenance
    {digestBytes : DigestBytes}
    {verifySignature : VerifyCaptureSignature}
    {policy : VerificationPolicy}
    {capture : SignedCapture}
    (hValid : captureWellFormed digestBytes verifySignature policy capture = true) :
    policy.allowedSignerFingerprints.contains capture.signerFingerprint = true ∧
    policy.allowedSensors.contains capture.statement.sensor = true ∧
    verifySignature
      capture.signerFingerprint
      capture.statement
      capture.signature = true := by
  simp only [captureWellFormed, Bool.and_eq_true] at hValid
  have hProvenance := hValid.2.2
  simp only [captureProvenanceValid, Bool.and_eq_true] at hProvenance
  exact ⟨hProvenance.1,
    hProvenance.2.1,
    hProvenance.2.2⟩

end CaptureValidation

structure ObservationVerifier where
  descriptor : VerifierDescriptor
  derive : SignedCapture → Option String

/-!
This is intentionally a small abstract model of the runtime's fixed
declarative-JSON interpreter.  It models an exact artifact selector and a
deterministic projection from the selected artifact bytes; it does not model
JavaScript JSON parsing, UTF-8, JSON Pointer fidelity, or SHA-256.

Unlike `ObservationVerifier.derive` on the external-registry path, the
declarative verifier below contains no supplied callback.  Its derivation is
definitionally `interpretVerifier program capture.artifacts`.
-/
structure DeclarativeVerifierProgram where
  artifactId : String
  role : String
  mediaType : String
  pointer : String
  deriving DecidableEq, Repr, BEq

structure DeclarativeVerifierDefinition where
  verifierId : String
  verifierVersion : String
  program : DeclarativeVerifierProgram
  deriving DecidableEq, Repr, BEq

abbrev DigestDeclarativeVerifierDefinition :=
  DeclarativeVerifierDefinition → String

def selectDeclarativeArtifact
    (program : DeclarativeVerifierProgram) :
    List MaterializedArtifact → Option MaterializedArtifact
  | [] => none
  | artifact :: remaining =>
      if artifact.descriptor.artifactId = program.artifactId ∧
          artifact.descriptor.role = program.role ∧
          artifact.descriptor.mediaType = program.mediaType then
        some artifact
      else
        selectDeclarativeArtifact program remaining

def interpretVerifier
    (program : DeclarativeVerifierProgram)
    (artifacts : List MaterializedArtifact) : Option String :=
  match selectDeclarativeArtifact program artifacts with
  | none => none
  | some artifact =>
      some (program.pointer ++ ":" ++ reprStr artifact.bytes)

def declarativeVerifierDescriptor
    (digestDefinition : DigestDeclarativeVerifierDefinition)
    (definition : DeclarativeVerifierDefinition) : VerifierDescriptor :=
  let definitionDigest := digestDefinition definition
  {
    verifierId := definition.verifierId
    verifierVersion := definition.verifierVersion
    implementationDigest := definitionDigest
    trustBasis := .builtinDeclarativeJson declarativeJsonVerifierEngine
  }

def declarativeObservationVerifier
    (digestDefinition : DigestDeclarativeVerifierDefinition)
    (definition : DeclarativeVerifierDefinition) : ObservationVerifier where
  descriptor := declarativeVerifierDescriptor digestDefinition definition
  derive := fun capture => interpretVerifier definition.program capture.artifacts

theorem declarative_verifier_descriptor_binds_complete_definition_digest
    (digestDefinition : DigestDeclarativeVerifierDefinition)
    (definition : DeclarativeVerifierDefinition) :
    let descriptor := declarativeVerifierDescriptor
      digestDefinition definition
    descriptor.implementationDigest = digestDefinition definition ∧
      descriptor.trustBasis =
        .builtinDeclarativeJson declarativeJsonVerifierEngine ∧
      descriptor.verifierId = definition.verifierId ∧
      descriptor.verifierVersion = definition.verifierVersion := by
  simp [declarativeVerifierDescriptor]

/-!
The runtime declarative contract is a bounded all-of assertion list over the
derived observation and the five-field scope.  This executable Lean slice
models its equality assertions without admitting a supplied callback.  JSON
Pointer parsing and JSON value typing remain runtime-boundary details.
-/
inductive DeclarativeContractSource where
  | observation
  | repository
  | revision
  | environment
  | target
  | proofAttempt
  deriving DecidableEq, Repr, BEq

structure DeclarativeContractAssertion where
  source : DeclarativeContractSource
  expected : String
  deriving DecidableEq, Repr, BEq

structure DeclarativeContractProgram where
  assertions : List DeclarativeContractAssertion
  deriving DecidableEq, Repr, BEq

structure DeclarativeContractDefinition where
  contractId : String
  contractVersion : String
  label : String
  claim : ClaimDescriptor
  program : DeclarativeContractProgram
  deriving DecidableEq, Repr, BEq

abbrev DigestDeclarativeContractDefinition :=
  DeclarativeContractDefinition → String

def readDeclarativeContractSource
    (source : DeclarativeContractSource)
    (scope : Scope)
    (observation : String) : String :=
  match source with
  | .observation => observation
  | .repository => scope.repository
  | .revision => scope.revision
  | .environment => scope.environment
  | .target => scope.target
  | .proofAttempt => scope.proofAttempt

def evaluateDeclarativeContractAssertion
    (scope : Scope)
    (observation : String)
    (assertion : DeclarativeContractAssertion) : Bool :=
  decide (readDeclarativeContractSource assertion.source scope observation =
    assertion.expected)

def interpretDeclarativeContract
    (program : DeclarativeContractProgram)
    (scope : Scope)
    (observation : String) : Bool :=
  decide (0 < program.assertions.length ∧ program.assertions.length ≤ 64) &&
    program.assertions.all
      (evaluateDeclarativeContractAssertion scope observation)

private def declarativeContractBoundTestScope : Scope where
  repository := "riddledc/integrations"
  revision := "grounded-evidence-bound-test"
  environment := "lean"
  target := "fixture"
  proofAttempt := "declarative-contract-bound-test"

private def declarativeContractBoundTestAssertion : DeclarativeContractAssertion where
  source := .observation
  expected := "accepted"

theorem empty_declarative_contract_program_is_rejected :
    interpretDeclarativeContract { assertions := [] }
      declarativeContractBoundTestScope "accepted" = false := by
  native_decide

theorem one_assertion_declarative_contract_program_can_accept :
    interpretDeclarativeContract
      { assertions := [declarativeContractBoundTestAssertion] }
      declarativeContractBoundTestScope "accepted" = true := by
  native_decide

theorem sixty_five_assertion_declarative_contract_program_is_rejected :
    interpretDeclarativeContract
      { assertions := List.replicate 65 declarativeContractBoundTestAssertion }
      declarativeContractBoundTestScope "accepted" = false := by
  native_decide

structure ContractRef where
  contractId : String
  contractVersion : String
  implementationDigest : String
  trustBasis : TrustBasis
  deriving DecidableEq, Repr, BEq

structure ContractDescriptor where
  contractId : String
  contractVersion : String
  implementationDigest : String
  trustBasis : TrustBasis
  label : String
  claim : ClaimDescriptor
  deriving DecidableEq, Repr, BEq

namespace ContractDescriptor

def ref (descriptor : ContractDescriptor) : ContractRef where
  contractId := descriptor.contractId
  contractVersion := descriptor.contractVersion
  implementationDigest := descriptor.implementationDigest
  trustBasis := descriptor.trustBasis

end ContractDescriptor

def declarativeContractDescriptor
    (digestDefinition : DigestDeclarativeContractDefinition)
    (definition : DeclarativeContractDefinition) : ContractDescriptor :=
  let definitionDigest := digestDefinition definition
  {
    contractId := definition.contractId
    contractVersion := definition.contractVersion
    implementationDigest := definitionDigest
    trustBasis := .builtinDeclarativeJson declarativeJsonContractEngine
    label := definition.label
    claim := definition.claim
  }

theorem declarative_contract_descriptor_binds_complete_definition_digest
    (digestDefinition : DigestDeclarativeContractDefinition)
    (definition : DeclarativeContractDefinition) :
    let descriptor := declarativeContractDescriptor digestDefinition definition
    descriptor.implementationDigest = digestDefinition definition ∧
      descriptor.trustBasis =
        .builtinDeclarativeJson declarativeJsonContractEngine ∧
      descriptor.contractId = definition.contractId ∧
      descriptor.contractVersion = definition.contractVersion ∧
      descriptor.label = definition.label ∧
      descriptor.claim = definition.claim := by
  simp [declarativeContractDescriptor]

structure GroundingContract where
  contractId : String
  contractVersion : String
  implementationDigest : String
  trustBasis : TrustBasis
  label : String
  claim : ClaimDescriptor
  accepts : Scope → String → Bool
  meaning : Scope → String → Prop
  establishes : ∀ {scope observation},
    accepts scope observation = true → meaning scope observation

namespace GroundingContract

def descriptor (contract : GroundingContract) : ContractDescriptor where
  contractId := contract.contractId
  contractVersion := contract.contractVersion
  implementationDigest := contract.implementationDigest
  trustBasis := contract.trustBasis
  label := contract.label
  claim := contract.claim

def ref (contract : GroundingContract) : ContractRef :=
  contract.descriptor.ref

end GroundingContract

def declarativeGroundingContract
    (digestDefinition : DigestDeclarativeContractDefinition)
    (definition : DeclarativeContractDefinition) : GroundingContract :=
  let descriptor := declarativeContractDescriptor digestDefinition definition
  {
    contractId := descriptor.contractId
    contractVersion := descriptor.contractVersion
    implementationDigest := descriptor.implementationDigest
    trustBasis := descriptor.trustBasis
    label := descriptor.label
    claim := descriptor.claim
    accepts := interpretDeclarativeContract definition.program
    meaning := fun scope observation =>
      interpretDeclarativeContract definition.program scope observation = true
    establishes := by
      intro scope observation hAccepted
      exact hAccepted
  }

@[simp] theorem declarative_grounding_contract_descriptor_is_content_addressed
    (digestDefinition : DigestDeclarativeContractDefinition)
    (definition : DeclarativeContractDefinition) :
    (declarativeGroundingContract digestDefinition definition).descriptor =
      declarativeContractDescriptor digestDefinition definition := by
  rfl

structure VerificationReceiptBody where
  scope : Scope
  contractId : String
  contractVersion : String
  contractImplementationDigest : String
  contractTrustBasis : TrustBasis
  contractLabel : String
  claim : ClaimDescriptor
  captureStatementDigest : String
  signerFingerprint : String
  verifier : VerifierDescriptor
  observation : String
  observationDigest : String
  artifacts : List ArtifactDescriptor
  deriving DecidableEq, Repr, BEq

namespace VerificationReceiptBody

def contractDescriptor (body : VerificationReceiptBody) : ContractDescriptor where
  contractId := body.contractId
  contractVersion := body.contractVersion
  implementationDigest := body.contractImplementationDigest
  trustBasis := body.contractTrustBasis
  label := body.contractLabel
  claim := body.claim

end VerificationReceiptBody

structure VerificationReceiptIdentity where
  receiptId : String
  receiptDigest : String
  canonicalBodyWitness : String
  deriving DecidableEq, Repr, BEq

structure VerificationReceipt where
  identity : VerificationReceiptIdentity
  body : VerificationReceiptBody
  deriving DecidableEq, Repr, BEq

structure ContentAddressing where
  statementDigest : CaptureStatement → String
  observationDigest : String → String
  identifyReceipt : VerificationReceiptBody → VerificationReceiptIdentity

namespace VerificationReceipt

def evidenceRef (receipt : VerificationReceipt) : EvidenceRef where
  receiptId := receipt.identity.receiptId
  artifactDigest := receipt.identity.receiptDigest
  role := "grounded_verification_receipt"

def artifactEvidenceRefs (receipt : VerificationReceipt) : List EvidenceRef :=
  receipt.body.artifacts.map (fun artifact => {
    receiptId := receipt.identity.receiptId
    artifactDigest := artifact.digest
    role := artifact.role
  })

def evidence (receipt : VerificationReceipt) : EvidenceBundle where
  first := receipt.evidenceRef
  rest := receipt.artifactEvidenceRefs

end VerificationReceipt

def makeVerificationReceipt
    (addressing : ContentAddressing)
    (capture : SignedCapture)
    (verifier : ObservationVerifier)
    (contract : GroundingContract)
    (observation : String) : VerificationReceipt :=
  let body : VerificationReceiptBody := {
    scope := capture.statement.scope
    contractId := contract.contractId
    contractVersion := contract.contractVersion
    contractImplementationDigest := contract.implementationDigest
    contractTrustBasis := contract.trustBasis
    contractLabel := contract.label
    claim := contract.claim
    captureStatementDigest := addressing.statementDigest capture.statement
    signerFingerprint := capture.signerFingerprint
    verifier := verifier.descriptor
    observation := observation
    observationDigest := addressing.observationDigest observation
    artifacts := capture.statement.artifacts
  }
  {
    identity := addressing.identifyReceipt body
    body := body
  }

@[simp] theorem make_verification_receipt_binds_exact_contract_descriptor
    (addressing : ContentAddressing)
    (capture : SignedCapture)
    (verifier : ObservationVerifier)
    (contract : GroundingContract)
    (observation : String) :
    (makeVerificationReceipt addressing capture verifier contract observation).body.contractDescriptor =
      contract.descriptor := by
  rfl

def certificateFromVerificationReceipt
    (certificateId canonicalBodyWitness : String)
    (receipt : VerificationReceipt) : CertificateNode where
  certificateId := certificateId
  canonicalBodyWitness := canonicalBodyWitness
  scope := receipt.body.scope
  claim := receipt.body.claim
  evidence := receipt.evidence
  derivation := .contract receipt.body.claim.key

structure GroundedIssuance
    (digestBytes : DigestBytes)
    (verifySignature : VerifyCaptureSignature)
    (addressing : ContentAddressing)
    (policy : VerificationPolicy)
    (verifier : ObservationVerifier)
    (contract : GroundingContract) where
  capture : SignedCapture
  observation : String
  receipt : VerificationReceipt
  certificate : CertificateNode
  expectedContract : ContractRef
  captureValid :
    captureWellFormed digestBytes verifySignature policy capture = true
  verifierIsTrusted : verifier.descriptor = policy.expectedVerifier
  contractIsTrusted : contract.ref = expectedContract
  derived : verifier.derive capture = some observation
  contractAccepted :
    contract.accepts capture.statement.scope observation = true
  meaningHolds : contract.meaning capture.statement.scope observation
  receiptIsExact :
    receipt = makeVerificationReceipt addressing capture verifier contract observation
  certificateIsExact :
    certificate = certificateFromVerificationReceipt
      certificate.certificateId
      certificate.canonicalBodyWitness
      receipt

def issueGroundedChecked?
    (digestBytes : DigestBytes)
    (verifySignature : VerifyCaptureSignature)
    (addressing : ContentAddressing)
    (policy : VerificationPolicy)
    (verifier : ObservationVerifier)
    (expectedContract : ContractRef)
    (contract : GroundingContract)
    (certificateId canonicalBodyWitness : String)
    (capture : SignedCapture) :
    Option (GroundedIssuance
      digestBytes verifySignature addressing policy verifier contract) :=
  if hContract : contract.ref = expectedContract then
    if hVerifier : verifier.descriptor = policy.expectedVerifier then
      if hCapture :
          captureWellFormed digestBytes verifySignature policy capture = true then
        match hDerived : verifier.derive capture with
        | none => none
        | some observation =>
            if hAccepted :
                contract.accepts capture.statement.scope observation = true then
              let receipt :=
                makeVerificationReceipt addressing capture verifier contract observation
              let certificate :=
                certificateFromVerificationReceipt
                  certificateId canonicalBodyWitness receipt
              some {
                capture := capture
                observation := observation
                receipt := receipt
                certificate := certificate
                expectedContract := expectedContract
                captureValid := hCapture
                verifierIsTrusted := hVerifier
                contractIsTrusted := hContract
                derived := hDerived
                contractAccepted := hAccepted
                meaningHolds := contract.establishes hAccepted
                receiptIsExact := rfl
                certificateIsExact := rfl
              }
            else
              none
      else
        none
    else
      none
  else
    none

theorem mismatched_expected_contract_ref_rejects_issuance
    (digestBytes : DigestBytes)
    (verifySignature : VerifyCaptureSignature)
    (addressing : ContentAddressing)
    (policy : VerificationPolicy)
    (verifier : ObservationVerifier)
    (expectedContract : ContractRef)
    (contract : GroundingContract)
    (certificateId canonicalBodyWitness : String)
    (capture : SignedCapture)
    (hMismatch : contract.ref ≠ expectedContract) :
    issueGroundedChecked? digestBytes verifySignature addressing policy verifier
      expectedContract contract certificateId canonicalBodyWitness capture = none := by
  simp [issueGroundedChecked?, hMismatch]

theorem mismatched_expected_contract_implementation_digest_rejects_issuance
    (digestBytes : DigestBytes)
    (verifySignature : VerifyCaptureSignature)
    (addressing : ContentAddressing)
    (policy : VerificationPolicy)
    (verifier : ObservationVerifier)
    (expectedContract : ContractRef)
    (contract : GroundingContract)
    (certificateId canonicalBodyWitness : String)
    (capture : SignedCapture)
    (hMismatch : contract.implementationDigest ≠ expectedContract.implementationDigest) :
    issueGroundedChecked? digestBytes verifySignature addressing policy verifier
      expectedContract contract certificateId canonicalBodyWitness capture = none := by
  apply mismatched_expected_contract_ref_rejects_issuance
  intro hEqual
  apply hMismatch
  simpa [GroundingContract.ref, GroundingContract.descriptor,
    ContractDescriptor.ref] using congrArg ContractRef.implementationDigest hEqual

theorem mismatched_expected_contract_trust_basis_rejects_issuance
    (digestBytes : DigestBytes)
    (verifySignature : VerifyCaptureSignature)
    (addressing : ContentAddressing)
    (policy : VerificationPolicy)
    (verifier : ObservationVerifier)
    (expectedContract : ContractRef)
    (contract : GroundingContract)
    (certificateId canonicalBodyWitness : String)
    (capture : SignedCapture)
    (hMismatch : contract.trustBasis ≠ expectedContract.trustBasis) :
    issueGroundedChecked? digestBytes verifySignature addressing policy verifier
      expectedContract contract certificateId canonicalBodyWitness capture = none := by
  apply mismatched_expected_contract_ref_rejects_issuance
  intro hEqual
  apply hMismatch
  simpa [GroundingContract.ref, GroundingContract.descriptor,
    ContractDescriptor.ref] using congrArg ContractRef.trustBasis hEqual

abbrev DeclarativeGroundedIssuance
    (digestBytes : DigestBytes)
    (verifySignature : VerifyCaptureSignature)
    (addressing : ContentAddressing)
    (policy : VerificationPolicy)
    (digestDefinition : DigestDeclarativeVerifierDefinition)
    (definition : DeclarativeVerifierDefinition)
    (contract : GroundingContract) :=
  GroundedIssuance
    digestBytes verifySignature addressing policy
    (declarativeObservationVerifier digestDefinition definition)
    contract

def issueDeclarativeGroundedChecked?
    (digestBytes : DigestBytes)
    (verifySignature : VerifyCaptureSignature)
    (addressing : ContentAddressing)
    (policy : VerificationPolicy)
    (digestDefinition : DigestDeclarativeVerifierDefinition)
    (definition : DeclarativeVerifierDefinition)
    (expectedContract : ContractRef)
    (contract : GroundingContract)
    (certificateId canonicalBodyWitness : String)
    (capture : SignedCapture) :
    Option (DeclarativeGroundedIssuance
      digestBytes verifySignature addressing policy digestDefinition
      definition contract) :=
  issueGroundedChecked?
    digestBytes verifySignature addressing policy
    (declarativeObservationVerifier digestDefinition definition)
    expectedContract contract certificateId canonicalBodyWitness capture

theorem declarative_issuance_uses_only_fixed_interpreter_observation
    {digestBytes : DigestBytes}
    {verifySignature : VerifyCaptureSignature}
    {addressing : ContentAddressing}
    {policy : VerificationPolicy}
    {digestDefinition : DigestDeclarativeVerifierDefinition}
    {definition : DeclarativeVerifierDefinition}
    {contract : GroundingContract}
    (issuance : DeclarativeGroundedIssuance
      digestBytes verifySignature addressing policy digestDefinition
      definition contract) :
    interpretVerifier definition.program issuance.capture.artifacts =
      some issuance.observation := by
  simpa [declarativeObservationVerifier] using issuance.derived

theorem mismatched_expected_verifier_definition_digest_rejects_declarative_issuance
    {digestBytes : DigestBytes}
    {verifySignature : VerifyCaptureSignature}
    {addressing : ContentAddressing}
    {policy : VerificationPolicy}
    {digestDefinition : DigestDeclarativeVerifierDefinition}
    {definition : DeclarativeVerifierDefinition}
    {expectedContract : ContractRef}
    {contract : GroundingContract}
    {certificateId canonicalBodyWitness : String}
    {capture : SignedCapture}
    (hMismatch :
      policy.expectedVerifier.implementationDigest ≠
        digestDefinition definition) :
    issueDeclarativeGroundedChecked?
      digestBytes verifySignature addressing policy digestDefinition
      definition expectedContract contract
      certificateId canonicalBodyWitness capture = none := by
  unfold issueDeclarativeGroundedChecked? issueGroundedChecked?
  split
  next _hContract =>
    split
    next hTrusted =>
      have hDigest := congrArg VerifierDescriptor.implementationDigest hTrusted
      have hExpected :
          policy.expectedVerifier.implementationDigest =
            digestDefinition definition := by
        simpa [declarativeObservationVerifier, declarativeVerifierDescriptor] using
          hDigest.symm
      exact False.elim (hMismatch hExpected)
    next _ => rfl
  next _ => rfl

theorem issued_observation_is_exact_verifier_output
    {digestBytes : DigestBytes}
    {verifySignature : VerifyCaptureSignature}
    {addressing : ContentAddressing}
    {policy : VerificationPolicy}
    {verifier : ObservationVerifier}
    {contract : GroundingContract}
    (issuance : GroundedIssuance
      digestBytes verifySignature addressing policy verifier contract) :
    verifier.derive issuance.capture = some issuance.observation :=
  issuance.derived

theorem grounded_issuance_contract_accepts_derived_observation
    {digestBytes : DigestBytes}
    {verifySignature : VerifyCaptureSignature}
    {addressing : ContentAddressing}
    {policy : VerificationPolicy}
    {verifier : ObservationVerifier}
    {contract : GroundingContract}
    (issuance : GroundedIssuance
      digestBytes verifySignature addressing policy verifier contract) :
    contract.accepts issuance.capture.statement.scope issuance.observation = true ∧
    contract.meaning issuance.capture.statement.scope issuance.observation :=
  ⟨issuance.contractAccepted, issuance.meaningHolds⟩

theorem declarative_contract_issuance_uses_only_fixed_interpreter_decision
    {digestBytes : DigestBytes}
    {verifySignature : VerifyCaptureSignature}
    {addressing : ContentAddressing}
    {policy : VerificationPolicy}
    {verifier : ObservationVerifier}
    {digestDefinition : DigestDeclarativeContractDefinition}
    {definition : DeclarativeContractDefinition}
    (issuance : GroundedIssuance
      digestBytes verifySignature addressing policy verifier
      (declarativeGroundingContract digestDefinition definition)) :
    interpretDeclarativeContract definition.program
      issuance.capture.statement.scope issuance.observation = true := by
  simpa [declarativeGroundingContract] using issuance.contractAccepted

theorem declarative_contract_issuance_receipt_binds_exact_descriptor
    {digestBytes : DigestBytes}
    {verifySignature : VerifyCaptureSignature}
    {addressing : ContentAddressing}
    {policy : VerificationPolicy}
    {verifier : ObservationVerifier}
    {digestDefinition : DigestDeclarativeContractDefinition}
    {definition : DeclarativeContractDefinition}
    (issuance : GroundedIssuance
      digestBytes verifySignature addressing policy verifier
      (declarativeGroundingContract digestDefinition definition)) :
    issuance.receipt.body.contractDescriptor =
      declarativeContractDescriptor digestDefinition definition := by
  rw [issuance.receiptIsExact]
  rfl

theorem grounded_issuance_certificate_uses_exact_receipt_evidence
    {digestBytes : DigestBytes}
    {verifySignature : VerifyCaptureSignature}
    {addressing : ContentAddressing}
    {policy : VerificationPolicy}
    {verifier : ObservationVerifier}
    {contract : GroundingContract}
    (issuance : GroundedIssuance
      digestBytes verifySignature addressing policy verifier contract) :
    issuance.certificate.evidence = issuance.receipt.evidence := by
  rw [issuance.certificateIsExact]
  rfl

structure GroundingSidecar where
  certificateId : CertificateId
  capture : SignedCapture
  receipt : VerificationReceipt
  deriving DecidableEq, Repr, BEq

namespace GroundingSidecar

def fromIssuance
    {digestBytes : DigestBytes}
    {verifySignature : VerifyCaptureSignature}
    {addressing : ContentAddressing}
    {policy : VerificationPolicy}
    {verifier : ObservationVerifier}
    {contract : GroundingContract}
    (issuance : GroundedIssuance
      digestBytes verifySignature addressing policy verifier contract) :
    GroundingSidecar where
  certificateId := issuance.certificate.certificateId
  capture := issuance.capture
  receipt := issuance.receipt

def matchesCertificate
    (sidecar : GroundingSidecar)
    (certificate : CertificateNode) : Bool :=
  decide (
    sidecar.certificateId = certificate.certificateId ∧
    sidecar.receipt.body.scope = sidecar.capture.statement.scope ∧
    sidecar.receipt.body.signerFingerprint = sidecar.capture.signerFingerprint ∧
    sidecar.receipt.body.verifier = sidecar.capture.statement.verifier ∧
    sidecar.receipt.body.artifacts = sidecar.capture.statement.artifacts ∧
    sidecar.receipt.body.scope = certificate.scope ∧
    sidecar.receipt.body.claim = certificate.claim ∧
    certificate.evidence = sidecar.receipt.evidence ∧
    certificate.derivation = .contract sidecar.receipt.body.claim.key)

theorem matches_certificate_implies_contract_derivation
    {sidecar : GroundingSidecar}
    {certificate : CertificateNode}
    (hMatches : sidecar.matchesCertificate certificate = true) :
    certificate.derivation = .contract sidecar.receipt.body.claim.key := by
  have hFacts := of_decide_eq_true hMatches
  exact hFacts.2.2.2.2.2.2.2.2

end GroundingSidecar

/-!
Replay independently re-runs the capture policy, selects the exact trusted
verifier descriptor, derives the observation, re-runs the contract, and
reconstructs the receipt. The sidecar does not get to supply an observation to
this function.
-/
def replayVerificationReceipt
    (digestBytes : DigestBytes)
    (verifySignature : VerifyCaptureSignature)
    (addressing : ContentAddressing)
    (policy : VerificationPolicy)
    (verifier : ObservationVerifier)
    (expectedContract : ContractRef)
    (contract : GroundingContract)
    (sidecar : GroundingSidecar) : Bool :=
  decide (contract.ref = expectedContract) &&
  (captureWellFormed digestBytes verifySignature policy sidecar.capture &&
  (decide (verifier.descriptor = policy.expectedVerifier) &&
  match verifier.derive sidecar.capture with
  | none => false
  | some observation =>
      contract.accepts sidecar.capture.statement.scope observation &&
      decide (sidecar.receipt =
        makeVerificationReceipt
          addressing sidecar.capture verifier contract observation)))

theorem replay_true_implies_exact_derived_observation_and_receipt
    {digestBytes : DigestBytes}
    {verifySignature : VerifyCaptureSignature}
    {addressing : ContentAddressing}
    {policy : VerificationPolicy}
    {verifier : ObservationVerifier}
    {expectedContract : ContractRef}
    {contract : GroundingContract}
    {sidecar : GroundingSidecar}
    (hReplay : replayVerificationReceipt
      digestBytes verifySignature addressing policy verifier
      expectedContract contract sidecar = true) :
    contract.ref = expectedContract ∧
    captureWellFormed digestBytes verifySignature policy sidecar.capture = true ∧
    verifier.descriptor = policy.expectedVerifier ∧
    ∃ observation,
      verifier.derive sidecar.capture = some observation ∧
      contract.accepts sidecar.capture.statement.scope observation = true ∧
      sidecar.receipt =
        makeVerificationReceipt
          addressing sidecar.capture verifier contract observation := by
  unfold replayVerificationReceipt at hReplay
  simp only [Bool.and_eq_true] at hReplay
  refine ⟨of_decide_eq_true hReplay.1, hReplay.2.1,
    of_decide_eq_true hReplay.2.2.1, ?_⟩
  cases hDerived : verifier.derive sidecar.capture with
  | none =>
      simp [hDerived] at hReplay
  | some observation =>
      have hObservation := hReplay.2.2.2
      rw [hDerived] at hObservation
      simp only [Bool.and_eq_true] at hObservation
      exact ⟨observation, rfl, hObservation.1,
        of_decide_eq_true hObservation.2⟩

theorem mismatched_expected_contract_ref_rejects_replay
    (digestBytes : DigestBytes)
    (verifySignature : VerifyCaptureSignature)
    (addressing : ContentAddressing)
    (policy : VerificationPolicy)
    (verifier : ObservationVerifier)
    (expectedContract : ContractRef)
    (contract : GroundingContract)
    (sidecar : GroundingSidecar)
    (hMismatch : contract.ref ≠ expectedContract) :
    replayVerificationReceipt digestBytes verifySignature addressing policy verifier
      expectedContract contract sidecar = false := by
  simp [replayVerificationReceipt, hMismatch]

theorem mismatched_expected_contract_implementation_digest_rejects_replay
    (digestBytes : DigestBytes)
    (verifySignature : VerifyCaptureSignature)
    (addressing : ContentAddressing)
    (policy : VerificationPolicy)
    (verifier : ObservationVerifier)
    (expectedContract : ContractRef)
    (contract : GroundingContract)
    (sidecar : GroundingSidecar)
    (hMismatch : contract.implementationDigest ≠ expectedContract.implementationDigest) :
    replayVerificationReceipt digestBytes verifySignature addressing policy verifier
      expectedContract contract sidecar = false := by
  apply mismatched_expected_contract_ref_rejects_replay
  intro hEqual
  apply hMismatch
  simpa [GroundingContract.ref, GroundingContract.descriptor,
    ContractDescriptor.ref] using congrArg ContractRef.implementationDigest hEqual

theorem mismatched_expected_contract_trust_basis_rejects_replay
    (digestBytes : DigestBytes)
    (verifySignature : VerifyCaptureSignature)
    (addressing : ContentAddressing)
    (policy : VerificationPolicy)
    (verifier : ObservationVerifier)
    (expectedContract : ContractRef)
    (contract : GroundingContract)
    (sidecar : GroundingSidecar)
    (hMismatch : contract.trustBasis ≠ expectedContract.trustBasis) :
    replayVerificationReceipt digestBytes verifySignature addressing policy verifier
      expectedContract contract sidecar = false := by
  apply mismatched_expected_contract_ref_rejects_replay
  intro hEqual
  apply hMismatch
  simpa [GroundingContract.ref, GroundingContract.descriptor,
    ContractDescriptor.ref] using congrArg ContractRef.trustBasis hEqual

theorem replay_true_implies_contract_meaning
    {digestBytes : DigestBytes}
    {verifySignature : VerifyCaptureSignature}
    {addressing : ContentAddressing}
    {policy : VerificationPolicy}
    {verifier : ObservationVerifier}
    {contract : GroundingContract}
    {sidecar : GroundingSidecar}
    (hReplay : replayVerificationReceipt
      digestBytes verifySignature addressing policy verifier
      expectedContract contract sidecar = true) :
    contract.meaning
      sidecar.capture.statement.scope
      sidecar.receipt.body.observation := by
  rcases replay_true_implies_exact_derived_observation_and_receipt hReplay with
    ⟨_hContract, _hCapture, _hVerifier, observation, _hDerived, hAccepted, hReceipt⟩
  rw [hReceipt]
  exact contract.establishes hAccepted

theorem declarative_contract_replay_uses_only_fixed_interpreter_decision
    {digestBytes : DigestBytes}
    {verifySignature : VerifyCaptureSignature}
    {addressing : ContentAddressing}
    {policy : VerificationPolicy}
    {verifier : ObservationVerifier}
    {expectedContract : ContractRef}
    {digestDefinition : DigestDeclarativeContractDefinition}
    {definition : DeclarativeContractDefinition}
    {sidecar : GroundingSidecar}
    (hReplay : replayVerificationReceipt
      digestBytes verifySignature addressing policy verifier
      expectedContract (declarativeGroundingContract digestDefinition definition)
      sidecar = true) :
    ∃ observation,
      verifier.derive sidecar.capture = some observation ∧
      interpretDeclarativeContract definition.program
        sidecar.capture.statement.scope observation = true ∧
      sidecar.receipt.body.contractDescriptor =
        declarativeContractDescriptor digestDefinition definition := by
  rcases replay_true_implies_exact_derived_observation_and_receipt hReplay with
    ⟨_hContract, _hCapture, _hVerifier, observation, hDerived, hAccepted, hReceipt⟩
  refine ⟨observation, hDerived, ?_, ?_⟩
  · simpa [declarativeGroundingContract] using hAccepted
  · rw [hReceipt]
    rfl

/-! `replayAccepted` is deliberately an explicit parameter at the closure
boundary. The runtime instantiates it by replaying digest, signature, policy,
trusted verifier, receipt, contract, and exact-certificate checks. -/
abbrev ReplayAccepted := GroundingSidecar → Bool

/-!
`CertificateNode.canonicalBodyWitness` already stands for the complete runtime
body, including its issued-at field. `IssuedAtFromCanonicalBody` represents the
runtime's canonical-body parser. Requiring that parser to recover each modeled
time binds chronology to the exact body witness. Fidelity of the supplied
parser to the runtime implementation remains an explicit boundary assumption.
-/
abbrev IssuedAtFromCanonicalBody := String → Option Nat

structure CertificateChronology where
  certificateId : CertificateId
  canonicalBodyWitness : String
  issuedAt : Nat
  deriving DecidableEq, Repr, BEq

namespace CertificateChronology

def matchesCertificate
    (issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody)
    (chronology : CertificateChronology)
    (certificate : CertificateNode) : Bool :=
  decide (
    chronology.certificateId = certificate.certificateId ∧
    chronology.canonicalBodyWitness = certificate.canonicalBodyWitness ∧
    issuedAtFromCanonicalBody certificate.canonicalBodyWitness =
      some chronology.issuedAt)

end CertificateChronology

structure GroundedClosure where
  semantic : Closure
  sidecars : List GroundingSidecar
  chronology : List CertificateChronology
  deriving DecidableEq, Repr, BEq

namespace GroundedClosure

def sidecarCertificateIds (packet : GroundedClosure) : List CertificateId :=
  packet.sidecars.map GroundingSidecar.certificateId

def chronologyCertificateIds (packet : GroundedClosure) : List CertificateId :=
  packet.chronology.map CertificateChronology.certificateId

def issuedAt?
    (packet : GroundedClosure)
    (certificateId : CertificateId) : Option Nat :=
  (packet.chronology.find? (fun chronology =>
    chronology.certificateId = certificateId)).map
      CertificateChronology.issuedAt

def hasSidecarId
    (packet : GroundedClosure)
    (certificateId : CertificateId) : Bool :=
  packet.sidecars.any (fun sidecar =>
    decide (sidecar.certificateId = certificateId))

def hasMatchingSidecar
    (packet : GroundedClosure)
    (certificate : CertificateNode) : Bool :=
  packet.sidecars.any (fun sidecar => sidecar.matchesCertificate certificate)

def exactLeafSidecars (packet : GroundedClosure) : Bool :=
  decide packet.sidecarCertificateIds.Nodup &&
  (packet.semantic.certificates.all (fun certificate =>
    match certificate.derivation with
    | .contract _ => packet.hasMatchingSidecar certificate
    | .composition _ _ => !packet.hasSidecarId certificate.certificateId) &&
  packet.sidecars.all (fun sidecar =>
    packet.semantic.certificates.any (fun certificate =>
      sidecar.matchesCertificate certificate)))

def exactCertificateChronology
    (issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody)
    (packet : GroundedClosure) : Bool :=
  decide packet.chronologyCertificateIds.Nodup &&
  (packet.semantic.certificates.all (fun certificate =>
    packet.chronology.any (fun chronology =>
      chronology.matchesCertificate issuedAtFromCanonicalBody certificate)) &&
  packet.chronology.all (fun chronology =>
    packet.semantic.certificates.any (fun certificate =>
      chronology.matchesCertificate issuedAtFromCanonicalBody certificate)))

def directPremiseChronologyMonotone (packet : GroundedClosure) : Bool :=
  packet.semantic.certificates.all (fun parent =>
    parent.premises.all (fun premise =>
      match packet.issuedAt? parent.certificateId,
          packet.issuedAt? premise.certificateId with
      | some parentIssuedAt, some premiseIssuedAt =>
          decide (premiseIssuedAt ≤ parentIssuedAt)
      | _, _ => false))

def wellFormed
    (replayAccepted : ReplayAccepted)
    (issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody)
    (packet : GroundedClosure) : Bool :=
  packet.semantic.wellFormed &&
  (packet.exactLeafSidecars &&
  (packet.sidecars.all replayAccepted &&
  (packet.exactCertificateChronology issuedAtFromCanonicalBody &&
  packet.directPremiseChronologyMonotone)))

structure Validated
    (replayAccepted : ReplayAccepted)
    (issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody) where
  raw : GroundedClosure
  valid : raw.wellFormed replayAccepted issuedAtFromCanonicalBody = true

def validate
    (replayAccepted : ReplayAccepted)
    (issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody)
    (packet : GroundedClosure) :
    Option (Validated replayAccepted issuedAtFromCanonicalBody) :=
  if h : packet.wellFormed replayAccepted issuedAtFromCanonicalBody = true then
    some ⟨packet, h⟩
  else
    none

theorem validate_some_implies_well_formed
    {replayAccepted : ReplayAccepted}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {packet : GroundedClosure}
    {validated : Validated replayAccepted issuedAtFromCanonicalBody}
    (hResult : validate replayAccepted issuedAtFromCanonicalBody packet =
      some validated) :
    packet.wellFormed replayAccepted issuedAtFromCanonicalBody = true := by
  unfold validate at hResult
  split at hResult
  next hValid => exact hValid
  next _ => simp at hResult

theorem well_formed_implies_semantic_well_formed
    {replayAccepted : ReplayAccepted}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {packet : GroundedClosure}
    (hValid : packet.wellFormed replayAccepted issuedAtFromCanonicalBody = true) :
    packet.semantic.wellFormed = true := by
  simp only [wellFormed, Bool.and_eq_true] at hValid
  exact hValid.1

theorem well_formed_implies_every_sidecar_replayed
    {replayAccepted : ReplayAccepted}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {packet : GroundedClosure}
    (hValid : packet.wellFormed replayAccepted issuedAtFromCanonicalBody = true)
    {sidecar : GroundingSidecar}
    (hSidecar : sidecar ∈ packet.sidecars) :
    replayAccepted sidecar = true := by
  simp only [wellFormed, Bool.and_eq_true] at hValid
  exact (List.all_eq_true.mp hValid.2.2.1) sidecar hSidecar

theorem well_formed_implies_unique_sidecar_certificate_ids
    {replayAccepted : ReplayAccepted}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {packet : GroundedClosure}
    (hValid : packet.wellFormed replayAccepted issuedAtFromCanonicalBody = true) :
    packet.sidecarCertificateIds.Nodup := by
  simp only [wellFormed, Bool.and_eq_true] at hValid
  have hExact := hValid.2.1
  simp only [exactLeafSidecars, Bool.and_eq_true] at hExact
  exact of_decide_eq_true hExact.1

theorem well_formed_implies_no_extra_sidecars
    {replayAccepted : ReplayAccepted}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {packet : GroundedClosure}
    (hValid : packet.wellFormed replayAccepted issuedAtFromCanonicalBody = true)
    {sidecar : GroundingSidecar}
    (hSidecar : sidecar ∈ packet.sidecars) :
    ∃ certificate ∈ packet.semantic.certificates,
      certificate.derivation = .contract sidecar.receipt.body.claim.key ∧
      sidecar.matchesCertificate certificate = true := by
  simp only [wellFormed, Bool.and_eq_true] at hValid
  have hExact := hValid.2.1
  simp only [exactLeafSidecars, Bool.and_eq_true] at hExact
  have hSidecarCheck := (List.all_eq_true.mp hExact.2.2) sidecar hSidecar
  simp only [List.any_eq_true] at hSidecarCheck
  rcases hSidecarCheck with ⟨certificate, hCertificate, hMatches⟩
  exact ⟨certificate, hCertificate,
    GroundingSidecar.matches_certificate_implies_contract_derivation hMatches,
    hMatches⟩

theorem well_formed_every_contract_certificate_has_verified_sidecar
    {replayAccepted : ReplayAccepted}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {packet : GroundedClosure}
    (hValid : packet.wellFormed replayAccepted issuedAtFromCanonicalBody = true)
    {certificate : CertificateNode}
    (hCertificate : certificate ∈ packet.semantic.certificates)
    {contractClaim : ClaimKey}
    (hContract : certificate.derivation = .contract contractClaim) :
    ∃ sidecar ∈ packet.sidecars,
      sidecar.matchesCertificate certificate = true ∧
      replayAccepted sidecar = true := by
  simp only [wellFormed, Bool.and_eq_true] at hValid
  have hExact := hValid.2.1
  simp only [exactLeafSidecars, Bool.and_eq_true] at hExact
  have hCertificateCheck :=
    (List.all_eq_true.mp hExact.2.1) certificate hCertificate
  rw [hContract] at hCertificateCheck
  simp only [hasMatchingSidecar, List.any_eq_true] at hCertificateCheck
  rcases hCertificateCheck with ⟨sidecar, hSidecar, hMatches⟩
  exact ⟨sidecar, hSidecar, hMatches,
    (List.all_eq_true.mp hValid.2.2.1) sidecar hSidecar⟩

theorem well_formed_every_reachable_contract_leaf_is_grounded
    {replayAccepted : ReplayAccepted}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {packet : GroundedClosure}
    (hValid : packet.wellFormed replayAccepted issuedAtFromCanonicalBody = true)
    {certificate : CertificateNode}
    (hCertificate : certificate ∈ packet.semantic.certificates)
    {contractClaim : ClaimKey}
    (hContract : certificate.derivation = .contract contractClaim) :
    Closure.Reachable packet.semantic certificate.certificateId ∧
    ∃ sidecar ∈ packet.sidecars,
      sidecar.matchesCertificate certificate = true ∧
      replayAccepted sidecar = true := by
  have hSemantic := well_formed_implies_semantic_well_formed hValid
  exact ⟨Closure.well_formed_implies_every_certificate_reachable
      hSemantic hCertificate,
    well_formed_every_contract_certificate_has_verified_sidecar
      hValid hCertificate hContract⟩

theorem well_formed_implies_no_composition_sidecar
    {replayAccepted : ReplayAccepted}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {packet : GroundedClosure}
    (hValid : packet.wellFormed replayAccepted issuedAtFromCanonicalBody = true)
    {certificate : CertificateNode}
    (hCertificate : certificate ∈ packet.semantic.certificates)
    {rule : RuleDescriptor}
    {premises : List PremiseSnapshot}
    (hComposition : certificate.derivation = .composition rule premises) :
    packet.hasSidecarId certificate.certificateId = false := by
  simp only [wellFormed, Bool.and_eq_true] at hValid
  have hExact := hValid.2.1
  simp only [exactLeafSidecars, Bool.and_eq_true] at hExact
  have hCertificateCheck :=
    (List.all_eq_true.mp hExact.2.1) certificate hCertificate
  rw [hComposition] at hCertificateCheck
  simpa using hCertificateCheck

private theorem chronology_eq_of_same_certificate_id
    {entries : List CertificateChronology}
    (hNodup : (entries.map CertificateChronology.certificateId).Nodup)
    {left right : CertificateChronology}
    (hLeft : left ∈ entries)
    (hRight : right ∈ entries)
    (hId : left.certificateId = right.certificateId) :
    left = right := by
  induction entries with
  | nil => simp at hLeft
  | cons head tail inductionHypothesis =>
      simp only [List.map_cons, List.nodup_cons] at hNodup
      simp only [List.mem_cons] at hLeft hRight
      rcases hLeft with hLeft | hLeft
      · subst left
        rcases hRight with hRight | hRight
        · simpa using hRight.symm
        · exfalso
          apply hNodup.1
          rw [hId]
          exact List.mem_map_of_mem hRight
      · rcases hRight with hRight | hRight
        · subst right
          exfalso
          apply hNodup.1
          rw [← hId]
          exact List.mem_map_of_mem hLeft
        · exact inductionHypothesis hNodup.2 hLeft hRight

theorem well_formed_certificate_has_issued_at
    {replayAccepted : ReplayAccepted}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {packet : GroundedClosure}
    (hValid : packet.wellFormed replayAccepted issuedAtFromCanonicalBody = true)
    {certificate : CertificateNode}
    (hCertificate : certificate ∈ packet.semantic.certificates) :
    ∃ issuedAt,
      packet.issuedAt? certificate.certificateId = some issuedAt := by
  simp only [wellFormed, Bool.and_eq_true] at hValid
  have hExactChronology := hValid.2.2.2.1
  simp only [exactCertificateChronology, Bool.and_eq_true] at hExactChronology
  have hCertificateCheck :=
    (List.all_eq_true.mp hExactChronology.2.1) certificate hCertificate
  simp only [List.any_eq_true] at hCertificateCheck
  rcases hCertificateCheck with ⟨chronology, hChronology, hMatches⟩
  have hMatchFacts := of_decide_eq_true hMatches
  have hFindIsSome :
      (packet.chronology.find? (fun candidate =>
        candidate.certificateId = certificate.certificateId)).isSome := by
    rw [List.find?_isSome]
    exact ⟨chronology, hChronology, by simp [hMatchFacts.1]⟩
  cases hFind : packet.chronology.find? (fun candidate =>
      candidate.certificateId = certificate.certificateId) with
  | none =>
      simp [hFind] at hFindIsSome
  | some chronology =>
      exact ⟨chronology.issuedAt, by simp [issuedAt?, hFind]⟩

theorem well_formed_certificate_issued_at_matches_canonical_body
    {replayAccepted : ReplayAccepted}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {packet : GroundedClosure}
    (hValid : packet.wellFormed replayAccepted issuedAtFromCanonicalBody = true)
    {certificate : CertificateNode}
    (hCertificate : certificate ∈ packet.semantic.certificates) :
    ∃ issuedAt,
      packet.issuedAt? certificate.certificateId = some issuedAt ∧
      issuedAtFromCanonicalBody certificate.canonicalBodyWitness = some issuedAt := by
  simp only [wellFormed, Bool.and_eq_true] at hValid
  have hExactChronology := hValid.2.2.2.1
  simp only [exactCertificateChronology, Bool.and_eq_true] at hExactChronology
  have hNodup := of_decide_eq_true hExactChronology.1
  have hCertificateCheck :=
    (List.all_eq_true.mp hExactChronology.2.1) certificate hCertificate
  simp only [List.any_eq_true] at hCertificateCheck
  rcases hCertificateCheck with
    ⟨matched, hMatched, hMatches⟩
  have hMatchFacts := of_decide_eq_true hMatches
  cases hFind : packet.chronology.find? (fun candidate =>
      candidate.certificateId = certificate.certificateId) with
  | none =>
      have hFindIsSome :
          (packet.chronology.find? (fun candidate =>
            candidate.certificateId = certificate.certificateId)).isSome := by
        rw [List.find?_isSome]
        exact ⟨matched, hMatched, by simp [hMatchFacts.1]⟩
      simp [hFind] at hFindIsSome
  | some found =>
      have hFound := List.mem_of_find?_eq_some hFind
      have hFoundId : found.certificateId = certificate.certificateId := by
        have hFoundPredicate := List.find?_some
          (p := fun (candidate : CertificateChronology) =>
            decide (candidate.certificateId = certificate.certificateId)) hFind
        exact of_decide_eq_true hFoundPredicate
      have hSame : found = matched :=
        chronology_eq_of_same_certificate_id hNodup hFound hMatched
          (hFoundId.trans hMatchFacts.1.symm)
      subst found
      exact ⟨matched.issuedAt, by simp [issuedAt?, hFind], hMatchFacts.2.2⟩

theorem well_formed_implies_direct_premise_chronology_monotone
    {replayAccepted : ReplayAccepted}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {packet : GroundedClosure}
    (hValid : packet.wellFormed replayAccepted issuedAtFromCanonicalBody = true)
    {parent : CertificateNode}
    (hParent : parent ∈ packet.semantic.certificates)
    {premise : PremiseSnapshot}
    (hPremise : premise ∈ parent.premises) :
    ∃ parentIssuedAt premiseIssuedAt,
      packet.issuedAt? parent.certificateId = some parentIssuedAt ∧
      packet.issuedAt? premise.certificateId = some premiseIssuedAt ∧
      premiseIssuedAt ≤ parentIssuedAt := by
  simp only [wellFormed, Bool.and_eq_true] at hValid
  have hMonotone := hValid.2.2.2.2
  unfold directPremiseChronologyMonotone at hMonotone
  have hParentCheck :=
    (List.all_eq_true.mp hMonotone) parent hParent
  have hPremiseCheck :=
    (List.all_eq_true.mp hParentCheck) premise hPremise
  cases hParentTime : packet.issuedAt? parent.certificateId with
  | none =>
      simp [hParentTime] at hPremiseCheck
  | some parentIssuedAt =>
      cases hPremiseTime : packet.issuedAt? premise.certificateId with
      | none =>
          simp [hParentTime, hPremiseTime] at hPremiseCheck
      | some premiseIssuedAt =>
          rw [hParentTime, hPremiseTime] at hPremiseCheck
          exact ⟨parentIssuedAt, premiseIssuedAt,
            rfl, rfl, of_decide_eq_true hPremiseCheck⟩

/-! Transitive dependency reachability from an arbitrary certificate, not only
from the closure root. -/
inductive DependencyPath (closure : Closure) : CertificateId → CertificateId → Prop where
  | refl
      {certificate : CertificateNode}
      (certificatePresent : certificate ∈ closure.certificates) :
      DependencyPath closure certificate.certificateId certificate.certificateId
  | premise
      {parent : CertificateNode}
      {premise : PremiseSnapshot}
      {descendant : CertificateId}
      (parentPresent : parent ∈ closure.certificates)
      (premisePresent : premise ∈ parent.premises)
      (tail : DependencyPath closure premise.certificateId descendant) :
      DependencyPath closure parent.certificateId descendant

theorem dependency_path_chronology_monotone
    {replayAccepted : ReplayAccepted}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {packet : GroundedClosure}
    (hValid : packet.wellFormed replayAccepted issuedAtFromCanonicalBody = true)
    {ancestor descendant : CertificateId}
    (path : DependencyPath packet.semantic ancestor descendant)
    {ancestorIssuedAt descendantIssuedAt : Nat}
    (hAncestorTime : packet.issuedAt? ancestor = some ancestorIssuedAt)
    (hDescendantTime : packet.issuedAt? descendant = some descendantIssuedAt) :
    descendantIssuedAt ≤ ancestorIssuedAt := by
  induction path generalizing ancestorIssuedAt descendantIssuedAt with
  | refl _ =>
      rw [hAncestorTime] at hDescendantTime
      cases hDescendantTime
      exact Nat.le_refl _
  | premise parentPresent premisePresent tail inductionHypothesis =>
      rcases well_formed_implies_direct_premise_chronology_monotone
          hValid parentPresent premisePresent with
        ⟨parentIssuedAt, premiseIssuedAt,
          hParentTime, hPremiseTime, hDirect⟩
      rw [hParentTime] at hAncestorTime
      cases hAncestorTime
      exact Nat.le_trans
        (inductionHypothesis hPremiseTime hDescendantTime)
        hDirect

theorem well_formed_composite_does_not_predate_reachable_contract_leaf
    {replayAccepted : ReplayAccepted}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {packet : GroundedClosure}
    (hValid : packet.wellFormed replayAccepted issuedAtFromCanonicalBody = true)
    {composite leaf : CertificateNode}
    {rule : RuleDescriptor}
    {premises : List PremiseSnapshot}
    (_hComposite : composite.derivation = .composition rule premises)
    {contractClaim : ClaimKey}
    (_hLeaf : leaf.derivation = .contract contractClaim)
    (path : DependencyPath
      packet.semantic composite.certificateId leaf.certificateId)
    {compositeIssuedAt leafIssuedAt : Nat}
    (hCompositeTime :
      packet.issuedAt? composite.certificateId = some compositeIssuedAt)
    (hLeafTime : packet.issuedAt? leaf.certificateId = some leafIssuedAt) :
    leafIssuedAt ≤ compositeIssuedAt :=
  dependency_path_chronology_monotone
    hValid path hCompositeTime hLeafTime

theorem well_formed_composite_has_no_backdated_reachable_contract_leaf
    {replayAccepted : ReplayAccepted}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {packet : GroundedClosure}
    (hValid : packet.wellFormed replayAccepted issuedAtFromCanonicalBody = true)
    {composite leaf : CertificateNode}
    (hCompositePresent : composite ∈ packet.semantic.certificates)
    (hLeafPresent : leaf ∈ packet.semantic.certificates)
    {rule : RuleDescriptor}
    {premises : List PremiseSnapshot}
    (hComposite : composite.derivation = .composition rule premises)
    {contractClaim : ClaimKey}
    (hLeaf : leaf.derivation = .contract contractClaim)
    (path : DependencyPath
      packet.semantic composite.certificateId leaf.certificateId) :
    ∃ compositeIssuedAt leafIssuedAt,
      packet.issuedAt? composite.certificateId = some compositeIssuedAt ∧
      packet.issuedAt? leaf.certificateId = some leafIssuedAt ∧
      leafIssuedAt ≤ compositeIssuedAt := by
  rcases well_formed_certificate_has_issued_at
      hValid hCompositePresent with ⟨compositeIssuedAt, hCompositeTime⟩
  rcases well_formed_certificate_has_issued_at
      hValid hLeafPresent with ⟨leafIssuedAt, hLeafTime⟩
  exact ⟨compositeIssuedAt, leafIssuedAt, hCompositeTime, hLeafTime,
    well_formed_composite_does_not_predate_reachable_contract_leaf
      hValid hComposite hLeaf path hCompositeTime hLeafTime⟩

end GroundedClosure

/-! Stable merge deduplicates one shared grounded leaf and rejects unequal
sidecars that claim the same certificate identifier. -/
def mergeGroundingSidecars? :
    List GroundingSidecar →
    List GroundingSidecar →
    Option (List GroundingSidecar)
  | accumulated, [] => some accumulated
  | accumulated, sidecar :: remaining =>
      match accumulated.find? (fun existing =>
          existing.certificateId = sidecar.certificateId) with
      | none => mergeGroundingSidecars? (accumulated ++ [sidecar]) remaining
      | some existing =>
          if existing = sidecar then
            mergeGroundingSidecars? accumulated remaining
          else
            none

def mergeValidatedGroundedSidecars?
    (replayAccepted : ReplayAccepted)
    (issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody) :
    List GroundingSidecar →
    List (GroundedClosure.Validated
      replayAccepted issuedAtFromCanonicalBody) →
    Option (List GroundingSidecar)
  | accumulated, [] => some accumulated
  | accumulated, packet :: remaining => do
      let merged ← mergeGroundingSidecars? accumulated packet.raw.sidecars
      mergeValidatedGroundedSidecars?
        replayAccepted issuedAtFromCanonicalBody merged remaining

def mergeCertificateChronology? :
    List CertificateChronology →
    List CertificateChronology →
    Option (List CertificateChronology)
  | accumulated, [] => some accumulated
  | accumulated, chronology :: remaining =>
      match accumulated.find? (fun existing =>
          existing.certificateId = chronology.certificateId) with
      | none =>
          mergeCertificateChronology? (accumulated ++ [chronology]) remaining
      | some existing =>
          if existing = chronology then
            mergeCertificateChronology? accumulated remaining
          else
            none

def mergeValidatedCertificateChronology?
    (replayAccepted : ReplayAccepted)
    (issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody) :
    List CertificateChronology →
    List (GroundedClosure.Validated
      replayAccepted issuedAtFromCanonicalBody) →
    Option (List CertificateChronology)
  | accumulated, [] => some accumulated
  | accumulated, packet :: remaining => do
      let merged ←
        mergeCertificateChronology? accumulated packet.raw.chronology
      mergeValidatedCertificateChronology?
        replayAccepted issuedAtFromCanonicalBody merged remaining

def composeGroundedChecked?
    (replayAccepted : ReplayAccepted)
    (issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody)
    (newRoot : CertificateNode)
    (newRootIssuedAt : Nat)
    (inputs : List (GroundedClosure.Validated
      replayAccepted issuedAtFromCanonicalBody)) :
    Option (GroundedClosure.Validated
      replayAccepted issuedAtFromCanonicalBody) := do
  let semanticInputs : List Closure.Validated :=
    inputs.map (fun input => {
      raw := input.raw.semantic
      valid := GroundedClosure.well_formed_implies_semantic_well_formed input.valid
    })
  let semanticOutput ← SemanticClosure.composeChecked? newRoot semanticInputs
  let sidecars ← mergeValidatedGroundedSidecars?
    replayAccepted issuedAtFromCanonicalBody [] inputs
  let chronology ←
    mergeValidatedCertificateChronology?
      replayAccepted issuedAtFromCanonicalBody [] inputs
  GroundedClosure.validate replayAccepted issuedAtFromCanonicalBody {
    semantic := semanticOutput.raw
    sidecars := sidecars
    chronology := chronology ++ [{
      certificateId := newRoot.certificateId
      canonicalBodyWitness := newRoot.canonicalBodyWitness
      issuedAt := newRootIssuedAt
    }]
  }

theorem compose_grounded_some_is_well_formed
    {replayAccepted : ReplayAccepted}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {newRoot : CertificateNode}
    {newRootIssuedAt : Nat}
    {inputs : List (GroundedClosure.Validated
      replayAccepted issuedAtFromCanonicalBody)}
    {output : GroundedClosure.Validated
      replayAccepted issuedAtFromCanonicalBody}
    (_hResult : composeGroundedChecked?
      replayAccepted issuedAtFromCanonicalBody
      newRoot newRootIssuedAt inputs = some output) :
    output.raw.wellFormed replayAccepted issuedAtFromCanonicalBody = true :=
  output.valid

theorem compose_grounded_some_preserves_grounded_reachable_leaves
    {replayAccepted : ReplayAccepted}
    {issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody}
    {newRoot : CertificateNode}
    {newRootIssuedAt : Nat}
    {inputs : List (GroundedClosure.Validated
      replayAccepted issuedAtFromCanonicalBody)}
    {output : GroundedClosure.Validated
      replayAccepted issuedAtFromCanonicalBody}
    (_hResult : composeGroundedChecked?
      replayAccepted issuedAtFromCanonicalBody
      newRoot newRootIssuedAt inputs = some output)
    {certificate : CertificateNode}
    (hCertificate : certificate ∈ output.raw.semantic.certificates)
    {contractClaim : ClaimKey}
    (hContract : certificate.derivation = .contract contractClaim) :
    Closure.Reachable output.raw.semantic certificate.certificateId ∧
    ∃ sidecar ∈ output.raw.sidecars,
      sidecar.matchesCertificate certificate = true ∧
      replayAccepted sidecar = true :=
  GroundedClosure.well_formed_every_reachable_contract_leaf_is_grounded
    output.valid hCertificate hContract

/-! Finite executable examples exercise issuance, replay, exact leaf sidecars,
shared-descendant composition, and fail-closed capture/packet behavior. -/
namespace Examples

def scope : Scope where
  repository := "riddledc/integrations"
  revision := "grounded-evidence-example"
  environment := "local"
  target := "signed-browser-capture"
  proofAttempt := "grounded-example"

def sensor : SensorDescriptor where
  sensorId := "riddle-browser-controller"
  sensorVersion := "v1"

def verifierDescriptor : VerifierDescriptor where
  verifierId := "verifier.browser-button"
  verifierVersion := "v1"
  implementationDigest := "sha256:verifier-implementation"
  trustBasis := .externalRegistry

def domBytes : ArtifactBytes := [1, 2, 3]
def networkBytes : ArtifactBytes := [4, 5]

def digestBytes (bytes : ArtifactBytes) : String :=
  if bytes = domBytes then "sha256:dom"
  else if bytes = networkBytes then "sha256:network"
  else "sha256:unknown"

def domDescriptor : ArtifactDescriptor where
  artifactId := "a-dom"
  role := "dom"
  mediaType := "application/json"
  byteLength := domBytes.length
  digest := digestBytes domBytes

def networkDescriptor : ArtifactDescriptor where
  artifactId := "b-network"
  role := "network"
  mediaType := "application/json"
  byteLength := networkBytes.length
  digest := digestBytes networkBytes

def statement : CaptureStatement where
  statementVersion := groundedCaptureStatementVersion
  scope := scope
  challengeNonce := "nonce-32-byte-canonical-value"
  challengeNonceByteLength := 32
  capturedAt := 995
  sensor := sensor
  verifier := verifierDescriptor
  artifacts := [domDescriptor, networkDescriptor]

def verifySignature
    (signer : String)
    (signedStatement : CaptureStatement)
    (signature : String) : Bool :=
  decide (
    signer = "ed25519:trusted-capture-key" ∧
    signedStatement = statement ∧
    signature = "signature:grounded-example")

def capture : SignedCapture where
  statement := statement
  signerFingerprint := "ed25519:trusted-capture-key"
  signature := "signature:grounded-example"
  artifacts := [
    { descriptor := domDescriptor, bytes := domBytes },
    { descriptor := networkDescriptor, bytes := networkBytes }
  ]

def policy : VerificationPolicy where
  expectedScope := scope
  expectedNonce := statement.challengeNonce
  now := 1000
  maxAge := 30
  maxFutureSkew := 5
  allowedSignerFingerprints := [capture.signerFingerprint]
  allowedSensors := [sensor]
  expectedVerifier := verifierDescriptor
  requiredArtifactRoles := ["dom", "network"]

theorem valid_signed_capture_passes :
    captureWellFormed digestBytes verifySignature policy capture = true := by
  native_decide

def wrongVersionCapture : SignedCapture :=
  { capture with
    statement := {
      capture.statement with
      statementVersion := "riddle-proof.grounded-capture-statement.v999"
    } }

theorem unsupported_capture_statement_version_is_rejected :
    captureWellFormed digestBytes verifySignature policy wrongVersionCapture = false := by
  native_decide

def changedBytesCapture : SignedCapture :=
  { capture with
    artifacts := [
      { descriptor := domDescriptor, bytes := [9] },
      { descriptor := networkDescriptor, bytes := networkBytes }
    ] }

theorem changed_artifact_bytes_are_rejected :
    captureWellFormed digestBytes verifySignature policy changedBytesCapture = false := by
  native_decide

def wrongNonceCapture : SignedCapture :=
  { capture with
    statement := { capture.statement with challengeNonce := "wrong-nonce" } }

theorem wrong_nonce_is_rejected :
    captureWellFormed digestBytes verifySignature policy wrongNonceCapture = false := by
  native_decide

def staleCapture : SignedCapture :=
  { capture with
    statement := { capture.statement with capturedAt := 900 } }

theorem stale_capture_is_rejected :
    captureWellFormed digestBytes verifySignature policy staleCapture = false := by
  native_decide

def badSignatureCapture : SignedCapture :=
  { capture with signature := "forged-signature" }

theorem bad_signature_is_rejected :
    captureWellFormed digestBytes verifySignature policy badSignatureCapture = false := by
  native_decide

def observation : String := "{\"button_present\":true}"

def verifier : ObservationVerifier where
  descriptor := verifierDescriptor
  derive := fun candidate =>
    if candidate.artifacts.any (fun artifact =>
        artifact.descriptor.role == "dom") then
      some observation
    else
      none

def claimKey (name : String) : ClaimKey where
  claimId := "claim." ++ name
  claimVersion := "v1"
  canonicalParameters := "{}"

def claim (name : String) : ClaimDescriptor where
  key := claimKey name
  label := name

def contract : GroundingContract where
  contractId := "contract.button-present"
  contractVersion := "v1"
  implementationDigest := "sha256:contract-button-present"
  trustBasis := .externalRegistry
  label := "Button present contract"
  claim := claim "button-present"
  accepts := fun _ candidate => decide (candidate = observation)
  meaning := fun _ candidate => candidate = observation
  establishes := by
    intro _ candidate hAccepted
    exact of_decide_eq_true hAccepted

def addressing : ContentAddressing where
  statementDigest := fun candidate =>
    "sha256:statement:" ++ candidate.challengeNonce
  observationDigest := fun candidate =>
    if candidate = observation then "sha256:observation" else "sha256:other"
  identifyReceipt := fun body => {
    receiptId := "rpgr_" ++ body.captureStatementDigest
    receiptDigest := "sha256:receipt:" ++ body.observationDigest
    canonicalBodyWitness := "receipt-body:" ++ body.contractId
  }

def issuanceSucceeded : Bool :=
  match issueGroundedChecked?
      digestBytes verifySignature addressing policy verifier contract.ref contract
      "certificate-grounded" "certificate-body-grounded" capture with
  | some _ => true
  | none => false

theorem grounded_issuance_succeeds : issuanceSucceeded = true := by
  native_decide

def untrustedVerifier : ObservationVerifier where
  descriptor := {
    verifierId := verifierDescriptor.verifierId
    verifierVersion := verifierDescriptor.verifierVersion
    implementationDigest := "sha256:different-implementation"
    trustBasis := .externalRegistry
  }
  derive := verifier.derive

def untrustedVerifierIssuanceSucceeded : Bool :=
  match issueGroundedChecked?
      digestBytes verifySignature addressing policy untrustedVerifier contract.ref contract
      "certificate-untrusted-verifier" "body-untrusted-verifier" capture with
  | some _ => true
  | none => false

theorem untrusted_verifier_implementation_is_rejected_before_issuance :
    untrustedVerifierIssuanceSucceeded = false := by
  native_decide

def rejectingContract : GroundingContract where
  contractId := "contract.reject-all"
  contractVersion := "v1"
  implementationDigest := "sha256:contract-reject-all"
  trustBasis := .externalRegistry
  label := "Reject all contract"
  claim := claim "rejected"
  accepts := fun _ _ => false
  meaning := fun _ _ => False
  establishes := by simp

def rejectedContractIssuanceSucceeded : Bool :=
  match issueGroundedChecked?
      digestBytes verifySignature addressing policy verifier rejectingContract.ref rejectingContract
      "certificate-rejected" "body-rejected" capture with
  | some _ => true
  | none => false

theorem contract_rejection_blocks_grounded_issuance :
    rejectedContractIssuanceSucceeded = false := by
  native_decide

def receipt : VerificationReceipt :=
  makeVerificationReceipt addressing capture verifier contract observation

def atomicCertificate : CertificateNode :=
  certificateFromVerificationReceipt
    "certificate-grounded" "certificate-body-grounded" receipt

def sidecar : GroundingSidecar where
  certificateId := atomicCertificate.certificateId
  capture := capture
  receipt := receipt

def replayAccepted (candidate : GroundingSidecar) : Bool :=
  replayVerificationReceipt
    digestBytes verifySignature addressing policy verifier contract.ref contract candidate

def issuedAtFromCanonicalBody : IssuedAtFromCanonicalBody
  | "certificate-body-grounded" => some 1000
  | "body-left" => some 1001
  | "body-right" => some 1001
  | "body-root" => some 1002
  | "body-root-backdated" => some 999
  | _ => none

theorem issued_sidecar_replays : replayAccepted sidecar = true := by
  native_decide

def chronologyOf
    (certificate : CertificateNode)
    (issuedAt : Nat) : CertificateChronology where
  certificateId := certificate.certificateId
  canonicalBodyWitness := certificate.canonicalBodyWitness
  issuedAt := issuedAt

def atomicChronology : CertificateChronology :=
  chronologyOf atomicCertificate 1000

def atomicClosure : GroundedClosure where
  semantic := {
    rootId := atomicCertificate.certificateId
    certificates := [atomicCertificate]
  }
  sidecars := [sidecar]
  chronology := [atomicChronology]

theorem grounded_atomic_closure_is_valid :
    atomicClosure.wellFormed replayAccepted issuedAtFromCanonicalBody = true := by
  native_decide

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

def leftNode : CertificateNode :=
  unaryNode "certificate-left" "left" atomicCertificate

def rightNode : CertificateNode :=
  unaryNode "certificate-right" "right" atomicCertificate

def rootNode : CertificateNode where
  certificateId := "certificate-root"
  canonicalBodyWitness := "body-root"
  scope := scope
  claim := claim "root"
  evidence := leftNode.evidence.append rightNode.evidence
  derivation := .composition {
    ruleId := "rule.root"
    ruleVersion := "v1"
    premiseClaims := [leftNode.claim.key, rightNode.claim.key]
    conclusion := claimKey "root"
  } [leftNode.summary, rightNode.summary]

def leftClosure : GroundedClosure where
  semantic := {
    rootId := leftNode.certificateId
    certificates := [atomicCertificate, leftNode]
  }
  sidecars := [sidecar]
  chronology := [atomicChronology, chronologyOf leftNode 1001]

def rightClosure : GroundedClosure where
  semantic := {
    rootId := rightNode.certificateId
    certificates := [atomicCertificate, rightNode]
  }
  sidecars := [sidecar]
  chronology := [atomicChronology, chronologyOf rightNode 1001]

theorem left_grounded_closure_is_valid :
    leftClosure.wellFormed replayAccepted issuedAtFromCanonicalBody = true := by
  native_decide

theorem right_grounded_closure_is_valid :
    rightClosure.wellFormed replayAccepted issuedAtFromCanonicalBody = true := by
  native_decide

def validatedLeft : GroundedClosure.Validated
    replayAccepted issuedAtFromCanonicalBody :=
  ⟨leftClosure, left_grounded_closure_is_valid⟩

def validatedRight : GroundedClosure.Validated
    replayAccepted issuedAtFromCanonicalBody :=
  ⟨rightClosure, right_grounded_closure_is_valid⟩

def sharedLeafCompositionSucceeded : Bool :=
  match composeGroundedChecked?
      replayAccepted issuedAtFromCanonicalBody
      rootNode 1002 [validatedLeft, validatedRight] with
  | some _ => true
  | none => false

def sharedLeafCompositionSidecarIds : List CertificateId :=
  match composeGroundedChecked?
      replayAccepted issuedAtFromCanonicalBody
      rootNode 1002 [validatedLeft, validatedRight] with
  | some output => output.raw.sidecarCertificateIds
  | none => []

theorem shared_grounded_leaf_composes :
    sharedLeafCompositionSucceeded = true := by
  native_decide

theorem shared_grounded_leaf_sidecar_is_deduplicated :
    sharedLeafCompositionSidecarIds = [atomicCertificate.certificateId] := by
  native_decide

def missingSidecar : GroundedClosure where
  semantic := leftClosure.semantic
  sidecars := []
  chronology := leftClosure.chronology

theorem missing_grounded_leaf_sidecar_is_rejected :
    missingSidecar.wellFormed replayAccepted issuedAtFromCanonicalBody = false := by
  native_decide

def compositeSidecar : GroundingSidecar :=
  { sidecar with certificateId := leftNode.certificateId }

def extraCompositeSidecar : GroundedClosure where
  semantic := leftClosure.semantic
  sidecars := [sidecar, compositeSidecar]
  chronology := leftClosure.chronology

theorem sidecar_for_composition_node_is_rejected :
    extraCompositeSidecar.wellFormed
      replayAccepted issuedAtFromCanonicalBody = false := by
  native_decide

def alteredReceipt : VerificationReceipt :=
  { receipt with
    body := { receipt.body with observation := "{\"button_present\":false}" } }

def alteredReceiptSidecar : GroundingSidecar :=
  { sidecar with receipt := alteredReceipt }

def alteredReceiptPacket : GroundedClosure where
  semantic := atomicClosure.semantic
  sidecars := [alteredReceiptSidecar]
  chronology := atomicClosure.chronology

theorem altered_receipt_is_rejected :
    alteredReceiptPacket.wellFormed
      replayAccepted issuedAtFromCanonicalBody = false := by
  native_decide

/-! A chronology entry cannot attach a fabricated time to an unchanged
canonical body witness: the trusted projection must recover that exact time. -/
def manuallyContentAddressedBackdatedComposite : GroundedClosure where
  semantic := leftClosure.semantic
  sidecars := leftClosure.sidecars
  chronology := [atomicChronology, chronologyOf leftNode 999]

theorem manually_content_addressed_backdated_composite_is_rejected :
    manuallyContentAddressedBackdatedComposite.wellFormed
      replayAccepted issuedAtFromCanonicalBody = false := by
  native_decide

/-! This body genuinely projects to time 999. It is still rejected because its
direct composition premises project to time 1001, independently exercising the
chronology monotonicity gate after parser fidelity succeeds. -/
def backdatedRootNode : CertificateNode :=
  { rootNode with
    certificateId := "certificate-root-backdated"
    canonicalBodyWitness := "body-root-backdated" }

def backdatedRootCompositionSucceeded : Bool :=
  match composeGroundedChecked?
      replayAccepted issuedAtFromCanonicalBody
      backdatedRootNode 999 [validatedLeft, validatedRight] with
  | some _ => true
  | none => false

theorem final_validation_rejects_backdated_composition :
    backdatedRootCompositionSucceeded = false := by
  native_decide

theorem replay_rejection_blocks_otherwise_linked_packet :
    atomicClosure.wellFormed
      (fun _ => false) issuedAtFromCanonicalBody = false := by
  native_decide

end Examples

end RiddleProofKernel.GroundedEvidence
