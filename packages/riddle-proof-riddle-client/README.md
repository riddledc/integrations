# @riddledc/riddle-proof-riddle-client

Hosted Riddle API client and hosted job helper surface.

Use this package when you want explicit control of Riddle API primitives,
rather than the full `@riddledc/riddle-proof` framework bundle.

The package intentionally hosts:

- `getRiddleBalance`
- API key + request helpers (`createRiddleApiClient`, `riddleRequestJson`)
- Poll helpers (`pollRiddleJob`, `isTerminalRiddleJobStatus`)
- Preview creation helpers (`runRiddleServerPreview`, `runRiddleScript`, `deployRiddleStaticPreview`)

For backward compatibility, `@riddledc/riddle-proof` still exports the same
client surface at `@riddledc/riddle-proof/riddle-client`.

## Usage

```bash
npm install @riddledc/riddle-proof-riddle-client
```

```ts
import { createRiddleApiClient } from "@riddledc/riddle-proof-riddle-client";

const client = createRiddleApiClient({ apiKey: process.env.RIDDLE_API_KEY });
const balance = await client.getBalance();
console.log("Available seconds:", balance.available_seconds);
```

## Subpaths

- `./client`
- `./balance`
- `./preview`
- `./runScript`
- `./serverPreview`
- `./polling`
- `./artifacts`

