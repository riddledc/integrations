---
"@riddledc/riddle-proof": patch
---

Prevent synthetic touch and pen drag setup actions from tripping app `setPointerCapture` handlers by shimming pointer capture for the dispatched pointer id during the drag.
