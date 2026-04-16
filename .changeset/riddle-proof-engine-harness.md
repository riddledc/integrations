---
"@riddledc/riddle-proof": minor
"@riddledc/openclaw-riddle-proof": minor
---

Add the reusable Riddle Proof engine harness and OpenClaw status surface.

The core package now exposes a checkpoint-driven harness for the existing
`riddle-proof-run` engine, persistent run state, status snapshots, disabled
agent-adapter blockers, and isolated-worktree safety checks before
implementation can advance.

The OpenClaw wrapper now exposes `riddle_proof_status` and can opt into engine
mode with explicit runtime config while preserving the default blocked
normalization behavior.
