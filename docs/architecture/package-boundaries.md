# Riddle Proof Package and Capability Boundaries

The Riddle Proof npm package family separates packages by executable
capability, not by whether their source is public. A hosted client can be open
source and still be inappropriate inside a security-sensitive local install.
Separate integration products such as Riddle MCP and the OpenClaw plugins have
their own declared hosted-service boundaries and are outside this package-family
ownership gate.

```text
                    @riddledc/riddle-proof-core
     snapshots, captures, claims, grounding checks, composition,
              proofs, trust roots, and receipts
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

Core also owns the pure grounding-profile contracts and deterministic profile
evaluators.
The compatibility facade owns the legacy HTTP preflight and generated-browser
script builder. The facade build keeps core external rather than rebundling a
second copy, so its compatibility entrypoints resolve to the same installed
core implementation. No core source file imports from the facade source tree.

## Evidence and meaning boundary

The stack deliberately separates four different assertions:

1. A surface adapter captured exact bytes during a stated stable interval.
2. A grounding check derived a narrowly named claim from a signed capture under
   independently supplied scope, signer, collector, sensor, freshness,
   verifier, and grounding policy.
3. A fixed, content-addressed, data-only rule composed grounded facts into a
   higher-level claim under an independently allowlisted rule digest.
4. A consumer matched the exact expected root, scope, claim, and rule after
   replaying every reachable grounding and rule sidecar.

Historical replay and present usefulness are separate. With an explicit
consumer time, grounded-age bound, and future-skew bound, the runtime classifies
the replayed closure as `checked`, `stale`, or `unresolved`; it never reads the
ambient clock for that decision.

This supports compression: a consumer can retain and replay the proof instead
of manually rechecking every premise. It does not turn an accepted rule into a
law of nature. The outside-world fidelity of a sensor, key custody, and the
domain or organizational correctness of a rule remain explicit trust inputs.

## Local document boundary

The first non-browser surface is intentionally small. `riddle-proof-local`
captures files the caller names explicitly, defaults to `digest_only`, rejects
symbolic links and unstable reads, omits absolute paths, and never mutates a
selected source document. Its snapshot proves the bytes read, not what those
bytes mean, whether one rendering faithfully represents another, or whether an
event or downstream action occurred.

Surface adapters, rendering checks, and client rule bundles should be separate
packages or private components with their own capabilities and trust review.
They are not silently folded into core or local.

## Client-instantiation boundary

Riddle Proof supplies machinery; a client supplies the use and meaning of that
machinery. Public core may define generic containers and verifiers for:

- an independently loaded rule trust root, identified by exact ID, version,
  and complete bundle digest;
- an independently loaded evidence-template trust root that fixes the
  collector, signer, declarative verifier, fixed assertions, typed observation
  bindings, sensor policy, a bounded recursive exact observation schema, and
  the permitted artifact IDs, roles, and media types;
- a content-free machine receipt that binds opaque identifiers, a private
  payload digest, evidence links, execution identity, and the exact digest of
  the execution policy enforced at creation; and
- deterministic packet verification that recomputes that policy digest and
  resolves the root, currentness certificate, and every entry evidence link
  through certificate IDs derived from a separately replayed and matched
  checked-meaning closure.

Checked-meaning replay/matching and packet verification remain separate APIs.
The caller must establish expected meaning first; the packet verifier neither
selects a root claim nor treats packet structure as semantic proof.

Public core must not define a client's domain, workflow state names, required
premise graph, actor roles, provider choice, or conclusion vocabulary. Those
belong to the client-controlled rule bundle and implementation. A client may
use a private payload for sensitive analysis or proposed content, but the
public machinery sees only its bytes/digest and the independently expected
semantic claims.

If a client needs to represent an act performed by a particular signer, it can
define an ordinary claim and ground it in a signed capture with the existing
claim and evidence machinery. That meaning and its downstream effect remain
client-defined; public core does not add a specialized category for it.

The exact observation schema makes proof handoffs closed rather than
open-ended: objects may contain only reviewed root and nested fields, arrays
have fixed length and order, and leaves are pinned literals, claim parameters,
SHA-256 digests, or bounded integers. Final replay rejects undeclared fields,
extra array entries, and additional signed artifacts before accepting a
client-selected root.

Any public workbench-transfer material is a domain-neutral synthetic bootstrap,
not an instantiated client. An actual workbench, immutable trust roots, domain
rules, credentials, client signer keys, privileged examples, provider choice,
and adapters belong in a client-controlled environment. Network-capable
surface or model adapters remain separate components with explicit
destinations; none is part of core or local.

See [Building a private Riddle Proof client](../riddle-proof-client-instantiation.md)
for the generic adoption and handoff sequence.

## Private infrastructure

Worker deployment, control-plane services, secret brokerage, telemetry
persistence, billing, fraud controls, and private cloud wiring remain outside
these npm capability boundaries. Public packages may define contracts for
those systems. Within the Riddle Proof package family, only the hosted-client
package may implement access to Riddle's hosted service; separately packaged
MCP and OpenClaw integrations retain their explicit hosted capabilities.
