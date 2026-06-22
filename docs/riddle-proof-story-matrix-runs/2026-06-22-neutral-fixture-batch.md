# Riddle Proof Neutral Fixture Batch: 2026-06-22

Matrix: `riddle-proof-bounded-loop-2026-06`

Coverage ledger: `packages/riddle-proof/examples/story-matrices/riddle-proof-ux-coverage.csv`

Branch: `codex/riddle-proof-neutral-fixture-matrix`

## Results

- `rp-story-neutral-fixture-public-state-blockers`: passed.
  - Evidence: `node packages/riddle-proof/story-matrix.test.js` evaluated 5 neutral public-state fixtures through hosted proof view and agent summary helpers.
  - The fixture packet set contains no `riddledc.com/docs/riddle-proof` or `/examples/riddle-proof` target.
- `rp-story-neutral-fixture-local-pass`: passed.
  - Evidence: `artifacts/riddle-proof/neutral-fixture-pass-local/profile-result.json` status `passed`.
  - The run wrote `artifact-manifest.json`, `proof.json`, `console.json`, `dom-summary.json`, `summary.md`, and phone/desktop screenshots.
- `rp-story-neutral-fixture-negative-control`: passed as a negative control.
  - Evidence: `artifacts/riddle-proof/neutral-fixture-product-regression-local/profile-result.json` status `product_regression`.
  - The run reached `/pass.html`, passed the real page selector, failed `[data-rp-fixture="missing-required-control"]`, and preserved proof artifacts.
- `rp-story-neutral-fixture-hosted-pass`: passed.
  - Evidence: static preview `ps_ccc0b364`; hosted job `job_2ab0f3f3`.
  - The run returned `passed`, listed proof JSON, console, DOM summary, and phone/desktop screenshot artifact URLs.
- `rp-story-neutral-fixture-hosted-negative-control`: passed as a negative control.
  - Evidence: static preview `ps_ccc0b364`; hosted job `job_b308bc57`.
  - The run returned `product_regression`, failed `[data-rp-fixture="missing-required-control"]`, and preserved hosted artifact URLs.

## Notes

- This batch is intentionally not a Riddle Proof docs dogfood test. The browser target is `packages/riddle-proof/examples/neutral-fixture-site/`.
- First hosted pass attempt `job_a53b91e0` returned `proof_insufficient` because the new profile mistakenly required `artifact_manifest`, which is a local runner receipt rather than a hosted browser artifact. The profile was calibrated to require browser artifacts only, then hosted pass/negative-control both behaved as expected.

## Hosted Artifact Preflight Follow-Up

- Change: hosted `run-profile` now preflights local-only `artifact_manifest` / `artifact-manifest.json` requirements and returns `configuration_error` before checking balance or submitting a hosted job.
- Focused evidence: `node packages/riddle-proof/test.js` covers the exported runner-artifact preflight helper, compact CLI JSON, stderr diagnostic, saved summary, and absence of a Riddle job section.
- Full package evidence: `corepack pnpm --filter @riddledc/riddle-proof test` passed.
- Local neutral pass: `artifacts/riddle-proof/neutral-fixture-pass-local-preflight/profile-result.json` returned `passed`.
- Local neutral negative control: `artifacts/riddle-proof/neutral-fixture-product-regression-local-preflight/profile-result.json` returned `product_regression`.
- Hosted neutral pass: static preview `ps_23ba0479`; split jobs `job_e8fbf626` and `job_242530bc`; result `passed`.
- Hosted neutral negative control: static preview `ps_23ba0479`; job `job_1c6b2002`; result `product_regression`.
- Hosted timing note: the first cold hosted viewport queued for about 2m25s before submit; the warm follow-up viewport/job completed in about 3s.
