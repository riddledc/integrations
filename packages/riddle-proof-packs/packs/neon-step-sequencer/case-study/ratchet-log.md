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

Neon can run a bounded ratchet loop that proposes mix-level candidates, applies each candidate, captures proof-window evidence, ranks candidates by objective metrics, and restores app state.

Profile:

`profiles/ratchet-loop-mix-level-search.json`

Evidence to capture:

- baseline proof-window score
- per-candidate proof-window score
- best candidate and objective improvement
- state restoration receipt
- compact caveats for human handoff

Possible outcomes:

- `candidate_found`: at least one candidate improves objective metrics.
- `needs_human_review`: evidence is valid but no objective candidate clears the threshold.
- `proof_insufficient`: the app contract or proof window does not provide enough evidence.
- `profile_calibration`: the chosen tracks, windows, or thresholds do not fit the target.

Observed status:

Passed on May 24, 2026 with `local-playwright`.

Observed evidence:

- strategy `mix-level-search`
- tested `6` candidates across `bass`, `chord`, `guitar`, and `rhythmSynth`
- baseline score `28.83345`
- best score `27.0708`
- objective improvement `1.7627`
- best candidate `chord -0.10` to level `0.28`
- loop status `candidate_found`
- app state restored after the run
- console fatal count `0`

Failure classification:

None. This was a passing `interaction_snapshots` loop proof, with an explicit listening-review caveat.

Smallest layer changed:

The app proof contract gained a generic `runRatchetLoop` method. The Neon-specific part is the `mix-level-search` strategy.

Next sharper question:

Can the pack explore song/mix combinations and produce a prioritized confidence map?

## Project note

The ratchet is not a pass. The ratchet is the next sharper question.

## Runner note

The local Playwright runner wrote complete passing artifacts for Runs 002 and 003, then the wrapper process lingered after artifact write and had to be stopped. That is an ergonomics issue for runner shutdown behavior, not evidence of a Neon product failure. The example `profile-result.json` files are complete and passed.
