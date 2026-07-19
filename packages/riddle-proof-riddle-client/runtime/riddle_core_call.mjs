#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const TOOL_DEFAULT_INCLUDE = ["screenshot", "console", "result", "data", "urls", "dataset", "sitemap", "visual_diff"];
const DEFAULT_BASE_URL = "https://api.riddledc.com";
const DEFAULT_API_KEY_FILE = "/tmp/riddle-api-key";
const require = createRequire(import.meta.url);

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function readOpenClawPluginConfig() {
  const paths = [
    process.env.OPENCLAW_CONFIG,
    process.env.OPENCLAW_HOME ? join(process.env.OPENCLAW_HOME, "openclaw.json") : "",
    join(homedir(), ".openclaw", "openclaw.json"),
    "/root/.openclaw/openclaw.json",
  ].filter(Boolean);

  for (const path of paths) {
    const cfg = readJson(path);
    const pluginCfg = cfg?.plugins?.entries?.["openclaw-riddledc"]?.config;
    if (pluginCfg) return pluginCfg;
  }
  return {};
}

function buildConfig() {
  const pluginCfg = readOpenClawPluginConfig();
  return {
    apiKey: process.env.RIDDLE_API_KEY || readApiKeyFile() || pluginCfg.apiKey,
    baseUrl: process.env.RIDDLE_API_BASE_URL || pluginCfg.baseUrl || DEFAULT_BASE_URL,
    workspace: process.env.OPENCLAW_WORKSPACE || process.cwd(),
  };
}

function readApiKeyFile() {
  const keyFile = process.env.RIDDLE_API_KEY_FILE || DEFAULT_API_KEY_FILE;
  try {
    const key = readFileSync(keyFile, "utf8").trim();
    return key || "";
  } catch {
    return "";
  }
}

function requireConfig(config) {
  const apiKey = config.apiKey || process.env.RIDDLE_API_KEY || readApiKeyFile();
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  if (!apiKey) {
    throw new Error("Missing Riddle API key. Set RIDDLE_API_KEY or RIDDLE_API_KEY_FILE before running Riddle Proof direct browser evidence.");
  }
  assertAllowedBaseUrl(baseUrl);
  return { apiKey, baseUrl, workspace: config.workspace || process.cwd() };
}

function assertAllowedBaseUrl(baseUrl) {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:") throw new Error("Riddle baseUrl must be https: " + baseUrl);
  if (url.hostname !== "api.riddledc.com") {
    throw new Error("Refusing to use non-official Riddle host: " + url.hostname);
  }
}

function detectMode(payload) {
  if (payload.url) return "url";
  if (payload.urls) return "urls";
  if (payload.steps) return "steps";
  if (payload.script) return "script";
  return undefined;
}

function abToBase64(ab) {
  return Buffer.from(ab).toString("base64");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truthy(value) {
  return String(value || "").toLowerCase().match(/^(1|true|yes|y|on)$/);
}

function localRiddleScriptAllowed() {
  const runner = String(process.env.RIDDLE_PROOF_BROWSER_RUNNER || "").toLowerCase();
  if (runner === "hosted" || runner === "riddle") return false;
  if (String(process.env.RIDDLE_PROOF_DISABLE_LOCAL_RIDDLE_SCRIPT || "").toLowerCase().match(/^(1|true|yes)$/)) return false;
  return true;
}

function localRiddleScriptPreferred() {
  const runner = String(process.env.RIDDLE_PROOF_BROWSER_RUNNER || "").toLowerCase();
  return runner === "local" || runner === "playwright" || runner === "local-playwright";
}

function sanitizeArtifactName(input, fallback = "artifact") {
  return String(input || fallback)
    .trim()
    .replace(/^\.\.?(\/|\\)/g, "")
    .replace(/[/\\]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function localArtifactRoot() {
  const root = process.env.RIDDLE_PROOF_LOCAL_ARTIFACT_DIR || join(process.cwd(), "artifacts", "riddle-proof", "local-browser");
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = join(root, id);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, "screenshots"), { recursive: true });
  return dir;
}

async function loadLocalPlaywright() {
  const packagePaths = [
    process.cwd(),
    join(process.cwd(), "packages", "riddle-proof-runner-playwright"),
    join(process.cwd(), "..", "riddle-proof-runner-playwright"),
    process.env.RIDDLE_PROOF_PLAYWRIGHT_PACKAGE_DIR || "",
  ].filter(Boolean);

  let resolved = "";
  try {
    resolved = require.resolve("playwright");
  } catch {
    for (const packagePath of packagePaths) {
      try {
        resolved = require.resolve("playwright", { paths: [packagePath] });
        break;
      } catch {
        // Try next path.
      }
    }
  }
  if (!resolved) {
    throw new Error("Playwright is required for local Riddle Proof browser evidence. Install playwright or set RIDDLE_PROOF_BROWSER_RUNNER=hosted with a Riddle API key.");
  }
  const mod = await import(pathToFileURL(resolved).href);
  return mod.default || mod;
}

async function runLocalRiddleScript(payload, defaults = {}, blockedHostedReason = "") {
  if (!payload.script || typeof payload.script !== "string") {
    return { ok: false, error: blockedHostedReason || "Local Riddle Proof browser evidence requires a script payload." };
  }

  const outputs = [];
  const screenshots = [];
  const consoleMessages = [];
  const resultArtifacts = {};
  const outputDir = localArtifactRoot();
  const playwright = await loadLocalPlaywright();
  const browserName = payload.browser || "chromium";
  const browserType = playwright[browserName] || playwright.chromium;
  const browser = await browserType.launch({ headless: payload.headful !== true });
  const context = await browser.newContext({
    viewport: payload.viewport || undefined,
  });
  const page = await context.newPage();
  const timeoutMs = Number(payload.timeout_sec ?? payload.timeoutSec ?? 60) * 1000;
  page.setDefaultTimeout(Math.min(timeoutMs, 120_000));
  page.setDefaultNavigationTimeout(Math.min(timeoutMs, 120_000));
  page.on("console", (message) => {
    consoleMessages.push({ type: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => {
    consoleMessages.push({ type: "pageerror", text: error?.message || String(error) });
  });

  const saveScreenshot = async (label = "screenshot", options = {}) => {
    const name = sanitizeArtifactName(label, "screenshot").replace(/\.(png|jpg|jpeg)$/i, "") + ".png";
    const path = join(outputDir, "screenshots", name);
    const buffer = await page.screenshot({ fullPage: options?.fullPage === true });
    writeFileSync(path, buffer);
    const item = {
      name,
      url: pathToFileURL(path).href,
      path,
      size: buffer.byteLength,
    };
    outputs.push({ name, url: item.url, path, size_bytes: buffer.byteLength });
    screenshots.push(item);
    return { name, url: item.url, path };
  };

  const saveJson = async (name = "artifact", value = {}) => {
    const fileName = sanitizeArtifactName(name, "artifact").replace(/\.json$/i, "") + ".json";
    const path = join(outputDir, fileName);
    writeFileSync(path, JSON.stringify(value, null, 2));
    const item = { name: fileName, url: pathToFileURL(path).href, path };
    outputs.push(item);
    resultArtifacts[fileName] = value;
    return item;
  };

  const previousEvidence = globalThis.__riddleProofEvidence;
  globalThis.__riddleProofEvidence = undefined;
  let scriptResult;
  let proofEvidence;
  try {
    const runnerFactory = Object.getPrototypeOf(async function () {}).constructor;
    const runScript = new runnerFactory("page", "saveScreenshot", "saveJson", "url", payload.script);
    scriptResult = await Promise.race([
      runScript(page, saveScreenshot, saveJson, payload.url || ""),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`local riddle_script timed out after ${timeoutMs}ms`)), timeoutMs + 1000)),
    ]);
    proofEvidence = globalThis.__riddleProofEvidence;
  } catch (err) {
    const failedProofEvidence = globalThis.__riddleProofEvidence;
    return {
      ok: false,
      mode: "script",
      runner: "local-playwright",
      error: err instanceof Error ? err.message : String(err),
      script_error: err instanceof Error ? err.stack || err.message : String(err),
      outputs,
      screenshots,
      screenshot: screenshots[0],
      console: consoleMessages,
      result: failedProofEvidence ? { proofEvidence: failedProofEvidence } : undefined,
    };
  } finally {
    try {
      await context.close();
      await browser.close();
    } finally {
      globalThis.__riddleProofEvidence = previousEvidence;
    }
  }

  let result = typeof scriptResult === "object" && scriptResult !== null && !Array.isArray(scriptResult)
    ? scriptResult
    : scriptResult !== undefined
      ? { value: scriptResult }
      : {};
  if (proofEvidence !== undefined && result.proofEvidence === undefined && result.proof_evidence === undefined) {
    result = { ...result, proofEvidence };
  }

  if (!outputs.find((item) => item.name === "result.json")) {
    await saveJson("result", result);
  }

  return {
    ok: true,
    mode: "script",
    runner: "local-playwright",
    local: true,
    outputs,
    screenshots,
    screenshot: screenshots[0],
    console: consoleMessages,
    result,
    resultArtifacts,
  };
}

function localServerPreviewAllowed() {
  const runner = String(process.env.RIDDLE_PROOF_BROWSER_RUNNER || "").toLowerCase();
  if (runner === "hosted" || runner === "riddle") return false;
  if (truthy(process.env.RIDDLE_PROOF_DISABLE_LOCAL_SERVER_PREVIEW)) return false;
  return true;
}

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

async function availablePort(preferred) {
  const start = numberValue(preferred, 3000);
  for (let offset = 0; offset < 50; offset += 1) {
    const port = start + offset;
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available local preview port near ${start}`);
}

function appendLimited(lines, value, maxLength = 20_000) {
  if (!value) return;
  lines.push(String(value));
  while (lines.join("").length > maxLength && lines.length > 1) lines.shift();
}

function localPreviewUrl(port, targetPath = "/") {
  return new URL(targetPath || "/", `http://127.0.0.1:${port}/`).href;
}

async function waitForReadiness(url, timeoutMs, child, stdoutLines, stderrLines) {
  const start = Date.now();
  let lastError = "";
  while (Date.now() - start < timeoutMs) {
    if (child.exitCode !== null) {
      const tail = [stdoutLines.join(""), stderrLines.join("")].filter(Boolean).join("\n").slice(-2000);
      throw new Error(`local server preview command exited before readiness (${child.exitCode}). ${tail}`.trim());
    }
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await sleep(500);
  }
  throw new Error(`local server preview was not ready at ${url} within ${timeoutMs}ms${lastError ? `: ${lastError}` : ""}`);
}

function terminateChild(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (child.pid) process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      // Best effort cleanup.
    }
  }
  setTimeout(() => {
    try {
      if (child.exitCode === null && child.pid) process.kill(-child.pid, "SIGKILL");
    } catch {
      // Best effort cleanup.
    }
  }, 2000).unref?.();
}

async function runLocalServerPreview(rawArgs) {
  if (!localServerPreviewAllowed()) {
    return { ok: false, error: "Local Riddle Proof server preview is disabled." };
  }

  const args = normalizeServerArgs(rawArgs);
  const directory = String(args.directory || "").trim();
  const command = String(args.command || "").trim();
  if (!directory || !existsSync(directory)) {
    return { ok: false, error: `Local Riddle Proof server preview directory does not exist: ${directory || "(missing)"}` };
  }
  if (!command) {
    return { ok: false, error: "Local Riddle Proof server preview requires a command." };
  }

  const port = await availablePort(args.port);
  const previewUrl = `http://127.0.0.1:${port}/`;
  const targetUrl = localPreviewUrl(port, args.path || "/");
  const readinessUrl = localPreviewUrl(port, args.readiness_path || args.path || "/");
  const readinessTimeoutMs = numberValue(args.readiness_timeout ?? args.readinessTimeout, 120) * 1000;
  const stdoutLines = [];
  const stderrLines = [];
  const env = {
    ...process.env,
    ...(args.env || {}),
    PORT: String(port),
    HOSTNAME: String((args.env || {}).HOSTNAME || "127.0.0.1"),
  };

  const child = spawn(command, {
    cwd: directory,
    env,
    shell: true,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => appendLimited(stdoutLines, chunk.toString()));
  child.stderr?.on("data", (chunk) => appendLimited(stderrLines, chunk.toString()));

  try {
    await waitForReadiness(readinessUrl, readinessTimeoutMs, child, stdoutLines, stderrLines);
    const waitUntil = String(args.wait_until || args.waitUntil || "domcontentloaded");
    const captureTimeoutSec = numberValue(args.timeout_sec ?? args.timeout, 300);
    const scriptParts = [
      `await page.goto(${JSON.stringify(targetUrl)}, { waitUntil: ${JSON.stringify(waitUntil)}, timeout: ${JSON.stringify(captureTimeoutSec * 1000)} });`,
    ];
    if (args.wait_for_selector || args.waitForSelector) {
      scriptParts.push(`await page.waitForSelector(${JSON.stringify(args.wait_for_selector || args.waitForSelector)}, { timeout: 30000 });`);
    }
    if (args.script && String(args.script).trim()) {
      scriptParts.push(String(args.script).trim());
    } else {
      scriptParts.push("await saveScreenshot('after-proof');");
    }
    const capture = await runLocalRiddleScript({
      ...args,
      url: targetUrl,
      script: scriptParts.join("\n"),
      timeout_sec: captureTimeoutSec,
    });
    return {
      ...capture,
      local: true,
      runner: "local-server-preview",
      preview_url: previewUrl,
      target_url: targetUrl,
      readiness_url: readinessUrl,
      port,
      stdout: stdoutLines.join("").slice(-8000),
      stderr: stderrLines.join("").slice(-8000),
    };
  } catch (err) {
    return {
      ok: false,
      mode: "server_preview",
      runner: "local-server-preview",
      error: err instanceof Error ? err.message : String(err),
      preview_url: previewUrl,
      target_url: targetUrl,
      readiness_url: readinessUrl,
      port,
      stdout: stdoutLines.join("").slice(-8000),
      stderr: stderrLines.join("").slice(-8000),
    };
  } finally {
    terminateChild(child);
  }
}

async function postRun(baseUrl, apiKey, payload) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return {
    contentType: response.headers.get("content-type"),
    body: await response.arrayBuffer(),
    headers: response.headers,
    status: response.status,
  };
}

async function pollJobStatus(config, jobId, maxWaitMs) {
  const start = Date.now();
  const pollIntervalMs = 2000;

  while (Date.now() - start < maxWaitMs) {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/v1/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
    if (!response.ok) {
      return { status: "poll_error", error: "HTTP " + response.status };
    }
    const data = await response.json();
    if (["completed", "completed_timeout", "completed_error", "failed"].includes(data.status)) {
      return data;
    }
    await sleep(pollIntervalMs);
  }

  return { status: "poll_timeout", error: `Job ${jobId} did not complete within ${maxWaitMs}ms` };
}

async function fetchArtifactsAndBuild(config, jobId, include) {
  const response = await fetch(
    `${config.baseUrl.replace(/\/$/, "")}/v1/jobs/${jobId}/artifacts?include=${include.join(",")}`,
    { headers: { Authorization: `Bearer ${config.apiKey}` } }
  );
  if (!response.ok) {
    return { error: "Artifacts fetch failed: HTTP " + response.status };
  }

  const data = await response.json();
  const artifacts = data.artifacts || [];
  const result = { outputs: artifacts };
  if (data.status) result._artifactsStatus = data.status;
  if (data.timeout) result._timeout = data.timeout;
  if (data.error) result._error = data.error;

  const screenshots = artifacts.filter((artifact) => artifact.name && /\.(png|jpg|jpeg)$/i.test(artifact.name));
  if (screenshots.length > 0) {
    result.screenshots = [];
    for (const screenshot of screenshots) {
      if (!screenshot.url) continue;
      try {
        const imageResponse = await fetch(screenshot.url);
        if (imageResponse.ok) {
          const buffer = await imageResponse.arrayBuffer();
          result.screenshots.push({
            name: screenshot.name,
            data: `data:image/png;base64,${Buffer.from(buffer).toString("base64")}`,
            size: buffer.byteLength,
            url: screenshot.url,
          });
        }
      } catch {
        // Screenshot artifacts are optional diagnostics.
      }
    }
    if (result.screenshots.length > 0) {
      result.screenshot = result.screenshots[0];
    }
  }

  const consoleArtifact = artifacts.find((artifact) => artifact.name === "console.json");
  if (consoleArtifact?.url) {
    try {
      const consoleResponse = await fetch(consoleArtifact.url);
      if (consoleResponse.ok) result.console = await consoleResponse.json();
    } catch {
      // Optional diagnostic.
    }
  }

  const resultArtifact = artifacts.find((artifact) => artifact.name === "result.json");
  if (resultArtifact?.url) {
    try {
      const resultResponse = await fetch(resultArtifact.url);
      if (resultResponse.ok) result.result = await resultResponse.json();
    } catch {
      // Optional diagnostic.
    }
  }

  const visualDiffArtifact = artifacts.find((artifact) => artifact.name === "visual-diff.json");
  if (include.includes("visual_diff") && visualDiffArtifact?.url) {
    try {
      const visualDiffResponse = await fetch(visualDiffArtifact.url);
      if (visualDiffResponse.ok) result.visual_diff = await visualDiffResponse.json();
    } catch {
      // Optional diagnostic.
    }
  }

  const visualDiffImages = artifacts.filter((artifact) => /^visual-diff.*\.(png|jpg|jpeg)$/i.test(artifact.name || ""));
  if (visualDiffImages.length > 0) {
    result.visual_diff_images = visualDiffImages;
  }

  if (include.includes("har")) {
    const harArtifact = artifacts.find((artifact) => artifact.name === "network.har");
    if (harArtifact?.url) {
      try {
        const harResponse = await fetch(harArtifact.url);
        if (harResponse.ok) result.har = await harResponse.json();
      } catch {
        // Optional diagnostic.
      }
    }
  }

  return result;
}

async function runWithDefaults(payload, defaults = {}) {
  if (localRiddleScriptPreferred() && payload.script && localRiddleScriptAllowed()) {
    try {
      return await runLocalRiddleScript(payload, defaults);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  let config;
  try {
    config = requireConfig(buildConfig());
  } catch (err) {
    if (payload.script && localRiddleScriptAllowed()) {
      try {
        return await runLocalRiddleScript(payload, defaults, err instanceof Error ? err.message : String(err));
      } catch (localErr) {
        return {
          ok: false,
          error: [
            err instanceof Error ? err.message : String(err),
            localErr instanceof Error ? localErr.message : String(localErr),
          ].filter(Boolean).join(" Local fallback also failed: "),
        };
      }
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const mode = detectMode(payload);
  const userInclude = Array.isArray(payload.include) ? payload.include : [];
  const returnAsync = !!defaults.returnAsync;
  const merged = { ...payload };
  if (returnAsync) merged.sync = false;
  merged.include = Array.from(new Set([...userInclude, ...(defaults.include || ["screenshot", "console"])]));
  merged.inlineConsole = merged.inlineConsole ?? true;
  merged.inlineResult = merged.inlineResult ?? true;
  if (userInclude.includes("har")) merged.inlineHar = true;

  const out = { ok: true, mode };
  const { contentType, body, headers, status } = await postRun(config.baseUrl, config.apiKey, merged);
  out.rawContentType = contentType || undefined;

  if (status === 408) {
    let jobId = "";
    try {
      jobId = JSON.parse(Buffer.from(body).toString("utf8")).job_id || "";
    } catch {
      // Fall through.
    }
    if (!jobId) {
      return { ...out, ok: false, error: "Sync poll timed out but no job_id in 408 response" };
    }
    out.job_id = jobId;
    if (returnAsync) {
      out.status = "submitted";
      return out;
    }
    return finishPolledRun(config, out, jobId, merged);
  }

  if (status >= 400) {
    const text = Buffer.from(body).toString("utf8");
    try {
      return { ...out, ok: false, error: JSON.parse(text) };
    } catch {
      return { ...out, ok: false, error: `HTTP ${status}: ${text.slice(0, 500)}` };
    }
  }

  if (contentType && contentType.includes("image/png")) {
    out.rawPngBase64 = abToBase64(body);
    out.job_id = headers.get("x-job-id") || undefined;
    const duration = headers.get("x-duration-ms");
    out.duration_ms = duration ? Number(duration) : undefined;
    out.sync = true;
    return out;
  }

  const text = Buffer.from(body).toString("utf8");
  const json = JSON.parse(text);
  Object.assign(out, json);
  out.job_id = json.job_id || json.jobId || out.job_id;

  if (status === 202 && out.job_id && json.status_url) {
    if (returnAsync) {
      out.status = "submitted";
      return out;
    }
    return finishPolledRun(config, out, out.job_id, merged);
  }

  if (json.status === "completed_timeout" || json.status === "completed_error") {
    out.ok = false;
  }
  return out;
}

async function finishPolledRun(config, out, jobId, payload) {
  const scriptTimeoutMs = ((payload.timeout_sec ?? payload.timeoutSec ?? 60) * 1000);
  const jobStatus = await pollJobStatus(config, jobId, scriptTimeoutMs + 30_000);
  if (["poll_timeout", "poll_error", "failed"].includes(jobStatus.status)) {
    out.ok = false;
    out.status = jobStatus.status;
    out.error = jobStatus.error || `Job ${jobStatus.status}`;
    return out;
  }

  const artifacts = await fetchArtifactsAndBuild(config, jobId, payload.include || []);
  Object.assign(out, artifacts);
  out.job_id = jobId;
  out.status = jobStatus.status;
  out.duration_ms = jobStatus.duration_ms;
  if (jobStatus.status !== "completed") {
    out.ok = false;
    if (jobStatus.timeout) out.timeout = jobStatus.timeout;
    if (jobStatus.error) out.error = jobStatus.error;
  }
  return out;
}

function numberValue(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeServerArgs(args) {
  return {
    ...args,
    directory: args.directory ?? args.dir,
    image: args.image ?? args.server_image,
    command: args.command ?? args.server_command,
    port: numberValue(args.port ?? args.server_port, 3000),
    path: args.path ?? args.server_path,
  };
}

function normalizeBuildArgs(args) {
  return {
    ...args,
    directory: args.directory ?? args.dir,
    command: args.command ?? args.server_command,
    port: numberValue(args.port ?? args.server_port, 3000),
    path: args.path ?? args.server_path,
  };
}

function normalizeJobId(args) {
  return args.job_id ?? args.jobId ?? args.id;
}

async function run(tool, args) {
  if (tool === "riddle_preview") {
    return {
      ok: false,
      error: "Direct Riddle Proof preview creation is not wired in this runtime bridge yet. Use remote/no-diff evidence or add generic preview support before enabling implementation previews.",
    };
  }

  if (tool === "riddle_preview_delete") {
    return { ok: false, error: "Direct Riddle Proof preview deletion is not wired in this runtime bridge yet." };
  }

  if (tool === "riddle_server_preview") {
    return runLocalServerPreview(args);
  }

  if (tool === "riddle_server_preview_status") {
    return { ok: false, error: "Direct Riddle Proof server preview status is not wired in this runtime bridge yet." };
  }

  if (tool === "riddle_build_preview") {
    return { ok: false, error: "Direct Riddle Proof build preview is not wired in this runtime bridge yet." };
  }

  if (tool === "riddle_build_preview_status") {
    return { ok: false, error: "Direct Riddle Proof build preview status is not wired in this runtime bridge yet." };
  }

  if (tool === "riddle_script") {
    return runWithDefaults(args, {
      include: TOOL_DEFAULT_INCLUDE,
      returnAsync: !!args.async,
    });
  }

  if (tool === "riddle_visual_diff") {
    const {
      async,
      options,
      stealth,
      timeout_sec,
      ...visualDiffOptions
    } = args;
    const script = `return await visualDiff(${JSON.stringify(visualDiffOptions)});`;
    return runWithDefaults({
      url: args.url_before,
      script,
      options: { ...(options ?? {}), returnResult: true },
      stealth,
      timeout_sec: timeout_sec ?? 60,
      async,
    }, {
      include: ["result", "console", "visual_diff"],
      returnAsync: !!async,
    });
  }

  if (tool === "riddle_run") {
    return runWithDefaults(args.payload ?? args, {
      include: ["screenshot", "console", "result"],
      returnAsync: !!args.async,
    });
  }

  throw new Error("Unsupported direct Riddle tool: " + tool);
}

async function main() {
  const tool = process.argv[2];
  const rawArgs = process.argv[3] || "{}";
  if (!tool) throw new Error("Usage: riddle_core_call.mjs <tool> <json-args>");
  const args = JSON.parse(rawArgs);
  const result = await run(tool, args);
  writeResult(result);
}

main().catch((err) => {
  writeResult({
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  });
});

function writeResult(result) {
  const encoded = JSON.stringify(result);
  if (process.env.RIDDLE_PROOF_DIRECT_RESULT_FILE) {
    writeFileSync(process.env.RIDDLE_PROOF_DIRECT_RESULT_FILE, encoded);
    process.exit(0);
    return;
  }
  console.log(encoded);
}
