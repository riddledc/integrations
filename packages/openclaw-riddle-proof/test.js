import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import register, {
  RIDDLE_PROOF_CHANGE_TOOL_NAME,
  RIDDLE_PROOF_STATUS_TOOL_NAME,
  createCodexExecAgentAdapter,
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

const adapterWorkdir = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-adapter-"));
const codexCalls = [];
const adapter = createCodexExecAgentAdapter({}, async (request) => {
  codexCalls.push(request);
  assert.equal(request.purpose, "implementation");
  assert.equal(request.workdir, adapterWorkdir);
  assert.ok(request.prompt.includes("Implement the requested code change"));
  assert.ok(JSON.stringify(request.schema).includes("changed_files"));
  writeFileSync(path.join(request.workdir, "feature.txt"), "changed\n");
  return {
    ok: true,
    json: {
      summary: "Changed the fixture.",
      implementation_notes: "Created a focused fixture diff.",
      changed_files: ["feature.txt"],
      tests_run: ["fixture"],
      blockers: [],
    },
  };
});
const adapterResult = await adapter.implementChange({
  request: { repo: "riddledc/example", change_request: "Change the fixture." },
  state: { run_id: "rp_adapter", events: [] },
  engineResult: { state_path: "/tmp/riddle-engine-state.json", checkpoint: "implement_required" },
  fullRiddleState: { after_worktree: adapterWorkdir },
  checkpoint: "implement_required",
  workdir: adapterWorkdir,
});
assert.equal(adapterResult.ok, true);
assert.equal(adapterResult.summary, "Changed the fixture.");
assert.deepEqual(adapterResult.changedFiles, ["feature.txt"]);
assert.equal(codexCalls.length, 1);

const blockedAdapter = createCodexExecAgentAdapter({}, async () => ({
  ok: true,
  json: {
    summary: "Blocked by missing project context.",
    implementation_notes: "",
    changed_files: ["feature.txt"],
    tests_run: [],
    blockers: ["Missing project context"],
  },
}));
const blockedAdapterResult = await blockedAdapter.implementChange({
  request: { repo: "riddledc/example", change_request: "Change the fixture." },
  state: { run_id: "rp_adapter_blocked", events: [] },
  engineResult: { state_path: "/tmp/riddle-engine-state.json", checkpoint: "implement_required" },
  fullRiddleState: { after_worktree: adapterWorkdir },
  checkpoint: "implement_required",
  workdir: adapterWorkdir,
});
assert.equal(blockedAdapterResult.ok, false);
assert.equal(blockedAdapterResult.blocker?.code, "codex_implementation_blocked");

const engineFixture = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-engine-"));
const engineWorkdir = path.join(engineFixture, "after");
mkdirSync(engineWorkdir, { recursive: true });
execFileSync("git", ["init"], { cwd: engineWorkdir, stdio: "ignore" });
const engineStatePath = path.join(engineFixture, "riddle-state.json");
writeFileSync(engineStatePath, JSON.stringify({
  after_worktree: engineWorkdir,
  branch: "agent/openclaw-wrapper-test",
}, null, 2));
const engineCalls = [];
const wrapperAgentCalls = [];
const engineModeResult = await runOpenClawRiddleProof(
  {
    ...params,
    dry_run: false,
    ship_after_verify: false,
    ship_mode: "none",
    harness_state_path: path.join(engineFixture, "wrapper-state.json"),
    state_path: engineStatePath,
  },
  {
    executionMode: "engine",
    defaultShipMode: "none",
    engine: {
      async execute(engineParams) {
        engineCalls.push(engineParams);
        if (engineParams.implementation_notes) {
          return {
            ok: true,
            state_path: engineStatePath,
            checkpoint: "verify_ship_ready",
            summary: "Proof is ready for review.",
            shipGate: { ok: true },
          };
        }
        return {
          ok: false,
          state_path: engineStatePath,
          checkpoint: "implement_changes_missing",
          summary: "Implementation changes are required.",
        };
      },
    },
    agent: {
      async assessRecon() {
        throw new Error("recon should not run in this fixture");
      },
      async authorProofPacket() {
        throw new Error("author should not run in this fixture");
      },
      async implementChange(context) {
        wrapperAgentCalls.push(context.workdir);
        writeFileSync(path.join(context.workdir, "feature.txt"), "changed\n");
        return {
          ok: true,
          summary: "Changed the after worktree.",
          diffDetected: true,
          changedFiles: ["feature.txt"],
          implementationNotes: "Created a focused fixture diff.",
        };
      },
      async assessProof() {
        throw new Error("proof assessment should not run in this fixture");
      },
    },
  },
);
assert.equal(engineModeResult.status, "ready_to_ship");
assert.equal(engineModeResult.ok, true);
assert.equal(engineModeResult.worktree_path, engineWorkdir);
assert.equal(engineModeResult.branch, "agent/openclaw-wrapper-test");
assert.deepEqual(wrapperAgentCalls, [engineWorkdir]);
assert.equal(engineCalls.length, 2);

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
