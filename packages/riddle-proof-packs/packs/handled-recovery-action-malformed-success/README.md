# handled-recovery-action-malformed-success

Handled Recovery Action Malformed Success proof pack profile. Include this profile JSON directly in any profile-mode execution path.

## Proof claims and evidence roles

- evidence_role: `interaction_snapshots`
- atomic claim
  - claim: malformed action responses are handled without surfacing parsing/validation regressions in primary UI.
  - target: `/account` account page with recovery-state controls.
  - setup/actions: seed auth/state mocks, perform a malformed create action, capture pre-action and post-action snapshots.
  - evidence: recovery message assertions, visible state retention checks, request-body capture, and clean console checks.
  - verdict: pass when recovery UI appears, corrupted parser artifacts stay absent, and request intent is captured.
- does not prove
  - successful action creation path.
  - behavior for other actions/endpoints in the same workflow.
  - role-specific authorization or data persistence effects.

## Usage

Load the profile JSON from `profile.json` and supply it to profile mode or a local runner input file.
