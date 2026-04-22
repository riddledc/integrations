---
"@riddledc/riddle-proof": patch
"@riddledc/openclaw-riddle-proof": patch
---

Cache Riddle Proof dependency installs across proof runs by package/lockfile fingerprint so repeated browser proof runs can reuse installed node_modules instead of reinstalling for each new worktree.
