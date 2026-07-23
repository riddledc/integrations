import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as checked from "../../packages/riddle-proof-core/dist/checked-meaning.js";
import * as grounded from "../../packages/riddle-proof-core/dist/grounded-evidence.js";
import {
  captureDocumentSnapshot,
  createDocumentSnapshotCurrentnessGroundingRecipe,
  recaptureDocumentSnapshotCurrentness,
  verifyDocumentSnapshotReceipt,
} from "../../packages/riddle-proof-local/dist/index.js";

/*
 * This is a public, synthetic capability experiment. It deliberately uses
 * full local receipts so independent verifiers can recompute relationships
 * from the exact captured bytes. Real integrations should keep content in an
 * approved boundary and normally retain digest_only as the receipt default.
 */

const SOURCE_CLAIM = "synthetic-document.source-schema-valid";
const SPEC_CLAIM = "synthetic-document.transform-spec-admissible";
const TRANSFORM_CLAIM = "synthetic-document.output-exact-application";
const RENDER_CLAIM = "synthetic-document.render-faithful";
const CURRENTNESS_CLAIM = "local-document-snapshot-current-at-check";

const CLAIMS = {
  admissibleInputs: "synthetic-document.admissible-inputs",
  exactCurrentOutput: "synthetic-document.exact-current-output",
  faithfulCurrentRender: "synthetic-document.faithful-current-render",
  conformingTransformation: "synthetic-document.conforming-transformation",
  presentableTransformation: "synthetic-document.transformation-presentable",
};

const SOURCE_PARAMETERS = [
  "source_snapshot_id",
  "source_manifest_digest",
  "schema_version",
];
const SPEC_PARAMETERS = [
  "spec_snapshot_id",
  "spec_manifest_digest",
  "transform_version",
  "operation",
  "target_path",
];
const TRANSFORM_PARAMETERS = [
  "source_snapshot_id",
  "source_manifest_digest",
  "spec_snapshot_id",
  "spec_manifest_digest",
  "output_snapshot_id",
  "output_manifest_digest",
];
const RENDER_PARAMETERS = [
  "output_snapshot_id",
  "output_manifest_digest",
  "render_snapshot_id",
  "render_manifest_digest",
  "renderer_version",
];
const CURRENTNESS_PARAMETERS = ["snapshot_id", "manifest_digest", "checked_at"];

const ADMISSIBLE_INPUT_PARAMETERS = [
  ...SOURCE_PARAMETERS,
  ...SPEC_PARAMETERS,
];
const EXACT_OUTPUT_PARAMETERS = [
  ...TRANSFORM_PARAMETERS,
  "output_checked_at",
];
const FAITHFUL_RENDER_PARAMETERS = [
  ...RENDER_PARAMETERS,
  "render_checked_at",
];
const CONFORMING_PARAMETERS = [
  ...ADMISSIBLE_INPUT_PARAMETERS,
  "output_snapshot_id",
  "output_manifest_digest",
  "output_checked_at",
];
const ROOT_PARAMETERS = [
  ...CONFORMING_PARAMETERS,
  "render_snapshot_id",
  "render_manifest_digest",
  "renderer_version",
  "render_checked_at",
];

const scope = {
  repository: "synthetic/document-transformation",
  revision: "synthetic-document-transformation-v1",
  environment: "local-read-only",
  target: "synthetic-document-transform",
  proof_attempt: "semantic-compaction-document-1",
};

const collector = {
  collector_id: "riddle-proof.synthetic-document-transformation",
  collector_version: "1",
  implementation_digest: sha256("synthetic-document-collector.v1"),
};

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyBytes = privateKey.export({ format: "der", type: "pkcs8" });
const publicKeyBytes = publicKey.export({ format: "der", type: "spki" });
const keyId = "synthetic-document-transformation-key";
const signerFingerprint = sha256(publicKeyBytes);

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function at(second) {
  return `2026-07-22T02:00:${String(second).padStart(2, "0")}.000Z`;
}

function exactKeys(value, keys, context) {
  assert.equal(value !== null && typeof value === "object" && !Array.isArray(value), true, context);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${context} keys`);
}

function validateDocument(value) {
  exactKeys(value, ["version", "document_id", "title", "sections"], "document");
  assert.equal(value.version, "synthetic.document.v1");
  assert.equal(typeof value.document_id, "string");
  assert.equal(typeof value.title, "string");
  assert.equal(Array.isArray(value.sections), true);
  assert.equal(value.sections.length > 0, true);
  const ids = new Set();
  for (const section of value.sections) {
    exactKeys(section, ["id", "text"], "document section");
    assert.equal(typeof section.id, "string");
    assert.equal(typeof section.text, "string");
    assert.equal(ids.has(section.id), false, "section ids must be unique");
    ids.add(section.id);
  }
  return value;
}

function validateTransform(value) {
  exactKeys(
    value,
    ["version", "operation", "section_id", "expected_text", "replacement_text"],
    "transform",
  );
  assert.equal(value.version, "synthetic.transform.v1");
  assert.equal(value.operation, "replace_section_text");
  assert.equal(typeof value.section_id, "string");
  assert.equal(typeof value.expected_text, "string");
  assert.equal(typeof value.replacement_text, "string");
  return value;
}

function applyTransform(sourceValue, transformValue) {
  const source = validateDocument(jsonClone(sourceValue));
  const transform = validateTransform(jsonClone(transformValue));
  const index = source.sections.findIndex((section) => section.id === transform.section_id);
  assert.notEqual(index, -1, "transform section must exist");
  assert.equal(source.sections[index].text, transform.expected_text, "expected text must match");
  source.sections[index].text = transform.replacement_text;
  return source;
}

function renderDocumentV1(documentValue) {
  const document = validateDocument(jsonClone(documentValue));
  return `${document.title}\n\n${document.sections
    .map((section) => `${section.id}: ${section.text}`)
    .join("\n")}\n`;
}

function renderDocumentV2(documentValue) {
  const document = validateDocument(jsonClone(documentValue));
  return `# ${document.title}\n\n${document.sections
    .map((section) => `## ${section.id}\n${section.text}`)
    .join("\n\n")}\n`;
}

function decodeArtifactJson(artifact, context) {
  assert.ok(artifact, `${context} artifact must exist`);
  assert.equal(artifact.media_type, "application/json");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(artifact.bytes);
  return JSON.parse(text);
}

function receiptFromVerifierInput(input, captureRole, documentRole, mediaType) {
  const artifact = input.artifacts.find((candidate) => candidate.role === captureRole);
  const receipt = decodeArtifactJson(artifact, captureRole);
  const verification = verifyDocumentSnapshotReceipt(receipt);
  assert.equal(verification.ok, true, verification.errors.join("; "));
  assert.equal(receipt.artifact_policy, "full");
  assert.equal(receipt.snapshot.artifacts.length, 1);
  const documentArtifact = receipt.snapshot.artifacts[0];
  assert.equal(documentArtifact.role, documentRole);
  assert.equal(documentArtifact.media_type, mediaType);
  assert.equal(typeof documentArtifact.content_base64, "string");
  const bytes = Buffer.from(documentArtifact.content_base64, "base64");
  return { receipt, documentArtifact, bytes };
}

function parseJsonDocumentReceipt(input, captureRole, documentRole) {
  const extracted = receiptFromVerifierInput(
    input,
    captureRole,
    documentRole,
    "application/json",
  );
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(extracted.bytes));
  return { ...extracted, value };
}

function createExternalVerifierSpec({ id, implementation, verify }) {
  const verifierRef = {
    verifier_id: id,
    verifier_version: "1",
    implementation_digest: sha256(implementation),
    trust_basis: { kind: "external_registry" },
  };
  return {
    verifierRef,
    makeRegistration: () => ({
      ...jsonClone(verifierRef),
      verify,
    }),
  };
}

const sourceVerifier = createExternalVerifierSpec({
  id: "synthetic-document.source-schema-verifier",
  implementation: "synthetic-document.source-schema-verifier.v1",
  verify(input) {
    const source = parseJsonDocumentReceipt(input, "source_receipt", "source");
    const document = validateDocument(source.value);
    return {
      observation_version: "synthetic.source-schema-observation.v1",
      source_snapshot_id: source.receipt.snapshot.snapshot_id,
      source_manifest_digest: source.receipt.snapshot.manifest_digest,
      schema_version: document.version,
    };
  },
});

const specVerifier = createExternalVerifierSpec({
  id: "synthetic-document.transform-policy-verifier",
  implementation: "synthetic-document.transform-policy-verifier.v1",
  verify(input) {
    const spec = parseJsonDocumentReceipt(input, "spec_receipt", "spec");
    const transform = validateTransform(spec.value);
    assert.equal(transform.section_id, "target", "only the synthetic target section is admissible");
    return {
      observation_version: "synthetic.transform-policy-observation.v1",
      spec_snapshot_id: spec.receipt.snapshot.snapshot_id,
      spec_manifest_digest: spec.receipt.snapshot.manifest_digest,
      transform_version: transform.version,
      operation: transform.operation,
      target_path: `/sections/${transform.section_id}`,
    };
  },
});

const transformVerifier = createExternalVerifierSpec({
  id: "synthetic-document.exact-transform-verifier",
  implementation: "synthetic-document.exact-transform-verifier.v1",
  verify(input) {
    const source = parseJsonDocumentReceipt(input, "source_receipt", "source");
    const spec = parseJsonDocumentReceipt(input, "spec_receipt", "spec");
    const output = parseJsonDocumentReceipt(input, "output_receipt", "output");
    const expected = applyTransform(source.value, spec.value);
    assert.deepEqual(validateDocument(output.value), expected, "output must be the exact transformation");
    return {
      observation_version: "synthetic.exact-transform-observation.v1",
      source_snapshot_id: source.receipt.snapshot.snapshot_id,
      source_manifest_digest: source.receipt.snapshot.manifest_digest,
      spec_snapshot_id: spec.receipt.snapshot.snapshot_id,
      spec_manifest_digest: spec.receipt.snapshot.manifest_digest,
      output_snapshot_id: output.receipt.snapshot.snapshot_id,
      output_manifest_digest: output.receipt.snapshot.manifest_digest,
    };
  },
});

function makeRenderVerifier(rendererVersion, renderer) {
  return createExternalVerifierSpec({
    id: `synthetic-document.render-verifier-${rendererVersion}`,
    implementation: `synthetic-document.render-verifier.${rendererVersion}`,
    verify(input) {
      const output = parseJsonDocumentReceipt(input, "output_receipt", "output");
      const render = receiptFromVerifierInput(input, "render_receipt", "render", "text/plain");
      const observedRender = new TextDecoder("utf-8", { fatal: true }).decode(render.bytes);
      assert.equal(observedRender, renderer(output.value), "render must exactly match the renderer");
      return {
        observation_version: "synthetic.render-observation.v1",
        output_snapshot_id: output.receipt.snapshot.snapshot_id,
        output_manifest_digest: output.receipt.snapshot.manifest_digest,
        render_snapshot_id: render.receipt.snapshot.snapshot_id,
        render_manifest_digest: render.receipt.snapshot.manifest_digest,
        renderer_version: rendererVersion,
      };
    },
  });
}

const renderVerifierV1 = makeRenderVerifier("synthetic-renderer.v1", renderDocumentV1);
const renderVerifierV2 = makeRenderVerifier("synthetic-renderer.v2", renderDocumentV2);

function receiptArtifact(artifactId, role, receipt) {
  return {
    artifact_id: artifactId,
    role,
    media_type: "application/json",
    bytes_base64: Buffer.from(JSON.stringify(receipt), "utf8").toString("base64"),
  };
}

function makeClaim(claimId, label, parameters) {
  return {
    claim_id: claimId,
    claim_version: "1",
    label,
    parameters: jsonClone(parameters),
  };
}

function makeExactContract(name, claim, observation) {
  const built = grounded.createRiddleProofGroundedDeclarativeJsonContract({
    contract_id: `synthetic-document.${name}.contract`,
    contract_version: "1",
    label: `Accept exact synthetic ${name} observation`,
    claim,
    program: {
      all: Object.entries(observation).map(([key, value]) => ({
        op: "equals",
        source: "observation",
        pointer: `/${key}`,
        value,
      })),
    },
  });
  assert.equal(built.ok, true, built.ok ? undefined : built.error.message);
  return built;
}

function createSensor(name) {
  return {
    kind: "other",
    name: `synthetic-document-${name}`,
    version: "1",
    observed_target: scope.target,
    metadata: { public_synthetic: true, read_only_capture: true },
  };
}

function issueGroundedLeaf({
  name,
  nonceByte,
  capturedAt,
  verificationTime,
  artifacts,
  verifierRef,
  makeVerifierRegistration,
  contract,
}) {
  const nonce = Buffer.alloc(32, nonceByte).toString("base64url");
  const sensor = createSensor(name);
  const created = grounded.createRiddleProofSignedCaptureBundle({
    scope,
    nonce,
    captured_at: capturedAt,
    collector,
    sensor,
    verifier: verifierRef,
    artifacts,
    signing_key: {
      key_id: keyId,
      private_key_pkcs8_base64: privateKeyBytes.toString("base64"),
    },
  });
  assert.equal(created.ok, true, created.ok ? undefined : created.error.message);
  if (!created.ok) throw new Error(created.error.message);

  const policy = {
    expected_scope: scope,
    expected_nonce: nonce,
    expected_collector: collector,
    expected_sensor: sensor,
    expected_verifier: verifierRef,
    expected_signer: {
      key_id: keyId,
      public_key_spki_sha256: signerFingerprint,
    },
    verification_time: verificationTime,
    max_capture_age_ms: 120_000,
    max_future_skew_ms: 0,
    required_artifact_roles: artifacts.map((artifact) => artifact.role),
  };
  const trustedSigners = [{
    key_id: keyId,
    public_key_spki_base64: publicKeyBytes.toString("base64"),
  }];
  const configuration = {
    policy,
    trusted_signers: trustedSigners,
    verifier_registry: [makeVerifierRegistration()],
    contract_registry: [contract.registration],
    expected_contract: contract.contract_ref,
  };
  const issued = grounded.createRiddleProofGroundedSemanticCertificate({
    bundle: created.bundle,
    ...configuration,
    issued_at: verificationTime,
  });
  assert.equal(issued.ok, true, issued.ok ? undefined : issued.error.message);
  if (!issued.ok) throw new Error(issued.error.message);

  const groundedAtomic = grounded.createRiddleProofGroundedSemanticAtomicCertificateClosure({
    certificate: issued.certificate,
    grounding: issued.grounding,
    configuration,
  });
  assert.equal(
    groundedAtomic.ok,
    true,
    groundedAtomic.ok ? undefined : groundedAtomic.error.message,
  );
  if (!groundedAtomic.ok) throw new Error(groundedAtomic.error.message);

  const freshContext = () => ({
    certificate_id: issued.certificate.certificate_id,
    policy: jsonClone(policy),
    trusted_signers: jsonClone(trustedSigners),
    verifier_registry: [makeVerifierRegistration()],
    contract_registry: [jsonClone(contract.registration)],
    expected_contract: jsonClone(contract.contract_ref),
  });
  const initialContext = freshContext();
  const atomic = checked.createRiddleProofCheckedMeaningAtomicClosure({
    grounded_closure: groundedAtomic.grounded_closure,
    replay_contexts: [initialContext],
  });
  assert.equal(atomic.ok, true, atomic.ok ? undefined : atomic.error.message);
  if (!atomic.ok) throw new Error(atomic.error.message);

  const leaf = {
    name,
    certificate: issued.certificate,
    checked: atomic.checked_closure,
    initialContext,
    freshContext,
  };
  leaf.leaves = [leaf];
  return leaf;
}

function issueExternalLeaf({
  name,
  nonceByte,
  capturedAt,
  verificationTime,
  artifacts,
  verifier,
  claim,
  observation,
}) {
  const contract = makeExactContract(name, claim, observation);
  return issueGroundedLeaf({
    name,
    nonceByte,
    capturedAt,
    verificationTime,
    artifacts,
    verifierRef: verifier.verifierRef,
    makeVerifierRegistration: verifier.makeRegistration,
    contract,
  });
}

function issueCurrentnessLeaf({ name, nonceByte, currentness, verificationTime }) {
  const recipe = createDocumentSnapshotCurrentnessGroundingRecipe(currentness);
  const verifier = grounded.createRiddleProofGroundedDeclarativeJsonVerifier(
    recipe.verifier_definition,
  );
  const contract = grounded.createRiddleProofGroundedDeclarativeJsonContract(
    recipe.contract_definition,
  );
  assert.equal(verifier.ok, true, verifier.ok ? undefined : verifier.error.message);
  assert.equal(contract.ok, true, contract.ok ? undefined : contract.error.message);
  if (!verifier.ok || !contract.ok) throw new Error("currentness definitions failed");
  return issueGroundedLeaf({
    name,
    nonceByte,
    capturedAt: currentness.checked_at,
    verificationTime,
    artifacts: recipe.artifacts,
    verifierRef: verifier.verifier_ref,
    makeVerifierRegistration: () => jsonClone(verifier.registration),
    contract,
  });
}

function anyParameters(names) {
  return Object.fromEntries(names.map((name) => [name, { op: "any" }]));
}

function selected(premiseIndex, parameter) {
  return { op: "from_premise", premise_index: premiseIndex, parameter };
}

function projectedParameters(selections) {
  return Object.fromEntries(selections.map(([name, premiseIndex, sourceName = name]) =>
    [name, selected(premiseIndex, sourceName)]));
}

function equality(leftPremise, leftParameter, rightPremise, rightParameter = leftParameter) {
  return {
    members: [
      { premise_index: leftPremise, parameter: leftParameter },
      { premise_index: rightPremise, parameter: rightParameter },
    ],
  };
}

const ruleDefinitions = {
  admissibleInputs: {
    rule_id: "synthetic-document.compose-admissible-inputs",
    rule_version: "1",
    label: "Bind a schema-valid source to an admissible transform specification",
    premises: [
      { claim_id: SOURCE_CLAIM, claim_version: "1", parameters: anyParameters(SOURCE_PARAMETERS) },
      { claim_id: SPEC_CLAIM, claim_version: "1", parameters: anyParameters(SPEC_PARAMETERS) },
    ],
    conclusion: {
      claim_id: CLAIMS.admissibleInputs,
      claim_version: "1",
      label: "The exact source and transform specification form admissible inputs",
      parameters: projectedParameters([
        ...SOURCE_PARAMETERS.map((name) => [name, 0]),
        ...SPEC_PARAMETERS.map((name) => [name, 1]),
      ]),
    },
    constraints: { all_of: true, ordered_premise_chronology: true, max_age_ms: 120_000 },
  },
  exactCurrentOutput: {
    rule_id: "synthetic-document.compose-exact-current-output",
    rule_version: "1",
    label: "Bind an exact transformation to the current output snapshot",
    premises: [
      {
        claim_id: TRANSFORM_CLAIM,
        claim_version: "1",
        parameters: anyParameters(TRANSFORM_PARAMETERS),
      },
      {
        claim_id: CURRENTNESS_CLAIM,
        claim_version: "1",
        parameters: anyParameters(CURRENTNESS_PARAMETERS),
      },
    ],
    conclusion: {
      claim_id: CLAIMS.exactCurrentOutput,
      claim_version: "1",
      label: "The exact transformed output matched its snapshot at the output check",
      parameters: projectedParameters([
        ...TRANSFORM_PARAMETERS.map((name) => [name, 0]),
        ["output_checked_at", 1, "checked_at"],
      ]),
    },
    constraints: {
      all_of: true,
      parameter_equalities: [
        equality(0, "output_snapshot_id", 1, "snapshot_id"),
        equality(0, "output_manifest_digest", 1, "manifest_digest"),
      ],
      ordered_premise_chronology: true,
      max_age_ms: 120_000,
    },
  },
  faithfulCurrentRender: {
    rule_id: "synthetic-document.compose-faithful-current-render",
    rule_version: "1",
    label: "Bind a faithful render to the current render snapshot",
    premises: [
      {
        claim_id: RENDER_CLAIM,
        claim_version: "1",
        parameters: anyParameters(RENDER_PARAMETERS),
      },
      {
        claim_id: CURRENTNESS_CLAIM,
        claim_version: "1",
        parameters: anyParameters(CURRENTNESS_PARAMETERS),
      },
    ],
    conclusion: {
      claim_id: CLAIMS.faithfulCurrentRender,
      claim_version: "1",
      label: "The faithful render matched its snapshot at the render check",
      parameters: projectedParameters([
        ...RENDER_PARAMETERS.map((name) => [name, 0]),
        ["render_checked_at", 1, "checked_at"],
      ]),
    },
    constraints: {
      all_of: true,
      parameter_equalities: [
        equality(0, "render_snapshot_id", 1, "snapshot_id"),
        equality(0, "render_manifest_digest", 1, "manifest_digest"),
      ],
      ordered_premise_chronology: true,
      max_age_ms: 120_000,
    },
  },
  conformingTransformation: {
    rule_id: "synthetic-document.compose-conforming-transformation",
    rule_version: "1",
    label: "Bind admissible inputs to their exact current output",
    premises: [
      {
        claim_id: CLAIMS.admissibleInputs,
        claim_version: "1",
        parameters: anyParameters(ADMISSIBLE_INPUT_PARAMETERS),
      },
      {
        claim_id: CLAIMS.exactCurrentOutput,
        claim_version: "1",
        parameters: anyParameters(EXACT_OUTPUT_PARAMETERS),
      },
    ],
    conclusion: {
      claim_id: CLAIMS.conformingTransformation,
      claim_version: "1",
      label: "The admissible transform produced the exact current output",
      parameters: projectedParameters([
        ...ADMISSIBLE_INPUT_PARAMETERS.map((name) => [name, 0]),
        ["output_snapshot_id", 1],
        ["output_manifest_digest", 1],
        ["output_checked_at", 1],
      ]),
    },
    constraints: {
      all_of: true,
      parameter_equalities: [
        equality(0, "source_snapshot_id", 1),
        equality(0, "source_manifest_digest", 1),
        equality(0, "spec_snapshot_id", 1),
        equality(0, "spec_manifest_digest", 1),
      ],
      ordered_premise_chronology: true,
      max_age_ms: 120_000,
    },
  },
  root: {
    rule_id: "synthetic-document.compose-presentable-transformation",
    rule_version: "1",
    label: "Bind a conforming transformation to its faithful current render",
    premises: [
      {
        claim_id: CLAIMS.conformingTransformation,
        claim_version: "1",
        parameters: anyParameters(CONFORMING_PARAMETERS),
      },
      {
        claim_id: CLAIMS.faithfulCurrentRender,
        claim_version: "1",
        parameters: anyParameters(FAITHFUL_RENDER_PARAMETERS),
      },
    ],
    conclusion: {
      claim_id: CLAIMS.presentableTransformation,
      claim_version: "1",
      label: "The exact admissible synthetic transformation had a faithful current render",
      parameters: projectedParameters([
        ...CONFORMING_PARAMETERS.map((name) => [name, 0]),
        ["render_snapshot_id", 1],
        ["render_manifest_digest", 1],
        ["renderer_version", 1],
        ["render_checked_at", 1],
      ]),
    },
    constraints: {
      all_of: true,
      parameter_equalities: [
        equality(0, "output_snapshot_id", 1),
        equality(0, "output_manifest_digest", 1),
      ],
      ordered_premise_chronology: true,
      max_age_ms: 120_000,
    },
  },
};

function buildRuleSet() {
  const byName = {};
  for (const [name, definition] of Object.entries(ruleDefinitions)) {
    const built = checked.createRiddleProofCheckedMeaningRule({ definition });
    assert.equal(built.ok, true, built.ok ? undefined : built.error.message);
    if (!built.ok) throw new Error(built.error.message);
    byName[name] = built;
  }
  return {
    byName,
    registry: Object.values(byName).map((rule) => rule.registration),
    trusted: Object.values(byName).map((rule) => rule.rule_ref),
  };
}

const rules = buildRuleSet();

function uniqueLeaves(nodes) {
  const byId = new Map();
  for (const node of nodes) {
    for (const leaf of node.leaves) byId.set(leaf.certificate.certificate_id, leaf);
  }
  return [...byId.values()];
}

function composeAttempt(ruleName, nodes, issuedAt, ruleSet = rules) {
  const leaves = uniqueLeaves(nodes);
  return {
    leaves,
    result: checked.composeRiddleProofCheckedMeaningClosures({
      expected_rule: ruleSet.byName[ruleName].rule_ref,
      closures: nodes.map((node) => node.checked),
      issued_at: issuedAt,
      replay_contexts: leaves.map((leaf) => leaf.initialContext),
      rule_registry: ruleSet.registry,
      trusted_rules: ruleSet.trusted,
    }),
  };
}

function composeNode(ruleName, nodes, issuedAt, ruleSet = rules) {
  const attempted = composeAttempt(ruleName, nodes, issuedAt, ruleSet);
  assert.equal(
    attempted.result.ok,
    true,
    attempted.result.ok ? undefined : attempted.result.error.message,
  );
  if (!attempted.result.ok) throw new Error(attempted.result.error.message);
  return {
    name: ruleName,
    certificate: attempted.result.certificate,
    checked: attempted.result.checked_closure,
    leaves: attempted.leaves,
  };
}

function certificateById(node, certificateId) {
  return node.checked.grounded_closure.closure.certificates.find(
    (certificate) => certificate.certificate_id === certificateId,
  );
}

function expandExplanation(explanation) {
  const byId = new Map(explanation.nodes.map((node) =>
    [node.certificate_id, node]));
  const expand = (certificateId) => {
    const node = byId.get(certificateId);
    assert.ok(node, `certificate ${certificateId} must resolve`);
    if (node.kind === "grounded_leaf") {
      return {
        kind: "leaf",
        certificate_id: node.certificate_id,
        claim_id: node.claim.claim_id,
        evidence_roles: node.evidence.map((evidence) => evidence.role),
      };
    }
    return {
      kind: "composition",
      certificate_id: node.certificate_id,
      claim_id: node.claim.claim_id,
      rule_id: node.checked_rule.rule_ref.rule_id,
      premises: node.premise_certificate_ids.map(expand),
    };
  };
  return expand(explanation.root_certificate_id);
}

function preorderClaims(expansion) {
  return [
    expansion.claim_id,
    ...(expansion.kind === "composition"
      ? expansion.premises.flatMap(preorderClaims)
      : []),
  ];
}

async function captureOne(path, role, capturedAt) {
  return captureDocumentSnapshot({
    files: [{ role, path, mediaType: role === "render" ? "text/plain" : "application/json" }],
    artifactPolicy: "full",
    capturedAt,
  });
}

function sourceObservation(receipt) {
  return {
    observation_version: "synthetic.source-schema-observation.v1",
    source_snapshot_id: receipt.snapshot.snapshot_id,
    source_manifest_digest: receipt.snapshot.manifest_digest,
    schema_version: "synthetic.document.v1",
  };
}

function specObservation(receipt, spec) {
  return {
    observation_version: "synthetic.transform-policy-observation.v1",
    spec_snapshot_id: receipt.snapshot.snapshot_id,
    spec_manifest_digest: receipt.snapshot.manifest_digest,
    transform_version: spec.version,
    operation: spec.operation,
    target_path: `/sections/${spec.section_id}`,
  };
}

function transformObservation(sourceReceipt, specReceipt, outputReceipt) {
  return {
    observation_version: "synthetic.exact-transform-observation.v1",
    source_snapshot_id: sourceReceipt.snapshot.snapshot_id,
    source_manifest_digest: sourceReceipt.snapshot.manifest_digest,
    spec_snapshot_id: specReceipt.snapshot.snapshot_id,
    spec_manifest_digest: specReceipt.snapshot.manifest_digest,
    output_snapshot_id: outputReceipt.snapshot.snapshot_id,
    output_manifest_digest: outputReceipt.snapshot.manifest_digest,
  };
}

function renderObservation(outputReceipt, renderReceipt, rendererVersion) {
  return {
    observation_version: "synthetic.render-observation.v1",
    output_snapshot_id: outputReceipt.snapshot.snapshot_id,
    output_manifest_digest: outputReceipt.snapshot.manifest_digest,
    render_snapshot_id: renderReceipt.snapshot.snapshot_id,
    render_manifest_digest: renderReceipt.snapshot.manifest_digest,
    renderer_version: rendererVersion,
  };
}

const fixtureRoot = await mkdtemp(join(tmpdir(), "riddle-proof-document-transform-"));

try {
  const paths = {
    source: join(fixtureRoot, "source.json"),
    spec: join(fixtureRoot, "transform.json"),
    output: join(fixtureRoot, "output.json"),
    render: join(fixtureRoot, "rendered.txt"),
    alternateSpec: join(fixtureRoot, "alternate-transform.json"),
    alternateOutput: join(fixtureRoot, "alternate-output.json"),
    alternateRender: join(fixtureRoot, "alternate-rendered.txt"),
  };
  const source = {
    version: "synthetic.document.v1",
    document_id: "synthetic-doc-1",
    title: "Synthetic Transformation",
    sections: [
      { id: "alpha", text: "Keep alpha" },
      { id: "target", text: "Old value" },
      { id: "omega", text: "Keep omega" },
    ],
  };
  const spec = {
    version: "synthetic.transform.v1",
    operation: "replace_section_text",
    section_id: "target",
    expected_text: "Old value",
    replacement_text: "New value",
  };
  const output = applyTransform(source, spec);
  await Promise.all([
    writeFile(paths.source, `${JSON.stringify(source, null, 2)}\n`, "utf8"),
    writeFile(paths.spec, `${JSON.stringify(spec, null, 2)}\n`, "utf8"),
    writeFile(paths.output, `${JSON.stringify(output, null, 2)}\n`, "utf8"),
    writeFile(paths.render, renderDocumentV1(output), "utf8"),
  ]);

  const sourceReceipt = await captureOne(paths.source, "source", at(0));
  const specReceipt = await captureOne(paths.spec, "spec", at(1));
  const outputReceipt = await captureOne(paths.output, "output", at(2));
  const renderReceipt = await captureOne(paths.render, "render", at(3));

  const sourceLeaf = issueExternalLeaf({
    name: "source-schema",
    nonceByte: 1,
    capturedAt: at(0),
    verificationTime: at(4),
    artifacts: [receiptArtifact("source-receipt.json", "source_receipt", sourceReceipt)],
    verifier: sourceVerifier,
    claim: makeClaim(
      SOURCE_CLAIM,
      "The exact synthetic source matched its declared schema",
      Object.fromEntries(SOURCE_PARAMETERS.map((name) => [name, sourceObservation(sourceReceipt)[name]])),
    ),
    observation: sourceObservation(sourceReceipt),
  });
  const specLeaf = issueExternalLeaf({
    name: "transform-policy",
    nonceByte: 2,
    capturedAt: at(1),
    verificationTime: at(5),
    artifacts: [receiptArtifact("spec-receipt.json", "spec_receipt", specReceipt)],
    verifier: specVerifier,
    claim: makeClaim(
      SPEC_CLAIM,
      "The exact synthetic transform specification was admissible",
      Object.fromEntries(SPEC_PARAMETERS.map((name) => [name, specObservation(specReceipt, spec)[name]])),
    ),
    observation: specObservation(specReceipt, spec),
  });
  const transformLeaf = issueExternalLeaf({
    name: "exact-transform",
    nonceByte: 3,
    capturedAt: at(3),
    verificationTime: at(6),
    artifacts: [
      receiptArtifact("output-receipt.json", "output_receipt", outputReceipt),
      receiptArtifact("source-receipt.json", "source_receipt", sourceReceipt),
      receiptArtifact("spec-receipt.json", "spec_receipt", specReceipt),
    ],
    verifier: transformVerifier,
    claim: makeClaim(
      TRANSFORM_CLAIM,
      "The exact output was recomputed from the source and transform",
      Object.fromEntries(TRANSFORM_PARAMETERS.map((name) =>
        [name, transformObservation(sourceReceipt, specReceipt, outputReceipt)[name]])),
    ),
    observation: transformObservation(sourceReceipt, specReceipt, outputReceipt),
  });
  const transformClaimParameters = Object.fromEntries(
    TRANSFORM_PARAMETERS.map((name) =>
      [name, transformObservation(sourceReceipt, specReceipt, outputReceipt)[name]]),
  );
  assert.deepEqual(transformLeaf.certificate.claim.parameters, transformClaimParameters);

  const renderLeaf = issueExternalLeaf({
    name: "render-v1",
    nonceByte: 4,
    capturedAt: at(3),
    verificationTime: at(7),
    artifacts: [
      receiptArtifact("output-receipt.json", "output_receipt", outputReceipt),
      receiptArtifact("render-receipt.json", "render_receipt", renderReceipt),
    ],
    verifier: renderVerifierV1,
    claim: makeClaim(
      RENDER_CLAIM,
      "The render was recomputed exactly from the output",
      Object.fromEntries(RENDER_PARAMETERS.map((name) =>
        [name, renderObservation(outputReceipt, renderReceipt, "synthetic-renderer.v1")[name]])),
    ),
    observation: renderObservation(outputReceipt, renderReceipt, "synthetic-renderer.v1"),
  });

  const outputCurrentness = await recaptureDocumentSnapshotCurrentness({
    expectedReceipt: outputReceipt,
    files: [{ role: "output", path: paths.output, mediaType: "application/json" }],
    checkedAt: at(8),
  });
  const renderCurrentness = await recaptureDocumentSnapshotCurrentness({
    expectedReceipt: renderReceipt,
    files: [{ role: "render", path: paths.render, mediaType: "text/plain" }],
    checkedAt: at(10),
  });
  assert.equal(outputCurrentness.status, "current");
  assert.equal(renderCurrentness.status, "current");
  const outputCurrentLeaf = issueCurrentnessLeaf({
    name: "output-currentness",
    nonceByte: 5,
    currentness: outputCurrentness,
    verificationTime: at(9),
  });
  const renderCurrentLeaf = issueCurrentnessLeaf({
    name: "render-currentness-v1",
    nonceByte: 6,
    currentness: renderCurrentness,
    verificationTime: at(11),
  });

  const admissibleInputs = composeNode(
    "admissibleInputs",
    [sourceLeaf, specLeaf],
    at(12),
  );
  const exactCurrentOutput = composeNode(
    "exactCurrentOutput",
    [transformLeaf, outputCurrentLeaf],
    at(13),
  );
  const conformingTransformation = composeNode(
    "conformingTransformation",
    [admissibleInputs, exactCurrentOutput],
    at(14),
  );
  const faithfulCurrentRender = composeNode(
    "faithfulCurrentRender",
    [renderLeaf, renderCurrentLeaf],
    at(15),
  );
  const root = composeNode(
    "root",
    [conformingTransformation, faithfulCurrentRender],
    at(16),
  );

  assert.equal(root.checked.grounded_closure.closure.certificates.length, 11);
  assert.equal(root.checked.grounded_closure.groundings.length, 6);
  assert.equal(root.checked.rule_bindings.length, 5);

  // Replay is deterministic data verification, not an agent-behavior test.
  const serializedRoot = JSON.parse(JSON.stringify(root.checked));
  const freshRules = buildRuleSet();
  const freshContexts = root.leaves.map((leaf) => leaf.freshContext());
  const replayed = checked.replayRiddleProofCheckedMeaningClosure({
    checked_closure: serializedRoot,
    replay_contexts: freshContexts,
    rule_registry: freshRules.registry,
    trusted_rules: freshRules.trusted,
  });
  assert.equal(replayed.ok, true, replayed.ok ? undefined : replayed.error.message);
  const matched = checked.matchRiddleProofCheckedMeaningClosure({
    checked_closure: serializedRoot,
    replay_contexts: freshContexts,
    rule_registry: freshRules.registry,
    trusted_rules: freshRules.trusted,
    expected_root_certificate_id: root.certificate.certificate_id,
    expected_scope: scope,
    expected_claim: root.certificate.claim,
    expected_root_rule: freshRules.byName.root.rule_ref,
  });
  assert.equal(matched.ok, true, matched.ok ? undefined : matched.error.message);

  const explained = checked.explainRiddleProofCheckedMeaningClosure({
    checked_closure: serializedRoot,
    replay_contexts: freshContexts,
    rule_registry: freshRules.registry,
    trusted_rules: freshRules.trusted,
  });
  assert.equal(explained.ok, true, explained.ok ? undefined : explained.error.message);
  assert.equal(explained.explanation.node_count, 11);
  assert.equal(explained.explanation.grounded_leaf_count, 6);
  assert.equal(explained.explanation.checked_composition_count, 5);
  assert.equal(explained.explanation.grounded_frontier.length, 6);
  assert.equal(JSON.stringify(explained.explanation).includes("bytes_base64"), false);
  const secondFreshRules = buildRuleSet();
  const explainedAgain = checked.explainRiddleProofCheckedMeaningClosure({
    checked_closure: JSON.parse(JSON.stringify(explained.checked_closure)),
    replay_contexts: root.leaves.map((leaf) => leaf.freshContext()),
    rule_registry: secondFreshRules.registry,
    trusted_rules: secondFreshRules.trusted,
  });
  assert.equal(
    explainedAgain.ok,
    true,
    explainedAgain.ok ? undefined : explainedAgain.error.message,
  );
  assert.deepEqual(explainedAgain.explanation, explained.explanation);

  const expansion = expandExplanation(explained.explanation);
  assert.equal(
    stableJson(expansion),
    stableJson(expandExplanation(explainedAgain.explanation)),
  );
  assert.deepEqual(preorderClaims(expansion), [
    CLAIMS.presentableTransformation,
    CLAIMS.conformingTransformation,
    CLAIMS.admissibleInputs,
    SOURCE_CLAIM,
    SPEC_CLAIM,
    CLAIMS.exactCurrentOutput,
    TRANSFORM_CLAIM,
    CURRENTNESS_CLAIM,
    CLAIMS.faithfulCurrentRender,
    RENDER_CLAIM,
    CURRENTNESS_CLAIM,
  ]);

  // Removing a required grounded currentness leaf fails replay, even when the
  // remaining certificate and rule bodies are untouched.
  const withoutOutputCurrentness = jsonClone(serializedRoot);
  withoutOutputCurrentness.grounded_closure.closure.certificates =
    withoutOutputCurrentness.grounded_closure.closure.certificates.filter(
      (certificate) => certificate.certificate_id
        !== outputCurrentLeaf.certificate.certificate_id,
    );
  withoutOutputCurrentness.grounded_closure.groundings =
    withoutOutputCurrentness.grounded_closure.groundings.filter(
      (grounding) => grounding.certificate_id
        !== outputCurrentLeaf.certificate.certificate_id,
    );
  const missingCurrentness = checked.replayRiddleProofCheckedMeaningClosure({
    checked_closure: withoutOutputCurrentness,
    replay_contexts: root.leaves
      .filter((leaf) => leaf !== outputCurrentLeaf)
      .map((leaf) => leaf.freshContext()),
    rule_registry: freshRules.registry,
    trusted_rules: freshRules.trusted,
  });
  assert.equal(missingCurrentness.ok, false);

  // Removing a derived intermediate and its rule sidecar also fails because
  // its parent retains an exact premise snapshot and content ID.
  const withoutExactOutputIntermediate = jsonClone(serializedRoot);
  withoutExactOutputIntermediate.grounded_closure.closure.certificates =
    withoutExactOutputIntermediate.grounded_closure.closure.certificates.filter(
      (certificate) => certificate.certificate_id
        !== exactCurrentOutput.certificate.certificate_id,
    );
  withoutExactOutputIntermediate.rule_bindings =
    withoutExactOutputIntermediate.rule_bindings.filter(
      (binding) => binding.certificate_id
        !== exactCurrentOutput.certificate.certificate_id,
    );
  const missingIntermediate = checked.replayRiddleProofCheckedMeaningClosure({
    checked_closure: withoutExactOutputIntermediate,
    replay_contexts: root.leaves.map((leaf) => leaf.freshContext()),
    rule_registry: freshRules.registry,
    trusted_rules: freshRules.trusted,
  });
  assert.equal(missingIntermediate.ok, false);

  // A byte-for-byte closure copy with one altered signature cannot replay.
  const signatureTampered = jsonClone(serializedRoot);
  const sourceGrounding = signatureTampered.grounded_closure.groundings.find(
    (grounding) => grounding.certificate_id === sourceLeaf.certificate.certificate_id,
  );
  assert.ok(sourceGrounding);
  const originalSignature = sourceGrounding.bundle.provenance.signature_base64;
  sourceGrounding.bundle.provenance.signature_base64 =
    `${originalSignature[0] === "A" ? "B" : "A"}${originalSignature.slice(1)}`;
  const tamperedReplay = checked.replayRiddleProofCheckedMeaningClosure({
    checked_closure: signatureTampered,
    replay_contexts: root.leaves.map((leaf) => leaf.freshContext()),
    rule_registry: freshRules.registry,
    trusted_rules: freshRules.trusted,
  });
  assert.equal(tamperedReplay.ok, false);
  assert.equal(tamperedReplay.error.code, "grounded_validation_failed");

  // A registry entry cannot smuggle in a more permissive body under the same
  // rule id/version: the independently trusted full definition digest differs.
  const permissiveRootDefinition = jsonClone(ruleDefinitions.root);
  permissiveRootDefinition.label = "A substituted permissive root rule";
  permissiveRootDefinition.constraints.max_age_ms = 3_600_000;
  const permissiveRoot = checked.createRiddleProofCheckedMeaningRule({
    definition: permissiveRootDefinition,
  });
  assert.equal(
    permissiveRoot.ok,
    true,
    permissiveRoot.ok ? undefined : permissiveRoot.error.message,
  );
  assert.notEqual(
    permissiveRoot.rule_ref.implementation_digest,
    freshRules.byName.root.rule_ref.implementation_digest,
  );
  const substitutedRuleRegistry = freshRules.registry.map((registration) =>
    registration.rule_id === freshRules.byName.root.rule_ref.rule_id
      && registration.rule_version === freshRules.byName.root.rule_ref.rule_version
      ? permissiveRoot.registration
      : registration);
  const substitutedRuleReplay = checked.replayRiddleProofCheckedMeaningClosure({
    checked_closure: serializedRoot,
    replay_contexts: root.leaves.map((leaf) => leaf.freshContext()),
    rule_registry: substitutedRuleRegistry,
    trusted_rules: freshRules.trusted,
  });
  assert.equal(substitutedRuleReplay.ok, false);
  assert.equal(substitutedRuleReplay.error.code, "rule_digest_mismatch");

  // Historical replay remains valid, while a later consumer can separately
  // refuse reliance because every signed grounded leaf exceeds its age bound.
  const staleAssessment = checked.assessRiddleProofCheckedMeaningClosure({
    checked_closure: serializedRoot,
    replay_contexts: root.leaves.map((leaf) => leaf.freshContext()),
    rule_registry: freshRules.registry,
    trusted_rules: freshRules.trusted,
    consumption_time: at(59),
    max_grounded_age_ms: 10_000,
    max_future_skew_ms: 0,
  });
  assert.equal(staleAssessment.disposition, "stale");
  assert.equal(staleAssessment.stale_certificate_ids.length, 6);

  // Render-only change and selective recomposition: a pinned renderer upgrade
  // changes only the presentation branch. The transformation branch remains
  // byte-for-byte reusable and appears once in the replacement closure.
  await writeFile(paths.render, renderDocumentV2(output), "utf8");
  const oldRenderCurrentness = await recaptureDocumentSnapshotCurrentness({
    expectedReceipt: renderReceipt,
    files: [{ role: "render", path: paths.render, mediaType: "text/plain" }],
    checkedAt: at(17),
  });
  assert.equal(oldRenderCurrentness.status, "changed");
  const stillCurrentOutput = await recaptureDocumentSnapshotCurrentness({
    expectedReceipt: outputReceipt,
    files: [{ role: "output", path: paths.output, mediaType: "application/json" }],
    checkedAt: at(17),
  });
  assert.equal(stillCurrentOutput.status, "current");

  // The old signed closure remains a valid statement about its historical
  // capture. Currentness detection controls present reliance; it does not
  // mutate or revoke immutable certificates.
  const historicalReplayAfterRenderChange = checked.matchRiddleProofCheckedMeaningClosure({
    checked_closure: serializedRoot,
    replay_contexts: root.leaves.map((leaf) => leaf.freshContext()),
    rule_registry: freshRules.registry,
    trusted_rules: freshRules.trusted,
    expected_root_certificate_id: root.certificate.certificate_id,
    expected_scope: scope,
    expected_claim: root.certificate.claim,
    expected_root_rule: freshRules.byName.root.rule_ref,
  });
  assert.equal(
    historicalReplayAfterRenderChange.ok,
    true,
    historicalReplayAfterRenderChange.ok
      ? undefined
      : historicalReplayAfterRenderChange.error.message,
  );

  const renderReceiptV2 = await captureOne(paths.render, "render", at(18));
  const renderLeafV2 = issueExternalLeaf({
    name: "render-v2",
    nonceByte: 7,
    capturedAt: at(18),
    verificationTime: at(19),
    artifacts: [
      receiptArtifact("output-receipt.json", "output_receipt", outputReceipt),
      receiptArtifact("render-receipt.json", "render_receipt", renderReceiptV2),
    ],
    verifier: renderVerifierV2,
    claim: makeClaim(
      RENDER_CLAIM,
      "The v2 render was recomputed exactly from the unchanged output",
      Object.fromEntries(RENDER_PARAMETERS.map((name) =>
        [name, renderObservation(outputReceipt, renderReceiptV2, "synthetic-renderer.v2")[name]])),
    ),
    observation: renderObservation(outputReceipt, renderReceiptV2, "synthetic-renderer.v2"),
  });
  const renderCurrentnessV2 = await recaptureDocumentSnapshotCurrentness({
    expectedReceipt: renderReceiptV2,
    files: [{ role: "render", path: paths.render, mediaType: "text/plain" }],
    checkedAt: at(20),
  });
  assert.equal(renderCurrentnessV2.status, "current");
  const renderCurrentLeafV2 = issueCurrentnessLeaf({
    name: "render-currentness-v2",
    nonceByte: 8,
    currentness: renderCurrentnessV2,
    verificationTime: at(21),
  });
  const faithfulCurrentRenderV2 = composeNode(
    "faithfulCurrentRender",
    [renderLeafV2, renderCurrentLeafV2],
    at(22),
  );
  const rootV2 = composeNode(
    "root",
    [conformingTransformation, faithfulCurrentRenderV2],
    at(23),
  );

  const reusedIds = [
    sourceLeaf.certificate.certificate_id,
    specLeaf.certificate.certificate_id,
    transformLeaf.certificate.certificate_id,
    outputCurrentLeaf.certificate.certificate_id,
    admissibleInputs.certificate.certificate_id,
    exactCurrentOutput.certificate.certificate_id,
    conformingTransformation.certificate.certificate_id,
  ];
  for (const certificateId of reusedIds) {
    assert.deepEqual(
      certificateById(rootV2, certificateId),
      certificateById(root, certificateId),
      `reused certificate ${certificateId}`,
    );
    assert.equal(
      rootV2.checked.grounded_closure.closure.certificates
        .filter((certificate) => certificate.certificate_id === certificateId).length,
      1,
      `reused certificate ${certificateId} must be deduplicated`,
    );
  }
  assert.notEqual(renderLeafV2.certificate.certificate_id, renderLeaf.certificate.certificate_id);
  assert.notEqual(
    faithfulCurrentRenderV2.certificate.certificate_id,
    faithfulCurrentRender.certificate.certificate_id,
  );
  assert.notEqual(rootV2.certificate.certificate_id, root.certificate.certificate_id);
  assert.equal(rootV2.checked.grounded_closure.closure.certificates.length, 11);

  // Hostile but internally valid substitution 1: an exact current output for
  // a different transform cannot be attached to the baseline admissible-input
  // branch merely because the claim IDs and rule names match.
  const alternateSpec = {
    ...spec,
    section_id: "alpha",
    expected_text: "Keep alpha",
    replacement_text: "Changed alpha",
  };
  const alternateOutput = applyTransform(source, alternateSpec);
  await Promise.all([
    writeFile(paths.alternateSpec, `${JSON.stringify(alternateSpec, null, 2)}\n`, "utf8"),
    writeFile(paths.alternateOutput, `${JSON.stringify(alternateOutput, null, 2)}\n`, "utf8"),
    writeFile(paths.alternateRender, renderDocumentV1(alternateOutput), "utf8"),
  ]);
  const alternateSpecReceipt = await captureOne(paths.alternateSpec, "spec", at(24));
  const alternateOutputReceipt = await captureOne(paths.alternateOutput, "output", at(25));
  const alternateRenderReceipt = await captureOne(paths.alternateRender, "render", at(26));
  const alternateTransformLeaf = issueExternalLeaf({
    name: "alternate-exact-transform",
    nonceByte: 9,
    capturedAt: at(25),
    verificationTime: at(27),
    artifacts: [
      receiptArtifact("output-receipt.json", "output_receipt", alternateOutputReceipt),
      receiptArtifact("source-receipt.json", "source_receipt", sourceReceipt),
      receiptArtifact("spec-receipt.json", "spec_receipt", alternateSpecReceipt),
    ],
    verifier: transformVerifier,
    claim: makeClaim(
      TRANSFORM_CLAIM,
      "The alternate output was an exact transformation",
      Object.fromEntries(TRANSFORM_PARAMETERS.map((name) =>
        [name, transformObservation(sourceReceipt, alternateSpecReceipt, alternateOutputReceipt)[name]])),
    ),
    observation: transformObservation(sourceReceipt, alternateSpecReceipt, alternateOutputReceipt),
  });
  const alternateOutputCurrentness = await recaptureDocumentSnapshotCurrentness({
    expectedReceipt: alternateOutputReceipt,
    files: [{ role: "output", path: paths.alternateOutput, mediaType: "application/json" }],
    checkedAt: at(28),
  });
  assert.equal(alternateOutputCurrentness.status, "current");
  const alternateOutputCurrentLeaf = issueCurrentnessLeaf({
    name: "alternate-output-currentness",
    nonceByte: 10,
    currentness: alternateOutputCurrentness,
    verificationTime: at(29),
  });
  const alternateExactCurrentOutput = composeNode(
    "exactCurrentOutput",
    [alternateTransformLeaf, alternateOutputCurrentLeaf],
    at(30),
  );
  const substitutedTransform = composeAttempt(
    "conformingTransformation",
    [admissibleInputs, alternateExactCurrentOutput],
    at(31),
  ).result;
  assert.equal(substitutedTransform.ok, false);
  assert.equal(substitutedTransform.error.code, "parameter_mismatch");

  // Hostile but internally valid substitution 2: a faithful current render of
  // the alternate output cannot replace the render for the baseline output.
  const alternateRenderLeaf = issueExternalLeaf({
    name: "alternate-render",
    nonceByte: 11,
    capturedAt: at(26),
    verificationTime: at(32),
    artifacts: [
      receiptArtifact("output-receipt.json", "output_receipt", alternateOutputReceipt),
      receiptArtifact("render-receipt.json", "render_receipt", alternateRenderReceipt),
    ],
    verifier: renderVerifierV1,
    claim: makeClaim(
      RENDER_CLAIM,
      "The alternate output had an exact faithful render",
      Object.fromEntries(RENDER_PARAMETERS.map((name) =>
        [name, renderObservation(
          alternateOutputReceipt,
          alternateRenderReceipt,
          "synthetic-renderer.v1",
        )[name]])),
    ),
    observation: renderObservation(
      alternateOutputReceipt,
      alternateRenderReceipt,
      "synthetic-renderer.v1",
    ),
  });
  const alternateRenderCurrentness = await recaptureDocumentSnapshotCurrentness({
    expectedReceipt: alternateRenderReceipt,
    files: [{ role: "render", path: paths.alternateRender, mediaType: "text/plain" }],
    checkedAt: at(33),
  });
  assert.equal(alternateRenderCurrentness.status, "current");
  const alternateRenderCurrentLeaf = issueCurrentnessLeaf({
    name: "alternate-render-currentness",
    nonceByte: 12,
    currentness: alternateRenderCurrentness,
    verificationTime: at(34),
  });
  const alternateFaithfulCurrentRender = composeNode(
    "faithfulCurrentRender",
    [alternateRenderLeaf, alternateRenderCurrentLeaf],
    at(35),
  );
  const substitutedRender = composeAttempt(
    "root",
    [conformingTransformation, alternateFaithfulCurrentRender],
    at(36),
  ).result;
  assert.equal(substitutedRender.ok, false);
  assert.equal(substitutedRender.error.code, "parameter_mismatch");

  console.log(JSON.stringify({
    ok: true,
    experiment: "semantic-compaction.synthetic-document-transformation",
    baseline_root_certificate_id: root.certificate.certificate_id,
    renderer_v2_root_certificate_id: rootV2.certificate.certificate_id,
    baseline_certificates: root.checked.grounded_closure.closure.certificates.length,
    baseline_grounded_leaves: root.checked.grounded_closure.groundings.length,
    baseline_checked_rules: root.checked.rule_bindings.length,
    deterministic_replay: true,
    deterministic_expansion: true,
    missing_currentness_rejected: true,
    missing_intermediate_rejected: true,
    signature_tamper_rejected: true,
    same_name_permissive_rule_rejected: true,
    stale_consumption_detected: true,
    render_change_detected_and_selectively_recomposed: true,
    historical_root_remains_replayable: true,
    transformation_branch_reused: true,
    valid_transform_substitution_rejected: true,
    valid_render_substitution_rejected: true,
  }, null, 2));
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}
