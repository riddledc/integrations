import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createRiddleApiClient,
  deployRiddlePreview,
  detectRiddlePreviewSource,
  isTerminalRiddleJobStatus,
  parseRiddleViewport,
  resolveRiddleApiKeySource,
} from "./dist/index.js";

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
