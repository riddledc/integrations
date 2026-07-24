import RiddleProofKernel.SyntheticRecordReconciliation

namespace RiddleProofKernel.WorkbookInvoiceExtraction

open SyntheticRecordReconciliation

/-!
A narrow formal boundary between a private XLSX adapter and the existing
synthetic invoice-reconciliation arithmetic.

The runtime adapter is responsible for producing the typed projection modeled
here from one exact workbook specimen under one independently pinned worksheet
schema.  The projection retains both the formula text observed in a required
cell and its cached numeric result.  Acceptance additionally supplies the
independently recomputed numeric result.  Lean proves that exact
formula/cached/recomputed agreement and exact normalization are sufficient to
feed the existing `MultiLineArithmeticRecomputed` predicate without changing
its meaning.

Lean does not parse ZIP or OOXML bytes, inspect workbook relationships,
authenticate cell addresses or values, evaluate Excel formulas, establish that
a cached result came from Excel, detect macros or external links, enforce
JavaScript safe-integer or resource bounds, compute hashes, prove hash
collision resistance, inspect the filesystem, or establish capture
currentness.  Those remain runtime extraction, hostile-input, cryptographic,
and local-capture obligations.
-/

structure WorkbookSchemaRef where
  schemaId : String
  schemaVersion : String
  schemaDigest : String
  deriving DecidableEq, Repr, BEq

structure WorkbookFormulaCell where
  address : String
  expectedFormula : String
  observedFormula : String
  cachedMinor : Nat
  deriving DecidableEq, Repr, BEq

structure WorkbookPricedLine where
  lineId : String
  itemId : String
  quantity : Nat
  unitPriceMinor : Nat
  extension : WorkbookFormulaCell
  deriving DecidableEq, Repr, BEq

structure WorkbookExtractionBinding where
  workbookSource : RecordRef
  normalizedInvoice : RecordRef
  schema : WorkbookSchemaRef
  deriving DecidableEq, Repr, BEq

structure WorkbookInvoiceProjection where
  source : RecordRef
  schema : WorkbookSchemaRef
  worksheetName : String
  lines : List WorkbookPricedLine
  subtotal : WorkbookFormulaCell
  taxAddress : String
  taxMinor : Nat
  total : WorkbookFormulaCell
  normalizedInvoice : RecordRef
  extractionBinding : WorkbookExtractionBinding
  normalizedLines : List PricedLine
  normalizedSubtotalMinor : Nat
  normalizedTaxMinor : Nat
  normalizedTotalMinor : Nat
  deriving DecidableEq, Repr, BEq

def formulaCellAgrees
    (cell : WorkbookFormulaCell)
    (recomputedMinor : Nat) : Prop :=
  cell.address ≠ "" ∧
    cell.expectedFormula ≠ "" ∧
    cell.observedFormula = cell.expectedFormula ∧
    cell.cachedMinor = recomputedMinor

def workbookLineToPricedLine
    (line : WorkbookPricedLine) : PricedLine where
  lineId := line.lineId
  itemId := line.itemId
  quantity := line.quantity
  unitPriceMinor := line.unitPriceMinor
  extendedMinor := line.extension.cachedMinor

def statedWorkbookExtensionSubtotal
    (lines : List WorkbookPricedLine) : Nat :=
  (lines.map (fun line => line.extension.cachedMinor)).sum

/-!
This proposition begins after runtime extraction.  In particular,
`expectedFormula` is meaningful only because the runtime correspondence test
binds it to the independently pinned worksheet schema; Lean does not infer
that trust relationship from the string itself.
-/
def WorkbookFormulaArithmeticExact
    (projection : WorkbookInvoiceProjection) : Prop :=
  projection.lines ≠ [] ∧
    (∀ line ∈ projection.lines,
      formulaCellAgrees line.extension
        (line.quantity * line.unitPriceMinor)) ∧
    formulaCellAgrees projection.subtotal
      (statedWorkbookExtensionSubtotal projection.lines) ∧
    formulaCellAgrees projection.total
      (projection.subtotal.cachedMinor + projection.taxMinor)

/-!
The extraction binding retains the workbook source, normalized invoice, and
schema as distinct identities.  In particular, this model does not claim that
the normalized-invoice digest equals or must change with the workbook digest.
Runtime remains responsible for constructing this exact correspondence from
the captured workbook bytes.
-/
def WorkbookNormalizationBound
    (projection : WorkbookInvoiceProjection) : Prop :=
  projection.extractionBinding.workbookSource = projection.source ∧
    projection.extractionBinding.normalizedInvoice =
      projection.normalizedInvoice ∧
    projection.extractionBinding.schema = projection.schema ∧
    projection.normalizedLines =
      projection.lines.map workbookLineToPricedLine ∧
    projection.normalizedSubtotalMinor =
      projection.subtotal.cachedMinor ∧
    projection.normalizedTaxMinor = projection.taxMinor ∧
    projection.normalizedTotalMinor = projection.total.cachedMinor

def WorkbookProjectionBound
    (expectedSource : RecordRef)
    (expectedSchema : WorkbookSchemaRef)
    (projection : WorkbookInvoiceProjection) : Prop :=
  projection.source = expectedSource ∧
    projection.schema = expectedSchema ∧
    projection.worksheetName ≠ "" ∧
    projection.taxAddress ≠ "" ∧
    WorkbookFormulaArithmeticExact projection ∧
    WorkbookNormalizationBound projection

theorem workbook_projection_bound_uses_exact_source_and_schema
    (expectedSource : RecordRef)
    (expectedSchema : WorkbookSchemaRef)
    (projection : WorkbookInvoiceProjection)
    (hBound :
      WorkbookProjectionBound expectedSource expectedSchema projection) :
    projection.source = expectedSource ∧
      projection.schema = expectedSchema := by
  exact ⟨hBound.1, hBound.2.1⟩

theorem accepted_workbook_projection_implies_multi_line_arithmetic
    (expectedSource : RecordRef)
    (expectedSchema : WorkbookSchemaRef)
    (projection : WorkbookInvoiceProjection)
    (hBound :
      WorkbookProjectionBound expectedSource expectedSchema projection) :
    MultiLineArithmeticRecomputed
      projection.normalizedLines
      projection.normalizedSubtotalMinor
      projection.normalizedTaxMinor
      projection.normalizedTotalMinor := by
  rcases hBound with
    ⟨_hSource, _hSchema, _hWorksheet, _hTaxAddress,
      hArithmetic, hNormalization⟩
  rcases hArithmetic with
    ⟨hLinesNonempty, hLineArithmetic, hSubtotalArithmetic,
      hTotalArithmetic⟩
  rcases hNormalization with
    ⟨_hBoundWorkbook, _hBoundInvoice, _hBoundSchema,
      hNormalizedLines, hNormalizedSubtotal, hNormalizedTax,
      hNormalizedTotal⟩
  rw [hNormalizedLines, hNormalizedSubtotal, hNormalizedTax,
    hNormalizedTotal]
  have hMappedNonempty :
      projection.lines.map workbookLineToPricedLine ≠ [] := by
    simpa using hLinesNonempty
  have hMappedExtensions :
      EveryLineExtensionExact
        (projection.lines.map workbookLineToPricedLine) := by
    intro normalizedLine hNormalizedMember
    rw [List.mem_map] at hNormalizedMember
    rcases hNormalizedMember with ⟨sourceLine, hSourceMember, rfl⟩
    exact (hLineArithmetic sourceLine hSourceMember).2.2.2
  refine ⟨hMappedNonempty, hMappedExtensions, ?_, ?_⟩
  · simpa [statedExtensionSubtotal, statedWorkbookExtensionSubtotal,
      workbookLineToPricedLine] using hSubtotalArithmetic.2.2.2
  · exact hTotalArithmetic.2.2.2

/-!
When the extraction binding retains the exact captured workbook reference, an
immutable workbook replacement cannot silently retain the old binding.  The
normalized-invoice reference may remain equal when two byte-distinct
workbooks contain the same facts; the source-bound specimen identity still
changes.  This is the XLSX bridge needed by the existing replacement and
application-projection theorems.

The premise is inequality of exact `RecordRef` values.  Lean does not derive
that inequality from two byte strings or two digests.
-/
theorem changed_workbook_ref_requires_changed_extraction_binding
    (oldProjection newProjection : WorkbookInvoiceProjection)
    (hOldBound : WorkbookNormalizationBound oldProjection)
    (hNewBound : WorkbookNormalizationBound newProjection)
    (hChanged : newProjection.source ≠ oldProjection.source) :
    newProjection.extractionBinding ≠
      oldProjection.extractionBinding := by
  intro hBindingEqual
  apply hChanged
  have hBoundSourceEqual :
      newProjection.extractionBinding.workbookSource =
        oldProjection.extractionBinding.workbookSource := by
    exact congrArg WorkbookExtractionBinding.workbookSource hBindingEqual
  calc
    newProjection.source =
        newProjection.extractionBinding.workbookSource :=
      hNewBound.1.symm
    _ = oldProjection.extractionBinding.workbookSource :=
      hBoundSourceEqual
    _ = oldProjection.source := hOldBound.1

end RiddleProofKernel.WorkbookInvoiceExtraction
