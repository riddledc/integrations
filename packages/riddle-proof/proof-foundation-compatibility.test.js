import assert from "node:assert/strict";
import { createRequire } from "node:module";

import * as coreEvidenceTrust from "@riddledc/riddle-proof-core/evidence-trust-root";
import * as corePacket from "@riddledc/riddle-proof-core/packet";
import * as coreProfile from "@riddledc/riddle-proof-core/profile";
import * as coreTrust from "@riddledc/riddle-proof-core/rule-trust-root";
import * as facadeRoot from "./dist/index.js";
import * as facadeEvidenceTrust from "./dist/evidence-trust-root.js";
import * as facadePacket from "./dist/packet.js";
import * as facadeProfile from "./dist/profile.js";
import * as facadeTrust from "./dist/rule-trust-root.js";

for (const [name, coreValue, facadeValue, rootValue] of [
  ["normalizeRiddleProofProfile", coreProfile.normalizeRiddleProofProfile, facadeProfile.normalizeRiddleProofProfile, facadeRoot.normalizeRiddleProofProfile],
  ["assessRiddleProofProfileEvidence", coreProfile.assessRiddleProofProfileEvidence, facadeProfile.assessRiddleProofProfileEvidence, facadeRoot.assessRiddleProofProfileEvidence],
  ["createRiddleProofRuleTrustRoot", coreTrust.createRiddleProofRuleTrustRoot, facadeTrust.createRiddleProofRuleTrustRoot, facadeRoot.createRiddleProofRuleTrustRoot],
  ["createRiddleProofEvidenceTrustRoot", coreEvidenceTrust.createRiddleProofEvidenceTrustRoot, facadeEvidenceTrust.createRiddleProofEvidenceTrustRoot, facadeRoot.createRiddleProofEvidenceTrustRoot],
  ["validateRiddleProofEvidenceObservationSchema", coreEvidenceTrust.validateRiddleProofEvidenceObservationSchema, facadeEvidenceTrust.validateRiddleProofEvidenceObservationSchema, facadeRoot.validateRiddleProofEvidenceObservationSchema],
  ["digestRiddleProofPrivatePacketBytes", corePacket.digestRiddleProofPrivatePacketBytes, facadePacket.digestRiddleProofPrivatePacketBytes, facadeRoot.digestRiddleProofPrivatePacketBytes],
  ["verifyRiddleProofPacketReceipt", corePacket.verifyRiddleProofPacketReceipt, facadePacket.verifyRiddleProofPacketReceipt, facadeRoot.verifyRiddleProofPacketReceipt],
]) {
  assert.equal(facadeValue, coreValue, `${name} ESM facade must preserve core identity`);
  assert.equal(rootValue, coreValue, `${name} ESM root must preserve core identity`);
}

for (const name of [
  "RIDDLE_PROOF_EVIDENCE_OBSERVATION_SCHEMA_MAX_ARRAY_ITEMS",
  "RIDDLE_PROOF_EVIDENCE_OBSERVATION_SCHEMA_MAX_DEPTH",
  "RIDDLE_PROOF_EVIDENCE_OBSERVATION_SCHEMA_MAX_NODES",
  "RIDDLE_PROOF_EVIDENCE_OBSERVATION_SCHEMA_MAX_PROPERTIES",
]) {
  assert.equal(facadeEvidenceTrust[name], coreEvidenceTrust[name], `${name} ESM facade must preserve core value`);
  assert.equal(facadeRoot[name], coreEvidenceTrust[name], `${name} ESM root must preserve core value`);
}

assert.equal(typeof facadeProfile.preflightRiddleProofProfileHttpStatusChecks, "function");
assert.equal(typeof facadeProfile.buildRiddleProofProfileScript, "function");
assert.equal("preflightRiddleProofProfileHttpStatusChecks" in coreProfile, false);
assert.equal("buildRiddleProofProfileScript" in coreProfile, false);

const require = createRequire(import.meta.url);
const facadeCjs = require("./dist/index.cjs");
const coreEvidenceTrustCjs = require("@riddledc/riddle-proof-core/evidence-trust-root");
for (const [name, coreValue] of [
  ["normalizeRiddleProofProfile", require("@riddledc/riddle-proof-core/profile").normalizeRiddleProofProfile],
  ["assessRiddleProofProfileEvidence", require("@riddledc/riddle-proof-core/profile").assessRiddleProofProfileEvidence],
  ["createRiddleProofRuleTrustRoot", require("@riddledc/riddle-proof-core/rule-trust-root").createRiddleProofRuleTrustRoot],
  ["createRiddleProofEvidenceTrustRoot", require("@riddledc/riddle-proof-core/evidence-trust-root").createRiddleProofEvidenceTrustRoot],
  ["validateRiddleProofEvidenceObservationSchema", require("@riddledc/riddle-proof-core/evidence-trust-root").validateRiddleProofEvidenceObservationSchema],
  ["digestRiddleProofPrivatePacketBytes", require("@riddledc/riddle-proof-core/packet").digestRiddleProofPrivatePacketBytes],
  ["verifyRiddleProofPacketReceipt", require("@riddledc/riddle-proof-core/packet").verifyRiddleProofPacketReceipt],
]) {
  assert.equal(facadeCjs[name], coreValue, `${name} CJS facade must preserve core subpath identity`);
}
for (const name of [
  "RIDDLE_PROOF_EVIDENCE_OBSERVATION_SCHEMA_MAX_ARRAY_ITEMS",
  "RIDDLE_PROOF_EVIDENCE_OBSERVATION_SCHEMA_MAX_DEPTH",
  "RIDDLE_PROOF_EVIDENCE_OBSERVATION_SCHEMA_MAX_NODES",
  "RIDDLE_PROOF_EVIDENCE_OBSERVATION_SCHEMA_MAX_PROPERTIES",
]) {
  assert.equal(facadeCjs[name], coreEvidenceTrustCjs[name], `${name} CJS facade must preserve core value`);
}

console.log("riddle proof foundation compatibility tests passed", {
  pure_profile_owned_by_core: true,
  capability_operations_outside_core: true,
  protocol_identity_preserved: true,
});
