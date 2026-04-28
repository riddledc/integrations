---
"@riddledc/riddle-proof": patch
"@riddledc/openclaw-riddle-proof": patch
---

Reject cached capture hints for a different browser route when the current request explicitly names a route, preventing stale last-good proof paths from leaking across unrelated runs.
