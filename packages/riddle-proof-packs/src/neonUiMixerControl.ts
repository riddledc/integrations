import type { RiddleProofProfile } from "@riddledc/riddle-proof";
import { findNeonSetupActionReturn } from "./neonDurableCurrentTarget";

export interface NeonUiMixerControlProfileOptions {
  name?: string;
  url?: string;
  route?: string;
  viewports?: RiddleProofProfile["target"]["viewports"];
  track?: string;
  targetLevel?: number;
  minAbsLevelDelta?: number;
  bars?: number;
  monitorProfile?: string;
  maxPeak?: number;
  minRms?: number;
  timeoutSec?: number;
  waitForSelector?: string;
  packPublicName?: string;
}

export interface NeonUiMixerControlRunSummary {
  version: "riddle-proof.neon-ui-mixer-control-summary.v1";
  ok: boolean;
  status: "ui_mixer_control_ready" | "deterministic_findings_present";
  profileStatus: string | null;
  track: string | null;
  targetLevel: number | null;
  beforeContractLevel: number | null;
  beforeInputLevel: number | null;
  beforeReadoutLevel: number | null;
  afterContractLevel: number | null;
  afterInputLevel: number | null;
  afterReadoutLevel: number | null;
  levelDelta: number | null;
  absLevelDelta: number | null;
  minAbsLevelDelta: number | null;
  proofApiEditUsed: boolean;
  guardrails: Record<string, unknown> | null;
  restore: {
    ok: boolean;
    restoreLevel: number | null;
    restoredLevel: number | null;
    proofApiEditUsed: boolean;
  } | null;
  findingCount: number;
  findings: string[];
  boundary: string;
}

export interface NeonUiMixerControlMatrixRow {
  viewport: string | null;
  ok: boolean;
  status: string | null;
  track: string | null;
  targetLevel: number | null;
  beforeContractLevel: number | null;
  afterContractLevel: number | null;
  levelDelta: number | null;
  absLevelDelta: number | null;
  proofApiEditUsed: boolean | null;
  findingCount: number;
  findings: string[];
  error: string | null;
  outputDir: string | null;
  markdownPath: string | null;
}

export interface NeonUiMixerControlMatrixOptions {
  allowFindings?: unknown;
  outputDir?: unknown;
  elapsedMs?: unknown;
  tracks?: unknown;
  targetLevel?: unknown;
  minAbsLevelDelta?: unknown;
  matrixConcurrency?: unknown;
  viewportCount?: unknown;
  trackCount?: unknown;
}

export interface NeonUiMixerControlMatrixSummary {
  version: "riddle-proof.neon-ui-mixer-control-matrix.v1";
  ok: boolean;
  status: "ui_mixer_control_matrix_ready" | "deterministic_findings_present";
  allowFindings: boolean;
  outputDir: string | null;
  elapsedMs: number | null;
  track: string | null;
  tracks: string[];
  targetLevel: number | null;
  minAbsLevelDelta: number | null;
  matrixConcurrency: number | null;
  viewportCount: number;
  trackCount: number;
  cellCount: number;
  findingCount: number;
  viewports: NeonUiMixerControlMatrixRow[];
  boundary: string;
}

export interface NeonUiMixerControlArtifacts {
  summary: NeonUiMixerControlRunSummary;
  json: string;
  markdown: string;
}

const DEFAULT_VIEWPORTS = Object.freeze([
  Object.freeze({
    name: "desktop",
    width: 1440,
    height: 1000,
  }),
]);

const DEFAULT_ROUTE = "/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile&view=trainer&instrument=guitar";
const DEFAULT_WAIT_FOR_SELECTOR = ".drum-sequencer h1";
const BOUNDARY = "This proof exercises the real UI mixer slider and deterministic audio guardrails. It does not prove subjective mix taste.";
const MATRIX_BOUNDARY = "This matrix exercises real UI mixer sliders and deterministic audio/layout guardrails across requested tracks and device-shaped browser surfaces. It does not prove subjective mix taste.";

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

const asRecord = (value: unknown): Record<string, unknown> => (
  isRecord(value) ? value : {}
);

const safeString = (value: unknown): string | null => (
  typeof value === "string" && value.trim() ? value : null
);

const safeNumber = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const safeFindingList = (...values: unknown[]): string[] => {
  const findings: string[] = [];
  for (const value of values) {
    const record = asRecord(value);
    const rawFindings = Array.isArray(record.findings) ? record.findings : [];
    for (const finding of rawFindings) {
      if (typeof finding === "string" && finding.trim()) findings.push(finding);
    }
  }
  return Array.from(new Set(findings));
};

const safeTextList = (value: unknown): string[] => {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean)));
};

const expectedPathForRoute = (route: string): string => {
  try {
    return new URL(route, "https://riddle-proof.local").pathname;
  } catch {
    return "/games/drum-sequencer";
  }
};

const buildUiMixerControlScript = (): string => [
  "const [payload] = args;",
  "const track = String(payload?.track || '');",
  "const targetLevel = Number(payload?.targetLevel);",
  "const minAbsLevelDelta = Number(payload?.minAbsLevelDelta ?? 0.001);",
  "const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));",
  "const escapeAttr = (value) => String(value).replace(/\\\\/g, '\\\\\\\\').replace(/\"/g, '\\\\\"');",
  "const readNumber = (value) => { const number = Number(value); return Number.isFinite(number) ? number : null; };",
  "const approxEqual = (a, b, epsilon = 0.01) => Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) <= epsilon;",
  "const parseReadout = (value) => { const match = String(value ?? '').match(/-?\\d+(?:\\.\\d+)?/u); return match ? Number(match[0]) : null; };",
  "const getApi = () => window.__NEON_MIX_PROOF__ || window.__RIDDLE_NEON_PROOF_CONTRACT__ || window.__RIDDLE_SEQUENCER_PROOF__;",
  "const readMixerLevel = () => { const mixer = getApi()?.getMixerState?.(); return readNumber(mixer?.levels?.[track]); };",
  "const selectorTrack = escapeAttr(track);",
  "const lane = document.querySelector('[data-proof-surface=\"instrument-lane\"][data-proof-track=\"' + selectorTrack + '\"]');",
  "const input = document.querySelector('[data-proof-control=\"mixer-level\"][data-proof-track=\"' + selectorTrack + '\"]');",
  "const readout = document.querySelector('[data-proof-readout=\"mixer-level\"][data-proof-track=\"' + selectorTrack + '\"]');",
  "const beforeContractLevel = readMixerLevel();",
  "const beforeInputLevel = readNumber(input?.value);",
  "const beforeReadoutLevel = parseReadout(readout?.textContent);",
  "const findings = [];",
  "if (!getApi()) findings.push('missing_neon_proof_contract');",
  "if (!lane) findings.push('missing_instrument_lane');",
  "if (!input) findings.push('missing_mixer_level_input');",
  "if (!readout) findings.push('missing_mixer_level_readout');",
  "if (input?.disabled) findings.push('mixer_level_input_disabled');",
  "if (!Number.isFinite(targetLevel)) findings.push('invalid_target_level');",
  "if (!Number.isFinite(minAbsLevelDelta) || minAbsLevelDelta < 0) findings.push('invalid_min_abs_level_delta');",
  "if (findings.length) { const failed = { ok: false, interactionKind: 'ui_mixer_level_slider', proofApiEditUsed: false, track, targetLevel, minAbsLevelDelta, beforeContractLevel, beforeInputLevel, beforeReadoutLevel, findings }; window.__neonUiMixerControl = { ...(window.__neonUiMixerControl || {}), receipt: failed }; return failed; }",
  "const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;",
  "if (setter) setter.call(input, String(targetLevel)); else input.value = String(targetLevel);",
  "input.dispatchEvent(new Event('input', { bubbles: true }));",
  "input.dispatchEvent(new Event('change', { bubbles: true }));",
  "await wait(500);",
  "const afterContractLevel = readMixerLevel();",
  "const afterInputLevel = readNumber(input.value);",
  "const afterReadoutLevel = parseReadout(readout.textContent);",
  "const levelDelta = Number.isFinite(beforeContractLevel) && Number.isFinite(afterContractLevel) ? Number((afterContractLevel - beforeContractLevel).toFixed(4)) : null;",
  "const absLevelDelta = Number.isFinite(levelDelta) ? Number(Math.abs(levelDelta).toFixed(4)) : null;",
  "const levelMoved = absLevelDelta === null ? true : absLevelDelta >= minAbsLevelDelta;",
  "const contractMatchesTarget = approxEqual(afterContractLevel, targetLevel);",
  "const inputMatchesTarget = approxEqual(afterInputLevel, targetLevel);",
  "const readoutMatchesTarget = approxEqual(afterReadoutLevel, targetLevel);",
  "if (!levelMoved) findings.push('contract_level_delta_below_minimum');",
  "if (!contractMatchesTarget) findings.push('contract_level_target_mismatch');",
  "if (!inputMatchesTarget) findings.push('slider_value_target_mismatch');",
  "if (!readoutMatchesTarget) findings.push('readout_target_mismatch');",
  "const receipt = { ok: findings.length === 0, interactionKind: 'ui_mixer_level_slider', proofApiEditUsed: false, track, targetLevel, minAbsLevelDelta, beforeContractLevel, beforeInputLevel, beforeReadoutLevel, afterContractLevel, afterInputLevel, afterReadoutLevel, levelDelta, absLevelDelta, levelMoved, contractMatchesTarget, inputMatchesTarget, readoutMatchesTarget, findings };",
  "window.__neonUiMixerControl = { ...(window.__neonUiMixerControl || {}), receipt };",
  "return receipt;",
].join(" ");

const buildUiMixerGuardrailScript = (): string => [
  "const receipt = window.__neonUiMixerControl?.receipt || {};",
  "const render = window.__neonUiMixerControl?.render || {};",
  "const mixHealth = render.mixHealth || {};",
  "const findings = [];",
  "if (!receipt.ok) findings.push(...(receipt.findings || ['ui_mixer_control_receipt_failed']));",
  "if (!render.ok) findings.push('offline_render_failed');",
  "if (mixHealth.clipping === true) findings.push('post_control_render_clipping');",
  "if (mixHealth.lowLevel === true) findings.push('post_control_render_low_level');",
  "const peak = Number(mixHealth.peak);",
  "if (Number.isFinite(peak) && peak >= 0.98) findings.push('post_control_peak_too_high');",
  "const summary = { ok: findings.length === 0, status: findings.length === 0 ? 'ui_mixer_control_ready' : 'deterministic_findings_present', track: receipt.track || null, targetLevel: receipt.targetLevel ?? null, beforeContractLevel: receipt.beforeContractLevel ?? null, afterContractLevel: receipt.afterContractLevel ?? null, levelDelta: receipt.levelDelta ?? null, proofApiEditUsed: receipt.proofApiEditUsed === true, guardrails: { renderOk: render.ok === true, clipping: mixHealth.clipping === true, lowLevel: mixHealth.lowLevel === true, peak: Number.isFinite(peak) ? peak : null, rms: Number.isFinite(Number(mixHealth.rms)) ? Number(mixHealth.rms) : null, headroomDb: Number.isFinite(Number(mixHealth.headroomDb)) ? Number(mixHealth.headroomDb) : null }, findings, boundary: 'UI control and deterministic audio guardrails only; this does not prove subjective mix taste.' };",
  "window.__neonUiMixerControl = { ...(window.__neonUiMixerControl || {}), summary };",
  "return summary;",
].join(" ");

const buildUiMixerRestoreScript = (): string => [
  "const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));",
  "const escapeAttr = (value) => String(value).replace(/\\\\/g, '\\\\\\\\').replace(/\"/g, '\\\\\"');",
  "const approxEqual = (a, b, epsilon = 0.01) => Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) <= epsilon;",
  "const receipt = window.__neonUiMixerControl?.receipt || {};",
  "const track = String(receipt.track || '');",
  "const restoreLevel = Number(receipt.beforeContractLevel);",
  "const getApi = () => window.__NEON_MIX_PROOF__ || window.__RIDDLE_NEON_PROOF_CONTRACT__ || window.__RIDDLE_SEQUENCER_PROOF__;",
  "const readMixerLevel = () => Number(getApi()?.getMixerState?.()?.levels?.[track]);",
  "const input = document.querySelector('[data-proof-control=\"mixer-level\"][data-proof-track=\"' + escapeAttr(track) + '\"]');",
  "const findings = [];",
  "if (!input) findings.push('missing_mixer_level_input');",
  "if (!Number.isFinite(restoreLevel)) findings.push('missing_restore_level');",
  "if (!findings.length) { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set; if (setter) setter.call(input, String(restoreLevel)); else input.value = String(restoreLevel); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); await wait(400); }",
  "const restoredLevel = readMixerLevel();",
  "if (!approxEqual(restoredLevel, restoreLevel)) findings.push('restore_level_mismatch');",
  "const restore = { ok: findings.length === 0, interactionKind: 'ui_mixer_level_restore', proofApiEditUsed: false, track, restoreLevel: Number.isFinite(restoreLevel) ? restoreLevel : null, restoredLevel: Number.isFinite(restoredLevel) ? restoredLevel : null, findings };",
  "window.__neonUiMixerControl = { ...(window.__neonUiMixerControl || {}), restore };",
  "return restore;",
].join(" ");

export function buildNeonUiMixerControlProfile(
  options: NeonUiMixerControlProfileOptions = {},
): RiddleProofProfile {
  const route = options.route ?? DEFAULT_ROUTE;
  const track = options.track ?? "guitar";
  const targetLevel = Number(options.targetLevel ?? 0.5);
  const minAbsLevelDelta = Number(options.minAbsLevelDelta ?? 0.001);
  const bars = Number(options.bars ?? 1);
  const monitorProfile = options.monitorProfile ?? "smallSpeaker";
  const maxPeak = Number(options.maxPeak ?? 0.98);
  const minRms = Number(options.minRms ?? 0.005);
  const waitForSelector = options.waitForSelector ?? DEFAULT_WAIT_FOR_SELECTOR;
  const profile: RiddleProofProfile = {
    version: "riddle-proof.profile.v1",
    name: options.name ?? `neon-step-sequencer-ui-mixer-control-${track}`,
    target: {
      ...(options.url ? { url: options.url } : {}),
      route,
      viewports: options.viewports ?? [...DEFAULT_VIEWPORTS],
      auth: "none",
      timeout_sec: options.timeoutSec ?? 240,
      wait_for_selector: waitForSelector,
      setup_actions: [
        {
          type: "wait_for_selector",
          selector: waitForSelector,
          timeout_ms: 20000,
        },
        {
          type: "window_eval",
          label: "apply-ui-mixer-level-control",
          args: [{ track, targetLevel, minAbsLevelDelta }],
          store_return_to: "__neonUiMixerControl.receipt",
          capture_return: true,
          timeout_ms: 15000,
          script: buildUiMixerControlScript(),
          return_summary_fields: [
            { path: "ok" },
            { path: "track" },
            { path: "targetLevel" },
            { path: "minAbsLevelDelta" },
            { path: "beforeContractLevel" },
            { path: "afterContractLevel" },
            { path: "absLevelDelta" },
            { path: "proofApiEditUsed" },
          ],
        },
        {
          type: "assert_window_value",
          path: "__neonUiMixerControl.receipt.ok",
          expected_value: true,
          timeout_ms: 10000,
        },
        {
          type: "assert_window_value",
          path: "__neonUiMixerControl.receipt.proofApiEditUsed",
          expected_value: false,
          timeout_ms: 10000,
        },
        {
          type: "screenshot",
          label: "neon-ui-mixer-control-after",
          full_page: false,
        },
        {
          type: "window_call",
          label: "render-post-ui-control-metrics",
          path: "__NEON_MIX_PROOF__.renderOfflineMetrics",
          args: [{
            bars,
            seed: `neon-ui-mixer-control-${track}`,
            monitorProfile,
          }],
          store_return_to: "__neonUiMixerControl.render",
          capture_return: true,
          timeout_ms: 120000,
          return_summary_fields: [
            { path: "ok" },
            { path: "mixHealth.peak" },
            { path: "mixHealth.rms" },
            { path: "mixHealth.headroomDb" },
            { path: "mixHealth.clipping" },
            { path: "mixHealth.lowLevel" },
          ],
        },
        {
          type: "assert_window_value",
          path: "__neonUiMixerControl.render.ok",
          expected_value: true,
          timeout_ms: 10000,
        },
        {
          type: "assert_window_number",
          path: "__neonUiMixerControl.render.mixHealth.peak",
          max_value: maxPeak,
          timeout_ms: 10000,
        },
        {
          type: "assert_window_number",
          path: "__neonUiMixerControl.render.mixHealth.rms",
          min_value: minRms,
          timeout_ms: 10000,
        },
        {
          type: "window_eval",
          label: "classify-ui-mixer-control-guardrails",
          store_return_to: "__neonUiMixerControl.summary",
          capture_return: true,
          timeout_ms: 10000,
          script: buildUiMixerGuardrailScript(),
          return_summary_fields: [
            { path: "ok" },
            { path: "status" },
            { path: "guardrails.peak" },
            { path: "guardrails.clipping" },
            { path: "guardrails.lowLevel" },
          ],
        },
        {
          type: "assert_window_value",
          path: "__neonUiMixerControl.summary.ok",
          expected_value: true,
          timeout_ms: 10000,
        },
        {
          type: "window_eval",
          label: "restore-ui-mixer-level-control",
          store_return_to: "__neonUiMixerControl.restore",
          capture_return: true,
          timeout_ms: 15000,
          script: buildUiMixerRestoreScript(),
          return_summary_fields: [
            { path: "ok" },
            { path: "track" },
            { path: "restoreLevel" },
            { path: "restoredLevel" },
            { path: "proofApiEditUsed" },
          ],
        },
        {
          type: "assert_window_value",
          path: "__neonUiMixerControl.restore.ok",
          expected_value: true,
          timeout_ms: 10000,
        },
        {
          type: "screenshot",
          label: "neon-ui-mixer-control-final",
          full_page: false,
        },
      ],
    },
    checks: [
      {
        type: "route_loaded",
        expected_path: expectedPathForRoute(route),
      },
      {
        type: "selector_visible",
        selector: waitForSelector,
      },
      {
        type: "no_horizontal_overflow",
        max_overflow_px: 1,
      },
      {
        type: "no_fatal_console_errors",
      },
    ],
    artifacts: [
      "screenshot",
      "console",
      "dom_summary",
      "proof_json",
    ],
    baseline_policy: "invariant_only",
    failure_policy: {
      environment_blocked: "neutral",
      proof_insufficient: "review",
      product_regression: "fail",
      configuration_error: "fail",
      needs_human_review: "review",
    },
    metadata: {
      pack_id: "neon_step_sequencer",
      pack_public_name: options.packPublicName ?? "Neon Step Sequencer Pack",
      evidence_role_pattern: "interaction_snapshots",
      purpose: "UI-only proof that the real Neon mixer level slider updates contract state and preserves deterministic render guardrails.",
      track,
      target_level: targetLevel,
      min_abs_level_delta: minAbsLevelDelta,
      required_receipts: [
        "actual range input dispatch",
        "contract mixer level changed by the required minimum",
        "visible readout changed",
        "proof API mixer edit helper not used",
        "post-control offline render metrics",
        "no clipping, headroom, or low-level render guardrail failure",
        "UI slider restoration",
      ],
      does_not_prove: [
        "subjective mix taste",
        "that every mixer control is reachable on every viewport",
        "that proof API controlled edits and UI edits are equivalent for all tracks",
      ],
    },
  };
  return profile;
}

export function summarizeNeonUiMixerControlRun(profileResult: unknown): NeonUiMixerControlRunSummary {
  const profileResultRecord = asRecord(profileResult);
  const receipt = findNeonSetupActionReturn(profileResult, "__neonUiMixerControl.receipt")
    ?? findNeonSetupActionReturn(profileResult, "apply-ui-mixer-level-control");
  const guardrailSummary = findNeonSetupActionReturn(profileResult, "__neonUiMixerControl.summary")
    ?? findNeonSetupActionReturn(profileResult, "classify-ui-mixer-control-guardrails");
  const restore = findNeonSetupActionReturn(profileResult, "__neonUiMixerControl.restore")
    ?? findNeonSetupActionReturn(profileResult, "restore-ui-mixer-level-control");
  const render = findNeonSetupActionReturn(profileResult, "__neonUiMixerControl.render")
    ?? findNeonSetupActionReturn(profileResult, "render-post-ui-control-metrics");
  const receiptRecord = asRecord(receipt);
  const guardrailRecord = asRecord(guardrailSummary);
  const restoreRecord = asRecord(restore);
  const renderRecord = asRecord(render);
  const findings = safeFindingList(receipt, guardrailSummary, restore);
  const deterministicOk = Boolean(
    profileResultRecord.status === "passed"
    && receiptRecord.ok === true
    && guardrailRecord.ok === true
    && restoreRecord.ok === true
    && renderRecord.ok === true
  );

  return {
    version: "riddle-proof.neon-ui-mixer-control-summary.v1",
    ok: deterministicOk,
    status: deterministicOk ? "ui_mixer_control_ready" : "deterministic_findings_present",
    profileStatus: safeString(profileResultRecord.status),
    track: safeString(receiptRecord.track),
    targetLevel: safeNumber(receiptRecord.targetLevel),
    beforeContractLevel: safeNumber(receiptRecord.beforeContractLevel),
    beforeInputLevel: safeNumber(receiptRecord.beforeInputLevel),
    beforeReadoutLevel: safeNumber(receiptRecord.beforeReadoutLevel),
    afterContractLevel: safeNumber(receiptRecord.afterContractLevel),
    afterInputLevel: safeNumber(receiptRecord.afterInputLevel),
    afterReadoutLevel: safeNumber(receiptRecord.afterReadoutLevel),
    levelDelta: safeNumber(receiptRecord.levelDelta),
    absLevelDelta: safeNumber(receiptRecord.absLevelDelta),
    minAbsLevelDelta: safeNumber(receiptRecord.minAbsLevelDelta),
    proofApiEditUsed: receiptRecord.proofApiEditUsed === true,
    guardrails: isRecord(guardrailRecord.guardrails) ? guardrailRecord.guardrails : null,
    restore: restore ? {
      ok: restoreRecord.ok === true,
      restoreLevel: safeNumber(restoreRecord.restoreLevel),
      restoredLevel: safeNumber(restoreRecord.restoredLevel),
      proofApiEditUsed: restoreRecord.proofApiEditUsed === true,
    } : null,
    findingCount: findings.length,
    findings,
    boundary: BOUNDARY,
  };
}

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "not captured";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  return String(value);
};

const escapeTableCell = (value: unknown): string => (
  formatValue(value).replace(/\|/gu, "\\|")
);

const matrixRow = (summary: unknown): NeonUiMixerControlMatrixRow => {
  const record = asRecord(summary);
  const outputDir = safeString(record.outputDir);
  return {
    viewport: safeString(record.viewport),
    ok: record.ok === true,
    status: safeString(record.status),
    track: safeString(record.track),
    targetLevel: safeNumber(record.targetLevel),
    beforeContractLevel: safeNumber(record.beforeContractLevel),
    afterContractLevel: safeNumber(record.afterContractLevel),
    levelDelta: safeNumber(record.levelDelta),
    absLevelDelta: safeNumber(record.absLevelDelta),
    proofApiEditUsed: typeof record.proofApiEditUsed === "boolean" ? record.proofApiEditUsed : null,
    findingCount: Math.max(0, Math.trunc(safeNumber(record.findingCount) ?? 0)),
    findings: safeTextList(record.findings),
    error: safeString(record.error),
    outputDir,
    markdownPath: outputDir ? `${outputDir.replace(/\/+$/u, "")}/ui-mixer-control-summary.md` : null,
  };
};

export function summarizeNeonUiMixerControlMatrix(
  summaries: unknown[] = [],
  options: NeonUiMixerControlMatrixOptions = {},
): NeonUiMixerControlMatrixSummary {
  const rows = summaries.map(matrixRow);
  const tracks = safeTextList(options.tracks);
  const allowFindings = options.allowFindings === true;
  const findingCount = rows.reduce((total, row) => total + row.findingCount, 0);
  const deterministicOk = rows.every((row) => row.ok);
  const resolvedTracks = tracks.length ? tracks : Array.from(new Set(rows.map((row) => row.track).filter(Boolean) as string[]));
  const viewportCount = Math.max(0, Math.trunc(safeNumber(options.viewportCount) ?? new Set(rows.map((row) => row.viewport).filter(Boolean)).size));
  const trackCount = Math.max(0, Math.trunc(safeNumber(options.trackCount) ?? resolvedTracks.length));

  return {
    version: "riddle-proof.neon-ui-mixer-control-matrix.v1",
    ok: deterministicOk || allowFindings,
    status: deterministicOk ? "ui_mixer_control_matrix_ready" : "deterministic_findings_present",
    allowFindings,
    outputDir: safeString(options.outputDir),
    elapsedMs: safeNumber(options.elapsedMs),
    track: resolvedTracks.length === 1 ? resolvedTracks[0] ?? null : null,
    tracks: resolvedTracks,
    targetLevel: safeNumber(options.targetLevel),
    minAbsLevelDelta: safeNumber(options.minAbsLevelDelta),
    matrixConcurrency: safeNumber(options.matrixConcurrency),
    viewportCount,
    trackCount,
    cellCount: rows.length,
    findingCount,
    viewports: rows,
    boundary: MATRIX_BOUNDARY,
  };
}

export function formatNeonUiMixerControlMatrixMarkdown(
  summary: NeonUiMixerControlMatrixSummary,
  options: { title?: string } = {},
): string {
  const lines = [
    `# ${options.title ?? "Neon UI Mixer Control Viewport Matrix"}`,
    "",
    `- status: \`${summary.status}\``,
    `- ok: \`${summary.ok}\``,
    `- viewport_count: \`${summary.viewportCount}\``,
    `- track_count: \`${summary.trackCount}\``,
    `- cell_count: \`${summary.cellCount}\``,
    `- finding_count: \`${summary.findingCount}\``,
    `- matrix_concurrency: \`${formatValue(summary.matrixConcurrency)}\``,
    `- track: \`${formatValue(summary.track)}\``,
    `- target_level: \`${formatValue(summary.targetLevel)}\``,
    "",
    MATRIX_BOUNDARY,
    "",
    "## Viewports",
    "",
    "| Track | Viewport | OK | Status | Before | After | Delta | Proof API Edit | Findings |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const row of summary.viewports) {
    lines.push(`| ${[
      row.track,
      row.viewport,
      row.ok,
      row.status,
      row.beforeContractLevel,
      row.afterContractLevel,
      row.levelDelta,
      row.proofApiEditUsed,
      row.findings.length ? row.findings.join(", ") : "none",
    ].map(escapeTableCell).join(" | ")} |`);
  }

  lines.push("", "## Boundary", "", summary.boundary);
  return `${lines.join("\n")}\n`;
}

export function formatNeonUiMixerControlSummaryMarkdown(
  summary: NeonUiMixerControlRunSummary,
  options: { title?: string } = {},
): string {
  const lines = [
    `# ${options.title ?? "Neon UI Mixer Control Proof"}`,
    "",
    `- status: \`${summary.status}\``,
    `- ok: \`${summary.ok}\``,
    `- profile_status: \`${summary.profileStatus ?? "unknown"}\``,
    `- track: \`${summary.track ?? "unknown"}\``,
    `- target_level: \`${formatValue(summary.targetLevel)}\``,
    `- contract_before: \`${formatValue(summary.beforeContractLevel)}\``,
    `- contract_after: \`${formatValue(summary.afterContractLevel)}\``,
    `- level_delta: \`${formatValue(summary.levelDelta)}\``,
    `- abs_level_delta: \`${formatValue(summary.absLevelDelta)}\``,
    `- min_abs_level_delta: \`${formatValue(summary.minAbsLevelDelta)}\``,
    `- proof_api_edit_used: \`${formatValue(summary.proofApiEditUsed)}\``,
    "",
    "## Browser UI Receipts",
    "",
    `- input_before: \`${formatValue(summary.beforeInputLevel)}\``,
    `- input_after: \`${formatValue(summary.afterInputLevel)}\``,
    `- readout_before: \`${formatValue(summary.beforeReadoutLevel)}\``,
    `- readout_after: \`${formatValue(summary.afterReadoutLevel)}\``,
    "",
    "## Guardrails",
    "",
    `- render_ok: \`${formatValue(summary.guardrails?.renderOk)}\``,
    `- clipping: \`${formatValue(summary.guardrails?.clipping)}\``,
    `- low_level: \`${formatValue(summary.guardrails?.lowLevel)}\``,
    `- peak: \`${formatValue(summary.guardrails?.peak)}\``,
    `- rms: \`${formatValue(summary.guardrails?.rms)}\``,
    `- headroom_db: \`${formatValue(summary.guardrails?.headroomDb)}\``,
    "",
    "## Restoration",
    "",
    `- restore_ok: \`${formatValue(summary.restore?.ok)}\``,
    `- restore_level: \`${formatValue(summary.restore?.restoreLevel)}\``,
    `- restored_level: \`${formatValue(summary.restore?.restoredLevel)}\``,
    `- restore_used_proof_api_edit: \`${formatValue(summary.restore?.proofApiEditUsed)}\``,
  ];

  if (summary.findings.length > 0) {
    lines.push("", "## Findings", "");
    for (const finding of summary.findings) lines.push(`- ${finding}`);
  }

  lines.push("", "## Boundary", "", summary.boundary);
  return `${lines.join("\n")}\n`;
}

export function createNeonUiMixerControlArtifacts(
  profileResult: unknown,
  options: { title?: string } = {},
): NeonUiMixerControlArtifacts {
  const summary = summarizeNeonUiMixerControlRun(profileResult);
  return {
    summary,
    json: `${JSON.stringify(summary, null, 2)}\n`,
    markdown: formatNeonUiMixerControlSummaryMarkdown(summary, options),
  };
}
