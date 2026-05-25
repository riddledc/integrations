# @riddledc/riddle-proof-packs

## 0.6.3

### Patch Changes

- 335eb97: Preserve tiny audio metric values in human-review Markdown instead of rounding them to zero.

## 0.6.2

### Patch Changes

- c82a9f0: Add tracked-instrument section energy receipts to audio mix heuristics and human-review Markdown.

## 0.6.1

### Patch Changes

- ef0898a: Show section-energy details for every human-review packet candidate with baseline, candidate, delta, floor, and guardrail columns.

## 0.6.0

### Minor Changes

- 5d6e125: Add audio section-energy and loudness-style heuristics for Neon ratchet review packets.

## 0.5.2

### Patch Changes

- ffb594e: Add supported and rejected candidate tables to human-review packet Markdown so review artifacts show candidate actions, target movement, receipt status, and ranking hints without requiring raw JSON inspection.

## 0.5.1

### Patch Changes

- 407626a: Add a reusable Neon approved-candidate profile helper that turns a human-review packet recommendation into a one-candidate approval proof profile.

## 0.5.0

### Minor Changes

- b516e73: Add a Neon durable current-target profile, helper exports, and production proof example for verifying approved durable mix overrides against app contract state, visible mixer state, and render guardrails without treating the result as a taste verdict.

## 0.4.9

### Patch Changes

- cdaba03: Add a deep Neon exploration proof-pack profile for slower pre-deploy song/part/window sweeps, with restoration assertions and docs for the two-speed local ratchet pattern.

## 0.4.8

### Patch Changes

- 9b19f72: Harden the Neon playback-sync proof pack so it waits for visible playback, reads the nested playback contract fields, and asserts that playback is running with the trainer playhead advanced after the Play interaction.

## 0.4.7

### Patch Changes

- 572d24f: Add durable candidate patch-plan helpers, a CLI, and Neon Run 008 evidence for the approved-packet to scoped-source handoff.

## 0.4.6

### Patch Changes

- 3f89a41: Add the Neon approved-candidate ratchet profile, example proof evidence, and review-packet approval/application fields.

## 0.4.5

### Patch Changes

- 4e34db8: Add the `riddle-proof-review-packet` CLI for extracting proof-emitted human-review packets into compact JSON and Markdown handoff artifacts.

## 0.4.4

### Patch Changes

- c9d35c7: Add reusable human-review packet helpers for extracting proof-emitted review packets and formatting compact JSON/Markdown handoffs without treating ranking as a taste score.

## 0.4.3

### Patch Changes

- 7f36b98: Update the Neon ratchet-loop pack to assert the app-level `humanReviewPacket` handoff, and add Run 006 evidence showing supported claim candidates, objective guardrails, review-order ranking, state restoration, and listening caveats without claiming automated taste.

## 0.4.2

### Patch Changes

- e29374c: Add the Neon Run 005 bounded song/mix exploration profile update and final passing sweep evidence, documenting how the pack catches objective audio guardrail failures without claiming automated taste.

## 0.4.1

### Patch Changes

- 46f45a6: Remove the legacy improvement threshold from the Neon ratchet-loop profile and keep the public pack framed around receipt-supported claim candidates for human review.

## 0.4.0

### Minor Changes

- bd68a01: Add the Neon bounded ratchet-loop proof profile for the `mix-level-search` strategy.

## 0.3.0

### Minor Changes

- 61b8b86: Add the audio-mix authoring pack and the Neon Step Sequencer ratchet-lab proof profiles, case-study notes, metrics schema, and human-review rubric.

## 0.2.2

### Patch Changes

- Refresh package metadata for the Riddle Proof 0.8.1 framework level-set.
- Updated dependencies
  - @riddledc/riddle-proof@0.8.1

## 0.2.1

### Patch Changes

- e28d175: Repack the initial public split packages through the trusted publishing release flow so npm consumers receive installable package metadata.

## 0.2.0

### Minor Changes

- 53599cb: Publish the first pass of the open Riddle Proof framework split:
  - documented public boundary between framework, proof packs, and hosted runtime
  - added reusable proof pack package with atomic evidence-language
  - added app contract helper package for lightweight app instrumentation
  - extracted hosted runtime adapters into a dedicated package
  - added local Playwright runner package
  - added worker contract package used for public job/runner/result/schema sharing
  - added runner examples as public reference implementations

### Patch Changes

- Updated dependencies [53599cb]
  - @riddledc/riddle-proof@0.7.227

## 0.1.2

### Patch Changes

- Publish reusable proof profiles and pack discovery helpers so proof setups can be composed from package artifacts.
- Updated dependencies
  - @riddledc/riddle-proof@0.7.228

## 0.1.1

### Patch Changes

- Add a new `@riddledc/riddle-proof-packs` package that publishes reusable proof-pack fixtures and helper metadata APIs:

  - `RIDDLE_PROOF_PACK_PROFILES`
  - `RIDDLE_PROOF_PACK_MANIFEST`
  - `listRiddleProofPackProfiles`
  - `getRiddleProofPackProfile`
  - `getRiddleProofProfilesByPackId`
  - `getPackEnabledRiddleProofProfiles`

- Updated dependencies
  - @riddledc/riddle-proof@0.7.227
