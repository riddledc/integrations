# Run 004 - Ratchet Loop Mix-Level Search

- profile: `lilarcade-neon-ratchet-loop-mix-level-search`
- evidence_role_pattern: `interaction_snapshots`
- status: `passed`
- captured_at: `2026-05-24T04:21:47.248Z`
- runner: `local-playwright`
- target: `http://127.0.0.1:5173/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile&view=trainer&instrument=bass`

## Atomic Claim

The current Neon target can run a bounded ratchet loop that proposes mix-level change-claim candidates, applies each candidate action, captures proof-window evidence, records receipt-level verdicts, selects a supported candidate for review, and restores the app state after the run.

## Evidence

| Field | Value |
| --- | --- |
| strategy | `mix-level-search` |
| focus tracks | `bass`, `chord`, `guitar`, `rhythmSynth` |
| candidates tested | `6` |
| baseline candidate-ranking metric | `28.8336` |
| best candidate-ranking metric | `27.07095` |
| ranking metric delta | `1.7627` |
| best supported claim candidate | `chord -0.10` to level `0.28` |
| loop status | `claim_candidate_supported` |
| restored after run | `true` |

Console fatal count was `0`.

Claim receipts for the supported candidate:

- mixer edit accepted
- contract mixer level reflected the requested action
- rendered target track metrics changed
- required instruments remained active
- no clipping
- no low-level proof window

## Verdict

Passed. The bounded loop produced a reviewable claim-candidate packet without permanently applying the candidate. The ranking metric is a review-order hint only; the claim verdict is based on receipts and guardrails.

## What This Does Not Prove

- subjective mix quality
- that the candidate should be kept without listening review
- that the ranking metric is a universal proof metric
- that all possible mix edits were searched
- that the ratchet loop primitive is mix-specific
