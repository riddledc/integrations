# Application projection

This experiment tests a small application-facing layer over Riddle Proof.  Its
job is to make cryptographic and checked-meaning machinery quiet during normal
work without hiding the authority that gives a conclusion its meaning.

An application supplies two things from different trust boundaries:

1. a **pinned specification** chosen by the application, including its digest
   and expected semantic root; and
2. a **verified observation** produced by a domain adapter after replaying the
   underlying proof against independently supplied authority.

The projection turns those inputs into the same four ordinary outcomes in
every domain:

- `conforms`
- `does_not_conform`
- `stale`
- `could_not_check`

This is not another workflow engine and it does not add legal, approval, or
agent-review states.  A browser publisher, invoice reconciler, document tool,
or another client can decide what to do with the outcome.

## What the application sees

The default view is intentionally small:

```text
subject + pinned spec + replayed proof
                  |
                  v
  disposition, findings, repair guidance, currentness
```

At the controller boundary, an ordinary caller selects only the subject:

```ts
const result = await runtime.check({
  subject: publishedRevision,
});
```

The pinned specification, expected root, nonce/challenge provider, signing-key
provider, verifier, clock, and proof store are constructor configuration.  A
run cannot replace them.  The pinned authority and proof bindings remain
inspectable in the audit view.  The capability implementations themselves stay
inside the configured application and are neither serialized nor exposed as
user-facing ceremony.

Every proof envelope and verified replay carries the exact authority
ID/version/digest, and projection fails closed if it differs from the
configured trust root even when the specification reference is unchanged.
The controller treats that digest as pinned configuration; the client that
constructs an authority remains responsible for deriving and approving it
from the intended bundle.

Inspection expands the same result rather than asking a model to recreate an
explanation:

1. **Outcome** — what disposition applies and what needs attention.
2. **Meaning** — which specification was checked, whether its expected
   semantic root was established, which requirements support the result, and
   what that result explicitly does not conclude.
3. **Audit** — exact authority, proof, root-certificate, subject,
   specification, evidence, and grounded-frontier identities.

All three views retain the same compact proof, specification, and subject
identity.  Digests, raw claim references, and the root-certificate identity
appear only in the audit view.  The smaller views are projections of that
audit material, not separately authored summaries.

## The domain-adapter boundary

The generic projection does not decide whether a browser capture, invoice
record, signature, or clock is trustworthy.  A domain adapter invokes the
existing verifier with the full authority supplied outside the proof packet
and maps the verifier's exact result into the generic vocabulary.  The packet
binds the authority reference, not the private or application-owned authority
contents.

```text
browser checked-meaning replay ----\
                                    > verified observation -> projection
record checked-meaning replay -----/
```

A bare producer boolean is not a verified observation.  The examples are
bound to the current checked-meaning roots:

- browser publishing:
  `riddle-proof.browser.durable-state-transition-observed`;
- synthetic commercial records:
  `riddle-proof.commercial-record.captured-fields-agree-under-policy`.

The browser adapter is intended to consume a successful
`replayRiddleProofBrowserTransition` result.  That replay reconstructs
evidence authority independently, matches the exact expected scope, profiles,
root claim, root rule, and certificate, and checks signed capture chronology.

The commercial-record adapter is intended to consume the successful
checked-meaning replay and currentness assessment already exercised by the
synthetic reconciliation experiment.  The public example remains synthetic;
it is not an accounts-payable system.

The two existing end-to-end suites contain opt-in integration assertions.  In
integration mode they pass their actual replay, deterministic currentness
assessment, and content-light DAG explanation through these adapters and
require a `conforms` projection.  The browser path therefore sits above real
Playwright captures and sealed proof replay; the commercial path sits above
real signed synthetic record captures and checked-meaning replay.  The
smaller conformance vectors test projection failures without pretending to
replace those grounding suites.

## Lean/runtime correspondence

Lean proves the domain-neutral projection rule after runtime facts cross the
boundary: exact pinned authority/specification/subject binding,
successful-root consistency, exact requirement coverage, independent
replay-frontier linkage, unresolved-result precedence, currentness, finding
provenance, and progressive disclosure.  TypeScript still owns parsing,
cryptography, clocks, challenge issuance, capture, checked-meaning replay, and
the truth of the supplied observations.

The TypeScript controller is intentionally stricter than the formal
`RunRequest`: Lean permits a caller to repeat the expected specification and
proves that a mismatch cannot conform; the controller accepts exact-key
`{ subject }` input and does not permit a run to name a specification at all.
This is a safe refinement, not literal field-for-field correspondence.

The source-level correspondence test guards shared disposition names, theorem
obligations, and domain-root identities.  It does not substitute for either
the Lean build or the executable runtime and grounded integration suites.

## Two applications, one vocabulary

### Browser publishing

The specification requires the exact declared state transition to be observed
immediately, after reload, and from a fresh browser context for one pinned
revision and target.  The subject is that exact published revision and target,
not “the website” in general.

`conforms` means only that the pinned durable-transition root replayed for that
subject and remains current under the application's consumption policy.  It
does not establish database truth, causation, or that every feature works.

### Commercial-record reconciliation

The specification requires the exact synthetic invoice, purchase order,
receipt, payment, and supplied-register relationships declared by the pinned
policy.  The subject is the digest-bound record set.

`conforms` means only that the captured fields agree under that policy.  It
does not establish authenticity, authorization, fraud absence, completeness
outside the supplied register, approval to pay, or actual movement of money.

## Fail-closed cases

The conformance vectors cover:

- a proof replayed under a different specification digest;
- a different semantic root than the application's expected root;
- unresolved verifier evidence;
- a proof that is valid historically but stale for current use; and
- a caller trying to add a finding that was not derived from a verified failed
  requirement.

None can be projected as `conforms`.  A stale proof remains inspectable as a
historical proof; `stale` says only that it cannot support a current
conformance conclusion.  An unresolved requirement produces a diagnostic, not
a substantive finding or repair instruction.

## Capability boundary

The projection and fixtures are deterministic and perform no network,
filesystem, browser, subprocess, or hosted-Riddle I/O.  Network or browser
capability remains in an explicitly selected sensor/adapter.  The examples do
not create or publish an npm package.

## Run

From the repository root:

```sh
pnpm --dir experiments/application-projection clean
pnpm --dir experiments/application-projection build
pnpm --dir experiments/application-projection test
```

The experiment tests run with networking denied.  The repository's semantic
compaction test command additionally builds the experiment and enables its
integration assertions inside the existing browser-transition and commercial
record suites.
