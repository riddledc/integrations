import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = mkdtempSync(path.join(tmpdir(), "riddle-proof-install-boundaries-"));

const packages = {
  appContract: "packages/riddle-proof-app-contract",
  core: "packages/riddle-proof-core",
  local: "packages/riddle-proof-local",
  playwright: "packages/riddle-proof-runner-playwright",
  hosted: "packages/riddle-proof-riddle-client",
  facade: "packages/riddle-proof",
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error([
      `${command} ${args.join(" ")} failed with status ${result.status}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join("\n"));
  }
  return result.stdout;
}

function filesBelow(target) {
  if (!statSync(target, { throwIfNoEntry: false })) return [];
  const stats = statSync(target);
  if (stats.isFile()) return [target];
  if (!stats.isDirectory()) return [];
  return readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) return filesBelow(child);
    return entry.isFile() ? [child] : [];
  });
}

function pack(key) {
  const packDirectory = path.join(temporaryRoot, "tarballs", key);
  mkdirSync(packDirectory, { recursive: true });
  run("pnpm", ["pack", "--pack-destination", packDirectory], {
    cwd: path.join(repositoryRoot, packages[key]),
  });
  const archives = readdirSync(packDirectory).filter((name) => name.endsWith(".tgz"));
  assert.equal(archives.length, 1, `${key} must produce exactly one npm tarball`);
  const archive = path.join(packDirectory, archives[0]);
  const entries = run("tar", ["-tzf", archive]).split("\n").filter(Boolean);
  assert.ok(entries.includes("package/package.json"), `${key} tarball must contain package.json`);
  assert.ok(entries.includes("package/capabilities.json") || key === "appContract",
    `${key} tarball must contain capabilities.json`);
  assert.ok(entries.some((entry) => entry.startsWith("package/dist/")), `${key} tarball must contain dist`);
  assert.deepEqual(
    entries.filter((entry) => /(?:^|\/)__pycache__\/|\.pyc$/u.test(entry)),
    [],
    `${key} tarball must not contain generated Python bytecode`,
  );
  const manifest = JSON.parse(run("tar", ["-xOzf", archive, "package/package.json"]));
  return { archive, manifest };
}

function dependencyNames(tree, names = new Set()) {
  if (!tree || typeof tree !== "object") return names;
  for (const [name, dependency] of Object.entries(tree.dependencies || {})) {
    names.add(name);
    dependencyNames(dependency, names);
  }
  return names;
}

function installCase(name, packedPackages) {
  const directory = path.join(temporaryRoot, "installs", name);
  const cacheDirectory = path.join(temporaryRoot, "npm-cache", name);
  mkdirSync(directory, { recursive: true });
  mkdirSync(cacheDirectory, { recursive: true });
  writeFileSync(path.join(directory, "package.json"), `${JSON.stringify({
    name: `riddle-proof-boundary-${name}`,
    version: "0.0.0",
    private: true,
  }, null, 2)}\n`, "utf8");
  run("npm", [
    "install",
    "--offline",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--legacy-peer-deps",
    "--omit=peer",
    "--cache", cacheDirectory,
    "--package-lock=false",
    ...packedPackages.map((packed) => packed.archive),
  ], { cwd: directory });
  const tree = JSON.parse(run("npm", ["ls", "--all", "--json"], { cwd: directory }));
  for (const packed of packedPackages) {
    const installedManifest = JSON.parse(readFileSync(
      path.join(directory, "node_modules", ...packed.manifest.name.split("/"), "package.json"),
      "utf8",
    ));
    assert.equal(installedManifest.name, packed.manifest.name);
    assert.equal(installedManifest.version, packed.manifest.version,
      `${packed.manifest.name} installed version must come from the supplied tarball`);
  }
  return { directory, dependencies: dependencyNames(tree) };
}

function runNetworkDeniedSmoke(install, name, source) {
  const filename = path.join(install.directory, `${name}.mjs`);
  writeFileSync(filename, source, "utf8");
  run(process.execPath, [
    "--require",
    path.join(repositoryRoot, "scripts", "deny-network.cjs"),
    filename,
  ], { cwd: install.directory });
}

function scanDirectory(directory, patterns) {
  return scanFiles(filesBelow(directory), directory, patterns);
}

function scanJavaScriptDirectory(directory, patterns) {
  return scanFiles(
    filesBelow(directory).filter((filename) => /\.(?:[cm]?js)$/u.test(filename)),
    directory,
    patterns,
  );
}

function scanFiles(files, relativeRoot, patterns) {
  const findings = [];
  for (const filename of files) {
    const contents = readFileSync(filename).toString("utf8");
    for (const [label, pattern] of patterns) {
      if (pattern.test(contents)) findings.push(`${path.relative(relativeRoot, filename)}: ${label}`);
    }
  }
  return findings;
}

function installedPackageCount(installDirectory, packageName) {
  return filesBelow(path.join(installDirectory, "node_modules"))
    .filter((filename) => path.basename(filename) === "package.json")
    .reduce((count, filename) => {
      try {
        return JSON.parse(readFileSync(filename, "utf8")).name === packageName ? count + 1 : count;
      } catch {
        return count;
      }
    }, 0);
}

function assertExportTargetsInstalled(packageDirectory) {
  const manifest = JSON.parse(readFileSync(path.join(packageDirectory, "package.json"), "utf8"));
  const targets = [];
  function collect(value) {
    if (typeof value === "string") {
      if (value.startsWith("./")) targets.push(value.slice(2));
    } else if (value && typeof value === "object") {
      for (const nested of Object.values(value)) collect(nested);
    }
  }
  collect(manifest.main);
  collect(manifest.module);
  collect(manifest.types);
  collect(manifest.exports);
  collect(manifest.bin);
  for (const target of new Set(targets)) {
    assert.ok(statSync(path.join(packageDirectory, target), { throwIfNoEntry: false }),
      `${manifest.name} installed export target is missing: ${target}`);
  }
}

const hostedMarkers = [
  ["hosted Riddle endpoint", /api\.riddledc\.com/i],
  ["hosted Riddle API key", /RIDDLE_API_KEY/],
];
const hostedApiPathLiterals = [
  ["hosted Riddle /v1 API path literal", /\/v1(?:\/|["'`])/u],
];
const coreForbidden = [
  ...hostedMarkers,
  ["filesystem or subprocess import", /["'](?:node:)?(?:fs(?:\/promises)?|child_process)["']/],
  ["network import", /["'](?:node:)?(?:http|https|http2|net|tls|dns|dgram)(?:\/promises)?["']/],
  ["ambient fetch", /(?:globalThis\.)?fetch\s*\(/],
  ["ambient WebSocket", /\bWebSocket\s*\(/],
];
const localForbidden = [
  ...hostedMarkers,
  ["network import", /["'](?:node:)?(?:http|https|http2|net|tls|dns|dgram)(?:\/promises)?["']/],
  ["ambient fetch", /(?:globalThis\.)?fetch\s*\(/],
  ["ambient WebSocket", /\bWebSocket\s*\(/],
];

try {
  const archives = Object.fromEntries(Object.keys(packages).map((key) => [key, pack(key)]));

  const localInstall = installCase("core-local", [archives.core, archives.local]);
  assert.deepEqual([...localInstall.dependencies].sort(), [
    "@riddledc/riddle-proof-core",
    "@riddledc/riddle-proof-local",
  ]);
  assert.equal(installedPackageCount(localInstall.directory, "@riddledc/riddle-proof-core"), 1,
    "core-local must install exactly one supplied core instance");
  const localScope = path.join(localInstall.directory, "node_modules", "@riddledc");
  assert.deepEqual(scanDirectory(path.join(localScope, "riddle-proof-core"), coreForbidden), []);
  assert.deepEqual(scanDirectory(path.join(localScope, "riddle-proof-local"), localForbidden), []);
  assert.deepEqual(scanJavaScriptDirectory(
    path.join(localScope, "riddle-proof-core"),
    hostedApiPathLiterals,
  ), []);
  assert.deepEqual(scanJavaScriptDirectory(
    path.join(localScope, "riddle-proof-local"),
    hostedApiPathLiterals,
  ), []);
  assertExportTargetsInstalled(path.join(localScope, "riddle-proof-core"));
  assertExportTargetsInstalled(path.join(localScope, "riddle-proof-local"));
  const localSample = path.join(localInstall.directory, "sample-amendment.txt");
  writeFileSync(localSample, "synthetic amendment bytes\n", "utf8");
  runNetworkDeniedSmoke(localInstall, "network-denied-core-local", `
import assert from "node:assert/strict";
import * as core from "@riddledc/riddle-proof-core";
import { captureDocumentSnapshot, verifyDocumentSnapshotReceipt } from "@riddledc/riddle-proof-local";
assert.equal(typeof core.verifyRiddleProofSignedCaptureBundle, "function");
const receipt = await captureDocumentSnapshot({
  files: [{ role: "candidate", path: ${JSON.stringify(localSample)} }],
  capturedAt: "2026-07-19T20:00:00.000Z",
});
assert.equal(verifyDocumentSnapshotReceipt(receipt).ok, true);
`);

  const playwrightInstall = installCase("core-playwright", [archives.core, archives.playwright]);
  const allowedPlaywrightClosure = new Set([
    "@riddledc/riddle-proof-core",
    "@riddledc/riddle-proof-runner-playwright",
    "playwright",
    "playwright-core",
  ]);
  assert.deepEqual(
    [...playwrightInstall.dependencies].filter((name) => !allowedPlaywrightClosure.has(name)),
    [],
    "Playwright installed dependency metadata must not gain an undeclared capability package",
  );
  assert.ok(playwrightInstall.dependencies.has("@riddledc/riddle-proof-core"));
  assert.ok(playwrightInstall.dependencies.has("@riddledc/riddle-proof-runner-playwright"));
  assert.equal(installedPackageCount(playwrightInstall.directory, "@riddledc/riddle-proof-core"), 1,
    "core-playwright must install exactly one supplied core instance");
  const playwrightScope = path.join(playwrightInstall.directory, "node_modules", "@riddledc");
  assert.deepEqual(scanDirectory(path.join(playwrightScope, "riddle-proof-core"), coreForbidden), []);
  assert.deepEqual(scanDirectory(path.join(playwrightScope, "riddle-proof-runner-playwright"), hostedMarkers), []);
  assert.deepEqual(scanJavaScriptDirectory(
    path.join(playwrightScope, "riddle-proof-runner-playwright"),
    hostedApiPathLiterals,
  ), []);
  assertExportTargetsInstalled(path.join(playwrightScope, "riddle-proof-runner-playwright"));

  const hostedInstall = installCase("hosted-owner", [archives.core, archives.hosted]);
  assert.deepEqual([...hostedInstall.dependencies].sort(), [
    "@riddledc/riddle-proof-core",
    "@riddledc/riddle-proof-riddle-client",
  ]);
  assert.equal(installedPackageCount(hostedInstall.directory, "@riddledc/riddle-proof-core"), 1,
    "hosted owner must install exactly one supplied core instance");
  const hostedScope = path.join(hostedInstall.directory, "node_modules", "@riddledc");
  const hostedFindings = scanDirectory(path.join(hostedScope, "riddle-proof-riddle-client"), hostedMarkers);
  assert.ok(hostedFindings.some((finding) => finding.includes("hosted Riddle endpoint")));
  assert.ok(hostedFindings.some((finding) => finding.includes("hosted Riddle API key")));
  assert.ok(scanJavaScriptDirectory(
    path.join(hostedScope, "riddle-proof-riddle-client"),
    hostedApiPathLiterals,
  ).length > 0, "installed hosted client must own Riddle /v1 API path literals");

  const facadeInstall = installCase("facade-compatibility", [
    archives.appContract,
    archives.core,
    archives.hosted,
    archives.facade,
  ]);
  assert.deepEqual([...facadeInstall.dependencies].sort(), [
    "@riddledc/riddle-proof",
    "@riddledc/riddle-proof-app-contract",
    "@riddledc/riddle-proof-core",
    "@riddledc/riddle-proof-riddle-client",
  ]);
  assert.equal(installedPackageCount(facadeInstall.directory, "@riddledc/riddle-proof-core"), 1,
    "compatibility facade must install exactly one supplied core instance");
  assertExportTargetsInstalled(path.join(
    facadeInstall.directory,
    "node_modules",
    "@riddledc",
    "riddle-proof",
  ));
  assert.deepEqual(scanJavaScriptDirectory(path.join(
    facadeInstall.directory,
    "node_modules",
    "@riddledc",
    "riddle-proof",
  ), hostedApiPathLiterals), [], "installed compatibility facade must delegate every Riddle /v1 API path");

  process.stdout.write(`${JSON.stringify({
    ok: true,
    suite: "riddle-proof.packed-install-capability-boundaries",
    packed_packages: Object.keys(archives).length,
    clean_install_cases: 4,
    network_denied_smokes: 1,
    local_dependency_closure: [...localInstall.dependencies].sort(),
    playwright_dependency_closure: [...playwrightInstall.dependencies].sort(),
  })}\n`);
} finally {
  const expectedPrefix = path.join(tmpdir(), "riddle-proof-install-boundaries-");
  assert.ok(temporaryRoot.startsWith(expectedPrefix), "refusing to clean an unexpected temporary path");
  rmSync(temporaryRoot, { recursive: true, force: true });
}
