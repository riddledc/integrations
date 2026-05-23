const { handleTask } = require("../index");

async function main() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  async function run(name, task, expected) {
    try {
      const result = await handleTask(task);
      expected(result);
      console.log(`PASS: ${name}`);
      passed += 1;
    } catch (error) {
      console.error(`FAIL: ${name} — ${error.message}`);
      failed += 1;
    }
  }

  await run(
    "missing URL fails validation",
    { type: "playwright_basic", action: "screenshot", io: {} },
    (result) => {
      assert(result.success === false, "expected validation failure");
      assert(result.error === "Missing task.io.url", `unexpected error: ${result.error}`);
    },
  );

  await run(
    "wrong task type fails",
    { type: "wrong-type", action: "screenshot", io: { url: "https://example.com" } },
    (result) => {
      assert(result.success === false, "expected validation failure");
      assert(result.error.startsWith("Unknown task type"), `unexpected error: ${result.error}`);
    },
  );

  await run(
    "unsupported action fails",
    { type: "playwright_basic", action: "bogus", io: { url: "https://example.com" } },
    (result) => {
      assert(result.success === false, "expected validation failure");
      assert(result.error.includes("Unknown action"), `unexpected error: ${result.error}`);
    },
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
