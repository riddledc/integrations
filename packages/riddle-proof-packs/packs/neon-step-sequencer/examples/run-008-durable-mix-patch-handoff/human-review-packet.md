# Neon Human Review Packet

- status: `candidate_applied_for_listening_review`
- domain: `audio_mix`
- evidence_role_pattern: `interaction_snapshots`
- requested_intent: turn the chord part down a little
- selected_song: Monkberry Moon Delight (Tab)

## Recommendation

- action: `listen_to_applied_candidate`
- candidate: `chord -0.10`
- candidate_action: `set_mixer_level chord: 0.38 -> 0.28 (-0.1)`
- reason: All objective claim receipts passed for this candidate; ranking only orders listening review.

## Objective Receipts

- supported_candidates: `6`
- rejected_candidates: `0`
- state_restored_after_loop: `true`
- candidate_actions_are_transient: `false`
- no_permanent_edit_unless_apply_best: `false`
- approved_candidate_applied: `true`
- approval_mode: `mixing_canon_surrogate`
- approval_basis: subtle level reduction after objective receipts pass; this keeps development moving while preserving a listening-review caveat

## Ranking

- metric: `objective_mix_health_penalty`
- role: `review_order_only`
- lower_is_better: `true`
- baseline: `28.8336`
- best: `27.0708`
- delta: `1.7628`

## Boundary

Objective receipts support or reject candidate change claims; musical taste still requires listening review.

## Listening Prompts

- Does the supported candidate match the requested musical intent?
- Is the changed part better balanced in the proof window?
- Did the proof window contain the musical material being judged?
- Would another section or speaker profile change the listening decision?

## Caveats

- This packet does not prove subjective mix quality.
- A supported candidate proves objective receipts and guardrails only.
- Ranking orders review; it is not a taste score.
- Keep or apply the candidate only after listening review.
