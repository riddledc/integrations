# Proof-guided CTA change experiment

This private experiment applies one installed browser contract to an opaque
candidate reference. It is intentionally a client of the generic Riddle Proof
machinery, not a new public package.

The pinned profile checks exactly four application requirements:

- `primary-cta-correct`: one visible CTA, exact `View pricing` text, exact
  `/pricing` href.
- `routes-preserved`: the home route, visible navigation, and exact
  Home/Features/Pricing route inventory remain healthy.
- `responsive-layout-healthy`: the declared mobile and desktop viewports stay
  within the pinned horizontal-overflow tolerance.
- `runtime-healthy`: the captured browser runtime is complete and contains no
  fatal console or page error.

## Trust boundary

`createProofGuidedCtaChangeClient` installs the contract, resolver, and report
provider at construction. A normal call is only:

```js
await client.check({ candidate_ref: "opaque-ref" });
```

The resolver may return only repository, revision, environment, and target.
The client derives the profile, profile digest, proof-attempt identity,
subject, expected root, requirement labels, and repair guidance.

`createLocalCtaBrowserReportProvider` runs the pinned profile with local
Playwright, signs the exact persisted profile/result artifacts, and replays the
proof before returning verifier facts. It creates a four-requirement status
report for every capture. A nonconforming capture uses that replayed report as
the negative root. A fully satisfying capture additionally creates and replays
the existing passed-only sealed-profile root.

Only check `type`, `label`, and `status` are used for requirement grouping.
Those are the fields the sealed observation verifier deterministically
reassesses from the pinned normalized profile and signed browser evidence.
Producer-authored check messages or detailed check evidence never determine an
application disposition or finding.

The runner's route-inventory check visits auxiliary routes and may finish on
one of them. Before replay, the provider requires the runner's primary route to
match the requested target, binds the sensor identity to that primary target,
and preserves the final auxiliary URL as metadata. This keeps the target claim
honest without changing any signed profile or result artifact bytes.

This experiment does not prove general design quality, business effectiveness,
or facts that the profile does not encode. The browser target may make network
requests; hosted Riddle behavior is absent.
