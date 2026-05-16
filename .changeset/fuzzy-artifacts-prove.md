---
"@riddledc/riddle-proof": patch
---

Add `min_bytes` and `allowed_content_types` to profile `link_status` and `artifact_link_status` checks so artifact audits can prove response size and MIME type, not only nonzero link reachability.
