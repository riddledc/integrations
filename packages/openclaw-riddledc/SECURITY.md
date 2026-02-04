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

## Agent Context Access

This plugin has **no access** to:

| Context | Access |
|---------|--------|
| Conversation history | ❌ None |
| Other tools' outputs | ❌ None |
| User profile / preferences | ❌ None |
| Other plugins' data | ❌ None |
| System environment (except RIDDLE_API_KEY) | ❌ None |

The plugin only sees data explicitly passed to its tools by the agent. It does not hook into message events, read logs, or access the agent's memory/context.

## Capability Manifest

This plugin declares its capabilities in `openclaw.plugin.json`. Key constraints:

- **Network egress**: Only `api.riddledc.com` (hardcoded, enforced at runtime)
- **Filesystem**: Write only to `~/.openclaw/workspace/riddle/`
- **Tools**: Provides 5 tools; invokes no other agent tools
- **Secrets**: Only `RIDDLE_API_KEY` required

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
| Supply chain attack (npm) | npm provenance + checksums + reproducible builds |
| Build tampering | CHECKSUMS.txt with SHA256 hashes |
| Local file access | Plugin only writes to designated workspace subdirectory |
| Context/conversation leakage | Plugin has no access to agent context (see above) |
| Prompt injection via tool output | Screenshots saved as file refs, not inline content |

## Recommended: Run in Sandbox

For defense in depth, consider running your agent with sandboxing enabled:

```yaml
# In your OpenClaw config
agents:
  defaults:
    sandbox: true
```

This runs tools like `exec` in a Docker container, limiting blast radius if any plugin or skill misbehaves. While this plugin doesn't require sandboxing (it only calls a remote API), sandboxing protects against other plugins or prompt injection attacks.

## Reporting Security Issues

Email: security@riddledc.com
