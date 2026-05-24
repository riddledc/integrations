# Run 006 - Ratchet Loop Human-Review Packet

- profile: `lilarcade-neon-ratchet-loop-mix-level-search`
- evidence_role_pattern: `interaction_snapshots`
- status: `passed`
- captured_at: `2026-05-24T06:15:38.159Z`
- runner: `local-playwright`
- target: `http://127.0.0.1:5177/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile&view=trainer&instrument=bass`

## Atomic Claim

The current Neon target can run the bounded `mix-level-search` ratchet loop and return a compact `humanReviewPacket` that summarizes supported claim candidates, objective guardrails, state restoration, and subjective-listening caveats without claiming automated taste.

## Evidence

| Field | Value |
| --- | --- |
| loop status | `claim_candidate_supported` |
| human-review packet kind | `human_review_packet` |
| human-review packet status | `candidate_ready_for_listening_review` |
| recommended candidate | `chord -0.10` |
| recommended action | `set_mixer_level chord 0.38 -> 0.28` |
| supported candidates | `6` |
| rejected candidates | `0` |
| ranking role | `review_order_only` |
| baseline candidate-ranking metric | `28.8336` |
| best candidate-ranking metric | `27.0709` |
| ranking metric delta | `1.7626` |
| state restored after loop | `true` |
| permanent edit kept | `false` |

The packet caveats state that it does not prove subjective mix quality, that supported candidates prove objective receipts and guardrails only, that ranking orders review rather than taste, and that keeping/applying the candidate still requires listening review.

## Verdict

Passed. The loop produced a review packet suitable for agent or human handoff. The proof supports that a candidate changed the requested measurable state while preserving guardrails; it does not decide whether the candidate is musically preferable.

## What This Does Not Prove

- subjective mix quality
- that `chord -0.10` should be accepted without listening review
- that the ranking metric is a taste score
- that all possible candidate edits were explored
- production CDN asset availability
