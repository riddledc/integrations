# @riddledc/riddle-proof

Reusable contracts and helpers for Riddle Proof: evidence-backed workflows for
agent-authored changes.

Riddle Proof is agent-agnostic. Bring a coding agent through an adapter; Riddle
Proof standardizes evidence, proof assessment, ship gates, terminal results,
and integration metadata.

This package includes the reusable runner harness that drives a request through
preflight, setup, implementation, proof capture, judgment, shipping, and
notification adapters. The OpenClaw wrapper uses the public
`riddle_proof_change` tool and this package's bundled proof-run checkpoint
engine.

## Initial Scope

- Run/result/state/event types
- Evidence bundle and proof assessment types
- Adapter interfaces
- State/event helpers for wrappers that need a stable run envelope
- Runner harness for preflight -> setup -> implement -> prove -> judge -> ship -> notify
- Stage heartbeat and run status snapshot helpers
- Capture diagnostics helpers for redacted Riddle server preview evidence
- Worktree metadata and proof artifact role contracts
- Terminal ship metadata normalization
- Stable result helpers
- OpenClaw parameter normalization via `@riddledc/riddle-proof/openclaw`

## Non-Goals

- Supplying a coding agent
- Replacing the working OpenClaw plugin in place
- Invoking OpenClaw plugins from inside other plugins

Future wrappers can consume this package from OpenClaw, Discord, CLI, GitHub
Actions, or Riddle-hosted workflows.

## Install

```sh
npm install @riddledc/riddle-proof
```

## Usage

```ts
import { createRunResult, createRunState } from "@riddledc/riddle-proof";
import { runRiddleProof } from "@riddledc/riddle-proof/runner";
import { createCaptureDiagnostic } from "@riddledc/riddle-proof/diagnostics";
import { toRiddleProofRunParams } from "@riddledc/riddle-proof/openclaw";
```

The root export provides generic contracts and helpers. Integration-specific
adapters are exposed through subpaths such as
`@riddledc/riddle-proof/openclaw`, so wrappers can reuse the mapping logic
without depending on another plugin runtime.

## Runner Harness

`runRiddleProof` is the reusable idea-to-PR workflow driver. It does not ship
credentials or a coding agent. It calls adapters supplied by the host
integration:

```text
preflight -> setup -> implement -> prove -> judge -> ship -> notify
```

The preflight adapter checks model/tool availability before proof work starts.
The setup adapter should report the isolated worktree path, branch, and cleanup
policy it chose. During the run, wrappers can emit `appendStageHeartbeat`
events and return `createRunStatusSnapshot` for cheap observer status.

The proof adapter is where a host wires Riddle server-backed capture. The ship
adapter is where a host commits, pushes, opens or updates a PR, and waits for CI
when configured. `ship_mode: "ship"` is expected to drive the happy path all the
way to a ready PR after proof and CI; `leave_draft: true` is only an explicit
debug or user-request escape hatch. The notification adapter is where a host
updates Discord, OpenClaw, GitHub, or another integration.

## Capture Diagnostics

`@riddledc/riddle-proof/diagnostics` standardizes the evidence contract around
Riddle-backed capture calls. It is designed for state files, PR proof comments,
and agent handoffs where a reviewer needs to know whether proof failed because
the route was wrong, the preview was not ready, the capture script did not save
artifacts, or the app runtime produced weak evidence.

```ts
import {
  appendCaptureDiagnostic,
  createCaptureDiagnostic,
  summarizeCaptureArtifacts,
} from "@riddledc/riddle-proof/diagnostics";

const args = {
  server_path: "/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile",
  wait_for_selector: "[data-proof-ready='true']",
  script,
};

const payload = await runRiddleServerPreview(args);

const diagnostic = createCaptureDiagnostic({
  label: "after",
  tool: "riddle_server_preview",
  args,
  payload,
  route: "/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile",
});

appendCaptureDiagnostic(state, { label: "after", tool: "riddle_server_preview", args, payload });
console.log(summarizeCaptureArtifacts(payload));
```

The helper redacts sensitive keys such as authorization headers, cookies,
local storage, API keys, secrets, passwords, and tokens. It preserves route,
selector, script shape, artifact names, URLs, result keys, console summary, and
artifact errors. Long strings and arrays are capped so diagnostics remain safe
to keep in a run state.

### Runtime Evidence Contract

For browser previews, apps can expose deterministic proof data on
`globalThis.__riddleProofEvidence`. Capture scripts can return that object or
write it into a JSON artifact next to screenshots. Good evidence is usually a
mix of:

- The exact route or query params a human reviewer can open
- A readiness selector or explicit ready flag
- Screenshots and JSON artifacts saved by the capture script
- Runtime metrics from `globalThis.__riddleProofEvidence`
- Assertions that explain why the evidence is sufficient

Metrics are guardrails, not a replacement for taste or product judgment. For a
musical sequencer, useful proof might include the selected song and mix, the
transport state, current playhead time, instrument lane readiness, measured
frame drift, console errors, and screenshots of the intended view. The reviewer
still decides whether it sounds good.

### Server Preview Usage

Server preview proof is most useful when the request, capture, and PR comment
all point at the same reproducible page. Prefer exact paths such as:

```text
/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile
```

Use `wait_for_selector` for a stable application-ready signal instead of a fixed
sleep. Save screenshots and structured artifacts from the same capture script
that performs the interaction. If proof is weak, keep the diagnostics history in
the run state so the next agent can see the last route, tool status, artifact
shape, and errors without rerunning blind.

## OpenClaw Adapter Boundary

`@riddledc/riddle-proof/openclaw` translates OpenClaw Riddle Proof tool params
into generic `RiddleProofRunParams`.
It preserves Discord routing metadata as `integration_context` and parses
`assertions_json` into the shared assertions field. Compatibility params such as
`ship_after_verify` and the explicit `leave_draft` escape hatch are preserved so
the underlying runtime can distinguish "do not merge" from "keep this draft."
Generic authenticated proof inputs are preserved as pass-through JSON strings:
`auth_localStorage_json`, `auth_cookies_json`, and `auth_headers_json`. Use
those for public integrations; reserve `use_auth` for a configured, site-specific
auth helper.

The adapter does not invoke another OpenClaw plugin and does not supply a
coding agent. It is the reusable mapping layer a future OpenClaw wrapper can
call before handing the request to its configured implementation, judge, ship,
and notification adapters.
