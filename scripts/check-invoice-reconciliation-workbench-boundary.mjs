import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
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
const appDirectory = join(
  repositoryRoot,
  "apps",
  "invoice-reconciliation-workbench",
);

function readJson(filename) {
  return JSON.parse(readFileSync(filename, "utf8"));
}

function filesBelow(entry) {
  if (!existsSync(entry)) return [];
  const stats = lstatSync(entry);
  if (stats.isSymbolicLink()) return [];
  if (stats.isFile()) return [entry];
  assert.equal(stats.isDirectory(), true, `Unsupported scan entry: ${entry}`);
  return readdirSync(entry, { withFileTypes: true }).flatMap((child) => {
    if (["dist", "node_modules", "artifacts"].includes(child.name)) return [];
    return filesBelow(join(entry, child.name));
  });
}

const rootManifest = readJson(join(repositoryRoot, "package.json"));
const workspace = readFileSync(
  join(repositoryRoot, "pnpm-workspace.yaml"),
  "utf8",
);
assert.deepEqual(
  rootManifest.workspaces,
  ["packages/*"],
  "The invoice workbench must remain outside the publishable npm workspace.",
);
assert.doesNotMatch(
  workspace,
  /(?:^|\n)\s*-\s*["']?(?:apps|experiments)\/\*/u,
  "Private clients and experiments must not enter the publishable workspace.",
);

const appManifest = readJson(join(appDirectory, "package.json"));
assert.equal(
  appManifest.name,
  "riddle-invoice-reconciliation-workbench",
);
assert.equal(
  appManifest.private,
  true,
  "The invoice workbench must remain private.",
);
assert.deepEqual(
  appManifest.dependencies,
  {
    "@riddledc/riddle-proof-core":
      "link:../../packages/riddle-proof-core",
    "@riddledc/riddle-proof-local":
      "link:../../packages/riddle-proof-local",
    "riddle-proof-application-projection-experiment":
      "link:../../experiments/application-projection",
  },
  "The invoice workbench production dependency boundary changed.",
);
assert.deepEqual(
  appManifest.optionalDependencies ?? {},
  {},
  "The invoice workbench must not gain optional dependencies.",
);
assert.deepEqual(
  appManifest.peerDependencies ?? {},
  {},
  "The invoice workbench must not gain peer dependencies.",
);
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
    appManifest.scripts?.[lifecycle],
    undefined,
    `The invoice workbench must not execute the ${lifecycle} lifecycle hook.`,
  );
}

const capabilities = readJson(join(appDirectory, "capabilities.json"));
assert.equal(
  capabilities.version,
  "riddle-proof.experimental-capabilities.v1",
);
assert.equal(capabilities.name, "invoice-reconciliation-workbench");
assert.deepEqual(
  capabilities.capabilities,
  {
    network: true,
    filesystem: true,
    browser: false,
    subprocess: false,
    hosted_riddle: false,
    cryptography: true,
    ambient_clock: true,
  },
  "The invoice workbench capability declaration changed.",
);

const localClosure = new Map([
  [
    "@riddledc/riddle-proof-core",
    join(repositoryRoot, "packages", "riddle-proof-core"),
  ],
  [
    "@riddledc/riddle-proof-local",
    join(repositoryRoot, "packages", "riddle-proof-local"),
  ],
  [
    "riddle-proof-application-projection-experiment",
    join(repositoryRoot, "experiments", "application-projection"),
  ],
]);
for (const [name, directory] of localClosure) {
  const manifest = readJson(join(directory, "package.json"));
  assert.equal(manifest.name, name);
  assert.deepEqual(
    manifest.dependencies ?? {},
    {},
    `${name} gained a production dependency.`,
  );
  assert.deepEqual(
    manifest.optionalDependencies ?? {},
    {},
    `${name} gained an optional dependency.`,
  );
  assert.deepEqual(
    manifest.peerDependencies ?? {},
    {},
    `${name} gained a peer dependency.`,
  );
  const installed = join(
    appDirectory,
    "node_modules",
    ...name.split("/"),
  );
  if (existsSync(installed)) {
    assert.equal(
      realpathSync(installed),
      realpathSync(directory),
      `${name} is not installed from the reviewed local package.`,
    );
  }
}
const installedRoot = join(appDirectory, "node_modules");
assert.equal(
  existsSync(installedRoot),
  true,
  "Prepare the isolated workbench dependency closure before checking it.",
);
{
  const installedTopLevel = readdirSync(installedRoot)
    .filter((name) => !name.startsWith("."))
    .sort();
  assert.deepEqual(
    installedTopLevel,
    ["@riddledc", "riddle-proof-application-projection-experiment"],
    "The actual installed top-level dependency closure changed.",
  );
  assert.deepEqual(
    readdirSync(join(installedRoot, "@riddledc")).sort(),
    ["riddle-proof-core", "riddle-proof-local"],
    "The installed @riddledc scope contains an unapproved package.",
  );
  for (const [name, directory] of localClosure) {
    const installed = join(
      installedRoot,
      ...name.split("/"),
    );
    assert.equal(
      existsSync(installed),
      true,
      `${name} is absent from the installed dependency closure.`,
    );
    assert.equal(
      realpathSync(installed),
      realpathSync(directory),
      `${name} is not installed from the reviewed local package.`,
    );
  }
  assert.deepEqual(
    readdirSync(join(installedRoot, ".bin")).sort(),
    ["riddle-proof-local"],
    "The installed executable closure changed.",
  );
  assert.deepEqual(
    readdirSync(join(installedRoot, ".pnpm")).sort(),
    ["lock.yaml"],
    "The installed virtual store contains an unapproved package.",
  );

  // pnpm 11 emits .package-map.json for this link-only installation, while
  // the repository-pinned pnpm 9 does not. Exact top-level links, exact
  // realpaths, an empty virtual store, and dependency-free linked manifests
  // above are the portable closure check. Validate the package map as an
  // additional witness whenever the active pnpm version supplies it.
  const packageMapFilename = join(installedRoot, ".package-map.json");
  if (existsSync(packageMapFilename)) {
    const packageMap = readJson(packageMapFilename);
    const packageEntries = Object.values(packageMap.packages ?? {});
    const rootEntry = packageEntries.find((entry) => entry.url === "..");
    assert.ok(rootEntry, "The installed package map has no application root.");
    assert.deepEqual(
      Object.keys(rootEntry.dependencies ?? {}).sort(),
      [
        "@riddledc/riddle-proof-core",
        "@riddledc/riddle-proof-local",
        "riddle-invoice-reconciliation-workbench",
        "riddle-proof-application-projection-experiment",
      ],
      "The actual installed dependency map changed.",
    );
    for (const entry of packageEntries) {
      const installedEntry = JSON.stringify(entry);
      for (const forbidden of [
        "@riddledc/riddle-proof",
        "@riddledc/riddle-proof-packs",
        "@riddledc/riddle-proof-riddle-client",
        "@riddledc/riddle-proof-runner-playwright",
        "playwright",
      ]) {
        assert.equal(
          installedEntry.includes(`"${forbidden}"`),
          false,
          `The actual installed closure contains ${forbidden}.`,
        );
      }
      assert.doesNotMatch(
        installedEntry,
        /"@aws-sdk\//u,
        "The actual installed closure contains an AWS SDK package.",
      );
    }
  }
}

const scanEntries = [
  join(appDirectory, "src"),
  join(appDirectory, "public"),
  join(appDirectory, "fixtures"),
  join(appDirectory, "bin"),
  join(appDirectory, "package.json"),
  join(appDirectory, "capabilities.json"),
];
const scanFiles = scanEntries.flatMap(filesBelow);
const forbiddenText = [
  ["hosted Riddle endpoint", /(?:api|preview)\.riddledc\.com/iu],
  [
    "hosted Riddle API key",
    /\bRIDDLE_API_(?:KEY(?:_FILE)?|TOKEN)\b/u,
  ],
  [
    "hosted Riddle configuration",
    /\bRIDDLE_(?:API_(?:BASE_)?(?:URL|ENDPOINT)|HOSTED_(?:URL|ENDPOINT)|BASE_URL)\b/u,
  ],
  [
    "forbidden Riddle package",
    /["']@riddledc\/riddle-proof(?:-packs|-riddle-client)?(?:\/[^"']*)?["']/u,
  ],
  [
    "outbound-network client",
    /(?:from\s+|require\()["'](?:node:)?(?:https|net|tls|dgram|dns|undici|axios|got)["']/u,
  ],
  [
    "browser automation",
    /(?:from\s+|require\()["'](?:playwright|puppeteer|selenium-webdriver)["']/u,
  ],
  [
    "subprocess execution",
    /(?:from\s+|require\()["']node:child_process["']/u,
  ],
  [
    "absolute or protocol-relative request target",
    /(?:https?:)?\/\/(?!(?:invoice-workbench\.local|www\.w3\.org\/2000\/svg)\b)[A-Za-z0-9]/u,
  ],
];
const findings = [];
for (const filename of scanFiles) {
  if (!/\.(?:[cm]?[jt]s|json|html|css)$/u.test(filename)) continue;
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
  `The invoice workbench contains forbidden capability material:\n${findings
    .map((finding) => `- ${finding}`)
    .join("\n")}`,
);

const serverSource = readFileSync(
  join(appDirectory, "src", "server.ts"),
  "utf8",
);
for (const requiredBoundary of [
  /DEFAULT_HOST\s*=\s*["']127\.0\.0\.1["']/u,
  /randomBytes\(32\)\.toString\(["']base64url["']\)/u,
  /timingSafeEqual/u,
  /x-riddle-invoice-run/u,
  /requestAuthorityAllowed/u,
  /requestOriginAllowed/u,
  /assertEmptyBody/u,
  /may bind only to 127\\?\.0\\?\.0\\?\.1/u,
]) {
  assert.match(
    serverSource,
    requiredBoundary,
    "The loopback server boundary changed.",
  );
}
const browserSource = readFileSync(
  join(appDirectory, "public", "app.js"),
  "utf8",
);
for (const requiredBoundary of [
  /sessionStorage/u,
  /history\.replaceState/u,
  /x-riddle-invoice-run/u,
  /jsonRequest\(["']\/api\/state["']/u,
  /jsonRequest\(\s*[`"']\/api\/audit\?/u,
]) {
  assert.match(
    browserSource,
    requiredBoundary,
    "The ordinary browser shell boundary changed.",
  );
}

const captureSource = readFileSync(
  join(appDirectory, "src", "capture.ts"),
  "utf8",
);
for (const requiredBoundary of [
  /artifactPolicy:\s*["']full["']/u,
  /artifactPolicy:\s*["']digest_only["']/u,
  /privateFull\.snapshot\.snapshot_id\s*!==\s*digestOnly\.snapshot\.snapshot_id/u,
  /receipt:\s*digestOnly/u,
]) {
  assert.match(
    captureSource,
    requiredBoundary,
    "The stable full-capture to digest-only receipt boundary changed.",
  );
}

const applicationSource = readFileSync(
  join(appDirectory, "src", "application.ts"),
  "utf8",
);
for (const requiredBoundary of [
  /flag:\s*["']wx["']/u,
  /mode:\s*0o600/u,
  /compareDocumentSnapshotReceipts/u,
  /selected_record_set_changed_outside_workbench/u,
  /prior proof is historical and cannot apply to this record set/u,
]) {
  assert.match(
    applicationSource,
    requiredBoundary,
    "The immutable revision/currentness boundary changed.",
  );
}

const fixtureText = [
  "invoice.v1.json",
  "purchase-order.json",
  "receipt.json",
].map((filename) =>
  readFileSync(
    join(appDirectory, "fixtures", "over-invoiced", filename),
    "utf8",
  )).join("\n");
assert.match(
  fixtureText,
  /synthetic/iu,
  "Every public workbench scenario must remain conspicuously synthetic.",
);
assert.doesNotMatch(
  fixtureText,
  /\b(?:confidential|privileged|real customer|actual vendor)\b/iu,
  "The public fixture set appears to contain non-synthetic material.",
);

process.stdout.write(`${JSON.stringify({
  ok: true,
  suite: "riddle-proof.invoice-reconciliation-workbench-boundary",
  private: true,
  production_dependencies: Object.keys(appManifest.dependencies).length,
  scanned_files: scanFiles.length,
  hosted_riddle: false,
  outbound_network: false,
  loopback_only: true,
  subprocess: false,
  browser_automation: false,
})}\n`);
