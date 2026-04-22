import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
  state.verify_status = verifyStatus;
  if (verifyStatus === 'capture_incomplete') {
    state.after_cdn = '';
    state.verify_summary = 'Verify did not capture a usable proof packet yet.';
    state.merge_recommendation = 'do-not-merge';
    state.proof_assessment = {};
    state.proof_assessment_request = {};
    state.verify_results = {
      baseline: { reference: state.reference || 'before' },
      after: { screenshots: [], observation: { valid: false, reason: 'no screenshot in capture' } },
    };
    state.verify_decision_request = {
      status: verifyStatus,
      summary: state.verify_summary,
      next_stage_options: ['author', 'verify', 'implement', 'recon'],
      recommended_stage: 'author',
      continue_with_stage: 'author',
      capture_quality: {
        decision: 'revise_capture',
        recommended_stage: 'author',
        continue_with_stage: 'author',
        reasons: ['The after-proof is missing or low quality.'],
      },
    };
  } else {
    state.after_cdn = 'https://cdn.example.com/after.png';
    state.verify_summary = 'Verify captured usable evidence and is waiting for supervising-agent proof assessment.';
    state.merge_recommendation = 'pending-supervisor-judgment';
    state.proof_assessment = {};
    state.proof_assessment_request = {
      status: 'needs_supervising_agent_assessment',
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
      assessment_request: state.proof_assessment_request,
    };
  }
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
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
  if (!existsSync(path.join(__dirname, 'dist', 'core.js'))) {
    execFileSync('npm', ['run', 'build'], { cwd: __dirname, stdio: 'pipe' });
  }

  const manifest = JSON.parse(readFileSync(path.join(__dirname, 'openclaw.plugin.json'), 'utf-8'));
  assert(manifest.capabilities.tools.provides.includes('riddle_proof_run'), 'manifest must provide riddle_proof_run');
  assert(existsSync(path.join(__dirname, 'dist', 'openclaw.plugin.json')), 'dist/openclaw.plugin.json must exist');

  const core = await import(pathToFileURL(path.join(__dirname, 'dist', 'core.js')).href);
  const engineMod = await import(pathToFileURL(path.join(__dirname, 'dist', 'engine.js')).href);
  const pluginMod = await import(pathToFileURL(path.join(__dirname, 'dist', 'index.js')).href);
  assert(typeof engineMod.createRiddleProofEngine === 'function', 'dist/engine.js should expose createRiddleProofEngine');
  assert(typeof pluginMod.createRiddleProofEngine === 'function', 'plugin entry should re-export createRiddleProofEngine for compatibility');
  assert(typeof pluginMod.executeWorkflow === 'function', 'plugin entry should continue re-exporting executeWorkflow');
  assert(
    core.RIDDLE_PROOF_DIR_CANDIDATES[0].endsWith('/runtime'),
    'default riddle-proof lookup should prefer the bundled package runtime',
  );
  assert(existsSync(path.join(__dirname, 'runtime', 'pipelines', 'riddle-proof-setup.lobster')), 'package runtime should include lobster pipelines');
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
  }, config);

  assert(args.repo === 'openclaw/openclaw-plugins', 'setup args should preserve repo');
  assert(args.commit_message === 'Confirm screenshots are captured', 'setup should infer commit message from change_request');
  assert(args.capture_script === '', 'setup should allow capture_script to be omitted');
  assert(args.reference === 'before', 'setup should fall back to before when prod_url is not known');
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

  const patched = core.mergeStateFromParams(fakeStatePath, {
    action: 'author',
    author_packet_json: JSON.stringify({
      proof_plan: 'Use the recon-confirmed route and capture the fixed state.',
      capture_script: "const evidence = { ok: true };\nglobalThis.__riddleProofEvidence = evidence;\nawait saveScreenshot('after-proof');",
      refined_inputs: { server_path: '/pricing', wait_for_selector: '.cta' },
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

  const fakeLobsterRoot = installFakeLobster();
  const originalPath = process.env.PATH;
  const originalLobsterCommand = process.env.RIDDLE_PROOF_LOBSTER_COMMAND;
  const originalLobsterScript = process.env.RIDDLE_PROOF_LOBSTER_SCRIPT;
  process.env.PATH = `${path.join(fakeLobsterRoot, 'bin')}:${originalPath}`;
  process.env.RIDDLE_PROOF_LOBSTER_COMMAND = process.execPath;
  process.env.RIDDLE_PROOF_LOBSTER_SCRIPT = path.join(fakeLobsterRoot, 'bin', 'lobster');

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
  const localEngine = engineMod.createRiddleProofEngine({ riddleProofDir: fakeSkillDir, defaultReviewer: 'octocat' });
  assert(localEngine.resolveConfig({ action: 'run', state_path: reconLoopStatePath }).statePath === reconConfig.statePath, 'local engine should resolve the same state path as the wrapper config');
  const reconBlocked = await localEngine.execute({ action: 'run', state_path: reconLoopStatePath });
  assert(
    reconBlocked.checkpoint === 'recon_supervisor_judgment',
    `run should bubble recon observations to the supervising agent before marching onward (got ${reconBlocked.checkpoint}: ${reconBlocked.summary || reconBlocked.error || ''})`,
  );
  assert(reconBlocked.checkpointContract.version === 'riddle-proof-run.checkpoint.v1', 'checkpoints should expose a stable machine-readable contract');
  assert(reconBlocked.decisionRequest.checkpoint_contract.checkpoint === 'recon_supervisor_judgment', 'checkpoint contract should persist in the decision request');
  assert(reconBlocked.checkpointContract.accepted_inputs.some((input) => input.name === 'recon_assessment_json'), 'recon checkpoint contract should name recon_assessment_json as an input');
  const reconBlockedState = readJson(reconLoopStatePath);
  assert(reconBlockedState.stage_attempts.recon.count === 1, 'recon checkpoint should count as a stage attempt');
  assert(reconBlockedState.recon_status === 'needs_supervisor_judgment', 'recon should wait for supervising-agent judgment');

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

  const verifyAwaitingJudgment = await localEngine.execute({ action: 'run', state_path: reconLoopStatePath, continue_from_checkpoint: true });
  assert(verifyAwaitingJudgment.checkpoint === 'verify_supervisor_judgment', 'verify should stop for supervising-agent proof assessment after capturing evidence');
  assert(verifyAwaitingJudgment.checkpointContract.accepted_inputs.some((input) => input.name === 'proof_assessment_json'), 'verify checkpoint contract should name proof_assessment_json as an input');
  assert(verifyAwaitingJudgment.checkpointContract.ship_gate.ok === false, 'verify judgment contract should expose the current ship gate before proof approval');
  const afterVerifyCapture = readJson(reconLoopStatePath);
  assert(afterVerifyCapture.stage_attempts.verify.count === 1, 'verify capture should be recorded');
  assert(afterVerifyCapture.merge_recommendation === 'pending-supervisor-judgment', 'verify should wait on supervising-agent judgment before shipping');

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
  const holdReady = await pluginMod.executeWorkflow({
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
  const blockedShip = await pluginMod.executeWorkflow({ action: 'run', state_path: missingBaselineStatePath, advance_stage: 'ship' }, { riddleProofDir: fakeSkillDir, statePath: missingBaselineStatePath, defaultReviewer: 'octocat' }, missingBaselineConfig);
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
  const verifyRetry = await pluginMod.executeWorkflow({ action: 'run', state_path: verifyRetryStatePath, advance_stage: 'verify' }, { riddleProofDir: fakeSkillDir, statePath: verifyRetryStatePath, defaultReviewer: 'octocat' }, verifyRetryConfig);
  assert(verifyRetry.checkpoint === 'verify_capture_retry', 'verify should keep bad captures inside the verify sub-loop');
  assert(verifyRetry.decisionRequest.continue_with_stage === 'author', 'capture retry should expose author as the resumable checkpoint target');

  const authorRetry = await pluginMod.executeWorkflow({ action: 'run', state_path: verifyRetryStatePath, continue_from_checkpoint: true }, { riddleProofDir: fakeSkillDir, statePath: verifyRetryStatePath, defaultReviewer: 'octocat' }, verifyRetryConfig);
  assert(authorRetry.checkpoint === 'author_supervisor_judgment', 'capture retry should flow back into supervising-agent proof authoring');

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
  const ambiguous = await pluginMod.executeWorkflow({
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

  const authorRetryAfterProofAssessment = await pluginMod.executeWorkflow({
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
  const escalated = await pluginMod.executeWorkflow({
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
  const reimplemented = await pluginMod.executeWorkflow({ action: 'run', state_path: staleAfterStatePath, advance_stage: 'implement' }, { riddleProofDir: fakeSkillDir, statePath: staleAfterStatePath, defaultReviewer: 'octocat' }, staleAfterConfig);
  assert(reimplemented.checkpoint === 'implement_review', 'explicit implement reruns should still checkpoint for review');
  const afterReimplement = readJson(staleAfterStatePath);
  assert(afterReimplement.after_cdn === '', 'implement reruns should invalidate stale after evidence');
  assert(!afterReimplement.verify_results || Object.keys(afterReimplement.verify_results).length === 0, 'implement reruns should clear stale verify results');
  assert(!afterReimplement.proof_assessment || Object.keys(afterReimplement.proof_assessment).length === 0, 'implement reruns should clear stale proof assessments');

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
  const orphanSync = await pluginMod.executeWorkflow({ action: 'sync', state_path: orphanSyncStatePath }, { riddleProofDir: fakeSkillDir, statePath: orphanSyncStatePath, defaultReviewer: 'octocat' }, orphanSyncConfig);
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
  const synced = await pluginMod.executeWorkflow({ action: 'sync', state_path: syncStatePath }, { riddleProofDir: fakeSkillDir, statePath: syncStatePath, defaultReviewer: 'octocat' }, syncConfig);
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
  await pluginMod.executeWorkflow({ action: 'sync', state_path: baseSyncStatePath, cleanup_merged_pr: false }, { riddleProofDir: fakeSkillDir, statePath: baseSyncStatePath, defaultReviewer: 'octocat' }, baseSyncConfig);
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
      manifestCopied: true,
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
