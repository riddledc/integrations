# RiddleDC Integrations

Public integration packages for RiddleDC.

## Packages
- `@riddledc/riddle-proof-core` — capability-bounded receipts, grounded evidence, Semantic certificates, and checked meaning rules with no I/O or network implementation.
- `@riddledc/riddle-proof-local` — network-free, read-only capture of explicitly selected local document files.
- `@riddledc/riddle-proof` — temporary network-capable compatibility facade plus proof-run checkpoint engine and bundled runtime assets.
- `@riddledc/riddle-proof-app-contract` — small app-contract helper package for Riddle Proof (browser/global state hook).
- `@riddledc/riddle-proof-packs` — reusable, packaged Riddle proof packs and helper metadata.
- `@riddledc/riddle-proof-riddle-client` — sole owner of hosted Riddle API, credential, upload, Preview, and polling behavior.
- `@riddledc/riddle-proof-runner-playwright` — browser/network-capable local Playwright runtime depending on core, not the hosted facade.
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
