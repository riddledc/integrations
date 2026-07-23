# Semantic-compaction experiments

These executable, public-synthetic experiments test whether a higher claim is
a reusable semantic checkpoint or merely a label over bundled checks.

```sh
pnpm --filter @riddledc/riddle-proof-core build
pnpm --filter @riddledc/riddle-proof-local build
node --require ./scripts/deny-network.cjs experiments/semantic-compaction/release-artifact.test.mjs
node --require ./scripts/deny-network.cjs experiments/semantic-compaction/document-transformation.test.mjs
node --require ./scripts/deny-network.cjs experiments/semantic-compaction/commercial-record-reconciliation/commercial-record-reconciliation.test.mjs
pnpm --filter @riddledc/riddle-proof-runner-playwright test:browser-transition
```

The implemented browser-state-transition experiment lives with the Playwright
runner and runs through its focused package test. Its four ordinary profile
fixtures live in `browser-transition-suite/`. Authoring or revising those
profiles is proof-suite work; applying their fixed definitions to a particular
target and evaluating the resulting evidence is conformance work. Raw fixture
SHA-256 values guard the test inputs against mutation, while each sealed proof
cryptographically binds the normalized profile content for its exact target.
The test keeps the suite fixed across three separately scoped targets, so a
target change cannot silently become a suite change.

The commercial-record experiment in `commercial-record-reconciliation/`
separately authors a narrow synthetic comparison theory for invoice,
purchase-order, receipt, payment, and register records. It then demonstrates
arithmetic grounding, cross-source composition, shared-branch reuse, and
selective recomposition. It is a theory/composition playground, not an
accounts-payable product or an iteration lifecycle.

All four experiments require
deterministic replay, changed-input detection followed by selective
recomposition, branch reuse, exact DAG/frontier explanation, and rejection of
validly signed but semantically mismatched substitutions. Historical closures
remain replayable; the experiments do not revoke immutable certificates.

The fixtures contain no company rules, contract examples, credentials, or
private document content. External verifier callbacks are reconstructed from
installed experiment code during replay; their declared implementation digest
is a registry trust assertion, not code attestation. Core does not derive that
digest from the callback body, so package integrity and verifier-code
substitution are installation trust boundaries rather than hostile cases these
proofs reject.
