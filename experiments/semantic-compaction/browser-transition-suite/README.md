# Browser-transition proof suite

These four ordinary `riddle-proof.profile.v1` files are the fixed proof suite
used by the browser-transition experiment:

- `before.json` checks the initial value.
- `action.json` checks the immediate update.
- `reload.json` checks reload survival.
- `fresh-context.json` checks visibility from a new browser context.

They are deliberately not wrapped in a suite manifest or lifecycle format. The
package test loads these definitions once, deeply freezes them, and applies
them unchanged to three separately scoped browser targets. Raw SHA-256 values
act as test-input mutation guards. The sealed protocol binds each normalized
profile artifact and digest, whose normalization includes the target URL.
Proof-suite authoring is therefore separate from pinned-suite conformance:
changing a target does not silently rewrite the suite, and changing a profile
changes both its raw fixture hash and its normalized proof identity.
