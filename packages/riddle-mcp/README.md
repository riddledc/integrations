# @riddledc/riddle-mcp

MCP-related utilities for RiddleDC. No secrets. No network calls unless you run the server or invoke tools.

## Install

```
pnpm add @riddledc/riddle-mcp
```

## Usage

```ts
import { loadConfigFromEnv, redactSecrets } from "@riddledc/riddle-mcp";

const config = loadConfigFromEnv();
console.log(redactSecrets(config));
```

## MCP server (CLI)

Install and run:

```
pnpm add @riddledc/riddle-mcp
npx riddle-mcp
```

### MCP config example

```json
{
  "mcpServers": {
    "riddle": {
      "command": "npx",
      "args": ["riddle-mcp"],
      "env": {
        "RIDDLE_MCP_GATEWAY_URL": "https://api.riddledc.com",
        "RIDDLE_AUTH_TOKEN": "your_login_token_here"
      }
    }
  }
}
```

## Environment variables

- `RIDDLE_BASE_URL`
- `RIDDLE_API_URL`
- `RIDDLE_TOKEN`
- `RIDDLE_MCP_GATEWAY_URL`
- `RIDDLE_AUTH_TOKEN`
- `RIDDLE_API_KEY`

## Notes
- Supply credentials via env vars or your own config layer.
- No assumptions about other integrations.
