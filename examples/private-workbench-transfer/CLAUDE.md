# Instructions for the approved work agent

This directory is a transfer scaffold for improving an amendment before lawyer review. It is not a ticketing system, a legal approval engine, or a production amendment checker.

Before touching a matter, invoke `company-bootstrap/run-doctor` directly with no arguments as the approved non-root runtime identity. Never invoke `node runtime/doctor.mjs` or an npm script: only the independently owned launcher validates the OS boundary before loading workbench code, sanitizes the process environment, and can emit `{"ok":true,"code":"READY"}`. If it returns anything else, stop and give the fixed code to the administrator for lookup in `README.md`. In particular, `OS_BOUNDARY_NOT_ENFORCED` means this installation is same-user, root-run, runtime-owned, linked, incorrectly grouped, incompletely inventoried, or writable; it is not usable for matter work. Do not add an argument, alternate config, alternate rule/evidence bundle, package, network endpoint, permission-policy input, or bypass. `company-bootstrap/`, `admin-state/`, and both trust roots are administered independently and are never run input. A matter may state the expected pinned IDs/versions/digests but cannot select or replace them.

Use only the company-approved execution surface named in the pinned runtime policy. Do not infer that an Enterprise seat permits API use. Google and Anthropic access, if approved, occurs through separate destination-allowlisted adapters. Core and local execution remain offline.

Keep outputs separate:

- Put only digest-only receipts and fixed diagnostics in the approved `machine/` directory.
- Put excerpts, proposed language, legal questions, reasoning, and any other contract-derived content only in the approved `privileged/` directory.
- Never place document text, filenames, paths, prompts, or secrets in ordinary logs, terminal output, telemetry, or machine receipts.

Record content-free execution metadata: model ID, protocol and prompt version identifiers, routing decision code, attempt count, and escalation reason code. Do not record the prompt or document text in general logs.

Treat `amendment-review-packet-complete` as a mechanical statement only. It says the required process completed against current inputs; it does not say the legal judgment is correct. Never issue `submitted_for_legal_review` or `legal_approved`. Those require separately authenticated human attestations bound to the exact final snapshot.

Do not modify the bootstrap, policy, lock, rule root, evidence-template root, workbench runtime code, installed packages, or public diagnostic fixtures. The public diagnostic signer is confined to disjoint `riddle-proof.diagnostic.*` claims and a separate diagnostic root; it cannot satisfy the production packet rule and is never included in the company evidence root. Production `READY` requires separate administrator ownership, runtime-group read access, and no group/other write access; same-user and root execution are rejected before the doctor runs.

Do not add convenience fields or extra array entries to evidence observations. The independently pinned profile schema defines every permitted root and nested field, fixes array length and order, and permits exactly one signed capture artifact with the pinned ID, role, and media type. A schema mismatch is a failed grounding, not a request to weaken the profile.
