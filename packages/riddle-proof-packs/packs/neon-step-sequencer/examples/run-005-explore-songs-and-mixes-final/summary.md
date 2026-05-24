# Run 005 - Explore songs and mixes

- Profile: `neon-step-sequencer-explore-songs-and-mixes`
- Runner: `local-playwright`
- Evidence-role pattern: `current_target`
- Status: `passed`
- Captured at: `2026-05-24T05:09:43.225Z`
- Target URL: `http://127.0.0.1:5173/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile&view=trainer&instrument=bass`

## Claim

The current Neon target can run a bounded song/part exploration sweep, produce a confidence map, and keep every sampled proof window inside objective audio and app-health guardrails.

## Evidence

- `4` songs sampled.
- `8` song/part entries sampled.
- `8` entries passed.
- `0` prioritized findings.
- The profile asserted `__neonProof.exploration.ok === true`, so future product findings fail the proof instead of hiding inside a captured return value.
- Audio sources were prepared with drums `samples`, bass/chord/guitar `hybrid`, and vocal `voice_oohs`.
- Console fatal count was `0`.
- Horizontal overflow was `0 px`.

Final sampled peak/headroom receipts:

| Song | Part | Window | Peak | Headroom |
| --- | ---: | --- | ---: | ---: |
| Yakety Yak (Dark) | 0 | `part-1` | `0.9589` | `0.36 dB` |
| Yakety Yak (Dark) | 1 | `part-2` | `0.9756` | `0.21 dB` |
| Monkberry Moon Delight (Sheet) | 0 | `part-1` | `0.9734` | `0.23 dB` |
| Monkberry Moon Delight (Sheet) | 1 | `part-2` | `0.9550` | `0.40 dB` |
| Monkberry Moon Delight (Full OMR) | 0 | `part-1` | `0.8345` | `1.57 dB` |
| Monkberry Moon Delight (Full OMR) | 1 | `part-2` | `0.8327` | `1.59 dB` |
| Monkberry Moon Delight (Tab) | 0 | `introBed` | `0.8328` | `1.59 dB` |
| Monkberry Moon Delight (Tab) | 0 | `vocalEntry` | `0.8330` | `1.59 dB` |
| Monkberry Moon Delight (Tab) | 1 | `introBed` | `0.8338` | `1.58 dB` |
| Monkberry Moon Delight (Tab) | 1 | `vocalEntry` | `0.8423` | `1.49 dB` |

## What This Does Not Prove

- It does not prove subjective mix taste.
- It does not prove every song or every part; this run was bounded to the first four songs and first two parts per song.
- It does not prove production CDN audio asset availability; this was captured against a local dev server.
- It does not compare a reference deployment to a candidate deployment.

## Artifacts

- `proof.json`
- `console.json`
- `dom-summary.json`
- `profile-result.json`
