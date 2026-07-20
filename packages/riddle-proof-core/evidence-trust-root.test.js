import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";

import {
  createRiddleProofEvidenceTrustRoot,
  materializeRiddleProofEvidenceTrustProfile,
  resolveRiddleProofEvidenceTrustRoot,
  validateRiddleProofEvidenceObservationSchema,
} from "./dist/evidence-trust-root.js";
import { createRiddleProofGroundedDeclarativeJsonContract } from "./dist/grounded-evidence.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function signer(name) {
  const { publicKey } = generateKeyPairSync("ed25519");
  return {
    key_id: `fixture-key-${name}`,
    public_key_spki_base64: publicKey
      .export({ format: "der", type: "spki" })
      .toString("base64"),
  };
}

// A reusable authority pins the recipe for deriving matter-specific contracts,
// not those matter-specific values or their resulting registration digests.
function reusableTemplate(trustedSigner) {
  return {
    mode: "declarative_template",
    profile_id: "fixture.local-currentness",
    profile_version: "1",
    collector: {
      collector_id: "fixture.local-currentness-collector",
      collector_version: "1",
      implementation_digest: `sha256:${"7".repeat(64)}`,
    },
    sensor_template: {
      kind: "other",
      name: "fixture-local-files",
      version: "1",
      metadata: { mode: "synthetic-read-only", source_mutation: false },
      observed_target_binding: "expected_scope.target",
    },
    trusted_signer: trustedSigner,
    verifier_definition: {
      verifier_id: "fixture-currentness-verifier",
      verifier_version: "1",
      program: {
        artifact: {
          artifact_id: "document-snapshot-currentness.json",
          role: "document_snapshot_currentness",
          media_type: "application/json",
        },
        pointer: "",
      },
    },
    observation_schema: {
      kind: "object",
      properties: {
        status: { kind: "literal", value: "current" },
        expected_snapshot_id: { kind: "claim_parameter", parameter: "snapshot_id" },
        observed_snapshot_id: { kind: "claim_parameter", parameter: "snapshot_id" },
        expected_manifest_digest: { kind: "claim_parameter", parameter: "manifest_digest" },
        observed_manifest_digest: { kind: "claim_parameter", parameter: "manifest_digest" },
        checked_at: { kind: "claim_parameter", parameter: "checked_at" },
        comparison: {
          kind: "object",
          properties: {
            status: { kind: "literal", value: "unchanged" },
          },
        },
      },
    },
    contract_template: {
      contract_id: "fixture-currentness-contract",
      contract_version: "1",
      label: "Selected bytes match the expected snapshot",
      claim: {
        claim_id: "local-document-snapshot-current-at-check",
        claim_version: "1",
        label: "Selected bytes matched the expected snapshot at checked_at",
      },
      required_assertions: [
        { op: "equals", source: "observation", pointer: "/status", value: "current" },
        { op: "equals", source: "observation", pointer: "/comparison/status", value: "unchanged" },
        { op: "type_is", source: "scope", pointer: "/target", type: "string" },
      ],
      parameter_bindings: [
        {
          parameter: "snapshot_id",
          observation_pointers: ["/expected_snapshot_id", "/observed_snapshot_id"],
          allowed_json_types: ["string"],
        },
        {
          parameter: "manifest_digest",
          observation_pointers: ["/expected_manifest_digest", "/observed_manifest_digest"],
          allowed_json_types: ["string"],
        },
        {
          parameter: "checked_at",
          observation_pointers: ["/checked_at"],
          allowed_json_types: ["string"],
        },
      ],
    },
    required_artifact_roles: ["document_snapshot_currentness"],
  };
}

function matter(number) {
  const snapshotId = `rpds_${String(number).repeat(43)}`;
  const manifestDigest = `sha256:${String(number).repeat(64)}`;
  const checkedAt = `2026-07-${String(19 + number).padStart(2, "0")}T01:02:03.000Z`;
  return {
    claim: {
      claim_id: "local-document-snapshot-current-at-check",
      claim_version: "1",
      label: "Selected bytes matched the expected snapshot at checked_at",
      parameters: {
        snapshot_id: snapshotId,
        manifest_digest: manifestDigest,
        checked_at: checkedAt,
      },
    },
    observation: {
      status: "current",
      expected_snapshot_id: snapshotId,
      observed_snapshot_id: snapshotId,
      expected_manifest_digest: manifestDigest,
      observed_manifest_digest: manifestDigest,
      checked_at: checkedAt,
      comparison: { status: "unchanged" },
    },
    scope: {
      repository: "fixture",
      revision: `revision-${number}`,
      environment: "local",
      target: `company-document-${number}`,
      proof_attempt: `attempt-${number}`,
    },
  };
}

const exactObservationSchema = {
  kind: "object",
  properties: {
    version: { kind: "literal", value: "fixture-observation.v1" },
    matter_id: { kind: "claim_parameter", parameter: "matter_id" },
    capture: {
      kind: "object",
      properties: {
        stable: { kind: "literal", value: true },
        digest: { kind: "sha256" },
      },
    },
    ordered_counts: {
      kind: "array",
      items: [
        { kind: "integer", minimum: 0, maximum: 10 },
        { kind: "integer", minimum: 10, maximum: 20 },
      ],
    },
  },
};
const exactObservation = {
  version: "fixture-observation.v1",
  matter_id: "matter-1",
  capture: { stable: true, digest: `sha256:${"1".repeat(64)}` },
  ordered_counts: [3, 17],
};
const schemaInput = (observation) => ({
  schema: exactObservationSchema,
  observation,
  claim_parameters: { matter_id: "matter-1" },
});
assert.equal(validateRiddleProofEvidenceObservationSchema(schemaInput(exactObservation)).ok, true);
for (const [label, mutate] of [
  ["extra root field", (observation) => { observation.unexpected = false; }],
  ["extra nested field", (observation) => { observation.capture.unexpected = false; }],
  ["extra tuple item", (observation) => { observation.ordered_counts.push(18); }],
  ["reordered tuple", (observation) => { observation.ordered_counts.reverse(); }],
  ["invalid digest", (observation) => { observation.capture.digest = "sha256:not-a-digest"; }],
  ["non-integer", (observation) => { observation.ordered_counts[0] = 3.5; }],
  ["wrong claim parameter", (observation) => { observation.matter_id = "matter-2"; }],
]) {
  const observation = clone(exactObservation);
  mutate(observation);
  assert.equal(
    validateRiddleProofEvidenceObservationSchema(schemaInput(observation)).ok,
    false,
    label,
  );
}

const reusableSigner = signer("reusable-template");
const templateDefinition = reusableTemplate(reusableSigner);
const templateRoot = createRiddleProofEvidenceTrustRoot({
  trust_root_id: "fixture.reusable-evidence",
  trust_root_version: "1",
  profile_templates: [templateDefinition],
});
assert.equal(templateRoot.ok, true, templateRoot.ok ? undefined : templateRoot.error.message);
const templateResolved = resolveRiddleProofEvidenceTrustRoot({
  bundle: clone(templateRoot.bundle),
  expected_trust_root: clone(templateRoot.trust_root),
});
assert.equal(
  templateResolved.ok,
  true,
  templateResolved.ok ? undefined : templateResolved.error.message,
);
const reusableProfile = templateResolved.trusted_profiles[0];
assert.equal("expected_sensor" in reusableProfile, false);
assert.equal("contract_registration" in reusableProfile, false);
assert.equal("expected_contract" in reusableProfile, false);

const firstMatter = matter(1);
const secondMatter = matter(2);
const firstMaterialized = materializeRiddleProofEvidenceTrustProfile({
  profile: reusableProfile,
  claim: firstMatter.claim,
  observation: firstMatter.observation,
  expected_scope: firstMatter.scope,
});
assert.equal(
  firstMaterialized.ok,
  true,
  firstMaterialized.ok ? undefined : firstMaterialized.error.message,
);
const secondMaterialized = materializeRiddleProofEvidenceTrustProfile({
  profile: reusableProfile,
  claim: secondMatter.claim,
  observation: secondMatter.observation,
  expected_scope: secondMatter.scope,
});
assert.equal(
  secondMaterialized.ok,
  true,
  secondMaterialized.ok ? undefined : secondMaterialized.error.message,
);

// Both matters use the same independently pinned root, while the deterministic
// concrete contracts and scope-bound sensors are correctly matter-specific.
assert.equal(templateRoot.trust_root.bundle_digest, templateResolved.trust_root.bundle_digest);
assert.notEqual(
  firstMaterialized.expected_contract.implementation_digest,
  secondMaterialized.expected_contract.implementation_digest,
);
assert.equal(
  firstMaterialized.replay_authority.expected_sensor.observed_target,
  firstMatter.scope.target,
);
assert.equal(
  secondMaterialized.replay_authority.expected_sensor.observed_target,
  secondMatter.scope.target,
);
assert.deepEqual(
  firstMaterialized.replay_authority.trusted_signers,
  [reusableProfile.trusted_signer],
);

const exactActualAccepted = materializeRiddleProofEvidenceTrustProfile({
  profile: reusableProfile,
  claim: firstMatter.claim,
  observation: firstMatter.observation,
  expected_scope: firstMatter.scope,
  actual_contract_registration: clone(firstMaterialized.contract_registration),
});
assert.equal(
  exactActualAccepted.ok,
  true,
  exactActualAccepted.ok ? undefined : exactActualAccepted.error.message,
);

// Assertion, binding, and allowed-type declaration order is canonical.
const reorderedTemplate = clone(templateDefinition);
reorderedTemplate.contract_template.required_assertions.reverse();
reorderedTemplate.contract_template.parameter_bindings.reverse();
const reorderedRoot = createRiddleProofEvidenceTrustRoot({
  trust_root_id: "fixture.reusable-evidence",
  trust_root_version: "1",
  profile_templates: [reorderedTemplate],
});
assert.equal(reorderedRoot.ok, true, reorderedRoot.ok ? undefined : reorderedRoot.error.message);
assert.deepEqual(reorderedRoot.bundle, templateRoot.bundle);
assert.deepEqual(reorderedRoot.trust_root, templateRoot.trust_root);

const wrongObservation = clone(firstMatter.observation);
wrongObservation.expected_snapshot_id = `rpds_${"9".repeat(43)}`;
const wrongObservationRejected = materializeRiddleProofEvidenceTrustProfile({
  profile: reusableProfile,
  claim: firstMatter.claim,
  observation: wrongObservation,
  expected_scope: firstMatter.scope,
});
assert.equal(wrongObservationRejected.ok, false);
assert.equal(wrongObservationRejected.error.code, "observation_mismatch");

for (const [label, mutate] of [
  ["extra root observation field", (observation) => {
    observation.privileged_smuggle = "PRIVILEGED_ROOT_SENTINEL";
  }],
  ["extra nested observation field", (observation) => {
    observation.comparison.privileged_smuggle = "PRIVILEGED_NESTED_SENTINEL";
  }],
]) {
  const observation = clone(firstMatter.observation);
  mutate(observation);
  const rejected = materializeRiddleProofEvidenceTrustProfile({
    profile: reusableProfile,
    claim: firstMatter.claim,
    observation,
    expected_scope: firstMatter.scope,
  });
  assert.equal(rejected.ok, false, label);
  assert.equal(rejected.error.code, "observation_mismatch", label);
}

const wrongTypeClaim = clone(firstMatter.claim);
const wrongTypeObservation = clone(firstMatter.observation);
wrongTypeClaim.parameters.checked_at = 42;
wrongTypeObservation.checked_at = 42;
const wrongTypeRejected = materializeRiddleProofEvidenceTrustProfile({
  profile: reusableProfile,
  claim: wrongTypeClaim,
  observation: wrongTypeObservation,
  expected_scope: firstMatter.scope,
});
assert.equal(wrongTypeRejected.ok, false);
assert.equal(wrongTypeRejected.error.code, "parameter_mismatch");

const missingParameterClaim = clone(firstMatter.claim);
delete missingParameterClaim.parameters.checked_at;
const missingParameterRejected = materializeRiddleProofEvidenceTrustProfile({
  profile: reusableProfile,
  claim: missingParameterClaim,
  observation: firstMatter.observation,
  expected_scope: firstMatter.scope,
});
assert.equal(missingParameterRejected.ok, false);
assert.equal(missingParameterRejected.error.code, "parameter_mismatch");

const extraParameterClaim = clone(firstMatter.claim);
extraParameterClaim.parameters.model_selected_override = true;
const extraParameterRejected = materializeRiddleProofEvidenceTrustProfile({
  profile: reusableProfile,
  claim: extraParameterClaim,
  observation: firstMatter.observation,
  expected_scope: firstMatter.scope,
});
assert.equal(extraParameterRejected.ok, false);
assert.equal(extraParameterRejected.error.code, "parameter_mismatch");

const wrongClaimLabel = clone(firstMatter.claim);
wrongClaimLabel.label = "A model-selected weaker meaning";
const wrongClaimRejected = materializeRiddleProofEvidenceTrustProfile({
  profile: reusableProfile,
  claim: wrongClaimLabel,
  observation: firstMatter.observation,
  expected_scope: firstMatter.scope,
});
assert.equal(wrongClaimRejected.ok, false);
assert.equal(wrongClaimRejected.error.code, "profile_mismatch");

function createAlteredRegistration(mutate) {
  const definition = clone(firstMaterialized.contract_definition);
  mutate(definition);
  const altered = createRiddleProofGroundedDeclarativeJsonContract(definition);
  assert.equal(altered.ok, true, altered.ok ? undefined : altered.error.message);
  return altered.registration;
}

for (const [label, registration] of [
  ["weakened program", createAlteredRegistration((definition) => definition.program.all.pop())],
  ["altered id", createAlteredRegistration((definition) => { definition.contract_id = "fixture-other"; })],
  ["altered label", createAlteredRegistration((definition) => { definition.label = "Weaker label"; })],
  ["altered assertion", createAlteredRegistration((definition) => {
    definition.program.all[0] = {
      op: "exists",
      source: "observation",
      pointer: "/status",
    };
  })],
]) {
  const alteredRejected = materializeRiddleProofEvidenceTrustProfile({
    profile: reusableProfile,
    claim: firstMatter.claim,
    observation: firstMatter.observation,
    expected_scope: firstMatter.scope,
    actual_contract_registration: registration,
  });
  assert.equal(alteredRejected.ok, false, label);
  assert.equal(alteredRejected.error.code, "contract_mismatch", label);
}

for (const [label, mutate] of [
  ["binding pointer substitution", (template) => {
    template.contract_template.parameter_bindings[0].observation_pointers[0] = "/status";
  }],
  ["binding type substitution", (template) => {
    template.contract_template.parameter_bindings[0].allowed_json_types = ["string", "number"];
  }],
  ["sensor substitution", (template) => {
    template.sensor_template.name = "substitute-sensor";
  }],
  ["signer substitution", (template) => {
    template.trusted_signer = signer("substitute-template-signer");
  }],
  ["collector substitution", (template) => {
    template.collector.implementation_digest = `sha256:${"a".repeat(64)}`;
  }],
  ["verifier substitution", (template) => {
    template.verifier_definition.program.pointer = "/payload";
  }],
  ["artifact id substitution", (template) => {
    template.verifier_definition.program.artifact.artifact_id = "producer-selected.json";
  }],
  ["artifact role substitution", (template) => {
    template.verifier_definition.program.artifact.role = "producer_selected_role";
    template.required_artifact_roles = ["producer_selected_role"];
  }],
  ["contract assertion substitution", (template) => {
    template.contract_template.required_assertions[0].value = "not-current";
  }],
  ["contract label substitution", (template) => {
    template.contract_template.label = "A weaker substituted contract";
  }],
  ["observation schema substitution", (template) => {
    template.observation_schema.properties.comparison.properties.status.value = "producer-selected";
  }],
]) {
  const substitutedDefinition = clone(templateDefinition);
  mutate(substitutedDefinition);
  const substitutedRoot = createRiddleProofEvidenceTrustRoot({
    trust_root_id: "fixture.reusable-evidence",
    trust_root_version: "1",
    profile_templates: [substitutedDefinition],
  });
  assert.equal(substitutedRoot.ok, true, label);
  assert.notEqual(
    substitutedRoot.trust_root.bundle_digest,
    templateRoot.trust_root.bundle_digest,
    label,
  );
  const substitutionRejected = resolveRiddleProofEvidenceTrustRoot({
    bundle: substitutedRoot.bundle,
    expected_trust_root: templateRoot.trust_root,
  });
  assert.equal(substitutionRejected.ok, false, label);
  assert.equal(substitutionRejected.error.code, "trust_root_mismatch", label);
}

const extraArtifactRoleTemplate = clone(templateDefinition);
extraArtifactRoleTemplate.required_artifact_roles.push("producer_selected_extra_role");
const extraArtifactRoleRejected = createRiddleProofEvidenceTrustRoot({
  trust_root_id: "fixture.reusable-evidence",
  trust_root_version: "1",
  profile_templates: [extraArtifactRoleTemplate],
});
assert.equal(extraArtifactRoleRejected.ok, false);
assert.equal(extraArtifactRoleRejected.error.code, "invalid_profile_template");

const substitutedArtifactMediaTypeTemplate = clone(templateDefinition);
substitutedArtifactMediaTypeTemplate.verifier_definition.program.artifact.media_type = "text/plain";
const substitutedArtifactMediaTypeRejected = createRiddleProofEvidenceTrustRoot({
  trust_root_id: "fixture.reusable-evidence",
  trust_root_version: "1",
  profile_templates: [substitutedArtifactMediaTypeTemplate],
});
assert.equal(substitutedArtifactMediaTypeRejected.ok, false);
assert.equal(substitutedArtifactMediaTypeRejected.error.code, "invalid_profile_template");

const unboundSchemaParameter = clone(templateDefinition);
unboundSchemaParameter.observation_schema.properties.status = {
  kind: "claim_parameter",
  parameter: "producer_override",
};
const unboundSchemaParameterRejected = createRiddleProofEvidenceTrustRoot({
  trust_root_id: "fixture.reusable-evidence",
  trust_root_version: "1",
  profile_templates: [unboundSchemaParameter],
});
assert.equal(unboundSchemaParameterRejected.ok, false);
assert.equal(unboundSchemaParameterRejected.error.code, "invalid_profile_template");

const executableSchema = clone(templateDefinition);
executableSchema.observation_schema.properties.comparison = {
  kind: "object",
  properties: { status: () => true },
};
const executableSchemaRejected = createRiddleProofEvidenceTrustRoot({
  trust_root_id: "fixture.reusable-evidence",
  trust_root_version: "1",
  profile_templates: [executableSchema],
});
assert.equal(executableSchemaRejected.ok, false);
assert.equal(executableSchemaRejected.error.code, "invalid_profile_template");

const duplicateTemplateProfile = createRiddleProofEvidenceTrustRoot({
  trust_root_id: "fixture.reusable-evidence",
  trust_root_version: "1",
  profile_templates: [templateDefinition, clone(templateDefinition)],
});
assert.equal(duplicateTemplateProfile.ok, false);
assert.equal(duplicateTemplateProfile.error.code, "duplicate_profile");

const duplicateClaimTemplate = clone(templateDefinition);
duplicateClaimTemplate.profile_id = "fixture.other-currentness-profile";
duplicateClaimTemplate.profile_version = "2";
const duplicateTemplateClaim = createRiddleProofEvidenceTrustRoot({
  trust_root_id: "fixture.reusable-evidence",
  trust_root_version: "1",
  profile_templates: [templateDefinition, duplicateClaimTemplate],
});
assert.equal(duplicateTemplateClaim.ok, false);
assert.equal(duplicateTemplateClaim.error.code, "duplicate_claim");

const callbackTemplate = {
  ...templateDefinition,
  verifier_definition: {
    ...templateDefinition.verifier_definition,
    verify: () => true,
  },
};
const callbackTemplateRejected = createRiddleProofEvidenceTrustRoot({
  trust_root_id: "fixture.reusable-evidence",
  trust_root_version: "1",
  profile_templates: [callbackTemplate],
});
assert.equal(callbackTemplateRejected.ok, false);
assert.equal(callbackTemplateRejected.error.code, "invalid_profile_template");

const functionAssertionTemplate = clone(templateDefinition);
functionAssertionTemplate.contract_template.required_assertions[0].value = () => true;
const functionAssertionRejected = createRiddleProofEvidenceTrustRoot({
  trust_root_id: "fixture.reusable-evidence",
  trust_root_version: "1",
  profile_templates: [functionAssertionTemplate],
});
assert.equal(functionAssertionRejected.ok, false);
assert.equal(functionAssertionRejected.error.code, "invalid_profile_template");

const literalTargetTemplate = clone(templateDefinition);
literalTargetTemplate.sensor_template.observed_target = "producer-selected-target";
const literalTargetRejected = createRiddleProofEvidenceTrustRoot({
  trust_root_id: "fixture.reusable-evidence",
  trust_root_version: "1",
  profile_templates: [literalTargetTemplate],
});
assert.equal(literalTargetRejected.ok, false);
assert.equal(literalTargetRejected.error.code, "invalid_profile_template");

const bundleWithExternalCallback = clone(templateRoot.bundle);
bundleWithExternalCallback.profiles[0].verifier_registration.verify = () => true;
const externalBundleRejected = resolveRiddleProofEvidenceTrustRoot({
  bundle: bundleWithExternalCallback,
  expected_trust_root: templateRoot.trust_root,
});
assert.equal(externalBundleRejected.ok, false);
assert.equal(externalBundleRejected.error.code, "invalid_bundle");

const forgedSignerFingerprint = clone(templateRoot.bundle);
forgedSignerFingerprint.profiles[0].expected_signer.public_key_spki_sha256 =
  `sha256:${"0".repeat(64)}`;
const forgedSignerRejected = resolveRiddleProofEvidenceTrustRoot({
  bundle: forgedSignerFingerprint,
  expected_trust_root: templateRoot.trust_root,
});
assert.equal(forgedSignerRejected.ok, false);
assert.equal(forgedSignerRejected.error.code, "invalid_bundle");

const rootInputWithExtraField = createRiddleProofEvidenceTrustRoot({
  trust_root_id: "fixture.reusable-evidence",
  trust_root_version: "1",
  profile_templates: [templateDefinition],
  selected_by_producer: true,
});
assert.equal(rootInputWithExtraField.ok, false);
assert.equal(rootInputWithExtraField.error.code, "invalid_input");

console.log("riddle-proof-core reusable evidence template trust root tests: ok");
