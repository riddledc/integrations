import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import { createRiddleProofSignedCaptureBundle } from "@riddledc/riddle-proof-core";

import type { LocalArtifactInfo } from "./artifacts/localArtifactStore";

type SignedCaptureInput = Parameters<typeof createRiddleProofSignedCaptureBundle>[0];
type SignedCaptureResult = ReturnType<typeof createRiddleProofSignedCaptureBundle>;
type SignedCaptureSuccess = Extract<SignedCaptureResult, { ok: true }>;

export type RiddleProofLocalGroundedCaptureOptions = {
  scope: SignedCaptureInput["scope"];
  nonce: SignedCaptureInput["nonce"];
  collector: SignedCaptureInput["collector"];
  verifier: SignedCaptureInput["verifier"];
  signingKey: SignedCaptureInput["signing_key"];
  capturePolicy?: NonNullable<SignedCaptureInput["sensor"]["metadata"]>;
};

export type RiddleProofLocalGroundedCaptureBundle = SignedCaptureSuccess["bundle"];

export type CreateLocalGroundedCaptureInput = {
  options: RiddleProofLocalGroundedCaptureOptions;
  outputDir: string;
  capturedAt: string;
  browserName: "chromium" | "firefox" | "webkit";
  browserVersion: string;
  userAgent: string;
  requestedUrl: string;
  observedUrl: string;
  source: {
    git_revision?: string;
    repository?: string;
    dirty?: boolean;
    label?: string;
  };
  artifacts: LocalArtifactInfo[];
};

const EXCLUDED_GROUNDED_CAPTURE_PATHS = new Set([
  "artifact-manifest.json",
  "observation-receipt.json",
  "grounded-capture-bundle.json",
]);

const DEFAULT_CAPTURE_POLICY = {
  artifact_bytes: "exact_persisted_bytes",
  dom: "structured_profile_evidence",
  network: "navigation_and_explicit_profile_checks",
  screenshots: "profile_requested",
  video: "not_captured",
  storage: "not_captured",
  legacy_receipts: "excluded_from_signed_artifacts",
} as const;

function mediaTypeForArtifact(artifact: LocalArtifactInfo) {
  const lower = artifact.path.toLowerCase();
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".txt") || artifact.kind === "text") return "text/plain";
  return "application/octet-stream";
}

function roleForArtifact(artifact: LocalArtifactInfo) {
  switch (artifact.path) {
    case "normalized-profile.json":
      return "profile_contract";
    case "profile-evidence.json":
      return "browser_observation";
    case "proof.json":
    case "profile-result.json":
      return "derived_result";
    case "console.json":
      return "browser_console";
    case "dom-summary.json":
      return "dom_summary";
    case "summary.md":
      return "human_summary";
    default:
      return artifact.kind === "screenshot" ? "screenshot" : "browser_artifact";
  }
}

function artifactFilePath(outputDir: string, artifact: LocalArtifactInfo) {
  const root = realpathSync(path.resolve(outputDir));
  const target = path.resolve(root, artifact.path);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Grounded capture artifact path escapes the output directory: ${artifact.path}`);
  }
  const targetStats = lstatSync(target);
  if (targetStats.isSymbolicLink() || !targetStats.isFile()) {
    throw new Error(`Grounded capture artifact must be a regular, non-symlink file: ${artifact.path}`);
  }
  const realTarget = realpathSync(target);
  const realRelative = path.relative(root, realTarget);
  if (!realRelative || realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
    throw new Error(`Grounded capture artifact real path escapes the output directory: ${artifact.path}`);
  }
  return realTarget;
}

function compareArtifactPaths(left: LocalArtifactInfo, right: LocalArtifactInfo) {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

function safeCreationError(result: SignedCaptureResult) {
  try {
    if (result && typeof result === "object" && "error" in result) {
      const error = result.error as { message?: unknown; code?: unknown };
      if (typeof error?.message === "string" && error.message.trim()) return error.message;
      if (typeof error?.code === "string" && error.code.trim()) return error.code;
    }
    return JSON.stringify(result);
  } catch {
    return "unknown signed capture bundle error";
  }
}

export function createLocalRiddleProofGroundedCapture(
  input: CreateLocalGroundedCaptureInput,
): RiddleProofLocalGroundedCaptureBundle {
  const artifactInputs = input.artifacts
    .filter((artifact) => !EXCLUDED_GROUNDED_CAPTURE_PATHS.has(artifact.path))
    .slice()
    .sort(compareArtifactPaths)
    .map((artifact) => ({
      artifact_id: artifact.path,
      role: roleForArtifact(artifact),
      media_type: mediaTypeForArtifact(artifact),
      bytes_base64: readFileSync(artifactFilePath(input.outputDir, artifact)).toString("base64"),
    }));
  if (artifactInputs.length === 0) {
    throw new Error("Could not create grounded capture bundle: no persisted capture artifacts were available");
  }

  const sourceMetadata = {
    ...(input.source.repository ? { repository: input.source.repository } : {}),
    ...(input.source.git_revision ? { git_revision: input.source.git_revision } : {}),
    ...(input.source.dirty !== undefined ? { dirty: input.source.dirty } : {}),
    ...(input.source.label ? { label: input.source.label } : {}),
  };
  const capturePolicy = input.options.capturePolicy || DEFAULT_CAPTURE_POLICY;
  const metadata = {
    user_agent: input.userAgent,
    requested_url: input.requestedUrl,
    observed_url: input.observedUrl,
    page_revision: input.source.git_revision || input.options.scope.revision,
    source: sourceMetadata,
    capture_policy: capturePolicy,
  } as NonNullable<SignedCaptureInput["sensor"]["metadata"]>;

  const created = createRiddleProofSignedCaptureBundle({
    scope: input.options.scope,
    nonce: input.options.nonce,
    captured_at: input.capturedAt,
    collector: input.options.collector,
    sensor: {
      kind: "browser",
      name: input.browserName,
      version: input.browserVersion,
      observed_target: input.options.scope.target,
      metadata,
    },
    verifier: input.options.verifier,
    artifacts: artifactInputs as SignedCaptureInput["artifacts"],
    signing_key: input.options.signingKey,
  });

  if (!created.ok) {
    throw new Error(`Could not create grounded capture bundle: ${safeCreationError(created)}`);
  }
  return created.bundle;
}
