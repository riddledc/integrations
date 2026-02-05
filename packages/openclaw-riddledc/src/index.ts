import { Type } from "@sinclair/typebox";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

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
  return { path: `riddle/${subdir}/${filename}`, sizeBytes: buf.byteLength };
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
  return { path: `riddle/${subdir}/${filename}`, sizeBytes: buf.byteLength };
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
      result.screenshot = { saved: ref.path, sizeBytes: ref.sizeBytes };
    }
  }

  // screenshots array: save each to file (API returns both screenshot and screenshots)
  if (Array.isArray((result as any).screenshots)) {
    const savedRefs: Array<{ saved: string; sizeBytes: number }> = [];
    for (let i = 0; i < (result as any).screenshots.length; i++) {
      const ss = (result as any).screenshots[i];
      let base64Data: string | null = null;
      if (typeof ss === "string") {
        base64Data = ss;
      } else if (typeof ss === "object" && ss.data) {
        // Handle data:image/png;base64, prefix
        base64Data = ss.data.replace(/^data:image\/\w+;base64,/, "");
      }
      if (base64Data) {
        const ref = await writeArtifactBinary(opts.workspace, "screenshots", `${jobId}-${i}.png`, base64Data);
        savedRefs.push({ saved: ref.path, sizeBytes: ref.sizeBytes });
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

async function runWithDefaults(
  api: PluginApi,
  payload: RiddlePayload,
  defaults?: { include?: string[] }
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

  const merged: any = { ...payload };
  delete merged.harInline; // Plugin-only flag; don't forward to API

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
    // Save screenshot to file instead of inline base64
    const workspace = getWorkspacePath(api);
    await applySafetySpec(out, { workspace, harInline });
    return out;
  }

  const txt = Buffer.from(body).toString("utf8");
  const json = JSON.parse(txt);
  Object.assign(out, json);
  out.job_id = (json.job_id ?? json.jobId ?? out.job_id) as any;

  // Apply HAR safety spec: cap inline sizes, write large artifacts to files
  const workspace = getWorkspacePath(api);
  await applySafetySpec(out, { workspace, harInline });

  return out;
}

export default function register(api: PluginApi) {
  api.registerTool(
    {
      name: "riddle_run",
      description:
        "Run a Riddle job (pass-through payload) against https://api.riddledc.com/v1/run. Supports url/urls/steps/script. Returns screenshot + console by default; pass include:[\"har\"] to opt in to HAR capture.",
      parameters: Type.Object({
        payload: Type.Record(Type.String(), Type.Any())
      }),
      async execute(_id: string, params: any) {
        const result = await runWithDefaults(api, params.payload, {
          include: ["screenshot", "console", "result"]
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
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
      description: "Riddle: run a workflow in steps mode (goto/click/fill/etc.). Supports authenticated sessions via cookies/localStorage. Returns screenshot + console by default; pass include:[\"har\"] to opt in to HAR capture.",
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
        sync: Type.Optional(Type.Boolean())
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
        const result = await runWithDefaults(api, payload, { include: ["screenshot", "console", "result"] });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "riddle_script",
      description: "Riddle: run full Playwright code (script mode). Supports authenticated sessions via cookies/localStorage. In scripts, use `await injectLocalStorage()` after navigating to the origin to apply localStorage values. Returns screenshot + console by default; pass include:[\"har\"] to opt in to HAR capture.",
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
        sync: Type.Optional(Type.Boolean())
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
        const result = await runWithDefaults(api, payload, { include: ["screenshot", "console", "result"] });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    },
    { optional: true }
  );
}
