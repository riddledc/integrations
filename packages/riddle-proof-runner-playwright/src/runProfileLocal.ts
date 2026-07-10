import path from "node:path";

import { closePlaywrightSession, createPlaywrightBrowserSession, loadPlaywright } from "./browser";
import {
  buildLocalRiddleProofArtifactManifest,
  summarizeArtifactManifest,
} from "./artifacts/artifactManifest";
import { createRiddleProofArtifactStore, type LocalArtifactInfo } from "./artifacts/localArtifactStore";
import {
  buildRiddleProofProfileScript,
  collectRiddleProfileArtifactRefs,
  createRiddleProofObservationReceipt,
  createRiddleProofProfileEnvironmentBlockedResult,
  createRiddleProofProfileInsufficientResult,
  extractRiddleProofProfileResult,
  normalizeRiddleProofProfile,
  resolveRiddleProofProfileTargetUrl,
  resolveRiddleProofProfileTimeoutSec,
  detectRiddlePreviewSource,
  type RiddleProofObservationReceipt,
  type RiddlePreviewReceipt,
  type RiddleProofSourceIdentity,
  type RiddleProofProfile,
  type RiddleProofProfileResult,
  type RiddleProofProfileRunner,
  type RiddleProofProfileViewport,
} from "@riddledc/riddle-proof";

const LOCAL_RUNNER: RiddleProofProfileRunner = "local-playwright";

export type RunProfileLocalOptions = {
  profile: unknown;
  outputDir: string;
  url?: string;
  route?: string;
  viewportNames?: string[];
  timeout?: number;
  headful?: boolean;
  browser?: "chromium" | "firefox" | "webkit";
  previewReceipt?: RiddlePreviewReceipt;
  source?: RiddleProofSourceIdentity;
  sourceDirectory?: string;
};

export type RunProfileLocalResult = {
  result: RiddleProofProfileResult;
  outputDir: string;
  manifestPath: string;
  observationPath: string;
  observation: RiddleProofObservationReceipt;
};

type Session = Awaited<ReturnType<typeof createPlaywrightBrowserSession>>;

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function sanitizeLabel(label: string | undefined, fallback = "screenshot") {
  return String(label || fallback).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || fallback;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value <= 0) return undefined;
  return Math.trunc(value);
}

function resolveTimeoutMs(profile: RiddleProofProfile, options: { timeout?: number }) {
  const timeout = parseNumber(options.timeout);
  const resolved = resolveRiddleProofProfileTimeoutSec(profile, timeout);
  if (resolved) return resolved * 1000;
  if (timeout) return timeout * 1000;
  return undefined;
}

function normalizeViewportNames(input: string[] | string | undefined) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.flatMap((value) => String(value || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
  }
  return String(input).split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function filterProfileViewports(profile: RiddleProofProfile, viewportNames: string[]) {
  if (!viewportNames.length) {
    return {
      profile,
      outputViewport: profile.target.viewports[0] || { name: "desktop", width: 1280, height: 800 },
    };
  }
  const requested = new Set(viewportNames);
  const viewports = profile.target.viewports.filter((viewport) => requested.has(String(viewport.name || "").toLowerCase()));
  if (!viewports.length) {
    throw new Error(`No profile viewports matched --viewport-name: ${viewportNames.join(", ")}`);
  }
  return {
    profile: {
      ...profile,
      target: {
        ...profile.target,
        viewports,
      },
    },
    outputViewport: viewports[0] as RiddleProofProfileViewport,
  };
}

function summarizeProfileRoute(profile: RiddleProofProfile) {
  return resolveRiddleProofProfileTargetUrl(profile);
}

function makeResultSummaryMarkdown(profile: RiddleProofProfile, result: RiddleProofProfileResult, artifactSummary: string) {
  return [
    `# ${result.profile_name}`,
    "",
    `- Profile: ${result.profile_name}`,
    `- Runner: ${result.runner}`,
    `- Status: ${result.status}`,
    `- Captured At: ${result.captured_at}`,
    `- Summary: ${result.summary}`,
    "",
    `- Target URL: ${summarizeProfileRoute(profile)}`,
    "",
    "## Artifacts",
    artifactSummary || "- no artifacts",
  ].join("\n");
}

function mergeArtifactPaths(
  profile: RiddleProofProfile,
  base: RiddleProofProfileResult,
  artifacts: LocalArtifactInfo[],
) {
  const refs = collectRiddleProfileArtifactRefs(artifacts);
  const firstPath = (name: string) => {
    const direct = artifacts.find((artifact) => artifact.name === name || artifact.path === name);
    return direct?.path || name;
  };
  const screenshotPaths = uniqueStrings(
    artifacts
      .filter((artifact) => artifact.kind === "screenshot")
      .map((artifact) => artifact.path),
  );
  const updatedArtifacts = {
    ...base.artifacts,
    screenshots: uniqueStrings([...(base.artifacts?.screenshots || []), ...screenshotPaths]),
    proof_json: firstPath("proof.json"),
    console: firstPath("console.json"),
    dom_summary: firstPath("dom-summary.json"),
    riddle_artifacts: refs,
  };
  return {
    ...base,
    profile_name: profile.name,
    artifacts: updatedArtifacts,
    route: base.route || {
      requested: summarizeProfileRoute(profile),
      observed: "",
      matched: false,
      error: "",
    },
    captured_at: base.captured_at || new Date().toISOString(),
    runner: LOCAL_RUNNER,
  };
}

function resolveResultFromScript(profile: RiddleProofProfile, value: unknown): RiddleProofProfileResult {
  const extracted = extractRiddleProofProfileResult(value);
  if (extracted) return extracted;
  return createRiddleProofProfileInsufficientResult({
    profile,
    runner: LOCAL_RUNNER,
    error: "Riddle profile script did not return proof result.",
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs?: number) {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`local runner timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function ensureFile(name: string, value: unknown, store: ReturnType<typeof createRiddleProofArtifactStore>) {
  if (store.findArtifact(name)) return;
  store.writeJson(name, value);
}

function writeOutputFiles(
  normalizedProfile: RiddleProofProfile,
  result: RiddleProofProfileResult,
  outputDir: string,
  source: RiddleProofSourceIdentity,
  previewReceipt: RiddlePreviewReceipt | undefined,
  store: ReturnType<typeof createRiddleProofArtifactStore>,
) {
  const safeResult = {
    ...result,
    artifacts: {
      ...result.artifacts,
      screenshots: uniqueStrings(result.artifacts?.screenshots || []),
      proof_json: result.artifacts.proof_json || "proof.json",
      console: result.artifacts.console || "console.json",
      dom_summary: result.artifacts.dom_summary || "dom-summary.json",
    },
  };
  const evidence = safeResult.evidence ?? null;
  const safeEvidence: {
    console?: unknown;
    dom_summary?: unknown;
  } = evidence && typeof evidence === "object" ? evidence : {};
  const consoleEvidence = typeof safeEvidence.console === "object" && safeEvidence.console !== null
    ? safeEvidence.console
    : { events: [], page_errors: [], dialogs: [] };
  const domSummaryEvidence = typeof safeEvidence.dom_summary === "object" && safeEvidence.dom_summary !== null
    ? safeEvidence.dom_summary
    : {};

  ensureFile("proof.json", safeResult, store);
  ensureFile("console.json", consoleEvidence, store);
  ensureFile("dom-summary.json", domSummaryEvidence, store);

  store.writeJson("proof.json", safeResult);
  store.writeJson("profile-result.json", safeResult);
  const artifactsBeforeSummary = store.listArtifacts();
  store.writeText("summary.md", makeResultSummaryMarkdown(
    normalizedProfile,
    safeResult,
    summarizeArtifactManifest(buildLocalRiddleProofArtifactManifest({
      profileName: normalizedProfile.name,
      runner: LOCAL_RUNNER,
      capturedAt: safeResult.captured_at,
      artifacts: artifactsBeforeSummary,
    })),
  ));
  const manifestInput = () => store.listArtifacts().filter((artifact) => artifact.path !== "artifact-manifest.json");
  store.writeJson("artifact-manifest.json", buildLocalRiddleProofArtifactManifest({
    profileName: normalizedProfile.name,
    runner: LOCAL_RUNNER,
    capturedAt: safeResult.captured_at,
    artifacts: manifestInput(),
  }));
  const observation = createRiddleProofObservationReceipt({
    comparison_role: "standalone",
    executor: { kind: "local_playwright", runner: LOCAL_RUNNER },
    target: previewReceipt
      ? { kind: "preview", url: summarizeProfileRoute(normalizedProfile), preview: previewReceipt }
      : { kind: "url", url: summarizeProfileRoute(normalizedProfile) },
    source,
    profile_result: safeResult,
    artifacts: store.listArtifacts().map((artifact) => ({
      name: artifact.name,
      path: artifact.path,
      kind: artifact.kind === "screenshot" ? "image" : artifact.kind,
      role: artifact.kind === "screenshot" ? "diagnostic" : "data",
    })),
    publication: { kind: "local", path: outputDir },
  });
  store.writeJson("observation-receipt.json", observation);
  const manifest = buildLocalRiddleProofArtifactManifest({
    profileName: normalizedProfile.name,
    runner: LOCAL_RUNNER,
    capturedAt: safeResult.captured_at,
    artifacts: manifestInput(),
  });
  store.writeJson("artifact-manifest.json", manifest);
  return {
    result: safeResult,
    manifestPath: path.join(outputDir, "artifact-manifest.json"),
    observationPath: path.join(outputDir, "observation-receipt.json"),
    observation,
    artifacts: store.listArtifacts(),
  };
}

export async function runProfileLocal(
  options: RunProfileLocalOptions,
): Promise<RunProfileLocalResult> {
  const scriptStart = Date.now();
  const baselineProfile = normalizeRiddleProofProfile(options.profile, {
    url: options.url,
    route: options.route,
  });
  const { profile, outputViewport } = filterProfileViewports(
    baselineProfile,
    normalizeViewportNames(options.viewportNames),
  );
  const targetUrl = summarizeProfileRoute(profile);
  const timeoutMs = resolveTimeoutMs(profile, { timeout: options.timeout });
  const outputDir = path.resolve(options.outputDir);
  const store = createRiddleProofArtifactStore(outputDir);
  const source = options.source
    || options.previewReceipt?.source
    || detectRiddlePreviewSource(options.sourceDirectory || process.cwd());
  let session: Session | undefined;

  const script = buildRiddleProofProfileScript(profile);
  const runnerFactory = Object.getPrototypeOf(async function () {}).constructor as {
    new (...args: string[]): (...params: unknown[]) => Promise<unknown>;
  };
  const runScript = new runnerFactory("page", "saveScreenshot", "saveJson", script);

  try {
    await loadPlaywright();
    session = await createPlaywrightBrowserSession({
      viewport: {
        width: outputViewport.width,
        height: outputViewport.height,
      },
      timeoutMs,
      browser: options.browser || "chromium",
      headless: options.headful !== true,
      launchArgs: [],
    });

    const saveScreenshot = async (label?: unknown, screenshotOptions?: { fullPage?: boolean }) => {
      const safeLabel = sanitizeLabel(typeof label === "string" ? label : undefined);
      const screenshot = await session!.page.screenshot({
        fullPage: screenshotOptions?.fullPage === true,
      });
      return store.writeScreenshot(safeLabel, () => Promise.resolve(screenshot));
    };
    const saveJson = async (name: unknown, value: unknown) => {
      const artifactName = typeof name === "string" && name.trim() ? name : "artifact";
      return store.writeJson(artifactName, value);
    };

    const scriptResult = await withTimeout(
      runScript(session!.page, saveScreenshot, saveJson) as Promise<unknown>,
      timeoutMs,
    );
    const normalized = resolveResultFromScript(profile, scriptResult);
    const withArtifacts = mergeArtifactPaths(profile, {
      ...normalized,
      runner: LOCAL_RUNNER,
      captured_at: normalized.captured_at || new Date().toISOString(),
      artifacts: {
        ...normalized.artifacts,
        screenshots: uniqueStrings(normalized.artifacts?.screenshots || []),
        proof_json: normalized.artifacts?.proof_json || "proof.json",
        console: normalized.artifacts?.console || "console.json",
        dom_summary: normalized.artifacts?.dom_summary || "dom-summary.json",
      },
      route: normalized.route || {
        requested: targetUrl,
        observed: "",
        matched: false,
        error: "",
      },
    }, store.listArtifacts());

    const persisted = writeOutputFiles(profile, withArtifacts, outputDir, source, options.previewReceipt, store);
    return {
      result: mergeArtifactPaths(profile, persisted.result, persisted.artifacts),
      outputDir,
      manifestPath: persisted.manifestPath,
      observationPath: persisted.observationPath,
      observation: persisted.observation,
    };
  } catch (error) {
    const durationMs = Date.now() - scriptStart;
    const normalizedError = error instanceof Error ? error.message : String(error);
    const fallback = createRiddleProofProfileEnvironmentBlockedResult({
      profile,
      runner: LOCAL_RUNNER,
      error: `${normalizedError} (${durationMs}ms)`,
      artifacts: collectRiddleProfileArtifactRefs(store.listArtifacts()),
    });
    const persisted = writeOutputFiles(
      profile,
      mergeArtifactPaths(profile, fallback, store.listArtifacts()),
      outputDir,
      source,
      options.previewReceipt,
      store,
    );
    return {
      result: mergeArtifactPaths(profile, persisted.result, persisted.artifacts),
      outputDir,
      manifestPath: persisted.manifestPath,
      observationPath: persisted.observationPath,
      observation: persisted.observation,
    };
  } finally {
    if (session?.context) await session.context.close().catch(() => {});
    if (session?.browser) await closePlaywrightSession(session);
  }
}
