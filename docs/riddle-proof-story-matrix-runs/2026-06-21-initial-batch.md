# Riddle Proof Story Matrix Run: 2026-06-21 Initial Batch

Matrix: `riddle-proof-bounded-loop-2026-06`

Branch: `codex/riddle-proof-story-matrix-initial-run`

## Results

- `rp-story-local-core-trust-boundary`: passed.
  - Command: `riddle-proof-loop regression-pack run --pack oc-flow-regression --local-core true --hosted-riddle false --format compact-json`
  - Evidence: `local_core.ok=true`, `case_count=19`, no missing required cases, no forbidden terminal markers.
- `rp-story-hosted-happy-path-produces-artifacts`: passed.
  - Job: `job_366d440b`
  - Evidence: `profile-result.json` status `passed`, 5 passed checks, screenshot and structured artifacts recovered.
  - Cold-start timing: `queue_elapsed_ms=165041`, `pre_submission_elapsed_ms=163316`.
- `rp-story-hosted-negative-control-stays-regression`: passed as a framework negative control.
  - Job: `job_9f446230`
  - Evidence: `profile-result.json` status `product_regression`, 1 passed check, 1 failed check.
- `rp-story-pr-comment-renders-only-evidence-backed-status`: found and fixed a reporting bug.
  - Before: `pr-comment --proof-dir` did not recognize `run-profile` output directories containing `profile-result.json`.
  - Before: explicit `--result-json profile-result.json` rendered `4 passed / 12 failed` for a 5/5 passed profile because nested evidence booleans were counted as checks.
  - After: hosted happy path renders `5 passed / 0 failed`, job `job_366d440b`, screenshot, and artifact links.
  - After: hosted negative control renders `product_regression`, `1 passed / 1 failed`, job `job_9f446230`, screenshot, and artifact links.
- `rp-story-profile-suggest-drafts-not-verdicts`: passed.
  - Evidence: `profile-suggest` emitted a draft profile with route, selector, console, and overflow checks, and no proof verdict.
- `rp-story-profile-body-assertions-derive-from-real-artifact`: passed.
  - Evidence: hosted happy-path `proof.json` produced `["passed"]`.
  - Negative evidence: a missing required fragment exited nonzero.
- `rp-story-http-preflight-catches-publication-mismatch`: passed.
  - Evidence: CDN `proof.json` URL returned 200, JSON content, required body fragments, and matching JSON assertions.
  - Negative evidence: a missing required body fragment exited nonzero with a clear missing-fragment summary.
- `rp-story-run-profile-recover-preserves-artifacts`: passed.
  - Job: `job_366d440b`
  - Evidence: `run-profile recover` wrote a fresh `profile-result.json`, `summary.md`, `proof.json`, `console.json`, and `dom-summary.json` while preserving the original job id.

## Notes

- `npm exec --package @riddledc/riddle-proof@0.8.67 -- riddle-proof-loop --help` works from a clean temporary directory when `npm` is on `PATH`. The earlier command-not-found result was local shell environment, not a package bin issue.
- The aggregate story was not run against the two live packets in this batch because both packets were single `desktop` viewport results; aggregating them would test duplicate/malformed children rather than the intended multi-viewport contract.
- The saved proof artifacts are local run receipts under ignored `artifacts/riddle-proof/` and are intentionally not committed.
