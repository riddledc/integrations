const { handleCrawl } = require("./handlers/crawl");
const { handleScrape } = require("./handlers/scrape");
const { handleMap } = require("./handlers/map");
const { logger } = require("./lib/logger");

const HANDLERS = {
  crawl: handleCrawl,
  scrape: handleScrape,
  map: handleMap,
};

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const CANONICAL_TASK_TYPE = "web_to_dataset";
const LEGACY_TASK_TYPES = new Set(["web-to-dataset"]);

/**
 * Main task handler. Receives a task object from SQS and returns a result.
 *
 * @param {{ type: string, action: string, io: any, options?: any }} task
 * @returns {Promise<{ success: boolean, data: any, error?: string }>}
 */
async function handleTask(task) {
  if (!task || typeof task !== "object") {
    return { success: false, data: null, error: "Invalid task: expected an object" };
  }
  if (task.type !== CANONICAL_TASK_TYPE && !LEGACY_TASK_TYPES.has(task.type)) {
    return { success: false, data: null, error: `Unknown task type: ${task.type}` };
  }
  if (!task.action || !HANDLERS[task.action]) {
    return {
      success: false,
      data: null,
      error: `Unknown action: ${task.action}. Supported: ${Object.keys(HANDLERS).join(", ")}`,
    };
  }
  if (!task.io || typeof task.io !== "object") {
    return { success: false, data: null, error: "Missing task.io" };
  }
  if (!task.io.url) {
    return { success: false, data: null, error: "Missing task.io.url" };
  }

  const handler = HANDLERS[task.action];
  const timeoutMs = task.options?.timeout_ms || DEFAULT_TIMEOUT_MS;

  logger.info("Task received", { action: task.action, url: task.io.url, timeoutMs });

  try {
    const result = await Promise.race([
      handler(task.io, task.options || {}),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Task timed out")), timeoutMs)
      ),
    ]);
    logger.info("Task completed", { action: task.action, success: result.success });
    return result;
  } catch (err) {
    logger.error("Task failed", { action: task.action, error: err.message });
    return {
      success: false,
      data: null,
      error: `Handler error: ${err.message}`,
    };
  }
}

module.exports = { handleTask };
