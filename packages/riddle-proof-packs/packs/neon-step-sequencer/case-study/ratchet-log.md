# Neon Ratchet Lab

## Goal

Use Riddle Proof to improve confidence in Neon Step Sequencer mix behavior by building a reusable proof pack and iterating only user-controlled proof layers where possible.

## Rule

Each run records:

- claim
- profile used
- evidence captured
- status
- failure classification
- smallest layer changed
- next sharper question

## Classification vocabulary

- `product_regression`: app behavior is wrong.
- `proof_insufficient`: the proof cannot support the claim yet.
- `profile_calibration`: the profile targets the wrong state, timing, fixture, or threshold.
- `app_contract_gap`: the app needs a small diagnostic surface.
- `runtime_environment_blocked`: browser, preview, or runtime failed before useful evidence.
- `needs_human_review`: evidence is real but subjective judgment remains.

## Run 001 - Fast mix-health baseline

Claim:

Neon exposes enough proof state to connect UI mixer settings to rendered metrics.

Profile:

`profiles/fast-mix-health.json`

Evidence to capture:

- Neon route and selected song
- proof contract availability
- readable mixer state
- source-preparation receipt
- offline render metrics
- screenshot and console health

Observed status:

Passed on May 24, 2026 with `local-playwright`.

Observed evidence:

- route observed: `/games/drum-sequencer`
- proof contract available: `true`
- source-preparation receipt: drums `samples`; bass, chord, and guitar `hybrid`; vocal `voice_oohs`
- all source loaded flags true
- mix RMS `0.1234`
- mix peak `0.8321`
- headroom `1.6 dB`
- clipping `false`
- active instrument count `6`
- console fatal count `0`
- horizontal overflow `0 px`

Failure classification:

None. This was a passing `current_target` audit.

Smallest layer changed:

LilArcade added the minimal Neon proof contract and local profile JSON. Riddle Proof core did not need a change.

Next sharper question:

If the baseline can read/render enough state, does a visible mix edit produce measurable audio movement without clipping?

## Run 002 - Mix change interaction snapshots

Claim:

A visible bass-focus mix change produces measurable rendered audio movement without clipping.

Profile:

`profiles/mix-change-before-after.json`

Evidence to capture:

- pre-action offline render metrics
- mixer level change receipt
- post-action offline render metrics
- metric movement classification
- post-action screenshot and console health

Possible outcomes:

- `product_regression`: visible control does not affect render path.
- `proof_insufficient`: render metrics are too coarse or missing.
- `profile_calibration`: chosen bars do not contain enough bass energy.
- `needs_human_review`: objective movement exists but taste is unresolved.

Observed status:

Passed on May 24, 2026 with `local-playwright`.

Observed evidence:

- bass level changed from `0.62` to `1.35`
- bass RMS moved from `0.0507` to `0.1071`
- mix RMS moved from `0.073` to `0.1264`
- post-action mix peak was `0.6555`
- clipping after edit was `false`
- console fatal count `0`
- horizontal overflow `0 px`

Failure classification:

None. This was a passing `interaction_snapshots` proof.

Smallest layer changed:

The profile asked a sharper question using the existing app proof contract. No Riddle Proof core change was required.

Next sharper question:

Does the same pack hold across device-shaped viewports and trainer layout constraints?

## Run 003 - Viewport matrix

Claim:

The mix-health proof holds across desktop, phone, iPad Mini, and iPad while preserving route, contract, metrics, and layout receipts.

Profile:

`profiles/full-mix-health-matrix.json`

Evidence to capture:

- per-viewport route and contract receipts
- per-viewport screenshot
- offline metric receipt
- mobile overflow check
- console health

Possible outcomes:

- `product_regression`: layout/control state is broken.
- `profile_calibration`: profile selector or viewport threshold is too brittle.
- `app_contract_gap`: responsive state is invisible to proof.
- `runtime_environment_blocked`: preview/browser cannot sustain the matrix.

Observed status:

Passed on May 24, 2026 with `local-playwright`.

Observed evidence:

- desktop, phone, iPad Mini, and iPad all observed `/games/drum-sequencer`
- all viewports reported `0 px` horizontal overflow
- all viewports rendered offline metrics with RMS `0.0732`, peak `0.5402`, and no clipping
- console fatal count `0`

Failure classification:

None. This was a passing `current_target` matrix audit.

Smallest layer changed:

Only the profile widened the evidence scope to multiple viewports.

Next sharper question:

Can the pack explore song/mix combinations and produce a prioritized confidence map?

## Run 004 - Bounded mix-level ratchet loop

Claim:

Neon can run a bounded ratchet loop that proposes mix-level change-claim candidates, applies each candidate action, captures proof-window evidence, records receipt-level verdicts, selects a supported candidate for review, and restores app state.

Profile:

`profiles/ratchet-loop-mix-level-search.json`

Evidence to capture:

- baseline candidate-ranking metric
- per-candidate receipt verdicts
- supported claim candidate and ranking metric delta
- state restoration receipt
- compact caveats for human handoff

Possible outcomes:

- `claim_candidate_supported`: at least one candidate has the receipts needed to support its change claim.
- `needs_human_review`: evidence is valid but no candidate has enough receipts to support the proposed claim automatically.
- `proof_insufficient`: the app contract or proof window does not provide enough evidence.
- `profile_calibration`: the chosen tracks, windows, or thresholds do not fit the target.

Observed status:

Passed on May 24, 2026 with `local-playwright`.

Observed evidence:

- strategy `mix-level-search`
- tested `6` candidates across `bass`, `chord`, `guitar`, and `rhythmSynth`
- baseline candidate-ranking metric `28.8336`
- best candidate-ranking metric `27.07095`
- ranking metric delta `1.7627`
- best supported claim candidate `chord -0.10` to level `0.28`
- claim receipts recorded for edit acceptance, contract level agreement, rendered target metric movement, required instrument activity, no clipping, and no low-level proof window
- loop status `claim_candidate_supported`
- app state restored after the run
- console fatal count `0`

Failure classification:

None. This was a passing `interaction_snapshots` loop proof, with an explicit listening-review caveat and a ranking metric that is only a review-order hint.

Smallest layer changed:

The app proof contract gained a generic `runRatchetLoop` method. The Neon-specific part is the `mix-level-search` strategy.

Next sharper question:

Can the pack explore song/mix combinations and produce a prioritized confidence map?

## Run 005 - Bounded song/mix exploration sweep

Claim:

Neon can run a bounded current-target exploration sweep across multiple songs and parts, produce a confidence map, classify weak layers, and close the loop after small user-controlled changes.

Profile:

`profiles/explore-songs-and-mixes.json`

Evidence to capture:

- route and proof-contract availability
- sample/source preparation receipt
- bounded song/part entries
- per-window active-instrument, peak, headroom, and clipping receipts
- prioritized findings
- screenshot, console health, and layout health

Possible outcomes:

- `app_contract_gap`: the app cannot render arbitrary song/part proof states yet.
- `proof_insufficient`: the exploration profile runs but cannot support the claim.
- `profile_calibration`: proof windows or required-active receipts target the wrong musical window.
- `product_regression`: a sampled song/part clips or violates objective guardrails.

Observed status:

Passed on May 24, 2026 with `local-playwright` after three local ratchet iterations.

Observed evidence:

- final run sampled `4` songs and `8` song/part entries
- final run passed `8` entries with `0` prioritized findings
- source preparation loaded drums `samples`, bass/chord/guitar `hybrid`, and vocal `voice_oohs`
- final sampled peaks stayed below the clipping threshold: Yakety `0.9589` and `0.9756`, Monkberry Sheet `0.9734` and `0.9550`, Monkberry Full OMR `0.8345` and `0.8327`, Monkberry Tab proof windows `0.8328` to `0.8423`
- console fatal count `0`
- horizontal overflow `0 px`

Failure classification:

Resolved during the ratchet:

- `proof_insufficient`: the first corrected sweep hit an `OfflineAudioContext` zero-frame error because historical song/part proof states did not normalize tempo/bar count.
- `app_contract_gap`: the next sweep showed saved/song snapshots preserved `rhythmSynthEnabled` but not bass/chord/guitar enable flags.
- `product_regression`: after lane flags were fixed, the sweep found clipping in Yakety Dark and Monkberry Sheet presets.

Smallest layer changed:

App proof contract, app snapshot normalization, app fixture/mix data, and the local exploration profile. Riddle Proof core did not need a change.

Next sharper question:

Can the same exploration shape become a reusable pack/profile workflow where a user can choose a bounded target set, run locally during iteration, and publish only after the evidence is worth sharing?

## Run 006 - Human-review packet handoff

Claim:

Neon can turn the bounded `mix-level-search` loop into a compact handoff object that a human or follow-on agent can review without reading the full proof JSON.

Profile:

`profiles/ratchet-loop-mix-level-search.json`

Evidence to capture:

- loop status and supported candidate count
- recommended candidate action
- per-candidate objective guardrail summary
- state restoration receipt
- ranking role as review order only
- listening-review caveats

Possible outcomes:

- `claim_candidate_supported`: at least one candidate has the receipts needed to support its change claim and the packet can recommend it for listening review.
- `needs_human_review`: evidence is valid but no candidate satisfies every objective receipt.
- `proof_insufficient`: the app contract does not expose a packet or enough candidate receipts.
- `profile_calibration`: the packet exists but points to the wrong window, target, or candidate set.

Observed status:

Passed on May 24, 2026 with `local-playwright`.

Observed evidence:

- loop status `claim_candidate_supported`
- packet kind `human_review_packet`
- packet status `candidate_ready_for_listening_review`
- recommended candidate `chord -0.10`
- recommended action `set_mixer_level chord 0.38 -> 0.28`
- supported candidates `6`
- rejected candidates `0`
- ranking role `review_order_only`
- state restored after loop `true`
- permanent edit kept `false`

Failure classification:

None. This was a passing `interaction_snapshots` proof with an explicit listening-review caveat.

Smallest layer changed:

App proof contract and proof-pack profile. Riddle Proof core did not need a change.

Next sharper question:

Can one-off commands and background runs use this packet as their common output surface while strategy-specific code remains behind the app contract?

## Run 007 - Approved candidate applied

Claim:

Neon can use an explicit approval mode to apply a supported change-claim candidate for listening review while keeping objective proof receipts and subjective taste separate.

Profile:

`profiles/ratchet-loop-approved-candidate.json`

Evidence to capture:

- supported claim candidate
- explicit approval mode
- state restoration before the final apply
- applied-candidate receipt
- compact human-review packet
- listening-review caveat

Possible outcomes:

- `candidate_applied_for_listening_review`: a supported candidate was applied after explicit approval and the final app state reflects the candidate.
- `candidate_ready_for_listening_review`: a supported candidate exists, but the profile did not request final application.
- `needs_human_review`: no candidate satisfied every objective receipt.
- `product_regression`: the selected candidate could not be applied or the final mixer state did not reflect it.

Observed status:

Passed on May 24, 2026 with `local-playwright`.

Observed evidence:

- loop status `claim_candidate_supported`
- packet status `candidate_applied_for_listening_review`
- approval mode `mixing_canon_surrogate`
- recommended candidate `chord -0.10`
- final applied level `0.28`
- applied-candidate receipt `ok`
- supported candidates `6`
- rejected candidates `0`
- state restored before apply `true`
- ranking role `review_order_only`

Failure classification:

None. This was a passing `interaction_snapshots` proof. The approval mode is intentionally labeled as a surrogate so the packet does not imply a real listener has judged the mix.

Smallest layer changed:

App proof contract and proof-pack profile. Riddle Proof core did not need a change.

Next sharper question:

Can the reusable pack expose this approved-candidate shape without making approval automatic, and can follow-on agents use the packet to prepare a code/config patch only when the operator explicitly asks for one?

## Run 008 - Durable mix patch handoff

Claim:

An explicitly applied human-review packet can become a scoped durable source/config patch, and a final current-target proof can verify the running app sees that durable state without claiming subjective mix quality.

Profile:

`profiles/fast-mix-health.json`

Evidence to capture:

- applied human-review packet
- durable candidate patch plan
- source/config target
- current app contract mixer state
- offline mix-health metrics
- listening-review caveat

Possible outcomes:

- `ready_for_durable_patch`: the packet is applied, approved, non-transient, ranked for review only, and still preserves the listening-review caveat.
- `not_ready_for_durable_patch`: the packet is still transient, lacks approval metadata, has a disallowed action, lacks required target scope, or dropped the proof/taste boundary.
- `current_target_passed`: the durable source edit is visible to the running app and current audio guardrails pass.
- `product_regression`: the durable edit is not reflected in app state or the current target clips / falls below level guardrails.

Observed status:

Passed on May 24, 2026 with `local-playwright`.

Observed evidence:

- durable plan status `ready_for_durable_patch`
- source file `src/Games/songs/neon-approved-mix-overrides.json`
- target `Monkberry Moon Delight (Tab)`
- mix profile `monkberry-moon-delight-eq-lane-mix-v7`
- durable mixer level `chord: 0.28`
- current-target profile status `passed`
- contract chord level `0.28`
- peak `0.8303`
- RMS `0.1234`
- clipping `false`
- low-level window `false`
- active instruments `6`

Failure classification:

None. This was a passing durable handoff plus `current_target` proof. It proves scoped durable application and browser-visible state, not listener preference.

Smallest layer changed:

Reusable proof-pack helper/CLI, app source override, and proof-pack example docs. Riddle Proof core did not need a change.

Next sharper question:

Can this durable handoff become the default follow-on step after approved packets for more creative strategies than `mix-level-search`?

## Project note

The ratchet is not a pass. The ratchet is the next sharper question.

## Runner note

The local Playwright runner wrote complete passing artifacts for Runs 002 and 003, then the wrapper process lingered after artifact write and had to be stopped. That is an ergonomics issue for runner shutdown behavior, not evidence of a Neon product failure. The example `profile-result.json` files are complete and passed.
