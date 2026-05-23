# Runtime Adapter Contract

This document defines how adapters consume the proof framework in hosted and local runners.

## Adapter contract

An adapter should implement:

- `normalizeProfile` behavior for local policy defaults
- `runProfile` execution path
- `collectArtifacts` into proof bundle outputs
- `emitResult` in `RiddleProofProfileResult` shape
- Optional `recover` when a job is interrupted

## Runner contract expectations

`@riddledc/riddle-proof` exposes a generated profile script and a normalized result schema.

Adapters are responsible for:

- Browser lifecycle
- viewport orchestration
- navigation / interaction implementation
- artifact writing

Adapters are not expected to implement profile schema validation.

## Compatibility behavior

The same profile JSON must:

- execute identically on hosted and local runners when feature-parity is available
- produce comparable artifact keys (`console.json`, `dom-summary.json`, `proof.json`, screenshot PNGs)
- preserve pass/fail semantics and warning semantics where practical

## Error contract

When adapter execution fails before profile completion, return:

- `status: "failed"` with:
  - `error` message
  - optional `script_error` / `proof_error`
  - `missing_artifacts` where relevant

The proof framework should treat missing required artifacts as incomplete evidence, not as success.

