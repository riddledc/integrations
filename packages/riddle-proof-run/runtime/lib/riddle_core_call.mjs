#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const TOOL_DEFAULT_INCLUDE = ["screenshot", "console", "result", "data", "urls", "dataset", "sitemap", "visual_diff"];

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
    apiKey: process.env.RIDDLE_API_KEY || pluginCfg.apiKey,
    baseUrl: pluginCfg.baseUrl || "https://api.riddledc.com",
    workspace: process.env.OPENCLAW_WORKSPACE || process.cwd(),
  };
}

async function importFileIfExists(path) {
  if (!path || !existsSync(path)) return null;
  return import(pathToFileURL(path).href);
}

async function loadCore() {
  try {
    return await import("@riddledc/openclaw-riddledc/core");
  } catch (primaryErr) {
    const candidates = [
      process.env.RIDDLE_OPENCLAW_CORE_PATH,
      "/root/.openclaw/extensions/openclaw-riddledc/dist/core.js",
      "/root/.openclaw/extensions/@riddledc/openclaw-riddledc/dist/core.js",
      "/root/.openclaw/extensions/node_modules/@riddledc/openclaw-riddledc/dist/core.js",
      "/usr/lib/node_modules/@riddledc/openclaw-riddledc/dist/core.js",
    ];

    for (const candidate of candidates) {
      const mod = await importFileIfExists(candidate);
      if (mod) return mod;
    }

    const err = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
    throw new Error(
      "Riddle core package not found. Install/upgrade @riddledc/openclaw-riddledc with the ./core export before running riddle-proof direct mode. Import error: " + err
    );
  }
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

async function run(tool, args) {
  const core = await loadCore();
  const config = buildConfig();

  if (tool === "riddle_preview") {
    return core.createStaticPreview(config, {
      directory: args.directory ?? args.dir,
      framework: args.framework,
    });
  }

  if (tool === "riddle_preview_delete") {
    return core.deleteStaticPreview(config, args.id);
  }

  if (tool === "riddle_server_preview") {
    return core.createServerPreview(config, normalizeServerArgs(args));
  }

  if (tool === "riddle_build_preview") {
    return core.createBuildPreview(config, normalizeBuildArgs(args));
  }

  if (tool === "riddle_script") {
    return core.runWithDefaults(config, args, {
      include: TOOL_DEFAULT_INCLUDE,
      returnAsync: !!args.async,
    });
  }

  if (tool === "riddle_run") {
    return core.runWithDefaults(config, args.payload ?? args, {
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
  console.log(JSON.stringify(result));
}

main().catch((err) => {
  console.log(JSON.stringify({
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  }));
});
