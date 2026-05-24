# @riddledc/riddle-proof-app-contract

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

- Split app contract helpers into a first-class package and add typed contract/ redaction APIs for stable proof instrumentation.

## 0.2.0

### Minor Changes

- Introduce the new `@riddledc/riddle-proof-app-contract` package as the dedicated,
  stable browser contract helper for exposing minimal proof state to proof profiles.

  Exports include:

  - `installRiddleProofContract`
  - `readRiddleProofContract`
  - Redaction helpers (`redactObject`, `createDefaultSensitivePaths`)
  - App contract types and payload builders
