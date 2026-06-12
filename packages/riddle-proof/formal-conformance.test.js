import assert from "node:assert/strict";

import {
  assessRiddleProofProfileEvidence,
  normalizeRiddleProofProfile,
} from "./dist/profile.js";
import {
  validateShipGate,
} from "./dist/proof-run-core.js";

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
  },
}));
