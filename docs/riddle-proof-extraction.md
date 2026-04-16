# Riddle Proof Extraction Plan

Riddle Proof is the reusable proof workflow behind evidence-backed agent changes.
The current OpenClaw `proofed_change_run` plugin remains the working reference
implementation until the package below reaches parity.

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

OpenClaw proofed_change_run
  current working reference; do not rewrite in place during extraction

@riddledc/openclaw-riddle-proof
  @riddledc/openclaw-riddle-proof wrapper that consumes @riddledc/riddle-proof
  and exposes the OpenClaw tool surface

Riddle execution harness
  server-aware setup, implementation, proof capture, judge, ship, and notify
  adapters that move a request from idea to PR

future integrations
  CLI, GitHub Action, Discord bridge, Riddle-hosted workflow wrappers around
  the same harness
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

The current OpenClaw `proofed_change_run` and `riddle-proof` skill/pipelines are
the reference implementation for this behavior. The extraction should convert
that reference into typed adapters and parity tests before any production route
switches to the new wrapper.

## First Reusable Logic

The package now owns the low-risk pieces that were already stable:

- terminal result shape
- run state/event shape
- ship metadata normalization
- OpenClaw parameter normalization
- evidence bundle and proof assessment types
- adapter interfaces
- event/state shape

The next extraction layer is the reusable engine harness. It drives the current
`riddle-proof-run` checkpoint engine directly, persists wrapper run state, emits
stage heartbeats, exposes cheap status snapshots, and stops at concrete blockers
when the engine, isolated worktree, or agent adapter is missing.

Keep the old `proofed_change_run` plugin as the production route until the new
engine harness has a configured agent adapter and parity tests prove the full
idea-to-PR path.

## Packaging Target

The public Riddle Proof package set should give users a real integration path,
not just instructions:

- `@riddledc/riddle-proof`: shared run contracts, helper functions, the runner
  harness, and adapter interfaces
- `@riddledc/openclaw-riddle-proof`: the OpenClaw tool wrapper and adapter
  wiring point
- examples and parity fixtures: a documented way to exercise a fake or dry-run
  harness without touching production integrations

Hosted Riddle infrastructure can remain a configured service boundary. The npm
packages must not publish Riddle secrets, Discord credentials, GitHub tokens, or
OpenClaw-instance-specific configuration.

## Future OpenClaw Wrapper

Create a new wrapper before replacing the current reference plugin. A likely
shape is:

```text
plugin id: riddle-proof
tool name: riddle_proof_change
review tool: riddle_proof_review
package: @riddledc/openclaw-riddle-proof
core dependency: @riddledc/riddle-proof
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
- leave the current `proofed_change_run` plugin untouched until parity is
  proven
