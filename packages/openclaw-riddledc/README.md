# @riddledc/openclaw-riddledc

OpenClaw integration package for RiddleDC. No secrets. No assumption about MCP.

## Install

```
openclaw plugins install @riddledc/openclaw-riddledc
openclaw plugins enable openclaw-riddledc
```

## OpenClaw plugin metadata

This package ships `openclaw.plugin.json` for OpenClaw registration.

The plugin id is `openclaw-riddledc`.

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
