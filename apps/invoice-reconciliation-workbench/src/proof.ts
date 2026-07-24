import { randomBytes } from "node:crypto";

import {
  assessRiddleProofCheckedMeaningClosure,
  composeRiddleProofCheckedMeaningClosures,
  createRiddleProofCheckedMeaningAtomicClosure,
  createRiddleProofCheckedMeaningRule,
  createRiddleProofGroundedDeclarativeJsonContract,
  createRiddleProofGroundedSemanticAtomicCertificateClosure,
  createRiddleProofGroundedSemanticCertificate,
  explainRiddleProofCheckedMeaningClosure,
  matchRiddleProofCheckedMeaningClosure,
  verifyRiddleProofSignedCaptureBundle,
  createRiddleProofSignedCaptureBundle,
  type RiddleProofCheckedMeaningClosure,
  type RiddleProofCheckedMeaningRuleDefinition,
  type RiddleProofCheckedMeaningRuleRef,
  type RiddleProofCheckedMeaningRuleRegistration,
  type RiddleProofGroundedCaptureVerificationPolicy,
  type RiddleProofGroundedExternalVerifierRegistration,
  type RiddleProofGroundedReplayContext,
  type RiddleProofGroundedSemanticContractRegistration,
  type RiddleProofGroundedTrustedSigner,
  type RiddleProofGroundedVerifierInput,
  type RiddleProofSemanticClaim,
  type RiddleProofSemanticClaimExpectation,
  type RiddleProofSemanticScope,
  type RiddleProofSignedCaptureBundle,
} from "@riddledc/riddle-proof-core";
import {
  applicationAuthorityRef,
  projectApplicationResult,
  type ApplicationAuthority,
  type ApplicationClaimRef,
  type ApplicationCurrentness,
  type ApplicationSubjectRef,
  type ApplicationVerification,
  type ApplicationVerifiedReplay,
} from "riddle-proof-application-projection-experiment";

import {
  canonicalDigest,
  deepFreeze,
  sha256Bytes,
  stableJson,
} from "./canonical.js";
import {
  INVOICE_POLICY,
  INVOICE_RECONCILIATION_STATUS_CLAIM,
  INVOICE_RECONCILIATION_SUCCESS_CLAIM,
  INVOICE_RECORD_SET_BINDING_CLAIM,
  INVOICE_REQUIREMENT_STATUS_CLAIM,
  createInvoiceApplicationAuthority,
} from "./contract.js";
import {
  analyzeInvoiceRecord,
  analyzePurchaseOrderRecord,
  analyzeRecordSet,
  inspectReceiptRecord,
} from "./records.js";
import {
  INVOICE_REQUIREMENT_IDS,
  type CapturedRecordSet,
  type InvoiceRequirementId,
  type ReconciliationAnalysis,
  type ReconciliationCheck,
  type ReconciliationProofResult,
  type RecordRole,
  type WorkbenchSigningKey,
} from "./types.js";

const RECORD_CAPTURED_CLAIM = {
  claim_id: "riddle-proof.commercial-record.structured-record-captured",
  claim_version: "1",
} as const;
const DESCRIPTOR_ROLE = "record_descriptor";
const MAX_CAPTURE_AGE_MS = 60 * 60 * 1000;
const MAX_RULE_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 1_000;
const RELATION_REQUIREMENT_IDS = INVOICE_REQUIREMENT_IDS.slice(6);
const INVOICE_REQUIREMENT_SET = new Set<InvoiceRequirementId>(
  INVOICE_REQUIREMENT_IDS.slice(0, 3),
);
const PURCHASE_ORDER_REQUIREMENT_SET = new Set<InvoiceRequirementId>(
  INVOICE_REQUIREMENT_IDS.slice(3, 6),
);
const RELATION_REQUIREMENT_SET = new Set<InvoiceRequirementId>(
  RELATION_REQUIREMENT_IDS,
);

const VERIFIER_IMPLEMENTATION = deepFreeze({
  schema: "riddle-proof.external-verifier-definition.v1",
  verifier_id: "riddle-proof.private.invoice-structured-record-verifier",
  verifier_version: "1",
  input_boundary: "signed synthetic JSON record artifacts only",
  record_schemas: [
    "riddle.synthetic.invoice.v1",
    "riddle.synthetic.purchase-order.v1",
    "riddle.synthetic.receipt.v1",
  ],
  arithmetic: "safe integer minor units",
  requirement_ids: INVOICE_REQUIREMENT_IDS,
  policy_digest: INVOICE_POLICY.digest,
  source_units: [
    "parseInvoice",
    "parsePurchaseOrder",
    "parseReceipt",
    "analyzeInvoiceRecord",
    "analyzePurchaseOrderRecord",
    "analyzeRecordSet",
  ],
});

const VERIFIER_REF = deepFreeze({
  verifier_id: VERIFIER_IMPLEMENTATION.verifier_id,
  verifier_version: VERIFIER_IMPLEMENTATION.verifier_version,
  implementation_digest: canonicalDigest(VERIFIER_IMPLEMENTATION),
  trust_basis: { kind: "external_registry" as const },
});

const COLLECTOR = deepFreeze({
  collector_id: "riddle-proof.private.invoice-workbench-local-files",
  collector_version: "1",
  implementation_digest: canonicalDigest({
    schema: "riddle-proof.collector-definition.v1",
    collector_id: "riddle-proof.private.invoice-workbench-local-files",
    collector_version: "1",
    boundary:
      "exact bytes returned by a stable local full capture whose snapshot identity matches the retained digest_only receipt",
    network: false,
    source_mutation: false,
  }),
});

type CaptureKind = "invoice" | "purchase_order" | "receipt" | "record_set";

type VerifiedObservation = {
  version: "riddle-proof.invoice-record-observation.v1";
  kind: CaptureKind;
  policy: {
    policy_id: string;
    policy_version: string;
    policy_digest: string;
  };
  digests: {
    invoice?: string;
    purchase_order?: string;
    receipt?: string;
    record_set?: string;
  };
  checks: Partial<Record<
    InvoiceRequirementId,
    { status: "satisfied" | "failed"; detail_digest: string }
  >>;
};

type SuccessfulContract = Extract<
  ReturnType<typeof createRiddleProofGroundedDeclarativeJsonContract>,
  { ok: true }
>;

type SuccessfulRule = Extract<
  ReturnType<typeof createRiddleProofCheckedMeaningRule>,
  { ok: true }
>;

type IssuedLeaf = {
  checked_closure: RiddleProofCheckedMeaningClosure;
  replay_context: RiddleProofGroundedReplayContext;
  certificate_id: string;
};

type BundleContext = {
  kind: CaptureKind;
  bundle: RiddleProofSignedCaptureBundle;
  policy: RiddleProofGroundedCaptureVerificationPolicy;
  trusted_signers: [RiddleProofGroundedTrustedSigner];
  verifier_registry: [RiddleProofGroundedExternalVerifierRegistration];
  observation: VerifiedObservation;
  bundle_id: string;
  nonce_id: string;
  issued_at: string;
};

type RecordGroup = {
  kind: "invoice" | "purchase_order" | "receipt";
  digest: string;
  capture: IssuedLeaf;
  requirements: Partial<Record<InvoiceRequirementId, IssuedLeaf>>;
  bundle_id: string;
  nonce_id: string;
};

type RelationGroup = {
  binding: IssuedLeaf;
  requirements: Record<InvoiceRequirementId, IssuedLeaf>;
  bundle_id: string;
  nonce_id: string;
};

type ReplayMaterial = {
  contexts: [RiddleProofGroundedReplayContext, ...RiddleProofGroundedReplayContext[]];
  rule_registry: [RiddleProofCheckedMeaningRuleRegistration, ...RiddleProofCheckedMeaningRuleRegistration[]];
  trusted_rules: [RiddleProofCheckedMeaningRuleRef, ...RiddleProofCheckedMeaningRuleRef[]];
  expected_root_certificate_id: string;
  expected_scope: RiddleProofSemanticScope;
  expected_claim: RiddleProofSemanticClaimExpectation;
  expected_root_rule: RiddleProofCheckedMeaningRuleRef;
};

function resultError(result: unknown, stage: string): Error {
  const error = result
    && typeof result === "object"
    && "error" in result
    && result.error
    && typeof result.error === "object"
    ? result.error as { code?: unknown }
    : undefined;
  const code = typeof error?.code === "string" ? error.code : "unknown";
  return new Error(`Invoice proof failed at ${stage} (${code}).`);
}

function requireOk<T extends { ok: boolean }>(
  value: T,
  stage: string,
): Extract<T, { ok: true }> {
  if (!value.ok) throw resultError(value, stage);
  return value as Extract<T, { ok: true }>;
}

function exactKeys(
  value: unknown,
  keys: readonly string[],
  code: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(code);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (stableJson(actual) !== stableJson(expected)) throw new Error(code);
  return value as Record<string, unknown>;
}

function parseDescriptor(bytes: Uint8Array): {
  schema: "riddle-proof.invoice-record-descriptor.v1";
  kind: CaptureKind;
  policy_id: string;
  policy_version: string;
  policy_digest: string;
} {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("record_descriptor_invalid");
  }
  const record = exactKeys(value, [
    "schema",
    "kind",
    "policy_id",
    "policy_version",
    "policy_digest",
  ], "record_descriptor_invalid");
  if (
    record.schema !== "riddle-proof.invoice-record-descriptor.v1"
    || !["invoice", "purchase_order", "receipt", "record_set"].includes(
      String(record.kind),
    )
    || record.policy_id !== INVOICE_POLICY.id
    || record.policy_version !== INVOICE_POLICY.version
    || record.policy_digest !== INVOICE_POLICY.digest
  ) {
    throw new Error("record_descriptor_invalid");
  }
  return record as ReturnType<typeof parseDescriptor>;
}

function artifactMap(input: RiddleProofGroundedVerifierInput) {
  const artifacts = new Map<string, Uint8Array>();
  for (const artifact of input.artifacts) {
    if (
      artifact.media_type !== "application/json"
      || artifacts.has(artifact.role)
      || sha256Bytes(artifact.bytes) !== artifact.artifact_digest
    ) {
      throw new Error("record_artifact_invalid");
    }
    artifacts.set(artifact.role, artifact.bytes);
  }
  return artifacts;
}

function checkObservation(
  checks: readonly ReconciliationCheck[],
): VerifiedObservation["checks"] {
  return Object.fromEntries(checks.map((check) => [
    check.requirement_id,
    {
      status: check.status,
      detail_digest: check.detail_digest,
    },
  ]));
}

function verifyStructuredRecord(
  input: RiddleProofGroundedVerifierInput,
): VerifiedObservation {
  const artifacts = artifactMap(input);
  const descriptorBytes = artifacts.get(DESCRIPTOR_ROLE);
  if (!descriptorBytes) throw new Error("record_descriptor_missing");
  const descriptor = parseDescriptor(descriptorBytes);
  const roles = [...artifacts.keys()].sort();
  let observation: VerifiedObservation;
  if (descriptor.kind === "invoice") {
    if (stableJson(roles) !== stableJson([DESCRIPTOR_ROLE, "invoice"].sort())) {
      throw new Error("invoice_artifact_roles_invalid");
    }
    const invoiceBytes = artifacts.get("invoice")!;
    const analysis = analyzeInvoiceRecord(invoiceBytes);
    observation = {
      version: "riddle-proof.invoice-record-observation.v1",
      kind: descriptor.kind,
      policy: {
        policy_id: descriptor.policy_id,
        policy_version: descriptor.policy_version,
        policy_digest: descriptor.policy_digest,
      },
      digests: { invoice: analysis.digest },
      checks: checkObservation(analysis.checks),
    };
  } else if (descriptor.kind === "purchase_order") {
    if (
      stableJson(roles)
      !== stableJson([DESCRIPTOR_ROLE, "purchase_order"].sort())
    ) {
      throw new Error("purchase_order_artifact_roles_invalid");
    }
    const poBytes = artifacts.get("purchase_order")!;
    const analysis = analyzePurchaseOrderRecord(poBytes);
    observation = {
      version: "riddle-proof.invoice-record-observation.v1",
      kind: descriptor.kind,
      policy: {
        policy_id: descriptor.policy_id,
        policy_version: descriptor.policy_version,
        policy_digest: descriptor.policy_digest,
      },
      digests: { purchase_order: analysis.digest },
      checks: checkObservation(analysis.checks),
    };
  } else if (descriptor.kind === "receipt") {
    if (stableJson(roles) !== stableJson([DESCRIPTOR_ROLE, "receipt"].sort())) {
      throw new Error("receipt_artifact_roles_invalid");
    }
    const receipt = inspectReceiptRecord(artifacts.get("receipt")!);
    observation = {
      version: "riddle-proof.invoice-record-observation.v1",
      kind: descriptor.kind,
      policy: {
        policy_id: descriptor.policy_id,
        policy_version: descriptor.policy_version,
        policy_digest: descriptor.policy_digest,
      },
      digests: { receipt: receipt.digest },
      checks: {},
    };
  } else {
    if (
      stableJson(roles)
      !== stableJson([
        DESCRIPTOR_ROLE,
        "invoice",
        "purchase_order",
        "receipt",
      ].sort())
    ) {
      throw new Error("record_set_artifact_roles_invalid");
    }
    const analysis = analyzeRecordSet({
      invoice: artifacts.get("invoice")!,
      purchase_order: artifacts.get("purchase_order")!,
      receipt: artifacts.get("receipt")!,
    });
    observation = {
      version: "riddle-proof.invoice-record-observation.v1",
      kind: descriptor.kind,
      policy: {
        policy_id: descriptor.policy_id,
        policy_version: descriptor.policy_version,
        policy_digest: descriptor.policy_digest,
      },
      digests: {
        invoice: analysis.records.digests.invoice,
        purchase_order: analysis.records.digests.purchase_order,
        receipt: analysis.records.digests.receipt,
        record_set: analysis.records.digests.record_set,
      },
      checks: checkObservation(
        analysis.checks.filter((check) =>
          RELATION_REQUIREMENT_SET.has(check.requirement_id)),
      ),
    };
  }
  return observation;
}

const VERIFIER_REGISTRATION: RiddleProofGroundedExternalVerifierRegistration = {
  ...VERIFIER_REF,
  verify: verifyStructuredRecord,
};

function policyParameters() {
  return {
    policy_id: INVOICE_POLICY.id,
    policy_version: INVOICE_POLICY.version,
    policy_digest: INVOICE_POLICY.digest,
  };
}

function descriptor(kind: CaptureKind): Uint8Array {
  return Buffer.from(JSON.stringify({
    schema: "riddle-proof.invoice-record-descriptor.v1",
    kind,
    ...policyParameters(),
  }), "utf8");
}

function publicKeyDigest(key: WorkbenchSigningKey): string {
  return sha256Bytes(Buffer.from(key.public_key_spki_base64, "base64"));
}

function claim(
  ref: { claim_id: string; claim_version: string },
  label: string,
  parameters: Record<string, string>,
): RiddleProofSemanticClaim {
  return { ...ref, label, parameters };
}

function jsonPointerAssertions(
  pairs: ReadonlyArray<readonly [string, string | boolean | number]>,
) {
  return pairs.map(([pointer, value]) => ({
    op: "equals" as const,
    source: "observation" as const,
    pointer,
    value,
  }));
}

function buildContract(input: {
  contract_id: string;
  label: string;
  claim: RiddleProofSemanticClaim;
  assertions: ReturnType<typeof jsonPointerAssertions>;
}): SuccessfulContract {
  return requireOk(createRiddleProofGroundedDeclarativeJsonContract({
    contract_id: input.contract_id,
    contract_version: "1",
    label: input.label,
    claim: input.claim,
    program: {
      all: [
        {
          op: "equals",
          source: "observation",
          pointer: "/version",
          value: "riddle-proof.invoice-record-observation.v1",
        },
        ...input.assertions,
      ],
    },
  }), `contract:${input.contract_id}`);
}

function createBundle(input: {
  kind: CaptureKind;
  role_bytes: ReadonlyArray<readonly [string, Uint8Array]>;
  scope: RiddleProofSemanticScope;
  signing_key: WorkbenchSigningKey;
  issued_at: string;
}): BundleContext {
  const nonce = randomBytes(32).toString("base64url");
  const sensor = {
    kind: "command" as const,
    name: `invoice-workbench-${input.kind}`,
    version: "1",
    observed_target: input.scope.target,
    metadata: {
      workbench: "private-offline-synthetic-invoice",
      capture_kind: input.kind,
    },
  };
  const entries = [
    [DESCRIPTOR_ROLE, descriptor(input.kind)] as const,
    ...input.role_bytes,
  ];
  const signed = requireOk(createRiddleProofSignedCaptureBundle({
    scope: input.scope,
    nonce,
    captured_at: input.issued_at,
    collector: COLLECTOR,
    sensor,
    verifier: VERIFIER_REF,
    artifacts: entries.map(([role, bytes]) => ({
      artifact_id: `${input.kind}/${role}`,
      role,
      media_type: "application/json",
      bytes_base64: Buffer.from(bytes).toString("base64"),
    })) as [
      {
        artifact_id: string;
        role: string;
        media_type: string;
        bytes_base64: string;
      },
      ...Array<{
        artifact_id: string;
        role: string;
        media_type: string;
        bytes_base64: string;
      }>,
    ],
    signing_key: {
      key_id: input.signing_key.key_id,
      private_key_pkcs8_base64:
        input.signing_key.private_key_pkcs8_base64,
    },
  }), `capture:${input.kind}`);
  const policy: RiddleProofGroundedCaptureVerificationPolicy = {
    expected_scope: input.scope,
    expected_nonce: nonce,
    expected_collector: COLLECTOR,
    expected_sensor: sensor,
    expected_verifier: VERIFIER_REF,
    expected_signer: {
      key_id: input.signing_key.key_id,
      public_key_spki_sha256: publicKeyDigest(input.signing_key),
    },
    verification_time: input.issued_at,
    max_capture_age_ms: MAX_CAPTURE_AGE_MS,
    max_future_skew_ms: MAX_FUTURE_SKEW_MS,
    required_artifact_roles: entries.map(([role]) => role) as [
      string,
      ...string[],
    ],
  };
  const trustedSigners: [RiddleProofGroundedTrustedSigner] = [{
    key_id: input.signing_key.key_id,
    public_key_spki_base64: input.signing_key.public_key_spki_base64,
  }];
  const verified = requireOk(verifyRiddleProofSignedCaptureBundle({
    bundle: signed.bundle,
    policy,
    trusted_signers: trustedSigners,
    verifier_registry: [VERIFIER_REGISTRATION],
  }), `preverify:${input.kind}`);
  return {
    kind: input.kind,
    bundle: signed.bundle,
    policy,
    trusted_signers: trustedSigners,
    verifier_registry: [VERIFIER_REGISTRATION],
    observation: verified.verified_capture.observation as VerifiedObservation,
    bundle_id: verified.verified_capture.bundle_id,
    nonce_id: sha256Bytes(Buffer.from(nonce, "utf8")),
    issued_at: input.issued_at,
  };
}

function issueLeaf(
  bundle: BundleContext,
  contract: SuccessfulContract,
): IssuedLeaf {
  const configuration = {
    policy: bundle.policy,
    trusted_signers: bundle.trusted_signers,
    verifier_registry: bundle.verifier_registry,
    contract_registry: [contract.registration] as [
      RiddleProofGroundedSemanticContractRegistration,
    ],
    expected_contract: contract.contract_ref,
  };
  const issued = requireOk(createRiddleProofGroundedSemanticCertificate({
    bundle: bundle.bundle,
    ...configuration,
    issued_at: bundle.issued_at,
  }), `leaf:${contract.registration.contract_id}`);
  const grounded = requireOk(
    createRiddleProofGroundedSemanticAtomicCertificateClosure({
      certificate: issued.certificate,
      grounding: issued.grounding,
      configuration,
    }),
    `grounding:${contract.registration.contract_id}`,
  );
  const replayContext: RiddleProofGroundedReplayContext = {
    certificate_id: issued.certificate.certificate_id,
    ...configuration,
  };
  const checked = requireOk(createRiddleProofCheckedMeaningAtomicClosure({
    grounded_closure: grounded.grounded_closure,
    replay_contexts: [replayContext],
  }), `checked-leaf:${contract.registration.contract_id}`);
  return {
    checked_closure: checked.checked_closure,
    replay_context: replayContext,
    certificate_id: issued.certificate.certificate_id,
  };
}

function commonObservationAssertions(kind: CaptureKind) {
  return jsonPointerAssertions([
    ["/kind", kind],
    ["/policy/policy_id", INVOICE_POLICY.id],
    ["/policy/policy_version", INVOICE_POLICY.version],
    ["/policy/policy_digest", INVOICE_POLICY.digest],
  ]);
}

function createRecordGroup(input: {
  kind: "invoice" | "purchase_order" | "receipt";
  bytes: Uint8Array;
  scope: RiddleProofSemanticScope;
  signing_key: WorkbenchSigningKey;
  issued_at: string;
}): RecordGroup {
  const digestName = input.kind;
  const bundle = createBundle({
    kind: input.kind,
    role_bytes: [[input.kind, input.bytes]],
    scope: input.scope,
    signing_key: input.signing_key,
    issued_at: input.issued_at,
  });
  const digest = bundle.observation.digests[digestName];
  if (!digest) throw new Error(`Verified ${input.kind} digest is missing.`);
  const captureClaim = claim(
    RECORD_CAPTURED_CLAIM,
    `The exact structured ${input.kind} record was captured`,
    {
      ...policyParameters(),
      record_role: input.kind,
      record_digest: digest,
    },
  );
  const captureContract = buildContract({
    contract_id:
      `riddle-proof.private.invoice-workbench.record-captured.${input.kind}`,
    label: `Bind the exact ${input.kind} bytes to the pinned policy`,
    claim: captureClaim,
    assertions: [
      ...commonObservationAssertions(input.kind),
      ...jsonPointerAssertions([[`/digests/${digestName}`, digest]]),
    ],
  });
  const requirements: Partial<Record<InvoiceRequirementId, IssuedLeaf>> = {};
  for (const requirementId of INVOICE_REQUIREMENT_IDS) {
    const belongs = input.kind === "invoice"
      ? INVOICE_REQUIREMENT_SET.has(requirementId)
      : input.kind === "purchase_order"
        ? PURCHASE_ORDER_REQUIREMENT_SET.has(requirementId)
        : false;
    if (!belongs) continue;
    const observed = bundle.observation.checks[requirementId];
    if (!observed) {
      throw new Error(`Verified ${requirementId} result is missing.`);
    }
    const digestParameter = input.kind === "invoice"
      ? "invoice_digest"
      : "purchase_order_digest";
    const requirementClaim = claim(
      INVOICE_REQUIREMENT_STATUS_CLAIM,
      `${requirementId} is ${observed.status}`,
      {
        ...policyParameters(),
        requirement_id: requirementId,
        status: observed.status,
        detail_digest: observed.detail_digest,
        [digestParameter]: digest,
      },
    );
    const requirementContract = buildContract({
      contract_id:
        `riddle-proof.private.invoice-workbench.requirement.${requirementId}`,
      label: `Ground ${requirementId} in the verified structured record`,
      claim: requirementClaim,
      assertions: [
        ...commonObservationAssertions(input.kind),
        ...jsonPointerAssertions([
          [`/digests/${digestName}`, digest],
          [`/checks/${requirementId}/status`, observed.status],
          [`/checks/${requirementId}/detail_digest`, observed.detail_digest],
        ]),
      ],
    });
    requirements[requirementId] = issueLeaf(bundle, requirementContract);
  }
  return {
    kind: input.kind,
    digest,
    capture: issueLeaf(bundle, captureContract),
    requirements,
    bundle_id: bundle.bundle_id,
    nonce_id: bundle.nonce_id,
  };
}

function createRelationGroup(input: {
  captured: CapturedRecordSet;
  scope: RiddleProofSemanticScope;
  signing_key: WorkbenchSigningKey;
  issued_at: string;
}): RelationGroup {
  const bundle = createBundle({
    kind: "record_set",
    role_bytes: [
      ["invoice", input.captured.bytes.invoice],
      ["purchase_order", input.captured.bytes.purchase_order],
      ["receipt", input.captured.bytes.receipt],
    ],
    scope: input.scope,
    signing_key: input.signing_key,
    issued_at: input.issued_at,
  });
  const digests = bundle.observation.digests;
  if (
    !digests.invoice
    || !digests.purchase_order
    || !digests.receipt
    || !digests.record_set
  ) {
    throw new Error("Verified record-set digests are incomplete.");
  }
  const digestAssertions = jsonPointerAssertions([
    ["/digests/invoice", digests.invoice],
    ["/digests/purchase_order", digests.purchase_order],
    ["/digests/receipt", digests.receipt],
    ["/digests/record_set", digests.record_set],
  ]);
  const bindingClaim = claim(
    INVOICE_RECORD_SET_BINDING_CLAIM,
    "The exact invoice, purchase order, and receipt form this record set",
    {
      ...policyParameters(),
      invoice_digest: digests.invoice,
      purchase_order_digest: digests.purchase_order,
      receipt_digest: digests.receipt,
      record_set_digest: digests.record_set,
    },
  );
  const bindingContract = buildContract({
    contract_id: "riddle-proof.private.invoice-workbench.record-set-bound",
    label: "Bind the exact three structured records into one record-set identity",
    claim: bindingClaim,
    assertions: [
      ...commonObservationAssertions("record_set"),
      ...digestAssertions,
    ],
  });
  const requirements = {} as Record<InvoiceRequirementId, IssuedLeaf>;
  for (const requirementId of RELATION_REQUIREMENT_IDS) {
    const observed = bundle.observation.checks[requirementId];
    if (!observed) {
      throw new Error(`Verified relation ${requirementId} is missing.`);
    }
    const relationClaim = claim(
      INVOICE_REQUIREMENT_STATUS_CLAIM,
      `${requirementId} is ${observed.status}`,
      {
        ...policyParameters(),
        requirement_id: requirementId,
        status: observed.status,
        detail_digest: observed.detail_digest,
        invoice_digest: digests.invoice,
        purchase_order_digest: digests.purchase_order,
        receipt_digest: digests.receipt,
        record_set_digest: digests.record_set,
      },
    );
    const relationContract = buildContract({
      contract_id:
        `riddle-proof.private.invoice-workbench.requirement.${requirementId}`,
      label: `Ground ${requirementId} in the verified three-record comparison`,
      claim: relationClaim,
      assertions: [
        ...commonObservationAssertions("record_set"),
        ...digestAssertions,
        ...jsonPointerAssertions([
          [`/checks/${requirementId}/status`, observed.status],
          [`/checks/${requirementId}/detail_digest`, observed.detail_digest],
        ]),
      ],
    });
    requirements[requirementId] = issueLeaf(bundle, relationContract);
  }
  return {
    binding: issueLeaf(bundle, bindingContract),
    requirements,
    bundle_id: bundle.bundle_id,
    nonce_id: bundle.nonce_id,
  };
}

function patternParameters(
  names: readonly string[],
  fixed: Readonly<Record<string, string>> = {},
) {
  return Object.fromEntries(names.map((name) => [
    name,
    Object.prototype.hasOwnProperty.call(fixed, name)
      ? { op: "equals" as const, value: fixed[name]! }
      : { op: "any" as const },
  ]));
}

function selector(
  premiseIndex: number,
  parameter: string,
) {
  return { premise_index: premiseIndex, parameter };
}

function createRules(): {
  report: SuccessfulRule;
  success: SuccessfulRule;
  requirement_indices: Readonly<Record<InvoiceRequirementId, number>>;
} {
  const requirementIndices = {
    purchase_order_line_extensions: 1,
    purchase_order_subtotal: 2,
    purchase_order_tax_total: 3,
    invoice_line_extensions: 6,
    invoice_subtotal: 7,
    invoice_tax_total: 8,
    invoice_purchase_order_identity_terms: 10,
    invoice_purchase_order_line_terms: 11,
    invoice_purchase_order_total: 12,
    invoice_receipt_identity: 13,
    invoice_receipt_quantities: 14,
  } satisfies Record<InvoiceRequirementId, number>;
  const policyNames = ["policy_id", "policy_version", "policy_digest"] as const;
  const policyFixed = {
    policy_id: INVOICE_POLICY.id,
    policy_version: INVOICE_POLICY.version,
    policy_digest: INVOICE_POLICY.digest,
  };
  const premises: RiddleProofCheckedMeaningRuleDefinition["premises"] = [
    {
      ...RECORD_CAPTURED_CLAIM,
      parameters: patternParameters(
        [...policyNames, "record_role", "record_digest"],
        { ...policyFixed, record_role: "purchase_order" },
      ),
    },
    ...([
      "purchase_order_line_extensions",
      "purchase_order_subtotal",
      "purchase_order_tax_total",
    ] as const).map((requirementId) => ({
      ...INVOICE_REQUIREMENT_STATUS_CLAIM,
      parameters: patternParameters(
        [
          ...policyNames,
          "requirement_id",
          "status",
          "detail_digest",
          "purchase_order_digest",
        ],
        { ...policyFixed, requirement_id: requirementId },
      ),
    })),
    {
      ...RECORD_CAPTURED_CLAIM,
      parameters: patternParameters(
        [...policyNames, "record_role", "record_digest"],
        { ...policyFixed, record_role: "receipt" },
      ),
    },
    {
      ...RECORD_CAPTURED_CLAIM,
      parameters: patternParameters(
        [...policyNames, "record_role", "record_digest"],
        { ...policyFixed, record_role: "invoice" },
      ),
    },
    ...([
      "invoice_line_extensions",
      "invoice_subtotal",
      "invoice_tax_total",
    ] as const).map((requirementId) => ({
      ...INVOICE_REQUIREMENT_STATUS_CLAIM,
      parameters: patternParameters(
        [
          ...policyNames,
          "requirement_id",
          "status",
          "detail_digest",
          "invoice_digest",
        ],
        { ...policyFixed, requirement_id: requirementId },
      ),
    })),
    {
      ...INVOICE_RECORD_SET_BINDING_CLAIM,
      parameters: patternParameters([
        ...policyNames,
        "invoice_digest",
        "purchase_order_digest",
        "receipt_digest",
        "record_set_digest",
      ], policyFixed),
    },
    ...RELATION_REQUIREMENT_IDS.map((requirementId) => ({
      ...INVOICE_REQUIREMENT_STATUS_CLAIM,
      parameters: patternParameters(
        [
          ...policyNames,
          "requirement_id",
          "status",
          "detail_digest",
          "invoice_digest",
          "purchase_order_digest",
          "receipt_digest",
          "record_set_digest",
        ],
        { ...policyFixed, requirement_id: requirementId },
      ),
    })),
  ] as RiddleProofCheckedMeaningRuleDefinition["premises"];
  const allPremiseIndices = premises.map((_, index) => index);
  const relationIndices = RELATION_REQUIREMENT_IDS.map(
    (requirementId) => requirementIndices[requirementId],
  );
  const equalities = [
    ...policyNames.map((parameter) => ({
      members: allPremiseIndices.map((index) =>
        selector(index, parameter)) as [
          ReturnType<typeof selector>,
          ReturnType<typeof selector>,
          ...Array<ReturnType<typeof selector>>,
        ],
    })),
    {
      members: [
        selector(9, "invoice_digest"),
        selector(5, "record_digest"),
        selector(6, "invoice_digest"),
        selector(7, "invoice_digest"),
        selector(8, "invoice_digest"),
        ...relationIndices.map((index) => selector(index, "invoice_digest")),
      ] as [
        ReturnType<typeof selector>,
        ReturnType<typeof selector>,
        ...Array<ReturnType<typeof selector>>,
      ],
    },
    {
      members: [
        selector(9, "purchase_order_digest"),
        selector(0, "record_digest"),
        selector(1, "purchase_order_digest"),
        selector(2, "purchase_order_digest"),
        selector(3, "purchase_order_digest"),
        ...relationIndices.map((index) =>
          selector(index, "purchase_order_digest")),
      ] as [
        ReturnType<typeof selector>,
        ReturnType<typeof selector>,
        ...Array<ReturnType<typeof selector>>,
      ],
    },
    {
      members: [
        selector(9, "receipt_digest"),
        selector(4, "record_digest"),
        ...relationIndices.map((index) => selector(index, "receipt_digest")),
      ] as [
        ReturnType<typeof selector>,
        ReturnType<typeof selector>,
        ...Array<ReturnType<typeof selector>>,
      ],
    },
    {
      members: [
        selector(9, "record_set_digest"),
        ...relationIndices.map((index) =>
          selector(index, "record_set_digest")),
      ] as [
        ReturnType<typeof selector>,
        ReturnType<typeof selector>,
        ...Array<ReturnType<typeof selector>>,
      ],
    },
  ];
  const report = requireOk(createRiddleProofCheckedMeaningRule({
    definition: {
      rule_id: "riddle-proof.private.invoice-workbench.status-report",
      rule_version: "1",
      label:
        "Compose exact structured records and eleven grounded requirement statuses",
      premises,
      conclusion: {
        ...INVOICE_RECONCILIATION_STATUS_CLAIM,
        label:
          "The exact invoice record set has eleven replayed requirement statuses",
        parameters: {
          ...Object.fromEntries(policyNames.map((name) => [
            name,
            {
              op: "from_premise" as const,
              premise_index: 9,
              parameter: name,
            },
          ])),
          record_set_digest: {
            op: "from_premise",
            premise_index: 9,
            parameter: "record_set_digest",
          },
          ...Object.fromEntries(INVOICE_REQUIREMENT_IDS.map(
            (requirementId) => [
              requirementId,
              {
                op: "from_premise" as const,
                premise_index: requirementIndices[requirementId],
                parameter: "status",
              },
            ],
          )),
        },
      },
      constraints: {
        all_of: true,
        parameter_equalities: equalities as [
          (typeof equalities)[number],
          ...(typeof equalities)[number][],
        ],
        ordered_premise_chronology: true,
        max_age_ms: MAX_RULE_AGE_MS,
      },
    } satisfies RiddleProofCheckedMeaningRuleDefinition,
  }), "rule:status-report");
  const reportParameterNames = [
    ...policyNames,
    "record_set_digest",
    ...INVOICE_REQUIREMENT_IDS,
  ];
  const success = requireOk(createRiddleProofCheckedMeaningRule({
    definition: {
      rule_id: "riddle-proof.private.invoice-workbench.exact-match",
      rule_version: "1",
      label:
        "Conclude exact three-way agreement only from eleven satisfied statuses",
      premises: [{
        ...INVOICE_RECONCILIATION_STATUS_CLAIM,
        parameters: patternParameters(
          reportParameterNames,
          {
            ...policyFixed,
            ...Object.fromEntries(INVOICE_REQUIREMENT_IDS.map(
              (requirementId) => [requirementId, "satisfied"],
            )),
          },
        ),
      }],
      conclusion: {
        ...INVOICE_RECONCILIATION_SUCCESS_CLAIM,
        label:
          "The exact captured invoice, purchase order, and receipt agree under the pinned policy",
        parameters: {
          ...Object.fromEntries(policyNames.map((name) => [
            name,
            {
              op: "from_premise" as const,
              premise_index: 0,
              parameter: name,
            },
          ])),
          record_set_digest: {
            op: "from_premise",
            premise_index: 0,
            parameter: "record_set_digest",
          },
        },
      },
      constraints: {
        all_of: true,
        ordered_premise_chronology: true,
        max_age_ms: MAX_RULE_AGE_MS,
      },
    } satisfies RiddleProofCheckedMeaningRuleDefinition,
  }), "rule:exact-match");
  return {
    report,
    success,
    requirement_indices: requirementIndices,
  };
}

function applicationCurrentness(
  assessment: ReturnType<typeof assessRiddleProofCheckedMeaningClosure>,
): ApplicationCurrentness {
  if (assessment.disposition === "checked") {
    return {
      status: "current",
      consumption_time: assessment.consumption_time,
    };
  }
  if (assessment.disposition === "stale") {
    return {
      status: "stale",
      consumption_time: assessment.consumption_time,
      stale_certificate_ids: assessment.stale_certificate_ids,
    };
  }
  return {
    status: "unresolved",
    diagnostic_code: assessment.error.code,
  };
}

function claimReference(claimValue: RiddleProofSemanticClaim): ApplicationClaimRef {
  return {
    claim_id: claimValue.claim_id,
    claim_version: claimValue.claim_version,
    ...(claimValue.parameters === undefined
      ? {}
      : { parameters: claimValue.parameters }),
  };
}

function verifiedApplicationReplay(input: {
  authority: ApplicationAuthority;
  subject: ApplicationSubjectRef;
  root_certificate: {
    certificate_id: string;
    claim: RiddleProofSemanticClaim;
  };
  expected_root_established: boolean;
  assessment: ReturnType<typeof assessRiddleProofCheckedMeaningClosure>;
  explanation: Extract<
    ReturnType<typeof explainRiddleProofCheckedMeaningClosure>,
    { ok: true }
  >["explanation"];
  requirement_certificates: Readonly<Record<InvoiceRequirementId, string>>;
  analysis: ReconciliationAnalysis;
  replayed_at: string;
}): ApplicationVerifiedReplay {
  const checks = new Map(input.analysis.checks.map((entry) => [
    entry.requirement_id,
    entry,
  ]));
  return {
    version: "riddle-proof.application-verification.v1",
    verification_kind: "checked_meaning_replay",
    status: "verified",
    proof_id: input.root_certificate.certificate_id,
    authority: applicationAuthorityRef(input.authority),
    spec: input.authority.specification.ref,
    subject: input.subject,
    replayed_at: input.replayed_at,
    proof_root: {
      root_certificate_id: input.root_certificate.certificate_id,
      claim: claimReference(input.root_certificate.claim),
      expected_root_established: input.expected_root_established,
    },
    currentness: applicationCurrentness(input.assessment),
    requirements: INVOICE_REQUIREMENT_IDS.map((requirementId) => {
      const checkResult = checks.get(requirementId);
      if (!checkResult) {
        return {
          requirement_id: requirementId,
          status: "unresolved" as const,
          evidence_ids: [],
          diagnostic_code: "verified_requirement_missing",
        };
      }
      return {
        requirement_id: requirementId,
        status: checkResult.status,
        evidence_ids: [input.requirement_certificates[requirementId]],
      };
    }),
    explanation: {
      root_certificate_id: input.explanation.root_certificate_id,
      node_count: input.explanation.node_count,
      grounded_leaf_count: input.explanation.grounded_leaf_count,
      checked_composition_count:
        input.explanation.checked_composition_count,
      node_certificate_ids: input.explanation.nodes
        .map((node) => node.certificate_id)
        .sort(),
      grounded_frontier: input.explanation.grounded_frontier.map((entry) => ({
        certificate_id: entry.certificate_id,
        bundle_id: entry.bundle_id,
        receipt_id: entry.receipt_id,
        statement_digest: entry.statement_digest,
        artifact_manifest_digest: entry.artifact_manifest_digest,
        observation_digest: entry.observation_digest,
        captured_at: entry.captured_at,
      })),
    },
  };
}

export interface InvoiceProofEngine {
  prove(input: {
    captured: CapturedRecordSet;
    issued_at: string;
  }): ReconciliationProofResult;
  replay(input: {
    proof: ReconciliationProofResult;
    checked_closure?: unknown;
  }):
    | { ok: true; root_certificate_id: string }
    | { ok: false; code: string };
}

export function createInvoiceProofEngine(input: {
  session_id: string;
  signing_key: WorkbenchSigningKey;
}): InvoiceProofEngine {
  if (
    typeof input.session_id !== "string"
    || !/^[A-Za-z0-9_-]{8,128}$/u.test(input.session_id)
  ) {
    throw new TypeError("session_id must be a safe opaque identifier.");
  }
  const scope: RiddleProofSemanticScope = deepFreeze({
    repository: "local-private-workbench",
    revision: "synthetic-invoice-series-v1",
    environment: "offline",
    target: `invoice-reconciliation/${input.session_id}`,
    proof_attempt: "structured-record-series",
  });
  const rules = createRules();
  const replayByRoot = new Map<string, ReplayMaterial>();
  let cachedPurchaseOrder: RecordGroup | null = null;
  let cachedReceipt: RecordGroup | null = null;

  function prove(proveInput: {
    captured: CapturedRecordSet;
    issued_at: string;
  }): ReconciliationProofResult {
    const analysis = analyzeRecordSet(proveInput.captured.bytes);
    if (
      analysis.records.digests.record_set
      !== proveInput.captured.digests.record_set
    ) {
      throw new Error("Structured record bytes do not match the local snapshot.");
    }
    if (
      !cachedPurchaseOrder
      || cachedPurchaseOrder.digest
        !== analysis.records.digests.purchase_order
    ) {
      cachedPurchaseOrder = createRecordGroup({
        kind: "purchase_order",
        bytes: proveInput.captured.bytes.purchase_order,
        scope,
        signing_key: input.signing_key,
        issued_at: proveInput.issued_at,
      });
    }
    if (
      !cachedReceipt
      || cachedReceipt.digest !== analysis.records.digests.receipt
    ) {
      cachedReceipt = createRecordGroup({
        kind: "receipt",
        bytes: proveInput.captured.bytes.receipt,
        scope,
        signing_key: input.signing_key,
        issued_at: proveInput.issued_at,
      });
    }
    const invoiceGroup = createRecordGroup({
      kind: "invoice",
      bytes: proveInput.captured.bytes.invoice,
      scope,
      signing_key: input.signing_key,
      issued_at: proveInput.issued_at,
    });
    const relationGroup = createRelationGroup({
      captured: proveInput.captured,
      scope,
      signing_key: input.signing_key,
      issued_at: proveInput.issued_at,
    });
    const orderedLeaves: IssuedLeaf[] = [
      cachedPurchaseOrder.capture,
      cachedPurchaseOrder.requirements.purchase_order_line_extensions!,
      cachedPurchaseOrder.requirements.purchase_order_subtotal!,
      cachedPurchaseOrder.requirements.purchase_order_tax_total!,
      cachedReceipt.capture,
      invoiceGroup.capture,
      invoiceGroup.requirements.invoice_line_extensions!,
      invoiceGroup.requirements.invoice_subtotal!,
      invoiceGroup.requirements.invoice_tax_total!,
      relationGroup.binding,
      ...RELATION_REQUIREMENT_IDS.map(
        (requirementId) => relationGroup.requirements[requirementId],
      ),
    ];
    const contexts = orderedLeaves.map(
      (leaf) => leaf.replay_context,
    ) as [
      RiddleProofGroundedReplayContext,
      ...RiddleProofGroundedReplayContext[],
    ];
    const ruleRegistry = [
      rules.report.registration,
      rules.success.registration,
    ] as [
      RiddleProofCheckedMeaningRuleRegistration,
      ...RiddleProofCheckedMeaningRuleRegistration[],
    ];
    const trustedRules = [
      rules.report.rule_ref,
      rules.success.rule_ref,
    ] as [
      RiddleProofCheckedMeaningRuleRef,
      ...RiddleProofCheckedMeaningRuleRef[],
    ];
    const report = requireOk(composeRiddleProofCheckedMeaningClosures({
      expected_rule: rules.report.rule_ref,
      closures: orderedLeaves.map(
        (leaf) => leaf.checked_closure,
      ) as [unknown, ...unknown[]],
      issued_at: proveInput.issued_at,
      replay_contexts: contexts,
      rule_registry: ruleRegistry,
      trusted_rules: trustedRules,
    }), "compose:status-report");
    const allSatisfied = analysis.checks.every(
      (entry) => entry.status === "satisfied",
    );
    const root = allSatisfied
      ? requireOk(composeRiddleProofCheckedMeaningClosures({
          expected_rule: rules.success.rule_ref,
          closures: [report.checked_closure],
          issued_at: proveInput.issued_at,
          replay_contexts: contexts,
          rule_registry: ruleRegistry,
          trusted_rules: trustedRules,
        }), "compose:exact-match")
      : report;
    const expectedClaim: RiddleProofSemanticClaimExpectation = allSatisfied
      ? {
          ...INVOICE_RECONCILIATION_SUCCESS_CLAIM,
          parameters: {
            ...policyParameters(),
            record_set_digest: analysis.records.digests.record_set,
          },
        }
      : {
          ...INVOICE_RECONCILIATION_STATUS_CLAIM,
          parameters: {
            ...policyParameters(),
            record_set_digest: analysis.records.digests.record_set,
            ...Object.fromEntries(analysis.checks.map((entry) => [
              entry.requirement_id,
              entry.status,
            ])),
          },
        };
    const expectedRootRule = allSatisfied
      ? rules.success.rule_ref
      : rules.report.rule_ref;
    const matched = requireOk(matchRiddleProofCheckedMeaningClosure({
      checked_closure: root.checked_closure,
      replay_contexts: contexts,
      rule_registry: ruleRegistry,
      trusted_rules: trustedRules,
      expected_root_certificate_id: root.certificate.certificate_id,
      expected_scope: scope,
      expected_claim: expectedClaim,
      expected_root_rule: expectedRootRule,
    }), "replay:root");
    const explanation = requireOk(explainRiddleProofCheckedMeaningClosure({
      checked_closure: matched.checked_closure,
      replay_contexts: contexts,
      rule_registry: ruleRegistry,
      trusted_rules: trustedRules,
    }), "explain:root");
    const assessment = assessRiddleProofCheckedMeaningClosure({
      checked_closure: matched.checked_closure,
      replay_contexts: contexts,
      rule_registry: ruleRegistry,
      trusted_rules: trustedRules,
      consumption_time: proveInput.issued_at,
      max_grounded_age_ms: MAX_CAPTURE_AGE_MS,
      max_future_skew_ms: MAX_FUTURE_SKEW_MS,
    });
    const requirementCertificates = Object.fromEntries(
      INVOICE_REQUIREMENT_IDS.map((requirementId) => {
        const leaf = INVOICE_REQUIREMENT_SET.has(requirementId)
          ? invoiceGroup.requirements[requirementId]
          : PURCHASE_ORDER_REQUIREMENT_SET.has(requirementId)
            ? cachedPurchaseOrder!.requirements[requirementId]
            : relationGroup.requirements[requirementId];
        if (!leaf) {
          throw new Error(`Requirement certificate ${requirementId} is missing.`);
        }
        return [requirementId, leaf.certificate_id];
      }),
    ) as Record<InvoiceRequirementId, string>;
    const authority = createInvoiceApplicationAuthority(
      analysis.records.digests.record_set,
    );
    const subject: ApplicationSubjectRef = {
      id: input.session_id,
      digest: analysis.records.digests.record_set,
      kind: "invoice_record_set",
    };
    const verification: ApplicationVerification =
      verifiedApplicationReplay({
        authority,
        subject,
        root_certificate: matched.root_certificate,
        expected_root_established: allSatisfied,
        assessment,
        explanation: explanation.explanation,
        requirement_certificates: requirementCertificates,
        analysis,
        replayed_at: proveInput.issued_at,
      });
    const projection = projectApplicationResult({
      authority,
      subject,
      verification,
    });
    const replayMaterial: ReplayMaterial = {
      contexts,
      rule_registry: ruleRegistry,
      trusted_rules: trustedRules,
      expected_root_certificate_id: matched.root_certificate.certificate_id,
      expected_scope: scope,
      expected_claim: expectedClaim,
      expected_root_rule: expectedRootRule,
    };
    replayByRoot.set(
      matched.root_certificate.certificate_id,
      replayMaterial,
    );
    return deepFreeze({
      projection,
      verification,
      analysis,
      authoritative_closure: matched.checked_closure,
      certificate_ids: requirementCertificates,
      reusable_certificate_ids: {
        purchase_order: [
          cachedPurchaseOrder.capture.certificate_id,
          cachedPurchaseOrder.requirements
            .purchase_order_line_extensions!.certificate_id,
          cachedPurchaseOrder.requirements
            .purchase_order_subtotal!.certificate_id,
          cachedPurchaseOrder.requirements
            .purchase_order_tax_total!.certificate_id,
        ],
        receipt: [cachedReceipt.capture.certificate_id],
      },
      audit: {
        snapshot_receipt: proveInput.captured.receipt,
        policy: {
          id: INVOICE_POLICY.id,
          version: INVOICE_POLICY.version,
          digest: INVOICE_POLICY.digest,
        },
        signed_bundle_ids: [
          cachedPurchaseOrder.bundle_id,
          cachedReceipt.bundle_id,
          invoiceGroup.bundle_id,
          relationGroup.bundle_id,
        ],
        nonce_ids: [
          cachedPurchaseOrder.nonce_id,
          cachedReceipt.nonce_id,
          invoiceGroup.nonce_id,
          relationGroup.nonce_id,
        ],
      },
    });
  }

  return Object.freeze({
    prove,
    replay(replayInput: {
      proof: ReconciliationProofResult;
      checked_closure?: unknown;
    }) {
      const rootId = replayInput.proof.projection.identity.root_certificate_id;
      if (!rootId) return { ok: false as const, code: "proof_root_missing" };
      const material = replayByRoot.get(rootId);
      if (!material) return { ok: false as const, code: "proof_not_stored" };
      const replayed = matchRiddleProofCheckedMeaningClosure({
        checked_closure:
          replayInput.checked_closure
          ?? replayInput.proof.authoritative_closure,
        replay_contexts: material.contexts,
        rule_registry: material.rule_registry,
        trusted_rules: material.trusted_rules,
        expected_root_certificate_id:
          material.expected_root_certificate_id,
        expected_scope: material.expected_scope,
        expected_claim: material.expected_claim,
        expected_root_rule: material.expected_root_rule,
      });
      return replayed.ok
        ? {
            ok: true as const,
            root_certificate_id:
              replayed.root_certificate.certificate_id,
          }
        : { ok: false as const, code: replayed.error.code };
    },
  });
}
