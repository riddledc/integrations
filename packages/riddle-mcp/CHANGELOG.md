# @riddledc/riddle-mcp

## 0.3.0

### Minor Changes

- 576d75d: Return file paths instead of inline base64 images

  All screenshot and automation tools now save artifacts to /tmp and return file paths:

  - `riddle_screenshot`: Returns `{ screenshot: "/tmp/riddle-screenshot-xxx.png", url: "..." }`
  - `riddle_batch_screenshot`: Returns array with `screenshot` paths
  - `riddle_automate`: Returns `{ screenshots: [...], console: "/tmp/riddle-console-xxx.json", har: "/tmp/riddle-network-xxx.har" }`
  - `riddle_click_and_screenshot`: Returns `{ screenshot: "/tmp/riddle-click-result-xxx.png", ... }`

  This reduces response payload size and allows Claude to reference files without embedding large base64 data.

## 0.2.1

### Patch Changes

- 7000b7f: chore: test OIDC trusted publishing

## 0.2.0

### Minor Changes

- a251d72: Initial public release.
