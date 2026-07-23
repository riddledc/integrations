import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { TextDecoder } from "node:util";

import * as checked from "../../../packages/riddle-proof-core/dist/checked-meaning.js";
import * as grounded from "../../../packages/riddle-proof-core/dist/grounded-evidence.js";

/*
 * Public, synthetic, offline capability experiment.
 *
 * The records are inline because they are fixtures. A real integration should
 * keep record contents inside an approved boundary and use content-light
 * receipts for ordinary logs.
 */

const CLAIMS = Object.freeze({
  invoice: "riddle-proof.commercial-record.invoice-captured-arithmetic-consistent",
  purchaseOrder: "riddle-proof.commercial-record.purchase-order-captured-consistent",
  receipt: "riddle-proof.commercial-record.receipt-captured",
  payment: "riddle-proof.commercial-record.payment-record-captured",
  invoiceRegister: "riddle-proof.commercial-record.invoice-register-entry-counted",
  invoiceToPo: "riddle-proof.commercial-record.invoice-purchase-order-terms-match",
  invoiceToReceipt: "riddle-proof.commercial-record.invoice-receipt-quantities-match",
  threeRecord: "riddle-proof.commercial-record.invoice-po-receipt-match",
  invoiceToPayment: "riddle-proof.commercial-record.invoice-payment-amount-match",
  invoiceIdentityUnique: "riddle-proof.commercial-record.invoice-identity-unique-in-register",
  root: "riddle-proof.commercial-record.captured-fields-agree-under-policy",
});

// Source-level vocabulary smoke check only: Lean and JavaScript intentionally
// use different structures, rule IDs, and grounding boundaries.
const leanSource = readFileSync(
  new URL(
    "../../../formal/riddle-proof-kernel/RiddleProofKernel/SyntheticRecordReconciliation.lean",
    import.meta.url,
  ),
  "utf8",
);
for (const claimId of Object.values(CLAIMS)) {
  const quotedClaimId = `"${claimId}"`;
  assert.equal(
    leanSource.split(quotedClaimId).length - 1,
    1,
    `${claimId} must appear exactly once as a quoted Lean claim ID`,
  );
}
assert.match(
  leanSource,
  /\btheorem captured_fields_root_meaning_iff_exact_relationships\b/u,
  "Lean must retain the exact root-meaning theorem",
);
assert.match(
  leanSource,
  /\bstructure CanonicalCorrespondence\b/u,
  "Lean must retain the explicit canonical-correspondence boundary",
);
assert.match(
  leanSource,
  /\babbrev ParameterDescribes\b/u,
  "Lean must retain the opaque parameter-description boundary",
);
const FORMAL_ONLY_BINARY_ASSOCIATION_CLAIM =
  "riddle-proof.commercial-record.formal-identity-and-payment-association";
assert.equal(
  leanSource.includes(`"${FORMAL_ONLY_BINARY_ASSOCIATION_CLAIM}"`),
  true,
  "Lean must retain its formal-only binary association claim",
);
assert.equal(
  Object.values(CLAIMS).includes(FORMAL_ONLY_BINARY_ASSOCIATION_CLAIM),
  false,
  "the formal-only binary association must not become a runtime claim",
);

const OBSERVATION_ROLE = "record_observation";
const MAX_AGE_MS = 60 * 60 * 1000;
const textDecoder = new TextDecoder("utf-8", { fatal: true });

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function jsonBytes(value) {
  return Buffer.from(JSON.stringify(value), "utf8");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${stableJson(value[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function canonicalDigest(value) {
  return sha256(Buffer.from(stableJson(value), "utf8"));
}

const POLICY_DEFINITION = Object.freeze({
  schema: "riddle-proof.synthetic-commercial-record-policy.v1",
  policy_id: "synthetic-commercial-record.strict-exact-match",
  policy_version: "1",
  rules: {
    invoice_arithmetic: "line extensions sum to subtotal and subtotal plus tax equals total",
    purchase_order_arithmetic: "line extensions sum to subtotal and subtotal plus tax equals total",
    invoice_to_purchase_order: [
      "buyer",
      "supplier",
      "purchase-order identity",
      "currency",
      "payment terms",
      "ordered line identities",
      "SKU",
      "quantity",
      "unit price",
      "total",
    ],
    invoice_to_receipt: [
      "buyer",
      "supplier",
      "purchase-order identity",
      "ordered line identities",
      "SKU",
      "quantity",
    ],
    invoice_to_payment: [
      "buyer",
      "supplier",
      "invoice identity",
      "currency",
      "amount",
      "captured status equals posted",
    ],
    invoice_identity: "exactly one matching supplier and invoice identity in the supplied register",
  },
  non_conclusions: [
    "record authenticity",
    "authorization",
    "legal validity",
    "fraud absence",
    "completeness outside the supplied register",
    "approval to pay",
    "actual movement of money",
  ],
});

const RECONCILIATION_POLICY = Object.freeze({
  policy_id: POLICY_DEFINITION.policy_id,
  policy_version: POLICY_DEFINITION.policy_version,
  policy_digest: canonicalDigest(POLICY_DEFINITION),
});

const POLICY_PARAMETERS = ["policy_id", "policy_version", "policy_digest"];
const POLICY_PARAMETER_POINTERS = Object.freeze({
  policy_id: "/metadata/policy_id",
  policy_version: "/metadata/policy_version",
  policy_digest: "/metadata/policy_digest",
});

function policyParameters(policy) {
  return {
    policy_id: policy.policy_id,
    policy_version: policy.policy_version,
    policy_digest: policy.policy_digest,
  };
}

function assertOk(result, label) {
  assert.equal(
    result.ok,
    true,
    result.ok ? undefined : `${label}: ${result.error.message}`,
  );
  if (!result.ok) throw new Error(`${label}: ${result.error.message}`);
  return result;
}

function assertFailure(result, expectedCode, label) {
  assert.equal(result.ok, false, `${label} must fail`);
  assert.equal(result.error.code, expectedCode, `${label} error code`);
  return result.error;
}

function assertErrorPath(result, expectedCodes, label) {
  assert.equal(result.ok, false, `${label} must fail`);
  let error = result.error;
  for (const [index, expectedCode] of expectedCodes.entries()) {
    assert.equal(error?.code, expectedCode, `${label} error path[${index}]`);
    error = error.cause;
  }
  return result.error;
}

function changedParameterNames(before, after) {
  assert.deepEqual(
    Object.keys(after).sort(),
    Object.keys(before).sort(),
    "compared root claims must expose the same parameter set",
  );
  return Object.keys(before).filter(
    (name) => stableJson(before[name]) !== stableJson(after[name]),
  ).sort();
}

function closureCertificateIds(result) {
  return new Set(
    result.checked_closure.grounded_closure.closure.certificates.map(
      (certificate) => certificate.certificate_id,
    ),
  );
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} keys`);
}

function nonemptyString(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.notEqual(value.length, 0, `${label} must not be empty`);
  return value;
}

function safeInteger(value, label, minimum = 0) {
  assert.equal(Number.isSafeInteger(value), true, `${label} must be a safe integer`);
  assert.equal(value >= minimum, true, `${label} must be at least ${minimum}`);
  return value;
}

function currency(value, label) {
  nonemptyString(value, label);
  assert.match(value, /^[A-Z]{3}$/u, `${label} must be an ISO-style currency code`);
  return value;
}

function parseJsonBytes(bytes, label) {
  const parsed = JSON.parse(textDecoder.decode(bytes));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must contain a JSON object.`);
  }
  return parsed;
}

function validatePricedLines(lines, label) {
  assert.equal(Array.isArray(lines), true, `${label} must be an array`);
  assert.equal(lines.length > 0, true, `${label} must not be empty`);
  const lineIds = new Set();
  const skus = new Set();
  let subtotal = 0;
  const normalizedTerms = [];
  const normalizedQuantities = [];
  for (const [index, line] of lines.entries()) {
    exactKeys(
      line,
      ["line_id", "sku", "quantity", "unit_price_minor", "extended_minor"],
      `${label}[${index}]`,
    );
    const lineId = nonemptyString(line.line_id, `${label}[${index}].line_id`);
    const sku = nonemptyString(line.sku, `${label}[${index}].sku`);
    const quantityValue = safeInteger(line.quantity, `${label}[${index}].quantity`, 1);
    const unitPrice = safeInteger(
      line.unit_price_minor,
      `${label}[${index}].unit_price_minor`,
    );
    const extended = safeInteger(
      line.extended_minor,
      `${label}[${index}].extended_minor`,
    );
    assert.equal(lineIds.has(lineId), false, `${label} line_id values must be unique`);
    assert.equal(skus.has(sku), false, `${label} SKU values must be unique in v1`);
    lineIds.add(lineId);
    skus.add(sku);
    const computed = quantityValue * unitPrice;
    assert.equal(Number.isSafeInteger(computed), true, `${label}[${index}] extension overflow`);
    assert.equal(extended, computed, `${label}[${index}] extension must equal quantity times unit price`);
    subtotal += extended;
    assert.equal(Number.isSafeInteger(subtotal), true, `${label} subtotal overflow`);
    normalizedTerms.push({
      line_id: lineId,
      sku,
      quantity: quantityValue,
      unit_price_minor: unitPrice,
    });
    normalizedQuantities.push({ line_id: lineId, sku, quantity: quantityValue });
  }
  return {
    subtotal,
    line_terms_digest: canonicalDigest(normalizedTerms),
    quantity_digest: canonicalDigest(normalizedQuantities),
  };
}

function validateInvoice(invoice, digest) {
  exactKeys(invoice, [
    "schema",
    "buyer_id",
    "supplier_id",
    "invoice_id",
    "po_id",
    "currency",
    "payment_terms",
    "line_items",
    "subtotal_minor",
    "tax_minor",
    "total_minor",
    "memo",
  ], "invoice");
  assert.equal(invoice.schema, "synthetic.invoice.v1");
  nonemptyString(invoice.buyer_id, "invoice.buyer_id");
  nonemptyString(invoice.supplier_id, "invoice.supplier_id");
  nonemptyString(invoice.invoice_id, "invoice.invoice_id");
  nonemptyString(invoice.po_id, "invoice.po_id");
  currency(invoice.currency, "invoice.currency");
  nonemptyString(invoice.payment_terms, "invoice.payment_terms");
  nonemptyString(invoice.memo, "invoice.memo");
  const lines = validatePricedLines(invoice.line_items, "invoice.line_items");
  const subtotal = safeInteger(invoice.subtotal_minor, "invoice.subtotal_minor");
  const tax = safeInteger(invoice.tax_minor, "invoice.tax_minor");
  const total = safeInteger(invoice.total_minor, "invoice.total_minor");
  assert.equal(subtotal, lines.subtotal, "invoice subtotal must equal line extensions");
  assert.equal(total, subtotal + tax, "invoice total must equal subtotal plus tax");
  return {
    arithmetic_consistent: true,
    invoice_digest: digest,
    line_terms_digest: lines.line_terms_digest,
    quantity_digest: lines.quantity_digest,
  };
}

function validatePurchaseOrder(purchaseOrder, digest) {
  exactKeys(purchaseOrder, [
    "schema",
    "buyer_id",
    "supplier_id",
    "po_id",
    "currency",
    "payment_terms",
    "line_items",
    "subtotal_minor",
    "tax_minor",
    "total_minor",
  ], "purchase_order");
  assert.equal(purchaseOrder.schema, "synthetic.purchase-order.v1");
  nonemptyString(purchaseOrder.buyer_id, "purchase_order.buyer_id");
  nonemptyString(purchaseOrder.supplier_id, "purchase_order.supplier_id");
  nonemptyString(purchaseOrder.po_id, "purchase_order.po_id");
  currency(purchaseOrder.currency, "purchase_order.currency");
  nonemptyString(purchaseOrder.payment_terms, "purchase_order.payment_terms");
  const lines = validatePricedLines(purchaseOrder.line_items, "purchase_order.line_items");
  const subtotal = safeInteger(
    purchaseOrder.subtotal_minor,
    "purchase_order.subtotal_minor",
  );
  const tax = safeInteger(purchaseOrder.tax_minor, "purchase_order.tax_minor");
  const total = safeInteger(purchaseOrder.total_minor, "purchase_order.total_minor");
  assert.equal(subtotal, lines.subtotal, "purchase-order subtotal must equal line extensions");
  assert.equal(total, subtotal + tax, "purchase-order total must equal subtotal plus tax");
  return {
    arithmetic_consistent: true,
    po_digest: digest,
    line_terms_digest: lines.line_terms_digest,
    quantity_digest: lines.quantity_digest,
  };
}

function validateReceipt(receipt, digest) {
  exactKeys(receipt, [
    "schema",
    "buyer_id",
    "supplier_id",
    "receipt_id",
    "po_id",
    "received_at",
    "line_items",
  ], "receipt");
  assert.equal(receipt.schema, "synthetic.receipt.v1");
  nonemptyString(receipt.buyer_id, "receipt.buyer_id");
  nonemptyString(receipt.supplier_id, "receipt.supplier_id");
  nonemptyString(receipt.receipt_id, "receipt.receipt_id");
  nonemptyString(receipt.po_id, "receipt.po_id");
  nonemptyString(receipt.received_at, "receipt.received_at");
  assert.equal(Array.isArray(receipt.line_items), true, "receipt.line_items must be an array");
  assert.equal(receipt.line_items.length > 0, true, "receipt.line_items must not be empty");
  const lineIds = new Set();
  const skus = new Set();
  const normalizedQuantities = receipt.line_items.map((line, index) => {
    exactKeys(line, ["line_id", "sku", "quantity"], `receipt.line_items[${index}]`);
    const lineId = nonemptyString(line.line_id, `receipt.line_items[${index}].line_id`);
    const sku = nonemptyString(line.sku, `receipt.line_items[${index}].sku`);
    const quantityValue = safeInteger(
      line.quantity,
      `receipt.line_items[${index}].quantity`,
      1,
    );
    assert.equal(lineIds.has(lineId), false, "receipt line_id values must be unique");
    assert.equal(skus.has(sku), false, "receipt SKU values must be unique in v1");
    lineIds.add(lineId);
    skus.add(sku);
    return { line_id: lineId, sku, quantity: quantityValue };
  });
  return {
    receipt_digest: digest,
    quantity_digest: canonicalDigest(normalizedQuantities),
  };
}

function validatePayment(payment, digest) {
  exactKeys(payment, [
    "schema",
    "buyer_id",
    "supplier_id",
    "payment_id",
    "invoice_id",
    "currency",
    "amount_minor",
    "status",
    "reference",
  ], "payment");
  assert.equal(payment.schema, "synthetic.payment-record.v1");
  nonemptyString(payment.buyer_id, "payment.buyer_id");
  nonemptyString(payment.supplier_id, "payment.supplier_id");
  nonemptyString(payment.payment_id, "payment.payment_id");
  nonemptyString(payment.invoice_id, "payment.invoice_id");
  currency(payment.currency, "payment.currency");
  safeInteger(payment.amount_minor, "payment.amount_minor", 1);
  assert.equal(payment.status, "posted", "synthetic v1 requires a posted payment record");
  nonemptyString(payment.reference, "payment.reference");
  return { payment_digest: digest, status_is_posted: true };
}

function validateInvoiceRegister(register, digest, metadata) {
  exactKeys(register, ["schema", "buyer_id", "entries"], "invoice_register");
  assert.equal(register.schema, "synthetic.invoice-register.v1");
  nonemptyString(register.buyer_id, "invoice_register.buyer_id");
  assert.equal(Array.isArray(register.entries), true, "invoice_register.entries must be an array");
  nonemptyString(metadata.target_invoice_id, "record_observation.target_invoice_id");
  nonemptyString(metadata.target_supplier_id, "record_observation.target_supplier_id");
  const identities = register.entries.map((entry, index) => {
    exactKeys(entry, ["invoice_id", "supplier_id"], `invoice_register.entries[${index}]`);
    return {
      invoice_id: nonemptyString(
        entry.invoice_id,
        `invoice_register.entries[${index}].invoice_id`,
      ),
      supplier_id: nonemptyString(
        entry.supplier_id,
        `invoice_register.entries[${index}].supplier_id`,
      ),
    };
  });
  const occurrenceCount = identities.filter(
    (entry) => entry.invoice_id === metadata.target_invoice_id
      && entry.supplier_id === metadata.target_supplier_id,
  ).length;
  return {
    register_digest: digest,
    target_invoice_id: metadata.target_invoice_id,
    target_supplier_id: metadata.target_supplier_id,
    occurrence_count: occurrenceCount,
  };
}

/**
 * Independently pinned deterministic verifier. It recomputes every artifact
 * digest from the signed bytes, parses the selected record, and computes the
 * arithmetic and normalized line identities used by leaf contracts.
 */
function verifyCommercialRecordBytes(input) {
  const metadataArtifacts = input.artifacts.filter(
    (artifact) => artifact.role === OBSERVATION_ROLE,
  );
  if (metadataArtifacts.length !== 1) {
    throw new Error("Exactly one record observation artifact is required.");
  }
  const metadata = parseJsonBytes(metadataArtifacts[0].bytes, OBSERVATION_ROLE);
  const documents = {};
  const digests = {};
  for (const artifact of input.artifacts) {
    const computed = sha256(Buffer.from(artifact.bytes));
    if (computed !== artifact.artifact_digest) {
      throw new Error(`Artifact manifest digest mismatch for ${artifact.role}.`);
    }
    if (artifact.role === OBSERVATION_ROLE) continue;
    if (Object.hasOwn(documents, artifact.role)) {
      throw new Error(`Artifact role ${artifact.role} is duplicated.`);
    }
    if (artifact.media_type !== "application/json") {
      throw new Error(`Artifact ${artifact.role} must be application/json.`);
    }
    documents[artifact.role] = parseJsonBytes(artifact.bytes, artifact.role);
    digests[artifact.role] = computed;
  }

  let derived;
  switch (metadata.kind) {
    case "invoice":
      derived = validateInvoice(documents.invoice, digests.invoice);
      break;
    case "purchase_order":
      derived = validatePurchaseOrder(
        documents.purchase_order,
        digests.purchase_order,
      );
      break;
    case "receipt":
      derived = validateReceipt(documents.receipt, digests.receipt);
      break;
    case "payment":
      derived = validatePayment(documents.payment, digests.payment);
      break;
    case "invoice_register":
      derived = validateInvoiceRegister(
        documents.invoice_register,
        digests.invoice_register,
        metadata,
      );
      break;
    default:
      throw new Error(`Unsupported synthetic record kind ${String(metadata.kind)}.`);
  }
  return { metadata, documents, digests, derived };
}

/*
 * The verifier identity covers a canonical, versioned source artifact for the
 * entrypoint and every local helper that can affect substantive validation.
 * Imported runtime primitives are named explicitly. This pins this experiment's
 * verifier definition; it does not attest to Node, the compiler, or the host.
 */
const VERIFIER_IMPLEMENTATION_ARTIFACT = Object.freeze({
  schema: "riddle-proof.external-verifier-source.v1",
  verifier_id: "riddle-proof.experiment.commercial-record-bytes",
  verifier_version: "2",
  runtime_dependencies: {
    assertions: "node:assert/strict",
    buffers: "node:Buffer",
    hashing: "node:crypto.createHash(sha256)",
    text_decoding: "node:util.TextDecoder(utf-8,fatal=true)",
    language_runtime: "ECMAScript modules on supported Node.js",
  },
  constants: {
    observation_role: OBSERVATION_ROLE,
    accepted_media_type: "application/json",
  },
  source_units: [
    ["stableJson", stableJson.toString()],
    ["sha256", sha256.toString()],
    ["canonicalDigest", canonicalDigest.toString()],
    ["exactKeys", exactKeys.toString()],
    ["nonemptyString", nonemptyString.toString()],
    ["safeInteger", safeInteger.toString()],
    ["currency", currency.toString()],
    ["parseJsonBytes", parseJsonBytes.toString()],
    ["validatePricedLines", validatePricedLines.toString()],
    ["validateInvoice", validateInvoice.toString()],
    ["validatePurchaseOrder", validatePurchaseOrder.toString()],
    ["validateReceipt", validateReceipt.toString()],
    ["validatePayment", validatePayment.toString()],
    ["validateInvoiceRegister", validateInvoiceRegister.toString()],
    ["verifyCommercialRecordBytes", verifyCommercialRecordBytes.toString()],
  ],
});
const VERIFIER_IMPLEMENTATION_DIGEST = canonicalDigest(
  VERIFIER_IMPLEMENTATION_ARTIFACT,
);

const VERIFIER_REF = Object.freeze({
  verifier_id: "riddle-proof.experiment.commercial-record-bytes",
  verifier_version: "2",
  implementation_digest: VERIFIER_IMPLEMENTATION_DIGEST,
  trust_basis: { kind: "external_registry" },
});

const VERIFIER_REGISTRATION = Object.freeze({
  ...VERIFIER_REF,
  verify: verifyCommercialRecordBytes,
});

const COLLECTOR_IMPLEMENTATION_ARTIFACT = Object.freeze({
  schema: "riddle-proof.synthetic-collector-definition.v1",
  collector_id: "riddle-proof.experiment.synthetic-commercial-records",
  collector_version: "2",
  input_boundary: "in-memory public synthetic fixture objects only",
  canonical_capture_steps: [
    "serialize each fixture with JSON.stringify and UTF-8",
    "assign a unique artifact role and media type application/json",
    "include a policy-identity-bearing record_observation artifact",
    "inline artifact bytes as canonical base64 in the signed capture bundle",
    "bind scope, nonce, collector, sensor, verifier, and artifact manifest",
    "sign the capture statement with Ed25519",
  ],
  capabilities: {
    filesystem: false,
    network: false,
    browser: false,
    subprocess: false,
  },
});

const COLLECTOR = Object.freeze({
  collector_id: COLLECTOR_IMPLEMENTATION_ARTIFACT.collector_id,
  collector_version: COLLECTOR_IMPLEMENTATION_ARTIFACT.collector_version,
  implementation_digest: canonicalDigest(COLLECTOR_IMPLEMENTATION_ARTIFACT),
});

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyBytes = privateKey.export({ format: "der", type: "pkcs8" });
const publicKeyBytes = publicKey.export({ format: "der", type: "spki" });
const keyId = "semantic-compaction-commercial-record-experiment";
const trustedSigner = {
  key_id: keyId,
  public_key_spki_base64: publicKeyBytes.toString("base64"),
};
const expectedSigner = {
  key_id: keyId,
  public_key_spki_sha256: sha256(publicKeyBytes),
};

function artifact(role, value) {
  return {
    role,
    bytes: jsonBytes(value),
    mediaType: "application/json",
  };
}

function issueLeaf({
  name,
  scope,
  kind,
  claimId,
  claimLabel,
  parameters,
  parameterPointers,
  recordArtifacts,
  metadata = {},
  requiredAssertions = [],
  nonceByte,
  policy = RECONCILIATION_POLICY,
  expectContractRejection = false,
}) {
  assert.deepEqual(
    Object.keys(parameterPointers).sort(),
    Object.keys(parameters).sort(),
    `${name} must bind every claim parameter to verifier output`,
  );
  const contractDefinition = {
    contract_id: `riddle-proof.experiment.commercial-record.${name}`,
    contract_version: "1",
    label: `Accept the exact verified ${kind} record observation`,
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
        { op: "equals", source: "observation", pointer: "/metadata/kind", value: kind },
        {
          op: "equals",
          source: "observation",
          pointer: "/metadata/adapter",
          value: "synthetic-commercial-record-lab.v1",
        },
        ...Object.entries(parameterPointers).map(([parameter, pointer]) => ({
          op: "equals",
          source: "observation",
          pointer,
          value: parameters[parameter],
        })),
        ...requiredAssertions,
      ],
    },
  };
  const contract = assertOk(
    grounded.createRiddleProofGroundedDeclarativeJsonContract({
      ...contractDefinition,
    }),
    `${name} contract`,
  );

  const sensor = {
    kind: "command",
    name: `synthetic-commercial-record-${kind}-${nonceByte}`,
    version: "1",
    observed_target: scope.target,
    metadata: { experiment: "commercial-record-reconciliation", record_kind: kind },
  };
  const nonce = Buffer.alloc(32, nonceByte).toString("base64url");
  const inputs = [
    artifact(OBSERVATION_ROLE, {
      kind,
      adapter: "synthetic-commercial-record-lab.v1",
      ...metadata,
      ...policyParameters(policy),
    }),
    ...recordArtifacts,
  ];
  const capturedAt = "2026-07-23T01:00:00.000Z";
  const issuedAt = "2026-07-23T01:00:00.500Z";
  const signed = assertOk(
    grounded.createRiddleProofSignedCaptureBundle({
      scope,
      nonce,
      captured_at: capturedAt,
      collector: COLLECTOR,
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
    }),
    `${name} signed capture`,
  );

  const configuration = {
    policy: {
      expected_scope: scope,
      expected_nonce: nonce,
      expected_collector: COLLECTOR,
      expected_sensor: sensor,
      expected_verifier: VERIFIER_REF,
      expected_signer: expectedSigner,
      verification_time: issuedAt,
      max_capture_age_ms: MAX_AGE_MS,
      max_future_skew_ms: 1_000,
      required_artifact_roles: inputs.map((entry) => entry.role),
    },
    trusted_signers: [trustedSigner],
    verifier_registry: [VERIFIER_REGISTRATION],
    contract_registry: [contract.registration],
    expected_contract: contract.contract_ref,
  };
  const issuedResult = grounded.createRiddleProofGroundedSemanticCertificate({
    bundle: signed.bundle,
    ...configuration,
    issued_at: issuedAt,
  });
  if (expectContractRejection) {
    assert.equal(issuedResult.ok, false, `${name} must be rejected by its grounded contract`);
    assert.equal(
      issuedResult.error.code,
      "contract_rejected",
      `${name} must reach deterministic contract evaluation before rejection`,
    );
    return {
      rejected: true,
      result: issuedResult,
      bundle: signed.bundle,
      contract_definition: contractDefinition,
      contract_ref: contract.contract_ref,
      contract_registration: contract.registration,
    };
  }
  const issued = assertOk(issuedResult, `${name} grounded certificate`);
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
  const atomic = assertOk(
    checked.createRiddleProofCheckedMeaningAtomicClosure({
      grounded_closure: groundedClosure.grounded_closure,
      replay_contexts: [replayContext],
    }),
    `${name} checked atomic closure`,
  );
  return {
    bundle: signed.bundle,
    certificate: issued.certificate,
    checked_closure: atomic.checked_closure,
    replay_context: replayContext,
    contract_definition: contractDefinition,
    contract_ref: contract.contract_ref,
    contract_registration: contract.registration,
  };
}

function deriveInvoice(invoice) {
  return validateInvoice(invoice, sha256(jsonBytes(invoice)));
}

function derivePurchaseOrder(purchaseOrder) {
  return validatePurchaseOrder(
    purchaseOrder,
    sha256(jsonBytes(purchaseOrder)),
  );
}

function deriveReceipt(receipt) {
  return validateReceipt(receipt, sha256(jsonBytes(receipt)));
}

function derivePayment(payment) {
  return validatePayment(payment, sha256(jsonBytes(payment)));
}

function makeInvoiceLeaf({
  invoice,
  scope,
  tag,
  nonceByte,
  policy = RECONCILIATION_POLICY,
}) {
  const derived = deriveInvoice(invoice);
  return issueLeaf({
    name: `invoice-${tag}`,
    scope,
    kind: "invoice",
    claimId: CLAIMS.invoice,
    claimLabel: "The exact captured invoice is internally arithmetically consistent",
    parameters: {
      ...policyParameters(policy),
      buyer_id: invoice.buyer_id,
      supplier_id: invoice.supplier_id,
      invoice_id: invoice.invoice_id,
      po_id: invoice.po_id,
      currency: invoice.currency,
      payment_terms: invoice.payment_terms,
      invoice_digest: derived.invoice_digest,
      line_terms_digest: derived.line_terms_digest,
      quantity_digest: derived.quantity_digest,
      subtotal_minor: invoice.subtotal_minor,
      tax_minor: invoice.tax_minor,
      document_total_minor: invoice.total_minor,
    },
    parameterPointers: {
      ...POLICY_PARAMETER_POINTERS,
      buyer_id: "/documents/invoice/buyer_id",
      supplier_id: "/documents/invoice/supplier_id",
      invoice_id: "/documents/invoice/invoice_id",
      po_id: "/documents/invoice/po_id",
      currency: "/documents/invoice/currency",
      payment_terms: "/documents/invoice/payment_terms",
      invoice_digest: "/derived/invoice_digest",
      line_terms_digest: "/derived/line_terms_digest",
      quantity_digest: "/derived/quantity_digest",
      subtotal_minor: "/documents/invoice/subtotal_minor",
      tax_minor: "/documents/invoice/tax_minor",
      document_total_minor: "/documents/invoice/total_minor",
    },
    recordArtifacts: [artifact("invoice", invoice)],
    requiredAssertions: [
      {
        op: "equals",
        source: "observation",
        pointer: "/derived/arithmetic_consistent",
        value: true,
      },
    ],
    nonceByte,
    policy,
  });
}

function makePurchaseOrderLeaf({
  purchaseOrder,
  scope,
  tag,
  nonceByte,
  policy = RECONCILIATION_POLICY,
}) {
  const derived = derivePurchaseOrder(purchaseOrder);
  return issueLeaf({
    name: `purchase-order-${tag}`,
    scope,
    kind: "purchase_order",
    claimId: CLAIMS.purchaseOrder,
    claimLabel: "The exact captured purchase order is internally arithmetically consistent",
    parameters: {
      ...policyParameters(policy),
      buyer_id: purchaseOrder.buyer_id,
      supplier_id: purchaseOrder.supplier_id,
      po_id: purchaseOrder.po_id,
      currency: purchaseOrder.currency,
      payment_terms: purchaseOrder.payment_terms,
      po_digest: derived.po_digest,
      line_terms_digest: derived.line_terms_digest,
      quantity_digest: derived.quantity_digest,
      document_total_minor: purchaseOrder.total_minor,
    },
    parameterPointers: {
      ...POLICY_PARAMETER_POINTERS,
      buyer_id: "/documents/purchase_order/buyer_id",
      supplier_id: "/documents/purchase_order/supplier_id",
      po_id: "/documents/purchase_order/po_id",
      currency: "/documents/purchase_order/currency",
      payment_terms: "/documents/purchase_order/payment_terms",
      po_digest: "/derived/po_digest",
      line_terms_digest: "/derived/line_terms_digest",
      quantity_digest: "/derived/quantity_digest",
      document_total_minor: "/documents/purchase_order/total_minor",
    },
    recordArtifacts: [artifact("purchase_order", purchaseOrder)],
    requiredAssertions: [
      {
        op: "equals",
        source: "observation",
        pointer: "/derived/arithmetic_consistent",
        value: true,
      },
    ],
    nonceByte,
    policy,
  });
}

function makeReceiptLeaf({
  receipt,
  scope,
  tag,
  nonceByte,
  policy = RECONCILIATION_POLICY,
}) {
  const derived = deriveReceipt(receipt);
  return issueLeaf({
    name: `receipt-${tag}`,
    scope,
    kind: "receipt",
    claimId: CLAIMS.receipt,
    claimLabel: "The exact receipt record and its normalized quantities were captured",
    parameters: {
      ...policyParameters(policy),
      buyer_id: receipt.buyer_id,
      supplier_id: receipt.supplier_id,
      po_id: receipt.po_id,
      receipt_id: receipt.receipt_id,
      receipt_digest: derived.receipt_digest,
      quantity_digest: derived.quantity_digest,
    },
    parameterPointers: {
      ...POLICY_PARAMETER_POINTERS,
      buyer_id: "/documents/receipt/buyer_id",
      supplier_id: "/documents/receipt/supplier_id",
      po_id: "/documents/receipt/po_id",
      receipt_id: "/documents/receipt/receipt_id",
      receipt_digest: "/derived/receipt_digest",
      quantity_digest: "/derived/quantity_digest",
    },
    recordArtifacts: [artifact("receipt", receipt)],
    nonceByte,
    policy,
  });
}

function makePaymentLeaf({
  payment,
  scope,
  tag,
  nonceByte,
  policy = RECONCILIATION_POLICY,
}) {
  const derived = derivePayment(payment);
  return issueLeaf({
    name: `payment-${tag}`,
    scope,
    kind: "payment",
    claimId: CLAIMS.payment,
    claimLabel: "The exact captured payment record has posted status",
    parameters: {
      ...policyParameters(policy),
      buyer_id: payment.buyer_id,
      supplier_id: payment.supplier_id,
      invoice_id: payment.invoice_id,
      payment_id: payment.payment_id,
      currency: payment.currency,
      document_total_minor: payment.amount_minor,
      payment_digest: derived.payment_digest,
    },
    parameterPointers: {
      ...POLICY_PARAMETER_POINTERS,
      buyer_id: "/documents/payment/buyer_id",
      supplier_id: "/documents/payment/supplier_id",
      invoice_id: "/documents/payment/invoice_id",
      payment_id: "/documents/payment/payment_id",
      currency: "/documents/payment/currency",
      document_total_minor: "/documents/payment/amount_minor",
      payment_digest: "/derived/payment_digest",
    },
    recordArtifacts: [artifact("payment", payment)],
    requiredAssertions: [
      {
        op: "equals",
        source: "observation",
        pointer: "/derived/status_is_posted",
        value: true,
      },
    ],
    nonceByte,
    policy,
  });
}

function makeRegisterLeaf({
  register,
  scope,
  supplierId,
  invoiceId,
  tag,
  nonceByte,
  policy = RECONCILIATION_POLICY,
  expectContractRejection = false,
}) {
  return issueLeaf({
    name: `invoice-register-${tag}`,
    scope,
    kind: "invoice_register",
    claimId: CLAIMS.invoiceRegister,
    claimLabel: "The invoice identity occurs once in the exact supplied register",
    parameters: {
      ...policyParameters(policy),
      buyer_id: register.buyer_id,
      supplier_id: supplierId,
      invoice_id: invoiceId,
      register_digest: sha256(jsonBytes(register)),
      occurrence_count: 1,
    },
    parameterPointers: {
      ...POLICY_PARAMETER_POINTERS,
      buyer_id: "/documents/invoice_register/buyer_id",
      supplier_id: "/derived/target_supplier_id",
      invoice_id: "/derived/target_invoice_id",
      register_digest: "/derived/register_digest",
      occurrence_count: "/derived/occurrence_count",
    },
    recordArtifacts: [artifact("invoice_register", register)],
    metadata: {
      target_supplier_id: supplierId,
      target_invoice_id: invoiceId,
    },
    requiredAssertions: [
      {
        op: "equals",
        source: "observation",
        pointer: "/derived/occurrence_count",
        value: 1,
      },
    ],
    nonceByte,
    policy,
    expectContractRejection,
  });
}

function anyParameters(names) {
  return Object.fromEntries(names.map((name) => [name, { op: "any" }]));
}

function projectedParameters(selections) {
  return Object.fromEntries(
    Object.entries(selections).map(([name, premiseIndex]) => [
      name,
      { op: "from_premise", premise_index: premiseIndex, parameter: name },
    ]),
  );
}

function select(names, premiseIndex) {
  return Object.fromEntries(names.map((name) => [name, premiseIndex]));
}

function equalities(names, premiseIndices = [0, 1]) {
  return names.map((parameter) => ({
    members: premiseIndices.map((premiseIndex) => ({
      premise_index: premiseIndex,
      parameter,
    })),
  }));
}

function createRule(definition) {
  return assertOk(
    checked.createRiddleProofCheckedMeaningRule({ definition }),
    definition.rule_id,
  );
}

const INVOICE_PARAMETERS = [
  ...POLICY_PARAMETERS,
  "buyer_id",
  "supplier_id",
  "invoice_id",
  "po_id",
  "currency",
  "payment_terms",
  "invoice_digest",
  "line_terms_digest",
  "quantity_digest",
  "subtotal_minor",
  "tax_minor",
  "document_total_minor",
];
const PO_PARAMETERS = [
  ...POLICY_PARAMETERS,
  "buyer_id",
  "supplier_id",
  "po_id",
  "currency",
  "payment_terms",
  "po_digest",
  "line_terms_digest",
  "quantity_digest",
  "document_total_minor",
];
const RECEIPT_PARAMETERS = [
  ...POLICY_PARAMETERS,
  "buyer_id",
  "supplier_id",
  "po_id",
  "receipt_id",
  "receipt_digest",
  "quantity_digest",
];
const PAYMENT_PARAMETERS = [
  ...POLICY_PARAMETERS,
  "buyer_id",
  "supplier_id",
  "invoice_id",
  "payment_id",
  "currency",
  "document_total_minor",
  "payment_digest",
];
const REGISTER_PARAMETERS = [
  ...POLICY_PARAMETERS,
  "buyer_id",
  "supplier_id",
  "invoice_id",
  "register_digest",
  "occurrence_count",
];
const INVOICE_PO_PARAMETERS = [
  ...INVOICE_PARAMETERS,
  "po_digest",
];
const INVOICE_RECEIPT_PARAMETERS = [
  ...INVOICE_PARAMETERS,
  "receipt_id",
  "receipt_digest",
];
const THREE_RECORD_PARAMETERS = [
  ...INVOICE_PARAMETERS,
  "po_digest",
  "receipt_id",
  "receipt_digest",
];
const INVOICE_PAYMENT_PARAMETERS = [
  ...INVOICE_PARAMETERS,
  "payment_id",
  "payment_digest",
];
const UNIQUE_PARAMETERS = [
  ...INVOICE_PARAMETERS,
  "register_digest",
  "occurrence_count",
];

const invoiceToPoRule = createRule({
  rule_id: CLAIMS.invoiceToPo,
  rule_version: "1",
  label: "Match exact invoice identity and terms to the captured purchase order",
  premises: [
    { claim_id: CLAIMS.invoice, claim_version: "1", parameters: anyParameters(INVOICE_PARAMETERS) },
    { claim_id: CLAIMS.purchaseOrder, claim_version: "1", parameters: anyParameters(PO_PARAMETERS) },
  ],
  conclusion: {
    claim_id: CLAIMS.invoiceToPo,
    claim_version: "1",
    label: "Invoice and purchase order identities, exact line terms, quantities, currency, terms, and total match",
    parameters: projectedParameters({
      ...select(INVOICE_PARAMETERS, 0),
      po_digest: 1,
    }),
  },
  constraints: {
    all_of: true,
    parameter_equalities: equalities([
      ...POLICY_PARAMETERS,
      "buyer_id",
      "supplier_id",
      "po_id",
      "currency",
      "payment_terms",
      "line_terms_digest",
      "quantity_digest",
      "document_total_minor",
    ]),
    ordered_premise_chronology: true,
    max_age_ms: MAX_AGE_MS,
  },
});

const invoiceToReceiptRule = createRule({
  rule_id: CLAIMS.invoiceToReceipt,
  rule_version: "1",
  label: "Match exact invoiced quantities to the captured receipt",
  premises: [
    { claim_id: CLAIMS.invoice, claim_version: "1", parameters: anyParameters(INVOICE_PARAMETERS) },
    { claim_id: CLAIMS.receipt, claim_version: "1", parameters: anyParameters(RECEIPT_PARAMETERS) },
  ],
  conclusion: {
    claim_id: CLAIMS.invoiceToReceipt,
    claim_version: "1",
    label: "Invoice and receipt identities and exact normalized quantities match",
    parameters: projectedParameters({
      ...select(INVOICE_PARAMETERS, 0),
      receipt_id: 1,
      receipt_digest: 1,
    }),
  },
  constraints: {
    all_of: true,
    parameter_equalities: equalities([
      ...POLICY_PARAMETERS,
      "buyer_id",
      "supplier_id",
      "po_id",
      "quantity_digest",
    ]),
    ordered_premise_chronology: true,
    max_age_ms: MAX_AGE_MS,
  },
});

const threeRecordRule = createRule({
  rule_id: CLAIMS.threeRecord,
  rule_version: "1",
  label: "Compose invoice-to-PO and invoice-to-receipt matches",
  premises: [
    { claim_id: CLAIMS.invoiceToPo, claim_version: "1", parameters: anyParameters(INVOICE_PO_PARAMETERS) },
    {
      claim_id: CLAIMS.invoiceToReceipt,
      claim_version: "1",
      parameters: anyParameters(INVOICE_RECEIPT_PARAMETERS),
    },
  ],
  conclusion: {
    claim_id: CLAIMS.threeRecord,
    claim_version: "1",
    label: "The exact invoice matches the exact purchase order and receipt under the strict v1 rule",
    parameters: projectedParameters({
      ...select(INVOICE_PARAMETERS, 0),
      po_digest: 0,
      receipt_id: 1,
      receipt_digest: 1,
    }),
  },
  constraints: {
    all_of: true,
    parameter_equalities: equalities(INVOICE_PARAMETERS),
    ordered_premise_chronology: true,
    max_age_ms: MAX_AGE_MS,
  },
});

const invoiceToPaymentRule = createRule({
  rule_id: CLAIMS.invoiceToPayment,
  rule_version: "1",
  label: "Match exact invoice identity, currency, and amount to a captured payment record",
  premises: [
    { claim_id: CLAIMS.invoice, claim_version: "1", parameters: anyParameters(INVOICE_PARAMETERS) },
    { claim_id: CLAIMS.payment, claim_version: "1", parameters: anyParameters(PAYMENT_PARAMETERS) },
  ],
  conclusion: {
    claim_id: CLAIMS.invoiceToPayment,
    claim_version: "1",
    label: "The captured payment record names the invoice and matches its currency and total",
    parameters: projectedParameters({
      ...select(INVOICE_PARAMETERS, 0),
      payment_id: 1,
      payment_digest: 1,
    }),
  },
  constraints: {
    all_of: true,
    parameter_equalities: equalities([
      ...POLICY_PARAMETERS,
      "buyer_id",
      "supplier_id",
      "invoice_id",
      "currency",
      "document_total_minor",
    ]),
    ordered_premise_chronology: true,
    max_age_ms: MAX_AGE_MS,
  },
});

const invoiceIdentityUniqueRule = createRule({
  rule_id: CLAIMS.invoiceIdentityUnique,
  rule_version: "1",
  label: "Bind invoice identity to its unique occurrence in the exact supplied register",
  premises: [
    { claim_id: CLAIMS.invoice, claim_version: "1", parameters: anyParameters(INVOICE_PARAMETERS) },
    {
      claim_id: CLAIMS.invoiceRegister,
      claim_version: "1",
      parameters: anyParameters(REGISTER_PARAMETERS),
    },
  ],
  conclusion: {
    claim_id: CLAIMS.invoiceIdentityUnique,
    claim_version: "1",
    label: "The invoice identity occurs once in the exact supplied register",
    parameters: projectedParameters({
      ...select(INVOICE_PARAMETERS, 0),
      register_digest: 1,
      occurrence_count: 1,
    }),
  },
  constraints: {
    all_of: true,
    parameter_equalities: equalities([
      ...POLICY_PARAMETERS,
      "buyer_id",
      "supplier_id",
      "invoice_id",
    ]),
    ordered_premise_chronology: true,
    max_age_ms: MAX_AGE_MS,
  },
});

const rootRule = createRule({
  rule_id: CLAIMS.root,
  rule_version: "1",
  label: "Compose unique identity, payment match, and strict three-record match",
  premises: [
    {
      claim_id: CLAIMS.invoiceIdentityUnique,
      claim_version: "1",
      parameters: anyParameters(UNIQUE_PARAMETERS),
    },
    {
      claim_id: CLAIMS.invoiceToPayment,
      claim_version: "1",
      parameters: anyParameters(INVOICE_PAYMENT_PARAMETERS),
    },
    {
      claim_id: CLAIMS.threeRecord,
      claim_version: "1",
      parameters: anyParameters(THREE_RECORD_PARAMETERS),
    },
  ],
  conclusion: {
    claim_id: CLAIMS.root,
    claim_version: "1",
    label: "The exact captured fields agree under the pinned strict synthetic policy",
    parameters: projectedParameters({
      ...select(INVOICE_PARAMETERS, 2),
      po_digest: 2,
      receipt_id: 2,
      receipt_digest: 2,
      payment_id: 1,
      payment_digest: 1,
      register_digest: 0,
      occurrence_count: 0,
    }),
  },
  constraints: {
    all_of: true,
    parameter_equalities: equalities(INVOICE_PARAMETERS, [0, 1, 2]),
    ordered_premise_chronology: true,
    max_age_ms: MAX_AGE_MS,
  },
});

const ruleRegistry = [
  invoiceToPoRule.registration,
  invoiceToReceiptRule.registration,
  threeRecordRule.registration,
  invoiceToPaymentRule.registration,
  invoiceIdentityUniqueRule.registration,
  rootRule.registration,
];
const trustedRules = [
  invoiceToPoRule.rule_ref,
  invoiceToReceiptRule.rule_ref,
  threeRecordRule.rule_ref,
  invoiceToPaymentRule.rule_ref,
  invoiceIdentityUniqueRule.rule_ref,
  rootRule.rule_ref,
];

function replayContexts(...leaves) {
  return leaves.map((leaf) => leaf.replay_context);
}

function clonedReplayContexts(contexts) {
  return contexts.map((context) => {
    const cloned = jsonClone(context);
    cloned.verifier_registry = [VERIFIER_REGISTRATION];
    return cloned;
  });
}

function compose(rule, closures, contexts, issuedAt, label) {
  return assertOk(
    checked.composeRiddleProofCheckedMeaningClosures({
      expected_rule: rule.rule_ref,
      closures,
      issued_at: issuedAt,
      replay_contexts: contexts,
      rule_registry: ruleRegistry,
      trusted_rules: trustedRules,
    }),
    label,
  );
}

function attemptComposition(rule, closures, contexts, issuedAt) {
  return checked.composeRiddleProofCheckedMeaningClosures({
    expected_rule: rule.rule_ref,
    closures,
    issued_at: issuedAt,
    replay_contexts: contexts,
    rule_registry: ruleRegistry,
    trusted_rules: trustedRules,
  });
}

const scope = Object.freeze({
  repository: "synthetic://commercial-record-reconciliation",
  revision: "fixture-set-v1",
  environment: "offline-synthetic-v1",
  target: "reconciliation-case:case-001",
  proof_attempt: "commercial-record-pyramid-1",
});
const alternateScope = Object.freeze({
  ...scope,
  target: "reconciliation-case:other-case",
});

const invoice = Object.freeze({
  schema: "synthetic.invoice.v1",
  buyer_id: "buyer-acme",
  supplier_id: "supplier-lumen",
  invoice_id: "INV-1001",
  po_id: "PO-7001",
  currency: "USD",
  payment_terms: "NET30",
  line_items: [
    {
      line_id: "1",
      sku: "WIDGET-A",
      quantity: 2,
      unit_price_minor: 1_250,
      extended_minor: 2_500,
    },
    {
      line_id: "2",
      sku: "SERVICE-B",
      quantity: 1,
      unit_price_minor: 5_000,
      extended_minor: 5_000,
    },
  ],
  subtotal_minor: 7_500,
  tax_minor: 600,
  total_minor: 8_100,
  memo: "Synthetic baseline invoice",
});

const purchaseOrder = Object.freeze({
  schema: "synthetic.purchase-order.v1",
  buyer_id: "buyer-acme",
  supplier_id: "supplier-lumen",
  po_id: "PO-7001",
  currency: "USD",
  payment_terms: "NET30",
  line_items: [
    {
      line_id: "1",
      sku: "WIDGET-A",
      quantity: 2,
      unit_price_minor: 1_250,
      extended_minor: 2_500,
    },
    {
      line_id: "2",
      sku: "SERVICE-B",
      quantity: 1,
      unit_price_minor: 5_000,
      extended_minor: 5_000,
    },
  ],
  subtotal_minor: 7_500,
  tax_minor: 600,
  total_minor: 8_100,
});

const receipt = Object.freeze({
  schema: "synthetic.receipt.v1",
  buyer_id: "buyer-acme",
  supplier_id: "supplier-lumen",
  receipt_id: "RCPT-9001",
  po_id: "PO-7001",
  received_at: "2026-07-22T18:00:00.000Z",
  line_items: [
    { line_id: "1", sku: "WIDGET-A", quantity: 2 },
    { line_id: "2", sku: "SERVICE-B", quantity: 1 },
  ],
});

const payment = Object.freeze({
  schema: "synthetic.payment-record.v1",
  buyer_id: "buyer-acme",
  supplier_id: "supplier-lumen",
  payment_id: "PAY-3001",
  invoice_id: "INV-1001",
  currency: "USD",
  amount_minor: 8_100,
  status: "posted",
  reference: "Synthetic ledger import A",
});

const invoiceRegister = Object.freeze({
  schema: "synthetic.invoice-register.v1",
  buyer_id: "buyer-acme",
  entries: [
    { supplier_id: "supplier-lumen", invoice_id: "INV-0999" },
    { supplier_id: "supplier-lumen", invoice_id: "INV-1001" },
  ],
});

const invoiceLeaf = makeInvoiceLeaf({
  invoice,
  scope,
  tag: "baseline",
  nonceByte: 1,
});
const poLeaf = makePurchaseOrderLeaf({
  purchaseOrder,
  scope,
  tag: "baseline",
  nonceByte: 2,
});
const receiptLeaf = makeReceiptLeaf({
  receipt,
  scope,
  tag: "baseline",
  nonceByte: 3,
});
const paymentLeaf = makePaymentLeaf({
  payment,
  scope,
  tag: "baseline",
  nonceByte: 4,
});
const registerLeaf = makeRegisterLeaf({
  register: invoiceRegister,
  scope,
  supplierId: invoice.supplier_id,
  invoiceId: invoice.invoice_id,
  tag: "baseline",
  nonceByte: 5,
});

const firstLevelIssuedAt = "2026-07-23T01:00:01.000Z";
const invoiceToPo = compose(
  invoiceToPoRule,
  [invoiceLeaf.checked_closure, poLeaf.checked_closure],
  replayContexts(invoiceLeaf, poLeaf),
  firstLevelIssuedAt,
  "invoice to PO match",
);
const invoiceToReceipt = compose(
  invoiceToReceiptRule,
  [invoiceLeaf.checked_closure, receiptLeaf.checked_closure],
  replayContexts(invoiceLeaf, receiptLeaf),
  firstLevelIssuedAt,
  "invoice to receipt match",
);
const threeRecord = compose(
  threeRecordRule,
  [invoiceToPo.checked_closure, invoiceToReceipt.checked_closure],
  replayContexts(invoiceLeaf, poLeaf, receiptLeaf),
  "2026-07-23T01:00:01.500Z",
  "strict three-record match",
);
const invoiceToPayment = compose(
  invoiceToPaymentRule,
  [invoiceLeaf.checked_closure, paymentLeaf.checked_closure],
  replayContexts(invoiceLeaf, paymentLeaf),
  firstLevelIssuedAt,
  "invoice to payment match",
);
const invoiceIdentityUnique = compose(
  invoiceIdentityUniqueRule,
  [invoiceLeaf.checked_closure, registerLeaf.checked_closure],
  replayContexts(invoiceLeaf, registerLeaf),
  firstLevelIssuedAt,
  "invoice identity uniqueness",
);
const baselineContexts = replayContexts(
  invoiceLeaf,
  poLeaf,
  receiptLeaf,
  paymentLeaf,
  registerLeaf,
);
const baseline = compose(
  rootRule,
  [
    invoiceIdentityUnique.checked_closure,
    invoiceToPayment.checked_closure,
    threeRecord.checked_closure,
  ],
  baselineContexts,
  "2026-07-23T01:00:02.000Z",
  "baseline captured-fields-agree-under-policy root",
);

assert.equal(baseline.certificate.claim.claim_id, CLAIMS.root);
const expectedLineTermsDigest = canonicalDigest([
  { line_id: "1", sku: "WIDGET-A", quantity: 2, unit_price_minor: 1_250 },
  { line_id: "2", sku: "SERVICE-B", quantity: 1, unit_price_minor: 5_000 },
]);
const expectedQuantityDigest = canonicalDigest([
  { line_id: "1", sku: "WIDGET-A", quantity: 2 },
  { line_id: "2", sku: "SERVICE-B", quantity: 1 },
]);
const expectedBaselineRootParameters = {
  policy_id: "synthetic-commercial-record.strict-exact-match",
  policy_version: "1",
  policy_digest: canonicalDigest(POLICY_DEFINITION),
  buyer_id: "buyer-acme",
  supplier_id: "supplier-lumen",
  invoice_id: "INV-1001",
  po_id: "PO-7001",
  currency: "USD",
  payment_terms: "NET30",
  invoice_digest: sha256(jsonBytes(invoice)),
  line_terms_digest: expectedLineTermsDigest,
  quantity_digest: expectedQuantityDigest,
  subtotal_minor: 7_500,
  tax_minor: 600,
  document_total_minor: 8_100,
  po_digest: sha256(jsonBytes(purchaseOrder)),
  receipt_id: "RCPT-9001",
  receipt_digest: sha256(jsonBytes(receipt)),
  payment_id: "PAY-3001",
  payment_digest: sha256(jsonBytes(payment)),
  register_digest: sha256(jsonBytes(invoiceRegister)),
  occurrence_count: 1,
};
assert.deepEqual(
  baseline.certificate.claim.parameters,
  expectedBaselineRootParameters,
  "the baseline root must bind every independently expected identity, policy, amount, and raw record digest",
);
assert.equal(baseline.checked_closure.grounded_closure.groundings.length, 5);
assert.equal(baseline.checked_closure.grounded_closure.closure.certificates.length, 11);
assert.equal(baseline.checked_closure.rule_bindings.length, 6);
for (
  const certificate
  of baseline.checked_closure.grounded_closure.closure.certificates
) {
  assert.deepEqual(
    Object.fromEntries(
      POLICY_PARAMETERS.map((name) => [name, certificate.claim.parameters[name]]),
    ),
    policyParameters(RECONCILIATION_POLICY),
    `certificate ${certificate.certificate_id} must carry the caller-pinned policy identity`,
  );
}
assert.equal(
  baseline.checked_closure.grounded_closure.closure.certificates.filter(
    (certificate) => certificate.certificate_id === invoiceLeaf.certificate.certificate_id,
  ).length,
  1,
  "the invoice leaf must be one shared node, not copied once per branch",
);

const replayed = assertOk(
  checked.matchRiddleProofCheckedMeaningClosure({
    checked_closure: jsonClone(baseline.checked_closure),
    replay_contexts: clonedReplayContexts(baselineContexts),
    rule_registry: jsonClone(ruleRegistry),
    trusted_rules: jsonClone(trustedRules),
    expected_root_certificate_id: baseline.certificate.certificate_id,
    expected_scope: jsonClone(scope),
    expected_claim: jsonClone(baseline.certificate.claim),
    expected_root_rule: jsonClone(rootRule.rule_ref),
  }),
  "serialized deterministic replay",
);
assert.equal(replayed.root_certificate.certificate_id, baseline.certificate.certificate_id);

const explained = assertOk(
  checked.explainRiddleProofCheckedMeaningClosure({
    checked_closure: jsonClone(baseline.checked_closure),
    replay_contexts: clonedReplayContexts(baselineContexts),
    rule_registry: jsonClone(ruleRegistry),
    trusted_rules: jsonClone(trustedRules),
  }),
  "commercial-record DAG explanation",
);
assert.equal(explained.explanation.node_count, 11);
assert.equal(explained.explanation.grounded_leaf_count, 5);
assert.equal(explained.explanation.checked_composition_count, 6);
assert.equal(explained.explanation.grounded_frontier.length, 5);
assert.equal(JSON.stringify(explained.explanation).includes("bytes_base64"), false);

const recomposed = compose(
  rootRule,
  [
    jsonClone(invoiceIdentityUnique.checked_closure),
    jsonClone(invoiceToPayment.checked_closure),
    jsonClone(threeRecord.checked_closure),
  ],
  clonedReplayContexts(baselineContexts),
  "2026-07-23T01:00:02.000Z",
  "exact root recomposition",
);
assert.equal(recomposed.certificate.certificate_id, baseline.certificate.certificate_id);

// Changed single source: different payment-record bytes plus a new capture
// identity change only the payment-dependent composite and root. The exact
// invoice/PO/receipt/register leaves and the three-record/identity composites
// remain the same certificates.
const paymentChanged = {
  ...payment,
  reference: "Synthetic ledger import B",
};
const paymentChangedLeaf = makePaymentLeaf({
  payment: paymentChanged,
  scope,
  tag: "changed-reference",
  nonceByte: 6,
});
const invoiceToPaymentChanged = compose(
  invoiceToPaymentRule,
  [invoiceLeaf.checked_closure, paymentChangedLeaf.checked_closure],
  replayContexts(invoiceLeaf, paymentChangedLeaf),
  firstLevelIssuedAt,
  "changed payment branch",
);
const paymentChangedRoot = compose(
  rootRule,
  [
    invoiceIdentityUnique.checked_closure,
    invoiceToPaymentChanged.checked_closure,
    threeRecord.checked_closure,
  ],
  replayContexts(invoiceLeaf, poLeaf, receiptLeaf, paymentChangedLeaf, registerLeaf),
  "2026-07-23T01:00:02.000Z",
  "payment-record-plus-capture-changed field-agreement root",
);
assert.notEqual(
  paymentChangedLeaf.certificate.certificate_id,
  paymentLeaf.certificate.certificate_id,
);
assert.notEqual(
  invoiceToPaymentChanged.certificate.certificate_id,
  invoiceToPayment.certificate.certificate_id,
);
assert.notEqual(
  paymentChangedRoot.certificate.certificate_id,
  baseline.certificate.certificate_id,
);
assert.deepEqual(
  changedParameterNames(
    baseline.certificate.claim.parameters,
    paymentChangedRoot.certificate.claim.parameters,
  ),
  ["payment_digest"],
  "only the raw payment-record digest may change in the payment variant's root claim",
);
assert.deepEqual(paymentChangedRoot.certificate.claim.parameters, {
  ...expectedBaselineRootParameters,
  payment_digest: sha256(jsonBytes(paymentChanged)),
});
assert.deepEqual(
  paymentChangedRoot.certificate.derivation.premises.map(
    (premise) => premise.certificate_id,
  ),
  [
    invoiceIdentityUnique.certificate.certificate_id,
    invoiceToPaymentChanged.certificate.certificate_id,
    threeRecord.certificate.certificate_id,
  ],
);
const paymentChangedCertificateIds = closureCertificateIds(paymentChangedRoot);
for (const unchangedCertificate of [
  invoiceLeaf.certificate,
  poLeaf.certificate,
  receiptLeaf.certificate,
  registerLeaf.certificate,
  invoiceIdentityUnique.certificate,
  threeRecord.certificate,
]) {
  assert.equal(
    paymentChangedCertificateIds.has(unchangedCertificate.certificate_id),
    true,
    `payment variant must reuse ${unchangedCertificate.certificate_id}`,
  );
}
assert.equal(
  paymentChangedCertificateIds.has(paymentLeaf.certificate.certificate_id),
  false,
  "payment variant must not retain the superseded payment leaf",
);

// Alternate exact invoice snapshot: descriptive bytes plus capture identity
// change while economic terms remain fixed. The PO, receipt, payment, and
// register leaves are reused exactly across the two invoice-snapshot roots.
const invoiceRevised = {
  ...invoice,
  memo: "Synthetic corrected description; economics unchanged",
};
const invoiceRevisedLeaf = makeInvoiceLeaf({
  invoice: invoiceRevised,
  scope,
  tag: "revised-description",
  nonceByte: 7,
});
const invoiceToPoRevised = compose(
  invoiceToPoRule,
  [invoiceRevisedLeaf.checked_closure, poLeaf.checked_closure],
  replayContexts(invoiceRevisedLeaf, poLeaf),
  firstLevelIssuedAt,
  "revised invoice to same PO",
);
const invoiceToReceiptRevised = compose(
  invoiceToReceiptRule,
  [invoiceRevisedLeaf.checked_closure, receiptLeaf.checked_closure],
  replayContexts(invoiceRevisedLeaf, receiptLeaf),
  firstLevelIssuedAt,
  "revised invoice to same receipt",
);
const threeRecordRevised = compose(
  threeRecordRule,
  [invoiceToPoRevised.checked_closure, invoiceToReceiptRevised.checked_closure],
  replayContexts(invoiceRevisedLeaf, poLeaf, receiptLeaf),
  "2026-07-23T01:00:01.500Z",
  "revised invoice three-record match",
);
const invoiceToPaymentRevised = compose(
  invoiceToPaymentRule,
  [invoiceRevisedLeaf.checked_closure, paymentLeaf.checked_closure],
  replayContexts(invoiceRevisedLeaf, paymentLeaf),
  firstLevelIssuedAt,
  "revised invoice payment match",
);
const invoiceIdentityUniqueRevised = compose(
  invoiceIdentityUniqueRule,
  [invoiceRevisedLeaf.checked_closure, registerLeaf.checked_closure],
  replayContexts(invoiceRevisedLeaf, registerLeaf),
  firstLevelIssuedAt,
  "revised invoice identity uniqueness",
);
const revisedInvoiceRoot = compose(
  rootRule,
  [
    invoiceIdentityUniqueRevised.checked_closure,
    invoiceToPaymentRevised.checked_closure,
    threeRecordRevised.checked_closure,
  ],
  replayContexts(invoiceRevisedLeaf, poLeaf, receiptLeaf, paymentLeaf, registerLeaf),
  "2026-07-23T01:00:02.000Z",
  "invoice-record-plus-capture-changed field-agreement root",
);
assert.notEqual(
  invoiceRevisedLeaf.certificate.certificate_id,
  invoiceLeaf.certificate.certificate_id,
);
assert.notEqual(revisedInvoiceRoot.certificate.certificate_id, baseline.certificate.certificate_id);
assert.deepEqual(
  changedParameterNames(
    baseline.certificate.claim.parameters,
    revisedInvoiceRoot.certificate.claim.parameters,
  ),
  ["invoice_digest"],
  "only the raw invoice-record digest may change in the invoice variant's root claim",
);
assert.deepEqual(revisedInvoiceRoot.certificate.claim.parameters, {
  ...expectedBaselineRootParameters,
  invoice_digest: sha256(jsonBytes(invoiceRevised)),
});
assert.equal(
  invoiceToPoRevised.certificate.derivation.premises[1].certificate_id,
  poLeaf.certificate.certificate_id,
);
assert.equal(
  revisedInvoiceRoot.checked_closure.grounded_closure.closure.certificates.filter(
    (certificate) => certificate.certificate_id === poLeaf.certificate.certificate_id,
  ).length,
  1,
);
const revisedInvoiceCertificateIds = closureCertificateIds(revisedInvoiceRoot);
for (const unchangedLeaf of [
  poLeaf.certificate,
  receiptLeaf.certificate,
  paymentLeaf.certificate,
  registerLeaf.certificate,
]) {
  assert.equal(
    revisedInvoiceCertificateIds.has(unchangedLeaf.certificate_id),
    true,
    `invoice variant must reuse leaf ${unchangedLeaf.certificate_id}`,
  );
}
assert.equal(
  revisedInvoiceCertificateIds.has(invoiceLeaf.certificate.certificate_id),
  false,
  "invoice variant must not retain the superseded invoice leaf",
);

// Hostile case: same total, separately signed PO, wrong SKU.
const wrongSkuPo = {
  ...purchaseOrder,
  line_items: [
    { ...purchaseOrder.line_items[0], sku: "WIDGET-WRONG" },
    purchaseOrder.line_items[1],
  ],
};
const wrongSkuPoLeaf = makePurchaseOrderLeaf({
  purchaseOrder: wrongSkuPo,
  scope,
  tag: "same-total-wrong-sku",
  nonceByte: 8,
});
const wrongSkuMatch = attemptComposition(
  invoiceToPoRule,
  [invoiceLeaf.checked_closure, wrongSkuPoLeaf.checked_closure],
  replayContexts(invoiceLeaf, wrongSkuPoLeaf),
  firstLevelIssuedAt,
);
assertFailure(
  wrongSkuMatch,
  "parameter_mismatch",
  "same total with wrong SKU",
);

// Hostile case: separately signed payment amount matches but currency differs.
const wrongCurrencyPayment = { ...payment, currency: "EUR" };
const wrongCurrencyPaymentLeaf = makePaymentLeaf({
  payment: wrongCurrencyPayment,
  scope,
  tag: "wrong-currency",
  nonceByte: 9,
});
const wrongCurrencyMatch = attemptComposition(
  invoiceToPaymentRule,
  [invoiceLeaf.checked_closure, wrongCurrencyPaymentLeaf.checked_closure],
  replayContexts(invoiceLeaf, wrongCurrencyPaymentLeaf),
  firstLevelIssuedAt,
);
assertFailure(wrongCurrencyMatch, "parameter_mismatch", "currency mismatch");

// Hostile case: a partial receipt is valid as a record but cannot support the
// exact-quantity v1 invoice-to-receipt conclusion.
const partialReceipt = {
  ...receipt,
  line_items: [
    { ...receipt.line_items[0], quantity: 1 },
    receipt.line_items[1],
  ],
};
const partialReceiptLeaf = makeReceiptLeaf({
  receipt: partialReceipt,
  scope,
  tag: "partial",
  nonceByte: 10,
});
const partialReceiptMatch = attemptComposition(
  invoiceToReceiptRule,
  [invoiceLeaf.checked_closure, partialReceiptLeaf.checked_closure],
  replayContexts(invoiceLeaf, partialReceiptLeaf),
  firstLevelIssuedAt,
);
assertFailure(
  partialReceiptMatch,
  "parameter_mismatch",
  "partial receipt against exact invoiced quantities",
);

// Hostile case: an over-invoice is internally consistent, but its changed
// quantity, line extension, subtotal, tax, and total do not match the PO.
const overInvoice = {
  ...invoice,
  line_items: [
    {
      ...invoice.line_items[0],
      quantity: 3,
      extended_minor: 3_750,
    },
    invoice.line_items[1],
  ],
  subtotal_minor: 8_750,
  tax_minor: 700,
  total_minor: 9_450,
  memo: "Synthetic internally consistent over-invoice",
};
const overInvoiceLeaf = makeInvoiceLeaf({
  invoice: overInvoice,
  scope,
  tag: "over-invoice",
  nonceByte: 11,
});
const overInvoiceMatch = attemptComposition(
  invoiceToPoRule,
  [overInvoiceLeaf.checked_closure, poLeaf.checked_closure],
  replayContexts(overInvoiceLeaf, poLeaf),
  firstLevelIssuedAt,
);
assertFailure(overInvoiceMatch, "parameter_mismatch", "over-invoice against PO");

// Hostile case: duplicate invoice identity prevents even the grounded
// uniqueness leaf from being issued.
const duplicateRegister = {
  ...invoiceRegister,
  entries: [
    ...invoiceRegister.entries,
    { supplier_id: invoice.supplier_id, invoice_id: invoice.invoice_id },
  ],
};
const duplicateRegisterAttempt = makeRegisterLeaf({
  register: duplicateRegister,
  scope,
  supplierId: invoice.supplier_id,
  invoiceId: invoice.invoice_id,
  tag: "duplicate",
  nonceByte: 12,
  expectContractRejection: true,
});
assert.equal(duplicateRegisterAttempt.rejected, true);

// Hostile case: a correctly signed and internally valid receipt from another
// reconciliation scope cannot substitute for this case's receipt.
const otherScopeReceiptLeaf = makeReceiptLeaf({
  receipt,
  scope: alternateScope,
  tag: "other-scope",
  nonceByte: 13,
});
const wrongScopeMatch = attemptComposition(
  invoiceToReceiptRule,
  [invoiceLeaf.checked_closure, otherScopeReceiptLeaf.checked_closure],
  replayContexts(invoiceLeaf, otherScopeReceiptLeaf),
  firstLevelIssuedAt,
);
assertErrorPath(
  wrongScopeMatch,
  [
    "grounded_composition_failed",
    "semantic_composition_failed",
    "scope_mismatch",
  ],
  "signed record from another scope",
);

// Hostile case: a signed receipt for a different supplier cannot substitute,
// even though its PO, SKUs, and quantities otherwise match.
const wrongSupplierReceipt = { ...receipt, supplier_id: "supplier-other" };
const wrongSupplierReceiptLeaf = makeReceiptLeaf({
  receipt: wrongSupplierReceipt,
  scope,
  tag: "wrong-supplier",
  nonceByte: 14,
});
const wrongSupplierMatch = attemptComposition(
  invoiceToReceiptRule,
  [invoiceLeaf.checked_closure, wrongSupplierReceiptLeaf.checked_closure],
  replayContexts(invoiceLeaf, wrongSupplierReceiptLeaf),
  firstLevelIssuedAt,
);
assertFailure(
  wrongSupplierMatch,
  "parameter_mismatch",
  "signed wrong-supplier receipt",
);

// Hostile caller theory substitution: nominal policy ID/version are not
// authority. A changed full descriptor has a different digest, and its valid
// signed leaf cannot compose with leaves under the caller-pinned baseline
// policy.
const changedPolicyDefinition = jsonClone(POLICY_DEFINITION);
changedPolicyDefinition.rules.invoice_to_receipt = [
  "buyer",
  "supplier",
  "purchase-order identity",
  "SKU",
  "quantity at or below invoiced quantity",
];
const changedPolicy = Object.freeze({
  policy_id: changedPolicyDefinition.policy_id,
  policy_version: changedPolicyDefinition.policy_version,
  policy_digest: canonicalDigest(changedPolicyDefinition),
});
assert.equal(changedPolicy.policy_id, RECONCILIATION_POLICY.policy_id);
assert.equal(changedPolicy.policy_version, RECONCILIATION_POLICY.policy_version);
assert.notEqual(changedPolicy.policy_digest, RECONCILIATION_POLICY.policy_digest);
const changedPolicyReceiptLeaf = makeReceiptLeaf({
  receipt,
  scope,
  tag: "changed-policy",
  nonceByte: 15,
  policy: changedPolicy,
});
const changedPolicyMatch = attemptComposition(
  invoiceToReceiptRule,
  [invoiceLeaf.checked_closure, changedPolicyReceiptLeaf.checked_closure],
  replayContexts(invoiceLeaf, changedPolicyReceiptLeaf),
  firstLevelIssuedAt,
);
assertFailure(
  changedPolicyMatch,
  "parameter_mismatch",
  "same-ID and version changed-policy substitution",
);

// Hostile caller rule roots: a permissive same-ID/version registration cannot
// replace the independently trusted exact definition, and omitting the exact
// root from the caller allowlist fails closed.
const permissiveRootDefinition = jsonClone(rootRule.registration.definition);
permissiveRootDefinition.label = "Permissive substituted root rule";
permissiveRootDefinition.constraints.parameter_equalities = equalities(
  POLICY_PARAMETERS,
  [0, 1, 2],
);
const permissiveRootRule = assertOk(
  checked.createRiddleProofCheckedMeaningRule({
    definition: permissiveRootDefinition,
  }),
  "permissive same-ID root rule",
);
assert.equal(permissiveRootRule.rule_ref.rule_id, rootRule.rule_ref.rule_id);
assert.equal(permissiveRootRule.rule_ref.rule_version, rootRule.rule_ref.rule_version);
assert.notEqual(
  permissiveRootRule.rule_ref.implementation_digest,
  rootRule.rule_ref.implementation_digest,
);
const permissiveRegistrationReplay = checked.explainRiddleProofCheckedMeaningClosure({
  checked_closure: jsonClone(baseline.checked_closure),
  replay_contexts: clonedReplayContexts(baselineContexts),
  rule_registry: ruleRegistry.map((registration) =>
    registration.rule_id === rootRule.rule_ref.rule_id
      ? jsonClone(permissiveRootRule.registration)
      : jsonClone(registration)),
  trusted_rules: jsonClone(trustedRules),
});
assertFailure(
  permissiveRegistrationReplay,
  "rule_digest_mismatch",
  "permissive same-ID rule registration",
);

const missingTrustedRootReplay = checked.explainRiddleProofCheckedMeaningClosure({
  checked_closure: jsonClone(baseline.checked_closure),
  replay_contexts: clonedReplayContexts(baselineContexts),
  rule_registry: jsonClone(ruleRegistry),
  trusted_rules: trustedRules
    .filter((rule) => rule.rule_id !== rootRule.rule_ref.rule_id)
    .map(jsonClone),
});
assertFailure(
  missingTrustedRootReplay,
  "rule_not_trusted",
  "missing caller-trusted root rule",
);

// Hostile grounded-contract roots: a permissive same-ID/version registration
// cannot satisfy the independently expected original digest. Substituting both
// registration and expected ref still conflicts with the receipt-bound
// original contract.
const permissiveInvoiceContractDefinition = jsonClone(
  invoiceLeaf.contract_definition,
);
permissiveInvoiceContractDefinition.label = "Permissive substituted invoice contract";
permissiveInvoiceContractDefinition.program.all =
  permissiveInvoiceContractDefinition.program.all.slice(0, 7);
const permissiveInvoiceContract = assertOk(
  grounded.createRiddleProofGroundedDeclarativeJsonContract(
    permissiveInvoiceContractDefinition,
  ),
  "permissive same-ID invoice contract",
);
assert.equal(
  permissiveInvoiceContract.contract_ref.contract_id,
  invoiceLeaf.contract_ref.contract_id,
);
assert.equal(
  permissiveInvoiceContract.contract_ref.contract_version,
  invoiceLeaf.contract_ref.contract_version,
);
assert.notEqual(
  permissiveInvoiceContract.contract_ref.implementation_digest,
  invoiceLeaf.contract_ref.implementation_digest,
);
const originalInvoiceGrounding =
  invoiceLeaf.checked_closure.grounded_closure.groundings[0];
const invoiceReplayContext = clonedReplayContexts([
  invoiceLeaf.replay_context,
])[0];
const {
  certificate_id: ignoredInvoiceCertificateId,
  ...invoiceReplayConfiguration
} = invoiceReplayContext;
assert.equal(ignoredInvoiceCertificateId, invoiceLeaf.certificate.certificate_id);

const substitutedContractRegistrationReplay =
  grounded.replayRiddleProofGroundedSemanticCertificate({
    grounding: jsonClone(originalInvoiceGrounding),
    configuration: {
      ...invoiceReplayConfiguration,
      contract_registry: [jsonClone(permissiveInvoiceContract.registration)],
    },
  });
assertFailure(
  substitutedContractRegistrationReplay,
  "contract_not_registered",
  "substituted grounded contract registration",
);

const substitutedContractRefReplay =
  grounded.replayRiddleProofGroundedSemanticCertificate({
    grounding: jsonClone(originalInvoiceGrounding),
    configuration: {
      ...invoiceReplayConfiguration,
      contract_registry: [jsonClone(permissiveInvoiceContract.registration)],
      expected_contract: jsonClone(permissiveInvoiceContract.contract_ref),
    },
  });
assertFailure(
  substitutedContractRefReplay,
  "receipt_mismatch",
  "substituted grounded contract registration and expected ref",
);

// Inline record bytes and provenance signatures remain protected. The byte
// edit preserves decoded length, so rejection is specifically digest
// integrity—not a length shortcut.
const byteTamperedClosure = jsonClone(baseline.checked_closure);
const invoiceGrounding = byteTamperedClosure.grounded_closure.groundings.find(
  (grounding) => grounding.certificate_id === invoiceLeaf.certificate.certificate_id,
);
const invoiceInline = invoiceGrounding.bundle.inline_artifacts.find(
  (entry) => entry.artifact_id.endsWith("/invoice"),
);
const originalInvoiceBytes = Buffer.from(invoiceInline.bytes_base64, "base64");
const sameLengthTamperedInvoiceBytes = Buffer.from(originalInvoiceBytes);
sameLengthTamperedInvoiceBytes[sameLengthTamperedInvoiceBytes.length - 2] ^= 1;
assert.equal(
  sameLengthTamperedInvoiceBytes.byteLength,
  originalInvoiceBytes.byteLength,
);
invoiceInline.bytes_base64 = sameLengthTamperedInvoiceBytes.toString("base64");
const byteTamperedCaptureVerification =
  grounded.verifyRiddleProofSignedCaptureBundle({
    bundle: invoiceGrounding.bundle,
    policy: invoiceReplayConfiguration.policy,
    trusted_signers: invoiceReplayConfiguration.trusted_signers,
    verifier_registry: [VERIFIER_REGISTRATION],
  });
const byteTamperError = assertFailure(
  byteTamperedCaptureVerification,
  "invalid_bundle",
  "same-length changed signed invoice bytes",
);
assert.match(byteTamperError.message, /digest does not match/u);
assert.doesNotMatch(byteTamperError.message, /byte length/u);
const byteTamperedReplay = checked.explainRiddleProofCheckedMeaningClosure({
  checked_closure: byteTamperedClosure,
  replay_contexts: clonedReplayContexts(baselineContexts),
  rule_registry: jsonClone(ruleRegistry),
  trusted_rules: jsonClone(trustedRules),
});
const byteReplayError = assertErrorPath(
  byteTamperedReplay,
  ["grounded_validation_failed", "invalid_input"],
  "same-length byte-tampered complete closure replay",
);
assert.match(byteReplayError.cause.message, /digest does not match/u);
assert.doesNotMatch(byteReplayError.cause.message, /byte length/u);

const signatureTamperedClosure = jsonClone(baseline.checked_closure);
const paymentGrounding = signatureTamperedClosure.grounded_closure.groundings.find(
  (grounding) => grounding.certificate_id === paymentLeaf.certificate.certificate_id,
);
paymentGrounding.bundle.provenance.signature_base64 = Buffer.alloc(64, 0).toString("base64");
const paymentReplayContext = clonedReplayContexts([
  paymentLeaf.replay_context,
])[0];
const signatureTamperedCaptureVerification =
  grounded.verifyRiddleProofSignedCaptureBundle({
    bundle: paymentGrounding.bundle,
    policy: paymentReplayContext.policy,
    trusted_signers: paymentReplayContext.trusted_signers,
    verifier_registry: [VERIFIER_REGISTRATION],
  });
assertFailure(
  signatureTamperedCaptureVerification,
  "signature_invalid",
  "changed capture signature",
);
const signatureTamperedReplay = checked.explainRiddleProofCheckedMeaningClosure({
  checked_closure: signatureTamperedClosure,
  replay_contexts: clonedReplayContexts(baselineContexts),
  rule_registry: jsonClone(ruleRegistry),
  trusted_rules: jsonClone(trustedRules),
});
assertErrorPath(
  signatureTamperedReplay,
  ["grounded_validation_failed", "signature_invalid", "signature_invalid"],
  "signature-tampered complete closure replay",
);

console.log(JSON.stringify({
  ok: true,
  experiment: "semantic-compaction.commercial-record-reconciliation",
  baseline_root_certificate_id: baseline.certificate.certificate_id,
  three_record_certificate_id: threeRecord.certificate.certificate_id,
  invoice_identity_certificate_id: invoiceIdentityUnique.certificate.certificate_id,
  policy_digest: RECONCILIATION_POLICY.policy_digest,
  verifier_implementation_digest: VERIFIER_REF.implementation_digest,
  collector_implementation_digest: COLLECTOR.implementation_digest,
  root_boundary: "Exact captured fields agree under the caller-pinned strict synthetic policy; this does not establish authorization, validity, completeness outside the supplied register, fraud absence, approval to pay, or actual movement of money.",
  dag_nodes: explained.explanation.node_count,
  grounded_frontier: explained.explanation.grounded_leaf_count,
  exact_recomposition_deterministic: true,
  changed_payment_record_and_capture_selectively_reuse_three_record_and_identity_branches: true,
  same_po_reused_across_two_invoice_snapshot_roots: true,
  same_total_wrong_sku_rejected: true,
  currency_mismatch_rejected: true,
  partial_receipt_rejected: true,
  over_invoice_rejected: true,
  duplicate_invoice_identity_rejected: true,
  wrong_scope_signed_record_rejected: true,
  wrong_supplier_signed_record_rejected: true,
  changed_policy_substitution_rejected: true,
  permissive_rule_and_missing_trust_root_rejected: true,
  substituted_grounded_contract_registration_and_ref_rejected: true,
  hostile_byte_and_signature_tampering_rejected: true,
}));
