import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
  verify,
} from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  assessRiddleProofCheckedMeaningClosure,
  createRiddleProofSignedCaptureBundle,
  explainRiddleProofCheckedMeaningClosure,
  type RiddleProofSignedCaptureBundle,
} from "@riddledc/riddle-proof-core";
import {
  createRiddleProofBrowserSealedProof,
  createRiddleProofBrowserSealedProtocol,
  replayRiddleProofBrowserSealedProof,
  runProfileLocal,
  type RiddleProofBrowserSealedProtocol,
  type RunProfileLocalResult,
} from "@riddledc/riddle-proof-runner-playwright";
import {
  assertApplicationVerification,
  type ApplicationCurrentness,
  type ApplicationVerification,
} from "riddle-proof-application-projection-experiment";

import {
  assertResolvedCtaCandidate,
  createResolvedCtaCandidate,
  ctaAuthorityRef,
  deriveCtaAttemptAuthority,
} from "./authority.js";
import {
  assertPinnedCtaChangeContract,
  createPinnedCtaChangeContract,
} from "./contract.js";
import {
  CTA_REQUIREMENT_IDS,
  type CtaAttemptAuthority,
  type CtaReportProviderInput,
  type CtaRequirementId,
  type CtaRequirementStatus,
  type LocalCtaBrowserReportAttempt,
  type LocalCtaReportProviderConfiguration,
  type ResolvedCtaCandidate,
} from "./types.js";
import {
  assessCtaStatusReport,
  createCtaStatusReport,
  type CtaStatusReport,
  type CtaStatusReportAuthority,
} from "./status-report.js";

const DEFAULT_MAX_CAPTURE_AGE_MS = 5 * 60 * 1000;
const DEFAULT_MAX_GROUNDED_AGE_MS = 5 * 60 * 1000;
const DEFAULT_MAX_CAPTURE_FUTURE_SKEW_MS = 1_000;
const DEFAULT_MAX_ASSESSMENT_FUTURE_SKEW_MS = 0;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;

function nonempty(value: unknown, context: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${context} must be a non-empty string.`);
  }
  return value;
}

function fullDigest(value: unknown, context: string): string {
  const checked = nonempty(value, context);
  if (!SHA256.test(checked)) {
    throw new TypeError(`${context} must be a full lowercase sha256 digest.`);
  }
  return checked;
}

function positiveInteger(
  value: unknown,
  fallback: number,
  context: string,
  allowZero = false,
): number {
  if (value === undefined) return fallback;
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < (allowZero ? 0 : 1)
  ) {
    throw new TypeError(`${context} must be a safe positive integer.`);
  }
  return value;
}

function plusMilliseconds(timestamp: string, amount: number): string {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`Invalid browser capture time: ${timestamp}.`);
  }
  return new Date(parsed + amount).toISOString();
}

function sha256(value: Uint8Array | string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function resultError(context: string, value: unknown): Error {
  const message = (
    value
    && typeof value === "object"
    && "error" in value
    && value.error
    && typeof value.error === "object"
    && "message" in value.error
  )
    ? value.error.message
    : undefined;
  return new Error(
    typeof message === "string" ? `${context}: ${message}` : `${context} failed.`,
  );
}

function privateDirectory(directory: string, context: string): string {
  const requested = path.resolve(nonempty(directory, context));
  if (!existsSync(requested)) {
    throw new TypeError(`${context} must already exist.`);
  }
  const stats = lstatSync(requested);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new TypeError(`${context} must be a real directory.`);
  }
  const resolved = realpathSync(requested);
  const mode = lstatSync(resolved).mode & 0o777;
  if ((mode & 0o077) !== 0) {
    throw new TypeError(`${context} must not grant group or other access.`);
  }
  if (
    typeof process.getuid === "function"
    && lstatSync(resolved).uid !== process.getuid()
  ) {
    throw new TypeError(
      `${context} must be owned by the current user.`,
    );
  }
  return resolved;
}

function sealArtifactTree(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(
        "CTA browser artifacts must not contain symbolic links.",
      );
    }
    if (entry.isDirectory()) {
      sealArtifactTree(child);
      chmodSync(child, 0o700);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(
        "CTA browser artifacts must contain only files and directories.",
      );
    }
    chmodSync(child, 0o600);
  }
  chmodSync(directory, 0o700);
}

function portableLocalRunOutput(
  output: RunProfileLocalResult,
  expectedDirectory: string,
): RunProfileLocalResult {
  if (
    output.outputDir !== expectedDirectory
    || output.observationPath
      !== path.join(expectedDirectory, "observation-receipt.json")
    || output.manifestPath
      !== path.join(expectedDirectory, "artifact-manifest.json")
  ) {
    throw new Error(
      "The CTA browser runner returned paths outside its exact attempt directory.",
    );
  }
  const observation = {
    ...output.observation,
    publication: {
      kind: "local" as const,
      path: ".",
    },
  };
  const serializedObservation =
    `${JSON.stringify(observation, null, 2)}\n`;
  writeFileSync(output.observationPath, serializedObservation, {
    encoding: "utf8",
    mode: 0o600,
  });

  const manifest = JSON.parse(
    readFileSync(output.manifestPath, "utf8"),
  ) as {
    artifacts?: {
      path?: unknown;
      bytes?: unknown;
    }[];
  };
  if (!Array.isArray(manifest.artifacts)) {
    throw new Error(
      "The CTA browser artifact manifest is invalid.",
    );
  }
  const receiptEntry = manifest.artifacts.find(
    (artifact) =>
      artifact.path === "observation-receipt.json",
  );
  if (!receiptEntry) {
    throw new Error(
      "The CTA browser artifact manifest omitted its observation receipt.",
    );
  }
  receiptEntry.bytes = Buffer.byteLength(serializedObservation);
  writeFileSync(
    output.manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );
  sealArtifactTree(expectedDirectory);
  return {
    ...output,
    observation,
  };
}

function persistBoundCaptureBundle(input: {
  output: RunProfileLocalResult;
  bundle: RiddleProofSignedCaptureBundle;
  expected_directory: string;
}): void {
  const expectedPath = path.join(
    input.expected_directory,
    "grounded-capture-bundle.json",
  );
  if (input.output.groundedCapturePath !== expectedPath) {
    throw new Error(
      "The CTA browser runner did not expose its capture bundle at the exact attempt path.",
    );
  }
  writeFileSync(
    expectedPath,
    `${JSON.stringify(input.bundle, null, 2)}\n`,
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );
  sealArtifactTree(input.expected_directory);
}

function checkedConfiguration(
  value: LocalCtaReportProviderConfiguration,
) {
  if (!value || typeof value !== "object") {
    throw new TypeError("Local CTA browser provider configuration is required.");
  }
  const artifactsDirectory = privateDirectory(
    value.artifacts_directory,
    "artifacts_directory",
  );
  const keyId = nonempty(value.signing_key?.key_id, "signing_key.key_id");
  const privateKeyBase64 = nonempty(
    value.signing_key?.private_key_pkcs8_base64,
    "signing_key.private_key_pkcs8_base64",
  );
  const publicKeyBase64 = nonempty(
    value.signing_key?.public_key_spki_base64,
    "signing_key.public_key_spki_base64",
  );
  const privateKeyBytes = Buffer.from(privateKeyBase64, "base64");
  const publicKeyBytes = Buffer.from(publicKeyBase64, "base64");
  const privateKey = createPrivateKey({
    key: privateKeyBytes,
    format: "der",
    type: "pkcs8",
  });
  const publicKey = createPublicKey({
    key: publicKeyBytes,
    format: "der",
    type: "spki",
  });
  const challenge = Buffer.from(
    "riddle-proof.cta-browser-provider.key-check.v1\0",
    "utf8",
  );
  if (
    privateKey.asymmetricKeyType !== "ed25519"
    || publicKey.asymmetricKeyType !== "ed25519"
    || !verify(
      null,
      challenge,
      publicKey,
      sign(null, challenge, privateKey),
    )
  ) {
    throw new TypeError("signing_key must be one matching Ed25519 key pair.");
  }
  if (!value.collector || typeof value.collector !== "object") {
    throw new TypeError("collector is required.");
  }
  const collector = {
    collector_id: nonempty(
      value.collector.collector_id,
      "collector.collector_id",
    ),
    collector_version: nonempty(
      value.collector.collector_version,
      "collector.collector_version",
    ),
    implementation_digest: fullDigest(
      value.collector.implementation_digest,
      "collector.implementation_digest",
    ),
  };
  if (typeof value.source_for !== "function") {
    throw new TypeError("source_for must be a function.");
  }
  for (const [name, capability] of [
    ["extra_http_headers_for", value.extra_http_headers_for],
    ["timeout_seconds_for", value.timeout_seconds_for],
    ["consumption_time_for", value.consumption_time_for],
    ["on_attempt", value.on_attempt],
  ] as const) {
    if (capability !== undefined && typeof capability !== "function") {
      throw new TypeError(`${name} must be a function.`);
    }
  }
  return {
    artifacts_directory: artifactsDirectory,
    signing_key: {
      key_id: keyId,
      private_key_pkcs8_base64: privateKeyBase64,
      public_key_spki_base64: publicKeyBase64,
      public_key_bytes: publicKeyBytes,
    },
    collector,
    source_for: value.source_for,
    extra_http_headers_for: value.extra_http_headers_for,
    timeout_seconds_for: value.timeout_seconds_for,
    consumption_time_for: value.consumption_time_for,
    on_attempt: value.on_attempt,
    max_capture_age_ms: positiveInteger(
      value.max_capture_age_ms,
      DEFAULT_MAX_CAPTURE_AGE_MS,
      "max_capture_age_ms",
    ),
    max_grounded_age_ms: positiveInteger(
      value.max_grounded_age_ms,
      DEFAULT_MAX_GROUNDED_AGE_MS,
      "max_grounded_age_ms",
    ),
    max_capture_future_skew_ms: positiveInteger(
      value.max_capture_future_skew_ms,
      DEFAULT_MAX_CAPTURE_FUTURE_SKEW_MS,
      "max_capture_future_skew_ms",
      true,
    ),
    max_assessment_future_skew_ms: positiveInteger(
      value.max_assessment_future_skew_ms,
      DEFAULT_MAX_ASSESSMENT_FUTURE_SKEW_MS,
      "max_assessment_future_skew_ms",
      true,
    ),
  };
}

function checkedProviderInput(value: unknown): {
  candidate: ResolvedCtaCandidate;
  authority: CtaAttemptAuthority;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Local CTA browser provider input must be an object.");
  }
  const expectedKeys = ["contract", "candidate", "authority"] as const;
  const actualKeys = Reflect.ownKeys(value);
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((key) => typeof key !== "string")
    || expectedKeys.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new TypeError(
      "Local CTA browser provider input accepts exactly contract, candidate, and authority.",
    );
  }
  const unsafe = value as CtaReportProviderInput;
  assertPinnedCtaChangeContract(unsafe.contract);
  const contract = createPinnedCtaChangeContract();
  assertResolvedCtaCandidate({
    contract,
    candidate_ref: unsafe.candidate.candidate_ref,
    candidate: unsafe.candidate,
  });
  const candidate = createResolvedCtaCandidate({
    contract,
    candidate_ref: unsafe.candidate.candidate_ref,
    scope: {
      repository: unsafe.candidate.scope.repository,
      revision: unsafe.candidate.scope.revision,
      environment: unsafe.candidate.scope.environment,
      target: unsafe.candidate.scope.target,
    },
  });
  const authority = deriveCtaAttemptAuthority({ contract, candidate });
  if (!isDeepStrictEqual(unsafe.authority, authority)) {
    throw new TypeError(
      "Local CTA browser provider authority must be derived from the exact pinned contract and candidate.",
    );
  }
  return { candidate, authority };
}

type Assessment = ReturnType<typeof assessRiddleProofCheckedMeaningClosure>;

function currentness(
  assessment: Assessment,
  expectedRootId: string,
): ApplicationCurrentness {
  if (
    assessment.disposition !== "unresolved"
    && assessment.root_certificate.certificate_id !== expectedRootId
  ) {
    return {
      status: "unresolved",
      diagnostic_code: "assessment_root_mismatch",
    };
  }
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
      stale_certificate_ids: [...assessment.stale_certificate_ids],
    };
  }
  return {
    status: "unresolved",
    diagnostic_code: assessment.error.code,
  };
}

type Explanation = Extract<
  ReturnType<typeof explainRiddleProofCheckedMeaningClosure>,
  { ok: true }
>["explanation"];

function portableExplanation(explanation: Explanation) {
  return {
    root_certificate_id: explanation.root_certificate_id,
    node_count: explanation.node_count,
    grounded_leaf_count: explanation.grounded_leaf_count,
    checked_composition_count: explanation.checked_composition_count,
    node_certificate_ids: explanation.nodes
      .map(({ certificate_id }) => certificate_id)
      .sort(),
    grounded_frontier: explanation.grounded_frontier.map((entry) => ({
      certificate_id: entry.certificate_id,
      bundle_id: entry.bundle_id,
      receipt_id: entry.receipt_id,
      statement_digest: entry.statement_digest,
      artifact_manifest_digest: entry.artifact_manifest_digest,
      observation_digest: entry.observation_digest,
      captured_at: entry.captured_at,
    })),
  };
}

function verificationFromReport(input: {
  authority: CtaAttemptAuthority;
  candidate: ResolvedCtaCandidate;
  report: CtaStatusReport;
  assessment: Assessment;
  replayed_at: string;
}): ApplicationVerification {
  const root = input.report.root_certificate;
  return {
    version: "riddle-proof.application-verification.v1",
    verification_kind: "checked_meaning_replay",
    status: "verified",
    proof_id: root.certificate_id,
    authority: ctaAuthorityRef(input.authority),
    spec: input.authority.specification.ref,
    subject: input.candidate.subject,
    replayed_at: input.replayed_at,
    proof_root: {
      root_certificate_id: root.certificate_id,
      claim: {
        claim_id: root.claim.claim_id,
        claim_version: root.claim.claim_version,
        ...(root.claim.parameters === undefined
          ? {}
          : { parameters: root.claim.parameters }),
      },
      expected_root_established: false,
    },
    currentness: currentness(input.assessment, root.certificate_id),
    requirements: CTA_REQUIREMENT_IDS.map((requirementId) => ({
      requirement_id: requirementId,
      status: input.report.requirements[requirementId].status,
      evidence_ids: [
        ...input.report.requirements[requirementId].evidence_ids,
      ],
      ...(input.report.requirements[requirementId].diagnostic_code
        === undefined
        ? {}
        : {
            diagnostic_code:
              input.report.requirements[requirementId].diagnostic_code,
          }),
    })),
    explanation: portableExplanation(input.report.explanation),
  };
}

function sealedTrust(protocol: RiddleProofBrowserSealedProtocol) {
  const registrations = [
    protocol.rules.target_confirmed.registration,
    protocol.rules.behavior_confirmed.registration,
    protocol.rules.sealed_profile_satisfied.registration,
  ];
  return {
    rule_registry: registrations,
    trusted_rules: registrations.map((registration) => ({
      rule_id: registration.rule_id,
      rule_version: registration.rule_version,
      engine: registration.engine,
      implementation_digest: registration.implementation_digest,
    })),
  };
}

function verificationFromSealed(input: {
  authority: CtaAttemptAuthority;
  candidate: ResolvedCtaCandidate;
  replay: Extract<
    ReturnType<typeof replayRiddleProofBrowserSealedProof>,
    { ok: true }
  >;
  protocol: RiddleProofBrowserSealedProtocol;
  assessment: Assessment;
  explanation: Explanation;
  replayed_at: string;
}): ApplicationVerification {
  const root = input.replay.root_certificate;
  if (
    root.claim.claim_id
      !== input.authority.specification.expected_root.claim_id
    || root.claim.claim_version
      !== input.authority.specification.expected_root.claim_version
    || !isDeepStrictEqual(
      JSON.parse(JSON.stringify(root.claim.parameters ?? {})),
      JSON.parse(JSON.stringify(
        input.authority.specification.expected_root.parameters ?? {},
      )),
    )
  ) {
    throw new Error("Sealed CTA root does not equal the expected root.");
  }
  const certificateByClaim = new Map(
    input.explanation.nodes.map((node) => [
      `${node.claim.claim_id}\0${node.claim.claim_version}`,
      node.certificate_id,
    ]),
  );
  const passed = certificateByClaim.get(
    "riddle-proof.browser.declared-profile-passed\u00001",
  );
  const runtime = certificateByClaim.get(
    "riddle-proof.browser.captured-runtime-clean\u00001",
  );
  if (!passed || !runtime) {
    throw new Error("Sealed CTA proof omitted required positive leaves.");
  }
  const evidenceFor = (requirementId: CtaRequirementId) =>
    requirementId === "runtime-healthy" ? [runtime] : [passed];
  return {
    version: "riddle-proof.application-verification.v1",
    verification_kind: "checked_meaning_replay",
    status: "verified",
    proof_id: root.certificate_id,
    authority: ctaAuthorityRef(input.authority),
    spec: input.authority.specification.ref,
    subject: input.candidate.subject,
    replayed_at: input.replayed_at,
    proof_root: {
      root_certificate_id: root.certificate_id,
      claim: {
        claim_id: root.claim.claim_id,
        claim_version: root.claim.claim_version,
        ...(root.claim.parameters === undefined
          ? {}
          : { parameters: root.claim.parameters }),
      },
      expected_root_established: true,
    },
    currentness: currentness(input.assessment, root.certificate_id),
    requirements: CTA_REQUIREMENT_IDS.map((requirementId) => ({
      requirement_id: requirementId,
      status: "satisfied" as const,
      evidence_ids: evidenceFor(requirementId),
    })),
    explanation: portableExplanation(input.explanation),
  };
}

function statusMap(report: CtaStatusReport) {
  return Object.fromEntries(
    CTA_REQUIREMENT_IDS.map((requirementId) => [
      requirementId,
      report.requirements[requirementId].status,
    ]),
  ) as Record<CtaRequirementId, CtaRequirementStatus>;
}

/**
 * Route-inventory collection intentionally navigates auxiliary routes and may
 * leave Playwright on the final inventory route. The signed profile result,
 * however, separately records the primary target route for every declared
 * viewport. Preserve that auxiliary terminal URL as metadata while binding
 * the sensor's primary observed URL to the independently reassessed target.
 */
function bindPrimaryTargetSensor(input: {
  bundle: RiddleProofSignedCaptureBundle;
  candidate: ResolvedCtaCandidate;
  signing_key: {
    key_id: string;
    private_key_pkcs8_base64: string;
  };
}): RiddleProofSignedCaptureBundle {
  const terminalObservedUrl = (
    input.bundle.statement.sensor.metadata
    && typeof input.bundle.statement.sensor.metadata === "object"
    && !Array.isArray(input.bundle.statement.sensor.metadata)
  )
    ? input.bundle.statement.sensor.metadata.observed_url
    : undefined;
  const inlineById = new Map(
    input.bundle.inline_artifacts.map((artifact) => [
      artifact.artifact_id,
      artifact,
    ]),
  );
  const artifacts = input.bundle.statement.artifacts.map((manifest) => {
    const inline = inlineById.get(manifest.artifact_id);
    if (!inline) {
      throw new Error(
        `Signed CTA bundle omitted inline bytes for ${manifest.artifact_id}.`,
      );
    }
    return {
      artifact_id: manifest.artifact_id,
      role: manifest.role,
      media_type: manifest.media_type,
      bytes_base64: inline.bytes_base64,
    };
  }) as [
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
  ];
  const metadata = {
    ...(input.bundle.statement.sensor.metadata ?? {}),
    requested_url: input.candidate.scope.target,
    observed_url: input.candidate.scope.target,
    ...(typeof terminalObservedUrl === "string"
      && terminalObservedUrl !== input.candidate.scope.target
      ? { auxiliary_terminal_url: terminalObservedUrl }
      : {}),
  };
  const rebound = createRiddleProofSignedCaptureBundle({
    scope: input.bundle.statement.scope,
    nonce: input.bundle.statement.nonce,
    captured_at: input.bundle.statement.captured_at,
    collector: input.bundle.statement.collector,
    sensor: {
      ...input.bundle.statement.sensor,
      observed_target: input.candidate.scope.target,
      metadata,
    },
    verifier: input.bundle.statement.verifier,
    artifacts,
    signing_key: input.signing_key,
  });
  if (!rebound.ok) {
    throw resultError("Binding the primary CTA target sensor", rebound);
  }
  return rebound.bundle;
}

/**
 * Local Playwright is one effectful sensor behind the candidate-ref-only
 * client. It captures once, signs once, and independently replays either the
 * four-status report or the passed-only sealed root from those same bytes.
 */
export function createLocalCtaBrowserReportProvider(
  configuration: LocalCtaReportProviderConfiguration,
) {
  const checked = checkedConfiguration(configuration);

  return Object.freeze({
    async check(input: {
      contract: unknown;
      candidate: ResolvedCtaCandidate;
      authority: CtaAttemptAuthority;
    }): Promise<ApplicationVerification> {
      const { candidate, authority } = checkedProviderInput(input);
      const protocolResult = createRiddleProofBrowserSealedProtocol({
        expected_scope: candidate.scope,
        expected_profile_name: candidate.profile.profile_name,
        expected_profile_digest: candidate.profile.profile_digest,
      });
      if (!protocolResult.ok) {
        throw resultError("Creating sealed CTA protocol", protocolResult);
      }
      const protocol = protocolResult.protocol;
      const requestedCandidateRoot = path.join(
        checked.artifacts_directory,
        sha256(candidate.candidate_ref).slice("sha256:".length),
      );
      if (!existsSync(requestedCandidateRoot)) {
        mkdirSync(requestedCandidateRoot, { mode: 0o700 });
      }
      const candidateRoot = privateDirectory(
        requestedCandidateRoot,
        "candidate artifact directory",
      );
      const candidateDirectory = mkdtempSync(
        path.join(candidateRoot, "attempt-"),
      );
      privateDirectory(
        candidateDirectory,
        "attempt artifact directory",
      );
      const nonce = randomBytes(32).toString("base64url");
      const extraHTTPHeaders =
        await checked.extra_http_headers_for?.({ candidate });
      const timeout = checked.timeout_seconds_for?.({ candidate });
      if (
        timeout !== undefined
        && (
          !Number.isSafeInteger(timeout)
          || timeout <= 0
        )
      ) {
        throw new TypeError(
          "timeout_seconds_for must return a positive safe integer.",
        );
      }
      const rawOutput = await runProfileLocal({
        profile: candidate.profile.normalized_profile,
        outputDir: candidateDirectory,
        url: candidate.scope.target,
        source: checked.source_for({ candidate }),
        ...(extraHTTPHeaders === undefined
          ? {}
          : { extraHTTPHeaders }),
        ...(timeout === undefined ? {} : { timeout }),
        groundedCapture: {
          scope: candidate.scope,
          nonce,
          collector: checked.collector,
          verifier: protocol.verifier.verifier_ref,
          signingKey: {
            key_id: checked.signing_key.key_id,
            private_key_pkcs8_base64:
              checked.signing_key.private_key_pkcs8_base64,
          },
        },
      });
      const output = portableLocalRunOutput(
        rawOutput,
        candidateDirectory,
      );
      const capturedBundle = output.groundedCaptureBundle;
      if (!capturedBundle) {
        throw new Error(
          output.groundedCaptureError?.message
          ?? "Local CTA runner did not produce a signed capture.",
        );
      }
      if (
        output.result.route.matched !== true
        || output.result.route.requested !== candidate.scope.target
      ) {
        throw new Error(
          "CTA capture cannot bind a primary sensor target without an exact matched profile route.",
        );
      }
      const bundle = bindPrimaryTargetSensor({
        bundle: capturedBundle,
        candidate,
        signing_key: {
          key_id: checked.signing_key.key_id,
          private_key_pkcs8_base64:
            checked.signing_key.private_key_pkcs8_base64,
        },
      });
      persistBoundCaptureBundle({
        output,
        bundle,
        expected_directory: candidateDirectory,
      });
      const timelineBase = plusMilliseconds(output.result.captured_at, 1_000);
      const reportAuthority: CtaStatusReportAuthority = {
        policy: {
          expected_scope: candidate.scope,
          expected_nonce: nonce,
          expected_collector: checked.collector,
          expected_sensor: bundle.statement.sensor,
          expected_verifier: protocol.verifier.verifier_ref,
          expected_signer: {
            key_id: checked.signing_key.key_id,
            public_key_spki_sha256: sha256(
              checked.signing_key.public_key_bytes,
            ),
          },
          verification_time: timelineBase,
          max_capture_age_ms: checked.max_capture_age_ms,
          max_future_skew_ms: checked.max_capture_future_skew_ms,
          required_artifact_roles: [
            "profile_contract",
            "derived_result",
          ],
        },
        trusted_signers: [{
          key_id: checked.signing_key.key_id,
          public_key_spki_base64:
            checked.signing_key.public_key_spki_base64,
        }],
      };
      const report = createCtaStatusReport({
        bundle,
        authority: reportAuthority,
        expected_scope: candidate.scope,
        expected_profile_name: candidate.profile.profile_name,
        expected_profile_digest: candidate.profile.profile_digest,
        root_issued_at: plusMilliseconds(timelineBase, 1),
      });
      if (!report.ok) {
        throw resultError("Creating CTA status report", report);
      }
      const statuses = statusMap(report);
      const ordinaryConsumptionTime = plusMilliseconds(timelineBase, 10);
      const consumptionTime = checked.consumption_time_for?.({
        candidate,
        ordinary_consumption_time: ordinaryConsumptionTime,
      }) ?? ordinaryConsumptionTime;
      if (!Number.isFinite(Date.parse(consumptionTime))) {
        throw new TypeError(
          "consumption_time_for must return an ISO-compatible timestamp.",
        );
      }
      const allSatisfied = CTA_REQUIREMENT_IDS.every(
        (requirementId) => statuses[requirementId] === "satisfied",
      );
      let verification: ApplicationVerification;
      let sealedRootId: string | null = null;
      if (!allSatisfied) {
        const assessment = assessCtaStatusReport({
          report,
          consumption_time: consumptionTime,
          max_grounded_age_ms: checked.max_grounded_age_ms,
          max_future_skew_ms: checked.max_assessment_future_skew_ms,
        });
        verification = verificationFromReport({
          authority,
          candidate,
          report,
          assessment,
          replayed_at: consumptionTime,
        });
      } else {
        const sealed = createRiddleProofBrowserSealedProof({
          bundle,
          expected_scope: candidate.scope,
          expected_profile_name: candidate.profile.profile_name,
          expected_profile_digest: candidate.profile.profile_digest,
          authority: reportAuthority,
          protocol,
          leaf_issued_at: timelineBase,
          target_issued_at: plusMilliseconds(timelineBase, 1),
          behavior_issued_at: plusMilliseconds(timelineBase, 1),
          root_issued_at: plusMilliseconds(timelineBase, 2),
        });
        if (!sealed.ok || !("root_certificate" in sealed)) {
          throw resultError("Creating sealed CTA proof", sealed);
        }
        const replay = replayRiddleProofBrowserSealedProof({
          checked_closure: JSON.parse(
            JSON.stringify(sealed.checked_closure),
          ) as unknown,
          authority: reportAuthority,
          protocol,
          expected_root_certificate_id:
            sealed.root_certificate.certificate_id,
          expected_scope: candidate.scope,
          expected_profile_name: candidate.profile.profile_name,
          expected_profile_digest: candidate.profile.profile_digest,
        });
        if (!replay.ok || !("replay_contexts" in replay)) {
          throw resultError("Replaying sealed CTA proof", replay);
        }
        sealedRootId = replay.root_certificate.certificate_id;
        const replayTrust = sealedTrust(protocol);
        const explanation = explainRiddleProofCheckedMeaningClosure({
          checked_closure: replay.checked_closure,
          replay_contexts: replay.replay_contexts,
          ...replayTrust,
        });
        if (!explanation.ok) {
          throw resultError("Explaining sealed CTA proof", explanation);
        }
        const assessment = assessRiddleProofCheckedMeaningClosure({
          checked_closure: replay.checked_closure,
          replay_contexts: replay.replay_contexts,
          ...replayTrust,
          consumption_time: consumptionTime,
          max_grounded_age_ms: checked.max_grounded_age_ms,
          max_future_skew_ms: checked.max_assessment_future_skew_ms,
        });
        verification = verificationFromSealed({
          authority,
          candidate,
          replay,
          protocol,
          assessment,
          explanation: explanation.explanation,
          replayed_at: consumptionTime,
        });
      }
      assertApplicationVerification(verification);
      const attempt: LocalCtaBrowserReportAttempt = {
        candidate_ref: candidate.candidate_ref,
        statuses,
        check_report_id: report.root_certificate.certificate_id,
        sealed_root_id: sealedRootId,
        profile_status: report.profile_status,
      };
      try {
        checked.on_attempt?.(Object.freeze(attempt));
      } catch {
        // Audit telemetry is deliberately not verification authority.
      }
      return verification;
    },
  });
}
