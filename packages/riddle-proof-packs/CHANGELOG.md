# @riddledc/riddle-proof-packs

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
