import assert from "node:assert/strict";
import register, {
  RIDDLE_PROOF_CHANGE_TOOL_NAME,
  RIDDLE_PROOF_STATUS_TOOL_NAME,
  createOpenClawRiddleProofResult,
  runOpenClawRiddleProof,
} from "./dist/index.js";

const params = {
  repo: "riddledc/example",
  branch: "riddle-proof-demo",
  change_request: "Make the checkout confirmation easier to read",
  verification_mode: "visual",
  assertions_json: "{\"must_show_confirmation\":true}",
  discord_channel: "000000000000000000",
  discord_thread_id: "111111111111111111",
  discord_message_id: "222222222222222222",
  discord_source_url: "https://discord.com/channels/000000000000000000/111111111111111111/222222222222222222",
  ship_after_verify: true,
  state_path: "/tmp/riddle-engine-state.json",
  harness_state_path: "/tmp/riddle-wrapper-state.json",
  max_iterations: 3,
  auto_approve: true,
  dry_run: true,
};

const result = createOpenClawRiddleProofResult(params);
assert.equal(result.ok, false);
assert.equal(result.status, "blocked");
assert.equal(result.blocker?.code, "execution_adapter_not_configured");
assert.deepEqual(result.blocker?.details?.required_adapters, [
  "preflight",
  "setup",
  "implementation",
  "proof",
  "judge",
  "ship",
  "notification",
]);
assert.equal(result.raw?.request?.repo, "riddledc/example");
assert.equal(result.raw?.request?.ship_mode, "ship");
assert.equal(result.raw?.request?.engine_state_path, "/tmp/riddle-engine-state.json");
assert.equal(result.raw?.request?.harness_state_path, "/tmp/riddle-wrapper-state.json");
assert.equal(result.raw?.request?.max_iterations, 3);
assert.equal(result.raw?.request?.auto_approve, true);
assert.equal(result.raw?.request?.dry_run, true);
assert.deepEqual(result.raw?.request?.assertions, { must_show_confirmation: true });
assert.equal(result.raw?.request?.integration_context?.source, "discord");
assert.equal(result.event_count, 1);

const runtimeResult = await runOpenClawRiddleProof(params, { executionMode: "disabled" });
assert.equal(runtimeResult.status, "blocked");
assert.equal(runtimeResult.blocker?.code, "execution_adapter_not_configured");

const registered = [];
register({
  registerTool(tool, options) {
    registered.push({ tool, options });
  },
});

assert.equal(registered.length, 2);
const changeTool = registered.find((entry) => entry.tool.name === RIDDLE_PROOF_CHANGE_TOOL_NAME);
const statusTool = registered.find((entry) => entry.tool.name === RIDDLE_PROOF_STATUS_TOOL_NAME);
assert.ok(changeTool);
assert.ok(statusTool);
assert.equal(changeTool.options.optional, true);
assert.equal(statusTool.options.optional, true);

const executed = await changeTool.tool.execute("test-call", params);
assert.equal(executed.content[0].type, "text");
const parsed = JSON.parse(executed.content[0].text);
assert.equal(parsed.status, "blocked");
assert.equal(parsed.raw.request.integration_context.metadata.tool, "proofed_change_run");

const statusExecuted = await statusTool.tool.execute("test-status", { state_path: "/tmp/does-not-exist-riddle-proof-state.json" });
const statusParsed = JSON.parse(statusExecuted.content[0].text);
assert.equal(statusParsed.status, "not_found");

console.log(JSON.stringify({ ok: true }));
