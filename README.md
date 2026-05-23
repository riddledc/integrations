# RiddleDC Integrations

Public integration packages for RiddleDC.

## Packages
- `@riddledc/riddle-proof` — reusable contracts, proof-run checkpoint engine, and bundled runtime assets for evidence-backed Riddle Proof workflows.
- `@riddledc/riddle-proof-app-contract` — small app-contract helper package for Riddle Proof (browser/global state hook).
- `@riddledc/riddle-proof-packs` — reusable, packaged Riddle proof packs and helper metadata.
- `@riddledc/riddle-proof-riddle-client` — hosted Riddle API/client adapter, used for managed runtime execution and previews.
- `@riddledc/riddle-proof-runner-playwright` — local Playwright runtime for profile execution and evidence capture.
- `@riddledc/riddle-worker-contract` — public worker/job/result contracts for hosted scheduling and runner manifests.
- `@riddledc/riddle-mcp` — MCP-related utilities/server/client components (no secrets).
- `@riddledc/openclaw-riddledc` — OpenClaw integration package (no secrets).
- `@riddledc/openclaw-riddle-proof` — OpenClaw tool wrapper for the public Riddle Proof workflow.

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
