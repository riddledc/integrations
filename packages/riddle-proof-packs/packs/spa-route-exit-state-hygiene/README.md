# spa-route-exit-state-hygiene

Spa Route Exit State Hygiene proof pack profile. Include this profile JSON directly in any profile-mode execution path.

## Proof claims and evidence roles

- evidence_role: `interaction_snapshots`
- atomic claim
  - claim: route-local state is established on entry and removed after navigation cleanup.
  - target: `/games/example?proof=1` and the resulting home route after exit.
  - setup/actions: capture pre-action active-route state, navigate home, then capture post-action cleanup state.
  - evidence: pre/post runtime globals, screenshots at route-active/route-exit boundaries, DOM/route checks, and console warnings/fatal checks.
  - verdict: pass when route state remains active only while expected and stale state is not retained after exit.
- does not prove
  - that all routes share the same cleanup contract.
  - backend persistence cleanup or cache invalidation guarantees.
  - security boundaries across route transitions.

## Usage

Load the profile JSON from `profile.json` and supply it to profile mode or a local runner input file.
