# @riddledc/riddle-proof-runner-playwright

Local, self-hosted Playwright runtime for [Riddle Proof](https://github.com/riddledc/riddle-proof-profile) profiles.

This package is the minimal trusted reference implementation for running profile scripts in your own process.

## Install

```bash
pnpm add -D @riddledc/riddle-proof-runner-playwright
pnpm add -D playwright
```

`playwright` is a peer dependency and must be installed in your environment.

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
});

console.log(result.result.status);
```

Artifacts are written to the output directory:

- `profile-result.json`
- `proof.json`
- `console.json`
- `dom-summary.json`
- `summary.md`
- `artifact-manifest.json`
- optional `screenshots/*.png`

## Outputs

- `result`: normalized `RiddleProofProfileResult`
- `outputDir`: resolved output directory used for artifact writes
- `manifestPath`: absolute path to `artifact-manifest.json`
