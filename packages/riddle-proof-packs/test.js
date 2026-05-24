import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  getPackEnabledRiddleProofPackProfiles,
  getRiddleProofPackProfile,
  listRiddleProofPackProfiles,
  getRiddleProofProfilesByPackId,
  getRiddleProofPackProfileManifest,
  instantiateRiddleProofProfile,
  RIDDLE_PROOF_PACK_MANIFEST,
  RIDDLE_PROOF_PACK_PROFILES,
} from "./dist/index.js";

assert.equal(typeof getRiddleProofPackProfile, "function");
assert.equal(typeof listRiddleProofPackProfiles, "function");
assert.equal(typeof getRiddleProofProfilesByPackId, "function");
assert.equal(typeof getPackEnabledRiddleProofPackProfiles, "function");
assert.equal(typeof getRiddleProofPackProfileManifest, "function");
assert.equal(typeof instantiateRiddleProofProfile, "function");

const pageContent = getRiddleProofPackProfile("page-content-basic");
assert.ok(pageContent, "page-content-basic profile should be present");
assert.equal(pageContent?.name, "page-content-basic");
assert.equal(RIDDLE_PROOF_PACK_PROFILES["page-content-basic"]?.name, "page-content-basic");

const allProfiles = listRiddleProofPackProfiles();
assert.equal(typeof allProfiles.length, "number");
assert.ok(allProfiles.length >= 10);
assert.ok(
  allProfiles.some((entry) => entry.name === "neon-step-sequencer-fast-mix-health"),
  "neon-step-sequencer fast mix-health profile should be present",
);
assert.ok(
  allProfiles.some((entry) => entry.sourcePath === "packs/neon-step-sequencer/profiles/mix-change-before-after.json"),
  "nested Neon profile source paths should be preserved",
);

const hygienePackProfiles = getRiddleProofProfilesByPackId("state_hygiene");
assert.equal(hygienePackProfiles.length, 1);
assert.equal(hygienePackProfiles[0]?.name, "spa-route-exit-state-hygiene");

const packEnabledProfiles = getPackEnabledRiddleProofPackProfiles();
assert.ok(packEnabledProfiles.length >= 1);
assert.ok(RIDDLE_PROOF_PACK_MANIFEST.length >= allProfiles.length);

const neonProfiles = getRiddleProofProfilesByPackId("neon_step_sequencer");
assert.equal(neonProfiles.length, 7);
assert.ok(neonProfiles.every((entry) => entry.packPublicName === "Neon Step Sequencer Pack"));

const authManifest = getRiddleProofPackProfileManifest("auth-smoke");
assert.ok(authManifest, "auth-smoke manifest should be resolvable");
assert.equal(authManifest?.name, "auth-smoke");

const neonFastProfile = instantiateRiddleProofProfile("neon-step-sequencer-fast-mix-health", {
  url: "http://127.0.0.1:5173",
});
assert.equal(neonFastProfile.target.url, "http://127.0.0.1:5173");
assert.equal(neonFastProfile.metadata?.evidence_role_pattern, "current_target");

const neonExampleRuns = [
  ["run-001-fast-mix-health", "lilarcade-neon-fast-mix-health"],
  ["run-002-mix-change", "lilarcade-neon-mix-change-before-after"],
  ["run-003-full-matrix", "lilarcade-neon-full-mix-health-matrix"],
];
for (const [runId, profileName] of neonExampleRuns) {
  const runDir = `packs/neon-step-sequencer/examples/${runId}`;
  assert.ok(existsSync(`${runDir}/summary.md`), `${runId} should include a human summary`);
  const profileResult = JSON.parse(readFileSync(`${runDir}/profile-result.json`, "utf8"));
  assert.equal(profileResult.profile_name, profileName);
  assert.equal(profileResult.status, "passed");
  assert.ok(profileResult.evidence?.viewports?.length >= 1);
}

const mobileProfile = instantiateRiddleProofProfile("mobile-layout-smoke", {
  url: "https://example.com",
  route: "/",
  target: { wait_for_selector: "#app" },
});
assert.equal(mobileProfile.target.url, "https://example.com");
assert.equal(mobileProfile.target.route, "/");
