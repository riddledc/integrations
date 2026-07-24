import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { test } from "node:test";

import {
  startProofGuidedWebChangeShell,
} from "../dist/server.js";
import {
  runProofGuidedWebChangeCli,
} from "../dist/cli.js";
import {
  ordinaryView,
  repairIsAvailable,
} from "../public/view-model.js";

async function createTestBrowserSession() {
  const { createPlaywrightBrowserSession } = await import(new URL(
    "../../../packages/riddle-proof-runner-playwright/dist/browser.js",
    import.meta.url,
  ));
  return createPlaywrightBrowserSession({
    browser: "chromium",
    headless: true,
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function snapshot(disposition = null, repairAvailable = false) {
  const currentCheck = disposition === null
    ? null
    : {
        check_ref: `check:${disposition}`,
        disposition,
        current: disposition !== "stale",
        headline: {
          conforms: "This candidate matches the requested change.",
          does_not_conform: "This candidate is not yet in spec.",
          stale: "The last check is out of date.",
          could_not_check: "This candidate could not be checked.",
        }[disposition],
        next_action: "Use the narrow next action.",
        findings: disposition === "does_not_conform"
          ? [{
              requirement_id: "transition_survived_reload",
              label: "The changed state survives reload",
              explanation: "The changed state did not survive reload.",
              repair_guidance: "Persist the state, then check again.",
            }]
          : [],
        non_conclusions: [
          "This check covers only the installed browser profiles.",
        ],
      };
  const retryAvailable =
    disposition === "stale" || disposition === "could_not_check";
  return {
    task: {
      title: "Make the saved value durable",
      description:
        "Check and repair one installed website-change requirement.",
      requirements: [
        "The requested value appears immediately.",
        "The value survives reload.",
        "The value appears in a fresh browser.",
      ],
    },
    candidate: {
      candidate_ref: "candidate:transient",
      label: "Local settings preview",
      revision: "fixture-r1",
      attempt: "Attempt 1",
      preview_url: "http://127.0.0.1:43117/",
    },
    current_check: currentCheck,
    repair: {
      available: repairAvailable,
      label: "Apply durable persistence repair",
      reason: "The saved value currently exists only in the live page.",
      last: null,
    },
    retry: {
      available: retryAvailable,
      label: "Prepare fresh attempt",
      reason: retryAvailable
        ? "Prepare a fresh attempt from the unchanged source."
        : "",
      last: null,
    },
    last_activity: null,
    can_check: currentCheck === null,
    can_repair:
      currentCheck?.disposition === "does_not_conform"
      && repairAvailable,
    can_retry: retryAvailable,
    history: currentCheck === null
      ? []
      : [{
          check_ref: currentCheck.check_ref,
          candidate_ref: "candidate:transient",
          revision: "fixture-r1",
          attempt: "Attempt 1",
          disposition: currentCheck.disposition,
          current: currentCheck.current,
          headline: currentCheck.headline,
          checked_at: "2026-07-24T12:00:00.000Z",
        }],
  };
}

function fakeApplication(initialSnapshot = snapshot()) {
  let state = initialSnapshot;
  const calls = {
    audit: [],
    check: 0,
    close: 0,
    repair: 0,
    retry: 0,
    snapshot: 0,
  };
  return {
    calls,
    setSnapshot(next) {
      state = next;
    },
    application: {
      snapshot() {
        calls.snapshot += 1;
        return state;
      },
      checkCurrent() {
        calls.check += 1;
        state = state.candidate.revision === "fixture-r2"
          ? {
              ...snapshot("conforms", false),
          candidate: state.candidate,
              history: [
                ...state.history,
                ...snapshot("conforms", false).history.map((entry) => ({
                  ...entry,
                  candidate_ref: state.candidate.candidate_ref,
                  revision: state.candidate.revision,
                  attempt: state.candidate.attempt,
                })),
              ],
            }
          : snapshot("does_not_conform", true);
      },
      applyRepair() {
        calls.repair += 1;
        const previousHistory = state.history;
        state = {
          ...snapshot(null, false),
          candidate: {
            candidate_ref: "candidate:durable",
            label: "Local settings preview",
            revision: "fixture-r2",
            attempt: "Attempt 2",
            preview_url: "http://127.0.0.1:43118/",
          },
          repair: {
            available: false,
            label: "Apply durable persistence repair",
            reason: "",
            last: {
              repair_ref: "repair:1",
              from_candidate_ref: "candidate:transient",
              to_candidate_ref: "candidate:durable",
              summary: "Prepared server-backed persistence.",
            },
          },
          last_activity: {
            kind: "repair",
            summary: "Prepared server-backed persistence.",
            revision: "fixture-r2",
            attempt: "Attempt 2",
          },
          history: previousHistory,
        };
      },
      prepareFreshAttempt() {
        calls.retry += 1;
        const previous = state;
        state = {
          ...snapshot(null, false),
          candidate: {
            ...previous.candidate,
            candidate_ref: "candidate:fresh",
            attempt: "Attempt 2",
            preview_url: "http://127.0.0.1:43119/",
          },
          retry: {
            available: false,
            label: "Prepare fresh attempt",
            reason: "",
            last: {
              attempt_ref: "fresh_attempt_1",
              from_candidate_ref: previous.candidate.candidate_ref,
              to_candidate_ref: "candidate:fresh",
              revision: previous.candidate.revision,
              attempt: "Attempt 2",
              summary:
                "Prepared a fresh proof attempt from the unchanged source.",
            },
          },
          last_activity: {
            kind: "fresh_attempt",
            summary:
              "Prepared a fresh proof attempt from the unchanged source.",
            revision: previous.candidate.revision,
            attempt: "Attempt 2",
          },
          history: previous.history,
        };
      },
      audit(checkRef) {
        calls.audit.push(checkRef);
        return {
          check_ref: checkRef,
          contract: { digest: `sha256:${"a".repeat(64)}` },
          proof_id: "certificate-root",
        };
      },
      close() {
        calls.close += 1;
      },
    },
  };
}

async function runningFor(fake) {
  return startProofGuidedWebChangeShell({
    application: fake.application,
    publicDirectory: new URL("../public/", import.meta.url).pathname,
  });
}

function runCapabilityHeaders(running) {
  const launch = new URL(running.launch_url);
  const runToken = launch.searchParams.get("run");
  assert.match(runToken ?? "", /^[A-Za-z0-9_-]{43}$/u);
  return {
    "x-riddle-web-change-run": runToken,
  };
}

function sameOriginPost(
  running,
  body = "{}",
  additionalHeaders = {},
) {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: new URL(running.url).origin,
      ...runCapabilityHeaders(running),
      ...additionalHeaders,
    },
    body,
  };
}

function rawRequest(url, options = {}) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: options.method ?? "GET",
      headers: options.headers ?? {},
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        resolve({
          status: response.statusCode,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    request.on("error", reject);
    if (options.body !== undefined) request.write(options.body);
    request.end();
  });
}

test("the static shell is accessible and keeps proof plumbing out of ordinary copy", async () => {
  const fake = fakeApplication();
  const running = await runningFor(fake);
  try {
    const unauthenticated = await fetch(running.url);
    assert.equal(unauthenticated.status, 200);
    const bootstrap = await fetch(running.launch_url, {
      redirect: "manual",
    });
    assert.equal(bootstrap.status, 200);
    assert.equal(
      bootstrap.headers.get("set-cookie"),
      null,
      "the run capability must not enter a host-scoped loopback cookie",
    );
    const unauthenticatedApi = await fetch(`${running.url}api/snapshot`);
    assert.equal(unauthenticatedApi.status, 401);
    const cookieOnlyApi = await fetch(`${running.url}api/snapshot`, {
      headers: {
        cookie: `riddle_web_change_run=${
          runCapabilityHeaders(running)["x-riddle-web-change-run"]
        }`,
      },
    });
    assert.equal(
      cookieOnlyApi.status,
      401,
      "a host-scoped loopback cookie must not confer run authority",
    );
    const response = await fetch(running.url, {
      headers: runCapabilityHeaders(running),
    });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<main id="main"/u);
    assert.match(html, /role="status"/u);
    assert.match(html, /aria-live="polite"/u);
    assert.match(html, /Check current candidate/u);
    assert.match(html, /Apply repair/u);
    assert.match(html, /Audit details/u);
    assert.match(html, /title="Live preview of the current candidate"/u);
    assert.doesNotMatch(
      html,
      /\b(?:sha256|nonce|signature|certificate|proof DAG)\b/iu,
    );
    assert.match(
      response.headers.get("content-security-policy") ?? "",
      /frame-src http:\/\/127\.0\.0\.1:\*/u,
    );
  } finally {
    await running.close();
  }
  assert.equal(fake.calls.close, 1);
});

test("ordinary view drops audit fields and exposes repair only for a nonconforming check", () => {
  const source = {
    ...snapshot("does_not_conform", true),
    contract_digest: `sha256:${"b".repeat(64)}`,
    nonce: "caller-should-not-see-this",
    signature: "caller-should-not-see-this",
    certificate: "caller-should-not-see-this",
  };
  const ordinary = ordinaryView(source);
  assert.equal(repairIsAvailable(source), true);
  assert.equal(
    JSON.stringify(ordinary).includes("sha256:"),
    false,
  );
  assert.equal(JSON.stringify(ordinary).includes("nonce"), false);
  assert.equal(JSON.stringify(ordinary).includes("signature"), false);
  assert.equal(JSON.stringify(ordinary).includes("certificate"), false);

  for (const disposition of [
    "conforms",
    "stale",
    "could_not_check",
  ]) {
    assert.equal(
      repairIsAvailable(snapshot(disposition, true)),
      false,
      `${disposition} never exposes repair`,
    );
  }
});

test("check and repair endpoints accept no caller-selected authority", async () => {
  const fake = fakeApplication();
  const running = await runningFor(fake);
  try {
    const missingOrigin = await fetch(`${running.url}api/check`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...runCapabilityHeaders(running),
      },
      body: "{}",
    });
    assert.equal(missingOrigin.status, 403);
    assert.equal(fake.calls.check, 0);

    const crossOrigin = await fetch(`${running.url}api/check`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...runCapabilityHeaders(running),
        origin: "https://caller.invalid",
      },
      body: "{}",
    });
    assert.equal(crossOrigin.status, 403);
    assert.equal(fake.calls.check, 0);

    const rejected = await fetch(`${running.url}api/check`, {
      ...sameOriginPost(
        running,
        JSON.stringify({ target: "https://caller.invalid/" }),
      ),
    });
    assert.equal(rejected.status, 400);
    assert.equal(fake.calls.check, 0);

    const checked = await fetch(
      `${running.url}api/check`,
      sameOriginPost(running),
    );
    assert.equal(checked.status, 200);
    assert.equal(fake.calls.check, 1);
    assert.equal((await checked.json()).current_check.disposition, "does_not_conform");

    const repeatedCheck = await fetch(
      `${running.url}api/check`,
      sameOriginPost(running),
    );
    assert.equal(repeatedCheck.status, 409);
    assert.equal(
      (await repeatedCheck.json()).error.code,
      "check_unavailable",
    );
    assert.equal(fake.calls.check, 1);

    const repaired = await fetch(
      `${running.url}api/repair`,
      sameOriginPost(running),
    );
    assert.equal(repaired.status, 200);
    assert.equal(fake.calls.repair, 1);
    const repairedState = await repaired.json();
    assert.equal(repairedState.current_check, null);
    assert.equal(repairedState.candidate.revision, "fixture-r2");

    const rechecked = await fetch(
      `${running.url}api/check`,
      sameOriginPost(running),
    );
    assert.equal(rechecked.status, 200);
    assert.equal(
      (await rechecked.json()).current_check.disposition,
      "conforms",
    );
  } finally {
    await running.close();
  }
});

test("the shell rejects a rebound Host even when Origin matches it", async () => {
  const fake = fakeApplication();
  const running = await runningFor(fake);
  try {
    const response = await rawRequest(`${running.url}api/check`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "attacker.invalid",
        origin: "http://attacker.invalid",
      },
      body: "{}",
    });
    assert.equal(response.status, 403);
    assert.equal(fake.calls.check, 0);

    const staticResponse = await rawRequest(running.url, {
      headers: { host: "attacker.invalid" },
    });
    assert.equal(staticResponse.status, 403);
  } finally {
    await running.close();
  }
});

test("server refuses repair unless a nonconforming result explicitly enables it", async () => {
  for (const [disposition, repairAvailable] of [
    [null, true],
    ["conforms", true],
    ["stale", true],
    ["could_not_check", true],
    ["does_not_conform", false],
  ]) {
    const fake = fakeApplication(
      snapshot(disposition, repairAvailable),
    );
    const running = await runningFor(fake);
    try {
      const response = await fetch(
        `${running.url}api/repair`,
        sameOriginPost(running),
      );
      assert.equal(response.status, 409);
      assert.equal((await response.json()).error.code, "repair_unavailable");
      assert.equal(fake.calls.repair, 0);
    } finally {
      await running.close();
    }
  }
});

test("an unusable one-shot result can prepare only a fresh unchanged-source attempt", async () => {
  for (const disposition of ["stale", "could_not_check"]) {
    const fake = fakeApplication(snapshot(disposition, false));
    const running = await runningFor(fake);
    try {
      const response = await fetch(
        `${running.url}api/retry`,
        sameOriginPost(running),
      );
      assert.equal(response.status, 200);
      assert.equal(fake.calls.retry, 1);
      const ready = await response.json();
      assert.equal(ready.current_check, null);
      assert.equal(ready.candidate.revision, "fixture-r1");
      assert.equal(ready.candidate.attempt, "Attempt 2");
      assert.equal(ready.can_check, true);
      assert.equal(ready.can_retry, false);

      const duplicate = await fetch(
        `${running.url}api/retry`,
        sameOriginPost(running),
      );
      assert.equal(duplicate.status, 409);
      assert.equal(
        (await duplicate.json()).error.code,
        "retry_unavailable",
      );
      assert.equal(fake.calls.retry, 1);
    } finally {
      await running.close();
    }
  }
});

test("audit is fetched only through an explicit check reference", async () => {
  const fake = fakeApplication(snapshot("does_not_conform", true));
  const running = await runningFor(fake);
  try {
    const before = await fetch(`${running.url}api/snapshot`, {
      headers: runCapabilityHeaders(running),
    });
    assert.equal(before.status, 200);
    assert.deepEqual(fake.calls.audit, []);

    const response = await fetch(
      `${running.url}api/audit/${encodeURIComponent("check:does_not_conform")}`,
      { headers: runCapabilityHeaders(running) },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(fake.calls.audit, ["check:does_not_conform"]);
    const audit = await response.json();
    assert.match(audit.contract.digest, /^sha256:/u);
  } finally {
    await running.close();
  }
});

test("the operation lock rejects a double check submission", async () => {
  const gate = deferred();
  const fake = fakeApplication();
  fake.application.checkCurrent = async () => {
    fake.calls.check += 1;
    await gate.promise;
  };
  const running = await runningFor(fake);
  try {
    const firstRequest = fetch(
      `${running.url}api/check`,
      sameOriginPost(running),
    );
    while (fake.calls.check === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    const duplicate = await fetch(
      `${running.url}api/check`,
      sameOriginPost(running),
    );
    assert.equal(duplicate.status, 409);
    assert.equal(
      (await duplicate.json()).error.code,
      "operation_in_progress",
    );
    assert.equal(fake.calls.check, 1);
    gate.resolve();
    assert.equal((await firstRequest).status, 200);
  } finally {
    await running.close();
  }
});

test("the operation lock is reserved before asynchronous repair eligibility", async () => {
  const gate = deferred();
  const fake = fakeApplication(snapshot("does_not_conform", true));
  const ordinarySnapshot = fake.application.snapshot;
  let gated = false;
  fake.application.snapshot = async () => {
    if (!gated) {
      gated = true;
      await gate.promise;
    }
    return ordinarySnapshot();
  };
  const running = await runningFor(fake);
  try {
    const firstRequest = fetch(
      `${running.url}api/repair`,
      sameOriginPost(running),
    );
    while (!gated) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    const duplicate = await fetch(
      `${running.url}api/repair`,
      sameOriginPost(running),
    );
    assert.equal(duplicate.status, 409);
    assert.equal(
      (await duplicate.json()).error.code,
      "operation_in_progress",
    );
    assert.equal(fake.calls.repair, 0);
    gate.resolve();
    assert.equal((await firstRequest).status, 200);
    assert.equal(fake.calls.repair, 1);
  } finally {
    gate.resolve();
    await running.close();
  }
});

test("server construction validates the injected capability boundary", async () => {
  await assert.rejects(
    startProofGuidedWebChangeShell({
      application: {
        snapshot() {},
      },
      publicDirectory: new URL("../public/", import.meta.url).pathname,
    }),
    /application\.checkCurrent must be a function/u,
  );
});

test("browser module uses status announcements and client-side operation protection", () => {
  const script = readFileSync(
    new URL("../public/app.js", import.meta.url),
    "utf8",
  );
  assert.match(script, /if \(busy\) return;/u);
  assert.match(script, /elements\.liveStatus\.textContent/u);
  assert.match(script, /elements\.checkButton\.disabled = nextBusy/u);
  assert.match(script, /elements\.repairButton\.disabled = nextBusy/u);
  assert.match(script, /if \(!view\.repair\.available\) return;/u);
});

test("the CLI remains application-injected and supports help without construction", async () => {
  let constructions = 0;
  let output = "";
  const help = await runProofGuidedWebChangeCli({
    args: ["--help"],
    createApplication() {
      constructions += 1;
      return fakeApplication().application;
    },
    stdout: {
      write(value) {
        output += value;
        return true;
      },
    },
  });
  assert.equal(help, null);
  assert.equal(constructions, 0);
  assert.match(output, /Usage: proof-guided-web-change/u);

  const fake = fakeApplication();
  output = "";
  const running = await runProofGuidedWebChangeCli({
    args: ["--port", "0"],
    createApplication() {
      constructions += 1;
      return fake.application;
    },
    stdout: {
      write(value) {
        output += value;
        return true;
      },
    },
  });
  assert.ok(running);
  assert.match(output, /Proof-guided web change: http:\/\/127\.0\.0\.1:/u);
  await running.close();
  assert.equal(fake.calls.close, 1);
  assert.equal(constructions, 1);

  await assert.rejects(
    runProofGuidedWebChangeCli({
      args: ["--host", "0.0.0.0"],
      createApplication() {
        throw new Error("must not construct");
      },
    }),
    /Unknown option: --host/u,
  );
});

test("the server cannot bind outside loopback", async () => {
  const fake = fakeApplication();
  await assert.rejects(
    startProofGuidedWebChangeShell({
      application: fake.application,
      host: "0.0.0.0",
    }),
    /may bind only to 127\.0\.0\.1/u,
  );
  assert.equal(fake.calls.close, 0);
});

test("the visible shell refreshes after a thrown check and offers a fresh attempt", async () => {
  const fake = fakeApplication();
  fake.application.checkCurrent = () => {
    fake.calls.check += 1;
    const failedAttempt = snapshot(null, false);
    fake.setSnapshot({
      ...failedAttempt,
      can_check: false,
      can_retry: true,
      retry: {
        available: true,
        label: "Prepare fresh attempt",
        reason:
          "The previous check did not complete. Prepare a fresh attempt from the unchanged source.",
        last: null,
      },
    });
    throw new Error("synthetic check crash");
  };
  const running = await runningFor(fake);
  let browserSession;
  try {
    browserSession = await createTestBrowserSession();
    const page = browserSession.page;
    await page.goto(running.launch_url);
    await page.getByRole("button", {
      name: "Check current candidate",
    }).click();
    await page.getByRole("status").getByText(
      "The browser check did not complete.",
    ).waitFor();
    const retryButton = page.getByRole("button", {
      name: "Prepare fresh attempt",
    });
    await retryButton.waitFor();
    assert.equal(
      await page.getByRole("button", {
        name: "Candidate already checked",
      }).isDisabled(),
      true,
    );

    await retryButton.click();
    await page.getByRole("status").getByText(
      "A fresh attempt is ready to check.",
    ).waitFor();
    assert.equal(fake.calls.retry, 1);
    assert.equal(
      await page.locator("#candidate-revision").textContent(),
      "fixture-r1",
    );
    assert.equal(
      await page.locator("#candidate-attempt").textContent(),
      "Attempt 2",
    );
    assert.equal(
      await page.getByRole("button", {
        name: "Check current candidate",
      }).isEnabled(),
      true,
    );
  } finally {
    try {
      await browserSession?.browser.close();
    } finally {
      await running.close();
    }
  }
});

test("the visible shell announces results, requests audit explicitly, and prevents duplicate repair", async () => {
  const repairGate = deferred();
  const fake = fakeApplication();
  fake.application.applyRepair = async () => {
    fake.calls.repair += 1;
    await repairGate.promise;
    const previousHistory = snapshot(
      "does_not_conform",
      true,
    ).history;
    fake.setSnapshot({
      ...snapshot(null, false),
      candidate: {
        candidate_ref: "candidate:durable",
        label: "Local settings preview",
        revision: "fixture-r2",
        attempt: "Attempt 2",
        preview_url: "",
      },
      repair: {
        available: false,
        label: "Apply durable persistence repair",
        reason: "",
        last: {
          repair_ref: "repair:1",
          from_candidate_ref: "candidate:transient",
          to_candidate_ref: "candidate:durable",
          summary: "Prepared server-backed persistence.",
        },
      },
      last_activity: {
        kind: "repair",
        summary: "Prepared server-backed persistence.",
        revision: "fixture-r2",
        attempt: "Attempt 2",
      },
      history: previousHistory,
    });
  };
  const running = await runningFor(fake);
  let browserSession;
  try {
    browserSession = await createTestBrowserSession();
    const page = browserSession.page;
    await page.goto(running.launch_url);
    await assert.doesNotReject(
      page.getByRole("heading", {
        level: 1,
        name: "Make the saved value durable",
      }).waitFor(),
    );
    assert.equal(
      await page.getByRole("button", { name: "Apply repair" }).count(),
      0,
      "repair is absent before a substantive failing check",
    );

    await page.getByRole("button", {
      name: "Check current candidate",
    }).click();
    await page.getByRole("heading", {
      level: 2,
      name: "This candidate is not yet in spec.",
    }).waitFor();
    await page.getByRole("heading", {
      level: 3,
      name: "What this result does not establish",
    }).waitFor();
    assert.match(
      await page.locator("#scope-list").textContent(),
      /installed browser profiles/u,
    );
    assert.match(
      await page.getByRole("status").textContent(),
      /not yet in spec/u,
    );
    const repairButton = page.getByRole("button", {
      name: "Apply durable persistence repair",
    });
    await repairButton.waitFor();
    assert.equal(fake.calls.audit.length, 0);

    await page.getByRole("button", {
      name: "View audit for fixture-r1, Attempt 1",
    }).click();
    await page.locator("#audit-panel[open]").waitFor();
    assert.deepEqual(fake.calls.audit, ["check:does_not_conform"]);
    assert.match(
      await page.locator("#audit-output").textContent(),
      /sha256:/u,
      "proof plumbing appears only after an explicit audit request",
    );

    await repairButton.click();
    await repairButton.click({ force: true }).catch(() => {});
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fake.calls.repair, 1);
    assert.equal(await repairButton.isDisabled(), true);
    repairGate.resolve();

    await page.getByRole("status").getByText(
      "The repaired candidate is ready to check.",
    ).waitFor();
    assert.match(
      await page.locator("#last-activity").textContent(),
      /Prepared server-backed persistence/u,
    );
    assert.equal(
      await page.locator("#result-section").isHidden(),
      true,
      "repair alone does not confer a passing result",
    );
    assert.equal(
      await page.locator("#candidate-revision").textContent(),
      "fixture-r2",
    );
    await page.getByRole("button", {
      name: "Check current candidate",
    }).click();
    await page.getByRole("heading", {
      level: 2,
      name: "This candidate matches the requested change.",
    }).waitFor();
    assert.match(
      await page.getByRole("status").textContent(),
      /matches the requested change/u,
    );
    assert.equal(
      await page.getByRole("button", {
        name: "Apply durable persistence repair",
      }).count(),
      0,
      "repair is removed after conformance",
    );
  } finally {
    repairGate.resolve();
    try {
      await browserSession?.browser.close();
    } finally {
      await running.close();
    }
  }
});
