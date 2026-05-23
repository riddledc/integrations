# mobile-layout-smoke

Mobile Layout Smoke proof pack profile. Include this profile JSON directly in any profile-mode execution path.

## Proof claims and evidence roles

- evidence_role: `current_target`
- atomic claim
  - claim: the target renders without layout clipping at mobile viewport size.
  - target: `/` route on the configured target URL.
  - setup/actions: standard mobile viewport load and baseline wait.
  - evidence: root visibility, copy presence, overflow checks, and no-fatal console checks.
  - verdict: pass when critical copy and layout remain visible/usable without overflow.
- does not prove
  - tablet/desktop responsive behavior.
  - interaction correctness or route mutations.
  - protected feature behavior behind auth gates.

## Usage

Load the profile JSON from `profile.json` and supply it to profile mode or a local runner input file.
