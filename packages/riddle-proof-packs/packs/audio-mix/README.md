# audio-mix

Reusable Riddle Proof authoring guidance for browser apps that need objective audio evidence.

## Proof claims and evidence roles

- evidence_role: `current_target`
- atomic claim
  - claim: a running browser target exposes enough audio state and rendered metrics to support an objective mix-health verdict.
  - target: an app route with a small proof contract for selected song, mixer state, source readiness, and render metrics.
  - setup/actions: prepare the audio proof state, render a bounded offline window, capture a screenshot and compact metrics JSON, then classify the result.
  - evidence: route state, selected song, mixer/source state, mix peak/RMS/headroom, required track energy, console health, and artifact links.
  - verdict: pass when the objective guardrails hold; review when the evidence is real but taste/listening judgment remains.
- does not prove
  - that a mix sounds good to every listener.
  - mastering quality, room translation, or long-form musical arrangement quality.
  - backend audio asset correctness unless the profile explicitly checks source fetches and decode receipts.

## Intended use

Use this pack as the generic layer for audio proof packs. App-specific packs should copy the profile template, declare their evidence-role pattern, and record what each run does not prove.

The useful baseline is:

1. State a concrete audio claim.
2. Capture the route and app proof contract.
3. Render a short, deterministic audio window.
4. Assert no silence, no clipping, and required track energy.
5. Preserve a compact summary plus the full metrics artifact.
6. Classify failures as product behavior, profile calibration, app-contract gap, runtime environment, or human-review boundary.

## Narrow mixing heuristics

For claim-candidate loops, use section heuristics as review aids:

- compute a loudness-style value from rendered RMS when a full LUFS implementation is not available
- compare each baseline section with its candidate section
- report baseline energy, candidate energy, and delta
- report tracked-instrument energy movement for the requested or focused tracks
- preserve required section energy floors for instruments that must remain active
- reject candidates that violate clipping, headroom, or low-level guardrails

These heuristics support wording such as `metric-supported`, `guardrail-preserving`, and `ranked for review`. They do not prove that a candidate sounds better.
