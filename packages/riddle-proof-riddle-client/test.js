import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as clientEntry from "./dist/client.js";
import {
  RiddleApiError,
  RIDDLE_BALANCE_ENDPOINT_PATH,
  createRiddleApiClient,
  deployRiddlePreview,
  detectRiddlePreviewSource,
  getRiddleJobArtifacts,
  isTerminalRiddleJobStatus,
  parseRiddleViewport,
  resolveRiddleApiKeySource,
} from "./dist/index.js";

const require = createRequire(import.meta.url);
const clientEntryCjs = require("@riddledc/riddle-proof-riddle-client/client");
const indexEntryCjs = require("@riddledc/riddle-proof-riddle-client");

if (RiddleApiError !== clientEntry.RiddleApiError) {
  throw new Error("ESM hosted-client entrypoints must share one RiddleApiError identity.");
}
if (indexEntryCjs.RiddleApiError !== clientEntryCjs.RiddleApiError) {
  throw new Error("CJS hosted-client entrypoints must share one RiddleApiError identity.");
}
if (RIDDLE_BALANCE_ENDPOINT_PATH !== "/v1/balance") {
  throw new Error("Hosted client must own the balance endpoint path.");
}
if (getRiddleJobArtifacts !== clientEntry.getRiddleJobArtifacts
  || indexEntryCjs.getRiddleJobArtifacts !== clientEntryCjs.getRiddleJobArtifacts) {
  throw new Error("Hosted-client entrypoints must share the job-artifacts helper identity.");
}

const packageManifest = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
if (packageManifest.dependencies?.["@riddledc/riddle-proof"] !== undefined) {
  throw new Error("Hosted client must not depend on the compatibility facade.");
}
if (packageManifest.dependencies?.["@riddledc/riddle-proof-core"] !== "workspace:^") {
  throw new Error("Hosted client must depend directly on the deterministic core.");
}
const clientSource = readFileSync(new URL("./src/client.ts", import.meta.url), "utf8");
if (clientSource.includes('from "@riddledc/riddle-proof"')) {
  throw new Error("Hosted implementation must not re-export from the compatibility facade.");
}
if (!clientSource.includes("https://api.riddledc.com")) {
  throw new Error("Hosted package must positively own the default Riddle API endpoint.");
}
const capabilities = JSON.parse(readFileSync(new URL("./capabilities.json", import.meta.url), "utf8"));
for (const capability of ["network", "filesystem", "browser", "subprocess", "hosted_riddle"]) {
  if (capabilities.capabilities?.[capability] !== true) {
    throw new Error(`Hosted package must explicitly declare ${capability}.`);
  }
}

const keyDir = mkdtempSync(join(tmpdir(), "riddle-proof-riddle-client-"));
const keyFile = join(keyDir, "key.txt");
writeFileSync(keyFile, "test-key\n");

if (!isTerminalRiddleJobStatus("completed")) {
  throw new Error("Terminal status helper should treat completed as terminal.");
}

if (parseRiddleViewport("1280x720")?.width !== 1280) {
  throw new Error("Viewport parsing failed.");
}

const resolved = resolveRiddleApiKeySource({ apiKey: "test-key", apiKeyFile: keyFile });
if (resolved.source !== "option" || resolved.file) {
  throw new Error("API key source resolution failed.");
}

const _client = createRiddleApiClient({ apiKeyFile: keyFile });

let observedArtifactsUrl;
const artifactPayload = await getRiddleJobArtifacts({
  apiKey: "test-key",
  apiBaseUrl: "https://api.example.test",
  fetchImpl: async (url) => {
    observedArtifactsUrl = String(url);
    return new Response(JSON.stringify({ artifacts: ["fixture"] }), { status: 200 });
  },
}, "job_fixture");
if (observedArtifactsUrl !== "https://api.example.test/v1/jobs/job_fixture/artifacts"
  || artifactPayload.artifacts?.[0] !== "fixture") {
  throw new Error("Hosted job-artifacts helper must own endpoint construction and response parsing.");
}
if (typeof _client.getJobArtifacts !== "function") {
  throw new Error("Hosted API client must expose getJobArtifacts for compatibility facades.");
}

const previewRepo = mkdtempSync(join(tmpdir(), "riddle-preview-source-"));
execFileSync("git", ["init", "-q", previewRepo]);
execFileSync("git", ["-C", previewRepo, "config", "user.email", "test@example.com"]);
execFileSync("git", ["-C", previewRepo, "config", "user.name", "Riddle Test"]);
writeFileSync(join(previewRepo, "index.html"), "<h1>Bound preview</h1>");
execFileSync("git", ["-C", previewRepo, "add", "index.html"]);
execFileSync("git", ["-C", previewRepo, "commit", "-qm", "fixture"]);
mkdirSync(join(previewRepo, "dist"));
writeFileSync(join(previewRepo, "dist", "index.html"), "<h1>Bound preview</h1>");
const detectedSource = detectRiddlePreviewSource(join(previewRepo, "dist"));
if (!detectedSource.git_revision || detectedSource.dirty !== true) {
  throw new Error("Preview source detection should find the enclosing revision and dirty build output.");
}

const previewReceipt = {
  version: "riddle.preview-receipt.v1",
  preview_id: "pv_fixture",
  url: "https://preview.example.test/s/pv_fixture/",
  expires_at: "2099-01-01T00:00:00.000Z",
  content_digest: "sha256:fixture",
  source: { git_revision: "abc123", repository: "example/repo", dirty: false },
  published_at: "2026-07-10T00:00:00.000Z",
};
let createPayload;
const deployed = await deployRiddlePreview({
  apiKey: "test-key",
  fetchImpl: async (url, init = {}) => {
    if (url === "https://api.example.test/v1/preview") {
      createPayload = JSON.parse(String(init.body));
      return new Response(JSON.stringify({
        id: "pv_fixture",
        upload_url: "https://upload.example.test/archive",
        preview_url: previewReceipt.url,
        expires_at: previewReceipt.expires_at,
      }), { status: 201 });
    }
    if (url === "https://upload.example.test/archive") return new Response("", { status: 200 });
    if (url === "https://api.example.test/v1/preview/pv_fixture/publish") {
      return new Response(JSON.stringify({
        id: "pv_fixture",
        preview_url: previewReceipt.url,
        file_count: 1,
        total_bytes: 24,
        receipt: previewReceipt,
      }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  },
  apiBaseUrl: "https://api.example.test",
}, join(previewRepo, "dist"), "fixture", "static", {
  source: previewReceipt.source,
});
if (createPayload.source.git_revision !== "abc123") {
  throw new Error("Preview create request should include source identity.");
}
if (deployed.receipt?.content_digest !== "sha256:fixture") {
  throw new Error("Preview deploy should return the immutable Preview receipt.");
}
console.log("riddle proof riddle client smoke tests passed", {
  terminalStatus: true,
  viewport: parseRiddleViewport("320x240"),
  hasClient: !!_client,
  previewReceipt: deployed.receipt?.preview_id,
});
