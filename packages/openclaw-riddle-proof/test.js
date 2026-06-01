import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import register, {
  buildOpenClawAgentInvocationPlan,
  buildOpenClawAgentSessionKey,
  RIDDLE_PROOF_CHANGE_TOOL_NAME,
  RIDDLE_PROOF_INSPECT_TOOL_NAME,
  RIDDLE_PROOF_REVIEW_TOOL_NAME,
  RIDDLE_PROOF_STATUS_TOOL_NAME,
  RIDDLE_PROOF_SYNC_TOOL_NAME,
  RIDDLE_PROOF_WAIT_TOOL_NAME,
  createCodexExecAgentAdapter,
  createCodexExecJsonRunner,
  createOpenClawRiddleProofResult,
  classifyOpenClawRiddleProofWake,
  formatOpenClawRiddleProofWakeEvent,
  riddleProofChangeParameters,
  processOpenClawRiddleProofWakeMonitorOnce,
  runOpenClawRiddleProof,
  inspectOpenClawRiddleProof,
  readOpenClawRiddleProofStatus,
  waitOpenClawRiddleProof,
  submitOpenClawRiddleProofReview,
  syncOpenClawRiddleProof,
  createRiddleApiClient,
} from "./dist/index.js";

const openclawRiddleProofPackageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const riddleProofPackageJson = JSON.parse(readFileSync(new URL("../riddle-proof/package.json", import.meta.url), "utf8"));
const openclawPluginManifest = JSON.parse(readFileSync(new URL("./openclaw.plugin.json", import.meta.url), "utf8"));
assert.equal(openclawPluginManifest.capabilities.tools.provides.includes(RIDDLE_PROOF_WAIT_TOOL_NAME), true);
assert.equal(openclawPluginManifest.configSchema.properties.enableWakeMonitor.default, true);
assert.equal(openclawPluginManifest.configSchema.properties.checkpointMode.default, "quiet");
assert.equal(openclawPluginManifest.configSchema.properties.defaultWorkflowMode.default, "background_pr");
assert.equal(
  openclawPluginManifest.capabilities.filesystem.read.includes("/root/.openclaw/npm/node_modules/@riddledc/riddle-proof"),
  true,
);
assert.equal(JSON.stringify(openclawPluginManifest).includes("/root/.openclaw/extensions/openclaw-riddle-proof"), false);
assert.equal(typeof createRiddleApiClient, "function");
assert.match(riddleProofChangeParameters.properties.capture_script.description, /Playwright JavaScript/);
assert.doesNotMatch(riddleProofChangeParameters.properties.capture_script.description, /or instructions/);

const params = {
  repo: "riddledc/example",
  branch: "riddle-proof-demo",
  change_request: "Make the checkout confirmation easier to read",
  verification_mode: "visual",
  assertions_json: "{\"must_show_confirmation\":true}",
  resume_session: "{\"version\":\"riddle-proof.visual-session.v1\",\"session_id\":\"visual-session-demo\",\"fingerprint\":\"abc123\"}",
  target_image_url: "https://cdn.example.com/spec.png",
  target_image_hash: "sha256:spec",
  viewport_matrix_json: "[{\"name\":\"phone\",\"width\":390,\"height\":844}]",
  deterministic_setup_json: "{\"seed\":\"checkout-visual-v1\"}",
  discord_channel: "000000000000000000",
  discord_thread_id: "111111111111111111",
  discord_message_id: "222222222222222222",
  discord_source_url: "https://discord.com/channels/000000000000000000/111111111111111111/222222222222222222",
  ship_after_verify: true,
  state_path: "/tmp/riddle-engine-state.json",
  harness_state_path: "/tmp/riddle-wrapper-state.json",
  auth_localStorage_json: "{\"session\":\"local\"}",
  auth_cookies_json: "[{\"name\":\"session\",\"value\":\"cookie\"}]",
  auth_headers_json: "{\"Authorization\":\"Bearer token\"}",
  max_iterations: 3,
  auto_approve: true,
  leave_draft: true,
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
assert.equal(result.raw?.request?.auth_localStorage_json, "{\"session\":\"local\"}");
assert.equal(result.raw?.request?.auth_cookies_json, "[{\"name\":\"session\",\"value\":\"cookie\"}]");
assert.equal(result.raw?.request?.auth_headers_json, "{\"Authorization\":\"Bearer token\"}");
assert.equal(result.raw?.request?.max_iterations, 3);
assert.equal(result.raw?.request?.auto_approve, true);
assert.equal(result.raw?.request?.leave_draft, true);
assert.equal(result.raw?.request?.dry_run, true);
assert.deepEqual(result.raw?.request?.assertions, { must_show_confirmation: true });
assert.equal(result.raw?.request?.resume_session, "{\"version\":\"riddle-proof.visual-session.v1\",\"session_id\":\"visual-session-demo\",\"fingerprint\":\"abc123\"}");
assert.equal(result.raw?.request?.target_image_url, "https://cdn.example.com/spec.png");
assert.equal(result.raw?.request?.target_image_hash, "sha256:spec");
assert.deepEqual(result.raw?.request?.viewport_matrix, [{ name: "phone", width: 390, height: 844 }]);
assert.deepEqual(result.raw?.request?.deterministic_setup, { seed: "checkout-visual-v1" });
assert.equal(result.raw?.request?.integration_context?.source, "discord");
assert.equal(result.event_count, 1);

const invalidReferenceResult = createOpenClawRiddleProofResult({
  ...params,
  reference: "use the public sequencer route",
});
assert.equal(invalidReferenceResult.raw?.request?.reference, undefined);
assert.equal(
  invalidReferenceResult.raw?.request?.integration_context?.metadata?.reference_input_ignored,
  "use the public sequencer route",
);

const validReferenceResult = createOpenClawRiddleProofResult({
  ...params,
  reference: "both",
});
assert.equal(validReferenceResult.raw?.request?.reference, "both");
assert.equal(validReferenceResult.raw?.request?.integration_context?.metadata?.reference_input_ignored, undefined);

const terminalOnlyResult = createOpenClawRiddleProofResult({
  ...params,
  report_mode: "terminal_only",
  wait_for_terminal: true,
});
assert.equal(terminalOnlyResult.raw?.request?.integration_context?.metadata?.report_mode, "terminal_only");
assert.equal(terminalOnlyResult.raw?.request?.integration_context?.metadata?.wait_for_terminal, true);

const manualCheckpointModeResult = createOpenClawRiddleProofResult({
  ...params,
  checkpoint_mode: "manual",
});
assert.equal(manualCheckpointModeResult.raw?.request?.integration_context?.metadata?.checkpoint_mode, "manual");

assert.equal(buildOpenClawAgentSessionKey("main", "fresh-123"), "agent:main:fresh-123");
const cliPlan = buildOpenClawAgentInvocationPlan({
  agentId: "main",
  sessionId: "fresh-123",
  message: "pong",
});
assert.equal(cliPlan.routingMode, "agent_session_id");
assert.equal(cliPlan.command, "openclaw");
assert.deepEqual(cliPlan.args.slice(0, 9), [
  "agent",
  "--agent",
  "main",
  "--local",
  "--json",
  "--session-id",
  "fresh-123",
  "--thinking",
  "minimal",
]);
assert.equal(cliPlan.sessionKey, "agent:main:fresh-123");

const gatewayPlan = buildOpenClawAgentInvocationPlan(
  {
    agentId: "main",
    sessionId: "fresh-456",
    message: "pong",
    timeoutSeconds: 45,
  },
  "gateway_session_key",
);
assert.equal(gatewayPlan.routingMode, "gateway_session_key");
assert.equal(gatewayPlan.command, "openclaw");
assert.deepEqual(gatewayPlan.args.slice(0, 4), [
  "gateway",
  "call",
  "agent",
  "--params",
]);
assert.match(gatewayPlan.args[4], /"sessionKey":"agent:main:fresh-456"/);
assert.deepEqual(gatewayPlan.args.slice(5), [
  "--expect-final",
  "--timeout",
  "45000",
  "--json",
]);
assert.equal(gatewayPlan.sessionKey, "agent:main:fresh-456");

const runtimeResult = await runOpenClawRiddleProof(params, { executionMode: "disabled" });
assert.equal(runtimeResult.status, "blocked");
assert.equal(runtimeResult.blocker?.code, "execution_adapter_not_configured");

const adapterWorkdir = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-adapter-"));
execFileSync("git", ["init", "-b", "main"], { cwd: adapterWorkdir, stdio: "ignore" });
execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: adapterWorkdir, stdio: "ignore" });
execFileSync("git", ["config", "user.name", "OpenClaw Riddle Proof Test"], { cwd: adapterWorkdir, stdio: "ignore" });
writeFileSync(path.join(adapterWorkdir, "baseline.txt"), "base\n");
execFileSync("git", ["add", "baseline.txt"], { cwd: adapterWorkdir, stdio: "ignore" });
execFileSync("git", ["commit", "-m", "initial"], { cwd: adapterWorkdir, stdio: "ignore" });
const codexCalls = [];
const adapter = createCodexExecAgentAdapter({}, async (request) => {
  codexCalls.push(request);
  assert.equal(request.purpose, "implementation");
  assert.equal(request.workdir, adapterWorkdir);
  assert.ok(request.prompt.includes("Implement the requested code change"));
  assert.ok(request.prompt.includes("git status --short"));
  assert.ok(request.prompt.includes("git diff --name-only"));
  assert.ok(JSON.stringify(request.schema).includes("changed_files"));
  writeFileSync(path.join(request.workdir, "baseline.txt"), "changed\n");
  return {
    ok: true,
    json: {
      summary: "Changed the fixture.",
      implementation_notes: "Created a focused fixture diff.",
      changed_files: ["baseline.txt"],
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
assert.deepEqual(adapterResult.changedFiles, ["baseline.txt"]);
assert.equal(codexCalls.length, 1);

const retryWorkdir = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-adapter-retry-"));
execFileSync("git", ["init", "-b", "main"], { cwd: retryWorkdir, stdio: "ignore" });
execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: retryWorkdir, stdio: "ignore" });
execFileSync("git", ["config", "user.name", "OpenClaw Riddle Proof Test"], { cwd: retryWorkdir, stdio: "ignore" });
writeFileSync(path.join(retryWorkdir, "baseline.txt"), "base\n");
execFileSync("git", ["add", "baseline.txt"], { cwd: retryWorkdir, stdio: "ignore" });
execFileSync("git", ["commit", "-m", "initial"], { cwd: retryWorkdir, stdio: "ignore" });
const retryCalls = [];
const retryingAdapter = createCodexExecAgentAdapter({}, async (request) => {
  retryCalls.push(request);
  if (request.purpose === "implementation") {
    mkdirSync(path.join(request.workdir, ".codex"), { recursive: true });
    writeFileSync(path.join(request.workdir, ".codex", "session.json"), "{}\n");
    return {
      ok: true,
      json: {
        summary: "Thought through the change but did not leave a diff yet.",
        implementation_notes: "Only tool metadata was written.",
        changed_files: [".codex/session.json"],
        tests_run: [],
        blockers: [],
      },
    };
  }
  assert.equal(request.purpose, "implementation retry");
  assert.ok(request.prompt.includes("previous implementation attempt returned without a detectable git diff"));
  writeFileSync(path.join(request.workdir, "retry.txt"), "changed\n");
  return {
    ok: true,
    json: {
      summary: "Created the retry fixture diff.",
      implementation_notes: "Retried after confirming the first attempt left no diff.",
      changed_files: ["retry.txt"],
      tests_run: ["git status --short", "git diff --name-only"],
      blockers: [],
    },
  };
});
const retryAdapterResult = await retryingAdapter.implementChange({
  request: { repo: "riddledc/example", change_request: "Change the fixture after a clean first pass." },
  state: { run_id: "rp_adapter_retry", events: [] },
  engineResult: { state_path: "/tmp/riddle-engine-state.json", checkpoint: "implement_required" },
  fullRiddleState: { after_worktree: retryWorkdir },
  checkpoint: "implement_required",
  workdir: retryWorkdir,
});
assert.equal(retryAdapterResult.ok, true);
assert.equal(retryAdapterResult.summary, "Created the retry fixture diff.");
assert.deepEqual(retryAdapterResult.changedFiles, ["retry.txt"]);
assert.equal(retryAdapterResult.details.retry_attempted, true);
assert.equal(retryAdapterResult.details.attempt_count, 2);
assert.equal(retryCalls.length, 2);

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

const authorPrompts = [];
const authorAdapter = createCodexExecAgentAdapter({}, async (request) => {
  authorPrompts.push(request);
  assert.equal(request.purpose, "proof packet authoring");
  assert.ok(request.prompt.includes("Do not call Playwright page.* APIs inside page.evaluate"));
  assert.ok(request.prompt.includes("pass exactly one serializable argument object"));
  assert.ok(request.prompt.includes("await page.waitForFunction(fn, undefined, { timeout: 60000 })"));
  assert.ok(request.prompt.includes("window.__riddleProofEvidence"));
  return {
    ok: true,
    json: {
      proof_plan: "Collect structured audio metrics from the page proof API.",
      capture_script: "const evidence = await page.evaluate(() => ({ ok: true }));",
      baseline_understanding_used: {
        reference: "before",
        target_route: "/games/drum-sequencer",
        before_evidence_url: "https://example.com/before.png",
        visible_before_state: "Sequencer loaded.",
        relevant_elements: ["Neon Step Sequencer"],
        requested_change: "Adjust an EQ band.",
        proof_focus: "Structured audio metrics.",
        stop_condition: "Evidence contains the expected EQ value.",
        quality_risks: [],
      },
      refined_inputs: {
        server_path: null,
        wait_for_selector: null,
        reference: null,
      },
      rationale: ["Use structured evidence for audio proof."],
      confidence: "medium",
      summary: "Authored structured audio proof packet.",
    },
  };
});
const authorAdapterResult = await authorAdapter.authorProofPacket({
  request: { repo: "riddledc/example", change_request: "Adjust an EQ band.", verification_mode: "audio" },
  state: { run_id: "rp_author_prompt", events: [] },
  engineResult: { state_path: "/tmp/riddle-engine-state.json", checkpoint: "author_required" },
  fullRiddleState: { after_worktree: adapterWorkdir },
  checkpoint: "author_required",
  workdir: adapterWorkdir,
});
assert.equal(authorAdapterResult.ok, true);
assert.equal(authorPrompts.length, 1);

const jsonlCodexFixture = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-jsonl-codex-"));
const jsonlCodexCommand = path.join(jsonlCodexFixture, "fake-codex.mjs");
writeFileSync(jsonlCodexCommand, `#!/usr/bin/env node
import { writeFileSync } from "node:fs";

const outputIndex = process.argv.indexOf("--output-last-message");
if (outputIndex < 0 || !process.argv[outputIndex + 1]) {
  process.exit(2);
}

const payload = {
  proof_plan: "Check the generated page against the requested visual target.",
  capture_script: "await saveScreenshot('after-proof');",
  summary: "Authored visual proof packet."
};

writeFileSync(process.argv[outputIndex + 1], [
  JSON.stringify({ type: "thread.started", thread_id: "thread_123" }),
  JSON.stringify({ type: "turn.started" }),
  JSON.stringify(payload)
].join("\\n"));
`);
chmodSync(jsonlCodexCommand, 0o755);
const jsonlCodexRunner = createCodexExecJsonRunner({
  codexCommand: jsonlCodexCommand,
  codexFullAuto: false,
});
const jsonlCodexResult = await jsonlCodexRunner({
  purpose: "proof packet authoring",
  workdir: adapterWorkdir,
  prompt: "Return a proof packet.",
  schema: {
    type: "object",
    required: ["proof_plan", "capture_script", "summary"],
    properties: {
      proof_plan: { type: "string" },
      capture_script: { type: "string" },
      summary: { type: "string" },
    },
  },
});
assert.equal(jsonlCodexResult.ok, true);
assert.equal(jsonlCodexResult.json?.proof_plan, "Check the generated page against the requested visual target.");
assert.equal(jsonlCodexResult.json?.summary, "Authored visual proof packet.");

const stdoutFallbackFixture = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-stdout-codex-"));
const stdoutFallbackCodexCommand = path.join(stdoutFallbackFixture, "fake-codex.mjs");
writeFileSync(stdoutFallbackCodexCommand, `#!/usr/bin/env node
import { writeFileSync } from "node:fs";

const outputIndex = process.argv.indexOf("--output-last-message");
if (outputIndex < 0 || !process.argv[outputIndex + 1]) {
  process.exit(2);
}

writeFileSync(process.argv[outputIndex + 1], JSON.stringify({ type: "turn.started" }));
console.log(JSON.stringify({
  proof_plan: "Check the page after the fallback runner parses stdout.",
  capture_script: "await saveScreenshot('after-proof');",
  summary: "Authored proof packet from stdout."
}));
`);
chmodSync(stdoutFallbackCodexCommand, 0o755);
const stdoutFallbackCodexRunner = createCodexExecJsonRunner({
  codexCommand: stdoutFallbackCodexCommand,
  codexFullAuto: false,
});
const stdoutFallbackCodexResult = await stdoutFallbackCodexRunner({
  purpose: "proof packet authoring",
  workdir: adapterWorkdir,
  prompt: "Return a proof packet.",
  schema: {
    type: "object",
    required: ["proof_plan", "capture_script", "summary"],
    properties: {
      proof_plan: { type: "string" },
      capture_script: { type: "string" },
      summary: { type: "string" },
    },
  },
});
assert.equal(stdoutFallbackCodexResult.ok, true);
assert.equal(stdoutFallbackCodexResult.json?.summary, "Authored proof packet from stdout.");
assert.equal(stdoutFallbackCodexResult.metrics?.parsed_json_source, "stdout");

const engineFixture = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-engine-"));
const engineWorkdir = path.join(engineFixture, "after");
mkdirSync(engineWorkdir, { recursive: true });
execFileSync("git", ["init"], { cwd: engineWorkdir, stdio: "ignore" });
const engineStatePath = path.join(engineFixture, "riddle-state.json");
writeFileSync(engineStatePath, JSON.stringify({
  after_worktree: engineWorkdir,
  branch: "agent/openclaw-wrapper-test",
  runtime_events: [],
}, null, 2));
const engineCalls = [];
const wrapperAgentCalls = [];
const engineModeResult = await runOpenClawRiddleProof(
  {
    ...params,
    dry_run: false,
    run_mode: "blocking",
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
const engineModeState = JSON.parse(readFileSync(path.join(engineFixture, "wrapper-state.json"), "utf-8"));
const engineModeStarted = engineModeState.events.find((event) => event.kind === "engine_harness.started");
assert.equal(engineModeStarted.details.max_iterations, 3);

const legacyMaxFixture = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-legacy-max-"));
const legacyMaxStatePath = path.join(legacyMaxFixture, "riddle-state.json");
const legacyMaxWrapperStatePath = path.join(legacyMaxFixture, "wrapper-state.json");
const legacyMaxParams = {
  ...params,
  run_mode: "blocking",
  dry_run: false,
  ship_after_verify: false,
  ship_mode: "none",
  harness_state_path: legacyMaxWrapperStatePath,
  state_path: legacyMaxStatePath,
};
delete legacyMaxParams.max_iterations;
const legacyMaxResult = await runOpenClawRiddleProof(
  legacyMaxParams,
  {
    executionMode: "engine",
    defaultShipMode: "none",
    defaultMaxIterations: 8,
    engine: {
      async execute() {
        return {
          ok: false,
          state_path: legacyMaxStatePath,
          checkpoint: "setup_blocked",
          summary: "Stop after recording harness defaults.",
        };
      },
    },
  },
);
assert.equal(legacyMaxResult.status, "blocked");
const legacyMaxState = JSON.parse(readFileSync(legacyMaxWrapperStatePath, "utf-8"));
const legacyMaxStarted = legacyMaxState.events.find((event) => event.kind === "engine_harness.started");
assert.equal(legacyMaxStarted.details.max_iterations, 12);

const backgroundFixture = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-background-"));
const backgroundEngineStatePath = path.join(backgroundFixture, "riddle-state.json");
const backgroundWrapperStatePath = path.join(backgroundFixture, "wrapper-state.json");
const backgroundEngineCalls = [];
const backgroundResult = await runOpenClawRiddleProof(
  {
    ...params,
    run_mode: "background",
    workflow_mode: "interactive",
    dry_run: false,
    ship_after_verify: false,
    ship_mode: "none",
    harness_state_path: backgroundWrapperStatePath,
    state_path: backgroundEngineStatePath,
  },
  {
    executionMode: "engine",
    defaultShipMode: "none",
    engine: {
      async execute(engineParams) {
        backgroundEngineCalls.push(engineParams);
        writeFileSync(backgroundEngineStatePath, JSON.stringify({
          branch: "agent/background-proof",
          runtime_events: [
            {
              ts: "2026-04-23T00:00:00.000Z",
              kind: "workflow.phase.started",
              step: "recon",
              phase: "before_capture",
              summary: "Started recon before capture.",
            },
            {
              ts: "2026-04-23T00:00:08.000Z",
              kind: "workflow.phase.finished",
              step: "recon",
              phase: "before_capture",
              summary: "Finished recon before capture.",
              details: { status: "completed" },
            },
            {
              ts: "2026-04-23T00:00:08.000Z",
              kind: "workflow.phase.started",
              step: "verify",
              phase: "build",
              summary: "Started verify build.",
            },
            {
              ts: "2026-04-23T00:00:20.000Z",
              kind: "workflow.phase.finished",
              step: "verify",
              phase: "build",
              summary: "Finished verify build.",
              details: { status: "completed" },
            },
            {
              ts: "2026-04-23T00:00:20.000Z",
              kind: "workflow.phase.started",
              step: "verify",
              phase: "capture",
              summary: "Started verify capture.",
            },
            {
              ts: "2026-04-23T00:00:35.000Z",
              kind: "workflow.phase.finished",
              step: "verify",
              phase: "capture",
              summary: "Finished verify capture.",
              details: { status: "completed" },
            },
          ],
        }, null, 2));
        return {
          ok: true,
          state_path: backgroundEngineStatePath,
          checkpoint: "verify_ship_ready",
          summary: "Background proof is ready for review.",
          shipGate: { ok: true },
        };
      },
    },
  },
  {
    wakeContext: {
      sessionKey: "agent:main:discord-thread-111111111111111111",
      sessionKeySource: "tool_context",
      agentId: "main",
      deliveryContext: {
        channel: "discord",
        to: "channel:111111111111111111",
      },
    },
  },
);
assert.equal(backgroundResult.status, "running");
assert.equal(backgroundResult.raw?.background, true);
assert.equal(backgroundResult.raw?.background_requested, false);
assert.equal(backgroundResult.state_path, backgroundWrapperStatePath);
assert.equal(backgroundResult.raw?.run_mode, "background");
assert.equal(backgroundResult.raw?.run_mode_source, "run_mode_param");
assert.equal(backgroundResult.raw?.run_mode_defaulted, false);
assert.equal(backgroundResult.raw?.monitor_contract?.report_mode, "checkpoint");
assert.equal(backgroundResult.raw?.monitor_contract?.response_gate, "hold_for_engine_substep");
assert.equal(backgroundResult.raw?.monitor_contract?.should_continue_monitoring, true);
assert.equal(backgroundResult.raw?.monitor_contract?.progress_surface, "status_loop");
assert.ok(backgroundResult.raw?.monitor_contract?.preemption_recovery?.includes(RIDDLE_PROOF_STATUS_TOOL_NAME));
assert.ok(backgroundResult.raw?.next_actions?.[0]?.includes(RIDDLE_PROOF_WAIT_TOOL_NAME));
assert.ok(backgroundResult.raw?.next_actions?.[1]?.includes("monitor_should_continue"));
assert.ok(backgroundResult.raw?.next_actions?.[2]?.includes("final inspection snapshots"));
assert.equal(existsSync(backgroundWrapperStatePath), true);
const backgroundWrapperState = JSON.parse(readFileSync(backgroundWrapperStatePath, "utf-8"));
assert.equal(backgroundWrapperState.request.integration_context.metadata.workflow_mode, "interactive");
assert.equal(backgroundWrapperState.request.integration_context.metadata.workflow_mode_source, "workflow_mode_param");

for (let attempt = 0; attempt < 50 && backgroundEngineCalls.length === 0; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
assert.equal(backgroundEngineCalls.length, 1);
let backgroundStatus = readOpenClawRiddleProofStatus(backgroundWrapperStatePath);
for (let attempt = 0; attempt < 50 && backgroundStatus?.status === "running"; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 20));
  backgroundStatus = readOpenClawRiddleProofStatus(backgroundWrapperStatePath);
}
assert.equal(backgroundStatus?.status, "ready_to_ship");
assert.equal(backgroundStatus?.monitor_contract?.report_mode, "checkpoint");
assert.equal(backgroundStatus?.monitor_contract?.response_gate, "release_terminal");
assert.equal(backgroundStatus?.progress_update?.status, "ready_to_ship");
assert.equal(backgroundStatus?.progress_update?.monitor_should_continue, false);
assert.equal(backgroundStatus?.progress_update?.state_path, backgroundWrapperStatePath);
assert.ok(backgroundStatus?.progress_update?.recovery_hint?.includes(RIDDLE_PROOF_STATUS_TOOL_NAME));
const backgroundState = JSON.parse(readFileSync(backgroundWrapperStatePath, "utf-8"));
assert.equal(backgroundState.events[0].kind, "run.background.started");
const monitorRegisteredEvent = backgroundState.events.find((event) => event.kind === "run.oc_wake.monitor_registered");
assert.equal(monitorRegisteredEvent.details.dispatchable, true);
assert.equal(monitorRegisteredEvent.details.wake_context.sessionKey, "agent:main:discord-thread-111111111111111111");
assert.equal(backgroundState.events.some((event) => event.checkpoint === "verify_ship_ready"), true);
assert.equal(backgroundState.events.at(-1).kind, "run.wake.requested");
assert.deepEqual(backgroundState.events[0].details.next_tools, [
  RIDDLE_PROOF_WAIT_TOOL_NAME,
  RIDDLE_PROOF_INSPECT_TOOL_NAME,
  RIDDLE_PROOF_REVIEW_TOOL_NAME,
]);
assert.deepEqual(backgroundState.events.at(-1).details.next_tools, [
  RIDDLE_PROOF_STATUS_TOOL_NAME,
  RIDDLE_PROOF_SYNC_TOOL_NAME,
]);
assert.equal(backgroundState.events.at(-1).details.timing_summary.recon_subphase_durations_ms.before_capture, 8000);
assert.equal(backgroundState.events.at(-1).details.timing_summary.verify_subphase_durations_ms.capture, 15000);
const backgroundWakeClassification = classifyOpenClawRiddleProofWake(backgroundStatus);
assert.equal(backgroundWakeClassification.should_dispatch, true);
assert.equal(backgroundWakeClassification.kind, "ready_to_ship");
const failedWakeDispatchResult = await processOpenClawRiddleProofWakeMonitorOnce(backgroundWrapperStatePath, {
  enqueueSystemEvent() {
    throw new Error("synthetic wake runtime outage");
  },
  requestHeartbeatNow() {
    throw new Error("heartbeat should not be requested after enqueue failure");
  },
});
assert.equal(failedWakeDispatchResult.action, "dispatch_failed");
assert.equal(failedWakeDispatchResult.retryable, true);
assert.equal(failedWakeDispatchResult.failure_count, 1);
assert.match(failedWakeDispatchResult.reason, /synthetic wake runtime outage/);
const wakeDispatches = [];
const wakeHeartbeats = [];
const wakeDispatchResult = await processOpenClawRiddleProofWakeMonitorOnce(backgroundWrapperStatePath, {
  enqueueSystemEvent(text, options) {
    wakeDispatches.push({ text, options });
    return true;
  },
  requestHeartbeatNow(options) {
    wakeHeartbeats.push(options);
  },
});
assert.equal(wakeDispatchResult.action, "dispatched");
assert.equal(wakeDispatchResult.wake_kind, "ready_to_ship");
assert.equal(wakeDispatches.length, 1);
assert.match(wakeDispatches[0].text, /Riddle Proof background run needs action/);
assert.match(wakeDispatches[0].text, new RegExp(backgroundWrapperStatePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.equal(wakeDispatches[0].options.sessionKey, "agent:main:discord-thread-111111111111111111");
assert.equal(wakeHeartbeats[0].sessionKey, "agent:main:discord-thread-111111111111111111");
assert.equal(wakeHeartbeats[0].reason, "hook:riddle-proof");
const duplicateWakeDispatch = await processOpenClawRiddleProofWakeMonitorOnce(backgroundWrapperStatePath, {
  enqueueSystemEvent() {
    throw new Error("duplicate wake should not enqueue");
  },
  requestHeartbeatNow() {
    throw new Error("duplicate wake should not request heartbeat");
  },
});
assert.equal(duplicateWakeDispatch.action, "already_dispatched");
writeFileSync(backgroundEngineStatePath, JSON.stringify({
  branch: "agent/background-proof",
  scratch_cleanup: {
    skipped: "enough_free_space",
    free_bytes: 123456789,
  },
  current_runtime_step: {
    step: "verify",
    action: "run",
    status: "running",
    started_at: new Date(Date.now() - 250).toISOString(),
    phase: "capture",
    phase_status: "running",
    phase_started_at: new Date(Date.now() - 125).toISOString(),
    workflow_file: "riddle-proof-verify.lobster",
  },
  runtime_events: [
    {
      ts: new Date().toISOString(),
      kind: "workflow.step.started",
      step: "verify",
      action: "run",
      summary: "Started verify workflow step.",
    },
  ],
}, null, 2));
const enrichedBackgroundStatus = readOpenClawRiddleProofStatus(backgroundWrapperStatePath);
assert.equal(enrichedBackgroundStatus?.engine_state_path, backgroundEngineStatePath);
assert.equal(enrichedBackgroundStatus?.current_stage, "verify");
assert.equal(enrichedBackgroundStatus?.wrapper_current_stage, "verify");
assert.equal(enrichedBackgroundStatus?.engine_current_stage, "verify");
assert.equal(enrichedBackgroundStatus?.active_substep?.step, "verify");
assert.equal(enrichedBackgroundStatus?.engine_latest_event?.kind, "workflow.step.started");
assert.equal(enrichedBackgroundStatus?.engine_runtime_event_count, 1);
assert.equal(enrichedBackgroundStatus?.scratch_cleanup?.skipped, "enough_free_space");
assert.equal(enrichedBackgroundStatus?.scratch_cleanup_status, "skipped_enough_free_space");
assert.equal(typeof enrichedBackgroundStatus?.substep_elapsed_ms, "number");
assert.equal(typeof enrichedBackgroundStatus?.phase_elapsed_ms, "number");
assert.equal(enrichedBackgroundStatus?.timing_summary?.recon_subphase_durations_ms?.before_capture, 8000);
assert.equal(enrichedBackgroundStatus?.timing_summary?.verify_subphase_durations_ms?.capture, 15000);
assert.equal(enrichedBackgroundStatus?.recommended_poll_after_ms, null);
assert.equal(enrichedBackgroundStatus?.is_terminal, true);
assert.equal(enrichedBackgroundStatus?.monitor_should_continue, false);
assert.equal(enrichedBackgroundStatus?.is_routable_checkpoint, false);
assert.equal(enrichedBackgroundStatus?.checkpoint_classification, "terminal");
assert.equal(enrichedBackgroundStatus?.suggested_next_action, "report_terminal_status");
assert.equal(enrichedBackgroundStatus?.monitor_plan?.preferred_tool, RIDDLE_PROOF_STATUS_TOOL_NAME);
assert.equal(enrichedBackgroundStatus?.monitor_plan?.optional_wait_tool, RIDDLE_PROOF_WAIT_TOOL_NAME);
assert.equal(enrichedBackgroundStatus?.wake_strategy?.signal, "run.wake.requested");
assert.ok(enrichedBackgroundStatus?.wake_strategy?.recommendation?.includes("poll riddle_proof_status"));
writeFileSync(backgroundWrapperStatePath, JSON.stringify({
  ...backgroundState,
  status: "running",
  current_stage: "setup",
  last_checkpoint: "implement_changes_missing",
}, null, 2));
const runningBackgroundStatus = readOpenClawRiddleProofStatus(backgroundWrapperStatePath);
assert.equal(runningBackgroundStatus?.current_stage, "verify");
assert.equal(runningBackgroundStatus?.wrapper_current_stage, "setup");
assert.equal(runningBackgroundStatus?.engine_current_stage, "verify");
assert.equal(runningBackgroundStatus?.recommended_poll_after_ms, 15000);
assert.equal(runningBackgroundStatus?.timing_summary?.recon_subphase_durations_ms?.before_capture, 8000);
assert.equal(runningBackgroundStatus?.timing_summary?.verify_subphase_durations_ms?.capture, 15000);
assert.equal(runningBackgroundStatus?.is_terminal, false);
assert.equal(runningBackgroundStatus?.monitor_should_continue, true);
assert.equal(runningBackgroundStatus?.is_routable_checkpoint, false);
assert.equal(runningBackgroundStatus?.checkpoint_classification, "in_progress");
assert.equal(runningBackgroundStatus?.checkpoint_disposition, "engine_substep_in_progress");
assert.equal(runningBackgroundStatus?.suggested_next_action, "continue_monitoring");
assert.equal(runningBackgroundStatus?.monitor_plan?.preferred_tool, RIDDLE_PROOF_STATUS_TOOL_NAME);
assert.equal(runningBackgroundStatus?.monitor_plan?.optional_wait_tool, RIDDLE_PROOF_WAIT_TOOL_NAME);
const timeoutWait = await waitOpenClawRiddleProof({ state_path: backgroundWrapperStatePath, timeout_ms: 1000 });
assert.equal(timeoutWait.wait_result, "timeout");
assert.ok(timeoutWait.waited_ms >= 1000);
const staleRuntimeAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
writeFileSync(backgroundEngineStatePath, JSON.stringify({
  branch: "agent/background-proof",
  current_runtime_step: {
    step: "recon",
    action: "run",
    status: "running",
    started_at: staleRuntimeAt,
    phase: "prod_capture",
    phase_status: "completed",
    phase_started_at: staleRuntimeAt,
    phase_finished_at: staleRuntimeAt,
    workflow_file: "riddle-proof-recon.lobster",
  },
  runtime_events: [
    {
      ts: staleRuntimeAt,
      kind: "workflow.phase.finished",
      step: "recon",
      phase: "prod_capture",
      summary: "Production recon baseline capture completed.",
    },
  ],
}, null, 2));
const staleBackgroundStatus = readOpenClawRiddleProofStatus(backgroundWrapperStatePath);
assert.equal(staleBackgroundStatus?.runtime_staleness?.stale, true);
assert.equal(staleBackgroundStatus?.monitor_should_continue, false);
assert.equal(staleBackgroundStatus?.checkpoint_classification, "stale");
assert.equal(staleBackgroundStatus?.checkpoint_disposition, "stale_runtime_step");
assert.equal(staleBackgroundStatus?.suggested_next_action, "inspect_stale_run");
assert.equal(staleBackgroundStatus?.monitor_contract?.should_continue_monitoring, false);
assert.equal(staleBackgroundStatus?.monitor_contract?.response_gate, "checkpoint_ok");

const defaultBackgroundFixture = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-default-background-"));
const defaultBackgroundEngineStatePath = path.join(defaultBackgroundFixture, "riddle-state.json");
const defaultBackgroundResult = await runOpenClawRiddleProof(
  {
    ...params,
    dry_run: false,
    ship_after_verify: false,
    ship_mode: "none",
    harness_state_path: path.join(defaultBackgroundFixture, "wrapper-state.json"),
    state_path: defaultBackgroundEngineStatePath,
  },
  {
    executionMode: "engine",
    defaultShipMode: "none",
    engine: {
      async execute() {
        writeFileSync(defaultBackgroundEngineStatePath, JSON.stringify({ branch: "agent/default-background-proof" }, null, 2));
        return {
          ok: true,
          state_path: defaultBackgroundEngineStatePath,
          checkpoint: "verify_ship_ready",
          summary: "Default background proof is ready.",
          shipGate: { ok: true },
        };
      },
    },
  },
);
assert.equal(defaultBackgroundResult.status, "running");
assert.equal(defaultBackgroundResult.raw?.run_mode, "background");
assert.equal(defaultBackgroundResult.raw?.run_mode_source, "wrapper_default");
assert.equal(defaultBackgroundResult.raw?.run_mode_defaulted, true);
assert.equal(defaultBackgroundResult.raw?.background_requested, false);

const reviewFixture = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-review-"));
const reviewStatePath = path.join(reviewFixture, "riddle-state.json");
const reviewWrapperStatePath = path.join(reviewFixture, "wrapper-state.json");
writeFileSync(reviewStatePath, JSON.stringify({
  branch: "agent/review-fixture",
  reference: "before",
  requested_reference: "before",
  server_path: "/games/tic-tac-toe",
  wait_for_selector: "main#game-root, h1",
  before_cdn: "https://example.com/before.png",
  after_cdn: "https://example.com/after.png",
  current_runtime_step: {
    step: "verify",
    action: "run",
    status: "running",
    started_at: "2026-04-23T00:05:00.000Z",
    phase: "capture",
    phase_status: "running",
    phase_started_at: "2026-04-23T00:05:30.000Z",
  },
  runtime_events: [
    {
      ts: "2026-04-23T00:02:00.000Z",
      kind: "workflow.step.started",
      step: "setup",
      action: "run",
      summary: "Started setup workflow step.",
    },
    {
      ts: "2026-04-23T00:02:15.000Z",
      kind: "workflow.phase.started",
      step: "setup",
      phase: "shared_deps",
      summary: "Ensuring shared repository dependencies.",
    },
    {
      ts: "2026-04-23T00:02:45.000Z",
      kind: "workflow.phase.finished",
      step: "setup",
      phase: "shared_deps",
      summary: "Shared dependencies ready.",
      details: { status: "completed" },
    },
    {
      ts: "2026-04-23T00:03:00.000Z",
      kind: "workflow.step.finished",
      step: "setup",
      action: "run",
      summary: "Finished setup workflow step.",
      details: { duration_ms: 60000, status: "completed" },
    },
    {
      ts: "2026-04-23T00:04:00.000Z",
      kind: "workflow.phase.started",
      step: "recon",
      phase: "before_capture",
      summary: "Started recon before capture.",
    },
    {
      ts: "2026-04-23T00:04:12.000Z",
      kind: "workflow.phase.finished",
      step: "recon",
      phase: "before_capture",
      summary: "Finished recon before capture.",
      details: { status: "completed" },
    },
    {
      ts: "2026-04-23T00:05:00.000Z",
      kind: "workflow.step.started",
      step: "verify",
      action: "run",
      summary: "Started verify workflow step.",
    },
    {
      ts: "2026-04-23T00:05:05.000Z",
      kind: "workflow.phase.started",
      step: "verify",
      phase: "capture",
      summary: "Started verify capture phase.",
    },
    {
      ts: "2026-04-23T00:05:25.000Z",
      kind: "workflow.phase.finished",
      step: "verify",
      phase: "capture",
      summary: "Finished verify capture phase.",
      details: { status: "completed" },
    },
  ],
  stage_attempts: {
    recon: { count: 2 },
    verify: { count: 1 },
  },
  scratch_cleanup: {
    skipped: "enough_free_space",
    free_bytes: 987654321,
  },
  capture_hint: {
    source: "hint_cache",
    applied: true,
    applied_fields: ["server_path", "wait_for_selector"],
    matched_tokens: ["tic", "board"],
    selection_reason: "token_overlap_and_mode",
    selected: {
      saved_at: "2026-04-22T23:59:00.000Z",
      verification_mode: "visual",
      server_path: "/games/tic-tac-toe",
      wait_for_selector: "main#game-root, h1",
    },
    fallback_triggered: false,
  },
  capture_hint_saved: {
    status: "saved",
  },
  capture_diagnostics: [
    {
      label: "after",
      tool: "riddle_server_preview",
      captured_at: "2026-04-23T00:05:40.000Z",
      ok: true,
      artifact_summary: {
        outputs: [{ name: "after-proof.png" }],
      },
    },
    {
      label: "after-debug",
      tool: "riddle_server_preview",
      captured_at: "2026-04-23T00:05:41.000Z",
      ok: true,
      details: {
        source: "openclaw-riddle-proof bundled source " + "X".repeat(5000),
      },
    },
  ],
  proof_profile: {
    name: "Tic Tac Toe",
    applied_fields: ["server_path", "wait_for_selector"],
  },
  evidence_bundle: {
    expected_path: "/games/tic-tac-toe",
    artifact_contract: {
      verification_mode: "visual",
      required: {
        baseline_context: true,
        route_semantics: true,
        screenshot: true,
        proof_evidence: false,
      },
      preferred: {
        page_state: true,
        structured_payload: false,
        visual_delta: true,
      },
      optional: {
        console_summary: true,
        json_artifacts: true,
        image_outputs: true,
      },
    },
    artifact_production: {
      output_names: ["after-proof.png", "proof.json"],
      screenshot_names: ["after-proof.png"],
      artifact_json: ["proof.json"],
      artifact_error_names: [],
      image_output_count: 1,
      data_output_count: 1,
      other_output_count: 0,
      console_entries: 2,
      structured_result_keys: ["proof_evidence", "summary"],
      proof_evidence_present: true,
      has_structured_payload: true,
    },
    artifact_usage: {
      required_signals: ["baseline_context", "route_semantics", "screenshot"],
      preferred_signals: ["page_state", "visual_delta"],
      optional_signals: ["console_summary", "json_artifacts", "image_outputs"],
      available_signals: ["baseline_context", "route_semantics", "screenshot", "page_state", "console_summary", "json_artifacts", "image_outputs"],
      missing_required_signals: [],
      capture_quality_signals: ["screenshot", "page_state", "console_summary"],
      supervisor_review_signals: ["recon-baseline", "after-capture", "semantic-context"],
    },
    proof_evidence: { modality: "audio", attack_ms_after: 12, passed: true },
    proof_evidence_sample: "{\"modality\":\"audio\",\"attack_ms_after\":12,\"passed\":true}",
    after: {
      screenshot_url: "https://example.com/after.png",
      proof_evidence: { modality: "audio", attack_ms_after: 12, passed: true },
      proof_evidence_sample: "{\"modality\":\"audio\",\"attack_ms_after\":12,\"passed\":true}",
      visual_delta: { status: "measured", passed: true, changed_pixels: 24000, change_percent: 2.4 },
    },
  },
  proof_assessment_request: {
    expected_path: "/games/tic-tac-toe",
    artifact_contract: {
      verification_mode: "visual",
      required: {
        baseline_context: true,
        route_semantics: true,
        screenshot: true,
        proof_evidence: false,
      },
    },
    artifact_production: {
      image_output_count: 1,
      data_output_count: 1,
      proof_evidence_present: true,
      has_structured_payload: true,
    },
    artifact_usage: {
      missing_required_signals: [],
      supervisor_review_signals: ["recon-baseline", "after-capture", "semantic-context"],
    },
    visual_delta: { status: "measured", passed: true, changed_pixels: 24000, change_percent: 2.4 },
    semantic_context: {
      route: {
        expected_path: "/games/tic-tac-toe",
        after_observed_path: "/games/tic-tac-toe",
      },
      after: {
        headings: ["Tic Tac Toe"],
        buttons: ["Reset Game"],
        visible_text_sample: "Tic Tac Toe Reset Game",
      },
    },
  },
}, null, 2));
const reviewEngineCalls = [];
const reviewDelegate = {
  async assessRecon() {
    throw new Error("recon should not run in proof review fixture");
  },
  async authorProofPacket() {
    throw new Error("author should not run in proof review fixture");
  },
  async implementChange() {
    throw new Error("implement should not run in proof review fixture");
  },
  async assessProof() {
    throw new Error("codex proof assessment should be deferred to main agent");
  },
};
const reviewBlocked = await runOpenClawRiddleProof(
  {
    ...params,
    dry_run: false,
    run_mode: "blocking",
    ship_after_verify: false,
    ship_mode: "none",
    report_mode: "terminal_only",
    wait_for_terminal: true,
    reference: "use the public tic tac toe route",
    harness_state_path: reviewWrapperStatePath,
    state_path: reviewStatePath,
    change_request: "Make Tic Tac Toe board polish visibly stronger",
  },
  {
    executionMode: "engine",
    defaultShipMode: "none",
    proofReviewMode: "main_agent",
    autoReviewShipModeNone: false,
    engine: {
      async execute(engineParams) {
        reviewEngineCalls.push(engineParams);
        return {
          ok: false,
          state_path: reviewStatePath,
          checkpoint: "verify_supervisor_judgment",
          summary: "Proof evidence needs judgment.",
        };
      },
    },
    agent: reviewDelegate,
  },
);
assert.equal(reviewBlocked.status, "awaiting_checkpoint");
assert.equal(reviewBlocked.blocker, undefined);
assert.equal(reviewBlocked.checkpoint_packet?.checkpoint, "verify_supervisor_judgment");
assert.equal(reviewBlocked.checkpoint_packet?.kind, "assess_proof");
assert.equal(reviewBlocked.checkpoint_packet?.stage, "verify");
assert.equal(reviewBlocked.checkpoint_packet?.allowed_decisions?.includes("ready_to_ship"), true);
assert.equal(reviewBlocked.checkpoint_packet?.allowed_decisions?.includes("revise_capture"), true);
assert.equal(reviewBlocked.checkpoint_packet?.artifacts?.some((item) => item.url === "https://example.com/after.png"), true);
assert.equal(reviewBlocked.checkpoint_packet?.evidence_excerpt?.visual_delta_ready, true);
assert.equal(reviewBlocked.checkpoint_packet?.evidence_excerpt?.proof_assessment_request?.semantic_context?.route?.after_observed_path, "/games/tic-tac-toe");

const inspectResult = inspectOpenClawRiddleProof({ state_path: reviewWrapperStatePath });
assert.equal(inspectResult.ok, true);
assert.equal(inspectResult.route_matched, true);
assert.equal(inspectResult.monitor_contract.report_mode, "terminal_only");
assert.equal(inspectResult.monitor_contract.response_gate, "checkpoint_ok");
assert.equal(inspectResult.request_metadata.reference_input_ignored, "use the public tic tac toe route");
assert.equal(inspectResult.request_metadata.effective_reference, "before");
assert.equal(inspectResult.proof_profile_applied, true);
assert.equal(inspectResult.proof_profile?.name, "Tic Tac Toe");
assert.equal(inspectResult.ready_to_ship_candidate, true);
assert.deepEqual(inspectResult.visible_change?.after_buttons, ["Reset Game"]);
assert.equal(inspectResult.structured_evidence?.proof_evidence_present, true);
assert.match(inspectResult.structured_evidence?.proof_evidence_sample, /attack_ms_after/);
assert.equal(inspectResult.structured_evidence?.proof_evidence_has_concerns, false);
assert.equal(inspectResult.scratch_cleanup?.skipped, "enough_free_space");
assert.equal(inspectResult.scratch_cleanup_status, "skipped_enough_free_space");
assert.equal(inspectResult.capture_hint?.server_path, "/games/tic-tac-toe");
assert.equal(inspectResult.capture_hint?.selected_server_path, "/games/tic-tac-toe");
assert.equal(inspectResult.capture_hint?.server_path_applied, true);
assert.equal(inspectResult.capture_hint?.effective_server_path, "/games/tic-tac-toe");
assert.equal(inspectResult.capture_hint?.wait_for_selector_applied, true);
assert.equal(inspectResult.timing_summary?.workflow_step_durations_ms?.setup, 60000);
assert.equal(inspectResult.timing_summary?.workflow_phase_durations_ms?.["setup:shared_deps"], 30000);
assert.equal(inspectResult.timing_summary?.recon_subphase_durations_ms?.before_capture, 12000);
assert.equal(inspectResult.timing_summary?.verify_subphase_durations_ms?.capture, 20000);
assert.equal(inspectResult.timing_summary?.retry_counts?.recon, 1);
assert.equal(inspectResult.timing_summary?.capture_hint?.saved_status, "saved");
assert.equal(inspectResult.artifact_contract?.required?.screenshot, true);
assert.equal(inspectResult.artifact_production?.image_output_count, 1);
assert.equal(inspectResult.artifact_usage?.supervisor_review_signals?.includes("semantic-context"), true);

const playableReviewStatePath = path.join(reviewFixture, "riddle-state-playable-static.json");
const playableWrapperStatePath = path.join(reviewFixture, "wrapper-state-playable-static.json");
const staticPlayabilityEvidence = {
  playability: {
    version: "riddle-proof.playability.v1",
    input_events: [{ type: "keyboard", key: "ArrowRight" }],
    state_delta: { changed: true, changed_keys: ["started"], time_delta_ms: 1200 },
    playfield_delta: { changed_percent: 0.01, changed_pixels: 20, average_delta: 0.02 },
  },
};
writeFileSync(playableReviewStatePath, JSON.stringify({
  branch: "agent/playable-static-fixture",
  after_cdn: "https://example.com/after-playable.png",
  verification_mode: "playable",
  evidence_bundle: {
    expected_path: "/games/luge-run",
    artifact_contract: {
      verification_mode: "playable",
      required: {
        baseline_context: true,
        route_semantics: true,
        screenshot: true,
        proof_evidence: true,
        playability: true,
        visual_delta: true,
      },
    },
    artifact_usage: {
      missing_required_signals: [],
    },
    after: {
      screenshot_url: "https://example.com/after-playable.png",
      supporting_artifacts: {
        proof_evidence_present: true,
      },
      proof_evidence: staticPlayabilityEvidence,
      visual_delta: { status: "measured", passed: true, changed_pixels: 24000, change_percent: 2.4 },
    },
    proof_evidence: staticPlayabilityEvidence,
  },
  proof_assessment_request: {
    expected_path: "/games/luge-run",
    artifact_contract: {
      verification_mode: "playable",
      required: {
        baseline_context: true,
        route_semantics: true,
        screenshot: true,
        proof_evidence: true,
        playability: true,
        visual_delta: true,
      },
    },
    artifact_usage: { missing_required_signals: [] },
    visual_delta: { status: "measured", passed: true, changed_pixels: 24000, change_percent: 2.4 },
    semantic_context: {
      route: {
        expected_path: "/games/luge-run",
        after_observed_path: "/games/luge-run",
      },
      after: {
        headings: ["Luge Run"],
        buttons: ["Start"],
        visible_text_sample: "Luge Run Start",
      },
    },
  },
}, null, 2));
writeFileSync(playableWrapperStatePath, JSON.stringify({
  version: "riddle-proof.run-state.v1",
  run_id: "rp_playable_static",
  status: "blocked",
  created_at: "2026-04-23T00:00:00.000Z",
  updated_at: "2026-04-23T00:00:00.000Z",
  request: {
    repo: "davisdiehl/lilarcade",
    change_request: "Make Luge Run feel playable.",
    engine_state_path: playableReviewStatePath,
    verification_mode: "playable",
  },
  last_checkpoint: "verify_supervisor_judgment",
  blocker: {
    code: "main_agent_proof_review_required",
    checkpoint: "verify_supervisor_judgment",
    message: "Proof evidence needs judgment.",
  },
  iterations: 1,
  events: [],
}, null, 2));
const playableInspect = inspectOpenClawRiddleProof({ state_path: playableWrapperStatePath });
assert.equal(playableInspect.structured_evidence?.playability_required, true);
assert.equal(playableInspect.structured_evidence?.playability_ready, false);
assert.equal(playableInspect.ready_to_ship_candidate, false);
assert.match(playableInspect.hard_blockers?.join("\n") || "", /playability_assessment/);

const queryRouteStatePath = path.join(reviewFixture, "riddle-state-query-route.json");
const queryRouteWrapperStatePath = path.join(reviewFixture, "wrapper-state-query-route.json");
writeFileSync(queryRouteStatePath, JSON.stringify({
  branch: "agent/query-route-fixture",
  before_cdn: "https://example.com/query-before.png",
  prod_cdn: "https://example.com/query-prod.png",
  after_cdn: "https://example.com/query-after.png",
  proof_assessment_request: {
    expected_path: "/games/drum-sequencer?mix=profile&song=monkberry-moon-delight-tab",
    semantic_context: {
      route: {
        expected_path: "/games/drum-sequencer?mix=profile&song=monkberry-moon-delight-tab",
        before_observed_path: "/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile",
        prod_observed_path: "/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile&utm_source=test",
        after_observed_path: "/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile",
      },
      after: {
        headings: ["Neon Step Sequencer"],
        buttons: ["Play All"],
        visible_text_sample: "Neon Step Sequencer Monkberry Moon Delight",
        valid: true,
      },
    },
  },
  evidence_bundle: {
    after: {
      screenshot_url: "https://example.com/query-after.png",
      visual_delta: { status: "unmeasured", passed: null },
    },
  },
}, null, 2));
writeFileSync(queryRouteWrapperStatePath, JSON.stringify({
  version: "riddle-proof.run-state.v1",
  run_id: "rp_query_route_fixture",
  status: "ready_to_ship",
  state_path: queryRouteWrapperStatePath,
  request: {
    repo: "davisdiehl/lilarcade",
    change_request: "Make a tiny sequencer helper-copy change.",
    engine_state_path: queryRouteStatePath,
    verification_mode: "visual",
  },
  events: [],
}, null, 2));
const queryRouteInspect = inspectOpenClawRiddleProof({ state_path: queryRouteWrapperStatePath });
assert.equal(queryRouteInspect.route_matched, true);
assert.equal(queryRouteInspect.ready_to_ship_candidate, false);
assert.equal(queryRouteInspect.visual_delta_ready, false);
assert(queryRouteInspect.hard_blockers[0].includes("visual_delta.status=unmeasured"));

const queryRouteRecoveryWrapperStatePath = path.join(reviewFixture, "wrapper-state-query-route-recovery.json");
const queryRouteRecovery = await runOpenClawRiddleProof(
  {
    ...params,
    dry_run: false,
    run_mode: "blocking",
    ship_after_verify: false,
    ship_mode: "none",
    harness_state_path: queryRouteRecoveryWrapperStatePath,
    state_path: queryRouteStatePath,
    change_request: "Make a tiny sequencer helper-copy change.",
  },
  {
    executionMode: "engine",
    defaultShipMode: "none",
    proofReviewMode: "main_agent",
    autoReviewShipModeNone: false,
    engine: {
      async execute() {
        return {
          ok: false,
          state_path: queryRouteStatePath,
          checkpoint: "verify_supervisor_judgment",
          summary: "Proof evidence needs visual-delta recovery.",
        };
      },
    },
    agent: reviewDelegate,
  },
);
assert.equal(queryRouteRecovery.status, "awaiting_checkpoint");
assert.equal(queryRouteRecovery.checkpoint_packet?.kind, "recover_evidence");
assert.equal(queryRouteRecovery.checkpoint_packet?.evidence_excerpt?.evidence_issue_code, "visual_delta_unmeasured");
assert.equal(queryRouteRecovery.checkpoint_packet?.evidence_excerpt?.visual_delta_ready, false);
assert.equal(queryRouteRecovery.checkpoint_packet?.allowed_decisions?.includes("revise_capture"), true);

const reviewStatus = readOpenClawRiddleProofStatus(reviewWrapperStatePath, { debug: true });
const reviewWakeClassification = classifyOpenClawRiddleProofWake(reviewStatus);
assert.equal(reviewWakeClassification.should_dispatch, true);
assert.equal(reviewWakeClassification.kind, "resume_checkpoint");
assert.deepEqual(reviewWakeClassification.next_tools.slice(0, 2), [
  RIDDLE_PROOF_STATUS_TOOL_NAME,
  RIDDLE_PROOF_REVIEW_TOOL_NAME,
]);
assert.equal(reviewStatus?.request_metadata?.reference_input_ignored, "use the public tic tac toe route");
assert.equal(reviewStatus?.request_metadata?.effective_reference, "before");
assert.equal(reviewStatus?.capture_hint?.server_path, "/games/tic-tac-toe");
assert.equal(reviewStatus?.capture_hint?.selected_server_path, "/games/tic-tac-toe");
assert.equal(reviewStatus?.capture_hint?.server_path_applied, true);
assert.equal(reviewStatus?.capture_hint?.effective_server_path, "/games/tic-tac-toe");
assert.equal(reviewStatus?.timing_summary?.workflow_step_durations_ms?.setup, 60000);
assert.equal(reviewStatus?.timing_summary?.workflow_phase_durations_ms?.["setup:shared_deps"], 30000);
assert.equal(reviewStatus?.timing_summary?.recon_subphase_durations_ms?.before_capture, 12000);
assert.equal(reviewStatus?.timing_summary?.verify_subphase_durations_ms?.capture, 20000);
assert.equal(reviewStatus?.timing_summary?.retry_counts?.recon, 1);
assert.equal(Array.isArray(reviewStatus?.debug?.wrapper_events_recent), true);
assert.equal(Array.isArray(reviewStatus?.debug?.engine_runtime_events_recent), true);
assert.equal(Array.isArray(reviewStatus?.debug?.capture_diagnostics_recent), true);
assert.equal(typeof reviewStatus?.debug?.capture_diagnostics_recent?.at(-1)?.details, "string");
assert(reviewStatus.debug.capture_diagnostics_recent.at(-1).details.length <= 1000);
assert(!JSON.stringify(reviewStatus.debug).includes("X".repeat(1500)));
assert.equal(reviewStatus?.pr_handoff_policy?.state, "proof_checkpoint_required");
assert.equal(reviewStatus?.pr_handoff_policy?.fallback_pr?.allowed, false);
assert.equal(reviewStatus?.proof_artifact_summary?.baseline?.before?.url, "https://example.com/before.png");
assert.equal(reviewStatus?.proof_artifact_summary?.after?.url, "https://example.com/after.png");

const noShipCompleteWrapperStatePath = path.join(reviewFixture, "wrapper-state-no-ship-complete.json");
writeFileSync(noShipCompleteWrapperStatePath, JSON.stringify({
  version: "riddle-proof.run-state.v1",
  run_id: "rp_no_ship_complete",
  status: "ready_to_ship",
  current_stage: "ship",
  last_checkpoint: "verify_ship_ready",
  state_path: noShipCompleteWrapperStatePath,
  request: {
    repo: "davisdiehl/lilarcade",
    change_request: "Make a tiny copy update.",
    engine_state_path: reviewStatePath,
    verification_mode: "visual",
    ship_mode: "none",
  },
  events: [],
}, null, 2));
const noShipCompleteStatus = readOpenClawRiddleProofStatus(noShipCompleteWrapperStatePath);
assert.equal(noShipCompleteStatus?.pr_handoff_policy?.state, "proof_complete_ship_disabled");
assert.equal(noShipCompleteStatus?.pr_handoff_policy?.proof_complete, true);
assert.equal(noShipCompleteStatus?.pr_handoff_policy?.merge_ready, false);
assert.equal(noShipCompleteStatus?.pr_handoff_policy?.normal_pr_allowed, false);
assert.equal(noShipCompleteStatus?.pr_handoff_policy?.fallback_pr?.allowed, false);
assert.match(noShipCompleteStatus?.pr_handoff_policy?.user_facing_summary, /no-ship/);

const blockedSalvageStatePath = path.join(reviewFixture, "riddle-state-blocked-salvage.json");
const blockedSalvageWrapperStatePath = path.join(reviewFixture, "wrapper-state-blocked-salvage.json");
writeFileSync(blockedSalvageStatePath, JSON.stringify({
  branch: "agent/blocked-salvage",
  before_cdn: "https://example.com/blocked-before.png",
  prod_cdn: "https://example.com/blocked-prod.png",
  current_runtime_step: {
    step: "verify",
    action: "run",
    status: "failed",
    started_at: "2026-04-29T11:47:09.000Z",
    phase: "build",
    phase_status: "failed",
    phase_started_at: "2026-04-29T11:47:27.000Z",
  },
  runtime_events: [
    {
      ts: "2026-04-29T11:47:27.000Z",
      kind: "workflow.phase.started",
      step: "verify",
      phase: "build",
      summary: "Started verify build phase.",
    },
    {
      ts: "2026-04-29T11:57:31.000Z",
      kind: "workflow.step.failed",
      step: "verify",
      phase: "build",
      summary: "Verify build timed out.",
      details: { status: "failed", duration_ms: 622133 },
    },
  ],
  evidence_bundle: {
    baseline: {
      before: {
        screenshots: [{ url: "https://example.com/blocked-before.png" }],
      },
      prod: {
        screenshots: [{ url: "https://example.com/blocked-prod.png" }],
      },
    },
    after: {
      supporting_artifacts: {
        preview_url: "https://example.com/blocked-preview.png",
        proof_json: "https://example.com/blocked-proof.json",
      },
    },
  },
}, null, 2));
writeFileSync(blockedSalvageWrapperStatePath, JSON.stringify({
  version: "riddle-proof.run-state.v1",
  run_id: "rp_blocked_salvage",
  status: "blocked",
  current_stage: "implement",
  last_checkpoint: "implement_changes_missing",
  state_path: blockedSalvageWrapperStatePath,
  request: {
    repo: "davisdiehl/lilarcade",
    branch: "blocked-salvage",
    change_request: "Improve a game sprite.",
    engine_state_path: blockedSalvageStatePath,
    verification_mode: "visual",
    ship_mode: "ship",
  },
  blocker: {
    code: "codex_timeout",
    checkpoint: "implement_changes_missing",
    message: "Codex timed out during implementation.",
  },
  events: [
    {
      ts: "2026-04-29T11:44:42.000Z",
      kind: "agent.implementation.started",
      checkpoint: "implement_changes_missing",
      stage: "implement",
      summary: "Implementation agent started.",
    },
    {
      ts: "2026-04-29T11:59:55.000Z",
      kind: "agent.implementation.blocked",
      checkpoint: "implement_changes_missing",
      stage: "implement",
      summary: "Codex timed out during implementation.",
      details: { changed_files: ["src/Games/LugeRun.jsx"] },
    },
  ],
}, null, 2));
const blockedSalvageStatus = readOpenClawRiddleProofStatus(blockedSalvageWrapperStatePath);
assert.equal(blockedSalvageStatus?.pr_handoff_policy?.state, "proof_blocked");
assert.equal(blockedSalvageStatus?.pr_handoff_policy?.normal_pr_allowed, false);
assert.equal(blockedSalvageStatus?.pr_handoff_policy?.fallback_pr?.allowed, true);
assert.equal(blockedSalvageStatus?.pr_handoff_policy?.fallback_pr?.required_state, "draft");
assert.equal(blockedSalvageStatus?.failure_summary?.primary_failure?.source, "engine_runtime");
assert.equal(blockedSalvageStatus?.failure_summary?.primary_failure?.step, "verify");
assert.equal(blockedSalvageStatus?.failure_summary?.layer_mismatch, true);
assert.equal(blockedSalvageStatus?.proof_artifact_summary?.baseline?.before?.url, "https://example.com/blocked-before.png");
assert.equal(blockedSalvageStatus?.proof_artifact_summary?.preview?.url, "https://example.com/blocked-preview.png");
const blockedSalvageWake = classifyOpenClawRiddleProofWake(blockedSalvageStatus);
assert.equal(blockedSalvageWake.should_dispatch, true);
assert.equal(blockedSalvageWake.kind, "blocked");
const blockedSalvageWakeText = formatOpenClawRiddleProofWakeEvent(blockedSalvageWake, blockedSalvageWrapperStatePath);
assert.match(blockedSalvageWakeText, /draft PR marked proof-blocked/);
assert.match(blockedSalvageWakeText, /failure: engine_runtime \| verify \| Verify build timed out/);
assert.match(blockedSalvageWakeText, /before=https:\/\/example.com\/blocked-before.png/);

const authorCheckpointStatePath = path.join(reviewFixture, "riddle-state-author-checkpoint.json");
const authorCheckpointWrapperStatePath = path.join(reviewFixture, "wrapper-state-author-checkpoint.json");
writeFileSync(authorCheckpointStatePath, JSON.stringify({
  branch: "agent/author-checkpoint",
  runtime_events: [],
  stage_decision_request: {
    checkpoint: "author_supervisor_judgment",
    continue_from_checkpoint: true,
    continue_with_stage: "author",
  },
}, null, 2));
writeFileSync(authorCheckpointWrapperStatePath, JSON.stringify({
  version: "riddle-proof.run-state.v1",
  run_id: "rp_author_checkpoint",
  status: "running",
  created_at: "2026-04-23T00:00:00.000Z",
  updated_at: "2026-04-23T00:00:00.000Z",
  request: {
    repo: "riddledc/riddle-site",
    change_request: "Make a tiny homepage copy change.",
    engine_state_path: authorCheckpointStatePath,
    verification_mode: "visual",
  },
  current_stage: "author",
  last_checkpoint: "author_supervisor_judgment",
  iterations: 1,
  events: [],
}, null, 2));
const authorCheckpointStatus = readOpenClawRiddleProofStatus(authorCheckpointWrapperStatePath);
assert.equal(authorCheckpointStatus.monitor_should_continue, true);
assert.equal(authorCheckpointStatus.is_routable_checkpoint, true);
assert.equal(authorCheckpointStatus.checkpoint_classification, "in_progress");
assert.equal(authorCheckpointStatus.suggested_next_action, "continue_monitoring");
assert.equal(authorCheckpointStatus.checkpoint_action, null);
assert.equal(authorCheckpointStatus.monitor_contract.response_gate, "hold_for_engine_substep");
assert.equal(authorCheckpointStatus.monitor_contract.should_continue_monitoring, true);

const blockedAuthorCheckpointWrapperStatePath = path.join(reviewFixture, "wrapper-state-author-checkpoint-blocked.json");
writeFileSync(blockedAuthorCheckpointWrapperStatePath, JSON.stringify({
  version: "riddle-proof.run-state.v1",
  run_id: "rp_author_checkpoint_blocked",
  status: "blocked",
  created_at: "2026-04-23T00:00:00.000Z",
  updated_at: "2026-04-23T00:00:00.000Z",
  request: {
    repo: "riddledc/riddle-site",
    change_request: "Make a tiny homepage copy change.",
    engine_state_path: authorCheckpointStatePath,
    verification_mode: "visual",
  },
  current_stage: "author",
  last_checkpoint: "author_supervisor_judgment",
  iterations: 1,
  events: [],
}, null, 2));
const blockedAuthorCheckpointStatus = readOpenClawRiddleProofStatus(blockedAuthorCheckpointWrapperStatePath);
assert.equal(blockedAuthorCheckpointStatus.monitor_should_continue, false);
assert.equal(blockedAuthorCheckpointStatus.is_routable_checkpoint, true);
assert.equal(blockedAuthorCheckpointStatus.checkpoint_classification, "routable");
assert.equal(blockedAuthorCheckpointStatus.suggested_next_action, "resume_checkpoint");
assert.equal(blockedAuthorCheckpointStatus.checkpoint_action?.kind, "resume_checkpoint");
assert.equal(blockedAuthorCheckpointStatus.checkpoint_action?.tool, RIDDLE_PROOF_REVIEW_TOOL_NAME);
assert.equal(blockedAuthorCheckpointStatus.checkpoint_action?.decision, "continue_checkpoint");
assert.match(blockedAuthorCheckpointStatus.checkpoint_action?.note, /not a proof approval/);
assert.equal(blockedAuthorCheckpointStatus.monitor_contract.response_gate, "checkpoint_ok");
assert.equal(blockedAuthorCheckpointStatus.monitor_contract.should_continue_monitoring, false);
const blockedAuthorWakeClassification = classifyOpenClawRiddleProofWake(blockedAuthorCheckpointStatus);
assert.equal(blockedAuthorWakeClassification.should_dispatch, true);
assert.equal(blockedAuthorWakeClassification.kind, "resume_checkpoint");
assert.ok(blockedAuthorWakeClassification.next_tools.includes(RIDDLE_PROOF_REVIEW_TOOL_NAME));

const continueCheckpointEngineCalls = [];
const continueCheckpointResult = await submitOpenClawRiddleProofReview(
  {
    state_path: blockedAuthorCheckpointWrapperStatePath,
    decision: "continue_checkpoint",
    summary: "Continue the internal loop from the author checkpoint.",
  },
  {
    executionMode: "engine",
    defaultShipMode: "none",
    engine: {
      async execute(engineParams) {
        continueCheckpointEngineCalls.push(engineParams);
        assert.equal(engineParams.proof_assessment_json, undefined);
        assert.equal(engineParams.continue_from_checkpoint, undefined);
        assert.equal(engineParams.advance_stage, "author");
        return {
          ok: true,
          state_path: authorCheckpointStatePath,
          checkpoint: "verify_ship_ready",
          summary: "Proof is ready after checkpoint continuation.",
          shipGate: { ok: true },
        };
      },
    },
    agent: reviewDelegate,
  },
);
assert.equal(continueCheckpointResult.status, "ready_to_ship");
assert.equal(continueCheckpointEngineCalls.length, 1);

const staticAuditReviewEngineStatePath = path.join(reviewFixture, "riddle-state-static-audit-ready.json");
const staticAuditReviewWrapperStatePath = path.join(reviewFixture, "wrapper-state-static-audit-ready.json");
const staticAuditProofEvidence = {
  version: "riddle-proof.static-smoke.v4",
  proofReady: true,
  staticAuditReady: true,
  interactionExpected: false,
  interactionNotRequired: true,
  zeroInteractiveElementsExpected: true,
  routeMatches: true,
  titleMatches: true,
  headingMatches: true,
  markerMatches: true,
  normalizedCopyVisible: true,
  noConsoleErrors: true,
  noPageErrors: true,
};
writeFileSync(staticAuditReviewEngineStatePath, JSON.stringify({
  branch: "agent/static-audit-ready",
  verification_mode: "visual",
  implementation_mode: "none",
  require_diff: false,
  allow_code_changes: false,
  after_cdn: "https://example.com/static-after.png",
  evidence_bundle: {
    expected_path: "/s/ps_b7b5f0dc/",
    proof_evidence: staticAuditProofEvidence,
    artifact_contract: {
      verification_mode: "visual",
      required: {
        baseline_context: true,
        route_semantics: true,
        screenshot: true,
        proof_evidence: true,
        visual_delta: false,
      },
    },
    artifact_production: {
      image_output_count: 1,
      proof_evidence_present: true,
      has_structured_payload: true,
    },
    artifact_usage: {
      missing_required_signals: [],
      supervisor_review_signals: ["after-capture", "semantic-context", "proof-evidence"],
    },
    after: {
      screenshot_url: "https://example.com/static-after.png",
      proof_evidence: staticAuditProofEvidence,
      visual_delta: {
        status: "not_applicable",
        reason: "audit/no-diff proof does not require a before/after implementation delta",
      },
    },
  },
  proof_assessment_request: {
    expected_path: "/s/ps_b7b5f0dc/",
    artifact_contract: {
      verification_mode: "visual",
      required: {
        baseline_context: true,
        route_semantics: true,
        screenshot: true,
        proof_evidence: true,
        visual_delta: false,
      },
    },
    artifact_usage: {
      missing_required_signals: [],
      supervisor_review_signals: ["after-capture", "semantic-context", "proof-evidence"],
    },
    visual_delta: {
      status: "not_applicable",
      reason: "audit/no-diff proof does not require a before/after implementation delta",
    },
    semantic_context: {
      route: {
        expected_path: "/s/ps_b7b5f0dc/",
        after_observed_path: "/s/ps_b7b5f0dc/",
      },
      after: {
        valid: true,
        headings: ["Riddle static preview smoke"],
        buttons: [],
        links: [],
        visible_text_sample: "Riddle static preview smoke Static preview marker is visible.",
      },
    },
  },
}, null, 2));
const staticAuditReviewBlocked = await runOpenClawRiddleProof(
  {
    ...params,
    run_mode: "blocking",
    checkpoint_mode: "manual",
    harness_state_path: staticAuditReviewWrapperStatePath,
    state_path: staticAuditReviewEngineStatePath,
    ship_mode: "none",
    dry_run: false,
    mode: "audit",
    implementation_mode: "none",
    require_diff: false,
    allow_code_changes: false,
    change_request: "Audit the current static preview without changing code.",
  },
  {
    executionMode: "engine",
    defaultShipMode: "none",
    engine: {
      async execute() {
        return {
          ok: false,
          state_path: staticAuditReviewEngineStatePath,
          checkpoint: "verify_capture_retry",
          summary: "Static audit capture requested proof packet revision.",
          checkpointContract: {
            resume: { continue_with_stage: "author" },
          },
        };
      },
    },
    agent: reviewDelegate,
  },
);
assert.equal(staticAuditReviewBlocked.status, "awaiting_checkpoint");
assert.equal(staticAuditReviewBlocked.checkpoint_packet?.kind, "author_proof");
assert.equal(staticAuditReviewBlocked.checkpoint_packet?.allowed_decisions?.includes("ready_to_ship"), false);
const staticAuditReviewEngineCalls = [];
const staticAuditReviewResumed = await submitOpenClawRiddleProofReview(
  {
    state_path: staticAuditReviewWrapperStatePath,
    decision: "ready_to_ship",
    summary: "The static audit evidence proves the current preview.",
    reasons: ["route, screenshot, and structured static proof evidence are ready"],
  },
  {
    executionMode: "engine",
    defaultShipMode: "none",
    engine: {
      async execute(engineParams) {
        staticAuditReviewEngineCalls.push(engineParams);
        assert.ok(engineParams.proof_assessment_json);
        const proofAssessment = JSON.parse(engineParams.proof_assessment_json);
        assert.equal(proofAssessment.decision, "ready_to_ship");
        return {
          ok: true,
          state_path: staticAuditReviewEngineStatePath,
          checkpoint: "verify_ship_ready",
          summary: "Static audit proof accepted after main-agent review.",
          shipGate: { ok: true },
        };
      },
    },
    agent: reviewDelegate,
  },
);
assert.equal(staticAuditReviewResumed.status, "ready_to_ship");
assert.equal(staticAuditReviewEngineCalls.length, 1);

const backgroundResumeEngineStatePath = path.join(reviewFixture, "riddle-state-author-checkpoint-background-resume.json");
const backgroundResumeWrapperStatePath = path.join(reviewFixture, "wrapper-state-author-checkpoint-background-resume.json");
writeFileSync(backgroundResumeEngineStatePath, JSON.stringify({
  branch: "agent/background-resume",
  runtime_events: [],
  stage_decision_request: {
    checkpoint: "author_supervisor_judgment",
    continue_from_checkpoint: true,
    continue_with_stage: "author",
  },
}, null, 2));
writeFileSync(backgroundResumeWrapperStatePath, JSON.stringify({
  version: "riddle-proof.run-state.v1",
  run_id: "rp_author_checkpoint_background_resume",
  status: "blocked",
  created_at: "2026-04-23T00:00:00.000Z",
  updated_at: "2026-04-23T00:00:00.000Z",
  request: {
    repo: "riddledc/riddle-site",
    change_request: "Make a tiny homepage copy change.",
    engine_state_path: backgroundResumeEngineStatePath,
    verification_mode: "visual",
  },
  current_stage: "author",
  last_checkpoint: "author_supervisor_judgment",
  iterations: 1,
  events: [
    {
      kind: "run.background.started",
      checkpoint: "background_started",
      stage: "setup",
      summary: "Background run accepted.",
      details: {},
    },
    {
      kind: "run.oc_wake.monitor_registered",
      checkpoint: "background_started",
      stage: "setup",
      summary: "OpenClaw wake monitor registered.",
      details: {
        monitor_version: "riddle_proof.oc_wake.v1",
        dispatchable: true,
        wake_context: {
          sessionKey: "agent:main:discord-thread-222222222222222222",
          sessionKeySource: "tool_context",
          agentId: "main",
        },
      },
    },
  ],
}, null, 2));
const backgroundResumeEngineCalls = [];
const backgroundResumeResult = await submitOpenClawRiddleProofReview(
  {
    state_path: backgroundResumeWrapperStatePath,
    decision: "continue_checkpoint",
    summary: "Continue the detached proof from the author checkpoint.",
  },
  {
    executionMode: "engine",
    defaultShipMode: "none",
    engine: {
      async execute(engineParams) {
        backgroundResumeEngineCalls.push(engineParams);
        assert.equal(engineParams.advance_stage, "author");
        return {
          ok: true,
          state_path: backgroundResumeEngineStatePath,
          checkpoint: "verify_ship_ready",
          summary: "Detached proof is ready after checkpoint continuation.",
          shipGate: { ok: true },
        };
      },
    },
    agent: reviewDelegate,
  },
);
assert.equal(backgroundResumeResult.status, "running");
assert.equal(backgroundResumeResult.raw?.background, true);
assert.equal(backgroundResumeResult.raw?.background_resume, true);
for (let attempt = 0; attempt < 50 && backgroundResumeEngineCalls.length === 0; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
assert.equal(backgroundResumeEngineCalls.length, 1);
let backgroundResumeStatus = readOpenClawRiddleProofStatus(backgroundResumeWrapperStatePath);
for (let attempt = 0; attempt < 50 && backgroundResumeStatus?.status === "running"; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 20));
  backgroundResumeStatus = readOpenClawRiddleProofStatus(backgroundResumeWrapperStatePath);
}
assert.equal(backgroundResumeStatus?.status, "ready_to_ship");
const backgroundResumeWakeDispatches = [];
const backgroundResumeWakeResult = await processOpenClawRiddleProofWakeMonitorOnce(backgroundResumeWrapperStatePath, {
  enqueueSystemEvent(text, options) {
    backgroundResumeWakeDispatches.push({ text, options });
    return true;
  },
  requestHeartbeatNow() {},
});
assert.equal(backgroundResumeWakeResult.action, "dispatched");
assert.equal(backgroundResumeWakeResult.wake_kind, "ready_to_ship");
assert.equal(backgroundResumeWakeDispatches[0].options.sessionKey, "agent:main:discord-thread-222222222222222222");

const checkpointProtocolFixture = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-checkpoint-protocol-"));
const checkpointProtocolEngineStatePath = path.join(checkpointProtocolFixture, "engine-state.json");
const checkpointProtocolWrapperStatePath = path.join(checkpointProtocolFixture, "wrapper-state.json");
writeFileSync(checkpointProtocolEngineStatePath, JSON.stringify({
  branch: "agent/checkpoint-protocol",
  change_request: "Use checkpoint packets in OpenClaw.",
  verification_mode: "visual",
  before_cdn: "https://example.com/checkpoint-before.png",
  author_request: {
    status: "needs_supervisor_judgment",
    fallback_defaults: {
      proof_plan: "Capture the checkpoint-controlled proof.",
      capture_script: "await saveScreenshot('after-proof');",
    },
  },
}, null, 2));
const checkpointProtocolEngineCalls = [];
const checkpointProtocolEngine = {
  async execute(engineParams) {
    checkpointProtocolEngineCalls.push(engineParams);
    if (engineParams.author_packet_json) {
      const authorPacket = JSON.parse(engineParams.author_packet_json);
      assert.equal(authorPacket.proof_plan, "Use the OpenClaw checkpoint response proof plan.");
      return {
        ok: true,
        state_path: checkpointProtocolEngineStatePath,
        checkpoint: "verify_ship_ready",
        summary: "Checkpoint packet proof is ready.",
        shipGate: { ok: true },
      };
    }
    return {
      ok: true,
      state_path: checkpointProtocolEngineStatePath,
      checkpoint: "author_supervisor_judgment",
      summary: "OpenClaw should yield a checkpoint packet.",
    };
  },
};
const checkpointProtocolResult = await runOpenClawRiddleProof(
  {
    ...params,
    run_mode: "blocking",
    checkpoint_mode: "manual",
    harness_state_path: checkpointProtocolWrapperStatePath,
    state_path: checkpointProtocolEngineStatePath,
    ship_mode: "none",
    dry_run: false,
  },
  {
    executionMode: "engine",
    defaultShipMode: "none",
    engine: checkpointProtocolEngine,
  },
);
assert.equal(checkpointProtocolResult.status, "awaiting_checkpoint");
assert.equal(checkpointProtocolResult.checkpoint_packet?.kind, "author_proof");
assert.equal(checkpointProtocolResult.checkpoint_packet?.routing_hint?.visibility, "manual");
const checkpointProtocolStatus = readOpenClawRiddleProofStatus(checkpointProtocolWrapperStatePath);
assert.equal(checkpointProtocolStatus?.status, "awaiting_checkpoint");
assert.equal(checkpointProtocolStatus?.suggested_next_action, "resume_checkpoint");
assert.equal(checkpointProtocolStatus?.checkpoint_action?.kind, "resume_checkpoint");
assert.equal(checkpointProtocolStatus?.monitor_contract.response_gate, "checkpoint_ok");
assert.equal(checkpointProtocolStatus?.checkpoint_packet, undefined);
assert.equal(checkpointProtocolStatus?.checkpoint_summary?.pending, true);
assert.equal(checkpointProtocolStatus?.checkpoint_summary?.token_matches, undefined);
assert.equal(checkpointProtocolStatus?.checkpoint_summary?.token_status, "awaiting_response");
const checkpointProtocolStatusWithPacket = readOpenClawRiddleProofStatus(checkpointProtocolWrapperStatePath, { include_packet: true });
assert.equal(checkpointProtocolStatusWithPacket?.checkpoint_packet?.kind, "author_proof");
assert.equal(checkpointProtocolStatusWithPacket?.checkpoint_packet?.state_excerpt, undefined);
const checkpointProtocolWake = classifyOpenClawRiddleProofWake(checkpointProtocolStatusWithPacket);
assert.equal(checkpointProtocolWake.should_dispatch, true);
assert.equal(checkpointProtocolWake.kind, "resume_checkpoint");
assert.ok(checkpointProtocolWake.checkpoint_packet);
const checkpointProtocolWakeText = formatOpenClawRiddleProofWakeEvent(checkpointProtocolWake, checkpointProtocolWrapperStatePath);
assert.match(checkpointProtocolWakeText, /checkpoint_packet:/);
assert.match(checkpointProtocolWakeText, /checkpoint_response_json/);
const proofReviewWakeText = formatOpenClawRiddleProofWakeEvent({
  should_dispatch: true,
  kind: "proof_review_required",
  dedupe_key: "proof-review-test",
  status: "awaiting_checkpoint",
  checkpoint: "verify_supervisor_judgment",
  suggested_next_action: "inspect_or_review",
  summary: "Proof review is required.",
  next_tools: [RIDDLE_PROOF_INSPECT_TOOL_NAME, RIDDLE_PROOF_REVIEW_TOOL_NAME, RIDDLE_PROOF_STATUS_TOOL_NAME],
  checkpoint_packet: {
    version: "riddle-proof.checkpoint.v1",
    run_id: "rp_test",
    checkpoint: "verify_supervisor_judgment",
    kind: "proof_assessment",
    stage: "verify",
    summary: "Judge the proof packet.",
    question: "Ready to ship?",
    allowed_decisions: ["ready_to_ship", "needs_richer_proof", "revise_capture"],
    response_schema: {},
  },
}, checkpointProtocolWrapperStatePath);
assert.match(proofReviewWakeText, /decision=ready_to_ship/);
assert.doesNotMatch(proofReviewWakeText, /decision=continue_checkpoint/);
const checkpointProtocolResponse = {
  version: "riddle-proof.checkpoint_response.v1",
  run_id: checkpointProtocolResult.run_id,
  checkpoint: checkpointProtocolResult.checkpoint_packet.checkpoint,
  resume_token: checkpointProtocolResult.checkpoint_packet.resume_token,
  decision: "author_packet",
  summary: "Main agent authored the checkpoint response.",
  payload: {
    proof_plan: "Use the OpenClaw checkpoint response proof plan.",
    capture_script: "await saveScreenshot('after-proof');",
  },
  created_at: "2026-05-07T00:00:00.000Z",
};
const checkpointProtocolResumed = await submitOpenClawRiddleProofReview(
  {
    state_path: checkpointProtocolWrapperStatePath,
    decision: "continue_checkpoint",
    summary: "Submit the checkpoint response.",
    checkpoint_response_json: JSON.stringify(checkpointProtocolResponse),
  },
  {
    executionMode: "engine",
    defaultShipMode: "none",
    engine: checkpointProtocolEngine,
  },
);
assert.equal(checkpointProtocolResumed.status, "ready_to_ship");
assert.ok(checkpointProtocolEngineCalls.some((call) => call.author_packet_json));

const backgroundCheckpointFixture = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-background-checkpoint-"));
const backgroundCheckpointEngineStatePath = path.join(backgroundCheckpointFixture, "engine-state.json");
const backgroundCheckpointWrapperStatePath = path.join(backgroundCheckpointFixture, "wrapper-state.json");
writeFileSync(backgroundCheckpointEngineStatePath, JSON.stringify({
  branch: "agent/background-checkpoint",
  change_request: "Use background checkpoint packets in OpenClaw.",
  verification_mode: "visual",
  before_cdn: "https://example.com/background-checkpoint-before.png",
  author_request: {
    status: "needs_supervisor_judgment",
    fallback_defaults: {
      proof_plan: "Capture the background checkpoint proof.",
      capture_script: "await saveScreenshot('after-background-proof');",
    },
  },
}, null, 2));
const backgroundCheckpointEngineCalls = [];
const backgroundCheckpointEngine = {
  async execute(engineParams) {
    backgroundCheckpointEngineCalls.push(engineParams);
    if (engineParams.author_packet_json) {
      const authorPacket = JSON.parse(engineParams.author_packet_json);
      assert.equal(authorPacket.proof_plan, "Use the background checkpoint response proof plan.");
      return {
        ok: true,
        state_path: backgroundCheckpointEngineStatePath,
        checkpoint: "verify_ship_ready",
        summary: "Background checkpoint proof is ready.",
        shipGate: { ok: true },
      };
    }
    return {
      ok: true,
      state_path: backgroundCheckpointEngineStatePath,
      checkpoint: "author_supervisor_judgment",
      summary: "Background run should persist the checkpoint packet on the wrapper state.",
    };
  },
};
const backgroundCheckpointResult = await runOpenClawRiddleProof(
  {
    ...params,
    run_mode: "background",
    checkpoint_mode: "manual",
    harness_state_path: backgroundCheckpointWrapperStatePath,
    state_path: backgroundCheckpointEngineStatePath,
    ship_mode: "none",
    dry_run: false,
  },
  {
    executionMode: "engine",
    defaultShipMode: "none",
    engine: backgroundCheckpointEngine,
  },
);
assert.equal(backgroundCheckpointResult.status, "running");
for (let attempt = 0; attempt < 50 && backgroundCheckpointEngineCalls.length === 0; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
assert.equal(backgroundCheckpointEngineCalls.length, 1);
let backgroundCheckpointStatus = readOpenClawRiddleProofStatus(backgroundCheckpointWrapperStatePath, { include_packet: true });
for (let attempt = 0; attempt < 50 && backgroundCheckpointStatus?.status === "running"; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 20));
  backgroundCheckpointStatus = readOpenClawRiddleProofStatus(backgroundCheckpointWrapperStatePath, { include_packet: true });
}
assert.equal(backgroundCheckpointStatus?.status, "awaiting_checkpoint");
assert.equal(backgroundCheckpointStatus?.checkpoint_packet?.kind, "author_proof");
assert.equal(backgroundCheckpointStatus?.suggested_next_action, "resume_checkpoint");
const backgroundCheckpointState = JSON.parse(readFileSync(backgroundCheckpointWrapperStatePath, "utf-8"));
assert.equal(backgroundCheckpointState.checkpoint_packet?.kind, "author_proof");
const backgroundCheckpointResponse = {
  version: "riddle-proof.checkpoint_response.v1",
  run_id: backgroundCheckpointStatus.run_id,
  checkpoint: backgroundCheckpointStatus.checkpoint_packet.checkpoint,
  resume_token: backgroundCheckpointStatus.checkpoint_packet.resume_token,
  decision: "author_packet",
  summary: "Main agent authored the background checkpoint response.",
  payload: {
    proof_plan: "Use the background checkpoint response proof plan.",
    capture_script: "await saveScreenshot('after-background-proof');",
  },
  created_at: "2026-05-15T00:00:00.000Z",
};
const backgroundCheckpointResume = await submitOpenClawRiddleProofReview(
  {
    state_path: backgroundCheckpointWrapperStatePath,
    decision: "continue_checkpoint",
    summary: "Submit the background checkpoint response.",
    checkpoint_response_json: JSON.stringify(backgroundCheckpointResponse),
  },
  {
    executionMode: "engine",
    defaultShipMode: "none",
    engine: backgroundCheckpointEngine,
  },
);
assert.equal(backgroundCheckpointResume.status, "running");
for (let attempt = 0; attempt < 50 && backgroundCheckpointEngineCalls.length < 2; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
assert.equal(backgroundCheckpointEngineCalls.length, 2);
let backgroundCheckpointDoneStatus = readOpenClawRiddleProofStatus(backgroundCheckpointWrapperStatePath);
for (let attempt = 0; attempt < 50 && backgroundCheckpointDoneStatus?.status === "running"; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 20));
  backgroundCheckpointDoneStatus = readOpenClawRiddleProofStatus(backgroundCheckpointWrapperStatePath);
}
assert.equal(backgroundCheckpointDoneStatus?.status, "ready_to_ship");
assert.ok(backgroundCheckpointEngineCalls.some((call) => call.author_packet_json));

const lateCheckpointTerminalFixture = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-late-checkpoint-terminal-"));
const lateCheckpointEngineStatePath = path.join(lateCheckpointTerminalFixture, "engine-state.json");
const lateCheckpointWrapperStatePath = path.join(lateCheckpointTerminalFixture, "wrapper-state.json");
writeFileSync(lateCheckpointEngineStatePath, JSON.stringify({
  branch: "agent/late-checkpoint-terminal",
  after_cdn: "https://example.com/after-terminal.png",
}, null, 2));
writeFileSync(lateCheckpointWrapperStatePath, JSON.stringify({
  version: "riddle-proof.run-state.v1",
  run_id: "rp_late_checkpoint_terminal",
  status: "ready_to_ship",
  finalized: false,
  state_path: lateCheckpointWrapperStatePath,
  created_at: "2026-06-01T15:45:00.000Z",
  updated_at: "2026-06-01T15:46:00.000Z",
  request: {
    repo: "riddledc/riddle-site",
    change_request: "Prove terminal state ignores late checkpoint responses.",
    engine_state_path: lateCheckpointEngineStatePath,
    verification_mode: "interaction",
    ship_mode: "none",
  },
  current_stage: "verify",
  last_checkpoint: "verify_supervisor_judgment",
  events: [
    {
      kind: "run.background.started",
      checkpoint: "background_started",
      stage: "setup",
      summary: "Background run accepted.",
      details: {},
    },
    {
      kind: "run.wake.requested",
      checkpoint: "verify_supervisor_judgment",
      stage: "verify",
      summary: "Terminal ready_to_ship wake requested.",
      details: { status: "ready_to_ship" },
    },
  ],
}, null, 2));
const lateCheckpointResponse = {
  version: "riddle-proof.checkpoint_response.v1",
  run_id: "rp_late_checkpoint_terminal",
  checkpoint: "author_supervisor_judgment",
  decision: "author_packet",
  summary: "Late stale author packet after terminal ready_to_ship.",
  payload: {
    proof_plan: "STALE: should not resume terminal run.",
    capture_script: "return { passed: true, staleManualCheckpointProbe: true };",
  },
  created_at: "2026-06-01T15:52:00.000Z",
};
let lateCheckpointEngineCalled = false;
const lateCheckpointIgnored = await submitOpenClawRiddleProofReview(
  {
    state_path: lateCheckpointWrapperStatePath,
    decision: "continue_checkpoint",
    summary: "Submit stale checkpoint response after terminal ready_to_ship.",
    checkpoint_response_json: JSON.stringify(lateCheckpointResponse),
  },
  {
    executionMode: "engine",
    defaultShipMode: "none",
    engine: {
      async execute() {
        lateCheckpointEngineCalled = true;
        throw new Error("late terminal checkpoint response should not resume the engine");
      },
    },
  },
);
assert.equal(lateCheckpointIgnored.status, "ready_to_ship");
assert.equal(lateCheckpointIgnored.raw?.ignored_checkpoint_response, true);
assert.equal(lateCheckpointEngineCalled, false);
const lateCheckpointStatus = readOpenClawRiddleProofStatus(lateCheckpointWrapperStatePath);
assert.equal(lateCheckpointStatus?.status, "ready_to_ship");
assert.equal(lateCheckpointStatus?.blocker, undefined);
const lateCheckpointState = JSON.parse(readFileSync(lateCheckpointWrapperStatePath, "utf-8"));
assert.equal(lateCheckpointState.status, "ready_to_ship");
assert.equal(lateCheckpointState.finalized, false);
assert.equal(lateCheckpointState.blocker, undefined);
assert.equal(lateCheckpointState.events.at(-1).kind, "agent.checkpoint_response.ignored");

const checkpointProtocolBlockedDuplicateEngineStatePath = path.join(checkpointProtocolFixture, "riddle-state-blocked-duplicate.json");
const checkpointProtocolBlockedDuplicateWrapperStatePath = path.join(checkpointProtocolFixture, "wrapper-state-blocked-duplicate.json");
writeFileSync(checkpointProtocolBlockedDuplicateEngineStatePath, JSON.stringify({
  branch: "agent/checkpoint-protocol-blocked-duplicate",
  author_request: {
    status: "needs_supervisor_judgment",
    fallback_defaults: {
      proof_plan: "Use the OpenClaw blocked duplicate proof plan.",
      capture_script: "await saveScreenshot('after-proof');",
    },
  },
}, null, 2));
const checkpointProtocolBlockedDuplicate = await runOpenClawRiddleProof(
  {
    ...params,
    run_mode: "blocking",
    checkpoint_mode: "manual",
    harness_state_path: checkpointProtocolBlockedDuplicateWrapperStatePath,
    state_path: checkpointProtocolBlockedDuplicateEngineStatePath,
    ship_mode: "none",
    dry_run: false,
  },
  {
    executionMode: "engine",
    defaultShipMode: "none",
    engine: checkpointProtocolEngine,
  },
);
assert.equal(checkpointProtocolBlockedDuplicate.status, "awaiting_checkpoint");
const checkpointProtocolBlockedDuplicateResponse = {
  version: "riddle-proof.checkpoint_response.v1",
  run_id: checkpointProtocolBlockedDuplicate.run_id,
  checkpoint: checkpointProtocolBlockedDuplicate.checkpoint_packet.checkpoint,
  resume_token: checkpointProtocolBlockedDuplicate.checkpoint_packet.resume_token,
  decision: "blocked",
  summary: "Stop at the author checkpoint for OpenClaw duplicate testing.",
  reasons: ["intentional smoke stop"],
  created_at: "2026-05-07T00:05:00.000Z",
};
const checkpointProtocolBlockedOnce = await submitOpenClawRiddleProofReview(
  {
    state_path: checkpointProtocolBlockedDuplicateWrapperStatePath,
    decision: "continue_checkpoint",
    summary: "Submit the blocked checkpoint response.",
    checkpoint_response_json: JSON.stringify(checkpointProtocolBlockedDuplicateResponse),
  },
  {
    executionMode: "engine",
    defaultShipMode: "none",
    engine: checkpointProtocolEngine,
  },
);
assert.equal(checkpointProtocolBlockedOnce.blocker?.code, "checkpoint_response_blocked");
assert.equal(readOpenClawRiddleProofStatus(checkpointProtocolBlockedDuplicateWrapperStatePath)?.checkpoint_summary?.response_count, 1);
const checkpointProtocolBlockedTwice = await submitOpenClawRiddleProofReview(
  {
    state_path: checkpointProtocolBlockedDuplicateWrapperStatePath,
    decision: "continue_checkpoint",
    summary: "Resubmit the same blocked checkpoint response.",
    checkpoint_response_json: JSON.stringify(checkpointProtocolBlockedDuplicateResponse),
  },
  {
    executionMode: "engine",
    defaultShipMode: "none",
    engine: checkpointProtocolEngine,
  },
);
assert.equal(checkpointProtocolBlockedTwice.blocker?.code, "checkpoint_response_duplicate");
const checkpointProtocolBlockedDuplicateStatus = readOpenClawRiddleProofStatus(checkpointProtocolBlockedDuplicateWrapperStatePath);
assert.equal(checkpointProtocolBlockedDuplicateStatus?.checkpoint_summary?.response_count, 1);
assert.equal(checkpointProtocolBlockedDuplicateStatus?.checkpoint_summary?.duplicate_response_count, 1);

const staleHintStatePath = path.join(reviewFixture, "riddle-state-stale-hint.json");
const staleHintWrapperStatePath = path.join(reviewFixture, "wrapper-state-stale-hint.json");
writeFileSync(staleHintStatePath, JSON.stringify({
  server_path: "/games/signal-sprint",
  wait_for_selector: "h1",
  recon_results: {
    current_plan: {
      target_path: "/games/signal-sprint",
      wait_for_selector: "h1",
    },
  },
  capture_hint: {
    source: "hint_cache",
    applied: true,
    applied_fields: ["wait_for_selector"],
    matched_tokens: ["target", "route", "games", "label"],
    selection_reason: "token_overlap_and_mode",
    selected: {
      server_path: "/games/tic-tac-toe",
      wait_for_selector: "h1",
    },
    fallback_triggered: true,
    fallback_reason: "plan_refined",
    fallback_changes: {
      server_path: {
        from: "/games/tic-tac-toe",
        to: "/games/signal-sprint",
      },
    },
  },
}, null, 2));
writeFileSync(staleHintWrapperStatePath, JSON.stringify({
  version: "riddle-proof.run-state.v1",
  status: "ready_to_ship",
  state_path: staleHintWrapperStatePath,
  request: {
    engine_state_path: staleHintStatePath,
    verification_mode: "text",
  },
  events: [],
}, null, 2));
const staleHintStatus = readOpenClawRiddleProofStatus(staleHintWrapperStatePath);
assert.equal(staleHintStatus?.capture_hint?.server_path, "/games/tic-tac-toe");
assert.equal(staleHintStatus?.capture_hint?.selected_server_path, "/games/tic-tac-toe");
assert.equal(staleHintStatus?.capture_hint?.server_path_applied, false);
assert.equal(staleHintStatus?.capture_hint?.effective_server_path, "/games/signal-sprint");
assert.equal(staleHintStatus?.capture_hint?.fallback_changes?.server_path?.to, "/games/signal-sprint");

const inspectDebugResult = inspectOpenClawRiddleProof({ state_path: reviewWrapperStatePath, debug: true });
assert.equal(Array.isArray(inspectDebugResult.debug?.engine_runtime_events_recent), true);
assert.equal(Array.isArray(inspectDebugResult.debug?.capture_diagnostics_recent), true);

writeFileSync(backgroundEngineStatePath, JSON.stringify({
  branch: "agent/background-proof",
  scratch_cleanup: {
    requested: true,
    removed: [
      { path: "/tmp/.riddle-proof-worktrees/example-before", via: "git" },
      { path: "/tmp/.riddle-proof-worktrees/example-after", via: "git" },
    ],
    errors: [],
  },
  current_runtime_step: {
    step: "verify",
    action: "run",
    status: "running",
    started_at: new Date(Date.now() - 250).toISOString(),
  },
  runtime_events: [],
}, null, 2));
const removedBackgroundStatus = readOpenClawRiddleProofStatus(backgroundWrapperStatePath);
assert.equal(removedBackgroundStatus?.scratch_cleanup_status, "removed_worktrees");

const concernFixture = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-evidence-concern-"));
const concernStatePath = path.join(concernFixture, "riddle-state.json");
const concernWrapperStatePath = path.join(concernFixture, "wrapper-state.json");
writeFileSync(concernStatePath, JSON.stringify({
  branch: "agent/evidence-concern-fixture",
  before_cdn: "https://example.com/concern-before.png",
  after_cdn: "https://example.com/concern-after.png",
  evidence_bundle: {
    expected_path: "/",
    proof_evidence: {
      newHeroCopyVisible: false,
      oldHeroCopyRemoved: true,
      normalizedTextSample: "Send a Playwright script. Get screenshots, console logs, network HAR, and page evidence.",
    },
    after: {
      screenshot_url: "https://example.com/concern-after.png",
      visual_delta: { status: "measured", passed: true },
    },
  },
  proof_assessment_request: {
    expected_path: "/",
    visual_delta: { status: "measured", passed: true },
    semantic_context: {
      route: {
        expected_path: "/",
        before_observed_path: "/",
        after_observed_path: "/",
      },
      after: {
        valid: true,
        headings: ["Evidence-backed agent browser proof"],
        buttons: ["Start Free Today"],
        visible_text_sample: "Send a Playwright script. Get screenshots, console logs, network HAR, and page evidence.",
      },
    },
  },
}, null, 2));
writeFileSync(concernWrapperStatePath, JSON.stringify({
  version: "riddle-proof.run-state.v1",
  run_id: "rp_evidence_concern",
  status: "blocked",
  created_at: "2026-04-23T00:00:00.000Z",
  updated_at: "2026-04-23T00:00:00.000Z",
  current_stage: "verify",
  last_checkpoint: "verify_supervisor_judgment",
  request: {
    repo: "davisdiehl/riddle-site",
    change_request: "Clarify homepage proof copy",
    engine_state_path: concernStatePath,
  },
  iterations: 3,
  events: [],
}, null, 2));
const concernInspectResult = inspectOpenClawRiddleProof({ state_path: concernWrapperStatePath });
assert.equal(concernInspectResult.route_matched, true);
assert.equal(concernInspectResult.structured_evidence?.proof_evidence_has_concerns, true);
assert.equal(concernInspectResult.structured_evidence?.proof_evidence_concerns?.[0]?.key, "newHeroCopyVisible");
assert.equal(concernInspectResult.ready_to_ship_candidate, false);

const concernReviewWrapperStatePath = path.join(concernFixture, "wrapper-review-state.json");
const concernReviewBlocked = await runOpenClawRiddleProof(
  {
    ...params,
    dry_run: false,
    run_mode: "blocking",
    ship_after_verify: false,
    ship_mode: "none",
    report_mode: "terminal_only",
    wait_for_terminal: true,
    harness_state_path: concernReviewWrapperStatePath,
    state_path: concernStatePath,
    change_request: "Clarify homepage proof copy",
  },
  {
    executionMode: "engine",
    defaultShipMode: "none",
    proofReviewMode: "main_agent",
    autoReviewShipModeNone: false,
    engine: {
      async execute() {
        return {
          ok: false,
          state_path: concernStatePath,
          checkpoint: "verify_supervisor_judgment",
          summary: "Proof evidence needs judgment.",
        };
      },
    },
    agent: reviewDelegate,
  },
);
assert.equal(concernReviewBlocked.status, "awaiting_checkpoint");
assert.equal(concernReviewBlocked.checkpoint_packet?.checkpoint, "verify_supervisor_judgment");
assert.equal(concernReviewBlocked.checkpoint_packet?.kind, "assess_proof");
assert.equal(concernReviewBlocked.checkpoint_packet?.evidence_excerpt?.visual_delta_ready, true);
assert.equal(
  concernReviewBlocked.checkpoint_packet?.evidence_excerpt?.proof_assessment_request?.semantic_context?.after?.headings?.[0],
  "Evidence-backed agent browser proof",
);

const expectedAbsenceFixture = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-evidence-expected-absence-"));
const expectedAbsenceStatePath = path.join(expectedAbsenceFixture, "riddle-state.json");
const expectedAbsenceWrapperStatePath = path.join(expectedAbsenceFixture, "wrapper-state.json");
writeFileSync(expectedAbsenceStatePath, JSON.stringify({
  branch: "agent/evidence-expected-absence-fixture",
  before_cdn: "https://example.com/absence-before.png",
  after_cdn: "https://example.com/absence-after.png",
  evidence_bundle: {
    expected_path: "/",
    proof_evidence: {
      newCopyVisible: true,
      oldCopyStillVisible: false,
      oldCopyAbsent: true,
      forbiddenTextFound: false,
    },
    after: {
      screenshot_url: "https://example.com/absence-after.png",
      visual_delta: { status: "measured", passed: true },
    },
  },
  proof_assessment_request: {
    expected_path: "/",
    visual_delta: { status: "measured", passed: true },
    semantic_context: {
      route: {
        expected_path: "/",
        before_observed_path: "/",
        after_observed_path: "/",
      },
      after: {
        valid: true,
        headings: ["Dashboard"],
        buttons: ["Export"],
        visible_text_sample: "Dashboard Export reports with current filters applied.",
      },
    },
  },
}, null, 2));
writeFileSync(expectedAbsenceWrapperStatePath, JSON.stringify({
  version: "riddle-proof.run-state.v1",
  run_id: "rp_evidence_expected_absence",
  status: "blocked",
  created_at: "2026-04-23T00:00:00.000Z",
  updated_at: "2026-04-23T00:00:00.000Z",
  current_stage: "verify",
  last_checkpoint: "verify_supervisor_judgment",
  request: {
    repo: "example/site",
    change_request: "Change stale copy and prove the old copy is absent",
    engine_state_path: expectedAbsenceStatePath,
  },
  iterations: 3,
  events: [],
}, null, 2));
const expectedAbsenceInspectResult = inspectOpenClawRiddleProof({ state_path: expectedAbsenceWrapperStatePath });
assert.equal(expectedAbsenceInspectResult.route_matched, true);
assert.equal(expectedAbsenceInspectResult.structured_evidence?.proof_evidence_has_concerns, false);
assert.equal(expectedAbsenceInspectResult.ready_to_ship_candidate, true);

const referenceSkipFixture = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-reference-skip-"));
const referenceSkipStatePath = path.join(referenceSkipFixture, "riddle-state.json");
const referenceSkipWrapperStatePath = path.join(referenceSkipFixture, "wrapper-state.json");
writeFileSync(referenceSkipStatePath, JSON.stringify({
  branch: "agent/reference-skip-fixture",
  reference: "both",
  requested_reference: "both",
  reference_resolution: {
    requested_reference: "both",
    effective_reference: "before",
    prod_reference_requested: true,
    prod_url_present: false,
    prod_reference_skipped: true,
    prod_reference_skip_reason: "prod_url_not_provided",
  },
  before_cdn: "https://example.com/reference-before.png",
  after_cdn: "https://example.com/reference-after.png",
  evidence_bundle: {
    expected_path: "/",
    after: {
      screenshot_url: "https://example.com/reference-after.png",
      visual_delta: { status: "not_applicable" },
    },
  },
  proof_assessment_request: {
    expected_path: "/",
    semantic_context: {
      route: {
        expected_path: "/",
        before_observed_path: "/",
        after_observed_path: "/",
      },
      after: { valid: true },
    },
  },
}, null, 2));
writeFileSync(referenceSkipWrapperStatePath, JSON.stringify({
  version: "riddle-proof.run-state.v1",
  run_id: "rp_reference_skip",
  status: "blocked",
  created_at: "2026-04-23T00:00:00.000Z",
  updated_at: "2026-04-23T00:00:00.000Z",
  current_stage: "verify",
  last_checkpoint: "verify_supervisor_judgment",
  request: {
    repo: "example/site",
    change_request: "Run both-reference proof without a prod URL",
    reference: "both",
    engine_state_path: referenceSkipStatePath,
  },
  iterations: 2,
  events: [],
}, null, 2));
const referenceSkipInspectResult = inspectOpenClawRiddleProof({ state_path: referenceSkipWrapperStatePath });
assert.equal(referenceSkipInspectResult.request_metadata.reference, "both");
assert.equal(referenceSkipInspectResult.request_metadata.requested_reference, "both");
assert.equal(referenceSkipInspectResult.request_metadata.effective_reference, "before");
assert.equal(referenceSkipInspectResult.request_metadata.prod_reference_skipped, true);
assert.equal(referenceSkipInspectResult.request_metadata.prod_reference_skip_reason, "prod_url_not_provided");

const auditNoDiffInspectFixture = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-audit-no-diff-"));
const auditNoDiffInspectStatePath = path.join(auditNoDiffInspectFixture, "riddle-state.json");
const auditNoDiffInspectWrapperStatePath = path.join(auditNoDiffInspectFixture, "wrapper-state.json");
writeFileSync(auditNoDiffInspectStatePath, JSON.stringify({
  branch: "agent/audit-no-diff-fixture",
  implementation_mode: "none",
  require_diff: false,
  allow_code_changes: false,
  verification_mode: "visual",
  after_cdn: "https://example.com/audit-after.png",
  evidence_bundle: {
    expected_path: "/",
    verification_mode: "visual",
    artifact_contract: {
      required: {
        baseline_context: false,
        route_semantics: true,
        screenshot: true,
        proof_evidence: false,
        visual_delta: true,
      },
    },
    artifact_usage: {
      missing_required_signals: [],
    },
    after: {
      screenshot_url: "https://example.com/audit-after.png",
      observation: {
        valid: true,
        details: {
          observed_path: "/",
          headings: ["Home"],
          buttons: ["Start"],
          visible_text_sample: "Home Start",
        },
      },
      visual_delta: {
        status: "not_applicable",
        passed: null,
        reason: "Audit/no-diff verification judges current target evidence directly and does not require a before/after implementation delta.",
      },
    },
    semantic_context: {
      route: {
        expected_path: "/",
        after_observed_path: "/",
      },
      after: {
        valid: true,
        headings: ["Home"],
        buttons: ["Start"],
        visible_text_sample: "Home Start",
      },
    },
  },
  proof_assessment_request: {
    expected_path: "/",
  },
}, null, 2));
writeFileSync(auditNoDiffInspectWrapperStatePath, JSON.stringify({
  version: "riddle-proof.run-state.v1",
  run_id: "rp_audit_no_diff_visual",
  status: "blocked",
  created_at: "2026-04-23T00:00:00.000Z",
  updated_at: "2026-04-23T00:00:00.000Z",
  current_stage: "verify",
  last_checkpoint: "verify_supervisor_judgment",
  request: {
    repo: "example/site",
    change_request: "Audit the live site without code changes",
    verification_mode: "visual",
    implementation_mode: "none",
    require_diff: false,
    allow_code_changes: false,
    engine_state_path: auditNoDiffInspectStatePath,
  },
  iterations: 2,
  events: [],
}, null, 2));
const auditNoDiffInspectResult = inspectOpenClawRiddleProof({ state_path: auditNoDiffInspectWrapperStatePath });
assert.equal(auditNoDiffInspectResult.route_matched, true);
assert.equal(auditNoDiffInspectResult.visual_delta_required, false);
assert.equal(auditNoDiffInspectResult.visual_delta_ready, true);
assert.equal(auditNoDiffInspectResult.ready_to_ship_candidate, true);
assert.equal(auditNoDiffInspectResult.hard_blockers.some((item) => item.includes("visual_delta")), false);

const autoReviewFixture = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-auto-review-"));
const autoReviewStatePath = path.join(autoReviewFixture, "riddle-state.json");
const autoReviewWrapperStatePath = path.join(autoReviewFixture, "wrapper-state.json");
writeFileSync(autoReviewStatePath, JSON.stringify({
  branch: "agent/auto-review-fixture",
  before_cdn: "https://example.com/auto-before.png",
  after_cdn: "https://example.com/auto-after.png",
  evidence_bundle: {
    expected_path: "/games/tic-tac-toe",
    after: {
      screenshot_url: "https://example.com/auto-after.png",
      visual_delta: { status: "measured", passed: true, changed_pixels: 24000, change_percent: 2.4 },
    },
  },
  proof_assessment_request: {
    expected_path: "/games/tic-tac-toe",
    visual_delta: { status: "measured", passed: true, changed_pixels: 24000, change_percent: 2.4 },
    semantic_context: {
      route: {
        expected_path: "/games/tic-tac-toe",
        before_observed_path: "/games/tic-tac-toe",
        after_observed_path: "/games/tic-tac-toe",
      },
      after: {
        valid: true,
        headings: ["Tic Tac Toe"],
        buttons: ["Reset Game"],
        visible_text_sample: "Tic Tac Toe Reset Game",
      },
    },
  },
}, null, 2));
const autoReviewEngineCalls = [];
const autoReviewResult = await runOpenClawRiddleProof(
  {
    ...params,
    dry_run: false,
    run_mode: "blocking",
    ship_after_verify: false,
    ship_mode: "none",
    harness_state_path: autoReviewWrapperStatePath,
    state_path: autoReviewStatePath,
    change_request: "Make Tic Tac Toe board polish visibly stronger",
  },
  {
    executionMode: "engine",
    defaultShipMode: "none",
    proofReviewMode: "main_agent",
    engine: {
      async execute(engineParams) {
        autoReviewEngineCalls.push(engineParams);
        if (engineParams.proof_assessment_json) {
          const proofAssessment = JSON.parse(engineParams.proof_assessment_json);
          assert.equal(proofAssessment.decision, "ready_to_ship");
          assert.equal(proofAssessment.source, "openclaw_auto_ship_mode_none");
          assert.equal(proofAssessment.continue_with_stage, "ship");
          return {
            ok: true,
            state_path: autoReviewStatePath,
            checkpoint: "verify_ship_ready",
            summary: "Proof is ready but ship mode is held.",
            shipGate: { ok: true },
          };
        }
        return {
          ok: false,
          state_path: autoReviewStatePath,
          checkpoint: "verify_supervisor_judgment",
          summary: "Proof evidence needs judgment.",
        };
      },
    },
    agent: reviewDelegate,
  },
);
assert.equal(autoReviewResult.status, "ready_to_ship");
assert.equal(autoReviewResult.ok, true);
assert.ok(autoReviewEngineCalls.length >= 1);
assert.equal(autoReviewEngineCalls[0].proof_assessment_json, undefined);
if (autoReviewEngineCalls[1]) {
  assert.ok(autoReviewEngineCalls[1].proof_assessment_json);
}
const autoReviewState = JSON.parse(readFileSync(autoReviewWrapperStatePath, "utf-8"));
const autoReviewEvent = autoReviewState.events.find((event) => event.kind === "agent.proof_assessment.completed");
assert.equal(autoReviewEvent.details.payload.source, "openclaw_auto_ship_mode_none");
assert.equal(autoReviewState.finalized, true);

const audioAutoReviewFixture = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-audio-auto-review-"));
const audioAutoReviewStatePath = path.join(audioAutoReviewFixture, "riddle-state.json");
const audioAutoReviewWrapperStatePath = path.join(audioAutoReviewFixture, "wrapper-state.json");
writeFileSync(audioAutoReviewStatePath, JSON.stringify({
  branch: "agent/audio-auto-review-fixture",
  before_cdn: "https://example.com/audio-before.png",
  after_cdn: "",
  verification_mode: "audio",
  evidence_bundle: {
    expected_path: "/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile",
    artifact_contract: {
      verification_mode: "audio",
      required: {
        baseline_context: true,
        route_semantics: true,
        screenshot: false,
        proof_evidence: true,
      },
    },
    artifact_usage: {
      missing_required_signals: [],
    },
    proof_evidence: {
      activeMixName: "Monkberry humanized EQ mix",
      rhythmSynth8kBand: -3.3,
      audio: {
        audioWindowName: "vocalEntry",
        mixHealthOk: true,
        noClipping: true,
        notLowLevel: true,
      },
    },
    proof_evidence_sample: "{\"activeMixName\":\"Monkberry humanized EQ mix\",\"rhythmSynth8kBand\":-3.3}",
    semantic_context: {
      route: {
        expected_path: "/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile",
        before_observed_path: "/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile",
        after_observed_path: "/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile",
      },
      after: {
        valid: true,
        headings: ["Neon Step Sequencer"],
        buttons: ["Play All"],
        visible_text_sample: "Neon Step Sequencer Monkberry Moon Delight rhythmSynth 8k -3.3",
      },
    },
    after: {
      supporting_artifacts: {
        proof_evidence_present: true,
        has_structured_payload: true,
        data_outputs: [{ name: "proof.json", url: "https://example.com/audio-proof.json" }],
      },
      visual_delta: { status: "not_applicable", passed: null },
    },
  },
  proof_assessment_request: {
    expected_path: "/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile",
  },
}, null, 2));
const audioAutoReviewInspectState = {
  version: "riddle-proof.run-state.v1",
  run_id: "rp_audio_auto_review",
  status: "blocked",
  current_stage: "verify",
  last_checkpoint: "verify_supervisor_judgment",
  state_path: audioAutoReviewWrapperStatePath,
  request: {
    repo: "davisdiehl/lilarcade",
    change_request: "Soften the Monkberry rhythmSynth 8k EQ band by 0.5 dB.",
    engine_state_path: audioAutoReviewStatePath,
    verification_mode: "audio",
    ship_mode: "none",
  },
  events: [],
};
writeFileSync(audioAutoReviewWrapperStatePath, JSON.stringify(audioAutoReviewInspectState, null, 2));
const audioAutoReviewInspect = inspectOpenClawRiddleProof({ state_path: audioAutoReviewWrapperStatePath });
assert.equal(audioAutoReviewInspect.ready_to_ship_candidate, true);
assert.equal(audioAutoReviewInspect.artifact_contract?.required?.screenshot, false);
assert.equal(audioAutoReviewInspect.structured_evidence?.proof_evidence_present, true);

const audioAutoReviewEngineCalls = [];
const audioAutoReviewResult = await runOpenClawRiddleProof(
  {
    ...params,
    dry_run: false,
    run_mode: "blocking",
    ship_after_verify: false,
    ship_mode: "none",
    harness_state_path: audioAutoReviewWrapperStatePath,
    state_path: audioAutoReviewStatePath,
    verification_mode: "audio",
    change_request: "Soften the Monkberry rhythmSynth 8k EQ band by 0.5 dB.",
  },
  {
    executionMode: "engine",
    defaultShipMode: "none",
    proofReviewMode: "main_agent",
    engine: {
      async execute(engineParams) {
        audioAutoReviewEngineCalls.push(engineParams);
        if (engineParams.proof_assessment_json) {
          const proofAssessment = JSON.parse(engineParams.proof_assessment_json);
          assert.equal(proofAssessment.decision, "ready_to_ship");
          assert.equal(proofAssessment.source, "openclaw_auto_ship_mode_none");
          assert.equal(proofAssessment.continue_with_stage, "ship");
          assert.equal(proofAssessment.inspection_summary.screenshot_required, false);
          return {
            ok: true,
            state_path: audioAutoReviewStatePath,
            checkpoint: "verify_ship_ready",
            summary: "Audio proof is ready but ship mode is held.",
            shipGate: { ok: true },
          };
        }
        return {
          ok: false,
          state_path: audioAutoReviewStatePath,
          checkpoint: "verify_supervisor_judgment",
          summary: "Audio proof evidence needs judgment.",
        };
      },
    },
    agent: reviewDelegate,
  },
);
assert.equal(audioAutoReviewResult.status, "ready_to_ship");
assert.equal(audioAutoReviewResult.ok, true);
assert.ok(audioAutoReviewEngineCalls.length >= 1);

const reviewResumeEngineCalls = [];
const reviewResumed = await submitOpenClawRiddleProofReview(
  {
    state_path: reviewWrapperStatePath,
    decision: "ready_to_ship",
    summary: "The screenshot shows a visibly stronger Tic Tac Toe board.",
    reasons: ["after screenshot visibly satisfies the request"],
  },
  {
    executionMode: "engine",
    defaultShipMode: "none",
    proofReviewMode: "main_agent",
    engine: {
      async execute(engineParams) {
        reviewResumeEngineCalls.push(engineParams);
        assert.ok(engineParams.proof_assessment_json);
        return {
          ok: true,
          state_path: reviewStatePath,
          checkpoint: "verify_ship_ready",
          summary: "Proof is ready to ship after main-agent review.",
          shipGate: { ok: true },
        };
      },
    },
    agent: reviewDelegate,
  },
);
assert.equal(reviewResumed.status, "ready_to_ship");
assert.equal(reviewResumeEngineCalls.length, 1);
assert.ok(reviewResumeEngineCalls[0].proof_assessment_json);
const reviewResumedPayload = JSON.parse(reviewResumeEngineCalls[0].proof_assessment_json);
assert.equal(reviewResumedPayload.source, "supervising_agent");
assert.equal(reviewResumedPayload.continue_with_stage, "ship");
const reviewResumedState = JSON.parse(readFileSync(reviewWrapperStatePath, "utf-8"));
assert.equal(reviewResumedState.finalized, true);

const syncFixture = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-sync-"));
const syncStatePath = path.join(syncFixture, "riddle-state.json");
const syncWrapperStatePath = path.join(syncFixture, "wrapper-state.json");
writeFileSync(syncStatePath, JSON.stringify({
  pr_url: "https://github.com/davisdiehl/lilarcade/pull/257",
  target_branch: "ttt-status-polish-proof",
}, null, 2));
writeFileSync(syncWrapperStatePath, JSON.stringify({
  version: "riddle-proof.run-state.v1",
  run_id: "rp_sync",
  status: "shipped",
  created_at: "2026-04-16T00:00:00.000Z",
  updated_at: "2026-04-16T00:00:00.000Z",
  request: {
    repo: "davisdiehl/lilarcade",
    change_request: "Polish Tic Tac Toe status",
    engine_state_path: syncStatePath,
  },
  iterations: 2,
  events: [],
  pr_url: "https://github.com/davisdiehl/lilarcade/pull/257",
}, null, 2));
const syncEngineCalls = [];
const syncResult = await syncOpenClawRiddleProof(
  { state_path: syncWrapperStatePath },
  {
    executionMode: "engine",
    engine: {
      async execute(engineParams) {
        syncEngineCalls.push(engineParams);
        const pr_state = {
          status: "merged",
          pr_url: "https://github.com/davisdiehl/lilarcade/pull/257",
          pr_number: "257",
          head_branch: "ttt-status-polish-proof",
          base_branch: "main",
          merge_commit: "merge257",
          merged_at: "2026-04-16T05:30:00.000Z",
          cleanup: { worktrees_removed: 2, pruned: true },
        };
        writeFileSync(syncStatePath, JSON.stringify({ pr_state, merge_commit: "merge257", merged_at: pr_state.merged_at }, null, 2));
        return {
          ok: true,
          state_path: syncStatePath,
          checkpoint: "pr_sync_merged",
          summary: "PR is merged and local proof artifacts were reconciled.",
          pr_state,
        };
      },
    },
  },
);
assert.equal(syncEngineCalls[0].action, "sync");
assert.equal(syncEngineCalls[0].cleanup_merged_pr, true);
assert.equal(syncEngineCalls[0].update_base_checkout, true);
assert.equal(syncResult.status, "completed");
assert.equal(syncResult.pr_state?.status, "merged");
assert.equal(syncResult.merge_commit, "merge257");
assert.equal(syncResult.cleanup_report?.worktrees_removed, 2);

const registered = [];
register({
  registerTool(tool, options) {
    registered.push({ tool, options });
  },
});

assert.equal(registered.length, 6);
const pluginFactoryContext = {
  agentId: "main",
  sessionKey: "agent:main:discord-thread-111111111111111111",
  deliveryContext: {
    channel: "discord",
    to: "channel:111111111111111111",
    threadId: "111111111111111111",
  },
};
const resolvedRegistered = registered.map((entry) => ({
  ...entry,
  resolvedTool: typeof entry.tool === "function" ? entry.tool(pluginFactoryContext) : entry.tool,
}));
const changeTool = resolvedRegistered.find((entry) => entry.resolvedTool.name === RIDDLE_PROOF_CHANGE_TOOL_NAME);
const statusTool = resolvedRegistered.find((entry) => entry.resolvedTool.name === RIDDLE_PROOF_STATUS_TOOL_NAME);
const waitTool = resolvedRegistered.find((entry) => entry.resolvedTool.name === RIDDLE_PROOF_WAIT_TOOL_NAME);
const inspectTool = resolvedRegistered.find((entry) => entry.resolvedTool.name === RIDDLE_PROOF_INSPECT_TOOL_NAME);
const reviewTool = resolvedRegistered.find((entry) => entry.resolvedTool.name === RIDDLE_PROOF_REVIEW_TOOL_NAME);
const syncTool = resolvedRegistered.find((entry) => entry.resolvedTool.name === RIDDLE_PROOF_SYNC_TOOL_NAME);
assert.ok(changeTool);
assert.ok(statusTool);
assert.ok(waitTool);
assert.ok(inspectTool);
assert.ok(reviewTool);
assert.ok(syncTool);
assert.equal(typeof changeTool.tool, "function");
assert.deepEqual(changeTool.options.names, [RIDDLE_PROOF_CHANGE_TOOL_NAME]);
assert.equal(changeTool.options.optional, true);
assert.equal(statusTool.options.optional, true);
assert.equal(waitTool.options.optional, true);
assert.equal(inspectTool.options.optional, true);
assert.equal(reviewTool.options.optional, true);
assert.equal(syncTool.options.optional, true);

const executed = await changeTool.resolvedTool.execute("test-call", params);
assert.equal(executed.content[0].type, "text");
const parsed = JSON.parse(executed.content[0].text);
assert.equal(parsed.status, "blocked");
assert.equal(parsed.raw.request.integration_context.metadata.tool, result.raw.request.integration_context.metadata.tool);

const factoryContextFixture = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-factory-context-"));
const factoryContextEngineStatePath = path.join(factoryContextFixture, "riddle-state.json");
const factoryContextWrapperStatePath = path.join(factoryContextFixture, "wrapper-state.json");
const factoryRegistered = [];
register({
  pluginConfig: {
    executionMode: "engine",
    defaultShipMode: "none",
    defaultRunMode: "background",
    engine: {
      async execute() {
        writeFileSync(factoryContextEngineStatePath, JSON.stringify({ branch: "agent/factory-context-proof" }, null, 2));
        return {
          ok: true,
          state_path: factoryContextEngineStatePath,
          checkpoint: "verify_ship_ready",
          summary: "Factory context proof is ready.",
          shipGate: { ok: true },
        };
      },
    },
  },
  registerTool(tool, options) {
    factoryRegistered.push({ tool, options });
  },
});
const factoryChangeToolEntry = factoryRegistered.find((entry) => entry.options?.names?.includes(RIDDLE_PROOF_CHANGE_TOOL_NAME));
assert.ok(factoryChangeToolEntry);
const factoryChangeTool = factoryChangeToolEntry.tool(pluginFactoryContext);
const factoryContextExecuted = await factoryChangeTool.execute("test-factory-context", {
  ...params,
  dry_run: false,
  ship_after_verify: false,
  ship_mode: "none",
  harness_state_path: factoryContextWrapperStatePath,
  state_path: factoryContextEngineStatePath,
});
const factoryContextParsed = JSON.parse(factoryContextExecuted.content[0].text);
assert.equal(factoryContextParsed.status, "running");
const factoryContextState = JSON.parse(readFileSync(factoryContextWrapperStatePath, "utf-8"));
const factoryContextWakeEvent = factoryContextState.events.find((event) => event.kind === "run.oc_wake.monitor_registered");
assert.equal(factoryContextWakeEvent.details.dispatchable, true);
assert.equal(factoryContextWakeEvent.details.wake_context.sessionKey, "agent:main:discord-thread-111111111111111111");
assert.equal(factoryContextWakeEvent.details.wake_context.sessionKeySource, "tool_context");

const factoryContextWithExecuteCtxFixture = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-factory-exec-context-"));
const factoryContextWithExecuteCtxEngineStatePath = path.join(factoryContextWithExecuteCtxFixture, "riddle-state.json");
const factoryContextWithExecuteCtxWrapperStatePath = path.join(factoryContextWithExecuteCtxFixture, "wrapper-state.json");
const factoryContextWithExecuteCtxRegistered = [];
register({
  pluginConfig: {
    executionMode: "engine",
    defaultShipMode: "none",
    defaultRunMode: "background",
    engine: {
      async execute() {
        writeFileSync(factoryContextWithExecuteCtxEngineStatePath, JSON.stringify({ branch: "agent/factory-exec-context-proof" }, null, 2));
        return {
          ok: true,
          state_path: factoryContextWithExecuteCtxEngineStatePath,
          checkpoint: "verify_ship_ready",
          summary: "Factory and execute context proof is ready.",
          shipGate: { ok: true },
        };
      },
    },
  },
  registerTool(tool, options) {
    factoryContextWithExecuteCtxRegistered.push({ tool, options });
  },
});
const factoryContextWithExecuteCtxEntry = factoryContextWithExecuteCtxRegistered.find((entry) =>
  entry.options?.names?.includes(RIDDLE_PROOF_CHANGE_TOOL_NAME)
);
assert.ok(factoryContextWithExecuteCtxEntry);
const factoryContextWithExecuteCtxTool = factoryContextWithExecuteCtxEntry.tool(pluginFactoryContext);
const factoryContextWithExecuteCtxExecuted = await factoryContextWithExecuteCtxTool.execute("test-factory-execute-context", {
  ...params,
  dry_run: false,
  ship_after_verify: false,
  ship_mode: "none",
  harness_state_path: factoryContextWithExecuteCtxWrapperStatePath,
  state_path: factoryContextWithExecuteCtxEngineStatePath,
}, { deliveryContext: { channel: "discord" } });
const factoryContextWithExecuteCtxParsed = JSON.parse(factoryContextWithExecuteCtxExecuted.content[0].text);
assert.equal(factoryContextWithExecuteCtxParsed.status, "running");
const factoryContextWithExecuteCtxState = JSON.parse(readFileSync(factoryContextWithExecuteCtxWrapperStatePath, "utf-8"));
const factoryContextWithExecuteCtxWakeEvent = factoryContextWithExecuteCtxState.events.find((event) => event.kind === "run.oc_wake.monitor_registered");
assert.equal(factoryContextWithExecuteCtxWakeEvent.details.dispatchable, true);
assert.equal(factoryContextWithExecuteCtxWakeEvent.details.wake_context.sessionKey, "agent:main:discord-thread-111111111111111111");
assert.equal(factoryContextWithExecuteCtxWakeEvent.details.wake_context.sessionKeySource, "tool_context");

const statusExecuted = await statusTool.resolvedTool.execute("test-status", { state_path: "/tmp/does-not-exist-riddle-proof-state.json" });
const statusParsed = JSON.parse(statusExecuted.content[0].text);
assert.equal(statusParsed.status, "not_found");
assert.equal(statusParsed.diagnostics.path_exists, false);

const waitExecuted = await waitTool.resolvedTool.execute("test-wait", { state_path: reviewWrapperStatePath, timeout_ms: 1000 });
const waitParsed = JSON.parse(waitExecuted.content[0].text);
assert.equal(waitParsed.wait_result, "already_reportable");

const engineOnlyStatusExecuted = await statusTool.resolvedTool.execute("test-status-engine", { state_path: engineStatePath });
const engineOnlyStatusParsed = JSON.parse(engineOnlyStatusExecuted.content[0].text);
assert.equal(engineOnlyStatusParsed.status, "not_found");
assert.equal(engineOnlyStatusParsed.diagnostics.path_exists, true);
assert.equal(engineOnlyStatusParsed.diagnostics.expected_state_path_type, "wrapper_run_state");
assert.equal(engineOnlyStatusParsed.diagnostics.looks_like_engine_state, true);

const terminalStatus = readOpenClawRiddleProofStatus(reviewWrapperStatePath);
assert.equal(terminalStatus.package_metadata.plugin_package, "@riddledc/openclaw-riddle-proof");
assert.equal(terminalStatus.package_metadata.plugin_version, openclawRiddleProofPackageJson.version);
assert.equal(terminalStatus.package_metadata.dependency_package, "@riddledc/riddle-proof");
assert.equal(terminalStatus.package_metadata.dependency_version, riddleProofPackageJson.version);
assert.equal(terminalStatus.request_metadata.reference_input_ignored, "use the public tic tac toe route");
assert.equal(terminalStatus.request_metadata.effective_reference, "before");
assert.equal(terminalStatus.monitor_contract.report_mode, "terminal_only");
assert.equal(terminalStatus.monitor_contract.should_continue_monitoring, false);
const immediateWait = await waitOpenClawRiddleProof({ state_path: reviewWrapperStatePath, timeout_ms: 1000 });
assert.equal(immediateWait.wait_result, "already_reportable");
assert.equal(immediateWait.poll_count, 0);

const terminalOnlyRunningWrapperStatePath = path.join(reviewFixture, "wrapper-running.json");
writeFileSync(terminalOnlyRunningWrapperStatePath, JSON.stringify({
  version: "riddle-proof.run-state.v1",
  run_id: "rp_running_terminal_only",
  status: "running",
  created_at: "2026-04-23T00:00:00.000Z",
  updated_at: "2026-04-23T00:00:00.000Z",
  request: {
    repo: "davisdiehl/lilarcade",
    change_request: "Polish Tic Tac Toe status",
    engine_state_path: reviewStatePath,
    integration_context: {
      source: "openclaw",
      metadata: {
        report_mode: "terminal_only",
        wait_for_terminal: true,
      },
    },
  },
  iterations: 1,
  events: [],
}, null, 2));
const runningTerminalStatus = readOpenClawRiddleProofStatus(terminalOnlyRunningWrapperStatePath);
assert.equal(runningTerminalStatus.monitor_contract.report_mode, "terminal_only");
assert.equal(runningTerminalStatus.monitor_contract.should_continue_monitoring, true);
assert.equal(runningTerminalStatus.monitor_contract.response_gate, "hold_for_terminal");

const blockedImplementEngineStatePath = path.join(reviewFixture, "riddle-state-blocked-implement.json");
writeFileSync(blockedImplementEngineStatePath, JSON.stringify({
  branch: "agent/tic-tac-toe-blocked",
  implementation_status: "changes_missing",
  implementation_summary: "No implementation detected on the after worktree.",
  implementation_detection_summary:
    "Implementation detection found no material code changes (dirty=0, committed=0, changed=0; probes=requested_base, branch_base).",
  implementation_detection: {
    outcome: "no_changes_detected",
    diff_detected: false,
    base_ref_requested: "origin/main",
    dirty_path_count: 0,
    committed_path_count: 0,
    changed_path_count: 0,
    diff_probes: [
      { label: "requested_base", returncode: 128, path_count: 0 },
      { label: "branch_base", returncode: 0, path_count: 0 },
    ],
    authored_inputs_ready: true,
  },
}, null, 2));
const terminalOnlyBlockedWrapperStatePath = path.join(reviewFixture, "wrapper-blocked-routable.json");
writeFileSync(terminalOnlyBlockedWrapperStatePath, JSON.stringify({
  version: "riddle-proof.run-state.v1",
  run_id: "rp_blocked_terminal_only",
  status: "blocked",
  created_at: "2026-04-23T00:00:00.000Z",
  updated_at: "2026-04-23T00:00:00.000Z",
  request: {
    repo: "davisdiehl/lilarcade",
    change_request: "Polish Tic Tac Toe status",
    engine_state_path: blockedImplementEngineStatePath,
    verification_mode: "visual",
    integration_context: {
      source: "openclaw",
      metadata: {
        report_mode: "terminal_only",
        wait_for_terminal: true,
      },
    },
  },
  last_checkpoint: "implement_changes_missing",
  blocker: {
    code: "implement_changes_missing",
    checkpoint: "implement_changes_missing",
    message: "No implementation detected on the after worktree.",
  },
  iterations: 2,
  events: [],
}, null, 2));
const blockedTerminalStatus = readOpenClawRiddleProofStatus(terminalOnlyBlockedWrapperStatePath);
assert.equal(blockedTerminalStatus.monitor_contract.report_mode, "terminal_only");
assert.equal(blockedTerminalStatus.monitor_contract.should_continue_monitoring, true);
assert.equal(blockedTerminalStatus.monitor_contract.response_gate, "hold_for_terminal");
assert.equal(blockedTerminalStatus.checkpoint_classification, "routable");
assert.equal(blockedTerminalStatus.checkpoint_disposition, "retryable_implementation_gap");
assert.equal(blockedTerminalStatus.recommended_poll_after_ms, 10000);
assert.equal(blockedTerminalStatus.suggested_next_action, "continue_monitoring");
assert.equal(blockedTerminalStatus.implementation_status, "changes_missing");
assert.equal(blockedTerminalStatus.implementation_summary, "No implementation detected on the after worktree.");
assert.equal(blockedTerminalStatus.implementation_detection_summary.includes("no material code changes"), true);
assert.equal(blockedTerminalStatus.implementation_detection?.outcome, "no_changes_detected");
assert.equal(blockedTerminalStatus.implementation_agent_attempt_count, 0);
assert.equal(blockedTerminalStatus.implementation_gap_origin, "before_agent_edit");

const blockedInspectResult = inspectOpenClawRiddleProof({ state_path: terminalOnlyBlockedWrapperStatePath });
assert.equal(blockedInspectResult.package_metadata.plugin_version, openclawRiddleProofPackageJson.version);
assert.equal(blockedInspectResult.package_metadata.dependency_version, riddleProofPackageJson.version);
assert.equal(blockedInspectResult.monitor_contract.report_mode, "terminal_only");
assert.equal(blockedInspectResult.monitor_contract.should_continue_monitoring, true);
assert.equal(blockedInspectResult.monitor_contract.response_gate, "hold_for_terminal");
assert.equal(blockedInspectResult.implementation_status, "changes_missing");
assert.equal(blockedInspectResult.implementation_detection?.diff_detected, false);
assert.equal(blockedInspectResult.implementation_detection?.diff_probes?.[0]?.label, "requested_base");
assert.equal(blockedInspectResult.implementation_agent_attempt_count, 0);
assert.equal(blockedInspectResult.implementation_gap_origin, "before_agent_edit");

const blockedAfterAttemptWrapperStatePath = path.join(reviewFixture, "wrapper-blocked-routable-after-attempt.json");
writeFileSync(blockedAfterAttemptWrapperStatePath, JSON.stringify({
  version: "riddle-proof.run-state.v1",
  run_id: "rp_blocked_after_attempt",
  status: "blocked",
  created_at: "2026-04-23T00:00:00.000Z",
  updated_at: "2026-04-23T00:00:00.000Z",
  request: {
    repo: "davisdiehl/lilarcade",
    change_request: "Polish Tic Tac Toe status",
    engine_state_path: blockedImplementEngineStatePath,
    verification_mode: "visual",
  },
  last_checkpoint: "implement_changes_missing",
  blocker: {
    code: "implement_changes_missing",
    checkpoint: "implement_changes_missing",
    message: "No implementation detected on the after worktree.",
  },
  iterations: 3,
  events: [
    {
      ts: "2026-04-23T00:01:00.000Z",
      kind: "agent.implementation.started",
      checkpoint: "implement_changes_missing",
      stage: "implement",
      summary: "Implementation agent started working in the after worktree.",
      details: { worktree_path: "/tmp/example-after" },
    },
    {
      ts: "2026-04-23T00:01:10.000Z",
      kind: "agent.implementation.no_diff",
      checkpoint: "implement_changes_missing",
      stage: "implement",
      summary: "Implementation adapter returned without leaving a detectable git diff.",
      details: {
        worktree_path: "/tmp/example-after",
        changed_files: [],
        tests_run: [],
        implementation_notes: "No code paths looked relevant.",
      },
    },
  ],
}, null, 2));
const blockedAfterAttemptStatus = readOpenClawRiddleProofStatus(blockedAfterAttemptWrapperStatePath);
assert.equal(blockedAfterAttemptStatus.implementation_agent_attempt_count, 1);
assert.equal(blockedAfterAttemptStatus.implementation_gap_origin, "after_agent_attempt");
assert.equal(blockedAfterAttemptStatus.implementation_agent_last_outcome.kind, "agent.implementation.no_diff");
assert.equal(typeof blockedAfterAttemptStatus.implementation_agent_last_outcome.details, "string");

const blockedDuringAttemptWrapperStatePath = path.join(reviewFixture, "wrapper-blocked-routable-during-attempt.json");
writeFileSync(blockedDuringAttemptWrapperStatePath, JSON.stringify({
  version: "riddle-proof.run-state.v1",
  run_id: "rp_blocked_during_attempt",
  status: "blocked",
  created_at: "2026-04-23T00:00:00.000Z",
  updated_at: "2026-04-23T00:00:00.000Z",
  request: {
    repo: "davisdiehl/lilarcade",
    change_request: "Polish Tic Tac Toe status",
    engine_state_path: blockedImplementEngineStatePath,
    verification_mode: "visual",
  },
  last_checkpoint: "implement_changes_missing",
  blocker: {
    code: "implement_changes_missing",
    checkpoint: "implement_changes_missing",
    message: "No implementation detected on the after worktree.",
  },
  iterations: 3,
  events: [
    {
      ts: "2026-04-23T00:01:00.000Z",
      kind: "agent.implementation.started",
      checkpoint: "implement_changes_missing",
      stage: "implement",
      summary: "Implementation agent started working in the after worktree.",
      details: { worktree_path: "/tmp/example-after" },
    },
  ],
}, null, 2));
const blockedDuringAttemptStatus = readOpenClawRiddleProofStatus(blockedDuringAttemptWrapperStatePath);
assert.equal(blockedDuringAttemptStatus.implementation_agent_attempt_count, 1);
assert.equal(blockedDuringAttemptStatus.implementation_gap_origin, "during_agent_attempt");
assert.equal(blockedDuringAttemptStatus.implementation_agent_last_event.kind, "agent.implementation.started");
assert.equal(blockedDuringAttemptStatus.implementation_agent_last_outcome, null);
assert.equal(blockedDuringAttemptStatus.checkpoint_classification, "in_progress");
assert.equal(blockedDuringAttemptStatus.checkpoint_disposition, "implementation_in_flight");
assert.equal(blockedDuringAttemptStatus.monitor_contract.response_gate, "hold_for_implementation_outcome");
assert.equal(blockedDuringAttemptStatus.monitor_contract.should_continue_monitoring, true);
assert.equal(
  blockedDuringAttemptStatus.monitor_plan.stop_when,
  "implementation outcome, reportable state, or terminal status",
);

const blockedDuringAttemptInspect = inspectOpenClawRiddleProof({ state_path: blockedDuringAttemptWrapperStatePath });
assert.equal(blockedDuringAttemptInspect.implementation_gap_origin, "during_agent_attempt");
assert.equal(blockedDuringAttemptInspect.monitor_contract.response_gate, "hold_for_implementation_outcome");
assert.equal(blockedDuringAttemptInspect.monitor_contract.should_continue_monitoring, true);

const blockedMaxIterationsWrapperStatePath = path.join(reviewFixture, "wrapper-blocked-max-iterations.json");
writeFileSync(blockedMaxIterationsWrapperStatePath, JSON.stringify({
  version: "riddle-proof.run-state.v1",
  run_id: "rp_blocked_max_iterations",
  status: "blocked",
  created_at: "2026-04-23T00:00:00.000Z",
  updated_at: "2026-04-23T00:00:00.000Z",
  request: {
    repo: "riddledc/riddle-site",
    change_request: "Make a tiny homepage punctuation change.",
    engine_state_path: reviewStatePath,
    verification_mode: "visual",
  },
  last_checkpoint: "recon_supervisor_judgment",
  blocker: {
    code: "max_iterations_reached",
    checkpoint: "recon_supervisor_judgment",
    message: "Harness reached max_iterations=1 before proof was ready or shipped.",
  },
  iterations: 1,
  events: [],
}, null, 2));
const blockedMaxIterationsStatus = readOpenClawRiddleProofStatus(blockedMaxIterationsWrapperStatePath);
assert.equal(blockedMaxIterationsStatus.is_terminal, true);
assert.equal(blockedMaxIterationsStatus.is_routable_checkpoint, false);
assert.equal(blockedMaxIterationsStatus.monitor_should_continue, false);
assert.equal(blockedMaxIterationsStatus.suggested_next_action, "report_terminal_status");
assert.equal(blockedMaxIterationsStatus.monitor_contract.response_gate, "release_terminal");
assert.equal(blockedMaxIterationsStatus.monitor_contract.should_continue_monitoring, false);

const inspectExecuted = await inspectTool.tool.execute("test-inspect", { state_path: reviewWrapperStatePath });
const inspectParsed = JSON.parse(inspectExecuted.content[0].text);
assert.equal(inspectParsed.package_metadata.plugin_package, "@riddledc/openclaw-riddle-proof");
assert.equal(inspectParsed.package_metadata.dependency_package, "@riddledc/riddle-proof");
assert.equal(inspectParsed.route_matched, true);
assert.equal(inspectParsed.proof_profile_applied, true);
assert.equal(inspectParsed.request_metadata.reference_input_ignored, "use the public tic tac toe route");
assert.equal(inspectParsed.request_metadata.effective_reference, "before");
assert.equal(inspectParsed.structured_evidence.proof_evidence_present, true);
assert.equal(inspectParsed.monitor_contract.response_gate, "release_terminal");

const statusDebugExecuted = await statusTool.tool.execute("test-status-debug", { state_path: reviewWrapperStatePath, debug: true });
const statusDebugParsed = JSON.parse(statusDebugExecuted.content[0].text);
assert.equal(statusDebugParsed.timing_summary.workflow_step_durations_ms.setup, 60000);
assert.equal(Array.isArray(statusDebugParsed.debug.engine_runtime_events_recent), true);

const inspectDebugExecuted = await inspectTool.tool.execute("test-inspect-debug", { state_path: reviewWrapperStatePath, debug: true });
const inspectDebugParsed = JSON.parse(inspectDebugExecuted.content[0].text);
assert.equal(inspectDebugParsed.timing_summary.capture_hint.server_path, "/games/tic-tac-toe");
assert.equal(Array.isArray(inspectDebugParsed.debug.capture_diagnostics_recent), true);

console.log(JSON.stringify({ ok: true }));
