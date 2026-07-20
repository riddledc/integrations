import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";

import {
  RIDDLE_PROOF_HUMAN_ATTESTATION_VERSION,
  createRiddleProofHumanAttestation,
  createRiddleProofHumanAttestationGroundingRecipe,
  verifyRiddleProofHumanAttestation,
} from "./dist/human-attestation.js";
import { createRiddleProofSignedCaptureBundle } from "./dist/grounded-evidence.js";

const sha256 = (character) => `sha256:${character.repeat(64)}`;
const nonce = (byte) => Buffer.alloc(32, byte).toString("base64url");

function keyMaterial(keyId) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateDer = privateKey.export({ format: "der", type: "pkcs8" });
  const publicDer = publicKey.export({ format: "der", type: "spki" });
  return {
    signing_key: {
      key_id: keyId,
      private_key_pkcs8_base64: privateDer.toString("base64"),
    },
    registration: {
      actor_id: `actor:${keyId}`,
      actor_type: "human",
      key_id: keyId,
      public_key_spki_base64: publicDer.toString("base64"),
      public_key_spki_sha256: `sha256:${createHash("sha256").update(publicDer).digest("hex")}`,
      allowed_kinds: ["submitted_for_legal_review"],
    },
  };
}

const submitter = keyMaterial("legal-submitter-key");
const lawyer = keyMaterial("lawyer-approval-key");
lawyer.registration.actor_id = "actor:lawyer-1";
lawyer.registration.allowed_kinds = ["submitted_for_legal_review", "legal_approved"];

const submissionBody = {
  version: RIDDLE_PROOF_HUMAN_ATTESTATION_VERSION,
  kind: "submitted_for_legal_review",
  snapshot_id: `rpds_${"1".repeat(43)}`,
  manifest_digest: sha256("2"),
  packet_receipt_id: `rprr_${"3".repeat(43)}`,
  packet_digest: sha256("4"),
  packet_complete_certificate_id: `rpsc_${"5".repeat(64)}`,
  issued_at: "2026-07-19T20:00:00.000Z",
  nonce: nonce(7),
};

const submissionRecipeA = createRiddleProofHumanAttestationGroundingRecipe(submissionBody);
const submissionRecipeB = createRiddleProofHumanAttestationGroundingRecipe({ ...submissionBody });
assert.deepEqual(submissionRecipeA, submissionRecipeB);
assert.equal(JSON.parse(submissionRecipeA.body_json).snapshot_id, submissionBody.snapshot_id);
assert.equal(submissionRecipeA.artifact.role, "human_attestation");
assert.equal(submissionRecipeA.sensor.kind, "human");

const submission = createRiddleProofHumanAttestation({
  body: submissionBody,
  signing_key: submitter.signing_key,
});
assert.equal(submission.ok, true);
if (!submission.ok) throw new Error(submission.error.message);

function verify(bundle, expectedBody, registry = [submitter.registration]) {
  return verifyRiddleProofHumanAttestation({
    bundle,
    expected_body: expectedBody,
    actor_registry: registry,
    verification_time: "2026-07-19T20:03:00.000Z",
    max_attestation_age_ms: 5 * 60 * 1000,
    max_future_skew_ms: 1000,
  });
}

const verifiedSubmission = verify(submission.bundle, submissionBody);
assert.equal(verifiedSubmission.ok, true);
if (!verifiedSubmission.ok) throw new Error(verifiedSubmission.error.message);
assert.equal(verifiedSubmission.actor.actor_id, submitter.registration.actor_id);
assert.equal(verifiedSubmission.actor.actor_type, "human");
assert.equal(verifiedSubmission.body.kind, "submitted_for_legal_review");
assert.equal(Object.hasOwn(verifiedSubmission.body, "actor_id"), false);

const legalApprovalBody = {
  ...submissionBody,
  kind: "legal_approved",
  issued_at: "2026-07-19T20:02:00.000Z",
  nonce: nonce(8),
};
const legalApproval = createRiddleProofHumanAttestation({
  body: legalApprovalBody,
  signing_key: lawyer.signing_key,
});
assert.equal(legalApproval.ok, true);
if (!legalApproval.ok) throw new Error(legalApproval.error.message);
const verifiedApproval = verify(legalApproval.bundle, legalApprovalBody, [lawyer.registration]);
assert.equal(verifiedApproval.ok, true);
if (!verifiedApproval.ok) throw new Error(verifiedApproval.error.message);
assert.equal(verifiedApproval.actor.actor_id, "actor:lawyer-1");
assert.equal(verifiedApproval.body.kind, "legal_approved");

const submitOnlyApproval = createRiddleProofHumanAttestation({
  body: legalApprovalBody,
  signing_key: submitter.signing_key,
});
assert.equal(submitOnlyApproval.ok, true);
if (!submitOnlyApproval.ok) throw new Error(submitOnlyApproval.error.message);
const deniedApproval = verify(submitOnlyApproval.bundle, legalApprovalBody);
assert.equal(deniedApproval.ok, false);
if (deniedApproval.ok) throw new Error("submit-only signer unexpectedly approved");
assert.equal(deniedApproval.error.code, "kind_not_allowed");

const agentRegistration = {
  ...submitter.registration,
  actor_type: "agent",
  allowed_kinds: ["submitted_for_legal_review", "legal_approved"],
};
const agentDenied = verify(submission.bundle, submissionBody, [agentRegistration]);
assert.equal(agentDenied.ok, false);
if (agentDenied.ok) throw new Error("agent unexpectedly made human attestation");
assert.equal(agentDenied.error.code, "actor_not_human");

const stranger = keyMaterial("stranger-key");
const unlisted = verify(submission.bundle, submissionBody, [stranger.registration]);
assert.equal(unlisted.ok, false);
if (unlisted.ok) throw new Error("unlisted key unexpectedly verified");
assert.equal(unlisted.error.code, "signer_unlisted");

const aliasedSubmitterKey = {
  ...submitter.registration,
  actor_id: "actor:aliased-submitter",
  key_id: "aliased-submitter-key-id",
  allowed_kinds: ["submitted_for_legal_review", "legal_approved"],
};
const duplicateFingerprint = verify(
  submission.bundle,
  submissionBody,
  [submitter.registration, aliasedSubmitterKey],
);
assert.equal(duplicateFingerprint.ok, false, "one key must not acquire authority through an alias");
if (duplicateFingerprint.ok) throw new Error("duplicate key fingerprint unexpectedly verified");
assert.equal(duplicateFingerprint.error.code, "invalid_input");

function resign(changes) {
  const changed = createRiddleProofHumanAttestation({
    body: { ...submissionBody, ...changes },
    signing_key: submitter.signing_key,
  });
  assert.equal(changed.ok, true);
  if (!changed.ok) throw new Error(changed.error.message);
  return changed.bundle;
}

for (const [name, bundle] of [
  ["snapshot", resign({ snapshot_id: `rpds_${"a".repeat(43)}` })],
  ["manifest", resign({ manifest_digest: sha256("b") })],
  ["packet receipt", resign({ packet_receipt_id: `rprr_${"c".repeat(43)}` })],
  ["packet digest", resign({ packet_digest: sha256("d") })],
  ["packet certificate", resign({ packet_complete_certificate_id: `rpsc_${"e".repeat(64)}` })],
  ["kind", resign({ kind: "legal_approved" })],
]) {
  const result = verify(bundle, submissionBody);
  assert.equal(result.ok, false, `${name} tampering must fail`);
}

const byteTampered = structuredClone(submission.bundle);
const decodedBody = JSON.parse(
  Buffer.from(byteTampered.inline_artifacts[0].bytes_base64, "base64").toString("utf8"),
);
decodedBody.snapshot_id = `rpds_${"f".repeat(43)}`;
byteTampered.inline_artifacts[0].bytes_base64 = Buffer.from(
  JSON.stringify(decodedBody),
  "utf8",
).toString("base64");
const byteTamperResult = verify(byteTampered, submissionBody);
assert.equal(byteTamperResult.ok, false);
if (byteTamperResult.ok) throw new Error("byte tampering unexpectedly verified");
assert.equal(byteTamperResult.error.code, "grounding_failed");

const contentInjection = createRiddleProofHumanAttestation({
  body: { ...submissionBody, clause_text: "privileged contract language" },
  signing_key: submitter.signing_key,
});
assert.equal(contentInjection.ok, false);
if (contentInjection.ok) throw new Error("unexpected privileged body field was accepted");
assert.equal(contentInjection.error.code, "invalid_body");

const extraArtifactBundle = createRiddleProofSignedCaptureBundle({
  scope: submission.recipe.scope,
  nonce: submission.body.nonce,
  captured_at: submission.body.issued_at,
  collector: submission.recipe.collector,
  sensor: submission.recipe.sensor,
  verifier: submission.recipe.verifier_ref,
  artifacts: [
    submission.recipe.artifact,
    {
      artifact_id: "privileged-extra",
      role: "unexpected_content",
      media_type: "text/plain",
      bytes_base64: Buffer.from("privileged contract language", "utf8").toString("base64"),
    },
  ],
  signing_key: submitter.signing_key,
});
assert.equal(extraArtifactBundle.ok, true);
if (!extraArtifactBundle.ok) throw new Error(extraArtifactBundle.error.message);
const extraArtifactResult = verify(extraArtifactBundle.bundle, submissionBody);
assert.equal(extraArtifactResult.ok, false);
if (extraArtifactResult.ok) throw new Error("extra privileged artifact unexpectedly verified");
assert.equal(extraArtifactResult.error.code, "body_mismatch");

process.stdout.write(`${JSON.stringify({
  ok: true,
  submission_actor: verifiedSubmission.actor.actor_id,
  approval_actor: verifiedApproval.actor.actor_id,
  tamper_cases: 7,
})}\n`);
