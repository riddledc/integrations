# Riddle Proof Extraction Plan

Riddle Proof is the reusable proof workflow behind evidence-backed agent changes.
The public package set now owns the OpenClaw proof wrapper, checkpoint engine,
and bundled runtime assets that were first proven in a private OpenClaw
prototype.

See `docs/riddle-proof-hardening.md` for operational requirements captured from
real OpenClaw dogfood runs.

## Product Boundary

Riddle Proof does not supply the coding agent. It supplies the orchestration,
evidence, judgment, and shipping contracts that make an agent-authored change
auditable before human merge.

It should be more than a skill prompt. The package boundary should preserve the
hard part of the working flow: taking an idea through server-backed proof,
agent execution, verification, PR creation, CI, and integration updates.

The durable product promise is:

> Bring your agent. Riddle brings the proof.

## Architecture Boundary

Keep the working implementation stable while extracting reusable logic into
thin, typed layers:

```text
@riddledc/riddle-proof
  reusable contracts, state/result helpers, evidence helpers,
  integration adapters, adapter interfaces

@riddledc/openclaw-riddle-proof
  wrapper that consumes @riddledc/riddle-proof and exposes the
  riddle_proof_change OpenClaw tool surface

@riddledc/riddle-proof-run
  server-aware setup, implementation, proof capture, judge, ship, and notify
  checkpoint engine plus bundled lobster/Python runtime assets

future integrations
  CLI, GitHub Action, Discord bridge, Riddle-hosted workflow wrappers around
  the same harness
```

Avoid plugin-in-plugin recursion. Wrappers should call reusable logic directly
through adapters rather than invoking another plugin as a transport layer.

## Compatibility Rules

- Keep instance-specific repos limited to config, deployment defaults, and
  credentials.
- Keep the public package contracts stable enough for OpenClaw, Codex, Claude
  Code, CLI, GitHub Action, and hosted Riddle integrations to consume.
- Preserve result shape, ship gates, and Discord/GitHub metadata through
  package tests before changing production routing.
- Treat the old private implementation as historical lineage, not as the
  supported user-facing path.

## First Stable Contracts

- `RiddleProofRunParams`
- `RiddleProofRunResult`
- `RiddleProofRunState`
- `RiddleProofEvent`
- `RiddleProofEvidenceBundle`
- `RiddleProofAssessment`
- `SetupAdapter`
- `ImplementationAdapter`
- `ProofAdapter`
- `JudgeAdapter`
- `ShipAdapter`
- `NotificationAdapter`

## Idea To PR Harness

The part that moves a request from "please change this" to "here is a PR with
proof" is the execution harness, not the thin OpenClaw wrapper by itself.

The harness should be the reusable implementation of this sequence:

- intake: normalize the request and integration context
- setup: prepare the repository, branch, auth, server config, and preview target
- implement: hand the change request to the configured coding agent
- prove: run the Riddle server-backed capture/evidence path
- judge: compare evidence against assertions and success criteria
- ship: commit, push, open or update the PR, and wait for CI when configured
- notify: update Discord, OpenClaw, GitHub, or another integration

The public package set now carries this behavior. Future extraction should make
individual adapters cleaner without moving product logic back into private
OpenClaw repos.

## First Reusable Logic

The package now owns the low-risk pieces that were already stable:

- terminal result shape
- run state/event shape
- ship metadata normalization
- OpenClaw parameter normalization
- evidence bundle and proof assessment types
- adapter interfaces
- event/state shape

The current extraction layer is the reusable engine harness. It drives the
packaged `@riddledc/riddle-proof-run` checkpoint engine directly, persists
wrapper run state, emits stage heartbeats, exposes cheap status snapshots, and
stops at concrete blockers when the engine, isolated worktree, or agent adapter
is missing.

The legacy private `proofed_change_run` plugin is no longer part of the public
workflow. OpenClaw users should use `riddle_proof_change`; instance-specific
repos should only carry deployment/config defaults, not the proof engine or
runtime scripts.

## Packaging Target

The public Riddle Proof package set should give users a real integration path,
not just instructions:

- `@riddledc/riddle-proof`: shared run contracts, helper functions, the runner
  harness, and adapter interfaces
- `@riddledc/riddle-proof-run`: packaged checkpoint engine plus bundled
  lobster/Python runtime assets
- `@riddledc/openclaw-riddle-proof`: the OpenClaw tool wrapper and adapter
  wiring point
- examples and parity fixtures: a documented way to exercise a fake or dry-run
  harness without touching production integrations

Hosted Riddle infrastructure can remain a configured service boundary. The npm
packages must not publish Riddle secrets, Discord credentials, GitHub tokens, or
OpenClaw-instance-specific configuration.

## OpenClaw Wrapper

The OpenClaw package shape is:

```text
plugin id: openclaw-riddle-proof
tool name: riddle_proof_change
review tool: riddle_proof_review
package: @riddledc/openclaw-riddle-proof
core dependency: @riddledc/riddle-proof
engine dependency: @riddledc/riddle-proof-run
```

The wrapper should:

- translate OpenClaw tool params into `RiddleProofRunParams`
- call `@riddledc/riddle-proof/openclaw` for the OpenClaw-specific translation
- hand off to configured setup, implementation, proof, judge, ship, and notify
  adapters
- optionally pause final proof judgment for the main OpenClaw agent with a
  screenshot/evidence review packet, then resume via `riddle_proof_review`
- pass Discord/OpenClaw context as `integration_context`
- return `RiddleProofRunResult`
