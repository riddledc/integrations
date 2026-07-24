# Invoice reconciliation workbench

This is a private, local client of the Riddle Proof machinery. It demonstrates
one deliberately narrow workflow over public synthetic data:

1. Capture one exact pinned XLSX invoice workbook, purchase order, and receipt
   as one immutable specimen record set.
2. Require the exact worksheet layout, recompute every formula from its input
   cells, compare the cached values, and produce one canonical invoice.
3. Bind that invoice to the exact workbook and record set so any source change
   makes the prior result historical.
4. Recompute line extensions, subtotals, stated tax arithmetic, and totals in
   integer minor units.
5. Check exact identities, currency, terms, line items, prices, quantities, and
   totals across the three normalized records.
6. If the one supported over-invoicing case is present, create a new XLSX
   invoice revision through an exact app-owned correction.
7. Check the new record set afresh, reusing the unchanged purchase-order and
   receipt branches only while their captures remain within the one-hour
   freshness window; otherwise issue fresh certificates for those bytes.

The app is outside the publishable npm workspace. It depends only on
`@riddledc/riddle-proof-core`, `@riddledc/riddle-proof-local`, and the private
application-projection experiment. It has no hosted Riddle client, Playwright,
model adapter, subprocess, or outbound-network path.

## Run the real demo

From the repository root:

```sh
pnpm run demo:invoice-reconciliation-workbench
```

Open the printed one-time loopback URL. The token is moved into port-scoped
session storage and removed from the address bar. Then:

1. Select **Check current record set**. The invoice's own arithmetic passes,
   while three precise relationships fail because line 2 invoices 12 units and
   the purchase order and receipt each state 10.
2. Select **Create corrected invoice revision**. The app writes
   `invoice.r2.xlsx` without overwriting revision 1. It re-extracts the written
   workbook and requires the normalized invoice to equal the typed correction
   exactly. The new revision has no inherited result.
3. Check the new record set. All 11 requirements pass. The UI identifies the
   exact PO and receipt branches that were reused or freshness-refreshed and
   the invoice-dependent branches that were checked again.
4. Open **Audit** only if digests, certificate IDs, hashed nonce IDs, signed
   bundle IDs, and replay status are useful.

The workbench path must not already exist. A default run creates a fresh private
directory and retains it after shutdown so the two immutable invoice revisions
can be inspected. Directories are mode `0700`; record files are mode `0600`.

## Verify it

```sh
pnpm run verify:invoice-reconciliation-workbench
```

That command prepares the exact local dependency closure, scans the private
capability boundary, builds the workbench, runs the deterministic and hostile
tests, and builds the Lean kernel.

The hostile suite includes stale formula caches, equivalent-but-unapproved
formulas, unsafe numeric encodings, macros, external relationships, arbitrary
sheet layouts, XML attacks, ZIP corruption and decompression limits, as well
as wrong SKU with unchanged totals, wrong currency, partial receipt,
record-role substitution, changed policy, stale files, raw-byte/signature/nonce
tampering, an old closure offered for a new subject, caller-supplied correction
fields, symlinked fixtures/workspaces, and pre-existing output preservation.

## Quiet proof plumbing

The ordinary interface shows documents, calculations, mismatches, the exact
bounded correction, immutable history, and reused, freshness-refreshed, or
recomputed branches.
It does not expose nonces, signatures, keys, certificate bodies, raw proof
closures, or record bytes.

The explicit audit projection is content-light. It contains the `digest_only`
snapshot receipt, pinned policy identity, proof and certificate IDs, hashed
nonce IDs, signed bundle IDs, deterministic replay result, and XLSX extraction
binding identities. It contains no filenames, workstation paths, workbook or
document content, cells, formulas, cached values, raw nonce, raw signature,
private key, inline artifact, or authoritative closure.

Proof and replay material are process-local in this demo; this is not a
restartable proof store. The `records/` directory is the only durable output,
and it contains only the synthetic input copies and app-created XLSX invoice
revision.

## Exact scope

The installed policy establishes only that:

- the selected XLSX workbook bytes were captured and deterministically
  extracted under one exact pinned synthetic worksheet profile;
- the resulting canonical JSON invoice digest is bound to that workbook,
  extraction trace, and normalized record set;
- declared line-extension, subtotal, and stated-tax arithmetic was recomputed;
- the declared fields across this exact invoice, purchase order, and receipt
  have the reported equalities or differences;
- the proof graph replayed under the pinned runtime registrations; and
- a displayed conclusion is current for the selected bytes at the instant of a
  fresh stable recapture.

It does **not** establish authenticity, authority, tax or accounting
correctness, fraud absence, completeness outside the three selected records,
approval to pay, or actual movement of money. There is no legal, human-review,
or payment-approval state in the generic Riddle machinery.

This client accepts one exact synthetic XLSX invoice profile plus the explicit
purchase-order and receipt JSON schemas. Arbitrary workbook layouts, PDF,
DOCX, email, OCR, partial-receipt policy, tolerances, credits, and payment
records are intentionally excluded.

## Lean boundary

Lean proves the generic multi-line minor-unit arithmetic shape, including exact
line extensions, list subtotal, and stated-tax total; concrete two-line
theorems correspond to both the failing invoice and corrected PO target. It
also proves the declared three-source composition premises, preservation of
independent PO and receipt meanings across invoice replacement, invalidation
of invoice-dependent conclusions, and the requirement for a replacement-bound
report.

Lean does not parse ZIP, XML, XLSX, or JSON, or prove the runtime's package
profile, safe-integer bounds, canonical encoding, hashing, signatures, file
currentness, source authenticity, or the truth of facts outside the captured
records. Those remain explicit runtime and trust-boundary obligations.
