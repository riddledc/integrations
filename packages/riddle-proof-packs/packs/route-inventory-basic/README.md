# route-inventory-basic

Route Inventory Basic proof pack profile. Include this profile JSON directly in any profile-mode execution path.

## Proof claims and evidence roles

- evidence_role: `current_target`
- atomic claim
  - claim: expected route inventory is present and navigable from the configured route list.
  - target: `/` route list source with route inventory checks.
  - setup/actions: wait for route inventory container and validate expected entries.
  - evidence: route inventory receipt, overflow checks, and no-fatal console checks.
  - verdict: pass when listed routes are discoverable with stable inventory output.
- does not prove
  - the full routing graph or server-side route auth correctness.
  - behavior after navigating into each listed route.
  - route accessibility/accessibility quality across all devices.

## Usage

Load the profile JSON from `profile.json` and supply it to profile mode or a local runner input file.
