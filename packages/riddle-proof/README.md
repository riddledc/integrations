# @riddledc/riddle-proof

Reusable contracts and helpers for Riddle Proof: evidence-backed workflows for
agent-authored changes.

Riddle Proof is agent-agnostic. Bring a coding agent through an adapter; Riddle
Proof standardizes evidence, proof assessment, ship gates, terminal results,
and integration metadata.

This package includes the reusable runner harness that drives a request through
preflight, setup, implementation, proof capture, judgment, shipping, and notification
adapters. The current OpenClaw `proofed_change_run` implementation remains the
reference workflow while adapter implementations are extracted behind parity
tests.

## Initial Scope

- Run/result/state/event types
- Evidence bundle and proof assessment types
- Adapter interfaces
- State/event helpers for wrappers that need a stable run envelope
- Runner harness for preflight -> setup -> implement -> prove -> judge -> ship -> notify
- Stage heartbeat and run status snapshot helpers
- Worktree metadata and proof artifact role contracts
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
import { runRiddleProof } from "@riddledc/riddle-proof/runner";
import { toRiddleProofRunParams } from "@riddledc/riddle-proof/openclaw";
```

The root export provides generic contracts and helpers. Integration-specific
adapters are exposed through subpaths such as
`@riddledc/riddle-proof/openclaw`, so wrappers can reuse the mapping logic
without depending on another plugin runtime.

## Runner Harness

`runRiddleProof` is the reusable idea-to-PR workflow driver. It does not ship
credentials or a coding agent. It calls adapters supplied by the host
integration:

```text
preflight -> setup -> implement -> prove -> judge -> ship -> notify
```

The preflight adapter checks model/tool availability before proof work starts.
The setup adapter should report the isolated worktree path, branch, and cleanup
policy it chose. During the run, wrappers can emit `appendStageHeartbeat`
events and return `createRunStatusSnapshot` for cheap observer status.

The proof adapter is where a host wires Riddle server-backed capture. The ship
adapter is where a host commits, pushes, opens or updates a PR, and waits for CI
when configured. The notification adapter is where a host updates Discord,
OpenClaw, GitHub, or another integration.

## OpenClaw Adapter Boundary

`@riddledc/riddle-proof/openclaw` translates the current
`proofed_change_run`-style tool params into generic `RiddleProofRunParams`.
It preserves Discord routing metadata as `integration_context` and parses
`assertions_json` into the shared assertions field.

The adapter does not invoke another OpenClaw plugin and does not supply a
coding agent. It is the reusable mapping layer a future OpenClaw wrapper can
call before handing the request to its configured implementation, judge, ship,
and notification adapters.
