# Riddle Proof Auth Session Smoke - 2026-06-22

## Scope

Exercise a neutral, non-docs fixture that requires stored browser state before
checks can pass. This closes the smallest practical gap between static public
pages and authenticated/live product flows without depending on an external
identity provider.

## Local Playwright

Command:

```sh
python3 -m http.server 4182 --directory packages/riddle-proof/examples/neutral-fixture-site
packages/riddle-proof-runner-playwright/bin/riddle-proof-playwright run-profile \
  --profile packages/riddle-proof/examples/profiles/neutral-fixture-auth-session.json \
  --url http://127.0.0.1:4182 \
  --output artifacts/riddle-proof/neutral-fixture-auth-session-local
```

Result: `passed`.

Receipts:

- `artifacts/riddle-proof/neutral-fixture-auth-session-local/profile-result.json`
- `artifacts/riddle-proof/neutral-fixture-auth-session-local/artifact-manifest.json`
- `artifacts/riddle-proof/neutral-fixture-auth-session-local/screenshots/neutral-fixture-auth-session-phone.png`
- `artifacts/riddle-proof/neutral-fixture-auth-session-local/screenshots/neutral-fixture-auth-session-desktop.png`

The setup summary records `local_storage`, `wait_for_selector`, and `wait`
actions as passed on both phone and desktop.

## Hosted Riddle

Preview:

- id: `ps_3b402d11`
- url: `https://preview.riddledc.com/s/ps_3b402d11/`

Command:

```sh
riddle-proof-loop run-profile \
  --profile packages/riddle-proof/examples/profiles/neutral-fixture-auth-session.json \
  --url https://preview.riddledc.com/s/ps_3b402d11/ \
  --runner riddle \
  --output artifacts/riddle-proof/neutral-fixture-auth-session-hosted \
  --result-format compact-json
```

Result: `passed`.

Hosted job: `job_1daf11b4`.

Receipts:

- `artifacts/riddle-proof/neutral-fixture-auth-session-hosted/profile-result.json`
- `artifacts/riddle-proof/neutral-fixture-auth-session-hosted/summary.md`
- `artifacts/riddle-proof/neutral-fixture-auth-session-hosted/proof.json`
- `https://cdn.riddledc.com/scripts/job_1daf11b4/neutral-fixture-auth-session-phone.png`
- `https://cdn.riddledc.com/scripts/job_1daf11b4/neutral-fixture-auth-session-desktop.png`

## Finding

The first local draft used target-level `wait_for_selector` for
`[data-rp-fixture="auth-passed"]`. That wait runs before `setup_actions`, so it
blocked the localStorage injection and produced a product-regression packet.
The correct auth/session profile puts `wait_for_selector` inside
`setup_actions` after the localStorage write and reload.

Follow-up applied in this change: document the setup-action readiness ordering
in the package README and fixture README.

## Recurring Neutral Canary

The existing neutral fixture canary was rerun after the auth fixture change:

- local pass: `passed`, artifacts under `artifacts/riddle-proof/neutral-fixture-pass-local-final`
- local negative control: `product_regression`, artifacts under `artifacts/riddle-proof/neutral-fixture-product-regression-local-final`
- hosted pass: `passed`, job `job_3867a928`
- hosted negative control: `product_regression`, job `job_552de3af`
