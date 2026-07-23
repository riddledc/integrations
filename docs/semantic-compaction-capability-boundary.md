# Semantic compaction: capability-boundary findings

## Finding

Riddle Proof can do something more useful than bundle checks: it can turn a
replayed subgraph into a stable, content-addressed checkpoint, reuse that
checkpoint in later conclusions, replace only the current conclusions
reachable from a changed fact, and still expand any root into its exact signed
evidence frontier.

That is semantic compaction, not byte compression. The evidence is not erased;
the higher claim becomes the small interface while the complete derivation
remains replayable. Whether an agent feels inclined to recheck it is not part
of the evidence.

The capability is real only when all of these hold:

1. The root has a narrow operational meaning beyond “all checks passed.”
2. Claims of actual behavior are grounded by exact captured bytes or
   independently replayed observations. A producer boolean can ground only the
   narrower fact that its report asserted that value.
3. Replay deterministically matches a consumer-supplied root, rules, signer
   policy, scope, and evidence configuration rather than trusting authority
   material carried by the proof packet.
4. Replacing one changed leaf preserves every unaffected certificate ID and
   changes every recomposed dependent conclusion. The old closure remains a
   valid historical claim; currentness policy decides whether it is still
   usable for the present state.
5. A preserved intermediate can be consumed by another branch or another
   root without regrounding it.
6. Expansion recovers the exact DAG and grounded frontier.
7. Freshly signed but wrong-scope, wrong-subject, weaker-rule, or
   attacker-authorized substitutions fail—not just corrupted signatures.

## Four experiments

### Browser state transition — selected implementation

```text
before + action/after -> transition
transition + reload readback -> survived reload
transition + fresh-context readback -> visible in fresh context
survived reload + visible in fresh context -> durable transition observed
```

The shared `transition` node deliberately fans out into two consumers. A
fresh-context-only change must preserve the before, action, reload,
transition, and survived-reload certificate IDs while changing the
fresh-context branch and root. Four distinct signed browser bundles bind the
same repository, revision, environment, target, and proof attempt; the
transition ID must equal that proof attempt, and four distinct digests pin the
exact profile definitions. Distinct does not mean four independent signers or
sensors: the end-to-end test intentionally uses one runner and one signer.

Signed capture times enforce the partial order `before <= action <= reload`
and `action <= fresh`; they do not order the two readbacks. Root meaning: the
exact declared before and action/after profiles were observed, followed by the
exact reload and fresh-context readback profiles, for this browser scope. It
does not establish database truth or metaphysical causation.

This won the implementation slot because Playwright capture against a
synthetic local state server, signed bundles, checked-meaning replay, and the
sealed-profile pyramid already exist. The experiment closes two genuine
grounding gaps: a profile name alone permitted a weaker same-name profile, and
packet-supplied replay contexts could purport to authorize exact-looking claims.
Replay now reconstructs verifier and contract contexts from independently
supplied authority and deterministically reassesses the exact signed profile
and evidence.

The conformance test now holds the four source profile definitions fixed and
applies them unchanged to three separately scoped specimens. The broken
specimen fails the immediate action profile and cannot seal it. The transient
specimen seals the immediate action but fails reload and fresh-context
readback, so it cannot produce the durable root. The durable specimen seals all
four profiles and composes the root. Profile normalization includes the target
URL, so the sealed profile digests are target-specific; what stays fixed across
the specimens is the source suite, guarded by raw fixture hashes and loaded as
deeply frozen data.

### Software artifact/release — strong cross-system prototype

```text
source snapshot + passing-result report -> source/report identity bound
candidate bytes/build record + registry-copy/provenance record -> byte match
source/report identity bound + byte match -> release evidence packet bound
```

The decisive reuse case is a monorepo release set: multiple package roots can
reuse the exact source/report branch. A tarball-only change leaves that branch
untouched; a report change leaves the artifact branch untouched. Pinned
verifiers compute digests from captured tarball bytes rather than trusting JSON
that merely states a digest.

Root meaning: captured registry-copy bytes match exact candidate bytes, and the
candidate build record and passing-result report name the same captured source
identity. The prototype deliberately does **not** upgrade producer fields such
as `passed`, `built`, or `verified` into independently established facts. It
also does not prove publication, provenance validity, reproducible build,
authorization, deployment, or absence of bugs.

This may have the largest eventual economic leverage because it crosses Git,
test, build, and registry trust zones. The current experiment is synthetic,
uses one experimental signing authority, and binds records rather than running
a real CI suite or verifying registry provenance. Independent authorities plus
real CI and registry sensors remain future work.

### Synthetic document transformation — exact-structure boundary

```text
source-valid + transform-admissible -> admissible inputs
exact transform + output current -> exact current output
admissible inputs + exact current output -> conforming transformation
faithful render + render current -> faithful current render
conforming transformation + faithful current render -> presentable transform
```

Pinned verifiers recompute an exact JSON transformation and deterministic text
render from captured bytes. A render-only change is detected; recomposition
preserves the complete source/spec/output transformation subtree while
replacing render currentness, render fidelity, and their reachable roots. The
old signed closure remains replayable as a historical claim.

Root meaning: at the recorded checks, an admissible exact structured transform
had the expected deterministic render. It does not establish natural-language
equivalence, legal correctness, or visual fidelity for DOCX/PDF.

This is valuable precisely because it marks the boundary: exact structured
meaning composes cleanly; prose meaning still needs client-owned rules and
stronger sensors.

### Synthetic commercial records — compositional reconciliation

The public-synthetic invoice, purchase-order, receiving, payment, and invoice
register example gives deterministic composition a more substantial pyramid:

```text
invoice arithmetic + invoice↔PO agreement -> invoice/PO branch
invoice arithmetic + invoice↔receiving support -> invoice/receiving branch
invoice/PO branch + invoice/receiving branch -> three-source branch
invoice arithmetic + invoice↔payment agreement -> payment branch
invoice arithmetic + exact-register uniqueness -> identity branch
identity branch + payment branch + three-source branch -> captured fields agree
```

All five meanings are relative to an independently pinned synthetic policy ID,
version, and digest. The final root is
`riddle-proof.commercial-record.captured-fields-agree-under-policy`: the exact
captured fields satisfy the declared arithmetic, PO, receiving, payment, and
exact supplied-register relationships under that policy. It does not establish
record authenticity, authorization, fraud absence, completeness beyond the
supplied register, accounting suitability, approval to pay, or movement of
money.

The runtime experiment deterministically replays and explains the full
frontier, rejects wrong-SKU, wrong-currency, partial-receipt, over-invoice,
duplicate-register, wrong-scope, changed-policy, byte-tamper, and
signature-tamper cases, and demonstrates two forms of reuse. Replacing only
the payment record and its capture identity preserves the three-source and
invoice-identity branches, while a second invoice snapshot can reuse the same
PO, receiving, payment, and register captures. The example is a
theory/composition playground, not an accounts-payable product or workflow
lifecycle.

## What is genuinely unlocked

- Incremental proof: after a currentness check detects changed input, re-ground
  and recompose only the affected dependency frontier.
- Reusable meaning: one verified intermediate can feed multiple later claims
  without duplicating its evidence graph.
- Bounded handoff: a consumer matches one narrow root while retaining a
  deterministic route back to every premise and digest.
- Cross-sensor binding: facts from different phases or systems become useful
  together only when their pinned identities agree.
- Auditable forgetting: ordinary work can proceed from the checkpoint while
  replay and expansion remain available when the boundary is questioned.

## What is still only bundled checking

- One signed `passed: true` object.
- A renamed conjunction whose intermediate is never reused.
- Rerunning every leaf after every change.
- A root with no independently pinned consumer expectation.
- An agent saying it understands or does not wish to recheck the work.

## Lean boundary

The existing Lean checked-meaning kernel models the shared conjunction, scope
preservation, exact-premise, and evidence-retention algebra exercised by all
four experiments, so the experiments do not add a generic lifecycle layer. The
browser specialization proves that its abstract fan-out root means exactly the
four supplied checkpoint meanings and that its four modeled rules are sound
under that interpretation.

`SyntheticRecordReconciliation.lean` separately keeps five intrinsic grounded
meanings distinct from four cross-record relationships. The leaves mean
invoice arithmetic, purchase-order arithmetic, normalized receipt capture,
posted payment capture, and an exact supplied-register occurrence count.
Invoice-to-PO, invoice-to-receipt, invoice-to-payment, and register-target
agreement enter only through explicit materialization assumptions. An explicit
canonical correspondence relates every opaque parameter string to the policy,
record references, artifact digests, and register target it names.

The exact root theorem exposes those facts, relationships, and the root
parameter binding without assuming them. Separate rule-soundness and checked
tree theorems consume the correspondence and materialization hypotheses. The
module also proves payment-independence of the three-source and
invoice-identity branches, payment replacement recomposition, positive
end-to-end non-vacuity, and rejection of hostile record-digest, policy, scope,
duplicate-register, and register-digest substitutions.

The runtime commercial-record DAG has six N-ary, template-materialized
compositions. Lean's smaller binary model has seven rules because it introduces
one explicit formal-only identity-plus-payment association before its final
rule. Claim IDs are shared where applicable, but neither this model nor the
browser model is definitionally equal to the TypeScript rule materializations.
Lean intentionally starts after grounded meanings have been supplied.
Canonical JSON, SHA-256, signatures, verifier and source authenticity,
currentness, accounting suitability, browser observation, deterministic
evidence reassessment, consumer authority reconstruction, exact profile bytes,
bundle/profile distinctness, transition/scope binding, and signed chronology
remain runtime or trust-boundary obligations.

## Remaining boundary

Riddle Proof does not discover the right model. A checked root says that exact
allowlisted rules accepted exact replayed observations. The signer, sensor,
verifier implementation, rule adequacy, and outside-world correspondence remain
explicit trust roots.

Selective recomposition is currently demonstrated, not scheduled: callers must
retain closures and choose which changed leaves to recapture. More precisely,
this is the “selective invalidation” test at the dependency-planning layer: the
experiments compute the affected frontier and build replacement roots; they do
not revoke immutable historical certificates.

The experiments also use installed `external_registry` verifier callbacks. A
declared implementation digest is a registry assertion, not a hash derived by
core from the JavaScript function body. Package integrity and verifier-code
substitution therefore remain outside the proof and must be established by the
installation/trust boundary.

The commercial-record experiment shows that source-system diversity alone does
not require a scope bridge: independently captured records can compose when a
consumer places them in one exact reconciliation scope and the rules bind their
record identities, artifact digests, and pinned policy. What remains unresolved
is composition of claims that were already certified under genuinely different
targets or scopes. Any such bridge must state and justify the relationship
explicitly; silently weakening scope equality would discard the protection.
