import {
  startProofGuidedWebChangeShell,
  type ProofGuidedWebChangeShellApplication,
  type RunningProofGuidedWebChangeShell,
} from "./server.js";

export type ProofGuidedWebChangeCliOptions = {
  args?: readonly string[];
  createApplication(): (
    ProofGuidedWebChangeShellApplication
    | Promise<ProofGuidedWebChangeShellApplication>
  );
  stdout?: Pick<NodeJS.WriteStream, "write">;
};

type ParsedArguments = {
  help: boolean;
  port: number;
};

const HELP = `Usage: proof-guided-web-change [options]

Run the local proof-guided website-change workbench.

Options:
  --port <port>  Bind port (default: choose an available port)
  -h, --help     Show this help
`;

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
  const parsed = parseArgs(options.args ?? process.argv.slice(2));
  if (parsed.help) {
    stdout.write(HELP);
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
  stdout.write(`Proof-guided web change: ${running.launch_url}\n`);
  return running;
}
