# Synthetic commercial-record reconciliation

This offline experiment is a deliberately narrow compositional playground for
commercial records. It uses synthetic invoice, purchase-order, receipt,
payment, and invoice-register data. It is not an implementation of accounts
payable operations and contains no company rules or real records.

The fixed synthetic policy is intentionally strict:

- the invoice's line extensions, subtotal, tax, and total are arithmetically
  consistent;
- the purchase order's line extensions, subtotal, tax, and total are
  arithmetically consistent;
- invoice and purchase order have exactly matching buyer, supplier, PO,
  currency, payment terms, line terms, quantities, and total;
- invoice and receipt have exactly matching buyer, supplier, PO, SKUs, and
  quantities;
- the captured payment record has `posted` status, and invoice and payment have
  exactly matching buyer, supplier, invoice, currency, and amount;
- the invoice identity occurs once in the exact supplied invoice register.

Every leaf and composition carries the same `policy_id`, `policy_version`, and
full SHA-256 `policy_digest`. The digest covers the complete versioned policy
descriptor, including its express non-conclusions. A separately valid leaf
under a changed same-ID/version policy cannot enter this pyramid.

Those grounded leaves compose as:

```text
invoice arithmetic ─┬─ invoice ↔ PO terms ──────┐
                    │                            ├─ three-record match ─┐
PO capture ─────────┘                            │                      │
                    ├─ invoice ↔ receipt qty ────┘                      │
receipt capture ────┘                                                   │
                                                                        ├─ captured fields agree
invoice arithmetic ─┬─ identity unique in supplied register ────────────┤
invoice register ───┘                                                   │
                                                                        │
invoice arithmetic ─┬─ invoice ↔ payment amount ────────────────────────┘
payment capture ────┘
```

The executable hostile cases reject:

- a separately signed PO with the same total but the wrong SKU;
- a separately signed payment in the wrong currency;
- a separately signed partial receipt;
- an internally consistent but over-invoiced invoice;
- a duplicate invoice identity in the supplied register;
- a separately signed record from another reconciliation scope;
- substituted signed records that do not match the other records;
- a changed same-ID/version policy digest;
- a permissive same-ID/version rule registration or missing trusted rule;
- a substituted grounded contract registration or expected contract ref;
- changed inline bytes and signature tampering.

Changing the payment-record bytes and its capture identity reuses the exact
invoice, PO, receipt, and register leaves plus the three-record and
invoice-identity branches; only `payment_digest` changes in the root claim. An
alternate invoice-record snapshot and capture reuses the exact PO, receipt,
payment, and register leaves; only `invoice_digest` changes in its root claim.
Exact recomposition is deterministic.

## Pinned implementation identities

The external verifier reference does not hash only the top-level callback. Its
implementation digest covers a canonical, versioned source artifact containing
the callback, every local validation/hash/parsing helper it invokes, relevant
constants, and named Node runtime primitives. The collector implementation
digest covers a canonical, versioned protocol descriptor specifying its input
boundary, serialization, artifact roles, manifest binding, signing steps, and
capabilities.

Those digests precisely pin the definitions supplied to this experiment. They
do not independently attest that Node, the compiler, operating system, capture
host, or signing key behaved honestly. Those remain outside this fixture's
trust boundary.

## Meaning boundary

The final `captured-fields-agree-under-policy` root means only that the exact
captured fields agree under the caller-pinned synthetic policy and that the
proof DAG replays under independently supplied signer, verifier, contract,
rule, and policy identities.

It does **not** mean that any record is genuine, authorized, legally valid,
fraud-free, complete outside the supplied register, approved to pay, or proof
that money actually moved. A production integration would need independently
governed capture adapters and domain-specific contracts for those meanings.

## Run

From the repository root:

```sh
pnpm --filter @riddledc/riddle-proof-core build
node --require ./scripts/deny-network.cjs experiments/semantic-compaction/commercial-record-reconciliation/commercial-record-reconciliation.test.mjs
```
