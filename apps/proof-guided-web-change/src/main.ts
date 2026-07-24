import {
  randomUUID,
} from "node:crypto";
import path from "node:path";

import {
  runProofGuidedWebChangeCli,
  type ProofGuidedWebChangeCliOptions,
} from "./cli.js";
import {
  createLocalDurableSettingApplication,
} from "./local-runtime.js";

function defaultArtifactsDirectory(): string {
  const timestamp = new Date().toISOString()
    .replaceAll(":", "")
    .replaceAll(".", "");
  const suffix = randomUUID().slice(0, 8);
  return path.resolve(
    process.cwd(),
    ".riddle-proof",
    "proof-guided-web-change",
    `${timestamp}-${suffix}`,
  );
}

export async function runLocalProofGuidedWebChange(
  options: {
    args?: readonly string[];
    artifacts_directory?: string;
    stdout?: ProofGuidedWebChangeCliOptions["stdout"];
  } = {},
) {
  return runProofGuidedWebChangeCli({
    ...(options.args === undefined ? {} : { args: options.args }),
    ...(options.stdout === undefined ? {} : { stdout: options.stdout }),
    createApplication() {
      return createLocalDurableSettingApplication({
        artifacts_directory:
          options.artifacts_directory ?? defaultArtifactsDirectory(),
      });
    },
  });
}
