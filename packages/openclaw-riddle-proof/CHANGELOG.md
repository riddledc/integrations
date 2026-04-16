# @riddledc/openclaw-riddle-proof

## 0.4.0

### Minor Changes

- 2ac69d1: Add an optional Codex exec agent adapter for engine-mode Riddle Proof runs.

## 0.3.0

### Minor Changes

- c3e55cb: Add the reusable Riddle Proof engine harness and OpenClaw status surface.

  The core package now exposes a checkpoint-driven harness for the existing
  `riddle-proof-run` engine, persistent run state, status snapshots, disabled
  agent-adapter blockers, and isolated-worktree safety checks before
  implementation can advance.

  The OpenClaw wrapper now exposes `riddle_proof_status` and can opt into engine
  mode with explicit runtime config while preserving the default blocked
  normalization behavior.

### Patch Changes

- Updated dependencies [c3e55cb]
  - @riddledc/riddle-proof@0.4.0

## 0.2.0

### Minor Changes

- fd7395c: Add hardening contracts for proof-run observability and safer execution: run ids,
  current stage tracking, worktree metadata, stage heartbeats, cheap status
  snapshots, preflight adapters, setup cleanup metadata, and explicit proof
  artifact roles.

### Patch Changes

- Updated dependencies [fd7395c]
  - @riddledc/riddle-proof@0.3.0

## 0.1.0

### Minor Changes

- bdcd00e: Add the Riddle Proof runner harness and the initial OpenClaw wrapper package for
  request normalization.

### Patch Changes

- Updated dependencies [bdcd00e]
  - @riddledc/riddle-proof@0.2.0
