import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rename, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  captureDocumentSnapshot,
  compareDocumentSnapshotReceipts,
  createDocumentSnapshotCurrentnessGroundingRecipe,
  createDocumentSnapshotGroundingRecipe,
  createDocumentSnapshotObservation,
  DOCUMENT_SNAPSHOT_CURRENTNESS_ERROR_CODES,
  DOCUMENT_SNAPSHOT_CURRENTNESS_VERSION,
  recaptureDocumentSnapshotCurrentness,
  verifyDocumentSnapshotReceipt,
} from "./dist/index.js";
import { main as cliMain } from "./dist/cli.js";
import { readStableRegularFile, readStableRegularFileSet } from "./dist/stableRead.js";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(packageRoot, "fixtures", "document-set");
const fixtureSelection = JSON.parse(await readFile(join(fixtureRoot, "selection.json"), "utf8"));
const files = fixtureSelection.files.map((selection) => ({
  ...selection,
  path: join(fixtureRoot, selection.path),
}));
const capturedAt = "2026-07-19T20:00:00.000Z";

const receipt = await captureDocumentSnapshot({ files, capturedAt });
assert.equal(receipt.artifact_policy, "digest_only");
assert.equal(receipt.snapshot.artifacts.length, 4);
assert.deepEqual(receipt.snapshot.artifacts.map((artifact) => artifact.role), [
  "rendered", "source", "template", "working",
]);
assert.equal(verifyDocumentSnapshotReceipt(receipt).ok, true);
await assert.rejects(
  captureDocumentSnapshot({ files, capturedAt, label: "PRIVATE MATTER NAME" }),
  /digest_only receipts do not accept/u,
);
const serializedReceipt = JSON.stringify(receipt);
assert.equal(serializedReceipt.includes(resolve(fixtureRoot)), false, "receipt must not contain absolute paths");
for (const name of ["working.txt", "source.txt", "rendered.pdf", "template.txt"]) {
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
assert.equal(grounding.contract_definition.program.all.length, 7);
assert.equal(JSON.stringify(createDocumentSnapshotGroundingRecipe(laterReceipt).observation), JSON.stringify(observation));

const checkedAt = "2026-07-19T21:30:00.000Z";
const currentness = await recaptureDocumentSnapshotCurrentness({
  expectedReceipt: receipt,
  files: [...files].reverse(),
  checkedAt,
});
assert.deepEqual(currentness, {
  version: DOCUMENT_SNAPSHOT_CURRENTNESS_VERSION,
  expected_snapshot_id: receipt.snapshot.snapshot_id,
  expected_manifest_digest: receipt.snapshot.manifest_digest,
  checked_at: checkedAt,
  status: "current",
  observed_snapshot_id: receipt.snapshot.snapshot_id,
  observed_manifest_digest: receipt.snapshot.manifest_digest,
  comparison: {
    status: "unchanged",
    added_roles: [],
    removed_roles: [],
    changed_roles: [],
  },
});
const serializedCurrentness = JSON.stringify(currentness);
assert.equal(serializedCurrentness.includes(resolve(fixtureRoot)), false);
for (const name of ["working.txt", "source.txt", "rendered.pdf", "template.txt"]) {
  assert.equal(serializedCurrentness.includes(name), false, "currentness must not contain filenames");
}
const currentnessGrounding = createDocumentSnapshotCurrentnessGroundingRecipe(currentness);
assert.deepEqual(JSON.parse(currentnessGrounding.observation_json), currentness);
assert.equal(currentnessGrounding.artifacts[0].role, "document_snapshot_currentness");
assert.equal(
  currentnessGrounding.contract_definition.claim.label,
  "Selected document bytes matched the expected snapshot at checked_at",
);
assert.equal(currentnessGrounding.contract_definition.claim.label.includes("remain"), false);
assert.deepEqual(currentnessGrounding.contract_definition.claim.parameters, {
  snapshot_id: receipt.snapshot.snapshot_id,
  manifest_digest: receipt.snapshot.manifest_digest,
  checked_at: checkedAt,
});
assert.equal(currentnessGrounding.contract_definition.program.all.length, 12);

const temporaryRoot = await mkdtemp(join(tmpdir(), "riddle-proof-local-"));
const modifiedWorking = join(temporaryRoot, "working.txt");
await writeFile(modifiedWorking, "WORKING DOCUMENT\n\nA deliberately different synthetic working.\n");
const changedReceipt = await captureDocumentSnapshot({
  files: files.map((selection) => selection.role === "working"
    ? { ...selection, path: modifiedWorking }
    : selection),
  capturedAt,
});
assert.deepEqual(compareDocumentSnapshotReceipts(receipt, changedReceipt), {
  status: "changed",
  added_roles: [],
  removed_roles: [],
  changed_roles: ["working"],
});

const changedCurrentness = await recaptureDocumentSnapshotCurrentness({
  expectedReceipt: receipt,
  files: files.map((selection) => selection.role === "working"
    ? { ...selection, path: modifiedWorking }
    : selection),
  checkedAt,
});
assert.equal(changedCurrentness.status, "changed");
assert.notEqual(changedCurrentness.observed_snapshot_id, receipt.snapshot.snapshot_id);
assert.deepEqual(changedCurrentness.comparison, {
  status: "changed",
  added_roles: [],
  removed_roles: [],
  changed_roles: ["working"],
});
assert.throws(
  () => createDocumentSnapshotCurrentnessGroundingRecipe(changedCurrentness),
  /canonical current snapshot witness/u,
);

const watchedWorking = join(temporaryRoot, "watched-working.txt");
const sourceWorkingBytes = await readFile(join(fixtureRoot, "working.txt"));
await writeFile(watchedWorking, sourceWorkingBytes);
const watchedFiles = files.map((selection) => selection.role === "working"
  ? { ...selection, path: watchedWorking }
  : selection);
const beforeMutation = await captureDocumentSnapshot({ files: watchedFiles, capturedAt });
await writeFile(watchedWorking, "mutated private working document bytes");
const afterMutation = await recaptureDocumentSnapshotCurrentness({
  expectedReceipt: beforeMutation,
  files: watchedFiles,
  checkedAt,
});
assert.equal(afterMutation.status, "changed");
assert.deepEqual(afterMutation.comparison?.changed_roles, ["working"]);

await writeFile(watchedWorking, sourceWorkingBytes);
const beforeReplacement = await captureDocumentSnapshot({ files: watchedFiles, capturedAt });
const replacementWorking = join(temporaryRoot, "replacement-private-name.txt");
await writeFile(replacementWorking, "replacement private working document bytes");
await rename(replacementWorking, watchedWorking);
const afterReplacement = await recaptureDocumentSnapshotCurrentness({
  expectedReceipt: beforeReplacement,
  files: watchedFiles,
  checkedAt,
});
assert.equal(afterReplacement.status, "changed");
assert.deepEqual(afterReplacement.comparison?.changed_roles, ["working"]);

const selectionMismatch = await recaptureDocumentSnapshotCurrentness({
  expectedReceipt: receipt,
  files: files.filter((selection) => selection.role !== "working"),
  checkedAt,
});
assert.deepEqual(selectionMismatch, {
  version: DOCUMENT_SNAPSHOT_CURRENTNESS_VERSION,
  expected_snapshot_id: receipt.snapshot.snapshot_id,
  expected_manifest_digest: receipt.snapshot.manifest_digest,
  checked_at: checkedAt,
  status: "unresolved",
  error_code: DOCUMENT_SNAPSHOT_CURRENTNESS_ERROR_CODES.roleSetMismatch,
});

const missingPrivatePath = join(temporaryRoot, "missing-private-document.txt");
const unresolvedCurrentness = await recaptureDocumentSnapshotCurrentness({
  expectedReceipt: receipt,
  files: files.map((selection) => selection.role === "working"
    ? { ...selection, path: missingPrivatePath }
    : selection),
  checkedAt,
});
assert.deepEqual(unresolvedCurrentness, {
  version: DOCUMENT_SNAPSHOT_CURRENTNESS_VERSION,
  expected_snapshot_id: receipt.snapshot.snapshot_id,
  expected_manifest_digest: receipt.snapshot.manifest_digest,
  checked_at: checkedAt,
  status: "unresolved",
  error_code: DOCUMENT_SNAPSHOT_CURRENTNESS_ERROR_CODES.recaptureFailed,
});
const currentnessResults = JSON.stringify({
  changedCurrentness,
  afterMutation,
  afterReplacement,
  selectionMismatch,
  unresolvedCurrentness,
});
for (const forbidden of [
  temporaryRoot,
  "watched-working.txt",
  "replacement-private-name.txt",
  "missing-private-document.txt",
  "mutated private working document bytes",
  "replacement private working document bytes",
]) {
  assert.equal(currentnessResults.includes(forbidden), false, "currentness must not leak source details");
}

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
    files: [{ role: "working", path: modifiedWorking }],
    artifactPolicy: "minimal",
    referenceRoot: fixtureRoot,
    capturedAt,
  }),
  /not a descendant/u,
);

const fullReceipt = await captureDocumentSnapshot({
  files: [{ role: "working", path: modifiedWorking }],
  artifactPolicy: "full",
  capturedAt,
});
assert.equal(verifyDocumentSnapshotReceipt(fullReceipt).ok, true);
assert.equal(
  Buffer.from(fullReceipt.snapshot.artifacts[0].content_base64, "base64").toString("utf8"),
  await readFile(modifiedWorking, "utf8"),
);
const tamperedFull = structuredClone(fullReceipt);
tamperedFull.snapshot.artifacts[0].content_base64 = Buffer.from("tampered", "utf8").toString("base64");
assert.equal(verifyDocumentSnapshotReceipt(tamperedFull).ok, false);

await assert.rejects(
  captureDocumentSnapshot({
    files: [
      { role: "source", path: files[0].path },
      { role: "working", path: files[0].path },
    ],
    capturedAt,
  }),
  /same local file/u,
);
const linkPath = join(temporaryRoot, "working-link.txt");
await symlink(modifiedWorking, linkPath);
await assert.rejects(
  captureDocumentSnapshot({ files: [{ role: "working", path: linkPath }], capturedAt }),
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

const setFirstPath = join(temporaryRoot, "set-first.txt");
const setSecondPath = join(temporaryRoot, "set-second.txt");
await writeFile(setFirstPath, "first before");
await writeFile(setSecondPath, "second stable");
await assert.rejects(
  readStableRegularFileSet([setFirstPath, setSecondPath], 1024, {
    afterRead: async (_path, index) => {
      if (index === 1) await writeFile(setFirstPath, "first changed after its individual read");
    },
  }),
  /snapshot set/u,
  "set capture must reject a first file changed while a later file is read",
);
await assert.rejects(
  readStableRegularFileSet([setFirstPath, setSecondPath], 1024, {}, 16),
  /total capture limit/u,
  "set capture must reject aggregate size before allocating the full set",
);

const cliReceiptPath = join(temporaryRoot, "receipt.json");
const cliGroundingPath = join(temporaryRoot, "grounding.json");
assert.equal(await cliMain([
  "snapshot",
  "--file", `source=${join(fixtureRoot, "source.txt")}`,
  "--file", `template=${join(fixtureRoot, "template.txt")}`,
  "--file", `working=${join(fixtureRoot, "working.txt")}`,
  "--file", `rendered=${join(fixtureRoot, "rendered.pdf")}`,
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
  "snapshot", "--file", `working=${join(fixtureRoot, "working.txt")}`, "--out", cliReceiptPath,
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
