const cheerio = require("cheerio");
const TurndownService = require("turndown");

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

turndown.remove(["script", "style", "noscript", "iframe"]);

turndown.addRule("pre", {
  filter: "pre",
  replacement(content, node) {
    const lang = node.querySelector("code")?.className?.match(/language-(\w+)/)?.[1] || "";
    const code = node.textContent.trim();
    return `\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
  },
});

/**
 * Extract structured content from HTML.
 */
function extractContent(html, url) {
  const $ = cheerio.load(html);

  $("script, style, noscript, iframe, svg, nav, footer, header").remove();
  $('[role="navigation"], [role="banner"], [role="contentinfo"]').remove();
  $(".cookie-banner, .cookie-consent, #cookie-notice").remove();
  $(".ad, .ads, .advertisement, [class*='sidebar']").remove();

  const title =
    $("title").first().text().trim() ||
    $('meta[property="og:title"]').attr("content") ||
    $("h1").first().text().trim() ||
    "";

  const description =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    "";

  const mainEl =
    $("main").length ? $("main") :
    $("article").length ? $("article") :
    $('[role="main"]').length ? $('[role="main"]') :
    $("#content").length ? $("#content") :
    $(".content").length ? $(".content") :
    $("body");

  const contentHtml = mainEl.html() || "";
  const markdown = turndown.turndown(contentHtml).trim();
  const text = mainEl.text().replace(/\s+/g, " ").trim();

  const headings = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const t = $(el).text().trim();
    if (t) headings.push(t);
  });

  let internalCount = 0;
  let externalCount = 0;
  try {
    const origin = new URL(url).origin;
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
      try {
        const resolved = new URL(href, url);
        if (resolved.origin === origin) internalCount++;
        else externalCount++;
      } catch {
        // malformed URL
      }
    });
  } catch {
    // url itself is malformed
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;

  return {
    title,
    description,
    markdown,
    text,
    headings,
    links: { internal: internalCount, external: externalCount },
    wordCount,
  };
}

function estimateTokens(text) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(words / 0.75);
}

module.exports = { extractContent, estimateTokens };
