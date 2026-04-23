import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import {
  appendStageHeartbeat,
  appendRunEvent,
  applyTerminalMetadata,
  applyPrLifecycleState,
  appendCaptureDiagnostic,
  createDisabledRiddleProofAgentAdapter,
  createCaptureDiagnostic,
  createRunStatusSnapshot,
  createRunState,
  createRunResult,
  isSuccessfulStatus,
  isTerminalStatus,
  normalizeTerminalMetadata,
  redactForProofDiagnostics,
  readRiddleProofRunStatus,
  runRiddleProofEngineHarness,
  runRiddleProof,
  setRunStatus,
  summarizeCaptureArtifacts,
} from "./dist/index.js";
import {
  parseOpenClawAssertions,
  toRiddleProofRunParams,
} from "./dist/openclaw.js";

const require = createRequire(import.meta.url);
const cjs = require("./dist/index.cjs");
const cjsDiagnostics = require("./dist/diagnostics.cjs");
const cjsOpenClaw = require("./dist/openclaw.cjs");
assert.equal(typeof cjs.normalizeTerminalMetadata, "function");
assert.equal(typeof cjs.createCaptureDiagnostic, "function");
assert.equal(typeof cjsDiagnostics.summarizeCaptureArtifacts, "function");
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

const diagnosticArgs = {
  script: "await page.goto('/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile')",
  localStorage: { session: "secret" },
  headers: { Authorization: "Bearer secret" },
  nested: {
    api_key: "secret",
    safe: "ok",
  },
  long: "x".repeat(2105),
};
const redactedDiagnosticArgs = redactForProofDiagnostics(diagnosticArgs);
assert.equal(redactedDiagnosticArgs.script.startsWith("await page.goto"), true);
assert.equal(redactedDiagnosticArgs.localStorage, "[redacted]");
assert.equal(redactedDiagnosticArgs.headers, "[redacted]");
assert.equal(redactedDiagnosticArgs.nested.api_key, "[redacted]");
assert.equal(redactedDiagnosticArgs.nested.safe, "ok");
assert.equal(redactedDiagnosticArgs.long.endsWith("... [truncated]"), true);

const diagnosticPayload = {
  ok: true,
  outputs: [
    { name: "console.json", url: "https://example.com/console.json" },
  ],
  screenshots: [
    { name: "after-proof.png", url: "https://example.com/after-proof.png" },
  ],
  artifacts: [
    {
      name: "metering.json",
      kind: "json",
      role: "diagnostic",
      path: "/tmp/riddle-proof/metering.json",
      metadata: { samples: 64 },
    },
  ],
  _artifact_json: {
    "console.json": { summary: { errors: 0, warnings: 1 } },
    "proof.json": {
      result: {
        audio_ready: true,
        playhead_synced: true,
      },
    },
  },
  _artifact_errors: {
    "missing.json": "404 not found",
  },
};
const artifactSummary = summarizeCaptureArtifacts(diagnosticPayload);
assert.equal(artifactSummary.outputs[0].name, "console.json");
assert.equal(artifactSummary.screenshots[0].name, "after-proof.png");
assert.equal(artifactSummary.artifacts[0].metadata_keys[0], "samples");
assert.deepEqual(artifactSummary.result_keys, ["audio_ready", "playhead_synced"]);
assert.deepEqual(artifactSummary.artifact_json, ["console.json", "proof.json"]);
assert.equal(artifactSummary.artifact_errors["missing.json"], "404 not found");
assert.equal(artifactSummary.console_summary.warnings, 1);

const captureDiagnostic = createCaptureDiagnostic({
  label: "after",
  tool: "riddle_server_preview",
  captured_at: "2026-04-18T00:00:00.000Z",
  args: diagnosticArgs,
  payload: diagnosticPayload,
  route: "/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile",
  preview_url: "https://riddle.example/previews/sp_123",
  wait_for_selector: "[data-proof-ready='true']",
  evidence: {
    globalThisEvidence: {
      bpm: 112,
      token: "secret",
    },
  },
});
assert.equal(captureDiagnostic.version, "riddle-proof.capture-diagnostic.v1");
assert.equal(captureDiagnostic.ok, true);
assert.equal(captureDiagnostic.args.headers, "[redacted]");
assert.equal(captureDiagnostic.args.nested.safe, "ok");
assert.equal(captureDiagnostic.evidence.globalThisEvidence.token, "[redacted]");
assert.equal(captureDiagnostic.artifact_summary.result_keys.includes("playhead_synced"), true);

const diagnosticState = {};
appendCaptureDiagnostic(diagnosticState, { label: "first", payload: diagnosticPayload }, 2);
appendCaptureDiagnostic(diagnosticState, { label: "second", payload: diagnosticPayload }, 2);
appendCaptureDiagnostic(diagnosticState, { label: "third", payload: diagnosticPayload }, 2);
assert.equal(diagnosticState.capture_diagnostics.length, 2);
assert.equal(diagnosticState.capture_diagnostics[0].label, "second");
assert.equal(diagnosticState.capture_diagnostics[1].label, "third");

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
  auth_localStorage_json: "{\"session\":\"local\"}",
  auth_cookies_json: "[{\"name\":\"session\",\"value\":\"cookie\"}]",
  auth_headers_json: "{\"Authorization\":\"Bearer token\"}",
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
assert.equal(referenceParams.integration_context.metadata.tool, "riddle_proof_change");
assert.equal(referenceParams.assertions.interactive_elements, 11);
assert.equal(referenceParams.auth_localStorage_json, "{\"session\":\"local\"}");
assert.equal(referenceParams.auth_cookies_json, "[{\"name\":\"session\",\"value\":\"cookie\"}]");
assert.equal(referenceParams.auth_headers_json, "{\"Authorization\":\"Bearer token\"}");
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
    auth_localStorage_json: "{\"session\":\"local\"}",
    auth_cookies_json: "[{\"name\":\"session\",\"value\":\"cookie\"}]",
    auth_headers_json: "{\"Authorization\":\"Bearer token\"}",
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
const engineHarnessState = JSON.parse(readFileSync(engineHarnessResult.state_path, "utf-8"));
const firstEngineCallEvent = engineHarnessState.events.find((event) => event.kind === "engine.call");
const firstEngineResultEvent = engineHarnessState.events.find((event) => event.kind === "engine.result");
assert.equal(firstEngineCallEvent.details.params.auth_localStorage_json, "[redacted]");
assert.equal(typeof firstEngineCallEvent.details.started_at, "string");
assert.equal(typeof firstEngineResultEvent.details.duration_ms, "number");
assert.equal(typeof engineCalls[0].state_path, "string");
assert.equal(engineCalls[0].auth_localStorage_json, "{\"session\":\"local\"}");
assert.equal(engineCalls[0].auth_cookies_json, "[{\"name\":\"session\",\"value\":\"cookie\"}]");
assert.equal(engineCalls[0].auth_headers_json, "{\"Authorization\":\"Bearer token\"}");
assert.equal(engineCalls.at(-1).ship_after_verify, true);
assert.equal(engineCalls.at(-1).leave_draft, true);

const runwayFixture = mkdtempSync(path.join(os.tmpdir(), "riddle-proof-iteration-runway-"));
const runwayWorkdir = path.join(runwayFixture, "after");
mkdirSync(runwayWorkdir);
execFileSync("git", ["init"], { cwd: runwayWorkdir, stdio: "ignore" });
const runwayStatePath = path.join(runwayFixture, "riddle-state.json");
writeFileSync(runwayStatePath, JSON.stringify({
  after_worktree: runwayWorkdir,
  branch: "agent/openclaw/iteration-runway",
}, null, 2));

let runwayReconAttempts = 0;
let runwayAuthorPackets = 0;
const runwayEngineCalls = [];
const runwayResult = await runRiddleProofEngineHarness({
  request: {
    repo: "riddledc/example",
    change_request: "Exercise a long non-shipping proof path.",
    verification_mode: "visual",
    ship_mode: "none",
    harness_state_path: path.join(runwayFixture, "harness-state.json"),
    engine_state_path: runwayStatePath,
  },
  engine: {
    async execute(params) {
      runwayEngineCalls.push(params);
      if (params.proof_assessment_json) {
        return {
          ok: true,
          state_path: runwayStatePath,
          checkpoint: "verify_ship_ready",
          summary: "Proof is ready but ship mode is held.",
          shipGate: { ok: true },
        };
      }
      if (params.author_packet_json && runwayAuthorPackets > 1) {
        return {
          ok: false,
          state_path: runwayStatePath,
          checkpoint: "verify_supervisor_judgment",
          summary: "Proof evidence needs judgment after proof plan revision.",
        };
      }
      if (params.advance_stage === "verify") {
        return {
          ok: false,
          state_path: runwayStatePath,
          checkpoint: "verify_capture_retry",
          summary: "Capture needs a proof packet revision before final judgment.",
          checkpointContract: {
            resume: { continue_with_stage: "author" },
          },
        };
      }
      if (params.implementation_notes) {
        return {
          ok: true,
          state_path: runwayStatePath,
          checkpoint: "implement_review",
          summary: "Implementation review ready.",
        };
      }
      if (params.author_packet_json) {
        return {
          ok: false,
          state_path: runwayStatePath,
          checkpoint: "implement_changes_missing",
          summary: "Implementation changes are required.",
        };
      }
      if (params.recon_assessment_json && runwayReconAttempts > 1) {
        return {
          ok: false,
          state_path: runwayStatePath,
          checkpoint: "author_supervisor_judgment",
          summary: "Author packet required.",
        };
      }
      if (params.recon_assessment_json) {
        return {
          ok: false,
          state_path: runwayStatePath,
          checkpoint: "recon_supervisor_judgment",
          summary: "Retry recon before authoring.",
        };
      }
      if (params.advance_stage === "recon") {
        return {
          ok: false,
          state_path: runwayStatePath,
          checkpoint: "recon_supervisor_judgment",
          summary: "Initial recon assessment required.",
        };
      }
      return {
        ok: false,
        state_path: runwayStatePath,
        checkpoint: "awaiting_stage_advance",
        stage: "setup",
        summary: "Setup is complete; advance to recon.",
      };
    },
  },
  agent: {
    async assessRecon() {
      runwayReconAttempts += 1;
      return {
        ok: true,
        summary: runwayReconAttempts === 1 ? "Retry recon once." : "Recon is specific enough.",
        payload: {
          decision: runwayReconAttempts === 1 ? "retry_recon" : "ready_for_author",
          continue_with_stage: runwayReconAttempts === 1 ? "recon" : "author",
          source: "supervising_agent",
        },
      };
    },
    async authorProofPacket() {
      runwayAuthorPackets += 1;
      return {
        ok: true,
        summary: `Proof packet ${runwayAuthorPackets} ready.`,
        payload: {
          proof_plan: `Capture proof attempt ${runwayAuthorPackets}.`,
          capture_script: "await saveScreenshot('after-proof')",
          summary: "Capture after proof.",
        },
      };
    },
    async implementChange() {
      writeFileSync(path.join(runwayWorkdir, "feature.txt"), "changed\n");
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

assert.equal(runwayResult.status, "ready_to_ship");
assert.equal(runwayResult.ok, true);
assert.equal(runwayResult.blocker, undefined);
assert.equal(runwayEngineCalls.length, 8);
assert.equal(runwayEngineCalls.at(-1).proof_assessment_json, undefined);
const runwayHarnessState = JSON.parse(readFileSync(path.join(runwayFixture, "harness-state.json"), "utf-8"));
const runwayProofAssessment = runwayHarnessState.events.find((event) => event.kind === "agent.proof_assessment.completed");
assert.equal(runwayProofAssessment.details.payload.continue_with_stage, "ship");

const reconLoopFixture = mkdtempSync(path.join(os.tmpdir(), "riddle-proof-recon-loop-"));
const reconLoopStatePath = path.join(reconLoopFixture, "riddle-state.json");
writeFileSync(reconLoopStatePath, JSON.stringify({}, null, 2));
const reconLoopResult = await runRiddleProofEngineHarness({
  request: {
    repo: "riddledc/example",
    change_request: "Exercise a bad recon loop.",
    verification_mode: "visual",
    harness_state_path: path.join(reconLoopFixture, "harness-state.json"),
    engine_state_path: reconLoopStatePath,
  },
  engine: {
    async execute(params) {
      if (!params.advance_stage && !params.recon_assessment_json) {
        return {
          ok: false,
          state_path: reconLoopStatePath,
          checkpoint: "awaiting_stage_advance",
          stage: "setup",
          summary: "Setup is complete; advance to recon.",
        };
      }
      return {
        ok: false,
        state_path: reconLoopStatePath,
        checkpoint: "recon_supervisor_judgment",
        summary: "Recon still needs another retry.",
      };
    },
  },
  agent: {
    async assessRecon() {
      return {
        ok: true,
        summary: "Retry recon.",
        payload: {
          decision: "retry_recon",
          continue_with_stage: "recon",
          source: "supervising_agent",
        },
      };
    },
    async authorProofPacket() {
      throw new Error("author should not run in recon loop fixture");
    },
    async implementChange() {
      throw new Error("implementation should not run in recon loop fixture");
    },
    async assessProof() {
      throw new Error("proof assessment should not run in recon loop fixture");
    },
  },
});

assert.equal(reconLoopResult.status, "blocked");
assert.equal(reconLoopResult.blocker.code, "stage_iteration_limit_reached");
assert.equal(reconLoopResult.blocker.details.stage, "recon");
assert.equal(reconLoopResult.blocker.details.stage_iteration_limit, 4);

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

const dryRunFailureResult = await runRiddleProofEngineHarness({
  request: {
    repo: "riddledc/example",
    change_request: "Surface setup failures during dry-run.",
    verification_mode: "visual",
    dry_run: true,
    harness_state_path: path.join(engineFixture, "dry-run-failure-harness-state.json"),
  },
  max_iterations: 1,
  engine: {
    async execute() {
      return {
        ok: false,
        state_path: path.join(engineFixture, "dry-run-failure-riddle-state.json"),
        checkpoint: "setup_blocked",
        summary: "setup failed",
        error: "workspace core timed out for ensure-deps",
      };
    },
  },
  agent: createDisabledRiddleProofAgentAdapter(),
});

assert.equal(dryRunFailureResult.status, "blocked");
assert.equal(dryRunFailureResult.blocker.code, "setup_blocked");
assert.equal(dryRunFailureResult.blocker.details.error, "workspace core timed out for ensure-deps");

const workspaceCoreFixture = mkdtempSync(path.join(os.tmpdir(), "riddle-proof-workspace-core-"));
writeFileSync(path.join(workspaceCoreFixture, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0" }));
const workspaceCorePath = path.join(path.dirname(new URL(import.meta.url).pathname), "lib", "workspace-core.mjs");
const fingerprintResult = JSON.parse(execFileSync("node", [
  workspaceCorePath,
  "dependency-fingerprint",
  JSON.stringify({ projectDir: workspaceCoreFixture }),
], { encoding: "utf-8" }));
assert.equal(fingerprintResult.ok, true);
assert.equal(typeof fingerprintResult.fingerprint, "string");
assert.ok(fingerprintResult.fingerprint.length > 10);

function writeEmptyNpmFixture(projectDir) {
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(path.join(projectDir, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0" }));
  writeFileSync(path.join(projectDir, "package-lock.json"), JSON.stringify({
    name: "fixture",
    version: "1.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": {
        name: "fixture",
        version: "1.0.0",
      },
    },
  }));
}

const dependencyCacheRoot = path.join(workspaceCoreFixture, "deps-cache");
const dependencyFixtureA = path.join(workspaceCoreFixture, "dependency-fixture-a");
const dependencyFixtureB = path.join(workspaceCoreFixture, "dependency-fixture-b");
writeEmptyNpmFixture(dependencyFixtureA);
writeEmptyNpmFixture(dependencyFixtureB);
const ensureDepsEnv = { ...process.env, RIDDLE_PROOF_DEPS_CACHE_ROOT: dependencyCacheRoot };
const firstDepsResult = JSON.parse(execFileSync("node", [
  workspaceCorePath,
  "ensure-deps",
  JSON.stringify({ projectDir: dependencyFixtureA }),
], { encoding: "utf-8", env: ensureDepsEnv }));
assert.equal(firstDepsResult.ok, true);
assert.equal(firstDepsResult.status, "cached:npm ci");
assert.equal(lstatSync(path.join(dependencyFixtureA, "node_modules")).isSymbolicLink(), false);

const secondDepsResult = JSON.parse(execFileSync("node", [
  workspaceCorePath,
  "ensure-deps",
  JSON.stringify({ projectDir: dependencyFixtureB }),
], { encoding: "utf-8", env: ensureDepsEnv }));
assert.equal(secondDepsResult.ok, true);
assert.match(secondDepsResult.status, /^reused_cache:/);
assert.equal(lstatSync(path.join(dependencyFixtureB, "node_modules")).isSymbolicLink(), false);

const dependencyFixtureC = path.join(workspaceCoreFixture, "dependency-fixture-c");
writeEmptyNpmFixture(dependencyFixtureC);
const reusedFromDepsResult = JSON.parse(execFileSync("node", [
  workspaceCorePath,
  "ensure-deps",
  JSON.stringify({ projectDir: dependencyFixtureC, reuseFrom: dependencyFixtureB }),
], { encoding: "utf-8", env: ensureDepsEnv }));
assert.equal(reusedFromDepsResult.ok, true);
assert.match(reusedFromDepsResult.status, /^reused_from:/);
assert.equal(lstatSync(path.join(dependencyFixtureC, "node_modules")).isSymbolicLink(), false);

const alreadyInstalledDepsResult = JSON.parse(execFileSync("node", [
  workspaceCorePath,
  "ensure-deps",
  JSON.stringify({ projectDir: dependencyFixtureA }),
], { encoding: "utf-8", env: ensureDepsEnv }));
assert.equal(alreadyInstalledDepsResult.ok, true);
assert.equal(alreadyInstalledDepsResult.status, "already_installed");

console.log(JSON.stringify({ ok: true }));
