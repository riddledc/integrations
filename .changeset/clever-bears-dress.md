---
"@riddledc/openclaw-riddle-proof": patch
---

Treat an in-flight implementation attempt as a monitor hold state so detached monitors keep waiting for a real implementation outcome instead of surfacing the checkpoint as a generic retryable gap.
