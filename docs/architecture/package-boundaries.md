# Riddle Package Boundaries

This document maps package ownership for the open-framework model.

## Public framework packages

- `packages/riddle-proof`
  - Core proof contracts, profile runner engine, and CLI surfaces.
- `packages/riddle-proof-packs`
  - Reusable, distributable proof pack profiles.
- `packages/riddle-proof-app-contract`
  - Small app-facing contract helpers for browser/runtime introspection.
- `packages/riddle-proof-runner-playwright`
  - Local/runtime-agnostic Playwright execution implementation of the open contracts.
- `packages/riddle-proof-riddle-client`
  - Hosted Riddle API client/adapter surface (if this layer is split out from core).
- `packages/openclaw-riddle-proof`, `packages/openclaw-riddledc`
  - OpenClaw adapters that consume `@riddledc/riddle-proof`.
- `packages/riddle-mcp`
  - MCP integrations powered by the proof contracts.

## Private infrastructure (not framework)

- Control plane services, worker fleet deployment, billing/fraud/rate enforcement, and secret broker.
- Internal service wiring for host-only observability and account management.

## Boundary invariants

1. Framework packages should be usable for self-hosted/local CI proof without requiring any private endpoints or private secrets.
2. Hosted client packages may require private credentials; they should consume framework contracts, not replace them.
3. Any contract changes to `@riddledc/riddle-proof` should preserve compatibility with adapters that execute profiles in hosted and local paths.

## PR hygiene

- New hosted capabilities should first be represented as contracts or adapters in public packages.
- Production deployment details, private API endpoints, and cloud-specific controls remain outside the public package boundary.

