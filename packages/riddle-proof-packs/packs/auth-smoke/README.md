# auth-smoke

Auth Smoke proof pack profile. Include this profile JSON directly in any profile-mode execution path.

## Proof claims and evidence roles

- evidence_role: `current_target`
- atomic claim
  - claim: The auth entry/home route is reachable and stable under a basic smoke configuration.
  - target: `/` on the configured target URL.
  - setup/actions: minimal route wait and baseline setup to capture DOM and viewport evidence.
  - evidence: route/text assertions plus `body`, overflow, and no-fatal console checks.
  - verdict: pass only if the smoke targets are visible and no high-risk runtime faults are observed.
- does not prove
  - actual identity auth success or login edge cases.
  - permissions, role-based UI behavior, or backend authorization guarantees.
  - protected workflow outcomes across multiple auth providers.

## Usage

Load the profile JSON from `profile.json` and supply it to profile mode or a local runner input file.
