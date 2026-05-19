---
"@riddledc/riddle-proof": patch
---

Allow profile `window_call` and `window_call_until` setup actions to store returned values into a browser state path with `store_return_to`/`storeReturnTo`, so follow-up setup assertions can inspect semantic helper results without eval-style profile scripts. Large helper returns can also set `capture_return: false` to keep setup evidence compact while preserving the stored browser value for assertions.
