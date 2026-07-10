import type {
  RiddleProofProfileArtifactRef,
  RiddleProofProfileResult,
} from "./profile";
import type { JsonValue } from "./types";

export const RIDDLE_PREVIEW_RECEIPT_VERSION = "riddle.preview-receipt.v1" as const;
export const RIDDLE_PROOF_OBSERVATION_RECEIPT_VERSION = "riddle-proof.observation-receipt.v1" as const;

export type RiddleProofComparisonRole = "before" | "after" | "standalone";

export interface RiddleProofSourceIdentity {
  git_revision?: string;
  repository?: string;
  dirty?: boolean;
  label?: string;
}

export interface RiddlePreviewReceipt {
  version: typeof RIDDLE_PREVIEW_RECEIPT_VERSION;
  preview_id: string;
  url: string;
  expires_at: string;
  content_digest: string;
  source: RiddleProofSourceIdentity;
  published_at: string;
}

export type RiddleProofObservationExecutorKind =
  | "local_playwright"
  | "riddle_hosted"
  | "browser_api"
  | "other";

export interface RiddleProofObservationExecutor {
  kind: RiddleProofObservationExecutorKind;
  runner?: string;
  job_id?: string;
  worker_id?: string;
}

export interface RiddleProofExecutionPhase {
  phase: string;
  at: string;
}

export interface RiddleProofExecutionTelemetry {
  enqueued_at?: string;
  wake_requested_at?: string;
  claimed_at?: string;
  browser_started_at?: string;
  artifacts_ready_at?: string;
  completed_at?: string;
  worker_id?: string;
  cold_start?: boolean;
  phases?: RiddleProofExecutionPhase[];
  metadata?: Record<string, JsonValue>;
}

export interface RiddleProofObservationTarget {
  kind: "url" | "preview";
  url: string;
  preview?: RiddlePreviewReceipt;
}

export type RiddleProofObservationArtifactRole =
  | "canonical_screenshot"
  | "setup_screenshot"
  | "data"
  | "diagnostic"
  | "artifact";

export interface RiddleProofObservationArtifact {
  name: string;
  role: RiddleProofObservationArtifactRole;
  url?: string;
  path?: string;
  kind?: string;
  content_type?: string;
  source?: string;
}

export interface RiddleProofObservationPublication {
  kind: "local" | "riddle_cdn" | "github" | "other";
  url?: string;
  path?: string;
}

export interface RiddleProofObservationReceipt {
  version: typeof RIDDLE_PROOF_OBSERVATION_RECEIPT_VERSION;
  observation_id: string;
  comparison_role: RiddleProofComparisonRole;
  executor: RiddleProofObservationExecutor;
  target: RiddleProofObservationTarget;
  source: RiddleProofSourceIdentity;
  captured_at: string;
  artifacts: RiddleProofObservationArtifact[];
  canonical_screenshot?: RiddleProofObservationArtifact;
  profile_summary?: {
    profile_name: string;
    status: string;
    summary: string;
    route?: JsonValue;
    checks: {
      total: number;
      passed: number;
      failed: number;
      skipped: number;
      needs_human_review: number;
    };
  };
  proof?: {
    profile_name: string;
    result: RiddleProofProfileResult;
  };
  publication?: RiddleProofObservationPublication;
  execution?: RiddleProofExecutionTelemetry;
  metadata?: Record<string, JsonValue>;
}

export interface CreateRiddleProofObservationReceiptInput {
  observation_id?: string;
  comparison_role: RiddleProofComparisonRole;
  executor: RiddleProofObservationExecutor;
  target: RiddleProofObservationTarget;
  source?: RiddleProofSourceIdentity;
  profile_result?: RiddleProofProfileResult;
  artifacts?: RiddleProofObservationArtifact[];
  canonical_screenshot?: RiddleProofObservationArtifact;
  publication?: RiddleProofObservationPublication;
  execution?: RiddleProofExecutionTelemetry;
  captured_at?: string;
  metadata?: Record<string, JsonValue>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string, context: string) {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${context}.${key} must be a non-empty string.`);
  }
  return value.trim();
}

function normalizedSourceIdentity(value: unknown): RiddleProofSourceIdentity {
  if (!isRecord(value)) return {};
  return {
    git_revision: typeof value.git_revision === "string" && value.git_revision.trim()
      ? value.git_revision.trim()
      : undefined,
    repository: typeof value.repository === "string" && value.repository.trim()
      ? value.repository.trim()
      : undefined,
    dirty: typeof value.dirty === "boolean" ? value.dirty : undefined,
    label: typeof value.label === "string" && value.label.trim() ? value.label.trim() : undefined,
  };
}

export function parseRiddlePreviewReceipt(value: unknown): RiddlePreviewReceipt {
  if (!isRecord(value)) throw new Error("Preview receipt must be an object.");
  if (value.version !== RIDDLE_PREVIEW_RECEIPT_VERSION) {
    throw new Error(`Unsupported Preview receipt version ${String(value.version || "missing")}.`);
  }
  if (!isRecord(value.source)) throw new Error("Preview receipt source must be an object.");
  const expiresAt = requiredString(value, "expires_at", "preview receipt");
  const publishedAt = requiredString(value, "published_at", "preview receipt");
  const contentDigest = requiredString(value, "content_digest", "preview receipt");
  if (!contentDigest.startsWith("sha256:") || contentDigest.length <= "sha256:".length) {
    throw new Error("preview receipt.content_digest must be a sha256 digest.");
  }
  if (!Number.isFinite(Date.parse(expiresAt)) || !Number.isFinite(Date.parse(publishedAt))) {
    throw new Error("Preview receipt timestamps must be valid ISO date strings.");
  }
  return {
    version: RIDDLE_PREVIEW_RECEIPT_VERSION,
    preview_id: requiredString(value, "preview_id", "preview receipt"),
    url: requiredString(value, "url", "preview receipt"),
    expires_at: expiresAt,
    content_digest: contentDigest,
    source: normalizedSourceIdentity(value.source),
    published_at: publishedAt,
  };
}

function comparableArtifactName(value: string | undefined) {
  return (value || "")
    .split(/[/?#]/)
    .pop()
    ?.toLowerCase()
    .replace(/\.(png|jpe?g|gif|webp|avif|svg)$/u, "")
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "";
}

function artifactMatchesLabel(artifact: RiddleProofObservationArtifact, label: string) {
  const expected = comparableArtifactName(label);
  if (!expected) return false;
  return [artifact.name, artifact.url, artifact.path]
    .map(comparableArtifactName)
    .some((name) => name === expected || name.endsWith(`-${expected}`));
}

function artifactLooksLikeScreenshot(ref: Pick<RiddleProofProfileArtifactRef, "name" | "url" | "path" | "kind" | "content_type">) {
  const text = [ref.name, ref.url, ref.path, ref.kind, ref.content_type].filter(Boolean).join(" ").toLowerCase();
  return /screenshot|\bimage\b/.test(text) || /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/.test(text);
}

function finalScreenshotLabels(result: RiddleProofProfileResult) {
  const explicit = result.artifacts.canonical_screenshots || [];
  if (explicit.length) return explicit;
  const fromEvidence = (result.evidence?.viewports || [])
    .map((viewport) => viewport.screenshot_label)
    .filter((label): label is string => typeof label === "string" && Boolean(label.trim()));
  if (fromEvidence.length) return fromEvidence;
  return (result.artifacts.screenshots || []).slice(0, 1);
}

function setupScreenshotLabels(result: RiddleProofProfileResult) {
  const explicit = result.artifacts.setup_screenshots || [];
  if (explicit.length) return explicit;
  return (result.evidence?.viewports || []).flatMap((viewport) =>
    (viewport.setup_action_results || [])
      .filter((action) => action.action === "screenshot" && action.ok !== false && typeof action.screenshot_label === "string")
      .map((action) => String(action.screenshot_label)),
  );
}

function observationArtifactFromRef(
  ref: RiddleProofProfileArtifactRef,
  canonicalLabels: string[],
  setupLabels: string[],
): RiddleProofObservationArtifact {
  const base: RiddleProofObservationArtifact = {
    name: ref.name,
    role: ref.role || "artifact",
    url: ref.url,
    path: ref.path,
    kind: ref.kind,
    content_type: ref.content_type,
    source: ref.source,
  };
  if (!artifactLooksLikeScreenshot(ref)) return base;
  if (canonicalLabels.some((label) => artifactMatchesLabel(base, label))) {
    return { ...base, role: "canonical_screenshot" };
  }
  if (setupLabels.some((label) => artifactMatchesLabel(base, label))) {
    return { ...base, role: "setup_screenshot" };
  }
  return { ...base, role: "diagnostic" };
}

function profileObservationArtifacts(result: RiddleProofProfileResult) {
  const canonicalLabels = finalScreenshotLabels(result);
  const setupLabels = setupScreenshotLabels(result);
  const artifacts: RiddleProofObservationArtifact[] = [];
  const seen = new Set<string>();
  const add = (artifact: RiddleProofObservationArtifact) => {
    const key = artifact.url || artifact.path || `${artifact.role}:${artifact.name}`;
    if (!artifact.name || seen.has(key)) return;
    seen.add(key);
    artifacts.push(artifact);
  };
  for (const ref of result.artifacts.riddle_artifacts || []) {
    add(observationArtifactFromRef(ref, canonicalLabels, setupLabels));
  }
  for (const label of canonicalLabels) {
    if (!artifacts.some((artifact) => artifactMatchesLabel(artifact, label))) {
      add({ name: label, path: label, role: "canonical_screenshot", kind: "image" });
    }
  }
  for (const label of setupLabels) {
    if (!artifacts.some((artifact) => artifactMatchesLabel(artifact, label))) {
      add({ name: label, path: label, role: "setup_screenshot", kind: "image" });
    }
  }
  for (const label of result.artifacts.screenshots || []) {
    if (!artifacts.some((artifact) => artifactMatchesLabel(artifact, label))) {
      add({ name: label, path: label, role: "diagnostic", kind: "image" });
    }
  }
  return artifacts;
}

function mergeObservationArtifacts(
  profileArtifacts: RiddleProofObservationArtifact[],
  suppliedArtifacts: RiddleProofObservationArtifact[],
) {
  const artifacts = [...profileArtifacts];
  for (const supplied of suppliedArtifacts) {
    const suppliedNames = [supplied.name, supplied.url, supplied.path]
      .map(comparableArtifactName)
      .filter(Boolean);
    const existingIndex = artifacts.findIndex((artifact) => {
      if (supplied.url && artifact.url === supplied.url) return true;
      if (supplied.path && artifact.path === supplied.path) return true;
      return [artifact.name, artifact.url, artifact.path]
        .map(comparableArtifactName)
        .some((name) => name && suppliedNames.includes(name));
    });
    if (existingIndex < 0) {
      artifacts.push(supplied);
      continue;
    }
    const existing = artifacts[existingIndex];
    const role = supplied.role === "canonical_screenshot" || supplied.role === "setup_screenshot"
      ? supplied.role
      : existing.role === "canonical_screenshot" || existing.role === "setup_screenshot"
        ? existing.role
        : supplied.role === "artifact" ? existing.role : supplied.role;
    artifacts[existingIndex] = {
      ...existing,
      ...supplied,
      role,
    };
  }
  return artifacts;
}

function defaultObservationId(role: RiddleProofComparisonRole, capturedAt: string) {
  return `obs_${role}_${capturedAt.replace(/[^0-9]/g, "").slice(0, 17) || "unknown"}`;
}

function profileCheckCounts(result: RiddleProofProfileResult) {
  const counts = { total: result.checks.length, passed: 0, failed: 0, skipped: 0, needs_human_review: 0 };
  for (const check of result.checks) {
    if (check.status === "passed") counts.passed += 1;
    if (check.status === "failed") counts.failed += 1;
    if (check.status === "skipped") counts.skipped += 1;
    if (check.status === "needs_human_review") counts.needs_human_review += 1;
  }
  return counts;
}

export function createRiddleProofObservationReceipt(
  input: CreateRiddleProofObservationReceiptInput,
): RiddleProofObservationReceipt {
  const capturedAt = input.captured_at || input.profile_result?.captured_at || new Date().toISOString();
  const profileArtifacts = input.profile_result ? profileObservationArtifacts(input.profile_result) : [];
  const requestedCanonical = input.canonical_screenshot
    ? { ...input.canonical_screenshot, role: "canonical_screenshot" as const }
    : undefined;
  const artifacts = mergeObservationArtifacts(
    profileArtifacts,
    [...(input.artifacts || []), ...(requestedCanonical ? [requestedCanonical] : [])],
  );
  const canonicalScreenshot = requestedCanonical
    ? artifacts.find((artifact) =>
      artifact.role === "canonical_screenshot" && artifactMatchesLabel(artifact, requestedCanonical.name)) || requestedCanonical
    : artifacts.find((artifact) => artifact.role === "canonical_screenshot");
  const target = input.target.kind === "preview" && input.target.preview
    ? { ...input.target, preview: parseRiddlePreviewReceipt(input.target.preview) }
    : input.target;
  return {
    version: RIDDLE_PROOF_OBSERVATION_RECEIPT_VERSION,
    observation_id: input.observation_id || defaultObservationId(input.comparison_role, capturedAt),
    comparison_role: input.comparison_role,
    executor: input.executor,
    target,
    source: normalizedSourceIdentity(input.source || input.target.preview?.source),
    captured_at: capturedAt,
    artifacts,
    canonical_screenshot: canonicalScreenshot,
    profile_summary: input.profile_result ? {
      profile_name: input.profile_result.profile_name,
      status: input.profile_result.status,
      summary: input.profile_result.summary,
      route: input.profile_result.route as unknown as JsonValue,
      checks: profileCheckCounts(input.profile_result),
    } : undefined,
    proof: input.profile_result ? {
      profile_name: input.profile_result.profile_name,
      result: input.profile_result,
    } : undefined,
    publication: input.publication,
    execution: input.execution,
    metadata: input.metadata,
  };
}

export function parseRiddleProofObservationReceipt(value: unknown): RiddleProofObservationReceipt {
  if (!isRecord(value)) throw new Error("Observation receipt must be an object.");
  if (value.version !== RIDDLE_PROOF_OBSERVATION_RECEIPT_VERSION) {
    throw new Error(`Unsupported Observation receipt version ${String(value.version || "missing")}.`);
  }
  if (!isRecord(value.executor)) throw new Error("Observation receipt executor must be an object.");
  if (!isRecord(value.target)) throw new Error("Observation receipt target must be an object.");
  if (!isRecord(value.source)) throw new Error("Observation receipt source must be an object.");
  requiredString(value, "observation_id", "observation receipt");
  requiredString(value, "captured_at", "observation receipt");
  const executorKind = requiredString(value.executor, "kind", "observation receipt executor");
  if (!("local_playwright,riddle_hosted,browser_api,other".split(",")).includes(executorKind)) {
    throw new Error(`Unsupported observation executor kind ${executorKind}.`);
  }
  if (value.executor.runner !== undefined) {
    requiredString(value.executor, "runner", "observation receipt executor");
  }
  const role = requiredString(value, "comparison_role", "observation receipt");
  if (!(["before", "after", "standalone"] as string[]).includes(role)) {
    throw new Error(`Unsupported observation comparison role ${role}.`);
  }
  const targetKind = requiredString(value.target, "kind", "observation receipt target");
  if (targetKind !== "url" && targetKind !== "preview") {
    throw new Error(`Unsupported observation target kind ${targetKind}.`);
  }
  requiredString(value.target, "url", "observation receipt target");
  if (targetKind === "preview") {
    if (value.target.preview === undefined) {
      throw new Error("Preview Observation target must include its Preview receipt.");
    }
    parseRiddlePreviewReceipt(value.target.preview);
  }
  if (!Array.isArray(value.artifacts)) throw new Error("Observation receipt artifacts must be an array.");
  const artifactRoles = new Set(["canonical_screenshot", "setup_screenshot", "data", "diagnostic", "artifact"]);
  const artifacts = value.artifacts.map((artifact, index) => {
    if (!isRecord(artifact)) throw new Error(`Observation receipt artifact ${index} must be an object.`);
    requiredString(artifact, "name", `observation receipt artifact ${index}`);
    const artifactRole = requiredString(artifact, "role", `observation receipt artifact ${index}`);
    if (!artifactRoles.has(artifactRole)) {
      throw new Error(`Unsupported observation artifact role ${artifactRole}.`);
    }
    return artifact as unknown as RiddleProofObservationArtifact;
  });
  if (value.canonical_screenshot !== undefined) {
    if (!isRecord(value.canonical_screenshot) || value.canonical_screenshot.role !== "canonical_screenshot") {
      throw new Error("Observation canonical_screenshot must have the canonical_screenshot role.");
    }
    const canonical = value.canonical_screenshot as unknown as RiddleProofObservationArtifact;
    const included = artifacts.some((artifact) =>
      artifact.role === "canonical_screenshot"
      && artifact.name === canonical.name
      && artifact.url === canonical.url
      && artifact.path === canonical.path);
    if (!included) {
      throw new Error("Observation canonical_screenshot must reference an artifact in the receipt.");
    }
  }
  return value as unknown as RiddleProofObservationReceipt;
}
