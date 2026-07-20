import assert from "node:assert/strict";

import {
  createRiddleProofRuleTrustRoot,
  resolveRiddleProofRuleTrustRoot,
} from "./dist/rule-trust-root.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function definition(ruleId, label) {
  return {
    rule_id: ruleId,
    rule_version: "1",
    label,
    premises: [
      {
        claim_id: `fixture.${ruleId}.input`,
        claim_version: "1",
        parameters: { snapshot_digest: { op: "any" } },
      },
    ],
    conclusion: {
      claim_id: `fixture.${ruleId}.output`,
      claim_version: "1",
      label: `${label} conclusion`,
      parameters: {
        snapshot_digest: {
          op: "from_premise",
          premise_index: 0,
          parameter: "snapshot_digest",
        },
      },
    },
    constraints: {
      all_of: true,
      ordered_premise_chronology: true,
    },
  };
}

const alpha = definition("fixture.alpha", "Alpha rule");
const zeta = definition("fixture.zeta", "Zeta rule");

const created = createRiddleProofRuleTrustRoot({
  trust_root_id: "fixture.generic-rules",
  trust_root_version: "2026-07-19",
  rule_definitions: [zeta, alpha],
});
assert.equal(created.ok, true, created.ok ? undefined : created.error.message);
assert.deepEqual(created.bundle.rules.map((rule) => rule.rule_id), ["fixture.alpha", "fixture.zeta"]);
assert.match(created.trust_root.bundle_digest, /^sha256:[0-9a-f]{64}$/u);

// Input order is not a source of identity. Both the serialized bundle and its
// digest use the canonical rule_id/rule_version ordering.
const reversed = createRiddleProofRuleTrustRoot({
  trust_root_id: "fixture.generic-rules",
  trust_root_version: "2026-07-19",
  rule_definitions: [alpha, zeta],
});
assert.equal(reversed.ok, true, reversed.ok ? undefined : reversed.error.message);
assert.deepEqual(reversed.bundle, created.bundle);
assert.deepEqual(reversed.trust_root, created.trust_root);

const shuffledBundle = clone(created.bundle);
shuffledBundle.rules.reverse();
const resolved = resolveRiddleProofRuleTrustRoot({
  bundle: shuffledBundle,
  expected_trust_root: clone(created.trust_root),
});
assert.equal(resolved.ok, true, resolved.ok ? undefined : resolved.error.message);
assert.deepEqual(resolved.bundle, created.bundle);
assert.deepEqual(resolved.rule_registry, created.bundle.rules);
assert.deepEqual(
  resolved.trusted_rules,
  created.bundle.rules.map(({ definition: _definition, ...ruleRef }) => ruleRef),
);

const duplicate = createRiddleProofRuleTrustRoot({
  trust_root_id: "fixture.generic-rules",
  trust_root_version: "2026-07-19",
  rule_definitions: [alpha, clone(alpha)],
});
assert.equal(duplicate.ok, false);
assert.equal(duplicate.error.code, "duplicate_rule");

// A replacement bundle cannot choose the identity against which it is
// resolved. Even the same public bundle and rule identities acquire a new
// digest when any complete definition changes.
const changedAlpha = clone(alpha);
changedAlpha.label = "Permissive substituted Alpha rule";
const substituted = createRiddleProofRuleTrustRoot({
  trust_root_id: "fixture.generic-rules",
  trust_root_version: "2026-07-19",
  rule_definitions: [changedAlpha, zeta],
});
assert.equal(substituted.ok, true, substituted.ok ? undefined : substituted.error.message);
assert.notEqual(substituted.trust_root.bundle_digest, created.trust_root.bundle_digest);
const duplicateIdentityWithDifferentDigest = createRiddleProofRuleTrustRoot({
  trust_root_id: "fixture.generic-rules",
  trust_root_version: "2026-07-19",
  rule_definitions: [alpha, changedAlpha],
});
assert.equal(duplicateIdentityWithDifferentDigest.ok, false);
assert.equal(duplicateIdentityWithDifferentDigest.error.code, "duplicate_rule");
const substitutionResolution = resolveRiddleProofRuleTrustRoot({
  bundle: substituted.bundle,
  expected_trust_root: created.trust_root,
});
assert.equal(substitutionResolution.ok, false);
assert.equal(substitutionResolution.error.code, "trust_root_mismatch");

const otherIdentity = createRiddleProofRuleTrustRoot({
  trust_root_id: "fixture.attacker-selected-rules",
  trust_root_version: "2026-07-19",
  rule_definitions: [alpha, zeta],
});
assert.equal(otherIdentity.ok, true, otherIdentity.ok ? undefined : otherIdentity.error.message);
const identitySubstitution = resolveRiddleProofRuleTrustRoot({
  bundle: otherIdentity.bundle,
  expected_trust_root: created.trust_root,
});
assert.equal(identitySubstitution.ok, false);
assert.equal(identitySubstitution.error.code, "trust_root_mismatch");

const extraCreationField = createRiddleProofRuleTrustRoot({
  trust_root_id: "fixture.generic-rules",
  trust_root_version: "2026-07-19",
  rule_definitions: [alpha],
  selected_by_model: true,
});
assert.equal(extraCreationField.ok, false);
assert.equal(extraCreationField.error.code, "invalid_input");

const incompatibleTrustRootCode = createRiddleProofRuleTrustRoot({
  trust_root_id: "company generic rules",
  trust_root_version: "v 1",
  rule_definitions: [alpha],
});
assert.equal(incompatibleTrustRootCode.ok, false);
assert.equal(incompatibleTrustRootCode.error.code, "invalid_input");

const bundleWithExtraField = clone(created.bundle);
bundleWithExtraField.model_override = true;
const extraBundleField = resolveRiddleProofRuleTrustRoot({
  bundle: bundleWithExtraField,
  expected_trust_root: created.trust_root,
});
assert.equal(extraBundleField.ok, false);
assert.equal(extraBundleField.error.code, "invalid_bundle");

const registrationWithExtraField = clone(created.bundle);
registrationWithExtraField.rules[0].allow_unreviewed = true;
const extraRegistrationField = resolveRiddleProofRuleTrustRoot({
  bundle: registrationWithExtraField,
  expected_trust_root: created.trust_root,
});
assert.equal(extraRegistrationField.ok, false);
assert.equal(extraRegistrationField.error.code, "invalid_bundle");

const registrationWithForgedDigest = clone(created.bundle);
registrationWithForgedDigest.rules[0].implementation_digest = `sha256:${"0".repeat(64)}`;
const forgedRegistration = resolveRiddleProofRuleTrustRoot({
  bundle: registrationWithForgedDigest,
  expected_trust_root: created.trust_root,
});
assert.equal(forgedRegistration.ok, false);
assert.equal(forgedRegistration.error.code, "invalid_bundle");

const referenceWithExtraField = {
  ...clone(created.trust_root),
  supplied_by_run: true,
};
const extraReferenceField = resolveRiddleProofRuleTrustRoot({
  bundle: created.bundle,
  expected_trust_root: referenceWithExtraField,
});
assert.equal(extraReferenceField.ok, false);
assert.equal(extraReferenceField.error.code, "invalid_bundle");

console.log("riddle-proof-core rule trust root tests: ok");
