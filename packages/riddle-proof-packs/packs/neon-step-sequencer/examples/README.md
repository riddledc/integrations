# Neon Step Sequencer example runs

These examples are local Playwright runner outputs captured against LilArcade Neon Step Sequencer on May 24, 2026. They are included to show how this pack records atomic proof claims with explicit evidence-role patterns.

The raw `profile-result.json` files are real runner outputs. They intentionally keep enough evidence to audit the verdict, but the summaries are the preferred place to start.

## Runs

| Run | Evidence-role pattern | Status | Claim |
| --- | --- | --- | --- |
| `run-001-fast-mix-health` | `current_target` | passed | The current Neon target exposes a proof contract, source receipts, and a bounded offline mix-health render. |
| `run-002-mix-change` | `interaction_snapshots` | passed | A bass-level edit changes rendered bass and mix metrics without clipping. |
| `run-003-full-matrix` | `current_target` | passed | The mix-health proof holds across desktop, phone, iPad Mini, and iPad viewports. |
| `run-004-ratchet-loop-mix-level-search` | `interaction_snapshots` | passed | A bounded ratchet loop tests mix-level change-claim candidates, records receipt verdicts, chooses a supported candidate for review, and restores app state. |
| `run-005-explore-songs-and-mixes-final` | `current_target` | passed | A bounded exploration sweep samples four songs and eight song/part entries, producing a zero-finding confidence map after app-contract and mix-headroom fixes. |
| `run-006-ratchet-loop-human-review-packet` | `interaction_snapshots` | passed | A bounded ratchet loop returns a compact `humanReviewPacket` for handoff: supported candidates, objective guardrails, state restoration, review-order ranking, and listening caveats. |

## What these examples do not prove

- They do not prove subjective mix taste.
- They do not prove every song, section, or mix preset. Run 005 is bounded to the configured song, part, and proof-window limits.
- They do not prove production CDN asset availability; these were local dev-server runs.
- They do not prove a reference/candidate release delta. The mix-change run uses pre-action/post-action snapshots inside one proof run, not a separate baseline deployment.
- The ratchet-loop run does not prove that the loop primitive is mix-specific; `mix-level-search` is only this pack's first concrete strategy.
- The ratchet-loop run does not prove that the supported candidate should be kept. Its ranking metric is a review-order hint, not a taste verdict.
- The human-review packet does not replace listening judgment. It compresses objective receipts and caveats so a person or follow-on agent can decide what to review next.
