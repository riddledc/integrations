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

Metrics pass, but deciding whether the mix is better requires listening.

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
- claim: a bounded ratchet loop can try candidate edits, collect proof-window evidence, rank candidates, and restore state.
- observed evidence: `mix-level-search` tested `6` candidates; baseline score was `28.83345`; best score was `27.0708`; best candidate was `chord -0.10` to level `0.28`; loop status was `candidate_found`; console fatal count was `0`.
- classification: none; passing `interaction_snapshots` proof with subjective listening caveat.
- smallest layer changed: generic app proof-contract loop plus one Neon strategy.
- change made: added `runRatchetLoop` with a `mix-level-search` strategy and a proof-pack profile that calls it.
- rerun: passed on May 24, 2026.
- next sharper question: can the loop run multiple strategy classes without changing the proof primitive?

### Local runner shutdown needs a small ergonomics follow-up

- run: `run-002-mix-change`, `run-003-full-matrix`, `run-004-ratchet-loop-mix-level-search`
- claim: proof artifacts should be written and the CLI process should exit cleanly.
- observed evidence: complete passing artifacts were written, but the wrapper process lingered after artifact write and had to be stopped.
- classification: `proof_insufficient` for operator ergonomics, not a Neon product regression.
- smallest layer changed: none in this pack.
- change made: documented the issue and used an outer timeout for the matrix run.
- rerun: not yet rerun after a runner fix.
- next sharper question: should the local runner force-close browser handles or expose a clearer artifact-written exit phase?
