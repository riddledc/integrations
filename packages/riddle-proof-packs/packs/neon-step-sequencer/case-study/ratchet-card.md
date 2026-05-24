# Neon Ratchet Card

## Thesis

We used Neon Step Sequencer to prove the new Riddle Proof architecture: not by replaying old bugs, but by creating a new proof pack and letting it discover what the next useful proof should be.

## Tagline

The ratchet is not a pass. The ratchet is the next sharper question.

## Starting claim

When the user applies a mix change in Neon Step Sequencer, the visible mixer state, app proof contract, and rendered offline audio metrics should agree.

## User-controlled layers

- profile JSON
- proof pack template
- thresholds and metrics config
- app proof contract
- app diagnostic helper
- fixture data
- runner selection
- artifact summary
- human-review rubric

## Public value

The project shows that a complex audio app can improve proof confidence mostly by editing proof packs, profiles, and app contracts, not Riddle Proof core.

## Demonstrated runs

- Run 001: a `current_target` audit connected the Neon route, proof contract, source readiness, and offline mix-health metrics.
- Run 002: an `interaction_snapshots` proof showed a bass-level edit moving bass RMS from `0.0507` to `0.1071` and mix RMS from `0.073` to `0.1264` without clipping.
- Run 003: a `current_target` matrix passed across desktop, phone, iPad Mini, and iPad with `0 px` horizontal overflow.

## Honest boundary

These runs prove objective claims about a running app target. They do not prove that the mix is tasteful, that every song section is healthy, or that a release candidate is better than production. Those are separate proof claims with separate evidence roles.
