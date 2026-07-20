import assert from "node:assert/strict";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const forbiddenDomainVocabulary = [
  { label: "amendment domain", pattern: /\bamendments?\b/iu },
  { label: "legal workflow", pattern: /\blegal(?:[_ -]+)(?:approval|approved|review)\b/iu },
  { label: "legal-review submission", pattern: /submitted[_ -]+for[_ -]+legal[_ -]+review/iu },
  { label: "lawyer role", pattern: /\blawyers?\b/iu },
  { label: "client support role", pattern: /\bcustomer[_ -]+support\b/iu },
];

const forbiddenFoundationVocabulary = [
  ...forbiddenDomainVocabulary,
  { label: "client model vendor", pattern: /(?:claude|anthropic)/iu },
  { label: "client document provider", pattern: /\bgoogle[_ -]+docs?\b/iu },
];

const excludedDirectoryNames = new Set([
  ".git",
  ".lake",
  "build",
  "dist",
  "node_modules",
]);

const publicFoundationEntries = [
  "docs/architecture/package-boundaries.md",
  "docs/riddle-proof-client-instantiation.md",
  "examples/private-workbench-transfer",
  "formal/riddle-proof-kernel",
  "packages/riddle-proof-core",
  "packages/riddle-proof-local",
  "scripts/check-private-workbench-provisioning-safety.mjs",
  "scripts/check-private-workbench-transfer.mjs",
];

const packedPackages = [
  "packages/riddle-proof-core",
  "packages/riddle-proof-local",
];

const packedDomainNeutralPackages = [
  "packages/riddle-proof",
];

const publicModuleBoundaryPackages = [
  ...packedPackages,
  ...packedDomainNeutralPackages,
];

const forbiddenStandaloneModuleNames = new Set([
  "human-attestation",
  "review-protocol",
]);

function filesBelow(entry) {
  const stats = lstatSync(entry);
  if (stats.isSymbolicLink()) return [];
  if (stats.isFile()) return [entry];
  assert.equal(stats.isDirectory(), true, `Unsupported public boundary entry: ${entry}`);
  return readdirSync(entry, { withFileTypes: true }).flatMap((child) => {
    if (child.isDirectory() && excludedDirectoryNames.has(child.name)) return [];
    return filesBelow(join(entry, child.name));
  });
}

function findingsForFile(filename, displayName, vocabulary) {
  const text = readFileSync(filename).toString("utf8");
  return vocabulary.flatMap(({ label, pattern }) => (
    pattern.test(`${displayName}\n${text}`) ? [{ file: displayName, label }] : []
  ));
}

function standaloneModuleName(pathname) {
  const segments = pathname.split(/[\\/]/u);
  return [...forbiddenStandaloneModuleNames].find((moduleName) => (
    segments.some((segment) => (
      segment === moduleName || segment.startsWith(`${moduleName}.`)
    ))
  ));
}

function sourceFindingsForStandaloneModules(entry) {
  const packageRoot = join(repositoryRoot, entry);
  const pathFindings = filesBelow(packageRoot).flatMap((filename) => {
    const displayName = relative(repositoryRoot, filename);
    const moduleName = standaloneModuleName(displayName);
    return moduleName === undefined ? [] : [{
      file: displayName,
      label: `standalone public ${moduleName} module`,
    }];
  });
  const manifestPath = join(packageRoot, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const exportKeys = manifest.exports && typeof manifest.exports === "object"
    ? Object.keys(manifest.exports)
    : [];
  const exportFindings = exportKeys.flatMap((exportKey) => {
    const moduleName = standaloneModuleName(exportKey);
    return moduleName === undefined ? [] : [{
      file: relative(repositoryRoot, manifestPath),
      label: `standalone public ${moduleName} export ${exportKey}`,
    }];
  });
  return [...pathFindings, ...exportFindings];
}

const sourceFindings = publicFoundationEntries.flatMap((entry) => {
  const absolute = join(repositoryRoot, entry);
  return filesBelow(absolute).flatMap((filename) => (
    findingsForFile(filename, relative(repositoryRoot, filename), forbiddenFoundationVocabulary)
  ));
});

function packedFindingsFor(entry, vocabulary, checkStandaloneModules = false) {
  const packageRoot = join(repositoryRoot, entry);
  const packed = spawnSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: packageRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(
    packed.status,
    0,
    `npm pack inspection failed for ${entry}: ${packed.stderr}`,
  );
  const result = JSON.parse(packed.stdout);
  assert.equal(Array.isArray(result), true, `npm pack output is not an array for ${entry}`);
  assert.equal(result.length, 1, `npm pack returned an unexpected result count for ${entry}`);
  assert.equal(Array.isArray(result[0].files), true, `npm pack omitted files for ${entry}`);
  return result[0].files.flatMap(({ path }) => {
    assert.equal(typeof path, "string", `npm pack returned an invalid path for ${entry}`);
    const filename = join(packageRoot, path);
    const displayName = `${basename(entry)} tarball:${path}`;
    const findings = findingsForFile(filename, displayName, vocabulary);
    const moduleName = checkStandaloneModules ? standaloneModuleName(path) : undefined;
    return moduleName === undefined ? findings : [...findings, {
      file: displayName,
      label: `standalone public ${moduleName} module`,
    }];
  });
}

const packedFindings = [
  ...packedPackages.flatMap((entry) => (
    packedFindingsFor(entry, forbiddenFoundationVocabulary, true)
  )),
  ...packedDomainNeutralPackages.flatMap((entry) => (
    packedFindingsFor(entry, forbiddenDomainVocabulary, true)
  )),
];

const standaloneModuleFindings = publicModuleBoundaryPackages.flatMap((entry) => (
  sourceFindingsForStandaloneModules(entry)
));

const findings = [
  ...sourceFindings,
  ...standaloneModuleFindings,
  ...packedFindings,
];
assert.deepEqual(
  findings,
  [],
  `Public Riddle Proof machinery violates its public/client boundary:\n${findings
    .map(({ file, label }) => `- ${file}: ${label}`)
    .join("\n")}`,
);

process.stdout.write(`${JSON.stringify({
  ok: true,
  suite: "riddle-proof.public-client-boundary",
  source_entries: publicFoundationEntries.length,
  packed_packages: packedPackages.length + packedDomainNeutralPackages.length,
  forbidden_domain_categories: forbiddenDomainVocabulary.length,
  forbidden_foundation_categories: forbiddenFoundationVocabulary.length,
  forbidden_standalone_modules: forbiddenStandaloneModuleNames.size,
})}\n`);
