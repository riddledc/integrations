# @riddledc/riddle-proof-runner-playwright

## 0.4.0

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

## 0.3.0

### Minor Changes

- Add the local Playwright runner package as the first-class self-hosted execution path for profile mode.

### Patch Changes

- Updated dependencies
  - @riddledc/riddle-proof@0.7.228

## 0.2.0

### Minor Changes

- Publish `@riddledc/riddle-proof-runner-playwright` as the local Playwright-based
  execution path for profile mode.

  Highlights:

  - Local profile runner entrypoint (`riddle-proof-playwright`)
  - Setup actions, check evaluation, artifact capture, and manifest writing
  - Output layout compatible with the `riddle-proof` result contracts

### Patch Changes

- Updated dependencies
  - @riddledc/riddle-proof@0.7.227
