/**
 * Smoke test — validates the handler works without the full CLI/lease harness.
 * Run: node test/smoke.js
 */
const { handleTask } = require("../index");

async function main() {
  let passed = 0;
  let failed = 0;

  async function test(name, task, check) {
    try {
      const result = await handleTask(task);
      check(result);
      console.log(`PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`FAIL: ${name} — ${err.message}`);
      failed++;
    }
  }

  function assert(cond, msg) {
    if (!cond) throw new Error(msg);
  }

  // Test 1: scrape a known page
  await test(
    "scrape httpbin.org/html",
    {
      type: "web_to_dataset",
      action: "scrape",
      io: { url: "https://httpbin.org/html" },
    },
    (r) => {
      assert(r.success, `Expected success, got error: ${r.error}`);
      assert(r.data.content_text.length > 0, "Expected non-empty content");
      assert(r.data.title, "Expected a title");
    }
  );

  // Test 2: map a small site
  await test(
    "map httpbin.org (max 5 pages)",
    {
      type: "web_to_dataset",
      action: "map",
      io: { url: "https://httpbin.org", max_pages: 5 },
    },
    (r) => {
      assert(r.success, `Expected success, got error: ${r.error}`);
      assert(r.data.total_urls > 0, "Expected at least 1 URL");
    }
  );

  // Test 3: invalid URL
  await test(
    "bad URL returns error",
    {
      type: "web_to_dataset",
      action: "scrape",
      io: { url: "not-a-url" },
    },
    (r) => {
      assert(!r.success, "Expected failure for bad URL");
      assert(r.error.includes("Invalid URL"), `Expected 'Invalid URL' error, got: ${r.error}`);
    }
  );

  // Test 4: unknown action
  await test(
    "unknown action returns error",
    {
      type: "web_to_dataset",
      action: "nonexistent",
      io: { url: "https://example.com" },
    },
    (r) => {
      assert(!r.success, "Expected failure for unknown action");
    }
  );

  // Test 5: legacy dashed task type is still accepted as an alias
  await test(
    "legacy web-to-dataset type is accepted for compatibility",
    {
      type: "web-to-dataset",
      action: "scrape",
      io: { url: "https://httpbin.org/html" },
    },
    (r) => {
      assert(r.success, `Expected success, got error: ${r.error}`);
      assert(r.data.content_text.length > 0, "Expected non-empty content");
      assert(r.data.title, "Expected a title");
    }
  );

  // Test 6: wrong task type
  await test(
    "wrong task type returns error",
    {
      type: "wrong-type",
      action: "scrape",
      io: { url: "https://example.com" },
    },
    (r) => {
      assert(!r.success, "Expected failure for wrong type");
    }
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
