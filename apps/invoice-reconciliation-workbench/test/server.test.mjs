import assert from "node:assert/strict";
import { rmSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";

import {
  createInvoiceReconciliationWorkbench,
} from "../dist/application.js";
import {
  startInvoiceWorkbenchServer,
} from "../dist/server.js";
import { startLocalInvoiceWorkbench } from "../dist/main.js";
import {
  fixtureRoot,
  freshWorkspace,
  keyPair,
  sequenceClock,
} from "./helpers.mjs";

test("the real shell is loopback-only, capability-bound, and accepts no correction fields", async (t) => {
  const workspace = freshWorkspace(t, "invoice-server-");
  const application = await createInvoiceReconciliationWorkbench({
    fixture_directory: fixtureRoot,
    workspace_directory: workspace,
    session_id: "session_server_001",
    signing_key: keyPair("server-test-key"),
    clock: sequenceClock([
      "2026-07-24T20:00:00.000Z",
      "2026-07-24T20:00:01.000Z",
      "2026-07-24T20:00:02.000Z",
      "2026-07-24T20:00:03.000Z",
    ]),
  });
  const running = await startInvoiceWorkbenchServer({ application });
  t.after(() => running.close());
  const launch = new URL(running.launch_url);
  const token = launch.searchParams.get("run");
  assert.match(token, /^[A-Za-z0-9_-]{43}$/u);
  const headers = {
    accept: "application/json",
    "x-riddle-invoice-run": token,
  };
  const origin = running.url.slice(0, -1);
  const postHeaders = {
    ...headers,
    "content-type": "application/json",
    origin,
  };

  const root = await fetch(running.launch_url);
  assert.equal(root.status, 200);
  assert.match(root.headers.get("content-security-policy"), /default-src 'self'/u);
  assert.equal(
    (await fetch(`${running.url}api/state`)).status,
    401,
  );
  assert.equal(
    (await fetch(`${running.url}api/state?unexpected=1`, { headers })).status,
    400,
  );
  assert.equal(
    (await fetch(`${running.url}api/check`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: "{}",
    })).status,
    403,
    "mutating requests require the exact same-origin Origin header",
  );
  assert.equal(
    (await fetch(`${running.url}api/check`, {
      method: "POST",
      headers: postHeaders,
      body: JSON.stringify({ policy: "caller-selected" }),
    })).status,
    400,
  );
  const failed = await fetch(`${running.url}api/check`, {
    method: "POST",
    headers: postHeaders,
    body: "{}",
  });
  assert.equal(failed.status, 200);
  assert.equal((await failed.json()).current_check.disposition, "does_not_conform");
  const corrected = await fetch(`${running.url}api/correct`, {
    method: "POST",
    headers: postHeaders,
    body: "{}",
  });
  assert.equal(corrected.status, 200);
  assert.equal((await corrected.json()).current_check, null);
  const conformed = await fetch(`${running.url}api/check`, {
    method: "POST",
    headers: postHeaders,
    body: "{}",
  });
  assert.equal(conformed.status, 200);
  assert.equal((await conformed.json()).current_check.disposition, "conforms");
  const audit = await fetch(
    `${running.url}api/audit?check_ref=invoicecheck_2`,
    { headers },
  );
  assert.equal(audit.status, 200);
  assert.equal((await audit.json()).replay.ok, true);

  await assert.rejects(
    startInvoiceWorkbenchServer({
      application,
      host: "0.0.0.0",
    }),
    /only to 127\.0\.0\.1/u,
  );
});

test("the default launcher creates a fresh private child workspace", async () => {
  const running = await startLocalInvoiceWorkbench();
  const parent = dirname(running.workspace_directory);
  try {
    assert.equal(basename(running.workspace_directory), "workbench");
    assert.equal(
      statSync(running.workspace_directory).mode & 0o777,
      0o700,
    );
    assert.equal(
      statSync(join(running.workspace_directory, "records")).mode & 0o777,
      0o700,
    );
    const response = await fetch(running.launch_url);
    assert.equal(response.status, 200);
  } finally {
    await running.close();
    rmSync(parent, { recursive: true, force: true });
  }
});
