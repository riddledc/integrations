# Riddle Proof Story Matrix

The bounded dogfood loop lives in
`packages/riddle-proof/examples/story-matrices/riddle-proof-bounded-loop.json`.
It is the small version of a broad user-story sweep: enough surface area to
catch contract drift, but not so much that every pass becomes a context switch.

## Loop

1. Pick one batch from the matrix, normally 8 stories or fewer.
2. Run the listed commands, saving outputs under `artifacts/riddle-proof/<story-id>/`.
3. Record concrete receipts: `profile-result.json`, `proof.json`, screenshots,
   generated PR comment bodies, preflight JSON, formal build logs, or manual
   notes for surfaces that are not automated yet.
4. Classify failures as product, proof-contract, doc/UX, configuration, or
   environment blockers.
5. Fix only high-signal product or contract issues.
6. Rerun the same batch before advancing to a broader sweep.

GitHub Actions billing or runner-startup failures are environment blockers for
the surrounding repo, not Riddle Proof product regressions. They should be kept
out of the proof verdict unless the story is specifically about CI behavior.

## First Batches

- `local-core`: proves the framework trust boundary without hosted infra.
- `hosted-profile`: proves hosted run-profile behavior, including negative
  controls, cold starts, recovery, and viewport aggregation.
- `reporting`: proves PR comments and summaries render from saved evidence.
- `artifact-publication`: proves public proof/profile promotion uses real
  artifact bodies instead of guessed strings.
- `formal-contract`: proves Lean stays in the contract-hardening layer rather
  than becoming a runtime evidence dependency.

## Promotion Rule

A story can become recurring only after it has a stable expected verdict and at
least one saved evidence packet. Negative controls are valid recurring stories:
for example, a deliberate missing selector should pass the framework story by
returning `product_regression`, not by returning `passed`.
