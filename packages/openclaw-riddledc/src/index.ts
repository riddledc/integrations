import { Type } from "@sinclair/typebox";
import { writeFile, mkdir, readFile, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

type PluginApi = any;

type RiddlePayload = Record<string, any>;

type RunResult = {
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

const INLINE_CAP = 50 * 1024; // 50 KB

function getCfg(api: PluginApi) {
  const cfg = api?.config ?? {};
  const pluginCfg = cfg?.plugins?.entries?.["openclaw-riddledc"]?.config ?? {};
  return {
    apiKey: process.env.RIDDLE_API_KEY || pluginCfg.apiKey,
    baseUrl: pluginCfg.baseUrl || "https://api.riddledc.com"
  };
}

function assertAllowedBaseUrl(baseUrl: string) {
  // Hard safety guardrail: never send keys off-domain.
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
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const body = await res.arrayBuffer();
  return {
    contentType: res.headers.get("content-type"),
    body,
    headers: res.headers,
    status: res.status
  };
}

function abToBase64(ab: ArrayBuffer): string {
  return Buffer.from(ab).toString("base64");
}

function getWorkspacePath(api: PluginApi): string {
  return api?.workspacePath ?? process.cwd();
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

async function writeArtifactBinary(
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

async function applySafetySpec(
  result: RunResult,
  opts: { workspace: string; harInline?: boolean }
): Promise<void> {
  const jobId = result.job_id ?? "unknown";

  // Screenshot: always write to file (never inline base64 - too large for context)
  // Handle both string format and object format { name, data, size }
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

  // screenshots array: save each to file (API returns both screenshot and screenshots)
  if (Array.isArray((result as any).screenshots)) {
    const savedRefs: Array<{ saved: string; sizeBytes: number; url?: string }> = [];
    for (let i = 0; i < (result as any).screenshots.length; i++) {
      const ss = (result as any).screenshots[i];
      let base64Data: string | null = null;
      const cdnUrl = typeof ss === "object" ? ss.url : undefined;
      if (typeof ss === "string") {
        base64Data = ss;
      } else if (typeof ss === "object" && ss.data) {
        // Handle data:image/png;base64, prefix
        base64Data = ss.data.replace(/^data:image\/\w+;base64,/, "");
      }
      if (base64Data) {
        const ref = await writeArtifactBinary(opts.workspace, "screenshots", `${jobId}-${i}.png`, base64Data);
        savedRefs.push({ saved: ref.path, sizeBytes: ref.sizeBytes, ...(cdnUrl ? { url: cdnUrl } : {}) });
      }
    }
    (result as any).screenshots = savedRefs;
  }

  // rawPngBase64: same treatment - save to file
  if (result.rawPngBase64 != null) {
    const ref = await writeArtifactBinary(opts.workspace, "screenshots", `${jobId}.png`, result.rawPngBase64);
    result.screenshot = { saved: ref.path, sizeBytes: ref.sizeBytes };
    delete result.rawPngBase64;
  }

  // HAR: always write to file unless harInline=true AND under cap
  if (result.har != null) {
    const harStr = typeof result.har === "string" ? result.har : JSON.stringify(result.har);
    const harBytes = Buffer.byteLength(harStr, "utf8");

    if (opts.harInline && harBytes <= INLINE_CAP) {
      // Caller explicitly requested inline and it fits — keep as-is
    } else {
      const ref = await writeArtifact(opts.workspace, "har", `${jobId}.har.json`, harStr);
      if (opts.harInline && harBytes > INLINE_CAP) {
        result.har = { saved: ref.path, sizeBytes: ref.sizeBytes, warning: "Exceeded 50KB inline cap; wrote to file" };
      } else {
        result.har = { saved: ref.path, sizeBytes: ref.sizeBytes };
      }
    }
  }

  // Console: inline by default, file fallback at 50 KB
  if (result.console != null) {
    const consoleStr = typeof result.console === "string" ? result.console : JSON.stringify(result.console);
    const consoleBytes = Buffer.byteLength(consoleStr, "utf8");

    if (consoleBytes > INLINE_CAP) {
      const ref = await writeArtifact(opts.workspace, "console", `${jobId}.log`, consoleStr);
      result.console = { saved: ref.path, sizeBytes: ref.sizeBytes };
    }
  }
}

async function pollJobStatus(
  baseUrl: string,
  apiKey: string,
  jobId: string,
  maxWaitMs: number
): Promise<any> {
  const start = Date.now();
  const POLL_INTERVAL = 2000;

  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!res.ok) {
      return { status: "poll_error", error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    // Terminal statuses
    if (
      data.status === "completed" ||
      data.status === "completed_timeout" ||
      data.status === "completed_error" ||
      data.status === "failed"
    ) {
      return data;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }
  return { status: "poll_timeout", error: `Job ${jobId} did not complete within ${maxWaitMs}ms` };
}

async function fetchArtifactsAndBuild(
  baseUrl: string,
  apiKey: string,
  jobId: string,
  include: string[]
): Promise<Record<string, any>> {
  // Fetch artifacts list (standard format — returns CDN URLs)
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

  // Propagate timeout/error from artifacts endpoint
  if (data.status) result._artifactsStatus = data.status;
  if (data.timeout) result._timeout = data.timeout;
  if (data.error) result._error = data.error;

  // Download screenshots from CDN and convert to base64
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
            url: ss.url
          });
        }
      } catch {
        // Skip failed screenshot downloads
      }
    }
    if (result.screenshots.length > 0) {
      result.screenshot = result.screenshots[0];
    }
  }

  // Download console.json from CDN
  const consoleArtifact = artifacts.find((a) => a.name === "console.json");
  if (consoleArtifact?.url) {
    try {
      const cRes = await fetch(consoleArtifact.url);
      if (cRes.ok) {
        result.console = await cRes.json();
      }
    } catch {
      // Skip
    }
  }

  // Download result.json if present
  const resultArtifact = artifacts.find((a) => a.name === "result.json");
  if (resultArtifact?.url) {
    try {
      const rRes = await fetch(resultArtifact.url);
      if (rRes.ok) {
        result.result = await rRes.json();
      }
    } catch {
      // Skip
    }
  }

  // Download HAR if present (only if requested)
  if (include.includes("har")) {
    const harArtifact = artifacts.find((a) => a.name === "network.har");
    if (harArtifact?.url) {
      try {
        const hRes = await fetch(harArtifact.url);
        if (hRes.ok) {
          result.har = await hRes.json();
        }
      } catch {
        // Skip
      }
    }
  }

  return result;
}

async function runWithDefaults(
  api: PluginApi,
  payload: RiddlePayload,
  defaults?: { include?: string[]; returnAsync?: boolean }
): Promise<RunResult> {
  const { apiKey, baseUrl } = getCfg(api);
  if (!apiKey) {
    return {
      ok: false,
      error: "Missing Riddle API key. Set RIDDLE_API_KEY env var or plugins.entries.riddle.config.apiKey."
    };
  }
  assertAllowedBaseUrl(baseUrl);

  const mode = detectMode(payload);

  // Detect user intent before merging
  const userInclude: string[] = payload.include ?? [];
  const userRequestedHar = userInclude.includes("har");
  const harInline = !!payload.harInline;

  const returnAsync = !!defaults?.returnAsync;

  const merged: any = { ...payload };
  delete merged.harInline; // Plugin-only flag; don't forward to API

  // Force async API response when caller wants fire-and-forget
  if (returnAsync) {
    merged.sync = false;
  }

  // Merge includes: user's explicit + tool defaults (defaults never contain "har")
  const defaultInc = defaults?.include ?? ["screenshot", "console"];
  merged.include = Array.from(new Set([...userInclude, ...defaultInc]));

  // Inline flags — fetch data inline from API so we can apply caps locally
  merged.inlineConsole = merged.inlineConsole ?? true;
  merged.inlineResult = merged.inlineResult ?? true;
  if (userRequestedHar) {
    merged.inlineHar = true;
  }

  const out: RunResult = { ok: true, mode };

  const { contentType, body, headers, status } = await postRun(baseUrl, apiKey, merged);
  out.rawContentType = contentType ?? undefined;

  const workspace = getWorkspacePath(api);

  // HTTP 408 = sync poll timed out, job still running — poll async
  if (status === 408) {
    let jobIdFrom408: string | undefined;
    try {
      const json408 = JSON.parse(Buffer.from(body).toString("utf8"));
      jobIdFrom408 = json408.job_id;
    } catch {
      // fall through
    }
    if (!jobIdFrom408) {
      out.ok = false;
      out.error = "Sync poll timed out but no job_id in 408 response";
      return out;
    }
    out.job_id = jobIdFrom408;

    // Async mode: return job_id immediately without polling
    if (returnAsync) {
      out.status = "submitted";
      return out;
    }

    // Poll with timeout = script timeout + 30s buffer (generous)
    const scriptTimeoutMs = ((payload.timeout_sec as number) ?? 60) * 1000;
    const pollMaxMs = scriptTimeoutMs + 30000;
    const jobStatus = await pollJobStatus(baseUrl, apiKey, jobIdFrom408, pollMaxMs);

    if (jobStatus.status === "poll_timeout" || jobStatus.status === "poll_error" || jobStatus.status === "failed") {
      out.ok = false;
      out.status = jobStatus.status;
      out.error = jobStatus.error || `Job ${jobStatus.status}`;
      return out;
    }

    // Job reached terminal status — fetch artifacts from CDN
    const artifacts = await fetchArtifactsAndBuild(baseUrl, apiKey, jobIdFrom408, merged.include);
    Object.assign(out, artifacts);
    out.job_id = jobIdFrom408;
    out.status = jobStatus.status;
    out.duration_ms = jobStatus.duration_ms;

    // completed_timeout / completed_error — still try to save any partial outputs
    if (jobStatus.status !== "completed") {
      out.ok = false;
      if (jobStatus.timeout) (out as any).timeout = jobStatus.timeout;
      if (jobStatus.error) out.error = jobStatus.error;
    }

    await applySafetySpec(out, { workspace, harInline });
    return out;
  }

  // Other 4xx/5xx errors
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

  // Raw PNG response (simple screenshot)
  if (contentType && contentType.includes("image/png")) {
    out.rawPngBase64 = abToBase64(body);
    out.job_id = headers.get("x-job-id") ?? undefined;
    const duration = headers.get("x-duration-ms");
    out.duration_ms = duration ? Number(duration) : undefined;
    out.sync = true;
    await applySafetySpec(out, { workspace, harInline });
    return out;
  }

  const txt = Buffer.from(body).toString("utf8");
  const json = JSON.parse(txt);
  Object.assign(out, json);
  out.job_id = (json.job_id ?? json.jobId ?? out.job_id) as any;

  // Handle async response (HTTP 202 — job accepted, not yet complete)
  if (status === 202 && out.job_id && json.status_url) {
    // Async mode: return job_id immediately without polling
    if (returnAsync) {
      out.status = "submitted";
      return out;
    }

    const scriptTimeoutMs = ((payload.timeout_sec as number) ?? 60) * 1000;
    const pollMaxMs = scriptTimeoutMs + 30000;
    const jobStatus = await pollJobStatus(baseUrl, apiKey, out.job_id, pollMaxMs);

    if (jobStatus.status === "poll_timeout" || jobStatus.status === "poll_error" || jobStatus.status === "failed") {
      out.ok = false;
      out.status = jobStatus.status;
      out.error = jobStatus.error || `Job ${jobStatus.status}`;
      return out;
    }

    // Fetch artifacts
    const artifacts = await fetchArtifactsAndBuild(baseUrl, apiKey, out.job_id, merged.include);
    Object.assign(out, artifacts);
    out.status = jobStatus.status;
    out.duration_ms = jobStatus.duration_ms;

    if (jobStatus.status !== "completed") {
      out.ok = false;
      if (jobStatus.timeout) (out as any).timeout = jobStatus.timeout;
      if (jobStatus.error) out.error = jobStatus.error;
    }

    await applySafetySpec(out, { workspace, harInline });
    return out;
  }

  // Handle completed_timeout / completed_error from sync poll (lease service now returns these)
  if (json.status === "completed_timeout" || json.status === "completed_error") {
    out.ok = false;
    // Still process any partial outputs (screenshots, console) that came through
  }

  await applySafetySpec(out, { workspace, harInline });

  return out;
}

export default function register(api: PluginApi) {
  api.registerTool(
    {
      name: "riddle_run",
      description:
        "Run a Riddle job (pass-through payload) against https://api.riddledc.com/v1/run. Supports url/urls/steps/script. Returns screenshot + console by default; pass include:[\"har\"] to opt in to HAR capture. Set async:true to return immediately with job_id (use riddle_poll to check status later).",
      parameters: Type.Object({
        payload: Type.Record(Type.String(), Type.Any()),
        async: Type.Optional(Type.Boolean({ description: "Return job_id immediately without waiting for completion. Use riddle_poll to check status." }))
      }),
      async execute(_id: string, params: any) {
        const result = await runWithDefaults(api, params.payload, {
          include: ["screenshot", "console", "result"],
          returnAsync: !!params.async
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "riddle_poll",
      description: "Poll the status of an async Riddle job. Use after submitting a job with async:true. Returns current status if still running, or full results (screenshot, console, etc.) if completed.",
      parameters: Type.Object({
        job_id: Type.String({ description: "Job ID returned by an async riddle_* call" }),
        include: Type.Optional(Type.Array(Type.String(), { description: "Artifacts to fetch on completion (default: screenshot, console, result)" })),
        harInline: Type.Optional(Type.Boolean())
      }),
      async execute(_id: string, params: any) {
        if (!params.job_id || typeof params.job_id !== "string") throw new Error("job_id must be a string");
        const { apiKey, baseUrl } = getCfg(api);
        if (!apiKey) {
          return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: "Missing Riddle API key." }, null, 2) }] };
        }
        assertAllowedBaseUrl(baseUrl);

        // Check job status (single poll, no loop)
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/jobs/${params.job_id}`, {
          headers: { Authorization: `Bearer ${apiKey}` }
        });
        if (!res.ok) {
          return { content: [{ type: "text", text: JSON.stringify({ ok: false, job_id: params.job_id, error: `HTTP ${res.status}` }, null, 2) }] };
        }
        const data = await res.json();

        // Still running — return status only
        if (data.status !== "completed" && data.status !== "completed_timeout" && data.status !== "completed_error" && data.status !== "failed") {
          return { content: [{ type: "text", text: JSON.stringify({ ok: true, job_id: params.job_id, status: data.status, message: "Job still running. Call riddle_poll again later." }, null, 2) }] };
        }

        // Terminal — fetch artifacts
        const include = params.include ?? ["screenshot", "console", "result"];
        const artifacts = await fetchArtifactsAndBuild(baseUrl, apiKey, params.job_id, include);
        const out: RunResult = { ok: data.status === "completed", job_id: params.job_id, status: data.status, duration_ms: data.duration_ms, ...artifacts };

        if (data.status !== "completed") {
          if (data.timeout) (out as any).timeout = data.timeout;
          if (data.error) out.error = data.error;
        }

        const workspace = getWorkspacePath(api);
        await applySafetySpec(out, { workspace, harInline: !!params.harInline });
        return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
      }
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "riddle_screenshot",
      description: "Riddle: take a screenshot of a single URL. Supports authenticated screenshots via cookies/localStorage. Returns screenshot + console by default; pass include:[\"har\"] to opt in to HAR capture.",
      parameters: Type.Object({
        url: Type.String(),
        timeout_sec: Type.Optional(Type.Number()),
        cookies: Type.Optional(Type.Array(Type.Object({
          name: Type.String(),
          value: Type.String(),
          domain: Type.String(),
          path: Type.Optional(Type.String()),
          secure: Type.Optional(Type.Boolean()),
          httpOnly: Type.Optional(Type.Boolean())
        }), { description: "Cookies to inject for authenticated sessions" })),
        localStorage: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "localStorage key-value pairs to inject (e.g., JWT tokens)" })),
        headers: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "HTTP headers to send with requests" })),
        options: Type.Optional(Type.Record(Type.String(), Type.Any())),
        include: Type.Optional(Type.Array(Type.String())),
        harInline: Type.Optional(Type.Boolean())
      }),
      async execute(_id: string, params: any) {
        if (!params.url || typeof params.url !== "string") throw new Error("url must be a string");
        const payload: any = { url: params.url };
        if (params.timeout_sec) payload.timeout_sec = params.timeout_sec;
        // Merge auth params into options
        const opts = { ...(params.options || {}) };
        if (params.cookies) opts.cookies = params.cookies;
        if (params.localStorage) opts.localStorage = params.localStorage;
        if (params.headers) opts.headers = params.headers;
        if (Object.keys(opts).length > 0) payload.options = opts;
        if (params.include) payload.include = params.include;
        if (params.harInline) payload.harInline = params.harInline;
        const result = await runWithDefaults(api, payload, { include: ["screenshot", "console"] });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "riddle_screenshots",
      description: "Riddle: take screenshots for multiple URLs in one job. Supports authenticated sessions via cookies/localStorage (shared across all URLs). Returns screenshots + console by default; pass include:[\"har\"] to opt in to HAR capture.",
      parameters: Type.Object({
        urls: Type.Array(Type.String()),
        timeout_sec: Type.Optional(Type.Number()),
        cookies: Type.Optional(Type.Array(Type.Object({
          name: Type.String(),
          value: Type.String(),
          domain: Type.String(),
          path: Type.Optional(Type.String()),
          secure: Type.Optional(Type.Boolean()),
          httpOnly: Type.Optional(Type.Boolean())
        }), { description: "Cookies to inject for authenticated sessions" })),
        localStorage: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "localStorage key-value pairs to inject (e.g., JWT tokens)" })),
        headers: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "HTTP headers to send with requests" })),
        options: Type.Optional(Type.Record(Type.String(), Type.Any())),
        include: Type.Optional(Type.Array(Type.String())),
        harInline: Type.Optional(Type.Boolean())
      }),
      async execute(_id: string, params: any) {
        if (!Array.isArray(params.urls) || params.urls.some((url: any) => typeof url !== "string")) {
          throw new Error("urls must be an array of strings");
        }
        const payload: any = { urls: params.urls };
        if (params.timeout_sec) payload.timeout_sec = params.timeout_sec;
        // Merge auth params into options
        const opts = { ...(params.options || {}) };
        if (params.cookies) opts.cookies = params.cookies;
        if (params.localStorage) opts.localStorage = params.localStorage;
        if (params.headers) opts.headers = params.headers;
        if (Object.keys(opts).length > 0) payload.options = opts;
        if (params.include) payload.include = params.include;
        if (params.harInline) payload.harInline = params.harInline;
        const result = await runWithDefaults(api, payload, { include: ["screenshot", "console"] });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "riddle_steps",
      description: "Riddle: run a workflow in steps mode (goto/click/fill/screenshot/scrape/map/crawl/etc.). Supports authenticated sessions via cookies/localStorage. Data extraction steps: { scrape: true }, { map: { max_pages?: N } }, { crawl: { max_pages?: N, format?: 'json'|'csv' } }. Returns screenshot + console by default; pass include:[\"har\",\"data\",\"urls\",\"dataset\",\"sitemap\"] for additional artifacts. Set async:true to return immediately with job_id (use riddle_poll to check status later).",
      parameters: Type.Object({
        steps: Type.Array(Type.Record(Type.String(), Type.Any())),
        timeout_sec: Type.Optional(Type.Number()),
        cookies: Type.Optional(Type.Array(Type.Object({
          name: Type.String(),
          value: Type.String(),
          domain: Type.String(),
          path: Type.Optional(Type.String()),
          secure: Type.Optional(Type.Boolean()),
          httpOnly: Type.Optional(Type.Boolean())
        }), { description: "Cookies to inject for authenticated sessions" })),
        localStorage: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "localStorage key-value pairs to inject (e.g., JWT tokens)" })),
        headers: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "HTTP headers to send with requests" })),
        options: Type.Optional(Type.Record(Type.String(), Type.Any())),
        include: Type.Optional(Type.Array(Type.String())),
        harInline: Type.Optional(Type.Boolean()),
        sync: Type.Optional(Type.Boolean()),
        async: Type.Optional(Type.Boolean({ description: "Return job_id immediately without waiting for completion. Use riddle_poll to check status." }))
      }),
      async execute(_id: string, params: any) {
        if (!Array.isArray(params.steps)) throw new Error("steps must be an array");
        const payload: any = { steps: params.steps };
        if (typeof params.sync === "boolean") payload.sync = params.sync;
        if (params.timeout_sec) payload.timeout_sec = params.timeout_sec;
        // Merge auth params into options
        const opts = { ...(params.options || {}) };
        if (params.cookies) opts.cookies = params.cookies;
        if (params.localStorage) opts.localStorage = params.localStorage;
        if (params.headers) opts.headers = params.headers;
        if (Object.keys(opts).length > 0) payload.options = opts;
        if (params.include) payload.include = params.include;
        if (params.harInline) payload.harInline = params.harInline;
        const result = await runWithDefaults(api, payload, { include: ["screenshot", "console", "result", "data", "urls", "dataset", "sitemap", "visual_diff"], returnAsync: !!params.async });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "riddle_script",
      description: "Riddle: run full Playwright code (script mode). Supports authenticated sessions via cookies/localStorage. In scripts, use `await injectLocalStorage()` after navigating to the origin to apply localStorage values. Available sandbox helpers: saveScreenshot(label), saveHtml(label), saveJson(name, data), scrape(opts?), map(opts?), crawl(opts?). Returns screenshot + console by default; pass include:[\"har\",\"data\",\"urls\",\"dataset\",\"sitemap\"] for additional artifacts. Set async:true to return immediately with job_id (use riddle_poll to check status later).",
      parameters: Type.Object({
        script: Type.String(),
        timeout_sec: Type.Optional(Type.Number()),
        cookies: Type.Optional(Type.Array(Type.Object({
          name: Type.String(),
          value: Type.String(),
          domain: Type.String(),
          path: Type.Optional(Type.String()),
          secure: Type.Optional(Type.Boolean()),
          httpOnly: Type.Optional(Type.Boolean())
        }), { description: "Cookies to inject for authenticated sessions" })),
        localStorage: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "localStorage key-value pairs; use injectLocalStorage() in script after goto to apply" })),
        headers: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "HTTP headers to send with requests" })),
        options: Type.Optional(Type.Record(Type.String(), Type.Any())),
        include: Type.Optional(Type.Array(Type.String())),
        harInline: Type.Optional(Type.Boolean()),
        sync: Type.Optional(Type.Boolean()),
        async: Type.Optional(Type.Boolean({ description: "Return job_id immediately without waiting for completion. Use riddle_poll to check status." }))
      }),
      async execute(_id: string, params: any) {
        if (!params.script || typeof params.script !== "string") throw new Error("script must be a string");
        const payload: any = { script: params.script };
        if (typeof params.sync === "boolean") payload.sync = params.sync;
        if (params.timeout_sec) payload.timeout_sec = params.timeout_sec;
        // Merge auth params into options
        const opts = { ...(params.options || {}) };
        if (params.cookies) opts.cookies = params.cookies;
        if (params.localStorage) opts.localStorage = params.localStorage;
        if (params.headers) opts.headers = params.headers;
        if (Object.keys(opts).length > 0) payload.options = opts;
        if (params.include) payload.include = params.include;
        if (params.harInline) payload.harInline = params.harInline;
        const result = await runWithDefaults(api, payload, { include: ["screenshot", "console", "result", "data", "urls", "dataset", "sitemap", "visual_diff"], returnAsync: !!params.async });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    },
    { optional: true }
  );

  // --- Data Extraction Convenience Tools ---

  api.registerTool(
    {
      name: "riddle_scrape",
      description: "Riddle: scrape a URL and extract structured content (title, description, markdown, links, headings, word count). Navigates to the URL first, then extracts. For authenticated scraping, use riddle_script with login steps followed by await scrape().",
      parameters: Type.Object({
        url: Type.String({ description: "URL to scrape" }),
        extract_metadata: Type.Optional(Type.Boolean({ description: "Extract metadata (default: true)" })),
        cookies: Type.Optional(Type.Array(Type.Object({
          name: Type.String(),
          value: Type.String(),
          domain: Type.String(),
          path: Type.Optional(Type.String()),
          secure: Type.Optional(Type.Boolean()),
          httpOnly: Type.Optional(Type.Boolean())
        }), { description: "Cookies to inject for authenticated sessions" })),
        options: Type.Optional(Type.Record(Type.String(), Type.Any()))
      }),
      async execute(_id: string, params: any) {
        const scrapeOpts = params.extract_metadata === false ? "{ extract_metadata: false }" : "";
        const payload: any = {
          url: params.url,
          script: `return await scrape(${scrapeOpts});`,
          options: { ...(params.options || {}), returnResult: true }
        };
        if (params.cookies) payload.options.cookies = params.cookies;
        const result = await runWithDefaults(api, payload, { include: ["result", "console"] });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "riddle_map",
      description: "Riddle: discover all URLs on a website by crawling from the given URL. Returns an array of discovered URLs. For authenticated mapping, use riddle_script with login steps followed by await map().",
      parameters: Type.Object({
        url: Type.String({ description: "Starting URL to map from" }),
        max_pages: Type.Optional(Type.Number({ description: "Max pages to crawl (default: 500, max: 5000)" })),
        include_patterns: Type.Optional(Type.Array(Type.String(), { description: "URL patterns to include (glob)" })),
        exclude_patterns: Type.Optional(Type.Array(Type.String(), { description: "URL patterns to exclude (glob)" })),
        respect_robots: Type.Optional(Type.Boolean({ description: "Respect robots.txt (default: true)" })),
        cookies: Type.Optional(Type.Array(Type.Object({
          name: Type.String(),
          value: Type.String(),
          domain: Type.String(),
          path: Type.Optional(Type.String()),
          secure: Type.Optional(Type.Boolean()),
          httpOnly: Type.Optional(Type.Boolean())
        }), { description: "Cookies to inject for authenticated sessions" })),
        options: Type.Optional(Type.Record(Type.String(), Type.Any()))
      }),
      async execute(_id: string, params: any) {
        const mapOpts: string[] = [];
        if (params.max_pages != null) mapOpts.push(`max_pages: ${params.max_pages}`);
        if (params.include_patterns) mapOpts.push(`include_patterns: ${JSON.stringify(params.include_patterns)}`);
        if (params.exclude_patterns) mapOpts.push(`exclude_patterns: ${JSON.stringify(params.exclude_patterns)}`);
        if (params.respect_robots === false) mapOpts.push("respect_robots: false");
        const optsStr = mapOpts.length > 0 ? `{ ${mapOpts.join(", ")} }` : "";
        const payload: any = {
          url: params.url,
          script: `return await map(${optsStr});`,
          options: { ...(params.options || {}), returnResult: true }
        };
        if (params.cookies) payload.options.cookies = params.cookies;
        const result = await runWithDefaults(api, payload, { include: ["result", "console"] });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "riddle_crawl",
      description: "Riddle: crawl a website and extract content from each page into a dataset. Returns dataset metadata; use include:[\"dataset\"] to get the full dataset file. For authenticated crawling, use riddle_script with login steps followed by await crawl().",
      parameters: Type.Object({
        url: Type.String({ description: "Starting URL to crawl from" }),
        max_pages: Type.Optional(Type.Number({ description: "Max pages to crawl (default: 100, max: 1000)" })),
        format: Type.Optional(Type.String({ description: "Output format: jsonl, json, csv, zip (default: jsonl)" })),
        js_rendering: Type.Optional(Type.Boolean({ description: "Use full browser rendering (slower but handles SPAs)" })),
        include_patterns: Type.Optional(Type.Array(Type.String(), { description: "URL patterns to include (glob)" })),
        exclude_patterns: Type.Optional(Type.Array(Type.String(), { description: "URL patterns to exclude (glob)" })),
        extract_metadata: Type.Optional(Type.Boolean({ description: "Extract metadata per page (default: true)" })),
        respect_robots: Type.Optional(Type.Boolean({ description: "Respect robots.txt (default: true)" })),
        cookies: Type.Optional(Type.Array(Type.Object({
          name: Type.String(),
          value: Type.String(),
          domain: Type.String(),
          path: Type.Optional(Type.String()),
          secure: Type.Optional(Type.Boolean()),
          httpOnly: Type.Optional(Type.Boolean())
        }), { description: "Cookies to inject for authenticated sessions" })),
        options: Type.Optional(Type.Record(Type.String(), Type.Any()))
      }),
      async execute(_id: string, params: any) {
        const crawlOpts: string[] = [];
        if (params.max_pages != null) crawlOpts.push(`max_pages: ${params.max_pages}`);
        if (params.format) crawlOpts.push(`format: '${params.format}'`);
        if (params.js_rendering) crawlOpts.push("js_rendering: true");
        if (params.include_patterns) crawlOpts.push(`include_patterns: ${JSON.stringify(params.include_patterns)}`);
        if (params.exclude_patterns) crawlOpts.push(`exclude_patterns: ${JSON.stringify(params.exclude_patterns)}`);
        if (params.extract_metadata === false) crawlOpts.push("extract_metadata: false");
        if (params.respect_robots === false) crawlOpts.push("respect_robots: false");
        const optsStr = crawlOpts.length > 0 ? `{ ${crawlOpts.join(", ")} }` : "";
        const payload: any = {
          url: params.url,
          script: `return await crawl(${optsStr});`,
          options: { ...(params.options || {}), returnResult: true }
        };
        if (params.cookies) payload.options.cookies = params.cookies;
        const result = await runWithDefaults(api, payload, { include: ["result", "console"] });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "riddle_visual_diff",
      description: "Riddle: visually compare two URLs by screenshotting both and computing a pixel-level diff. Returns change percentage, changed pixel count, and URLs to before/after/diff images. For authenticated comparison, use riddle_script with login steps followed by await visualDiff().",
      parameters: Type.Object({
        url_before: Type.String({ description: "URL to screenshot as the 'before' image" }),
        url_after: Type.String({ description: "URL to screenshot as the 'after' image" }),
        viewport: Type.Optional(Type.Object({
          width: Type.Number({ description: "Viewport width (default: 1280)" }),
          height: Type.Number({ description: "Viewport height (default: 720)" })
        })),
        full_page: Type.Optional(Type.Boolean({ description: "Capture full page (default: true)" })),
        threshold: Type.Optional(Type.Number({ description: "Pixel match threshold 0-1 (default: 0.1)" })),
        selector: Type.Optional(Type.String({ description: "CSS selector to capture instead of full page" })),
        delay_ms: Type.Optional(Type.Number({ description: "Delay after page load before capture (ms)" })),
        cookies_before: Type.Optional(Type.Array(Type.Object({
          name: Type.String(), value: Type.String(), domain: Type.String(),
          path: Type.Optional(Type.String()), secure: Type.Optional(Type.Boolean()), httpOnly: Type.Optional(Type.Boolean())
        }), { description: "Cookies for the 'before' URL" })),
        cookies_after: Type.Optional(Type.Array(Type.Object({
          name: Type.String(), value: Type.String(), domain: Type.String(),
          path: Type.Optional(Type.String()), secure: Type.Optional(Type.Boolean()), httpOnly: Type.Optional(Type.Boolean())
        }), { description: "Cookies for the 'after' URL" })),
        options: Type.Optional(Type.Record(Type.String(), Type.Any()))
      }),
      async execute(_id: string, params: any) {
        const vdOpts: string[] = [];
        vdOpts.push(`url_before: '${params.url_before}'`);
        vdOpts.push(`url_after: '${params.url_after}'`);
        if (params.viewport) vdOpts.push(`viewport: { width: ${params.viewport.width || 1280}, height: ${params.viewport.height || 720} }`);
        if (params.full_page === false) vdOpts.push("full_page: false");
        if (params.threshold != null) vdOpts.push(`threshold: ${params.threshold}`);
        if (params.selector) vdOpts.push(`selector: '${params.selector}'`);
        if (params.delay_ms) vdOpts.push(`delay_ms: ${params.delay_ms}`);
        if (params.cookies_before) vdOpts.push(`cookies_before: ${JSON.stringify(params.cookies_before)}`);
        if (params.cookies_after) vdOpts.push(`cookies_after: ${JSON.stringify(params.cookies_after)}`);
        const optsStr = `{ ${vdOpts.join(", ")} }`;
        const payload: any = {
          url: params.url_before,
          script: `return await visualDiff(${optsStr});`,
          options: { ...(params.options || {}), returnResult: true }
        };
        const result = await runWithDefaults(api, payload, { include: ["result", "console", "visual_diff"] });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "riddle_preview",
      description: "Deploy a local build directory as an ephemeral preview site. Tars the directory, uploads to Riddle, and returns a live URL at preview.riddledc.com that can be screenshotted with other riddle_* tools. Previews auto-expire after 24 hours.",
      parameters: Type.Object({
        directory: Type.String({ description: "Absolute path to the build output directory (e.g. /path/to/build or /path/to/dist)" }),
        framework: Type.Optional(Type.String({ description: "Framework hint: 'spa' (default) or 'static'" }))
      }),
      async execute(_id: string, params: any) {
        const { apiKey, baseUrl } = getCfg(api);
        if (!apiKey) {
          return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: "Missing Riddle API key." }, null, 2) }] };
        }
        assertAllowedBaseUrl(baseUrl);

        const dir = params.directory;
        if (!dir || typeof dir !== "string") throw new Error("directory must be an absolute path");

        // Verify directory exists
        try {
          const st = await stat(dir);
          if (!st.isDirectory()) throw new Error(`Not a directory: ${dir}`);
        } catch (e: any) {
          return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: `Cannot access directory: ${e.message}` }, null, 2) }] };
        }

        const endpoint = baseUrl.replace(/\/$/, "");

        // Step 1: Create preview
        const createRes = await fetch(`${endpoint}/v1/preview`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ framework: params.framework || "spa" })
        });
        if (!createRes.ok) {
          const err = await createRes.text();
          return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: `Create failed: HTTP ${createRes.status} ${err}` }, null, 2) }] };
        }
        const created = await createRes.json() as any;

        // Step 2: Tar the directory and upload
        const tarball = `/tmp/riddle-preview-${created.id}.tar.gz`;
        try {
          await execFile("tar", ["czf", tarball, "-C", dir, "."], { timeout: 60000 });
          const tarData = await readFile(tarball);

          const uploadRes = await fetch(created.upload_url, {
            method: "PUT",
            headers: { "Content-Type": "application/gzip" },
            body: tarData
          });
          if (!uploadRes.ok) {
            return { content: [{ type: "text", text: JSON.stringify({ ok: false, id: created.id, error: `Upload failed: HTTP ${uploadRes.status}` }, null, 2) }] };
          }
        } finally {
          try { await rm(tarball, { force: true }); } catch { /* ignore */ }
        }

        // Step 3: Publish
        const publishRes = await fetch(`${endpoint}/v1/preview/${created.id}/publish`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` }
        });
        if (!publishRes.ok) {
          const err = await publishRes.text();
          return { content: [{ type: "text", text: JSON.stringify({ ok: false, id: created.id, error: `Publish failed: HTTP ${publishRes.status} ${err}` }, null, 2) }] };
        }
        const published = await publishRes.json() as any;

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ok: true,
              id: published.id,
              preview_url: published.preview_url,
              file_count: published.file_count,
              total_bytes: published.total_bytes,
              expires_at: created.expires_at
            }, null, 2)
          }]
        };
      }
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "riddle_preview_delete",
      description: "Delete an ephemeral preview site created by riddle_preview. Removes all files and frees the preview ID immediately instead of waiting for auto-expiry.",
      parameters: Type.Object({
        id: Type.String({ description: "Preview ID (e.g. pv_a1b2c3d4)" })
      }),
      async execute(_id: string, params: any) {
        const { apiKey, baseUrl } = getCfg(api);
        if (!apiKey) {
          return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: "Missing Riddle API key." }, null, 2) }] };
        }
        assertAllowedBaseUrl(baseUrl);

        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/preview/${params.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${apiKey}` }
        });
        if (!res.ok) {
          const err = await res.text();
          return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: `Delete failed: HTTP ${res.status} ${err}` }, null, 2) }] };
        }
        const data = await res.json() as any;
        return { content: [{ type: "text", text: JSON.stringify({ ok: true, deleted: true, files_removed: data.files_removed }, null, 2) }] };
      }
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "riddle_server_preview",
      description: "Run a server-side app (Next.js, Express, Django, etc.) in an isolated Docker container and screenshot it. Tars the build directory, uploads to Riddle, starts the container with the specified image and command, waits for readiness, then takes a Playwright screenshot. Use for apps that need a running server process (not static sites — use riddle_preview for those).",
      parameters: Type.Object({
        directory: Type.String({ description: "Absolute path to the project/build directory to deploy into the container" }),
        image: Type.String({ description: "Docker image to run (e.g. 'node:20-slim', 'python:3.12-slim')" }),
        command: Type.String({ description: "Command to start the server inside the container (e.g. 'npm start', 'python manage.py runserver 0.0.0.0:3000')" }),
        port: Type.Number({ description: "Port the server listens on inside the container" }),
        path: Type.Optional(Type.String({ description: "URL path to screenshot (default: '/')" })),
        env: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "Non-sensitive environment variables" })),
        sensitive_env: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "Sensitive environment variables (API keys, DB passwords). Stored securely and deleted after use." })),
        timeout: Type.Optional(Type.Number({ description: "Max execution time in seconds (default: 120, max: 600)" })),
        readiness_path: Type.Optional(Type.String({ description: "Path to poll for readiness (default: same as path)" })),
        readiness_timeout: Type.Optional(Type.Number({ description: "Max seconds to wait for server readiness (default: 30)" })),
        script: Type.Optional(Type.String({ description: "Optional Playwright script to run after server is ready. Full sandbox: saveScreenshot(), scrape(), map(), crawl(), saveHtml(), saveJson(), visualDiff(). Cannot use with steps." })),
        steps: Type.Optional(Type.Array(Type.Any(), { description: "Declarative steps (same as riddle_steps). Cannot use with script. Example: [{ click: '.btn' }, { screenshot: 'after-click' }]" })),
        wait_until: Type.Optional(Type.Union([Type.Literal("load"), Type.Literal("domcontentloaded"), Type.Literal("networkidle")], { description: "Playwright waitUntil strategy for page.goto (default: 'load'). Use 'domcontentloaded' for SPAs that make continuous network requests." })),
        viewport: Type.Optional(Type.Object({ width: Type.Number(), height: Type.Number() }, { description: "Browser viewport size (default: 1920x1080)" })),
        localStorage: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "localStorage key-value pairs injected before page load (e.g. auth tokens)" })),
        exclude: Type.Optional(Type.Array(Type.String(), { description: "Glob patterns to exclude from tarball. Default: ['node_modules', '.git', '*.log']" })),
      }),
      async execute(_id: string, params: any) {
        const { apiKey, baseUrl } = getCfg(api);
        if (!apiKey) {
          return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: "Missing Riddle API key." }, null, 2) }] };
        }
        assertAllowedBaseUrl(baseUrl);

        const dir = params.directory;
        if (!dir || typeof dir !== "string") throw new Error("directory must be an absolute path");

        // Verify directory exists
        try {
          const st = await stat(dir);
          if (!st.isDirectory()) throw new Error(`Not a directory: ${dir}`);
        } catch (e: any) {
          return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: `Cannot access directory: ${e.message}` }, null, 2) }] };
        }

        const endpoint = baseUrl.replace(/\/$/, "");

        // Step 1: Store sensitive env vars and/or localStorage if provided
        let envRef: string | null = null;
        const hasSensitiveEnv = params.sensitive_env && Object.keys(params.sensitive_env).length > 0;
        const hasLocalStorage = params.localStorage && Object.keys(params.localStorage).length > 0;
        if (hasSensitiveEnv || hasLocalStorage) {
          const envBody: any = {};
          if (hasSensitiveEnv) envBody.env = params.sensitive_env;
          if (hasLocalStorage) envBody.localStorage = params.localStorage;
          const envRes = await fetch(`${endpoint}/v1/server-preview/env`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(envBody)
          });
          if (!envRes.ok) {
            const err = await envRes.text();
            return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: `Store env failed: HTTP ${envRes.status} ${err}` }, null, 2) }] };
          }
          const envData = await envRes.json() as any;
          envRef = envData.env_ref;
        }

        // Step 2: Create server preview job
        const createBody: any = {
          image: params.image,
          command: params.command,
          port: params.port,
        };
        if (params.path) createBody.path = params.path;
        if (params.env) createBody.env = params.env;
        if (envRef) createBody.env_ref = envRef;
        if (params.timeout) createBody.timeout = params.timeout;
        if (params.readiness_path) createBody.readiness_path = params.readiness_path;
        if (params.readiness_timeout) createBody.readiness_timeout = params.readiness_timeout;
        if (params.script) createBody.script = params.script;
        if (params.steps) createBody.steps = params.steps;
        if (params.wait_until) createBody.wait_until = params.wait_until;
        if (params.viewport) createBody.viewport = params.viewport;

        const createRes = await fetch(`${endpoint}/v1/server-preview`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(createBody)
        });
        if (!createRes.ok) {
          const err = await createRes.text();
          return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: `Create failed: HTTP ${createRes.status} ${err}` }, null, 2) }] };
        }
        const created = await createRes.json() as any;

        // Step 3: Tar the directory and upload
        const tarball = `/tmp/riddle-sp-${created.job_id}.tar.gz`;
        try {
          const excludes = params.exclude || ["node_modules", ".git", "*.log"];
          const excludeArgs = excludes.flatMap((p: string) => ["--exclude", p]);
          await execFile("tar", ["czf", tarball, ...excludeArgs, "-C", dir, "."], { timeout: 120000 });
          const tarData = await readFile(tarball);

          const uploadRes = await fetch(created.upload_url, {
            method: "PUT",
            headers: { "Content-Type": "application/gzip" },
            body: tarData
          });
          if (!uploadRes.ok) {
            return { content: [{ type: "text", text: JSON.stringify({ ok: false, job_id: created.job_id, error: `Upload failed: HTTP ${uploadRes.status}` }, null, 2) }] };
          }
        } finally {
          try { await rm(tarball, { force: true }); } catch { /* ignore */ }
        }

        // Step 4: Start the job
        const startRes = await fetch(`${endpoint}/v1/server-preview/${created.job_id}/start`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` }
        });
        if (!startRes.ok) {
          const err = await startRes.text();
          return { content: [{ type: "text", text: JSON.stringify({ ok: false, job_id: created.job_id, error: `Start failed: HTTP ${startRes.status} ${err}` }, null, 2) }] };
        }

        // Step 5: Poll until complete
        const timeoutMs = ((params.timeout || 120) + 60) * 1000; // extra 60s buffer for Docker pull
        const pollStart = Date.now();
        const POLL_INTERVAL = 3000;

        while (Date.now() - pollStart < timeoutMs) {
          const statusRes = await fetch(`${endpoint}/v1/server-preview/${created.job_id}`, {
            headers: { Authorization: `Bearer ${apiKey}` }
          });
          if (!statusRes.ok) {
            return { content: [{ type: "text", text: JSON.stringify({ ok: false, job_id: created.job_id, error: `Poll failed: HTTP ${statusRes.status}` }, null, 2) }] };
          }
          const statusData = await statusRes.json() as any;

          if (statusData.status === "complete" || statusData.status === "completed" || statusData.status === "failed") {
            const result: any = {
              ok: statusData.status === "complete" || statusData.status === "completed",
              job_id: created.job_id,
              status: statusData.status,
              outputs: statusData.outputs || [],
              compute_seconds: statusData.compute_seconds,
              egress_bytes: statusData.egress_bytes,
            };
            if (statusData.error) result.error = statusData.error;

            // Download and save screenshots from outputs
            const workspace = getWorkspacePath(api);
            for (const output of result.outputs) {
              if (output.name && /\.(png|jpg|jpeg)$/i.test(output.name) && output.url) {
                try {
                  const imgRes = await fetch(output.url);
                  if (imgRes.ok) {
                    const buf = await imgRes.arrayBuffer();
                    const base64 = Buffer.from(buf).toString("base64");
                    const ref = await writeArtifactBinary(workspace, "screenshots", `${created.job_id}-${output.name}`, base64);
                    output.saved = ref.path;
                    output.sizeBytes = ref.sizeBytes;
                  }
                } catch { /* skip */ }
              }
            }

            // Convenience: screenshots[] = just the image outputs
            result.screenshots = result.outputs.filter((o: any) => /\.(png|jpg|jpeg)$/i.test(o.name));

            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        }

        return { content: [{ type: "text", text: JSON.stringify({ ok: false, job_id: created.job_id, error: `Job did not complete within ${timeoutMs / 1000}s` }, null, 2) }] };
      }
    },
    { optional: true }
  );
}
