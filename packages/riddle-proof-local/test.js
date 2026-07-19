import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  captureDocumentSnapshot,
  compareDocumentSnapshotReceipts,
  createDocumentSnapshotGroundingRecipe,
  createDocumentSnapshotObservation,
  verifyDocumentSnapshotReceipt,
} from "./dist/index.js";
import { main as cliMain } from "./dist/cli.js";
import { readStableRegularFile } from "./dist/stableRead.js";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(packageRoot, "fixtures", "amendment");
const fixtureSelection = JSON.parse(await readFile(join(fixtureRoot, "selection.json"), "utf8"));
const files = fixtureSelection.files.map((selection) => ({
  ...selection,
  path: join(fixtureRoot, selection.path),
}));
const capturedAt = "2026-07-19T20:00:00.000Z";

const receipt = await captureDocumentSnapshot({ files, capturedAt, label: "Ready for Legal Review" });
assert.equal(receipt.artifact_policy, "digest_only");
assert.equal(receipt.snapshot.artifacts.length, 4);
assert.deepEqual(receipt.snapshot.artifacts.map((artifact) => artifact.role), [
  "candidate", "original", "rendered", "template",
]);
assert.equal(verifyDocumentSnapshotReceipt(receipt).ok, true);
const serializedReceipt = JSON.stringify(receipt);
assert.equal(serializedReceipt.includes(resolve(fixtureRoot)), false, "receipt must not contain absolute paths");
for (const name of ["candidate.txt", "original.txt", "rendered.pdf", "template.txt"]) {
  assert.equal(serializedReceipt.includes(name), false, "digest_only receipt must not contain filenames");
}
for (const artifact of receipt.snapshot.artifacts) {
  assert.equal(artifact.reference.kind, "opaque");
  assert.equal("source_name" in artifact, false);
  assert.equal("content_base64" in artifact, false);
}

const laterReceipt = await captureDocumentSnapshot({
  files: [...files].reverse(),
  capturedAt: "2026-07-19T21:00:00.000Z",
  label: "Legal Reviewed",
});
assert.equal(laterReceipt.snapshot.snapshot_id, receipt.snapshot.snapshot_id);
assert.notEqual(laterReceipt.receipt_id, receipt.receipt_id);
assert.deepEqual(compareDocumentSnapshotReceipts(receipt, laterReceipt), {
  status: "unchanged",
  added_roles: [],
  removed_roles: [],
  changed_roles: [],
});

const observation = createDocumentSnapshotObservation(receipt);
const grounding = createDocumentSnapshotGroundingRecipe(receipt);
assert.deepEqual(JSON.parse(grounding.observation_json), observation);
assert.equal(
  Buffer.from(grounding.artifacts[0].bytes_base64, "base64").toString("utf8"),
  grounding.observation_json,
);
assert.equal(grounding.artifacts[0].role, "document_snapshot_observation");
assert.equal(grounding.verifier_definition.program.pointer, "");
assert.equal(grounding.contract_definition.program.all.length, 9);
assert.equal(JSON.stringify(createDocumentSnapshotGroundingRecipe(laterReceipt).observation), JSON.stringify(observation));

const temporaryRoot = await mkdtemp(join(tmpdir(), "riddle-proof-local-"));
const modifiedCandidate = join(temporaryRoot, "candidate.txt");
await writeFile(modifiedCandidate, "FIRST AMENDMENT\n\nA deliberately different synthetic candidate.\n");
const changedReceipt = await captureDocumentSnapshot({
  files: files.map((selection) => selection.role === "candidate"
    ? { ...selection, path: modifiedCandidate }
    : selection),
  capturedAt,
});
assert.deepEqual(compareDocumentSnapshotReceipts(receipt, changedReceipt), {
  status: "changed",
  added_roles: [],
  removed_roles: [],
  changed_roles: ["candidate"],
});

const minimalReceipt = await captureDocumentSnapshot({
  files,
  artifactPolicy: "minimal",
  referenceRoot: fixtureRoot,
  capturedAt,
});
assert.equal(verifyDocumentSnapshotReceipt(minimalReceipt).ok, true);
for (const artifact of minimalReceipt.snapshot.artifacts) {
  assert.equal(artifact.reference.kind, "relative");
  assert.equal(artifact.reference.kind === "relative" && artifact.reference.path.startsWith("/"), false);
  assert.equal(typeof artifact.source_name, "string");
  assert.equal("content_base64" in artifact, false);
}
await assert.rejects(
  captureDocumentSnapshot({
    files: [{ role: "candidate", path: modifiedCandidate }],
    artifactPolicy: "minimal",
    referenceRoot: fixtureRoot,
    capturedAt,
  }),
  /not a descendant/u,
);

const fullReceipt = await captureDocumentSnapshot({
  files: [{ role: "candidate", path: modifiedCandidate }],
  artifactPolicy: "full",
  capturedAt,
});
assert.equal(verifyDocumentSnapshotReceipt(fullReceipt).ok, true);
assert.equal(
  Buffer.from(fullReceipt.snapshot.artifacts[0].content_base64, "base64").toString("utf8"),
  await readFile(modifiedCandidate, "utf8"),
);
const tamperedFull = structuredClone(fullReceipt);
tamperedFull.snapshot.artifacts[0].content_base64 = Buffer.from("tampered", "utf8").toString("base64");
assert.equal(verifyDocumentSnapshotReceipt(tamperedFull).ok, false);

await assert.rejects(
  captureDocumentSnapshot({
    files: [
      { role: "original", path: files[0].path },
      { role: "candidate", path: files[0].path },
    ],
    capturedAt,
  }),
  /same local file/u,
);
const linkPath = join(temporaryRoot, "candidate-link.txt");
await symlink(modifiedCandidate, linkPath);
await assert.rejects(
  captureDocumentSnapshot({ files: [{ role: "candidate", path: linkPath }], capturedAt }),
  /symbolic link/u,
);

const driftingPath = join(temporaryRoot, "drifting.txt");
await writeFile(driftingPath, "before");
await assert.rejects(
  readStableRegularFile(driftingPath, 1024, {
    afterRead: async () => writeFile(driftingPath, "after and a different length"),
  }),
  /changed/u,
);

const cliReceiptPath = join(temporaryRoot, "receipt.json");
const cliGroundingPath = join(temporaryRoot, "grounding.json");
assert.equal(await cliMain([
  "snapshot",
  "--original", join(fixtureRoot, "original.txt"),
  "--template", join(fixtureRoot, "template.txt"),
  "--candidate", join(fixtureRoot, "candidate.txt"),
  "--rendered", join(fixtureRoot, "rendered.pdf"),
  "--captured-at", capturedAt,
  "--out", cliReceiptPath,
  "--grounding-out", cliGroundingPath,
]), 0);
const cliReceipt = JSON.parse(await readFile(cliReceiptPath, "utf8"));
assert.equal(verifyDocumentSnapshotReceipt(cliReceipt).ok, true);
const cliGrounding = JSON.parse(await readFile(cliGroundingPath, "utf8"));
assert.equal(cliGrounding.observation.snapshot_id, cliReceipt.snapshot.snapshot_id);
assert.equal(await cliMain(["verify", "--receipt", cliReceiptPath]), 0);
const laterCliReceiptPath = join(temporaryRoot, "later-receipt.json");
await writeFile(laterCliReceiptPath, `${JSON.stringify(laterReceipt, null, 2)}\n`);
assert.equal(await cliMain([
  "compare", "--before", cliReceiptPath, "--after", laterCliReceiptPath,
]), 0);
const changedCliReceiptPath = join(temporaryRoot, "changed-receipt.json");
await writeFile(changedCliReceiptPath, `${JSON.stringify(changedReceipt, null, 2)}\n`);
assert.equal(await cliMain([
  "compare", "--before", cliReceiptPath, "--after", changedCliReceiptPath,
]), 3, "CLI must report stale document bytes with a distinct exit status");
assert.equal(await cliMain([
  "snapshot", "--candidate", join(fixtureRoot, "candidate.txt"), "--out", cliReceiptPath,
]), 1, "CLI must refuse to overwrite an existing receipt");

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = join(root, entry.name);
    return entry.isDirectory() ? listFiles(target) : [target];
  }));
  return nested.flat();
}

const builtText = (await Promise.all((await listFiles(join(packageRoot, "dist")))
  .filter((file) => /\.(?:js|cjs)$/u.test(file))
  .map((file) => readFile(file, "utf8")))).join("\n");
for (const forbidden of [
  /api\.riddledc\.com/u,
  /RIDDLE_API_KEY/u,
  /(?:from|require\()["']node:(?:http|https|net|tls|dns)/u,
  /\bfetch\s*\(/u,
  /@aws-sdk\//u,
]) {
  assert.equal(forbidden.test(builtText), false, `built package contains forbidden capability: ${forbidden}`);
}

console.log("riddle proof local document snapshot tests passed", {
  snapshot_id: receipt.snapshot.snapshot_id,
  artifacts: receipt.snapshot.artifacts.length,
  policies: ["digest_only", "minimal", "full"],
  drift_rejected: true,
  grounding_recipe: true,
});
