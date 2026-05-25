export interface AudioSectionHeuristicOptions {
  requiredRmsFloor?: number;
  requiredPeakFloor?: number;
  requiredTotalEnergyFloor?: number;
  minHeadroomDb?: number;
  trackedInstruments?: string[];
}

export interface AudioSectionEnergySummary {
  rms: number | null;
  peak: number | null;
  totalEnergy: number | null;
  loudnessStyleLufs: number | null;
  headroomDb: number | null;
  clipping: boolean;
  lowLevel: boolean;
}

export interface AudioSectionEnergyComparison {
  version: "riddle-proof.audio-section-heuristics.v1";
  role: "metric_supported_review_order";
  sectionCount: number;
  sections: Array<Record<string, unknown>>;
  requiredSectionEnergyFloorsPreserved: boolean;
  guardrailsPreserved: boolean;
  violationCount: number;
  averageAbsLoudnessDelta: number | null;
  averageAbsEnergyDelta: number | null;
  floors: Required<Omit<AudioSectionHeuristicOptions, "trackedInstruments">>;
  trackedInstruments: string[];
  boundary: string;
}

export interface AudioExplorationMixHealthSummary {
  peak: number | null;
  rms: number | null;
  minHeadroomDb: number | null;
  clipping: boolean;
  lowLevel: boolean;
}

export interface AudioExplorationCoverageEntry {
  songName: string | null;
  partLabel: string | null;
  status: string | null;
  windowCount: number;
  findingCount: number;
  requiredActive: string[];
  missingRequiredActive: string[];
  mixHealth: AudioExplorationMixHealthSummary;
}

export interface AudioExplorationSongCoverage {
  songName: string;
  partCount: number;
  windowCount: number;
  findingCount: number;
  clipping: boolean;
  lowLevel: boolean;
  peak: number | null;
  minHeadroomDb: number | null;
  missingRequiredActive: string[];
  parts: Array<{
    label: string;
    status: string | null;
    windowCount: number;
    findingCount: number;
    mixHealth: AudioExplorationMixHealthSummary;
    missingRequiredActive: string[];
  }>;
}

export interface AudioExplorationCoverageSummary {
  version: "riddle-proof.audio-exploration-coverage.v1";
  role: "deterministic_audio_app_coverage";
  entryCount: number;
  findingCount: number;
  songCoverage: AudioExplorationSongCoverage[];
  coverageEntries: AudioExplorationCoverageEntry[];
  boundary: string;
}

export interface AudioExplorationCoverageMarkdownOptions {
  title?: string;
  includePartCoverage?: boolean;
}

export interface AudioExplorationReviewWarningOptions {
  minHeadroomDb?: number;
}

export interface AudioExplorationReviewWarning {
  version: "riddle-proof.audio-exploration-review-warning.v1";
  kind: "low_headroom_margin";
  severity: "review";
  songName: string | null;
  partLabel: string | null;
  minHeadroomDb: number;
  thresholdDb: number;
  peak: number | null;
  clipping: boolean;
  lowLevel: boolean;
  message: string;
  boundary: string;
}

export type AudioMixRequestedMagnitude = "subtle";
export type AudioMixRequestMagnitudeSource = "explicit_args" | "intent_text" | "unconstrained";

export interface AudioMixMagnitudePolicy {
  maxAbsLevelDelta: number;
  aliases: string[];
}

export interface AudioMixRequestMagnitudeOptions {
  intent?: unknown;
  claim?: unknown;
  magnitude?: unknown;
  requestedMagnitude?: unknown;
  maxAbsDelta?: unknown;
  maxAbsLevelDelta?: unknown;
  policies?: Partial<Record<AudioMixRequestedMagnitude, Partial<AudioMixMagnitudePolicy>>>;
}

export interface AudioMixResolvedRequestMagnitude {
  version: "riddle-proof.audio-mix-request-magnitude.v1";
  magnitude: AudioMixRequestedMagnitude | null;
  maxAbsDelta: number | null;
  maxAbsLevelDelta: number | null;
  magnitudeSource: AudioMixRequestMagnitudeSource;
  source: AudioMixRequestMagnitudeSource;
  requestedText: string | null;
  boundary: string;
}

export interface AudioMixCandidateMagnitudeMatch {
  version: "riddle-proof.audio-mix-candidate-magnitude-match.v1";
  matches: boolean;
  magnitude: AudioMixRequestedMagnitude | null;
  requestedMagnitude: AudioMixRequestedMagnitude | null;
  maxAbsDelta: number | null;
  maxAbsLevelDelta: number | null;
  candidateDelta: number | null;
  candidateAbsDelta: number | null;
  source: AudioMixRequestMagnitudeSource;
  failureReason: "candidate_delta_exceeds_requested_magnitude" | "candidate_delta_missing" | null;
  boundary: string;
}

const DEFAULT_SECTION_HEURISTICS: Required<Omit<AudioSectionHeuristicOptions, "trackedInstruments">> = {
  requiredRmsFloor: 0.0005,
  requiredPeakFloor: 0.001,
  requiredTotalEnergyFloor: 0.000001,
  minHeadroomDb: 0.5,
};

export const AUDIO_MIX_SUBTLE_MAX_ABS_LEVEL_DELTA = 0.12;

export const DEFAULT_AUDIO_MIX_MAGNITUDE_POLICIES: Record<AudioMixRequestedMagnitude, AudioMixMagnitudePolicy> = {
  subtle: {
    maxAbsLevelDelta: AUDIO_MIX_SUBTLE_MAX_ABS_LEVEL_DELTA,
    aliases: [
      "a little",
      "little",
      "slightly",
      "subtle",
      "subtly",
      "small",
      "tiny",
      "a bit",
      "bit",
      "touch",
      "hair",
    ],
  },
};

const AUDIO_MIX_MAGNITUDE_BOUNDARY = "Requested magnitude constrains objective candidate support before review-order ranking; it does not prove subjective mix quality.";

const roundMetric = (value: unknown, digits = 6): number | null => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Number(number.toFixed(digits));
};

const optionWithDefault = (
  value: unknown,
  fallback: number,
): number => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const normalizeOptions = (
  options: AudioSectionHeuristicOptions = {},
): Required<Omit<AudioSectionHeuristicOptions, "trackedInstruments">> => ({
  requiredRmsFloor: optionWithDefault(options.requiredRmsFloor, DEFAULT_SECTION_HEURISTICS.requiredRmsFloor),
  requiredPeakFloor: optionWithDefault(options.requiredPeakFloor, DEFAULT_SECTION_HEURISTICS.requiredPeakFloor),
  requiredTotalEnergyFloor: optionWithDefault(
    options.requiredTotalEnergyFloor,
    DEFAULT_SECTION_HEURISTICS.requiredTotalEnergyFloor,
  ),
  minHeadroomDb: optionWithDefault(options.minHeadroomDb, DEFAULT_SECTION_HEURISTICS.minHeadroomDb),
});

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const normalizeTrackedInstruments = (value: unknown): string[] => Array.from(new Set(asArray(value)
  .map((entry) => String(entry ?? "").trim())
  .filter(Boolean)));

const asRecord = (value: unknown): Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const asNumber = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const asStringOrNull = (value: unknown): string | null => (
  typeof value === "string" && value.trim() ? value.trim() : null
);

const lowerText = (value: unknown): string => (
  typeof value === "string" ? value.toLowerCase().trim() : ""
);

const uniqueTextValues = (values: unknown[]): string[] => Array.from(new Set(
  values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean),
));

const AUDIO_EXPLORATION_COVERAGE_BOUNDARY = "Audio/app coverage receipts report deterministic guardrails such as clipping, low-level windows, headroom, and missing active lanes; they do not prove subjective mix quality.";
const AUDIO_EXPLORATION_REVIEW_WARNING_BOUNDARY = "Audio/app review warnings are non-failing cues from objective metrics; they do not prove subjective mix quality.";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const textMentionsPhrase = (text: string, phrase: string): boolean => {
  if (!text || !phrase) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(phrase.toLowerCase())}([^a-z0-9]|$)`, "u").test(text);
};

const mergeMagnitudePolicies = (
  overrides: AudioMixRequestMagnitudeOptions["policies"] = {},
): Record<AudioMixRequestedMagnitude, AudioMixMagnitudePolicy> => ({
  subtle: {
    maxAbsLevelDelta: asNumber(overrides.subtle?.maxAbsLevelDelta)
      ?? DEFAULT_AUDIO_MIX_MAGNITUDE_POLICIES.subtle.maxAbsLevelDelta,
    aliases: [
      ...DEFAULT_AUDIO_MIX_MAGNITUDE_POLICIES.subtle.aliases,
      ...asArray(overrides.subtle?.aliases).map(String),
    ].map((entry) => entry.trim()).filter(Boolean),
  },
});

export function normalizeAudioMixRequestedMagnitude(
  value: unknown,
  policies: AudioMixRequestMagnitudeOptions["policies"] = {},
): AudioMixRequestedMagnitude | null {
  const text = lowerText(value);
  if (!text) return null;
  const mergedPolicies = mergeMagnitudePolicies(policies);
  for (const [magnitude, policy] of Object.entries(mergedPolicies) as Array<[AudioMixRequestedMagnitude, AudioMixMagnitudePolicy]>) {
    if (text === magnitude || policy.aliases.some((alias) => text === alias.toLowerCase())) {
      return magnitude;
    }
  }
  return null;
}

export function inferAudioMixRequestedMagnitude(
  text: unknown,
  policies: AudioMixRequestMagnitudeOptions["policies"] = {},
): AudioMixRequestedMagnitude | null {
  const normalized = lowerText(text);
  if (!normalized) return null;
  const mergedPolicies = mergeMagnitudePolicies(policies);
  for (const [magnitude, policy] of Object.entries(mergedPolicies) as Array<[AudioMixRequestedMagnitude, AudioMixMagnitudePolicy]>) {
    if (policy.aliases.some((alias) => textMentionsPhrase(normalized, alias))) {
      return magnitude;
    }
  }
  return null;
}

export function resolveAudioMixRequestMagnitude(
  options: AudioMixRequestMagnitudeOptions = {},
): AudioMixResolvedRequestMagnitude {
  const requestedText = lowerText(options.intent ?? options.claim);
  const policies = mergeMagnitudePolicies(options.policies);
  const explicitMagnitude = normalizeAudioMixRequestedMagnitude(
    options.magnitude ?? options.requestedMagnitude,
    policies,
  );
  const inferredMagnitude = explicitMagnitude ?? inferAudioMixRequestedMagnitude(requestedText, policies);
  const explicitMaxAbsDelta = asNumber(options.maxAbsLevelDelta ?? options.maxAbsDelta);
  const hasExplicitMaxAbsDelta = explicitMaxAbsDelta !== null && explicitMaxAbsDelta > 0;
  const maxAbsLevelDelta = hasExplicitMaxAbsDelta
    ? explicitMaxAbsDelta
    : (inferredMagnitude ? policies[inferredMagnitude].maxAbsLevelDelta : null);
  const roundedMaxAbsLevelDelta = roundMetric(maxAbsLevelDelta, 4);
  const magnitudeSource: AudioMixRequestMagnitudeSource = explicitMagnitude || hasExplicitMaxAbsDelta
    ? "explicit_args"
    : (inferredMagnitude ? "intent_text" : "unconstrained");

  return {
    version: "riddle-proof.audio-mix-request-magnitude.v1",
    magnitude: inferredMagnitude,
    maxAbsDelta: roundedMaxAbsLevelDelta,
    maxAbsLevelDelta: roundedMaxAbsLevelDelta,
    magnitudeSource,
    source: magnitudeSource,
    requestedText: requestedText || null,
    boundary: AUDIO_MIX_MAGNITUDE_BOUNDARY,
  };
}

const candidateDelta = (candidateOrDelta: unknown): number | null => {
  const direct = asNumber(candidateOrDelta);
  if (direct !== null) return direct;
  const candidate = asRecord(candidateOrDelta);
  const action = asRecord(candidate.action);
  const explicitDelta = asNumber(action.delta ?? candidate.delta);
  if (explicitDelta !== null) return explicitDelta;
  const from = asNumber(action.from ?? candidate.from);
  const to = asNumber(action.to ?? candidate.to);
  return from !== null && to !== null ? to - from : null;
};

export function audioMixCandidateMagnitudeMatchesRequest(
  candidateOrDelta: unknown,
  request: Partial<AudioMixResolvedRequestMagnitude> | null | undefined = {},
): AudioMixCandidateMagnitudeMatch {
  const delta = candidateDelta(candidateOrDelta);
  const maxAbsDelta = asNumber(request?.maxAbsDelta ?? request?.maxAbsLevelDelta);
  const hasMagnitudeConstraint = maxAbsDelta !== null && maxAbsDelta > 0;
  const absDelta = delta === null ? null : Math.abs(delta);
  const missingConstrainedDelta = hasMagnitudeConstraint && delta === null;
  const exceedsMagnitude = hasMagnitudeConstraint
    && absDelta !== null
    && absDelta > maxAbsDelta + 0.000001;
  const source = request?.magnitudeSource ?? request?.source ?? "unconstrained";

  return {
    version: "riddle-proof.audio-mix-candidate-magnitude-match.v1",
    matches: !missingConstrainedDelta && !exceedsMagnitude,
    magnitude: request?.magnitude ?? null,
    requestedMagnitude: request?.magnitude ?? null,
    maxAbsDelta: hasMagnitudeConstraint ? roundMetric(maxAbsDelta, 4) : null,
    maxAbsLevelDelta: hasMagnitudeConstraint ? roundMetric(maxAbsDelta, 4) : null,
    candidateDelta: roundMetric(delta, 4),
    candidateAbsDelta: roundMetric(absDelta, 4),
    source,
    failureReason: missingConstrainedDelta
      ? "candidate_delta_missing"
      : (exceedsMagnitude ? "candidate_delta_exceeds_requested_magnitude" : null),
    boundary: AUDIO_MIX_MAGNITUDE_BOUNDARY,
  };
}

const metricNumber = (metrics: Record<string, unknown>, key: string): number => {
  const number = Number(metrics[key]);
  return Number.isFinite(number) ? number : 0;
};

const instrumentMap = (section: Record<string, unknown>) => {
  const map = new Map<string, Record<string, unknown>>();
  for (const entry of [
    ...asArray(section.activeInstruments),
    ...asArray(section.requiredInstruments),
  ]) {
    const record = asRecord(entry);
    const name = typeof record.name === "string" ? record.name : null;
    if (name && !map.has(name)) map.set(name, record);
  }
  return map;
};

const totalInstrumentEnergy = (section: Record<string, unknown>): number | null => {
  const entries = asArray(section.activeInstruments).map(asRecord);
  if (!entries.length) return null;
  return roundMetric(entries.reduce((total, entry) => total + metricNumber(entry, "totalEnergy"), 0));
};

const sectionId = (section: Record<string, unknown>, index: number): string => (
  String(section.name ?? section.label ?? `section-${index + 1}`)
);

const sectionLabel = (section: Record<string, unknown>, index: number): string => (
  String(section.label ?? section.name ?? `Section ${index + 1}`)
);

const findCandidateSection = (
  baselineSection: Record<string, unknown>,
  candidateSections: Record<string, unknown>[],
  index: number,
): Record<string, unknown> => {
  const name = baselineSection.name;
  const label = baselineSection.label;
  const match = candidateSections.find((section) => (
    (name !== undefined && section.name === name)
    || (label !== undefined && section.label === label)
  ));
  return match ?? candidateSections[index] ?? {};
};

export function estimateLoudnessStyleLufs(rms: unknown): number | null {
  const value = Number(rms);
  if (!Number.isFinite(value) || value <= 0) return null;
  // This is intentionally labeled loudness-style: it is an RMS-derived estimate,
  // not a standards-compliant EBU R128 / BS.1770 LUFS implementation.
  return roundMetric((20 * Math.log10(value)) - 0.691, 2);
}

export function summarizeAudioSectionEnergy(section: unknown): AudioSectionEnergySummary {
  const record = asRecord(section);
  const mixHealth = asRecord(record.mixHealth);
  const rms = roundMetric(mixHealth.rms);
  return {
    rms,
    peak: roundMetric(mixHealth.peak),
    totalEnergy: totalInstrumentEnergy(record),
    loudnessStyleLufs: estimateLoudnessStyleLufs(rms),
    headroomDb: roundMetric(mixHealth.headroomDb, 2),
    clipping: Boolean(mixHealth.clipping),
    lowLevel: Boolean(mixHealth.lowLevel),
  };
}

const countNumber = (value: unknown, fallback = 0): number => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};

const explorationEntries = (input: unknown): Record<string, unknown>[] => {
  if (Array.isArray(input)) return input.map(asRecord);
  return asArray(asRecord(input).entries).map(asRecord);
};

const explorationEntryWindows = (entry: Record<string, unknown>): Record<string, unknown>[] => {
  const summaryWindows = asArray(asRecord(entry.summary).windows);
  const directWindows = asArray(entry.windows);
  return (summaryWindows.length ? summaryWindows : directWindows).map(asRecord);
};

const compactAudioExplorationMixHealth = (
  windows: Record<string, unknown>[],
  fallbackMixHealth: unknown = null,
): AudioExplorationMixHealthSummary => {
  const health = windows
    .map((window) => asRecord(window.mixHealth))
    .filter((entry) => Object.keys(entry).length);
  const fallback = asRecord(fallbackMixHealth);
  if (!health.length && Object.keys(fallback).length) health.push(fallback);

  const peaks = health.map((entry) => asNumber(entry.peak)).filter((value): value is number => value !== null);
  const rmsValues = health.map((entry) => asNumber(entry.rms)).filter((value): value is number => value !== null);
  const headrooms = health
    .map((entry) => asNumber(entry.minHeadroomDb ?? entry.headroomDb))
    .filter((value): value is number => value !== null);

  return {
    peak: peaks.length ? roundMetric(Math.max(...peaks)) : null,
    rms: rmsValues.length ? roundMetric(Math.max(...rmsValues)) : null,
    minHeadroomDb: headrooms.length ? roundMetric(Math.min(...headrooms), 2) : null,
    clipping: health.some((entry) => entry.clipping === true),
    lowLevel: health.some((entry) => entry.lowLevel === true),
  };
};

const summarizeAudioExplorationEntry = (entry: Record<string, unknown>): AudioExplorationCoverageEntry => {
  const windows = explorationEntryWindows(entry);
  const summary = asRecord(entry.summary);
  const fallbackFindingCount = asArray(entry.findings).length;
  const windowCount = countNumber(entry.windowCount ?? summary.windowCount, windows.length);
  return {
    songName: asStringOrNull(entry.songName ?? entry.song ?? entry.selectedSong),
    partLabel: asStringOrNull(entry.partLabel ?? entry.part ?? entry.label ?? entry.name),
    status: asStringOrNull(entry.status),
    windowCount,
    findingCount: countNumber(entry.findingCount ?? summary.findingCount, fallbackFindingCount),
    requiredActive: uniqueTextValues([
      ...windows.flatMap((window) => asArray(window.requiredActive)),
      ...asArray(entry.requiredActive),
    ]),
    missingRequiredActive: uniqueTextValues([
      ...windows.flatMap((window) => asArray(window.missingRequiredActive)),
      ...asArray(entry.missingRequiredActive),
    ]),
    mixHealth: compactAudioExplorationMixHealth(windows, entry.mixHealth),
  };
};

const summarizeAudioExplorationSongs = (
  coverageEntries: AudioExplorationCoverageEntry[],
): AudioExplorationSongCoverage[] => {
  const bySong = new Map<string, AudioExplorationSongCoverage>();
  for (const entry of coverageEntries) {
    const songName = entry.songName ?? "Unknown song";
    const current = bySong.get(songName) ?? {
      songName,
      partCount: 0,
      windowCount: 0,
      findingCount: 0,
      clipping: false,
      lowLevel: false,
      peak: null,
      minHeadroomDb: null,
      missingRequiredActive: [],
      parts: [],
    };

    current.partCount += 1;
    current.windowCount += entry.windowCount;
    current.findingCount += entry.findingCount;
    current.clipping = current.clipping || entry.mixHealth.clipping;
    current.lowLevel = current.lowLevel || entry.mixHealth.lowLevel;
    current.peak = current.peak === null
      ? entry.mixHealth.peak
      : Math.max(current.peak, entry.mixHealth.peak ?? current.peak);
    current.minHeadroomDb = current.minHeadroomDb === null
      ? entry.mixHealth.minHeadroomDb
      : Math.min(current.minHeadroomDb, entry.mixHealth.minHeadroomDb ?? current.minHeadroomDb);
    current.missingRequiredActive = uniqueTextValues([
      ...current.missingRequiredActive,
      ...entry.missingRequiredActive,
    ]);
    current.parts.push({
      label: entry.partLabel ?? "Unknown part",
      status: entry.status,
      windowCount: entry.windowCount,
      findingCount: entry.findingCount,
      mixHealth: entry.mixHealth,
      missingRequiredActive: entry.missingRequiredActive,
    });

    bySong.set(songName, current);
  }

  return Array.from(bySong.values()).map((entry) => ({
    ...entry,
    peak: roundMetric(entry.peak),
    minHeadroomDb: roundMetric(entry.minHeadroomDb, 2),
  }));
};

export function summarizeAudioExplorationCoverage(input: unknown): AudioExplorationCoverageSummary {
  const entries = explorationEntries(input);
  const coverageEntries = entries.map(summarizeAudioExplorationEntry);
  const explicitFindingCount = asNumber(asRecord(input).findingCount);
  const findingCount = explicitFindingCount !== null
    ? explicitFindingCount
    : coverageEntries.reduce((total, entry) => total + entry.findingCount, 0);

  return {
    version: "riddle-proof.audio-exploration-coverage.v1",
    role: "deterministic_audio_app_coverage",
    entryCount: coverageEntries.length,
    findingCount,
    songCoverage: summarizeAudioExplorationSongs(coverageEntries),
    coverageEntries,
    boundary: AUDIO_EXPLORATION_COVERAGE_BOUNDARY,
  };
}

export function collectAudioExplorationReviewWarnings(
  summaryOrInput: unknown,
  options: AudioExplorationReviewWarningOptions = {},
): AudioExplorationReviewWarning[] {
  const summary = isAudioExplorationCoverageSummary(summaryOrInput)
    ? summaryOrInput
    : summarizeAudioExplorationCoverage(summaryOrInput);
  const minHeadroomDb = optionWithDefault(options.minHeadroomDb, DEFAULT_SECTION_HEURISTICS.minHeadroomDb);
  const warnings: AudioExplorationReviewWarning[] = [];

  for (const entry of summary.coverageEntries) {
    const observedHeadroom = asNumber(entry.mixHealth.minHeadroomDb);
    if (observedHeadroom === null || observedHeadroom >= minHeadroomDb) continue;
    const minHeadroom = roundMetric(observedHeadroom, 4);
    if (minHeadroom === null) continue;

    warnings.push({
      version: "riddle-proof.audio-exploration-review-warning.v1",
      kind: "low_headroom_margin",
      severity: "review",
      songName: entry.songName,
      partLabel: entry.partLabel,
      minHeadroomDb: minHeadroom,
      thresholdDb: roundMetric(minHeadroomDb, 4) ?? minHeadroomDb,
      peak: roundMetric(entry.mixHealth.peak, 4),
      clipping: entry.mixHealth.clipping,
      lowLevel: entry.mixHealth.lowLevel,
      message: `${entry.songName ?? "Unknown song"} / ${entry.partLabel ?? "unknown part"} has ${observedHeadroom.toFixed(2)} dB headroom, below the ${minHeadroomDb.toFixed(2)} dB review margin.`,
      boundary: AUDIO_EXPLORATION_REVIEW_WARNING_BOUNDARY,
    });
  }

  return warnings;
}

const coverageFormatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "not captured";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  return String(value);
};

const coverageTableCell = (value: unknown): string => coverageFormatValue(value).replace(/\|/gu, "\\|");

const coverageTableRow = (values: unknown[]): string => (
  values.map(coverageTableCell).join(" | ").replace(/^/u, "| ").replace(/$/u, " |")
);

const isAudioExplorationCoverageSummary = (input: unknown): input is AudioExplorationCoverageSummary => {
  const record = asRecord(input);
  return record.version === "riddle-proof.audio-exploration-coverage.v1"
    && Array.isArray(record.songCoverage)
    && Array.isArray(record.coverageEntries);
};

export function formatAudioExplorationCoverageMarkdown(
  summaryOrInput: unknown,
  options: AudioExplorationCoverageMarkdownOptions = {},
): string {
  const summary = isAudioExplorationCoverageSummary(summaryOrInput)
    ? summaryOrInput
    : summarizeAudioExplorationCoverage(summaryOrInput);
  const includePartCoverage = options.includePartCoverage ?? true;
  const lines = [
    `# ${options.title ?? "Audio Exploration Coverage"}`,
    "",
    `- Role: \`${summary.role}\``,
    `- Entry count: \`${summary.entryCount}\``,
    `- Finding count: \`${summary.findingCount}\``,
    "",
  ];

  lines.push(
    "## Song Coverage",
    "",
    "| Song | Parts | Windows | Findings | Peak | Min Headroom dB | Clipping | Low Level | Missing Active |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  if (summary.songCoverage.length) {
    for (const entry of summary.songCoverage) {
      lines.push(coverageTableRow([
        entry.songName,
        entry.partCount,
        entry.windowCount,
        entry.findingCount,
        entry.peak,
        entry.minHeadroomDb,
        entry.clipping,
        entry.lowLevel,
        entry.missingRequiredActive.length ? entry.missingRequiredActive.join(", ") : "none",
      ]));
    }
  } else {
    lines.push("| none | 0 | 0 | 0 | not captured | not captured | false | false | none |");
  }
  lines.push("");

  if (includePartCoverage) {
    lines.push(
      "## Part Coverage",
      "",
      "| Song | Part | Status | Windows | Findings | Peak | Min Headroom dB | Clipping | Low Level | Missing Active |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    );
    if (summary.coverageEntries.length) {
      for (const entry of summary.coverageEntries) {
        lines.push(coverageTableRow([
          entry.songName,
          entry.partLabel,
          entry.status,
          entry.windowCount,
          entry.findingCount,
          entry.mixHealth.peak,
          entry.mixHealth.minHeadroomDb,
          entry.mixHealth.clipping,
          entry.mixHealth.lowLevel,
          entry.missingRequiredActive.length ? entry.missingRequiredActive.join(", ") : "none",
        ]));
      }
    } else {
      lines.push("| none | none | not captured | 0 | 0 | not captured | not captured | false | false | none |");
    }
    lines.push("");
  }

  lines.push("## Boundary", "", summary.boundary);

  return `${lines.join("\n")}\n`;
}

const delta = (candidate: unknown, baseline: unknown, digits = 6): number | null => {
  const after = Number(candidate);
  const before = Number(baseline);
  if (!Number.isFinite(after) || !Number.isFinite(before)) return null;
  return roundMetric(after - before, digits);
};

const requiredFloorReceipts = (
  baselineSection: Record<string, unknown>,
  candidateSection: Record<string, unknown>,
  floors: Required<Omit<AudioSectionHeuristicOptions, "trackedInstruments">>,
) => {
  const baselineInstruments = instrumentMap(baselineSection);
  const candidateInstruments = instrumentMap(candidateSection);
  const requiredNames = asArray(candidateSection.requiredActive).length
    ? asArray(candidateSection.requiredActive).map(String)
    : asArray(baselineSection.requiredActive).map(String);

  return requiredNames.map((name) => {
    const baseline = baselineInstruments.get(name) ?? {};
    const candidate = candidateInstruments.get(name) ?? {};
    const candidateRms = metricNumber(candidate, "rms");
    const candidatePeak = metricNumber(candidate, "peak");
    const candidateTotalEnergy = metricNumber(candidate, "totalEnergy");
    const preserved = (
      candidateRms >= floors.requiredRmsFloor
      || candidatePeak >= floors.requiredPeakFloor
      || candidateTotalEnergy >= floors.requiredTotalEnergyFloor
    );
    return {
      name,
      preserved,
      floors: {
        rms: floors.requiredRmsFloor,
        peak: floors.requiredPeakFloor,
        totalEnergy: floors.requiredTotalEnergyFloor,
      },
      baseline: {
        rms: roundMetric(baseline.rms),
        peak: roundMetric(baseline.peak),
        totalEnergy: roundMetric(baseline.totalEnergy),
      },
      candidate: {
        rms: roundMetric(candidateRms),
        peak: roundMetric(candidatePeak),
        totalEnergy: roundMetric(candidateTotalEnergy),
      },
    };
  });
};

const instrumentEnergyReceipts = (
  baselineSection: Record<string, unknown>,
  candidateSection: Record<string, unknown>,
  trackedInstruments: string[],
) => {
  if (!trackedInstruments.length) return [];
  const baselineInstruments = instrumentMap(baselineSection);
  const candidateInstruments = instrumentMap(candidateSection);
  return trackedInstruments.map((name) => {
    const baseline = baselineInstruments.get(name) ?? {};
    const candidate = candidateInstruments.get(name) ?? {};
    const before = {
      rms: roundMetric(baseline.rms),
      peak: roundMetric(baseline.peak),
      totalEnergy: roundMetric(baseline.totalEnergy),
    };
    const after = {
      rms: roundMetric(candidate.rms),
      peak: roundMetric(candidate.peak),
      totalEnergy: roundMetric(candidate.totalEnergy),
    };
    return {
      name,
      baseline: before,
      candidate: after,
      delta: {
        rms: delta(after.rms, before.rms),
        peak: delta(after.peak, before.peak),
        totalEnergy: delta(after.totalEnergy, before.totalEnergy),
      },
    };
  });
};

export function compareAudioSectionEnergy(
  baselineSummary: unknown,
  candidateSummary: unknown,
  options: AudioSectionHeuristicOptions = {},
): AudioSectionEnergyComparison {
  const floors = normalizeOptions(options);
  const trackedInstruments = normalizeTrackedInstruments(options.trackedInstruments);
  const baselineSections = asArray(asRecord(baselineSummary).windows).map(asRecord);
  const candidateSections = asArray(asRecord(candidateSummary).windows).map(asRecord);
  const sections = baselineSections.map((baselineSection, index) => {
    const candidateSection = findCandidateSection(baselineSection, candidateSections, index);
    const baseline = summarizeAudioSectionEnergy(baselineSection);
    const candidate = summarizeAudioSectionEnergy(candidateSection);
    const requiredEnergyFloors = requiredFloorReceipts(baselineSection, candidateSection, floors);
    const requiredEnergyFloorsPreserved = requiredEnergyFloors.every((entry) => entry.preserved);
    const headroomOk = candidate.headroomDb === null || candidate.headroomDb >= floors.minHeadroomDb;
    const guardrailViolations = [
      candidate.clipping ? "clipping" : null,
      candidate.lowLevel ? "low_level" : null,
      !headroomOk ? "headroom" : null,
    ].filter(Boolean);

    return {
      name: sectionId(baselineSection, index),
      label: sectionLabel(baselineSection, index),
      baseline,
      candidate,
      delta: {
        rms: delta(candidate.rms, baseline.rms),
        peak: delta(candidate.peak, baseline.peak),
        totalEnergy: delta(candidate.totalEnergy, baseline.totalEnergy),
        loudnessStyleLufs: delta(candidate.loudnessStyleLufs, baseline.loudnessStyleLufs, 2),
        headroomDb: delta(candidate.headroomDb, baseline.headroomDb, 2),
      },
      trackedInstruments: instrumentEnergyReceipts(baselineSection, candidateSection, trackedInstruments),
      requiredEnergyFloors,
      requiredEnergyFloorsPreserved,
      guardrails: {
        clipping: candidate.clipping,
        lowLevel: candidate.lowLevel,
        headroomDb: candidate.headroomDb,
        minHeadroomDb: floors.minHeadroomDb,
        headroomOk,
        violated: guardrailViolations,
      },
    };
  });

  const loudnessDeltas = sections
    .map((section) => Math.abs(Number(asRecord(section.delta).loudnessStyleLufs)))
    .filter(Number.isFinite);
  const energyDeltas = sections
    .map((section) => Math.abs(Number(asRecord(section.delta).totalEnergy)))
    .filter(Number.isFinite);
  const violationCount = sections.reduce((count, section) => (
    count
    + (section.requiredEnergyFloorsPreserved ? 0 : 1)
    + asArray(asRecord(section.guardrails).violated).length
  ), 0);

  return {
    version: "riddle-proof.audio-section-heuristics.v1",
    role: "metric_supported_review_order",
    sectionCount: sections.length,
    sections,
    requiredSectionEnergyFloorsPreserved: sections.every((section) => section.requiredEnergyFloorsPreserved),
    guardrailsPreserved: sections.every((section) => !asArray(asRecord(section.guardrails).violated).length),
    violationCount,
    averageAbsLoudnessDelta: loudnessDeltas.length
      ? roundMetric(loudnessDeltas.reduce((total, value) => total + value, 0) / loudnessDeltas.length, 2)
      : null,
    averageAbsEnergyDelta: energyDeltas.length
      ? roundMetric(energyDeltas.reduce((total, value) => total + value, 0) / energyDeltas.length)
      : null,
    floors,
    trackedInstruments,
    boundary: "Loudness-style and section-energy metrics rank candidates for review; they do not prove subjective mix quality.",
  };
}

export function computeAudioSectionReviewMetric(comparison: unknown): number {
  const record = asRecord(comparison);
  const violationPenalty = Number(record.violationCount ?? 0) * 1000;
  const loudnessPenalty = Number(record.averageAbsLoudnessDelta ?? 0);
  const energyPenalty = Number(record.averageAbsEnergyDelta ?? 0) * 10;
  return Number((violationPenalty + loudnessPenalty + energyPenalty).toFixed(4));
}
