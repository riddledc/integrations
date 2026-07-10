import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runProfileLocal } from "./dist/index.js";
import { launchPlaywrightBrowser } from "./dist/browser.js";

const fallbackLaunches = [];
const fallbackBrowser = { close: async () => {} };
const fallbackLauncher = {
  launch: async (options) => {
    fallbackLaunches.push(options);
    if (!options.channel) throw new Error("Executable doesn't exist; run playwright install");
    return fallbackBrowser;
  },
};
assert.equal(
  await launchPlaywrightBrowser(fallbackLauncher, { headless: true }, { browserName: "chromium" }),
  fallbackBrowser,
);
assert.deepEqual(fallbackLaunches, [{ headless: true }, { headless: true, channel: "chrome" }]);
await assert.rejects(
  () => launchPlaywrightBrowser(fallbackLauncher, { headless: true }, {
    browserName: "chromium",
    playwrightBrowsersPath: "/explicit/browser/path",
  }),
  /Executable doesn't exist/,
);

const workspace = mkdtempSync(path.join(tmpdir(), "riddle-proof-runner-playwright-"));
const outputDir = path.join(workspace, "artifacts");
const targetPath = path.join(workspace, "target.html");

writeFileSync(
  targetPath,
  "<!doctype html><html><body><div id=\"app\">Local runner smoke</div></body></html>",
  "utf8",
);

const profile = {
  version: "riddle-proof.profile.v1",
  name: "local-runner-smoke",
  target: {
    viewports: [
      { name: "desktop", width: 1280, height: 800 },
    ],
    auth: "none",
    wait_for_selector: "body",
    setup_actions: [{ type: "wait", ms: 50 }],
  },
  checks: [
    { type: "text_visible", text: "Local runner smoke" },
    { type: "selector_visible", selector: "#app" },
    { type: "no_fatal_console_errors" },
  ],
};

try {
  const output = await runProfileLocal({
    profile,
    outputDir,
    url: `file://${targetPath}`,
  });

  assert.equal(output.result.profile_name, "local-runner-smoke");
  assert.equal(path.resolve(output.outputDir), path.resolve(outputDir));
  assert.equal(output.result.artifacts.proof_json, "proof.json");
  assert.ok(
    output.result.artifacts.riddle_artifacts?.some((artifact) => artifact.kind === "screenshot"),
    JSON.stringify({ status: output.result.status, route: output.result.route, page_errors: output.result.evidence?.page_errors }),
  );
  const requiredFiles = [
    path.join(outputDir, "profile-result.json"),
    path.join(outputDir, "proof.json"),
    path.join(outputDir, "console.json"),
    path.join(outputDir, "dom-summary.json"),
    path.join(outputDir, "summary.md"),
    path.join(outputDir, "artifact-manifest.json"),
    path.join(outputDir, "observation-receipt.json"),
  ];
  for (const file of requiredFiles) {
    assert.equal(existsSync(file), true, `Expected artifact exists: ${file}`);
  }
  const parsedManifest = JSON.parse(readFileSync(path.join(outputDir, "artifact-manifest.json"), "utf8"));
  assert.equal(parsedManifest.version, "riddle-proof-local-runner-manifest.v1");
  assert.ok(parsedManifest.artifacts.some((artifact) => artifact.kind === "screenshot"));
  assert.ok(parsedManifest.artifacts.some((artifact) => artifact.path === "observation-receipt.json"));
  const parsedResult = JSON.parse(readFileSync(path.join(outputDir, "profile-result.json"), "utf8"));
  assert.equal(parsedResult.version, "riddle-proof.profile-result.v1");
  assert.equal(output.observation.version, "riddle-proof.observation-receipt.v1");
  assert.equal(output.observation.executor.kind, "local_playwright");
  assert.equal(output.observation.canonical_screenshot?.role, "canonical_screenshot");
  assert.match(output.observation.canonical_screenshot?.path || "", /^screenshots\//);
  assert.ok(output.observation.artifacts.some((artifact) => artifact.path === "artifact-manifest.json"));

  const helpResult = spawnSync(process.execPath, ["./bin/riddle-proof-playwright", "--help"], {
    encoding: "utf8",
  });
  assert.equal(helpResult.status, 0);
  assert.equal(helpResult.stderr, "");
  assert.equal(helpResult.stdout.includes("riddle-proof-playwright"), true);

  const timeoutProfilePath = path.join(workspace, "profile-with-timeout.json");
  const timeoutOutputDir = path.join(workspace, "timeout-artifacts");
  writeFileSync(
    timeoutProfilePath,
    JSON.stringify({
      ...profile,
      name: "local-runner-timeout-cleanup-smoke",
      target: {
        ...profile.target,
        timeout_sec: 60,
      },
    }),
    "utf8",
  );
  const timeoutResult = spawnSync(process.execPath, [
    "./bin/riddle-proof-playwright",
    "run-profile",
    "--profile",
    timeoutProfilePath,
    "--url",
    `file://${targetPath}`,
    "--output",
    timeoutOutputDir,
  ], {
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(timeoutResult.signal, null, timeoutResult.stderr || timeoutResult.stdout);
  assert.equal(timeoutResult.status, 0, timeoutResult.stderr || timeoutResult.stdout);
  assert.equal(existsSync(path.join(timeoutOutputDir, "profile-result.json")), true);

  const missingBrowserProfilePath = path.join(workspace, "profile-missing-browser.json");
  const missingBrowserOutputDir = path.join(workspace, "missing-browser-artifacts");
  const missingBrowserPath = path.join(workspace, "empty-playwright-browsers");
  mkdirSync(missingBrowserPath, { recursive: true });
  writeFileSync(
    missingBrowserProfilePath,
    JSON.stringify({
      ...profile,
      name: "local-runner-missing-browser-blocked",
      failure_policy: { environment_blocked: "fail" },
    }),
    "utf8",
  );
  const missingBrowserResult = spawnSync(process.execPath, [
    "./bin/riddle-proof-playwright",
    "run-profile",
    "--profile",
    missingBrowserProfilePath,
    "--url",
    `file://${targetPath}`,
    "--output",
    missingBrowserOutputDir,
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: missingBrowserPath,
    },
    timeout: 10_000,
  });
  assert.equal(missingBrowserResult.signal, null, missingBrowserResult.stderr || missingBrowserResult.stdout);
  assert.equal(missingBrowserResult.status, 1, missingBrowserResult.stderr || missingBrowserResult.stdout);
  assert.equal(missingBrowserResult.stderr, "");
  const parsedMissingBrowserResult = JSON.parse(missingBrowserResult.stdout);
  assert.equal(parsedMissingBrowserResult.result.status, "environment_blocked");
  assert.equal(parsedMissingBrowserResult.result.runner, "local-playwright");
  assert.match(parsedMissingBrowserResult.result.route.error, /Executable doesn't exist|browserType\.launch/);
  assert.equal(existsSync(path.join(missingBrowserOutputDir, "profile-result.json")), true);
  assert.equal(
    JSON.parse(readFileSync(path.join(missingBrowserOutputDir, "profile-result.json"), "utf8")).status,
    "environment_blocked",
  );

  const collectorResult = spawnSync(process.execPath, [
    "./bin/riddle-proof-playwright",
    "run-profile",
    "--profile",
    missingBrowserProfilePath,
    "--url",
    `file://${targetPath}`,
    "--output",
    path.join(workspace, "missing-browser-collector-artifacts"),
    "--always-zero",
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: missingBrowserPath,
    },
    timeout: 10_000,
  });
  assert.equal(collectorResult.status, 0, collectorResult.stderr || collectorResult.stdout);
  assert.equal(JSON.parse(collectorResult.stdout).result.status, "environment_blocked");
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
