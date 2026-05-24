# Neon Ratchet Findings

This file records findings from live runs. Keep entries factual and classify the smallest weak layer.

## Finding template

- run:
- claim:
- observed evidence:
- classification:
- smallest layer changed:
- change made:
- rerun:
- next sharper question:

## Seed findings to watch for

### App contract too coarse

The proof can see route and UI state but not enough mixer or per-track metric state.

Likely change:

`lilarcade/src/proof/neonProofContract.ts`

### Metric moved, but not as expected

A visible mix control changes UI state but the offline render path remains stale.

Likely change:

Neon app render path or proof-preparation path.

### Wrong musical window

The selected proof bars do not contain the target instrument.

Likely change:

Profile render window, song fixture, or authoring guide.

### Subjective boundary

Receipts can support that a requested mix-level change happened and stayed inside guardrails, but deciding whether the mix is musically better requires listening.

Likely change:

Human-review rubric and artifact summary.

### Output too noisy

Full metrics are useful in `proof.json`, but the terminal summary is hard to scan.

Likely change:

Pack summary guidance first; Riddle Proof core only if a general display primitive is missing.

## Live findings

### Run 001 established the app-contract baseline

- run: `run-001-fast-mix-health`
- claim: the current Neon target exposes route, selected-song, source, mixer, and offline render receipts.
- observed evidence: route matched `/games/drum-sequencer`; proof contract available; all audio source readiness flags true; mix RMS `0.1234`; peak `0.8321`; clipping `false`; console fatal count `0`.
- classification: none; passing `current_target` audit.
- smallest layer changed: app proof contract and profile JSON.
- change made: added a Neon proof contract and a fast profile that reads contract state and renders one bounded offline audio window.
- rerun: passed on May 24, 2026.
- next sharper question: can a visible mix edit produce measurable rendered movement?

### Run 002 proved interaction movement without clipping

- run: `run-002-mix-change`
- claim: a bass-focus mix edit moves rendered audio metrics without clipping.
- observed evidence: bass level changed from `0.62` to `1.35`; bass RMS moved from `0.0507` to `0.1071`; mix RMS moved from `0.073` to `0.1264`; post-action peak `0.6555`; clipping `false`.
- classification: none; passing `interaction_snapshots` proof.
- smallest layer changed: profile only.
- change made: captured pre-action and post-action offline metrics in one proof run.
- rerun: passed on May 24, 2026.
- next sharper question: does the current target stay healthy across device-shaped viewports?

### Run 003 widened the target audit to viewport matrix evidence

- run: `run-003-full-matrix`
- claim: route, contract, metrics, and layout guardrails hold across desktop, phone, iPad Mini, and iPad.
- observed evidence: all viewports matched `/games/drum-sequencer`; all reported `0 px` horizontal overflow; all rendered RMS `0.0732`, peak `0.5402`, and no clipping; console fatal count `0`.
- classification: none; passing `current_target` matrix audit.
- smallest layer changed: profile only.
- change made: widened the current-target proof from one desktop viewport to four viewport shapes.
- rerun: passed on May 24, 2026.
- next sharper question: can the exploration profile produce a prioritized song/mix confidence map?

### Run 004 proved the bounded loop shape without making it mix-specific

- run: `run-004-ratchet-loop-mix-level-search`
- claim: a bounded ratchet loop can try change-claim candidates, collect proof-window evidence, record receipt verdicts, select a supported candidate for review, and restore state.
- observed evidence: `mix-level-search` tested `6` candidates; baseline candidate-ranking metric was `28.8336`; best candidate-ranking metric was `27.07095`; best supported claim candidate was `chord -0.10` to level `0.28`; loop status was `claim_candidate_supported`; receipt checks covered edit acceptance, contract level agreement, rendered target metric movement, required instrument activity, no clipping, and no low-level proof window; console fatal count was `0`.
- classification: none; passing `interaction_snapshots` proof with subjective listening caveat. The ranking metric is a review-order hint, not a proof verdict.
- smallest layer changed: generic app proof-contract loop plus one Neon strategy.
- change made: added `runRatchetLoop` with a `mix-level-search` strategy and a proof-pack profile that calls it.
- rerun: passed on May 24, 2026.
- next sharper question: can the loop run multiple strategy classes without changing the proof primitive?

### Run 005 restored the exploration flywheel

- run: `run-005-explore-songs-and-mixes-final`
- claim: a bounded current-target sweep can explore multiple Neon songs/parts, classify findings, and end with a useful confidence map.
- observed evidence: final run sampled `4` songs and `8` song/part entries; all `8` entries passed; prioritized findings dropped to `0`; source preparation loaded drums `samples`, bass/chord/guitar `hybrid`, and vocal `voice_oohs`; final sampled peaks stayed below the clipping threshold; console fatal count was `0`.
- classification: resolved chain of `proof_insufficient`, `app_contract_gap`, and `product_regression` findings during the local ratchet.
- smallest layer changed: app proof contract, app snapshot normalization, app fixture/mix data, and profile JSON.
- change made: made the exploration profile call `runExplorationSweep`; added the app-contract sweep method; normalized arbitrary song/part tempo and bar count; preserved bass/chord/guitar lane enable flags in song snapshots; lowered only hot built-in Yakety and Monkberry Sheet mix data enough to clear clipping receipts.
- rerun: passed on May 24, 2026 with `8` entries, `8` passed, and `0` findings.
- next sharper question: can this exploration workflow become the normal local pack/profile loop before any changeset or npm release?

### Local runner shutdown needs a small ergonomics follow-up

- run: `run-002-mix-change`, `run-003-full-matrix`, `run-004-ratchet-loop-mix-level-search`
- claim: proof artifacts should be written and the CLI process should exit cleanly.
- observed evidence: complete passing artifacts were written, but the wrapper process lingered after artifact write and had to be stopped.
- classification: `proof_insufficient` for operator ergonomics, not a Neon product regression.
- smallest layer changed: none in this pack.
- change made: fixed the local Playwright runner timeout cleanup in `@riddledc/riddle-proof-runner-playwright`.
- rerun: later runner smoke tests and the published `0.4.3` package exited cleanly.
- next sharper question: should the local runner force-close browser handles or expose a clearer artifact-written exit phase?
