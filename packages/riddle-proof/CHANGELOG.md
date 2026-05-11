# @riddledc/riddle-proof

## 0.7.2

### Patch Changes

- Allow audit/no-diff verify runs to accept implementation_status=not_required, skip after-worktree implementation evidence, and judge current target evidence directly.

## 0.7.1

### Patch Changes

- 62d26d7: Mechanically enforce audit/no-diff runs by skipping implementation, disabling ship, preserving no-diff request flags, and exposing the controls through the OpenClaw wrapper schema.

## 0.7.0

### Minor Changes

- 9341a9d: Add CI/profile mode with a durable profile/result schema, hosted Riddle `run-profile` CLI command, profile script generation, artifact-backed result collection, and docs for generic page/layout proof profiles.

## 0.6.0

### Minor Changes

- 716da8d: Promote reusable basic-gameplay proof primitives: progression assertions, artifact-backed screenshot resolution, state/state-call metric metadata, catch records, JSON-safe text compaction, and public action/assertion contract constants.

## 0.5.57

### Patch Changes

- Measure visual delta directly from before/after screenshot artifacts when possible and keep unmeasured visual-delta proofs in verify recovery instead of supervisor review.

## 0.5.56

### Patch Changes

- Promote reusable server-preview proof helpers, add the `riddle-server-preview` CLI command, and add a basic-gameplay catch summary helper for durable proof stories.

## 0.5.53

### Patch Changes

- Add a markdown checkpoint view for readable sole-agent review of the current obligation, evidence, allowed decisions, response template, and next command.

## 0.5.52

### Patch Changes

- Refuse flag-based checkpoint responses that would submit generated placeholder payloads, while keeping templates useful for sole-agent review.

## 0.5.51

### Patch Changes

- Add a sole-agent checkpoint CLI view and flag-based checkpoint responses for the host-agnostic durable loop.

## 0.5.50

### Patch Changes

- Hard-cap local-agent prompt payloads so recon retries cannot balloon into slow six-figure character prompts.

## 0.5.49

### Patch Changes

- Add run-card observability for engine/agent timings, retry/recovery summaries, and local-agent prompt size metrics.

- Tighten local-agent prompt compaction while preserving recon/proof priority fields.

## 0.5.48

### Patch Changes

- Route recoverable ship/verify blockers through their checkpoint recovery stage instead of terminally blocking when the contract can continue.

- Retry no-diff implementation-agent attempts inside the existing bounded stage loop before escalating as non-convergent.

## 0.5.47

### Patch Changes

- Add generic local-agent aliases for the CLI loop surface: `riddle-proof-loop --agent local`, `doctor local`, and `@riddledc/riddle-proof/local-agent`.

- Preserve persisted run-card evidence context in status snapshots and allow CLI smokes to point at an explicit test engine module.

## 0.5.46

### Patch Changes

- Promote the local CLI agent adapter into the reusable Riddle Proof package, add the `riddle-proof-loop` CLI, and persist compact run cards for durable loop supervision.

- Extend portable checkpoint packets/responses across recon and implementation stages so CLI, Codex, Claude Code, OpenClaw, or another host can drive the same run contract without OC-specific proof logic.

## 0.5.45

### Patch Changes

- Route proof assessment and visual evidence recovery through portable checkpoint packets.

  OpenClaw review submissions now answer pending checkpoint packets while preserving the existing `riddle_proof_review` surface.

## 0.5.44

### Patch Changes

- 8129dcd: Route missing required visual-delta proof metrics back into verify/evidence recovery instead of marking them ready to ship or downgrading them to generic richer-proof requests.

## 0.5.43

### Patch Changes

- Publish Riddle visual diff metrics through the proof pipeline and add a Playwright page.evaluate argument guardrail.

## 0.5.42

### Patch Changes

- Harden canvas-first Riddle Proof runs by accepting large visible canvas captures and passing playability evidence even when DOM text is sparse, add actionable diagnostics for unmeasured visual deltas, and expose compact OpenClaw progress updates with preemption recovery guidance.

## 0.5.41

### Patch Changes

- dc3e9b1: Make checkpoint response retries idempotent when blocking decisions retain the pending checkpoint packet, and expose duplicate response counts in compact checkpoint summaries.

## 0.5.40

### Patch Changes

- a26a41e: Harden checkpoint status reporting with compact checkpoint summaries, explicit wrapper/engine/resume state paths, persisted proof-authoring contracts, deterministic duplicate response handling, and compact-by-default OpenClaw status output.

## 0.5.39

### Patch Changes

- 6e92d0c: Add Riddle Proof checkpoint packets/responses with author-checkpoint resume support, and wire OpenClaw checkpoint dispatch modes plus checkpoint-response review resume.

## 0.5.38

### Patch Changes

- Move generated Riddle Proof worktrees and dependency caches to disk-backed scratch storage by default and record scratch disk snapshots during setup.

## 0.5.37

### Patch Changes

- Add a reusable playable/gameplay proof contract that requires accepted input, state/time progression, and measured playfield/canvas motion before interactive game proof can pass.

## 0.5.36

### Patch Changes

- Add server/build preview status recovery helpers so interrupted `sp_...` and `bp_...` preview jobs can be checked later and screenshot artifacts can be downloaded into the workspace.

## 0.5.35

### Patch Changes

- Expose reusable visual proof-session inputs through the OpenClaw wrapper.

## 0.5.34

### Patch Changes

- Add visual proof-session fingerprints and resume-session state support for iterative proof runs.

## 0.5.33

### Patch Changes

- Block ready-to-ship visual proofs unless the proof evidence includes a measured, passing visual delta.

## 0.5.32

### Patch Changes

- 5a045d2: Honor explicit proof-stage advancement when a stale checkpoint continuation flag is also present, and stop sending that stale flag after implementation handoff.

## 0.5.31

### Patch Changes

- 245ecea: Reject cached capture hints for a different browser route when the current request explicitly names a route, preventing stale last-good proof paths from leaking across unrelated runs.

## 0.5.30

### Patch Changes

- 8a37890: Preserve requested no-production reference choices through setup so preflight can report semantic production-reference skip reasons in live proof runs.

## 0.5.29

### Patch Changes

- ad3516c: Record skipped production-reference reasons in proof state and surface them through the OpenClaw plugin while ignoring expected-absence false evidence.

## 0.5.28

### Patch Changes

- Preserve literal proof request text when shipping PRs by invoking git and gh without shell interpolation.

## 0.5.27

### Patch Changes

- Avoid reusing route-specific capture hints based only on verification mode, while preserving root-path hint reuse.

## 0.5.26

### Patch Changes

- 0c9a5e6: Read proof evidence from enriched artifact JSON consistently across verify decisions and evidence bundles.

## 0.5.25

### Patch Changes

- b494f15: Preserve structured proof evidence when a capture script throws after writing evidence, while still failing the capture.

## 0.5.24

### Patch Changes

- d30b632: Preserve finalized ready/shipped wrapper run state when an older background harness attempt finishes later.

## 0.5.23

### Patch Changes

- 61022dd: Ignore `.codex` and `.oc-smoke` tool artifacts when deciding whether implementation produced a material git diff.

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
