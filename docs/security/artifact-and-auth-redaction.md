# Artifact and Auth Redaction

Hosted artifacts must not include secrets by default.

## Redaction policy

- Scrub auth headers, bearer tokens, and `Set-Cookie` data from captured browser request records.
- Remove cookie-like values from local/session storage snapshots when they contain known auth tokens.
- Strip obvious secret-like query params from captured network URLs in logs.
- Ensure failure logs and script errors do not print full request bodies containing credentials.

## Default behavior expectation

If the framework is run in local mode, consumers remain responsible for local compliance.
Hosted mode should enforce safer defaults and emit an artifact policy summary in run metadata.

## Evidence integrity

- Redaction must be deterministic per run so artifacts are reproducible.
- Missing artifact values due to redaction should be explicitly recorded (`redacted: true`) where supported.

