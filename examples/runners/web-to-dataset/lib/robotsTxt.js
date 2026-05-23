const fs = require("fs");
const path = require("path");
const robotsParser = require("robots-parser");

const CACHE_DIR = process.env.ROBOTS_CACHE_DIR || "/tmp/robots-cache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function getRobots(origin) {
  const host = new URL(origin).hostname;
  const cacheFile = path.join(CACHE_DIR, `${host}.txt`);
  const metaFile = path.join(CACHE_DIR, `${host}.meta.json`);

  try {
    if (fs.existsSync(metaFile)) {
      const meta = JSON.parse(fs.readFileSync(metaFile, "utf-8"));
      if (Date.now() - meta.fetchedAt < CACHE_TTL_MS && fs.existsSync(cacheFile)) {
        const content = fs.readFileSync(cacheFile, "utf-8");
        return robotsParser(`${origin}/robots.txt`, content);
      }
    }
  } catch {
    // cache miss
  }

  try {
    const res = await fetch(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "OpenClaw-Bot/1.0 (+https://openclaw.com/bot)" },
    });

    if (!res.ok) return null;

    const content = await res.text();

    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFile, content);
    fs.writeFileSync(metaFile, JSON.stringify({ fetchedAt: Date.now() }));

    return robotsParser(`${origin}/robots.txt`, content);
  } catch {
    return null;
  }
}

async function isAllowed(url, userAgent = "OpenClaw-Bot") {
  try {
    const origin = new URL(url).origin;
    const robots = await getRobots(origin);
    if (!robots) return true;
    return robots.isAllowed(url, userAgent) !== false;
  } catch {
    return true;
  }
}

async function getCrawlDelay(origin, userAgent = "OpenClaw-Bot") {
  try {
    const robots = await getRobots(origin);
    if (!robots) return null;
    return robots.getCrawlDelay(userAgent) || null;
  } catch {
    return null;
  }
}

module.exports = { getRobots, isAllowed, getCrawlDelay };
