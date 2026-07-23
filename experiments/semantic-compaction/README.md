# Semantic-compaction experiments

These executable, public-synthetic experiments test whether a higher claim is
a reusable semantic checkpoint or merely a label over bundled checks.

```sh
pnpm --filter @riddledc/riddle-proof-core build
pnpm --filter @riddledc/riddle-proof-local build
node --require ./scripts/deny-network.cjs experiments/semantic-compaction/release-artifact.test.mjs
node --require ./scripts/deny-network.cjs experiments/semantic-compaction/document-transformation.test.mjs
pnpm --filter @riddledc/riddle-proof-runner-playwright test:browser-transition
```

The implemented browser-state-transition experiment lives with the Playwright
runner and runs through its focused package test. All three require
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
