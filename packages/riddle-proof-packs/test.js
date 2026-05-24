import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  getPackEnabledRiddleProofPackProfiles,
  getRiddleProofPackProfile,
  listRiddleProofPackProfiles,
  getRiddleProofProfilesByPackId,
  getRiddleProofPackProfileManifest,
  instantiateRiddleProofProfile,
  createHumanReviewPacketArtifacts,
  findHumanReviewPacket,
  formatHumanReviewPacketMarkdown,
  requireHumanReviewPacket,
  RIDDLE_PROOF_PACK_MANIFEST,
  RIDDLE_PROOF_PACK_PROFILES,
} from "./dist/index.js";

assert.equal(typeof getRiddleProofPackProfile, "function");
assert.equal(typeof listRiddleProofPackProfiles, "function");
assert.equal(typeof getRiddleProofProfilesByPackId, "function");
assert.equal(typeof getPackEnabledRiddleProofPackProfiles, "function");
assert.equal(typeof getRiddleProofPackProfileManifest, "function");
assert.equal(typeof instantiateRiddleProofProfile, "function");
assert.equal(typeof findHumanReviewPacket, "function");
assert.equal(typeof requireHumanReviewPacket, "function");
assert.equal(typeof formatHumanReviewPacketMarkdown, "function");
assert.equal(typeof createHumanReviewPacketArtifacts, "function");

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
assert.equal(neonProfiles.length, 8);
assert.ok(neonProfiles.every((entry) => entry.packPublicName === "Neon Step Sequencer Pack"));
assert.ok(
  neonProfiles.some((entry) => entry.name === "neon-step-sequencer-ratchet-loop-mix-level-search"),
  "Neon ratchet-loop profile should be present",
);

const authManifest = getRiddleProofPackProfileManifest("auth-smoke");
assert.ok(authManifest, "auth-smoke manifest should be resolvable");
assert.equal(authManifest?.name, "auth-smoke");

const neonFastProfile = instantiateRiddleProofProfile("neon-step-sequencer-fast-mix-health", {
  url: "http://127.0.0.1:5173",
});
assert.equal(neonFastProfile.target.url, "http://127.0.0.1:5173");
assert.equal(neonFastProfile.metadata?.evidence_role_pattern, "current_target");

const neonRatchetLoopProfile = instantiateRiddleProofProfile(
  "neon-step-sequencer-ratchet-loop-mix-level-search",
  { url: "http://127.0.0.1:5173" },
);
assert.equal(neonRatchetLoopProfile.metadata?.evidence_role_pattern, "interaction_snapshots");
assert.equal(neonRatchetLoopProfile.target.setup_actions?.[2]?.type, "window_call");
const neonRatchetLoopArgs = neonRatchetLoopProfile.target.setup_actions?.[2]?.args?.[0];
assert.ok(neonRatchetLoopArgs && typeof neonRatchetLoopArgs === "object");
assert.equal(Object.hasOwn(neonRatchetLoopArgs, "minImprovement"), false);
assert.equal(neonRatchetLoopArgs.applyBest, false);
assert.equal(neonRatchetLoopArgs.intent, "turn the chord part down a little");
const neonRatchetLoopSummaryPaths = neonRatchetLoopProfile.target.setup_actions?.[2]?.return_summary_fields?.map((entry) => entry.path) ?? [];
assert.ok(neonRatchetLoopSummaryPaths.includes("humanReviewPacket.status"));
assert.ok(neonRatchetLoopSummaryPaths.includes("humanReviewPacket.ranking.role"));
assert.equal(neonRatchetLoopProfile.target.setup_actions?.[4]?.path, "__neonMixProof.ratchetLoop.humanReviewPacket.kind");
assert.equal(neonRatchetLoopProfile.target.setup_actions?.[5]?.path, "__neonMixProof.ratchetLoop.humanReviewPacket.ranking.role");
assert.equal(neonRatchetLoopProfile.target.setup_actions?.[6]?.path, "__neonMixProof.ratchetLoop.humanReviewPacket.request.candidateActionsAreTransient");

const neonExplorationProfile = instantiateRiddleProofProfile(
  "neon-step-sequencer-explore-songs-and-mixes",
  { url: "http://127.0.0.1:5173" },
);
assert.equal(neonExplorationProfile.metadata?.evidence_role_pattern, "current_target");
assert.equal(neonExplorationProfile.target.setup_actions?.[2]?.type, "window_call");
assert.equal(neonExplorationProfile.target.setup_actions?.[2]?.path, "__NEON_MIX_PROOF__.runExplorationSweep");
const neonExplorationArgs = neonExplorationProfile.target.setup_actions?.[2]?.args?.[0];
assert.ok(neonExplorationArgs && typeof neonExplorationArgs === "object");
assert.equal(neonExplorationArgs.maxSongs, 4);
assert.equal(neonExplorationArgs.maxPartsPerSong, 2);

const neonExampleRuns = [
  ["run-001-fast-mix-health", "lilarcade-neon-fast-mix-health"],
  ["run-002-mix-change", "lilarcade-neon-mix-change-before-after"],
  ["run-003-full-matrix", "lilarcade-neon-full-mix-health-matrix"],
  ["run-004-ratchet-loop-mix-level-search", "lilarcade-neon-ratchet-loop-mix-level-search"],
  ["run-005-explore-songs-and-mixes-final", "neon-step-sequencer-explore-songs-and-mixes"],
  ["run-006-ratchet-loop-human-review-packet", "lilarcade-neon-ratchet-loop-mix-level-search"],
];
for (const [runId, profileName] of neonExampleRuns) {
  const runDir = `packs/neon-step-sequencer/examples/${runId}`;
  assert.ok(existsSync(`${runDir}/summary.md`), `${runId} should include a human summary`);
  const profileResult = JSON.parse(readFileSync(`${runDir}/profile-result.json`, "utf8"));
  assert.equal(profileResult.profile_name, profileName);
  assert.equal(profileResult.status, "passed");
  assert.ok(profileResult.evidence?.viewports?.length >= 1);
}

const neonExplorationRun = JSON.parse(
  readFileSync("packs/neon-step-sequencer/examples/run-005-explore-songs-and-mixes-final/proof.json", "utf8"),
);
const explorationSetupCheck = neonExplorationRun.checks.find((check) => check.type === "setup_actions_succeeded");
const explorationReturn = explorationSetupCheck?.evidence?.setup_summary?.viewports?.[0]?.window_call?.[0]?.returned;
assert.equal(explorationReturn?.proofKind, "neon-exploration-sweep");
assert.equal(explorationReturn?.status, "passed");
assert.equal(explorationReturn?.entryCount, 8);
assert.equal(explorationReturn?.findingCount, 0);
assert.ok(existsSync("packs/neon-step-sequencer/examples/run-005-explore-songs-and-mixes-final/screenshots/neon-step-sequencer-explore-songs-and-mixes-desktop.png"));

const neonReviewPacketRun = JSON.parse(
  readFileSync("packs/neon-step-sequencer/examples/run-006-ratchet-loop-human-review-packet/proof.json", "utf8"),
);
const reviewPacketSetupCheck = neonReviewPacketRun.checks.find((check) => check.type === "setup_actions_succeeded");
const reviewPacketReturn = reviewPacketSetupCheck?.evidence?.setup_summary?.viewports?.[0]?.window_call?.[0]?.returned;
assert.equal(reviewPacketReturn?.status, "claim_candidate_supported");
assert.equal(reviewPacketReturn?.humanReviewPacket?.kind, "human_review_packet");
assert.equal(reviewPacketReturn?.humanReviewPacket?.status, "candidate_ready_for_listening_review");
assert.equal(reviewPacketReturn?.humanReviewPacket?.recommendation?.candidate?.action?.track, "chord");
assert.equal(reviewPacketReturn?.humanReviewPacket?.recommendation?.candidate?.action?.delta, -0.1);
assert.equal(reviewPacketReturn?.humanReviewPacket?.ranking?.role, "review_order_only");
assert.equal(reviewPacketReturn?.humanReviewPacket?.guardrails?.stateRestoredAfterLoop, true);
assert.equal(reviewPacketReturn?.humanReviewPacket?.guardrails?.noPermanentEditUnlessApplyBest, true);
assert.ok(reviewPacketReturn?.humanReviewPacket?.caveats?.some((caveat) => caveat.includes("does not prove subjective mix quality")));
assert.ok(existsSync("packs/neon-step-sequencer/examples/run-006-ratchet-loop-human-review-packet/screenshots/lilarcade-neon-ratchet-loop-mix-level-search-desktop.png"));

const extractedReviewPacket = findHumanReviewPacket(neonReviewPacketRun);
assert.equal(extractedReviewPacket?.kind, "human_review_packet");
assert.equal(extractedReviewPacket?.recommendation?.candidate?.label, "chord -0.10");
assert.equal(requireHumanReviewPacket(neonReviewPacketRun), extractedReviewPacket);
const reviewPacketMarkdown = formatHumanReviewPacketMarkdown(extractedReviewPacket, {
  title: "Neon Human Review Packet",
});
assert.match(reviewPacketMarkdown, /^# Neon Human Review Packet/u);
assert.match(reviewPacketMarkdown, /candidate_ready_for_listening_review/u);
assert.match(reviewPacketMarkdown, /review_order_only/u);
assert.match(reviewPacketMarkdown, /musical taste still requires listening review/u);
assert.match(reviewPacketMarkdown, /does not prove subjective mix quality/u);
assert.doesNotMatch(reviewPacketMarkdown, /automatically better/u);
const reviewPacketArtifacts = createHumanReviewPacketArtifacts(neonReviewPacketRun, {
  title: "Neon Human Review Packet",
});
assert.equal(JSON.parse(reviewPacketArtifacts.json).kind, "human_review_packet");
assert.equal(reviewPacketArtifacts.packet, extractedReviewPacket);
assert.equal(reviewPacketArtifacts.markdown, reviewPacketMarkdown);
assert.throws(() => requireHumanReviewPacket({ ok: true }), /No human_review_packet found/u);
assert.ok(existsSync("packs/neon-step-sequencer/examples/run-006-ratchet-loop-human-review-packet/human-review-packet.json"));
assert.ok(existsSync("packs/neon-step-sequencer/examples/run-006-ratchet-loop-human-review-packet/human-review-packet.md"));
const bundledReviewPacketMarkdown = readFileSync(
  "packs/neon-step-sequencer/examples/run-006-ratchet-loop-human-review-packet/human-review-packet.md",
  "utf8",
);
assert.equal(bundledReviewPacketMarkdown, reviewPacketMarkdown);

const mobileProfile = instantiateRiddleProofProfile("mobile-layout-smoke", {
  url: "https://example.com",
  route: "/",
  target: { wait_for_selector: "#app" },
});
assert.equal(mobileProfile.target.url, "https://example.com");
assert.equal(mobileProfile.target.route, "/");
