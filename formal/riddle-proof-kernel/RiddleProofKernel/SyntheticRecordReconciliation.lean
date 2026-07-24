import RiddleProofKernel.MeaningKernel

namespace RiddleProofKernel.SyntheticRecordReconciliation

open SemanticComposition SemanticClosure MeaningKernel

/-!
A deliberately narrow, public-synthetic specialization of the checked-meaning
kernel for cross-source commercial-record reconciliation.

The example has five grounded meanings:

* `A`: arithmetic in one captured invoice was recomputed exactly;
* `P`: arithmetic in one captured purchase order was recomputed exactly;
* `R`: one receipt's normalized identity and quantity fields were captured;
* `M`: one posted payment record and its normalized fields were captured;
* `U`: one separately identified target occurs exactly once in the exact
  supplied invoice register.

They form this content-addressed meaning pyramid:

```
A + P -> I
A + R -> J
I + J -> T
A + M -> S
A + U -> Q
Q + S -> QS
QS + T -> D
```

The same `A` branch feeds `T`, `S`, and `Q`.  A payment-only change can therefore
reuse the exact three-source and invoice-identity branches and requires only a
replacement `M` branch and recomposed ancestors.  The runtime experiment uses
an N-ary final rule; this v0 Lean kernel is binary, so `QS` is the explicit
binary association of its identity and payment premises.

The semantics are intentionally not an accounting standard.  The
cross-record pyramid models one single-line projection under an explicitly
pinned synthetic policy.  A separate arithmetic slice below covers arbitrary
finite lists of priced lines in integer minor currency units, including the
workbench's two-line fixture.  Neither slice covers partial payments, split
receipts, tolerances, credits, duplicate detection outside the exact supplied
register, foreign exchange, tax correctness, authorization, fraud, legal
validity, delivery, or bank settlement.

This module also starts after runtime grounding.  Runtime code remains
responsible for source parsing, canonical JSON, the correspondence between
captured bytes and the typed records below, hashes, signatures, clocks,
currentness, source authenticity, and independent policy selection.  Lean
proves only the arithmetic, field relationships, scoped composition, and
meaning retained by the checked root from supplied grounded meanings.
-/

inductive RecordKind where
  | invoice
  | purchaseOrder
  | receiving
  | payment
  | invoiceRegister
  deriving DecidableEq, Repr, BEq

structure RecordRef where
  kind : RecordKind
  sourceSystem : String
  recordId : String
  artifactDigest : String
  deriving DecidableEq, Repr, BEq

structure PolicyRef where
  policyId : String
  policyVersion : String
  policyDigest : String
  deriving DecidableEq, Repr, BEq

/-!
Amounts use integer minor units.  `PricedLine` and
`MultiLineArithmeticRecomputed` model the workbench's arithmetic shape for any
finite nonempty list: every stated line extension is recomputed, the stated
subtotal is the sum of those extensions, and the stated total is subtotal plus
stated tax.  Natural numbers avoid rounding and overflow inside Lean; runtime
safe-integer bounds and the 1,000-line resource limit remain parser
obligations.

The later `Invoice` and `PurchaseOrder` structures retain the older
single-line cross-record projection.  The generic theorem below closes the
multi-line arithmetic invariant without pretending that Lean parsed runtime
JSON or proved the line-order and identity correspondence.
-/
structure PricedLine where
  lineId : String
  itemId : String
  quantity : Nat
  unitPriceMinor : Nat
  extendedMinor : Nat
  deriving DecidableEq, Repr, BEq

def EveryLineExtensionExact (lines : List PricedLine) : Prop :=
  ∀ line ∈ lines,
    line.extendedMinor = line.quantity * line.unitPriceMinor

def statedExtensionSubtotal (lines : List PricedLine) : Nat :=
  (lines.map (fun line => line.extendedMinor)).sum

def recomputedExtensionSubtotal (lines : List PricedLine) : Nat :=
  (lines.map (fun line => line.quantity * line.unitPriceMinor)).sum

def MultiLineArithmeticRecomputed
    (lines : List PricedLine)
    (subtotalMinor taxMinor totalMinor : Nat) : Prop :=
  lines ≠ [] ∧
    EveryLineExtensionExact lines ∧
    subtotalMinor = statedExtensionSubtotal lines ∧
    totalMinor = subtotalMinor + taxMinor

theorem exact_line_extensions_have_exact_recomputed_sum
    (lines : List PricedLine)
    (hExact : EveryLineExtensionExact lines) :
    statedExtensionSubtotal lines = recomputedExtensionSubtotal lines := by
  induction lines with
  | nil =>
      rfl
  | cons head tail inductionHypothesis =>
      have hHead :
          head.extendedMinor = head.quantity * head.unitPriceMinor :=
        hExact head (by simp)
      have hTail : EveryLineExtensionExact tail := by
        intro line hMember
        exact hExact line (by simp [hMember])
      have hTailSum := inductionHypothesis hTail
      unfold statedExtensionSubtotal recomputedExtensionSubtotal at hTailSum
      simp only [statedExtensionSubtotal, recomputedExtensionSubtotal,
        List.map_cons, List.sum_cons]
      rw [hHead, hTailSum]

theorem multi_line_arithmetic_implies_exact_total_from_terms
    (lines : List PricedLine)
    (subtotalMinor taxMinor totalMinor : Nat)
    (hArithmetic :
      MultiLineArithmeticRecomputed
        lines subtotalMinor taxMinor totalMinor) :
    totalMinor = recomputedExtensionSubtotal lines + taxMinor := by
  rcases hArithmetic with
    ⟨_hNonempty, hExtensions, hSubtotal, hTotal⟩
  calc
    totalMinor = subtotalMinor + taxMinor := hTotal
    _ = statedExtensionSubtotal lines + taxMinor := by rw [hSubtotal]
    _ = recomputedExtensionSubtotal lines + taxMinor := by
      rw [exact_line_extensions_have_exact_recomputed_sum lines hExtensions]

structure Invoice where
  ref : RecordRef
  buyerId : String
  vendorId : String
  purchaseOrderId : String
  paymentTerms : String
  itemId : String
  currency : String
  quantity : Nat
  unitPriceMinor : Nat
  lineTermsDigest : String
  quantityDigest : String
  subtotalMinor : Nat
  taxMinor : Nat
  totalMinor : Nat
  deriving DecidableEq, Repr, BEq

structure PurchaseOrder where
  ref : RecordRef
  buyerId : String
  vendorId : String
  paymentTerms : String
  itemId : String
  currency : String
  quantityAuthorized : Nat
  unitPriceMinor : Nat
  lineTermsDigest : String
  quantityDigest : String
  subtotalMinor : Nat
  taxMinor : Nat
  totalMinor : Nat
  deriving DecidableEq, Repr, BEq

structure ReceivingRecord where
  ref : RecordRef
  buyerId : String
  vendorId : String
  purchaseOrderId : String
  itemId : String
  quantityReceived : Nat
  quantityDigest : String
  deriving DecidableEq, Repr, BEq

inductive PaymentStatus where
  | pending
  | posted
  | voided
  deriving DecidableEq, Repr, BEq

structure PaymentRecord where
  ref : RecordRef
  buyerId : String
  invoiceId : String
  vendorId : String
  currency : String
  amountMinor : Nat
  status : PaymentStatus
  reference : String
  deriving DecidableEq, Repr, BEq

structure InvoiceIdentity where
  vendorId : String
  invoiceId : String
  deriving DecidableEq, Repr, BEq

structure InvoiceRegister where
  ref : RecordRef
  buyerId : String
  targetIdentity : InvoiceIdentity
  entries : List InvoiceIdentity
  occurrenceCount : Nat
  deriving DecidableEq, Repr, BEq

structure CapturedRecordSet where
  policy : PolicyRef
  invoice : Invoice
  purchaseOrder : PurchaseOrder
  receiving : ReceivingRecord
  payment : PaymentRecord
  invoiceRegister : InvoiceRegister
  deriving DecidableEq, Repr, BEq

/-!
Exact leaf propositions for the declared synthetic v1 contracts.  No leaf
meaning compares one record with another.
-/
def CapturedRef (expectedKind : RecordKind) (ref : RecordRef) : Prop :=
  ref.kind = expectedKind ∧
    ref.sourceSystem ≠ "" ∧
    ref.recordId ≠ "" ∧
    ref.artifactDigest ≠ ""

def InvoiceArithmeticRecomputed (invoice : Invoice) : Prop :=
  CapturedRef .invoice invoice.ref ∧
    invoice.buyerId ≠ "" ∧
    invoice.vendorId ≠ "" ∧
    invoice.purchaseOrderId ≠ "" ∧
    invoice.paymentTerms ≠ "" ∧
    invoice.itemId ≠ "" ∧
    invoice.currency ≠ "" ∧
    0 < invoice.quantity ∧
    invoice.lineTermsDigest ≠ "" ∧
    invoice.quantityDigest ≠ "" ∧
    invoice.subtotalMinor = invoice.quantity * invoice.unitPriceMinor ∧
    invoice.totalMinor = invoice.subtotalMinor + invoice.taxMinor

def PurchaseOrderArithmeticRecomputed
    (purchaseOrder : PurchaseOrder) : Prop :=
  CapturedRef .purchaseOrder purchaseOrder.ref ∧
    purchaseOrder.buyerId ≠ "" ∧
    purchaseOrder.vendorId ≠ "" ∧
    purchaseOrder.paymentTerms ≠ "" ∧
    purchaseOrder.itemId ≠ "" ∧
    purchaseOrder.currency ≠ "" ∧
    0 < purchaseOrder.quantityAuthorized ∧
    purchaseOrder.lineTermsDigest ≠ "" ∧
    purchaseOrder.quantityDigest ≠ "" ∧
    purchaseOrder.subtotalMinor =
      purchaseOrder.quantityAuthorized * purchaseOrder.unitPriceMinor ∧
    purchaseOrder.totalMinor =
      purchaseOrder.subtotalMinor + purchaseOrder.taxMinor

def ReceiptCapturedNormalized (receiving : ReceivingRecord) : Prop :=
  CapturedRef .receiving receiving.ref ∧
    receiving.buyerId ≠ "" ∧
    receiving.vendorId ≠ "" ∧
    receiving.purchaseOrderId ≠ "" ∧
    receiving.itemId ≠ "" ∧
    0 < receiving.quantityReceived ∧
    receiving.quantityDigest ≠ ""

def PaymentCapturedPosted (payment : PaymentRecord) : Prop :=
  CapturedRef .payment payment.ref ∧
    payment.buyerId ≠ "" ∧
    payment.vendorId ≠ "" ∧
    payment.invoiceId ≠ "" ∧
    payment.currency ≠ "" ∧
    0 < payment.amountMinor ∧
    payment.status = .posted ∧
    payment.reference ≠ ""

def RegisterOccurrenceCounted (register : InvoiceRegister) : Prop :=
  CapturedRef .invoiceRegister register.ref ∧
    register.buyerId ≠ "" ∧
    register.targetIdentity.vendorId ≠ "" ∧
    register.targetIdentity.invoiceId ≠ "" ∧
    register.entries.count register.targetIdentity =
      register.occurrenceCount ∧
    register.occurrenceCount = 1

/-!
Cross-record propositions belong only to derived meanings.  These are the
typed counterpart of the runtime rule's exact parameter equalities.
-/
def InvoicePurchaseOrderFieldsAgree
    (invoice : Invoice)
    (purchaseOrder : PurchaseOrder) : Prop :=
  invoice.buyerId = purchaseOrder.buyerId ∧
    invoice.vendorId = purchaseOrder.vendorId ∧
    invoice.purchaseOrderId = purchaseOrder.ref.recordId ∧
    invoice.paymentTerms = purchaseOrder.paymentTerms ∧
    invoice.itemId = purchaseOrder.itemId ∧
    invoice.currency = purchaseOrder.currency ∧
    invoice.lineTermsDigest = purchaseOrder.lineTermsDigest ∧
    invoice.quantityDigest = purchaseOrder.quantityDigest ∧
    invoice.quantity = purchaseOrder.quantityAuthorized ∧
    invoice.unitPriceMinor = purchaseOrder.unitPriceMinor ∧
    invoice.totalMinor = purchaseOrder.totalMinor

def InvoiceReceiptQuantitiesAgree
    (invoice : Invoice)
    (receiving : ReceivingRecord) : Prop :=
  invoice.buyerId = receiving.buyerId ∧
    invoice.vendorId = receiving.vendorId ∧
    invoice.purchaseOrderId = receiving.purchaseOrderId ∧
    receiving.itemId = invoice.itemId ∧
    invoice.quantity = receiving.quantityReceived ∧
    invoice.quantityDigest = receiving.quantityDigest

def PaymentFieldsMatchInvoice
    (invoice : Invoice)
    (payment : PaymentRecord) : Prop :=
  invoice.buyerId = payment.buyerId ∧
    payment.vendorId = invoice.vendorId ∧
    payment.invoiceId = invoice.ref.recordId ∧
    payment.currency = invoice.currency ∧
    payment.amountMinor = invoice.totalMinor

def invoiceIdentity (invoice : Invoice) : InvoiceIdentity where
  vendorId := invoice.vendorId
  invoiceId := invoice.ref.recordId

def InvoiceRegisterTargetsInvoice
    (invoice : Invoice)
    (register : InvoiceRegister) : Prop :=
  register.buyerId = invoice.buyerId ∧
    register.targetIdentity = invoiceIdentity invoice

structure RelationshipAssumptions (facts : CapturedRecordSet) : Prop where
  invoicePurchaseOrder :
    InvoicePurchaseOrderFieldsAgree facts.invoice facts.purchaseOrder
  invoiceReceipt :
    InvoiceReceiptQuantitiesAgree facts.invoice facts.receiving
  invoicePayment :
    PaymentFieldsMatchInvoice facts.invoice facts.payment
  invoiceRegisterTarget :
    InvoiceRegisterTargetsInvoice facts.invoice facts.invoiceRegister

/-!
Every runtime claim carries a canonical parameter object.  The leaf objects
must include the independently expected policy ID/version/digest and the exact
ID and artifact digest of the record they capture.  Derived objects bind the
ordered exact references of every record they relate and enforce equality at
composition boundaries.

Lean keeps the canonical encodings opaque, just as `BrowserTransition` does.
Their decoding and their correspondence to `PolicyRef`, `RecordRef`, and the
typed values above are explicit runtime conformance obligations.

The public claim IDs below intentionally match the executable commercial-record
experiment so a source smoke test can detect vocabulary drift.  This does not
claim that Lean materializes the JavaScript parameter projections or rule
digests.  The rule IDs in this module are explicitly `formal-*`, and the
formal-only binary association used for the runtime's N-ary root has its own
non-runtime claim ID.
-/
structure CanonicalParameters where
  invoiceArithmetic : String
  invoicePurchaseOrder : String
  receivingSupport : String
  invoicePayment : String
  invoiceRegister : String
  invoiceAndOrder : String
  invoiceAndReceipt : String
  threeSource : String
  invoiceAndPayment : String
  invoiceIdentityUnique : String
  identityAndPayment : String
  root : String
  deriving DecidableEq, Repr, BEq

/-!
`ParameterDescribes` is supplied by the runtime boundary.  It relates an opaque
canonical string to the independently expected policy, the ordered exact record
references (including their artifact digests), and an optional queried invoice
identity.  Lean does not claim that this relation implements JavaScript's
canonical JSON encoder or digest algorithm.
-/
abbrev ParameterDescribes :=
  String → PolicyRef → List RecordRef → Option InvoiceIdentity → Prop

/-!
The runtime parameter-description relation must be single-valued: one opaque
parameter text cannot describe two different policies, ordered record lists,
or target identities.  Lean does not prove this property of canonical JSON or
its decoder.  It is an explicit conformance premise used below to state what
an immutable invoice replacement invalidates.
-/
def ParameterDescriptionIsSingleValued
    (describes : ParameterDescribes) : Prop :=
  ∀ text policy records target policy' records' target',
    describes text policy records target →
    describes text policy' records' target' →
    policy = policy' ∧ records = records' ∧ target = target'

/-!
This is the explicit cross-language correspondence assumption.  It binds every
opaque `CanonicalParameters` string to the expected policy and exact typed
record projection.  Identity-bearing parameters also bind the separately
captured register target; `RelationshipAssumptions.invoiceRegisterTarget`
states when that target is the exact invoice identity.
-/
structure CanonicalCorrespondence
    (describes : ParameterDescribes)
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet)
    (parameters : CanonicalParameters) : Prop where
  factsPolicy : facts.policy = expectedPolicy
  invoiceArithmetic :
    describes parameters.invoiceArithmetic expectedPolicy
      [facts.invoice.ref] none
  invoicePurchaseOrder :
    describes parameters.invoicePurchaseOrder expectedPolicy
      [facts.purchaseOrder.ref] none
  receivingSupport :
    describes parameters.receivingSupport expectedPolicy
      [facts.receiving.ref] none
  invoicePayment :
    describes parameters.invoicePayment expectedPolicy
      [facts.payment.ref] none
  invoiceRegister :
    describes parameters.invoiceRegister expectedPolicy
      [facts.invoiceRegister.ref] (some facts.invoiceRegister.targetIdentity)
  invoiceAndOrder :
    describes parameters.invoiceAndOrder expectedPolicy
      [facts.invoice.ref, facts.purchaseOrder.ref] none
  invoiceAndReceipt :
    describes parameters.invoiceAndReceipt expectedPolicy
      [facts.invoice.ref, facts.receiving.ref] none
  threeSource :
    describes parameters.threeSource expectedPolicy
      [facts.invoice.ref, facts.purchaseOrder.ref, facts.receiving.ref] none
  invoiceAndPayment :
    describes parameters.invoiceAndPayment expectedPolicy
      [facts.invoice.ref, facts.payment.ref] none
  invoiceIdentityUnique :
    describes parameters.invoiceIdentityUnique expectedPolicy
      [facts.invoice.ref, facts.invoiceRegister.ref]
      (some facts.invoiceRegister.targetIdentity)
  identityAndPayment :
    describes parameters.identityAndPayment expectedPolicy
      [facts.invoice.ref, facts.payment.ref, facts.invoiceRegister.ref]
      (some facts.invoiceRegister.targetIdentity)
  root :
    describes parameters.root expectedPolicy
      [facts.invoice.ref, facts.purchaseOrder.ref, facts.receiving.ref,
        facts.payment.ref, facts.invoiceRegister.ref]
      (some facts.invoiceRegister.targetIdentity)

def claim (canonicalParameters claimId : String) : ClaimKey where
  claimId := claimId
  claimVersion := "1"
  canonicalParameters := canonicalParameters

def invoiceArithmeticClaim (canonicalParameters : String) : ClaimKey :=
  claim canonicalParameters
    "riddle-proof.commercial-record.invoice-captured-arithmetic-consistent"

def invoicePurchaseOrderClaim (canonicalParameters : String) : ClaimKey :=
  claim canonicalParameters
    "riddle-proof.commercial-record.purchase-order-captured-consistent"

def receivingSupportClaim (canonicalParameters : String) : ClaimKey :=
  claim canonicalParameters
    "riddle-proof.commercial-record.receipt-captured"

def invoicePaymentClaim (canonicalParameters : String) : ClaimKey :=
  claim canonicalParameters
    "riddle-proof.commercial-record.payment-record-captured"

def invoiceRegisterClaim (canonicalParameters : String) : ClaimKey :=
  claim canonicalParameters
    "riddle-proof.commercial-record.invoice-register-entry-counted"

def invoiceAndOrderClaim (canonicalParameters : String) : ClaimKey :=
  claim canonicalParameters
    "riddle-proof.commercial-record.invoice-purchase-order-terms-match"

def invoiceAndReceiptClaim (canonicalParameters : String) : ClaimKey :=
  claim canonicalParameters
    "riddle-proof.commercial-record.invoice-receipt-quantities-match"

def threeSourceClaim (canonicalParameters : String) : ClaimKey :=
  claim canonicalParameters
    "riddle-proof.commercial-record.invoice-po-receipt-match"

def invoiceAndPaymentClaim (canonicalParameters : String) : ClaimKey :=
  claim canonicalParameters
    "riddle-proof.commercial-record.invoice-payment-amount-match"

def invoiceIdentityUniqueClaim (canonicalParameters : String) : ClaimKey :=
  claim canonicalParameters
    "riddle-proof.commercial-record.invoice-identity-unique-in-register"

def identityAndPaymentClaim (canonicalParameters : String) : ClaimKey :=
  claim canonicalParameters
    "riddle-proof.commercial-record.formal-identity-and-payment-association"

def capturedFieldsAgreeClaim (canonicalParameters : String) : ClaimKey :=
  claim canonicalParameters
    "riddle-proof.commercial-record.captured-fields-agree-under-policy"

def ruleDefinitionDigest (definition : RuleDefinition) : String :=
  "commercial-record-formal-rule-definition:" ++ reprStr definition

def addressed (definition : RuleDefinition) : ContentAddressedRule where
  definition := definition
  definitionDigest := ruleDefinitionDigest definition

def invoiceAndOrderDefinition
    (parameters : CanonicalParameters) : RuleDefinition where
  engine := fixedMeaningRuleEngine
  ruleId := "riddle-proof.commercial-record.formal-compose-invoice-and-order"
  ruleVersion := "1"
  leftPremise := invoiceArithmeticClaim parameters.invoiceArithmetic
  rightPremise :=
    invoicePurchaseOrderClaim parameters.invoicePurchaseOrder
  conclusion := invoiceAndOrderClaim parameters.invoiceAndOrder
  canonicalParameters := parameters.invoiceAndOrder

def invoiceAndReceiptDefinition
    (parameters : CanonicalParameters) : RuleDefinition where
  engine := fixedMeaningRuleEngine
  ruleId := "riddle-proof.commercial-record.formal-compose-invoice-and-receipt"
  ruleVersion := "1"
  leftPremise := invoiceArithmeticClaim parameters.invoiceArithmetic
  rightPremise := receivingSupportClaim parameters.receivingSupport
  conclusion := invoiceAndReceiptClaim parameters.invoiceAndReceipt
  canonicalParameters := parameters.invoiceAndReceipt

def threeSourceDefinition
    (parameters : CanonicalParameters) : RuleDefinition where
  engine := fixedMeaningRuleEngine
  ruleId := "riddle-proof.commercial-record.formal-compose-three-source"
  ruleVersion := "1"
  leftPremise := invoiceAndOrderClaim parameters.invoiceAndOrder
  rightPremise := invoiceAndReceiptClaim parameters.invoiceAndReceipt
  conclusion := threeSourceClaim parameters.threeSource
  canonicalParameters := parameters.threeSource

def invoiceAndPaymentDefinition
    (parameters : CanonicalParameters) : RuleDefinition where
  engine := fixedMeaningRuleEngine
  ruleId := "riddle-proof.commercial-record.formal-compose-invoice-and-payment"
  ruleVersion := "1"
  leftPremise := invoiceArithmeticClaim parameters.invoiceArithmetic
  rightPremise := invoicePaymentClaim parameters.invoicePayment
  conclusion := invoiceAndPaymentClaim parameters.invoiceAndPayment
  canonicalParameters := parameters.invoiceAndPayment

def invoiceIdentityUniqueDefinition
    (parameters : CanonicalParameters) : RuleDefinition where
  engine := fixedMeaningRuleEngine
  ruleId :=
    "riddle-proof.commercial-record.formal-compose-invoice-identity-unique"
  ruleVersion := "1"
  leftPremise := invoiceArithmeticClaim parameters.invoiceArithmetic
  rightPremise := invoiceRegisterClaim parameters.invoiceRegister
  conclusion :=
    invoiceIdentityUniqueClaim parameters.invoiceIdentityUnique
  canonicalParameters := parameters.invoiceIdentityUnique

def identityAndPaymentDefinition
    (parameters : CanonicalParameters) : RuleDefinition where
  engine := fixedMeaningRuleEngine
  ruleId :=
    "riddle-proof.commercial-record.formal-compose-identity-and-payment"
  ruleVersion := "1"
  leftPremise :=
    invoiceIdentityUniqueClaim parameters.invoiceIdentityUnique
  rightPremise := invoiceAndPaymentClaim parameters.invoiceAndPayment
  conclusion := identityAndPaymentClaim parameters.identityAndPayment
  canonicalParameters := parameters.identityAndPayment

def capturedFieldsAgreeDefinition
    (parameters : CanonicalParameters) : RuleDefinition where
  engine := fixedMeaningRuleEngine
  ruleId :=
    "riddle-proof.commercial-record.formal-compose-captured-fields-agree"
  ruleVersion := "1"
  leftPremise := identityAndPaymentClaim parameters.identityAndPayment
  rightPremise := threeSourceClaim parameters.threeSource
  conclusion := capturedFieldsAgreeClaim parameters.root
  canonicalParameters := parameters.root

def invoiceAndOrderRule
    (parameters : CanonicalParameters) : ContentAddressedRule :=
  addressed (invoiceAndOrderDefinition parameters)

def invoiceAndReceiptRule
    (parameters : CanonicalParameters) : ContentAddressedRule :=
  addressed (invoiceAndReceiptDefinition parameters)

def threeSourceRule
    (parameters : CanonicalParameters) : ContentAddressedRule :=
  addressed (threeSourceDefinition parameters)

def invoiceAndPaymentRule
    (parameters : CanonicalParameters) : ContentAddressedRule :=
  addressed (invoiceAndPaymentDefinition parameters)

def invoiceIdentityUniqueRule
    (parameters : CanonicalParameters) : ContentAddressedRule :=
  addressed (invoiceIdentityUniqueDefinition parameters)

def identityAndPaymentRule
    (parameters : CanonicalParameters) : ContentAddressedRule :=
  addressed (identityAndPaymentDefinition parameters)

def capturedFieldsAgreeRule
    (parameters : CanonicalParameters) : ContentAddressedRule :=
  addressed (capturedFieldsAgreeDefinition parameters)

def trustedRegistry (parameters : CanonicalParameters) : FixedRuleRegistry where
  rules := [
    invoiceAndOrderRule parameters,
    invoiceAndReceiptRule parameters,
    threeSourceRule parameters,
    invoiceAndPaymentRule parameters,
    invoiceIdentityUniqueRule parameters,
    identityAndPaymentRule parameters,
    capturedFieldsAgreeRule parameters
  ]

theorem trusted_registry_contains_exactly_seven_reconciliation_rules
    (parameters : CanonicalParameters) :
    (trustedRegistry parameters).rules = [
      invoiceAndOrderRule parameters,
      invoiceAndReceiptRule parameters,
      threeSourceRule parameters,
      invoiceAndPaymentRule parameters,
      invoiceIdentityUniqueRule parameters,
      identityAndPaymentRule parameters,
      capturedFieldsAgreeRule parameters
    ] := by
  rfl

def invoiceAndOrderTree
    (scope : Scope)
    (parameters : CanonicalParameters)
    (arithmeticTree : MeaningTree)
    (purchaseOrderLeaf : GroundedLeaf) : MeaningTree :=
  .compose scope
    (invoiceAndOrderClaim parameters.invoiceAndOrder)
    (invoiceAndOrderRule parameters)
    arithmeticTree
    (.grounded purchaseOrderLeaf)

def invoiceAndReceiptTree
    (scope : Scope)
    (parameters : CanonicalParameters)
    (arithmeticTree : MeaningTree)
    (receivingLeaf : GroundedLeaf) : MeaningTree :=
  .compose scope
    (invoiceAndReceiptClaim parameters.invoiceAndReceipt)
    (invoiceAndReceiptRule parameters)
    arithmeticTree
    (.grounded receivingLeaf)

def threeSourceTree
    (scope : Scope)
    (parameters : CanonicalParameters)
    (invoiceOrderTree invoiceReceiptTree : MeaningTree) : MeaningTree :=
  .compose scope
    (threeSourceClaim parameters.threeSource)
    (threeSourceRule parameters)
    invoiceOrderTree
    invoiceReceiptTree

def invoiceAndPaymentTree
    (scope : Scope)
    (parameters : CanonicalParameters)
    (arithmeticTree : MeaningTree)
    (paymentLeaf : GroundedLeaf) : MeaningTree :=
  .compose scope
    (invoiceAndPaymentClaim parameters.invoiceAndPayment)
    (invoiceAndPaymentRule parameters)
    arithmeticTree
    (.grounded paymentLeaf)

def invoiceIdentityUniqueTree
    (scope : Scope)
    (parameters : CanonicalParameters)
    (arithmeticTree : MeaningTree)
    (registerLeaf : GroundedLeaf) : MeaningTree :=
  .compose scope
    (invoiceIdentityUniqueClaim parameters.invoiceIdentityUnique)
    (invoiceIdentityUniqueRule parameters)
    arithmeticTree
    (.grounded registerLeaf)

def identityAndPaymentTree
    (scope : Scope)
    (parameters : CanonicalParameters)
    (identityTree paymentTree : MeaningTree) : MeaningTree :=
  .compose scope
    (identityAndPaymentClaim parameters.identityAndPayment)
    (identityAndPaymentRule parameters)
    identityTree
    paymentTree

def reconciliationTree
    (scope : Scope)
    (parameters : CanonicalParameters)
    (arithmeticLeaf purchaseOrderLeaf receivingLeaf paymentLeaf registerLeaf :
      GroundedLeaf) : MeaningTree :=
  let arithmeticTree := MeaningTree.grounded arithmeticLeaf
  let invoiceOrder :=
    invoiceAndOrderTree scope parameters arithmeticTree purchaseOrderLeaf
  let invoiceReceipt :=
    invoiceAndReceiptTree scope parameters arithmeticTree receivingLeaf
  let identity :=
    invoiceIdentityUniqueTree scope parameters arithmeticTree registerLeaf
  let invoicePayment :=
    invoiceAndPaymentTree scope parameters arithmeticTree paymentLeaf
  .compose scope
    (capturedFieldsAgreeClaim parameters.root)
    (capturedFieldsAgreeRule parameters)
    (identityAndPaymentTree scope parameters identity invoicePayment)
    (threeSourceTree scope parameters invoiceOrder invoiceReceipt)

/-! Exact semantic meanings for the five leaves and their derived branches. -/
def policyPinned
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet) : Prop :=
  facts.policy = expectedPolicy

def invoiceArithmeticMeaning
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet) : Prop :=
  policyPinned expectedPolicy facts ∧
    InvoiceArithmeticRecomputed facts.invoice

def purchaseOrderMeaning
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet) : Prop :=
  policyPinned expectedPolicy facts ∧
    PurchaseOrderArithmeticRecomputed facts.purchaseOrder

def receiptMeaning
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet) : Prop :=
  policyPinned expectedPolicy facts ∧
    ReceiptCapturedNormalized facts.receiving

def paymentMeaning
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet) : Prop :=
  policyPinned expectedPolicy facts ∧
    PaymentCapturedPosted facts.payment

def invoiceRegisterMeaning
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet) : Prop :=
  policyPinned expectedPolicy facts ∧
    RegisterOccurrenceCounted facts.invoiceRegister

def invoiceAndOrderMeaning
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet) : Prop :=
  (invoiceArithmeticMeaning expectedPolicy facts ∧
    purchaseOrderMeaning expectedPolicy facts) ∧
    InvoicePurchaseOrderFieldsAgree facts.invoice facts.purchaseOrder

def invoiceAndReceiptMeaning
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet) : Prop :=
  (invoiceArithmeticMeaning expectedPolicy facts ∧
    receiptMeaning expectedPolicy facts) ∧
    InvoiceReceiptQuantitiesAgree facts.invoice facts.receiving

def threeSourceMeaning
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet) : Prop :=
  invoiceAndOrderMeaning expectedPolicy facts ∧
    invoiceAndReceiptMeaning expectedPolicy facts

def invoiceAndPaymentMeaning
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet) : Prop :=
  (invoiceArithmeticMeaning expectedPolicy facts ∧
    paymentMeaning expectedPolicy facts) ∧
    PaymentFieldsMatchInvoice facts.invoice facts.payment

def invoiceIdentityUniqueMeaning
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet) : Prop :=
  (invoiceArithmeticMeaning expectedPolicy facts ∧
    invoiceRegisterMeaning expectedPolicy facts) ∧
    InvoiceRegisterTargetsInvoice facts.invoice facts.invoiceRegister

def identityAndPaymentMeaning
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet) : Prop :=
  invoiceIdentityUniqueMeaning expectedPolicy facts ∧
    invoiceAndPaymentMeaning expectedPolicy facts

def capturedFieldsAgreeMeaning
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet) : Prop :=
  identityAndPaymentMeaning expectedPolicy facts ∧
    threeSourceMeaning expectedPolicy facts

def reconciliationMeaning
    (describes : ParameterDescribes)
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet)
    (parameters : CanonicalParameters) : ClaimInterpretation :=
  fun _ claimKey =>
    if claimKey = capturedFieldsAgreeClaim parameters.root then
      capturedFieldsAgreeMeaning expectedPolicy facts ∧
        describes parameters.root expectedPolicy
          [facts.invoice.ref, facts.purchaseOrder.ref, facts.receiving.ref,
            facts.payment.ref, facts.invoiceRegister.ref]
          (some facts.invoiceRegister.targetIdentity)
    else if claimKey =
        identityAndPaymentClaim parameters.identityAndPayment then
      identityAndPaymentMeaning expectedPolicy facts ∧
        describes parameters.identityAndPayment expectedPolicy
          [facts.invoice.ref, facts.payment.ref, facts.invoiceRegister.ref]
          (some facts.invoiceRegister.targetIdentity)
    else if claimKey =
        invoiceIdentityUniqueClaim parameters.invoiceIdentityUnique then
      invoiceIdentityUniqueMeaning expectedPolicy facts ∧
        describes parameters.invoiceIdentityUnique expectedPolicy
          [facts.invoice.ref, facts.invoiceRegister.ref]
          (some facts.invoiceRegister.targetIdentity)
    else if claimKey = threeSourceClaim parameters.threeSource then
      threeSourceMeaning expectedPolicy facts ∧
        describes parameters.threeSource expectedPolicy
          [facts.invoice.ref, facts.purchaseOrder.ref, facts.receiving.ref] none
    else if claimKey =
        invoiceAndReceiptClaim parameters.invoiceAndReceipt then
      invoiceAndReceiptMeaning expectedPolicy facts ∧
        describes parameters.invoiceAndReceipt expectedPolicy
          [facts.invoice.ref, facts.receiving.ref] none
    else if claimKey =
        invoiceAndPaymentClaim parameters.invoiceAndPayment then
      invoiceAndPaymentMeaning expectedPolicy facts ∧
        describes parameters.invoiceAndPayment expectedPolicy
          [facts.invoice.ref, facts.payment.ref] none
    else if claimKey = invoiceAndOrderClaim parameters.invoiceAndOrder then
      invoiceAndOrderMeaning expectedPolicy facts ∧
        describes parameters.invoiceAndOrder expectedPolicy
          [facts.invoice.ref, facts.purchaseOrder.ref] none
    else if claimKey =
        invoiceArithmeticClaim parameters.invoiceArithmetic then
      invoiceArithmeticMeaning expectedPolicy facts ∧
        describes parameters.invoiceArithmetic expectedPolicy
          [facts.invoice.ref] none
    else if claimKey =
        invoicePurchaseOrderClaim parameters.invoicePurchaseOrder then
      purchaseOrderMeaning expectedPolicy facts ∧
        describes parameters.invoicePurchaseOrder expectedPolicy
          [facts.purchaseOrder.ref] none
    else if claimKey =
        receivingSupportClaim parameters.receivingSupport then
      receiptMeaning expectedPolicy facts ∧
        describes parameters.receivingSupport expectedPolicy
          [facts.receiving.ref] none
    else if claimKey = invoicePaymentClaim parameters.invoicePayment then
      paymentMeaning expectedPolicy facts ∧
        describes parameters.invoicePayment expectedPolicy
          [facts.payment.ref] none
    else if claimKey = invoiceRegisterClaim parameters.invoiceRegister then
      invoiceRegisterMeaning expectedPolicy facts ∧
        describes parameters.invoiceRegister expectedPolicy
          [facts.invoiceRegister.ref] (some facts.invoiceRegister.targetIdentity)
    else
      False

/-!
The three-way branch retains exactly its six declared premises.  In
particular, the invoice-to-order and invoice-to-receipt conclusions share one
invoice-arithmetic premise but do not erase either cross-record relationship.
-/
theorem three_source_meaning_iff_exact_declared_premises
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet) :
    threeSourceMeaning expectedPolicy facts ↔
      policyPinned expectedPolicy facts ∧
      InvoiceArithmeticRecomputed facts.invoice ∧
      PurchaseOrderArithmeticRecomputed facts.purchaseOrder ∧
      ReceiptCapturedNormalized facts.receiving ∧
      InvoicePurchaseOrderFieldsAgree facts.invoice facts.purchaseOrder ∧
      InvoiceReceiptQuantitiesAgree facts.invoice facts.receiving := by
  constructor
  · rintro ⟨hOrderBranch, hReceiptBranch⟩
    have hArithmetic := hOrderBranch.1.1
    have hPurchaseOrder := hOrderBranch.1.2
    have hReceipt := hReceiptBranch.1.2
    exact
      ⟨hArithmetic.1, hArithmetic.2, hPurchaseOrder.2, hReceipt.2,
        hOrderBranch.2, hReceiptBranch.2⟩
  · rintro
      ⟨hPolicy, hArithmetic, hPurchaseOrder, hReceipt,
        hOrderRelation, hReceiptRelation⟩
    have hArithmeticMeaning :
        invoiceArithmeticMeaning expectedPolicy facts :=
      ⟨hPolicy, hArithmetic⟩
    have hPurchaseOrderMeaning :
        purchaseOrderMeaning expectedPolicy facts :=
      ⟨hPolicy, hPurchaseOrder⟩
    have hReceiptMeaning : receiptMeaning expectedPolicy facts :=
      ⟨hPolicy, hReceipt⟩
    exact
      ⟨⟨⟨hArithmeticMeaning, hPurchaseOrderMeaning⟩, hOrderRelation⟩,
        ⟨⟨hArithmeticMeaning, hReceiptMeaning⟩, hReceiptRelation⟩⟩

/-!
The root retains exactly the five runtime leaf meanings, the independently
expected policy, the three runtime cross-record relationships, the register
target-to-invoice relationship, and its own canonical parameter binding.  The
duplicated invoice and policy premises in the fan-out add no hidden
requirements and are not dropped.  The following corollary discharges the
final binding from an independently supplied `CanonicalCorrespondence`.
-/
theorem captured_fields_root_meaning_iff_exact_relationships
    (scope : Scope)
    (describes : ParameterDescribes)
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet)
    (parameters : CanonicalParameters) :
    reconciliationMeaning describes expectedPolicy facts parameters scope
        (capturedFieldsAgreeClaim parameters.root) ↔
      policyPinned expectedPolicy facts ∧
      InvoiceArithmeticRecomputed facts.invoice ∧
      PurchaseOrderArithmeticRecomputed facts.purchaseOrder ∧
      ReceiptCapturedNormalized facts.receiving ∧
      PaymentCapturedPosted facts.payment ∧
      RegisterOccurrenceCounted facts.invoiceRegister ∧
      InvoicePurchaseOrderFieldsAgree facts.invoice facts.purchaseOrder ∧
      InvoiceReceiptQuantitiesAgree facts.invoice facts.receiving ∧
      PaymentFieldsMatchInvoice facts.invoice facts.payment ∧
      InvoiceRegisterTargetsInvoice facts.invoice facts.invoiceRegister ∧
      describes parameters.root expectedPolicy
        [facts.invoice.ref, facts.purchaseOrder.ref, facts.receiving.ref,
          facts.payment.ref, facts.invoiceRegister.ref]
        (some facts.invoiceRegister.targetIdentity) := by
  simp only [reconciliationMeaning, if_pos, capturedFieldsAgreeMeaning,
    identityAndPaymentMeaning, invoiceIdentityUniqueMeaning,
    invoiceRegisterMeaning, threeSourceMeaning, invoiceAndPaymentMeaning,
    invoiceAndOrderMeaning, invoiceAndReceiptMeaning,
    invoiceArithmeticMeaning, purchaseOrderMeaning, receiptMeaning,
    paymentMeaning]
  constructor
  · rintro ⟨hRoot, hRootBinding⟩
    have hIdentity := hRoot.1.1
    have hPaymentBranch := hRoot.1.2
    have hOrderBranch := hRoot.2.1
    have hReceiptBranch := hRoot.2.2
    have hArithmetic := hIdentity.1.1
    have hRegister := hIdentity.1.2
    have hPurchaseOrder := hOrderBranch.1.2
    have hReceipt := hReceiptBranch.1.2
    have hPayment := hPaymentBranch.1.2
    exact
      ⟨hArithmetic.1, hArithmetic.2, hPurchaseOrder.2, hReceipt.2,
        hPayment.2, hRegister.2, hOrderBranch.2,
        hReceiptBranch.2, hPaymentBranch.2, hIdentity.2, hRootBinding⟩
  · rintro
      ⟨hPolicy, hArithmetic, hPurchaseOrder, hReceipt, hPayment, hRegister,
        hPurchaseOrderRelation, hReceiptRelation, hPaymentRelation,
        hRegisterTarget, hRootBinding⟩
    have hArithmeticMeaning :
        invoiceArithmeticMeaning expectedPolicy facts :=
      ⟨hPolicy, hArithmetic⟩
    have hPurchaseOrderMeaning :
        purchaseOrderMeaning expectedPolicy facts :=
      ⟨hPolicy, hPurchaseOrder⟩
    have hReceiptMeaning : receiptMeaning expectedPolicy facts :=
      ⟨hPolicy, hReceipt⟩
    have hPaymentMeaning : paymentMeaning expectedPolicy facts :=
      ⟨hPolicy, hPayment⟩
    have hRegisterMeaning : invoiceRegisterMeaning expectedPolicy facts :=
      ⟨hPolicy, hRegister⟩
    have hIdentity : invoiceIdentityUniqueMeaning expectedPolicy facts :=
      ⟨⟨hArithmeticMeaning, hRegisterMeaning⟩, hRegisterTarget⟩
    have hPaymentBranch : invoiceAndPaymentMeaning expectedPolicy facts :=
      ⟨⟨hArithmeticMeaning, hPaymentMeaning⟩,
        hPaymentRelation⟩
    have hOrderBranch : invoiceAndOrderMeaning expectedPolicy facts :=
      ⟨⟨hArithmeticMeaning, hPurchaseOrderMeaning⟩,
        hPurchaseOrderRelation⟩
    have hReceiptBranch : invoiceAndReceiptMeaning expectedPolicy facts :=
      ⟨⟨hArithmeticMeaning, hReceiptMeaning⟩,
        hReceiptRelation⟩
    exact
      ⟨⟨⟨hIdentity, hPaymentBranch⟩, ⟨hOrderBranch, hReceiptBranch⟩⟩,
        hRootBinding⟩

theorem
    captured_fields_root_meaning_iff_runtime_meanings_under_canonical_correspondence
    (scope : Scope)
    (describes : ParameterDescribes)
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet)
    (parameters : CanonicalParameters)
    (hCanonical :
      CanonicalCorrespondence describes expectedPolicy facts parameters) :
    reconciliationMeaning describes expectedPolicy facts parameters scope
        (capturedFieldsAgreeClaim parameters.root) ↔
      policyPinned expectedPolicy facts ∧
      InvoiceArithmeticRecomputed facts.invoice ∧
      PurchaseOrderArithmeticRecomputed facts.purchaseOrder ∧
      ReceiptCapturedNormalized facts.receiving ∧
      PaymentCapturedPosted facts.payment ∧
      RegisterOccurrenceCounted facts.invoiceRegister ∧
      InvoicePurchaseOrderFieldsAgree facts.invoice facts.purchaseOrder ∧
      InvoiceReceiptQuantitiesAgree facts.invoice facts.receiving ∧
      PaymentFieldsMatchInvoice facts.invoice facts.payment ∧
      InvoiceRegisterTargetsInvoice facts.invoice facts.invoiceRegister := by
  rw [captured_fields_root_meaning_iff_exact_relationships]
  constructor
  · rintro
      ⟨hPolicy, hArithmetic, hPurchaseOrder, hReceipt, hPayment, hRegister,
        hPurchaseOrderRelation, hReceiptRelation, hPaymentRelation,
        hRegisterTarget, _hRootBinding⟩
    exact
      ⟨hPolicy, hArithmetic, hPurchaseOrder, hReceipt, hPayment, hRegister,
        hPurchaseOrderRelation, hReceiptRelation, hPaymentRelation,
        hRegisterTarget⟩
  · rintro
      ⟨hPolicy, hArithmetic, hPurchaseOrder, hReceipt, hPayment, hRegister,
        hPurchaseOrderRelation, hReceiptRelation, hPaymentRelation,
        hRegisterTarget⟩
    exact
      ⟨hPolicy, hArithmetic, hPurchaseOrder, hReceipt, hPayment, hRegister,
        hPurchaseOrderRelation, hReceiptRelation, hPaymentRelation,
        hRegisterTarget, hCanonical.root⟩

theorem invoice_and_order_rule_is_sound
    (describes : ParameterDescribes)
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet)
    (parameters : CanonicalParameters)
    (hCanonical :
      CanonicalCorrespondence describes expectedPolicy facts parameters)
    (hRelationships : RelationshipAssumptions facts) :
    RuleSound (reconciliationMeaning describes expectedPolicy facts parameters)
      (invoiceAndOrderDefinition parameters) := by
  intro ruleScope hArithmetic hPurchaseOrder
  simp [reconciliationMeaning, invoiceAndOrderMeaning,
    invoiceAndOrderDefinition, invoiceArithmeticClaim,
    invoicePurchaseOrderClaim, invoiceAndOrderClaim, invoiceAndReceiptClaim,
    threeSourceClaim,
    invoiceAndPaymentClaim, capturedFieldsAgreeClaim, invoiceIdentityUniqueClaim,
    identityAndPaymentClaim, claim] at hArithmetic hPurchaseOrder ⊢
  exact
    ⟨⟨⟨hArithmetic.1, hPurchaseOrder.1⟩,
      hRelationships.invoicePurchaseOrder⟩,
      hCanonical.invoiceAndOrder⟩

theorem invoice_and_receipt_rule_is_sound
    (describes : ParameterDescribes)
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet)
    (parameters : CanonicalParameters)
    (hCanonical :
      CanonicalCorrespondence describes expectedPolicy facts parameters)
    (hRelationships : RelationshipAssumptions facts) :
    RuleSound (reconciliationMeaning describes expectedPolicy facts parameters)
      (invoiceAndReceiptDefinition parameters) := by
  intro ruleScope hArithmetic hReceiving
  simp [reconciliationMeaning, invoiceAndReceiptMeaning,
    invoiceAndReceiptDefinition, invoiceArithmeticClaim,
    invoicePurchaseOrderClaim, invoiceAndOrderClaim, invoiceAndReceiptClaim,
    threeSourceClaim, invoiceAndPaymentClaim, capturedFieldsAgreeClaim,
    receivingSupportClaim,
    invoiceIdentityUniqueClaim, identityAndPaymentClaim, claim]
    at hArithmetic hReceiving ⊢
  exact
    ⟨⟨⟨hArithmetic.1, hReceiving.1⟩, hRelationships.invoiceReceipt⟩,
      hCanonical.invoiceAndReceipt⟩

theorem three_source_rule_is_sound
    (describes : ParameterDescribes)
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet)
    (parameters : CanonicalParameters)
    (hCanonical :
      CanonicalCorrespondence describes expectedPolicy facts parameters)
    (_hRelationships : RelationshipAssumptions facts) :
    RuleSound (reconciliationMeaning describes expectedPolicy facts parameters)
      (threeSourceDefinition parameters) := by
  intro ruleScope hInvoiceOrder hInvoiceReceipt
  simp [reconciliationMeaning, threeSourceMeaning, threeSourceDefinition,
    invoiceAndOrderClaim,
    invoiceAndReceiptClaim, threeSourceClaim, invoiceAndPaymentClaim,
    capturedFieldsAgreeClaim,
    invoiceIdentityUniqueClaim, identityAndPaymentClaim, claim]
    at hInvoiceOrder hInvoiceReceipt ⊢
  exact
    ⟨⟨hInvoiceOrder.1, hInvoiceReceipt.1⟩, hCanonical.threeSource⟩

theorem invoice_and_payment_rule_is_sound
    (describes : ParameterDescribes)
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet)
    (parameters : CanonicalParameters)
    (hCanonical :
      CanonicalCorrespondence describes expectedPolicy facts parameters)
    (hRelationships : RelationshipAssumptions facts) :
    RuleSound (reconciliationMeaning describes expectedPolicy facts parameters)
      (invoiceAndPaymentDefinition parameters) := by
  intro ruleScope hArithmetic hPayment
  simp [reconciliationMeaning, invoiceAndPaymentMeaning,
    invoiceAndPaymentDefinition, invoiceArithmeticClaim,
    invoicePurchaseOrderClaim, invoiceAndOrderClaim, invoiceAndReceiptClaim,
    threeSourceClaim,
    invoiceAndPaymentClaim, capturedFieldsAgreeClaim, receivingSupportClaim,
    invoicePaymentClaim, invoiceIdentityUniqueClaim,
    identityAndPaymentClaim, claim] at hArithmetic hPayment ⊢
  exact
    ⟨⟨⟨hArithmetic.1, hPayment.1⟩, hRelationships.invoicePayment⟩,
      hCanonical.invoiceAndPayment⟩

theorem invoice_identity_unique_rule_is_sound
    (describes : ParameterDescribes)
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet)
    (parameters : CanonicalParameters)
    (hCanonical :
      CanonicalCorrespondence describes expectedPolicy facts parameters)
    (hRelationships : RelationshipAssumptions facts) :
    RuleSound (reconciliationMeaning describes expectedPolicy facts parameters)
      (invoiceIdentityUniqueDefinition parameters) := by
  intro ruleScope hArithmetic hRegister
  simp [reconciliationMeaning, invoiceIdentityUniqueMeaning,
    invoiceIdentityUniqueDefinition, invoiceArithmeticClaim,
    invoicePurchaseOrderClaim, invoiceAndOrderClaim, invoiceAndReceiptClaim,
    threeSourceClaim,
    invoiceAndPaymentClaim, capturedFieldsAgreeClaim, receivingSupportClaim,
    invoicePaymentClaim, invoiceRegisterClaim, invoiceIdentityUniqueClaim,
    identityAndPaymentClaim, claim] at hArithmetic hRegister ⊢
  exact
    ⟨⟨⟨hArithmetic.1, hRegister.1⟩,
      hRelationships.invoiceRegisterTarget⟩,
      hCanonical.invoiceIdentityUnique⟩

theorem identity_and_payment_rule_is_sound
    (describes : ParameterDescribes)
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet)
    (parameters : CanonicalParameters)
    (hCanonical :
      CanonicalCorrespondence describes expectedPolicy facts parameters)
    (_hRelationships : RelationshipAssumptions facts) :
    RuleSound (reconciliationMeaning describes expectedPolicy facts parameters)
      (identityAndPaymentDefinition parameters) := by
  intro ruleScope hIdentity hPayment
  simp [reconciliationMeaning, identityAndPaymentMeaning,
    identityAndPaymentDefinition, invoiceAndReceiptClaim,
    threeSourceClaim,
    invoiceAndPaymentClaim, capturedFieldsAgreeClaim, invoiceIdentityUniqueClaim,
    identityAndPaymentClaim, claim] at hIdentity hPayment ⊢
  exact
    ⟨⟨hIdentity.1, hPayment.1⟩, hCanonical.identityAndPayment⟩

theorem captured_fields_agree_rule_is_sound
    (describes : ParameterDescribes)
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet)
    (parameters : CanonicalParameters)
    (hCanonical :
      CanonicalCorrespondence describes expectedPolicy facts parameters)
    (_hRelationships : RelationshipAssumptions facts) :
    RuleSound (reconciliationMeaning describes expectedPolicy facts parameters)
      (capturedFieldsAgreeDefinition parameters) := by
  intro ruleScope hIdentityPayment hThreeSource
  simp [reconciliationMeaning, capturedFieldsAgreeMeaning,
    capturedFieldsAgreeDefinition,
    threeSourceClaim,
    capturedFieldsAgreeClaim, invoiceIdentityUniqueClaim,
    identityAndPaymentClaim, claim] at hIdentityPayment hThreeSource ⊢
  exact
    ⟨⟨hIdentityPayment.1, hThreeSource.1⟩, hCanonical.root⟩

theorem trusted_registry_is_sound
    (describes : ParameterDescribes)
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet)
    (parameters : CanonicalParameters)
    (hCanonical :
      CanonicalCorrespondence describes expectedPolicy facts parameters)
    (hRelationships : RelationshipAssumptions facts) :
    RegistrySound
      (reconciliationMeaning describes expectedPolicy facts parameters)
      (trustedRegistry parameters) := by
  intro rule hRule
  simp [trustedRegistry] at hRule
  rcases hRule with rfl | rfl | rfl | rfl | rfl | rfl | rfl
  · exact invoice_and_order_rule_is_sound describes expectedPolicy facts
      parameters hCanonical hRelationships
  · exact invoice_and_receipt_rule_is_sound describes expectedPolicy facts
      parameters hCanonical hRelationships
  · exact three_source_rule_is_sound describes expectedPolicy facts parameters
      hCanonical hRelationships
  · exact invoice_and_payment_rule_is_sound describes expectedPolicy facts
      parameters hCanonical hRelationships
  · exact invoice_identity_unique_rule_is_sound describes expectedPolicy facts
      parameters hCanonical hRelationships
  · exact identity_and_payment_rule_is_sound describes expectedPolicy facts
      parameters hCanonical hRelationships
  · exact captured_fields_agree_rule_is_sound describes expectedPolicy facts
      parameters hCanonical hRelationships

/-!
Structural checking plus supplied grounded meanings establishes only the narrow
root above.  It cannot manufacture the five empirical premises from a valid
tree, nor can it upgrade field agreement into approval or real-world truth.
-/
theorem checked_reconciliation_with_grounded_meanings_establishes_root
    (scope : Scope)
    (describes : ParameterDescribes)
    (parameters : CanonicalParameters)
    (now : Nat)
    (arithmeticLeaf purchaseOrderLeaf receivingLeaf paymentLeaf registerLeaf :
      GroundedLeaf)
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet)
    (hCanonical :
      CanonicalCorrespondence describes expectedPolicy facts parameters)
    (hRelationships : RelationshipAssumptions facts)
    (hChecked :
      checked ruleDefinitionDigest (trustedRegistry parameters) now
        (reconciliationTree scope parameters arithmeticLeaf purchaseOrderLeaf
          receivingLeaf paymentLeaf registerLeaf) = true)
    (hLeaves :
      GroundedLeafMeaningsHold
        (reconciliationMeaning describes expectedPolicy facts parameters)
        (reconciliationTree scope parameters arithmeticLeaf purchaseOrderLeaf
          receivingLeaf paymentLeaf registerLeaf)) :
    reconciliationMeaning describes expectedPolicy facts parameters scope
      (capturedFieldsAgreeClaim parameters.root) := by
  have hRoot := checked_tree_with_sound_registry_establishes_root_meaning
    ruleDefinitionDigest (trustedRegistry parameters) now
    (reconciliationMeaning describes expectedPolicy facts parameters)
    (reconciliationTree scope parameters arithmeticLeaf purchaseOrderLeaf
      receivingLeaf paymentLeaf registerLeaf)
    hChecked hLeaves
    (trusted_registry_is_sound describes expectedPolicy facts parameters
      hCanonical hRelationships)
  simpa [reconciliationTree, threeSourceTree, invoiceAndOrderTree,
    invoiceAndReceiptTree, invoiceAndPaymentTree, invoiceIdentityUniqueTree,
    identityAndPaymentTree, MeaningTree.rootScope, MeaningTree.rootClaim]
    using hRoot

/-!
`AllGroundedLeafMeanings` is a constructive way to supply a meaning for every
grounded occurrence in a concrete tree.  The reachability theorem converts it
to the kernel's extensional `GroundedLeafMeaningsHold` premise.
-/
def AllGroundedLeafMeanings
    (meaning : ClaimInterpretation) : MeaningTree → Prop
  | .grounded leaf => meaning leaf.scope leaf.claim
  | .compose _ _ _ left right =>
      AllGroundedLeafMeanings meaning left ∧
        AllGroundedLeafMeanings meaning right

theorem all_grounded_leaf_meanings_imply_reachable_leaf_meanings
    (meaning : ClaimInterpretation)
    (tree : MeaningTree)
    (hAll : AllGroundedLeafMeanings meaning tree) :
    GroundedLeafMeaningsHold meaning tree := by
  intro leaf hReachable
  induction hReachable with
  | root leaf =>
      exact hAll
  | left _ inductionHypothesis =>
      exact inductionHypothesis hAll.1
  | right _ inductionHypothesis =>
      exact inductionHypothesis hAll.2

/-!
The three-source branch does not mention a payment record.  Replacing only the
payment therefore cannot change that branch's proposition.
-/
theorem three_source_meaning_is_payment_independent
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet)
    (replacementPayment : PaymentRecord) :
    threeSourceMeaning expectedPolicy
        { facts with payment := replacementPayment } ↔
      threeSourceMeaning expectedPolicy facts := by
  rfl

theorem invoice_identity_meaning_is_payment_independent
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet)
    (replacementPayment : PaymentRecord) :
    invoiceIdentityUniqueMeaning expectedPolicy
        { facts with payment := replacementPayment } ↔
      invoiceIdentityUniqueMeaning expectedPolicy facts := by
  rfl

/-!
Replacing an invoice changes only the invoice field of the typed record set.
The independently captured purchase-order and receipt meanings are therefore
definitionally reusable.  This says nothing about the replacement invoice's
own arithmetic or its agreement with those unchanged records.
-/
def replaceInvoice
    (facts : CapturedRecordSet)
    (replacementInvoice : Invoice) : CapturedRecordSet :=
  { facts with invoice := replacementInvoice }

theorem invoice_replacement_preserves_purchase_order_meaning
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet)
    (replacementInvoice : Invoice) :
    purchaseOrderMeaning expectedPolicy
        (replaceInvoice facts replacementInvoice) ↔
      purchaseOrderMeaning expectedPolicy facts := by
  rfl

theorem invoice_replacement_preserves_receipt_meaning
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet)
    (replacementInvoice : Invoice) :
    receiptMeaning expectedPolicy
        (replaceInvoice facts replacementInvoice) ↔
      receiptMeaning expectedPolicy facts := by
  rfl

/-!
An immutable invoice replacement has a different exact `RecordRef`.  Under a
single-valued parameter-description boundary, both the three-way conclusion
and the full reconciliation root must therefore receive new canonical
parameters and new claim keys.  Old conclusions are not silently reusable.
-/
theorem changed_invoice_ref_forces_changed_three_source_parameters
    (describes : ParameterDescribes)
    (hSingleValued : ParameterDescriptionIsSingleValued describes)
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet)
    (replacementInvoice : Invoice)
    (oldParameters revisedParameters : CanonicalParameters)
    (hOld :
      CanonicalCorrespondence describes expectedPolicy facts oldParameters)
    (hRevised :
      CanonicalCorrespondence describes expectedPolicy
        (replaceInvoice facts replacementInvoice) revisedParameters)
    (hChanged : replacementInvoice.ref ≠ facts.invoice.ref) :
    oldParameters.threeSource ≠ revisedParameters.threeSource := by
  intro hParameters
  have hRevisedBinding :
      describes oldParameters.threeSource expectedPolicy
        [replacementInvoice.ref, facts.purchaseOrder.ref, facts.receiving.ref]
        none := by
    simpa [replaceInvoice, hParameters] using hRevised.threeSource
  have hRecords :=
    (hSingleValued oldParameters.threeSource expectedPolicy
      [facts.invoice.ref, facts.purchaseOrder.ref, facts.receiving.ref] none
      expectedPolicy
      [replacementInvoice.ref, facts.purchaseOrder.ref, facts.receiving.ref]
      none hOld.threeSource hRevisedBinding).2.1
  have hInvoiceRef : facts.invoice.ref = replacementInvoice.ref := by
    simpa using congrArg List.head? hRecords
  exact hChanged hInvoiceRef.symm

theorem changed_invoice_ref_forces_changed_root_parameters
    (describes : ParameterDescribes)
    (hSingleValued : ParameterDescriptionIsSingleValued describes)
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet)
    (replacementInvoice : Invoice)
    (oldParameters revisedParameters : CanonicalParameters)
    (hOld :
      CanonicalCorrespondence describes expectedPolicy facts oldParameters)
    (hRevised :
      CanonicalCorrespondence describes expectedPolicy
        (replaceInvoice facts replacementInvoice) revisedParameters)
    (hChanged : replacementInvoice.ref ≠ facts.invoice.ref) :
    oldParameters.root ≠ revisedParameters.root := by
  intro hParameters
  have hRevisedBinding :
      describes oldParameters.root expectedPolicy
        [replacementInvoice.ref, facts.purchaseOrder.ref, facts.receiving.ref,
          facts.payment.ref, facts.invoiceRegister.ref]
        (some facts.invoiceRegister.targetIdentity) := by
    simpa [replaceInvoice, hParameters] using hRevised.root
  have hRecords :=
    (hSingleValued oldParameters.root expectedPolicy
      [facts.invoice.ref, facts.purchaseOrder.ref, facts.receiving.ref,
        facts.payment.ref, facts.invoiceRegister.ref]
      (some facts.invoiceRegister.targetIdentity) expectedPolicy
      [replacementInvoice.ref, facts.purchaseOrder.ref, facts.receiving.ref,
        facts.payment.ref, facts.invoiceRegister.ref]
      (some facts.invoiceRegister.targetIdentity)
      hOld.root hRevisedBinding).2.1
  have hInvoiceRef : facts.invoice.ref = replacementInvoice.ref := by
    simpa using congrArg List.head? hRecords
  exact hChanged hInvoiceRef.symm

theorem invoice_replacement_changes_three_source_conclusion
    (describes : ParameterDescribes)
    (hSingleValued : ParameterDescriptionIsSingleValued describes)
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet)
    (replacementInvoice : Invoice)
    (oldParameters revisedParameters : CanonicalParameters)
    (hOld :
      CanonicalCorrespondence describes expectedPolicy facts oldParameters)
    (hRevised :
      CanonicalCorrespondence describes expectedPolicy
        (replaceInvoice facts replacementInvoice) revisedParameters)
    (hChanged : replacementInvoice.ref ≠ facts.invoice.ref) :
    threeSourceClaim oldParameters.threeSource ≠
      threeSourceClaim revisedParameters.threeSource := by
  intro hClaims
  exact
    changed_invoice_ref_forces_changed_three_source_parameters
      describes hSingleValued expectedPolicy facts replacementInvoice
      oldParameters revisedParameters hOld hRevised hChanged
      (congrArg ClaimKey.canonicalParameters hClaims)

theorem invoice_replacement_changes_root_conclusion
    (describes : ParameterDescribes)
    (hSingleValued : ParameterDescriptionIsSingleValued describes)
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet)
    (replacementInvoice : Invoice)
    (oldParameters revisedParameters : CanonicalParameters)
    (hOld :
      CanonicalCorrespondence describes expectedPolicy facts oldParameters)
    (hRevised :
      CanonicalCorrespondence describes expectedPolicy
        (replaceInvoice facts replacementInvoice) revisedParameters)
    (hChanged : replacementInvoice.ref ≠ facts.invoice.ref) :
    capturedFieldsAgreeClaim oldParameters.root ≠
      capturedFieldsAgreeClaim revisedParameters.root := by
  intro hClaims
  exact
    changed_invoice_ref_forces_changed_root_parameters
      describes hSingleValued expectedPolicy facts replacementInvoice
      oldParameters revisedParameters hOld hRevised hChanged
      (congrArg ClaimKey.canonicalParameters hClaims)

/-!
Here "fresh" means replacement-bound, not clock freshness.  Any semantic root
for the revised specimen must supply the replacement invoice's arithmetic and
all four relationships that mention it, and its root parameter binding must
name the replacement `RecordRef`.  Runtime code still owns capture time,
parsing, hashing, signatures, and currentness.
-/
theorem revised_root_requires_replacement_bound_invoice_premises
    (scope : Scope)
    (describes : ParameterDescribes)
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet)
    (replacementInvoice : Invoice)
    (revisedParameters : CanonicalParameters)
    (hRoot :
      reconciliationMeaning describes expectedPolicy
          (replaceInvoice facts replacementInvoice) revisedParameters scope
        (capturedFieldsAgreeClaim revisedParameters.root)) :
    InvoiceArithmeticRecomputed replacementInvoice ∧
      InvoicePurchaseOrderFieldsAgree replacementInvoice facts.purchaseOrder ∧
      InvoiceReceiptQuantitiesAgree replacementInvoice facts.receiving ∧
      PaymentFieldsMatchInvoice replacementInvoice facts.payment ∧
      InvoiceRegisterTargetsInvoice replacementInvoice facts.invoiceRegister ∧
      describes revisedParameters.root expectedPolicy
        [replacementInvoice.ref, facts.purchaseOrder.ref, facts.receiving.ref,
          facts.payment.ref, facts.invoiceRegister.ref]
        (some facts.invoiceRegister.targetIdentity) := by
  have hExact :=
    (captured_fields_root_meaning_iff_exact_relationships
      scope describes expectedPolicy
      (replaceInvoice facts replacementInvoice) revisedParameters).mp hRoot
  rcases hExact with
    ⟨_hPolicy, hArithmetic, _hPurchaseOrder, _hReceipt, _hPayment,
      _hRegister, hOrderRelation, hReceiptRelation, hPaymentRelation,
      hRegisterTarget, hRootBinding⟩
  simpa [replaceInvoice] using
    ⟨hArithmetic, hOrderRelation, hReceiptRelation, hPaymentRelation,
      hRegisterTarget, hRootBinding⟩

/-!
If an old root was established and a replacement payment independently
satisfies both the posted-capture leaf meaning and the exact relationship for
the unchanged invoice, the unchanged three-source and invoice-identity
branches and their arithmetic premise are sufficient to build the new root.
No register, purchase-order, or receiving relationship is re-proved.
-/
theorem changed_payment_recomposes_from_unchanged_three_source_branch
    (expectedPolicy : PolicyRef)
    (facts : CapturedRecordSet)
    (replacementPayment : PaymentRecord)
    (hOldRoot : capturedFieldsAgreeMeaning expectedPolicy facts)
    (hReplacementCaptured : PaymentCapturedPosted replacementPayment)
    (hReplacementMatch :
      PaymentFieldsMatchInvoice facts.invoice replacementPayment) :
    capturedFieldsAgreeMeaning expectedPolicy
      { facts with payment := replacementPayment } := by
  rcases hOldRoot with
    ⟨⟨hIdentity, _hOldPaymentBranch⟩, hThreeSource⟩
  have hArithmetic : invoiceArithmeticMeaning expectedPolicy facts :=
    hIdentity.1.1
  have hPolicy : policyPinned expectedPolicy facts :=
    hArithmetic.1
  have hReplacementPaymentMeaning :
      paymentMeaning expectedPolicy
        { facts with payment := replacementPayment } :=
    ⟨hPolicy, hReplacementCaptured⟩
  have hReplacementPaymentBranch :
      invoiceAndPaymentMeaning expectedPolicy
        { facts with payment := replacementPayment } :=
    ⟨⟨hArithmetic, hReplacementPaymentMeaning⟩, hReplacementMatch⟩
  exact ⟨⟨hIdentity, hReplacementPaymentBranch⟩, hThreeSource⟩

namespace Fixture

/-!
These two-line values match the public synthetic workbench fixture.  The first
invoice is internally arithmetic-consistent even though its second-line
quantity does not agree with the separately captured purchase order and
receipt.  The second list is the typed invoice-only correction.  These
theorems cover arithmetic only; fixture-file decoding and correspondence to
these typed values remain runtime/source-level test obligations.
-/
def workbenchOverInvoicedLines : List PricedLine := [
  {
    lineId := "line-1"
    itemId := "WIDGET-A"
    quantity := 10
    unitPriceMinor := 1250
    extendedMinor := 12500
  },
  {
    lineId := "line-2"
    itemId := "SERVICE-B"
    quantity := 12
    unitPriceMinor := 500
    extendedMinor := 6000
  }
]

def workbenchCorrectedLines : List PricedLine := [
  {
    lineId := "line-1"
    itemId := "WIDGET-A"
    quantity := 10
    unitPriceMinor := 1250
    extendedMinor := 12500
  },
  {
    lineId := "line-2"
    itemId := "SERVICE-B"
    quantity := 10
    unitPriceMinor := 500
    extendedMinor := 5000
  }
]

theorem workbench_over_invoiced_two_line_arithmetic_holds :
    MultiLineArithmeticRecomputed
      workbenchOverInvoicedLines 18500 1480 19980 := by
  simp [MultiLineArithmeticRecomputed, EveryLineExtensionExact,
    workbenchOverInvoicedLines, statedExtensionSubtotal]

theorem workbench_over_invoiced_total_is_exactly_recomputed :
    19980 =
      recomputedExtensionSubtotal workbenchOverInvoicedLines + 1480 :=
  multi_line_arithmetic_implies_exact_total_from_terms
    workbenchOverInvoicedLines 18500 1480 19980
    workbench_over_invoiced_two_line_arithmetic_holds

theorem workbench_corrected_two_line_arithmetic_holds :
    MultiLineArithmeticRecomputed
      workbenchCorrectedLines 17500 1400 18900 := by
  simp [MultiLineArithmeticRecomputed, EveryLineExtensionExact,
    workbenchCorrectedLines, statedExtensionSubtotal]

theorem workbench_corrected_total_is_exactly_recomputed :
    18900 =
      recomputedExtensionSubtotal workbenchCorrectedLines + 1400 :=
  multi_line_arithmetic_implies_exact_total_from_terms
    workbenchCorrectedLines 17500 1400 18900
    workbench_corrected_two_line_arithmetic_holds

def policy : PolicyRef where
  policyId := "synthetic-ap-field-policy"
  policyVersion := "1"
  policyDigest := "sha256:policy-v1"

def invoiceRef : RecordRef where
  kind := .invoice
  sourceSystem := "synthetic-ledger"
  recordId := "INV-001"
  artifactDigest := "sha256:invoice-a"

def purchaseOrderRef : RecordRef where
  kind := .purchaseOrder
  sourceSystem := "synthetic-procurement"
  recordId := "PO-001"
  artifactDigest := "sha256:po-a"

def receivingRef : RecordRef where
  kind := .receiving
  sourceSystem := "synthetic-warehouse"
  recordId := "REC-001"
  artifactDigest := "sha256:receiving-a"

def paymentRef : RecordRef where
  kind := .payment
  sourceSystem := "synthetic-ledger"
  recordId := "PAY-001"
  artifactDigest := "sha256:payment-a"

def registerRef : RecordRef where
  kind := .invoiceRegister
  sourceSystem := "synthetic-ledger"
  recordId := "REGISTER-001"
  artifactDigest := "sha256:register-a"

def invoice : Invoice where
  ref := invoiceRef
  buyerId := "BUYER-001"
  purchaseOrderId := purchaseOrderRef.recordId
  vendorId := "VENDOR-001"
  paymentTerms := "NET30"
  itemId := "ITEM-001"
  currency := "USD"
  quantity := 2
  unitPriceMinor := 1250
  lineTermsDigest := "sha256:line-terms-a"
  quantityDigest := "sha256:quantities-a"
  subtotalMinor := 2500
  taxMinor := 200
  totalMinor := 2700

def purchaseOrder : PurchaseOrder where
  ref := purchaseOrderRef
  buyerId := "BUYER-001"
  vendorId := "VENDOR-001"
  paymentTerms := "NET30"
  itemId := "ITEM-001"
  currency := "USD"
  quantityAuthorized := 2
  unitPriceMinor := 1250
  lineTermsDigest := "sha256:line-terms-a"
  quantityDigest := "sha256:quantities-a"
  subtotalMinor := 2500
  taxMinor := 200
  totalMinor := 2700

def receiving : ReceivingRecord where
  ref := receivingRef
  buyerId := "BUYER-001"
  vendorId := "VENDOR-001"
  purchaseOrderId := purchaseOrderRef.recordId
  itemId := "ITEM-001"
  quantityReceived := 2
  quantityDigest := "sha256:quantities-a"

def payment : PaymentRecord where
  ref := paymentRef
  buyerId := "BUYER-001"
  invoiceId := invoiceRef.recordId
  vendorId := "VENDOR-001"
  currency := "USD"
  amountMinor := 2700
  status := .posted
  reference := "ACH-001"

def register : InvoiceRegister where
  ref := registerRef
  buyerId := "BUYER-001"
  targetIdentity := { vendorId := "VENDOR-001", invoiceId := "INV-001" }
  entries := [
    { vendorId := "VENDOR-001", invoiceId := "INV-001" },
    { vendorId := "VENDOR-002", invoiceId := "INV-OTHER" }
  ]
  occurrenceCount := 1

def facts : CapturedRecordSet where
  policy := policy
  invoice := invoice
  purchaseOrder := purchaseOrder
  receiving := receiving
  payment := payment
  invoiceRegister := register

theorem positive_fixture_exact_relationships_hold :
    policyPinned policy facts ∧
      InvoiceArithmeticRecomputed facts.invoice ∧
      PurchaseOrderArithmeticRecomputed facts.purchaseOrder ∧
      ReceiptCapturedNormalized facts.receiving ∧
      PaymentCapturedPosted facts.payment ∧
      RegisterOccurrenceCounted facts.invoiceRegister ∧
      InvoicePurchaseOrderFieldsAgree facts.invoice facts.purchaseOrder ∧
      InvoiceReceiptQuantitiesAgree facts.invoice facts.receiving ∧
      PaymentFieldsMatchInvoice facts.invoice facts.payment ∧
      InvoiceRegisterTargetsInvoice facts.invoice facts.invoiceRegister := by
  constructor
  · unfold policyPinned
    native_decide
  constructor
  · unfold InvoiceArithmeticRecomputed CapturedRef
    native_decide
  constructor
  · unfold PurchaseOrderArithmeticRecomputed CapturedRef
    native_decide
  constructor
  · unfold ReceiptCapturedNormalized CapturedRef
    native_decide
  constructor
  · unfold PaymentCapturedPosted CapturedRef
    native_decide
  constructor
  · unfold RegisterOccurrenceCounted CapturedRef
    native_decide
  constructor
  · unfold InvoicePurchaseOrderFieldsAgree
    native_decide
  constructor
  · unfold InvoiceReceiptQuantitiesAgree
    native_decide
  constructor
  · unfold PaymentFieldsMatchInvoice
    native_decide
  · unfold InvoiceRegisterTargetsInvoice invoiceIdentity
    native_decide

def relationshipAssumptions : RelationshipAssumptions facts := by
  constructor
  · unfold InvoicePurchaseOrderFieldsAgree
    native_decide
  · unfold InvoiceReceiptQuantitiesAgree
    native_decide
  · unfold PaymentFieldsMatchInvoice
    native_decide
  · unfold InvoiceRegisterTargetsInvoice invoiceIdentity
    native_decide

def scope : Scope where
  repository := "synthetic/record-reconciliation"
  revision := "fixture-policy-and-parser-v1"
  environment := "local-synthetic"
  target := "synthetic-case-001"
  proofAttempt := "synthetic-record-reconciliation-001"

structure ParameterDescription where
  policy : PolicyRef
  orderedRecords : List RecordRef
  targetIdentity : Option InvoiceIdentity
  deriving DecidableEq, Repr, BEq

def encodeParameters
    (parameterPolicy : PolicyRef)
    (orderedRecords : List RecordRef)
    (targetIdentity : Option InvoiceIdentity) : String :=
  reprStr ({ policy := parameterPolicy, orderedRecords, targetIdentity } :
    ParameterDescription)

def describes : ParameterDescribes :=
  fun text parameterPolicy orderedRecords targetIdentity =>
    text = encodeParameters parameterPolicy orderedRecords targetIdentity

def parameters : CanonicalParameters where
  invoiceArithmetic := encodeParameters policy [invoiceRef] none
  invoicePurchaseOrder := encodeParameters policy [purchaseOrderRef] none
  receivingSupport := encodeParameters policy [receivingRef] none
  invoicePayment := encodeParameters policy [paymentRef] none
  invoiceRegister :=
    encodeParameters policy [registerRef] (some register.targetIdentity)
  invoiceAndOrder :=
    encodeParameters policy [invoiceRef, purchaseOrderRef] none
  invoiceAndReceipt :=
    encodeParameters policy [invoiceRef, receivingRef] none
  threeSource :=
    encodeParameters policy [invoiceRef, purchaseOrderRef, receivingRef] none
  invoiceAndPayment :=
    encodeParameters policy [invoiceRef, paymentRef] none
  invoiceIdentityUnique :=
    encodeParameters policy [invoiceRef, registerRef]
      (some register.targetIdentity)
  identityAndPayment :=
    encodeParameters policy [invoiceRef, paymentRef, registerRef]
      (some register.targetIdentity)
  root :=
    encodeParameters policy
      [invoiceRef, purchaseOrderRef, receivingRef, paymentRef, registerRef]
      (some register.targetIdentity)

theorem canonical_correspondence_holds :
    CanonicalCorrespondence describes policy facts parameters := by
  constructor <;> rfl

def groundedLeaf
    (certificateId groundingId : String)
    (claimKey : ClaimKey)
    (leafScope : Scope := scope) : GroundedLeaf where
  certificateId := certificateId
  groundingId := groundingId
  scope := leafScope
  claim := claimKey
  issuedAt := 40
  validThrough := 60

def arithmeticLeaf : GroundedLeaf :=
  groundedLeaf "cert-arithmetic" "ground-arithmetic"
    (invoiceArithmeticClaim parameters.invoiceArithmetic)

def purchaseOrderLeaf : GroundedLeaf :=
  groundedLeaf "cert-purchase-order" "ground-purchase-order"
    (invoicePurchaseOrderClaim parameters.invoicePurchaseOrder)

def receivingLeaf : GroundedLeaf :=
  groundedLeaf "cert-receiving" "ground-receiving"
    (receivingSupportClaim parameters.receivingSupport)

def paymentLeaf : GroundedLeaf :=
  groundedLeaf "cert-payment" "ground-payment"
    (invoicePaymentClaim parameters.invoicePayment)

def registerLeaf : GroundedLeaf :=
  groundedLeaf "cert-register" "ground-register"
    (invoiceRegisterClaim parameters.invoiceRegister)

def positiveTree : MeaningTree :=
  reconciliationTree scope parameters arithmeticLeaf purchaseOrderLeaf
    receivingLeaf paymentLeaf registerLeaf

theorem positive_reconciliation_tree_is_checked :
    checked ruleDefinitionDigest (trustedRegistry parameters) 50 positiveTree =
      true := by
  native_decide

theorem positive_invoice_arithmetic_holds :
    InvoiceArithmeticRecomputed facts.invoice := by
  unfold InvoiceArithmeticRecomputed CapturedRef
  native_decide

theorem positive_purchase_order_arithmetic_holds :
    PurchaseOrderArithmeticRecomputed facts.purchaseOrder := by
  unfold PurchaseOrderArithmeticRecomputed CapturedRef
  native_decide

theorem positive_receipt_capture_holds :
    ReceiptCapturedNormalized facts.receiving := by
  unfold ReceiptCapturedNormalized CapturedRef
  native_decide

theorem positive_posted_payment_capture_holds :
    PaymentCapturedPosted facts.payment := by
  unfold PaymentCapturedPosted CapturedRef
  native_decide

theorem positive_register_count_holds :
    RegisterOccurrenceCounted facts.invoiceRegister := by
  unfold RegisterOccurrenceCounted CapturedRef
  native_decide

theorem positive_arithmetic_leaf_meaning :
    reconciliationMeaning describes policy facts parameters
      arithmeticLeaf.scope arithmeticLeaf.claim := by
  have hPolicy : policyPinned policy facts := rfl
  simpa [arithmeticLeaf, groundedLeaf, reconciliationMeaning,
    invoiceArithmeticClaim, invoicePurchaseOrderClaim, receivingSupportClaim,
    invoicePaymentClaim, invoiceRegisterClaim, invoiceAndOrderClaim,
    invoiceAndReceiptClaim, threeSourceClaim, invoiceAndPaymentClaim,
    invoiceIdentityUniqueClaim, identityAndPaymentClaim,
    capturedFieldsAgreeClaim, claim] using
    (And.intro
      (And.intro hPolicy positive_invoice_arithmetic_holds)
      canonical_correspondence_holds.invoiceArithmetic)

theorem positive_purchase_order_leaf_meaning :
    reconciliationMeaning describes policy facts parameters
      purchaseOrderLeaf.scope purchaseOrderLeaf.claim := by
  have hPolicy : policyPinned policy facts := rfl
  simpa [purchaseOrderLeaf, groundedLeaf, reconciliationMeaning,
    invoiceArithmeticClaim, invoicePurchaseOrderClaim, receivingSupportClaim,
    invoicePaymentClaim, invoiceRegisterClaim, invoiceAndOrderClaim,
    invoiceAndReceiptClaim, threeSourceClaim, invoiceAndPaymentClaim,
    invoiceIdentityUniqueClaim, identityAndPaymentClaim,
    capturedFieldsAgreeClaim, claim] using
    (And.intro
      (And.intro hPolicy positive_purchase_order_arithmetic_holds)
      canonical_correspondence_holds.invoicePurchaseOrder)

theorem positive_receiving_leaf_meaning :
    reconciliationMeaning describes policy facts parameters
      receivingLeaf.scope receivingLeaf.claim := by
  have hPolicy : policyPinned policy facts := rfl
  simpa [receivingLeaf, groundedLeaf, reconciliationMeaning,
    invoiceArithmeticClaim, invoicePurchaseOrderClaim, receivingSupportClaim,
    invoicePaymentClaim, invoiceRegisterClaim, invoiceAndOrderClaim,
    invoiceAndReceiptClaim, threeSourceClaim, invoiceAndPaymentClaim,
    invoiceIdentityUniqueClaim, identityAndPaymentClaim,
    capturedFieldsAgreeClaim, claim] using
    (And.intro
      (And.intro hPolicy positive_receipt_capture_holds)
      canonical_correspondence_holds.receivingSupport)

theorem positive_payment_leaf_meaning :
    reconciliationMeaning describes policy facts parameters
      paymentLeaf.scope paymentLeaf.claim := by
  have hPolicy : policyPinned policy facts := rfl
  simpa [paymentLeaf, groundedLeaf, reconciliationMeaning,
    invoiceArithmeticClaim, invoicePurchaseOrderClaim, receivingSupportClaim,
    invoicePaymentClaim, invoiceRegisterClaim, invoiceAndOrderClaim,
    invoiceAndReceiptClaim, threeSourceClaim, invoiceAndPaymentClaim,
    invoiceIdentityUniqueClaim, identityAndPaymentClaim,
    capturedFieldsAgreeClaim, claim] using
    (And.intro
      (And.intro hPolicy positive_posted_payment_capture_holds)
      canonical_correspondence_holds.invoicePayment)

theorem positive_register_leaf_meaning :
    reconciliationMeaning describes policy facts parameters
      registerLeaf.scope registerLeaf.claim := by
  have hPolicy : policyPinned policy facts := rfl
  simpa [registerLeaf, groundedLeaf, reconciliationMeaning,
    invoiceArithmeticClaim, invoicePurchaseOrderClaim, receivingSupportClaim,
    invoicePaymentClaim, invoiceRegisterClaim, invoiceAndOrderClaim,
    invoiceAndReceiptClaim, threeSourceClaim, invoiceAndPaymentClaim,
    invoiceIdentityUniqueClaim, identityAndPaymentClaim,
    capturedFieldsAgreeClaim, claim] using
    (And.intro
      (And.intro hPolicy positive_register_count_holds)
      canonical_correspondence_holds.invoiceRegister)

theorem positive_grounded_leaf_meanings_hold :
    GroundedLeafMeaningsHold
      (reconciliationMeaning describes policy facts parameters)
      positiveTree := by
  apply all_grounded_leaf_meanings_imply_reachable_leaf_meanings
  simpa [positiveTree, reconciliationTree, identityAndPaymentTree,
    invoiceIdentityUniqueTree, invoiceAndPaymentTree, threeSourceTree,
    invoiceAndOrderTree, invoiceAndReceiptTree, AllGroundedLeafMeanings] using
    And.intro
      (And.intro
        (And.intro positive_arithmetic_leaf_meaning
          positive_register_leaf_meaning)
        (And.intro positive_arithmetic_leaf_meaning
          positive_payment_leaf_meaning))
      (And.intro
        (And.intro positive_arithmetic_leaf_meaning
          positive_purchase_order_leaf_meaning)
        (And.intro positive_arithmetic_leaf_meaning
          positive_receiving_leaf_meaning))

theorem positive_end_to_end_semantic_witness :
    checked ruleDefinitionDigest (trustedRegistry parameters) 50 positiveTree =
        true ∧
      GroundedLeafMeaningsHold
        (reconciliationMeaning describes policy facts parameters)
        positiveTree ∧
      reconciliationMeaning describes policy facts parameters scope
        (capturedFieldsAgreeClaim parameters.root) := by
  refine
    ⟨positive_reconciliation_tree_is_checked,
      positive_grounded_leaf_meanings_hold, ?_⟩
  exact checked_reconciliation_with_grounded_meanings_establishes_root
    scope describes parameters 50 arithmeticLeaf purchaseOrderLeaf
    receivingLeaf paymentLeaf registerLeaf policy facts
    canonical_correspondence_holds relationshipAssumptions
    positive_reconciliation_tree_is_checked
    positive_grounded_leaf_meanings_hold

/-!
Hostile substitution 1: a different captured payment artifact cannot fill the
baseline payment slot even when it has the same runtime leaf claim ID.
-/
def alternatePaymentRef : RecordRef :=
  { paymentRef with
      recordId := "PAY-ALT"
      artifactDigest := "sha256:payment-alt" }

def alternatePaymentParameters : String :=
  encodeParameters policy [alternatePaymentRef] none

def alternatePaymentLeaf : GroundedLeaf :=
  groundedLeaf "cert-payment-alt" "ground-payment-alt"
    (invoicePaymentClaim alternatePaymentParameters)

def alternatePaymentTree : MeaningTree :=
  reconciliationTree scope parameters arithmeticLeaf purchaseOrderLeaf
    receivingLeaf alternatePaymentLeaf registerLeaf

theorem substituted_payment_artifact_is_rejected :
    disposition ruleDefinitionDigest (trustedRegistry parameters) 50
      alternatePaymentTree = .unresolved := by
  native_decide

/-!
Hostile substitution 2: a different receiving snapshot cannot replace the
captured receipt leaf.
-/
def changedReceivingRef : RecordRef :=
  { receivingRef with artifactDigest := "sha256:receiving-b" }

def changedReceivingDigestParameters : String :=
  encodeParameters policy [changedReceivingRef] none

def changedReceivingDigestLeaf : GroundedLeaf :=
  groundedLeaf "cert-receiving-other-digest"
    "ground-receiving-other-digest"
    (receivingSupportClaim changedReceivingDigestParameters)

def changedReceivingDigestTree : MeaningTree :=
  reconciliationTree scope parameters arithmeticLeaf purchaseOrderLeaf
    changedReceivingDigestLeaf paymentLeaf registerLeaf

theorem substituted_receiving_digest_is_rejected :
    disposition ruleDefinitionDigest (trustedRegistry parameters) 50
      changedReceivingDigestTree = .unresolved := by
  native_decide

/-!
Hostile substitution 3: an otherwise analogous leaf evaluated under a changed
policy digest cannot enter a root pinned to policy v1.
-/
def changedPolicy : PolicyRef :=
  { policy with policyDigest := "sha256:policy-v2" }

def changedPolicyPaymentParameters : String :=
  encodeParameters changedPolicy [paymentRef] none

def changedPolicyPaymentLeaf : GroundedLeaf :=
  groundedLeaf "cert-payment-other-policy" "ground-payment-other-policy"
    (invoicePaymentClaim changedPolicyPaymentParameters)

def changedPolicyTree : MeaningTree :=
  reconciliationTree scope parameters arithmeticLeaf purchaseOrderLeaf
    receivingLeaf changedPolicyPaymentLeaf registerLeaf

theorem substituted_policy_digest_is_rejected :
    disposition ruleDefinitionDigest (trustedRegistry parameters) 50
      changedPolicyTree = .unresolved := by
  native_decide

/-!
Hostile substitution 4: exact claim parameters from another scope still cannot
cross the case/session boundary.
-/
def otherScope : Scope :=
  { scope with target := "synthetic-case-002" }

def otherScopePaymentLeaf : GroundedLeaf :=
  groundedLeaf "cert-payment-other-scope" "ground-payment-other-scope"
    (invoicePaymentClaim parameters.invoicePayment) otherScope

def otherScopeTree : MeaningTree :=
  reconciliationTree scope parameters arithmeticLeaf purchaseOrderLeaf
    receivingLeaf otherScopePaymentLeaf registerLeaf

theorem substituted_scope_is_rejected :
    disposition ruleDefinitionDigest (trustedRegistry parameters) 50
      otherScopeTree = .unresolved := by
  native_decide

/-!
Hostile register case 1: the typed relation itself rejects a supplied register
that contains the selected invoice identity twice.  Runtime contract issuance
must therefore refuse to manufacture this grounded meaning.
-/
def duplicateRegister : InvoiceRegister :=
  { register with
      ref := { registerRef with artifactDigest := "sha256:register-duplicate" }
      entries := register.entries ++ [invoiceIdentity invoice]
      occurrenceCount := 2 }

theorem duplicate_register_does_not_establish_unique_identity :
    ¬ RegisterOccurrenceCounted duplicateRegister := by
  unfold RegisterOccurrenceCounted CapturedRef
  native_decide

def duplicateRegisterParameters : String :=
  encodeParameters policy [duplicateRegister.ref]
    (some duplicateRegister.targetIdentity)

def duplicateRegisterLeaf : GroundedLeaf :=
  groundedLeaf "cert-register-duplicate" "ground-register-duplicate"
    (invoiceRegisterClaim duplicateRegisterParameters)

def duplicateRegisterTree : MeaningTree :=
  reconciliationTree scope parameters arithmeticLeaf purchaseOrderLeaf
    receivingLeaf paymentLeaf duplicateRegisterLeaf

theorem duplicate_register_leaf_is_rejected_by_pinned_tree :
    disposition ruleDefinitionDigest (trustedRegistry parameters) 50
      duplicateRegisterTree = .unresolved := by
  native_decide

/-!
Hostile register case 2: even a register with an occurrence count of one
cannot replace the baseline snapshot when its exact artifact digest differs.
-/
def changedRegisterRef : RecordRef :=
  { registerRef with artifactDigest := "sha256:register-b" }

def changedRegisterDigestParameters : String :=
  encodeParameters policy [changedRegisterRef] (some register.targetIdentity)

def changedRegisterDigestLeaf : GroundedLeaf :=
  groundedLeaf "cert-register-other-digest" "ground-register-other-digest"
    (invoiceRegisterClaim changedRegisterDigestParameters)

def changedRegisterDigestTree : MeaningTree :=
  reconciliationTree scope parameters arithmeticLeaf purchaseOrderLeaf
    receivingLeaf paymentLeaf changedRegisterDigestLeaf

theorem substituted_register_digest_is_rejected :
    disposition ruleDefinitionDigest (trustedRegistry parameters) 50
      changedRegisterDigestTree = .unresolved := by
  native_decide

end Fixture

end RiddleProofKernel.SyntheticRecordReconciliation
