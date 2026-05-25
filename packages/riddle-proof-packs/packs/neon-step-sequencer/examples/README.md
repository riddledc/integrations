# Neon Step Sequencer example runs

These examples are Playwright runner outputs captured against LilArcade Neon Step Sequencer. Runs 001-008 are local runs captured on May 24, 2026. Runs 009-011 are production/current-target runs captured after the ratchet became part of the deploy workflow. They are included to show how this pack records atomic proof claims with explicit evidence-role patterns.

The raw `profile-result.json` files are real runner outputs where included. They intentionally keep enough evidence to audit the verdict, but the summaries are the preferred place to start. Runs 006, 007, and 008 also include standalone handoff artifacts generated from proof output. Run 011 is a curated batch receipt: it keeps compact aggregate artifacts rather than the full 53-file local output.

## Runs

| Run | Evidence-role pattern | Status | Claim |
| --- | --- | --- | --- |
| `run-001-fast-mix-health` | `current_target` | passed | The current Neon target exposes a proof contract, source receipts, and a bounded offline mix-health render. |
| `run-002-mix-change` | `interaction_snapshots` | passed | A bass-level edit changes rendered bass and mix metrics without clipping. |
| `run-003-full-matrix` | `current_target` | passed | The mix-health proof holds across desktop, phone, iPad Mini, and iPad viewports. |
| `run-004-ratchet-loop-mix-level-search` | `interaction_snapshots` | passed | A bounded ratchet loop tests mix-level change-claim candidates, records receipt verdicts, chooses a supported candidate for review, and restores app state. |
| `run-005-explore-songs-and-mixes-final` | `current_target` | passed | A bounded exploration sweep samples four songs and eight song/part entries, producing a zero-finding confidence map after app-contract and mix-headroom fixes. |
| `run-006-ratchet-loop-human-review-packet` | `interaction_snapshots` | passed | A bounded ratchet loop returns a compact `humanReviewPacket` for handoff: supported candidates, objective guardrails, state restoration, review-order ranking, and listening caveats. |
| `run-007-approved-candidate-applied` | `interaction_snapshots` | passed | A bounded ratchet loop uses an explicit operator-approval surrogate, applies the supported `chord -0.10` candidate, and keeps the listening-review caveat in the packet. |
| `run-008-durable-mix-patch-handoff` | `current_target` | passed | An applied packet becomes a durable candidate patch plan for `chord: 0.28`, then a current-target proof verifies the running app sees that durable level without clipping. |
| `run-009-deep-exploration-production` | `current_target` | passed | A deployed deep exploration sweep samples the current six-song Neon catalog bounds, finds no deterministic guardrail failures, and restores app state. |
| `run-010-durable-current-target-production` | `current_target` | passed | A deployed durable current-target proof verifies `chord: 0.18` across contract levels, mix-profile source levels, visible mixer text, and bounded render guardrails. |
| `run-011-post-deploy-batch-production` | `current_target` | passed | A deployed post-deploy batch combines fast mix health, mobile layout, playback sync, bounded deep exploration, and durable current-target proof after the guitar `0.55` override promotion. |

## What these examples do not prove

- They do not prove subjective mix taste.
- They do not prove every song, section, or mix preset. Runs 005 and 009 are bounded to the configured song, part, and proof-window limits.
- Runs 001-008 do not prove production CDN asset availability; they were local dev-server runs. Run 009 is the production current-target check.
- They do not prove a reference/candidate release delta. The mix-change run uses pre-action/post-action snapshots inside one proof run, not a separate baseline deployment.
- The ratchet-loop run does not prove that the loop primitive is mix-specific; `mix-level-search` is only this pack's first concrete strategy.
- The ratchet-loop run does not prove that the supported candidate should be kept. Its ranking metric is a review-order hint, not a taste verdict.
- The human-review packet does not replace listening judgment. It compresses objective receipts and caveats so a person or follow-on agent can decide what to review next.
- The approved-candidate run does not prove that the surrogate approval is a real listener preference; it proves that the apply step was explicit, guarded by supported receipts, and recorded for review.
- The durable handoff run does not prove the mix is better. It proves the approved candidate was eligible for scoped source/config application and that the app saw the durable result afterward.
- The deep exploration run does not prove taste or exhaustive catalog coverage. It proves deterministic guardrails inside its current configured bounds and records state restoration.
- The durable current-target production run does not prove taste or approval correctness. It proves the running app agrees with the durable override receipts after promotion.
- The post-deploy batch run does not prove taste or broad release quality. It proves a bounded deployed target remained clean across the configured deterministic app/audio guardrails.
