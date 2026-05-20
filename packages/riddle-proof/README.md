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
CLI-style and sole-agent testing:

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

`--agent local` is the generic CLI executor slot. A host can wire that slot to
Codex, Claude Code, another local CLI, or a managed worker without changing the
checkpoint, evidence, or proof-assessment contract.

Visual/UI proof runs can pass `viewport_matrix` / `viewport_matrix_json` to the
base loop. The runtime records the requested matrix, captures per-viewport
screenshots with viewport-scoped labels, persists the executed/missing viewport
metadata into run status and proof artifacts, and treats missing requested
viewport evidence as incomplete capture evidence.

Measured visual deltas still require numeric before/after evidence. For small
targeted copy or UI changes, the visual gate can use a lower targeted threshold
only when route/text semantics match the requested change. When before/after
image artifacts can be compared directly, the runtime also records the changed
region bounding box and refuses the targeted threshold if that exact region is
too broad for a localized UI change. External visual-delta payloads can provide
that region with common field names such as `changed_region`, `bounds`, `bbox`,
`boundingBox`, `xMin`/`xMax`, or `x1`/`x2`. Missing or unmeasured visual deltas
continue through evidence recovery instead of being treated as a passing proof.

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
    { "type": "selector_text_visible", "selector": "[data-testid='pricing-cards']", "text": "Pro" },
    { "type": "text_visible", "text": "Start building" },
    { "type": "text_visible", "text": "Compare plans", "viewports": ["desktop"] },
    { "type": "no_mobile_horizontal_overflow" },
    { "type": "no_fatal_console_errors" },
    { "type": "no_console_warnings" }
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
Hosted `run-profile` submits package-generated profile scripts with
`strict=false` by default because the generated runner is larger than Riddle's
generic inline-script warning threshold. Use `--strict=true` when you
deliberately want Riddle's non-critical script-safety warnings to block the run.
Critical script-safety violations remain blocked by Riddle either way.

When promoting proof artifacts into a durable public profile, avoid guessing
which backend or runner tokens are preserved inside `proof.json`. Derive the
`body_contains` fragments from the artifact body first:

```sh
riddle-proof-loop profile-body-assertions \
  --artifact artifacts/job_abc123/proof.json.json \
  --candidates-json '["product_regression","completed_timeout","Timed Out","partial results available"]' \
  --required-json '["product_regression"]' \
  --format body-contains
```

The command prints only snippets that are actually present in the artifact.
Missing optional candidates are reported in JSON mode as warnings, while missing
required snippets make the command exit non-zero. This keeps Good Catch and
audit-profile promotions tied to real artifacts instead of hand-authored token
guesses.

Before spending a hosted browser run on a public-promotion profile, preflight
the profile-level `http_status` checks directly:

```sh
riddle-proof-loop profile-http-status-preflight \
  --profile .riddle-proof/profiles/good-catch-promotion.json \
  --url https://preview.riddledc.com/s/ps_12345678/ \
  --format summary
```

The preflight resolves the profile's `http_status` URLs against the same base
URL that `run-profile` would use, then verifies status, content type, byte
requirements, `body_contains`, `body_not_contains`, and `body_not_patterns`.
It exits non-zero if any body assertion is missing or any forbidden body text is
present, which catches raw/escaped proof-artifact mistakes before a full
viewport matrix run.

The package includes generic starter profiles:

- `examples/profiles/page-content-basic.json` for route/content/layout smoke profiles.
- `examples/profiles/route-inventory-basic.json` for source-link and direct-route audits.
- `examples/profiles/handled-recovery-list-load.json` for failed or malformed list-load recovery profiles.
- `examples/profiles/handled-recovery-action-malformed-success.json` for action recovery profiles where the request succeeds at HTTP level but returns an unusable body.
- `examples/profiles/terminal-result-partial-evidence.json` for API-console terminal error or timeout receipts that preserve partial screenshot, console, and HAR evidence.

Copy one of those shapes into a repository profile directory and replace the
routes, selectors, mock URLs, and text checks with app-specific invariants.

For handled recovery profiles, prefer proving the whole boundary instead of
only checking that an error message appears. Mock one dependent endpoint into a
failed HTTP response, transport failure, or malformed body, keep independent
endpoints healthy, and assert that the page still renders the independent
evidence. For idempotent GET mocks, use `required_hit_count` to prove the mock
was exercised, but avoid `max_hit_count` unless exact request count is itself
the product contract; multi-viewport runs, React Strict Mode, retries, and
client refreshes can legitimately call the same GET more than once. Capture a setup
screenshot immediately after the recovery state appears, before high-risk
absence assertions, so failing runs keep durable visual evidence. Then reject
raw backend text and error codes as well as parser text such as `SyntaxError`,
`Expected property name`, and `[object Object]`; reject contradictory empty-state
copy such as `No items yet` when the list failed to load; require the failed
list's explicit unavailable message and error element count; and keep
`no_fatal_console_errors` plus
`no_console_warnings` in the final checks. This pattern catches both visible
recovery-quality bugs and hidden browser-health debt without requiring a
separate CI or wrapper-specific path.

For handled action recovery profiles, assert the action itself as well as the
recovery UI. Capture the request body when the action payload matters, preserve
the surrounding page state, and reject the success modal, toast, or row that
would imply the action completed. A useful malformed-success profile returns a
successful HTTP status with an invalid JSON body, waits for one generic failure
message, captures a recovery screenshot, and keeps parser text plus browser
console/page errors out of the final proof. This catches action paths that look
recovered to a user but still poison the browser evidence stream.

For terminal result profiles, prove status honesty separately from artifact
presence. A page can preserve screenshots, console output, HAR, billing, and raw
response evidence while still lying about the terminal state or omitting that
the evidence is partial. Return a terminal `completed_error` or
`completed_timeout` response with partial evidence, require the visible status
and `partial results available` copy, assert each artifact class, reject Success
and contradictory empty-evidence copy, assert success/error/timeout selector
polarity, and keep `no_horizontal_overflow`, `no_fatal_console_errors`, and
`no_console_warnings` in the same profile.

Checks normally apply to every captured viewport. Add `viewports` (or
`viewport_names`) to a check when responsive UI intentionally exposes an
invariant only on named viewports, such as desktop-only helper copy while phone
layouts keep the same route, link, and overflow contracts.

`target.network_mocks` is optional. The Riddle runner registers these mocks
before navigation, records each hit, and adds an implicit
`network_mocks_succeeded` check when mocks are present. A mock supports
`url`/`glob`/`pattern`, optional `method`, `status`, `content_type`, `headers`,
string `body`, JSON `json` / `body_json`, `abort: true` for fetch-level network
failures, and `required: false` for best-effort mocks. Use `responses` for
retry or recovery profiles where the same endpoint should return a sequence,
such as first `503` and then `200`. Each response accepts the same payload
fields plus an optional label:

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

Use `abort: true` when the product must recover from a transport failure rather
than an HTTP error response. The default Playwright abort code is `failed`; set
`abort_error_code` (or use `abort: "connectionreset"`) for a specific browser
network error:

```json
{
  "label": "api-key-revoke-network-failure",
  "url": "**/billing/api-keys/key_123",
  "method": "DELETE",
  "abort": true,
  "abort_error_code": "failed"
}
```

Aborted mocks count as intentional mock hits. Matching browser
`Failed to load resource` console entries for the mocked URL are allowed by
`no_fatal_console_errors`; app-level `console.error(...)` calls still fail unless
explicitly allowlisted.

When `responses` is present, `network_mocks_succeeded` requires each configured
response to be hit at least once by default and records `hit_index`,
`response_index`, and `response_label` for each request. Set
`required_hit_count` / `min_hits` or `required: false` when a different
contract is intentional. Set `repeat_responses: true` when the sequence should
cycle instead of reusing the final response, for example to repeat a fail-then-
success pair across multiple viewports. Repeated sequences also record
`sequence_cycle: true` after the first cycle.

For full viewport-matrix retry profiles, set `sequence_scope: "viewport"` when
each viewport should get its own first response, second response, and so on.
This keeps a fail-then-success retry sequence from being consumed by the first
viewport before phone or tablet runs begin. The mock evidence records both the
global `hit_index` and viewport-local `sequence_hit_index`, plus the active
`viewport`, so a run can show that each viewport exercised the same sequence.
Use `required_hit_count` when the total expected calls matter, such as
`responses.length * viewports.length` for a two-step retry across four
viewports.

Use `max_hit_count` / `max_hits` when a profile needs to prove a request does
not run too many times. Use `forbidden: true` as shorthand for
`max_hit_count: 0` and `required: false`, for example when a chat failure must
not trigger a downstream build:

```json
{
  "label": "builder-build-should-not-run",
  "url": "**/api/build",
  "method": "POST",
  "forbidden": true,
  "json": { "previewUrl": "https://cdn.example/should-not-run/index.html" }
}
```

The implicit `network_mocks_succeeded` check records `max_hits_by_label` and
fails with `forbidden_mock_hit` or `mock_hit_count_exceeded` when a cap is
exceeded.

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

When `responses[]` entries include request-body predicates, the runner selects
the first response whose request-body contract matches the actual request before
falling back to sequence order. This keeps repeated multi-viewport profiles from
misrouting interleaved requests while preserving sequence behavior for response
lists that do not declare body-specific contracts. The proof evidence records
`response_selection: "request_body"` and the original `sequence_response_index`
when body matching overrides sequence order.

`target.setup_actions` is optional. Use it when the meaningful proof surface
appears only after a picker, tab, login stub, storage seed, form fill,
transport control, or other bounded interaction. Supported setup actions are
`click`, `tap`, `drag`, `press`, `fill`, `set_input_value`, `set_range_value`,
`deterministic_runtime`, `canvas_signature`, `assert_text_visible`, `assert_text_absent`,
`assert_selector_count`, `assert_window_value`, `assert_window_number`,
`local_storage`, `session_storage`, `clear_storage`, `clear_console`,
`screenshot`, `wait`, `wait_for_selector`, `wait_for_text`, `window_eval`,
`window_call`, and `window_call_until`;
a failed setup action is recorded as a failed `setup_actions_succeeded` check so
the profile cannot pass without reaching the intended state. Text-matched `click` actions prefer
visible matching elements, which keeps responsive layouts from selecting hidden
desktop or mobile-only links. Add `force: true` to a click action only when the
matched visible element is intentionally animated or otherwise never becomes
stable enough for Playwright's default click actionability checks. Use `press`
with a Playwright key name, such as `Enter`, `Space`, or `ArrowLeft`,
when a route's intended browser control is keyboard-driven; omit `selector` for
a page-level key press, or provide `selector` to press against a focused element.
Use `click_count` / `clickCount` / `clicks` from 1 to 10 on a single `click`
action for atomic double-click or double-submit contracts where modeling the
interaction as repeated setup actions would incorrectly require the target to
remain in the DOM after the first click.
Use `tap` for touch-first controls, especially canvas regions where a mobile
tap should produce trusted touch events and the browser's synthesized click.
It requires `selector`, defaults to a touch tap at the target center, and
accepts `x` / `y` or `from_x` / `from_y` plus `coordinate_mode: "ratio"` for
element-relative coordinates. Set `pointer_type` to `mouse`, `touch`, or `pen`
when the proof must distinguish input modality.
Use `set_range_value` for HTML range inputs and React-controlled sliders. It
accepts aliases such as `set-slider-value`, requires `selector` plus `value`,
uses the native input value setter, dispatches bubbling `input` and `change`
events, and records the requested value plus the browser's actual normalized
value, numeric value, `min`, `max`, and `step`. The action is intentionally
strict: if the target is not an `input[type="range"]`, setup fails with
`not_range_input` instead of silently treating the control like a text field.
Use `deterministic_runtime` when randomized or clock-driven gameplay needs a
stable proof path. It can install a deterministic `Math.random` queue with
`random_queue` / `randomValues`, pin `Date.now()` with `now` / `mockNow`,
advance the pinned clock with `advance_ms`, append more random values with
`append: true`, and restore browser originals with `restore: true`. Receipts
record whether random and clock mocks are active, queue length, clock time, and
random-queue underflows. Values in `random_queue` must be finite numbers from
`0` inclusive to `1` exclusive.
Use `canvas_signature` for canvas-only proof surfaces. It requires `selector`,
reads the selected canvas with `toDataURL("image/png")`, records a sampled hash,
canvas dimensions, CSS dimensions, and data length, and can store the result
with `store_return_to` or `store_signature_to`. Add `compare_to` plus
`expect_changed: true` to assert that the current canvas signature differs from
a previously stored signature, for example menu -> active play or terminal ->
restart.
Use `drag` for pointer-driven controls such as canvas launch areas, sliders, or
drag-to-aim games. Provide `selector`, `from_x`, `from_y`, `to_x`, and `to_y`;
coordinates are element-relative pixels by default. Set `coordinate_mode:
"ratio"` to make coordinates relative to the target element size, for example
`from_x: 0.5, from_y: 0.5, to_x: 0.2, to_y: 0.5`. Optional `steps` and
`duration_ms` control how gradually the pointer moves before release.
Use setup assertions when the pre-click or pre-navigation state is part of the contract,
for example a fresh row must be present, stale copy must be absent, exactly one
source link must exist before clicking into the final route, or a canvas app's
proof state must expose a terminal flag. `assert_selector_count` accepts
`expected_count`; `assert_text_visible` and `assert_text_absent` prefer rendered
selector text (`innerText`) so casing from CSS `text-transform` matches
`selector_text_visible`, with a `textContent` fallback for non-HTML elements.
Literal setup text matching also checks a whitespace-normalized form, so visible
phrases split across rendered line breaks can still satisfy the assertion.
`assert_window_value` accepts `path` / `state_path` plus
`expected_value` / `expected` and compares JSON-safe values exactly.
`assert_window_number` accepts `path` / `state_path` plus `expected_value`,
`min_value`, or `max_value`, and is useful for canvas-only proof state such as
distance, elapsed time, score, or retry counters.
`local_storage` and `session_storage` accept a `key` plus string `value` or
JSON `json` / `value_json`, and can reload the page with `reload: true`.
`clear_storage` clears `local`, `session`, or `both` browser storage scopes,
defaults to `both`, and can also reload with `reload: true`. Use
`clear_console` after setup reaches the intended proof state when expected
bootstrap console or page errors should not count against the final
`no_fatal_console_errors` invariant. It clears recorded console events and page
errors, but keeps network mock hit evidence intact. Any setup action can include
`repeat` / `repeat_count` / `times` from 1 to 100; each repetition is recorded
with `repeat_index` and `repeat_count`, and `after_ms` runs after each
repetition. Use it for bounded game proof helpers, retry controls, or other
workflows where one declarative action needs to advance the app several times.
Use `window_eval` for async browser-side helper code that is easier to express
as a short script body than as a preexisting `window` function. It accepts
`script` plus optional JSON `args`, can compare `expect_return`, can store the
JSON-safe return value with `store_return_to`, and honors `capture_return:
false` for compact receipts. The script runs as an async function body with
`args` available in scope, so `return { ok: true }` records a structured return.
Use `window_call_until` when a proof helper needs to advance randomized or
progressive state until a window-state receipt is true. It accepts `path` plus
optional `args`, `until_path`, `until_expected_value`, `max_calls` from 1 to
100, and optional `interval_ms`; the action stops early when the predicate is
met and records `call_count`, final `returned`, and final `until_value`.
Use `screenshot` with an optional `label` to capture durable Riddle screenshots
at important setup milestones, such as after a route switch, terminal state, or
reset. These labels are recorded in setup evidence and included in profile
artifact summaries alongside final viewport screenshots. Setup screenshots are
full-page by default; set `full_page: false`, `fullPage: false`, or
`mode: "viewport"` when fixed or sticky page chrome would make full-page
captures harder to review.
Add `frame_selector` / `frameSelector` to a setup action when the interaction
target lives inside an embedded iframe, such as a community game player or
hosted preview surface. Selector-based actions, storage actions, window calls,
and setup assertions then execute in that frame context and record
`frame_selector`, `frame_index`, and `frame_count` in setup-action evidence.
Use `frame_index` / `frameIndex` when more than one matching iframe is present;
it defaults to the first frame.

Profiles with setup actions also include a compact
`setup_actions_succeeded.evidence.setup_summary`. The summary groups each
viewport's final route, final URL, action counts, clicked targets, iframe URLs,
setup screenshots, compact text samples, and failures so setup-heavy clickthrough or iframe proofs
can be reviewed without reading every raw setup-action result. Long click
sequences include `clicked_total` and `clicked_truncated`; the compact `clicked`
list keeps the first and last clicked targets so later route switches and reset
actions stay visible. Click actions with `click_count` greater than `1` are
included in clicked-target evidence and rolled up as `click_count_action_total`
and `click_count_value_total`. Repeated selector runs such as long gameplay
button loops are also grouped as compact `same-selector` click-sequence
receipts with click totals and ordinals. Setup receipt sampling favors both
first and last per-viewport receipts before filling remaining space, so late
lifecycle phases such as terminal or restart remain visible in compact
summaries.

`target.timeout_sec` is optional. Use it for known-heavy profile targets so the
profile carries its own hosted Riddle worker budget; an explicit CLI `--timeout`
still overrides the profile value for one-off runs.

Profile final viewport screenshots are full-page by default. Set
`target.screenshot_full_page: false`, `target.screenshotFullPage: false`, or
`target.screenshot_mode: "viewport"` when the automatic final screenshots
should capture only the current viewport, for example when fixed or sticky
headers make full-page captures misleading. Compact profile summaries include
the final screenshot count and mode when a profile sets an explicit target
screenshot mode.

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

Use `no_console_warnings` when warning hygiene is part of the contract, such as
a docs or evidence page that should not accumulate preload or image warnings.
It supports the same `allowed_console_patterns` and `allowed_console_texts`
fields, but only unallowed `warning` console events fail the check.

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

Use `dialog_count_equals`, `dialog_accept_count_equals`, and
`dialog_dismiss_count_equals` when destructive-action profiles need to prove
browser confirm/prompt handling directly. The counts come from the captured
dialog summary and use `expected_count`:

```json
[
  { "type": "dialog_count_equals", "expected_count": 2 },
  { "type": "dialog_accept_count_equals", "expected_count": 1 },
  { "type": "dialog_dismiss_count_equals", "expected_count": 1 }
]
```

Use `url_search_param_equals` and `url_search_param_absent` when the final URL
is part of the contract, such as deep-link recovery that must drop a stale
local identifier while preserving shareable query state:

```json
[
  { "type": "url_search_param_absent", "param": "seq" },
  { "type": "url_search_param_equals", "param": "song", "expected_value": "monkberry-moon-delight-tab" },
  { "type": "url_search_param_equals", "param": "view", "expected_value": "trainer" }
]
```

The check uses the captured browser URL for each viewport after setup actions
and waits have completed. `search_param` and `key` are accepted as aliases for
`param`; `value` is accepted as an alias for `expected_value`.

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

Use `selector_text_visible` and `selector_text_absent` when the durable
assertion belongs to one panel, code sample, result area, or card group rather
than the whole page:

```json
{
  "type": "selector_text_visible",
  "selector": ".result-state",
  "text": "\"sync\": false"
}
```

The check records visible text for the selector in each viewport and reports
matched counts plus short samples, which makes generated-command and evidence
card audits easier to diagnose than global `text_visible` checks.

Use `observe_within` when the proof needs to catch a short-lived user-visible
state after setup actions, such as a combo badge, damage flash, transient
particle count, toast, or canvas-adjacent HUD update:

```json
{
  "type": "observe_within",
  "selector": ".result-state",
  "pattern": "Photon.*active",
  "timeout_ms": 1500
}
```

With `selector` plus `text` or `pattern`, the runner polls visible selector
text until it matches. With only `selector`, it polls for a visible matching
element. With only `text` or `pattern`, it polls the rendered page body. The
proof evidence records per-viewport match status, elapsed time, attempts,
selector counts when applicable, and a compact sample. `within_ms` is accepted
as an alias for `timeout_ms`; the default timeout is `2000`.

Use `http_status` when the contract belongs to the fetched response itself:
status code, content type, byte size, or raw body fragments from a markdown,
JSON, YAML, robots, sitemap, or other machine-readable endpoint:

```json
{
  "type": "http_status",
  "label": "agent markdown",
  "url": "https://example.com/docs/markdown.md",
  "expected_status": 200,
  "allowed_content_types": ["text/markdown"],
  "min_bytes": 1000,
  "body_contains": ["# API Documentation"]
}
```

For JSON responses, prefer `body_json_assertions` when the durable contract is
a field value rather than a raw substring:

```json
{
  "type": "http_status",
  "label": "proof artifact",
  "url": "/proof/good-catches/artifacts/job_1234/proof.json.json",
  "expected_status": 200,
  "allowed_content_types": ["application/json"],
  "body_json_assertions": [
    { "path": "status", "equals": "passed" },
    { "path": "checks[0].status", "equals": "passed" },
    { "path": "environment_blocker", "exists": false }
  ]
}
```

JSON paths support dot keys and array indexes such as `checks[0].status`, with
`$` as the root. Each assertion supports `exists`, `equals`, `not_equals`,
`contains`, and `type`. Scalar observations are recorded inline; arrays and
objects are summarized with length or key counts plus a small sample so large
proof artifacts do not get duplicated into the assertion evidence.

`body_contains`, `body_patterns`, `body_not_contains`, and
`body_not_patterns` match the raw HTTP response body, not rendered browser
text. Use `text_visible` or `selector_text_visible` when CSS transforms,
hydration, client rendering, hidden elements, or layout-specific copy should be
judged exactly as the browser exposes it to users.
Hosted `summary.md` includes `http_status` body and JSON assertion pass counts
so a reviewer can see raw response proof coverage without opening `proof.json`.

When the profile target is a mounted Riddle static Preview such as
`https://preview.riddledc.com/s/ps_1234abcd/docs/`, root-relative
`http_status` URLs preserve that mount. A check for
`/docs/markdown.md` probes
`https://preview.riddledc.com/s/ps_1234abcd/docs/markdown.md`, matching the
Preview artifact instead of escaping to the Preview origin root.

Use `frame_text_visible` and `frame_no_horizontal_overflow` for embedded app,
game, or preview surfaces that render inside iframes:

```json
[
  {
    "type": "frame_url_matches",
    "selector": ".game-player-root iframe",
    "pattern": "/saved/hot-path-.+/index\\.html$"
  },
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

Use `frame_url_equals` when the iframe must resolve to one exact embedded
resource, or `frame_url_matches` when a preview/job/saved-game URL has a stable
shape but a generated ID. URL checks fail when the frame is missing, just like
frame text and overflow checks.

Frame checks capture each matching iframe's URL, title, compact text sample,
scroll width, client width, measured horizontal overflow, and top visible
overflow offenders. This keeps embedded-player audits in profile mode instead
of requiring bespoke iframe inspection scripts.

Use `link_status` for public link or asset audits where selected `href` / `src`
URLs must still resolve. This is useful for Good Catch pages, documentation
indexes, saved-game galleries, and other public proof surfaces where stale
artifact links should fail the profile:

```json
{
  "type": "link_status",
  "selector": "a[href*='/artifacts/'], img[src*='/artifacts/']",
  "expected_count": 88,
  "same_origin_only": true,
  "require_nonzero_bytes": true,
  "min_bytes": 32,
  "allowed_content_types": ["image/*", "application/json"],
  "max_links": 150
}
```

The check defaults to `a[href]`, deduplicates URLs, probes up to 100 selected
URLs, and treats HTTP `2xx` / `3xx` responses as healthy. `expected_count` and
`min_count` apply to the probed URL set after same-origin filtering, URL
deduplication, and the `max_links` limit. The run summary also reports
`discovered_count` when it differs, which helps explain cases where a page has
two DOM nodes pointing at the same artifact URL. Use `dedupe: false` when the
contract should count duplicate DOM candidates instead of unique artifact URLs.
Use `allowed_statuses` or `expected_status` when a narrower status contract is
intentional, `min_count` for lower-bound audits, `min_bytes` when a one-byte
range response is too weak, `allowed_content_types` for MIME checks, and
`max_links` when the selected set is intentionally larger than 100.
`allowed_content_types` accepts exact types and family wildcards such as
`image/*`. `artifact_link_status` is an alias with the same behavior for
profiles that want artifact-specific wording.

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
list. When setup actions or network mocks are present, `summary.md` includes
compact setup and network mock sections so reviewers can see action counts,
setup screenshots, hit counts, required hits, max-hit caps, and failed mocks
without opening the full JSON artifact. The profile/result schema is
runner-agnostic; Riddle is the first hosted adapter.

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
`poll.timed_out`, `poll.elapsed_ms`, `poll.queue_elapsed_ms`,
`poll.pre_submission_elapsed_ms`, and `poll.running_without_submission` so
delayed dispatch is distinguishable from a terminal proof failure.
`queue_elapsed_ms` reflects Riddle's `created_at` to `submitted_at` timestamps;
`pre_submission_elapsed_ms` preserves how long the CLI actually observed the
job before `submitted_at` appeared. If `--wait` exhausts its attempts before a
terminal job status, the command exits non-zero and the result explains the
last observed status and `submitted_at` state.

## Base vs OpenClaw Wrapper Boundary

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

Keep behavior in base `@riddledc/riddle-proof` when it changes the portable run
contract or evidence semantics:

- checkpoint packets and responses
- profile, audit/no-diff, and proof-of-change run modes
- viewport matrices and per-viewport artifact metadata
- visual-delta thresholds, changed-region evidence, and evidence recovery gates
- run state, run cards, result objects, proof sessions, and evidence bundles
- generic auth/header/local storage inputs

Keep behavior in the OpenClaw wrapper when it only concerns OpenClaw hosting or
presentation:

- OpenClaw tool registration and schema wording
- Discord thread/status formatting
- OpenClaw workflow labels such as interactive, background PR, and continuous
- PR handoff/status phrasing such as `ship_mode=none`
- checkpoint packet display and review UX
- configured site-specific auth helpers
- wrapper deployment, hot reload, and notification adapters

The adapter does not invoke another OpenClaw plugin and does not supply a
coding agent. It is the reusable mapping layer a future OpenClaw wrapper can
call before handing the request to its configured implementation, judge, ship,
and notification adapters.
