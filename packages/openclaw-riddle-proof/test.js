import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import register, {
  RIDDLE_PROOF_CHANGE_TOOL_NAME,
  RIDDLE_PROOF_INSPECT_TOOL_NAME,
  RIDDLE_PROOF_REVIEW_TOOL_NAME,
  RIDDLE_PROOF_STATUS_TOOL_NAME,
  RIDDLE_PROOF_SYNC_TOOL_NAME,
  createCodexExecAgentAdapter,
  createOpenClawRiddleProofResult,
  runOpenClawRiddleProof,
  inspectOpenClawRiddleProof,
  readOpenClawRiddleProofStatus,
  submitOpenClawRiddleProofReview,
  syncOpenClawRiddleProof,
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
        writeFileSync(backgroundEngineStatePath, JSON.stringify({ branch: "agent/background-proof" }, null, 2));
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
const backgroundState = JSON.parse(readFileSync(backgroundWrapperStatePath, "utf-8"));
assert.equal(backgroundState.events[0].kind, "run.background.started");
assert.equal(backgroundState.events.some((event) => event.checkpoint === "verify_ship_ready"), true);
assert.equal(backgroundState.events.at(-1).kind, "run.wake.requested");
assert.deepEqual(backgroundState.events.at(-1).details.next_tools, [
  RIDDLE_PROOF_STATUS_TOOL_NAME,
  RIDDLE_PROOF_SYNC_TOOL_NAME,
]);
writeFileSync(backgroundEngineStatePath, JSON.stringify({
  branch: "agent/background-proof",
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
assert.equal(typeof enrichedBackgroundStatus?.substep_elapsed_ms, "number");
assert.equal(typeof enrichedBackgroundStatus?.phase_elapsed_ms, "number");
assert.equal(enrichedBackgroundStatus?.recommended_poll_after_ms, null);
assert.equal(enrichedBackgroundStatus?.wake_strategy?.signal, "run.wake.requested");
writeFileSync(backgroundWrapperStatePath, JSON.stringify({
  ...backgroundState,
  status: "running",
  current_stage: "setup",
}, null, 2));
const runningBackgroundStatus = readOpenClawRiddleProofStatus(backgroundWrapperStatePath);
assert.equal(runningBackgroundStatus?.current_stage, "verify");
assert.equal(runningBackgroundStatus?.wrapper_current_stage, "setup");
assert.equal(runningBackgroundStatus?.engine_current_stage, "verify");
assert.equal(runningBackgroundStatus?.recommended_poll_after_ms, 30000);

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
  proof_profile: {
    name: "Tic Tac Toe",
    applied_fields: ["server_path", "wait_for_selector"],
  },
  evidence_bundle: {
    expected_path: "/games/tic-tac-toe",
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
    harness_state_path: reviewWrapperStatePath,
    state_path: reviewStatePath,
    change_request: "Make Tic Tac Toe board polish visibly stronger",
  },
  {
    executionMode: "engine",
    defaultShipMode: "none",
    proofReviewMode: "main_agent",
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
assert.equal(reviewBlocked.blocker?.details?.proof_review?.response_schema?.state_path, reviewWrapperStatePath);

const inspectResult = inspectOpenClawRiddleProof({ state_path: reviewWrapperStatePath });
assert.equal(inspectResult.ok, true);
assert.equal(inspectResult.route_matched, true);
assert.equal(inspectResult.proof_profile_applied, true);
assert.equal(inspectResult.proof_profile?.name, "Tic Tac Toe");
assert.equal(inspectResult.ready_to_ship_candidate, true);
assert.deepEqual(inspectResult.visible_change?.after_buttons, ["Reset Game"]);
assert.equal(inspectResult.structured_evidence?.proof_evidence_present, true);
assert.match(inspectResult.structured_evidence?.proof_evidence_sample, /attack_ms_after/);

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
assert.equal(JSON.parse(reviewResumeEngineCalls[0].proof_assessment_json).source, "supervising_agent");
assert.equal(JSON.parse(reviewResumeEngineCalls[0].proof_assessment_json).continue_with_stage, "ship");

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

assert.equal(registered.length, 5);
const changeTool = registered.find((entry) => entry.tool.name === RIDDLE_PROOF_CHANGE_TOOL_NAME);
const statusTool = registered.find((entry) => entry.tool.name === RIDDLE_PROOF_STATUS_TOOL_NAME);
const inspectTool = registered.find((entry) => entry.tool.name === RIDDLE_PROOF_INSPECT_TOOL_NAME);
const reviewTool = registered.find((entry) => entry.tool.name === RIDDLE_PROOF_REVIEW_TOOL_NAME);
const syncTool = registered.find((entry) => entry.tool.name === RIDDLE_PROOF_SYNC_TOOL_NAME);
assert.ok(changeTool);
assert.ok(statusTool);
assert.ok(inspectTool);
assert.ok(reviewTool);
assert.ok(syncTool);
assert.equal(changeTool.options.optional, true);
assert.equal(statusTool.options.optional, true);
assert.equal(inspectTool.options.optional, true);
assert.equal(reviewTool.options.optional, true);
assert.equal(syncTool.options.optional, true);

const executed = await changeTool.tool.execute("test-call", params);
assert.equal(executed.content[0].type, "text");
const parsed = JSON.parse(executed.content[0].text);
assert.equal(parsed.status, "blocked");
assert.equal(parsed.raw.request.integration_context.metadata.tool, "riddle_proof_change");

const statusExecuted = await statusTool.tool.execute("test-status", { state_path: "/tmp/does-not-exist-riddle-proof-state.json" });
const statusParsed = JSON.parse(statusExecuted.content[0].text);
assert.equal(statusParsed.status, "not_found");

const inspectExecuted = await inspectTool.tool.execute("test-inspect", { state_path: reviewWrapperStatePath });
const inspectParsed = JSON.parse(inspectExecuted.content[0].text);
assert.equal(inspectParsed.route_matched, true);
assert.equal(inspectParsed.proof_profile_applied, true);
assert.equal(inspectParsed.structured_evidence.proof_evidence_present, true);

console.log(JSON.stringify({ ok: true }));
