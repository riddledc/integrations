import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as checked from "../riddle-proof-core/dist/checked-meaning.js";
import * as grounded from "../riddle-proof-core/dist/grounded-evidence.js";
import {
  captureDocumentSnapshot,
  createDocumentSnapshotGroundingRecipe,
} from "./dist/index.js";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(packageRoot, "fixtures", "amendment");
const capturedAt = "2026-07-19T20:00:00.000Z";
const verificationTime = "2026-07-19T20:00:01.000Z";

const documentReceipt = await captureDocumentSnapshot({
  files: [
    { role: "original", path: join(fixtureRoot, "original.txt") },
    { role: "template", path: join(fixtureRoot, "template.txt") },
    { role: "candidate", path: join(fixtureRoot, "candidate.txt") },
    { role: "rendered", path: join(fixtureRoot, "rendered.pdf") },
  ],
  capturedAt,
  label: "Synthetic amendment review packet",
});
const recipe = createDocumentSnapshotGroundingRecipe(documentReceipt);
const verifier = grounded.createRiddleProofGroundedDeclarativeJsonVerifier(
  recipe.verifier_definition,
);
const contract = grounded.createRiddleProofGroundedDeclarativeJsonContract(
  recipe.contract_definition,
);
assert.equal(verifier.ok, true, verifier.ok ? undefined : verifier.error.message);
assert.equal(contract.ok, true, contract.ok ? undefined : contract.error.message);

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyBytes = privateKey.export({ format: "der", type: "pkcs8" });
const publicKeyBytes = publicKey.export({ format: "der", type: "spki" });
const keyId = "synthetic-local-amendment-key";
const nonce = Buffer.alloc(32, 71).toString("base64url");
const scope = {
  repository: "synthetic/local-amendment",
  revision: documentReceipt.snapshot.snapshot_id,
  environment: "local-read-only",
  target: "selected-document-snapshot",
  proof_attempt: "synthetic-meaning-pyramid-1",
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
  observed_target: scope.target,
  metadata: { source_mutation: false },
};
const signed = grounded.createRiddleProofSignedCaptureBundle({
  scope,
  nonce,
  captured_at: capturedAt,
  collector,
  sensor,
  verifier: verifier.verifier_ref,
  artifacts: recipe.artifacts,
  signing_key: {
    key_id: keyId,
    private_key_pkcs8_base64: privateKeyBytes.toString("base64"),
  },
});
assert.equal(signed.ok, true, signed.ok ? undefined : signed.error.message);

const configuration = {
  policy: {
    expected_scope: scope,
    expected_nonce: nonce,
    expected_collector: collector,
    expected_sensor: sensor,
    expected_verifier: verifier.verifier_ref,
    expected_signer: {
      key_id: keyId,
      public_key_spki_sha256: `sha256:${createHash("sha256").update(publicKeyBytes).digest("hex")}`,
    },
    verification_time: verificationTime,
    max_capture_age_ms: 60_000,
    max_future_skew_ms: 1_000,
    required_artifact_roles: ["document_snapshot_observation"],
  },
  trusted_signers: [{
    key_id: keyId,
    public_key_spki_base64: publicKeyBytes.toString("base64"),
  }],
  verifier_registry: [verifier.registration],
  contract_registry: [contract.registration],
  expected_contract: contract.contract_ref,
};
const issued = grounded.createRiddleProofGroundedSemanticCertificate({
  bundle: signed.bundle,
  ...configuration,
  issued_at: verificationTime,
});
assert.equal(issued.ok, true, issued.ok ? undefined : issued.error.message);
const atomicGrounded = grounded.createRiddleProofGroundedSemanticAtomicCertificateClosure({
  certificate: issued.certificate,
  grounding: issued.grounding,
  configuration,
});
assert.equal(atomicGrounded.ok, true, atomicGrounded.ok ? undefined : atomicGrounded.error.message);
const replayContext = {
  certificate_id: issued.certificate.certificate_id,
  ...configuration,
};
const atomicChecked = checked.createRiddleProofCheckedMeaningAtomicClosure({
  grounded_closure: atomicGrounded.grounded_closure,
  replay_contexts: [replayContext],
});
assert.equal(atomicChecked.ok, true, atomicChecked.ok ? undefined : atomicChecked.error.message);

const anchorRule = checked.createRiddleProofCheckedMeaningRule({
  definition: {
    rule_id: "riddle-proof.local-amendment-snapshot-anchor",
    rule_version: "1",
    label: "A stable selected-file snapshot provides an immutable review anchor",
    premises: [{
      claim_id: "local-document-snapshot-captured",
      claim_version: "1",
    }],
    conclusion: {
      claim_id: "local-document-snapshot-anchor-available",
      claim_version: "1",
      label: "An immutable local document snapshot anchor is available",
    },
    constraints: {
      all_of: true,
      ordered_premise_chronology: true,
      max_age_ms: 60_000,
    },
  },
});
assert.equal(anchorRule.ok, true, anchorRule.ok ? undefined : anchorRule.error.message);
const anchored = checked.composeRiddleProofCheckedMeaningClosures({
  expected_rule: anchorRule.rule_ref,
  closures: [atomicChecked.checked_closure],
  issued_at: "2026-07-19T20:00:02.000Z",
  replay_contexts: [replayContext],
  rule_registry: [anchorRule.registration],
  trusted_rules: [anchorRule.rule_ref],
});
assert.equal(anchored.ok, true, anchored.ok ? undefined : anchored.error.message);

const handoffRule = checked.createRiddleProofCheckedMeaningRule({
  definition: {
    rule_id: "riddle-proof.local-amendment-handoff-anchor",
    rule_version: "1",
    label: "A content-addressed snapshot anchor can be handed off for review",
    premises: [{
      claim_id: "local-document-snapshot-anchor-available",
      claim_version: "1",
    }],
    conclusion: {
      claim_id: "local-amendment-handoff-anchor-available",
      claim_version: "1",
      label: "A replayable amendment handoff anchor is available for human review",
      parameters: {
        workflow: { op: "literal", value: "read-only-human-review" },
      },
    },
    constraints: {
      all_of: true,
      ordered_premise_chronology: true,
      max_age_ms: 60_000,
    },
  },
});
assert.equal(handoffRule.ok, true, handoffRule.ok ? undefined : handoffRule.error.message);
const registry = [anchorRule.registration, handoffRule.registration];
const trustedRules = [anchorRule.rule_ref, handoffRule.rule_ref];
const handoff = checked.composeRiddleProofCheckedMeaningClosures({
  expected_rule: handoffRule.rule_ref,
  closures: [anchored.checked_closure],
  issued_at: "2026-07-19T20:00:03.000Z",
  replay_contexts: [replayContext],
  rule_registry: registry,
  trusted_rules: trustedRules,
});
assert.equal(handoff.ok, true, handoff.ok ? undefined : handoff.error.message);
assert.equal(handoff.checked_closure.grounded_closure.groundings.length, 1);
assert.equal(handoff.checked_closure.rule_bindings.length, 2);

// A blind consumer receives serialized data plus independent trust inputs and
// can recover the exact root meaning without rerunning the local file read.
const serializedHandoff = JSON.parse(JSON.stringify(handoff.checked_closure));
const matched = checked.matchRiddleProofCheckedMeaningClosure({
  checked_closure: serializedHandoff,
  replay_contexts: JSON.parse(JSON.stringify([replayContext])),
  rule_registry: JSON.parse(JSON.stringify(registry)),
  trusted_rules: JSON.parse(JSON.stringify(trustedRules)),
  expected_root_certificate_id: handoff.certificate.certificate_id,
  expected_scope: scope,
  expected_claim: handoff.certificate.claim,
  expected_root_rule: handoffRule.rule_ref,
});
assert.equal(matched.ok, true, matched.ok ? undefined : matched.error.message);

const freshAtConsumption = checked.assessRiddleProofCheckedMeaningClosure({
  checked_closure: serializedHandoff,
  replay_contexts: [replayContext],
  rule_registry: registry,
  trusted_rules: trustedRules,
  consumption_time: "2026-07-19T20:00:10.000Z",
  max_grounded_age_ms: 10_000,
  max_future_skew_ms: 0,
});
assert.equal(freshAtConsumption.disposition, "checked");
const staleAtConsumption = checked.assessRiddleProofCheckedMeaningClosure({
  checked_closure: serializedHandoff,
  replay_contexts: [replayContext],
  rule_registry: registry,
  trusted_rules: trustedRules,
  consumption_time: "2026-07-19T20:00:10.001Z",
  max_grounded_age_ms: 10_000,
  max_future_skew_ms: 0,
});
assert.equal(staleAtConsumption.disposition, "stale");
assert.deepEqual(staleAtConsumption.stale_certificate_ids, [
  issued.certificate.certificate_id,
]);

const inventedRoot = JSON.parse(JSON.stringify(serializedHandoff));
const rootCertificate = inventedRoot.grounded_closure.closure.certificates.find(
  (certificate) => certificate.certificate_id
    === inventedRoot.grounded_closure.closure.root_certificate_id,
);
rootCertificate.claim.label = "Invented legal approval";
const invented = checked.matchRiddleProofCheckedMeaningClosure({
  checked_closure: inventedRoot,
  replay_contexts: [replayContext],
  rule_registry: registry,
  trusted_rules: trustedRules,
  expected_root_certificate_id: handoff.certificate.certificate_id,
  expected_scope: scope,
  expected_claim: handoff.certificate.claim,
  expected_root_rule: handoffRule.rule_ref,
});
assert.equal(invented.ok, false, "a rewritten high-level label must not survive replay");

console.log(JSON.stringify({
  ok: true,
  suite: "riddle-proof.local-amendment-meaning-pyramid",
  snapshot_id: documentReceipt.snapshot.snapshot_id,
  grounded_leaves: handoff.checked_closure.grounded_closure.groundings.length,
  checked_rules: handoff.checked_closure.rule_bindings.length,
  root_claim: handoff.certificate.claim.claim_id,
  root_certificate_id: handoff.certificate.certificate_id,
  blind_handoff_matched: true,
  fresh_at_exact_boundary: true,
  later_consumption_stale: true,
  invented_meaning_rejected: true,
}));
