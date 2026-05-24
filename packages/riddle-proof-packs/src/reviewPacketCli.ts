import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createHumanReviewPacketArtifacts } from "./humanReviewPacket";

const DEFAULT_JSON_NAME = "human-review-packet.json";
const DEFAULT_MARKDOWN_NAME = "human-review-packet.md";

const USAGE = `riddle-proof-review-packet --proof <path|-> [options]

Extract a human_review_packet from a Riddle Proof artifact and write a compact
JSON/Markdown handoff for listening or follow-up review.

Options:
  --proof <path|->       Riddle Proof proof.json/profile-result.json, or '-' for stdin.
  --output <dir>         Output directory. Defaults to the proof file directory.
  --json <path>          JSON output path. Defaults to <output>/human-review-packet.json.
  --markdown <path>      Markdown output path. Defaults to <output>/human-review-packet.md.
  --title <title>        Markdown title. Defaults to "Human Review Packet".
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
  stdout: boolean;
}

const readValue = (argv: string[], index: number, name: string) => {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
};

export function parseReviewPacketCliArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    help: false,
    proofPath: null,
    outputDir: null,
    jsonPath: null,
    markdownPath: null,
    title: null,
    stdout: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--proof") {
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

export function writeReviewPacketFiles({
  proofPath,
  outputDir,
  jsonPath,
  markdownPath,
  title,
}: {
  proofPath: string;
  outputDir: string | null;
  jsonPath: string | null;
  markdownPath: string | null;
  title: string | null;
}) {
  const proof = readProofArtifact(proofPath);
  const artifacts = createHumanReviewPacketArtifacts(proof, {
    title: title ?? undefined,
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
  const args = parseReviewPacketCliArgs(argv);
  if (args.help) {
    writeFileSync(1, USAGE);
    return;
  }
  if (!args.proofPath) throw new Error("--proof is required.");

  const result = writeReviewPacketFiles({
    proofPath: args.proofPath,
    outputDir: args.outputDir,
    jsonPath: args.jsonPath,
    markdownPath: args.markdownPath,
    title: args.title,
  });

  if (args.stdout) {
    writeFileSync(1, result.markdown);
  } else {
    writeFileSync(1, `${JSON.stringify({
      ok: true,
      json: result.jsonPath,
      markdown: result.markdownPath,
      status: result.packet.status ?? null,
      recommendation: result.packet.recommendation && typeof result.packet.recommendation === "object"
        ? (result.packet.recommendation as { candidate?: { label?: unknown } }).candidate?.label ?? null
        : null,
    }, null, 2)}\n`);
  }
}

main().catch((error) => {
  writeFileSync(2, `${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
