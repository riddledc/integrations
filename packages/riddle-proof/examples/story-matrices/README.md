# Riddle Proof Story Matrices

`riddle-proof-bounded-loop.json` is a starter matrix for bounded dogfood loops.
It is meant to keep broad user-story sweeps evidence-backed and reviewable
without turning them into unbounded scaffolding.

`riddle-proof-ux-coverage.csv` is the spreadsheet view of the same loop. Open it
in a spreadsheet editor when you want the "status bar" view: surface, user story,
expected behavior, runner, required evidence, last result, finding, next action,
and priority.

Each story names:

- the Riddle Proof surface under test
- the expected behavior and expected verdict
- the runner to use
- the concrete receipts that must be saved
- likely failure classes
- the story status, such as candidate, ready, covered, blocked, or recurring

Use one batch at a time, save outputs under `artifacts/riddle-proof/<story-id>/`,
fix only high-signal failures, and rerun the same batch before expanding scope.

Use the CSV to choose the next batch:

- `passed`, `product_regression_expected`, and `found_fixed` rows need receipts
  in `artifact_or_pr`.
- `ready_to_run` rows are good next targets for live dogfood passes.
- `needs_product_hook` rows point to product surfaces that need an import, shared
  contract, or manual proof-view smoke before they can become recurring.
