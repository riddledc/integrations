import {
  type ApplicationChallenge,
  type ApplicationInspectionLevel,
  type ApplicationInspectionView,
  type ApplicationProofEnvelope,
  type ApplicationProofRuntime,
  type ApplicationProofRuntimeConfiguration,
  type ApplicationProofStore,
  type ApplicationProjectionResult,
  type ApplicationRunRequest,
  type ApplicationSubjectRef,
  type ApplicationVerification,
} from "./types.js";
import {
  createApplicationUnavailableResult,
  inspectApplicationResult,
  projectApplicationResult,
} from "./projection.js";
import {
  assertApplicationVerification,
  assertChallenge,
  assertExactKeys,
  assertNonemptyString,
  assertProofEnvelope,
  assertSubjectRef,
  assertTimestamp,
  applicationAuthorityRef,
  clonePinnedAuthority,
  cloneStructuredFrozen,
  sameApplicationAuthorityRef,
  sameSpecificationRef,
  sameSubjectRef,
} from "./validation.js";

function assertCapability(value: unknown, method: string, context: string): void {
  if (!value || typeof value !== "object") {
    throw new TypeError(`${context} must be an object.`);
  }
  if (typeof (value as Record<string, unknown>)[method] !== "function") {
    throw new TypeError(`${context}.${method} must be a function.`);
  }
}

function assertRuntimeConfiguration<ProofPayload, SigningKeyHandle>(
  value: ApplicationProofRuntimeConfiguration<ProofPayload, SigningKeyHandle>,
): void {
  assertExactKeys(
    value,
    [
      "authority",
      "clock",
      "challenge_provider",
      "signing_key_provider",
      "proof_producer",
      "verifier",
      "store",
    ],
    [],
    "runtime configuration",
  );
  assertCapability(value.clock, "now", "runtime configuration.clock");
  assertCapability(
    value.challenge_provider,
    "issue",
    "runtime configuration.challenge_provider",
  );
  assertCapability(
    value.signing_key_provider,
    "get",
    "runtime configuration.signing_key_provider",
  );
  assertCapability(
    value.proof_producer,
    "capture_and_prove",
    "runtime configuration.proof_producer",
  );
  assertCapability(value.verifier, "verify", "runtime configuration.verifier");
  assertCapability(value.store, "save", "runtime configuration.store");
  assertCapability(value.store, "load", "runtime configuration.store");
}

function assertRunRequest(value: unknown): asserts value is ApplicationRunRequest {
  assertExactKeys(value, ["subject"], [], "run request");
  assertSubjectRef(value.subject, "run request.subject");
}

function safeNow(clock: { now(): string }): string {
  const value = clock.now();
  assertTimestamp(value, "configured clock result");
  return value;
}

function unavailable(input: {
  authority: ReturnType<typeof clonePinnedAuthority>;
  subject: ApplicationSubjectRef;
  diagnostic_code: string;
  proof_id?: string;
}): ApplicationProjectionResult {
  return createApplicationUnavailableResult(input);
}

function envelopeBindingDiagnostic<ProofPayload>(input: {
  envelope: ApplicationProofEnvelope<ProofPayload>;
  authority: ReturnType<typeof clonePinnedAuthority>;
  subject: ApplicationSubjectRef;
  challenge_id?: string;
}): string | null {
  if (
    !sameApplicationAuthorityRef(
      input.envelope.authority,
      applicationAuthorityRef(input.authority),
    )
  ) {
    return "producer_authority_binding_mismatch";
  }
  if (!sameSpecificationRef(input.envelope.spec, input.authority.specification.ref)) {
    return "producer_specification_binding_mismatch";
  }
  if (!sameSubjectRef(input.envelope.subject, input.subject)) {
    return "producer_subject_binding_mismatch";
  }
  if (input.challenge_id !== undefined && input.envelope.challenge_id !== input.challenge_id) {
    return "producer_challenge_binding_mismatch";
  }
  return null;
}

function proofIdMatches(
  verification: ApplicationVerification,
  envelope: ApplicationProofEnvelope<unknown>,
): boolean {
  return verification.proof_id === envelope.proof_id;
}

/**
 * Creates the application-facing controller. The configured authority is
 * validated, cloned, and deeply frozen exactly once. Each check request can
 * select only a subject; nonce, signing key, governing specification,
 * expected root, verifier, clock, and storage remain environmental authority.
 */
export function createApplicationProofRuntime<ProofPayload, SigningKeyHandle>(
  configuration: ApplicationProofRuntimeConfiguration<ProofPayload, SigningKeyHandle>,
): ApplicationProofRuntime {
  assertRuntimeConfiguration(configuration);
  const authority = clonePinnedAuthority(configuration.authority);
  const readClock = configuration.clock.now.bind(configuration.clock);
  const issueChallenge = configuration.challenge_provider.issue.bind(
    configuration.challenge_provider,
  );
  const getSigningKey = configuration.signing_key_provider.get.bind(
    configuration.signing_key_provider,
  );
  const captureAndProve = configuration.proof_producer.capture_and_prove.bind(
    configuration.proof_producer,
  );
  const verifyProof = configuration.verifier.verify.bind(configuration.verifier);
  const saveProof = configuration.store.save.bind(configuration.store);
  const loadProof = configuration.store.load.bind(configuration.store);

  async function projectEnvelope(
    envelope: ApplicationProofEnvelope<ProofPayload>,
    subject: ApplicationSubjectRef,
  ): Promise<ApplicationProjectionResult> {
    const bindingDiagnostic = envelopeBindingDiagnostic({
      envelope,
      authority,
      subject,
    });
    if (bindingDiagnostic) {
      return unavailable({
        authority,
        subject,
        proof_id: envelope.proof_id,
        diagnostic_code: bindingDiagnostic,
      });
    }
    const consumptionTime = safeNow({ now: readClock });
    let candidate: ApplicationVerification;
    try {
      candidate = await verifyProof({
        authority,
        envelope,
        consumption_time: consumptionTime,
      });
    } catch {
      return unavailable({
        authority,
        subject,
        proof_id: envelope.proof_id,
        diagnostic_code: "verifier_failed",
      });
    }
    let verification: ApplicationVerification;
    try {
      assertApplicationVerification(candidate);
      verification = cloneStructuredFrozen(candidate);
      assertApplicationVerification(verification);
    } catch {
      return unavailable({
        authority,
        subject,
        proof_id: envelope.proof_id,
        diagnostic_code: "verification_shape_invalid",
      });
    }
    if (!proofIdMatches(verification, envelope)) {
      return unavailable({
        authority,
        subject,
        proof_id: envelope.proof_id,
        diagnostic_code: "verification_proof_identity_mismatch",
      });
    }
    return projectApplicationResult({ authority, subject, verification });
  }

  return Object.freeze({
    authority,
    async check(request: ApplicationRunRequest): Promise<ApplicationProjectionResult> {
      assertRunRequest(request);
      const subject = cloneStructuredFrozen(request.subject);
      const requestedAt = safeNow({ now: readClock });

      let issuedChallenge: ApplicationChallenge;
      try {
        issuedChallenge = await issueChallenge({
          authority,
          subject,
          requested_at: requestedAt,
        });
        assertChallenge(issuedChallenge);
      } catch {
        return unavailable({
          authority,
          subject,
          diagnostic_code: "challenge_unavailable",
        });
      }
      const challenge = cloneStructuredFrozen(issuedChallenge);
      if (
        challenge.expires_at !== undefined
        && Date.parse(challenge.expires_at) <= Date.parse(requestedAt)
      ) {
        return unavailable({
          authority,
          subject,
          diagnostic_code: "challenge_expired",
        });
      }

      let signingKey: SigningKeyHandle;
      try {
        signingKey = await getSigningKey({ authority, subject });
      } catch {
        return unavailable({
          authority,
          subject,
          diagnostic_code: "signing_key_unavailable",
        });
      }

      let envelope: ApplicationProofEnvelope<ProofPayload>;
      try {
        const produced = await captureAndProve({
          authority,
          subject,
          challenge,
          signing_key: signingKey,
          requested_at: requestedAt,
        });
        assertProofEnvelope<ProofPayload>(produced);
        envelope = cloneStructuredFrozen(produced);
      } catch {
        return unavailable({
          authority,
          subject,
          diagnostic_code: "capture_or_proof_failed",
        });
      }
      const bindingDiagnostic = envelopeBindingDiagnostic({
        envelope,
        authority,
        subject,
        challenge_id: challenge.challenge_id,
      });
      if (bindingDiagnostic) {
        return unavailable({
          authority,
          subject,
          proof_id: envelope.proof_id,
          diagnostic_code: bindingDiagnostic,
        });
      }

      try {
        await saveProof(envelope);
      } catch {
        return unavailable({
          authority,
          subject,
          proof_id: envelope.proof_id,
          diagnostic_code: "proof_storage_failed",
        });
      }
      return projectEnvelope(envelope, subject);
    },
    async verify(proofId: string): Promise<ApplicationProjectionResult> {
      assertNonemptyString(proofId, "proof_id");
      let envelope: ApplicationProofEnvelope<ProofPayload> | null;
      try {
        envelope = await loadProof(proofId);
      } catch {
        throw new Error("The configured proof store could not be read.");
      }
      if (!envelope) {
        throw new Error(`No stored proof exists for ${proofId}.`);
      }
      try {
        assertProofEnvelope<ProofPayload>(envelope);
        envelope = cloneStructuredFrozen(envelope);
      } catch {
        throw new Error(`Stored proof ${proofId} has an invalid envelope.`);
      }
      if (envelope.proof_id !== proofId) {
        return unavailable({
          authority,
          subject: envelope.subject,
          proof_id: proofId,
          diagnostic_code: "stored_proof_identity_mismatch",
        });
      }
      return projectEnvelope(envelope, envelope.subject);
    },
    inspect(
      result: ApplicationProjectionResult,
      level: ApplicationInspectionLevel = "outcome",
    ): ApplicationInspectionView {
      return inspectApplicationResult(result, level);
    },
  });
}

export function createInMemoryApplicationProofStore<ProofPayload>(): ApplicationProofStore<ProofPayload> {
  const entries = new Map<string, ApplicationProofEnvelope<ProofPayload>>();
  return {
    async save(envelope) {
      assertProofEnvelope<ProofPayload>(envelope);
      if (entries.has(envelope.proof_id)) {
        throw new Error(`Proof ${envelope.proof_id} already exists.`);
      }
      entries.set(envelope.proof_id, cloneStructuredFrozen(envelope));
    },
    async load(proofId) {
      const stored = entries.get(proofId);
      return stored === undefined ? null : cloneStructuredFrozen(stored);
    },
  };
}
