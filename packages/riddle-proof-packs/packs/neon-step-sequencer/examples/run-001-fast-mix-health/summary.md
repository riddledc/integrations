# Run 001 - Fast Mix Health

- profile: `lilarcade-neon-fast-mix-health`
- evidence_role_pattern: `current_target`
- status: `passed`
- captured_at: `2026-05-24T01:56:00.915Z`
- runner: `local-playwright`
- target: `http://127.0.0.1:5173/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile&view=trainer&instrument=bass`

## Atomic claim

The current Neon target exposes enough app proof state to connect route, selected song, mixer/source readiness, and rendered offline audio metrics for a bounded proof window.

## Evidence

- route observed: `/games/drum-sequencer`
- viewport: `desktop` at `1440x1000`
- proof contract available: `true`
- source-preparation receipt: `drums=samples`, `bass=hybrid`, `chord=hybrid`, `guitar=hybrid`, `vocal=voice_oohs`
- source loaded flags: all true
- mix RMS: `0.1234`
- mix peak: `0.8321`
- headroom: `1.6 dB`
- clipping: `false`
- active instrument count: `6`
- console fatal count: `0`
- horizontal overflow: `0 px`

## Verdict

Passed. This is a current-target audit, not a reference/candidate change proof.

## What this does not prove

- subjective mix quality
- every song or every proof window
- production CDN/source availability
