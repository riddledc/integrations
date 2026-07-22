import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { TextDecoder } from "node:util";
import { gzipSync } from "node:zlib";

import * as checked from "../../packages/riddle-proof-core/dist/checked-meaning.js";
import * as grounded from "../../packages/riddle-proof-core/dist/grounded-evidence.js";

const CLAIMS = {
  source: "riddle-proof.release.source-snapshot-captured",
  suite: "riddle-proof.release.required-suite-report-captured",
  candidate: "riddle-proof.release.candidate-build-record-bound",
  registry: "riddle-proof.release.registry-copy-record-captured",
  tested: "riddle-proof.release.source-and-suite-report-bound",
  published: "riddle-proof.release.candidate-registry-bytes-match",
  root: "riddle-proof.release.evidence-packet-bound",
};

const RELEASE_OBSERVATION_ROLE = "release_observation";
const RULE_MAX_AGE_MS = 60 * 60 * 1000;
const textDecoder = new TextDecoder("utf-8", { fatal: true });

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function jsonBytes(value) {
  return Buffer.from(JSON.stringify(value), "utf8");
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function assertOk(result, label) {
  assert.equal(result.ok, true, result.ok ? undefined : `${label}: ${result.error.message}`);
  if (!result.ok) throw new Error(`${label}: ${result.error.message}`);
  return result;
}

function parseJsonBytes(bytes, label) {
  const parsed = JSON.parse(textDecoder.decode(bytes));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must contain a JSON object.`);
  }
  return parsed;
}

/**
 * The verifier is deliberately external and independently pinned. It receives
 * the signed artifact bytes, recomputes every artifact digest, and exposes only
 * those computed values plus parsed JSON documents to the declarative leaf
 * contracts. A JSON statement that merely claims a tarball digest is therefore
 * insufficient.
 */
function verifyReleaseArtifactBytes(input) {
  const observations = input.artifacts.filter(
    (artifact) => artifact.role === RELEASE_OBSERVATION_ROLE,
  );
  if (observations.length !== 1) {
    throw new Error("Exactly one release observation artifact is required.");
  }
  const metadata = parseJsonBytes(observations[0].bytes, RELEASE_OBSERVATION_ROLE);
  const digests = {};
  const byte_lengths = {};
  const documents = {};
  for (const artifact of input.artifacts) {
    const computed = sha256(Buffer.from(artifact.bytes));
    if (computed !== artifact.artifact_digest) {
      throw new Error(`Artifact manifest digest mismatch for ${artifact.role}.`);
    }
    if (artifact.role === RELEASE_OBSERVATION_ROLE) continue;
    if (Object.hasOwn(digests, artifact.role)) {
      throw new Error(`Artifact role ${artifact.role} is duplicated.`);
    }
    digests[artifact.role] = computed;
    byte_lengths[artifact.role] = artifact.byte_length;
    if (artifact.media_type === "application/json") {
      documents[artifact.role] = parseJsonBytes(artifact.bytes, artifact.role);
    }
  }
  return {
    metadata,
    digests,
    byte_lengths,
    documents,
  };
}

const VERIFIER_REF = Object.freeze({
  verifier_id: "riddle-proof.experiment.release-artifact-bytes",
  verifier_version: "1",
  implementation_digest: sha256(Buffer.from(verifyReleaseArtifactBytes.toString(), "utf8")),
  trust_basis: { kind: "external_registry" },
});

const VERIFIER_REGISTRATION = Object.freeze({
  ...VERIFIER_REF,
  verify: verifyReleaseArtifactBytes,
});

const collector = {
  collector_id: "riddle-proof.experiment.release-artifact",
  collector_version: "1",
  implementation_digest: sha256(Buffer.from("release-artifact-collector.v1", "utf8")),
};

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyBytes = privateKey.export({ format: "der", type: "pkcs8" });
const publicKeyBytes = publicKey.export({ format: "der", type: "spki" });
const keyId = "semantic-compaction-release-experiment";
const trustedSigner = {
  key_id: keyId,
  public_key_spki_base64: publicKeyBytes.toString("base64"),
};
const expectedSigner = {
  key_id: keyId,
  public_key_spki_sha256: sha256(publicKeyBytes),
};

function artifact(role, bytes, mediaType = "application/octet-stream") {
  return { role, bytes: Buffer.from(bytes), mediaType };
}

function issueLeaf({
  name,
  scope,
  claimId,
  claimLabel,
  parameters,
  parameterPointers,
  artifacts,
  requiredAssertions,
  capturedAt,
  issuedAt,
  nonceByte,
  sensorKind,
}) {
  assert.deepEqual(
    Object.keys(parameterPointers).sort(),
    Object.keys(parameters).sort(),
    `${name} must bind every claim parameter to verifier output`,
  );
  const contract = assertOk(grounded.createRiddleProofGroundedDeclarativeJsonContract({
    contract_id: `riddle-proof.experiment.release-${name}`,
    contract_version: "1",
    label: `Accept the exact verified ${name} release observation`,
    claim: {
      claim_id: claimId,
      claim_version: "1",
      label: claimLabel,
      parameters,
    },
    program: {
      all: [
        { op: "equals", source: "scope", pointer: "/repository", value: scope.repository },
        { op: "equals", source: "scope", pointer: "/revision", value: scope.revision },
        { op: "equals", source: "scope", pointer: "/environment", value: scope.environment },
        { op: "equals", source: "scope", pointer: "/target", value: scope.target },
        { op: "equals", source: "scope", pointer: "/proof_attempt", value: scope.proof_attempt },
        { op: "equals", source: "observation", pointer: "/metadata/kind", value: name },
        ...Object.entries(parameterPointers).map(([parameter, pointer]) => ({
          op: "equals",
          source: "observation",
          pointer,
          value: parameters[parameter],
        })),
        ...requiredAssertions,
      ],
    },
  }), `${name} contract`);

  const sensor = {
    kind: sensorKind,
    name: `synthetic-release-${name}`,
    version: "1",
    observed_target: scope.target,
    metadata: { experiment: "semantic-compaction", leaf: name },
  };
  const nonce = Buffer.alloc(32, nonceByte).toString("base64url");
  const inputs = [
    artifact(
      RELEASE_OBSERVATION_ROLE,
      jsonBytes({ kind: name, adapter: "synthetic-release-lab.v1" }),
      "application/json",
    ),
    ...artifacts,
  ];
  const signed = assertOk(grounded.createRiddleProofSignedCaptureBundle({
    scope,
    nonce,
    captured_at: capturedAt,
    collector,
    sensor,
    verifier: VERIFIER_REF,
    artifacts: inputs.map((entry) => ({
      artifact_id: `${name}/${entry.role}`,
      role: entry.role,
      media_type: entry.mediaType,
      bytes_base64: entry.bytes.toString("base64"),
    })),
    signing_key: {
      key_id: keyId,
      private_key_pkcs8_base64: privateKeyBytes.toString("base64"),
    },
  }), `${name} signed capture`);

  const configuration = {
    policy: {
      expected_scope: scope,
      expected_nonce: nonce,
      expected_collector: collector,
      expected_sensor: sensor,
      expected_verifier: VERIFIER_REF,
      expected_signer: expectedSigner,
      verification_time: issuedAt,
      max_capture_age_ms: RULE_MAX_AGE_MS,
      max_future_skew_ms: 1_000,
      required_artifact_roles: inputs.map((entry) => entry.role),
    },
    trusted_signers: [trustedSigner],
    verifier_registry: [VERIFIER_REGISTRATION],
    contract_registry: [contract.registration],
    expected_contract: contract.contract_ref,
  };
  const issued = assertOk(grounded.createRiddleProofGroundedSemanticCertificate({
    bundle: signed.bundle,
    ...configuration,
    issued_at: issuedAt,
  }), `${name} grounded certificate`);
  const groundedClosure = assertOk(
    grounded.createRiddleProofGroundedSemanticAtomicCertificateClosure({
      certificate: issued.certificate,
      grounding: issued.grounding,
      configuration,
    }),
    `${name} grounded closure`,
  );
  const replayContext = {
    certificate_id: issued.certificate.certificate_id,
    ...configuration,
  };
  const atomic = assertOk(checked.createRiddleProofCheckedMeaningAtomicClosure({
    grounded_closure: groundedClosure.grounded_closure,
    replay_contexts: [replayContext],
  }), `${name} checked atomic closure`);
  return {
    bundle: signed.bundle,
    certificate: issued.certificate,
    checked_closure: atomic.checked_closure,
    replay_context: replayContext,
  };
}

function anyParameters(names) {
  return Object.fromEntries(names.map((name) => [name, { op: "any" }]));
}

function projectedParameters(selections) {
  return Object.fromEntries(Object.entries(selections).map(([name, premise_index]) => [name, {
    op: "from_premise",
    premise_index,
    parameter: name,
  }]));
}

function equalities(names) {
  return names.map((parameter) => ({
    members: [
      { premise_index: 0, parameter },
      { premise_index: 1, parameter },
    ],
  }));
}

const SOURCE_PARAMETERS = [
  "repository", "revision", "tree_digest", "lockfile_digest", "release_set_digest",
];
const SUITE_PARAMETERS = [
  ...SOURCE_PARAMETERS, "suite_definition_digest", "report_digest",
];
const CANDIDATE_PARAMETERS = [
  ...SOURCE_PARAMETERS,
  "package_name", "package_version", "tarball_digest", "packlist_digest", "build_recipe_digest",
];
const REGISTRY_PARAMETERS = [
  "repository", "revision", "package_name", "package_version", "tarball_digest",
  "provenance_digest", "publisher_workflow_digest",
];

function createRule(definition) {
  return assertOk(checked.createRiddleProofCheckedMeaningRule({ definition }), definition.rule_id);
}

const testedRule = createRule({
  rule_id: CLAIMS.tested,
  rule_version: "1",
  label: "Bind a captured passing-result report to the exact source snapshot it names",
  premises: [
    { claim_id: CLAIMS.source, claim_version: "1", parameters: anyParameters(SOURCE_PARAMETERS) },
    { claim_id: CLAIMS.suite, claim_version: "1", parameters: anyParameters(SUITE_PARAMETERS) },
  ],
  conclusion: {
    claim_id: CLAIMS.tested,
    claim_version: "1",
    label: "The exact source snapshot and the captured passing-result report name the same source identity",
    parameters: projectedParameters(Object.fromEntries(SUITE_PARAMETERS.map((name) => [
      name,
      SOURCE_PARAMETERS.includes(name) ? 0 : 1,
    ]))),
  },
  constraints: {
    all_of: true,
    parameter_equalities: equalities(SOURCE_PARAMETERS),
    ordered_premise_chronology: true,
    max_age_ms: RULE_MAX_AGE_MS,
  },
});

const publishedRule = createRule({
  rule_id: CLAIMS.published,
  rule_version: "1",
  label: "Bind candidate package bytes to separately captured registry-copy bytes",
  premises: [
    { claim_id: CLAIMS.candidate, claim_version: "1", parameters: anyParameters(CANDIDATE_PARAMETERS) },
    { claim_id: CLAIMS.registry, claim_version: "1", parameters: anyParameters(REGISTRY_PARAMETERS) },
  ],
  conclusion: {
    claim_id: CLAIMS.published,
    claim_version: "1",
    label: "The captured registry-copy bytes match this exact candidate",
    parameters: projectedParameters({
      ...Object.fromEntries(CANDIDATE_PARAMETERS.map((name) => [name, 0])),
      provenance_digest: 1,
      publisher_workflow_digest: 1,
    }),
  },
  constraints: {
    all_of: true,
    parameter_equalities: equalities([
      "repository", "revision", "package_name", "package_version", "tarball_digest",
    ]),
    ordered_premise_chronology: true,
    max_age_ms: RULE_MAX_AGE_MS,
  },
});

const rootRule = createRule({
  rule_id: CLAIMS.root,
  rule_version: "1",
  label: "Bind the source/report checkpoint to the matching candidate/registry-copy checkpoint",
  premises: [
    { claim_id: CLAIMS.tested, claim_version: "1", parameters: anyParameters(SUITE_PARAMETERS) },
    {
      claim_id: CLAIMS.published,
      claim_version: "1",
      parameters: anyParameters([...CANDIDATE_PARAMETERS, "provenance_digest", "publisher_workflow_digest"]),
    },
  ],
  conclusion: {
    claim_id: CLAIMS.root,
    claim_version: "1",
    label: "The captured registry-copy bytes match a candidate whose build record and suite report name the same exact source identity",
    parameters: projectedParameters({
      ...Object.fromEntries(SUITE_PARAMETERS.map((name) => [name, 0])),
      package_name: 1,
      package_version: 1,
      tarball_digest: 1,
      packlist_digest: 1,
      build_recipe_digest: 1,
      provenance_digest: 1,
      publisher_workflow_digest: 1,
    }),
  },
  constraints: {
    all_of: true,
    parameter_equalities: equalities(SOURCE_PARAMETERS),
    ordered_premise_chronology: true,
    max_age_ms: RULE_MAX_AGE_MS,
  },
});

const ruleRegistry = [
  testedRule.registration,
  publishedRule.registration,
  rootRule.registration,
];
const trustedRules = [testedRule.rule_ref, publishedRule.rule_ref, rootRule.rule_ref];

function replayContexts(...leaves) {
  return leaves.map((leaf) => leaf.replay_context);
}

function clonedReplayContexts(contexts) {
  return contexts.map((context) => {
    const cloned = jsonClone(context);
    // External verifier callbacks are independently reconstructed installed
    // code, never serialized as proof data.
    cloned.verifier_registry = [VERIFIER_REGISTRATION];
    return cloned;
  });
}

function compose(rule, closures, contexts, issuedAt, label) {
  return assertOk(checked.composeRiddleProofCheckedMeaningClosures({
    expected_rule: rule.rule_ref,
    closures,
    issued_at: issuedAt,
    replay_contexts: contexts,
    rule_registry: ruleRegistry,
    trusted_rules: trustedRules,
  }), label);
}

function expandDag(checkedClosure) {
  const semantic = checkedClosure.grounded_closure.closure;
  const certificates = new Map(semantic.certificates.map((certificate) => [
    certificate.certificate_id,
    certificate,
  ]));
  const groundings = new Map(checkedClosure.grounded_closure.groundings.map((grounding) => [
    grounding.certificate_id,
    grounding,
  ]));
  const bindings = new Map(checkedClosure.rule_bindings.map((binding) => [
    binding.certificate_id,
    binding,
  ]));
  const ordered = [];
  const visited = new Set();
  function visit(certificateId) {
    if (visited.has(certificateId)) return;
    visited.add(certificateId);
    const certificate = certificates.get(certificateId);
    assert.ok(certificate, `certificate ${certificateId} remains reachable`);
    const premises = certificate.derivation.kind === "composition"
      ? certificate.derivation.premises.map((premise) => premise.certificate_id)
      : [];
    ordered.push({
      certificate_id: certificateId,
      claim_id: certificate.claim.claim_id,
      derivation_kind: certificate.derivation.kind,
      rule_id: bindings.get(certificateId)?.rule_ref.rule_id ?? null,
      contract_id: certificate.derivation.kind === "contract"
        ? certificate.derivation.contract.contract_id
        : null,
      premises,
      grounded_artifact_digests: groundings.get(certificateId)?.bundle.statement.artifacts.map(
        (entry) => ({ role: entry.role, digest: entry.artifact_digest }),
      ) ?? [],
    });
    for (const premiseId of premises) visit(premiseId);
  }
  visit(semantic.root_certificate_id);
  return ordered;
}

function packageBytes(name, version, marker) {
  return gzipSync(jsonBytes({
    package: { name, version },
    files: {
      "package/package.json": JSON.stringify({ name, version }),
      "package/index.js": `export const marker = ${JSON.stringify(marker)};`,
    },
  }), { level: 9 });
}

const repository = "https://github.com/riddledc/integrations.git";
const revisionA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const revisionB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const packageA = "@riddledc/release-lab-a";
const packageB = "@riddledc/release-lab-b";
const version = "1.0.0";
const scope = {
  repository,
  revision: revisionA,
  environment: "synthetic-release-verification-v1",
  target: "release-set:semantic-compaction-lab",
  proof_attempt: "release-artifact-experiment-1",
};
const alternateScope = { ...scope, revision: revisionB };

const sourceTreeA = jsonBytes({
  revision: revisionA,
  files: ["packages/a/index.js", "packages/b/index.js", "pnpm-lock.yaml"],
});
const sourceTreeB = jsonBytes({
  revision: revisionB,
  files: ["packages/a/index.js", "packages/b/index.js", "pnpm-lock.yaml"],
});
const lockfile = jsonBytes({ lockfileVersion: "9", importers: [packageA, packageB] });
const releasePlanA = jsonBytes({ repository, revision: revisionA, packages: [packageA, packageB] });
const releasePlanB = jsonBytes({ repository, revision: revisionB, packages: [packageA, packageB] });
const suiteDefinition = jsonBytes({ suite: "required-release", commands: ["build", "test", "formal:build"] });
const publisherWorkflow = jsonBytes({ workflow: ".github/workflows/release.yml", ref: "refs/heads/main" });

function sourceParameters(sourceTree, releasePlan, revision) {
  return {
    repository,
    revision,
    tree_digest: sha256(sourceTree),
    lockfile_digest: sha256(lockfile),
    release_set_digest: sha256(releasePlan),
  };
}

const sourceParamsA = sourceParameters(sourceTreeA, releasePlanA, revisionA);
const sourceParamsB = sourceParameters(sourceTreeB, releasePlanB, revisionB);

function makeSourceLeaf({ fixtureScope, sourceTree, releasePlan, parameters, nonceByte, capturedAt, issuedAt }) {
  return issueLeaf({
    name: "source",
    scope: fixtureScope,
    claimId: CLAIMS.source,
    claimLabel: "The exact source, lockfile, and release plan bytes were captured",
    parameters,
    parameterPointers: {
      repository: "/documents/release_plan/repository",
      revision: "/documents/release_plan/revision",
      tree_digest: "/digests/source_tree",
      lockfile_digest: "/digests/lockfile",
      release_set_digest: "/digests/release_plan",
    },
    artifacts: [
      artifact("source_tree", sourceTree, "application/json"),
      artifact("lockfile", lockfile, "application/json"),
      artifact("release_plan", releasePlan, "application/json"),
    ],
    requiredAssertions: [
      { op: "equals", source: "observation", pointer: "/metadata/adapter", value: "synthetic-release-lab.v1" },
    ],
    capturedAt,
    issuedAt,
    nonceByte,
    sensorKind: "command",
  });
}

function makeSuiteLeaf({ fixtureScope, sourceTree, releasePlan, sourceParameters: sourceIdentity, reportMarker, nonceByte, capturedAt, issuedAt }) {
  const suiteDigest = sha256(suiteDefinition);
  const report = jsonBytes({
    repository,
    revision: fixtureScope.revision,
    tree_digest: sourceIdentity.tree_digest,
    lockfile_digest: sourceIdentity.lockfile_digest,
    release_set_digest: sourceIdentity.release_set_digest,
    suite_definition_digest: suiteDigest,
    status: "passed",
    exit_code: 0,
    marker: reportMarker,
  });
  const parameters = {
    ...sourceIdentity,
    suite_definition_digest: suiteDigest,
    report_digest: sha256(report),
  };
  return issueLeaf({
    name: "suite",
    scope: fixtureScope,
    claimId: CLAIMS.suite,
    claimLabel: "The captured suite report asserts a passing result for the exact source identity",
    parameters,
    parameterPointers: {
      repository: "/documents/test_report/repository",
      revision: "/documents/test_report/revision",
      tree_digest: "/documents/test_report/tree_digest",
      lockfile_digest: "/documents/test_report/lockfile_digest",
      release_set_digest: "/documents/test_report/release_set_digest",
      suite_definition_digest: "/digests/suite_definition",
      report_digest: "/digests/test_report",
    },
    artifacts: [
      artifact("source_tree", sourceTree, "application/json"),
      artifact("lockfile", lockfile, "application/json"),
      artifact("release_plan", releasePlan, "application/json"),
      artifact("suite_definition", suiteDefinition, "application/json"),
      artifact("test_report", report, "application/json"),
    ],
    requiredAssertions: [
      { op: "equals", source: "observation", pointer: "/documents/test_report/status", value: "passed" },
      { op: "equals", source: "observation", pointer: "/documents/test_report/exit_code", value: 0 },
      { op: "equals", source: "observation", pointer: "/digests/source_tree", value: sourceIdentity.tree_digest },
      { op: "equals", source: "observation", pointer: "/digests/lockfile", value: sourceIdentity.lockfile_digest },
      { op: "equals", source: "observation", pointer: "/digests/release_plan", value: sourceIdentity.release_set_digest },
      { op: "equals", source: "observation", pointer: "/documents/test_report/suite_definition_digest", value: suiteDigest },
    ],
    capturedAt,
    issuedAt,
    nonceByte,
    sensorKind: "command",
  });
}

function makeCandidateLeaf({ packageName, tarball, sourceIdentity, sourceTree, releasePlan, nonceByte, capturedAt, issuedAt }) {
  const packlist = jsonBytes({ package_name: packageName, files: ["package/package.json", "package/index.js"] });
  const buildRecipe = jsonBytes({
    repository,
    revision: scope.revision,
    tree_digest: sourceIdentity.tree_digest,
    lockfile_digest: sourceIdentity.lockfile_digest,
    release_set_digest: sourceIdentity.release_set_digest,
    package_name: packageName,
    package_version: version,
    tarball_digest: sha256(tarball),
    status: "built",
  });
  const parameters = {
    ...sourceIdentity,
    package_name: packageName,
    package_version: version,
    tarball_digest: sha256(tarball),
    packlist_digest: sha256(packlist),
    build_recipe_digest: sha256(buildRecipe),
  };
  return issueLeaf({
    name: `candidate-${packageName.endsWith("-a") ? "a" : "b"}-${nonceByte}`,
    scope,
    claimId: CLAIMS.candidate,
    claimLabel: "The exact candidate bytes are bound to a build record asserting the captured source identity",
    parameters,
    parameterPointers: {
      repository: "/documents/build_recipe/repository",
      revision: "/documents/build_recipe/revision",
      tree_digest: "/documents/build_recipe/tree_digest",
      lockfile_digest: "/documents/build_recipe/lockfile_digest",
      release_set_digest: "/documents/build_recipe/release_set_digest",
      package_name: "/documents/build_recipe/package_name",
      package_version: "/documents/build_recipe/package_version",
      tarball_digest: "/digests/candidate_tarball",
      packlist_digest: "/digests/packlist",
      build_recipe_digest: "/digests/build_recipe",
    },
    artifacts: [
      artifact("source_tree", sourceTree, "application/json"),
      artifact("lockfile", lockfile, "application/json"),
      artifact("release_plan", releasePlan, "application/json"),
      artifact("candidate_tarball", tarball, "application/gzip"),
      artifact("packlist", packlist, "application/json"),
      artifact("build_recipe", buildRecipe, "application/json"),
    ],
    requiredAssertions: [
      { op: "equals", source: "observation", pointer: "/documents/build_recipe/status", value: "built" },
      { op: "equals", source: "observation", pointer: "/documents/build_recipe/tarball_digest", value: sha256(tarball) },
      { op: "equals", source: "observation", pointer: "/digests/source_tree", value: sourceIdentity.tree_digest },
      { op: "equals", source: "observation", pointer: "/digests/lockfile", value: sourceIdentity.lockfile_digest },
      { op: "equals", source: "observation", pointer: "/digests/release_plan", value: sourceIdentity.release_set_digest },
    ],
    capturedAt,
    issuedAt,
    nonceByte,
    sensorKind: "command",
  });
}

function makeRegistryLeaf({ packageName, tarball, revision, nonceByte, capturedAt, issuedAt }) {
  const workflowDigest = sha256(publisherWorkflow);
  const provenance = jsonBytes({
    repository,
    revision,
    package_name: packageName,
    package_version: version,
    subject_digest: sha256(tarball),
    publisher_workflow_digest: workflowDigest,
    verified: true,
  });
  const parameters = {
    repository,
    revision,
    package_name: packageName,
    package_version: version,
    tarball_digest: sha256(tarball),
    provenance_digest: sha256(provenance),
    publisher_workflow_digest: workflowDigest,
  };
  return issueLeaf({
    name: `registry-${packageName.endsWith("-a") ? "a" : "b"}-${nonceByte}`,
    scope,
    claimId: CLAIMS.registry,
    claimLabel: "The exact registry-copy bytes and its provenance record were captured",
    parameters,
    parameterPointers: {
      repository: "/documents/provenance/repository",
      revision: "/documents/provenance/revision",
      package_name: "/documents/provenance/package_name",
      package_version: "/documents/provenance/package_version",
      tarball_digest: "/digests/registry_tarball",
      provenance_digest: "/digests/provenance",
      publisher_workflow_digest: "/digests/publisher_workflow",
    },
    artifacts: [
      artifact("registry_tarball", tarball, "application/gzip"),
      artifact("provenance", provenance, "application/json"),
      artifact("publisher_workflow", publisherWorkflow, "application/json"),
    ],
    requiredAssertions: [
      { op: "equals", source: "observation", pointer: "/documents/provenance/verified", value: true },
      { op: "equals", source: "observation", pointer: "/documents/provenance/subject_digest", value: sha256(tarball) },
      { op: "equals", source: "observation", pointer: "/documents/provenance/publisher_workflow_digest", value: workflowDigest },
    ],
    capturedAt,
    issuedAt,
    nonceByte,
    sensorKind: "api",
  });
}

const sourceLeaf = makeSourceLeaf({
  fixtureScope: scope,
  sourceTree: sourceTreeA,
  releasePlan: releasePlanA,
  parameters: sourceParamsA,
  nonceByte: 1,
  capturedAt: "2026-07-22T00:00:00.000Z",
  issuedAt: "2026-07-22T00:00:00.500Z",
});
const suiteLeaf = makeSuiteLeaf({
  fixtureScope: scope,
  sourceTree: sourceTreeA,
  releasePlan: releasePlanA,
  sourceParameters: sourceParamsA,
  reportMarker: "baseline",
  nonceByte: 2,
  capturedAt: "2026-07-22T00:00:01.000Z",
  issuedAt: "2026-07-22T00:00:01.500Z",
});
const tested = compose(
  testedRule,
  [sourceLeaf.checked_closure, suiteLeaf.checked_closure],
  replayContexts(sourceLeaf, suiteLeaf),
  "2026-07-22T00:00:04.000Z",
  "source/report identity",
);

const tarballA = packageBytes(packageA, version, "baseline-a");
const candidateA = makeCandidateLeaf({
  packageName: packageA,
  tarball: tarballA,
  sourceIdentity: sourceParamsA,
  sourceTree: sourceTreeA,
  releasePlan: releasePlanA,
  nonceByte: 3,
  capturedAt: "2026-07-22T00:00:02.000Z",
  issuedAt: "2026-07-22T00:00:02.500Z",
});
const registryA = makeRegistryLeaf({
  packageName: packageA,
  tarball: tarballA,
  revision: revisionA,
  nonceByte: 4,
  capturedAt: "2026-07-22T00:00:03.000Z",
  issuedAt: "2026-07-22T00:00:03.500Z",
});
const publishedA = compose(
  publishedRule,
  [candidateA.checked_closure, registryA.checked_closure],
  replayContexts(candidateA, registryA),
  "2026-07-22T00:00:04.500Z",
  "published candidate A",
);
const baselineContexts = replayContexts(sourceLeaf, suiteLeaf, candidateA, registryA);
const baseline = compose(
  rootRule,
  [tested.checked_closure, publishedA.checked_closure],
  baselineContexts,
  "2026-07-22T00:00:05.000Z",
  "baseline release root",
);

assert.equal(baseline.certificate.claim.claim_id, CLAIMS.root);
assert.equal(baseline.checked_closure.grounded_closure.groundings.length, 4);
assert.equal(baseline.checked_closure.grounded_closure.closure.certificates.length, 7);
assert.equal(baseline.checked_closure.rule_bindings.length, 3);
const candidateTarballEntry = candidateA.bundle.statement.artifacts.find(
  (entry) => entry.role === "candidate_tarball",
);
assert.equal(candidateTarballEntry.artifact_digest, sha256(tarballA));

// Replay serializes all proof data but reconstructs the pinned external
// verifier callback from installed code.
const replayed = checked.matchRiddleProofCheckedMeaningClosure({
  checked_closure: jsonClone(baseline.checked_closure),
  replay_contexts: clonedReplayContexts(baselineContexts),
  rule_registry: jsonClone(ruleRegistry),
  trusted_rules: jsonClone(trustedRules),
  expected_root_certificate_id: baseline.certificate.certificate_id,
  expected_scope: jsonClone(scope),
  expected_claim: jsonClone(baseline.certificate.claim),
  expected_root_rule: jsonClone(rootRule.rule_ref),
});
assertOk(replayed, "serialized deterministic replay");

// The core explanation API replays the closure before exposing a deterministic,
// content-light DAG and its exact signed-grounding frontier. The local walker
// remains only an independent cross-check of reachability.
const explained = assertOk(checked.explainRiddleProofCheckedMeaningClosure({
  checked_closure: jsonClone(baseline.checked_closure),
  replay_contexts: clonedReplayContexts(baselineContexts),
  rule_registry: jsonClone(ruleRegistry),
  trusted_rules: jsonClone(trustedRules),
}), "release DAG explanation");
assert.equal(explained.explanation.root_certificate_id, baseline.certificate.certificate_id);
assert.equal(explained.explanation.node_count, 7);
assert.equal(explained.explanation.grounded_leaf_count, 4);
assert.equal(explained.explanation.checked_composition_count, 3);
assert.equal(explained.explanation.grounded_frontier.length, 4);
assert.equal(JSON.stringify(explained.explanation).includes("bytes_base64"), false);
assert.ok(explained.explanation.grounded_frontier.every(
  (entry) => /^sha256:[0-9a-f]{64}$/u.test(entry.observation_digest),
));
const explainedAgain = assertOk(checked.explainRiddleProofCheckedMeaningClosure({
  checked_closure: explained.checked_closure,
  replay_contexts: clonedReplayContexts(baselineContexts),
  rule_registry: jsonClone(ruleRegistry),
  trusted_rules: jsonClone(trustedRules),
}), "replayed release DAG explanation");
assert.deepEqual(explainedAgain.explanation, explained.explanation);

const localExplanation = expandDag(baseline.checked_closure);
assert.deepEqual(expandDag(jsonClone(baseline.checked_closure)), localExplanation);
assert.equal(localExplanation.length, 7);
assert.equal(localExplanation.filter((node) => node.derivation_kind === "contract").length, 4);
assert.equal(localExplanation.filter((node) => node.derivation_kind === "composition").length, 3);
assert.deepEqual(
  new Set(localExplanation.map((node) => node.certificate_id)),
  new Set(explained.explanation.nodes.map((node) => node.certificate_id)),
);
const recomposed = compose(
  rootRule,
  [jsonClone(tested.checked_closure), jsonClone(publishedA.checked_closure)],
  clonedReplayContexts(baselineContexts),
  "2026-07-22T00:00:05.000Z",
  "recomposed exact root",
);
assert.equal(recomposed.certificate.certificate_id, baseline.certificate.certificate_id);

// Selective recomposition direction one: changed package bytes replace only the
// candidate/registry-copy branch. The source/report checkpoint is reused exactly.
const tarballAChanged = packageBytes(packageA, version, "changed-artifact-a");
const candidateAChanged = makeCandidateLeaf({
  packageName: packageA,
  tarball: tarballAChanged,
  sourceIdentity: sourceParamsA,
  sourceTree: sourceTreeA,
  releasePlan: releasePlanA,
  nonceByte: 5,
  capturedAt: "2026-07-22T00:00:06.000Z",
  issuedAt: "2026-07-22T00:00:06.500Z",
});
const registryAChanged = makeRegistryLeaf({
  packageName: packageA,
  tarball: tarballAChanged,
  revision: revisionA,
  nonceByte: 6,
  capturedAt: "2026-07-22T00:00:07.000Z",
  issuedAt: "2026-07-22T00:00:07.500Z",
});
const publishedAChanged = compose(
  publishedRule,
  [candidateAChanged.checked_closure, registryAChanged.checked_closure],
  replayContexts(candidateAChanged, registryAChanged),
  "2026-07-22T00:00:08.000Z",
  "changed published candidate A",
);
const artifactChangedContexts = replayContexts(
  sourceLeaf,
  suiteLeaf,
  candidateAChanged,
  registryAChanged,
);
const artifactChangedRoot = compose(
  rootRule,
  [tested.checked_closure, publishedAChanged.checked_closure],
  artifactChangedContexts,
  "2026-07-22T00:00:09.000Z",
  "artifact-changed root",
);
assert.equal(
  artifactChangedRoot.certificate.derivation.premises[0].certificate_id,
  tested.certificate.certificate_id,
);
assert.notEqual(publishedAChanged.certificate.certificate_id, publishedA.certificate.certificate_id);
assert.notEqual(artifactChangedRoot.certificate.certificate_id, baseline.certificate.certificate_id);

// Selective recomposition direction two: a different passing-result report
// replaces only the report branch. The exact candidate/registry-copy
// checkpoint is reused.
const suiteLeafChanged = makeSuiteLeaf({
  fixtureScope: scope,
  sourceTree: sourceTreeA,
  releasePlan: releasePlanA,
  sourceParameters: sourceParamsA,
  reportMarker: "second-passing-report",
  nonceByte: 7,
  capturedAt: "2026-07-22T00:00:01.000Z",
  issuedAt: "2026-07-22T00:00:01.500Z",
});
const testedChanged = compose(
  testedRule,
  [sourceLeaf.checked_closure, suiteLeafChanged.checked_closure],
  replayContexts(sourceLeaf, suiteLeafChanged),
  "2026-07-22T00:00:04.000Z",
  "changed source/report identity",
);
const testChangedContexts = replayContexts(sourceLeaf, suiteLeafChanged, candidateA, registryA);
const testChangedRoot = compose(
  rootRule,
  [testedChanged.checked_closure, publishedA.checked_closure],
  testChangedContexts,
  "2026-07-22T00:00:12.000Z",
  "test-changed root",
);
assert.equal(
  testChangedRoot.certificate.derivation.premises[1].certificate_id,
  publishedA.certificate.certificate_id,
);
assert.notEqual(testedChanged.certificate.certificate_id, tested.certificate.certificate_id);
assert.notEqual(testChangedRoot.certificate.certificate_id, baseline.certificate.certificate_id);

// A second package in the same release set reuses the exact tested-source
// checkpoint while retaining an independent artifact/provenance branch.
const tarballB = packageBytes(packageB, version, "baseline-b");
const candidateB = makeCandidateLeaf({
  packageName: packageB,
  tarball: tarballB,
  sourceIdentity: sourceParamsA,
  sourceTree: sourceTreeA,
  releasePlan: releasePlanA,
  nonceByte: 8,
  capturedAt: "2026-07-22T00:00:13.000Z",
  issuedAt: "2026-07-22T00:00:13.500Z",
});
const registryB = makeRegistryLeaf({
  packageName: packageB,
  tarball: tarballB,
  revision: revisionA,
  nonceByte: 9,
  capturedAt: "2026-07-22T00:00:14.000Z",
  issuedAt: "2026-07-22T00:00:14.500Z",
});
const publishedB = compose(
  publishedRule,
  [candidateB.checked_closure, registryB.checked_closure],
  replayContexts(candidateB, registryB),
  "2026-07-22T00:00:15.000Z",
  "published candidate B",
);
const packageBRoot = compose(
  rootRule,
  [tested.checked_closure, publishedB.checked_closure],
  replayContexts(sourceLeaf, suiteLeaf, candidateB, registryB),
  "2026-07-22T00:00:16.000Z",
  "package B root",
);
assert.equal(
  packageBRoot.certificate.derivation.premises[0].certificate_id,
  tested.certificate.certificate_id,
);
assert.notEqual(packageBRoot.certificate.certificate_id, baseline.certificate.certificate_id);
assert.equal(
  packageBRoot.checked_closure.grounded_closure.closure.certificates.filter(
    (certificate) => certificate.certificate_id === tested.certificate.certificate_id,
  ).length,
  1,
);

// Hostile substitution 1: a genuinely signed, internally valid passing report
// for another revision cannot compose with revision A's source checkpoint.
const suiteLeafRevisionB = makeSuiteLeaf({
  fixtureScope: alternateScope,
  sourceTree: sourceTreeB,
  releasePlan: releasePlanB,
  sourceParameters: sourceParamsB,
  reportMarker: "hostile-other-revision",
  nonceByte: 10,
  capturedAt: "2026-07-22T00:00:17.000Z",
  issuedAt: "2026-07-22T00:00:17.500Z",
});
assert.notEqual(
  suiteLeafRevisionB.bundle.provenance.signature_base64,
  suiteLeaf.bundle.provenance.signature_base64,
);
const crossRevision = checked.composeRiddleProofCheckedMeaningClosures({
  expected_rule: testedRule.rule_ref,
  closures: [sourceLeaf.checked_closure, suiteLeafRevisionB.checked_closure],
  issued_at: "2026-07-22T00:00:18.000Z",
  replay_contexts: replayContexts(sourceLeaf, suiteLeafRevisionB),
  rule_registry: ruleRegistry,
  trusted_rules: trustedRules,
});
assert.equal(crossRevision.ok, false, "a signed leaf from another revision must be rejected");

// Hostile substitution 2: package B's genuinely signed registry observation
// cannot be relabeled as package A's publication, even within the same scope.
assert.notEqual(
  registryB.bundle.provenance.signature_base64,
  registryA.bundle.provenance.signature_base64,
);
const crossPackage = checked.composeRiddleProofCheckedMeaningClosures({
  expected_rule: publishedRule.rule_ref,
  closures: [candidateA.checked_closure, registryB.checked_closure],
  issued_at: "2026-07-22T00:00:18.000Z",
  replay_contexts: replayContexts(candidateA, registryB),
  rule_registry: ruleRegistry,
  trusted_rules: trustedRules,
});
assert.equal(crossPackage.ok, false, "a signed registry leaf for another package must be rejected");

// A same-package registry capture with different signed bytes is also rejected.
const wrongBytesRegistryA = makeRegistryLeaf({
  packageName: packageA,
  tarball: tarballB,
  revision: revisionA,
  nonceByte: 11,
  capturedAt: "2026-07-22T00:00:19.000Z",
  issuedAt: "2026-07-22T00:00:19.500Z",
});
const crossArtifact = checked.composeRiddleProofCheckedMeaningClosures({
  expected_rule: publishedRule.rule_ref,
  closures: [candidateA.checked_closure, wrongBytesRegistryA.checked_closure],
  issued_at: "2026-07-22T00:00:20.000Z",
  replay_contexts: replayContexts(candidateA, wrongBytesRegistryA),
  rule_registry: ruleRegistry,
  trusted_rules: trustedRules,
});
assert.equal(crossArtifact.ok, false, "different registry bytes must not match the candidate");

// Removing a reachable certificate cannot turn the remaining packet into a
// smaller proof; replay rejects the dangling derivation.
const missingNodeClosure = jsonClone(baseline.checked_closure);
missingNodeClosure.grounded_closure.closure.certificates =
  missingNodeClosure.grounded_closure.closure.certificates.filter(
    (certificate) => certificate.certificate_id !== sourceLeaf.certificate.certificate_id,
  );
const missingNodeReplay = checked.explainRiddleProofCheckedMeaningClosure({
  checked_closure: missingNodeClosure,
  replay_contexts: clonedReplayContexts(baselineContexts),
  rule_registry: jsonClone(ruleRegistry),
  trusted_rules: jsonClone(trustedRules),
});
assert.equal(missingNodeReplay.ok, false, "a reachable missing leaf must fail replay");

// Both inline-byte tampering and provenance-signature tampering fail before
// the higher release meaning can be reconstructed.
const byteTamperedClosure = jsonClone(baseline.checked_closure);
const candidateGrounding = byteTamperedClosure.grounded_closure.groundings.find(
  (grounding) => grounding.certificate_id === candidateA.certificate.certificate_id,
);
const candidateInline = candidateGrounding.bundle.inline_artifacts.find(
  (entry) => entry.artifact_id.endsWith("/candidate_tarball"),
);
candidateInline.bytes_base64 = Buffer.from("tampered candidate bytes", "utf8").toString("base64");
const byteTamperedReplay = checked.explainRiddleProofCheckedMeaningClosure({
  checked_closure: byteTamperedClosure,
  replay_contexts: clonedReplayContexts(baselineContexts),
  rule_registry: jsonClone(ruleRegistry),
  trusted_rules: jsonClone(trustedRules),
});
assert.equal(byteTamperedReplay.ok, false, "changed signed artifact bytes must fail replay");

const signatureTamperedClosure = jsonClone(baseline.checked_closure);
const sourceGrounding = signatureTamperedClosure.grounded_closure.groundings.find(
  (grounding) => grounding.certificate_id === sourceLeaf.certificate.certificate_id,
);
sourceGrounding.bundle.provenance.signature_base64 = Buffer.alloc(64, 0).toString("base64");
const signatureTamperedReplay = checked.explainRiddleProofCheckedMeaningClosure({
  checked_closure: signatureTamperedClosure,
  replay_contexts: clonedReplayContexts(baselineContexts),
  rule_registry: jsonClone(ruleRegistry),
  trusted_rules: jsonClone(trustedRules),
});
assert.equal(signatureTamperedReplay.ok, false, "changed capture signature must fail replay");

// Rule ID/version are not authority. A different complete definition with the
// same nominal identity has a different implementation digest and cannot
// validate the existing root binding.
const alteredRootDefinition = jsonClone(rootRule.registration.definition);
alteredRootDefinition.label = "Substituted release meaning under the same nominal rule identity";
const alteredRootRule = assertOk(checked.createRiddleProofCheckedMeaningRule({
  definition: alteredRootDefinition,
}), "altered same-ID root rule");
assert.equal(alteredRootRule.rule_ref.rule_id, rootRule.rule_ref.rule_id);
assert.equal(alteredRootRule.rule_ref.rule_version, rootRule.rule_ref.rule_version);
assert.notEqual(
  alteredRootRule.rule_ref.implementation_digest,
  rootRule.rule_ref.implementation_digest,
);
const alteredRuleReplay = checked.explainRiddleProofCheckedMeaningClosure({
  checked_closure: jsonClone(baseline.checked_closure),
  replay_contexts: clonedReplayContexts(baselineContexts),
  rule_registry: [
    jsonClone(testedRule.registration),
    jsonClone(publishedRule.registration),
    jsonClone(alteredRootRule.registration),
  ],
  trusted_rules: [
    jsonClone(testedRule.rule_ref),
    jsonClone(publishedRule.rule_ref),
    jsonClone(alteredRootRule.rule_ref),
  ],
});
assert.equal(alteredRuleReplay.ok, false, "same-ID altered meaning rule must fail replay");

console.log(JSON.stringify({
  ok: true,
  experiment: "semantic-compaction.release-artifact",
  baseline_root_certificate_id: baseline.certificate.certificate_id,
  source_report_certificate_id: tested.certificate.certificate_id,
  root_boundary: "Captured records are bound and byte identities match; producer assertions are not upgraded into independently established test, build, provenance, or publication facts.",
  dag_nodes: explained.explanation.node_count,
  grounded_frontier: explained.explanation.grounded_leaf_count,
  replayed: true,
  two_way_change_detection_and_selective_recomposition: true,
  two_package_source_report_branch_reuse: true,
  hostile_cross_revision_rejected: true,
  hostile_cross_package_rejected: true,
  hostile_cross_artifact_rejected: true,
  hostile_missing_node_rejected: true,
  hostile_byte_and_signature_tampering_rejected: true,
  hostile_same_id_rule_substitution_rejected: true,
}));
