import { isDeepStrictEqual } from "node:util";

import {
  composeRiddleProofCheckedMeaningClosures,
  createRiddleProofCheckedMeaningAtomicClosure,
  createRiddleProofCheckedMeaningRule,
  createRiddleProofGroundedDeclarativeJsonContract,
  createRiddleProofGroundedDeclarativeJsonVerifier,
  createRiddleProofGroundedSemanticAtomicCertificateClosure,
  createRiddleProofGroundedSemanticCertificate,
  matchRiddleProofCheckedMeaningClosure,
  type RiddleProofCheckedMeaningRuleDefinition,
  type RiddleProofGroundedDeclarativeJsonContractDefinition,
  type RiddleProofGroundedReplayContext,
  type RiddleProofSemanticClaim,
  type RiddleProofSemanticScope,
  type RiddleProofSignedCaptureBundle,
} from "@riddledc/riddle-proof-core";

export const RIDDLE_PROOF_BROWSER_SEALED_PROTOCOL_VERSION =
  "riddle-proof.browser-sealed-profile-protocol.v1" as const;

export const RIDDLE_PROOF_BROWSER_SEALED_RULE_MAX_AGE_MS = 5 * 60 * 1000;

export const RIDDLE_PROOF_BROWSER_SEALED_CLAIMS = {
  capture_bound_to_scope: {
    claim_id: "riddle-proof.browser.capture-bound-to-scope",
    claim_version: "1",
  },
  route_matched: {
    claim_id: "riddle-proof.browser.route-matched",
    claim_version: "1",
  },
  declared_profile_passed: {
    claim_id: "riddle-proof.browser.declared-profile-passed",
    claim_version: "1",
  },
  captured_runtime_clean: {
    claim_id: "riddle-proof.browser.captured-runtime-clean",
    claim_version: "1",
  },
  target_confirmed: {
    claim_id: "riddle-proof.browser.target-confirmed",
    claim_version: "1",
  },
  behavior_confirmed: {
    claim_id: "riddle-proof.browser.behavior-confirmed",
    claim_version: "1",
  },
  sealed_profile_satisfied: {
    claim_id: "riddle-proof.browser.sealed-profile-satisfied",
    claim_version: "1",
  },
} as const;

const COMMON_PARAMETER_NAMES = [
  "repository",
  "revision",
  "environment",
  "target",
  "proof_attempt",
  "profile_name",
] as const;

type GroundedCertificateInput = Parameters<
  typeof createRiddleProofGroundedSemanticCertificate
>[0];

export type RiddleProofBrowserSealedParameters = {
  repository: string;
  revision: string;
  environment: string;
  target: string;
  proof_attempt: string;
  profile_name: string;
};

export type RiddleProofBrowserSealedEvidenceAuthority = {
  policy: GroundedCertificateInput["policy"];
  trusted_signers: GroundedCertificateInput["trusted_signers"];
};

export type RiddleProofBrowserSealedProtocolError = {
  code: "browser_sealed_protocol_invalid";
  stage: string;
  message: string;
  cause?: unknown;
};

function failure(stage: string, cause: unknown): {
  ok: false;
  error: RiddleProofBrowserSealedProtocolError;
} {
  const message = (() => {
    if (cause && typeof cause === "object" && "error" in cause) {
      const error = (cause as { error?: { message?: unknown } }).error;
      if (typeof error?.message === "string") return error.message;
    }
    if (cause instanceof Error) return cause.message;
    return `Browser sealed proof failed at ${stage}.`;
  })();
  return {
    ok: false,
    error: {
      code: "browser_sealed_protocol_invalid",
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

function parametersFor(
  scope: RiddleProofSemanticScope,
  profileName: string,
): RiddleProofBrowserSealedParameters {
  return {
    repository: scope.repository,
    revision: scope.revision,
    environment: scope.environment,
    target: scope.target,
    proof_attempt: scope.proof_attempt,
    profile_name: profileName,
  };
}

function claimFor(
  ref: (typeof RIDDLE_PROOF_BROWSER_SEALED_CLAIMS)[keyof typeof RIDDLE_PROOF_BROWSER_SEALED_CLAIMS],
  label: string,
  parameters: RiddleProofBrowserSealedParameters,
): RiddleProofSemanticClaim {
  return { ...ref, label, parameters };
}

export function createRiddleProofBrowserProfileResultVerifier() {
  return createRiddleProofGroundedDeclarativeJsonVerifier({
    verifier_id: "riddle-proof.browser.profile-result",
    verifier_version: "1",
    program: {
      artifact: {
        artifact_id: "profile-result.json",
        role: "derived_result",
        media_type: "application/json",
      },
      pointer: "",
    },
  });
}

function contractDefinitions(
  scope: RiddleProofSemanticScope,
  profileName: string,
): Record<
  "capture_bound_to_scope" | "route_matched" | "declared_profile_passed" | "captured_runtime_clean",
  RiddleProofGroundedDeclarativeJsonContractDefinition
> {
  const parameters = parametersFor(scope, profileName);
  return {
    capture_bound_to_scope: {
      contract_id: "riddle-proof.browser.capture-bound-to-scope",
      contract_version: "1",
      label: "Bind the signed browser result to the exact semantic scope and profile",
      claim: claimFor(
        RIDDLE_PROOF_BROWSER_SEALED_CLAIMS.capture_bound_to_scope,
        "The signed browser result is bound to this exact scope and profile",
        parameters,
      ),
      program: {
        all: [
          { op: "equals", source: "scope", pointer: "/repository", value: scope.repository },
          { op: "equals", source: "scope", pointer: "/revision", value: scope.revision },
          { op: "equals", source: "scope", pointer: "/environment", value: scope.environment },
          { op: "equals", source: "scope", pointer: "/target", value: scope.target },
          { op: "equals", source: "scope", pointer: "/proof_attempt", value: scope.proof_attempt },
          {
            op: "equals",
            source: "observation",
            pointer: "/version",
            value: "riddle-proof.profile-result.v1",
          },
          { op: "equals", source: "observation", pointer: "/profile_name", value: profileName },
        ],
      },
    },
    route_matched: {
      contract_id: "riddle-proof.browser.route-matched",
      contract_version: "1",
      label: "Require the declared route to be the route actually matched",
      claim: claimFor(
        RIDDLE_PROOF_BROWSER_SEALED_CLAIMS.route_matched,
        "The declared browser route matched the exact target",
        parameters,
      ),
      program: {
        all: [
          { op: "equals", source: "observation", pointer: "/profile_name", value: profileName },
          { op: "equals", source: "observation", pointer: "/route/requested", value: scope.target },
          { op: "equals", source: "observation", pointer: "/route/matched", value: true },
        ],
      },
    },
    declared_profile_passed: {
      contract_id: "riddle-proof.browser.declared-profile-passed",
      contract_version: "1",
      label: "Require the declared browser profile to have passed",
      claim: claimFor(
        RIDDLE_PROOF_BROWSER_SEALED_CLAIMS.declared_profile_passed,
        "Every check in the declared browser profile passed",
        parameters,
      ),
      program: {
        all: [
          { op: "equals", source: "observation", pointer: "/profile_name", value: profileName },
          { op: "equals", source: "observation", pointer: "/status", value: "passed" },
          { op: "type_is", source: "observation", pointer: "/checks", type: "array" },
        ],
      },
    },
    captured_runtime_clean: {
      contract_id: "riddle-proof.browser.captured-runtime-clean",
      contract_version: "1",
      label: "Require complete browser evidence with no captured runtime errors",
      claim: claimFor(
        RIDDLE_PROOF_BROWSER_SEALED_CLAIMS.captured_runtime_clean,
        "The captured browser runtime was complete and clean",
        parameters,
      ),
      program: {
        all: [
          { op: "equals", source: "observation", pointer: "/profile_name", value: profileName },
          { op: "equals", source: "observation", pointer: "/evidence/console/fatal_count", value: 0 },
          { op: "equals", source: "observation", pointer: "/evidence/page_errors", value: [] },
          { op: "equals", source: "observation", pointer: "/evidence/dom_summary/partial", value: false },
        ],
      },
    },
  };
}

function anyParameters() {
  return Object.fromEntries(COMMON_PARAMETER_NAMES.map((name) => [name, { op: "any" as const }]));
}

function projectedParameters() {
  return Object.fromEntries(COMMON_PARAMETER_NAMES.map((name) => [name, {
    op: "from_premise" as const,
    premise_index: 0,
    parameter: name,
  }]));
}

function parameterEqualities() {
  return COMMON_PARAMETER_NAMES.map((parameter) => ({
    members: [
      { premise_index: 0, parameter },
      { premise_index: 1, parameter },
    ] as [
      { premise_index: number; parameter: string },
      { premise_index: number; parameter: string },
    ],
  })) as [
    { members: [{ premise_index: number; parameter: string }, { premise_index: number; parameter: string }] },
    ...Array<{ members: [{ premise_index: number; parameter: string }, { premise_index: number; parameter: string }] }>,
  ];
}

function ruleDefinition(
  ruleId: string,
  label: string,
  left: (typeof RIDDLE_PROOF_BROWSER_SEALED_CLAIMS)[keyof typeof RIDDLE_PROOF_BROWSER_SEALED_CLAIMS],
  right: (typeof RIDDLE_PROOF_BROWSER_SEALED_CLAIMS)[keyof typeof RIDDLE_PROOF_BROWSER_SEALED_CLAIMS],
  conclusionRef: (typeof RIDDLE_PROOF_BROWSER_SEALED_CLAIMS)[keyof typeof RIDDLE_PROOF_BROWSER_SEALED_CLAIMS],
  conclusionLabel: string,
): RiddleProofCheckedMeaningRuleDefinition {
  return {
    rule_id: ruleId,
    rule_version: "1",
    label,
    premises: [
      { ...left, parameters: anyParameters() },
      { ...right, parameters: anyParameters() },
    ],
    conclusion: {
      ...conclusionRef,
      label: conclusionLabel,
      parameters: projectedParameters(),
    },
    constraints: {
      all_of: true,
      parameter_equalities: parameterEqualities(),
      ordered_premise_chronology: true,
      max_age_ms: RIDDLE_PROOF_BROWSER_SEALED_RULE_MAX_AGE_MS,
    },
  };
}

export function createRiddleProofBrowserSealedProtocol(input: {
  expected_scope: RiddleProofSemanticScope;
  expected_profile_name: string;
}) {
  const verifier = createRiddleProofBrowserProfileResultVerifier();
  if (!verifier.ok) return failure("verifier", verifier);

  const definitions = contractDefinitions(input.expected_scope, input.expected_profile_name);
  const captureBound = createRiddleProofGroundedDeclarativeJsonContract(
    definitions.capture_bound_to_scope,
  );
  if (!captureBound.ok) return failure("capture_bound_to_scope_contract", captureBound);
  const routeMatched = createRiddleProofGroundedDeclarativeJsonContract(definitions.route_matched);
  if (!routeMatched.ok) return failure("route_matched_contract", routeMatched);
  const profilePassed = createRiddleProofGroundedDeclarativeJsonContract(
    definitions.declared_profile_passed,
  );
  if (!profilePassed.ok) return failure("declared_profile_passed_contract", profilePassed);
  const runtimeClean = createRiddleProofGroundedDeclarativeJsonContract(
    definitions.captured_runtime_clean,
  );
  if (!runtimeClean.ok) return failure("captured_runtime_clean_contract", runtimeClean);

  const targetConfirmed = createRiddleProofCheckedMeaningRule({
    definition: ruleDefinition(
      "riddle-proof.browser.target-confirmed",
      "Combine exact capture identity with the matched browser route",
      RIDDLE_PROOF_BROWSER_SEALED_CLAIMS.capture_bound_to_scope,
      RIDDLE_PROOF_BROWSER_SEALED_CLAIMS.route_matched,
      RIDDLE_PROOF_BROWSER_SEALED_CLAIMS.target_confirmed,
      "This exact browser target and profile were confirmed",
    ),
  });
  if (!targetConfirmed.ok) return failure("target_confirmed_rule", targetConfirmed);
  const behaviorConfirmed = createRiddleProofCheckedMeaningRule({
    definition: ruleDefinition(
      "riddle-proof.browser.behavior-confirmed",
      "Combine declared profile success with a clean captured runtime",
      RIDDLE_PROOF_BROWSER_SEALED_CLAIMS.declared_profile_passed,
      RIDDLE_PROOF_BROWSER_SEALED_CLAIMS.captured_runtime_clean,
      RIDDLE_PROOF_BROWSER_SEALED_CLAIMS.behavior_confirmed,
      "The declared profile behavior completed with a clean captured runtime",
    ),
  });
  if (!behaviorConfirmed.ok) return failure("behavior_confirmed_rule", behaviorConfirmed);
  const sealedProfileSatisfied = createRiddleProofCheckedMeaningRule({
    definition: ruleDefinition(
      "riddle-proof.browser.sealed-profile-satisfied",
      "Combine the confirmed target and behavior for one exact browser proof scope",
      RIDDLE_PROOF_BROWSER_SEALED_CLAIMS.target_confirmed,
      RIDDLE_PROOF_BROWSER_SEALED_CLAIMS.behavior_confirmed,
      RIDDLE_PROOF_BROWSER_SEALED_CLAIMS.sealed_profile_satisfied,
      "The declared browser profile was satisfied for this exact sealed scope",
    ),
  });
  if (!sealedProfileSatisfied.ok) {
    return failure("sealed_profile_satisfied_rule", sealedProfileSatisfied);
  }

  return {
    ok: true as const,
    protocol: {
      version: RIDDLE_PROOF_BROWSER_SEALED_PROTOCOL_VERSION,
      verifier: {
        verifier_ref: verifier.verifier_ref,
        registration: verifier.registration,
      },
      contracts: {
        capture_bound_to_scope: captureBound,
        route_matched: routeMatched,
        declared_profile_passed: profilePassed,
        captured_runtime_clean: runtimeClean,
      },
      rules: {
        target_confirmed: targetConfirmed,
        behavior_confirmed: behaviorConfirmed,
        sealed_profile_satisfied: sealedProfileSatisfied,
      },
      expected_root_claim: claimFor(
        RIDDLE_PROOF_BROWSER_SEALED_CLAIMS.sealed_profile_satisfied,
        "The declared browser profile was satisfied for this exact sealed scope",
        parametersFor(input.expected_scope, input.expected_profile_name),
      ),
    },
  };
}

export type RiddleProofBrowserSealedProtocol = Extract<
  ReturnType<typeof createRiddleProofBrowserSealedProtocol>,
  { ok: true }
>["protocol"];

type LeafContract = RiddleProofBrowserSealedProtocol["contracts"][keyof RiddleProofBrowserSealedProtocol["contracts"]];

function issueLeaf(input: {
  bundle: RiddleProofSignedCaptureBundle;
  authority: RiddleProofBrowserSealedEvidenceAuthority;
  protocol: RiddleProofBrowserSealedProtocol;
  contract: LeafContract;
  issued_at: string;
}) {
  const configuration = {
    policy: input.authority.policy,
    trusted_signers: input.authority.trusted_signers,
    verifier_registry: [input.protocol.verifier.registration] as [
      typeof input.protocol.verifier.registration,
    ],
    contract_registry: [input.contract.registration] as [typeof input.contract.registration],
    expected_contract: input.contract.contract_ref,
  };
  const issued = createRiddleProofGroundedSemanticCertificate({
    bundle: input.bundle,
    ...configuration,
    issued_at: input.issued_at,
  });
  if (!issued.ok) return failure(`leaf:${input.contract.contract_ref.contract_id}`, issued);
  const grounded = createRiddleProofGroundedSemanticAtomicCertificateClosure({
    certificate: issued.certificate,
    grounding: issued.grounding,
    configuration,
  });
  if (!grounded.ok) return failure(`atomic-grounding:${input.contract.contract_ref.contract_id}`, grounded);
  const replayContext: RiddleProofGroundedReplayContext = {
    certificate_id: issued.certificate.certificate_id,
    ...configuration,
  };
  const checked = createRiddleProofCheckedMeaningAtomicClosure({
    grounded_closure: grounded.grounded_closure,
    replay_contexts: [replayContext],
  });
  if (!checked.ok) return failure(`atomic-meaning:${input.contract.contract_ref.contract_id}`, checked);
  return {
    ok: true as const,
    certificate: issued.certificate,
    checked_closure: checked.checked_closure,
    replay_context: replayContext,
  };
}

export function createRiddleProofBrowserSealedProof(input: {
  bundle: RiddleProofSignedCaptureBundle;
  expected_scope: RiddleProofSemanticScope;
  expected_profile_name: string;
  authority: RiddleProofBrowserSealedEvidenceAuthority;
  protocol: RiddleProofBrowserSealedProtocol;
  leaf_issued_at: string;
  target_issued_at: string;
  behavior_issued_at: string;
  root_issued_at: string;
}) {
  const expected = createRiddleProofBrowserSealedProtocol({
    expected_scope: input.expected_scope,
    expected_profile_name: input.expected_profile_name,
  });
  if (!expected.ok) return expected;
  if (!sameJsonData(input.protocol, expected.protocol)) {
    return failure(
      "protocol_trust_root",
      new Error("The supplied browser protocol is not the exact deterministic protocol for this scope and profile."),
    );
  }
  const protocol = expected.protocol;

  const leafInput = {
    bundle: input.bundle,
    authority: input.authority,
    protocol,
    issued_at: input.leaf_issued_at,
  };
  const captureBound = issueLeaf({
    ...leafInput,
    contract: protocol.contracts.capture_bound_to_scope,
  });
  if (!captureBound.ok) return captureBound;
  const routeMatched = issueLeaf({ ...leafInput, contract: protocol.contracts.route_matched });
  if (!routeMatched.ok) return routeMatched;
  const profilePassed = issueLeaf({
    ...leafInput,
    contract: protocol.contracts.declared_profile_passed,
  });
  if (!profilePassed.ok) return profilePassed;
  const runtimeClean = issueLeaf({
    ...leafInput,
    contract: protocol.contracts.captured_runtime_clean,
  });
  if (!runtimeClean.ok) return runtimeClean;

  const replayContexts = [
    captureBound.replay_context,
    routeMatched.replay_context,
    profilePassed.replay_context,
    runtimeClean.replay_context,
  ] as [
    RiddleProofGroundedReplayContext,
    RiddleProofGroundedReplayContext,
    RiddleProofGroundedReplayContext,
    RiddleProofGroundedReplayContext,
  ];
  const ruleRegistry = [
    protocol.rules.target_confirmed.registration,
    protocol.rules.behavior_confirmed.registration,
    protocol.rules.sealed_profile_satisfied.registration,
  ] as const;
  const trustedRules = [
    protocol.rules.target_confirmed.rule_ref,
    protocol.rules.behavior_confirmed.rule_ref,
    protocol.rules.sealed_profile_satisfied.rule_ref,
  ] as const;

  const target = composeRiddleProofCheckedMeaningClosures({
    expected_rule: protocol.rules.target_confirmed.rule_ref,
    closures: [captureBound.checked_closure, routeMatched.checked_closure],
    issued_at: input.target_issued_at,
    replay_contexts: [captureBound.replay_context, routeMatched.replay_context],
    rule_registry: [...ruleRegistry],
    trusted_rules: [...trustedRules],
  });
  if (!target.ok) return failure("target_confirmed_composition", target);
  const behavior = composeRiddleProofCheckedMeaningClosures({
    expected_rule: protocol.rules.behavior_confirmed.rule_ref,
    closures: [profilePassed.checked_closure, runtimeClean.checked_closure],
    issued_at: input.behavior_issued_at,
    replay_contexts: [profilePassed.replay_context, runtimeClean.replay_context],
    rule_registry: [...ruleRegistry],
    trusted_rules: [...trustedRules],
  });
  if (!behavior.ok) return failure("behavior_confirmed_composition", behavior);
  const root = composeRiddleProofCheckedMeaningClosures({
    expected_rule: protocol.rules.sealed_profile_satisfied.rule_ref,
    closures: [target.checked_closure, behavior.checked_closure],
    issued_at: input.root_issued_at,
    replay_contexts: replayContexts,
    rule_registry: [...ruleRegistry],
    trusted_rules: [...trustedRules],
  });
  if (!root.ok) return failure("sealed_profile_satisfied_composition", root);

  return {
    ok: true as const,
    root_certificate: root.certificate,
    checked_closure: root.checked_closure,
    leaves: {
      capture_bound_to_scope: captureBound,
      route_matched: routeMatched,
      declared_profile_passed: profilePassed,
      captured_runtime_clean: runtimeClean,
    },
    branches: {
      target_confirmed: target,
      behavior_confirmed: behavior,
    },
    replay_contexts: replayContexts,
  };
}

export function replayRiddleProofBrowserSealedProof(input: {
  checked_closure: unknown;
  replay_contexts: [RiddleProofGroundedReplayContext, ...RiddleProofGroundedReplayContext[]];
  protocol: RiddleProofBrowserSealedProtocol;
  expected_root_certificate_id: string;
  expected_scope: RiddleProofSemanticScope;
  expected_profile_name: string;
}) {
  const expected = createRiddleProofBrowserSealedProtocol({
    expected_scope: input.expected_scope,
    expected_profile_name: input.expected_profile_name,
  });
  if (!expected.ok) return expected;
  if (!sameJsonData(input.protocol, expected.protocol)) {
    return failure(
      "protocol_trust_root",
      new Error("The supplied browser protocol is not the exact deterministic protocol for this scope and profile."),
    );
  }
  const protocol = expected.protocol;
  return matchRiddleProofCheckedMeaningClosure({
    checked_closure: input.checked_closure,
    replay_contexts: input.replay_contexts,
    rule_registry: [
      protocol.rules.target_confirmed.registration,
      protocol.rules.behavior_confirmed.registration,
      protocol.rules.sealed_profile_satisfied.registration,
    ],
    trusted_rules: [
      protocol.rules.target_confirmed.rule_ref,
      protocol.rules.behavior_confirmed.rule_ref,
      protocol.rules.sealed_profile_satisfied.rule_ref,
    ],
    expected_root_certificate_id: input.expected_root_certificate_id,
    expected_scope: input.expected_scope,
    expected_claim: protocol.expected_root_claim,
    expected_root_rule: protocol.rules.sealed_profile_satisfied.rule_ref,
  });
}
