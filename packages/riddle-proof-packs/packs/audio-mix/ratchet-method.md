# Audio Mix Ratchet Method

The audio ratchet is:

1. State a claim.
2. Run the proof.
3. Preserve evidence.
4. Classify the failure.
5. Change the smallest user-controlled layer.
6. Rerun with a sharper claim.
7. Extract reusable pack guidance.

For creative edits, add an explicit handoff gate before any durable source/config change:

1. Generate bounded candidates.
2. Keep ranking as review order only.
3. Emit a human-review packet.
4. Apply a candidate only when approval is explicit.
5. Generate a durable candidate patch plan from the applied packet.
6. Make the scoped source/config edit.
7. Rerun a `current_target` proof that verifies the app sees the durable state.

This proves the change claim and the durable application path. It still does not prove subjective mix quality.

## Smallest layer order

Prefer changes in this order:

1. Profile JSON: route, fixture, viewport, render window, threshold.
2. Proof pack docs/template: reusable language or receipt shape.
3. App proof contract: expose a stable diagnostic helper.
4. App fixture data: provide a deterministic proof window.
5. Artifact summary/rubric: make evidence easier to review.
6. Riddle Proof core: only when a missing primitive is general across apps.

## Evidence-role naming

Use `current_target` for audit/no-diff proof, `reference_candidate` for change proof across targets, and `interaction_snapshots` for pre-action/post-action evidence inside one run. Avoid using "before/after" by itself in user-facing docs.
