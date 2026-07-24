import { isDeepStrictEqual } from "node:util";

import {
  composeRiddleProofCheckedMeaningClosures,
  createRiddleProofCheckedMeaningRule,
  matchRiddleProofCheckedMeaningClosure,
  type RiddleProofCheckedMeaningClosure,
  type RiddleProofCheckedMeaningRuleDefinition,
  type RiddleProofCheckedMeaningRuleRef,
  type RiddleProofCheckedMeaningRuleRegistration,
  type RiddleProofGroundedReplayContext,
  type RiddleProofSemanticClaim,
  type RiddleProofSemanticScope,
} from "@riddledc/riddle-proof-core";

import {
  RIDDLE_PROOF_BROWSER_SEALED_CLAIMS,
  createRiddleProofBrowserSealedReplayContexts,
  createRiddleProofBrowserSealedProtocol,
  replayRiddleProofBrowserSealedProof,
  type RiddleProofBrowserSealedEvidenceAuthority,
  type RiddleProofBrowserSealedProtocol,
} from "./sealedProof";

export const RIDDLE_PROOF_BROWSER_TRANSITION_PROTOCOL_VERSION =
  "riddle-proof.browser-transition-protocol.v3" as const;

export const RIDDLE_PROOF_BROWSER_TRANSITION_RULE_MAX_AGE_MS = 30 * 60 * 1000;

export const RIDDLE_PROOF_BROWSER_TRANSITION_CLAIMS = {
  transition_observed: {
    claim_id: "riddle-proof.browser.transition-observed",
    claim_version: "1",
  },
  transition_survived_reload: {
    claim_id: "riddle-proof.browser.transition-survived-reload",
    claim_version: "1",
  },
  transition_visible_in_fresh_context: {
    claim_id: "riddle-proof.browser.transition-visible-in-fresh-context",
    claim_version: "1",
  },
  durable_state_transition_observed: {
    claim_id: "riddle-proof.browser.durable-state-transition-observed",
    claim_version: "1",
  },
} as const;

const SCOPE_PARAMETER_NAMES = [
  "repository",
  "revision",
  "environment",
  "target",
  "proof_attempt",
] as const;

const TRANSITION_BASE_PARAMETER_NAMES = [
  ...SCOPE_PARAMETER_NAMES,
  "transition_id",
  "before_profile_name",
  "before_profile_digest",
  "action_profile_name",
  "action_profile_digest",
] as const;

const RELOAD_PARAMETER_NAMES = [
  ...TRANSITION_BASE_PARAMETER_NAMES,
  "reload_profile_name",
  "reload_profile_digest",
] as const;

const FRESH_PARAMETER_NAMES = [
  ...TRANSITION_BASE_PARAMETER_NAMES,
  "fresh_profile_name",
  "fresh_profile_digest",
] as const;

const ROOT_PARAMETER_NAMES = [
  ...RELOAD_PARAMETER_NAMES,
  "fresh_profile_name",
  "fresh_profile_digest",
] as const;

export type RiddleProofBrowserTransitionProfile = {
  profile_name: string;
  profile_digest: string;
};

export type RiddleProofBrowserTransitionProfiles = {
  before: RiddleProofBrowserTransitionProfile;
  action: RiddleProofBrowserTransitionProfile;
  reload: RiddleProofBrowserTransitionProfile;
  fresh_context: RiddleProofBrowserTransitionProfile;
};

const BROWSER_TRANSITION_PROFILE_ROLES = [
  "before",
  "action",
  "reload",
  "fresh_context",
] as const;

type RiddleProofBrowserTransitionCapturePoint = {
  bundle_id: string;
  captured_at: string;
};

export type RiddleProofBrowserTransitionCheckpoint = {
  root_certificate: {
    certificate_id: string;
  };
  checked_closure: unknown;
};

export type RiddleProofBrowserTransitionAuthorities = Record<
  keyof RiddleProofBrowserTransitionProfiles,
  RiddleProofBrowserSealedEvidenceAuthority
>;

export type RiddleProofBrowserTransitionError = {
  code: "browser_transition_protocol_invalid";
  stage: string;
  message: string;
  cause?: unknown;
};

function failure(stage: string, cause: unknown): {
  ok: false;
  error: RiddleProofBrowserTransitionError;
} {
  const message = (() => {
    if (cause && typeof cause === "object" && "error" in cause) {
      const error = (cause as { error?: { message?: unknown } }).error;
      if (typeof error?.message === "string") return error.message;
    }
    if (cause instanceof Error) return cause.message;
    return `Browser transition proof failed at ${stage}.`;
  })();
  return {
    ok: false,
    error: {
      code: "browser_transition_protocol_invalid",
      stage,
      message,
      cause,
    },
  };
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

function scopeParameters(scope: RiddleProofSemanticScope) {
  return {
    repository: scope.repository,
    revision: scope.revision,
    environment: scope.environment,
    target: scope.target,
    proof_attempt: scope.proof_attempt,
  };
}

function transitionBaseParameters(input: {
  scope: RiddleProofSemanticScope;
  transition_id: string;
  profiles: RiddleProofBrowserTransitionProfiles;
}) {
  return {
    ...scopeParameters(input.scope),
    transition_id: input.transition_id,
    before_profile_name: input.profiles.before.profile_name,
    before_profile_digest: input.profiles.before.profile_digest,
    action_profile_name: input.profiles.action.profile_name,
    action_profile_digest: input.profiles.action.profile_digest,
  };
}

function expectedRootParameters(input: {
  scope: RiddleProofSemanticScope;
  transition_id: string;
  profiles: RiddleProofBrowserTransitionProfiles;
}) {
  return {
    ...transitionBaseParameters(input),
    reload_profile_name: input.profiles.reload.profile_name,
    reload_profile_digest: input.profiles.reload.profile_digest,
    fresh_profile_name: input.profiles.fresh_context.profile_name,
    fresh_profile_digest: input.profiles.fresh_context.profile_digest,
  };
}

function anyParameters(names: readonly string[]) {
  return Object.fromEntries(names.map((name) => [name, { op: "any" as const }]));
}

function projectedParameters(names: readonly string[], premiseIndex: number) {
  return Object.fromEntries(names.map((name) => [name, {
    op: "from_premise" as const,
    premise_index: premiseIndex,
    parameter: name,
  }]));
}

function equalities(names: readonly string[]) {
  return names.map((parameter) => ({
    members: [
      { premise_index: 0, parameter },
      { premise_index: 1, parameter },
    ] as [
      { premise_index: number; parameter: string },
      { premise_index: number; parameter: string },
    ],
  })) as unknown as RiddleProofCheckedMeaningRuleDefinition["constraints"]["parameter_equalities"];
}

function sealedPremise(profile: RiddleProofBrowserTransitionProfile) {
  return {
    ...RIDDLE_PROOF_BROWSER_SEALED_CLAIMS.sealed_profile_satisfied,
    parameters: {
      ...anyParameters(SCOPE_PARAMETER_NAMES),
      profile_name: { op: "equals" as const, value: profile.profile_name },
      profile_digest: { op: "equals" as const, value: profile.profile_digest },
    },
  };
}

function fixedTransitionRule(input: {
  rule_id: string;
  label: string;
  premises: RiddleProofCheckedMeaningRuleDefinition["premises"];
  conclusion: RiddleProofCheckedMeaningRuleDefinition["conclusion"];
  equality_parameters: readonly string[];
}) {
  return createRiddleProofCheckedMeaningRule({
    definition: {
      rule_id: input.rule_id,
      rule_version: "1",
      label: input.label,
      premises: input.premises,
      conclusion: input.conclusion,
      constraints: {
        all_of: true,
        parameter_equalities: equalities(input.equality_parameters),
        ordered_premise_chronology: true,
        max_age_ms: RIDDLE_PROOF_BROWSER_TRANSITION_RULE_MAX_AGE_MS,
      },
    } satisfies RiddleProofCheckedMeaningRuleDefinition,
  });
}

function transitionRules(input: {
  transition_id: string;
  profiles: RiddleProofBrowserTransitionProfiles;
}) {
  const transitionObserved = fixedTransitionRule({
    rule_id: "riddle-proof.browser.transition-observed",
    label: "Combine the before-state witness with the action and immediate after-state witness",
    premises: [sealedPremise(input.profiles.before), sealedPremise(input.profiles.action)],
    conclusion: {
      ...RIDDLE_PROOF_BROWSER_TRANSITION_CLAIMS.transition_observed,
      label: "The declared browser transition sequence was observed",
      parameters: {
        ...projectedParameters(SCOPE_PARAMETER_NAMES, 0),
        transition_id: { op: "literal", value: input.transition_id },
        before_profile_name: { op: "literal", value: input.profiles.before.profile_name },
        before_profile_digest: { op: "literal", value: input.profiles.before.profile_digest },
        action_profile_name: { op: "literal", value: input.profiles.action.profile_name },
        action_profile_digest: { op: "literal", value: input.profiles.action.profile_digest },
      },
    },
    equality_parameters: SCOPE_PARAMETER_NAMES,
  });
  if ("error" in transitionObserved) return failure("transition_observed_rule", transitionObserved);

  const survivedReload = fixedTransitionRule({
    rule_id: "riddle-proof.browser.transition-survived-reload",
    label: "Combine the observed transition with an independently sealed reload readback",
    premises: [
      {
        ...RIDDLE_PROOF_BROWSER_TRANSITION_CLAIMS.transition_observed,
        parameters: anyParameters(TRANSITION_BASE_PARAMETER_NAMES),
      },
      sealedPremise(input.profiles.reload),
    ],
    conclusion: {
      ...RIDDLE_PROOF_BROWSER_TRANSITION_CLAIMS.transition_survived_reload,
      label: "The observed browser transition survived reload",
      parameters: {
        ...projectedParameters(TRANSITION_BASE_PARAMETER_NAMES, 0),
        reload_profile_name: { op: "literal", value: input.profiles.reload.profile_name },
        reload_profile_digest: { op: "literal", value: input.profiles.reload.profile_digest },
      },
    },
    equality_parameters: SCOPE_PARAMETER_NAMES,
  });
  if ("error" in survivedReload) return failure("transition_survived_reload_rule", survivedReload);

  const visibleFresh = fixedTransitionRule({
    rule_id: "riddle-proof.browser.transition-visible-in-fresh-context",
    label: "Combine the observed transition with an independently sealed fresh-context readback",
    premises: [
      {
        ...RIDDLE_PROOF_BROWSER_TRANSITION_CLAIMS.transition_observed,
        parameters: anyParameters(TRANSITION_BASE_PARAMETER_NAMES),
      },
      sealedPremise(input.profiles.fresh_context),
    ],
    conclusion: {
      ...RIDDLE_PROOF_BROWSER_TRANSITION_CLAIMS.transition_visible_in_fresh_context,
      label: "The observed browser transition was visible in a fresh browser context",
      parameters: {
        ...projectedParameters(TRANSITION_BASE_PARAMETER_NAMES, 0),
        fresh_profile_name: { op: "literal", value: input.profiles.fresh_context.profile_name },
        fresh_profile_digest: { op: "literal", value: input.profiles.fresh_context.profile_digest },
      },
    },
    equality_parameters: SCOPE_PARAMETER_NAMES,
  });
  if ("error" in visibleFresh) return failure("transition_visible_fresh_context_rule", visibleFresh);

  const durable = fixedTransitionRule({
    rule_id: "riddle-proof.browser.durable-state-transition-observed",
    label: "Combine reload and fresh-context readbacks of the same observed browser transition",
    premises: [
      {
        ...RIDDLE_PROOF_BROWSER_TRANSITION_CLAIMS.transition_survived_reload,
        parameters: anyParameters(RELOAD_PARAMETER_NAMES),
      },
      {
        ...RIDDLE_PROOF_BROWSER_TRANSITION_CLAIMS.transition_visible_in_fresh_context,
        parameters: anyParameters(FRESH_PARAMETER_NAMES),
      },
    ],
    conclusion: {
      ...RIDDLE_PROOF_BROWSER_TRANSITION_CLAIMS.durable_state_transition_observed,
      label: "The declared state transition was observed through reload and a fresh browser context",
      parameters: {
        ...projectedParameters(RELOAD_PARAMETER_NAMES, 0),
        fresh_profile_name: {
          op: "from_premise",
          premise_index: 1,
          parameter: "fresh_profile_name",
        },
        fresh_profile_digest: {
          op: "from_premise",
          premise_index: 1,
          parameter: "fresh_profile_digest",
        },
      },
    },
    equality_parameters: TRANSITION_BASE_PARAMETER_NAMES,
  });
  if ("error" in durable) return failure("durable_state_transition_rule", durable);

  return {
    ok: true as const,
    rules: {
      transition_observed: transitionObserved,
      transition_survived_reload: survivedReload,
      transition_visible_in_fresh_context: visibleFresh,
      durable_state_transition_observed: durable,
    },
  };
}

export function createRiddleProofBrowserTransitionProtocol(input: {
  expected_scope: RiddleProofSemanticScope;
  transition_id: string;
  profiles: RiddleProofBrowserTransitionProfiles;
}) {
  if (!nonempty(input.transition_id)) {
    return failure("transition_id", new Error("Browser transition_id must be a non-empty string."));
  }
  if (input.transition_id !== input.expected_scope.proof_attempt) {
    return failure(
      "transition_id_scope",
      new Error("Browser transition_id must equal the grounded scope proof_attempt."),
    );
  }
  const profileDigests = Object.values(input.profiles || {}).map((profile) =>
    profile?.profile_digest);
  if (profileDigests.length !== 4 || new Set(profileDigests).size !== 4) {
    return failure(
      "profiles_not_independent",
      new Error("Before, action, reload, and fresh-context profiles must have four distinct digests."),
    );
  }

  const sealedProtocols: Partial<Record<keyof RiddleProofBrowserTransitionProfiles, RiddleProofBrowserSealedProtocol>> = {};
  for (const role of ["before", "action", "reload", "fresh_context"] as const) {
    const profile = input.profiles[role];
    if (!profile || !nonempty(profile.profile_name)) {
      return failure(`profile:${role}`, new Error(`Browser transition ${role} profile_name is required.`));
    }
    const sealed = createRiddleProofBrowserSealedProtocol({
      expected_scope: input.expected_scope,
      expected_profile_name: profile.profile_name,
      expected_profile_digest: profile.profile_digest,
    });
    if ("error" in sealed) return failure(`profile:${role}`, sealed);
    sealedProtocols[role] = sealed.protocol;
  }

  const rules = transitionRules({
    transition_id: input.transition_id,
    profiles: input.profiles,
  });
  if ("error" in rules) return rules;

  const expectedClaim: RiddleProofSemanticClaim = {
    ...RIDDLE_PROOF_BROWSER_TRANSITION_CLAIMS.durable_state_transition_observed,
    label: "The declared state transition was observed through reload and a fresh browser context",
    parameters: expectedRootParameters({
      scope: input.expected_scope,
      transition_id: input.transition_id,
      profiles: input.profiles,
    }),
  };

  return {
    ok: true as const,
    protocol: {
      version: RIDDLE_PROOF_BROWSER_TRANSITION_PROTOCOL_VERSION,
      expected_scope: { ...input.expected_scope },
      transition_id: input.transition_id,
      profiles: JSON.parse(JSON.stringify(input.profiles)) as RiddleProofBrowserTransitionProfiles,
      sealed_protocols: sealedProtocols as Record<
        keyof RiddleProofBrowserTransitionProfiles,
        RiddleProofBrowserSealedProtocol
      >,
      rules: rules.rules,
      expected_root_claim: expectedClaim,
    },
  };
}

export type RiddleProofBrowserTransitionProtocol = Extract<
  ReturnType<typeof createRiddleProofBrowserTransitionProtocol>,
  { ok: true }
>["protocol"];

function uniqueRuleTrust(protocol: RiddleProofBrowserTransitionProtocol) {
  const registrations = [
    protocol.sealed_protocols.before.rules.target_confirmed.registration,
    protocol.sealed_protocols.before.rules.behavior_confirmed.registration,
    protocol.sealed_protocols.before.rules.sealed_profile_satisfied.registration,
    protocol.rules.transition_observed.registration,
    protocol.rules.transition_survived_reload.registration,
    protocol.rules.transition_visible_in_fresh_context.registration,
    protocol.rules.durable_state_transition_observed.registration,
  ] as [
    RiddleProofCheckedMeaningRuleRegistration,
    ...RiddleProofCheckedMeaningRuleRegistration[],
  ];
  return {
    rule_registry: registrations,
    trusted_rules: registrations.map((registration) => ({
      rule_id: registration.rule_id,
      rule_version: registration.rule_version,
      engine: registration.engine,
      implementation_digest: registration.implementation_digest,
    })) as [RiddleProofCheckedMeaningRuleRef, ...RiddleProofCheckedMeaningRuleRef[]],
  };
}

function mergeReplayContexts(
  checkpoints: Array<{
    replay_contexts: [RiddleProofGroundedReplayContext, ...RiddleProofGroundedReplayContext[]];
  }>,
): [RiddleProofGroundedReplayContext, ...RiddleProofGroundedReplayContext[]] | undefined {
  const contexts: RiddleProofGroundedReplayContext[] = [];
  const byCertificate = new Map<string, RiddleProofGroundedReplayContext>();
  for (const checkpoint of checkpoints) {
    for (const context of checkpoint.replay_contexts) {
      const existing = byCertificate.get(context.certificate_id);
      if (existing) {
        if (!sameJsonData(existing, context)) return undefined;
        continue;
      }
      byCertificate.set(context.certificate_id, context);
      contexts.push(context);
    }
  }
  return contexts.length
    ? contexts as [RiddleProofGroundedReplayContext, ...RiddleProofGroundedReplayContext[]]
    : undefined;
}

function replayCheckpoint(input: {
  checkpoint: RiddleProofBrowserTransitionCheckpoint;
  authority: RiddleProofBrowserSealedEvidenceAuthority;
  scope: RiddleProofSemanticScope;
  profile: RiddleProofBrowserTransitionProfile;
  protocol: RiddleProofBrowserSealedProtocol;
}) {
  return replayRiddleProofBrowserSealedProof({
    checked_closure: input.checkpoint.checked_closure,
    authority: input.authority,
    protocol: input.protocol,
    expected_root_certificate_id: input.checkpoint.root_certificate.certificate_id,
    expected_scope: input.scope,
    expected_profile_name: input.profile.profile_name,
    expected_profile_digest: input.profile.profile_digest,
  });
}

function capturePointsFromValidatedClosures(input: {
  checked_closures: RiddleProofCheckedMeaningClosure[];
  profiles: RiddleProofBrowserTransitionProfiles;
}):
  | {
      ok: true;
      capture_points: Record<
        keyof RiddleProofBrowserTransitionProfiles,
        RiddleProofBrowserTransitionCapturePoint
      >;
    }
  | { ok: false; message: string } {
  const roleByDigest = new Map<string, keyof RiddleProofBrowserTransitionProfiles>();
  for (const role of BROWSER_TRANSITION_PROFILE_ROLES) {
    const digest = input.profiles[role].profile_digest;
    if (roleByDigest.has(digest)) {
      return { ok: false, message: "Browser transition profile digests are not unique." };
    }
    roleByDigest.set(digest, role);
  }

  const observations = new Map<
    string,
    Map<string, string>
  >();
  for (const checkedClosure of input.checked_closures) {
    const certificateById = new Map(
      checkedClosure.grounded_closure.closure.certificates.map((certificate) => [
        certificate.certificate_id,
        certificate,
      ]),
    );
    for (const grounding of checkedClosure.grounded_closure.groundings) {
      const certificate = certificateById.get(grounding.certificate_id);
      const profileDigest = certificate?.claim.parameters.profile_digest;
      if (typeof profileDigest !== "string" || !roleByDigest.has(profileDigest)) {
        return {
          ok: false,
          message: "Every grounded browser checkpoint leaf must name one exact expected profile digest.",
        };
      }
      const capturedAt = grounding.bundle.statement.captured_at;
      if (!Number.isFinite(Date.parse(capturedAt))) {
        return { ok: false, message: "Every signed browser checkpoint must have a valid captured_at." };
      }
      const byBundle = observations.get(profileDigest) ?? new Map<string, string>();
      const existingCapturedAt = byBundle.get(grounding.receipt.bundle_id);
      if (existingCapturedAt !== undefined && existingCapturedAt !== capturedAt) {
        return {
          ok: false,
          message: "One signed browser capture bundle cannot have conflicting captured_at values.",
        };
      }
      byBundle.set(grounding.receipt.bundle_id, capturedAt);
      observations.set(profileDigest, byBundle);
    }
  }

  const capturePoints = {} as Record<
    keyof RiddleProofBrowserTransitionProfiles,
    RiddleProofBrowserTransitionCapturePoint
  >;
  for (const role of BROWSER_TRANSITION_PROFILE_ROLES) {
    const digest = input.profiles[role].profile_digest;
    const byBundle = observations.get(digest);
    if (!byBundle || byBundle.size !== 1) {
      return {
        ok: false,
        message: `Profile ${digest} must map to exactly one signed capture bundle and captured_at.`,
      };
    }
    const [bundleId, capturedAt] = byBundle.entries().next().value as [string, string];
    capturePoints[role] = { bundle_id: bundleId, captured_at: capturedAt };
  }
  return { ok: true, capture_points: capturePoints };
}

function signedCaptureChronologyError(
  capturePoints: Record<
    keyof RiddleProofBrowserTransitionProfiles,
    RiddleProofBrowserTransitionCapturePoint
  >,
): Error | undefined {
  const before = Date.parse(capturePoints.before.captured_at);
  const action = Date.parse(capturePoints.action.captured_at);
  const reload = Date.parse(capturePoints.reload.captured_at);
  const fresh = Date.parse(capturePoints.fresh_context.captured_at);
  if (before > action) {
    return new Error("The signed before capture must not be later than the signed action capture.");
  }
  if (action > reload) {
    return new Error("The signed action capture must not be later than the signed reload capture.");
  }
  if (action > fresh) {
    return new Error("The signed action capture must not be later than the signed fresh-context capture.");
  }
  return undefined;
}

export function createRiddleProofBrowserTransition(input: {
  expected_scope: RiddleProofSemanticScope;
  transition_id: string;
  profiles: RiddleProofBrowserTransitionProfiles;
  protocol: RiddleProofBrowserTransitionProtocol;
  checkpoints: {
    before: RiddleProofBrowserTransitionCheckpoint;
    action: RiddleProofBrowserTransitionCheckpoint;
    reload: RiddleProofBrowserTransitionCheckpoint;
    fresh_context: RiddleProofBrowserTransitionCheckpoint;
  };
  authorities: RiddleProofBrowserTransitionAuthorities;
  transition_issued_at: string;
  reload_issued_at: string;
  fresh_context_issued_at: string;
  root_issued_at: string;
}) {
  const expected = createRiddleProofBrowserTransitionProtocol({
    expected_scope: input.expected_scope,
    transition_id: input.transition_id,
    profiles: input.profiles,
  });
  if ("error" in expected) return expected;
  if (!sameJsonData(input.protocol, expected.protocol)) {
    return failure(
      "protocol_trust_root",
      new Error("The supplied browser transition protocol is not the exact deterministic protocol for these profiles."),
    );
  }
  const protocol = expected.protocol;
  if (!input.authorities || typeof input.authorities !== "object") {
    return failure(
      "replay_authority",
      new Error(
        "Browser transition creation requires one independently supplied evidence-authority entry per role.",
      ),
    );
  }

  const validatedCheckpoints: Partial<Record<
    keyof RiddleProofBrowserTransitionProfiles,
    {
      checked_closure: RiddleProofCheckedMeaningClosure;
      replay_contexts: [RiddleProofGroundedReplayContext, ...RiddleProofGroundedReplayContext[]];
    }
  >> = {};
  for (const role of BROWSER_TRANSITION_PROFILE_ROLES) {
    const result = replayCheckpoint({
      checkpoint: input.checkpoints[role],
      authority: input.authorities[role],
      scope: input.expected_scope,
      profile: input.profiles[role],
      protocol: protocol.sealed_protocols[role],
    });
    if (!result.ok) return failure(`checkpoint:${role}`, result);
    if (!("checked_closure" in result) || !("replay_contexts" in result)) {
      return failure(
        `checkpoint:${role}`,
        new Error("Browser checkpoint replay did not return a checked closure."),
      );
    }
    validatedCheckpoints[role] = {
      checked_closure: result.checked_closure,
      replay_contexts: result.replay_contexts,
    };
  }
  const capturePoints = capturePointsFromValidatedClosures({
    checked_closures: BROWSER_TRANSITION_PROFILE_ROLES.map(
      (role) => validatedCheckpoints[role]!.checked_closure,
    ),
    profiles: input.profiles,
  });
  if (capturePoints.ok === false) {
    return failure("signed_capture_chronology", new Error(capturePoints.message));
  }
  const checkpointBundleIds = new Set(
    Object.values(capturePoints.capture_points).map((point) => point.bundle_id),
  );
  if (checkpointBundleIds.size !== 4) {
    return failure(
      "checkpoints_not_independent",
      new Error("A durable browser transition requires four distinct signed capture bundles."),
    );
  }
  const chronologyError = signedCaptureChronologyError(capturePoints.capture_points);
  if (chronologyError) return failure("signed_capture_chronology", chronologyError);

  const mergedReplayContexts = mergeReplayContexts([
    validatedCheckpoints.before!,
    validatedCheckpoints.action!,
    validatedCheckpoints.reload!,
    validatedCheckpoints.fresh_context!,
  ]);
  if (!mergedReplayContexts) {
    return failure("replay_contexts", new Error("Browser transition replay contexts conflict or are empty."));
  }
  const replayContexts = mergedReplayContexts;
  const transitionReplayContexts = mergeReplayContexts([
    validatedCheckpoints.before!,
    validatedCheckpoints.action!,
  ])!;
  const reloadReplayContexts =
    mergeReplayContexts([
      validatedCheckpoints.before!,
      validatedCheckpoints.action!,
      validatedCheckpoints.reload!,
    ])!;
  const freshReplayContexts =
    mergeReplayContexts([
      validatedCheckpoints.before!,
      validatedCheckpoints.action!,
      validatedCheckpoints.fresh_context!,
    ])!;
  const trust = uniqueRuleTrust(protocol);

  const transition = composeRiddleProofCheckedMeaningClosures({
    expected_rule: protocol.rules.transition_observed.rule_ref,
    closures: [
      validatedCheckpoints.before!.checked_closure,
      validatedCheckpoints.action!.checked_closure,
    ],
    issued_at: input.transition_issued_at,
    replay_contexts: transitionReplayContexts,
    rule_registry: trust.rule_registry,
    trusted_rules: trust.trusted_rules,
  });
  if (!transition.ok) return failure("transition_observed_composition", transition);

  const reload = composeRiddleProofCheckedMeaningClosures({
    expected_rule: protocol.rules.transition_survived_reload.rule_ref,
    closures: [transition.checked_closure, validatedCheckpoints.reload!.checked_closure],
    issued_at: input.reload_issued_at,
    replay_contexts: reloadReplayContexts,
    rule_registry: trust.rule_registry,
    trusted_rules: trust.trusted_rules,
  });
  if (!reload.ok) return failure("transition_survived_reload_composition", reload);

  const fresh = composeRiddleProofCheckedMeaningClosures({
    expected_rule: protocol.rules.transition_visible_in_fresh_context.rule_ref,
    closures: [transition.checked_closure, validatedCheckpoints.fresh_context!.checked_closure],
    issued_at: input.fresh_context_issued_at,
    replay_contexts: freshReplayContexts,
    rule_registry: trust.rule_registry,
    trusted_rules: trust.trusted_rules,
  });
  if (!fresh.ok) return failure("transition_visible_fresh_context_composition", fresh);

  const root = composeRiddleProofCheckedMeaningClosures({
    expected_rule: protocol.rules.durable_state_transition_observed.rule_ref,
    closures: [reload.checked_closure, fresh.checked_closure],
    issued_at: input.root_issued_at,
    replay_contexts: replayContexts,
    rule_registry: trust.rule_registry,
    trusted_rules: trust.trusted_rules,
  });
  if (!root.ok) return failure("durable_state_transition_composition", root);

  return {
    ok: true as const,
    root_certificate: root.certificate,
    checked_closure: root.checked_closure,
    replay_contexts: replayContexts,
    branches: {
      transition_observed: transition,
      transition_survived_reload: reload,
      transition_visible_in_fresh_context: fresh,
    },
  };
}

export function replayRiddleProofBrowserTransition(input: {
  checked_closure: unknown;
  authorities: RiddleProofBrowserTransitionAuthorities;
  protocol: RiddleProofBrowserTransitionProtocol;
  expected_root_certificate_id: string;
  expected_scope: RiddleProofSemanticScope;
  transition_id: string;
  profiles: RiddleProofBrowserTransitionProfiles;
}) {
  const expected = createRiddleProofBrowserTransitionProtocol({
    expected_scope: input.expected_scope,
    transition_id: input.transition_id,
    profiles: input.profiles,
  });
  if ("error" in expected) return expected;
  if (!sameJsonData(input.protocol, expected.protocol)) {
    return failure(
      "protocol_trust_root",
      new Error("The supplied browser transition protocol is not the exact deterministic protocol for these profiles."),
    );
  }
  if (!input.authorities || typeof input.authorities !== "object") {
    return failure(
      "replay_authority",
      new Error(
        "Browser transition replay requires one independently supplied evidence-authority entry per role.",
      ),
    );
  }
  const trust = uniqueRuleTrust(expected.protocol);
  const roleReplayContexts: Array<{
    replay_contexts: [RiddleProofGroundedReplayContext, ...RiddleProofGroundedReplayContext[]];
  }> = [];
  for (const role of BROWSER_TRANSITION_PROFILE_ROLES) {
    const replayAuthority = createRiddleProofBrowserSealedReplayContexts({
      checked_closure: input.checked_closure,
      authority: input.authorities[role],
      protocol: expected.protocol.sealed_protocols[role],
    });
    if (replayAuthority.ok === false) {
      return failure(`replay_authority:${role}`, replayAuthority);
    }
    roleReplayContexts.push({ replay_contexts: replayAuthority.replay_contexts });
  }
  const replayContexts = mergeReplayContexts(roleReplayContexts);
  if (!replayContexts) {
    return failure("replay_authority", new Error("Independent browser replay authorities conflict."));
  }
  const matched = matchRiddleProofCheckedMeaningClosure({
    checked_closure: input.checked_closure,
    replay_contexts: replayContexts,
    rule_registry: trust.rule_registry,
    trusted_rules: trust.trusted_rules,
    expected_root_certificate_id: input.expected_root_certificate_id,
    expected_scope: input.expected_scope,
    expected_claim: expected.protocol.expected_root_claim,
    expected_root_rule: expected.protocol.rules.durable_state_transition_observed.rule_ref,
  });
  if (!matched.ok) return matched;

  const capturePoints = capturePointsFromValidatedClosures({
    checked_closures: [matched.checked_closure],
    profiles: input.profiles,
  });
  if (capturePoints.ok === false) {
    return failure("signed_capture_chronology", new Error(capturePoints.message));
  }
  const checkpointBundleIds = new Set(
    Object.values(capturePoints.capture_points).map((point) => point.bundle_id),
  );
  if (checkpointBundleIds.size !== 4) {
    return failure(
      "checkpoints_not_independent",
      new Error("A durable browser transition replay requires four distinct signed capture bundles."),
    );
  }
  const chronologyError = signedCaptureChronologyError(capturePoints.capture_points);
  if (chronologyError) return failure("signed_capture_chronology", chronologyError);

  return { ...matched, replay_contexts: replayContexts };
}
