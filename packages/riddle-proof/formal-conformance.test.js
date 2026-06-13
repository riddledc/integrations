import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assessRiddleProofProfileEvidence,
  normalizeRiddleProofProfile,
} from "./dist/profile.js";
import {
  canonicalProofAssessmentStageForDecision,
  normalizeProofAssessmentStageFields,
  validateShipGate,
} from "./dist/proof-run-core.js";
import {
  createRunResult,
  isSuccessfulStatus,
  isTerminalStatus,
} from "./dist/result.js";
import {
  createRiddleProofRunCard,
} from "./dist/run-card.js";
import {
  createRunState,
  createRunStatusSnapshot,
  setRunStatus,
} from "./dist/state.js";
import {
  summarizeRiddleProofPublicState,
} from "./dist/public-state.js";
import {
  buildRiddleProofPrCommentMarkdown,
} from "./dist/pr-comment.js";
import {
  buildAuthorCheckpointPacket,
  buildProofAssessmentCheckpointPacket,
  buildStageCheckpointPacket,
  checkpointSummaryFromState,
  createCheckpointResponseTemplate,
  isDuplicateCheckpointResponse,
} from "./dist/checkpoint.js";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));
const shipPyPath = path.join(packageRoot, "runtime", "lib", "ship.py");

function pythonShipGateReportFacts(state) {
  const script = `
import json
import sys
from pathlib import Path

ship_path = Path(${JSON.stringify(shipPyPath)})
source = ship_path.read_text(encoding='utf-8')
helpers_source = source.split('\\ns = load_state()', 1)[0]
namespace = {'__file__': str(ship_path)}
exec(compile(helpers_source, str(ship_path), 'exec'), namespace)
state = json.loads(sys.stdin.read())
print(json.dumps(namespace['ship_gate_report_facts'](state), sort_keys=True))
`;
  const result = spawnSync("python3", ["-c", script], {
    cwd: packageRoot,
    input: JSON.stringify(state),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`python ship gate failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function sortedStrings(value) {
  return Array.isArray(value) ? value.map(String).sort() : [];
}

function normalizedShipGateForParity(gate, source) {
  const evidence = gate?.evidence || {};
  return {
    ok: Boolean(gate?.ok),
    reasons: sortedStrings(gate?.reasons),
    required_baselines: sortedStrings(gate?.required_baselines),
    evidence: {
      reference: evidence.reference ?? null,
      verification_mode: evidence.verification_mode ?? null,
      prod_url_present: source === "ts" ? Boolean(evidence.prod_url) : Boolean(evidence.prod_url_present),
      before_present: source === "ts" ? Boolean(evidence.before_cdn) : Boolean(evidence.before_present),
      prod_present: source === "ts" ? Boolean(evidence.prod_cdn) : Boolean(evidence.prod_present),
      after_artifact_url_present: source === "ts"
        ? Boolean(evidence.after_cdn)
        : Boolean(evidence.after_artifact_url_present),
      verify_status: evidence.verify_status ?? null,
      proof_assessment_decision: evidence.proof_assessment_decision ?? null,
      proof_assessment_source: evidence.proof_assessment_source ?? null,
      visual_delta_required: Boolean(evidence.visual_delta_required),
      visual_delta_status: evidence.visual_delta_status ?? null,
      visual_delta_passed: evidence.visual_delta_passed ?? null,
      hard_blockers: sortedStrings(evidence.hard_blockers),
    },
  };
}

const profile = normalizeRiddleProofProfile({
  version: "riddle-proof.profile.v1",
  name: "formal-conformance-profile",
  target: {
    route: "/formal-conformance",
    viewports: [{ name: "desktop", width: 1280, height: 900 }],
  },
  checks: [{ type: "route_loaded", expected_path: "/formal-conformance" }],
  artifacts: ["screenshot", "console", "dom_summary", "proof_json"],
}, { url: "https://example.com" });

const evidence = {
  version: "riddle-proof.profile-evidence.v1",
  profile_name: "formal-conformance-profile",
  target_url: "https://example.com/formal-conformance",
  baseline_policy: "invariant_only",
  captured_at: "2026-06-12T00:00:00.000Z",
  viewports: [{
    name: "desktop",
    width: 1280,
    height: 900,
    route: {
      requested: "https://example.com/formal-conformance",
      observed: "/formal-conformance",
      expected_path: "/formal-conformance",
      matched: true,
      http_status: 200,
    },
    overflow_px: 0,
    selectors: {},
    text_matches: {},
    screenshot_label: "formal-conformance-desktop",
  }],
  console: { events: [], fatal_count: 0 },
  page_errors: [],
  dom_summary: { viewport_count: 1 },
};

const completeArtifacts = [
  { name: "proof.json", url: "https://cdn.example.com/proof.json", kind: "json" },
  { name: "console.json", url: "https://cdn.example.com/console.json", kind: "json" },
  { name: "dom-summary.json", url: "https://cdn.example.com/dom-summary.json", kind: "json" },
  { name: "formal-conformance-desktop.png", url: "https://cdn.example.com/formal-conformance-desktop.png", kind: "screenshot" },
];

const completeProfileResult = assessRiddleProofProfileEvidence(profile, evidence, {
  artifacts: completeArtifacts,
});
assert.equal(completeProfileResult.status, "passed");

const knownEmptyArtifactResult = assessRiddleProofProfileEvidence(profile, evidence, {
  artifacts: [],
});
assert.equal(knownEmptyArtifactResult.status, "proof_insufficient");
assert.match(
  knownEmptyArtifactResult.error || "",
  /Missing required profile artifact\(s\): screenshot:formal-conformance-desktop/,
);
assert.deepEqual(knownEmptyArtifactResult.artifacts.riddle_artifacts, []);

const baseShipState = {
  reference: "before",
  before_cdn: "https://cdn.example.com/before.png",
  after_cdn: "https://cdn.example.com/after.png",
  verify_status: "evidence_captured",
  proof_assessment: {
    source: "supervising_agent",
    decision: "ready_to_ship",
  },
  proof_assessment_source: "supervising_agent",
};

const cleanShipGate = validateShipGate(baseShipState);
assert.equal(cleanShipGate.ok, true);
assert.deepEqual(cleanShipGate.reasons, []);

const missingBaselineGate = validateShipGate({
  ...baseShipState,
  before_cdn: "",
});
assert.equal(missingBaselineGate.ok, false);
assert.ok(missingBaselineGate.reasons.includes("before_cdn is required before ship"));

const missingAfterGate = validateShipGate({
  ...baseShipState,
  after_cdn: "",
});
assert.equal(missingAfterGate.ok, false);
assert.ok(missingAfterGate.reasons.includes("after_cdn is required before ship"));

const missingVerifyGate = validateShipGate({
  ...baseShipState,
  verify_status: "capture_incomplete",
});
assert.equal(missingVerifyGate.ok, false);
assert.ok(missingVerifyGate.reasons.includes("verify_status must be evidence_captured before ship"));

const runnerAssessmentGate = validateShipGate({
  ...baseShipState,
  proof_assessment: {
    source: "runner",
    decision: "ready_to_ship",
  },
  proof_assessment_source: "runner",
});
assert.equal(runnerAssessmentGate.ok, false);
assert.ok(runnerAssessmentGate.reasons.includes("proof_assessment.source must be supervising_agent before ship"));

const needsMoreProofGate = validateShipGate({
  ...baseShipState,
  proof_assessment: {
    source: "supervising_agent",
    decision: "needs_richer_proof",
  },
});
assert.equal(needsMoreProofGate.ok, false);
assert.ok(needsMoreProofGate.reasons.includes("proof_assessment.decision must be ready_to_ship before ship"));

const hardBlockerGate = validateShipGate({
  ...baseShipState,
  proof_assessment_request: {
    hard_blockers: ["structured proof assertion failed"],
  },
});
assert.equal(hardBlockerGate.ok, false);
assert.ok(hardBlockerGate.reasons.includes("proof hard blocker prevents ready_to_ship: structured proof assertion failed"));

assert.equal(canonicalProofAssessmentStageForDecision("ready_to_ship"), "ship");
assert.equal(canonicalProofAssessmentStageForDecision("needs_richer_proof"), "author");
assert.equal(canonicalProofAssessmentStageForDecision("revise_capture"), "verify");
assert.equal(canonicalProofAssessmentStageForDecision("needs_recon"), "recon");
assert.equal(canonicalProofAssessmentStageForDecision("needs_implementation"), "implement");
const contradictoryProofAssessment = normalizeProofAssessmentStageFields({
  decision: "needs_richer_proof",
  recommended_stage: "ship",
  continue_with_stage: "ship",
});
assert.equal(contradictoryProofAssessment.recommended_stage, "author");
assert.equal(contradictoryProofAssessment.continue_with_stage, "author");
const readyProofAssessment = normalizeProofAssessmentStageFields({
  decision: "ready_to_ship",
  recommended_stage: "recon",
  continue_with_stage: "recon",
});
assert.equal(readyProofAssessment.recommended_stage, "ship");
assert.equal(readyProofAssessment.continue_with_stage, "ship");

const shipGateParityCases = [
  ["clean before", baseShipState],
  ["clean both", {
    ...baseShipState,
    reference: "both",
    prod_url: "https://prod.example.com/",
    prod_cdn: "https://cdn.example.com/prod.png",
  }],
  ["invalid reference", {
    ...baseShipState,
    requested_reference: "none",
    reference: "none",
  }],
  ["missing before baseline", {
    ...baseShipState,
    before_cdn: "",
  }],
  ["missing prod url", {
    ...baseShipState,
    reference: "prod",
    prod_cdn: "https://cdn.example.com/prod.png",
  }],
  ["missing prod baseline", {
    ...baseShipState,
    reference: "prod",
    prod_url: "https://prod.example.com/",
    prod_cdn: "",
  }],
  ["missing after evidence", {
    ...baseShipState,
    after_cdn: "",
  }],
  ["structured after evidence without screenshot", {
    ...baseShipState,
    after_cdn: "",
    evidence_bundle: {
      verification_mode: "proof",
      after: {
        observation: { valid: true, telemetry_ready: true },
        supporting_artifacts: { has_structured_payload: true },
      },
    },
  }],
  ["capture incomplete", {
    ...baseShipState,
    verify_status: "capture_incomplete",
  }],
  ["runner assessment", {
    ...baseShipState,
    proof_assessment: {
      source: "runner",
      decision: "ready_to_ship",
    },
    proof_assessment_source: "runner",
  }],
  ["needs richer proof", {
    ...baseShipState,
    proof_assessment: {
      source: "supervising_agent",
      decision: "needs_richer_proof",
    },
  }],
  ["hard blocker", {
    ...baseShipState,
    proof_assessment_request: {
      hard_blockers: ["structured proof assertion failed"],
    },
  }],
  ["visual delta unmeasured", {
    ...baseShipState,
    verification_mode: "visual",
    evidence_bundle: {
      verification_mode: "visual",
      after: {
        visual_delta: { status: "unmeasured", reason: "comparator unavailable" },
      },
    },
  }],
  ["visual delta measured failure", {
    ...baseShipState,
    verification_mode: "visual",
    evidence_bundle: {
      verification_mode: "visual",
      after: {
        visual_delta: { status: "measured", passed: false },
      },
    },
  }],
  ["interaction missing proof evidence", {
    ...baseShipState,
    verification_mode: "interaction",
  }],
];

for (const [name, state] of shipGateParityCases) {
  assert.deepEqual(
    normalizedShipGateForParity(pythonShipGateReportFacts(state), "python"),
    normalizedShipGateForParity(validateShipGate(state), "ts"),
    `TS/Python ship gate parity failed for ${name}`,
  );
}

const checkpointRequest = {
  repo: "riddledc/example",
  change_request: "Exercise checkpoint contract conformance.",
  engine_state_path: "/tmp/riddle-proof-engine-state.json",
  harness_state_path: "/tmp/riddle-proof-wrapper-state.json",
  ship_mode: "none",
};

const checkpointRunState = {
  version: "riddle-proof.run-state.v1",
  run_id: "run_formal_checkpoint",
  status: "running",
  created_at: "2026-06-12T00:00:00.000Z",
  updated_at: "2026-06-12T00:00:00.000Z",
  request: checkpointRequest,
  iterations: 0,
  events: [],
};

function decisionEnumFor(packet) {
  const decision = packet.response_schema?.properties?.decision;
  return Array.isArray(decision?.enum) ? decision.enum : [];
}

function assertDecisionContract(packet, label) {
  assert.deepEqual(
    [...packet.allowed_decisions].sort(),
    [...decisionEnumFor(packet)].sort(),
    `${label} allowed_decisions must match response_schema decision enum`,
  );
}

const reconPacket = buildStageCheckpointPacket({
  request: checkpointRequest,
  runState: checkpointRunState,
  engineResult: {
    checkpoint: "recon_supervisor_judgment",
    stage: "recon",
    summary: "Recon needs supervising judgment.",
  },
});
assertDecisionContract(reconPacket, "recon checkpoint");
assert.match(reconPacket.packet_id, /^rppkt_[0-9a-f]{24}$/);
assert.ok(reconPacket.response_schema.required.includes("packet_id"), "checkpoint response schema should require packet_id");
assert.equal(reconPacket.response_schema.properties.packet_id.type, "string");
const reconRetryResponse = createCheckpointResponseTemplate(reconPacket, {
  decision: "needs_recon",
  summary: "Retry recon from the supervising checkpoint.",
});
assert.equal(reconRetryResponse.decision, "needs_recon");
assert.equal(reconRetryResponse.packet_id, reconPacket.packet_id, "response templates should echo packet_id");

const defaultStagePacket = buildStageCheckpointPacket({
  request: checkpointRequest,
  runState: checkpointRunState,
  engineResult: {
    checkpoint: "setup_supervisor_judgment",
    stage: "setup",
    summary: "Setup needs supervising judgment.",
  },
});
assertDecisionContract(defaultStagePacket, "default stage checkpoint");
assert.ok(defaultStagePacket.allowed_decisions.includes("retry_stage"));

const shipPacket = buildStageCheckpointPacket({
  request: checkpointRequest,
  runState: checkpointRunState,
  engineResult: {
    checkpoint: "ship_review",
    stage: "ship",
    summary: "Ship needs supervising judgment.",
  },
});
assertDecisionContract(shipPacket, "ship checkpoint");
assert.ok(shipPacket.allowed_decisions.includes("retry_stage"));

const implementPacket = buildStageCheckpointPacket({
  request: checkpointRequest,
  runState: checkpointRunState,
  engineResult: {
    checkpoint: "implement_supervisor_judgment",
    stage: "implement",
    summary: "Implement needs supervising judgment.",
  },
});
assertDecisionContract(implementPacket, "implement checkpoint");

const authorPacket = buildAuthorCheckpointPacket({
  request: checkpointRequest,
  runState: checkpointRunState,
  engineResult: {
    checkpoint: "author_supervisor_judgment",
    summary: "Author needs a proof packet.",
  },
});
assertDecisionContract(authorPacket, "author checkpoint");

const proofAssessmentPacket = buildProofAssessmentCheckpointPacket({
  request: checkpointRequest,
  runState: checkpointRunState,
  engineResult: {
    checkpoint: "verify_supervisor_judgment",
    summary: "Verify needs proof assessment.",
  },
  fullRiddleState: {
    verify_status: "evidence_captured",
    proof_assessment_request: {
      status: "needs_supervising_agent_assessment",
    },
  },
});
assertDecisionContract(proofAssessmentPacket, "proof assessment checkpoint");
assert.match(proofAssessmentPacket.packet_id, /^rppkt_[0-9a-f]{24}$/);

const pendingCheckpointSummary = checkpointSummaryFromState({
  ...checkpointRunState,
  checkpoint_packet: reconPacket,
  checkpoint_history: [{
    ts: "2026-06-12T00:05:00.000Z",
    packet: reconPacket,
  }],
  events: [],
});
assert.equal(pendingCheckpointSummary.pending, true);
assert.equal(pendingCheckpointSummary.packet_count, 1);
assert.equal(pendingCheckpointSummary.response_count, 0);
assert.equal(pendingCheckpointSummary.duplicate_response_count, 0);
assert.equal(pendingCheckpointSummary.rejected_response_count, 0);
assert.equal(pendingCheckpointSummary.ignored_response_count, 0);
assert.equal(pendingCheckpointSummary.latest_decision, undefined);
assert.equal(pendingCheckpointSummary.latest_packet_id, reconPacket.packet_id);
assert.equal(pendingCheckpointSummary.latest_response_packet_id, undefined);
assert.equal(pendingCheckpointSummary.packet_id_matches, undefined);
assert.equal(pendingCheckpointSummary.token_matches, undefined);

const acceptedAdvancingSummary = checkpointSummaryFromState({
  ...checkpointRunState,
  checkpoint_packet: undefined,
  checkpoint_history: [{
    ts: "2026-06-12T00:05:00.000Z",
    packet: reconPacket,
  }, {
    ts: "2026-06-12T00:06:00.000Z",
    response: reconRetryResponse,
  }],
  events: [{
    ts: "2026-06-12T00:06:00.000Z",
    kind: "checkpoint.response.accepted",
  }],
});
assert.equal(acceptedAdvancingSummary.pending, false);
assert.equal(acceptedAdvancingSummary.response_count, 1);
assert.equal(acceptedAdvancingSummary.duplicate_response_count, 0);
assert.equal(acceptedAdvancingSummary.rejected_response_count, 0);
assert.equal(acceptedAdvancingSummary.ignored_response_count, 0);
assert.equal(acceptedAdvancingSummary.latest_decision, "needs_recon");
assert.equal(acceptedAdvancingSummary.latest_packet_id, reconPacket.packet_id);
assert.equal(acceptedAdvancingSummary.latest_response_packet_id, reconPacket.packet_id);
assert.equal(acceptedAdvancingSummary.packet_id_matches, true);
assert.equal(acceptedAdvancingSummary.token_matches, true);

const stalePacketIdResponse = {
  ...reconRetryResponse,
  packet_id: "rppkt_000000000000000000000000",
};
const mismatchedLineageSummary = checkpointSummaryFromState({
  ...checkpointRunState,
  checkpoint_packet: reconPacket,
  checkpoint_history: [{
    ts: "2026-06-12T00:05:00.000Z",
    packet: reconPacket,
  }, {
    ts: "2026-06-12T00:06:00.000Z",
    response: stalePacketIdResponse,
  }],
  events: [{
    ts: "2026-06-12T00:06:00.000Z",
    kind: "checkpoint.response.accepted",
  }],
});
assert.equal(mismatchedLineageSummary.packet_id_matches, false);

const blockedCheckpointResponse = createCheckpointResponseTemplate(reconPacket, {
  decision: "blocked",
  summary: "Keep the recon checkpoint pending for manual inspection.",
  reasons: ["formal lifecycle conformance"],
  created_at: "2026-06-12T00:07:00.000Z",
});
const acceptedBlockingSummary = checkpointSummaryFromState({
  ...checkpointRunState,
  checkpoint_packet: reconPacket,
  checkpoint_history: [{
    ts: "2026-06-12T00:05:00.000Z",
    packet: reconPacket,
  }, {
    ts: "2026-06-12T00:07:00.000Z",
    response: blockedCheckpointResponse,
  }],
  events: [{
    ts: "2026-06-12T00:07:00.000Z",
    kind: "checkpoint.response.accepted",
  }],
});
assert.equal(acceptedBlockingSummary.pending, true);
assert.equal(acceptedBlockingSummary.response_count, 1);
assert.equal(acceptedBlockingSummary.duplicate_response_count, 0);
assert.equal(acceptedBlockingSummary.rejected_response_count, 0);
assert.equal(acceptedBlockingSummary.ignored_response_count, 0);
assert.equal(acceptedBlockingSummary.latest_decision, "blocked");
assert.equal(acceptedBlockingSummary.token_matches, true);

const rejectedCheckpointSummary = checkpointSummaryFromState({
  ...checkpointRunState,
  checkpoint_packet: reconPacket,
  checkpoint_history: [{
    ts: "2026-06-12T00:05:00.000Z",
    packet: reconPacket,
  }],
  events: [{
    ts: "2026-06-12T00:08:00.000Z",
    kind: "checkpoint.response.rejected",
  }],
});
assert.equal(rejectedCheckpointSummary.pending, true);
assert.equal(rejectedCheckpointSummary.response_count, 0);
assert.equal(rejectedCheckpointSummary.duplicate_response_count, 0);
assert.equal(rejectedCheckpointSummary.rejected_response_count, 1);
assert.equal(rejectedCheckpointSummary.ignored_response_count, 0);
assert.equal(rejectedCheckpointSummary.latest_decision, undefined);

const duplicateCheckpointSummary = checkpointSummaryFromState({
  ...checkpointRunState,
  checkpoint_packet: reconPacket,
  checkpoint_history: [{
    ts: "2026-06-12T00:05:00.000Z",
    packet: reconPacket,
  }, {
    ts: "2026-06-12T00:07:00.000Z",
    response: blockedCheckpointResponse,
  }],
  events: [{
    ts: "2026-06-12T00:07:00.000Z",
    kind: "checkpoint.response.accepted",
  }, {
    ts: "2026-06-12T00:08:00.000Z",
    kind: "checkpoint.response.duplicate",
  }],
});
assert.equal(duplicateCheckpointSummary.pending, true);
assert.equal(duplicateCheckpointSummary.response_count, 1);
assert.equal(duplicateCheckpointSummary.duplicate_response_count, 1);
assert.equal(duplicateCheckpointSummary.rejected_response_count, 0);
assert.equal(duplicateCheckpointSummary.ignored_response_count, 0);
assert.equal(duplicateCheckpointSummary.latest_decision, "blocked");

const ignoredCheckpointSummary = checkpointSummaryFromState({
  ...checkpointRunState,
  checkpoint_packet: undefined,
  checkpoint_history: [{
    ts: "2026-06-12T00:09:00.000Z",
    response: blockedCheckpointResponse,
  }],
  events: [{
    ts: "2026-06-12T00:09:00.000Z",
    kind: "checkpoint.response.ignored",
  }],
});
assert.equal(ignoredCheckpointSummary.pending, false);
assert.equal(ignoredCheckpointSummary.response_count, 0);
assert.equal(ignoredCheckpointSummary.duplicate_response_count, 0);
assert.equal(ignoredCheckpointSummary.rejected_response_count, 0);
assert.equal(ignoredCheckpointSummary.ignored_response_count, 1);
assert.equal(ignoredCheckpointSummary.latest_decision, undefined);
assert.equal(isDuplicateCheckpointResponse({
  ...checkpointRunState,
  checkpoint_history: [{
    ts: "2026-06-12T00:09:00.000Z",
    response: blockedCheckpointResponse,
  }],
  events: [{
    ts: "2026-06-12T00:09:00.000Z",
    kind: "checkpoint.response.ignored",
  }],
}, blockedCheckpointResponse), false);
assert.equal(isDuplicateCheckpointResponse({
  ...checkpointRunState,
  checkpoint_history: [{
    ts: "2026-06-12T00:07:00.000Z",
    response: blockedCheckpointResponse,
  }],
  events: [{
    ts: "2026-06-12T00:07:00.000Z",
    kind: "checkpoint.response.accepted",
  }],
}, blockedCheckpointResponse), true);

const lifecycleRequest = {
  repo: "riddledc/example",
  branch: "formal-lifecycle",
  change_request: "Exercise run lifecycle projection semantics.",
  engine_state_path: "/tmp/riddle-proof-lifecycle-engine.json",
  harness_state_path: "/tmp/riddle-proof-lifecycle-wrapper.json",
  ship_mode: "none",
};

const lifecycleStatuses = [
  "running",
  "awaiting_checkpoint",
  "blocked",
  "failed",
  "ready_to_ship",
  "shipped",
  "completed",
];
const protectedFinalStatuses = new Set(["ready_to_ship", "shipped", "completed"]);

for (const status of lifecycleStatuses) {
  const runState = createRunState({
    request: lifecycleRequest,
    run_id: `run_formal_lifecycle_${status}`,
    created_at: "2026-06-12T01:00:00.000Z",
  });
  if (status === "blocked" || status === "failed") {
    runState.blocker = {
      code: `formal_${status}`,
      checkpoint: "verify",
      message: `Formal lifecycle ${status}.`,
    };
  }
  setRunStatus(runState, status, "2026-06-12T01:00:10.000Z");
  assert.equal(Boolean(runState.finalized), protectedFinalStatuses.has(status));
  runState.run_card = createRiddleProofRunCard(runState, { at: "2026-06-12T01:00:10.000Z" });

  assert.equal(runState.run_card.status, status);
  assert.equal(runState.run_card.stop_condition.status, status);
  assert.equal(runState.run_card.stop_condition.terminal, isTerminalStatus(status));
  assert.equal(runState.run_card.stop_condition.monitor_should_continue, !isTerminalStatus(status));

  const runResult = createRunResult({
    state: runState,
    status,
    last_summary: `Lifecycle status ${status}.`,
  });
  assert.equal(runResult.status, status);
  assert.equal(runResult.ok, isSuccessfulStatus(status));
  assert.equal(Boolean(runResult.finalized), protectedFinalStatuses.has(status));
  assert.equal(runResult.run_card.status, status);
  assert.equal(runResult.run_card.stop_condition.status, status);
  assert.equal(runResult.run_card.stop_condition.terminal, isTerminalStatus(status));
}

const heldReadyNoShipState = createRunState({
  request: lifecycleRequest,
  run_id: "run_formal_lifecycle_held_ready_no_ship",
  created_at: "2026-06-12T01:05:00.000Z",
});
setRunStatus(heldReadyNoShipState, "ready_to_ship", "2026-06-12T01:05:10.000Z");
heldReadyNoShipState.merge_recommendation = "ready-to-ship";
heldReadyNoShipState.run_card = createRiddleProofRunCard(heldReadyNoShipState, { at: "2026-06-12T01:05:10.000Z" });
const heldReadyNoShipResult = createRunResult({
  state: heldReadyNoShipState,
  status: "ready_to_ship",
  last_summary: "Ready proof held by ship_mode=none.",
});
assert.equal(isTerminalStatus(heldReadyNoShipResult.status), true);
assert.equal(isSuccessfulStatus(heldReadyNoShipResult.status), true);
assert.equal(heldReadyNoShipResult.ship_held, true);
assert.equal(heldReadyNoShipResult.shipping_disabled, true);
assert.equal(heldReadyNoShipResult.ship_authorized, false);
assert.equal(heldReadyNoShipResult.merge_ready, false);
assert.equal(heldReadyNoShipResult.sync_allowed, false);
assert.equal(heldReadyNoShipResult.result_label, "proof passed; ship held");
assert.equal(heldReadyNoShipResult.merge_recommendation, undefined);
assert.ok(heldReadyNoShipResult.public_state?.prohibited_claims.includes("merge_ready"));
assert.ok(heldReadyNoShipResult.public_state?.prohibited_claims.includes("sync_allowed"));
assert.equal(heldReadyNoShipResult.run_card.stop_condition.ship_held, true);
assert.equal(heldReadyNoShipResult.run_card.stop_condition.shipping_disabled, true);
assert.equal(heldReadyNoShipResult.run_card.stop_condition.ship_authorized, false);
assert.equal(heldReadyNoShipResult.run_card.stop_condition.merge_ready, false);
assert.equal(heldReadyNoShipResult.run_card.stop_condition.sync_allowed, false);
assert.equal(heldReadyNoShipResult.run_card.stop_condition.result_label, "proof passed; ship held");
assert.equal(heldReadyNoShipResult.run_card.stop_condition.merge_recommendation, undefined);
assert.ok(heldReadyNoShipResult.run_card.stop_condition.public_state?.prohibited_claims.includes("merge_ready"));
const heldReadyNoShipSnapshot = createRunStatusSnapshot(heldReadyNoShipState, "2026-06-12T01:05:20.000Z");
assert.equal(heldReadyNoShipSnapshot.ship_held, true);
assert.equal(heldReadyNoShipSnapshot.shipping_disabled, true);
assert.equal(heldReadyNoShipSnapshot.ship_authorized, false);
assert.equal(heldReadyNoShipSnapshot.merge_ready, false);
assert.equal(heldReadyNoShipSnapshot.sync_allowed, false);
assert.equal(heldReadyNoShipSnapshot.result_label, "proof passed; ship held");
assert.ok(heldReadyNoShipSnapshot.public_state?.prohibited_claims.includes("sync_allowed"));
assert.equal(heldReadyNoShipSnapshot.run_card.stop_condition.ship_held, true);
assert.equal(heldReadyNoShipSnapshot.run_card.stop_condition.ship_authorized, false);
assert.equal(heldReadyNoShipSnapshot.run_card.stop_condition.merge_recommendation, undefined);

const handoffReadyRunState = createRunState({
  request: {
    repo: "riddledc/example",
    branch: "proof/public-handoff",
    change_request: "Verify public handoff surface semantics.",
  },
  run_id: "run_formal_lifecycle_handoff_ready_not_authorized",
  created_at: "2026-06-12T01:06:00.000Z",
});
handoffReadyRunState.pr_handoff_policy = {
  state: "proof_complete",
  proof_complete: true,
  merge_ready: true,
  normal_pr_allowed: true,
};
handoffReadyRunState.merge_recommendation = "ready-to-ship";
setRunStatus(handoffReadyRunState, "ready_to_ship", "2026-06-12T01:06:10.000Z");
handoffReadyRunState.run_card = createRiddleProofRunCard(handoffReadyRunState, { at: "2026-06-12T01:06:10.000Z" });
const handoffReadyRunResult = createRunResult({
  state: handoffReadyRunState,
  status: "ready_to_ship",
  last_summary: "Ready for normal handoff.",
});
assert.equal(handoffReadyRunResult.ship_authorized, false);
assert.equal(handoffReadyRunResult.merge_ready, true);
assert.equal(handoffReadyRunResult.sync_allowed, true);
assert.equal(handoffReadyRunResult.result_label, "passed");
assert.equal(handoffReadyRunResult.merge_recommendation, "ready-to-ship");
assert.ok(handoffReadyRunResult.public_state?.prohibited_claims.includes("ship_authorized"));
assert.equal(handoffReadyRunResult.public_state?.prohibited_claims.includes("merge_ready"), false);
assert.equal(handoffReadyRunResult.run_card.stop_condition.ship_authorized, false);
assert.equal(handoffReadyRunResult.run_card.stop_condition.merge_ready, true);
assert.equal(handoffReadyRunResult.run_card.stop_condition.sync_allowed, true);
assert.equal(handoffReadyRunResult.run_card.stop_condition.merge_recommendation, "ready-to-ship");

const staleCardState = createRunState({
  request: lifecycleRequest,
  run_id: "run_formal_lifecycle_stale_card",
  created_at: "2026-06-12T01:10:00.000Z",
});
staleCardState.run_card = createRiddleProofRunCard(staleCardState, { at: "2026-06-12T01:10:00.000Z" });
staleCardState.blocker = {
  code: "formal_blocker",
  checkpoint: "verify",
  message: "Formal lifecycle blocker.",
};
setRunStatus(staleCardState, "blocked", "2026-06-12T01:10:10.000Z");
const staleCardSnapshot = createRunStatusSnapshot(staleCardState, "2026-06-12T01:10:10.000Z");
assert.equal(staleCardSnapshot.status, "blocked");
assert.equal(staleCardSnapshot.is_terminal, true);
assert.equal(staleCardSnapshot.monitor_should_continue, false);
assert.equal(staleCardSnapshot.run_card.status, "blocked");
assert.equal(staleCardSnapshot.run_card.stop_condition.status, "blocked");
assert.equal(staleCardSnapshot.run_card.stop_condition.terminal, true);
assert.equal(staleCardSnapshot.run_card.stop_condition.monitor_should_continue, false);
assert.equal(staleCardSnapshot.run_card.stop_condition.blocker_code, "formal_blocker");

const richCurrentCardState = createRunState({
  request: lifecycleRequest,
  run_id: "run_formal_lifecycle_current_rich_card",
  created_at: "2026-06-12T01:20:00.000Z",
});
richCurrentCardState.run_card = createRiddleProofRunCard(richCurrentCardState, {
  at: "2026-06-12T01:20:00.000Z",
  fullRiddleState: {
    before_cdn: "https://cdn.example.com/formal-before.png",
  },
});
const richCurrentCardSnapshot = createRunStatusSnapshot(richCurrentCardState, "2026-06-12T01:20:10.000Z");
assert.equal(richCurrentCardSnapshot.status, "running");
assert.equal(
  richCurrentCardSnapshot.run_card.latest_evidence.before_url,
  "https://cdn.example.com/formal-before.png",
);

const publicHeldReadyNoShip = summarizeRiddleProofPublicState({
  ok: true,
  status: "ready_to_ship",
  ship_mode: "none",
  ship_authorized: false,
});
assert.equal(publicHeldReadyNoShip.policy_state, "proof_passed_ship_held");
assert.equal(publicHeldReadyNoShip.ship_held, true);
assert.equal(publicHeldReadyNoShip.shipping_disabled, true);
assert.equal(publicHeldReadyNoShip.ship_authorized, false);
assert.equal(publicHeldReadyNoShip.merge_ready, false);
assert.equal(publicHeldReadyNoShip.sync_allowed, false);

const publicNoShipHandoff = summarizeRiddleProofPublicState({
  ok: true,
  status: "ready_to_ship",
  pr_handoff_policy: {
    state: "proof_complete_ship_disabled",
    proof_complete: true,
    shipping_disabled: true,
    ship_mode: "none",
    merge_ready: false,
    normal_pr_allowed: false,
  },
});
assert.equal(publicNoShipHandoff.policy_state, "proof_complete_ship_disabled");
assert.equal(publicNoShipHandoff.shipping_disabled, true);
assert.equal(publicNoShipHandoff.ship_authorized, false);
assert.equal(publicNoShipHandoff.merge_ready, false);
assert.equal(publicNoShipHandoff.sync_allowed, false);

const publicHandoffReady = summarizeRiddleProofPublicState({
  ok: true,
  status: "ready_to_ship",
  pr_handoff_policy: {
    state: "proof_complete",
    proof_complete: true,
    merge_ready: true,
    normal_pr_allowed: true,
  },
});
assert.equal(publicHandoffReady.policy_state, "proof_passed");
assert.equal(publicHandoffReady.ship_authorized, false);
assert.equal(publicHandoffReady.merge_ready, true);
assert.equal(publicHandoffReady.sync_allowed, true);
assert.ok(publicHandoffReady.prohibited_claims.includes("ship_authorized"));
assert.equal(publicHandoffReady.prohibited_claims.includes("merge_ready"), false);
assert.equal(publicHandoffReady.prohibited_claims.includes("sync_allowed"), false);

const publicBlockedStaleCompleted = summarizeRiddleProofPublicState({
  ok: true,
  status: "completed",
  pr_handoff_policy: {
    state: "proof_review_required",
    proof_complete: false,
    merge_ready: true,
    normal_pr_allowed: true,
  },
});
assert.equal(publicBlockedStaleCompleted.policy_state, "proof_blocked");
assert.equal(publicBlockedStaleCompleted.proof_passed, false);
assert.equal(publicBlockedStaleCompleted.merge_ready, false);
assert.equal(publicBlockedStaleCompleted.sync_allowed, false);
assert.ok(publicBlockedStaleCompleted.prohibited_claims.includes("proof_passed"));
assert.ok(publicBlockedStaleCompleted.prohibited_claims.includes("ready_to_ship"));

const publicShipped = summarizeRiddleProofPublicState({
  ok: true,
  status: "shipped",
  ship_authorized: true,
});
assert.equal(publicShipped.policy_state, "ship_authorized");
assert.equal(publicShipped.ship_authorized, true);
assert.equal(publicShipped.merge_ready, true);
assert.equal(publicShipped.sync_allowed, true);

const publicCheckpointAudit = summarizeRiddleProofPublicState({
  ok: true,
  status: "ready_to_ship",
  pr_handoff_policy: {
    state: "proof_complete",
    proof_complete: true,
    merge_ready: true,
    normal_pr_allowed: true,
  },
  checkpoint_summary: {
    pending: false,
    response_count: 1,
    rejected_response_count: 2,
    ignored_response_count: 1,
    duplicate_response_count: 1,
  },
});
assert.equal(publicCheckpointAudit.checkpoint_summary?.audit_disclosure_required, true);
assert.ok(publicCheckpointAudit.required_disclosures.includes("checkpoint_audit_counters"));
assert.ok(publicCheckpointAudit.prohibited_claims.includes("all_checkpoint_responses_accepted"));

const publicConsumerRunResponse = {
  proofResult: {
    status: "completed",
    outputs: [],
  },
};
const publicConsumerHeldMarkdown = buildRiddleProofPrCommentMarkdown({
  runResponse: publicConsumerRunResponse,
  result: {
    ok: true,
    status: "ready_to_ship",
    ship_mode: "none",
    ship_authorized: false,
    merge_recommendation: "ready-to-ship",
    checkpoint_summary: {
      pending: false,
      response_count: 1,
      rejected_response_count: 1,
    },
  },
});
assert.match(publicConsumerHeldMarkdown, /\*\*Result:\*\* proof passed; ship held/);
assert.match(publicConsumerHeldMarkdown, /\*\*Handoff:\*\* merge_ready=false, sync_allowed=false/);
assert.match(publicConsumerHeldMarkdown, /\*\*Checkpoints:\*\* 1 accepted \/ 1 rejected \/ 0 ignored/);
assert.doesNotMatch(publicConsumerHeldMarkdown, /\*\*Merge recommendation:\*\* ready-to-ship/);

const publicConsumerReadyMarkdown = buildRiddleProofPrCommentMarkdown({
  runResponse: publicConsumerRunResponse,
  result: {
    ok: true,
    status: "ready_to_ship",
    pr_handoff_policy: {
      state: "proof_complete",
      proof_complete: true,
      merge_ready: true,
      normal_pr_allowed: true,
    },
    merge_recommendation: "ready-to-ship",
  },
});
assert.match(publicConsumerReadyMarkdown, /\*\*Result:\*\* passed/);
assert.match(publicConsumerReadyMarkdown, /\*\*Handoff:\*\* merge_ready=true, sync_allowed=true/);
assert.match(publicConsumerReadyMarkdown, /\*\*Merge recommendation:\*\* ready-to-ship/);
assert.doesNotMatch(publicConsumerReadyMarkdown, /authorized=true/);

const publicConsumerBlockedMarkdown = buildRiddleProofPrCommentMarkdown({
  runResponse: publicConsumerRunResponse,
  result: {
    ok: true,
    status: "completed",
    pr_handoff_policy: {
      state: "proof_review_required",
      proof_complete: false,
      merge_ready: true,
      normal_pr_allowed: true,
    },
    merge_recommendation: "ready-to-ship",
  },
});
assert.match(publicConsumerBlockedMarkdown, /\*\*Result:\*\* blocked/);
assert.match(publicConsumerBlockedMarkdown, /\*\*Handoff:\*\* merge_ready=false, sync_allowed=false/);
assert.doesNotMatch(publicConsumerBlockedMarkdown, /\*\*Merge recommendation:\*\* ready-to-ship/);

console.log(JSON.stringify({
  ok: true,
  suite: "riddle-proof.formal-conformance",
  checks: {
    profileArtifactManifest: true,
    shipGateBaselines: true,
    shipGateVerify: true,
    shipGateSupervisor: true,
    shipGateDecision: true,
    shipGateHardBlockers: true,
    proofAssessmentStageConsistency: true,
    shipGateRuntimeParity: true,
    checkpointDecisionContracts: true,
    checkpointPacketLineage: true,
    checkpointLifecycleSummary: true,
    checkpointRejectedIgnoredAuditCounters: true,
    checkpointIgnoredSummary: true,
    runCardProjection: true,
    runResultStatusProjection: true,
    heldReadyNoShipSemantics: true,
    staleRunCardSnapshotRefresh: true,
    currentRunCardSnapshotPreservesRichProjection: true,
    publicStateProjection: true,
    publicStateHandoffReadiness: true,
    publicStateAuditDisclosure: true,
    publicStateConsumerConformance: true,
    publicStateRunSurfaceConformance: true,
  },
}));
