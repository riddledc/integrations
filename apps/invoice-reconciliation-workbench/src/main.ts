import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createInvoiceReconciliationWorkbench,
} from "./application.js";
import {
  startInvoiceWorkbenchServer,
} from "./server.js";

export interface StartLocalInvoiceWorkbenchInput {
  workspace_directory?: string;
  fixture_directory?: string;
  port?: number;
}

function defaultFixtureDirectory(): string {
  const sourceAdjacent = fileURLToPath(
    new URL("../fixtures/over-invoiced/", import.meta.url),
  );
  const compiledFallback = fileURLToPath(
    new URL("../../fixtures/over-invoiced/", import.meta.url),
  );
  return resolve(sourceAdjacent.includes("/dist/")
    ? compiledFallback
    : sourceAdjacent);
}

export async function startLocalInvoiceWorkbench(
  input: StartLocalInvoiceWorkbenchInput = {},
) {
  const workspace = input.workspace_directory
    ? resolve(input.workspace_directory)
    : join(
        await mkdtemp(join(tmpdir(), "riddle-invoice-workbench-run-")),
        "workbench",
      );
  const application = await createInvoiceReconciliationWorkbench({
    fixture_directory: resolve(
      input.fixture_directory ?? defaultFixtureDirectory(),
    ),
    workspace_directory: workspace,
  });
  const server = await startInvoiceWorkbenchServer({
    application,
    port: input.port,
  });
  return {
    ...server,
    workspace_directory: workspace,
  };
}
