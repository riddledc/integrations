export const RIDDLE_PROOF_PLAYABILITY_VERSION = "riddle-proof.playability.v1";
export const RIDDLE_PROOF_PLAYABILITY_ASSESSMENT_VERSION = "riddle-proof.playability.assessment.v1";

export interface RiddleProofPlayabilityEvidence {
  version?: typeof RIDDLE_PROOF_PLAYABILITY_VERSION | string;
  target?: string;
  input_events?: unknown[];
  state_delta?: Record<string, unknown>;
  pixel_delta?: Record<string, unknown>;
  canvas_delta?: Record<string, unknown>;
  motion_delta?: Record<string, unknown>;
  playfield_delta?: Record<string, unknown>;
  time_delta_ms?: number;
  assertions?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AssessPlayabilityOptions {
  minChangedPercent?: number;
  minChangedPixels?: number;
  minAverageDelta?: number;
  minTimeDeltaMs?: number;
  requireInput?: boolean;
  requireStateChange?: boolean;
  requireMotion?: boolean;
  requireTimeProgression?: boolean;
}

export interface RiddleProofPlayabilityAssessment {
  version: typeof RIDDLE_PROOF_PLAYABILITY_ASSESSMENT_VERSION;
  evidence_present: boolean;
  passed: boolean;
  input_observed: boolean;
  state_changed: boolean;
  motion_observed: boolean;
  time_progressed: boolean;
  concerns: string[];
  metrics: Record<string, unknown>;
  thresholds: Required<Pick<
    AssessPlayabilityOptions,
    "minChangedPercent" | "minChangedPixels" | "minAverageDelta" | "minTimeDeltaMs"
  >>;
  required: Required<Pick<
    AssessPlayabilityOptions,
    "requireInput" | "requireStateChange" | "requireMotion" | "requireTimeProgression"
  >>;
  evidence_keys: string[];
}

const PLAYABILITY_MODES = new Set(["playable", "gameplay", "game"]);

const PLAYABILITY_CONTAINER_KEYS = [
  "playability",
  "playability_evidence",
  "playabilityEvidence",
  "playable",
  "gameplay",
  "gameplay_evidence",
  "gameplayEvidence",
];

const INPUT_ASSERTION_KEYS = [
  "inputAccepted",
  "inputObserved",
  "inputReceived",
  "controlsWorked",
  "keyboardWorked",
  "pointerWorked",
  "touchWorked",
  "steeringInputAccepted",
  "userInputObserved",
];

const STATE_ASSERTION_KEYS = [
  "stateChanged",
  "gameStateChanged",
  "playStarted",
  "simulationAdvanced",
  "distanceAdvanced",
  "scoreChanged",
  "hudChanged",
  "positionChanged",
  "speedChanged",
];

const MOTION_ASSERTION_KEYS = [
  "motionObserved",
  "visualMotion",
  "canvasChanged",
  "pixelChanged",
  "playfieldMoved",
  "playfieldPixelsChanged",
  "nonHudPixelsChanged",
  "animationAdvanced",
  "frameChanged",
  "framesChanged",
];

const TIME_ASSERTION_KEYS = [
  "timeProgressed",
  "clockAdvanced",
  "animationAdvanced",
  "simulationAdvanced",
  "playStarted",
];

const PERCENT_KEYS = [
  "changed_percent",
  "change_percent",
  "percent_changed",
  "diff_percent",
  "motion_percent",
  "pixel_change_percent",
];

const RATIO_KEYS = [
  "changed_ratio",
  "change_ratio",
  "diff_ratio",
  "motion_ratio",
  "pixel_change_ratio",
];

const PIXEL_KEYS = [
  "changed_pixels",
  "changed_pixel_count",
  "diff_pixels",
  "motion_pixels",
  "pixel_delta",
  "changedPixels",
];

const AVERAGE_DELTA_KEYS = [
  "average_delta",
  "avg_delta",
  "mean_delta",
  "avg_abs_delta",
  "mean_abs_delta",
];

const TIME_DELTA_KEYS = [
  "time_delta_ms",
  "elapsed_ms",
  "duration_ms",
  "sample_duration_ms",
  "animation_delta_ms",
];

export function isRiddleProofPlayabilityMode(mode: unknown) {
  return PLAYABILITY_MODES.has(stringValue(mode).toLowerCase());
}

export function extractPlayabilityEvidence(...sources: unknown[]): RiddleProofPlayabilityEvidence | null {
  const seen = new Set<unknown>();
  for (const source of sources) {
    const found = findPlayabilityEvidence(source, seen);
    if (found) return found;
  }
  return null;
}

export function assessPlayabilityEvidence(
  evidence: unknown,
  options: AssessPlayabilityOptions = {},
): RiddleProofPlayabilityAssessment {
  const thresholds = {
    minChangedPercent: options.minChangedPercent ?? 0.5,
    minChangedPixels: options.minChangedPixels ?? 1000,
    minAverageDelta: options.minAverageDelta ?? 1,
    minTimeDeltaMs: options.minTimeDeltaMs ?? 250,
  };
  const required = {
    requireInput: options.requireInput ?? true,
    requireStateChange: options.requireStateChange ?? true,
    requireMotion: options.requireMotion ?? true,
    requireTimeProgression: options.requireTimeProgression ?? true,
  };
  const record = extractPlayabilityEvidence(evidence);
  const metrics: Record<string, unknown> = {};
  const concerns: string[] = [];

  if (!record) {
    return {
      version: RIDDLE_PROOF_PLAYABILITY_ASSESSMENT_VERSION,
      evidence_present: false,
      passed: false,
      input_observed: false,
      state_changed: false,
      motion_observed: false,
      time_progressed: false,
      concerns: ["playability evidence is missing"],
      metrics,
      thresholds,
      required,
      evidence_keys: [],
    };
  }

  const assertions = recordValue(record.assertions) || record;
  const inputObserved = inputObservedFrom(record, assertions);
  const stateChanged = stateChangedFrom(record, assertions, metrics);
  const motionObserved = motionObservedFrom(record, assertions, thresholds, metrics);
  const timeProgressed = timeProgressedFrom(record, assertions, thresholds, metrics);
  const explicitFailure = hasExplicitPlayabilityFailure(record, assertions);

  if (required.requireInput && !inputObserved) {
    concerns.push("no accepted player input was observed");
  }
  if (required.requireStateChange && !stateChanged) {
    concerns.push("game state did not measurably change");
  }
  if (required.requireMotion && !motionObserved) {
    concerns.push("playfield/canvas pixels did not measurably change");
  }
  if (required.requireTimeProgression && !timeProgressed) {
    concerns.push("play time or animation time did not measurably progress");
  }
  if (explicitFailure) {
    concerns.push("playability evidence includes an explicit failed assertion");
  }

  const passed = Boolean(
    (!required.requireInput || inputObserved) &&
    (!required.requireStateChange || stateChanged) &&
    (!required.requireMotion || motionObserved) &&
    (!required.requireTimeProgression || timeProgressed) &&
    !explicitFailure,
  );

  return {
    version: RIDDLE_PROOF_PLAYABILITY_ASSESSMENT_VERSION,
    evidence_present: true,
    passed,
    input_observed: inputObserved,
    state_changed: stateChanged,
    motion_observed: motionObserved,
    time_progressed: timeProgressed,
    concerns,
    metrics,
    thresholds,
    required,
    evidence_keys: Object.keys(record),
  };
}

function findPlayabilityEvidence(
  value: unknown,
  seen: Set<unknown>,
  depth = 0,
): RiddleProofPlayabilityEvidence | null {
  if (depth > 6 || value === null || value === undefined) return null;

  if (typeof value === "string") {
    const parsed = parseJson(value);
    return parsed === null ? null : findPlayabilityEvidence(parsed, seen, depth + 1);
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return null;
    seen.add(value);
    for (const item of value) {
      const found = findPlayabilityEvidence(item, seen, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const record = recordValue(value);
  if (!record || seen.has(record)) return null;
  seen.add(record);

  if (
    record.version === RIDDLE_PROOF_PLAYABILITY_VERSION ||
    hasPlayabilityShape(record)
  ) {
    return record as RiddleProofPlayabilityEvidence;
  }

  for (const key of PLAYABILITY_CONTAINER_KEYS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      const nested = findPlayabilityEvidence(record[key], seen, depth + 1);
      if (nested) return nested;
      if (typeof record[key] === "boolean") {
        return { assertions: { [key]: record[key] } };
      }
    }
  }

  for (const item of Object.values(record)) {
    const found = findPlayabilityEvidence(item, seen, depth + 1);
    if (found) return found;
  }
  return null;
}

function hasPlayabilityShape(record: Record<string, unknown>) {
  return Boolean(
    record.input_events ||
    record.state_delta ||
    record.pixel_delta ||
    record.canvas_delta ||
    record.motion_delta ||
    record.playfield_delta ||
    record.time_delta_ms !== undefined ||
    hasAnyKey(recordValue(record.assertions) || record, [
      ...INPUT_ASSERTION_KEYS,
      ...STATE_ASSERTION_KEYS,
      ...MOTION_ASSERTION_KEYS,
      ...TIME_ASSERTION_KEYS,
    ]),
  );
}

function inputObservedFrom(record: Record<string, unknown>, assertions: Record<string, unknown>) {
  if (trueForAnyKey(assertions, INPUT_ASSERTION_KEYS)) return true;
  if (listValue(record.input_events).length > 0) return true;
  if (listValue(record.inputs).length > 0) return true;
  if (listValue(record.interactions).length > 0) return true;
  const eventCount = numericFromAnyKey(record, ["input_event_count", "input_count", "interaction_count"]);
  return eventCount !== null && eventCount > 0;
}

function stateChangedFrom(
  record: Record<string, unknown>,
  assertions: Record<string, unknown>,
  metrics: Record<string, unknown>,
) {
  if (trueForAnyKey(assertions, STATE_ASSERTION_KEYS)) return true;
  const stateDelta = recordValue(record.state_delta) || recordValue(record.stateDelta);
  if (stateDelta) {
    const changedKeys = listValue(stateDelta.changed_keys || stateDelta.changedKeys);
    metrics.state_changed_keys = changedKeys;
    if (stateDelta.changed === true || changedKeys.length > 0) return true;
  }
  const delta = numericFromAnyKey(record, [
    "distance_delta",
    "score_delta",
    "position_delta",
    "speed_delta",
    "hud_delta",
  ]);
  if (delta !== null) {
    metrics.state_numeric_delta = delta;
    return Math.abs(delta) > 0;
  }
  return false;
}

function motionObservedFrom(
  record: Record<string, unknown>,
  assertions: Record<string, unknown>,
  thresholds: RiddleProofPlayabilityAssessment["thresholds"],
  metrics: Record<string, unknown>,
) {
  if (trueForAnyKey(assertions, MOTION_ASSERTION_KEYS)) return true;
  for (const source of [
    recordValue(record.playfield_delta),
    recordValue(record.playfieldDelta),
    recordValue(record.non_hud_delta),
    recordValue(record.nonHudDelta),
    recordValue(record.pixel_delta),
    recordValue(record.pixelDelta),
    recordValue(record.canvas_delta),
    recordValue(record.canvasDelta),
    recordValue(record.motion_delta),
    recordValue(record.motionDelta),
    recordValue(record.visual_delta),
    recordValue(record.visualDelta),
    record,
  ]) {
    if (!source) continue;
    const percent = percentFrom(source);
    const pixels = numericFromAnyKey(source, PIXEL_KEYS);
    const averageDelta = numericFromAnyKey(source, AVERAGE_DELTA_KEYS);
    if (percent !== null) metrics.changed_percent = percent;
    if (pixels !== null) metrics.changed_pixels = pixels;
    if (averageDelta !== null) metrics.average_delta = averageDelta;
    if (percent !== null && percent >= thresholds.minChangedPercent) return true;
    if (pixels !== null && pixels >= thresholds.minChangedPixels) return true;
    if (averageDelta !== null && averageDelta >= thresholds.minAverageDelta) return true;
  }
  return false;
}

function timeProgressedFrom(
  record: Record<string, unknown>,
  assertions: Record<string, unknown>,
  thresholds: RiddleProofPlayabilityAssessment["thresholds"],
  metrics: Record<string, unknown>,
) {
  if (trueForAnyKey(assertions, TIME_ASSERTION_KEYS)) return true;
  const timeDelta = numericFromAnyKey(record, TIME_DELTA_KEYS);
  if (timeDelta !== null) {
    metrics.time_delta_ms = timeDelta;
    return timeDelta >= thresholds.minTimeDeltaMs;
  }
  const stateDelta = recordValue(record.state_delta) || recordValue(record.stateDelta);
  const nestedDelta = numericFromAnyKey(stateDelta || {}, TIME_DELTA_KEYS);
  if (nestedDelta !== null) {
    metrics.time_delta_ms = nestedDelta;
    return nestedDelta >= thresholds.minTimeDeltaMs;
  }
  return false;
}

function hasExplicitPlayabilityFailure(record: Record<string, unknown>, assertions: Record<string, unknown>) {
  if (record.passed === false || record.playable === false || assertions.playabilityPassed === false) {
    return true;
  }
  for (const key of [
    ...INPUT_ASSERTION_KEYS,
    ...STATE_ASSERTION_KEYS,
    ...MOTION_ASSERTION_KEYS,
    ...TIME_ASSERTION_KEYS,
  ]) {
    if (assertions[key] === false) return true;
  }
  return false;
}

function trueForAnyKey(record: Record<string, unknown>, keys: string[]) {
  return keys.some((key) => record[key] === true);
}

function hasAnyKey(record: Record<string, unknown>, keys: string[]) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(record, key));
}

function percentFrom(record: Record<string, unknown>) {
  const percent = numericFromAnyKey(record, PERCENT_KEYS);
  if (percent !== null) return percent;
  const ratio = numericFromAnyKey(record, RATIO_KEYS);
  if (ratio !== null) return ratio <= 1 ? ratio * 100 : ratio;
  return null;
}

function numericFromAnyKey(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = numericValue(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function listValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function parseJson(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed || !/^[{[]/.test(trimmed)) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
