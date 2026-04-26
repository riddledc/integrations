import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
  createOpenClawRiddleProofResult,
  runOpenClawRiddleProof,
  inspectOpenClawRiddleProof,
  readOpenClawRiddleProofStatus,
  waitOpenClawRiddleProof,
  submitOpenClawRiddleProofReview,
  syncOpenClawRiddleProof,
} from "./dist/index.js";

const openclawRiddleProofPackageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const riddleProofPackageJson = JSON.parse(readFileSync(new URL("../riddle-proof/package.json", import.meta.url), "utf8"));

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
assert.equal(result.raw?.request?.integration_context?.source, "discord");
assert.equal(result.event_count, 1);

const terminalOnlyResult = createOpenClawRiddleProofResult({
  ...params,
  report_mode: "terminal_only",
  wait_for_terminal: true,
});
assert.equal(terminalOnlyResult.raw?.request?.integration_context?.metadata?.report_mode, "terminal_only");
assert.equal(terminalOnlyResult.raw?.request?.integration_context?.metadata?.wait_for_terminal, true);

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
    return {
      ok: true,
      json: {
        summary: "Thought through the change but did not leave a diff yet.",
        implementation_notes: "",
        changed_files: [],
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
);
assert.equal(backgroundResult.status, "running");
assert.equal(backgroundResult.raw?.background, true);
assert.equal(backgroundResult.state_path, backgroundWrapperStatePath);
assert.equal(backgroundResult.raw?.monitor_contract?.report_mode, "checkpoint");
assert.equal(backgroundResult.raw?.monitor_contract?.response_gate, "checkpoint_ok");
assert.ok(backgroundResult.raw?.next_actions?.[0]?.includes(RIDDLE_PROOF_WAIT_TOOL_NAME));
assert.ok(backgroundResult.raw?.next_actions?.[1]?.includes("monitor_should_continue"));
assert.ok(backgroundResult.raw?.next_actions?.[2]?.includes("final inspection snapshots"));
assert.equal(existsSync(backgroundWrapperStatePath), true);

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
const backgroundState = JSON.parse(readFileSync(backgroundWrapperStatePath, "utf-8"));
assert.equal(backgroundState.events[0].kind, "run.background.started");
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
assert.equal(enrichedBackgroundStatus?.wake_strategy?.signal, "run.wake.requested");
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
assert.equal(runningBackgroundStatus?.is_routable_checkpoint, true);
assert.equal(runningBackgroundStatus?.checkpoint_classification, "routable");
assert.equal(runningBackgroundStatus?.suggested_next_action, "continue_monitoring");
const timeoutWait = await waitOpenClawRiddleProof({ state_path: backgroundWrapperStatePath, timeout_ms: 1000 });
assert.equal(timeoutWait.wait_result, "timeout");
assert.ok(timeoutWait.waited_ms >= 1000);

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

const reviewFixture = mkdtempSync(path.join(os.tmpdir(), "openclaw-riddle-proof-review-"));
const reviewStatePath = path.join(reviewFixture, "riddle-state.json");
const reviewWrapperStatePath = path.join(reviewFixture, "wrapper-state.json");
writeFileSync(reviewStatePath, JSON.stringify({
  branch: "agent/review-fixture",
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
assert.equal(reviewBlocked.status, "blocked");
assert.equal(reviewBlocked.blocker?.code, "main_agent_proof_review_required");
assert.equal(
  reviewBlocked.blocker?.details?.proof_review?.image_artifacts?.some((item) => item.url === "https://example.com/after.png"),
  true,
);
assert.equal(reviewBlocked.blocker?.details?.proof_review?.semantic_context?.route?.after_observed_path, "/games/tic-tac-toe");
assert.deepEqual(reviewBlocked.blocker?.details?.proof_review?.semantic_context?.after?.buttons, ["Reset Game"]);
assert.equal(reviewBlocked.blocker?.details?.proof_review?.artifact_contract?.required?.screenshot, true);
assert.deepEqual(reviewBlocked.blocker?.details?.proof_review?.artifact_usage?.missing_required_signals, []);
assert.equal(reviewBlocked.blocker?.details?.proof_review?.artifact_production?.image_output_count, 1);
assert.equal(reviewBlocked.blocker?.details?.proof_review?.response_schema?.state_path, reviewWrapperStatePath);

const inspectResult = inspectOpenClawRiddleProof({ state_path: reviewWrapperStatePath });
assert.equal(inspectResult.ok, true);
assert.equal(inspectResult.route_matched, true);
assert.equal(inspectResult.monitor_contract.report_mode, "terminal_only");
assert.equal(inspectResult.monitor_contract.response_gate, "release_terminal");
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
assert.equal(inspectResult.timing_summary?.workflow_step_durations_ms?.setup, 60000);
assert.equal(inspectResult.timing_summary?.workflow_phase_durations_ms?.["setup:shared_deps"], 30000);
assert.equal(inspectResult.timing_summary?.recon_subphase_durations_ms?.before_capture, 12000);
assert.equal(inspectResult.timing_summary?.verify_subphase_durations_ms?.capture, 20000);
assert.equal(inspectResult.timing_summary?.retry_counts?.recon, 1);
assert.equal(inspectResult.timing_summary?.capture_hint?.saved_status, "saved");
assert.equal(inspectResult.artifact_contract?.required?.screenshot, true);
assert.equal(inspectResult.artifact_production?.image_output_count, 1);
assert.equal(inspectResult.artifact_usage?.supervisor_review_signals?.includes("semantic-context"), true);

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
assert.equal(queryRouteInspect.ready_to_ship_candidate, true);

const reviewStatus = readOpenClawRiddleProofStatus(reviewWrapperStatePath, { debug: true });
assert.equal(reviewStatus?.capture_hint?.server_path, "/games/tic-tac-toe");
assert.equal(reviewStatus?.timing_summary?.workflow_step_durations_ms?.setup, 60000);
assert.equal(reviewStatus?.timing_summary?.workflow_phase_durations_ms?.["setup:shared_deps"], 30000);
assert.equal(reviewStatus?.timing_summary?.recon_subphase_durations_ms?.before_capture, 12000);
assert.equal(reviewStatus?.timing_summary?.verify_subphase_durations_ms?.capture, 20000);
assert.equal(reviewStatus?.timing_summary?.retry_counts?.recon, 1);
assert.equal(Array.isArray(reviewStatus?.debug?.wrapper_events_recent), true);
assert.equal(Array.isArray(reviewStatus?.debug?.engine_runtime_events_recent), true);
assert.equal(Array.isArray(reviewStatus?.debug?.capture_diagnostics_recent), true);

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
assert.equal(reviewResumeEngineCalls.length, 0);
const reviewResumedState = JSON.parse(readFileSync(reviewWrapperStatePath, "utf-8"));
const reviewResumedEvent = reviewResumedState.events.findLast((event) => event.kind === "agent.proof_assessment.completed");
assert.equal(reviewResumedEvent.details.payload.source, "supervising_agent");
assert.equal(reviewResumedEvent.details.payload.continue_with_stage, "ship");

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
const changeTool = registered.find((entry) => entry.tool.name === RIDDLE_PROOF_CHANGE_TOOL_NAME);
const statusTool = registered.find((entry) => entry.tool.name === RIDDLE_PROOF_STATUS_TOOL_NAME);
const waitTool = registered.find((entry) => entry.tool.name === RIDDLE_PROOF_WAIT_TOOL_NAME);
const inspectTool = registered.find((entry) => entry.tool.name === RIDDLE_PROOF_INSPECT_TOOL_NAME);
const reviewTool = registered.find((entry) => entry.tool.name === RIDDLE_PROOF_REVIEW_TOOL_NAME);
const syncTool = registered.find((entry) => entry.tool.name === RIDDLE_PROOF_SYNC_TOOL_NAME);
assert.ok(changeTool);
assert.ok(statusTool);
assert.ok(waitTool);
assert.ok(inspectTool);
assert.ok(reviewTool);
assert.ok(syncTool);
assert.equal(changeTool.options.optional, true);
assert.equal(statusTool.options.optional, true);
assert.equal(waitTool.options.optional, true);
assert.equal(inspectTool.options.optional, true);
assert.equal(reviewTool.options.optional, true);
assert.equal(syncTool.options.optional, true);

const executed = await changeTool.tool.execute("test-call", params);
assert.equal(executed.content[0].type, "text");
const parsed = JSON.parse(executed.content[0].text);
assert.equal(parsed.status, "blocked");
assert.equal(parsed.raw.request.integration_context.metadata.tool, result.raw.request.integration_context.metadata.tool);

const statusExecuted = await statusTool.tool.execute("test-status", { state_path: "/tmp/does-not-exist-riddle-proof-state.json" });
const statusParsed = JSON.parse(statusExecuted.content[0].text);
assert.equal(statusParsed.status, "not_found");
assert.equal(statusParsed.diagnostics.path_exists, false);

const waitExecuted = await waitTool.tool.execute("test-wait", { state_path: reviewWrapperStatePath, timeout_ms: 1000 });
const waitParsed = JSON.parse(waitExecuted.content[0].text);
assert.equal(waitParsed.wait_result, "already_reportable");

const engineOnlyStatusExecuted = await statusTool.tool.execute("test-status-engine", { state_path: engineStatePath });
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
