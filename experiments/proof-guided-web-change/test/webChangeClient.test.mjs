import assert from "node:assert/strict";
import test from "node:test";

import {
  DURABLE_TEXT_TRANSITION_CONTRACT,
  canonicalWebChangeDigest,
  createPinnedWebChangeContract,
  createProofGuidedWebChangeClient,
  createResolvedWebChangeCandidate,
  deriveWebChangeAttemptAuthority,
} from "../dist/src/index.js";

const digest = (character) => `sha256:${character.repeat(64)}`;
const contract = DURABLE_TEXT_TRANSITION_CONTRACT;

function candidate(
  candidateRef = "candidate-a",
  revision = "revision-a",
  target = "http://127.0.0.1:43117/",
) {
  return createResolvedWebChangeCandidate({
    contract,
    candidate_ref: candidateRef,
    scope: candidateResolution(candidateRef, revision, target).scope,
  });
}

function candidateResolution(
  candidateRef = "candidate-a",
  revision = "revision-a",
  target = "http://127.0.0.1:43117/",
) {
  return {
    candidate_ref: candidateRef,
    scope: {
      repository: "https://example.invalid/repository.git",
      revision,
      environment: "synthetic-browser-target",
      target,
    },
  };
}

function authorityRef(authority) {
  return {
    authority_id: authority.authority_id,
    authority_version: authority.authority_version,
    authority_digest: authority.authority_digest,
  };
}

function verification(input, disposition = "conforms") {
  const {
    authority,
    candidate: resolvedCandidate,
  } = input;
  const failed = disposition === "does_not_conform";
  const unresolved = disposition === "could_not_check";
  const expectedRootEstablished =
    disposition === "conforms" || disposition === "stale";
  const rootCertificateId = "certificate-root";
  const evidenceEntries = authority.specification.requirements.map(
    (requirement, index) => ({
      requirement,
      certificate_id: `certificate-${requirement.requirement_id}`,
      bundle_id: `bundle-${index}`,
      receipt_id: `receipt-${index}`,
      statement_digest: digest(String((index + 1) % 10)),
      artifact_manifest_digest: digest(String((index + 2) % 10)),
      observation_digest: digest(String((index + 3) % 10)),
      captured_at: `2026-07-24T01:00:0${index}.000Z`,
    }),
  );
  return {
    version: "riddle-proof.application-verification.v1",
    verification_kind: "checked_meaning_replay",
    status: "verified",
    proof_id: "proof-1",
    authority: authorityRef(authority),
    spec: authority.specification.ref,
    subject: resolvedCandidate.subject,
    replayed_at: "2026-07-24T01:01:00.000Z",
    proof_root: {
      root_certificate_id: rootCertificateId,
      claim: expectedRootEstablished
        ? authority.specification.expected_root
        : {
            claim_id: "riddle-proof.browser.transition-check-report",
            claim_version: "1",
          },
      expected_root_established: expectedRootEstablished,
    },
    currentness: disposition === "stale"
      ? {
          status: "stale",
          consumption_time: "2026-07-24T01:01:00.000Z",
          stale_certificate_ids: [evidenceEntries[0].certificate_id],
        }
      : {
          status: "current",
          consumption_time: "2026-07-24T01:01:00.000Z",
        },
    requirements: evidenceEntries.map((entry, index) => {
      const status = unresolved && index === 0
        ? "unresolved"
        : failed && entry.requirement.requirement_id
            === "transition_survived_reload"
          ? "failed"
          : "satisfied";
      return {
        requirement_id: entry.requirement.requirement_id,
        status,
        evidence_ids: status === "unresolved"
          ? []
          : [entry.certificate_id],
        ...(status === "unresolved"
          ? { diagnostic_code: "browser_evidence_unavailable" }
          : {}),
      };
    }),
    explanation: {
      root_certificate_id: rootCertificateId,
      node_count: evidenceEntries.length + 1,
      grounded_leaf_count: evidenceEntries.length,
      checked_composition_count: 1,
      node_certificate_ids: [
        ...evidenceEntries.map((entry) => entry.certificate_id),
        rootCertificateId,
      ],
      grounded_frontier: evidenceEntries.map((entry) => ({
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

function clientFor(disposition = "conforms", overrides = {}) {
  const calls = [];
  const client = createProofGuidedWebChangeClient({
    contract,
    candidate_resolver: {
      async resolve(input) {
        calls.push({ capability: "resolver", input });
        return overrides.resolve?.(input)
          ?? candidateResolution(input.candidate_ref);
      },
    },
    report_provider: {
      async check(input) {
        calls.push({ capability: "provider", input });
        return overrides.report?.(input) ?? verification(input, disposition);
      },
    },
  });
  return { calls, client };
}

test("ordinary check input is only an opaque candidate reference", async () => {
  const { calls, client } = clientFor();
  const result = await client.check({ candidate_ref: "candidate-a" });
  assert.deepEqual(result, {
    level: "outcome",
    check_ref: "webcheck_1",
    candidate_ref: "candidate-a",
    disposition: "conforms",
    current: true,
    headline: "This candidate matches the requested change.",
    next_action: "No repair is needed for this change.",
  });
  assert.equal(calls[0].capability, "resolver");
  assert.deepEqual(Object.keys(calls[0].input), [
    "candidate_ref",
    "contract",
  ]);
  assert.equal(calls[1].capability, "provider");
  assert.equal(calls[1].input.contract.digest, contract.digest);
  assert.equal(
    calls[1].input.authority.specification.expected_root.parameters.revision,
    "revision-a",
  );

  await assert.rejects(
    client.check({
      candidate_ref: "candidate-a",
      target: "https://caller-controlled.invalid/",
    }),
    /may contain only candidate_ref/u,
  );
});

test("attempt authority is deterministic while repaired and fresh-target candidates remain distinct", () => {
  const firstCandidate = candidate("candidate-a", "revision-a");
  const repeatedCandidate = candidate("candidate-a", "revision-a");
  const repairedCandidate = candidate("candidate-b", "revision-b");
  const freshTargetCandidate = candidate(
    "candidate-c",
    "revision-a",
    "http://127.0.0.1:43118/",
  );
  const first = deriveWebChangeAttemptAuthority({
    contract,
    candidate: firstCandidate,
  });
  const repeated = deriveWebChangeAttemptAuthority({
    contract,
    candidate: repeatedCandidate,
  });
  const repaired = deriveWebChangeAttemptAuthority({
    contract,
    candidate: repairedCandidate,
  });
  const freshTarget = deriveWebChangeAttemptAuthority({
    contract,
    candidate: freshTargetCandidate,
  });

  assert.deepEqual(first, repeated);
  assert.notEqual(first.authority_digest, repaired.authority_digest);
  assert.notEqual(
    first.specification.ref.digest,
    repaired.specification.ref.digest,
  );
  assert.equal(
    firstCandidate.scope.revision,
    freshTargetCandidate.scope.revision,
    "a fresh attempt may retain the exact source revision",
  );
  assert.notEqual(
    firstCandidate.subject.digest,
    freshTargetCandidate.subject.digest,
    "a different exact target creates a distinct subject",
  );
  assert.notEqual(
    first.authority_digest,
    freshTarget.authority_digest,
    "a different exact target creates a distinct attempt authority",
  );
  assert.notEqual(
    first.specification.ref.digest,
    freshTarget.specification.ref.digest,
    "the resolved attempt specification binds the new target",
  );
  assert.equal(contract.digest, DURABLE_TEXT_TRANSITION_CONTRACT.digest);
  assert.equal(
    first.specification.expected_root.parameters.transition_id,
    contract.transition_id,
  );
  for (const role of [
    "before",
    "action",
    "reload",
    "fresh_context",
  ]) {
    assert.equal(
      firstCandidate.profiles[role].source_digest,
      repairedCandidate.profiles[role].source_digest,
    );
    assert.equal(
      firstCandidate.profiles[role].profile_digest,
      repairedCandidate.profiles[role].profile_digest,
    );
  }
});

test("canonical authority digests distinguish prototype keys and reject sparse arrays", () => {
  assert.notEqual(
    canonicalWebChangeDigest({}),
    canonicalWebChangeDigest(
      JSON.parse('{"__proto__":{"candidate":"substituted"}}'),
    ),
  );

  const sparse = new Array(1);
  assert.throws(
    () => canonicalWebChangeDigest(sparse),
    /dense JSON array without extra properties/u,
  );
  assert.doesNotThrow(() => canonicalWebChangeDigest([null]));
});

test("a resolver cannot substitute profiles, digests, or subject identity", async () => {
  for (const forbidden of [
    {
      profiles: {
        action: {
          profile_name: contract.profiles.action.profile_name,
          source_digest: contract.profiles.action.source_digest,
          profile_digest: digest("f"),
        },
      },
    },
    {
      subject: {
        id: "resolver-selected-subject",
        digest: digest("e"),
        kind: "browser_target_transition",
      },
    },
  ]) {
    let providerCalled = false;
    const { client } = clientFor("conforms", {
      resolve: () => ({
        ...candidateResolution(),
        ...forbidden,
      }),
      report: (input) => {
        providerCalled = true;
        return verification(input);
      },
    });
    const result = await client.check({ candidate_ref: "candidate-a" });
    assert.equal(result.disposition, "could_not_check");
    assert.equal(providerCalled, false);
    const audit = client.inspect(result.check_ref, "audit");
    assert.deepEqual(audit.diagnostics, [
      { code: "candidate_resolution_failed" },
    ]);
  }
});

test("modified profile checks cannot retain an old claimed source digest", () => {
  const modifiedAction = JSON.parse(
    contract.profiles.action.source_json,
  );
  modifiedAction.checks[0].expected_path = "/resolver-selected-path";
  assert.throws(
    () => createPinnedWebChangeContract({
      id: contract.id,
      version: contract.version,
      protocol_version: contract.protocol_version,
      transition_id: contract.transition_id,
      expected_root: contract.expected_root,
      profiles: {
        ...contract.profiles,
        action: {
          ...contract.profiles.action,
          source_json: `${JSON.stringify(modifiedAction, null, 2)}\n`,
        },
      },
      requirements: contract.requirements,
      non_conclusions: contract.non_conclusions,
    }),
    /source_digest does not match the exact pinned profile JSON bytes/u,
  );
});

test("the pinned contract cannot name a protocol the client does not execute", () => {
  assert.throws(
    () => createPinnedWebChangeContract({
      id: contract.id,
      version: contract.version,
      protocol_version: "riddle-proof.browser-transition-protocol.v99",
      transition_id: contract.transition_id,
      expected_root: contract.expected_root,
      profiles: contract.profiles,
      requirements: contract.requirements,
      non_conclusions: contract.non_conclusions,
    }),
    /contract\.protocol_version must be riddle-proof\.browser-transition-protocol\.v3/u,
  );
});

test("verification bindings cannot be substituted by a report provider", async () => {
  const { client } = clientFor("conforms", {
    report: (input) => ({
      ...verification(input),
      subject: {
        ...input.candidate.subject,
        digest: digest("e"),
      },
    }),
  });
  const result = await client.check({ candidate_ref: "candidate-a" });
  assert.equal(result.disposition, "could_not_check");
  const audit = client.inspect(result.check_ref, "audit");
  assert.deepEqual(audit.diagnostics, [
    { code: "subject_binding_mismatch" },
  ]);
});

test("a report provider cannot author disposition, prose, or repair guidance", async () => {
  const { client } = clientFor("conforms", {
    report: (input) => ({
      disposition: "conforms",
      current: true,
      summary: "Provider says everything is perfect.",
      identity: {
        proof_id: "provider-proof",
        authority: authorityRef(input.authority),
        spec: input.authority.specification.ref,
        subject: input.candidate.subject,
        root_certificate_id: "provider-root",
      },
      expected_root: input.authority.specification.expected_root,
      observed_root: input.authority.specification.expected_root,
      expected_root_established: true,
      findings: [],
      repair_guidance: ["Trust provider prose."],
      non_conclusions: [],
      diagnostics: [],
      verification: {
        kind: "checked_meaning_replay",
        status: "verified",
      },
      explanation: null,
    }),
  });
  const result = await client.check({ candidate_ref: "candidate-a" });
  assert.equal(result.disposition, "could_not_check");
  assert.equal(
    result.headline,
    "This candidate could not be checked.",
  );
  assert.equal(JSON.stringify(result).includes("Provider says"), false);
  const audit = client.inspect(result.check_ref, "audit");
  assert.deepEqual(audit.diagnostics, [
    { code: "verification_shape_invalid" },
  ]);
});

test("invalid root establishment and evidence linkage fail closed", async () => {
  const mutations = [
    {
      diagnostic: "expected_root_establishment_inconsistent",
      mutate(value, input) {
        value.proof_root.claim = input.authority.specification.expected_root;
        value.proof_root.expected_root_established = false;
      },
    },
    {
      diagnostic: "requirement_coverage_invalid",
      mutate(value) {
        value.requirements[0].evidence_ids = ["not-in-frontier"];
      },
    },
  ];
  for (const { diagnostic, mutate } of mutations) {
    const { client } = clientFor("does_not_conform", {
      report(input) {
        const supplied = verification(input, "does_not_conform");
        mutate(supplied, input);
        return supplied;
      },
    });
    const result = await client.check({
      candidate_ref: `candidate-${diagnostic}`,
    });
    assert.equal(result.disposition, "could_not_check");
    const audit = client.inspect(result.check_ref, "audit");
    assert.deepEqual(audit.diagnostics, [{ code: diagnostic }]);
  }
});

test("outcome and meaning hide proof plumbing while audit can expand it", async () => {
  const { client } = clientFor("does_not_conform");
  const result = await client.check({ candidate_ref: "candidate-a" });
  assert.equal(result.headline, "This candidate is not yet in spec.");
  assert.match(result.next_action, /Persist the changed state/u);

  const meaning = client.inspect(result.check_ref, "meaning");
  assert.equal(meaning.findings.length, 1);
  assert.equal(JSON.stringify(result).includes("sha256:"), false);
  assert.equal(JSON.stringify(meaning).includes("sha256:"), false);

  const audit = client.inspect(result.check_ref, "audit");
  assert.equal(JSON.stringify(audit).includes("sha256:"), true);
  assert.equal(audit.subject.kind, "browser_target_transition");
  assert.equal(audit.proof_id, "proof-1");
  assert.equal(
    audit.profile_digests.reload,
    candidate().profiles.reload.profile_digest,
  );
});

test("the four application dispositions receive narrow next actions", async () => {
  const expected = {
    conforms: {
      headline: "This candidate matches the requested change.",
      next: /No repair is needed/u,
    },
    does_not_conform: {
      headline: "This candidate is not yet in spec.",
      next: /Persist the changed state/u,
    },
    stale: {
      headline: "The last check is out of date.",
      next: /Prepare a fresh attempt/u,
    },
    could_not_check: {
      headline: "This candidate could not be checked.",
      next: /Restore the check environment/u,
    },
  };
  for (const [disposition, expectation] of Object.entries(expected)) {
    const { client } = clientFor(disposition);
    const result = await client.check({ candidate_ref: disposition });
    assert.equal(result.disposition, disposition);
    assert.equal(result.headline, expectation.headline);
    assert.match(result.next_action, expectation.next);
  }
});
