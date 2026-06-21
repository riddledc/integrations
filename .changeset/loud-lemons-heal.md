---
"@riddledc/riddle-proof": patch
---

Fix PR comment rendering for hosted profile result packets.

`pr-comment --proof-dir` now recognizes `run-profile` output directories that contain `profile-result.json`, and profile result comments use the profile check statuses and hosted artifact references instead of recursively counting nested evidence booleans.
