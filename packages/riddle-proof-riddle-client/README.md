# @riddledc/riddle-proof-riddle-client

Hosted Riddle API client and job helpers.

Within the Riddle Proof package family, this package is the sole implementation
owner for Riddle-hosted endpoints, API-key resolution, uploads, Preview
publication, and job polling. Separately packaged MCP and OpenClaw integrations
retain their explicit hosted capabilities. This package depends only on the
deterministic `@riddledc/riddle-proof-core` contracts needed to parse receipts.
It does not depend on the compatibility facade.

`@riddledc/riddle-proof/riddle-client` remains a compatibility re-export of
this exact implementation, so existing consumers preserve behavior and share
the same `RiddleApiError` class identity.

Because this package intentionally performs network, filesystem, browser, and
subprocess work, those capabilities are declared in the published
`capabilities.json`. Local-only consumers should install the bounded core and
the specific surface adapter they need instead.

The package intentionally hosts:

- `getRiddleBalance`
- `getRiddleJobArtifacts`
- API key + request helpers (`createRiddleApiClient`, `riddleRequestJson`)
- Poll helpers (`pollRiddleJob`, `isTerminalRiddleJobStatus`)
- Preview creation helpers (`runRiddleServerPreview`, `runRiddleScript`, `deployRiddleStaticPreview`)

New hosted consumers should install this package directly. Existing facade
consumers can migrate without a behavior change.

## Usage

```bash
npm install @riddledc/riddle-proof-riddle-client
```

```ts
import { createRiddleApiClient } from "@riddledc/riddle-proof-riddle-client/client";

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
