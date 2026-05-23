const path = require("node:path");
const fs = require("node:fs");
const { logger } = require("./lib/logger");

const DEFAULT_TIMEOUT_MS = 120000;

async function runScreenshot(task, artifactDir) {
  if (!task?.io?.url) return { success: false, data: null, error: "Missing task.io.url" };

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (error) {
    return {
      success: false,
      data: null,
      error: `Playwright dependency missing: ${(error && error.message) || String(error)}`,
    };
  }

  const parsedUrl = new URL(task.io.url);
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return { success: false, data: null, error: "Only http/https URLs are supported" };
  }

  const timeoutMs = Number(task.options?.timeout_ms || DEFAULT_TIMEOUT_MS);
  const viewport = task.options?.viewport || { width: 1280, height: 720 };
  const screenshotName = task.options?.screenshot_name || "screenshot.png";
  const screenshotPath = path.join(artifactDir || process.cwd(), task.options?.output_dir || "screenshots", screenshotName);

  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    await page.goto(task.io.url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const title = await page.title();
    const finalUrl = page.url();
    await page.close();
    return {
      success: true,
      data: {
        action: "screenshot",
        title,
        final_url: finalUrl,
        screenshot_path: path.relative(artifactDir || process.cwd(), screenshotPath),
        viewport,
      },
    };
  } finally {
    await browser.close();
  }
}

const ACTIONS = {
  screenshot: runScreenshot,
};

async function handleTask(task, artifactDir) {
  if (!task || typeof task !== "object") {
    return { success: false, data: null, error: "Invalid task: expected an object" };
  }
  if (task.type !== "playwright_basic") {
    return { success: false, data: null, error: `Unknown task type: ${task.type}` };
  }
  if (!task.action || !ACTIONS[task.action]) {
    return {
      success: false,
      data: null,
      error: `Unknown action: ${task.action}. Supported: ${Object.keys(ACTIONS).join(", ")}`,
    };
  }
  if (!task.io || typeof task.io !== "object") {
    return { success: false, data: null, error: "Missing task.io" };
  }

  const timeoutMs = Number(task.options?.timeout_ms || DEFAULT_TIMEOUT_MS);
  logger.info("Task received", { action: task.action, url: task.io.url, timeoutMs });

  try {
    return await ACTIONS[task.action](task, artifactDir);
  } catch (error) {
    logger.error("Task failed", { action: task.action, error: error.message });
    return {
      success: false,
      data: null,
      error: `Handler error: ${error.message}`,
    };
  }
}

module.exports = { handleTask };
