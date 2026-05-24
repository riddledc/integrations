import type { RiddleProofProfile } from "@riddledc/riddle-proof";

export interface NeonDurableMixOverrideTarget {
  song: string;
  mixProfileId: string | null;
  route?: string | null;
  instrument?: string | null;
  songSlug?: string | null;
}

export interface NeonDurableMixOverride {
  id: string;
  status?: string | null;
  target: NeonDurableMixOverrideTarget;
  mixerLevels: Record<string, number>;
  source?: unknown;
  doesNotProve?: readonly string[];
}

export interface NeonDurableCurrentTargetProfileOptions {
  name?: string;
  url?: string;
  route?: string;
  viewports?: RiddleProofProfile["target"]["viewports"];
  bars?: number;
  monitorProfile?: string;
  maxPeak?: number;
  minRms?: number;
  timeoutSec?: number;
  waitForSelector?: string;
  packPublicName?: string;
}

export interface NeonDurableCurrentTargetFinding {
  classification: "app_contract_gap" | "product_regression" | "proof_insufficient";
  message: string;
  check?: unknown;
  metrics?: unknown;
}

export interface NeonDurableCurrentTargetRunSummary {
  version: "riddle-proof.neon-durable-current-target-summary.v1";
  ok: boolean;
  status: "passed" | "deterministic_findings_present";
  overrideId: string;
  target: NeonDurableMixOverrideTarget;
  expectedMixerLevels: Record<string, number>;
  selectedSong: string | null;
  mixProfileId: string | null;
  observations: unknown[];
  mixHealth: unknown;
  findings: NeonDurableCurrentTargetFinding[];
  boundary: string;
}

export interface NeonDurableCurrentTargetArtifacts {
  summary: NeonDurableCurrentTargetRunSummary;
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

const TRAINER_INSTRUMENT_URL_VALUES: Readonly<Record<string, string>> = Object.freeze({
  drums: "drums",
  bass: "bass",
  rhythmSynth: "rhythm-synth",
  chord: "chord",
  guitar: "guitar",
});

const TRAINER_INSTRUMENT_ALIASES: Readonly<Record<string, keyof typeof TRAINER_INSTRUMENT_URL_VALUES>> = Object.freeze({
  drums: "drums",
  drum: "drums",
  bass: "bass",
  "rhythm-synth": "rhythmSynth",
  rhythmsynth: "rhythmSynth",
  vocal: "rhythmSynth",
  vocals: "rhythmSynth",
  "vocal-melody": "rhythmSynth",
  melody: "rhythmSynth",
  chord: "chord",
  chords: "chord",
  pad: "chord",
  keys: "chord",
  guitar: "guitar",
  lead: "guitar",
});

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

const asRecord = (value: unknown): Record<string, unknown> => (
  isRecord(value) ? value : {}
);

const safeString = (value: unknown): string | null => (
  typeof value === "string" && value.trim() ? value : null
);

const roundLevel = (value: number): number => Number(value.toFixed(4));

export function slugifyNeonSongValue(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function neonTrainerInstrumentUrlValue(track: string): string | null {
  const canonical = TRAINER_INSTRUMENT_ALIASES[slugifyNeonSongValue(track)] ?? null;
  return canonical ? TRAINER_INSTRUMENT_URL_VALUES[canonical] : null;
}

export function sanitizeNeonMixerLevels(levels: unknown): Record<string, number> {
  const record = asRecord(levels);
  return Object.fromEntries(
    Object.entries(record)
      .map(([track, level]) => [track.trim(), Number(level)] as const)
      .filter(([track, level]) => track.length > 0 && Number.isFinite(level))
      .map(([track, level]) => [track, Math.max(0, Math.min(1.5, roundLevel(level)))])
  );
}

export function normalizeNeonDurableMixOverride(value: unknown): NeonDurableMixOverride | null {
  const entry = asRecord(value);
  const target = asRecord(entry.target);
  const id = safeString(entry.id);
  const song = safeString(target.song);
  const mixerLevels = sanitizeNeonMixerLevels(entry.mixerLevels);
  if (!id || !song || Object.keys(mixerLevels).length === 0) return null;
  return {
    id,
    status: safeString(entry.status),
    target: {
      song,
      mixProfileId: safeString(target.mixProfileId),
      route: safeString(target.route),
      instrument: safeString(target.instrument),
      songSlug: safeString(target.songSlug),
    },
    mixerLevels,
    source: entry.source,
    doesNotProve: Array.isArray(entry.doesNotProve)
      ? entry.doesNotProve.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
  };
}

export function readActiveNeonDurableMixOverrides(document: unknown): NeonDurableMixOverride[] {
  const entries = Array.isArray(asRecord(document).overrides) ? asRecord(document).overrides as unknown[] : [];
  return entries
    .map(normalizeNeonDurableMixOverride)
    .filter((entry): entry is NeonDurableMixOverride => entry !== null && entry.status === "active");
}

export function firstNeonMixerTrack(override: NeonDurableMixOverride): string {
  return Object.keys(override.mixerLevels)[0] ?? "bass";
}

export function routeForNeonDurableOverride(
  override: NeonDurableMixOverride,
  options: Pick<NeonDurableCurrentTargetProfileOptions, "route"> = {},
): string {
  if (options.route) return options.route;
  if (override.target.route) return override.target.route;
  const song = override.target.songSlug ?? slugifyNeonSongValue(override.target.song);
  const firstTrack = firstNeonMixerTrack(override);
  const requestedInstrument = override.target.instrument ?? firstTrack;
  const instrument = neonTrainerInstrumentUrlValue(requestedInstrument) ?? requestedInstrument ?? "bass";
  return `/games/drum-sequencer?song=${encodeURIComponent(song)}&mix=profile&view=trainer&instrument=${encodeURIComponent(instrument)}`;
}

export function neonDurableOverrideSlug(override: NeonDurableMixOverride): string {
  return slugifyNeonSongValue(`${override.target.song}-${override.id}`);
}

function buildDurableCurrentTargetScript(override: NeonDurableMixOverride): string {
  const expected = {
    id: override.id,
    target: {
      song: override.target.song,
      mixProfileId: override.target.mixProfileId,
    },
    mixerLevels: override.mixerLevels,
  };
  const expectedJson = JSON.stringify(expected).replace(/</g, "\\u003c");
  return [
    `const expected=${expectedJson};`,
    "const approx=(a,b)=>Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Math.abs(Number(a)-Number(b))<=0.0005;",
    "const visible=(value)=>Number(value).toFixed(2).toUpperCase()+'X';",
    "const api=window.__NEON_MIX_PROOF__||window.__RIDDLE_SEQUENCER_PROOF__;",
    "const diagnostic=api?.captureDiagnostic?.();",
    "const state=api?.getState?.()||api?.getSummary?.()||diagnostic?.state||{};",
    "const mixer=api?.getMixerState?.()||{};",
    "const body=document.body?.innerText||'';",
    "const mixProfile=state?.profile?.mixProfile||mixer?.mixProfile||{};",
    "const levels=state?.profile?.mixerLevels||mixer?.levels||{};",
    "const observations=Object.entries(expected.mixerLevels||{}).map(([track,expectedLevel])=>{const actualLevel=levels?.[track]; const profileLevel=mixProfile?.mixerLevels?.[track]; const visibleToken=visible(expectedLevel); return {track,expectedLevel,actualLevel,profileLevel,visibleToken,contractMatches:approx(actualLevel,expectedLevel),profileMatches:approx(profileLevel,expectedLevel),visibleMatches:body.includes(visibleToken)};});",
    "const out={ok:Boolean(api)&&state?.selectedSong===expected.target.song&&mixProfile?.id===expected.target.mixProfileId&&observations.length>0&&observations.every((entry)=>entry.contractMatches&&entry.profileMatches&&entry.visibleMatches),available:Boolean(api),selectedSong:state?.selectedSong||null,expectedSong:expected.target.song,selectedSongMatches:state?.selectedSong===expected.target.song,mixProfileId:mixProfile?.id||null,expectedMixProfileId:expected.target.mixProfileId,mixProfileMatches:mixProfile?.id===expected.target.mixProfileId,observations,levelsMatch:observations.every((entry)=>entry.contractMatches&&entry.profileMatches),visibleLevelMatches:observations.every((entry)=>entry.visibleMatches),boundary:'current-target durable override audit only; this does not prove subjective mix taste'};",
    "window.__neonDurableCurrentTarget={...(window.__neonDurableCurrentTarget||{}),check:out};",
    "return out;",
  ].join(" ");
}

export function buildNeonDurableCurrentTargetProfile(
  override: NeonDurableMixOverride,
  options: NeonDurableCurrentTargetProfileOptions = {},
): RiddleProofProfile {
  const slug = neonDurableOverrideSlug(override);
  const bars = Number(options.bars ?? 1);
  const monitorProfile = options.monitorProfile ?? "smallSpeaker";
  const maxPeak = Number(options.maxPeak ?? 0.98);
  const minRms = Number(options.minRms ?? 0.005);
  const waitForSelector = options.waitForSelector ?? ".drum-sequencer h1";
  const profile: RiddleProofProfile = {
    version: "riddle-proof.profile.v1",
    name: options.name ?? `neon-step-sequencer-durable-current-target-${slug}`,
    target: {
      ...(options.url ? { url: options.url } : {}),
      route: routeForNeonDurableOverride(override, options),
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
          label: "verify-durable-current-target",
          script: buildDurableCurrentTargetScript(override),
          store_return_to: "__neonDurableCurrentTarget.check",
          return_summary_fields: [
            { path: "ok" },
            { path: "selectedSong" },
            { path: "mixProfileId" },
            { path: "levelsMatch" },
            { path: "visibleLevelMatches" },
          ],
          timeout_ms: 10000,
        },
        {
          type: "assert_window_value",
          path: "__neonDurableCurrentTarget.check.ok",
          until_expected_value: true,
          expected_value: true,
          timeout_ms: 10000,
        },
        {
          type: "assert_window_value",
          path: "__neonDurableCurrentTarget.check.selectedSongMatches",
          until_expected_value: true,
          expected_value: true,
          timeout_ms: 10000,
        },
        {
          type: "assert_window_value",
          path: "__neonDurableCurrentTarget.check.mixProfileMatches",
          until_expected_value: true,
          expected_value: true,
          timeout_ms: 10000,
        },
        {
          type: "assert_window_value",
          path: "__neonDurableCurrentTarget.check.levelsMatch",
          until_expected_value: true,
          expected_value: true,
          timeout_ms: 10000,
        },
        {
          type: "assert_window_value",
          path: "__neonDurableCurrentTarget.check.visibleLevelMatches",
          until_expected_value: true,
          expected_value: true,
          timeout_ms: 10000,
        },
        {
          type: "window_call",
          label: "prepare-audio-proof",
          path: "__NEON_MIX_PROOF__.prepareForAudioProof",
          args: [{ loadAll: false }],
          store_return_to: "__neonDurableCurrentTarget.sources",
          return_summary_fields: [
            { path: "ok" },
            { path: "sources.drums" },
            { path: "sources.bass" },
          ],
          timeout_ms: 90000,
        },
        {
          type: "window_call",
          label: "render-current-target-metrics",
          path: "__NEON_MIX_PROOF__.renderOfflineMetrics",
          args: [{
            bars,
            seed: `neon-durable-current-target-${override.id}`,
            monitorProfile,
          }],
          store_return_to: "__neonDurableCurrentTarget.metrics",
          return_summary_fields: [
            { path: "ok" },
            { path: "mixHealth.peak" },
            { path: "mixHealth.rms" },
            { path: "mixHealth.clipping" },
          ],
          timeout_ms: 120000,
        },
        {
          type: "assert_window_value",
          path: "__neonDurableCurrentTarget.metrics.ok",
          until_expected_value: true,
          expected_value: true,
          timeout_ms: 10000,
        },
        {
          type: "assert_window_number",
          path: "__neonDurableCurrentTarget.metrics.mixHealth.peak",
          max_value: maxPeak,
          timeout_ms: 10000,
        },
        {
          type: "assert_window_number",
          path: "__neonDurableCurrentTarget.metrics.mixHealth.rms",
          min_value: minRms,
          timeout_ms: 10000,
        },
        {
          type: "screenshot",
          label: "neon-durable-current-target",
          full_page: false,
        },
      ],
    },
    checks: [
      {
        type: "route_loaded",
        expected_path: "/games/drum-sequencer",
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
      product_regression: "fail",
      proof_insufficient: "review",
      environment_blocked: "neutral",
      configuration_error: "fail",
      needs_human_review: "fail",
    },
    metadata: {
      pack_id: "neon_step_sequencer",
      pack_public_name: options.packPublicName ?? "Neon Step Sequencer Pack",
      evidence_role_pattern: "current_target",
      purpose: "Current-target proof that an approved durable mix override is live in the app contract, visible UI, and basic offline render guardrails.",
      override_id: override.id,
      required_receipts: [
        "selected song matches durable override target",
        "mix profile id matches durable override target",
        "contract mixer levels match durable override levels",
        "visible mixer level text reflects durable override levels",
        "current target render passes basic headroom and non-silence guardrails",
      ],
      does_not_prove: [
        "subjective mix quality",
        "that the approval surrogate is a real listener preference",
        "all possible mix edits",
      ],
    },
  };
  return profile;
}

const actionMatches = (action: Record<string, unknown>, actionPathOrLabel: string): boolean => (
  action.path === actionPathOrLabel
  || action.label === actionPathOrLabel
  || action.return_stored_to === actionPathOrLabel
);

export function findNeonSetupActionReturn(profileResult: unknown, actionPathOrLabel: string): unknown {
  const checks = Array.isArray(asRecord(profileResult).checks) ? asRecord(profileResult).checks as unknown[] : [];
  const setupCheck = checks
    .map(asRecord)
    .find((check) => check.type === "setup_actions_succeeded");
  const setupSummary = asRecord(asRecord(setupCheck?.evidence).setup_summary);
  const viewports = Array.isArray(setupSummary.viewports) ? setupSummary.viewports : [];
  for (const viewport of viewports) {
    const viewportRecord = asRecord(viewport);
    for (const bucket of ["window_eval", "window_call"] as const) {
      const actions = Array.isArray(viewportRecord[bucket]) ? viewportRecord[bucket] as unknown[] : [];
      for (const actionValue of actions) {
        const action = asRecord(actionValue);
        if (actionMatches(action, actionPathOrLabel)) {
          return action.returned ?? null;
        }
      }
    }
  }
  return null;
}

const observationsFromCheck = (check: unknown): unknown[] => {
  const observations = asRecord(check).observations;
  return Array.isArray(observations) ? observations : [];
};

const hasObservationMismatch = (observations: unknown[], field: string): boolean => (
  observations.some((observation) => asRecord(observation)[field] === false)
);

const classifyDurableCheckFailure = (check: unknown): NeonDurableCurrentTargetFinding["classification"] => {
  if (!check) return "proof_insufficient";
  const observations = observationsFromCheck(check);
  if (hasObservationMismatch(observations, "profileMatches")) return "app_contract_gap";
  return "product_regression";
};

export function summarizeNeonDurableCurrentTargetRun({
  override,
  profileResult,
}: {
  override: NeonDurableMixOverride;
  profileResult: unknown;
}): NeonDurableCurrentTargetRunSummary {
  const profileResultRecord = asRecord(profileResult);
  const check = findNeonSetupActionReturn(profileResult, "__neonDurableCurrentTarget.check")
    ?? findNeonSetupActionReturn(profileResult, "verify-durable-current-target");
  const metrics = findNeonSetupActionReturn(profileResult, "__NEON_MIX_PROOF__.renderOfflineMetrics")
    ?? findNeonSetupActionReturn(profileResult, "__neonDurableCurrentTarget.metrics")
    ?? findNeonSetupActionReturn(profileResult, "render-current-target-metrics");
  const checkRecord = asRecord(check);
  const metricsRecord = asRecord(metrics);
  const ok = Boolean(profileResultRecord.status === "passed" && checkRecord.ok === true && metricsRecord.ok === true);
  const findings: NeonDurableCurrentTargetFinding[] = [];
  if (checkRecord.ok !== true) {
    findings.push({
      classification: classifyDurableCheckFailure(check),
      message: "Durable override was not reflected across the current browser target receipts.",
      check,
    });
  }
  if (metrics && metricsRecord.ok !== true) {
    findings.push({
      classification: "product_regression",
      message: "Current target render metrics did not pass.",
      metrics,
    });
  }
  return {
    version: "riddle-proof.neon-durable-current-target-summary.v1",
    ok,
    status: ok ? "passed" : "deterministic_findings_present",
    overrideId: override.id,
    target: override.target,
    expectedMixerLevels: override.mixerLevels,
    selectedSong: safeString(checkRecord.selectedSong),
    mixProfileId: safeString(checkRecord.mixProfileId),
    observations: observationsFromCheck(check),
    mixHealth: metricsRecord.mixHealth ?? null,
    findings,
    boundary: "Current-target durable override audit only; this does not prove subjective mix taste.",
  };
}

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "not captured";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
};

export function formatNeonDurableCurrentTargetSummaryMarkdown(
  summary: NeonDurableCurrentTargetRunSummary,
  options: { title?: string } = {},
): string {
  const lines = [
    `# ${options.title ?? "Neon Durable Current-Target Proof"}`,
    "",
    `- status: \`${summary.status}\``,
    `- ok: \`${summary.ok}\``,
    `- override_id: \`${summary.overrideId}\``,
    `- selected_song: ${summary.selectedSong ?? "not captured"}`,
    `- mix_profile_id: \`${summary.mixProfileId ?? "not captured"}\``,
    `- expected_levels: \`${JSON.stringify(summary.expectedMixerLevels)}\``,
    "",
    "## Receipts",
    "",
  ];

  for (const observationValue of summary.observations) {
    const observation = asRecord(observationValue);
    lines.push(
      `- ${formatValue(observation.track)}: expected \`${formatValue(observation.expectedLevel)}\`, contract \`${formatValue(observation.actualLevel)}\`, profile \`${formatValue(observation.profileLevel)}\`, visible \`${formatValue(observation.visibleMatches)}\``,
    );
  }

  const mixHealth = asRecord(summary.mixHealth);
  lines.push(
    "",
    "## Mix Health",
    "",
    `- peak: \`${formatValue(mixHealth.peak)}\``,
    `- rms: \`${formatValue(mixHealth.rms)}\``,
    `- clipping: \`${formatValue(mixHealth.clipping)}\``,
    `- low_level: \`${formatValue(mixHealth.lowLevel)}\``,
  );

  if (summary.findings.length > 0) {
    lines.push("", "## Findings", "");
    for (const finding of summary.findings) {
      lines.push(`- ${finding.classification}: ${finding.message}`);
    }
  }

  lines.push("", "## Boundary", "", summary.boundary);
  return `${lines.join("\n")}\n`;
}

export function createNeonDurableCurrentTargetArtifacts(
  input: {
    override: NeonDurableMixOverride;
    profileResult: unknown;
  },
  options: { title?: string } = {},
): NeonDurableCurrentTargetArtifacts {
  const summary = summarizeNeonDurableCurrentTargetRun(input);
  return {
    summary,
    json: `${JSON.stringify(summary, null, 2)}\n`,
    markdown: formatNeonDurableCurrentTargetSummaryMarkdown(summary, options),
  };
}
