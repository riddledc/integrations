import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const harnessMod = await import(pathToFileURL(path.join(__dirname, 'dist', 'engine-harness.js')).href);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf-8'));
}

function writeJson(file, payload) {
  writeFileSync(file, JSON.stringify(payload, null, 2));
}

function assertNoGenericLifecycleFailure(result, label) {
  const encoded = JSON.stringify(result);
  for (const marker of [
    'codex_invalid_json',
    'codex_no_final_response',
    'codex_timeout',
    'max_iterations_reached',
    'stage_iteration_limit_reached',
    'unhandled_checkpoint',
  ]) {
    assert(!encoded.includes(marker), `${label} leaked generic lifecycle marker ${marker}`);
  }
}

function pathsFor(label) {
  const dir = mkdtempSync(path.join(os.tmpdir(), `riddle-proof-trust-${label}-`));
  return {
    dir,
    harnessStatePath: path.join(dir, 'wrapper-state.json'),
    engineStatePath: path.join(dir, 'engine-state.json'),
  };
}

function baseRequest(paths, changeRequest) {
  return {
    repo: 'riddledc/example',
    change_request: changeRequest,
    engine_state_path: paths.engineStatePath,
    harness_state_path: paths.harnessStatePath,
    ship_mode: 'none',
  };
}

{
  const paths = pathsFor('valid-pass');
  writeJson(paths.engineStatePath, {
    repo: 'riddledc/example',
    verify_status: 'evidence_captured',
    merge_recommendation: 'ready-to-ship',
  });
  const calls = [];
  const result = await harnessMod.runRiddleProofEngineHarness({
    request: baseRequest(paths, 'Valid browser evidence should terminalize as ready to ship.'),
    state_path: paths.harnessStatePath,
    engine: {
      async execute(params) {
        calls.push(params);
        return {
          ok: true,
          state_path: paths.engineStatePath,
          checkpoint: 'verify_ship_ready',
          summary: 'Structured browser evidence matched the expected terminal route.',
          shipGate: { ok: true },
          checkpointContract: { checkpoint: 'verify_ship_ready', stage: 'verify', ship_gate: { ok: true } },
        };
      },
    },
    max_iterations: 3,
    config: { defaultShipMode: 'none' },
  });
  assert(result.status === 'ready_to_ship', `valid evidence should become ready_to_ship, got ${result.status}`);
  assert(!result.blocker, 'valid evidence should not create a blocker');
  assert(calls.length === 1, 'valid evidence should not loop after verify_ship_ready');
  assertNoGenericLifecycleFailure(result, 'valid evidence pass');
}

{
  const paths = pathsFor('invalid-blocker');
  writeJson(paths.engineStatePath, {
    repo: 'riddledc/example',
    verify_status: 'evidence_captured',
    merge_recommendation: 'do-not-merge',
  });
  const calls = [];
  const result = await harnessMod.runRiddleProofEngineHarness({
    request: baseRequest(paths, 'Invalid browser evidence should terminalize as a named blocker.'),
    state_path: paths.harnessStatePath,
    engine: {
      async execute(params) {
        calls.push(params);
        return {
          ok: true,
          state_path: paths.engineStatePath,
          checkpoint: 'verify_agent_retry',
          summary: 'Proof assessment blocked shipping: expected /pricing?rp_probe=1#pricing-probe, got /pricing/.',
          proofAssessment: {
            decision: 'do_not_merge',
            summary: 'Browser evidence reached the wrong terminal route.',
            blockers: ['wrong route: expected query/hash terminal state'],
          },
          checkpointContract: {
            checkpoint: 'verify_agent_retry',
            stage: 'verify',
            blocking: false,
          },
        };
      },
    },
    max_iterations: 3,
    config: { defaultShipMode: 'none' },
  });
  assert(result.status === 'blocked', `invalid evidence should block, got ${result.status}`);
  assert(result.blocker?.code === 'proof_assessment_blocked', `invalid evidence blocker should be specific, got ${result.blocker?.code}`);
  assert(calls.length === 1, 'invalid evidence with no safe continuation should not loop');
  assertNoGenericLifecycleFailure(result, 'invalid evidence blocker');
}

{
  const paths = pathsFor('capture-timeout');
  writeJson(paths.engineStatePath, {
    repo: 'riddledc/example',
    verify_status: 'capture_incomplete',
  });
  const calls = [];
  const result = await harnessMod.runRiddleProofEngineHarness({
    request: baseRequest(paths, 'Timeout evidence should yield a focused capture retry checkpoint.'),
    state_path: paths.harnessStatePath,
    engine: {
      async execute(params) {
        calls.push(params);
        return {
          ok: true,
          state_path: paths.engineStatePath,
          checkpoint: 'verify_capture_retry',
          summary: 'locator.scrollIntoViewIfNeeded: Timeout 3000ms exceeded for [data-testid=missing]',
          decisionRequest: {
            capture_quality: {
              decision: 'missing_selector',
              summary: 'locator.scrollIntoViewIfNeeded: Timeout 3000ms exceeded',
              reasons: ['missing selector [data-testid=missing]'],
            },
            continue_with_stage: 'author',
          },
          checkpointContract: {
            checkpoint: 'verify_capture_retry',
            stage: 'verify',
            blocking: false,
          },
        };
      },
    },
    checkpoint_mode: 'yield',
    checkpoint_visibility: 'manual',
    max_iterations: 3,
    config: { defaultShipMode: 'none' },
  });
  assert(result.status === 'awaiting_checkpoint', `timeout capture should yield checkpoint, got ${result.status}`);
  assert(result.checkpoint_packet?.checkpoint === 'verify_capture_retry', 'timeout capture should preserve verify_capture_retry checkpoint');
  assert(calls.length === 1, 'yielded capture retry should not auto-enter authoring');
  assertNoGenericLifecycleFailure(result, 'timeout capture retry');
}

{
  const paths = pathsFor('audit-complete');
  writeJson(paths.engineStatePath, {
    repo: 'riddledc/example',
    implementation_mode: 'none',
    require_diff: false,
    allow_code_changes: false,
    verify_status: 'evidence_captured',
  });
  const calls = [];
  const result = await harnessMod.runRiddleProofEngineHarness({
    request: {
      ...baseRequest(paths, 'No-diff prod audit should complete without ship.'),
      implementation_mode: 'none',
      require_diff: false,
      allow_code_changes: false,
    },
    state_path: paths.harnessStatePath,
    engine: {
      async execute(params) {
        calls.push(params);
        return {
          ok: true,
          state_path: paths.engineStatePath,
          checkpoint: 'verify_audit_complete',
          summary: 'Audit proof is complete and no ship action is required.',
          checkpointContract: { checkpoint: 'verify_audit_complete', stage: 'verify', blocking: false },
        };
      },
    },
    max_iterations: 3,
    config: { defaultShipMode: 'none' },
  });
  assert(result.status === 'completed', `audit should complete, got ${result.status}`);
  assert(result.raw?.audit_complete === true, 'audit completion should be marked in result metadata');
  assert(calls.length === 1, 'audit completion should not loop');
  assertNoGenericLifecycleFailure(result, 'audit completion');

  const lateCheckpointResponse = await harnessMod.runRiddleProofEngineHarness({
    request: {
      ...baseRequest(paths, 'No-diff prod audit should ignore late manual checkpoint responses after terminal completion.'),
      implementation_mode: 'none',
      require_diff: false,
      allow_code_changes: false,
    },
    state_path: paths.harnessStatePath,
    engine: {
      async execute() {
        throw new Error('late checkpoint response after terminal completion should not call the engine');
      },
    },
    checkpoint_response: {
      version: 'riddle-proof.checkpoint_response.v1',
      run_id: result.run_id,
      checkpoint: 'verify_capture_retry',
      decision: 'author_packet',
      summary: 'Late manual response from a stale checkpoint surface.',
      payload: {
        proof_plan: 'stale proof plan',
        capture_script: "await saveScreenshot('stale');",
      },
      created_at: '2026-06-01T04:00:00.000Z',
    },
    max_iterations: 3,
    config: { defaultShipMode: 'none' },
  });
  assert(lateCheckpointResponse.status === 'completed', `late checkpoint response should preserve completed status, got ${lateCheckpointResponse.status}`);
  assert(lateCheckpointResponse.raw?.ignored_checkpoint_response === true, 'late checkpoint response should be explicitly ignored');
  assert(!lateCheckpointResponse.blocker, 'late checkpoint response should not create a blocker after terminal completion');
  const persistedAuditState = readJson(paths.harnessStatePath);
  assert(persistedAuditState.status === 'completed', 'persisted terminal status should remain completed after late checkpoint response');
  assert(persistedAuditState.events.some((event) => event.kind === 'checkpoint.response.ignored'), 'ignored late checkpoint response should be recorded as an event');
  assertNoGenericLifecycleFailure(lateCheckpointResponse, 'late checkpoint response after terminal completion');
}

console.log(JSON.stringify({
  ok: true,
  suite: 'riddle-proof.direct-trust-boundary',
  cases: [
    'valid evidence ready_to_ship',
    'invalid evidence proof_assessment_blocked',
    'timeout capture retry checkpoint',
    'no-diff audit completed',
    'late checkpoint response ignored after terminal completion',
  ],
}, null, 2));
