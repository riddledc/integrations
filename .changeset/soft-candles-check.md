---
"@riddledc/openclaw-riddle-proof": patch
---

Add explicit wrapper-side response gating for Riddle Proof runs. The public
OpenClaw integration now accepts `report_mode: "terminal_only"` (or
`wait_for_terminal: true`) and surfaces a structured `monitor_contract` in
change, status, inspect, and wake outputs so detached monitors can keep polling
until terminal state without relying on prompt wording.
