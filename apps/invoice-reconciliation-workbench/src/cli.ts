import { resolve } from "node:path";

import { startLocalInvoiceWorkbench } from "./main.js";

function usage(): string {
  return [
    "Usage: riddle-invoice-workbench [--workspace <directory>] [--port <port>]",
    "",
    "Starts the private, offline synthetic invoice reconciliation workbench.",
  ].join("\n");
}

function parseArgs(args: readonly string[]) {
  let workspace: string | undefined;
  let port: number | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      return { help: true as const };
    }
    if (argument === "--workspace") {
      const value = args[index + 1];
      if (!value) throw new TypeError("--workspace requires a directory.");
      workspace = resolve(value);
      index += 1;
      continue;
    }
    if (argument === "--port") {
      const value = args[index + 1];
      if (!value || !/^(0|[1-9][0-9]{0,4})$/u.test(value)) {
        throw new TypeError("--port requires an integer from 0 through 65535.");
      }
      port = Number(value);
      if (port > 65_535) {
        throw new TypeError("--port requires an integer from 0 through 65535.");
      }
      index += 1;
      continue;
    }
    throw new TypeError(`Unknown argument: ${argument}`);
  }
  return { help: false as const, workspace, port };
}

export async function runInvoiceWorkbenchCli(
  args: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const parsed = parseArgs(args);
  if (parsed.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const running = await startLocalInvoiceWorkbench({
    workspace_directory: parsed.workspace,
    port: parsed.port,
  });
  process.stdout.write(
    [
      `Invoice workbench: ${running.launch_url}`,
      `Private workspace: ${running.workspace_directory}`,
      "Press Ctrl-C to stop. The workspace is retained until you remove it.",
      "",
    ].join("\n"),
  );
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await running.close();
  };
  process.once("SIGINT", () => {
    void close().finally(() => {
      process.exitCode = 0;
    });
  });
  process.once("SIGTERM", () => {
    void close().finally(() => {
      process.exitCode = 0;
    });
  });
}

if (process.argv[1] && import.meta.url === new URL(
  `file://${process.argv[1]}`,
).href) {
  runInvoiceWorkbenchCli().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Invoice workbench failed."}\n`,
    );
    process.exitCode = 1;
  });
}
