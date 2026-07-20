# @riddledc/riddle-proof-local

Read explicitly selected local document files into a deterministic Riddle Proof snapshot. The package has no hosted client, network implementation, browser, subprocess, Google integration, or dependency on the compatibility package.

```sh
pnpm add @riddledc/riddle-proof-core @riddledc/riddle-proof-local
```

Selected source files are opened read-only and are never modified. Capture
rejects symbolic links and non-regular files, retains every selected descriptor
until the whole set has been read, and then compares every path and descriptor
with its pre-read metadata. A replacement or modification anywhere in that
shared capture interval fails instead of producing a receipt.

## Tonight's amendment snapshot

```sh
riddle-proof-local snapshot \
  --original ./signed-agreement.pdf \
  --template ./approved-template.docx \
  --candidate ./draft-amendment.docx \
  --rendered ./draft-amendment.pdf \
  --out ./ready-for-legal-review.json \
  --grounding-out ./ready-for-legal-review-grounding.json
```

The default `digest_only` policy records roles, media types, byte lengths, cryptographic digests, and opaque references. It records neither filenames, paths, nor document bytes.

- `digest_only`: scanner- and confidentiality-friendly default; opaque references only.
- `minimal`: adds each basename and, when `--reference-root` is supplied, a safe root-relative reference.
- `full`: explicitly embeds exact bytes as base64. Use only when the receipt's storage is approved for the document content.

Output files use mode `0600` and exclusive creation, so an existing receipt is not silently overwritten. The package's [capability manifest](./capabilities.json) is shipped in its npm tarball.

After legal review, capture a second receipt and compare it with the first:

```sh
riddle-proof-local verify --receipt ./ready-for-legal-review.json
riddle-proof-local compare \
  --before ./ready-for-legal-review.json \
  --after ./legal-reviewed.json
```

`compare` exits `0` when the snapshots are unchanged and `3` when an artifact role was added, removed, or changed. That nonzero stale result is intentional and makes the command usable as a release gate.

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

const receipt = await captureDocumentSnapshot({
  files: [
    { role: "original", path: "./signed-agreement.pdf" },
    { role: "candidate", path: "./draft-amendment.docx" },
  ],
});

if (!verifyDocumentSnapshotReceipt(receipt).ok) throw new Error("invalid receipt");
const grounding = createDocumentSnapshotGroundingRecipe(receipt);

// Immediately before presenting or handing off the packet, reread the
// private matter selections rather than trusting the historical receipt.
const currentness = await recaptureDocumentSnapshotCurrentness({
  expectedReceipt: receipt,
  files: privateMatterSelections,
  checkedAt: "2026-07-19T22:00:00.000Z",
});
if (currentness.status !== "current") throw new Error(currentness.error_code ?? "changed");
const currentnessGrounding = createDocumentSnapshotCurrentnessGroundingRecipe(currentness);
```

`createDocumentSnapshotGroundingRecipe` returns deterministic JSON observation bytes plus `{ artifacts, verifier_definition, contract_definition }` shaped for the callback-free grounded declarative JSON APIs in `@riddledc/riddle-proof-core`. This local package deliberately does not depend on core; the application composes the two at the capability boundary. The recipe does not sign the snapshot itself. Feed its artifact into a signed capture bundle, use its fixed definitions, and retain an independently trusted expected scope, signer, collector, sensor, and nonce policy.

For review-packet use, the independently administered core evidence profile
must also pin the recipe's complete observation shape. Object fields are exact,
the artifact-observation array is an ordered fixed-length tuple, and each
signed grounding carries exactly the profile's one pinned observation artifact
ID, role, and media type. This prevents an otherwise valid signature from
carrying undeclared nested fields, extra observation entries, or an additional
producer-selected artifact into the checked review closure.

`compareDocumentSnapshotReceipts(before, after)` reports added, removed, and changed roles. A legal-review receipt should therefore be treated as stale whenever the candidate or rendered role changes.

`recaptureDocumentSnapshotCurrentness` forces `digest_only`, requires the exact
prior role set, rereads the caller-supplied private paths, and returns only
content-free IDs, digests, role comparisons, a fixed error code, and the
explicit `checked_at`. Its claim is deliberately time-bounded: the snapshot
matched at that check. It cannot promise that a file will remain unchanged
afterward. Paths belong in the private matter manifest and are never recovered
from, or written into, the receipt.

## Building a checked handoff meaning

The repository's synthetic `meaning-integration.test.js` carries one document
snapshot through the whole stack:

```text
stable selected bytes
  -> signed grounded snapshot fact
  -> allowlisted snapshot-anchor rule
  -> allowlisted handoff-anchor rule
  -> serialized blind-consumer replay
```

The consumer supplies the exact trusted rule digests, root ID, scope, claim,
and consumption-time freshness policy. At the exact age boundary the closure is
`checked`; later it is `stale`. An invented “legal approval” root is rejected.
This is compositional meaning in the narrow operational sense: the exact rule
and its supporting closure can be replayed without manually reopening every
premise. `checked_allowlisted_rule` does not assert that the rule is legally or
philosophically sound.

## Honest boundary

The receipt proves what this implementation read from explicitly selected local filesystem objects during a stable interval. It does not prove that a filename was the legally operative agreement, that a PDF faithfully renders a DOCX, that a human approved the content, or that the local machine and signing key are trustworthy. Those are separate contracts and trust anchors.
