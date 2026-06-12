# Riddle Proof Lean Kernel

This is a sidecar formal model for Riddle Proof framework verification. It
does not run in the evidence collection path; it checks framework contracts
against the Riddle Proof code and runtime tests.

The model in `RiddleProofKernel.lean` now has four layers.

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

## Build

```sh
lake build
```

## Reference Points

- `packages/riddle-proof/src/profile.ts` has the profile verdict-collapse
  function `profileStatusFromEvidence`.
- `docs/architecture/runtime-adapter-contract.md` says missing required
  artifacts should be treated as incomplete evidence, not success.
