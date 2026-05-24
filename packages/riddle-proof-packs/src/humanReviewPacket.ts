export type HumanReviewPacket = Record<string, unknown> & {
  kind: "human_review_packet";
};

export interface HumanReviewPacketMarkdownOptions {
  title?: string;
}

export interface HumanReviewPacketArtifacts {
  packet: HumanReviewPacket;
  json: string;
  markdown: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

const asRecord = (value: unknown): Record<string, unknown> | null => (
  isRecord(value) ? value : null
);

const asArray = (value: unknown): unknown[] => (
  Array.isArray(value) ? value : []
);

const getPath = (value: unknown, path: string): unknown => {
  let cursor = value;
  for (const part of path.split(".")) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "not captured";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
};

const formatCodeValue = (value: unknown): string => `\`${formatValue(value)}\``;

const formatAction = (action: unknown): string => {
  const record = asRecord(action);
  if (!record) return "not captured";
  const type = record.type ?? "set_mixer_level";
  const track = record.track ?? "track";
  const from = formatValue(record.from);
  const to = formatValue(record.to);
  const delta = record.delta === null || record.delta === undefined ? "" : ` (${formatValue(record.delta)})`;
  return `${type} ${track}: ${from} -> ${to}${delta}`;
};

const addOptionalList = (lines: string[], heading: string, values: unknown) => {
  const entries = asArray(values).filter((entry) => entry !== null && entry !== undefined && entry !== "");
  if (!entries.length) return;
  lines.push("", `## ${heading}`, "");
  for (const entry of entries) lines.push(`- ${formatValue(entry)}`);
};

export function findHumanReviewPacket(value: unknown): HumanReviewPacket | null {
  if (!value || typeof value !== "object") return null;
  if (isRecord(value) && value.kind === "human_review_packet") return value as HumanReviewPacket;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const packet = findHumanReviewPacket(entry);
      if (packet) return packet;
    }
    return null;
  }

  for (const entry of Object.values(value)) {
    const packet = findHumanReviewPacket(entry);
    if (packet) return packet;
  }
  return null;
}

export function requireHumanReviewPacket(value: unknown): HumanReviewPacket {
  const packet = findHumanReviewPacket(value);
  if (!packet) throw new Error("No human_review_packet found");
  return packet;
}

export function formatHumanReviewPacketMarkdown(
  packet: HumanReviewPacket,
  options: HumanReviewPacketMarkdownOptions = {},
): string {
  if (packet.kind !== "human_review_packet") {
    throw new Error("Expected a human_review_packet");
  }

  const recommendation = asRecord(packet.recommendation) ?? {};
  const candidate = asRecord(recommendation.candidate) ?? {};
  const guardrails = asRecord(packet.guardrails) ?? {};
  const ranking = asRecord(packet.ranking) ?? {};
  const request = asRecord(packet.request) ?? {};
  const supportedCandidates = asArray(packet.supportedCandidates);
  const rejectedCandidates = asArray(packet.rejectedCandidates);
  const selectedSong = (
    getPath(packet, "target.selectedSong.selectedSong")
    ?? getPath(packet, "target.routeState.selectedSong")
  );

  const lines = [
    `# ${options.title ?? "Human Review Packet"}`,
    "",
    `- status: ${formatCodeValue(packet.status)}`,
    `- domain: ${formatCodeValue(packet.domain)}`,
    `- evidence_role_pattern: ${formatCodeValue(packet.evidenceRolePattern)}`,
    `- requested_intent: ${formatValue(packet.requestedIntent)}`,
    `- selected_song: ${formatValue(selectedSong)}`,
    "",
    "## Recommendation",
    "",
    `- action: ${formatCodeValue(recommendation.action)}`,
    `- candidate: ${formatCodeValue(candidate.label)}`,
    `- candidate_action: ${formatCodeValue(formatAction(candidate.action))}`,
    `- reason: ${formatValue(recommendation.reason)}`,
    "",
    "## Objective Receipts",
    "",
    `- supported_candidates: ${formatCodeValue(guardrails.supportedClaimCandidateCount ?? supportedCandidates.length)}`,
    `- rejected_candidates: ${formatCodeValue(guardrails.rejectedCandidateCount ?? rejectedCandidates.length)}`,
    `- state_restored_after_loop: ${formatCodeValue(guardrails.stateRestoredAfterLoop)}`,
    `- candidate_actions_are_transient: ${formatCodeValue(request.candidateActionsAreTransient)}`,
    `- no_permanent_edit_unless_apply_best: ${formatCodeValue(guardrails.noPermanentEditUnlessApplyBest)}`,
    "",
    "## Ranking",
    "",
    `- metric: ${formatCodeValue(ranking.metric)}`,
    `- role: ${formatCodeValue(ranking.role)}`,
    `- lower_is_better: ${formatCodeValue(ranking.lowerIsBetter)}`,
    `- baseline: ${formatCodeValue(ranking.baselineCandidateRankingMetric)}`,
    `- best: ${formatCodeValue(ranking.bestCandidateRankingMetric)}`,
    `- delta: ${formatCodeValue(ranking.rankingMetricDelta)}`,
    "",
    "## Boundary",
    "",
    formatValue(packet.proofBoundary),
  ];

  addOptionalList(lines, "Listening Prompts", packet.listenerPrompts);
  addOptionalList(lines, "Caveats", packet.caveats);

  if (rejectedCandidates.length) {
    lines.push("", "## Rejected Candidates", "");
    for (const entry of rejectedCandidates) {
      const rejected = asRecord(entry) ?? {};
      const failedReceipts = asArray(rejected.failedReceipts).map(formatValue).join(", ") || "not captured";
      lines.push(`- ${formatCodeValue(rejected.label)}: ${failedReceipts}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function createHumanReviewPacketArtifacts(
  proofOrPacket: unknown,
  options: HumanReviewPacketMarkdownOptions = {},
): HumanReviewPacketArtifacts {
  const packet = requireHumanReviewPacket(proofOrPacket);
  const markdown = formatHumanReviewPacketMarkdown(packet, options);
  return {
    packet,
    json: `${JSON.stringify(packet, null, 2)}\n`,
    markdown,
  };
}
