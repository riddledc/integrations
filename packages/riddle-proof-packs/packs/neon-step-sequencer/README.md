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
- `profiles/deep-explore-songs-and-mixes.json`: slower pre-deploy exploration sweep for batching deterministic catalog, proof-window, clipping/headroom, and restoration findings before release.
- `profiles/ratchet-loop-mix-level-search.json`: bounded ratchet loop using the Neon `mix-level-search` strategy.
- `profiles/ratchet-loop-approved-candidate.json`: bounded ratchet loop that uses an explicit operator-approval surrogate, applies the supported candidate, and keeps the listening-review caveat visible.
- `profiles/durable-current-target.json`: final current-target audit that checks an approved durable mix override against app contract state, mix-profile source levels, visible mixer text, and basic render guardrails.

## Two-speed exploration

The exploration profiles are a two-speed ratchet:

- `explore-songs-and-mixes` keeps iteration fast by sampling a smaller bounded set.
- `deep-explore-songs-and-mixes` widens the same claim before deploy, asserts state restoration, and is intended for batching deterministic findings after the fast loop is clean.

Both profiles are `current_target` audits. They can find proof-window calibration overclaims, missing active lanes, source-prep gaps, clipping/headroom problems, browser failures, and stale state. Neither profile proves that a mix is artistically better.

## Ratchet loop strategy

The loop is not mix-specific as a proof concept. The proof concept is a bounded ratchet loop: propose a candidate, apply it, collect evidence, classify the result, restore or keep state, and repeat until the budget is exhausted.

This pack's first concrete strategy is `mix-level-search`, which turns small level edits into change-claim candidates. Each candidate says what action will be attempted, what receipts must support the claim, and what evidence should be reviewed afterward. The loop may include a ranking metric to order review, but the verdict comes from receipts and invariants, not from a universal mix-quality number. It still does not decide subjective mix taste; the output is a `humanReviewPacket` for listening handoff.

The v1 mixing-heuristics layer adds section-by-section energy comparison to that packet. For each tested candidate, the loop can record baseline section energy, candidate section energy, deltas, a loudness-style RMS-derived estimate, required section energy-floor preservation, and clipping/headroom/low-level guardrails. These fields make ranking more useful for review, but they are still evidence, not taste. Use wording such as `metric-supported`, `guardrail-preserving`, and `ranked for review`; do not say a candidate is better solely because the metrics moved.

The approved-candidate profile is the next handoff pattern after review-packet generation. It only applies a candidate when the app contract reports that the candidate's objective receipts passed, and the packet records `approvedCandidateApplied` plus the approval mode. The approval mode can keep development moving, but it is still an operator surrogate; it does not prove listener preference.

The durable patch handoff is a separate step after the approved-candidate proof. A follow-on agent can validate the applied `humanReviewPacket`, generate a scoped durable candidate plan, edit the app/config source, and then run a final `current_target` proof. That handoff proves the approved candidate became visible durable state in the running app. It still does not prove the mix is aesthetically better.

The durable current-target profile is that final gate as a reusable profile/helper pattern. It is useful after batching source/config changes because it checks the running target rather than the local patch plan: selected song, mix profile id, contract mixer levels, mix-profile source levels, visible level text, and a bounded render all have to agree.

## Example evidence

The `examples/` directory contains local Playwright proof results captured against LilArcade Neon Step Sequencer on May 24, 2026:

- `run-001-fast-mix-health`: passing `current_target` audit with proof contract, source readiness, mix RMS `0.1234`, peak `0.8321`, and no clipping.
- `run-002-mix-change`: passing `interaction_snapshots` proof where a bass-level edit moved bass RMS from `0.0507` to `0.1071` and mix RMS from `0.073` to `0.1264` without clipping.
- `run-003-full-matrix`: passing `current_target` viewport matrix across desktop, phone, iPad Mini, and iPad with `0 px` horizontal overflow.
- `run-004-ratchet-loop-mix-level-search`: passing `interaction_snapshots` proof where a bounded loop tested six mix-level change-claim candidates, found a supported `chord -0.10` candidate, recorded receipt-level verdicts, and restored app state without keeping the edit.
- `run-005-explore-songs-and-mixes-final`: passing `current_target` exploration sweep across four songs and eight song/part entries, with `8` passing entries, `0` prioritized findings, and no clipping after the local app-contract and mix-headroom ratchet.
- `run-006-ratchet-loop-human-review-packet`: passing `interaction_snapshots` proof where the same bounded loop returned a compact `humanReviewPacket` with the recommended `chord -0.10` candidate, objective guardrails, `review_order_only` ranking, state restoration, and explicit listening caveats.
- `run-007-approved-candidate-applied`: passing `interaction_snapshots` proof where an explicit `mixing_canon_surrogate` approval mode applied the supported `chord -0.10` candidate for listening review and recorded `approvedCandidateApplied`.
- `run-008-durable-mix-patch-handoff`: passing durable handoff example where the applied packet became a scoped source/config plan for `chord: 0.28`, followed by a `current_target` proof showing the running app saw the durable level without clipping or low-level windows.
- `run-009-deep-exploration-production`: passing `current_target` deep exploration proof against deployed LilArcade after the local ratchet fixed proof-window overclaim and hot preset clipping findings.
- `run-010-durable-current-target-production`: passing deployed `current_target` proof where the running app sees the approved durable `chord: 0.18` override in contract levels, mix-profile source levels, visible mixer text, and render guardrails.

## Naming note

The file `mix-change-before-after.json` keeps the project shorthand from the original Neon plan. The evidence-role pattern is `interaction_snapshots`: pre-action and post-action snapshots inside one proof run. It is not the universal Riddle Proof model.
