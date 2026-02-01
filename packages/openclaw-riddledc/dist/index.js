// src/index.ts
import { Type } from "@sinclair/typebox";
function getCfg(api) {
  const cfg = api?.config ?? {};
  const pluginCfg = cfg?.plugins?.entries?.riddle?.config ?? {};
  return {
    apiKey: process.env.RIDDLE_API_KEY || pluginCfg.apiKey,
    baseUrl: pluginCfg.baseUrl || "https://api.riddledc.com"
  };
}
function assertAllowedBaseUrl(baseUrl) {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:") throw new Error(`Riddle baseUrl must be https: (${baseUrl})`);
  if (url.hostname !== "api.riddledc.com") {
    throw new Error(`Refusing to use non-official Riddle host: ${url.hostname}`);
  }
}
function detectMode(payload) {
  if (payload.url) return "url";
  if (payload.urls) return "urls";
  if (payload.steps) return "steps";
  if (payload.script) return "script";
  return void 0;
}
async function postRun(baseUrl, apiKey, payload) {
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
function abToBase64(ab) {
  return Buffer.from(ab).toString("base64");
}
async function runWithDefaults(api, payload, defaults) {
  const { apiKey, baseUrl } = getCfg(api);
  if (!apiKey) {
    return {
      ok: false,
      error: "Missing Riddle API key. Set RIDDLE_API_KEY env var or plugins.entries.riddle.config.apiKey."
    };
  }
  assertAllowedBaseUrl(baseUrl);
  const mode = detectMode(payload);
  const merged = { ...payload };
  if (defaults?.include?.length) {
    merged.include = Array.from(/* @__PURE__ */ new Set([...merged.include ?? [], ...defaults.include]));
  }
  if (defaults?.inline) {
    merged.inlineConsole = merged.inlineConsole ?? true;
    merged.inlineHar = merged.inlineHar ?? true;
    merged.inlineResult = merged.inlineResult ?? true;
  }
  const out = { ok: true, mode };
  const { contentType, body, headers, status } = await postRun(baseUrl, apiKey, merged);
  out.rawContentType = contentType ?? void 0;
  if (status >= 400) {
    try {
      const txt2 = Buffer.from(body).toString("utf8");
      out.ok = false;
      out.error = JSON.parse(txt2);
      return out;
    } catch {
      out.ok = false;
      out.error = `HTTP ${status}`;
      return out;
    }
  }
  if (contentType && contentType.includes("image/png")) {
    out.rawPngBase64 = abToBase64(body);
    out.job_id = headers.get("x-job-id") ?? void 0;
    const duration = headers.get("x-duration-ms");
    out.duration_ms = duration ? Number(duration) : void 0;
    out.sync = true;
    return out;
  }
  const txt = Buffer.from(body).toString("utf8");
  const json = JSON.parse(txt);
  Object.assign(out, json);
  out.job_id = json.job_id ?? json.jobId ?? out.job_id;
  return out;
}
function register(api) {
  api.registerTool(
    {
      name: "riddle_run",
      description: "Run a Riddle job (pass-through payload) against https://api.riddledc.com/v1/run. Supports url/urls/steps/script. Returns screenshot/console/har/result when requested.",
      parameters: Type.Object({
        payload: Type.Record(Type.String(), Type.Any())
      }),
      async execute(_id, params) {
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
      async execute(_id, params) {
        if (!params.url || typeof params.url !== "string") throw new Error("url must be a string");
        const payload = { url: params.url };
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
      async execute(_id, params) {
        if (!Array.isArray(params.urls) || params.urls.some((url) => typeof url !== "string")) {
          throw new Error("urls must be an array of strings");
        }
        const payload = { urls: params.urls };
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
      async execute(_id, params) {
        if (!Array.isArray(params.steps)) throw new Error("steps must be an array");
        const payload = { steps: params.steps };
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
      async execute(_id, params) {
        if (!params.script || typeof params.script !== "string") throw new Error("script must be a string");
        const payload = { script: params.script };
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
export {
  register as default
};
