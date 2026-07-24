# Proof-guided web change

This private experiment is the first deliberately thin client of the Riddle
Proof substrate. It answers one narrow question:

> Does this exact browser target currently satisfy this independently pinned
> change contract?

The contract is fixed before a candidate is checked. An ordinary caller may
select only an opaque candidate reference. A trusted resolver establishes the
exact repository, revision, environment, and URL. The client independently
validates the exact profile JSON pinned by the contract, normalizes those
profiles to the resolved target, and derives the candidate digest and attempt
authority.

The initial synthetic contract reuses the existing four browser profiles:

1. the starting state is present;
2. the declared action produces the requested value;
3. that value survives browser-storage clearing and reload;
4. that value remains visible in a fresh browser context.

The same contract is applied to every repair attempt. A transient specimen is
expected to fail the reload and fresh-context requirements. A durable specimen
is expected to satisfy the complete transition. Changing the specimen creates
a new candidate identity; it does not rewrite the contract.

## What the client says

The application layer exposes only four ordinary outcomes:

- `conforms`: the exact candidate matches the pinned change contract;
- `does_not_conform`: replayed browser evidence establishes one or more pinned
  failures, with repair guidance owned by the contract;
- `stale`: the proof was valid but is too old for the configured currentness
  policy;
- `could_not_check`: evidence, replay, binding, or currentness was unresolved.

Hashes, nonces, signatures, certificates, and proof DAGs are audit details.
They are not concepts the ordinary caller must supply or interpret.

The browser report provider returns checked replay facts, not an outcome. The
shared deterministic application projector inside the client checks the exact
authority, subject, semantic root, requirement coverage, evidence linkage, and
currentness before deriving one of the four outcomes. Provider-authored
dispositions, finding prose, and repair guidance are not accepted.

The configured report provider nevertheless remains inside the verifier trust
boundary: a malicious provider could fabricate a fully well-shaped replay
instead of replaying real captures. The deterministic client prevents that
provider from silently changing the contract or the meaning of returned facts;
it cannot independently prove that a trusted provider actually performed its
declared environmental work. A production adapter must therefore pin and
independently trust or attest its verifier implementation.

## Trust boundary

The browser sensor can report only what the pinned profiles observed at the
configured target. Signed capture prevents later substitution of the profile,
result, evidence, or artifact manifest. Deterministic replay recomputes the
browser status and checks the exact candidate and contract bindings.

This does **not** establish database truth, causation, authorship, correctness
outside the pinned profiles, future availability, or authorization to publish.
Until a deployment system independently binds served bytes to source revision,
the subject is honestly named a browser target candidate rather than a proven
deployment.

This experiment contains no hosted Riddle client and makes no request to
Riddle infrastructure. The Node regression guard rejects Riddle-hosted
`fetch`, HTTP, and HTTPS requests; it is not a general process or Chromium
egress sandbox. A checked page can redirect or load subresources from other
origins. A production adapter must apply its own approved browser-network
policy when that matters.

## Run the controlled repair

From the repository root:

```bash
pnpm run verify:proof-guided-web-change
```

The test starts a local synthetic site, applies the same pinned contract to a
transient candidate, changes only the specimen to a durable implementation,
and checks the repaired candidate under a distinct subject identity. It also
exercises age-based staleness and an unavailable target. The test uses real
Playwright captures, Ed25519 signatures, deterministic reassessment,
checked-meaning replay, and application projection; the same command also
compiles the separate Lean decision model.

The ordinary repository test command runs the executable suite without
requiring Lean in the Node job. CI compiles the same Lean model in its separate
formal-kernel job.

The expected ordinary sequence is:

```text
transient candidate  -> does_not_conform
durable repair       -> conforms
old evidence         -> stale
unavailable target   -> could_not_check
```

This is a controlled client experiment, not a production deployment adapter.
