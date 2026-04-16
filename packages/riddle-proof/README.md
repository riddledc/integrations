# @riddledc/riddle-proof

Reusable contracts and helpers for Riddle Proof: evidence-backed workflows for
agent-authored changes.

Riddle Proof is agent-agnostic. Bring a coding agent through an adapter; Riddle
Proof standardizes evidence, proof assessment, ship gates, terminal results,
and integration metadata.

This package is intentionally small at first. The current OpenClaw
`proofed_change_run` implementation remains the reference workflow while
reusable contracts and low-risk helpers are extracted here.

## Initial Scope

- Run/result/state/event types
- Evidence bundle and proof assessment types
- Adapter interfaces
- State/event helpers for wrappers that need a stable run envelope
- Terminal ship metadata normalization
- Stable result helpers
- OpenClaw parameter normalization via `@riddledc/riddle-proof/openclaw`

## Non-Goals

- Supplying a coding agent
- Replacing the working OpenClaw plugin in place
- Invoking OpenClaw plugins from inside other plugins

Future wrappers can consume this package from OpenClaw, Discord, CLI, GitHub
Actions, or Riddle-hosted workflows.

## Install

```sh
npm install @riddledc/riddle-proof
```

## Usage

```ts
import { createRunResult, createRunState } from "@riddledc/riddle-proof";
import { toRiddleProofRunParams } from "@riddledc/riddle-proof/openclaw";
```

The root export provides generic contracts and helpers. Integration-specific
adapters are exposed through subpaths such as
`@riddledc/riddle-proof/openclaw`, so wrappers can reuse the mapping logic
without depending on another plugin runtime.

## OpenClaw Adapter Boundary

`@riddledc/riddle-proof/openclaw` translates the current
`proofed_change_run`-style tool params into generic `RiddleProofRunParams`.
It preserves Discord routing metadata as `integration_context` and parses
`assertions_json` into the shared assertions field.

The adapter does not invoke another OpenClaw plugin and does not supply a
coding agent. It is the reusable mapping layer a future OpenClaw wrapper can
call before handing the request to its configured implementation, judge, ship,
and notification adapters.
