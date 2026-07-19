import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
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
import {
  createRiddleProofGroundedDeclarativeJsonVerifier,
  verifyRiddleProofSignedCaptureBundle,
} from "@riddledc/riddle-proof-core";
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
  "<!doctype html><html><body><div id=\"app\">Local runner smoke</div><script>document.body.dataset.maxTouchPoints=String(navigator.maxTouchPoints)</script></body></html>",
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

const previewReceiptPath = path.join(workspace, "preview-receipt.json");
const previewReceipt = {
  version: "riddle.preview-receipt.v1",
  preview_id: "pv_local_runner_smoke",
  url: `file://${targetPath}`,
  expires_at: "2030-01-02T00:00:00.000Z",
  content_digest: `sha256:${"a".repeat(64)}`,
  source: {
    git_revision: "preview-source-revision",
    repository: "https://github.com/riddledc/integrations.git",
    dirty: false,
  },
  published_at: "2030-01-01T00:00:00.000Z",
};
writeFileSync(previewReceiptPath, JSON.stringify(previewReceipt), "utf8");

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

  const touchOutputDir = path.join(workspace, "touch-artifacts");
  const touchOutput = await runProfileLocal({
    profile: {
      ...profile,
      name: "local-runner-touch-viewport",
      target: {
        ...profile.target,
        viewports: [{
          name: "ipad",
          width: 820,
          height: 1180,
          hasTouch: true,
          isMobile: true,
        }],
        setup_actions: [],
      },
      checks: [{
        type: "selector_visible",
        selector: "body[data-max-touch-points='1']",
      }],
    },
    outputDir: touchOutputDir,
    url: `file://${targetPath}`,
  });
  assert.equal(touchOutput.result.status, "passed");
  assert.equal(touchOutput.result.evidence.viewports[0].width, 820);
  assert.equal(touchOutput.result.evidence.viewports[0].height, 1180);

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

  const groundedOutputDir = path.join(workspace, "grounded-artifacts");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyBytes = privateKey.export({ format: "der", type: "pkcs8" });
  const publicKeyBytes = publicKey.export({ format: "der", type: "spki" });
  const publicKeyFingerprint = `sha256:${createHash("sha256").update(publicKeyBytes).digest("hex")}`;
  const groundedScope = {
    repository: "https://github.com/riddledc/integrations.git",
    revision: "runner-grounding-test",
    environment: "local-playwright-test",
    target: `file://${targetPath}`,
    proof_attempt: "grounded-runner-smoke",
  };
  const groundedNonce = Buffer.alloc(32, 19).toString("base64url");
  const groundedCollector = {
    collector_id: "@riddledc/riddle-proof-runner-playwright",
    collector_version: "0.4.6",
    implementation_digest: `sha256:${"1".repeat(64)}`,
  };
  const groundedVerifierDefinition = createRiddleProofGroundedDeclarativeJsonVerifier({
    verifier_id: "riddle-proof.browser-profile-evidence",
    verifier_version: "1",
    program: {
      artifact: {
        artifact_id: "profile-evidence.json",
        role: "browser_observation",
        media_type: "application/json",
      },
      pointer: "",
    },
  });
  assert.equal(
    groundedVerifierDefinition.ok,
    true,
    groundedVerifierDefinition.ok ? undefined : groundedVerifierDefinition.error.message,
  );
  const groundedVerifierRef = groundedVerifierDefinition.verifier_ref;
  const groundedCaptureOptions = {
    scope: groundedScope,
    nonce: groundedNonce,
    collector: groundedCollector,
    verifier: groundedVerifierRef,
    signingKey: {
      key_id: "runner-grounding-test-key",
      private_key_pkcs8_base64: privateKeyBytes.toString("base64"),
    },
  };
  const groundedOutput = await runProfileLocal({
    profile,
    outputDir: groundedOutputDir,
    url: groundedScope.target,
    groundedCapture: groundedCaptureOptions,
  });
  assert.equal(
    groundedOutput.groundedCapturePath,
    path.join(groundedOutputDir, "grounded-capture-bundle.json"),
  );
  assert.equal(existsSync(groundedOutput.groundedCapturePath), true);
  const groundedBundle = groundedOutput.groundedCaptureBundle;
  assert.ok(groundedBundle);
  assert.deepEqual(
    JSON.parse(readFileSync(groundedOutput.groundedCapturePath, "utf8")),
    groundedBundle,
  );
  assert.equal(groundedBundle.statement.sensor.kind, "browser");
  assert.equal(groundedBundle.statement.sensor.name, "chromium");
  assert.notEqual(groundedBundle.statement.sensor.version, "unknown");
  assert.match(groundedBundle.statement.sensor.metadata.user_agent, /Chrome|Chromium/u);
  assert.equal(
    groundedBundle.statement.sensor.metadata.capture_policy.artifact_bytes,
    "exact_persisted_bytes",
  );

  const groundedArtifactIds = groundedBundle.statement.artifacts.map((artifact) => artifact.artifact_id);
  assert.ok(groundedArtifactIds.includes("normalized-profile.json"));
  assert.ok(groundedArtifactIds.includes("profile-evidence.json"));
  assert.ok(groundedArtifactIds.some((artifactId) => artifactId.startsWith("screenshots/")));
  assert.equal(groundedArtifactIds.includes("artifact-manifest.json"), false);
  assert.equal(groundedArtifactIds.includes("observation-receipt.json"), false);
  assert.equal(groundedArtifactIds.includes("grounded-capture-bundle.json"), false);
  for (const artifact of groundedBundle.statement.artifacts) {
    const persistedBytes = readFileSync(path.join(groundedOutputDir, artifact.artifact_id));
    assert.equal(artifact.byte_length, persistedBytes.byteLength);
    assert.equal(
      artifact.artifact_digest,
      `sha256:${createHash("sha256").update(persistedBytes).digest("hex")}`,
      `signed digest binds exact persisted bytes for ${artifact.artifact_id}`,
    );
  }

  assert.equal("verify" in groundedVerifierDefinition.registration, false);
  const groundedPolicy = {
    expected_scope: groundedScope,
    expected_nonce: groundedNonce,
    expected_collector: groundedCollector,
    expected_sensor: groundedBundle.statement.sensor,
    expected_verifier: groundedVerifierRef,
    expected_signer: {
      key_id: "runner-grounding-test-key",
      public_key_spki_sha256: publicKeyFingerprint,
    },
    verification_time: groundedBundle.statement.captured_at,
    max_capture_age_ms: 60_000,
    max_future_skew_ms: 1_000,
    required_artifact_roles: ["profile_contract", "browser_observation", "screenshot"],
  };
  const groundedVerificationInput = {
    bundle: groundedBundle,
    policy: groundedPolicy,
    trusted_signers: [{
      key_id: "runner-grounding-test-key",
      public_key_spki_base64: publicKeyBytes.toString("base64"),
    }],
    verifier_registry: [groundedVerifierDefinition.registration],
  };
  const groundedVerification = verifyRiddleProofSignedCaptureBundle(groundedVerificationInput);
  assert.equal(
    groundedVerification.ok,
    true,
    groundedVerification.ok ? undefined : groundedVerification.error.message,
  );

  const changedArtifactBundle = structuredClone(groundedBundle);
  const evidenceIndex = changedArtifactBundle.inline_artifacts.findIndex(
    (artifact) => artifact.artifact_id === "profile-evidence.json",
  );
  assert.notEqual(evidenceIndex, -1);
  changedArtifactBundle.inline_artifacts[evidenceIndex].bytes_base64 = Buffer.from(
    JSON.stringify({ tampered: true }),
  ).toString("base64");
  const changedArtifactVerification = verifyRiddleProofSignedCaptureBundle({
    ...groundedVerificationInput,
    bundle: changedArtifactBundle,
  });
  assert.equal(changedArtifactVerification.ok, false);
  assert.equal(changedArtifactVerification.error.code, "invalid_bundle");

  const unavailableGroundedOutputDir = path.join(workspace, "grounded-unavailable-artifacts");
  const unavailableGroundedOutput = await runProfileLocal({
    profile,
    outputDir: unavailableGroundedOutputDir,
    url: groundedScope.target,
    groundedCapture: {
      ...groundedCaptureOptions,
      signingKey: {
        key_id: "runner-grounding-test-key",
        private_key_pkcs8_base64: Buffer.from("not-an-ed25519-private-key").toString("base64"),
      },
    },
  });
  assert.equal(unavailableGroundedOutput.result.status, "environment_blocked");
  assert.equal(unavailableGroundedOutput.groundedCapturePath, undefined);
  assert.equal(unavailableGroundedOutput.groundedCaptureBundle, undefined);
  assert.equal(unavailableGroundedOutput.groundedCaptureError?.code, "grounded_capture_unavailable");
  assert.match(unavailableGroundedOutput.groundedCaptureError?.message || "", /No signed browser capture was created/u);
  assert.equal(
    existsSync(path.join(unavailableGroundedOutputDir, "grounded-capture-bundle.json")),
    false,
  );

  const helpResult = spawnSync(process.execPath, ["./bin/riddle-proof-playwright", "--help"], {
    encoding: "utf8",
  });
  assert.equal(helpResult.status, 0);
  assert.equal(helpResult.stderr, "");
  assert.equal(helpResult.stdout.includes("riddle-proof-playwright"), true);
  assert.equal(helpResult.stdout.includes("--preview-receipt"), true);

  const previewOutputDir = path.join(workspace, "preview-artifacts");
  const previewResult = spawnSync(process.execPath, [
    "./bin/riddle-proof-playwright",
    "run-profile",
    "--profile",
    JSON.stringify(profile),
    "--url",
    `file://${targetPath}`,
    "--preview-receipt",
    previewReceiptPath,
    "--source-revision",
    "explicit-source-revision",
    "--output",
    previewOutputDir,
  ], {
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(previewResult.signal, null, previewResult.stderr || previewResult.stdout);
  assert.equal(previewResult.status, 0, previewResult.stderr || previewResult.stdout);
  const previewObservation = JSON.parse(
    readFileSync(path.join(previewOutputDir, "observation-receipt.json"), "utf8"),
  );
  assert.equal(previewObservation.target.kind, "preview");
  assert.deepEqual(previewObservation.target.preview, previewReceipt);
  assert.equal(previewObservation.source.git_revision, "explicit-source-revision");
  assert.equal(previewObservation.source.repository, previewReceipt.source.repository);
  assert.equal(previewObservation.source.dirty, false);

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
