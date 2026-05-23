# @riddledc/riddle-proof-app-contract

Small, explicit helpers for exposing app state to Riddle Proof checks.

Riddle Proof only inspects a tiny contract; your app should provide only the
data needed for reliable checks.

## Install

```bash
pnpm add @riddledc/riddle-proof-app-contract
```

## Browser contract

Use the browser helper to install the proof contract in runtime pages:

```ts
import { installRiddleProofContract } from "@riddledc/riddle-proof-app-contract/browser";

installRiddleProofContract({
  version: "my-app.proof.v1",
  getState: () => ({
    route: location.pathname,
    currentMode: "play",
    visiblePanel: "hud",
    itemCount: 5,
  }),
});
```

The helper keeps payloads compact by redacting common secrets by default.

## Redaction

Use the redaction helper directly when you prepare contract state.

```ts
import { redactObject } from "@riddledc/riddle-proof-app-contract/redaction";

const state = redactObject({
  token: "abc",
  score: 10,
  cart: { user: { email: "a@b.com", token: "secret" } },
});
```

## Exports

- `./browser`:
  - `installRiddleProofContract`
  - `readRiddleProofContract`
  - `uninstallRiddleProofContract`
  - `normalizeRoute`
- `./redaction`:
  - `redactObject`
  - `redactPath`
  - `createDefaultSensitivePaths`
- `./types`: shared types and shared contract defaults

### CI / profile intent

Apps with this contract can avoid brittle DOM scraping by exposing stable state
under a single, reviewable contract.

