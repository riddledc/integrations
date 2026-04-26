# @riddledc/riddle-proof

## 0.5.22

### Patch Changes

- Make OpenClaw proof inputs more forgiving by preserving invalid freeform `reference` text as metadata while ignoring it as a baseline selector.

## 0.5.21

### Patch Changes

- Preserve query strings when capturing and matching proof routes so query-driven SPA pages are not misclassified as wrong-route captures.

## 0.5.20

### Patch Changes

- 1038a58: Record recon build and capture subphase timings and surface them in OpenClaw status and inspect timing summaries.

## 0.5.19

### Patch Changes

- 4771be7: Clarify implementation-gap status by surfacing implementation agent attempt telemetry and distinguishing pre-agent gaps from post-attempt no-diff cases.

## 0.5.18

### Patch Changes

- a4824b2: Persist and surface structured implement-gap diagnostics through the proof runtime and OpenClaw wrapper.

## 0.5.17

### Patch Changes

- 968c52a: Expose verify artifact contract, production, and usage summaries through the proof assessment contract and OpenClaw inspection surfaces.

## 0.5.16

### Patch Changes

- 72f910a: Improve proof monitoring guidance and speed up verify builds.

## 0.5.15

### Patch Changes

- a32f02b: Emit real verify runtime phase events for build, capture, and assessment so status and inspect can report verify subphase timings on live proof runs.

## 0.5.14

### Patch Changes

- e555136: Honor learned root-path capture hints during recon so proof runs stop wasting retries on distracting route literals.

## 0.5.13

### Patch Changes

- a6fbae0: Add timing summaries, opt-in debug status payloads, and reusable last-good capture hints for faster proof runs.

## 0.5.12

### Patch Changes

- bba5a57: Prune stale proof scratch worktrees when local temp storage is low, and add clearer status diagnostics when an OpenClaw monitor passes a non-wrapper state path.

## 0.5.11

### Patch Changes

- 65c5165: Add monitor-facing status fields so OpenClaw can continue through routable proof checkpoints instead of reporting intermediate states as final failures.

## 0.5.10

### Patch Changes

- b65fed0: Hold non-shipping proof runs at `ready_to_ship` after a ready proof assessment instead of re-entering verify or advancing toward ship.

## 0.5.9

### Patch Changes

- 3cd4e9b: Give normal proof runs more default iteration runway while adding per-stage loop caps so recon, authoring, implementation, verification, and non-shipping auto-review can complete without allowing a bad phase to spin indefinitely.

## 0.5.8

### Patch Changes

- 61f1218: Default proof-run scratch worktrees to local temp storage so dependency cache materialization does not crawl on shared workspace filesystems.

## 0.5.7

### Patch Changes

- 0427377: Materialize cached Riddle Proof node_modules with hardlinks or copies instead of symlinks so server-preview tarballs cannot be rejected for symlinked dependency directories.

## 0.5.6

### Patch Changes

- fb219e9: Cache Riddle Proof dependency installs across proof runs by package/lockfile fingerprint so repeated browser proof runs can reuse installed node_modules instead of reinstalling for each new worktree.

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
