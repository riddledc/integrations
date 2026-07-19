import { execFileSync } from "node:child_process";

import type { RiddleProofSourceIdentity } from "@riddledc/riddle-proof-core/receipts";

function gitOutput(directory: string, args: string[]) {
  try {
    return execFileSync("git", ["-C", directory, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export function detectLocalRiddleProofSource(directory: string): RiddleProofSourceIdentity {
  const gitRevision = gitOutput(directory, ["rev-parse", "HEAD"]);
  if (!gitRevision) return {};
  const repository = gitOutput(directory, ["config", "--get", "remote.origin.url"]);
  const status = gitOutput(directory, ["status", "--porcelain", "--untracked-files=normal"]);
  return {
    git_revision: gitRevision,
    repository: repository || undefined,
    dirty: Boolean(status),
  };
}
