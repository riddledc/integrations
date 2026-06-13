# Riddle Proof Lean Kernel

This is a sidecar formal model for Riddle Proof framework verification. It
does not run in the evidence collection path; it checks framework contracts
against the Riddle Proof code and runtime tests.

The model in `RiddleProofKernel.lean` now has eight named layers.

`TRACEABILITY.md` maps the modeled contract obligations back to the real JSON
surfaces, runtime tests, and source files that protect them.

## Layer 1: Verdict Kernel

The Layer 1 model has two verdict functions:

- `currentProfileStatusFromEvidence` mirrors the current Riddle Proof
  `profileStatusFromEvidence` shape inspected in `profile.ts`.
- `verdict` is the contract-level patched shape where missing required
  artifacts are part of the verdict input.

The contract-level verdict proves:

- missing evidence, missing viewports, or missing checks is `proofInsufficient`
- navigation errors dominate as `environmentBlocked`
- missing expected viewport coverage is `proofInsufficient`
- missing required artifacts is `proofInsufficient`
- human-review checks outrank failed checks
- failed checks become `productRegression`
- only clean, complete evidence can become `passed`

This does not prove that a browser trace, screenshot, or DOM dump is truthful.
It proves the narrower framework invariant: once evidence has been summarized
into this shape, the status function cannot label incomplete or failed evidence
as `passed`.

## Layer 1.5: Artifact Manifest Ingestion

The Layer 1.5 model covers the wrapper around the verdict kernel. It separates
two states that must not be conflated:

- `ArtifactManifest.unknown`: the runtime has not supplied an artifact manifest.
- `ArtifactManifest.known []`: the runtime supplied a manifest, and it has no
  artifact refs.

This mirrors the direct/sync hosted result bug fixed in
`@riddledc/riddle-proof@0.8.45`: an empty collected artifact list was being
converted to `undefined`, which skipped completeness checking. The Lean model
now has:

- `known_manifest_passed_excludes_missing_required_artifact`
- `direct_after_fix_passed_excludes_missing_required_artifact`
- `erasing_known_empty_manifest_allows_direct_pass`

The last theorem is the executable counterexample for the pre-fix wrapper:
erasing a known empty manifest back to unknown lets an otherwise clean direct
result pass without required artifact refs.

## Layer 2: Process Boundary

The Layer 2 model adds the upstream Riddle Proof-owned process pieces without
trying to prove the outside world:

- `AuthoredProfile`: source-level profile requirements.
- `NormalizedProfile`: the normalized profile handoff.
- `ReconPlan`: required recon/planning evidence obligations.
- `RuntimePacket`: adapter-summarized runtime observations and artifacts.
- `RiddleProofProcess`: the packet that flows into evaluation and reporting.

The contract-level `processVerdict` proves:

- normalization cannot silently erase source profile artifact requirements
- required recon artifacts are evidence obligations, not proof by themselves
- a reported `passed` verdict implies the process verdict was `passed`
- a reported `passed` verdict excludes missing source/recon required artifacts

This is still intentionally an internal framework proof. It treats browser,
network, CDN, and website behavior as opaque observations supplied to the
runtime packet.

## Layer 3: Whole Flow Gate

The Layer 3 model covers the Riddle Proof-owned end-to-end gate before a final
report may say `passed`.

It models these obligations:

- authored artifact requirements survive normalization
- recon baselines and baseline understanding are present
- authoring produced a proof plan and capture script
- implementation completed according to the runner
- required before/prod baselines exist for the selected reference mode
- after evidence is present
- verify status is `evidence_captured`
- proof assessment source is a supervisor/supervising agent
- proof assessment decision is `ready_to_ship`
- visual delta and hard blockers are clear
- artifact manifest is known and complete

The theorem `reported_whole_flow_passed_implies_ship_gate_ok` proves that the
reported verdict cannot be `passed` unless the whole ship gate is true.

## Layer 4: Checkpoint Semantics

The Layer 4 model covers the active checkpoint packet and response handoff.

It models these obligations:

- a late non-duplicate response after `ready_to_ship` is ignored
- a late non-duplicate response after terminal `completed` is ignored
- duplicate checkpoint responses are blocked before they can replay work
- accepted responses must match the active packet's run/checkpoint identity
- accepted responses must match the active packet's resume token
- accepted responses must use a decision advertised by `allowed_decisions`
- accepted advancing responses clear the pending packet and count once
- accepted blocking/manual-stop responses count once and retain the pending
  packet
- rejected responses keep the packet pending and do not count as accepted
- duplicate responses increment duplicate count, not accepted response count
- ignored late terminal responses do not count as accepted responses and do not
  poison future duplicate detection
- pending packets without a response do not report a token mismatch verdict

The theorem `accepted_response_has_matching_advertised_packet` proves that an
accepted checkpoint response implies the packet identity, resume token, and
advertised decision checks all held. The theorem
`checkpoint_lifecycle_summary_projects_state` proves that the compact checkpoint
summary projects pending, accepted-response, and duplicate-response state without
inventing acceptance. The theorem
`pending_packet_without_response_has_no_token_match_verdict` proves that a
pending packet token is not treated as a response-token mismatch before any
response has been seen.

## Layer 5: Run Lifecycle and Run-Card Projection

The Layer 5 model covers durable run status and the public status surfaces
derived from it.

It models these obligations:

- protected final statuses are `ready_to_ship`, `shipped`, and `completed`
- terminal application of a protected final status marks the run finalized
- a finalized protected state is not overwritten by a stale non-final incoming
  state
- the intentional `ready_to_ship -> shipped` finalized transition remains
  allowed
- run cards project status, terminal, and monitor-continuation fields from the
  durable run state
- run results project status and `ok` from the same state predicates
- a run-card pass claim requires the ship gate and trusted proof decision facts

The theorem `run_result_run_card_projects_state` proves that a constructed
result's run card projects the same durable state. The counterexample
`independent_run_card_can_invent_success` shows why generated cards must be
tied to state: an independent card can claim `ready_to_ship` while the state is
still running and ungated.

## Layer 6: Published Report Projection

The Layer 6 model covers the public ship surfaces: PR proof comments, hosted
proof artifact links, and terminal `ship_report` JSON.

It models these obligations:

- a public pass report must carry a ship-gate projection
- the public ship-gate projection matches the internal whole-flow ship gate
- a published pass report generated from a flow implies the flow's ship gate was
  OK
- a status-only public report can invent success if it is not tied to gate facts

The theorem `public_report_from_flow_pass_implies_ship_gate_ok` proves that a
published pass report projected from a flow cannot pass unless the same flow's
ship gate is true. The counterexample `status_only_public_report_can_invent_pass`
shows why the public report must not be reduced to a naked status string.

## Layer 7: Ship-Gate Implementation Parity

The Layer 7 model covers drift between implementation surfaces that claim the
same ship-gate truth:

- TypeScript `validateShipGate`
- Python `ship_gate_report_facts`
- Lean `wholeFlowShipGateOk` / public report projection

The theorem `ship_gate_projection_parity_implies_ok_agreement` proves that if
two implementation projections agree on the semantic gate fields, their pass
verdict agrees. The counterexample
`runtime_projection_without_reference_or_hard_blockers_can_disagree` shows why
the runtime parity test must cover unsupported references and proof hard
blockers: omitting either field can let a runtime surface pass while the true
ship gate blocks.

## What Lean Caught So Far

The theorem `current_impl_passes_with_missing_required_artifact` constructs a
finite counterexample:

- evidence is present
- expected viewport coverage is complete
- the only check passes
- `proofJson` is present
- required `screenshot` is missing

For that input, the current implementation model returns `passed`.

The theorem `current_impl_violates_artifact_completeness_spec` then proves that
the current implementation model does not satisfy the artifact completeness
contract.

There are two clean ways to close the gap:

- add artifact completeness to the verdict decision, as `verdict` does
- require an upstream handoff proof that artifacts are complete before the
  current status function is allowed to run, represented by
  `ArtifactCompleteHandoff`

Layer 2 adds two more executable counterexamples:

- `missing_authoring_guard_passes_after_erasing_required_artifact` shows a
  process that can pass if profile normalization drops a source-required
  screenshot before evaluation.
- `missing_recon_guard_passes_with_unwitnessed_required_recon_artifact` shows a
  process that can pass if recon-required artifacts are not included in the
  evaluator's required artifact set.

Layer 1.5 adds the direct/sync ingestion counterexample:

- `erasing_known_empty_manifest_allows_direct_pass` shows that treating a known
  empty artifact manifest as unknown lets a direct hosted result pass despite
  missing required artifacts.

Layer 3 adds whole-flow final-report counterexamples:

- `missing_recon_gate_allows_pass_without_ship_gate` shows that lower-level
  evidence can pass while recon baselines are not ready, unless the final report
  is tied to the ship gate.
- `missing_verify_gate_allows_pass_without_ship_gate` shows the same danger for
  `verify_status != evidence_captured`.
- `runner_assessment_allows_pass_without_ship_gate` shows the same danger when
  `ready_to_ship` comes from an untrusted runner source instead of the
  supervising agent.
- `unknown_artifact_manifest_blocks_even_without_ship_gate` is a positive check:
  the contract-level artifact verdict blocks unknown manifests even before the
  whole-flow ship gate.

Layer 4 adds checkpoint contract counterexamples:

- `unadvertised_recon_response_was_accepted_without_allowed_guard` shows that a
  recon `needs_recon` response could be accepted by continuation logic even
  when the active packet did not advertise that decision.
- `unadvertised_retry_stage_was_accepted_without_allowed_guard` shows the same
  drift for generic `retry_stage` responses.
- `forged_author_packet_recon_response_requires_allowed_guard` shows that a
  matching run/checkpoint/resume-token response can still be invalid when it
  uses a decision the active packet did not advertise.
- `advertised_recon_response_is_accepted` and
  `advertised_retry_stage_response_is_accepted` are the positive post-fix
  checks: the same responses are accepted once the packet advertises them.
- `clearing_blocking_response_loses_pending_packet` shows why blocking/manual
  checkpoint responses must retain the pending packet.
- `counting_rejected_response_inflates_accepted_count` shows why rejected
  checkpoint responses must not be folded into accepted response count.
- `counting_ignored_response_inflates_accepted_count` shows why ignored late
  terminal checkpoint responses must not be folded into accepted response count.
- `pending_packet_without_response_has_no_token_match_verdict` caught a runtime
  summary bug: a pending tokenized packet with no response was reported as
  `token_matches: false` instead of leaving the comparison unset.

Layer 5 adds run lifecycle projection checks:

- `independent_run_card_can_invent_success` shows that a detached run card can
  claim terminal success independently of the durable run state.
- `projected_run_card_rejects_forged_success` shows that the projection
  contract rejects that detached card.
- Runtime conformance caught and fixed a stale snapshot issue: status snapshots
  now regenerate the run card from the current state instead of reusing an
  embedded stale card.

Layer 6 adds the public-report projection counterexample:

- `status_only_public_report_can_invent_pass` shows that a naked published-pass
  status can claim success even when the real whole-flow gate is blocked by a
  hard blocker. The public report now carries a `ship_gate` projection, and
  Python `ship.py` rejects unsupported reference modes and proof hard blockers
  before publishing a pass report.

Layer 7 adds the ship-gate parity counterexample:

- `runtime_projection_without_reference_or_hard_blockers_can_disagree` shows
  that an implementation projection can pass if it omits reference validity or
  hard-blocker facts, even when the full ship gate blocks. Runtime conformance
  now compares TypeScript and Python ship-gate projections across the shared
  blocker matrix.

## Build

```sh
lake build
```

## Reference Points

- `packages/riddle-proof/src/profile.ts` has the profile verdict-collapse
  function `profileStatusFromEvidence`.
- `docs/architecture/runtime-adapter-contract.md` says missing required
  artifacts should be treated as incomplete evidence, not success.
