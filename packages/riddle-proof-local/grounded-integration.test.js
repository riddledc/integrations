import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as grounded from "../riddle-proof-core/dist/grounded-evidence.js";
import {
  captureDocumentSnapshot,
  createDocumentSnapshotGroundingRecipe,
} from "./dist/index.js";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(packageRoot, "fixtures", "document-set");
const capturedAt = "2026-07-19T20:00:00.000Z";
const receipt = await captureDocumentSnapshot({
  files: [
    { role: "source", path: join(fixtureRoot, "source.txt") },
    { role: "template", path: join(fixtureRoot, "template.txt") },
    { role: "working", path: join(fixtureRoot, "working.txt") },
    { role: "rendered", path: join(fixtureRoot, "rendered.pdf") },
  ],
  capturedAt,
});
const recipe = createDocumentSnapshotGroundingRecipe(receipt);
const verifier = grounded.createRiddleProofGroundedDeclarativeJsonVerifier(
  recipe.verifier_definition,
);
assert.equal(verifier.ok, true, verifier.ok ? undefined : verifier.error.message);
const contract = grounded.createRiddleProofGroundedDeclarativeJsonContract(
  recipe.contract_definition,
);
assert.equal(contract.ok, true, contract.ok ? undefined : contract.error.message);

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyBytes = privateKey.export({ format: "der", type: "pkcs8" });
const publicKeyBytes = publicKey.export({ format: "der", type: "spki" });
const publicKeyFingerprint = `sha256:${createHash("sha256").update(publicKeyBytes).digest("hex")}`;
const scope = {
  repository: "synthetic/local-document-set",
  revision: receipt.snapshot.snapshot_id,
  environment: "local-read-only",
  target: "selected-document-snapshot",
  proof_attempt: "synthetic-document-set-1",
};
const collector = {
  collector_id: "riddle-proof.local-document-snapshot",
  collector_version: "1",
  implementation_digest: `sha256:${"4".repeat(64)}`,
};
const sensor = {
  kind: "other",
  name: "local-filesystem-read-only",
  version: "1",
  observed_target: "selected-document-snapshot",
  metadata: { source_mutation: false },
};
const nonce = Buffer.alloc(32, 19).toString("base64url");
assert.equal(verifier.ok, true);
const created = grounded.createRiddleProofSignedCaptureBundle({
  scope,
  nonce,
  captured_at: capturedAt,
  collector,
  sensor,
  verifier: verifier.verifier_ref,
  artifacts: recipe.artifacts,
  signing_key: {
    key_id: "synthetic-local-test-key",
    private_key_pkcs8_base64: privateKeyBytes.toString("base64"),
  },
});
assert.equal(created.ok, true, created.ok ? undefined : created.error.message);
const policy = {
  expected_scope: scope,
  expected_nonce: nonce,
  expected_collector: collector,
  expected_sensor: sensor,
  expected_verifier: verifier.verifier_ref,
  expected_signer: {
    key_id: "synthetic-local-test-key",
    public_key_spki_sha256: publicKeyFingerprint,
  },
  verification_time: "2026-07-19T20:00:01.000Z",
  max_capture_age_ms: 60_000,
  max_future_skew_ms: 1_000,
  required_artifact_roles: ["document_snapshot_observation"],
};
const trustedSigners = [{
  key_id: "synthetic-local-test-key",
  public_key_spki_base64: publicKeyBytes.toString("base64"),
}];
const certification = grounded.createRiddleProofGroundedSemanticCertificate({
  bundle: created.bundle,
  policy,
  trusted_signers: trustedSigners,
  verifier_registry: [verifier.registration],
  contract_registry: [contract.registration],
  expected_contract: contract.contract_ref,
  issued_at: policy.verification_time,
});
assert.equal(certification.ok, true, certification.ok ? undefined : certification.error.message);
assert.equal(certification.grounding.receipt.observation.snapshot_id, receipt.snapshot.snapshot_id);

const tamperedBundle = structuredClone(created.bundle);
tamperedBundle.inline_artifacts[0].bytes_base64 = Buffer.from(
  recipe.observation_json.replace(receipt.snapshot.snapshot_id, `rpds_${"x".repeat(43)}`),
).toString("base64");
const tampered = grounded.verifyRiddleProofSignedCaptureBundle({
  bundle: tamperedBundle,
  policy,
  trusted_signers: trustedSigners,
  verifier_registry: [verifier.registration],
});
assert.equal(tampered.ok, false, "changing deterministic observation bytes must break grounding");

console.log("riddle proof local -> grounded core integration passed", {
  snapshot_id: receipt.snapshot.snapshot_id,
  certificate_id: certification.certificate.certificate_id,
  tamper_rejected: true,
});
