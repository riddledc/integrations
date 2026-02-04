# @riddledc/openclaw-riddledc

OpenClaw plugin for [Riddle](https://riddledc.com) - hosted browser automation API. Take screenshots, run Playwright scripts, and automate web interactions from your OpenClaw agent.

## Install

```bash
# 1. Install the plugin
openclaw plugins install @riddledc/openclaw-riddledc

# 2. Add to allowlist and enable
openclaw config set plugins.allow --json '["discord","telegram","memory-core","openclaw-riddledc"]'
openclaw config set tools.alsoAllow --json '["openclaw-riddledc"]'

# 3. Set your API key
openclaw config set plugins.entries.openclaw-riddledc.config.apiKey "YOUR_RIDDLE_API_KEY"

# 4. Restart gateway
openclaw gateway restart
# Or if using systemd: systemctl restart openclaw-gateway
```

Get your API key at [riddledc.com](https://riddledc.com).

## Tools

| Tool | Description |
|------|-------------|
| `riddle_screenshot` | Take a screenshot of a single URL |
| `riddle_screenshots` | Take screenshots of multiple URLs in one job |
| `riddle_steps` | Run a workflow using steps (goto/click/fill/etc.) |
| `riddle_script` | Run full Playwright code |
| `riddle_run` | Low-level pass-through to the Riddle API |

All tools return screenshots + console logs by default. Pass `include: ["har"]` to also capture network traffic.

## How It Works

Screenshots are automatically saved to `~/.openclaw/workspace/riddle/screenshots/` and the tool returns a file reference instead of inline base64. This keeps agent context small and prevents token overflow.

Example response:
```json
{
  "ok": true,
  "job_id": "job_abc123",
  "screenshot": { "saved": "riddle/screenshots/job_abc123.png", "sizeBytes": 45000 },
  "console": []
}
```

## Configuration

| Option | Description |
|--------|-------------|
| `apiKey` | Your Riddle API key (or set `RIDDLE_API_KEY` env var) |
| `baseUrl` | API endpoint (defaults to `https://api.riddledc.com`) |

## Security

- Never hardcode API keys in config files
- Use environment variables or a secret manager
- The plugin only communicates with `api.riddledc.com` over HTTPS
- Hardcoded domain allowlist prevents credential exfiltration
- See [SECURITY.md](./SECURITY.md) for full threat model and data flow

## Reproducible Builds

To verify a build matches the published package:

1. Clone the repo at the tagged version
2. Run: `pnpm install && pnpm build`
3. Compare checksums: `shasum -a 256 dist/*`

Expected checksums are in `CHECKSUMS.txt`.

## License

MIT
