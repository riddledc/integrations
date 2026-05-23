# @riddledc/riddle-worker-contract

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

## 0.1.2

### Patch Changes

- Publish public worker/job/result contracts used by hosted runner integrations and scheduling metadata.

## 0.1.1

### Patch Changes

- Publish the new `@riddledc/riddle-worker-contract` package with shared public worker
  contracts used by public runners and hosted scheduling.

  Contracts include:

  - job payload v2 and runner manifest shapes
  - result and artifact role types
