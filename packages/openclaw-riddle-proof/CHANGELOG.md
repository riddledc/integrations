# @riddledc/openclaw-riddle-proof

## 0.4.8

### Patch Changes

- Extend `riddle_proof_inspect` with structured proof evidence fields so
  non-visual modes like audio can surface proof evidence presence, samples,
  result keys, and data outputs in the same compact review packet.

## 0.4.7

### Patch Changes

- Add `riddle_proof_inspect`, a compact proof-native review helper that reads a
  wrapper run state and returns route match, profile usage, artifact URLs,
  visual delta, semantic anchors, visible text samples, and the recommended
  review next action.

## 0.4.6

### Patch Changes

- Extend `riddle_proof_sync` with `update_base_checkout`, a safe post-merge
  fast-forward request for clean local base checkouts. The underlying engine
  reports the base checkout path, branch, clean state, local/remote heads, and
  whether the update ran, skipped, or failed.
- Updated dependencies
  - @riddledc/riddle-proof@0.4.5

## 0.4.5

### Patch Changes

- Add `riddle_proof_sync`, an explicit public tool for reconciling shipped proof
  runs after PR review or merge. The sync path checks PR lifecycle state through
  the configured engine, records merge metadata, and supports post-merge cleanup
  without mutating cheap status reads.
- Updated dependencies
  - @riddledc/riddle-proof@0.4.4

## 0.4.3

### Patch Changes

- 09d79bb: Add an explicit draft-hold escape hatch, preserve it through the engine harness,
  and tighten main-agent proof review guidance for subtle visual changes.
- Updated dependencies [09d79bb]
  - @riddledc/riddle-proof@0.4.2

## 0.4.2

### Patch Changes

- 68b060c: Add main-agent proof review support for OpenClaw Riddle Proof runs.

  The reusable harness can now resume from explicit workflow params, and the
  OpenClaw wrapper can pause final proof judgment at a structured
  `main_agent_proof_review_required` checkpoint. A new `riddle_proof_review` tool
  submits the main agent's verdict and resumes the same run.

- Updated dependencies [68b060c]
  - @riddledc/riddle-proof@0.4.1

## 0.4.1

### Patch Changes

- 1dc946d: Tighten visual proof assessment guidance so subtle or unmeasured UI deltas are not marked ready without a clearly legible before/after change.

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
