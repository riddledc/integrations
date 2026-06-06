import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const pack = JSON.parse(readFileSync(new URL("./examples/regression-packs/oc-flow-regression.json", import.meta.url), "utf8"));
const packageDir = new URL(".", import.meta.url);

assert.equal(pack.version, "riddle-proof.regression-pack.v1");
assert.equal(pack.pack_id, "riddle-proof-oc-flow-2026-06");
assert.equal(pack.minimum_versions["@riddledc/openclaw-riddle-proof"], "0.4.155");
assert.equal(pack.minimum_versions["@riddledc/riddle-proof"], "0.8.43");
assert.equal(pack.runtime_gate.tool, "riddle_proof_status");
assert.equal(pack.runtime_gate.require_loaded_metadata, true);

const globalForbidden = new Set(pack.forbidden_terminal_markers);
for (const marker of [
  "codex_invalid_json",
  "codex_timeout",
  "max_iterations_reached",
  "verify_capture_retry",
  "checkpoint_response_without_packet",
]) {
  assert.equal(globalForbidden.has(marker), true, `global forbidden marker missing ${marker}`);
}

const requiredCoreCases = new Set([
  "route-change-forward-pass",
  "route-change-proof-plan-placeholder-ignored",
  "route-change-reverse-nested-terminal-url-pass",
  "query-hash-trailing-slash-pass",
  "query-hash-dropped-structured-negative-blocker",
  "missing-selector-timeout-specific-blocker",
  "thrown-error-preserves-structured-evidence",
  "interaction-iife-structured-proof-without-screenshot-pass",
  "no-diff-prod-audit-default-capture-pass",
]);
const coreCases = new Set(pack.local_core_suite.required_cases);
for (const caseId of requiredCoreCases) {
  assert.equal(coreCases.has(caseId), true, `core suite case missing ${caseId}`);
}

const liveCases = pack.openclaw_live_suite.cases;
const liveCaseIds = liveCases.map((testCase) => testCase.id);
const hostedCases = pack.hosted_riddle_suite.cases;
const hostedCaseIds = hostedCases.map((testCase) => testCase.id);
assert.equal(pack.hosted_riddle_suite.runner, "riddle");
assert.equal(pack.hosted_riddle_suite.target.url, "https://riddledc.com/");
assert.equal(new Set(hostedCaseIds).size, hostedCaseIds.length, "hosted case ids must be unique");
assert.deepEqual(hostedCaseIds, [
  "hosted-home-to-proof-route-change-pass",
  "hosted-proof-to-home-route-change-pass",
  "hosted-pricing-query-hash-positive-pass",
  "hosted-pricing-query-hash-dropped-blocker",
  "hosted-no-diff-prod-audit-pass",
  "hosted-missing-selector-timeout-blocker",
  "hosted-thrown-error-specific-blocker",
]);
const hostedExpectById = new Map(hostedCases.map((testCase) => [testCase.id, testCase.expect]));
const hostedById = new Map(hostedCases.map((testCase) => [testCase.id, testCase]));
assert.equal(hostedExpectById.get("hosted-home-to-proof-route-change-pass").profile_status, "passed");
assert.equal(hostedExpectById.get("hosted-pricing-query-hash-dropped-blocker").profile_status, "product_regression");
assert.equal(hostedExpectById.get("hosted-thrown-error-specific-blocker").message_contains, "RIDDLE_PROOF_HOSTED_THROWN_ERROR_SMOKE_20260604");
assert.equal(
  hostedById.get("hosted-home-to-proof-route-change-pass").profile.target.setup_actions[0].expected_path,
  "/proof/",
);
assert.equal(
  hostedById.get("hosted-proof-to-home-route-change-pass").profile.target.setup_actions[0].expected_path,
  "/",
);
for (const testCase of hostedCases) {
  assert.equal(typeof testCase.intent, "string", `${testCase.id} needs an intent`);
  assert.ok(testCase.profile, `${testCase.id} needs a hosted profile`);
  assert.ok(["passed", "product_regression"].includes(testCase.expect.profile_status), `${testCase.id} has invalid hosted status ${testCase.expect.profile_status}`);
}

assert.equal(new Set(liveCaseIds).size, liveCaseIds.length, "live case ids must be unique");
assert.deepEqual(liveCaseIds, [
  "home-to-proof-route-change-pass",
  "proof-to-home-route-change-pass",
  "pricing-query-hash-positive-pass",
  "pricing-query-hash-dropped-blocker",
  "no-diff-prod-audit-pass",
  "missing-selector-timeout-blocker",
  "thrown-error-specific-blocker",
  "late-stale-checkpoint-ignored",
]);

const expectById = new Map(liveCases.map((testCase) => [testCase.id, testCase.expect]));
const liveById = new Map(liveCases.map((testCase) => [testCase.id, testCase]));
assert.equal(expectById.get("home-to-proof-route-change-pass").terminal_status, "ready_to_ship");
assert.equal(expectById.get("home-to-proof-route-change-pass").route_expectation_source, "expected_terminal_path");
assert.equal(expectById.get("proof-to-home-route-change-pass").terminal_path, "/");
assert.equal(expectById.get("proof-to-home-route-change-pass").route_expectation_source, "expected_terminal_path");
assert.equal(expectById.get("pricing-query-hash-positive-pass").terminal_url, "https://riddledc.com/pricing/?rp_probe=1#pricing-probe");
assert.equal(expectById.get("pricing-query-hash-dropped-blocker").last_checkpoint, "verify_capture_blocked");
assert.equal(expectById.get("pricing-query-hash-dropped-blocker").capture_decision, "failed_interaction_capture");
assert.equal(expectById.get("no-diff-prod-audit-pass").implementation_attempted, false);
assert.equal(expectById.get("no-diff-prod-audit-pass").proof_evidence_required, false);
assert.equal(expectById.get("no-diff-prod-audit-pass").screenshot_required, true);
assert.equal(expectById.get("no-diff-prod-audit-pass").browser_interaction_performed, false);
assert.equal(expectById.get("late-stale-checkpoint-ignored").ignored_checkpoint_response, true);
assert.equal(expectById.get("late-stale-checkpoint-ignored").background_resume_started, false);

const noDiffCase = liveById.get("no-diff-prod-audit-pass");
assert.equal(noDiffCase.params.verification_mode, "visual");
assert.match(noDiffCase.params.capture_script_contract.join("\n"), /do not click, type, submit, copy, navigate, or interact/);
assert.match(noDiffCase.params.capture_script_contract.join("\n"), /passive visual\/no-diff audit/);
assert.doesNotMatch(noDiffCase.params.capture_script_contract.join("\n"), /structured interaction/i);
assert.equal(liveById.get("thrown-error-specific-blocker").params.max_iterations, 6);

for (const testCase of liveCases) {
  assert.equal(typeof testCase.intent, "string", `${testCase.id} needs an intent`);
  assert.ok(testCase.expect, `${testCase.id} needs expectations`);
  const terminalStatus = testCase.expect.terminal_status;
  assert.ok(["ready_to_ship", "blocked"].includes(terminalStatus), `${testCase.id} has invalid terminal status ${terminalStatus}`);
  const forbidden = testCase.expect.forbidden_terminal_markers || [];
  assert.equal(Array.isArray(forbidden), true, `${testCase.id} forbidden markers must be an array`);
}

const staleCheckpointCase = liveCases.find((testCase) => testCase.id === "late-stale-checkpoint-ignored");
assert.equal(staleCheckpointCase.steps.length, 2);
assert.equal(staleCheckpointCase.steps[0].tool, "riddle_proof_change");
assert.equal(staleCheckpointCase.steps[0].params.expected_terminal_url, "https://riddledc.com/proof/");
assert.match(staleCheckpointCase.steps[0].params.capture_script_contract.join("\n"), /Proof nav link only/);
assert.match(staleCheckpointCase.steps[0].params.capture_script_contract.join("\n"), /do not click Docs/);
assert.equal(staleCheckpointCase.steps[0].expect.terminal_url, "https://riddledc.com/proof/");
assert.equal(staleCheckpointCase.steps[0].expect.terminal_path, "/proof");
assert.equal(staleCheckpointCase.steps[0].expect.route_expectation_source, "expected_terminal_path");
assert.equal(staleCheckpointCase.steps[1].tool, "riddle_proof_review");
assert.equal(staleCheckpointCase.steps[1].params_template.state_path, "${state_path}");
assert.equal(staleCheckpointCase.steps[1].params_template.checkpoint_response.run_id, "${run_id}");
assert.equal(staleCheckpointCase.steps[1].params_template.checkpoint_response.checkpoint, "author_supervisor_judgment");
assert.equal(staleCheckpointCase.steps[1].expect.ignored_checkpoint_response, true);

const cliCompact = JSON.parse(execFileSync(process.execPath, [
  "dist/cli.js",
  "regression-pack",
  "run",
  "--pack",
  "oc-flow-regression",
  "--local-core",
  "true",
  "--format",
  "compact-json",
], {
  cwd: packageDir,
  encoding: "utf8",
}));
assert.equal(cliCompact.version, "riddle-proof.regression-pack-run-result.v1");
assert.equal(cliCompact.pack_id, "riddle-proof-oc-flow-2026-06");
assert.equal(cliCompact.ok, true);
assert.equal(cliCompact.local_core.ok, true);
assert.equal(cliCompact.local_core.missing_required_cases.length, 0);
assert.equal(cliCompact.local_core.failed_cases.length, 0);
assert.equal(cliCompact.local_core.forbidden_terminal_markers_seen.length, 0);
assert.equal(cliCompact.hosted_riddle.requested, false);
assert.equal(cliCompact.hosted_riddle.configured, true);
assert.equal(cliCompact.hosted_riddle.case_count, hostedCases.length);

const outputDir = mkdtempSync(path.join(os.tmpdir(), "riddle-proof-regression-pack-test-"));
const cliNoLocalCore = JSON.parse(execFileSync(process.execPath, [
  "dist/cli.js",
  "regression-pack",
  "run",
  "--pack",
  "oc-flow-regression",
  "--local-core",
  "false",
  "--format",
  "json",
  "--output-dir",
  outputDir,
], {
  cwd: packageDir,
  encoding: "utf8",
}));
assert.equal(cliNoLocalCore.ok, true);
assert.equal(cliNoLocalCore.local_core.requested, false);
assert.equal(cliNoLocalCore.local_core_validated, false);
assert.equal(cliNoLocalCore.hosted_riddle.requested, false);
assert.equal(cliNoLocalCore.hosted_riddle.configured, true);
assert.match(cliNoLocalCore.openclaw_handoff_prompt, /Local generic core suite is not green or was not run/);
assert.match(cliNoLocalCore.openclaw_handoff_prompt, /Local generic core suite is not green or was not run/);
assert.match(readFileSync(path.join(outputDir, "hosted-riddle-handoff.md"), "utf8"), /Run the hosted Riddle generic regression suite/);
assert.match(readFileSync(path.join(outputDir, "oc-handoff.md"), "utf8"), /Run the Riddle Proof OC flow regression pack/);
assert.equal(JSON.parse(readFileSync(path.join(outputDir, "regression-pack-result.json"), "utf8")).pack_id, "riddle-proof-oc-flow-2026-06");

console.log(JSON.stringify({
  ok: true,
  suite: "riddle-proof.regression-packs",
  pack_id: pack.pack_id,
  live_case_count: liveCases.length,
  hosted_case_count: hostedCases.length,
  core_case_count: pack.local_core_suite.required_cases.length,
}));
