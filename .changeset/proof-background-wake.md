---
"@riddledc/openclaw-riddle-proof": patch
---

Add interface-agnostic background proof runs. `riddle_proof_change` now accepts
`run_mode: "background"` (or plugin config `defaultRunMode: "background"`) to
return a run state immediately while the proof continues in the gateway process.
Background runs append a durable `run.wake.requested` event when they settle so
Discord, Telegram, iMessage, CLI, or other OC surfaces can wake the originating
session with the same status/inspect/review contract.
