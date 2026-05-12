import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const DEFAULT_RIDDLE_API_BASE_URL = "https://api.riddledc.com";
export const DEFAULT_RIDDLE_API_KEY_FILE = "/tmp/riddle-api-key";

export type RiddleFetch = typeof fetch;

export interface RiddleClientConfig {
  apiKey?: string;
  apiKeyFile?: string;
  apiBaseUrl?: string;
  fetchImpl?: RiddleFetch;
}

export interface RiddlePreviewDeployResult {
  ok: true;
  id: string;
  label: string;
  preview_url: string;
  file_count?: number;
  total_bytes?: number;
  expires_at?: string;
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

function normalizeBaseUrl(value?: string) {
  return (value || DEFAULT_RIDDLE_API_BASE_URL).replace(/\/$/, "");
}

function fetchFor(config: RiddleClientConfig = {}) {
  return config.fetchImpl || fetch;
}

export function resolveRiddleApiKey(config: RiddleClientConfig = {}) {
  if (config.apiKey?.trim()) return config.apiKey.trim();
  if (process.env.RIDDLE_API_KEY?.trim()) return process.env.RIDDLE_API_KEY.trim();
  const keyFile = config.apiKeyFile || process.env.RIDDLE_API_KEY_FILE || DEFAULT_RIDDLE_API_KEY_FILE;
  if (existsSync(keyFile)) {
    const key = readFileSync(keyFile, "utf8").trim();
    if (key) return key;
  }
  throw new Error(`Riddle API key missing. Set RIDDLE_API_KEY or write ${DEFAULT_RIDDLE_API_KEY_FILE}.`);
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

export async function deployRiddleStaticPreview(
  config: RiddleClientConfig,
  directory: string,
  label: string,
): Promise<RiddlePreviewDeployResult> {
  if (!directory?.trim()) throw new Error("directory is required");
  if (!label?.trim()) throw new Error("label is required");

  const created = await riddleRequestJson<Record<string, unknown>>(config, "/v1/preview", {
    method: "POST",
    body: JSON.stringify({ framework: "spa", label }),
  });
  const id = String(created.id || "");
  const uploadUrl = String(created.upload_url || "");
  if (!id || !uploadUrl) throw new Error("Riddle preview create response was missing id or upload_url.");

  const scratch = mkdtempSync(path.join(tmpdir(), "riddle-preview-upload-"));
  const tarball = path.join(scratch, `${id}.tar.gz`);
  try {
    execFileSync("tar", ["czf", tarball, "-C", directory, "."], { stdio: "pipe" });
    const upload = await fetchFor(config)(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/gzip" },
      body: readFileSync(tarball) as unknown as BodyInit,
    });
    if (!upload.ok) {
      throw new RiddleApiError(uploadUrl, upload.status, await upload.text());
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const published = await riddleRequestJson<Record<string, unknown>>(config, `/v1/preview/${id}/publish`, {
    method: "POST",
  });
  return {
    ok: true,
    id: String(published.id || id),
    label,
    preview_url: String(published.preview_url || ""),
    file_count: typeof published.file_count === "number" ? published.file_count : undefined,
    total_bytes: typeof published.total_bytes === "number" ? published.total_bytes : undefined,
    expires_at: typeof created.expires_at === "string" ? created.expires_at : undefined,
    raw: published,
  };
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

export async function pollRiddleJob(
  config: RiddleClientConfig,
  jobId: string,
  options: { wait?: boolean; attempts?: number; intervalMs?: number } = {},
): Promise<RiddlePollJobResult> {
  if (!jobId?.trim()) throw new Error("jobId is required");
  const attempts = options.attempts || (options.wait ? 60 : 1);
  const intervalMs = options.intervalMs || 2000;
  let job: Record<string, unknown> | null = null;

  for (let index = 0; index < attempts; index += 1) {
    job = await riddleRequestJson<Record<string, unknown>>(config, `/v1/jobs/${jobId}`);
    if (isTerminalRiddleJobStatus(job.status)) break;
    if (index + 1 < attempts) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  const status = job?.status ? String(job.status) : null;
  if (!isTerminalRiddleJobStatus(status)) {
    return { ok: true, job_id: jobId, status, terminal: false, job };
  }

  const artifacts = await riddleRequestJson<Record<string, unknown>>(config, `/v1/jobs/${jobId}/artifacts`);
  return {
    ok: status === "completed" || status === "complete",
    job_id: jobId,
    status,
    terminal: true,
    job,
    artifacts,
  };
}

export function createRiddleApiClient(config: RiddleClientConfig = {}) {
  return {
    requestJson: <T = unknown>(pathname: string, init?: RequestInit) =>
      riddleRequestJson<T>(config, pathname, init),
    deployStaticPreview: (directory: string, label: string) =>
      deployRiddleStaticPreview(config, directory, label),
    runScript: (input: RiddleRunScriptInput) =>
      runRiddleScript(config, input),
    runServerPreview: (input: RiddleServerPreviewInput) =>
      runRiddleServerPreview(config, input),
    pollJob: (jobId: string, options?: { wait?: boolean; attempts?: number; intervalMs?: number }) =>
      pollRiddleJob(config, jobId, options),
  };
}
