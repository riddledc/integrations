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
