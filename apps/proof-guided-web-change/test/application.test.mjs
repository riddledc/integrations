import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { test } from "node:test";

import {
  DURABLE_SETTING_TASK,
  FIXED_DURABLE_SETTING_CONTRACT,
  createDurableSettingRepairApplication,
} from "../dist/application.js";
import {
  createDeterministicDurableSettingRepairExecutor,
} from "../dist/repair-executor.js";
import {
  createImmutableLoopbackPreviewCandidate,
  pageOnlySpecimenSourceBytes,
  sourceDigest,
} from "../dist/specimen.js";

const FAILED_FINDINGS = [
  {
    requirement_id: "transition_survived_reload",
    label: "The changed state survives reload",
    explanation: "The changed state did not survive a browser reload.",
    repair_guidance:
      "Persist the changed state beyond the current page.",
  },
  {
    requirement_id: "transition_visible_in_fresh_context",
    label: "The changed state appears in a fresh browser context",
    explanation:
      "The changed state was not visible in a fresh browser context.",
    repair_guidance:
      "Persist the changed state outside the original browser context.",
  },
];

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

function previewAccess(previewUrl) {
  const parsed = new URL(previewUrl);
  const runToken = parsed.searchParams.get("run");
  assert.match(runToken ?? "", /^[A-Za-z0-9_-]{43}$/u);
  return {
    root: new URL("/", parsed),
    target: parsed,
    headers: {
      "x-riddle-preview-run": runToken,
    },
  };
}

function fakeClientFactory(log, options = {}) {
  return ({
    candidate_resolver: candidateResolver,
    proof_transport_for: proofTransportFor,
  }) => {
    log.resolver = candidateResolver;
    log.proofTransport = proofTransportFor;
    const views = new Map();
    let ordinal = 0;
    return {
      contract: FIXED_DURABLE_SETTING_CONTRACT,
      async check(input) {
        assert.deepEqual(Object.keys(input), ["candidate_ref"]);
        const resolution = await candidateResolver.resolve({
          candidate_ref: input.candidate_ref,
          contract: FIXED_DURABLE_SETTING_CONTRACT,
        });
        log.resolutions.push(structuredClone(resolution));
        ordinal += 1;
        if (options.throw_first === true && ordinal === 1) {
          throw new Error("synthetic capture failure");
        }
        const disposition = options.dispositions?.[ordinal - 1]
          ?? (ordinal === 1 ? "does_not_conform" : "conforms");
        const outcome = {
          level: "outcome",
          check_ref: `check_${ordinal}`,
          candidate_ref: input.candidate_ref,
          disposition,
          current:
            disposition !== "stale"
            && disposition !== "could_not_check",
          headline: disposition === "conforms"
            ? "This candidate matches the requested change."
            : "This candidate is not yet in spec.",
          next_action: {
            conforms: "No repair is needed for this change.",
            does_not_conform:
              "Persist the changed state beyond the current page.",
            stale:
              "Prepare a fresh attempt from the unchanged source, then check it.",
            could_not_check:
              "Restore the check environment, then prepare a fresh attempt.",
          }[disposition],
        };
        views.set(outcome.check_ref, {
          outcome,
          meaning: {
            ...outcome,
            level: "meaning",
            findings: disposition === "conforms"
              ? []
              : (options.first_findings ?? FAILED_FINDINGS),
            non_conclusions: [
              "This does not establish correctness outside the pinned profiles.",
            ],
          },
          audit: {
            ...outcome,
            level: "audit",
            contract: {
              digest: FIXED_DURABLE_SETTING_CONTRACT.digest,
            },
            subject: {
              revision: resolution.scope.revision,
            },
            nonce: `nonce-${ordinal}`,
            signature: `signature-${ordinal}`,
            proof_id: `proof-${ordinal}`,
          },
        });
        return outcome;
      },
      inspect(checkRef, level = "outcome") {
        log.inspections.push({ check_ref: checkRef, level });
        const view = views.get(checkRef)?.[level];
        if (!view) throw new Error(`missing fake view ${checkRef}/${level}`);
        return structuredClone(view);
      },
    };
  };
}

test("the owned workflow checks, repairs, and rechecks distinct one-shot candidates", async () => {
  const log = {
    inspections: [],
    resolutions: [],
    resolver: null,
  };
  const application = await createDurableSettingRepairApplication({
    client_factory: fakeClientFactory(log),
    now: (() => {
      const timestamps = [
        "2026-07-24T10:00:00.000Z",
        "2026-07-24T10:01:00.000Z",
      ];
      return () => timestamps.shift();
    })(),
  });

  try {
    const initial = application.snapshot();
    assert.equal(initial.task.title, DURABLE_SETTING_TASK.title);
    assert.equal(initial.candidate.candidate_ref, "candidate_0001");
    assert.equal(initial.candidate.revision, "Revision 1");
    assert.equal(initial.candidate.attempt, "Attempt 1");
    assert.equal(initial.current_check, null);
    assert.equal(initial.can_check, true);
    assert.equal(initial.can_repair, false);
    assert.deepEqual(initial.history, []);
    assert.doesNotMatch(
      JSON.stringify(initial),
      /\b(?:nonce|signature|proof_id|authority|source_digest)\b/iu,
    );
    assert.doesNotMatch(JSON.stringify(initial), /[0-9a-f]{64}/u);

    const initialAccess = previewAccess(initial.candidate.preview_url);
    const initialPage = await fetch(initialAccess.target)
      .then(async (response) => response.text());
    assert.match(initialPage, /src="\/client\.js"/u);
    assert.doesNotMatch(initialPage, /fetch\("\/state"/u);
    const initialClient = await fetch(
      new URL("/client.js", initial.candidate.preview_url),
    ).then(async (response) => response.text());
    assert.match(initialClient, /page-only/u);
    assert.doesNotMatch(initialClient, /fetch\("\/state"/u);

    const failed = await application.checkCurrent();
    assert.equal(failed.disposition, "does_not_conform");
    assert.deepEqual(
      failed.findings.map((finding) => finding.requirement_id),
      [
        "transition_survived_reload",
        "transition_visible_in_fresh_context",
      ],
    );
    assert.deepEqual(failed.non_conclusions, [
      "This does not establish correctness outside the pinned profiles.",
    ]);
    assert.equal(application.snapshot().can_check, false);
    assert.equal(application.snapshot().can_repair, true);
    await assert.rejects(
      application.checkCurrent(),
      /one-shot/u,
    );

    const repair = await application.applyRepair();
    assert.deepEqual(repair, {
      repair_ref: "repair_1",
      from_candidate_ref: "candidate_0001",
      to_candidate_ref: "candidate_0002",
      summary:
        "Replaced page-only Save behavior with server-backed persistence.",
    });
    assert.deepEqual(
      log.inspections,
      [{ check_ref: "check_1", level: "meaning" }],
      "repair consumes the existing meaning projection, not an audit view",
    );

    const repaired = application.snapshot();
    assert.equal(repaired.candidate.candidate_ref, "candidate_0002");
    assert.notEqual(
      repaired.candidate.revision,
      initial.candidate.revision,
    );
    assert.equal(repaired.candidate.revision, "Revision 2");
    assert.equal(repaired.candidate.attempt, "Attempt 2");
    assert.notEqual(
      repaired.candidate.preview_url,
      initial.candidate.preview_url,
    );
    assert.equal(repaired.current_check, null);
    assert.equal(repaired.can_check, true);
    assert.equal(repaired.can_repair, false);
    assert.deepEqual(repaired.repair.last, repair);
    assert.equal(
      repaired.history.length,
      1,
      "repair remains separate from proof-check history",
    );

    const repairedAccess = previewAccess(repaired.candidate.preview_url);
    assert.equal(
      (await fetch(repairedAccess.root)).status,
      401,
      "the specimen is not readable without its run capability",
    );
    const previewBootstrap = await fetch(
      repaired.candidate.preview_url,
      { redirect: "manual" },
    );
    assert.equal(previewBootstrap.status, 200);
    assert.equal(
      previewBootstrap.headers.get("set-cookie"),
      null,
      "run capabilities must never enter cross-port loopback cookies",
    );
    const repairedPage = await fetch(repairedAccess.target)
      .then(async (response) => response.text());
    assert.doesNotMatch(repairedPage, /fetch\("\/state"/u);
    const repairedClient = await fetch(
      new URL("/client.js", repaired.candidate.preview_url),
    ).then(async (response) => response.text());
    assert.match(repairedClient, /fetch\("\/state"/u);
    assert.match(repairedClient, /server-backed/u);
    const previewOrigin = new URL(repaired.candidate.preview_url).origin;
    const stateUrl = new URL("/state", repaired.candidate.preview_url);
    const cookieOnly = await fetch(stateUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `riddle_preview_run=${
          repairedAccess.headers["x-riddle-preview-run"]
        }`,
        origin: previewOrigin,
      },
      body: JSON.stringify({ value: "blocked" }),
    });
    assert.equal(
      cookieOnly.status,
      401,
      "a host-scoped loopback cookie must not confer run authority",
    );
    const missingOrigin = await fetch(stateUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...repairedAccess.headers,
      },
      body: JSON.stringify({ value: "blocked" }),
    });
    assert.equal(missingOrigin.status, 403);
    const wrongOrigin = await fetch(stateUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...repairedAccess.headers,
        origin: "https://attacker.invalid",
      },
      body: JSON.stringify({ value: "blocked" }),
    });
    assert.equal(wrongOrigin.status, 403);
    const wrongHost = await rawRequest(stateUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...repairedAccess.headers,
        host: "attacker.invalid",
        origin: previewOrigin,
      },
      body: JSON.stringify({ value: "blocked" }),
    });
    assert.equal(wrongHost.status, 403);
    const oversized = await fetch(stateUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...repairedAccess.headers,
        origin: previewOrigin,
      },
      body: JSON.stringify({ value: "x".repeat(5000) }),
    });
    assert.equal(oversized.status, 413);
    const marker = FIXED_DURABLE_SETTING_CONTRACT.transition_id;
    const saveResponse = await fetch(
      stateUrl,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...repairedAccess.headers,
          origin: previewOrigin,
        },
        body: JSON.stringify({ value: marker }),
      },
    );
    assert.equal(saveResponse.status, 200);
    assert.deepEqual(await saveResponse.json(), { value: marker });
    const freshPage = await fetch(repairedAccess.target)
      .then(async (response) => response.text());
    assert.match(freshPage, new RegExp(marker, "u"));
    const hostileValue =
      "</output><script>globalThis.__stored_xss = true</script>";
    const hostileSave = await fetch(stateUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...repairedAccess.headers,
        origin: previewOrigin,
      },
      body: JSON.stringify({ value: hostileValue }),
    });
    assert.equal(hostileSave.status, 200);
    const hostilePageResponse = await fetch(
      repairedAccess.target,
    );
    const hostilePage = await hostilePageResponse.text();
    assert.match(
      hostilePageResponse.headers.get("content-security-policy") ?? "",
      /script-src 'self'/u,
    );
    assert.doesNotMatch(hostilePage, /<script>globalThis\.__stored_xss/u);
    assert.match(
      hostilePage,
      /&lt;\/output&gt;&lt;script&gt;globalThis\.__stored_xss/u,
    );

    const passed = await application.checkCurrent();
    assert.equal(passed.disposition, "conforms");
    const complete = application.snapshot();
    assert.equal(complete.can_check, false);
    assert.equal(complete.can_repair, false);
    assert.equal(complete.history.length, 2);
    assert.deepEqual(
      complete.history.map((entry) => entry.revision),
      ["Revision 1", "Revision 2"],
    );
    assert.deepEqual(
      complete.history.map((entry) => entry.checked_at),
      [
        "2026-07-24T10:00:00.000Z",
        "2026-07-24T10:01:00.000Z",
      ],
    );
    assert.equal(log.resolutions.length, 2);
    assert.notEqual(
      log.resolutions[0].scope.target,
      initial.candidate.preview_url,
      "the visible preview is separate from the first proof target",
    );
    assert.equal(
      new URL(log.resolutions[0].scope.target).search,
      "",
      "the semantic proof target contains no bearer capability",
    );
    assert.notEqual(
      log.resolutions[1].scope.target,
      repaired.candidate.preview_url,
      "the visible repaired preview cannot mutate the proof target",
    );
    assert.match(
      log.resolutions[0].scope.revision,
      /^source-[0-9a-f]{64}$/u,
    );
    assert.match(
      log.resolutions[1].scope.revision,
      /^source-[0-9a-f]{64}$/u,
    );
    assert.notEqual(
      log.resolutions[0].scope.revision,
      log.resolutions[1].scope.revision,
      "the resolver retains distinct content-derived revisions",
    );
    const proofTransport = await log.proofTransport({
      candidate_ref: log.resolutions[1].candidate_ref,
      target: log.resolutions[1].scope.target,
    });
    assert.deepEqual(Object.keys(proofTransport.extra_http_headers), [
      "x-riddle-preview-run",
    ]);
    assert.match(
      proofTransport.extra_http_headers["x-riddle-preview-run"],
      /^[A-Za-z0-9_-]{43}$/u,
    );
    assert.equal(
      (await fetch(log.resolutions[1].scope.target)).status,
      401,
      "the token-free proof target rejects unauthenticated requests",
    );
    assert.equal(
      (await fetch(log.resolutions[1].scope.target, {
        headers: proofTransport.extra_http_headers,
      })).status,
      200,
      "the trusted transport capability authorizes the proof context",
    );
    assert.doesNotMatch(
      JSON.stringify(complete),
      new RegExp(
        proofTransport.extra_http_headers["x-riddle-preview-run"],
        "u",
      ),
      "the proof transport secret never enters ordinary application state",
    );
    await assert.rejects(
      log.proofTransport({
        candidate_ref: log.resolutions[1].candidate_ref,
        target: "http://127.0.0.1:1/",
      }),
      /does not match the resolved target/u,
    );

    assert.equal(
      log.inspections.some(({ level }) => level === "audit"),
      false,
    );
    const audit = application.audit("check_1");
    assert.equal(audit.nonce, "nonce-1");
    assert.equal(audit.signature, "signature-1");
    assert.equal(
      log.inspections.at(-1).level,
      "audit",
      "audit expansion occurs only on the explicit audit call",
    );
  } finally {
    await application.close();
    await application.close();
  }
});

test("the application refuses a caller-supplied repair implementation", async () => {
  const log = {
    inspections: [],
    resolutions: [],
    resolver: null,
  };
  await assert.rejects(
    createDurableSettingRepairApplication({
      client_factory: fakeClientFactory(log),
      repair_executor: {
        async repair() {
          throw new Error("must never run");
        },
      },
    }),
    /accepts only client_factory and optional now/u,
  );
});

test("stale and unavailable results recover through a fresh unchanged-source attempt", async () => {
  for (const firstDisposition of ["stale", "could_not_check"]) {
    const log = {
      inspections: [],
      resolutions: [],
      resolver: null,
    };
    const application = await createDurableSettingRepairApplication({
      client_factory: fakeClientFactory(log, {
        dispositions: [firstDisposition, "conforms"],
      }),
    });
    try {
      const initial = application.snapshot();
      const unusable = await application.checkCurrent();
      assert.equal(unusable.disposition, firstDisposition);
      assert.match(unusable.next_action, /fresh attempt/u);
      const terminal = application.snapshot();
      assert.equal(terminal.can_check, false);
      assert.equal(terminal.can_repair, false);
      assert.equal(terminal.can_retry, true);

      const fresh = await application.prepareFreshAttempt();
      const ready = application.snapshot();
      assert.equal(fresh.from_candidate_ref, initial.candidate.candidate_ref);
      assert.notEqual(fresh.to_candidate_ref, initial.candidate.candidate_ref);
      assert.equal(ready.candidate.revision, initial.candidate.revision);
      assert.equal(ready.candidate.attempt, "Attempt 2");
      assert.notEqual(
        ready.candidate.preview_url,
        initial.candidate.preview_url,
      );
      assert.equal(ready.current_check, null);
      assert.equal(ready.can_check, true);
      assert.equal(ready.can_retry, false);

      const checked = await application.checkCurrent();
      assert.equal(checked.disposition, "conforms");
      assert.equal(log.resolutions.length, 2);
      assert.equal(
        log.resolutions[0].scope.revision,
        log.resolutions[1].scope.revision,
        "a retry retains the exact source revision",
      );
      assert.notEqual(
        log.resolutions[0].scope.target,
        log.resolutions[1].scope.target,
        "a retry receives a fresh proof target",
      );
    } finally {
      await application.close();
    }
  }
});

test("a later repair activity supersedes an earlier fresh-attempt activity", async () => {
  const log = {
    inspections: [],
    resolutions: [],
    resolver: null,
  };
  const application = await createDurableSettingRepairApplication({
    client_factory: fakeClientFactory(log, {
      dispositions: ["stale", "does_not_conform"],
    }),
  });
  try {
    assert.equal(
      (await application.checkCurrent()).disposition,
      "stale",
    );
    await application.prepareFreshAttempt();
    assert.deepEqual(application.snapshot().last_activity, {
      kind: "fresh_attempt",
      summary: "Prepared a fresh proof attempt from the unchanged source.",
      revision: "Revision 1",
      attempt: "Attempt 2",
    });

    assert.equal(
      (await application.checkCurrent()).disposition,
      "does_not_conform",
    );
    await application.applyRepair();
    const repaired = application.snapshot();
    assert.ok(repaired.retry.last);
    assert.ok(repaired.repair.last);
    assert.equal(repaired.candidate.revision, "Revision 2");
    assert.equal(repaired.candidate.attempt, "Attempt 3");
    assert.deepEqual(repaired.last_activity, {
      kind: "repair",
      summary:
        "Replaced page-only Save behavior with server-backed persistence.",
      revision: "Revision 2",
      attempt: "Attempt 3",
    });
    assert.deepEqual(
      repaired.history.map(({ revision, attempt }) => ({
        revision,
        attempt,
      })),
      [
        { revision: "Revision 1", attempt: "Attempt 1" },
        { revision: "Revision 1", attempt: "Attempt 2" },
      ],
    );
  } finally {
    await application.close();
  }
});

test("a thrown check consumes only its attempt and exposes honest recovery", async () => {
  const log = {
    inspections: [],
    resolutions: [],
    resolver: null,
  };
  const application = await createDurableSettingRepairApplication({
    client_factory: fakeClientFactory(log, {
      throw_first: true,
      dispositions: ["does_not_conform", "conforms"],
    }),
  });
  try {
    await assert.rejects(
      application.checkCurrent(),
      /synthetic capture failure/u,
    );
    const failedAttempt = application.snapshot();
    assert.equal(failedAttempt.current_check, null);
    assert.equal(failedAttempt.can_check, false);
    assert.equal(failedAttempt.can_retry, true);
    const fresh = await application.prepareFreshAttempt();
    assert.equal(fresh.revision, "Revision 1");
    assert.equal(fresh.attempt, "Attempt 2");
    assert.equal(application.snapshot().can_check, true);
    assert.equal(
      (await application.checkCurrent()).disposition,
      "conforms",
    );
  } finally {
    await application.close();
  }
});

test("the app-owned resolver refuses caller-selected scope and changed contracts", async () => {
  const log = {
    inspections: [],
    resolutions: [],
    resolver: null,
  };
  const application = await createDurableSettingRepairApplication({
    client_factory: fakeClientFactory(log),
  });
  try {
    const currentRef = application.snapshot().candidate.candidate_ref;
    await assert.rejects(
      log.resolver.resolve({
        candidate_ref: currentRef,
        contract: FIXED_DURABLE_SETTING_CONTRACT,
        target: "https://caller-controlled.invalid/",
      }),
      /accepts only candidate_ref and the installed contract/u,
    );
    await assert.rejects(
      log.resolver.resolve({
        candidate_ref: currentRef,
        contract: {
          ...FIXED_DURABLE_SETTING_CONTRACT,
          digest: `sha256:${"0".repeat(64)}`,
        },
      }),
      /installed web-change contract changed at digest/u,
    );
    await assert.rejects(
      log.resolver.resolve({
        candidate_ref: "candidate_9999",
        contract: FIXED_DURABLE_SETTING_CONTRACT,
      }),
      /Unknown candidate reference/u,
    );
  } finally {
    await application.close();
  }
});

test("a nonconforming immediate-transition failure does not authorize persistence repair", async () => {
  const log = {
    inspections: [],
    resolutions: [],
    resolver: null,
  };
  const application = await createDurableSettingRepairApplication({
    client_factory: fakeClientFactory(log, {
      first_findings: [{
        requirement_id: "declared_transition_observed",
        label: "The requested browser change appears immediately",
        explanation:
          "The requested browser change did not produce its immediate result.",
        repair_guidance: "Repair the action or its immediate result.",
      }],
    }),
  });
  try {
    const check = await application.checkCurrent();
    assert.equal(check.disposition, "does_not_conform");
    assert.deepEqual(
      check.findings.map((finding) => finding.requirement_id),
      ["declared_transition_observed"],
    );
    const snapshot = application.snapshot();
    assert.equal(snapshot.can_repair, false);
    assert.equal(snapshot.repair.available, false);
    assert.match(
      snapshot.repair.reason,
      /outside the owned persistence repair/u,
    );
    await assert.rejects(
      application.applyRepair(),
      /outside the owned persistence repair/u,
    );
  } finally {
    await application.close();
  }
});

test("the deterministic repair verifies exact base bytes and is reproducible", async () => {
  const executor = createDeterministicDurableSettingRepairExecutor();
  const pageOnlySourceBytes = pageOnlySpecimenSourceBytes();
  const input = {
    source_bytes: pageOnlySourceBytes,
    task: DURABLE_SETTING_TASK,
    findings: FAILED_FINDINGS,
  };
  const first = await executor.repair(input);
  const second = await executor.repair(input);
  assert.deepEqual(first.source_bytes, second.source_bytes);
  assert.notEqual(
    sourceDigest(first.source_bytes),
    sourceDigest(pageOnlySourceBytes),
  );
  const repairedText = new TextDecoder().decode(first.source_bytes);
  assert.match(repairedText, /request\.method === "POST"/u);
  assert.match(repairedText, /server-backed/u);

  const changedBase = new Uint8Array(pageOnlySourceBytes);
  changedBase[0] ^= 1;
  await assert.rejects(
    createImmutableLoopbackPreviewCandidate({
      candidate_ref: "candidate_0099",
      label: "Untrusted candidate",
      source_bytes: changedBase,
    }),
    /outside its exact app-owned variants/u,
  );
  await assert.rejects(
    executor.repair({
      ...input,
      source_bytes: changedBase,
    }),
    /exact base source digest/u,
  );

  await assert.rejects(
    executor.repair({
      ...input,
      audit: { nonce: "must-not-enter" },
    }),
    /only reviewed data/u,
  );

  await assert.rejects(
    executor.repair({
      ...input,
      findings: [
        ...FAILED_FINDINGS,
        {
          requirement_id: "declared_transition_observed",
          label: "The requested browser change appears immediately",
          explanation: "The immediate result was absent.",
        },
      ],
    }),
    /do not authorize/u,
  );
});
