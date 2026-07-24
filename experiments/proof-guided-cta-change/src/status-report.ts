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
  type RiddleProofGroundedCaptureVerificationPolicy,
  type RiddleProofGroundedDeclarativeJsonAssertion,
  type RiddleProofGroundedDeclarativeJsonContractDefinition,
  type RiddleProofGroundedReplayContext,
  type RiddleProofGroundedTrustedSigner,
  type RiddleProofProfileCheckResult,
  type RiddleProofSemanticClaim,
  type RiddleProofSemanticScope,
  type RiddleProofSignedCaptureBundle,
} from "@riddledc/riddle-proof-core";
import {
  RIDDLE_PROOF_BROWSER_NORMALIZED_PROFILE_ARTIFACT,
  RIDDLE_PROOF_BROWSER_SEALED_OBSERVATION_VERSION,
  createRiddleProofBrowserSealedObservationVerifier,
} from "@riddledc/riddle-proof-runner-playwright";

import {
  CTA_REQUIREMENT_IDS,
  type CtaRequirementId,
  type CtaRequirementStatus,
} from "./types.js";

export const CTA_STATUS_REPORT_VERSION =
  "riddle-proof.browser.cta-status-report.v1" as const;

export const CTA_STATUS_REPORT_CLAIMS = {
  capture_bound: {
    claim_id: "riddle-proof.browser.cta-capture-bound",
    claim_version: "1",
  },
  requirement_status: {
    claim_id: "riddle-proof.browser.cta-requirement-status",
    claim_version: "1",
  },
  report: {
    claim_id: "riddle-proof.browser.cta-status-report",
    claim_version: "1",
  },
} as const;

const RULE_MAX_AGE_MS = 30 * 60 * 1000;
const PROFILE_STATUSES = [
  "passed",
  "product_regression",
  "proof_insufficient",
  "environment_blocked",
] as const;
const CHECK_STATUSES = [
  "passed",
  "failed",
  "skipped",
  "proof_insufficient",
  "needs_human_review",
] as const;

type ProfileStatus = (typeof PROFILE_STATUSES)[number];
type CheckStatus = (typeof CHECK_STATUSES)[number];
export type CtaRequirementStatuses = Readonly<
  Record<CtaRequirementId, CtaRequirementStatus>
>;

type ExpectedCheck = {
  type: string;
  label: string;
  requirement_id: CtaRequirementId;
};

/**
 * This is an exact, exhaustive partition of the pinned profile result vector.
 * The first result is generated deterministically from the one pinned setup
 * action; the remaining results preserve normalized profile order.
 */
export const CTA_EXPECTED_CHECKS: readonly ExpectedCheck[] = [
  {
    type: "setup_actions_succeeded",
    label: "setup actions succeeded",
    requirement_id: "primary-cta-correct",
  },
  {
    type: "route_loaded",
    label: "home-route-loaded",
    requirement_id: "routes-preserved",
  },
  {
    type: "selector_count_equals",
    label: "one-primary-cta",
    requirement_id: "primary-cta-correct",
  },
  {
    type: "selector_visible",
    label: "primary-cta-visible",
    requirement_id: "primary-cta-correct",
  },
  {
    type: "selector_text_visible",
    label: "primary-cta-text-exact",
    requirement_id: "primary-cta-correct",
  },
  {
    type: "selector_visible",
    label: "site-navigation-visible",
    requirement_id: "routes-preserved",
  },
  {
    type: "route_inventory",
    label: "pinned-route-inventory",
    requirement_id: "routes-preserved",
  },
  {
    type: "no_horizontal_overflow",
    label: "responsive-horizontal-bounds",
    requirement_id: "responsive-layout-healthy",
  },
  {
    type: "no_fatal_console_errors",
    label: "captured-runtime-clean",
    requirement_id: "runtime-healthy",
  },
] as const;

export interface CtaStatusReportAuthority {
  policy: RiddleProofGroundedCaptureVerificationPolicy;
  trusted_signers: [
    RiddleProofGroundedTrustedSigner,
    ...RiddleProofGroundedTrustedSigner[],
  ];
}

type VerifiedCheck = {
  type: string;
  label: string;
  status: CheckStatus;
};

type VerifiedObservation = {
  version: typeof RIDDLE_PROOF_BROWSER_SEALED_OBSERVATION_VERSION;
  normalized_profile_artifact: {
    artifact_id: string;
    artifact_digest: string;
  };
  profile_result: {
    profile_name: string;
    status: ProfileStatus;
    checks: RiddleProofProfileCheckResult[];
    evidence: {
      dom_summary?: Record<string, unknown>;
    };
  };
  reassessed_status: ProfileStatus;
};

type RequirementResult = {
  status: CtaRequirementStatus;
  diagnostic_code?: string;
  checks: readonly VerifiedCheck[];
};

type DerivedReport = {
  profile_status: ProfileStatus;
  dom_partial: boolean;
  checks: readonly VerifiedCheck[];
  requirements: Readonly<Record<CtaRequirementId, RequirementResult>>;
};

type BuiltContract = Extract<
  ReturnType<typeof createRiddleProofGroundedDeclarativeJsonContract>,
  { ok: true }
>;
type BuiltRule = Extract<
  ReturnType<typeof createRiddleProofCheckedMeaningRule>,
  { ok: true }
>;
type ObservationVerifier = ReturnType<
  typeof createRiddleProofBrowserSealedObservationVerifier
>;

type Protocol = {
  version: typeof CTA_STATUS_REPORT_VERSION;
  verifier: ObservationVerifier;
  contracts: {
    capture_bound: BuiltContract;
    requirements: Readonly<Record<CtaRequirementId, BuiltContract>>;
  };
  rule: BuiltRule;
  expected_root_claim: RiddleProofSemanticClaim;
  derived: DerivedReport;
};

function failure(stage: string, cause: unknown) {
  const nested = (
    cause
    && typeof cause === "object"
    && "error" in cause
    && cause.error
    && typeof cause.error === "object"
    && "message" in cause.error
  )
    ? cause.error.message
    : undefined;
  return {
    ok: false as const,
    error: {
      code: "cta_status_report_invalid" as const,
      stage,
      message: typeof nested === "string"
        ? nested
        : cause instanceof Error
          ? cause.message
          : `CTA status report failed at ${stage}.`,
      cause,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function profileStatus(value: unknown): ProfileStatus | undefined {
  return PROFILE_STATUSES.find((candidate) => candidate === value);
}

function checkStatus(value: unknown): CheckStatus | undefined {
  return CHECK_STATUSES.find((candidate) => candidate === value);
}

function exactProfileArtifact(
  bundle: RiddleProofSignedCaptureBundle,
  expectedDigest: string,
): boolean {
  const matches = bundle.statement.artifacts.filter(
    ({ artifact_id }) =>
      artifact_id === RIDDLE_PROOF_BROWSER_NORMALIZED_PROFILE_ARTIFACT.artifact_id,
  );
  return matches.length === 1
    && matches[0]?.role === RIDDLE_PROOF_BROWSER_NORMALIZED_PROFILE_ARTIFACT.role
    && matches[0]?.media_type
      === RIDDLE_PROOF_BROWSER_NORMALIZED_PROFILE_ARTIFACT.media_type
    && matches[0]?.artifact_digest === expectedDigest;
}

function parseObservation(value: unknown): VerifiedObservation {
  if (
    !isRecord(value)
    || value.version !== RIDDLE_PROOF_BROWSER_SEALED_OBSERVATION_VERSION
    || !isRecord(value.normalized_profile_artifact)
    || !isRecord(value.profile_result)
    || !Array.isArray(value.profile_result.checks)
  ) {
    throw new TypeError("Verified CTA browser observation has the wrong shape.");
  }
  const result = value.profile_result;
  const overall = profileStatus(value.reassessed_status);
  if (
    !overall
    || result.status !== overall
    || typeof result.profile_name !== "string"
    || !isRecord(result.evidence)
  ) {
    throw new TypeError("Verified CTA browser status is inconsistent.");
  }
  return value as unknown as VerifiedObservation;
}

function verifiedChecks(observation: VerifiedObservation): VerifiedCheck[] {
  if (observation.profile_result.checks.length !== CTA_EXPECTED_CHECKS.length) {
    throw new TypeError(
      "Pinned CTA profile result must have the exact exhaustive check count.",
    );
  }
  return observation.profile_result.checks.map((check, index) => {
    const expected = CTA_EXPECTED_CHECKS[index];
    const status = checkStatus(check.status);
    if (
      !expected
      || check.type !== expected.type
      || check.label !== expected.label
      || !status
    ) {
      throw new TypeError(
        `CTA profile check ${index} does not match the pinned type, label, and supported status vector.`,
      );
    }
    return { type: check.type, label: check.label, status };
  });
}

function groupedStatus(input: {
  profile_status: ProfileStatus;
  checks: readonly VerifiedCheck[];
  runtime_complete?: boolean;
}): { status: CtaRequirementStatus; diagnostic_code?: string } {
  if (
    input.profile_status === "proof_insufficient"
    || input.profile_status === "environment_blocked"
  ) {
    return {
      status: "unresolved",
      diagnostic_code: `browser_${input.profile_status}`,
    };
  }
  if (input.runtime_complete === false) {
    return {
      status: "unresolved",
      diagnostic_code: "browser_dom_capture_incomplete",
    };
  }
  if (
    input.checks.some(
      ({ status }) =>
        status === "skipped"
        || status === "proof_insufficient"
        || status === "needs_human_review",
    )
  ) {
    return {
      status: "unresolved",
      diagnostic_code: "requirement_check_not_decisive",
    };
  }
  if (input.checks.some(({ status }) => status === "failed")) {
    return { status: "failed" };
  }
  return { status: "satisfied" };
}

function derive(observation: VerifiedObservation): DerivedReport {
  const checks = verifiedChecks(observation);
  const partial =
    observation.profile_result.evidence.dom_summary?.partial;
  if (typeof partial !== "boolean") {
    throw new TypeError(
      "CTA runtime requirement needs an explicit boolean DOM partial marker.",
    );
  }
  const requirementEntries = CTA_REQUIREMENT_IDS.map((requirementId) => {
    const grouped = checks.filter(
      (_, index) =>
        CTA_EXPECTED_CHECKS[index]?.requirement_id === requirementId,
    );
    if (grouped.length === 0) {
      throw new TypeError(`CTA requirement ${requirementId} has no checks.`);
    }
    const status = groupedStatus({
      profile_status: observation.reassessed_status,
      checks: grouped,
      ...(requirementId === "runtime-healthy"
        ? { runtime_complete: partial === false }
        : {}),
    });
    return [
      requirementId,
      {
        ...status,
        checks: grouped,
      },
    ] as const;
  });
  return {
    profile_status: observation.reassessed_status,
    dom_partial: partial,
    checks,
    requirements: Object.fromEntries(requirementEntries) as unknown as Readonly<
      Record<CtaRequirementId, RequirementResult>
    >,
  };
}

function commonParameters(input: {
  scope: RiddleProofSemanticScope;
  profile_name: string;
  profile_digest: string;
  profile_status: ProfileStatus;
}) {
  return {
    repository: input.scope.repository,
    revision: input.scope.revision,
    environment: input.scope.environment,
    target: input.scope.target,
    proof_attempt: input.scope.proof_attempt,
    profile_name: input.profile_name,
    profile_digest: input.profile_digest,
    profile_status: input.profile_status,
  };
}

const COMMON_NAMES = [
  "repository",
  "revision",
  "environment",
  "target",
  "proof_attempt",
  "profile_name",
  "profile_digest",
  "profile_status",
] as const;

function claim(
  reference: (typeof CTA_STATUS_REPORT_CLAIMS)[
    keyof typeof CTA_STATUS_REPORT_CLAIMS
  ],
  label: string,
  parameters: Record<string, string>,
): RiddleProofSemanticClaim {
  return { ...reference, label, parameters };
}

function bindingDefinition(input: {
  scope: RiddleProofSemanticScope;
  profile_name: string;
  profile_digest: string;
  derived: DerivedReport;
}): RiddleProofGroundedDeclarativeJsonContractDefinition {
  const parameters = commonParameters({
    ...input,
    profile_status: input.derived.profile_status,
  });
  return {
    contract_id: "riddle-proof.browser.cta-capture-bound",
    contract_version: "1",
    label: "Bind one signed CTA browser capture to the exact scope and profile",
    claim: claim(
      CTA_STATUS_REPORT_CLAIMS.capture_bound,
      "The signed CTA browser capture is bound to this exact scope and profile",
      parameters,
    ),
    program: {
      all: [
        {
          op: "equals",
          source: "scope",
          pointer: "/repository",
          value: parameters.repository,
        },
        ...COMMON_NAMES.slice(0, 5).map((name) => ({
          op: "equals" as const,
          source: "scope" as const,
          pointer: `/${name}`,
          value: parameters[name],
        })).slice(1),
        {
          op: "equals",
          source: "observation",
          pointer: "/version",
          value: RIDDLE_PROOF_BROWSER_SEALED_OBSERVATION_VERSION,
        },
        {
          op: "equals",
          source: "observation",
          pointer: "/normalized_profile_artifact/artifact_digest",
          value: input.profile_digest,
        },
        {
          op: "equals",
          source: "observation",
          pointer: "/profile_result/profile_name",
          value: input.profile_name,
        },
        {
          op: "equals",
          source: "observation",
          pointer: "/reassessed_status",
          value: input.derived.profile_status,
        },
      ],
    },
  };
}

function requirementDefinition(input: {
  scope: RiddleProofSemanticScope;
  profile_name: string;
  profile_digest: string;
  derived: DerivedReport;
  requirement_id: CtaRequirementId;
}): RiddleProofGroundedDeclarativeJsonContractDefinition {
  const requirement = input.derived.requirements[input.requirement_id];
  const parameters = {
    ...commonParameters({
      ...input,
      profile_status: input.derived.profile_status,
    }),
    requirement_id: input.requirement_id,
    status: requirement.status,
  };
  const checkAssertions: RiddleProofGroundedDeclarativeJsonAssertion[] = [];
  CTA_EXPECTED_CHECKS.forEach((expected, index) => {
    if (expected.requirement_id !== input.requirement_id) return;
    const observed = input.derived.checks[index];
    if (!observed) {
      throw new TypeError(`Missing derived CTA check ${index}.`);
    }
    checkAssertions.push(
      {
        op: "equals",
        source: "observation",
        pointer: `/profile_result/checks/${index}/type`,
        value: observed.type,
      },
      {
        op: "equals",
        source: "observation",
        pointer: `/profile_result/checks/${index}/label`,
        value: observed.label,
      },
      {
        op: "equals",
        source: "observation",
        pointer: `/profile_result/checks/${index}/status`,
        value: observed.status,
      },
    );
  });
  const runtimeAssertion: RiddleProofGroundedDeclarativeJsonAssertion[] =
    input.requirement_id === "runtime-healthy"
      ? [{
          op: "equals",
          source: "observation",
          pointer: "/profile_result/evidence/dom_summary/partial",
          value: input.derived.dom_partial,
        }]
      : [];
  return {
    contract_id:
      `riddle-proof.browser.cta-requirement-status.${input.requirement_id}`,
    contract_version: "1",
    label:
      `Ground the ${input.requirement_id} status in the reassessed profile checks`,
    claim: claim(
      CTA_STATUS_REPORT_CLAIMS.requirement_status,
      `The ${input.requirement_id} requirement is ${requirement.status}`,
      parameters,
    ),
    program: {
      all: [
        {
          op: "equals",
          source: "observation",
          pointer: "/profile_result/profile_name",
          value: input.profile_name,
        },
        {
          op: "equals",
          source: "observation",
          pointer: "/reassessed_status",
          value: input.derived.profile_status,
        },
        {
          op: "type_is",
          source: "observation",
          pointer: "/profile_result/checks",
          type: "array",
        },
        ...checkAssertions,
        ...runtimeAssertion,
      ],
    },
  };
}

function anyParameters(names: readonly string[]) {
  return Object.fromEntries(
    names.map((name) => [name, { op: "any" as const }]),
  );
}

function rootRule(input: {
  profile_name: string;
  profile_digest: string;
  derived: DerivedReport;
}) {
  const premiseParameters = anyParameters(COMMON_NAMES);
  const requirementPremises = CTA_REQUIREMENT_IDS.map((requirementId) => ({
    ...CTA_STATUS_REPORT_CLAIMS.requirement_status,
    parameters: {
      ...premiseParameters,
      requirement_id: { op: "equals" as const, value: requirementId },
      status: {
        op: "equals" as const,
        value: input.derived.requirements[requirementId].status,
      },
    },
  }));
  const equalities = COMMON_NAMES.map((parameter) => ({
    members: Array.from({ length: 5 }, (_, premiseIndex) => ({
      premise_index: premiseIndex,
      parameter,
    })) as [
      { premise_index: number; parameter: string },
      { premise_index: number; parameter: string },
      ...Array<{ premise_index: number; parameter: string }>,
    ],
  })) as NonNullable<
    RiddleProofCheckedMeaningRuleDefinition["constraints"]["parameter_equalities"]
  >;
  return createRiddleProofCheckedMeaningRule({
    definition: {
      rule_id: "riddle-proof.browser.cta-status-report",
      rule_version: "1",
      label:
        "Compose one exact CTA capture and four grounded requirement statuses",
      premises: [
        {
          ...CTA_STATUS_REPORT_CLAIMS.capture_bound,
          parameters: premiseParameters,
        },
        ...requirementPremises,
      ] as RiddleProofCheckedMeaningRuleDefinition["premises"],
      conclusion: {
        ...CTA_STATUS_REPORT_CLAIMS.report,
        label:
          "The exact CTA browser profile has four replayed requirement statuses",
        parameters: {
          ...Object.fromEntries(COMMON_NAMES.map((name) => [
            name,
            {
              op: "from_premise" as const,
              premise_index: 0,
              parameter: name,
            },
          ])),
          ...Object.fromEntries(CTA_REQUIREMENT_IDS.map((requirementId) => [
            requirementId.replaceAll("-", "_"),
            {
              op: "literal" as const,
              value: input.derived.requirements[requirementId].status,
            },
          ])),
        },
      },
      constraints: {
        all_of: true,
        parameter_equalities: equalities,
        ordered_premise_chronology: true,
        max_age_ms: RULE_MAX_AGE_MS,
      },
    } satisfies RiddleProofCheckedMeaningRuleDefinition,
  });
}

function createProtocol(input: {
  expected_scope: RiddleProofSemanticScope;
  expected_profile_name: string;
  expected_profile_digest: string;
  derived: DerivedReport;
}): { ok: true; protocol: Protocol } | ReturnType<typeof failure> {
  const verifier = createRiddleProofBrowserSealedObservationVerifier();
  const binding = createRiddleProofGroundedDeclarativeJsonContract(
    bindingDefinition({
      scope: input.expected_scope,
      profile_name: input.expected_profile_name,
      profile_digest: input.expected_profile_digest,
      derived: input.derived,
    }),
  );
  if (!binding.ok) return failure("contract:capture_bound", binding);
  const requirementEntries = CTA_REQUIREMENT_IDS.map((requirementId) => {
    const built = createRiddleProofGroundedDeclarativeJsonContract(
      requirementDefinition({
        scope: input.expected_scope,
        profile_name: input.expected_profile_name,
        profile_digest: input.expected_profile_digest,
        derived: input.derived,
        requirement_id: requirementId,
      }),
    );
    return [requirementId, built] as const;
  });
  const failedRequirement = requirementEntries.find(([, built]) => !built.ok);
  if (failedRequirement && !failedRequirement[1].ok) {
    return failure(
      `contract:${failedRequirement[0]}`,
      failedRequirement[1],
    );
  }
  const requirements = Object.fromEntries(
    requirementEntries,
  ) as unknown as Record<CtaRequirementId, BuiltContract>;
  const rule = rootRule({
    profile_name: input.expected_profile_name,
    profile_digest: input.expected_profile_digest,
    derived: input.derived,
  });
  if (!rule.ok) return failure("rule", rule);
  const common = commonParameters({
    scope: input.expected_scope,
    profile_name: input.expected_profile_name,
    profile_digest: input.expected_profile_digest,
    profile_status: input.derived.profile_status,
  });
  return {
    ok: true,
    protocol: {
      version: CTA_STATUS_REPORT_VERSION,
      verifier,
      contracts: {
        capture_bound: binding,
        requirements,
      },
      rule,
      expected_root_claim: claim(
        CTA_STATUS_REPORT_CLAIMS.report,
        "The exact CTA browser profile has four replayed requirement statuses",
        {
          ...common,
          ...Object.fromEntries(CTA_REQUIREMENT_IDS.map((requirementId) => [
            requirementId.replaceAll("-", "_"),
            input.derived.requirements[requirementId].status,
          ])),
        },
      ),
      derived: input.derived,
    },
  };
}

function preverify(input: {
  bundle: RiddleProofSignedCaptureBundle;
  authority: CtaStatusReportAuthority;
  expected_profile_name: string;
  expected_profile_digest: string;
}) {
  const verifier = createRiddleProofBrowserSealedObservationVerifier();
  const verified = verifyRiddleProofSignedCaptureBundle({
    bundle: input.bundle,
    policy: input.authority.policy,
    trusted_signers: input.authority.trusted_signers,
    verifier_registry: [verifier.registration],
  });
  if (!verified.ok) return failure("preverify", verified);
  if (
    !exactProfileArtifact(verified.bundle, input.expected_profile_digest)
  ) {
    return failure(
      "profile_digest",
      new Error("Signed CTA profile artifact does not match the pinned digest."),
    );
  }
  let observation: VerifiedObservation;
  let derived: DerivedReport;
  try {
    observation = parseObservation(verified.verified_capture.observation);
    if (observation.profile_result.profile_name !== input.expected_profile_name) {
      throw new TypeError("Verified CTA profile name is not the pinned name.");
    }
    derived = derive(observation);
  } catch (error) {
    return failure("observation", error);
  }
  return { ok: true as const, verified, observation, derived };
}

function issueLeaf(input: {
  bundle: RiddleProofSignedCaptureBundle;
  authority: CtaStatusReportAuthority;
  verifier: ObservationVerifier;
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

function trust(protocol: Protocol) {
  return {
    rule_registry: [protocol.rule.registration] as [
      typeof protocol.rule.registration,
    ],
    trusted_rules: [protocol.rule.rule_ref] as [
      typeof protocol.rule.rule_ref,
    ],
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  try {
    return isDeepStrictEqual(
      JSON.parse(JSON.stringify(left)),
      JSON.parse(JSON.stringify(right)),
    );
  } catch {
    return false;
  }
}

function bundleFromClosure(
  value: unknown,
): RiddleProofSignedCaptureBundle | undefined {
  if (
    !isRecord(value)
    || !isRecord(value.grounded_closure)
    || !Array.isArray(value.grounded_closure.groundings)
    || value.grounded_closure.groundings.length === 0
  ) {
    return undefined;
  }
  const bundles = value.grounded_closure.groundings
    .map((grounding: unknown) =>
      isRecord(grounding) ? grounding.bundle : undefined)
    .filter((bundle: unknown) => bundle !== undefined);
  if (
    bundles.length !== value.grounded_closure.groundings.length
    || bundles.some((bundle: unknown) => !sameJson(bundle, bundles[0]))
  ) {
    return undefined;
  }
  return bundles[0] as RiddleProofSignedCaptureBundle;
}

function replayContexts(input: {
  closure: RiddleProofCheckedMeaningClosure;
  authority: CtaStatusReportAuthority;
  protocol: Protocol;
}) {
  const contracts = [
    input.protocol.contracts.capture_bound,
    ...CTA_REQUIREMENT_IDS.map(
      (requirementId) =>
        input.protocol.contracts.requirements[requirementId],
    ),
  ];
  const contexts: RiddleProofGroundedReplayContext[] = [];
  for (const contract of contracts) {
    const matches = input.closure.grounded_closure.closure.certificates.filter(
      (certificate) => sameJson(
        certificate.claim,
        contract.registration.claim,
      ),
    );
    if (matches.length !== 1 || !matches[0]) {
      return failure(
        "replay_contexts",
        new Error("Each CTA report leaf claim must occur exactly once."),
      );
    }
    contexts.push({
      certificate_id: matches[0].certificate_id,
      policy: input.authority.policy,
      trusted_signers: input.authority.trusted_signers,
      verifier_registry: [input.protocol.verifier.registration],
      contract_registry: [contract.registration],
      expected_contract: contract.contract_ref,
    });
  }
  return {
    ok: true as const,
    replay_contexts: contexts as [
      RiddleProofGroundedReplayContext,
      ...RiddleProofGroundedReplayContext[],
    ],
  };
}

export function replayCtaStatusReport(input: {
  checked_closure: unknown;
  authority: CtaStatusReportAuthority;
  expected_root_certificate_id: string;
  expected_scope: RiddleProofSemanticScope;
  expected_profile_name: string;
  expected_profile_digest: string;
}) {
  const bundle = bundleFromClosure(input.checked_closure);
  if (!bundle) {
    return failure(
      "capture_identity",
      new Error("Every CTA report leaf must use one exact signed bundle."),
    );
  }
  const verified = preverify({
    bundle,
    authority: input.authority,
    expected_profile_name: input.expected_profile_name,
    expected_profile_digest: input.expected_profile_digest,
  });
  if (!verified.ok) return verified;
  const protocolResult = createProtocol({
    expected_scope: input.expected_scope,
    expected_profile_name: input.expected_profile_name,
    expected_profile_digest: input.expected_profile_digest,
    derived: verified.derived,
  });
  if (!protocolResult.ok) return protocolResult;
  const closure = input.checked_closure as RiddleProofCheckedMeaningClosure;
  const contexts = replayContexts({
    closure,
    authority: input.authority,
    protocol: protocolResult.protocol,
  });
  if (!contexts.ok) return contexts;
  const reportTrust = trust(protocolResult.protocol);
  const matched = matchRiddleProofCheckedMeaningClosure({
    checked_closure: input.checked_closure,
    replay_contexts: contexts.replay_contexts,
    ...reportTrust,
    expected_root_certificate_id: input.expected_root_certificate_id,
    expected_scope: input.expected_scope,
    expected_claim: protocolResult.protocol.expected_root_claim,
    expected_root_rule: protocolResult.protocol.rule.rule_ref,
  });
  if (!matched.ok) return failure("checked_replay", matched);
  const explanation = explainRiddleProofCheckedMeaningClosure({
    checked_closure: matched.checked_closure,
    replay_contexts: contexts.replay_contexts,
    ...reportTrust,
  });
  if (!explanation.ok) return failure("explanation", explanation);
  const requirementCertificateIds = Object.fromEntries(
    CTA_REQUIREMENT_IDS.map((requirementId) => {
      const expected =
        protocolResult.protocol.contracts.requirements[requirementId]
          .registration.claim;
      const matches =
        matched.checked_closure.grounded_closure.closure.certificates.filter(
          ({ claim: observed }) => sameJson(observed, expected),
        );
      if (matches.length !== 1 || !matches[0]) {
        throw new Error(
          `Replayed CTA report lacks one exact ${requirementId} leaf.`,
        );
      }
      return [requirementId, matches[0].certificate_id];
    }),
  ) as Record<CtaRequirementId, string>;
  return {
    ok: true as const,
    version: CTA_STATUS_REPORT_VERSION,
    root_certificate: matched.root_certificate,
    checked_closure: matched.checked_closure,
    replay_contexts: contexts.replay_contexts,
    trust: reportTrust,
    profile_status: verified.derived.profile_status,
    requirements: Object.fromEntries(
      CTA_REQUIREMENT_IDS.map((requirementId) => [
        requirementId,
        {
          status:
            verified.derived.requirements[requirementId].status,
          evidence_ids: [requirementCertificateIds[requirementId]],
          ...(verified.derived.requirements[requirementId].diagnostic_code
            === undefined
            ? {}
            : {
                diagnostic_code:
                  verified.derived.requirements[requirementId]
                    .diagnostic_code,
              }),
        },
      ]),
    ) as unknown as Readonly<Record<CtaRequirementId, {
      status: CtaRequirementStatus;
      evidence_ids: readonly string[];
      diagnostic_code?: string;
    }>>,
    explanation: explanation.explanation,
  };
}

export type CtaStatusReport = Extract<
  ReturnType<typeof replayCtaStatusReport>,
  { ok: true }
>;

export function assessCtaStatusReport(input: {
  report: CtaStatusReport;
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

export function createCtaStatusReport(input: {
  bundle: RiddleProofSignedCaptureBundle;
  authority: CtaStatusReportAuthority;
  expected_scope: RiddleProofSemanticScope;
  expected_profile_name: string;
  expected_profile_digest: string;
  root_issued_at: string;
}) {
  const verified = preverify({
    bundle: input.bundle,
    authority: input.authority,
    expected_profile_name: input.expected_profile_name,
    expected_profile_digest: input.expected_profile_digest,
  });
  if (!verified.ok) return verified;
  const protocolResult = createProtocol({
    expected_scope: input.expected_scope,
    expected_profile_name: input.expected_profile_name,
    expected_profile_digest: input.expected_profile_digest,
    derived: verified.derived,
  });
  if (!protocolResult.ok) return protocolResult;
  const protocol = protocolResult.protocol;
  const binding = issueLeaf({
    bundle: input.bundle,
    authority: input.authority,
    verifier: protocol.verifier,
    contract: protocol.contracts.capture_bound,
  });
  if (!binding.ok) return binding;
  const requirements = {} as Record<
    CtaRequirementId,
    Extract<ReturnType<typeof issueLeaf>, { ok: true }>
  >;
  for (const requirementId of CTA_REQUIREMENT_IDS) {
    const leaf = issueLeaf({
      bundle: input.bundle,
      authority: input.authority,
      verifier: protocol.verifier,
      contract: protocol.contracts.requirements[requirementId],
    });
    if (!leaf.ok) return failure(`leaf:${requirementId}`, leaf);
    requirements[requirementId] = leaf;
  }
  const reportTrust = trust(protocol);
  const replayContextList = [
    binding.replay_context,
    ...CTA_REQUIREMENT_IDS.map(
      (requirementId) => requirements[requirementId].replay_context,
    ),
  ] as [
    RiddleProofGroundedReplayContext,
    ...RiddleProofGroundedReplayContext[],
  ];
  const root = composeRiddleProofCheckedMeaningClosures({
    expected_rule: protocol.rule.rule_ref,
    closures: [
      binding.checked_closure,
      ...CTA_REQUIREMENT_IDS.map(
        (requirementId) => requirements[requirementId].checked_closure,
      ),
    ] as [unknown, ...unknown[]],
    issued_at: input.root_issued_at,
    replay_contexts: replayContextList,
    ...reportTrust,
  });
  if (!root.ok) return failure("compose", root);
  return replayCtaStatusReport({
    checked_closure: root.checked_closure,
    authority: input.authority,
    expected_root_certificate_id: root.certificate.certificate_id,
    expected_scope: input.expected_scope,
    expected_profile_name: input.expected_profile_name,
    expected_profile_digest: input.expected_profile_digest,
  });
}
