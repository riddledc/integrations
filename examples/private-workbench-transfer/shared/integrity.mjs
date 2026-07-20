import { createHash } from "node:crypto";
import {
  lstatSync,
  readlinkSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { join, relative, sep } from "node:path";

export const REQUIRED_PACKAGES = Object.freeze([
  Object.freeze({ name: "@riddledc/riddle-proof-core", version: "0.1.1" }),
  Object.freeze({ name: "@riddledc/riddle-proof-local", version: "0.1.1" }),
]);

export const FORBIDDEN_PACKAGES = Object.freeze([
  "@riddledc/riddle-proof",
  "@riddledc/riddle-proof-riddle-client",
  "@riddledc/riddle-proof-runner-playwright",
  "@riddledc/riddle-proof-packs",
]);

export const EXPECTED_NPM_BIN_LINKS = Object.freeze([
  Object.freeze({
    name: "riddle-proof-local",
    target: "../@riddledc/riddle-proof-local/bin/riddle-proof-local",
    package_name: "@riddledc/riddle-proof-local",
    package_bin: "./bin/riddle-proof-local",
  }),
]);

export const PUBLIC_DIAGNOSTIC_AUTHORITY = Object.freeze({
  namespace_prefix: "riddle-proof.diagnostic.",
  signer_key_id: "synthetic-offline-foundation-key",
  signer_public_key_spki_base64:
    "MCowBQYDK2VwAyEA0/Diax3hBEXiqPo6JLj41YdI+IbZniZ4FkPQbWRyej4=",
});

function containsPublicDiagnosticAuthority(value, depth = 0) {
  if (depth > 64) throw new Error("trust root nesting limit exceeded");
  if (typeof value === "string") {
    return value === PUBLIC_DIAGNOSTIC_AUTHORITY.signer_key_id
      || value === PUBLIC_DIAGNOSTIC_AUTHORITY.signer_public_key_spki_base64
      || value.startsWith(PUBLIC_DIAGNOSTIC_AUTHORITY.namespace_prefix);
  }
  if (Array.isArray(value)) {
    return value.some((entry) => containsPublicDiagnosticAuthority(entry, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.values(value).some((entry) => (
      containsPublicDiagnosticAuthority(entry, depth + 1)
    ));
  }
  return false;
}

export function assertProductionRuleTrustRootSeparated(ruleResolution) {
  if (!ruleResolution?.ok || containsPublicDiagnosticAuthority(ruleResolution.bundle)) {
    throw new Error("public diagnostic authority is forbidden in a production rule root");
  }
}

export function assertProductionEvidenceTrustRootSeparated(evidenceResolution) {
  if (!evidenceResolution?.ok || containsPublicDiagnosticAuthority(evidenceResolution.bundle)) {
    throw new Error("public diagnostic authority is forbidden in a production evidence root");
  }
}

export const EXPECTED_CAPABILITIES = Object.freeze({
  "@riddledc/riddle-proof-core": Object.freeze({
    network: false,
    filesystem: false,
    browser: false,
    subprocess: false,
    hosted_riddle: false,
    cryptography: true,
    ambient_clock: true,
  }),
  "@riddledc/riddle-proof-local": Object.freeze({
    network: false,
    filesystem: true,
    browser: false,
    subprocess: false,
    hosted_riddle: false,
    cryptography: true,
    ambient_clock: true,
  }),
});

export function expectedManifestCapabilities(packageName) {
  const capabilities = EXPECTED_CAPABILITIES[packageName];
  if (!capabilities) throw new Error("unknown capability-bounded package");
  return {
    network: capabilities.network,
    filesystem: capabilities.filesystem,
    browser: capabilities.browser,
    subprocess: capabilities.subprocess,
    hostedRiddle: capabilities.hosted_riddle,
    cryptography: capabilities.cryptography,
    ambientClock: capabilities.ambient_clock,
  };
}

export function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function canonicalJson(value, context = "$") {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new TypeError(`non-canonical number at ${context}`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry, index) => canonicalJson(entry, `${context}[${index}]`)).join(",")}]`;
  if (value && typeof value === "object"
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key], `${context}.${key}`)}`
    )).join(",")}}`;
  }
  throw new TypeError(`non-canonical JSON value at ${context}`);
}

export function canonicalDigest(domain, value) {
  return sha256(Buffer.concat([
    Buffer.from(`${domain}\0`, "utf8"),
    Buffer.from(canonicalJson(value), "utf8"),
  ]));
}

export function packagePath(workbenchRoot, packageName) {
  return join(workbenchRoot, "node_modules", ...packageName.split("/"));
}

export function npmRegistryTarballUrl(packageName, version) {
  const basename = packageName.includes("/") ? packageName.split("/")[1] : packageName;
  return `https://registry.npmjs.org/${packageName}/-/${basename}-${version}.tgz`;
}

export function npmRegistryAttestationsUrl(packageName, version) {
  return `https://registry.npmjs.org/-/npm/v1/attestations/${packageName.replaceAll("/", "%2f")}@${version}`;
}

function walkFiles(root, current, files, budget) {
  const entries = readdirSync(current, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
  for (const entry of entries) {
    budget.count += 1;
    if (budget.count > budget.maximum) throw new Error("file inventory limit exceeded");
    const absolute = join(current, entry.name);
    const stats = lstatSync(absolute);
    if (stats.isSymbolicLink()) throw new Error("symbolic link in package inventory");
    if (stats.isDirectory()) {
      if (entry.name === "node_modules") throw new Error("nested dependency in package inventory");
      walkFiles(root, absolute, files, budget);
      continue;
    }
    if (!stats.isFile()) throw new Error("unsupported package inventory entry");
    const name = relative(root, absolute).split(sep).join("/");
    const bytes = readFileSync(absolute);
    files.push({
      path: name,
      byte_length: bytes.byteLength,
      mode: stats.mode & 0o777,
      digest: sha256(bytes),
    });
  }
}

export function installedPackageTreeDigest(packageDirectory) {
  if (realpathSync(packageDirectory) !== packageDirectory) {
    throw new Error("package directory must be an absolute canonical real path");
  }
  const files = [];
  walkFiles(packageDirectory, packageDirectory, files, { count: 0, maximum: 4096 });
  return canonicalDigest("riddle-proof.installed-package-tree.v1", files);
}

export function readJsonFile(filename) {
  const bytes = readFileSync(filename);
  if (bytes.byteLength > 4 * 1024 * 1024) throw new Error("JSON file limit exceeded");
  const text = bytes.toString("utf8");
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON root must be an object");
  }
  return parsed;
}

export function capabilityDigest(capabilities) {
  return canonicalDigest("riddle-proof.package-capabilities-lock.v1", capabilities);
}

export function collectInstalledPackageNames(workbenchRoot) {
  const nodeModules = join(workbenchRoot, "node_modules");
  const names = [];
  for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
    if (entry.name === ".bin" || entry.name === ".package-lock.json") continue;
    if (entry.name.startsWith(".")) throw new Error("unexpected hidden node_modules entry");
    if (entry.name.startsWith("@")) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error("invalid npm scope entry");
      const scopePath = join(nodeModules, entry.name);
      for (const child of readdirSync(scopePath, { withFileTypes: true })) {
        if (!child.isDirectory() || child.isSymbolicLink()) throw new Error("invalid scoped package entry");
        names.push(`${entry.name}/${child.name}`);
      }
      continue;
    }
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error("invalid package entry");
    names.push(entry.name);
  }
  return names.sort();
}

// npm creates .bin entries as relative symbolic links even for a dependency closure
// containing only ordinary package directories.  Treat that one npm mechanism as an
// exact, positive inventory: every name, lexical target, resolved target, and package
// manifest declaration must agree.  No other symbolic link is accepted by the
// workbench inventory.
export function validateInstalledBinLinks(workbenchRoot) {
  const binDirectory = join(workbenchRoot, "node_modules", ".bin");
  const binStats = lstatSync(binDirectory);
  if (!binStats.isDirectory() || binStats.isSymbolicLink()
    || realpathSync(binDirectory) !== binDirectory) {
    throw new Error("npm bin directory is invalid");
  }
  const names = readdirSync(binDirectory).sort();
  const expectedNames = EXPECTED_NPM_BIN_LINKS.map(({ name }) => name).sort();
  if (canonicalJson(names) !== canonicalJson(expectedNames)) {
    throw new Error("npm bin inventory differs");
  }
  for (const expected of EXPECTED_NPM_BIN_LINKS) {
    const link = join(binDirectory, expected.name);
    const linkStats = lstatSync(link);
    if (!linkStats.isSymbolicLink() || readlinkSync(link) !== expected.target) {
      throw new Error("npm bin link differs");
    }
    const packageDirectory = packagePath(workbenchRoot, expected.package_name);
    const target = join(packageDirectory, expected.package_bin.replace(/^\.\//u, ""));
    const targetStats = lstatSync(target);
    if (!targetStats.isFile() || targetStats.isSymbolicLink()
      || realpathSync(link) !== realpathSync(target)) {
      throw new Error("npm bin target differs");
    }
    const manifest = readJsonFile(join(packageDirectory, "package.json"));
    if (canonicalJson(manifest.bin) !== canonicalJson({
      [expected.name]: expected.package_bin,
    })) {
      throw new Error("npm bin declaration differs");
    }
  }
  return EXPECTED_NPM_BIN_LINKS.map(({ name, target }) => ({ name, target }));
}

export function hasInstalledPackage(workbenchRoot, packageName) {
  try {
    const manifest = readJsonFile(join(packagePath(workbenchRoot, packageName), "package.json"));
    return manifest.name === packageName;
  } catch {
    return false;
  }
}
