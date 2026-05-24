# Run 004 - Ratchet Loop Mix-Level Search

- profile: `lilarcade-neon-ratchet-loop-mix-level-search`
- evidence_role_pattern: `interaction_snapshots`
- status: `passed`
- captured_at: `2026-05-24T03:31:26.020Z`
- runner: `local-playwright`
- target: `http://127.0.0.1:5173/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile&view=trainer&instrument=bass`

## Atomic Claim

The current Neon target can run a bounded ratchet loop that proposes mix-level candidates, applies each candidate, captures proof-window evidence, ranks candidates by objective metrics, and restores the app state after the run.

## Evidence

| Field | Value |
| --- | --- |
| strategy | `mix-level-search` |
| focus tracks | `bass`, `chord`, `guitar`, `rhythmSynth` |
| candidates tested | `6` |
| baseline score | `28.83345` |
| best score | `27.0708` |
| objective improvement | `1.7627` |
| best candidate | `chord -0.10` to level `0.28` |
| loop status | `candidate_found` |
| restored after run | `true` |

Console fatal count was `0`.

## Verdict

Passed. The bounded loop produced a reviewable candidate packet without permanently applying the candidate.

## What This Does Not Prove

- subjective mix quality
- that the candidate should be kept without listening review
- that all possible mix edits were searched
- that the ratchet loop primitive is mix-specific
