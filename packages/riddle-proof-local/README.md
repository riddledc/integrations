# @riddledc/riddle-proof-local

Read explicitly selected local files into a deterministic Riddle Proof document
snapshot. The package has no hosted client, network implementation, browser,
subprocess, remote-document integration, or dependency on the compatibility
package.

```sh
pnpm add @riddledc/riddle-proof-core @riddledc/riddle-proof-local
```

Selected files are opened read-only and are never modified. Capture rejects
symbolic links and non-regular files, retains every selected descriptor until
the whole set has been read, and then compares every path and descriptor with
its pre-read metadata. A replacement or modification anywhere in that shared
capture interval fails instead of producing a receipt.

## Capture a document set

```sh
riddle-proof-local snapshot \
  --file source=./source.pdf \
  --file working=./working.docx \
  --file rendered=./rendered.pdf \
  --out ./snapshot.json \
  --grounding-out ./snapshot-grounding.json
```

The default `digest_only` policy records roles, media types, byte lengths,
cryptographic digests, and opaque references. It records neither filenames,
paths, nor document bytes.

- `digest_only`: content-free default; opaque references only.
- `minimal`: adds each basename and, when `--reference-root` is supplied, a
  safe root-relative reference.
- `full`: explicitly embeds exact bytes as base64. Use only when the receipt's
  storage is approved for that content.

Output files use mode `0600` and exclusive creation, so an existing receipt is
not silently overwritten. The package's [capability manifest](./capabilities.json)
is shipped in its npm tarball.

Capture a later receipt to compare the exact role set and bytes:

```sh
riddle-proof-local verify --receipt ./snapshot.json
riddle-proof-local compare --before ./snapshot.json --after ./later-snapshot.json
```

`compare` exits `0` when snapshots are unchanged and `3` when an artifact role
was added, removed, or changed. That nonzero stale result is intentional and
makes the command usable as a gate.

## API

```ts
import {
  captureDocumentSnapshot,
  compareDocumentSnapshotReceipts,
  createDocumentSnapshotCurrentnessGroundingRecipe,
  createDocumentSnapshotGroundingRecipe,
  recaptureDocumentSnapshotCurrentness,
  verifyDocumentSnapshotReceipt,
} from "@riddledc/riddle-proof-local";

const files = [
  { role: "source", path: "./source.pdf" },
  { role: "working", path: "./working.docx" },
] as const;

const receipt = await captureDocumentSnapshot({ files: [...files] });
if (!verifyDocumentSnapshotReceipt(receipt).ok) throw new Error("invalid receipt");

const grounding = createDocumentSnapshotGroundingRecipe(receipt);
const currentness = await recaptureDocumentSnapshotCurrentness({
  expectedReceipt: receipt,
  files: [...files],
  checkedAt: "2026-07-19T22:00:00.000Z",
});
if (currentness.status !== "current") throw new Error(currentness.error_code ?? "changed");
const currentnessGrounding = createDocumentSnapshotCurrentnessGroundingRecipe(currentness);
```

`createDocumentSnapshotGroundingRecipe` returns deterministic JSON observation
bytes plus `{ artifacts, verifier_definition, contract_definition }` shaped for
the callback-free grounded declarative JSON APIs in
`@riddledc/riddle-proof-core`. This package deliberately does not depend on
core; the application composes the two at the capability boundary. The recipe
does not sign the snapshot itself. Feed its artifact into a signed capture
bundle, use its fixed definitions, and retain independently trusted scope,
signer, collector, sensor, and nonce policies.

An independently administered evidence profile can additionally pin the
recipe's complete observation shape. Object fields are exact, the artifact
array is an ordered fixed-length tuple, and each signed grounding carries
exactly the profile's one pinned observation artifact ID, role, and media type.
This rejects undeclared nested fields, extra observation entries, and an
additional producer-selected artifact.

`recaptureDocumentSnapshotCurrentness` forces `digest_only`, requires the exact
prior role set, rereads caller-supplied paths, and returns only content-free
IDs, digests, role comparisons, a fixed error code, and the explicit
`checked_at`. Its claim is deliberately time-bounded: the snapshot matched at
that check. It cannot promise a file remains unchanged afterward. Paths belong
in the consuming application's private manifest and are never recovered from,
or written into, the receipt.

## Composition boundary

The synthetic integration test demonstrates three independently checked
pieces: a checked-meaning closure rooted in caller-pinned rules, a currentness
certificate for the exact snapshot, and a private-packet receipt bound to the
exact root and currentness certificate references. The consuming application
defines the high-level claim and classifications; neither this package nor core
assigns workflow meaning to them.

## Honest boundary

The receipt proves what this implementation read from explicitly selected
local filesystem objects during a stable interval. It does not prove that a
file is authoritative, that one format faithfully renders another, that a
person endorsed the content, or that the local machine and signing key are
trustworthy. Those are separate contracts and trust anchors.
