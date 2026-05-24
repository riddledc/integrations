# neon-step-sequencer

Reusable Riddle Proof profiles for Neon Step Sequencer audio and mix-health ratcheting.

This pack is the first app-specific lab for the open Riddle Proof architecture. It is intentionally built from user-controlled layers: profile JSON, proof-pack docs, app proof contracts, metrics fixtures, and human-review rubrics. Riddle Proof core should change only if the lab discovers a missing primitive that is generally useful across apps.

## Proof claims and evidence roles

- evidence_role: `current_target`, `interaction_snapshots`
- atomic claim
  - claim: Neon Step Sequencer can connect visible mixer state, app proof-contract state, and rendered audio metrics for a bounded proof window.
  - target: `/games/drum-sequencer` with a selected song/mix fixture.
  - setup/actions: wait for Neon, install proof helpers, prepare audio sources, render offline metrics, optionally apply a visible mix change, and capture screenshot/console/proof artifacts.
  - evidence: route state, selected song, mixer/source/playback state, rendered metrics, pre-action/post-action snapshots, viewport layout, and browser health.
  - verdict: pass when objective guardrails hold; review when evidence is useful but subjective listening judgment remains.
- does not prove
  - that the mix is aesthetically good.
  - every song section or every song/mix combination unless the exploration profile is run.
  - production audio asset availability unless source-readiness receipts are included.

## Profiles

- `profiles/fast-mix-health.json`: current-target audit for one quick render.
- `profiles/source-readiness.json`: current-target audit for sample/source decode readiness.
- `profiles/playback-sync.json`: interaction proof for visible playback and contract state.
- `profiles/mix-change-before-after.json`: interaction proof using pre-action/post-action snapshots inside one run.
- `profiles/mobile-trainer-layout.json`: current-target audit for phone/tablet trainer reachability.
- `profiles/full-mix-health-matrix.json`: current-target matrix across desktop, phone, iPad Mini, and iPad.
- `profiles/explore-songs-and-mixes.json`: exploration sweep for proof-window health.
- `profiles/ratchet-loop-mix-level-search.json`: bounded ratchet loop using the Neon `mix-level-search` strategy.

## Ratchet loop strategy

The loop is not mix-specific as a proof concept. The proof concept is a bounded ratchet loop: propose a candidate, apply it, collect evidence, classify the result, restore or keep state, and repeat until the budget is exhausted.

This pack's first concrete strategy is `mix-level-search`, which tries small level edits against Neon proof windows and returns objective evidence for the best candidate. It still does not decide subjective mix taste; the output is a listening and review packet.

## Example evidence

The `examples/` directory contains four local Playwright proof results captured against LilArcade Neon Step Sequencer on May 24, 2026:

- `run-001-fast-mix-health`: passing `current_target` audit with proof contract, source readiness, mix RMS `0.1234`, peak `0.8321`, and no clipping.
- `run-002-mix-change`: passing `interaction_snapshots` proof where a bass-level edit moved bass RMS from `0.0507` to `0.1071` and mix RMS from `0.073` to `0.1264` without clipping.
- `run-003-full-matrix`: passing `current_target` viewport matrix across desktop, phone, iPad Mini, and iPad with `0 px` horizontal overflow.
- `run-004-ratchet-loop-mix-level-search`: passing `interaction_snapshots` proof where a bounded loop tested six mix-level candidates and returned `chord -0.10` as the best objective candidate without keeping the edit.

## Naming note

The file `mix-change-before-after.json` keeps the project shorthand from the original Neon plan. The evidence-role pattern is `interaction_snapshots`: pre-action and post-action snapshots inside one proof run. It is not the universal Riddle Proof model.
