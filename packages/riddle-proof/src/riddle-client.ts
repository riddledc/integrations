import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const DEFAULT_RIDDLE_API_BASE_URL = "https://api.riddledc.com";
export const DEFAULT_RIDDLE_API_KEY_FILE = "/tmp/riddle-api-key";
export const RIDDLE_UNSUBMITTED_WAKE_HINT = "hosted worker may still be waking or waiting for a lease";

export type RiddleFetch = typeof fetch;

export interface RiddleClientConfig {
  apiKey?: string;
  apiKeyFile?: string;
  apiBaseUrl?: string;
  fetchImpl?: RiddleFetch;
  onPreviewProgress?: (snapshot: RiddlePreviewDeployProgressSnapshot) => void | Promise<void>;
}

export interface RiddleApiKeySource {
  source: "option" | "env" | "file";
  file?: string;
}

export interface RiddleBalanceResult {
  available_seconds?: number;
  reserved_seconds?: number;
  total_seconds?: number;
  available_time?: string;
  total_time?: string;
  available_dollars?: number;
  reserved_dollars?: number;
  total_dollars?: number;
  currency?: string;
  holds_count?: number;
  rate?: Record<string, unknown>;
}

export interface RiddlePollProgressSnapshot {
  job_id: string;
  status: string | null;
  terminal: boolean;
  attempt: number;
  attempts: number;
  elapsed_ms: number;
  created_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  queue_elapsed_ms: number | null;
  pre_submission_elapsed_ms: number;
  running_without_submission: boolean;
}

export interface RiddlePollSummary extends RiddlePollProgressSnapshot {
  timed_out: boolean;
  interval_ms: number;
  unsubmitted_timeout?: boolean;
  unsubmitted_timeout_ms?: number;
  message?: string;
}

export interface RiddlePollJobOptions {
  wait?: boolean;
  attempts?: number;
  intervalMs?: number;
  progressEveryMs?: number;
  unsubmittedTimeoutMs?: number;
  onProgress?: (snapshot: RiddlePollProgressSnapshot) => void | Promise<void>;
}

export type RiddlePreviewFramework = "spa" | "static";
export type RiddlePreviewDeployStage =
  | "validating"
  | "creating"
  | "created"
  | "archiving"
  | "archived"
  | "uploading"
  | "uploaded"
  | "publishing"
  | "publish_recovering"
  | "checking_status"
  | "ready";

export interface RiddlePreviewDeployProgressSnapshot {
  stage: RiddlePreviewDeployStage;
  label: string;
  framework: RiddlePreviewFramework;
  directory: string;
  elapsed_ms: number;
  id?: string;
  preview_url?: string;
  file_count?: number;
  total_bytes?: number;
  tarball_bytes?: number;
  attempt?: number;
  attempts?: number;
  status?: string | null;
  publish_error?: string;
  warnings?: string[];
  message?: string;
}

export interface RiddlePreviewDeployResult {
  ok: true;
  id: string;
  label: string;
  framework: RiddlePreviewFramework;
  preview_url: string;
  file_count?: number;
  total_bytes?: number;
  expires_at?: string;
  publish_recovered?: boolean;
  publish_error?: string;
  warnings?: string[];
  raw?: Record<string, unknown>;
}

export interface RiddleRunScriptInput {
  url: string;
  script: string;
  viewport?: { width: number; height: number };
  timeoutSec?: number;
  sync?: boolean;
  strict?: boolean;
  include?: string[];
  options?: Record<string, unknown>;
}

export interface RiddleServerPreviewInput {
  directory: string;
  script: string;
  image?: string;
  command?: string;
  port?: number;
  path?: string;
  readinessPath?: string;
  readinessTimeoutSec?: number;
  waitForSelector?: string;
  waitUntil?: "commit" | "domcontentloaded" | "load" | "networkidle";
  navigationTimeoutSec?: number;
  viewport?: { width: number; height: number };
  timeoutSec?: number;
  pollAttempts?: number;
  pollIntervalMs?: number;
  exclude?: string[];
}

export interface RiddlePollJobResult {
  ok: boolean;
  job_id: string;
  status: string | null;
  terminal: boolean;
  job: Record<string, unknown> | null;
  artifacts?: Record<string, unknown> | null;
  poll?: RiddlePollSummary;
}

export interface RiddleServerPreviewResult {
  ok: boolean;
  job_id: string;
  status: string | null;
  terminal: boolean;
  script_error: string | null;
  job: Record<string, unknown> | null;
}

export class RiddleApiError extends Error {
  readonly status: number;
  readonly body: string;
  readonly path: string;

  constructor(pathname: string, status: number, body: string) {
    super(`Riddle API ${pathname} failed HTTP ${status}: ${body}`);
    this.name = "RiddleApiError";
    this.status = status;
    this.body = body;
    this.path = pathname;
  }
}

const PREVIEW_PUBLISH_RECOVERY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const PREVIEW_PUBLISH_RECOVERY_ATTEMPTS = 30;
const PREVIEW_PUBLISH_RECOVERY_INTERVAL_MS = 2000;

interface RiddlePreviewDirectorySummary {
  file_count: number;
  total_bytes: number;
}

function normalizeBaseUrl(value?: string) {
  return (value || DEFAULT_RIDDLE_API_BASE_URL).replace(/\/$/, "");
}

function fetchFor(config: RiddleClientConfig = {}) {
  return config.fetchImpl || fetch;
}

function resolveRiddleApiKeyWithSource(config: RiddleClientConfig = {}): RiddleApiKeySource & { apiKey: string } {
  if (config.apiKey?.trim()) return { apiKey: config.apiKey.trim(), source: "option" };
  if (process.env.RIDDLE_API_KEY?.trim()) return { apiKey: process.env.RIDDLE_API_KEY.trim(), source: "env" };
  const keyFile = config.apiKeyFile || process.env.RIDDLE_API_KEY_FILE || DEFAULT_RIDDLE_API_KEY_FILE;
  if (existsSync(keyFile)) {
    const key = readFileSync(keyFile, "utf8").trim();
    if (key) return { apiKey: key, source: "file", file: keyFile };
  }
  throw new Error(`Riddle API key missing. Set RIDDLE_API_KEY or write ${DEFAULT_RIDDLE_API_KEY_FILE}.`);
}

export function resolveRiddleApiKeySource(config: RiddleClientConfig = {}): RiddleApiKeySource {
  const { apiKey: _apiKey, ...source } = resolveRiddleApiKeyWithSource(config);
  return source;
}

export function resolveRiddleApiKey(config: RiddleClientConfig = {}) {
  return resolveRiddleApiKeyWithSource(config).apiKey;
}

export async function riddleRequestJson<T = unknown>(
  config: RiddleClientConfig,
  pathname: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetchFor(config)(`${normalizeBaseUrl(config.apiBaseUrl)}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${resolveRiddleApiKey(config)}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Preserve the raw response body for non-JSON diagnostics.
  }
  if (!response.ok) throw new RiddleApiError(pathname, response.status, text);
  return (json ?? text) as T;
}

export async function getRiddleBalance(config: RiddleClientConfig = {}): Promise<RiddleBalanceResult> {
  return riddleRequestJson<RiddleBalanceResult>(config, "/v1/balance", { method: "GET" });
}

function previewDeployResultFromRecord(input: {
  record: Record<string, unknown>;
  id: string;
  label: string;
  framework: RiddlePreviewFramework;
  expiresAt?: string;
  publishRecovered?: boolean;
  publishError?: string;
  warnings?: string[];
}): RiddlePreviewDeployResult {
  const { record, id, label, framework, expiresAt, publishRecovered, publishError } = input;
  return {
    ok: true,
    id: String(record.id || record.preview_id || id),
    label,
    framework,
    preview_url: String(record.preview_url || ""),
    file_count: typeof record.file_count === "number" ? record.file_count : undefined,
    total_bytes: typeof record.total_bytes === "number" ? record.total_bytes : undefined,
    expires_at: expiresAt,
    publish_recovered: publishRecovered || undefined,
    publish_error: publishError,
    warnings: input.warnings?.length ? input.warnings : undefined,
    raw: record,
  };
}

function canRecoverPreviewPublish(error: unknown): error is RiddleApiError {
  return error instanceof RiddleApiError && PREVIEW_PUBLISH_RECOVERY_STATUSES.has(error.status);
}

function summarizePreviewDirectory(directory: string): RiddlePreviewDirectorySummary {
  const stack = [directory];
  let fileCount = 0;
  let totalBytes = 0;
  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const stat = statSync(fullPath);
      fileCount += 1;
      totalBytes += stat.size;
    }
  }
  return { file_count: fileCount, total_bytes: totalBytes };
}

function previewProgressEmitter(
  config: RiddleClientConfig,
  base: {
    label: string;
    framework: RiddlePreviewFramework;
    directory: string;
    startedAt: number;
    warnings?: string[];
  },
) {
  return async (snapshot: Omit<RiddlePreviewDeployProgressSnapshot, "label" | "framework" | "directory" | "elapsed_ms">) => {
    if (!config.onPreviewProgress) return;
    await config.onPreviewProgress({
      label: base.label,
      framework: base.framework,
      directory: base.directory,
      elapsed_ms: Math.max(0, Date.now() - base.startedAt),
      warnings: base.warnings?.length ? base.warnings : undefined,
      ...snapshot,
    });
  };
}

async function waitForPublishedPreview(
  config: RiddleClientConfig,
  input: {
    id: string;
    label: string;
    framework: RiddlePreviewFramework;
    expiresAt?: string;
    publishError: RiddleApiError;
    warnings?: string[];
    localSummary?: RiddlePreviewDirectorySummary;
    emitProgress?: ReturnType<typeof previewProgressEmitter>;
  },
) {
  await input.emitProgress?.({
    stage: "publish_recovering",
    id: input.id,
    file_count: input.localSummary?.file_count,
    total_bytes: input.localSummary?.total_bytes,
    publish_error: input.publishError.message,
    message: `publish returned ${input.publishError.status}; polling preview status`,
  });
  for (let attempt = 1; attempt <= PREVIEW_PUBLISH_RECOVERY_ATTEMPTS; attempt += 1) {
    const status = await riddleRequestJson<Record<string, unknown>>(config, `/v1/preview/${input.id}`);
    await input.emitProgress?.({
      stage: "checking_status",
      id: input.id,
      attempt,
      attempts: PREVIEW_PUBLISH_RECOVERY_ATTEMPTS,
      status: typeof status.status === "string" ? status.status : null,
      preview_url: typeof status.preview_url === "string" ? status.preview_url : undefined,
      file_count: typeof status.file_count === "number" ? status.file_count : input.localSummary?.file_count,
      total_bytes: typeof status.total_bytes === "number" ? status.total_bytes : input.localSummary?.total_bytes,
    });
    if (String(status.status || "") === "ready" && String(status.preview_url || "").trim()) {
      await input.emitProgress?.({
        stage: "ready",
        id: input.id,
        preview_url: String(status.preview_url),
        file_count: typeof status.file_count === "number" ? status.file_count : input.localSummary?.file_count,
        total_bytes: typeof status.total_bytes === "number" ? status.total_bytes : input.localSummary?.total_bytes,
      });
      return previewDeployResultFromRecord({
        record: status,
        id: input.id,
        label: input.label,
        framework: input.framework,
        expiresAt: input.expiresAt,
        publishRecovered: true,
        publishError: input.publishError.message,
        warnings: input.warnings,
      });
    }
    if (attempt < PREVIEW_PUBLISH_RECOVERY_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, PREVIEW_PUBLISH_RECOVERY_INTERVAL_MS));
    }
  }
  throw input.publishError;
}

export async function deployRiddlePreview(
  config: RiddleClientConfig,
  directory: string,
  label: string,
  framework: RiddlePreviewFramework = "static",
): Promise<RiddlePreviewDeployResult> {
  if (!directory?.trim()) throw new Error("directory is required");
  if (!label?.trim()) throw new Error("label is required");
  if (framework !== "spa" && framework !== "static") throw new Error("framework must be spa or static");
  const startedAt = Date.now();
  const warnings = collectRiddlePreviewDeployWarnings(directory, framework);
  const emitProgress = previewProgressEmitter(config, { label, framework, directory, startedAt, warnings });
  await emitProgress({ stage: "validating", message: "checking preview input directory" });
  const localSummary = summarizePreviewDirectory(directory);
  await emitProgress({
    stage: "creating",
    file_count: localSummary.file_count,
    total_bytes: localSummary.total_bytes,
    message: "creating preview upload target",
  });

  const created = await riddleRequestJson<Record<string, unknown>>(config, "/v1/preview", {
    method: "POST",
    body: JSON.stringify({ framework, label }),
  });
  const id = String(created.id || "");
  const uploadUrl = String(created.upload_url || "");
  if (!id || !uploadUrl) throw new Error("Riddle preview create response was missing id or upload_url.");
  await emitProgress({
    stage: "created",
    id,
    file_count: localSummary.file_count,
    total_bytes: localSummary.total_bytes,
    message: "preview upload target created",
  });

  const scratch = mkdtempSync(path.join(tmpdir(), "riddle-preview-upload-"));
  const tarball = path.join(scratch, `${id}.tar.gz`);
  let tarballBytes = 0;
  try {
    await emitProgress({
      stage: "archiving",
      id,
      file_count: localSummary.file_count,
      total_bytes: localSummary.total_bytes,
      message: "creating preview archive",
    });
    execFileSync("tar", ["czf", tarball, "-C", directory, "."], { stdio: "pipe" });
    tarballBytes = statSync(tarball).size;
    await emitProgress({
      stage: "archived",
      id,
      file_count: localSummary.file_count,
      total_bytes: localSummary.total_bytes,
      tarball_bytes: tarballBytes,
      message: "preview archive created",
    });
    await emitProgress({
      stage: "uploading",
      id,
      file_count: localSummary.file_count,
      total_bytes: localSummary.total_bytes,
      tarball_bytes: tarballBytes,
      message: "uploading preview archive",
    });
    const upload = await fetchFor(config)(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/gzip" },
      body: readFileSync(tarball) as unknown as BodyInit,
    });
    if (!upload.ok) {
      throw new RiddleApiError(uploadUrl, upload.status, await upload.text());
    }
    await emitProgress({
      stage: "uploaded",
      id,
      file_count: localSummary.file_count,
      total_bytes: localSummary.total_bytes,
      tarball_bytes: tarballBytes,
      message: "preview archive uploaded",
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const expiresAt = typeof created.expires_at === "string" ? created.expires_at : undefined;
  try {
    await emitProgress({
      stage: "publishing",
      id,
      file_count: localSummary.file_count,
      total_bytes: localSummary.total_bytes,
      tarball_bytes: tarballBytes || undefined,
      message: "publishing preview",
    });
    const published = await riddleRequestJson<Record<string, unknown>>(config, `/v1/preview/${id}/publish`, {
      method: "POST",
    });
    await emitProgress({
      stage: "ready",
      id,
      preview_url: String(published.preview_url || ""),
      file_count: typeof published.file_count === "number" ? published.file_count : localSummary.file_count,
      total_bytes: typeof published.total_bytes === "number" ? published.total_bytes : localSummary.total_bytes,
    });
    return previewDeployResultFromRecord({ record: published, id, label, framework, expiresAt, warnings });
  } catch (error) {
    if (!canRecoverPreviewPublish(error)) throw error;
    return waitForPublishedPreview(config, {
      id,
      label,
      framework,
      expiresAt,
      publishError: error,
      warnings,
      localSummary,
      emitProgress,
    });
  }
}

function latestMatchingMtimeMs(directory: string, predicate: (filePath: string) => boolean) {
  let latest = 0;
  const stack = [directory];
  let visited = 0;
  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile() || !predicate(fullPath)) continue;
      const stat = statSync(fullPath);
      latest = Math.max(latest, stat.mtimeMs);
      visited += 1;
      if (visited >= 10000) return latest;
    }
  }
  return latest;
}

export function collectRiddlePreviewDeployWarnings(
  directory: string,
  framework: RiddlePreviewFramework = "static",
): string[] {
  try {
    if (framework !== "static") return [];
    const resolvedDirectory = path.resolve(directory);
    if (path.basename(resolvedDirectory) !== "out") return [];

    const repoRoot = path.dirname(resolvedDirectory);
    const nextAppDir = path.join(repoRoot, ".next", "server", "app");
    if (!existsSync(nextAppDir)) return [];

    const nextRenderedMtimeMs = latestMatchingMtimeMs(nextAppDir, (filePath) => /\.(?:html|rsc)$/i.test(filePath));
    if (!nextRenderedMtimeMs) return [];

    const outRenderedMtimeMs = existsSync(resolvedDirectory)
      ? latestMatchingMtimeMs(resolvedDirectory, (filePath) => /\.(?:html|txt|rsc)$/i.test(filePath))
      : 0;

    if (!outRenderedMtimeMs) {
      return [
        "Riddle Preview static deploy target is an out/ directory with newer Next render output in .next/server/app, but no rendered HTML/RSC files were found in out/. Run the project static bundle/export step before deploying.",
      ];
    }

    if (nextRenderedMtimeMs > outRenderedMtimeMs + 1000) {
      return [
        "Riddle Preview static deploy target out/ appears older than the Next render output in .next/server/app. Run the project static bundle/export step, such as npm run build:static-deploy or next export, before deploying to avoid a stale Preview.",
      ];
    }

    return [];
  } catch {
    return [];
  }
}

export async function deployRiddleStaticPreview(
  config: RiddleClientConfig,
  directory: string,
  label: string,
): Promise<RiddlePreviewDeployResult> {
  return deployRiddlePreview(config, directory, label, "static");
}

function createTarball(directory: string, label: string, exclude: string[] = []) {
  const scratch = mkdtempSync(path.join(tmpdir(), "riddle-upload-"));
  const tarball = path.join(scratch, `${label}.tar.gz`);
  const excludeArgs = exclude.flatMap((item) => ["--exclude", item]);
  try {
    execFileSync("tar", ["czf", tarball, ...excludeArgs, "-C", directory, "."], { stdio: "pipe" });
    return { scratch, tarball };
  } catch (error) {
    rmSync(scratch, { recursive: true, force: true });
    throw error;
  }
}

export function parseRiddleViewport(value?: string) {
  if (!value) return undefined;
  const match = /^(\d+)x(\d+)$/.exec(value.trim());
  if (!match) throw new Error("viewport must look like 1280x720");
  return { width: Number(match[1]), height: Number(match[2]) };
}

function scriptErrorFrom(job: Record<string, unknown> | null) {
  const nested = job?.proof_of_execution && typeof job.proof_of_execution === "object" && !Array.isArray(job.proof_of_execution)
    ? job.proof_of_execution as Record<string, unknown>
    : null;
  return typeof job?.script_error === "string" && job.script_error.trim()
    ? job.script_error
    : typeof nested?.script_error === "string" && nested.script_error.trim()
      ? nested.script_error
      : null;
}

export async function runRiddleServerPreview(
  config: RiddleClientConfig,
  input: RiddleServerPreviewInput,
): Promise<RiddleServerPreviewResult> {
  if (!input.directory?.trim()) throw new Error("directory is required");
  if (!input.script?.trim()) throw new Error("script is required");
  const port = input.port || 3000;
  const routePath = input.path || "/";
  const timeoutSec = input.timeoutSec || 180;
  const created = await riddleRequestJson<Record<string, unknown>>(config, "/v1/server-preview", {
    method: "POST",
    body: JSON.stringify({
      image: input.image || "node:22-slim",
      command: input.command || "node scripts/riddleSpaPreviewServer.mjs build 3000",
      port,
      path: routePath,
      readiness_path: input.readinessPath || routePath,
      readiness_timeout: input.readinessTimeoutSec || 90,
      wait_until: input.waitUntil || "domcontentloaded",
      wait_for_selector: input.waitForSelector || "body",
      navigation_timeout: input.navigationTimeoutSec || 60,
      viewport: input.viewport,
      timeout: timeoutSec,
      script: input.script,
    }),
  });
  const jobId = String(created.job_id || "");
  const uploadUrl = String(created.upload_url || "");
  if (!jobId || !uploadUrl) {
    throw new Error(`Riddle server preview create response was missing job_id or upload_url.`);
  }

  const { scratch, tarball } = createTarball(input.directory, jobId, [
    ".git",
    "node_modules",
    "test-results",
    ...(input.exclude || []),
  ]);
  try {
    const upload = await fetchFor(config)(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/gzip" },
      body: readFileSync(tarball) as unknown as BodyInit,
    });
    if (!upload.ok) throw new RiddleApiError(uploadUrl, upload.status, await upload.text());
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  await riddleRequestJson<Record<string, unknown>>(config, `/v1/server-preview/${jobId}/start`, {
    method: "POST",
  });

  let job: Record<string, unknown> | null = null;
  const attempts = input.pollAttempts || Math.ceil((timeoutSec + 90) / 2);
  const intervalMs = input.pollIntervalMs || 2000;
  for (let index = 0; index < attempts; index += 1) {
    job = await riddleRequestJson<Record<string, unknown>>(config, `/v1/server-preview/${jobId}`);
    if (isTerminalRiddleJobStatus(job.status)) break;
    if (index + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const status = job?.status ? String(job.status) : null;
  const scriptError = scriptErrorFrom(job);
  return {
    ok: (status === "completed" || status === "complete") && !scriptError,
    job_id: jobId,
    status,
    terminal: isTerminalRiddleJobStatus(status),
    script_error: scriptError,
    job,
  };
}

export async function runRiddleScript(
  config: RiddleClientConfig,
  input: RiddleRunScriptInput,
) {
  if (!input.url?.trim()) throw new Error("url is required");
  if (!input.script?.trim()) throw new Error("script is required");
  const payload: Record<string, unknown> = {
    url: input.url,
    script: input.script,
    sync: input.sync ?? false,
    timeout_sec: input.timeoutSec || 120,
  };
  if (input.viewport) payload.viewport = input.viewport;
  if (input.include) payload.include = input.include;
  if (typeof input.strict === "boolean") payload.strict = input.strict;
  if (input.options) payload.options = input.options;
  return riddleRequestJson<Record<string, unknown>>(config, "/v1/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function isTerminalRiddleJobStatus(status: unknown) {
  return ["completed", "complete", "completed_error", "completed_timeout", "failed"].includes(String(status || ""));
}

function stringField(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseTimestampMs(value: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildPollSnapshot(
  jobId: string,
  job: Record<string, unknown> | null,
  input: { attempt: number; attempts: number; startedAt: number; observedAt: number; preSubmissionElapsedMs?: number },
): RiddlePollProgressSnapshot {
  const status = job?.status ? String(job.status) : null;
  const terminal = isTerminalRiddleJobStatus(status);
  const createdAt = stringField(job, "created_at");
  const submittedAt = stringField(job, "submitted_at");
  const completedAt = stringField(job, "completed_at");
  const createdMs = parseTimestampMs(createdAt);
  const submittedMs = parseTimestampMs(submittedAt);
  let queueElapsedMs: number | null = null;
  if (createdMs !== null && submittedMs !== null) {
    queueElapsedMs = Math.max(0, submittedMs - createdMs);
  } else if (createdMs !== null && !submittedAt && !terminal) {
    queueElapsedMs = Math.max(0, input.observedAt - createdMs);
  }
  return {
    job_id: jobId,
    status,
    terminal,
    attempt: input.attempt,
    attempts: input.attempts,
    elapsed_ms: Math.max(0, input.observedAt - input.startedAt),
    created_at: createdAt,
    submitted_at: submittedAt,
    completed_at: completedAt,
    queue_elapsed_ms: queueElapsedMs,
    pre_submission_elapsed_ms: Math.max(0, Math.floor(input.preSubmissionElapsedMs ?? 0)),
    running_without_submission: Boolean(status && !terminal && !submittedAt),
  };
}

function pollMessage(snapshot: RiddlePollProgressSnapshot, timedOut: boolean) {
  if (!timedOut) return undefined;
  const submitted = snapshot.submitted_at || "not submitted";
  const wakeHint = snapshot.running_without_submission && !snapshot.created_at && !snapshot.submitted_at
    ? ` ${RIDDLE_UNSUBMITTED_WAKE_HINT}.`
    : "";
  const queue = snapshot.queue_elapsed_ms !== null
    ? ` queue_elapsed_ms=${snapshot.queue_elapsed_ms}`
    : "";
  const preSubmit = snapshot.pre_submission_elapsed_ms > 0
    ? ` pre_submission_elapsed_ms=${snapshot.pre_submission_elapsed_ms}`
    : "";
  return `Riddle job ${snapshot.job_id} did not reach a terminal status after ${snapshot.attempt} poll attempts; status=${snapshot.status || "unknown"} submitted_at=${submitted}.${wakeHint}${queue}${preSubmit}`;
}

export async function pollRiddleJob(
  config: RiddleClientConfig,
  jobId: string,
  options: RiddlePollJobOptions = {},
): Promise<RiddlePollJobResult> {
  if (!jobId?.trim()) throw new Error("jobId is required");
  const attempts = Math.max(1, Math.floor(options.attempts ?? (options.wait ? 300 : 1)));
  const intervalMs = Math.max(0, Math.floor(options.intervalMs ?? 2000));
  const progressEveryMs = Math.max(0, Math.floor(options.progressEveryMs ?? 10000));
  const unsubmittedTimeoutMs = Math.max(0, Math.floor(options.unsubmittedTimeoutMs ?? 0));
  const startedAt = Date.now();
  let job: Record<string, unknown> | null = null;
  let lastSnapshot: RiddlePollProgressSnapshot | null = null;
  let lastProgressAt = 0;
  let lastProgressKey = "";
  let preSubmissionElapsedMs = 0;
  let unsubmittedTimedOut = false;

  for (let index = 0; index < attempts; index += 1) {
    job = await riddleRequestJson<Record<string, unknown>>(config, `/v1/jobs/${jobId}`);
    const observedAt = Date.now();
    const nextSnapshot = buildPollSnapshot(jobId, job, {
      attempt: index + 1,
      attempts,
      startedAt,
      observedAt,
      preSubmissionElapsedMs,
    });
    if (nextSnapshot.running_without_submission) {
      preSubmissionElapsedMs = Math.max(preSubmissionElapsedMs, nextSnapshot.elapsed_ms);
    }
    lastSnapshot = {
      ...nextSnapshot,
      pre_submission_elapsed_ms: preSubmissionElapsedMs,
    };
    const progressKey = [
      lastSnapshot.status || "unknown",
      lastSnapshot.terminal ? "terminal" : "nonterminal",
      lastSnapshot.submitted_at ? "submitted" : "unsubmitted",
    ].join(":");
    if (options.onProgress) {
      const shouldReport = index === 0 ||
        lastSnapshot.terminal ||
        progressKey !== lastProgressKey ||
        observedAt - lastProgressAt >= progressEveryMs;
      if (shouldReport) {
        lastProgressAt = observedAt;
        lastProgressKey = progressKey;
        await options.onProgress(lastSnapshot);
      }
    }
    unsubmittedTimedOut = Boolean(
      options.wait &&
      unsubmittedTimeoutMs > 0 &&
      lastSnapshot.running_without_submission &&
      !lastSnapshot.created_at &&
      !lastSnapshot.submitted_at &&
      preSubmissionElapsedMs >= unsubmittedTimeoutMs
    );
    if (lastSnapshot.terminal) break;
    if (unsubmittedTimedOut) break;
    if (index + 1 < attempts) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  const status = job?.status ? String(job.status) : null;
  const fallbackObservedAt = Date.now();
  const snapshot = lastSnapshot || buildPollSnapshot(jobId, job, {
    attempt: 0,
    attempts,
    startedAt,
    observedAt: fallbackObservedAt,
  });
  if (!isTerminalRiddleJobStatus(status)) {
    const timedOut = Boolean(options.wait);
    return {
      ok: !timedOut,
      job_id: jobId,
      status,
      terminal: false,
      job,
      poll: {
        ...snapshot,
        timed_out: timedOut,
        interval_ms: intervalMs,
        unsubmitted_timeout: unsubmittedTimedOut || undefined,
        unsubmitted_timeout_ms: unsubmittedTimedOut ? unsubmittedTimeoutMs : undefined,
        message: pollMessage(snapshot, timedOut),
      },
    };
  }

  const artifacts = await riddleRequestJson<Record<string, unknown>>(config, `/v1/jobs/${jobId}/artifacts`);
  return {
    ok: status === "completed" || status === "complete",
    job_id: jobId,
    status,
    terminal: true,
    job,
    artifacts,
    poll: {
      ...snapshot,
      timed_out: false,
      interval_ms: intervalMs,
    },
  };
}

export function createRiddleApiClient(config: RiddleClientConfig = {}) {
  return {
    apiKeySource: () => resolveRiddleApiKeySource(config),
    requestJson: <T = unknown>(pathname: string, init?: RequestInit) =>
      riddleRequestJson<T>(config, pathname, init),
    getBalance: () =>
      getRiddleBalance(config),
    deployPreview: (directory: string, label: string, framework: RiddlePreviewFramework = "static") =>
      deployRiddlePreview(config, directory, label, framework),
    deployStaticPreview: (directory: string, label: string) =>
      deployRiddleStaticPreview(config, directory, label),
    runScript: (input: RiddleRunScriptInput) =>
      runRiddleScript(config, input),
    runServerPreview: (input: RiddleServerPreviewInput) =>
      runRiddleServerPreview(config, input),
    pollJob: (jobId: string, options?: RiddlePollJobOptions) =>
      pollRiddleJob(config, jobId, options),
  };
}
