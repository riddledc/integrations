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

## Durable Loop CLI

The package publishes `riddle-proof-loop` as a host-agnostic runner surface for
Codex/CLI-style testing:

```sh
riddle-proof-loop run --request-json request.json --checkpoint-mode yield
riddle-proof-loop checkpoint --state-path /tmp/riddle-proof-run.json
riddle-proof-loop checkpoint --state-path /tmp/riddle-proof-run.json --format markdown
riddle-proof-loop run --request-json request.json --agent local
riddle-proof-loop status --state-path /tmp/riddle-proof-run.json
riddle-proof-loop respond --state-path /tmp/riddle-proof-run.json --response-json response.json
riddle-proof-loop respond --state-path /tmp/riddle-proof-run.json --decision ready_for_author --summary "Baseline is trustworthy."
riddle-proof-loop doctor local
```

In yield mode, the harness returns portable checkpoint packets for recon,
authoring, implementation, proof assessment, and evidence recovery. A host can
answer those packets with `riddle-proof.checkpoint_response.v1` JSON without
needing OpenClaw-specific proof semantics.

For a sole-agent loop, keep the agent in charge of the checkpoint response:
run until a checkpoint, inspect `riddle-proof-loop checkpoint` for the packet,
act directly when the packet asks for implementation, then respond with either
full `--response-json` or the shorter `--decision` / `--summary` /
`--payload-json` flags. No local executor or OpenClaw surface is required for
that base workflow.

Flag-based `respond` refuses to submit generated placeholder payloads. If the
checkpoint template includes `TODO` fields, provide a real `--payload-json`
file/object before resuming the run.

`--agent local` is the generic CLI executor slot. The current implementation
uses the local Codex CLI adapter underneath, but the loop contract and CLI
surface are intentionally not Codex-specific.

## CI / Profile Mode

Profile mode runs durable proof profiles against an existing site without an
implementation step. Use it for audits, regression checks, CI smoke profiles,
or as a stronger proof base before a change loop.

```json
{
  "version": "riddle-proof.profile.v1",
  "name": "pricing-page-basic",
  "target": {
    "route": "/pricing",
    "viewports": [
      { "name": "mobile", "width": 390, "height": 844 },
      { "name": "desktop", "width": 1440, "height": 1000 }
    ],
    "auth": "none",
    "network_mocks": [
      {
        "label": "plans-api",
        "url": "**/api/plans",
        "method": "GET",
        "status": 200,
        "content_type": "application/json",
        "json": {
          "plans": [{ "name": "Builder", "price": "$20" }]
        }
      }
    ],
    "setup_actions": [
      {
        "type": "clear_storage",
        "storage": "both",
        "reload": true
      },
      {
        "type": "local_storage",
        "key": "demo-auth",
        "json": { "role": "tester" },
        "reload": true
      },
      {
        "type": "fill",
        "selector": "[data-testid='email']",
        "value": "builder@example.com"
      },
      { "type": "click", "selector": "[data-testid='show-plans']" },
      { "type": "wait_for_text", "selector": "body", "text": "Start building" }
    ]
  },
  "checks": [
    { "type": "route_loaded", "expected_path": "/pricing" },
    { "type": "selector_visible", "selector": "[data-testid='pricing-cards']" },
    { "type": "selector_absent", "selector": "[data-testid='loading-spinner']" },
    { "type": "selector_count_equals", "selector": "[data-testid='pricing-card']", "expected_count": 3 },
    { "type": "text_visible", "text": "Start building" },
    { "type": "text_visible", "text": "Compare plans", "viewports": ["desktop"] },
    { "type": "no_mobile_horizontal_overflow" },
    { "type": "no_fatal_console_errors" }
  ],
  "artifacts": ["screenshot", "console", "dom_summary", "proof_json"],
  "failure_policy": {
    "environment_blocked": "neutral",
    "proof_insufficient": "fail",
    "product_regression": "fail"
  }
}
```

Run a profile with the hosted Riddle runner:

```sh
riddle-proof-loop run-profile \
  --profile .riddle-proof/profiles/pricing.json \
  --url https://example.com \
  --runner riddle \
  --output artifacts/riddle-proof/pricing
```

Hosted profile runs emit Riddle poll progress to stderr while waiting. Use
`--quiet` to suppress progress lines, or `--progress-every-ms` to tune the
heartbeat cadence for long route-inventory or workflow profiles.

The package includes a generic starter profile at
`examples/profiles/page-content-basic.json`; copy that shape into a repository
profile directory and replace the selector/text checks with app-specific
invariants.

Checks normally apply to every captured viewport. Add `viewports` (or
`viewport_names`) to a check when responsive UI intentionally exposes an
invariant only on named viewports, such as desktop-only helper copy while phone
layouts keep the same route, link, and overflow contracts.

`target.network_mocks` is optional. The Riddle runner registers these mocks
before navigation, records each hit, and adds an implicit
`network_mocks_succeeded` check when mocks are present. A mock supports
`url`/`glob`/`pattern`, optional `method`, `status`, `content_type`, `headers`,
string `body`, JSON `json` / `body_json`, and `required: false` for
best-effort mocks. Use `responses` for retry or recovery profiles where the
same endpoint should return a sequence, such as first `503` and then `200`.
Each response accepts the same payload fields plus an optional label:

```json
{
  "label": "builder-build",
  "url": "**/api/build",
  "method": "POST",
  "responses": [
    {
      "label": "first-build-fails",
      "status": 503,
      "json": { "error": "Synthetic build outage" }
    },
    {
      "label": "second-build-succeeds",
      "status": 200,
      "json": { "previewUrl": "https://cdn.example/game/index.html" }
    }
  ]
}
```

When `responses` is present, `network_mocks_succeeded` requires each configured
response to be hit at least once by default and records `hit_index`,
`response_index`, and `response_label` for each request. Set
`required_hit_count` / `min_hits` or `required: false` when a different
contract is intentional. Set `repeat_responses: true` when the sequence should
cycle instead of reusing the final response, for example to repeat a fail-then-
success pair across multiple viewports. Repeated sequences also record
`sequence_cycle: true` after the first cycle.

Set `capture_request_body: true` to include compact request-body evidence on
mock hits. Add `request_body_contains` / `request_body_patterns` or
`request_body_not_contains` / `request_body_not_patterns` when the request body
is part of the contract, such as proving that a save request references the
current build ID returned by a prior mocked build response and not a stale one.
Body assertions use the full request body for matching and store only length
plus a compact sample in the proof evidence. For sequenced mocks, the same
request-body fields may also be placed on individual `responses[]` entries when
each step has a different request contract, such as a fail-then-success retry
where the second request must carry newer state.

`target.setup_actions` is optional. Use it when the meaningful proof surface
appears only after a picker, tab, login stub, storage seed, form fill,
transport control, or other bounded interaction. Supported setup actions are
`click`, `fill`, `set_input_value`, `assert_text_visible`,
`assert_text_absent`, `assert_selector_count`, `assert_window_value`,
`local_storage`, `session_storage`, `clear_storage`, `wait`,
`wait_for_selector`, `wait_for_text`, and `window_call`; a failed setup action
is recorded as a failed `setup_actions_succeeded` check so the profile cannot
pass without reaching the intended state. Text-matched `click` actions prefer
visible matching elements, which keeps responsive layouts from selecting hidden
desktop or mobile-only links. Add `force: true` to a click action only when the
matched visible element is intentionally animated or otherwise never becomes
stable enough for Playwright's default click actionability checks. Use setup
assertions when the pre-click or pre-navigation state is part of the contract,
for example a fresh row must be present, stale copy must be absent, exactly one
source link must exist before clicking into the final route, or a canvas app's
proof state must expose a terminal flag. `assert_selector_count` accepts
`expected_count`; `assert_window_value` accepts `path` / `state_path` plus
`expected_value` / `expected` and compares JSON-safe values exactly.
`local_storage` and `session_storage` accept a `key` plus string `value` or
JSON `json` / `value_json`, and can reload the page with `reload: true`.
`clear_storage` clears `local`, `session`, or `both` browser storage scopes,
defaults to `both`, and can also reload with `reload: true`.

`target.timeout_sec` is optional. Use it for known-heavy profile targets so the
profile carries its own hosted Riddle worker budget; an explicit CLI `--timeout`
still overrides the profile value for one-off runs.

Use `allowed_console_patterns` / `allowed_console_texts` on
`no_fatal_console_errors` when a negative-path profile intentionally triggers a
known browser console error, such as a mocked `503` that the app recovers from:

```json
{
  "type": "no_fatal_console_errors",
  "allowed_console_patterns": [
    "Failed to load resource: the server responded with a status of 503",
    "Build failed: Error: Synthetic build outage"
  ]
}
```

Allowed console events and page errors are still counted in check evidence, but
only unallowed `error` / `assert` console events and page errors fail the check.
Use `allowed_page_error_patterns`, `allowed_console_texts`, or
`allowed_page_error_texts` for narrower matching when needed. Console allowlists
match both the console text and the event location URL, which is useful for
expected resource probes where the browser message is generic but the URL is
specific.

Use `selector_absent` when a forbidden element must not render, and
`selector_count_equals` / `selector_count_equal` / `selector_count_eq` when a
profile needs an exact DOM count rather than a lower bound:

```json
[
  { "type": "selector_absent", "selector": ".game-player-root iframe" },
  { "type": "selector_count_equals", "selector": ".pricing-card", "expected_count": 3 }
]
```

These checks are useful for audit/no-diff profiles where the product should
show a fallback state and avoid rendering stale loaders, duplicate rows, or
missing-resource iframes.

Use `selector_text_order` when a table, list, or card group must show visible
items in a specific order after setup actions such as sorting or filtering:

```json
{
  "type": "selector_text_order",
  "selector": ".game-table tbody tr",
  "expected_texts": ["AAA Alpha", "MMM Middle", "ZZZ Omega"]
}
```

The check records the visible text sequence for the selector and passes when
the expected texts appear in that order as a subsequence. This is less brittle
than matching one large body-text regex when only row or card order matters.

Use `frame_text_visible` and `frame_no_horizontal_overflow` for embedded app,
game, or preview surfaces that render inside iframes:

```json
[
  {
    "type": "frame_text_visible",
    "selector": ".game-player-root iframe",
    "text": "Start Game"
  },
  {
    "type": "frame_no_horizontal_overflow",
    "selector": ".game-player-root iframe",
    "max_overflow_px": 1
  }
]
```

Frame checks capture each matching iframe's URL, title, compact text sample,
scroll width, client width, measured horizontal overflow, and top visible
overflow offenders. This keeps embedded-player audits in profile mode instead
of requiring bespoke iframe inspection scripts.

Use the `route_inventory` check for source-page route coverage audits where a
navigation surface must expose a known set of routes and each route must load
both directly and through real link clicks:

```json
{
  "type": "route_inventory",
  "expected_routes": [
    { "name": "Gem Mine", "path": "/games/gem-mine" },
    { "name": "Coin Clicker", "path": "/games/coin-clicker" }
  ],
  "link_selector": "a[href^='/games/']",
  "source_selector": ".game-table",
  "route_path_prefix": "/games/",
  "timeout_ms": 45000
}
```

The check records discovered source links, unique source-link counts, duplicate
source-link counts, missing/unexpected routes, direct route health, real
clickthrough health, wrong-path failures, and stale source-surface failures. It
runs direct/clickthrough sweeps on the first viewport by default and leaves
ordinary profile overflow checks to cover the source page across all configured
viewports. Set `run_all_viewports: true` when desktop and mobile navigation
surfaces both need direct/clickthrough inventory evidence in one profile result.
Set `run_direct_routes: false`, `run_clickthroughs: false`,
`allow_unexpected_routes: true`, `require_unique_routes: false`, or
`save_route_screenshots: true` when a profile needs a narrower or more
artifact-heavy audit. `require_unique_routes: false` is useful when a navigation
surface intentionally links to the same route from multiple cards or anchors,
while still proving the unique expected route set. When `run_all_viewports` and
`save_route_screenshots` are both enabled, route screenshot artifact labels
include the viewport name so desktop and mobile route artifacts remain distinct.

The result uses `riddle-proof.profile-result.v1` and separates product failures
from weak proof and environment blockers:

- `passed`: required evidence exists and checks passed.
- `product_regression`: the app loaded, but an invariant failed.
- `proof_insufficient`: capture did not produce enough evidence to decide.
- `environment_blocked`: browser, network, auth, or runner setup blocked proof.
- `configuration_error`: the profile or runner options are invalid.
- `needs_human_review`: artifacts were collected, but automation cannot safely decide.

`--output` writes `profile-result.json`, `summary.md`, and local copies of the
structured `proof.json`, `console.json`, and `dom-summary.json` when they are
available. Riddle screenshot URLs remain referenced in the result's artifact
list. The profile/result schema is runner-agnostic; Riddle is the first hosted
adapter.

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

## Runtime Scratch Space

The packaged proof-run setup uses isolated git worktrees for before and after
states. By default those worktrees now live under
`/var/tmp/riddle-proof/.riddle-proof-worktrees`, with dependency caches under
the matching disk-backed scratch root. This keeps repeated `node_modules` cache
materialization off tmpfs `/tmp` and away from EFS or other shared workspace
filesystems.

Set `RIDDLE_PROOF_WORKTREE_ROOT` to choose an explicit location. Set
`RIDDLE_PROOF_USE_WORKSPACE_WORKTREE_ROOT=1` to keep the previous behavior of
placing proof worktrees next to the active repository. Set
`RIDDLE_PROOF_SCRATCH_ROOT` to choose the scratch parent, or
`RIDDLE_PROOF_USE_TMP_SCRATCH=1` to force tmp-backed scratch for a short-lived
test.

When local scratch storage is low, setup prunes stale
`riddle-proof-*` worktrees from the scratch root before creating the next run.
This preserves the dependency cache for speed while avoiding old failed runs
filling the scratch disk. Setup also records scratch disk snapshots in the run
state so disk blockers are visible during proof inspection. Set
`RIDDLE_PROOF_KEEP_SCRATCH_WORKTREES=1` to disable that cleanup for debugging,
or tune the low-space threshold with `RIDDLE_PROOF_MIN_SCRATCH_FREE_MB`.

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

### Playable / Game Proof

For games, canvas scenes, and interactive toys, use `verification_mode:
"playable"` or `"gameplay"` when a static screenshot is not enough. The capture
must prove the experience responds over time:

- accepted keyboard, pointer, or touch input
- game state or HUD values changed after input
- elapsed play/animation time progressed
- non-HUD playfield/canvas pixels changed by a measured threshold

Expose that as `window.__riddleProofEvidence.playability` or
`playability_evidence` with `version: "riddle-proof.playability.v1"`. A nice
still frame, including a generated image plate, is supporting evidence only and
does not satisfy playable proof by itself.

### Basic Gameplay Helpers

`@riddledc/riddle-proof/basic-gameplay` exposes reusable proof primitives for
route-by-route game/site suites. The helpers assess the public
`riddle-proof.basic-gameplay.v1` evidence schema, attach Riddle screenshot
artifact hashes back to phase metrics, resolve visual false negatives when
artifact screenshots differ, and convert progression failures into catch
records.

```ts
import {
  assessBasicGameplayEvidence,
  attachBasicGameplayArtifactScreenshotHashes,
  createBasicGameplayCatchRecords,
} from "@riddledc/riddle-proof/basic-gameplay";

attachBasicGameplayArtifactScreenshotHashes(evidence, { artifacts });
const assessment = assessBasicGameplayEvidence(evidence);
const catches = createBasicGameplayCatchRecords(assessment, evidence);
```

The package owns generic contracts such as `state_path`, `state_call`,
`property_path`, `after_cleanup` terminal-before-restart evidence,
`number_unchanged`, held-key, canvas-click,
canvas-pointer-down/move/up, window-call/evaluate action type constants, and
JSON-safe text compaction. Site-specific manifests, selectors, and
deterministic game scripts should stay in the caller.

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

### Riddle Job Polling

`riddle-proof-loop riddle-poll <job-id> --wait` keeps stdout as JSON and writes
human progress lines to stderr while waiting. The JSON result includes
`poll.timed_out`, `poll.elapsed_ms`, `poll.queue_elapsed_ms`, and
`poll.running_without_submission` so delayed dispatch is distinguishable from a
terminal proof failure. If `--wait` exhausts its attempts before a terminal job
status, the command exits non-zero and the result explains the last observed
status and `submitted_at` state.

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
