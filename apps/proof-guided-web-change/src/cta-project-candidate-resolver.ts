import type {
  CtaLoopbackProofTargetAccess,
  ImmutableCtaLoopbackPreviewCandidate,
} from "./cta-specimen.js";
import {
  assertOwnedCtaLoopbackPreviewCandidate,
} from "./cta-specimen.js";

export const CTA_CHANGE_REPOSITORY =
  "urn:riddle-proof:synthetic:primary-cta-change";

export const CTA_CHANGE_ENVIRONMENT =
  "local-loopback-preview";

export interface FixedCtaChangeContractIdentity {
  id: string;
  version: string;
  digest: string;
  protocol_version: string;
}

export interface CtaProjectCandidateResolution {
  candidate_ref: string;
  scope: {
    repository: string;
    revision: string;
    environment: string;
    target: string;
  };
}

export interface CtaProjectCandidateResolverInput {
  candidate_ref: string;
  contract: FixedCtaChangeContractIdentity;
}

export interface CtaProjectCandidateResolver {
  register(candidate: ImmutableCtaLoopbackPreviewCandidate): void;
  getOwnedCandidate(
    candidateRef: string,
  ): ImmutableCtaLoopbackPreviewCandidate;
  resolve(
    input: CtaProjectCandidateResolverInput,
  ): Promise<CtaProjectCandidateResolution>;
  proofTransportFor(input: {
    candidate_ref: string;
    target: string;
  }): Promise<CtaLoopbackProofTargetAccess>;
}

function exactInput(
  value: unknown,
): asserts value is CtaProjectCandidateResolverInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(
      "CTA candidate resolution input must be an object.",
    );
  }
  const keys = Object.keys(value);
  if (
    keys.length !== 2
    || !keys.includes("candidate_ref")
    || !keys.includes("contract")
  ) {
    throw new TypeError(
      "CTA candidate resolution accepts only candidate_ref and the installed contract.",
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
  actual: FixedCtaChangeContractIdentity,
  expected: FixedCtaChangeContractIdentity,
): void {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    throw new TypeError(
      "The installed CTA-change contract is required.",
    );
  }
  for (const field of [
    "id",
    "version",
    "digest",
    "protocol_version",
  ] as const) {
    if (actual[field] !== expected[field]) {
      throw new Error(
        `The installed CTA-change contract changed at ${field}.`,
      );
    }
  }
}

function checkedPreviewUrl(candidate: {
  preview_url: string;
}): URL {
  const preview = new URL(
    nonempty(candidate.preview_url, "candidate.preview_url"),
  );
  const runToken = preview.searchParams.get("run");
  if (
    preview.protocol !== "http:"
    || preview.hostname !== "127.0.0.1"
    || preview.pathname !== "/"
    || preview.searchParams.size !== 1
    || typeof runToken !== "string"
    || !/^[A-Za-z0-9_-]{43}$/u.test(runToken)
    || preview.username !== ""
    || preview.password !== ""
    || preview.hash !== ""
  ) {
    throw new Error(
      "The CTA resolver accepts only exact app-owned loopback preview URLs.",
    );
  }
  return preview;
}

export function validateCtaProofTargetBinding(
  value: unknown,
): CtaLoopbackProofTargetAccess {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(
      "The CTA candidate returned invalid proof-target access.",
    );
  }
  const access = value as Partial<CtaLoopbackProofTargetAccess>;
  if (
    Object.keys(access).length !== 3
    || !Object.hasOwn(access, "binding_preview_url")
    || !Object.hasOwn(access, "target_url")
    || !Object.hasOwn(access, "extra_http_headers")
  ) {
    throw new TypeError(
      "CTA proof-target access must contain only its binding preview, target, and headers.",
    );
  }
  const preview = checkedPreviewUrl({
    preview_url: nonempty(
      access.binding_preview_url,
      "proof_target.binding_preview_url",
    ),
  });
  const runToken = preview.searchParams.get("run");
  const target = new URL(
    nonempty(access.target_url, "proof_target.target_url"),
  );
  const headers = access.extra_http_headers;
  if (
    target.protocol !== "http:"
    || target.hostname !== "127.0.0.1"
    || target.origin !== preview.origin
    || target.pathname !== "/"
    || target.search !== ""
    || target.hash !== ""
    || target.username !== ""
    || target.password !== ""
    || !headers
    || typeof headers !== "object"
    || Array.isArray(headers)
    || Object.getPrototypeOf(headers) !== Object.prototype
    || Object.keys(headers).length !== 1
    || typeof headers["x-riddle-preview-run"] !== "string"
    || headers["x-riddle-preview-run"] !== runToken
  ) {
    throw new Error(
      "The CTA resolver accepts only an app-owned token-free loopback proof target with one exact out-of-band run header.",
    );
  }
  return Object.freeze({
    binding_preview_url: preview.href,
    target_url: target.href,
    extra_http_headers: Object.freeze({
      "x-riddle-preview-run":
        headers["x-riddle-preview-run"],
    }),
  });
}

async function cloneResolution(
  candidate: ImmutableCtaLoopbackPreviewCandidate,
): Promise<CtaProjectCandidateResolution> {
  const proofTarget = validateCtaProofTargetBinding(
    await candidate.proofTargetAccess(),
  );
  return Object.freeze({
    candidate_ref: candidate.candidate_ref,
    scope: Object.freeze({
      repository: CTA_CHANGE_REPOSITORY,
      revision: candidate.revision,
      environment: CTA_CHANGE_ENVIRONMENT,
      target: proofTarget.target_url,
    }),
  });
}

export function createCtaProjectCandidateResolver(input: {
  expected_contract: FixedCtaChangeContractIdentity;
}): CtaProjectCandidateResolver {
  if (!input || typeof input !== "object") {
    throw new TypeError(
      "CTA resolver configuration must be an object.",
    );
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
  });
  const candidates = new Map<
    string,
    ImmutableCtaLoopbackPreviewCandidate
  >();

  return Object.freeze({
    register(
      candidate: ImmutableCtaLoopbackPreviewCandidate,
    ): void {
      if (!candidate || typeof candidate !== "object") {
        throw new TypeError(
          "An owned CTA loopback candidate is required.",
        );
      }
      assertOwnedCtaLoopbackPreviewCandidate(candidate);
      assertOpaqueCandidateRef(candidate.candidate_ref);
      if (candidates.has(candidate.candidate_ref)) {
        throw new Error(
          `Candidate ${candidate.candidate_ref} is already registered.`,
        );
      }
      checkedPreviewUrl(candidate);
      candidates.set(candidate.candidate_ref, candidate);
    },
    getOwnedCandidate(
      candidateRef: string,
    ): ImmutableCtaLoopbackPreviewCandidate {
      assertOpaqueCandidateRef(candidateRef);
      const candidate = candidates.get(candidateRef);
      if (!candidate) {
        throw new Error(
          `Unknown CTA candidate reference ${candidateRef}.`,
        );
      }
      return candidate;
    },
    async resolve(
      unsafeInput: CtaProjectCandidateResolverInput,
    ): Promise<CtaProjectCandidateResolution> {
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
        throw new Error(
          `Unknown CTA candidate reference ${candidateRef}.`,
        );
      }
      return cloneResolution(candidate);
    },
    async proofTransportFor(input: {
      candidate_ref: string;
      target: string;
    }): Promise<CtaLoopbackProofTargetAccess> {
      if (
        !input
        || typeof input !== "object"
        || Array.isArray(input)
        || Object.keys(input).length !== 2
        || !Object.hasOwn(input, "candidate_ref")
        || !Object.hasOwn(input, "target")
      ) {
        throw new TypeError(
          "CTA proof transport accepts only candidate_ref and target.",
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
        throw new Error(
          `Unknown CTA candidate reference ${candidateRef}.`,
        );
      }
      const access = validateCtaProofTargetBinding(
        await candidate.proofTargetAccess(),
      );
      if (access.target_url !== expectedTarget) {
        throw new Error(
          "The requested CTA proof target does not match the resolved target.",
        );
      }
      return access;
    },
  });
}
