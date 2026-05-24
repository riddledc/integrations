# @riddledc/riddle-proof-packs

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
