# Administrative bootstrap anchor

An administrator or MDM policy must complete this directory before provisioning. It is the
independently owned pre-execution boundary. `run-doctor` validates the complete workbench
inventory, ownership and modes before loading any workbench JavaScript; invokes the exact Node
binary named in `node-path` under an empty allowlisted environment; and alone translates the
doctor's `FOUNDATION_READY` into `READY`.

Install a dedicated copy of the reviewed canonical Node binary outside the workbench. Do not
chmod or repurpose a shared system, Homebrew, nvm, or developer Node executable:

```sh
sudo install -d -o root -g "$RIDDLE_RUNTIME_GROUP" -m 0755 /opt/client/riddle-proof-node
sudo install -o root -g "$RIDDLE_RUNTIME_GROUP" -m 0555 \
  "$(realpath "$(command -v node)")" /opt/client/riddle-proof-node/node
printf '%s\n' /opt/client/riddle-proof-node/node \
  | sudo tee "$RIDDLE_WORKBENCH/company-bootstrap/node-path" >/dev/null
sudo chown -R root:"$RIDDLE_RUNTIME_GROUP" "$RIDDLE_WORKBENCH/company-bootstrap"
sudo chmod 0555 "$RIDDLE_WORKBENCH/company-bootstrap" \
  "$RIDDLE_WORKBENCH/company-bootstrap/run-doctor"
sudo chmod 0444 \
  "$RIDDLE_WORKBENCH/company-bootstrap/README.md" \
  "$RIDDLE_WORKBENCH/company-bootstrap/admin-signer.json" \
  "$RIDDLE_WORKBENCH/company-bootstrap/deny-network.cjs" \
  "$RIDDLE_WORKBENCH/company-bootstrap/node-path"
```

The directory must be `0555`, `run-doctor` must be `0555`, and `README.md`, `deny-network.cjs`,
`node-path`, and `admin-signer.json` must be `0444`. Every entry and the pinned Node copy must be
owned by root or a separate administrator, assigned to the approved runtime group, and never
owned by the non-root runtime UID. Every canonical ancestor of both the workbench root and the
pinned Node directory, through the filesystem root, must likewise be a real administrator-owned
directory that the runtime identity can traverse but cannot write. Install under an
administrator-controlled hierarchy such as `/opt/client`; never use the runtime user's home,
a synchronized folder, or a writable temporary directory. There is no CLI or environment
override.

Derive the schema's exact lowercase hexadecimal fingerprint from the reviewed private key:

```sh
openssl pkey -in /approved-admin/workbench-admin-key.pem -pubout -outform DER \
  | openssl dgst -sha256 -hex \
  | awk '{print "sha256:" $NF}'
```

The file contains only the independently approved signing-key identity:

```json
{"version":"riddle-proof.private-workbench-bootstrap.v1","key_id":"client-bootstrap-admin-1","public_key_spki_sha256":"sha256:..."}
```
