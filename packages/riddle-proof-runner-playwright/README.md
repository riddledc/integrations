# @riddledc/riddle-proof-runner-playwright

Local, self-hosted Playwright runtime for [Riddle Proof](https://github.com/riddledc/riddle-proof-profile) profiles.

This package is the minimal trusted reference implementation for running profile scripts in your own process.

## Install

```bash
pnpm add -D @riddledc/riddle-proof-runner-playwright
pnpm add -D playwright
```

`playwright` is a peer dependency and must be installed in your environment.
Install its bundled browser with `npx playwright install chromium`. If that
executable is absent and `PLAYWRIGHT_BROWSERS_PATH` was not explicitly set, the
Chromium runner can use an installed system Chrome instead.

## CLI

Run one profile with a local browser session:

```bash
riddle-proof-playwright run-profile \
  --profile ./mobile-layout-smoke.json \
  --url https://example.com \
  --output ./artifacts/riddle-proof \
  --viewport-name desktop
```

Use `--help` for full flag details.

When the URL is a Riddle Preview, attach its immutable receipt so the local
executor preserves the Preview target and source binding instead of recording
an unbound generic URL:

```bash
riddle-proof-playwright run-profile \
  --profile ./mobile-layout-smoke.json \
  --url https://preview.riddledc.com/s/pv_example/ \
  --preview-receipt ./artifacts/preview/preview-receipt.json \
  --source-revision "$PR_HEAD_SHA" \
  --output ./artifacts/riddle-proof-preview
```

`--source-revision`, `--source-repository`, and `--source-dirty` override
individual source fields; unspecified fields continue to come from the Preview
receipt.

The CLI exits according to the profile's `failure_policy`; a regression,
blocked environment, or insufficient required evidence therefore produces a
nonzero process exit when the policy says it should. Use `--always-zero` only
for an explicit collector workflow that must persist evidence without gating
the calling process.

## Node API

```ts
import { runProfileLocal } from "@riddledc/riddle-proof-runner-playwright";

const result = await runProfileLocal({
  profile: {
    version: "riddle-proof.profile.v1",
    name: "mobile-layout-smoke",
    target: {
      route: "/",
      viewports: [{ name: "desktop", width: 1280, height: 800 }],
      wait_for_selector: "body",
      setup_actions: [{ type: "wait", ms: 200 }],
    },
    checks: [
      { type: "text_visible", text: "Example" },
      { type: "no_fatal_console_errors" },
    ],
  },
  outputDir: "./artifacts/riddle-proof",
  url: "https://example.com",
  // previewReceipt: parsedPreviewReceipt,
});

console.log(result.result.status);
```

To bind the browser observation to an independent challenge, semantic scope,
collector/verifier identities, and an Ed25519 signer, pass `groundedCapture` to
`runProfileLocal`:

```ts
const result = await runProfileLocal({
  profile,
  outputDir: "./artifacts/riddle-proof",
  url: "https://example.com",
  groundedCapture: {
    scope,
    nonce, // canonical base64url encoding of an independently issued 32-byte challenge
    collector,
    verifier,
    signingKey: {
      key_id: "local-playwright-key",
      private_key_pkcs8_base64: privateKeyDer.toString("base64"),
    },
  },
});

console.log(result.groundedCapturePath);
```

This mode also writes `normalized-profile.json`, `profile-evidence.json`, and
`grounded-capture-bundle.json`. The signed bundle contains the exact persisted
artifact bytes and declares the browser name/version, user agent, observed URL,
and capture policy. The legacy manifest, observation receipt, and bundle itself
are deliberately excluded from the signed artifact set to avoid self-reference
cycles. Verification still requires an independently supplied policy, trusted
public key, and deterministic verifier via
`verifyRiddleProofSignedCaptureBundle` from `@riddledc/riddle-proof-core`.

## Sealed profile composition

An exploratory browser run may remain unsealed. When a browser result is going
to be reused as a proof premise, the package can turn one signed
`profile-result.json` into an exact seven-node checked closure:

```text
capture bound to scope + route matched       -> target confirmed
declared profile passed + captured run clean -> behavior confirmed
target confirmed + behavior confirmed        -> sealed profile satisfied
```

Every node carries the same repository, revision, environment, target,
proof-attempt, profile-name, and exact normalized-profile digest. The three
rules require all seven to match, so a fact from another run or a weaker
profile with the same name cannot silently enter the pyramid. The root means
only that the exact declared profile was satisfied for that sealed scope; it
does not mean that the page is generally correct or release-ready.

Independently compute the digest of the exact normalized profile bytes,
construct the expected protocol before capture, use its verifier reference for
the signed capture, and then issue the checked closure:

```ts
import {
  createRiddleProofBrowserSealedProof,
  createRiddleProofBrowserSealedProtocol,
  replayRiddleProofBrowserSealedProof,
} from "@riddledc/riddle-proof-runner-playwright";

const expected = createRiddleProofBrowserSealedProtocol({
  expected_scope: scope,
  expected_profile_name: profile.name,
  expected_profile_digest: expectedProfileDigest,
});
if (!expected.ok) throw new Error(expected.error.message);

// Pass expected.protocol.verifier.verifier_ref to
// runProfileLocal({ groundedCapture: ... }).

const proof = createRiddleProofBrowserSealedProof({
  bundle: groundedCaptureBundle,
  expected_scope: scope,
  expected_profile_name: profile.name,
  expected_profile_digest: expectedProfileDigest,
  authority: { policy, trusted_signers },
  protocol: expected.protocol,
  leaf_issued_at: policy.verification_time,
  target_issued_at: targetIssuedAt,
  behavior_issued_at: behaviorIssuedAt,
  root_issued_at: rootIssuedAt,
});
if (!proof.ok) throw new Error(proof.error.message);

const replay = replayRiddleProofBrowserSealedProof({
  checked_closure: JSON.parse(JSON.stringify(proof.checked_closure)),
  // Independently supplied by the consumer; never copied from the packet.
  authority: { policy, trusted_signers },
  protocol: expected.protocol,
  expected_root_certificate_id: proof.root_certificate.certificate_id,
  expected_scope: scope,
  expected_profile_name: profile.name,
  expected_profile_digest: expectedProfileDigest,
});
if (!replay.ok) throw new Error(replay.error.message);
```

Replay, exact-root matching, missing-premise rejection, mutation rejection, and
branch reuse are the acceptance criteria. A fresh agent can invoke replay as a
portability check, but whether that agent happens to feel like rechecking is
not a proof property. This is semantic compaction rather than byte
compression: callers can rely on the root while the complete signed evidence
and derivation graph remain available for expansion and audit.

The installed package's external sealed-observation verifier is part of the
trust boundary. Replay replaces serialized verifier callbacks with that pinned
registration; the core checks its declared identity and invokes it, but does
not derive an implementation digest from JavaScript function source.
The verifier parses the exact digest-pinned normalized profile, binds result
and evidence timestamps to the signed capture, deterministically reassesses
the signed evidence against the profile, and requires the exact ordered check
identity vector to be nonempty and entirely passed.

Replay also reconstructs every exact contract registration and expected
contract from the protocol. The consumer must supply the capture policy and
trusted signer set independently. `proof.replay_contexts` is useful for
same-process composition, but it is convenience output—not a portable trust
root and not an input to sealed replay.

## Durable browser-transition composition

The transition protocol composes four separately signed, exact-profile
checkpoints into a reusable fan-out graph:

```text
before + action/after -> transition observed (T)
T + reload readback  -> transition survived reload (PR)
T + fresh readback   -> transition visible in fresh context (PF)
PR + PF              -> durable state transition observed (D)
```

`createRiddleProofBrowserTransitionProtocol` pins the scope, binds the
transition ID to `scope.proof_attempt`,
four profile names, four distinct normalized-profile digests, and all seven
composition rules. `createRiddleProofBrowserTransition` independently replays
the four sealed checkpoints using one caller-supplied evidence-authority entry
per role, requires four distinct signed capture bundles, and enforces the
signed capture partial order `before <= action`, `action <= reload`, and
`action <= fresh` without imposing an order between reload and fresh. It then
creates `D`.
`replayRiddleProofBrowserTransition` independently reconstructs all 16 leaf
contexts from those authorities and exact protocol contracts, re-verifies
every signed leaf, checks the expected root, and repeats the bundle and signed-
capture chronology checks. The shared `T` branch remains one content-
addressed node, so replacing only the fresh-context capture preserves the
before/action and reload certificate IDs while producing replacement `PF` and
`D` certificates. The immutable historical certificates remain auditable.

Returned transition replay contexts are likewise same-process convenience
data. Consumers hand off the checked closure and separately pinned protocol,
profiles, scope, root ID, and four evidence authorities; packet-supplied
policies, signers, verifiers, or contracts never authorize replay.

The root is intentionally narrow: the declared before, action/after, reload,
and fresh-context profiles were observed under the exact protocol. It does not
prove that the action caused the state, identify the persistence mechanism, or
establish general application correctness.

Artifacts are written to the output directory:

- `profile-result.json`
- `proof.json`
- `console.json`
- `dom-summary.json`
- `summary.md`
- `artifact-manifest.json`
- `observation-receipt.json`
- optional `screenshots/*.png`
- optional grounded-capture files listed above

The Observation receipt records the local executor and source Git identity,
uses the final viewport frame as its canonical screenshot, distinguishes setup
screenshots from final evidence, and points at the actual artifact paths in the
manifest.

## Outputs

- `result`: normalized `RiddleProofProfileResult`
- `outputDir`: resolved output directory used for artifact writes
- `manifestPath`: absolute path to `artifact-manifest.json`
- `observation`: parsed `riddle-proof.observation-receipt.v1`
- `observationPath`: absolute path to `observation-receipt.json`
- `groundedCaptureBundle`: parsed signed bundle when `groundedCapture` is enabled
- `groundedCapturePath`: absolute path to `grounded-capture-bundle.json` when enabled
- `groundedCaptureError`: explicit omission reason when grounded capture was requested
  but no truthful signed browser capture could be created
