import type { LocalArtifactInfo } from "./localArtifactStore";

export type LocalArtifactManifestVersion = "riddle-proof-local-runner-manifest.v1";

export interface LocalRiddleProofArtifactManifest {
  version: LocalArtifactManifestVersion;
  runner: string;
  profile_name: string;
  captured_at: string;
  artifacts: LocalArtifactInfo[];
}

export function buildLocalRiddleProofArtifactManifest(input: {
  profileName: string;
  runner: string;
  capturedAt: string;
  artifacts: LocalArtifactInfo[];
}): LocalRiddleProofArtifactManifest {
  return {
    version: "riddle-proof-local-runner-manifest.v1",
    runner: input.runner,
    profile_name: input.profileName,
    captured_at: input.capturedAt,
    artifacts: input.artifacts,
  };
}

export function summarizeArtifactManifest(manifest: LocalRiddleProofArtifactManifest) {
  return manifest.artifacts
    .map((artifact) => `- ${artifact.path} (${artifact.bytes} bytes)`)
    .join("\n");
}
