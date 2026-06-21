# Riddle Proof UX Coverage Run: 2026-06-21

Matrix: `riddle-proof-bounded-loop-2026-06`

Coverage ledger: `packages/riddle-proof/examples/story-matrices/riddle-proof-ux-coverage.csv`

## Results

- `rp-ux-local-playwright-runner-smoke`: passed.
  - Runner: `@riddledc/riddle-proof-runner-playwright`
  - Target: `https://riddledc.com/proof/`
  - Evidence: `profile-result.json` status `passed`, runner `local-playwright`, 5 passed checks, `artifact-manifest.json`, `proof.json`, `console.json`, `dom-summary.json`, `summary.md`, and local screenshots.
  - Receipt path: `artifacts/riddle-proof/rp-ux-local-playwright-runner-smoke/`
- `rp-story-viewport-aggregate-does-not-hide-child-failure`: passed as a framework negative control.
  - Runner: local Playwright child packets plus `run-profile aggregate`.
  - Desktop child: `passed`.
  - Phone child: `product_regression` from a deliberate missing selector.
  - Aggregate result: `product_regression`.
  - Evidence: aggregate `split_viewport_children` check failed with `phone: product_regression`; route, selector, and console checks still passed.
  - Receipt path: `artifacts/riddle-proof/rp-story-viewport-aggregate-does-not-hide-child-failure/`

## Notes

- The main `riddle-proof-loop run-profile` CLI still supports hosted `--runner riddle`; local browser execution lives in the separate `@riddledc/riddle-proof-runner-playwright` package.
- The aggregate story intentionally exits nonzero because the expected aggregate verdict is `product_regression`. For this story, that is a pass: the failed child was preserved instead of hidden.
- Remaining high-priority UX coverage rows are product-hook work: hosted proof view contract rendering and agent-facing summary contract rendering.
