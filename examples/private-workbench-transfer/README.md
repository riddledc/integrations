# Riddle Proof client bootstrap

This is a **generic, synthetic-only bootstrap**, not an implementation of any particular domain or workflow. It packages reusable security and verification machinery for transfer into a client-controlled administrative boundary. The client separately supplies its rules, evidence profiles, runtime instructions, producers, consumers, adapters, credentials, private examples, and domain meanings. This directory is deliberately outside the repository's npm workspaces and is never published as an npm package.

The boundary is explicit:

| Reusable Riddle Proof machinery | Private client implementation |
|---|---|
| Offline core/local packages, grounding, composition, packet binding, currentness, replay, capability checks, provenance checks, protected launch, and output separation | Domain rules and vocabulary, execution adapters, runtime instructions, credentials, identities, private examples, substantive decisions, and approval meanings |

Copy this bootstrap into the client-controlled environment, then build the private implementation beside it. Do not add private implementation semantics to this public scaffold or publish them through Riddle Proof packages.

The scaffold is the last mile to a secure, client-usable Riddle Proof foundation:

- `@riddledc/riddle-proof-core` is deterministic and has no network, browser, filesystem, or subprocess capability.
- `@riddledc/riddle-proof-local` reads explicitly selected local files and has no network, browser, subprocess, or hosted-Riddle capability.
- `admin/` is the privileged provisioning side. It may call npm and use a subprocess to verify registry signatures and provenance, then signs a content-free supply-chain lock.
- `company-bootstrap/run-doctor` is the independently owned pre-execution supervisor. It checks the whole protected inventory before loading bootstrap JavaScript, starts a pinned administrative Node copy under an empty allowlisted environment, and is the only component allowed to emit `READY`.
- `runtime/` is the offline side. Its direct doctor has no configuration arguments, network imports, or subprocess imports and can emit only `FOUNDATION_READY`, never `READY`. It rechecks the OS boundary first as defense-in-depth, then accepts only the rule root, reusable evidence-template root, and supply-chain state independently pinned by the administrator.
- Every external-system or execution adapter belongs in a separate, capability-declared process with a destination allowlist. No such adapter is included here.

## Two output classes

The configured output directory always contains two private subdirectories:

- `machine/` is for digest-only receipts and ordinary diagnostics. It must not contain filenames, paths, source contents, excerpts, proposed output, instructions, or domain reasoning.
- `privileged/` may contain the source-derived workflow packet, necessary excerpts, proposed output, questions, and reasoning. It remains inside the approved client-controlled directory and is never read or emitted by the doctor.

A client-configured workflow-packet-complete root means only what its independently pinned rule states—for the synthetic diagnostic, that required steps ran, statements were classified, evidence was linked, uncertainties were enumerated, and the exact snapshot was current at verification. It does **not** establish domain correctness or confer any client-defined approval. Those meanings belong exclusively to a private client implementation.

## Administrative setup

Run these steps as the client administrator, outside the runtime's writable boundary.

1. Copy this directory into the approved client environment.
2. Review `package.json`, then create a lockfile and install the exact dependencies with lifecycle scripts disabled:

   ```sh
   npm install --ignore-scripts --no-audit --no-fund
   ```

   Before provisioning, normalize the exact trees that the signed lock will bind. Substitute
   the canonical installation path, runtime account, and existing runtime group:

   ```sh
   export RIDDLE_WORKBENCH=/opt/client/riddle-proof-bootstrap
   export RIDDLE_RUNTIME_USER=riddle-proof-runtime
   export RIDDLE_RUNTIME_GROUP=riddle-proof-runtime
   cd "$RIDDLE_WORKBENCH"
   find admin runtime shared synthetic node_modules -type d -exec chmod 0750 {} +
   find admin runtime shared synthetic node_modules -type f -exec chmod 0640 {} +
   chmod 0640 .gitignore README.md RUNTIME_INSTRUCTIONS.md package.json package-lock.json
   id "$RIDDLE_RUNTIME_USER"
   ```

   The final `id` output must list `RIDDLE_RUNTIME_GROUP`. Do not change installed-package
   modes after provisioning: file modes are included in each signed installed-tree digest.

3. Create a separate client-controlled rule-definition file. Never use a file under `synthetic/` as the client rule root. Build a bundle plus the two independently inspectable pins:

   ```sh
   npm run create:rule-root -- \
     --definitions /approved-admin/client-rule-definitions.json \
     --trust-root-id client-workflow-rules \
     --trust-root-version 1 \
     --bundle-out /approved-admin/rule-bundle.json \
     --reference-out /approved-admin/rule-root-reference.json \
     --packet-rule-out /approved-admin/packet-complete-rule.json
   ```

4. Create and independently inspect a separate client-controlled evidence-template file and root. It binds each allowed claim to its collector, sensor template, signer, verifier, contract template, parameter bindings, exact observation schema, and single allowed artifact identity. Observation objects reject undeclared root or nested fields, and observation arrays are fixed-length ordered tuples rather than open-ended item lists. Run-specific values are materialized from this root; a run cannot submit its own evidence authority.

   ```sh
   npm run create:evidence-root -- \
     --templates /approved-admin/client-evidence-profile-templates.json \
     --trust-root-id client-workflow-evidence \
     --trust-root-version 1 \
     --bundle-out /approved-admin/evidence-bundle.json \
     --reference-out /approved-admin/evidence-root-reference.json
   ```

   `synthetic/diagnostic-evidence-profile-templates.json` and `synthetic/diagnostic-rule-definitions.json` are public diagnostic authority only. Their publicly known diagnostic signing key is authorized exclusively for disjoint `riddle-proof.diagnostic.*` claim IDs and a separate diagnostic conclusion/root created in memory by the self-test. They are never copied into pinned client evidence or rule roots. Both provisioning and runtime verification reject the diagnostic key ID, its exact SPKI, or the diagnostic namespace anywhere in a production root; hostile tests re-sign administrative state and confirm that rejection.

5. Inspect and independently pin both emitted root references: ID, version, and bundle digest. Run input may reference those values, but cannot provide or replace either bundle.
6. Replace `synthetic/approved-surfaces.json` with the execution surface actually approved by the client. Identify the exact surface, adapter, destinations, runtime identifiers, protocol versions, configuration versions, route codes, escalation codes, attempt limit, and deterministic components. Access to a hosted product is not treated as programmatic API authorization.
7. Create an Ed25519 administrative signing key outside this bootstrap and keep it unavailable to the runtime process:

   ```sh
   openssl genpkey -algorithm ed25519 -out /approved-admin/workbench-admin-key.pem
   ```

   Derive the exact lowercase SPKI SHA-256 value required by the bootstrap schema:

   ```sh
   openssl pkey -in /approved-admin/workbench-admin-key.pem -pubout -outform DER \
     | openssl dgst -sha256 -hex \
     | awk '{print "sha256:" $NF}'
   ```

8. Before provisioning, have a separate administrator or MDM policy install the signing key's reviewed `key_id` and SPKI SHA-256 fingerprint at the fixed path `company-bootstrap/admin-signer.json`, then install the dedicated Node copy and fixed `node-path` described in `company-bootstrap/README.md`. There is deliberately no CLI or environment override.

9. Provision the fixed runtime policy and signed supply-chain lock. `created-at` must be a canonical UTC timestamp selected by the administrator. Provisioning first requires the private signing key to match the external bootstrap fingerprint. It then runs `npm ls`, `npm audit signatures`, and registry metadata checks, and requires SLSA provenance for both `0.1.1` packages.

   The canonical parent of `--output-root` must already exist, be owned by the administrator
   running provisioning, and have no group/other write permission. Use a new dedicated leaf when
   possible. An existing output root is never repaired or `chmod`ed: it must already be an
   administrator-owned, non-symlink `0700` directory containing exactly `machine/` and
   `privileged/`, both administrator-owned `0700` directories. Files may already exist inside
   those two classes. Filesystem roots, first-level broad paths, and paths overlapping the
   workbench are rejected before any mutation.

   ```sh
   npm run provision -- \
     --output-root /approved-client-data/riddle-proof \
     --rule-bundle /approved-admin/rule-bundle.json \
     --expected-rule-root /approved-admin/rule-root-reference.json \
     --evidence-bundle /approved-admin/evidence-bundle.json \
     --expected-evidence-root /approved-admin/evidence-root-reference.json \
     --packet-complete-rule /approved-admin/packet-complete-rule.json \
     --approved-surfaces /approved-admin/approved-surfaces.json \
     --signing-key /approved-admin/workbench-admin-key.pem \
     --signing-key-id client-bootstrap-admin-1 \
     --created-at 2026-07-19T22:00:00.000Z
   ```

10. The provisioner finishes `admin-state/` at mode `0550` and its four JSON files at
    mode `0440`. After provisioning, establish the real OS boundary. These are the exact
    reference commands for a root-owned installation readable through the runtime group:

    ```sh
    export RIDDLE_OUTPUT_ROOT=/approved-client-data/riddle-proof
    sudo chown -R root:"$RIDDLE_RUNTIME_GROUP" "$RIDDLE_WORKBENCH"
    sudo chmod 0750 "$RIDDLE_WORKBENCH"
    sudo chmod 0550 "$RIDDLE_WORKBENCH/admin-state"
    sudo chmod 0440 \
      "$RIDDLE_WORKBENCH/admin-state/runtime-policy.json" \
      "$RIDDLE_WORKBENCH/admin-state/supply-chain-lock.json" \
      "$RIDDLE_WORKBENCH/admin-state/rule-trust-root.json" \
      "$RIDDLE_WORKBENCH/admin-state/evidence-trust-root.json"
    sudo chmod 0555 "$RIDDLE_WORKBENCH/company-bootstrap" \
      "$RIDDLE_WORKBENCH/company-bootstrap/run-doctor"
    sudo chmod 0444 \
      "$RIDDLE_WORKBENCH/company-bootstrap/README.md" \
      "$RIDDLE_WORKBENCH/company-bootstrap/admin-signer.json" \
      "$RIDDLE_WORKBENCH/company-bootstrap/deny-network.cjs" \
      "$RIDDLE_WORKBENCH/company-bootstrap/node-path"
    sudo chown -R "$RIDDLE_RUNTIME_USER":"$RIDDLE_RUNTIME_GROUP" "$RIDDLE_OUTPUT_ROOT"
    sudo find "$RIDDLE_OUTPUT_ROOT" -type d -exec chmod 0700 {} +
    sudo find "$RIDDLE_OUTPUT_ROOT" -type f -exec chmod 0600 {} +
    sudo -u "$RIDDLE_RUNTIME_USER" env -i \
      PATH=/usr/bin:/bin:/usr/sbin:/sbin LANG=C LC_ALL=C TZ=UTC \
      "$RIDDLE_WORKBENCH/company-bootstrap/run-doctor"
    ```

    Production `READY` requires a non-root runtime UID and a different owner UID for the
    exact top-level inventory; every canonical ancestor of the workbench and pinned Node
    directories; workbench root; `admin/`, `runtime/`, `shared/`, `synthetic/`;
    `.gitignore`, `README.md`, `RUNTIME_INSTRUCTIONS.md`, both package files; the complete installed core/local
    trees; `admin-state/`; the bootstrap; and the dedicated Node binary. Every protected entry
    must be a non-symlink, readable through the runtime group, and exactly `0750`/`0640` except
    the documented stricter administrative/bootstrap modes. The sole exception is npm's normal
    `.bin/riddle-proof-local` link, whose exact name, lexical target, resolved target, and package
    manifest declaration are positively inventoried. The runtime-owned output tree remains
    private at exactly `0700` for every directory and `0600` for every file. Every protected
    ancestor must be owned by an administrator rather than the runtime identity, traversable
    but not writable by that identity, and free of symlinks. Do not install the workbench or
    pinned Node beneath the runtime user's home, a synchronized folder, or a writable temporary
    directory: a writable parent would permit replacement of the otherwise protected tree.

A same-user copy can complete the administrative regression suite, but direct doctor execution
must return `OS_BOUNDARY_NOT_ENFORCED`; it can never return `READY`. The launcher rejects root and
same-UID execution before invoking Node. There is no environment variable, CLI flag, or
configuration-file bypass.

## Runtime use

Run the protected launcher directly, without npm and without arguments, before handling client input:

```sh
company-bootstrap/run-doctor
```

Before Node runs, the launcher rejects loader/Node injection variables, verifies the exact protected inventory and npm link, and selects the pinned admin-owned Node. It then rejects hosted-Riddle configuration (including `RIDDLE_API_KEY_FILE` and `RIDDLE_API_BASE_URL`) and any runtime-readable fixed `/tmp/riddle-api-key` before starting the doctor. The doctor deterministically checks the external bootstrap fingerprint; signed policy and lock; exact `0.1.1` versions and npm integrities; installed file-tree digests and dependency closure; provenance attestation metadata; package capabilities; absence of the compatibility facade, hosted client, Playwright, and packs; output permissions; both pinned client roots; and two public diagnostic capture/sign/compose/currentness/replay round trips under a separate diagnostic authority. The diagnostic also rejects observations with an extra root field, an extra nested field, or an extra tuple item and proves the diagnostic closure cannot satisfy a client protocol or roots.

The output is only a fixed code such as `READY`, `PACKAGE_TREE_MISMATCH`, or `RULE_TRUST_ROOT_INVALID`. It never includes caught exception text, environment values, paths, instructions, or privileged packet content. Any failure is a stop condition for the client runtime.

## Doctor result and remediation table

All output remains a single content-free JSON object. The client runtime stops on every non-`READY`
result; the administrator performs remediation from the table and reruns the argument-free doctor.

| Code | Meaning and administrator remediation |
|---|---|
| `READY` | Every deterministic and OS-boundary check passed. Client work may begin on the pinned surface. |
| `ARGUMENT_OVERRIDE_FORBIDDEN` | The doctor received an argument. Remove every argument; there are no runtime overrides. |
| `HOSTED_ENV_PRESENT` | A hosted-Riddle environment variable is present. Remove it from the runtime service environment and restart the clean runtime session. |
| `RUNTIME_ENV_INVALID` | A Node, dynamic-loader, TLS, or shell injection variable is present. Fix the service manager to use the documented empty allowlisted environment; do not unset it from inside workbench code and continue. |
| `BOOTSTRAP_INVALID` | The fixed bootstrap is absent, malformed, linked, or not `0555`/`0444`. Reinstall the reviewed signer fingerprint at the fixed path and restore exact modes. |
| `POLICY_INVALID` | The pinned runtime policy is malformed or inconsistent. Re-provision from reviewed administrative inputs; do not edit the policy. |
| `POLICY_PERMISSIONS_INVALID` | `admin-state/` is not `0550`, a state file is not `0440`, or a path is linked. Re-provision, then restore the documented ownership and exact modes. |
| `OS_BOUNDARY_NOT_ENFORCED` | Runtime is root, owns a protected entry, lacks its runtime group, or protected code/state is linked or group/other writable. Apply step 10 from a separate administrator account; never bypass it. |
| `SUPPLY_CHAIN_LOCK_INVALID` | Signed lock structure or pinned content is invalid. Reinstall exact packages and re-provision from verified registry evidence. |
| `SUPPLY_CHAIN_SIGNATURE_INVALID` | Lock signature or bootstrap signer identity does not verify. Stop and have the independent administrator reconcile the key, fingerprint, and signed state. |
| `PACKAGE_MANIFEST_INVALID` | Bootstrap or installed package manifest differs from the exact private two-package installation. Restore from the inspected scaffold and reinstall. |
| `PACKAGE_VERSION_MISMATCH` | Installed core/local version is not exactly pinned. Remove the installation from service, reinstall from the lockfile, and re-provision. |
| `PACKAGE_INTEGRITY_MISMATCH` | Lockfile integrity and signed registry evidence differ. Reinstall with a fresh inspected lock and re-provision; do not hand-edit integrity values. |
| `PACKAGE_TREE_MISMATCH` | Installed bytes or modes differ from the signed tree. Reinstall, normalize modes before provisioning, and re-provision. |
| `DEPENDENCY_CLOSURE_INVALID` | The installed production dependency set is not exactly core plus local. Reinstall with the reviewed lockfile and lifecycle scripts disabled. |
| `FORBIDDEN_PACKAGE_PRESENT` | Facade, hosted client, Playwright runner, or packs is installed. Remove the workbench from service and reinstall only the exact two pins. |
| `CAPABILITY_MISMATCH` | A package capability manifest differs from the approved offline profile. Reinstall the exact published package and re-provision. |
| `RULE_TRUST_ROOT_INVALID` | Rule bundle, pin, or packet-complete rule fails deterministic resolution, or contains public diagnostic authority. Have the rule administrator rebuild, inspect, pin, and provision a client-only bundle. |
| `EVIDENCE_TRUST_ROOT_INVALID` | Evidence-template bundle or pin fails deterministic resolution, or contains the public diagnostic key/namespace. Have the evidence administrator rebuild, inspect, pin, and provision a client-only bundle. |
| `OUTPUT_BOUNDARY_INVALID` | Output root/layout, ownership, modes, entry type, or symlink policy failed. Have the administrator inspect it without exposing contents; every directory must be exactly `0700` and every file exactly `0600`. Provisioning deliberately does not repair an existing output root. |
| `SYNTHETIC_CAPTURE_FAILED` | Offline diagnostic capture failed. Stop client work; reinstall/re-provision and rerun before escalating as an implementation defect. |
| `SYNTHETIC_SIGNING_FAILED` | Offline diagnostic signing/certification failed. Reconcile the separately authorized diagnostic signer and evidence root, then re-provision. |
| `SYNTHETIC_COMPOSITION_FAILED` | The pinned synthetic procedural rule did not compose. Reinstall exact packages and inspected roots; escalate if a clean provision repeats it. |
| `SYNTHETIC_CURRENTNESS_FAILED` | Stable recapture/currentness diagnostic failed. Restore the unmodified synthetic fixtures from the reviewed scaffold and re-provision. |
| `SYNTHETIC_REPLAY_FAILED` | Blind deterministic replay failed. Stop client work, reinstall/re-provision, and escalate if the clean synthetic run still fails. |
| `INTERNAL_FAILURE` | An unclassified failure occurred. Do not enable verbose logging on private client input; reproduce only with synthetic inputs in the administrative environment. |
| `PROVISIONED` | Administrative provisioning succeeded, but production is not ready until step 10 and the argument-free protected launcher returns `READY`. |
| `PROVISION_FAILED` | Provisioning rejected its inputs or supply-chain evidence. Inspect only administrative or synthetic inputs, correct the setup, and rerun; do not expose private client content. |

## Public machinery versus private client use

This bootstrap contains reusable machinery only: offline core/local packages, trust-root provisioning, supply-chain checks, the protected launcher and doctor, output separation, and synthetic replay. It does not contain a real workflow protocol, domain rules, external adapters, credentials, identity registry, private instructions, approval meanings, or real source material. Those belong in a separate private client project maintained inside the client's controlled environment. The public fixtures under `synthetic/` are intentionally fictional and test only the machinery.
