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
6. When the run reaches a checkpoint, blocker, or ready state, use `riddle_proof_status` and usually `riddle_proof_inspect` before deciding what to report or how to resume.
7. If the run blocks for main-agent proof review, inspect the evidence packet, judge the screenshots/artifacts directly, and resume with `riddle_proof_review`. For non-shipping runs (`ship_mode: "none"`), the plugin may auto-advance when inspection already marks the proof as a ready-to-ship candidate; report the held result instead of repeating the review loop.

## Background Monitoring

Background runs append a durable `run.wake.requested` event when they settle. Treat that as the host-agnostic wake signal for Discord, Telegram, iMessage, CLI, or any other OpenClaw surface.

For long runs, prefer this pattern:

```yaml
sessions_spawn:
  task: "Monitor Riddle Proof state_path=/tmp/riddle-proof-run-...json. Poll riddle_proof_status at its recommended interval until a checkpoint, blocker, ready_to_ship, shipped, failed, or completed state. Then report the compact status and suggested next tool."
  label: "riddle-proof monitor"
```

If `sessions_spawn` is unavailable, keep polling sparse. Dependency setup can legitimately take minutes; status snapshots expose `active_substep`, `phase_elapsed_ms`, `engine_latest_event`, and `recommended_poll_after_ms` so the agent can avoid noisy updates.

## Shipping Rules

- Do not use legacy `proofed_change_run` when `riddle_proof_change` is available and configured.
- Do not create or merge a PR when the user requested `dry_run`, `ship_mode: "none"`, or a smoke test.
- For normal code-change requests, the target end state is a proved PR with evidence, not a plan.
- Use `leave_draft: true` only for intentional draft/debug flows.
- Use `ready_to_ship` only when the captured evidence visibly satisfies the request.
