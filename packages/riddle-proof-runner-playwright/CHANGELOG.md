# @riddledc/riddle-proof-runner-playwright

## 0.6.1

### Patch Changes

- 641e2cb: Add a validated, runtime-only `extraHTTPHeaders` option for trusted Playwright targets without persisting header credentials into proof artifacts.

## 0.6.0

### Minor Changes

- 312ff0a: Ground signed browser profile outcomes for deterministic negative and unresolved
  check reports while retaining passed-only contracts for successful sealed and
  durable transition proofs. Sealed-observation protocol v3 deliberately rejects
  archived v2 protocol objects so callers cannot inherit the stricter semantics
  without recapturing and recomposing their evidence.

## 0.5.0

### Minor Changes

- 52cd1c3: Bind sealed browser proofs to the exact normalized profile digest, perform a
  deterministic evidence reassessment, and reconstruct replay trust from
  independently supplied signer policies plus exact protocol contracts. Add a
  four-checkpoint browser-transition protocol with shared branches, distinct
  capture enforcement, and signed-capture partial-order validation.
- 52cd1c3: Add a deterministic sealed browser-profile protocol that grounds four exact
  browser facts, composes them through a checked 4-to-2-to-1 proof pyramid, and
  replays the resulting semantic checkpoint against independently supplied
  evidence and rule trust roots.

### Patch Changes

- Updated dependencies [52cd1c3]
  - @riddledc/riddle-proof-core@0.2.0

## 0.4.7

### Patch Changes

- a252146: Add optional Ed25519 grounded capture output that signs the exact persisted Playwright evidence bytes and records browser provenance.
- Updated dependencies [a252146]
  - @riddledc/riddle-proof-core@0.1.0

## 0.4.6

### Patch Changes

- 4535ba3: Preserve touch and mobile viewport capabilities through hosted and local profile runs.
- Updated dependencies [4535ba3]
  - @riddledc/riddle-proof@0.8.81

## 0.4.5

### Patch Changes

- 38064a1: Allow local Playwright runs to attach immutable Preview receipts and explicit source identity overrides to their Observation receipts.

## 0.4.4

### Patch Changes

- 2e32870: Add compositional Preview, Observation, Change, and Handoff receipts with source-bound Preview validation, canonical screenshot roles, truthful hosted lifecycle telemetry, receipt-driven PR rendering, and explicit shipping authorization. Align local Playwright failure-policy exits and artifact manifests with hosted semantics, and make the standalone Riddle client package a compatibility facade over the canonical core client.
- Updated dependencies [2e32870]
  - @riddledc/riddle-proof@0.8.78

## 0.4.3

### Patch Changes

- bd68a01: Clear local Playwright runner timeout timers after successful runs so timed profiles do not keep the CLI process open after artifacts are written.

## 0.4.2

### Patch Changes

- Refresh package metadata for the Riddle Proof 0.8.1 framework level-set.
- Updated dependencies
  - @riddledc/riddle-proof@0.8.1

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
