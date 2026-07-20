import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as checked from "../riddle-proof-core/dist/checked-meaning.js";
import * as evidenceTrust from "../riddle-proof-core/dist/evidence-trust-root.js";
import * as grounded from "../riddle-proof-core/dist/grounded-evidence.js";
import * as review from "../riddle-proof-core/dist/review-protocol.js";
import * as trust from "../riddle-proof-core/dist/rule-trust-root.js";
import {
  captureDocumentSnapshot,
  createDocumentSnapshotCurrentnessGroundingRecipe,
  createDocumentSnapshotGroundingRecipe,
  recaptureDocumentSnapshotCurrentness,
} from "./dist/index.js";

const CAPTURED_AT = "2026-07-19T20:00:00.000Z";
const CURRENTNESS_AT = "2026-07-19T20:00:04.000Z";
const VERIFICATION_AT = "2026-07-19T20:00:07.000Z";
const PROTOCOL_VERSION = "synthetic-amendment-review-v1";
const REQUIRED_ROLES = ["candidate", "original", "rendered", "template"];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertOk(result, context) {
  assert.equal(result.ok, true, result.ok ? undefined : `${context}: ${result.error.message}`);
  if (!result.ok) throw new Error(`${context}: ${result.error.message}`);
  return result;
}

function deterministicRecipe({ id, role, observation, claim }) {
  const observationJson = JSON.stringify(observation);
  const artifactId = `synthetic/${id}.json`;
  return {
    observation,
    artifacts: [{
      artifact_id: artifactId,
      role,
      media_type: "application/json",
      bytes_base64: Buffer.from(observationJson, "utf8").toString("base64"),
    }],
    verifier_definition: {
      verifier_id: `riddle-proof.synthetic-${id}.declarative`,
      verifier_version: "1",
      program: {
        artifact: {
          artifact_id: artifactId,
          role,
          media_type: "application/json",
        },
        pointer: "",
      },
    },
    contract_definition: {
      contract_id: `riddle-proof.synthetic-${id}-observed.declarative`,
      contract_version: "1",
      label: `Accept the exact content-free ${id} observation`,
      claim,
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

function jsonType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value === "object" ? "object" : typeof value;
}

function escapeJsonPointerSegment(value) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function observationSchemaFromRecipe(observation, parameterPointers) {
  const parametersByPointer = new Map();
  for (const [parameter, pointers] of Object.entries(parameterPointers)) {
    for (const pointer of pointers) parametersByPointer.set(pointer, parameter);
  }
  function visit(value, pointer) {
    const parameter = parametersByPointer.get(pointer);
    if (parameter) return { kind: "claim_parameter", parameter };
    if (typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value)) {
      return { kind: "sha256" };
    }
    if (Number.isSafeInteger(value)) {
      return { kind: "integer", minimum: 0, maximum: 512 * 1024 * 1024 };
    }
    if (value === null || typeof value === "string" || typeof value === "boolean") {
      return { kind: "literal", value };
    }
    if (Array.isArray(value)) {
      return {
        kind: "array",
        items: value.map((entry, index) => visit(entry, `${pointer}/${index}`)),
      };
    }
    return {
      kind: "object",
      properties: Object.fromEntries(Object.entries(value).map(([key, entry]) => [
        key,
        visit(entry, `${pointer}/${escapeJsonPointerSegment(key)}`),
      ])),
    };
  }
  return visit(observation, "");
}

function evidenceTemplateFromRecipe({
  profileId,
  recipe,
  parameterPointers,
  collector,
  sensor,
  trustedSigner,
}) {
  const boundPointers = new Set(Object.values(parameterPointers).flat());
  const requiredAssertions = recipe.contract_definition.program.all.filter((assertion) =>
    assertion.source !== "observation" || !boundPointers.has(assertion.pointer));
  assert.ok(requiredAssertions.length > 0, `${profileId} requires at least one fixed assertion`);
  const parameters = recipe.contract_definition.claim.parameters;
  return {
    mode: evidenceTrust.RIDDLE_PROOF_EVIDENCE_TEMPLATE_PROFILE_MODE,
    profile_id: profileId,
    profile_version: "1",
    collector,
    sensor_template: {
      kind: sensor.kind,
      name: sensor.name,
      version: sensor.version,
      metadata: sensor.metadata,
      observed_target_binding: evidenceTrust.RIDDLE_PROOF_EVIDENCE_SENSOR_TARGET_BINDING,
    },
    trusted_signer: trustedSigner,
    verifier_definition: recipe.verifier_definition,
    observation_schema: observationSchemaFromRecipe(recipe.observation, parameterPointers),
    contract_template: {
      contract_id: recipe.contract_definition.contract_id,
      contract_version: recipe.contract_definition.contract_version,
      label: recipe.contract_definition.label,
      claim: {
        claim_id: recipe.contract_definition.claim.claim_id,
        claim_version: recipe.contract_definition.claim.claim_version,
        label: recipe.contract_definition.claim.label,
      },
      required_assertions: requiredAssertions,
      parameter_bindings: Object.entries(parameterPointers).map(([parameter, pointers]) => ({
        parameter,
        observation_pointers: pointers,
        allowed_json_types: [jsonType(parameters[parameter])],
      })),
    },
    required_artifact_roles: recipe.artifacts.map((artifact) => artifact.role),
  };
}

async function main() {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "riddle-proof-review-e2e-"));
  try {
    const sourcePaths = {
      original: join(temporaryRoot, "private-original.txt"),
      template: join(temporaryRoot, "private-template.txt"),
      candidate: join(temporaryRoot, "private-candidate.txt"),
      rendered: join(temporaryRoot, "private-rendered.pdf"),
    };
    await Promise.all([
      writeFile(sourcePaths.original, "SYNTHETIC MASTER AGREEMENT\nTerm: one year.\n"),
      writeFile(sourcePaths.template, "SYNTHETIC AMENDMENT TEMPLATE\nChange: [describe].\n"),
      writeFile(sourcePaths.candidate, "SYNTHETIC FIRST AMENDMENT\nChange: extend term.\n"),
      writeFile(sourcePaths.rendered, "%PDF-1.4\n% synthetic rendered witness\n"),
    ]);
    const selections = REQUIRED_ROLES.map((role) => ({ role, path: sourcePaths[role] }));

    const snapshotReceipt = await captureDocumentSnapshot({
      files: selections,
      artifactPolicy: "digest_only",
      capturedAt: CAPTURED_AT,
    });
    assert.equal(snapshotReceipt.artifact_policy, "digest_only");
    assert.deepEqual(
      snapshotReceipt.snapshot.artifacts.map((artifact) => artifact.role),
      REQUIRED_ROLES,
    );
    const snapshotReceiptText = JSON.stringify(snapshotReceipt);
    for (const sourcePath of Object.values(sourcePaths)) {
      assert.equal(snapshotReceiptText.includes(sourcePath), false, "digest receipt leaked a source path");
    }
    for (const sourceBytes of await Promise.all(Object.values(sourcePaths).map((path) => readFile(path, "utf8")))) {
      assert.equal(snapshotReceiptText.includes(sourceBytes), false, "digest receipt leaked document bytes");
    }

    const packetCompleteDefinition = {
      rule_id: "riddle-proof.amendment-review-packet-complete",
      rule_version: "1",
      label: "Required amendment review procedures compose to a packet-complete conclusion",
      premises: [
        {
          claim_id: "local-document-snapshot-captured",
          claim_version: "1",
          parameters: {
            snapshot_id: { op: "any" },
            manifest_digest: { op: "any" },
          },
        },
        {
          claim_id: "local-document-required-roles-present",
          claim_version: "1",
          parameters: {
            snapshot_id: { op: "any" },
            manifest_digest: { op: "any" },
          },
        },
        {
          claim_id: "amendment-review-procedure-observed",
          claim_version: "1",
          parameters: {
            snapshot_id: { op: "any" },
            manifest_digest: { op: "any" },
            packet_digest: { op: "any" },
            rule_trust_root_digest: { op: "any" },
            protocol_version: { op: "any" },
            execution_metadata_digest: { op: "any" },
            execution_policy_digest: { op: "any" },
          },
        },
        {
          claim_id: "local-document-snapshot-current-at-check",
          claim_version: "1",
          parameters: {
            snapshot_id: { op: "any" },
            manifest_digest: { op: "any" },
            checked_at: { op: "any" },
          },
        },
      ],
      conclusion: {
        claim_id: review.RIDDLE_PROOF_PACKET_COMPLETE_CLAIM_ID,
        claim_version: review.RIDDLE_PROOF_PACKET_COMPLETE_CLAIM_VERSION,
        label: "All required procedural review-packet checks completed",
        parameters: {
          snapshot_id: { op: "from_premise", premise_index: 2, parameter: "snapshot_id" },
          manifest_digest: { op: "from_premise", premise_index: 2, parameter: "manifest_digest" },
          packet_digest: { op: "from_premise", premise_index: 2, parameter: "packet_digest" },
          rule_trust_root_digest: {
            op: "from_premise",
            premise_index: 2,
            parameter: "rule_trust_root_digest",
          },
          protocol_version: {
            op: "from_premise",
            premise_index: 2,
            parameter: "protocol_version",
          },
          execution_metadata_digest: {
            op: "from_premise",
            premise_index: 2,
            parameter: "execution_metadata_digest",
          },
          execution_policy_digest: {
            op: "from_premise",
            premise_index: 2,
            parameter: "execution_policy_digest",
          },
        },
      },
      constraints: {
        all_of: true,
        parameter_equalities: [
          {
            members: [
              { premise_index: 0, parameter: "snapshot_id" },
              { premise_index: 1, parameter: "snapshot_id" },
              { premise_index: 2, parameter: "snapshot_id" },
              { premise_index: 3, parameter: "snapshot_id" },
            ],
          },
          {
            members: [
              { premise_index: 0, parameter: "manifest_digest" },
              { premise_index: 1, parameter: "manifest_digest" },
              { premise_index: 2, parameter: "manifest_digest" },
              { premise_index: 3, parameter: "manifest_digest" },
            ],
          },
        ],
        ordered_premise_chronology: true,
        max_age_ms: 60_000,
      },
    };
    const procedureWithCurrentnessDefinition = {
      rule_id: "riddle-proof.synthetic-procedure-with-currentness-witness",
      rule_version: "1",
      label: "Keep an independently reachable currentness witness below the procedure premise",
      premises: [
        {
          claim_id: "amendment-review-procedure-observed",
          claim_version: "1",
          parameters: {
            snapshot_id: { op: "any" },
            manifest_digest: { op: "any" },
            packet_digest: { op: "any" },
            rule_trust_root_digest: { op: "any" },
            protocol_version: { op: "any" },
            execution_metadata_digest: { op: "any" },
            execution_policy_digest: { op: "any" },
          },
        },
        {
          claim_id: "local-document-snapshot-current-at-check",
          claim_version: "1",
          parameters: {
            snapshot_id: { op: "any" },
            manifest_digest: { op: "any" },
            checked_at: { op: "any" },
          },
        },
      ],
      conclusion: {
        claim_id: "amendment-review-procedure-observed",
        claim_version: "1",
        label: "The same procedure claim remains available",
        parameters: {
          snapshot_id: { op: "from_premise", premise_index: 0, parameter: "snapshot_id" },
          manifest_digest: { op: "from_premise", premise_index: 0, parameter: "manifest_digest" },
          packet_digest: { op: "from_premise", premise_index: 0, parameter: "packet_digest" },
          rule_trust_root_digest: {
            op: "from_premise",
            premise_index: 0,
            parameter: "rule_trust_root_digest",
          },
          protocol_version: {
            op: "from_premise",
            premise_index: 0,
            parameter: "protocol_version",
          },
          execution_metadata_digest: {
            op: "from_premise",
            premise_index: 0,
            parameter: "execution_metadata_digest",
          },
          execution_policy_digest: {
            op: "from_premise",
            premise_index: 0,
            parameter: "execution_policy_digest",
          },
        },
      },
      constraints: {
        all_of: true,
        parameter_equalities: [
          {
            members: [
              { premise_index: 0, parameter: "snapshot_id" },
              { premise_index: 1, parameter: "snapshot_id" },
            ],
          },
          {
            members: [
              { premise_index: 0, parameter: "manifest_digest" },
              { premise_index: 1, parameter: "manifest_digest" },
            ],
          },
        ],
        ordered_premise_chronology: true,
        max_age_ms: 60_000,
      },
    };
    const alternatePinnedDefinition = {
      rule_id: "riddle-proof.synthetic-unrelated-pinned-rule",
      rule_version: "1",
      label: "A separately pinned rule that must not be accepted as the packet root rule",
      premises: [{
        claim_id: "local-document-snapshot-captured",
        claim_version: "1",
        parameters: {
          snapshot_id: { op: "any" },
          manifest_digest: { op: "any" },
        },
      }],
      conclusion: {
        claim_id: "synthetic-unrelated-conclusion",
        claim_version: "1",
        label: "Unrelated pinned conclusion",
        parameters: {
          snapshot_id: { op: "from_premise", premise_index: 0, parameter: "snapshot_id" },
        },
      },
      constraints: {
        all_of: true,
        ordered_premise_chronology: true,
      },
    };
    const trustRootCreation = assertOk(trust.createRiddleProofRuleTrustRoot({
      trust_root_id: "synthetic-company-amendment-review-rules",
      trust_root_version: "2026-07-19",
      rule_definitions: [
        packetCompleteDefinition,
        procedureWithCurrentnessDefinition,
        alternatePinnedDefinition,
      ],
    }), "create pinned rule trust root");
    const expectedTrustRoot = clone(trustRootCreation.trust_root);
    const resolvedTrust = assertOk(trust.resolveRiddleProofRuleTrustRoot({
      bundle: clone(trustRootCreation.bundle),
      expected_trust_root: expectedTrustRoot,
    }), "resolve independently pinned rule trust root");
    const packetCompleteRule = resolvedTrust.trusted_rules.find((rule) =>
      rule.rule_id === packetCompleteDefinition.rule_id);
    const alternatePinnedRule = resolvedTrust.trusted_rules.find((rule) =>
      rule.rule_id === alternatePinnedDefinition.rule_id);
    const procedureWithCurrentnessRule = resolvedTrust.trusted_rules.find((rule) =>
      rule.rule_id === procedureWithCurrentnessDefinition.rule_id);
    assert.ok(packetCompleteRule, "packet-complete rule is pinned");
    assert.ok(alternatePinnedRule, "alternate comparison rule is pinned");
    assert.ok(procedureWithCurrentnessRule, "nested currentness comparison rule is pinned");

    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const privateKeyBytes = privateKey.export({ format: "der", type: "pkcs8" });
    const publicKeyBytes = publicKey.export({ format: "der", type: "spki" });
    const signingKey = {
      key_id: "synthetic-local-review-e2e-key",
      private_key_pkcs8_base64: privateKeyBytes.toString("base64"),
    };
    const trustedSigner = {
      key_id: signingKey.key_id,
      public_key_spki_base64: publicKeyBytes.toString("base64"),
    };
    const scope = {
      repository: "synthetic/company-controlled-workbench",
      revision: snapshotReceipt.snapshot.snapshot_id,
      environment: "offline-local",
      target: "synthetic-amendment-review-packet",
      proof_attempt: "review-protocol-e2e-1",
    };
    const collector = {
      collector_id: "riddle-proof.synthetic-local-review",
      collector_version: "1",
      implementation_digest: `sha256:${"7".repeat(64)}`,
    };
    const sensor = {
      kind: "other",
      name: "synthetic-deterministic-local-sensor",
      version: "1",
      observed_target: scope.target,
      metadata: { network_used: false, source_mutation: false },
    };

    let evidenceRootCreation;
    let resolvedEvidenceTrust;

    function issueLeafWithMaterialized(
      recipe,
      materialized,
      { nonceByte, capturedAt, issuedAt },
    ) {
      const authority = materialized.replay_authority;
      const verifier = assertOk(
        grounded.createRiddleProofGroundedDeclarativeJsonVerifier(recipe.verifier_definition),
        "create declarative verifier",
      );
      assert.deepEqual(verifier.registration, authority.verifier_registry[0]);
      const nonce = Buffer.alloc(32, nonceByte).toString("base64url");
      const signed = assertOk(grounded.createRiddleProofSignedCaptureBundle({
        scope,
        nonce,
        captured_at: capturedAt,
        collector: authority.expected_collector,
        sensor: authority.expected_sensor,
        verifier: authority.expected_verifier,
        artifacts: recipe.artifacts,
        signing_key: signingKey,
      }), "sign deterministic observation");
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
      const certified = assertOk(grounded.createRiddleProofGroundedSemanticCertificate({
        bundle: signed.bundle,
        ...configuration,
        issued_at: issuedAt,
      }), "certify deterministic observation");
      const atomicGrounded = assertOk(
        grounded.createRiddleProofGroundedSemanticAtomicCertificateClosure({
          certificate: certified.certificate,
          grounding: certified.grounding,
          configuration,
        }),
        "create atomic grounded closure",
      );
      const replayContext = {
        certificate_id: certified.certificate.certificate_id,
        ...configuration,
      };
      const atomicChecked = assertOk(checked.createRiddleProofCheckedMeaningAtomicClosure({
        grounded_closure: atomicGrounded.grounded_closure,
        replay_contexts: [replayContext],
      }), "create atomic checked closure");
      return {
        certificate: certified.certificate,
        closure: atomicChecked.checked_closure,
        replay_context: replayContext,
        materialized,
      };
    }

    function issueLeaf(recipe, timing) {
      const matchingProfiles = resolvedEvidenceTrust.trusted_profiles.filter((profile) =>
        profile.claim.claim_id === recipe.contract_definition.claim.claim_id
        && profile.claim.claim_version === recipe.contract_definition.claim.claim_version);
      assert.equal(matchingProfiles.length, 1, "claim must select exactly one pinned evidence profile");
      const materialized = assertOk(evidenceTrust.materializeRiddleProofEvidenceTrustProfile({
        profile: matchingProfiles[0],
        claim: recipe.contract_definition.claim,
        observation: recipe.observation,
        expected_scope: scope,
      }), "materialize pinned evidence profile");
      return issueLeafWithMaterialized(recipe, materialized, timing);
    }

    const snapshotRecipe = createDocumentSnapshotGroundingRecipe(snapshotReceipt);
    const rolesObservation = {
      version: "riddle-proof.synthetic-required-document-roles.v1",
      snapshot_id: snapshotReceipt.snapshot.snapshot_id,
      manifest_digest: snapshotReceipt.snapshot.manifest_digest,
      required_roles: REQUIRED_ROLES,
      status: "complete",
    };
    const rolesRecipe = deterministicRecipe({
      id: "required-document-roles",
      role: "required_document_roles",
      observation: rolesObservation,
      claim: {
        claim_id: "local-document-required-roles-present",
        claim_version: "1",
        label: "The synthetic snapshot contains every required document role",
        parameters: {
          snapshot_id: snapshotReceipt.snapshot.snapshot_id,
          manifest_digest: snapshotReceipt.snapshot.manifest_digest,
        },
      },
    });
    const templateCurrentness = await recaptureDocumentSnapshotCurrentness({
      expectedReceipt: snapshotReceipt,
      files: selections,
      checkedAt: CURRENTNESS_AT,
    });
    assert.equal(templateCurrentness.status, "current");
    const currentnessTemplateRecipe = createDocumentSnapshotCurrentnessGroundingRecipe(
      templateCurrentness,
    );
    const procedureTemplateObservation = {
      version: "riddle-proof.synthetic-amendment-review-procedure.v1",
      snapshot_id: snapshotReceipt.snapshot.snapshot_id,
      manifest_digest: snapshotReceipt.snapshot.manifest_digest,
      packet_digest: `sha256:${"3".repeat(64)}`,
      rule_trust_root_digest: expectedTrustRoot.bundle_digest,
      protocol_version: PROTOCOL_VERSION,
      execution_metadata_digest: `sha256:${"4".repeat(64)}`,
      execution_policy_digest: `sha256:${"5".repeat(64)}`,
      assertions_classified: true,
      evidence_linkage_declared: true,
      uncertainties_disclosed: true,
    };
    const procedureTemplateRecipe = deterministicRecipe({
      id: "review-procedure",
      role: "amendment_review_procedure",
      observation: procedureTemplateObservation,
      claim: {
        claim_id: "amendment-review-procedure-observed",
        claim_version: "1",
        label: "Assertions were classified and linked and uncertainties were disclosed",
        parameters: {
          snapshot_id: procedureTemplateObservation.snapshot_id,
          manifest_digest: procedureTemplateObservation.manifest_digest,
          packet_digest: procedureTemplateObservation.packet_digest,
          rule_trust_root_digest: procedureTemplateObservation.rule_trust_root_digest,
          protocol_version: procedureTemplateObservation.protocol_version,
          execution_metadata_digest: procedureTemplateObservation.execution_metadata_digest,
          execution_policy_digest: procedureTemplateObservation.execution_policy_digest,
        },
      },
    });
    const templateArgs = { collector, sensor, trustedSigner };
    const profileTemplates = [
      evidenceTemplateFromRecipe({
        ...templateArgs,
        profileId: "synthetic.local-document-snapshot",
        recipe: snapshotRecipe,
        parameterPointers: {
          snapshot_id: ["/snapshot_id"],
          manifest_digest: ["/manifest_digest"],
        },
      }),
      evidenceTemplateFromRecipe({
        ...templateArgs,
        profileId: "synthetic.required-document-roles",
        recipe: rolesRecipe,
        parameterPointers: {
          snapshot_id: ["/snapshot_id"],
          manifest_digest: ["/manifest_digest"],
        },
      }),
      evidenceTemplateFromRecipe({
        ...templateArgs,
        profileId: "synthetic.amendment-review-procedure",
        recipe: procedureTemplateRecipe,
        parameterPointers: {
          snapshot_id: ["/snapshot_id"],
          manifest_digest: ["/manifest_digest"],
          packet_digest: ["/packet_digest"],
          rule_trust_root_digest: ["/rule_trust_root_digest"],
          protocol_version: ["/protocol_version"],
          execution_metadata_digest: ["/execution_metadata_digest"],
          execution_policy_digest: ["/execution_policy_digest"],
        },
      }),
      evidenceTemplateFromRecipe({
        ...templateArgs,
        profileId: "synthetic.local-document-currentness",
        recipe: currentnessTemplateRecipe,
        parameterPointers: {
          snapshot_id: ["/expected_snapshot_id", "/observed_snapshot_id"],
          manifest_digest: [
            "/expected_manifest_digest",
            "/observed_manifest_digest",
          ],
          checked_at: ["/checked_at"],
        },
      }),
    ];
    evidenceRootCreation = assertOk(evidenceTrust.createRiddleProofEvidenceTrustRoot({
      trust_root_id: "synthetic-company-amendment-evidence",
      trust_root_version: "2026-07-19",
      profile_templates: profileTemplates,
    }), "create reusable pinned evidence trust root");
    const expectedEvidenceTrustRoot = clone(evidenceRootCreation.trust_root);
    resolvedEvidenceTrust = assertOk(evidenceTrust.resolveRiddleProofEvidenceTrustRoot({
      bundle: clone(evidenceRootCreation.bundle),
      expected_trust_root: expectedEvidenceTrustRoot,
    }), "resolve reusable independently pinned evidence trust root");

    const snapshotLeaf = issueLeaf(snapshotRecipe, {
      nonceByte: 11,
      capturedAt: CAPTURED_AT,
      issuedAt: "2026-07-19T20:00:00.500Z",
    });
    const rolesLeaf = issueLeaf(rolesRecipe, {
      nonceByte: 12,
      capturedAt: "2026-07-19T20:00:01.000Z",
      issuedAt: "2026-07-19T20:00:01.500Z",
    });
    const execution = {
      execution_id: `rpex_${"e".repeat(43)}`,
      provider_adapter_id: "company-configured-claude-surface",
      model_id: "configured-by-company-workbench",
      protocol_version: PROTOCOL_VERSION,
      prompt_version: "synthetic-protocol-prompt-v1",
      routing_decision_code: "approved_surface_selected",
      attempt_count: 1,
      escalation_reason_code: "none",
    };
    const approvedExecutionPolicy = {
      version: review.RIDDLE_PROOF_APPROVED_EXECUTION_POLICY_VERSION,
      policy_id: "synthetic-approved-execution",
      policy_version: "1",
      provider_adapter_id: execution.provider_adapter_id,
      allowed_model_ids: [execution.model_id],
      allowed_protocol_versions: [execution.protocol_version],
      allowed_prompt_versions: [execution.prompt_version],
      allowed_routing_decision_codes: [execution.routing_decision_code],
      allowed_escalation_reason_codes: [execution.escalation_reason_code],
      allow_no_escalation: false,
      max_attempt_count: 1,
      deterministic_components: [
        { component_id: "synthetic-document-sensor", component_version: "1" },
        { component_id: "synthetic-required-role-check", component_version: "1" },
      ],
    };
    const executionMetadataDigest = review.digestRiddleProofAgentExecution(execution);
    const executionPolicyDigest = review.digestRiddleProofApprovedExecutionPolicy(
      approvedExecutionPolicy,
    );
    function packetWithEvidence({ packetCharacter = "p", missingEvidence = false } = {}) {
      const absentCertificate = `rpsc_${"f".repeat(64)}`;
      return {
        version: review.RIDDLE_PROOF_PRIVILEGED_REVIEW_PACKET_VERSION,
        packet_id: `rpp_${packetCharacter.repeat(43)}`,
        snapshot_id: snapshotReceipt.snapshot.snapshot_id,
        manifest_digest: snapshotReceipt.snapshot.manifest_digest,
        rule_trust_root: expectedTrustRoot,
        protocol_version: PROTOCOL_VERSION,
        execution_metadata_digest: executionMetadataDigest,
        assertions: [
          {
            entry_id: `rpae_${"d".repeat(43)}`,
            classification: "document_observation",
            issuer: {
              kind: "deterministic",
              component_id: "synthetic-document-sensor",
              component_version: "1",
            },
            evidence_certificate_ids: [snapshotLeaf.certificate.certificate_id],
            blocking: false,
            content: {
              excerpt: "SYNTHETIC PRIVILEGED CONTRACT EXCERPT",
              source_location: "private candidate section 2",
            },
          },
          {
            entry_id: `rpae_${"c".repeat(43)}`,
            classification: "deterministic_check",
            issuer: {
              kind: "deterministic",
              component_id: "synthetic-required-role-check",
              component_version: "1",
            },
            evidence_certificate_ids: [
              missingEvidence ? absentCertificate : rolesLeaf.certificate.certificate_id,
            ],
            blocking: false,
            content: { check: "All four required synthetic document roles are present." },
          },
          {
            entry_id: `rpae_${"i".repeat(43)}`,
            classification: "agent_interpretation",
            issuer: { kind: "agent", execution_id: execution.execution_id },
            evidence_certificate_ids: [snapshotLeaf.certificate.certificate_id],
            blocking: false,
            content: { interpretation: "SYNTHETIC PRIVILEGED LEGAL ANALYSIS" },
          },
          {
            entry_id: `rpae_${"a".repeat(43)}`,
            classification: "agent_proposal",
            issuer: { kind: "agent", execution_id: execution.execution_id },
            evidence_certificate_ids: [rolesLeaf.certificate.certificate_id],
            blocking: false,
            content: { proposed_language: "SYNTHETIC PRIVILEGED PROPOSED LANGUAGE" },
          },
          {
            entry_id: `rpae_${"u".repeat(43)}`,
            classification: "agent_uncertainty",
            issuer: { kind: "agent", execution_id: execution.execution_id },
            evidence_certificate_ids: [snapshotLeaf.certificate.certificate_id],
            blocking: true,
            content: { question: "SYNTHETIC PRIVILEGED QUESTION FOR COUNSEL" },
          },
        ],
        uncertainty_entry_ids: [`rpae_${"u".repeat(43)}`],
      };
    }

    function createReceipt(
      packetBytes,
      checkedRootCertificateId,
      currentnessCertificateId = `rpsc_${"0".repeat(64)}`,
      evidenceTrustRoot = expectedEvidenceTrustRoot,
      issuedAt = "2026-07-19T20:00:05.500Z",
    ) {
      return assertOk(review.createRiddleProofReviewPacketReceipt({
        privileged_packet_bytes: packetBytes,
        opaque_reference_id: `rpar_${"r".repeat(43)}`,
        execution,
        checked_root_certificate_id: checkedRootCertificateId,
        currentness_certificate_id: currentnessCertificateId,
        evidence_trust_root: evidenceTrustRoot,
        issued_at: issuedAt,
      }), "create review packet receipt");
    }

    async function buildReviewScenario(packet, nonceByte) {
      const packetBytes = Buffer.from(JSON.stringify(packet), "utf8");
      const preliminaryReceipt = createReceipt(packetBytes, `rpsc_${"0".repeat(64)}`);
      const parsedPacket = preliminaryReceipt.privileged_packet;
      const procedureObservation = {
        version: "riddle-proof.synthetic-amendment-review-procedure.v1",
        snapshot_id: parsedPacket.snapshot_id,
        manifest_digest: parsedPacket.manifest_digest,
        packet_digest: preliminaryReceipt.receipt.packet.packet_digest,
        rule_trust_root_digest: parsedPacket.rule_trust_root.bundle_digest,
        protocol_version: parsedPacket.protocol_version,
        execution_metadata_digest: executionMetadataDigest,
        execution_policy_digest: executionPolicyDigest,
        assertions_classified: parsedPacket.assertions.every((assertion) =>
          review.RIDDLE_PROOF_REVIEW_ASSERTION_CLASSIFICATIONS.includes(assertion.classification)),
        evidence_linkage_declared: parsedPacket.assertions.every((assertion) =>
          assertion.evidence_certificate_ids.length > 0),
        uncertainties_disclosed: JSON.stringify(parsedPacket.uncertainty_entry_ids)
          === JSON.stringify(parsedPacket.assertions
            .filter((assertion) => assertion.classification === "agent_uncertainty")
            .map((assertion) => assertion.entry_id)),
      };
      assert.deepEqual(
        {
          assertions_classified: procedureObservation.assertions_classified,
          evidence_linkage_declared: procedureObservation.evidence_linkage_declared,
          uncertainties_disclosed: procedureObservation.uncertainties_disclosed,
        },
        {
          assertions_classified: true,
          evidence_linkage_declared: true,
          uncertainties_disclosed: true,
        },
      );
      const procedureLeaf = issueLeaf(deterministicRecipe({
        id: "review-procedure",
        role: "amendment_review_procedure",
        observation: procedureObservation,
        claim: {
          claim_id: "amendment-review-procedure-observed",
          claim_version: "1",
          label: "Assertions were classified and linked and uncertainties were disclosed",
          parameters: {
            snapshot_id: procedureObservation.snapshot_id,
            manifest_digest: procedureObservation.manifest_digest,
            packet_digest: procedureObservation.packet_digest,
            rule_trust_root_digest: procedureObservation.rule_trust_root_digest,
            protocol_version: procedureObservation.protocol_version,
            execution_metadata_digest: procedureObservation.execution_metadata_digest,
            execution_policy_digest: procedureObservation.execution_policy_digest,
          },
        },
      }), {
        nonceByte,
        capturedAt: "2026-07-19T20:00:02.000Z",
        issuedAt: "2026-07-19T20:00:03.000Z",
      });
      const currentness = await recaptureDocumentSnapshotCurrentness({
        expectedReceipt: snapshotReceipt,
        files: [...selections].reverse(),
        checkedAt: CURRENTNESS_AT,
      });
      assert.equal(currentness.status, "current");
      assert.equal(currentness.observed_snapshot_id, snapshotReceipt.snapshot.snapshot_id);
      const currentnessLeaf = issueLeaf(
        createDocumentSnapshotCurrentnessGroundingRecipe(currentness),
        {
          nonceByte: nonceByte + 32,
          capturedAt: CURRENTNESS_AT,
          issuedAt: "2026-07-19T20:00:04.500Z",
        },
      );
      const replayContexts = [
        snapshotLeaf.replay_context,
        rolesLeaf.replay_context,
        procedureLeaf.replay_context,
        currentnessLeaf.replay_context,
      ];
      const composed = assertOk(checked.composeRiddleProofCheckedMeaningClosures({
        expected_rule: packetCompleteRule,
        closures: [
          snapshotLeaf.closure,
          rolesLeaf.closure,
          procedureLeaf.closure,
          currentnessLeaf.closure,
        ],
        issued_at: "2026-07-19T20:00:05.000Z",
        replay_contexts: replayContexts,
        rule_registry: resolvedTrust.rule_registry,
        trusted_rules: resolvedTrust.trusted_rules,
      }), "compose packet-complete checked meaning");
      const finalReceipt = createReceipt(
        packetBytes,
        composed.certificate.certificate_id,
        currentnessLeaf.certificate.certificate_id,
      );
      assert.equal(finalReceipt.receipt.packet.packet_digest, procedureObservation.packet_digest);
      return {
        packetBytes,
        receipt: finalReceipt.receipt,
        checkedClosure: composed.checked_closure,
        rootCertificate: composed.certificate,
        replayContexts,
        evidenceRootDigest: evidenceRootCreation.trust_root.bundle_digest,
        procedureContractDigest: procedureLeaf.materialized.expected_contract.implementation_digest,
        procedureLeaf,
        currentness,
        currentnessLeaf,
      };
    }

    const happy = await buildReviewScenario(packetWithEvidence(), 14);
    assert.deepEqual(happy.receipt.evidence_trust_root, expectedEvidenceTrustRoot);
    const currentnessWitness = {
      version: review.RIDDLE_PROOF_SNAPSHOT_CURRENTNESS_WITNESS_VERSION,
      status: "current",
      expected_snapshot_id: happy.currentness.expected_snapshot_id,
      expected_manifest_digest: happy.currentness.expected_manifest_digest,
      observed_snapshot_id: happy.currentness.observed_snapshot_id,
      observed_manifest_digest: happy.currentness.observed_manifest_digest,
      checked_at: happy.currentness.checked_at,
      certificate_id: happy.currentnessLeaf.certificate.certificate_id,
    };

    const publicLog = JSON.stringify({
      receipt: happy.receipt,
      currentness: currentnessWitness,
      rule_trust_root: expectedTrustRoot,
    });
    for (const sentinel of [
      "SYNTHETIC PRIVILEGED CONTRACT EXCERPT",
      "SYNTHETIC PRIVILEGED LEGAL ANALYSIS",
      "SYNTHETIC PRIVILEGED PROPOSED LANGUAGE",
      "SYNTHETIC PRIVILEGED QUESTION FOR COUNSEL",
      ...Object.values(sourcePaths),
    ]) {
      assert.equal(publicLog.includes(sentinel), false, `content-free log leaked ${sentinel}`);
    }

    const blindTransfer = JSON.parse(JSON.stringify({
      receipt: happy.receipt,
      privileged_packet_base64: happy.packetBytes.toString("base64"),
      checked_closure: happy.checkedClosure,
      rule_bundle: trustRootCreation.bundle,
      evidence_bundle: evidenceRootCreation.bundle,
      currentness_witness: currentnessWitness,
    }));
    assert.equal(Object.hasOwn(blindTransfer, "replay_contexts"), false);
    const blindResolvedTrust = assertOk(trust.resolveRiddleProofRuleTrustRoot({
      bundle: blindTransfer.rule_bundle,
      expected_trust_root: clone(expectedTrustRoot),
    }), "blind consumer resolves only independently pinned rules");
    assertOk(evidenceTrust.resolveRiddleProofEvidenceTrustRoot({
      bundle: blindTransfer.evidence_bundle,
      expected_trust_root: clone(expectedEvidenceTrustRoot),
    }), "blind consumer resolves only independently pinned evidence templates");
    const blindInput = {
      receipt: blindTransfer.receipt,
      privileged_packet_bytes: Buffer.from(blindTransfer.privileged_packet_base64, "base64"),
      checked_closure: blindTransfer.checked_closure,
      evidence_trust_root_bundle: blindTransfer.evidence_bundle,
      expected_evidence_trust_root: clone(expectedEvidenceTrustRoot),
      rule_trust_root_bundle: blindTransfer.rule_bundle,
      expected_rule_trust_root: clone(expectedTrustRoot),
      expected_scope: clone(scope),
      expected_root_certificate_id: happy.rootCertificate.certificate_id,
      expected_packet_complete_rule: clone(packetCompleteRule),
      expected_protocol_version: PROTOCOL_VERSION,
      approved_execution_policy: clone(approvedExecutionPolicy),
      currentness_witness: blindTransfer.currentness_witness,
      verification_time: VERIFICATION_AT,
      max_grounded_age_ms: 10_000,
      max_currentness_age_ms: 10_000,
      max_future_skew_ms: 0,
    };
    assert.equal(Object.hasOwn(blindInput, "replay_contexts"), false);
    // No model callback, network adapter, or model output is consulted here.
    const verified = review.verifyRiddleProofReviewPacket(blindInput);
    assert.equal(verified.ok, true, verified.ok ? undefined : verified.error.message);
    if (!verified.ok) throw new Error(verified.error.message);
    assert.equal(verified.conclusion, "amendment-review-packet-complete");
    assert.equal(verified.legal_correctness_established, false);
    assert.notEqual(verified.conclusion, "submitted_for_legal_review");
    assert.notEqual(verified.conclusion, "legal_approved");
    assert.equal(Object.hasOwn(verified, "submitted_for_legal_review"), false);
    assert.equal(Object.hasOwn(verified, "legal_approved"), false);

    const backdatedReceipt = createReceipt(
      happy.packetBytes,
      happy.rootCertificate.certificate_id,
      happy.currentnessLeaf.certificate.certificate_id,
      expectedEvidenceTrustRoot,
      "2026-07-19T20:00:04.999Z",
    ).receipt;
    const backdatedReceiptResult = review.verifyRiddleProofReviewPacket({
      ...blindInput,
      receipt: backdatedReceipt,
    });
    assert.equal(
      backdatedReceiptResult.ok,
      false,
      "a recomputed receipt predating its exact root unexpectedly verified",
    );
    if (backdatedReceiptResult.ok) throw new Error("backdated receipt unexpectedly verified");
    assert.equal(backdatedReceiptResult.error.code, "receipt_chronology_invalid");

    const futureDatedReceipt = createReceipt(
      happy.packetBytes,
      happy.rootCertificate.certificate_id,
      happy.currentnessLeaf.certificate.certificate_id,
      expectedEvidenceTrustRoot,
      "2026-07-19T20:00:07.001Z",
    ).receipt;
    const futureDatedReceiptResult = review.verifyRiddleProofReviewPacket({
      ...blindInput,
      receipt: futureDatedReceipt,
    });
    assert.equal(
      futureDatedReceiptResult.ok,
      false,
      "a recomputed receipt beyond verification future skew unexpectedly verified",
    );
    if (futureDatedReceiptResult.ok) throw new Error("future-dated receipt unexpectedly verified");
    assert.equal(futureDatedReceiptResult.error.code, "receipt_chronology_invalid");

    const wrongPinnedRootRule = review.verifyRiddleProofReviewPacket({
      ...blindInput,
      expected_packet_complete_rule: clone(alternatePinnedRule),
    });
    assert.equal(
      wrongPinnedRootRule.ok,
      false,
      "a different rule from the same pinned registry unexpectedly matched the root",
    );
    if (wrongPinnedRootRule.ok) {
      throw new Error("a different pinned rule unexpectedly matched the packet root");
    }
    assert.equal(wrongPinnedRootRule.error.code, "checked_root_mismatch");

    const disallowedModel = review.verifyRiddleProofReviewPacket({
      ...blindInput,
      approved_execution_policy: {
        ...clone(approvedExecutionPolicy),
        allowed_model_ids: ["different-approved-model"],
      },
    });
    assert.equal(disallowedModel.ok, false, "an unapproved model identity unexpectedly verified");
    if (disallowedModel.ok) throw new Error("an unapproved model identity unexpectedly verified");
    assert.equal(disallowedModel.error.code, "execution_mismatch");

    const substitutedExecutionPolicy = review.verifyRiddleProofReviewPacket({
      ...blindInput,
      approved_execution_policy: {
        ...clone(approvedExecutionPolicy),
        allowed_model_ids: [execution.model_id, "additional-model"],
      },
    });
    assert.equal(
      substitutedExecutionPolicy.ok,
      false,
      "a substituted but permissive execution policy unexpectedly verified",
    );
    if (substitutedExecutionPolicy.ok) {
      throw new Error("a substituted but permissive execution policy unexpectedly verified");
    }
    assert.equal(substitutedExecutionPolicy.error.code, "checked_root_mismatch");

    const substitutedDefinition = clone(packetCompleteDefinition);
    substitutedDefinition.label = "Substituted permissive review rule";
    const substitutedRootCreation = assertOk(trust.createRiddleProofRuleTrustRoot({
      trust_root_id: trustRootCreation.trust_root.trust_root_id,
      trust_root_version: trustRootCreation.trust_root.trust_root_version,
      rule_definitions: [substitutedDefinition],
    }), "create substituted rule bundle");
    const substitutedResolved = assertOk(trust.resolveRiddleProofRuleTrustRoot({
      bundle: substitutedRootCreation.bundle,
      expected_trust_root: substitutedRootCreation.trust_root,
    }), "resolve substituted bundle under its own identity");
    const substitutedRule = review.verifyRiddleProofReviewPacket({
      ...blindInput,
      rule_trust_root_bundle: substitutedRootCreation.bundle,
    });
    assert.equal(substitutedRule.ok, false, "substituted rule trust unexpectedly verified");
    if (substitutedRule.ok) throw new Error("substituted rule trust unexpectedly verified");
    assert.equal(substitutedRule.error.code, "rule_trust_root_mismatch");

    const substitutedEvidenceTemplates = clone(profileTemplates);
    substitutedEvidenceTemplates[0].contract_template.label =
      "Producer-selected weaker snapshot contract";
    const substitutedEvidenceCreation = assertOk(
      evidenceTrust.createRiddleProofEvidenceTrustRoot({
        trust_root_id: evidenceRootCreation.trust_root.trust_root_id,
        trust_root_version: evidenceRootCreation.trust_root.trust_root_version,
        profile_templates: substitutedEvidenceTemplates,
      }),
      "create substituted evidence template root",
    );
    const substitutedEvidenceBundle = review.verifyRiddleProofReviewPacket({
      ...blindInput,
      evidence_trust_root_bundle: substitutedEvidenceCreation.bundle,
    });
    assert.equal(
      substitutedEvidenceBundle.ok,
      false,
      "substituted evidence bundle unexpectedly verified",
    );
    if (substitutedEvidenceBundle.ok) {
      throw new Error("substituted evidence bundle unexpectedly verified");
    }
    assert.equal(substitutedEvidenceBundle.error.code, "evidence_trust_root_mismatch");
    const producerSelfTrustedEvidence = review.verifyRiddleProofReviewPacket({
      ...blindInput,
      evidence_trust_root_bundle: substitutedEvidenceCreation.bundle,
      expected_evidence_trust_root: substitutedEvidenceCreation.trust_root,
    });
    assert.equal(
      producerSelfTrustedEvidence.ok,
      false,
      "producer self-selected evidence root unexpectedly verified",
    );
    if (producerSelfTrustedEvidence.ok) {
      throw new Error("producer self-selected evidence root unexpectedly verified");
    }
    assert.equal(producerSelfTrustedEvidence.error.code, "evidence_trust_root_mismatch");

    const tamperedPacket = JSON.parse(happy.packetBytes.toString("utf8"));
    tamperedPacket.assertions[0].content.excerpt = "TAMPERED PRIVILEGED CONTRACT EXCERPT";
    const byteTamper = review.verifyRiddleProofReviewPacket({
      ...blindInput,
      privileged_packet_bytes: Buffer.from(JSON.stringify(tamperedPacket), "utf8"),
    });
    assert.equal(byteTamper.ok, false, "tampered privileged bytes unexpectedly verified");
    if (byteTamper.ok) throw new Error("tampered privileged bytes unexpectedly verified");
    assert.equal(byteTamper.error.code, "packet_digest_mismatch");

    const alteredBindingClosure = clone(happy.checkedClosure);
    const alteredBindingGrounding = alteredBindingClosure.grounded_closure.groundings.find(
      (grounding) => grounding.certificate_id === snapshotLeaf.certificate.certificate_id,
    );
    assert.ok(alteredBindingGrounding, "snapshot grounding is present");
    alteredBindingGrounding.receipt.observation.snapshot_id = `rpds_${"x".repeat(43)}`;
    const alteredBinding = review.verifyRiddleProofReviewPacket({
      ...blindInput,
      checked_closure: alteredBindingClosure,
    });
    assert.equal(alteredBinding.ok, false, "altered parameter binding unexpectedly verified");
    if (alteredBinding.ok) throw new Error("altered parameter binding unexpectedly verified");
    assert.equal(alteredBinding.error.code, "evidence_trust_root_mismatch");

    const alteredContractClosure = clone(happy.checkedClosure);
    const alteredContractGrounding = alteredContractClosure.grounded_closure.groundings.find(
      (grounding) => grounding.certificate_id === snapshotLeaf.certificate.certificate_id,
    );
    assert.ok(alteredContractGrounding, "snapshot grounding contract is present");
    alteredContractGrounding.receipt.contract.label = "Producer-selected weaker contract";
    const alteredContract = review.verifyRiddleProofReviewPacket({
      ...blindInput,
      checked_closure: alteredContractClosure,
    });
    assert.equal(alteredContract.ok, false, "altered contract descriptor unexpectedly verified");
    if (alteredContract.ok) throw new Error("altered contract descriptor unexpectedly verified");
    assert.equal(alteredContract.error.code, "evidence_trust_root_mismatch");

    const fabricatedFreshWitness = review.verifyRiddleProofReviewPacket({
      ...blindInput,
      currentness_witness: {
        ...clone(currentnessWitness),
        checked_at: "2026-07-19T20:00:06.000Z",
      },
    });
    assert.equal(fabricatedFreshWitness.ok, false, "fabricated currentness time unexpectedly verified");
    if (fabricatedFreshWitness.ok) throw new Error("fabricated currentness time unexpectedly verified");
    assert.equal(fabricatedFreshWitness.error.code, "currentness_invalid");

    const splitCurrentnessReceipt = createReceipt(
      happy.packetBytes,
      happy.rootCertificate.certificate_id,
      snapshotLeaf.certificate.certificate_id,
    ).receipt;
    const splitCurrentnessIdentity = review.verifyRiddleProofReviewPacket({
      ...blindInput,
      receipt: splitCurrentnessReceipt,
      currentness_witness: {
        ...clone(currentnessWitness),
        certificate_id: snapshotLeaf.certificate.certificate_id,
      },
    });
    assert.equal(
      splitCurrentnessIdentity.ok,
      false,
      "one certificate ID plus another certificate's currentness claim unexpectedly verified",
    );
    if (splitCurrentnessIdentity.ok) {
      throw new Error("split currentness certificate identity unexpectedly verified");
    }
    assert.equal(splitCurrentnessIdentity.error.code, "currentness_invalid");

    // Both currentness certificates below are valid, replayable, and certify
    // the same exact witness. Only the first one is consumed directly by the
    // packet root; the second is merely reachable below the procedure premise.
    // A verifier must not let the receipt select that unrelated reachable ID.
    const secondCurrentnessLeaf = issueLeaf(
      createDocumentSnapshotCurrentnessGroundingRecipe(happy.currentness),
      {
        nonceByte: 91,
        capturedAt: CURRENTNESS_AT,
        issuedAt: "2026-07-19T20:00:04.100Z",
      },
    );
    const nestedProcedure = assertOk(checked.composeRiddleProofCheckedMeaningClosures({
      expected_rule: procedureWithCurrentnessRule,
      closures: [happy.procedureLeaf.closure, secondCurrentnessLeaf.closure],
      issued_at: "2026-07-19T20:00:04.200Z",
      replay_contexts: [
        happy.procedureLeaf.replay_context,
        secondCurrentnessLeaf.replay_context,
      ],
      rule_registry: resolvedTrust.rule_registry,
      trusted_rules: resolvedTrust.trusted_rules,
    }), "compose a nested but non-root currentness certificate");
    const directCurrentnessRoot = assertOk(checked.composeRiddleProofCheckedMeaningClosures({
      expected_rule: packetCompleteRule,
      closures: [
        snapshotLeaf.closure,
        rolesLeaf.closure,
        nestedProcedure.checked_closure,
        happy.currentnessLeaf.closure,
      ],
      issued_at: "2026-07-19T20:00:05.000Z",
      replay_contexts: [
        snapshotLeaf.replay_context,
        rolesLeaf.replay_context,
        happy.procedureLeaf.replay_context,
        secondCurrentnessLeaf.replay_context,
        happy.currentnessLeaf.replay_context,
      ],
      rule_registry: resolvedTrust.rule_registry,
      trusted_rules: resolvedTrust.trusted_rules,
    }), "compose a root whose direct currentness premise differs from the receipt");
    const unrelatedReachableCurrentnessReceipt = createReceipt(
      happy.packetBytes,
      directCurrentnessRoot.certificate.certificate_id,
      secondCurrentnessLeaf.certificate.certificate_id,
    ).receipt;
    const unrelatedReachableCurrentness = review.verifyRiddleProofReviewPacket({
      ...blindInput,
      receipt: unrelatedReachableCurrentnessReceipt,
      checked_closure: directCurrentnessRoot.checked_closure,
      expected_root_certificate_id: directCurrentnessRoot.certificate.certificate_id,
      currentness_witness: {
        ...clone(currentnessWitness),
        certificate_id: secondCurrentnessLeaf.certificate.certificate_id,
      },
    });
    assert.equal(
      unrelatedReachableCurrentness.ok,
      false,
      "a reachable but non-root currentness certificate unexpectedly satisfied the packet",
    );
    if (unrelatedReachableCurrentness.ok) {
      throw new Error("non-root currentness certificate unexpectedly satisfied the packet");
    }
    assert.equal(unrelatedReachableCurrentness.error.code, "currentness_invalid");

    function observationRecipeWithMutation(mutate) {
      const recipe = clone(snapshotRecipe);
      mutate(recipe.observation);
      recipe.observation_json = JSON.stringify(recipe.observation);
      recipe.artifacts[0].bytes_base64 = Buffer.from(
        recipe.observation_json,
        "utf8",
      ).toString("base64");
      return recipe;
    }

    for (const [label, sentinel, mutate, nonceByte] of [
      [
        "root observation field",
        "SYNTHETIC_PRIVILEGED_ROOT_OBSERVATION_SENTINEL",
        (observation) => {
          observation.privileged_smuggle = "SYNTHETIC_PRIVILEGED_ROOT_OBSERVATION_SENTINEL";
        },
        93,
      ],
      [
        "nested observation field",
        "SYNTHETIC_PRIVILEGED_NESTED_OBSERVATION_SENTINEL",
        (observation) => {
          observation.capture.privileged_smuggle =
            "SYNTHETIC_PRIVILEGED_NESTED_OBSERVATION_SENTINEL";
        },
        94,
      ],
      [
        "extra observation array item",
        "SYNTHETIC_PRIVILEGED_ARRAY_ITEM_SENTINEL",
        (observation) => {
          observation.artifacts.push({
            role: "privileged_smuggle",
            media_type: "text/plain",
            byte_length: 1,
            digest: `sha256:${"0".repeat(64)}`,
            privileged_smuggle: "SYNTHETIC_PRIVILEGED_ARRAY_ITEM_SENTINEL",
          });
        },
        95,
      ],
    ]) {
      const hostileRecipe = observationRecipeWithMutation(mutate);
      const hostileSnapshotLeaf = issueLeafWithMaterialized(
        hostileRecipe,
        snapshotLeaf.materialized,
        {
          nonceByte,
          capturedAt: CAPTURED_AT,
          issuedAt: "2026-07-19T20:00:00.500Z",
        },
      );
      const hostileRoot = assertOk(checked.composeRiddleProofCheckedMeaningClosures({
        expected_rule: packetCompleteRule,
        closures: [
          hostileSnapshotLeaf.closure,
          rolesLeaf.closure,
          happy.procedureLeaf.closure,
          happy.currentnessLeaf.closure,
        ],
        issued_at: "2026-07-19T20:00:05.000Z",
        replay_contexts: [
          hostileSnapshotLeaf.replay_context,
          rolesLeaf.replay_context,
          happy.procedureLeaf.replay_context,
          happy.currentnessLeaf.replay_context,
        ],
        rule_registry: resolvedTrust.rule_registry,
        trusted_rules: resolvedTrust.trusted_rules,
      }), `compose hostile ${label}`);
      const serializedHostileClosure = JSON.stringify(hostileRoot.checked_closure);
      assert.equal(
        serializedHostileClosure.includes(hostileRecipe.artifacts[0].bytes_base64),
        true,
        `${label} fixture must serialize its hostile observation bytes`,
      );
      assert.equal(
        Buffer.from(hostileRecipe.artifacts[0].bytes_base64, "base64")
          .toString("utf8").includes(sentinel),
        true,
        `${label} fixture must actually carry the privileged sentinel`,
      );
      const hostileReceipt = createReceipt(
        happy.packetBytes,
        hostileRoot.certificate.certificate_id,
        happy.currentnessLeaf.certificate.certificate_id,
      ).receipt;
      const rejected = review.verifyRiddleProofReviewPacket({
        ...blindInput,
        receipt: hostileReceipt,
        checked_closure: hostileRoot.checked_closure,
        expected_root_certificate_id: hostileRoot.certificate.certificate_id,
      });
      assert.equal(rejected.ok, false, `${label} unexpectedly verified`);
      if (rejected.ok) throw new Error(`${label} unexpectedly verified`);
      assert.equal(rejected.error.code, "evidence_trust_root_mismatch", label);
    }

    const extraArtifactSentinel = "SYNTHETIC_PRIVILEGED_BYTES_MUST_NOT_ENTER_GROUNDING";
    const extraArtifactCurrentnessRecipe = createDocumentSnapshotCurrentnessGroundingRecipe(
      happy.currentness,
    );
    extraArtifactCurrentnessRecipe.artifacts.push({
      artifact_id: "synthetic/producer-selected-privileged-copy.txt",
      role: "producer_selected_privileged_copy",
      media_type: "text/plain",
      bytes_base64: Buffer.from(extraArtifactSentinel, "utf8").toString("base64"),
    });
    const extraArtifactCurrentnessLeaf = issueLeaf(extraArtifactCurrentnessRecipe, {
      nonceByte: 92,
      capturedAt: CURRENTNESS_AT,
      issuedAt: "2026-07-19T20:00:04.100Z",
    });
    const procedureContainingExtraArtifact = assertOk(
      checked.composeRiddleProofCheckedMeaningClosures({
        expected_rule: procedureWithCurrentnessRule,
        closures: [happy.procedureLeaf.closure, extraArtifactCurrentnessLeaf.closure],
        issued_at: "2026-07-19T20:00:04.200Z",
        replay_contexts: [
          happy.procedureLeaf.replay_context,
          extraArtifactCurrentnessLeaf.replay_context,
        ],
        rule_registry: resolvedTrust.rule_registry,
        trusted_rules: resolvedTrust.trusted_rules,
      }),
      "compose producer-selected extra artifact below the procedure premise",
    );
    const extraArtifactRoot = assertOk(checked.composeRiddleProofCheckedMeaningClosures({
      expected_rule: packetCompleteRule,
      closures: [
        snapshotLeaf.closure,
        rolesLeaf.closure,
        procedureContainingExtraArtifact.checked_closure,
        happy.currentnessLeaf.closure,
      ],
      issued_at: "2026-07-19T20:00:05.000Z",
      replay_contexts: [
        snapshotLeaf.replay_context,
        rolesLeaf.replay_context,
        happy.procedureLeaf.replay_context,
        extraArtifactCurrentnessLeaf.replay_context,
        happy.currentnessLeaf.replay_context,
      ],
      rule_registry: resolvedTrust.rule_registry,
      trusted_rules: resolvedTrust.trusted_rules,
    }), "compose a root containing an unauthorized extra grounding artifact");
    assert.equal(
      JSON.stringify(extraArtifactRoot.checked_closure).includes(
        Buffer.from(extraArtifactSentinel, "utf8").toString("base64"),
      ),
      true,
      "hostile fixture must actually carry the privileged sentinel",
    );
    const extraArtifactReceipt = createReceipt(
      happy.packetBytes,
      extraArtifactRoot.certificate.certificate_id,
      happy.currentnessLeaf.certificate.certificate_id,
    ).receipt;
    const producerSelectedExtraArtifact = review.verifyRiddleProofReviewPacket({
      ...blindInput,
      receipt: extraArtifactReceipt,
      checked_closure: extraArtifactRoot.checked_closure,
      expected_root_certificate_id: extraArtifactRoot.certificate.certificate_id,
    });
    assert.equal(
      producerSelectedExtraArtifact.ok,
      false,
      "a producer-selected extra grounding artifact unexpectedly verified",
    );
    if (producerSelectedExtraArtifact.ok) {
      throw new Error("producer-selected extra grounding artifact unexpectedly verified");
    }
    assert.equal(producerSelectedExtraArtifact.error.code, "evidence_trust_root_mismatch");

    await writeFile(sourcePaths.candidate, "SYNTHETIC CHANGED AMENDMENT BYTES\n");
    const changedCurrentness = await recaptureDocumentSnapshotCurrentness({
      expectedReceipt: snapshotReceipt,
      files: selections,
      checkedAt: CURRENTNESS_AT,
    });
    assert.equal(changedCurrentness.status, "changed");
    const changedSource = review.verifyRiddleProofReviewPacket({
      ...blindInput,
      currentness_witness: {
        ...changedCurrentness,
        certificate_id: happy.currentnessLeaf.certificate.certificate_id,
      },
    });
    assert.equal(changedSource.ok, false, "changed source currentness unexpectedly verified");
    if (changedSource.ok) throw new Error("changed source currentness unexpectedly verified");
    assert.equal(changedSource.error.code, "currentness_invalid");

    await writeFile(
      sourcePaths.candidate,
      "SYNTHETIC FIRST AMENDMENT\nChange: extend term.\n",
    );
    const missingEvidenceScenario = await buildReviewScenario(packetWithEvidence({
      packetCharacter: "m",
      missingEvidence: true,
    }), 15);
    assert.equal(happy.evidenceRootDigest, missingEvidenceScenario.evidenceRootDigest);
    assert.equal(happy.evidenceRootDigest, expectedEvidenceTrustRoot.bundle_digest);
    assert.deepEqual(
      missingEvidenceScenario.receipt.evidence_trust_root,
      expectedEvidenceTrustRoot,
    );
    assert.notEqual(
      happy.procedureContractDigest,
      missingEvidenceScenario.procedureContractDigest,
      "two matter-specific contracts should materialize under one stable evidence root",
    );
    const missingEvidence = review.verifyRiddleProofReviewPacket({
      ...blindInput,
      receipt: clone(missingEvidenceScenario.receipt),
      privileged_packet_bytes: Buffer.from(missingEvidenceScenario.packetBytes),
      checked_closure: clone(missingEvidenceScenario.checkedClosure),
      expected_root_certificate_id: missingEvidenceScenario.rootCertificate.certificate_id,
      currentness_witness: {
        version: review.RIDDLE_PROOF_SNAPSHOT_CURRENTNESS_WITNESS_VERSION,
        status: "current",
        expected_snapshot_id: missingEvidenceScenario.currentness.expected_snapshot_id,
        expected_manifest_digest: missingEvidenceScenario.currentness.expected_manifest_digest,
        observed_snapshot_id: missingEvidenceScenario.currentness.observed_snapshot_id,
        observed_manifest_digest: missingEvidenceScenario.currentness.observed_manifest_digest,
        checked_at: missingEvidenceScenario.currentness.checked_at,
        certificate_id: missingEvidenceScenario.currentnessLeaf.certificate.certificate_id,
      },
    });
    assert.equal(missingEvidence.ok, false, "unresolved assertion evidence unexpectedly verified");
    if (missingEvidence.ok) throw new Error("unresolved assertion evidence unexpectedly verified");
    assert.equal(missingEvidence.error.code, "evidence_unresolved");

    process.stdout.write(`${JSON.stringify({
      ok: true,
      suite: "riddle-proof.local-review-protocol-e2e",
      snapshot_id: snapshotReceipt.snapshot.snapshot_id,
      root_certificate_id: happy.rootCertificate.certificate_id,
      grounded_leaves: 4,
      assertion_count: verified.assertion_count,
      uncertainty_count: verified.uncertainty_count,
      blind_serialized_replay: true,
      model_invocations_during_verification: 0,
      negative_cases: [
        "rule_substitution",
        "wrong_pinned_root_rule",
        "evidence_root_substitution",
        "producer_self_trusted_evidence_root",
        "altered_evidence_binding",
        "altered_contract_descriptor",
        "execution_policy_substitution",
        "unapproved_model",
        "backdated_receipt",
        "future_dated_receipt",
        "changed_source_currentness",
        "fabricated_currentness_time",
        "split_currentness_identity_and_claim",
      "reachable_non_root_currentness_certificate",
      "root_observation_field_smuggling",
      "nested_observation_field_smuggling",
      "extra_observation_array_item_smuggling",
      "producer_selected_extra_grounding_artifact",
        "packet_byte_tamper",
        "missing_evidence",
        "packet_complete_is_not_human_approval",
      ],
    })}\n`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
