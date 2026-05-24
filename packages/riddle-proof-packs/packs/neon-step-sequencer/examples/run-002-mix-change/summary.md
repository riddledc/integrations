# Run 002 - Mix Change Interaction Snapshots

- profile: `lilarcade-neon-mix-change-before-after`
- evidence_role_pattern: `interaction_snapshots`
- status: `passed`
- captured_at: `2026-05-24T02:14:17.185Z`
- runner: `local-playwright`
- target: `http://127.0.0.1:5173/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile&view=trainer&instrument=bass`

## Atomic claim

A visible bass-focus mix edit produces measurable rendered audio movement without clipping.

## Evidence

- route observed: `/games/drum-sequencer`
- viewport: `desktop` at `1440x1000`
- edit receipt: bass level changed from `0.62` to `1.35`
- focus track: `bass`
- bass RMS pre-action: `0.0507`
- bass RMS post-action: `0.1071`
- mix RMS pre-action: `0.073`
- mix RMS post-action: `0.1264`
- mix peak post-action: `0.6555`
- clipping after edit: `false`
- console fatal count: `0`
- horizontal overflow: `0 px`

## Verdict

Passed. This is an interaction proof using pre-action and post-action snapshots inside one proof run. It is not a separate reference/candidate deployment comparison.

## What this does not prove

- that the louder bass is aesthetically better
- every instrument control
- every song section
