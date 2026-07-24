import assert from "node:assert/strict";
import test from "node:test";

import {
  APPLICATION_PROOF_ENVELOPE_VERSION,
  APPLICATION_VERIFICATION_VERSION,
  applicationAuthorityRef,
  createApplicationProofRuntime,
  createInMemoryApplicationProofStore,
  inspectApplicationResult,
  projectApplicationResult,
} from "../dist/src/index.js";

const digest = (character) => `sha256:${character.repeat(64)}`;
const timestamp = "2026-07-23T20:00:00.000Z";

const authority = {
  authority_id: "example-authority",
  authority_version: "1",
  authority_digest: digest("a"),
  specification: {
    ref: {
      id: "example-spec",
      version: "1",
      digest: digest("b"),
    },
    expected_root: {
      claim_id: "example.subject-conforms",
      claim_version: "1",
      parameters: { policy: "example-spec@1" },
    },
    requirements: [
      {
        requirement_id: "identity",
        label: "The subject has the expected identity",
        failure_summary: "The subject identity does not match.",
        repair_guidance: "Use the expected subject identity.",
      },
      {
        requirement_id: "amount",
        label: "The amount is internally consistent",
        failure_summary: "The amount is not internally consistent.",
        repair_guidance: "Recalculate the amount.",
      },
    ],
    non_conclusions: [
      "This check does not establish facts outside the captured subject.",
    ],
  },
};

const subject = {
  id: "subject-1",
  kind: "synthetic_record",
  digest: digest("c"),
};

const authorityReference = applicationAuthorityRef(authority);

function explanation(rootCertificateId = "cert-root") {
  return {
    root_certificate_id: rootCertificateId,
    node_count: 1,
    grounded_leaf_count: 1,
    checked_composition_count: 0,
    node_certificate_ids: [rootCertificateId],
    grounded_frontier: [
      {
        certificate_id: rootCertificateId,
        bundle_id: "bundle-1",
        receipt_id: "receipt-1",
        statement_digest: digest("d"),
        artifact_manifest_digest: digest("e"),
        observation_digest: digest("f"),
        captured_at: timestamp,
      },
    ],
  };
}

function positiveVerification(overrides = {}) {
  return {
    version: APPLICATION_VERIFICATION_VERSION,
    verification_kind: "checked_meaning_replay",
    status: "verified",
    proof_id: "proof-1",
    authority: structuredClone(authorityReference),
    spec: structuredClone(authority.specification.ref),
    subject: structuredClone(subject),
    replayed_at: timestamp,
    proof_root: {
      root_certificate_id: "cert-root",
      claim: structuredClone(authority.specification.expected_root),
      expected_root_established: true,
    },
    currentness: {
      status: "current",
      consumption_time: timestamp,
    },
    requirements: [
      {
        requirement_id: "identity",
        status: "satisfied",
        evidence_ids: ["cert-root"],
      },
      {
        requirement_id: "amount",
        status: "satisfied",
        evidence_ids: ["cert-root"],
      },
    ],
    explanation: explanation(),
    ...overrides,
  };
}

function negativeVerification(overrides = {}) {
  return {
    ...positiveVerification(),
    proof_root: {
      root_certificate_id: "cert-negative",
      claim: {
        claim_id: "example.requirements-evaluated",
        claim_version: "1",
        parameters: { policy: "example-spec@1" },
      },
      expected_root_established: false,
    },
    requirements: [
      {
        requirement_id: "identity",
        status: "satisfied",
        evidence_ids: ["cert-negative"],
      },
      {
        requirement_id: "amount",
        status: "failed",
        evidence_ids: ["cert-negative"],
      },
    ],
    explanation: explanation("cert-negative"),
    ...overrides,
  };
}

test("projects a replayed positive root into a compact conforms result", () => {
  const result = projectApplicationResult({
    authority,
    subject,
    verification: positiveVerification(),
  });

  assert.equal(result.disposition, "conforms");
  assert.equal(result.current, true);
  assert.equal(result.expected_root_established, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.identity.proof_id, "proof-1");
  assert.equal(result.identity.root_certificate_id, "cert-root");
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.identity), true);
});

test("derives negative findings and repair guidance only from pinned definitions", () => {
  const result = projectApplicationResult({
    authority,
    subject,
    verification: negativeVerification(),
  });

  assert.equal(result.disposition, "does_not_conform");
  assert.equal(result.current, true);
  assert.deepEqual(result.findings, [
    {
      requirement_id: "amount",
      label: "The amount is internally consistent",
      failure_summary: "The amount is not internally consistent.",
      status: "failed",
      evidence_ids: ["cert-negative"],
      repair_guidance: "Recalculate the amount.",
    },
  ]);
  assert.deepEqual(result.repair_guidance, ["Recalculate the amount."]);
});

test("unresolved requirements fail closed without becoming findings", () => {
  const verification = negativeVerification({
    requirements: [
      {
        requirement_id: "identity",
        status: "satisfied",
        evidence_ids: ["cert-negative"],
      },
      {
        requirement_id: "amount",
        status: "unresolved",
        evidence_ids: [],
        diagnostic_code: "required_claim_absent",
      },
    ],
  });
  const result = projectApplicationResult({ authority, subject, verification });
  assert.equal(result.disposition, "could_not_check");
  assert.equal(result.current, false);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.repair_guidance, []);
  assert.deepEqual(result.diagnostics, [{ code: "requirement_unresolved" }]);
});

test("rejected replay and unresolved currentness cannot become current conclusions", () => {
  const rejected = projectApplicationResult({
    authority,
    subject,
    verification: {
      version: APPLICATION_VERIFICATION_VERSION,
      verification_kind: "checked_meaning_replay",
      status: "rejected",
      proof_id: "proof-1",
      authority: structuredClone(authorityReference),
      diagnostic_code: "signature_invalid",
    },
  });
  assert.equal(rejected.disposition, "could_not_check");
  assert.equal(rejected.current, false);

  const currentnessUnresolved = projectApplicationResult({
    authority,
    subject,
    verification: positiveVerification({
      currentness: {
        status: "unresolved",
        diagnostic_code: "consumer_clock_unavailable",
      },
    }),
  });
  assert.equal(currentnessUnresolved.disposition, "could_not_check");
  assert.equal(currentnessUnresolved.current, false);
});

test("a semantically resolved but stale proof is stale and exposes no findings", () => {
  const result = projectApplicationResult({
    authority,
    subject,
    verification: negativeVerification({
      currentness: {
        status: "stale",
        consumption_time: timestamp,
        stale_certificate_ids: ["cert-negative"],
      },
    }),
  });
  assert.equal(result.disposition, "stale");
  assert.equal(result.current, false);
  assert.deepEqual(result.findings, []);
});

test("stale does not rescue a report with no positive or negative basis", () => {
  const result = projectApplicationResult({
    authority,
    subject,
    verification: negativeVerification({
      currentness: {
        status: "stale",
        consumption_time: timestamp,
        stale_certificate_ids: ["cert-negative"],
      },
      requirements: [
        {
          requirement_id: "identity",
          status: "satisfied",
          evidence_ids: ["cert-negative"],
        },
        {
          requirement_id: "amount",
          status: "unresolved",
          evidence_ids: [],
          diagnostic_code: "required_claim_absent",
        },
      ],
    }),
  });
  assert.equal(result.disposition, "could_not_check");
  assert.equal(result.current, false);
});

test("missing, duplicate, and extra requirement results all fail closed", () => {
  const vectors = [
    positiveVerification({
      requirements: positiveVerification().requirements.slice(0, 1),
    }),
    positiveVerification({
      requirements: [
        positiveVerification().requirements[0],
        positiveVerification().requirements[0],
      ],
    }),
    positiveVerification({
      requirements: [
        ...positiveVerification().requirements,
        {
          requirement_id: "not-pinned",
          status: "satisfied",
          evidence_ids: ["cert-root"],
        },
      ],
    }),
  ];
  for (const verification of vectors) {
    const result = projectApplicationResult({ authority, subject, verification });
    assert.equal(result.disposition, "could_not_check");
    assert.deepEqual(result.diagnostics, [{ code: "requirement_coverage_invalid" }]);
  }
});

test("spec, subject, proof root, and frontier mismatches fail closed", () => {
  const vectors = [
    positiveVerification({
      spec: { ...authority.specification.ref, digest: digest("0") },
    }),
    positiveVerification({
      subject: { ...subject, digest: digest("1") },
    }),
    positiveVerification({
      proof_root: {
        ...positiveVerification().proof_root,
        root_certificate_id: "other-root",
      },
    }),
    positiveVerification({
      requirements: [
        {
          ...positiveVerification().requirements[0],
          evidence_ids: ["invented-evidence"],
        },
        positiveVerification().requirements[1],
      ],
    }),
  ];
  for (const verification of vectors) {
    assert.equal(
      projectApplicationResult({ authority, subject, verification }).disposition,
      "could_not_check",
    );
  }
});

test("the same specification replayed under a substituted authority fails closed", () => {
  const verification = positiveVerification({
    authority: {
      ...authorityReference,
      authority_digest: digest("0"),
    },
  });
  const result = projectApplicationResult({ authority, subject, verification });
  assert.equal(result.disposition, "could_not_check");
  assert.equal(result.current, false);
  assert.deepEqual(result.diagnostics, [{ code: "authority_binding_mismatch" }]);
  assert.deepEqual(result.identity.authority, authorityReference);
});

test("expected-root success cannot coexist with a failed requirement", () => {
  const verification = positiveVerification({
    requirements: [
      positiveVerification().requirements[0],
      {
        requirement_id: "amount",
        status: "failed",
        evidence_ids: ["cert-root"],
      },
    ],
  });
  const result = projectApplicationResult({ authority, subject, verification });
  assert.equal(result.disposition, "could_not_check");
  assert.deepEqual(result.diagnostics, [
    { code: "successful_root_conflicts_with_requirements" },
  ]);
});

test("accessor-backed and sparse verifier data fail closed", () => {
  const accessorBacked = positiveVerification();
  delete accessorBacked.proof_id;
  Object.defineProperty(accessorBacked, "proof_id", {
    enumerable: true,
    get: () => "proof-1",
  });
  const sparse = positiveVerification();
  sparse.requirements = new Array(2);
  sparse.requirements[0] = positiveVerification().requirements[0];

  for (const verification of [accessorBacked, sparse]) {
    const result = projectApplicationResult({ authority, subject, verification });
    assert.equal(result.disposition, "could_not_check");
    assert.deepEqual(result.diagnostics, [{ code: "verification_shape_invalid" }]);
  }
});

test("nested claim parameters reject accessors and symbol fields", () => {
  const accessorParameters = positiveVerification();
  Object.defineProperty(
    accessorParameters.proof_root.claim.parameters,
    "hidden",
    {
      enumerable: true,
      get() {
        return "producer-authored";
      },
    },
  );

  const symbolParameters = positiveVerification();
  Object.defineProperty(
    symbolParameters.proof_root.claim.parameters,
    Symbol("hidden"),
    {
      enumerable: true,
      value: "producer-authored",
    },
  );

  const proxiedParameters = positiveVerification();
  proxiedParameters.proof_root.claim.parameters = new Proxy(
    proxiedParameters.proof_root.claim.parameters,
    {},
  );

  for (const verification of [
    accessorParameters,
    symbolParameters,
    proxiedParameters,
  ]) {
    const result = projectApplicationResult({
      authority,
      subject,
      verification,
    });
    assert.equal(result.disposition, "could_not_check");
    assert.deepEqual(result.diagnostics, [
      { code: "verification_shape_invalid" },
    ]);
  }
});

test("progressive inspection preserves one exact proof identity", () => {
  const result = projectApplicationResult({
    authority,
    subject,
    verification: negativeVerification(),
  });
  const outcome = inspectApplicationResult(result, "outcome");
  const meaning = inspectApplicationResult(result, "meaning");
  const audit = inspectApplicationResult(result, "audit");

  assert.deepEqual(outcome.identity, meaning.identity);
  assert.deepEqual(meaning.identity, audit.identity);
  assert.equal("digest" in outcome.identity.specification, false);
  assert.equal("digest" in outcome.identity.subject, false);
  assert.equal("root_certificate_id" in outcome.identity, false);
  assert.equal("authority" in outcome.identity, false);
  assert.equal("findings" in outcome, false);
  assert.equal("expected_root" in meaning, false);
  assert.equal(audit.binding.root_certificate_id, "cert-negative");
  assert.deepEqual(audit.binding.authority, authorityReference);
  assert.equal("explanation" in meaning, false);
  assert.equal(audit.explanation.root_certificate_id, "cert-negative");
  assert.throws(
    () => inspectApplicationResult(result, "audti"),
    /Unsupported application inspection level/u,
  );
});

test("controller keeps authority, nonce, key, and verifier outside the run request", async () => {
  let verifierCalls = 0;
  let producerSawFrozenInputs = false;
  const store = createInMemoryApplicationProofStore();
  const configured = structuredClone(authority);
  const runtimeConfiguration = {
    authority: configured,
    clock: { now: () => timestamp },
    challenge_provider: {
      async issue() {
        return {
          challenge_id: "challenge-1",
          nonce: "secret-nonce",
          issued_at: timestamp,
          expires_at: "2026-07-23T21:00:00.000Z",
        };
      },
    },
    signing_key_provider: {
      async get() {
        return { key_handle: "local-key" };
      },
    },
    proof_producer: {
      async capture_and_prove(input) {
        producerSawFrozenInputs =
          Object.isFrozen(input.authority)
          && Object.isFrozen(input.subject)
          && Object.isFrozen(input.challenge);
        assert.throws(() => {
          input.subject.id = "producer-rebound-subject";
        }, TypeError);
        assert.throws(() => {
          input.challenge.challenge_id = "producer-rebound-challenge";
        }, TypeError);
        return {
          version: APPLICATION_PROOF_ENVELOPE_VERSION,
          proof_id: "proof-1",
          authority: structuredClone(authorityReference),
          spec: structuredClone(input.authority.specification.ref),
          subject: structuredClone(input.subject),
          challenge_id: input.challenge.challenge_id,
          produced_at: timestamp,
          payload: { checked_closure: "synthetic" },
        };
      },
    },
    verifier: {
      async verify(input) {
        verifierCalls += 1;
        assert.equal(input.envelope.payload.checked_closure, "synthetic");
        return positiveVerification({
          proof_id: input.envelope.proof_id,
          spec: structuredClone(input.envelope.spec),
          subject: structuredClone(input.envelope.subject),
        });
      },
    },
    store,
  };
  const runtime = createApplicationProofRuntime(runtimeConfiguration);

  configured.specification.ref.id = "mutated-after-construction";
  runtimeConfiguration.clock.now = () => "not-a-timestamp";
  runtimeConfiguration.verifier.verify = async () => ({
    version: APPLICATION_VERIFICATION_VERSION,
    verification_kind: "checked_meaning_replay",
    status: "rejected",
    proof_id: "proof-1",
    authority: structuredClone(authorityReference),
    diagnostic_code: "replacement-verifier-ran",
  });
  const result = await runtime.check({ subject });
  assert.equal(result.disposition, "conforms");
  assert.equal(result.identity.spec.id, "example-spec");
  assert.equal(producerSawFrozenInputs, true);
  assert.equal(verifierCalls, 1);
  assert.equal(JSON.stringify(result).includes("secret-nonce"), false);
  assert.equal(JSON.stringify(runtime.inspect(result, "audit")).includes("local-key"), false);

  const replayed = await runtime.verify("proof-1");
  assert.equal(replayed.disposition, "conforms");
  assert.equal(verifierCalls, 2);

  await assert.rejects(
    runtime.check({ subject, spec: authority.specification.ref }),
    /unsupported field spec/u,
  );
});

test("controller rejects a verifier result bound to another proof", async () => {
  const runtime = createApplicationProofRuntime({
    authority,
    clock: { now: () => timestamp },
    challenge_provider: {
      async issue() {
        return {
          challenge_id: "challenge-1",
          nonce: "secret-nonce",
          issued_at: timestamp,
        };
      },
    },
    signing_key_provider: { async get() { return "key"; } },
    proof_producer: {
      async capture_and_prove(input) {
        return {
          version: APPLICATION_PROOF_ENVELOPE_VERSION,
          proof_id: "proof-1",
          authority: structuredClone(authorityReference),
          spec: structuredClone(input.authority.specification.ref),
          subject: structuredClone(input.subject),
          challenge_id: input.challenge.challenge_id,
          produced_at: timestamp,
          payload: {},
        };
      },
    },
    verifier: {
      async verify() {
        return positiveVerification({ proof_id: "other-proof" });
      },
    },
    store: createInMemoryApplicationProofStore(),
  });
  const result = await runtime.check({ subject });
  assert.equal(result.disposition, "could_not_check");
  assert.deepEqual(result.diagnostics, [
    { code: "verification_proof_identity_mismatch" },
  ]);
});

test("controller rejects a verified replay bound to a substituted authority", async () => {
  const runtime = createApplicationProofRuntime({
    authority,
    clock: { now: () => timestamp },
    challenge_provider: {
      async issue() {
        return {
          challenge_id: "challenge-1",
          nonce: "secret-nonce",
          issued_at: timestamp,
        };
      },
    },
    signing_key_provider: { async get() { return "key"; } },
    proof_producer: {
      async capture_and_prove(input) {
        return {
          version: APPLICATION_PROOF_ENVELOPE_VERSION,
          proof_id: "proof-1",
          authority: applicationAuthorityRef(input.authority),
          spec: structuredClone(input.authority.specification.ref),
          subject: structuredClone(input.subject),
          challenge_id: input.challenge.challenge_id,
          produced_at: timestamp,
          payload: {},
        };
      },
    },
    verifier: {
      async verify() {
        return positiveVerification({
          authority: {
            ...authorityReference,
            authority_digest: digest("9"),
          },
        });
      },
    },
    store: createInMemoryApplicationProofStore(),
  });
  const result = await runtime.check({ subject });
  assert.equal(result.disposition, "could_not_check");
  assert.deepEqual(result.diagnostics, [{ code: "authority_binding_mismatch" }]);
  assert.deepEqual(result.identity.authority, authorityReference);
});

test("controller rejects a producer envelope rebound from its issued challenge", async () => {
  let verifierCalls = 0;
  const runtime = createApplicationProofRuntime({
    authority,
    clock: { now: () => timestamp },
    challenge_provider: {
      async issue() {
        return {
          challenge_id: "challenge-1",
          nonce: "secret-nonce",
          issued_at: timestamp,
        };
      },
    },
    signing_key_provider: { async get() { return "key"; } },
    proof_producer: {
      async capture_and_prove(input) {
        return {
          version: APPLICATION_PROOF_ENVELOPE_VERSION,
          proof_id: "proof-1",
          authority: structuredClone(authorityReference),
          spec: structuredClone(input.authority.specification.ref),
          subject: structuredClone(input.subject),
          challenge_id: "different-challenge",
          produced_at: timestamp,
          payload: {},
        };
      },
    },
    verifier: {
      async verify() {
        verifierCalls += 1;
        return positiveVerification();
      },
    },
    store: createInMemoryApplicationProofStore(),
  });

  const result = await runtime.check({ subject });
  assert.equal(result.disposition, "could_not_check");
  assert.deepEqual(result.diagnostics, [
    { code: "producer_challenge_binding_mismatch" },
  ]);
  assert.equal(verifierCalls, 0);
});

test("controller rejects a producer envelope rebound to another authority", async () => {
  let verifierCalls = 0;
  const runtime = createApplicationProofRuntime({
    authority,
    clock: { now: () => timestamp },
    challenge_provider: {
      async issue() {
        return {
          challenge_id: "challenge-1",
          nonce: "secret-nonce",
          issued_at: timestamp,
        };
      },
    },
    signing_key_provider: { async get() { return "key"; } },
    proof_producer: {
      async capture_and_prove(input) {
        return {
          version: APPLICATION_PROOF_ENVELOPE_VERSION,
          proof_id: "proof-1",
          authority: {
            ...applicationAuthorityRef(input.authority),
            authority_digest: digest("9"),
          },
          spec: structuredClone(input.authority.specification.ref),
          subject: structuredClone(input.subject),
          challenge_id: input.challenge.challenge_id,
          produced_at: timestamp,
          payload: {},
        };
      },
    },
    verifier: {
      async verify() {
        verifierCalls += 1;
        return positiveVerification();
      },
    },
    store: createInMemoryApplicationProofStore(),
  });

  const result = await runtime.check({ subject });
  assert.equal(result.disposition, "could_not_check");
  assert.deepEqual(result.diagnostics, [
    { code: "producer_authority_binding_mismatch" },
  ]);
  assert.deepEqual(result.identity.authority, authorityReference);
  assert.equal(verifierCalls, 0);
});
