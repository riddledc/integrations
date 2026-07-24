import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CTA_AGENT_PROTOCOL_VERSION,
  CTA_MUTATION_KIND,
  CTA_MUTATION_POLICY_DIGEST,
  createReviewedFixtureCtaChangeAgent,
} from "../dist/cta-agent.js";
import {
  CTA_CHANGE_TASK,
  FIXED_CTA_CHANGE_CONTRACT,
  createCtaChangeApplication,
} from "../dist/cta-application.js";
import {
  createCtaProjectCandidateResolver,
  validateCtaProofTargetBinding,
} from "../dist/cta-project-candidate-resolver.js";

const CTA_FINDING = Object.freeze({
  requirement_id: "primary-cta-correct",
  label: "The requested primary CTA is present",
  explanation:
    "The current primary CTA does not match the pinned request.",
  repair_guidance:
    "Change only the primary CTA text and destination.",
});

function fakeClientFactory(log, options = {}) {
  return ({ candidate_resolver: resolver }) => {
    let ordinal = 0;
    const views = new Map();
    return {
      contract: options.contract ?? FIXED_CTA_CHANGE_CONTRACT,
      async check(input) {
        assert.deepEqual(Object.keys(input), ["candidate_ref"]);
        const resolution = await resolver.resolve({
          candidate_ref: input.candidate_ref,
          contract: FIXED_CTA_CHANGE_CONTRACT,
        });
        log.resolutions.push(structuredClone(resolution));
        ordinal += 1;
        const disposition =
          options.dispositions?.[ordinal - 1]
          ?? (ordinal === 1 ? "does_not_conform" : "conforms");
        const current =
          disposition === "conforms"
          || disposition === "does_not_conform";
        const outcome = {
          level: "outcome",
          check_ref: `cta_check_${ordinal}`,
          candidate_ref: input.candidate_ref,
          disposition,
          current,
          headline: disposition === "conforms"
            ? "This candidate matches the requested CTA change."
            : "This candidate is not yet in spec.",
          next_action: disposition === "conforms"
            ? "No change is needed."
            : "Apply only the bounded primary CTA change.",
        };
        const findings = disposition === "does_not_conform"
          ? (options.findings ?? [CTA_FINDING])
          : [];
        views.set(outcome.check_ref, {
          meaning: {
            ...outcome,
            level: "meaning",
            findings,
            non_conclusions: [
              "This result is limited to the pinned browser profile.",
            ],
          },
          audit: {
            ...outcome,
            level: "audit",
            contract: FIXED_CTA_CHANGE_CONTRACT,
            subject: { revision: resolution.scope.revision },
            proof_id: `proof-${ordinal}`,
            signature: `signature-${ordinal}`,
          },
        });
        return outcome;
      },
      inspect(checkRef, level = "outcome") {
        log.inspections.push({ check_ref: checkRef, level });
        const value = views.get(checkRef)?.[level];
        if (!value) throw new Error(`missing ${checkRef}/${level}`);
        return structuredClone(value);
      },
    };
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

test("the CTA workflow fails narrowly, commits one bounded proposal, and freshly passes", async () => {
  const log = {
    resolutions: [],
    inspections: [],
    proposals: [],
  };
  const application = await createCtaChangeApplication({
    client_factory: fakeClientFactory(log),
    agent: createReviewedFixtureCtaChangeAgent(),
    on_proposal(proposal) {
      log.proposals.push(structuredClone(proposal));
    },
    now: (() => {
      const values = [
        "2026-07-24T12:00:00.000Z",
        "2026-07-24T12:01:00.000Z",
      ];
      return () => values.shift();
    })(),
  });

  try {
    const initial = application.snapshot();
    assert.equal(initial.task.title, CTA_CHANGE_TASK.title);
    assert.equal(initial.candidate.candidate_ref, "candidate_0001");
    assert.equal(initial.current_check, null);
    assert.equal(initial.can_check, true);
    assert.equal(initial.can_repair, false);
    assert.doesNotMatch(
      JSON.stringify(initial),
      /\b(?:contract|nonce|signature|proof_id|source_digest|policy_digest)\b/iu,
    );

    const failed = await application.checkCurrent();
    assert.equal(failed.disposition, "does_not_conform");
    assert.equal(failed.current, true);
    assert.deepEqual(
      failed.findings.map(({ requirement_id }) => requirement_id),
      ["primary-cta-correct"],
    );
    assert.equal(application.snapshot().can_repair, true);
    assert.equal(log.proposals.length, 0);

    const repair = await application.applyRepair();
    assert.deepEqual(repair, {
      repair_ref: "repair_1",
      from_candidate_ref: "candidate_0001",
      to_candidate_ref: "candidate_0002",
      summary:
        "Changed the primary CTA copy and destination to the requested pricing action.",
    });
    const proposal = application.proposalAudit(repair.repair_ref);
    assert.deepEqual(log.proposals, [proposal]);
    assert.equal(proposal.repair_ref, repair.repair_ref);
    assert.equal(
      proposal.from_candidate_ref,
      repair.from_candidate_ref,
    );
    assert.equal(
      proposal.to_candidate_ref,
      repair.to_candidate_ref,
    );
    assert.equal(
      proposal.mutation_policy_digest,
      CTA_MUTATION_POLICY_DIGEST,
    );
    assert.match(
      proposal.base_source_digest,
      /^sha256:[0-9a-f]{64}$/u,
    );
    assert.match(
      proposal.proposed_source_digest,
      /^sha256:[0-9a-f]{64}$/u,
    );
    assert.notEqual(
      proposal.base_source_digest,
      proposal.proposed_source_digest,
    );

    const changed = application.snapshot();
    assert.equal(changed.candidate.candidate_ref, "candidate_0002");
    assert.equal(changed.candidate.revision, "Revision 2");
    assert.equal(changed.current_check, null);
    assert.equal(changed.history.length, 1);
    assert.equal(changed.can_check, true);
    assert.doesNotMatch(
      JSON.stringify(changed),
      /cta_proposal|mutation_policy_digest|source_digest/iu,
    );

    const passed = await application.checkCurrent();
    assert.equal(passed.disposition, "conforms");
    assert.equal(passed.current, true);
    assert.deepEqual(passed.findings, []);
    assert.equal(application.snapshot().history.length, 2);
    assert.deepEqual(
      log.inspections.map(({ level }) => level),
      ["meaning", "meaning"],
    );
    assert.equal(
      application.audit(failed.check_ref).proof_id,
      "proof-1",
    );
    assert.deepEqual(
      log.inspections.map(({ level }) => level),
      ["meaning", "meaning", "audit"],
    );
  } finally {
    await application.close();
  }
  assert.throws(
    () => application.proposalAudit("repair_1"),
    /closed/u,
  );
});

test("the application gives the agent no contract authority and blocks unrelated findings", async () => {
  let calls = 0;
  const capturedRequests = [];
  const application = await createCtaChangeApplication({
    client_factory: fakeClientFactory(
      { resolutions: [], inspections: [] },
      {
        findings: [{
          ...CTA_FINDING,
          requirement_id: "routes-preserved",
        }],
      },
    ),
    agent: {
      agent_id: "must-not-run",
      async propose(request) {
        calls += 1;
        capturedRequests.push(request);
        return {
          version: CTA_AGENT_PROTOCOL_VERSION,
          proposal_ref: request.proposal_ref,
          base_source_digest: request.base_source_digest,
          mutation: {
            kind: CTA_MUTATION_KIND,
            text: "View pricing",
            href: "/pricing",
          },
          summary: "Changed the CTA.",
        };
      },
    },
  });
  try {
    await application.checkCurrent();
    const snapshot = application.snapshot();
    assert.equal(snapshot.can_repair, false);
    assert.match(snapshot.repair.reason, /extend beyond/u);
    await assert.rejects(
      application.applyRepair(),
      /extend beyond/u,
    );
    assert.equal(calls, 0);
    assert.deepEqual(capturedRequests, []);
  } finally {
    await application.close();
  }
});

test("a concurrent repair attempt cannot erase committed agent provenance", async () => {
  const started = deferred();
  const release = deferred();
  const application = await createCtaChangeApplication({
    client_factory: fakeClientFactory({
      resolutions: [],
      inspections: [],
    }),
    agent: {
      agent_id: "gated-agent",
      async propose(request) {
        started.resolve();
        await release.promise;
        return {
          version: CTA_AGENT_PROTOCOL_VERSION,
          proposal_ref: request.proposal_ref,
          base_source_digest: request.base_source_digest,
          mutation: {
            kind: CTA_MUTATION_KIND,
            text: "View pricing",
            href: "/pricing",
          },
          summary: "Changed only the requested CTA.",
        };
      },
    },
  });
  try {
    await application.checkCurrent();
    const firstRepair = application.applyRepair();
    await started.promise;
    await assert.rejects(
      application.applyRepair(),
      /Another application operation is running/u,
    );
    await assert.rejects(
      application.close(),
      /cannot close during an active operation/u,
    );
    release.resolve();
    const committed = await firstRepair;
    const proposal = application.proposalAudit(
      committed.repair_ref,
    );
    assert.equal(proposal.agent_id, "gated-agent");
    assert.equal(
      proposal.to_candidate_ref,
      committed.to_candidate_ref,
    );
  } finally {
    release.resolve();
    await application.close();
  }
});

test("the CTA application refuses caller-selected machinery and a changed contract", async () => {
  await assert.rejects(
    createCtaChangeApplication({
      client_factory: fakeClientFactory({
        resolutions: [],
        inspections: [],
      }),
      agent: createReviewedFixtureCtaChangeAgent(),
      contract: { digest: "caller-selected" },
    }),
    /accepts only/u,
  );

  await assert.rejects(
    createCtaChangeApplication({
      client_factory: fakeClientFactory(
        { resolutions: [], inspections: [] },
        {
          contract: {
            ...FIXED_CTA_CHANGE_CONTRACT,
            digest: `sha256:${"0".repeat(64)}`,
          },
        },
      ),
      agent: createReviewedFixtureCtaChangeAgent(),
    }),
    /refuses a changed proof contract/u,
  );
});

test("the resolver independently rejects rebound proof targets and tokens", () => {
  const token = "A".repeat(43);
  assert.throws(
    () => validateCtaProofTargetBinding({
      binding_preview_url:
        `http://127.0.0.1:40101/?run=${token}`,
      target_url: "http://127.0.0.1:40102/",
      extra_http_headers: {
        "x-riddle-preview-run": token,
      },
    }),
    /app-owned token-free loopback proof target/u,
  );
  assert.throws(
    () => validateCtaProofTargetBinding({
      binding_preview_url:
        `http://127.0.0.1:40101/?run=${token}`,
      target_url: "http://127.0.0.1:40101/",
      extra_http_headers: {
        "x-riddle-preview-run": "B".repeat(43),
      },
    }),
    /app-owned token-free loopback proof target/u,
  );
  assert.deepEqual(
    validateCtaProofTargetBinding({
      binding_preview_url:
        `http://127.0.0.1:40101/?run=${token}`,
      target_url: "http://127.0.0.1:40101/",
      extra_http_headers: {
        "x-riddle-preview-run": token,
      },
    }),
    {
      binding_preview_url:
        `http://127.0.0.1:40101/?run=${token}`,
      target_url: "http://127.0.0.1:40101/",
      extra_http_headers: {
        "x-riddle-preview-run": token,
      },
    },
  );
});
