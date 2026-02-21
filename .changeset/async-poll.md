---
"@riddledc/openclaw-riddledc": patch
---

Add async job submission and polling. Set `async: true` on `riddle_run`, `riddle_script`, or `riddle_steps` to get the `job_id` back immediately without waiting for completion. Use the new `riddle_poll` tool to check job status and fetch results when ready.
