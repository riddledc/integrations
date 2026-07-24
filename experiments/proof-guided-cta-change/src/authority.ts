import { isDeepStrictEqual } from "node:util";

import {
  normalizeRiddleProofProfile,
  resolveRiddleProofProfileTargetUrl,
} from "@riddledc/riddle-proof-core";

import {
  canonicalDigest,
  cloneJson,
  deepFreeze,
  sha256Bytes,
} from "./digest.js";
import {
  PROOF_GUIDED_CTA_CHANGE_AUTHORITY_VERSION,
  type CtaAttemptAuthority,
  type CtaCandidateResolution,
  type CtaResolvedCandidateScope,
  type PinnedCtaChangeContract,
  type ResolvedCtaCandidate,
} from "./types.js";

const SCOPE_KEYS = [
  "repository",
  "revision",
  "environment",
  "target",
] as const;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;

function nonempty(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${context} must be a non-empty string.`);
  }
  return value;
}

function exactKeys(
  value: unknown,
  expected: readonly string[],
  context: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${context} must be an object.`);
  }
  if (!isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort())) {
    throw new TypeError(`${context} may contain only ${expected.join(", ")}.`);
  }
}

function checkedScope(
  value: CtaResolvedCandidateScope,
): CtaResolvedCandidateScope {
  exactKeys(value, SCOPE_KEYS, "candidate.scope");
  const target = nonempty(value.target, "candidate.scope.target");
  try {
    new URL(target);
  } catch {
    throw new TypeError("candidate.scope.target must be an absolute URL.");
  }
  return {
    repository: nonempty(value.repository, "candidate.scope.repository"),
    revision: nonempty(value.revision, "candidate.scope.revision"),
    environment: nonempty(value.environment, "candidate.scope.environment"),
    target,
  };
}

export function assertCtaCandidateResolution(input: {
  candidate_ref: string;
  resolution: CtaCandidateResolution;
}): void {
  exactKeys(input.resolution, ["candidate_ref", "scope"], "candidate resolution");
  if (input.resolution.candidate_ref !== input.candidate_ref) {
    throw new TypeError("Resolved candidate_ref does not match the request.");
  }
  checkedScope(input.resolution.scope);
}

function proofAttempt(scope: CtaResolvedCandidateScope): string {
  return `cta_${canonicalDigest(scope).slice("sha256:".length)}`;
}

function canonicalProfile(sourceJson: string, target: string) {
  const parsed = JSON.parse(sourceJson) as unknown;
  const normalized = cloneJson(
    normalizeRiddleProofProfile(parsed, { url: target }),
  );
  const fixedPoint = cloneJson(
    normalizeRiddleProofProfile(normalized, { url: target }),
  );
  const confirmed = cloneJson(
    normalizeRiddleProofProfile(fixedPoint, { url: target }),
  );
  if (!isDeepStrictEqual(fixedPoint, confirmed)) {
    throw new TypeError(
      "Pinned CTA profile normalization did not reach a stable fixed point.",
    );
  }
  return fixedPoint;
}

export function createResolvedCtaCandidate(input: {
  contract: PinnedCtaChangeContract;
  candidate_ref: string;
  scope: CtaResolvedCandidateScope;
}): ResolvedCtaCandidate {
  const candidateRef = nonempty(input.candidate_ref, "candidate_ref");
  if (
    sha256Bytes(Buffer.from(input.contract.profile.source_json, "utf8"))
    !== input.contract.profile.source_digest
  ) {
    throw new TypeError("Pinned CTA profile source digest is invalid.");
  }
  const scope = checkedScope(input.scope);
  const normalized = canonicalProfile(
    input.contract.profile.source_json,
    scope.target,
  );
  if (
    normalized.name !== input.contract.profile.profile_name
    || resolveRiddleProofProfileTargetUrl(normalized) !== scope.target
  ) {
    throw new TypeError(
      "Pinned CTA profile does not resolve to the exact candidate target.",
    );
  }
  const semanticScope = {
    ...scope,
    proof_attempt: proofAttempt(scope),
  };
  const profileDigest = sha256Bytes(
    Buffer.from(JSON.stringify(normalized, null, 2), "utf8"),
  );
  const subject = {
    id: `${scope.repository}@${scope.revision}:${scope.target}`,
    digest: canonicalDigest({
      kind: "browser_cta_change",
      scope: semanticScope,
      profile_name: normalized.name,
      profile_digest: profileDigest,
    }),
    kind: "browser_cta_change" as const,
  };
  return deepFreeze({
    candidate_ref: candidateRef,
    subject,
    scope: semanticScope,
    profile: {
      profile_name: normalized.name,
      source_digest: input.contract.profile.source_digest,
      profile_digest: profileDigest,
      normalized_profile: cloneJson(normalized),
    },
  });
}

export function assertResolvedCtaCandidate(input: {
  contract: PinnedCtaChangeContract;
  candidate_ref: string;
  candidate: ResolvedCtaCandidate;
}): void {
  const recreated = createResolvedCtaCandidate({
    contract: input.contract,
    candidate_ref: input.candidate_ref,
    scope: {
      repository: input.candidate.scope.repository,
      revision: input.candidate.scope.revision,
      environment: input.candidate.scope.environment,
      target: input.candidate.scope.target,
    },
  });
  if (!isDeepStrictEqual(recreated, input.candidate)) {
    throw new TypeError("Resolved CTA candidate is not canonical.");
  }
}

export function deriveCtaAttemptAuthority(input: {
  contract: PinnedCtaChangeContract;
  candidate: ResolvedCtaCandidate;
}): CtaAttemptAuthority {
  assertResolvedCtaCandidate({
    contract: input.contract,
    candidate_ref: input.candidate.candidate_ref,
    candidate: input.candidate,
  });
  const expectedRoot = {
    ...input.contract.expected_root,
    parameters: {
      repository: input.candidate.scope.repository,
      revision: input.candidate.scope.revision,
      environment: input.candidate.scope.environment,
      target: input.candidate.scope.target,
      proof_attempt: input.candidate.scope.proof_attempt,
      profile_name: input.candidate.profile.profile_name,
      profile_digest: input.candidate.profile.profile_digest,
    },
  };
  const specification = {
    ref: {
      id: `${input.contract.id}.resolved-attempt`,
      version: input.contract.version,
      digest: canonicalDigest({
        contract_digest: input.contract.digest,
        subject: input.candidate.subject,
        expected_root: expectedRoot,
      }),
    },
    expected_root: expectedRoot,
    requirements: cloneJson(input.contract.requirements),
    non_conclusions: cloneJson(input.contract.non_conclusions),
  };
  return deepFreeze({
    authority_id: `${input.contract.id}.authority`,
    authority_version: PROOF_GUIDED_CTA_CHANGE_AUTHORITY_VERSION,
    authority_digest: canonicalDigest({
      authority_id: `${input.contract.id}.authority`,
      authority_version: PROOF_GUIDED_CTA_CHANGE_AUTHORITY_VERSION,
      contract_digest: input.contract.digest,
      subject: input.candidate.subject,
      specification,
    }),
    specification,
  });
}

export function ctaAuthorityRef(authority: CtaAttemptAuthority) {
  if (!SHA256.test(authority.authority_digest)) {
    throw new TypeError("CTA authority digest is invalid.");
  }
  return {
    authority_id: authority.authority_id,
    authority_version: authority.authority_version,
    authority_digest: authority.authority_digest,
  };
}
