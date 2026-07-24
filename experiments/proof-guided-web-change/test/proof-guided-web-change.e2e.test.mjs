import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
} from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  DURABLE_TEXT_TRANSITION_CONTRACT,
  createLocalBrowserReportProvider,
  createProofGuidedWebChangeClient,
  createResolvedWebChangeCandidate,
} from "../dist/src/index.js";

const PROFILE_ROLES = [
  "before",
  "action",
  "reload",
  "fresh_context",
];

const PROFILE_FILES = {
  before: new URL("../profiles/before.json", import.meta.url),
  action: new URL("../profiles/action.json", import.meta.url),
  reload: new URL("../profiles/reload.json", import.meta.url),
  fresh_context: new URL("../profiles/fresh-context.json", import.meta.url),
};

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function plusMilliseconds(timestamp, milliseconds) {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
}

function loadPinnedProfiles() {
  return Object.fromEntries(PROFILE_ROLES.map((role) => {
    const bytes = readFileSync(PROFILE_FILES[role]);
    return [role, {
      bytes,
      profile: JSON.parse(bytes.toString("utf8")),
      source_digest: sha256(bytes),
    }];
  }));
}

function createMutableSpecimenServer() {
  const state = {
    behavior: "transient",
    persistedValue: "unset",
  };
  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.method === "POST" && request.url === "/state") {
      if (state.behavior !== "durable") {
        response.writeHead(409, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "persistence_not_supported" }));
        return;
      }
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          state.persistedValue = String(parsed.value || "");
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ value: state.persistedValue }));
        } catch {
          response.writeHead(400, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "invalid_json" }));
        }
      });
      return;
    }
    if (request.method === "GET" && request.url === "/") {
      const initialValue = JSON.stringify(
        state.behavior === "durable" ? state.persistedValue : "unset",
      );
      const saveImplementation = state.behavior === "transient"
        ? `
          current.textContent = input.value;
          document.body.dataset.saved = 'transient';`
        : `
          const result = await fetch('/state', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ value: input.value }),
          });
          const payload = await result.json();
          current.textContent = payload.value;
          document.body.dataset.saved = 'true';`;
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
      });
      response.end(`<!doctype html>
      <html><body>
        <main id="state-app">
          <label>Value <input id="value" /></label>
          <button id="save" type="button">Save</button>
          <output id="current"></output>
        </main>
        <script>
          const current = document.querySelector('#current');
          const input = document.querySelector('#value');
          current.textContent = ${initialValue};
          input.value = ${initialValue};
          document.querySelector('#save').addEventListener('click', async () => {
            ${saveImplementation}
          });
        </script>
      </body></html>`);
      return;
    }
    response.writeHead(404);
    response.end("not found");
  });
  return { server, state };
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}/`;
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function createCandidate({
  candidateRef,
  revision,
  targetUrl,
}) {
  return createResolvedWebChangeCandidate({
    contract: DURABLE_TEXT_TRANSITION_CONTRACT,
    candidate_ref: candidateRef,
    scope: {
      repository: "https://github.com/riddledc/integrations.git",
      revision,
      environment: "local-controlled-repair",
      target: targetUrl,
    },
  });
}

function createRealBrowserReportProvider({
  staleCandidateRefs = new Set(),
}) {
  const workspace = mkdtempSync(
    path.join(tmpdir(), "riddle-proof-guided-web-change-"),
  );
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const attempts = [];
  const provider = createLocalBrowserReportProvider({
    artifacts_directory: workspace,
    signing_key: {
      key_id: "proof-guided-web-change-e2e-key",
      private_key_pkcs8_base64: privateKey.export({
        format: "der",
        type: "pkcs8",
      }).toString("base64"),
      public_key_spki_base64: publicKey.export({
        format: "der",
        type: "spki",
      }).toString("base64"),
    },
    collector: {
      collector_id: "@riddledc/riddle-proof-runner-playwright",
      collector_version: "proof-guided-web-change-e2e",
      implementation_digest: sha256(
        Buffer.from("proof-guided-web-change-e2e-collector.v1\0"),
      ),
    },
    source_for({ candidate }) {
      return {
        repository: candidate.scope.repository,
        git_revision: candidate.scope.revision,
        dirty: false,
        label: "controlled-repair synthetic candidate",
      };
    },
    timeout_seconds_for({ candidate }) {
      return candidate.candidate_ref === "candidate:unavailable"
        ? 1
        : undefined;
    },
    consumption_time_for({
      candidate,
      ordinary_consumption_time: ordinaryConsumptionTime,
    }) {
      return staleCandidateRefs.has(candidate.candidate_ref)
        ? plusMilliseconds(ordinaryConsumptionTime, 10 * 60 * 1000)
        : ordinaryConsumptionTime;
    },
    on_attempt(attempt) {
      attempts.push(attempt);
      throw new Error(
        "synthetic audit observer failure must not change verification",
      );
    },
  });
  return {
    attempts,
    artifacts_directory: workspace,
    provider,
    close() {
      rmSync(workspace, { recursive: true, force: true });
    },
  };
}

test("the same pinned proof rejects a transient candidate and accepts its durable repair", async () => {
  const profiles = loadPinnedProfiles();
  for (const role of PROFILE_ROLES) {
    assert.equal(
      profiles[role].source_digest,
      DURABLE_TEXT_TRANSITION_CONTRACT.profiles[role].source_digest,
      `${role} is the exact profile pinned by the contract`,
    );
  }

  const specimen = createMutableSpecimenServer();
  const targetUrl = await listen(specimen.server);
  try {
    const transientCandidate = createCandidate({
      candidateRef: "candidate:transient",
      revision: "controlled-repair-transient-r1",
      targetUrl,
    });
    const repairedCandidate = createCandidate({
      candidateRef: "candidate:durable",
      revision: "controlled-repair-durable-r2",
      targetUrl,
    });
    const staleCandidate = createCandidate({
      candidateRef: "candidate:stale",
      revision: "controlled-repair-durable-r3",
      targetUrl,
    });
    const unavailableCandidate = createCandidate({
      candidateRef: "candidate:unavailable",
      revision: "controlled-repair-unavailable-r4",
      targetUrl: "http://127.0.0.1:9/",
    });

    assert.equal(
      transientCandidate.scope.target,
      repairedCandidate.scope.target,
      "the repair is checked against the same browser target",
    );
    assert.notEqual(
      transientCandidate.subject.digest,
      repairedCandidate.subject.digest,
      "the repaired candidate is a new exact subject, not a relabeled old proof",
    );

    const candidates = new Map([
      [transientCandidate.candidate_ref, transientCandidate],
      [repairedCandidate.candidate_ref, repairedCandidate],
      [staleCandidate.candidate_ref, staleCandidate],
      [unavailableCandidate.candidate_ref, unavailableCandidate],
    ]);
    const realReports = createRealBrowserReportProvider({
      staleCandidateRefs: new Set(["candidate:stale"]),
    });
    const client = createProofGuidedWebChangeClient({
      contract: DURABLE_TEXT_TRANSITION_CONTRACT,
      candidate_resolver: {
        async resolve({ candidate_ref: candidateRef }) {
          const candidate = candidates.get(candidateRef);
          if (!candidate) {
            throw new Error(`unknown controlled candidate ${candidateRef}`);
          }
          return {
            candidate_ref: candidate.candidate_ref,
            scope: {
              repository: candidate.scope.repository,
              revision: candidate.scope.revision,
              environment: candidate.scope.environment,
              target: candidate.scope.target,
            },
          };
        },
      },
      report_provider: {
        async check(input) {
          try {
            return await realReports.provider.check(input);
          } catch (error) {
            realReports.attempts.push({
              candidate_ref: input.candidate.candidate_ref,
              provider_error:
                error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        },
      },
    });

    try {
      await assert.rejects(
        client.check({
          candidate_ref: "candidate:transient",
          revision: "caller-must-not-select-a-revision",
        }),
        /only candidate_ref/u,
      );

      const transient = await client.check({
        candidate_ref: "candidate:transient",
      });
      assert.equal(
        transient.disposition,
        "does_not_conform",
        JSON.stringify({
          audit: client.inspect(transient.check_ref, "audit"),
          attempts: realReports.attempts,
        }, null, 2),
      );
      assert.equal(transient.current, true);
      assert.equal(
        transient.headline,
        "This candidate is not yet in spec.",
      );
      const transientMeaning = client.inspect(
        transient.check_ref,
        "meaning",
      );
      assert.deepEqual(
        transientMeaning.findings.map(
          (finding) => finding.requirement_id,
        ),
        [
          "transition_survived_reload",
          "transition_visible_in_fresh_context",
        ],
      );
      assert.match(
        transientMeaning.next_action,
        /Persist the changed state beyond the current page/u,
      );
      const transientAudit = client.inspect(
        transient.check_ref,
        "audit",
      );
      assert.equal(
        transientAudit.subject.digest,
        transientCandidate.subject.digest,
      );
      assert.equal(
        transientAudit.observed_root.claim_id,
        "riddle-proof.browser.transition-check-report",
      );
      assert.equal(
        transientAudit.expected_root.claim_id,
        "riddle-proof.browser.durable-state-transition-observed",
      );
      assert.notEqual(
        transientAudit.observed_root.claim_id,
        transientAudit.expected_root.claim_id,
      );
      assert.equal(transientAudit.verification.status, "verified");
      assert.ok(transientAudit.proof_id);

      specimen.state.behavior = "durable";
      specimen.state.persistedValue = "unset";
      const repaired = await client.check({
        candidate_ref: "candidate:durable",
      });
      assert.equal(repaired.disposition, "conforms");
      assert.equal(repaired.current, true);
      assert.equal(
        repaired.headline,
        "This candidate matches the requested change.",
      );
      const repairedMeaning = client.inspect(
        repaired.check_ref,
        "meaning",
      );
      assert.deepEqual(repairedMeaning.findings, []);
      assert.equal(
        repairedMeaning.next_action,
        "No repair is needed for this change.",
      );
      const repairedAudit = client.inspect(repaired.check_ref, "audit");
      assert.equal(
        repairedAudit.subject.digest,
        repairedCandidate.subject.digest,
      );
      assert.equal(
        repairedAudit.observed_root.claim_id,
        "riddle-proof.browser.durable-state-transition-observed",
      );
      assert.equal(
        repairedAudit.observed_root.claim_id,
        repairedAudit.expected_root.claim_id,
      );
      assert.equal(repairedAudit.verification.status, "verified");

      specimen.state.persistedValue = "unset";
      const stale = await client.check({
        candidate_ref: "candidate:stale",
      });
      assert.equal(stale.disposition, "stale");
      assert.equal(stale.current, false);
      assert.equal(
        stale.headline,
        "The last check is out of date.",
      );

      const unavailable = await client.check({
        candidate_ref: "candidate:unavailable",
      });
      assert.equal(unavailable.disposition, "could_not_check");
      assert.equal(unavailable.current, false);
      assert.equal(
        unavailable.headline,
        "This candidate could not be checked.",
      );
      const unavailableAudit = client.inspect(
        unavailable.check_ref,
        "audit",
      );
      assert.ok(
        unavailableAudit.diagnostics.some(
          (diagnostic) =>
            diagnostic.code === "report_provider_failed",
        ),
        JSON.stringify({
          unavailableAudit,
          attempts: realReports.attempts,
        }, null, 2),
      );
      assert.match(
        realReports.attempts.at(-1).provider_error,
        /Grounded verifier failed/u,
        "an unavailable target remains an unresolved verifier failure, not a fabricated negative",
      );

      assert.deepEqual(
        realReports.attempts[0].statuses,
        {
          before: "passed",
          action: "passed",
          reload: "product_regression",
          fresh_context: "product_regression",
        },
      );
      assert.equal(
        realReports.attempts[0].check_report_id,
        transientAudit.proof_id,
      );
      assert.equal(
        realReports.attempts[1].durable_root_id,
        repairedAudit.proof_id,
      );
      assert.notEqual(
        realReports.attempts[1].check_report_id,
        realReports.attempts[1].durable_root_id,
        "the status report and successful durable meaning are distinct replayed roots",
      );
      assert.deepEqual(
        realReports.attempts[1].statuses,
        {
          before: "passed",
          action: "passed",
          reload: "passed",
          fresh_context: "passed",
        },
      );
      assert.equal(
        existsSync(realReports.artifacts_directory),
        true,
        "the caller-owned artifact root remains available for audit",
      );
      assert.ok(
        readdirSync(realReports.artifacts_directory).length > 0,
        "the provider retained attempt artifacts beneath the caller-owned root",
      );
      assert.equal(
        client.contract.digest,
        DURABLE_TEXT_TRANSITION_CONTRACT.digest,
        "repair changed the specimen, not the pinned proof contract",
      );
    } finally {
      realReports.close();
    }
  } finally {
    await close(specimen.server);
  }
});
