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
  audioMixCandidateMagnitudeMatchesRequest,
  buildAudioMixLevelIntentSet,
  collectAudioExplorationReviewWarnings,
  compareAudioSectionEnergy,
  computeAudioSectionReviewMetric,
  inferAudioMixRequestedMagnitude,
  estimateLoudnessStyleLufs,
  formatAudioExplorationCoverageMarkdown,
  formatAudioExplorationReviewWarningsMarkdown,
  formatAudioMixIntentSelectionMarkdown,
  formatAudioMixIntentMatrixMarkdown,
  resolveAudioMixRequestMagnitude,
  selectAudioMixIntentSet,
  summarizeAudioExplorationCoverage,
  summarizeAudioMixIntentMatrix,
  summarizeAudioSectionEnergy,
  createMixingCanonSurrogateReview,
  buildNeonApprovedCandidateProfileFromReviewPacket,
  createNeonApprovedCandidateProfileArtifacts,
  getNeonApprovedCandidateFromReviewPacket,
  createDurableCandidatePatchPlan,
  createDurableCandidatePatchPlanArtifacts,
  buildNeonDurableCurrentTargetProfile,
  buildNeonUiMixerControlProfile,
  createNeonDurableCurrentTargetArtifacts,
  createNeonUiMixerControlArtifacts,
  formatDurableCandidatePatchPlanMarkdown,
  formatNeonDurableCurrentTargetSummaryMarkdown,
  formatNeonUiMixerControlSummaryMarkdown,
  normalizeNeonDurableMixOverride,
  readActiveNeonDurableMixOverrides,
  routeForNeonDurableOverride,
  summarizeNeonUiMixerControlRun,
  createHumanReviewPacketArtifacts,
  findHumanReviewPacket,
  formatHumanReviewPacketMarkdown,
  requireHumanReviewPacket,
  RIDDLE_PROOF_PACK_MANIFEST,
  RIDDLE_PROOF_PACK_PROFILES,
} from "./dist/index.js";

const audioHeuristicsSubpath = await import("@riddledc/riddle-proof-packs/audio-mix-heuristics");
const audioReviewSubpath = await import("@riddledc/riddle-proof-packs/audio-mix-review");

assert.equal(typeof getRiddleProofPackProfile, "function");
assert.equal(typeof listRiddleProofPackProfiles, "function");
assert.equal(typeof getRiddleProofProfilesByPackId, "function");
assert.equal(typeof getPackEnabledRiddleProofPackProfiles, "function");
assert.equal(typeof getRiddleProofPackProfileManifest, "function");
assert.equal(typeof instantiateRiddleProofProfile, "function");
assert.equal(typeof buildAudioMixLevelIntentSet, "function");
assert.equal(typeof compareAudioSectionEnergy, "function");
assert.equal(typeof audioMixCandidateMagnitudeMatchesRequest, "function");
assert.equal(typeof collectAudioExplorationReviewWarnings, "function");
assert.equal(typeof computeAudioSectionReviewMetric, "function");
assert.equal(typeof estimateLoudnessStyleLufs, "function");
assert.equal(typeof formatAudioExplorationCoverageMarkdown, "function");
assert.equal(typeof formatAudioExplorationReviewWarningsMarkdown, "function");
assert.equal(typeof formatAudioMixIntentSelectionMarkdown, "function");
assert.equal(typeof formatAudioMixIntentMatrixMarkdown, "function");
assert.equal(typeof inferAudioMixRequestedMagnitude, "function");
assert.equal(typeof resolveAudioMixRequestMagnitude, "function");
assert.equal(typeof selectAudioMixIntentSet, "function");
assert.equal(typeof summarizeAudioExplorationCoverage, "function");
assert.equal(typeof summarizeAudioMixIntentMatrix, "function");
assert.equal(typeof summarizeAudioSectionEnergy, "function");
assert.equal(typeof createMixingCanonSurrogateReview, "function");
assert.equal(typeof buildNeonApprovedCandidateProfileFromReviewPacket, "function");
assert.equal(typeof createNeonApprovedCandidateProfileArtifacts, "function");
assert.equal(typeof getNeonApprovedCandidateFromReviewPacket, "function");
assert.equal(typeof createDurableCandidatePatchPlan, "function");
assert.equal(typeof createDurableCandidatePatchPlanArtifacts, "function");
assert.equal(typeof buildNeonDurableCurrentTargetProfile, "function");
assert.equal(typeof createNeonDurableCurrentTargetArtifacts, "function");
assert.equal(typeof buildNeonUiMixerControlProfile, "function");
assert.equal(typeof createNeonUiMixerControlArtifacts, "function");
assert.equal(typeof formatDurableCandidatePatchPlanMarkdown, "function");
assert.equal(typeof formatNeonDurableCurrentTargetSummaryMarkdown, "function");
assert.equal(typeof formatNeonUiMixerControlSummaryMarkdown, "function");
assert.equal(typeof normalizeNeonDurableMixOverride, "function");
assert.equal(typeof readActiveNeonDurableMixOverrides, "function");
assert.equal(typeof routeForNeonDurableOverride, "function");
assert.equal(typeof summarizeNeonUiMixerControlRun, "function");
assert.equal(typeof findHumanReviewPacket, "function");
assert.equal(typeof requireHumanReviewPacket, "function");
assert.equal(typeof formatHumanReviewPacketMarkdown, "function");
assert.equal(typeof createHumanReviewPacketArtifacts, "function");
assert.equal(typeof audioHeuristicsSubpath.compareAudioSectionEnergy, "function");
assert.equal(typeof audioHeuristicsSubpath.audioMixCandidateMagnitudeMatchesRequest, "function");
assert.equal(typeof audioHeuristicsSubpath.buildAudioMixLevelIntentSet, "function");
assert.equal(typeof audioHeuristicsSubpath.collectAudioExplorationReviewWarnings, "function");
assert.equal(typeof audioHeuristicsSubpath.computeAudioSectionReviewMetric, "function");
assert.equal(typeof audioHeuristicsSubpath.estimateLoudnessStyleLufs, "function");
assert.equal(typeof audioHeuristicsSubpath.formatAudioExplorationCoverageMarkdown, "function");
assert.equal(typeof audioHeuristicsSubpath.formatAudioExplorationReviewWarningsMarkdown, "function");
assert.equal(typeof audioHeuristicsSubpath.formatAudioMixIntentSelectionMarkdown, "function");
assert.equal(typeof audioHeuristicsSubpath.formatAudioMixIntentMatrixMarkdown, "function");
assert.equal(typeof audioHeuristicsSubpath.resolveAudioMixRequestMagnitude, "function");
assert.equal(typeof audioHeuristicsSubpath.selectAudioMixIntentSet, "function");
assert.equal(typeof audioHeuristicsSubpath.summarizeAudioExplorationCoverage, "function");
assert.equal(typeof audioHeuristicsSubpath.summarizeAudioMixIntentMatrix, "function");
assert.equal(typeof audioHeuristicsSubpath.summarizeAudioSectionEnergy, "function");
assert.equal(typeof audioReviewSubpath.createMixingCanonSurrogateReview, "function");

assert.equal(inferAudioMixRequestedMagnitude("turn the bass down a little"), "subtle");
assert.equal(inferAudioMixRequestedMagnitude("make the guitar slightly quieter"), "subtle");
assert.equal(inferAudioMixRequestedMagnitude("turn the chord down"), null);
const subtleMagnitudeRequest = resolveAudioMixRequestMagnitude({
  intent: "turn the bass part down a little",
});
assert.equal(subtleMagnitudeRequest.version, "riddle-proof.audio-mix-request-magnitude.v1");
assert.equal(subtleMagnitudeRequest.magnitude, "subtle");
assert.equal(subtleMagnitudeRequest.maxAbsDelta, 0.12);
assert.equal(subtleMagnitudeRequest.maxAbsLevelDelta, 0.12);
assert.equal(subtleMagnitudeRequest.magnitudeSource, "intent_text");
assert.match(subtleMagnitudeRequest.boundary, /does not prove subjective mix quality/u);
assert.equal(
  audioMixCandidateMagnitudeMatchesRequest({ action: { delta: -0.1 } }, subtleMagnitudeRequest).matches,
  true,
);
const oversizedMagnitudeCandidate = audioMixCandidateMagnitudeMatchesRequest(
  { action: { delta: -0.18 } },
  subtleMagnitudeRequest,
);
assert.equal(oversizedMagnitudeCandidate.matches, false);
assert.equal(oversizedMagnitudeCandidate.failureReason, "candidate_delta_exceeds_requested_magnitude");
assert.equal(oversizedMagnitudeCandidate.requestedMagnitude, "subtle");
assert.equal(oversizedMagnitudeCandidate.maxAbsDelta, 0.12);
assert.equal(oversizedMagnitudeCandidate.candidateAbsDelta, 0.18);
assert.equal(oversizedMagnitudeCandidate.source, "intent_text");
const explicitMagnitudeRequest = resolveAudioMixRequestMagnitude({
  intent: "turn the bass down",
  maxAbsLevelDelta: 0.08,
});
assert.equal(explicitMagnitudeRequest.magnitude, null);
assert.equal(explicitMagnitudeRequest.maxAbsDelta, 0.08);
assert.equal(explicitMagnitudeRequest.magnitudeSource, "explicit_args");
assert.equal(
  audioHeuristicsSubpath.audioMixCandidateMagnitudeMatchesRequest({ action: { from: 0.6, to: 0.51 } }, explicitMagnitudeRequest).matches,
  false,
);

const audioMixIntentSet = {
  name: "Neon subtle-down smoke",
  description: "Bounded review-order intents for fast audio mix proof loops.",
  intents: [
    {
      id: "guitar-down-little",
      intent: "turn the guitar part down a little",
      focusTracks: ["guitar"],
      targetTracks: ["guitar"],
      direction: "down",
      metadata: {
        section: "hook",
      },
    },
    {
      id: "bass-down-little",
      intent: "turn the bass part down a little",
      focusTrack: "bass",
      targetTrack: "bass",
      direction: "down",
    },
  ],
};
const subtleDownIntentSet = buildAudioMixLevelIntentSet({
  name: "Neon subtle-down smoke",
  description: "Bounded review-order intents for fast audio mix proof loops.",
  tracks: ["bass", "guitar", "chord"],
  directions: ["down"],
});
assert.equal(subtleDownIntentSet.name, "Neon subtle-down smoke");
assert.equal(subtleDownIntentSet.description, "Bounded review-order intents for fast audio mix proof loops.");
assert.deepEqual(subtleDownIntentSet.intents.map((intent) => intent.id), [
  "bass-down-little",
  "guitar-down-little",
  "chord-down-little",
]);
assert.equal(subtleDownIntentSet.intents[1]?.intent, "turn the guitar part down a little");
assert.deepEqual(subtleDownIntentSet.intents[1]?.focusTracks, ["guitar"]);
assert.deepEqual(subtleDownIntentSet.intents[1]?.targetTracks, ["guitar"]);
assert.equal(subtleDownIntentSet.intents[1]?.direction, "down");
assert.equal(subtleDownIntentSet.intents[1]?.metadata.pattern, "level_change");
assert.equal(subtleDownIntentSet.intents[1]?.metadata.requestedMagnitude, "subtle");
const subtleUpDownIntentSet = audioHeuristicsSubpath.buildAudioMixLevelIntentSet({
  tracks: [{ id: "rhythm-synth", track: "rhythmSynth", label: "rhythm synth" }],
  directions: ["up", "down", "sideways"],
  magnitudeWord: "a touch",
  magnitudeId: "touch",
});
assert.deepEqual(subtleUpDownIntentSet.intents.map((intent) => intent.id), [
  "rhythm-synth-up-touch",
  "rhythm-synth-down-touch",
]);
assert.equal(subtleUpDownIntentSet.intents[0]?.intent, "turn the rhythm synth part up a touch");
assert.deepEqual(subtleUpDownIntentSet.intents[0]?.targetTracks, ["rhythmSynth"]);
const allAudioMixIntentSelection = selectAudioMixIntentSet(audioMixIntentSet);
assert.equal(allAudioMixIntentSelection.version, "riddle-proof.audio-mix-intent-selection.v1");
assert.equal(allAudioMixIntentSelection.role, "bounded_intent_selection");
assert.equal(allAudioMixIntentSelection.status, "intent_selection_ready");
assert.equal(allAudioMixIntentSelection.ok, true);
assert.equal(allAudioMixIntentSelection.intentSet.name, "Neon subtle-down smoke");
assert.equal(allAudioMixIntentSelection.totalIntentCount, 2);
assert.equal(allAudioMixIntentSelection.selectedIntentCount, 2);
assert.deepEqual(allAudioMixIntentSelection.selectedIntentIds, ["guitar-down-little", "bass-down-little"]);
assert.match(allAudioMixIntentSelection.boundary, /does not prove subjective mix quality/u);
const allAudioMixIntentSelectionMarkdown = formatAudioMixIntentSelectionMarkdown(allAudioMixIntentSelection, {
  title: "Neon Intent Selection",
});
assert.match(allAudioMixIntentSelectionMarkdown, /^# Neon Intent Selection/u);
assert.match(allAudioMixIntentSelectionMarkdown, /Role: `bounded_intent_selection`/u);
assert.match(allAudioMixIntentSelectionMarkdown, /Requested intent ids: `none`/u);
assert.match(allAudioMixIntentSelectionMarkdown, /Selected intent ids: `guitar-down-little, bass-down-little`/u);
assert.match(allAudioMixIntentSelectionMarkdown, /\| guitar-down-little \| turn the guitar part down a little \| guitar \| guitar \| down \|/u);
assert.match(allAudioMixIntentSelectionMarkdown, /does not prove subjective mix quality/u);
assert.doesNotMatch(allAudioMixIntentSelectionMarkdown, /automatically better/u);
const guitarOnlySelection = audioHeuristicsSubpath.selectAudioMixIntentSet(audioMixIntentSet, {
  intentIds: ["guitar-down-little"],
});
assert.equal(guitarOnlySelection.ok, true);
assert.equal(guitarOnlySelection.selectedIntentCount, 1);
assert.equal(guitarOnlySelection.intents[0]?.intent, "turn the guitar part down a little");
assert.deepEqual(guitarOnlySelection.intents[0]?.focusTracks, ["guitar"]);
assert.deepEqual(guitarOnlySelection.intents[0]?.targetTracks, ["guitar"]);
assert.equal(guitarOnlySelection.intents[0]?.direction, "down");
assert.deepEqual(guitarOnlySelection.intents[0]?.metadata, { section: "hook" });
const unknownIntentSelection = selectAudioMixIntentSet(audioMixIntentSet, {
  intentIds: ["guitar-down-little", "drums-down-little"],
});
assert.equal(unknownIntentSelection.ok, false);
assert.equal(unknownIntentSelection.status, "unknown_intent_ids");
assert.deepEqual(unknownIntentSelection.requestedIntentIds, ["guitar-down-little", "drums-down-little"]);
assert.deepEqual(unknownIntentSelection.selectedIntentIds, ["guitar-down-little"]);
assert.deepEqual(unknownIntentSelection.unknownIntentIds, ["drums-down-little"]);
const unknownIntentSelectionMarkdown = audioHeuristicsSubpath.formatAudioMixIntentSelectionMarkdown(audioMixIntentSet, {
  intentIds: ["guitar-down-little", "drums-down-little"],
});
assert.match(unknownIntentSelectionMarkdown, /Status: `unknown_intent_ids`/u);
assert.match(unknownIntentSelectionMarkdown, /Unknown intent ids: `drums-down-little`/u);
const limitedIntentSelection = selectAudioMixIntentSet(audioMixIntentSet, {
  maxIntents: 1,
});
assert.equal(limitedIntentSelection.ok, true);
assert.deepEqual(limitedIntentSelection.selectedIntentIds, ["guitar-down-little"]);
assert.equal(limitedIntentSelection.selectedIntentCount, 1);
const emptyIntentSelection = selectAudioMixIntentSet({ intents: [] });
assert.equal(emptyIntentSelection.ok, false);
assert.equal(emptyIntentSelection.status, "empty_intent_selection");

assert.equal(estimateLoudnessStyleLufs(0.1), -20.69);
const sectionComparison = compareAudioSectionEnergy(
  {
    windows: [
      {
        name: "verse",
        label: "Verse",
        requiredActive: ["bass", "chord"],
        mixHealth: { rms: 0.1, peak: 0.5, headroomDb: 6, clipping: false, lowLevel: false },
        activeInstruments: [
          { name: "bass", rms: 0.03, peak: 0.1, totalEnergy: 0.002 },
          { name: "chord", rms: 0.02, peak: 0.08, totalEnergy: 0.001 },
        ],
        requiredInstruments: [
          { name: "bass", rms: 0.03, peak: 0.1, totalEnergy: 0.002 },
          { name: "chord", rms: 0.02, peak: 0.08, totalEnergy: 0.001 },
        ],
      },
      {
        name: "chorus",
        label: "Chorus",
        requiredActive: ["bass"],
        mixHealth: { rms: 0.12, peak: 0.6, headroomDb: 4, clipping: false, lowLevel: false },
        activeInstruments: [
          { name: "bass", rms: 0.04, peak: 0.11, totalEnergy: 0.003 },
        ],
        requiredInstruments: [
          { name: "bass", rms: 0.04, peak: 0.11, totalEnergy: 0.003 },
        ],
      },
    ],
  },
  {
    windows: [
      {
        name: "verse",
        label: "Verse",
        requiredActive: ["bass", "chord"],
        mixHealth: { rms: 0.09, peak: 0.48, headroomDb: 6.2, clipping: false, lowLevel: false },
        activeInstruments: [
          { name: "bass", rms: 0.031, peak: 0.1, totalEnergy: 0.0021 },
          { name: "chord", rms: 0.014, peak: 0.06, totalEnergy: 0.0006 },
        ],
        requiredInstruments: [
          { name: "bass", rms: 0.031, peak: 0.1, totalEnergy: 0.0021 },
          { name: "chord", rms: 0.014, peak: 0.06, totalEnergy: 0.0006 },
        ],
      },
      {
        name: "chorus",
        label: "Chorus",
        requiredActive: ["bass"],
        mixHealth: { rms: 0.13, peak: 0.61, headroomDb: 3.8, clipping: false, lowLevel: false },
        activeInstruments: [
          { name: "bass", rms: 0.039, peak: 0.11, totalEnergy: 0.0031 },
        ],
        requiredInstruments: [
          { name: "bass", rms: 0.039, peak: 0.11, totalEnergy: 0.0031 },
        ],
      },
    ],
  },
  { trackedInstruments: ["chord"] },
);
assert.equal(sectionComparison.sectionCount, 2);
assert.equal(sectionComparison.requiredSectionEnergyFloorsPreserved, true);
assert.equal(sectionComparison.guardrailsPreserved, true);
assert.equal(sectionComparison.sections[0]?.delta?.rms, -0.01);
assert.equal(sectionComparison.sections[0]?.delta?.loudnessStyleLufs, -0.92);
assert.deepEqual(sectionComparison.trackedInstruments, ["chord"]);
assert.equal(sectionComparison.sections[0]?.trackedInstruments?.[0]?.name, "chord");
assert.equal(sectionComparison.sections[0]?.trackedInstruments?.[0]?.delta?.totalEnergy, -0.0004);
assert.equal(typeof computeAudioSectionReviewMetric(sectionComparison), "number");
const sectionComparisonWithViolation = compareAudioSectionEnergy(
  {
    windows: [
      {
        name: "verse",
        label: "Verse",
        requiredActive: ["chord"],
        mixHealth: { rms: 0.1, peak: 0.5, headroomDb: 6, clipping: false, lowLevel: false },
        activeInstruments: [
          { name: "chord", rms: 0.02, peak: 0.08, totalEnergy: 0.001 },
        ],
        requiredInstruments: [
          { name: "chord", rms: 0.02, peak: 0.08, totalEnergy: 0.001 },
        ],
      },
    ],
  },
  {
    windows: [
      {
        name: "verse",
        label: "Verse",
        requiredActive: ["chord"],
        mixHealth: { rms: 0.06, peak: 0.98, headroomDb: 0.2, clipping: true, lowLevel: false },
        activeInstruments: [
          { name: "chord", rms: 0, peak: 0, totalEnergy: 0 },
        ],
        requiredInstruments: [
          { name: "chord", rms: 0, peak: 0, totalEnergy: 0 },
        ],
      },
    ],
  },
);
assert.equal(sectionComparisonWithViolation.requiredSectionEnergyFloorsPreserved, false);
assert.equal(sectionComparisonWithViolation.guardrailsPreserved, false);
const sectionHeuristicPacketMarkdown = formatHumanReviewPacketMarkdown({
  kind: "human_review_packet",
  domain: "audio_mix",
  status: "candidate_ready_for_listening_review",
  evidenceRolePattern: "interaction_snapshots",
  requestedIntent: "turn the chord part down a little",
  target: { routeState: { selectedSong: "Monkberry Moon Delight (Tab)" } },
  request: { candidateActionsAreTransient: true },
  recommendation: {
    action: "review_before_applying_candidate",
    reason: "Metric-supported and guardrail-preserving; ranking only orders review.",
    candidate: {
      label: "chord -0.10",
      action: { type: "set_mixer_level", track: "chord", from: 0.4, to: 0.3, delta: -0.1 },
      rankingMetric: 1.23,
      receipts: [{ name: "section_energy_floors_preserved", ok: true }],
      sectionEnergyComparison: sectionComparison,
    },
  },
  supportedCandidates: [{
    label: "chord -0.10",
    action: { type: "set_mixer_level", track: "chord", from: 0.4, to: 0.3, delta: -0.1 },
    rankingMetric: 1.23,
    receipts: [{ name: "section_energy_floors_preserved", ok: true }],
    sectionEnergyComparison: sectionComparison,
    activeLaneReceipt: {
      version: "neon-step-sequencer.active-lane-receipt.v1",
      ok: true,
      status: "active_lanes_preserved",
      windowCount: 1,
      requiredWindowCount: 1,
      requiredTracks: ["bass", "chord"],
      missingRequiredActiveCount: 0,
      missingWindows: [],
      boundary: "Active-lane preservation proves declared required lanes stayed measurable in proof windows; it does not prove subjective mix quality.",
    },
  }],
  rejectedCandidates: [{
    label: "chord -0.30",
    action: { type: "set_mixer_level", track: "chord", from: 0.4, to: 0.1, delta: -0.3 },
    rankingMetric: 1002.4,
    receipts: [{ name: "section_energy_floors_preserved", ok: false }],
    failedReceipts: ["section_energy_floors_preserved", "headroom_guardrail_preserved"],
    sectionEnergyComparison: sectionComparisonWithViolation,
    activeLaneReceipt: {
      version: "neon-step-sequencer.active-lane-receipt.v1",
      ok: false,
      status: "missing_required_active_lanes",
      windowCount: 1,
      requiredWindowCount: 1,
      requiredTracks: ["bass", "chord"],
      missingRequiredActiveCount: 1,
      missingWindows: [
        {
          label: "Verse",
          missingRequiredActive: ["chord"],
        },
      ],
      boundary: "Active-lane preservation proves declared required lanes stayed measurable in proof windows; it does not prove subjective mix quality.",
    },
  }],
  ranking: { metric: "guardrail_preserving_section_energy_review_order", role: "review_order_only" },
  guardrails: { supportedClaimCandidateCount: 1, rejectedCandidateCount: 1 },
  proofBoundary: "Objective metrics rank candidates for review; musical taste still requires listening review.",
});
assert.match(sectionHeuristicPacketMarkdown, /## Candidate Section Energy Details/u);
assert.match(sectionHeuristicPacketMarkdown, /### Supported: chord -0\.10/u);
assert.match(sectionHeuristicPacketMarkdown, /### Rejected: chord -0\.30/u);
assert.match(sectionHeuristicPacketMarkdown, /Target Movement \| Receipts \| Guardrails \| Ranking/u);
assert.match(sectionHeuristicPacketMarkdown, /Baseline Energy \| Candidate Energy \| Delta \| Tracked Instruments/u);
assert.match(sectionHeuristicPacketMarkdown, /chord: rms 0\.02 -> 0\.014 \(-0\.006\): energy 0\.001 -> 0\.0006 \(-0\.0004\)/u);
assert.match(sectionHeuristicPacketMarkdown, /loudness-style/u);
assert.match(sectionHeuristicPacketMarkdown, /clip ok; low-level ok; min headroom 3\.8 dB \(floor 0\.5 dB\); violations none/u);
assert.match(sectionHeuristicPacketMarkdown, /clip violated; low-level ok; min headroom 0\.2 dB \(floor 0\.5 dB\); violations clipping, headroom/u);
assert.match(sectionHeuristicPacketMarkdown, /headroom 0\.2 dB \(floor 0\.5 dB\); violations clipping, headroom/u);
assert.match(sectionHeuristicPacketMarkdown, /required_section_energy_floors_preserved: `true`/u);
assert.match(sectionHeuristicPacketMarkdown, /required_section_energy_floors_preserved: `false`/u);
assert.match(sectionHeuristicPacketMarkdown, /guardrails_preserved: `false`/u);
assert.match(sectionHeuristicPacketMarkdown, /## Active Lane Receipts/u);
assert.match(sectionHeuristicPacketMarkdown, /declared required lanes stayed measurable/u);
assert.match(sectionHeuristicPacketMarkdown, /Supported \| chord -0\.10 \| active_lanes_preserved \| 1 \/ 1 \| bass, chord \| none/u);
assert.match(sectionHeuristicPacketMarkdown, /Rejected \| chord -0\.30 \| missing_required_active_lanes \| 1 \/ 1 \| bass, chord \| Verse: chord/u);
assert.doesNotMatch(sectionHeuristicPacketMarkdown, /automatically better/u);

const mixingCanonPacket = {
  kind: "human_review_packet",
  domain: "audio_mix",
  status: "candidate_ready_for_listening_review",
  evidenceRolePattern: "interaction_snapshots",
  requestedIntent: "turn the chord part down a little",
  target: { routeState: { selectedSong: "Monkberry Moon Delight (Tab)" } },
  request: {
    candidateActionsAreTransient: true,
    claimTarget: {
      targetTracks: ["chord"],
      direction: "down",
      source: "explicit_args",
    },
  },
  recommendation: {
    action: "review_before_applying_candidate",
    reason: "Metric-supported and guardrail-preserving; ranking only orders review.",
    candidate: {
      label: "chord -0.10",
      action: { type: "set_mixer_level", track: "chord", from: 0.4, to: 0.3, delta: -0.1 },
      rankingMetric: 1.23,
      receipts: [
        { name: "mixer_edit_accepted", ok: true },
        { name: "candidate_direction_matches_requested_intent", ok: true },
        { name: "section_energy_floors_preserved", ok: true },
        { name: "no_clipping", ok: true },
      ],
      failedReceipts: [],
      guardrails: {
        mixerEditAccepted: true,
        candidateTrackMatchesRequestedIntent: true,
        candidateDirectionMatchesRequestedIntent: true,
        contractLevelReflected: true,
        renderedTargetMoved: true,
        requiredInstrumentsPreserved: true,
        requiredSectionEnergyFloorsPreserved: true,
        noClipping: true,
        headroomPreserved: true,
        noLowLevelProofWindow: true,
      },
      targetMovement: {
        track: "chord",
        moved: true,
        deltas: { rms: -0.006, peak: -0.02, totalEnergy: -0.0004 },
      },
      sectionEnergyComparison: sectionComparison,
    },
  },
  supportedCandidates: [],
  rejectedCandidates: [],
  ranking: { metric: "guardrail_preserving_section_energy_review_order", role: "review_order_only" },
  guardrails: {
    supportedClaimCandidateCount: 1,
    rejectedCandidateCount: 0,
    stateRestoredAfterLoop: true,
    noPermanentEditUnlessApplyBest: true,
    approvedCandidateApplied: null,
  },
  proofBoundary: "Objective receipts support or reject candidate change claims; musical taste still requires listening review.",
  caveats: [
    "This packet does not prove subjective mix quality.",
    "Ranking orders review; it is not a taste score.",
  ],
};
const mixingCanonReview = createMixingCanonSurrogateReview(mixingCanonPacket, {
  approvedBy: "codex",
});
assert.equal(mixingCanonReview.kind, "mixing_canon_surrogate_review");
assert.equal(mixingCanonReview.status, "approved_for_development_application");
assert.equal(mixingCanonReview.ok, true);
assert.equal(mixingCanonReview.approval?.mode, "mixing_canon_surrogate");
assert.match(mixingCanonReview.approval?.basis ?? "", /objective receipts/u);
assert.match(mixingCanonReview.boundary, /does not prove subjective mix quality/u);
assert.deepEqual(mixingCanonReview.failedChecks, []);
assert.ok(mixingCanonReview.checks.every((check) => check.ok));
assert.equal(
  audioReviewSubpath.createMixingCanonSurrogateReview(mixingCanonPacket).status,
  "approved_for_development_application",
);

const unsafeMixingCanonPacket = JSON.parse(JSON.stringify(mixingCanonPacket));
unsafeMixingCanonPacket.recommendation.candidate.action.to = 0.05;
unsafeMixingCanonPacket.recommendation.candidate.action.delta = -0.35;
unsafeMixingCanonPacket.recommendation.candidate.sectionEnergyComparison = sectionComparisonWithViolation;
unsafeMixingCanonPacket.recommendation.candidate.receipts.push({ name: "no_clipping", ok: false });
const unsafeMixingCanonReview = createMixingCanonSurrogateReview(unsafeMixingCanonPacket);
assert.equal(unsafeMixingCanonReview.status, "needs_human_review");
assert.equal(unsafeMixingCanonReview.approval, null);
assert.ok(unsafeMixingCanonReview.failedChecks.includes("candidate_delta_is_conservative"));
assert.ok(unsafeMixingCanonReview.failedChecks.includes("objective_candidate_receipts_pass"));
assert.ok(unsafeMixingCanonReview.failedChecks.includes("section_energy_guardrails_preserved"));
assert.match(unsafeMixingCanonReview.caveats.join("\n"), /not a real listener preference/u);
assert.doesNotMatch(JSON.stringify(unsafeMixingCanonReview), /automatically better/u);

const tinyTrackedInstrumentComparison = compareAudioSectionEnergy(
  {
    windows: [{
      name: "intro",
      label: "Intro",
      requiredActive: ["guitar"],
      mixHealth: { rms: 0.11149, peak: 0.5, headroomDb: 6, clipping: false, lowLevel: false },
      activeInstruments: [
        { name: "guitar", rms: 0.040712, peak: 0.1, totalEnergy: 0.000312 },
      ],
      requiredInstruments: [
        { name: "guitar", rms: 0.040712, peak: 0.1, totalEnergy: 0.000312 },
      ],
    }],
  },
  {
    windows: [{
      name: "intro",
      label: "Intro",
      requiredActive: ["guitar"],
      mixHealth: { rms: 0.10601, peak: 0.48, headroomDb: 6.2, clipping: false, lowLevel: false },
      activeInstruments: [
        { name: "guitar", rms: 0.037625, peak: 0.09, totalEnergy: 0.000274 },
      ],
      requiredInstruments: [
        { name: "guitar", rms: 0.037625, peak: 0.09, totalEnergy: 0.000274 },
      ],
    }],
  },
  { trackedInstruments: ["guitar"] },
);
const tinyTrackedInstrumentMarkdown = formatHumanReviewPacketMarkdown({
  kind: "human_review_packet",
  status: "candidate_ready_for_listening_review",
  recommendation: {
    action: "review_before_applying_candidate",
    candidate: {
      label: "guitar -0.05",
      action: { type: "set_mixer_level", track: "guitar", from: 0.65, to: 0.6, delta: -0.05 },
      sectionEnergyComparison: tinyTrackedInstrumentComparison,
    },
  },
  supportedCandidates: [{
    label: "guitar -0.05",
    action: { type: "set_mixer_level", track: "guitar", from: 0.65, to: 0.6, delta: -0.05 },
    targetMovement: { track: "guitar", deltas: { rms: -0.003087, peak: -0.01, totalEnergy: -0.000038 } },
    sectionEnergyComparison: tinyTrackedInstrumentComparison,
  }],
  proofBoundary: "Objective metrics rank candidates for review; musical taste still requires listening review.",
});
assert.match(tinyTrackedInstrumentMarkdown, /energy -0\.000038/u);
assert.match(tinyTrackedInstrumentMarkdown, /energy 0\.000312 -> 0\.000274 \(-0\.000038\)/u);
assert.doesNotMatch(tinyTrackedInstrumentMarkdown, /energy 0\.0003 -> 0\.0003 \(0\)/u);

const audioExplorationCoverage = summarizeAudioExplorationCoverage({
  findingCount: 1,
  entries: [
    {
      songName: "Yakety Yak (Dark)",
      partLabel: "Verse",
      status: "passed",
      windowCount: 1,
      findingCount: 0,
      summary: {
        windows: [{
          requiredActive: ["bass", "drums"],
          missingRequiredActive: [],
          mixHealth: { peak: 0.9202, rms: 0.1125, headroomDb: 0.72, clipping: false, lowLevel: false },
        }],
      },
    },
    {
      songName: "Yakety Yak (Dark)",
      partLabel: "Drop",
      status: "guardrail_failed",
      windowCount: 1,
      findingCount: 1,
      summary: {
        windows: [{
          requiredActive: ["bass"],
          missingRequiredActive: ["lead"],
          mixHealth: { peak: 1.02, rms: 0.14, headroomDb: -0.1, clipping: true, lowLevel: false },
        }],
      },
    },
    {
      songName: "Monkberry Moon Delight (Tab)",
      partLabel: "Chorus",
      status: "passed",
      summary: {
        findingCount: 0,
        windows: [{
          requiredActive: ["chord"],
          missingRequiredActive: [],
          mixHealth: { peak: 0.7699, rms: 0.0999, headroomDb: 2.27, clipping: false, lowLevel: false },
        }],
      },
    },
  ],
});
assert.equal(audioExplorationCoverage.version, "riddle-proof.audio-exploration-coverage.v1");
assert.equal(audioExplorationCoverage.role, "deterministic_audio_app_coverage");
assert.equal(audioExplorationCoverage.entryCount, 3);
assert.equal(audioExplorationCoverage.findingCount, 1);
assert.equal(audioExplorationCoverage.coverageEntries.length, 3);
assert.equal(audioExplorationCoverage.coverageEntries[0]?.songName, "Yakety Yak (Dark)");
assert.equal(audioExplorationCoverage.coverageEntries[0]?.mixHealth.clipping, false);
assert.equal(audioExplorationCoverage.coverageEntries[1]?.mixHealth.clipping, true);
assert.equal(audioExplorationCoverage.coverageEntries[1]?.mixHealth.minHeadroomDb, -0.1);
const yaketyCoverage = audioExplorationCoverage.songCoverage.find((entry) => entry.songName === "Yakety Yak (Dark)");
assert.ok(yaketyCoverage);
assert.equal(yaketyCoverage.partCount, 2);
assert.equal(yaketyCoverage.windowCount, 2);
assert.equal(yaketyCoverage.findingCount, 1);
assert.equal(yaketyCoverage.peak, 1.02);
assert.equal(yaketyCoverage.minHeadroomDb, -0.1);
assert.equal(yaketyCoverage.clipping, true);
assert.equal(yaketyCoverage.lowLevel, false);
assert.deepEqual(yaketyCoverage.missingRequiredActive, ["lead"]);
const audioExplorationCoverageFromArray = audioHeuristicsSubpath.summarizeAudioExplorationCoverage([
  { songName: "Array Song", partLabel: "Intro", mixHealth: { peak: 0.5, rms: 0.1, minHeadroomDb: 6 } },
]);
assert.equal(audioExplorationCoverageFromArray.entryCount, 1);
assert.equal(audioExplorationCoverageFromArray.songCoverage[0]?.songName, "Array Song");
const audioExplorationCoverageMarkdown = formatAudioExplorationCoverageMarkdown(audioExplorationCoverage, {
  title: "Neon Coverage Fixture",
});
assert.match(audioExplorationCoverageMarkdown, /# Neon Coverage Fixture/u);
assert.match(audioExplorationCoverageMarkdown, /## Song Coverage/u);
assert.ok(audioExplorationCoverageMarkdown.includes("| Yakety Yak (Dark) | 2 | 2 | 1 | 1.02 | -0.1 | true | false | lead |"));
assert.match(audioExplorationCoverageMarkdown, /## Part Coverage/u);
assert.match(audioExplorationCoverageMarkdown, /deterministic guardrails/u);
assert.doesNotMatch(audioExplorationCoverageMarkdown, /automatically better/u);
const audioExplorationReviewWarnings = collectAudioExplorationReviewWarnings({
  entries: [
    {
      songName: "Yakety Yak (Dark)",
      partLabel: "Hook",
      status: "passed",
      summary: {
        windows: [{
          requiredActive: ["kick", "bass", "chord"],
          missingRequiredActive: [],
          mixHealth: { peak: 0.96812, rms: 0.1338, headroomDb: 0.281, clipping: false, lowLevel: false },
        }],
      },
    },
    {
      songName: "Monkberry Moon Delight (Tab)",
      partLabel: "Intro Bed",
      status: "passed",
      summary: {
        windows: [{
          requiredActive: ["bass", "chord", "guitar"],
          missingRequiredActive: [],
          mixHealth: { peak: 0.7567, rms: 0.1004, headroomDb: 2.42, clipping: false, lowLevel: false },
        }],
      },
    },
  ],
});
assert.equal(audioExplorationReviewWarnings.length, 1);
assert.equal(audioExplorationReviewWarnings[0]?.version, "riddle-proof.audio-exploration-review-warning.v1");
assert.equal(audioExplorationReviewWarnings[0]?.kind, "low_headroom_margin");
assert.equal(audioExplorationReviewWarnings[0]?.severity, "review");
assert.equal(audioExplorationReviewWarnings[0]?.songName, "Yakety Yak (Dark)");
assert.equal(audioExplorationReviewWarnings[0]?.partLabel, "Hook");
assert.equal(audioExplorationReviewWarnings[0]?.minHeadroomDb, 0.28);
assert.equal(audioExplorationReviewWarnings[0]?.thresholdDb, 0.5);
assert.equal(audioExplorationReviewWarnings[0]?.peak, 0.9681);
assert.equal(audioExplorationReviewWarnings[0]?.clipping, false);
assert.match(audioExplorationReviewWarnings[0]?.message ?? "", /0\.28 dB headroom/u);
assert.match(audioExplorationReviewWarnings[0]?.boundary ?? "", /do not prove subjective mix quality/u);
const audioExplorationReviewWarningsMarkdown = formatAudioExplorationReviewWarningsMarkdown(audioExplorationReviewWarnings, {
  title: "Neon Review Warnings",
});
assert.match(audioExplorationReviewWarningsMarkdown, /^# Neon Review Warnings/u);
assert.match(audioExplorationReviewWarningsMarkdown, /Role: `non_failing_review_cues`/u);
assert.match(audioExplorationReviewWarningsMarkdown, /\| low_headroom_margin \| review \| Yakety Yak \(Dark\) \| Hook \| 0\.28 \| 0\.5 \| 0\.9681 \| false \| false \|/u);
assert.match(audioExplorationReviewWarningsMarkdown, /do not prove subjective mix quality/u);
assert.doesNotMatch(audioExplorationReviewWarningsMarkdown, /automatically better/u);
const audioExplorationNoReviewWarningsMarkdown = audioHeuristicsSubpath.formatAudioExplorationReviewWarningsMarkdown(audioExplorationCoverage, {
  minHeadroomDb: -1,
});
assert.match(audioExplorationNoReviewWarningsMarkdown, /Warning count: `0`/u);
assert.match(audioExplorationNoReviewWarningsMarkdown, /\| none \| review \| none \| none \| not captured \| not captured \| not captured \| false \| false \|/u);
assert.deepEqual(audioHeuristicsSubpath.collectAudioExplorationReviewWarnings(audioExplorationCoverage, {
  minHeadroomDb: -1,
}), []);
const audioIntentMatrixSummary = summarizeAudioMixIntentMatrix({
  status: "intent_matrix_ready_for_review",
  ok: true,
  executionMode: "single_browser_intents",
  target: {
    url: "https://riddlenode.com",
    route: "/neon-lab/games/drum-sequencer",
  },
  intentSet: {
    name: "subtle-down",
  },
  ratchetMaxIterations: 3,
  sharedGates: {
    status: "local_gate_ready",
  },
  mixingCanonSurrogateReview: {
    status: "approved_for_development_review",
    approvedCount: 2,
    needsHumanReviewCount: 0,
    recommendedDevelopmentCandidate: {
      label: "bass -0.05",
    },
    recommendationRole: "most_conservative_surrogate_approved_candidate_for_development_review",
  },
  intents: [
    {
      id: "bass-down-little",
      intent: "turn the bass part down a little",
      status: "preliminary_candidate_ready",
      recommendation: "bass -0.05",
      recommendationAction: {
        type: "set_mixer_level",
        track: "bass",
        from: 0.62,
        to: 0.57,
        delta: -0.05,
      },
      supportedClaimCandidateCount: 3,
      rejectedCandidateCount: 0,
      reviewWarningCount: 0,
      findingCount: 0,
      rankingRole: "review_order_only",
      rankingMetricDelta: 0.1716,
    },
    {
      id: "chord-down-little",
      intent: "turn the chord part down a little",
      status: "preliminary_candidate_ready",
      recommendation: "chord -0.035",
      recommendationAction: {
        type: "set_mixer_level",
        track: "chord",
        from: 0.16,
        to: 0.125,
        delta: -0.035,
      },
      supportedClaimCandidateCount: 2,
      rejectedCandidateCount: 1,
      reviewWarningCount: 0,
      findingCount: 0,
      rankingRole: "review_order_only",
      rankingMetricDelta: -0.0067,
    },
  ],
});
assert.equal(audioIntentMatrixSummary.version, "riddle-proof.audio-mix-intent-matrix.v1");
assert.equal(audioIntentMatrixSummary.role, "claim_candidate_review_matrix");
assert.equal(audioIntentMatrixSummary.executionMode, "single_browser_intents");
assert.equal(audioIntentMatrixSummary.intentCount, 2);
assert.equal(audioIntentMatrixSummary.supportedIntentCount, 2);
assert.equal(audioIntentMatrixSummary.findingCount, 0);
assert.equal(audioIntentMatrixSummary.reviewWarningCount, 0);
assert.equal(audioIntentMatrixSummary.mixingCanonSurrogateReview?.status, "approved_for_development_review");
assert.equal(audioIntentMatrixSummary.mixingCanonSurrogateReview?.approvedCount, 2);
assert.equal(audioIntentMatrixSummary.mixingCanonSurrogateReview?.recommendedDevelopmentCandidate, "bass -0.05");
assert.match(audioIntentMatrixSummary.boundary, /do not prove subjective mix quality/u);
const audioIntentMatrixMarkdown = formatAudioMixIntentMatrixMarkdown(audioIntentMatrixSummary, {
  title: "Neon Intent Matrix",
});
assert.match(audioIntentMatrixMarkdown, /^# Neon Intent Matrix/u);
assert.match(audioIntentMatrixMarkdown, /Role: `claim_candidate_review_matrix`/u);
assert.match(audioIntentMatrixMarkdown, /Execution mode: `single_browser_intents`/u);
assert.match(audioIntentMatrixMarkdown, /Intent count: `2`/u);
assert.match(audioIntentMatrixMarkdown, /\| turn the bass part down a little \| preliminary_candidate_ready \| bass -0\.05 \| set_mixer_level bass: 0\.62 -> 0\.57 \(-0\.05\) \| 3 \| 0 \| 0 \| 0 \| review_order_only \| 0\.1716 \|/u);
assert.match(audioIntentMatrixMarkdown, /\| turn the chord part down a little \| preliminary_candidate_ready \| chord -0\.035 \| set_mixer_level chord: 0\.16 -> 0\.125 \(-0\.035\) \| 2 \| 1 \| 0 \| 0 \| review_order_only \| -0\.0067 \|/u);
assert.match(audioIntentMatrixMarkdown, /Mixing Canon Surrogate Review/u);
assert.match(audioIntentMatrixMarkdown, /Recommended development candidate: `bass -0\.05`/u);
assert.match(audioIntentMatrixMarkdown, /not a listener preference/u);
assert.match(audioIntentMatrixMarkdown, /do not prove subjective mix quality/u);
assert.match(audioIntentMatrixMarkdown, /do not prove that a candidate sounds better/u);
assert.doesNotMatch(audioIntentMatrixMarkdown, /automatically better/u);
const nestedIntentMatrixSummary = audioHeuristicsSubpath.summarizeAudioMixIntentMatrix({
  intents: [{
    requestedIntent: "turn the guitar part down a little",
    findings: [{ message: "control did not move" }],
    reviewWarnings: [{ kind: "low_headroom_margin" }],
    guardrails: {
      supportedClaimCandidateCount: 0,
      rejectedCandidateCount: 3,
    },
    ranking: {
      role: "review_order_only",
    },
    recommendation: {
      candidate: {
        label: "guitar -0.02",
        action: {
          type: "set_mixer_level",
          track: "guitar",
          from: 0.55,
          to: 0.53,
          delta: -0.02,
        },
      },
    },
  }],
});
assert.equal(nestedIntentMatrixSummary.ok, false);
assert.equal(nestedIntentMatrixSummary.findingCount, 1);
assert.equal(nestedIntentMatrixSummary.reviewWarningCount, 1);
assert.equal(nestedIntentMatrixSummary.intents[0]?.recommendation, "guitar -0.02");
assert.equal(nestedIntentMatrixSummary.intents[0]?.recommendationAction?.track, "guitar");
const audioExplorationCoverageNoPartsMarkdown = audioHeuristicsSubpath.formatAudioExplorationCoverageMarkdown(audioExplorationCoverage, {
  includePartCoverage: false,
});
assert.match(audioExplorationCoverageNoPartsMarkdown, /## Song Coverage/u);
assert.doesNotMatch(audioExplorationCoverageNoPartsMarkdown, /## Part Coverage/u);

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
assert.equal(neonProfiles.length, 12);
assert.ok(neonProfiles.every((entry) => entry.packPublicName === "Neon Step Sequencer Pack"));
assert.ok(
  neonProfiles.some((entry) => entry.name === "neon-step-sequencer-ratchet-loop-mix-level-search"),
  "Neon ratchet-loop profile should be present",
);
assert.ok(
  neonProfiles.some((entry) => entry.name === "neon-step-sequencer-ratchet-loop-approved-candidate"),
  "Neon approved-candidate profile should be present",
);
assert.ok(
  neonProfiles.some((entry) => entry.name === "neon-step-sequencer-durable-current-target"),
  "Neon durable current-target profile should be present",
);
assert.ok(
  neonProfiles.some((entry) => entry.name === "neon-step-sequencer-ui-mixer-control"),
  "Neon UI mixer-control profile should be present",
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
assert.equal(neonRatchetLoopArgs.sectionHeuristics?.enabled, true);
assert.equal(neonRatchetLoopArgs.sectionHeuristics?.loudnessStyle, "rms_dbfs_estimate");
const neonRatchetLoopSummaryPaths = neonRatchetLoopProfile.target.setup_actions?.[2]?.return_summary_fields?.map((entry) => entry.path) ?? [];
assert.ok(neonRatchetLoopSummaryPaths.includes("humanReviewPacket.status"));
assert.ok(neonRatchetLoopSummaryPaths.includes("humanReviewPacket.ranking.role"));
assert.ok(neonRatchetLoopSummaryPaths.includes("humanReviewPacket.ranking.metric"));
assert.ok(neonRatchetLoopSummaryPaths.includes("humanReviewPacket.recommendation.candidate.sectionEnergyComparison.requiredSectionEnergyFloorsPreserved"));
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
assert.equal(neonApprovedCandidateArgs.sectionHeuristics?.enabled, true);
assert.equal(neonApprovedCandidateArgs.approval?.mode, "mixing_canon_surrogate");
assert.equal(neonApprovedCandidateProfile.target.setup_actions?.[4]?.path, "__neonMixProof.approvedCandidateLoop.appliedCandidateReceipt.ok");
assert.equal(neonApprovedCandidateProfile.target.setup_actions?.[5]?.path, "__neonMixProof.approvedCandidateLoop.humanReviewPacket.status");
assert.equal(neonApprovedCandidateProfile.target.setup_actions?.[7]?.path, "__neonMixProof.approvedCandidateLoop.humanReviewPacket.guardrails.approvedCandidateApplied");

const neonReviewPacketFixture = {
  kind: "human_review_packet",
  status: "candidate_ready_for_listening_review",
  recommendation: {
    action: "review_before_applying_candidate",
    candidate: {
      label: "chord -0.10",
      action: {
        type: "set_mixer_level",
        track: "chord",
        from: 0.18,
        to: 0.08,
        delta: -0.1,
      },
    },
  },
  request: {
    candidateActionsAreTransient: true,
  },
  proofBoundary: "Objective receipts support or reject candidate change claims; musical taste still requires listening review.",
};
const reviewedCandidate = getNeonApprovedCandidateFromReviewPacket(neonReviewPacketFixture);
assert.equal(reviewedCandidate?.track, "chord");
assert.equal(reviewedCandidate?.from, 0.18);
assert.equal(reviewedCandidate?.value, 0.08);
assert.equal(reviewedCandidate?.label, "chord -0.10");
const generatedApprovedCandidateProfile = buildNeonApprovedCandidateProfileFromReviewPacket(
  neonReviewPacketFixture,
  { url: "http://127.0.0.1:5173" },
);
assert.equal(generatedApprovedCandidateProfile.target.url, "http://127.0.0.1:5173");
assert.equal(generatedApprovedCandidateProfile.metadata?.candidate_source, "human_review_packet_recommendation");
assert.equal(generatedApprovedCandidateProfile.metadata?.candidate_source_status, "candidate_ready_for_listening_review");
const generatedApprovedAction = generatedApprovedCandidateProfile.target.setup_actions?.find((action) => (
  action.type === "window_call" && action.label === "apply-approved-claim-candidate"
));
const generatedApprovedArgs = generatedApprovedAction?.args?.[0];
assert.deepEqual(generatedApprovedArgs?.focusTracks, ["chord"]);
assert.equal(generatedApprovedArgs?.maxIterations, 1);
assert.equal(generatedApprovedArgs?.candidates?.length, 1);
assert.equal(generatedApprovedArgs?.candidates?.[0]?.track, "chord");
assert.equal(generatedApprovedArgs?.candidates?.[0]?.value, 0.08);
assert.equal(generatedApprovedArgs?.applyBest, true);
const generatedApprovedArtifacts = createNeonApprovedCandidateProfileArtifacts(neonReviewPacketFixture);
assert.equal(generatedApprovedArtifacts.candidate.track, "chord");
assert.match(generatedApprovedArtifacts.json, /human_review_packet_recommendation/u);
assert.throws(
  () => buildNeonApprovedCandidateProfileFromReviewPacket({ kind: "human_review_packet", recommendation: {} }),
  /No Neon set_mixer_level recommendation/u,
);

const durableOverrides = readActiveNeonDurableMixOverrides({
  overrides: [
    {
      id: "monkberry-moon-delight-tab-chord-minus-01-approved-candidate",
      status: "active",
      target: {
        song: "Monkberry Moon Delight (Tab)",
        mixProfileId: "monkberry-moon-delight-eq-lane-mix-v7",
      },
      mixerLevels: {
        chord: "0.18",
      },
      doesNotProve: ["subjective mix quality"],
    },
    {
      id: "inactive-example",
      status: "inactive",
      target: {
        song: "Monkberry Moon Delight (Tab)",
        mixProfileId: "monkberry-moon-delight-eq-lane-mix-v7",
      },
      mixerLevels: {
        chord: 0.2,
      },
    },
  ],
});
assert.equal(durableOverrides.length, 1);
const durableOverride = durableOverrides[0];
assert.equal(durableOverride.id, "monkberry-moon-delight-tab-chord-minus-01-approved-candidate");
assert.deepEqual(durableOverride.mixerLevels, { chord: 0.18 });
assert.equal(
  routeForNeonDurableOverride(durableOverride),
  "/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile&view=trainer&instrument=chord",
);
assert.equal(
  routeForNeonDurableOverride({
    ...durableOverride,
    mixerLevels: { rhythmSynth: 0.22 },
  }),
  "/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile&view=trainer&instrument=rhythm-synth",
);
const builtDurableCurrentTargetProfile = buildNeonDurableCurrentTargetProfile(durableOverride, {
  name: "neon-step-sequencer-durable-current-target",
  url: "http://127.0.0.1:5173",
});
assert.equal(builtDurableCurrentTargetProfile.name, "neon-step-sequencer-durable-current-target");
assert.equal(builtDurableCurrentTargetProfile.target.url, "http://127.0.0.1:5173");
assert.equal(builtDurableCurrentTargetProfile.metadata?.evidence_role_pattern, "current_target");
assert.ok(builtDurableCurrentTargetProfile.target.setup_actions?.some((action) => action.label === "verify-durable-current-target"));
assert.ok(builtDurableCurrentTargetProfile.target.setup_actions?.some((action) => action.path === "__neonDurableCurrentTarget.check.ok"));
assert.ok(builtDurableCurrentTargetProfile.target.setup_actions?.some((action) => action.path === "__NEON_MIX_PROOF__.renderOfflineMetrics"));

const neonDurableCurrentTargetProfile = instantiateRiddleProofProfile(
  "neon-step-sequencer-durable-current-target",
  { url: "http://127.0.0.1:5173" },
);
assert.equal(neonDurableCurrentTargetProfile.metadata?.evidence_role_pattern, "current_target");
assert.equal(neonDurableCurrentTargetProfile.metadata?.override_id, "monkberry-moon-delight-tab-chord-minus-01-approved-candidate");
assert.equal(neonDurableCurrentTargetProfile.target.setup_actions?.[1]?.label, "verify-durable-current-target");

const neonUiMixerControlProfile = instantiateRiddleProofProfile(
  "neon-step-sequencer-ui-mixer-control",
  { url: "http://127.0.0.1:5173" },
);
assert.equal(neonUiMixerControlProfile.name, "neon-step-sequencer-ui-mixer-control");
assert.equal(neonUiMixerControlProfile.target.url, "http://127.0.0.1:5173");
assert.equal(neonUiMixerControlProfile.metadata?.evidence_role_pattern, "interaction_snapshots");
assert.equal(neonUiMixerControlProfile.metadata?.track, "guitar");
assert.equal(neonUiMixerControlProfile.metadata?.target_level, 0.5);
assert.ok(
  neonUiMixerControlProfile.target.setup_actions?.some((action) => action.label === "apply-ui-mixer-level-control"),
  "Neon UI mixer-control profile should apply the real browser control",
);
assert.ok(
  neonUiMixerControlProfile.target.setup_actions?.some((action) => action.path === "__neonUiMixerControl.receipt.proofApiEditUsed"),
  "Neon UI mixer-control profile should assert the proof API edit helper was not used",
);
assert.ok(
  neonUiMixerControlProfile.target.setup_actions?.some((action) => action.label === "restore-ui-mixer-level-control"),
  "Neon UI mixer-control profile should restore the original level",
);
assert.doesNotMatch(
  JSON.stringify(neonUiMixerControlProfile.target.setup_actions),
  /setMixerLevelForProof/u,
);
const customNeonUiMixerControlProfile = buildNeonUiMixerControlProfile({
  url: "http://127.0.0.1:5173",
  route: "/neon-lab/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile&view=trainer&instrument=bass",
  track: "bass",
  targetLevel: 0.47,
  bars: 2,
  monitorProfile: "phone",
});
assert.equal(customNeonUiMixerControlProfile.target.url, "http://127.0.0.1:5173");
assert.equal(customNeonUiMixerControlProfile.checks?.[0]?.expected_path, "/neon-lab/games/drum-sequencer");
const customUiControlApplyAction = customNeonUiMixerControlProfile.target.setup_actions?.find((action) => action.label === "apply-ui-mixer-level-control");
assert.deepEqual(customUiControlApplyAction?.args?.[0], { track: "bass", targetLevel: 0.47 });
const customUiControlRenderAction = customNeonUiMixerControlProfile.target.setup_actions?.find((action) => action.label === "render-post-ui-control-metrics");
assert.equal(customUiControlRenderAction?.args?.[0]?.bars, 2);
assert.equal(customUiControlRenderAction?.args?.[0]?.monitorProfile, "phone");
assert.equal(customNeonUiMixerControlProfile.metadata?.purpose, "UI-only proof that the real Neon mixer level slider updates contract state and preserves deterministic render guardrails.");

const neonUiMixerControlProfileResult = {
  status: "passed",
  checks: [{
    type: "setup_actions_succeeded",
    evidence: {
      setup_summary: {
        viewports: [{
          window_eval: [
            {
              label: "apply-ui-mixer-level-control",
              return_stored_to: "__neonUiMixerControl.receipt",
              returned: {
                ok: true,
                track: "guitar",
                targetLevel: 0.5,
                beforeContractLevel: 0.53,
                beforeInputLevel: 0.53,
                beforeReadoutLevel: 0.53,
                afterContractLevel: 0.5,
                afterInputLevel: 0.5,
                afterReadoutLevel: 0.5,
                levelDelta: -0.03,
                proofApiEditUsed: false,
                findings: [],
              },
            },
            {
              label: "classify-ui-mixer-control-guardrails",
              return_stored_to: "__neonUiMixerControl.summary",
              returned: {
                ok: true,
                status: "ui_mixer_control_ready",
                guardrails: {
                  renderOk: true,
                  clipping: false,
                  lowLevel: false,
                  peak: 0.4347,
                  rms: 0.0635,
                  headroomDb: 7.24,
                },
                findings: [],
              },
            },
            {
              label: "restore-ui-mixer-level-control",
              return_stored_to: "__neonUiMixerControl.restore",
              returned: {
                ok: true,
                restoreLevel: 0.53,
                restoredLevel: 0.53,
                proofApiEditUsed: false,
                findings: [],
              },
            },
          ],
          window_call: [{
            label: "render-post-ui-control-metrics",
            return_stored_to: "__neonUiMixerControl.render",
            returned: {
              ok: true,
              mixHealth: {
                peak: 0.4347,
                rms: 0.0635,
                headroomDb: 7.24,
                clipping: false,
                lowLevel: false,
              },
            },
          }],
        }],
      },
    },
  }],
};
const neonUiMixerControlSummary = summarizeNeonUiMixerControlRun(neonUiMixerControlProfileResult);
assert.equal(neonUiMixerControlSummary.version, "riddle-proof.neon-ui-mixer-control-summary.v1");
assert.equal(neonUiMixerControlSummary.status, "ui_mixer_control_ready");
assert.equal(neonUiMixerControlSummary.ok, true);
assert.equal(neonUiMixerControlSummary.track, "guitar");
assert.equal(neonUiMixerControlSummary.beforeContractLevel, 0.53);
assert.equal(neonUiMixerControlSummary.afterContractLevel, 0.5);
assert.equal(neonUiMixerControlSummary.levelDelta, -0.03);
assert.equal(neonUiMixerControlSummary.proofApiEditUsed, false);
assert.equal(neonUiMixerControlSummary.guardrails?.headroomDb, 7.24);
assert.equal(neonUiMixerControlSummary.restore?.ok, true);
assert.match(neonUiMixerControlSummary.boundary, /does not prove subjective mix taste/u);
const neonUiMixerControlMarkdown = formatNeonUiMixerControlSummaryMarkdown(neonUiMixerControlSummary);
assert.match(neonUiMixerControlMarkdown, /^# Neon UI Mixer Control Proof/u);
assert.match(neonUiMixerControlMarkdown, /contract_before: `0\.53`/u);
assert.match(neonUiMixerControlMarkdown, /proof_api_edit_used: `false`/u);
assert.match(neonUiMixerControlMarkdown, /headroom_db: `7\.24`/u);
assert.match(neonUiMixerControlMarkdown, /does not prove subjective mix taste/u);
assert.doesNotMatch(neonUiMixerControlMarkdown, /automatically better/u);
const neonUiMixerControlArtifacts = createNeonUiMixerControlArtifacts(neonUiMixerControlProfileResult);
assert.equal(JSON.parse(neonUiMixerControlArtifacts.json).status, "ui_mixer_control_ready");
assert.deepEqual(neonUiMixerControlArtifacts.summary, neonUiMixerControlSummary);

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

const neonDeepExplorationProfile = instantiateRiddleProofProfile(
  "neon-step-sequencer-deep-explore-songs-and-mixes",
  { url: "http://127.0.0.1:5173" },
);
assert.equal(neonDeepExplorationProfile.metadata?.evidence_role_pattern, "current_target");
assert.equal(neonDeepExplorationProfile.target.timeout_sec, 600);
assert.equal(neonDeepExplorationProfile.target.setup_actions?.[3]?.type, "window_call");
assert.equal(neonDeepExplorationProfile.target.setup_actions?.[3]?.path, "__NEON_MIX_PROOF__.runExplorationSweep");
const neonDeepExplorationArgs = neonDeepExplorationProfile.target.setup_actions?.[3]?.args?.[0];
assert.ok(neonDeepExplorationArgs && typeof neonDeepExplorationArgs === "object");
assert.equal(neonDeepExplorationArgs.maxSongs, 6);
assert.equal(neonDeepExplorationArgs.maxPartsPerSong, 4);
assert.equal(neonDeepExplorationArgs.maxWindowsPerPart, 2);
assert.equal(neonDeepExplorationProfile.target.setup_actions?.[6]?.path, "__neonProof.exploration.restorationReceipt.ok");

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
  ["run-009-deep-exploration-production", "neon-step-sequencer-deep-explore-songs-and-mixes"],
  ["run-010-durable-current-target-production", "lilarcade-neon-durable-current-target-monkberry-moon-delight-tab-monkberry-moon-delight-tab-chord-minus-01-approved-candidate"],
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

const neonDeepExplorationRun = JSON.parse(
  readFileSync("packs/neon-step-sequencer/examples/run-009-deep-exploration-production/proof.json", "utf8"),
);
const deepExplorationSetupCheck = neonDeepExplorationRun.checks.find((check) => check.type === "setup_actions_succeeded");
const deepExplorationReturn = deepExplorationSetupCheck?.evidence?.setup_summary?.viewports?.[0]?.window_call?.[0]?.returned;
assert.equal(deepExplorationReturn?.proofKind, "neon-exploration-sweep");
assert.equal(deepExplorationReturn?.status, "passed");
assert.equal(deepExplorationReturn?.coverage?.sampledSongCount, 6);
assert.equal(deepExplorationReturn?.coverage?.sampledPartCount, 19);
assert.equal(deepExplorationReturn?.coverage?.sampledWindowCount, 22);
assert.equal(deepExplorationReturn?.findingCount, 0);
assert.equal(deepExplorationReturn?.restorationReceipt?.ok, true);
const deepExplorationSummary = JSON.parse(
  readFileSync("packs/neon-step-sequencer/examples/run-009-deep-exploration-production/deep-exploration-summary.json", "utf8"),
);
assert.equal(deepExplorationSummary.boundary, "Objective guardrails only; this does not prove subjective mix taste.");
assert.ok(existsSync("packs/neon-step-sequencer/examples/run-009-deep-exploration-production/screenshots/neon-step-sequencer-deep-explore-songs-and-mixes-desktop.png"));

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
assert.match(reviewPacketMarkdown, /## Supported Candidates/u);
assert.match(reviewPacketMarkdown, /\| Candidate \| Action \| Target Movement \| Receipts \| Ranking \|/u);
assert.match(reviewPacketMarkdown, /chord: rms -0\.0012, peak -0\.0088/u);
assert.match(reviewPacketMarkdown, /pass \(6\)/u);
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
assert.match(appliedPacketMarkdown, /## Supported Candidates/u);
assert.match(appliedPacketMarkdown, /set_mixer_level chord: 0\.38 -> 0\.28 \(-0\.1\)/u);
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

const neonDurableCurrentTargetRunDir = "packs/neon-step-sequencer/examples/run-010-durable-current-target-production";
assert.ok(existsSync(`${neonDurableCurrentTargetRunDir}/summary.md`));
assert.ok(existsSync(`${neonDurableCurrentTargetRunDir}/durable-current-target-summary.json`));
assert.ok(existsSync(`${neonDurableCurrentTargetRunDir}/screenshots/lilarcade-neon-durable-current-target-monkberry-moon-delight-tab-monkberry-moon-desktop.png`));
const neonDurableCurrentTargetProfileResult = JSON.parse(readFileSync(`${neonDurableCurrentTargetRunDir}/profile-result.json`, "utf8"));
const neonDurableCurrentTargetArtifacts = createNeonDurableCurrentTargetArtifacts({
  override: durableOverride,
  profileResult: neonDurableCurrentTargetProfileResult,
}, {
  title: "Neon Durable Current-Target Proof",
});
assert.equal(neonDurableCurrentTargetArtifacts.summary.ok, true);
assert.equal(neonDurableCurrentTargetArtifacts.summary.status, "passed");
assert.equal(neonDurableCurrentTargetArtifacts.summary.selectedSong, "Monkberry Moon Delight (Tab)");
assert.equal(neonDurableCurrentTargetArtifacts.summary.mixProfileId, "monkberry-moon-delight-eq-lane-mix-v7");
assert.equal(neonDurableCurrentTargetArtifacts.summary.observations[0]?.profileLevel, 0.18);
assert.equal(neonDurableCurrentTargetArtifacts.summary.observations[0]?.visibleMatches, true);
assert.equal(neonDurableCurrentTargetArtifacts.summary.mixHealth?.clipping, false);
assert.equal(neonDurableCurrentTargetArtifacts.summary.mixHealth?.lowLevel, false);
assert.match(neonDurableCurrentTargetArtifacts.markdown, /does not prove subjective mix taste/u);
assert.doesNotMatch(neonDurableCurrentTargetArtifacts.markdown, /automatically better/u);
const bundledDurableCurrentTargetSummary = JSON.parse(readFileSync(`${neonDurableCurrentTargetRunDir}/durable-current-target-summary.json`, "utf8"));
assert.equal(bundledDurableCurrentTargetSummary.status, "ready_for_promotion_review");
assert.equal(bundledDurableCurrentTargetSummary.results[0]?.expectedMixerLevels?.chord, 0.18);
assert.equal(bundledDurableCurrentTargetSummary.results[0]?.observations?.[0]?.profileMatches, true);

const profileMismatchSummary = createNeonDurableCurrentTargetArtifacts({
  override: durableOverride,
  profileResult: {
    status: "failed",
    checks: [{
      type: "setup_actions_succeeded",
      evidence: {
        setup_summary: {
          viewports: [{
            window_eval: [{
              return_stored_to: "__neonDurableCurrentTarget.check",
              returned: {
                ok: false,
                observations: [{
                  track: "chord",
                  expectedLevel: 0.18,
                  actualLevel: 0.18,
                  profileLevel: null,
                  contractMatches: true,
                  profileMatches: false,
                  visibleMatches: true,
                }],
              },
            }],
          }],
        },
      },
    }],
  },
});
assert.equal(profileMismatchSummary.summary.status, "deterministic_findings_present");
assert.equal(profileMismatchSummary.summary.findings[0]?.classification, "app_contract_gap");

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
