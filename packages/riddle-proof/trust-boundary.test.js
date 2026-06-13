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

  const terminalStateWithoutFinalizedFlag = readJson(paths.harnessStatePath);
  terminalStateWithoutFinalizedFlag.finalized = false;
  writeJson(paths.harnessStatePath, terminalStateWithoutFinalizedFlag);
  const staleReadyResponse = {
    version: 'riddle-proof.checkpoint_response.v1',
    run_id: result.run_id,
    checkpoint: 'author_supervisor_judgment',
    decision: 'author_packet',
    summary: 'Late manual author packet after terminal ready_to_ship.',
    payload: {
      proof_plan: 'stale proof plan',
      capture_script: "return { passed: true, staleManualCheckpointProbe: true };",
    },
    created_at: '2026-06-01T14:27:30.000Z',
  };
  const lateReadyCheckpointResponse = await harnessMod.runRiddleProofEngineHarness({
    request: baseRequest(paths, 'Ready-to-ship run should ignore stale manual checkpoint responses even without finalized=true.'),
    state_path: paths.harnessStatePath,
    engine: {
      async execute() {
        throw new Error('late checkpoint response after ready_to_ship should not call the engine');
      },
    },
    checkpoint_response: staleReadyResponse,
    max_iterations: 3,
    config: { defaultShipMode: 'none' },
  });
  assert(lateReadyCheckpointResponse.status === 'ready_to_ship', `late checkpoint response should preserve ready_to_ship, got ${lateReadyCheckpointResponse.status}`);
  assert(lateReadyCheckpointResponse.raw?.ignored_checkpoint_response === true, 'late ready checkpoint response should be explicitly ignored');
  assert(!lateReadyCheckpointResponse.blocker, 'late ready checkpoint response should not create a blocker');
  assertNoGenericLifecycleFailure(lateReadyCheckpointResponse, 'late checkpoint response after ready_to_ship');
  const persistedReadyState = readJson(paths.harnessStatePath);
  assert(persistedReadyState.status === 'ready_to_ship', 'persisted ready_to_ship status should remain after late checkpoint response');
  assert(persistedReadyState.events.some((event) => event.kind === 'checkpoint.response.ignored'), 'ignored late ready checkpoint response should be recorded');
  assert(persistedReadyState.checkpoint_summary.response_count === 0, 'ignored late ready response must not count as an accepted checkpoint response');
  assert(persistedReadyState.checkpoint_summary.latest_decision === undefined, 'ignored late ready response must not become the latest accepted decision');
  const repeatedLateReadyCheckpointResponse = await harnessMod.runRiddleProofEngineHarness({
    request: baseRequest(paths, 'Repeated stale checkpoint responses after ready_to_ship should still be ignored.'),
    state_path: paths.harnessStatePath,
    engine: {
      async execute() {
        throw new Error('repeated late checkpoint response after ready_to_ship should not call the engine');
      },
    },
    checkpoint_response: staleReadyResponse,
    max_iterations: 3,
    config: { defaultShipMode: 'none' },
  });
  assert(repeatedLateReadyCheckpointResponse.status === 'ready_to_ship', `repeated late checkpoint response should preserve ready_to_ship, got ${repeatedLateReadyCheckpointResponse.status}`);
  assert(repeatedLateReadyCheckpointResponse.raw?.ignored_checkpoint_response === true, 'repeated late ready checkpoint response should be explicitly ignored');
  assert(!repeatedLateReadyCheckpointResponse.blocker, 'repeated late ready checkpoint response should not become a duplicate blocker');
  assertNoGenericLifecycleFailure(repeatedLateReadyCheckpointResponse, 'repeated late checkpoint response after ready_to_ship');
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
  const paths = pathsFor('unadvertised-checkpoint-decision');
  writeJson(paths.engineStatePath, {
    repo: 'riddledc/example',
    recon_status: 'needs_supervisor_judgment',
  });
  const yieldedRecon = await harnessMod.runRiddleProofEngineHarness({
    request: baseRequest(paths, 'Recon checkpoint should reject unadvertised author packets.'),
    state_path: paths.harnessStatePath,
    engine: {
      async execute() {
        return {
          ok: true,
          state_path: paths.engineStatePath,
          checkpoint: 'recon_supervisor_judgment',
          stage: 'recon',
          summary: 'Recon needs supervising judgment.',
        };
      },
    },
    checkpoint_mode: 'yield',
    checkpoint_visibility: 'manual',
    max_iterations: 3,
    config: { defaultShipMode: 'none' },
  });
  assert(yieldedRecon.status === 'awaiting_checkpoint', `recon checkpoint should yield, got ${yieldedRecon.status}`);
  assert(yieldedRecon.checkpoint_packet?.stage === 'recon', 'yielded checkpoint should be a recon checkpoint');
  assert(!yieldedRecon.checkpoint_packet.allowed_decisions.includes('author_packet'), 'recon checkpoint should not advertise author_packet');

  const forgedAuthorPacketResponse = await harnessMod.runRiddleProofEngineHarness({
    request: baseRequest(paths, 'Forged author packet should not bypass recon checkpoint decisions.'),
    state_path: paths.harnessStatePath,
    engine: {
      async execute() {
        throw new Error('unadvertised checkpoint response should not resume the engine');
      },
    },
    checkpoint_response: {
      version: 'riddle-proof.checkpoint_response.v1',
      run_id: yieldedRecon.run_id,
      checkpoint: yieldedRecon.checkpoint_packet.checkpoint,
      packet_id: yieldedRecon.checkpoint_packet.packet_id,
      resume_token: yieldedRecon.checkpoint_packet.resume_token,
      decision: 'author_packet',
      summary: 'Forged author packet at a recon checkpoint.',
      payload: {
        proof_plan: 'Bypass recon and author proof directly.',
        capture_script: "return { forgedAuthorPacket: true };",
      },
      created_at: '2026-06-12T12:00:00.000Z',
    },
    checkpoint_mode: 'yield',
    checkpoint_visibility: 'manual',
    max_iterations: 3,
    config: { defaultShipMode: 'none' },
  });
  assert(forgedAuthorPacketResponse.status === 'blocked', `forged decision should block, got ${forgedAuthorPacketResponse.status}`);
  assert(
    forgedAuthorPacketResponse.blocker?.code === 'checkpoint_response_decision_not_allowed',
    `forged decision should report decision_not_allowed, got ${forgedAuthorPacketResponse.blocker?.code}`,
  );
  assert(
    forgedAuthorPacketResponse.blocker.details.allowed_decisions.includes('ready_for_author'),
    'blocker should expose advertised decisions',
  );
  assert(
    !forgedAuthorPacketResponse.blocker.details.allowed_decisions.includes('author_packet'),
    'blocker should not add forged decision to advertised decisions',
  );
  const persistedForgedState = readJson(paths.harnessStatePath);
  assert(persistedForgedState.checkpoint_packet, 'rejected unadvertised response should keep the pending checkpoint packet visible');
  assert(persistedForgedState.checkpoint_summary.pending === true, 'checkpoint summary should remain pending after rejected unadvertised response');
  assert(persistedForgedState.checkpoint_summary.response_count === 0, 'rejected unadvertised response should not count as accepted');
  assertNoGenericLifecycleFailure(forgedAuthorPacketResponse, 'unadvertised checkpoint decision blocker');
}

{
  const paths = pathsFor('stale-checkpoint-packet-id');
  writeJson(paths.engineStatePath, {
    repo: 'riddledc/example',
    recon_status: 'needs_supervisor_judgment',
  });
  const yieldedRecon = await harnessMod.runRiddleProofEngineHarness({
    request: baseRequest(paths, 'Checkpoint response should be tied to the exact pending packet lineage.'),
    state_path: paths.harnessStatePath,
    engine: {
      async execute() {
        return {
          ok: true,
          state_path: paths.engineStatePath,
          checkpoint: 'recon_supervisor_judgment',
          stage: 'recon',
          summary: 'Recon needs supervising judgment.',
        };
      },
    },
    checkpoint_mode: 'yield',
    checkpoint_visibility: 'manual',
    max_iterations: 3,
    config: { defaultShipMode: 'none' },
  });
  assert(yieldedRecon.status === 'awaiting_checkpoint', `lineage test should yield, got ${yieldedRecon.status}`);
  assert(yieldedRecon.checkpoint_packet?.packet_id, 'yielded checkpoint should expose packet_id');

  const staleLineageResponse = await harnessMod.runRiddleProofEngineHarness({
    request: baseRequest(paths, 'Stale checkpoint packet lineage should not resume the engine.'),
    state_path: paths.harnessStatePath,
    engine: {
      async execute() {
        throw new Error('stale checkpoint packet_id should not resume the engine');
      },
    },
    checkpoint_response: {
      version: 'riddle-proof.checkpoint_response.v1',
      run_id: yieldedRecon.run_id,
      checkpoint: yieldedRecon.checkpoint_packet.checkpoint,
      packet_id: 'rppkt_000000000000000000000000',
      resume_token: yieldedRecon.checkpoint_packet.resume_token,
      decision: 'ready_for_author',
      summary: 'Replay a response from an older checkpoint packet with the same token.',
      created_at: '2026-06-12T12:05:00.000Z',
    },
    checkpoint_mode: 'yield',
    checkpoint_visibility: 'manual',
    max_iterations: 3,
    config: { defaultShipMode: 'none' },
  });
  assert(staleLineageResponse.status === 'blocked', `stale packet_id should block, got ${staleLineageResponse.status}`);
  assert(
    staleLineageResponse.blocker?.code === 'checkpoint_response_packet_id_mismatch',
    `stale packet_id should report packet_id_mismatch, got ${staleLineageResponse.blocker?.code}`,
  );
  assert(staleLineageResponse.blocker.details.expected_packet_id === yieldedRecon.checkpoint_packet.packet_id, 'blocker should expose expected packet_id');
  assert(staleLineageResponse.blocker.details.actual_packet_id === 'rppkt_000000000000000000000000', 'blocker should expose actual packet_id');
  const persistedStaleLineageState = readJson(paths.harnessStatePath);
  assert(persistedStaleLineageState.checkpoint_packet, 'rejected stale lineage response should keep the pending checkpoint visible');
  assert(persistedStaleLineageState.checkpoint_summary.pending === true, 'stale lineage rejection should leave checkpoint summary pending');
  assert(persistedStaleLineageState.checkpoint_summary.response_count === 0, 'stale lineage rejection should not count as accepted');
  assertNoGenericLifecycleFailure(staleLineageResponse, 'stale checkpoint packet_id blocker');
}

{
  const paths = pathsFor('interaction-missing-proof-evidence');
  writeJson(paths.engineStatePath, {
    repo: 'riddledc/example',
    verification_mode: 'interaction',
    verify_status: 'evidence_captured',
    after_cdn: 'https://cdn.example.com/after-proof.png',
    evidence_bundle: {
      verification_mode: 'interaction',
      after: {
        observation: { valid: true, telemetry_ready: true, reason: 'screenshot-only capture' },
        supporting_artifacts: {
          has_structured_payload: false,
          proof_evidence_present: false,
        },
      },
    },
    proof_assessment_request: {
      status: 'needs_supervising_agent_assessment',
      structured_evidence: {
        verification_mode: 'interaction',
        proof_evidence_present: false,
        route_expectation_source: 'recon_start_path',
        expected_url: 'https://riddledc.com/',
        observed_url: 'https://riddledc.com/',
      },
    },
  });
  const calls = [];
  const result = await harnessMod.runRiddleProofEngineHarness({
    request: {
      ...baseRequest(paths, 'Interaction proof must not pass when capture produced no structured proof evidence.'),
      verification_mode: 'interaction',
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
          checkpoint: 'verify_supervisor_judgment',
          summary: 'Verify captured a screenshot, but no proof evidence was emitted.',
          checkpointContract: {
            checkpoint: 'verify_supervisor_judgment',
            stage: 'verify',
            blocking: false,
          },
        };
      },
    },
    agent: {
      async assessRecon() {
        throw new Error('recon assessment should not run');
      },
      async authorProofPacket() {
        throw new Error('proof authoring should not run');
      },
      async implementChange() {
        throw new Error('implementation should not run');
      },
      async assessProof() {
        return {
          ok: true,
          summary: 'Reviewer attempted to approve screenshot-only interaction evidence.',
          payload: {
            decision: 'ready_to_ship',
            summary: 'Looks good from the screenshot.',
            recommended_stage: 'ship',
            continue_with_stage: 'ship',
            escalation_target: 'agent',
            reasons: ['The screenshot is visible.'],
            source: 'supervising_agent',
          },
        };
      },
    },
    max_iterations: 3,
    config: { defaultShipMode: 'none' },
  });
  assert(result.status === 'blocked', `screenshot-only interaction evidence should block, got ${result.status}`);
  assert(result.blocker?.code === 'proof_hard_blocker', `missing interaction proof evidence blocker should be specific, got ${result.blocker?.code}`);
  assert(
    result.blocker?.message.includes('proof_evidence_present=false'),
    'missing interaction proof evidence blocker should explain proof_evidence_present=false',
  );
  assert(calls.length === 1, 'missing interaction proof evidence should not loop');
  assertNoGenericLifecycleFailure(result, 'interaction missing proof evidence blocker');
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

  const staleCompletedResponse = {
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
  };
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
    checkpoint_response: staleCompletedResponse,
    max_iterations: 3,
    config: { defaultShipMode: 'none' },
  });
  assert(lateCheckpointResponse.status === 'completed', `late checkpoint response should preserve completed status, got ${lateCheckpointResponse.status}`);
  assert(lateCheckpointResponse.raw?.ignored_checkpoint_response === true, 'late checkpoint response should be explicitly ignored');
  assert(!lateCheckpointResponse.blocker, 'late checkpoint response should not create a blocker after terminal completion');
  const persistedAuditState = readJson(paths.harnessStatePath);
  assert(persistedAuditState.status === 'completed', 'persisted terminal status should remain completed after late checkpoint response');
  assert(persistedAuditState.events.some((event) => event.kind === 'checkpoint.response.ignored'), 'ignored late checkpoint response should be recorded as an event');
  assert(persistedAuditState.checkpoint_summary.response_count === 0, 'ignored late completed response must not count as an accepted checkpoint response');
  assert(persistedAuditState.checkpoint_summary.latest_decision === undefined, 'ignored late completed response must not become the latest accepted decision');
  const repeatedLateCheckpointResponse = await harnessMod.runRiddleProofEngineHarness({
    request: {
      ...baseRequest(paths, 'Repeated stale checkpoint responses after terminal completion should still be ignored.'),
      implementation_mode: 'none',
      require_diff: false,
      allow_code_changes: false,
    },
    state_path: paths.harnessStatePath,
    engine: {
      async execute() {
        throw new Error('repeated late checkpoint response after terminal completion should not call the engine');
      },
    },
    checkpoint_response: staleCompletedResponse,
    max_iterations: 3,
    config: { defaultShipMode: 'none' },
  });
  assert(repeatedLateCheckpointResponse.status === 'completed', `repeated late checkpoint response should preserve completed status, got ${repeatedLateCheckpointResponse.status}`);
  assert(repeatedLateCheckpointResponse.raw?.ignored_checkpoint_response === true, 'repeated late completed checkpoint response should be explicitly ignored');
  assert(!repeatedLateCheckpointResponse.blocker, 'repeated late completed checkpoint response should not become a duplicate blocker');
  assertNoGenericLifecycleFailure(lateCheckpointResponse, 'late checkpoint response after terminal completion');
  assertNoGenericLifecycleFailure(repeatedLateCheckpointResponse, 'repeated late checkpoint response after terminal completion');
}

{
  const paths = pathsFor('contradictory-proof-assessment-route');
  writeJson(paths.engineStatePath, {
    repo: 'riddledc/example',
    verification_mode: 'proof',
    verify_status: 'evidence_captured',
    before_cdn: 'https://cdn.example.com/before-proof.png',
    after_cdn: 'https://cdn.example.com/after-proof.png',
    proof_assessment_request: {
      status: 'needs_supervising_agent_assessment',
    },
  });
  const request = {
    ...baseRequest(paths, 'Contradictory proof assessment stage hints must not override the decision.'),
    implementation_mode: 'none',
    require_diff: false,
    allow_code_changes: false,
  };
  const yielded = await harnessMod.runRiddleProofEngineHarness({
    request,
    state_path: paths.harnessStatePath,
    engine: {
      async execute() {
        return {
          ok: true,
          state_path: paths.engineStatePath,
          checkpoint: 'verify_supervisor_judgment',
          summary: 'Verify needs supervising proof assessment.',
          checkpointContract: {
            checkpoint: 'verify_supervisor_judgment',
            stage: 'verify',
            blocking: false,
          },
        };
      },
    },
    checkpoint_mode: 'yield',
    checkpoint_visibility: 'manual',
    max_iterations: 1,
    config: { defaultShipMode: 'none' },
  });
  assert(yielded.status === 'awaiting_checkpoint', `verify assessment should yield, got ${yielded.status}`);
  const packet = yielded.checkpoint_packet;
  assert(packet?.checkpoint === 'verify_supervisor_judgment', 'proof assessment packet should be pending');
  const resumeCalls = [];
  const resumed = await harnessMod.runRiddleProofEngineHarness({
    request,
    state_path: paths.harnessStatePath,
    engine: {
      async execute(params) {
        resumeCalls.push(params);
        const assessment = JSON.parse(params.proof_assessment_json || '{}');
        assert(assessment.decision === 'needs_richer_proof', 'proof assessment decision should be preserved');
        assert(assessment.recommended_stage === 'author', `needs_richer_proof should canonicalize recommended_stage to author, got ${assessment.recommended_stage}`);
        assert(assessment.continue_with_stage === 'author', `needs_richer_proof should canonicalize continue_with_stage to author, got ${assessment.continue_with_stage}`);
        return {
          ok: true,
          state_path: paths.engineStatePath,
          checkpoint: 'verify_agent_retry',
          summary: 'Richer proof is required before shipping.',
          checkpointContract: {
            checkpoint: 'verify_agent_retry',
            stage: 'verify',
            resume: { continue_with_stage: 'author' },
          },
        };
      },
    },
    checkpoint_response: {
      version: 'riddle-proof.checkpoint_response.v1',
      run_id: packet.run_id,
      checkpoint: packet.checkpoint,
      packet_id: packet.packet_id,
      resume_token: packet.resume_token,
      decision: 'needs_richer_proof',
      summary: 'Needs richer proof, but contradictory fields attempted to route to ship.',
      payload: {
        recommended_stage: 'ship',
        continue_with_stage: 'ship',
      },
      continue_with_stage: 'ship',
      created_at: '2026-06-13T00:30:00.000Z',
    },
    checkpoint_mode: 'yield',
    checkpoint_visibility: 'manual',
    max_iterations: 2,
    config: { defaultShipMode: 'none' },
  });
  assert(resumeCalls.length === 1, 'contradictory proof assessment should resume engine exactly once');
  assert(resumed.status === 'awaiting_checkpoint', `contradictory proof assessment should yield author retry, got ${resumed.status}`);
  assert(resumed.checkpoint_packet?.stage === 'author', 'needs_richer_proof should route to author, not ship');
  assert(resumed.checkpoint_packet?.checkpoint === 'verify_agent_retry', 'retry checkpoint should remain tied to verify_agent_retry');
  assert(!resumed.raw?.ship_held, 'needs_richer_proof with contradictory ship hints must not become ship-held ready_to_ship');
  assertNoGenericLifecycleFailure(resumed, 'contradictory proof assessment stage routing');
}

console.log(JSON.stringify({
  ok: true,
  suite: 'riddle-proof.direct-trust-boundary',
  cases: [
    'valid evidence ready_to_ship',
    'late checkpoint response ignored after ready_to_ship without finalized flag',
    'invalid evidence proof_assessment_blocked',
    'unadvertised checkpoint response decision blocked',
    'stale checkpoint packet_id blocked',
    'interaction missing proof evidence hard blocker',
    'timeout capture retry checkpoint',
    'no-diff audit completed',
    'late checkpoint response ignored after terminal completion',
    'contradictory proof assessment stage hints canonicalized',
  ],
}, null, 2));
