import { requireHumanReviewPacket, type HumanReviewPacket } from "./humanReviewPacket";

export interface MixingCanonSurrogateReviewOptions {
  approvedBy?: string;
  maxAbsLevelDelta?: number;
  requireSectionEnergyComparison?: boolean;
}

export interface MixingCanonSurrogateReviewCheck {
  name: string;
  ok: boolean;
  severity: "required";
  evidence?: Record<string, unknown>;
}

export interface MixingCanonSurrogateReview {
  version: "riddle-proof.mixing-canon-surrogate-review.v1";
  kind: "mixing_canon_surrogate_review";
  status: "approved_for_development_application" | "needs_human_review";
  ok: boolean;
  approval: {
    mode: "mixing_canon_surrogate";
    approvedBy: string;
    basis: string;
  } | null;
  candidate: {
    label: string | null;
    action: {
      type: string | null;
      track: string | null;
      from: number | null;
      to: number | null;
      delta: number | null;
    };
  };
  checks: MixingCanonSurrogateReviewCheck[];
  failedChecks: string[];
  boundary: string;
  caveats: string[];
  doesNotProve: string[];
}

const DEFAULT_MAX_ABS_LEVEL_DELTA = 0.12;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

const asRecord = (value: unknown): Record<string, unknown> => (
  isRecord(value) ? value : {}
);

const asArray = (value: unknown): unknown[] => (
  Array.isArray(value) ? value : []
);

const asNumber = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const round = (value: unknown, digits = 4): number | null => {
  const number = asNumber(value);
  return number === null ? null : Number(number.toFixed(digits));
};

const formatNumber = (value: unknown): string => {
  const number = asNumber(value);
  if (number === null) return "unknown";
  return Number(number.toFixed(4)).toString();
};

const lowerText = (value: unknown): string => (
  typeof value === "string" ? value.toLowerCase() : ""
);

const getRecommendedCandidate = (packet: HumanReviewPacket): Record<string, unknown> => {
  const recommendation = asRecord(packet.recommendation);
  return asRecord(recommendation.candidate);
};

const getCandidateAction = (candidate: Record<string, unknown>) => {
  const action = asRecord(candidate.action);
  const from = asNumber(action.from);
  const to = asNumber(action.to);
  const explicitDelta = asNumber(action.delta);
  const delta = explicitDelta ?? (from !== null && to !== null ? to - from : null);
  return {
    type: typeof action.type === "string" ? action.type : null,
    track: typeof action.track === "string" ? action.track : null,
    from: round(from),
    to: round(to),
    delta: round(delta),
  };
};

const receiptPassCount = (candidate: Record<string, unknown>) => {
  const receipts = asArray(candidate.receipts).map(asRecord);
  return {
    total: receipts.length,
    passed: receipts.filter((receipt) => receipt.ok === true).length,
    failed: receipts.filter((receipt) => receipt.ok !== true).map((receipt) => String(receipt.name ?? "unnamed_receipt")),
  };
};

const allObjectBooleansPreserved = (value: unknown): boolean => (
  Object.values(asRecord(value)).every((entry) => typeof entry !== "boolean" || entry)
);

const requestedDirection = (packet: HumanReviewPacket): "down" | "up" | null => {
  const request = asRecord(packet.request);
  const claimTarget = asRecord(request.claimTarget);
  const direction = claimTarget.direction;
  return direction === "down" || direction === "up" ? direction : null;
};

const targetMovementMatchesDirection = (
  candidate: Record<string, unknown>,
  direction: "down" | "up" | null,
): boolean => {
  if (!direction) return true;
  const movement = asRecord(candidate.targetMovement);
  const deltas = asRecord(movement.deltas);
  const values = [deltas.rms, deltas.peak, deltas.totalEnergy]
    .map(asNumber)
    .filter((value): value is number => value !== null);
  if (!values.length) return false;
  return direction === "down"
    ? values.some((value) => value < 0)
    : values.some((value) => value > 0);
};

const sectionEnergyCheck = (
  candidate: Record<string, unknown>,
  requireSectionEnergyComparison: boolean,
): MixingCanonSurrogateReviewCheck => {
  const comparison = asRecord(candidate.sectionEnergyComparison);
  const hasComparison = Object.keys(comparison).length > 0;
  const ok = hasComparison
    ? comparison.requiredSectionEnergyFloorsPreserved === true && comparison.guardrailsPreserved === true
    : !requireSectionEnergyComparison;
  return {
    name: "section_energy_guardrails_preserved",
    ok,
    severity: "required",
    evidence: {
      requiredSectionEnergyComparison: requireSectionEnergyComparison,
      hasComparison,
      requiredSectionEnergyFloorsPreserved: comparison.requiredSectionEnergyFloorsPreserved ?? null,
      guardrailsPreserved: comparison.guardrailsPreserved ?? null,
      violationCount: comparison.violationCount ?? null,
    },
  };
};

const tasteBoundaryPresent = (packet: HumanReviewPacket): boolean => {
  const text = [
    packet.proofBoundary,
    ...asArray(packet.caveats),
    ...asArray(packet.listenerPrompts),
  ].map(lowerText).join("\n");
  return (
    text.includes("does not prove subjective")
    || text.includes("musical taste still requires")
    || text.includes("not prove subjective mix quality")
  );
};

const buildBasis = (
  candidateLabel: string | null,
  action: ReturnType<typeof getCandidateAction>,
  maxAbsLevelDelta: number,
): string => [
  "Conservative mixing-canon development surrogate:",
  candidateLabel ? `review candidate ${candidateLabel}` : "the recommended review candidate",
  action.track ? `sets ${action.track} from ${formatNumber(action.from)} to ${formatNumber(action.to)}` : "uses a bounded mixer-level edit",
  `with absolute level delta <= ${formatNumber(maxAbsLevelDelta)}`,
  "after objective receipts, section-energy guardrails, clipping/headroom/low-level checks, and state-restoration checks passed.",
  "This keeps development moving and still requires listening review before treating the result as a subjective mix preference.",
].join(" ");

export function createMixingCanonSurrogateReview(
  proofOrPacket: unknown,
  options: MixingCanonSurrogateReviewOptions = {},
): MixingCanonSurrogateReview {
  const packet = requireHumanReviewPacket(proofOrPacket);
  const candidate = getRecommendedCandidate(packet);
  const action = getCandidateAction(candidate);
  const receipts = receiptPassCount(candidate);
  const guardrails = asRecord(packet.guardrails);
  const sectionRequired = options.requireSectionEnergyComparison ?? true;
  const maxAbsLevelDelta = options.maxAbsLevelDelta ?? DEFAULT_MAX_ABS_LEVEL_DELTA;
  const direction = requestedDirection(packet);
  const absDelta = action.delta === null ? null : Math.abs(action.delta);
  const label = typeof candidate.label === "string" ? candidate.label : null;

  const checks: MixingCanonSurrogateReviewCheck[] = [
    {
      name: "packet_ready_for_listening_review",
      ok: packet.status === "candidate_ready_for_listening_review",
      severity: "required",
      evidence: { status: packet.status ?? null },
    },
    {
      name: "recommended_set_mixer_level_candidate",
      ok: action.type === "set_mixer_level"
        && Boolean(action.track)
        && action.to !== null
        && action.delta !== null,
      severity: "required",
      evidence: { action },
    },
    {
      name: "candidate_delta_is_conservative",
      ok: absDelta !== null && absDelta > 0 && absDelta <= maxAbsLevelDelta,
      severity: "required",
      evidence: { absDelta, maxAbsLevelDelta },
    },
    {
      name: "objective_candidate_receipts_pass",
      ok: receipts.total > 0 && receipts.failed.length === 0 && asArray(candidate.failedReceipts).length === 0,
      severity: "required",
      evidence: {
        receiptCount: receipts.total,
        passedReceiptCount: receipts.passed,
        failedReceipts: [...receipts.failed, ...asArray(candidate.failedReceipts).map(String)],
      },
    },
    {
      name: "candidate_matches_requested_direction",
      ok: targetMovementMatchesDirection(candidate, direction),
      severity: "required",
      evidence: {
        requestedDirection: direction,
        targetMovement: asRecord(candidate.targetMovement).deltas ?? null,
      },
    },
    sectionEnergyCheck(candidate, sectionRequired),
    {
      name: "packet_guardrails_preserved",
      ok: Boolean(guardrails.supportedClaimCandidateCount)
        && guardrails.stateRestoredAfterLoop === true
        && guardrails.noPermanentEditUnlessApplyBest === true
        && allObjectBooleansPreserved(asRecord(candidate.guardrails)),
      severity: "required",
      evidence: {
        supportedClaimCandidateCount: guardrails.supportedClaimCandidateCount ?? null,
        stateRestoredAfterLoop: guardrails.stateRestoredAfterLoop ?? null,
        noPermanentEditUnlessApplyBest: guardrails.noPermanentEditUnlessApplyBest ?? null,
        candidateGuardrails: candidate.guardrails ?? null,
      },
    },
    {
      name: "ranking_is_review_order_only",
      ok: asRecord(packet.ranking).role === "review_order_only",
      severity: "required",
      evidence: {
        rankingMetric: asRecord(packet.ranking).metric ?? null,
        rankingRole: asRecord(packet.ranking).role ?? null,
      },
    },
    {
      name: "taste_boundary_is_explicit",
      ok: tasteBoundaryPresent(packet),
      severity: "required",
      evidence: {
        proofBoundary: packet.proofBoundary ?? null,
        caveatCount: asArray(packet.caveats).length,
      },
    },
  ];

  const failedChecks = checks.filter((check) => !check.ok).map((check) => check.name);
  const ok = failedChecks.length === 0;
  const approval = ok ? {
    mode: "mixing_canon_surrogate" as const,
    approvedBy: options.approvedBy ?? "codex",
    basis: buildBasis(label, action, maxAbsLevelDelta),
  } : null;

  return {
    version: "riddle-proof.mixing-canon-surrogate-review.v1",
    kind: "mixing_canon_surrogate_review",
    status: ok ? "approved_for_development_application" : "needs_human_review",
    ok,
    approval,
    candidate: {
      label,
      action,
    },
    checks,
    failedChecks,
    boundary: "A mixing-canon surrogate can approve a conservative candidate for development application only after objective receipts pass. It does not prove subjective mix quality.",
    caveats: [
      "This approval surrogate is not a real listener preference.",
      "Use it to keep development moving when the candidate is subtle, reversible, metric-supported, and guardrail-preserving.",
      "Keep the final result framed as ready for listening review, not as a taste verdict.",
    ],
    doesNotProve: [
      "subjective mix quality",
      "that a human listener prefers the candidate",
      "that the candidate is the best possible mix edit",
    ],
  };
}
