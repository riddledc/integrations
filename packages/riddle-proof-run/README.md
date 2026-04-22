# riddle-proof-run

`riddle_proof_run` is an OpenClaw plugin tool that wraps the `riddle-proof` workflow into one evidence-backed entrypoint.

It is meant for more than purely visual changes. The tool helps agents:
- set up a preview or review workspace
- capture before / prod baselines during recon
- finalize the proof plan after recon observations
- verify the after state against that established baseline context
- ship the branch or PR once evidence is ready
- inspect current workflow state

## Tool

`riddle_proof_run`

The OC tool is a thin wrapper over the local engine exported from
`dist/engine.js`. Harness code should import `createRiddleProofEngine()` and
call `engine.execute({ action: "run", ... })` directly instead of calling back
through the OpenClaw gateway. The public tool behavior stays the same; the
engine boundary exists so orchestrators can run/status/resume the workflow
in-process and inspect checkpoint contracts without plugin-in-plugin calls.

### Actions
- `setup`
- `recon`
- `implement`
- `verify`
- `ship`
- `status`
- `run` (checkpointed stage loop; use `continue_from_checkpoint` for the checkpoint's suggested next step, or `advance_stage` to override it explicitly)

Fresh `setup` and `run` calls return a `state_path`. Pass that `state_path`
back to resume or inspect the same workflow, especially when multiple Discord
threads are running proofs against the same repo.

Authenticated pages can use generic browser auth inputs without relying on a
site-specific token helper. Pass `auth_localStorage_json`, `auth_cookies_json`,
or `auth_headers_json` as JSON strings; the workflow injects them into Riddle
server previews and script captures, and diagnostics redact those fields. Keep
`use_auth:true` only for environments that have explicitly configured the
private Cognito token helper.

### `run` contract

`action=run` is still the canonical wrapper, but it now behaves like an explicit
stage loop instead of a mostly auto-chained conveyor belt.

- setup can still bootstrap the workflow for you
- recon still executes the capture attempt in the workflow wrapper, but the supervising agent now owns the judgment about whether the latest baseline is trustworthy, whether recon should retry/reframe, and when recon is done
- once recon has enough context and the supervising agent approves it, the wrapper keeps moving into author instead of stopping at a human-facing review
- checkpoints now try to expose a first-class continue target for agent-supervised auto-resume instead of defaulting to a human-facing stop
- every checkpoint response includes a `checkpointContract` object, and the same contract is persisted as `stage_decision_request.checkpoint_contract`, so a calling harness can see the accepted inputs, response schema, resume target, and any ship-gate status without parsing prose
- the calling agent can resume with `continue_from_checkpoint=true` after reviewing a checkpoint, or use `advance_stage=...` for manual override/recovery
- each stage attempt is recorded in state so repeated implement / verify / ship passes are first-class
- re-running implement invalidates stale after-proof state so the next recommendation returns to verify instead of ship
- verify now distinguishes between capture quality and proof strength, and it respects `verification_mode` plus richer artifacts instead of treating screenshots as the only proof
- ship is hard-blocked unless the current state has required recon baseline evidence, after evidence, `verify_status=evidence_captured`, and a supervising-agent `proof_assessment.decision=ready_to_ship`
- strong verify results can continue directly into ship so the PR becomes the main human review surface, while weak/ambiguous proof usually routes back into author/recon/implement before any human escalation

## Purpose

This packages the Riddle Proof checkpoint engine and bundled lobster/Python runtime as a first-class callable workflow runner so agents stop reconstructing the same preview, recon, implement, verify, and ship flow manually.

The important contract is:
- recon owns baseline discovery
- recon can capture baselines before the final `capture_script` exists
- every stage is treated as a bounded attempt with a persisted checkpoint
- the wrapper automates execution, artifacts, and bookkeeping
- the calling agent owns interpretation, retries, and stage advancement
- verify should mainly capture the after-proof on the path recon already established
- post-verify checkpoints should usually stay inside the agent control loop unless the workflow is genuinely failing to converge

Typical loop:
1. `run` to bootstrap setup/recon
2. inspect `reconAssessmentRequest`, `authorRequest`, or `proofPlanRequest`
3. resume `run` with the same `state_path` plus any updated inputs, especially `recon_assessment_json`, `author_packet_json`, or `proof_assessment_json`
4. once a checkpoint looks good, call `run` again with `continue_from_checkpoint=true` to follow that checkpoint's recorded continue stage
5. keep looping checkpoint review -> `continue_from_checkpoint=true` until verify either auto-ships or returns an internal retry target
6. when verify says the proof is strong enough, let the workflow continue to ship so the PR is what the human reviews
7. when verify says the proof is weak or ambiguous, follow its internal continue target (`author`, `recon`, or `implement`) before escalating upward
8. use `advance_stage=...` only when you intentionally want to override the checkpoint suggestion for debugging or recovery

State now carries `stage_attempts`, `stage_decision_request`, `active_checkpoint`, `continue_with_stage`, `last_requested_advance_stage`, `recon_assessment_request`, `recon_assessment`, `verify_status`, `verify_summary`, `verify_decision_request`, and `proof_assessment` so repeated retries are resumable and visible.
