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
That harness drives the packaged `@riddledc/riddle-proof-run` checkpoint engine
directly.
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

This keeps the currently working OpenClaw/Discord proof flow on the public
`riddle_proof_change` path rather than a private skill/plugin prototype.

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
The current wrapper owns the public OpenClaw path; private instance repos should
only provide deployment-specific defaults and credentials.

## Tool

- `riddle_proof_change`
- `riddle_proof_status`
- `riddle_proof_inspect`
- `riddle_proof_sync`
- `riddle_proof_review`

`riddle_proof_change` accepts proofed-change-style params such as `repo`,
`branch`, `change_request`, `verification_mode`, `assertions_json`, and Discord
routing metadata. The default ship path should open or update a draft PR, prove
the exact commit, wait for CI, and mark the PR ready; `leave_draft: true` is an
explicit escape hatch for debug or intentionally draft-only runs. It returns a
`RiddleProofRunResult`.

For chat surfaces that should not keep one long tool reply open, pass
`run_mode: "background"` or configure `defaultRunMode: "background"`. The tool
then writes the wrapper state immediately, returns `status: "running"` with a
`state_path`, and continues the proof in the gateway process. Any OC interface
can poll `riddle_proof_status`, call `riddle_proof_inspect` when review evidence
is ready, and resume with `riddle_proof_review`. This is intentionally
channel-agnostic: Discord, Telegram, iMessage bridges, and CLIs all consume the
same state contract instead of relying on a fragile transport-specific timeout.
When a background run settles, the wrapper appends a durable
`run.wake.requested` event with the final status, blocker if any, and suggested
next tools. Host integrations can watch that event and re-enter the originating
OC session without this package knowing which chat transport is in use.

For pages behind login, pass generic browser auth as JSON strings:
`auth_localStorage_json`, `auth_cookies_json`, or `auth_headers_json`. These
are forwarded to the proof runtime so previews and script captures can exercise
authenticated pages without depending on a site-specific OpenClaw helper.
`use_auth: true` remains available only for deployments that have explicitly
configured their own auth helper.

`riddle_proof_status` accepts a wrapper `state_path` returned by
`riddle_proof_change` and returns a cheap status snapshot with run id, stage,
elapsed time, blocker, worktree path, and latest event.

`riddle_proof_inspect` accepts the same wrapper `state_path` and returns a
proof-native review packet: route match, repo profile usage, artifact URLs,
visual delta, structured proof evidence, semantic anchors, visible text samples,
and a concrete next action for the supervising agent. Use it when a run pauses
for proof review and the reviewer needs one compact packet instead of stitching
together raw state, screenshots, and side inspection tools.

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
