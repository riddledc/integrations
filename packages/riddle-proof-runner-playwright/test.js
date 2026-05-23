import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runProfileLocal } from "./dist/index.js";

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
  const requiredFiles = [
    path.join(outputDir, "profile-result.json"),
    path.join(outputDir, "proof.json"),
    path.join(outputDir, "console.json"),
    path.join(outputDir, "dom-summary.json"),
    path.join(outputDir, "summary.md"),
    path.join(outputDir, "artifact-manifest.json"),
  ];
  for (const file of requiredFiles) {
    assert.equal(existsSync(file), true, `Expected artifact exists: ${file}`);
  }
  const parsedManifest = JSON.parse(readFileSync(path.join(outputDir, "artifact-manifest.json"), "utf8"));
  assert.equal(parsedManifest.version, "riddle-proof-local-runner-manifest.v1");
  const parsedResult = JSON.parse(readFileSync(path.join(outputDir, "profile-result.json"), "utf8"));
  assert.equal(parsedResult.version, "riddle-proof.profile-result.v1");

  const helpResult = spawnSync(process.execPath, ["./bin/riddle-proof-playwright", "--help"], {
    encoding: "utf8",
  });
  assert.equal(helpResult.status, 0);
  assert.equal(helpResult.stderr, "");
  assert.equal(helpResult.stdout.includes("riddle-proof-playwright"), true);
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
