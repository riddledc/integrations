---
"@riddledc/openclaw-riddle-proof": patch
---

Resume non-proof checkpoints with an explicit workflow stage fallback so `continue_checkpoint` does not block when the underlying engine has no active resumable checkpoint.
