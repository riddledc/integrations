export interface AudioSectionHeuristicOptions {
  requiredRmsFloor?: number;
  requiredPeakFloor?: number;
  requiredTotalEnergyFloor?: number;
  minHeadroomDb?: number;
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
  floors: Required<AudioSectionHeuristicOptions>;
  boundary: string;
}

const DEFAULT_SECTION_HEURISTICS: Required<AudioSectionHeuristicOptions> = {
  requiredRmsFloor: 0.0005,
  requiredPeakFloor: 0.001,
  requiredTotalEnergyFloor: 0.000001,
  minHeadroomDb: 0.5,
};

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

const normalizeOptions = (options: AudioSectionHeuristicOptions = {}): Required<AudioSectionHeuristicOptions> => ({
  requiredRmsFloor: optionWithDefault(options.requiredRmsFloor, DEFAULT_SECTION_HEURISTICS.requiredRmsFloor),
  requiredPeakFloor: optionWithDefault(options.requiredPeakFloor, DEFAULT_SECTION_HEURISTICS.requiredPeakFloor),
  requiredTotalEnergyFloor: optionWithDefault(
    options.requiredTotalEnergyFloor,
    DEFAULT_SECTION_HEURISTICS.requiredTotalEnergyFloor,
  ),
  minHeadroomDb: optionWithDefault(options.minHeadroomDb, DEFAULT_SECTION_HEURISTICS.minHeadroomDb),
});

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asRecord = (value: unknown): Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

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

const delta = (candidate: unknown, baseline: unknown, digits = 6): number | null => {
  const after = Number(candidate);
  const before = Number(baseline);
  if (!Number.isFinite(after) || !Number.isFinite(before)) return null;
  return roundMetric(after - before, digits);
};

const requiredFloorReceipts = (
  baselineSection: Record<string, unknown>,
  candidateSection: Record<string, unknown>,
  floors: Required<AudioSectionHeuristicOptions>,
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

export function compareAudioSectionEnergy(
  baselineSummary: unknown,
  candidateSummary: unknown,
  options: AudioSectionHeuristicOptions = {},
): AudioSectionEnergyComparison {
  const floors = normalizeOptions(options);
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
