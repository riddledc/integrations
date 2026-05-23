# Hosted Runner Threat Model

Hosted execution in this architecture is convenience + reliability, not a trust anchor.

## Threat surfaces

1. **Untrusted script / profile script input**
   - Generated browser script execution is a convenience path, not a true sandbox by itself.
   - Isolation must come from process/container/VM isolation and policy.

2. **Browser process escape / runtime compromise**
   - Browser launch options and process flags are host-level controls.
   - Never rely on JS-level isolation.

3. **Infrastructure and secret compromise**
   - Secret broker and credential stores must be outside runner process trust boundary.
   - Artifacts and browser state should be redacted by default.

4. **Network exfiltration / SSRF**
- Limit egress where possible.
- Block internal metadata access unless required and authenticated.

5. **Artifact poisoning / confidentiality leakage**
- Restrict artifact fields that can include secrets (headers, cookies, localStorage snapshots).
- Validate artifact paths and filenames before persistence.

## Required controls

- Per-job isolation (container/VM/process) for any untrusted or externally provided execution payload.
- Explicit secret broker separation from worker process.
- Artifact quotas and file-write quotas.
- Network policy and least-privilege cloud IAM for runner execution roles.

## Terminology

- “sandbox” means an operational containment boundary (container/VM + egress + IAM + process limits), not merely JS-global rewriting.

