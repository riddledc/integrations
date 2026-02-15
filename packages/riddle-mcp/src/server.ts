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

class RiddleClient {
  private token?: string;

  constructor() {
    this.token = process.env.RIDDLE_AUTH_TOKEN || process.env.RIDDLE_API_KEY;
    if (!this.token) {
      console.error("Warning: RIDDLE_AUTH_TOKEN or RIDDLE_API_KEY not set");
    }
  }

  async screenshotSync(url: string, viewport: Record<string, unknown>) {
    const response = await fetch(`${RIDDLE_API}/v1/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token ?? ""}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url, options: { viewport } })
    });

    if (!response.ok) {
      if (response.status === 408) {
        const data = await response.json().catch(() => null);
        const jobId = data?.job_id;
        if (!jobId) {
          throw new Error(`API error: ${response.status}`);
        }

        await this.waitForJob(jobId);
        const artifacts = await this.getArtifacts(jobId);
        const png = artifacts.artifacts?.find((a: { name?: string }) => a.name?.endsWith(".png"));
        if (!png?.url) {
          throw new Error("No screenshot artifact found");
        }

        const buffer = await this.downloadArtifact(png.url);
        return Buffer.from(buffer).toString("base64");
      }

      const text = await response.text().catch(() => "");
      throw new Error(`API error: ${response.status}${text ? `: ${text}` : ""}`);
    }

    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString("base64");
  }

  async runScript(url: string, script: string, viewport: Record<string, unknown>) {
    const response = await fetch(`${RIDDLE_API}/v1/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token ?? ""}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url, script, viewport, sync: false })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return response.json();
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
      if (job.status === "completed" || job.status === "complete") {
        return job;
      }
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

  async runScriptSync(url: string, script: string, viewport: Record<string, unknown>, timeoutSec = 60) {
    const response = await fetch(`${RIDDLE_API}/v1/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token ?? ""}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url,
        script,
        viewport,
        sync: false,
        timeout_sec: timeoutSec
      })
    });

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
          try {
            consoleLogs = JSON.parse(buffer.toString("utf8"));
          } catch (error) {
            consoleLogs = null;
          }
        } else if (artifact.name === "network.har") {
          try {
            networkHar = JSON.parse(buffer.toString("utf8"));
          } catch (error) {
            networkHar = null;
          }
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
}

const server = new Server({ name: "riddle-mcp-server", version: "1.0.0" }, { capabilities: { tools: {} } });
const client = new RiddleClient();

const devices = {
  desktop: { width: 1280, height: 720, hasTouch: false },
  ipad: { width: 820, height: 1180, hasTouch: true, isMobile: true },
  iphone: { width: 390, height: 844, hasTouch: true, isMobile: true }
};

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "riddle_screenshot",
      description: "Take a screenshot of a URL using the Riddle API. Saves PNG to /tmp and returns file path.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to screenshot" },
          width: { type: "number", description: "Viewport width (default: 1280)" },
          height: { type: "number", description: "Viewport height (default: 720)" },
          device: {
            type: "string",
            enum: ["desktop", "ipad", "iphone"],
            description: "Device preset (overrides width/height)"
          }
        },
        required: ["url"]
      }
    },
    {
      name: "riddle_batch_screenshot",
      description: "Screenshot multiple URLs. Saves PNGs to /tmp and returns file paths.",
      inputSchema: {
        type: "object",
        properties: {
          urls: { type: "array", items: { type: "string" }, description: "URLs to screenshot" },
          device: { type: "string", enum: ["desktop", "ipad", "iphone"] }
        },
        required: ["urls"]
      }
    },
    {
      name: "riddle_run_script",
      description: "Run a Playwright script on a page (async). Available sandbox helpers: scrape(opts?), map(opts?), crawl(opts?). Returns job_id to check status later.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Starting URL" },
          script: { type: "string", description: "Playwright script (page object available)" },
          width: { type: "number" },
          height: { type: "number" }
        },
        required: ["url", "script"]
      }
    },
    {
      name: "riddle_get_job",
      description: "Get status and artifacts of a Riddle job",
      inputSchema: {
        type: "object",
        properties: {
          job_id: { type: "string", description: "Job ID to check" }
        },
        required: ["job_id"]
      }
    },
    {
      name: "riddle_automate",
      description:
        "Run a Playwright script, wait for completion, and return all artifacts. Available sandbox helpers: saveScreenshot(label), saveJson(name, data), scrape(opts?), map(opts?), crawl(opts?). Saves screenshots, console logs, and network HAR to /tmp files and returns paths.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Starting URL" },
          script: {
            type: "string",
            description:
              "Playwright script. Use 'page' object. Example: await page.click('button'); await page.screenshot({path: 'result.png'});"
          },
          device: { type: "string", enum: ["desktop", "ipad", "iphone"], description: "Device preset" },
          timeout_sec: { type: "number", description: "Max execution time in seconds (default: 60)" },
          force_clicks: {
            type: "boolean",
            description: "Add { force: true } to all click() calls to bypass stability checks on animated elements (default: true)"
          }
        },
        required: ["url", "script"]
      }
    },
    {
      name: "riddle_click_and_screenshot",
      description:
        "Simple automation: load URL, click a selector, take screenshot. Saves PNG to /tmp and returns path. Uses force-click by default to handle animated buttons.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to load" },
          click: { type: "string", description: "CSS selector to click (e.g., 'button.start', '.play-btn')" },
          wait_ms: { type: "number", description: "Wait time after click before screenshot (default: 1000)" },
          device: { type: "string", enum: ["desktop", "ipad", "iphone"] },
          force: { type: "boolean", description: "Force click even on animating elements (default: true)" }
        },
        required: ["url", "click"]
      }
    },
    {
      name: "riddle_scrape",
      description: "Scrape a URL and extract structured content: title, description, markdown, links, headings, word count. Navigates to the URL, then extracts.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to scrape" },
          extract_metadata: { type: "boolean", description: "Extract metadata (default: true)" }
        },
        required: ["url"]
      }
    },
    {
      name: "riddle_map",
      description: "Discover all URLs on a website by crawling from the starting URL. Returns an array of discovered URLs.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Starting URL to map from" },
          max_pages: { type: "number", description: "Max pages to crawl (default: 500, max: 5000)" },
          include_patterns: { type: "array", items: { type: "string" }, description: "URL patterns to include" },
          exclude_patterns: { type: "array", items: { type: "string" }, description: "URL patterns to exclude" }
        },
        required: ["url"]
      }
    },
    {
      name: "riddle_crawl",
      description: "Crawl a website and extract content from each page into a dataset. Returns dataset metadata and saves data artifacts.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Starting URL to crawl" },
          max_pages: { type: "number", description: "Max pages to crawl (default: 100, max: 1000)" },
          format: { type: "string", enum: ["jsonl", "json", "csv", "zip"], description: "Output format (default: jsonl)" },
          js_rendering: { type: "boolean", description: "Use full browser rendering for SPAs" },
          include_patterns: { type: "array", items: { type: "string" }, description: "URL patterns to include" },
          exclude_patterns: { type: "array", items: { type: "string" }, description: "URL patterns to exclude" }
        },
        required: ["url"]
      }
    },
    {
      name: "riddle_visual_diff",
      description: "Visually compare two URLs by screenshotting both and computing a pixel-level diff. Returns change percentage, pixel counts, and diff/before/after image URLs.",
      inputSchema: {
        type: "object",
        properties: {
          url_before: { type: "string", description: "URL to screenshot as the 'before' image" },
          url_after: { type: "string", description: "URL to screenshot as the 'after' image" },
          viewport_width: { type: "number", description: "Viewport width (default: 1280)" },
          viewport_height: { type: "number", description: "Viewport height (default: 720)" },
          full_page: { type: "boolean", description: "Capture full page (default: true)" },
          threshold: { type: "number", description: "Pixel match threshold 0-1 (default: 0.1)" },
          selector: { type: "string", description: "CSS selector to capture instead of full page" },
          delay_ms: { type: "number", description: "Delay after page load before capture (ms)" }
        },
        required: ["url_before", "url_after"]
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  const args = (request.params.arguments ?? {}) as Record<string, any>;

  try {
    if (name === "riddle_screenshot") {
      const device = args.device as keyof typeof devices | undefined;
      const viewport = device ? devices[device] : { width: args.width || 1280, height: args.height || 720 };

      const base64 = await client.screenshotSync(String(args.url), viewport);
      const buffer = Buffer.from(base64, "base64");
      const path = saveToTmp(buffer, "screenshot");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ screenshot: path, url: args.url }, null, 2)
          }
        ]
      };
    }

    if (name === "riddle_batch_screenshot") {
      const device = args.device as keyof typeof devices | undefined;
      const viewport = device ? devices[device] : devices.desktop;
      const results: Array<{ url: string; success: boolean; screenshot?: string; error?: string }> = [];

      const urls = Array.isArray(args.urls) ? args.urls : [];
      for (const url of urls) {
        try {
          const base64 = await client.screenshotSync(String(url), viewport);
          const buffer = Buffer.from(base64, "base64");
          const path = saveToTmp(buffer, `batch-${results.length}`);
          results.push({ url, success: true, screenshot: path });
        } catch (error: any) {
          results.push({ url: String(url), success: false, error: error.message });
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2)
          }
        ]
      };
    }

    if (name === "riddle_run_script") {
      const viewport = { width: args.width || 1280, height: args.height || 720 };
      const result = await client.runScript(String(args.url), String(args.script), viewport);

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }

    if (name === "riddle_get_job") {
      const job = await client.getJob(String(args.job_id));
      const artifacts = await client.getArtifacts(String(args.job_id));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ job, artifacts }, null, 2)
          }
        ]
      };
    }

    if (name === "riddle_automate") {
      const device = args.device as keyof typeof devices | undefined;
      const viewport = device ? devices[device] : devices.desktop;

      let script = String(args.script ?? "");
      const forceClicks = args.force_clicks !== false;
      if (forceClicks) {
        script = script.replace(
          /\.click\(\s*(['"`])([^'"`]+)\1\s*\)(?!\s*;?\s*\/\/\s*no-force)/g,
          ".click($1$2$1, { force: true })"
        );
      }

      const { job_id, artifacts, consoleLogs, networkHar } = await client.runScriptSync(
        String(args.url),
        script,
        viewport,
        args.timeout_sec || 60
      );

      const savedPaths: string[] = [];

      for (const artifact of artifacts) {
        if (artifact.type === "image") {
          const path = saveToTmp(artifact.buffer, artifact.name?.replace(".png", "") || "artifact");
          savedPaths.push(path);
        }
      }

      // Save console logs to file if present
      let consolePath: string | null = null;
      if (consoleLogs?.entries) {
        const consoleData = {
          summary: consoleLogs.summary,
          logs: consoleLogs.entries.log || [],
          errors: consoleLogs.entries.error || [],
          warns: consoleLogs.entries.warn || []
        };
        consolePath = saveToTmp(Buffer.from(JSON.stringify(consoleData, null, 2)), "console", "json");
      }

      // Save HAR to file if present
      let harPath: string | null = null;
      if (networkHar?.log?.entries) {
        harPath = saveToTmp(Buffer.from(JSON.stringify(networkHar, null, 2)), "network", "har");
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                job_id,
                screenshots: savedPaths,
                console: consolePath,
                har: harPath
              },
              null,
              2
            )
          }
        ]
      };
    }

    if (name === "riddle_click_and_screenshot") {
      const device = args.device as keyof typeof devices | undefined;
      const viewport = device ? devices[device] : devices.desktop;
      const waitMs = args.wait_ms || 1000;
      const forceClick = args.force !== false;
      const clickSelector = String(args.click ?? "");

      const script = `
        await page.waitForLoadState('networkidle');
        await page.click('${clickSelector.replace(/'/g, "\\'")}', { force: ${forceClick} });
        await page.waitForTimeout(${waitMs});
        await page.screenshot({ path: 'after-click.png', fullPage: false });
      `;

      const { job_id, artifacts } = await client.runScriptSync(String(args.url), script, viewport, 30);

      let screenshotPath: string | null = null;
      for (const artifact of artifacts) {
        if (artifact.type === "image") {
          screenshotPath = saveToTmp(artifact.buffer, "click-result");
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ job_id, clicked: clickSelector, screenshot: screenshotPath }, null, 2)
          }
        ]
      };
    }

    if (name === "riddle_scrape") {
      const scrapeOpts = args.extract_metadata === false ? "{ extract_metadata: false }" : "";
      const script = `return await scrape(${scrapeOpts});`;
      const { job_id, artifacts } = await client.runScriptSync(
        String(args.url), script, devices.desktop, 60
      );
      // Look for data.json in artifacts
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

    if (name === "riddle_map") {
      const mapOpts: string[] = [];
      if (args.max_pages != null) mapOpts.push(`max_pages: ${args.max_pages}`);
      if (args.include_patterns) mapOpts.push(`include_patterns: ${JSON.stringify(args.include_patterns)}`);
      if (args.exclude_patterns) mapOpts.push(`exclude_patterns: ${JSON.stringify(args.exclude_patterns)}`);
      const optsStr = mapOpts.length > 0 ? `{ ${mapOpts.join(", ")} }` : "";
      const script = `return await map(${optsStr});`;
      const { job_id, artifacts } = await client.runScriptSync(
        String(args.url), script, devices.desktop, 120
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

    if (name === "riddle_crawl") {
      const crawlOpts: string[] = [];
      if (args.max_pages != null) crawlOpts.push(`max_pages: ${args.max_pages}`);
      if (args.format) crawlOpts.push(`format: '${args.format}'`);
      if (args.js_rendering) crawlOpts.push("js_rendering: true");
      if (args.include_patterns) crawlOpts.push(`include_patterns: ${JSON.stringify(args.include_patterns)}`);
      if (args.exclude_patterns) crawlOpts.push(`exclude_patterns: ${JSON.stringify(args.exclude_patterns)}`);
      const optsStr = crawlOpts.length > 0 ? `{ ${crawlOpts.join(", ")} }` : "";
      const script = `return await crawl(${optsStr});`;
      const { job_id, artifacts } = await client.runScriptSync(
        String(args.url), script, devices.desktop, 300
      );
      // Save dataset artifacts to /tmp
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

    if (name === "riddle_visual_diff") {
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
        String(args.url_before), script, devices.desktop, 60
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
        content: [{ type: "text", text: JSON.stringify({ job_id, ...diffData, images: savedPaths }, null, 2) }]
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
