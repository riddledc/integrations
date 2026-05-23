# canvas-gameplay

Canvas Gameplay proof pack profile. Include this profile JSON directly in any profile-mode execution path.

## Proof claims and evidence roles

- evidence_role: `interaction_snapshots`
- atomic claim
  - claim: gameplay route can be entered, controlled, and rendered through a canvas while remaining stable.
  - target: `/games/example` gameplay route.
  - setup/actions: clear storage, wait for game canvas, install game proof reader, inject a few input actions, and capture pre-action and post-action proof states.
  - evidence: canvas signatures, in-run window values, screenshots, route/visibility checks, and clean console.
  - verdict: pass when movement/interaction and runtime state progress are observed without errors.
- does not prove
  - long-game correctness, scoring fairness, or anti-cheat outcomes.
  - cross-device gameplay parity beyond the exercised viewport set.
  - backend game logic correctness independent of UI rendering.

## Usage

Load the profile JSON from `profile.json` and supply it to profile mode or a local runner input file.
