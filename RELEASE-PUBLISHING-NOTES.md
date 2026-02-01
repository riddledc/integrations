# Release Publishing Notes (2026-02-01)

## Summary
We set up the `riddledc/integrations` monorepo with two packages (`@riddledc/riddle-mcp`, `@riddledc/openclaw-riddledc`), added CI release workflow via Changesets, and attempted to publish to npm. Publishing is currently blocked by npm requiring an OTP (EOTP), which indicates the `NPM_TOKEN` in GitHub Secrets is not an **automation token** or npm publish 2FA is still enforced.

## What We Did

### Repo + Package Setup
- Created public repo: `https://github.com/riddledc/integrations`.
- Monorepo: pnpm workspaces + changesets.
- Packages:
  - `@riddledc/riddle-mcp` (includes MCP server CLI + helpers)
  - `@riddledc/openclaw-riddledc` (OpenClaw plugin)
- Added MCP page docs updates to use npm install + `npx riddle-mcp` (no local path).

### OpenClaw Plugin Import
- Pulled plugin from EC2 instance `i-0bdfd7f01f88c6d80` via SSM.
- Files imported:
  - `openclaw.plugin.json`
  - `index.ts`
- Updated package metadata and README with required config.

### Build + Type Fixes
- Added `@types/node` to both packages and updated tsconfigs (`types: ["node"]`).
- Fixed type safety in `packages/riddle-mcp/src/server.ts` for `args` in tool handlers.
- Build succeeds locally with pnpm (using local npm cache workaround).

### Cleanup
- Accidentally committed `dist/` and `node_modules/` in an early commit.
- Added `.gitignore` and removed tracked artifacts in a cleanup commit.

### Release Workflow Fixes
- Added `.github/workflows/release.yml` (Changesets Action + pnpm build).
- Fixed ordering: pnpm setup before `setup-node` cache.
- Aligned pnpm version to `9.15.2` (matches `packageManager` in root `package.json`).
- Added `workflow_dispatch` so we can rerun releases manually.
- Fixed publish command: `changeset publish --access public` is handled in `package.json` (not extra args in workflow).

## Current Failure
All release runs fail with:

```
EOTP This operation requires a one-time password from your authenticator.
```

This means npm is still requiring OTP for publishing. The token in GitHub Secrets likely is **not** an automation token, or npm account 2FA is set to require OTP for publishes.

## Release Runs / Logs
- Release workflow runs repeatedly failed with EOTP when publishing both packages.
- Changesets is attempting to publish **0.2.0** (not 0.1.0) because package versions were bumped after earlier edits.

## Required Fix
In npm:
1) Create an **Automation token** (not “classic”) with publish rights.
2) Set npm 2FA for publish to **Automation** (or equivalent setting).
3) Update GitHub repo secret `NPM_TOKEN` with the automation token.

After this, rerun the Release workflow:
```
Actions → Release → Run workflow
```

## Optional Follow-ups
- Verify actual desired first version (currently at 0.2.0). If you want 0.1.0, we need to reset package versions and regenerate changesets.
- After successful publish:
  - Verify `npm view @riddledc/riddle-mcp`
  - Verify `npm view @riddledc/openclaw-riddledc`

## Files Updated (Key)
- `.github/workflows/release.yml`
- `package.json` (root release script)
- `packages/riddle-mcp/src/server.ts`
- `packages/riddle-mcp/package.json`
- `packages/openclaw-riddledc/package.json`
- `README.md` (root)
- `packages/openclaw-riddledc/README.md`
- `.gitignore`
- `pnpm-lock.yaml`

## Resolution (2026-02-01)
- Release workflow succeeded after org policy change allowed automation publish.
- Published packages:
  - @riddledc/openclaw-riddledc@0.2.0
  - @riddledc/riddle-mcp@0.2.0
- Tags pushed:
  - @riddledc/openclaw-riddledc@0.2.0
  - @riddledc/riddle-mcp@0.2.0
- Debug steps removed from workflow after success.
