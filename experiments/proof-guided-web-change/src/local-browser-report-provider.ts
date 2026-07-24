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
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  assessRiddleProofCheckedMeaningClosure,
  explainRiddleProofCheckedMeaningClosure,
  type RiddleProofGroundedCollectorRef,
  type RiddleProofSourceIdentity,
} from "@riddledc/riddle-proof-core";
import {
  createRiddleProofBrowserSealedProof,
  createRiddleProofBrowserTransition,
  createRiddleProofBrowserTransitionProtocol,
  replayRiddleProofBrowserTransition,
  runProfileLocal,
  type RiddleProofBrowserTransitionCheckpoint,
  type RiddleProofBrowserTransitionProtocol,
  type RunProfileLocalResult,
} from "@riddledc/riddle-proof-runner-playwright";
import {
  applicationAuthorityRef,
  assertApplicationVerification,
  type ApplicationCurrentness,
  type ApplicationVerification,
} from "riddle-proof-application-projection-experiment";
import {
  applicationVerificationFromCheckedMeaning,
} from "riddle-proof-application-projection-experiment/checked-meaning";

import {
  assessRiddleProofBrowserTransitionCheckReport,
  createRiddleProofBrowserTransitionCheckReport,
  replayRiddleProofBrowserTransitionCheckReport,
  type RiddleProofBrowserCheckReportAuthorities,
  type RiddleProofBrowserCheckReportAuthority,
  type RiddleProofBrowserCheckReportProfiles,
  type RiddleProofBrowserCheckReportRequirement,
  type RiddleProofBrowserCheckReportRole,
  type RiddleProofBrowserCheckReportStatuses,
  type RiddleProofBrowserTransitionCheckReport,
} from "./browser-check-report.js";
import {
  type ResolvedWebChangeCandidate,
  type WebChangeAttemptAuthority,
  type WebChangeReportProvider,
  type WebChangeReportProviderInput,
} from "./types.js";

const PROFILE_ROLES = [
  "before",
  "action",
  "reload",
  "fresh_context",
] as const satisfies readonly RiddleProofBrowserCheckReportRole[];

const DEFAULT_MAX_CAPTURE_AGE_MS = 5 * 60 * 1000;
const DEFAULT_MAX_GROUNDED_AGE_MS = 5 * 60 * 1000;
const DEFAULT_MAX_CAPTURE_FUTURE_SKEW_MS = 1_000;
const DEFAULT_MAX_ASSESSMENT_FUTURE_SKEW_MS = 0;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;

export interface LocalBrowserReportSigningKey {
  key_id: string;
  private_key_pkcs8_base64: string;
  public_key_spki_base64: string;
}

export interface LocalBrowserReportAttempt {
  candidate_ref: string;
  statuses: RiddleProofBrowserCheckReportStatuses;
  check_report_id: string;
  durable_root_id: string | null;
  verification_status: ApplicationVerification["status"];
}

export interface LocalBrowserReportProviderConfiguration {
  artifacts_directory: string;
  signing_key: LocalBrowserReportSigningKey;
  collector: RiddleProofGroundedCollectorRef;
  source_for(input: {
    candidate: ResolvedWebChangeCandidate;
    role: RiddleProofBrowserCheckReportRole;
  }): RiddleProofSourceIdentity;
  /**
   * Runtime-only browser context headers. Values are passed directly to the
   * local Playwright context and must never enter profiles or proof artifacts.
   */
  extra_http_headers_for?(input: {
    candidate: ResolvedWebChangeCandidate;
  }): Readonly<Record<string, string>>
    | Promise<Readonly<Record<string, string>>>;
  /**
   * The default is the first instant after all certificates for the attempt
   * have been issued. A configured application clock may replace it, including
   * to replay an honestly stale report.
   */
  consumption_time_for?(input: {
    candidate: ResolvedWebChangeCandidate;
    ordinary_consumption_time: string;
  }): string;
  timeout_seconds_for?(input: {
    candidate: ResolvedWebChangeCandidate;
    role: RiddleProofBrowserCheckReportRole;
  }): number | undefined;
  max_capture_age_ms?: number;
  max_grounded_age_ms?: number;
  max_capture_future_skew_ms?: number;
  max_assessment_future_skew_ms?: number;
  /**
   * Content-light audit telemetry. Observer failures are ignored and cannot
   * change the verification result.
   */
  on_attempt?(attempt: LocalBrowserReportAttempt): void;
}

type CapturedRole = {
  nonce: string;
  output: RunProfileLocalResult;
  protocol: RiddleProofBrowserTransitionProtocol["sealed_protocols"][
    RiddleProofBrowserCheckReportRole
  ];
};

type CapturedAttempt = {
  captures: Partial<Record<RiddleProofBrowserCheckReportRole, CapturedRole>>;
  transition_profiles: RiddleProofBrowserCheckReportProfiles;
  transition_protocol: RiddleProofBrowserTransitionProtocol;
};

type CurrentnessAssessment =
  | {
      disposition: "checked";
      root_certificate: { certificate_id: string };
      consumption_time: string;
    }
  | {
      disposition: "stale";
      root_certificate: { certificate_id: string };
      consumption_time: string;
      stale_certificate_ids: readonly [string, ...string[]];
    }
  | {
      disposition: "unresolved";
      error: { code: string };
    };

function nonempty(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
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
  options: { allow_zero?: boolean } = {},
): number {
  if (value === undefined) return fallback;
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || (options.allow_zero ? value < 0 : value <= 0)
  ) {
    throw new TypeError(
      `${context} must be ${options.allow_zero ? "a nonnegative" : "a positive"} safe integer.`,
    );
  }
  return value;
}

function sha256(bytes: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function assertPrivateDirectory(
  directory: string,
  context: string,
): void {
  const stats = lstatSync(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new TypeError(`${context} must be a real local directory.`);
  }
  if ((stats.mode & 0o077) !== 0) {
    throw new TypeError(
      `${context} must not grant group or world permissions.`,
    );
  }
  if (
    typeof process.getuid === "function"
    && stats.uid !== process.getuid()
  ) {
    throw new TypeError(`${context} must be owned by the current user.`);
  }
}

function createExclusivePrivateDirectory(
  directory: string,
  context: string,
): void {
  mkdirSync(directory, { mode: 0o700 });
  assertPrivateDirectory(directory, context);
}

function sealArtifactTree(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error("Browser artifacts must not contain symbolic links.");
    }
    if (entry.isDirectory()) {
      sealArtifactTree(child);
      chmodSync(child, 0o700);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error("Browser artifacts must contain only files and directories.");
    }
    chmodSync(child, 0o600);
  }
  chmodSync(directory, 0o700);
}

function portableLocalRunOutput(
  output: RunProfileLocalResult,
  expectedOutputDirectory: string,
): RunProfileLocalResult {
  if (
    output.outputDir !== expectedOutputDirectory
    || output.observationPath
      !== path.join(expectedOutputDirectory, "observation-receipt.json")
    || output.manifestPath
      !== path.join(expectedOutputDirectory, "artifact-manifest.json")
  ) {
    throw new Error(
      "The local browser runner returned paths outside its exact attempt directory.",
    );
  }
  const observation = {
    ...output.observation,
    publication: {
      kind: "local" as const,
      path: ".",
    },
  };
  const serializedObservation = `${JSON.stringify(observation, null, 2)}\n`;
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
    throw new Error("The local browser artifact manifest is invalid.");
  }
  const receiptEntry = manifest.artifacts.find(
    (artifact) => artifact.path === "observation-receipt.json",
  );
  if (!receiptEntry) {
    throw new Error(
      "The local browser artifact manifest omitted its observation receipt.",
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
  sealArtifactTree(expectedOutputDirectory);
  return {
    ...output,
    observation,
  };
}

function plusMilliseconds(timestamp: string, milliseconds: number): string {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`Invalid capture timestamp: ${timestamp}.`);
  }
  return new Date(parsed + milliseconds).toISOString();
}

function maxTimestamp(timestamps: readonly string[]): string {
  if (timestamps.length === 0) {
    throw new TypeError("At least one capture timestamp is required.");
  }
  const parsed = timestamps.map((timestamp) => Date.parse(timestamp));
  if (parsed.some((value) => !Number.isFinite(value))) {
    throw new TypeError("Every browser capture must have a valid timestamp.");
  }
  return new Date(Math.max(...parsed)).toISOString();
}

function resultError(
  context: string,
  result: unknown,
): Error {
  const message = (
    result
    && typeof result === "object"
    && "error" in result
    && result.error
    && typeof result.error === "object"
    && "message" in result.error
  )
    ? result.error.message
    : undefined;
  return new Error(
    typeof message === "string"
      ? `${context}: ${message}`
      : `${context} failed.`,
  );
}

function checkedConfiguration(
  value: LocalBrowserReportProviderConfiguration,
) {
  if (!value || typeof value !== "object") {
    throw new TypeError(
      "Local browser report provider configuration must be an object.",
    );
  }
  const requestedArtifactsDirectory = path.resolve(
    nonempty(value.artifacts_directory, "artifacts_directory"),
  );
  if (!existsSync(requestedArtifactsDirectory)) {
    throw new TypeError("artifacts_directory must already exist.");
  }
  const requestedStats = lstatSync(requestedArtifactsDirectory);
  if (
    !requestedStats.isDirectory()
    || requestedStats.isSymbolicLink()
  ) {
    throw new TypeError(
      "artifacts_directory must be a real local directory.",
    );
  }
  const artifactsDirectory = realpathSync(requestedArtifactsDirectory);
  assertPrivateDirectory(
    artifactsDirectory,
    "artifacts_directory",
  );
  if (
    !value.signing_key
    || typeof value.signing_key !== "object"
  ) {
    throw new TypeError("signing_key must be an object.");
  }
  const keyId = nonempty(value.signing_key.key_id, "signing_key.key_id");
  const privateKeyBase64 = nonempty(
    value.signing_key.private_key_pkcs8_base64,
    "signing_key.private_key_pkcs8_base64",
  );
  const publicKeyBase64 = nonempty(
    value.signing_key.public_key_spki_base64,
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
  if (
    privateKey.asymmetricKeyType !== "ed25519"
    || publicKey.asymmetricKeyType !== "ed25519"
  ) {
    throw new TypeError("signing_key must be an Ed25519 key pair.");
  }
  const keyChallenge = Buffer.from(
    "riddle-proof.local-browser-report-provider.key-check.v1\0",
    "utf8",
  );
  if (
    !verify(
      null,
      keyChallenge,
      publicKey,
      sign(null, keyChallenge, privateKey),
    )
  ) {
    throw new TypeError(
      "signing_key private and public key material do not match.",
    );
  }
  if (!value.collector || typeof value.collector !== "object") {
    throw new TypeError("collector must be an object.");
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
  if (
    value.consumption_time_for !== undefined
    && typeof value.consumption_time_for !== "function"
  ) {
    throw new TypeError("consumption_time_for must be a function.");
  }
  if (
    value.timeout_seconds_for !== undefined
    && typeof value.timeout_seconds_for !== "function"
  ) {
    throw new TypeError("timeout_seconds_for must be a function.");
  }
  if (
    value.extra_http_headers_for !== undefined
    && typeof value.extra_http_headers_for !== "function"
  ) {
    throw new TypeError("extra_http_headers_for must be a function.");
  }
  if (
    value.on_attempt !== undefined
    && typeof value.on_attempt !== "function"
  ) {
    throw new TypeError("on_attempt must be a function.");
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
    consumption_time_for: value.consumption_time_for,
    timeout_seconds_for: value.timeout_seconds_for,
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
      { allow_zero: true },
    ),
    max_assessment_future_skew_ms: positiveInteger(
      value.max_assessment_future_skew_ms,
      DEFAULT_MAX_ASSESSMENT_FUTURE_SKEW_MS,
      "max_assessment_future_skew_ms",
      { allow_zero: true },
    ),
    on_attempt: value.on_attempt,
  };
}

function transitionTrust(
  protocol: RiddleProofBrowserTransitionProtocol,
) {
  const ruleRegistry = [
    protocol.sealed_protocols.before.rules.target_confirmed.registration,
    protocol.sealed_protocols.before.rules.behavior_confirmed.registration,
    protocol.sealed_protocols.before.rules.sealed_profile_satisfied.registration,
    protocol.rules.transition_observed.registration,
    protocol.rules.transition_survived_reload.registration,
    protocol.rules.transition_visible_in_fresh_context.registration,
    protocol.rules.durable_state_transition_observed.registration,
  ];
  return {
    rule_registry: ruleRegistry,
    trusted_rules: ruleRegistry.map((registration) => ({
      rule_id: registration.rule_id,
      rule_version: registration.rule_version,
      engine: registration.engine,
      implementation_digest: registration.implementation_digest,
    })),
  };
}

function currentnessFromAssessment(
  assessment: CurrentnessAssessment,
  rootCertificateId: string,
): ApplicationCurrentness {
  if (
    assessment.disposition !== "unresolved"
    && assessment.root_certificate.certificate_id !== rootCertificateId
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

function applicationVerificationFromCheckReport(input: {
  authority: WebChangeAttemptAuthority;
  candidate: ResolvedWebChangeCandidate;
  report: RiddleProofBrowserTransitionCheckReport;
  assessment: CurrentnessAssessment;
  replayed_at: string;
}): ApplicationVerification {
  const root = input.report.root_certificate;
  const explanation = input.report.explanation;
  const reportRequirements = input.report.requirements as unknown as Readonly<
    Record<string, RiddleProofBrowserCheckReportRequirement | undefined>
  >;
  const requirements = input.authority.specification.requirements.map(
    ({ requirement_id: requirementId }) => {
      const requirement = reportRequirements[requirementId];
      if (!requirement) {
        throw new Error(
          `Browser check report does not cover pinned requirement ${requirementId}.`,
        );
      }
      return {
        requirement_id: requirementId,
        status: requirement.status,
        evidence_ids: [...requirement.role_certificate_ids],
      };
    },
  );
  return {
    version: "riddle-proof.application-verification.v1",
    verification_kind: "checked_meaning_replay",
    status: "verified",
    proof_id: root.certificate_id,
    authority: applicationAuthorityRef(input.authority),
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
    currentness: currentnessFromAssessment(
      input.assessment,
      root.certificate_id,
    ),
    requirements,
    explanation: {
      root_certificate_id: explanation.root_certificate_id,
      node_count: explanation.node_count,
      grounded_leaf_count: explanation.grounded_leaf_count,
      checked_composition_count: explanation.checked_composition_count,
      node_certificate_ids: explanation.nodes
        .map((node) => node.certificate_id)
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
    },
  };
}

function exactProfiles(
  candidate: ResolvedWebChangeCandidate,
): RiddleProofBrowserCheckReportProfiles {
  return {
    before: {
      profile_name: candidate.profiles.before.profile_name,
      profile_digest: candidate.profiles.before.profile_digest,
    },
    action: {
      profile_name: candidate.profiles.action.profile_name,
      profile_digest: candidate.profiles.action.profile_digest,
    },
    reload: {
      profile_name: candidate.profiles.reload.profile_name,
      profile_digest: candidate.profiles.reload.profile_digest,
    },
    fresh_context: {
      profile_name: candidate.profiles.fresh_context.profile_name,
      profile_digest: candidate.profiles.fresh_context.profile_digest,
    },
  };
}

function capturedRole(
  attempt: CapturedAttempt,
  role: RiddleProofBrowserCheckReportRole,
): CapturedRole {
  const captured = attempt.captures[role];
  if (!captured) {
    throw new Error(`Browser capture is missing required ${role} role.`);
  }
  if (!captured.output.groundedCaptureBundle) {
    const detail = captured.output.groundedCaptureError?.message
      ?? "the grounded capture bundle is absent";
    throw new Error(`Grounded verifier failed for ${role}: ${detail}`);
  }
  return captured;
}

function capturedBundle(
  attempt: CapturedAttempt,
  role: RiddleProofBrowserCheckReportRole,
) {
  const captured = capturedRole(attempt, role);
  const bundle = captured.output.groundedCaptureBundle;
  if (!bundle) {
    throw new Error(`Grounded verifier failed for ${role}.`);
  }
  return bundle;
}

/**
 * Creates the trusted local Playwright adapter behind
 * `WebChangeReportProvider`.
 *
 * The adapter captures and signs all four contract-owned profiles, then
 * independently replays either the complete status report or the successful
 * durable-transition root. It returns verifier facts only. It cannot supply
 * the application disposition, finding prose, repair guidance, candidate
 * identity, profiles, or authority.
 */
export function createLocalBrowserReportProvider(
  configuration: LocalBrowserReportProviderConfiguration,
): WebChangeReportProvider {
  const checked = checkedConfiguration(configuration);
  let captureOrdinal = 0;

  function emitAttempt(attempt: LocalBrowserReportAttempt): void {
    try {
      checked.on_attempt?.(Object.freeze({
        ...attempt,
        statuses: Object.freeze({ ...attempt.statuses }),
      }));
    } catch {
      // This callback is audit telemetry, not verification authority.
    }
  }

  async function captureAttempt(
    candidate: ResolvedWebChangeCandidate,
  ): Promise<CapturedAttempt> {
    const extraHTTPHeaders =
      await checked.extra_http_headers_for?.({ candidate });
    const transitionProfiles = exactProfiles(candidate);
    const protocolResult = createRiddleProofBrowserTransitionProtocol({
      expected_scope: candidate.scope,
      transition_id: candidate.scope.proof_attempt,
      profiles: transitionProfiles,
    });
    if (!protocolResult.ok) {
      throw resultError(
        "Creating the browser transition protocol",
        protocolResult,
      );
    }
    const transitionProtocol = protocolResult.protocol;
    const captures: CapturedAttempt["captures"] = {};
    for (const role of PROFILE_ROLES) {
      captureOrdinal += 1;
      const nonce = randomBytes(32).toString("base64url");
      const timeout = checked.timeout_seconds_for?.({ candidate, role });
      if (
        timeout !== undefined
        && (
          typeof timeout !== "number"
          || !Number.isSafeInteger(timeout)
          || timeout <= 0
        )
      ) {
        throw new TypeError(
          "timeout_seconds_for must return a positive safe integer or undefined.",
        );
      }
      const source = checked.source_for({ candidate, role });
      const candidateDirectory = path.join(
        checked.artifacts_directory,
        sha256(candidate.candidate_ref).slice("sha256:".length),
      );
      if (existsSync(candidateDirectory)) {
        assertPrivateDirectory(
          candidateDirectory,
          "candidate artifact directory",
        );
      } else {
        createExclusivePrivateDirectory(
          candidateDirectory,
          "candidate artifact directory",
        );
      }
      const roleDirectory = path.join(
        candidateDirectory,
        `${String(captureOrdinal).padStart(6, "0")}-${role}`,
      );
      createExclusivePrivateDirectory(
        roleDirectory,
        "role artifact directory",
      );
      const rawOutput = await runProfileLocal({
        profile: candidate.profiles[role].normalized_profile,
        url: candidate.scope.target,
        ...(extraHTTPHeaders === undefined
          ? {}
          : { extraHTTPHeaders }),
        ...(timeout === undefined ? {} : { timeout }),
        outputDir: roleDirectory,
        source,
        groundedCapture: {
          scope: candidate.scope,
          nonce,
          collector: checked.collector,
          verifier:
            transitionProtocol.sealed_protocols[role].verifier.verifier_ref,
          signingKey: {
            key_id: checked.signing_key.key_id,
            private_key_pkcs8_base64:
              checked.signing_key.private_key_pkcs8_base64,
          },
        },
      });
      const output = portableLocalRunOutput(
        rawOutput,
        roleDirectory,
      );
      captures[role] = {
        nonce,
        output,
        protocol: transitionProtocol.sealed_protocols[role],
      };
      if (!output.groundedCaptureBundle) break;
    }
    return {
      captures,
      transition_profiles: transitionProfiles,
      transition_protocol: transitionProtocol,
    };
  }

  function authorityFor(input: {
    candidate: ResolvedWebChangeCandidate;
    captured: CapturedRole;
    verification_time: string;
  }): RiddleProofBrowserCheckReportAuthority {
    const bundle = input.captured.output.groundedCaptureBundle;
    if (!bundle) {
      throw new Error("Grounded browser capture bundle is unavailable.");
    }
    return {
      policy: {
        expected_scope: input.candidate.scope,
        expected_nonce: input.captured.nonce,
        expected_collector: checked.collector,
        expected_sensor: bundle.statement.sensor,
        expected_verifier:
          input.captured.protocol.verifier.verifier_ref,
        expected_signer: {
          key_id: checked.signing_key.key_id,
          public_key_spki_sha256: sha256(
            checked.signing_key.public_key_bytes,
          ),
        },
        verification_time: input.verification_time,
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
  }

  function authoritiesFor(
    candidate: ResolvedWebChangeCandidate,
    captured: CapturedAttempt,
    timelineBase: string,
  ): RiddleProofBrowserCheckReportAuthorities {
    return {
      before: authorityFor({
        candidate,
        captured: capturedRole(captured, "before"),
        verification_time: plusMilliseconds(timelineBase, 0),
      }),
      action: authorityFor({
        candidate,
        captured: capturedRole(captured, "action"),
        verification_time: plusMilliseconds(timelineBase, 10),
      }),
      reload: authorityFor({
        candidate,
        captured: capturedRole(captured, "reload"),
        verification_time: plusMilliseconds(timelineBase, 20),
      }),
      fresh_context: authorityFor({
        candidate,
        captured: capturedRole(captured, "fresh_context"),
        verification_time: plusMilliseconds(timelineBase, 30),
      }),
    };
  }

  function createCheckReport(input: {
    candidate: ResolvedWebChangeCandidate;
    captured: CapturedAttempt;
    authorities: RiddleProofBrowserCheckReportAuthorities;
    timeline_base: string;
  }): RiddleProofBrowserTransitionCheckReport {
    const created = createRiddleProofBrowserTransitionCheckReport({
      bundles: {
        before: capturedBundle(input.captured, "before"),
        action: capturedBundle(input.captured, "action"),
        reload: capturedBundle(input.captured, "reload"),
        fresh_context: capturedBundle(input.captured, "fresh_context"),
      },
      authorities: input.authorities,
      expected_scope: input.candidate.scope,
      transition_id: input.candidate.scope.proof_attempt,
      profiles: input.captured.transition_profiles,
      role_issued_at: {
        before: plusMilliseconds(input.timeline_base, 2),
        action: plusMilliseconds(input.timeline_base, 12),
        reload: plusMilliseconds(input.timeline_base, 22),
        fresh_context: plusMilliseconds(input.timeline_base, 32),
      },
      root_issued_at: plusMilliseconds(input.timeline_base, 40),
    });
    if (!created.ok) {
      throw resultError("Creating the browser check report", created);
    }
    const replayed = replayRiddleProofBrowserTransitionCheckReport({
      checked_closure: JSON.parse(
        JSON.stringify(created.checked_closure),
      ) as unknown,
      authorities: JSON.parse(
        JSON.stringify(input.authorities),
      ) as RiddleProofBrowserCheckReportAuthorities,
      expected_root_certificate_id:
        created.root_certificate.certificate_id,
      expected_scope: JSON.parse(
        JSON.stringify(input.candidate.scope),
      ) as ResolvedWebChangeCandidate["scope"],
      transition_id: input.candidate.scope.proof_attempt,
      profiles: JSON.parse(
        JSON.stringify(input.captured.transition_profiles),
      ) as RiddleProofBrowserCheckReportProfiles,
    });
    if (!replayed.ok) {
      throw resultError("Replaying the browser check report", replayed);
    }
    return replayed;
  }

  function createDurableTransition(input: {
    candidate: ResolvedWebChangeCandidate;
    captured: CapturedAttempt;
    authorities: RiddleProofBrowserCheckReportAuthorities;
    timeline_base: string;
  }) {
    const checkpoints = {} as Record<
      RiddleProofBrowserCheckReportRole,
      RiddleProofBrowserTransitionCheckpoint
    >;
    for (const [index, role] of PROFILE_ROLES.entries()) {
      const sealed = createRiddleProofBrowserSealedProof({
        bundle: capturedBundle(input.captured, role),
        expected_scope: input.candidate.scope,
        expected_profile_name:
          input.captured.transition_profiles[role].profile_name,
        expected_profile_digest:
          input.captured.transition_profiles[role].profile_digest,
        authority: input.authorities[role],
        protocol: input.captured.transition_protocol.sealed_protocols[role],
        leaf_issued_at: plusMilliseconds(
          input.timeline_base,
          index * 10,
        ),
        target_issued_at: plusMilliseconds(
          input.timeline_base,
          index * 10 + 1,
        ),
        behavior_issued_at: plusMilliseconds(
          input.timeline_base,
          index * 10 + 1,
        ),
        root_issued_at: plusMilliseconds(
          input.timeline_base,
          index * 10 + 2,
        ),
      });
      if (!sealed.ok || !("root_certificate" in sealed)) {
        throw resultError(`Creating the sealed ${role} proof`, sealed);
      }
      checkpoints[role] = sealed;
    }
    const created = createRiddleProofBrowserTransition({
      expected_scope: input.candidate.scope,
      transition_id: input.candidate.scope.proof_attempt,
      profiles: input.captured.transition_profiles,
      protocol: input.captured.transition_protocol,
      checkpoints,
      authorities: input.authorities,
      transition_issued_at: plusMilliseconds(input.timeline_base, 15),
      reload_issued_at: plusMilliseconds(input.timeline_base, 25),
      fresh_context_issued_at: plusMilliseconds(input.timeline_base, 35),
      root_issued_at: plusMilliseconds(input.timeline_base, 40),
    });
    if (!created.ok) {
      throw resultError("Creating the durable browser transition", created);
    }
    const replayed = replayRiddleProofBrowserTransition({
      checked_closure: JSON.parse(
        JSON.stringify(created.checked_closure),
      ) as unknown,
      authorities: JSON.parse(
        JSON.stringify(input.authorities),
      ) as RiddleProofBrowserCheckReportAuthorities,
      protocol: JSON.parse(
        JSON.stringify(input.captured.transition_protocol),
      ) as RiddleProofBrowserTransitionProtocol,
      expected_root_certificate_id:
        created.root_certificate.certificate_id,
      expected_scope: JSON.parse(
        JSON.stringify(input.candidate.scope),
      ) as ResolvedWebChangeCandidate["scope"],
      transition_id: input.candidate.scope.proof_attempt,
      profiles: JSON.parse(
        JSON.stringify(input.captured.transition_profiles),
      ) as RiddleProofBrowserCheckReportProfiles,
    });
    if (!replayed.ok || !("replay_contexts" in replayed)) {
      throw resultError("Replaying the durable browser transition", replayed);
    }
    return replayed;
  }

  return Object.freeze({
    async check(input: WebChangeReportProviderInput) {
      const { candidate, authority } = input;
      const captured = await captureAttempt(candidate);
      for (const role of PROFILE_ROLES) {
        capturedRole(captured, role);
      }
      const timelineBase = plusMilliseconds(
        maxTimestamp(
          PROFILE_ROLES.map(
            (role) => capturedRole(captured, role).output.result.captured_at,
          ),
        ),
        1_000,
      );
      const authorities = authoritiesFor(
        candidate,
        captured,
        timelineBase,
      );
      const report = createCheckReport({
        candidate,
        captured,
        authorities,
        timeline_base: timelineBase,
      });
      const statuses = report.reported_statuses;
      const allPassed = PROFILE_ROLES.every(
        (role) => statuses[role] === "passed",
      );
      const ordinaryConsumptionTime = plusMilliseconds(timelineBase, 41);
      const consumptionTime = checked.consumption_time_for?.({
        candidate,
        ordinary_consumption_time: ordinaryConsumptionTime,
      }) ?? ordinaryConsumptionTime;
      if (!Number.isFinite(Date.parse(consumptionTime))) {
        throw new TypeError(
          "consumption_time_for must return an ISO-compatible timestamp.",
        );
      }

      if (!allPassed) {
        const assessment =
          assessRiddleProofBrowserTransitionCheckReport({
            report,
            consumption_time: consumptionTime,
            max_grounded_age_ms: checked.max_grounded_age_ms,
            max_future_skew_ms:
              checked.max_assessment_future_skew_ms,
          });
        const verification = applicationVerificationFromCheckReport({
          authority,
          candidate,
          report,
          assessment,
          replayed_at: consumptionTime,
        });
        assertApplicationVerification(verification);
        emitAttempt({
          candidate_ref: candidate.candidate_ref,
          statuses,
          check_report_id: report.root_certificate.certificate_id,
          durable_root_id: null,
          verification_status: verification.status,
        });
        return verification;
      }

      const durable = createDurableTransition({
        candidate,
        captured,
        authorities,
        timeline_base: timelineBase,
      });
      const trust = transitionTrust(captured.transition_protocol);
      const explanation = explainRiddleProofCheckedMeaningClosure({
        checked_closure: durable.checked_closure,
        replay_contexts: durable.replay_contexts,
        ...trust,
      });
      if (!explanation.ok) {
        throw resultError(
          "Explaining the durable browser transition",
          explanation,
        );
      }
      const assessment = assessRiddleProofCheckedMeaningClosure({
        checked_closure: durable.checked_closure,
        replay_contexts: durable.replay_contexts,
        ...trust,
        consumption_time: consumptionTime,
        max_grounded_age_ms: checked.max_grounded_age_ms,
        max_future_skew_ms: checked.max_assessment_future_skew_ms,
      });
      const verification = applicationVerificationFromCheckedMeaning({
        authority: applicationAuthorityRef(authority),
        specification: authority.specification.ref,
        expected_root: authority.specification.expected_root,
        subject: candidate.subject,
        replayed_at: consumptionTime,
        replay: durable,
        assessment,
        explanation,
        requirement_claims: [
          {
            requirement_id: "declared_transition_observed",
            claim_id: "riddle-proof.browser.transition-observed",
            claim_version: "1",
          },
          {
            requirement_id: "transition_survived_reload",
            claim_id:
              "riddle-proof.browser.transition-survived-reload",
            claim_version: "1",
          },
          {
            requirement_id:
              "transition_visible_in_fresh_context",
            claim_id:
              "riddle-proof.browser.transition-visible-in-fresh-context",
            claim_version: "1",
          },
        ],
      });
      assertApplicationVerification(verification);
      emitAttempt({
        candidate_ref: candidate.candidate_ref,
        statuses,
        check_report_id: report.root_certificate.certificate_id,
        durable_root_id: durable.root_certificate.certificate_id,
        verification_status: verification.status,
      });
      return verification;
    },
  });
}
