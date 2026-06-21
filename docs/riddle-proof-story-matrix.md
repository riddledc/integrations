# Riddle Proof Story Matrix

The bounded dogfood loop lives in
`packages/riddle-proof/examples/story-matrices/riddle-proof-bounded-loop.json`.
It is the small version of a broad user-story sweep: enough surface area to
catch contract drift, but not so much that every pass becomes a context switch.

The spreadsheet-style status bar lives in
`packages/riddle-proof/examples/story-matrices/riddle-proof-ux-coverage.csv`.
Use it as the product-experience ledger: every row names the surface, user story,
expected behavior, runner, required evidence, last result, receipt link, finding,
next action, priority, and failure class. It is intentionally CSV so it can be
reviewed in git, opened in a spreadsheet, and shipped in the npm package.

## Loop

1. Pick one batch from the matrix, normally 8 stories or fewer.
2. Prefer `ready_to_run` or `needs_product_hook` rows from the UX coverage CSV.
3. Run the listed commands, saving outputs under `artifacts/riddle-proof/<story-id>/`.
4. Record concrete receipts: `profile-result.json`, `proof.json`, screenshots,
   generated PR comment bodies, preflight JSON, formal build logs, or manual
   notes for surfaces that are not automated yet.
5. Classify failures as product, proof-contract, doc/UX, configuration, or
   environment blockers.
6. Fix only high-signal product or contract issues.
7. Rerun the same batch before advancing to a broader sweep.

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

## UX Coverage Status Values

- `passed`: the row has a current receipt and no open product issue.
- `product_regression_expected`: a negative-control row produced the intended
  product-regression verdict.
- `found_fixed`: the row found a real issue and the fix was merged or is in the
  current branch.
- `ready_to_run`: the row is defined well enough to execute next.
- `needs_product_hook`: the row names a real surface, but the product still
  needs a shared contract import, renderer hook, or review path before the story
  can be automated.
- `blocked_external`: the row is blocked by infrastructure or account state
  outside the product contract.

## Promotion Rule

A story can become recurring only after it has a stable expected verdict and at
least one saved evidence packet. Negative controls are valid recurring stories:
for example, a deliberate missing selector should pass the framework story by
returning `product_regression`, not by returning `passed`.
