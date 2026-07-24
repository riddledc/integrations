import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import {
  normalizeRiddleProofProfile,
  resolveRiddleProofProfileTargetUrl,
} from "@riddledc/riddle-proof-core";

import { canonicalWebChangeDigest } from "./contract.js";
import {
  PROOF_GUIDED_WEB_CHANGE_AUTHORITY_VERSION,
  type PinnedWebChangeContract,
  type ResolvedWebChangeCandidate,
  type WebChangeAttemptAuthority,
  type WebChangeAttemptAuthorityRef,
  type WebChangeCandidateResolution,
  type WebChangeProfileRole,
  type WebChangeResolvedCandidateScope,
  type WebChangeResolvedProfile,
  type WebChangeSemanticScope,
} from "./types.js";

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const PROFILE_ROLES = [
  "before",
  "action",
  "reload",
  "fresh_context",
] as const satisfies readonly WebChangeProfileRole[];
const RESOLUTION_KEYS = ["candidate_ref", "scope"] as const;
const RESOLVED_SCOPE_KEYS = [
  "repository",
  "revision",
  "environment",
  "target",
] as const;

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

function utf8Digest(value: string): string {
  return `sha256:${createHash("sha256").update(
    Buffer.from(value, "utf8"),
  ).digest("hex")}`;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const member of Object.values(value)) {
      deepFreeze(member);
    }
  }
  return value;
}

function exactObjectKeys(
  value: unknown,
  expectedKeys: readonly string[],
  context: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${context} must be an object.`);
  }
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (!isDeepStrictEqual(keys, expected)) {
    throw new TypeError(
      `${context} may contain only ${expectedKeys.join(", ")}.`,
    );
  }
}

function checkedResolvedScope(
  value: WebChangeResolvedCandidateScope,
): WebChangeResolvedCandidateScope {
  exactObjectKeys(value, RESOLVED_SCOPE_KEYS, "candidate.scope");
  return {
    repository: nonempty(value.repository, "candidate.scope.repository"),
    revision: nonempty(value.revision, "candidate.scope.revision"),
    environment: nonempty(value.environment, "candidate.scope.environment"),
    target: nonempty(value.target, "candidate.scope.target"),
  };
}

/**
 * Rejects both missing identity and resolver authority expansion. In
 * particular, a resolver cannot smuggle profiles, profile digests, a subject,
 * or a caller-selected proof_attempt into its result.
 */
export function assertWebChangeCandidateResolution(input: {
  candidate_ref: string;
  resolution: WebChangeCandidateResolution;
}): void {
  exactObjectKeys(
    input.resolution,
    RESOLUTION_KEYS,
    "candidate resolution",
  );
  const requested = nonempty(input.candidate_ref, "candidate_ref");
  if (input.resolution.candidate_ref !== requested) {
    throw new TypeError(
      "Resolved candidate_ref does not match the requested opaque reference.",
    );
  }
  checkedResolvedScope(input.resolution.scope);
}

function semanticScope(
  contract: PinnedWebChangeContract,
  scope: WebChangeResolvedCandidateScope,
): WebChangeSemanticScope {
  const checked = checkedResolvedScope(scope);
  return {
    ...checked,
    proof_attempt: contract.transition_id,
  };
}

function checkedProfiles(
  contract: PinnedWebChangeContract,
  target: string,
): Readonly<Record<WebChangeProfileRole, WebChangeResolvedProfile>> {
  const checked = Object.fromEntries(PROFILE_ROLES.map((role) => {
    const pinned = contract.profiles[role];
    if (!pinned) {
      throw new TypeError(`contract.profiles.${role} is required.`);
    }
    const profileName = nonempty(
      pinned.profile_name,
      `contract.profiles.${role}.profile_name`,
    );
    const claimedSourceDigest = fullDigest(
      pinned.source_digest,
      `contract.profiles.${role}.source_digest`,
    );
    if (utf8Digest(pinned.source_json) !== claimedSourceDigest) {
      throw new TypeError(
        `contract.profiles.${role}.source_digest does not match the exact pinned profile JSON bytes.`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(pinned.source_json);
    } catch {
      throw new TypeError(
        `contract.profiles.${role}.source_json must be valid JSON.`,
      );
    }
    const normalizedProfile = normalizeRiddleProofProfile(parsed, {
      url: target,
    });
    if (normalizedProfile.name !== profileName) {
      throw new TypeError(
        `contract.profiles.${role}.profile_name does not match its normalized profile.`,
      );
    }
    if (resolveRiddleProofProfileTargetUrl(normalizedProfile) !== target) {
      throw new TypeError(
        `contract.profiles.${role} does not resolve to the exact independently resolved target.`,
      );
    }
    const canonicalNormalizedProfile = cloneJson(normalizedProfile);
    return [role, {
      profile_name: profileName,
      source_digest: claimedSourceDigest,
      profile_digest: utf8Digest(
        JSON.stringify(canonicalNormalizedProfile, null, 2),
      ),
      normalized_profile: canonicalNormalizedProfile,
    }];
  })) as unknown as Readonly<
    Record<WebChangeProfileRole, WebChangeResolvedProfile>
  >;

  if (
    new Set(
      PROFILE_ROLES.map((role) => checked[role].profile_digest),
    ).size !== PROFILE_ROLES.length
  ) {
    throw new TypeError(
      "Resolved before, action, reload, and fresh-context profile digests must be distinct.",
    );
  }
  return checked;
}

function profileRefs(
  profiles: Readonly<Record<WebChangeProfileRole, WebChangeResolvedProfile>>,
) {
  return Object.fromEntries(PROFILE_ROLES.map((role) => {
    const profile = profiles[role];
    return [role, {
      profile_name: profile.profile_name,
      source_digest: profile.source_digest,
      profile_digest: profile.profile_digest,
    }];
  }));
}

function subjectId(scope: WebChangeSemanticScope): string {
  return `${scope.repository}@${scope.revision}:${scope.target}`;
}

function subjectDigest(input: {
  scope: WebChangeSemanticScope;
  profiles: Readonly<
    Record<WebChangeProfileRole, WebChangeResolvedProfile>
  >;
}): string {
  return canonicalWebChangeDigest({
    kind: "browser_target_transition",
    scope: input.scope,
    profiles: profileRefs(input.profiles),
  });
}

/**
 * Trusted client helper. The independently resolved scope is the only
 * candidate-specific input; exact profiles, their normalized digests, the
 * proof-attempt identity, and the canonical subject all come from the pinned
 * contract inside this function.
 */
export function createResolvedWebChangeCandidate(input: {
  contract: PinnedWebChangeContract;
  candidate_ref: string;
  scope: WebChangeResolvedCandidateScope;
}): ResolvedWebChangeCandidate {
  const candidateRef = nonempty(input.candidate_ref, "candidate_ref");
  const scope = semanticScope(input.contract, input.scope);
  const profiles = checkedProfiles(input.contract, scope.target);
  return deepFreeze({
    candidate_ref: candidateRef,
    subject: {
      id: subjectId(scope),
      digest: subjectDigest({ scope, profiles }),
      kind: "browser_target_transition",
    },
    scope,
    profiles,
  });
}

export function assertResolvedWebChangeCandidate(input: {
  contract: PinnedWebChangeContract;
  candidate_ref: string;
  candidate: ResolvedWebChangeCandidate;
}): void {
  if (input.candidate.candidate_ref !== input.candidate_ref) {
    throw new TypeError(
      "Resolved candidate_ref does not match the requested opaque reference.",
    );
  }
  const recreated = createResolvedWebChangeCandidate({
    contract: input.contract,
    candidate_ref: input.candidate.candidate_ref,
    scope: {
      repository: input.candidate.scope.repository,
      revision: input.candidate.scope.revision,
      environment: input.candidate.scope.environment,
      target: input.candidate.scope.target,
    },
  });
  if (!isDeepStrictEqual(recreated, input.candidate)) {
    throw new TypeError(
      "Resolved candidate is not the canonical identity of its exact scope and pinned profiles.",
    );
  }
}

function expectedRootParameters(candidate: ResolvedWebChangeCandidate) {
  return {
    repository: candidate.scope.repository,
    revision: candidate.scope.revision,
    environment: candidate.scope.environment,
    target: candidate.scope.target,
    proof_attempt: candidate.scope.proof_attempt,
    transition_id: candidate.scope.proof_attempt,
    before_profile_name: candidate.profiles.before.profile_name,
    before_profile_digest: candidate.profiles.before.profile_digest,
    action_profile_name: candidate.profiles.action.profile_name,
    action_profile_digest: candidate.profiles.action.profile_digest,
    reload_profile_name: candidate.profiles.reload.profile_name,
    reload_profile_digest: candidate.profiles.reload.profile_digest,
    fresh_profile_name: candidate.profiles.fresh_context.profile_name,
    fresh_profile_digest: candidate.profiles.fresh_context.profile_digest,
  };
}

/**
 * Deterministically derives one attempt authority from the stable contract and
 * exact independently resolved candidate. No clock, nonce, key, or caller prose
 * participates in this derivation.
 */
export function deriveWebChangeAttemptAuthority(input: {
  contract: PinnedWebChangeContract;
  candidate: ResolvedWebChangeCandidate;
}): WebChangeAttemptAuthority {
  assertResolvedWebChangeCandidate({
    contract: input.contract,
    candidate_ref: input.candidate.candidate_ref,
    candidate: input.candidate,
  });
  const expectedRoot = {
    ...input.contract.expected_root,
    parameters: expectedRootParameters(input.candidate),
  };
  const specificationRef = {
    id: `${input.contract.id}.resolved-attempt`,
    version: input.contract.version,
    digest: canonicalWebChangeDigest({
      contract: {
        id: input.contract.id,
        version: input.contract.version,
        digest: input.contract.digest,
      },
      subject: input.candidate.subject,
      expected_root: expectedRoot,
    }),
  };
  const specification = {
    ref: specificationRef,
    expected_root: expectedRoot,
    requirements: cloneJson(input.contract.requirements),
    non_conclusions: cloneJson(input.contract.non_conclusions),
  };
  const authority: WebChangeAttemptAuthority = {
    authority_id: `${input.contract.id}.authority`,
    authority_version: PROOF_GUIDED_WEB_CHANGE_AUTHORITY_VERSION,
    authority_digest: canonicalWebChangeDigest({
      authority_id: `${input.contract.id}.authority`,
      authority_version: PROOF_GUIDED_WEB_CHANGE_AUTHORITY_VERSION,
      contract_digest: input.contract.digest,
      subject: input.candidate.subject,
      specification,
    }),
    specification,
  };
  return deepFreeze(authority);
}

export function webChangeAttemptAuthorityRef(
  authority: WebChangeAttemptAuthority,
): WebChangeAttemptAuthorityRef {
  return {
    authority_id: authority.authority_id,
    authority_version: authority.authority_version,
    authority_digest: authority.authority_digest,
  };
}
