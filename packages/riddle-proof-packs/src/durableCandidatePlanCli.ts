import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createDurableCandidatePatchPlanArtifacts } from "./durableCandidatePlan";

const DEFAULT_JSON_NAME = "durable-candidate-patch-plan.json";
const DEFAULT_MARKDOWN_NAME = "durable-candidate-patch-plan.md";

const USAGE = `riddle-proof-durable-candidate-plan --proof <path|-> [options]

Validate an applied human_review_packet and write a durable candidate patch
plan. This is a handoff artifact, not proof of subjective quality.

Options:
  --proof <path|->       Riddle Proof proof.json/profile-result.json, packet JSON, or '-' for stdin.
  --output <dir>         Output directory. Defaults to the proof file directory.
  --json <path>          JSON output path. Defaults to <output>/durable-candidate-patch-plan.json.
  --markdown <path>      Markdown output path. Defaults to <output>/durable-candidate-patch-plan.md.
  --title <title>        Markdown title. Defaults to "Durable Candidate Patch Plan".
  --source-file <path>   Optional source file where the durable edit should be applied.
  --require-mix-profile  Require a mixProfileId before reporting ready_for_durable_patch.
  --stdout              Also print the Markdown handoff to stdout.
  --help                Show this help.
`;

interface ParsedArgs {
  help: boolean;
  proofPath: string | null;
  outputDir: string | null;
  jsonPath: string | null;
  markdownPath: string | null;
  title: string | null;
  sourceFile: string | null;
  requireMixProfileId: boolean;
  stdout: boolean;
}

const readValue = (argv: string[], index: number, name: string) => {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
};

export function parseDurableCandidatePlanCliArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    help: false,
    proofPath: null,
    outputDir: null,
    jsonPath: null,
    markdownPath: null,
    title: null,
    sourceFile: null,
    requireMixProfileId: false,
    stdout: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--proof" || arg === "--packet") {
      parsed.proofPath = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--output" || arg === "--output-dir") {
      parsed.outputDir = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--json") {
      parsed.jsonPath = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--markdown" || arg === "--md") {
      parsed.markdownPath = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--title") {
      parsed.title = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--source-file") {
      parsed.sourceFile = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--require-mix-profile") {
      parsed.requireMixProfileId = true;
      continue;
    }
    if (arg === "--stdout") {
      parsed.stdout = true;
      continue;
    }
    if (!arg.startsWith("--") && !parsed.proofPath) {
      parsed.proofPath = arg;
      continue;
    }
    throw new Error(`Unknown argument ${arg}.`);
  }

  return parsed;
}

const readProofArtifact = (proofPath: string) => {
  if (proofPath === "-") return JSON.parse(readFileSync(0, "utf8"));
  const absoluteProofPath = path.resolve(proofPath);
  if (!existsSync(absoluteProofPath)) {
    throw new Error(`Proof artifact not found: ${absoluteProofPath}`);
  }
  return JSON.parse(readFileSync(absoluteProofPath, "utf8"));
};

const outputDirFor = (proofPath: string, outputDir: string | null) => {
  if (outputDir) return path.resolve(outputDir);
  if (proofPath === "-") return process.cwd();
  return path.dirname(path.resolve(proofPath));
};

export function writeDurableCandidatePlanFiles({
  proofPath,
  outputDir,
  jsonPath,
  markdownPath,
  title,
  sourceFile,
  requireMixProfileId,
}: {
  proofPath: string;
  outputDir: string | null;
  jsonPath: string | null;
  markdownPath: string | null;
  title: string | null;
  sourceFile: string | null;
  requireMixProfileId: boolean;
}) {
  const proof = readProofArtifact(proofPath);
  const artifacts = createDurableCandidatePatchPlanArtifacts(proof, {
    title: title ?? undefined,
    sourceFile: sourceFile ?? undefined,
    requireMixProfileId,
  });
  const resolvedOutputDir = outputDirFor(proofPath, outputDir);
  const resolvedJsonPath = path.resolve(jsonPath ?? path.join(resolvedOutputDir, DEFAULT_JSON_NAME));
  const resolvedMarkdownPath = path.resolve(markdownPath ?? path.join(resolvedOutputDir, DEFAULT_MARKDOWN_NAME));

  mkdirSync(path.dirname(resolvedJsonPath), { recursive: true });
  mkdirSync(path.dirname(resolvedMarkdownPath), { recursive: true });
  writeFileSync(resolvedJsonPath, artifacts.json);
  writeFileSync(resolvedMarkdownPath, artifacts.markdown);

  return {
    ...artifacts,
    jsonPath: resolvedJsonPath,
    markdownPath: resolvedMarkdownPath,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseDurableCandidatePlanCliArgs(argv);
  if (args.help) {
    writeFileSync(1, USAGE);
    return;
  }
  if (!args.proofPath) throw new Error("--proof is required.");

  const result = writeDurableCandidatePlanFiles({
    proofPath: args.proofPath,
    outputDir: args.outputDir,
    jsonPath: args.jsonPath,
    markdownPath: args.markdownPath,
    title: args.title,
    sourceFile: args.sourceFile,
    requireMixProfileId: args.requireMixProfileId,
  });

  if (args.stdout) {
    writeFileSync(1, result.markdown);
  } else {
    writeFileSync(1, `${JSON.stringify({
      ok: result.plan.ok,
      status: result.plan.status,
      json: result.jsonPath,
      markdown: result.markdownPath,
      sourceFile: result.plan.durableEdit?.sourceFile ?? null,
      errors: result.plan.errors,
    }, null, 2)}\n`);
  }
  if (!result.plan.ok) process.exitCode = 2;
}

main().catch((error) => {
  writeFileSync(2, `${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
