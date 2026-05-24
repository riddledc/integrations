import type { RiddleProofProfile } from "@riddledc/riddle-proof";
import { requireHumanReviewPacket, type HumanReviewPacket } from "./humanReviewPacket";
import { instantiateRiddleProofProfile, type RiddleProofPackProfileOverrides } from "./instantiateProfile";

const APPROVED_CANDIDATE_PROFILE = "neon-step-sequencer-ratchet-loop-approved-candidate";

export interface NeonApprovedCandidateAction {
  type: "set_mixer_level";
  track: string;
  from?: number;
  to: number;
  delta?: number;
}

export interface NeonApprovedCandidateProfileCandidate {
  track: string;
  from?: number;
  value: number;
  label?: string;
  claim: string;
  expectedReceipts: string[];
  metadata?: {
    delta?: number;
  };
}

export interface NeonApprovedCandidateProfileOptions extends RiddleProofPackProfileOverrides {
  /** Profile name for the generated single-candidate approval proof. */
  name?: string;
  /** Override the approval metadata passed to the app contract. */
  approval?: Record<string, unknown>;
}

export interface NeonApprovedCandidateProfileArtifacts {
  packet: HumanReviewPacket;
  candidate: NeonApprovedCandidateProfileCandidate;
  profile: RiddleProofProfile;
  json: string;
}

const EXPECTED_MIX_LEVEL_CLAIM_RECEIPTS = Object.freeze([
  "mixer_edit_accepted",
  "contract_mixer_level_reflects_action",
  "rendered_target_metric_changed",
  "required_instruments_preserved",
  "no_clipping",
  "no_low_level_proof_window",
]);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

const asRecord = (value: unknown): Record<string, unknown> => (
  isRecord(value) ? value : {}
);

const asNumber = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const formatLevel = (value: number | undefined): string => (
  Number.isFinite(value) ? Number(value).toFixed(2) : "current"
);

function getRecommendedCandidate(packet: HumanReviewPacket): Record<string, unknown> {
  const recommendation = asRecord(packet.recommendation);
  const candidate = asRecord(recommendation.candidate);
  if (Object.keys(candidate).length) return candidate;

  const summaryAction = asRecord(packet.recommendationAction);
  if (Object.keys(summaryAction).length) {
    return {
      label: typeof packet.recommendation === "string" ? packet.recommendation : undefined,
      action: summaryAction,
    };
  }

  return {};
}

export function getNeonApprovedCandidateFromReviewPacket(
  proofOrPacket: unknown,
): NeonApprovedCandidateProfileCandidate | null {
  const packet = requireHumanReviewPacket(proofOrPacket);
  const candidate = getRecommendedCandidate(packet);
  const action = asRecord(candidate.action);
  if (action.type !== "set_mixer_level") return null;

  const track = typeof action.track === "string" ? action.track : "";
  const to = asNumber(action.to);
  if (!track || to === undefined) return null;

  const from = asNumber(action.from);
  const delta = asNumber(action.delta);
  const label = typeof candidate.label === "string" && candidate.label.trim()
    ? candidate.label
    : `${track} ${delta && delta > 0 ? "+" : ""}${delta?.toFixed(2) ?? ""}`.trim();

  return {
    track,
    from,
    value: to,
    label,
    claim: `Apply the reviewed ${track} level candidate from ${formatLevel(from)} to ${formatLevel(to)} and verify it still preserves Neon proof invariants.`,
    expectedReceipts: [...EXPECTED_MIX_LEVEL_CLAIM_RECEIPTS],
    metadata: delta === undefined ? undefined : { delta },
  };
}

export function buildNeonApprovedCandidateProfileFromReviewPacket(
  proofOrPacket: unknown,
  options: NeonApprovedCandidateProfileOptions = {},
): RiddleProofProfile {
  const packet = requireHumanReviewPacket(proofOrPacket);
  const candidate = getNeonApprovedCandidateFromReviewPacket(packet);
  if (!candidate) {
    throw new Error("No Neon set_mixer_level recommendation found in human_review_packet");
  }

  const profile = instantiateRiddleProofProfile(APPROVED_CANDIDATE_PROFILE, options);
  profile.name = options.name ?? `${profile.name}-from-review-packet`;
  profile.metadata = {
    ...(profile.metadata ?? {}),
    candidate_source: "human_review_packet_recommendation",
    candidate_source_status: typeof packet.status === "string" ? packet.status : null,
    purpose: "Apply and verify the already-selected Neon claim candidate from a prior human-review packet without rerunning the full candidate search.",
  };

  const setupActions = profile.target.setup_actions ?? [];
  const applyAction = setupActions.find((action) => (
    action.type === "window_call"
    && action.label === "apply-approved-claim-candidate"
  )) as { args?: unknown[] } | undefined;
  const loopArgs = asRecord(applyAction?.args?.[0]);
  if (!applyAction || !loopArgs || !Object.keys(loopArgs).length) {
    throw new Error("Neon approved-candidate profile is missing apply-approved-claim-candidate args");
  }

  loopArgs.focusTracks = [candidate.track];
  loopArgs.maxIterations = 1;
  loopArgs.candidates = [candidate];
  loopArgs.intent = `apply reviewed candidate: ${candidate.label ?? candidate.track}`;
  if (options.approval) loopArgs.approval = options.approval;
  applyAction.args = [loopArgs];

  return profile;
}

export function createNeonApprovedCandidateProfileArtifacts(
  proofOrPacket: unknown,
  options: NeonApprovedCandidateProfileOptions = {},
): NeonApprovedCandidateProfileArtifacts {
  const packet = requireHumanReviewPacket(proofOrPacket);
  const candidate = getNeonApprovedCandidateFromReviewPacket(packet);
  if (!candidate) {
    throw new Error("No Neon set_mixer_level recommendation found in human_review_packet");
  }
  const profile = buildNeonApprovedCandidateProfileFromReviewPacket(packet, options);
  return {
    packet,
    candidate,
    profile,
    json: `${JSON.stringify(profile, null, 2)}\n`,
  };
}
