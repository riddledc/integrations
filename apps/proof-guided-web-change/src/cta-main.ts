import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  runProofGuidedWebChangeCli,
  type ProofGuidedWebChangeCliOptions,
} from "./cli.js";
import {
  createLocalCtaChangeApplication,
} from "./cta-local-runtime.js";

function defaultArtifactsDirectory(): string {
  const timestamp = new Date().toISOString()
    .replaceAll(":", "")
    .replaceAll(".", "");
  const suffix = randomUUID().slice(0, 8);
  return path.resolve(
    process.cwd(),
    ".riddle-proof",
    "proof-guided-cta-change",
    `${timestamp}-${suffix}`,
  );
}

export async function runLocalProofGuidedCtaChange(
  options: {
    args?: readonly string[];
    artifacts_directory?: string;
    stdout?: ProofGuidedWebChangeCliOptions["stdout"];
  } = {},
) {
  return runProofGuidedWebChangeCli({
    ...(options.args === undefined ? {} : { args: options.args }),
    ...(options.stdout === undefined ? {} : { stdout: options.stdout }),
    command_name: "proof-guided-cta-change",
    workbench_name: "Proof-guided CTA change",
    createApplication() {
      return createLocalCtaChangeApplication({
        artifacts_directory:
          options.artifacts_directory ?? defaultArtifactsDirectory(),
      });
    },
  });
}
