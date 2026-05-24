# Run 008 - Durable mix patch handoff

- profile: `lilarcade-neon-fast-mix-health`
- runner: `local-playwright`
- evidence-role pattern: `current_target`
- target: `/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile&view=trainer&instrument=bass`
- status: `passed`

## Claim

After an explicitly applied human-review packet, Neon can turn the supported `chord -0.10` candidate into a scoped source-level mix override, then prove the running app sees that durable level without turning the packet into a taste verdict.

## Handoff chain

1. Run 007 produced `candidate_applied_for_listening_review`.
2. The packet recorded `mixing_canon_surrogate`, `approvedCandidateApplied: true`, `candidateActionsAreTransient: false`, and `ranking.role: review_order_only`.
3. The durable candidate patch plan targeted `src/Games/songs/neon-approved-mix-overrides.json`.
4. The durable edit scoped `chord: 0.28` to `Monkberry Moon Delight (Tab)` and `monkberry-moon-delight-eq-lane-mix-v7`.
5. This current-target proof reloaded Neon and verified the browser contract reported `chordLevel: 0.28`.

## Objective receipts

| receipt | value |
| --- | --- |
| selected song | `Monkberry Moon Delight (Tab)` |
| durable chord level | `0.28` |
| mix RMS | `0.1234` |
| peak | `0.8303` |
| clipping | `false` |
| low-level window | `false` |
| active instruments | `6` |
| route | `/games/drum-sequencer` |
| fatal console count | `0` |

## Verdict

Passed. The proof supports that the source-level durable override is visible to the running app and stays inside the current mix-health guardrails.

It does not prove subjective mix quality, listener preference, or that this is the best musical balance. It proves the handoff from approved candidate packet to scoped durable state and then verifies that durable state in the browser.
