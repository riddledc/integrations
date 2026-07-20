import {
  createPrivateKey,
  createPublicKey,
  sign,
} from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

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
  installedPackageTreeDigest,
  npmRegistryAttestationsUrl,
  npmRegistryTarballUrl,
  packagePath,
  readJsonFile,
  REQUIRED_PACKAGES,
  sha256,
  validateInstalledBinLinks,
} from "../shared/integrity.mjs";

export const SUPPLY_CHAIN_LOCK_VERSION =
  "riddle-proof.private-workbench-supply-chain-lock.v1";
export const RUNTIME_POLICY_VERSION =
  "riddle-proof.private-workbench-runtime-policy.v1";
export const SUPPLY_CHAIN_SIGNATURE_DOMAIN =
  "riddle-proof.private-workbench-supply-chain-lock.v1\0";
export const COMPANY_BOOTSTRAP_VERSION =
  "riddle-proof.private-workbench-bootstrap.v1";

const STATE_DIRECTORY_NAME = "admin-state";
const POLICY_FILENAME = "runtime-policy.json";
const LOCK_FILENAME = "supply-chain-lock.json";
const RULE_BUNDLE_FILENAME = "rule-trust-root.json";
const EVIDENCE_BUNDLE_FILENAME = "evidence-trust-root.json";
const BOOTSTRAP_DIRECTORY_NAME = "company-bootstrap";
const BOOTSTRAP_FILENAME = "admin-signer.json";
const PROVENANCE_PREDICATE = "https://slsa.dev/provenance/v1";
const OUTPUT_DIRECTORY_NAMES = Object.freeze(["machine", "privileged"]);

function assertRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertExactKeys(value, required, optional = []) {
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(value, key))) throw new Error("required field absent");
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error("unexpected field");
}

function assertDigest(value) {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new Error("invalid digest");
  }
  return value;
}

function assertIntegrity(value) {
  if (typeof value !== "string" || !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(value)) {
    throw new Error("invalid npm integrity");
  }
  return value;
}

function assertTimestamp(value) {
  if (typeof value !== "string" || new Date(value).toISOString() !== value) {
    throw new Error("invalid timestamp");
  }
  return value;
}

function assertSafeCode(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)) {
    throw new Error("invalid identifier");
  }
  return value;
}

function validateSurfaces(input) {
  assertRecord(input, "approved surface configuration");
  assertExactKeys(input, ["version", "surfaces"]);
  if (input.version !== "riddle-proof.approved-execution-surfaces.v1"
    || !Array.isArray(input.surfaces) || input.surfaces.length !== 1) {
    throw new Error("approved execution surface configuration is invalid");
  }
  const kinds = new Set([
    "claude_enterprise_web",
    "claude_code_enterprise",
    "enterprise_api",
    "company_managed_integration",
  ]);
  const seen = new Set();
  return input.surfaces.map((surface) => {
    assertRecord(surface, "approved execution surface");
    assertExactKeys(surface, [
      "surface_id", "surface_kind", "adapter_id", "destination_allowlist",
      "allowed_model_ids", "allowed_protocol_versions", "allowed_prompt_versions",
      "allowed_routing_decision_codes", "allowed_escalation_reason_codes",
      "allow_no_escalation", "max_attempt_count", "deterministic_components",
    ]);
    const surfaceId = assertSafeCode(surface.surface_id);
    if (seen.has(surfaceId)) throw new Error("duplicate approved execution surface");
    seen.add(surfaceId);
    if (!kinds.has(surface.surface_kind)) throw new Error("unsupported execution surface kind");
    if (!Array.isArray(surface.destination_allowlist)
      || surface.destination_allowlist.length > 16
      || surface.destination_allowlist.some((destination) => {
        if (typeof destination !== "string") return true;
        try {
          const url = new URL(destination);
          return url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash
            || url.hostname === "riddledc.com" || url.hostname.endsWith(".riddledc.com");
        } catch {
          return true;
        }
      })) {
      throw new Error("execution surface destination allowlist is invalid");
    }
    const codeArray = (value, allowEmpty = false) => {
      if (!Array.isArray(value) || (!allowEmpty && value.length < 1) || value.length > 64) {
        throw new Error("execution policy code allowlist is invalid");
      }
      const entries = value.map((entry) => assertSafeCode(entry));
      if (new Set(entries).size !== entries.length) throw new Error("execution policy repeats a code");
      return entries.sort();
    };
    if (typeof surface.allow_no_escalation !== "boolean"
      || !Number.isSafeInteger(surface.max_attempt_count)
      || surface.max_attempt_count < 1 || surface.max_attempt_count > 1024
      || !Array.isArray(surface.deterministic_components)
      || surface.deterministic_components.length < 1
      || surface.deterministic_components.length > 64) {
      throw new Error("execution policy limits are invalid");
    }
    const deterministicComponents = surface.deterministic_components.map((component) => {
      assertRecord(component, "deterministic component");
      assertExactKeys(component, ["component_id", "component_version"]);
      return {
        component_id: assertSafeCode(component.component_id),
        component_version: assertSafeCode(component.component_version),
      };
    }).sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right), "en"));
    if (new Set(deterministicComponents.map((entry) => canonicalJson(entry))).size
      !== deterministicComponents.length) {
      throw new Error("execution policy repeats a deterministic component");
    }
    return {
      surface_id: surfaceId,
      surface_kind: surface.surface_kind,
      adapter_id: assertSafeCode(surface.adapter_id),
      destination_allowlist: [...surface.destination_allowlist].sort(),
      allowed_model_ids: codeArray(surface.allowed_model_ids),
      allowed_protocol_versions: codeArray(surface.allowed_protocol_versions),
      allowed_prompt_versions: codeArray(surface.allowed_prompt_versions),
      allowed_routing_decision_codes: codeArray(surface.allowed_routing_decision_codes),
      allowed_escalation_reason_codes: codeArray(surface.allowed_escalation_reason_codes, true),
      allow_no_escalation: surface.allow_no_escalation,
      max_attempt_count: surface.max_attempt_count,
      deterministic_components: deterministicComponents,
    };
  }).sort((left, right) => left.surface_id.localeCompare(right.surface_id, "en"));
}

function validateExpectedRuleRoot(value) {
  assertRecord(value, "expected rule trust root");
  assertExactKeys(value, ["trust_root_id", "trust_root_version", "bundle_digest"]);
  return {
    trust_root_id: assertSafeCode(value.trust_root_id),
    trust_root_version: assertSafeCode(value.trust_root_version),
    bundle_digest: assertDigest(value.bundle_digest),
  };
}

function validateExpectedEvidenceRoot(value) {
  assertRecord(value, "expected evidence trust root");
  assertExactKeys(value, ["trust_root_id", "trust_root_version", "bundle_digest"]);
  return {
    trust_root_id: assertSafeCode(value.trust_root_id),
    trust_root_version: assertSafeCode(value.trust_root_version),
    bundle_digest: assertDigest(value.bundle_digest),
  };
}

function validateRuleRef(value) {
  assertRecord(value, "packet-complete rule reference");
  assertExactKeys(value, ["rule_id", "rule_version", "engine", "implementation_digest"]);
  if (value.engine !== "riddle-proof.checked-meaning-rule.v0") {
    throw new Error("packet-complete rule engine is invalid");
  }
  return {
    rule_id: assertSafeCode(value.rule_id),
    rule_version: assertSafeCode(value.rule_version),
    engine: value.engine,
    implementation_digest: assertDigest(value.implementation_digest),
  };
}

function readLockIntegrity(workbenchRoot, packageName) {
  const lock = readJsonFile(join(workbenchRoot, "package-lock.json"));
  if (lock.lockfileVersion !== 3 || !lock.packages || typeof lock.packages !== "object") {
    throw new Error("package lock must use lockfile version 3");
  }
  const rootEntry = lock.packages[""];
  if (!rootEntry || canonicalJson(rootEntry.dependencies) !== canonicalJson(Object.fromEntries(
    REQUIRED_PACKAGES.map(({ name, version }) => [name, version]),
  ))) {
    throw new Error("root package-lock dependency pins differ");
  }
  const entry = lock.packages[`node_modules/${packageName}`];
  if (!entry || typeof entry !== "object") throw new Error("package lock entry absent");
  const expected = REQUIRED_PACKAGES.find(({ name }) => name === packageName);
  if (!expected || entry.resolved !== npmRegistryTarballUrl(packageName, expected.version)) {
    throw new Error("package lock must resolve from the public npm registry");
  }
  return assertIntegrity(entry.integrity);
}

function validateInstalled(workbenchRoot, verifiedPackages) {
  const rootManifest = readJsonFile(join(workbenchRoot, "package.json"));
  if (rootManifest.private !== true
    || canonicalJson(rootManifest.dependencies) !== canonicalJson(Object.fromEntries(
      REQUIRED_PACKAGES.map(({ name, version }) => [name, version]),
    ))) {
    throw new Error("workbench dependency pins are invalid");
  }
  const installedNames = collectInstalledPackageNames(workbenchRoot);
  if (canonicalJson(installedNames) !== canonicalJson(REQUIRED_PACKAGES.map(({ name }) => name).sort())) {
    throw new Error("installed dependency closure is not exact");
  }
  validateInstalledBinLinks(workbenchRoot);
  for (const forbidden of FORBIDDEN_PACKAGES) {
    if (installedNames.includes(forbidden)) throw new Error("forbidden package installed");
  }
  const verified = new Map(verifiedPackages.map((entry) => [entry.name, entry]));
  return REQUIRED_PACKAGES.map(({ name, version }) => {
    const evidence = verified.get(name);
    assertRecord(evidence, "verified package evidence");
    assertExactKeys(evidence, [
      "name", "version", "integrity", "attestations_url", "provenance_predicate_type",
      "verification_method", "verified_at",
    ]);
    if (evidence.name !== name || evidence.version !== version
      || evidence.verification_method !== "npm-audit-signatures"
      || evidence.provenance_predicate_type !== PROVENANCE_PREDICATE) {
      throw new Error("verified package evidence is not production-grade");
    }
    const attestationUrl = new URL(evidence.attestations_url);
    if (attestationUrl.protocol !== "https:" || attestationUrl.hostname !== "registry.npmjs.org"
      || evidence.attestations_url !== npmRegistryAttestationsUrl(name, version)) {
      throw new Error("npm attestation URL is not trusted");
    }
    const packageDirectory = realpathSync(packagePath(workbenchRoot, name));
    const manifest = readJsonFile(join(packageDirectory, "package.json"));
    if (manifest.name !== name || manifest.version !== version) throw new Error("installed version mismatch");
    if (canonicalJson(manifest.riddleProofCapabilities)
      !== canonicalJson(expectedManifestCapabilities(name))) {
      throw new Error("package manifest capability declaration mismatch");
    }
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      if (manifest[field] && Object.keys(manifest[field]).length > 0) {
        throw new Error("required package unexpectedly expands the runtime closure");
      }
    }
    const capabilities = readJsonFile(join(packageDirectory, "capabilities.json"));
    if (capabilities.version !== "riddle-proof.package-capabilities.v1"
      || capabilities.package !== name
      || canonicalJson(capabilities.capabilities) !== canonicalJson(EXPECTED_CAPABILITIES[name])) {
      throw new Error("installed capability declaration mismatch");
    }
    const lockIntegrity = readLockIntegrity(workbenchRoot, name);
    if (lockIntegrity !== evidence.integrity) throw new Error("registry and lock integrities differ");
    return {
      name,
      version,
      integrity: assertIntegrity(evidence.integrity),
      installed_tree_digest: installedPackageTreeDigest(packageDirectory),
      capabilities_digest: capabilityDigest(capabilities),
      provenance: {
        verified: true,
        verification_method: "npm-audit-signatures",
        verified_at: assertTimestamp(evidence.verified_at),
        attestations_url: evidence.attestations_url,
        predicate_type: PROVENANCE_PREDICATE,
      },
    };
  });
}

function parseSigningKey(keyBytes) {
  const privateKey = createPrivateKey(keyBytes);
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("admin key must be Ed25519");
  const publicKey = createPublicKey(privateKey);
  const publicBytes = publicKey.export({ format: "der", type: "spki" });
  return { privateKey, publicKey, publicBytes };
}

function ensureAdministrativeStateDirectory(directory) {
  const existing = lstatSync(directory, { throwIfNoEntry: false });
  if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) {
    throw new Error("private directory path is unsafe");
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (realpathSync(directory) !== directory) throw new Error("private directory resolves elsewhere");
  chmodSync(directory, 0o700);
}

function pathContains(parent, child) {
  const difference = relative(parent, child);
  return difference === ""
    || (difference !== ".." && !difference.startsWith(`..${sep}`) && !isAbsolute(difference));
}

// Keep the non-mutating path gate separate so hostile tests can safely submit `/`
// and other broad paths without reaching any filesystem write or chmod operation.
export function validateApprovedOutputRootPath({ approved_output_root: candidate, workbench_root: workbench }) {
  if (typeof candidate !== "string" || typeof workbench !== "string"
    || !isAbsolute(candidate) || !isAbsolute(workbench)
    || resolve(candidate) !== candidate || resolve(workbench) !== workbench) {
    throw new Error("approved output root and workbench root must be absolute normalized paths");
  }
  const filesystemRoot = parse(candidate).root;
  const components = relative(filesystemRoot, candidate).split(sep).filter(Boolean);
  if (candidate === filesystemRoot || components.length < 2) {
    throw new Error("approved output root is a filesystem or broad root");
  }
  if (pathContains(candidate, workbench) || pathContains(workbench, candidate)) {
    throw new Error("approved output root must not overlap the workbench");
  }
  return candidate;
}

function currentAdministrativeUid() {
  if (typeof process.getuid !== "function") {
    throw new Error("administrative ownership checks require a POSIX runtime");
  }
  const uid = process.getuid();
  if (!Number.isSafeInteger(uid) || uid < 0) {
    throw new Error("administrative identity is invalid");
  }
  return uid;
}

export function approvedPrivateDirectoryRecordIssue(record, expectedOwnerUid) {
  if (!record || typeof record !== "object" || Array.isArray(record)
    || record.kind !== "directory" || record.is_symbolic_link !== false) {
    return "unsafe_type";
  }
  if (record.uid !== expectedOwnerUid) return "wrong_owner";
  if (record.mode !== 0o700) return "wrong_mode";
  return null;
}

function privateDirectoryRecord(filename) {
  const stats = lstatSync(filename);
  return {
    kind: stats.isDirectory() ? "directory" : stats.isFile() ? "file" : "other",
    is_symbolic_link: stats.isSymbolicLink(),
    uid: stats.uid,
    mode: stats.mode & 0o777,
  };
}

function assertExistingPrivateDirectory(filename, expectedOwnerUid) {
  if (approvedPrivateDirectoryRecordIssue(
    privateDirectoryRecord(filename),
    expectedOwnerUid,
  ) !== null || realpathSync(filename) !== filename) {
    throw new Error("approved output directory is not a canonical admin-owned 0700 directory");
  }
}

function assertSafeOutputParent(outputRoot, expectedOwnerUid) {
  const parent = dirname(outputRoot);
  const stats = lstatSync(parent);
  if (!stats.isDirectory() || stats.isSymbolicLink() || realpathSync(parent) !== parent
    || stats.uid !== expectedOwnerUid || (stats.mode & 0o022) !== 0) {
    throw new Error("approved output parent is not an admin-owned non-writable canonical directory");
  }
}

export function prepareApprovedOutputRoot({ approved_output_root: outputRoot, workbench_root: workbenchRoot }) {
  validateApprovedOutputRootPath({
    approved_output_root: outputRoot,
    workbench_root: workbenchRoot,
  });
  const administrativeUid = currentAdministrativeUid();
  assertSafeOutputParent(outputRoot, administrativeUid);

  const existing = lstatSync(outputRoot, { throwIfNoEntry: false });
  if (!existing) {
    // The parent was already proven canonical, admin-owned, and non-writable by
    // other privilege classes. Create exactly one new leaf; never recursively
    // manufacture or chmod caller-selected ancestors.
    mkdirSync(outputRoot, { mode: 0o700 });
    assertExistingPrivateDirectory(outputRoot, administrativeUid);
    for (const directory of OUTPUT_DIRECTORY_NAMES) {
      const target = join(outputRoot, directory);
      mkdirSync(target, { mode: 0o700 });
      assertExistingPrivateDirectory(target, administrativeUid);
    }
    return realpathSync(outputRoot);
  }

  assertExistingPrivateDirectory(outputRoot, administrativeUid);
  if (canonicalJson(readdirSync(outputRoot).sort())
    !== canonicalJson([...OUTPUT_DIRECTORY_NAMES].sort())) {
    throw new Error("existing approved output root is not a dedicated workbench directory");
  }
  for (const directory of OUTPUT_DIRECTORY_NAMES) {
    assertExistingPrivateDirectory(join(outputRoot, directory), administrativeUid);
  }
  return realpathSync(outputRoot);
}

function preparePrivateFileTarget(filename) {
  const existing = lstatSync(filename, { throwIfNoEntry: false });
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) {
    throw new Error("private file target is unsafe");
  }
  if (existing) chmodSync(filename, 0o600);
}

function finalizeReadOnlyState(stateDirectory, filenames) {
  for (const filename of filenames) {
    const stats = lstatSync(filename);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error("administrative state file became unsafe");
    }
    chmodSync(filename, 0o440);
  }
  const directoryStats = lstatSync(stateDirectory);
  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
    throw new Error("administrative state directory became unsafe");
  }
  chmodSync(stateDirectory, 0o550);
}

function readCompanyBootstrap(workbenchRoot) {
  const directory = join(workbenchRoot, BOOTSTRAP_DIRECTORY_NAME);
  const filename = join(directory, BOOTSTRAP_FILENAME);
  const directoryStats = lstatSync(directory);
  const fileStats = lstatSync(filename);
  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()
    || (directoryStats.mode & 0o777) !== 0o555
    || !fileStats.isFile() || fileStats.isSymbolicLink()
    || (fileStats.mode & 0o777) !== 0o444
    || realpathSync(directory) !== directory || realpathSync(filename) !== filename) {
    throw new Error("company bootstrap path is not independently read-only");
  }
  const bootstrap = readJsonFile(filename);
  assertExactKeys(bootstrap, ["version", "key_id", "public_key_spki_sha256"]);
  if (bootstrap.version !== COMPANY_BOOTSTRAP_VERSION) {
    throw new Error("company bootstrap version is invalid");
  }
  return {
    version: COMPANY_BOOTSTRAP_VERSION,
    key_id: assertSafeCode(bootstrap.key_id),
    public_key_spki_sha256: assertDigest(bootstrap.public_key_spki_sha256),
  };
}

export async function provisionFromVerifiedEvidence(input) {
  assertRecord(input, "provision input");
  const workbenchRoot = realpathSync(input.workbench_root);
  const outputRoot = resolve(input.approved_output_root);
  if (!isAbsolute(input.approved_output_root) || outputRoot !== input.approved_output_root) {
    throw new Error("approved output root must be an absolute canonical path");
  }
  const canonicalOutputRoot = prepareApprovedOutputRoot({
    approved_output_root: outputRoot,
    workbench_root: workbenchRoot,
  });

  const expectedRuleRoot = validateExpectedRuleRoot(input.expected_rule_trust_root);
  const expectedEvidenceRoot = validateExpectedEvidenceRoot(input.expected_evidence_trust_root);
  const packetCompleteRule = validateRuleRef(input.packet_complete_rule);
  const surfaces = validateSurfaces(input.approved_surfaces);
  const selectedSurface = surfaces[0];
  const installedPackages = validateInstalled(workbenchRoot, input.verified_packages);
  const ruleBundle = input.rule_bundle;
  const evidenceBundle = input.evidence_trust_root_bundle;
  assertRecord(ruleBundle, "rule bundle");
  assertRecord(evidenceBundle, "evidence trust root bundle");

  const core = await import("@riddledc/riddle-proof-core/rule-trust-root");
  const resolvedRules = core.resolveRiddleProofRuleTrustRoot({
    bundle: ruleBundle,
    expected_trust_root: expectedRuleRoot,
  });
  if (!resolvedRules.ok || !resolvedRules.trusted_rules.some((rule) => (
    canonicalJson(rule) === canonicalJson(packetCompleteRule)
  ))) {
    throw new Error("rule trust root or required packet-complete rule is invalid");
  }
  assertProductionRuleTrustRootSeparated(resolvedRules);
  const evidenceCore = await import("@riddledc/riddle-proof-core/evidence-trust-root");
  const resolvedEvidence = evidenceCore.resolveRiddleProofEvidenceTrustRoot({
    bundle: evidenceBundle,
    expected_trust_root: expectedEvidenceRoot,
  });
  if (!resolvedEvidence.ok) {
    throw new Error("evidence trust root is invalid");
  }
  assertProductionEvidenceTrustRootSeparated(resolvedEvidence);

  const key = parseSigningKey(input.signing_private_key);
  const keyId = assertSafeCode(input.signing_key_id);
  const publicKeyBase64 = key.publicBytes.toString("base64");
  const publicKeyDigest = sha256(key.publicBytes);
  const createdAt = assertTimestamp(input.created_at);
  const bootstrap = readCompanyBootstrap(workbenchRoot);
  if (bootstrap.key_id !== keyId || bootstrap.public_key_spki_sha256 !== publicKeyDigest) {
    throw new Error("administrative signer is not anchored by the company bootstrap");
  }

  const stateDirectory = join(workbenchRoot, STATE_DIRECTORY_NAME);
  ensureAdministrativeStateDirectory(stateDirectory);
  const ruleBundlePath = join(stateDirectory, RULE_BUNDLE_FILENAME);
  preparePrivateFileTarget(ruleBundlePath);
  writeFileSync(ruleBundlePath, `${canonicalJson(ruleBundle)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(ruleBundlePath, 0o600);
  const evidenceBundlePath = join(stateDirectory, EVIDENCE_BUNDLE_FILENAME);
  preparePrivateFileTarget(evidenceBundlePath);
  writeFileSync(evidenceBundlePath, `${canonicalJson(evidenceBundle)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(evidenceBundlePath, 0o600);

  const runtimePolicy = {
    version: RUNTIME_POLICY_VERSION,
    expected_packages: REQUIRED_PACKAGES,
    supply_chain_lock: `${STATE_DIRECTORY_NAME}/${LOCK_FILENAME}`,
    rule_bundle: `${STATE_DIRECTORY_NAME}/${RULE_BUNDLE_FILENAME}`,
    evidence_bundle: `${STATE_DIRECTORY_NAME}/${EVIDENCE_BUNDLE_FILENAME}`,
    rule_trust_root: expectedRuleRoot,
    evidence_trust_root: expectedEvidenceRoot,
    packet_complete_rule: packetCompleteRule,
    approved_output_root: canonicalOutputRoot,
    output_layout: { machine: "machine", privileged: "privileged" },
    approved_execution_surfaces: surfaces,
    approved_execution_policy: {
      version: "riddle-proof.approved-execution-policy.v1",
      policy_id: selectedSurface.surface_id,
      policy_version: "1",
      provider_adapter_id: selectedSurface.adapter_id,
      allowed_model_ids: selectedSurface.allowed_model_ids,
      allowed_protocol_versions: selectedSurface.allowed_protocol_versions,
      allowed_prompt_versions: selectedSurface.allowed_prompt_versions,
      allowed_routing_decision_codes: selectedSurface.allowed_routing_decision_codes,
      allowed_escalation_reason_codes: selectedSurface.allowed_escalation_reason_codes,
      allow_no_escalation: selectedSurface.allow_no_escalation,
      max_attempt_count: selectedSurface.max_attempt_count,
      deterministic_components: selectedSurface.deterministic_components,
    },
    admin_signer: {
      key_id: keyId,
      public_key_spki_base64: publicKeyBase64,
      public_key_spki_sha256: publicKeyDigest,
    },
  };
  const policyPath = join(stateDirectory, POLICY_FILENAME);
  preparePrivateFileTarget(policyPath);
  writeFileSync(policyPath, `${canonicalJson(runtimePolicy)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(policyPath, 0o600);

  const payload = {
    version: SUPPLY_CHAIN_LOCK_VERSION,
    created_at: createdAt,
    runtime_policy_digest: canonicalDigest(
      "riddle-proof.private-workbench-runtime-policy.v1",
      runtimePolicy,
    ),
    dependency_closure: REQUIRED_PACKAGES.map(({ name }) => name).sort(),
    forbidden_packages_absent: true,
    rule_trust_root: expectedRuleRoot,
    evidence_trust_root: expectedEvidenceRoot,
    packages: installedPackages,
  };
  const signatureBytes = sign(
    null,
    Buffer.concat([
      Buffer.from(SUPPLY_CHAIN_SIGNATURE_DOMAIN, "utf8"),
      Buffer.from(canonicalJson(payload), "utf8"),
    ]),
    key.privateKey,
  );
  const lock = {
    version: SUPPLY_CHAIN_LOCK_VERSION,
    payload,
    signature: {
      algorithm: "ed25519",
      key_id: keyId,
      public_key_spki_sha256: publicKeyDigest,
      signature_base64: signatureBytes.toString("base64"),
    },
  };
  const lockPath = join(stateDirectory, LOCK_FILENAME);
  preparePrivateFileTarget(lockPath);
  writeFileSync(lockPath, `${canonicalJson(lock)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(lockPath, 0o600);
  finalizeReadOnlyState(stateDirectory, [
    policyPath,
    lockPath,
    ruleBundlePath,
    evidenceBundlePath,
  ]);
  return { policy: runtimePolicy, lock };
}

function parseArguments(argv) {
  const allowed = new Set([
    "--output-root", "--rule-bundle", "--expected-rule-root", "--evidence-bundle",
    "--expected-evidence-root", "--packet-complete-rule", "--approved-surfaces",
    "--signing-key", "--signing-key-id", "--created-at",
  ]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(flag) || value === undefined || values.has(flag)) throw new Error("invalid arguments");
    values.set(flag, value);
  }
  if (values.size !== allowed.size) throw new Error("all provision arguments are required");
  return values;
}

function npmJson(workbenchRoot, args) {
  return JSON.parse(execFileSync("npm", args, {
    cwd: workbenchRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }));
}

async function runCli() {
  const workbenchRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const args = parseArguments(process.argv.slice(2));
  npmJson(workbenchRoot, ["ls", "--omit=dev", "--all", "--json"]);
  npmJson(workbenchRoot, ["audit", "signatures", "--json"]);
  const checkedAt = args.get("--created-at");
  const verifiedPackages = REQUIRED_PACKAGES.map(({ name, version }) => {
    const dist = npmJson(workbenchRoot, ["view", `${name}@${version}`, "dist", "--json"]);
    return {
      name,
      version,
      integrity: dist.integrity,
      attestations_url: dist.attestations?.url,
      provenance_predicate_type: dist.attestations?.provenance?.predicateType,
      verification_method: "npm-audit-signatures",
      verified_at: checkedAt,
    };
  });
  await provisionFromVerifiedEvidence({
    workbench_root: workbenchRoot,
    approved_output_root: args.get("--output-root"),
    rule_bundle: readJsonFile(resolve(args.get("--rule-bundle"))),
    expected_rule_trust_root: readJsonFile(resolve(args.get("--expected-rule-root"))),
    evidence_trust_root_bundle: readJsonFile(resolve(args.get("--evidence-bundle"))),
    expected_evidence_trust_root: readJsonFile(resolve(args.get("--expected-evidence-root"))),
    packet_complete_rule: readJsonFile(resolve(args.get("--packet-complete-rule"))),
    approved_surfaces: readJsonFile(resolve(args.get("--approved-surfaces"))),
    signing_private_key: readFileSync(resolve(args.get("--signing-key"))),
    signing_key_id: args.get("--signing-key-id"),
    created_at: checkedAt,
    verified_packages: verifiedPackages,
  });
  process.stdout.write(`${JSON.stringify({ ok: true, code: "PROVISIONED" })}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch(() => {
    process.stderr.write(`${JSON.stringify({ ok: false, code: "PROVISION_FAILED" })}\n`);
    process.exitCode = 1;
  });
}
