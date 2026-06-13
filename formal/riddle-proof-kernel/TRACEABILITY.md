# Riddle Proof Contract Traceability

This file maps Riddle Proof JSON contracts to the code, tests, and Lean model
that protect them.

Lean is used for semantic contract checks: obligation preservation, trust
boundaries, verdict ordering, and final pass/ship gates. JSON Schema,
TypeScript/Python validators, golden packets, and runtime tests remain
responsible for concrete field shape, parsing, browser truth, filesystem
effects, and CDN/network behavior.

## Maintenance Rule

When a Riddle Proof contract changes, update the relevant row below.

Every Lean theorem that describes product behavior must have one of these:

- a linked runtime conformance test against the real implementation
- an explicit note that it is only a helper/model lemma

Every runtime conformance test added from a Lean counterexample should name the
contract surface it protects.

## Contract Map

| Contract surface | Producer | Consumer | Current runtime guard | Lean coverage | Notes |
| --- | --- | --- | --- | --- | --- |
| `riddle-proof.profile.v1` | user/authored profile, examples, CLI input | profile normalizer and runner | `packages/riddle-proof/src/profile.ts`; profile smoke coverage in `packages/riddle-proof/test.js`; `packages/riddle-proof/formal-conformance.test.js` | `AuthoredProfile`, `NormalizedProfile`, `authoredRequirementsPreserved`, `process_passed_implies_authoring_preserved` | Semantic obligation: source artifact requirements must survive normalization. |
| `riddle-proof.profile-evidence.v1` | profile runner / browser capture | profile evaluator and aggregate result generation | `assessRiddleProofProfileEvidence` in `packages/riddle-proof/src/profile.ts`; `packages/riddle-proof/formal-conformance.test.js` | `VerdictInput`, `verdict`, `passed_excludes_missing_required_artifact`, verdict dominance theorems | Semantic obligation: evidence cannot become `passed` when required evidence/checks are missing or failed. |
| Artifact manifest / `riddle-proof-local-runner-manifest.v1` | Playwright runner artifact store and hosted/direct result adapters | profile evaluator, proof summaries, ship evidence bundle | `packages/riddle-proof-runner-playwright/src/artifacts/*`; `packages/riddle-proof/formal-conformance.test.js`; runner package smoke test | `ArtifactManifest`, `applyArtifactCompletenessFromManifest`, `known_manifest_passed_excludes_missing_required_artifact`, `direct_after_fix_passed_excludes_missing_required_artifact` | Semantic obligation: `unknown` and known-empty manifests are different states; known-empty cannot erase missing required artifacts. |
| Recon obligations and baselines | `runtime/lib/recon.py`, proof-run engine recon stage | author/verify/ship stages | `packages/riddle-proof/proof-run.test.js`; `packages/riddle-proof/runtime/tests/recon_verify_smoke.py`; regression packs | `ReconPlan`, `processRequiredArtifacts`, `authoring_gap_is_insufficient`, `missing_recon_gate_allows_pass_without_ship_gate` | Semantic obligation: recon-required artifacts and baseline readiness are obligations, not proof by themselves. |
| Checkpoint packet / `riddle-proof.checkpoint.v1` | checkpoint engine and run harness | CLI checkpoint command, supervising agent, wrappers | `packages/riddle-proof/src/checkpoint.ts`; `packages/riddle-proof/formal-conformance.test.js`; `packages/riddle-proof/trust-boundary.test.js`; `packages/riddle-proof/regression-packs.test.js` | `CheckpointPacket`, `checkpointResponseOutcome`, `accepted_response_has_matching_advertised_packet`, `stale_checkpoint_lineage_requires_lineage_guard`, `unadvertised_recon_response_was_accepted_without_allowed_guard`, `unadvertised_retry_stage_was_accepted_without_allowed_guard` | Semantic obligation: packet `allowed_decisions` must advertise every decision accepted by the active checkpoint continuation path, and packet lineage must identify the exact active packet instance being answered. |
| Checkpoint response / `riddle-proof.checkpoint_response.v1` | supervising agent or human checkpoint input | proof-run engine and CLI checkpoint resume | `packages/riddle-proof/src/checkpoint.ts`; `packages/riddle-proof/src/engine-harness.ts`; `packages/riddle-proof/formal-conformance.test.js`; `packages/riddle-proof/trust-boundary.test.js`; regression packs | `CheckpointResponse`, `ready_to_ship_without_packet_ignores_nonduplicate_response`, `completed_without_packet_ignores_nonduplicate_response`, `duplicate_response_blocks_before_final_ignore`, `accepted_response_has_matching_advertised_packet`, `checkpoint_lifecycle_summary_projects_state`, `ignored_response_preserves_lifecycle_state`, `pending_packet_without_response_has_no_token_match_verdict`, `forged_author_packet_recon_response_requires_allowed_guard`, `stale_checkpoint_lineage_requires_lineage_guard` | Semantic obligation: only matching, advertised active-packet responses can advance; stale terminal responses are ignored without becoming accepted history, stale packet-lineage responses block before resume, duplicates are blocked, summary counts distinguish accepted/rejected/duplicate/ignored responses, and token-match verdicts require an actual response comparison. |
| `proof_assessment_request` | verify stage and proof-run core | supervising agent and ship gate | `packages/riddle-proof/src/proof-run-core.ts`; `packages/riddle-proof/runtime/lib/verify.py`; `packages/riddle-proof/runtime/tests/recon_verify_smoke.py`; `packages/riddle-proof/trust-boundary.test.js` | `WholeFlowState`, hard-blocker and visual-delta fields in `wholeFlowShipGateOk` | Semantic obligation: hard blockers, unmeasured visual deltas, and incomplete capture requests block final pass/ship. |
| `proof_assessment_json` / `proof_assessment` | supervising agent | proof-run core, ship gate, runtime ship script | `validateShipGate` and proof-assessment stage normalization in `packages/riddle-proof/src/proof-run-core.ts`; `packages/riddle-proof/src/engine-harness.ts`; `packages/riddle-proof/runtime/lib/ship.py`; `packages/riddle-proof/formal-conformance.test.js`; `packages/riddle-proof/trust-boundary.test.js` | `ProofAssessmentSource`, `ProofAssessmentDecision`, `ProofAssessmentRouting`, `proof_assessment_requests_ship_implies_ready_decision`, `contradictory_stage_hint_does_not_request_ship`, `runner_assessment_allows_pass_without_ship_gate`, `reported_whole_flow_passed_implies_ship_gate_ok` | Semantic obligation: only supervising-agent `ready_to_ship` can satisfy the final gate; runner-sourced readiness is not enough; advisory stage fields cannot override the proof-assessment decision. |
| Run state and run card / `riddle-proof.run-card.v1` | proof-run engine and wrapper harness | status surfaces, GitHub/CLI/host renderers | `packages/riddle-proof/src/state.ts`; `packages/riddle-proof/src/run-card.ts`; `packages/riddle-proof/proof-run.test.js`; `packages/riddle-proof/formal-conformance.test.js` | `RunLifecycleState`, `RunCardSummary`, `run_card_projects_state`, `run_result_run_card_projects_state`, `independent_run_card_can_invent_success`, `projected_run_card_rejects_forged_success` | Semantic obligation: public status surfaces project durable state and cannot reuse stale embedded run cards to invent a different status. |
| Public proof state summary | `packages/riddle-proof/src/public-state.ts` | PR comments, hosted proof views, agent wrappers, status monitors | `packages/riddle-proof/test.js`; `packages/riddle-proof/formal-conformance.test.js` | `PublicStateInput`, `publicStateSummary`, `public_held_ready_no_ship_blocks_public_handoff`, `public_handoff_ready_can_merge_without_ship_authorization`, `public_blocked_handoff_dominates_stale_completed_status`, `public_checkpoint_audit_counters_require_disclosure` | Semantic obligation: public state projections distinguish handoff readiness from ship authorization, suppress stale success-shaped fields under blocked/checkpoint/no-ship states, and disclose checkpoint audit counters. |
| Public-state consumer surfaces | `packages/riddle-proof/src/public-state.ts`; proof-run result JSON | PR comments, run cards, run results, hosted proof views, agent wrappers, status monitors | `packages/riddle-proof/src/pr-comment.ts`; `packages/riddle-proof/src/run-card.ts`; `packages/riddle-proof/src/state.ts`; `packages/riddle-proof/src/result.ts`; `packages/riddle-proof/test.js`; `packages/riddle-proof/formal-conformance.test.js` | `PublicConsumerSurface`, `publicConsumerSurfaceConforms`, `public_consumer_surface_from_state_conforms`, `generated_run_status_surface_from_public_state_conforms`, `stale_merge_recommendation_consumer_violates_held_public_state`, `stale_run_status_surface_violates_held_public_state`, `missing_checkpoint_audit_consumer_violates_public_state` | Semantic obligation: downstream surfaces must be generated from public-state booleans/disclosures and must not reintroduce prohibited success, merge, sync, ship, or checkpoint-completeness claims. |
| Ship gate state | proof-run core and runtime scripts | final report, ship script, PR/comment publication | `validateShipGate`; `packages/riddle-proof/runtime/lib/ship.py`; TypeScript/Python parity cases in `packages/riddle-proof/formal-conformance.test.js`; `packages/riddle-proof/runtime/tests/ship_artifact_publication.py` | `wholeFlowShipGateOk`, `whole_flow_passed_implies_ship_gate_ok`, `reported_whole_flow_passed_implies_ship_gate_ok`, `ship_gate_projection_parity_implies_ok_agreement`, `runtime_projection_without_reference_or_hard_blockers_can_disagree` | Semantic obligation: final `passed`/ship requires baselines, after evidence, captured verify status, supervisor assessment, no hard blockers, and complete artifact manifest; implementation surfaces must agree on those semantic gate fields. |
| Published proof artifacts and public report | ship runtime, artifact publication | GitHub comments, hosted Riddle views, downstream consumers | `packages/riddle-proof/runtime/tests/ship_artifact_publication.py`; regression packs | `PublicShipReport`, `public_report_from_flow_pass_implies_ship_gate_ok`, `status_only_public_report_can_invent_pass` | Semantic obligation: a published pass report must project the same ship-gate facts as internal `reportedWholeFlowVerdict`; status-only public reports cannot independently invent success. |

## Lean To Runtime Coverage

| Lean property or counterexample | Runtime coverage | Contract protected |
| --- | --- | --- |
| `missing_required_artifact_is_insufficient` and `passed_excludes_missing_required_artifact` | `formal-conformance.test.js` complete artifact pass and known-empty artifact failure | profile evidence plus artifact completeness |
| `current_impl_passes_with_missing_required_artifact` | fixed by runtime artifact-completeness handling; guarded by `formal-conformance.test.js` | missing required artifacts must not pass |
| `erasing_known_empty_manifest_allows_direct_pass` | `formal-conformance.test.js` passes `artifacts: []` and expects `proof_insufficient` | direct/sync artifact manifest ingestion |
| `missing_authoring_guard_passes_after_erasing_required_artifact` | profile normalization and artifact requirement checks in `formal-conformance.test.js`; broader profile tests in `test.js` | authored profile obligations survive normalization |
| `missing_recon_guard_passes_with_unwitnessed_required_recon_artifact` | `proof-run.test.js` and `runtime/tests/recon_verify_smoke.py` recon/verify evidence bundle checks | recon obligations flow into evaluation |
| `missing_recon_gate_allows_pass_without_ship_gate` | `validateShipGate` cases in `formal-conformance.test.js`; proof-run ship-gate tests | final pass requires recon baselines |
| `missing_verify_gate_allows_pass_without_ship_gate` | `formal-conformance.test.js` `verify_status = capture_incomplete` gate check | final pass requires captured verify evidence |
| `runner_assessment_allows_pass_without_ship_gate` | `formal-conformance.test.js` runner-sourced ready check | final pass requires trusted supervisor assessment |
| `proof_assessment_requests_ship_implies_ready_decision` and `contradictory_stage_hint_does_not_request_ship` | `formal-conformance.test.js` proof-assessment stage normalization checks; `trust-boundary.test.js` contradictory `needs_richer_proof` plus `ship` checkpoint response case | proof-assessment decisions, not advisory stage hints, determine ship readiness and continuation stage |
| `unknown_artifact_manifest_blocks_even_without_ship_gate` | artifact manifest completeness tests and runner smoke | unknown/absent artifact manifest cannot silently satisfy completeness |
| `accepted_response_has_matching_advertised_packet` | `formal-conformance.test.js` checkpoint decision enum/allowed decision alignment and packet lineage checks | active checkpoint responses must match identity, resume token, packet lineage, and advertised decisions |
| `unadvertised_recon_response_was_accepted_without_allowed_guard` | `formal-conformance.test.js` recon `needs_recon` allowed/template check | recon checkpoint continuation must not accept hidden decisions |
| `unadvertised_retry_stage_was_accepted_without_allowed_guard` | `formal-conformance.test.js` default/ship `retry_stage` allowed/schema checks | generic checkpoint continuation must not accept hidden retry decisions |
| `forged_author_packet_recon_response_requires_allowed_guard` | `trust-boundary.test.js` forged recon `author_packet` response rejection | direct JSON checkpoint responses must not bypass the packet's advertised decision list |
| `stale_checkpoint_lineage_requires_lineage_guard` | `trust-boundary.test.js` stale `packet_id` response rejection; `formal-conformance.test.js` packet ID/template/summary checks | direct JSON checkpoint responses must answer the exact active packet instance, not only the same checkpoint token |
| `checkpoint_lifecycle_summary_projects_state`, `accepted_advancing_response_clears_pending_packet`, `accepted_blocking_response_retains_pending_packet`, `rejected_response_preserves_lifecycle_state`, `ignored_response_preserves_lifecycle_state`, and `duplicate_response_does_not_increment_response_count` | `formal-conformance.test.js` checkpoint lifecycle summary cases; `trust-boundary.test.js` late ignored terminal response cases; `proof-run.test.js` blocked duplicate checkpoint test | checkpoint summary must distinguish pending packets, accepted responses, rejected blockers, ignored terminal responses, and duplicate responses |
| `clearing_blocking_response_loses_pending_packet`, `counting_rejected_response_inflates_accepted_count`, and `counting_ignored_response_inflates_accepted_count` | `formal-conformance.test.js` blocking/rejected/ignored summary cases; `trust-boundary.test.js` repeated stale terminal response cases | blocking responses retain pending packets; rejected and ignored responses must not become accepted response history |
| `pending_packet_without_response_has_no_token_match_verdict`, `matching_response_token_reports_true`, and `mismatched_response_token_reports_false` | `formal-conformance.test.js` pending and accepted checkpoint summary token cases | checkpoint summary token-match verdicts must distinguish no response from an observed token mismatch |
| `protected_terminal_run_status_finalizes` and `finalized_protected_state_preserves_nonfinal_incoming` | engine harness terminal/finalized behavior plus trust-boundary stale response tests | finalized protected runs must not reopen from stale lower-priority state |
| `finalized_ready_to_ship_allows_shipped_transition` | proof-run/ship lifecycle tests | `ready_to_ship -> shipped` remains the allowed finalized progression |
| `run_card_projects_state` and `run_result_run_card_projects_state` | `formal-conformance.test.js` status loop over all `RiddleProofStatus` values | run cards and results must project durable status, terminal, and success predicates |
| `independent_run_card_can_invent_success` and `projected_run_card_rejects_forged_success` | `formal-conformance.test.js` stale-card snapshot regression | snapshots must regenerate run cards from current state rather than trusting stale embedded cards |
| `public_held_ready_no_ship_blocks_public_handoff`, `public_no_ship_handoff_blocks_public_handoff`, `public_handoff_ready_can_merge_without_ship_authorization`, and `public_blocked_handoff_dominates_stale_completed_status` | `formal-conformance.test.js` public-state projection matrix; `test.js` public-state export and PR comment cases | public summaries must distinguish ship authorization from handoff readiness and must suppress stale success-shaped claims under held, no-ship, and blocked handoff states |
| `public_checkpoint_audit_counters_require_disclosure` | `formal-conformance.test.js` public checkpoint audit summary case; `test.js` held PR comment checkpoint counters | public summaries must disclose rejected/ignored/duplicate checkpoint counters and prohibit claiming all checkpoint responses were accepted |
| `public_consumer_surface_from_state_conforms`, `generated_run_status_surface_from_public_state_conforms`, `stale_merge_recommendation_consumer_violates_held_public_state`, `stale_run_status_surface_violates_held_public_state`, and `missing_checkpoint_audit_consumer_violates_public_state` | `formal-conformance.test.js` PR-comment plus run-card/status/result consumer cases; `test.js` held, handoff-ready, blocked PR comment, and result-shape cases | public consumers must derive handoff/status claims from public state and suppress stale merge recommendations under prohibited claims |
| `public_report_from_flow_pass_implies_ship_gate_ok` and `status_only_public_report_can_invent_pass` | `runtime/tests/ship_artifact_publication.py` public ship report gate projection and Python ship hard-blocker/reference rejection | published proof reports must expose ship-gate facts and cannot claim pass from a status-only surface |
| `ship_gate_projection_parity_implies_ok_agreement` and `runtime_projection_without_reference_or_hard_blockers_can_disagree` | `formal-conformance.test.js` TypeScript/Python ship-gate parity matrix | TypeScript engine gates and Python public report gates must agree on semantic blocker fields |

## When To Add Lean

Add Lean when the question is semantic:

- Can an obligation be dropped while moving from one contract to another?
- Can an incomplete or failed packet still collapse to `passed`?
- Does one blocker dominate another verdict in the intended order?
- Is a final report tied to the same facts as the ship gate?
- Is an untrusted source prevented from satisfying a trusted decision?
- Can a checkpoint response advance when its decision was not advertised by the
  active packet?
- Can a checkpoint response advance when it targets an older packet instance
  with the same run/checkpoint/resume token?
- Do checkpoint lifecycle counters distinguish accepted responses, rejected
  blockers, and duplicate replays?
- Does a summary field report an observed comparison, or merely the absence of
  data needed for that comparison?

Do not add Lean for plain shape validation or environmental facts:

- field spelling and JSON syntax
- Playwright, browser, DOM, screenshot, or CDN truth
- filesystem writes and artifact uploads
- npm packaging and CLI argument parsing

Those belong in runtime validators, schemas, packet fixtures, package tests, and
end-to-end Riddle Proof runs.
