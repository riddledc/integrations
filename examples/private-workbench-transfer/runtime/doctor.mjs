import { createPublicKey, verify } from "node:crypto";
import {
  accessSync,
  constants as fsConstants,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  assertProductionEvidenceTrustRootSeparated,
  assertProductionRuleTrustRootSeparated,
  canonicalDigest,
  canonicalJson,
  capabilityDigest,
  collectInstalledPackageNames,
  EXPECTED_CAPABILITIES,
  expectedManifestCapabilities,
  FORBIDDEN_PACKAGES,
  hasInstalledPackage,
  installedPackageTreeDigest,
  npmRegistryAttestationsUrl,
  npmRegistryTarballUrl,
  packagePath,
  readJsonFile,
  REQUIRED_PACKAGES,
  sha256,
  validateInstalledBinLinks,
} from "../shared/integrity.mjs";
import {
  DoctorFailure,
  doctorFail,
  fixedFailure,
} from "../shared/failures.mjs";
import {
  evaluateOsBoundaryPolicy,
  PERMISSION_ROLES,
} from "../shared/permission-policy.mjs";

const POLICY_VERSION = "riddle-proof.private-workbench-runtime-policy.v1";
const LOCK_VERSION = "riddle-proof.private-workbench-supply-chain-lock.v1";
const LOCK_SIGNATURE_DOMAIN = "riddle-proof.private-workbench-supply-chain-lock.v1\0";
const BOOTSTRAP_VERSION = "riddle-proof.private-workbench-bootstrap.v1";
const BOOTSTRAP_RELATIVE_PATH = "company-bootstrap/admin-signer.json";
const POLICY_RELATIVE_PATH = "admin-state/runtime-policy.json";
const LOCK_RELATIVE_PATH = "admin-state/supply-chain-lock.json";
const RULE_BUNDLE_RELATIVE_PATH = "admin-state/rule-trust-root.json";
const EVIDENCE_BUNDLE_RELATIVE_PATH = "admin-state/evidence-trust-root.json";
const PROVENANCE_PREDICATE = "https://slsa.dev/provenance/v1";
const HOSTED_ENV_NAMES = new Set([
  "RIDDLE_API_KEY",
  "RIDDLE_API_KEY_FILE",
  "RIDDLE_API_BASE_URL",
  "RIDDLE_PROOF_API_KEY",
  "RIDDLE_API_URL",
  "RIDDLE_BASE_URL",
  "RIDDLE_PROOF_BASE_URL",
  "RIDDLE_PREVIEW_URL",
  "RIDDLE_UPLOAD_URL",
]);
const INJECTION_ENV_NAMES = new Set([
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

function exactKeys(value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key))
    && keys.every((key) => allowed.has(key));
}

function validDigest(value) {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function validIntegrity(value) {
  return typeof value === "string" && /^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(value);
}

function validTimestamp(value) {
  try {
    return typeof value === "string" && new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function validCode(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value);
}

function validCodeArray(value, allowEmpty = false) {
  return Array.isArray(value)
    && (allowEmpty || value.length > 0)
    && value.length <= 64
    && value.every(validCode)
    && new Set(value).size === value.length;
}

function assertRuntimeOwnedPrivatePath(filename, expectedMode, expectedKind) {
  const stats = lstatSync(filename);
  if (stats.isSymbolicLink() || (stats.mode & 0o777) !== expectedMode
    || (expectedKind === "directory" ? !stats.isDirectory() : !stats.isFile())) {
    doctorFail("OUTPUT_BOUNDARY_INVALID");
  }
  if (typeof process.getuid === "function" && stats.uid !== process.getuid()) {
    doctorFail("OUTPUT_BOUNDARY_INVALID");
  }
}

function assertReadOnlyAdministrativePath(filename, expectedMode, expectedKind) {
  const stats = lstatSync(filename);
  if (stats.isSymbolicLink() || (stats.mode & 0o777) !== expectedMode
    || (expectedKind === "directory" ? !stats.isDirectory() : !stats.isFile())
    || realpathSync(filename) !== filename) {
    doctorFail("POLICY_PERMISSIONS_INVALID");
  }
}

function readCompanyBootstrap(workbenchRoot) {
  const directory = join(workbenchRoot, "company-bootstrap");
  const filename = join(workbenchRoot, BOOTSTRAP_RELATIVE_PATH);
  try {
    const directoryStats = lstatSync(directory);
    const fileStats = lstatSync(filename);
    if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()
      || (directoryStats.mode & 0o777) !== 0o555
      || !fileStats.isFile() || fileStats.isSymbolicLink()
      || (fileStats.mode & 0o777) !== 0o444
      || realpathSync(directory) !== directory || realpathSync(filename) !== filename) {
      doctorFail("BOOTSTRAP_INVALID");
    }
    const bootstrap = readJsonFile(filename);
    if (!exactKeys(bootstrap, ["version", "key_id", "public_key_spki_sha256"])
      || bootstrap.version !== BOOTSTRAP_VERSION
      || !validCode(bootstrap.key_id)
      || !validDigest(bootstrap.public_key_spki_sha256)) {
      doctorFail("BOOTSTRAP_INVALID");
    }
    return bootstrap;
  } catch (error) {
    if (error instanceof DoctorFailure) throw error;
    doctorFail("BOOTSTRAP_INVALID");
  }
}

function parsePolicy(value) {
  if (!exactKeys(value, [
    "version", "expected_packages", "supply_chain_lock", "rule_bundle", "evidence_bundle",
    "rule_trust_root", "evidence_trust_root", "packet_complete_rule", "approved_output_root", "output_layout",
    "approved_execution_surfaces", "approved_execution_policy", "admin_signer",
  ]) || value.version !== POLICY_VERSION
    || value.supply_chain_lock !== LOCK_RELATIVE_PATH
    || value.rule_bundle !== RULE_BUNDLE_RELATIVE_PATH
    || value.evidence_bundle !== EVIDENCE_BUNDLE_RELATIVE_PATH
    || canonicalJson(value.expected_packages) !== canonicalJson(REQUIRED_PACKAGES)
    || !isAbsolute(value.approved_output_root)
    || resolve(value.approved_output_root) !== value.approved_output_root
    || !exactKeys(value.output_layout, ["machine", "privileged"])
    || value.output_layout.machine !== "machine"
    || value.output_layout.privileged !== "privileged") {
    doctorFail("POLICY_INVALID");
  }
  if (!exactKeys(value.rule_trust_root, ["trust_root_id", "trust_root_version", "bundle_digest"])
    || !validCode(value.rule_trust_root.trust_root_id)
    || !validCode(value.rule_trust_root.trust_root_version)
    || !validDigest(value.rule_trust_root.bundle_digest)
    || !exactKeys(value.packet_complete_rule, [
      "rule_id", "rule_version", "engine", "implementation_digest",
    ])
    || !validCode(value.packet_complete_rule.rule_id)
    || !validCode(value.packet_complete_rule.rule_version)
    || value.packet_complete_rule.engine !== "riddle-proof.checked-meaning-rule.v0"
    || !validDigest(value.packet_complete_rule.implementation_digest)) {
    doctorFail("POLICY_INVALID");
  }
  if (!exactKeys(value.evidence_trust_root, [
    "trust_root_id", "trust_root_version", "bundle_digest",
  ]) || !validCode(value.evidence_trust_root.trust_root_id)
    || !validCode(value.evidence_trust_root.trust_root_version)
    || !validDigest(value.evidence_trust_root.bundle_digest)) {
    doctorFail("POLICY_INVALID");
  }
  if (!exactKeys(value.admin_signer, [
    "key_id", "public_key_spki_base64", "public_key_spki_sha256",
  ]) || !validCode(value.admin_signer.key_id)
    || typeof value.admin_signer.public_key_spki_base64 !== "string"
    || !validDigest(value.admin_signer.public_key_spki_sha256)) {
    doctorFail("POLICY_INVALID");
  }
  if (!Array.isArray(value.approved_execution_surfaces)
    || value.approved_execution_surfaces.length !== 1) {
    doctorFail("POLICY_INVALID");
  }
  const surfaceIds = new Set();
  for (const surface of value.approved_execution_surfaces) {
    if (!exactKeys(surface, [
      "surface_id", "surface_kind", "adapter_id", "destination_allowlist",
      "allowed_model_ids", "allowed_protocol_versions", "allowed_prompt_versions",
      "allowed_routing_decision_codes", "allowed_escalation_reason_codes",
      "allow_no_escalation", "max_attempt_count", "deterministic_components",
    ]) || !validCode(surface.surface_id) || !validCode(surface.adapter_id)
      || ![
        "claude_enterprise_web", "claude_code_enterprise", "enterprise_api",
        "company_managed_integration",
      ].includes(surface.surface_kind)
      || !Array.isArray(surface.destination_allowlist)
      || surface.destination_allowlist.some((destination) => {
        try {
          const url = new URL(destination);
          return url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash
            || url.hostname === "riddledc.com" || url.hostname.endsWith(".riddledc.com");
        } catch {
          return true;
        }
      }) || !validCodeArray(surface.allowed_model_ids)
      || !validCodeArray(surface.allowed_protocol_versions)
      || !validCodeArray(surface.allowed_prompt_versions)
      || !validCodeArray(surface.allowed_routing_decision_codes)
      || !validCodeArray(surface.allowed_escalation_reason_codes, true)
      || typeof surface.allow_no_escalation !== "boolean"
      || !Number.isSafeInteger(surface.max_attempt_count)
      || surface.max_attempt_count < 1 || surface.max_attempt_count > 1024
      || !Array.isArray(surface.deterministic_components)
      || surface.deterministic_components.length < 1
      || surface.deterministic_components.length > 64
      || surface.deterministic_components.some((component) => (
        !exactKeys(component, ["component_id", "component_version"])
        || !validCode(component.component_id) || !validCode(component.component_version)
      )) || new Set(surface.deterministic_components.map((component) => canonicalJson(component))).size
        !== surface.deterministic_components.length
      || surfaceIds.has(surface.surface_id)) {
      doctorFail("POLICY_INVALID");
    }
    surfaceIds.add(surface.surface_id);
  }
  const selected = value.approved_execution_surfaces[0];
  const expectedExecutionPolicy = {
    version: "riddle-proof.approved-execution-policy.v1",
    policy_id: selected.surface_id,
    policy_version: "1",
    provider_adapter_id: selected.adapter_id,
    allowed_model_ids: selected.allowed_model_ids,
    allowed_protocol_versions: selected.allowed_protocol_versions,
    allowed_prompt_versions: selected.allowed_prompt_versions,
    allowed_routing_decision_codes: selected.allowed_routing_decision_codes,
    allowed_escalation_reason_codes: selected.allowed_escalation_reason_codes,
    allow_no_escalation: selected.allow_no_escalation,
    max_attempt_count: selected.max_attempt_count,
    deterministic_components: selected.deterministic_components,
  };
  if (canonicalJson(value.approved_execution_policy) !== canonicalJson(expectedExecutionPolicy)) {
    doctorFail("POLICY_INVALID");
  }
  return value;
}

function parseLock(value, policy) {
  if (!exactKeys(value, ["version", "payload", "signature"])
    || value.version !== LOCK_VERSION
    || !exactKeys(value.payload, [
      "version", "created_at", "runtime_policy_digest", "dependency_closure",
      "forbidden_packages_absent", "rule_trust_root", "evidence_trust_root", "packages",
    ]) || value.payload.version !== LOCK_VERSION
    || !validTimestamp(value.payload.created_at)
    || !validDigest(value.payload.runtime_policy_digest)
    || value.payload.runtime_policy_digest !== canonicalDigest(POLICY_VERSION, policy)
    || value.payload.forbidden_packages_absent !== true
    || canonicalJson(value.payload.dependency_closure)
      !== canonicalJson(REQUIRED_PACKAGES.map(({ name }) => name).sort())
    || canonicalJson(value.payload.rule_trust_root) !== canonicalJson(policy.rule_trust_root)
    || canonicalJson(value.payload.evidence_trust_root) !== canonicalJson(policy.evidence_trust_root)
    || !Array.isArray(value.payload.packages)
    || value.payload.packages.length !== REQUIRED_PACKAGES.length
    || !exactKeys(value.signature, [
      "algorithm", "key_id", "public_key_spki_sha256", "signature_base64",
    ]) || value.signature.algorithm !== "ed25519"
    || value.signature.key_id !== policy.admin_signer.key_id
    || value.signature.public_key_spki_sha256 !== policy.admin_signer.public_key_spki_sha256
    || typeof value.signature.signature_base64 !== "string") {
    doctorFail("SUPPLY_CHAIN_LOCK_INVALID");
  }
  const requiredByName = new Map(REQUIRED_PACKAGES.map((entry) => [entry.name, entry]));
  const seen = new Set();
  for (const entry of value.payload.packages) {
    if (!exactKeys(entry, [
      "name", "version", "integrity", "installed_tree_digest", "capabilities_digest", "provenance",
    ]) || !requiredByName.has(entry.name) || seen.has(entry.name)
      || entry.version !== requiredByName.get(entry.name).version
      || !validIntegrity(entry.integrity)
      || !validDigest(entry.installed_tree_digest)
      || !validDigest(entry.capabilities_digest)
      || !exactKeys(entry.provenance, [
        "verified", "verification_method", "verified_at", "attestations_url", "predicate_type",
      ]) || entry.provenance.verified !== true
      || entry.provenance.verification_method !== "npm-audit-signatures"
      || !validTimestamp(entry.provenance.verified_at)
      || entry.provenance.predicate_type !== PROVENANCE_PREDICATE) {
      doctorFail("SUPPLY_CHAIN_LOCK_INVALID");
    }
    try {
      const url = new URL(entry.provenance.attestations_url);
      if (url.protocol !== "https:" || url.hostname !== "registry.npmjs.org"
        || entry.provenance.attestations_url
          !== npmRegistryAttestationsUrl(entry.name, entry.version)) {
        doctorFail("SUPPLY_CHAIN_LOCK_INVALID");
      }
    } catch (error) {
      if (error instanceof DoctorFailure) throw error;
      doctorFail("SUPPLY_CHAIN_LOCK_INVALID");
    }
    seen.add(entry.name);
  }
  return value;
}

function verifyLockSignature(lock, policy, bootstrap) {
  try {
    if (policy.admin_signer.key_id !== bootstrap.key_id
      || policy.admin_signer.public_key_spki_sha256 !== bootstrap.public_key_spki_sha256) {
      doctorFail("SUPPLY_CHAIN_SIGNATURE_INVALID");
    }
    const publicBytes = Buffer.from(policy.admin_signer.public_key_spki_base64, "base64");
    if (publicBytes.toString("base64") !== policy.admin_signer.public_key_spki_base64
      || sha256(publicBytes) !== policy.admin_signer.public_key_spki_sha256) {
      doctorFail("SUPPLY_CHAIN_SIGNATURE_INVALID");
    }
    const publicKey = createPublicKey({ key: publicBytes, format: "der", type: "spki" });
    if (publicKey.asymmetricKeyType !== "ed25519") doctorFail("SUPPLY_CHAIN_SIGNATURE_INVALID");
    const signature = Buffer.from(lock.signature.signature_base64, "base64");
    if (signature.toString("base64") !== lock.signature.signature_base64
      || !verify(null, Buffer.concat([
        Buffer.from(LOCK_SIGNATURE_DOMAIN, "utf8"),
        Buffer.from(canonicalJson(lock.payload), "utf8"),
      ]), publicKey, signature)) {
      doctorFail("SUPPLY_CHAIN_SIGNATURE_INVALID");
    }
  } catch (error) {
    if (error instanceof DoctorFailure) throw error;
    doctorFail("SUPPLY_CHAIN_SIGNATURE_INVALID");
  }
}

function lockIntegrity(workbenchRoot, packageName) {
  const lock = readJsonFile(join(workbenchRoot, "package-lock.json"));
  const expectedRootDependencies = Object.fromEntries(
    REQUIRED_PACKAGES.map(({ name, version }) => [name, version]),
  );
  if (lock.lockfileVersion !== 3
    || canonicalJson(lock.packages?.[""]?.dependencies) !== canonicalJson(expectedRootDependencies)) {
    doctorFail("PACKAGE_INTEGRITY_MISMATCH");
  }
  const integrity = lock.packages?.[`node_modules/${packageName}`]?.integrity;
  const expected = REQUIRED_PACKAGES.find(({ name }) => name === packageName);
  if (!validIntegrity(integrity) || !expected
    || lock.packages[`node_modules/${packageName}`].resolved
      !== npmRegistryTarballUrl(packageName, expected.version)) {
    doctorFail("PACKAGE_INTEGRITY_MISMATCH");
  }
  return integrity;
}

function verifyInstalledPackages(workbenchRoot, lock) {
  const expectedDependencies = Object.fromEntries(
    REQUIRED_PACKAGES.map(({ name, version }) => [name, version]),
  );
  let rootManifest;
  try {
    rootManifest = readJsonFile(join(workbenchRoot, "package.json"));
  } catch {
    doctorFail("PACKAGE_MANIFEST_INVALID");
  }
  if (rootManifest.private !== true
    || canonicalJson(rootManifest.dependencies) !== canonicalJson(expectedDependencies)) {
    doctorFail("PACKAGE_MANIFEST_INVALID");
  }
  for (const packageName of FORBIDDEN_PACKAGES) {
    if (hasInstalledPackage(workbenchRoot, packageName)) doctorFail("FORBIDDEN_PACKAGE_PRESENT");
  }
  let installedNames;
  try {
    installedNames = collectInstalledPackageNames(workbenchRoot);
  } catch {
    doctorFail("DEPENDENCY_CLOSURE_INVALID");
  }
  if (canonicalJson(installedNames)
    !== canonicalJson(REQUIRED_PACKAGES.map(({ name }) => name).sort())) {
    doctorFail("DEPENDENCY_CLOSURE_INVALID");
  }
  try {
    validateInstalledBinLinks(workbenchRoot);
  } catch {
    doctorFail("DEPENDENCY_CLOSURE_INVALID");
  }
  const lockRecords = new Map(lock.payload.packages.map((entry) => [entry.name, entry]));
  for (const expected of REQUIRED_PACKAGES) {
    const directory = packagePath(workbenchRoot, expected.name);
    let manifest;
    try {
      if (realpathSync(directory) !== directory) doctorFail("PACKAGE_TREE_MISMATCH");
      manifest = readJsonFile(join(directory, "package.json"));
    } catch (error) {
      if (error instanceof DoctorFailure) throw error;
      doctorFail("PACKAGE_MANIFEST_INVALID");
    }
    if (manifest.name !== expected.name) doctorFail("PACKAGE_MANIFEST_INVALID");
    if (manifest.version !== expected.version) doctorFail("PACKAGE_VERSION_MISMATCH");
    if (canonicalJson(manifest.riddleProofCapabilities)
      !== canonicalJson(expectedManifestCapabilities(expected.name))) {
      doctorFail("CAPABILITY_MISMATCH");
    }
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      if (manifest[field] && Object.keys(manifest[field]).length > 0) {
        doctorFail("DEPENDENCY_CLOSURE_INVALID");
      }
    }
    const record = lockRecords.get(expected.name);
    if (!record || lockIntegrity(workbenchRoot, expected.name) !== record.integrity) {
      doctorFail("PACKAGE_INTEGRITY_MISMATCH");
    }
    let treeDigest;
    try {
      treeDigest = installedPackageTreeDigest(directory);
    } catch {
      doctorFail("PACKAGE_TREE_MISMATCH");
    }
    if (treeDigest !== record.installed_tree_digest) doctorFail("PACKAGE_TREE_MISMATCH");
    let capabilities;
    try {
      capabilities = readJsonFile(join(directory, "capabilities.json"));
    } catch {
      doctorFail("CAPABILITY_MISMATCH");
    }
    if (capabilities.version !== "riddle-proof.package-capabilities.v1"
      || capabilities.package !== expected.name
      || canonicalJson(capabilities.capabilities) !== canonicalJson(EXPECTED_CAPABILITIES[expected.name])
      || capabilityDigest(capabilities) !== record.capabilities_digest) {
      doctorFail("CAPABILITY_MISMATCH");
    }
  }
}

async function verifyRules(workbenchRoot, ruleBundle, policy) {
  let core;
  try {
    core = await import(pathToFileURL(join(
      packagePath(workbenchRoot, "@riddledc/riddle-proof-core"),
      "dist",
      "rule-trust-root.js",
    )).href);
  } catch {
    doctorFail("RULE_TRUST_ROOT_INVALID");
  }
  const result = core.resolveRiddleProofRuleTrustRoot({
    bundle: ruleBundle,
    expected_trust_root: policy.rule_trust_root,
  });
  if (!result.ok || !result.trusted_rules.some((rule) => (
    canonicalJson(rule) === canonicalJson(policy.packet_complete_rule)
  ))) {
    doctorFail("RULE_TRUST_ROOT_INVALID");
  }
  try {
    assertProductionRuleTrustRootSeparated(result);
  } catch {
    doctorFail("RULE_TRUST_ROOT_INVALID");
  }
}

async function verifyEvidenceTrust(workbenchRoot, evidenceBundle, policy) {
  let core;
  try {
    core = await import(pathToFileURL(join(
      packagePath(workbenchRoot, "@riddledc/riddle-proof-core"),
      "dist",
      "evidence-trust-root.js",
    )).href);
  } catch {
    doctorFail("EVIDENCE_TRUST_ROOT_INVALID");
  }
  const result = core.resolveRiddleProofEvidenceTrustRoot({
    bundle: evidenceBundle,
    expected_trust_root: policy.evidence_trust_root,
  });
  if (!result.ok) doctorFail("EVIDENCE_TRUST_ROOT_INVALID");
  try {
    assertProductionEvidenceTrustRootSeparated(result);
  } catch {
    doctorFail("EVIDENCE_TRUST_ROOT_INVALID");
  }
}

function checkOutputEntry(root, entry, budget) {
  budget.count += 1;
  if (budget.count > 4096) doctorFail("OUTPUT_BOUNDARY_INVALID");
  const stats = lstatSync(entry);
  if (stats.isSymbolicLink() || (!stats.isDirectory() && !stats.isFile())
    || (stats.mode & 0o777) !== (stats.isDirectory() ? 0o700 : 0o600)
    || (typeof process.getuid === "function" && stats.uid !== process.getuid())) {
    doctorFail("OUTPUT_BOUNDARY_INVALID");
  }
  const relativePath = relative(root, entry);
  if (relativePath.startsWith("..") || relativePath.split(sep).includes("..")) {
    doctorFail("OUTPUT_BOUNDARY_INVALID");
  }
  if (stats.isDirectory()) {
    for (const child of readdirSync(entry)) checkOutputEntry(root, join(entry, child), budget);
  }
}

function verifyOutputBoundary(policy) {
  const root = policy.approved_output_root;
  try {
    if (realpathSync(root) !== root) doctorFail("OUTPUT_BOUNDARY_INVALID");
    assertRuntimeOwnedPrivatePath(root, 0o700, "directory");
    const topLevel = readdirSync(root).sort();
    if (canonicalJson(topLevel) !== canonicalJson([
      policy.output_layout.machine,
      policy.output_layout.privileged,
    ].sort())) {
      doctorFail("OUTPUT_BOUNDARY_INVALID");
    }
    for (const directory of [policy.output_layout.machine, policy.output_layout.privileged]) {
      const target = join(root, directory);
      assertRuntimeOwnedPrivatePath(target, 0o700, "directory");
      checkOutputEntry(root, target, { count: 0 });
    }
  } catch (error) {
    if (error instanceof DoctorFailure && error.code === "OUTPUT_BOUNDARY_INVALID") throw error;
    doctorFail("OUTPUT_BOUNDARY_INVALID");
  }
}

function permissionEntry(filename, role) {
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

function collectProtectedTree(directory, entries, budget, npmBinDirectory) {
  budget.count += 1;
  if (budget.count > 8192) doctorFail("OS_BOUNDARY_NOT_ENFORCED");
  const stats = lstatSync(directory);
  entries.push(permissionEntry(
    directory,
    stats.isDirectory() ? PERMISSION_ROLES.PROTECTED_DIRECTORY : PERMISSION_ROLES.PROTECTED_FILE,
  ));
  if (stats.isSymbolicLink() || !stats.isDirectory()) return;
  // validateInstalledBinLinks has already accepted the exact npm-created link
  // inventory and its resolved target.  The .bin directory itself remains in the
  // ownership/mode inventory; its sole link is not treated as a general symlink bypass.
  if (directory === npmBinDirectory) return;
  for (const child of readdirSync(directory)) {
    collectProtectedTree(join(directory, child), entries, budget, npmBinDirectory);
  }
}

function collectAdministrativeTree(directory, entries, budget) {
  budget.count += 1;
  if (budget.count > 8192) doctorFail("OS_BOUNDARY_NOT_ENFORCED");
  const stats = lstatSync(directory);
  entries.push(permissionEntry(
    directory,
    stats.isDirectory() ? PERMISSION_ROLES.ADMIN_DIRECTORY : PERMISSION_ROLES.ADMIN_FILE,
  ));
  if (stats.isSymbolicLink() || !stats.isDirectory()) return;
  for (const child of readdirSync(directory)) {
    collectAdministrativeTree(join(directory, child), entries, budget);
  }
}

function collectProtectedAncestorChain(directory, entries, budget, seen) {
  let current = resolve(directory);
  while (!seen.has(current)) {
    seen.add(current);
    budget.count += 1;
    if (budget.count > 8192) doctorFail("OS_BOUNDARY_NOT_ENFORCED");
    const stats = lstatSync(current);
    if (!stats.isDirectory() || stats.isSymbolicLink() || realpathSync(current) !== current) {
      doctorFail("OS_BOUNDARY_NOT_ENFORCED");
    }
    try {
      accessSync(current, fsConstants.X_OK);
    } catch {
      doctorFail("OS_BOUNDARY_NOT_ENFORCED");
    }
    try {
      accessSync(current, fsConstants.W_OK);
      doctorFail("OS_BOUNDARY_NOT_ENFORCED");
    } catch (error) {
      if (error instanceof DoctorFailure) throw error;
      if (!["EACCES", "EPERM"].includes(error?.code)) {
        doctorFail("OS_BOUNDARY_NOT_ENFORCED");
      }
    }
    entries.push(permissionEntry(
      current,
      PERMISSION_ROLES.PROTECTED_ANCESTOR_DIRECTORY,
    ));
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function verifyOsBoundary(workbenchRoot) {
  try {
    const expectedTopLevel = [
      ".gitignore", "CLAUDE.md", "README.md", "admin", "admin-state",
      "company-bootstrap", "node_modules", "package-lock.json", "package.json",
      "runtime", "shared", "synthetic",
    ].sort();
    if (canonicalJson(readdirSync(workbenchRoot).sort()) !== canonicalJson(expectedTopLevel)) {
      doctorFail("OS_BOUNDARY_NOT_ENFORCED");
    }
    validateInstalledBinLinks(workbenchRoot);
    const entries = [];
    const budget = { count: 0 };
    const ancestorSeen = new Set();
    const npmBinDirectory = join(workbenchRoot, "node_modules", ".bin");
    collectProtectedAncestorChain(dirname(workbenchRoot), entries, budget, ancestorSeen);
    entries.push(permissionEntry(workbenchRoot, PERMISSION_ROLES.PROTECTED_DIRECTORY));
    for (const filename of [
      join(workbenchRoot, ".gitignore"),
      join(workbenchRoot, "CLAUDE.md"),
      join(workbenchRoot, "README.md"),
      join(workbenchRoot, "package.json"),
      join(workbenchRoot, "package-lock.json"),
    ]) {
      entries.push(permissionEntry(filename, PERMISSION_ROLES.PROTECTED_FILE));
    }
    for (const directory of [
      join(workbenchRoot, "admin"),
      join(workbenchRoot, "runtime"),
      join(workbenchRoot, "shared"),
      join(workbenchRoot, "synthetic"),
      join(workbenchRoot, "node_modules"),
    ]) {
      collectProtectedTree(directory, entries, budget, npmBinDirectory);
    }
    const adminStateDirectory = join(workbenchRoot, "admin-state");
    if (canonicalJson(readdirSync(adminStateDirectory).sort()) !== canonicalJson([
      "evidence-trust-root.json", "rule-trust-root.json", "runtime-policy.json",
      "supply-chain-lock.json",
    ])) {
      doctorFail("OS_BOUNDARY_NOT_ENFORCED");
    }
    collectAdministrativeTree(adminStateDirectory, entries, budget);

    const bootstrapDirectory = join(workbenchRoot, "company-bootstrap");
    const bootstrapFile = join(workbenchRoot, BOOTSTRAP_RELATIVE_PATH);
    const bootstrapChildren = [
      "README.md", "admin-signer.json", "deny-network.cjs", "node-path", "run-doctor",
    ];
    if (canonicalJson(readdirSync(bootstrapDirectory).sort())
      !== canonicalJson([...bootstrapChildren].sort())) {
      doctorFail("OS_BOUNDARY_NOT_ENFORCED");
    }
    entries.push(permissionEntry(
      bootstrapDirectory,
      PERMISSION_ROLES.BOOTSTRAP_DIRECTORY,
    ));
    for (const child of bootstrapChildren) {
      entries.push(permissionEntry(
        join(bootstrapDirectory, child),
        child === "run-doctor"
          ? PERMISSION_ROLES.BOOTSTRAP_EXECUTABLE
          : PERMISSION_ROLES.BOOTSTRAP_FILE,
      ));
    }

    const nodePathFile = join(bootstrapDirectory, "node-path");
    const nodePathBytes = readFileSync(nodePathFile);
    const pinnedNode = nodePathBytes.toString("utf8");
    if (!pinnedNode.endsWith("\n") || pinnedNode.slice(0, -1).includes("\n")
      || pinnedNode.slice(0, -1) !== process.execPath) {
      doctorFail("OS_BOUNDARY_NOT_ENFORCED");
    }
    const pinnedNodeDirectory = dirname(process.execPath);
    entries.push(permissionEntry(
      pinnedNodeDirectory,
      PERMISSION_ROLES.PINNED_NODE_DIRECTORY,
    ));
    entries.push(permissionEntry(
      process.execPath,
      PERMISSION_ROLES.PINNED_NODE_EXECUTABLE,
    ));
    collectProtectedAncestorChain(
      dirname(pinnedNodeDirectory),
      entries,
      budget,
      ancestorSeen,
    );

    const runtimeGids = [
      ...(typeof process.getgroups === "function" ? process.getgroups() : []),
      ...(typeof process.getgid === "function" ? [process.getgid()] : []),
    ];
    const result = evaluateOsBoundaryPolicy({
      runtime_uid: typeof process.getuid === "function" ? process.getuid() : undefined,
      runtime_gids: [...new Set(runtimeGids)],
      entries,
    });
    if (!result.ok) doctorFail("OS_BOUNDARY_NOT_ENFORCED");

    const nodeStats = lstatSync(process.execPath);
    if (!nodeStats.isFile() || nodeStats.isSymbolicLink()
      || nodeStats.uid === process.getuid()
      || (nodeStats.mode & 0o777) !== 0o555
      || realpathSync(process.execPath) !== process.execPath) {
      doctorFail("OS_BOUNDARY_NOT_ENFORCED");
    }
  } catch (error) {
    if (error instanceof DoctorFailure && error.code === "OS_BOUNDARY_NOT_ENFORCED") throw error;
    doctorFail("OS_BOUNDARY_NOT_ENFORCED");
  }
}

function checkInjectionEnvironment() {
  for (const name of Object.keys(process.env)) {
    if (INJECTION_ENV_NAMES.has(name)) doctorFail("RUNTIME_ENV_INVALID");
  }
}

export function hostedConfigurationPresent(environmentNames, fixedKeyPathPresent) {
  return environmentNames.some((name) => (
    HOSTED_ENV_NAMES.has(name)
      || name.startsWith("RIDDLE_HOSTED_")
      || name.startsWith("RIDDLE_PREVIEW_")
      || name.startsWith("RIDDLE_UPLOAD_")
  )) || fixedKeyPathPresent;
}

function checkHostedEnvironment() {
  let fixedKeyPathPresent = false;
  try {
    accessSync("/tmp/riddle-api-key", fsConstants.R_OK);
    fixedKeyPathPresent = true;
  } catch (error) {
    if (!["ENOENT", "EACCES", "EPERM"].includes(error?.code)) {
      doctorFail("HOSTED_ENV_PRESENT");
    }
  }
  if (hostedConfigurationPresent(Object.keys(process.env), fixedKeyPathPresent)) {
    doctorFail("HOSTED_ENV_PRESENT");
  }
}

export async function runDoctor() {
  const workbenchRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
  checkInjectionEnvironment();
  verifyOsBoundary(workbenchRoot);
  checkHostedEnvironment();
  return runDeterministicFoundationChecksInternal(workbenchRoot);
}

async function runDeterministicFoundationChecksInternal(workbenchRoot) {
  const bootstrap = readCompanyBootstrap(workbenchRoot);
  const policyPath = join(workbenchRoot, POLICY_RELATIVE_PATH);
  const lockPath = join(workbenchRoot, LOCK_RELATIVE_PATH);
  const rulePath = join(workbenchRoot, RULE_BUNDLE_RELATIVE_PATH);
  const evidencePath = join(workbenchRoot, EVIDENCE_BUNDLE_RELATIVE_PATH);
  try {
    assertReadOnlyAdministrativePath(join(workbenchRoot, "admin-state"), 0o550, "directory");
    assertReadOnlyAdministrativePath(policyPath, 0o440, "file");
    assertReadOnlyAdministrativePath(lockPath, 0o440, "file");
    assertReadOnlyAdministrativePath(rulePath, 0o440, "file");
    assertReadOnlyAdministrativePath(evidencePath, 0o440, "file");
  } catch (error) {
    if (error instanceof DoctorFailure) throw error;
    doctorFail("POLICY_PERMISSIONS_INVALID");
  }
  let policy;
  try {
    policy = parsePolicy(readJsonFile(policyPath));
  } catch (error) {
    if (error instanceof DoctorFailure) throw error;
    doctorFail("POLICY_INVALID");
  }
  let lock;
  try {
    lock = parseLock(readJsonFile(lockPath), policy);
  } catch (error) {
    if (error instanceof DoctorFailure) throw error;
    doctorFail("SUPPLY_CHAIN_LOCK_INVALID");
  }
  verifyLockSignature(lock, policy, bootstrap);
  verifyInstalledPackages(workbenchRoot, lock);
  let ruleBundle;
  try {
    ruleBundle = readJsonFile(rulePath);
  } catch {
    doctorFail("RULE_TRUST_ROOT_INVALID");
  }
  await verifyRules(workbenchRoot, ruleBundle, policy);
  let evidenceBundle;
  try {
    evidenceBundle = readJsonFile(evidencePath);
  } catch {
    doctorFail("EVIDENCE_TRUST_ROOT_INVALID");
  }
  await verifyEvidenceTrust(workbenchRoot, evidenceBundle, policy);
  verifyOutputBoundary(policy);
  let runSyntheticFoundationTest;
  try {
    ({ runSyntheticFoundationTest } = await import("./synthetic-self-test.mjs"));
  } catch {
    doctorFail("SYNTHETIC_REPLAY_FAILED");
  }
  await runSyntheticFoundationTest({ workbenchRoot, policy, ruleBundle, evidenceBundle });
  return {
    ok: true,
    code: "FOUNDATION_READY",
  };
}

// Administrative regression tests call this directly so a same-user synthetic
// fixture can exercise deterministic failures without manufacturing a fake OS
// attestation.  It is not a CLI and cannot emit READY; production use is only
// through the independently owned launcher.
export async function runDeterministicFoundationChecksForTest() {
  const workbenchRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
  checkInjectionEnvironment();
  return runDeterministicFoundationChecksInternal(workbenchRoot);
}

async function cli() {
  if (process.argv.length !== 2) doctorFail("ARGUMENT_OVERRIDE_FORBIDDEN");
  return runDoctor();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    process.stderr.write(`${JSON.stringify(fixedFailure(error))}\n`);
    process.exitCode = 1;
  });
}
