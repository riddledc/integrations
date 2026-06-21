# Riddle Proof Consumer Surface Contract Run: 2026-06-21

Matrix: `riddle-proof-bounded-loop-2026-06`

Coverage ledger: `packages/riddle-proof/examples/story-matrices/riddle-proof-ux-coverage.csv`

Branch: `codex/riddle-proof-consumer-surface-verdict-rows`

## Results

- `rp-ux-hosted-proof-view-contract-passed`: passed.
  - Evidence: `summarizeRiddleProofHostedProofViewSurface` preserves the shared public-state handoff contract for passed/ready evidence.
- `rp-ux-hosted-proof-view-contract-product-regression`: passed.
  - Evidence: `product_regression` maps to `proof_failed`, keeps result label `product_regression`, prohibits `proof_passed` and `ready_to_ship`, and suppresses stale merge recommendations.
- `rp-ux-hosted-proof-view-contract-proof-insufficient`: passed.
  - Evidence: `proof_insufficient` maps to `proof_blocked`, keeps result label `proof_insufficient`, and requires the `proof_insufficient` disclosure.
- `rp-ux-agent-summary-contract-proof-insufficient`: passed.
  - Evidence: agent-summary surfaces inherit the same incomplete-evidence blocker and prohibited success claims.
- `rp-ux-agent-summary-contract-environment-blocked`: passed.
  - Evidence: `environment_blocked` maps to `proof_blocked`, requires environment disclosure, and suppresses stale merge recommendations.
- `rp-ux-agent-summary-contract-human-review`: passed.
  - Evidence: `needs_human_review` maps to `proof_blocked` and requires human-review disclosure.

## Product Wiring Notes

- Read-only scan of `/Users/josephdavis-diehl/temp-repos/riddle-site` found public proof pages and archived proof-bundle renderers, including `/proof/` and `/examples/riddle-proof/`.
- That scan did not find a live hosted proof packet renderer importing `@riddledc/riddle-proof/public-state`.
- The ledger therefore keeps two product-hook rows open:
  - `rp-ux-hosted-proof-view-product-renderer-imports-contract`
  - `rp-ux-agent-summary-product-wiring-uses-contract`

## Notes

- This batch is contract hardening, not a live hosted browser run.
- The next broad UX pass should use the new rows as fixtures: one passed packet, one `product_regression` packet, one `proof_insufficient` packet, and one `environment_blocked` packet.
