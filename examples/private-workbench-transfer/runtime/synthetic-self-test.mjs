import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assessRiddleProofCheckedMeaningClosure,
  composeRiddleProofCheckedMeaningClosures,
  createRiddleProofCheckedMeaningAtomicClosure,
  matchRiddleProofCheckedMeaningClosure,
} from "@riddledc/riddle-proof-core/checked-meaning";
import {
  createRiddleProofEvidenceTrustRoot,
  materializeRiddleProofEvidenceTrustProfile,
  resolveRiddleProofEvidenceTrustRoot,
} from "@riddledc/riddle-proof-core/evidence-trust-root";
import {
  createRiddleProofGroundedDeclarativeJsonVerifier,
  createRiddleProofGroundedSemanticAtomicCertificateClosure,
  createRiddleProofGroundedSemanticCertificate,
  createRiddleProofSignedCaptureBundle,
} from "@riddledc/riddle-proof-core/grounded-evidence";
import {
  createRiddleProofPacketReceipt,
  digestRiddleProofExecution,
  digestRiddleProofExecutionPolicy,
  digestRiddleProofPrivatePacketBytes,
  RIDDLE_PROOF_PRIVATE_PACKET_VERSION,
  verifyRiddleProofPacketReceipt,
} from "@riddledc/riddle-proof-core/packet";
import {
  createRiddleProofRuleTrustRoot,
  resolveRiddleProofRuleTrustRoot,
} from "@riddledc/riddle-proof-core/rule-trust-root";
import {
  captureDocumentSnapshot,
  createDocumentSnapshotCurrentnessGroundingRecipe,
  createDocumentSnapshotGroundingRecipe,
  recaptureDocumentSnapshotCurrentness,
} from "@riddledc/riddle-proof-local";

import { DoctorFailure, doctorFail } from "../shared/failures.mjs";
import { canonicalJson } from "../shared/integrity.mjs";

const TIMES = Object.freeze({
  snapshot: "2026-07-19T20:00:00.000Z",
  snapshotCertificate: "2026-07-19T20:00:01.000Z",
  roles: "2026-07-19T20:00:01.500Z",
  rolesCertificate: "2026-07-19T20:00:02.000Z",
  artifactSetComposition: "2026-07-19T20:00:02.500Z",
  procedure: "2026-07-19T20:00:04.000Z",
  procedureCertificate: "2026-07-19T20:00:05.000Z",
  currentness: "2026-07-19T20:00:05.500Z",
  currentnessCertificate: "2026-07-19T20:00:06.000Z",
  executionCurrentComposition: "2026-07-19T20:00:06.250Z",
  composition: "2026-07-19T20:00:06.500Z",
  receipt: "2026-07-19T20:00:07.000Z",
  verification: "2026-07-19T20:00:08.000Z",
});

const PROTOCOL_VERSION = "synthetic-artifact-workflow-v1";
const DIAGNOSTIC_CLAIMS = Object.freeze({
  snapshot: "riddle-proof.diagnostic.snapshot-captured",
  roles: "riddle-proof.diagnostic.required-roles-present",
  procedure: "riddle-proof.diagnostic.workflow-observed",
  currentness: "riddle-proof.diagnostic.snapshot-current-at-check",
  conclusion: "riddle-proof.diagnostic.workflow-packet-complete",
});
const REQUIRED_ROLES = Object.freeze(["candidate", "criteria", "rendered", "source"]);
const SYNTHETIC_PRIVILEGED_SENTINEL = "SYNTHETIC_PRIVILEGED_CONTENT_DO_NOT_LOG_7b3619";
// Public test material only. This key has no authority over private client artifacts or evidence.
const SYNTHETIC_PRIVATE_KEY_PKCS8_BASE64 =
  "MC4CAQAwBQYDK2VwBCIEIF6T5U3kDogQYmxWDACw1EfqAvRKWc+2FVCwRD6R4qFK";
const SYNTHETIC_KEY_ID = "synthetic-offline-foundation-key";

function requireOk(result, code) {
  if (!result?.ok) doctorFail(code);
  return result;
}

function base64url(byte) {
  return Buffer.alloc(32, byte).toString("base64url");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function entryEvidenceLinksResolve(entries, certificateIds) {
  const resolved = new Set(certificateIds);
  return entries.every((entry) => (
    entry.evidence_certificate_ids.length > 0
    && entry.evidence_certificate_ids.every((certificateId) => resolved.has(certificateId))
  ));
}

function requiredRolesRecipe(snapshotReceipt) {
  const observedRoles = snapshotReceipt.snapshot.artifacts
    .map((artifact) => artifact.role)
    .sort((left, right) => left.localeCompare(right, "en"));
  const observation = {
    version: "riddle-proof.synthetic-required-artifact-roles.v1",
    snapshot_id: snapshotReceipt.snapshot.snapshot_id,
    manifest_digest: snapshotReceipt.snapshot.manifest_digest,
    required_roles: [...REQUIRED_ROLES],
    observed_roles: observedRoles,
    status: canonicalJson(observedRoles) === canonicalJson(REQUIRED_ROLES) ? "complete" : "incomplete",
  };
  const artifact = {
    artifact_id: "synthetic-required-artifact-roles.json",
    role: "required_artifact_roles",
    media_type: "application/json",
    bytes_base64: Buffer.from(canonicalJson(observation), "utf8").toString("base64"),
  };
  return {
    observation,
    artifacts: [artifact],
    verifier_definition: {
      verifier_id: "riddle-proof.synthetic-required-artifact-roles.declarative",
      verifier_version: "1",
      program: {
        artifact: {
          artifact_id: artifact.artifact_id,
          role: artifact.role,
          media_type: artifact.media_type,
        },
        pointer: "",
      },
    },
    contract_definition: {
      contract_id: "riddle-proof.synthetic-required-artifact-roles-observed.declarative",
      contract_version: "1",
      label: "The synthetic snapshot contains every required artifact role",
      claim: {
        claim_id: DIAGNOSTIC_CLAIMS.roles,
        claim_version: "1",
        label: "The synthetic snapshot contains every required artifact role",
        parameters: {
          snapshot_id: observation.snapshot_id,
          manifest_digest: observation.manifest_digest,
        },
      },
      program: {
        all: Object.entries(observation).map(([key, value]) => ({
          op: "equals",
          source: "observation",
          pointer: `/${key}`,
          value,
        })),
      },
    },
  };
}

function workflowRecipe(values) {
  const observation = {
    version: "riddle-proof.synthetic-workflow-observation.v1",
    subject_id: values.subjectId,
    subject_digest: values.subjectDigest,
    packet_digest: values.packetDigest,
    rule_trust_root_digest: values.ruleTrustRootDigest,
    evidence_trust_root_digest: values.evidenceTrustRootDigest,
    protocol_version: values.protocolVersion,
    execution_digest: values.executionDigest,
    execution_policy_digest: values.executionPolicyDigest,
    required_steps_ran: values.requiredStepsRan,
    entries_classified: values.entriesClassified,
    evidence_linked: values.evidenceLinked,
    uncertainties_disclosed: values.uncertaintiesDisclosed,
    substantive_correctness_established: false,
  };
  const artifact = {
    artifact_id: "synthetic-workflow-observation.json",
    role: "synthetic_workflow_observation",
    media_type: "application/json",
    bytes_base64: Buffer.from(canonicalJson(observation), "utf8").toString("base64"),
  };
  return {
    observation,
    artifacts: [artifact],
    verifier_definition: {
      verifier_id: "riddle-proof.synthetic-workflow-observation",
      verifier_version: "1",
      program: {
        artifact: {
          artifact_id: artifact.artifact_id,
          role: artifact.role,
          media_type: artifact.media_type,
        },
        pointer: "",
      },
    },
    contract_definition: {
      contract_id: "riddle-proof.synthetic-workflow-observed",
      contract_version: "1",
      label: "Synthetic workflow steps are complete",
      claim: {
        claim_id: DIAGNOSTIC_CLAIMS.procedure,
        claim_version: "1",
        label: "Synthetic workflow requirements were observed",
        parameters: {
          subject_id: values.subjectId,
          subject_digest: values.subjectDigest,
          packet_digest: values.packetDigest,
          rule_trust_root_digest: values.ruleTrustRootDigest,
          evidence_trust_root_digest: values.evidenceTrustRootDigest,
          protocol_version: values.protocolVersion,
          execution_digest: values.executionDigest,
          execution_policy_digest: values.executionPolicyDigest,
        },
      },
      program: {
        all: Object.entries(observation).map(([key, value]) => ({
          op: "equals",
          source: "observation",
          pointer: `/${key}`,
          value,
        })),
      },
    },
  };
}

function groundRecipe({
  recipe,
  scope,
  nonce,
  capturedAt,
  issuedAt,
  resolvedEvidence,
}) {
  const matchingProfiles = resolvedEvidence.trusted_profiles.filter((profile) => (
    profile.claim.claim_id === recipe.contract_definition.claim.claim_id
    && profile.claim.claim_version === recipe.contract_definition.claim.claim_version
  ));
  if (matchingProfiles.length !== 1) doctorFail("EVIDENCE_TRUST_ROOT_INVALID");
  const materialized = requireOk(materializeRiddleProofEvidenceTrustProfile({
    profile: matchingProfiles[0],
    claim: recipe.contract_definition.claim,
    observation: recipe.observation,
    expected_scope: scope,
  }), "SYNTHETIC_CAPTURE_FAILED");
  const authority = materialized.replay_authority;
  const verifier = requireOk(
    createRiddleProofGroundedDeclarativeJsonVerifier(recipe.verifier_definition),
    "SYNTHETIC_CAPTURE_FAILED",
  );
  if (canonicalJson(verifier.registration) !== canonicalJson(authority.verifier_registry[0])) {
    doctorFail("SYNTHETIC_CAPTURE_FAILED");
  }
  const signed = requireOk(createRiddleProofSignedCaptureBundle({
    scope,
    nonce,
    captured_at: capturedAt,
    collector: authority.expected_collector,
    sensor: authority.expected_sensor,
    verifier: authority.expected_verifier,
    artifacts: recipe.artifacts,
    signing_key: {
      key_id: SYNTHETIC_KEY_ID,
      private_key_pkcs8_base64: SYNTHETIC_PRIVATE_KEY_PKCS8_BASE64,
    },
  }), "SYNTHETIC_SIGNING_FAILED");
  const configuration = {
    policy: {
      expected_scope: scope,
      expected_nonce: nonce,
      expected_collector: authority.expected_collector,
      expected_sensor: authority.expected_sensor,
      expected_verifier: authority.expected_verifier,
      expected_signer: authority.expected_signer,
      verification_time: issuedAt,
      max_capture_age_ms: 60_000,
      max_future_skew_ms: 0,
      required_artifact_roles: authority.required_artifact_roles,
    },
    trusted_signers: authority.trusted_signers,
    verifier_registry: authority.verifier_registry,
    contract_registry: authority.contract_registry,
    expected_contract: authority.expected_contract,
  };
  const certified = requireOk(createRiddleProofGroundedSemanticCertificate({
    bundle: signed.bundle,
    ...configuration,
    issued_at: issuedAt,
  }), "SYNTHETIC_SIGNING_FAILED");
  const grounded = requireOk(createRiddleProofGroundedSemanticAtomicCertificateClosure({
    certificate: certified.certificate,
    grounding: certified.grounding,
    configuration,
  }), "SYNTHETIC_REPLAY_FAILED");
  const compositionReplayContext = {
    certificate_id: certified.certificate.certificate_id,
    ...configuration,
  };
  const checked = requireOk(createRiddleProofCheckedMeaningAtomicClosure({
    grounded_closure: grounded.grounded_closure,
    replay_contexts: [compositionReplayContext],
  }), "SYNTHETIC_REPLAY_FAILED");
  return {
    certificate: certified.certificate,
    checkedClosure: checked.checked_closure,
    compositionReplayContext,
    materializedContractDigest: materialized.expected_contract.implementation_digest,
  };
}

function assertObservationShapeRejected({ recipe, scope, resolvedEvidence, mutate }) {
  const matchingProfiles = resolvedEvidence.trusted_profiles.filter((profile) => (
    profile.claim.claim_id === recipe.contract_definition.claim.claim_id
    && profile.claim.claim_version === recipe.contract_definition.claim.claim_version
  ));
  if (matchingProfiles.length !== 1) doctorFail("EVIDENCE_TRUST_ROOT_INVALID");
  const observation = clone(recipe.observation);
  mutate(observation);
  const rejected = materializeRiddleProofEvidenceTrustProfile({
    profile: matchingProfiles[0],
    claim: recipe.contract_definition.claim,
    observation,
    expected_scope: scope,
  });
  if (rejected.ok || rejected.error.code !== "observation_mismatch") {
    doctorFail("SYNTHETIC_REPLAY_FAILED");
  }
}

function fixtureFiles(workbenchRoot, fixtureDirectory) {
  const root = join(workbenchRoot, "synthetic", fixtureDirectory);
  return {
    root,
    files: [
      { role: "candidate", path: join(root, "candidate.txt"), mediaType: "text/plain" },
      { role: "criteria", path: join(root, "criteria.txt"), mediaType: "text/plain" },
      { role: "rendered", path: join(root, "rendered.pdf"), mediaType: "application/pdf" },
      { role: "source", path: join(root, "source.txt"), mediaType: "text/plain" },
    ],
  };
}

async function runSyntheticArtifactSet({
  workbenchRoot,
  fixtureDirectory,
  idByte,
  policy,
  artifactSetRule,
  executionCurrentRule,
  expectedRule,
  resolvedRules,
  resolvedEvidence,
  productionTrust,
}) {
  const fixture = fixtureFiles(workbenchRoot, fixtureDirectory);
  let snapshot;
  try {
    snapshot = await captureDocumentSnapshot({
      files: fixture.files,
      artifactPolicy: "digest_only",
      capturedAt: TIMES.snapshot,
    });
  } catch {
    doctorFail("SYNTHETIC_CAPTURE_FAILED");
  }
  const scope = {
    repository: "synthetic/client-bootstrap",
    revision: snapshot.snapshot.snapshot_id,
    environment: "offline-runtime-doctor",
    target: "synthetic-artifact-workflow-packet",
    proof_attempt: `synthetic-run-${idByte}`,
  };
  const snapshotRecipe = clone(createDocumentSnapshotGroundingRecipe(snapshot));
  snapshotRecipe.contract_definition.contract_id =
    "riddle-proof.diagnostic.snapshot-captured.declarative";
  snapshotRecipe.contract_definition.claim.claim_id = DIAGNOSTIC_CLAIMS.snapshot;
  for (const mutate of [
    (observation) => { observation.unexpected_field = false; },
    (observation) => { observation.capture.unexpected_field = false; },
    (observation) => {
      observation.artifacts.push({
        role: "unexpected",
        media_type: "application/octet-stream",
        byte_length: 1,
        digest: `sha256:${"0".repeat(64)}`,
      });
    },
  ]) {
    assertObservationShapeRejected({
      recipe: snapshotRecipe,
      scope,
      resolvedEvidence,
      mutate,
    });
  }
  const snapshotGrounded = groundRecipe({
    recipe: snapshotRecipe,
    scope,
    nonce: base64url(idByte),
    capturedAt: TIMES.snapshot,
    issuedAt: TIMES.snapshotCertificate,
    resolvedEvidence,
  });
  const rolesGrounded = groundRecipe({
    recipe: requiredRolesRecipe(snapshot),
    scope,
    nonce: base64url(idByte + 1),
    capturedAt: TIMES.roles,
    issuedAt: TIMES.rolesCertificate,
    resolvedEvidence,
  });

  let currentness;
  try {
    currentness = await recaptureDocumentSnapshotCurrentness({
      expectedReceipt: snapshot,
      files: [...fixture.files].reverse(),
      checkedAt: TIMES.currentness,
    });
  } catch {
    doctorFail("SYNTHETIC_CURRENTNESS_FAILED");
  }
  if (currentness.status !== "current") doctorFail("SYNTHETIC_CURRENTNESS_FAILED");
  const currentnessRecipe = clone(createDocumentSnapshotCurrentnessGroundingRecipe(currentness));
  currentnessRecipe.contract_definition.contract_id =
    "riddle-proof.diagnostic.snapshot-current-at-check.declarative";
  currentnessRecipe.contract_definition.claim.claim_id = DIAGNOSTIC_CLAIMS.currentness;
  const currentnessGrounded = groundRecipe({
    recipe: currentnessRecipe,
    scope,
    nonce: base64url(idByte + 2),
    capturedAt: TIMES.currentness,
    issuedAt: TIMES.currentnessCertificate,
    resolvedEvidence,
  });

  const surface = policy.approved_execution_surfaces[0];
  const execution = {
    execution_id: `rpex_${base64url(idByte + 2)}`,
    adapter_id: surface.adapter_id,
    runtime_id: "synthetic-offline-runtime",
    protocol_version: PROTOCOL_VERSION,
    configuration_version: "synthetic-configuration-v1",
    route_code: "offline_synthetic_test",
    attempt_count: 1,
  };
  const executionDigest = digestRiddleProofExecution(execution);
  const executionPolicyDigest = digestRiddleProofExecutionPolicy(
    policy.approved_execution_policy,
  );
  const uncertaintyId = `rpe_${base64url(idByte + 3)}`;
  const packet = {
    version: RIDDLE_PROOF_PRIVATE_PACKET_VERSION,
    packet_id: `rpp_${base64url(idByte + 4)}`,
    subject_id: snapshot.snapshot.snapshot_id,
    subject_digest: snapshot.snapshot.manifest_digest,
    rule_trust_root: policy.rule_trust_root,
    protocol_version: PROTOCOL_VERSION,
    execution_digest: executionDigest,
    entries: [
      {
        entry_id: `rpe_${base64url(idByte + 5)}`,
        classification: "artifact_observation",
        issuer: {
          kind: "deterministic",
          component_id: "synthetic-document-sensor",
          component_version: "1",
        },
        evidence_certificate_ids: [
          snapshotGrounded.certificate.certificate_id,
          rolesGrounded.certificate.certificate_id,
        ],
        blocking: false,
        content: { observation: `${SYNTHETIC_PRIVILEGED_SENTINEL}_${idByte}` },
      },
      {
        entry_id: uncertaintyId,
        classification: "execution_uncertainty",
        issuer: { kind: "execution", execution_id: execution.execution_id },
        evidence_certificate_ids: [snapshotGrounded.certificate.certificate_id],
        blocking: true,
        content: { question: "Synthetic question requiring client interpretation" },
      },
    ],
  };
  const packetBytes = Buffer.from(JSON.stringify(packet), "utf8");
  const groundedEvidenceCertificateIds = [
    snapshotGrounded.certificate.certificate_id,
    rolesGrounded.certificate.certificate_id,
    currentnessGrounded.certificate.certificate_id,
  ];
  const danglingCertificateId = `rpsc_${"f".repeat(64)}`;
  const danglingEntries = clone(packet.entries);
  danglingEntries[0].evidence_certificate_ids.push(danglingCertificateId);
  if (entryEvidenceLinksResolve(danglingEntries, groundedEvidenceCertificateIds)) {
    doctorFail("SYNTHETIC_REPLAY_FAILED");
  }
  let packetDigest;
  try {
    packetDigest = digestRiddleProofPrivatePacketBytes(packetBytes);
  } catch {
    doctorFail("SYNTHETIC_CAPTURE_FAILED");
  }
  const procedureGrounded = groundRecipe({
    recipe: workflowRecipe({
      subjectId: packet.subject_id,
      subjectDigest: packet.subject_digest,
      packetDigest,
      ruleTrustRootDigest: packet.rule_trust_root.bundle_digest,
      evidenceTrustRootDigest: policy.evidence_trust_root.bundle_digest,
      protocolVersion: packet.protocol_version,
      executionDigest,
      executionPolicyDigest,
      requiredStepsRan: true,
      entriesClassified: packet.entries.every((entry) => (
        ["artifact_observation", "execution_uncertainty"].includes(entry.classification)
      )),
      evidenceLinked: entryEvidenceLinksResolve(
        packet.entries,
        groundedEvidenceCertificateIds,
      ),
      uncertaintiesDisclosed: packet.entries.some((entry) => (
        entry.entry_id === uncertaintyId
        && entry.classification === "execution_uncertainty"
        && entry.blocking === true
      )),
    }),
    scope,
    nonce: base64url(idByte + 7),
    capturedAt: TIMES.procedure,
    issuedAt: TIMES.procedureCertificate,
    resolvedEvidence,
  });

  const artifactSetReplayContexts = [
    snapshotGrounded.compositionReplayContext,
    rolesGrounded.compositionReplayContext,
  ];
  const executionCurrentReplayContexts = [
    procedureGrounded.compositionReplayContext,
    currentnessGrounded.compositionReplayContext,
  ];
  const compositionReplayContexts = [
    ...artifactSetReplayContexts,
    ...executionCurrentReplayContexts,
  ];
  const artifactSetReady = requireOk(composeRiddleProofCheckedMeaningClosures({
    expected_rule: artifactSetRule,
    closures: [
      snapshotGrounded.checkedClosure,
      rolesGrounded.checkedClosure,
    ],
    issued_at: TIMES.artifactSetComposition,
    replay_contexts: artifactSetReplayContexts,
    rule_registry: resolvedRules.rule_registry,
    trusted_rules: resolvedRules.trusted_rules,
  }), "SYNTHETIC_COMPOSITION_FAILED");
  const executionCurrent = requireOk(composeRiddleProofCheckedMeaningClosures({
    expected_rule: executionCurrentRule,
    closures: [
      procedureGrounded.checkedClosure,
      currentnessGrounded.checkedClosure,
    ],
    issued_at: TIMES.executionCurrentComposition,
    replay_contexts: executionCurrentReplayContexts,
    rule_registry: resolvedRules.rule_registry,
    trusted_rules: resolvedRules.trusted_rules,
  }), "SYNTHETIC_COMPOSITION_FAILED");
  const composed = requireOk(composeRiddleProofCheckedMeaningClosures({
    expected_rule: expectedRule,
    closures: [
      artifactSetReady.checked_closure,
      executionCurrent.checked_closure,
    ],
    issued_at: TIMES.composition,
    replay_contexts: compositionReplayContexts,
    rule_registry: resolvedRules.rule_registry,
    trusted_rules: resolvedRules.trusted_rules,
  }), "SYNTHETIC_COMPOSITION_FAILED");
  if (canonicalJson(composed.certificate.derivation.premises.map(
    (premise) => premise.certificate_id,
  )) !== canonicalJson([
    artifactSetReady.certificate.certificate_id,
    executionCurrent.certificate.certificate_id,
  ])) {
    doctorFail("SYNTHETIC_COMPOSITION_FAILED");
  }
  const receipt = requireOk(createRiddleProofPacketReceipt({
    private_packet_bytes: packetBytes,
    opaque_reference_id: `rpar_${base64url(idByte + 6)}`,
    execution,
    execution_policy: policy.approved_execution_policy,
    checked_root_certificate_id: composed.certificate.certificate_id,
    currentness_certificate_id: currentnessGrounded.certificate.certificate_id,
    evidence_trust_root: policy.evidence_trust_root,
    issued_at: TIMES.receipt,
  }), "SYNTHETIC_CAPTURE_FAILED");
  if (receipt.receipt.execution_policy_digest !== executionPolicyDigest
    || receipt.receipt.packet.packet_digest !== packetDigest) {
    doctorFail("SYNTHETIC_REPLAY_FAILED");
  }
  const currentnessWitness = {
    version: "riddle-proof.snapshot-currentness-witness.v1",
    status: "current",
    expected_snapshot_id: currentness.expected_snapshot_id,
    expected_manifest_digest: currentness.expected_manifest_digest,
    observed_snapshot_id: currentness.observed_snapshot_id,
    observed_manifest_digest: currentness.observed_manifest_digest,
    checked_at: currentness.checked_at,
    certificate_id: currentnessGrounded.certificate.certificate_id,
  };

  // This is the fresh-consumer boundary: reconstruct the expected client claim
  // from pinned inputs, then match and replay the serialized closure. Producer
  // agreement or a freshness assessment alone is not verification.
  const expectedRootClaim = {
    claim_id: DIAGNOSTIC_CLAIMS.conclusion,
    claim_version: "1",
    parameters: {
      subject_id: packet.subject_id,
      subject_digest: packet.subject_digest,
      packet_digest: packetDigest,
      rule_trust_root_digest: policy.rule_trust_root.bundle_digest,
      evidence_trust_root_digest: policy.evidence_trust_root.bundle_digest,
      protocol_version: packet.protocol_version,
      execution_digest: executionDigest,
      execution_policy_digest: executionPolicyDigest,
    },
  };
  const matched = matchRiddleProofCheckedMeaningClosure({
    checked_closure: clone(composed.checked_closure),
    replay_contexts: clone(compositionReplayContexts),
    rule_registry: clone(resolvedRules.rule_registry),
    trusted_rules: clone(resolvedRules.trusted_rules),
    expected_root_certificate_id: receipt.receipt.checked_root_certificate_id,
    expected_scope: clone(scope),
    expected_claim: expectedRootClaim,
    expected_root_rule: clone(expectedRule),
  });
  if (!matched.ok) doctorFail("SYNTHETIC_REPLAY_FAILED");
  const replayed = assessRiddleProofCheckedMeaningClosure({
    checked_closure: matched.checked_closure,
    replay_contexts: clone(compositionReplayContexts),
    rule_registry: clone(resolvedRules.rule_registry),
    trusted_rules: clone(resolvedRules.trusted_rules),
    consumption_time: TIMES.verification,
    max_grounded_age_ms: 60_000,
    max_future_skew_ms: 0,
  });
  if (replayed.disposition !== "checked") doctorFail("SYNTHETIC_REPLAY_FAILED");
  const resolvedCertificateIds = matched.checked_closure.grounded_closure.closure.certificates
    .map((certificate) => certificate.certificate_id)
    .sort();
  if (resolvedCertificateIds.length !== 7
    || matched.checked_closure.rule_bindings.length !== 3
    || new Set(resolvedCertificateIds).size !== resolvedCertificateIds.length) {
    doctorFail("SYNTHETIC_REPLAY_FAILED");
  }
  const replayedCurrentness = matched.checked_closure.grounded_closure.closure.certificates.find(
    (certificate) => certificate.certificate_id === currentnessWitness.certificate_id,
  );
  if (!replayedCurrentness) doctorFail("SYNTHETIC_REPLAY_FAILED");

  const blindVerificationInput = {
    receipt: clone(receipt.receipt),
    private_packet_bytes: packetBytes,
    expected_subject_id: packet.subject_id,
    expected_subject_digest: packet.subject_digest,
    expected_evidence_trust_root: clone(policy.evidence_trust_root),
    expected_rule_trust_root: clone(policy.rule_trust_root),
    expected_root_certificate_id: matched.root_certificate.certificate_id,
    expected_root_certificate_issued_at: matched.root_certificate.issued_at,
    expected_currentness_certificate_id: replayedCurrentness.certificate_id,
    expected_currentness_certificate_issued_at: replayedCurrentness.issued_at,
    expected_protocol_version: PROTOCOL_VERSION,
    resolved_certificate_ids: resolvedCertificateIds,
    execution_policy: clone(policy.approved_execution_policy),
    verification_time: TIMES.verification,
    max_receipt_age_ms: 60_000,
    max_future_skew_ms: 0,
  };
  if (Object.hasOwn(blindVerificationInput, "replay_contexts")) {
    doctorFail("SYNTHETIC_REPLAY_FAILED");
  }
  if (!verifyRiddleProofPacketReceipt(blindVerificationInput).ok) {
    doctorFail("SYNTHETIC_REPLAY_FAILED");
  }
  const substitutedExecutionPolicy = clone(policy.approved_execution_policy);
  substitutedExecutionPolicy.policy_version = "2";
  const substitutedExpectedClaim = clone(expectedRootClaim);
  substitutedExpectedClaim.parameters.execution_policy_digest =
    digestRiddleProofExecutionPolicy(substitutedExecutionPolicy);
  const substitutedMeaning = matchRiddleProofCheckedMeaningClosure({
    checked_closure: clone(composed.checked_closure),
    replay_contexts: clone(compositionReplayContexts),
    rule_registry: clone(resolvedRules.rule_registry),
    trusted_rules: clone(resolvedRules.trusted_rules),
    expected_root_certificate_id: receipt.receipt.checked_root_certificate_id,
    expected_scope: clone(scope),
    expected_claim: substitutedExpectedClaim,
    expected_root_rule: clone(expectedRule),
  });
  if (substitutedMeaning.ok) doctorFail("SYNTHETIC_REPLAY_FAILED");
  const substitutedReceiptPolicy = verifyRiddleProofPacketReceipt({
    ...blindVerificationInput,
    execution_policy: substitutedExecutionPolicy,
  });
  if (substitutedReceiptPolicy.ok) doctorFail("SYNTHETIC_REPLAY_FAILED");
  // Public diagnostic authority binds only its own disjoint roots and claims.
  // Neither its packet receipt nor its checked closures can cross into a
  // client-supplied production root.
  const crossedIntoProduction = verifyRiddleProofPacketReceipt({
    ...blindVerificationInput,
    expected_evidence_trust_root: clone(productionTrust.policy.evidence_trust_root),
    expected_rule_trust_root: clone(productionTrust.policy.rule_trust_root),
  });
  if (crossedIntoProduction.ok) {
    doctorFail("SYNTHETIC_REPLAY_FAILED");
  }
  const crossedComposition = composeRiddleProofCheckedMeaningClosures({
    expected_rule: productionTrust.policy.packet_complete_rule,
    closures: [
      artifactSetReady.checked_closure,
      executionCurrent.checked_closure,
    ],
    issued_at: TIMES.composition,
    replay_contexts: compositionReplayContexts,
    rule_registry: productionTrust.resolvedRules.rule_registry,
    trusted_rules: productionTrust.resolvedRules.trusted_rules,
  });
  if (crossedComposition.ok) doctorFail("SYNTHETIC_REPLAY_FAILED");
  const contentFreeLog = JSON.stringify({
    receipt: receipt.receipt,
    currentness: currentnessWitness,
    evidence_trust_root: policy.evidence_trust_root,
  });
  if (contentFreeLog.includes(SYNTHETIC_PRIVILEGED_SENTINEL)
    || contentFreeLog.includes("content")
    || contentFreeLog.includes(".txt")
    || contentFreeLog.includes(fixture.root)) {
    doctorFail("SYNTHETIC_REPLAY_FAILED");
  }
  return {
    snapshotId: snapshot.snapshot.snapshot_id,
    evidenceRootDigest: receipt.receipt.evidence_trust_root.bundle_digest,
    snapshotContractDigest: snapshotGrounded.materializedContractDigest,
    rolesContractDigest: rolesGrounded.materializedContractDigest,
    workflowContractDigest: procedureGrounded.materializedContractDigest,
  };
}

export async function runSyntheticFoundationTest({
  workbenchRoot,
  policy,
  ruleBundle,
  evidenceBundle,
}) {
  try {
    const diagnosticRuleDefinitions = JSON.parse(readFileSync(join(
      workbenchRoot, "synthetic", "diagnostic-rule-definitions.json",
    ), "utf8"));
    const diagnosticEvidenceTemplates = JSON.parse(readFileSync(join(
      workbenchRoot, "synthetic", "diagnostic-evidence-profile-templates.json",
    ), "utf8"));
    const createdDiagnosticRules = requireOk(createRiddleProofRuleTrustRoot({
      trust_root_id: "riddle-proof-public-diagnostic-rules",
      trust_root_version: "1",
      rule_definitions: diagnosticRuleDefinitions.rules,
    }), "SYNTHETIC_COMPOSITION_FAILED");
    const createdDiagnosticEvidence = requireOk(createRiddleProofEvidenceTrustRoot({
      trust_root_id: "riddle-proof-public-diagnostic-evidence",
      trust_root_version: "1",
      profile_templates: diagnosticEvidenceTemplates.profile_templates,
    }), "SYNTHETIC_CAPTURE_FAILED");
    const resolvedRules = requireOk(resolveRiddleProofRuleTrustRoot({
      bundle: createdDiagnosticRules.bundle,
      expected_trust_root: createdDiagnosticRules.trust_root,
    }), "SYNTHETIC_COMPOSITION_FAILED");
    const expectedRule = resolvedRules.trusted_rules.find((rule) => (
      rule.rule_id === "riddle-proof.diagnostic.workflow-packet-complete.procedural"
      && rule.rule_version === "1"
    ));
    const artifactSetRule = resolvedRules.trusted_rules.find((rule) => (
      rule.rule_id === "riddle-proof.diagnostic.artifact-set-ready.procedural"
      && rule.rule_version === "1"
    ));
    const executionCurrentRule = resolvedRules.trusted_rules.find((rule) => (
      rule.rule_id === "riddle-proof.diagnostic.execution-current.procedural"
      && rule.rule_version === "1"
    ));
    if (!expectedRule || !artifactSetRule || !executionCurrentRule) {
      doctorFail("SYNTHETIC_COMPOSITION_FAILED");
    }
    const resolvedEvidence = requireOk(resolveRiddleProofEvidenceTrustRoot({
      bundle: createdDiagnosticEvidence.bundle,
      expected_trust_root: createdDiagnosticEvidence.trust_root,
    }), "SYNTHETIC_CAPTURE_FAILED");
    const resolvedProductionRules = requireOk(resolveRiddleProofRuleTrustRoot({
      bundle: ruleBundle,
      expected_trust_root: policy.rule_trust_root,
    }), "SYNTHETIC_COMPOSITION_FAILED");
    const diagnosticPolicy = {
      ...policy,
      rule_trust_root: createdDiagnosticRules.trust_root,
      evidence_trust_root: createdDiagnosticEvidence.trust_root,
      packet_complete_rule: expectedRule,
    };
    const common = {
      workbenchRoot,
      policy: diagnosticPolicy,
      artifactSetRule,
      executionCurrentRule,
      expectedRule,
      resolvedRules,
      resolvedEvidence,
      productionTrust: { policy, resolvedRules: resolvedProductionRules },
    };
    const first = await runSyntheticArtifactSet({
      ...common, fixtureDirectory: "documents", idByte: 11,
    });
    const second = await runSyntheticArtifactSet({
      ...common, fixtureDirectory: "documents-two", idByte: 41,
    });
    if (first.snapshotId === second.snapshotId
      || first.snapshotContractDigest === second.snapshotContractDigest
      || first.rolesContractDigest === second.rolesContractDigest
      || first.workflowContractDigest === second.workflowContractDigest
      || first.evidenceRootDigest !== second.evidenceRootDigest
      || first.evidenceRootDigest !== createdDiagnosticEvidence.trust_root.bundle_digest
      || first.evidenceRootDigest === policy.evidence_trust_root.bundle_digest) {
      doctorFail("SYNTHETIC_REPLAY_FAILED");
    }
    return {
      ok: true,
      materialized_artifact_sets: 2,
      evidence_trust_root_digest: first.evidenceRootDigest,
    };
  } catch (error) {
    if (error instanceof DoctorFailure) throw error;
    doctorFail("SYNTHETIC_REPLAY_FAILED");
  }
}
