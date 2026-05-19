---
"@riddledc/riddle-proof": patch
---

Retry unsubmitted hosted profile jobs twice by default, improving recovery when
two returned Riddle job ids fail to materialize before a replacement succeeds.
