#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { writeFileSync } from "fs";

const DEFAULT_GATEWAY_URL = "https://api.riddledc.com";
const RIDDLE_API = process.env.RIDDLE_MCP_GATEWAY_URL || DEFAULT_GATEWAY_URL;

function saveToTmp(buffer: Buffer, name: string, ext = "png"): string {
  const filename = `/tmp/riddle-${name}-${Date.now()}.${ext}`;
  writeFileSync(filename, buffer);
  return filename;
}

// ── Auth options shared across tools ──

interface AuthOptions {
  cookies?: Array<{
    name: string;
    value: string;
    domain: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
  }>;
  localStorage?: Record<string, string>;
  headers?: Record<string, string>;
  stealth?: boolean;
}

const authOptionsSchema = {
  cookies: {
    type: "array" as const,
    description: "Cookies to set before page load. Each: {name, value, domain, path?, secure?, httpOnly?}",
    items: {
      type: "object" as const,
      properties: {
        name: { type: "string" as const },
        value: { type: "string" as const },
        domain: { type: "string" as const },
        path: { type: "string" as const },
        secure: { type: "boolean" as const },
        httpOnly: { type: "boolean" as const }
      },
      required: ["name", "value", "domain"]
    }
  },
  localStorage: {
    type: "object" as const,
    description: "Key-value pairs injected into localStorage before page load",
    additionalProperties: { type: "string" as const }
  },
  headers: {
    type: "object" as const,
    description: "Extra HTTP headers sent with every request",
    additionalProperties: { type: "string" as const }
  },
  stealth: {
    type: "boolean" as const,
    description: "Enable stealth mode to bypass bot detection (Cloudflare, Datadome, etc.)"
  }
};

// ── Riddle API client ──

class RiddleClient {
  private token?: string;

  constructor() {
    this.token = process.env.RIDDLE_AUTH_TOKEN || process.env.RIDDLE_API_KEY;
    if (!this.token) {
      console.error("Warning: RIDDLE_AUTH_TOKEN or RIDDLE_API_KEY not set");
    }
  }

  private buildPayload(
    base: Record<string, unknown>,
    auth?: AuthOptions
  ): Record<string, unknown> {
    const payload = { ...base };
    if (auth) {
      const opts: Record<string, unknown> = {
        ...(payload.options as Record<string, unknown> || {})
      };
      if (auth.cookies) opts.cookies = auth.cookies;
      if (auth.localStorage) opts.localStorage = auth.localStorage;
      if (auth.headers) opts.headers = auth.headers;
      if (Object.keys(opts).length > 0) payload.options = opts;
      if (auth.stealth) payload.stealth = true;
    }
    return payload;
  }

  async postRun(payload: Record<string, unknown>): Promise<Response> {
    return fetch(`${RIDDLE_API}/v1/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token ?? ""}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  }

  async screenshotSync(
    url: string,
    viewport: Record<string, unknown>,
    auth?: AuthOptions
  ): Promise<string> {
    const payload = this.buildPayload({ url, options: { viewport } }, auth);
    const response = await this.postRun(payload);

    if (!response.ok) {
      if (response.status === 408) {
        const data = await response.json().catch(() => null);
        const jobId = data?.job_id;
        if (!jobId) throw new Error(`API error: ${response.status}`);

        await this.waitForJob(jobId);
        const artifacts = await this.getArtifacts(jobId);
        const png = artifacts.artifacts?.find(
          (a: { name?: string }) => a.name?.endsWith(".png")
        );
        if (!png?.url) throw new Error("No screenshot artifact found");

        const buffer = await this.downloadArtifact(png.url);
        return Buffer.from(buffer).toString("base64");
      }
      const text = await response.text().catch(() => "");
      throw new Error(`API error: ${response.status}${text ? `: ${text}` : ""}`);
    }

    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString("base64");
  }

  async runScriptSync(
    url: string,
    script: string,
    viewport: Record<string, unknown>,
    timeoutSec = 60,
    auth?: AuthOptions
  ) {
    const payload = this.buildPayload(
      { url, script, viewport, sync: false, timeout_sec: timeoutSec },
      auth
    );
    const response = await this.postRun(payload);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error ${response.status}: ${text}`);
    }

    const { job_id } = await response.json();
    if (!job_id) throw new Error("No job_id returned");

    await this.waitForJob(job_id);

    const artifacts = await this.getArtifacts(job_id);
    const results: Array<{ name?: string; type: string; buffer: Buffer }> = [];
    let consoleLogs: any = null;
    let networkHar: any = null;

    for (const artifact of artifacts.artifacts || []) {
      if (artifact.url) {
        const buffer = await this.downloadArtifact(artifact.url);

        if (artifact.name === "console.json") {
          try { consoleLogs = JSON.parse(buffer.toString("utf8")); } catch {}
        } else if (artifact.name === "network.har") {
          try { networkHar = JSON.parse(buffer.toString("utf8")); } catch {}
        }

        results.push({
          name: artifact.name,
          type: artifact.name?.endsWith(".png") ? "image" : "file",
          buffer
        });
      }
    }

    return { job_id, artifacts: results, consoleLogs, networkHar };
  }

  async runStepsSync(
    steps: unknown[],
    viewport: Record<string, unknown>,
    timeoutSec = 60,
    auth?: AuthOptions
  ) {
    const payload = this.buildPayload(
      { steps, viewport, sync: false, timeout_sec: timeoutSec },
      auth
    );
    const response = await this.postRun(payload);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error ${response.status}: ${text}`);
    }

    const { job_id } = await response.json();
    if (!job_id) throw new Error("No job_id returned");

    await this.waitForJob(job_id);

    const artifacts = await this.getArtifacts(job_id);
    const results: Array<{ name?: string; type: string; buffer: Buffer }> = [];

    for (const artifact of artifacts.artifacts || []) {
      if (artifact.url) {
        const buffer = await this.downloadArtifact(artifact.url);
        results.push({
          name: artifact.name,
          type: artifact.name?.endsWith(".png") ? "image" : "file",
          buffer
        });
      }
    }

    return { job_id, artifacts: results };
  }

  async getJob(jobId: string) {
    const response = await fetch(`${RIDDLE_API}/v1/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${this.token ?? ""}` }
    });
    return response.json();
  }

  async getArtifacts(jobId: string) {
    const response = await fetch(`${RIDDLE_API}/v1/jobs/${jobId}/artifacts`, {
      headers: { Authorization: `Bearer ${this.token ?? ""}` }
    });
    return response.json();
  }

  async waitForJob(jobId: string, maxAttempts = 30, intervalMs = 2000) {
    for (let i = 0; i < maxAttempts; i += 1) {
      const job = await this.getJob(jobId);
      if (job.status === "completed" || job.status === "complete") return job;
      if (job.status === "failed") {
        throw new Error(`Job failed: ${job.error || "Unknown error"}`);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error("Job timed out");
  }

  async downloadArtifact(url: string) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
}

// ── MCP Server ──

const server = new Server(
  { name: "riddle-mcp-server", version: "0.6.0" },
  { capabilities: { tools: {} } }
);
const client = new RiddleClient();

const devices = {
  desktop: { width: 1280, height: 720, hasTouch: false },
  ipad: { width: 820, height: 1180, hasTouch: true, isMobile: true },
  iphone: { width: 390, height: 844, hasTouch: true, isMobile: true }
};

// ── Helper: extract auth from tool args ──

function extractAuth(args: Record<string, any>): AuthOptions | undefined {
  const auth: AuthOptions = {};
  if (args.cookies) auth.cookies = args.cookies;
  if (args.localStorage) auth.localStorage = args.localStorage;
  if (args.headers) auth.headers = args.headers;
  if (args.stealth) auth.stealth = args.stealth;
  return Object.keys(auth).length > 0 ? auth : undefined;
}

// ── Helper: collect artifacts to /tmp ──

function collectArtifacts(artifacts: Array<{ name?: string; type: string; buffer: Buffer }>) {
  const savedPaths: string[] = [];
  let consolePath: string | null = null;
  let harPath: string | null = null;

  for (const artifact of artifacts) {
    if (artifact.type === "image") {
      const path = saveToTmp(artifact.buffer, artifact.name?.replace(".png", "") || "artifact");
      savedPaths.push(path);
    }
  }

  return { savedPaths, consolePath, harPath };
}

// ── Tool definitions ──

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── 1. riddle_screenshot ──
    {
      name: "riddle_screenshot",
      description:
        "Take a screenshot of one or more URLs. Returns file paths to saved PNGs in /tmp. " +
        "Supports device presets (desktop/ipad/iphone), custom viewport, and auth options " +
        "(cookies, localStorage, headers, stealth). Pass a single `url` string or an array of `urls`.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Single URL to screenshot" },
          urls: {
            type: "array",
            items: { type: "string" },
            description: "Multiple URLs to screenshot (use instead of url)"
          },
          width: { type: "number", description: "Viewport width (default: 1280)" },
          height: { type: "number", description: "Viewport height (default: 720)" },
          device: {
            type: "string",
            enum: ["desktop", "ipad", "iphone"],
            description: "Device preset (overrides width/height)"
          },
          ...authOptionsSchema
        }
      }
    },

    // ── 2. riddle_script (FLAGSHIP) ──
    {
      name: "riddle_script",
      description:
        "Run Playwright code on a page and return all artifacts. This is the primary automation tool. " +
        "The `page` object is pre-navigated to `url`. Available helpers:\n" +
        "  • saveScreenshot(label) — save a named screenshot\n" +
        "  • saveJson(name, data) — save JSON artifact\n" +
        "  • saveHtml(name, html) — save HTML artifact\n" +
        "  • scrape(opts?) — extract structured content (title, markdown, links, headings)\n" +
        "  • map(opts?) — discover all URLs on site\n" +
        "  • crawl(opts?) — crawl and extract dataset\n" +
        "  • waitForWindow(name) — wait for popup/new window\n\n" +
        "Returns: saved screenshot paths, console logs, network HAR.\n\n" +
        "Example: await page.click('button#start'); await saveScreenshot('after-click');",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Starting URL (page navigates here first)" },
          script: {
            type: "string",
            description:
              "Playwright script. `page` is available and already navigated to url. " +
              "Use saveScreenshot(label) to capture state."
          },
          device: {
            type: "string",
            enum: ["desktop", "ipad", "iphone"],
            description: "Device preset"
          },
          width: { type: "number", description: "Viewport width (default: 1280)" },
          height: { type: "number", description: "Viewport height (default: 720)" },
          timeout_sec: {
            type: "number",
            description: "Max execution time in seconds (default: 60). Set higher for games/animations."
          },
          ...authOptionsSchema
        },
        required: ["url", "script"]
      }
    },

    // ── 3. riddle_steps ──
    {
      name: "riddle_steps",
      description:
        "Run a declarative JSON workflow — simpler alternative to riddle_script for straightforward flows. " +
        "Steps are executed in order. Supported step types:\n" +
        "  • {goto: url} — navigate\n" +
        "  • {click: selector} — click element\n" +
        "  • {fill: {selector, text}} — fill input\n" +
        "  • {screenshot: label} — save screenshot\n" +
        "  • {waitForSelector: selector} — wait for element\n" +
        "  • {wait: ms} — wait milliseconds\n" +
        "  • {scrape: true} — extract page content\n\n" +
        "Example: [{goto: 'https://example.com'}, {fill: {selector: '#email', text: 'user@test.com'}}, " +
        "{click: 'button[type=submit]'}, {screenshot: 'result'}]",
      inputSchema: {
        type: "object",
        properties: {
          steps: {
            type: "array",
            items: { type: "object" },
            description: "Array of step objects to execute in order"
          },
          device: {
            type: "string",
            enum: ["desktop", "ipad", "iphone"],
            description: "Device preset"
          },
          timeout_sec: { type: "number", description: "Max execution time in seconds (default: 60)" },
          ...authOptionsSchema
        },
        required: ["steps"]
      }
    },

    // ── 4. riddle_get_job ──
    {
      name: "riddle_get_job",
      description:
        "Check status and artifacts of a previously submitted Riddle job. " +
        "Returns job status (queued/running/completed/failed) and artifact URLs.",
      inputSchema: {
        type: "object",
        properties: {
          job_id: { type: "string", description: "Job ID to check" }
        },
        required: ["job_id"]
      }
    },

    // ── 5. riddle_scrape ──
    {
      name: "riddle_scrape",
      description:
        "Extract structured content from a URL: title, description, markdown text, links, headings, " +
        "word count. Uses a real browser so it works on SPAs and JS-rendered pages.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to scrape" },
          extract_metadata: {
            type: "boolean",
            description: "Extract metadata (default: true)"
          },
          ...authOptionsSchema
        },
        required: ["url"]
      }
    },

    // ── 6. riddle_map ──
    {
      name: "riddle_map",
      description:
        "Discover all URLs on a website by crawling from the starting URL. " +
        "Returns an array of discovered URLs. Useful for building a sitemap or finding pages to screenshot.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Starting URL to map from" },
          max_pages: { type: "number", description: "Max pages to crawl (default: 500, max: 5000)" },
          include_patterns: {
            type: "array",
            items: { type: "string" },
            description: "URL patterns to include (regex)"
          },
          exclude_patterns: {
            type: "array",
            items: { type: "string" },
            description: "URL patterns to exclude (regex)"
          },
          ...authOptionsSchema
        },
        required: ["url"]
      }
    },

    // ── 7. riddle_crawl ──
    {
      name: "riddle_crawl",
      description:
        "Crawl a website and extract content from each page into a dataset. " +
        "Returns dataset metadata and saves data files to /tmp. " +
        "Supports JSONL, JSON, CSV, or ZIP output formats.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Starting URL to crawl" },
          max_pages: { type: "number", description: "Max pages to crawl (default: 100, max: 1000)" },
          format: {
            type: "string",
            enum: ["jsonl", "json", "csv", "zip"],
            description: "Output format (default: jsonl)"
          },
          js_rendering: {
            type: "boolean",
            description: "Use full browser rendering for SPAs (default: false)"
          },
          include_patterns: {
            type: "array",
            items: { type: "string" },
            description: "URL patterns to include (regex)"
          },
          exclude_patterns: {
            type: "array",
            items: { type: "string" },
            description: "URL patterns to exclude (regex)"
          },
          ...authOptionsSchema
        },
        required: ["url"]
      }
    },

    // ── 8. riddle_visual_diff ──
    {
      name: "riddle_visual_diff",
      description:
        "Visually compare two URLs by screenshotting both and computing a pixel-level diff. " +
        "Returns change percentage, pixel counts, and saves diff/before/after images to /tmp.",
      inputSchema: {
        type: "object",
        properties: {
          url_before: { type: "string", description: "URL for the 'before' screenshot" },
          url_after: { type: "string", description: "URL for the 'after' screenshot" },
          viewport_width: { type: "number", description: "Viewport width (default: 1280)" },
          viewport_height: { type: "number", description: "Viewport height (default: 720)" },
          full_page: { type: "boolean", description: "Capture full page (default: true)" },
          threshold: { type: "number", description: "Pixel match threshold 0-1 (default: 0.1)" },
          selector: { type: "string", description: "CSS selector to capture instead of full page" },
          delay_ms: { type: "number", description: "Delay after page load before capture (ms)" },
          ...authOptionsSchema
        },
        required: ["url_before", "url_after"]
      }
    },

    // ── 9. riddle_preview ──
    {
      name: "riddle_preview",
      description:
        "Deploy a directory of static files (HTML/CSS/JS) to an ephemeral preview URL. " +
        "The preview expires after 24 hours. Returns a live URL at preview.riddledc.com. " +
        "The directory must contain an index.html file.",
      inputSchema: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description: "Absolute path to build output directory (must contain index.html)"
          },
          framework: {
            type: "string",
            enum: ["spa", "static"],
            description: "Framework type: 'spa' for client-side routing (default), 'static' for multi-page"
          }
        },
        required: ["directory"]
      }
    },

    // ── 10. riddle_server_preview ──
    {
      name: "riddle_server_preview",
      description:
        "Run a server-side app in an isolated Docker container and screenshot it. " +
        "Uses a stock Docker image (e.g. node:20-slim, python:3.12-slim). " +
        "Project files are uploaded and the command is run inside the container. " +
        "Returns screenshots and compute time.",
      inputSchema: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Path to project directory" },
          image: {
            type: "string",
            description: "Docker image (e.g. 'node:20-slim', 'python:3.12-slim')"
          },
          command: { type: "string", description: "Command to start the server (e.g. 'npm start')" },
          port: { type: "number", description: "Port the server listens on (default: 3000)" },
          path: { type: "string", description: "URL path to screenshot (default: '/')" },
          env: {
            type: "object",
            description: "Environment variables (non-sensitive)",
            additionalProperties: { type: "string" }
          },
          timeout: { type: "number", description: "Max execution seconds (default: 120)" },
          readiness_path: {
            type: "string",
            description: "Poll this HTTP path until server is ready (e.g. '/health')"
          },
          readiness_timeout: {
            type: "number",
            description: "Max seconds to wait for readiness (default: 30)"
          },
          script: {
            type: "string",
            description: "Playwright script to run after server is ready (e.g. \"await saveScreenshot('home')\")"
          },
          wait_for_selector: {
            type: "string",
            description: "Wait for this CSS selector before screenshotting (handles hydration)"
          },
          navigation_timeout: {
            type: "number",
            description: "Seconds to wait for page.goto() navigation (5-120, default: 30)"
          },
          color_scheme: {
            type: "string",
            enum: ["light", "dark"],
            description: "Emulate color scheme"
          },
          viewport: {
            type: "object",
            properties: {
              width: { type: "number" },
              height: { type: "number" }
            },
            description: "Custom viewport size"
          },
          exclude: {
            type: "array",
            items: { type: "string" },
            description: "Paths to exclude from upload (e.g. ['.git', 'node_modules'])"
          },
          ...authOptionsSchema
        },
        required: ["directory", "image", "command"]
      }
    },

    // ── 11. riddle_build_preview ──
    {
      name: "riddle_build_preview",
      description:
        "Build a custom Docker image from a Dockerfile in the project directory, run it, and screenshot. " +
        "Use when the project needs system packages, compiled languages, or multi-stage builds. " +
        "Supports image caching (keep_image_minutes) and optional security audit. " +
        "Returns screenshots, build log, container log, and audit results.",
      inputSchema: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Path to project (must contain Dockerfile)" },
          command: { type: "string", description: "Command to start the server" },
          port: { type: "number", description: "Port the server listens on (default: 3000)" },
          path: { type: "string", description: "URL path to screenshot (default: '/')" },
          build_args: {
            type: "object",
            description: "Docker --build-arg values",
            additionalProperties: { type: "string" }
          },
          keep_image_minutes: {
            type: "number",
            description: "Cache built image for N minutes (0-120, default: 30)"
          },
          timeout: {
            type: "number",
            description: "Max execution seconds including build (default: 180)"
          },
          audit: {
            type: "boolean",
            description: "Run security scan of code and dependencies"
          },
          env: {
            type: "object",
            description: "Environment variables (non-sensitive)",
            additionalProperties: { type: "string" }
          },
          script: {
            type: "string",
            description: "Playwright script to run after server is ready"
          },
          wait_for_selector: { type: "string", description: "Wait for CSS selector before screenshot" },
          navigation_timeout: { type: "number", description: "Seconds to wait for page.goto() navigation (5-120, default: 30)" },
          color_scheme: { type: "string", enum: ["light", "dark"] },
          viewport: {
            type: "object",
            properties: { width: { type: "number" }, height: { type: "number" } }
          },
          exclude: {
            type: "array",
            items: { type: "string" },
            description: "Paths to exclude from upload"
          },
          ...authOptionsSchema
        },
        required: ["directory", "command"]
      }
    }
  ]
}));

// ── Tool handlers ──

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  const args = (request.params.arguments ?? {}) as Record<string, any>;

  try {
    // ── riddle_screenshot ──
    if (name === "riddle_screenshot") {
      const device = args.device as keyof typeof devices | undefined;
      const viewport = device
        ? devices[device]
        : { width: args.width || 1280, height: args.height || 720 };
      const auth = extractAuth(args);

      // Support both single url and array of urls
      const urlList: string[] = args.urls
        ? (Array.isArray(args.urls) ? args.urls : [args.urls])
        : [String(args.url)];

      if (urlList.length === 1) {
        const base64 = await client.screenshotSync(urlList[0], viewport, auth);
        const buffer = Buffer.from(base64, "base64");
        const path = saveToTmp(buffer, "screenshot");
        return {
          content: [
            { type: "text", text: JSON.stringify({ screenshot: path, url: urlList[0] }, null, 2) }
          ]
        };
      }

      // Batch mode
      const results: Array<{ url: string; success: boolean; screenshot?: string; error?: string }> = [];
      for (const url of urlList) {
        try {
          const base64 = await client.screenshotSync(String(url), viewport, auth);
          const buffer = Buffer.from(base64, "base64");
          const path = saveToTmp(buffer, `batch-${results.length}`);
          results.push({ url, success: true, screenshot: path });
        } catch (error: any) {
          results.push({ url: String(url), success: false, error: error.message });
        }
      }
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
      };
    }

    // ── riddle_script (FLAGSHIP) ──
    if (name === "riddle_script") {
      const device = args.device as keyof typeof devices | undefined;
      const viewport = device
        ? devices[device]
        : { width: args.width || 1280, height: args.height || 720 };
      const auth = extractAuth(args);

      const { job_id, artifacts, consoleLogs, networkHar } = await client.runScriptSync(
        String(args.url),
        String(args.script ?? ""),
        viewport,
        args.timeout_sec || 60,
        auth
      );

      const { savedPaths } = collectArtifacts(artifacts);

      let consolePath: string | null = null;
      if (consoleLogs?.entries) {
        const consoleData = {
          summary: consoleLogs.summary,
          logs: consoleLogs.entries.log || [],
          errors: consoleLogs.entries.error || [],
          warns: consoleLogs.entries.warn || []
        };
        consolePath = saveToTmp(
          Buffer.from(JSON.stringify(consoleData, null, 2)),
          "console",
          "json"
        );
      }

      let harPath: string | null = null;
      if (networkHar?.log?.entries) {
        harPath = saveToTmp(
          Buffer.from(JSON.stringify(networkHar, null, 2)),
          "network",
          "har"
        );
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { job_id, screenshots: savedPaths, console: consolePath, har: harPath },
              null,
              2
            )
          }
        ]
      };
    }

    // ── riddle_steps ──
    if (name === "riddle_steps") {
      const device = args.device as keyof typeof devices | undefined;
      const viewport = device ? devices[device] : devices.desktop;
      const auth = extractAuth(args);

      const { job_id, artifacts } = await client.runStepsSync(
        args.steps,
        viewport,
        args.timeout_sec || 60,
        auth
      );

      const savedPaths: string[] = [];
      let resultData: any = null;
      for (const artifact of artifacts) {
        if (artifact.type === "image") {
          const path = saveToTmp(artifact.buffer, artifact.name?.replace(".png", "") || "step");
          savedPaths.push(path);
        }
        if (artifact.name === "data.json" || artifact.name === "steps-result.json") {
          try { resultData = JSON.parse(artifact.buffer.toString("utf8")); } catch {}
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ job_id, screenshots: savedPaths, data: resultData }, null, 2)
          }
        ]
      };
    }

    // ── riddle_get_job ──
    if (name === "riddle_get_job") {
      const job = await client.getJob(String(args.job_id));
      const artifacts = await client.getArtifacts(String(args.job_id));
      return {
        content: [{ type: "text", text: JSON.stringify({ job, artifacts }, null, 2) }]
      };
    }

    // ── riddle_scrape ──
    if (name === "riddle_scrape") {
      const auth = extractAuth(args);
      const scrapeOpts = args.extract_metadata === false ? "{ extract_metadata: false }" : "";
      const script = `return await scrape(${scrapeOpts});`;
      const { job_id, artifacts } = await client.runScriptSync(
        String(args.url), script, devices.desktop, 60, auth
      );
      let data: any = null;
      for (const artifact of artifacts) {
        if (artifact.name === "data.json") {
          try { data = JSON.parse(artifact.buffer.toString("utf8")); } catch {}
        }
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ job_id, data }, null, 2) }]
      };
    }

    // ── riddle_map ──
    if (name === "riddle_map") {
      const auth = extractAuth(args);
      const mapOpts: string[] = [];
      if (args.max_pages != null) mapOpts.push(`max_pages: ${args.max_pages}`);
      if (args.include_patterns) mapOpts.push(`include_patterns: ${JSON.stringify(args.include_patterns)}`);
      if (args.exclude_patterns) mapOpts.push(`exclude_patterns: ${JSON.stringify(args.exclude_patterns)}`);
      const optsStr = mapOpts.length > 0 ? `{ ${mapOpts.join(", ")} }` : "";
      const script = `return await map(${optsStr});`;
      const { job_id, artifacts } = await client.runScriptSync(
        String(args.url), script, devices.desktop, 120, auth
      );
      let urls: any = null;
      for (const artifact of artifacts) {
        if (artifact.name === "urls.json") {
          try { urls = JSON.parse(artifact.buffer.toString("utf8")); } catch {}
        }
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ job_id, urls }, null, 2) }]
      };
    }

    // ── riddle_crawl ──
    if (name === "riddle_crawl") {
      const auth = extractAuth(args);
      const crawlOpts: string[] = [];
      if (args.max_pages != null) crawlOpts.push(`max_pages: ${args.max_pages}`);
      if (args.format) crawlOpts.push(`format: '${args.format}'`);
      if (args.js_rendering) crawlOpts.push("js_rendering: true");
      if (args.include_patterns) crawlOpts.push(`include_patterns: ${JSON.stringify(args.include_patterns)}`);
      if (args.exclude_patterns) crawlOpts.push(`exclude_patterns: ${JSON.stringify(args.exclude_patterns)}`);
      const optsStr = crawlOpts.length > 0 ? `{ ${crawlOpts.join(", ")} }` : "";
      const script = `return await crawl(${optsStr});`;
      const { job_id, artifacts } = await client.runScriptSync(
        String(args.url), script, devices.desktop, 300, auth
      );
      const savedPaths: string[] = [];
      let metadata: any = null;
      for (const artifact of artifacts) {
        if (artifact.name === "crawl-result.json") {
          try { metadata = JSON.parse(artifact.buffer.toString("utf8")); } catch {}
        }
        if (artifact.name && (artifact.name.startsWith("dataset.") || artifact.name === "sitemap.json")) {
          const ext = artifact.name.split(".").pop() || "json";
          const path = saveToTmp(artifact.buffer, artifact.name.replace(/\.[^.]+$/, ""), ext);
          savedPaths.push(path);
        }
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ job_id, metadata, files: savedPaths }, null, 2) }]
      };
    }

    // ── riddle_visual_diff ──
    if (name === "riddle_visual_diff") {
      const auth = extractAuth(args);
      const vdOpts: string[] = [];
      vdOpts.push(`url_before: '${args.url_before}'`);
      vdOpts.push(`url_after: '${args.url_after}'`);
      if (args.viewport_width || args.viewport_height) {
        vdOpts.push(`viewport: { width: ${args.viewport_width || 1280}, height: ${args.viewport_height || 720} }`);
      }
      if (args.full_page === false) vdOpts.push("full_page: false");
      if (args.threshold != null) vdOpts.push(`threshold: ${args.threshold}`);
      if (args.selector) vdOpts.push(`selector: '${args.selector}'`);
      if (args.delay_ms) vdOpts.push(`delay_ms: ${args.delay_ms}`);
      const optsStr = `{ ${vdOpts.join(", ")} }`;
      const script = `return await visualDiff(${optsStr});`;
      const { job_id, artifacts } = await client.runScriptSync(
        String(args.url_before), script, devices.desktop, 60, auth
      );
      let diffData: any = null;
      const savedPaths: string[] = [];
      for (const artifact of artifacts) {
        if (artifact.name === "visual-diff.json") {
          try { diffData = JSON.parse(artifact.buffer.toString("utf8")); } catch {}
        }
        if (artifact.name && artifact.name.endsWith(".png")) {
          const path = saveToTmp(artifact.buffer, artifact.name.replace(".png", ""), "png");
          savedPaths.push(path);
        }
      }
      return {
        content: [
          { type: "text", text: JSON.stringify({ job_id, ...diffData, images: savedPaths }, null, 2) }]
      };
    }

    // ── riddle_preview ──
    if (name === "riddle_preview") {
      // This tool requires file upload to the Riddle API
      // For MCP context, we pass the directory path and let the API handle it
      const payload: Record<string, unknown> = {
        type: "preview",
        directory: args.directory,
        framework: args.framework || "spa"
      };

      const response = await client.postRun(payload);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Preview deploy failed: ${response.status}: ${text}`);
      }
      const result = await response.json();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }

    // ── riddle_server_preview ──
    if (name === "riddle_server_preview") {
      const auth = extractAuth(args);
      const payload: Record<string, unknown> = {
        type: "server_preview",
        directory: args.directory,
        image: args.image,
        command: args.command,
        port: args.port || 3000,
        path: args.path || "/",
        env: args.env,
        timeout: args.timeout || 120,
        readiness_path: args.readiness_path,
        readiness_timeout: args.readiness_timeout,
        script: args.script,
        wait_for_selector: args.wait_for_selector,
        navigation_timeout: args.navigation_timeout,
        color_scheme: args.color_scheme,
        viewport: args.viewport,
        exclude: args.exclude
      };

      // Merge auth
      if (auth) {
        if (auth.localStorage) payload.localStorage = auth.localStorage;
        if (auth.cookies) payload.cookies = auth.cookies;
        if (auth.headers) payload.headers = auth.headers;
        if (auth.stealth) payload.stealth = true;
      }

      // Remove undefined values
      for (const key of Object.keys(payload)) {
        if (payload[key] === undefined) delete payload[key];
      }

      const response = await client.postRun(payload);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Server preview failed: ${response.status}: ${text}`);
      }
      const result = await response.json();

      // If we got a job_id, wait for it
      if (result.job_id) {
        await client.waitForJob(result.job_id);
        const artifactsResp = await client.getArtifacts(result.job_id);
        const savedPaths: string[] = [];
        for (const artifact of artifactsResp.artifacts || []) {
          if (artifact.url && artifact.name?.endsWith(".png")) {
            const buffer = await client.downloadArtifact(artifact.url);
            const path = saveToTmp(buffer, artifact.name.replace(".png", ""));
            savedPaths.push(path);
          }
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ ...result, screenshots: savedPaths }, null, 2)
            }
          ]
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }

    // ── riddle_build_preview ──
    if (name === "riddle_build_preview") {
      const auth = extractAuth(args);
      const payload: Record<string, unknown> = {
        type: "build_preview",
        directory: args.directory,
        command: args.command,
        port: args.port || 3000,
        path: args.path || "/",
        build_args: args.build_args,
        keep_image_minutes: args.keep_image_minutes ?? 30,
        timeout: args.timeout || 180,
        audit: args.audit,
        env: args.env,
        script: args.script,
        wait_for_selector: args.wait_for_selector,
        navigation_timeout: args.navigation_timeout,
        color_scheme: args.color_scheme,
        viewport: args.viewport,
        exclude: args.exclude
      };

      if (auth) {
        if (auth.localStorage) payload.localStorage = auth.localStorage;
        if (auth.cookies) payload.cookies = auth.cookies;
        if (auth.headers) payload.headers = auth.headers;
        if (auth.stealth) payload.stealth = true;
      }

      for (const key of Object.keys(payload)) {
        if (payload[key] === undefined) delete payload[key];
      }

      const response = await client.postRun(payload);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Build preview failed: ${response.status}: ${text}`);
      }
      const result = await response.json();

      if (result.job_id) {
        await client.waitForJob(result.job_id, 90, 2000); // longer wait for builds
        const artifactsResp = await client.getArtifacts(result.job_id);
        const savedPaths: string[] = [];
        for (const artifact of artifactsResp.artifacts || []) {
          if (artifact.url && artifact.name?.endsWith(".png")) {
            const buffer = await client.downloadArtifact(artifact.url);
            const path = saveToTmp(buffer, artifact.name.replace(".png", ""));
            savedPaths.push(path);
          }
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ ...result, screenshots: savedPaths }, null, 2)
            }
          ]
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Riddle MCP server running");
}

main().catch(console.error);
