import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import {
  evaluateOsBoundaryPolicy,
  PERMISSION_ROLES,
} from "../examples/private-workbench-transfer/shared/permission-policy.mjs";
import {
  canonicalDigest,
  canonicalJson,
  PUBLIC_DIAGNOSTIC_AUTHORITY,
  validateInstalledBinLinks,
} from "../examples/private-workbench-transfer/shared/integrity.mjs";
import {
  hostedConfigurationPresent,
} from "../examples/private-workbench-transfer/runtime/doctor.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templateRoot = join(repositoryRoot, "examples", "private-workbench-transfer");
const temporaryRoot = mkdtempSync(join(realpathSync(tmpdir()), "riddle-proof-private-transfer-"));
const privilegedSentinel = "PRIVATE_OUTPUT_SENTINEL_2d98c8f84e";
const hostedSecretSentinel = "HOSTED_SECRET_SENTINEL_019a4a";
const syntheticPacketSentinel = "SYNTHETIC_PRIVILEGED_CLAUSE_DO_NOT_LOG_7b3619";
const injectionEnvironmentNames = new Set([
  "BASH_ENV",
  "ENV",
  "NODE_OPTIONS",
  "NODE_PATH",
  "NODE_REPL_EXTERNAL_MODULE",
  "NODE_EXTRA_CA_CERTS",
  "OPENSSL_CONF",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "DYLD_FRAMEWORK_PATH",
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
]);

function sanitizedFoundationEnvironment(environment = process.env) {
  return Object.fromEntries(
    Object.entries(environment).filter(([name]) => !injectionEnvironmentNames.has(name)),
  );
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status})\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function assertFixedOutput(result, expectedCode) {
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(output.includes(privilegedSentinel), false, "diagnostic output leaked privileged content");
  assert.equal(output.includes(hostedSecretSentinel), false, "diagnostic output leaked an environment value");
  assert.equal(output.includes(syntheticPacketSentinel), false, "diagnostic output leaked packet content");
  assert.equal(output.includes(temporaryRoot), false, "diagnostic output leaked a local path");
  assert.equal(output.includes(".txt"), false, "diagnostic output leaked a source filename");
  const lines = output.trim().split("\n").filter(Boolean);
  assert.equal(lines.length, 1, "diagnostic must emit exactly one JSON result");
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.code, expectedCode);
  assert.equal(parsed.ok, ["READY", "FOUNDATION_READY"].includes(expectedCode));
  assert.equal(result.status, parsed.ok ? 0 : 1);
  return parsed;
}

function runDirectDoctor(workbenchRoot, {
  args = [], env = process.env, expectedCode = "OS_BOUNDARY_NOT_ENFORCED",
} = {}) {
  const result = spawnSync(process.execPath, [
    "--require",
    join(repositoryRoot, "scripts", "deny-network.cjs"),
    join(workbenchRoot, "runtime", "doctor.mjs"),
    ...args,
  ], {
    cwd: workbenchRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env,
  });
  return assertFixedOutput(result, expectedCode);
}

function runFoundationCheck(workbenchRoot, {
  env = sanitizedFoundationEnvironment(), expectedCode = "FOUNDATION_READY",
} = {}) {
  const doctorUrl = pathToFileURL(join(workbenchRoot, "runtime", "doctor.mjs")).href;
  const failuresUrl = pathToFileURL(join(workbenchRoot, "shared", "failures.mjs")).href;
  const program = [
    `import { runDeterministicFoundationChecksForTest } from ${JSON.stringify(doctorUrl)};`,
    `import { fixedFailure } from ${JSON.stringify(failuresUrl)};`,
    "runDeterministicFoundationChecksForTest().then((value) => { process.stdout.write(`${JSON.stringify(value)}\\n`); }).catch((error) => { process.stderr.write(`${JSON.stringify(fixedFailure(error))}\\n`); process.exitCode = 1; });",
  ].join("\n");
  const result = spawnSync(process.execPath, [
    "--require",
    join(repositoryRoot, "scripts", "deny-network.cjs"),
    "--input-type=module",
    "--eval",
    program,
  ], {
    cwd: workbenchRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env,
  });
  return assertFixedOutput(result, expectedCode);
}

function runLauncher(workbenchRoot, {
  args = [], env = process.env, expectedCode = "OS_BOUNDARY_NOT_ENFORCED",
} = {}) {
  const result = spawnSync(join(workbenchRoot, "company-bootstrap", "run-doctor"), args, {
    cwd: workbenchRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env,
  });
  return assertFixedOutput(result, expectedCode);
}

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) return filesBelow(filename);
    return entry.isFile() ? [filename] : [];
  });
}

function normalizeProtectedTree(entry) {
  const stats = lstatSync(entry);
  if (stats.isSymbolicLink()) return;
  if (stats.isDirectory()) {
    chmodSync(entry, 0o750);
    for (const child of readdirSync(entry)) normalizeProtectedTree(join(entry, child));
    return;
  }
  assert.equal(stats.isFile(), true, "protected inventory supports only files and directories");
  chmodSync(entry, 0o640);
}

function permissionEntryForTest(filename, role) {
  const stats = lstatSync(filename);
  return {
    role,
    uid: stats.uid,
    gid: stats.gid,
    mode: stats.mode & 0o777,
    kind: stats.isDirectory() ? "directory" : stats.isFile() ? "file" : "other",
    is_symbolic_link: stats.isSymbolicLink(),
  };
}

function collectProtectedEntriesForTest(entry, output, expectedNpmBinLink) {
  const stats = lstatSync(entry);
  if (stats.isSymbolicLink()) {
    assert.equal(entry, expectedNpmBinLink, "only the exact validated npm bin link may be symbolic");
    return;
  }
  output.push(permissionEntryForTest(
    entry,
    stats.isDirectory() ? PERMISSION_ROLES.PROTECTED_DIRECTORY : PERMISSION_ROLES.PROTECTED_FILE,
  ));
  if (stats.isDirectory()) {
    for (const child of readdirSync(entry)) {
      collectProtectedEntriesForTest(join(entry, child), output, expectedNpmBinLink);
    }
  }
}

function packStagedPackage(key, sourceDirectory) {
  const stage = join(temporaryRoot, "staged-packages", key);
  const destination = join(temporaryRoot, "tarballs", key);
  cpSync(sourceDirectory, stage, { recursive: true });
  const manifestPath = join(stage, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.version = "0.1.1";
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  mkdirSync(destination, { recursive: true });
  run("npm", ["pack", "--pack-destination", destination], { cwd: stage });
  const archives = readdirSync(destination).filter((name) => name.endsWith(".tgz"));
  assert.equal(archives.length, 1);
  return join(destination, archives[0]);
}

function lockIntegrity(workbenchRoot, packageName) {
  const lock = JSON.parse(readFileSync(join(workbenchRoot, "package-lock.json"), "utf8"));
  return lock.packages[`node_modules/${packageName}`].integrity;
}

function writePrivateJson(filename, value) {
  chmodSync(filename, 0o600);
  writeFileSync(filename, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(filename, 0o440);
}

try {
  assert.equal(hostedConfigurationPresent([], false), false);
  assert.equal(hostedConfigurationPresent([], true), true,
    "a readable fixed hosted-key path must be denied");
  for (const name of [
    "RIDDLE_API_KEY", "RIDDLE_API_KEY_FILE", "RIDDLE_API_BASE_URL",
    "RIDDLE_PROOF_API_KEY", "RIDDLE_HOSTED_SYNTHETIC",
  ]) {
    assert.equal(hostedConfigurationPresent([name], false), true,
      `${name} must be denied without inspecting its value`);
  }
  const rootManifest = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
  assert.deepEqual(rootManifest.workspaces, ["packages/*"], "example must remain outside npm workspaces");
  const templateManifest = JSON.parse(readFileSync(join(templateRoot, "package.json"), "utf8"));
  assert.equal(templateManifest.private, true);
  assert.deepEqual(templateManifest.dependencies, {
    "@riddledc/riddle-proof-core": "0.1.1",
    "@riddledc/riddle-proof-local": "0.1.1",
  });

  const fakeRuntimeUid = 501;
  const fakeRuntimeGid = 7001;
  const productionPermissionEntries = [
    { role: PERMISSION_ROLES.ADMIN_DIRECTORY, mode: 0o550, kind: "directory" },
    { role: PERMISSION_ROLES.ADMIN_FILE, mode: 0o440, kind: "file" },
    { role: PERMISSION_ROLES.BOOTSTRAP_DIRECTORY, mode: 0o555, kind: "directory" },
    { role: PERMISSION_ROLES.BOOTSTRAP_FILE, mode: 0o444, kind: "file" },
    { role: PERMISSION_ROLES.BOOTSTRAP_EXECUTABLE, mode: 0o555, kind: "file" },
    { role: PERMISSION_ROLES.PINNED_NODE_DIRECTORY, mode: 0o755, kind: "directory" },
    { role: PERMISSION_ROLES.PINNED_NODE_EXECUTABLE, mode: 0o555, kind: "file" },
    { role: PERMISSION_ROLES.PROTECTED_ANCESTOR_DIRECTORY, mode: 0o755, kind: "directory" },
    { role: PERMISSION_ROLES.PROTECTED_DIRECTORY, mode: 0o750, kind: "directory" },
    { role: PERMISSION_ROLES.PROTECTED_FILE, mode: 0o640, kind: "file" },
  ].map((entry) => ({
    ...entry,
    uid: 0,
    gid: fakeRuntimeGid,
    is_symbolic_link: false,
  }));
  assert.deepEqual(evaluateOsBoundaryPolicy({
    runtime_uid: fakeRuntimeUid,
    runtime_gids: [fakeRuntimeGid],
    entries: productionPermissionEntries,
  }), { ok: true, violations: [] }, "separate owner and runtime group should satisfy policy");
  assert.equal(evaluateOsBoundaryPolicy({
    runtime_uid: fakeRuntimeUid,
    runtime_gids: [fakeRuntimeGid],
    entries: productionPermissionEntries.map((entry) => ({ ...entry, uid: fakeRuntimeUid })),
  }).ok, false, "runtime ownership must never satisfy production policy");
  assert.equal(evaluateOsBoundaryPolicy({
    runtime_uid: 0,
    runtime_gids: [fakeRuntimeGid],
    entries: productionPermissionEntries,
  }).ok, false, "root is not an acceptable runtime identity");
  assert.equal(evaluateOsBoundaryPolicy({
    runtime_uid: fakeRuntimeUid,
    runtime_gids: [fakeRuntimeGid],
    entries: productionPermissionEntries.map((entry, index) => (
      index === productionPermissionEntries.length - 1 ? { ...entry, mode: 0o660 } : entry
    )),
  }).ok, false, "group-writable protected code must fail");
  assert.equal(evaluateOsBoundaryPolicy({
    runtime_uid: fakeRuntimeUid,
    runtime_gids: [fakeRuntimeGid],
    entries: productionPermissionEntries.map((entry, index) => (
      index === 0 ? { ...entry, is_symbolic_link: true } : entry
    )),
  }).ok, false, "symbolic links must fail");
  assert.ok(evaluateOsBoundaryPolicy({
    runtime_uid: fakeRuntimeUid,
    runtime_gids: [fakeRuntimeGid],
    entries: productionPermissionEntries.map((entry) => (
      entry.role === PERMISSION_ROLES.PROTECTED_ANCESTOR_DIRECTORY
        ? { ...entry, mode: 0o775 }
        : entry
    )),
  }).violations.includes("RUNTIME_CAN_REPLACE_PROTECTED_TREE"),
  "a runtime-group-writable ancestor must fail");
  assert.ok(evaluateOsBoundaryPolicy({
    runtime_uid: fakeRuntimeUid,
    runtime_gids: [fakeRuntimeGid],
    entries: productionPermissionEntries.map((entry) => (
      entry.role === PERMISSION_ROLES.PROTECTED_ANCESTOR_DIRECTORY
        ? { ...entry, gid: fakeRuntimeGid + 1, mode: 0o757 }
        : entry
    )),
  }).violations.includes("RUNTIME_CAN_REPLACE_PROTECTED_TREE"),
  "a world-writable ancestor must fail even outside the runtime group");
  assert.ok(evaluateOsBoundaryPolicy({
    runtime_uid: fakeRuntimeUid,
    runtime_gids: [fakeRuntimeGid],
    entries: productionPermissionEntries.map((entry) => (
      entry.role === PERMISSION_ROLES.PROTECTED_ANCESTOR_DIRECTORY
        ? { ...entry, uid: fakeRuntimeUid }
        : entry
    )),
  }).violations.includes("RUNTIME_OWNS_PROTECTED_ENTRY"),
  "a runtime-owned ancestor must fail");
  assert.ok(evaluateOsBoundaryPolicy({
    runtime_uid: fakeRuntimeUid,
    runtime_gids: [fakeRuntimeGid],
    entries: productionPermissionEntries.map((entry) => (
      entry.role === PERMISSION_ROLES.PROTECTED_ANCESTOR_DIRECTORY
        ? { ...entry, is_symbolic_link: true }
        : entry
    )),
  }).violations.includes("PROTECTED_ENTRY_TYPE_INVALID"),
  "a linked ancestor must fail");
  assert.ok(evaluateOsBoundaryPolicy({
    runtime_uid: fakeRuntimeUid,
    runtime_gids: [fakeRuntimeGid],
    entries: productionPermissionEntries.map((entry) => (
      entry.role === PERMISSION_ROLES.PROTECTED_ANCESTOR_DIRECTORY
        ? { ...entry, mode: 0o740 }
        : entry
    )),
  }).violations.includes("RUNTIME_ANCESTOR_TRAVERSE_MISSING"),
  "an untraversable ancestor must fail");

  const runtimeFiles = [
    ...filesBelow(join(templateRoot, "runtime")),
    ...filesBelow(join(templateRoot, "shared")),
  ].filter((filename) => /\.mjs$/u.test(filename));
  const runtimeText = runtimeFiles.map((filename) => readFileSync(filename, "utf8")).join("\n");
  for (const [label, pattern] of [
    ["subprocess import", /["'](?:node:)?child_process["']/u],
    ["network module import", /["'](?:node:)?(?:http|https|http2|net|tls|dns|dgram)(?:\/promises)?["']/u],
    ["ambient fetch", /(?:globalThis\.)?fetch\s*\(/u],
    ["hosted Riddle endpoint", /api\.riddledc\.com/iu],
  ]) {
    assert.equal(pattern.test(runtimeText), false, `offline runtime contains ${label}`);
  }

  run("pnpm", ["--filter", "@riddledc/riddle-proof-core", "build"]);
  run("pnpm", ["--filter", "@riddledc/riddle-proof-local", "build"]);
  const coreArchive = packStagedPackage("core", join(repositoryRoot, "packages", "riddle-proof-core"));
  const localArchive = packStagedPackage("local", join(repositoryRoot, "packages", "riddle-proof-local"));

  const workbenchRoot = join(temporaryRoot, "workbench");
  cpSync(templateRoot, workbenchRoot, { recursive: true });
  run("npm", [
    "install",
    "--offline",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    coreArchive,
    localArchive,
  ], { cwd: workbenchRoot });
  writeFileSync(join(workbenchRoot, "package.json"), `${JSON.stringify(templateManifest, null, 2)}\n`);
  const syntheticLockPath = join(workbenchRoot, "package-lock.json");
  const syntheticLock = JSON.parse(readFileSync(syntheticLockPath, "utf8"));
  syntheticLock.packages[""].dependencies = templateManifest.dependencies;
  for (const { name, archive } of [
    { name: "@riddledc/riddle-proof-core", archive: coreArchive },
    { name: "@riddledc/riddle-proof-local", archive: localArchive },
  ]) {
    const basename = name.split("/")[1];
    syntheticLock.packages[`node_modules/${name}`].resolved =
      `https://registry.npmjs.org/${name}/-/${basename}-0.1.1.tgz`;
    assert.ok(archive.endsWith(".tgz"));
  }
  writeFileSync(syntheticLockPath, `${JSON.stringify(syntheticLock, null, 2)}\n`);
  const installedRootManifest = JSON.parse(readFileSync(join(workbenchRoot, "package.json"), "utf8"));
  assert.deepEqual(installedRootManifest.dependencies, templateManifest.dependencies,
    "fixture install must preserve production exact pins");
  const lock = JSON.parse(readFileSync(join(workbenchRoot, "package-lock.json"), "utf8"));
  assert.deepEqual(lock.packages[""].dependencies, templateManifest.dependencies,
    "fixture lock must preserve production exact pins");
  assert.deepEqual(validateInstalledBinLinks(workbenchRoot), [{
    name: "riddle-proof-local",
    target: "../@riddledc/riddle-proof-local/bin/riddle-proof-local",
  }], "actual npm install must contain the one exact supported .bin link");
  chmodSync(workbenchRoot, 0o750);
  for (const filename of [
    ".gitignore", "RUNTIME_INSTRUCTIONS.md", "README.md", "package.json", "package-lock.json",
  ]) {
    chmodSync(join(workbenchRoot, filename), 0o640);
  }
  for (const directory of ["admin", "runtime", "shared", "synthetic", "node_modules"]) {
    normalizeProtectedTree(join(workbenchRoot, directory));
  }

  const syntheticAdmin = join(temporaryRoot, "synthetic-admin");
  mkdirSync(syntheticAdmin, { recursive: true, mode: 0o700 });
  const ruleBundlePath = join(syntheticAdmin, "rule-bundle.json");
  const ruleReferencePath = join(syntheticAdmin, "rule-reference.json");
  const packetRulePath = join(syntheticAdmin, "packet-rule.json");
  run(process.execPath, [
    join(workbenchRoot, "admin", "create-rule-root.mjs"),
    "--definitions", join(workbenchRoot, "synthetic", "rule-definitions.json"),
    "--trust-root-id", "synthetic-private-workbench-rules",
    "--trust-root-version", "1",
    "--bundle-out", ruleBundlePath,
    "--reference-out", ruleReferencePath,
    "--packet-rule-out", packetRulePath,
  ], { cwd: workbenchRoot });
  const createdRules = {
    bundle: JSON.parse(readFileSync(ruleBundlePath, "utf8")),
    trust_root: JSON.parse(readFileSync(ruleReferencePath, "utf8")),
  };
  const packetCompleteRule = JSON.parse(readFileSync(packetRulePath, "utf8"));
  const diagnosticTemplates = JSON.parse(readFileSync(join(
    workbenchRoot, "synthetic", "diagnostic-evidence-profile-templates.json",
  ), "utf8"));
  const { publicKey: productionEvidencePublicKey } = generateKeyPairSync("ed25519");
  const productionEvidenceSpki = productionEvidencePublicKey
    .export({ format: "der", type: "spki" }).toString("base64");
  const productionTemplates = JSON.parse(JSON.stringify(diagnosticTemplates)
    .replaceAll("riddle-proof.diagnostic.snapshot-captured", "local-document-snapshot-captured")
    .replaceAll("riddle-proof.diagnostic.required-roles-present", "local-document-required-roles-present")
    .replaceAll("riddle-proof.diagnostic.workflow-observed", "client-workflow-observed")
    .replaceAll("riddle-proof.diagnostic.snapshot-current-at-check", "local-document-snapshot-current-at-check"));
  for (const profile of productionTemplates.profile_templates) {
    profile.profile_id = profile.profile_id.replace("riddle-proof.synthetic-", "company-test.");
    profile.trusted_signer = {
      key_id: "company-test-evidence-key",
      public_key_spki_base64: productionEvidenceSpki,
    };
  }
  const productionTemplatesPath = join(syntheticAdmin, "company-evidence-templates.json");
  writeFileSync(productionTemplatesPath, `${JSON.stringify(productionTemplates)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  const evidenceBundlePath = join(syntheticAdmin, "evidence-bundle.json");
  const evidenceReferencePath = join(syntheticAdmin, "evidence-reference.json");
  run(process.execPath, [
    join(workbenchRoot, "admin", "create-evidence-root.mjs"),
    "--templates", productionTemplatesPath,
    "--trust-root-id", "synthetic-private-workbench-evidence",
    "--trust-root-version", "1",
    "--bundle-out", evidenceBundlePath,
    "--reference-out", evidenceReferencePath,
  ], { cwd: workbenchRoot });
  const createdEvidence = {
    bundle: JSON.parse(readFileSync(evidenceBundlePath, "utf8")),
    trust_root: JSON.parse(readFileSync(evidenceReferencePath, "utf8")),
  };
  assert.equal(JSON.stringify(createdEvidence.bundle).includes(
    "synthetic-offline-foundation-key",
  ), false, "public diagnostic signer must be absent from the production evidence root");

  const hostileEvidenceTemplates = JSON.parse(JSON.stringify(productionTemplates));
  for (const profile of hostileEvidenceTemplates.profile_templates) {
    profile.trusted_signer = {
      key_id: PUBLIC_DIAGNOSTIC_AUTHORITY.signer_key_id,
      public_key_spki_base64: PUBLIC_DIAGNOSTIC_AUTHORITY.signer_public_key_spki_base64,
    };
  }
  const hostileEvidenceTemplatesPath = join(syntheticAdmin, "hostile-evidence-templates.json");
  writeFileSync(hostileEvidenceTemplatesPath, `${JSON.stringify(hostileEvidenceTemplates)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  const hostileEvidenceBundlePath = join(syntheticAdmin, "hostile-evidence-bundle.json");
  const hostileEvidenceReferencePath = join(syntheticAdmin, "hostile-evidence-reference.json");
  run(process.execPath, [
    join(workbenchRoot, "admin", "create-evidence-root.mjs"),
    "--templates", hostileEvidenceTemplatesPath,
    "--trust-root-id", "company-hostile-public-diagnostic-evidence",
    "--trust-root-version", "1",
    "--bundle-out", hostileEvidenceBundlePath,
    "--reference-out", hostileEvidenceReferencePath,
  ], { cwd: workbenchRoot });
  const hostileEvidence = {
    bundle: JSON.parse(readFileSync(hostileEvidenceBundlePath, "utf8")),
    trust_root: JSON.parse(readFileSync(hostileEvidenceReferencePath, "utf8")),
  };

  const hostileRuleDefinitions = JSON.parse(readFileSync(
    join(workbenchRoot, "synthetic", "rule-definitions.json"), "utf8",
  ));
  hostileRuleDefinitions.rules.push(JSON.parse(readFileSync(
    join(workbenchRoot, "synthetic", "diagnostic-rule-definitions.json"), "utf8",
  )).rules[0]);
  const hostileRuleDefinitionsPath = join(syntheticAdmin, "hostile-rule-definitions.json");
  writeFileSync(hostileRuleDefinitionsPath, `${JSON.stringify(hostileRuleDefinitions)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  const hostileRuleBundlePath = join(syntheticAdmin, "hostile-rule-bundle.json");
  const hostileRuleReferencePath = join(syntheticAdmin, "hostile-rule-reference.json");
  const hostilePacketRulePath = join(syntheticAdmin, "hostile-packet-rule.json");
  run(process.execPath, [
    join(workbenchRoot, "admin", "create-rule-root.mjs"),
    "--definitions", hostileRuleDefinitionsPath,
    "--trust-root-id", "company-hostile-diagnostic-rules",
    "--trust-root-version", "1",
    "--bundle-out", hostileRuleBundlePath,
    "--reference-out", hostileRuleReferencePath,
    "--packet-rule-out", hostilePacketRulePath,
  ], { cwd: workbenchRoot });
  const hostileRules = {
    bundle: JSON.parse(readFileSync(hostileRuleBundlePath, "utf8")),
    trust_root: JSON.parse(readFileSync(hostileRuleReferencePath, "utf8")),
    packet_rule: JSON.parse(readFileSync(hostilePacketRulePath, "utf8")),
  };

  const outputRoot = join(temporaryRoot, "approved-output");
  mkdirSync(join(outputRoot, "machine"), { recursive: true, mode: 0o700 });
  mkdirSync(join(outputRoot, "privileged"), { recursive: true, mode: 0o700 });
  chmodSync(outputRoot, 0o700);
  chmodSync(join(outputRoot, "machine"), 0o700);
  chmodSync(join(outputRoot, "privileged"), 0o700);
  const privilegedFile = join(outputRoot, "privileged", "synthetic-private-review.txt");
  writeFileSync(privilegedFile, privilegedSentinel, { encoding: "utf8", mode: 0o600 });
  chmodSync(privilegedFile, 0o600);

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyBytes = privateKey.export({ format: "pem", type: "pkcs8" });
  const publicKeyBytes = publicKey.export({ format: "der", type: "spki" });
  const bootstrapDirectory = join(workbenchRoot, "company-bootstrap");
  const pinnedNodeDirectory = join(temporaryRoot, "pinned-node");
  mkdirSync(pinnedNodeDirectory, { mode: 0o755 });
  chmodSync(pinnedNodeDirectory, 0o755);
  const pinnedNodeExecutable = join(pinnedNodeDirectory, "node");
  copyFileSync(realpathSync(process.execPath), pinnedNodeExecutable);
  chmodSync(pinnedNodeExecutable, 0o555);
  const bootstrapPath = join(bootstrapDirectory, "admin-signer.json");
  writeFileSync(bootstrapPath, `${JSON.stringify({
    version: "riddle-proof.private-workbench-bootstrap.v1",
    key_id: "synthetic-admin-key",
    public_key_spki_sha256: `sha256:${createHash("sha256").update(publicKeyBytes).digest("hex")}`,
  })}\n`, { encoding: "utf8", mode: 0o444 });
  chmodSync(bootstrapPath, 0o444);
  const pinnedNodePath = join(bootstrapDirectory, "node-path");
  writeFileSync(pinnedNodePath, `${realpathSync(pinnedNodeExecutable)}\n`, {
    encoding: "utf8",
    mode: 0o444,
  });
  chmodSync(pinnedNodePath, 0o444);
  chmodSync(join(bootstrapDirectory, "README.md"), 0o444);
  chmodSync(join(bootstrapDirectory, "deny-network.cjs"), 0o444);
  chmodSync(join(bootstrapDirectory, "run-doctor"), 0o555);
  chmodSync(bootstrapDirectory, 0o555);
  const approvedSurfaces = JSON.parse(readFileSync(
    join(workbenchRoot, "synthetic", "approved-surfaces.json"),
    "utf8",
  ));
  const verifiedAt = "2026-07-19T22:00:00.000Z";
  const verifiedPackages = [
    "@riddledc/riddle-proof-core",
    "@riddledc/riddle-proof-local",
  ].map((name) => ({
    name,
    version: "0.1.1",
    integrity: lockIntegrity(workbenchRoot, name),
    attestations_url: `https://registry.npmjs.org/-/npm/v1/attestations/${name.replaceAll("/", "%2f")}@0.1.1`,
    provenance_predicate_type: "https://slsa.dev/provenance/v1",
    verification_method: "npm-audit-signatures",
    verified_at: verifiedAt,
  }));
  const provisionModule = await import(pathToFileURL(
    join(workbenchRoot, "admin", "provision.mjs"),
  ).href);
  const provisionInput = {
    workbench_root: realpathSync(workbenchRoot),
    approved_output_root: realpathSync(outputRoot),
    rule_bundle: createdRules.bundle,
    expected_rule_trust_root: createdRules.trust_root,
    evidence_trust_root_bundle: createdEvidence.bundle,
    expected_evidence_trust_root: createdEvidence.trust_root,
    packet_complete_rule: packetCompleteRule,
    approved_surfaces: approvedSurfaces,
    signing_private_key: privateKeyBytes,
    signing_key_id: "synthetic-admin-key",
    created_at: verifiedAt,
    verified_packages: verifiedPackages,
  };
  await assert.rejects(
    provisionModule.provisionFromVerifiedEvidence({
      ...provisionInput,
      evidence_trust_root_bundle: hostileEvidence.bundle,
      expected_evidence_trust_root: hostileEvidence.trust_root,
    }),
    /public diagnostic authority is forbidden/u,
    "provisioning must reject the public diagnostic signer under production claim IDs",
  );
  await assert.rejects(
    provisionModule.provisionFromVerifiedEvidence({
      ...provisionInput,
      rule_bundle: hostileRules.bundle,
      expected_rule_trust_root: hostileRules.trust_root,
      packet_complete_rule: hostileRules.packet_rule,
    }),
    /public diagnostic authority is forbidden/u,
    "provisioning must reject diagnostic namespaces in a production rule root",
  );
  await provisionModule.provisionFromVerifiedEvidence(provisionInput);

  const actualPermissionEntries = [];
  actualPermissionEntries.push(permissionEntryForTest(
    workbenchRoot, PERMISSION_ROLES.PROTECTED_DIRECTORY,
  ));
  for (const filename of [
    ".gitignore", "RUNTIME_INSTRUCTIONS.md", "README.md", "package.json", "package-lock.json",
  ]) {
    actualPermissionEntries.push(permissionEntryForTest(
      join(workbenchRoot, filename), PERMISSION_ROLES.PROTECTED_FILE,
    ));
  }
  const actualNpmBinLink = join(workbenchRoot, "node_modules", ".bin", "riddle-proof-local");
  for (const directory of ["admin", "runtime", "shared", "synthetic", "node_modules"]) {
    collectProtectedEntriesForTest(
      join(workbenchRoot, directory), actualPermissionEntries, actualNpmBinLink,
    );
  }
  const adminStateDirectory = join(workbenchRoot, "admin-state");
  actualPermissionEntries.push(permissionEntryForTest(
    adminStateDirectory, PERMISSION_ROLES.ADMIN_DIRECTORY,
  ));
  for (const filename of readdirSync(adminStateDirectory)) {
    actualPermissionEntries.push(permissionEntryForTest(
      join(adminStateDirectory, filename), PERMISSION_ROLES.ADMIN_FILE,
    ));
  }
  actualPermissionEntries.push(permissionEntryForTest(
    bootstrapDirectory, PERMISSION_ROLES.BOOTSTRAP_DIRECTORY,
  ));
  for (const filename of ["README.md", "admin-signer.json", "deny-network.cjs", "node-path"]) {
    actualPermissionEntries.push(permissionEntryForTest(
      join(bootstrapDirectory, filename), PERMISSION_ROLES.BOOTSTRAP_FILE,
    ));
  }
  actualPermissionEntries.push(permissionEntryForTest(
    join(bootstrapDirectory, "run-doctor"), PERMISSION_ROLES.BOOTSTRAP_EXECUTABLE,
  ));
  actualPermissionEntries.push(permissionEntryForTest(
    pinnedNodeDirectory, PERMISSION_ROLES.PINNED_NODE_DIRECTORY,
  ));
  actualPermissionEntries.push(permissionEntryForTest(
    pinnedNodeExecutable, PERMISSION_ROLES.PINNED_NODE_EXECUTABLE,
  ));
  const actualOwnerUid = lstatSync(workbenchRoot).uid;
  const actualGids = [...new Set(actualPermissionEntries.map(({ gid }) => gid))];
  const actualSameOwner = evaluateOsBoundaryPolicy({
    runtime_uid: actualOwnerUid,
    runtime_gids: actualGids,
    entries: actualPermissionEntries,
  });
  assert.deepEqual(actualSameOwner.violations, ["RUNTIME_OWNS_PROTECTED_ENTRY"],
    "normalized fixture must fail the modeled policy only because it has one owner UID");
  assert.deepEqual(evaluateOsBoundaryPolicy({
    runtime_uid: actualOwnerUid + 100_000,
    runtime_gids: actualGids,
    entries: actualPermissionEntries,
  }), { ok: true, violations: [] },
  "the actual installed inventory and npm link must otherwise satisfy the production policy");

  assert.deepEqual(runFoundationCheck(workbenchRoot), {
    ok: true,
    code: "FOUNDATION_READY",
  }, "deterministic checks may pass but can never claim runtime readiness");
  const sameUserBoundaryFailure = runDirectDoctor(workbenchRoot, {
    expectedCode: "OS_BOUNDARY_NOT_ENFORCED",
  });
  assert.deepEqual(sameUserBoundaryFailure, {
    ok: false,
    code: "OS_BOUNDARY_NOT_ENFORCED",
  });
  assert.deepEqual(runLauncher(workbenchRoot), sameUserBoundaryFailure,
    "launcher must reject a same-owner fixture without executing the doctor");
  const sameOwnerExecutionMarker = join(temporaryRoot, "same-owner-node-executed");
  const sameOwnerTrap = join(temporaryRoot, "same-owner-node-trap");
  writeFileSync(sameOwnerTrap, [
    "#!/bin/sh",
    `/usr/bin/touch ${JSON.stringify(sameOwnerExecutionMarker)}`,
  ].join("\n"), { mode: 0o555 });
  chmodSync(sameOwnerTrap, 0o555);
  const originalPinnedNodeBytes = readFileSync(pinnedNodePath);
  chmodSync(pinnedNodePath, 0o644);
  writeFileSync(pinnedNodePath, `${sameOwnerTrap}\n`);
  chmodSync(pinnedNodePath, 0o444);
  runLauncher(workbenchRoot, { expectedCode: "OS_BOUNDARY_NOT_ENFORCED" });
  assert.equal(existsSync(sameOwnerExecutionMarker), false,
    "same-owner rejection must happen before the pinned executable runs");
  chmodSync(pinnedNodePath, 0o644);
  writeFileSync(pinnedNodePath, originalPinnedNodeBytes);
  chmodSync(pinnedNodePath, 0o444);

  runDirectDoctor(workbenchRoot, {
    args: ["--rule-bundle", "alternate.json"],
    expectedCode: "ARGUMENT_OVERRIDE_FORBIDDEN",
  });
  runLauncher(workbenchRoot, {
    args: ["--rule-bundle", "alternate.json"],
    expectedCode: "ARGUMENT_OVERRIDE_FORBIDDEN",
  });
  const preloadMarker = join(temporaryRoot, "node-options-marker");
  const preloadPath = join(temporaryRoot, "hostile-preload.cjs");
  writeFileSync(preloadPath, [
    'const { writeFileSync } = require("node:fs");',
    `writeFileSync(${JSON.stringify(preloadMarker)}, "executed");`,
  ].join("\n"));
  runLauncher(workbenchRoot, {
    env: { ...process.env, NODE_OPTIONS: `--require=${preloadPath}` },
    expectedCode: "RUNTIME_ENV_INVALID",
  });
  assert.equal(existsSync(preloadMarker), false,
    "launcher must reject NODE_OPTIONS before the pinned Node executes");

  const rulePath = join(workbenchRoot, "admin-state", "rule-trust-root.json");
  const originalRuleBytes = readFileSync(rulePath);
  const tamperedRules = JSON.parse(originalRuleBytes.toString("utf8"));
  tamperedRules.synthetic_private_value = privilegedSentinel;
  writePrivateJson(rulePath, tamperedRules);
  runFoundationCheck(workbenchRoot, { expectedCode: "RULE_TRUST_ROOT_INVALID" });
  chmodSync(rulePath, 0o600);
  writeFileSync(rulePath, originalRuleBytes, { mode: 0o600 });
  chmodSync(rulePath, 0o440);

  const installedEvidencePath = join(workbenchRoot, "admin-state", "evidence-trust-root.json");
  const originalEvidenceBytes = readFileSync(installedEvidencePath);
  const tamperedEvidence = JSON.parse(originalEvidenceBytes.toString("utf8"));
  tamperedEvidence.synthetic_private_value = privilegedSentinel;
  writePrivateJson(installedEvidencePath, tamperedEvidence);
  runFoundationCheck(workbenchRoot, { expectedCode: "EVIDENCE_TRUST_ROOT_INVALID" });
  chmodSync(installedEvidencePath, 0o600);
  writeFileSync(installedEvidencePath, originalEvidenceBytes, { mode: 0o600 });
  chmodSync(installedEvidencePath, 0o440);

  const originalBootstrapBytes = readFileSync(bootstrapPath);
  const substitutedBootstrap = JSON.parse(originalBootstrapBytes.toString("utf8"));
  substitutedBootstrap.public_key_spki_sha256 = `sha256:${"a".repeat(64)}`;
  chmodSync(bootstrapPath, 0o644);
  writeFileSync(bootstrapPath, `${JSON.stringify(substitutedBootstrap)}\n`, "utf8");
  chmodSync(bootstrapPath, 0o444);
  runFoundationCheck(workbenchRoot, { expectedCode: "SUPPLY_CHAIN_SIGNATURE_INVALID" });
  chmodSync(bootstrapPath, 0o644);
  writeFileSync(bootstrapPath, originalBootstrapBytes);
  chmodSync(bootstrapPath, 0o444);

  const lockPath = join(workbenchRoot, "admin-state", "supply-chain-lock.json");
  const originalLockBytes = readFileSync(lockPath);
  const policyPath = join(workbenchRoot, "admin-state", "runtime-policy.json");
  const originalPolicyBytes = readFileSync(policyPath);
  const signStateVariant = (policy, lock) => {
    lock.payload.runtime_policy_digest = canonicalDigest(
      "riddle-proof.private-workbench-runtime-policy.v1",
      policy,
    );
    lock.signature.signature_base64 = sign(null, Buffer.concat([
      Buffer.from("riddle-proof.private-workbench-supply-chain-lock.v1\0", "utf8"),
      Buffer.from(canonicalJson(lock.payload), "utf8"),
    ]), privateKey).toString("base64");
    writePrivateJson(policyPath, policy);
    writePrivateJson(lockPath, lock);
  };
  const restoreSignedState = () => {
    for (const [filename, bytes] of [
      [policyPath, originalPolicyBytes],
      [lockPath, originalLockBytes],
      [rulePath, originalRuleBytes],
      [installedEvidencePath, originalEvidenceBytes],
    ]) {
      chmodSync(filename, 0o600);
      writeFileSync(filename, bytes, { mode: 0o600 });
      chmodSync(filename, 0o440);
    }
  };

  const hostileEvidencePolicy = JSON.parse(originalPolicyBytes.toString("utf8"));
  hostileEvidencePolicy.evidence_trust_root = hostileEvidence.trust_root;
  const hostileEvidenceLock = JSON.parse(originalLockBytes.toString("utf8"));
  hostileEvidenceLock.payload.evidence_trust_root = hostileEvidence.trust_root;
  signStateVariant(hostileEvidencePolicy, hostileEvidenceLock);
  writePrivateJson(installedEvidencePath, hostileEvidence.bundle);
  runFoundationCheck(workbenchRoot, { expectedCode: "EVIDENCE_TRUST_ROOT_INVALID" });
  restoreSignedState();

  const hostileRulePolicy = JSON.parse(originalPolicyBytes.toString("utf8"));
  hostileRulePolicy.rule_trust_root = hostileRules.trust_root;
  hostileRulePolicy.packet_complete_rule = hostileRules.packet_rule;
  const hostileRuleLock = JSON.parse(originalLockBytes.toString("utf8"));
  hostileRuleLock.payload.rule_trust_root = hostileRules.trust_root;
  signStateVariant(hostileRulePolicy, hostileRuleLock);
  writePrivateJson(rulePath, hostileRules.bundle);
  runFoundationCheck(workbenchRoot, { expectedCode: "RULE_TRUST_ROOT_INVALID" });
  restoreSignedState();

  const tamperedLock = JSON.parse(originalLockBytes.toString("utf8"));
  tamperedLock.signature.signature_base64 = `${tamperedLock.signature.signature_base64.slice(0, -2)}AA`;
  writePrivateJson(lockPath, tamperedLock);
  runFoundationCheck(workbenchRoot, { expectedCode: "SUPPLY_CHAIN_SIGNATURE_INVALID" });
  chmodSync(lockPath, 0o600);
  writeFileSync(lockPath, originalLockBytes, { mode: 0o600 });
  chmodSync(lockPath, 0o440);

  const coreReadme = join(
    workbenchRoot, "node_modules", "@riddledc", "riddle-proof-core", "README.md",
  );
  const originalCoreReadme = readFileSync(coreReadme);
  writeFileSync(coreReadme, Buffer.concat([originalCoreReadme, Buffer.from(privilegedSentinel)]));
  runFoundationCheck(workbenchRoot, { expectedCode: "PACKAGE_TREE_MISMATCH" });
  writeFileSync(coreReadme, originalCoreReadme);

  const forbiddenDirectory = join(
    workbenchRoot, "node_modules", "@riddledc", "riddle-proof",
  );
  mkdirSync(forbiddenDirectory, { recursive: true });
  writeFileSync(join(forbiddenDirectory, "package.json"), JSON.stringify({
    name: "@riddledc/riddle-proof",
    version: "0.0.0",
  }));
  runFoundationCheck(workbenchRoot, { expectedCode: "FORBIDDEN_PACKAGE_PRESENT" });
  rmSync(forbiddenDirectory, { recursive: true, force: true });

  const linkPath = join(outputRoot, "privileged", "synthetic-link");
  symlinkSync(privilegedFile, linkPath);
  runFoundationCheck(workbenchRoot, { expectedCode: "OUTPUT_BOUNDARY_INVALID" });
  rmSync(linkPath);

  const machineDirectory = join(outputRoot, "machine");
  rmSync(machineDirectory, { recursive: true });
  writeFileSync(machineDirectory, "not a directory", { mode: 0o700 });
  chmodSync(machineDirectory, 0o700);
  runFoundationCheck(workbenchRoot, { expectedCode: "OUTPUT_BOUNDARY_INVALID" });
  rmSync(machineDirectory);
  mkdirSync(machineDirectory, { mode: 0o700 });
  chmodSync(machineDirectory, 0o700);

  const wrongModeOutputFile = join(machineDirectory, "wrong-mode-receipt.json");
  writeFileSync(wrongModeOutputFile, "{}\n", { mode: 0o700 });
  chmodSync(wrongModeOutputFile, 0o700);
  runFoundationCheck(workbenchRoot, { expectedCode: "OUTPUT_BOUNDARY_INVALID" });
  rmSync(wrongModeOutputFile);

  const wrongModeOutputDirectory = join(machineDirectory, "wrong-mode-directory");
  mkdirSync(wrongModeOutputDirectory, { mode: 0o600 });
  chmodSync(wrongModeOutputDirectory, 0o600);
  runFoundationCheck(workbenchRoot, { expectedCode: "OUTPUT_BOUNDARY_INVALID" });
  chmodSync(wrongModeOutputDirectory, 0o700);
  rmSync(wrongModeOutputDirectory, { recursive: true });

  const npmBinLink = join(workbenchRoot, "node_modules", ".bin", "riddle-proof-local");
  unlinkSync(npmBinLink);
  symlinkSync("../@riddledc/riddle-proof-core/package.json", npmBinLink);
  runFoundationCheck(workbenchRoot, { expectedCode: "DEPENDENCY_CLOSURE_INVALID" });
  unlinkSync(npmBinLink);
  symlinkSync("../@riddledc/riddle-proof-local/bin/riddle-proof-local", npmBinLink);
  assert.equal(validateInstalledBinLinks(workbenchRoot).length, 1);


  assert.equal(lstatSync(join(workbenchRoot, "admin-state")).mode & 0o777, 0o550);
  for (const filename of [
    "runtime-policy.json",
    "supply-chain-lock.json",
    "rule-trust-root.json",
    "evidence-trust-root.json",
  ]) {
    assert.equal(lstatSync(join(workbenchRoot, "admin-state", filename)).mode & 0o777, 0o440);
  }
  console.log(JSON.stringify({
    ok: true,
    suite: "private-workbench-transfer",
    fixture_kind: "same-user-synthetic-foundation",
    deterministic_foundation_checks_complete: true,
    synthetic_doctor_ok: false,
    synthetic_doctor_code: "OS_BOUNDARY_NOT_ENFORCED",
    production_ready: false,
    production_ready_requires_external_os_boundary: true,
    direct_doctor_never_ready: true,
    external_launcher_required: true,
    injection_environment_rejected_before_node: true,
    exact_npm_bin_inventory: true,
    actual_installed_tree_policy_positive_under_distinct_owner: true,
    protected_ancestor_policy_unit_tested: true,
    exact_output_entry_types_and_modes: true,
    production_permission_policy_unit_tested: true,
    production_pins: ["@riddledc/riddle-proof-core@0.1.1", "@riddledc/riddle-proof-local@0.1.1"],
    offline_runtime: true,
    deterministic_replay: true,
    reusable_evidence_root: true,
    diagnostic_authority_separate_from_production: true,
    exact_observation_schema_negatives: true,
    independently_anchored_admin_signer: true,
    fixed_error_codes: true,
    privileged_leakage_rejected: true,
  }));
} finally {
  try {
    chmodSync(join(temporaryRoot, "workbench", "company-bootstrap"), 0o700);
  } catch {
    // The workbench may not have reached bootstrap creation.
  }
  try {
    chmodSync(join(temporaryRoot, "workbench", "admin-state"), 0o700);
  } catch {
    // The workbench may not have reached provisioning.
  }
  rmSync(temporaryRoot, { recursive: true, force: true });
}
