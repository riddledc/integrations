# @riddledc/openclaw-riddle-proof

OpenClaw wrapper for Riddle Proof: evidence-backed workflows for
agent-authored changes.

This package is intentionally separate from `@riddledc/openclaw-riddledc`.
The browser automation plugin stays focused on hosted browser tools while this
package owns the Riddle Proof OpenClaw install surface.

## Status

Initial wrapper scaffold plus the first engine-harness wiring point. In default
mode it normalizes OpenClaw tool parameters through
`@riddledc/riddle-proof/openclaw`, creates the shared run envelope, and returns
a blocked result until execution is explicitly configured.

When configured with `executionMode: "engine"` and a `riddleEngineModuleUrl`,
the wrapper calls the reusable engine harness in `@riddledc/riddle-proof`.
That harness drives the existing `riddle-proof-run` checkpoint engine directly.
By default it still stops at concrete blockers when an agent adapter is not
configured. When `agentMode: "codex_exec"` is explicitly set, the wrapper uses a
local `codex exec` adapter for recon judgment, proof packet authoring,
implementation, and proof judgment.

This keeps the currently working OpenClaw/Discord proof flow as the reference
implementation while the new wrapper reaches parity.

## Product Boundary

This package is meant to become the OpenClaw entry point for the full Riddle
Proof harness, not just a skill prompt. The valuable path is:

```text
idea -> workspace setup -> agent implementation -> server-backed proof capture
     -> proof judgment -> PR creation -> CI evidence -> integration update
```

The wrapper owns the OpenClaw tool contract and integration metadata. The
reusable harness behind it owns the hard workflow pieces: configured agent
execution, Riddle server usage, proof assessment, ship gates, and notifications.
The current wrapper stops after request normalization until those adapters are
wired and parity-tested against the existing `proofed_change_run` flow.

## Tool

- `riddle_proof_change`
- `riddle_proof_status`

`riddle_proof_change` accepts proofed-change-style params such as `repo`,
`branch`, `change_request`, `verification_mode`, `assertions_json`, and Discord
routing metadata. It returns a `RiddleProofRunResult`.

`riddle_proof_status` accepts a wrapper `state_path` returned by
`riddle_proof_change` and returns a cheap status snapshot with run id, stage,
elapsed time, blocker, worktree path, and latest event.

## Runtime Boundary

The wrapper depends on `@riddledc/riddle-proof` for contracts and normalization.
It does not invoke another OpenClaw plugin and does not supply a coding agent.
The reusable engine harness and the local Codex exec adapter are wired behind
explicit config. Agent execution remains an adapter boundary: the package does
not publish a hosted coding agent or secrets. The configured runtime must supply
the local `codex` CLI environment, repository access, Riddle engine module, and
any service credentials needed by that runtime before the wrapper can drive all
the way to a PR.

The package should call configured services and credentials at runtime; it must
not publish Riddle server secrets, Discord credentials, GitHub tokens, or
OpenClaw-instance-specific configuration.

## Codex Exec Adapter

The optional adapter can be enabled with config like:

```json
{
  "executionMode": "engine",
  "agentMode": "codex_exec",
  "riddleEngineModuleUrl": "file:///root/.openclaw/extensions/riddle-proof-run/dist/engine.js",
  "codexHome": "/root/.codex",
  "codexSandbox": "workspace-write",
  "defaultShipMode": "ship"
}
```

The adapter runs `codex exec` in the isolated after-worktree supplied by the
Riddle Proof engine. It writes no package-time secrets and removes inherited
`OPENAI_API_KEY` from the child process environment so a configured
`CODEX_HOME` login is used unless the host wraps the command differently.
