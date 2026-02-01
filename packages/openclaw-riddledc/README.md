# @riddledc/openclaw-riddledc

OpenClaw integration package for RiddleDC. No secrets. No assumption about MCP.

## Install

```
pnpm add @riddledc/openclaw-riddledc
```

## OpenClaw plugin metadata

This package ships `openclaw.plugin.json` for OpenClaw registration.

## Required OpenClaw config

Because the tools register as `optional: true`, add:

```
tools.alsoAllow: ["riddle"]
```

## Configuration

The plugin accepts:
- `apiKey` (or `RIDDLE_API_KEY` env var)
- `baseUrl` (defaults to `https://api.riddledc.com`)

## Tools

- `riddle_run`
- `riddle_screenshot`
- `riddle_screenshots`
- `riddle_steps`
- `riddle_script`

## Security

Do not hardcode keys. Provide credentials via env vars or your secret manager.
