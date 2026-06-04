import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const fixtureDir = path.join(__dirname, 'test-fixture');
const fakeSkillDir = path.join(fixtureDir, 'skills', 'riddle-proof');
const fakePipelineDir = path.join(fakeSkillDir, 'pipelines');
const fakeStatePath = path.join(fixtureDir, 'riddle-proof-state.json');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf-8'));
}

function writeJson(file, payload) {
  writeFileSync(file, JSON.stringify(payload, null, 2));
}

function baselineUnderstanding(overrides = {}) {
  return {
    reference: 'before',
    target_route: '/good',
    before_evidence_url: 'https://cdn.example.com/before.png',
    visible_before_state: 'The requested route is visible before implementation.',
    relevant_elements: ['.cta'],
    requested_change: 'Loop stage gating',
    proof_focus: 'Compare the same route before and after the implementation.',
    stop_condition: 'The after evidence shows the requested UI change on the approved route.',
    quality_risks: [],
    ...overrides,
  };
}

function assertStrictSchemaRequiredFields(schema, label) {
  if (!schema || typeof schema !== 'object') return;
  const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : null;
  if (properties && schema.additionalProperties === false) {
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    for (const key of Object.keys(properties)) {
      assert(required.has(key), `${label}.${key} must be listed in required for strict structured output schema`);
    }
  }
  if (properties) {
    for (const [key, value] of Object.entries(properties)) {
      assertStrictSchemaRequiredFields(value, `${label}.${key}`);
    }
  }
  if (schema.items) {
    assertStrictSchemaRequiredFields(schema.items, `${label}[]`);
  }
}

function setupFixture() {
  mkdirSync(fakePipelineDir, { recursive: true });
  for (const action of ['setup', 'recon', 'author', 'implement', 'verify', 'ship']) {
    writeFileSync(path.join(fakePipelineDir, `riddle-proof-${action}.lobster`), `name: riddle-proof-${action}\nsteps: []\n`);
  }
  writeJson(fakeStatePath, {
    workspace_ready: true,
    stage: 'recon',
    repo: 'openclaw/openclaw-plugins',
    branch: 'agent/openclaw/test-branch',
    mode: 'server',
    reference: 'before',
    change_request: 'Confirm screenshots are captured',
    commit_message: 'test commit',
    author_status: 'needs_recon_judgment',
    proof_plan_status: 'needs_recon_judgment',
    recon_status: 'needs_supervisor_judgment',
    recon_assessment_request: {
      attempt: 1,
      max_attempts: 4,
      attempts_used: 1,
      attempts_remaining: 3,
      status: 'needs_supervising_agent_assessment',
    },
    recon_decision_request: {
      attempt: 1,
      max_attempts: 4,
      attempts_used: 1,
      attempts_remaining: 3,
      status: 'needs_supervising_agent_assessment',
    },
    recon_results: {
      max_attempts: 4,
      attempt_history: [{ attempt: 1, result: 'partial_capture' }],
    },
    implementation_status: 'pending_recon',
    before_cdn: 'https://cdn.example.com/before.png',
    after_cdn: '',
    pr_url: 'https://github.com/openclaw/openclaw-plugins/pull/999',
    reviewer: 'davisdiehl',
  });
}

function makeLoopState() {
  return {
    workspace_ready: true,
    stage: 'recon',
    repo: 'openclaw/openclaw-plugins',
    branch: 'agent/openclaw/loop-test',
    mode: 'static',
    reference: 'before',
    change_request: 'Loop stage gating',
    commit_message: 'Loop stage gating',
    author_status: 'ready',
    proof_plan_status: 'ready',
    proof_plan: 'Use the existing proof packet.',
    capture_script: "await saveScreenshot('after-proof');",
    recon_status: 'ready_for_proof_plan',
    recon_results: {
      max_attempts: 4,
      attempt_history: [{ attempt: 1, result: 'success' }],
      baselines: { before: { path: '/good', url: 'https://cdn.example.com/before.png' } },
    },
    proof_plan_request: { target_path: '/good' },
    implementation_status: 'pending_recon',
    verify_status: '',
    verify_summary: '',
    verify_decision_request: {},
    proof_assessment: {},
    proof_assessment_request: {},
    proof_assessment_source: null,
    before_cdn: 'https://cdn.example.com/before.png',
    after_cdn: '',
    prod_cdn: '',
    stage_attempts: {},
    stage_decision_request: {},
  };
}

function installFakeLobster() {
  const root = path.join(fixtureDir, 'fake-lobster');
  rmSync(root, { recursive: true, force: true });
  const binDir = path.join(root, 'bin');
  mkdirSync(binDir, { recursive: true });
  writeFileSync(path.join(root, 'package.json'), '{"type":"commonjs"}\n');
  const scriptPath = path.join(binDir, 'lobster');
  writeFileSync(scriptPath, `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
if (args[0] === 'resume') {
  process.stdout.write(JSON.stringify({ ok: true, resumed: true }));
  process.exit(0);
}
const file = args[args.indexOf('--file') + 1];
const argsJson = args.includes('--args-json') ? args[args.indexOf('--args-json') + 1] : '{}';
const stageMatch = path.basename(file).match(/riddle-proof-(.+)\\.lobster$/);
const stage = stageMatch ? stageMatch[1] : '';
const statePath = process.env.RIDDLE_PROOF_STATE_FILE;
const payload = JSON.parse(argsJson || '{}');
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
state.repo = state.repo || payload.repo || 'openclaw/openclaw-plugins';
state.branch = state.branch || payload.branch || 'agent/openclaw/test-branch';
state.change_request = state.change_request || payload.change_request || 'Test change';
state.commit_message = state.commit_message || payload.commit_message || 'Test commit';
state.reference = state.reference || payload.reference || 'before';
state.mode = state.mode || payload.mode || 'static';
state.recon_results = state.recon_results || { max_attempts: 4, attempt_history: [] };
state.stage_attempts = state.stage_attempts || {};
state.stage_decision_request = state.stage_decision_request || {};
if (stage === 'setup') {
  if (payload.implementation_mode !== undefined) state.implementation_mode = payload.implementation_mode;
  if (payload.require_diff !== undefined) state.require_diff = payload.require_diff;
  if (payload.allow_code_changes !== undefined) state.allow_code_changes = payload.allow_code_changes;
  state.workspace_ready = true;
  state.stage = 'setup';
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  process.stdout.write(JSON.stringify({ ok: true, stage }));
  process.exit(0);
}
if (stage === 'recon') {
  const attempt = (state.recon_results.attempt_history || []).length + 1;
  const targetPath = state.server_path || '/wrong';
  const capturedBaselines = targetPath === '/wrong'
    ? {}
    : { before: { path: targetPath || '/good', url: 'https://cdn.example.com/before.png' } };
  const observations = {
    before: targetPath === '/wrong'
      ? { label: 'before', ok: false, reason: 'wrong route', url: '', details: { observed_path: targetPath } }
      : { label: 'before', ok: true, reason: 'ok', url: 'https://cdn.example.com/before.png', details: { observed_path: targetPath } },
  };
  const latestAttempt = {
    attempt,
    plan: { target_path: targetPath },
    observations,
    captured_baselines: capturedBaselines,
    result: targetPath === '/wrong' ? 'partial_capture' : 'captured_candidates',
  };
  state.stage = 'recon';
  state.recon_status = 'needs_supervisor_judgment';
  state.author_status = 'needs_recon_judgment';
  state.proof_plan_status = 'needs_recon_judgment';
  state.before_cdn = '';
  state.recon_results.max_attempts = 4;
  state.recon_results.status = 'needs_supervisor_judgment';
  state.recon_results.attempt_history = [...(state.recon_results.attempt_history || []), latestAttempt];
  state.recon_results.baselines = {};
  state.recon_assessment = {};
  state.recon_assessment_source = null;
  state.recon_assessment_request = {
    status: 'needs_supervising_agent_assessment',
    attempt,
    max_attempts: 4,
    attempts_used: attempt,
    attempts_remaining: Math.max(0, 4 - attempt),
    current_plan: { target_path: targetPath },
    latest_attempt: latestAttempt,
    observed_baselines: capturedBaselines,
    fields_agent_may_update: ['recon_assessment_json', 'server_path', 'wait_for_selector', 'reference'],
    instructions: ['Judge whether the latest baseline is trustworthy, retry recon if needed, or declare the loop stuck.'],
    response_schema: { decision: 'retry_recon | ready_for_author | recon_stuck' },
  };
  state.recon_decision_request = state.recon_assessment_request;
  state.author_request = {
    status: 'pending_recon_judgment',
    current_plan: { target_path: targetPath },
    latest_attempt: latestAttempt,
    observed_baselines: capturedBaselines,
    fallback_defaults: {
      server_path: targetPath === '/wrong' ? '/good' : targetPath,
      wait_for_selector: state.wait_for_selector || '',
      proof_plan: 'Use the recon-confirmed route and capture the fixed state.',
      capture_script: "await saveScreenshot('after-proof');",
    },
  };
  state.proof_plan_request = state.author_request;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  process.stdout.write(JSON.stringify({ ok: true, stage, recon_status: state.recon_status }));
  process.exit(0);
}
if (stage === 'author') {
  state.stage = 'author';
  const suppliedPacket = state.supervisor_author_packet || {};
  const hasPacket = (suppliedPacket.proof_plan || '').trim() && (suppliedPacket.capture_script || '').trim();
  if (!hasPacket) {
    state.author_status = 'needs_supervisor_judgment';
    state.proof_plan_status = 'needs_supervisor_judgment';
    state.author_mode = 'supervisor_request';
    state.author_model = 'supervising-agent';
    state.author_summary = 'Awaiting supervising agent proof packet.';
    state.author_request = {
      ...(state.author_request || {}),
      status: 'needs_supervisor_judgment',
      fallback_defaults: {
        server_path: state.server_path || '/good',
        wait_for_selector: state.wait_for_selector || '',
        proof_plan: 'Use the recon-confirmed route and capture the fixed state.',
        capture_script: "await saveScreenshot('after-proof');",
      },
    };
    state.proof_plan_request = state.author_request;
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    process.stdout.write(JSON.stringify({ ok: true, stage, author_status: state.author_status }));
    process.exit(0);
  }
  state.proof_plan = suppliedPacket.proof_plan;
  state.capture_script = suppliedPacket.capture_script;
  state.server_path = (suppliedPacket.refined_inputs || {}).server_path || state.server_path || '/good';
  state.wait_for_selector = (suppliedPacket.refined_inputs || {}).wait_for_selector || state.wait_for_selector || '';
  state.author_status = 'ready';
  state.proof_plan_status = 'ready';
  state.author_mode = 'supervising_agent';
  state.author_runtime_model_hint = process.env.OPENCLAW_MODEL || '';
  state.author_model = state.author_runtime_model_hint ? 'supervising-agent:' + state.author_runtime_model_hint : 'supervising-agent';
  state.author_summary = 'Supervising agent supplied proof packet';
  state.author_request = {
    ...(state.author_request || {}),
    status: 'ready',
    authoring_mode: state.author_mode,
    authoring_model: state.author_model,
    runtime_model_hint: state.author_runtime_model_hint,
    authored_outputs: { proof_plan: state.proof_plan, capture_script: state.capture_script },
    refined_inputs: { server_path: state.server_path, wait_for_selector: state.wait_for_selector || '' },
  };
  state.proof_plan_request = state.author_request;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  process.stdout.write(JSON.stringify({ ok: true, stage }));
  process.exit(0);
}
if (stage === 'implement') {
  state.stage = 'implement';
  state.implementation_status = 'changes_detected';
  state.implementation_summary = 'Implementation detected in 2 file(s): src/index.ts, src/core.ts';
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  process.stdout.write(JSON.stringify({ ok: true, stage }));
  process.exit(0);
}
if (stage === 'verify') {
  state.stage = 'verify';
  const verifyStatus = state.simulate_verify_status || 'evidence_captured';
  const structuredInteractionFailureSummary = (state.simulate_structured_interaction_failure_summary || '').trim();
  const structuredInteractionCaptureFailureSummary = (state.simulate_structured_interaction_capture_failure_summary || '').trim();
  const proofAssessmentHardBlocker = (state.simulate_proof_assessment_hard_blocker || '').trim();
  const captureQualitySummary = (state.simulate_capture_quality_summary || '').trim();
  const captureQualityBlocking = state.simulate_capture_quality_blocking === true;
  const captureQualityDecision = (state.simulate_capture_quality_decision || '').trim() || (captureQualityBlocking ? 'failed_capture' : 'revise_capture');
  state.structured_interaction_capture_failure_summary = structuredInteractionCaptureFailureSummary || undefined;
  state.structured_interaction_failure_summary = structuredInteractionFailureSummary || undefined;
  state.verify_status = verifyStatus;
  if (verifyStatus === 'capture_incomplete') {
    state.after_cdn = '';
    state.verify_summary = structuredInteractionCaptureFailureSummary || captureQualitySummary || 'Verify did not capture a usable proof packet yet.';
    state.merge_recommendation = 'do-not-merge';
    state.proof_assessment = {};
    state.proof_assessment_request = proofAssessmentHardBlocker
      ? { hard_blockers: [proofAssessmentHardBlocker] }
      : {};
    state.verify_results = {
      baseline: { reference: state.reference || 'before' },
      after: { screenshots: [], observation: { valid: false, reason: 'no screenshot in capture' } },
    };
    state.verify_decision_request = {
      status: verifyStatus,
      summary: state.verify_summary,
      structured_interaction_capture_failure_summary: structuredInteractionCaptureFailureSummary || undefined,
      next_stage_options: ['author', 'verify', 'implement', 'recon'],
      recommended_stage: captureQualityBlocking ? null : 'author',
      continue_with_stage: captureQualityBlocking ? null : 'author',
      capture_quality: {
        decision: captureQualityDecision,
        summary: captureQualitySummary || state.verify_summary,
        recommended_stage: captureQualityBlocking ? null : 'author',
        continue_with_stage: captureQualityBlocking ? null : 'author',
        blocking: captureQualityBlocking || undefined,
        terminal_blocker: captureQualityBlocking || undefined,
        reasons: [captureQualitySummary || 'The after-proof is missing or low quality.'],
      },
    };
  } else {
    state.after_cdn = 'https://cdn.example.com/after.png';
    state.verify_summary = structuredInteractionFailureSummary || 'Verify captured usable evidence and is waiting for supervising-agent proof assessment.';
    state.merge_recommendation = structuredInteractionFailureSummary || proofAssessmentHardBlocker ? 'do-not-merge' : 'pending-supervisor-judgment';
    state.proof_assessment = {};
    state.proof_assessment_request = {
      status: 'needs_supervising_agent_assessment',
      hard_blockers: proofAssessmentHardBlocker ? [proofAssessmentHardBlocker] : undefined,
      response_schema: {
        decision: 'ready_to_ship | needs_richer_proof',
        continue_with_stage: 'ship | author',
      },
    };
    state.verify_results = {
      baseline: { reference: state.reference || 'before' },
      after: { screenshots: [{ url: state.after_cdn }], observation: { valid: true, reason: 'ok' } },
    };
    state.verify_decision_request = {
      status: verifyStatus,
      summary: state.verify_summary,
      next_stage_options: ['verify', 'author', 'implement', 'ship', 'recon'],
      recommended_stage: null,
      continue_with_stage: null,
      structured_interaction_failure_summary: structuredInteractionFailureSummary || undefined,
      assessment_request: state.proof_assessment_request,
    };
  }
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  if (state.simulate_verify_nonzero_exit) {
    process.stderr.write(state.simulate_verify_nonzero_exit_message || state.verify_summary || 'simulated verify nonzero exit');
    process.exit(1);
  }
  process.stdout.write(JSON.stringify({ ok: true, stage, verify_status: verifyStatus }));
  process.exit(0);
}
if (stage === 'ship') {
  state.stage = 'ship';
  state.pr_url = state.pr_url || 'https://github.com/openclaw/openclaw-plugins/pull/321';
  state.finalized = true;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  process.stdout.write(JSON.stringify({ ok: true, stage, pr_url: state.pr_url }));
  process.exit(0);
}
process.stdout.write(JSON.stringify({ ok: false, error: 'unknown stage: ' + stage }));
process.exit(1);
`);
  chmodSync(scriptPath, 0o755);
  const ghPath = path.join(binDir, 'gh');
  writeFileSync(ghPath, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'pr' && args[1] === 'view') {
  process.stdout.write(JSON.stringify({
    state: process.env.FAKE_GH_PR_STATE || 'MERGED',
    mergedAt: '2026-04-16T05:30:00Z',
    closedAt: '',
    mergeCommit: { oid: 'merge-sync-123' },
    headRefName: 'proof/sync-branch',
    baseRefName: 'main',
    url: 'https://github.com/openclaw/openclaw-plugins/pull/321',
    number: 321,
  }));
  process.exit(0);
}
process.stderr.write('unknown gh command: ' + args.join(' '));
process.exit(1);
`);
  chmodSync(ghPath, 0o755);
  return root;
}

async function run() {
  setupFixture();
  if (!existsSync(path.join(__dirname, 'dist', 'proof-run-core.js'))) {
    execFileSync('npm', ['run', 'build'], { cwd: __dirname, stdio: 'pipe' });
  }

  const core = await import(pathToFileURL(path.join(__dirname, 'dist', 'proof-run-core.js')).href);
  const engineMod = await import(pathToFileURL(path.join(__dirname, 'dist', 'proof-run-engine.js')).href);
  const proofSessionMod = await import(pathToFileURL(path.join(__dirname, 'dist', 'proof-session.js')).href);
  const harnessMod = await import(pathToFileURL(path.join(__dirname, 'dist', 'engine-harness.js')).href);
  const codexExecMod = await import(pathToFileURL(path.join(__dirname, 'dist', 'codex-exec-agent.js')).href);
  const cjsCore = require(path.join(__dirname, 'dist', 'proof-run-core.cjs'));
  const cjsEngineMod = require(path.join(__dirname, 'dist', 'proof-run-engine.cjs'));
  const cjsProofSessionMod = require(path.join(__dirname, 'dist', 'proof-session.cjs'));
  const cjsHarnessMod = require(path.join(__dirname, 'dist', 'engine-harness.cjs'));
  assert(typeof engineMod.createRiddleProofEngine === 'function', 'dist/proof-run-engine.js should expose createRiddleProofEngine');
  assert(typeof cjsEngineMod.createRiddleProofEngine === 'function', 'dist/proof-run-engine.cjs should expose createRiddleProofEngine');
  assert(typeof harnessMod.runRiddleProofEngineHarness === 'function', 'dist/engine-harness.js should expose runRiddleProofEngineHarness');
  assert(typeof codexExecMod.createCodexExecAgentAdapter === 'function', 'dist/codex-exec-agent.js should expose createCodexExecAgentAdapter');
  assert(typeof cjsHarnessMod.runRiddleProofEngineHarness === 'function', 'dist/engine-harness.cjs should expose runRiddleProofEngineHarness');
  assert(typeof core.noImplementationModeFor === 'function', 'dist/proof-run-core.js should expose noImplementationModeFor');
  assert(typeof proofSessionMod.buildVisualProofSession === 'function', 'dist/proof-session.js should expose buildVisualProofSession');
  assert(typeof cjsProofSessionMod.buildVisualProofSession === 'function', 'dist/proof-session.cjs should expose buildVisualProofSession');
  assert(
    core.RIDDLE_PROOF_DIR_CANDIDATES[0].endsWith('/runtime'),
    'default riddle-proof lookup should prefer the bundled package runtime',
  );

  let capturedAuthorRequest = null;
  const interactionAuthorAdapter = codexExecMod.createCodexExecAgentAdapter({}, async (request) => {
    capturedAuthorRequest = request;
    assertStrictSchemaRequiredFields(request.schema, 'author schema');
    assert(
      request.schema.required.includes('expected_terminal_path'),
      'author schema should require root expected_terminal_path for strict structured output',
    );
    assert(
      request.schema.required.includes('interaction_contract'),
      'author schema should require root interaction_contract for strict structured output',
    );
    assert(
      request.schema.properties.refined_inputs.required.includes('expected_start_path'),
      'author schema refined_inputs should require expected_start_path for strict structured output',
    );
    assert(
      request.schema.properties.refined_inputs.required.includes('expected_terminal_path'),
      'author schema refined_inputs should require expected_terminal_path for strict structured output',
    );
    assert(
      request.schema.properties.refined_inputs.properties.expected_terminal_path,
      'author schema should allow refined_inputs.expected_terminal_path',
    );
    assert(
      request.schema.properties.refined_inputs.properties.expected_start_path,
      'author schema should allow refined_inputs.expected_start_path',
    );
    assert(
      request.schema.properties.interaction_contract,
      'author schema should allow an interaction_contract',
    );
    assert(
      request.schema.properties.interaction_contract.required.includes('expected_url'),
      'author schema interaction_contract should require expected_url for strict structured output',
    );
    assert(
      request.prompt.includes('wait-only script is invalid'),
      'author prompt should reject passive interaction capture scripts',
    );
    assert(
      request.prompt.includes('refined_inputs.expected_terminal_path'),
      'author prompt should require durable expected terminal route fields',
    );
    return {
      ok: true,
      json: {
        proof_plan: 'Start at /, click the visible Proof nav link, and verify the terminal /proof/ route.',
        capture_script: [
          "const startUrl = page.url();",
          "await page.getByRole('link', { name: /^Proof$/ }).click();",
          "await page.waitForURL('**/proof/');",
          "const terminalUrl = page.url();",
          "const evidence = { version: 'riddle-proof.interaction.v1', action: 'click Proof nav link', startUrl, terminalUrl, routeMatched: new URL(terminalUrl).pathname === '/proof/', proof_evidence_present: true };",
          "await saveScreenshot('after-proof');",
          "return evidence;",
        ].join('\n'),
        baseline_understanding_used: baselineUnderstanding({
          reference: 'prod',
          target_route: '/',
          before_evidence_url: 'https://cdn.example.com/prod-home.png',
          requested_change: 'Verify Home -> Proof navigation without code edits.',
          proof_focus: 'Click the Proof nav link and verify the terminal route.',
          stop_condition: 'The structured proof evidence records /proof/ as the terminal route.',
        }),
        refined_inputs: {
          server_path: '/',
          wait_for_selector: null,
          reference: 'prod',
          expected_start_path: '/',
          expected_terminal_path: '/proof/',
        },
        expected_terminal_path: '/proof/',
        interaction_contract: {
          start_path: '/',
          expected_terminal_path: '/proof/',
          expected_url: 'https://riddledc.com/proof/',
          action: 'click the visible Proof nav link',
          assertions: ['terminal route is /proof/'],
        },
        rationale: ['The no-ship interaction proof needs a real browser action and structured terminal route evidence.'],
        confidence: 'high',
        summary: 'Route-aware interaction proof packet.',
      },
    };
  });
  const interactionAuthorPayload = await interactionAuthorAdapter.authorProofPacket({
    request: {
      change_request: 'Verify Home -> Proof navigation. Start at https://riddledc.com/. Click the visible Proof nav link. Expected terminal URL is https://riddledc.com/proof/.',
      prod_url: 'https://riddledc.com/',
      verification_mode: 'interaction',
      implementation_mode: 'none',
      require_diff: false,
      allow_code_changes: false,
      success_criteria: 'Terminal URL is https://riddledc.com/proof/ and structured proof evidence is present.',
    },
    state: { run_id: 'rp_author_contract' },
    engineResult: { checkpoint: 'author_supervisor_judgment', state_path: fakeStatePath },
    fullRiddleState: {
      verification_mode: 'interaction',
      server_path: '/',
      recon_baseline_understanding: baselineUnderstanding({
        reference: 'prod',
        target_route: '/',
        before_evidence_url: 'https://cdn.example.com/prod-home.png',
      }),
    },
    checkpoint: 'author_supervisor_judgment',
  });
  assert(capturedAuthorRequest, 'author adapter should call the JSON runner');
  assert(interactionAuthorPayload.ok === true, 'route-aware interaction author packet should be accepted');
  assert(
    interactionAuthorPayload.payload.refined_inputs.expected_terminal_path === '/proof/',
    'author adapter should preserve expected_terminal_path from route-aware interaction packets',
  );
  assert(
    interactionAuthorPayload.payload.interaction_contract.expected_terminal_path === '/proof/',
    'author adapter should preserve interaction contract terminal route',
  );
  assert(
    cjsCore.RIDDLE_PROOF_DIR_CANDIDATES[0].endsWith('/runtime'),
    'CommonJS default riddle-proof lookup should prefer the bundled package runtime',
  );
  for (const stage of core.WORKFLOW_STAGE_ORDER) {
    const pipelinePath = path.join(__dirname, 'runtime', 'pipelines', `riddle-proof-${stage}.lobster`);
    assert(
      existsSync(pipelinePath),
      `package runtime should include the ${stage} lobster pipeline`,
    );
    assert(
      !readFileSync(pipelinePath, 'utf-8').includes('/root/.openclaw/extensions/openclaw-riddle-proof'),
      `package runtime ${stage} pipeline should not fall back to the legacy OpenClaw extension path`,
    );
  }
  assert(existsSync(path.join(__dirname, 'runtime', 'lib', 'setup.py')), 'package runtime should include Python stage helpers');
  assert(existsSync(path.join(__dirname, 'lib', 'workspace-core.mjs')), 'package should include shared workspace helper');
  const originalRiddleProofDir = process.env.RIDDLE_PROOF_DIR;
  process.env.RIDDLE_PROOF_DIR = fakeSkillDir;
  try {
    const envConfig = core.resolveConfig({}, { action: 'status' });
    assert(envConfig.riddleProofDir === fakeSkillDir, 'RIDDLE_PROOF_DIR should override built-in skill root candidates');
  } finally {
    if (originalRiddleProofDir === undefined) {
      delete process.env.RIDDLE_PROOF_DIR;
    } else {
      process.env.RIDDLE_PROOF_DIR = originalRiddleProofDir;
    }
  }
  const config = core.resolveConfig({ riddleProofDir: fakeSkillDir, statePath: fakeStatePath, defaultReviewer: 'octocat' });
  const isolatedConfig = core.resolveConfig({ riddleProofDir: fakeSkillDir }, { action: 'run' });
  assert(isolatedConfig.statePath.startsWith('/tmp/riddle-proof-state-'), 'new run should get an isolated state file');
  assert(isolatedConfig.argsPath.startsWith('/tmp/riddle-proof-args-'), 'new run should get a matching isolated args file');

  const missingWorkflowRoot = mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-missing-workflow-'));
  mkdirSync(path.join(missingWorkflowRoot, 'pipelines'), { recursive: true });
  const missingWorkflowStatePath = path.join(missingWorkflowRoot, 'state.json');
  writeJson(missingWorkflowStatePath, {
    ...makeLoopState(),
    implementation_status: 'changes_detected',
  });
  const missingWorkflowConfig = core.resolveConfig(
    { riddleProofDir: missingWorkflowRoot, statePath: missingWorkflowStatePath, defaultReviewer: 'octocat' },
    { action: 'verify', state_path: missingWorkflowStatePath },
  );
  const missingWorkflowResult = await engineMod.executeWorkflow(
    { action: 'verify', state_path: missingWorkflowStatePath },
    { riddleProofDir: missingWorkflowRoot, statePath: missingWorkflowStatePath, defaultReviewer: 'octocat' },
    missingWorkflowConfig,
  );
  assert(missingWorkflowResult.ok === false, 'missing workflow file should fail explicitly before lobster execution');
  assert(
    String(missingWorkflowResult.error || '').includes('Riddle Proof workflow file missing for verify'),
    'missing workflow failure should name the missing verify pipeline',
  );

  const visualSessionInput = {
    run_id: 'rp_test_visual',
    repo: 'example/repo',
    branch: 'agent/openclaw/visual-iteration',
    route: '/games/luge-run',
    observed_after_path: '/games/luge-run',
    reference: 'before',
    verification_mode: 'visual',
    target_image_url: 'https://cdn.example.com/luge-spec.png',
    target_image_hash: 'sha256:spec',
    viewport_matrix: [{ name: 'mobile', width: 390, height: 844 }],
    deterministic_setup: { seed: 'luge-v1' },
    proof_plan: 'Compare the luge game against the generated visual spec.',
    capture_script: "await page.waitForSelector('canvas'); await saveScreenshot('after-proof');",
    wait_for_selector: 'canvas',
    assertions: [{ kind: 'route', path: '/games/luge-run' }],
    artifacts: { before: 'https://cdn.example.com/before.png', after: 'https://cdn.example.com/after.png' },
    evidence: { visual_delta: { status: 'measured', passed: true } },
    status: 'evidence_captured',
  };
  const visualSession = proofSessionMod.buildVisualProofSession(visualSessionInput);
  const parsedVisualSession = proofSessionMod.parseVisualProofSession(JSON.stringify(visualSession));
  assert(visualSession.version === proofSessionMod.RIDDLE_PROOF_VISUAL_SESSION_VERSION, 'visual proof session should use the v1 contract');
  assert(parsedVisualSession.fingerprint === visualSession.fingerprint, 'visual proof session should round-trip through JSON');
  assert(visualSession.parent_session_id === null, 'visual proof session should record missing parent explicitly');
  assert(visualSession.fingerprint_basis.capture_script_hash, 'visual proof session fingerprint should include capture script hash');
  assert(proofSessionMod.compareVisualProofSessionFingerprint(visualSession, visualSessionInput).length === 0, 'same visual proof inputs should match the session fingerprint');
  const visualSessionRouteMismatch = proofSessionMod.compareVisualProofSessionFingerprint(visualSession, {
    ...visualSessionInput,
    route: '/games/circle-maze',
  });
  assert(visualSessionRouteMismatch.some((item) => item.key === 'route'), 'different proof route should report a session fingerprint mismatch');

  const args = core.buildSetupArgs({
    action: 'setup',
    repo: 'openclaw/openclaw-plugins',
    change_request: 'Confirm screenshots are captured',
    reference: 'both',
    discord_channel: 'parent-channel-123',
    discord_thread_id: 'thread-456',
    discord_message_id: 'message-789',
    discord_source_url: 'https://discord.com/channels/guild/thread-456/message-789',
    auth_localStorage_json: '{"session":"local"}',
    auth_cookies_json: '[{"name":"session","value":"cookie"}]',
    auth_headers_json: '{"Authorization":"Bearer token"}',
    leave_draft: true,
    assertions: [{ kind: 'text', contains: 'Confirm screenshots' }],
    target_image_url: 'https://cdn.example.com/spec.png',
    target_image_hash: 'sha256:spec',
    viewport_matrix: [{ name: 'mobile', width: 390, height: 844 }],
    deterministic_setup: { seed: 'setup-v1' },
  }, config);

  assert(args.repo === 'openclaw/openclaw-plugins', 'setup args should preserve repo');
  assert(args.commit_message === 'Confirm screenshots are captured', 'setup should infer commit message from change_request');
  assert(args.capture_script === '', 'setup should allow capture_script to be omitted');
  assert(args.reference === 'both', 'setup args should preserve requested reference so preflight can record downgrade reason');
  assert(args.reviewer === 'octocat', 'default reviewer should flow into setup args');
  assert(args.server_path === '', 'setup should not force homepage as an explicit recon route');
  assert(args.server_path_source === '', 'setup should leave server_path source empty when caller omitted it');
  assert(args.discord_channel === 'parent-channel-123', 'setup args should preserve Discord parent channel');
  assert(args.discord_thread_id === 'thread-456', 'setup args should preserve Discord thread target');
  assert(args.discord_message_id === 'message-789', 'setup args should preserve Discord source message');
  assert(args.discord_source_url === 'https://discord.com/channels/guild/thread-456/message-789', 'setup args should preserve Discord source URL');
  assert(args.auth_localStorage_json === '{"session":"local"}', 'setup args should preserve auth localStorage JSON');
  assert(args.auth_cookies_json === '[{"name":"session","value":"cookie"}]', 'setup args should preserve auth cookies JSON');
  assert(args.auth_headers_json === '{"Authorization":"Bearer token"}', 'setup args should preserve auth headers JSON');
  assert(args.leave_draft === 'true', 'setup args should preserve explicit draft hold intent');
  assert(args.assertions_json === '[{"kind":"text","contains":"Confirm screenshots"}]', 'setup args should stringify structured assertions');
  assert(args.target_image_url === 'https://cdn.example.com/spec.png', 'setup args should preserve visual target image URL');
  assert(args.target_image_hash === 'sha256:spec', 'setup args should preserve visual target image hash');
  assert(args.viewport_matrix_json === '[{"name":"mobile","width":390,"height":844}]', 'setup args should stringify viewport matrix');
  assert(args.deterministic_setup_json === '{"seed":"setup-v1"}', 'setup args should stringify deterministic setup');
  assert(core.noImplementationModeFor({ implementation_mode: 'none' }), 'implementation_mode=none should activate audit/no-diff routing');
  const auditArgs = core.buildSetupArgs({
    action: 'setup',
    repo: 'openclaw/openclaw-plugins',
    change_request: 'Audit the deployed site',
    mode: 'audit',
    implementation_mode: 'none',
    require_diff: false,
    allow_code_changes: false,
  }, config);
  assert(auditArgs.mode === '', 'audit workflow mode should not be passed to runtime as a preview mode');
  assert(auditArgs.implementation_mode === 'none', 'setup args should preserve audit/no-diff implementation mode');
  assert(auditArgs.require_diff === false, 'setup args should preserve require_diff=false');
  assert(auditArgs.allow_code_changes === false, 'setup args should preserve allow_code_changes=false');

  const requestedTerminalStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-requested-terminal-')), 'state.json');
  writeJson(requestedTerminalStatePath, {
    workspace_ready: true,
    stage: 'author',
    repo: 'riddledc/site',
    branch: 'agent/openclaw/requested-terminal-route',
    verification_mode: 'interaction',
    server_path: '/',
    author_status: 'needs_supervisor_judgment',
    proof_plan_status: 'needs_supervisor_judgment',
  });
  const requestedTerminalState = core.mergeStateFromParams(requestedTerminalStatePath, {
    action: 'run',
    change_request: 'Verify Home -> Proof navigation. Start at https://riddledc.com/. Click the visible Proof nav link. Expected terminal URL is https://riddledc.com/proof/.',
    success_criteria: 'Terminal URL is https://riddledc.com/proof/ and structured proof evidence is present.',
    verification_mode: 'interaction',
    implementation_mode: 'none',
    require_diff: false,
    allow_code_changes: false,
  });
  assert(requestedTerminalState.requested_expected_terminal_path === '/proof', 'explicit expected terminal URL should be normalized into requested terminal path');
  assert(requestedTerminalState.expected_terminal_path === '/proof', 'explicit expected terminal URL should seed expected_terminal_path before authoring');
  assert(requestedTerminalState.expected_start_path === '/', 'interaction route contract should preserve the start route');
  assert(requestedTerminalState.interaction_contract.expected_terminal_path === '/proof', 'interaction contract should include requested terminal path');

  const patched = core.mergeStateFromParams(fakeStatePath, {
    action: 'author',
    author_packet_json: JSON.stringify({
      proof_plan: 'Use the recon-confirmed route and capture the fixed state.',
      capture_script: "const evidence = { ok: true };\nglobalThis.__riddleProofEvidence = evidence;\nawait saveScreenshot('after-proof');",
      refined_inputs: { server_path: '/pricing', wait_for_selector: '.cta', expected_terminal_path: '/proof/' },
      interaction_contract: { start_path: '/pricing', expected_terminal_path: '/proof/' },
      rationale: ['Recon already confirmed the route.'],
      confidence: 'high',
      summary: 'Supervisor packet',
    }),
    proof_assessment_json: JSON.stringify({
      decision: 'ready_to_ship',
      summary: 'Evidence is strong enough to ship.',
      recommended_stage: 'ship',
      continue_with_stage: 'ship',
      escalation_target: 'agent',
      reasons: ['Before/after evidence is strong.'],
    }),
    advance_stage: 'author',
    discord_channel: 'parent-channel-123',
    discord_thread_id: 'thread-456',
    discord_message_id: 'message-789',
    discord_source_url: 'https://discord.com/channels/guild/thread-456/message-789',
    auth_localStorage_json: '{"session":"local"}',
    auth_cookies_json: '[{"name":"session","value":"cookie"}]',
    auth_headers_json: '{"Authorization":"Bearer token"}',
    leave_draft: true,
  });

  assert(patched.supervisor_author_packet.proof_plan, 'author packet json should be parsed into state');
  assert(patched.proof_assessment.decision === 'ready_to_ship', 'proof assessment json should be parsed into state');
  assert(patched.proof_assessment_source === 'supervising_agent', 'proof assessment source should record supervising_agent');
  assert(patched.merge_recommendation === 'ready-to-ship', 'ready proof assessment should update merge recommendation');
  assert(patched.proof_summary.includes('Supervising proof assessment: ready_to_ship'), 'proof summary should include the supervising assessment decision');
  assert(patched.proof_summary.includes('Evidence is strong enough to ship.'), 'proof summary should include the supervising assessment summary');
  assert(patched.last_requested_advance_stage === 'author', 'advance stage should be remembered in state');
  assert(patched.discord_channel === 'parent-channel-123', 'state merge should preserve Discord parent channel');
  assert(patched.discord_thread_id === 'thread-456', 'state merge should preserve Discord thread target');
  assert(patched.discord_message_id === 'message-789', 'state merge should preserve Discord source message');
  assert(patched.auth_localStorage_json === '{"session":"local"}', 'state merge should preserve auth localStorage JSON');
  assert(patched.auth_cookies_json === '[{"name":"session","value":"cookie"}]', 'state merge should preserve auth cookies JSON');
  assert(patched.auth_headers_json === '{"Authorization":"Bearer token"}', 'state merge should preserve auth headers JSON');
  assert(patched.leave_draft === 'true', 'state merge should preserve explicit draft hold intent');
  assert(patched.capture_script.includes('typeof globalThis !== "undefined"'), 'unsafe proof-evidence global assignment should be guarded before verify');
  assert(patched.supervisor_author_packet.capture_script.includes('typeof globalThis !== "undefined"'), 'stored supervisor packet should keep the guarded capture script');
  assert(patched.expected_terminal_path === '/proof/', 'author packet should preserve expected interaction terminal path');
  assert(patched.interaction_contract.expected_terminal_path === '/proof/', 'author packet should preserve interaction contract');

  const interactionAuthorStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-interaction-author-')), 'state.json');
  writeJson(interactionAuthorStatePath, {
    ...makeLoopState(),
    verification_mode: 'interaction',
    server_path: '/',
    expected_start_path: '/',
    recon_results: {
      ...makeLoopState().recon_results,
      baselines: { before: { path: '/', url: 'https://cdn.example.com/before-home.png' } },
    },
  });
  const interactionPatched = core.mergeStateFromParams(interactionAuthorStatePath, {
    action: 'author',
    author_packet_json: JSON.stringify({
      proof_plan: 'Start at /, click Proof, and verify the terminal /proof/ route.',
      capture_script: "await saveScreenshot('after-proof');",
      refined_inputs: { server_path: '/proof/', wait_for_selector: '', expected_terminal_path: '/proof/' },
      interaction_contract: { start_path: '/', expected_terminal_path: '/proof/' },
      rationale: ['The terminal route differs from the start route.'],
      confidence: 'high',
      summary: 'Supervisor packet',
    }),
  });
  assert(interactionPatched.server_path === '/', 'interaction author packet should keep the recon start route as server_path');
  assert(interactionPatched.expected_start_path === '/', 'interaction author packet should persist expected_start_path');
  assert(interactionPatched.expected_terminal_path === '/proof/', 'interaction author packet should still preserve terminal path');
  assert(interactionPatched.author_warnings?.some((warning) => warning.includes('terminal interaction route')), 'interaction route correction should be recorded');

  core.ensureStageLoopState(patched);
  patched.verify_status = 'evidence_captured';
  patched.verify_summary = 'Verify captured usable evidence and is waiting for supervising-agent proof assessment.';
  patched.proof_assessment = { decision: 'ready_to_ship', recommended_stage: 'ship', continue_with_stage: 'ship', escalation_target: 'agent', source: 'supervising_agent' };
  patched.proof_assessment_source = 'supervising_agent';
  patched.target_branch = 'feature/proof-report';
  patched.ship_commit = 'abc123';
  patched.ship_remote_head = 'abc123';
  patched.ci_status = 'no_checks';
  patched.marked_ready = true;
  patched.left_draft = false;
  patched.proof_comment_url = 'https://github.com/openclaw/openclaw-plugins/pull/1#issuecomment-1';
  patched.ship_report = { pr_branch: 'feature/proof-report', shipped_commit: 'abc123' };
  patched.verify_decision_request = { status: 'evidence_captured', next_stage_options: ['verify', 'implement', 'ship'], recommended_stage: null, continue_with_stage: null };
  core.recordStageAttempt(patched, 'verify', { status: 'checkpoint', checkpoint: 'verify_supervisor_judgment', summary: 'Captured usable evidence' });
  core.setStageDecisionRequest(patched, {
    stage: 'verify',
    checkpoint: 'verify_supervisor_judgment',
    summary: 'Inspect evidence before deciding implement vs ship.',
    nextActions: ['inspect_evidence', 'supply_proof_assessment_json'],
    advanceOptions: ['verify', 'implement', 'ship'],
    recommendedAdvanceStage: 'verify',
    continueWithStage: 'verify',
  });
  assert(patched.stage_attempts.verify.count === 1, 'stage attempt counter should increment');
  assert(patched.active_checkpoint === 'verify_supervisor_judgment', 'stage checkpoint should be persisted');
  assert(patched.stage_decision_request.continue_with_stage === 'verify', 'verify judgment checkpoints should resume through verify');

  const summary = core.summarizeState(patched);
  assert(summary.stage, 'summary should include a stage');
  assert(summary.state.proof_assessment_source === 'supervising_agent', 'summary should expose proof assessment source');
  assert(summary.state.pr_branch === 'feature/proof-report', 'summary should expose resolved PR branch');
  assert(summary.state.ship_commit === 'abc123', 'summary should expose shipped commit');
  assert(summary.state.proof_comment_url.includes('issuecomment'), 'summary should expose proof comment URL');

  const environmentIssueStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-env-')), 'state.json');
  writeJson(environmentIssueStatePath, makeLoopState());
  const environmentIssueState = core.mergeStateFromParams(environmentIssueStatePath, {
    action: 'implement',
    implementation_notes: 'npm run build failed with EROFS: read-only file system, open node_modules/.vite-temp/vite.config.mjs',
  });
  const environmentIssueSummary = core.summarizeState(environmentIssueState);
  assert(
    environmentIssueSummary.state.implementation_environment_issues[0]?.code === 'vite_temp_config_erofs',
    'summary should normalize the known Vite temp-config EROFS issue as environment status',
  );

  const missingAfterGate = core.validateShipGate({
    ...makeLoopState(),
    implementation_status: 'changes_detected',
    verify_status: 'evidence_captured',
    proof_assessment: { decision: 'ready_to_ship', source: 'supervising_agent' },
    proof_assessment_source: 'supervising_agent',
  });
  assert(missingAfterGate.ok === false, 'ship gate should reject missing after evidence');
  assert(missingAfterGate.reasons.includes('after_cdn is required before ship'), 'ship gate should explain missing after evidence');

  const structuredInteractionAfterGate = core.validateShipGate({
    ...makeLoopState(),
    verification_mode: 'interaction',
    implementation_status: 'changes_detected',
    verify_status: 'evidence_captured',
    proof_assessment: { decision: 'ready_to_ship', source: 'supervising_agent' },
    proof_assessment_source: 'supervising_agent',
    evidence_bundle: {
      verification_mode: 'interaction',
      expected_path: '/proof',
      artifact_contract: {
        verification_mode: 'interaction',
        required: {
          baseline_context: true,
          route_semantics: true,
          screenshot: false,
          proof_evidence: false,
          visual_delta: false,
        },
      },
      after: {
        observation: { valid: true, telemetry_ready: true, reason: 'ok' },
        supporting_artifacts: {
          has_structured_payload: true,
          proof_evidence_present: true,
        },
        proof_evidence: {
          version: 'riddle-proof.interaction.v1',
          terminal: { href: 'https://riddledc.com/proof/', pathname: '/proof/' },
          assertions: [{ name: 'terminal URL matched expected proof route', pass: true }],
        },
        visual_delta: { status: 'not_applicable', passed: null },
      },
      proof_evidence: {
        version: 'riddle-proof.interaction.v1',
        terminal: { href: 'https://riddledc.com/proof/', pathname: '/proof/' },
      },
    },
  });
  assert(structuredInteractionAfterGate.ok === true, 'ship gate should accept valid structured interaction evidence without an after screenshot');

  const missingInteractionEvidenceGate = core.validateShipGate({
    ...makeLoopState(),
    verification_mode: 'interaction',
    implementation_status: 'changes_detected',
    verify_status: 'evidence_captured',
    after_cdn: 'https://cdn.example.com/after-proof.png',
    proof_assessment: { decision: 'ready_to_ship', source: 'supervising_agent' },
    proof_assessment_source: 'supervising_agent',
    evidence_bundle: {
      verification_mode: 'interaction',
      after: {
        observation: { valid: true, telemetry_ready: true, reason: 'screenshot only' },
        supporting_artifacts: {
          has_structured_payload: false,
          proof_evidence_present: false,
        },
      },
    },
  });
  assert(missingInteractionEvidenceGate.ok === false, 'interaction ship gate should reject screenshot-only evidence');
  assert(
    missingInteractionEvidenceGate.reasons.some((reason) => reason.includes('proof_evidence_present=false')),
    'interaction ship gate should explain missing structured proof evidence',
  );

  const visualUnmeasuredGate = core.validateShipGate({
    ...makeLoopState(),
    verification_mode: 'visual',
    implementation_status: 'changes_detected',
    verify_status: 'evidence_captured',
    after_cdn: 'https://cdn.example.com/after.png',
    proof_assessment: { decision: 'ready_to_ship', source: 'supervising_agent' },
    proof_assessment_source: 'supervising_agent',
    evidence_bundle: {
      verification_mode: 'visual',
      artifact_contract: { required: { visual_delta: true } },
      after: {
        visual_delta: {
          status: 'unmeasured',
          passed: null,
          reason: 'No measured before/after visual delta was found in proof evidence.',
        },
      },
    },
  });
  assert(visualUnmeasuredGate.ok === false, 'ship gate should reject unmeasured visual delta for visual proof');
  assert(
    visualUnmeasuredGate.reasons.some((reason) => reason.includes('visual_delta.status=unmeasured')),
    'ship gate should explain unmeasured visual delta',
  );

  const visualMeasuredGate = core.validateShipGate({
    ...makeLoopState(),
    verification_mode: 'visual',
    implementation_status: 'changes_detected',
    verify_status: 'evidence_captured',
    after_cdn: 'https://cdn.example.com/after.png',
    proof_assessment: { decision: 'ready_to_ship', source: 'supervising_agent' },
    proof_assessment_source: 'supervising_agent',
    evidence_bundle: {
      verification_mode: 'visual',
      artifact_contract: { required: { visual_delta: true } },
      after: {
        visual_delta: {
          status: 'measured',
          passed: true,
          change_percent: 2.5,
        },
      },
    },
  });
  assert(visualMeasuredGate.ok === true, 'ship gate should allow a measured passing visual delta');

  const visualAssessmentStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-visual-assessment-')), 'state.json');
  writeJson(visualAssessmentStatePath, {
    ...makeLoopState(),
    verification_mode: 'visual',
    verify_status: 'evidence_captured',
    after_cdn: 'https://cdn.example.com/after.png',
    evidence_bundle: {
      verification_mode: 'visual',
      artifact_contract: { required: { visual_delta: true } },
      after: { visual_delta: { status: 'unmeasured', passed: null } },
    },
  });
  const blockedVisualAssessment = core.mergeStateFromParams(visualAssessmentStatePath, {
    action: 'verify',
    proof_assessment_json: JSON.stringify({
      decision: 'ready_to_ship',
      summary: 'Screenshots look acceptable.',
      recommended_stage: 'ship',
      continue_with_stage: 'ship',
      source: 'supervising_agent',
    }),
  });
  assert(blockedVisualAssessment.proof_assessment.decision === 'revise_capture', 'unmeasured visual proof should route back to evidence/comparison recovery');
  assert(blockedVisualAssessment.proof_assessment.blocked_decision === 'ready_to_ship', 'blocked visual proof should retain attempted ready decision');
  assert(blockedVisualAssessment.proof_assessment.evidence_collection_incomplete === true, 'blocked visual proof should mark evidence collection incomplete');
  assert(blockedVisualAssessment.proof_assessment.recovery_stage === 'verify', 'blocked visual proof should keep the same run in verify recovery');
  assert(blockedVisualAssessment.proof_assessment.evidence_issue_code === 'visual_delta_unmeasured', 'core recovery metadata should name the evidence issue code');
  assert(blockedVisualAssessment.proof_assessment.visual_delta.status === 'unmeasured', 'core recovery metadata should include visual delta details');
  assert(typeof blockedVisualAssessment.proof_assessment.suggested_repair === 'string' && blockedVisualAssessment.proof_assessment.suggested_repair.includes('evidence/comparison recovery'), 'core recovery metadata should include suggested repair');
  assert(blockedVisualAssessment.proof_assessment.recommended_stage === 'verify', 'blocked visual proof should not advance to ship');
  assert(blockedVisualAssessment.proof_assessment.continue_with_stage === 'verify', 'blocked visual proof should continue evidence recovery in verify');
  assert(blockedVisualAssessment.merge_recommendation === 'do-not-merge', 'blocked visual proof should not become merge-ready');
  assert(blockedVisualAssessment.proof_summary.includes('Ready-to-ship assessment routed to evidence recovery'), 'blocked visual proof should be recorded in proof summary');

  const fakeLobsterRoot = installFakeLobster();
  const originalPath = process.env.PATH;
  const originalLobsterCommand = process.env.RIDDLE_PROOF_LOBSTER_COMMAND;
  const originalLobsterScript = process.env.RIDDLE_PROOF_LOBSTER_SCRIPT;
  process.env.PATH = `${path.join(fakeLobsterRoot, 'bin')}:${originalPath}`;
  process.env.RIDDLE_PROOF_LOBSTER_COMMAND = process.execPath;
  process.env.RIDDLE_PROOF_LOBSTER_SCRIPT = path.join(fakeLobsterRoot, 'bin', 'lobster');

  const auditSetupStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-audit-setup-')), 'state.json');
  const localEngine = engineMod.createRiddleProofEngine({ riddleProofDir: fakeSkillDir, defaultReviewer: 'octocat' });
  const auditSetup = await localEngine.execute({
    action: 'setup',
    state_path: auditSetupStatePath,
    repo: 'openclaw/openclaw-plugins',
    branch: 'agent/openclaw/audit-setup',
    change_request: 'Audit the deployed site without implementation',
    mode: 'audit',
    implementation_mode: 'none',
    require_diff: false,
    allow_code_changes: false,
  });
  assert(auditSetup.ok === true, 'audit/no-diff setup should complete through the runtime');
  const auditSetupState = readJson(auditSetupStatePath);
  assert(auditSetupState.implementation_mode === 'none', 'audit/no-diff setup should deliver implementation_mode to the runtime');
  assert(auditSetupState.require_diff === false, 'audit/no-diff setup should deliver require_diff=false to the runtime');
  assert(auditSetupState.allow_code_changes === false, 'audit/no-diff setup should deliver allow_code_changes=false to the runtime');

  const explicitAuditStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-explicit-audit-recon-')), 'state.json');
  writeJson(explicitAuditStatePath, {
    workspace_ready: true,
    stage: 'setup',
    repo: 'openclaw/openclaw-plugins',
    branch: 'agent/openclaw/explicit-audit',
    mode: 'static',
    reference: 'before',
    change_request: 'Audit a route-changing interaction without code edits',
    commit_message: 'Audit a route-changing interaction without code edits',
    implementation_mode: 'none',
    require_diff: false,
    allow_code_changes: false,
    implementation_status: 'not_required',
    author_status: 'ready',
    proof_plan_status: 'ready',
    proof_plan: 'Use the supplied capture script to verify the interaction.',
    capture_script: "await saveScreenshot('after-proof');",
    recon_status: '',
    recon_results: {},
    server_path: '/good',
    before_cdn: '',
    after_cdn: '',
    prod_cdn: '',
  });
  const explicitAuditResult = await localEngine.execute({
    action: 'run',
    state_path: explicitAuditStatePath,
    implementation_mode: 'none',
    require_diff: false,
    allow_code_changes: false,
  });
  assert(
    explicitAuditResult.checkpoint === 'verify_supervisor_judgment',
    `explicit audit proof packet should auto-accept captured recon and reach verify, got ${explicitAuditResult.checkpoint}: ${explicitAuditResult.summary || ''}`,
  );
  const explicitAuditState = readJson(explicitAuditStatePath);
  assert(explicitAuditState.recon_status === 'ready_for_proof_plan', 'explicit audit recon should be marked ready without an agent recon assessment');
  assert(explicitAuditState.before_cdn === 'https://cdn.example.com/before.png', 'explicit audit recon should promote the captured baseline');
  assert(explicitAuditState.stage_attempts.recon.history.some((attempt) => attempt.checkpoint === 'recon_auto_accept_explicit_capture'), 'explicit audit recon should record the auto-accept boundary');
  assert(explicitAuditState.verify_status === 'evidence_captured', 'explicit audit should continue into verify after recon auto-accept');

  const captureOnlyAuditStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-capture-only-audit-recon-')), 'state.json');
  writeJson(captureOnlyAuditStatePath, {
    workspace_ready: true,
    stage: 'setup',
    repo: 'openclaw/openclaw-plugins',
    branch: 'agent/openclaw/capture-only-audit',
    mode: 'static',
    reference: 'before',
    change_request: 'Audit a supplied capture script without code edits',
    commit_message: 'Audit a supplied capture script without code edits',
    implementation_mode: 'none',
    require_diff: false,
    allow_code_changes: false,
    implementation_status: 'not_required',
    author_status: 'pending_recon',
    proof_plan_status: 'pending_recon',
    capture_script: "await saveScreenshot('after-proof');",
    recon_status: '',
    recon_results: {},
    server_path: '/good',
    before_cdn: '',
    after_cdn: '',
    prod_cdn: '',
  });
  const captureOnlyAuditResult = await localEngine.execute({
    action: 'run',
    state_path: captureOnlyAuditStatePath,
    implementation_mode: 'none',
    require_diff: false,
    allow_code_changes: false,
  });
  assert(
    captureOnlyAuditResult.checkpoint === 'author_supervisor_judgment',
    `capture-only audit should auto-accept recon then request proof-plan authoring, got ${captureOnlyAuditResult.checkpoint}: ${captureOnlyAuditResult.summary || ''}`,
  );
  const captureOnlyAuditState = readJson(captureOnlyAuditStatePath);
  assert(captureOnlyAuditState.recon_status === 'ready_for_proof_plan', 'capture-only audit recon should be marked ready without an agent recon assessment');
  assert(captureOnlyAuditState.stage_attempts.recon.history.some((attempt) => attempt.checkpoint === 'recon_auto_accept_explicit_capture'), 'capture-only audit recon should record the auto-accept boundary');
  assert(captureOnlyAuditState.active_checkpoint === 'author_supervisor_judgment', 'capture-only audit should still require proof-plan authoring');

  const reconLoopStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-recon-')), 'state.json');
  writeJson(reconLoopStatePath, {
    workspace_ready: true,
    stage: 'setup',
    repo: 'openclaw/openclaw-plugins',
    branch: 'agent/openclaw/recon-loop',
    mode: 'static',
    reference: 'before',
    change_request: 'Find the right route',
    commit_message: 'Find the right route',
    proof_plan_status: 'pending_recon',
    capture_script: '',
    recon_status: '',
    recon_results: {},
    implementation_status: 'pending_recon',
    server_path: '/wrong',
    before_cdn: '',
    after_cdn: '',
    prod_cdn: '',
  });
  const reconConfig = core.resolveConfig({ riddleProofDir: fakeSkillDir, statePath: reconLoopStatePath, defaultReviewer: 'octocat' }, { action: 'run', state_path: reconLoopStatePath });
  assert(localEngine.resolveConfig({ action: 'run', state_path: reconLoopStatePath }).statePath === reconConfig.statePath, 'local engine should resolve the same state path as the wrapper config');
  const reconBlocked = await localEngine.execute({ action: 'run', state_path: reconLoopStatePath });
  assert(
    reconBlocked.checkpoint === 'recon_supervisor_judgment',
    `run should bubble recon observations to the supervising agent before marching onward (got ${reconBlocked.checkpoint}: ${reconBlocked.summary || ''}; error=${reconBlocked.error || ''}; ${JSON.stringify(reconBlocked.details || reconBlocked.raw || {}, null, 2)})`,
  );
  assert(reconBlocked.checkpointContract.version === 'riddle-proof-run.checkpoint.v1', 'checkpoints should expose a stable machine-readable contract');
  assert(reconBlocked.decisionRequest.checkpoint_contract.checkpoint === 'recon_supervisor_judgment', 'checkpoint contract should persist in the decision request');
  assert(reconBlocked.checkpointContract.accepted_inputs.some((input) => input.name === 'recon_assessment_json'), 'recon checkpoint contract should name recon_assessment_json as an input');
  const reconBlockedState = readJson(reconLoopStatePath);
  assert(reconBlockedState.stage_attempts.recon.count === 1, 'recon checkpoint should count as a stage attempt');
  assert(reconBlockedState.recon_status === 'needs_supervisor_judgment', 'recon should wait for supervising-agent judgment');
  assert(Array.isArray(reconBlockedState.runtime_events), 'workflow runs should record runtime observability events');
  assert(reconBlockedState.runtime_events.some((event) => event.kind === 'workflow.step.started' && event.step === 'recon'), 'runtime events should record the active workflow step');
  assert(typeof reconBlocked.executed[0].duration_ms === 'number', 'executed steps should include duration_ms');

  const reconRetried = await localEngine.execute({
    action: 'run',
    state_path: reconLoopStatePath,
    continue_from_checkpoint: true,
    recon_assessment_json: JSON.stringify({
      decision: 'retry_recon',
      summary: 'Try the /good route next.',
      baseline_understanding: baselineUnderstanding({
        target_route: '/wrong',
        before_evidence_url: '',
        visible_before_state: 'The current capture did not reach the requested route.',
        proof_focus: 'Retry recon before proof authoring.',
        stop_condition: 'A later before capture reaches the requested route.',
        quality_risks: ['wrong route'],
      }),
      continue_with_stage: 'recon',
      escalation_target: 'agent',
      refined_inputs: { server_path: '/good' },
      reasons: ['The current route is wrong.'],
    }),
  });
  assert(reconRetried.checkpoint === 'recon_supervisor_judgment', 'retrying recon should stay inside the recon supervisor loop');
  const afterReconRetry = readJson(reconLoopStatePath);
  assert(afterReconRetry.stage_attempts.recon.count === 2, 'a recon retry should increment the recon attempt counter');
  assert(afterReconRetry.recon_results.attempt_history.length === 2, 'recon retry should append a second attempt');

  const authorRequest = await localEngine.execute({
    action: 'run',
    state_path: reconLoopStatePath,
    continue_from_checkpoint: true,
    recon_assessment_json: JSON.stringify({
      decision: 'ready_for_author',
      summary: 'The latest baseline is trustworthy enough to anchor verify.',
      baseline_understanding: baselineUnderstanding(),
      continue_with_stage: 'author',
      escalation_target: 'agent',
      refined_inputs: { server_path: '/good', wait_for_selector: '.cta' },
      reasons: ['The second recon attempt captured the right route.'],
    }),
  });
  assert(authorRequest.checkpoint === 'author_supervisor_judgment', 'approving recon should let the wrapper continue directly into supervising-agent proof authoring');
  const afterReconApproval = readJson(reconLoopStatePath);
  assert(afterReconApproval.recon_status === 'ready_for_proof_plan', 'supervising-agent recon approval should mark recon ready for proof authoring');
  assert(afterReconApproval.before_cdn === 'https://cdn.example.com/before.png', 'approved recon should promote the trusted before baseline into state');

  const authored = await localEngine.execute({
    action: 'run',
    state_path: reconLoopStatePath,
    continue_from_checkpoint: true,
    author_packet_json: JSON.stringify({
      proof_plan: 'Use the recon-confirmed route and capture the fixed state.',
      capture_script: "await saveScreenshot('after-proof');",
      baseline_understanding_used: baselineUnderstanding(),
      refined_inputs: { server_path: '/good', wait_for_selector: '.cta' },
      rationale: ['Recon already confirmed the route.'],
      confidence: 'high',
      summary: 'Supervisor authored packet',
    }),
  });
  assert(authored.checkpoint === 'implement_review', 'supplying the supervisor proof packet should let the wrapper continue into implement review');
  const afterAuthored = readJson(reconLoopStatePath);
  assert(afterAuthored.stage_attempts.author.count === 2, 'author request plus author application should both be recorded');
  assert(afterAuthored.author_mode === 'supervising_agent', 'author mode should record supervising_agent ownership');

  const passiveInteractionAuthorStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-passive-interaction-author-')), 'state.json');
  writeJson(passiveInteractionAuthorStatePath, {
    ...makeLoopState(),
    branch: 'agent/openclaw/passive-interaction-author',
    verification_mode: 'interaction',
    implementation_mode: 'none',
    require_diff: false,
    allow_code_changes: false,
    implementation_status: 'not_required',
    author_status: 'needs_supervisor_judgment',
    proof_plan_status: 'needs_supervisor_judgment',
    active_checkpoint: 'author_supervisor_judgment',
    active_checkpoint_stage: 'author',
  });
  core.mergeStateFromParams(passiveInteractionAuthorStatePath, {
    action: 'run',
    author_packet_json: JSON.stringify({
      proof_plan: 'Click the Proof nav link and verify the terminal route.',
      capture_script: 'await page.waitForTimeout(1500);',
      refined_inputs: { server_path: '/', expected_terminal_path: '/proof/' },
      summary: 'Passive interaction packet',
    }),
  });
  const passiveInteractionAuthorState = readJson(passiveInteractionAuthorStatePath);
  assert(
    passiveInteractionAuthorState.author_warnings.some((warning) => warning.includes('appears passive')),
    'passive interaction capture script should be recorded as an author warning',
  );
  assert(
    passiveInteractionAuthorState.structured_interaction_capture_failure_summary.includes('appears passive'),
    'passive interaction capture script should create a structured interaction capture blocker',
  );

  const auditNoDiffStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-audit-no-diff-')), 'state.json');
  writeJson(auditNoDiffStatePath, {
    ...makeLoopState(),
    branch: 'agent/openclaw/audit-no-diff',
    implementation_mode: 'none',
    require_diff: false,
    allow_code_changes: false,
    implementation_status: 'pending_recon',
    author_status: 'needs_supervisor_judgment',
    proof_plan_status: 'needs_supervisor_judgment',
    active_checkpoint: 'author_supervisor_judgment',
    active_checkpoint_stage: 'author',
    stage_decision_request: {
      stage: 'author',
      checkpoint: 'author_supervisor_judgment',
      recommended_advance_stage: 'author',
      continue_with_stage: 'author',
    },
  });
  const auditNoDiffAuthored = await localEngine.execute({
    action: 'run',
    state_path: auditNoDiffStatePath,
    continue_from_checkpoint: true,
    implementation_mode: 'none',
    require_diff: false,
    allow_code_changes: false,
    author_packet_json: JSON.stringify({
      proof_plan: 'Audit the existing deployed state without implementation.',
      capture_script: "await saveScreenshot('audit-proof');",
      baseline_understanding_used: baselineUnderstanding(),
      refined_inputs: { server_path: '/good', wait_for_selector: '.cta' },
      rationale: ['This is an audit/profile run, not a proof-of-change run.'],
      confidence: 'high',
      summary: 'Audit packet',
    }),
  });
  assert(auditNoDiffAuthored.checkpoint === 'verify_supervisor_judgment', `audit/no-diff authoring should continue directly to verify (got ${auditNoDiffAuthored.checkpoint})`);
  const auditNoDiffState = readJson(auditNoDiffStatePath);
  assert(auditNoDiffState.implementation_status === 'not_required', 'audit/no-diff verify should mark implementation as not required');
  assert(auditNoDiffState.stage_attempts.implement.last_checkpoint === 'implementation_not_required', 'audit/no-diff mode should record a skipped implementation checkpoint');

  const checkpointHarnessDir = mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-checkpoint-harness-'));
  const checkpointHarnessStatePath = path.join(checkpointHarnessDir, 'wrapper-state.json');
  const checkpointEngineStatePath = path.join(checkpointHarnessDir, 'engine-state.json');
  writeJson(checkpointEngineStatePath, {
    repo: 'riddledc/example',
    branch: 'agent/checkpoint-protocol',
    change_request: 'Exercise checkpoint protocol.',
    verification_mode: 'visual',
    author_request: {
      status: 'needs_supervisor_judgment',
      fallback_defaults: {
        proof_plan: 'Capture the requested visual state.',
        capture_script: "await saveScreenshot('after-proof');",
      },
    },
    recon_results: {
      baselines: {
        before: { url: 'https://cdn.example.com/checkpoint-before.png', path: '/checkpoint' },
      },
    },
    before_cdn: 'https://cdn.example.com/checkpoint-before.png',
  });
  const checkpointEngineCalls = [];
  const checkpointEngine = {
    async execute(params) {
      checkpointEngineCalls.push(params);
      if (params.author_packet_json) {
        const packet = JSON.parse(params.author_packet_json);
        assert(packet.proof_plan.includes('checkpoint packet'), 'resume should pass the authored proof packet into the engine');
        return {
          ok: true,
          state_path: checkpointEngineStatePath,
          checkpoint: 'verify_ship_ready',
          summary: 'Checkpoint proof is ready.',
          shipGate: { ok: true },
        };
      }
      return {
        ok: true,
        state_path: checkpointEngineStatePath,
        checkpoint: 'author_supervisor_judgment',
        summary: 'Awaiting author packet.',
      };
    },
  };
  const yieldedCheckpoint = await harnessMod.runRiddleProofEngineHarness({
    request: {
      repo: 'riddledc/example',
      change_request: 'Exercise checkpoint protocol.',
      engine_state_path: checkpointEngineStatePath,
      harness_state_path: checkpointHarnessStatePath,
      ship_mode: 'none',
    },
    state_path: checkpointHarnessStatePath,
    engine: checkpointEngine,
    checkpoint_mode: 'yield',
    checkpoint_visibility: 'manual',
    config: { defaultShipMode: 'none' },
  });
  assert(yieldedCheckpoint.status === 'awaiting_checkpoint', 'yield mode should return awaiting_checkpoint for author checkpoints');
  assert(yieldedCheckpoint.checkpoint_packet?.version === 'riddle-proof.checkpoint.v1', 'yielded result should include a checkpoint packet');
  assert(yieldedCheckpoint.checkpoint_packet.kind === 'author_proof', 'yielded packet should identify author proof work');
  assert(yieldedCheckpoint.checkpoint_packet.routing_hint.visibility === 'manual', 'checkpoint visibility should be preserved');
  assert(yieldedCheckpoint.checkpoint_packet.allowed_decisions.includes('author_packet'), 'author packet should be an allowed decision');
  const storedCheckpointState = readJson(checkpointHarnessStatePath);
  assert(storedCheckpointState.status === 'awaiting_checkpoint', 'wrapper state should persist awaiting_checkpoint');
  assert(storedCheckpointState.checkpoint_packet.resume_token === yieldedCheckpoint.checkpoint_packet.resume_token, 'wrapper state should persist the same resume token');
  assert(storedCheckpointState.checkpoint_summary.pending === true, 'wrapper state should persist compact checkpoint summary');
  assert(storedCheckpointState.checkpoint_summary.latest_resume_token === yieldedCheckpoint.checkpoint_packet.resume_token, 'checkpoint summary should expose latest resume token');
  assert(storedCheckpointState.state_paths.wrapper_state_path === checkpointHarnessStatePath, 'wrapper state path should be labeled explicitly');
  assert(storedCheckpointState.state_paths.engine_state_path === checkpointEngineStatePath, 'engine state path should be labeled explicitly');
  assert(storedCheckpointState.checkpoint_history.length === 1, 'wrapper state should record checkpoint packet history');

  const authoredCheckpointResponse = {
    version: 'riddle-proof.checkpoint_response.v1',
    run_id: yieldedCheckpoint.run_id,
    checkpoint: yieldedCheckpoint.checkpoint_packet.checkpoint,
    resume_token: yieldedCheckpoint.checkpoint_packet.resume_token,
    decision: 'author_packet',
    summary: 'Authored a deterministic checkpoint packet.',
    payload: {
      proof_plan: 'Use the checkpoint packet proof plan.',
      capture_script: "await saveScreenshot('after-proof');",
      artifact_contract: { required: { screenshot: true, playability: true } },
      stop_condition: 'The after screenshot and playability evidence satisfy the request.',
      verdict_dimensions: { visual: 'match target', interaction: 'playable' },
    },
    created_at: '2026-05-07T00:00:00.000Z',
  };
  const resumedCheckpoint = await harnessMod.runRiddleProofEngineHarness({
    request: {
      repo: 'riddledc/example',
      change_request: 'Exercise checkpoint protocol.',
      engine_state_path: checkpointEngineStatePath,
      harness_state_path: checkpointHarnessStatePath,
      ship_mode: 'none',
    },
    state_path: checkpointHarnessStatePath,
    engine: checkpointEngine,
    checkpoint_response: authoredCheckpointResponse,
    checkpoint_mode: 'yield',
    checkpoint_visibility: 'manual',
    config: { defaultShipMode: 'none' },
  });
  assert(resumedCheckpoint.status === 'ready_to_ship', 'checkpoint response should resume through verify_ship_ready');
  assert(checkpointEngineCalls.some((call) => call.author_packet_json), 'engine should receive author_packet_json after checkpoint response');
  assert(checkpointEngineCalls.some((call) => call.author_packet_json && call.advance_stage === 'author'), 'author checkpoint responses should resume through the author stage even when the stale checkpoint continuation points elsewhere');
  const resumedCheckpointState = readJson(checkpointHarnessStatePath);
  assert(!resumedCheckpointState.checkpoint_packet, 'checkpoint packet should clear after accepted response');
  assert(resumedCheckpointState.checkpoint_summary.pending === false, 'checkpoint summary should clear pending after accepted response');
  assert(resumedCheckpointState.checkpoint_summary.latest_decision === 'author_packet', 'checkpoint summary should expose accepted decision');
  assert(resumedCheckpointState.checkpoint_summary.token_matches === true, 'checkpoint summary should report matching token');
  assert(resumedCheckpointState.proof_contract.proof_plan === 'Use the checkpoint packet proof plan.', 'accepted author packet should persist proof plan');
  assert(resumedCheckpointState.proof_contract.artifact_contract.required.playability === true, 'accepted author packet should persist artifact contract');
  assert(resumedCheckpointState.checkpoint_history.length === 2, 'wrapper state should record both packet and response');

  const auditCompleteHarnessStatePath = path.join(checkpointHarnessDir, 'audit-complete-wrapper-state.json');
  const auditComplete = await harnessMod.runRiddleProofEngineHarness({
    request: {
      repo: 'riddledc/example',
      change_request: 'Audit the deployed site without changes.',
      engine_state_path: checkpointEngineStatePath,
      harness_state_path: auditCompleteHarnessStatePath,
      implementation_mode: 'none',
      require_diff: false,
      allow_code_changes: false,
      ship_mode: 'none',
    },
    state_path: auditCompleteHarnessStatePath,
    engine: {
      async execute() {
        return {
          ok: true,
          state_path: checkpointEngineStatePath,
          checkpoint: 'verify_audit_complete',
          summary: 'Audit proof is complete and no ship action is required.',
          checkpointContract: {
            checkpoint: 'verify_audit_complete',
            stage: 'verify',
            blocking: false,
          },
        };
      },
    },
    config: { defaultShipMode: 'none' },
  });
  assert(auditComplete.status === 'completed', 'verify_audit_complete should be a terminal completed audit, not an unhandled blocker');
  assert(!auditComplete.blocker, 'verify_audit_complete should not create a wrapper blocker');
  assert(auditComplete.raw.audit_complete === true, 'audit completion should be labeled in terminal metadata');

  const duplicateCheckpointResponse = await harnessMod.runRiddleProofEngineHarness({
    request: {
      repo: 'riddledc/example',
      change_request: 'Exercise checkpoint protocol.',
      engine_state_path: checkpointEngineStatePath,
      harness_state_path: checkpointHarnessStatePath,
      ship_mode: 'none',
    },
    state_path: checkpointHarnessStatePath,
    engine: checkpointEngine,
    checkpoint_response: authoredCheckpointResponse,
    checkpoint_mode: 'yield',
    checkpoint_visibility: 'manual',
    config: { defaultShipMode: 'none' },
  });
  assert(duplicateCheckpointResponse.status === 'blocked', 'duplicate checkpoint response should be deterministic, not silently rerun');
  assert(duplicateCheckpointResponse.blocker.code === 'checkpoint_response_duplicate', 'duplicate checkpoint response should get a distinct blocker');

  const recoveryHarnessDir = mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-recovery-harness-'));
  const recoveryHarnessStatePath = path.join(recoveryHarnessDir, 'wrapper-state.json');
  const recoveryEngineStatePath = path.join(recoveryHarnessDir, 'engine-state.json');
  writeJson(recoveryEngineStatePath, {
    repo: 'riddledc/example',
    branch: 'agent/recovery-routing',
    change_request: 'Route recoverable ship blockers.',
    reference: 'before',
    before_cdn: '',
    after_cdn: 'https://cdn.example.com/after.png',
  });
  const recoveryEngineCalls = [];
  const recoveryEngine = {
    async execute(params) {
      recoveryEngineCalls.push(params);
      if (params.advance_stage === 'recon') {
        return {
          ok: true,
          state_path: recoveryEngineStatePath,
          checkpoint: 'verify_ship_ready',
          summary: 'Recovery recon repaired the missing baseline.',
          shipGate: { ok: true },
        };
      }
      return {
        ok: false,
        state_path: recoveryEngineStatePath,
        checkpoint: 'ship_gate_blocked',
        stage: 'verify',
        summary: 'Ship gate is missing the before baseline.',
        shipGate: { ok: false, reasons: ['before_cdn is required before ship'] },
        checkpointContract: {
          resume: {
            action: 'run',
            state_path: recoveryEngineStatePath,
            continue_from_checkpoint: true,
            continue_with_stage: 'recon',
          },
          ship_gate: { ok: false, reasons: ['before_cdn is required before ship'] },
        },
      };
    },
  };
  const recoveredShipGate = await harnessMod.runRiddleProofEngineHarness({
    request: {
      repo: 'riddledc/example',
      change_request: 'Route recoverable ship blockers.',
      engine_state_path: recoveryEngineStatePath,
      harness_state_path: recoveryHarnessStatePath,
      ship_mode: 'none',
    },
    state_path: recoveryHarnessStatePath,
    engine: recoveryEngine,
    max_iterations: 4,
    config: { defaultShipMode: 'none' },
  });
  assert(recoveredShipGate.status === 'ready_to_ship', 'recoverable ship gate blockers should route to their contract recovery stage');
  assert(recoveryEngineCalls.some((call) => call.advance_stage === 'recon'), 'ship gate recovery should advance back to recon when the baseline is missing');
  const recoveredShipGateState = readJson(recoveryHarnessStatePath);
  assert(
    recoveredShipGateState.events.some((event) => event.kind === 'checkpoint.recovery_continuation' && event.details?.next?.advance_stage === 'recon'),
    'wrapper state should record automatic checkpoint recovery continuation',
  );

  const implementationRetryDir = mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-implementation-retry-'));
  const implementationWorkdir = path.join(implementationRetryDir, 'repo');
  mkdirSync(implementationWorkdir, { recursive: true });
  execFileSync('git', ['init'], { cwd: implementationWorkdir, stdio: 'ignore' });
  const implementationRetryHarnessStatePath = path.join(implementationRetryDir, 'wrapper-state.json');
  const implementationRetryEngineStatePath = path.join(implementationRetryDir, 'engine-state.json');
  writeJson(implementationRetryEngineStatePath, {
    repo: 'riddledc/example',
    branch: 'agent/implementation-retry',
    change_request: 'Retry implementation until a diff exists.',
    after_worktree: implementationWorkdir,
    implementation_status: 'changes_missing',
  });
  const implementationRetryEngineCalls = [];
  const implementationRetryEngine = {
    async execute(params) {
      implementationRetryEngineCalls.push(params);
      if (implementationRetryEngineCalls.length >= 3) {
        return {
          ok: true,
          state_path: implementationRetryEngineStatePath,
          checkpoint: 'verify_ship_ready',
          summary: 'Implementation retry produced a diff and proof is ready.',
          shipGate: { ok: true },
        };
      }
      return {
        ok: true,
        state_path: implementationRetryEngineStatePath,
        checkpoint: 'implement_changes_missing',
        summary: 'No implementation diff exists yet.',
      };
    },
  };
  let implementationAgentAttempts = 0;
  const implementationRetryAgent = {
    assessRecon: async () => ({ ok: false, blocker: { code: 'unexpected_recon', message: 'unexpected recon' } }),
    authorProofPacket: async () => ({ ok: false, blocker: { code: 'unexpected_author', message: 'unexpected author' } }),
    assessProof: async () => ({ ok: false, blocker: { code: 'unexpected_verify', message: 'unexpected verify' } }),
    async implementChange() {
      implementationAgentAttempts += 1;
      if (implementationAgentAttempts === 1) {
        return { ok: true, summary: 'First implementation attempt left no diff.' };
      }
      writeFileSync(path.join(implementationWorkdir, 'changed.txt'), 'changed\n');
      return {
        ok: true,
        summary: 'Second implementation attempt wrote a diff.',
        changedFiles: ['changed.txt'],
      };
    },
  };
  const implementationRetried = await harnessMod.runRiddleProofEngineHarness({
    request: {
      repo: 'riddledc/example',
      change_request: 'Retry implementation until a diff exists.',
      engine_state_path: implementationRetryEngineStatePath,
      harness_state_path: implementationRetryHarnessStatePath,
      ship_mode: 'none',
    },
    state_path: implementationRetryHarnessStatePath,
    engine: implementationRetryEngine,
    agent: implementationRetryAgent,
    max_iterations: 5,
    config: { defaultShipMode: 'none' },
  });
  assert(implementationRetried.status === 'ready_to_ship', 'implementation no-diff should retry instead of terminally blocking');
  assert(implementationAgentAttempts === 2, 'implementation agent should be called again after a no-diff attempt');
  const implementationRetryState = readJson(implementationRetryHarnessStatePath);
  assert(implementationRetryState.events.some((event) => event.kind === 'agent.implementation.no_diff'), 'no-diff implementation attempt should be recorded');
  assert(implementationRetryState.events.some((event) => event.kind === 'agent.implementation.retry_requested'), 'implementation retry request should be recorded');

  const blockedDuplicateHarnessStatePath = path.join(checkpointHarnessDir, 'wrapper-state-blocked-duplicate.json');
  const blockedDuplicateEngineStatePath = path.join(checkpointHarnessDir, 'engine-state-blocked-duplicate.json');
  writeJson(blockedDuplicateEngineStatePath, {
    repo: 'riddledc/example',
    branch: 'agent/checkpoint-blocked-duplicate',
    change_request: 'Exercise blocked checkpoint duplicate handling.',
    author_request: {
      status: 'needs_supervisor_judgment',
      fallback_defaults: {
        proof_plan: 'Use a blocked duplicate fixture proof plan.',
        capture_script: "await saveScreenshot('after-proof');",
      },
    },
  });
  const blockedDuplicateEngine = {
    execute: async () => ({
      ok: true,
      state_path: blockedDuplicateEngineStatePath,
      checkpoint: 'author_supervisor_judgment',
      summary: 'Yield a blocked-response duplicate checkpoint packet.',
    }),
  };
  const blockedDuplicateYield = await harnessMod.runRiddleProofEngineHarness({
    request: {
      repo: 'riddledc/example',
      change_request: 'Exercise blocked checkpoint duplicate handling.',
      engine_state_path: blockedDuplicateEngineStatePath,
      harness_state_path: blockedDuplicateHarnessStatePath,
      ship_mode: 'none',
    },
    state_path: blockedDuplicateHarnessStatePath,
    engine: blockedDuplicateEngine,
    checkpoint_mode: 'yield',
    checkpoint_visibility: 'manual',
    config: { defaultShipMode: 'none' },
  });
  const blockedDuplicateResponse = {
    version: 'riddle-proof.checkpoint_response.v1',
    run_id: blockedDuplicateYield.run_id,
    checkpoint: blockedDuplicateYield.checkpoint_packet.checkpoint,
    resume_token: blockedDuplicateYield.checkpoint_packet.resume_token,
    decision: 'blocked',
    summary: 'Stop at the author checkpoint for duplicate testing.',
    reasons: ['intentional smoke stop'],
    created_at: '2026-05-07T00:10:00.000Z',
  };
  const firstBlockedDuplicateResponse = await harnessMod.runRiddleProofEngineHarness({
    request: {
      repo: 'riddledc/example',
      change_request: 'Exercise blocked checkpoint duplicate handling.',
      engine_state_path: blockedDuplicateEngineStatePath,
      harness_state_path: blockedDuplicateHarnessStatePath,
      ship_mode: 'none',
    },
    state_path: blockedDuplicateHarnessStatePath,
    engine: blockedDuplicateEngine,
    checkpoint_response: blockedDuplicateResponse,
    checkpoint_mode: 'yield',
    checkpoint_visibility: 'manual',
    config: { defaultShipMode: 'none' },
  });
  assert(firstBlockedDuplicateResponse.blocker.code === 'checkpoint_response_blocked', 'first blocked response should retain the blocking checkpoint result');
  const afterFirstBlockedDuplicate = readJson(blockedDuplicateHarnessStatePath);
  assert(afterFirstBlockedDuplicate.checkpoint_packet, 'blocked checkpoint responses should retain the pending packet for inspection');
  assert(afterFirstBlockedDuplicate.checkpoint_summary.response_count === 1, 'first blocked response should count once');
  const secondBlockedDuplicateResponse = await harnessMod.runRiddleProofEngineHarness({
    request: {
      repo: 'riddledc/example',
      change_request: 'Exercise blocked checkpoint duplicate handling.',
      engine_state_path: blockedDuplicateEngineStatePath,
      harness_state_path: blockedDuplicateHarnessStatePath,
      ship_mode: 'none',
    },
    state_path: blockedDuplicateHarnessStatePath,
    engine: blockedDuplicateEngine,
    checkpoint_response: blockedDuplicateResponse,
    checkpoint_mode: 'yield',
    checkpoint_visibility: 'manual',
    config: { defaultShipMode: 'none' },
  });
  assert(secondBlockedDuplicateResponse.blocker.code === 'checkpoint_response_duplicate', 'duplicate blocked response should be explicit');
  assert(secondBlockedDuplicateResponse.blocker.details.duplicate === true, 'duplicate blocked response should expose duplicate=true');
  const afterSecondBlockedDuplicate = readJson(blockedDuplicateHarnessStatePath);
  assert(afterSecondBlockedDuplicate.checkpoint_summary.response_count === 1, 'duplicate blocked response should not increment accepted response_count');
  assert(afterSecondBlockedDuplicate.checkpoint_summary.duplicate_response_count === 1, 'duplicate blocked response should increment duplicate_response_count');
  assert(
    afterSecondBlockedDuplicate.events.filter((event) => event.kind === 'checkpoint.response.accepted').length === 1,
    'duplicate blocked response should not emit a second accepted response event',
  );

  const verifyAwaitingJudgment = await localEngine.execute({ action: 'run', state_path: reconLoopStatePath, continue_from_checkpoint: true });
  assert(verifyAwaitingJudgment.checkpoint === 'verify_supervisor_judgment', 'verify should stop for supervising-agent proof assessment after capturing evidence');
  assert(verifyAwaitingJudgment.checkpointContract.accepted_inputs.some((input) => input.name === 'proof_assessment_json'), 'verify checkpoint contract should name proof_assessment_json as an input');
  assert(verifyAwaitingJudgment.checkpointContract.ship_gate.ok === false, 'verify judgment contract should expose the current ship gate before proof approval');
  const afterVerifyCapture = readJson(reconLoopStatePath);
  assert(afterVerifyCapture.stage_attempts.verify.count === 1, 'verify capture should be recorded');
  assert(afterVerifyCapture.merge_recommendation === 'pending-supervisor-judgment', 'verify should wait on supervising-agent judgment before shipping');

  const failedInteractionStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-failed-interaction-')), 'state.json');
  writeJson(failedInteractionStatePath, {
    ...makeLoopState(),
    implementation_mode: 'none',
    require_diff: false,
    allow_code_changes: false,
    verification_mode: 'interaction',
    server_path: '/',
    simulate_structured_interaction_failure_summary: 'Structured interaction proof evidence captured failed assertion(s): passed, success, proofReady.',
  });
  const failedInteractionBlocked = await localEngine.execute({ action: 'run', state_path: failedInteractionStatePath, advance_stage: 'verify' });
  assert(
    failedInteractionBlocked.checkpoint === 'verify_capture_blocked',
    `failed structured interaction evidence should block at verify_capture_blocked, got ${failedInteractionBlocked.checkpoint}`,
  );
  assert(failedInteractionBlocked.blocking === true, 'failed structured interaction evidence should be a blocking checkpoint');
  assert(
    failedInteractionBlocked.summary.includes('Structured interaction proof evidence captured failed assertion'),
    'failed structured interaction blocker should preserve the concrete failed evidence summary',
  );
  const afterFailedInteraction = readJson(failedInteractionStatePath);
  assert(afterFailedInteraction.stage_attempts.verify.count === 1, 'failed structured interaction verify attempt should be recorded once');
  assert(afterFailedInteraction.merge_recommendation === 'do-not-merge', 'failed structured interaction evidence should stay do-not-merge');

  const failedCaptureInteractionStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-failed-capture-interaction-')), 'state.json');
  writeJson(failedCaptureInteractionStatePath, {
    ...makeLoopState(),
    implementation_mode: 'none',
    require_diff: false,
    allow_code_changes: false,
    verification_mode: 'interaction',
    server_path: '/',
    simulate_verify_status: 'capture_incomplete',
    simulate_structured_interaction_capture_failure_summary: 'Interaction capture failed before usable authored proof evidence was emitted. Capture script error: intentional-riddle-proof-test-thrown-error',
  });
  const failedCaptureInteractionBlocked = await localEngine.execute({ action: 'run', state_path: failedCaptureInteractionStatePath, advance_stage: 'verify' });
  assert(
    failedCaptureInteractionBlocked.checkpoint === 'verify_capture_blocked',
    `failed structured interaction capture should block at verify_capture_blocked, got ${failedCaptureInteractionBlocked.checkpoint}`,
  );
  assert(failedCaptureInteractionBlocked.blocking === true, 'failed structured interaction capture should be a blocking checkpoint');
  assert(
    failedCaptureInteractionBlocked.summary.includes('intentional-riddle-proof-test-thrown-error'),
    'failed structured interaction capture blocker should preserve the concrete capture error',
  );
  assert(
    failedCaptureInteractionBlocked.decisionRequest.continue_with_stage == null,
    'failed structured interaction capture should not continue into author retry',
  );
  const afterFailedCaptureInteraction = readJson(failedCaptureInteractionStatePath);
  assert(
    afterFailedCaptureInteraction.author_status === 'ready',
    'failed structured interaction capture should not reset authoring state for a retry',
  );
  assert(afterFailedCaptureInteraction.merge_recommendation === 'do-not-merge', 'failed structured interaction capture should stay do-not-merge');

  const nonzeroCaptureStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-nonzero-capture-blocker-')), 'state.json');
  writeJson(nonzeroCaptureStatePath, {
    ...makeLoopState(),
    implementation_mode: 'none',
    require_diff: false,
    allow_code_changes: false,
    verification_mode: 'interaction',
    server_path: '/',
    simulate_verify_status: 'capture_incomplete',
    simulate_capture_quality_blocking: true,
    simulate_capture_quality_decision: 'failed_interaction_capture',
    simulate_capture_quality_summary: 'page.waitForSelector: Timeout 30000ms exceeded waiting for locator(\'#riddle-proof-missing-selector-timeout-smoke\')',
    simulate_verify_nonzero_exit: true,
    simulate_verify_nonzero_exit_message: 'page.waitForSelector: Timeout 30000ms exceeded waiting for locator(\'#riddle-proof-missing-selector-timeout-smoke\')',
  });
  const nonzeroCaptureBlocked = await localEngine.execute({ action: 'run', state_path: nonzeroCaptureStatePath, advance_stage: 'verify' });
  assert(
    nonzeroCaptureBlocked.checkpoint === 'verify_capture_blocked',
    `nonzero verify capture failure should block at verify_capture_blocked, got ${nonzeroCaptureBlocked.checkpoint}`,
  );
  assert(nonzeroCaptureBlocked.blocking === true, 'nonzero verify capture failure should be blocking');
  assert(
    nonzeroCaptureBlocked.summary.includes('page.waitForSelector: Timeout 30000ms exceeded'),
    'nonzero verify capture blocker should preserve the exact Playwright timeout',
  );
  assert(
    nonzeroCaptureBlocked.checkpoint !== 'verify_failed',
    'nonzero verify capture failure should not surface as generic verify_failed',
  );
  const afterNonzeroCapture = readJson(nonzeroCaptureStatePath);
  assert(afterNonzeroCapture.stage_attempts.verify.count === 1, 'nonzero verify capture attempt should be recorded once');
  assert(afterNonzeroCapture.stage_decision_request.checkpoint === 'verify_capture_blocked', 'nonzero verify state should persist native capture blocked checkpoint');

  const hardBlockedCaptureStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-hard-blocked-capture-')), 'state.json');
  writeJson(hardBlockedCaptureStatePath, {
    ...makeLoopState(),
    implementation_mode: 'none',
    require_diff: false,
    allow_code_changes: false,
    verification_mode: 'interaction',
    server_path: '/',
    simulate_verify_status: 'capture_incomplete',
    simulate_proof_assessment_hard_blocker: 'locator.scrollIntoViewIfNeeded: Timeout 3000ms exceeded for selector [data-rp-missing]',
  });
  const hardBlockedCapture = await localEngine.execute({ action: 'run', state_path: hardBlockedCaptureStatePath, advance_stage: 'verify' });
  assert(
    hardBlockedCapture.checkpoint === 'verify_capture_blocked',
    `contract hard-blocked capture should block at verify_capture_blocked, got ${hardBlockedCapture.checkpoint}`,
  );
  assert(hardBlockedCapture.blocking === true, 'contract hard-blocked capture should be a blocking checkpoint');
  assert(
    hardBlockedCapture.summary.includes('locator.scrollIntoViewIfNeeded: Timeout 3000ms exceeded'),
    'contract hard-blocked capture should preserve the selector timeout',
  );
  assert(
    hardBlockedCapture.decisionRequest.continue_with_stage == null,
    'contract hard-blocked capture should not continue into author retry',
  );

  const hardBlockedEvidenceStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-hard-blocked-evidence-')), 'state.json');
  writeJson(hardBlockedEvidenceStatePath, {
    ...makeLoopState(),
    implementation_mode: 'none',
    require_diff: false,
    allow_code_changes: false,
    verification_mode: 'interaction',
    server_path: '/',
    simulate_verify_status: 'evidence_captured',
    simulate_proof_assessment_hard_blocker: 'Capture script error: intentional-riddle-proof-contract-hard-blocker',
  });
  const hardBlockedEvidence = await localEngine.execute({ action: 'run', state_path: hardBlockedEvidenceStatePath, advance_stage: 'verify' });
  assert(
    hardBlockedEvidence.checkpoint === 'verify_capture_blocked',
    `contract hard-blocked evidence should block at verify_capture_blocked, got ${hardBlockedEvidence.checkpoint}`,
  );
  assert(hardBlockedEvidence.blocking === true, 'contract hard-blocked evidence should be a blocking checkpoint');
  assert(
    hardBlockedEvidence.summary.includes('intentional-riddle-proof-contract-hard-blocker'),
    'contract hard-blocked evidence should preserve the hard blocker marker',
  );
  assert(
    hardBlockedEvidence.checkpoint !== 'verify_supervisor_judgment',
    'contract hard-blocked evidence should not pause for supervisor judgment',
  );

  const shipped = await localEngine.execute({
    action: 'run',
    state_path: reconLoopStatePath,
    continue_from_checkpoint: true,
    proof_assessment_json: JSON.stringify({
      decision: 'ready_to_ship',
      summary: 'Evidence is strong enough to ship.',
      recommended_stage: 'ship',
      continue_with_stage: 'ship',
      escalation_target: 'agent',
      reasons: ['The before/after evidence is strong enough.'],
    }),
  });
  assert(shipped.checkpoint === 'ship_review', 'supervising-agent ship judgment should auto-ship when continuing from the verify checkpoint');
  assert(shipped.checkpointContract.ship_gate.ok === true, 'auto-ship should expose a passing ship gate contract');
  const afterShip = readJson(reconLoopStatePath);
  assert(afterShip.stage_attempts.ship.count === 1, 'ship attempt should be recorded');
  assert(afterShip.current_runtime_step === null, 'completed workflow steps should clear the active runtime step');
  assert(afterShip.last_runtime_step.step === 'ship', 'completed workflow steps should record the last runtime step');

  const holdReadyStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-hold-ready-')), 'state.json');
  writeJson(holdReadyStatePath, {
    ...makeLoopState(),
    stage: 'verify',
    implementation_status: 'changes_detected',
    verify_status: 'evidence_captured',
    simulate_verify_status: 'capture_incomplete',
    verify_summary: 'Verify captured usable evidence and is waiting for supervising-agent proof assessment.',
    verify_decision_request: {
      status: 'evidence_captured',
      summary: 'Verify captured usable evidence and is waiting for supervising-agent proof assessment.',
      next_stage_options: ['verify', 'author', 'implement', 'ship', 'recon'],
      recommended_stage: null,
      continue_with_stage: null,
    },
    proof_assessment_request: { status: 'needs_supervising_agent_assessment' },
    after_cdn: 'https://cdn.example.com/after.png',
    verify_results: { after: { screenshots: [{ url: 'https://cdn.example.com/after.png' }] } },
    active_checkpoint: 'verify_supervisor_judgment',
    active_checkpoint_stage: 'verify',
    stage_decision_request: {
      stage: 'verify',
      checkpoint: 'verify_supervisor_judgment',
      summary: 'Awaiting supervising-agent proof assessment.',
      next_actions: ['inspect_evidence', 'supply_proof_assessment_json'],
      advance_options: ['verify', 'author', 'implement', 'recon', 'ship'],
      recommended_advance_stage: 'verify',
      continue_from_checkpoint: true,
      continue_with_stage: 'verify',
      blocking: false,
      details: {},
      updated_at: '2026-04-13T00:00:00.000Z',
    },
  });
  const holdReadyConfig = core.resolveConfig({ riddleProofDir: fakeSkillDir, statePath: holdReadyStatePath, defaultReviewer: 'octocat' }, { action: 'run', state_path: holdReadyStatePath });
  const holdReady = await engineMod.executeWorkflow({
    action: 'run',
    state_path: holdReadyStatePath,
    advance_stage: 'verify',
    proof_assessment_json: JSON.stringify({
      decision: 'ready_to_ship',
      summary: 'Evidence is strong enough to ship, but the caller is holding shipment.',
      recommended_stage: 'ship',
      continue_with_stage: 'ship',
      escalation_target: 'agent',
      reasons: ['The before/after evidence is strong enough.'],
    }),
  }, { riddleProofDir: fakeSkillDir, statePath: holdReadyStatePath, defaultReviewer: 'octocat' }, holdReadyConfig);
  assert(holdReady.checkpoint === 'verify_ship_ready', 'hold-mode verify should mark ship-ready without rerunning capture');
  assert(holdReady.executed.some((step) => step.step === 'verify' && step.reusedEvidence === true), 'hold-mode verify should reuse captured evidence when proof_assessment_json is supplied');
  const afterHoldReady = readJson(holdReadyStatePath);
  assert(afterHoldReady.finalized !== true, 'hold-mode verify must not run ship');
  assert(!afterHoldReady.stage_attempts.ship || afterHoldReady.stage_attempts.ship.count === 0, 'hold-mode verify should leave ship attempts untouched');

  const missingBaselineStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-missing-baseline-')), 'state.json');
  writeJson(missingBaselineStatePath, {
    ...makeLoopState(),
    stage: 'verify',
    implementation_status: 'changes_detected',
    verify_status: 'evidence_captured',
    verify_summary: 'Verify captured usable evidence and is waiting for supervising-agent proof assessment.',
    proof_assessment: { decision: 'ready_to_ship', recommended_stage: 'ship', continue_with_stage: 'ship', escalation_target: 'agent', source: 'supervising_agent' },
    proof_assessment_source: 'supervising_agent',
    proof_assessment_request: { status: 'needs_supervising_agent_assessment' },
    verify_decision_request: { status: 'evidence_captured', next_stage_options: ['verify', 'implement', 'ship'], recommended_stage: null, continue_with_stage: null },
    before_cdn: '',
    after_cdn: 'https://cdn.example.com/after.png',
    verify_results: { after: { screenshots: [{ url: 'https://cdn.example.com/after.png' }] } },
    active_checkpoint: 'verify_supervisor_judgment',
    active_checkpoint_stage: 'verify',
  });
  const missingBaselineConfig = core.resolveConfig({ riddleProofDir: fakeSkillDir, statePath: missingBaselineStatePath, defaultReviewer: 'octocat' }, { action: 'run', state_path: missingBaselineStatePath });
  const blockedShip = await engineMod.executeWorkflow({ action: 'run', state_path: missingBaselineStatePath, advance_stage: 'ship' }, { riddleProofDir: fakeSkillDir, statePath: missingBaselineStatePath, defaultReviewer: 'octocat' }, missingBaselineConfig);
  assert(blockedShip.checkpoint === 'ship_gate_blocked', 'ship should be blocked when the required baseline evidence is missing');
  assert(blockedShip.shipGate.ok === false, 'blocked ship should expose the failing gate');
  assert(blockedShip.shipGate.reasons.includes('before_cdn is required before ship'), 'blocked ship should explain the missing before baseline');
  assert(blockedShip.nextAction.includes('return to recon'), 'blocked ship should include one concrete next action');
  assert(blockedShip.checkpointContract.ship_gate.ok === false, 'blocked ship contract should include the failing gate');
  assert(readJson(missingBaselineStatePath).finalized !== true, 'ship gate should prevent the ship stage from running');

  const verifyRetryStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-verify-retry-')), 'state.json');
  writeJson(verifyRetryStatePath, {
    ...makeLoopState(),
    stage: 'implement',
    implementation_status: 'changes_detected',
    simulate_verify_status: 'capture_incomplete',
  });
  const verifyRetryConfig = core.resolveConfig({ riddleProofDir: fakeSkillDir, statePath: verifyRetryStatePath, defaultReviewer: 'octocat' }, { action: 'run', state_path: verifyRetryStatePath });
  const verifyRetry = await engineMod.executeWorkflow({ action: 'run', state_path: verifyRetryStatePath, advance_stage: 'verify' }, { riddleProofDir: fakeSkillDir, statePath: verifyRetryStatePath, defaultReviewer: 'octocat' }, verifyRetryConfig);
  assert(verifyRetry.checkpoint === 'verify_capture_retry', 'verify should keep bad captures inside the verify sub-loop');
  assert(verifyRetry.decisionRequest.continue_with_stage === 'author', 'capture retry should expose author as the resumable checkpoint target');
  assert(verifyRetry.summary === verifyRetry.decisionRequest.summary, 'capture retry checkpoint summary should surface the verifier diagnostic');

  const authorRetry = await engineMod.executeWorkflow({ action: 'run', state_path: verifyRetryStatePath, continue_from_checkpoint: true }, { riddleProofDir: fakeSkillDir, statePath: verifyRetryStatePath, defaultReviewer: 'octocat' }, verifyRetryConfig);
  assert(authorRetry.checkpoint === 'author_supervisor_judgment', 'capture retry should flow back into supervising-agent proof authoring');

  const staleCaptureRetryState = readJson(verifyRetryStatePath);
  staleCaptureRetryState.stage_decision_request.continue_with_stage = 'recon';
  staleCaptureRetryState.stage_decision_request.recommended_advance_stage = 'recon';
  writeJson(verifyRetryStatePath, staleCaptureRetryState);
  const authoredAfterCaptureRetry = await engineMod.executeWorkflow({
    action: 'run',
    state_path: verifyRetryStatePath,
    continue_from_checkpoint: true,
    advance_stage: 'author',
    author_packet_json: JSON.stringify({
      proof_plan: 'Use a repaired capture packet after verify_capture_retry.',
      capture_script: "await saveScreenshot('after-proof');",
      baseline_understanding_used: baselineUnderstanding(),
      refined_inputs: { server_path: '/good', wait_for_selector: '.cta', expected_terminal_path: '/pricing/?rp_probe=1#pricing-probe' },
      rationale: ['The retry packet explicitly supplies the terminal route.'],
      confidence: 'high',
      summary: 'Capture retry packet',
    }),
  }, { riddleProofDir: fakeSkillDir, statePath: verifyRetryStatePath, defaultReviewer: 'octocat' }, verifyRetryConfig);
  assert(authoredAfterCaptureRetry.checkpoint === 'verify_capture_retry', 'author packet recovery should rerun verify instead of following stale recon continuation');
  assert(authoredAfterCaptureRetry.executed.some((step) => step.step === 'author'), 'author packet recovery should execute the author stage');
  assert(authoredAfterCaptureRetry.executed.some((step) => step.step === 'verify'), 'author packet recovery should execute verify after author');
  assert(readJson(verifyRetryStatePath).expected_terminal_path === '/pricing/?rp_probe=1#pricing-probe', 'author packet recovery should preserve query/hash terminal route');

  const ambiguousAssessmentStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-ambiguous-')), 'state.json');
  writeJson(ambiguousAssessmentStatePath, {
    ...makeLoopState(),
    stage: 'verify',
    implementation_status: 'changes_detected',
    verify_status: 'evidence_captured',
    verify_summary: 'Verify captured usable evidence and is waiting for supervising-agent proof assessment.',
    verify_decision_request: {
      status: 'evidence_captured',
      summary: 'Verify captured usable evidence and is waiting for supervising-agent proof assessment.',
      next_stage_options: ['verify', 'author', 'implement', 'ship', 'recon'],
      recommended_stage: null,
      continue_with_stage: null,
    },
    proof_assessment_request: { status: 'needs_supervising_agent_assessment' },
    after_cdn: 'https://cdn.example.com/after.png',
    verify_results: { after: { screenshots: [{ url: 'https://cdn.example.com/after.png' }] } },
    active_checkpoint: 'verify_supervisor_judgment',
    active_checkpoint_stage: 'verify',
    stage_decision_request: {
      stage: 'verify',
      checkpoint: 'verify_supervisor_judgment',
      summary: 'Awaiting supervising-agent proof assessment.',
      next_actions: ['inspect_evidence', 'supply_proof_assessment_json'],
      advance_options: ['verify', 'author', 'implement', 'recon', 'ship'],
      recommended_advance_stage: 'verify',
      continue_from_checkpoint: true,
      continue_with_stage: 'verify',
      blocking: false,
      details: {},
      updated_at: '2026-04-13T00:00:00.000Z',
    },
    stage_attempts: {
      setup: { count: 1, history: [] },
      recon: { count: 1, history: [] },
      author: { count: 2, history: [] },
      implement: { count: 1, history: [] },
      verify: { count: 3, history: [] },
      ship: { count: 0, history: [] },
    },
  });
  const ambiguousConfig = core.resolveConfig({ riddleProofDir: fakeSkillDir, statePath: ambiguousAssessmentStatePath, defaultReviewer: 'octocat' }, { action: 'run', state_path: ambiguousAssessmentStatePath });
  const ambiguous = await engineMod.executeWorkflow({
    action: 'run',
    state_path: ambiguousAssessmentStatePath,
    continue_from_checkpoint: true,
    proof_assessment_json: JSON.stringify({
      decision: 'needs_richer_proof',
      summary: 'The packet needs stronger evidence before shipping.',
      recommended_stage: 'author',
      continue_with_stage: 'author',
      escalation_target: 'agent',
      reasons: ['Need a tighter proof packet.'],
    }),
  }, { riddleProofDir: fakeSkillDir, statePath: ambiguousAssessmentStatePath, defaultReviewer: 'octocat' }, ambiguousConfig);
  assert(ambiguous.checkpoint === 'verify_agent_retry', 'non-ship supervisor judgments should keep the loop internal');
  assert(ambiguous.decisionRequest.continue_with_stage === 'author', 'internal retry should point back to author');
  assert(ambiguous.summary.includes('not be converging yet') || ambiguous.summary.includes('keep iterating internally'), 'retry summary should stay agent-facing');

  const authorRetryAfterProofAssessment = await engineMod.executeWorkflow({
    action: 'run',
    state_path: ambiguousAssessmentStatePath,
    continue_from_checkpoint: true,
    author_packet_json: JSON.stringify({
      proof_plan: 'Use a richer structured capture that proves the specific visual delta.',
      capture_script: "await saveScreenshot('after-proof');",
      baseline_understanding_used: baselineUnderstanding(),
      refined_inputs: { server_path: '/good', wait_for_selector: '.cta' },
      rationale: ['The previous proof assessment requested richer proof.'],
      confidence: 'high',
      summary: 'Revised proof packet',
    }),
  }, { riddleProofDir: fakeSkillDir, statePath: ambiguousAssessmentStatePath, defaultReviewer: 'octocat' }, ambiguousConfig);
  assert(authorRetryAfterProofAssessment.checkpoint === 'verify_supervisor_judgment', 'supplying a revised author packet after needs_richer_proof should rerun verify instead of reusing stale evidence');
  assert(authorRetryAfterProofAssessment.executed.some((step) => step.step === 'verify' && step.reusedEvidence !== true), 'author retry should capture fresh verify evidence');
  const afterAuthorRetryAssessment = readJson(ambiguousAssessmentStatePath);
  assert(afterAuthorRetryAssessment.after_cdn === 'https://cdn.example.com/after.png', 'fresh verify should restore after evidence after invalidation');
  assert(Object.keys(afterAuthorRetryAssessment.proof_assessment || {}).length === 0, 'fresh verify should clear the stale needs_richer_proof assessment');

  const escalationStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-escalation-')), 'state.json');
  writeJson(escalationStatePath, {
    ...makeLoopState(),
    stage: 'verify',
    implementation_status: 'changes_detected',
    verify_status: 'evidence_captured',
    verify_summary: 'Verify captured usable evidence and is waiting for supervising-agent proof assessment.',
    verify_decision_request: {
      status: 'evidence_captured',
      summary: 'Verify captured usable evidence and is waiting for supervising-agent proof assessment.',
      next_stage_options: ['verify', 'author', 'implement', 'ship', 'recon'],
      recommended_stage: null,
      continue_with_stage: null,
    },
    proof_assessment_request: { status: 'needs_supervising_agent_assessment' },
    after_cdn: 'https://cdn.example.com/after.png',
    verify_results: { after: { screenshots: [{ url: 'https://cdn.example.com/after.png' }] } },
    active_checkpoint: 'verify_supervisor_judgment',
    active_checkpoint_stage: 'verify',
    stage_decision_request: {
      stage: 'verify',
      checkpoint: 'verify_supervisor_judgment',
      summary: 'Awaiting supervising-agent proof assessment.',
      next_actions: ['inspect_evidence', 'supply_proof_assessment_json'],
      advance_options: ['verify', 'author', 'implement', 'recon', 'ship'],
      recommended_advance_stage: 'verify',
      continue_from_checkpoint: true,
      continue_with_stage: 'verify',
      blocking: false,
      details: {},
      updated_at: '2026-04-13T00:00:00.000Z',
    },
  });
  const escalationConfig = core.resolveConfig({ riddleProofDir: fakeSkillDir, statePath: escalationStatePath, defaultReviewer: 'octocat' }, { action: 'run', state_path: escalationStatePath });
  const escalated = await engineMod.executeWorkflow({
    action: 'run',
    state_path: escalationStatePath,
    continue_from_checkpoint: true,
    proof_assessment_json: JSON.stringify({
      decision: 'needs_richer_proof',
      summary: 'We are genuinely stuck.',
      recommended_stage: 'author',
      continue_with_stage: 'author',
      escalation_target: 'human',
      reasons: ['The supervising agent concluded the loop is not converging.'],
    }),
  }, { riddleProofDir: fakeSkillDir, statePath: escalationStatePath, defaultReviewer: 'octocat' }, escalationConfig);
  assert(escalated.checkpoint === 'verify_human_escalation', 'human escalation should require an explicit supervising-agent escalation_target=human');
  assert(escalated.ok === false, 'human escalation should surface as a blocking checkpoint');

  const staleAfterStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-stale-after-')), 'state.json');
  writeJson(staleAfterStatePath, {
    ...makeLoopState(),
    stage: 'verify',
    implementation_status: 'changes_detected',
    verify_status: 'evidence_captured',
    verify_summary: 'Verify captured usable evidence and is waiting for supervising-agent proof assessment.',
    proof_assessment: { decision: 'ready_to_ship', recommended_stage: 'ship', continue_with_stage: 'ship', escalation_target: 'agent', source: 'supervising_agent' },
    proof_assessment_source: 'supervising_agent',
    proof_assessment_request: { status: 'needs_supervising_agent_assessment' },
    verify_decision_request: { status: 'evidence_captured', next_stage_options: ['verify', 'implement', 'ship'], recommended_stage: null, continue_with_stage: null },
    after_cdn: 'https://cdn.example.com/stale-after.png',
    verify_results: { after: { screenshots: [{ url: 'https://cdn.example.com/stale-after.png' }] } },
    merge_recommendation: 'ready-to-ship',
  });
  const staleAfterConfig = core.resolveConfig({ riddleProofDir: fakeSkillDir, statePath: staleAfterStatePath, defaultReviewer: 'octocat' }, { action: 'run', state_path: staleAfterStatePath });
  const reimplemented = await engineMod.executeWorkflow({ action: 'run', state_path: staleAfterStatePath, advance_stage: 'implement' }, { riddleProofDir: fakeSkillDir, statePath: staleAfterStatePath, defaultReviewer: 'octocat' }, staleAfterConfig);
  assert(reimplemented.checkpoint === 'implement_review', 'explicit implement reruns should still checkpoint for review');
  const afterReimplement = readJson(staleAfterStatePath);
  assert(afterReimplement.after_cdn === '', 'implement reruns should invalidate stale after evidence');
  assert(!afterReimplement.verify_results || Object.keys(afterReimplement.verify_results).length === 0, 'implement reruns should clear stale verify results');
  assert(!afterReimplement.proof_assessment || Object.keys(afterReimplement.proof_assessment).length === 0, 'implement reruns should clear stale proof assessments');

  const explicitAdvanceStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-explicit-advance-')), 'state.json');
  writeJson(explicitAdvanceStatePath, {
    ...makeLoopState(),
    stage: 'author',
    stage_decision_request: {},
    active_checkpoint: null,
    active_checkpoint_stage: null,
  });
  const explicitAdvanceConfig = core.resolveConfig({ riddleProofDir: fakeSkillDir, statePath: explicitAdvanceStatePath, defaultReviewer: 'octocat' }, { action: 'run', state_path: explicitAdvanceStatePath });
  const explicitAdvance = await engineMod.executeWorkflow({
    action: 'run',
    state_path: explicitAdvanceStatePath,
    continue_from_checkpoint: true,
    advance_stage: 'implement',
    implementation_notes: 'Implementation agent already changed the after worktree.',
  }, { riddleProofDir: fakeSkillDir, statePath: explicitAdvanceStatePath, defaultReviewer: 'octocat' }, explicitAdvanceConfig);
  assert(explicitAdvance.checkpoint === 'implement_review', `explicit advance_stage should take precedence over a stale continue_from_checkpoint flag (got ${explicitAdvance.checkpoint})`);

  const syncRepoDir = mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-sync-repo-'));
  execFileSync('git', ['init'], { cwd: syncRepoDir, stdio: 'ignore' });

  const orphanSyncStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-sync-orphan-')), 'state.json');
  writeJson(orphanSyncStatePath, {
    repo: 'openclaw/openclaw-plugins',
    repo_dir: syncRepoDir,
    target_branch: 'agent/openclaw/orphan-proof-run',
    branch: 'agent/openclaw/orphan-proof-run',
    base_branch: 'main',
    finalized: false,
  });
  const orphanSyncConfig = core.resolveConfig({ riddleProofDir: fakeSkillDir, statePath: orphanSyncStatePath, defaultReviewer: 'octocat' }, { action: 'sync', state_path: orphanSyncStatePath });
  const orphanSync = await engineMod.executeWorkflow({ action: 'sync', state_path: orphanSyncStatePath }, { riddleProofDir: fakeSkillDir, statePath: orphanSyncStatePath, defaultReviewer: 'octocat' }, orphanSyncConfig);
  assert(orphanSync.checkpoint === 'pr_sync_no_pr', 'sync should explicitly identify orphaned runs with no linked PR');
  assert(orphanSync.summary.includes('state exists'), 'orphaned sync should clarify that the wrapper state was readable');
  assert(orphanSync.pr_state.status === 'orphaned', 'orphaned sync should expose an orphaned PR state');
  assert(orphanSync.pr_state.sync_recoverable === false, 'orphaned sync should distinguish existing state from recoverable PR sync');
  assert(orphanSync.nextAction.includes('orphaned proof run'), 'orphaned sync should return one concrete cleanup path');

  const syncStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-sync-')), 'state.json');
  writeJson(syncStatePath, {
    repo: 'openclaw/openclaw-plugins',
    repo_dir: syncRepoDir,
    pr_url: 'https://github.com/openclaw/openclaw-plugins/pull/321',
    target_branch: 'proof/sync-branch',
    branch: 'proof/sync-branch',
    base_branch: 'main',
    after_worktree_branch: 'riddle-proof/rp_sync-after',
    finalized: true,
  });
  const syncConfig = core.resolveConfig({ riddleProofDir: fakeSkillDir, statePath: syncStatePath, defaultReviewer: 'octocat' }, { action: 'sync', state_path: syncStatePath });
  const synced = await engineMod.executeWorkflow({ action: 'sync', state_path: syncStatePath }, { riddleProofDir: fakeSkillDir, statePath: syncStatePath, defaultReviewer: 'octocat' }, syncConfig);
  assert(synced.checkpoint === 'pr_sync_merged', 'sync should detect merged PR state');
  assert(synced.pr_state.status === 'merged', 'sync should expose normalized PR lifecycle state');
  assert(synced.pr_state.merge_commit === 'merge-sync-123', 'sync should record the merge commit');
  assert(synced.nextAction.includes('next proof run'), 'merged sync should return one concrete next action');
  const afterSync = readJson(syncStatePath);
  assert(afterSync.pr_state.status === 'merged', 'sync should persist PR lifecycle state');
  assert(afterSync.merge_commit === 'merge-sync-123', 'sync should persist the merge commit');
  assert(afterSync.cleanup_report.requested === true, 'merged sync should record cleanup intent');
  assert(afterSync.cleanup_report.base_checkout.requested === true, 'merged sync should request a safe base checkout refresh by default');

  const remoteDir = mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-sync-remote-'));
  execFileSync('git', ['init', '--bare'], { cwd: remoteDir, stdio: 'ignore' });
  const baseRepoDir = mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-sync-base-'));
  execFileSync('git', ['init'], { cwd: baseRepoDir, stdio: 'ignore' });
  execFileSync('git', ['checkout', '-b', 'main'], { cwd: baseRepoDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'riddle-proof@example.com'], { cwd: baseRepoDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Riddle Proof'], { cwd: baseRepoDir, stdio: 'ignore' });
  writeFileSync(path.join(baseRepoDir, 'README.md'), 'one\n');
  execFileSync('git', ['add', 'README.md'], { cwd: baseRepoDir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: baseRepoDir, stdio: 'ignore' });
  execFileSync('git', ['remote', 'add', 'origin', remoteDir], { cwd: baseRepoDir, stdio: 'ignore' });
  execFileSync('git', ['push', '-u', 'origin', 'main'], { cwd: baseRepoDir, stdio: 'ignore' });

  const remoteWriterDir = mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-sync-writer-'));
  execFileSync('git', ['clone', remoteDir, remoteWriterDir], { stdio: 'ignore' });
  execFileSync('git', ['checkout', 'main'], { cwd: remoteWriterDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'riddle-proof@example.com'], { cwd: remoteWriterDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Riddle Proof'], { cwd: remoteWriterDir, stdio: 'ignore' });
  writeFileSync(path.join(remoteWriterDir, 'README.md'), 'two\n');
  execFileSync('git', ['commit', '-am', 'advance main'], { cwd: remoteWriterDir, stdio: 'ignore' });
  execFileSync('git', ['push', 'origin', 'main'], { cwd: remoteWriterDir, stdio: 'ignore' });

  const baseSyncStatePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'riddle-proof-sync-base-state-')), 'state.json');
  writeJson(baseSyncStatePath, {
    repo: 'openclaw/openclaw-plugins',
    repo_dir: baseRepoDir,
    pr_url: 'https://github.com/openclaw/openclaw-plugins/pull/321',
    target_branch: 'proof/sync-branch',
    branch: 'proof/sync-branch',
    base_branch: 'main',
    finalized: true,
  });
  const baseSyncConfig = core.resolveConfig({ riddleProofDir: fakeSkillDir, statePath: baseSyncStatePath, defaultReviewer: 'octocat' }, { action: 'sync', state_path: baseSyncStatePath });
  await engineMod.executeWorkflow({ action: 'sync', state_path: baseSyncStatePath, cleanup_merged_pr: false }, { riddleProofDir: fakeSkillDir, statePath: baseSyncStatePath, defaultReviewer: 'octocat' }, baseSyncConfig);
  const afterBaseSync = readJson(baseSyncStatePath);
  assert(afterBaseSync.cleanup_report.base_checkout.updated === true, 'sync should fast-forward a clean local base checkout after merge');
  assert(readFileSync(path.join(baseRepoDir, 'README.md'), 'utf-8') === 'two\n', 'base checkout should contain the fetched merge result');

  process.env.PATH = originalPath;
  if (originalLobsterCommand === undefined) {
    delete process.env.RIDDLE_PROOF_LOBSTER_COMMAND;
  } else {
    process.env.RIDDLE_PROOF_LOBSTER_COMMAND = originalLobsterCommand;
  }
  if (originalLobsterScript === undefined) {
    delete process.env.RIDDLE_PROOF_LOBSTER_SCRIPT;
  } else {
    process.env.RIDDLE_PROOF_LOBSTER_SCRIPT = originalLobsterScript;
  }
  rmSync(fakeLobsterRoot, { recursive: true, force: true });

  return {
    ok: true,
    checks: {
      build: true,
      runtimeFiles: true,
      setupDefaults: true,
      statePatch: true,
      summarizeState: true,
      checkpointContract: true,
      localEngine: true,
      reconCheckpointLoop: true,
      supervisorAuthoring: true,
      supervisorProofAssessment: true,
      shipGate: true,
      verifyCaptureRetryLoop: true,
      explicitHumanEscalation: true,
      checkpointPacketProtocol: true,
      staleVerifyEvidenceInvalidation: true,
      prLifecycleSync: true,
    },
  };
}

run().then((result) => {
  writeFileSync(path.join(__dirname, 'test-results.json'), JSON.stringify(result, null, 2));
  process.stdout.write(JSON.stringify(result, null, 2));
}).catch((error) => {
  const payload = { ok: false, error: error.message };
  writeFileSync(path.join(__dirname, 'test-results.json'), JSON.stringify(payload, null, 2));
  process.stdout.write(JSON.stringify(payload, null, 2));
  process.exitCode = 1;
});
