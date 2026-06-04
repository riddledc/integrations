---
"@riddledc/riddle-proof": patch
---

Harden direct Riddle Proof dogfood runs by adding local browser/server preview fallbacks, preserving capture failures as structured verify blockers, respecting `ship_mode=none` before ship handoff, and rejecting incomplete dependency installs while still allowing intentionally empty installs.
