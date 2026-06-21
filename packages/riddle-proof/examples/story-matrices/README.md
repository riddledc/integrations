# Riddle Proof Story Matrices

`riddle-proof-bounded-loop.json` is a starter matrix for bounded dogfood loops.
It is meant to keep broad user-story sweeps evidence-backed and reviewable
without turning them into unbounded scaffolding.

Each story names:

- the Riddle Proof surface under test
- the expected behavior and expected verdict
- the runner to use
- the concrete receipts that must be saved
- likely failure classes
- the story status, such as candidate, ready, covered, blocked, or recurring

Use one batch at a time, save outputs under `artifacts/riddle-proof/<story-id>/`,
fix only high-signal failures, and rerun the same batch before expanding scope.
