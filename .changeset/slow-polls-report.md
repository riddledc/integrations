---
"@riddledc/riddle-proof": patch
---

Improve `riddle-poll --wait` diagnostics for delayed-dispatch jobs by extending the default wait budget, emitting progress on stderr, and returning explicit poll timeout metadata when a job remains non-terminal with no `submitted_at`.
