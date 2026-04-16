import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  appendStageHeartbeat,
  appendRunEvent,
  applyTerminalMetadata,
  createRunStatusSnapshot,
  createRunState,
  createRunResult,
  isSuccessfulStatus,
  isTerminalStatus,
  normalizeTerminalMetadata,
  runRiddleProof,
  setRunStatus,
} from "./dist/index.js";
import {
  parseOpenClawAssertions,
  toRiddleProofRunParams,
} from "./dist/openclaw.js";

const require = createRequire(import.meta.url);
const cjs = require("./dist/index.cjs");
const cjsOpenClaw = require("./dist/openclaw.cjs");
assert.equal(typeof cjs.normalizeTerminalMetadata, "function");
assert.equal(typeof cjs.runRiddleProof, "function");
assert.equal(typeof cjsOpenClaw.toRiddleProofRunParams, "function");

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

function baseState() {
  return {
    version: "riddle-proof.run-state.v1",
    status: "running",
    created_at: "2026-04-15T00:00:00.000Z",
    updated_at: "2026-04-15T00:00:00.000Z",
    request: {
      repo: "davisdiehl/lilarcade",
      change_request: "Add a cool new visual to the tic tac toe game.",
      verification_mode: "visual",
    },
    iterations: 6,
    last_checkpoint: "ship_review",
    events: [
      {
        ts: "2026-04-15T00:00:00.000Z",
        kind: "engine_result",
        checkpoint: "ship_review",
      },
    ],
  };
}

const terminalMetadata = normalizeTerminalMetadata({
  riddleState: {
    pr_url: "https://github.com/davisdiehl/lilarcade/pull/255",
    marked_ready: true,
    discord_notification: {
      ok: true,
      channel_id: "111111111111111111",
      message_id: "333333333333333333",
    },
    proof_decision: "ready_to_ship",
    merge_recommendation: "ready_to_ship (supervising-agent proof assessment)",
    finalized: true,
  },
});

assert.deepEqual(terminalMetadata, {
  pr_url: "https://github.com/davisdiehl/lilarcade/pull/255",
  marked_ready: true,
  notification: {
    ok: true,
    channel_id: "111111111111111111",
    message_id: "333333333333333333",
  },
  proof_decision: "ready_to_ship",
  merge_recommendation: "ready_to_ship (supervising-agent proof assessment)",
  finalized: true,
});

const state = applyTerminalMetadata(baseState(), terminalMetadata);
assert.equal(state.pr_url, "https://github.com/davisdiehl/lilarcade/pull/255");
assert.equal(state.marked_ready, true);
assert.equal(state.notification.message_id, "333333333333333333");

const result = createRunResult({
  state,
  status: "shipped",
  state_path: "/tmp/riddle-proof-state.json",
  last_summary: "Ship completed.",
  metadata: terminalMetadata,
});

assert.deepEqual(result, {
  ok: true,
  status: "shipped",
  state_path: "/tmp/riddle-proof-state.json",
  iterations: 6,
  last_checkpoint: "ship_review",
  last_summary: "Ship completed.",
  event_count: 1,
  pr_url: "https://github.com/davisdiehl/lilarcade/pull/255",
  marked_ready: true,
  notification: {
    ok: true,
    channel_id: "111111111111111111",
    message_id: "333333333333333333",
  },
  proof_decision: "ready_to_ship",
  merge_recommendation: "ready_to_ship (supervising-agent proof assessment)",
  finalized: true,
});

assert.equal(isTerminalStatus("shipped"), true);
assert.equal(isTerminalStatus("running"), false);
assert.equal(isSuccessfulStatus("blocked"), false);
assert.equal(isSuccessfulStatus("ready_to_ship"), true);

const fallbackMetadata = normalizeTerminalMetadata({
  engineResult: {
    prUrl: "https://github.com/example/repo/pull/1",
    markedReady: false,
    checkpointContract: {
      details: {
        finalized: false,
      },
    },
  },
});

assert.deepEqual(fallbackMetadata, {
  pr_url: "https://github.com/example/repo/pull/1",
  marked_ready: false,
  finalized: false,
});

const referenceRun = readJson("./fixtures/shipped-oc-visual-run.json");
const referenceParams = toRiddleProofRunParams({
  repo: referenceRun.request.repo,
  branch: referenceRun.request.branch,
  change_request: referenceRun.request.change_request,
  success_criteria: referenceRun.request.success_criteria,
  verification_mode: referenceRun.request.verification_mode,
  assertions_json: JSON.stringify(referenceRun.evidence_bundle.assertions),
  discord_channel: referenceRun.request.integration_context.channel_id,
  discord_thread_id: referenceRun.request.integration_context.thread_id,
  discord_message_id: referenceRun.request.integration_context.message_id,
  discord_source_url: referenceRun.request.integration_context.source_url,
});
const referenceMetadata = normalizeTerminalMetadata({
  riddleState: referenceRun.riddle_state,
});

assert.deepEqual(referenceMetadata, {
  pr_url: "https://github.com/davisdiehl/lilarcade/pull/255",
  marked_ready: true,
  notification: {
    ok: true,
    status: 200,
    channel_id: "111111111111111111",
    parent_channel_id: "",
    thread_id: "111111111111111111",
    source_message_id: "222222222222222222",
    message_id: "333333333333333333",
    pr_url: "https://github.com/davisdiehl/lilarcade/pull/255",
  },
  proof_decision: "ready_to_ship",
  merge_recommendation: "ready_to_ship (supervising-agent proof assessment)",
  finalized: true,
});

assert.equal(referenceParams.integration_context.source, "discord");
assert.equal(referenceParams.integration_context.thread_id, "111111111111111111");
assert.equal(referenceParams.integration_context.metadata.tool, "proofed_change_run");
assert.equal(referenceParams.assertions.interactive_elements, 11);
assert.equal(parseOpenClawAssertions("plain text assertion"), "plain text assertion");

const referenceState = createRunState({
  state_path: referenceRun.harness.riddle_state_path,
  created_at: referenceRun.captured_at,
  updated_at: referenceRun.captured_at,
  request: referenceParams,
});
for (const event of referenceRun.harness.events) appendRunEvent(referenceState, event);
referenceState.iterations = referenceRun.harness.iterations;

const referenceResult = createRunResult({
  state: referenceState,
  status: referenceRun.harness.status,
  state_path: referenceRun.harness.riddle_state_path,
  last_summary: referenceRun.harness.last_summary,
  metadata: referenceMetadata,
  evidence_bundle: referenceRun.evidence_bundle,
});

assert.equal(referenceResult.ok, true);
assert.equal(referenceResult.status, "shipped");
assert.equal(referenceResult.iterations, 6);
assert.equal(referenceResult.event_count, 3);
assert.equal(referenceResult.last_checkpoint, "ship_review");
assert.equal(referenceResult.pr_url, "https://github.com/davisdiehl/lilarcade/pull/255");
assert.equal(referenceResult.marked_ready, true);
assert.equal(referenceResult.notification.message_id, "333333333333333333");
assert.equal(referenceResult.proof_decision, "ready_to_ship");
assert.equal(referenceResult.finalized, true);
assert.equal(referenceResult.evidence_bundle.verification_mode, "visual");
assert.equal(referenceResult.evidence_bundle.after.url, "https://riddle-screenshots-748553757828.s3.amazonaws.com/server-previews/sp_5af97d38/after-proof.png");
assert.equal(referenceResult.evidence_bundle.baselines[0].kind, "before");
assert.equal(referenceResult.evidence_bundle.assertions.interactive_elements, 11);
assert.equal(referenceState.request.integration_context.source, "discord");

const blockedState = setRunStatus(createRunState({
  request: { change_request: "needs more proof", verification_mode: "audio" },
  run_id: "rp_blocked",
  created_at: "2026-04-15T00:00:00.000Z",
}), "blocked", "2026-04-15T00:01:00.000Z");
assert.equal(blockedState.ok, false);
assert.equal(blockedState.updated_at, "2026-04-15T00:01:00.000Z");

const statusState = createRunState({
  request: {
    repo: "riddledc/example",
    branch: "proof/worktree",
    change_request: "track proof run status",
  },
  run_id: "rp_status",
  state_path: "/tmp/riddle-proof/state.json",
  worktree_path: "/tmp/riddle-proof/worktree",
  created_at: "2026-04-15T00:00:00.000Z",
});
appendStageHeartbeat(statusState, {
  stage: "setup",
  wait_reason: "waiting_for_clean_worktree",
  ts: "2026-04-15T00:00:05.000Z",
});
const statusSnapshot = createRunStatusSnapshot(statusState, "2026-04-15T00:00:10.000Z");
assert.equal(statusSnapshot.run_id, "rp_status");
assert.equal(statusSnapshot.current_stage, "setup");
assert.equal(statusSnapshot.state_path, "/tmp/riddle-proof/state.json");
assert.equal(statusSnapshot.worktree_path, "/tmp/riddle-proof/worktree");
assert.equal(statusSnapshot.branch, "proof/worktree");
assert.equal(statusSnapshot.elapsed_ms, 10000);
assert.equal(statusSnapshot.latest_event.kind, "stage.heartbeat");
assert.equal(statusSnapshot.latest_event.details.wait_reason, "waiting_for_clean_worktree");

const missingAdapterResult = await runRiddleProof({
  request: {
    change_request: "Wire the proof runner.",
    verification_mode: "visual",
  },
  workdir: "/tmp/riddle-proof-workdir",
  adapters: {},
});
assert.equal(missingAdapterResult.status, "blocked");
assert.equal(missingAdapterResult.blocker.code, "implementation_adapter_not_configured");

const calls = [];
const harnessResult = await runRiddleProof({
  request: {
    repo: "riddledc/example",
    change_request: "Ship the proof harness.",
    verification_mode: "visual",
    ship_mode: "ship",
  },
  workdir: "/tmp/riddle-proof-workdir",
  max_iterations: 2,
  adapters: {
    preflight: {
      async preflight(input) {
        calls.push(`preflight:${Boolean(input.state.run_id)}`);
        return {
          ok: true,
          degraded_capabilities: ["embeddings"],
        };
      },
    },
    implementation: {
      async implement(input) {
        calls.push(`implement:${input.change_request}`);
        return {
          ok: true,
          changed_files: ["src/app.ts"],
          tests_run: ["npm test"],
        };
      },
    },
    proof: {
      async prove() {
        calls.push("prove");
        return {
          ok: true,
          evidence_bundle: {
            verification_mode: "visual",
            after: {
              kind: "after",
              role: "after_proof",
              url: "https://example.com/after.png",
            },
            artifacts: [
              {
                name: "proof.png",
                kind: "screenshot",
                role: "after_proof",
                path: "/tmp/riddle-proof/proof.png",
              },
            ],
            assertions: {
              headline_visible: true,
            },
          },
        };
      },
    },
    judge: {
      async assessProof() {
        calls.push("judge");
        return {
          decision: "ready_to_ship",
          summary: "Proof is ready.",
          source: "supervisor",
        };
      },
    },
    ship: {
      async ship() {
        calls.push("ship");
        return {
          pr_url: "https://github.com/riddledc/example/pull/42",
          marked_ready: true,
          proof_decision: "ready_to_ship",
          finalized: true,
        };
      },
    },
    notification: {
      async notify() {
        calls.push("notify");
        return {
          ok: true,
          channel_id: "111111111111111111",
        };
      },
    },
  },
});
assert.deepEqual(calls, [
  "preflight:true",
  "implement:Ship the proof harness.",
  "prove",
  "judge",
  "ship",
  "notify",
]);
assert.equal(harnessResult.status, "shipped");
assert.equal(harnessResult.ok, true);
assert.match(harnessResult.run_id, /^rp_/);
assert.equal(harnessResult.worktree_path, "/tmp/riddle-proof-workdir");
assert.equal(harnessResult.current_stage, "notify");
assert.equal(harnessResult.iterations, 1);
assert.equal(harnessResult.pr_url, "https://github.com/riddledc/example/pull/42");
assert.equal(harnessResult.marked_ready, true);
assert.equal(harnessResult.proof_decision, "ready_to_ship");
assert.equal(harnessResult.finalized, true);
assert.equal(harnessResult.notification.ok, true);
assert.equal(harnessResult.evidence_bundle.after.url, "https://example.com/after.png");
assert.equal(harnessResult.evidence_bundle.after.role, "after_proof");
assert.equal(harnessResult.evidence_bundle.artifacts[0].role, "after_proof");
assert.equal(harnessResult.last_checkpoint, "notification_completed");

console.log(JSON.stringify({ ok: true }));
