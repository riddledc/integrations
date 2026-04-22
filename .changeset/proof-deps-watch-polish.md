---
"@riddledc/riddle-proof": patch
"@riddledc/openclaw-riddle-proof": patch
---

Make OpenClaw proof runs background by default, skip useless shared dependency installs when the active workspace fingerprint does not match proof worktrees, reuse before-worktree dependencies for matching after worktrees, and expose richer status guidance for wake/watch monitoring.
