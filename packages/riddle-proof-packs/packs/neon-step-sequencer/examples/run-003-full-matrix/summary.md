# Run 003 - Full Mix Health Matrix

- profile: `lilarcade-neon-full-mix-health-matrix`
- evidence_role_pattern: `current_target`
- status: `passed`
- captured_at: `2026-05-24T02:24:22.352Z`
- runner: `local-playwright`
- target: `http://127.0.0.1:5173/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile&view=trainer&instrument=bass`

## Atomic claim

The current Neon target preserves route, proof contract, rendered mix-health metrics, and layout guardrails across desktop, phone, iPad Mini, and iPad viewports.

## Evidence

| Viewport | Route | Overflow | RMS | Peak | Headroom | Clipping | Score |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| desktop | `/games/drum-sequencer` | `0 px` | `0.0732` | `0.5402` | `5.35 dB` | `false` | `29.3304` |
| phone | `/games/drum-sequencer` | `0 px` | `0.0732` | `0.5402` | `5.35 dB` | `false` | `29.3303` |
| ipad-mini | `/games/drum-sequencer` | `0 px` | `0.0732` | `0.5402` | `5.35 dB` | `false` | `29.3904` |
| ipad | `/games/drum-sequencer` | `0 px` | `0.0732` | `0.5402` | `5.35 dB` | `false` | `29.3902` |

Console fatal count was `0`.

## Verdict

Passed. This is a current-target matrix audit, not a measured implementation diff.

## What this does not prove

- subjective mix quality
- every song or every mix preset
- full interaction ergonomics on touch devices
