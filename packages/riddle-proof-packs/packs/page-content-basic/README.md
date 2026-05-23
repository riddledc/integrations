# page-content-basic

Page Content Basic proof pack profile. Include this profile JSON directly in any profile-mode execution path.

## Proof claims and evidence roles

- evidence_role: `current_target`
- atomic claim
  - claim: the configured route renders expected baseline content and remains visually and console-clean.
  - target: `/` route on the configured target URL.
  - setup/actions: basic load/visibility setup without route transitions.
  - evidence: route/text/viewport visibility checks plus overflow and console safety assertions.
  - verdict: pass when baseline content is present and no fatal runtime errors are observed.
- does not prove
  - feature behavior beyond baseline smoke checks.
  - dynamic state transitions or stateful business logic.
  - multi-step auth or account-specific behavior.

## Usage

Load the profile JSON from `profile.json` and supply it to profile mode or a local runner input file.
