---
"@riddledc/riddle-proof": patch
"@riddledc/riddle-proof-riddle-client": patch
---

Move the hosted Riddle endpoint, credential, upload, Preview, and polling
implementations into the dedicated hosted-client package. Keep the existing
facade and runtime entrypoints as compatibility re-exports with identical
ESM/CJS API and `RiddleApiError` identity.
