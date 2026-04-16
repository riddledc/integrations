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

Set `proofReviewMode: "main_agent"` when the local Codex adapter should still
handle recon, proof authoring, and implementation, but final proof judgment
should pause for the current OpenClaw agent. In that mode the run blocks at
`main_agent_proof_review_required` with a proof-review packet containing the
request, before/after image URLs, visual delta metadata, and a review rubric.
The OpenClaw agent can inspect the screenshot evidence in its own conversation
context and then resume the same run with `riddle_proof_review`.
The ready verdict is intentionally strict: for visual polish, screenshots must
prove a visible reviewer-scale change, not just a code or CSS difference.

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
- `riddle_proof_sync`
- `riddle_proof_review`

`riddle_proof_change` accepts proofed-change-style params such as `repo`,
`branch`, `change_request`, `verification_mode`, `assertions_json`, and Discord
routing metadata. The default ship path should open or update a draft PR, prove
the exact commit, wait for CI, and mark the PR ready; `leave_draft: true` is an
explicit escape hatch for debug or intentionally draft-only runs. It returns a
`RiddleProofRunResult`.

`riddle_proof_status` accepts a wrapper `state_path` returned by
`riddle_proof_change` and returns a cheap status snapshot with run id, stage,
elapsed time, blocker, worktree path, and latest event.

`riddle_proof_sync` accepts the same wrapper `state_path` and asks the configured
engine to reconcile PR lifecycle state. It is the explicit path for "the PR was
merged, update the run": check the PR, record merged/closed/open state, fetch the
base branch when configured, safely fast-forward a clean local base checkout
when configured, and clean isolated proof worktrees after merge. The sync result
includes `cleanup_report.base_checkout` so operators can see the base worktree,
branch, clean state, local/remote heads, and whether the fast-forward ran,
skipped, or failed.

`riddle_proof_review` accepts the wrapper `state_path` plus a structured
main-agent proof verdict. It is intended for runs that stopped at
`main_agent_proof_review_required`; the submitted judgment is passed back to the
underlying engine as `proof_assessment_json` so the workflow can ship, iterate,
or escalate without losing run state.

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
  "proofReviewMode": "main_agent",
  "defaultShipMode": "ship"
}
```

The adapter runs `codex exec` in the isolated after-worktree supplied by the
Riddle Proof engine. It writes no package-time secrets and removes inherited
`OPENAI_API_KEY` from the child process environment so a configured
`CODEX_HOME` login is used unless the host wraps the command differently.

With `proofReviewMode: "main_agent"`, `codex exec` is not asked to make the
final proof judgment. It implements the change and captures proof, then the
wrapper returns a review packet for the main OpenClaw agent to judge using the
visible screenshots and evidence bundle.
