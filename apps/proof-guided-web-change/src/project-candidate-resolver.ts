import type {
  ImmutableLoopbackPreviewCandidate,
  LoopbackProofTargetAccess,
} from "./specimen.js";

export const DURABLE_SETTING_REPOSITORY =
  "urn:riddle-proof:synthetic:durable-setting-repair";

export const DURABLE_SETTING_ENVIRONMENT =
  "local-loopback-preview";

export interface FixedWebChangeContractIdentity {
  id: string;
  version: string;
  digest: string;
  protocol_version: string;
  transition_id: string;
}

export interface ProjectCandidateResolution {
  candidate_ref: string;
  scope: {
    repository: string;
    revision: string;
    environment: string;
    target: string;
  };
}

export interface ProjectCandidateResolverInput {
  candidate_ref: string;
  contract: FixedWebChangeContractIdentity;
}

export interface ProjectCandidateResolver {
  register(candidate: ImmutableLoopbackPreviewCandidate): void;
  getOwnedCandidate(
    candidateRef: string,
  ): ImmutableLoopbackPreviewCandidate;
  resolve(
    input: ProjectCandidateResolverInput,
  ): Promise<ProjectCandidateResolution>;
  proofTransportFor(input: {
    candidate_ref: string;
    target: string;
  }): Promise<LoopbackProofTargetAccess>;
}

function exactInput(
  value: unknown,
): asserts value is ProjectCandidateResolverInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Candidate resolution input must be an object.");
  }
  const keys = Object.keys(value);
  if (
    keys.length !== 2
    || !keys.includes("candidate_ref")
    || !keys.includes("contract")
  ) {
    throw new TypeError(
      "Candidate resolution accepts only candidate_ref and the installed contract.",
    );
  }
}

function nonempty(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${context} must be a non-empty string.`);
  }
  return value;
}

function assertOpaqueCandidateRef(candidateRef: string): void {
  if (!/^candidate_[0-9]{4}$/u.test(candidateRef)) {
    throw new TypeError(
      "candidate_ref must be an app-issued opaque candidate reference.",
    );
  }
}

function assertContractIdentity(
  actual: FixedWebChangeContractIdentity,
  expected: FixedWebChangeContractIdentity,
): void {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    throw new TypeError("The installed web-change contract is required.");
  }
  for (const field of [
    "id",
    "version",
    "digest",
    "protocol_version",
    "transition_id",
  ] as const) {
    if (actual[field] !== expected[field]) {
      throw new Error(
        `The installed web-change contract changed at ${field}.`,
      );
    }
  }
}

async function cloneResolution(
  candidate: ImmutableLoopbackPreviewCandidate,
): Promise<ProjectCandidateResolution> {
  const proofTarget = await candidate.proofTargetAccess();
  return Object.freeze({
    candidate_ref: candidate.candidate_ref,
    scope: Object.freeze({
      repository: DURABLE_SETTING_REPOSITORY,
      revision: candidate.revision,
      environment: DURABLE_SETTING_ENVIRONMENT,
      target: proofTarget.target_url,
    }),
  });
}

/**
 * Owns candidate-to-scope resolution for this application.
 *
 * Ordinary callers can name only an app-issued opaque reference. Repository,
 * revision, environment, target, source identity, and contract identity are
 * never accepted from the caller.
 */
export function createProjectCandidateResolver(input: {
  expected_contract: FixedWebChangeContractIdentity;
}): ProjectCandidateResolver {
  if (!input || typeof input !== "object") {
    throw new TypeError("Resolver configuration must be an object.");
  }
  const expectedContract = Object.freeze({
    id: nonempty(input.expected_contract.id, "contract.id"),
    version: nonempty(
      input.expected_contract.version,
      "contract.version",
    ),
    digest: nonempty(
      input.expected_contract.digest,
      "contract.digest",
    ),
    protocol_version: nonempty(
      input.expected_contract.protocol_version,
      "contract.protocol_version",
    ),
    transition_id: nonempty(
      input.expected_contract.transition_id,
      "contract.transition_id",
    ),
  });
  const candidates = new Map<
    string,
    ImmutableLoopbackPreviewCandidate
  >();

  return Object.freeze({
    register(candidate: ImmutableLoopbackPreviewCandidate): void {
      if (!candidate || typeof candidate !== "object") {
        throw new TypeError("A loopback preview candidate is required.");
      }
      assertOpaqueCandidateRef(candidate.candidate_ref);
      if (candidates.has(candidate.candidate_ref)) {
        throw new Error(
          `Candidate ${candidate.candidate_ref} is already registered.`,
        );
      }
      const target = new URL(candidate.preview_url);
      if (
        target.protocol !== "http:"
        || target.hostname !== "127.0.0.1"
      ) {
        throw new Error(
          "The project resolver accepts only owned loopback candidates.",
        );
      }
      candidates.set(candidate.candidate_ref, candidate);
    },
    getOwnedCandidate(
      candidateRef: string,
    ): ImmutableLoopbackPreviewCandidate {
      assertOpaqueCandidateRef(candidateRef);
      const candidate = candidates.get(candidateRef);
      if (!candidate) {
        throw new Error(`Unknown candidate reference ${candidateRef}.`);
      }
      return candidate;
    },
    async resolve(
      unsafeInput: ProjectCandidateResolverInput,
    ): Promise<ProjectCandidateResolution> {
      exactInput(unsafeInput);
      const candidateRef = nonempty(
        unsafeInput.candidate_ref,
        "candidate_ref",
      );
      assertOpaqueCandidateRef(candidateRef);
      assertContractIdentity(
        unsafeInput.contract,
        expectedContract,
      );
      const candidate = candidates.get(candidateRef);
      if (!candidate) {
        throw new Error(`Unknown candidate reference ${candidateRef}.`);
      }
      return cloneResolution(candidate);
    },
    async proofTransportFor(input: {
      candidate_ref: string;
      target: string;
    }): Promise<LoopbackProofTargetAccess> {
      if (
        !input
        || typeof input !== "object"
        || Array.isArray(input)
        || Object.keys(input).length !== 2
        || !Object.hasOwn(input, "candidate_ref")
        || !Object.hasOwn(input, "target")
      ) {
        throw new TypeError(
          "Proof transport input accepts only candidate_ref and target.",
        );
      }
      const candidateRef = nonempty(
        input.candidate_ref,
        "candidate_ref",
      );
      assertOpaqueCandidateRef(candidateRef);
      const expectedTarget = nonempty(input.target, "target");
      const candidate = candidates.get(candidateRef);
      if (!candidate) {
        throw new Error(`Unknown candidate reference ${candidateRef}.`);
      }
      const transport = await candidate.proofTargetAccess();
      if (transport.target_url !== expectedTarget) {
        throw new Error(
          "The requested proof transport does not match the resolved target.",
        );
      }
      return transport;
    },
  });
}
