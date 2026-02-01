# @riddledc/openclaw-riddledc

OpenClaw integration package for RiddleDC. No secrets. No assumptions about MCP.

## Install

```
pnpm add @riddledc/openclaw-riddledc
```

## Usage

```ts
import { createRiddleOpenClawPlugin } from "@riddledc/openclaw-riddledc";

const plugin = createRiddleOpenClawPlugin({
  baseUrl: process.env.RIDDLE_BASE_URL,
  apiUrl: process.env.RIDDLE_API_URL,
  token: process.env.RIDDLE_TOKEN
});

// Pass `plugin` to OpenClaw's plugin registration API
```

## Configuration

- `baseUrl` (optional)
- `apiUrl` (optional)
- `token` (optional)

Provide values via env vars or your own config system. Do not hardcode secrets.
