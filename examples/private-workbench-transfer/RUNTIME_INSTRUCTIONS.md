# Instructions for a protected client runtime

This directory is a reusable, synthetic-only bootstrap for a client-defined workflow. It supplies protected Riddle Proof machinery; it does not define the client's domain, substantive rules, workflow, producer, consumer, or downstream decision semantics.

Before processing client input, invoke `company-bootstrap/run-doctor` directly with no arguments under the approved non-root runtime identity. Never invoke `node runtime/doctor.mjs` or an npm script: only the independently owned launcher validates the OS boundary before loading bootstrap code, sanitizes the process environment, and can emit `{"ok":true,"code":"READY"}`. If it returns anything else, stop and give the fixed code to the administrator for lookup in `README.md`. In particular, `OS_BOUNDARY_NOT_ENFORCED` means this installation is same-user, root-run, runtime-owned, linked, incorrectly grouped, incompletely inventoried, or writable; it is not usable for client input. Do not add an argument, alternate config, alternate rule/evidence bundle, package, network endpoint, permission-policy input, or bypass. `company-bootstrap/`, `admin-state/`, and both trust roots are administered independently and are never run input. A run may state the expected pinned IDs, versions, and digests but cannot select or replace them.

Use only the client-approved execution surface named in the pinned runtime policy. Access to a hosted product does not imply programmatic API authorization. External access, if approved, occurs through separate capability-declared, destination-allowlisted adapters. Core and local execution remain offline.

Keep outputs separate:

- Put only digest-only receipts and fixed diagnostics in the approved `machine/` directory.
- Put source-derived content, proposed output, questions, and reasoning only in the approved `privileged/` directory.
- Never place source content, filenames, paths, instructions, or secrets in ordinary logs, terminal output, telemetry, or machine receipts.

Record only content-free execution metadata: runtime ID, protocol and configuration-version identifiers, route code, attempt count, and escalation code. Do not record instructions or source content in general logs.

Treat a configured workflow-packet-complete claim as a mechanical statement only. It says that the client's independently pinned procedural requirements completed against current inputs. It does not establish domain correctness or authorize a downstream action. Any additional meaning must be defined by the private client, outside this public scaffold, as an ordinary client-defined claim grounded in a signed capture for the exact artifact snapshot.

Do not modify the bootstrap, policy, lock, rule root, evidence-template root, runtime code, installed packages, or public diagnostic fixtures. The public diagnostic signer is confined to disjoint `riddle-proof.diagnostic.*` claims and a separate diagnostic root; it cannot satisfy a client rule and is never included in the client evidence root. Production `READY` requires separate administrator ownership, runtime-group read access, and no group/other write access; same-user and root execution are rejected before the doctor runs.

Do not add convenience fields or extra array entries to evidence observations. The independently pinned profile schema defines every permitted root and nested field, fixes array length and order, and permits exactly one signed capture artifact with the pinned ID, role, and media type. A schema mismatch is a failed grounding, not a request to weaken the profile.
