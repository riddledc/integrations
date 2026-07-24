# Proof-guided web change app

This private local app is the first visible client built on the Riddle Proof
application layer. It owns one deliberately narrow synthetic task:

> Replace page-only Save behavior so the saved value remains after reload and
> in a fresh browser context.

It is not an arbitrary website editor. The installed proof contract knows one
owned specimen shape (`#state-app`, `#value`, `#save`, and `#current`) and one
fixed transition. The purpose of the app is to test whether the proof
machinery can become quiet and useful inside an ordinary repair workflow.

## Run it

From the repository root:

```sh
pnpm run demo:proof-guided-web-change
```

Open the printed loopback URL. The ordinary workflow is:

1. **Check current candidate.** The page-only implementation fails the reload
   and fresh-context requirements.
2. **Apply server-backed persistence repair.** The app-owned repair executor
   verifies the exact base source bytes, changes only the owned persistence
   seam, and starts a new immutable preview.
3. **Check current candidate again.** The unchanged pinned contract now
   evaluates the repaired candidate.

Applying a repair does not confer a proof result. The repaired candidate is
shown as unchecked until the second browser check completes.

If a check is stale, unavailable, or throws before it can return a usable
result, the app does not reset and reuse that attempt. **Prepare fresh
attempt** copies the unchanged source into a distinct candidate and proof
target. The revision stays the same, the attempt number changes, and the old
returned result remains in history; if the check threw, the failed attempt
still remains consumed. A source repair changes both the revision and the
attempt.

## What stays quiet

The ordinary interface shows the task, revision and attempt numbers, the four
application outcomes, failed requirements, proof boundaries, and repair
guidance. It does not ask for or display profile digests, nonces, signatures,
authorities, certificate identifiers, or proof-graph structure.

Those identities remain available through the explicit **Audit details**
control. Browser artifacts and the public verification authority are retained
under:

```text
.riddle-proof/proof-guided-web-change/<run>/
```

The process-local private signing key is not written there.

## Separation of responsibility

- The app owns the two exact specimen-source variants, immutable loopback
  previews, opaque candidate registry, and deterministic repair. It does not
  execute caller-supplied source or a caller-supplied repair implementation.
- `experiments/proof-guided-web-change` owns the pinned contract, browser
  report adapter, replay, deterministic application projection, and audit
  views.
- Public Riddle core and Playwright packages own the underlying evidence,
  certificate, transition, and checked-meaning machinery.
- Lean proves the generic repair invariant and disposition algebra: a repair
  prepared by the same controller retains the pinned contract, while a changed
  subject receives a distinct authority and cannot reuse the old result.

Lean does not prove that the source edit was wise, that Chromium observed the
outside world accurately, or that the configured report provider actually
performed its declared work. Those remain runtime and trust-boundary facts.

## Safety boundary

The workbench and owned specimen servers bind only to `127.0.0.1`. Each
process issues a 256-bit run capability. The workbench moves its launch token
into port-scoped `sessionStorage`, removes it from the address bar, and sends
it explicitly on API requests. A visible specimen preview uses its own
short-lived launch token, but the semantic proof target is token-free. The
trusted local provider injects that proof runtime's secret directly into its
Playwright context; the header is never part of the profile, scope, audit
identity, signed evidence, or retained artifacts. No capability is placed in
a host-scoped loopback cookie, where another local port could receive it.
Tokens expire when their local server closes. Mutating HTTP calls accept no
caller-selected target, revision, profile, contract, or repair fields. The
app has no hosted Riddle client or configuration.

The visible preview and proof target are separate disposable runtimes created
from the same immutable source bytes. Editing the visible preview therefore
cannot seed the later check. Browser artifacts are created beneath private
`0700` directories, retained files are sealed to `0600`, and portable receipts
use relative publication references rather than workstation paths.

Each proof target is checked at most once. The current v1 contract starts from
the exact `unset` state and writes a fixed marker, so silently resetting and
rechecking the same target would be dishonest. Repair therefore creates a new
source revision, preview, candidate reference, subject, and attempt authority
while preserving the earlier failure. Recovery from an unusable check creates
a new target and authority without pretending that the source revision
changed.

## Verify it

```sh
pnpm run verify:proof-guided-web-change-app
```

The verification command runs the private-boundary scan, deterministic app and
repair tests, real Playwright proof flow, visible Chromium UI flow, and the
separate Lean build.
