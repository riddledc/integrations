# Neon Step Sequencer example runs

These examples are local Playwright runner outputs captured against LilArcade Neon Step Sequencer on May 24, 2026. They are included to show how this pack records atomic proof claims with explicit evidence-role patterns.

The raw `profile-result.json` files are real runner outputs. They intentionally keep enough evidence to audit the verdict, but the summaries are the preferred place to start.

## Runs

| Run | Evidence-role pattern | Status | Claim |
| --- | --- | --- | --- |
| `run-001-fast-mix-health` | `current_target` | passed | The current Neon target exposes a proof contract, source receipts, and a bounded offline mix-health render. |
| `run-002-mix-change` | `interaction_snapshots` | passed | A bass-level edit changes rendered bass and mix metrics without clipping. |
| `run-003-full-matrix` | `current_target` | passed | The mix-health proof holds across desktop, phone, iPad Mini, and iPad viewports. |
| `run-004-ratchet-loop-mix-level-search` | `interaction_snapshots` | passed | A bounded ratchet loop tests mix-level candidates, returns the best objective candidate, and restores app state. |

## What these examples do not prove

- They do not prove subjective mix taste.
- They do not prove every song, section, or mix preset.
- They do not prove production CDN asset availability; these were local dev-server runs.
- They do not prove a reference/candidate release delta. The mix-change run uses pre-action/post-action snapshots inside one proof run, not a separate baseline deployment.
- The ratchet-loop run does not prove that the loop primitive is mix-specific; `mix-level-search` is only this pack's first concrete strategy.
