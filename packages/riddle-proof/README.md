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
- Terminal ship metadata normalization
- Stable result helpers

## Non-Goals

- Supplying a coding agent
- Replacing the working OpenClaw plugin in place
- Invoking OpenClaw plugins from inside other plugins

Future wrappers can consume this package from OpenClaw, Discord, CLI, GitHub
Actions, or Riddle-hosted workflows.
