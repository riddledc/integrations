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

const formatNumber = (value: number): string => {
  if (!Number.isFinite(value) || Number.isInteger(value)) return String(value);
  const abs = Math.abs(value);
  const digits = abs > 0 && abs < 0.001 ? 6 : 4;
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0 && value !== 0) {
    return value.toExponential(2).replace(/\.?0+e/u, "e");
  }
  return String(rounded);
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "not captured";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
};

const formatCodeValue = (value: unknown): string => `\`${formatValue(value)}\``;

const escapeTableCell = (value: unknown): string => formatValue(value).replace(/\|/gu, "\\|");

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

const summarizeReceiptStatus = (candidate: Record<string, unknown>): string => {
  const receipts = asArray(candidate.receipts).map(asRecord).filter(Boolean);
  if (!receipts.length) return "not captured";
  const failed = receipts.filter((receipt) => receipt?.ok !== true);
  if (!failed.length) return `pass (${receipts.length})`;
  return `fail (${failed.map((receipt) => formatValue(receipt?.name)).join(", ")})`;
};

const formatTargetMovement = (candidate: Record<string, unknown>): string => {
  const movement = asRecord(candidate.targetMovement);
  const deltas = asRecord(movement?.deltas);
  if (!movement || !deltas) return "not captured";
  const track = formatValue(movement.track);
  const rms = formatValue(deltas.rms);
  const peak = formatValue(deltas.peak);
  const energy = formatValue(deltas.totalEnergy);
  return `${track}: rms ${rms}, peak ${peak}, energy ${energy}`;
};

const formatSectionEnergySummary = (candidate: Record<string, unknown>): string => {
  const comparison = asRecord(candidate.sectionEnergyComparison);
  if (!comparison) return "";
  const floors = comparison.requiredSectionEnergyFloorsPreserved;
  const guardrails = comparison.guardrailsPreserved;
  const loudness = formatValue(comparison.averageAbsLoudnessDelta);
  const energy = formatValue(comparison.averageAbsEnergyDelta);
  return [
    `${formatValue(comparison.sectionCount)} section(s)`,
    `floors ${formatValue(floors)}`,
    `guardrails ${formatValue(guardrails)}`,
    `avg |loudness-style Δ| ${loudness}`,
    `avg |energy Δ| ${energy}`,
  ].join("; ");
};

const uniqueValues = (values: unknown[]): string[] => (
  [...new Set(values.map(formatValue).filter((value) => value && value !== "not captured"))]
);

const formatSectionGuardrailSummary = (section: Record<string, unknown>): string => {
  const guardrails = asRecord(section.guardrails);
  if (!guardrails) return "not captured";
  const headroom = Number(guardrails.headroomDb);
  const minHeadroom = Number(guardrails.minHeadroomDb);
  const violations = uniqueValues(asArray(guardrails.violated));
  return [
    `clip ${guardrails.clipping ? "violated" : "ok"}`,
    `low-level ${guardrails.lowLevel ? "violated" : "ok"}`,
    `headroom ${Number.isFinite(headroom) ? `${formatNumber(headroom)} dB` : "not captured"}`
      + (Number.isFinite(minHeadroom) ? ` (floor ${formatNumber(minHeadroom)} dB)` : ""),
    `violations ${violations.length ? violations.join(", ") : "none"}`,
  ].join("; ");
};

const formatCandidateGuardrailSummary = (candidate: Record<string, unknown>): string => {
  const comparison = asRecord(candidate.sectionEnergyComparison);
  const sections = asArray(comparison?.sections)
    .map(asRecord)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  if (!comparison || !sections.length) return "not captured";

  const guards = sections
    .map((section) => asRecord(section.guardrails))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  const headrooms = guards
    .map((guardrail) => Number(guardrail.headroomDb))
    .filter(Number.isFinite);
  const floorFromComparison = Number(asRecord(comparison.floors)?.minHeadroomDb);
  const floorFromSections = guards
    .map((guardrail) => Number(guardrail.minHeadroomDb))
    .filter(Number.isFinite);
  const headroomFloor = Number.isFinite(floorFromComparison)
    ? floorFromComparison
    : (floorFromSections.length ? Math.min(...floorFromSections) : null);
  const violations = uniqueValues(guards.flatMap((guardrail) => asArray(guardrail.violated)));
  return [
    `clip ${guards.some((guardrail) => guardrail.clipping === true) ? "violated" : "ok"}`,
    `low-level ${guards.some((guardrail) => guardrail.lowLevel === true) ? "violated" : "ok"}`,
    `min headroom ${headrooms.length ? `${formatNumber(Math.min(...headrooms))} dB` : "not captured"}`
      + (headroomFloor !== null ? ` (floor ${formatNumber(headroomFloor)} dB)` : ""),
    `violations ${violations.length ? violations.join(", ") : "none"}`,
  ].join("; ");
};

const formatTrackedInstrumentEnergy = (section: Record<string, unknown>): string => {
  const entries = asArray(section.trackedInstruments)
    .map(asRecord)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  if (!entries.length) return "not captured";
  return entries.map((entry) => {
    const baseline = asRecord(entry.baseline) ?? {};
    const candidate = asRecord(entry.candidate) ?? {};
    const delta = asRecord(entry.delta) ?? {};
    return [
      formatValue(entry.name),
      `rms ${formatValue(baseline.rms)} -> ${formatValue(candidate.rms)} (${formatValue(delta.rms)})`,
      `energy ${formatValue(baseline.totalEnergy)} -> ${formatValue(candidate.totalEnergy)} (${formatValue(delta.totalEnergy)})`,
    ].join(": ");
  }).join("; ");
};

const candidateLabel = (candidate: Record<string, unknown>): string => (
  formatValue(candidate.label ?? formatAction(candidate.action))
);

const candidateHasSectionEnergy = (candidate: unknown): candidate is Record<string, unknown> => {
  const record = asRecord(candidate);
  const comparison = asRecord(record?.sectionEnergyComparison);
  return Boolean(comparison && asArray(comparison.sections).length);
};

const candidateHasLoudnessConsequences = (candidate: unknown): candidate is Record<string, unknown> => {
  const record = asRecord(candidate);
  const comparison = asRecord(record?.loudnessConsequenceComparison);
  return Boolean(comparison && asArray(comparison.sections).length);
};

const addSectionEnergyTable = (
  lines: string[],
  candidate: Record<string, unknown>,
  heading: string,
) => {
  const comparison = asRecord(candidate.sectionEnergyComparison);
  const sections = asArray(comparison?.sections)
    .map(asRecord)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  if (!comparison || !sections.length) return;

  lines.push(
    "",
    heading,
    "",
    `- candidate: ${formatCodeValue(candidateLabel(candidate))}`,
    `- role: ${formatCodeValue(comparison.role)}`,
    `- required_section_energy_floors_preserved: ${formatCodeValue(comparison.requiredSectionEnergyFloorsPreserved)}`,
    `- guardrails_preserved: ${formatCodeValue(comparison.guardrailsPreserved)}`,
    `- boundary: ${formatValue(comparison.boundary)}`,
    "",
    "| Section | Baseline Energy | Candidate Energy | Delta | Tracked Instruments | Floors | Guardrails |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  );

  for (const section of sections) {
    const baseline = asRecord(section.baseline) ?? {};
    const after = asRecord(section.candidate) ?? {};
    const delta = asRecord(section.delta) ?? {};
    lines.push([
      escapeTableCell(section.label ?? section.name),
      escapeTableCell(`rms ${formatValue(baseline.rms)}, energy ${formatValue(baseline.totalEnergy)}, loudness-style ${formatValue(baseline.loudnessStyleLufs)}`),
      escapeTableCell(`rms ${formatValue(after.rms)}, energy ${formatValue(after.totalEnergy)}, loudness-style ${formatValue(after.loudnessStyleLufs)}`),
      escapeTableCell(`rms ${formatValue(delta.rms)}, energy ${formatValue(delta.totalEnergy)}, loudness-style ${formatValue(delta.loudnessStyleLufs)}`),
      escapeTableCell(formatTrackedInstrumentEnergy(section)),
      escapeTableCell(section.requiredEnergyFloorsPreserved),
      escapeTableCell(formatSectionGuardrailSummary(section)),
    ].join(" | ").replace(/^/u, "| ").replace(/$/u, " |"));
  }
};

const addAllCandidateSectionEnergyTables = (
  lines: string[],
  supportedCandidates: unknown[],
  rejectedCandidates: unknown[],
) => {
  const supportedRows = supportedCandidates
    .filter(candidateHasSectionEnergy)
    .map((candidate) => ({ group: "Supported", candidate }));
  const rejectedRows = rejectedCandidates
    .filter(candidateHasSectionEnergy)
    .map((candidate) => ({ group: "Rejected", candidate }));
  const rows = [...supportedRows, ...rejectedRows];
  if (!rows.length) return;

  lines.push(
    "",
    "## Candidate Section Energy Details",
    "",
    "These loudness-style and section-energy comparisons are review aids. They rank and reject candidates by objective receipts; they do not prove subjective mix quality.",
  );

  for (const { group, candidate } of rows) {
    addSectionEnergyTable(lines, candidate, `### ${group}: ${candidateLabel(candidate)}`);
  }
};

const formatExpectedLoudnessRange = (range: Record<string, unknown>): string => {
  const min = range.minDeltaDb;
  const max = range.maxDeltaDb;
  const source = range.source;
  const magnitude = range.magnitude;
  const direction = range.direction;
  return [
    `${formatValue(min)} to ${formatValue(max)} dB`,
    `source ${formatValue(source)}`,
    `magnitude ${formatValue(magnitude)}`,
    `direction ${formatValue(direction)}`,
  ].join("; ");
};

const addAllCandidateLoudnessConsequenceTables = (
  lines: string[],
  supportedCandidates: unknown[],
  rejectedCandidates: unknown[],
) => {
  const supportedRows = supportedCandidates
    .filter(candidateHasLoudnessConsequences)
    .map((candidate) => ({ group: "Supported", candidate }));
  const rejectedRows = rejectedCandidates
    .filter(candidateHasLoudnessConsequences)
    .map((candidate) => ({ group: "Rejected", candidate }));
  const rows = [...supportedRows, ...rejectedRows];
  if (!rows.length) return;

  lines.push(
    "",
    "## Candidate Loudness Consequences",
    "",
    "Loudness metrics are objective review signals. They can show that a candidate made a section much louder or quieter than expected, but they do not prove subjective mix quality.",
    "",
    "| Group | Candidate | Section | Baseline Loudness | Candidate Loudness | Delta | Expected Delta Range | Status |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  );

  for (const { group, candidate } of rows) {
    const comparison = asRecord(candidate.loudnessConsequenceComparison) ?? {};
    for (const section of asArray(comparison.sections).map(asRecord).filter((entry): entry is Record<string, unknown> => Boolean(entry))) {
      lines.push([
        escapeTableCell(group),
        escapeTableCell(candidateLabel(candidate)),
        escapeTableCell(section.label ?? section.name),
        escapeTableCell(`${formatValue(section.baselineLoudness)} dB`),
        escapeTableCell(`${formatValue(section.candidateLoudness)} dB`),
        escapeTableCell(`${formatValue(section.loudnessDelta)} dB`),
        escapeTableCell(formatExpectedLoudnessRange(asRecord(section.expectedDeltaRange) ?? {})),
        escapeTableCell(`${formatValue(section.status)} (${formatValue(section.severity)})`),
      ].join(" | ").replace(/^/u, "| ").replace(/$/u, " |"));
    }
  }
};

const candidateHasActiveLaneReceipt = (candidate: unknown): candidate is Record<string, unknown> => {
  const record = asRecord(candidate);
  return Boolean(asRecord(record?.activeLaneReceipt));
};

const formatMissingActiveWindows = (receipt: Record<string, unknown>): string => {
  const missing = asArray(receipt.missingWindows)
    .map(asRecord)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((windowSummary) => {
      const label = windowSummary.label ?? windowSummary.name ?? "window";
      const missingTracks = asArray(windowSummary.missingRequiredActive).map(formatValue).join(", ");
      return `${formatValue(label)}: ${missingTracks || "none"}`;
    });
  return missing.length ? missing.join("; ") : "none";
};

const formatActiveLaneWindowCoverage = (receipt: Record<string, unknown>): string => (
  `${formatValue(receipt.requiredWindowCount)} / ${formatValue(receipt.windowCount)}`
);

const addActiveLaneReceiptTable = (
  lines: string[],
  supportedCandidates: unknown[],
  rejectedCandidates: unknown[],
) => {
  const supportedRows = supportedCandidates
    .filter(candidateHasActiveLaneReceipt)
    .map((candidate) => ({ group: "Supported", candidate }));
  const rejectedRows = rejectedCandidates
    .filter(candidateHasActiveLaneReceipt)
    .map((candidate) => ({ group: "Rejected", candidate }));
  const rows = [...supportedRows, ...rejectedRows];
  if (!rows.length) return;

  lines.push(
    "",
    "## Active Lane Receipts",
    "",
    "These receipts show whether declared required lanes stayed measurable in each proof window. They support deterministic guardrails only; they do not prove subjective mix quality.",
    "",
    "| Group | Candidate | Status | Windows | Required Tracks | Missing Required Active |",
    "| --- | --- | --- | --- | --- | --- |",
  );

  for (const { group, candidate } of rows) {
    const receipt = asRecord(candidate.activeLaneReceipt) ?? {};
    lines.push([
      escapeTableCell(group),
      escapeTableCell(candidateLabel(candidate)),
      escapeTableCell(receipt.status),
      escapeTableCell(formatActiveLaneWindowCoverage(receipt)),
      escapeTableCell(asArray(receipt.requiredTracks).map(formatValue).join(", ") || "none declared"),
      escapeTableCell(formatMissingActiveWindows(receipt)),
    ].join(" | ").replace(/^/u, "| ").replace(/$/u, " |"));
  }
};

const addCandidateTable = (lines: string[], heading: string, candidates: unknown[]) => {
  const rows = candidates
    .map(asRecord)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  if (!rows.length) return;
  const includeGuardrailColumn = rows.some((candidate) => Boolean(asRecord(candidate.sectionEnergyComparison)));
  lines.push(
    "",
    `## ${heading}`,
    "",
    includeGuardrailColumn
      ? "| Candidate | Action | Target Movement | Receipts | Guardrails | Ranking |"
      : "| Candidate | Action | Target Movement | Receipts | Ranking |",
    includeGuardrailColumn
      ? "| --- | --- | --- | --- | --- | --- |"
      : "| --- | --- | --- | --- | --- |",
  );
  for (const candidate of rows) {
    const failedReceipts = asArray(candidate?.failedReceipts).map(formatValue).join(", ");
    const receiptStatus = failedReceipts || summarizeReceiptStatus(candidate);
    const sectionSummary = formatSectionEnergySummary(candidate);
    const cells = [
      escapeTableCell(candidate?.label),
      escapeTableCell(formatAction(candidate?.action)),
      escapeTableCell(formatTargetMovement(candidate)),
      escapeTableCell(receiptStatus),
      escapeTableCell(sectionSummary ? `${formatValue(candidate?.rankingMetric)}; ${sectionSummary}` : candidate?.rankingMetric),
    ];
    if (includeGuardrailColumn) {
      cells.splice(4, 0, escapeTableCell(formatCandidateGuardrailSummary(candidate)));
    }
    lines.push(cells.join(" | ").replace(/^/u, "| ").replace(/$/u, " |"));
  }
};

const addOptionalList = (lines: string[], heading: string, values: unknown) => {
  const entries = asArray(values).filter((entry) => entry !== null && entry !== undefined && entry !== "");
  if (!entries.length) return;
  lines.push("", `## ${heading}`, "");
  for (const entry of entries) lines.push(`- ${formatValue(entry)}`);
};

const hasRecommendationCandidate = (candidate: Record<string, unknown>): boolean => (
  Object.keys(candidate).some((key) => candidate[key] !== null && candidate[key] !== undefined)
);

const isNoSupportedCandidatePacket = (
  packet: HumanReviewPacket,
  recommendation: Record<string, unknown>,
  candidate: Record<string, unknown>,
  supportedCandidates: unknown[],
): boolean => (
  recommendation.action === "inspect_failed_receipts"
  || packet.status === "needs_followup"
  || (!supportedCandidates.length && !hasRecommendationCandidate(candidate))
);

const noSupportedCandidateFollowUpPrompts = [
  "Inspect failed receipts before choosing or applying any candidate.",
  "Check whether the proof window declared the right required active lanes.",
  "Check whether the app contract and source readiness exposed the needed audio lanes.",
  "Revise the claim, proof window, or candidate ladder, then rerun proof.",
];

const noSupportedCandidateCaveats = [
  "This packet does not prove subjective mix quality.",
  "No candidate satisfied every objective receipt in this bounded run.",
  "Failed receipts are deterministic follow-up cues, not taste judgments.",
  "Do not apply a candidate from this packet without a later supported-candidate proof.",
];

const supportedCandidateCaveatPattern = /\bsupported candidate\b|keep or apply|apply the candidate/iu;

const noSupportedCandidateCaveatList = (packet: HumanReviewPacket): string[] => uniqueValues([
  ...noSupportedCandidateCaveats,
  ...asArray(packet.caveats).filter((entry) => !supportedCandidateCaveatPattern.test(formatValue(entry))),
]);

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
  const approval = asRecord(request.approval) ?? {};
  const supportedCandidates = asArray(packet.supportedCandidates);
  const rejectedCandidates = asArray(packet.rejectedCandidates);
  const noSupportedCandidatePacket = isNoSupportedCandidatePacket(
    packet,
    recommendation,
    candidate,
    supportedCandidates,
  );
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
    `- approved_candidate_applied: ${formatCodeValue(guardrails.approvedCandidateApplied)}`,
    `- approval_mode: ${formatCodeValue(approval.mode)}`,
    `- approval_basis: ${formatValue(approval.basis)}`,
    "",
    "## Ranking",
    "",
    `- metric: ${formatCodeValue(ranking.metric)}`,
    `- role: ${formatCodeValue(ranking.role)}`,
    `- lower_is_better: ${formatCodeValue(ranking.lowerIsBetter)}`,
    `- baseline: ${formatCodeValue(ranking.baselineCandidateRankingMetric)}`,
    `- best: ${formatCodeValue(ranking.bestCandidateRankingMetric)}`,
    `- delta: ${formatCodeValue(ranking.rankingMetricDelta)}`,
  ];

  addCandidateTable(lines, "Supported Candidates", supportedCandidates);
  addCandidateTable(lines, "Rejected Candidates", rejectedCandidates);
  addAllCandidateSectionEnergyTables(lines, supportedCandidates, rejectedCandidates);
  addAllCandidateLoudnessConsequenceTables(lines, supportedCandidates, rejectedCandidates);
  addActiveLaneReceiptTable(lines, supportedCandidates, rejectedCandidates);

  lines.push("", "## Boundary", "", formatValue(packet.proofBoundary));

  if (noSupportedCandidatePacket) {
    addOptionalList(lines, "Follow-Up Prompts", noSupportedCandidateFollowUpPrompts);
    addOptionalList(lines, "Caveats", noSupportedCandidateCaveatList(packet));
  } else {
    addOptionalList(lines, "Listening Prompts", packet.listenerPrompts);
    addOptionalList(lines, "Caveats", packet.caveats);
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
