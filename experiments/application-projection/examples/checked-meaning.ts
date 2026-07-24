/**
 * Narrow adapter used by the examples.
 *
 * It accepts only the successful outputs of checked-meaning replay,
 * explanation, and currentness assessment.  It does not verify cryptography
 * itself and it does not accept a producer-authored `verified: true` boolean.
 */

import type {
  ApplicationAuthorityRef,
  ApplicationClaimRef,
  ApplicationSpecificationRef,
  ApplicationSubjectRef,
  ApplicationVerifiedReplay,
  JsonValue,
} from "../src/types.js";

type Claim = {
  claim_id: string;
  claim_version: string;
  parameters?: Readonly<Record<string, JsonValue>>;
};

type Certificate = {
  certificate_id: string;
  claim: Claim;
};

type SuccessfulReplay = {
  ok: true;
  root_certificate: Certificate;
};

type ExplanationNode = {
  certificate_id: string;
  claim: Claim;
};

type ExplanationFrontierEntry = {
  certificate_id: string;
  bundle_id: string;
  receipt_id: string;
  statement_digest: string;
  artifact_manifest_digest: string;
  observation_digest: string;
  captured_at: string;
};

type SuccessfulExplanation = {
  ok: true;
  explanation: {
    root_certificate_id: string;
    node_count: number;
    grounded_leaf_count: number;
    checked_composition_count: number;
    nodes: ExplanationNode[];
    grounded_frontier: ExplanationFrontierEntry[];
  };
};

type CheckedAssessment = {
  disposition: "checked";
  root_certificate: Certificate;
  consumption_time: string;
};

type StaleAssessment = {
  disposition: "stale";
  root_certificate: Certificate;
  consumption_time: string;
  stale_certificate_ids: [string, ...string[]];
};

type UnresolvedAssessment = {
  disposition: "unresolved";
  error: {
    code: string;
  };
};

type Assessment = CheckedAssessment | StaleAssessment | UnresolvedAssessment;

type RequirementClaim = {
  requirement_id: string;
  claim_id: string;
  claim_version: string;
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(
      (key) => `${JSON.stringify(key)}:${stableJson(record[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameClaim(actual: Claim, expected: ApplicationClaimRef): boolean {
  return actual.claim_id === expected.claim_id
    && actual.claim_version === expected.claim_version
    && stableJson(actual.parameters ?? {}) === stableJson(expected.parameters ?? {});
}

function currentnessFromAssessment(
  assessment: Assessment,
  rootCertificateId: string,
) {
  if (
    assessment.disposition !== "unresolved"
    && assessment.root_certificate.certificate_id !== rootCertificateId
  ) {
    return {
      status: "unresolved" as const,
      diagnostic_code: "assessment_root_mismatch",
    };
  }
  if (assessment.disposition === "checked") {
    return {
      status: "current" as const,
      consumption_time: assessment.consumption_time,
    };
  }
  if (assessment.disposition === "stale") {
    return {
      status: "stale" as const,
      consumption_time: assessment.consumption_time,
      stale_certificate_ids: [...assessment.stale_certificate_ids] as [
        string,
        ...string[],
      ],
    };
  }
  return {
    status: "unresolved" as const,
    diagnostic_code: assessment.error.code,
  };
}

export function applicationVerificationFromCheckedMeaning(input: {
  authority: ApplicationAuthorityRef;
  specification: ApplicationSpecificationRef;
  expected_root: ApplicationClaimRef;
  subject: ApplicationSubjectRef;
  replayed_at: string;
  replay: SuccessfulReplay;
  assessment: Assessment;
  explanation: SuccessfulExplanation;
  requirement_claims: readonly RequirementClaim[];
}): ApplicationVerifiedReplay {
  const root = input.replay.root_certificate;
  const explanation = input.explanation.explanation;
  const explanationMatchesReplay =
    explanation.root_certificate_id === root.certificate_id;
  const expectedRootEstablished =
    explanationMatchesReplay && sameClaim(root.claim, input.expected_root);
  const nodesByClaim = new Map<string, ExplanationNode[]>();

  for (const node of explanation.nodes) {
    const key = `${node.claim.claim_id}\u0000${node.claim.claim_version}`;
    const matches = nodesByClaim.get(key) ?? [];
    matches.push(node);
    nodesByClaim.set(key, matches);
  }

  const requirements = input.requirement_claims.map((requirement) => {
    const key = `${requirement.claim_id}\u0000${requirement.claim_version}`;
    const evidenceIds = (nodesByClaim.get(key) ?? [])
      .map((node) => node.certificate_id)
      .sort();
    if (evidenceIds.length === 0) {
      return {
        requirement_id: requirement.requirement_id,
        status: "unresolved" as const,
        evidence_ids: [],
        diagnostic_code: "required_claim_not_in_replayed_dag",
      };
    }
    return {
      requirement_id: requirement.requirement_id,
      status: "satisfied" as const,
      evidence_ids: evidenceIds,
    };
  });

  return {
    version: "riddle-proof.application-verification.v1" as const,
    verification_kind: "checked_meaning_replay" as const,
    status: "verified" as const,
    proof_id: root.certificate_id,
    authority: { ...input.authority },
    spec: { ...input.specification },
    subject: { ...input.subject },
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
      expected_root_established: expectedRootEstablished,
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
