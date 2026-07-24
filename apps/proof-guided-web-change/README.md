# Proof-guided web change app

This private local app contains two deliberately narrow clients of the Riddle
Proof application layer:

| Workflow | Pinned question | Permitted change |
|---|---|---|
| Durable setting | Does the saved value survive reload and a fresh browser context? | One deterministic, app-owned page-only-to-server-backed repair |
| Primary CTA | Does the page contain the requested CTA while preserving routes, responsive layout, and captured runtime health? | One bounded agent proposal changing only the CTA text and destination |

Neither workflow is an arbitrary website editor. Each owns its specimen
shapes, immutable loopback previews, candidate resolver, pinned contract, and
source-change policy. They share only the generic candidate lifecycle in
`workflow-controller.ts`: check an immutable attempt once, retain its history,
create a new revision after a permitted change, or create a fresh attempt of
the unchanged revision after an unusable check.

That is the demonstrated application seam. Contracts, proof providers,
candidate resolution, and change implementations remain workflow-specific.

## Run and verify

Start the durable-setting workflow with:

```sh
pnpm run demo:proof-guided-web-change
```

Open the printed loopback URL, then:

1. Check the page-only candidate. It fails the reload and fresh-context
   requirements.
2. Apply the server-backed persistence repair. The repair verifies the exact
   base source, changes only the owned persistence seam, and starts a new
   immutable preview.
3. Check the new candidate. The unchanged pinned contract now evaluates the
   repaired revision.

Start the bounded CTA-agent workflow with:

```sh
pnpm run demo:proof-guided-cta-change
```

It starts with `Explore features` linking to `/features`, reports only the
pinned CTA mismatch, accepts a bounded proposal for `View pricing` linking to
`/pricing`, reconstructs the exact reviewed source variant inside the app, and
checks the new revision under the same contract. The routes, declared mobile
and desktop layout bounds, and captured fatal-error checks must continue to
pass. The app-level executable name for this workflow is
`proof-guided-cta-change`.

```sh
pnpm run verify:proof-guided-web-change-app
```

This verification command runs the private-boundary scans, deterministic
workflow and change-policy tests, real Playwright proof flow, visible Chromium
UI flow, and the separate Lean build.

Applying either change does not confer a proof result. The new candidate is
unchecked until its own browser check completes. A stale, unavailable, or
thrown check also consumes its attempt: **Prepare fresh attempt** creates a
distinct candidate and proof target with the same source revision. Earlier
results remain in history and are never silently reset or inherited.

## Quiet proof plumbing

The ordinary application snapshot and interface show the task, revision and
attempt, the four CTA requirement outcomes, failed requirements, proof boundaries,
and available next action. They do not require the user or a change agent to
provide or interpret profile digests, nonces, signatures, authorities,
certificate identifiers, or proof-graph structure.

Those details remain available only through the explicit proof audit for a
check. The CTA workflow also has a separate `proposalAudit(repair_ref)` view.
It links a committed repair and its before/after candidate references to the
agent ID, proposal reference, base and proposed source digests, and pinned
mutation-policy digest. A proposal is recorded only after the generic
controller commits the new candidate; it is not a proof result and does not
appear in the ordinary workflow snapshot.

Browser artifacts and public verification authority for the runnable local
workflows are retained under their respective private run directories:

```text
.riddle-proof/proof-guided-web-change/<run>/
.riddle-proof/proof-guided-cta-change/<run>/
```

The process-local private signing key is not written there.

## Separation of responsibility

- The shared controller owns serialization, one-check-per-attempt consumption,
  candidate/revision/attempt history, new-revision changes, and fresh attempts.
  It receives an already configured proof client and a meaning-level change
  policy; it does not select either.
- Each application wrapper independently pins its expected contract identity
  and rejects a proof client with a changed contract. Ordinary checks accept
  only an app-issued opaque candidate reference.
- The durable workflow owns exactly two source variants and a deterministic
  repair. Its repair receives immutable source bytes, the displayed task, and
  checked meaning-level findings—never proof audit material.
- The CTA workflow owns its two source variants and the
  `riddle-proof.cta-change-agent.v1` protocol. The agent receives a proposal
  reference, exact base-source digest, displayed task, meaning-level findings,
  current and requested CTA values, and one permitted mutation kind. It does
  not receive or select the contract, browser profile, proof authority,
  signing key, run capability, proof transport, disposition, or audit record.
- The CTA executor requires an exact-key response bound to the issued proposal
  and base digest. It accepts only the pinned CTA values. The app—not the
  agent—then reconstructs and verifies the one reviewed output source.
- The two private experiments own their pinned contracts, local browser report
  adapters, signing and replay, deterministic application projection, and
  audit views. Public Riddle core and Playwright packages own the underlying
  evidence, certificates, and checked-meaning machinery.

Lean proves the bounded application relationships: a configured change
retains the pinned contract and policy, a changed subject cannot reuse an old
result, conformity requires a current verified result for the new subject,
and the CTA model has exact coverage of its four declared requirements. Lean
does not prove that Chromium observed the outside world accurately, that a
source change was commercially wise, or that a configured runtime provider
performed its declared work. Those remain explicit runtime and trust-boundary
facts.

## Agent process boundary

The deterministic reviewed fixture agent is used for reproducible tests. An
external CTA agent can instead be connected through
`createSubprocessCtaChangeAgent`. That adapter requires:

- an absolute executable path;
- an explicit real, non-symlink working directory;
- an empty environment by default, or an explicit string-only environment;
- `shell: false`, a bounded timeout, and bounded standard output.

These controls narrow ambient process input and command interpretation. They
are **not an operating-system sandbox**. The child still has every filesystem,
network, and subprocess capability that the operating system grants to its
user and executable. A real deployment must run it inside the company's
approved sandbox, container, account, and network policy when those
capabilities need further restriction.

## Local security and artifact boundary

The workbench and specimen servers bind only to `127.0.0.1`. Each local
process issues a 256-bit run capability. The workbench moves its launch token
into port-scoped `sessionStorage`, removes it from the address bar, and sends
it explicitly on API requests. A visible specimen preview and its semantic
proof target are separate disposable runtimes created from the same immutable
source bytes. Editing the visible preview therefore cannot seed the later
check.

The trusted local provider injects the proof target's short-lived
authorization header directly into its Playwright context. That secret is not
part of the profile, target identity, signed evidence, audit view, or retained
artifacts. No capability is placed in a host-scoped loopback cookie.
Capabilities expire when their server closes, and mutating HTTP calls accept
no caller-selected target, revision, profile, contract, repair, or agent
policy.

Browser artifacts can contain sensitive rendered material. They are created
beneath caller-owned `0700` directories, retained files are sealed to `0600`,
and portable receipts use relative publication references rather than
workstation paths. The app has no hosted Riddle client, configuration, or
request path.
