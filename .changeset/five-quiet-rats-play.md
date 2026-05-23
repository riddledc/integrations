---
"@riddledc/riddle-proof": patch
"@riddledc/riddle-proof-packs": minor
"@riddledc/riddle-proof-app-contract": minor
"@riddledc/riddle-proof-riddle-client": minor
"@riddledc/riddle-proof-runner-playwright": minor
"@riddledc/riddle-worker-contract": minor
---

Publish the first pass of the open Riddle Proof framework split:
- documented public boundary between framework, proof packs, and hosted runtime
- added reusable proof pack package with atomic evidence-language
- added app contract helper package for lightweight app instrumentation
- extracted hosted runtime adapters into a dedicated package
- added local Playwright runner package
- added worker contract package used for public job/runner/result/schema sharing
- added runner examples as public reference implementations
