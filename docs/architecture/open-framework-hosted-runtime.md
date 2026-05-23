# Open Framework, Hosted Runtime

This document defines the split model for Riddle and `@riddledc/riddle-proof`.

## Principle

`riddle-proof` is the open evidence framework.
`Riddle` is the hosted runtime and commercial convenience layer.

Treat this split as a boundary contract:

- Users should be able to run the proof model themselves with open code.
- Users should be able to use managed hosted execution when they need reliability, scale, auth-safe state, and durable operations.
- The boundary should remain stable across repo moves and package releases.

## Open Framework: `@riddledc/riddle-proof`

Publicly available and runnable without the hosted service:

- Proof profile schema and contract:
  - `riddle-proof.profile.v1`
  - check/result/status schemas
  - profile scripts and artifacts roles
- Proof bundle contracts and local serialization:
  - `proof.json`
  - `dom-summary.json`
  - `proof-pack` patterns
  - profile result / checkpoint / run status contracts
- App contract helpers and proof instrumentation guidance
- CLI engine for profile and loop execution
- Reusable proof packs and examples
- OpenClaw/host wrappers as adapters (consuming the framework contracts)

## Hosted Runtime: Riddle managed layer

The managed product includes:

- Browser infrastructure and execution orchestration
- Server-preview/build-preview tooling and job lifecycle
- Durable artifact storage, indexing, retention, and public/private links
- Auth-safe browser state and session handoff
- Rate/billing enforcement and team-level controls
- Long-running job status and recovery workflows
- Agent handoff, summary rendering, and operational support

## Acceptance rule

A change belongs in hosted runtime when it is:

- infrastructure-centric (compute orchestration, billing, fleet)
- security-sensitive only in operational context
- operational reliability/throughput oriented

A change belongs in the framework when it is:

- profile definitions
- proof contract modeling
- contract-first diagnostics and evidence shaping
- user-land wrappers and adapters
- app contract instrumentation

## Migration expectation

The architecture should make this decision explicit in package boundaries:

- Framework packages should avoid production-only deployment details.
- Hosted-only packages should not be required to execute the open proof contract.

