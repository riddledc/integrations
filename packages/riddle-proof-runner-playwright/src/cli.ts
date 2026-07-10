import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { runProfileLocal, type RunProfileLocalOptions } from "./runProfileLocal";
import {
  normalizeRiddleProofProfile,
  parseRiddlePreviewReceipt,
  profileStatusExitCode,
  type RiddlePreviewReceipt,
  type RiddleProofSourceIdentity,
} from "@riddledc/riddle-proof";

const USAGE = `riddle-proof-playwright run-profile --profile <path|json|-> [options]

Options:
  --profile <path|json|->    profile JSON, file path, or '-' for stdin.
  --url <url>                override profile target.url.
  --route <path>             override profile target.route.
  --viewport-name <name>     comma-separated list of viewport names.
  --timeout <seconds>        profile timeout in seconds.
  --output <dir>             write outputs under this directory.
  --output-dir <dir>         alias for --output.
  --preview-receipt <value>  Preview receipt JSON, file path, or '-' for stdin.
  --source-revision <sha>    override the observed source Git revision.
  --source-repository <url>  override the observed source repository.
  --source-dirty <boolean>   override whether the observed source is dirty.
  --browser <name>           chromium|firefox|webkit (default: chromium).
  --headful                  run browser with UI.
  --always-zero              collect evidence without a failing process exit.
  --help                     show usage.
`;

type ParsedArgs = {
  command: string;
  profile: unknown;
  outputDir: string;
  url?: string;
  route?: string;
  viewportNames: string[];
  timeout?: number;
  headful: boolean;
  alwaysZero: boolean;
  browser?: "chromium" | "firefox" | "webkit";
  previewReceipt?: RiddlePreviewReceipt;
  source: RiddleProofSourceIdentity;
};

function parseProfileInput(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "-") {
    return JSON.parse(readFileSync(0, "utf8"));
  }
  if (existsSync(trimmed)) {
    return JSON.parse(readFileSync(trimmed, "utf8"));
  }
  return JSON.parse(trimmed);
}

function parseArgs(argv: string[]): ParsedArgs {
  let command = "run-profile";
  if (argv.length && !argv[0].startsWith("--")) {
    command = argv[0];
  }
  const raw = argv.slice(command && argv[0] && argv[0].startsWith("--") ? 0 : 1);
  const parsed: ParsedArgs = {
    command,
    profile: undefined,
    outputDir: "artifacts/riddle-proof-runner-playwright",
    viewportNames: [],
    headful: false,
    alwaysZero: false,
    source: {},
  };

  for (let index = 0; index < raw.length; index += 1) {
    const arg = raw[index];
    if (arg === "--help" || arg === "-h") {
      writeFileSync(1, USAGE);
      process.exit(0);
    }
    if (arg === "--profile") {
      const value = raw[index + 1];
      if (!value) throw new Error("--profile requires a value.");
      parsed.profile = parseProfileInput(value);
      index += 1;
      continue;
    }
    if (arg === "--url") {
      const value = raw[index + 1];
      if (!value) throw new Error("--url requires a value.");
      parsed.url = value;
      index += 1;
      continue;
    }
    if (arg === "--route") {
      const value = raw[index + 1];
      if (!value) throw new Error("--route requires a value.");
      parsed.route = value;
      index += 1;
      continue;
    }
    if (arg === "--viewport-name" || arg === "--viewport") {
      const value = raw[index + 1];
      if (!value) throw new Error("--viewport-name requires a value.");
      parsed.viewportNames = value.split(",").map((entry) => entry.trim()).filter(Boolean);
      index += 1;
      continue;
    }
    if (arg === "--timeout") {
      const value = Number(raw[index + 1]);
      if (!Number.isFinite(value)) throw new Error("--timeout requires a number.");
      parsed.timeout = value;
      index += 1;
      continue;
    }
    if (arg === "--output" || arg === "--output-dir") {
      const value = raw[index + 1];
      if (!value) throw new Error("--output requires a directory value.");
      parsed.outputDir = value;
      index += 1;
      continue;
    }
    if (arg === "--preview-receipt") {
      const value = raw[index + 1];
      if (!value) throw new Error("--preview-receipt requires a value.");
      parsed.previewReceipt = parseRiddlePreviewReceipt(parseProfileInput(value));
      index += 1;
      continue;
    }
    if (arg === "--source-revision") {
      const value = raw[index + 1];
      if (!value) throw new Error("--source-revision requires a value.");
      parsed.source.git_revision = value;
      index += 1;
      continue;
    }
    if (arg === "--source-repository") {
      const value = raw[index + 1];
      if (!value) throw new Error("--source-repository requires a value.");
      parsed.source.repository = value;
      index += 1;
      continue;
    }
    if (arg === "--source-dirty") {
      const value = raw[index + 1];
      if (value !== "true" && value !== "false") {
        throw new Error("--source-dirty requires true or false.");
      }
      parsed.source.dirty = value === "true";
      index += 1;
      continue;
    }
    if (arg === "--browser") {
      const value = raw[index + 1];
      if (!value) throw new Error("--browser requires a value.");
      if (value !== "chromium" && value !== "firefox" && value !== "webkit") {
        throw new Error(`Unsupported browser ${value}.`);
      }
      parsed.browser = value;
      index += 1;
      continue;
    }
    if (arg === "--headful") {
      parsed.headful = true;
      continue;
    }
    if (arg === "--always-zero") {
      parsed.alwaysZero = true;
      continue;
    }
    throw new Error(`Unknown argument ${arg}.`);
  }

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.profile === undefined) {
    throw new Error("--profile is required.");
  }
  if (args.command !== "run-profile" && !args.command.startsWith("-")) {
    throw new Error(`Unknown command ${args.command}. Supported: run-profile`);
  }
  const input: RunProfileLocalOptions = {
    profile: args.profile,
    outputDir: args.outputDir,
    url: args.url,
    route: args.route,
    viewportNames: args.viewportNames,
    timeout: args.timeout,
    headful: args.headful,
    browser: args.browser,
    previewReceipt: args.previewReceipt,
    source: Object.keys(args.source).length
      ? { ...args.previewReceipt?.source, ...args.source }
      : undefined,
  };
  const result = await runProfileLocal(input);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!args.alwaysZero) {
    const profile = normalizeRiddleProofProfile(args.profile, { url: args.url, route: args.route });
    process.exitCode = profileStatusExitCode(profile, result.result.status);
  }
}

main().catch((error) => {
  writeFileSync(2, `${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
