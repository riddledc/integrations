const { extractContent, estimateTokens } = require("../lib/extractor");
const { isAllowed } = require("../lib/robotsTxt");
const { logger } = require("../lib/logger");

/**
 * Handle a single-page scrape task.
 */
async function handleScrape(io, options = {}) {
  const {
    url,
    js_rendering = false,
    extract_metadata = true,
    respect_robots = true,
  } = io;

  try {
    new URL(url);
  } catch {
    return { success: false, data: null, error: `Invalid URL: ${url}` };
  }

  if (respect_robots) {
    const allowed = await isAllowed(url);
    if (!allowed) {
      return {
        success: false,
        data: null,
        error: `URL disallowed by robots.txt: ${url}`,
      };
    }
  }

  let html;
  const startTime = Date.now();

  logger.info("Scrape started", { url, js_rendering });

  if (js_rendering) {
    let browser;
    try {
      const { chromium } = require("playwright");
      browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      html = await page.content();
    } catch (err) {
      return {
        success: false,
        data: null,
        error: `Playwright fetch failed: ${err.message}`,
      };
    } finally {
      if (browser) await browser.close();
    }
  } else {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers: {
          "User-Agent": "OpenClaw-Bot/1.0 (+https://openclaw.com/bot)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (!res.ok) {
        return {
          success: false,
          data: null,
          error: `HTTP ${res.status}: ${res.statusText}`,
        };
      }
      html = await res.text();
    } catch (err) {
      return {
        success: false,
        data: null,
        error: `Fetch failed: ${err.message}`,
      };
    }
  }

  const parsed = extractContent(html, url);
  const elapsed = Date.now() - startTime;

  logger.info("Scrape complete", { url, word_count: parsed.wordCount, scrape_time_ms: elapsed });

  return {
    success: true,
    data: {
      url,
      title: parsed.title,
      description: parsed.description,
      content_markdown: parsed.markdown,
      content_text: parsed.text,
      ...(extract_metadata
        ? {
            headings: parsed.headings,
            links: parsed.links,
            word_count: parsed.wordCount,
            estimated_tokens: estimateTokens(parsed.text),
          }
        : {}),
      scrape_time_ms: elapsed,
    },
  };
}

module.exports = { handleScrape };
