import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  composeRiddleProofCheckedMeaningClosures,
  createRiddleProofCheckedMeaningAtomicClosure,
  assessRiddleProofCheckedMeaningClosure,
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
  createRiddleProofReviewPacketReceipt,
  digestRiddleProofAgentExecution,
  digestRiddleProofApprovedExecutionPolicy,
  RIDDLE_PROOF_REVIEW_ASSERTION_CLASSIFICATIONS,
  verifyRiddleProofReviewPacket,
} from "@riddledc/riddle-proof-core/review-protocol";
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
  provisionalReceipt: "2026-07-19T20:00:03.500Z",
  procedure: "2026-07-19T20:00:04.000Z",
  procedureCertificate: "2026-07-19T20:00:05.000Z",
  currentness: "2026-07-19T20:00:05.500Z",
  currentnessCertificate: "2026-07-19T20:00:06.000Z",
  composition: "2026-07-19T20:00:06.500Z",
  receipt: "2026-07-19T20:00:07.000Z",
  verification: "2026-07-19T20:00:08.000Z",
});

const PROTOCOL_VERSION = "synthetic-amendment-review-v1";
const DIAGNOSTIC_CLAIMS = Object.freeze({
  snapshot: "riddle-proof.diagnostic.snapshot-captured",
  roles: "riddle-proof.diagnostic.required-roles-present",
  procedure: "riddle-proof.diagnostic.procedure-observed",
  currentness: "riddle-proof.diagnostic.snapshot-current-at-check",
  conclusion: "riddle-proof.diagnostic.review-packet-complete",
});
const REQUIRED_ROLES = Object.freeze(["candidate", "original", "rendered", "template"]);
const SYNTHETIC_PRIVILEGED_SENTINEL = "SYNTHETIC_PRIVILEGED_CLAUSE_DO_NOT_LOG_7b3619";
// Public test material only. This key has no authority over real documents or company evidence.
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

function requiredRolesRecipe(snapshotReceipt) {
  const observedRoles = snapshotReceipt.snapshot.artifacts
    .map((artifact) => artifact.role)
    .sort((left, right) => left.localeCompare(right, "en"));
  const observation = {
    version: "riddle-proof.synthetic-required-document-roles.v1",
    snapshot_id: snapshotReceipt.snapshot.snapshot_id,
    manifest_digest: snapshotReceipt.snapshot.manifest_digest,
    required_roles: [...REQUIRED_ROLES],
    observed_roles: observedRoles,
    status: canonicalJson(observedRoles) === canonicalJson(REQUIRED_ROLES) ? "complete" : "incomplete",
  };
  const artifact = {
    artifact_id: "synthetic-required-document-roles.json",
    role: "required_document_roles",
    media_type: "application/json",
    bytes_base64: Buffer.from(canonicalJson(observation), "utf8").toString("base64"),
  };
  return {
    observation,
    artifacts: [artifact],
    verifier_definition: {
      verifier_id: "riddle-proof.synthetic-required-document-roles.declarative",
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
      contract_id: "riddle-proof.synthetic-required-document-roles-observed.declarative",
      contract_version: "1",
      label: "The synthetic snapshot contains every required document role",
      claim: {
        claim_id: DIAGNOSTIC_CLAIMS.roles,
        claim_version: "1",
        label: "The synthetic snapshot contains every required document role",
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

function proceduralRecipe(values) {
  const observation = {
    version: "riddle-proof.synthetic-procedural-review.v1",
    snapshot_id: values.snapshotId,
    manifest_digest: values.manifestDigest,
    packet_digest: values.packetDigest,
    rule_trust_root_digest: values.ruleTrustRootDigest,
    protocol_version: values.protocolVersion,
    execution_metadata_digest: values.executionMetadataDigest,
    execution_policy_digest: values.executionPolicyDigest,
    required_steps_ran: values.requiredStepsRan,
    assertions_classified: values.assertionsClassified,
    evidence_linked: values.evidenceLinked,
    uncertainties_disclosed: values.uncertaintiesDisclosed,
    legal_correctness_established: false,
  };
  const artifact = {
    artifact_id: "synthetic-procedural-review.json",
    role: "synthetic_procedural_review",
    media_type: "application/json",
    bytes_base64: Buffer.from(canonicalJson(observation), "utf8").toString("base64"),
  };
  return {
    observation,
    artifacts: [artifact],
    verifier_definition: {
      verifier_id: "riddle-proof.synthetic-procedural-review",
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
      contract_id: "riddle-proof.synthetic-procedural-review-complete",
      contract_version: "1",
      label: "Synthetic procedural review steps are complete",
      claim: {
        claim_id: DIAGNOSTIC_CLAIMS.procedure,
        claim_version: "1",
        label: "Synthetic procedural review requirements were observed",
        parameters: {
          snapshot_id: values.snapshotId,
          manifest_digest: values.manifestDigest,
          packet_digest: values.packetDigest,
          rule_trust_root_digest: values.ruleTrustRootDigest,
          protocol_version: values.protocolVersion,
          execution_metadata_digest: values.executionMetadataDigest,
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
      { role: "original", path: join(root, "original.txt"), mediaType: "text/plain" },
      { role: "template", path: join(root, "template.txt"), mediaType: "text/plain" },
      { role: "candidate", path: join(root, "candidate.txt"), mediaType: "text/plain" },
      { role: "rendered", path: join(root, "rendered.pdf"), mediaType: "application/pdf" },
    ],
  };
}

async function runMatter({
  workbenchRoot,
  fixtureDirectory,
  idByte,
  policy,
  ruleBundle,
  expectedRule,
  resolvedRules,
  evidenceBundle,
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
    repository: "synthetic/private-workbench-transfer",
    revision: snapshot.snapshot.snapshot_id,
    environment: "offline-runtime-doctor",
    target: "synthetic-amendment-review-packet",
    proof_attempt: `synthetic-matter-${idByte}`,
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
    provider_adapter_id: surface.adapter_id,
    model_id: "synthetic-no-model",
    protocol_version: PROTOCOL_VERSION,
    prompt_version: "synthetic-prompt-v1",
    routing_decision_code: "offline_synthetic_test",
    attempt_count: 1,
    escalation_reason_code: "none",
  };
  const executionMetadataDigest = digestRiddleProofAgentExecution(execution);
  const executionPolicyDigest = digestRiddleProofApprovedExecutionPolicy(
    policy.approved_execution_policy,
  );
  const uncertaintyId = `rpae_${base64url(idByte + 3)}`;
  const packet = {
    version: "riddle-proof.privileged-review-packet.v1",
    packet_id: `rpp_${base64url(idByte + 4)}`,
    snapshot_id: snapshot.snapshot.snapshot_id,
    manifest_digest: snapshot.snapshot.manifest_digest,
    rule_trust_root: policy.rule_trust_root,
    protocol_version: PROTOCOL_VERSION,
    execution_metadata_digest: executionMetadataDigest,
    assertions: [
      {
        entry_id: `rpae_${base64url(idByte + 5)}`,
        classification: "document_observation",
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
        content: { clause: `${SYNTHETIC_PRIVILEGED_SENTINEL}_${idByte}` },
      },
      {
        entry_id: uncertaintyId,
        classification: "agent_uncertainty",
        issuer: { kind: "agent", execution_id: execution.execution_id },
        evidence_certificate_ids: [snapshotGrounded.certificate.certificate_id],
        blocking: true,
        content: { question: "Synthetic question requiring lawyer review" },
      },
    ],
    uncertainty_entry_ids: [uncertaintyId],
  };
  const packetBytes = Buffer.from(JSON.stringify(packet), "utf8");
  const provisionalReceipt = requireOk(createRiddleProofReviewPacketReceipt({
    privileged_packet_bytes: packetBytes,
    opaque_reference_id: `rpar_${base64url(idByte + 6)}`,
    execution,
    checked_root_certificate_id: `rpsc_${"0".repeat(64)}`,
    currentness_certificate_id: `rpsc_${"0".repeat(64)}`,
    evidence_trust_root: policy.evidence_trust_root,
    issued_at: TIMES.provisionalReceipt,
  }), "SYNTHETIC_CAPTURE_FAILED");
  const parsedPacket = provisionalReceipt.privileged_packet;
  const procedureGrounded = groundRecipe({
    recipe: proceduralRecipe({
      snapshotId: parsedPacket.snapshot_id,
      manifestDigest: parsedPacket.manifest_digest,
      packetDigest: provisionalReceipt.receipt.packet.packet_digest,
      ruleTrustRootDigest: parsedPacket.rule_trust_root.bundle_digest,
      protocolVersion: parsedPacket.protocol_version,
      executionMetadataDigest,
      executionPolicyDigest,
      requiredStepsRan: true,
      assertionsClassified: parsedPacket.assertions.every((assertion) => (
        RIDDLE_PROOF_REVIEW_ASSERTION_CLASSIFICATIONS.includes(assertion.classification)
      )),
      evidenceLinked: parsedPacket.assertions.every((assertion) => (
        assertion.evidence_certificate_ids.length > 0
      )),
      uncertaintiesDisclosed: canonicalJson(parsedPacket.uncertainty_entry_ids)
        === canonicalJson(parsedPacket.assertions
          .filter((assertion) => assertion.classification === "agent_uncertainty")
          .map((assertion) => assertion.entry_id)),
    }),
    scope,
    nonce: base64url(idByte + 7),
    capturedAt: TIMES.procedure,
    issuedAt: TIMES.procedureCertificate,
    resolvedEvidence,
  });

  const compositionReplayContexts = [
    snapshotGrounded.compositionReplayContext,
    rolesGrounded.compositionReplayContext,
    procedureGrounded.compositionReplayContext,
    currentnessGrounded.compositionReplayContext,
  ];
  const composed = requireOk(composeRiddleProofCheckedMeaningClosures({
    expected_rule: expectedRule,
    closures: [
      snapshotGrounded.checkedClosure,
      rolesGrounded.checkedClosure,
      procedureGrounded.checkedClosure,
      currentnessGrounded.checkedClosure,
    ],
    issued_at: TIMES.composition,
    replay_contexts: compositionReplayContexts,
    rule_registry: resolvedRules.rule_registry,
    trusted_rules: resolvedRules.trusted_rules,
  }), "SYNTHETIC_COMPOSITION_FAILED");
  const replayed = assessRiddleProofCheckedMeaningClosure({
    checked_closure: composed.checked_closure,
    replay_contexts: compositionReplayContexts,
    rule_registry: resolvedRules.rule_registry,
    trusted_rules: resolvedRules.trusted_rules,
    consumption_time: TIMES.verification,
    max_grounded_age_ms: 60_000,
    max_future_skew_ms: 0,
  });
  if (replayed.disposition !== "checked") doctorFail("SYNTHETIC_REPLAY_FAILED");
  const receipt = requireOk(createRiddleProofReviewPacketReceipt({
    privileged_packet_bytes: packetBytes,
    opaque_reference_id: `rpar_${base64url(idByte + 6)}`,
    execution,
    checked_root_certificate_id: composed.certificate.certificate_id,
    currentness_certificate_id: currentnessGrounded.certificate.certificate_id,
    evidence_trust_root: policy.evidence_trust_root,
    issued_at: TIMES.receipt,
  }), "SYNTHETIC_CAPTURE_FAILED");
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

  const blindVerificationInput = {
    receipt: clone(receipt.receipt),
    privileged_packet_bytes: packetBytes,
    checked_closure: clone(composed.checked_closure),
    evidence_trust_root_bundle: clone(evidenceBundle),
    expected_evidence_trust_root: clone(policy.evidence_trust_root),
    rule_trust_root_bundle: clone(ruleBundle),
    expected_rule_trust_root: clone(policy.rule_trust_root),
    expected_scope: clone(scope),
    expected_root_certificate_id: composed.certificate.certificate_id,
    expected_packet_complete_rule: clone(expectedRule),
    expected_protocol_version: PROTOCOL_VERSION,
    approved_execution_policy: clone(policy.approved_execution_policy),
    currentness_witness: currentnessWitness,
    verification_time: TIMES.verification,
    max_grounded_age_ms: 60_000,
    max_currentness_age_ms: 60_000,
    max_future_skew_ms: 0,
  };
  if (Object.hasOwn(blindVerificationInput, "replay_contexts")) {
    doctorFail("SYNTHETIC_REPLAY_FAILED");
  }
  // The public diagnostic key is authorized only by a disjoint diagnostic
  // evidence root and composes only to a disjoint diagnostic conclusion.  It
  // cannot satisfy the production review protocol or cross into company roots.
  if (verifyRiddleProofReviewPacket(blindVerificationInput).ok) {
    doctorFail("SYNTHETIC_REPLAY_FAILED");
  }
  const crossedIntoProduction = verifyRiddleProofReviewPacket({
    ...blindVerificationInput,
    evidence_trust_root_bundle: clone(productionTrust.evidenceBundle),
    expected_evidence_trust_root: clone(productionTrust.policy.evidence_trust_root),
    rule_trust_root_bundle: clone(productionTrust.ruleBundle),
    expected_rule_trust_root: clone(productionTrust.policy.rule_trust_root),
    expected_packet_complete_rule: clone(productionTrust.policy.packet_complete_rule),
  });
  if (crossedIntoProduction.ok) {
    doctorFail("SYNTHETIC_REPLAY_FAILED");
  }
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
    procedureContractDigest: procedureGrounded.materializedContractDigest,
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
      rule.rule_id === "riddle-proof.diagnostic.review-packet-complete.procedural"
      && rule.rule_version === "1"
    ));
    if (!expectedRule) doctorFail("SYNTHETIC_COMPOSITION_FAILED");
    const resolvedEvidence = requireOk(resolveRiddleProofEvidenceTrustRoot({
      bundle: createdDiagnosticEvidence.bundle,
      expected_trust_root: createdDiagnosticEvidence.trust_root,
    }), "SYNTHETIC_CAPTURE_FAILED");
    const diagnosticPolicy = {
      ...policy,
      rule_trust_root: createdDiagnosticRules.trust_root,
      evidence_trust_root: createdDiagnosticEvidence.trust_root,
      packet_complete_rule: expectedRule,
    };
    const common = {
      workbenchRoot,
      policy: diagnosticPolicy,
      ruleBundle: createdDiagnosticRules.bundle,
      expectedRule,
      resolvedRules,
      evidenceBundle: createdDiagnosticEvidence.bundle,
      resolvedEvidence,
      productionTrust: { policy, ruleBundle, evidenceBundle },
    };
    const first = await runMatter({ ...common, fixtureDirectory: "documents", idByte: 11 });
    const second = await runMatter({ ...common, fixtureDirectory: "documents-two", idByte: 41 });
    if (first.snapshotId === second.snapshotId
      || first.snapshotContractDigest === second.snapshotContractDigest
      || first.rolesContractDigest === second.rolesContractDigest
      || first.procedureContractDigest === second.procedureContractDigest
      || first.evidenceRootDigest !== second.evidenceRootDigest
      || first.evidenceRootDigest !== createdDiagnosticEvidence.trust_root.bundle_digest
      || first.evidenceRootDigest === policy.evidence_trust_root.bundle_digest) {
      doctorFail("SYNTHETIC_REPLAY_FAILED");
    }
    return {
      ok: true,
      materialized_matters: 2,
      evidence_trust_root_digest: first.evidenceRootDigest,
    };
  } catch (error) {
    if (error instanceof DoctorFailure) throw error;
    doctorFail("SYNTHETIC_REPLAY_FAILED");
  }
}
