# Riddle Proof Package and Capability Boundaries

The Riddle Proof npm package family separates packages by executable
capability, not by whether their source is public. A hosted client can be open
source and still be inappropriate inside a security-sensitive local install.
Separate integration products such as Riddle MCP and the OpenClaw plugins have
their own declared hosted-service boundaries and are outside this package-family
ownership gate.

```text
                    @riddledc/riddle-proof-core
             claims, receipts, grounding, checked meaning
                 cryptography; no I/O or network
                              |
        +---------------------+---------------------+
        |                     |                     |
  riddle-proof-local   runner-playwright   riddle-proof-riddle-client
  selected files only  browser + network   hosted Riddle + upload/poll
        |                     |                     |
        +---------------------+---------------------+
                              |
                @riddledc/riddle-proof
          temporary network-capable compatibility facade
```

## Published packages

| Package | Declared capability |
| --- | --- |
| `@riddledc/riddle-proof-core` | Deterministic evaluation and cryptography. No filesystem, browser, subprocess, network, or hosted Riddle implementation. Legacy creation helpers may use the ambient clock when no timestamp is supplied. |
| `@riddledc/riddle-proof-local` | Read-only capture of explicitly selected regular files and explicit receipt writes. No browser, subprocess, network, hosted client, or production dependency. |
| `@riddledc/riddle-proof-runner-playwright` | Explicit filesystem, subprocess, browser, and caller-directed network capability. Depends on core, never the facade or hosted client. This package is not a sandbox. |
| `@riddledc/riddle-proof-riddle-client` | Within the Riddle Proof package family, sole owner of `api.riddledc.com`, Riddle credentials, `/v1` endpoint construction, upload, Preview, polling, and the legacy hosted runtime. |
| `@riddledc/riddle-proof` | Pre-1.0 compatibility facade exposing the union of core, engine, and hosted capabilities. Installing it is intentionally network-capable. |

Every package publishes the same complete `riddleProofCapabilities` schema in
`package.json` and `capabilities.json`. The manifest is explanatory; the build
and install gates are the enforcement mechanism.

## Enforced invariants

`scripts/check-package-capabilities.mjs` and
`scripts/check-package-install-boundaries.mjs` fail the build unless:

- core and local have no production, optional, peer, bundled, aliased, or
  lifecycle-hook dependency path that can introduce code;
- Playwright's only Riddle dependency is core, with Playwright itself an
  explicit optional peer;
- every declared export exists in the packed package;
- core's packed external imports are exactly `crypto` and `util`;
- local's packed external imports are exactly `crypto`, `fs/promises`, and
  `path`;
- bounded packages contain no hosted endpoint, Riddle API-key lookup, network
  built-ins, `fetch`, or `WebSocket` implementation;
- a `pnpm pack` tarball for core plus local installs offline into a fresh npm
  project as exactly those two packages;
- core plus the Playwright runner installs without the facade or hosted client;
- only the hosted-client package positively owns production `/v1` endpoint
  literals and the hosted endpoint and key markers;
  and
- core and local execute under the repository's process-level network-denial
  harness.

The install test uses a new empty npm cache and verifies the installed package
versions, export targets, and single core instance so cached registry packages
cannot conceal a broken tarball graph.

These are package-ownership boundaries, not an in-process sandbox. In
particular, the legacy core `external_registry` grounding path invokes
caller-supplied verifier and contract callbacks. Those callbacks inherit the
host process's capabilities. Scanner-sensitive local flows should use the
callback-free built-in declarative JSON path, or execute external callbacks in
a separately controlled process.

## Evidence and meaning boundary

The stack deliberately separates four different assertions:

1. A surface adapter captured exact bytes during a stated stable interval.
2. A signed grounded contract derived a narrowly named fact from those bytes
   under independently supplied scope, signer, collector, sensor, freshness,
   verifier, and contract policy.
3. A fixed, content-addressed, data-only rule composed grounded facts into a
   higher-level claim under an independently allowlisted rule digest.
4. A consumer matched the exact expected root, scope, claim, and rule after
   replaying every reachable grounding and rule sidecar.

Historical replay and present usefulness are separate. With an explicit
consumer time, grounded-age bound, and future-skew bound, the runtime classifies
the replayed closure as `checked`, `stale`, or `unresolved`; it never reads the
ambient clock for that decision.

This supports compression: a consumer can retain and replay the closure instead
of manually rechecking every premise. It does not turn an accepted rule into a
law of nature. The outside-world fidelity of a sensor, key custody, and the
legal or organizational correctness of a rule remain explicit trust inputs.

## Local document boundary

The first non-browser surface is intentionally small. `riddle-proof-local`
captures files the caller names explicitly, defaults to `digest_only`, rejects
symbolic links and unstable reads, omits absolute paths, and never mutates a
selected source document. Its snapshot proves the bytes read, not that a file
is the operative contract, a PDF is a faithful rendering, or a lawyer approved
the text.

Google Docs/Drive, DOCX rendering, and company amendment rules should be
separate adapters or private bundles with their own capabilities and trust
review. They are not silently folded into core or local.

## Transitional source seam

The published core tarball is self-contained and its installed dependency
closure is clean. Inside this monorepo, `packages/riddle-proof-core/src/profile.ts`
still selects pure profile types and evaluators from the facade's source during
the build. That is a build-time migration seam, not a runtime dependency, but
it means source ownership of the legacy profile module is not fully inverted
yet. Do not describe the split as complete at source level until that module is
physically moved or divided.

## Private infrastructure

Worker deployment, control-plane services, secret brokerage, telemetry
persistence, billing, fraud controls, and private cloud wiring remain outside
these npm capability boundaries. Public packages may define contracts for
those systems. Within the Riddle Proof package family, only the hosted-client
package may implement access to Riddle's hosted service; separately packaged
MCP and OpenClaw integrations retain their explicit hosted capabilities.
