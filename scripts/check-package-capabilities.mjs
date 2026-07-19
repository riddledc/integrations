import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const packagePaths = {
  core: "packages/riddle-proof-core",
  local: "packages/riddle-proof-local",
  playwright: "packages/riddle-proof-runner-playwright",
  hosted: "packages/riddle-proof-riddle-client",
  facade: "packages/riddle-proof",
};

function readJson(filename) {
  return JSON.parse(readFileSync(filename, "utf8"));
}

function packageDirectory(key) {
  return path.join(repositoryRoot, packagePaths[key]);
}

function packageManifest(key) {
  return readJson(path.join(packageDirectory(key), "package.json"));
}

function filesBelow(target) {
  if (!existsSync(target)) return [];
  const stats = statSync(target);
  if (stats.isFile()) return [target];
  if (!stats.isDirectory()) return [];
  return readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) return filesBelow(child);
    return entry.isFile() ? [child] : [];
  });
}

function publishedFiles(key) {
  const directory = packageDirectory(key);
  const manifest = packageManifest(key);
  return (manifest.files || []).flatMap((entry) => filesBelow(path.join(directory, entry)));
}

function productionSourceFiles(key) {
  const directory = packageDirectory(key);
  return ["src", "runtime", "lib"]
    .flatMap((entry) => filesBelow(path.join(directory, entry)))
    .filter((filename) => /\.(?:[cm]?js|tsx?|py|sh)$/u.test(filename))
    .filter((filename) => !/(?:^|\/)(?:tests?|fixtures?)(?:\/|$)/u.test(
      path.relative(directory, filename).split(path.sep).join("/"),
    ))
    .filter((filename) => !/(?:^|\.)test\.[^.]+$/u.test(path.basename(filename)));
}

function collectPathTargets(value, targets = []) {
  if (typeof value === "string") {
    if (value.startsWith("./")) targets.push(value.slice(2));
    return targets;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) collectPathTargets(nested, targets);
  }
  return targets;
}

function assertPublishedTargetsExist(key) {
  const manifest = packageManifest(key);
  const directory = packageDirectory(key);
  const targets = [
    ...collectPathTargets(manifest.main),
    ...collectPathTargets(manifest.module),
    ...collectPathTargets(manifest.types),
    ...collectPathTargets(manifest.exports),
    ...collectPathTargets(manifest.bin),
  ];
  assert.ok(targets.length > 0, `${manifest.name} must declare at least one published entrypoint`);
  for (const target of new Set(targets)) {
    assert.ok(existsSync(path.join(directory, target)), `${manifest.name} published target is missing: ${target}`);
  }
}

function scanPublishedFiles(key, patterns) {
  return scanFiles(publishedFiles(key), patterns);
}

function scanPublishedJavaScript(key, patterns) {
  return scanFiles(
    publishedFiles(key).filter((filename) => /\.(?:[cm]?js)$/u.test(filename)),
    patterns,
  );
}

function scanProductionSource(key, patterns) {
  return scanFiles(productionSourceFiles(key), patterns);
}

function scanFiles(files, patterns) {
  const findings = [];
  for (const filename of files) {
    const relative = path.relative(repositoryRoot, filename);
    const contents = readFileSync(filename, "utf8");
    for (const [label, pattern] of patterns) {
      if (pattern.test(contents)) findings.push(`${relative}: ${label}`);
    }
  }
  return findings;
}

function externalModuleSpecifiers(key) {
  const specifiers = new Set();
  const patterns = [
    /\brequire\(\s*["']([^"']+)["']\s*\)/gu,
    /\bfrom\s*["']([^"']+)["']/gu,
    /\bimport\s*["']([^"']+)["']/gu,
    /\bimport\(\s*["']([^"']+)["']\s*\)/gu,
  ];
  for (const filename of publishedFiles(key).filter((candidate) => /\.(?:c?js|mjs)$/u.test(candidate))) {
    const contents = readFileSync(filename, "utf8");
    for (const pattern of patterns) {
      for (const match of contents.matchAll(pattern)) {
        if (!match[1].startsWith(".")) specifiers.add(match[1].replace(/^node:/u, ""));
      }
    }
  }
  return [...specifiers].sort();
}

function capabilityDocument(key) {
  const manifest = packageManifest(key);
  const filename = path.join(packageDirectory(key), "capabilities.json");
  assert.ok(existsSync(filename), `${manifest.name} must publish capabilities.json`);
  const document = readJson(filename);
  assert.equal(document.version, "riddle-proof.package-capabilities.v1");
  assert.equal(document.package, manifest.name);
  const manifestCapabilities = manifest.riddleProofCapabilities || {};
  assert.deepEqual(Object.keys(manifestCapabilities).sort(), [
    "ambientClock",
    "browser",
    "cryptography",
    "filesystem",
    "hostedRiddle",
    "network",
    "subprocess",
  ], `${manifest.name} package.json must declare the complete capability schema`);
  assert.deepEqual(Object.keys(document.capabilities || {}).sort(), [
    "ambient_clock",
    "browser",
    "cryptography",
    "filesystem",
    "hosted_riddle",
    "network",
    "subprocess",
  ], `${manifest.name} capabilities.json must declare the complete capability schema`);
  assert.deepEqual(Object.fromEntries(Object.entries(manifestCapabilities).map(([name, value]) => [
    name === "hostedRiddle" ? "hosted_riddle" : name === "ambientClock" ? "ambient_clock" : name,
    value,
  ])), document.capabilities, `${manifest.name} package.json and capabilities.json must agree`);
  return document;
}

function workspaceDependencyNames(key) {
  const manifest = packageManifest(key);
  return new Set(Object.keys({
    ...(manifest.dependencies || {}),
    ...(manifest.optionalDependencies || {}),
    ...(manifest.peerDependencies || {}),
  }));
}

function assertNoForbiddenDependencyReference(key, forbiddenNames) {
  const manifest = packageManifest(key);
  const dependencyEntries = [
    ...Object.entries(manifest.dependencies || {}),
    ...Object.entries(manifest.optionalDependencies || {}),
    ...Object.entries(manifest.peerDependencies || {}),
  ];
  const bundledNames = [
    ...(manifest.bundledDependencies || []),
    ...(manifest.bundleDependencies || []),
  ];
  for (const forbiddenName of forbiddenNames) {
    assert.ok(!dependencyEntries.some(([name]) => name === forbiddenName),
      `${manifest.name} production dependency names must not include ${forbiddenName}`);
    assert.ok(!dependencyEntries.some(([, specifier]) => specifier === `npm:${forbiddenName}`
      || specifier.startsWith(`npm:${forbiddenName}@`)),
    `${manifest.name} production dependency aliases must not include ${forbiddenName}`);
    assert.ok(!bundledNames.includes(forbiddenName),
      `${manifest.name} bundled dependencies must not include ${forbiddenName}`);
  }
}

const hostedName = "@riddledc/riddle-proof-riddle-client";
const facadeName = "@riddledc/riddle-proof";
const coreName = "@riddledc/riddle-proof-core";

for (const key of Object.keys(packagePaths)) {
  capabilityDocument(key);
  assertPublishedTargetsExist(key);
}

for (const key of ["core", "local", "playwright"]) {
  const dependencies = workspaceDependencyNames(key);
  assert.ok(!dependencies.has(hostedName), `${key} must not depend on the hosted client`);
  assert.ok(!dependencies.has(facadeName), `${key} must not depend on the compatibility facade`);
  assertNoForbiddenDependencyReference(key, [hostedName, facadeName]);
}

assert.deepEqual(packageManifest("core").dependencies || {}, {}, "core must have no production dependencies");
assert.deepEqual(packageManifest("core").optionalDependencies || {}, {}, "core must have no optional dependencies");
assert.deepEqual(packageManifest("core").peerDependencies || {}, {}, "core must have no peer dependencies");
assert.deepEqual(packageManifest("local").dependencies || {}, {}, "local must have no production dependencies");
assert.deepEqual(packageManifest("local").optionalDependencies || {}, {}, "local must have no optional dependencies");
assert.deepEqual(packageManifest("local").peerDependencies || {}, {}, "local must have no peer dependencies");
assert.deepEqual(packageManifest("playwright").dependencies || {}, {
  [coreName]: "workspace:^",
}, "Playwright production dependencies must contain only core");
assert.deepEqual(packageManifest("playwright").optionalDependencies || {}, {},
  "Playwright must not gain optional production dependencies");
assert.deepEqual(packageManifest("playwright").peerDependencies || {}, {
  playwright: "^1.50.0",
}, "Playwright peer dependencies must remain explicit and capability-appropriate");
for (const key of ["core", "local", "playwright"]) {
  const manifest = packageManifest(key);
  assert.deepEqual(manifest.bundledDependencies || [], [], `${manifest.name} must not bundle dependencies`);
  assert.deepEqual(manifest.bundleDependencies || [], [], `${manifest.name} must not bundle dependencies`);
  for (const lifecycle of [
    "preinstall", "install", "postinstall", "prepack", "prepare", "postpack",
    "prepublish", "prepublishOnly",
  ]) {
    assert.equal(manifest.scripts?.[lifecycle], undefined,
      `${manifest.name} must not publish the ${lifecycle} lifecycle hook`);
  }
}

assert.ok(workspaceDependencyNames("hosted").has(coreName), "hosted must depend on core");
assert.ok(!workspaceDependencyNames("hosted").has(facadeName), "hosted must not depend on facade");
assert.ok(workspaceDependencyNames("facade").has(coreName), "facade must depend on core");
assert.ok(workspaceDependencyNames("facade").has(hostedName), "facade must depend on hosted");

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

assert.deepEqual(scanPublishedFiles("core", coreForbidden), [], "core publish surface must be capability-clean");
assert.deepEqual(scanPublishedFiles("local", localForbidden), [], "local publish surface must be network-clean");
assert.deepEqual(scanPublishedFiles("playwright", hostedMarkers), [], "Playwright publish surface must omit hosted Riddle");
for (const key of ["core", "local", "playwright", "facade"]) {
  assert.deepEqual(
    scanProductionSource(key, hostedApiPathLiterals),
    [],
    `${key} production source must not own hosted Riddle /v1 API path literals`,
  );
  assert.deepEqual(
    scanPublishedJavaScript(key, hostedApiPathLiterals),
    [],
    `${key} packed JavaScript must not own hosted Riddle /v1 API path literals`,
  );
}
assert.deepEqual(externalModuleSpecifiers("core"), ["crypto", "util"],
  "core packed JavaScript external imports must remain exactly capability-allowlisted");
assert.deepEqual(externalModuleSpecifiers("local"), ["crypto", "fs/promises", "path"],
  "local packed JavaScript external imports must remain exactly capability-allowlisted");

const hostedFindings = scanPublishedFiles("hosted", hostedMarkers);
assert.ok(hostedFindings.some((finding) => finding.includes("hosted Riddle endpoint")), "hosted must own the Riddle endpoint");
assert.ok(hostedFindings.some((finding) => finding.includes("hosted Riddle API key")), "hosted must own Riddle API-key handling");
const hostedApiPathFindings = scanPublishedJavaScript("hosted", hostedApiPathLiterals);
assert.ok(hostedApiPathFindings.length > 0, "hosted production JavaScript must own Riddle /v1 API path literals");

process.stdout.write(`${JSON.stringify({
  ok: true,
  suite: "riddle-proof.package-capability-boundaries",
  checked_packages: Object.keys(packagePaths).length,
  hosted_marker_findings: hostedFindings.length,
  hosted_api_path_findings: hostedApiPathFindings.length,
})}\n`);
