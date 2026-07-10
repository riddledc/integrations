# @riddledc/riddle-proof-riddle-client

## 0.4.2

### Patch Changes

- 2e32870: Add compositional Preview, Observation, Change, and Handoff receipts with source-bound Preview validation, canonical screenshot roles, truthful hosted lifecycle telemetry, receipt-driven PR rendering, and explicit shipping authorization. Align local Playwright failure-policy exits and artifact manifests with hosted semantics, and make the standalone Riddle client package a compatibility facade over the canonical core client.
- Updated dependencies [2e32870]
  - @riddledc/riddle-proof@0.8.78

## 0.4.1

### Patch Changes

- e28d175: Repack the initial public split packages through the trusted publishing release flow so npm consumers receive installable package metadata.

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

## 0.3.0

### Minor Changes

- Publish the hosted Riddle runtime client split as an isolated adapter package with clearer API boundaries.

## 0.2.0

### Minor Changes

- Release `@riddledc/riddle-proof-riddle-client` as the hosted Riddle runtime client
  adapter.

  The package exposes:

  - Hosted job submission helpers
  - Balance and preview helpers
  - Polling and artifact helpers
  - Run profile helpers for script/result status orchestration
