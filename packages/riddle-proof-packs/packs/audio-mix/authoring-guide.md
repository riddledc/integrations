# Audio Mix Authoring Guide

Audio proof works best when the claim is objective. Do not ask the browser to prove that a mix is good. Ask whether a running app can prove no silence, no clipping, expected track energy, UI/render agreement, and a useful listening handoff.

## Start with a small claim

Use a short render window and one route before expanding the matrix. A good first claim is:

> The current target can expose selected song, mixer state, source readiness, and one rendered metrics receipt without clipping or silence.

## Keep the app contract small

The app contract should expose only redacted diagnostic state:

- selected song or fixture id
- current route
- mixer state
- source readiness
- playback state
- offline render metrics
- optional proof-preparation helper

Do not expose secrets, user tokens, private song data, or full audio buffers.

## Calibrate windows before thresholds

If a required track has no energy, first check whether the rendered bars actually contain that instrument. Many apparent audio failures are profile-calibration failures: wrong bars, wrong song fixture, wrong mix preset, or a muted trainer state.

## Preserve both summary and detail

The terminal summary should stay compact. Full per-frame or per-band metrics belong in `proof.json` or a named JSON artifact. A proof pack should explain which fields a reviewer should read first.

## Human review boundary

Objective proof can say the mix is not silent, not clipped, and changed in the intended direction. It cannot replace listening judgment. When taste matters, include a human-review rubric and mark the proof as evidence for review rather than final truth.
