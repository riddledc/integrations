import {
  startProofGuidedWebChangeShell,
  type ProofGuidedWebChangeShellApplication,
  type RunningProofGuidedWebChangeShell,
} from "./server.js";

export type ProofGuidedWebChangeCliOptions = {
  args?: readonly string[];
  command_name?: string;
  createApplication(): (
    ProofGuidedWebChangeShellApplication
    | Promise<ProofGuidedWebChangeShellApplication>
  );
  stdout?: Pick<NodeJS.WriteStream, "write">;
  workbench_name?: string;
};

type ParsedArguments = {
  help: boolean;
  port: number;
};

function displayLabel(
  value: string | undefined,
  fallback: string,
  context: string,
): string {
  const checked = value ?? fallback;
  if (
    typeof checked !== "string"
    || checked.trim().length === 0
    || checked.includes("\n")
    || checked.includes("\r")
  ) {
    throw new TypeError(
      `${context} must be a non-empty single-line string.`,
    );
  }
  return checked;
}

function nextValue(
  args: readonly string[],
  index: number,
  option: string,
): string {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new TypeError(`${option} requires a value.`);
  }
  return value;
}

function parseArgs(args: readonly string[]): ParsedArguments {
  let help = false;
  let port = 0;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case "-h":
      case "--help":
        help = true;
        break;
      case "--port": {
        const raw = nextValue(args, index, argument);
        if (!/^\d+$/u.test(raw)) {
          throw new TypeError("--port must be an integer.");
        }
        port = Number(raw);
        if (!Number.isInteger(port) || port < 0 || port > 65_535) {
          throw new TypeError("--port must be from 0 through 65535.");
        }
        index += 1;
        break;
      }
      default:
        throw new TypeError(`Unknown option: ${String(argument)}`);
    }
  }
  return { help, port };
}

/**
 * CLI boundary with application construction injected by the local client.
 *
 * Keeping construction injected prevents this shell from acquiring authority
 * to choose projects, candidates, proof profiles, or repairs.
 */
export async function runProofGuidedWebChangeCli(
  options: ProofGuidedWebChangeCliOptions,
): Promise<RunningProofGuidedWebChangeShell | null> {
  const stdout = options.stdout ?? process.stdout;
  const commandName = displayLabel(
    options.command_name,
    "proof-guided-web-change",
    "command_name",
  );
  const workbenchName = displayLabel(
    options.workbench_name,
    "Proof-guided web change",
    "workbench_name",
  );
  const parsed = parseArgs(options.args ?? process.argv.slice(2));
  if (parsed.help) {
    stdout.write(`Usage: ${commandName} [options]

Run the local proof-guided website-change workbench.

Options:
  --port <port>  Bind port (default: choose an available port)
  -h, --help     Show this help
`);
    return null;
  }
  const application = await options.createApplication();
  let running: RunningProofGuidedWebChangeShell;
  try {
    running = await startProofGuidedWebChangeShell({
      application,
      port: parsed.port,
    });
  } catch (error) {
    await application.close();
    throw error;
  }
  stdout.write(`${workbenchName}: ${running.launch_url}\n`);
  return running;
}
