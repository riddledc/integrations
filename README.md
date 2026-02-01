# RiddleDC Integrations

Public integration packages for RiddleDC.

## Packages
- `@riddledc/riddle-mcp` — MCP-related utilities/server/client components (no secrets).
- `@riddledc/openclaw-riddledc` — OpenClaw integration package (no secrets).

## Trust model
- No secrets are committed to this repo.
- Credentials/tokens are provided at runtime via environment variables or user config files.
- Releases are built from tagged source via CI.

## Security
Report vulnerabilities to joe@riddledc.com

## Release & Verification
- Releases are built from tags via GitHub Actions and published to npm.
- Verify a release by checking the Actions run for the tag and comparing published artifacts.
- No secrets are committed to this repo.
