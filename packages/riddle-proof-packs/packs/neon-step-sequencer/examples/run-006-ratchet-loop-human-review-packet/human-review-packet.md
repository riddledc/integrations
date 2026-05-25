# Neon Human Review Packet

- status: `candidate_ready_for_listening_review`
- domain: `audio_mix`
- evidence_role_pattern: `interaction_snapshots`
- requested_intent: turn the chord part down a little
- selected_song: Monkberry Moon Delight (Tab)

## Recommendation

- action: `review_before_applying_candidate`
- candidate: `chord -0.10`
- candidate_action: `set_mixer_level chord: 0.38 -> 0.28 (-0.1)`
- reason: All objective claim receipts passed for this candidate; ranking only orders listening review.

## Objective Receipts

- supported_candidates: `6`
- rejected_candidates: `0`
- state_restored_after_loop: `true`
- candidate_actions_are_transient: `true`
- no_permanent_edit_unless_apply_best: `true`
- approved_candidate_applied: `not captured`
- approval_mode: `not captured`
- approval_basis: not captured

## Ranking

- metric: `objective_mix_health_penalty`
- role: `review_order_only`
- lower_is_better: `true`
- baseline: `28.8336`
- best: `27.0709`
- delta: `1.7626`

## Supported Candidates

| Candidate | Action | Target Movement | Receipts | Ranking |
| --- | --- | --- | --- | --- |
| chord -0.10 | set_mixer_level chord: 0.38 -> 0.28 (-0.1) | chord: rms -0.0012, peak -0.0088, energy 0 | pass (6) | 27.0709 |
| bass -0.18 | set_mixer_level bass: 0.62 -> 0.44 (-0.18) | bass: rms -0.0163, peak -0.0535, energy -0.0003 | pass (6) | 27.4894 |
| chord +0.12 | set_mixer_level chord: 0.38 -> 0.5 (0.12) | chord: rms 0.002, peak 0.0105, energy 0 | pass (6) | 28.5162 |
| bass -0.10 | set_mixer_level bass: 0.62 -> 0.52 (-0.1) | bass: rms -0.0094, peak -0.0297, energy -0.0002 | pass (6) | 29.17 |
| bass +0.12 | set_mixer_level bass: 0.62 -> 0.74 (0.12) | bass: rms 0.0112, peak 0.0356, energy 0.0003 | pass (6) | 31.7993 |
| bass +0.20 | set_mixer_level bass: 0.62 -> 0.82 (0.2) | bass: rms 0.0187, peak 0.0594, energy 0.0005 | pass (6) | 35.2559 |

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
