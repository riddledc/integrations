#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { writeFileSync } from "fs";

const DEFAULT_GATEWAY_URL = "https://api.riddledc.com";
const RIDDLE_API = process.env.RIDDLE_MCP_GATEWAY_URL || DEFAULT_GATEWAY_URL;

function saveToTmp(buffer: Buffer, name: string): string {
  const path = `/tmp/${name}.png`;
  writeFileSync(path, buffer);
  return path;
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
      body: JSON.stringify({ url, viewport })
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
      description: "Take a screenshot of a URL using the Riddle API. Returns base64-encoded PNG image.",
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
      description: "Screenshot multiple URLs. Returns array of base64 images.",
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
      description: "Run a Playwright script on a page (async). Returns job_id to check status later.",
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
        "Run a Playwright script, wait for completion, and return all artifacts. Includes console logs and network HAR. Full sync automation - one call does everything.",
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
        "Simple automation: load URL, click a selector, take screenshot. Good for testing button clicks, game starts, etc. Uses force-click by default to handle animated buttons.",
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
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "riddle_screenshot") {
      const viewport = args.device
        ? devices[args.device as keyof typeof devices]
        : { width: args.width || 1280, height: args.height || 720 };

      const base64 = await client.screenshotSync(args.url, viewport);

      return {
        content: [
          {
            type: "image",
            data: base64,
            mimeType: "image/png"
          }
        ]
      };
    }

    if (name === "riddle_batch_screenshot") {
      const viewport = args.device ? devices[args.device as keyof typeof devices] : devices.desktop;
      const results: Array<{ url: string; success: boolean; image?: string; error?: string }> = [];

      for (const url of args.urls) {
        try {
          const base64 = await client.screenshotSync(url, viewport);
          results.push({ url, success: true, image: base64 });
        } catch (error: any) {
          results.push({ url, success: false, error: error.message });
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              results.map((result) => ({
                url: result.url,
                success: result.success,
                error: result.error
              })),
              null,
              2
            )
          },
          ...results
            .filter((result) => result.success)
            .map((result) => ({
              type: "image",
              data: result.image,
              mimeType: "image/png"
            }))
        ]
      };
    }

    if (name === "riddle_run_script") {
      const viewport = { width: args.width || 1280, height: args.height || 720 };
      const result = await client.runScript(args.url, args.script, viewport);

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }

    if (name === "riddle_get_job") {
      const job = await client.getJob(args.job_id);
      const artifacts = await client.getArtifacts(args.job_id);

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
      const viewport = args.device ? devices[args.device as keyof typeof devices] : devices.desktop;

      let script = args.script;
      const forceClicks = args.force_clicks !== false;
      if (forceClicks) {
        script = script.replace(
          /\.click\(\s*(['"`])([^'"`]+)\1\s*\)(?!\s*;?\s*\/\/\s*no-force)/g,
          ".click($1$2$1, { force: true })"
        );
      }

      const { job_id, artifacts, consoleLogs, networkHar } = await client.runScriptSync(
        args.url,
        script,
        viewport,
        args.timeout_sec || 60
      );

      const images: Array<{ type: "image"; data: string; mimeType: string }> = [];
      const savedPaths: string[] = [];

      for (const artifact of artifacts) {
        if (artifact.type === "image") {
          const base64 = artifact.buffer.toString("base64");
          images.push({ type: "image", data: base64, mimeType: "image/png" });
          const path = saveToTmp(artifact.buffer, artifact.name?.replace(".png", "") || "artifact");
          savedPaths.push(path);
        }
      }

      let consoleOutput: any = null;
      if (consoleLogs?.entries) {
        consoleOutput = {
          summary: consoleLogs.summary,
          logs: consoleLogs.entries.log?.slice(-20) || [],
          errors: consoleLogs.entries.error || [],
          warns: consoleLogs.entries.warn || []
        };
      }

      let networkSummary: any = null;
      if (networkHar?.log?.entries) {
        const entries = networkHar.log.entries;
        networkSummary = {
          total_requests: entries.length,
          failed: entries.filter((entry: any) => entry.response?.status >= 400).length,
          requests: entries.slice(-10).map((entry: any) => ({
            url: entry.request?.url?.substring(0, 80),
            status: entry.response?.status,
            time: entry.time
          }))
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                job_id,
                saved_to: savedPaths,
                console: consoleOutput,
                network: networkSummary
              },
              null,
              2
            )
          },
          ...images
        ]
      };
    }

    if (name === "riddle_click_and_screenshot") {
      const viewport = args.device ? devices[args.device as keyof typeof devices] : devices.desktop;
      const waitMs = args.wait_ms || 1000;
      const forceClick = args.force !== false;

      const script = `
        await page.waitForLoadState('networkidle');
        await page.click('${args.click.replace(/'/g, "\\'")}', { force: ${forceClick} });
        await page.waitForTimeout(${waitMs});
        await page.screenshot({ path: 'after-click.png', fullPage: false });
      `;

      const { job_id, artifacts } = await client.runScriptSync(args.url, script, viewport, 30);

      const images: Array<{ type: "image"; data: string; mimeType: string }> = [];
      for (const artifact of artifacts) {
        if (artifact.type === "image") {
          const base64 = artifact.buffer.toString("base64");
          images.push({ type: "image", data: base64, mimeType: "image/png" });
          saveToTmp(artifact.buffer, "click-result");
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ job_id, clicked: args.click }, null, 2)
          },
          ...images
        ]
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
