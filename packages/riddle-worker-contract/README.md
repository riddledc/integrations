# @riddledc/riddle-worker-contract

Public types for hosted-worker interoperability used across Riddle jobs, runners,
and result payloads.

This package intentionally contains the public contract surface for:

- Job v2 envelope
- Runner manifest / runner bundle metadata
- Public result and artifact records

It is intentionally small and schema-oriented so hosted-worker implementations can
share compatible contracts with private control-plane code.
