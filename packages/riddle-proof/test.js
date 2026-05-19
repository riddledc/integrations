import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import {
  appendStageHeartbeat,
  appendRunEvent,
  assessPlayabilityEvidence,
  applyTerminalMetadata,
  applyPrLifecycleState,
  appendCaptureDiagnostic,
  assessBasicGameplayEvidence,
  attachBasicGameplayArtifactScreenshotHashes,
  BASIC_GAMEPLAY_ACTION_TYPES,
  BASIC_GAMEPLAY_PROGRESS_CHECK_TYPES,
  compactBasicGameplayText,
  createBasicGameplayCatchRecords,
  createBasicGameplayCatchSummary,
  createDisabledRiddleProofAgentAdapter,
  createCaptureDiagnostic,
  createCheckpointResponseTemplate,
  assessRiddleProofProfileEvidence,
  buildRiddleProofProfileScript,
  collectRiddleProfileArtifactRefs,
  collectRiddleProofProfileWarnings,
  createRunStatusSnapshot,
  createRunState,
  createRiddleProofRunCard,
  deriveRiddleProofArtifactBodyAssertions,
  extractRiddleProofProfileResult,
  createRunResult,
  createCodexExecAgentAdapter,
  createLocalAgentAdapter,
  isSuccessfulStatus,
  isTerminalStatus,
  normalizeRiddleProofProfile,
  normalizeTerminalMetadata,
  preflightRiddleProofProfileHttpStatusChecks,
  resolveRiddleProofProfileTimeoutSec,
  resolveRiddleProofProfileRouteUrl,
  redactForProofDiagnostics,
  resolveRiddleProofProfileTargetUrl,
  extractPlayabilityEvidence,
  extractBasicGameplayEvidence,
  readRiddleProofRunStatus,
  runRiddleProofEngineHarness,
  runRiddleProof,
  setRunStatus,
  summarizeCaptureArtifacts,
  createRiddleApiClient,
  deployRiddlePreview,
  deployRiddleStaticPreview,
  parseRiddleViewport,
  RIDDLE_PROOF_PROFILE_CHECK_TYPES,
  RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES,
} from "./dist/index.js";
import {
  parseOpenClawAssertions,
  parseOpenClawJsonObjectOrArray,
  toRiddleProofRunParams,
} from "./dist/openclaw.js";

const require = createRequire(import.meta.url);
const cjs = require("./dist/index.cjs");
const cjsDiagnostics = require("./dist/diagnostics.cjs");
const cjsPlayability = require("./dist/playability.cjs");
const cjsBasicGameplay = require("./dist/basic-gameplay.cjs");
const cjsProfile = require("./dist/profile.cjs");
const cjsOpenClaw = require("./dist/openclaw.cjs");
assert.equal(typeof cjs.normalizeTerminalMetadata, "function");
assert.equal(typeof cjs.createCaptureDiagnostic, "function");
assert.equal(typeof cjs.createCheckpointResponseTemplate, "function");
assert.equal(typeof cjs.createRiddleProofRunCard, "function");
assert.equal(typeof cjs.createCodexExecAgentAdapter, "function");
assert.equal(typeof cjs.createLocalAgentAdapter, "function");
assert.equal(typeof cjsDiagnostics.summarizeCaptureArtifacts, "function");
assert.equal(typeof cjs.assessPlayabilityEvidence, "function");
assert.equal(typeof cjsPlayability.extractPlayabilityEvidence, "function");
assert.equal(typeof cjs.assessBasicGameplayEvidence, "function");
assert.equal(typeof cjs.attachBasicGameplayArtifactScreenshotHashes, "function");
assert.equal(typeof cjs.createBasicGameplayCatchRecords, "function");
assert.equal(typeof cjs.createBasicGameplayCatchSummary, "function");
assert.equal(typeof cjsBasicGameplay.extractBasicGameplayEvidence, "function");
assert.equal(typeof cjsBasicGameplay.compactBasicGameplayText, "function");
assert.equal(typeof cjs.assessRiddleProofProfileEvidence, "function");
assert.equal(typeof cjs.deriveRiddleProofArtifactBodyAssertions, "function");
assert.equal(typeof cjs.preflightRiddleProofProfileHttpStatusChecks, "function");
assert.equal(typeof cjs.resolveRiddleProofProfileTimeoutSec, "function");
assert.equal(typeof cjs.resolveRiddleProofProfileRouteUrl, "function");
assert.equal(typeof cjsProfile.normalizeRiddleProofProfile, "function");
assert.equal(typeof cjsProfile.collectRiddleProofProfileWarnings, "function");
assert.equal(typeof cjsProfile.preflightRiddleProofProfileHttpStatusChecks, "function");
assert.equal(typeof cjsProfile.resolveRiddleProofProfileTimeoutSec, "function");
assert.equal(typeof cjsProfile.resolveRiddleProofProfileRouteUrl, "function");
assert.equal(typeof cjsProfile.buildRiddleProofProfileScript, "function");
assert.equal(typeof cjs.runRiddleProof, "function");
assert.equal(typeof cjsOpenClaw.toRiddleProofRunParams, "function");
assert.equal(typeof cjs.createRiddleApiClient, "function");
assert.equal(typeof cjs.deployRiddlePreview, "function");
assert.equal(typeof cjs.deployRiddleStaticPreview, "function");

function runCli(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      new URL("./dist/cli.js", import.meta.url).pathname,
      ...args,
    ], {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...(options.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(`CLI exited with code ${code}: ${stderr || stdout}`);
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

const artifactAssertion = deriveRiddleProofArtifactBodyAssertions({
  artifact_text: "status passed; Timed Out; partial results available",
  candidates: ["passed", "completed_timeout", "partial results available", "passed"],
  required: ["Timed Out"],
});
assert.equal(artifactAssertion.ok, true);
assert.deepEqual(artifactAssertion.body_contains, ["Timed Out", "passed", "partial results available"]);
assert.deepEqual(artifactAssertion.missing_candidates, ["completed_timeout"]);
assert.deepEqual(artifactAssertion.missing_required, []);

const artifactAssertionRequiredMiss = deriveRiddleProofArtifactBodyAssertions({
  artifact_text: "status product_regression",
  candidates: ["product_regression"],
  required: ["completed_timeout"],
});
assert.equal(artifactAssertionRequiredMiss.ok, false);
assert.deepEqual(artifactAssertionRequiredMiss.body_contains, ["product_regression"]);
assert.deepEqual(artifactAssertionRequiredMiss.missing_required, ["completed_timeout"]);

const artifactAssertionDir = mkdtempSync(path.join(os.tmpdir(), "riddle-proof-artifact-assertions-"));
const artifactAssertionFile = path.join(artifactAssertionDir, "proof.json");
const artifactCandidatesFile = path.join(artifactAssertionDir, "candidates.json");
writeFileSync(artifactAssertionFile, JSON.stringify({
  status: "product_regression",
  summary: "Timed Out without partial results available",
}, null, 2));
writeFileSync(artifactCandidatesFile, JSON.stringify(["product_regression", "completed_timeout", "partial results available"]));
const artifactAssertionCli = await runCli([
  "profile-body-assertions",
  "--artifact",
  artifactAssertionFile,
  "--candidates-json",
  artifactCandidatesFile,
  "--required-json",
  JSON.stringify(["product_regression"]),
]);
const artifactAssertionCliJson = JSON.parse(artifactAssertionCli.stdout);
assert.equal(artifactAssertionCliJson.ok, true);
assert.deepEqual(artifactAssertionCliJson.body_contains, ["product_regression", "partial results available"]);
assert.deepEqual(artifactAssertionCliJson.missing_candidates, ["completed_timeout"]);

const artifactAssertionBodyOnly = await runCli([
  "profile-body-assertions",
  "--artifact",
  artifactAssertionFile,
  "--candidates-json",
  artifactCandidatesFile,
  "--format",
  "body-contains",
]);
assert.deepEqual(JSON.parse(artifactAssertionBodyOnly.stdout), ["product_regression", "partial results available"]);

let missingRequiredFailed = false;
try {
  await runCli([
    "profile-body-assertions",
    "--artifact",
    artifactAssertionFile,
    "--required-json",
    JSON.stringify(["completed_timeout"]),
  ]);
} catch (error) {
  missingRequiredFailed = true;
  assert.equal(error.code, 1);
  assert.match(error.stdout, /completed_timeout/);
}
assert.equal(missingRequiredFailed, true);

const httpStatusPreflightProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "http-status-preflight",
  target: { url: "https://example.test/" },
  checks: [
    {
      type: "http_status",
      label: "proof artifact body",
      url: "/proof.json",
      expected_status: 200,
      allowed_content_types: ["application/json"],
      min_bytes: 10,
      body_contains: ["passed", "missing-snippet"],
      body_not_contains: ["raw-secret"],
      body_not_patterns: ["Traceback"],
      body_json_assertions: [
        { label: "status field", path: "status", equals: "passed" },
        { label: "first check status", path: "checks[0].status", equals: "passed" },
        { label: "checks array", path: "checks", type: "array" },
        { label: "meta object", path: "meta", type: "object" },
        { label: "debug absent", path: "debug", exists: false },
      ],
    },
  ],
});
const httpStatusPreflight = await preflightRiddleProofProfileHttpStatusChecks(httpStatusPreflightProfile, {
  fetchImpl: async (url, init = {}) => {
    assert.equal(url, "https://example.test/proof.json");
    assert.equal(init.method, "GET");
    const body = JSON.stringify({ status: "passed", checks: [{ status: "passed" }], meta: { job_id: "job_json_assertion" }, leak: "raw-secret" });
    return new Response(body, {
      status: 200,
      headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) },
    });
  },
});
assert.equal(httpStatusPreflight.ok, false);
assert.equal(httpStatusPreflight.checked, 1);
assert.equal(httpStatusPreflight.failed, 1);
assert.deepEqual(httpStatusPreflight.checks[0].body_contains_missing, ["missing-snippet"]);
assert.deepEqual(httpStatusPreflight.checks[0].body_not_contains_found, ["raw-secret"]);
assert.deepEqual(httpStatusPreflight.checks[0].body_not_patterns_found, []);
assert.equal(httpStatusPreflight.checks[0].body_json_assertions.length, 5);
const compactArrayAssertion = httpStatusPreflight.checks[0].body_json_assertions.find((assertion) => assertion.label === "checks array");
assert.equal(compactArrayAssertion.observed, undefined);
assert.equal(compactArrayAssertion.observed_type, "array");
assert.equal(compactArrayAssertion.observed_length, 1);
assert.deepEqual(compactArrayAssertion.observed_sample, [{ status: "passed" }]);
const compactObjectAssertion = httpStatusPreflight.checks[0].body_json_assertions.find((assertion) => assertion.label === "meta object");
assert.equal(compactObjectAssertion.observed, undefined);
assert.equal(compactObjectAssertion.observed_type, "object");
assert.equal(compactObjectAssertion.observed_key_count, 1);
assert.deepEqual(compactObjectAssertion.observed_sample, { job_id: "job_json_assertion" });
assert.deepEqual(httpStatusPreflight.checks[0].body_json_assertions_failed, []);
assert.match(httpStatusPreflight.summary, /failed 1 of 1/);

const httpStatusPreflightServer = createServer((request, response) => {
  if (request.method !== "GET" || request.url !== "/proof.json") {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
    return;
  }
  const body = JSON.stringify({ status: "passed", summary: "partial results available" });
  response.writeHead(200, { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) });
  response.end(body);
});
httpStatusPreflightServer.listen(0, "127.0.0.1");
await once(httpStatusPreflightServer, "listening");
try {
  const address = httpStatusPreflightServer.address();
  const preflightProfileFile = path.join(artifactAssertionDir, "profile-http-status-preflight.json");
  writeFileSync(preflightProfileFile, JSON.stringify({
    version: "riddle-proof.profile.v1",
    name: "http-status-preflight-cli",
    target: { url: `http://127.0.0.1:${address.port}/` },
    checks: [
      {
        type: "http_status",
        url: "/proof.json",
        expected_status: 200,
        allowed_content_types: ["application/json"],
        body_contains: ["passed", "partial results available"],
        body_not_contains: ["raw-secret"],
        body_json_assertions: [
          { path: "status", equals: "passed" },
          { path: "missing", exists: false },
        ],
      },
    ],
  }, null, 2));
  const preflightCli = await runCli([
    "profile-http-status-preflight",
    "--profile",
    preflightProfileFile,
    "--format",
    "summary",
  ]);
  assert.match(preflightCli.stdout, /http-status-preflight-cli http_status preflight passed 1 check/);
} finally {
  httpStatusPreflightServer.close();
  await once(httpStatusPreflightServer, "close");
}

const riddlePreviewDir = mkdtempSync(path.join(os.tmpdir(), "riddle-proof-client-preview-"));
writeFileSync(path.join(riddlePreviewDir, "index.html"), "<!doctype html><title>Riddle Preview</title>");
const riddleClientCalls = [];
const riddleClient = createRiddleApiClient({
  apiKey: "test-riddle-key",
  apiBaseUrl: "https://api.test",
  fetchImpl: async (url, init = {}) => {
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    riddleClientCalls.push({
      url: String(url),
      method: init.method || "GET",
      auth: init.headers?.Authorization || init.headers?.authorization || null,
      body,
    });
    if (String(url) === "https://api.test/v1/preview") {
      return new Response(JSON.stringify({
        id: "ps_test",
        upload_url: "https://upload.test/ps_test",
        expires_at: "2026-05-09T00:00:00.000Z",
      }), { status: 200 });
    }
    if (String(url) === "https://upload.test/ps_test") {
      return new Response("", { status: 200 });
    }
    if (String(url) === "https://api.test/v1/preview/ps_test/publish") {
      return new Response(JSON.stringify({
        id: "ps_test",
        preview_url: "https://preview.riddledc.com/s/ps_test/",
        file_count: 1,
        total_bytes: 52,
      }), { status: 200 });
    }
    if (String(url) === "https://api.test/v1/server-preview") {
      return new Response(JSON.stringify({
        job_id: "sp_test",
        upload_url: "https://upload.test/sp_test",
      }), { status: 200 });
    }
    if (String(url) === "https://upload.test/sp_test") {
      return new Response("", { status: 200 });
    }
    if (String(url) === "https://api.test/v1/server-preview/sp_test/start") {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (String(url) === "https://api.test/v1/server-preview/sp_test") {
      return new Response(JSON.stringify({
        job_id: "sp_test",
        status: "complete",
        script_error: null,
        outputs: [
          { name: "before.png", url: "https://cdn.test/before.png" },
          { name: "evidence.json", url: "https://cdn.test/evidence.json" },
        ],
      }), { status: 200 });
    }
    if (String(url) === "https://api.test/v1/run") {
      return new Response(JSON.stringify({ job_id: "job_test" }), { status: 200 });
    }
    if (String(url) === "https://api.test/v1/jobs/job_test") {
      return new Response(JSON.stringify({ id: "job_test", status: "completed" }), { status: 200 });
    }
    if (String(url) === "https://api.test/v1/jobs/job_test/artifacts") {
      return new Response(JSON.stringify({ artifacts: [{ name: "proof.json", url: "https://cdn.test/proof.json" }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "unexpected URL" }), { status: 404 });
  },
});
const deployedPreview = await riddleClient.deployStaticPreview(riddlePreviewDir, "unit-preview");
assert.equal(riddleClientCalls.find((call) => call.url === "https://api.test/v1/preview")?.body?.framework, "static");
assert.equal(deployedPreview.preview_url, "https://preview.riddledc.com/s/ps_test/");
assert.equal(deployedPreview.file_count, 1);
assert.equal(deployedPreview.framework, "static");
const deployedSpaPreview = await riddleClient.deployPreview(riddlePreviewDir, "unit-spa-preview", "spa");
const previewCreateCalls = riddleClientCalls.filter((call) => call.url === "https://api.test/v1/preview");
assert.equal(previewCreateCalls.at(-1)?.body?.framework, "spa");
assert.equal(deployedSpaPreview.framework, "spa");
const recoveredPreviewCalls = [];
const recoveredPreviewClient = createRiddleApiClient({
  apiKey: "test-riddle-key",
  apiBaseUrl: "https://api.recovered-preview.test",
  fetchImpl: async (url, init = {}) => {
    recoveredPreviewCalls.push({ url: String(url), method: init.method || "GET" });
    if (String(url) === "https://api.recovered-preview.test/v1/preview") {
      return new Response(JSON.stringify({
        id: "ps_recovered",
        upload_url: "https://upload.test/ps_recovered",
        expires_at: "2026-05-09T00:00:00.000Z",
      }), { status: 200 });
    }
    if (String(url) === "https://upload.test/ps_recovered") {
      return new Response("", { status: 200 });
    }
    if (String(url) === "https://api.recovered-preview.test/v1/preview/ps_recovered/publish") {
      return new Response(JSON.stringify({ message: "Service Unavailable" }), { status: 503 });
    }
    if (String(url) === "https://api.recovered-preview.test/v1/preview/ps_recovered") {
      return new Response(JSON.stringify({
        id: "ps_recovered",
        status: "ready",
        preview_url: "https://preview.riddledc.com/s/ps_recovered/",
        file_count: 3,
        total_bytes: 120,
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "unexpected URL" }), { status: 404 });
  },
});
const recoveredPreview = await recoveredPreviewClient.deployStaticPreview(riddlePreviewDir, "unit-recovered-preview");
assert.equal(recoveredPreview.preview_url, "https://preview.riddledc.com/s/ps_recovered/");
assert.equal(recoveredPreview.file_count, 3);
assert.equal(recoveredPreview.publish_recovered, true);
assert.match(recoveredPreview.publish_error, /HTTP 503/);
assert.deepEqual(
  recoveredPreviewCalls.map((call) => `${call.method} ${call.url}`),
  [
    "POST https://api.recovered-preview.test/v1/preview",
    "PUT https://upload.test/ps_recovered",
    "POST https://api.recovered-preview.test/v1/preview/ps_recovered/publish",
    "GET https://api.recovered-preview.test/v1/preview/ps_recovered",
  ],
);
assert.equal(typeof deployRiddlePreview, "function");
assert.equal(typeof deployRiddleStaticPreview, "function");
assert.deepEqual(parseRiddleViewport("390x844"), { width: 390, height: 844 });
const scriptRun = await riddleClient.runScript({
  url: deployedPreview.preview_url,
  script: "return { ok: true };",
  viewport: parseRiddleViewport("390x844"),
  timeoutSec: 30,
  strict: false,
});
assert.equal(scriptRun.job_id, "job_test");
const serverPreviewRun = await riddleClient.runServerPreview({
  directory: riddlePreviewDir,
  path: "/games/example",
  waitForSelector: "canvas",
  script: "return { ok: true };",
  viewport: parseRiddleViewport("390x844"),
  timeoutSec: 30,
  pollAttempts: 1,
});
assert.equal(serverPreviewRun.ok, true);
assert.equal(serverPreviewRun.job_id, "sp_test");
assert.equal(serverPreviewRun.script_error, null);
const polledJob = await riddleClient.pollJob("job_test");
assert.equal(polledJob.ok, true);
assert.equal(polledJob.terminal, true);
assert.equal(polledJob.artifacts.artifacts[0].name, "proof.json");
assert.equal(polledJob.poll.timed_out, false);

let delayedPollCount = 0;
const delayedProgress = [];
const delayedPollClient = createRiddleApiClient({
  apiKey: "test-riddle-key",
  apiBaseUrl: "https://api.poll.test",
  fetchImpl: async (url) => {
    if (String(url) === "https://api.poll.test/v1/jobs/job_delayed") {
      delayedPollCount += 1;
      return new Response(JSON.stringify({
        job_id: "job_delayed",
        status: "running",
        created_at: new Date(Date.now() - 45_000).toISOString(),
        submitted_at: null,
        completed_at: null,
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "unexpected URL" }), { status: 404 });
  },
});
const delayedPollResult = await delayedPollClient.pollJob("job_delayed", {
  wait: true,
  attempts: 2,
  intervalMs: 0,
  progressEveryMs: 0,
  onProgress: (snapshot) => delayedProgress.push(snapshot),
});
assert.equal(delayedPollResult.ok, false);
assert.equal(delayedPollResult.terminal, false);
assert.equal(delayedPollResult.poll.timed_out, true);
assert.equal(delayedPollResult.poll.running_without_submission, true);
assert.equal(delayedPollResult.poll.submitted_at, null);
assert(delayedPollResult.poll.queue_elapsed_ms >= 45_000);
assert(delayedPollResult.poll.pre_submission_elapsed_ms >= 0);
assert.match(delayedPollResult.poll.message, /not submitted/);
assert.equal(delayedPollCount, 2);
assert.equal(delayedProgress.length, 2);
assert.equal(delayedProgress[0].running_without_submission, true);

const originalDateNowForPreSubmit = Date.now;
let preSubmitPollCount = 0;
let preSubmitNowIndex = 0;
const preSubmitNowValues = [1_000_000, 1_001_000, 1_006_000];
Date.now = () => preSubmitNowValues[Math.min(preSubmitNowIndex++, preSubmitNowValues.length - 1)];
try {
  const preSubmitProgress = [];
  const preSubmitPollClient = createRiddleApiClient({
    apiKey: "test-riddle-key",
    apiBaseUrl: "https://api.pre-submit.test",
    fetchImpl: async (url) => {
      if (String(url) === "https://api.pre-submit.test/v1/jobs/job_pre_submit") {
        preSubmitPollCount += 1;
        if (preSubmitPollCount === 1) {
          return new Response(JSON.stringify({
            job_id: "job_pre_submit",
            status: "queued",
            created_at: null,
            submitted_at: null,
            completed_at: null,
          }), { status: 200 });
        }
        return new Response(JSON.stringify({
          job_id: "job_pre_submit",
          status: "completed",
          created_at: "2026-05-19T16:20:11.000Z",
          submitted_at: "2026-05-19T16:20:18.000Z",
          completed_at: "2026-05-19T16:20:18.000Z",
        }), { status: 200 });
      }
      if (String(url) === "https://api.pre-submit.test/v1/jobs/job_pre_submit/artifacts") {
        return new Response(JSON.stringify({ artifacts: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "unexpected URL" }), { status: 404 });
    },
  });
  const preSubmitPollResult = await preSubmitPollClient.pollJob("job_pre_submit", {
    wait: true,
    attempts: 2,
    intervalMs: 0,
    progressEveryMs: 0,
    onProgress: (snapshot) => preSubmitProgress.push(snapshot),
  });
  assert.equal(preSubmitPollResult.ok, true);
  assert.equal(preSubmitPollResult.poll.queue_elapsed_ms, 7_000);
  assert.equal(preSubmitPollResult.poll.elapsed_ms, 6_000);
  assert.equal(preSubmitPollResult.poll.pre_submission_elapsed_ms, 1_000);
  assert.equal(preSubmitProgress[0].running_without_submission, true);
  assert.equal(preSubmitProgress[0].pre_submission_elapsed_ms, 1_000);
  assert.equal(preSubmitProgress[1].pre_submission_elapsed_ms, 1_000);
} finally {
  Date.now = originalDateNowForPreSubmit;
}

const originalDateNowForUnsubmittedTimeout = Date.now;
let unsubmittedTimeoutPollCount = 0;
let unsubmittedTimeoutNowIndex = 0;
const unsubmittedTimeoutNowValues = [2_000_000, 2_002_500];
Date.now = () => unsubmittedTimeoutNowValues[Math.min(unsubmittedTimeoutNowIndex++, unsubmittedTimeoutNowValues.length - 1)];
try {
  const unsubmittedTimeoutClient = createRiddleApiClient({
    apiKey: "test-riddle-key",
    apiBaseUrl: "https://api.unsubmitted-timeout.test",
    fetchImpl: async (url) => {
      if (String(url) === "https://api.unsubmitted-timeout.test/v1/jobs/job_unsubmitted_timeout") {
        unsubmittedTimeoutPollCount += 1;
        return new Response(JSON.stringify({
          job_id: "job_unsubmitted_timeout",
          status: "queued",
          created_at: null,
          submitted_at: null,
          completed_at: null,
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "unexpected URL" }), { status: 404 });
    },
  });
  const unsubmittedTimeoutResult = await unsubmittedTimeoutClient.pollJob("job_unsubmitted_timeout", {
    wait: true,
    attempts: 5,
    intervalMs: 0,
    unsubmittedTimeoutMs: 1000,
  });
  assert.equal(unsubmittedTimeoutResult.ok, false);
  assert.equal(unsubmittedTimeoutResult.terminal, false);
  assert.equal(unsubmittedTimeoutResult.poll.timed_out, true);
  assert.equal(unsubmittedTimeoutResult.poll.unsubmitted_timeout, true);
  assert.equal(unsubmittedTimeoutResult.poll.unsubmitted_timeout_ms, 1000);
  assert.equal(unsubmittedTimeoutResult.poll.attempt, 1);
  assert.equal(unsubmittedTimeoutPollCount, 1);
} finally {
  Date.now = originalDateNowForUnsubmittedTimeout;
}

let recoveredPollCount = 0;
const recoveredPollClient = createRiddleApiClient({
  apiKey: "test-riddle-key",
  apiBaseUrl: "https://api.recovered.test",
  fetchImpl: async (url) => {
    if (String(url) === "https://api.recovered.test/v1/jobs/job_recovered") {
      recoveredPollCount += 1;
      if (recoveredPollCount === 1) {
        return new Response(JSON.stringify({
          job_id: "job_recovered",
          status: "running",
          created_at: "2026-05-13T15:40:00.000Z",
          submitted_at: null,
          completed_at: null,
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        job_id: "job_recovered",
        status: "completed",
        created_at: "2026-05-13T15:40:00.000Z",
        submitted_at: "2026-05-13T15:43:00.000Z",
        completed_at: "2026-05-13T15:43:30.000Z",
      }), { status: 200 });
    }
    if (String(url) === "https://api.recovered.test/v1/jobs/job_recovered/artifacts") {
      return new Response(JSON.stringify({ artifacts: [{ name: "proof.json", url: "https://cdn.test/proof.json" }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "unexpected URL" }), { status: 404 });
  },
});
const recoveredPollResult = await recoveredPollClient.pollJob("job_recovered", {
  wait: true,
  attempts: 3,
  intervalMs: 0,
});
assert.equal(recoveredPollResult.ok, true);
assert.equal(recoveredPollResult.terminal, true);
assert.equal(recoveredPollResult.poll.timed_out, false);
assert.equal(recoveredPollResult.poll.attempt, 2);
assert.equal(recoveredPollResult.poll.queue_elapsed_ms, 180_000);
assert(
  riddleClientCalls.some((call) => call.auth === "Bearer test-riddle-key"),
  "Riddle client should send bearer auth to API calls",
);
assert(
  riddleClientCalls.some((call) => call.url === "https://api.test/v1/run" && call.body?.strict === false),
  "Riddle client should send top-level strict=false when requested",
);
assert(
  riddleClientCalls.some((call) => call.url === "https://upload.test/ps_test" && call.auth === null),
  "Riddle preview upload should not send API bearer auth to the signed upload URL",
);
assert(
  riddleClientCalls.some((call) => call.url === "https://upload.test/sp_test" && call.auth === null),
  "Riddle server-preview upload should not send API bearer auth to the signed upload URL",
);

const cliRunScriptRequests = [];
const cliRunScriptServer = createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/v1/run") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "unexpected request" }));
    return;
  }

  let rawBody = "";
  request.on("data", (chunk) => {
    rawBody += chunk;
  });
  request.on("end", () => {
    cliRunScriptRequests.push({
      url: request.url,
      method: request.method,
      auth: request.headers.authorization || null,
      body: JSON.parse(rawBody),
    });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ job_id: "job_cli_strict" }));
  });
});
cliRunScriptServer.listen(0, "127.0.0.1");
await once(cliRunScriptServer, "listening");
try {
  const cliScriptFile = path.join(riddlePreviewDir, "cli-strict-script.js");
  writeFileSync(cliScriptFile, "return { ok: true };\n");
  const address = cliRunScriptServer.address();
  const cliRunScriptResult = await runCli([
    "riddle-run-script",
    "--api-base-url",
    `http://127.0.0.1:${address.port}`,
    "--api-key",
    "cli-riddle-key",
    "--url",
    "https://example.test/",
    "--script-file",
    cliScriptFile,
    "--viewport=390x844",
    "--timeout",
    "12",
    "--strict=false",
  ]);
  assert.equal(JSON.parse(cliRunScriptResult.stdout).job_id, "job_cli_strict");
  assert.equal(cliRunScriptRequests.length, 1);
  assert.equal(cliRunScriptRequests[0].auth, "Bearer cli-riddle-key");
  assert.equal(cliRunScriptRequests[0].body.strict, false);
  assert.equal(cliRunScriptRequests[0].body.timeout_sec, 12);
  assert.deepEqual(cliRunScriptRequests[0].body.viewport, { width: 390, height: 844 });
} finally {
  cliRunScriptServer.close();
  await once(cliRunScriptServer, "close");
}

const cliRunProfileRequests = [];
let cliRunProfilePollCount = 0;
let cliRunProfileArtifactRecoveryPollCount = 0;
let cliRunProfileUnsubmittedRunCount = 0;
let cliRunProfileUnsubmittedPollCount = 0;
let cliRunProfilePort = 0;
function cliRunProfileSplitResult(viewportName, width, height) {
  return {
    version: "riddle-proof.profile-result.v1",
    profile_name: `cli-profile-split-${viewportName}`,
    runner: "riddle",
    status: "passed",
    baseline_policy: "invariant_only",
    route: {
      requested: "https://example.com/split-profile",
      observed: "/split-profile",
      expected_path: "/split-profile",
      matched: true,
      http_status: 200,
    },
    artifacts: { screenshots: [`cli-profile-split-${viewportName}`], proof_json: "proof.json" },
    checks: [
      {
        type: "route_loaded",
        status: "passed",
        evidence: { expected_path: "/split-profile", observed_paths: ["/split-profile"], http_statuses: [200] },
      },
      {
        type: "no_horizontal_overflow",
        status: "passed",
        evidence: { max_overflow_px: 0, overflow_px: [0], bounds_overflow_px: [0] },
      },
    ],
    summary: `cli-profile-split-${viewportName} passed.`,
    captured_at: "2026-05-19T14:40:00.000Z",
    evidence: {
      version: "riddle-proof.profile-evidence.v1",
      profile_name: `cli-profile-split-${viewportName}`,
      target_url: "https://example.com/split-profile",
      baseline_policy: "invariant_only",
      captured_at: "2026-05-19T14:40:00.000Z",
      viewports: [
        {
          name: viewportName,
          width,
          height,
          url: "https://example.com/split-profile",
          route: {
            requested: "https://example.com/split-profile",
            observed: "/split-profile",
            expected_path: "/split-profile",
            matched: true,
            http_status: 200,
          },
          title: `Split ${viewportName}`,
          scroll_width: width,
          client_width: width,
          overflow_px: 0,
          bounds_overflow_px: 0,
          overflow_offenders: [],
          screenshot_label: `cli-profile-split-${viewportName}`,
          screenshot_full_page: false,
        },
      ],
      console: { events: [], fatal_count: 0 },
      page_errors: [],
      dom_summary: { viewport_count: 1, split_fixture: viewportName },
    },
  };
}
const cliRunProfileServer = createServer((request, response) => {
  const sendJson = (payload, status = 200) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(payload));
  };

  if (request.method === "POST" && request.url === "/v1/run") {
    let rawBody = "";
    request.on("data", (chunk) => {
      rawBody += chunk;
    });
    request.on("end", () => {
      const body = JSON.parse(rawBody);
      cliRunProfileRequests.push({
        url: request.url,
        method: request.method,
        auth: request.headers.authorization || null,
        body,
      });
      if (String(body.url || "").includes("/split-profile")) {
        const viewportName = body.viewport?.width === 390 ? "phone" : "desktop";
        sendJson({ job_id: `job_cli_profile_split_${viewportName}` });
        return;
      }
      if (String(body.url || "").includes("/blocked-profile")) {
        sendJson({
          error: "Insufficient available balance",
          required_seconds: 90,
          available_seconds: 47,
          deficit_seconds: 43,
          minimum_purchase_dollars: 10,
        }, 402);
        return;
      }
      if (String(body.url || "").includes("/strict-safety-blocked")) {
        sendJson({
          error: "Script contains potentially unsafe operations",
          warnings: ["Direct network operations detected", "Script unusually large (potential code injection)"],
          hint: "Set strict: false to bypass this check (use with caution)",
        }, 400);
        return;
      }
      if (String(body.url || "").includes("/timeout-artifacts-profile")) {
        sendJson({ job_id: "job_cli_profile_timeout_artifacts" });
        return;
      }
      if (String(body.url || "").includes("/unsubmitted-retry-profile")) {
        cliRunProfileUnsubmittedRunCount += 1;
        sendJson({
          job_id: cliRunProfileUnsubmittedRunCount === 1
            ? "job_cli_profile_unsubmitted_stale"
            : "job_cli_profile_unsubmitted_retry",
        });
        return;
      }
      if (String(body.url || "").includes("/fatal-console-summary")) {
        sendJson({
          version: "riddle-proof.profile-result.v1",
          profile_name: "cli-fatal-console-summary",
          runner: "riddle",
          status: "product_regression",
          baseline_policy: "invariant_only",
          route: {
            requested: "https://example.com/fatal-console-summary",
            observed: "/fatal-console-summary",
            expected_path: "/fatal-console-summary",
            matched: true,
            http_status: 200,
          },
          artifacts: { screenshots: ["cli-fatal-console-summary-desktop"], proof_json: "proof.json" },
          checks: [
            {
              type: "no_fatal_console_errors",
              status: "failed",
              evidence: {
                console_fatal_count: 4,
                page_error_count: 0,
                total_console_fatal_count: 8,
                total_page_error_count: 0,
                allowed_console_fatal_count: 4,
                allowed_page_error_count: 0,
              },
            },
          ],
          summary: "cli-fatal-console-summary failed.",
          captured_at: "2026-05-17T04:10:00.000Z",
        });
        return;
      }
      sendJson({ job_id: "job_cli_profile_progress" });
    });
    return;
  }

  if (request.method === "GET" && request.url === "/v1/jobs/job_cli_profile_timeout_artifacts") {
    cliRunProfileArtifactRecoveryPollCount += 1;
    sendJson({
      job_id: "job_cli_profile_timeout_artifacts",
      status: "queued",
      created_at: null,
      submitted_at: null,
      completed_at: null,
    });
    return;
  }

  if (request.method === "GET" && request.url === "/v1/jobs/job_cli_profile_timeout_artifacts/artifacts") {
    sendJson({
      status: "completed",
      artifacts: [
        {
          name: "proof.json",
          url: `http://127.0.0.1:${cliRunProfilePort}/timeout-artifacts-proof.json`,
        },
      ],
    });
    return;
  }

  if (request.method === "GET" && request.url === "/v1/jobs/job_cli_profile_unsubmitted_stale") {
    cliRunProfileUnsubmittedPollCount += 1;
    setTimeout(() => {
      sendJson({
        job_id: "job_cli_profile_unsubmitted_stale",
        status: "queued",
        created_at: null,
        submitted_at: null,
        completed_at: null,
      });
    }, 5);
    return;
  }

  if (request.method === "GET" && request.url === "/v1/jobs/job_cli_profile_unsubmitted_retry") {
    sendJson({
      job_id: "job_cli_profile_unsubmitted_retry",
      status: "completed",
      created_at: "2026-05-19T18:20:00.000Z",
      submitted_at: "2026-05-19T18:20:02.000Z",
      completed_at: "2026-05-19T18:20:10.000Z",
    });
    return;
  }

  if (request.method === "GET" && request.url === "/v1/jobs/job_cli_profile_unsubmitted_retry/artifacts") {
    sendJson({
      artifacts: [
        {
          name: "proof.json",
          url: `http://127.0.0.1:${cliRunProfilePort}/unsubmitted-retry-proof.json`,
        },
      ],
    });
    return;
  }

  if (request.method === "GET" && request.url === "/unsubmitted-retry-proof.json") {
    sendJson({
      version: "riddle-proof.profile-result.v1",
      profile_name: "cli-profile-unsubmitted-retry",
      runner: "riddle",
      status: "passed",
      baseline_policy: "invariant_only",
      route: {
        requested: "https://example.com/unsubmitted-retry-profile",
        observed: "/unsubmitted-retry-profile",
        expected_path: "/unsubmitted-retry-profile",
        matched: true,
        http_status: 200,
      },
      artifacts: { screenshots: ["unsubmitted-retry-profile"], proof_json: "proof.json" },
      checks: [
        {
          type: "route_loaded",
          label: "route_loaded",
          status: "passed",
          evidence: { expected_path: "/unsubmitted-retry-profile", observed_paths: ["/unsubmitted-retry-profile"], http_statuses: [200] },
        },
      ],
      summary: "cli-profile-unsubmitted-retry passed.",
      captured_at: "2026-05-19T18:20:10.000Z",
    });
    return;
  }

  if (request.method === "GET" && request.url === "/timeout-artifacts-proof.json") {
    sendJson({
      version: "riddle-proof.profile-result.v1",
      profile_name: "cli-profile-timeout-artifacts",
      runner: "riddle",
      status: "passed",
      baseline_policy: "invariant_only",
      route: {
        requested: "https://example.com/timeout-artifacts-profile",
        observed: "/timeout-artifacts-profile",
        expected_path: "/timeout-artifacts-profile",
        matched: true,
        http_status: 200,
      },
      artifacts: { screenshots: ["timeout-artifacts-profile"], proof_json: "proof.json" },
      checks: [
        {
          type: "route_loaded",
          label: "route_loaded",
          status: "passed",
          evidence: { expected_path: "/timeout-artifacts-profile", observed_paths: ["/timeout-artifacts-profile"], http_statuses: [200] },
        },
      ],
      summary: "cli-profile-timeout-artifacts passed.",
      captured_at: "2026-05-19T18:02:00.000Z",
    });
    return;
  }

  if (request.method === "GET" && request.url === "/v1/jobs/job_cli_profile_progress") {
    cliRunProfilePollCount += 1;
    if (cliRunProfilePollCount === 1) {
      sendJson({
        job_id: "job_cli_profile_progress",
        status: "running",
        created_at: "2026-05-13T23:20:00.000Z",
        submitted_at: null,
        completed_at: null,
      });
      return;
    }
    sendJson({
      job_id: "job_cli_profile_progress",
      status: "completed",
      created_at: "2026-05-13T23:20:00.000Z",
      submitted_at: "2026-05-13T23:21:00.000Z",
      completed_at: "2026-05-13T23:21:20.000Z",
    });
    return;
  }

  const splitJobMatch = request.url.match(/^\/v1\/jobs\/job_cli_profile_split_(desktop|phone)$/);
  if (request.method === "GET" && splitJobMatch) {
    const viewportName = splitJobMatch[1];
    sendJson({
      job_id: `job_cli_profile_split_${viewportName}`,
      status: "completed",
      created_at: "2026-05-19T14:38:00.000Z",
      submitted_at: "2026-05-19T14:38:10.000Z",
      completed_at: "2026-05-19T14:39:00.000Z",
    });
    return;
  }

  const splitArtifactMatch = request.url.match(/^\/v1\/jobs\/job_cli_profile_split_(desktop|phone)\/artifacts$/);
  if (request.method === "GET" && splitArtifactMatch) {
    const viewportName = splitArtifactMatch[1];
    sendJson({
      artifacts: [
        {
          name: "proof.json",
          url: `http://127.0.0.1:${cliRunProfilePort}/split-proof-${viewportName}.json`,
        },
      ],
    });
    return;
  }

  const splitProofMatch = request.url.match(/^\/split-proof-(desktop|phone)\.json$/);
  if (request.method === "GET" && splitProofMatch) {
    const viewportName = splitProofMatch[1];
    sendJson(viewportName === "phone"
      ? cliRunProfileSplitResult("phone", 390, 844)
      : cliRunProfileSplitResult("desktop", 1280, 900));
    return;
  }

  if (request.method === "GET" && request.url === "/v1/jobs/job_cli_profile_progress/artifacts") {
    sendJson({
      artifacts: [
        {
          name: "proof.json",
          url: `http://127.0.0.1:${cliRunProfilePort}/proof.json`,
        },
      ],
    });
    return;
  }

  if (request.method === "GET" && request.url === "/proof.json") {
    sendJson({
      version: "riddle-proof.profile-result.v1",
      profile_name: "cli-profile-progress",
      runner: "riddle",
      status: "passed",
      baseline_policy: "invariant_only",
      route: {
        requested: "https://example.com/profile",
        observed: "/profile",
        expected_path: "/profile",
        matched: true,
        http_status: 200,
      },
      artifacts: { screenshots: ["cli-profile-progress-desktop-ready"], proof_json: "proof.json" },
      checks: [
        {
          type: "network_mocks_succeeded",
          status: "passed",
          evidence: {
            mock_count: 2,
            required_count: 2,
            hit_count: 5,
            hits_by_label: {
              "api-fail-then-success": 3,
              "save-current-build": 2,
            },
            required_hits_by_label: {
              "api-fail-then-success": 3,
              "save-current-build": 2,
            },
            max_hits_by_label: {
              "save-current-build": 2,
            },
            response_hits_by_label: {
              "api-fail-then-success": {
                "first-api-fails": 1,
                "second-api-succeeds": 2,
              },
            },
            failed: [],
          },
        },
        {
          type: "setup_actions_succeeded",
          status: "passed",
          evidence: {
            action_count: 3,
            viewports: [{ name: "desktop", ok: true, result_count: 5 }],
            setup_summary: {
              viewport_count: 1,
              action_count: 3,
              final_screenshot_count: 1,
              final_screenshot_full_page: false,
              final_screenshot_mode: "viewport",
              viewports: [{
                name: "desktop",
                ok: true,
                result_count: 5,
                observed_path: "/profile",
                final_screenshot: "cli-profile-progress-desktop",
                final_screenshot_full_page: false,
                setup_screenshots: ["cli-profile-progress-desktop-ready"],
                clicked_total: 1,
                clicked_truncated: false,
                click_count_action_total: 1,
                click_count_value_total: 2,
                set_range_value_total: 1,
                set_range_value_truncated: false,
                set_range_value: [{
                  ordinal: 4,
                  ok: true,
                  selector: "input[type='range']",
                  requested_value: "0.500",
                  actual_value: "0.5",
                  before_value: "0.129",
                  value_as_number: 0.5,
                  min: "0.01",
                  max: "0.5",
                  step: "0.001",
                  reason: null,
                }],
                window_call_total: 1,
                window_call_stored_total: 1,
                window_call_captured_total: 0,
                window_call_truncated: false,
                window_call: [{
                  ordinal: 1,
                  ok: true,
                  path: "__proof.capture",
                  return_captured: false,
                  return_stored_to: "__proof.lastCapture",
                  reason: null,
                }],
                window_eval_total: 1,
                window_eval_stored_total: 1,
                window_eval_captured_total: 1,
                window_eval_truncated: false,
                window_eval: [{
                  ordinal: 3,
                  ok: true,
                  script_length: 52,
                  return_captured: true,
                  return_stored_to: "__proof.lastEval",
                  returned: { ok: true },
                  reason: null,
                }],
                window_call_until_total: 1,
                window_call_until_call_total: 3,
                window_call_until_truncated: false,
                window_call_until: [{
                  ordinal: 2,
                  ok: true,
                  path: "__proof.step",
                  until_path: "__proof.done",
                  until_value: true,
                  until_expected_value: true,
                  call_count: 3,
                  max_calls: 5,
                  reason: null,
                }],
                clicked: [{ selector: "[data-testid='open-profile']", click_count: 2 }],
                failed: [],
              }],
            },
          },
        },
        {
          type: "route_loaded",
          status: "passed",
          evidence: { expected_path: "/profile", observed_paths: ["/profile"], http_statuses: [200] },
        },
        {
          type: "selector_visible",
          status: "passed",
          evidence: { selector: ".dashboard-content", visible_counts: [1] },
        },
        {
          type: "selector_text_visible",
          status: "passed",
          evidence: {
            selector: ".dashboard-content",
            text: "Start building",
            pattern: null,
            viewports: [{ viewport: "desktop", matched: true, matched_count: 1 }],
          },
        },
        {
          type: "selector_text_absent",
          status: "passed",
          evidence: {
            selector: ".dashboard-content",
            text: null,
            pattern: "NaN|undefined",
            viewports: [{ viewport: "desktop", matched: false, matched_count: 0 }],
          },
        },
        {
          type: "observe_within",
          status: "passed",
          evidence: {
            selector: ".dashboard-content",
            text: "Started",
            pattern: null,
            timeout_ms: 1500,
            viewports: [{ viewport: "desktop", matched: true, elapsed_ms: 120, attempts: 3, selector_count: 1, visible_count: 1, matched_count: 1, sample: "Started" }],
          },
        },
        {
          type: "selector_count_equals",
          status: "passed",
          evidence: { selector: ".jobs-list tbody tr", expected_count: 3, counts: [3] },
        },
        {
          type: "text_visible",
          status: "passed",
          evidence: { text: "Failed", pattern: null, matches: [true] },
        },
        {
          type: "text_absent",
          status: "passed",
          evidence: { text: "NaN", pattern: null, matches: [false] },
        },
        {
          type: "no_horizontal_overflow",
          status: "passed",
          evidence: { max_overflow_px: 1, overflow_px: [0], bounds_overflow_px: [0] },
        },
        {
          type: "no_fatal_console_errors",
          status: "passed",
          evidence: { fatal_error_count: 0 },
        },
        {
          type: "no_console_warnings",
          status: "passed",
          evidence: { console_warning_count: 0 },
        },
        {
          type: "route_inventory",
          label: "pricing funnel route inventory",
          status: "passed",
          evidence: {
            expected_count: 5,
            expected_routes: [
              { name: "Pricing", path: "/pricing" },
              { name: "Billing", path: "/billing" },
              { name: "Register", path: "/register" },
              { name: "Docs", path: "/docs" },
              { name: "Dashboard", path: "/dashboard" },
            ],
            source_link_scope: "expected_routes",
            source_candidate_count: 12,
            source_candidate_unique_link_count: 9,
            source_link_count: 8,
            source_unique_link_count: 5,
            duplicate_source_link_count: 3,
            duplicate_source_links: ["/billing", "/register"],
            duplicates_allowed: true,
            direct_route_count: 5,
            clickthrough_count: 5,
            viewport_count: 2,
            viewports: [
              {
                viewport: "desktop",
                source_link_count: 8,
                source_unique_link_count: 5,
                source_candidate_count: 12,
                source_candidate_unique_link_count: 9,
                direct_route_count: 5,
                clickthrough_count: 5,
                failure_count: 0,
              },
              {
                viewport: "phone",
                source_link_count: 8,
                source_unique_link_count: 5,
                source_candidate_count: 12,
                source_candidate_unique_link_count: 9,
                direct_route_count: 5,
                clickthrough_count: 5,
                failure_count: 0,
              },
            ],
            failures: [],
          },
        },
        {
          type: "link_status",
          label: "public artifacts",
          status: "passed",
          evidence: {
            selector: "a[href*='/artifacts/'], img[src*='/artifacts/']",
            expected_count: 9,
            min_bytes: 32,
            allowed_content_types: ["image/*", "application/json"],
            viewports: [
              {
                viewport: "desktop",
                total_count: 9,
                discovered_count: 10,
                ok_count: 9,
                failed_count: 0,
                truncated: false,
                omitted_result_count: 0,
              },
            ],
            failures: [],
          },
        },
        {
          type: "http_status",
          label: "public proof artifact",
          status: "passed",
          evidence: {
            url: "https://example.com/proof.json",
            method: "GET",
            allowed_statuses: [200],
            viewports: [
              {
                viewport: "desktop",
                url: "https://example.com/proof.json",
                method: "GET",
                status: 200,
                ok: true,
                body_contains: { passed: true, "partial results available": true },
                body_contains_missing: [],
                body_not_contains: { "raw-secret": false },
                body_not_contains_found: [],
                body_not_patterns: { Traceback: false },
                body_not_patterns_found: [],
              },
            ],
            failures: [],
          },
        },
      ],
      summary: "cli-profile-progress passed.",
      captured_at: "2026-05-13T23:21:20.000Z",
    });
    return;
  }

  sendJson({ error: "unexpected request", method: request.method, url: request.url }, 404);
});
cliRunProfileServer.listen(0, "127.0.0.1");
await once(cliRunProfileServer, "listening");
try {
  const address = cliRunProfileServer.address();
  cliRunProfilePort = address.port;
  const profileFile = path.join(riddlePreviewDir, "cli-profile-progress.json");
  const profileOutputDir = path.join(riddlePreviewDir, "cli-profile-progress-output");
  writeFileSync(profileFile, JSON.stringify({
    version: "riddle-proof.profile.v1",
    name: "cli-profile-progress",
    target: {
      route: "/profile",
      viewports: [{ name: "desktop", width: 1280, height: 900 }],
    },
    checks: [{ type: "route_loaded", expected_path: "/profile" }],
  }));
  const cliProfileResult = await runCli([
    "run-profile",
    "--api-base-url",
    `http://127.0.0.1:${address.port}`,
    "--api-key",
    "cli-riddle-key",
    "--profile",
    profileFile,
    "--url",
    "https://example.com",
    "--runner",
    "riddle",
    "--output",
    profileOutputDir,
    "--pollAttempts",
    "4",
    "--interval-ms",
    "0",
    "--progress-every-ms",
    "0",
  ]);
  const parsedProfileResult = JSON.parse(cliProfileResult.stdout);
  assert.equal(parsedProfileResult.status, "passed");
  assert.equal(parsedProfileResult.riddle.job_id, "job_cli_profile_progress");
  assert.equal(parsedProfileResult.riddle.status, "completed");
  assert.equal(parsedProfileResult.riddle.terminal, true);
  assert.equal(parsedProfileResult.riddle.submitted_at, "2026-05-13T23:21:00.000Z");
  assert.equal(parsedProfileResult.riddle.completed_at, "2026-05-13T23:21:20.000Z");
  assert.equal(parsedProfileResult.riddle.queue_elapsed_ms, 60_000);
  assert.equal(typeof parsedProfileResult.riddle.pre_submission_elapsed_ms, "number");
  assert.equal(parsedProfileResult.riddle.attempt, 2);
  assert.equal(parsedProfileResult.riddle.attempts, 4);
  assert.equal(cliRunProfileRequests.length, 1);
  assert.equal(cliRunProfileRequests[0].auth, "Bearer cli-riddle-key");
  assert.equal(cliRunProfileRequests[0].body.url, "https://example.com/profile");
  assert.equal(cliRunProfileRequests[0].body.strict, false);
  assert.match(cliProfileResult.stderr, /\[riddle-poll\] job_cli_profile_progress status=running attempt=1\/4/);
  assert.match(cliProfileResult.stderr, /\[riddle-poll\] job_cli_profile_progress status=completed attempt=2\/4/);
  assert.equal(JSON.parse(readFileSync(path.join(profileOutputDir, "profile-result.json"), "utf8")).status, "passed");
  const profileSummaryMarkdown = readFileSync(path.join(profileOutputDir, "summary.md"), "utf8");
  assert.match(profileSummaryMarkdown, /passed: route_loaded \(`\/profile`\)/);
  assert.match(profileSummaryMarkdown, /passed: selector_visible \(`\.dashboard-content`\)/);
  assert.match(profileSummaryMarkdown, /passed: selector_text_visible \(`\.dashboard-content` contains `Start building`\)/);
  assert.match(profileSummaryMarkdown, /passed: selector_text_absent \(`\.dashboard-content` does not contain pattern `NaN\|undefined`\)/);
  assert.match(profileSummaryMarkdown, /passed: observe_within \(`\.dashboard-content` observes `Started` within 1500ms; desktop matched in 120ms, 3 attempts, sample `Started`\)/);
  assert.match(profileSummaryMarkdown, /passed: selector_count_equals \(`\.jobs-list tbody tr` = 3\)/);
  assert.match(profileSummaryMarkdown, /passed: text_visible \(`Failed`\)/);
  assert.match(profileSummaryMarkdown, /passed: text_absent \(`NaN`\)/);
  assert.match(profileSummaryMarkdown, /passed: no_horizontal_overflow \(<= 1px\)/);
  assert.match(profileSummaryMarkdown, /passed: no_fatal_console_errors \(0 unallowed fatal errors\)/);
  assert.match(profileSummaryMarkdown, /passed: no_console_warnings \(0 unallowed warnings\)/);
  assert.match(profileSummaryMarkdown, /## Setup Summary/);
  assert.match(profileSummaryMarkdown, /setup actions: 3 declared, 5 recorded result\(s\) across 1 viewport\(s\)/);
  assert.match(profileSummaryMarkdown, /final screenshots: 1, mode viewport/);
  assert.match(profileSummaryMarkdown, /setup screenshots: 1/);
  assert.match(profileSummaryMarkdown, /click counts: 1 action\(s\), click_count total 2/);
  assert.match(profileSummaryMarkdown, /set_range_value: 1 action\(s\)/);
  assert.match(profileSummaryMarkdown, /window_call: 1 action\(s\), stored returns 1, captured returns 0/);
  assert.match(profileSummaryMarkdown, /window_eval: 1 action\(s\), stored returns 1, captured returns 1/);
  assert.match(profileSummaryMarkdown, /window_call_until: 1 action\(s\), call_count total 3/);
  assert.match(profileSummaryMarkdown, /desktop: ok, 5 result\(s\), 1 setup screenshot\(s\), 1 click\(s\), 1 click_count action\(s\), 1 set_range_value action\(s\), 1 window_call action\(s\), 1 stored return\(s\), 0 captured return\(s\), 1 window_eval action\(s\), 1 stored return\(s\), 1 captured return\(s\), 1 window_call_until action\(s\), 3 call\(s\), path \/profile/);
  assert.match(profileSummaryMarkdown, /desktop set_range_value: ok, `input\[type='range'\]` requested `0\.500` -> `0\.5`, before `0\.129`, number 0\.5, range `0\.01`\.\.`0\.5` step `0\.001`/);
  assert.match(profileSummaryMarkdown, /desktop window_call: ok, `__proof\.capture`, stored `__proof\.lastCapture`, return not captured/);
  assert.match(profileSummaryMarkdown, /desktop window_eval: ok, script 52 chars, stored `__proof\.lastEval`, return captured, returned `\{"ok":true\}`/);
  assert.match(profileSummaryMarkdown, /desktop window_call_until: ok, `__proof\.step` until `__proof\.done` == `true` in 3\/5 call\(s\), observed `true`/);
  assert.match(profileSummaryMarkdown, /## Network Mocks/);
  assert.match(profileSummaryMarkdown, /mocks: 2; total hits: 5; required mocks: 2/);
  assert.match(profileSummaryMarkdown, /failed mocks: 0/);
  assert.match(profileSummaryMarkdown, /api-fail-then-success: hits 3, required 3/);
  assert.match(profileSummaryMarkdown, /api-fail-then-success responses: first-api-fails 1; second-api-succeeds 2/);
  assert.match(profileSummaryMarkdown, /save-current-build: hits 2, required 2, max 2/);
  assert.match(profileSummaryMarkdown, /## Route Inventory/);
  assert.match(profileSummaryMarkdown, /pricing funnel route inventory: expected 5, source links 8 \(5 unique\), direct 5, clickthrough 5, failures 0/);
  assert.match(profileSummaryMarkdown, /pricing funnel route inventory duplicate source links: 3 allowed: \/billing, \/register/);
  assert.match(profileSummaryMarkdown, /pricing funnel route inventory expected routes: Pricing \(\/pricing\); Billing \(\/billing\); Register \(\/register\); Docs \(\/docs\); Dashboard \(\/dashboard\)/);
  assert.match(profileSummaryMarkdown, /pricing funnel route inventory source scope: expected routes; selector candidates 12 \(9 unique\)/);
  assert.match(profileSummaryMarkdown, /pricing funnel route inventory desktop: source 8 \(5 unique\), selector candidates 12 \(9 unique\), direct 5, clickthrough 5, failures 0/);
  assert.match(profileSummaryMarkdown, /## Riddle Job/);
  assert.match(profileSummaryMarkdown, /job `job_cli_profile_progress`, status `completed`, terminal true/);
  assert.match(profileSummaryMarkdown, /poll: queue 1m00s, elapsed \d+s, attempt 2\/4/);
  assert.match(profileSummaryMarkdown, /timing: submitted `2026-05-13T23:21:00\.000Z` completed `2026-05-13T23:21:20\.000Z`/);
  assert.match(profileSummaryMarkdown, /passed: public artifacts \(`a\[href\*='\/artifacts\/'\], img\[src\*='\/artifacts\/'\]` probed links = 9, bytes >= 32\)/);
  assert.match(profileSummaryMarkdown, /## Link Status/);
  assert.match(profileSummaryMarkdown, /public artifacts `a\[href\*='\/artifacts\/'\], img\[src\*='\/artifacts\/'\]`: probed links 9, discovered 10, ok 9, failures 0, min bytes 32, content types `image\/\*`, `application\/json`/);
  assert.match(profileSummaryMarkdown, /## HTTP Status/);
  assert.match(profileSummaryMarkdown, /public proof artifact: GET `https:\/\/example\.com\/proof\.json`, statuses 200, body_contains 2\/2, body_not_contains clean 1\/1, body_not_patterns clean 1\/1, failures 0/);

  const artifactRecoveryProfileFile = path.join(riddlePreviewDir, "cli-profile-timeout-artifacts.json");
  const artifactRecoveryOutputDir = path.join(riddlePreviewDir, "cli-profile-timeout-artifacts-output");
  writeFileSync(artifactRecoveryProfileFile, JSON.stringify({
    version: "riddle-proof.profile.v1",
    name: "cli-profile-timeout-artifacts",
    target: {
      route: "/timeout-artifacts-profile",
      viewports: [{ name: "desktop", width: 1280, height: 900 }],
    },
    checks: [{ type: "route_loaded", expected_path: "/timeout-artifacts-profile" }],
  }));
  const artifactRecoveryResult = await runCli([
    "run-profile",
    "--api-base-url",
    `http://127.0.0.1:${address.port}`,
    "--api-key",
    "cli-riddle-key",
    "--profile",
    artifactRecoveryProfileFile,
    "--url",
    "https://example.com",
    "--runner",
    "riddle",
    "--output",
    artifactRecoveryOutputDir,
    "--pollAttempts",
    "2",
    "--interval-ms",
    "0",
    "--progress-every-ms",
    "0",
    "--quiet",
  ]);
  const parsedArtifactRecoveryResult = JSON.parse(artifactRecoveryResult.stdout);
  assert.equal(parsedArtifactRecoveryResult.status, "passed");
  assert.equal(parsedArtifactRecoveryResult.riddle.job_id, "job_cli_profile_timeout_artifacts");
  assert.equal(parsedArtifactRecoveryResult.riddle.status, "completed");
  assert.equal(parsedArtifactRecoveryResult.riddle.terminal, true);
  assert.equal(parsedArtifactRecoveryResult.riddle.timed_out, true);
  assert.equal(parsedArtifactRecoveryResult.riddle.artifact_recovery, true);
  assert.equal(cliRunProfileArtifactRecoveryPollCount, 2);
  const artifactRecoverySummary = readFileSync(path.join(artifactRecoveryOutputDir, "summary.md"), "utf8");
  assert.match(artifactRecoverySummary, /artifact recovery: used artifacts endpoint after non-terminal poll/);
  assert.match(artifactRecoverySummary, /job `job_cli_profile_timeout_artifacts`, status `completed`, terminal true/);

  const unsubmittedRetryProfileFile = path.join(riddlePreviewDir, "cli-profile-unsubmitted-retry.json");
  const unsubmittedRetryOutputDir = path.join(riddlePreviewDir, "cli-profile-unsubmitted-retry-output");
  writeFileSync(unsubmittedRetryProfileFile, JSON.stringify({
    version: "riddle-proof.profile.v1",
    name: "cli-profile-unsubmitted-retry",
    target: {
      route: "/unsubmitted-retry-profile",
      viewports: [{ name: "desktop", width: 1280, height: 900 }],
    },
    checks: [{ type: "route_loaded", expected_path: "/unsubmitted-retry-profile" }],
  }));
  const unsubmittedRetryResult = await runCli([
    "run-profile",
    "--api-base-url",
    `http://127.0.0.1:${address.port}`,
    "--api-key",
    "cli-riddle-key",
    "--profile",
    unsubmittedRetryProfileFile,
    "--url",
    "https://example.com",
    "--runner",
    "riddle",
    "--output",
    unsubmittedRetryOutputDir,
    "--pollAttempts",
    "5",
    "--interval-ms",
    "0",
    "--progress-every-ms",
    "0",
    "--unsubmitted-timeout-ms",
    "1",
  ]);
  const parsedUnsubmittedRetryResult = JSON.parse(unsubmittedRetryResult.stdout);
  assert.equal(parsedUnsubmittedRetryResult.status, "passed");
  assert.equal(parsedUnsubmittedRetryResult.riddle.job_id, "job_cli_profile_unsubmitted_retry");
  assert.equal(parsedUnsubmittedRetryResult.riddle.retry_count, 1);
  assert.deepEqual(parsedUnsubmittedRetryResult.riddle.stale_job_ids, ["job_cli_profile_unsubmitted_stale"]);
  assert.equal(cliRunProfileUnsubmittedRunCount, 2);
  assert.equal(cliRunProfileUnsubmittedPollCount, 1);
  assert.match(unsubmittedRetryResult.stderr, /job_cli_profile_unsubmitted_stale stayed unsubmitted/);
  const unsubmittedRetrySummary = readFileSync(path.join(unsubmittedRetryOutputDir, "summary.md"), "utf8");
  assert.match(unsubmittedRetrySummary, /retry recovery: replaced 1 unsubmitted job \(`job_cli_profile_unsubmitted_stale`\)/);

  cliRunProfilePollCount = 0;
  const strictTrueOutputDir = path.join(riddlePreviewDir, "cli-profile-progress-strict-true-output");
  const cliProfileStrictTrueResult = await runCli([
    "run-profile",
    "--api-base-url",
    `http://127.0.0.1:${address.port}`,
    "--api-key",
    "cli-riddle-key",
    "--profile",
    profileFile,
    "--url",
    "https://example.com",
    "--runner",
    "riddle",
    "--output-dir",
    strictTrueOutputDir,
    "--pollAttempts",
    "4",
    "--interval-ms",
    "0",
    "--progress-every-ms",
    "0",
    "--quiet",
    "--strict=true",
  ]);
  assert.equal(JSON.parse(cliProfileStrictTrueResult.stdout).status, "passed");
  assert.equal(cliRunProfileRequests.length, 5);
  assert.equal(cliRunProfileRequests[4].body.strict, true);
  assert.equal(JSON.parse(readFileSync(path.join(strictTrueOutputDir, "profile-result.json"), "utf8")).status, "passed");

  const splitProfileFile = path.join(riddlePreviewDir, "cli-profile-split.json");
  const splitProfileOutputDir = path.join(riddlePreviewDir, "cli-profile-split-output");
  writeFileSync(splitProfileFile, JSON.stringify({
    version: "riddle-proof.profile.v1",
    name: "cli-profile-split",
    target: {
      route: "/split-profile",
      viewports: [
        { name: "desktop", width: 1280, height: 900 },
        { name: "phone", width: 390, height: 844 },
      ],
    },
    checks: [
      { type: "route_loaded", expected_path: "/split-profile" },
      { type: "no_horizontal_overflow", max_overflow_px: 0 },
    ],
  }));
  const cliSplitProfileResult = await runCli([
    "run-profile",
    "--api-base-url",
    `http://127.0.0.1:${address.port}`,
    "--api-key",
    "cli-riddle-key",
    "--profile",
    splitProfileFile,
    "--url",
    "https://example.com",
    "--runner",
    "riddle",
    "--output",
    splitProfileOutputDir,
    "--pollAttempts",
    "1",
    "--interval-ms",
    "0",
    "--progress-every-ms",
    "0",
    "--split-viewports",
    "true",
    "--quiet",
  ]);
  const parsedSplitProfileResult = JSON.parse(cliSplitProfileResult.stdout);
  assert.equal(parsedSplitProfileResult.status, "passed");
  assert.equal(parsedSplitProfileResult.profile_name, "cli-profile-split");
  assert.deepEqual(parsedSplitProfileResult.evidence.viewports.map((viewport) => viewport.name), ["desktop", "phone"]);
  assert.equal(parsedSplitProfileResult.evidence.dom_summary.split_viewports, true);
  assert.equal(parsedSplitProfileResult.evidence.dom_summary.child_result_count, 2);
  assert.equal(parsedSplitProfileResult.riddle.mode, "split-viewports");
  assert.equal(parsedSplitProfileResult.riddle.job_count, 2);
  assert.deepEqual(parsedSplitProfileResult.riddle.split_jobs.map((job) => job.viewport), ["desktop", "phone"]);
  assert.deepEqual(parsedSplitProfileResult.riddle.split_jobs.map((job) => job.job_id), ["job_cli_profile_split_desktop", "job_cli_profile_split_phone"]);
  assert.deepEqual(
    cliRunProfileRequests
      .filter((call) => String(call.body.url || "").includes("/split-profile"))
      .map((call) => call.body.viewport),
    [{ name: "desktop", width: 1280, height: 900 }, { name: "phone", width: 390, height: 844 }],
  );
  assert.equal(JSON.parse(readFileSync(path.join(splitProfileOutputDir, "profile-result.json"), "utf8")).status, "passed");
  assert.equal(JSON.parse(readFileSync(path.join(splitProfileOutputDir, "desktop", "profile-result.json"), "utf8")).profile_name, "cli-profile-split-desktop");
  assert.equal(JSON.parse(readFileSync(path.join(splitProfileOutputDir, "phone", "profile-result.json"), "utf8")).profile_name, "cli-profile-split-phone");
  const splitProfileSummary = readFileSync(path.join(splitProfileOutputDir, "summary.md"), "utf8");
  assert.match(splitProfileSummary, /mode `split-viewports`, jobs 2, status `split-viewports`, terminal true/);
  assert.match(splitProfileSummary, /desktop: job `job_cli_profile_split_desktop`, status `completed`, terminal true/);
  assert.match(splitProfileSummary, /phone: job `job_cli_profile_split_phone`, status `completed`, terminal true/);
  assert.match(splitProfileSummary, /desktop\/proof\.json/);
  assert.match(splitProfileSummary, /phone\/proof\.json/);

  const fatalConsoleProfileFile = path.join(riddlePreviewDir, "cli-fatal-console-summary.json");
  const fatalConsoleOutputDir = path.join(riddlePreviewDir, "cli-fatal-console-summary-output");
  writeFileSync(fatalConsoleProfileFile, JSON.stringify({
    version: "riddle-proof.profile.v1",
    name: "cli-fatal-console-summary",
    target: {
      route: "/fatal-console-summary",
      viewports: [{ name: "desktop", width: 1280, height: 900 }],
    },
    checks: [{ type: "no_fatal_console_errors" }],
  }));
  let fatalConsoleCliError;
  try {
    await runCli([
      "run-profile",
      "--api-base-url",
      `http://127.0.0.1:${address.port}`,
      "--api-key",
      "cli-riddle-key",
      "--profile",
      fatalConsoleProfileFile,
      "--url",
      "https://example.com",
      "--runner",
      "riddle",
      "--output",
      fatalConsoleOutputDir,
      "--quiet",
    ]);
  } catch (error) {
    fatalConsoleCliError = error;
  }
  assert.equal(fatalConsoleCliError?.code, 1);
  const fatalConsoleSummaryMarkdown = readFileSync(path.join(fatalConsoleOutputDir, "summary.md"), "utf8");
  assert.match(fatalConsoleSummaryMarkdown, /failed: no_fatal_console_errors \(4 unallowed fatal errors, 4\/8 console fatal allowed\)/);

  const blockedProfileFile = path.join(riddlePreviewDir, "cli-profile-balance-blocked.json");
  const blockedProfileOutputDir = path.join(riddlePreviewDir, "cli-profile-balance-blocked-output");
  writeFileSync(blockedProfileFile, JSON.stringify({
    version: "riddle-proof.profile.v1",
    name: "cli-profile-balance-blocked",
    target: {
      route: "/blocked-profile",
      viewports: [{ name: "desktop", width: 1280, height: 900 }],
    },
    checks: [{ type: "route_loaded", expected_path: "/blocked-profile" }],
  }));
  const cliProfileBlockedResult = await runCli([
    "run-profile",
    "--api-base-url",
    `http://127.0.0.1:${address.port}`,
    "--api-key",
    "cli-riddle-key",
    "--profile",
    blockedProfileFile,
    "--url",
    "https://example.com",
    "--runner",
    "riddle",
    "--output-dir",
    blockedProfileOutputDir,
  ]);
  const parsedBlockedProfileResult = JSON.parse(cliProfileBlockedResult.stdout);
  assert.equal(parsedBlockedProfileResult.status, "environment_blocked");
  assert.equal(parsedBlockedProfileResult.environment_blocker.reason, "insufficient_balance");
  assert.equal(parsedBlockedProfileResult.environment_blocker.http_status, 402);
  assert.equal(parsedBlockedProfileResult.environment_blocker.required_seconds, 90);
  assert.equal(parsedBlockedProfileResult.environment_blocker.available_seconds, 47);
  assert.match(parsedBlockedProfileResult.summary, /required 90s, available 47s, deficit 43s/);
  assert.match(cliProfileBlockedResult.stderr, /environment_blocked insufficient_balance required=90s available=47s deficit=43s/);
  const blockedProfileSummary = readFileSync(path.join(blockedProfileOutputDir, "summary.md"), "utf8");
  assert.match(blockedProfileSummary, /## Environment Blocker/);
  assert.match(blockedProfileSummary, /reason: insufficient_balance/);
  assert.match(blockedProfileSummary, /seconds: required 90, available 47, deficit 43/);

  const strictSafetyBlockedProfileFile = path.join(riddlePreviewDir, "cli-profile-strict-safety-blocked.json");
  const strictSafetyBlockedOutputDir = path.join(riddlePreviewDir, "cli-profile-strict-safety-blocked-output");
  writeFileSync(strictSafetyBlockedProfileFile, JSON.stringify({
    version: "riddle-proof.profile.v1",
    name: "cli-profile-strict-safety-blocked",
    target: {
      route: "/strict-safety-blocked",
      viewports: [{ name: "desktop", width: 1280, height: 900 }],
    },
    checks: [
      { type: "route_loaded", expected_path: "/strict-safety-blocked" },
      { type: "http_status", url: "/proof/good-catches/evidence/", expected_status: 200 },
      { type: "link_status", selector: "a[href*='/proof/good-catches/artifacts/']", min_count: 1 },
    ],
  }));
  const cliStrictSafetyBlockedResult = await runCli([
    "run-profile",
    "--api-base-url",
    `http://127.0.0.1:${address.port}`,
    "--api-key",
    "cli-riddle-key",
    "--profile",
    strictSafetyBlockedProfileFile,
    "--url",
    "https://example.com",
    "--runner",
    "riddle",
    "--output-dir",
    strictSafetyBlockedOutputDir,
    "--strict=true",
  ]);
  const parsedStrictSafetyBlockedResult = JSON.parse(cliStrictSafetyBlockedResult.stdout);
  assert.equal(parsedStrictSafetyBlockedResult.status, "environment_blocked");
  assert.equal(parsedStrictSafetyBlockedResult.environment_blocker.http_status, 400);
  assert.deepEqual(parsedStrictSafetyBlockedResult.environment_blocker.warnings, [
    "Direct network operations detected",
    "Script unusually large (potential code injection)",
  ]);
  assert.match(parsedStrictSafetyBlockedResult.warnings.join("\n"), /hosted profile runner with 1 http_status and 1 link_status\/artifact_link_status check\(s\)/);
  const strictSafetyBlockedSummary = readFileSync(path.join(strictSafetyBlockedOutputDir, "summary.md"), "utf8");
  assert.match(strictSafetyBlockedSummary, /## Profile Warnings/);
  assert.match(strictSafetyBlockedSummary, /omit --strict=true or rerun with --strict=false/);
} finally {
  cliRunProfileServer.close();
  await once(cliRunProfileServer, "close");
}

const profile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "pricing-page-basic",
  target: {
    route: "/pricing",
    timeout_sec: 420,
    screenshot_mode: "viewport",
    viewports: [
      { name: "mobile", width: 390, height: 844 },
      { name: "desktop", width: 1440, height: 1000 },
    ],
    setup_actions: [
      { type: "click", selector: "[data-testid='open-pricing']", force: true, after_ms: 50 },
      { type: "wait-for-text", selector: "body", text: "Start building", timeout_ms: 1500 },
    ],
  },
  checks: [
    { type: "route_loaded", expected_path: "/pricing" },
    { type: "selector_visible", selector: "[data-testid='pricing-cards']" },
    { type: "selector_absent", selector: ".game-player-root iframe" },
    { type: "selector_count_equals", selector: "[data-testid='pricing-cards']", expected_count: 1 },
    { type: "selector_text_visible", selector: "[data-testid='pricing-cards']", text: "Start building" },
    { type: "selector_text_absent", selector: "[data-testid='pricing-cards']", text: "Enterprise-only" },
    { type: "observe_within", selector: "[data-testid='pricing-cards']", text: "Start building", within_ms: 1500 },
    { type: "text_visible", text: "Start building" },
    { type: "text_visible", text: "Desktop-only copy", viewports: ["desktop"] },
    { type: "no_mobile_horizontal_overflow" },
    { type: "no_fatal_console_errors" },
    { type: "no_console_warnings" },
  ],
}, { url: "https://example.com" });
assert.equal(resolveRiddleProofProfileTargetUrl(profile), "https://example.com/pricing");
assert.equal(profile.target.timeout_sec, 420);
assert.equal(profile.target.screenshot_full_page, false);
assert.deepEqual(profile.checks.find((check) => check.text === "Desktop-only copy").viewports, ["desktop"]);
assert.ok(RIDDLE_PROOF_PROFILE_CHECK_TYPES.includes("selector_text_visible"));
assert.ok(RIDDLE_PROOF_PROFILE_CHECK_TYPES.includes("selector_text_absent"));
assert.ok(RIDDLE_PROOF_PROFILE_CHECK_TYPES.includes("observe_within"));
assert.ok(RIDDLE_PROOF_PROFILE_CHECK_TYPES.includes("no_console_warnings"));
assert.ok(RIDDLE_PROOF_PROFILE_CHECK_TYPES.includes("dialog_count_equals"));
assert.ok(RIDDLE_PROOF_PROFILE_CHECK_TYPES.includes("dialog_accept_count_equals"));
assert.ok(RIDDLE_PROOF_PROFILE_CHECK_TYPES.includes("dialog_dismiss_count_equals"));
assert.equal(resolveRiddleProofProfileTimeoutSec(profile), 420);
assert.equal(resolveRiddleProofProfileTimeoutSec(profile, 180), 180);
assert.equal(
  resolveRiddleProofProfileRouteUrl("https://preview.riddledc.com/s/ps_1234abcd/", "/playground/"),
  "https://preview.riddledc.com/s/ps_1234abcd/playground/",
);
assert.equal(
  resolveRiddleProofProfileRouteUrl("https://preview.riddledc.com/preview/lilarcade/smoke/", "/games/luge-run"),
  "https://preview.riddledc.com/preview/lilarcade/smoke/games/luge-run",
);
assert.equal(
  resolveRiddleProofProfileRouteUrl("https://example.com/base/", "/pricing"),
  "https://example.com/pricing",
);
assert.throws(
  () => normalizeRiddleProofProfile({
    version: "riddle-proof.profile.v1",
    name: "dialog-count-missing-expected",
    target: {
      route: "/danger-zone",
      viewports: [{ name: "desktop", width: 1280, height: 900 }],
    },
    checks: [{ type: "dialog_count_equals" }],
  }, { url: "https://example.com" }),
  /dialog_count_equals requires expected_count/,
);
const dialogCountProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "dialog-count-profile",
  target: {
    route: "/danger-zone",
    viewports: [{ name: "desktop", width: 1280, height: 900 }],
  },
  checks: [
    { type: "dialog_count_equals", expected_count: 2 },
    { type: "dialog_accept_count_equals", expected_count: 1 },
    { type: "dialog_dismiss_count_equals", expected_count: 1 },
  ],
}, { url: "https://example.com" });
const dialogCountEvidence = {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: "dialog-count-profile",
  target_url: "https://example.com/danger-zone",
  baseline_policy: "invariant_only",
  captured_at: "2026-05-17T00:00:00.000Z",
  viewports: [{
    name: "desktop",
    width: 1280,
    height: 900,
    route: {
      requested: "https://example.com/danger-zone",
      observed: "/danger-zone",
      expected_path: "/danger-zone",
      matched: true,
      http_status: 200,
    },
    selectors: {},
    text_matches: {},
    overflow_px: 0,
    bounds_overflow_px: 0,
  }],
  console: { events: [], fatal_count: 0 },
  page_errors: [],
  dom_summary: {
    dialog_count: 2,
    dialog_accept_count: 1,
    dialog_dismiss_count: 1,
  },
};
const dialogCountAssessment = assessRiddleProofProfileEvidence(dialogCountProfile, dialogCountEvidence);
assert.equal(dialogCountAssessment.status, "passed");
assert.equal(dialogCountAssessment.checks.find((check) => check.type === "dialog_count_equals").evidence.count, 2);
assert.equal(dialogCountAssessment.checks.find((check) => check.type === "dialog_accept_count_equals").evidence.field, "dialog_accept_count");
const dialogMismatchProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "dialog-count-mismatch-profile",
  target: {
    route: "/danger-zone",
    viewports: [{ name: "desktop", width: 1280, height: 900 }],
  },
  checks: [{ type: "dialog_accept_count_equals", expected_count: 2 }],
}, { url: "https://example.com" });
const dialogMismatchAssessment = assessRiddleProofProfileEvidence(dialogMismatchProfile, dialogCountEvidence);
assert.equal(dialogMismatchAssessment.status, "product_regression");
assert.equal(dialogMismatchAssessment.checks[0].status, "failed");
assert.equal(dialogMismatchAssessment.checks[0].evidence.count, 1);
assert.match(dialogMismatchAssessment.checks[0].message, /dialog_accept_count did not equal 2; observed 1/);
const dialogCountProfileScript = buildRiddleProofProfileScript(dialogCountProfile);
assert.ok(dialogCountProfileScript.includes("dialog_count_equals"));
assert.ok(dialogCountProfileScript.includes("dialog_accept_count"));
const mountedPreviewProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "preview-playground-basic",
  target: {
    url: "https://preview.riddledc.com/s/ps_1234abcd/",
    route: "/playground/",
    viewports: [{ name: "mobile", width: 390, height: 844 }],
  },
  checks: [{ type: "route_loaded", expected_path: "/playground/" }],
});
assert.equal(
  resolveRiddleProofProfileTargetUrl(mountedPreviewProfile),
  "https://preview.riddledc.com/s/ps_1234abcd/playground/",
);
const mountedPreviewHttpStatusProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "preview-markdown-status",
  target: {
    url: "https://preview.riddledc.com/s/ps_1234abcd/",
    route: "/docs/riddle-proof/",
    viewports: [{ name: "desktop", width: 1280, height: 900 }],
  },
  checks: [{
    type: "http_status",
    url: "/docs/riddle-proof/markdown.md",
    expected_status: 200,
    allowed_content_types: ["text/markdown"],
    body_contains: ["Profile Text Semantics"],
  }],
});
const mountedPreviewHttpStatusEvidence = {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: "preview-markdown-status",
  target_url: "https://preview.riddledc.com/s/ps_1234abcd/docs/riddle-proof/",
  baseline_policy: "invariant_only",
  captured_at: "2026-05-16T00:00:00.000Z",
  viewports: [{
    name: "desktop",
    width: 1280,
    height: 900,
    url: "https://preview.riddledc.com/s/ps_1234abcd/docs/riddle-proof/",
    route: {
      requested: "https://preview.riddledc.com/s/ps_1234abcd/docs/riddle-proof/",
      observed: "/s/ps_1234abcd/docs/riddle-proof/",
      expected_path: "/docs/riddle-proof/",
      matched: true,
      http_status: 200,
    },
    body_text_sample: "Profile Text Semantics",
    overflow_px: 0,
    bounds_overflow_px: 0,
    selectors: {},
    text_matches: {},
    http_statuses: {
      "GET https://preview.riddledc.com/s/ps_1234abcd/docs/riddle-proof/markdown.md": {
        version: "riddle-proof.http-status.v1",
        url: "https://preview.riddledc.com/s/ps_1234abcd/docs/riddle-proof/markdown.md",
        method: "GET",
        status: 200,
        ok: true,
        error: null,
        content_type: "text/markdown",
        content_length: 1024,
        bytes: 1024,
        body_contains: { "Profile Text Semantics": true },
      },
    },
    screenshot_label: "preview-markdown-status-desktop",
  }],
  console: { events: [], fatal_count: 0 },
  page_errors: [],
  dom_summary: { viewport_count: 1 },
};
const mountedPreviewHttpStatusAssessment = assessRiddleProofProfileEvidence(
  mountedPreviewHttpStatusProfile,
  mountedPreviewHttpStatusEvidence,
);
const mountedPreviewHttpStatusCheck = mountedPreviewHttpStatusAssessment.checks.find((check) => check.type === "http_status");
assert.equal(mountedPreviewHttpStatusAssessment.status, "passed");
assert.equal(
  mountedPreviewHttpStatusCheck.evidence.url,
  "https://preview.riddledc.com/s/ps_1234abcd/docs/riddle-proof/markdown.md",
);
const camelTimeoutProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "timeout-alias",
  target: { route: "/heavy", timeoutSec: 90 },
  checks: [{ type: "route_loaded", expected_path: "/heavy" }],
}, { url: "https://example.com" });
assert.equal(camelTimeoutProfile.target.timeout_sec, 90);
const riddleAliasTimeoutProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "riddle-timeout-alias",
  target: { route: "/heavy", riddle_timeout_sec: 95 },
  checks: [{ type: "route_loaded", expected_path: "/heavy" }],
}, { url: "https://example.com" });
assert.equal(riddleAliasTimeoutProfile.target.timeout_sec, 95);
assert.equal(profile.target.setup_actions.length, 2);
assert.equal(profile.target.setup_actions[0].force, true);
assert.equal(profile.target.setup_actions[1].type, "wait_for_text");
assert.ok(RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES.includes("screenshot"));
const scopedSetupProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "scoped-setup-profile",
  target: {
    route: "/billing",
    viewports: [
      { name: "desktop", width: 1280, height: 900 },
      { name: "phone", width: 390, height: 844 },
    ],
    setup_actions: [
      { type: "click", selector: ".error-message button", text: "Retry", viewports: ["desktop"] },
      { type: "click", selector: ".maybe-dismiss", text: "Dismiss", optional: true, viewports: ["phone"] },
      { type: "wait-for-text", selector: "body", text: "Recovered" },
    ],
  },
  checks: [{ type: "route_loaded", expected_path: "/billing" }],
}, { url: "https://example.com" });
assert.deepEqual(scopedSetupProfile.target.setup_actions[0].viewports, ["desktop"]);
assert.equal(scopedSetupProfile.target.setup_actions[1].optional, true);
const scopedSetupAssessment = assessRiddleProofProfileEvidence(scopedSetupProfile, {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: "scoped-setup-profile",
  target_url: "https://example.com/billing",
  captured_at: "2026-05-15T22:30:00.000Z",
  baseline_policy: "invariant_only",
  viewports: [
    {
      name: "desktop",
      width: 1280,
      height: 900,
      url: "https://example.com/billing",
      route: { requested: "https://example.com/billing", observed: "/billing", expected_path: "/billing", matched: true, http_status: 200 },
      setup_action_results: [
        { ok: true, action: "click", ordinal: 0, selector: ".error-message button" },
        { ok: true, action: "wait_for_text", ordinal: 1, selector: "body" },
      ],
      selectors: {},
      text_matches: {},
      overflow_px: 0,
      bounds_overflow_px: 0,
      overflow_offenders: [],
    },
    {
      name: "phone",
      width: 390,
      height: 844,
      url: "https://example.com/billing",
      route: { requested: "https://example.com/billing", observed: "/billing", expected_path: "/billing", matched: true, http_status: 200 },
      setup_action_results: [
        { ok: false, action: "click", ordinal: 0, selector: ".maybe-dismiss", optional: true, reason: "text_not_found" },
        { ok: true, action: "wait_for_text", ordinal: 1, selector: "body" },
      ],
      selectors: {},
      text_matches: {},
      overflow_px: 0,
      bounds_overflow_px: 0,
      overflow_offenders: [],
    },
  ],
  console: { events: [], fatal_count: 0 },
  page_errors: [],
  dialogs: [],
  network_mocks: [],
  dom_summary: { expected_viewport_count: 2, viewport_count: 2, partial: false },
});
const scopedSetupCheck = scopedSetupAssessment.checks.find((check) => check.type === "setup_actions_succeeded");
assert.equal(scopedSetupCheck.status, "passed");
assert.deepEqual(
  scopedSetupCheck.evidence.viewports.map((viewport) => [viewport.name, viewport.expected_action_count, viewport.result_count, viewport.ok]),
  [["desktop", 2, 2, true], ["phone", 2, 2, true]],
);
assert.equal(scopedSetupCheck.evidence.setup_summary.viewports[1].optional_failed.length, 1);
const setupScreenshotProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "setup-screenshot-profile",
  target: {
    route: "/pricing",
    setup_actions: [{ type: "capture-screenshot", label: "After Pricing Click" }],
  },
  checks: [{ type: "route_loaded", expected_path: "/pricing" }],
}, { url: "https://example.com" });
assert.equal(setupScreenshotProfile.target.setup_actions[0].type, "screenshot");
assert.equal(setupScreenshotProfile.target.setup_actions[0].label, "After Pricing Click");
const targetViewportScreenshotProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "target-viewport-screenshot-profile",
  target: {
    route: "/pricing",
    screenshot_mode: "viewport",
  },
  checks: [{ type: "route_loaded", expected_path: "/pricing" }],
}, { url: "https://example.com" });
assert.equal(targetViewportScreenshotProfile.target.screenshot_full_page, false);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "conflicting-target-screenshot-profile",
  target: {
    route: "/pricing",
    screenshot_full_page: false,
    screenshot_mode: "full_page",
  },
  checks: [{ type: "route_loaded", expected_path: "/pricing" }],
}, { url: "https://example.com" }), /conflicting screenshot full_page/);
const viewportSetupScreenshotProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "viewport-setup-screenshot-profile",
  target: {
    route: "/pricing",
    setup_actions: [
      { type: "screenshot", label: "Viewport Ready", mode: "viewport" },
      { type: "screenshot", label: "Full Ready", viewport_only: false },
    ],
  },
  checks: [{ type: "route_loaded", expected_path: "/pricing" }],
}, { url: "https://example.com" });
assert.equal(viewportSetupScreenshotProfile.target.setup_actions[0].full_page, false);
assert.equal(viewportSetupScreenshotProfile.target.setup_actions[1].full_page, true);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "conflicting-setup-screenshot-profile",
  target: {
    route: "/pricing",
    setup_actions: [{ type: "screenshot", label: "Conflict", full_page: false, mode: "full_page" }],
  },
  checks: [{ type: "route_loaded", expected_path: "/pricing" }],
}, { url: "https://example.com" }), /conflicting screenshot full_page/);
const clickCountSetupProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "setup-click-count-profile",
  target: {
    route: "/checkout",
    setup_actions: [{ type: "click", selector: "button[type='submit']", click_count: 2 }],
  },
  checks: [{ type: "route_loaded", expected_path: "/checkout" }],
}, { url: "https://example.com" });
assert.equal(clickCountSetupProfile.target.setup_actions[0].click_count, 2);
const clickCountAliasProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "setup-click-count-alias-profile",
  target: {
    route: "/checkout",
    setup_actions: [{ type: "click", selector: "button[type='submit']", clicks: 3 }],
  },
  checks: [{ type: "route_loaded", expected_path: "/checkout" }],
}, { url: "https://example.com" });
assert.equal(clickCountAliasProfile.target.setup_actions[0].click_count, 3);
const clickCountProfileScript = buildRiddleProofProfileScript(clickCountSetupProfile);
assert.ok(clickCountProfileScript.includes("action.click_count"));
assert.ok(clickCountProfileScript.includes("clickOptions.clickCount = clickCount"));
const profileScript = buildRiddleProofProfileScript(profile);
assert.ok(profileScript.includes('saveJson("proof.json"'));
assert.ok(profileScript.includes('saveScreenshot(screenshotLabel, screenshotOptions)'));
assert.ok(profileScript.includes('saveScreenshot(label, screenshotOptions)'));
assert.ok(profileScript.includes("screenshotOptions.fullPage = action.full_page !== false"));
assert.ok(profileScript.includes("screenshotFullPage = profile.target.screenshot_full_page !== false"));
assert.ok(profileScript.includes("screenshotOptions.fullPage = screenshotFullPage"));
assert.ok(profileScript.includes("screenshot_full_page: screenshotFullPage"));
assert.ok(profileScript.includes("executeSetupActions"));
assert.ok(profileScript.includes("setupActionsForViewport(profile.target.setup_actions || [], viewport.name)"));
assert.ok(profileScript.includes("expected_action_count"));
assert.ok(profileScript.includes("action.optional"));
assert.ok(profileScript.includes("executeSetupAction(action, index, viewport)"));
assert.ok(profileScript.includes("setup_action_results"));
assert.ok(profileScript.includes("profileSetupSummary"));
assert.ok(profileScript.includes("setup_summary"));
assert.ok(profileScript.includes("setup_screenshots"));
assert.ok(profileScript.includes("profileSetupScreenshotLabels"));
assert.ok(profileScript.includes("sampleProfileSetupSummaryItems"));
assert.ok(profileScript.includes("setupLocatorVisible"));
assert.ok(profileScript.includes("matching_element_not_visible"));
assert.ok(profileScript.includes("previewMountPrefix"));
assert.ok(profileScript.includes("saveProfileArtifacts(viewports)"));
assert.ok(profileScript.includes("expected_viewport_count"));
assert.ok(profileScript.includes("compactSetupResultText"));
assert.ok(profileScript.includes("text: compactSetupResultText(text)"));
assert.ok(profileScript.includes("overflow_offenders"));
assert.ok(profileScript.includes("isHandledByHorizontalOverflowAncestor"));
assert.ok(profileScript.includes('overflowX === "hidden" || overflowX === "clip"'));
assert.ok(profileScript.includes("body_text: text"));
assert.ok(profileScript.includes("const text_match_samples = {}"));
assert.ok(profileScript.includes("text_match_samples[key] = textMatchSamples(sample, check)"));
assert.ok(profileScript.includes("observeWithin(check)"));
assert.ok(profileScript.includes("observations[key] = observations[key] || await observeWithin(check)"));
assert.ok(profileScript.includes('check.type === "selector_absent"'));
assert.ok(profileScript.includes('check.type === "selector_count_equals"'));
assert.ok(profileScript.includes('check.type === "selector_text_visible"'));
assert.ok(profileScript.includes('check.type === "observe_within"'));
assert.ok(profileScript.includes('check.type === "url_search_param_equals"'));
assert.ok(profileScript.includes('check.type === "url_search_param_absent"'));
assert.ok(profileScript.includes("force: true"));
const urlParamProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "deep-link-url-profile",
  target: {
    route: "/games/drum-sequencer?seq=stale-local&song=monkberry-moon-delight-tab&mix=profile&view=trainer&instrument=bass",
    viewports: [
      { name: "phone", width: 390, height: 844 },
      { name: "desktop", width: 1280, height: 900 },
    ],
  },
  checks: [
    { type: "route_loaded", expected_path: "/games/drum-sequencer" },
    { type: "url_search_param_absent", param: "seq" },
    { type: "url_search_param_equals", search_param: "song", expected_value: "monkberry-moon-delight-tab" },
    { type: "url_search_param_equals", key: "view", value: "trainer" },
  ],
}, { url: "https://example.com" });
assert.equal(urlParamProfile.checks[2].param, "song");
assert.equal(urlParamProfile.checks[3].expected_value, "trainer");
const networkMockProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "builder-network-mocks",
  target: {
    route: "/create",
    viewports: [{ name: "mobile", width: 390, height: 844 }],
    network_mocks: [
      {
        label: "chat",
        url: "**/v1/chat/completions",
        method: "POST",
        content_type: "text/event-stream",
        delay_ms: 250,
        body: "data: [DONE]\n\n",
      },
      {
        label: "save",
        url: "**/api/save",
        method: "POST",
        capture_request_body: true,
        request_body_contains: ["build-riddle-proof-v238"],
        request_body_patterns: ["\\\"buildId\\\"\\s*:"],
        request_body_not_contains: ["build-riddle-proof-v237"],
        request_body_not_patterns: ["\\\"legacyBuildId\\\"\\s*:"],
        json: { gameId: "riddle-proof-mock" },
      },
      {
        label: "build-retry",
        url: "**/api/build",
        method: "POST",
        delay_ms: 75,
        repeat_responses: true,
        sequence_scope: "viewport",
        required_hit_count: 4,
        responses: [
          {
            label: "first-build-fails",
            status: 503,
            request_body_contains: ["first-build-request"],
            request_body_not_contains: ["second-build-request"],
            json: { error: "Synthetic build outage" },
          },
          {
            label: "second-build-succeeds",
            status: 200,
            delay_ms: 125,
            request_body_contains: ["second-build-request"],
            request_body_not_contains: ["first-build-request"],
            json: { previewUrl: "https://cdn.test/retry-game/index.html" },
          },
        ],
      },
    ],
  },
  checks: [
    { type: "route_loaded", expected_path: "/create" },
    { type: "no_fatal_console_errors" },
  ],
}, { url: "https://example.com" });
assert.equal(networkMockProfile.target.network_mocks.length, 3);
assert.equal(networkMockProfile.target.network_mocks[0].required, true);
assert.equal(networkMockProfile.target.network_mocks[0].content_type, "text/event-stream");
assert.equal(networkMockProfile.target.network_mocks[0].delay_ms, 250);
assert.deepEqual(networkMockProfile.target.network_mocks[1].body_json, { gameId: "riddle-proof-mock" });
assert.equal(networkMockProfile.target.network_mocks[1].capture_request_body, true);
assert.deepEqual(networkMockProfile.target.network_mocks[1].request_body_contains, ["build-riddle-proof-v238"]);
assert.deepEqual(networkMockProfile.target.network_mocks[1].request_body_patterns, ["\\\"buildId\\\"\\s*:"]);
assert.deepEqual(networkMockProfile.target.network_mocks[1].request_body_not_contains, ["build-riddle-proof-v237"]);
assert.deepEqual(networkMockProfile.target.network_mocks[1].request_body_not_patterns, ["\\\"legacyBuildId\\\"\\s*:"]);
assert.equal(networkMockProfile.target.network_mocks[2].responses.length, 2);
assert.equal(networkMockProfile.target.network_mocks[2].repeat_responses, true);
assert.equal(networkMockProfile.target.network_mocks[2].sequence_scope, "viewport");
assert.equal(networkMockProfile.target.network_mocks[2].required_hit_count, 4);
assert.equal(networkMockProfile.target.network_mocks[2].responses[0].status, 503);
assert.equal(networkMockProfile.target.network_mocks[2].responses[0].delay_ms, 75);
assert.equal(networkMockProfile.target.network_mocks[2].responses[0].capture_request_body, true);
assert.deepEqual(networkMockProfile.target.network_mocks[2].responses[0].request_body_contains, ["first-build-request"]);
assert.deepEqual(networkMockProfile.target.network_mocks[2].responses[0].request_body_not_contains, ["second-build-request"]);
assert.deepEqual(networkMockProfile.target.network_mocks[2].responses[1].body_json, { previewUrl: "https://cdn.test/retry-game/index.html" });
assert.equal(networkMockProfile.target.network_mocks[2].responses[1].delay_ms, 125);
assert.equal(networkMockProfile.target.network_mocks[2].responses[1].capture_request_body, true);
assert.deepEqual(networkMockProfile.target.network_mocks[2].responses[1].request_body_contains, ["second-build-request"]);
assert.deepEqual(networkMockProfile.target.network_mocks[2].responses[1].request_body_not_contains, ["first-build-request"]);
const networkMockProfileScript = buildRiddleProofProfileScript(networkMockProfile);
assert.ok(networkMockProfileScript.includes("registerNetworkMocks"));
assert.ok(networkMockProfileScript.includes("networkMockEvents"));
assert.ok(networkMockProfileScript.includes("network_mocks: networkMockEvents.slice()"));
assert.ok(networkMockProfileScript.includes("network_mock_hit_count"));
assert.ok(networkMockProfileScript.includes("response_index"));
assert.ok(networkMockProfileScript.includes("sequence_reused"));
assert.ok(networkMockProfileScript.includes("sequence_cycle"));
assert.ok(networkMockProfileScript.includes("activeViewportName"));
assert.ok(networkMockProfileScript.includes("sequence_hit_index"));
assert.ok(networkMockProfileScript.includes("mock.sequence_scope"));
assert.ok(networkMockProfileScript.includes("selectNetworkMockResponseByRequestBody"));
assert.ok(networkMockProfileScript.includes("response_selection"));
assert.ok(networkMockProfileScript.includes("sequence_response_index"));
assert.ok(networkMockProfileScript.includes('responseSelection = "request_body"'));
assert.ok(networkMockProfileScript.includes("compactNetworkMockRequestBody"));
assert.ok(networkMockProfileScript.includes("networkMockShouldCaptureRequestBody(mock, responseBodyContract)"));
assert.ok(networkMockProfileScript.includes("request_body_matches"));
assert.ok(networkMockProfileScript.includes("request_body_sample"));
assert.ok(networkMockProfileScript.includes("request_body_forbidden_text"));
assert.ok(networkMockProfileScript.includes("request_body_forbidden_pattern_matched"));
assert.ok(networkMockProfileScript.includes("max_hits_by_label"));
assert.ok(networkMockProfileScript.includes("response_hits_by_label"));
assert.ok(networkMockProfileScript.includes("profileWarnings"));
assert.ok(networkMockProfileScript.includes("forbidden_mock_hit"));
assert.ok(networkMockProfileScript.includes("delay_ms"));
assert.ok(networkMockProfileScript.includes("setTimeout(resolve, delayMs)"));
assert.ok(networkMockProfileScript.includes("route.fallback"));
assert.ok(networkMockProfileScript.includes("consoleEvents.length = 0"));
assert.deepEqual(collectRiddleProofProfileWarnings(networkMockProfile), []);
const networkAbortMockProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "network-abort-mock",
  target: {
    route: "/settings",
    viewports: [{ name: "desktop", width: 1280, height: 720 }],
    network_mocks: [
      {
        label: "revoke-transport-failure",
        url: "**/api/revoke",
        method: "DELETE",
        abort: true,
        abort_error_code: "failed",
      },
      {
        label: "sequence-abort",
        url: "**/api/sequence-abort",
        method: "POST",
        required: false,
        responses: [
          { label: "first-network-fails", abort: "connectionreset" },
          { label: "second-succeeds", status: 200, json: { ok: true } },
        ],
      },
    ],
  },
  checks: [{ type: "no_fatal_console_errors" }],
}, { url: "https://example.com" });
assert.equal(networkAbortMockProfile.target.network_mocks[0].abort, true);
assert.equal(networkAbortMockProfile.target.network_mocks[0].abort_error_code, "failed");
assert.equal(networkAbortMockProfile.target.network_mocks[1].responses[0].abort, true);
assert.equal(networkAbortMockProfile.target.network_mocks[1].responses[0].abort_error_code, "connectionreset");
assert.equal(networkAbortMockProfile.target.network_mocks[1].responses[1].abort, undefined);
const networkAbortMockProfileScript = buildRiddleProofProfileScript(networkAbortMockProfile);
assert.ok(networkAbortMockProfileScript.includes("route.abort(abortErrorCode)"));
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "network-abort-mock-invalid",
  target: {
    route: "/settings",
    network_mocks: [{ label: "bad-abort", url: "**/api/revoke", abort: true, abort_error_code: "madeup" }],
  },
  checks: [{ type: "route_loaded" }],
}, { url: "https://example.com" }), /abort_error_code must be one of/);
const overlappingResponseProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "overlapping-response-profile",
  target: {
    route: "/create",
    viewports: [{ name: "mobile", width: 390, height: 844 }],
    network_mocks: [{
      label: "save",
      url: "**/api/save",
      method: "POST",
      responses: [
        {
          label: "invalid-save",
          status: 200,
          request_body_contains: ["\"buildId\":\"build-overlap\"", "\"name\":\"Same Save\""],
          json: { gameId: "../escaped" },
        },
        {
          label: "valid-save",
          status: 200,
          request_body_contains: ["\"buildId\":\"build-overlap\"", "\"name\":\"Same Save\"", "\"description\":\"retry\""],
          json: { gameId: "safe" },
        },
      ],
    }],
  },
  checks: [{ type: "route_loaded", expected_path: "/create" }],
}, { url: "https://example.com" });
const overlappingWarnings = collectRiddleProofProfileWarnings(overlappingResponseProfile);
assert.equal(overlappingWarnings.length, 1);
assert.match(overlappingWarnings[0], /invalid-save.*shadow.*valid-save/);
const overlappingScript = buildRiddleProofProfileScript(overlappingResponseProfile);
assert.ok(overlappingScript.includes("First matching request-body response wins."));
const overlappingResult = assessRiddleProofProfileEvidence(overlappingResponseProfile, {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: "overlapping-response-profile",
  target_url: "https://example.com/create",
  baseline_policy: "invariant_only",
  captured_at: "2026-05-17T00:00:00.000Z",
  viewports: [{
    name: "mobile",
    width: 390,
    height: 844,
    url: "https://example.com/create",
    route: {
      requested: "https://example.com/create",
      observed: "/create",
      expected_path: "/create",
      matched: true,
      http_status: 200,
    },
  }],
  console: { events: [], fatal_count: 0 },
  page_errors: [],
  network_mocks: [
    { ok: true, label: "save", response_label: "invalid-save", url: "https://example.com/api/save", method: "POST", status: 200 },
    { ok: true, label: "save", response_label: "valid-save", url: "https://example.com/api/save", method: "POST", status: 200 },
  ],
});
assert.equal(overlappingResult.status, "passed");
assert.equal(overlappingResult.warnings?.length, 1);
assert.ok(networkMockProfileScript.includes("isExpectedFailedNetworkMockConsoleEvent"));
assert.ok(networkMockProfileScript.includes("allowed_expected_network_mock_console_count"));
const cappedNetworkMockProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "builder-network-mock-caps",
  target: {
    route: "/create",
    viewports: [{ name: "mobile", width: 390, height: 844 }],
    network_mocks: [
      {
        label: "build-should-not-run",
        url: "**/api/build",
        method: "POST",
        forbidden: true,
        json: { previewUrl: "https://cdn.test/should-not-run/index.html" },
      },
      {
        label: "analytics-at-most-two",
        url: "**/analytics",
        method: "POST",
        required: false,
        max_hits: 2,
        status: 204,
      },
    ],
  },
  checks: [{ type: "route_loaded", expected_path: "/create" }],
}, { url: "https://example.com" });
assert.equal(cappedNetworkMockProfile.target.network_mocks[0].required, false);
assert.equal(cappedNetworkMockProfile.target.network_mocks[0].forbidden, true);
assert.equal(cappedNetworkMockProfile.target.network_mocks[0].max_hit_count, 0);
assert.equal(cappedNetworkMockProfile.target.network_mocks[1].required, false);
assert.equal(cappedNetworkMockProfile.target.network_mocks[1].max_hit_count, 2);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "invalid-forbidden-network-mock",
  target: {
    route: "/create",
    viewports: [{ name: "mobile", width: 390, height: 844 }],
    network_mocks: [{
      label: "build",
      url: "**/api/build",
      forbidden: true,
      max_hit_count: 1,
    }],
  },
  checks: [{ type: "route_loaded", expected_path: "/create" }],
}, { url: "https://example.com" }), /forbidden cannot be combined with max_hit_count greater than 0/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "impossible-network-mock-cap",
  target: {
    route: "/create",
    viewports: [{ name: "mobile", width: 390, height: 844 }],
    network_mocks: [{
      label: "save",
      url: "**/api/save",
      required_hit_count: 3,
      max_hit_count: 2,
    }],
  },
  checks: [{ type: "route_loaded", expected_path: "/create" }],
}, { url: "https://example.com" }), /max_hit_count cannot be less than its required hit count/);
const networkMockMismatchResult = assessRiddleProofProfileEvidence(networkMockProfile, {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: networkMockProfile.name,
  target_url: "https://example.com/create",
  baseline_policy: "invariant_only",
  captured_at: "2026-05-14T00:00:00.000Z",
  viewports: [{
    name: "mobile",
    width: 390,
    height: 844,
    url: "https://example.com/create",
    route: {
      requested: "https://example.com/create",
      observed: "/create",
      expected_path: "/create",
      matched: true,
      http_status: 200,
    },
  }],
  console: { events: [], fatal_count: 0 },
  page_errors: [],
  network_mocks: [
    { ok: true, label: "chat", url: "https://example.com/v1/chat/completions", method: "POST", status: 200 },
    {
      ok: true,
      label: "save",
      url: "https://example.com/api/save",
      method: "POST",
      status: 200,
      request_body_matches: false,
      request_body_failures: [
        { type: "request_body_missing_text", text: "build-riddle-proof-v238" },
        { type: "request_body_forbidden_text", text: "build-riddle-proof-v237" },
      ],
      request_body_length: 2,
      request_body_sample: "{}",
    },
    {
      ok: true,
      label: "build-retry",
      response_label: "first-build-fails",
      hit_index: 0,
      response_index: 0,
      url: "https://example.com/api/build",
      method: "POST",
      status: 503,
      request_body_matches: false,
      request_body_failures: [
        { type: "request_body_missing_text", text: "first-build-request" },
      ],
      request_body_length: 2,
      request_body_sample: "{}",
    },
    { ok: true, label: "build-retry", url: "https://example.com/api/build", method: "POST", status: 200 },
    { ok: true, label: "build-retry", url: "https://example.com/api/build", method: "POST", status: 503 },
    { ok: true, label: "build-retry", url: "https://example.com/api/build", method: "POST", status: 200 },
  ],
});
const networkMockMismatchCheck = networkMockMismatchResult.checks.find((check) => check.type === "network_mocks_succeeded");
assert.equal(networkMockMismatchResult.status, "product_regression");
assert.equal(networkMockMismatchCheck.status, "failed");
assert.equal(networkMockMismatchCheck.evidence.failed[0].reason, "request_body_mismatch");
assert.equal(networkMockMismatchCheck.evidence.failed[0].request_body_sample, "{}");
const responseBodyMismatch = networkMockMismatchCheck.evidence.failed.find((failure) => failure.response_label === "first-build-fails");
assert.equal(responseBodyMismatch.reason, "request_body_mismatch");
assert.equal(responseBodyMismatch.hit_index, 0);
assert.equal(responseBodyMismatch.response_index, 0);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "invalid-network-mock-pattern",
  target: {
    route: "/create",
    viewports: [{ name: "mobile", width: 390, height: 844 }],
    network_mocks: [{
      label: "save",
      url: "**/api/save",
      request_body_patterns: ["["],
    }],
  },
  checks: [{ type: "route_loaded", expected_path: "/create" }],
}, { url: "https://example.com" }), /request_body_patterns contains invalid regex/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "invalid-network-mock-not-pattern",
  target: {
    route: "/create",
    viewports: [{ name: "mobile", width: 390, height: 844 }],
    network_mocks: [{
      label: "save",
      url: "**/api/save",
      request_body_not_patterns: ["["],
    }],
  },
  checks: [{ type: "route_loaded", expected_path: "/create" }],
}, { url: "https://example.com" }), /request_body_not_patterns contains invalid regex/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "invalid-network-mock-delay",
  target: {
    route: "/create",
    viewports: [{ name: "mobile", width: 390, height: 844 }],
    network_mocks: [{
      label: "save",
      url: "**/api/save",
      delay_ms: 60001,
    }],
  },
  checks: [{ type: "route_loaded", expected_path: "/create" }],
}, { url: "https://example.com" }), /delay_ms must be an integer from 0 to 60000/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "invalid-network-mock-response-pattern",
  target: {
    route: "/create",
    viewports: [{ name: "mobile", width: 390, height: 844 }],
    network_mocks: [{
      label: "save",
      url: "**/api/save",
      responses: [{
        status: 200,
        request_body_patterns: ["["],
        json: { ok: true },
      }],
    }],
  },
  checks: [{ type: "route_loaded", expected_path: "/create" }],
}, { url: "https://example.com" }), /responses\[0\]\.request_body_patterns contains invalid regex/);
const consoleAllowedProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "expected-negative-console-profile",
  target: {
    route: "/create",
    viewports: [{ name: "mobile", width: 390, height: 844 }],
  },
  checks: [{
    type: "no_fatal_console_errors",
    allowed_console_patterns: [
      "Failed to load resource: the server responded with a status of 503",
      "Build failed: Error: Synthetic build outage",
      "expected-negative-console-profile/resource\\.js",
    ],
    allowed_page_error_texts: ["Known app-level page error"],
  }],
}, { url: "https://example.com" });
assert.deepEqual(consoleAllowedProfile.checks[0].allowed_console_patterns, [
  "Failed to load resource: the server responded with a status of 503",
  "Build failed: Error: Synthetic build outage",
  "expected-negative-console-profile/resource\\.js",
]);
assert.deepEqual(consoleAllowedProfile.checks[0].allowed_page_error_texts, ["Known app-level page error"]);
const consoleWarningProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "warning-hygiene-profile",
  target: {
    route: "/proof/good-catches",
    viewports: [{ name: "desktop", width: 1280, height: 900 }],
  },
  checks: [{
    type: "no_console_warnings",
    allowed_console_patterns: [
      "intentional dev-mode warning",
      "cdn\\.example.com/known-warning\\.js",
    ],
  }],
}, { url: "https://example.com" });
assert.deepEqual(consoleWarningProfile.checks[0].allowed_console_patterns, [
  "intentional dev-mode warning",
  "cdn\\.example.com/known-warning\\.js",
]);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-console-allowlist",
  target: { route: "/create" },
  checks: [{ type: "no_fatal_console_errors", allowed_console_patterns: [] }],
}, { url: "https://example.com" }), /allowed_console_patterns must contain non-empty strings/);
const consoleAllowedProfileScript = buildRiddleProofProfileScript(consoleAllowedProfile);
assert.ok(consoleAllowedProfileScript.includes("matchesAllowedMessage"));
assert.ok(consoleAllowedProfileScript.includes("allowed_console_patterns"));
assert.ok(buildRiddleProofProfileScript(consoleWarningProfile).includes("no_console_warnings"));
assert.ok(RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES.includes("fill"));
assert.ok(RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES.includes("press"));
assert.ok(RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES.includes("set_input_value"));
assert.ok(RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES.includes("set_range_value"));
assert.ok(RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES.includes("assert_text_visible"));
assert.ok(RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES.includes("assert_text_absent"));
assert.ok(RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES.includes("assert_selector_count"));
assert.ok(RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES.includes("assert_window_number"));
assert.ok(RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES.includes("local_storage"));
assert.ok(RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES.includes("session_storage"));
assert.ok(RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES.includes("clear_storage"));
assert.ok(RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES.includes("clear_console"));
assert.ok(RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES.includes("dialog_response"));
assert.ok(RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES.includes("window_call"));
assert.ok(RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES.includes("window_eval"));
assert.ok(RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES.includes("window_call_until"));
assert.ok(RIDDLE_PROOF_PROFILE_SETUP_ACTION_TYPES.includes("drag"));
const formSetupProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "profile-form-storage-actions",
  target: {
    route: "/create",
    viewports: [{ name: "mobile", width: 390, height: 844 }],
    setup_actions: [
      {
        type: "clear-browser-storage",
        storage: "both",
        reload: true,
      },
      {
        type: "local-storage",
        key: "builder_tokens",
        json: { IdToken: "proof-token" },
        reload: true,
      },
      {
        type: "session-storage",
        key: "builder_session",
        value: "proof-session",
      },
      {
        type: "reset-console",
      },
      {
        type: "fill",
        selector: "input[name='prompt']",
        value: "Build a tiny maze",
      },
      {
        type: "set-input-value",
        selector: "input[name='title']",
        inputValue: "Riddle Proof Maze",
      },
      {
        type: "keyboard-press",
        key: "Enter",
      },
    ],
  },
  checks: [
    { type: "route_loaded", expected_path: "/create" },
    { type: "no_fatal_console_errors" },
  ],
}, { url: "https://example.com" });
assert.equal(formSetupProfile.target.setup_actions[0].type, "clear_storage");
assert.equal(formSetupProfile.target.setup_actions[0].storage, "both");
assert.equal(formSetupProfile.target.setup_actions[0].reload, true);
assert.equal(formSetupProfile.target.setup_actions[1].type, "local_storage");
assert.deepEqual(formSetupProfile.target.setup_actions[1].value_json, { IdToken: "proof-token" });
assert.equal(formSetupProfile.target.setup_actions[1].reload, true);
assert.equal(formSetupProfile.target.setup_actions[2].type, "session_storage");
assert.equal(formSetupProfile.target.setup_actions[2].value, "proof-session");
assert.equal(formSetupProfile.target.setup_actions[3].type, "clear_console");
assert.equal(formSetupProfile.target.setup_actions[4].value, "Build a tiny maze");
assert.equal(formSetupProfile.target.setup_actions[5].type, "set_input_value");
assert.equal(formSetupProfile.target.setup_actions[5].value, "Riddle Proof Maze");
assert.equal(formSetupProfile.target.setup_actions[6].type, "press");
assert.equal(formSetupProfile.target.setup_actions[6].key, "Enter");
const rangeSetupProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "profile-range-action",
  target: {
    route: "/games/higgs-field",
    setup_actions: [
      {
        type: "set-slider-value",
        selector: "input[type='range']",
        value: "0.500",
      },
    ],
  },
  checks: [{ type: "route_loaded", expected_path: "/games/higgs-field" }],
}, { url: "https://example.com" });
assert.equal(rangeSetupProfile.target.setup_actions[0].type, "set_range_value");
assert.equal(rangeSetupProfile.target.setup_actions[0].value, "0.500");
const rangeSetupProfileScript = buildRiddleProofProfileScript(rangeSetupProfile);
assert.ok(rangeSetupProfileScript.includes('type === "set_range_value"'));
assert.ok(rangeSetupProfileScript.includes("HTMLInputElement.prototype"));
assert.ok(rangeSetupProfileScript.includes('new Event("input"'));
assert.ok(rangeSetupProfileScript.includes('new Event("change"'));
assert.ok(rangeSetupProfileScript.includes("not_range_input"));
const dialogSetupProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "profile-dialog-response-action",
  target: {
    route: "/dashboard",
    setup_actions: [
      {
        type: "accept-dialog",
        messageText: "Are you sure?",
      },
      {
        type: "dismiss-dialog",
        messagePattern: "Cannot be undone",
      },
    ],
  },
  checks: [{ type: "route_loaded", expected_path: "/dashboard" }],
}, { url: "https://example.com" });
assert.equal(dialogSetupProfile.target.setup_actions[0].type, "dialog_response");
assert.equal(dialogSetupProfile.target.setup_actions[0].accept, true);
assert.equal(dialogSetupProfile.target.setup_actions[0].message_text, "Are you sure?");
assert.equal(dialogSetupProfile.target.setup_actions[1].type, "dialog_response");
assert.equal(dialogSetupProfile.target.setup_actions[1].accept, false);
assert.equal(dialogSetupProfile.target.setup_actions[1].message_pattern, "Cannot be undone");
const dialogSetupProfileScript = buildRiddleProofProfileScript(dialogSetupProfile);
assert.ok(dialogSetupProfileScript.includes('type === "dialog_response"'));
assert.ok(dialogSetupProfileScript.includes('page.on("dialog"'));
assert.ok(dialogSetupProfileScript.includes("dialogEvents"));
const dragSetupProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "profile-drag-action",
  target: {
    route: "/play/max-collisions",
    setup_actions: [
      {
        type: "pointer-drag",
        frame_selector: ".game-player-root iframe",
        selector: ".game-area",
        coordinate_mode: "ratio",
        from_x: 0.5,
        from_y: 0.5,
        to_x: 0.2,
        to_y: 0.5,
        pointer_type: "finger",
        duration_ms: 120,
        steps: 6,
      },
    ],
  },
  checks: [{ type: "route_loaded", expected_path: "/play/max-collisions" }],
}, { url: "https://example.com" });
assert.equal(dragSetupProfile.target.setup_actions[0].type, "drag");
assert.equal(dragSetupProfile.target.setup_actions[0].frame_selector, ".game-player-root iframe");
assert.equal(dragSetupProfile.target.setup_actions[0].coordinate_mode, "ratio");
assert.equal(dragSetupProfile.target.setup_actions[0].pointer_type, "touch");
assert.equal(dragSetupProfile.target.setup_actions[0].from_x, 0.5);
assert.equal(dragSetupProfile.target.setup_actions[0].to_x, 0.2);
assert.equal(dragSetupProfile.target.setup_actions[0].steps, 6);
const dragSetupProfileScript = buildRiddleProofProfileScript(dragSetupProfile);
assert.ok(dragSetupProfileScript.includes('type === "drag"'));
assert.ok(dragSetupProfileScript.includes("page.mouse.down"));
assert.ok(dragSetupProfileScript.includes("page.mouse.up"));
assert.ok(dragSetupProfileScript.includes("new PointerEvent"));
assert.ok(dragSetupProfileScript.includes("pointer_type"));
assert.ok(dragSetupProfileScript.includes('payload.pointerType === "touch"'));
assert.ok(dragSetupProfileScript.includes("bounding_box_unavailable"));
assert.ok(dragSetupProfileScript.includes("coordinate_mode"));
const windowCallSetupProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "profile-window-call-action",
  target: {
    route: "/games/gem-mine",
    setup_actions: [
      {
        type: "window-call",
        path: "__gemMineProofForceEscape",
        args: [true, { source: "profile" }],
        expectReturn: true,
        storeReturnTo: "__gemMineProof.lastForceEscapeResult",
        captureReturn: false,
        after_ms: 250,
        repeat: 3,
      },
    ],
  },
  checks: [{ type: "route_loaded", expected_path: "/games/gem-mine" }],
}, { url: "https://example.com" });
assert.equal(windowCallSetupProfile.target.setup_actions[0].type, "window_call");
assert.equal(windowCallSetupProfile.target.setup_actions[0].path, "__gemMineProofForceEscape");
assert.deepEqual(windowCallSetupProfile.target.setup_actions[0].args, [true, { source: "profile" }]);
assert.equal(windowCallSetupProfile.target.setup_actions[0].expect_return, true);
assert.equal(windowCallSetupProfile.target.setup_actions[0].store_return_to, "__gemMineProof.lastForceEscapeResult");
assert.equal(windowCallSetupProfile.target.setup_actions[0].capture_return, false);
assert.equal(windowCallSetupProfile.target.setup_actions[0].repeat, 3);
const windowCallSetupProfileScript = buildRiddleProofProfileScript(windowCallSetupProfile);
assert.ok(windowCallSetupProfileScript.includes('type === "window_call"'));
assert.ok(windowCallSetupProfileScript.includes("missing_function"));
assert.ok(windowCallSetupProfileScript.includes("unexpected_return_value"));
assert.ok(windowCallSetupProfileScript.includes("setupValuesEqual"));
assert.ok(windowCallSetupProfileScript.includes("storeWindowReturn"));
assert.ok(windowCallSetupProfileScript.includes("return_stored_to"));
assert.ok(windowCallSetupProfileScript.includes("return_captured"));
assert.ok(windowCallSetupProfileScript.includes("capture_return"));
assert.ok(windowCallSetupProfileScript.includes("repeat_index"));
assert.ok(windowCallSetupProfileScript.includes("repeat_count"));
assert.ok(windowCallSetupProfileScript.includes("profileSetupWindowCallReceipts"));
assert.ok(windowCallSetupProfileScript.includes("window_call_total"));
assert.ok(windowCallSetupProfileScript.includes("window_call_stored_total"));
const windowEvalSetupProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "profile-window-eval-action",
  target: {
    route: "/games/emoji-mind-gym",
    setup_actions: [
      {
        type: "browser-evaluate",
        script: "const sum = args[0] + args[1]; return { ok: sum === 5, sum };",
        args: [2, 3],
        expectReturn: { ok: true, sum: 5 },
        storeReturnTo: "__proof.lastEval",
        captureReturn: true,
      },
    ],
  },
  checks: [{ type: "route_loaded", expected_path: "/games/emoji-mind-gym" }],
}, { url: "https://example.com" });
assert.equal(windowEvalSetupProfile.target.setup_actions[0].type, "window_eval");
assert.equal(windowEvalSetupProfile.target.setup_actions[0].script, "const sum = args[0] + args[1]; return { ok: sum === 5, sum };");
assert.deepEqual(windowEvalSetupProfile.target.setup_actions[0].args, [2, 3]);
assert.deepEqual(windowEvalSetupProfile.target.setup_actions[0].expect_return, { ok: true, sum: 5 });
assert.equal(windowEvalSetupProfile.target.setup_actions[0].store_return_to, "__proof.lastEval");
assert.equal(windowEvalSetupProfile.target.setup_actions[0].capture_return, undefined);
const windowEvalSetupProfileScript = buildRiddleProofProfileScript(windowEvalSetupProfile);
assert.ok(windowEvalSetupProfileScript.includes('type === "window_eval"'));
assert.ok(windowEvalSetupProfileScript.includes("setupEvaluateWindowScript"));
assert.ok(windowEvalSetupProfileScript.includes("missing_evaluator"));
assert.ok(windowEvalSetupProfileScript.includes("script_threw"));
assert.ok(windowEvalSetupProfileScript.includes("script_length"));
assert.ok(windowEvalSetupProfileScript.includes("profileSetupWindowEvalReceipts"));
assert.ok(windowEvalSetupProfileScript.includes("window_eval_total"));
assert.ok(!windowEvalSetupProfileScript.includes("new Function"));
assert.ok(!windowEvalSetupProfileScript.includes('";\\\\n" + body + "\\\\n})()"'));
const windowCallUntilSetupProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "profile-window-call-until-action",
  target: {
    route: "/games/circle-maze",
    setup_actions: [
      {
        type: "window-call-until",
        path: "__circleMazeProofStep",
        args: [200],
        until_path: "__circleMazeProof.won",
        until_expected_value: true,
        max_calls: 15,
        interval_ms: 50,
        timeout_ms: 10000,
      },
    ],
  },
  checks: [{ type: "route_loaded", expected_path: "/games/circle-maze" }],
}, { url: "https://example.com" });
assert.equal(windowCallUntilSetupProfile.target.setup_actions[0].type, "window_call_until");
assert.equal(windowCallUntilSetupProfile.target.setup_actions[0].path, "__circleMazeProofStep");
assert.deepEqual(windowCallUntilSetupProfile.target.setup_actions[0].args, [200]);
assert.equal(windowCallUntilSetupProfile.target.setup_actions[0].until_path, "__circleMazeProof.won");
assert.equal(windowCallUntilSetupProfile.target.setup_actions[0].until_expected_value, true);
assert.equal(windowCallUntilSetupProfile.target.setup_actions[0].max_calls, 15);
assert.equal(windowCallUntilSetupProfile.target.setup_actions[0].interval_ms, 50);
const windowCallUntilSetupProfileScript = buildRiddleProofProfileScript(windowCallUntilSetupProfile);
assert.ok(windowCallUntilSetupProfileScript.includes('type === "window_call_until"'));
assert.ok(windowCallUntilSetupProfileScript.includes("setupCallWindowFunction"));
assert.ok(windowCallUntilSetupProfileScript.includes("until_condition_not_met"));
assert.ok(windowCallUntilSetupProfileScript.includes("call_count"));
assert.ok(windowCallUntilSetupProfileScript.includes("window_call_until_total"));
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-window-call",
  target: {
    route: "/",
    setup_actions: [{ type: "window-call" }],
  },
  checks: [{ type: "route_loaded", expected_path: "/" }],
}, { url: "https://example.com" }), /window_call requires path/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-window-call-args",
  target: {
    route: "/",
    setup_actions: [{ type: "window-call", path: "__proof.force", args: "bad" }],
  },
  checks: [{ type: "route_loaded", expected_path: "/" }],
}, { url: "https://example.com" }), /window_call\/window_eval args must be an array/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-window-eval",
  target: {
    route: "/",
    setup_actions: [{ type: "window-eval" }],
  },
  checks: [{ type: "route_loaded", expected_path: "/" }],
}, { url: "https://example.com" }), /window_eval requires script/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-window-eval-args",
  target: {
    route: "/",
    setup_actions: [{ type: "window-eval", script: "return true;", args: "bad" }],
  },
  checks: [{ type: "route_loaded", expected_path: "/" }],
}, { url: "https://example.com" }), /window_call\/window_eval args must be an array/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-window-call-until-path",
  target: {
    route: "/",
    setup_actions: [{ type: "window-call-until", path: "__proof.step", until_expected_value: true, max_calls: 3 }],
  },
  checks: [{ type: "route_loaded", expected_path: "/" }],
}, { url: "https://example.com" }), /window_call_until requires until_path/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-window-call-until-expected",
  target: {
    route: "/",
    setup_actions: [{ type: "window-call-until", path: "__proof.step", until_path: "__proof.done", max_calls: 3 }],
  },
  checks: [{ type: "route_loaded", expected_path: "/" }],
}, { url: "https://example.com" }), /window_call_until requires until_expected_value/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-window-call-until-max",
  target: {
    route: "/",
    setup_actions: [{ type: "window-call-until", path: "__proof.step", until_path: "__proof.done", until_expected_value: true, max_calls: 101 }],
  },
  checks: [{ type: "route_loaded", expected_path: "/" }],
}, { url: "https://example.com" }), /max_calls must be an integer from 1 to 100/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-setup-repeat",
  target: {
    route: "/",
    setup_actions: [{ type: "wait", ms: 10, repeat: 101 }],
  },
  checks: [{ type: "route_loaded", expected_path: "/" }],
}, { url: "https://example.com" }), /repeat must be an integer from 1 to 100/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-setup-click-count",
  target: {
    route: "/",
    setup_actions: [{ type: "click", selector: "button", click_count: 11 }],
  },
  checks: [{ type: "route_loaded", expected_path: "/" }],
}, { url: "https://example.com" }), /click_count must be an integer from 1 to 10/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-setup-click-count-type",
  target: {
    route: "/",
    setup_actions: [{ type: "wait", ms: 10, click_count: 2 }],
  },
  checks: [{ type: "route_loaded", expected_path: "/" }],
}, { url: "https://example.com" }), /click_count is only supported for click actions/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-range-value",
  target: {
    route: "/",
    setup_actions: [{ type: "set-range-value", selector: "input[type='range']" }],
  },
  checks: [{ type: "route_loaded", expected_path: "/" }],
}, { url: "https://example.com" }), /set_range_value requires value/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-drag-coordinates",
  target: {
    route: "/",
    setup_actions: [{ type: "drag", selector: ".game-area", from_x: 0, from_y: 0, to_x: 1 }],
  },
  checks: [{ type: "route_loaded", expected_path: "/" }],
}, { url: "https://example.com" }), /drag requires from_x, from_y, to_x, and to_y/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-drag-ratio",
  target: {
    route: "/",
    setup_actions: [{ type: "drag", selector: ".game-area", coordinate_mode: "ratio", from_x: 0, from_y: 0, to_x: 2, to_y: 1 }],
  },
  checks: [{ type: "route_loaded", expected_path: "/" }],
}, { url: "https://example.com" }), /drag ratio coordinates must be between 0 and 1/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-drag-pointer",
  target: {
    route: "/",
    setup_actions: [{ type: "drag", selector: ".game-area", pointer_type: "trackpad", from_x: 0, from_y: 0, to_x: 2, to_y: 1 }],
  },
  checks: [{ type: "route_loaded", expected_path: "/" }],
}, { url: "https://example.com" }), /pointer_type trackpad is not supported/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-click-pointer",
  target: {
    route: "/",
    setup_actions: [{ type: "click", selector: ".game-area", pointer_type: "touch" }],
  },
  checks: [{ type: "route_loaded", expected_path: "/" }],
}, { url: "https://example.com" }), /pointer_type is only supported for drag actions/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-drag-steps",
  target: {
    route: "/",
    setup_actions: [{ type: "drag", selector: ".game-area", from_x: 0, from_y: 0, to_x: 20, to_y: 20, steps: 0 }],
  },
  checks: [{ type: "route_loaded", expected_path: "/" }],
}, { url: "https://example.com" }), /steps must be an integer from 1 to 100/);
const setupAssertionProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "profile-setup-assertions",
  target: {
    route: "/",
    setup_actions: [
      {
        type: "assert-text-visible",
        selector: "body",
        text: "Fresh Row",
      },
      {
        type: "assert-text-absent",
        selector: "body",
        text: "Stale Row",
        timeout_ms: 1000,
      },
      {
        type: "assert-selector-count",
        selector: "a[href='/play/fresh-row']",
        expectedCount: 1,
      },
      {
        type: "assert-window-value",
        state_path: "__proofState.ready",
        expected: true,
      },
      {
        type: "assert-window-number",
        state_path: "__proofState.distance",
        min_value: 1,
        max_value: 100,
      },
    ],
  },
  checks: [{ type: "route_loaded", expected_path: "/" }],
}, { url: "https://example.com" });
assert.equal(setupAssertionProfile.target.setup_actions[0].type, "assert_text_visible");
assert.equal(setupAssertionProfile.target.setup_actions[1].type, "assert_text_absent");
assert.equal(setupAssertionProfile.target.setup_actions[2].type, "assert_selector_count");
assert.equal(setupAssertionProfile.target.setup_actions[2].expected_count, 1);
assert.equal(setupAssertionProfile.target.setup_actions[3].type, "assert_window_value");
assert.equal(setupAssertionProfile.target.setup_actions[3].path, "__proofState.ready");
assert.equal(setupAssertionProfile.target.setup_actions[3].expected_value, true);
assert.equal(setupAssertionProfile.target.setup_actions[4].type, "assert_window_number");
assert.equal(setupAssertionProfile.target.setup_actions[4].path, "__proofState.distance");
assert.equal(setupAssertionProfile.target.setup_actions[4].min_value, 1);
assert.equal(setupAssertionProfile.target.setup_actions[4].max_value, 100);
const setupAssertionProfileScript = buildRiddleProofProfileScript(setupAssertionProfile);
assert.ok(setupAssertionProfileScript.includes('type === "assert_selector_count"'));
assert.ok(setupAssertionProfileScript.includes('type === "assert_text_visible" || type === "assert_text_absent"'));
assert.ok(setupAssertionProfileScript.includes("target.innerText"));
assert.ok(setupAssertionProfileScript.includes("normalizeSetupMatchText"));
assert.ok(setupAssertionProfileScript.includes("normalizeSetupMatchText(rawSample).includes(normalizeSetupMatchText(expected))"));
assert.ok(setupAssertionProfileScript.includes("case_insensitive_text"));
assert.ok(setupAssertionProfileScript.includes('type === "assert_window_value"'));
assert.ok(setupAssertionProfileScript.includes('type === "assert_window_number"'));
assert.ok(setupAssertionProfileScript.includes("setupReadWindowValue"));
assert.ok(setupAssertionProfileScript.includes("number_below_min"));
assert.ok(setupAssertionProfileScript.includes("selector_count_mismatch"));
assert.ok(setupAssertionProfileScript.includes("text_still_present"));
assert.ok(setupAssertionProfileScript.includes("unexpected_value"));
const frameSetupActionProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "profile-frame-setup-actions",
  target: {
    route: "/play/hot-path",
    setup_actions: [
      {
        type: "wait_for_selector",
        frameSelector: ".game-player-root iframe",
        selector: ".start-btn",
      },
      {
        type: "click",
        frame_selector: ".game-player-root iframe",
        frameIndex: 0,
        selector: ".start-btn",
        text: "Start Game",
      },
      {
        type: "assert_text_visible",
        frame_selector: ".game-player-root iframe",
        selector: "body",
        text: "Player 1's Turn",
      },
    ],
  },
  checks: [{ type: "route_loaded", expected_path: "/play/hot-path" }],
}, { url: "https://example.com" });
assert.equal(frameSetupActionProfile.target.setup_actions[0].frame_selector, ".game-player-root iframe");
assert.equal(frameSetupActionProfile.target.setup_actions[1].frame_selector, ".game-player-root iframe");
assert.equal(frameSetupActionProfile.target.setup_actions[1].frame_index, 0);
const frameSetupActionProfileScript = buildRiddleProofProfileScript(frameSetupActionProfile);
assert.ok(frameSetupActionProfileScript.includes("setupActionScope"));
assert.ok(frameSetupActionProfileScript.includes("setupFrameSelector"));
assert.ok(frameSetupActionProfileScript.includes("contentFrame"));
assert.ok(frameSetupActionProfileScript.includes("frame_selector_not_found"));
assert.ok(frameSetupActionProfileScript.includes("scope.context.locator"));
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-setup-assertion",
  target: {
    route: "/",
    setup_actions: [{ type: "assert-selector-count", selector: "a" }],
  },
  checks: [{ type: "route_loaded", expected_path: "/" }],
}, { url: "https://example.com" }), /assert_selector_count requires non-negative integer expected_count/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-window-value",
  target: {
    route: "/",
    setup_actions: [{ type: "assert-window-value", path: "__proofState.ready" }],
  },
  checks: [{ type: "route_loaded", expected_path: "/" }],
}, { url: "https://example.com" }), /assert_window_value requires expected_value/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-window-number",
  target: {
    route: "/",
    setup_actions: [{ type: "assert-window-number", path: "__proofState.distance" }],
  },
  checks: [{ type: "route_loaded", expected_path: "/" }],
}, { url: "https://example.com" }), /assert_window_number requires expected_value, min_value, or max_value/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-window-number-expected",
  target: {
    route: "/",
    setup_actions: [{ type: "assert-window-number", path: "__proofState.distance", expected: "far" }],
  },
  checks: [{ type: "route_loaded", expected_path: "/" }],
}, { url: "https://example.com" }), /assert_window_number expected_value must be a finite number/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-frame-index",
  target: {
    route: "/",
    setup_actions: [{ type: "click", frame_selector: ".embed iframe", frame_index: -1, selector: "button" }],
  },
  checks: [{ type: "route_loaded", expected_path: "/" }],
}, { url: "https://example.com" }), /frame_index must be a non-negative integer/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-press",
  target: {
    route: "/",
    setup_actions: [{ type: "press" }],
  },
  checks: [{ type: "route_loaded", expected_path: "/" }],
}, { url: "https://example.com" }), /press requires key/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-storage",
  target: {
    route: "/create",
    setup_actions: [{ type: "clear-storage", storage: "cookies" }],
  },
  checks: [{ type: "route_loaded", expected_path: "/create" }],
}, { url: "https://example.com" }), /storage cookies is not supported/);
const formSetupProfileScript = buildRiddleProofProfileScript(formSetupProfile);
assert.ok(formSetupProfileScript.includes("setupActionValue"));
assert.ok(formSetupProfileScript.includes("setupHasOwn"));
assert.ok(formSetupProfileScript.includes("page.keyboard.press"));
assert.ok(formSetupProfileScript.includes("window.localStorage"));
assert.ok(formSetupProfileScript.includes("window.sessionStorage"));
assert.ok(formSetupProfileScript.includes("storage.setItem"));
assert.ok(formSetupProfileScript.includes('type === "clear_storage"'));
assert.ok(formSetupProfileScript.includes('type === "clear_console"'));
assert.ok(formSetupProfileScript.includes("cleared_console_event_count"));
assert.ok(formSetupProfileScript.includes("cleared_page_error_count"));
assert.ok(formSetupProfileScript.includes('type === "fill" || type === "set_input_value"'));
assert.ok(formSetupProfileScript.includes("click(clickOptions)"));
assert.ok(formSetupProfileScript.includes("noWaitAfter: true"));
assert.ok(formSetupProfileScript.includes("value_length"));
assert.ok(!formSetupProfileScript.includes("Object.prototype"));
const routeInventoryProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "homepage-route-inventory",
  target: {
    route: "/",
    viewports: [{ name: "desktop", width: 1280, height: 900 }],
    wait_for_selector: ".game-table",
  },
  checks: [
    {
      type: "route_inventory",
      expected_routes: [
        { name: "Gem Mine", path: "/games/gem-mine" },
        { name: "Coin Clicker", path: "/games/coin-clicker" },
      ],
      link_selector: "a[href^='/games/']",
      source_selector: ".game-table",
      route_path_prefix: "/games/",
      timeout_ms: 12000,
      run_all_viewports: true,
    },
    { type: "no_fatal_console_errors" },
  ],
}, { url: "https://example.com" });
assert.equal(routeInventoryProfile.checks[0].type, "route_inventory");
assert.equal(routeInventoryProfile.checks[0].expected_routes.length, 2);
assert.equal(routeInventoryProfile.checks[0].run_direct_routes, true);
assert.equal(routeInventoryProfile.checks[0].run_clickthroughs, true);
assert.equal(routeInventoryProfile.checks[0].run_all_viewports, true);
assert.equal(routeInventoryProfile.checks[0].link_selector, "a[href^='/games/']");
assert.equal(routeInventoryProfile.checks[0].source_selector, ".game-table");
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-route-inventory",
  target: { route: "/" },
  checks: [{ type: "route_inventory", expected_routes: [] }],
}, { url: "https://example.com" }), /expected_routes must be a non-empty array/);
const routeInventoryProfileScript = buildRiddleProofProfileScript(routeInventoryProfile);
assert.ok(routeInventoryProfileScript.includes("collectRouteInventory"));
assert.ok(routeInventoryProfileScript.includes("riddle-proof.route-inventory.v1"));
assert.ok(routeInventoryProfileScript.includes("source_link_clickthrough_kept_source_surface"));
assert.ok(routeInventoryProfileScript.includes("waitForInventoryLinkIndex"));
assert.ok(routeInventoryProfileScript.includes("await waitForInventoryLinkIndex(check, expectedRoute.path)"));
assert.ok(routeInventoryProfileScript.includes("route_inventory: routeInventory"));
assert.ok(routeInventoryProfileScript.includes("home_unique_game_link_count"));
assert.ok(routeInventoryProfileScript.includes("source_unique_link_count"));
assert.ok(routeInventoryProfileScript.includes("source_link_scope"));
assert.ok(routeInventoryProfileScript.includes("source_candidate_count"));
assert.ok(routeInventoryProfileScript.includes("duplicate_source_link_count"));
assert.ok(routeInventoryProfileScript.includes("routeInventoryCheck.run_all_viewports"));
assert.ok(routeInventoryProfileScript.includes("viewport_count: inventories.length"));
assert.ok(routeInventoryProfileScript.includes("inventoryScreenshotLabel"));
assert.ok(routeInventoryProfileScript.includes('check.run_all_viewports ? "-" + inventorySlugFromViewport(viewport) : ""'));
const linkStatusProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "public-artifact-link-status",
  target: {
    route: "/proof/good-catches",
    viewports: [{ name: "desktop", width: 1280, height: 900 }],
  },
  checks: [{
    type: "artifact_link_status",
    selector: "a[href*='/proof/good-catches/artifacts/'], img[src*='/proof/good-catches/artifacts/']",
    expected_count: 2,
    allowed_statuses: [200, 304],
    max_links: 150,
    same_origin_only: true,
    require_nonzero_bytes: true,
    min_bytes: 32,
    allowed_content_types: ["image/*", "application/json"],
  }],
}, { url: "https://example.com" });
assert.ok(RIDDLE_PROOF_PROFILE_CHECK_TYPES.includes("link_status"));
assert.ok(RIDDLE_PROOF_PROFILE_CHECK_TYPES.includes("artifact_link_status"));
assert.equal(linkStatusProfile.checks[0].type, "artifact_link_status");
assert.equal(linkStatusProfile.checks[0].expected_count, 2);
assert.deepEqual(linkStatusProfile.checks[0].allowed_statuses, [200, 304]);
assert.equal(linkStatusProfile.checks[0].max_links, 150);
assert.equal(linkStatusProfile.checks[0].same_origin_only, true);
assert.equal(linkStatusProfile.checks[0].require_nonzero_bytes, true);
assert.equal(linkStatusProfile.checks[0].min_bytes, 32);
assert.deepEqual(linkStatusProfile.checks[0].allowed_content_types, ["image/*", "application/json"]);
const linkStatusProfileScript = buildRiddleProofProfileScript(linkStatusProfile);
assert.ok(linkStatusProfileScript.includes("collectLinkStatus"));
assert.ok(linkStatusProfileScript.includes("riddle-proof.link-status.v1"));
assert.ok(linkStatusProfileScript.includes("link_statuses"));
assert.ok(linkStatusProfileScript.includes("allowed_content_types"));
assert.ok(linkStatusProfileScript.includes("min_bytes"));
assert.ok(linkStatusProfileScript.includes("compactLinkProbeResults"));
assert.ok(linkStatusProfileScript.includes("results_compacted"));
assert.ok(linkStatusProfileScript.includes("link_status: currentViewports"));
assert.ok(linkStatusProfileScript.includes("profileCheckAppliesToViewport(check, viewport)"));
assert.ok(linkStatusProfileScript.includes("waitForAnyVisibleSelector"));
const httpStatusProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "direct-api-endpoint-status",
  target: {
    route: "/docs/scrape",
    viewports: [{ name: "desktop", width: 1280, height: 900 }],
  },
  checks: [{
    type: "http_status",
    label: "scrape direct endpoint auth gate",
    url: "https://api.example.com/v1/scrape",
    method: "post",
    body_json: {},
    expected_status: 401,
    allowed_content_types: ["application/json"],
    require_nonzero_bytes: true,
    min_bytes: 8,
    body_contains: ["UNAUTHORIZED"],
    body_not_contains: ["FORBIDDEN"],
    body_not_patterns: ['"debug"\\s*:'],
    body_json_assertions: [
      { label: "auth code", path: "error.code", equals: "UNAUTHORIZED" },
      { label: "debug absent", path: "debug", exists: false },
    ],
  }],
}, { url: "https://example.com" });
assert.ok(RIDDLE_PROOF_PROFILE_CHECK_TYPES.includes("http_status"));
assert.equal(httpStatusProfile.checks[0].type, "http_status");
assert.equal(httpStatusProfile.checks[0].url, "https://api.example.com/v1/scrape");
assert.equal(httpStatusProfile.checks[0].method, "POST");
assert.deepEqual(httpStatusProfile.checks[0].body_json, {});
assert.equal(httpStatusProfile.checks[0].expected_status, 401);
assert.equal(httpStatusProfile.checks[0].require_nonzero_bytes, true);
assert.equal(httpStatusProfile.checks[0].min_bytes, 8);
assert.deepEqual(httpStatusProfile.checks[0].body_contains, ["UNAUTHORIZED"]);
assert.deepEqual(httpStatusProfile.checks[0].body_not_contains, ["FORBIDDEN"]);
assert.deepEqual(httpStatusProfile.checks[0].body_not_patterns, ['"debug"\\s*:']);
assert.deepEqual(httpStatusProfile.checks[0].body_json_assertions, [
  { label: "auth code", path: "error.code", equals: "UNAUTHORIZED" },
  { label: "debug absent", path: "debug", exists: false },
]);
const httpStatusProfileScript = buildRiddleProofProfileScript(httpStatusProfile);
assert.ok(httpStatusProfileScript.includes("collectHttpStatus"));
assert.ok(httpStatusProfileScript.includes("riddle-proof.http-status.v1"));
assert.ok(httpStatusProfileScript.includes("http_statuses"));
assert.ok(httpStatusProfileScript.includes("http_status: currentViewports"));
assert.ok(httpStatusProfileScript.includes("body_contains"));
assert.ok(httpStatusProfileScript.includes("body_not_contains"));
assert.ok(httpStatusProfileScript.includes("body_not_patterns"));
assert.ok(httpStatusProfileScript.includes("body_not_contains_found"));
assert.ok(httpStatusProfileScript.includes("body_not_patterns_found"));
assert.ok(httpStatusProfileScript.includes("body_json_assertions"));
assert.ok(httpStatusProfileScript.includes("joinMountedRoutePath(mountPrefix, requested.pathname)"));
const selectorTextOrderProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "table-order-profile",
  target: {
    route: "/",
    viewports: [{ name: "desktop", width: 1280, height: 900 }],
  },
  checks: [{
    type: "selector_text_order",
    selector: ".game-table tbody tr",
    expected_texts: ["AAA Alpha", "MMM Middle", "ZZZ Omega"],
  }],
}, { url: "https://example.com" });
assert.equal(selectorTextOrderProfile.checks[0].type, "selector_text_order");
assert.deepEqual(selectorTextOrderProfile.checks[0].expected_texts, ["AAA Alpha", "MMM Middle", "ZZZ Omega"]);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-table-order-profile",
  target: { route: "/" },
  checks: [{ type: "selector_text_order", selector: ".rows", expected_texts: [] }],
}, { url: "https://example.com" }), /expected_texts must be a non-empty array/);
const selectorTextOrderScript = buildRiddleProofProfileScript(selectorTextOrderProfile);
assert.ok(selectorTextOrderScript.includes("selectorTextSequence"));
assert.ok(selectorTextOrderScript.includes("text_sequences"));
const frameProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "community-frame-profile",
  target: {
    route: "/play/hot-path",
    viewports: [
      { name: "phone", width: 390, height: 844 },
      { name: "desktop", width: 1280, height: 900 },
    ],
  },
  checks: [
    { type: "route_loaded", expected_path: "/play/hot-path" },
    { type: "selector_count_at_least", selector: ".game-player-root iframe", min_count: 1 },
    { type: "frame_text_visible", selector: ".game-player-root iframe", text: "Hot Path" },
    { type: "frame_url_equals", selector: ".game-player-root iframe", expected_url: "https://example.com/embed/hot-path" },
    { type: "frame_url_matches", selector: ".game-player-root iframe", pattern: "/embed/hot-path$" },
    { type: "frame_no_horizontal_overflow", selector: ".game-player-root iframe", max_overflow_px: 1 },
  ],
}, { url: "https://example.com" });
assert.ok(RIDDLE_PROOF_PROFILE_CHECK_TYPES.includes("frame_text_visible"));
assert.ok(RIDDLE_PROOF_PROFILE_CHECK_TYPES.includes("frame_url_equals"));
assert.ok(RIDDLE_PROOF_PROFILE_CHECK_TYPES.includes("frame_url_matches"));
assert.ok(RIDDLE_PROOF_PROFILE_CHECK_TYPES.includes("frame_no_horizontal_overflow"));
assert.ok(RIDDLE_PROOF_PROFILE_CHECK_TYPES.includes("url_search_param_equals"));
assert.ok(RIDDLE_PROOF_PROFILE_CHECK_TYPES.includes("url_search_param_absent"));
assert.equal(frameProfile.checks[2].type, "frame_text_visible");
assert.equal(frameProfile.checks[3].type, "frame_url_equals");
assert.equal(frameProfile.checks[3].expected_url, "https://example.com/embed/hot-path");
assert.equal(frameProfile.checks[5].max_overflow_px, 1);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-frame-profile",
  target: { route: "/play/hot-path" },
  checks: [{ type: "frame_text_visible", selector: ".game-player-root iframe" }],
}, { url: "https://example.com" }), /frame_text_visible requires text or pattern/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-frame-url-equals-profile",
  target: { route: "/play/hot-path" },
  checks: [{ type: "frame_url_equals", selector: ".game-player-root iframe" }],
}, { url: "https://example.com" }), /frame_url_equals requires expected_url/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-frame-url-matches-profile",
  target: { route: "/play/hot-path" },
  checks: [{ type: "frame_url_matches", selector: ".game-player-root iframe" }],
}, { url: "https://example.com" }), /frame_url_matches requires pattern/);
assert.throws(() => normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "bad-frame-overflow-profile",
  target: { route: "/play/hot-path" },
  checks: [{ type: "frame_no_horizontal_overflow" }],
}, { url: "https://example.com" }), /frame_no_horizontal_overflow requires selector/);
const frameProfileScript = buildRiddleProofProfileScript(frameProfile);
assert.ok(frameProfileScript.includes("frameEvidence"));
assert.ok(frameProfileScript.includes("contentFrame"));
assert.ok(frameProfileScript.includes("frames[check.selector]"));
assert.ok(frameProfileScript.includes("frame_url_equals"));
assert.ok(frameProfileScript.includes("frame_url_matches"));
assert.ok(frameProfileScript.includes("frame_no_horizontal_overflow"));
const profileEvidence = {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: "pricing-page-basic",
  target_url: "https://example.com/pricing",
  baseline_policy: "invariant_only",
  captured_at: "2026-05-10T00:00:00.000Z",
  viewports: [
    {
      name: "mobile",
      width: 390,
      height: 844,
      route: { requested: "https://example.com/pricing", observed: "/pricing/", expected_path: "/pricing", matched: false, http_status: 200 },
      body_text_sample: "Pricing Start building",
      overflow_px: 0,
      selectors: {
        "[data-testid='pricing-cards']": { count: 1, visible_count: 1 },
        ".game-player-root iframe": { count: 0, visible_count: 0 },
      },
      text_sequences: {
        "[data-testid='pricing-cards']": {
          count: 1,
          visible_count: 1,
          texts: [`Pricing ${"x".repeat(260)}`],
          visible_texts: [`Pricing ${"x".repeat(260)}`],
          match_texts: [`Pricing ${"x".repeat(260)} Start building`],
          visible_match_texts: [`Pricing ${"x".repeat(260)} Start building`],
        },
      },
      text_matches: { "text:Start building": true, "text:Desktop-only copy": false },
      observations: {
        "selector:[data-testid='pricing-cards']|text:Start building|within:1500": {
          matched: true,
          timeout_ms: 1500,
          elapsed_ms: 120,
          attempts: 3,
          selector_count: 1,
          visible_count: 1,
          matched_count: 1,
          sample: "Pricing Start building",
        },
      },
      setup_action_results: [
        { ok: true, action: "click", selector: "[data-testid='open-pricing']", click_count: 2 },
        { ok: true, action: "screenshot", label: "after-click", screenshot_label: "pricing-page-basic-mobile-after-click" },
        { ok: true, action: "wait_for_text", selector: "body", text: "Start building" },
      ],
      screenshot_label: "pricing-page-basic-mobile",
    },
    {
      name: "desktop",
      width: 1440,
      height: 1000,
      route: { requested: "https://example.com/pricing", observed: "/pricing", expected_path: "/pricing", matched: true, http_status: 200 },
      body_text_sample: "Pricing Start building Desktop-only copy",
      overflow_px: 0,
      selectors: {
        "[data-testid='pricing-cards']": { count: 1, visible_count: 1 },
        ".game-player-root iframe": { count: 0, visible_count: 0 },
      },
      text_sequences: {
        "[data-testid='pricing-cards']": {
          count: 1,
          visible_count: 1,
          texts: [`Pricing ${"x".repeat(260)}`],
          visible_texts: [`Pricing ${"x".repeat(260)}`],
          match_texts: [`Pricing ${"x".repeat(260)} Start building Desktop-only copy`],
          visible_match_texts: [`Pricing ${"x".repeat(260)} Start building Desktop-only copy`],
        },
      },
      text_matches: { "text:Start building": true, "text:Desktop-only copy": true },
      observations: {
        "selector:[data-testid='pricing-cards']|text:Start building|within:1500": {
          matched: true,
          timeout_ms: 1500,
          elapsed_ms: 80,
          attempts: 2,
          selector_count: 1,
          visible_count: 1,
          matched_count: 1,
          sample: "Pricing Start building Desktop-only copy",
        },
      },
      setup_action_results: [
        { ok: true, action: "click", selector: "[data-testid='open-pricing']" },
        { ok: true, action: "wait_for_text", selector: "body", text: "Start building" },
      ],
      screenshot_label: "pricing-page-basic-desktop",
    },
  ],
  console: { events: [], fatal_count: 0 },
  page_errors: [],
  dom_summary: { viewport_count: 2 },
};
const profileAssessment = assessRiddleProofProfileEvidence(profile, profileEvidence);
assert.equal(profileAssessment.status, "passed");
assert.equal(profileAssessment.route.matched, true);
assert.equal(profileAssessment.checks.length, 13);
const profileSetupCheck = profileAssessment.checks.find((check) => check.type === "setup_actions_succeeded");
assert.equal(profileSetupCheck.status, "passed");
assert.equal(profileSetupCheck.evidence.setup_summary.viewport_count, 2);
assert.equal(profileSetupCheck.evidence.setup_summary.action_count, 2);
assert.equal(profileSetupCheck.evidence.setup_summary.final_screenshot_count, 2);
assert.equal(profileSetupCheck.evidence.setup_summary.final_screenshot_mode, "viewport");
assert.equal(profileSetupCheck.evidence.setup_summary.viewports[0].name, "mobile");
assert.equal(profileSetupCheck.evidence.setup_summary.viewports[0].observed_path, "/pricing/");
assert.equal(profileSetupCheck.evidence.setup_summary.viewports[0].final_screenshot_full_page, false);
assert.equal(profileSetupCheck.evidence.setup_summary.viewports[0].action_counts.click, 1);
assert.equal(profileSetupCheck.evidence.setup_summary.viewports[0].action_counts.screenshot, 1);
assert.equal(profileSetupCheck.evidence.setup_summary.viewports[0].action_counts.wait_for_text, 1);
assert.deepEqual(profileSetupCheck.evidence.setup_summary.viewports[0].setup_screenshots, ["pricing-page-basic-mobile-after-click"]);
assert.equal(profileSetupCheck.evidence.setup_summary.viewports[0].clicked_total, 1);
assert.equal(profileSetupCheck.evidence.setup_summary.viewports[0].clicked_truncated, false);
assert.equal(profileSetupCheck.evidence.setup_summary.viewports[0].click_count_action_total, 1);
assert.equal(profileSetupCheck.evidence.setup_summary.viewports[0].click_count_value_total, 2);
assert.equal(profileSetupCheck.evidence.setup_summary.viewports[0].clicked[0].selector, "[data-testid='open-pricing']");
assert.equal(profileSetupCheck.evidence.setup_summary.viewports[0].clicked[0].click_count, 2);
assert.equal(profileSetupCheck.evidence.setup_summary.viewports[0].text_samples[0].text, "Start building");
const longClickProfileAssessment = assessRiddleProofProfileEvidence(profile, {
  ...profileEvidence,
  viewports: [{
    ...profileEvidence.viewports[0],
    setup_action_results: Array.from({ length: 10 }, (_, index) => ({
      ok: true,
      action: "click",
      ordinal: index,
      selector: `[data-click='${index}']`,
      text: `Click ${index}`,
    })),
  }, profileEvidence.viewports[1]],
});
const longClickSummary = longClickProfileAssessment.checks
  .find((check) => check.type === "setup_actions_succeeded")
  .evidence.setup_summary.viewports[0];
assert.equal(longClickSummary.clicked_total, 10);
assert.equal(longClickSummary.clicked_truncated, true);
assert.deepEqual(longClickSummary.clicked.map((item) => item.selector), [
  "[data-click='0']",
  "[data-click='1']",
  "[data-click='2']",
  "[data-click='3']",
  "[data-click='6']",
  "[data-click='7']",
  "[data-click='8']",
  "[data-click='9']",
]);
assert.equal(profileAssessment.checks.find((check) => check.type === "selector_absent").status, "passed");
assert.equal(profileAssessment.checks.find((check) => check.type === "selector_count_equals").status, "passed");
const selectorTextVisibleAssessment = profileAssessment.checks.find((check) => check.type === "selector_text_visible");
assert.equal(selectorTextVisibleAssessment.status, "passed");
assert.equal(selectorTextVisibleAssessment.evidence.selector, "[data-testid='pricing-cards']");
assert.deepEqual(selectorTextVisibleAssessment.evidence.viewports.map((viewport) => viewport.matched_count), [1, 1]);
assert.equal(profileAssessment.checks.find((check) => check.type === "selector_text_absent").status, "passed");
const observeWithinAssessment = profileAssessment.checks.find((check) => check.type === "observe_within");
assert.equal(observeWithinAssessment.status, "passed");
assert.equal(observeWithinAssessment.evidence.timeout_ms, 1500);
assert.deepEqual(observeWithinAssessment.evidence.viewports.map((viewport) => viewport.elapsed_ms), [120, 80]);
const desktopOnlyAssessment = profileAssessment.checks.find((check) => check.evidence?.text === "Desktop-only copy");
assert.equal(desktopOnlyAssessment.status, "passed");
assert.deepEqual(desktopOnlyAssessment.evidence.matches, [true]);
assert.deepEqual(profileAssessment.artifacts.screenshots, [
  "pricing-page-basic-mobile",
  "pricing-page-basic-mobile-after-click",
  "pricing-page-basic-desktop",
]);
const failedSelectorAbsentAssessment = assessRiddleProofProfileEvidence(profile, {
  ...profileEvidence,
  viewports: [{
    ...profileEvidence.viewports[0],
    selectors: {
      ...profileEvidence.viewports[0].selectors,
      ".game-player-root iframe": { count: 1, visible_count: 1 },
    },
  }, profileEvidence.viewports[1]],
});
assert.equal(failedSelectorAbsentAssessment.status, "product_regression");
assert.equal(failedSelectorAbsentAssessment.checks.find((check) => check.type === "selector_absent").status, "failed");
const failedSelectorExactCountAssessment = assessRiddleProofProfileEvidence(profile, {
  ...profileEvidence,
  viewports: [{
    ...profileEvidence.viewports[0],
    selectors: {
      ...profileEvidence.viewports[0].selectors,
      "[data-testid='pricing-cards']": { count: 2, visible_count: 2 },
    },
  }, profileEvidence.viewports[1]],
});
assert.equal(failedSelectorExactCountAssessment.status, "product_regression");
assert.equal(failedSelectorExactCountAssessment.checks.find((check) => check.type === "selector_count_equals").status, "failed");
const failedSelectorTextVisibleAssessment = assessRiddleProofProfileEvidence(profile, {
  ...profileEvidence,
  viewports: [{
    ...profileEvidence.viewports[0],
    text_sequences: {
      "[data-testid='pricing-cards']": {
        count: 1,
        visible_count: 1,
        texts: ["Pricing"],
        visible_texts: ["Pricing"],
      },
    },
  }, profileEvidence.viewports[1]],
});
assert.equal(failedSelectorTextVisibleAssessment.status, "product_regression");
assert.equal(failedSelectorTextVisibleAssessment.checks.find((check) => check.type === "selector_text_visible").status, "failed");
assert.deepEqual(
  failedSelectorTextVisibleAssessment.checks.find((check) => check.type === "selector_text_visible").evidence.viewports[0].samples,
  ["Pricing"],
);
assert.equal(failedSelectorTextVisibleAssessment.checks.find((check) => check.type === "selector_text_absent").status, "passed");
const failedObserveWithinAssessment = assessRiddleProofProfileEvidence(profile, {
  ...profileEvidence,
  viewports: [{
    ...profileEvidence.viewports[0],
    observations: {
      "selector:[data-testid='pricing-cards']|text:Start building|within:1500": {
        matched: false,
        timeout_ms: 1500,
        elapsed_ms: 1505,
        attempts: 16,
        selector_count: 1,
        visible_count: 1,
        matched_count: 0,
        sample: "Pricing",
      },
    },
  }, profileEvidence.viewports[1]],
});
assert.equal(failedObserveWithinAssessment.status, "product_regression");
const failedObserveWithinCheck = failedObserveWithinAssessment.checks.find((check) => check.type === "observe_within");
assert.equal(failedObserveWithinCheck.status, "failed");
assert.match(failedObserveWithinCheck.message, /Observation did not match within 1500ms/);
const caseMismatchSelectorTextAssessment = assessRiddleProofProfileEvidence(profile, {
  ...profileEvidence,
  viewports: [{
    ...profileEvidence.viewports[0],
    text_sequences: {
      "[data-testid='pricing-cards']": {
        count: 1,
        visible_count: 1,
        texts: ["START BUILDING"],
        visible_texts: ["START BUILDING"],
      },
    },
  }, profileEvidence.viewports[1]],
});
const caseMismatchSelectorTextCheck = caseMismatchSelectorTextAssessment.checks.find((check) => check.type === "selector_text_visible");
assert.equal(caseMismatchSelectorTextCheck.status, "failed");
assert.deepEqual(caseMismatchSelectorTextCheck.evidence.viewports[0].case_insensitive_samples, ["START BUILDING"]);
const failedPageTextSampleProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "page-text-failure-samples",
  target: { route: "/dashboard" },
  checks: [
    { type: "text_absent", pattern: "NaN", flags: "i" },
    { type: "text_visible", text: "Missing CTA" },
  ],
}, { url: "https://example.com" });
const failedPageTextSampleAssessment = assessRiddleProofProfileEvidence(failedPageTextSampleProfile, {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: "page-text-failure-samples",
  target_url: "https://example.com/dashboard",
  baseline_policy: "invariant_only",
  captured_at: "2026-05-19T00:00:00.000Z",
  viewports: [{
    name: "desktop",
    width: 1280,
    height: 900,
    route: { requested: "https://example.com/dashboard", observed: "/dashboard", expected_path: "/dashboard", matched: true, http_status: 200 },
    body_text_sample: "Dashboard shell loaded without the target CTA.",
    text_matches: { "pattern:NaN/i": true, "text:Missing CTA": false },
    text_match_samples: { "pattern:NaN/i": ["Financial dashboard summary"] },
    selectors: {},
    screenshot_label: "page-text-failure-samples-desktop",
  }],
  console: { events: [], fatal_count: 0 },
  page_errors: [],
});
assert.equal(failedPageTextSampleAssessment.status, "product_regression");
const failedTextAbsentCheck = failedPageTextSampleAssessment.checks.find((check) => check.type === "text_absent");
assert.equal(failedTextAbsentCheck.status, "failed");
assert.deepEqual(failedTextAbsentCheck.evidence.matches, [true]);
assert.equal(failedTextAbsentCheck.evidence.viewports[0].matched, true);
assert.deepEqual(failedTextAbsentCheck.evidence.viewports[0].samples, ["Financial dashboard summary"]);
const failedTextVisibleCheck = failedPageTextSampleAssessment.checks.find((check) => check.type === "text_visible");
assert.equal(failedTextVisibleCheck.status, "failed");
assert.deepEqual(failedTextVisibleCheck.evidence.matches, [false]);
assert.match(failedTextVisibleCheck.evidence.viewports[0].samples[0], /Dashboard shell loaded/);
const caseMismatchPageTextProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "page-text-case-mismatch-samples",
  target: { route: "/slalom-3d" },
  checks: [
    { type: "text_visible", text: "Hill: Default" },
  ],
}, { url: "https://example.com" });
const caseMismatchPageTextAssessment = assessRiddleProofProfileEvidence(caseMismatchPageTextProfile, {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: "page-text-case-mismatch-samples",
  target_url: "https://example.com/slalom-3d",
  baseline_policy: "invariant_only",
  captured_at: "2026-05-19T00:00:00.000Z",
  viewports: [{
    name: "desktop",
    width: 1280,
    height: 900,
    route: { requested: "https://example.com/slalom-3d", observed: "/slalom-3d", expected_path: "/slalom-3d", matched: true, http_status: 200 },
    body_text_sample: "Slalom 3D Preview HILL: DEFAULT Start on default",
    text_matches: { "text:Hill: Default": false },
    text_case_insensitive_samples: { "text:Hill: Default": ["HILL: DEFAULT"] },
    selectors: {},
    screenshot_label: "page-text-case-mismatch-samples-desktop",
  }],
  console: { events: [], fatal_count: 0 },
  page_errors: [],
});
const caseMismatchPageTextCheck = caseMismatchPageTextAssessment.checks.find((check) => check.type === "text_visible");
assert.equal(caseMismatchPageTextCheck.status, "failed");
assert.deepEqual(caseMismatchPageTextCheck.evidence.viewports[0].case_insensitive_samples, ["HILL: DEFAULT"]);
const urlParamEvidence = {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: "deep-link-url-profile",
  target_url: "https://example.com/games/drum-sequencer?seq=stale-local&song=monkberry-moon-delight-tab&mix=profile&view=trainer&instrument=bass",
  baseline_policy: "invariant_only",
  captured_at: "2026-05-10T00:00:00.000Z",
  viewports: [
    {
      name: "phone",
      width: 390,
      height: 844,
      url: "https://example.com/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile&view=trainer&instrument=bass",
      route: {
        requested: "https://example.com/games/drum-sequencer?seq=stale-local&song=monkberry-moon-delight-tab&mix=profile&view=trainer&instrument=bass",
        observed: "/games/drum-sequencer",
        expected_path: "/games/drum-sequencer",
        matched: true,
        http_status: 200,
      },
      body_text_sample: "Vocal Melody",
      overflow_px: 0,
      screenshot_label: "deep-link-url-profile-phone",
    },
    {
      name: "desktop",
      width: 1280,
      height: 900,
      url: "https://example.com/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile&view=trainer&instrument=bass",
      route: {
        requested: "https://example.com/games/drum-sequencer?seq=stale-local&song=monkberry-moon-delight-tab&mix=profile&view=trainer&instrument=bass",
        observed: "/games/drum-sequencer",
        expected_path: "/games/drum-sequencer",
        matched: true,
        http_status: 200,
      },
      body_text_sample: "Vocal Melody",
      overflow_px: 0,
      screenshot_label: "deep-link-url-profile-desktop",
    },
  ],
  console: { events: [], fatal_count: 0 },
  page_errors: [],
  dom_summary: { viewport_count: 2 },
};
const urlParamAssessment = assessRiddleProofProfileEvidence(urlParamProfile, urlParamEvidence);
assert.equal(urlParamAssessment.status, "passed");
assert.equal(urlParamAssessment.checks.find((check) => check.type === "url_search_param_absent").status, "passed");
assert.deepEqual(
  urlParamAssessment.checks.find((check) => check.type === "url_search_param_equals" && check.evidence.param === "song").evidence.observed_values,
  ["monkberry-moon-delight-tab", "monkberry-moon-delight-tab"],
);
const staleSeqAssessment = assessRiddleProofProfileEvidence(urlParamProfile, {
  ...urlParamEvidence,
  viewports: [
    {
      ...urlParamEvidence.viewports[0],
      url: "https://example.com/games/drum-sequencer?seq=stale-local&song=monkberry-moon-delight-tab&mix=profile&view=perform&instrument=bass",
    },
    urlParamEvidence.viewports[1],
  ],
});
assert.equal(staleSeqAssessment.status, "product_regression");
assert.equal(staleSeqAssessment.checks.find((check) => check.type === "url_search_param_absent").status, "failed");
assert.equal(staleSeqAssessment.checks.find((check) => check.type === "url_search_param_equals" && check.evidence.param === "view").status, "failed");
const selectorCountAliasProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "selector-count-alias",
  target: { route: "/pricing" },
  checks: [{ type: "selector_count_eq", selector: "[data-testid='pricing-cards']", count: 1 }],
}, { url: "https://example.com" });
assert.equal(selectorCountAliasProfile.checks[0].expected_count, 1);
const routeInventoryEvidence = {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: "homepage-route-inventory",
  target_url: "https://example.com/",
  baseline_policy: "invariant_only",
  captured_at: "2026-05-13T00:00:00.000Z",
  viewports: [{
    name: "desktop",
    width: 1280,
    height: 900,
    route: { requested: "https://example.com/", observed: "/", expected_path: "/", matched: true, http_status: 200 },
    body_text_sample: "Gem Mine Coin Clicker",
    overflow_px: 0,
    selectors: {},
    text_matches: {},
    route_inventory: {
      version: "riddle-proof.route-inventory.v1",
      viewport: "desktop",
      expected_routes: routeInventoryProfile.checks[0].expected_routes,
      link_selector: "a[href^='/games/']",
      source_selector: ".game-table",
      source_link_scope: "route_path_prefix",
      source_candidate_count: 3,
      source_candidate_unique_link_count: 2,
      source_link_count: 2,
      source_unique_link_count: 2,
      duplicate_source_link_count: 0,
      duplicate_source_link_paths: [],
      duplicates_allowed: false,
      home_game_link_count: 2,
      home_unique_game_link_count: 2,
      home_links: [
        { text: "Gem Mine", app_path: "/games/gem-mine" },
        { text: "Coin Clicker", app_path: "/games/coin-clicker" },
      ],
      direct_routes: [
        { phase: "direct", path: "/games/gem-mine", loaded: true, actual_app_path: "/games/gem-mine", source_visible: false },
        { phase: "direct", path: "/games/coin-clicker", loaded: true, actual_app_path: "/games/coin-clicker", source_visible: false },
      ],
      clickthroughs: [
        { path: "/games/gem-mine", clicked: true, snapshot: { actual_app_path: "/games/gem-mine", source_visible: false } },
        { path: "/games/coin-clicker", clicked: true, snapshot: { actual_app_path: "/games/coin-clicker", source_visible: false } },
      ],
      failures: [],
    },
    screenshot_label: "homepage-route-inventory-desktop",
  }],
  console: { events: [], fatal_count: 0 },
  page_errors: [],
  dom_summary: { viewport_count: 1 },
};
const routeInventoryAssessment = assessRiddleProofProfileEvidence(routeInventoryProfile, routeInventoryEvidence);
assert.equal(routeInventoryAssessment.status, "passed");
const routeInventoryCheck = routeInventoryAssessment.checks.find((check) => check.type === "route_inventory");
assert.equal(routeInventoryCheck.status, "passed");
assert.equal(routeInventoryCheck.evidence.expected_count, 2);
assert.deepEqual(routeInventoryCheck.evidence.expected_routes, [
  { name: "Gem Mine", path: "/games/gem-mine" },
  { name: "Coin Clicker", path: "/games/coin-clicker" },
]);
assert.equal(routeInventoryCheck.evidence.source_link_scope, "route_path_prefix");
assert.equal(routeInventoryCheck.evidence.source_candidate_count, 3);
assert.equal(routeInventoryCheck.evidence.source_candidate_unique_link_count, 2);
assert.equal(routeInventoryCheck.evidence.source_link_count, 2);
assert.equal(routeInventoryCheck.evidence.source_unique_link_count, 2);
assert.equal(routeInventoryCheck.evidence.duplicate_source_link_count, 0);
assert.deepEqual(routeInventoryCheck.evidence.duplicate_source_links, []);
assert.equal(routeInventoryCheck.evidence.duplicates_allowed, false);
assert.equal(routeInventoryCheck.evidence.direct_route_count, 2);
assert.equal(routeInventoryCheck.evidence.clickthrough_count, 2);
assert.equal(routeInventoryCheck.evidence.viewport_count, 1);
assert.deepEqual(routeInventoryCheck.evidence.viewports[0], {
  viewport: "desktop",
  source_link_scope: "route_path_prefix",
  source_candidate_count: 3,
  source_candidate_unique_link_count: 2,
  source_link_count: 2,
  source_unique_link_count: 2,
  duplicate_source_link_count: 0,
  duplicate_source_links: [],
  direct_route_count: 2,
  clickthrough_count: 2,
  failure_count: 0,
});
const multiViewportRouteInventoryAssessment = assessRiddleProofProfileEvidence(routeInventoryProfile, {
  ...routeInventoryEvidence,
  viewports: [
    routeInventoryEvidence.viewports[0],
    {
      ...routeInventoryEvidence.viewports[0],
      name: "phone",
      width: 390,
      height: 844,
      route_inventory: {
        ...routeInventoryEvidence.viewports[0].route_inventory,
        viewport: "phone",
        failures: [],
      },
      screenshot_label: "homepage-route-inventory-phone",
    },
  ],
  dom_summary: { viewport_count: 2 },
});
const multiViewportRouteInventoryCheck = multiViewportRouteInventoryAssessment.checks.find((check) => check.type === "route_inventory");
assert.equal(multiViewportRouteInventoryAssessment.status, "passed");
assert.equal(multiViewportRouteInventoryCheck.evidence.viewport_count, 2);
assert.deepEqual(multiViewportRouteInventoryCheck.evidence.viewports.map((viewport) => viewport.viewport), ["desktop", "phone"]);
const linkStatusEvidence = {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: "public-artifact-link-status",
  target_url: "https://example.com/proof/good-catches",
  baseline_policy: "invariant_only",
  captured_at: "2026-05-16T00:00:00.000Z",
  viewports: [{
    name: "desktop",
    width: 1280,
    height: 900,
    route: { requested: "https://example.com/proof/good-catches", observed: "/proof/good-catches", expected_path: "/proof/good-catches", matched: true, http_status: 200 },
    body_text_sample: "Good catches",
    overflow_px: 0,
    selectors: {},
    text_matches: {},
    link_statuses: {
      "a[href*='/proof/good-catches/artifacts/'], img[src*='/proof/good-catches/artifacts/']": {
        version: "riddle-proof.link-status.v1",
        selector: "a[href*='/proof/good-catches/artifacts/'], img[src*='/proof/good-catches/artifacts/']",
        max_links: 150,
        same_origin_only: true,
        dedupe: true,
        require_nonzero_bytes: true,
        allowed_statuses: [200, 304],
        discovered_count: 2,
        total_count: 2,
        truncated: false,
        ok_count: 2,
        failed_count: 0,
        status_counts: { 200: 2 },
        failures: [],
        results: [
          { url: "https://example.com/proof/good-catches/artifacts/a.png", status: 200, method: "HEAD", ok: true, content_type: "image/png", content_length: 1234, bytes: null },
          { url: "https://example.com/proof/good-catches/artifacts/b.json", status: 200, method: "GET", ok: true, content_type: "application/json; charset=utf-8", content_length: null, bytes: 42 },
        ],
      },
    },
    screenshot_label: "public-artifact-link-status-desktop",
  }],
  console: { events: [], fatal_count: 0 },
  page_errors: [],
  dom_summary: { viewport_count: 1 },
};
const linkStatusAssessment = assessRiddleProofProfileEvidence(linkStatusProfile, linkStatusEvidence);
const linkStatusCheck = linkStatusAssessment.checks.find((check) => check.type === "artifact_link_status");
assert.equal(linkStatusAssessment.status, "passed");
assert.equal(linkStatusCheck.status, "passed");
assert.equal(linkStatusCheck.evidence.viewports[0].total_count, 2);
assert.equal(linkStatusCheck.evidence.viewports[0].ok_count, 2);
assert.equal(linkStatusCheck.evidence.viewports[0].result_count, 2);
assert.equal(linkStatusCheck.evidence.viewports[0].stored_result_count, 2);
assert.equal(linkStatusCheck.evidence.viewports[0].omitted_result_count, 0);
assert.equal(linkStatusCheck.evidence.require_nonzero_bytes, true);
assert.equal(linkStatusCheck.evidence.min_bytes, 32);
assert.deepEqual(linkStatusCheck.evidence.allowed_content_types, ["image/*", "application/json"]);
const httpStatusEvidence = {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: "direct-api-endpoint-status",
  target_url: "https://example.com/docs/scrape",
  baseline_policy: "invariant_only",
  captured_at: "2026-05-16T00:00:00.000Z",
  viewports: [{
    name: "desktop",
    width: 1280,
    height: 900,
    url: "https://example.com/docs/scrape",
    route: { requested: "https://example.com/docs/scrape", observed: "/docs/scrape", expected_path: "/docs/scrape", matched: true, http_status: 200 },
    body_text_sample: "Scrape API",
    overflow_px: 0,
    selectors: {},
    text_matches: {},
    http_statuses: {
      "POST https://api.example.com/v1/scrape": {
        version: "riddle-proof.http-status.v1",
        url: "https://api.example.com/v1/scrape",
        method: "POST",
        status: 401,
        status_text: "Unauthorized",
        ok: true,
        error: null,
        content_type: "application/json",
        content_length: 54,
        bytes: 54,
        body_contains: { UNAUTHORIZED: true },
        body_not_contains: { FORBIDDEN: false },
        body_not_patterns: { '"debug"\\s*:': false },
        body_json_assertions: [
          { label: "auth code", path: "error.code", ok: true, exists: true, observed: "UNAUTHORIZED", observed_type: "string", equals: "UNAUTHORIZED" },
          { label: "debug absent", path: "debug", ok: true, exists: false, observed_type: "missing", expected_exists: false },
        ],
        body_sample: '{"error":{"code":"UNAUTHORIZED"}}',
      },
    },
    screenshot_label: "direct-api-endpoint-status-desktop",
  }],
  console: { events: [], fatal_count: 0 },
  page_errors: [],
  dom_summary: { viewport_count: 1 },
};
const httpStatusAssessment = assessRiddleProofProfileEvidence(httpStatusProfile, httpStatusEvidence);
const httpStatusCheck = httpStatusAssessment.checks.find((check) => check.type === "http_status");
assert.equal(httpStatusAssessment.status, "passed");
assert.equal(httpStatusCheck.status, "passed");
assert.equal(httpStatusCheck.evidence.url, "https://api.example.com/v1/scrape");
assert.equal(httpStatusCheck.evidence.method, "POST");
assert.deepEqual(httpStatusCheck.evidence.allowed_statuses, [401]);
assert.deepEqual(httpStatusCheck.evidence.body_contains, ["UNAUTHORIZED"]);
assert.deepEqual(httpStatusCheck.evidence.body_not_contains, ["FORBIDDEN"]);
assert.deepEqual(httpStatusCheck.evidence.body_not_patterns, ['"debug"\\s*:']);
assert.deepEqual(httpStatusCheck.evidence.body_json_assertions, [
  { label: "auth code", path: "error.code", equals: "UNAUTHORIZED" },
  { label: "debug absent", path: "debug", exists: false },
]);
assert.equal(httpStatusCheck.evidence.viewports[0].status, 401);
assert.deepEqual(httpStatusCheck.evidence.viewports[0].body_contains, { UNAUTHORIZED: true });
assert.deepEqual(httpStatusCheck.evidence.viewports[0].body_contains_missing, []);
assert.deepEqual(httpStatusCheck.evidence.viewports[0].body_not_contains, { FORBIDDEN: false });
assert.deepEqual(httpStatusCheck.evidence.viewports[0].body_not_contains_found, []);
assert.deepEqual(httpStatusCheck.evidence.viewports[0].body_not_patterns, { '"debug"\\s*:': false });
assert.deepEqual(httpStatusCheck.evidence.viewports[0].body_not_patterns_found, []);
assert.equal(httpStatusCheck.evidence.viewports[0].body_json_assertions[0].ok, true);
assert.deepEqual(httpStatusCheck.evidence.viewports[0].body_json_assertions_failed, []);
const yamlHttpStatusProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "yaml-http-status",
  target: {
    route: "/openapi",
    viewports: [{ name: "desktop", width: 1280, height: 900 }],
  },
  checks: [{
    type: "http_status",
    label: "yaml alias",
    url: "https://example.com/openapi.yaml",
    expected_status: 200,
    allowed_content_types: ["application/yaml"],
    min_bytes: 10,
    body_contains: ["openapi: 3.1.0"],
  }],
}, { url: "https://example.com" });
const yamlHttpStatusAssessment = assessRiddleProofProfileEvidence(yamlHttpStatusProfile, {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: "yaml-http-status",
  target_url: "https://example.com/openapi",
  baseline_policy: "invariant_only",
  captured_at: "2026-05-17T00:00:00.000Z",
  viewports: [{
    name: "desktop",
    width: 1280,
    height: 900,
    url: "https://example.com/openapi",
    route: { requested: "https://example.com/openapi", observed: "/openapi", expected_path: "/openapi", matched: true, http_status: 200 },
    body_text_sample: "OpenAPI",
    overflow_px: 0,
    selectors: {},
    text_matches: {},
    http_statuses: {
      "GET https://example.com/openapi.yaml": {
        version: "riddle-proof.http-status.v1",
        url: "https://example.com/openapi.yaml",
        method: "GET",
        status: 200,
        ok: true,
        content_type: "text/x-yaml; charset=utf-8",
        content_length: 128,
        bytes: 128,
        body_contains: { "openapi: 3.1.0": true },
      },
    },
    screenshot_label: "yaml-http-status-desktop",
  }],
  console: { events: [], fatal_count: 0 },
  page_errors: [],
  dom_summary: { viewport_count: 1 },
});
const yamlHttpStatusCheck = yamlHttpStatusAssessment.checks.find((check) => check.type === "http_status");
assert.equal(yamlHttpStatusAssessment.status, "passed");
assert.equal(yamlHttpStatusCheck.status, "passed");
const yamlLinkStatusProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "yaml-link-status",
  target: {
    route: "/",
    viewports: [{ name: "desktop", width: 1280, height: 900 }],
  },
  checks: [{
    type: "link_status",
    selector: "a[href$='.yaml']",
    expected_count: 1,
    allowed_content_types: ["text/yaml"],
    min_bytes: 10,
  }],
}, { url: "https://example.com" });
const yamlLinkStatusAssessment = assessRiddleProofProfileEvidence(yamlLinkStatusProfile, {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: "yaml-link-status",
  target_url: "https://example.com/",
  baseline_policy: "invariant_only",
  captured_at: "2026-05-17T00:00:00.000Z",
  viewports: [{
    name: "desktop",
    width: 1280,
    height: 900,
    route: { requested: "https://example.com/", observed: "/", expected_path: "/", matched: true, http_status: 200 },
    body_text_sample: "Home",
    overflow_px: 0,
    selectors: {},
    text_matches: {},
    link_statuses: {
      "a[href$='.yaml']": {
        version: "riddle-proof.link-status.v1",
        selector: "a[href$='.yaml']",
        discovered_count: 1,
        total_count: 1,
        ok_count: 1,
        failed_count: 0,
        results: [
          { url: "https://example.com/openapi.yaml", status: 200, method: "GET", ok: true, content_type: "application/x-yaml", content_length: 128, bytes: 128 },
        ],
      },
    },
    screenshot_label: "yaml-link-status-desktop",
  }],
  console: { events: [], fatal_count: 0 },
  page_errors: [],
  dom_summary: { viewport_count: 1 },
});
const yamlLinkStatusCheck = yamlLinkStatusAssessment.checks.find((check) => check.type === "link_status");
assert.equal(yamlLinkStatusAssessment.status, "passed");
assert.equal(yamlLinkStatusCheck.status, "passed");
const failedBodyStatusAssessment = assessRiddleProofProfileEvidence(httpStatusProfile, {
  ...httpStatusEvidence,
  viewports: [{
    ...httpStatusEvidence.viewports[0],
    http_statuses: {
      "POST https://api.example.com/v1/scrape": {
        ...httpStatusEvidence.viewports[0].http_statuses["POST https://api.example.com/v1/scrape"],
        body_contains: { UNAUTHORIZED: false },
        body_sample: '{"error":{"code":"FORBIDDEN"}}',
        ok: false,
      },
    },
  }],
});
const failedBodyStatusCheck = failedBodyStatusAssessment.checks.find((check) => check.type === "http_status");
assert.equal(failedBodyStatusAssessment.status, "product_regression");
assert.equal(failedBodyStatusCheck.status, "failed");
assert.deepEqual(failedBodyStatusCheck.evidence.failures[0].failure.body_contains_missing, ["UNAUTHORIZED"]);
const failedForbiddenTextStatusAssessment = assessRiddleProofProfileEvidence(httpStatusProfile, {
  ...httpStatusEvidence,
  viewports: [{
    ...httpStatusEvidence.viewports[0],
    http_statuses: {
      "POST https://api.example.com/v1/scrape": {
        ...httpStatusEvidence.viewports[0].http_statuses["POST https://api.example.com/v1/scrape"],
        body_not_contains: { FORBIDDEN: true },
        body_sample: '{"error":{"code":"UNAUTHORIZED"},"message":"FORBIDDEN"}',
        ok: false,
      },
    },
  }],
});
const failedForbiddenTextStatusCheck = failedForbiddenTextStatusAssessment.checks.find((check) => check.type === "http_status");
assert.equal(failedForbiddenTextStatusAssessment.status, "product_regression");
assert.equal(failedForbiddenTextStatusCheck.status, "failed");
assert.deepEqual(failedForbiddenTextStatusCheck.evidence.failures[0].failure.body_not_contains_found, ["FORBIDDEN"]);
const failedForbiddenPatternStatusAssessment = assessRiddleProofProfileEvidence(httpStatusProfile, {
  ...httpStatusEvidence,
  viewports: [{
    ...httpStatusEvidence.viewports[0],
    http_statuses: {
      "POST https://api.example.com/v1/scrape": {
        ...httpStatusEvidence.viewports[0].http_statuses["POST https://api.example.com/v1/scrape"],
        body_not_patterns: { '"debug"\\s*:': true },
        body_sample: '{"error":{"code":"UNAUTHORIZED"},"debug":true}',
        ok: false,
      },
    },
  }],
});
const failedForbiddenPatternStatusCheck = failedForbiddenPatternStatusAssessment.checks.find((check) => check.type === "http_status");
assert.equal(failedForbiddenPatternStatusAssessment.status, "product_regression");
assert.equal(failedForbiddenPatternStatusCheck.status, "failed");
assert.deepEqual(failedForbiddenPatternStatusCheck.evidence.failures[0].failure.body_not_patterns_found, ['"debug"\\s*:']);
const failedJsonAssertionStatusAssessment = assessRiddleProofProfileEvidence(httpStatusProfile, {
  ...httpStatusEvidence,
  viewports: [{
    ...httpStatusEvidence.viewports[0],
    http_statuses: {
      "POST https://api.example.com/v1/scrape": {
        ...httpStatusEvidence.viewports[0].http_statuses["POST https://api.example.com/v1/scrape"],
        body_json_assertions: [
          { label: "auth code", path: "error.code", ok: false, exists: true, observed: "FORBIDDEN", observed_type: "string", equals: "UNAUTHORIZED", errors: ["expected JSON value equality"] },
          { label: "debug absent", path: "debug", ok: true, exists: false, observed_type: "missing", expected_exists: false },
        ],
        ok: false,
      },
    },
  }],
});
const failedJsonAssertionStatusCheck = failedJsonAssertionStatusAssessment.checks.find((check) => check.type === "http_status");
assert.equal(failedJsonAssertionStatusAssessment.status, "product_regression");
assert.equal(failedJsonAssertionStatusCheck.status, "failed");
assert.equal(failedJsonAssertionStatusCheck.evidence.failures[0].failure.body_json_assertions_failed[0].path, "error.code");
assert.equal(failedJsonAssertionStatusCheck.evidence.failures[0].failure.body_json_assertions_failed[0].observed, "FORBIDDEN");
const failedHttpStatusAssessment = assessRiddleProofProfileEvidence(httpStatusProfile, {
  ...httpStatusEvidence,
  viewports: [{
    ...httpStatusEvidence.viewports[0],
    http_statuses: {
      "POST https://api.example.com/v1/scrape": {
        ...httpStatusEvidence.viewports[0].http_statuses["POST https://api.example.com/v1/scrape"],
        status: 404,
        status_text: "Not Found",
        ok: false,
      },
    },
  }],
});
const failedHttpStatusCheck = failedHttpStatusAssessment.checks.find((check) => check.type === "http_status");
assert.equal(failedHttpStatusAssessment.status, "product_regression");
assert.equal(failedHttpStatusCheck.status, "failed");
assert.equal(failedHttpStatusCheck.evidence.failures[0].failure.status, 404);
const linkStatusSelector = "a[href*='/proof/good-catches/artifacts/'], img[src*='/proof/good-catches/artifacts/']";
const highVolumeLinkStatusProfile = {
  ...linkStatusProfile,
  checks: [{ ...linkStatusProfile.checks[0], expected_count: undefined, min_count: 25 }],
};
const compactedSuccessResults = Array.from({ length: 5 }, (_, index) => ({
  url: `https://example.com/proof/good-catches/artifacts/success-${index}.png`,
  status: 200,
  method: "HEAD",
  ok: true,
  content_type: "image/png",
  content_length: 64,
  bytes: null,
}));
const compactedLinkStatusAssessment = assessRiddleProofProfileEvidence(highVolumeLinkStatusProfile, {
  ...linkStatusEvidence,
  viewports: [{
    ...linkStatusEvidence.viewports[0],
    link_statuses: {
      [linkStatusSelector]: {
        ...linkStatusEvidence.viewports[0].link_statuses[linkStatusSelector],
        discovered_count: 25,
        total_count: 25,
        ok_count: 25,
        failed_count: 0,
        status_counts: { 200: 25 },
        result_count: 25,
        stored_result_count: 5,
        omitted_result_count: 20,
        omitted_success_count: 20,
        results_compacted: true,
        results: compactedSuccessResults,
      },
    },
  }],
});
const compactedLinkStatusCheck = compactedLinkStatusAssessment.checks.find((check) => check.type === "artifact_link_status");
assert.equal(compactedLinkStatusAssessment.status, "passed");
assert.equal(compactedLinkStatusCheck.status, "passed");
assert.equal(compactedLinkStatusCheck.evidence.viewports[0].total_count, 25);
assert.equal(compactedLinkStatusCheck.evidence.viewports[0].ok_count, 25);
assert.equal(compactedLinkStatusCheck.evidence.viewports[0].result_count, 25);
assert.equal(compactedLinkStatusCheck.evidence.viewports[0].stored_result_count, 5);
assert.equal(compactedLinkStatusCheck.evidence.viewports[0].omitted_result_count, 20);
assert.equal(compactedLinkStatusCheck.evidence.viewports[0].omitted_success_count, 20);
assert.equal(compactedLinkStatusCheck.evidence.viewports[0].results_compacted, true);
const failedLinkStatusAssessment = assessRiddleProofProfileEvidence(linkStatusProfile, {
  ...linkStatusEvidence,
  viewports: [{
    ...linkStatusEvidence.viewports[0],
    link_statuses: {
      ...linkStatusEvidence.viewports[0].link_statuses,
      "a[href*='/proof/good-catches/artifacts/'], img[src*='/proof/good-catches/artifacts/']": {
        ...linkStatusEvidence.viewports[0].link_statuses["a[href*='/proof/good-catches/artifacts/'], img[src*='/proof/good-catches/artifacts/']"],
        total_count: 2,
        ok_count: 1,
        failed_count: 1,
        status_counts: { 200: 1, 403: 1 },
        results: [
          linkStatusEvidence.viewports[0].link_statuses["a[href*='/proof/good-catches/artifacts/'], img[src*='/proof/good-catches/artifacts/']"].results[0],
          { url: "https://example.com/proof/good-catches/artifacts/missing.png", status: 403, method: "HEAD", ok: false, error: null, content_length: 0, bytes: null },
        ],
      },
    },
  }],
});
assert.equal(failedLinkStatusAssessment.status, "product_regression");
assert.equal(failedLinkStatusAssessment.checks.find((check) => check.type === "artifact_link_status").status, "failed");
assert.equal(failedLinkStatusAssessment.checks.find((check) => check.type === "artifact_link_status").evidence.failures.length, 1);
const compactedFailedLink = { url: "https://example.com/proof/good-catches/artifacts/missing.png", status: 403, method: "HEAD", ok: false, error: null, content_length: 0, bytes: null };
const compactedFailedLinkStatusAssessment = assessRiddleProofProfileEvidence(highVolumeLinkStatusProfile, {
  ...linkStatusEvidence,
  viewports: [{
    ...linkStatusEvidence.viewports[0],
    link_statuses: {
      [linkStatusSelector]: {
        ...linkStatusEvidence.viewports[0].link_statuses[linkStatusSelector],
        discovered_count: 25,
        total_count: 25,
        ok_count: 24,
        failed_count: 1,
        status_counts: { 200: 24, 403: 1 },
        result_count: 25,
        stored_result_count: 6,
        omitted_result_count: 19,
        omitted_success_count: 19,
        results_compacted: true,
        results: [
          compactedSuccessResults[0],
          compactedSuccessResults[1],
          compactedFailedLink,
          compactedSuccessResults[2],
          compactedSuccessResults[3],
          compactedSuccessResults[4],
        ],
      },
    },
  }],
});
const compactedFailedLinkStatusCheck = compactedFailedLinkStatusAssessment.checks.find((check) => check.type === "artifact_link_status");
assert.equal(compactedFailedLinkStatusAssessment.status, "product_regression");
assert.equal(compactedFailedLinkStatusCheck.status, "failed");
assert.equal(compactedFailedLinkStatusCheck.evidence.failures.length, 1);
assert.equal(compactedFailedLinkStatusCheck.evidence.failures[0].failure.url, compactedFailedLink.url);
const weakArtifactAssessment = assessRiddleProofProfileEvidence(linkStatusProfile, {
  ...linkStatusEvidence,
  viewports: [{
    ...linkStatusEvidence.viewports[0],
    link_statuses: {
      ...linkStatusEvidence.viewports[0].link_statuses,
      "a[href*='/proof/good-catches/artifacts/'], img[src*='/proof/good-catches/artifacts/']": {
        ...linkStatusEvidence.viewports[0].link_statuses["a[href*='/proof/good-catches/artifacts/'], img[src*='/proof/good-catches/artifacts/']"],
        ok_count: 1,
        failed_count: 1,
        results: [
          { url: "https://example.com/proof/good-catches/artifacts/a.png", status: 200, method: "GET", ok: true, content_type: "text/plain", content_length: 1, bytes: 1 },
          linkStatusEvidence.viewports[0].link_statuses["a[href*='/proof/good-catches/artifacts/'], img[src*='/proof/good-catches/artifacts/']"].results[1],
        ],
      },
    },
  }],
});
const weakArtifactCheck = weakArtifactAssessment.checks.find((check) => check.type === "artifact_link_status");
assert.equal(weakArtifactAssessment.status, "product_regression");
assert.equal(weakArtifactCheck.status, "failed");
assert.equal(weakArtifactCheck.evidence.failures[0].failure.bytes, 1);
assert.equal(weakArtifactCheck.evidence.failures[0].failure.content_type, "text/plain");
const selectorTextOrderEvidence = {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: "table-order-profile",
  target_url: "https://example.com/",
  baseline_policy: "invariant_only",
  captured_at: "2026-05-14T00:00:00.000Z",
  viewports: [{
    name: "desktop",
    width: 1280,
    height: 900,
    route: { requested: "https://example.com/", observed: "/", expected_path: "/", matched: true, http_status: 200 },
    body_text_sample: "AAA Alpha MMM Middle ZZZ Omega",
    overflow_px: 0,
    selectors: { ".game-table tbody tr": { count: 3, visible_count: 3 } },
    text_sequences: {
      ".game-table tbody tr": {
        count: 3,
        visible_count: 3,
        texts: ["AAA Alpha row", "MMM Middle row", "ZZZ Omega row"],
        visible_texts: ["AAA Alpha row", "MMM Middle row", "ZZZ Omega row"],
      },
    },
    text_matches: {},
    screenshot_label: "table-order-profile-desktop",
  }],
  console: { events: [], fatal_count: 0 },
  page_errors: [],
  dom_summary: { viewport_count: 1 },
};
const selectorTextOrderAssessment = assessRiddleProofProfileEvidence(selectorTextOrderProfile, selectorTextOrderEvidence);
const selectorTextOrderCheck = selectorTextOrderAssessment.checks.find((check) => check.type === "selector_text_order");
assert.equal(selectorTextOrderAssessment.status, "passed");
assert.equal(selectorTextOrderCheck.status, "passed");
assert.deepEqual(selectorTextOrderCheck.evidence.expected_texts, ["AAA Alpha", "MMM Middle", "ZZZ Omega"]);
assert.deepEqual(selectorTextOrderCheck.evidence.viewports[0].matched_positions, [0, 1, 2]);
const failedSelectorTextOrderAssessment = assessRiddleProofProfileEvidence(selectorTextOrderProfile, {
  ...selectorTextOrderEvidence,
  viewports: [{
    ...selectorTextOrderEvidence.viewports[0],
    text_sequences: {
      ".game-table tbody tr": {
        count: 3,
        visible_count: 3,
        texts: ["ZZZ Omega row", "MMM Middle row", "AAA Alpha row"],
        visible_texts: ["ZZZ Omega row", "MMM Middle row", "AAA Alpha row"],
      },
    },
  }],
});
assert.equal(failedSelectorTextOrderAssessment.status, "product_regression");
assert.equal(failedSelectorTextOrderAssessment.checks.find((check) => check.type === "selector_text_order").status, "failed");
const frameProfileEvidence = {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: "community-frame-profile",
  target_url: "https://example.com/play/hot-path",
  baseline_policy: "invariant_only",
  captured_at: "2026-05-14T00:00:00.000Z",
  viewports: [
    {
      name: "phone",
      width: 390,
      height: 844,
      route: { requested: "https://example.com/play/hot-path", observed: "/play/hot-path", expected_path: "/play/hot-path", matched: true, http_status: 200 },
      body_text_sample: "Hot Path",
      overflow_px: 0,
      selectors: { ".game-player-root iframe": { count: 1, visible_count: 1 } },
      frames: {
        ".game-player-root iframe": {
          selector: ".game-player-root iframe",
          count: 1,
          frame_count: 1,
          frames: [{
            index: 0,
            attached: true,
            url: "https://example.com/embed/hot-path",
            title: "Hot Path",
            text_sample: "Hot Path Score 0",
            scroll_width: 390,
            client_width: 390,
            overflow_px: 0,
            bounds_overflow_px: 0,
            overflow_offenders: [],
          }],
        },
      },
      text_matches: {},
      screenshot_label: "community-frame-profile-phone",
    },
    {
      name: "desktop",
      width: 1280,
      height: 900,
      route: { requested: "https://example.com/play/hot-path", observed: "/play/hot-path", expected_path: "/play/hot-path", matched: true, http_status: 200 },
      body_text_sample: "Hot Path",
      overflow_px: 0,
      selectors: { ".game-player-root iframe": { count: 1, visible_count: 1 } },
      frames: {
        ".game-player-root iframe": {
          selector: ".game-player-root iframe",
          count: 1,
          frame_count: 1,
          frames: [{
            index: 0,
            attached: true,
            url: "https://example.com/embed/hot-path",
            title: "Hot Path",
            text_sample: "Hot Path Score 0",
            scroll_width: 800,
            client_width: 800,
            overflow_px: 0,
            bounds_overflow_px: 0,
            overflow_offenders: [],
          }],
        },
      },
      text_matches: {},
      screenshot_label: "community-frame-profile-desktop",
    },
  ],
  console: { events: [], fatal_count: 0 },
  page_errors: [],
  dom_summary: { viewport_count: 2 },
};
const frameProfileAssessment = assessRiddleProofProfileEvidence(frameProfile, frameProfileEvidence);
assert.equal(frameProfileAssessment.status, "passed");
assert.equal(frameProfileAssessment.checks.find((check) => check.type === "frame_text_visible").status, "passed");
assert.equal(frameProfileAssessment.checks.find((check) => check.type === "frame_url_equals").status, "passed");
assert.equal(frameProfileAssessment.checks.find((check) => check.type === "frame_url_matches").status, "passed");
assert.equal(frameProfileAssessment.checks.find((check) => check.type === "frame_no_horizontal_overflow").status, "passed");
const overflowingFrameProfileAssessment = assessRiddleProofProfileEvidence(frameProfile, {
  ...frameProfileEvidence,
  viewports: [
    {
      ...frameProfileEvidence.viewports[0],
      frames: {
        ".game-player-root iframe": {
          ...frameProfileEvidence.viewports[0].frames[".game-player-root iframe"],
          frames: [{
            ...frameProfileEvidence.viewports[0].frames[".game-player-root iframe"].frames[0],
            overflow_px: 0,
            bounds_overflow_px: 132,
            overflow_offenders: [{
              selector: "canvas",
              overflow: 132,
              left_overflow_px: 0,
              right_overflow_px: 132,
              viewport_width: 390,
              rect: { left: 0, right: 522, width: 522 },
            }],
          }],
        },
      },
    },
    frameProfileEvidence.viewports[1],
  ],
});
const overflowingFrameCheck = overflowingFrameProfileAssessment.checks.find((check) => check.type === "frame_no_horizontal_overflow");
assert.equal(overflowingFrameProfileAssessment.status, "product_regression");
assert.equal(overflowingFrameCheck.status, "failed");
assert.equal(overflowingFrameCheck.evidence.viewports[0].max_overflow_px, 132);
const missingFrameTextAssessment = assessRiddleProofProfileEvidence(frameProfile, {
  ...frameProfileEvidence,
  viewports: [{
    ...frameProfileEvidence.viewports[0],
    frames: {
      ".game-player-root iframe": {
        ...frameProfileEvidence.viewports[0].frames[".game-player-root iframe"],
        frames: [{
          ...frameProfileEvidence.viewports[0].frames[".game-player-root iframe"].frames[0],
          title: "Other Game",
          text_sample: "Other Game Score 0",
        }],
      },
    },
  }, frameProfileEvidence.viewports[1]],
});
assert.equal(missingFrameTextAssessment.status, "product_regression");
assert.equal(missingFrameTextAssessment.checks.find((check) => check.type === "frame_text_visible").status, "failed");
const wrongFrameUrlAssessment = assessRiddleProofProfileEvidence(frameProfile, {
  ...frameProfileEvidence,
  viewports: [{
    ...frameProfileEvidence.viewports[0],
    frames: {
      ".game-player-root iframe": {
        ...frameProfileEvidence.viewports[0].frames[".game-player-root iframe"],
        frames: [{
          ...frameProfileEvidence.viewports[0].frames[".game-player-root iframe"].frames[0],
          url: "https://example.com/embed/other-game",
        }],
      },
    },
  }, frameProfileEvidence.viewports[1]],
});
assert.equal(wrongFrameUrlAssessment.status, "product_regression");
assert.equal(wrongFrameUrlAssessment.checks.find((check) => check.type === "frame_url_equals").status, "failed");
assert.equal(wrongFrameUrlAssessment.checks.find((check) => check.type === "frame_url_matches").status, "failed");
const duplicateRouteInventoryProfile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "docs-route-inventory",
  target: {
    route: "/docs/",
    viewports: [{ name: "desktop", width: 1280, height: 900 }],
  },
  checks: [{
    type: "route_inventory",
    expected_routes: [
      { name: "Preview", path: "/docs/preview" },
      { name: "Scrape", path: "/docs/scrape" },
    ],
    link_selector: "main a.tool-card[href^='/docs/']",
    source_selector: "main .tools-grid",
    route_path_prefix: "/docs/",
    require_unique_routes: false,
  }],
}, { url: "https://example.com" });
const duplicateRouteInventoryAssessment = assessRiddleProofProfileEvidence(duplicateRouteInventoryProfile, {
  ...routeInventoryEvidence,
  profile_name: "docs-route-inventory",
  target_url: "https://example.com/docs/",
  viewports: [{
    ...routeInventoryEvidence.viewports[0],
    route: { requested: "https://example.com/docs/", observed: "/docs/", expected_path: "/docs/", matched: true, http_status: 200 },
    route_inventory: {
      ...routeInventoryEvidence.viewports[0].route_inventory,
      expected_routes: duplicateRouteInventoryProfile.checks[0].expected_routes,
      link_selector: "main a.tool-card[href^='/docs/']",
      source_selector: "main .tools-grid",
      source_link_count: 3,
      source_unique_link_count: 2,
      duplicate_source_link_count: 1,
      duplicate_source_link_paths: ["/docs/preview"],
      duplicates_allowed: true,
      home_game_link_count: 3,
      home_unique_game_link_count: 2,
      home_links: [
        { text: "Preview", app_path: "/docs/preview" },
        { text: "Server Preview", app_path: "/docs/preview" },
        { text: "Scrape", app_path: "/docs/scrape" },
      ],
      direct_routes: [
        { phase: "direct", path: "/docs/preview", loaded: true, actual_app_path: "/docs/preview", source_visible: false },
        { phase: "direct", path: "/docs/scrape", loaded: true, actual_app_path: "/docs/scrape", source_visible: false },
      ],
      clickthroughs: [
        { path: "/docs/preview", clicked: true, snapshot: { actual_app_path: "/docs/preview", source_visible: false } },
        { path: "/docs/scrape", clicked: true, snapshot: { actual_app_path: "/docs/scrape", source_visible: false } },
      ],
      failures: [],
    },
  }],
});
const duplicateRouteInventoryCheck = duplicateRouteInventoryAssessment.checks.find((check) => check.type === "route_inventory");
assert.equal(duplicateRouteInventoryAssessment.status, "passed");
assert.equal(duplicateRouteInventoryCheck.status, "passed");
assert.equal(duplicateRouteInventoryCheck.evidence.source_link_count, 3);
assert.equal(duplicateRouteInventoryCheck.evidence.source_unique_link_count, 2);
assert.equal(duplicateRouteInventoryCheck.evidence.duplicate_source_link_count, 1);
assert.deepEqual(duplicateRouteInventoryCheck.evidence.duplicate_source_links, ["/docs/preview"]);
assert.equal(duplicateRouteInventoryCheck.evidence.duplicates_allowed, true);
const failedRouteInventoryAssessment = assessRiddleProofProfileEvidence(routeInventoryProfile, {
  ...routeInventoryEvidence,
  viewports: [{
    ...routeInventoryEvidence.viewports[0],
    route_inventory: {
      ...routeInventoryEvidence.viewports[0].route_inventory,
      failures: [{ code: "expected_route_missing_from_source", path: "/games/coin-clicker" }],
    },
  }],
});
assert.equal(failedRouteInventoryAssessment.status, "product_regression");
assert.equal(failedRouteInventoryAssessment.checks.find((check) => check.type === "route_inventory").status, "failed");
const partialProfileAssessment = assessRiddleProofProfileEvidence(profile, {
  ...profileEvidence,
  viewports: [profileEvidence.viewports[0]],
  dom_summary: { expected_viewport_count: 2, viewport_count: 1, partial: true },
});
assert.equal(partialProfileAssessment.status, "proof_insufficient");
assert.equal(partialProfileAssessment.checks.find((check) => check.type === "route_loaded").status, "passed");
const networkMockProfileAssessment = assessRiddleProofProfileEvidence(networkMockProfile, {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: "builder-network-mocks",
  target_url: "https://example.com/create",
  baseline_policy: "invariant_only",
  captured_at: "2026-05-13T00:00:00.000Z",
  viewports: [{
    name: "mobile",
    width: 390,
    height: 844,
    route: { requested: "https://example.com/create", observed: "/create", expected_path: "/create", matched: true, http_status: 200 },
    body_text_sample: "Game Builder",
    overflow_px: 0,
    selectors: {},
    text_matches: {},
    screenshot_label: "builder-network-mocks-mobile",
  }],
  console: { events: [], fatal_count: 0 },
  page_errors: [],
  network_mocks: [
    { ok: true, label: "chat", url: "https://example.com/v1/chat/completions", method: "POST", status: 200 },
    { ok: true, label: "save", url: "https://example.com/api/save", method: "POST", status: 200 },
    { ok: true, label: "build-retry", response_label: "first-build-fails", hit_index: 0, sequence_hit_index: 0, sequence_scope: "viewport", viewport: "mobile", response_index: 0, sequence_cycle: false, url: "https://example.com/api/build", method: "POST", status: 503 },
    { ok: true, label: "build-retry", response_label: "second-build-succeeds", hit_index: 1, sequence_hit_index: 1, sequence_scope: "viewport", viewport: "mobile", response_index: 1, sequence_cycle: false, url: "https://example.com/api/build", method: "POST", status: 200 },
    { ok: true, label: "build-retry", response_label: "first-build-fails", hit_index: 2, sequence_hit_index: 2, sequence_scope: "viewport", viewport: "mobile", response_index: 0, sequence_cycle: true, url: "https://example.com/api/build", method: "POST", status: 503 },
    { ok: true, label: "build-retry", response_label: "second-build-succeeds", hit_index: 3, sequence_hit_index: 3, sequence_scope: "viewport", viewport: "mobile", response_index: 1, sequence_cycle: true, url: "https://example.com/api/build", method: "POST", status: 200 },
  ],
  dom_summary: { viewport_count: 1, network_mock_hit_count: 6 },
});
assert.equal(networkMockProfileAssessment.status, "passed");
assert.equal(networkMockProfileAssessment.checks.find((check) => check.type === "network_mocks_succeeded").status, "passed");
assert.equal(networkMockProfileAssessment.checks.find((check) => check.type === "network_mocks_succeeded").evidence.hits_by_label.save, 1);
assert.equal(networkMockProfileAssessment.checks.find((check) => check.type === "network_mocks_succeeded").evidence.hits_by_label["build-retry"], 4);
assert.equal(networkMockProfileAssessment.checks.find((check) => check.type === "network_mocks_succeeded").evidence.required_hits_by_label["build-retry"], 4);
assert.equal(networkMockProfileAssessment.checks.find((check) => check.type === "network_mocks_succeeded").evidence.response_hits_by_label["build-retry"]["first-build-fails"], 2);
assert.equal(networkMockProfileAssessment.checks.find((check) => check.type === "network_mocks_succeeded").evidence.response_hits_by_label["build-retry"]["second-build-succeeds"], 2);
const expectedFailedMockConsoleAssessment = assessRiddleProofProfileEvidence(networkMockProfile, {
  ...networkMockProfileAssessment.evidence,
  console: {
    events: [{
      type: "error",
      text: "Failed to load resource: the server responded with a status of 503 (Service Unavailable)",
      location: { url: "https://example.com/api/build" },
    }],
    fatal_count: 1,
  },
});
const expectedFailedMockConsoleCheck = expectedFailedMockConsoleAssessment.checks.find((check) => check.type === "no_fatal_console_errors");
assert.equal(expectedFailedMockConsoleAssessment.status, "passed");
assert.equal(expectedFailedMockConsoleCheck.status, "passed");
assert.equal(expectedFailedMockConsoleCheck.evidence.console_fatal_count, 0);
assert.equal(expectedFailedMockConsoleCheck.evidence.allowed_console_fatal_count, 1);
assert.equal(expectedFailedMockConsoleCheck.evidence.explicitly_allowed_console_fatal_count, 0);
assert.equal(expectedFailedMockConsoleCheck.evidence.allowed_expected_network_mock_console_count, 1);
assert.equal(expectedFailedMockConsoleCheck.evidence.allowed_expected_network_mock_console_events[0].label, "build-retry");
assert.equal(expectedFailedMockConsoleCheck.evidence.allowed_expected_network_mock_console_events[0].response_label, "first-build-fails");
const expectedAbortedMockConsoleAssessment = assessRiddleProofProfileEvidence(networkAbortMockProfile, {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: "network-abort-mock",
  target_url: "https://example.com/settings",
  baseline_policy: "invariant_only",
  captured_at: "2026-05-13T00:00:00.000Z",
  viewports: [{
    name: "desktop",
    width: 1280,
    height: 720,
    route: { requested: "https://example.com/settings", observed: "/settings", expected_path: "/settings", matched: true, http_status: 200 },
    body_text_sample: "Settings",
    overflow_px: 0,
    selectors: {},
    text_matches: {},
    screenshot_label: "network-abort-mock-desktop",
  }],
  console: {
    events: [{
      type: "error",
      text: "Failed to load resource: net::ERR_FAILED",
      location: { url: "https://example.com/api/revoke" },
    }],
    fatal_count: 1,
  },
  page_errors: [],
  network_mocks: [
    { ok: true, label: "revoke-transport-failure", url: "https://example.com/api/revoke", method: "DELETE", abort: true, abort_error_code: "failed" },
    { ok: true, label: "sequence-abort", response_label: "first-network-fails", hit_index: 0, response_index: 0, url: "https://example.com/api/sequence-abort", method: "POST", abort: true, abort_error_code: "connectionreset" },
  ],
  dom_summary: { viewport_count: 1, network_mock_hit_count: 2 },
});
const expectedAbortedMockConsoleCheck = expectedAbortedMockConsoleAssessment.checks.find((check) => check.type === "no_fatal_console_errors");
assert.equal(expectedAbortedMockConsoleAssessment.status, "passed");
assert.equal(expectedAbortedMockConsoleCheck.status, "passed");
assert.equal(expectedAbortedMockConsoleCheck.evidence.console_fatal_count, 0);
assert.equal(expectedAbortedMockConsoleCheck.evidence.allowed_expected_network_mock_console_count, 1);
assert.equal(expectedAbortedMockConsoleCheck.evidence.allowed_expected_network_mock_console_events[0].label, "revoke-transport-failure");
assert.equal(expectedAbortedMockConsoleCheck.evidence.allowed_expected_network_mock_console_events[0].abort_error_code, "failed");
const expectedFailedMockRuntimeErrorAssessment = assessRiddleProofProfileEvidence(networkMockProfile, {
  ...networkMockProfileAssessment.evidence,
  console: {
    events: [{
      type: "error",
      text: "Minified React error #31; visit https://react.dev/errors/31 for the full message.",
      location: { url: "https://example.com/api/build" },
    }],
    fatal_count: 1,
  },
});
const expectedFailedMockRuntimeErrorCheck = expectedFailedMockRuntimeErrorAssessment.checks.find((check) => check.type === "no_fatal_console_errors");
assert.equal(expectedFailedMockRuntimeErrorAssessment.status, "product_regression");
assert.equal(expectedFailedMockRuntimeErrorCheck.status, "failed");
assert.equal(expectedFailedMockRuntimeErrorCheck.evidence.console_fatal_count, 1);
assert.equal(expectedFailedMockRuntimeErrorCheck.evidence.allowed_expected_network_mock_console_count, 0);
const unmatchedFailedMockConsoleAssessment = assessRiddleProofProfileEvidence(networkMockProfile, {
  ...networkMockProfileAssessment.evidence,
  console: {
    events: [{
      type: "error",
      text: "Failed to load resource: the server responded with a status of 503 (Service Unavailable)",
      location: { url: "https://example.com/api/unmocked-build" },
    }],
    fatal_count: 1,
  },
});
const unmatchedFailedMockConsoleCheck = unmatchedFailedMockConsoleAssessment.checks.find((check) => check.type === "no_fatal_console_errors");
assert.equal(unmatchedFailedMockConsoleAssessment.status, "product_regression");
assert.equal(unmatchedFailedMockConsoleCheck.status, "failed");
assert.equal(unmatchedFailedMockConsoleCheck.evidence.console_fatal_count, 1);
assert.equal(unmatchedFailedMockConsoleCheck.evidence.allowed_expected_network_mock_console_count, 0);
const missingNetworkMockAssessment = assessRiddleProofProfileEvidence(networkMockProfile, {
  ...networkMockProfileAssessment.evidence,
  network_mocks: [
    { ok: true, label: "chat", url: "https://example.com/v1/chat/completions", method: "POST", status: 200 },
  ],
});
assert.equal(missingNetworkMockAssessment.status, "product_regression");
assert.equal(missingNetworkMockAssessment.checks.find((check) => check.type === "network_mocks_succeeded").status, "failed");
assert.equal(missingNetworkMockAssessment.checks.find((check) => check.type === "network_mocks_succeeded").evidence.failed[0].label, "save");
const partialSequenceNetworkMockAssessment = assessRiddleProofProfileEvidence(networkMockProfile, {
  ...networkMockProfileAssessment.evidence,
  network_mocks: [
    { ok: true, label: "chat", url: "https://example.com/v1/chat/completions", method: "POST", status: 200 },
    { ok: true, label: "save", url: "https://example.com/api/save", method: "POST", status: 200 },
    { ok: true, label: "build-retry", response_label: "first-build-fails", hit_index: 0, response_index: 0, url: "https://example.com/api/build", method: "POST", status: 503 },
    { ok: true, label: "build-retry", response_label: "second-build-succeeds", hit_index: 1, response_index: 1, url: "https://example.com/api/build", method: "POST", status: 200 },
    { ok: true, label: "build-retry", response_label: "first-build-fails", hit_index: 2, response_index: 0, url: "https://example.com/api/build", method: "POST", status: 503 },
  ],
});
const partialSequenceNetworkMockCheck = partialSequenceNetworkMockAssessment.checks.find((check) => check.type === "network_mocks_succeeded");
assert.equal(partialSequenceNetworkMockAssessment.status, "product_regression");
assert.equal(partialSequenceNetworkMockCheck.status, "failed");
assert.equal(partialSequenceNetworkMockCheck.evidence.failed[0].label, "build-retry");
assert.equal(partialSequenceNetworkMockCheck.evidence.failed[0].reason, "required_mock_hit_count_not_met");
assert.equal(partialSequenceNetworkMockCheck.evidence.failed[0].required_hit_count, 4);
assert.equal(partialSequenceNetworkMockCheck.evidence.failed[0].hit_count, 3);
const cappedNetworkMockAssessment = assessRiddleProofProfileEvidence(cappedNetworkMockProfile, {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: "builder-network-mock-caps",
  target_url: "https://example.com/create",
  baseline_policy: "invariant_only",
  captured_at: "2026-05-15T00:00:00.000Z",
  viewports: [{
    name: "mobile",
    width: 390,
    height: 844,
    url: "https://example.com/create",
    route: { requested: "https://example.com/create", observed: "/create", expected_path: "/create", matched: true, http_status: 200 },
  }],
  console: { events: [], fatal_count: 0 },
  page_errors: [],
  network_mocks: [
    { ok: true, label: "analytics-at-most-two", url: "https://example.com/analytics", method: "POST", status: 204 },
    { ok: true, label: "analytics-at-most-two", url: "https://example.com/analytics", method: "POST", status: 204 },
  ],
});
const cappedNetworkMockCheck = cappedNetworkMockAssessment.checks.find((check) => check.type === "network_mocks_succeeded");
assert.equal(cappedNetworkMockAssessment.status, "passed");
assert.equal(cappedNetworkMockCheck.status, "passed");
assert.deepEqual(cappedNetworkMockCheck.evidence.max_hits_by_label, {
  "build-should-not-run": 0,
  "analytics-at-most-two": 2,
});
const forbiddenNetworkMockHitAssessment = assessRiddleProofProfileEvidence(cappedNetworkMockProfile, {
  ...cappedNetworkMockAssessment.evidence,
  network_mocks: [
    { ok: true, label: "build-should-not-run", url: "https://example.com/api/build", method: "POST", status: 200 },
    { ok: true, label: "analytics-at-most-two", url: "https://example.com/analytics", method: "POST", status: 204 },
    { ok: true, label: "analytics-at-most-two", url: "https://example.com/analytics", method: "POST", status: 204 },
    { ok: true, label: "analytics-at-most-two", url: "https://example.com/analytics", method: "POST", status: 204 },
  ],
});
const forbiddenNetworkMockHitCheck = forbiddenNetworkMockHitAssessment.checks.find((check) => check.type === "network_mocks_succeeded");
assert.equal(forbiddenNetworkMockHitAssessment.status, "product_regression");
assert.equal(forbiddenNetworkMockHitCheck.status, "failed");
assert.equal(forbiddenNetworkMockHitCheck.evidence.failed[0].label, "build-should-not-run");
assert.equal(forbiddenNetworkMockHitCheck.evidence.failed[0].reason, "forbidden_mock_hit");
assert.equal(forbiddenNetworkMockHitCheck.evidence.failed[0].max_hit_count, 0);
assert.equal(forbiddenNetworkMockHitCheck.evidence.failed[0].hit_count, 1);
assert.equal(forbiddenNetworkMockHitCheck.evidence.failed[1].label, "analytics-at-most-two");
assert.equal(forbiddenNetworkMockHitCheck.evidence.failed[1].reason, "mock_hit_count_exceeded");
assert.equal(forbiddenNetworkMockHitCheck.evidence.failed[1].max_hit_count, 2);
assert.equal(forbiddenNetworkMockHitCheck.evidence.failed[1].hit_count, 3);
const allowedConsoleAssessment = assessRiddleProofProfileEvidence(consoleAllowedProfile, {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: "expected-negative-console-profile",
  target_url: "https://example.com/create",
  baseline_policy: "invariant_only",
  captured_at: "2026-05-14T00:00:00.000Z",
  viewports: [{
    name: "mobile",
    width: 390,
    height: 844,
    route: { requested: "https://example.com/create", observed: "/create", expected_path: "/create", matched: true, http_status: 200 },
    body_text_sample: "Build failed",
    overflow_px: 0,
    selectors: {},
    text_matches: {},
    screenshot_label: "expected-negative-console-profile-mobile",
  }],
  console: {
    events: [
      { type: "error", text: "Failed to load resource: the server responded with a status of 503 (Service Unavailable)" },
      { type: "error", text: "Build failed: Error: Synthetic build outage" },
      {
        type: "error",
        text: "Failed to load resource: the server responded with a status of 404 (Not Found)",
        location: { url: "https://cdn.example.com/expected-negative-console-profile/resource.js" },
      },
      { type: "warning", text: "Non-fatal warning" },
    ],
    fatal_count: 3,
  },
  page_errors: [{ message: "Known app-level page error while testing recovery" }],
  dom_summary: { viewport_count: 1 },
});
const allowedConsoleCheck = allowedConsoleAssessment.checks.find((check) => check.type === "no_fatal_console_errors");
assert.equal(allowedConsoleAssessment.status, "passed");
assert.equal(allowedConsoleCheck.status, "passed");
assert.equal(allowedConsoleCheck.evidence.total_console_fatal_count, 3);
assert.equal(allowedConsoleCheck.evidence.allowed_console_fatal_count, 3);
assert.equal(allowedConsoleCheck.evidence.explicitly_allowed_console_fatal_count, 3);
assert.equal(allowedConsoleCheck.evidence.allowed_expected_network_mock_console_count, 0);
assert.equal(allowedConsoleCheck.evidence.console_fatal_count, 0);
assert.equal(allowedConsoleCheck.evidence.allowed_page_error_count, 1);
const unallowedConsoleAssessment = assessRiddleProofProfileEvidence(consoleAllowedProfile, {
  ...allowedConsoleAssessment.evidence,
  console: {
    events: [
      { type: "error", text: "Unexpected runtime exception" },
    ],
    fatal_count: 1,
  },
  page_errors: [],
});
const unallowedConsoleCheck = unallowedConsoleAssessment.checks.find((check) => check.type === "no_fatal_console_errors");
assert.equal(unallowedConsoleAssessment.status, "product_regression");
assert.equal(unallowedConsoleCheck.status, "failed");
assert.equal(unallowedConsoleCheck.evidence.console_fatal_count, 1);
const allowedConsoleWarningAssessment = assessRiddleProofProfileEvidence(consoleWarningProfile, {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: "warning-hygiene-profile",
  target_url: "https://example.com/proof/good-catches",
  baseline_policy: "invariant_only",
  captured_at: "2026-05-16T00:00:00.000Z",
  viewports: [{
    name: "desktop",
    width: 1280,
    height: 900,
    route: { requested: "https://example.com/proof/good-catches", observed: "/proof/good-catches", expected_path: "/proof/good-catches", matched: true, http_status: 200 },
    body_text_sample: "Good Catch Diary",
    overflow_px: 0,
    selectors: {},
    text_matches: {},
    screenshot_label: "warning-hygiene-profile-desktop",
  }],
  console: {
    events: [
      { type: "warning", text: "intentional dev-mode warning from test profile" },
      { type: "warn", text: "generic loader warning", location: { url: "https://cdn.example.com/known-warning.js" } },
      { type: "error", text: "Fatal errors are handled by no_fatal_console_errors" },
    ],
    fatal_count: 1,
  },
  page_errors: [],
  dom_summary: { viewport_count: 1 },
});
const allowedConsoleWarningCheck = allowedConsoleWarningAssessment.checks.find((check) => check.type === "no_console_warnings");
assert.equal(allowedConsoleWarningAssessment.status, "passed");
assert.equal(allowedConsoleWarningCheck.status, "passed");
assert.equal(allowedConsoleWarningCheck.evidence.total_console_warning_count, 2);
assert.equal(allowedConsoleWarningCheck.evidence.allowed_console_warning_count, 2);
assert.equal(allowedConsoleWarningCheck.evidence.console_warning_count, 0);
assert.equal(allowedConsoleWarningCheck.evidence.allowed_console_warning_samples.length, 2);
const unallowedConsoleWarningAssessment = assessRiddleProofProfileEvidence(consoleWarningProfile, {
  ...allowedConsoleWarningAssessment.evidence,
  console: {
    events: [
      { type: "warning", text: "Image with src /proof/good-catches/artifact.png was detected as the Largest Contentful Paint." },
    ],
    fatal_count: 0,
  },
});
const unallowedConsoleWarningCheck = unallowedConsoleWarningAssessment.checks.find((check) => check.type === "no_console_warnings");
assert.equal(unallowedConsoleWarningAssessment.status, "product_regression");
assert.equal(unallowedConsoleWarningCheck.status, "failed");
assert.equal(unallowedConsoleWarningCheck.evidence.console_warning_count, 1);
assert.match(unallowedConsoleWarningCheck.evidence.unallowed_console_warning_samples[0], /Largest Contentful Paint/);
const mountedPreviewAssessment = assessRiddleProofProfileEvidence(mountedPreviewProfile, {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: "preview-playground-basic",
  target_url: "https://preview.riddledc.com/s/ps_1234abcd/playground/",
  baseline_policy: "invariant_only",
  captured_at: "2026-05-12T00:00:00.000Z",
  viewports: [{
    name: "mobile",
    width: 390,
    height: 844,
    route: {
      requested: "https://preview.riddledc.com/s/ps_1234abcd/playground/",
      observed: "/s/ps_1234abcd/playground/",
      expected_path: "/playground/",
      matched: false,
      http_status: 200,
    },
    body_text_sample: "API Playground",
    overflow_px: 0,
    selectors: {},
    text_matches: {},
    screenshot_label: "preview-playground-basic-mobile",
  }],
  console: { events: [], fatal_count: 0 },
  page_errors: [],
  dom_summary: { viewport_count: 1 },
});
assert.equal(mountedPreviewAssessment.status, "passed");
assert.equal(mountedPreviewAssessment.route.matched, true);
const failedSetupProfileAssessment = assessRiddleProofProfileEvidence(profile, {
  ...profileEvidence,
  viewports: [
    {
      ...profileEvidence.viewports[0],
      setup_action_results: [
        {
          ok: false,
          action: "assert_text_visible",
          selector: "body",
          reason: "text_not_found",
          case_insensitive_text: "START BUILDING",
        },
      ],
    },
    profileEvidence.viewports[1],
  ],
});
assert.equal(failedSetupProfileAssessment.status, "product_regression");
const failedSetupCheck = failedSetupProfileAssessment.checks.find((check) => check.type === "setup_actions_succeeded");
assert.equal(failedSetupCheck.status, "failed");
assert.equal(failedSetupCheck.evidence.setup_summary.viewports[0].failed[0].case_insensitive_text, "START BUILDING");
const overflowingProfileAssessment = assessRiddleProofProfileEvidence(profile, {
  ...profileEvidence,
  viewports: [
    { ...profileEvidence.viewports[0], overflow_px: 24 },
    profileEvidence.viewports[1],
  ],
});
assert.equal(overflowingProfileAssessment.status, "product_regression");
assert.equal(overflowingProfileAssessment.checks.find((check) => check.type === "no_mobile_horizontal_overflow").status, "failed");
const boundsClippedProfileAssessment = assessRiddleProofProfileEvidence(profile, {
  ...profileEvidence,
  viewports: [
    {
      ...profileEvidence.viewports[0],
      overflow_px: 0,
      bounds_overflow_px: 0,
      overflow_offenders: [
        {
          selector: "iframe#community-game",
          overflow: 217,
          left_overflow_px: 217,
          right_overflow_px: 217,
          viewport_width: 390,
          rect: { left: -217, right: 607, width: 824 },
        },
      ],
    },
    profileEvidence.viewports[1],
  ],
});
const boundsClippedProfileCheck = boundsClippedProfileAssessment.checks.find((check) => check.type === "no_mobile_horizontal_overflow");
assert.equal(boundsClippedProfileAssessment.status, "product_regression");
assert.equal(boundsClippedProfileCheck.status, "failed");
assert.equal(boundsClippedProfileCheck.evidence.bounds_overflow_px[0], 217);
assert.equal(boundsClippedProfileCheck.evidence.overflow_offender_counts[0], 1);
const blockedProfileAssessment = assessRiddleProofProfileEvidence(profile, {
  ...profileEvidence,
  viewports: [
    {
      ...profileEvidence.viewports[0],
      navigation_error: "net::ERR_CONNECTION_REFUSED",
      route: { ...profileEvidence.viewports[0].route, matched: false, error: "net::ERR_CONNECTION_REFUSED" },
    },
  ],
});
assert.equal(blockedProfileAssessment.status, "environment_blocked");
assert.throws(
  () => normalizeRiddleProofProfile({ name: "bad", target: { url: "https://example.com" }, checks: [{ type: "unknown_check" }] }),
  /not supported/,
);
const profileArtifacts = collectRiddleProfileArtifactRefs({
  artifacts: [
    { name: "proof.json", url: "https://cdn.test/proof.json", kind: "json" },
    { name: "pricing-page-basic-mobile.png", url: "https://cdn.test/mobile.png", kind: "screenshot" },
  ],
});
assert.equal(profileArtifacts.length, 2);
const profileArtifactsWithSavedJsonNoise = collectRiddleProfileArtifactRefs({
  artifacts: [
    { name: "proof.json", url: "https://cdn.test/worker-proof.json" },
    { name: "console.json", url: "https://cdn.test/worker-console.json" },
    { name: "proof.json.json", url: "https://cdn.test/profile-proof.json.json" },
    { name: "console.json.json", url: "https://cdn.test/profile-console.json.json" },
    { name: "dom-summary.json.json", url: "https://cdn.test/dom-summary.json.json" },
    { name: "profile-phone.png", url: "https://cdn.test/profile-phone.png" },
    { name: "proof.json.json", url: "https://cdn.test/profile-proof.json.json" },
  ],
});
assert.deepEqual(
  profileArtifactsWithSavedJsonNoise.map((artifact) => artifact.name),
  ["proof.json", "console.json", "dom-summary.json", "profile-phone.png"],
);
assert.equal(profileArtifactsWithSavedJsonNoise.find((artifact) => artifact.name === "proof.json").url, "https://cdn.test/profile-proof.json.json");
assert.equal(profileArtifactsWithSavedJsonNoise.find((artifact) => artifact.name === "console.json").url, "https://cdn.test/profile-console.json.json");
assert.equal(extractRiddleProofProfileResult({ value: profileAssessment })?.status, "passed");

const metricWorkdir = mkdtempSync(path.join(os.tmpdir(), "riddle-proof-local-agent-metrics-"));
const metricRunnerCalls = [];
const metricAdapter = createCodexExecAgentAdapter({}, (request) => {
  metricRunnerCalls.push(request);
  return {
    ok: true,
    json: {
      decision: "ready_for_author",
      summary: "Recon evidence is concrete enough.",
      baseline_understanding: {
        reference: "provided request",
        target_route: "/",
        before_evidence_url: "https://example.com/before.png",
        visible_before_state: "The homepage is visible before implementation.",
        relevant_elements: ["homepage"],
        requested_change: "Add proof observability.",
        proof_focus: "Confirm the homepage still renders.",
        stop_condition: "The target copy is visible after implementation.",
        quality_risks: [],
      },
      continue_with_stage: "author",
      escalation_target: "agent",
      refined_inputs: { server_path: null, wait_for_selector: null, reference: null },
      reasons: ["baseline is specific"],
      source: "supervising_agent",
    },
    metrics: {
      purpose: request.purpose,
      prompt_chars: request.prompt.length,
      duration_ms: 17,
    },
  };
});
const metricState = createRunState({
  request: {
    repo: "riddledc/example",
    change_request: "Add proof observability.",
    verification_mode: "visual",
  },
});
const metricPayload = await metricAdapter.assessRecon({
  request: metricState.request,
  state: metricState,
  engineResult: {
    ok: false,
    state_path: path.join(metricWorkdir, "riddle-state.json"),
    checkpoint: "recon_supervisor_judgment",
    summary: "Recon assessment required.",
  },
  fullRiddleState: {
    after_worktree: metricWorkdir,
    route_hints: Array.from({ length: 20 }, (_, index) => ({ path: `/route-${index}`, score: index })),
    runtime_events: Array.from({ length: 200 }, (_, index) => ({
      kind: "sample",
      index,
      details: "large runtime event ".repeat(200),
    })),
    capture_diagnostics: Array.from({ length: 80 }, (_, index) => ({
      role: "before",
      index,
      visible_text_sample: "large diagnostic sample ".repeat(120),
    })),
    recon_results: Array.from({ length: 80 }, (_, index) => ({
      attempt: index + 1,
      summary: "large recon result ".repeat(120),
    })),
  },
  checkpoint: "recon_supervisor_judgment",
});
assert.equal(metricPayload.ok, true);
assert.equal(metricPayload.details.runner_metrics.duration_ms, 17);
assert.equal(metricPayload.details.runner_metrics.prompt_chars, metricRunnerCalls[0].prompt.length);
assert.equal(metricRunnerCalls[0].workdir, metricWorkdir);
assert.ok(metricRunnerCalls[0].prompt.length > 0);
assert.ok(metricRunnerCalls[0].prompt.length < 70_000);

const playableEvidence = {
  version: "riddle-proof.playability.v1",
  input_events: [{ type: "keyboard", key: "ArrowRight" }],
  state_delta: { changed: true, changed_keys: ["distance", "lean"], time_delta_ms: 900 },
  playfield_delta: { changed_percent: 8.2, changed_pixels: 18200, average_delta: 4.8 },
  assertions: {
    inputAccepted: true,
    stateChanged: true,
    playfieldMoved: true,
  },
};
const playableAssessment = assessPlayabilityEvidence({ proof_evidence: { playability: playableEvidence } });
assert.equal(playableAssessment.passed, true);
assert.equal(playableAssessment.input_observed, true);
assert.equal(playableAssessment.state_changed, true);
assert.equal(playableAssessment.motion_observed, true);
assert.equal(playableAssessment.time_progressed, true);
assert.equal(extractPlayabilityEvidence({ proof_evidence: { playability: playableEvidence } })?.version, "riddle-proof.playability.v1");

const staticAssessment = assessPlayabilityEvidence({
  playability_evidence: {
    version: "riddle-proof.playability.v1",
    input_events: [{ type: "pointer" }],
    state_delta: { changed: true, changed_keys: ["started"], time_delta_ms: 1200 },
    playfield_delta: { changed_percent: 0.01, changed_pixels: 20, average_delta: 0.02 },
  },
});
assert.equal(staticAssessment.passed, false);
assert.equal(staticAssessment.motion_observed, false);
assert.ok(staticAssessment.concerns.includes("playfield/canvas pixels did not measurably change"));

const basicGameplayEvidence = {
  version: "riddle-proof.basic-gameplay.v1",
  results: [
    {
      name: "Good Game",
      path: "/games/good",
      http_status: 200,
      console_error_count: 0,
      page_error_count: 0,
      initial: {
        body_text_length: 120,
        visible_large_node_count: 12,
        enabled_clickable_count: 1,
        visible_canvas_count: 1,
        screenshot_hash: "initial-shot",
        body_text_hash: "initial-text",
        canvases: [{ hash: "initial-canvas", visible: true }],
      },
      timed: {
        screenshot_hash: "timed-shot",
        body_text_hash: "initial-text",
        canvases: [{ hash: "initial-canvas", visible: true }],
      },
      after_action: {
        screenshot_hash: "after-shot",
        body_text_hash: "after-text",
        canvases: [{ hash: "after-canvas", visible: true }],
        reset_control_count: 1,
      },
      mobile: { overflow_px: 0 },
      action_results: [{ ok: true, action: "click" }],
    },
  ],
};
const basicGameplayAssessment = assessBasicGameplayEvidence({ proof_evidence: { basic_gameplay: basicGameplayEvidence } });
assert.equal(basicGameplayAssessment.passed, true);
assert.equal(basicGameplayAssessment.checked_routes, 1);
assert.equal(basicGameplayAssessment.warning_counts.missing_reset_path, undefined);
assert.equal(extractBasicGameplayEvidence(JSON.stringify(basicGameplayEvidence))?.version, "riddle-proof.basic-gameplay.v1");

const terminalRecoveryAssessment = assessBasicGameplayEvidence({
  results: [
    {
      name: "Terminal Canvas Game",
      path: "/games/terminal-canvas",
      http_status: 200,
      console_error_count: 0,
      page_error_count: 0,
      initial: {
        body_text_length: 120,
        visible_large_node_count: 12,
        enabled_clickable_count: 1,
        visible_canvas_count: 1,
        screenshot_hash: "terminal-before",
        body_text_hash: "terminal-text",
      },
      timed: {
        screenshot_hash: "terminal-before",
        body_text_hash: "terminal-text",
      },
      after_action: {
        screenshot_hash: "terminal-after",
        body_text_hash: "terminal-text",
      },
      mobile: { overflow_px: 0 },
      action_results: [{ ok: true, action: "key" }],
      restart_action_results: [{ ok: true, action: "canvas-click" }],
    },
  ],
});
assert.equal(terminalRecoveryAssessment.warning_counts.missing_reset_path, undefined);
assert.equal(terminalRecoveryAssessment.route_results[0].signals.reset_path_present, true);

const continuedActionAssessment = assessBasicGameplayEvidence({
  results: [
    {
      name: "Continued Action Game",
      path: "/games/continued",
      http_status: 200,
      console_error_count: 0,
      page_error_count: 0,
      initial: {
        body_text_length: 120,
        visible_large_node_count: 12,
        enabled_clickable_count: 1,
        visible_canvas_count: 1,
        screenshot_hash: "continued-before",
        body_text_hash: "continued-text",
      },
      timed: {
        screenshot_hash: "continued-before",
        body_text_hash: "continued-text",
      },
      after_action: {
        screenshot_hash: "continued-before",
        body_text_hash: "continued-text",
      },
      after_continue: {
        screenshot_hash: "continued-after",
        body_text_hash: "continued-text",
      },
      mobile: { overflow_px: 0 },
      action_results: [{ ok: true, action: "wait" }],
      continued_action_results: [{ ok: true, action: "canvas-pointer-down" }],
    },
  ],
});
assert.equal(continuedActionAssessment.passed, true);
assert.equal(continuedActionAssessment.route_results[0].signals.action_attempted, true);
assert.equal(continuedActionAssessment.route_results[0].signals.first_interaction_observed, true);
assert.equal(continuedActionAssessment.route_results[0].signals.state_change_observed, true);
assert.equal(continuedActionAssessment.route_results[0].diffs.after_continue?.changed, true);

const cleanupActionAssessment = assessBasicGameplayEvidence({
  results: [
    {
      name: "Terminal Cleanup Game",
      path: "/games/terminal-cleanup",
      http_status: 200,
      console_error_count: 0,
      page_error_count: 0,
      initial: {
        body_text_length: 120,
        visible_large_node_count: 12,
        enabled_clickable_count: 1,
        screenshot_hash: "cleanup-before",
        body_text_hash: "cleanup-text",
      },
      timed: {
        screenshot_hash: "cleanup-before",
        body_text_hash: "cleanup-text",
      },
      after_action: {
        screenshot_hash: "cleanup-before",
        body_text_hash: "cleanup-text",
      },
      after_cleanup: {
        screenshot_hash: "cleanup-ended",
        body_text_hash: "cleanup-ended-text",
        reset_control_count: 1,
      },
      mobile: { overflow_px: 0 },
      action_results: [{ ok: true, action: "click" }],
      continued_cleanup_action_results: [{ ok: true, action: "window-call" }],
    },
  ],
});
assert.equal(cleanupActionAssessment.passed, true);
assert.equal(cleanupActionAssessment.route_results[0].signals.state_change_observed, true);
assert.equal(cleanupActionAssessment.route_results[0].signals.reset_path_present, true);
assert.equal(cleanupActionAssessment.route_results[0].diffs.after_cleanup?.changed, true);

const cleanupFailureEvidence = {
  results: [
    {
      name: "Cleanup Failure Game",
      path: "/games/cleanup-failure",
      http_status: 200,
      console_error_count: 0,
      page_error_count: 0,
      initial: {
        body_text_length: 120,
        visible_large_node_count: 12,
        enabled_clickable_count: 1,
        screenshot_hash: "cleanup-failure-before",
        body_text_hash: "cleanup-failure-before-text",
      },
      timed: {
        screenshot_hash: "cleanup-failure-before",
        body_text_hash: "cleanup-failure-before-text",
      },
      after_action: {
        screenshot_hash: "cleanup-failure-after",
        body_text_hash: "cleanup-failure-after-text",
        reset_control_count: 1,
      },
      mobile: { overflow_px: 0 },
      action_results: [{ ok: true, action: "click" }],
      continued_cleanup_action_results: [{ ok: false, action: "evaluate", reason: "unexpected_return_value" }],
    },
  ],
};
const cleanupFailureAssessment = assessBasicGameplayEvidence(cleanupFailureEvidence);
const cleanupFailureCatches = createBasicGameplayCatchRecords(cleanupFailureAssessment, cleanupFailureEvidence);
assert.equal(cleanupFailureAssessment.warning_counts.some_actions_failed, 1);
assert.equal(cleanupFailureCatches[0].code, "action_failed");
assert.equal(cleanupFailureCatches[0].phase, "after_cleanup");
assert.equal(cleanupFailureCatches[0].reason, "unexpected_return_value");

const responsiveSetupFailureEvidence = {
  version: "riddle-proof.basic-gameplay.v1",
  site: "LilArcade",
  results: [
    {
      name: "Projectile Game",
      path: "/games/projectile-game",
      http_status: 200,
      console_error_count: 0,
      page_error_count: 0,
      initial: {
        body_text_length: 120,
        visible_large_node_count: 12,
        enabled_clickable_count: 1,
        screenshot_hash: "projectile-before",
        body_text_hash: "projectile-before-text",
      },
      timed: {
        screenshot_hash: "projectile-before",
        body_text_hash: "projectile-before-text",
      },
      after_action: {
        screenshot_hash: "projectile-after",
        body_text_hash: "projectile-after-text",
        reset_control_count: 1,
      },
      mobile: { overflow_px: 0 },
      action_results: [{ ok: true, action: "click" }],
      responsive_viewports: [
        {
          label: "ipad-mini",
          width: 768,
          height: 1024,
          phase: "after_continue",
          setup_action_results: [
            {
              ok: false,
              action: "window-call",
              path: "__projectileProof.waitForOutcome",
              reason: "unexpected_return_value",
            },
            {
              ok: false,
              action: "click",
              selector: ".launch-button",
              reason: "no_visible_enabled_match",
            },
          ],
        },
      ],
    },
  ],
};
const responsiveSetupFailureAssessment = assessBasicGameplayEvidence(responsiveSetupFailureEvidence);
assert.equal(responsiveSetupFailureAssessment.passed, false);
assert.equal(responsiveSetupFailureAssessment.failure_counts.responsive_setup_failed, 1);
assert.equal(responsiveSetupFailureAssessment.failing_routes[0].suite_failures.length, 2);
assert.equal(responsiveSetupFailureAssessment.failing_routes[0].suite_failures[0].viewport.label, "ipad-mini");
const responsiveSetupFailureCatches = createBasicGameplayCatchRecords(
  responsiveSetupFailureAssessment,
  responsiveSetupFailureEvidence,
);
assert.equal(responsiveSetupFailureCatches.length, 2);
assert.equal(responsiveSetupFailureCatches[0].code, "responsive_setup_failed");
assert.equal(responsiveSetupFailureCatches[1].selector, ".launch-button");
assert.equal(responsiveSetupFailureCatches[1].phase, "after_continue");

const responsiveBoundsEvidence = {
  version: "riddle-proof.basic-gameplay.v1",
  site: "LilArcade",
  results: [
    {
      name: "Community Player",
      path: "/community/max-collisions",
      http_status: 200,
      console_error_count: 0,
      page_error_count: 0,
      initial: {
        body_text_length: 120,
        visible_large_node_count: 12,
        enabled_clickable_count: 1,
        screenshot_hash: "community-before",
        body_text_hash: "community-before-text",
      },
      timed: {
        screenshot_hash: "community-before",
        body_text_hash: "community-before-text",
      },
      after_action: {
        screenshot_hash: "community-after",
        body_text_hash: "community-after-text",
        reset_control_count: 1,
      },
      mobile: { overflow_px: 0 },
      action_results: [{ ok: true, action: "click" }],
      responsive_viewports: [
        {
          label: "phone",
          width: 390,
          height: 844,
          phase: "after_continue",
          overflow_px: 0,
          overflow_offenders: [
            {
              selector: "iframe#community-game",
              overflow: 217,
              left_overflow_px: 217,
              right_overflow_px: 217,
              viewport_width: 390,
              rect: { left: -217, right: 607, width: 824 },
            },
          ],
        },
      ],
    },
  ],
};
const responsiveBoundsAssessment = assessBasicGameplayEvidence(responsiveBoundsEvidence);
assert.equal(responsiveBoundsAssessment.passed, false);
assert.equal(responsiveBoundsAssessment.failure_counts.responsive_bounds_clipped, 1);
assert.equal(responsiveBoundsAssessment.failing_routes[0].suite_failures[0].code, "responsive_bounds_clipped");
assert.equal(responsiveBoundsAssessment.failing_routes[0].suite_failures[0].overflow_px, 217);
const responsiveBoundsCatches = createBasicGameplayCatchRecords(
  responsiveBoundsAssessment,
  responsiveBoundsEvidence,
);
assert.equal(responsiveBoundsCatches.length, 1);
assert.equal(responsiveBoundsCatches[0].code, "responsive_bounds_clipped");
assert.equal(responsiveBoundsCatches[0].viewport.label, "phone");

const inertGameplayAssessment = assessBasicGameplayEvidence({
  results: [
    {
      name: "Inert Game",
      path: "/games/inert",
      http_status: 200,
      initial: {
        body_text_length: 120,
        visible_large_node_count: 12,
        enabled_clickable_count: 1,
        screenshot_hash: "same-shot",
        body_text_hash: "same-text",
      },
      timed: {
        screenshot_hash: "same-shot",
        body_text_hash: "same-text",
      },
      after_action: {
        screenshot_hash: "same-shot",
        body_text_hash: "same-text",
      },
      mobile: { overflow_px: 0 },
      action_results: [{ ok: true, action: "click" }],
    },
  ],
});
assert.equal(inertGameplayAssessment.passed, false);
assert.equal(inertGameplayAssessment.failure_counts.primary_control_inert, 1);

assert.ok(BASIC_GAMEPLAY_ACTION_TYPES.includes("window-call"));
assert.ok(BASIC_GAMEPLAY_ACTION_TYPES.includes("evaluate"));
assert.ok(BASIC_GAMEPLAY_ACTION_TYPES.includes("canvas-click"));
assert.ok(BASIC_GAMEPLAY_ACTION_TYPES.includes("set-input-value"));
assert.ok(BASIC_GAMEPLAY_ACTION_TYPES.includes("canvas-pointer-down"));
assert.ok(BASIC_GAMEPLAY_ACTION_TYPES.includes("canvas-pointer-move"));
assert.ok(BASIC_GAMEPLAY_ACTION_TYPES.includes("canvas-pointer-up"));
assert.ok(BASIC_GAMEPLAY_PROGRESS_CHECK_TYPES.includes("number_at_least"));
assert.ok(BASIC_GAMEPLAY_PROGRESS_CHECK_TYPES.includes("selector_count_equals"));
assert.ok(BASIC_GAMEPLAY_PROGRESS_CHECK_TYPES.includes("selector_count_equal"));
assert.ok(BASIC_GAMEPLAY_PROGRESS_CHECK_TYPES.includes("selector_count_eq"));
assert.equal(compactBasicGameplayText("ok \ud83d emoji 😀", 100), "ok emoji 😀");

const progressionGameplayEvidence = {
  version: "riddle-proof.basic-gameplay.v1",
  site: "LilArcade",
  results: [
    {
      name: "Cupcake Courier",
      path: "/games/cupcake-courier",
      http_status: 200,
      console_error_count: 0,
      page_error_count: 0,
      initial: {
        body_text_length: 120,
        visible_large_node_count: 12,
        enabled_clickable_count: 1,
        screenshot_hash: "cupcake-before",
        body_text_hash: "cupcake-before-text",
      },
      timed: {
        screenshot_hash: "cupcake-before",
        body_text_hash: "cupcake-before-text",
      },
      after_action: {
        screenshot_hash: "cupcake-after",
        body_text_hash: "cupcake-after-text",
        reset_control_count: 1,
      },
      mobile: { overflow_px: 0 },
      action_results: [{ ok: true, action: "evaluate" }],
      progression_checks: [
        {
          label: "invalid cupcake move does not increment steps",
          type: "number_unchanged",
          state_call: "gameAPI.getState",
          property_path: "steps",
          from_phase: "after_action",
          to_phase: "after_continue",
          before: { phase: "after_action", state_call: "gameAPI.getState", property_path: "steps", number: 1, count: 1, present: true },
          after: { phase: "after_continue", state_call: "gameAPI.getState", property_path: "steps", number: 2, count: 1, present: true },
        },
      ],
    },
  ],
};
const progressionGameplayAssessment = assessBasicGameplayEvidence(progressionGameplayEvidence);
assert.equal(progressionGameplayAssessment.passed, false);
assert.equal(progressionGameplayAssessment.failure_counts.progression_assertion_failed, 1);
assert.equal(progressionGameplayAssessment.failing_routes[0].suite_failures[0].state_call, "gameAPI.getState");
assert.equal(progressionGameplayAssessment.failing_routes[0].suite_failures[0].property_path, "steps");
const progressionCatchRecords = createBasicGameplayCatchRecords(progressionGameplayAssessment, progressionGameplayEvidence);
assert.equal(progressionCatchRecords[0].code, "progression_assertion_failed");
assert.equal(progressionCatchRecords[0].state_call, "gameAPI.getState");
assert.equal(progressionCatchRecords[0].before.number, 1);

const thresholdGameplayAssessment = assessBasicGameplayEvidence({
  version: "riddle-proof.basic-gameplay.v1",
  results: [
    {
      name: "Threshold Game",
      path: "/games/threshold",
      http_status: 200,
      console_error_count: 0,
      page_error_count: 0,
      initial: {
        body_text_length: 120,
        visible_large_node_count: 12,
        enabled_clickable_count: 1,
        screenshot_hash: "threshold-before",
        body_text_hash: "threshold-before-text",
      },
      timed: {
        screenshot_hash: "threshold-before",
        body_text_hash: "threshold-before-text",
      },
      after_action: {
        screenshot_hash: "threshold-after",
        body_text_hash: "threshold-after-text",
        reset_control_count: 1,
      },
      mobile: { overflow_px: 0 },
      action_results: [{ ok: true, action: "evaluate" }],
      progression_checks: [
        {
          label: "proof counter reaches threshold",
          type: "number_at_least",
          min: 3,
          after: { phase: "after_action", number: 3, count: 1, present: true },
        },
      ],
    },
  ],
});
assert.equal(thresholdGameplayAssessment.passed, true);

const compactedSelectorTextAssessment = assessBasicGameplayEvidence({
  version: "riddle-proof.basic-gameplay.v1",
  results: [
    {
      name: "Long Docs Page",
      path: "/docs/riddle-proof/markdown.md",
      http_status: 200,
      console_error_count: 0,
      page_error_count: 0,
      initial: {
        body_text_length: 3000,
        visible_large_node_count: 12,
        enabled_clickable_count: 1,
        screenshot_hash: "docs-before",
        body_text_hash: "docs-before-text",
      },
      timed: {
        screenshot_hash: "docs-before",
        body_text_hash: "docs-before-text",
      },
      after_action: {
        screenshot_hash: "docs-after",
        body_text_hash: "docs-after-text",
        reset_control_count: 1,
      },
      mobile: { overflow_px: 0 },
      action_results: [{ ok: true, action: "click" }],
      progression_checks: [
        {
          label: "long markdown includes deep section",
          type: "selector_text_matches",
          pattern: "##\\s*Proof Packets",
          after: {
            phase: "after_action",
            selector: "body",
            text: "# Riddle Proof Evidence-backed workflows for agent-authored browser changes.",
            pattern_matched: true,
          },
        },
      ],
    },
  ],
});
assert.equal(compactedSelectorTextAssessment.passed, true);

const auditMarkdownAssessment = assessBasicGameplayEvidence({
  version: "riddle-proof.basic-gameplay.v1",
  results: [
    {
      name: "MCP Markdown Artifact",
      path: "/mcp/markdown.md",
      assessment_mode: "audit",
      http_status: 200,
      console_error_count: 0,
      page_error_count: 0,
      initial: {
        body_text_length: 2700,
        visible_large_node_count: 1,
        enabled_clickable_count: 0,
        visible_canvas_count: 0,
        screenshot_hash: "mcp-markdown-before",
        body_text_hash: "mcp-markdown-text",
      },
      timed: {
        screenshot_hash: "mcp-markdown-before",
        body_text_hash: "mcp-markdown-text",
      },
      after_action: {
        screenshot_hash: "mcp-markdown-after",
        body_text_hash: "mcp-markdown-text",
      },
      mobile: { overflow_px: 0 },
      action_results: [{ ok: true, action: "wait" }],
      progression_checks: [
        {
          label: "markdown includes title",
          type: "selector_text_matches",
          pattern: "#\\s*Riddle MCP",
          after: {
            phase: "initial",
            selector: "body",
            text: "# Riddle MCP",
            pattern_matched: true,
          },
        },
      ],
    },
  ],
});
assert.equal(auditMarkdownAssessment.passed, true);
assert.equal(auditMarkdownAssessment.route_results[0].assessment_mode, "audit");
assert.equal(auditMarkdownAssessment.route_results[0].signals.surface_visible, true);
assert.equal(auditMarkdownAssessment.route_results[0].signals.action_attempted, false);

const exactSelectorCountGameplayAssessment = assessBasicGameplayEvidence({
  version: "riddle-proof.basic-gameplay.v1",
  results: [
    {
      name: "Exact Count Game",
      path: "/games/exact-count",
      http_status: 200,
      console_error_count: 0,
      page_error_count: 0,
      initial: {
        body_text_length: 120,
        visible_large_node_count: 12,
        enabled_clickable_count: 1,
        screenshot_hash: "exact-before",
        body_text_hash: "exact-before-text",
      },
      timed: {
        screenshot_hash: "exact-before",
        body_text_hash: "exact-before-text",
      },
      after_action: {
        screenshot_hash: "exact-after",
        body_text_hash: "exact-after-text",
        reset_control_count: 1,
      },
      mobile: { overflow_px: 0 },
      action_results: [{ ok: true, action: "click" }],
      progression_checks: [
        {
          label: "renders exactly four tabs",
          type: "selector_count_equals",
          expected: 4,
          after: { phase: "after_action", selector: ".mode-tab", count: 4, present: true },
        },
        {
          label: "has exactly one active tab",
          type: "selector_count_eq",
          value: 1,
          after: { phase: "after_action", selector: ".mode-tab.active", count: 2, present: true },
        },
      ],
    },
  ],
});
assert.equal(exactSelectorCountGameplayAssessment.passed, false);
assert.equal(exactSelectorCountGameplayAssessment.failure_counts.progression_assertion_failed, 1);
assert.equal(
  exactSelectorCountGameplayAssessment.failing_routes[0].suite_failures[0].reason,
  "selector_count_did_not_equal_expected",
);

const artifactBackedGameplayEvidence = {
  version: "riddle-proof.basic-gameplay.v1",
  results: [
    {
      name: "Canvas Game",
      path: "/games/canvas-game",
      http_status: 200,
      console_error_count: 0,
      page_error_count: 0,
      initial: {
        body_text_length: 120,
        visible_large_node_count: 12,
        enabled_clickable_count: 1,
        screenshot_hash: "canvas-before",
        body_text_hash: "canvas-before-text",
      },
      timed: {
        screenshot_hash: "canvas-before",
        body_text_hash: "canvas-before-text",
      },
      after_action: {
        screenshot_hash: "canvas-after",
        body_text_hash: "canvas-after-text",
        reset_control_count: 1,
      },
      after_continue: {
        screenshot_hash: "canvas-after",
        body_text_hash: "canvas-after-text",
        reset_control_count: 1,
      },
      after_cleanup: {
        screenshot_hash: "canvas-cleanup",
        body_text_hash: "canvas-cleanup-text",
        reset_control_count: 1,
      },
      mobile: { overflow_px: 0 },
      action_results: [{ ok: true, action: "click" }],
      progression_checks: [
        {
          label: "canvas keeps moving",
          type: "canvas_hash_changes",
          ok: false,
          reason: "canvas_or_visual_sample_hash_did_not_change",
          from_phase: "after_action",
          to_phase: "after_continue",
          before: { phase: "after_action", first_canvas_hash: "same-canvas" },
          after: { phase: "after_continue", first_canvas_hash: "same-canvas" },
        },
        {
          label: "terminal state appears before restart",
          type: "screenshot_hash_changes",
          ok: false,
          reason: "screenshot_hash_did_not_change",
          from_phase: "after_continue",
          to_phase: "after_cleanup",
          before: { phase: "after_continue", screenshot_hash: "same-shot" },
          after: { phase: "after_cleanup", screenshot_hash: "same-shot" },
        },
      ],
    },
  ],
};
attachBasicGameplayArtifactScreenshotHashes(artifactBackedGameplayEvidence, {
  artifacts: [
    { name: "canvas-game-after.png", kind: "screenshot", sha256: "after-one" },
    { name: "canvas-game-after-continue.png", kind: "screenshot", sha256: "after-two" },
    { name: "canvas-game-after-cleanup.png", kind: "screenshot", sha256: "after-three" },
  ],
});
assert.equal(artifactBackedGameplayEvidence.results[0].progression_checks[0].ok, true);
assert.equal(artifactBackedGameplayEvidence.results[0].progression_checks[0].artifact_resolution.source, "riddle_screenshot_artifacts");
assert.equal(artifactBackedGameplayEvidence.results[0].progression_checks[1].ok, true);
assert.equal(artifactBackedGameplayEvidence.results[0].after_cleanup.artifact_screenshot_hash, "after-three");
assert.equal(assessBasicGameplayEvidence(artifactBackedGameplayEvidence).passed, true);

const gameplayCatchSummary = createBasicGameplayCatchSummary({
  title: "Gem Mine texture warning",
  site: "LilArcade",
  route: "/games/gem-mine",
  detected_at: "2026-05-09T00:00:00.000Z",
  before: {
    results: [{
      name: "Gem Mine",
      path: "/games/gem-mine",
      http_status: 200,
      console_error_count: 1,
      page_error_count: 0,
      initial: { body_text_length: 120, visible_large_node_count: 12, visible_canvas_count: 1, screenshot_hash: "a", body_text_hash: "a" },
      timed: { screenshot_hash: "b", body_text_hash: "a" },
      after_action: { screenshot_hash: "c", body_text_hash: "b" },
      mobile: { overflow_px: 0 },
      action_results: [{ ok: true, action: "canvas-click" }],
    }],
  },
  after: basicGameplayEvidence,
  fix: { commit: "abc123", summary: "Replace existing generated canvas textures before registering them." },
  artifacts: [{ name: "evidence.json", path: "artifacts/evidence.json", sha256: "abc" }],
});
assert.equal(gameplayCatchSummary.version, "riddle-proof.basic-gameplay.catch.v1");
assert.equal(gameplayCatchSummary.fixed, true);
assert.ok(gameplayCatchSummary.before.notable_codes.includes("critical_console_error"));
assert.equal(gameplayCatchSummary.artifacts[0].sha256, "abc");

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

const handledListLoadProfile = readJson("./examples/profiles/handled-recovery-list-load.json");
assert.equal(handledListLoadProfile.name, "handled-recovery-list-load");
const savedItemsUnavailableMock = handledListLoadProfile.target.network_mocks.find(
  (mock) => mock.label === "saved-items-unavailable-load",
);
assert.equal(savedItemsUnavailableMock.status, 503);
assert.equal(savedItemsUnavailableMock.required_hit_count, 3);
assert.equal(Object.hasOwn(savedItemsUnavailableMock, "max_hit_count"), false);
assert.ok(handledListLoadProfile.checks.some(
  (check) => check.type === "text_visible" && check.text === "Failed to load saved items",
));
assert.ok(handledListLoadProfile.checks.some(
  (check) => check.type === "text_absent" && check.text === "No saved items yet",
));
assert.ok(handledListLoadProfile.checks.some(
  (check) => check.type === "text_absent" && check.text === "Synthetic saved items unavailable",
));
assert.ok(handledListLoadProfile.metadata.purpose.includes("Do not add max_hit_count to idempotent GET mocks"));

const terminalResultProfile = readJson("./examples/profiles/terminal-result-partial-evidence.json");
assert.equal(terminalResultProfile.name, "terminal-result-partial-evidence");
const terminalResultMock = terminalResultProfile.target.network_mocks.find(
  (mock) => mock.label === "api-console-sync-terminal-error-with-partial-evidence",
);
assert.equal(terminalResultMock.status, 200);
assert.equal(terminalResultMock.json.status, "completed_error");
assert.equal(terminalResultMock.json.success, false);
assert.equal(terminalResultMock.required_hit_count, 3);
assert.equal(terminalResultMock.max_hit_count, 3);
assert.deepEqual(terminalResultMock.request_body_contains, [
  "\"sync\":true",
  "\"include\":[\"screenshots\",\"console\",\"har\"]",
  "terminal-result-template-screenshot",
]);
assert.ok(terminalResultProfile.checks.some(
  (check) => check.type === "text_visible" && check.text === "partial results available",
));
assert.ok(terminalResultProfile.checks.some(
  (check) => check.type === "text_absent" && check.text === "Success",
));
assert.ok(terminalResultProfile.checks.some(
  (check) => check.type === "selector_text_visible" && check.selector === "[data-testid='api-console-screenshots']",
));
assert.ok(terminalResultProfile.checks.some(
  (check) => check.type === "selector_text_visible" && check.selector === "[data-testid='api-console-output']",
));
assert.ok(terminalResultProfile.checks.some(
  (check) => check.type === "selector_text_visible" && check.selector === "[data-testid='api-console-har']",
));
assert.ok(terminalResultProfile.checks.some(
  (check) => check.type === "selector_count_equals" && check.selector === "[data-testid='api-console-success-indicator']" && check.expected_count === 0,
));
assert.ok(terminalResultProfile.checks.some(
  (check) => check.type === "no_fatal_console_errors",
));
assert.ok(terminalResultProfile.checks.some(
  (check) => check.type === "no_console_warnings",
));
assert.ok(terminalResultProfile.metadata.purpose.includes("terminal error or timeout"));

const verifyRuntimePath = new URL("./runtime/lib/verify.py", import.meta.url);
const verifyRuntimeSource = readFileSync(verifyRuntimePath, "utf8");
const verifyPipelineSource = readFileSync(new URL("./runtime/pipelines/riddle-proof-verify.lobster", import.meta.url), "utf8");
execFileSync("python3", ["-m", "py_compile", verifyRuntimePath.pathname]);
assert.match(verifyRuntimeSource, /def audit_no_diff_mode/);
assert.match(verifyRuntimeSource, /Audit\/no-diff mode skips after-worktree build/);
assert.match(verifyRuntimeSource, /capture_current_target/);
assert.match(verifyRuntimeSource, /visual_delta_required_for_state/);
assert.match(verifyPipelineSource, /After worktree: not required for audit\/no-diff verify/);

function withMeasuredVisualEvidence(state = {}) {
  return {
    ...state,
    verification_mode: "visual",
    verify_status: "evidence_captured",
    before_cdn: state.before_cdn || "https://cdn.example.com/before.png",
    after_cdn: state.after_cdn || "https://cdn.example.com/after.png",
    evidence_bundle: {
      ...(state.evidence_bundle || {}),
      verification_mode: "visual",
      artifact_contract: {
        ...((state.evidence_bundle || {}).artifact_contract || {}),
        required: {
          ...(((state.evidence_bundle || {}).artifact_contract || {}).required || {}),
          visual_delta: true,
        },
      },
      after: {
        ...((state.evidence_bundle || {}).after || {}),
        visual_delta: {
          status: "measured",
          passed: true,
          change_percent: 2.4,
        },
      },
    },
  };
}

function withSemanticMetricEvidence(state = {}) {
  return {
    ...state,
    verification_mode: "visual",
    verify_status: "evidence_captured",
    before_cdn: state.before_cdn || "https://cdn.example.com/before.png",
    after_cdn: state.after_cdn || "https://cdn.example.com/after.png",
    evidence_bundle: {
      ...(state.evidence_bundle || {}),
      verification_mode: "riddle_semantic_visual_artifacts",
      artifact_contract: {
        ...((state.evidence_bundle || {}).artifact_contract || {}),
        required: {
          ...(((state.evidence_bundle || {}).artifact_contract || {}).required || {}),
          semantic_dom_metrics: true,
          mobile_overflow_fixed: true,
          visual_delta: false,
        },
      },
      after: {
        ...((state.evidence_bundle || {}).after || {}),
        metrics: {
          mobile_overflow_fixed: true,
          overflowing_pages: [],
        },
      },
    },
  };
}

function baseState() {
  return {
    version: "riddle-proof.run-state.v1",
    status: "running",
    created_at: "2026-04-15T00:00:00.000Z",
    updated_at: "2026-04-15T00:00:00.000Z",
    request: {
      repo: "davisdiehl/lilarcade",
      change_request: "Add a cool new visual to the tic tac toe game.",
      verification_mode: "visual",
    },
    iterations: 6,
    last_checkpoint: "ship_review",
    events: [
      {
        ts: "2026-04-15T00:00:00.000Z",
        kind: "engine_result",
        checkpoint: "ship_review",
      },
    ],
  };
}

const terminalMetadata = normalizeTerminalMetadata({
  riddleState: {
    pr_url: "https://github.com/davisdiehl/lilarcade/pull/255",
    target_branch: "tictactoe-board-polish",
    marked_ready: true,
    left_draft: false,
    ci_status: "no_checks",
    ship_commit: "96f5f86",
    ship_remote_head: "96f5f86",
    proof_comment_url: "https://github.com/davisdiehl/lilarcade/pull/255#issuecomment-1",
    before_cdn: "https://example.com/before.png",
    after_cdn: "https://example.com/after.png",
    discord_notification: {
      ok: true,
      channel_id: "111111111111111111",
      message_id: "333333333333333333",
    },
    proof_decision: "ready_to_ship",
    merge_recommendation: "ready_to_ship (supervising-agent proof assessment)",
    finalized: true,
  },
});

assert.deepEqual(terminalMetadata, {
  pr_url: "https://github.com/davisdiehl/lilarcade/pull/255",
  pr_branch: "tictactoe-board-polish",
  marked_ready: true,
  left_draft: false,
  ci_status: "no_checks",
  ship_commit: "96f5f86",
  ship_remote_head: "96f5f86",
  proof_comment_url: "https://github.com/davisdiehl/lilarcade/pull/255#issuecomment-1",
  before_artifact_url: "https://example.com/before.png",
  after_artifact_url: "https://example.com/after.png",
  notification: {
    ok: true,
    channel_id: "111111111111111111",
    message_id: "333333333333333333",
  },
  proof_decision: "ready_to_ship",
  merge_recommendation: "ready_to_ship (supervising-agent proof assessment)",
  finalized: true,
});

const state = applyTerminalMetadata(baseState(), terminalMetadata);
assert.equal(state.pr_url, "https://github.com/davisdiehl/lilarcade/pull/255");
assert.equal(state.pr_branch, "tictactoe-board-polish");
assert.equal(state.marked_ready, true);
assert.equal(state.ci_status, "no_checks");
assert.equal(state.proof_comment_url, "https://github.com/davisdiehl/lilarcade/pull/255#issuecomment-1");
assert.equal(state.notification.message_id, "333333333333333333");

const mergedState = applyPrLifecycleState(baseState(), {
  status: "MERGED",
  pr_url: "https://github.com/davisdiehl/lilarcade/pull/255",
  number: 255,
  headRefName: "tictactoe-board-polish",
  baseRefName: "main",
  mergeCommit: { oid: "merge123" },
  mergedAt: "2026-04-16T05:00:00.000Z",
  cleanup: { worktrees_removed: 2 },
});
assert.equal(mergedState.status, "completed");
assert.equal(mergedState.ok, true);
assert.equal(mergedState.pr_state?.status, "merged");
assert.equal(mergedState.pr_state?.head_branch, "tictactoe-board-polish");
assert.equal(mergedState.merge_commit, "merge123");
assert.equal(mergedState.merged_at, "2026-04-16T05:00:00.000Z");
assert.equal(mergedState.cleanup_report?.worktrees_removed, 2);
const mergedSnapshot = createRunStatusSnapshot(mergedState, "2026-04-16T05:00:01.000Z");
assert.equal(mergedSnapshot.pr_state?.status, "merged");
assert.equal(mergedSnapshot.merge_commit, "merge123");
assert.equal(mergedSnapshot.is_terminal, true);
assert.equal(mergedSnapshot.monitor_should_continue, false);

const result = createRunResult({
  state,
  status: "shipped",
  state_path: "/tmp/riddle-proof-state.json",
  last_summary: "Ship completed.",
  metadata: terminalMetadata,
});

assert.deepEqual(result, {
  ok: true,
  status: "shipped",
  state_path: "/tmp/riddle-proof-state.json",
  iterations: 6,
  last_checkpoint: "ship_review",
  last_summary: "Ship completed.",
  event_count: 1,
  pr_url: "https://github.com/davisdiehl/lilarcade/pull/255",
  pr_branch: "tictactoe-board-polish",
  marked_ready: true,
  left_draft: false,
  ci_status: "no_checks",
  ship_commit: "96f5f86",
  ship_remote_head: "96f5f86",
  proof_comment_url: "https://github.com/davisdiehl/lilarcade/pull/255#issuecomment-1",
  before_artifact_url: "https://example.com/before.png",
  after_artifact_url: "https://example.com/after.png",
  notification: {
    ok: true,
    channel_id: "111111111111111111",
    message_id: "333333333333333333",
  },
  proof_decision: "ready_to_ship",
  merge_recommendation: "ready_to_ship (supervising-agent proof assessment)",
  finalized: true,
});

assert.equal(isTerminalStatus("shipped"), true);
assert.equal(isTerminalStatus("running"), false);
assert.equal(isSuccessfulStatus("blocked"), false);
assert.equal(isSuccessfulStatus("ready_to_ship"), true);

const diagnosticArgs = {
  script: "await page.goto('/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile')",
  localStorage: { session: "secret" },
  headers: { Authorization: "Bearer secret" },
  nested: {
    api_key: "secret",
    safe: "ok",
  },
  long: "x".repeat(2105),
};
const redactedDiagnosticArgs = redactForProofDiagnostics(diagnosticArgs);
assert.equal(redactedDiagnosticArgs.script.startsWith("await page.goto"), true);
assert.equal(redactedDiagnosticArgs.localStorage, "[redacted]");
assert.equal(redactedDiagnosticArgs.headers, "[redacted]");
assert.equal(redactedDiagnosticArgs.nested.api_key, "[redacted]");
assert.equal(redactedDiagnosticArgs.nested.safe, "ok");
assert.equal(redactedDiagnosticArgs.long.endsWith("... [truncated]"), true);

const diagnosticPayload = {
  ok: true,
  outputs: [
    { name: "console.json", url: "https://example.com/console.json" },
  ],
  screenshots: [
    { name: "after-proof.png", url: "https://example.com/after-proof.png" },
  ],
  artifacts: [
    {
      name: "metering.json",
      kind: "json",
      role: "diagnostic",
      path: "/tmp/riddle-proof/metering.json",
      metadata: { samples: 64 },
    },
  ],
  _artifact_json: {
    "console.json": { summary: { errors: 0, warnings: 1 } },
    "proof.json": {
      result: {
        audio_ready: true,
        playhead_synced: true,
      },
    },
    "visual-diff.json": {
      changePercent: 1.42,
      diffPixelCount: 14094,
    },
  },
  _artifact_errors: {
    "missing.json": "404 not found",
  },
};
const artifactSummary = summarizeCaptureArtifacts(diagnosticPayload);
assert.equal(artifactSummary.outputs[0].name, "console.json");
assert.equal(artifactSummary.screenshots[0].name, "after-proof.png");
assert.equal(artifactSummary.artifacts[0].metadata_keys[0], "samples");
assert.deepEqual(artifactSummary.result_keys, ["audio_ready", "changePercent", "diffPixelCount", "playhead_synced"]);
assert.deepEqual(artifactSummary.artifact_json, ["console.json", "proof.json", "visual-diff.json"]);
assert.equal(artifactSummary.artifact_errors["missing.json"], "404 not found");
assert.equal(artifactSummary.console_summary.warnings, 1);

const captureDiagnostic = createCaptureDiagnostic({
  label: "after",
  tool: "riddle_server_preview",
  captured_at: "2026-04-18T00:00:00.000Z",
  args: diagnosticArgs,
  payload: diagnosticPayload,
  route: "/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile",
  preview_url: "https://riddle.example/previews/sp_123",
  wait_for_selector: "[data-proof-ready='true']",
  evidence: {
    globalThisEvidence: {
      bpm: 112,
      token: "secret",
    },
  },
});
assert.equal(captureDiagnostic.version, "riddle-proof.capture-diagnostic.v1");
assert.equal(captureDiagnostic.ok, true);
assert.equal(captureDiagnostic.args.headers, "[redacted]");
assert.equal(captureDiagnostic.args.nested.safe, "ok");
assert.equal(captureDiagnostic.evidence.globalThisEvidence.token, "[redacted]");
assert.equal(captureDiagnostic.artifact_summary.result_keys.includes("playhead_synced"), true);

const diagnosticState = {};
appendCaptureDiagnostic(diagnosticState, { label: "first", payload: diagnosticPayload }, 2);
appendCaptureDiagnostic(diagnosticState, { label: "second", payload: diagnosticPayload }, 2);
appendCaptureDiagnostic(diagnosticState, { label: "third", payload: diagnosticPayload }, 2);
assert.equal(diagnosticState.capture_diagnostics.length, 2);
assert.equal(diagnosticState.capture_diagnostics[0].label, "second");
assert.equal(diagnosticState.capture_diagnostics[1].label, "third");

const fallbackMetadata = normalizeTerminalMetadata({
  engineResult: {
    prUrl: "https://github.com/example/repo/pull/1",
    markedReady: false,
    shipReport: {
      pr_branch: "proof/demo",
      shipped_commit: "abc123",
      ci_status: "passed",
      proof_comment_url: "https://github.com/example/repo/pull/1#issuecomment-2",
      before_artifact_url: "https://example.com/before-fallback.png",
      after_artifact_url: "https://example.com/after-fallback.png",
    },
    checkpointContract: {
      details: {
        finalized: false,
      },
    },
  },
});

assert.deepEqual(fallbackMetadata, {
  pr_url: "https://github.com/example/repo/pull/1",
  pr_branch: "proof/demo",
  marked_ready: false,
  ci_status: "passed",
  ship_commit: "abc123",
  proof_comment_url: "https://github.com/example/repo/pull/1#issuecomment-2",
  before_artifact_url: "https://example.com/before-fallback.png",
  after_artifact_url: "https://example.com/after-fallback.png",
  ship_report: {
    pr_branch: "proof/demo",
    shipped_commit: "abc123",
    ci_status: "passed",
    proof_comment_url: "https://github.com/example/repo/pull/1#issuecomment-2",
    before_artifact_url: "https://example.com/before-fallback.png",
    after_artifact_url: "https://example.com/after-fallback.png",
  },
  finalized: false,
});

const referenceRun = readJson("./fixtures/shipped-oc-visual-run.json");
const referenceParams = toRiddleProofRunParams({
  repo: referenceRun.request.repo,
  branch: referenceRun.request.branch,
  change_request: referenceRun.request.change_request,
  success_criteria: referenceRun.request.success_criteria,
  verification_mode: referenceRun.request.verification_mode,
  assertions_json: JSON.stringify(referenceRun.evidence_bundle.assertions),
  discord_channel: referenceRun.request.integration_context.channel_id,
  discord_thread_id: referenceRun.request.integration_context.thread_id,
  discord_message_id: referenceRun.request.integration_context.message_id,
  discord_source_url: referenceRun.request.integration_context.source_url,
  auth_localStorage_json: "{\"session\":\"local\"}",
  auth_cookies_json: "[{\"name\":\"session\",\"value\":\"cookie\"}]",
  auth_headers_json: "{\"Authorization\":\"Bearer token\"}",
});
const referenceMetadata = normalizeTerminalMetadata({
  riddleState: referenceRun.riddle_state,
});

assert.deepEqual(referenceMetadata, {
  pr_url: "https://github.com/davisdiehl/lilarcade/pull/255",
  marked_ready: true,
  notification: {
    ok: true,
    status: 200,
    channel_id: "111111111111111111",
    parent_channel_id: "",
    thread_id: "111111111111111111",
    source_message_id: "222222222222222222",
    message_id: "333333333333333333",
    pr_url: "https://github.com/davisdiehl/lilarcade/pull/255",
  },
  proof_decision: "ready_to_ship",
  merge_recommendation: "ready_to_ship (supervising-agent proof assessment)",
  finalized: true,
});

assert.equal(referenceParams.integration_context.source, "discord");
assert.equal(referenceParams.integration_context.thread_id, "111111111111111111");
assert.equal(referenceParams.integration_context.metadata.tool, "riddle_proof_change");
assert.equal(referenceParams.assertions.interactive_elements, 11);
assert.equal(referenceParams.auth_localStorage_json, "{\"session\":\"local\"}");
assert.equal(referenceParams.auth_cookies_json, "[{\"name\":\"session\",\"value\":\"cookie\"}]");
assert.equal(referenceParams.auth_headers_json, "{\"Authorization\":\"Bearer token\"}");
assert.equal(parseOpenClawAssertions("plain text assertion"), "plain text assertion");
assert.deepEqual(parseOpenClawJsonObjectOrArray("[{\"name\":\"tablet\",\"width\":768,\"height\":1024}]", "viewport_matrix_json"), [
  { name: "tablet", width: 768, height: 1024 },
]);

const invalidReferenceParams = toRiddleProofRunParams({
  repo: "davisdiehl/lilarcade",
  change_request: "Change sequencer helper copy.",
  reference: "use the public sequencer route",
});
assert.equal(invalidReferenceParams.reference, undefined);
assert.equal(invalidReferenceParams.integration_context.metadata.reference_input_ignored, "use the public sequencer route");
const validReferenceParams = toRiddleProofRunParams({
  repo: "davisdiehl/lilarcade",
  change_request: "Change sequencer helper copy.",
  reference: "both",
});
assert.equal(validReferenceParams.reference, "both");
assert.equal(validReferenceParams.integration_context.metadata.reference_input_ignored, undefined);

assert.equal(toRiddleProofRunParams({
  repo: "riddledc/example",
  change_request: "Keep the PR in draft for a debug run.",
  ship_after_verify: true,
  leave_draft: true,
}).leave_draft, true);

const auditNoDiffParams = toRiddleProofRunParams({
  repo: "riddledc/example",
  change_request: "Audit the live site without code changes.",
  implementation_mode: "none",
  require_diff: false,
  allow_code_changes: false,
  ship_mode: "none",
});
assert.equal(auditNoDiffParams.implementation_mode, "none");
assert.equal(auditNoDiffParams.require_diff, false);
assert.equal(auditNoDiffParams.allow_code_changes, false);

const visualSessionParams = toRiddleProofRunParams({
  repo: "davisdiehl/lilarcade",
  change_request: "Iterate Luge Run against the reusable visual spec.",
  verification_mode: "visual",
  resume_session: "{\"version\":\"riddle-proof.visual-session.v1\",\"session_id\":\"luge-visual-v1\",\"fingerprint\":\"sha256:abc\"}",
  target_image_url: "https://cdn.example.com/luge-spec.png",
  target_image_hash: "sha256:luge-spec",
  viewport_matrix_json: "[{\"name\":\"phone\",\"width\":390,\"height\":844},{\"name\":\"ipad-mini\",\"width\":768,\"height\":1024}]",
  deterministic_setup_json: "{\"seed\":\"luge-visual-v1\"}",
});
assert.equal(visualSessionParams.resume_session, "{\"version\":\"riddle-proof.visual-session.v1\",\"session_id\":\"luge-visual-v1\",\"fingerprint\":\"sha256:abc\"}");
assert.equal(visualSessionParams.target_image_url, "https://cdn.example.com/luge-spec.png");
assert.equal(visualSessionParams.target_image_hash, "sha256:luge-spec");
assert.deepEqual(visualSessionParams.viewport_matrix, [
  { name: "phone", width: 390, height: 844 },
  { name: "ipad-mini", width: 768, height: 1024 },
]);
assert.deepEqual(visualSessionParams.deterministic_setup, { seed: "luge-visual-v1" });

const referenceState = createRunState({
  state_path: referenceRun.harness.riddle_state_path,
  created_at: referenceRun.captured_at,
  updated_at: referenceRun.captured_at,
  request: referenceParams,
});
for (const event of referenceRun.harness.events) appendRunEvent(referenceState, event);
referenceState.iterations = referenceRun.harness.iterations;

const referenceResult = createRunResult({
  state: referenceState,
  status: referenceRun.harness.status,
  state_path: referenceRun.harness.riddle_state_path,
  last_summary: referenceRun.harness.last_summary,
  metadata: referenceMetadata,
  evidence_bundle: referenceRun.evidence_bundle,
});

assert.equal(referenceResult.ok, true);
assert.equal(referenceResult.status, "shipped");
assert.equal(referenceResult.iterations, 6);
assert.equal(referenceResult.event_count, 3);
assert.equal(referenceResult.last_checkpoint, "ship_review");
assert.equal(referenceResult.pr_url, "https://github.com/davisdiehl/lilarcade/pull/255");
assert.equal(referenceResult.marked_ready, true);
assert.equal(referenceResult.notification.message_id, "333333333333333333");
assert.equal(referenceResult.proof_decision, "ready_to_ship");
assert.equal(referenceResult.finalized, true);
assert.equal(referenceResult.evidence_bundle.verification_mode, "visual");
assert.equal(referenceResult.evidence_bundle.after.url, "https://riddle-screenshots-748553757828.s3.amazonaws.com/server-previews/sp_5af97d38/after-proof.png");
assert.equal(referenceResult.evidence_bundle.baselines[0].kind, "before");
assert.equal(referenceResult.evidence_bundle.assertions.interactive_elements, 11);
assert.equal(referenceState.request.integration_context.source, "discord");

const blockedState = setRunStatus(createRunState({
  request: { change_request: "needs more proof", verification_mode: "audio" },
  run_id: "rp_blocked",
  created_at: "2026-04-15T00:00:00.000Z",
}), "blocked", "2026-04-15T00:01:00.000Z");
assert.equal(blockedState.ok, false);
assert.equal(blockedState.updated_at, "2026-04-15T00:01:00.000Z");

const statusState = createRunState({
  request: {
    repo: "riddledc/example",
    branch: "proof/worktree",
    change_request: "track proof run status",
  },
  run_id: "rp_status",
  state_path: "/tmp/riddle-proof/state.json",
  worktree_path: "/tmp/riddle-proof/worktree",
  created_at: "2026-04-15T00:00:00.000Z",
});
appendStageHeartbeat(statusState, {
  stage: "setup",
  wait_reason: "waiting_for_clean_worktree",
  ts: "2026-04-15T00:00:05.000Z",
});
const statusSnapshot = createRunStatusSnapshot(statusState, "2026-04-15T00:00:10.000Z");
assert.equal(statusSnapshot.run_id, "rp_status");
assert.equal(statusSnapshot.current_stage, "setup");
assert.equal(statusSnapshot.state_path, "/tmp/riddle-proof/state.json");
assert.equal(statusSnapshot.worktree_path, "/tmp/riddle-proof/worktree");
assert.equal(statusSnapshot.branch, "proof/worktree");
assert.equal(statusSnapshot.elapsed_ms, 10000);
assert.equal(statusSnapshot.is_terminal, false);
assert.equal(statusSnapshot.monitor_should_continue, true);
assert.equal(statusSnapshot.latest_event.kind, "stage.heartbeat");
assert.equal(statusSnapshot.latest_event.details.wait_reason, "waiting_for_clean_worktree");
assert.equal(statusSnapshot.run_card.version, "riddle-proof.run-card.v1");
assert.equal(statusSnapshot.run_card.goal.repo, "riddledc/example");
assert.equal(createRiddleProofRunCard(statusState, { at: "2026-04-15T00:00:10.000Z" }).current_phase.stage, "setup");
assert.equal(typeof createCodexExecAgentAdapter, "function");
assert.equal(typeof createLocalAgentAdapter, "function");

const missingAdapterResult = await runRiddleProof({
  request: {
    change_request: "Wire the proof runner.",
    verification_mode: "visual",
  },
  workdir: "/tmp/riddle-proof-workdir",
  adapters: {},
});
assert.equal(missingAdapterResult.status, "blocked");
assert.equal(missingAdapterResult.blocker.code, "implementation_adapter_not_configured");

const auditCalls = [];
const auditNoDiffResult = await runRiddleProof({
  request: {
    repo: "riddledc/example",
    change_request: "Audit the current site without implementation.",
    verification_mode: "visual",
    implementation_mode: "none",
    require_diff: false,
    allow_code_changes: false,
    ship_mode: "none",
  },
  max_iterations: 1,
  adapters: {
    proof: {
      async prove(input) {
        auditCalls.push(`prove:${input.implementation === undefined}`);
        return {
          ok: true,
          evidence_bundle: {
            verification_mode: "visual",
            after: {
              kind: "after",
              role: "after_proof",
              url: "https://example.com/audit.png",
            },
            artifacts: [],
          },
        };
      },
    },
    judge: {
      async assessProof() {
        auditCalls.push("judge");
        return {
          decision: "ready_to_ship",
          summary: "Audit evidence is sufficient.",
          source: "supervisor",
        };
      },
    },
  },
});
assert.deepEqual(auditCalls, ["prove:true", "judge"]);
assert.equal(auditNoDiffResult.status, "ready_to_ship");
assert.equal(auditNoDiffResult.ok, true);

const calls = [];
const harnessResult = await runRiddleProof({
  request: {
    repo: "riddledc/example",
    change_request: "Ship the proof harness.",
    verification_mode: "visual",
    ship_mode: "ship",
  },
  workdir: "/tmp/riddle-proof-workdir",
  max_iterations: 2,
  adapters: {
    preflight: {
      async preflight(input) {
        calls.push(`preflight:${Boolean(input.state.run_id)}`);
        return {
          ok: true,
          degraded_capabilities: ["embeddings"],
        };
      },
    },
    implementation: {
      async implement(input) {
        calls.push(`implement:${input.change_request}`);
        return {
          ok: true,
          changed_files: ["src/app.ts"],
          tests_run: ["npm test"],
        };
      },
    },
    proof: {
      async prove() {
        calls.push("prove");
        return {
          ok: true,
          evidence_bundle: {
            verification_mode: "visual",
            after: {
              kind: "after",
              role: "after_proof",
              url: "https://example.com/after.png",
            },
            artifacts: [
              {
                name: "proof.png",
                kind: "screenshot",
                role: "after_proof",
                path: "/tmp/riddle-proof/proof.png",
              },
            ],
            assertions: {
              headline_visible: true,
            },
          },
        };
      },
    },
    judge: {
      async assessProof() {
        calls.push("judge");
        return {
          decision: "ready_to_ship",
          summary: "Proof is ready.",
          source: "supervisor",
        };
      },
    },
    ship: {
      async ship() {
        calls.push("ship");
        return {
          pr_url: "https://github.com/riddledc/example/pull/42",
          marked_ready: true,
          proof_decision: "ready_to_ship",
          finalized: true,
        };
      },
    },
    notification: {
      async notify() {
        calls.push("notify");
        return {
          ok: true,
          channel_id: "111111111111111111",
        };
      },
    },
  },
});
assert.deepEqual(calls, [
  "preflight:true",
  "implement:Ship the proof harness.",
  "prove",
  "judge",
  "ship",
  "notify",
]);
assert.equal(harnessResult.status, "shipped");
assert.equal(harnessResult.ok, true);
assert.match(harnessResult.run_id, /^rp_/);
assert.equal(harnessResult.worktree_path, "/tmp/riddle-proof-workdir");
assert.equal(harnessResult.current_stage, "notify");
assert.equal(harnessResult.iterations, 1);
assert.equal(harnessResult.pr_url, "https://github.com/riddledc/example/pull/42");
assert.equal(harnessResult.marked_ready, true);
assert.equal(harnessResult.proof_decision, "ready_to_ship");
assert.equal(harnessResult.finalized, true);
assert.equal(harnessResult.notification.ok, true);
assert.equal(harnessResult.evidence_bundle.after.url, "https://example.com/after.png");
assert.equal(harnessResult.evidence_bundle.after.role, "after_proof");
assert.equal(harnessResult.evidence_bundle.artifacts[0].role, "after_proof");
assert.equal(harnessResult.last_checkpoint, "notification_completed");

const engineFixture = mkdtempSync(path.join(os.tmpdir(), "riddle-proof-engine-harness-"));
const engineWorkdir = path.join(engineFixture, "after");
mkdirSync(engineWorkdir, { recursive: true });
execFileSync("git", ["init"], { cwd: engineWorkdir, stdio: "ignore" });
const engineStatePath = path.join(engineFixture, "riddle-state.json");
writeFileSync(engineStatePath, JSON.stringify({
  after_worktree: engineWorkdir,
  branch: "agent/openclaw/riddle-proof-engine-harness",
}, null, 2));

const engineCalls = [];
const engineHarnessResult = await runRiddleProofEngineHarness({
  request: {
    repo: "riddledc/example",
    change_request: "Drive the proven checkpoint engine.",
    verification_mode: "visual",
    ship_mode: "ship",
    leave_draft: true,
    auth_localStorage_json: "{\"session\":\"local\"}",
    auth_cookies_json: "[{\"name\":\"session\",\"value\":\"cookie\"}]",
    auth_headers_json: "{\"Authorization\":\"Bearer token\"}",
    harness_state_path: path.join(engineFixture, "harness-state.json"),
  },
  max_iterations: 8,
  engine: {
    async execute(params) {
      engineCalls.push(params);
      if (params.ship_after_verify) {
        writeFileSync(engineStatePath, JSON.stringify({
          after_worktree: engineWorkdir,
          branch: "agent/openclaw/riddle-proof-engine-harness",
          pr_url: "https://github.com/riddledc/example/pull/101",
          marked_ready: true,
          proof_decision: "ready_to_ship",
          merge_recommendation: "ready_to_ship",
          finalized: true,
        }, null, 2));
        return {
          ok: true,
          state_path: engineStatePath,
          checkpoint: "ship_review",
          summary: "Ship review complete.",
        };
      }
      if (params.proof_assessment_json) {
        return {
          ok: true,
          state_path: engineStatePath,
          checkpoint: "verify_ship_ready",
          summary: "Proof is ready to ship.",
          shipGate: { ok: true },
        };
      }
      if (params.advance_stage === "verify") {
        writeFileSync(engineStatePath, JSON.stringify(withMeasuredVisualEvidence({
          after_worktree: engineWorkdir,
          branch: "agent/openclaw/riddle-proof-engine-harness",
        }), null, 2));
        return {
          ok: false,
          state_path: engineStatePath,
          checkpoint: "verify_supervisor_judgment",
          summary: "Proof assessment required.",
        };
      }
      if (params.advance_stage === "implement") {
        return {
          ok: true,
          state_path: engineStatePath,
          checkpoint: "implement_review",
          summary: "Implementation review ready.",
          checkpointContract: {
            resume: { continue_with_stage: "verify" },
          },
        };
      }
      if (params.author_packet_json) {
        return {
          ok: false,
          state_path: engineStatePath,
          checkpoint: "implement_changes_missing",
          summary: "Implementation changes are required.",
        };
      }
      if (params.recon_assessment_json) {
        return {
          ok: false,
          state_path: engineStatePath,
          checkpoint: "author_supervisor_judgment",
          summary: "Author packet required.",
        };
      }
      return {
        ok: false,
        state_path: engineStatePath,
        checkpoint: "recon_supervisor_judgment",
        summary: "Recon assessment required.",
      };
    },
  },
  agent: {
    async assessRecon() {
      return {
        ok: true,
        summary: "Recon is specific enough.",
        payload: {
          decision: "ready_for_author",
          continue_with_stage: "author",
          source: "supervising_agent",
        },
      };
    },
    async authorProofPacket() {
      return {
        ok: true,
        summary: "Proof packet ready.",
        payload: {
          proof_plan: "Capture the changed page.",
          capture_script: "await saveScreenshot('after-proof')",
          summary: "Capture after proof.",
        },
      };
    },
    async implementChange() {
      writeFileSync(path.join(engineWorkdir, "feature.txt"), "changed\n");
      return {
        ok: true,
        summary: "Changed the after worktree.",
        diffDetected: true,
        changedFiles: ["feature.txt"],
        implementationNotes: "Created a focused fixture diff.",
      };
    },
    async assessProof() {
      return {
        ok: true,
        summary: "Proof is ready.",
        payload: {
          decision: "ready_to_ship",
          recommended_stage: "ship",
          continue_with_stage: "ship",
          escalation_target: "agent",
          reasons: ["after evidence satisfies the request"],
          source: "supervising_agent",
        },
      };
    },
  },
});

assert.equal(engineHarnessResult.status, "shipped");
assert.equal(engineHarnessResult.ok, true);
assert.equal(engineHarnessResult.pr_url, "https://github.com/riddledc/example/pull/101");
assert.equal(engineHarnessResult.marked_ready, true);
assert.equal(engineHarnessResult.proof_decision, "ready_to_ship");
assert.equal(engineHarnessResult.worktree_path, engineWorkdir);
assert.equal(engineHarnessResult.branch, "agent/openclaw/riddle-proof-engine-harness");
assert.equal(engineHarnessResult.current_stage, "ship");
assert.equal(engineHarnessResult.state_path, path.join(engineFixture, "harness-state.json"));
assert.equal(readRiddleProofRunStatus(engineHarnessResult.state_path).status, "shipped");
const engineHarnessState = JSON.parse(readFileSync(engineHarnessResult.state_path, "utf-8"));
const firstEngineCallEvent = engineHarnessState.events.find((event) => event.kind === "engine.call");
const firstEngineResultEvent = engineHarnessState.events.find((event) => event.kind === "engine.result");
assert.equal(firstEngineCallEvent.details.params.auth_localStorage_json, "[redacted]");
assert.equal(typeof firstEngineCallEvent.details.started_at, "string");
assert.equal(typeof firstEngineResultEvent.details.duration_ms, "number");
assert.equal(typeof engineHarnessState.run_card.observability.engine_call_count, "number");
assert.equal(typeof engineHarnessState.run_card.observability.agent_call_count, "number");
assert.ok(engineHarnessState.run_card.observability.agent_call_count >= 4);
assert.equal(typeof engineHarnessState.run_card.observability.agent_total_ms, "number");
assert.ok(Array.isArray(engineHarnessState.run_card.observability.recent_engine_timings));
assert.ok(Array.isArray(engineHarnessState.run_card.observability.recent_agent_timings));
assert.equal(typeof engineCalls[0].state_path, "string");
assert.equal(engineCalls[0].auth_localStorage_json, "{\"session\":\"local\"}");
assert.equal(engineCalls[0].auth_cookies_json, "[{\"name\":\"session\",\"value\":\"cookie\"}]");
assert.equal(engineCalls[0].auth_headers_json, "{\"Authorization\":\"Bearer token\"}");
assert.equal(engineCalls.at(-1).ship_after_verify, true);
assert.equal(engineCalls.at(-1).leave_draft, true);

const unmeasuredVisualFixture = mkdtempSync(path.join(os.tmpdir(), "riddle-proof-unmeasured-visual-"));
const unmeasuredVisualStatePath = path.join(unmeasuredVisualFixture, "riddle-state.json");
writeFileSync(unmeasuredVisualStatePath, JSON.stringify({
  verification_mode: "visual",
  verify_status: "evidence_captured",
  before_cdn: "https://riddle-screenshots.example/before.png",
  after_cdn: "https://riddle-screenshots.example/after.png",
  evidence_bundle: {
    verification_mode: "visual",
    artifact_contract: { required: { visual_delta: true } },
    after: {
      url: "https://riddle-screenshots.example/after.png",
      visual_delta: {
        status: "unmeasured",
        passed: null,
        reason: "Fallback comparison rejected Riddle S3 screenshot URLs as Newly registered domain (high risk).",
      },
    },
  },
}, null, 2));
const unmeasuredVisualEngineCalls = [];
const unmeasuredVisualResult = await runRiddleProofEngineHarness({
  request: {
    repo: "riddledc/example",
    change_request: "Do not ship a visual proof without measured visual delta.",
    verification_mode: "visual",
    ship_mode: "none",
    harness_state_path: path.join(unmeasuredVisualFixture, "harness-state.json"),
    engine_state_path: unmeasuredVisualStatePath,
  },
  max_iterations: 3,
  engine: {
    async execute(params) {
      unmeasuredVisualEngineCalls.push(params);
      if (params.proof_assessment_json) {
        const proofAssessment = JSON.parse(params.proof_assessment_json);
        assert.equal(proofAssessment.decision, "revise_capture");
        assert.equal(proofAssessment.evidence_collection_incomplete, true);
        assert.equal(proofAssessment.recovery_stage, "verify");
        assert.equal(proofAssessment.blocked_decision, "ready_to_ship");
        return {
          ok: false,
          state_path: unmeasuredVisualStatePath,
          checkpoint: "verify_agent_retry",
          summary: "Visual delta evidence is incomplete; continue verify evidence recovery.",
          checkpointContract: {
            resume: { continue_with_stage: "verify" },
          },
        };
      }
      return {
        ok: false,
        state_path: unmeasuredVisualStatePath,
        checkpoint: "verify_supervisor_judgment",
        summary: "Proof assessment required.",
      };
    },
  },
  agent: {
    async assessRecon() { throw new Error("recon should not run"); },
    async authorProofPacket() { throw new Error("author should not run"); },
    async implementChange() { throw new Error("implement should not run"); },
    async assessProof() {
      return {
        ok: true,
        summary: "Product change looks right, but visual delta is missing.",
        payload: {
          decision: "ready_to_ship",
          recommended_stage: "ship",
          continue_with_stage: "ship",
          escalation_target: "agent",
          reasons: ["semantic screenshot evidence looks right"],
          source: "supervising_agent",
        },
      };
    },
  },
});
assert.equal(unmeasuredVisualResult.status, "blocked");
assert.equal(unmeasuredVisualResult.blocker.code, "max_iterations_reached");
assert.equal(unmeasuredVisualEngineCalls.some((call) => call.proof_assessment_json), true);
const unmeasuredVisualProofAssessmentCall = unmeasuredVisualEngineCalls.find((call) => call.proof_assessment_json);
const unmeasuredVisualProofAssessment = JSON.parse(unmeasuredVisualProofAssessmentCall.proof_assessment_json);
assert.equal(unmeasuredVisualProofAssessment.evidence_collection_incomplete, true);
assert.equal(unmeasuredVisualProofAssessment.visual_delta.status, "unmeasured");
const unmeasuredVisualHarnessState = JSON.parse(readFileSync(unmeasuredVisualResult.state_path, "utf-8"));
const unmeasuredRecoveryEvent = unmeasuredVisualHarnessState.events.find((event) => event.kind === "agent.proof_assessment.evidence_recovery_required");
assert.equal(unmeasuredRecoveryEvent.details.evidence_collection_incomplete, true);

const metricProofFixture = mkdtempSync(path.join(os.tmpdir(), "riddle-proof-semantic-metric-"));
const metricProofStatePath = path.join(metricProofFixture, "riddle-state.json");
writeFileSync(metricProofStatePath, JSON.stringify(withSemanticMetricEvidence(), null, 2));
const metricProofResult = await runRiddleProofEngineHarness({
  request: {
    repo: "riddledc/example",
    change_request: "Accept a Riddle-backed layout metric proof without pixel visual delta.",
    verification_mode: "visual",
    ship_mode: "none",
    harness_state_path: path.join(metricProofFixture, "harness-state.json"),
    engine_state_path: metricProofStatePath,
  },
  max_iterations: 2,
  engine: {
    async execute(params) {
      if (params.proof_assessment_json) {
        throw new Error("metric proof should not be forced through visual delta recovery");
      }
      return {
        ok: false,
        state_path: metricProofStatePath,
        checkpoint: "verify_supervisor_judgment",
        summary: "Proof assessment required.",
      };
    },
  },
  agent: {
    async assessRecon() { throw new Error("recon should not run"); },
    async authorProofPacket() { throw new Error("author should not run"); },
    async implementChange() { throw new Error("implement should not run"); },
    async assessProof() {
      return {
        ok: true,
        summary: "Metric proof is ready.",
        payload: {
          decision: "ready_to_ship",
          recommended_stage: "ship",
          continue_with_stage: "ship",
          escalation_target: "agent",
          reasons: ["Riddle artifact metrics prove zero mobile overflow"],
          source: "supervising_agent",
        },
      };
    },
  },
});
assert.equal(metricProofResult.status, "ready_to_ship");
assert.equal(metricProofResult.raw.ship_held, true);
const metricProofHarnessState = JSON.parse(readFileSync(metricProofResult.state_path, "utf-8"));
assert.equal(metricProofHarnessState.events.some((event) => event.kind === "agent.proof_assessment.evidence_recovery_required"), false);

const noiseFixture = mkdtempSync(path.join(os.tmpdir(), "riddle-proof-engine-noise-"));
const noiseWorkdir = path.join(noiseFixture, "after");
mkdirSync(noiseWorkdir, { recursive: true });
execFileSync("git", ["init"], { cwd: noiseWorkdir, stdio: "ignore" });
const noiseStatePath = path.join(noiseFixture, "riddle-state.json");
writeFileSync(noiseStatePath, JSON.stringify({
  after_worktree: noiseWorkdir,
  branch: "agent/openclaw/noise-only",
}, null, 2));

const noiseEngineCalls = [];
const noiseHarnessResult = await runRiddleProofEngineHarness({
  request: {
    repo: "riddledc/example",
    change_request: "Make a real app change, not tool metadata.",
    verification_mode: "visual",
    harness_state_path: path.join(noiseFixture, "harness-state.json"),
  },
  max_iterations: 8,
  engine: {
    async execute(params) {
      noiseEngineCalls.push(params);
      if (params.advance_stage === "implement") {
        return {
          ok: false,
          state_path: noiseStatePath,
          checkpoint: "implement_changes_missing",
          summary: "Implementation changes are still required.",
        };
      }
      if (params.author_packet_json) {
        return {
          ok: false,
          state_path: noiseStatePath,
          checkpoint: "implement_changes_missing",
          summary: "Implementation changes are required.",
        };
      }
      if (params.recon_assessment_json) {
        return {
          ok: false,
          state_path: noiseStatePath,
          checkpoint: "author_supervisor_judgment",
          summary: "Author packet required.",
        };
      }
      return {
        ok: false,
        state_path: noiseStatePath,
        checkpoint: "recon_supervisor_judgment",
        summary: "Recon assessment required.",
      };
    },
  },
  agent: {
    async assessRecon() {
      return {
        ok: true,
        payload: {
          decision: "ready_for_author",
          continue_with_stage: "author",
          source: "supervising_agent",
        },
      };
    },
    async authorProofPacket() {
      return {
        ok: true,
        payload: {
          proof_plan: "Capture the changed page.",
          capture_script: "await saveScreenshot('after-proof')",
          summary: "Capture after proof.",
        },
      };
    },
    async implementChange() {
      mkdirSync(path.join(noiseWorkdir, ".codex"), { recursive: true });
      writeFileSync(path.join(noiseWorkdir, ".codex", "session.json"), "{}\n");
      return {
        ok: true,
        summary: "Only tool metadata changed.",
        diffDetected: false,
        changedFiles: [".codex/session.json"],
        implementationNotes: "No app source file changed.",
      };
    },
  },
});
assert.equal(noiseHarnessResult.status, "blocked");
assert.equal(noiseHarnessResult.blocker.code, "stage_iteration_limit_reached");
assert.equal(noiseHarnessResult.blocker.details.stage, "implement");
assert.equal(noiseEngineCalls.some((call) => call.advance_stage === "implement"), true);

const runwayFixture = mkdtempSync(path.join(os.tmpdir(), "riddle-proof-iteration-runway-"));
const runwayWorkdir = path.join(runwayFixture, "after");
mkdirSync(runwayWorkdir);
execFileSync("git", ["init"], { cwd: runwayWorkdir, stdio: "ignore" });
const runwayStatePath = path.join(runwayFixture, "riddle-state.json");
writeFileSync(runwayStatePath, JSON.stringify({
  after_worktree: runwayWorkdir,
  branch: "agent/openclaw/iteration-runway",
}, null, 2));

let runwayReconAttempts = 0;
let runwayAuthorPackets = 0;
const runwayEngineCalls = [];
const runwayResult = await runRiddleProofEngineHarness({
  request: {
    repo: "riddledc/example",
    change_request: "Exercise a long non-shipping proof path.",
    verification_mode: "visual",
    ship_mode: "none",
    harness_state_path: path.join(runwayFixture, "harness-state.json"),
    engine_state_path: runwayStatePath,
  },
  engine: {
    async execute(params) {
      runwayEngineCalls.push(params);
      if (params.proof_assessment_json) {
        return {
          ok: true,
          state_path: runwayStatePath,
          checkpoint: "verify_ship_ready",
          summary: "Proof is ready but ship mode is held.",
          shipGate: { ok: true },
        };
      }
      if (params.author_packet_json && runwayAuthorPackets > 1) {
        writeFileSync(runwayStatePath, JSON.stringify(withMeasuredVisualEvidence({
          after_worktree: runwayWorkdir,
          branch: "agent/openclaw/iteration-runway",
        }), null, 2));
        return {
          ok: false,
          state_path: runwayStatePath,
          checkpoint: "verify_supervisor_judgment",
          summary: "Proof evidence needs judgment after proof plan revision.",
        };
      }
      if (params.advance_stage === "verify") {
        return {
          ok: false,
          state_path: runwayStatePath,
          checkpoint: "verify_capture_retry",
          summary: "Capture needs a proof packet revision before final judgment.",
          checkpointContract: {
            resume: { continue_with_stage: "author" },
          },
        };
      }
      if (params.implementation_notes) {
        return {
          ok: true,
          state_path: runwayStatePath,
          checkpoint: "implement_review",
          summary: "Implementation review ready.",
        };
      }
      if (params.author_packet_json) {
        return {
          ok: false,
          state_path: runwayStatePath,
          checkpoint: "implement_changes_missing",
          summary: "Implementation changes are required.",
        };
      }
      if (params.recon_assessment_json && runwayReconAttempts > 1) {
        return {
          ok: false,
          state_path: runwayStatePath,
          checkpoint: "author_supervisor_judgment",
          summary: "Author packet required.",
        };
      }
      if (params.recon_assessment_json) {
        return {
          ok: false,
          state_path: runwayStatePath,
          checkpoint: "recon_supervisor_judgment",
          summary: "Retry recon before authoring.",
        };
      }
      if (params.advance_stage === "recon") {
        return {
          ok: false,
          state_path: runwayStatePath,
          checkpoint: "recon_supervisor_judgment",
          summary: "Initial recon assessment required.",
        };
      }
      return {
        ok: false,
        state_path: runwayStatePath,
        checkpoint: "awaiting_stage_advance",
        stage: "setup",
        summary: "Setup is complete; advance to recon.",
      };
    },
  },
  agent: {
    async assessRecon() {
      runwayReconAttempts += 1;
      return {
        ok: true,
        summary: runwayReconAttempts === 1 ? "Retry recon once." : "Recon is specific enough.",
        payload: {
          decision: runwayReconAttempts === 1 ? "retry_recon" : "ready_for_author",
          continue_with_stage: runwayReconAttempts === 1 ? "recon" : "author",
          source: "supervising_agent",
        },
      };
    },
    async authorProofPacket() {
      runwayAuthorPackets += 1;
      return {
        ok: true,
        summary: `Proof packet ${runwayAuthorPackets} ready.`,
        payload: {
          proof_plan: `Capture proof attempt ${runwayAuthorPackets}.`,
          capture_script: "await saveScreenshot('after-proof')",
          summary: "Capture after proof.",
        },
      };
    },
    async implementChange() {
      writeFileSync(path.join(runwayWorkdir, "feature.txt"), "changed\n");
      return {
        ok: true,
        summary: "Changed the after worktree.",
        diffDetected: true,
        changedFiles: ["feature.txt"],
        implementationNotes: "Created a focused fixture diff.",
      };
    },
    async assessProof() {
      return {
        ok: true,
        summary: "Proof is ready.",
        payload: {
          decision: "ready_to_ship",
          recommended_stage: "ship",
          continue_with_stage: "ship",
          escalation_target: "agent",
          reasons: ["after evidence satisfies the request"],
          source: "supervising_agent",
        },
      };
    },
  },
});

assert.equal(runwayResult.status, "ready_to_ship");
assert.equal(runwayResult.ok, true);
assert.equal(runwayResult.blocker, undefined);
assert.equal(runwayEngineCalls.length, 8);
assert.equal(runwayEngineCalls.at(-1).proof_assessment_json, undefined);
const runwayImplementationAdvance = runwayEngineCalls.find((call) => call.implementation_notes);
assert.equal(runwayImplementationAdvance.advance_stage, "implement");
assert.equal(runwayImplementationAdvance.continue_from_checkpoint, undefined);
const runwayHarnessState = JSON.parse(readFileSync(path.join(runwayFixture, "harness-state.json"), "utf-8"));
const runwayProofAssessment = runwayHarnessState.events.find((event) => event.kind === "agent.proof_assessment.completed");
assert.equal(runwayProofAssessment.details.payload.continue_with_stage, "ship");

const reconLoopFixture = mkdtempSync(path.join(os.tmpdir(), "riddle-proof-recon-loop-"));
const reconLoopStatePath = path.join(reconLoopFixture, "riddle-state.json");
writeFileSync(reconLoopStatePath, JSON.stringify({}, null, 2));
const reconLoopResult = await runRiddleProofEngineHarness({
  request: {
    repo: "riddledc/example",
    change_request: "Exercise a bad recon loop.",
    verification_mode: "visual",
    harness_state_path: path.join(reconLoopFixture, "harness-state.json"),
    engine_state_path: reconLoopStatePath,
  },
  engine: {
    async execute(params) {
      if (!params.advance_stage && !params.recon_assessment_json) {
        return {
          ok: false,
          state_path: reconLoopStatePath,
          checkpoint: "awaiting_stage_advance",
          stage: "setup",
          summary: "Setup is complete; advance to recon.",
        };
      }
      return {
        ok: false,
        state_path: reconLoopStatePath,
        checkpoint: "recon_supervisor_judgment",
        summary: "Recon still needs another retry.",
      };
    },
  },
  agent: {
    async assessRecon() {
      return {
        ok: true,
        summary: "Retry recon.",
        payload: {
          decision: "retry_recon",
          continue_with_stage: "recon",
          source: "supervising_agent",
        },
      };
    },
    async authorProofPacket() {
      throw new Error("author should not run in recon loop fixture");
    },
    async implementChange() {
      throw new Error("implementation should not run in recon loop fixture");
    },
    async assessProof() {
      throw new Error("proof assessment should not run in recon loop fixture");
    },
  },
});

assert.equal(reconLoopResult.status, "blocked");
assert.equal(reconLoopResult.blocker.code, "stage_iteration_limit_reached");
assert.equal(reconLoopResult.blocker.details.stage, "recon");
assert.equal(reconLoopResult.blocker.details.stage_iteration_limit, 4);

const yieldedReconFixture = mkdtempSync(path.join(os.tmpdir(), "riddle-proof-yielded-recon-"));
const yieldedReconEngineStatePath = path.join(yieldedReconFixture, "riddle-state.json");
writeFileSync(yieldedReconEngineStatePath, JSON.stringify({
  recon_status: "needs_supervisor_judgment",
  before_cdn: "https://cdn.example.com/recon-before.png",
}, null, 2));
const yieldedReconHarnessPath = path.join(yieldedReconFixture, "harness-state.json");
const yieldedReconCalls = [];
const yieldedReconEngine = {
  async execute(params) {
    yieldedReconCalls.push(params);
    if (params.recon_assessment_json) {
      return {
        ok: false,
        state_path: yieldedReconEngineStatePath,
        checkpoint: "author_supervisor_judgment",
        summary: "Author packet required after recon response.",
      };
    }
    return {
      ok: false,
      state_path: yieldedReconEngineStatePath,
      checkpoint: "recon_supervisor_judgment",
      summary: "Recon needs a portable checkpoint decision.",
    };
  },
};
const yieldedRecon = await runRiddleProofEngineHarness({
  request: {
    repo: "riddledc/example",
    change_request: "Yield recon as a portable loop checkpoint.",
    verification_mode: "visual",
    ship_mode: "none",
    harness_state_path: yieldedReconHarnessPath,
    engine_state_path: yieldedReconEngineStatePath,
  },
  engine: yieldedReconEngine,
  checkpoint_mode: "yield",
  checkpoint_visibility: "manual",
});
assert.equal(yieldedRecon.status, "awaiting_checkpoint");
assert.equal(yieldedRecon.checkpoint_packet.kind, "assess_recon");
assert.equal(yieldedRecon.run_card.owner_next_action.checkpoint_kind, "assess_recon");
assert.ok(yieldedRecon.checkpoint_packet.allowed_decisions.includes("ready_for_author"));
const yieldedReconTemplate = createCheckpointResponseTemplate(yieldedRecon.checkpoint_packet, {
  decision: "ready_for_author",
  summary: "Recon baseline is specific enough.",
});
assert.equal(yieldedReconTemplate.version, "riddle-proof.checkpoint_response.v1");
assert.equal(yieldedReconTemplate.run_id, yieldedRecon.run_id);
assert.equal(yieldedReconTemplate.checkpoint, yieldedRecon.checkpoint_packet.checkpoint);
assert.equal(yieldedReconTemplate.resume_token, yieldedRecon.checkpoint_packet.resume_token);
assert.equal(yieldedReconTemplate.decision, "ready_for_author");
assert.equal(yieldedReconTemplate.continue_with_stage, "author");
assert.equal(yieldedReconTemplate.source.kind, "codex");
const yieldedReconCliCheckpoint = JSON.parse(execFileSync(process.execPath, [
  new URL("./dist/cli.js", import.meta.url).pathname,
  "checkpoint",
  "--state-path",
  yieldedReconHarnessPath,
  "--decision",
  "ready_for_author",
], { encoding: "utf8" }));
assert.equal(yieldedReconCliCheckpoint.checkpoint_packet.kind, "assess_recon");
assert.equal(yieldedReconCliCheckpoint.response_template.decision, "ready_for_author");
assert.ok(yieldedReconCliCheckpoint.next_commands[0].includes("riddle-proof-loop respond"));
const yieldedReconCliCheckpointMarkdown = execFileSync(process.execPath, [
  new URL("./dist/cli.js", import.meta.url).pathname,
  "checkpoint",
  "--state-path",
  yieldedReconHarnessPath,
  "--decision",
  "ready_for_author",
  "--format",
  "markdown",
], { encoding: "utf8" });
assert.match(yieldedReconCliCheckpointMarkdown, /# Riddle Proof Checkpoint/);
assert.match(yieldedReconCliCheckpointMarkdown, /ready_for_author/);
assert.match(yieldedReconCliCheckpointMarkdown, /riddle-proof-loop respond/);
let yieldedReconInvalidDecisionFailed = false;
try {
  execFileSync(process.execPath, [
    new URL("./dist/cli.js", import.meta.url).pathname,
    "respond",
    "--state-path",
    yieldedReconHarnessPath,
    "--decision",
    "ready_to_ship",
    "--summary",
    "Invalid for recon.",
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
} catch (error) {
  yieldedReconInvalidDecisionFailed = true;
  assert.match(String(error.stderr || error.message), /not allowed/);
}
assert.equal(yieldedReconInvalidDecisionFailed, true);
let yieldedReconMissingPayloadFailed = false;
try {
  execFileSync(process.execPath, [
    new URL("./dist/cli.js", import.meta.url).pathname,
    "respond",
    "--state-path",
    yieldedReconHarnessPath,
    "--decision",
    "ready_for_author",
    "--summary",
    "Recon baseline is specific enough.",
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
} catch (error) {
  yieldedReconMissingPayloadFailed = true;
  assert.match(String(error.stderr || error.message), /--payload-json is required/);
}
assert.equal(yieldedReconMissingPayloadFailed, true);
const yieldedReconResponse = {
  version: "riddle-proof.checkpoint_response.v1",
  run_id: yieldedRecon.run_id,
  checkpoint: yieldedRecon.checkpoint_packet.checkpoint,
  resume_token: yieldedRecon.checkpoint_packet.resume_token,
  decision: "ready_for_author",
  summary: "Recon baseline is specific enough.",
  payload: {
    baseline_understanding: {
      reference: "before",
      target_route: "/",
      before_evidence_url: "https://cdn.example.com/recon-before.png",
      visible_before_state: "The page is visible.",
      relevant_elements: ["body"],
      requested_change: "Yield recon as a portable loop checkpoint.",
      proof_focus: "Verify the page after implementation.",
      stop_condition: "After evidence shows the requested change.",
      quality_risks: [],
    },
  },
  created_at: "2026-05-08T00:00:00.000Z",
};
const yieldedReconResumed = await runRiddleProofEngineHarness({
  request: {
    repo: "riddledc/example",
    change_request: "Yield recon as a portable loop checkpoint.",
    verification_mode: "visual",
    ship_mode: "none",
    harness_state_path: yieldedReconHarnessPath,
    engine_state_path: yieldedReconEngineStatePath,
  },
  state_path: yieldedReconHarnessPath,
  engine: yieldedReconEngine,
  checkpoint_response: yieldedReconResponse,
  checkpoint_mode: "yield",
  checkpoint_visibility: "manual",
});
assert.equal(yieldedReconResumed.status, "awaiting_checkpoint");
assert.equal(yieldedReconResumed.checkpoint_packet.kind, "author_proof");
const yieldedReconAssessmentCall = yieldedReconCalls.find((call) => call.recon_assessment_json);
assert.equal(JSON.parse(yieldedReconAssessmentCall.recon_assessment_json).decision, "ready_for_author");

const yieldedImplementFixture = mkdtempSync(path.join(os.tmpdir(), "riddle-proof-yielded-implement-"));
const yieldedImplementWorkdir = path.join(yieldedImplementFixture, "after");
mkdirSync(yieldedImplementWorkdir, { recursive: true });
execFileSync("git", ["init"], { cwd: yieldedImplementWorkdir, stdio: "ignore" });
const yieldedImplementEngineStatePath = path.join(yieldedImplementFixture, "riddle-state.json");
writeFileSync(yieldedImplementEngineStatePath, JSON.stringify({
  after_worktree: yieldedImplementWorkdir,
  branch: "agent/yielded-implementation",
}, null, 2));
const yieldedImplementHarnessPath = path.join(yieldedImplementFixture, "harness-state.json");
const yieldedImplementCalls = [];
const yieldedImplementEngine = {
  async execute(params) {
    yieldedImplementCalls.push(params);
    if (params.implementation_notes) {
      return {
        ok: true,
        state_path: yieldedImplementEngineStatePath,
        checkpoint: "verify_ship_ready",
        summary: "External implementation response advanced to verify.",
        shipGate: { ok: true },
      };
    }
    return {
      ok: false,
      state_path: yieldedImplementEngineStatePath,
      checkpoint: "implement_changes_missing",
      summary: "Implementation needs an external worker checkpoint.",
    };
  },
};
const yieldedImplement = await runRiddleProofEngineHarness({
  request: {
    repo: "riddledc/example",
    change_request: "Yield implementation as a portable loop checkpoint.",
    verification_mode: "visual",
    ship_mode: "none",
    harness_state_path: yieldedImplementHarnessPath,
    engine_state_path: yieldedImplementEngineStatePath,
  },
  engine: yieldedImplementEngine,
  checkpoint_mode: "yield",
  checkpoint_visibility: "manual",
});
assert.equal(yieldedImplement.status, "awaiting_checkpoint");
assert.equal(yieldedImplement.checkpoint_packet.kind, "implement_change");
assert.equal(yieldedImplement.run_card.durable_state.worktree_path, yieldedImplementWorkdir);
const yieldedImplementationResponse = {
  version: "riddle-proof.checkpoint_response.v1",
  run_id: yieldedImplement.run_id,
  checkpoint: yieldedImplement.checkpoint_packet.checkpoint,
  resume_token: yieldedImplement.checkpoint_packet.resume_token,
  decision: "implementation_complete",
  summary: "Changed the fixture file.",
  payload: {
    changed_files: ["feature.txt"],
    tests_run: ["git status --short"],
    implementation_notes: "Added the fixture change.",
  },
  created_at: "2026-05-08T00:10:00.000Z",
};
const yieldedImplementNoDiff = await runRiddleProofEngineHarness({
  request: {
    repo: "riddledc/example",
    change_request: "Yield implementation as a portable loop checkpoint.",
    verification_mode: "visual",
    ship_mode: "none",
    harness_state_path: yieldedImplementHarnessPath,
    engine_state_path: yieldedImplementEngineStatePath,
  },
  state_path: yieldedImplementHarnessPath,
  engine: yieldedImplementEngine,
  checkpoint_response: yieldedImplementationResponse,
  checkpoint_mode: "yield",
  checkpoint_visibility: "manual",
});
assert.equal(yieldedImplementNoDiff.status, "blocked");
assert.equal(yieldedImplementNoDiff.blocker.code, "implementation_diff_missing");
writeFileSync(path.join(yieldedImplementWorkdir, "feature.txt"), "changed\n");
const yieldedImplementResumed = await runRiddleProofEngineHarness({
  request: {
    repo: "riddledc/example",
    change_request: "Yield implementation as a portable loop checkpoint.",
    verification_mode: "visual",
    ship_mode: "none",
    harness_state_path: yieldedImplementHarnessPath,
    engine_state_path: yieldedImplementEngineStatePath,
  },
  state_path: yieldedImplementHarnessPath,
  engine: yieldedImplementEngine,
  checkpoint_response: yieldedImplementationResponse,
  checkpoint_mode: "yield",
  checkpoint_visibility: "manual",
});
assert.equal(yieldedImplementResumed.status, "ready_to_ship");
assert.equal(yieldedImplementCalls.some((call) => call.implementation_notes?.includes("Added the fixture change.")), true);

const finalizedGuardFixture = mkdtempSync(path.join(os.tmpdir(), "riddle-proof-finalized-guard-"));
const finalizedGuardStatePath = path.join(finalizedGuardFixture, "harness-state.json");
const finalizedGuardEngineStatePath = path.join(finalizedGuardFixture, "riddle-state.json");
writeFileSync(finalizedGuardEngineStatePath, JSON.stringify({}, null, 2));
const finalizedGuardState = createRunState({
  request: {
    repo: "riddledc/example",
    change_request: "Preserve a finalized ready decision.",
    verification_mode: "visual",
    harness_state_path: finalizedGuardStatePath,
    engine_state_path: finalizedGuardEngineStatePath,
  },
  state_path: finalizedGuardStatePath,
});
setRunStatus(finalizedGuardState, "ready_to_ship", "2026-04-16T00:00:00.000Z");
finalizedGuardState.finalized = true;
finalizedGuardState.proof_decision = "ready_to_ship";
writeFileSync(finalizedGuardStatePath, JSON.stringify(finalizedGuardState, null, 2));
const staleWorkerResult = await runRiddleProofEngineHarness({
  request: {
    ...finalizedGuardState.request,
    harness_state_path: finalizedGuardStatePath,
    engine_state_path: finalizedGuardEngineStatePath,
  },
  max_iterations: 1,
  engine: {
    async execute() {
      return {
        ok: false,
        state_path: finalizedGuardEngineStatePath,
        checkpoint: "verify_capture_retry",
        summary: "A stale worker still wants more proof.",
      };
    },
  },
});
assert.equal(staleWorkerResult.status, "blocked");
const preservedFinalizedGuardState = JSON.parse(readFileSync(finalizedGuardStatePath, "utf-8"));
assert.equal(preservedFinalizedGuardState.status, "ready_to_ship");
assert.equal(preservedFinalizedGuardState.finalized, true);
assert.equal(preservedFinalizedGuardState.blocker, undefined);

const missingWorktreeStatePath = path.join(engineFixture, "missing-worktree-riddle-state.json");
writeFileSync(missingWorktreeStatePath, JSON.stringify({}, null, 2));
const missingWorktreeResult = await runRiddleProofEngineHarness({
  request: {
    repo: "riddledc/example",
    change_request: "Block without an isolated worktree.",
    verification_mode: "visual",
    harness_state_path: path.join(engineFixture, "missing-worktree-harness-state.json"),
  },
  max_iterations: 1,
  engine: {
    async execute() {
      return {
        ok: false,
        state_path: missingWorktreeStatePath,
        checkpoint: "implement_changes_missing",
        summary: "Implementation changes are required.",
      };
    },
  },
  agent: createDisabledRiddleProofAgentAdapter(),
});

assert.equal(missingWorktreeResult.status, "blocked");
assert.equal(missingWorktreeResult.blocker.code, "implementation_worktree_missing");

const dryRunFailureResult = await runRiddleProofEngineHarness({
  request: {
    repo: "riddledc/example",
    change_request: "Surface setup failures during dry-run.",
    verification_mode: "visual",
    dry_run: true,
    harness_state_path: path.join(engineFixture, "dry-run-failure-harness-state.json"),
  },
  max_iterations: 1,
  engine: {
    async execute() {
      return {
        ok: false,
        state_path: path.join(engineFixture, "dry-run-failure-riddle-state.json"),
        checkpoint: "setup_blocked",
        summary: "setup failed",
        error: "workspace core timed out for ensure-deps",
      };
    },
  },
  agent: createDisabledRiddleProofAgentAdapter(),
});

assert.equal(dryRunFailureResult.status, "blocked");
assert.equal(dryRunFailureResult.blocker.code, "setup_blocked");
assert.equal(dryRunFailureResult.blocker.details.error, "workspace core timed out for ensure-deps");

const workspaceCoreFixture = mkdtempSync(path.join(os.tmpdir(), "riddle-proof-workspace-core-"));
writeFileSync(path.join(workspaceCoreFixture, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0" }));
const workspaceCorePath = path.join(path.dirname(new URL(import.meta.url).pathname), "lib", "workspace-core.mjs");
const fingerprintResult = JSON.parse(execFileSync("node", [
  workspaceCorePath,
  "dependency-fingerprint",
  JSON.stringify({ projectDir: workspaceCoreFixture }),
], { encoding: "utf-8" }));
assert.equal(fingerprintResult.ok, true);
assert.equal(typeof fingerprintResult.fingerprint, "string");
assert.ok(fingerprintResult.fingerprint.length > 10);

const defaultScratchEnv = {
  ...process.env,
  RIDDLE_PROOF_SCRATCH_ROOT: "",
  RIDDLE_PROOF_USE_TMP_SCRATCH: "",
};
const scratchRootResult = JSON.parse(execFileSync("node", [
  workspaceCorePath,
  "scratch-root",
  "{}",
], { encoding: "utf-8", env: defaultScratchEnv }));
assert.equal(scratchRootResult.ok, true);
assert.equal(scratchRootResult.scratchRoot, "/var/tmp/riddle-proof");
assert.equal(scratchRootResult.worktreeRoot, "/var/tmp/riddle-proof/.riddle-proof-worktrees");

const defaultCacheRootResult = JSON.parse(execFileSync("node", [
  workspaceCorePath,
  "dependency-cache-root",
  JSON.stringify({ projectDir: "/var/tmp/riddle-proof/.riddle-proof-worktrees/example-after" }),
], { encoding: "utf-8", env: defaultScratchEnv }));
assert.equal(defaultCacheRootResult.ok, true);
assert.equal(defaultCacheRootResult.cacheRoot, "/var/tmp/riddle-proof/.riddle-proof-deps-cache");

const tmpScratchRootResult = JSON.parse(execFileSync("node", [
  workspaceCorePath,
  "scratch-root",
  "{}",
], {
  encoding: "utf-8",
  env: {
    ...process.env,
    RIDDLE_PROOF_SCRATCH_ROOT: "",
    RIDDLE_PROOF_USE_TMP_SCRATCH: "1",
  },
}));
assert.equal(tmpScratchRootResult.scratchRoot, "/tmp/riddle-proof");

function writeEmptyNpmFixture(projectDir) {
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(path.join(projectDir, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0" }));
  writeFileSync(path.join(projectDir, "package-lock.json"), JSON.stringify({
    name: "fixture",
    version: "1.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": {
        name: "fixture",
        version: "1.0.0",
      },
    },
  }));
}

const dependencyCacheRoot = path.join(workspaceCoreFixture, "deps-cache");
const dependencyFixtureA = path.join(workspaceCoreFixture, "dependency-fixture-a");
const dependencyFixtureB = path.join(workspaceCoreFixture, "dependency-fixture-b");
writeEmptyNpmFixture(dependencyFixtureA);
writeEmptyNpmFixture(dependencyFixtureB);
const ensureDepsEnv = { ...process.env, RIDDLE_PROOF_DEPS_CACHE_ROOT: dependencyCacheRoot };
const firstDepsResult = JSON.parse(execFileSync("node", [
  workspaceCorePath,
  "ensure-deps",
  JSON.stringify({ projectDir: dependencyFixtureA }),
], { encoding: "utf-8", env: ensureDepsEnv }));
assert.equal(firstDepsResult.ok, true);
assert.equal(firstDepsResult.status, "cached:npm ci");
assert.equal(lstatSync(path.join(dependencyFixtureA, "node_modules")).isSymbolicLink(), false);

const secondDepsResult = JSON.parse(execFileSync("node", [
  workspaceCorePath,
  "ensure-deps",
  JSON.stringify({ projectDir: dependencyFixtureB }),
], { encoding: "utf-8", env: ensureDepsEnv }));
assert.equal(secondDepsResult.ok, true);
assert.match(secondDepsResult.status, /^reused_cache:/);
assert.equal(lstatSync(path.join(dependencyFixtureB, "node_modules")).isSymbolicLink(), false);

const dependencyFixtureC = path.join(workspaceCoreFixture, "dependency-fixture-c");
writeEmptyNpmFixture(dependencyFixtureC);
const reusedFromDepsResult = JSON.parse(execFileSync("node", [
  workspaceCorePath,
  "ensure-deps",
  JSON.stringify({ projectDir: dependencyFixtureC, reuseFrom: dependencyFixtureB }),
], { encoding: "utf-8", env: ensureDepsEnv }));
assert.equal(reusedFromDepsResult.ok, true);
assert.match(reusedFromDepsResult.status, /^reused_from:/);
assert.equal(lstatSync(path.join(dependencyFixtureC, "node_modules")).isSymbolicLink(), false);

const alreadyInstalledDepsResult = JSON.parse(execFileSync("node", [
  workspaceCorePath,
  "ensure-deps",
  JSON.stringify({ projectDir: dependencyFixtureA }),
], { encoding: "utf-8", env: ensureDepsEnv }));
assert.equal(alreadyInstalledDepsResult.ok, true);
assert.equal(alreadyInstalledDepsResult.status, "already_installed");

console.log(JSON.stringify({ ok: true }));
