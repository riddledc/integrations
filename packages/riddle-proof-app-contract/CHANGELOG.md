# @riddledc/riddle-proof-app-contract

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
