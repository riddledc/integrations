---
"@riddledc/riddle-proof": patch
---

Make hosted `run-profile` default trusted package-generated profile scripts to
`strict=false`, while preserving `--strict=true` for callers who want Riddle
script-safety warnings to block the run.
