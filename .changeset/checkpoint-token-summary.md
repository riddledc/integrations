---
"@riddledc/riddle-proof": patch
"@riddledc/openclaw-riddle-proof": patch
---

Leave checkpoint summary `token_matches` unset until a checkpoint response exists, so pending tokenized packets are not reported as token mismatches.

Update the OpenClaw status presentation to continue exposing `token_status: awaiting_response` for pending tokenized checkpoints after the upstream summary fix.
