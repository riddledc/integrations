---
name: riddle-proof
description: Use Riddle Proof for evidence-backed browser-visible code changes from OpenClaw. Prefer this for visual, interaction, render, content, and web workflow fixes that should ship with proof artifacts.
---

# Riddle Proof

Use `riddle_proof_change` for browser-visible changes that need evidence before merge.

## Default Flow

1. Start with `riddle_proof_change`.
2. Prefer `run_mode: "background"` unless the user explicitly asks for a blocking debug run.
3. Pass the repo, branch, concrete change request, verification mode, known route/auth/selector hints, and any chat routing metadata available.
4. Return the initial `state_path` to the user, then keep the main conversation responsive.
5. Do not run a tight manual polling loop in the main chat. If `sessions_spawn` is available, use it for monitoring long proof runs; otherwise poll status only when the user asks or after the returned `recommended_poll_after_ms`.
6. Use `riddle_proof_status` to decide whether monitoring should continue. If `monitor_should_continue` is `true`, keep monitoring; do not report routable internal checkpoints such as `implement_changes_missing` as final outcomes.
7. When `monitor_should_continue` is `false`, use `suggested_next_action` to decide what to report or how to resume; use `riddle_proof_inspect` before any proof judgment.
8. If the run blocks for main-agent proof review, inspect the evidence packet, judge the screenshots/artifacts directly, and resume with `riddle_proof_review`. For non-shipping runs (`ship_mode: "none"`), the plugin may auto-advance when inspection already marks the proof as a ready-to-ship candidate; report the held result instead of repeating the review loop.

## Background Monitoring

Background runs append a durable `run.wake.requested` event when they settle. Treat that as the host-agnostic wake signal for Discord, Telegram, iMessage, CLI, or any other OpenClaw surface.

For long runs, prefer this pattern:

```yaml
sessions_spawn:
  task: "Monitor Riddle Proof state_path=/tmp/riddle-proof-run-...json. Poll riddle_proof_status at its recommended interval while monitor_should_continue is true. Report only when monitor_should_continue is false, including status, checkpoint_classification, suggested_next_action, blocker if present, and artifact URLs if available."
  label: "riddle-proof monitor"
```

If `sessions_spawn` is unavailable, keep polling sparse. Dependency setup can legitimately take minutes; status snapshots expose `active_substep`, `phase_elapsed_ms`, `engine_latest_event`, `recommended_poll_after_ms`, `is_terminal`, `is_routable_checkpoint`, `monitor_should_continue`, and `suggested_next_action` so the agent can avoid noisy or premature updates.

## Shipping Rules

- Do not use legacy `proofed_change_run` when `riddle_proof_change` is available and configured.
- Do not create or merge a PR when the user requested `dry_run`, `ship_mode: "none"`, or a smoke test.
- For normal code-change requests, the target end state is a proved PR with evidence, not a plan.
- Use `leave_draft: true` only for intentional draft/debug flows.
- Use `ready_to_ship` only when the captured evidence visibly satisfies the request.
- If Riddle Proof blocks after producing useful edits, treat that as `proof blocked`, not proof passed. Preserve the diff only as a draft PR marked proof-blocked, include `failure_summary`, `proof_artifact_summary`, `state_path`, and `run_id`, and do not mark or describe the PR as merge-ready.
- When reporting a blocked or salvaged run, copy the available before/prod baseline artifacts and any after/preview artifacts from `proof_artifact_summary`; if an after screenshot is missing, say that explicitly.

## Playable Proof

For games, canvas scenes, or interactive toys where "looks right" is not enough, request `verification_mode: "playable"` or `"gameplay"`. The proof must include structured playability evidence showing accepted input, state or HUD progression, elapsed play/animation time, and measured non-HUD playfield/canvas pixel motion. A static screenshot or generated scene plate can support visual review, but it is not enough to mark the run ready to ship.
