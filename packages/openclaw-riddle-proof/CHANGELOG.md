# @riddledc/openclaw-riddle-proof

## 0.4.145

### Patch Changes

- Add a reusable OC flow regression pack for Riddle Proof and validate its expected terminal outcomes.
- Updated dependencies
  - @riddledc/riddle-proof@0.8.17

## 0.4.144

### Patch Changes

- Ignore stale checkpoint responses that arrive after the wrapper has reached a terminal status.

## 0.4.143

### Patch Changes

- Preserve terminal status on stale checkpoint responses and parse nested interaction terminal URLs.
- Updated dependencies
  - @riddledc/riddle-proof@0.8.16

## 0.4.142

### Patch Changes

- Ignore stale checkpoint responses after finalized Riddle Proof runs and harden direct trust-boundary regressions.
- Updated dependencies
  - @riddledc/riddle-proof@0.8.15

## 0.4.141

### Patch Changes

- Terminalize authored interaction route mismatches before agent proof review, and let explicit no-diff capture runs skip recon agent judgment once required baselines are captured.
- Updated dependencies
  - @riddledc/riddle-proof@0.8.14

## 0.4.140

### Patch Changes

- Block structured interaction evidence when an explicit expected URL with query/hash does not match the captured terminal browser route.
- Updated dependencies
  - @riddledc/riddle-proof@0.8.13

## 0.4.139

### Patch Changes

- Harden interaction verification around trusted browser evidence, route expectation drift, and conclusive capture-failure blockers.
- Updated dependencies
  - @riddledc/riddle-proof@0.8.12

## 0.4.138

### Patch Changes

- be6a3a2: Ignore prose/package path noise when deriving interaction terminal routes.
- Updated dependencies [be6a3a2]
  - @riddledc/riddle-proof@0.8.11

## 0.4.137

### Patch Changes

- 48a9f92: Add direct Riddle Proof trust-boundary regressions for route-changing interactions, query/hash terminal routes, same-page hashes, missing selectors, thrown errors, timeouts, no-diff audits, and proof-evidence gates. Preserve concrete browser capture failures ahead of visual-delta recovery context and terminalize invalid proof assessment without a safe continuation as a named blocker.
- Updated dependencies [48a9f92]
  - @riddledc/riddle-proof@0.8.10

## 0.4.136

### Patch Changes

- 1ee25a8: Classify Codex event-only authoring output as a missing final response, bound the default proof-packet authoring timeout, and refresh the OpenClaw wrapper release.
- Updated dependencies [1ee25a8]
  - @riddledc/riddle-proof@0.8.9

## 0.4.135

### Patch Changes

- 41f7cdd: Route failed structured interaction evidence into proof judgment instead of verify-capture retry loops.
- Updated dependencies [41f7cdd]
  - @riddledc/riddle-proof@0.8.8

## 0.4.134

### Patch Changes

- 04f01da: Preserve interaction start routes during verify-capture retry recovery and read terminal routes from nested proof evidence.
- Updated dependencies [04f01da]
  - @riddledc/riddle-proof@0.8.7

## 0.4.133

### Patch Changes

- 09355b1: Preserve structured failed interaction evidence when an authored capture script times out before returning proof evidence.
- Updated dependencies [09355b1]
  - @riddledc/riddle-proof@0.8.6

## 0.4.132

### Patch Changes

- 2d98460: Surface concrete verify retry diagnostics and route authored interaction terminal mismatches back to proof authoring.
- Updated dependencies [2d98460]
  - @riddledc/riddle-proof@0.8.5

## 0.4.131

### Patch Changes

- 5956625: Fix interaction verify recovery for route query/hash expectations, selector-timeout capture retries, and checkpoint author-packet resumes.

  The proof runtime now preserves hash fragments in route expectations, exposes expected/observed query and hash details in semantic evidence, stops retrying deterministic Playwright locator timeouts, and keeps route/proof-evidence blockers visible in capture retry summaries. The engine harness now routes author-packet checkpoint responses through author before verify so stale retry continuations cannot fall through to an invalid `run` stage. The OpenClaw wrapper now dedupes durable wake requests and gives proof-review checkpoints direct review-decision instructions instead of `continue_checkpoint` guidance.

- Updated dependencies [5956625]
  - @riddledc/riddle-proof@0.8.4

## 0.4.130

### Patch Changes

- 421dd26: Remove legacy OpenClaw extension-path assumptions from Riddle Proof runtime metadata so npm-managed installs resolve the packaged runtime cleanly.
- Updated dependencies [421dd26]
  - @riddledc/riddle-proof@0.8.3

## 0.4.129

### Patch Changes

- 44bad26: Fix interaction proof verification to judge the terminal route/state separately from the initial capture route, default no-diff remote audits to current-target capture, and surface route/script capture failures with concrete diagnostics.
- Updated dependencies [44bad26]
  - @riddledc/riddle-proof@0.8.2

## 0.4.128

### Patch Changes

- Refresh the OpenClaw wrapper release so deployed environments consume @riddledc/riddle-proof 0.8.1.
- Updated dependencies
  - @riddledc/riddle-proof@0.8.1

## 0.4.127

### Patch Changes

- 3a9dad9: Harden audit/no-diff setup arg handling, static visual audit readiness, explicit max iteration limits, and no-diff checkpoint continuations.
- Updated dependencies [3a9dad9]
  - @riddledc/riddle-proof@0.7.226

## 0.4.126

### Patch Changes

- 58742ac: Treat audit/no-diff visual proof runs as current-target reviews instead of requiring measured before/after visual delta, and clarify that capture_script must be Playwright JavaScript.
- Updated dependencies [58742ac]
  - @riddledc/riddle-proof@0.7.225

## 0.4.125

### Patch Changes

- 2bfc258: Improve Riddle Proof runtime handling for audit/no-diff proof runs, local repo paths, dependency staging, and bounded wait polling.
- Updated dependencies [2bfc258]
  - @riddledc/riddle-proof@0.7.224

## 0.4.124

### Patch Changes

- 1ddff76: Refresh the OpenClaw wrapper release so deployed environments consume @riddledc/riddle-proof@0.7.223.

## 0.4.123

### Patch Changes

- 598ed9c: Refresh the OpenClaw wrapper release so deployed environments consume `@riddledc/riddle-proof@0.7.222`.

## 0.4.122

### Patch Changes

- 3f72122: Refresh the OpenClaw wrapper release so deployed environments consume `@riddledc/riddle-proof@0.7.221`.

## 0.4.121

### Patch Changes

- 79f2741: Refresh the OpenClaw wrapper release so deployed environments consume `@riddledc/riddle-proof@0.7.220`.

## 0.4.120

### Patch Changes

- 17f064a: Refresh the OpenClaw wrapper release so deployed environments consume `@riddledc/riddle-proof@0.7.219`.

## 0.4.119

### Patch Changes

- 6bda14b: Refresh the OpenClaw wrapper release so its bundled Riddle Proof dependency picks up `@riddledc/riddle-proof@0.7.218`.

## 0.4.118

### Patch Changes

- 1848b00: Refresh the OpenClaw wrapper release so deployed OC environments consume @riddledc/riddle-proof 0.7.217.

## 0.4.117

### Patch Changes

- f6e7888: Refresh the OpenClaw wrapper release so deployed OC environments consume @riddledc/riddle-proof 0.7.216.

## 0.4.116

### Patch Changes

- 590ee43: Refresh the OpenClaw wrapper release so deployed OC environments consume @riddledc/riddle-proof 0.7.215.

## 0.4.115

### Patch Changes

- e07dff6: Refresh the OpenClaw wrapper release for @riddledc/riddle-proof 0.7.214 selector wait diagnostics.

## 0.4.114

### Patch Changes

- b466781: Refresh the OpenClaw wrapper release so published installs pick up `@riddledc/riddle-proof@0.7.213`.

## 0.4.113

### Patch Changes

- ced6ad3: Refresh wrapper package to consume `@riddledc/riddle-proof@0.7.212`.

## 0.4.112

### Patch Changes

- cd8d357: Refresh bundled Riddle Proof dependency to include solved-board state-change receipt recognition.

## 0.4.111

### Patch Changes

- 6b08f9f: Refresh bundled Riddle Proof dependency to include runtime metric proof receipt recognition.

## 0.4.110

### Patch Changes

- 2c96285: Refresh the OpenClaw Riddle Proof wrapper so live installs pick up `@riddledc/riddle-proof@0.7.209`.

## 0.4.109

### Patch Changes

- aa4f466: Refresh the OpenClaw wrapper package against @riddledc/riddle-proof 0.7.208.

## 0.4.108

### Patch Changes

- 1ab5676: Refresh the bundled Riddle Proof dependency to include terminal game-over proof-pack receipt classification.

## 0.4.107

### Patch Changes

- 532d848: Refresh bundled Riddle Proof dependency to 0.7.206.

## 0.4.106

### Patch Changes

- f6745f8: Refresh the OpenClaw wrapper release so new installs resolve the current `@riddledc/riddle-proof` full setup-action receipt classifier.

## 0.4.105

### Patch Changes

- 6e1faab: Refresh the OpenClaw wrapper release so new installs resolve the current `@riddledc/riddle-proof` aggregate timing summary improvements.

## 0.4.104

### Patch Changes

- f943ee4: Refresh the OpenClaw wrapper release so new installs resolve the current `@riddledc/riddle-proof` profile aggregate CLI.

## 0.4.103

### Patch Changes

- e4af1cc: Refresh the OpenClaw wrapper release so new installs resolve the current `@riddledc/riddle-proof` profile runner and recovery CLI improvements.

## 0.4.102

### Patch Changes

- 3050334: Clarify no-ship proof completion status, pending checkpoint token status, and debug payload compaction for OpenClaw smoke runs.

## 0.4.101

### Patch Changes

- 1feba96: Persist background checkpoint packets onto the OpenClaw wrapper state so checkpoint responses can resume background Riddle Proof runs.

## 0.4.100

### Patch Changes

- 91aae2d: Add explicit OpenClaw Riddle Proof workflow modes for interactive, background PR, and continuous operation.

## 0.4.99

### Patch Changes

- Treat audit/no-diff verify completion as a terminal completed result instead of an unhandled checkpoint blocker.
- Updated dependencies
  - @riddledc/riddle-proof@0.7.5

## 0.4.98

### Patch Changes

- Capture returned proof evidence from verify scripts and remove worker-global evidence probing that Riddle rejects during audit/no-diff captures.
- Updated dependencies
  - @riddledc/riddle-proof@0.7.4

## 0.4.97

### Patch Changes

- Forward audit/no-diff runtime flags through setup so no-implementation runs preserve implementation_mode, require_diff, and allow_code_changes across the wrapper/runtime boundary.
- Updated dependencies
  - @riddledc/riddle-proof@0.7.3

## 0.4.96

### Patch Changes

- Allow audit/no-diff verify runs to accept implementation_status=not_required, skip after-worktree implementation evidence, and judge current target evidence directly.
- Updated dependencies
  - @riddledc/riddle-proof@0.7.2

## 0.4.95

### Patch Changes

- 62d26d7: Mechanically enforce audit/no-diff runs by skipping implementation, disabling ship, preserving no-diff request flags, and exposing the controls through the OpenClaw wrapper schema.
- Updated dependencies [62d26d7]
  - @riddledc/riddle-proof@0.7.1

## 0.4.94

### Patch Changes

- Updated dependencies [9341a9d]
  - @riddledc/riddle-proof@0.7.0

## 0.4.93

### Patch Changes

- Updated dependencies [716da8d]
  - @riddledc/riddle-proof@0.6.0

## 0.4.91

### Patch Changes

- Surface stale runtime-step status when a host turn is killed after the engine finishes its latest phase but the wrapper run still appears active.

- Updated dependencies
  - @riddledc/riddle-proof@0.5.50

## 0.4.90

### Patch Changes

- Pick up Riddle Proof observability and local-agent prompt compaction metrics.

- Updated dependencies
  - @riddledc/riddle-proof@0.5.49

## 0.4.89

### Patch Changes

- Pick up the Riddle Proof core recovery loop so recoverable ship/verify blockers and no-diff implementation attempts stay inside bounded retry.

- Updated dependencies
  - @riddledc/riddle-proof@0.5.48

## 0.4.88

### Patch Changes

- Prefer `local_exec` as the OpenClaw-facing executor mode while retaining `codex_exec` as a compatibility alias.

- Updated dependencies
  - @riddledc/riddle-proof@0.5.47

## 0.4.87

### Patch Changes

- Consume the shared Codex exec adapter from `@riddledc/riddle-proof` so OpenClaw remains an adapter over the generic durable loop contract.

- Updated dependencies
  - @riddledc/riddle-proof@0.5.46

## 0.4.86

### Patch Changes

- Route proof assessment and visual evidence recovery through portable checkpoint packets.

  OpenClaw review submissions now answer pending checkpoint packets while preserving the existing `riddle_proof_review` surface.

- Updated dependencies
  - @riddledc/riddle-proof@0.5.45

## 0.4.85

### Patch Changes

- 8129dcd: Route missing required visual-delta proof metrics back into verify/evidence recovery instead of marking them ready to ship or downgrading them to generic richer-proof requests.
- Updated dependencies [8129dcd]
  - @riddledc/riddle-proof@0.5.44

## 0.4.84

### Patch Changes

- Publish Riddle visual diff metrics through the proof pipeline and add a Playwright page.evaluate argument guardrail.
- Updated dependencies
  - @riddledc/riddle-proof@0.5.43

## 0.4.83

### Patch Changes

- Harden canvas-first Riddle Proof runs by accepting large visible canvas captures and passing playability evidence even when DOM text is sparse, add actionable diagnostics for unmeasured visual deltas, and expose compact OpenClaw progress updates with preemption recovery guidance.
- Updated dependencies
  - @riddledc/riddle-proof@0.5.42

## 0.4.82

### Patch Changes

- dc3e9b1: Make checkpoint response retries idempotent when blocking decisions retain the pending checkpoint packet, and expose duplicate response counts in compact checkpoint summaries.
- Updated dependencies [dc3e9b1]
  - @riddledc/riddle-proof@0.5.41

## 0.4.81

### Patch Changes

- a26a41e: Harden checkpoint status reporting with compact checkpoint summaries, explicit wrapper/engine/resume state paths, persisted proof-authoring contracts, deterministic duplicate response handling, and compact-by-default OpenClaw status output.
- Updated dependencies [a26a41e]
  - @riddledc/riddle-proof@0.5.40

## 0.4.80

### Patch Changes

- 6e92d0c: Add Riddle Proof checkpoint packets/responses with author-checkpoint resume support, and wire OpenClaw checkpoint dispatch modes plus checkpoint-response review resume.
- Updated dependencies [6e92d0c]
  - @riddledc/riddle-proof@0.5.39

## 0.4.79

### Patch Changes

- Move generated Riddle Proof worktrees and dependency caches to disk-backed scratch storage by default and record scratch disk snapshots during setup.
- Updated dependencies
  - @riddledc/riddle-proof@0.5.38

## 0.4.78

### Patch Changes

- Add playable/gameplay proof review gates so OpenClaw cannot auto-advance a static screenshot or generated image plate without structured playability evidence.
- Updated dependencies
  - @riddledc/riddle-proof@0.5.37

## 0.4.77

### Patch Changes

- Rebundle the Riddle Proof runtime so OpenClaw installs pick up preview status recovery direct-mode helpers.

## 0.4.76

### Patch Changes

- Expose reusable visual proof-session inputs through the OpenClaw wrapper.
- Updated dependencies
  - @riddledc/riddle-proof@0.5.35

## 0.4.75

### Patch Changes

- Block ready-to-ship visual proofs unless the proof evidence includes a measured, passing visual delta.
- Updated dependencies
  - @riddledc/riddle-proof@0.5.33

## 0.4.74

### Patch Changes

- Parse schema-shaped JSON objects from Codex JSONL output so proof packet authoring can ignore stream event lines when a final structured payload is present.

## 0.4.73

### Patch Changes

- Add blocked-proof PR handoff policy, artifact carryover, failure summary, and wake text so salvaged diffs stay draft/blocked instead of looking merge-ready.

## 0.4.72

### Patch Changes

- Merge plugin factory and execute contexts when binding Riddle Proof wake monitors so empty execute context cannot mask the active OpenClaw session.

## 0.4.71

### Patch Changes

- Bind the Riddle Proof wake monitor to OpenClaw plugin factory context so background runs can re-enter the active session.

## 0.4.70

### Patch Changes

- Add an OpenClaw wake monitor for background Riddle Proof runs so reportable proof states and detached review resumes can re-enter the originating session through system events and heartbeat wakeups.

## 0.4.69

### Patch Changes

- 5a045d2: Honor explicit proof-stage advancement when a stale checkpoint continuation flag is also present, and stop sending that stale flag after implementation handoff.
- Updated dependencies [5a045d2]
  - @riddledc/riddle-proof@0.5.32

## 0.4.68

### Patch Changes

- 1d45185: Pass ready-candidate and structured-evidence concern summaries into main-agent proof review packets so failed proof claims are visible before a ready decision.

## 0.4.67

### Patch Changes

- 245ecea: Reject cached capture hints for a different browser route when the current request explicitly names a route, preventing stale last-good proof paths from leaking across unrelated runs.
- Updated dependencies [245ecea]
  - @riddledc/riddle-proof@0.5.31

## 0.4.66

### Patch Changes

- 0cec0b5: Align monitor contract guidance with top-level status for running engine calls so plain in-flight work reports `hold_for_engine_substep` instead of a reportable checkpoint.

## 0.4.65

### Patch Changes

- 31334bc: Keep detached monitors polling through transient running checkpoints, and only expose `continue_checkpoint` as an actionable stop for blocked routable checkpoints.

## 0.4.64

### Patch Changes

- f762032: Resume non-proof checkpoints with an explicit workflow stage fallback so `continue_checkpoint` does not block when the underlying engine has no active resumable checkpoint.

## 0.4.63

### Patch Changes

- 35ee077: Clarify non-proof checkpoint continuation by adding `continue_checkpoint` to `riddle_proof_review`, reporting routable checkpoints as actionable in checkpoint mode, and preserving terminal-only monitoring behavior.

## 0.4.62

### Patch Changes

- ac2852f: Prefer reference-resolution metadata when reporting effective reference values in status and inspect output.

## 0.4.61

### Patch Changes

- 8a37890: Preserve requested no-production reference choices through setup so preflight can report semantic production-reference skip reasons in live proof runs.
- Updated dependencies [8a37890]
  - @riddledc/riddle-proof@0.5.30

## 0.4.60

### Patch Changes

- ad3516c: Record skipped production-reference reasons in proof state and surface them through the OpenClaw plugin while ignoring expected-absence false evidence.
- Updated dependencies [ad3516c]
  - @riddledc/riddle-proof@0.5.29

## 0.4.59

### Patch Changes

- Preserve literal proof request text when shipping PRs by invoking git and gh without shell interpolation.
- Updated dependencies
  - @riddledc/riddle-proof@0.5.28

## 0.4.58

### Patch Changes

- Clarify capture-hint status by separating selected hint values from applied and effective route fields.

## 0.4.57

### Patch Changes

- Make status snapshots present the status-loop monitor plan as primary, with riddle_proof_wait as an optional convenience when exposed.

## 0.4.56

### Patch Changes

- Avoid reusing route-specific capture hints based only on verification mode, while preserving root-path hint reuse.
- Updated dependencies
  - @riddledc/riddle-proof@0.5.27

## 0.4.55

### Patch Changes

- 15f93ed: Clamp low wrapper max_iterations values to the product floor so implementation-required runs can continue through verify.

## 0.4.54

### Patch Changes

- 544f0ee: Allow non-visual ship_mode=none auto-review to rely on required structured proof evidence without requiring an after screenshot.

## 0.4.53

### Patch Changes

- 0c9a5e6: Read proof evidence from enriched artifact JSON consistently across verify decisions and evidence bundles.
- Updated dependencies [0c9a5e6]
  - @riddledc/riddle-proof@0.5.26

## 0.4.52

### Patch Changes

- b494f15: Preserve structured proof evidence when a capture script throws after writing evidence, while still failing the capture.
- Updated dependencies [b494f15]
  - @riddledc/riddle-proof@0.5.25

## 0.4.51

### Patch Changes

- d30b632: Preserve finalized ready/shipped wrapper run state when an older background harness attempt finishes later.
- Updated dependencies [d30b632]
  - @riddledc/riddle-proof@0.5.24

## 0.4.50

### Patch Changes

- ac23714: Expose ignored freeform `reference` input and effective reference metadata in status and inspect output.

## 0.4.49

### Patch Changes

- 61022dd: Ignore `.codex` and `.oc-smoke` tool artifacts when deciding whether implementation produced a material git diff.
- Updated dependencies [61022dd]
  - @riddledc/riddle-proof@0.5.23

## 0.4.48

### Patch Changes

- Tighten proof authoring guidance for structured audio/data captures, including the correct Playwright wait timeout signature and how to persist browser-page proof evidence.

## 0.4.47

### Patch Changes

- Make OpenClaw proof inputs more forgiving by preserving invalid freeform `reference` text as metadata while ignoring it as a baseline selector, and expose whether background mode was requested or defaulted.
- Updated dependencies
  - @riddledc/riddle-proof@0.5.22

## 0.4.46

### Patch Changes

- Clarify detached monitor guidance so surfaces without `riddle_proof_wait` can poll `riddle_proof_status` using `monitor_should_continue`.

## 0.4.45

### Patch Changes

- Preserve query strings when capturing and matching proof routes so query-driven SPA pages are not misclassified as wrong-route captures.
- Updated dependencies
  - @riddledc/riddle-proof@0.5.21

## 0.4.44

### Patch Changes

- Report wrapper and dependency package metadata from status and inspect, and treat max-iteration blockers as terminal for monitor continuation.

## 0.4.43

### Patch Changes

- 1038a58: Record recon build and capture subphase timings and surface them in OpenClaw status and inspect timing summaries.
- Updated dependencies [1038a58]
  - @riddledc/riddle-proof@0.5.20

## 0.4.42

### Patch Changes

- b786722: Export explicit OpenClaw agent routing helpers for isolation-sensitive harnesses.

## 0.4.41

### Patch Changes

- d198e21: Treat an in-flight implementation attempt as a monitor hold state so detached monitors keep waiting for a real implementation outcome instead of surfacing the checkpoint as a generic retryable gap.

## 0.4.40

### Patch Changes

- f77204c: Retry the implementation Codex step once when the first successful response leaves no detectable git diff, and tighten the implementation prompt to require a git self-check before returning success.

## 0.4.39

### Patch Changes

- 8a53333: Clarify implement-gap reporting by distinguishing before-agent, during-agent, and after-agent no-diff states.

## 0.4.38

### Patch Changes

- 4771be7: Clarify implementation-gap status by surfacing implementation agent attempt telemetry and distinguishing pre-agent gaps from post-attempt no-diff cases.
- Updated dependencies [4771be7]
  - @riddledc/riddle-proof@0.5.19

## 0.4.37

### Patch Changes

- a4824b2: Persist and surface structured implement-gap diagnostics through the proof runtime and OpenClaw wrapper.
- Updated dependencies [a4824b2]
  - @riddledc/riddle-proof@0.5.18

## 0.4.36

### Patch Changes

- 968c52a: Expose verify artifact contract, production, and usage summaries through the proof assessment contract and OpenClaw inspection surfaces.
- Updated dependencies [968c52a]
  - @riddledc/riddle-proof@0.5.17

## 0.4.35

### Patch Changes

- 72f910a: Improve proof monitoring guidance and speed up verify builds.
- Updated dependencies [72f910a]
  - @riddledc/riddle-proof@0.5.16

## 0.4.34

### Patch Changes

- 538d58c: Add `riddle_proof_wait` for detached proof monitoring and expose an explicit monitor plan so callers can avoid ad hoc sleep loops around status polling.

## 0.4.33

### Patch Changes

- 450a53b: Preserve cached verify timing details in `riddle_proof_status` when the live engine snapshot is momentarily thinner than the final wake event payload.

## 0.4.32

### Patch Changes

- a32f02b: Emit real verify runtime phase events for build, capture, and assessment so status and inspect can report verify subphase timings on live proof runs.
- Updated dependencies [a32f02b]
  - @riddledc/riddle-proof@0.5.15

## 0.4.31

### Patch Changes

- 483d722: Tighten proof monitor poll cadence around resumable checkpoints and expose verify subphase timings in status and inspect output.

## 0.4.30

### Patch Changes

- e1f83e4: Treat resumable blocked checkpoints as non-terminal for terminal-only monitoring so wrappers keep holding replies through implementation and similar internal proof loops.

## 0.4.29

### Patch Changes

- 634bde7: Add explicit wrapper-side response gating for Riddle Proof runs. The public
  OpenClaw integration now accepts `report_mode: "terminal_only"` (or
  `wait_for_terminal: true`) and surfaces a structured `monitor_contract` in
  change, status, inspect, and wake outputs so detached monitors can keep polling
  until terminal state without relying on prompt wording.

## 0.4.28

### Patch Changes

- e555136: Honor learned root-path capture hints during recon so proof runs stop wasting retries on distracting route literals.
- Updated dependencies [e555136]
  - @riddledc/riddle-proof@0.5.14

## 0.4.27

### Patch Changes

- a6fbae0: Add timing summaries, opt-in debug status payloads, and reusable last-good capture hints for faster proof runs.
- Updated dependencies [a6fbae0]
  - @riddledc/riddle-proof@0.5.13

## 0.4.26

### Patch Changes

- 8564064: Expose semantic scratch cleanup status labels in OpenClaw proof status and inspect output, including skipped cleanup and removed worktree cases.

## 0.4.25

### Patch Changes

- 7b013d0: Surface Riddle Proof scratch cleanup status in OpenClaw status and inspect output, and block automatic ready review when structured proof evidence contains failed positive assertions.

## 0.4.24

### Patch Changes

- bba5a57: Prune stale proof scratch worktrees when local temp storage is low, and add clearer status diagnostics when an OpenClaw monitor passes a non-wrapper state path.
- Updated dependencies [bba5a57]
  - @riddledc/riddle-proof@0.5.12

## 0.4.23

### Patch Changes

- 65c5165: Add monitor-facing status fields so OpenClaw can continue through routable proof checkpoints instead of reporting intermediate states as final failures.
- Updated dependencies [65c5165]
  - @riddledc/riddle-proof@0.5.11

## 0.4.22

### Patch Changes

- b65fed0: Hold non-shipping proof runs at `ready_to_ship` after a ready proof assessment instead of re-entering verify or advancing toward ship.
- Updated dependencies [b65fed0]
  - @riddledc/riddle-proof@0.5.10

## 0.4.21

### Patch Changes

- 4cc0457: Normalize legacy OpenClaw plugin `defaultMaxIterations` values below 12 to the public proof-run minimum while preserving explicit per-run `max_iterations` overrides.

## 0.4.20

### Patch Changes

- 3cd4e9b: Give normal proof runs more default iteration runway while adding per-stage loop caps so recon, authoring, implementation, verification, and non-shipping auto-review can complete without allowing a bad phase to spin indefinitely.
- Updated dependencies [3cd4e9b]
  - @riddledc/riddle-proof@0.5.9

## 0.4.19

### Patch Changes

- 61f1218: Default proof-run scratch worktrees to local temp storage so dependency cache materialization does not crawl on shared workspace filesystems.
- Updated dependencies [61f1218]
  - @riddledc/riddle-proof@0.5.8

## 0.4.18

### Patch Changes

- b6206f2: Auto-advance main-agent proof review for non-shipping runs when proof inspection already marks the evidence as ready to ship.

## 0.4.17

### Patch Changes

- 0427377: Materialize cached Riddle Proof node_modules with hardlinks or copies instead of symlinks so server-preview tarballs cannot be rejected for symlinked dependency directories.
- Updated dependencies [0427377]
  - @riddledc/riddle-proof@0.5.7

## 0.4.16

### Patch Changes

- fb219e9: Cache Riddle Proof dependency installs across proof runs by package/lockfile fingerprint so repeated browser proof runs can reuse installed node_modules instead of reinstalling for each new worktree.
- Updated dependencies [fb219e9]
  - @riddledc/riddle-proof@0.5.6

## 0.4.15

### Patch Changes

- 8dee58c: Make OpenClaw proof runs background by default, skip useless shared dependency installs when the active workspace fingerprint does not match proof worktrees, reuse before-worktree dependencies for matching after worktrees, and expose richer status guidance for wake/watch monitoring.
- Updated dependencies [8dee58c]
  - @riddledc/riddle-proof@0.5.5

## 0.4.14

### Patch Changes

- 8ea62e9: Preserve real engine failure blockers during dry-run proofs and add dependency-install phase visibility during setup.
- Updated dependencies [8ea62e9]
  - @riddledc/riddle-proof@0.5.4

## 0.4.13

### Patch Changes

- 23f4ad4: Add proof workflow substep timing events and surface active engine substeps from OpenClaw status snapshots.
- Updated dependencies [23f4ad4]
  - @riddledc/riddle-proof@0.5.3

## 0.4.12

### Patch Changes

- bb14dbd: Run production background proof workflows in a worker thread so long-running recon, proof, and Codex subprocess work does not block the OpenClaw gateway from answering follow-up messages or status requests.

## 0.4.11

### Patch Changes

- 7f0d5f9: Fold the Riddle Proof checkpoint engine and bundled runtime into `@riddledc/riddle-proof`, and let the OpenClaw wrapper load that packaged engine by default instead of depending on a separate private runtime plugin.
- Updated dependencies [7f0d5f9]
  - @riddledc/riddle-proof@0.5.2

## 0.4.10

### Patch Changes

- c23a745: Move the Riddle Proof checkpoint engine and bundled runtime assets into the public integrations workspace, and label OpenClaw requests with the public `riddle_proof_change` tool name.
- Updated dependencies [c23a745]
  - @riddledc/riddle-proof@0.5.1

## 0.4.9

### Patch Changes

- f4c5ae2: Add generic authenticated proof inputs for OpenClaw wrappers: `auth_localStorage_json`, `auth_cookies_json`, and `auth_headers_json`.
- f2f7524: Add interface-agnostic background proof runs. `riddle_proof_change` now accepts
  `run_mode: "background"` (or plugin config `defaultRunMode: "background"`) to
  return a run state immediately while the proof continues in the gateway process.
  Background runs append a durable `run.wake.requested` event when they settle so
  Discord, Telegram, iMessage, CLI, or other OC surfaces can wake the originating
  session with the same status/inspect/review contract.
- Updated dependencies [f4c5ae2]
- Updated dependencies [7205bce]
  - @riddledc/riddle-proof@0.5.0

## 0.4.8

### Patch Changes

- Extend `riddle_proof_inspect` with structured proof evidence fields so
  non-visual modes like audio can surface proof evidence presence, samples,
  result keys, and data outputs in the same compact review packet.

## 0.4.7

### Patch Changes

- Add `riddle_proof_inspect`, a compact proof-native review helper that reads a
  wrapper run state and returns route match, profile usage, artifact URLs,
  visual delta, semantic anchors, visible text samples, and the recommended
  review next action.

## 0.4.6

### Patch Changes

- Extend `riddle_proof_sync` with `update_base_checkout`, a safe post-merge
  fast-forward request for clean local base checkouts. The underlying engine
  reports the base checkout path, branch, clean state, local/remote heads, and
  whether the update ran, skipped, or failed.
- Updated dependencies
  - @riddledc/riddle-proof@0.4.5

## 0.4.5

### Patch Changes

- Add `riddle_proof_sync`, an explicit public tool for reconciling shipped proof
  runs after PR review or merge. The sync path checks PR lifecycle state through
  the configured engine, records merge metadata, and supports post-merge cleanup
  without mutating cheap status reads.
- Updated dependencies
  - @riddledc/riddle-proof@0.4.4

## 0.4.3

### Patch Changes

- 09d79bb: Add an explicit draft-hold escape hatch, preserve it through the engine harness,
  and tighten main-agent proof review guidance for subtle visual changes.
- Updated dependencies [09d79bb]
  - @riddledc/riddle-proof@0.4.2

## 0.4.2

### Patch Changes

- 68b060c: Add main-agent proof review support for OpenClaw Riddle Proof runs.

  The reusable harness can now resume from explicit workflow params, and the
  OpenClaw wrapper can pause final proof judgment at a structured
  `main_agent_proof_review_required` checkpoint. A new `riddle_proof_review` tool
  submits the main agent's verdict and resumes the same run.

- Updated dependencies [68b060c]
  - @riddledc/riddle-proof@0.4.1

## 0.4.1

### Patch Changes

- 1dc946d: Tighten visual proof assessment guidance so subtle or unmeasured UI deltas are not marked ready without a clearly legible before/after change.

## 0.4.0

### Minor Changes

- 2ac69d1: Add an optional Codex exec agent adapter for engine-mode Riddle Proof runs.

## 0.3.0

### Minor Changes

- c3e55cb: Add the reusable Riddle Proof engine harness and OpenClaw status surface.

  The core package now exposes a checkpoint-driven harness for the existing
  `riddle-proof-run` engine, persistent run state, status snapshots, disabled
  agent-adapter blockers, and isolated-worktree safety checks before
  implementation can advance.

  The OpenClaw wrapper now exposes `riddle_proof_status` and can opt into engine
  mode with explicit runtime config while preserving the default blocked
  normalization behavior.

### Patch Changes

- Updated dependencies [c3e55cb]
  - @riddledc/riddle-proof@0.4.0

## 0.2.0

### Minor Changes

- fd7395c: Add hardening contracts for proof-run observability and safer execution: run ids,
  current stage tracking, worktree metadata, stage heartbeats, cheap status
  snapshots, preflight adapters, setup cleanup metadata, and explicit proof
  artifact roles.

### Patch Changes

- Updated dependencies [fd7395c]
  - @riddledc/riddle-proof@0.3.0

## 0.1.0

### Minor Changes

- bdcd00e: Add the Riddle Proof runner harness and the initial OpenClaw wrapper package for
  request normalization.

### Patch Changes

- Updated dependencies [bdcd00e]
  - @riddledc/riddle-proof@0.2.0
