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

### Run 006 made the listening handoff compact

- run: `run-006-ratchet-loop-human-review-packet`
- claim: a bounded ratchet loop can return a compact human-review packet that summarizes supported candidates, objective guardrails, state restoration, ranking-as-review-order, and listening caveats.
- observed evidence: loop status was `claim_candidate_supported`; the packet kind was `human_review_packet`; packet status was `candidate_ready_for_listening_review`; the recommended candidate was `chord -0.10`; supported candidate count was `6`; rejected candidate count was `0`; ranking role was `review_order_only`; app state was restored after the loop; permanent edit was not kept.
- classification: none; passing `interaction_snapshots` proof with subjective listening caveat.
- smallest layer changed: app proof contract and proof-pack profile assertions.
- change made: added `humanReviewPacket` to the Neon ratchet-loop result and updated the pack profile to assert the packet shape.
- rerun: passed on May 24, 2026 with local Playwright.
- next sharper question: can the packet become the standard output shape for one-off and background candidate operators across more than `mix-level-search`?

### Run 007 made applying a candidate explicit and auditable

- run: `run-007-approved-candidate-applied`
- claim: a bounded ratchet loop can apply a supported candidate only after an explicit approval mode, then record that final apply step without claiming subjective mix quality.
- observed evidence: loop status was `claim_candidate_supported`; packet status was `candidate_applied_for_listening_review`; approval mode was `mixing_canon_surrogate`; recommended candidate was `chord -0.10`; applied-candidate receipt passed with observed level `0.28`; supported candidate count was `6`; rejected candidate count was `0`; state was restored before the final apply; ranking role stayed `review_order_only`.
- classification: none; passing `interaction_snapshots` proof with subjective listening caveat.
- smallest layer changed: app proof contract and proof-pack profile assertions.
- change made: made `applyBest` require a supported claim candidate, added an applied-candidate receipt, surfaced approval metadata in the human-review packet, and added an approved-candidate profile.
- rerun: passed on May 24, 2026 with local Playwright.
- next sharper question: can follow-on agents use the applied-candidate packet to prepare a code/config patch only when the operator explicitly asks for a durable edit?

### Run 008 closed the durable source handoff

- run: `run-008-durable-mix-patch-handoff`
- claim: an applied human-review packet can become a scoped source/config patch only after durable-readiness validation, and the running app should then prove it sees that durable state.
- observed evidence: durable plan status was `ready_for_durable_patch`; source file was `src/Games/songs/neon-approved-mix-overrides.json`; target was `Monkberry Moon Delight (Tab)` with mix profile `monkberry-moon-delight-eq-lane-mix-v7`; durable mixer level was `chord: 0.28`; final current-target proof passed with contract chord level `0.28`, peak `0.8303`, RMS `0.1234`, clipping `false`, low-level window `false`, and `6` active instruments.
- classification: none; passing durable handoff plus `current_target` proof with subjective listening caveat.
- smallest layer changed: reusable pack helper/CLI, app source override, and proof-pack example docs.
- change made: added a durable candidate plan helper that refuses transient/unapproved packets, committed a scoped Neon override in the app, and captured final proof that the running app saw the durable level.
- rerun: passed on May 24, 2026 with local Playwright and deployed in LilArcade PR #490.
- next sharper question: can this durable handoff become the default follow-on step for proof-backed creative edits across more strategies than `mix-level-search`?

### Run 009 turned deep exploration into the pre-deploy batch gate

- run: `run-009-deep-exploration-production`
- claim: a slower current-target exploration sweep can sample the deployed current Neon song catalog bounds, catch deterministic proof-window/audio guardrail failures before release, and restore app state.
- observed evidence: the deployed sweep passed with `6` available songs, `6` proof-capable songs, `0` skipped songs, `6` sampled songs, `19` sampled parts, `22` sampled windows, `0` findings, and restoration ok.
- classification: none in the final production run; the preceding local ratchet resolved one `profile_calibration` overclaim and five `product_regression` clipping findings.
- smallest layer changed: app proof-window selection, song fixture levels, and reusable proof-pack profile/docs.
- change made: added a deep exploration profile that widens the fast sweep bounds, asserts restoration, and documents the two-speed local ratchet pattern.
- rerun: passed on May 24, 2026 against `https://lilarcade.com`.
- next sharper question: can the same two-speed pattern be exposed for non-audio rich apps without embedding Neon-specific assumptions in the core framework?

### Run 010 proved durable overrides on the deployed current target

- run: `run-010-durable-current-target-production`
- claim: the deployed app sees approved durable mix overrides through app contract state, source/config override state, visible mixer text, and bounded render guardrails.
- observed evidence: `2` active overrides; `0` findings; chord override level `0.16` with peak `0.7546`, RMS `0.1004`, clipping `false`, and headroom `2.45 dB`; guitar override level `0.55` with peak `0.7522`, RMS `0.0999`, clipping `false`, and headroom `2.47 dB`.
- classification: none; passing production `current_target` audit.
- smallest layer changed: app source override plus reusable durable current-target profile/helper.
- change made: promoted the approved guitar candidate as durable source/config state and proved the running app agreed with it after deploy.
- rerun: passed on May 25, 2026 against `https://main.dlwavl00q582x.amplifyapp.com`.
- next sharper question: can post-deploy proof batch deterministic checks so the next creative loop starts from clean live state?

### Run 011 made post-deploy proof a batch handoff

- run: `run-011-post-deploy-batch-production`
- claim: after promoting approved durable Neon mix overrides, a post-deploy batch can prove deterministic app/audio guardrails across the running target without requiring another source change.
- observed evidence: batch status `post_deploy_ready`; fast mix health, mobile trainer layout, playback sync, deep exploration, and durable current-target all passed; the bounded sweep sampled `6` songs, `19` parts, and `22` windows; deterministic findings `0`; restoration ok `true`; active durable overrides `2`.
- classification: none; passing production `current_target` batch.
- smallest layer changed: proof-pack example docs only; no product source change was needed.
- change made: captured a compact aggregate batch receipt so future operators can reuse the post-deploy gate without copying the full raw artifact tree.
- rerun: passed on May 25, 2026 against `https://main.dlwavl00q582x.amplifyapp.com`.
- next sharper question: can the next candidate strategy use this clean deployed state as the baseline for another bounded, reviewable loop?

### Local runner shutdown needs a small ergonomics follow-up

- run: `run-002-mix-change`, `run-003-full-matrix`, `run-004-ratchet-loop-mix-level-search`
- claim: proof artifacts should be written and the CLI process should exit cleanly.
- observed evidence: complete passing artifacts were written, but the wrapper process lingered after artifact write and had to be stopped.
- classification: `proof_insufficient` for operator ergonomics, not a Neon product regression.
- smallest layer changed: none in this pack.
- change made: fixed the local Playwright runner timeout cleanup in `@riddledc/riddle-proof-runner-playwright`.
- rerun: later runner smoke tests and the published `0.4.3` package exited cleanly.
- next sharper question: should the local runner force-close browser handles or expose a clearer artifact-written exit phase?
