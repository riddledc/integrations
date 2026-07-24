import { isDeepStrictEqual } from "node:util";

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
  type RiddleProofCheckedMeaningClosure,
  type RiddleProofCheckedMeaningRuleDefinition,
  type RiddleProofCheckedMeaningRuleRef,
  type RiddleProofCheckedMeaningRuleRegistration,
  type RiddleProofGroundedCaptureVerificationPolicy,
  type RiddleProofGroundedDeclarativeJsonContractDefinition,
  type RiddleProofGroundedReplayContext,
  type RiddleProofGroundedTrustedSigner,
  type RiddleProofSemanticClaim,
  type RiddleProofSemanticScope,
  type RiddleProofSignedCaptureBundle,
} from "@riddledc/riddle-proof-core";
import {
  RIDDLE_PROOF_BROWSER_NORMALIZED_PROFILE_ARTIFACT,
  RIDDLE_PROOF_BROWSER_SEALED_OBSERVATION_VERSION,
  createRiddleProofBrowserSealedObservationVerifier,
} from "@riddledc/riddle-proof-runner-playwright";

export const RIDDLE_PROOF_BROWSER_CHECK_REPORT_PROTOCOL_VERSION =
  "riddle-proof.browser-transition-check-report.v1" as const;

export const RIDDLE_PROOF_BROWSER_CHECK_REPORT_OBSERVATION_VERSION =
  RIDDLE_PROOF_BROWSER_SEALED_OBSERVATION_VERSION;

export const RIDDLE_PROOF_BROWSER_CHECK_REPORT_RULE_MAX_AGE_MS =
  30 * 60 * 1000;

export const RIDDLE_PROOF_BROWSER_CHECK_REPORT_STATUSES = [
  "passed",
  "product_regression",
  "proof_insufficient",
  "environment_blocked",
] as const;

export type RiddleProofBrowserCheckReportStatus =
  (typeof RIDDLE_PROOF_BROWSER_CHECK_REPORT_STATUSES)[number];

export const RIDDLE_PROOF_BROWSER_CHECK_REPORT_ROLES = [
  "before",
  "action",
  "reload",
  "fresh_context",
] as const;

export type RiddleProofBrowserCheckReportRole =
  (typeof RIDDLE_PROOF_BROWSER_CHECK_REPORT_ROLES)[number];

export type RiddleProofBrowserCheckReportStatuses = Record<
  RiddleProofBrowserCheckReportRole,
  RiddleProofBrowserCheckReportStatus
>;

export type RiddleProofBrowserCheckReportProfile = {
  profile_name: string;
  profile_digest: string;
};

export type RiddleProofBrowserCheckReportProfiles = Record<
  RiddleProofBrowserCheckReportRole,
  RiddleProofBrowserCheckReportProfile
>;

export type RiddleProofBrowserCheckReportAuthority = {
  policy: RiddleProofGroundedCaptureVerificationPolicy;
  trusted_signers: [
    RiddleProofGroundedTrustedSigner,
    ...RiddleProofGroundedTrustedSigner[],
  ];
};

export type RiddleProofBrowserCheckReportAuthorities = Record<
  RiddleProofBrowserCheckReportRole,
  RiddleProofBrowserCheckReportAuthority
>;

export type RiddleProofBrowserCheckReportBundles = Record<
  RiddleProofBrowserCheckReportRole,
  RiddleProofSignedCaptureBundle
>;

export const RIDDLE_PROOF_BROWSER_CHECK_REPORT_CLAIMS = {
  capture_bound_to_profile: {
    claim_id: "riddle-proof.browser.check-report-capture-bound-to-profile",
    claim_version: "1",
  },
  profile_status_reassessed: {
    claim_id: "riddle-proof.browser.profile-status-reassessed",
    claim_version: "1",
  },
  profile_check_report: {
    claim_id: "riddle-proof.browser.profile-check-report",
    claim_version: "1",
  },
  transition_check_report: {
    claim_id: "riddle-proof.browser.transition-check-report",
    claim_version: "1",
  },
} as const;

export const RIDDLE_PROOF_BROWSER_CHECK_REPORT_REQUIREMENTS = {
  declared_transition_observed: "declared_transition_observed",
  transition_survived_reload: "transition_survived_reload",
  transition_visible_in_fresh_context:
    "transition_visible_in_fresh_context",
} as const;

export type RiddleProofBrowserCheckReportRequirementStatus =
  | "satisfied"
  | "failed"
  | "unresolved";

export type RiddleProofBrowserCheckReportRequirement = {
  status: RiddleProofBrowserCheckReportRequirementStatus;
  role_certificate_ids: string[];
};

export type RiddleProofBrowserCheckReportRequirements = Record<
  (typeof RIDDLE_PROOF_BROWSER_CHECK_REPORT_REQUIREMENTS)[keyof typeof RIDDLE_PROOF_BROWSER_CHECK_REPORT_REQUIREMENTS],
  RiddleProofBrowserCheckReportRequirement
>;

export type RiddleProofBrowserCheckReportError = {
  code: "browser_check_report_invalid";
  stage: string;
  message: string;
  cause?: unknown;
};

type BuiltContract = Extract<
  ReturnType<typeof createRiddleProofGroundedDeclarativeJsonContract>,
  { ok: true }
>;

type BuiltRule = Extract<
  ReturnType<typeof createRiddleProofCheckedMeaningRule>,
  { ok: true }
>;

type BuiltVerifier = ReturnType<
  typeof createRiddleProofBrowserCheckReportObservationVerifier
>;

type RoleParameters = {
  repository: string;
  revision: string;
  environment: string;
  target: string;
  proof_attempt: string;
  transition_id: string;
  role: RiddleProofBrowserCheckReportRole;
  profile_name: string;
  profile_digest: string;
  status: RiddleProofBrowserCheckReportStatus;
};

const SCOPE_PARAMETER_NAMES = [
  "repository",
  "revision",
  "environment",
  "target",
  "proof_attempt",
] as const;

const ROLE_PARAMETER_NAMES = [
  ...SCOPE_PARAMETER_NAMES,
  "transition_id",
  "role",
  "profile_name",
  "profile_digest",
  "status",
] as const;

const NORMALIZED_PROFILE_ARTIFACT = {
  ...RIDDLE_PROOF_BROWSER_NORMALIZED_PROFILE_ARTIFACT,
} as const;

function failure(stage: string, cause: unknown): {
  ok: false;
  error: RiddleProofBrowserCheckReportError;
} {
  const message = (() => {
    if (cause && typeof cause === "object" && "error" in cause) {
      const nested = (cause as { error?: { message?: unknown } }).error;
      if (typeof nested?.message === "string") return nested.message;
    }
    if (cause instanceof Error) return cause.message;
    return `Browser check report failed at ${stage}.`;
  })();
  return {
    ok: false,
    error: {
      code: "browser_check_report_invalid",
      stage,
      message,
      cause,
    },
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sameJsonData(left: unknown, right: unknown): boolean {
  try {
    return isDeepStrictEqual(
      JSON.parse(JSON.stringify(left)),
      JSON.parse(JSON.stringify(right)),
    );
  } catch {
    return false;
  }
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function fullSha256(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function browserCheckReportStatus(
  value: unknown,
): RiddleProofBrowserCheckReportStatus | undefined {
  return RIDDLE_PROOF_BROWSER_CHECK_REPORT_STATUSES.find(
    (status) => status === value,
  );
}

/**
 * The report and the passed-only sealed proof intentionally use the same
 * shared verifier identity. One signed capture can therefore establish a
 * negative check report or, when its reassessed status is passed, participate
 * in the existing durable-transition proof without recapture.
 */
export function createRiddleProofBrowserCheckReportObservationVerifier() {
  return createRiddleProofBrowserSealedObservationVerifier();
}

function scopeParameters(scope: RiddleProofSemanticScope) {
  return {
    repository: scope.repository,
    revision: scope.revision,
    environment: scope.environment,
    target: scope.target,
    proof_attempt: scope.proof_attempt,
  };
}

function roleParameters(input: {
  scope: RiddleProofSemanticScope;
  transition_id: string;
  role: RiddleProofBrowserCheckReportRole;
  profile: RiddleProofBrowserCheckReportProfile;
  status: RiddleProofBrowserCheckReportStatus;
}): RoleParameters {
  return {
    ...scopeParameters(input.scope),
    transition_id: input.transition_id,
    role: input.role,
    profile_name: input.profile.profile_name,
    profile_digest: input.profile.profile_digest,
    status: input.status,
  };
}

function claimFor(
  reference: (typeof RIDDLE_PROOF_BROWSER_CHECK_REPORT_CLAIMS)[
    keyof typeof RIDDLE_PROOF_BROWSER_CHECK_REPORT_CLAIMS
  ],
  label: string,
  parameters: Record<string, string>,
): RiddleProofSemanticClaim {
  return { ...reference, label, parameters };
}

function roleContractDefinitions(input: {
  scope: RiddleProofSemanticScope;
  transition_id: string;
  role: RiddleProofBrowserCheckReportRole;
  profile: RiddleProofBrowserCheckReportProfile;
  status: RiddleProofBrowserCheckReportStatus;
}): {
  capture_bound_to_profile: RiddleProofGroundedDeclarativeJsonContractDefinition;
  profile_status_reassessed: RiddleProofGroundedDeclarativeJsonContractDefinition;
} {
  const parameters = roleParameters(input);
  const contractSuffix = input.role.replaceAll("_", "-");
  return {
    capture_bound_to_profile: {
      contract_id: `riddle-proof.browser.check-report-capture-bound-to-profile.${contractSuffix}`,
      contract_version: "1",
      label: `Bind the signed ${input.role} browser capture to the exact scope and profile`,
      claim: claimFor(
        RIDDLE_PROOF_BROWSER_CHECK_REPORT_CLAIMS.capture_bound_to_profile,
        `The signed ${input.role} browser capture is bound to this exact scope and profile`,
        parameters,
      ),
      program: {
        all: [
          {
            op: "equals",
            source: "scope",
            pointer: "/repository",
            value: input.scope.repository,
          },
          {
            op: "equals",
            source: "scope",
            pointer: "/revision",
            value: input.scope.revision,
          },
          {
            op: "equals",
            source: "scope",
            pointer: "/environment",
            value: input.scope.environment,
          },
          {
            op: "equals",
            source: "scope",
            pointer: "/target",
            value: input.scope.target,
          },
          {
            op: "equals",
            source: "scope",
            pointer: "/proof_attempt",
            value: input.scope.proof_attempt,
          },
          {
            op: "equals",
            source: "observation",
            pointer: "/version",
            value: RIDDLE_PROOF_BROWSER_CHECK_REPORT_OBSERVATION_VERSION,
          },
          {
            op: "equals",
            source: "observation",
            pointer: "/normalized_profile_artifact/artifact_id",
            value: NORMALIZED_PROFILE_ARTIFACT.artifact_id,
          },
          {
            op: "equals",
            source: "observation",
            pointer: "/normalized_profile_artifact/artifact_digest",
            value: input.profile.profile_digest,
          },
          {
            op: "equals",
            source: "observation",
            pointer: "/profile_result/profile_name",
            value: input.profile.profile_name,
          },
        ],
      },
    },
    profile_status_reassessed: {
      contract_id: `riddle-proof.browser.profile-status-reassessed.${contractSuffix}`,
      contract_version: "1",
      label: `Require the ${input.role} browser result to equal deterministic reassessment`,
      claim: claimFor(
        RIDDLE_PROOF_BROWSER_CHECK_REPORT_CLAIMS.profile_status_reassessed,
        `The ${input.role} browser result was independently reassessed as ${input.status}`,
        parameters,
      ),
      program: {
        all: [
          {
            op: "equals",
            source: "observation",
            pointer: "/profile_result/profile_name",
            value: input.profile.profile_name,
          },
          {
            op: "equals",
            source: "observation",
            pointer: "/profile_result/status",
            value: input.status,
          },
          {
            op: "equals",
            source: "observation",
            pointer: "/reassessed_status",
            value: input.status,
          },
          {
            op: "type_is",
            source: "observation",
            pointer: "/profile_result/checks",
            type: "array",
          },
        ],
      },
    },
  };
}

function anyParameters(names: readonly string[]) {
  return Object.fromEntries(
    names.map((name) => [name, { op: "any" as const }]),
  );
}

function projectedParameters(names: readonly string[], premiseIndex: number) {
  return Object.fromEntries(
    names.map((name) => [
      name,
      {
        op: "from_premise" as const,
        premise_index: premiseIndex,
        parameter: name,
      },
    ]),
  );
}

function allPremiseEqualities(
  names: readonly string[],
  premiseCount: number,
): NonNullable<
  RiddleProofCheckedMeaningRuleDefinition["constraints"]["parameter_equalities"]
> {
  return names.map((parameter) => ({
    members: Array.from({ length: premiseCount }, (_, premiseIndex) => ({
      premise_index: premiseIndex,
      parameter,
    })) as [
      { premise_index: number; parameter: string },
      { premise_index: number; parameter: string },
      ...Array<{ premise_index: number; parameter: string }>,
    ],
  })) as [
    {
      members: [
        { premise_index: number; parameter: string },
        { premise_index: number; parameter: string },
        ...Array<{ premise_index: number; parameter: string }>,
      ];
    },
    ...Array<{
      members: [
        { premise_index: number; parameter: string },
        { premise_index: number; parameter: string },
        ...Array<{ premise_index: number; parameter: string }>,
      ];
    }>,
  ];
}

function createRoleReportRule(input: {
  role: RiddleProofBrowserCheckReportRole;
}) {
  const suffix = input.role.replaceAll("_", "-");
  return createRiddleProofCheckedMeaningRule({
    definition: {
      rule_id: `riddle-proof.browser.profile-check-report.${suffix}`,
      rule_version: "1",
      label: `Combine exact ${input.role} capture identity with its deterministic status reassessment`,
      premises: [
        {
          ...RIDDLE_PROOF_BROWSER_CHECK_REPORT_CLAIMS.capture_bound_to_profile,
          parameters: anyParameters(ROLE_PARAMETER_NAMES),
        },
        {
          ...RIDDLE_PROOF_BROWSER_CHECK_REPORT_CLAIMS.profile_status_reassessed,
          parameters: anyParameters(ROLE_PARAMETER_NAMES),
        },
      ],
      conclusion: {
        ...RIDDLE_PROOF_BROWSER_CHECK_REPORT_CLAIMS.profile_check_report,
        label: `The exact ${input.role} browser profile has a replayable check report`,
        parameters: projectedParameters(ROLE_PARAMETER_NAMES, 0),
      },
      constraints: {
        all_of: true,
        parameter_equalities: allPremiseEqualities(ROLE_PARAMETER_NAMES, 2),
        ordered_premise_chronology: true,
        max_age_ms: RIDDLE_PROOF_BROWSER_CHECK_REPORT_RULE_MAX_AGE_MS,
      },
    } satisfies RiddleProofCheckedMeaningRuleDefinition,
  });
}

function expectedRootParameters(input: {
  scope: RiddleProofSemanticScope;
  transition_id: string;
  profiles: RiddleProofBrowserCheckReportProfiles;
  statuses: RiddleProofBrowserCheckReportStatuses;
}) {
  return {
    ...scopeParameters(input.scope),
    transition_id: input.transition_id,
    before_profile_name: input.profiles.before.profile_name,
    before_profile_digest: input.profiles.before.profile_digest,
    before_status: input.statuses.before,
    action_profile_name: input.profiles.action.profile_name,
    action_profile_digest: input.profiles.action.profile_digest,
    action_status: input.statuses.action,
    reload_profile_name: input.profiles.reload.profile_name,
    reload_profile_digest: input.profiles.reload.profile_digest,
    reload_status: input.statuses.reload,
    fresh_context_profile_name: input.profiles.fresh_context.profile_name,
    fresh_context_profile_digest:
      input.profiles.fresh_context.profile_digest,
    fresh_context_status: input.statuses.fresh_context,
  };
}

function roleReportPremise(input: {
  role: RiddleProofBrowserCheckReportRole;
  profile: RiddleProofBrowserCheckReportProfile;
  status: RiddleProofBrowserCheckReportStatus;
}) {
  return {
    ...RIDDLE_PROOF_BROWSER_CHECK_REPORT_CLAIMS.profile_check_report,
    parameters: {
      ...anyParameters([...SCOPE_PARAMETER_NAMES, "transition_id"]),
      role: { op: "equals" as const, value: input.role },
      profile_name: {
        op: "equals" as const,
        value: input.profile.profile_name,
      },
      profile_digest: {
        op: "equals" as const,
        value: input.profile.profile_digest,
      },
      status: { op: "equals" as const, value: input.status },
    },
  };
}

function createTransitionReportRule(input: {
  transition_id: string;
  profiles: RiddleProofBrowserCheckReportProfiles;
  statuses: RiddleProofBrowserCheckReportStatuses;
}) {
  return createRiddleProofCheckedMeaningRule({
    definition: {
      rule_id: "riddle-proof.browser.transition-check-report",
      rule_version: "1",
      label:
        "Combine the four exact browser checkpoint reports into one transition status report",
      premises: RIDDLE_PROOF_BROWSER_CHECK_REPORT_ROLES.map((role) =>
        roleReportPremise({
          role,
          profile: input.profiles[role],
          status: input.statuses[role],
        }),
      ) as unknown as RiddleProofCheckedMeaningRuleDefinition["premises"],
      conclusion: {
        ...RIDDLE_PROOF_BROWSER_CHECK_REPORT_CLAIMS.transition_check_report,
        label:
          "The browser transition has a signed and deterministically reassessed four-checkpoint report",
        parameters: {
          ...projectedParameters(SCOPE_PARAMETER_NAMES, 0),
          transition_id: {
            op: "literal",
            value: input.transition_id,
          },
          before_profile_name: {
            op: "literal",
            value: input.profiles.before.profile_name,
          },
          before_profile_digest: {
            op: "literal",
            value: input.profiles.before.profile_digest,
          },
          before_status: {
            op: "literal",
            value: input.statuses.before,
          },
          action_profile_name: {
            op: "literal",
            value: input.profiles.action.profile_name,
          },
          action_profile_digest: {
            op: "literal",
            value: input.profiles.action.profile_digest,
          },
          action_status: {
            op: "literal",
            value: input.statuses.action,
          },
          reload_profile_name: {
            op: "literal",
            value: input.profiles.reload.profile_name,
          },
          reload_profile_digest: {
            op: "literal",
            value: input.profiles.reload.profile_digest,
          },
          reload_status: {
            op: "literal",
            value: input.statuses.reload,
          },
          fresh_context_profile_name: {
            op: "literal",
            value: input.profiles.fresh_context.profile_name,
          },
          fresh_context_profile_digest: {
            op: "literal",
            value: input.profiles.fresh_context.profile_digest,
          },
          fresh_context_status: {
            op: "literal",
            value: input.statuses.fresh_context,
          },
        },
      },
      constraints: {
        all_of: true,
        parameter_equalities: allPremiseEqualities(
          [...SCOPE_PARAMETER_NAMES, "transition_id"],
          4,
        ),
        ordered_premise_chronology: true,
        max_age_ms: RIDDLE_PROOF_BROWSER_CHECK_REPORT_RULE_MAX_AGE_MS,
      },
    } satisfies RiddleProofCheckedMeaningRuleDefinition,
  });
}

export function createRiddleProofBrowserTransitionCheckReportProtocol(input: {
  expected_scope: RiddleProofSemanticScope;
  transition_id: string;
  profiles: RiddleProofBrowserCheckReportProfiles;
  reported_statuses: RiddleProofBrowserCheckReportStatuses;
}) {
  if (!nonempty(input.transition_id)) {
    return failure(
      "transition_id",
      new Error("Browser transition_id must be a non-empty string."),
    );
  }
  if (input.transition_id !== input.expected_scope.proof_attempt) {
    return failure(
      "transition_id_scope",
      new Error(
        "Browser transition_id must equal the grounded scope proof_attempt.",
      ),
    );
  }
  const profileDigests = RIDDLE_PROOF_BROWSER_CHECK_REPORT_ROLES.map(
    (role) => input.profiles?.[role]?.profile_digest,
  );
  if (
    profileDigests.some((digest) => !fullSha256(digest))
    || new Set(profileDigests).size !== 4
  ) {
    return failure(
      "profiles",
      new Error(
        "The four browser report profiles must have distinct full lowercase sha256 digests.",
      ),
    );
  }
  for (const role of RIDDLE_PROOF_BROWSER_CHECK_REPORT_ROLES) {
    if (!nonempty(input.profiles?.[role]?.profile_name)) {
      return failure(
        `profile:${role}`,
        new Error(`Browser report ${role} profile_name is required.`),
      );
    }
    if (!browserCheckReportStatus(input.reported_statuses?.[role])) {
      return failure(
        `status:${role}`,
        new Error(`Browser report ${role} status is unsupported.`),
      );
    }
  }

  const verifier = createRiddleProofBrowserCheckReportObservationVerifier();
  const contracts = {} as Record<
    RiddleProofBrowserCheckReportRole,
    {
      capture_bound_to_profile: BuiltContract;
      profile_status_reassessed: BuiltContract;
    }
  >;
  const roleRules = {} as Record<RiddleProofBrowserCheckReportRole, BuiltRule>;
  for (const role of RIDDLE_PROOF_BROWSER_CHECK_REPORT_ROLES) {
    const definitions = roleContractDefinitions({
      scope: input.expected_scope,
      transition_id: input.transition_id,
      role,
      profile: input.profiles[role],
      status: input.reported_statuses[role],
    });
    const binding = createRiddleProofGroundedDeclarativeJsonContract(
      definitions.capture_bound_to_profile,
    );
    if (!binding.ok) return failure(`contract:${role}:binding`, binding);
    const outcome = createRiddleProofGroundedDeclarativeJsonContract(
      definitions.profile_status_reassessed,
    );
    if (!outcome.ok) return failure(`contract:${role}:outcome`, outcome);
    const roleRule = createRoleReportRule({ role });
    if (!roleRule.ok) return failure(`rule:${role}`, roleRule);
    contracts[role] = {
      capture_bound_to_profile: binding,
      profile_status_reassessed: outcome,
    };
    roleRules[role] = roleRule;
  }

  const rootRule = createTransitionReportRule({
    transition_id: input.transition_id,
    profiles: input.profiles,
    statuses: input.reported_statuses,
  });
  if (!rootRule.ok) return failure("rule:transition_report", rootRule);

  return {
    ok: true as const,
    protocol: {
      version: RIDDLE_PROOF_BROWSER_CHECK_REPORT_PROTOCOL_VERSION,
      verifier,
      expected_scope: { ...input.expected_scope },
      transition_id: input.transition_id,
      profiles: JSON.parse(
        JSON.stringify(input.profiles),
      ) as RiddleProofBrowserCheckReportProfiles,
      reported_statuses: {
        ...input.reported_statuses,
      },
      contracts,
      rules: {
        roles: roleRules,
        transition_check_report: rootRule,
      },
      expected_root_claim: claimFor(
        RIDDLE_PROOF_BROWSER_CHECK_REPORT_CLAIMS.transition_check_report,
        "The browser transition has a signed and deterministically reassessed four-checkpoint report",
        expectedRootParameters({
          scope: input.expected_scope,
          transition_id: input.transition_id,
          profiles: input.profiles,
          statuses: input.reported_statuses,
        }),
      ),
    },
  };
}

export type RiddleProofBrowserTransitionCheckReportProtocol = Extract<
  ReturnType<typeof createRiddleProofBrowserTransitionCheckReportProtocol>,
  { ok: true }
>["protocol"];

function exactNormalizedProfileDigest(
  bundle: RiddleProofSignedCaptureBundle,
  expectedDigest: string,
) {
  const matches = bundle.statement.artifacts.filter(
    (artifact) =>
      artifact.artifact_id === NORMALIZED_PROFILE_ARTIFACT.artifact_id,
  );
  return (
    matches.length === 1
    && matches[0]!.role === NORMALIZED_PROFILE_ARTIFACT.role
    && matches[0]!.media_type === NORMALIZED_PROFILE_ARTIFACT.media_type
    && matches[0]!.artifact_digest === expectedDigest
  );
}

function verifiedObservationStatus(value: unknown) {
  if (
    !isPlainRecord(value)
    || value.version !==
      RIDDLE_PROOF_BROWSER_CHECK_REPORT_OBSERVATION_VERSION
  ) {
    return undefined;
  }
  return browserCheckReportStatus(value.reassessed_status);
}

function preverifyRole(input: {
  bundle: RiddleProofSignedCaptureBundle;
  authority: RiddleProofBrowserCheckReportAuthority;
  verifier: BuiltVerifier;
  profile: RiddleProofBrowserCheckReportProfile;
}) {
  const verified = verifyRiddleProofSignedCaptureBundle({
    bundle: input.bundle,
    policy: input.authority.policy,
    trusted_signers: input.authority.trusted_signers,
    verifier_registry: [input.verifier.registration],
  });
  if (!verified.ok) return verified;
  if (
    !exactNormalizedProfileDigest(
      verified.bundle,
      input.profile.profile_digest,
    )
  ) {
    return {
      ok: false as const,
      error: {
        code: "artifact_mismatch" as const,
        message:
          "The signed normalized profile artifact does not match the independently expected digest.",
      },
    };
  }
  const status = verifiedObservationStatus(
    verified.verified_capture.observation,
  );
  if (!status) {
    return {
      ok: false as const,
      error: {
        code: "verifier_rejected" as const,
        message:
          "The verified browser observation has no supported reassessed status.",
      },
    };
  }
  return { ...verified, status };
}

function issueLeaf(input: {
  bundle: RiddleProofSignedCaptureBundle;
  authority: RiddleProofBrowserCheckReportAuthority;
  verifier: BuiltVerifier;
  contract: BuiltContract;
}) {
  const configuration = {
    policy: input.authority.policy,
    trusted_signers: input.authority.trusted_signers,
    verifier_registry: [input.verifier.registration] as [
      typeof input.verifier.registration,
    ],
    contract_registry: [input.contract.registration] as [
      typeof input.contract.registration,
    ],
    expected_contract: input.contract.contract_ref,
  };
  const issued = createRiddleProofGroundedSemanticCertificate({
    bundle: input.bundle,
    ...configuration,
    issued_at: input.authority.policy.verification_time,
  });
  if (!issued.ok) return failure("leaf_certificate", issued);
  const grounded = createRiddleProofGroundedSemanticAtomicCertificateClosure({
    certificate: issued.certificate,
    grounding: issued.grounding,
    configuration,
  });
  if (!grounded.ok) return failure("leaf_grounding", grounded);
  const replayContext: RiddleProofGroundedReplayContext = {
    certificate_id: issued.certificate.certificate_id,
    ...configuration,
  };
  const checked = createRiddleProofCheckedMeaningAtomicClosure({
    grounded_closure: grounded.grounded_closure,
    replay_contexts: [replayContext],
  });
  if (!checked.ok) return failure("leaf_checked_meaning", checked);
  return {
    ok: true as const,
    certificate: issued.certificate,
    checked_closure: checked.checked_closure,
    replay_context: replayContext,
  };
}

function reportTrust(protocol: RiddleProofBrowserTransitionCheckReportProtocol) {
  const ruleRegistry = [
    protocol.rules.roles.before.registration,
    protocol.rules.roles.action.registration,
    protocol.rules.roles.reload.registration,
    protocol.rules.roles.fresh_context.registration,
    protocol.rules.transition_check_report.registration,
  ] as [
    RiddleProofCheckedMeaningRuleRegistration,
    ...RiddleProofCheckedMeaningRuleRegistration[],
  ];
  const trustedRules = ruleRegistry.map((registration) => ({
    rule_id: registration.rule_id,
    rule_version: registration.rule_version,
    engine: registration.engine,
    implementation_digest: registration.implementation_digest,
  })) as [
    RiddleProofCheckedMeaningRuleRef,
    ...RiddleProofCheckedMeaningRuleRef[],
  ];
  return {
    rule_registry: ruleRegistry,
    trusted_rules: trustedRules,
  };
}

function deriveRequirementStatus(
  statuses: RiddleProofBrowserCheckReportStatus[],
): RiddleProofBrowserCheckReportRequirementStatus {
  if (
    statuses.some(
      (status) =>
        status === "proof_insufficient"
        || status === "environment_blocked",
    )
  ) {
    return "unresolved";
  }
  if (statuses.some((status) => status === "product_regression")) {
    return "failed";
  }
  return "satisfied";
}

function requirementsFromRoleCertificates(
  statuses: RiddleProofBrowserCheckReportStatuses,
  roleCertificateIds: Record<RiddleProofBrowserCheckReportRole, string>,
): RiddleProofBrowserCheckReportRequirements {
  return {
    declared_transition_observed: {
      status: deriveRequirementStatus([
        statuses.before,
        statuses.action,
      ]),
      role_certificate_ids: [
        roleCertificateIds.before,
        roleCertificateIds.action,
      ],
    },
    transition_survived_reload: {
      status: deriveRequirementStatus([statuses.reload]),
      role_certificate_ids: [roleCertificateIds.reload],
    },
    transition_visible_in_fresh_context: {
      status: deriveRequirementStatus([statuses.fresh_context]),
      role_certificate_ids: [roleCertificateIds.fresh_context],
    },
  };
}

function extractReportedStatuses(input: {
  checked_closure: unknown;
  expected_root_certificate_id: string;
}) {
  if (!isPlainRecord(input.checked_closure)) {
    return failure(
      "reported_statuses",
      new Error("Browser check-report closure must be an object."),
    );
  }
  const grounded = input.checked_closure.grounded_closure;
  if (!isPlainRecord(grounded) || !isPlainRecord(grounded.closure)) {
    return failure(
      "reported_statuses",
      new Error("Browser check-report closure has no semantic closure."),
    );
  }
  const certificates = grounded.closure.certificates;
  if (!Array.isArray(certificates)) {
    return failure(
      "reported_statuses",
      new Error("Browser check-report certificates are invalid."),
    );
  }
  const roots = certificates.filter(
    (certificate) =>
      isPlainRecord(certificate)
      && certificate.certificate_id === input.expected_root_certificate_id,
  );
  if (roots.length !== 1 || !isPlainRecord(roots[0])) {
    return failure(
      "reported_statuses",
      new Error("Browser check-report expected root is not unique."),
    );
  }
  const claim = roots[0].claim;
  if (
    !isPlainRecord(claim)
    || claim.claim_id
      !== RIDDLE_PROOF_BROWSER_CHECK_REPORT_CLAIMS.transition_check_report
        .claim_id
    || claim.claim_version
      !== RIDDLE_PROOF_BROWSER_CHECK_REPORT_CLAIMS.transition_check_report
        .claim_version
    || !isPlainRecord(claim.parameters)
  ) {
    return failure(
      "reported_statuses",
      new Error("Browser check-report root has the wrong claim."),
    );
  }
  const statuses = {
    before: browserCheckReportStatus(claim.parameters.before_status),
    action: browserCheckReportStatus(claim.parameters.action_status),
    reload: browserCheckReportStatus(claim.parameters.reload_status),
    fresh_context: browserCheckReportStatus(
      claim.parameters.fresh_context_status,
    ),
  };
  if (
    !statuses.before
    || !statuses.action
    || !statuses.reload
    || !statuses.fresh_context
  ) {
    return failure(
      "reported_statuses",
      new Error(
        "Browser check-report root has an unsupported or missing status.",
      ),
    );
  }
  return {
    ok: true as const,
    reported_statuses: statuses as RiddleProofBrowserCheckReportStatuses,
  };
}

function createReplayContexts(input: {
  checked_closure: unknown;
  authorities: RiddleProofBrowserCheckReportAuthorities;
  protocol: RiddleProofBrowserTransitionCheckReportProtocol;
}) {
  if (!isPlainRecord(input.checked_closure)) {
    return failure(
      "replay_contexts",
      new Error("Browser check-report closure must be an object."),
    );
  }
  const grounded = input.checked_closure.grounded_closure;
  if (!isPlainRecord(grounded) || !isPlainRecord(grounded.closure)) {
    return failure(
      "replay_contexts",
      new Error("Browser check-report closure has no grounded closure."),
    );
  }
  const certificates = grounded.closure.certificates;
  const groundings = grounded.groundings;
  if (!Array.isArray(certificates) || !Array.isArray(groundings)) {
    return failure(
      "replay_contexts",
      new Error("Browser check-report grounded members are invalid."),
    );
  }
  const certificateById = new Map<string, Record<string, unknown>>();
  for (const certificate of certificates) {
    if (
      isPlainRecord(certificate)
      && typeof certificate.certificate_id === "string"
    ) {
      certificateById.set(certificate.certificate_id, certificate);
    }
  }

  const contexts: RiddleProofGroundedReplayContext[] = [];
  for (const role of RIDDLE_PROOF_BROWSER_CHECK_REPORT_ROLES) {
    const authority = input.authorities?.[role];
    if (
      !authority
      || !isPlainRecord(authority)
      || !isPlainRecord(authority.policy)
      || !Array.isArray(authority.trusted_signers)
      || authority.trusted_signers.length === 0
    ) {
      return failure(
        `replay_contexts:${role}`,
        new Error(
          "Each browser report role requires an independent replay authority.",
        ),
      );
    }
    for (const contract of Object.values(input.protocol.contracts[role])) {
      const expectedClaim = contract.registration.claim;
      const matches = groundings.filter((grounding) => {
        if (
          !isPlainRecord(grounding)
          || typeof grounding.certificate_id !== "string"
        ) {
          return false;
        }
        const certificate = certificateById.get(grounding.certificate_id);
        return (
          certificate !== undefined
          && sameJsonData(certificate.claim, expectedClaim)
        );
      });
      if (matches.length !== 1 || !isPlainRecord(matches[0])) {
        return failure(
          `replay_contexts:${role}`,
          new Error(
            "Each exact browser report contract must resolve to one grounded certificate.",
          ),
        );
      }
      contexts.push({
        certificate_id: matches[0].certificate_id as string,
        policy: authority.policy,
        trusted_signers: authority.trusted_signers,
        verifier_registry: [input.protocol.verifier.registration],
        contract_registry: [contract.registration],
        expected_contract: contract.contract_ref,
      });
    }
  }
  if (contexts.length !== 8) {
    return failure(
      "replay_contexts",
      new Error("A four-role browser check report requires eight grounded leaves."),
    );
  }
  return {
    ok: true as const,
    replay_contexts: contexts as [
      RiddleProofGroundedReplayContext,
      ...RiddleProofGroundedReplayContext[],
    ],
  };
}

function validateCaptureIdentities(input: {
  checked_closure: RiddleProofCheckedMeaningClosure;
  profiles: RiddleProofBrowserCheckReportProfiles;
}) {
  const certificateById = new Map(
    input.checked_closure.grounded_closure.closure.certificates.map(
      (certificate) => [certificate.certificate_id, certificate],
    ),
  );
  const roleBundles = new Map<
    RiddleProofBrowserCheckReportRole,
    Map<string, string>
  >();
  for (const grounding of input.checked_closure.grounded_closure.groundings) {
    const certificate = certificateById.get(grounding.certificate_id);
    const parameters = certificate?.claim.parameters;
    const role = RIDDLE_PROOF_BROWSER_CHECK_REPORT_ROLES.find(
      (candidate) => candidate === parameters?.role,
    );
    if (!role) {
      return failure(
        "capture_identity",
        new Error("Every grounded report leaf must name one exact role."),
      );
    }
    if (
      parameters?.profile_name !== input.profiles[role].profile_name
      || parameters.profile_digest !== input.profiles[role].profile_digest
      || !exactNormalizedProfileDigest(
        grounding.bundle,
        input.profiles[role].profile_digest,
      )
    ) {
      return failure(
        "capture_identity",
        new Error(
          `Grounded ${role} report evidence does not match its exact expected profile.`,
        ),
      );
    }
    const capturedAt = grounding.bundle.statement.captured_at;
    if (!Number.isFinite(Date.parse(capturedAt))) {
      return failure(
        "capture_identity",
        new Error("Every grounded browser report capture needs a valid time."),
      );
    }
    const bundles = roleBundles.get(role) ?? new Map<string, string>();
    const prior = bundles.get(grounding.receipt.bundle_id);
    if (prior !== undefined && prior !== capturedAt) {
      return failure(
        "capture_identity",
        new Error(
          "One signed browser bundle cannot have conflicting capture times.",
        ),
      );
    }
    bundles.set(grounding.receipt.bundle_id, capturedAt);
    roleBundles.set(role, bundles);
  }

  const capturePoints = {} as Record<
    RiddleProofBrowserCheckReportRole,
    { bundle_id: string; captured_at: string }
  >;
  for (const role of RIDDLE_PROOF_BROWSER_CHECK_REPORT_ROLES) {
    const bundles = roleBundles.get(role);
    if (!bundles || bundles.size !== 1) {
      return failure(
        "capture_identity",
        new Error(
          `Both grounded ${role} leaves must come from one exact signed capture.`,
        ),
      );
    }
    const [bundleId, capturedAt] = bundles.entries().next().value as [
      string,
      string,
    ];
    capturePoints[role] = {
      bundle_id: bundleId,
      captured_at: capturedAt,
    };
  }
  if (
    new Set(
      Object.values(capturePoints).map((capture) => capture.bundle_id),
    ).size !== 4
  ) {
    return failure(
      "capture_identity",
      new Error(
        "Before, action, reload, and fresh-context reports require four distinct signed captures.",
      ),
    );
  }
  const before = Date.parse(capturePoints.before.captured_at);
  const action = Date.parse(capturePoints.action.captured_at);
  const reload = Date.parse(capturePoints.reload.captured_at);
  const fresh = Date.parse(capturePoints.fresh_context.captured_at);
  if (before > action || action > reload || action > fresh) {
    return failure(
      "capture_chronology",
      new Error(
        "Signed browser captures must put before no later than action, and action no later than each readback.",
      ),
    );
  }
  return { ok: true as const, capture_points: capturePoints };
}

function roleCertificateIds(input: {
  checked_closure: RiddleProofCheckedMeaningClosure;
  profiles: RiddleProofBrowserCheckReportProfiles;
  statuses: RiddleProofBrowserCheckReportStatuses;
}) {
  const output = {} as Record<RiddleProofBrowserCheckReportRole, string>;
  for (const role of RIDDLE_PROOF_BROWSER_CHECK_REPORT_ROLES) {
    const matches =
      input.checked_closure.grounded_closure.closure.certificates.filter(
        (certificate) => {
          const parameters = certificate.claim.parameters;
          return certificate.claim.claim_id
            ===
            RIDDLE_PROOF_BROWSER_CHECK_REPORT_CLAIMS.profile_check_report
              .claim_id
          && certificate.claim.claim_version
            ===
            RIDDLE_PROOF_BROWSER_CHECK_REPORT_CLAIMS.profile_check_report
              .claim_version
          && parameters?.role === role
          && parameters.profile_name
            === input.profiles[role].profile_name
          && parameters.profile_digest
            === input.profiles[role].profile_digest
          && parameters.status === input.statuses[role];
        },
      );
    if (matches.length !== 1) {
      return failure(
        "role_certificates",
        new Error(
          `The replayed browser report must contain exactly one ${role} role report certificate.`,
        ),
      );
    }
    output[role] = matches[0]!.certificate_id;
  }
  return { ok: true as const, role_certificate_ids: output };
}

export function replayRiddleProofBrowserTransitionCheckReport(input: {
  checked_closure: unknown;
  authorities: RiddleProofBrowserCheckReportAuthorities;
  expected_root_certificate_id: string;
  expected_scope: RiddleProofSemanticScope;
  transition_id: string;
  profiles: RiddleProofBrowserCheckReportProfiles;
}) {
  const extracted = extractReportedStatuses({
    checked_closure: input.checked_closure,
    expected_root_certificate_id: input.expected_root_certificate_id,
  });
  if (!extracted.ok) return extracted;
  const protocolResult =
    createRiddleProofBrowserTransitionCheckReportProtocol({
      expected_scope: input.expected_scope,
      transition_id: input.transition_id,
      profiles: input.profiles,
      reported_statuses: extracted.reported_statuses,
    });
  if (!protocolResult.ok) return protocolResult;
  const protocol = protocolResult.protocol;
  const replayContexts = createReplayContexts({
    checked_closure: input.checked_closure,
    authorities: input.authorities,
    protocol,
  });
  if (!replayContexts.ok) return replayContexts;
  const trust = reportTrust(protocol);
  const matched = matchRiddleProofCheckedMeaningClosure({
    checked_closure: input.checked_closure,
    replay_contexts: replayContexts.replay_contexts,
    ...trust,
    expected_root_certificate_id: input.expected_root_certificate_id,
    expected_scope: input.expected_scope,
    expected_claim: protocol.expected_root_claim,
    expected_root_rule: protocol.rules.transition_check_report.rule_ref,
  });
  if (!matched.ok) return failure("checked_replay", matched);
  const captures = validateCaptureIdentities({
    checked_closure: matched.checked_closure,
    profiles: input.profiles,
  });
  if (!captures.ok) return captures;
  const roleIds = roleCertificateIds({
    checked_closure: matched.checked_closure,
    profiles: input.profiles,
    statuses: extracted.reported_statuses,
  });
  if (!roleIds.ok) return roleIds;
  const explanation = explainRiddleProofCheckedMeaningClosure({
    checked_closure: matched.checked_closure,
    replay_contexts: replayContexts.replay_contexts,
    ...trust,
  });
  if (!explanation.ok) return failure("explanation", explanation);
  return {
    ok: true as const,
    version: RIDDLE_PROOF_BROWSER_CHECK_REPORT_PROTOCOL_VERSION,
    root_certificate: matched.root_certificate,
    checked_closure: matched.checked_closure,
    replay_contexts: replayContexts.replay_contexts,
    protocol,
    trust,
    reported_statuses: extracted.reported_statuses,
    capture_points: captures.capture_points,
    role_certificate_ids: roleIds.role_certificate_ids,
    requirements: requirementsFromRoleCertificates(
      extracted.reported_statuses,
      roleIds.role_certificate_ids,
    ),
    explanation: explanation.explanation,
  };
}

export type RiddleProofBrowserTransitionCheckReport = Extract<
  ReturnType<typeof replayRiddleProofBrowserTransitionCheckReport>,
  { ok: true }
>;

export function assessRiddleProofBrowserTransitionCheckReport(input: {
  report: RiddleProofBrowserTransitionCheckReport;
  consumption_time: string;
  max_grounded_age_ms: number;
  max_future_skew_ms: number;
}) {
  return assessRiddleProofCheckedMeaningClosure({
    checked_closure: input.report.checked_closure,
    replay_contexts: input.report.replay_contexts,
    ...input.report.trust,
    consumption_time: input.consumption_time,
    max_grounded_age_ms: input.max_grounded_age_ms,
    max_future_skew_ms: input.max_future_skew_ms,
  });
}

export function createRiddleProofBrowserTransitionCheckReport(input: {
  bundles: RiddleProofBrowserCheckReportBundles;
  authorities: RiddleProofBrowserCheckReportAuthorities;
  expected_scope: RiddleProofSemanticScope;
  transition_id: string;
  profiles: RiddleProofBrowserCheckReportProfiles;
  role_issued_at: Record<RiddleProofBrowserCheckReportRole, string>;
  root_issued_at: string;
}) {
  const verifier =
    createRiddleProofBrowserCheckReportObservationVerifier();
  const statuses = {} as RiddleProofBrowserCheckReportStatuses;
  for (const role of RIDDLE_PROOF_BROWSER_CHECK_REPORT_ROLES) {
    const preverified = preverifyRole({
      bundle: input.bundles[role],
      authority: input.authorities[role],
      verifier,
      profile: input.profiles[role],
    });
    if (!preverified.ok) {
      return failure(`preverify:${role}`, preverified);
    }
    statuses[role] = preverified.status;
  }
  const protocolResult =
    createRiddleProofBrowserTransitionCheckReportProtocol({
      expected_scope: input.expected_scope,
      transition_id: input.transition_id,
      profiles: input.profiles,
      reported_statuses: statuses,
    });
  if (!protocolResult.ok) return protocolResult;
  const protocol = protocolResult.protocol;
  const trust = reportTrust(protocol);

  const roleReports = {} as Record<
    RiddleProofBrowserCheckReportRole,
    Extract<
      ReturnType<typeof composeRiddleProofCheckedMeaningClosures>,
      { ok: true }
    >
  >;
  const replayContexts: RiddleProofGroundedReplayContext[] = [];
  for (const role of RIDDLE_PROOF_BROWSER_CHECK_REPORT_ROLES) {
    const base = {
      bundle: input.bundles[role],
      authority: input.authorities[role],
      verifier: protocol.verifier,
    };
    const binding = issueLeaf({
      ...base,
      contract: protocol.contracts[role].capture_bound_to_profile,
    });
    if (!binding.ok) return failure(`leaf:${role}:binding`, binding);
    const outcome = issueLeaf({
      ...base,
      contract: protocol.contracts[role].profile_status_reassessed,
    });
    if (!outcome.ok) return failure(`leaf:${role}:outcome`, outcome);
    replayContexts.push(binding.replay_context, outcome.replay_context);
    const composed = composeRiddleProofCheckedMeaningClosures({
      expected_rule: protocol.rules.roles[role].rule_ref,
      closures: [binding.checked_closure, outcome.checked_closure],
      issued_at: input.role_issued_at[role],
      replay_contexts: [
        binding.replay_context,
        outcome.replay_context,
      ],
      ...trust,
    });
    if (!composed.ok) {
      return failure(`compose:${role}`, composed);
    }
    roleReports[role] = composed;
  }

  const root = composeRiddleProofCheckedMeaningClosures({
    expected_rule: protocol.rules.transition_check_report.rule_ref,
    closures: RIDDLE_PROOF_BROWSER_CHECK_REPORT_ROLES.map(
      (role) => roleReports[role].checked_closure,
    ) as [unknown, ...unknown[]],
    issued_at: input.root_issued_at,
    replay_contexts: replayContexts as [
      RiddleProofGroundedReplayContext,
      ...RiddleProofGroundedReplayContext[],
    ],
    ...trust,
  });
  if (!root.ok) return failure("compose:transition_report", root);

  return replayRiddleProofBrowserTransitionCheckReport({
    checked_closure: root.checked_closure,
    authorities: input.authorities,
    expected_root_certificate_id: root.certificate.certificate_id,
    expected_scope: input.expected_scope,
    transition_id: input.transition_id,
    profiles: input.profiles,
  });
}
