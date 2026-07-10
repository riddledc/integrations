# @riddledc/riddle-proof-riddle-client

Compatibility package for the hosted Riddle API client and job helpers.

The canonical implementation now lives at
`@riddledc/riddle-proof/riddle-client`. This package re-exports that exact
implementation so existing consumers keep working without maintaining a
parallel request, polling, Preview, or source-detection stack.

The package intentionally hosts:

- `getRiddleBalance`
- API key + request helpers (`createRiddleApiClient`, `riddleRequestJson`)
- Poll helpers (`pollRiddleJob`, `isTerminalRiddleJobStatus`)
- Preview creation helpers (`runRiddleServerPreview`, `runRiddleScript`, `deployRiddleStaticPreview`)

New consumers should install `@riddledc/riddle-proof` and import the canonical
subpath. Existing consumers can remain on this package and migrate without a
behavior change.

## Usage

```bash
npm install @riddledc/riddle-proof
```

```ts
import { createRiddleApiClient } from "@riddledc/riddle-proof/riddle-client";

const client = createRiddleApiClient({ apiKey: process.env.RIDDLE_API_KEY });
const balance = await client.getBalance();
console.log("Available seconds:", balance.available_seconds);
```

Preview deploys return `receipt` when the hosted Preview service supports
`riddle.preview-receipt.v1`. The client detects the repository, Git revision,
and clean/dirty state by default, or accepts an explicit `source` override.

## Subpaths

- `./client`
- `./balance`
- `./preview`
- `./runScript`
- `./serverPreview`
- `./polling`
- `./artifacts`
