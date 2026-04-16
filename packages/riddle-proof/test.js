import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import {
  appendStageHeartbeat,
  appendRunEvent,
  applyTerminalMetadata,
  applyPrLifecycleState,
  createDisabledRiddleProofAgentAdapter,
  createRunStatusSnapshot,
  createRunState,
  createRunResult,
  isSuccessfulStatus,
  isTerminalStatus,
  normalizeTerminalMetadata,
  readRiddleProofRunStatus,
  runRiddleProofEngineHarness,
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
    target_branch: "tictactoe-board-polish",
    marked_ready: true,
    left_draft: false,
    ci_status: "no_checks",
    ship_commit: "96f5f86",
    ship_remote_head: "96f5f86",
    proof_comment_url: "https://github.com/davisdiehl/lilarcade/pull/255#issuecomment-1",
    before_cdn: "https://example.com/before.png",
    after_cdn: "https://example.com/after.png",
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
  pr_branch: "tictactoe-board-polish",
  marked_ready: true,
  left_draft: false,
  ci_status: "no_checks",
  ship_commit: "96f5f86",
  ship_remote_head: "96f5f86",
  proof_comment_url: "https://github.com/davisdiehl/lilarcade/pull/255#issuecomment-1",
  before_artifact_url: "https://example.com/before.png",
  after_artifact_url: "https://example.com/after.png",
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
assert.equal(state.pr_branch, "tictactoe-board-polish");
assert.equal(state.marked_ready, true);
assert.equal(state.ci_status, "no_checks");
assert.equal(state.proof_comment_url, "https://github.com/davisdiehl/lilarcade/pull/255#issuecomment-1");
assert.equal(state.notification.message_id, "333333333333333333");

const mergedState = applyPrLifecycleState(baseState(), {
  status: "MERGED",
  pr_url: "https://github.com/davisdiehl/lilarcade/pull/255",
  number: 255,
  headRefName: "tictactoe-board-polish",
  baseRefName: "main",
  mergeCommit: { oid: "merge123" },
  mergedAt: "2026-04-16T05:00:00.000Z",
  cleanup: { worktrees_removed: 2 },
});
assert.equal(mergedState.status, "completed");
assert.equal(mergedState.ok, true);
assert.equal(mergedState.pr_state?.status, "merged");
assert.equal(mergedState.pr_state?.head_branch, "tictactoe-board-polish");
assert.equal(mergedState.merge_commit, "merge123");
assert.equal(mergedState.merged_at, "2026-04-16T05:00:00.000Z");
assert.equal(mergedState.cleanup_report?.worktrees_removed, 2);
const mergedSnapshot = createRunStatusSnapshot(mergedState, "2026-04-16T05:00:01.000Z");
assert.equal(mergedSnapshot.pr_state?.status, "merged");
assert.equal(mergedSnapshot.merge_commit, "merge123");

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
  pr_branch: "tictactoe-board-polish",
  marked_ready: true,
  left_draft: false,
  ci_status: "no_checks",
  ship_commit: "96f5f86",
  ship_remote_head: "96f5f86",
  proof_comment_url: "https://github.com/davisdiehl/lilarcade/pull/255#issuecomment-1",
  before_artifact_url: "https://example.com/before.png",
  after_artifact_url: "https://example.com/after.png",
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
    shipReport: {
      pr_branch: "proof/demo",
      shipped_commit: "abc123",
      ci_status: "passed",
      proof_comment_url: "https://github.com/example/repo/pull/1#issuecomment-2",
      before_artifact_url: "https://example.com/before-fallback.png",
      after_artifact_url: "https://example.com/after-fallback.png",
    },
    checkpointContract: {
      details: {
        finalized: false,
      },
    },
  },
});

assert.deepEqual(fallbackMetadata, {
  pr_url: "https://github.com/example/repo/pull/1",
  pr_branch: "proof/demo",
  marked_ready: false,
  ci_status: "passed",
  ship_commit: "abc123",
  proof_comment_url: "https://github.com/example/repo/pull/1#issuecomment-2",
  before_artifact_url: "https://example.com/before-fallback.png",
  after_artifact_url: "https://example.com/after-fallback.png",
  ship_report: {
    pr_branch: "proof/demo",
    shipped_commit: "abc123",
    ci_status: "passed",
    proof_comment_url: "https://github.com/example/repo/pull/1#issuecomment-2",
    before_artifact_url: "https://example.com/before-fallback.png",
    after_artifact_url: "https://example.com/after-fallback.png",
  },
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
assert.equal(toRiddleProofRunParams({
  repo: "riddledc/example",
  change_request: "Keep the PR in draft for a debug run.",
  ship_after_verify: true,
  leave_draft: true,
}).leave_draft, true);

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

const engineFixture = mkdtempSync(path.join(os.tmpdir(), "riddle-proof-engine-harness-"));
const engineWorkdir = path.join(engineFixture, "after");
mkdirSync(engineWorkdir, { recursive: true });
execFileSync("git", ["init"], { cwd: engineWorkdir, stdio: "ignore" });
const engineStatePath = path.join(engineFixture, "riddle-state.json");
writeFileSync(engineStatePath, JSON.stringify({
  after_worktree: engineWorkdir,
  branch: "agent/openclaw/riddle-proof-engine-harness",
}, null, 2));

const engineCalls = [];
const engineHarnessResult = await runRiddleProofEngineHarness({
  request: {
    repo: "riddledc/example",
    change_request: "Drive the proven checkpoint engine.",
    verification_mode: "visual",
    ship_mode: "ship",
    leave_draft: true,
    harness_state_path: path.join(engineFixture, "harness-state.json"),
  },
  max_iterations: 8,
  engine: {
    async execute(params) {
      engineCalls.push(params);
      if (params.ship_after_verify) {
        writeFileSync(engineStatePath, JSON.stringify({
          after_worktree: engineWorkdir,
          branch: "agent/openclaw/riddle-proof-engine-harness",
          pr_url: "https://github.com/riddledc/example/pull/101",
          marked_ready: true,
          proof_decision: "ready_to_ship",
          merge_recommendation: "ready_to_ship",
          finalized: true,
        }, null, 2));
        return {
          ok: true,
          state_path: engineStatePath,
          checkpoint: "ship_review",
          summary: "Ship review complete.",
        };
      }
      if (params.proof_assessment_json) {
        return {
          ok: true,
          state_path: engineStatePath,
          checkpoint: "verify_ship_ready",
          summary: "Proof is ready to ship.",
          shipGate: { ok: true },
        };
      }
      if (params.advance_stage === "verify") {
        return {
          ok: false,
          state_path: engineStatePath,
          checkpoint: "verify_supervisor_judgment",
          summary: "Proof assessment required.",
        };
      }
      if (params.advance_stage === "implement") {
        return {
          ok: true,
          state_path: engineStatePath,
          checkpoint: "implement_review",
          summary: "Implementation review ready.",
          checkpointContract: {
            resume: { continue_with_stage: "verify" },
          },
        };
      }
      if (params.author_packet_json) {
        return {
          ok: false,
          state_path: engineStatePath,
          checkpoint: "implement_changes_missing",
          summary: "Implementation changes are required.",
        };
      }
      if (params.recon_assessment_json) {
        return {
          ok: false,
          state_path: engineStatePath,
          checkpoint: "author_supervisor_judgment",
          summary: "Author packet required.",
        };
      }
      return {
        ok: false,
        state_path: engineStatePath,
        checkpoint: "recon_supervisor_judgment",
        summary: "Recon assessment required.",
      };
    },
  },
  agent: {
    async assessRecon() {
      return {
        ok: true,
        summary: "Recon is specific enough.",
        payload: {
          decision: "ready_for_author",
          continue_with_stage: "author",
          source: "supervising_agent",
        },
      };
    },
    async authorProofPacket() {
      return {
        ok: true,
        summary: "Proof packet ready.",
        payload: {
          proof_plan: "Capture the changed page.",
          capture_script: "await saveScreenshot('after-proof')",
          summary: "Capture after proof.",
        },
      };
    },
    async implementChange() {
      writeFileSync(path.join(engineWorkdir, "feature.txt"), "changed\n");
      return {
        ok: true,
        summary: "Changed the after worktree.",
        diffDetected: true,
        changedFiles: ["feature.txt"],
        implementationNotes: "Created a focused fixture diff.",
      };
    },
    async assessProof() {
      return {
        ok: true,
        summary: "Proof is ready.",
        payload: {
          decision: "ready_to_ship",
          recommended_stage: "ship",
          continue_with_stage: "ship",
          escalation_target: "agent",
          reasons: ["after evidence satisfies the request"],
          source: "supervising_agent",
        },
      };
    },
  },
});

assert.equal(engineHarnessResult.status, "shipped");
assert.equal(engineHarnessResult.ok, true);
assert.equal(engineHarnessResult.pr_url, "https://github.com/riddledc/example/pull/101");
assert.equal(engineHarnessResult.marked_ready, true);
assert.equal(engineHarnessResult.proof_decision, "ready_to_ship");
assert.equal(engineHarnessResult.worktree_path, engineWorkdir);
assert.equal(engineHarnessResult.branch, "agent/openclaw/riddle-proof-engine-harness");
assert.equal(engineHarnessResult.current_stage, "ship");
assert.equal(engineHarnessResult.state_path, path.join(engineFixture, "harness-state.json"));
assert.equal(readRiddleProofRunStatus(engineHarnessResult.state_path).status, "shipped");
assert.equal(engineCalls.at(-1).ship_after_verify, true);
assert.equal(engineCalls.at(-1).leave_draft, true);

const missingWorktreeStatePath = path.join(engineFixture, "missing-worktree-riddle-state.json");
writeFileSync(missingWorktreeStatePath, JSON.stringify({}, null, 2));
const missingWorktreeResult = await runRiddleProofEngineHarness({
  request: {
    repo: "riddledc/example",
    change_request: "Block without an isolated worktree.",
    verification_mode: "visual",
    harness_state_path: path.join(engineFixture, "missing-worktree-harness-state.json"),
  },
  max_iterations: 1,
  engine: {
    async execute() {
      return {
        ok: false,
        state_path: missingWorktreeStatePath,
        checkpoint: "implement_changes_missing",
        summary: "Implementation changes are required.",
      };
    },
  },
  agent: createDisabledRiddleProofAgentAdapter(),
});

assert.equal(missingWorktreeResult.status, "blocked");
assert.equal(missingWorktreeResult.blocker.code, "implementation_worktree_missing");

console.log(JSON.stringify({ ok: true }));
