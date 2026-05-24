---
"@riddledc/riddle-proof-packs": minor
"@riddledc/riddle-proof-runner-playwright": patch
---

Add the Neon bounded ratchet-loop proof profile for the `mix-level-search` strategy.
Clear local Playwright runner timeout timers after successful runs so timed profiles do not keep the CLI process open after artifacts are written.
