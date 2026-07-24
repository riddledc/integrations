import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
} from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { normalizeRiddleProofProfile } from "@riddledc/riddle-proof-core";

import {
  PINNED_CTA_CHANGE_CONTRACT,
  createLocalCtaBrowserReportProvider,
  createProofGuidedCtaChangeClient,
  createResolvedCtaCandidate,
  deriveCtaAttemptAuthority,
} from "../dist/src/index.js";

const resolution = {
  candidate_ref: "candidate-1",
  scope: {
    repository: "synthetic/cta-site",
    revision: "revision-1",
    environment: "test",
    target: "https://example.invalid/",
  },
};

function unresolvedVerification(input) {
  return {
    version: "riddle-proof.application-verification.v1",
    verification_kind: "checked_meaning_replay",
    status: "unresolved",
    proof_id: `rpsc_${"1".repeat(64)}`,
    authority: {
      authority_id: input.authority.authority_id,
      authority_version: input.authority.authority_version,
      authority_digest: input.authority.authority_digest,
    },
    diagnostic_code: "synthetic_unavailable",
  };
}

test("resolved CTA profiles are stable normalized fixed points with exact digests", () => {
  const candidate = createResolvedCtaCandidate({
    contract: PINNED_CTA_CHANGE_CONTRACT,
    candidate_ref: resolution.candidate_ref,
    scope: resolution.scope,
  });
  const onceNormalized = JSON.parse(
    JSON.stringify(normalizeRiddleProofProfile(
      candidate.profile.normalized_profile,
      { url: resolution.scope.target },
    )),
  );
  const twiceNormalized = JSON.parse(
    JSON.stringify(normalizeRiddleProofProfile(
      onceNormalized,
      { url: resolution.scope.target },
    )),
  );
  assert.deepEqual(
    onceNormalized,
    candidate.profile.normalized_profile,
    "the browser runner's next normalization pass must preserve the candidate profile",
  );
  assert.deepEqual(twiceNormalized, onceNormalized);
  assert.equal(
    candidate.profile.profile_digest,
    `sha256:${createHash("sha256")
      .update(JSON.stringify(candidate.profile.normalized_profile, null, 2))
      .digest("hex")}`,
  );

  const rawNormalized = normalizeRiddleProofProfile(
    JSON.parse(PINNED_CTA_CHANGE_CONTRACT.profile.source_json),
    { url: resolution.scope.target },
  );
  assert.notDeepEqual(
    rawNormalized,
    candidate.profile.normalized_profile,
    "this regression fixture must retain the non-idempotent first normalization pass",
  );
});

test("candidate-ref-only client pins contract, profile, and derived authority", async () => {
  let providerInput;
  const client = createProofGuidedCtaChangeClient({
    contract: PINNED_CTA_CHANGE_CONTRACT,
    candidate_resolver: {
      async resolve(input) {
        assert.deepEqual(Object.keys(input).sort(), [
          "candidate_ref",
          "contract",
        ]);
        assert.equal(input.contract, client.contract);
        return resolution;
      },
    },
    report_provider: {
      async check(input) {
        providerInput = input;
        return unresolvedVerification(input);
      },
    },
  });

  const outcome = await client.check({ candidate_ref: "candidate-1" });
  assert.equal(outcome.disposition, "could_not_check");
  assert.equal(providerInput.candidate.candidate_ref, "candidate-1");
  assert.equal(
    providerInput.candidate.profile.profile_name,
    "cta-route-layout-runtime-conformance-v1",
  );
  assert.equal(
    providerInput.authority.specification.expected_root.claim_id,
    "riddle-proof.browser.sealed-profile-satisfied",
  );
  assert.equal(
    providerInput.authority.specification.expected_root.parameters
      .profile_digest,
    providerInput.candidate.profile.profile_digest,
  );
  assert.deepEqual(
    providerInput.authority.specification.requirements.map(
      ({ requirement_id }) => requirement_id,
    ),
    [
      "primary-cta-correct",
      "routes-preserved",
      "responsive-layout-healthy",
      "runtime-healthy",
    ],
  );
  assert.equal(Object.isFrozen(client.contract), true);
  assert.equal(Object.isFrozen(providerInput.authority), true);
});

test("the local provider independently rejects injected authority before browser work", async () => {
  const artifactRoot = mkdtempSync(
    path.join(os.tmpdir(), "riddle-cta-provider-authority-"),
  );
  chmodSync(artifactRoot, 0o700);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const provider = createLocalCtaBrowserReportProvider({
    artifacts_directory: artifactRoot,
    signing_key: {
      key_id: "cta-authority-boundary-key",
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
      collector_id: "cta-authority-boundary",
      collector_version: "1",
      implementation_digest: `sha256:${"7".repeat(64)}`,
    },
    source_for() {
      throw new Error("provider must reject before source or browser work");
    },
  });
  const candidate = createResolvedCtaCandidate({
    contract: PINNED_CTA_CHANGE_CONTRACT,
    candidate_ref: "candidate-authority-boundary",
    scope: {
      repository: "synthetic/cta-site",
      revision: "authority-boundary-revision",
      environment: "test",
      target: "http://127.0.0.1:9/",
    },
  });
  const authority = deriveCtaAttemptAuthority({
    contract: PINNED_CTA_CHANGE_CONTRACT,
    candidate,
  });
  try {
    for (const injectedAuthority of [
      {
        ...authority,
        authority_digest: `sha256:${"0".repeat(64)}`,
      },
      {
        ...authority,
        specification: {
          ...authority.specification,
          ref: {
            ...authority.specification.ref,
            digest: `sha256:${"1".repeat(64)}`,
          },
        },
      },
    ]) {
      await assert.rejects(
        provider.check({
          contract: PINNED_CTA_CHANGE_CONTRACT,
          candidate,
          authority: injectedAuthority,
        }),
        /authority must be derived from the exact pinned contract and candidate/u,
      );
    }
    assert.deepEqual(
      readdirSync(artifactRoot),
      [],
      "authority injection must fail before any attempt directory or browser work",
    );
  } finally {
    rmSync(artifactRoot, { recursive: true, force: true });
  }
});

test("ordinary callers cannot add target, profile, or contract authority", async () => {
  const client = createProofGuidedCtaChangeClient({
    contract: PINNED_CTA_CHANGE_CONTRACT,
    candidate_resolver: {
      async resolve() {
        return resolution;
      },
    },
    report_provider: {
      async check(input) {
        return unresolvedVerification(input);
      },
    },
  });
  await assert.rejects(
    client.check({
      candidate_ref: "candidate-1",
      target: "https://attacker.invalid/",
    }),
    /may contain only/,
  );
});

test("resolver authority expansion is rejected before the report provider", async () => {
  let providerCalled = false;
  const client = createProofGuidedCtaChangeClient({
    contract: PINNED_CTA_CHANGE_CONTRACT,
    candidate_resolver: {
      async resolve() {
        return {
          ...resolution,
          profile: { profile_name: "permissive" },
        };
      },
    },
    report_provider: {
      async check(input) {
        providerCalled = true;
        return unresolvedVerification(input);
      },
    },
  });
  const outcome = await client.check({ candidate_ref: "candidate-1" });
  assert.equal(outcome.disposition, "could_not_check");
  assert.equal(providerCalled, false);
  assert.deepEqual(
    client.inspect(outcome.check_ref, "audit").diagnostics,
    [{ code: "candidate_resolution_failed" }],
  );
});
