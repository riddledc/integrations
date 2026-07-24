import assert from "node:assert/strict";
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
const appDirectory = join(
  repositoryRoot,
  "apps",
  "proof-guided-web-change",
);
const clientDirectory = join(
  repositoryRoot,
  "experiments",
  "proof-guided-web-change",
);

function readJson(filename) {
  return JSON.parse(readFileSync(filename, "utf8"));
}

const rootManifest = readJson(join(repositoryRoot, "package.json"));
const workspace = readFileSync(
  join(repositoryRoot, "pnpm-workspace.yaml"),
  "utf8",
);
assert.deepEqual(
  rootManifest.workspaces,
  ["packages/*"],
  "The private app must remain outside the publishable npm workspace.",
);
assert.doesNotMatch(
  workspace,
  /(?:^|\n)\s*-\s*["']?apps\/\*/u,
  "The private app must not enter the publishable pnpm workspace.",
);

const appManifest = readJson(join(appDirectory, "package.json"));
assert.equal(
  appManifest.name,
  "riddle-proof-guided-web-change-app",
);
assert.equal(
  appManifest.private,
  true,
  "The first website-change application must remain private.",
);
assert.deepEqual(
  appManifest.dependencies,
  {
    "riddle-proof-guided-web-change-experiment":
      "link:../../experiments/proof-guided-web-change",
  },
  "The private app production dependency boundary changed.",
);
assert.deepEqual(
  appManifest.optionalDependencies ?? {},
  {},
  "The private app must not gain optional dependencies.",
);
assert.deepEqual(
  appManifest.peerDependencies ?? {},
  {},
  "The private app must not gain peer dependencies.",
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
    `The private app must not execute the ${lifecycle} lifecycle hook.`,
  );
}

const capabilities = readJson(
  join(appDirectory, "capabilities.json"),
);
assert.equal(
  capabilities.version,
  "riddle-proof.experimental-capabilities.v1",
);
assert.equal(capabilities.name, "proof-guided-web-change-app");
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
  "The private app capability declaration changed.",
);

const clientManifest = readJson(join(clientDirectory, "package.json"));
assert.equal(
  clientManifest.private,
  true,
  "The app's proof-guided client dependency must remain private.",
);

function filesBelow(entry) {
  if (!existsSync(entry)) return [];
  const stats = lstatSync(entry);
  if (stats.isSymbolicLink()) return [];
  if (stats.isFile()) return [entry];
  assert.equal(stats.isDirectory(), true, `Unsupported scan entry: ${entry}`);
  return readdirSync(entry, { withFileTypes: true }).flatMap((child) => {
    if (["dist", "node_modules", "artifacts"].includes(child.name)) {
      return [];
    }
    return filesBelow(join(entry, child.name));
  });
}

const scanEntries = [
  join(appDirectory, "src"),
  join(appDirectory, "public"),
  join(appDirectory, "package.json"),
  join(appDirectory, "capabilities.json"),
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
    "forbidden Riddle package",
    /["']@riddledc\/riddle-proof(?:-packs|-riddle-client)?(?:\/[^"']*)?["']/u,
  ],
];
const findings = [];
for (const filename of scanEntries.flatMap(filesBelow)) {
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
  `The private app contains forbidden hosted material:\n${findings
    .map((finding) => `- ${finding}`)
    .join("\n")}`,
);

const serverSource = readFileSync(
  join(appDirectory, "src", "server.ts"),
  "utf8",
);
assert.match(
  serverSource,
  /DEFAULT_HOST\s*=\s*["']127\.0\.0\.1["']/u,
  "The local application must default to IPv4 loopback.",
);
assert.match(
  serverSource,
  /may bind only to 127\\?\.0\\?\.0\\?\.1/u,
  "The local application must reject non-loopback binding.",
);
assert.doesNotMatch(
  serverSource,
  /export\s+class\s+ProofGuidedWebChangeServer/u,
  "The raw local server constructor must not be an exported capability.",
);
for (const requiredBoundary of [
  /randomBytes\(32\)\.toString\(["']base64url["']\)/u,
  /timingSafeEqual/u,
  /x-riddle-web-change-run/u,
  /launch_url/u,
]) {
  assert.match(
    serverSource,
    requiredBoundary,
    "The local shell must retain its ephemeral run capability boundary.",
  );
}
const browserSource = readFileSync(
  join(appDirectory, "public", "app.js"),
  "utf8",
);
for (const requiredBoundary of [
  /sessionStorage/u,
  /history\.replaceState/u,
  /x-riddle-web-change-run/u,
]) {
  assert.match(
    browserSource,
    requiredBoundary,
    "The browser shell must retain its port-scoped run capability.",
  );
}

const specimenSource = readFileSync(
  join(appDirectory, "src", "specimen.ts"),
  "utf8",
);
for (const requiredBoundary of [
  /sourceIsAppOwnedVariant/u,
  /timingSafeEqual/u,
  /x-riddle-preview-run/u,
  /proofTargetAccess/u,
  /proof_target_url/u,
  /extra_http_headers/u,
]) {
  assert.match(
    specimenSource,
    requiredBoundary,
    "The owned specimen execution boundary changed.",
  );
}
assert.doesNotMatch(
  `${serverSource}\n${specimenSource}`,
  /\b(?:set-cookie|riddle_(?:preview|web_change)_run)\b/iu,
  "Run capabilities must not enter host-scoped loopback cookies.",
);
assert.doesNotMatch(
  readFileSync(join(appDirectory, "public", "index.html"), "utf8"),
  /\b(?:sha256|nonce|signature|certificate|proof DAG)\b/iu,
  "The ordinary initial UI must not expose proof ceremony.",
);

process.stdout.write(`${JSON.stringify({
  ok: true,
  suite: "riddle-proof.proof-guided-web-change-app-boundary",
  private: true,
  production_dependencies: Object.keys(appManifest.dependencies).length,
  scanned_files: scanEntries.flatMap(filesBelow).length,
  hosted_riddle: false,
  loopback_only: true,
})}\n`);
