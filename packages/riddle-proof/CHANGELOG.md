# @riddledc/riddle-proof

## 0.7.182

### Patch Changes

- b72eb9f: Add `key_down` and `key_up` setup actions so gameplay profiles can hold a real key across separate wait, animation-frame, and evidence actions.

## 0.7.181

### Patch Changes

- fdf913e: Add held-key support for profile `press` setup actions via `hold_ms` / `holdMs` so browser games that read key-down state can be proven with real keyboard input.
- Surface allowed console-warning totals and allowlist counts in profile summary markdown.
- Surface intercepted-click obstruction receipts in profile setup summary markdown.
- Add compact natural-input measured-change rollups to profile setup summary markdown.

## 0.7.180

### Patch Changes

- 69117ca: Add `run-profile --result-format json|summary|none` so hosted profile runs can keep full JSON stdout for automation while agent loops can print a compact summary or suppress stdout when artifacts are already written.

## 0.7.179

### Patch Changes

- 34b2d18: Add a gameplay `window_call_until` profile example for waiting on runtime state contracts instead of fixed sleeps.

## 0.7.178

### Patch Changes

- 6edd05a: Render compact press key sequences in profile setup summary markdown.

## 0.7.177

### Patch Changes

- 23cb883: Include sampled press key receipts in hosted profile setup summaries.

## 0.7.176

### Patch Changes

- 5888b9b: Clarify route_loaded failures when the URL path matches but route readiness fails, and include route errors in check evidence.

## 0.7.175

### Patch Changes

- 8e48330: Include tap setup action receipts in hosted Riddle runner setup summaries so CLI markdown can show tap totals and per-viewport tap evidence.

## 0.7.174

### Patch Changes

- 6c5c5fa: Add a first-class `tap` setup action for profile-mode proofs, including touch/pen/mouse dispatch, coordinate-mode support, summary receipts, and README guidance.

## 0.7.173

### Patch Changes

- 073e43b: Warn when canvas signature hashes repeat across some labeled captures, even if
  other captures for the same selector produce different hashes.

## 0.7.172

### Patch Changes

- c501a83: Add deterministic runtime setup actions for seeded random queues and controllable clocks.

## 0.7.171

### Patch Changes

- 52aa3f2: Resolve array `length` and dot-index paths in compact setup return summaries.

## 0.7.170

### Patch Changes

- 562d948: Preserve non-passed child statuses in split-viewport profile aggregates and skip mobile-only overflow checks when a child run has no mobile viewport evidence.

## 0.7.169

### Patch Changes

- 4a39219: Group repeated same-selector setup clicks in compact profile summaries.

## 0.7.168

### Patch Changes

- ed8f721: Add compact click-sequence receipts to profile setup summaries for repeated `:nth-child(...)` click series, and render them in generated CLI summaries.

## 0.7.167

### Patch Changes

- 427d07e: Ignore setup actions scoped only to non-captured viewports when assessing profile runs, so viewport-filtered proof jobs do not fail on intentionally omitted viewport-specific actions.

## 0.7.166

### Patch Changes

- d8da9e3: Add coordinate-specific setup click support for Riddle Proof profiles.

## 0.7.165

### Patch Changes

- 5d1dfa0: Surface drag setup-action receipts in profile setup summaries, including pointer type and browser input-dispatch evidence.

## 0.7.164

### Patch Changes

- 4a97f4e: Include canvas signature stable-hash diagnostics in hosted generated profile results, not only local aggregate summaries.

## 0.7.163

### Patch Changes

- c18711e: Add canvas signature stability diagnostics to profile setup summaries so repeated labeled captures with the same canvas hash are surfaced as non-failing warnings.

## 0.7.162

### Patch Changes

- 0ddd0a3: Dispatch touch and pen drag setup actions through browser input protocol events so pointer-capture apps do not throw page errors and hosted Riddle script validation does not reject the generated profile.

## 0.7.161

### Patch Changes

- d6027ca: Prevent synthetic touch and pen drag setup actions from tripping app `setPointerCapture` handlers by shimming pointer capture for the dispatched pointer id during the drag.

## 0.7.160

### Patch Changes

- 9df9465: Add a `canvas_signature` profile setup action for canvas-only proof surfaces and
  prefer both first and last per-viewport setup receipts in compact summaries so
  late lifecycle phases remain visible.

## 0.7.159

### Patch Changes

- 9af97ae: Make `selector_text_visible` require visible selector text instead of passing on hidden or offscreen selector text captured in fallback match samples.

## 0.7.158

### Patch Changes

- 95e733e: Filter viewport-scoped checks and setup actions out of non-matching split-viewport child runs so child artifacts do not report false product regressions for checks assigned to another viewport.

## 0.7.157

### Patch Changes

- ed35636: Recover hosted profile results from artifacts before retrying or blocking a queued job as stale.

## 0.7.156

### Patch Changes

- 797b08e: Retry unsubmitted hosted profile jobs twice by default, improving recovery when
  two returned Riddle job ids fail to materialize before a replacement succeeds.

## 0.7.155

### Patch Changes

- bb3819a: Balance setup receipt detail sampling across viewports in profile summaries so
  large matrix runs do not omit later viewport receipts before showing early
  viewport details.

## 0.7.154

### Patch Changes

- 0f060c6: Add setup return summary fields so `window_call` and `window_eval` profile
  actions can promote selected returned JSON paths into compact `summary.md`
  receipts.

## 0.7.153

### Patch Changes

- 0a8b744: Retry hosted profile jobs once when a queued job never materializes with creation or submission timestamps.

## 0.7.152

### Patch Changes

- 6b0eb1b: Render compact observe_within timing and sample receipts in profile summary markdown.

## 0.7.151

### Patch Changes

- 9172b64: Recover hosted profile evidence from the artifacts endpoint when status polling times out non-terminal.

## 0.7.150

### Patch Changes

- 7834c30: Add an `observe_within` profile check for transient UI evidence.

## 0.7.149

### Patch Changes

- a6b56da: Show compact `set_range_value` setup-action receipts in profile `summary.md` output.

## 0.7.148

### Patch Changes

- 3a1ec50: Add a first-class `set_range_value` profile setup action for HTML range inputs and React-controlled sliders.

## 0.7.147

### Patch Changes

- 5dcbfee: Expose observed pre-submission wait time in Riddle polling metadata and profile summaries so delayed dispatch remains visible after `submitted_at` appears.

## 0.7.146

### Patch Changes

- 4be2750: Add `run-profile --split-viewports` so multi-viewport profiles can run as one bounded Riddle job per viewport and aggregate the evidence into the original profile result.

## 0.7.145

### Patch Changes

- 6140b0e: Report route-inventory source scope and selector candidate counts in profile evidence and summaries.

## 0.7.144

### Patch Changes

- 57617f3: Surface expected route names and paths in route-inventory profile summaries.

## 0.7.143

### Patch Changes

- 5f079b6: Include Riddle poll timing metadata in profile results and summary markdown so queued hosted proof runs preserve their queue and elapsed-time evidence.

## 0.7.142

### Patch Changes

- f756e21: Avoid emitting a literal Function constructor in generated window_eval runner scripts so Riddle API validation can accept first-class evaluated profile actions.

## 0.7.141

### Patch Changes

- ad73e3a: Add `window_eval` profile setup actions for async browser-side helper scripts with JSON-safe stored-return receipts.

## 0.7.140

### Patch Changes

- 3396403: Surface explicit final screenshot mode in profile setup summaries so viewport/full-page artifact intent is visible without opening raw proof JSON or checking PNG dimensions.

## 0.7.139

### Patch Changes

- 556ccce: Allow profile targets to request viewport-only final screenshots with `screenshot_full_page: false`, `screenshotFullPage: false`, or `screenshot_mode: "viewport"` so automatic per-viewport artifacts can avoid fixed-header full-page capture artifacts.

## 0.7.138

### Patch Changes

- 5cf45b9: Allow profile setup screenshot actions to request viewport-only captures with `full_page: false`, `fullPage: false`, or `mode: "viewport"` so fixed and sticky page chrome does not pollute full-page milestone screenshots.

## 0.7.137

### Patch Changes

- d376d4d: Surface compact `window_call` setup receipts in profile setup summaries, including stored-return and return-capture counts.

## 0.7.136

### Patch Changes

- b81f51e: Allow profile `window_call` and `window_call_until` setup actions to store returned values into a browser state path with `store_return_to`/`storeReturnTo`, so follow-up setup assertions can inspect semantic helper results without eval-style profile scripts. Large helper returns can also set `capture_return: false` to keep setup evidence compact while preserving the stored browser value for assertions.

## 0.7.135

### Patch Changes

- c8bee1a: Include `window_call_until` receipts in hosted browser-generated profile summaries.

## 0.7.134

### Patch Changes

- 7b29b86: Surface `window_call_until` call-count receipts in profile setup summaries.

## 0.7.133

### Patch Changes

- 590c4d3: Add `window_call_until` setup actions for bounded window-helper calls that stop once a window-state predicate is met.

## 0.7.132

### Patch Changes

- 956aca8: Surface setup action case-insensitive text receipts in compact setup summaries and profile summary markdown.

## 0.7.131

### Patch Changes

- e3a48b8: Add case-insensitive candidate samples to failed text assertions and setup text actions so CSS-rendered casing mismatches are easier to diagnose without changing pass/fail semantics.

## 0.7.130

### Patch Changes

- 1322c1f: Add `pointer_type` support to drag setup actions so profile authors can dispatch touch or pen pointer drags when proving touch-specific interaction paths.

## 0.7.129

### Patch Changes

- 5322a0c: Include per-viewport text samples when whole-page text profile checks fail, so broad `text_visible` and `text_absent` assertions show the body text that made the check fail.

## 0.7.128

### Patch Changes

- e566eca: Compact large array and object observations in HTTP JSON assertion evidence.

## 0.7.127

### Patch Changes

- 502a53b: Add structured JSON body assertions to `http_status` profile checks.

## 0.7.126

### Patch Changes

- f9755c7: Add viewport-scoped network mock response sequences for profile-mode retry proofs.

## 0.7.125

### Patch Changes

- b3a19ea: Infer hosted `http_status` body assertion counts from per-viewport evidence maps when top-level assertion arrays are absent.

## 0.7.124

### Patch Changes

- ff5c461: Show `http_status` body assertion pass counts in hosted profile summary markdown.

## 0.7.123

### Patch Changes

- 2924570: Add profile-level `http_status` preflight validation so promotion and audit profiles can verify status/body assertions before a hosted browser run.

## 0.7.122

### Patch Changes

- 5ad75af: Add terminal-result partial-evidence starter profile for API-console error and timeout receipt proofs.

## 0.7.121

### Patch Changes

- b0e0565: Add profile-body-assertions helper for deriving artifact body_contains fragments from actual proof artifacts.

## 0.7.120

### Patch Changes

- 045542a: Strengthen the handled list-load recovery example and docs around failed HTTP loads, explicit unavailable states, raw backend text absence, and avoiding brittle max-hit caps on idempotent GET mocks.

## 0.7.119

### Patch Changes

- 364800c: Add profile network mock abort support for transport-failure recovery proofs.

## 0.7.118

### Patch Changes

- 878f937: Add a reusable handled action recovery profile example and README guidance for malformed success responses that must recover visibly without leaking parser or browser-console debt.

## 0.7.117

### Patch Changes

- c9b9197: Add a reusable handled list-load recovery profile example and README guidance for parser-clean, browser-clean recovery proofs.

## 0.7.116

### Patch Changes

- 4fabf91: Clarify hosted profile strict-mode blocks for endpoint and artifact-link probes.

## 0.7.115

### Patch Changes

- 37b8677: Add profile checks for total, accepted, and dismissed browser dialog counts so destructive-action proofs can assert dialog handling directly.

## 0.7.114

### Patch Changes

- 7d17d61: Recover Riddle Preview deploys when publish returns a transient server error after the preview has already reached ready.

## 0.7.113

### Patch Changes

- dbd1d27: Treat common YAML content-type aliases as compatible in profile response checks.

## 0.7.112

### Patch Changes

- d434a44: Add nonblocking profile warnings for overlapping network-mock response request-body selectors that can shadow later responses.

## 0.7.111

### Patch Changes

- ddf0506: Report the actual unallowed fatal-console count in profile summary markdown instead of a static zero.

## 0.7.110

### Patch Changes

- daee70f: Select sequenced network mock responses by request-body contract before falling back to hit order.

## 0.7.109

### Patch Changes

- ac275d8: Clarify profile `link_status` summaries by labeling `expected_count` as probed links and reporting discovered candidates when URL dedupe or limits reduce the probed set.

## 0.7.108

### Patch Changes

- 02af40a: Add a Profile Mode `no_console_warnings` contract with console warning allowlists.

## 0.7.107

### Patch Changes

- be452d5: Include selector text candidates in failed selector-text profile evidence so receipt samples explain mismatches such as rendered case changes.

## 0.7.106

### Patch Changes

- 9c77e33: Normalize whitespace for setup text assertions so rendered line breaks do not prevent visible phrase matches.

## 0.7.105

### Patch Changes

- da95ebd: Align setup text assertions with final selector text checks by preferring rendered `innerText` before falling back to `textContent`.

## 0.7.104

### Patch Changes

- 4f557f8: Preserve mounted static Preview paths for root-relative profile `http_status` checks.

## 0.7.103

### Patch Changes

- 5db9782: Clarify that profile `http_status` body assertions match raw HTTP response bodies while `text_visible` and `selector_text_visible` check rendered browser text.

## 0.7.102

### Patch Changes

- 2372a74: Clarify in CLI help that hosted `run-profile` defaults to `strict=false`.

## 0.7.101

### Patch Changes

- 5e1793b: Surface `http_status` forbidden body matches in generated proof summaries.

## 0.7.100

### Patch Changes

- e3cb0b5: Add `body_not_contains` and `body_not_patterns` assertions for profile `http_status` checks.

## 0.7.99

### Patch Changes

- fe5845b: Add `body_contains` assertions to profile `http_status` checks so API profiles can verify response body content alongside status, content type, and byte evidence.

## 0.7.98

### Patch Changes

- def63a6: Add a profile `http_status` check for direct endpoint/API probes with method, headers, body, status, content-type, and byte evidence.

## 0.7.97

### Patch Changes

- d889882: Clarify profile summary wording for selector text absence checks.

## 0.7.96

### Patch Changes

- d1eb59e: Compact high-volume link status proof artifacts while preserving counts and failure details.

## 0.7.95

### Patch Changes

- deb3a5c: Add `min_bytes` and `allowed_content_types` to profile `link_status` and `artifact_link_status` checks so artifact audits can prove response size and MIME type, not only nonzero link reachability.

## 0.7.94

### Patch Changes

- 67a5afe: Add profile `selector_text_visible` and `selector_text_absent` checks for selector-scoped durable text assertions.

## 0.7.93

### Patch Changes

- 4ffa690: Wait for expected route-inventory source links before clickthrough checks so dynamic navigation surfaces can finish rendering after returning to the source route.

## 0.7.92

### Patch Changes

- e5c1fa7: Expose `riddle-preview-deploy --framework spa|static` and a `deployPreview` client helper so SPA deep-link previews can use `pv_` fallback routing from the packaged CLI.

## 0.7.91

### Patch Changes

- 8f4e384: Make profile waits use any visible matching selector and skip capture work for viewport-scoped checks on non-matching viewports.

## 0.7.90

### Patch Changes

- e44c2d7: Add profile-mode link status checks for public link and artifact URL audits.

## 0.7.89

### Patch Changes

- 3cdd49d: Broaden visual-delta changed-region parsing so common visual-diff bounding-box field names can drive targeted visual thresholds.

## 0.7.88

### Patch Changes

- ac77674: Print concise run-profile environment-blocker diagnostics to stderr so neutral blocked runs still show actionable status without opening saved artifacts.

## 0.7.87

### Patch Changes

- 02e88c9: Expose structured environment blocker details for profile runner failures, including Riddle API balance errors in profile JSON and summary output.

## 0.7.86

### Patch Changes

- 97b4372: Add `run-profile --output-dir` as an alias for `--output` so profile artifacts are saved when users reach for the more explicit flag name.

## 0.7.85

### Patch Changes

- fbb4ad4: Allow profile setup actions to be marked optional so conditional recovery clicks can be attempted without failing setup when the page has already recovered.

## 0.7.84

### Patch Changes

- 75042f8: Allow profile setup actions to be scoped to specific viewport names, and judge setup success against the actions applicable to each viewport.

## 0.7.83

### Patch Changes

- 749e483: Clarify the base Riddle Proof versus OpenClaw wrapper boundary in the published package docs.

## 0.7.82

### Patch Changes

- f2b60ac: Record changed-region metadata for before/after image visual deltas and use it to keep targeted tiny-change thresholds localized when exact region evidence is available.

## 0.7.81

### Patch Changes

- b7b7660: Honor visual proof viewport matrices in base capture evidence and allow measured tiny visual deltas to pass only when targeted semantic/text evidence agrees with the requested change.

## 0.7.80

### Patch Changes

- 77744e4: Make hosted `run-profile` default trusted package-generated profile scripts to
  `strict=false`, while preserving `--strict=true` for callers who want Riddle
  script-safety warnings to block the run.

## 0.7.79

### Patch Changes

- ec75bfc: Add profile setup dialog responses so browser confirm/prompt flows can be accepted or dismissed during proof runs.

## 0.7.78

### Patch Changes

- d4277f7: Allow `no_fatal_console_errors` to treat browser resource-load console errors from expected failing network mocks as known-good evidence while still failing runtime errors and unmatched resource failures.

## 0.7.77

### Patch Changes

- 3f85c51: Let method-specific profile network mocks fall through to other mocks with the same URL pattern when the request method does not match.

## 0.7.76

### Patch Changes

- bc18e66: Default static directory previews to static routing so clean nested routes resolve to their generated index pages, while preserving explicit SPA routing via `framework: "spa"`.

## 0.7.75

### Patch Changes

- f292b92: Add a `clear_console` profile setup action so profiles can explicitly reset console and page-error evidence after reaching the intended proof state.

## 0.7.74

### Patch Changes

- ed50471: Include profile check targets in generated summary markdown so repeated text, selector, route, and overflow checks are readable without opening proof JSON.

## 0.7.73

### Patch Changes

- da5cae4: Honor `--poll-attempts` / `--pollAttempts` for `run-profile` Riddle polling.

## 0.7.72

### Patch Changes

- 4afa7bf: Add route-inventory evidence counts to profile summary markdown.

## 0.7.71

### Patch Changes

- 6b81d1f: Add response-label hit counts to profile network mock evidence and summaries.

## 0.7.70

### Patch Changes

- f92e46c: Surface profile setup click counts in compact setup summaries and summary markdown.

## 0.7.69

### Patch Changes

- 8783e16: Add profile setup click count support for atomic double-click and double-submit contracts.

## 0.7.68

### Patch Changes

- f1bc74c: Add network mock hit, required-hit, and max-hit details to profile summary markdown.

## 0.7.67

### Patch Changes

- f218511: Add profile network mock hit caps with `max_hit_count` / `max_hits` and a `forbidden: true` shorthand so audit profiles can prove downstream requests did not run.

## 0.7.66

### Patch Changes

- 515427a: Add setup action and setup screenshot counts to profile summary markdown output.

## 0.7.65

### Patch Changes

- 1912a6a: Fix hosted profile setup screenshots so generated scripts pass viewport metadata into setup action execution before building screenshot artifact labels.

## 0.7.64

### Patch Changes

- 1e7b91f: Add a profile `screenshot` setup action so long setup flows can capture durable Riddle screenshots at intermediate proof milestones.

## 0.7.63

### Patch Changes

- 7c145f7: Improve compact profile setup summaries for long click sequences by recording click totals and truncation state while sampling the first and last clicked targets.

## 0.7.62

### Patch Changes

- acd883b: Add compact setup summaries to profile setup-action assessment evidence so setup-heavy clickthrough and iframe proofs expose per-viewport routes, action counts, clicked targets, frame URLs, text samples, and failures without requiring consumers to inspect every raw setup-action result.

## 0.7.61

### Patch Changes

- 1699a24: Add a profile setup drag action for pointer-driven proof flows.

## 0.7.60

### Patch Changes

- dc71d5f: Add profile checks for iframe URLs.

## 0.7.59

### Patch Changes

- 9281ea1: Allow profile setup actions to target iframe contexts with `frame_selector`.

## 0.7.58

### Patch Changes

- 555e675: Add a profile setup action for keyboard key presses.

## 0.7.57

### Patch Changes

- 8a5aa78: Add profile setup assertions for numeric window proof-state values.

## 0.7.56

### Patch Changes

- 4fb15f0: Allow `run-profile` to pass the explicit Riddle `strict` override through to hosted profile runs.

## 0.7.55

### Patch Changes

- 21d3c3d: Add profile checks for final URL search parameter equality and absence.

## 0.7.54

### Patch Changes

- f8f5400: Ignore bounds overflow from elements clipped by overflow-hidden ancestors in profile overflow checks.

## 0.7.53

### Patch Changes

- ab00b86: Add setup action repeat support for profile workflows that need bounded repeated clicks, waits, or window calls.

## 0.7.52

### Patch Changes

- ca4df18: Add profile `assert_window_value` setup actions for exact JSON-safe assertions against browser state paths exposed by canvas apps and other proof hooks.

## 0.7.51

### Patch Changes

- ee70b70: Add an opt-in `force` flag for profile click setup actions so profiles can click intentionally animated controls after matching the intended visible element.

## 0.7.50

### Patch Changes

- 3b54d45: Add profile setup `window-call` actions for named browser proof hooks.

## 0.7.49

### Patch Changes

- c3fc824: Add `delay_ms` support to profile network mocks and sequenced mock responses so proof profiles can exercise in-flight UI and request race conditions without bespoke scripts.

## 0.7.48

### Patch Changes

- aa2b94b: Add profile setup assertion actions for text visibility, text absence, and exact selector counts so pre-navigation setup contracts can fail profiles directly.

## 0.7.47

### Patch Changes

- 0c8f97c: Support request-body assertions on sequenced profile network mock responses.

## 0.7.46

### Patch Changes

- 160b26b: Add negative profile network mock request-body constraints.

## 0.7.45

### Patch Changes

- accb429: Add profile network mock request-body evidence and opt-in body match constraints.

## 0.7.44

### Patch Changes

- cc109ba: Support viewport-scoped profile checks with `viewports` / `viewport_names`.

## 0.7.43

### Patch Changes

- 107c6d7: Match profile expected-console allowlists against console event location URLs as well as message text.

## 0.7.42

### Patch Changes

- bfdffba: Add profile `selector_absent` and exact selector-count checks for audit profiles that need to prove forbidden elements or exact DOM counts.

## 0.7.41

### Patch Changes

- 94116bf: Add repeatable profile network mock response sequences.

## 0.7.40

### Patch Changes

- 1012d4a: Add sequenced profile network mock responses for retry/recovery proofs.

## 0.7.39

### Patch Changes

- 75e5bd1: Allow profile no-fatal-console checks to declare expected console and page-error patterns.

## 0.7.38

### Patch Changes

- 41b6f25: Add profile checks for iframe text visibility and iframe horizontal overflow evidence.

## 0.7.37

### Patch Changes

- e46b9cb: Include viewport names in saved route-inventory screenshot labels when all-viewport sweeps save per-route artifacts.

## 0.7.36

### Patch Changes

- aefccd8: Add opt-in `route_inventory` multi-viewport sweeps with per-viewport source, direct-route, clickthrough, and failure-count evidence.

## 0.7.35

### Patch Changes

- dff5143: Add a profile `selector_text_order` check for proving visible table, list, or card text appears in an expected order without broad body-text regexes.

## 0.7.34

### Patch Changes

- 5468fa1: Add generic source-link and duplicate-source-link counts to profile route-inventory evidence while preserving the existing homepage count fields.

## 0.7.33

### Patch Changes

- cc11628: Emit Riddle poll progress from hosted `run-profile` runs, with `--quiet` and `--progress-every-ms` support for long profile sweeps.

## 0.7.32

### Patch Changes

- 1cb093c: Add a reusable profile `route_inventory` check for expected-route source audits, direct route health, real clickthrough health, stale source-surface guards, and compact route inventory evidence.

## 0.7.31

### Patch Changes

- 8d251a0: Avoid waiting for navigation after profile setup clicks so app-state buttons do not fail after the click has already landed.

## 0.7.30

### Patch Changes

- 040ae5d: Add profile setup actions for session storage seeding and browser storage cleanup.

## 0.7.29

### Patch Changes

- 293295b: Refresh the profile mode README docs for network mocks and the current setup actions.

## 0.7.28

### Patch Changes

- cd30d28: Add profile setup actions for filling inputs, setting input values, and seeding localStorage with optional reload so audit profiles can cover authenticated and form workflows without custom scripts.

## 0.7.27

### Patch Changes

- 6d52468: Add profile `target.network_mocks` so audit profiles can mock static backend responses, record mock hits in evidence, and fail required mocks that are not exercised.

## 0.7.26

### Patch Changes

- 175a926: Expose the trusted `--strict true|false` option on the `riddle-run-script` CLI so proof scripts can opt into existing Riddle API strict-validation behavior from the command line.

## 0.7.25

### Patch Changes

- b74d6ab: Improve `riddle-poll --wait` diagnostics for delayed-dispatch jobs by extending the default wait budget, emitting progress on stderr, and returning explicit poll timeout metadata when a job remains non-terminal with no `submitted_at`.

## 0.7.24

### Patch Changes

- 10edf9a: Improve profile capture by matching text assertions against full page text and ignoring descendant bounds overflow that is contained inside horizontal scrollers.

## 0.7.23

### Patch Changes

- c2627d0: Normalize profile Riddle artifact refs so saved JSON artifacts do not appear as duplicate `.json.json` entries.

## 0.7.22

### Patch Changes

- 6a15ba3: Assess responsive horizontal bounds offenders in profile and basic gameplay proofs, so element clipping can fail even when document scroll overflow remains zero.

## 0.7.21

### Patch Changes

- c87d177: Allow basic gameplay evidence routes to opt into audit assessment mode, so static/no-diff targets can pass without requiring an interactive game surface or primary control.

## 0.7.20

### Patch Changes

- 16f0e63: Compact stored profile setup-action text so broad wait targets keep artifacts readable without changing matching behavior.

## 0.7.19

### Patch Changes

- e50f58c: Save partial profile evidence during multi-viewport captures and treat incomplete viewport evidence as proof insufficient instead of passed.

## 0.7.18

### Patch Changes

- 78ce64a: Fail basic gameplay assessments when responsive setup actions fail and emit `responsive_setup_failed` catch records.

## 0.7.17

### Patch Changes

- 4ac651a: Add Riddle Proof profile target timeout metadata so durable audit profiles can carry known-heavy Riddle worker timeouts without relying on CLI-only overrides.

## 0.7.16

### Patch Changes

- 7d81595: Honor explicit selector text pattern match metrics when assessing basic gameplay progression checks.

## 0.7.15

### Patch Changes

- ef65918: Promote basic gameplay `after_cleanup` terminal-before-restart evidence.

## 0.7.14

### Patch Changes

- db0c0c5: Expose exact selector-count progression checks in the basic gameplay contract.

## 0.7.13

### Patch Changes

- ba2c000: Expose `set-input-value` in the basic gameplay action contract for value-driven inputs, selects, textareas, and range controls.

## 0.7.12

### Patch Changes

- 88423f2: Allow trusted Riddle script runs to send top-level `strict: false`.

## 0.7.11

### Patch Changes

- cb32d40: Preserve Riddle Preview mount prefixes when profile routes are resolved or matched against hosted preview URLs.

## 0.7.10

### Patch Changes

- cb1aa4c: Make profile setup clicks prefer visible text matches and normalize trailing slashes in profile route checks.

## 0.7.9

### Patch Changes

- 5465c50: Add profile `target.setup_actions` for driving audited pages into a meaningful state before viewport checks and screenshots.

## 0.7.8

### Patch Changes

- 8f4a04e: Expose canvas click and held pointer action types in the basic gameplay contract constants.

## 0.7.7

### Patch Changes

- ca82fff: Count continued gameplay actions as primary action attempts in basic gameplay assessment.

## 0.7.6

### Patch Changes

- 7af03ba: Add a basic gameplay `number_at_least` progression assertion and count successful restart actions as reset-path evidence for terminal-only recovery proofs.

## 0.7.5

### Patch Changes

- Treat audit/no-diff verify completion as a terminal completed result instead of an unhandled checkpoint blocker.

## 0.7.4

### Patch Changes

- Capture returned proof evidence from verify scripts and remove worker-global evidence probing that Riddle rejects during audit/no-diff captures.

## 0.7.3

### Patch Changes

- Forward audit/no-diff runtime flags through setup so no-implementation runs preserve implementation_mode, require_diff, and allow_code_changes across the wrapper/runtime boundary.

## 0.7.2

### Patch Changes

- Allow audit/no-diff verify runs to accept implementation_status=not_required, skip after-worktree implementation evidence, and judge current target evidence directly.

## 0.7.1

### Patch Changes

- 62d26d7: Mechanically enforce audit/no-diff runs by skipping implementation, disabling ship, preserving no-diff request flags, and exposing the controls through the OpenClaw wrapper schema.

## 0.7.0

### Minor Changes

- 9341a9d: Add CI/profile mode with a durable profile/result schema, hosted Riddle `run-profile` CLI command, profile script generation, artifact-backed result collection, and docs for generic page/layout proof profiles.

## 0.6.0

### Minor Changes

- 716da8d: Promote reusable basic-gameplay proof primitives: progression assertions, artifact-backed screenshot resolution, state/state-call metric metadata, catch records, JSON-safe text compaction, and public action/assertion contract constants.

## 0.5.57

### Patch Changes

- Measure visual delta directly from before/after screenshot artifacts when possible and keep unmeasured visual-delta proofs in verify recovery instead of supervisor review.

## 0.5.56

### Patch Changes

- Promote reusable server-preview proof helpers, add the `riddle-server-preview` CLI command, and add a basic-gameplay catch summary helper for durable proof stories.

## 0.5.53

### Patch Changes

- Add a markdown checkpoint view for readable sole-agent review of the current obligation, evidence, allowed decisions, response template, and next command.

## 0.5.52

### Patch Changes

- Refuse flag-based checkpoint responses that would submit generated placeholder payloads, while keeping templates useful for sole-agent review.

## 0.5.51

### Patch Changes

- Add a sole-agent checkpoint CLI view and flag-based checkpoint responses for the host-agnostic durable loop.

## 0.5.50

### Patch Changes

- Hard-cap local-agent prompt payloads so recon retries cannot balloon into slow six-figure character prompts.

## 0.5.49

### Patch Changes

- Add run-card observability for engine/agent timings, retry/recovery summaries, and local-agent prompt size metrics.

- Tighten local-agent prompt compaction while preserving recon/proof priority fields.

## 0.5.48

### Patch Changes

- Route recoverable ship/verify blockers through their checkpoint recovery stage instead of terminally blocking when the contract can continue.

- Retry no-diff implementation-agent attempts inside the existing bounded stage loop before escalating as non-convergent.

## 0.5.47

### Patch Changes

- Add generic local-agent aliases for the CLI loop surface: `riddle-proof-loop --agent local`, `doctor local`, and `@riddledc/riddle-proof/local-agent`.

- Preserve persisted run-card evidence context in status snapshots and allow CLI smokes to point at an explicit test engine module.

## 0.5.46

### Patch Changes

- Promote the local CLI agent adapter into the reusable Riddle Proof package, add the `riddle-proof-loop` CLI, and persist compact run cards for durable loop supervision.

- Extend portable checkpoint packets/responses across recon and implementation stages so CLI, Codex, Claude Code, OpenClaw, or another host can drive the same run contract without OC-specific proof logic.

## 0.5.45

### Patch Changes

- Route proof assessment and visual evidence recovery through portable checkpoint packets.

  OpenClaw review submissions now answer pending checkpoint packets while preserving the existing `riddle_proof_review` surface.

## 0.5.44

### Patch Changes

- 8129dcd: Route missing required visual-delta proof metrics back into verify/evidence recovery instead of marking them ready to ship or downgrading them to generic richer-proof requests.

## 0.5.43

### Patch Changes

- Publish Riddle visual diff metrics through the proof pipeline and add a Playwright page.evaluate argument guardrail.

## 0.5.42

### Patch Changes

- Harden canvas-first Riddle Proof runs by accepting large visible canvas captures and passing playability evidence even when DOM text is sparse, add actionable diagnostics for unmeasured visual deltas, and expose compact OpenClaw progress updates with preemption recovery guidance.

## 0.5.41

### Patch Changes

- dc3e9b1: Make checkpoint response retries idempotent when blocking decisions retain the pending checkpoint packet, and expose duplicate response counts in compact checkpoint summaries.

## 0.5.40

### Patch Changes

- a26a41e: Harden checkpoint status reporting with compact checkpoint summaries, explicit wrapper/engine/resume state paths, persisted proof-authoring contracts, deterministic duplicate response handling, and compact-by-default OpenClaw status output.

## 0.5.39

### Patch Changes

- 6e92d0c: Add Riddle Proof checkpoint packets/responses with author-checkpoint resume support, and wire OpenClaw checkpoint dispatch modes plus checkpoint-response review resume.

## 0.5.38

### Patch Changes

- Move generated Riddle Proof worktrees and dependency caches to disk-backed scratch storage by default and record scratch disk snapshots during setup.

## 0.5.37

### Patch Changes

- Add a reusable playable/gameplay proof contract that requires accepted input, state/time progression, and measured playfield/canvas motion before interactive game proof can pass.

## 0.5.36

### Patch Changes

- Add server/build preview status recovery helpers so interrupted `sp_...` and `bp_...` preview jobs can be checked later and screenshot artifacts can be downloaded into the workspace.

## 0.5.35

### Patch Changes

- Expose reusable visual proof-session inputs through the OpenClaw wrapper.

## 0.5.34

### Patch Changes

- Add visual proof-session fingerprints and resume-session state support for iterative proof runs.

## 0.5.33

### Patch Changes

- Block ready-to-ship visual proofs unless the proof evidence includes a measured, passing visual delta.

## 0.5.32

### Patch Changes

- 5a045d2: Honor explicit proof-stage advancement when a stale checkpoint continuation flag is also present, and stop sending that stale flag after implementation handoff.

## 0.5.31

### Patch Changes

- 245ecea: Reject cached capture hints for a different browser route when the current request explicitly names a route, preventing stale last-good proof paths from leaking across unrelated runs.

## 0.5.30

### Patch Changes

- 8a37890: Preserve requested no-production reference choices through setup so preflight can report semantic production-reference skip reasons in live proof runs.

## 0.5.29

### Patch Changes

- ad3516c: Record skipped production-reference reasons in proof state and surface them through the OpenClaw plugin while ignoring expected-absence false evidence.

## 0.5.28

### Patch Changes

- Preserve literal proof request text when shipping PRs by invoking git and gh without shell interpolation.

## 0.5.27

### Patch Changes

- Avoid reusing route-specific capture hints based only on verification mode, while preserving root-path hint reuse.

## 0.5.26

### Patch Changes

- 0c9a5e6: Read proof evidence from enriched artifact JSON consistently across verify decisions and evidence bundles.

## 0.5.25

### Patch Changes

- b494f15: Preserve structured proof evidence when a capture script throws after writing evidence, while still failing the capture.

## 0.5.24

### Patch Changes

- d30b632: Preserve finalized ready/shipped wrapper run state when an older background harness attempt finishes later.

## 0.5.23

### Patch Changes

- 61022dd: Ignore `.codex` and `.oc-smoke` tool artifacts when deciding whether implementation produced a material git diff.

## 0.5.22

### Patch Changes

- Make OpenClaw proof inputs more forgiving by preserving invalid freeform `reference` text as metadata while ignoring it as a baseline selector.

## 0.5.21

### Patch Changes

- Preserve query strings when capturing and matching proof routes so query-driven SPA pages are not misclassified as wrong-route captures.

## 0.5.20

### Patch Changes

- 1038a58: Record recon build and capture subphase timings and surface them in OpenClaw status and inspect timing summaries.

## 0.5.19

### Patch Changes

- 4771be7: Clarify implementation-gap status by surfacing implementation agent attempt telemetry and distinguishing pre-agent gaps from post-attempt no-diff cases.

## 0.5.18

### Patch Changes

- a4824b2: Persist and surface structured implement-gap diagnostics through the proof runtime and OpenClaw wrapper.

## 0.5.17

### Patch Changes

- 968c52a: Expose verify artifact contract, production, and usage summaries through the proof assessment contract and OpenClaw inspection surfaces.

## 0.5.16

### Patch Changes

- 72f910a: Improve proof monitoring guidance and speed up verify builds.

## 0.5.15

### Patch Changes

- a32f02b: Emit real verify runtime phase events for build, capture, and assessment so status and inspect can report verify subphase timings on live proof runs.

## 0.5.14

### Patch Changes

- e555136: Honor learned root-path capture hints during recon so proof runs stop wasting retries on distracting route literals.

## 0.5.13

### Patch Changes

- a6fbae0: Add timing summaries, opt-in debug status payloads, and reusable last-good capture hints for faster proof runs.

## 0.5.12

### Patch Changes

- bba5a57: Prune stale proof scratch worktrees when local temp storage is low, and add clearer status diagnostics when an OpenClaw monitor passes a non-wrapper state path.

## 0.5.11

### Patch Changes

- 65c5165: Add monitor-facing status fields so OpenClaw can continue through routable proof checkpoints instead of reporting intermediate states as final failures.

## 0.5.10

### Patch Changes

- b65fed0: Hold non-shipping proof runs at `ready_to_ship` after a ready proof assessment instead of re-entering verify or advancing toward ship.

## 0.5.9

### Patch Changes

- 3cd4e9b: Give normal proof runs more default iteration runway while adding per-stage loop caps so recon, authoring, implementation, verification, and non-shipping auto-review can complete without allowing a bad phase to spin indefinitely.

## 0.5.8

### Patch Changes

- 61f1218: Default proof-run scratch worktrees to local temp storage so dependency cache materialization does not crawl on shared workspace filesystems.

## 0.5.7

### Patch Changes

- 0427377: Materialize cached Riddle Proof node_modules with hardlinks or copies instead of symlinks so server-preview tarballs cannot be rejected for symlinked dependency directories.

## 0.5.6

### Patch Changes

- fb219e9: Cache Riddle Proof dependency installs across proof runs by package/lockfile fingerprint so repeated browser proof runs can reuse installed node_modules instead of reinstalling for each new worktree.

## 0.5.5

### Patch Changes

- 8dee58c: Make OpenClaw proof runs background by default, skip useless shared dependency installs when the active workspace fingerprint does not match proof worktrees, reuse before-worktree dependencies for matching after worktrees, and expose richer status guidance for wake/watch monitoring.

## 0.5.4

### Patch Changes

- 8ea62e9: Preserve real engine failure blockers during dry-run proofs and add dependency-install phase visibility during setup.

## 0.5.3

### Patch Changes

- 23f4ad4: Add proof workflow substep timing events and surface active engine substeps from OpenClaw status snapshots.

## 0.5.2

### Patch Changes

- 7f0d5f9: Fold the Riddle Proof checkpoint engine and bundled runtime into `@riddledc/riddle-proof`, and let the OpenClaw wrapper load that packaged engine by default instead of depending on a separate private runtime plugin.

## 0.5.1

### Patch Changes

- c23a745: Move the Riddle Proof checkpoint engine and bundled runtime assets into the public integrations workspace, and label OpenClaw requests with the public `riddle_proof_change` tool name.

## 0.5.0

### Minor Changes

- 7205bce: Add capture diagnostics helpers for redacted Riddle server preview evidence.

### Patch Changes

- f4c5ae2: Add generic authenticated proof inputs for OpenClaw wrappers: `auth_localStorage_json`, `auth_cookies_json`, and `auth_headers_json`.

## 0.4.5

### Patch Changes

- Add explicit sync workflow params for safe post-merge base checkout refreshes
  so public wrappers can request and report local base updates after PR merge.

## 0.4.4

### Patch Changes

- Add PR lifecycle sync state to the public run contract so wrappers can record
  whether a shipped PR is still open, merged, closed, or unavailable, along
  with merge commit/time and cleanup results.

## 0.4.2

### Patch Changes

- 09d79bb: Add an explicit draft-hold escape hatch, preserve it through the engine harness,
  and tighten main-agent proof review guidance for subtle visual changes.

## 0.4.1

### Patch Changes

- 68b060c: Add main-agent proof review support for OpenClaw Riddle Proof runs.

  The reusable harness can now resume from explicit workflow params, and the
  OpenClaw wrapper can pause final proof judgment at a structured
  `main_agent_proof_review_required` checkpoint. A new `riddle_proof_review` tool
  submits the main agent's verdict and resumes the same run.

## 0.4.0

### Minor Changes

- c3e55cb: Add the reusable Riddle Proof engine harness and OpenClaw status surface.

  The core package now exposes a checkpoint-driven harness for the existing
  `riddle-proof-run` engine, persistent run state, status snapshots, disabled
  agent-adapter blockers, and isolated-worktree safety checks before
  implementation can advance.

  The OpenClaw wrapper now exposes `riddle_proof_status` and can opt into engine
  mode with explicit runtime config while preserving the default blocked
  normalization behavior.

## 0.3.0

### Minor Changes

- fd7395c: Add hardening contracts for proof-run observability and safer execution: run ids,
  current stage tracking, worktree metadata, stage heartbeats, cheap status
  snapshots, preflight adapters, setup cleanup metadata, and explicit proof
  artifact roles.

## 0.2.0

### Minor Changes

- bdcd00e: Add the Riddle Proof runner harness and the initial OpenClaw wrapper package for
  request normalization.

## 0.1.1

### Patch Changes

- 4c3cc8a: Add published package install and import examples to the README.

## 0.1.0

### Minor Changes

- a40cee4: Add the initial Riddle Proof reusable package with run/result/evidence contracts and terminal metadata helpers.
