# @riddledc/riddle-proof-core

Capability-bounded Riddle Proof contracts, receipts, Semantic certificate
composition, and grounded verification.

This package contains no hosted Riddle endpoint, credential lookup, filesystem
access, browser automation, subprocess execution, or network implementation.
It permits deterministic cryptography. During the pre-1.0 compatibility period,
legacy certificate creation helpers may use the ambient clock when callers omit
`issued_at`; pass explicit timestamps for reproducible creation.

Install this package directly when a local or security-sensitive integration
does not need hosted Riddle behavior:

```sh
pnpm add @riddledc/riddle-proof-core
```

The capability declaration is published as `capabilities.json` and is enforced
against packed artifacts and clean installed dependency closures in repository
tests. The declaration is documentation, not the enforcement mechanism.

This package is not a JavaScript sandbox. The legacy `external_registry`
grounding path deliberately invokes verifier and contract callbacks supplied by
the caller; those functions have every capability of their host process. A
security-sensitive local workflow should use the callback-free
`builtin_declarative_json` verifier and contract definitions, or isolate any
external callback separately. `network: false` means the packed core owns no
network implementation or network dependency—it cannot constrain code injected
by its caller.

## Checked meaning rules

`@riddledc/riddle-proof-core/checked-meaning` adds a small, fixed interpreter
above grounded Semantic closures. A rule definition is data—not JavaScript or
an LLM callback—and its complete definition receives a domain-separated
SHA-256 digest. Consumers independently allowlist the exact rule ID, version,
engine, and digest before replay.

The v0 interpreter supports only:

- `all_of`: every ordered premise pattern must be present;
- exact premise claim IDs, versions, and parameter sets;
- fixed parameter values and equality across selected premise parameters;
- conclusion parameters projected from a named premise or fixed as literals;
- ordered premise timestamps and a composition timestamp no earlier than any
  direct premise; and
- an optional maximum direct-premise age at composition time.

Composition delegates the evidence work to the grounded-closure engine. The
result retains one grounding sidecar for each contract leaf and exactly one
checked-rule sidecar for each composition certificate. Shared descendants and
their sidecars are content-deduplicated.

```ts
import {
  assessRiddleProofCheckedMeaningClosure,
  composeRiddleProofCheckedMeaningClosures,
  createRiddleProofCheckedMeaningRule,
  matchRiddleProofCheckedMeaningClosure,
} from "@riddledc/riddle-proof-core/checked-meaning";

const rule = createRiddleProofCheckedMeaningRule({ definition });
if (!rule.ok) throw new Error(rule.error.message);

const result = composeRiddleProofCheckedMeaningClosures({
  expected_rule: rule.rule_ref,       // independent expected identity
  closures: groundedCheckedLeaves,
  issued_at: "2026-07-19T17:00:04.000Z",
  replay_contexts: leafReplayContexts,
  rule_registry: [rule.registration], // complete data-only definition
  trusted_rules: [rule.rule_ref],     // caller-controlled allowlist
});
```

The additional assurance is named `checked_allowlisted_rule`. It means that
the exact allowlisted rule accepted the exact grounded premises and produced
the exact conclusion. It does **not** mean that the rule is philosophically or
operationally correct, nor does it independently establish browser fidelity, sensor
calibration, key custody, or outside-world truth.

## Reusable trust and packet primitives

The public package supplies domain-neutral pieces that a consuming application
can assemble into its own protocol:

- `rule-trust-root` canonicalizes complete checked-meaning definitions and
  releases a registry only after its exact ID, version, and bundle digest match
  an independently supplied trust-root reference. A run may reference that
  root; it cannot choose or replace the rule bundle.
- `evidence-trust-root` pins reusable declarative evidence templates rather
  than run-specific claims. The consumer materializes an exact contract
  only from the verified observation, binds the sensor target to the expected
  scope, and rejects extra, missing, mistyped, or substituted parameters. The
  same trust-root digest therefore applies across different subjects. Each
  profile also pins a bounded, data-only recursive observation schema: objects
  have exactly the declared fields, arrays are fixed-length ordered tuples,
  and leaves are literals, claim-parameter values, SHA-256 digests, or bounded
  integers. Final replay rejects nonconforming root or nested fields,
  extra tuple entries, and captures that do not contain exactly the one pinned
  artifact ID, role, and media type.
- `packet` binds arbitrary private packet bytes to a content-free receipt. The
  receipt contains client-defined classification codes, opaque IDs,
  evidence-certificate links, independently supplied trust roots, exact
  root/currentness certificate IDs, generic execution metadata, and the digest
  of the execution policy enforced when the receipt was created. Creation
  rejects executions and entry issuers outside that policy. Core does not
  define a packet-complete claim or interpret a classification; the consumer
  owns those meanings in its pinned checked-meaning rules.
- Packet verification is intentionally separate from checked-meaning replay.
  After matching a separately replayed closure to the independently expected
  root claim and rule, the consumer supplies the nonempty unique set of
  certificate IDs resolved from that closure. Verification requires that set
  to contain the checked root, currentness certificate, and every entry-level
  evidence link. It also recomputes the independently supplied execution-policy
  digest, checks the exact private-byte digest and content-free projection,
  subject and trust roots, freshness, and issuance chronology.
  `digestRiddleProofPrivatePacketBytes` validates the complete private-packet
  envelope and returns its domain-separated byte digest without issuing a
  provisional receipt.

Private packet bytes are provided directly to the packet verifier and are not
returned in its result or copied into grounded closure artifacts. Consumer
rules, private examples, credentials, adapters, and signer registries belong
in the consumer's controlled environment rather than this package.

### Historical replay versus consumption-time freshness

`validateRiddleProofCheckedMeaningClosure` and
`replayRiddleProofCheckedMeaningClosure` preserve historical semantics: they
replay each signed capture against the policy and verification time recorded
for that run, then check every rule sidecar. A valid historical closure does
not automatically remain fresh for a decision made later.

Use `assessRiddleProofCheckedMeaningClosure` at the point of consumption. The
caller must provide a canonical `consumption_time`, `max_grounded_age_ms`, and
`max_future_skew_ms`; the core never reads ambient time. The result has one of
three dispositions:

- `checked`: replay succeeded, no signed capture is too old, and neither a
  capture nor the root is beyond allowed future skew;
- `stale`: replay succeeded, but `stale_certificate_ids` identifies every
  reachable grounded leaf whose signed `captured_at` exceeds the age bound;
- `unresolved`: input, structural replay, signatures, rule checks, or future
  clock bounds did not resolve safely.

Both windows are bounded by
`RIDDLE_PROOF_CHECKED_MEANING_MAX_CONSUMPTION_WINDOW_MS`. This disposition is a
uniform-age runtime specialization of grounded-leaf freshness. It still does
not establish that an allowlisted rule is semantically sound.

```ts
const assessment = assessRiddleProofCheckedMeaningClosure({
  checked_closure: result.checked_closure,
  replay_contexts: leafReplayContexts,
  rule_registry: [rule.registration],
  trusted_rules: [rule.rule_ref],
  consumption_time: "2026-07-19T21:00:00.000Z",
  max_grounded_age_ms: 15 * 60 * 1000,
  max_future_skew_ms: 1000,
});

if (assessment.disposition !== "checked") {
  // Re-ground or require review rather than relying on the conclusion.
}
```
