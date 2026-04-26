# @riddledc/openclaw-riddle-proof

## 0.4.50

### Patch Changes

- ac23714: Expose ignored freeform `reference` input and effective reference metadata in status and inspect output.

## 0.4.49

### Patch Changes

- 61022dd: Ignore `.codex` and `.oc-smoke` tool artifacts when deciding whether implementation produced a material git diff.
- Updated dependencies [61022dd]
  - @riddledc/riddle-proof@0.5.23

## 0.4.48

### Patch Changes

- Tighten proof authoring guidance for structured audio/data captures, including the correct Playwright wait timeout signature and how to persist browser-page proof evidence.

## 0.4.47

### Patch Changes

- Make OpenClaw proof inputs more forgiving by preserving invalid freeform `reference` text as metadata while ignoring it as a baseline selector, and expose whether background mode was requested or defaulted.
- Updated dependencies
  - @riddledc/riddle-proof@0.5.22

## 0.4.46

### Patch Changes

- Clarify detached monitor guidance so surfaces without `riddle_proof_wait` can poll `riddle_proof_status` using `monitor_should_continue`.

## 0.4.45

### Patch Changes

- Preserve query strings when capturing and matching proof routes so query-driven SPA pages are not misclassified as wrong-route captures.
- Updated dependencies
  - @riddledc/riddle-proof@0.5.21

## 0.4.44

### Patch Changes

- Report wrapper and dependency package metadata from status and inspect, and treat max-iteration blockers as terminal for monitor continuation.

## 0.4.43

### Patch Changes

- 1038a58: Record recon build and capture subphase timings and surface them in OpenClaw status and inspect timing summaries.
- Updated dependencies [1038a58]
  - @riddledc/riddle-proof@0.5.20

## 0.4.42

### Patch Changes

- b786722: Export explicit OpenClaw agent routing helpers for isolation-sensitive harnesses.

## 0.4.41

### Patch Changes

- d198e21: Treat an in-flight implementation attempt as a monitor hold state so detached monitors keep waiting for a real implementation outcome instead of surfacing the checkpoint as a generic retryable gap.

## 0.4.40

### Patch Changes

- f77204c: Retry the implementation Codex step once when the first successful response leaves no detectable git diff, and tighten the implementation prompt to require a git self-check before returning success.

## 0.4.39

### Patch Changes

- 8a53333: Clarify implement-gap reporting by distinguishing before-agent, during-agent, and after-agent no-diff states.

## 0.4.38

### Patch Changes

- 4771be7: Clarify implementation-gap status by surfacing implementation agent attempt telemetry and distinguishing pre-agent gaps from post-attempt no-diff cases.
- Updated dependencies [4771be7]
  - @riddledc/riddle-proof@0.5.19

## 0.4.37

### Patch Changes

- a4824b2: Persist and surface structured implement-gap diagnostics through the proof runtime and OpenClaw wrapper.
- Updated dependencies [a4824b2]
  - @riddledc/riddle-proof@0.5.18

## 0.4.36

### Patch Changes

- 968c52a: Expose verify artifact contract, production, and usage summaries through the proof assessment contract and OpenClaw inspection surfaces.
- Updated dependencies [968c52a]
  - @riddledc/riddle-proof@0.5.17

## 0.4.35

### Patch Changes

- 72f910a: Improve proof monitoring guidance and speed up verify builds.
- Updated dependencies [72f910a]
  - @riddledc/riddle-proof@0.5.16

## 0.4.34

### Patch Changes

- 538d58c: Add `riddle_proof_wait` for detached proof monitoring and expose an explicit monitor plan so callers can avoid ad hoc sleep loops around status polling.

## 0.4.33

### Patch Changes

- 450a53b: Preserve cached verify timing details in `riddle_proof_status` when the live engine snapshot is momentarily thinner than the final wake event payload.

## 0.4.32

### Patch Changes

- a32f02b: Emit real verify runtime phase events for build, capture, and assessment so status and inspect can report verify subphase timings on live proof runs.
- Updated dependencies [a32f02b]
  - @riddledc/riddle-proof@0.5.15

## 0.4.31

### Patch Changes

- 483d722: Tighten proof monitor poll cadence around resumable checkpoints and expose verify subphase timings in status and inspect output.

## 0.4.30

### Patch Changes

- e1f83e4: Treat resumable blocked checkpoints as non-terminal for terminal-only monitoring so wrappers keep holding replies through implementation and similar internal proof loops.

## 0.4.29

### Patch Changes

- 634bde7: Add explicit wrapper-side response gating for Riddle Proof runs. The public
  OpenClaw integration now accepts `report_mode: "terminal_only"` (or
  `wait_for_terminal: true`) and surfaces a structured `monitor_contract` in
  change, status, inspect, and wake outputs so detached monitors can keep polling
  until terminal state without relying on prompt wording.

## 0.4.28

### Patch Changes

- e555136: Honor learned root-path capture hints during recon so proof runs stop wasting retries on distracting route literals.
- Updated dependencies [e555136]
  - @riddledc/riddle-proof@0.5.14

## 0.4.27

### Patch Changes

- a6fbae0: Add timing summaries, opt-in debug status payloads, and reusable last-good capture hints for faster proof runs.
- Updated dependencies [a6fbae0]
  - @riddledc/riddle-proof@0.5.13

## 0.4.26

### Patch Changes

- 8564064: Expose semantic scratch cleanup status labels in OpenClaw proof status and inspect output, including skipped cleanup and removed worktree cases.

## 0.4.25

### Patch Changes

- 7b013d0: Surface Riddle Proof scratch cleanup status in OpenClaw status and inspect output, and block automatic ready review when structured proof evidence contains failed positive assertions.

## 0.4.24

### Patch Changes

- bba5a57: Prune stale proof scratch worktrees when local temp storage is low, and add clearer status diagnostics when an OpenClaw monitor passes a non-wrapper state path.
- Updated dependencies [bba5a57]
  - @riddledc/riddle-proof@0.5.12

## 0.4.23

### Patch Changes

- 65c5165: Add monitor-facing status fields so OpenClaw can continue through routable proof checkpoints instead of reporting intermediate states as final failures.
- Updated dependencies [65c5165]
  - @riddledc/riddle-proof@0.5.11

## 0.4.22

### Patch Changes

- b65fed0: Hold non-shipping proof runs at `ready_to_ship` after a ready proof assessment instead of re-entering verify or advancing toward ship.
- Updated dependencies [b65fed0]
  - @riddledc/riddle-proof@0.5.10

## 0.4.21

### Patch Changes

- 4cc0457: Normalize legacy OpenClaw plugin `defaultMaxIterations` values below 12 to the public proof-run minimum while preserving explicit per-run `max_iterations` overrides.

## 0.4.20

### Patch Changes

- 3cd4e9b: Give normal proof runs more default iteration runway while adding per-stage loop caps so recon, authoring, implementation, verification, and non-shipping auto-review can complete without allowing a bad phase to spin indefinitely.
- Updated dependencies [3cd4e9b]
  - @riddledc/riddle-proof@0.5.9

## 0.4.19

### Patch Changes

- 61f1218: Default proof-run scratch worktrees to local temp storage so dependency cache materialization does not crawl on shared workspace filesystems.
- Updated dependencies [61f1218]
  - @riddledc/riddle-proof@0.5.8

## 0.4.18

### Patch Changes

- b6206f2: Auto-advance main-agent proof review for non-shipping runs when proof inspection already marks the evidence as ready to ship.

## 0.4.17

### Patch Changes

- 0427377: Materialize cached Riddle Proof node_modules with hardlinks or copies instead of symlinks so server-preview tarballs cannot be rejected for symlinked dependency directories.
- Updated dependencies [0427377]
  - @riddledc/riddle-proof@0.5.7

## 0.4.16

### Patch Changes

- fb219e9: Cache Riddle Proof dependency installs across proof runs by package/lockfile fingerprint so repeated browser proof runs can reuse installed node_modules instead of reinstalling for each new worktree.
- Updated dependencies [fb219e9]
  - @riddledc/riddle-proof@0.5.6

## 0.4.15

### Patch Changes

- 8dee58c: Make OpenClaw proof runs background by default, skip useless shared dependency installs when the active workspace fingerprint does not match proof worktrees, reuse before-worktree dependencies for matching after worktrees, and expose richer status guidance for wake/watch monitoring.
- Updated dependencies [8dee58c]
  - @riddledc/riddle-proof@0.5.5

## 0.4.14

### Patch Changes

- 8ea62e9: Preserve real engine failure blockers during dry-run proofs and add dependency-install phase visibility during setup.
- Updated dependencies [8ea62e9]
  - @riddledc/riddle-proof@0.5.4

## 0.4.13

### Patch Changes

- 23f4ad4: Add proof workflow substep timing events and surface active engine substeps from OpenClaw status snapshots.
- Updated dependencies [23f4ad4]
  - @riddledc/riddle-proof@0.5.3

## 0.4.12

### Patch Changes

- bb14dbd: Run production background proof workflows in a worker thread so long-running recon, proof, and Codex subprocess work does not block the OpenClaw gateway from answering follow-up messages or status requests.

## 0.4.11

### Patch Changes

- 7f0d5f9: Fold the Riddle Proof checkpoint engine and bundled runtime into `@riddledc/riddle-proof`, and let the OpenClaw wrapper load that packaged engine by default instead of depending on a separate private runtime plugin.
- Updated dependencies [7f0d5f9]
  - @riddledc/riddle-proof@0.5.2

## 0.4.10

### Patch Changes

- c23a745: Move the Riddle Proof checkpoint engine and bundled runtime assets into the public integrations workspace, and label OpenClaw requests with the public `riddle_proof_change` tool name.
- Updated dependencies [c23a745]
  - @riddledc/riddle-proof@0.5.1

## 0.4.9

### Patch Changes

- f4c5ae2: Add generic authenticated proof inputs for OpenClaw wrappers: `auth_localStorage_json`, `auth_cookies_json`, and `auth_headers_json`.
- f2f7524: Add interface-agnostic background proof runs. `riddle_proof_change` now accepts
  `run_mode: "background"` (or plugin config `defaultRunMode: "background"`) to
  return a run state immediately while the proof continues in the gateway process.
  Background runs append a durable `run.wake.requested` event when they settle so
  Discord, Telegram, iMessage, CLI, or other OC surfaces can wake the originating
  session with the same status/inspect/review contract.
- Updated dependencies [f4c5ae2]
- Updated dependencies [7205bce]
  - @riddledc/riddle-proof@0.5.0

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
