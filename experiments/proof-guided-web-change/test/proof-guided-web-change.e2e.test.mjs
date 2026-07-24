import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
} from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  assessRiddleProofCheckedMeaningClosure,
  explainRiddleProofCheckedMeaningClosure,
} from "@riddledc/riddle-proof-core";
import {
  createRiddleProofBrowserSealedProof,
  createRiddleProofBrowserTransition,
  createRiddleProofBrowserTransitionProtocol,
  replayRiddleProofBrowserTransition,
  runProfileLocal,
} from "@riddledc/riddle-proof-runner-playwright";

import {
  applicationAuthorityRef,
  assertApplicationVerification,
} from "riddle-proof-application-projection-experiment";
import {
  applicationVerificationFromCheckedMeaning,
} from "riddle-proof-application-projection-experiment/checked-meaning";

import {
  DURABLE_TEXT_TRANSITION_CONTRACT,
  assessRiddleProofBrowserTransitionCheckReport,
  createProofGuidedWebChangeClient,
  createResolvedWebChangeCandidate,
  createRiddleProofBrowserTransitionCheckReport,
  replayRiddleProofBrowserTransitionCheckReport,
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

function maxTimestamp(timestamps) {
  return new Date(
    Math.max(...timestamps.map((timestamp) => Date.parse(timestamp))),
  ).toISOString();
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

function transitionTrust(protocol) {
  const ruleRegistry = [
    protocol.sealed_protocols.before.rules.target_confirmed.registration,
    protocol.sealed_protocols.before.rules.behavior_confirmed.registration,
    protocol.sealed_protocols.before.rules.sealed_profile_satisfied.registration,
    protocol.rules.transition_observed.registration,
    protocol.rules.transition_survived_reload.registration,
    protocol.rules.transition_visible_in_fresh_context.registration,
    protocol.rules.durable_state_transition_observed.registration,
  ];
  return {
    rule_registry: ruleRegistry,
    trusted_rules: ruleRegistry.map((registration) => ({
      rule_id: registration.rule_id,
      rule_version: registration.rule_version,
      engine: registration.engine,
      implementation_digest: registration.implementation_digest,
    })),
  };
}

function currentnessFromAssessment(assessment, rootCertificateId) {
  if (
    assessment.disposition !== "unresolved"
    && assessment.root_certificate.certificate_id !== rootCertificateId
  ) {
    return {
      status: "unresolved",
      diagnostic_code: "assessment_root_mismatch",
    };
  }
  if (assessment.disposition === "checked") {
    return {
      status: "current",
      consumption_time: assessment.consumption_time,
    };
  }
  if (assessment.disposition === "stale") {
    return {
      status: "stale",
      consumption_time: assessment.consumption_time,
      stale_certificate_ids: [...assessment.stale_certificate_ids],
    };
  }
  return {
    status: "unresolved",
    diagnostic_code: assessment.error.code,
  };
}

function applicationVerificationFromCheckReport({
  authority,
  subject,
  report,
  assessment,
  replayedAt,
}) {
  const root = report.root_certificate;
  const explanation = report.explanation;
  const requirements = authority.specification.requirements.map(
    ({ requirement_id: requirementId }) => {
      const requirement = report.requirements[requirementId];
      assert.ok(
        requirement,
        `report covers pinned requirement ${requirementId}`,
      );
      return {
        requirement_id: requirementId,
        status: requirement.status,
        evidence_ids: [...requirement.role_certificate_ids],
      };
    },
  );
  return {
    version: "riddle-proof.application-verification.v1",
    verification_kind: "checked_meaning_replay",
    status: "verified",
    proof_id: root.certificate_id,
    authority: applicationAuthorityRef(authority),
    spec: authority.specification.ref,
    subject,
    replayed_at: replayedAt,
    proof_root: {
      root_certificate_id: root.certificate_id,
      claim: {
        claim_id: root.claim.claim_id,
        claim_version: root.claim.claim_version,
        ...(root.claim.parameters === undefined
          ? {}
          : { parameters: root.claim.parameters }),
      },
      expected_root_established: false,
    },
    currentness: currentnessFromAssessment(
      assessment,
      root.certificate_id,
    ),
    requirements,
    explanation: {
      root_certificate_id: explanation.root_certificate_id,
      node_count: explanation.node_count,
      grounded_leaf_count: explanation.grounded_leaf_count,
      checked_composition_count: explanation.checked_composition_count,
      node_certificate_ids: explanation.nodes
        .map((node) => node.certificate_id)
        .sort(),
      grounded_frontier: explanation.grounded_frontier.map((entry) => ({
        certificate_id: entry.certificate_id,
        bundle_id: entry.bundle_id,
        receipt_id: entry.receipt_id,
        statement_digest: entry.statement_digest,
        artifact_manifest_digest: entry.artifact_manifest_digest,
        observation_digest: entry.observation_digest,
        captured_at: entry.captured_at,
      })),
    },
  };
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
  const privateKeyBytes = privateKey.export({
    format: "der",
    type: "pkcs8",
  });
  const publicKeyBytes = publicKey.export({
    format: "der",
    type: "spki",
  });
  const keyId = "proof-guided-web-change-e2e-key";
  const collector = {
    collector_id: "@riddledc/riddle-proof-runner-playwright",
    collector_version: "proof-guided-web-change-e2e",
    implementation_digest: sha256(
      Buffer.from("proof-guided-web-change-e2e-collector.v1\0"),
    ),
  };
  const attempts = [];
  let captureOrdinal = 0;

  function authorityFor({
    bundle,
    candidate,
    nonce,
    verifier,
    verificationTime,
  }) {
    return {
      policy: {
        expected_scope: candidate.scope,
        expected_nonce: nonce,
        expected_collector: collector,
        expected_sensor: bundle.statement.sensor,
        expected_verifier: verifier,
        expected_signer: {
          key_id: keyId,
          public_key_spki_sha256: sha256(publicKeyBytes),
        },
        verification_time: verificationTime,
        max_capture_age_ms: 5 * 60 * 1000,
        max_future_skew_ms: 1_000,
        required_artifact_roles: [
          "profile_contract",
          "derived_result",
        ],
      },
      trusted_signers: [{
        key_id: keyId,
        public_key_spki_base64: publicKeyBytes.toString("base64"),
      }],
    };
  }

  async function captureAttempt(candidate) {
    const transitionProfiles = Object.fromEntries(
      PROFILE_ROLES.map((role) => [role, {
        profile_name: candidate.profiles[role].profile_name,
        profile_digest: candidate.profiles[role].profile_digest,
      }]),
    );
    const protocolResult = createRiddleProofBrowserTransitionProtocol({
      expected_scope: candidate.scope,
      transition_id: candidate.scope.proof_attempt,
      profiles: transitionProfiles,
    });
    assert.equal(
      protocolResult.ok,
      true,
      protocolResult.ok ? undefined : protocolResult.error.message,
    );
    const transitionProtocol = protocolResult.protocol;
    const captures = {};
    for (const role of PROFILE_ROLES) {
      captureOrdinal += 1;
      const nonce = randomBytes(32).toString("base64url");
      const output = await runProfileLocal({
        profile: candidate.profiles[role].normalized_profile,
        url: candidate.scope.target,
        ...(candidate.candidate_ref === "candidate:unavailable"
          ? { timeout: 1 }
          : {}),
        outputDir: path.join(
          workspace,
          `${candidate.candidate_ref.replaceAll(":", "-")}-${role}-${captureOrdinal}`,
        ),
        source: {
          repository: candidate.scope.repository,
          git_revision: candidate.scope.revision,
          dirty: false,
          label: "controlled-repair synthetic candidate",
        },
        groundedCapture: {
          scope: candidate.scope,
          nonce,
          collector,
          verifier:
            transitionProtocol.sealed_protocols[role].verifier.verifier_ref,
          signingKey: {
            key_id: keyId,
            private_key_pkcs8_base64:
              privateKeyBytes.toString("base64"),
          },
        },
      });
      captures[role] = {
        nonce,
        output,
        protocol: transitionProtocol.sealed_protocols[role],
      };
      if (!output.groundedCaptureBundle) {
        break;
      }
    }
    return { captures, transitionProfiles, transitionProtocol };
  }

  function authoritiesFor(candidate, captured, timelineBase) {
    return Object.fromEntries(PROFILE_ROLES.map((role, index) => {
      const capture = captured.captures[role];
      assert.ok(capture?.output.groundedCaptureBundle);
      return [role, authorityFor({
        bundle: capture.output.groundedCaptureBundle,
        candidate,
        nonce: capture.nonce,
        verifier: capture.protocol.verifier.verifier_ref,
        verificationTime: plusMilliseconds(timelineBase, index * 10),
      })];
    }));
  }

  function createCheckReport({
    candidate,
    captured,
    authorities,
    timelineBase,
  }) {
    const created = createRiddleProofBrowserTransitionCheckReport({
      bundles: Object.fromEntries(PROFILE_ROLES.map((role) => [
        role,
        captured.captures[role].output.groundedCaptureBundle,
      ])),
      authorities,
      expected_scope: candidate.scope,
      transition_id: candidate.scope.proof_attempt,
      profiles: captured.transitionProfiles,
      role_issued_at: Object.fromEntries(
        PROFILE_ROLES.map((role, index) => [
          role,
          plusMilliseconds(timelineBase, index * 10 + 2),
        ]),
      ),
      root_issued_at: plusMilliseconds(timelineBase, 40),
    });
    assert.equal(
      created.ok,
      true,
      created.ok ? undefined : created.error.message,
    );
    const replayed = replayRiddleProofBrowserTransitionCheckReport({
      checked_closure: JSON.parse(JSON.stringify(created.checked_closure)),
      authorities: JSON.parse(JSON.stringify(authorities)),
      expected_root_certificate_id:
        created.root_certificate.certificate_id,
      expected_scope: JSON.parse(JSON.stringify(candidate.scope)),
      transition_id: candidate.scope.proof_attempt,
      profiles: JSON.parse(
        JSON.stringify(captured.transitionProfiles),
      ),
    });
    assert.equal(
      replayed.ok,
      true,
      replayed.ok ? undefined : replayed.error.message,
    );
    return replayed;
  }

  function createDurableTransition({
    candidate,
    captured,
    authorities,
    timelineBase,
  }) {
    const checkpoints = Object.fromEntries(PROFILE_ROLES.map(
      (role, index) => {
        const sealed = createRiddleProofBrowserSealedProof({
          bundle:
            captured.captures[role].output.groundedCaptureBundle,
          expected_scope: candidate.scope,
          expected_profile_name:
            captured.transitionProfiles[role].profile_name,
          expected_profile_digest:
            captured.transitionProfiles[role].profile_digest,
          authority: authorities[role],
          protocol: captured.transitionProtocol.sealed_protocols[role],
          leaf_issued_at: plusMilliseconds(
            timelineBase,
            index * 10,
          ),
          target_issued_at: plusMilliseconds(
            timelineBase,
            index * 10 + 1,
          ),
          behavior_issued_at: plusMilliseconds(
            timelineBase,
            index * 10 + 1,
          ),
          root_issued_at: plusMilliseconds(
            timelineBase,
            index * 10 + 2,
          ),
        });
        assert.equal(
          sealed.ok,
          true,
          sealed.ok ? undefined : sealed.error.message,
        );
        return [role, sealed];
      },
    ));
    const created = createRiddleProofBrowserTransition({
      expected_scope: candidate.scope,
      transition_id: candidate.scope.proof_attempt,
      profiles: captured.transitionProfiles,
      protocol: captured.transitionProtocol,
      checkpoints,
      authorities,
      transition_issued_at: plusMilliseconds(timelineBase, 15),
      reload_issued_at: plusMilliseconds(timelineBase, 25),
      fresh_context_issued_at: plusMilliseconds(timelineBase, 35),
      root_issued_at: plusMilliseconds(timelineBase, 40),
    });
    assert.equal(
      created.ok,
      true,
      created.ok ? undefined : created.error.message,
    );
    const replayed = replayRiddleProofBrowserTransition({
      checked_closure: JSON.parse(JSON.stringify(created.checked_closure)),
      authorities: JSON.parse(JSON.stringify(authorities)),
      protocol: JSON.parse(JSON.stringify(captured.transitionProtocol)),
      expected_root_certificate_id:
        created.root_certificate.certificate_id,
      expected_scope: JSON.parse(JSON.stringify(candidate.scope)),
      transition_id: candidate.scope.proof_attempt,
      profiles: JSON.parse(
        JSON.stringify(captured.transitionProfiles),
      ),
    });
    assert.equal(
      replayed.ok,
      true,
      replayed.ok ? undefined : replayed.error.message,
    );
    return replayed;
  }

  return {
    attempts,
    close() {
      rmSync(workspace, { recursive: true, force: true });
    },
    provider: {
      async check({ candidate, authority }) {
        const captured = await captureAttempt(candidate);
        const capturedRoles = Object.keys(captured.captures);
        if (
          capturedRoles.length !== PROFILE_ROLES.length
          || PROFILE_ROLES.some(
            (role) =>
              !captured.captures[role]?.output.groundedCaptureBundle,
          )
        ) {
          attempts.push({
            candidate_ref: candidate.candidate_ref,
            statuses: Object.fromEntries(capturedRoles.map((role) => [
              role,
              captured.captures[role].output.result.status,
            ])),
            unavailable: true,
          });
          return {
            version: "riddle-proof.application-verification.v1",
            verification_kind: "checked_meaning_replay",
            status: "unresolved",
            proof_id:
              `unavailable:${candidate.subject.digest}`,
            authority: applicationAuthorityRef(authority),
            diagnostic_code: "browser_capture_unavailable",
          };
        }

        const timelineBase = plusMilliseconds(
          maxTimestamp(PROFILE_ROLES.map(
            (role) =>
              captured.captures[role].output.result.captured_at,
          )),
          1_000,
        );
        const authorities = authoritiesFor(
          candidate,
          captured,
          timelineBase,
        );
        const report = createCheckReport({
          candidate,
          captured,
          authorities,
          timelineBase,
        });
        const statuses = report.reported_statuses;
        const allPassed = PROFILE_ROLES.every(
          (role) => statuses[role] === "passed",
        );
        const ordinaryConsumptionTime = plusMilliseconds(
          timelineBase,
          41,
        );
        const consumptionTime = staleCandidateRefs.has(
          candidate.candidate_ref,
        )
          ? plusMilliseconds(timelineBase, 10 * 60 * 1000)
          : ordinaryConsumptionTime;

        if (!allPassed) {
          const assessment =
            assessRiddleProofBrowserTransitionCheckReport({
              report,
              consumption_time: consumptionTime,
              max_grounded_age_ms: 5 * 60 * 1000,
              max_future_skew_ms: 0,
            });
          const verification = applicationVerificationFromCheckReport({
            authority,
            subject: candidate.subject,
            report,
            assessment,
            replayedAt: consumptionTime,
          });
          try {
            assertApplicationVerification(verification);
          } catch (error) {
            attempts.push({
              candidate_ref: candidate.candidate_ref,
              statuses,
              verification_error:
                error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
          attempts.push({
            candidate_ref: candidate.candidate_ref,
            statuses,
            check_report_id: report.root_certificate.certificate_id,
            durable_root_id: null,
            verification_status: verification.status,
          });
          return verification;
        }

        const durable = createDurableTransition({
          candidate,
          captured,
          authorities,
          timelineBase,
        });
        const trust = transitionTrust(captured.transitionProtocol);
        const explanation = explainRiddleProofCheckedMeaningClosure({
          checked_closure: durable.checked_closure,
          replay_contexts: durable.replay_contexts,
          ...trust,
        });
        assert.equal(
          explanation.ok,
          true,
          explanation.ok ? undefined : explanation.error.message,
        );
        const assessment = assessRiddleProofCheckedMeaningClosure({
          checked_closure: durable.checked_closure,
          replay_contexts: durable.replay_contexts,
          ...trust,
          consumption_time: consumptionTime,
          max_grounded_age_ms: 5 * 60 * 1000,
          max_future_skew_ms: 0,
        });
        const verification =
          applicationVerificationFromCheckedMeaning({
            authority: applicationAuthorityRef(authority),
            specification: authority.specification.ref,
            expected_root: authority.specification.expected_root,
            subject: candidate.subject,
            replayed_at: consumptionTime,
            replay: durable,
            assessment,
            explanation,
            requirement_claims: [
              {
                requirement_id: "declared_transition_observed",
                claim_id:
                  "riddle-proof.browser.transition-observed",
                claim_version: "1",
              },
              {
                requirement_id: "transition_survived_reload",
                claim_id:
                  "riddle-proof.browser.transition-survived-reload",
                claim_version: "1",
              },
              {
                requirement_id:
                  "transition_visible_in_fresh_context",
                claim_id:
                  "riddle-proof.browser.transition-visible-in-fresh-context",
                claim_version: "1",
              },
            ],
          });
        attempts.push({
          candidate_ref: candidate.candidate_ref,
          statuses,
          check_report_id: report.root_certificate.certificate_id,
          durable_root_id: durable.root_certificate.certificate_id,
          verification_status: verification.status,
        });
        return verification;
      },
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
        "The browser target is not yet in spec.",
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
        "The browser target matches the requested change.",
      );
      const repairedMeaning = client.inspect(
        repaired.check_ref,
        "meaning",
      );
      assert.deepEqual(repairedMeaning.findings, []);
      assert.equal(
        repairedMeaning.next_action,
        "No repair is needed for this pinned change.",
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
        "The prior browser check is out of date.",
      );

      const unavailable = await client.check({
        candidate_ref: "candidate:unavailable",
      });
      assert.equal(unavailable.disposition, "could_not_check");
      assert.equal(unavailable.current, false);
      assert.equal(
        unavailable.headline,
        "The browser target could not be checked.",
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
