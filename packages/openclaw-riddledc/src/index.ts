import { Type } from "@sinclair/typebox";

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

function getCfg(api: PluginApi) {
  const cfg = api?.config ?? {};
  const pluginCfg = cfg?.plugins?.entries?.riddle?.config ?? {};
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

async function runWithDefaults(
  api: PluginApi,
  payload: RiddlePayload,
  defaults?: { include?: string[]; inline?: boolean }
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

  const merged: any = { ...payload };
  if (defaults?.include?.length) {
    merged.include = Array.from(new Set([...(merged.include ?? []), ...defaults.include]));
  }
  if (defaults?.inline) {
    merged.inlineConsole = merged.inlineConsole ?? true;
    merged.inlineHar = merged.inlineHar ?? true;
    merged.inlineResult = merged.inlineResult ?? true;
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
    return out;
  }

  const txt = Buffer.from(body).toString("utf8");
  const json = JSON.parse(txt);
  Object.assign(out, json);
  out.job_id = (json.job_id ?? json.jobId ?? out.job_id) as any;
  return out;
}

export default function register(api: PluginApi) {
  api.registerTool(
    {
      name: "riddle_run",
      description:
        "Run a Riddle job (pass-through payload) against https://api.riddledc.com/v1/run. Supports url/urls/steps/script. Returns screenshot/console/har/result when requested.",
      parameters: Type.Object({
        payload: Type.Record(Type.String(), Type.Any())
      }),
      async execute(_id: string, params: any) {
        const result = await runWithDefaults(api, params.payload, {
          include: ["console", "har", "result"],
          inline: true
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "riddle_screenshot",
      description: "Riddle: take a screenshot of a single URL (url mode).",
      parameters: Type.Object({
        url: Type.String(),
        timeout_sec: Type.Optional(Type.Number()),
        options: Type.Optional(Type.Record(Type.String(), Type.Any())),
        include: Type.Optional(Type.Array(Type.String()))
      }),
      async execute(_id: string, params: any) {
        if (!params.url || typeof params.url !== "string") throw new Error("url must be a string");
        const payload: any = { url: params.url };
        if (params.timeout_sec) payload.timeout_sec = params.timeout_sec;
        if (params.options) payload.options = params.options;
        if (params.include) payload.include = params.include;
        const result = await runWithDefaults(api, payload, { include: ["console", "har"], inline: true });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "riddle_screenshots",
      description: "Riddle: take screenshots for multiple URLs in one job (urls mode).",
      parameters: Type.Object({
        urls: Type.Array(Type.String()),
        timeout_sec: Type.Optional(Type.Number()),
        options: Type.Optional(Type.Record(Type.String(), Type.Any())),
        include: Type.Optional(Type.Array(Type.String()))
      }),
      async execute(_id: string, params: any) {
        if (!Array.isArray(params.urls) || params.urls.some((url: any) => typeof url !== "string")) {
          throw new Error("urls must be an array of strings");
        }
        const payload: any = { urls: params.urls };
        if (params.timeout_sec) payload.timeout_sec = params.timeout_sec;
        if (params.options) payload.options = params.options;
        if (params.include) payload.include = params.include;
        const result = await runWithDefaults(api, payload, { include: ["console", "har"], inline: true });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "riddle_steps",
      description: "Riddle: run a workflow in steps mode (goto/click/fill/etc.).",
      parameters: Type.Object({
        steps: Type.Array(Type.Record(Type.String(), Type.Any())),
        timeout_sec: Type.Optional(Type.Number()),
        options: Type.Optional(Type.Record(Type.String(), Type.Any())),
        include: Type.Optional(Type.Array(Type.String())),
        sync: Type.Optional(Type.Boolean())
      }),
      async execute(_id: string, params: any) {
        if (!Array.isArray(params.steps)) throw new Error("steps must be an array");
        const payload: any = { steps: params.steps };
        if (typeof params.sync === "boolean") payload.sync = params.sync;
        if (params.timeout_sec) payload.timeout_sec = params.timeout_sec;
        if (params.options) payload.options = params.options;
        if (params.include) payload.include = params.include;
        const result = await runWithDefaults(api, payload, { include: ["console", "har", "result"], inline: true });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "riddle_script",
      description: "Riddle: run full Playwright code (script mode).",
      parameters: Type.Object({
        script: Type.String(),
        timeout_sec: Type.Optional(Type.Number()),
        options: Type.Optional(Type.Record(Type.String(), Type.Any())),
        include: Type.Optional(Type.Array(Type.String())),
        sync: Type.Optional(Type.Boolean())
      }),
      async execute(_id: string, params: any) {
        if (!params.script || typeof params.script !== "string") throw new Error("script must be a string");
        const payload: any = { script: params.script };
        if (typeof params.sync === "boolean") payload.sync = params.sync;
        if (params.timeout_sec) payload.timeout_sec = params.timeout_sec;
        if (params.options) payload.options = params.options;
        if (params.include) payload.include = params.include;
        const result = await runWithDefaults(api, payload, { include: ["console", "har", "result"], inline: true });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    },
    { optional: true }
  );
}
