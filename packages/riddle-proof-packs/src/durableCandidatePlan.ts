import {
  requireHumanReviewPacket,
  type HumanReviewPacket,
} from "./humanReviewPacket";

export interface DurableCandidatePatchPlanOptions {
  title?: string;
  sourceFile?: string;
  requireTargetLabel?: boolean;
  requireMixProfileId?: boolean;
  allowedApprovalModes?: readonly string[];
  allowedActionTypes?: readonly string[];
}

export interface DurableCandidatePatchPlanArtifacts {
  plan: DurableCandidatePatchPlan;
  json: string;
  markdown: string;
}

export type DurableCandidatePatchPlan = {
  version: "riddle-proof.durable-candidate-patch-plan.v1";
  kind: "durable_candidate_patch_plan";
  status: "ready_for_durable_patch" | "not_ready_for_durable_patch";
  ok: boolean;
  errors: string[];
  source: {
    packetStatus: unknown;
    recommendationAction: unknown;
    rankingRole: unknown;
    proofBoundary: unknown;
  };
  target: {
    label: string | null;
    route: string | null;
    mixProfileId: string | null;
  };
  candidate: {
    label: unknown;
    action: {
      type: unknown;
      track: unknown;
      from: number | null;
      to: number | null;
      delta: number | null;
    };
  };
  approval: {
    mode: unknown;
    approvedBy: unknown;
    basis: unknown;
  };
  durableEdit: null | {
    sourceFile: string | null;
    target: {
      label: string | null;
      route: string | null;
      mixProfileId: string | null;
    };
    action: {
      type: unknown;
      track: unknown;
      from: number | null;
      to: number | null;
      delta: number | null;
    };
    mixerLevels: Record<string, number> | null;
    provenance: {
      humanReviewPacketStatus: unknown;
      recommendationLabel: unknown;
      approvalMode: unknown;
      approvedBy: unknown;
      basis: unknown;
    };
    doesNotProve: string[];
  };
  boundary: string;
  caveats: string[];
};

const DEFAULT_APPROVAL_MODES = ["operator_approved", "mixing_canon_surrogate"] as const;
const DEFAULT_ACTION_TYPES = ["set_mixer_level"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

const asRecord = (value: unknown): Record<string, unknown> => (
  isRecord(value) ? value : {}
);

const getPath = (value: unknown, path: string): unknown => {
  let cursor = value;
  for (const part of path.split(".")) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
};

const asFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(4)) : null;
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "not captured";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
};

const formatCodeValue = (value: unknown): string => `\`${formatValue(value)}\``;

const selectedTargetLabel = (packet: HumanReviewPacket): string | null => {
  const value = (
    getPath(packet, "target.selectedSong.selectedSong")
    ?? getPath(packet, "target.routeState.selectedSong")
    ?? getPath(packet, "target.label")
  );
  return typeof value === "string" && value.trim() ? value : null;
};

const selectedRoute = (packet: HumanReviewPacket): string | null => {
  const value = (
    getPath(packet, "target.routeState.route")
    ?? getPath(packet, "target.routeState.path")
    ?? getPath(packet, "target.route")
  );
  return typeof value === "string" && value.trim() ? value : null;
};

const selectedMixProfileId = (packet: HumanReviewPacket): string | null => {
  const value = (
    getPath(packet, "recommendation.candidate.summary.mixProfile.id")
    ?? getPath(packet, "baseline.mixProfile.id")
    ?? getPath(packet, "target.mixProfile.id")
  );
  return typeof value === "string" && value.trim() ? value : null;
};

export function createDurableCandidatePatchPlan(
  proofOrPacket: unknown,
  options: DurableCandidatePatchPlanOptions = {},
): DurableCandidatePatchPlan {
  const packet = requireHumanReviewPacket(proofOrPacket);
  const recommendation = asRecord(packet.recommendation);
  const candidate = asRecord(recommendation.candidate);
  const action = asRecord(candidate.action);
  const guardrails = asRecord(packet.guardrails);
  const request = asRecord(packet.request);
  const approval = asRecord(request.approval);
  const ranking = asRecord(packet.ranking);
  const proofBoundary = packet.proofBoundary;
  const target = {
    label: selectedTargetLabel(packet),
    route: selectedRoute(packet),
    mixProfileId: selectedMixProfileId(packet),
  };
  const actionType = action.type;
  const actionTrack = action.track;
  const from = asFiniteNumber(action.from);
  const to = asFiniteNumber(action.to);
  const numericDelta = asFiniteNumber(action.delta);
  const delta = numericDelta ?? (from !== null && to !== null ? asFiniteNumber(to - from) : null);
  const allowedApprovalModes = new Set(options.allowedApprovalModes ?? DEFAULT_APPROVAL_MODES);
  const allowedActionTypes = new Set(options.allowedActionTypes ?? DEFAULT_ACTION_TYPES);
  const errors: string[] = [];

  if (packet.status !== "candidate_applied_for_listening_review") {
    errors.push("packet status must be candidate_applied_for_listening_review");
  }
  if (recommendation.action !== "listen_to_applied_candidate") {
    errors.push("recommendation action must be listen_to_applied_candidate");
  }
  if (guardrails.approvedCandidateApplied !== true) {
    errors.push("approvedCandidateApplied guardrail must be true");
  }
  if (request.candidateActionsAreTransient !== false) {
    errors.push("candidateActionsAreTransient must be false before a durable patch handoff");
  }
  if (!approval.mode) {
    errors.push("approval mode is required");
  } else if (!allowedApprovalModes.has(String(approval.mode))) {
    errors.push(`approval mode ${formatValue(approval.mode)} is not allowed for durable patch handoff`);
  }
  if (ranking.role !== "review_order_only") {
    errors.push("ranking role must remain review_order_only");
  }
  if (!String(proofBoundary ?? "").includes("musical taste still requires listening review")) {
    errors.push("proof boundary must preserve the listening-review caveat");
  }
  if (!actionType || !allowedActionTypes.has(String(actionType))) {
    errors.push(`action type ${formatValue(actionType)} is not allowed for durable patch handoff`);
  }
  if (typeof actionTrack !== "string" || !actionTrack.trim()) {
    errors.push("candidate action track is required");
  }
  if (to === null) {
    errors.push("candidate action target value is required");
  }
  if (String(actionType) === "set_mixer_level" && (to === null || to < 0 || to > 1.5)) {
    errors.push("set_mixer_level target must be between 0 and 1.5");
  }
  if (options.requireTargetLabel !== false && !target.label) {
    errors.push("target label is required for a scoped durable patch handoff");
  }
  if (options.requireMixProfileId === true && !target.mixProfileId) {
    errors.push("mixProfileId is required for this durable patch handoff");
  }

  const actionShape = {
    type: actionType ?? null,
    track: actionTrack ?? null,
    from,
    to,
    delta,
  };
  const mixerLevels = !errors.length && String(actionType) === "set_mixer_level" && typeof actionTrack === "string" && to !== null
    ? { [actionTrack]: to }
    : null;

  return {
    version: "riddle-proof.durable-candidate-patch-plan.v1",
    kind: "durable_candidate_patch_plan",
    status: errors.length ? "not_ready_for_durable_patch" : "ready_for_durable_patch",
    ok: errors.length === 0,
    errors,
    source: {
      packetStatus: packet.status ?? null,
      recommendationAction: recommendation.action ?? null,
      rankingRole: ranking.role ?? null,
      proofBoundary: proofBoundary ?? null,
    },
    target,
    candidate: {
      label: candidate.label ?? null,
      action: actionShape,
    },
    approval: {
      mode: approval.mode ?? null,
      approvedBy: approval.approvedBy ?? null,
      basis: approval.basis ?? null,
    },
    durableEdit: errors.length ? null : {
      sourceFile: options.sourceFile ?? null,
      target,
      action: actionShape,
      mixerLevels,
      provenance: {
        humanReviewPacketStatus: packet.status ?? null,
        recommendationLabel: candidate.label ?? null,
        approvalMode: approval.mode ?? null,
        approvedBy: approval.approvedBy ?? null,
        basis: approval.basis ?? null,
      },
      doesNotProve: [
        "subjective mix quality",
        "that the approval surrogate is a real listener preference",
        "all possible candidate edits",
      ],
    },
    boundary: "This is a durable patch handoff for an approved listening-review candidate. It does not prove subjective mix quality.",
    caveats: [
      "A durable patch plan is not a taste verdict.",
      "Ranking orders review only; it is not a universal mix-quality score.",
      "Run a final current-target proof after the durable edit lands.",
    ],
  };
}

export function formatDurableCandidatePatchPlanMarkdown(
  plan: DurableCandidatePatchPlan,
  options: Pick<DurableCandidatePatchPlanOptions, "title"> = {},
): string {
  if (plan.kind !== "durable_candidate_patch_plan") {
    throw new Error("Expected a durable_candidate_patch_plan");
  }

  const lines = [
    `# ${options.title ?? "Durable Candidate Patch Plan"}`,
    "",
    `- status: ${formatCodeValue(plan.status)}`,
    `- ok: ${formatCodeValue(plan.ok)}`,
    `- target_label: ${formatValue(plan.target.label)}`,
    `- mix_profile_id: ${formatCodeValue(plan.target.mixProfileId)}`,
    `- source_file: ${formatCodeValue(plan.durableEdit?.sourceFile)}`,
    "",
    "## Candidate",
    "",
    `- label: ${formatCodeValue(plan.candidate.label)}`,
    `- action: ${formatCodeValue(`${formatValue(plan.candidate.action.type)} ${formatValue(plan.candidate.action.track)}: ${formatValue(plan.candidate.action.from)} -> ${formatValue(plan.candidate.action.to)} (${formatValue(plan.candidate.action.delta)})`)}`,
    "",
    "## Approval Boundary",
    "",
    `- approval_mode: ${formatCodeValue(plan.approval.mode)}`,
    `- approved_by: ${formatCodeValue(plan.approval.approvedBy)}`,
    `- basis: ${formatValue(plan.approval.basis)}`,
    `- boundary: ${formatValue(plan.boundary)}`,
    "",
    "## Durable Edit",
    "",
    `- mixer_levels: ${formatCodeValue(JSON.stringify(plan.durableEdit?.mixerLevels ?? null))}`,
  ];

  if (plan.errors.length) {
    lines.push("", "## Errors", "");
    for (const error of plan.errors) lines.push(`- ${error}`);
  }

  lines.push("", "## Caveats", "");
  for (const caveat of plan.caveats) lines.push(`- ${caveat}`);

  return `${lines.join("\n")}\n`;
}

export function createDurableCandidatePatchPlanArtifacts(
  proofOrPacket: unknown,
  options: DurableCandidatePatchPlanOptions = {},
): DurableCandidatePatchPlanArtifacts {
  const plan = createDurableCandidatePatchPlan(proofOrPacket, options);
  const markdown = formatDurableCandidatePatchPlanMarkdown(plan, {
    title: options.title,
  });
  return {
    plan,
    json: `${JSON.stringify(plan, null, 2)}\n`,
    markdown,
  };
}
