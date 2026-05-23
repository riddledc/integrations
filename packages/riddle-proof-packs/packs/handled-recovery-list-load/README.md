# handled-recovery-list-load

Handled Recovery List Load proof pack profile. Include this profile JSON directly in any profile-mode execution path.

## Proof claims and evidence roles

- evidence_role: `interaction_snapshots`
- atomic claim
  - claim: list-recovery failures are surfaced without replacing baseline page-level information and without leaking parser errors.
  - target: `/account` account page list section.
  - setup/actions: seed mocks, enter a controlled save/load interaction, then capture pre-action and post-action UI states.
  - evidence: list/state assertions, recovery text presence, absence of contradictory/invalid backend text, and clean console.
  - verdict: pass when recovery path is explicit and unrelated UI state remains present.
- does not prove
  - successful list loading performance or pagination contracts.
  - backend pagination or auth policy behavior outside the exercised endpoint.
  - long-running retry/resubmission behavior.

## Usage

Load the profile JSON from `profile.json` and supply it to profile mode or a local runner input file.
