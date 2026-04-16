# @riddledc/openclaw-riddle-proof

OpenClaw wrapper for Riddle Proof: evidence-backed workflows for
agent-authored changes.

This package is intentionally separate from `@riddledc/openclaw-riddledc`.
The browser automation plugin stays focused on hosted browser tools while this
package owns the Riddle Proof OpenClaw install surface.

## Status

Initial wrapper scaffold. It normalizes OpenClaw tool parameters through
`@riddledc/riddle-proof/openclaw`, creates the shared run envelope, and returns
a blocked result until the execution adapter is wired.

This keeps the currently working OpenClaw/Discord proof flow as the reference
implementation while the new wrapper reaches parity.

## Product Boundary

This package is meant to become the OpenClaw entry point for the full Riddle
Proof harness, not just a skill prompt. The valuable path is:

```text
idea -> workspace setup -> agent implementation -> server-backed proof capture
     -> proof judgment -> PR creation -> CI evidence -> integration update
```

The wrapper owns the OpenClaw tool contract and integration metadata. The
reusable harness behind it owns the hard workflow pieces: configured agent
execution, Riddle server usage, proof assessment, ship gates, and notifications.
The current wrapper stops after request normalization until those adapters are
wired and parity-tested against the existing `proofed_change_run` flow.

## Tool

`riddle_proof_change`

The tool accepts proofed-change-style params such as `repo`, `branch`,
`change_request`, `verification_mode`, `assertions_json`, and Discord routing
metadata. It returns a `RiddleProofRunResult`.

## Runtime Boundary

The wrapper depends on `@riddledc/riddle-proof` for contracts and normalization.
It does not invoke another OpenClaw plugin and does not supply a coding agent.
Future setup, implementation, proof, judge, ship, and notification adapters
should be wired into the `@riddledc/riddle-proof` runner behind this wrapper
after parity tests pass.

The package should call configured services and credentials at runtime; it must
not publish Riddle server secrets, Discord credentials, GitHub tokens, or
OpenClaw-instance-specific configuration.
