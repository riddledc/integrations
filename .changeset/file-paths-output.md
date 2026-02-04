---
"@riddledc/riddle-mcp": minor
---

Return file paths instead of inline base64 images

All screenshot and automation tools now save artifacts to /tmp and return file paths:
- `riddle_screenshot`: Returns `{ screenshot: "/tmp/riddle-screenshot-xxx.png", url: "..." }`
- `riddle_batch_screenshot`: Returns array with `screenshot` paths
- `riddle_automate`: Returns `{ screenshots: [...], console: "/tmp/riddle-console-xxx.json", har: "/tmp/riddle-network-xxx.har" }`
- `riddle_click_and_screenshot`: Returns `{ screenshot: "/tmp/riddle-click-result-xxx.png", ... }`

This reduces response payload size and allows Claude to reference files without embedding large base64 data.
