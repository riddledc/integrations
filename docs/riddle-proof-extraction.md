# Riddle Proof Extraction Plan

Riddle Proof is the reusable proof workflow behind evidence-backed agent changes.
The current OpenClaw `proofed_change_run` plugin remains the working reference
implementation until the package below reaches parity.

## Product Boundary

Riddle Proof does not supply the coding agent. It supplies the orchestration,
evidence, judgment, and shipping contracts that make an agent-authored change
auditable before human merge.

The durable product promise is:

> Bring your agent. Riddle brings the proof.

## Architecture Boundary

Keep the working implementation stable while extracting reusable logic into
thin, typed layers:

```text
@riddledc/riddle-proof
  reusable contracts, evidence/result helpers, adapter interfaces

OpenClaw proofed_change_run
  current working reference; do not rewrite in place during extraction

future OpenClaw Riddle Proof wrapper
  new plugin/wrapper that consumes @riddledc/riddle-proof after parity tests

future integrations
  CLI, GitHub Action, Discord bridge, Riddle-hosted workflow
```

Avoid plugin-in-plugin recursion. Wrappers should call reusable logic directly
through adapters rather than invoking another plugin as a transport layer.

## Compatibility Rules

- Do not change the live `proofed_change_run` behavior as part of package
  scaffolding.
- Keep the current plugin as a reference fixture for result shape, ship gates,
  and Discord/GitHub metadata.
- Introduce a new wrapper under a new name before switching any production
  routing.
- Only migrate the existing OC route after the new wrapper passes parity tests
  against the reference workflow.

## First Stable Contracts

- `RiddleProofRunParams`
- `RiddleProofRunResult`
- `RiddleProofRunState`
- `RiddleProofEvent`
- `RiddleProofEvidenceBundle`
- `RiddleProofAssessment`
- `ImplementationAdapter`
- `JudgeAdapter`
- `ShipAdapter`
- `NotificationAdapter`

## First Reusable Logic

The initial package should avoid owning the full workflow loop. Start with
low-risk pieces that are already stable:

- terminal result shape
- ship metadata normalization
- evidence bundle and proof assessment types
- adapter interfaces
- event/state shape

Then extract higher-risk workflow behavior behind parity tests.

## Future OpenClaw Wrapper

Create a new wrapper before replacing the current reference plugin. A likely
shape is:

```text
plugin id: riddle-proof
tool name: riddle_proof_change
package: @riddledc/openclaw-riddledc or a sibling package
core dependency: @riddledc/riddle-proof
```

The wrapper should:

- translate OpenClaw tool params into `RiddleProofRunParams`
- provide the OC/Codex implementation and judge adapters
- pass Discord/OpenClaw context as `integration_context`
- return `RiddleProofRunResult`
- leave the current `proofed_change_run` plugin untouched until parity is
  proven
