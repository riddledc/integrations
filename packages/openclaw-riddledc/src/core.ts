import { execFile as execFileCb } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export type RiddlePayload = Record<string, any>;

export type RiddleCoreConfig = {
  apiKey?: string;
  baseUrl?: string;
  workspace?: string;
};

export type RunResult = {
  ok: boolean;
  mode?: "url" | "urls" | "steps" | "script";
  sync?: boolean;
  job_id?: string;
  duration_ms?: number;
  status?: string;
  screenshot?: any;
  console?: any;
  har?: any;
  result?: any;
  error?: any;
  rawContentType?: string;
  rawPngBase64?: string;
};

export type PreviewResult = Record<string, any> & { ok: boolean };

const INLINE_CAP = 50 * 1024;
const PREVIEW_REQUEST_TIMEOUT_MS = 30_000;
const PREVIEW_UPLOAD_TIMEOUT_MS = 5 * 60_000;
const PREVIEW_ARTIFACT_TIMEOUT_MS = 60_000;
const PREVIEW_RETRY_ATTEMPTS = 3;
const PREVIEW_RETRY_BASE_DELAY_MS = 750;

export function configFromOpenClawApi(api: any): RiddleCoreConfig {
  const cfg = api?.config ?? {};
  const pluginCfg = cfg?.plugins?.entries?.["openclaw-riddledc"]?.config ?? {};
  return {
    apiKey: process.env.RIDDLE_API_KEY || pluginCfg.apiKey,
    baseUrl: pluginCfg.baseUrl || "https://api.riddledc.com",
    workspace: api?.workspacePath ?? process.cwd(),
  };
}

function requireConfig(config: RiddleCoreConfig): Required<Pick<RiddleCoreConfig, "apiKey" | "baseUrl">> & { workspace: string } {
  const apiKey = config.apiKey || process.env.RIDDLE_API_KEY;
  const baseUrl = config.baseUrl || "https://api.riddledc.com";
  if (!apiKey) {
    throw new Error("Missing Riddle API key. Set RIDDLE_API_KEY env var or configure a Riddle API key.");
  }
  assertAllowedBaseUrl(baseUrl);
  return { apiKey, baseUrl, workspace: config.workspace || process.cwd() };
}

export function assertAllowedBaseUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:") throw new Error(`Riddle baseUrl must be https: (${baseUrl})`);
  if (url.hostname !== "api.riddledc.com") {
    throw new Error(`Refusing to use non-official Riddle host: ${url.hostname}`);
  }
}

function detectMode(payload: RiddlePayload): RunResult["mode"] {
  if (payload.url) return "url";
  if (payload.urls) return "urls";
  if (payload.steps) return "steps";
  if (payload.script) return "script";
  return undefined;
}

async function postRun(
  baseUrl: string,
  apiKey: string,
  payload: any
): Promise<{ contentType: string | null; body: ArrayBuffer; headers: Headers; status: number }> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await res.arrayBuffer();
  return {
    contentType: res.headers.get("content-type"),
    body,
    headers: res.headers,
    status: res.status,
  };
}

function abToBase64(ab: ArrayBuffer): string {
  return Buffer.from(ab).toString("base64");
}

export function describeError(err: unknown): string {
  const anyErr = err as any;
  const parts: string[] = [];
  if (err instanceof Error) parts.push(err.message);
  else parts.push(String(err));

  const cause = anyErr?.cause;
  if (cause) {
    const causeParts = [
      cause.code ? `code=${cause.code}` : "",
      cause.name ? `name=${cause.name}` : "",
      cause.message ? `message=${cause.message}` : "",
    ].filter(Boolean);
    if (causeParts.length) parts.push(`cause: ${causeParts.join(" ")}`);
  }

  return parts.join("; ");
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function isTransientFetchError(err: unknown): boolean {
  const text = describeError(err).toLowerCase();
  return [
    "fetch failed",
    "timed out",
    "timeout",
    "econnreset",
    "econnrefused",
    "etimedout",
    "eai_again",
    "socket",
    "network",
    "und_err",
    "terminated",
  ].some((needle) => text.includes(needle));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  label: string,
  opts: { attempts?: number; baseDelayMs?: number } = {},
): Promise<Response> {
  const attempts = Math.max(1, opts.attempts ?? PREVIEW_RETRY_ATTEMPTS);
  const baseDelayMs = opts.baseDelayMs ?? PREVIEW_RETRY_BASE_DELAY_MS;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetchWithTimeout(url, init, timeoutMs, label);
    } catch (err) {
      lastErr = err;
      if (attempt >= attempts || !isTransientFetchError(err)) break;

      const jitterMs = Math.floor(Math.random() * 250);
      const delayMs = Math.min(baseDelayMs * Math.pow(2, attempt - 1) + jitterMs, 5_000);
      console.warn(`[openclaw-riddledc] ${label} attempt ${attempt}/${attempts} failed: ${describeError(err)}; retrying in ${delayMs}ms`);
      await sleep(delayMs);
    }
  }

  throw new Error(`${label} failed after ${attempts} attempts: ${describeError(lastErr)}`);
}

export function isAlreadyStartedResponse(status: number, body: string): boolean {
  return status === 409 && /already in status:\s*(queued|running|complete|completed)/i.test(body);
}

function previewTimeoutResult(
  jobId: string,
  timeoutMs: number,
  lastStatusData: any,
  resultExtras: (statusData: any) => Record<string, any> = () => ({}),
): PreviewResult {
  const lastStatus = lastStatusData?.status ?? "unknown";
  const lastPhase = lastStatusData?.phase ?? lastStatus;
  const result: PreviewResult = {
    ok: false,
    job_id: jobId,
    status: lastStatus,
    phase: lastPhase,
    phase_updated_at: lastStatusData?.phase_updated_at,
    phase_details: lastStatusData?.phase_details,
    outputs: lastStatusData?.outputs || [],
    compute_seconds: lastStatusData?.compute_seconds,
    egress_bytes: lastStatusData?.egress_bytes,
    error: `Job did not complete within ${timeoutMs / 1000}s; last status was ${lastStatus}, phase was ${lastPhase}`,
    ...resultExtras(lastStatusData ?? {}),
  };
  if (lastStatusData?.error) result.server_error = lastStatusData.error;
  return result;
}

function isCompletedPreviewStatus(status: any): boolean {
  const value = String(status ?? "").toLowerCase();
  return value === "complete" || value === "completed";
}

function isTerminalPreviewStatus(status: any): boolean {
  const value = String(status ?? "").toLowerCase();
  return [
    "complete",
    "completed",
    "failed",
    "completed_error",
    "completed_timeout",
    "timeout",
    "timed_out",
    "cancelled",
    "canceled",
  ].includes(value);
}

async function writeArtifact(
  workspace: string,
  subdir: string,
  filename: string,
  content: string
): Promise<{ path: string; sizeBytes: number }> {
  const dir = join(workspace, "riddle", subdir);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, filename);
  const buf = Buffer.from(content, "utf8");
  await writeFile(filePath, buf);
  return { path: filePath, sizeBytes: buf.byteLength };
}

export async function writeArtifactBinary(
  workspace: string,
  subdir: string,
  filename: string,
  base64Content: string
): Promise<{ path: string; sizeBytes: number }> {
  const dir = join(workspace, "riddle", subdir);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, filename);
  const buf = Buffer.from(base64Content, "base64");
  await writeFile(filePath, buf);
  return { path: filePath, sizeBytes: buf.byteLength };
}

export async function applySafetySpec(
  result: RunResult,
  opts: { workspace: string; harInline?: boolean }
): Promise<void> {
  const jobId = result.job_id ?? "unknown";

  if (result.screenshot != null) {
    let base64Data: string | null = null;
    if (typeof result.screenshot === "string") {
      base64Data = result.screenshot.replace(/^data:image\/\w+;base64,/, "");
    } else if (typeof result.screenshot === "object" && result.screenshot.data) {
      base64Data = result.screenshot.data.replace(/^data:image\/\w+;base64,/, "");
    }
    if (base64Data) {
      const ref = await writeArtifactBinary(opts.workspace, "screenshots", `${jobId}.png`, base64Data);
      const cdnUrl = typeof result.screenshot === "object" ? result.screenshot.url : undefined;
      result.screenshot = { saved: ref.path, sizeBytes: ref.sizeBytes, ...(cdnUrl ? { url: cdnUrl } : {}) };
    }
  }

  if (Array.isArray((result as any).screenshots)) {
    const savedRefs: Array<{ saved: string; sizeBytes: number; url?: string }> = [];
    for (let i = 0; i < (result as any).screenshots.length; i++) {
      const ss = (result as any).screenshots[i];
      let base64Data: string | null = null;
      const cdnUrl = typeof ss === "object" ? ss.url : undefined;
      if (typeof ss === "string") {
        base64Data = ss;
      } else if (typeof ss === "object" && ss.data) {
        base64Data = ss.data.replace(/^data:image\/\w+;base64,/, "");
      }
      if (base64Data) {
        const ref = await writeArtifactBinary(opts.workspace, "screenshots", `${jobId}-${i}.png`, base64Data);
        savedRefs.push({ saved: ref.path, sizeBytes: ref.sizeBytes, ...(cdnUrl ? { url: cdnUrl } : {}) });
      }
    }
    (result as any).screenshots = savedRefs;
  }

  if (result.rawPngBase64 != null) {
    const ref = await writeArtifactBinary(opts.workspace, "screenshots", `${jobId}.png`, result.rawPngBase64);
    result.screenshot = { saved: ref.path, sizeBytes: ref.sizeBytes };
    delete result.rawPngBase64;
  }

  if (result.har != null) {
    const harStr = typeof result.har === "string" ? result.har : JSON.stringify(result.har);
    const harBytes = Buffer.byteLength(harStr, "utf8");

    if (opts.harInline && harBytes <= INLINE_CAP) {
      // Keep small HAR payloads inline only when explicitly requested.
    } else {
      const ref = await writeArtifact(opts.workspace, "har", `${jobId}.har.json`, harStr);
      if (opts.harInline && harBytes > INLINE_CAP) {
        result.har = { saved: ref.path, sizeBytes: ref.sizeBytes, warning: "Exceeded 50KB inline cap; wrote to file" };
      } else {
        result.har = { saved: ref.path, sizeBytes: ref.sizeBytes };
      }
    }
  }

  if (result.console != null) {
    const consoleStr = typeof result.console === "string" ? result.console : JSON.stringify(result.console);
    const consoleBytes = Buffer.byteLength(consoleStr, "utf8");

    if (consoleBytes > INLINE_CAP) {
      const ref = await writeArtifact(opts.workspace, "console", `${jobId}.log`, consoleStr);
      result.console = { saved: ref.path, sizeBytes: ref.sizeBytes };
    }
  }
}

export async function pollJobStatus(
  config: RiddleCoreConfig,
  jobId: string,
  maxWaitMs: number
): Promise<any> {
  const { apiKey, baseUrl } = requireConfig(config);
  const start = Date.now();
  const pollIntervalMs = 2000;

  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      return { status: "poll_error", error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    if (
      data.status === "completed" ||
      data.status === "completed_timeout" ||
      data.status === "completed_error" ||
      data.status === "failed"
    ) {
      return data;
    }
    await sleep(pollIntervalMs);
  }
  return { status: "poll_timeout", error: `Job ${jobId} did not complete within ${maxWaitMs}ms` };
}

export async function fetchArtifactsAndBuild(
  config: RiddleCoreConfig,
  jobId: string,
  include: string[]
): Promise<Record<string, any>> {
  const { apiKey, baseUrl } = requireConfig(config);
  const res = await fetch(
    `${baseUrl.replace(/\/$/, "")}/v1/jobs/${jobId}/artifacts?include=${include.join(",")}`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  if (!res.ok) {
    return { error: `Artifacts fetch failed: HTTP ${res.status}` };
  }
  const data = await res.json();
  const artifacts: Array<{ name: string; url?: string }> = data.artifacts || [];
  const result: Record<string, any> = {};

  if (data.status) result._artifactsStatus = data.status;
  if (data.timeout) result._timeout = data.timeout;
  if (data.error) result._error = data.error;

  const screenshots = artifacts.filter((a) => a.name && /\.(png|jpg|jpeg)$/i.test(a.name));
  if (screenshots.length > 0) {
    result.screenshots = [];
    for (const ss of screenshots) {
      if (!ss.url) continue;
      try {
        const imgRes = await fetch(ss.url);
        if (imgRes.ok) {
          const buf = await imgRes.arrayBuffer();
          result.screenshots.push({
            name: ss.name,
            data: `data:image/png;base64,${Buffer.from(buf).toString("base64")}`,
            size: buf.byteLength,
            url: ss.url,
          });
        }
      } catch {
        // Ignore failed optional artifact downloads.
      }
    }
    if (result.screenshots.length > 0) {
      result.screenshot = result.screenshots[0];
    }
  }

  const consoleArtifact = artifacts.find((a) => a.name === "console.json");
  if (consoleArtifact?.url) {
    try {
      const cRes = await fetch(consoleArtifact.url);
      if (cRes.ok) {
        result.console = await cRes.json();
      }
    } catch {
      // Ignore.
    }
  }

  const resultArtifact = artifacts.find((a) => a.name === "result.json");
  if (resultArtifact?.url) {
    try {
      const rRes = await fetch(resultArtifact.url);
      if (rRes.ok) {
        result.result = await rRes.json();
      }
    } catch {
      // Ignore.
    }
  }

  if (include.includes("har")) {
    const harArtifact = artifacts.find((a) => a.name === "network.har");
    if (harArtifact?.url) {
      try {
        const hRes = await fetch(harArtifact.url);
        if (hRes.ok) {
          result.har = await hRes.json();
        }
      } catch {
        // Ignore.
      }
    }
  }

  return result;
}

export async function runWithDefaults(
  config: RiddleCoreConfig,
  payload: RiddlePayload,
  defaults?: { include?: string[]; returnAsync?: boolean }
): Promise<RunResult> {
  let cfg: ReturnType<typeof requireConfig>;
  try {
    cfg = requireConfig(config);
  } catch (err: any) {
    return { ok: false, error: err.message };
  }

  const mode = detectMode(payload);
  const userInclude: string[] = payload.include ?? [];
  const userRequestedHar = userInclude.includes("har");
  const harInline = !!payload.harInline;
  const returnAsync = !!defaults?.returnAsync;

  const merged: any = { ...payload };
  delete merged.harInline;

  if (returnAsync) {
    merged.sync = false;
  }

  const defaultInc = defaults?.include ?? ["screenshot", "console"];
  merged.include = Array.from(new Set([...userInclude, ...defaultInc]));
  merged.inlineConsole = merged.inlineConsole ?? true;
  merged.inlineResult = merged.inlineResult ?? true;
  if (userRequestedHar) {
    merged.inlineHar = true;
  }

  const out: RunResult = { ok: true, mode };
  const { contentType, body, headers, status } = await postRun(cfg.baseUrl, cfg.apiKey, merged);
  out.rawContentType = contentType ?? undefined;

  if (status === 408) {
    let jobIdFrom408: string | undefined;
    try {
      const json408 = JSON.parse(Buffer.from(body).toString("utf8"));
      jobIdFrom408 = json408.job_id;
    } catch {
      // Fall through.
    }
    if (!jobIdFrom408) {
      out.ok = false;
      out.error = "Sync poll timed out but no job_id in 408 response";
      return out;
    }
    out.job_id = jobIdFrom408;

    if (returnAsync) {
      out.status = "submitted";
      return out;
    }

    const scriptTimeoutMs = ((payload.timeout_sec as number) ?? 60) * 1000;
    const jobStatus = await pollJobStatus(cfg, jobIdFrom408, scriptTimeoutMs + 30_000);

    if (jobStatus.status === "poll_timeout" || jobStatus.status === "poll_error" || jobStatus.status === "failed") {
      out.ok = false;
      out.status = jobStatus.status;
      out.error = jobStatus.error || `Job ${jobStatus.status}`;
      return out;
    }

    const artifacts = await fetchArtifactsAndBuild(cfg, jobIdFrom408, merged.include);
    Object.assign(out, artifacts);
    out.job_id = jobIdFrom408;
    out.status = jobStatus.status;
    out.duration_ms = jobStatus.duration_ms;

    if (jobStatus.status !== "completed") {
      out.ok = false;
      if (jobStatus.timeout) (out as any).timeout = jobStatus.timeout;
      if (jobStatus.error) out.error = jobStatus.error;
    }

    await applySafetySpec(out, { workspace: cfg.workspace, harInline });
    return out;
  }

  if (status >= 400) {
    try {
      const txt = Buffer.from(body).toString("utf8");
      out.ok = false;
      out.error = JSON.parse(txt);
      return out;
    } catch {
      out.ok = false;
      out.error = `HTTP ${status}`;
      return out;
    }
  }

  if (contentType && contentType.includes("image/png")) {
    out.rawPngBase64 = abToBase64(body);
    out.job_id = headers.get("x-job-id") ?? undefined;
    const duration = headers.get("x-duration-ms");
    out.duration_ms = duration ? Number(duration) : undefined;
    out.sync = true;
    await applySafetySpec(out, { workspace: cfg.workspace, harInline });
    return out;
  }

  const txt = Buffer.from(body).toString("utf8");
  const json = JSON.parse(txt);
  Object.assign(out, json);
  out.job_id = (json.job_id ?? json.jobId ?? out.job_id) as any;

  if (status === 202 && out.job_id && json.status_url) {
    if (returnAsync) {
      out.status = "submitted";
      return out;
    }

    const scriptTimeoutMs = ((payload.timeout_sec as number) ?? 60) * 1000;
    const jobStatus = await pollJobStatus(cfg, out.job_id, scriptTimeoutMs + 30_000);

    if (jobStatus.status === "poll_timeout" || jobStatus.status === "poll_error" || jobStatus.status === "failed") {
      out.ok = false;
      out.status = jobStatus.status;
      out.error = jobStatus.error || `Job ${jobStatus.status}`;
      return out;
    }

    const artifacts = await fetchArtifactsAndBuild(cfg, out.job_id, merged.include);
    Object.assign(out, artifacts);
    out.status = jobStatus.status;
    out.duration_ms = jobStatus.duration_ms;

    if (jobStatus.status !== "completed") {
      out.ok = false;
      if (jobStatus.timeout) (out as any).timeout = jobStatus.timeout;
      if (jobStatus.error) out.error = jobStatus.error;
    }

    await applySafetySpec(out, { workspace: cfg.workspace, harInline });
    return out;
  }

  if (json.status === "completed_timeout" || json.status === "completed_error") {
    out.ok = false;
  }

  await applySafetySpec(out, { workspace: cfg.workspace, harInline });
  return out;
}

export async function riddleApiFetch(config: RiddleCoreConfig, method: string, path: string, body?: any): Promise<any> {
  const { apiKey, baseUrl } = requireConfig(config);
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || data.error || `HTTP ${res.status}`);
  return data;
}

async function assertDirectory(dir: string): Promise<PreviewResult | null> {
  if (!dir || typeof dir !== "string") throw new Error("directory must be an absolute path");
  try {
    const st = await stat(dir);
    if (!st.isDirectory()) throw new Error(`Not a directory: ${dir}`);
  } catch (e: any) {
    return { ok: false, error: `Cannot access directory: ${e.message}` };
  }
  return null;
}

async function tarDirectory(dir: string, tarball: string, excludes: string[], timeout: number): Promise<Buffer> {
  const excludeArgs = excludes.flatMap((p: string) => ["--exclude", p]);
  await execFile("tar", ["czf", tarball, ...excludeArgs, "-C", dir, "."], { timeout });
  return readFile(tarball);
}

async function saveImageOutputs(workspace: string, jobId: string, outputs: any[], label: string): Promise<void> {
  for (const output of outputs) {
    if (output.name && /\.(png|jpg|jpeg)$/i.test(output.name) && output.url) {
      try {
        const imgRes = await fetchWithTimeout(output.url, {}, PREVIEW_ARTIFACT_TIMEOUT_MS, `${label} artifact download`);
        if (imgRes.ok) {
          const buf = await imgRes.arrayBuffer();
          const base64 = Buffer.from(buf).toString("base64");
          const ref = await writeArtifactBinary(workspace, "screenshots", `${jobId}-${output.name}`, base64);
          output.saved = ref.path;
          output.sizeBytes = ref.sizeBytes;
        }
      } catch {
        // Screenshot artifacts are useful but not required for the job result.
      }
    }
  }
}

async function previewResultFromStatusData(
  config: ReturnType<typeof requireConfig>,
  pathPrefix: string,
  jobId: string,
  statusData: any,
  resultExtras: (statusData: any) => Record<string, any> = () => ({}),
): Promise<PreviewResult> {
  const status = statusData?.status ?? "unknown";
  const terminal = isTerminalPreviewStatus(status);
  const completed = isCompletedPreviewStatus(status);
  const label = pathPrefix.slice(1);
  const result: PreviewResult = {
    ok: terminal ? completed : true,
    terminal,
    job_id: jobId,
    status,
    phase: statusData?.phase ?? status,
    phase_updated_at: statusData?.phase_updated_at,
    phase_details: statusData?.phase_details,
    outputs: statusData?.outputs || [],
    compute_seconds: statusData?.compute_seconds,
    egress_bytes: statusData?.egress_bytes,
    ...resultExtras(statusData ?? {}),
  };

  if (!terminal) {
    result.message = `Job is still ${status}. Call the status tool again later to recover artifacts when it completes.`;
  }
  if (statusData?.error) result.error = statusData.error;
  if (statusData?.script_error) result.script_error = statusData.script_error;
  if (terminal && !completed && !result.error && !result.script_error) {
    result.error = `Job ended with status ${status}`;
  }

  await saveImageOutputs(config.workspace, jobId, result.outputs, label);
  result.screenshots = result.outputs.filter((o: any) => /\.(png|jpg|jpeg)$/i.test(o.name));
  return result;
}

async function getPreviewJobStatus(
  config: RiddleCoreConfig,
  pathPrefix: string,
  jobId: string,
  resultExtras: (statusData: any) => Record<string, any> = () => ({}),
): Promise<PreviewResult> {
  let cfg: ReturnType<typeof requireConfig>;
  try {
    cfg = requireConfig(config);
  } catch (err: any) {
    return { ok: false, error: err.message };
  }

  if (!jobId || typeof jobId !== "string") {
    return { ok: false, error: "job_id must be a non-empty string" };
  }

  const endpoint = cfg.baseUrl.replace(/\/$/, "");
  let statusRes: Response;
  try {
    statusRes = await fetchWithRetry(`${endpoint}${pathPrefix}/${jobId}`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    }, PREVIEW_REQUEST_TIMEOUT_MS, `${pathPrefix.slice(1)} status`, { attempts: 2 });
  } catch (e: any) {
    return { ok: false, job_id: jobId, error: `Status failed: ${describeError(e)}` };
  }
  if (!statusRes.ok) {
    const err = await statusRes.text().catch(() => "");
    return { ok: false, job_id: jobId, error: `Status failed: HTTP ${statusRes.status}${err ? ` ${err}` : ""}` };
  }

  const statusData = await statusRes.json() as any;
  return previewResultFromStatusData(cfg, pathPrefix, jobId, statusData, resultExtras);
}

async function pollPreviewJob(
  config: ReturnType<typeof requireConfig>,
  pathPrefix: string,
  jobId: string,
  timeoutMs: number,
  resultExtras: (statusData: any) => Record<string, any>,
): Promise<PreviewResult> {
  const endpoint = config.baseUrl.replace(/\/$/, "");
  const pollStart = Date.now();
  const pollIntervalMs = 3000;
  let lastStatusData: any = null;

  while (Date.now() - pollStart < timeoutMs) {
    let statusRes: Response;
    try {
      statusRes = await fetchWithRetry(`${endpoint}${pathPrefix}/${jobId}`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      }, PREVIEW_REQUEST_TIMEOUT_MS, `${pathPrefix.slice(1)} poll`, { attempts: 2 });
    } catch (e: any) {
      return { ok: false, job_id: jobId, error: `Poll failed: ${describeError(e)}` };
    }
    if (!statusRes.ok) {
      return { ok: false, job_id: jobId, error: `Poll failed: HTTP ${statusRes.status}` };
    }
    const statusData = await statusRes.json() as any;
    lastStatusData = statusData;

    if (isTerminalPreviewStatus(statusData.status)) {
      return previewResultFromStatusData(config, pathPrefix, jobId, statusData, resultExtras);
    }

    await sleep(pollIntervalMs);
  }

  return previewTimeoutResult(jobId, timeoutMs, lastStatusData, resultExtras);
}

export async function createStaticPreview(
  config: RiddleCoreConfig,
  params: { directory: string; framework?: string }
): Promise<PreviewResult> {
  let cfg: ReturnType<typeof requireConfig>;
  try {
    cfg = requireConfig(config);
  } catch (err: any) {
    return { ok: false, error: err.message };
  }

  const dirError = await assertDirectory(params.directory);
  if (dirError) return dirError;

  const endpoint = cfg.baseUrl.replace(/\/$/, "");
  let createRes: Response;
  try {
    createRes = await fetchWithRetry(`${endpoint}/v1/preview`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ framework: params.framework || "spa" }),
    }, PREVIEW_REQUEST_TIMEOUT_MS, "preview create");
  } catch (e: any) {
    return { ok: false, error: `Create failed: ${describeError(e)}` };
  }
  if (!createRes.ok) {
    const err = await createRes.text();
    return { ok: false, error: `Create failed: HTTP ${createRes.status} ${err}` };
  }
  const created = await createRes.json() as any;

  const tarball = `/tmp/riddle-preview-${created.id}.tar.gz`;
  try {
    const tarData = await tarDirectory(params.directory, tarball, [], 60_000);
    let uploadRes: Response;
    try {
      uploadRes = await fetchWithRetry(created.upload_url, {
        method: "PUT",
        headers: { "Content-Type": "application/gzip" },
        body: tarData as any,
      }, PREVIEW_UPLOAD_TIMEOUT_MS, "preview upload");
    } catch (e: any) {
      return { ok: false, id: created.id, error: `Upload failed: ${describeError(e)}` };
    }
    if (!uploadRes.ok) {
      return { ok: false, id: created.id, error: `Upload failed: HTTP ${uploadRes.status}` };
    }
  } finally {
    try { await rm(tarball, { force: true }); } catch { /* ignore */ }
  }

  let publishRes: Response;
  try {
    publishRes = await fetchWithTimeout(`${endpoint}/v1/preview/${created.id}/publish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    }, PREVIEW_REQUEST_TIMEOUT_MS, "preview publish");
  } catch (e: any) {
    return { ok: false, id: created.id, error: `Publish failed: ${describeError(e)}` };
  }
  if (!publishRes.ok) {
    const err = await publishRes.text();
    return { ok: false, id: created.id, error: `Publish failed: HTTP ${publishRes.status} ${err}` };
  }
  const published = await publishRes.json() as any;

  return {
    ok: true,
    id: published.id,
    preview_url: published.preview_url,
    file_count: published.file_count,
    total_bytes: published.total_bytes,
    expires_at: created.expires_at,
  };
}

export async function deleteStaticPreview(
  config: RiddleCoreConfig,
  id: string
): Promise<PreviewResult> {
  let cfg: ReturnType<typeof requireConfig>;
  try {
    cfg = requireConfig(config);
  } catch (err: any) {
    return { ok: false, error: err.message };
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(`${cfg.baseUrl.replace(/\/$/, "")}/v1/preview/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    }, PREVIEW_REQUEST_TIMEOUT_MS, "preview delete");
  } catch (e: any) {
    return { ok: false, error: `Delete failed: ${describeError(e)}` };
  }
  if (!res.ok) {
    const err = await res.text();
    return { ok: false, error: `Delete failed: HTTP ${res.status} ${err}` };
  }
  const data = await res.json() as any;
  return { ok: true, deleted: true, files_removed: data.files_removed };
}

async function storePreviewEnv(
  cfg: ReturnType<typeof requireConfig>,
  endpointPath: string,
  params: { sensitive_env?: Record<string, string>; localStorage?: Record<string, string> },
): Promise<{ envRef: string | null; error?: PreviewResult }> {
  const hasSensitiveEnv = params.sensitive_env && Object.keys(params.sensitive_env).length > 0;
  const hasLocalStorage = params.localStorage && Object.keys(params.localStorage).length > 0;
  if (!hasSensitiveEnv && !hasLocalStorage) return { envRef: null };

  const envBody: any = {};
  if (hasSensitiveEnv) envBody.env = params.sensitive_env;
  if (hasLocalStorage) envBody.localStorage = params.localStorage;

  let envRes: Response;
  try {
    envRes = await fetchWithTimeout(`${cfg.baseUrl.replace(/\/$/, "")}${endpointPath}/env`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(envBody),
    }, PREVIEW_REQUEST_TIMEOUT_MS, `${endpointPath.slice(1)} env store`);
  } catch (e: any) {
    return { envRef: null, error: { ok: false, error: `Store env failed: ${describeError(e)}` } };
  }
  if (!envRes.ok) {
    const err = await envRes.text();
    return { envRef: null, error: { ok: false, error: `Store env failed: HTTP ${envRes.status} ${err}` } };
  }
  const envData = await envRes.json() as any;
  return { envRef: envData.env_ref };
}

export async function createServerPreview(
  config: RiddleCoreConfig,
  params: Record<string, any>
): Promise<PreviewResult> {
  let cfg: ReturnType<typeof requireConfig>;
  try {
    cfg = requireConfig(config);
  } catch (err: any) {
    return { ok: false, error: err.message };
  }

  const dirError = await assertDirectory(params.directory);
  if (dirError) return dirError;

  const endpoint = cfg.baseUrl.replace(/\/$/, "");
  const env = await storePreviewEnv(cfg, "/v1/server-preview", params);
  if (env.error) return env.error;

  const createBody: any = {
    image: params.image,
    command: params.command,
    port: params.port,
  };
  for (const key of [
    "path",
    "env",
    "timeout",
    "readiness_path",
    "readiness_timeout",
    "script",
    "steps",
    "wait_until",
    "wait_for_selector",
    "navigation_timeout",
    "color_scheme",
    "viewport",
  ]) {
    if (params[key]) createBody[key] = params[key];
  }
  if (env.envRef) createBody.env_ref = env.envRef;

  let createRes: Response;
  try {
    createRes = await fetchWithRetry(`${endpoint}/v1/server-preview`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(createBody),
    }, PREVIEW_REQUEST_TIMEOUT_MS, "server preview create");
  } catch (e: any) {
    return { ok: false, error: `Create failed: ${describeError(e)}` };
  }
  if (!createRes.ok) {
    const err = await createRes.text();
    return { ok: false, error: `Create failed: HTTP ${createRes.status} ${err}` };
  }
  const created = await createRes.json() as any;

  const tarball = `/tmp/riddle-sp-${created.job_id}.tar.gz`;
  try {
    const tarData = await tarDirectory(params.directory, tarball, params.exclude || [".git", "*.log"], 120_000);
    let uploadRes: Response;
    try {
      uploadRes = await fetchWithRetry(created.upload_url, {
        method: "PUT",
        headers: { "Content-Type": "application/gzip" },
        body: tarData as any,
      }, PREVIEW_UPLOAD_TIMEOUT_MS, "server preview upload");
    } catch (e: any) {
      return { ok: false, job_id: created.job_id, error: `Upload failed: ${describeError(e)}` };
    }
    if (!uploadRes.ok) {
      return { ok: false, job_id: created.job_id, error: `Upload failed: HTTP ${uploadRes.status}` };
    }
  } finally {
    try { await rm(tarball, { force: true }); } catch { /* ignore */ }
  }

  let startRes: Response;
  try {
    startRes = await fetchWithRetry(`${endpoint}/v1/server-preview/${created.job_id}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    }, PREVIEW_REQUEST_TIMEOUT_MS, "server preview start");
  } catch (e: any) {
    return { ok: false, job_id: created.job_id, error: `Start failed: ${describeError(e)}` };
  }
  if (!startRes.ok) {
    const err = await startRes.text();
    if (isAlreadyStartedResponse(startRes.status, err)) {
      console.warn(`[openclaw-riddledc] server preview start returned ${startRes.status} for ${created.job_id}; continuing to poll`);
    } else {
      return { ok: false, job_id: created.job_id, error: `Start failed: HTTP ${startRes.status} ${err}` };
    }
  }

  return pollPreviewJob(cfg, "/v1/server-preview", created.job_id, ((params.timeout || 120) + 60) * 1000, () => ({}));
}

export async function getServerPreviewStatus(
  config: RiddleCoreConfig,
  jobId: string,
): Promise<PreviewResult> {
  return getPreviewJobStatus(config, "/v1/server-preview", jobId, () => ({}));
}

export async function createBuildPreview(
  config: RiddleCoreConfig,
  params: Record<string, any>
): Promise<PreviewResult> {
  let cfg: ReturnType<typeof requireConfig>;
  try {
    cfg = requireConfig(config);
  } catch (err: any) {
    return { ok: false, error: err.message };
  }

  const dirError = await assertDirectory(params.directory);
  if (dirError) return dirError;

  try {
    await stat(`${params.directory}/Dockerfile`);
  } catch {
    return { ok: false, error: `No Dockerfile found at ${params.directory}/Dockerfile. riddle_build_preview requires a Dockerfile at the root of the directory.` };
  }

  const endpoint = cfg.baseUrl.replace(/\/$/, "");
  const env = await storePreviewEnv(cfg, "/v1/build-preview", params);
  if (env.error) return env.error;

  const createBody: any = {
    command: params.command,
    port: params.port,
  };
  for (const key of [
    "path",
    "env",
    "build_args",
    "keep_image_minutes",
    "timeout",
    "readiness_path",
    "readiness_timeout",
    "script",
    "steps",
    "wait_until",
    "wait_for_selector",
    "navigation_timeout",
    "color_scheme",
    "viewport",
    "audit",
  ]) {
    if (params[key] !== undefined) createBody[key] = params[key];
  }
  if (env.envRef) createBody.env_ref = env.envRef;

  let createRes: Response;
  try {
    createRes = await fetchWithRetry(`${endpoint}/v1/build-preview`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(createBody),
    }, PREVIEW_REQUEST_TIMEOUT_MS, "build preview create");
  } catch (e: any) {
    return { ok: false, error: `Create failed: ${describeError(e)}` };
  }
  if (!createRes.ok) {
    const err = await createRes.text();
    return { ok: false, error: `Create failed: HTTP ${createRes.status} ${err}` };
  }
  const created = await createRes.json() as any;

  const tarball = `/tmp/riddle-bp-${created.job_id}.tar.gz`;
  try {
    const tarData = await tarDirectory(params.directory, tarball, params.exclude || [".git", "*.log"], 120_000);
    let uploadRes: Response;
    try {
      uploadRes = await fetchWithRetry(created.upload_url, {
        method: "PUT",
        headers: { "Content-Type": "application/gzip" },
        body: tarData as any,
      }, PREVIEW_UPLOAD_TIMEOUT_MS, "build preview upload");
    } catch (e: any) {
      return { ok: false, job_id: created.job_id, error: `Upload failed: ${describeError(e)}` };
    }
    if (!uploadRes.ok) {
      return { ok: false, job_id: created.job_id, error: `Upload failed: HTTP ${uploadRes.status}` };
    }
  } finally {
    try { await rm(tarball, { force: true }); } catch { /* ignore */ }
  }

  let startRes: Response;
  try {
    startRes = await fetchWithRetry(`${endpoint}/v1/build-preview/${created.job_id}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    }, PREVIEW_REQUEST_TIMEOUT_MS, "build preview start");
  } catch (e: any) {
    return { ok: false, job_id: created.job_id, error: `Start failed: ${describeError(e)}` };
  }
  if (!startRes.ok) {
    const err = await startRes.text();
    if (isAlreadyStartedResponse(startRes.status, err)) {
      console.warn(`[openclaw-riddledc] build preview start returned ${startRes.status} for ${created.job_id}; continuing to poll`);
    } else {
      return { ok: false, job_id: created.job_id, error: `Start failed: HTTP ${startRes.status} ${err}` };
    }
  }

  return pollPreviewJob(cfg, "/v1/build-preview", created.job_id, ((params.timeout || 180) + 120) * 1000, (statusData) => ({
    build_duration_ms: statusData.build_duration_ms,
    ...(statusData.build_log ? { build_log: statusData.build_log } : {}),
    ...(statusData.container_log ? { container_log: statusData.container_log } : {}),
    ...(statusData.audit ? { audit: statusData.audit } : {}),
  }));
}

export async function getBuildPreviewStatus(
  config: RiddleCoreConfig,
  jobId: string,
): Promise<PreviewResult> {
  return getPreviewJobStatus(config, "/v1/build-preview", jobId, (statusData) => ({
    build_duration_ms: statusData.build_duration_ms,
    ...(statusData.build_log ? { build_log: statusData.build_log } : {}),
    ...(statusData.container_log ? { container_log: statusData.container_log } : {}),
    ...(statusData.audit ? { audit: statusData.audit } : {}),
  }));
}
