import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pack = JSON.parse(readFileSync(new URL("./examples/regression-packs/oc-flow-regression.json", import.meta.url), "utf8"));

assert.equal(pack.version, "riddle-proof.regression-pack.v1");
assert.equal(pack.pack_id, "riddle-proof-oc-flow-2026-06");
assert.equal(pack.minimum_versions["@riddledc/openclaw-riddle-proof"], "0.4.146");
assert.equal(pack.minimum_versions["@riddledc/riddle-proof"], "0.8.18");
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
  "no-diff-prod-audit-default-capture-pass",
]);
const coreCases = new Set(pack.local_core_suite.required_cases);
for (const caseId of requiredCoreCases) {
  assert.equal(coreCases.has(caseId), true, `core suite case missing ${caseId}`);
}

const liveCases = pack.openclaw_live_suite.cases;
const liveCaseIds = liveCases.map((testCase) => testCase.id);
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
assert.equal(expectById.get("home-to-proof-route-change-pass").terminal_status, "ready_to_ship");
assert.equal(expectById.get("proof-to-home-route-change-pass").terminal_path, "/");
assert.equal(expectById.get("pricing-query-hash-positive-pass").terminal_url, "https://riddledc.com/pricing/?rp_probe=1#pricing-probe");
assert.equal(expectById.get("pricing-query-hash-dropped-blocker").last_checkpoint, "verify_capture_blocked");
assert.equal(expectById.get("pricing-query-hash-dropped-blocker").capture_decision, "failed_interaction_capture");
assert.equal(expectById.get("no-diff-prod-audit-pass").implementation_attempted, false);
assert.equal(expectById.get("late-stale-checkpoint-ignored").ignored_checkpoint_response, true);
assert.equal(expectById.get("late-stale-checkpoint-ignored").background_resume_started, false);

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
assert.equal(staleCheckpointCase.steps[1].tool, "riddle_proof_review");
assert.equal(staleCheckpointCase.steps[1].params_template.state_path, "${state_path}");
assert.equal(staleCheckpointCase.steps[1].params_template.checkpoint_response.run_id, "${run_id}");
assert.equal(staleCheckpointCase.steps[1].params_template.checkpoint_response.checkpoint, "author_supervisor_judgment");
assert.equal(staleCheckpointCase.steps[1].expect.ignored_checkpoint_response, true);

console.log(JSON.stringify({
  ok: true,
  suite: "riddle-proof.regression-packs",
  pack_id: pack.pack_id,
  live_case_count: liveCases.length,
  core_case_count: pack.local_core_suite.required_cases.length,
}));
