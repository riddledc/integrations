---
"@riddledc/riddle-proof": patch
"@riddledc/openclaw-riddle-proof": patch
---

Fix interaction verify recovery for route query/hash expectations, selector-timeout capture retries, and checkpoint author-packet resumes.

The proof runtime now preserves hash fragments in route expectations, exposes expected/observed query and hash details in semantic evidence, stops retrying deterministic Playwright locator timeouts, and keeps route/proof-evidence blockers visible in capture retry summaries. The engine harness now routes author-packet checkpoint responses through author before verify so stale retry continuations cannot fall through to an invalid `run` stage. The OpenClaw wrapper now dedupes durable wake requests and gives proof-review checkpoints direct review-decision instructions instead of `continue_checkpoint` guidance.
