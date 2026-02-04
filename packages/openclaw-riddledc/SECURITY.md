# Security Model

## Data Flow

```
┌─────────────────┐     HTTPS only      ┌──────────────────┐
│  OpenClaw Agent │ ──────────────────► │ api.riddledc.com │
│                 │   POST /v1/run      │                  │
│  - RIDDLE_API_KEY                     │  - Runs browser  │
│  - User prompts │ ◄────────────────── │  - Returns data  │
└─────────────────┘   JSON response     └──────────────────┘
        │
        ▼
┌─────────────────┐
│ Local Workspace │
│ ~/.openclaw/    │
│ workspace/riddle│  Screenshots saved
│ /screenshots/   │  as files (not inline)
└─────────────────┘
```

## What This Plugin CAN Do

- Send requests to api.riddledc.com (hardcoded, cannot be changed)
- Read your RIDDLE_API_KEY from config or environment
- Write screenshot/HAR files to your workspace directory
- Execute Playwright scripts on Riddle's remote browser

## What This Plugin CANNOT Do

- Send your API key to any other domain (blocked by `assertAllowedBaseUrl`)
- Access your filesystem outside the workspace directory
- Make network requests to arbitrary URLs from your machine
- Run code locally (all execution happens on Riddle's servers)

## Security Controls

### 1. Hardcoded Domain Allowlist

```typescript
function assertAllowedBaseUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:")
    throw new Error(`Riddle baseUrl must be https`);
  if (url.hostname !== "api.riddledc.com")
    throw new Error(`Refusing to use non-official Riddle host`);
}
```

This runs on EVERY request. Even if config is manipulated, keys never leave riddledc.com.

### 2. No Inline Base64

Screenshots are saved to disk, not returned inline. This prevents:

- Context overflow attacks
- Memory exhaustion
- Accidental key leakage in logs

### 3. Minimal Permissions

Only requires one secret: `RIDDLE_API_KEY`. No OAuth, no cookies, no session state.

## Threat Model

| Threat | Mitigation |
|--------|------------|
| API key exfiltration to attacker server | Hardcoded domain check blocks all non-riddledc.com requests |
| Malicious config injection | Domain check runs at request time, not config time |
| Supply chain attack (npm) | Use npm provenance to verify package origin |
| Build tampering | Checksums + reproducible builds |
| Local file access | Plugin only writes to designated workspace subdirectory |

## Reporting Security Issues

Email: security@riddledc.com
