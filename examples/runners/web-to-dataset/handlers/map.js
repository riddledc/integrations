const { v4: uuidv4 } = require("uuid");
const { CheerioCrawler, Sitemap, Configuration, RequestQueue } = require("crawlee");
const { logger } = require("../lib/logger");

Configuration.getGlobalConfig().set("persistStorage", false);

/**
 * Handle a URL discovery (map) task.
 * Discovers all reachable URLs on a domain without extracting content.
 */
async function handleMap(io, options = {}) {
  const {
    url,
    max_pages = 500,
    include_patterns,
    exclude_patterns,
    respect_robots = true,
  } = io;

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { success: false, data: null, error: `Invalid URL: ${url}` };
  }

  const startTime = Date.now();
  const discoveredUrls = new Set();

  const includeGlobs = include_patterns
    ? include_patterns.map((p) => `${parsedUrl.origin}${p}`)
    : [`${parsedUrl.origin}/**`];
  const excludeGlobs = exclude_patterns
    ? exclude_patterns.map((p) => `${parsedUrl.origin}${p}`)
    : [];

  const jobId = uuidv4();
  const requestQueue = await RequestQueue.open(`map-${jobId}`);

  const crawler = new CheerioCrawler({
    requestQueue,
    maxRequestsPerCrawl: max_pages,
    maxRequestsPerMinute: 30,
    maxConcurrency: 20,
    requestHandlerTimeoutSecs: 15,
    maxRequestRetries: 1,
    respectRobotsTxtFile: respect_robots,

    async requestHandler({ request, enqueueLinks }) {
      discoveredUrls.add(request.url);

      await enqueueLinks({
        strategy: "same-domain",
        globs: includeGlobs,
        exclude: excludeGlobs,
      });
    },

    async failedRequestHandler({ request }) {
      discoveredUrls.add(request.url);
    },
  });

  const seedUrls = [url];
  try {
    const sitemap = await Sitemap.load(`${parsedUrl.origin}/sitemap.xml`);
    if (sitemap.urls && sitemap.urls.length > 0) {
      seedUrls.push(...sitemap.urls.slice(0, max_pages));
    }
  } catch {
    // no sitemap
  }

  await crawler.addRequests(
    [...new Set(seedUrls)].map((u) => ({ url: u }))
  );

  logger.info("Map started", { jobId, url, max_pages });

  try {
    await crawler.run();
  } catch (err) {
    logger.error("Map crawler error", { jobId, error: err.message });
  }

  const elapsed = Date.now() - startTime;
  const urls = [...discoveredUrls].sort();

  logger.info("Map complete", { jobId, total_urls: urls.length, crawl_time_ms: elapsed });

  return {
    success: true,
    data: {
      urls,
      total_urls: urls.length,
      domain: parsedUrl.hostname,
      crawl_time_ms: elapsed,
    },
  };
}

module.exports = { handleMap };
