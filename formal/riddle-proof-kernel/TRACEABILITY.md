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
| Checkpoint packet / `riddle-proof.checkpoint.v1` | checkpoint engine and run harness | CLI checkpoint command, supervising agent, wrappers | `packages/riddle-proof/src/checkpoint.ts`; `packages/riddle-proof/trust-boundary.test.js`; `packages/riddle-proof/regression-packs.test.js` | not modeled deeply yet | Future Lean candidate: late/stale checkpoint responses cannot mutate terminal `ready_to_ship` or completed states. |
| Checkpoint response / `riddle-proof.checkpoint_response.v1` | supervising agent or human checkpoint input | proof-run engine and CLI checkpoint resume | `packages/riddle-proof/src/checkpoint.ts`; `packages/riddle-proof/trust-boundary.test.js`; regression packs | not modeled deeply yet | Future Lean candidate: only allowed decisions for the active checkpoint can advance the modeled stage. |
| `proof_assessment_request` | verify stage and proof-run core | supervising agent and ship gate | `packages/riddle-proof/src/proof-run-core.ts`; `packages/riddle-proof/runtime/lib/verify.py`; `packages/riddle-proof/runtime/tests/recon_verify_smoke.py`; `packages/riddle-proof/trust-boundary.test.js` | `WholeFlowState`, hard-blocker and visual-delta fields in `wholeFlowShipGateOk` | Semantic obligation: hard blockers, unmeasured visual deltas, and incomplete capture requests block final pass/ship. |
| `proof_assessment_json` / `proof_assessment` | supervising agent | proof-run core, ship gate, runtime ship script | `validateShipGate` in `packages/riddle-proof/src/proof-run-core.ts`; `packages/riddle-proof/runtime/lib/ship.py`; `packages/riddle-proof/formal-conformance.test.js` | `ProofAssessmentSource`, `ProofAssessmentDecision`, `runner_assessment_allows_pass_without_ship_gate`, `reported_whole_flow_passed_implies_ship_gate_ok` | Semantic obligation: only supervising-agent `ready_to_ship` can satisfy the final gate; runner-sourced readiness is not enough. |
| Run state and run card / `riddle-proof.run-card.v1` | proof-run engine and wrapper harness | status surfaces, GitHub/CLI/host renderers | `packages/riddle-proof/src/run-card.ts`; `packages/riddle-proof/proof-run.test.js` | indirectly covered by process/whole-flow model | Future Lean candidate: terminal report status is a projection of a gated state, not an independent pass bit. |
| Ship gate state | proof-run core and runtime scripts | final report, ship script, PR/comment publication | `validateShipGate`; `packages/riddle-proof/runtime/lib/ship.py`; `packages/riddle-proof/formal-conformance.test.js`; `packages/riddle-proof/runtime/tests/ship_artifact_publication.py` | `wholeFlowShipGateOk`, `whole_flow_passed_implies_ship_gate_ok`, `reported_whole_flow_passed_implies_ship_gate_ok` | Semantic obligation: final `passed`/ship requires baselines, after evidence, captured verify status, supervisor assessment, no hard blockers, and complete artifact manifest. |
| Published proof artifacts and public report | ship runtime, artifact publication | GitHub comments, hosted Riddle views, downstream consumers | `packages/riddle-proof/runtime/tests/ship_artifact_publication.py`; regression packs | not modeled deeply yet | Future Lean candidate: a published pass report must imply the same ship-gate facts as internal `reportedWholeFlowVerdict`. |

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
| `unknown_artifact_manifest_blocks_even_without_ship_gate` | artifact manifest completeness tests and runner smoke | unknown/absent artifact manifest cannot silently satisfy completeness |

## When To Add Lean

Add Lean when the question is semantic:

- Can an obligation be dropped while moving from one contract to another?
- Can an incomplete or failed packet still collapse to `passed`?
- Does one blocker dominate another verdict in the intended order?
- Is a final report tied to the same facts as the ship gate?
- Is an untrusted source prevented from satisfying a trusted decision?

Do not add Lean for plain shape validation or environmental facts:

- field spelling and JSON syntax
- Playwright, browser, DOM, screenshot, or CDN truth
- filesystem writes and artifact uploads
- npm packaging and CLI argument parsing

Those belong in runtime validators, schemas, packet fixtures, package tests, and
end-to-end Riddle Proof runs.
