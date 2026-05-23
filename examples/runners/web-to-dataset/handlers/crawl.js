const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { CheerioCrawler, PlaywrightCrawler, Sitemap, Configuration, RequestQueue } = require("crawlee");
const { extractContent, estimateTokens } = require("../lib/extractor");
const { convertFormat, uploadToS3, uploadStringToS3, formatExt } = require("../lib/output");
const { logger } = require("../lib/logger");

Configuration.getGlobalConfig().set("persistStorage", false);

/**
 * Handle a full domain crawl task.
 */
async function handleCrawl(io, options = {}) {
  const {
    url,
    max_pages = 100,
    format = "jsonl",
    js_rendering = false,
    include_patterns,
    exclude_patterns,
    extract_metadata = true,
    respect_robots = true,
  } = io;

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { success: false, data: null, error: `Invalid URL: ${url}` };
  }

  const jobId = uuidv4();
  const tmpDir = `/tmp/crawl-${jobId}`;
  fs.mkdirSync(tmpDir, { recursive: true });

  const jsonlPath = path.join(tmpDir, "dataset.jsonl");
  const writeStream = fs.createWriteStream(jsonlPath);

  let pagesCrawled = 0;
  let pagesSkipped = 0;
  let pagesFailed = 0;
  let totalTokens = 0;
  const crawledUrls = [];
  const startTime = Date.now();

  const includeGlobs = include_patterns
    ? include_patterns.map((p) => `${parsedUrl.origin}${p}`)
    : [`${parsedUrl.origin}/**`];
  const excludeGlobs = exclude_patterns
    ? exclude_patterns.map((p) => `${parsedUrl.origin}${p}`)
    : [];

  const requestQueue = await RequestQueue.open(`crawl-${jobId}`);

  const crawlerOptions = {
    requestQueue,
    maxRequestsPerCrawl: max_pages,
    maxRequestsPerMinute: 12,
    maxConcurrency: js_rendering ? 3 : 10,
    requestHandlerTimeoutSecs: 30,
    maxRequestRetries: 2,
    useSessionPool: true,
    additionalMimeTypes: ["application/xml", "text/xml"],

    async requestHandler(context) {
      const { request, enqueueLinks } = context;
      let html;

      if (js_rendering) {
        const { page } = context;
        try {
          await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
        } catch {
          // continue with whatever loaded
        }
        html = await page.content();
      } else {
        html = context.body;
      }

      if (!html || typeof html !== "string" || html.length < 50) {
        pagesSkipped++;
        return;
      }

      const parsed = extractContent(html, request.url);

      if (parsed.wordCount < 10) {
        pagesSkipped++;
        return;
      }

      const row = {
        url: request.url,
        title: parsed.title,
        description: parsed.description,
        content_markdown: parsed.markdown,
        content_text: parsed.text,
        ...(extract_metadata
          ? {
              headings: parsed.headings,
              links: parsed.links,
              word_count: parsed.wordCount,
            }
          : {}),
        crawled_at: new Date().toISOString(),
        status_code: request.loadedUrl ? 200 : request.statusCode || 200,
        depth: request.userData?.depth || 0,
      };

      writeStream.write(JSON.stringify(row) + "\n");
      totalTokens += estimateTokens(parsed.text);
      pagesCrawled++;
      crawledUrls.push(request.url);

      await enqueueLinks({
        strategy: "same-domain",
        globs: includeGlobs,
        exclude: excludeGlobs,
        transformRequestFunction(req) {
          req.userData = { depth: (request.userData?.depth || 0) + 1 };
          return req;
        },
      });
    },

    async failedRequestHandler({ request }, error) {
      pagesFailed++;
      logger.warn("Request failed", {
        url: request.url,
        error: error?.message || "unknown error",
        jobId,
      });
    },
  };

  if (respect_robots) {
    crawlerOptions.respectRobotsTxtFile = true;
  }

  let crawler;
  if (js_rendering) {
    crawler = new PlaywrightCrawler({
      ...crawlerOptions,
      headless: true,
      launchContext: {
        launchOptions: {
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        },
      },
    });
  } else {
    crawler = new CheerioCrawler(crawlerOptions);
  }

  const seedUrls = [url];
  try {
    const sitemap = await Sitemap.load(`${parsedUrl.origin}/sitemap.xml`);
    if (sitemap.urls && sitemap.urls.length > 0) {
      seedUrls.push(...sitemap.urls.slice(0, max_pages));
    }
  } catch {
    // No sitemap
  }

  await crawler.addRequests(
    [...new Set(seedUrls)].map((u) => ({ url: u, userData: { depth: 0 } }))
  );

  logger.info("Crawl started", { jobId, url, max_pages, js_rendering, format });

  try {
    await crawler.run();
  } catch (err) {
    logger.error("Crawler error", { jobId, error: err.message });
  }

  await new Promise((resolve) => {
    writeStream.end(resolve);
  });

  const elapsed = Date.now() - startTime;

  if (pagesCrawled === 0) {
    cleanup(tmpDir);
    return {
      success: false,
      data: null,
      error: `Crawl failed: 0 pages extracted from ${url}. ${pagesFailed} requests failed, ${pagesSkipped} skipped.`,
    };
  }

  let outputPath;
  try {
    outputPath = await convertFormat(jsonlPath, format, tmpDir);
  } catch (err) {
    cleanup(tmpDir);
    return {
      success: false,
      data: null,
      error: `Format conversion failed: ${err.message}`,
    };
  }

  let datasetUrl, sitemapUrl;
  try {
    const ext = formatExt(format);
    datasetUrl = await uploadToS3(
      outputPath,
      `datasets/${jobId}/dataset.${ext}`
    );
    sitemapUrl = await uploadStringToS3(
      JSON.stringify(crawledUrls, null, 2),
      `datasets/${jobId}/sitemap.json`
    );
  } catch (err) {
    logger.error("S3 upload failed", { jobId, error: err.message });
    datasetUrl = outputPath;
    sitemapUrl = null;
  }

  if (datasetUrl.startsWith("s3://")) {
    cleanup(tmpDir);
  }

  logger.info("Crawl complete", {
    jobId,
    pages_crawled: pagesCrawled,
    pages_skipped: pagesSkipped,
    pages_failed: pagesFailed,
    total_tokens: totalTokens,
    crawl_time_ms: elapsed,
  });

  return {
    success: true,
    data: {
      dataset_url: datasetUrl,
      sitemap_url: sitemapUrl,
      pages_crawled: pagesCrawled,
      pages_skipped: pagesSkipped,
      pages_failed: pagesFailed,
      total_tokens: totalTokens,
      crawl_time_ms: elapsed,
      format,
    },
  };
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

module.exports = { handleCrawl };
