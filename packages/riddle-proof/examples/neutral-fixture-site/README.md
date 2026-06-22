# Riddle Proof Neutral Fixture Site

This static fixture is a non-Riddle target for Riddle Proof experience-matrix
runs. It exists so contract and browser checks can exercise a deterministic
page without using the Riddle Proof docs as both subject and verifier.

Typical local use:

```sh
python3 -m http.server 4179 --directory packages/riddle-proof/examples/neutral-fixture-site
packages/riddle-proof-runner-playwright/bin/riddle-proof-playwright run-profile \
  --profile packages/riddle-proof/examples/profiles/neutral-fixture-pass.json \
  --url http://127.0.0.1:4179 \
  --output artifacts/riddle-proof/neutral-fixture-pass-local
```

The sibling `neutral-fixture-product-regression.json` profile intentionally
looks for a missing selector. A correct Riddle Proof run reports
`product_regression`, not `passed`.
