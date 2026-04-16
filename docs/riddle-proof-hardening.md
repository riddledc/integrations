# Riddle Proof Hardening Notes

This checklist captures feedback from an OpenClaw run against the older
`proofed_change_run` path. Treat it as acceptance criteria while extracting the
new reusable Riddle Proof harness.

## Run Observability

- Emit stage heartbeats for setup, recon, author, implement, prove, verify,
  ship, and notify.
- Include elapsed time, current stage, wait reason, blocker, run id, state path,
  worktree path, and branch in status events.
- Make a cheap status result available so an observer can ask where a run is
  without reading raw gateway logs.
- Gateway logs should identify `run_id`, `state_path`, `worktree_path`, branch,
  and current stage for every active proof run.

## Workspace Safety

- Do not implement inside a shared dirty `main` checkout.
- Setup adapters should create or reuse an isolated worktree and report the
  chosen worktree path, branch, and cleanup policy.
- Add a stale-worktree cleanup or reuse policy for `.riddle-proof-worktrees` so
  old proof branches do not pile up forever.
- A dirty shared checkout should be a blocker or explicit degraded mode, not an
  incidental warning.

## Tool Preflight

- Check model and tool availability before proof work starts.
- Embedding quota failures should degrade memory sync without repeated noisy
  retries.
- Image model adapters must not send unsupported options such as
  `reasoning: none` to models that reject them.
- Vision fallbacks should know unavailable providers or OAuth scopes before
  attempting them.

## Repository Discovery

- Do not guess entry files such as `src/main.jsx`.
- Discover files through `rg --files`, package metadata, Vite/React config, or
  framework-specific entry detection.
- A missing guessed file should route back to recon or implementation with a
  clear blocker.

## Proof Artifacts

- Label proof artifacts by role: `baseline`, `after_proof`, `incidental`, or
  `diagnostic`.
- When a proof image is produced, report whether it is baseline evidence,
  after-change proof, or only an incidental screenshot.
- The proof result should make the evidence bundle explicit enough for Discord,
  OpenClaw, GitHub, or a CLI wrapper to render without inference.

## Current Package Hooks

The `@riddledc/riddle-proof` package now exposes primitives for this:

- `run_id`, `current_stage`, `state_path`, `worktree_path`, and `branch` on run
  state/result objects.
- `appendStageHeartbeat` for integration-visible progress updates.
- `createRunStatusSnapshot` for cheap status responses.
- `PreflightAdapter` for upfront model/tool checks.
- `SetupAdapterResult.worktree_path`, `branch`, and `cleanup_policy` for
  isolated workspace behavior.
- `EvidenceReference.role` and `EvidenceArtifact.role` for explicit artifact
  meaning.
- `runRiddleProofEngineHarness` for driving the existing checkpoint engine
  directly while persisting wrapper run state and returning concrete blockers.
- `readRiddleProofRunStatus` for status-only integration checks.

The engine harness must block before implementation if the engine state does
not expose an isolated after-worktree. It must also refuse to advance after
implementation unless that worktree has a detectable diff or the configured
agent adapter explicitly reports one.
