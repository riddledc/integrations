import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import {
  dirname,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const experimentDirectory = join(
  repositoryRoot,
  "experiments",
  "proof-guided-web-change",
);
const expectedDependencies = {
  "@riddledc/riddle-proof-core":
    "link:../../packages/riddle-proof-core",
  "@riddledc/riddle-proof-runner-playwright":
    "link:../../packages/riddle-proof-runner-playwright",
  "riddle-proof-application-projection-experiment":
    "link:../application-projection",
};
const forbiddenPackages = [
  "@riddledc/riddle-proof",
  "@riddledc/riddle-proof-packs",
  "@riddledc/riddle-proof-riddle-client",
];
const localPackages = new Map([
  [
    "riddle-proof-guided-web-change-experiment",
    experimentDirectory,
  ],
  [
    "@riddledc/riddle-proof-core",
    join(repositoryRoot, "packages", "riddle-proof-core"),
  ],
  [
    "@riddledc/riddle-proof-runner-playwright",
    join(repositoryRoot, "packages", "riddle-proof-runner-playwright"),
  ],
  [
    "riddle-proof-application-projection-experiment",
    join(repositoryRoot, "experiments", "application-projection"),
  ],
]);

function readJson(filename) {
  return JSON.parse(readFileSync(filename, "utf8"));
}

function manifest(packageDirectory) {
  return readJson(join(packageDirectory, "package.json"));
}

function productionDependencyEntries(value) {
  return [
    ...Object.entries(value.dependencies ?? {}),
    ...Object.entries(value.optionalDependencies ?? {}),
    ...Object.entries(value.peerDependencies ?? {}),
  ];
}

function assertNoForbiddenDependency(packageDirectory) {
  const value = manifest(packageDirectory);
  for (const [name, specifier] of productionDependencyEntries(value)) {
    assert.equal(
      forbiddenPackages.includes(name),
      false,
      `${value.name} must not depend on ${name}`,
    );
    for (const forbidden of forbiddenPackages) {
      assert.equal(
        specifier === `npm:${forbidden}`
          || specifier.startsWith(`npm:${forbidden}@`),
        false,
        `${value.name} must not alias a dependency to ${forbidden}`,
      );
    }
  }
  for (const name of [
    ...(value.bundledDependencies ?? []),
    ...(value.bundleDependencies ?? []),
  ]) {
    assert.equal(
      forbiddenPackages.includes(name),
      false,
      `${value.name} must not bundle ${name}`,
    );
  }
}

const experimentManifest = manifest(experimentDirectory);
assert.equal(
  experimentManifest.private,
  true,
  "The proof-guided client must remain a private experiment.",
);
assert.deepEqual(
  experimentManifest.dependencies,
  expectedDependencies,
  "The proof-guided client dependency set and local link targets must remain exact.",
);
assert.deepEqual(
  experimentManifest.optionalDependencies ?? {},
  {},
  "The proof-guided client must not gain optional dependencies.",
);
assert.deepEqual(
  experimentManifest.peerDependencies ?? {},
  {},
  "The proof-guided client must not gain peer dependencies.",
);

const expectedLocalClosure = {
  "riddle-proof-guided-web-change-experiment": [
    "@riddledc/riddle-proof-core",
    "@riddledc/riddle-proof-runner-playwright",
    "riddle-proof-application-projection-experiment",
  ],
  "@riddledc/riddle-proof-core": [],
  "@riddledc/riddle-proof-runner-playwright": [
    "@riddledc/riddle-proof-core",
  ],
  "riddle-proof-application-projection-experiment": [],
};
const expectedProductionDependencyNames = {
  "riddle-proof-guided-web-change-experiment": [
    "@riddledc/riddle-proof-core",
    "@riddledc/riddle-proof-runner-playwright",
    "riddle-proof-application-projection-experiment",
  ],
  "@riddledc/riddle-proof-core": [],
  "@riddledc/riddle-proof-runner-playwright": [
    "@riddledc/riddle-proof-core",
    "playwright",
  ],
  "riddle-proof-application-projection-experiment": [],
};
for (const [name, packageDirectory] of localPackages) {
  const value = manifest(packageDirectory);
  assert.equal(value.name, name);
  assertNoForbiddenDependency(packageDirectory);
  const dependencyNames = productionDependencyEntries(value)
    .map(([dependencyName]) => dependencyName);
  assert.deepEqual(
    [...dependencyNames].sort(),
    [...expectedProductionDependencyNames[name]].sort(),
    `${name} production dependency set changed.`,
  );
  const localDependencyNames = dependencyNames
    .filter((dependencyName) => localPackages.has(dependencyName))
    .sort();
  assert.deepEqual(
    localDependencyNames,
    [...expectedLocalClosure[name]].sort(),
    `${name} local production dependency closure changed.`,
  );
  for (const [dependencyName] of productionDependencyEntries(value)) {
    if (
      dependencyName.startsWith("@riddledc/riddle-proof")
      || dependencyName.startsWith("riddle-proof-")
    ) {
      assert.equal(
        localPackages.has(dependencyName),
        true,
        `${name} introduced unreviewed Riddle dependency ${dependencyName}.`,
      );
    }
  }
  for (const lifecycle of [
    "preinstall",
    "install",
    "postinstall",
    "prepack",
    "prepare",
    "postpack",
    "prepublish",
    "prepublishOnly",
  ]) {
    assert.equal(
      value.scripts?.[lifecycle],
      undefined,
      `${name} must not execute the ${lifecycle} lifecycle hook.`,
    );
  }
}

const capabilities = readJson(join(experimentDirectory, "capabilities.json"));
assert.equal(
  capabilities.version,
  "riddle-proof.experimental-capabilities.v1",
);
assert.equal(capabilities.name, "proof-guided-web-change-client");
assert.deepEqual(
  capabilities.capabilities,
  {
    network: true,
    filesystem: true,
    browser: true,
    subprocess: true,
    hosted_riddle: false,
    cryptography: true,
    ambient_clock: true,
  },
  "The private client's exact capability declaration changed.",
);

function filesBelow(entry) {
  if (!existsSync(entry)) return [];
  const stats = lstatSync(entry);
  if (stats.isSymbolicLink()) return [];
  if (stats.isFile()) return [entry];
  assert.equal(stats.isDirectory(), true, `Unsupported scan entry: ${entry}`);
  return readdirSync(entry, { withFileTypes: true }).flatMap((child) => {
    if (["dist", "node_modules"].includes(child.name)) return [];
    return filesBelow(join(entry, child.name));
  });
}

const scanEntries = [
  join(experimentDirectory, "src"),
  join(experimentDirectory, "profiles"),
  join(experimentDirectory, "scripts"),
  join(experimentDirectory, "package.json"),
  join(experimentDirectory, "capabilities.json"),
  join(repositoryRoot, "experiments", "application-projection", "src"),
  join(repositoryRoot, "experiments", "application-projection", "examples"),
  join(repositoryRoot, "experiments", "application-projection", "package.json"),
  join(repositoryRoot, "packages", "riddle-proof-core", "src"),
  join(repositoryRoot, "packages", "riddle-proof-core", "package.json"),
  join(repositoryRoot, "packages", "riddle-proof-runner-playwright", "src"),
  join(repositoryRoot, "packages", "riddle-proof-runner-playwright", "bin"),
  join(repositoryRoot, "packages", "riddle-proof-runner-playwright", "package.json"),
];
const forbiddenText = [
  ["hosted Riddle endpoint", /api\.riddledc\.com/iu],
  [
    "hosted Riddle API key",
    /\bRIDDLE_API_(?:KEY(?:_FILE)?|TOKEN)\b/u,
  ],
  [
    "hosted Riddle configuration",
    /\bRIDDLE_(?:API_(?:BASE_)?(?:URL|ENDPOINT)|HOSTED_(?:URL|ENDPOINT)|BASE_URL)\b/u,
  ],
  [
    "forbidden Riddle package import",
    /["']@riddledc\/riddle-proof(?:-packs|-riddle-client)?(?:\/[^"']*)?["']/u,
  ],
];
const findings = [];
for (const filename of scanEntries.flatMap(filesBelow)) {
  if (!/\.(?:[cm]?[jt]s|json)$/u.test(filename)) continue;
  const contents = readFileSync(filename, "utf8");
  for (const [label, pattern] of forbiddenText) {
    if (pattern.test(contents)) {
      findings.push(`${relative(repositoryRoot, filename)}: ${label}`);
    }
  }
}
assert.deepEqual(
  findings,
  [],
  `The proof-guided client closure contains hosted Riddle material:\n${findings
    .map((finding) => `- ${finding}`)
    .join("\n")}`,
);

const denyGuard = join(repositoryRoot, "scripts", "deny-hosted-riddle.cjs");
const deniedPrograms = [
  'globalThis.fetch("https://api.riddledc.com/v1/check");',
  'require("node:https").get("https://preview.riddledc.com/");',
];
for (const program of deniedPrograms) {
  const denied = spawnSync(
    process.execPath,
    ["--require", denyGuard, "--eval", program],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      timeout: 5_000,
    },
  );
  assert.notEqual(
    denied.status,
    0,
    "The hosted-Riddle guard must stop the process before network access.",
  );
  assert.match(
    `${denied.stdout}${denied.stderr}`,
    /RIDDLE_PROOF_TEST_HOSTED_RIDDLE_DENIED/u,
    "The hosted-Riddle guard must fail with its fixed denial code.",
  );
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  suite: "riddle-proof.proof-guided-web-change-boundary",
  direct_dependencies: Object.keys(expectedDependencies).length,
  checked_local_packages: localPackages.size,
  scanned_files: scanEntries.flatMap(filesBelow).length,
  deny_guard_cases: deniedPrograms.length,
})}\n`);
