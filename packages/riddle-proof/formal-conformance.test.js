import assert from "node:assert/strict";

import {
  assessRiddleProofProfileEvidence,
  normalizeRiddleProofProfile,
} from "./dist/profile.js";
import {
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
  buildAuthorCheckpointPacket,
  buildProofAssessmentCheckpointPacket,
  buildStageCheckpointPacket,
  checkpointSummaryFromState,
  createCheckpointResponseTemplate,
} from "./dist/checkpoint.js";

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
const reconRetryResponse = createCheckpointResponseTemplate(reconPacket, {
  decision: "needs_recon",
  summary: "Retry recon from the supervising checkpoint.",
});
assert.equal(reconRetryResponse.decision, "needs_recon");

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
assert.equal(pendingCheckpointSummary.latest_decision, undefined);
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
assert.equal(acceptedAdvancingSummary.latest_decision, "needs_recon");
assert.equal(acceptedAdvancingSummary.token_matches, true);

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
assert.equal(duplicateCheckpointSummary.latest_decision, "blocked");

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
  assert.equal(runResult.run_card.status, status);
  assert.equal(runResult.run_card.stop_condition.status, status);
  assert.equal(runResult.run_card.stop_condition.terminal, isTerminalStatus(status));
}

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
    checkpointDecisionContracts: true,
    checkpointLifecycleSummary: true,
    runCardProjection: true,
    runResultStatusProjection: true,
    staleRunCardSnapshotRefresh: true,
    currentRunCardSnapshotPreservesRichProjection: true,
  },
}));
