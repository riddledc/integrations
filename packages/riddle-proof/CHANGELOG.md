# @riddledc/riddle-proof

## 0.5.5

### Patch Changes

- 8dee58c: Make OpenClaw proof runs background by default, skip useless shared dependency installs when the active workspace fingerprint does not match proof worktrees, reuse before-worktree dependencies for matching after worktrees, and expose richer status guidance for wake/watch monitoring.

## 0.5.4

### Patch Changes

- 8ea62e9: Preserve real engine failure blockers during dry-run proofs and add dependency-install phase visibility during setup.

## 0.5.3

### Patch Changes

- 23f4ad4: Add proof workflow substep timing events and surface active engine substeps from OpenClaw status snapshots.

## 0.5.2

### Patch Changes

- 7f0d5f9: Fold the Riddle Proof checkpoint engine and bundled runtime into `@riddledc/riddle-proof`, and let the OpenClaw wrapper load that packaged engine by default instead of depending on a separate private runtime plugin.

## 0.5.1

### Patch Changes

- c23a745: Move the Riddle Proof checkpoint engine and bundled runtime assets into the public integrations workspace, and label OpenClaw requests with the public `riddle_proof_change` tool name.

## 0.5.0

### Minor Changes

- 7205bce: Add capture diagnostics helpers for redacted Riddle server preview evidence.

### Patch Changes

- f4c5ae2: Add generic authenticated proof inputs for OpenClaw wrappers: `auth_localStorage_json`, `auth_cookies_json`, and `auth_headers_json`.

## 0.4.5

### Patch Changes

- Add explicit sync workflow params for safe post-merge base checkout refreshes
  so public wrappers can request and report local base updates after PR merge.

## 0.4.4

### Patch Changes

- Add PR lifecycle sync state to the public run contract so wrappers can record
  whether a shipped PR is still open, merged, closed, or unavailable, along
  with merge commit/time and cleanup results.

## 0.4.2

### Patch Changes

- 09d79bb: Add an explicit draft-hold escape hatch, preserve it through the engine harness,
  and tighten main-agent proof review guidance for subtle visual changes.

## 0.4.1

### Patch Changes

- 68b060c: Add main-agent proof review support for OpenClaw Riddle Proof runs.

  The reusable harness can now resume from explicit workflow params, and the
  OpenClaw wrapper can pause final proof judgment at a structured
  `main_agent_proof_review_required` checkpoint. A new `riddle_proof_review` tool
  submits the main agent's verdict and resumes the same run.

## 0.4.0

### Minor Changes

- c3e55cb: Add the reusable Riddle Proof engine harness and OpenClaw status surface.

  The core package now exposes a checkpoint-driven harness for the existing
  `riddle-proof-run` engine, persistent run state, status snapshots, disabled
  agent-adapter blockers, and isolated-worktree safety checks before
  implementation can advance.

  The OpenClaw wrapper now exposes `riddle_proof_status` and can opt into engine
  mode with explicit runtime config while preserving the default blocked
  normalization behavior.

## 0.3.0

### Minor Changes

- fd7395c: Add hardening contracts for proof-run observability and safer execution: run ids,
  current stage tracking, worktree metadata, stage heartbeats, cheap status
  snapshots, preflight adapters, setup cleanup metadata, and explicit proof
  artifact roles.

## 0.2.0

### Minor Changes

- bdcd00e: Add the Riddle Proof runner harness and the initial OpenClaw wrapper package for
  request normalization.

## 0.1.1

### Patch Changes

- 4c3cc8a: Add published package install and import examples to the README.

## 0.1.0

### Minor Changes

- a40cee4: Add the initial Riddle Proof reusable package with run/result/evidence contracts and terminal metadata helpers.
