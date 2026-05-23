# gameplay-window-call-until

Gameplay Window Call Until proof pack profile. Include this profile JSON directly in any profile-mode execution path.

## Proof claims and evidence roles

- evidence_role: `interaction_snapshots`
- atomic claim
  - claim: gameplay runtime responds to input and can be proven with pre-action and post-action checkpoints.
  - target: `/games/example` gameplay route.
  - setup/actions: initialize and wait for readiness, capture ready state, then perform input actions and poll for progressing game state.
  - evidence: canvas signatures, route/load checks, state assertions (`window_call_until` progression), and clean console.
  - verdict: pass when expected in-run game state transitions are observed before the timeout window.
- does not prove
  - deterministic behavior across all user inputs.
  - success conditions outside the targeted route.
  - full game logic correctness or backend matchmaking integrity.

## Usage

Load the profile JSON from `profile.json` and supply it to profile mode or a local runner input file.
