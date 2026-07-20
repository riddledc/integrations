# Building a private Riddle Proof client

Riddle Proof supplies reusable proof machinery. A consuming application owns
the vocabulary, workflow, rules, adapters, people, and operational meaning that
instantiate that machinery.

This boundary is structural:

```text
public packages                         client-controlled project
---------------                         -------------------------
stable snapshots                        domain vocabulary
grounded evidence                       surface and model adapters
rule and evidence trust roots    --->   pinned rule/evidence bundles
checked-meaning composition             private payload schema
currentness and replay                  client-specific conclusions
packet and receipt binding              privileged output
signed captures and claims              signer roles and claim meaning
```

Public package code must not acquire client claim names, premise graphs,
provider choices, actor roles, or conclusion semantics merely because one
client uses them.

## Minimal package set

A local, offline client starts with exact released versions of:

- `@riddledc/riddle-proof-core` for deterministic evaluation, grounding,
  checked meaning, packet binding, and cryptography; and
- `@riddledc/riddle-proof-local` only when the client must capture explicitly
  selected local files.

Do not install the compatibility facade, hosted client, browser runner, or
unrelated packs unless the client explicitly requires and approves those
capabilities. Pin versions and integrity, verify provenance, and inspect the
actual installed dependency closure.

## Instantiation sequence

1. **Define the subject.** Capture an exact snapshot through a capability-
   appropriate adapter and retain only the references permitted by the
   client's artifact policy.
2. **Pin authority independently.** Provision the expected rule-trust-root and
   evidence-trust-root IDs, versions, and complete bundle digests outside run
   input. A producer may reference these roots but may not select substitutes.
3. **Ground narrow facts.** Use declarative evidence profiles and signed
   captures to derive narrowly named claims from exact observations.
4. **Compose meaning.** Use checked-meaning rules from the independently pinned
   rule root. The consuming client supplies the exact expected root claim and
   replays every reachable grounded premise.
5. **Check currentness.** Re-capture or otherwise verify the exact subject under
   an explicit consumer time, age bound, and future-skew bound. Historical
   replay and present usefulness are separate decisions.
6. **Bind private output.** Store sensitive or domain-specific content only in
   a client-controlled private packet. Use
   `digestRiddleProofPrivatePacketBytes` when a checked-meaning claim must bind
   the packet digest before the final receipt exists; the helper validates the
   packet envelope without manufacturing a provisional receipt. Then use
   `createRiddleProofPacketReceipt` to bind its exact bytes and content-free
   projection to the subject, roots, execution metadata, enforced execution-
   policy digest, checked-root certificate, currentness certificate, and
   issuance chronology. Receipt creation rejects an execution or entry issuer
   outside the supplied policy.
7. **Verify independently.** A consumer separately verifies the checked-
   meaning closure against its independently reconstructed root claim and rule,
   checks currentness, then derives `resolved_certificate_ids` from that
   successfully matched closure. Packet verification requires the resolved set
   to contain the root, currentness certificate, and every packet evidence
   link, and recomputes the execution-policy digest from an independently
   supplied policy. `verifyRiddleProofPacketReceipt` does not replay the closure
   or confer meaning on a client-selected conclusion.
8. **Model signer acts as claims when needed.** Define an ordinary client claim
   and ground it in a signed capture using the same evidence machinery as any
   other grounded claim. The client owns the signer's role, the claim's
   meaning, and any downstream effect; public core adds no specialized layer.

## Output separation

Keep two output classes:

- **machine records:** opaque identifiers, digests, content-free projections,
  certificate references, fixed diagnostic codes, and execution metadata; and
- **private output:** source-derived content, interpretation, proposals,
  questions, or any other material governed by the client's confidentiality
  policy.

The public core receives private packet bytes only for deterministic binding.
It does not log, transmit, interpret, or retain them.

## Formal boundary

The public Lean kernel proves domain-neutral invariants: exact trust-root
matching, exact payload/receipt binding, N-ary composition shape, replay and
currentness relations, chronology, and exact signed-capture linkage.

A client must maintain its own formal instantiation when it changes what a
premise or conclusion means, how conclusions compose, which evidence is
required, or which client-defined claim permits a downstream action. Runtime
conformance vectors must accompany that model. Filesystem, network, parsing,
cryptographic implementation, clocks, and outside-world fidelity remain
runtime and operational trust boundaries.

## Handoff checklist

Before a client processes real material, require:

- exact package versions, integrity, provenance, and dependency closure;
- independently provisioned rule and evidence roots;
- capability declarations and destination allowlists for every adapter;
- an approved execution policy and protected output directories;
- synthetic positive and hostile regression cases;
- a blind deterministic replay by a fresh consumer; and
- a client-owned semantic model whose runtime vectors agree with its Lean
  instantiation.

The public package family is ready for handoff when a client can perform this
sequence without modifying public core or importing unrelated capabilities.
