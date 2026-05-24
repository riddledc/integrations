import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  getPackEnabledRiddleProofPackProfiles,
  getRiddleProofPackProfile,
  listRiddleProofPackProfiles,
  getRiddleProofProfilesByPackId,
  getRiddleProofPackProfileManifest,
  instantiateRiddleProofProfile,
  createDurableCandidatePatchPlan,
  createDurableCandidatePatchPlanArtifacts,
  formatDurableCandidatePatchPlanMarkdown,
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
assert.equal(typeof createDurableCandidatePatchPlan, "function");
assert.equal(typeof createDurableCandidatePatchPlanArtifacts, "function");
assert.equal(typeof formatDurableCandidatePatchPlanMarkdown, "function");
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
assert.equal(neonProfiles.length, 9);
assert.ok(neonProfiles.every((entry) => entry.packPublicName === "Neon Step Sequencer Pack"));
assert.ok(
  neonProfiles.some((entry) => entry.name === "neon-step-sequencer-ratchet-loop-mix-level-search"),
  "Neon ratchet-loop profile should be present",
);
assert.ok(
  neonProfiles.some((entry) => entry.name === "neon-step-sequencer-ratchet-loop-approved-candidate"),
  "Neon approved-candidate profile should be present",
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

const neonApprovedCandidateProfile = instantiateRiddleProofProfile(
  "neon-step-sequencer-ratchet-loop-approved-candidate",
  { url: "http://127.0.0.1:5173" },
);
assert.equal(neonApprovedCandidateProfile.metadata?.evidence_role_pattern, "interaction_snapshots");
assert.equal(neonApprovedCandidateProfile.target.setup_actions?.[2]?.type, "window_call");
const neonApprovedCandidateArgs = neonApprovedCandidateProfile.target.setup_actions?.[2]?.args?.[0];
assert.ok(neonApprovedCandidateArgs && typeof neonApprovedCandidateArgs === "object");
assert.equal(neonApprovedCandidateArgs.applyBest, true);
assert.equal(neonApprovedCandidateArgs.approval?.mode, "mixing_canon_surrogate");
assert.equal(neonApprovedCandidateProfile.target.setup_actions?.[4]?.path, "__neonMixProof.approvedCandidateLoop.appliedCandidateReceipt.ok");
assert.equal(neonApprovedCandidateProfile.target.setup_actions?.[5]?.path, "__neonMixProof.approvedCandidateLoop.humanReviewPacket.status");
assert.equal(neonApprovedCandidateProfile.target.setup_actions?.[7]?.path, "__neonMixProof.approvedCandidateLoop.humanReviewPacket.guardrails.approvedCandidateApplied");

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

const neonPlaybackProfile = instantiateRiddleProofProfile(
  "neon-step-sequencer-playback-sync",
  { url: "http://127.0.0.1:5173" },
);
assert.equal(neonPlaybackProfile.metadata?.evidence_role_pattern, "interaction_snapshots");
const playbackActions = neonPlaybackProfile.target.setup_actions ?? [];
assert.ok(
  playbackActions.some((action) => action.type === "wait_for_text" && action.selector === "button.drum-play" && action.text === "Stop"),
  "playback-sync profile should wait for the visible Stop state after clicking Play",
);
assert.ok(
  playbackActions.some((action) => action.type === "assert_window_value" && action.path === "__neonProof.postPlayback.isPlaying" && action.expected_value === true),
  "playback-sync profile should assert post-action playback is running",
);
assert.ok(
  playbackActions.some((action) => action.type === "assert_window_value" && action.path === "__neonProof.postPlayback.movedForward" && action.expected_value === true),
  "playback-sync profile should assert the trainer playhead moved after the click",
);
const playbackPostCapture = playbackActions.find((action) => action.type === "window_eval" && action.label === "capture-post-playback-state");
assert.ok(playbackPostCapture?.script?.includes("api?.getPlaybackState?.()"));
assert.ok(playbackPostCapture?.script?.includes("raw?.trainer||raw||{}"));
assert.ok(playbackPostCapture?.return_summary_fields?.some((field) => field.path === "movedForward"));

const neonExampleRuns = [
  ["run-001-fast-mix-health", "lilarcade-neon-fast-mix-health"],
  ["run-002-mix-change", "lilarcade-neon-mix-change-before-after"],
  ["run-003-full-matrix", "lilarcade-neon-full-mix-health-matrix"],
  ["run-004-ratchet-loop-mix-level-search", "lilarcade-neon-ratchet-loop-mix-level-search"],
  ["run-005-explore-songs-and-mixes-final", "neon-step-sequencer-explore-songs-and-mixes"],
  ["run-006-ratchet-loop-human-review-packet", "lilarcade-neon-ratchet-loop-mix-level-search"],
  ["run-007-approved-candidate-applied", "lilarcade-neon-ratchet-loop-approved-candidate"],
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

const neonApprovedCandidateRun = JSON.parse(
  readFileSync("packs/neon-step-sequencer/examples/run-007-approved-candidate-applied/proof.json", "utf8"),
);
const approvedCandidateSetupCheck = neonApprovedCandidateRun.checks.find((check) => check.type === "setup_actions_succeeded");
const approvedCandidateReturn = approvedCandidateSetupCheck?.evidence?.setup_summary?.viewports?.[0]?.window_call?.[0]?.returned;
assert.equal(approvedCandidateReturn?.status, "claim_candidate_supported");
assert.equal(approvedCandidateReturn?.applyBest, true);
assert.equal(approvedCandidateReturn?.appliedCandidateReceipt?.ok, true);
assert.equal(approvedCandidateReturn?.appliedCandidateReceipt?.candidate?.action?.track, "chord");
assert.equal(approvedCandidateReturn?.appliedCandidateReceipt?.observedLevel, 0.28);
assert.equal(approvedCandidateReturn?.humanReviewPacket?.status, "candidate_applied_for_listening_review");
assert.equal(approvedCandidateReturn?.humanReviewPacket?.request?.approval?.mode, "mixing_canon_surrogate");
assert.equal(approvedCandidateReturn?.humanReviewPacket?.request?.candidateActionsAreTransient, false);
assert.equal(approvedCandidateReturn?.humanReviewPacket?.guardrails?.approvedCandidateApplied, true);
assert.equal(approvedCandidateReturn?.humanReviewPacket?.ranking?.role, "review_order_only");
assert.ok(approvedCandidateReturn?.humanReviewPacket?.caveats?.some((caveat) => caveat.includes("does not prove subjective mix quality")));
assert.ok(existsSync("packs/neon-step-sequencer/examples/run-007-approved-candidate-applied/screenshots/lilarcade-neon-ratchet-loop-approved-candidate-desktop.png"));

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

const extractedAppliedPacket = findHumanReviewPacket(neonApprovedCandidateRun);
assert.equal(extractedAppliedPacket?.kind, "human_review_packet");
assert.equal(extractedAppliedPacket?.status, "candidate_applied_for_listening_review");
const appliedPacketMarkdown = formatHumanReviewPacketMarkdown(extractedAppliedPacket, {
  title: "Neon Human Review Packet",
});
assert.match(appliedPacketMarkdown, /candidate_applied_for_listening_review/u);
assert.match(appliedPacketMarkdown, /approved_candidate_applied: `true`/u);
assert.match(appliedPacketMarkdown, /approval_mode: `mixing_canon_surrogate`/u);
assert.match(appliedPacketMarkdown, /musical taste still requires listening review/u);
assert.doesNotMatch(appliedPacketMarkdown, /automatically better/u);
const bundledAppliedPacketMarkdown = readFileSync(
  "packs/neon-step-sequencer/examples/run-007-approved-candidate-applied/human-review-packet.md",
  "utf8",
);
assert.equal(bundledAppliedPacketMarkdown, appliedPacketMarkdown);

const durablePlan = createDurableCandidatePatchPlan(extractedAppliedPacket, {
  sourceFile: "src/Games/songs/neon-approved-mix-overrides.json",
  requireMixProfileId: true,
});
assert.equal(durablePlan.ok, true);
assert.equal(durablePlan.status, "ready_for_durable_patch");
assert.equal(durablePlan.target.label, "Monkberry Moon Delight (Tab)");
assert.equal(durablePlan.target.mixProfileId, "monkberry-moon-delight-eq-lane-mix-v7");
assert.equal(durablePlan.durableEdit?.sourceFile, "src/Games/songs/neon-approved-mix-overrides.json");
assert.deepEqual(durablePlan.durableEdit?.mixerLevels, { chord: 0.28 });
assert.equal(durablePlan.approval.mode, "mixing_canon_surrogate");
assert.match(durablePlan.boundary, /does not prove subjective mix quality/u);
const durablePlanMarkdown = formatDurableCandidatePatchPlanMarkdown(durablePlan, {
  title: "Neon Durable Candidate Patch Plan",
});
assert.match(durablePlanMarkdown, /^# Neon Durable Candidate Patch Plan/u);
assert.match(durablePlanMarkdown, /ready_for_durable_patch/u);
assert.match(durablePlanMarkdown, /set_mixer_level chord: 0\.38 -> 0\.28 \(-0\.1\)/u);
assert.match(durablePlanMarkdown, /mixing_canon_surrogate/u);
assert.match(durablePlanMarkdown, /does not prove subjective mix quality/u);
assert.doesNotMatch(durablePlanMarkdown, /automatically better/u);
const durablePlanArtifacts = createDurableCandidatePatchPlanArtifacts(neonApprovedCandidateRun, {
  title: "Neon Durable Candidate Patch Plan",
  sourceFile: "src/Games/songs/neon-approved-mix-overrides.json",
  requireMixProfileId: true,
});
assert.equal(durablePlanArtifacts.plan.ok, true);
assert.deepEqual(JSON.parse(durablePlanArtifacts.json).durableEdit.mixerLevels, { chord: 0.28 });
assert.equal(durablePlanArtifacts.markdown, durablePlanMarkdown);

const malformedDurablePacket = JSON.parse(JSON.stringify(extractedAppliedPacket));
malformedDurablePacket.recommendation.candidate.action.to = null;
const malformedDurablePlan = createDurableCandidatePatchPlan(malformedDurablePacket, {
  sourceFile: "src/Games/songs/neon-approved-mix-overrides.json",
});
assert.equal(malformedDurablePlan.ok, false);
assert.equal(malformedDurablePlan.durableEdit, null);
assert.ok(malformedDurablePlan.errors.some((error) => error.includes("target value is required")));

const transientDurablePlan = createDurableCandidatePatchPlan(extractedReviewPacket, {
  sourceFile: "src/Games/songs/neon-approved-mix-overrides.json",
});
assert.equal(transientDurablePlan.ok, false);
assert.equal(transientDurablePlan.status, "not_ready_for_durable_patch");
assert.equal(transientDurablePlan.durableEdit, null);
assert.ok(transientDurablePlan.errors.some((error) => error.includes("candidate_applied_for_listening_review")));
assert.ok(transientDurablePlan.errors.some((error) => error.includes("candidateActionsAreTransient")));

const neonDurableHandoffRunDir = "packs/neon-step-sequencer/examples/run-008-durable-mix-patch-handoff";
assert.ok(existsSync(`${neonDurableHandoffRunDir}/summary.md`));
assert.ok(existsSync(`${neonDurableHandoffRunDir}/durable-candidate-patch-plan.json`));
assert.ok(existsSync(`${neonDurableHandoffRunDir}/durable-candidate-patch-plan.md`));
assert.ok(existsSync(`${neonDurableHandoffRunDir}/human-review-packet.json`));
const bundledDurablePlan = JSON.parse(readFileSync(`${neonDurableHandoffRunDir}/durable-candidate-patch-plan.json`, "utf8"));
assert.equal(bundledDurablePlan.kind, "durable_candidate_patch_plan");
assert.equal(bundledDurablePlan.status, "ready_for_durable_patch");
assert.deepEqual(bundledDurablePlan.durableEdit?.mixerLevels, { chord: 0.28 });
assert.match(
  readFileSync(`${neonDurableHandoffRunDir}/durable-candidate-patch-plan.md`, "utf8"),
  /musical taste still requires listening review|does not prove subjective mix quality/u,
);
const durableCurrentTargetRun = JSON.parse(readFileSync(`${neonDurableHandoffRunDir}/proof.json`, "utf8"));
assert.equal(durableCurrentTargetRun.profile_name, "lilarcade-neon-fast-mix-health");
assert.equal(durableCurrentTargetRun.status, "passed");
const durableSetupCheck = durableCurrentTargetRun.checks.find((check) => check.type === "setup_actions_succeeded");
const durableViewport = durableSetupCheck?.evidence?.setup_summary?.viewports?.[0];
const durableDiagnostic = durableViewport?.window_eval?.[0]?.returned?.diagnostic;
const durableMetrics = durableViewport?.window_call?.find((call) => call.path === "__NEON_MIX_PROOF__.renderOfflineMetrics")?.returned;
assert.equal(durableDiagnostic?.selectedSong?.selectedSong, "Monkberry Moon Delight (Tab)");
assert.equal(durableDiagnostic?.mixerState?.levels?.chord, 0.28);
assert.equal(durableMetrics?.mixHealth?.clipping, false);
assert.equal(durableMetrics?.mixHealth?.lowLevel, false);

const reviewPacketCliHelp = spawnSync(process.execPath, ["bin/riddle-proof-review-packet", "--help"], {
  encoding: "utf8",
});
assert.equal(reviewPacketCliHelp.status, 0, reviewPacketCliHelp.stderr);
assert.match(reviewPacketCliHelp.stdout, /riddle-proof-review-packet --proof/u);

const reviewPacketCliOutputDir = mkdtempSync(path.join(tmpdir(), "riddle-proof-review-packet-"));
try {
  const reviewPacketCliRun = spawnSync(process.execPath, [
    "bin/riddle-proof-review-packet",
    "--proof",
    "packs/neon-step-sequencer/examples/run-006-ratchet-loop-human-review-packet/proof.json",
    "--output",
    reviewPacketCliOutputDir,
    "--title",
    "Neon Human Review Packet",
  ], { encoding: "utf8" });
  assert.equal(reviewPacketCliRun.status, 0, reviewPacketCliRun.stderr);
  const cliSummary = JSON.parse(reviewPacketCliRun.stdout);
  assert.equal(cliSummary.ok, true);
  assert.equal(cliSummary.status, "candidate_ready_for_listening_review");
  assert.equal(cliSummary.recommendation, "chord -0.10");
  assert.equal(
    readFileSync(path.join(reviewPacketCliOutputDir, "human-review-packet.md"), "utf8"),
    reviewPacketMarkdown,
  );
  assert.equal(
    JSON.parse(readFileSync(path.join(reviewPacketCliOutputDir, "human-review-packet.json"), "utf8")).kind,
    "human_review_packet",
  );
} finally {
  rmSync(reviewPacketCliOutputDir, { recursive: true, force: true });
}

const durableCandidatePlanCliHelp = spawnSync(process.execPath, ["bin/riddle-proof-durable-candidate-plan", "--help"], {
  encoding: "utf8",
});
assert.equal(durableCandidatePlanCliHelp.status, 0, durableCandidatePlanCliHelp.stderr);
assert.match(durableCandidatePlanCliHelp.stdout, /riddle-proof-durable-candidate-plan --proof/u);

const durableCandidatePlanCliOutputDir = mkdtempSync(path.join(tmpdir(), "riddle-proof-durable-candidate-plan-"));
try {
  const durableCandidatePlanCliRun = spawnSync(process.execPath, [
    "bin/riddle-proof-durable-candidate-plan",
    "--proof",
    "packs/neon-step-sequencer/examples/run-007-approved-candidate-applied/proof.json",
    "--output",
    durableCandidatePlanCliOutputDir,
    "--title",
    "Neon Durable Candidate Patch Plan",
    "--source-file",
    "src/Games/songs/neon-approved-mix-overrides.json",
    "--require-mix-profile",
  ], { encoding: "utf8" });
  assert.equal(durableCandidatePlanCliRun.status, 0, durableCandidatePlanCliRun.stderr);
  const cliSummary = JSON.parse(durableCandidatePlanCliRun.stdout);
  assert.equal(cliSummary.ok, true);
  assert.equal(cliSummary.status, "ready_for_durable_patch");
  assert.equal(
    JSON.parse(readFileSync(path.join(durableCandidatePlanCliOutputDir, "durable-candidate-patch-plan.json"), "utf8")).durableEdit.mixerLevels.chord,
    0.28,
  );
  assert.match(
    readFileSync(path.join(durableCandidatePlanCliOutputDir, "durable-candidate-patch-plan.md"), "utf8"),
    /does not prove subjective mix quality/u,
  );
} finally {
  rmSync(durableCandidatePlanCliOutputDir, { recursive: true, force: true });
}

const mobileProfile = instantiateRiddleProofProfile("mobile-layout-smoke", {
  url: "https://example.com",
  route: "/",
  target: { wait_for_selector: "#app" },
});
assert.equal(mobileProfile.target.url, "https://example.com");
assert.equal(mobileProfile.target.route, "/");
