import { canonicalDigest, deepFreeze } from "./canonical.js";

export const INVOICE_WORKBOOK_SPECIMEN_BINDING = deepFreeze({
  schema: "riddle-proof.synthetic-invoice-workbook-specimen-binding.v1",
  binding_id: "riddle-proof.synthetic-invoice-workbook-specimen",
  binding_version: "1",
});

export function computeInvoiceWorkbookSpecimenDigest(input: {
  workbook_policy: {
    id: string;
    version: string;
    digest: string;
  };
  workbook_digest: string;
  normalized_invoice_digest: string;
  normalized_record_set_digest: string;
  extraction_binding_digest: string;
}): string {
  return canonicalDigest({
    ...INVOICE_WORKBOOK_SPECIMEN_BINDING,
    workbook_policy: input.workbook_policy,
    workbook_digest: input.workbook_digest,
    normalized_invoice_digest: input.normalized_invoice_digest,
    normalized_record_set_digest: input.normalized_record_set_digest,
    extraction_binding_digest: input.extraction_binding_digest,
  });
}
