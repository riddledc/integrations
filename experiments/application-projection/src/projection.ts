import {
  APPLICATION_PROJECTION_VERSION,
  type ApplicationAuthority,
  type ApplicationDiagnostic,
  type ApplicationDisposition,
  type ApplicationFinding,
  type ApplicationInspectionLevel,
  type ApplicationInspectionView,
  type ApplicationProjectionResult,
  type ApplicationSubjectRef,
  type ApplicationVerification,
  type ApplicationVerifiedReplay,
} from "./types.js";
import {
  assertApplicationAuthority,
  assertApplicationVerification,
  assertSubjectRef,
  applicationAuthorityRef,
  cloneStructuredFrozen,
  sameApplicationAuthorityRef,
  sameClaimRef,
  sameSpecificationRef,
  sameSubjectRef,
} from "./validation.js";

const PROJECTION_LIMIT =
  "This result is limited to the pinned specification, exact subject snapshot, replayed evidence, and checked rules.";

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function summaryFor(disposition: ApplicationDisposition): string {
  switch (disposition) {
    case "conforms":
      return "The subject conforms to the pinned specification.";
    case "does_not_conform":
      return "The subject does not conform to the pinned specification.";
    case "stale":
      return "The prior check is no longer current for this subject and specification.";
    case "could_not_check":
      return "The runtime could not establish a current conformance conclusion.";
  }
}

function unavailableResult(input: {
  authority: ApplicationAuthority;
  subject: ApplicationSubjectRef;
  diagnostics: readonly ApplicationDiagnostic[];
  proof_id?: string;
  status?: "rejected" | "unresolved" | "not_run";
}): ApplicationProjectionResult {
  return cloneStructuredFrozen({
    version: APPLICATION_PROJECTION_VERSION,
    disposition: "could_not_check",
    current: false,
    summary: summaryFor("could_not_check"),
    identity: {
      proof_id: input.proof_id ?? null,
      authority: applicationAuthorityRef(input.authority),
      spec: input.authority.specification.ref,
      subject: input.subject,
      root_certificate_id: null,
    },
    expected_root: input.authority.specification.expected_root,
    observed_root: null,
    expected_root_established: false,
    findings: [],
    repair_guidance: [],
    non_conclusions: unique([
      PROJECTION_LIMIT,
      ...(input.authority.specification.non_conclusions ?? []),
    ]),
    diagnostics: input.diagnostics,
    verification: {
      kind: input.status === "not_run" ? "unavailable" : "checked_meaning_replay",
      status: input.status ?? "unresolved",
    },
    explanation: null,
  });
}

function safeVerification(
  value: unknown,
): { ok: true; verification: ApplicationVerification } | { ok: false } {
  try {
    assertApplicationVerification(value);
    const verification = cloneStructuredFrozen(value);
    assertApplicationVerification(verification);
    return { ok: true, verification };
  } catch {
    return { ok: false };
  }
}

function requirementCoverage(
  authority: ApplicationAuthority,
  verification: ApplicationVerifiedReplay,
):
  | {
      ok: true;
      findings: ApplicationFinding[];
      repair_guidance: string[];
    }
  | { ok: false } {
  const definitions = new Map(
    authority.specification.requirements.map((definition) => [
      definition.requirement_id,
      definition,
    ]),
  );
  if (verification.requirements.length !== definitions.size) return { ok: false };
  const seen = new Set<string>();
  const evidenceFrontier = new Set([
    ...verification.explanation.node_certificate_ids,
    ...verification.explanation.grounded_frontier.flatMap((entry) => [
      entry.certificate_id,
      entry.bundle_id,
      entry.receipt_id,
      entry.statement_digest,
      entry.artifact_manifest_digest,
      entry.observation_digest,
    ]),
  ]);
  const findings: ApplicationFinding[] = [];
  const repairGuidance: string[] = [];
  for (const requirement of verification.requirements) {
    const definition = definitions.get(requirement.requirement_id);
    if (!definition || seen.has(requirement.requirement_id)) return { ok: false };
    if (requirement.evidence_ids.some((evidenceId) => !evidenceFrontier.has(evidenceId))) {
      return { ok: false };
    }
    seen.add(requirement.requirement_id);
    if (requirement.status !== "failed") continue;
    findings.push({
      requirement_id: definition.requirement_id,
      label: definition.label,
      failure_summary: definition.failure_summary,
      status: "failed",
      evidence_ids: [...requirement.evidence_ids],
      ...(definition.repair_guidance === undefined
        ? {}
        : { repair_guidance: definition.repair_guidance }),
    });
    if (definition.repair_guidance) {
      repairGuidance.push(definition.repair_guidance);
    }
  }
  return cloneStructuredFrozen({
    ok: true,
    findings,
    repair_guidance: unique(repairGuidance),
  });
}

function resolvedResult(input: {
  authority: ApplicationAuthority;
  subject: ApplicationSubjectRef;
  verification: ApplicationVerifiedReplay;
  disposition: ApplicationDisposition;
  findings: readonly ApplicationFinding[];
  repair_guidance: readonly string[];
  diagnostics?: readonly ApplicationDiagnostic[];
}): ApplicationProjectionResult {
  return cloneStructuredFrozen({
    version: APPLICATION_PROJECTION_VERSION,
    disposition: input.disposition,
    current: input.disposition === "conforms" || input.disposition === "does_not_conform",
    summary: summaryFor(input.disposition),
    identity: {
      proof_id: input.verification.proof_id,
      authority: applicationAuthorityRef(input.authority),
      spec: input.authority.specification.ref,
      subject: input.subject,
      root_certificate_id: input.verification.proof_root.root_certificate_id,
    },
    expected_root: input.authority.specification.expected_root,
    observed_root: input.verification.proof_root.claim,
    expected_root_established: input.verification.proof_root.expected_root_established,
    findings: input.findings,
    repair_guidance: input.repair_guidance,
    non_conclusions: unique([
      PROJECTION_LIMIT,
      ...(input.authority.specification.non_conclusions ?? []),
    ]),
    diagnostics: input.diagnostics ?? [],
    verification: {
      kind: "checked_meaning_replay",
      status: "verified",
      replayed_at: input.verification.replayed_at,
    },
    explanation: input.verification.explanation,
  });
}

/**
 * Deterministically projects independently replayed proof facts into an
 * application-facing result. It accepts no producer-authored finding labels,
 * repair prose, summary, or disposition.
 */
export function projectApplicationResult(input: {
  authority: ApplicationAuthority;
  subject: ApplicationSubjectRef;
  verification: ApplicationVerification;
}): ApplicationProjectionResult {
  assertApplicationAuthority(input.authority);
  assertSubjectRef(input.subject, "subject");

  const checked = safeVerification(input.verification);
  if (!checked.ok) {
    return unavailableResult({
      authority: input.authority,
      subject: input.subject,
      diagnostics: [{ code: "verification_shape_invalid" }],
    });
  }
  const verification = checked.verification;
  if (
    !sameApplicationAuthorityRef(
      verification.authority,
      applicationAuthorityRef(input.authority),
    )
  ) {
    return unavailableResult({
      authority: input.authority,
      subject: input.subject,
      proof_id: verification.proof_id,
      diagnostics: [{ code: "authority_binding_mismatch" }],
    });
  }
  if (verification.status !== "verified") {
    return unavailableResult({
      authority: input.authority,
      subject: input.subject,
      proof_id: verification.proof_id,
      status: verification.status,
      diagnostics: [{ code: `verification_${verification.status}` }],
    });
  }
  if (!sameSpecificationRef(verification.spec, input.authority.specification.ref)) {
    return unavailableResult({
      authority: input.authority,
      subject: input.subject,
      proof_id: verification.proof_id,
      diagnostics: [{ code: "specification_binding_mismatch" }],
    });
  }
  if (!sameSubjectRef(verification.subject, input.subject)) {
    return unavailableResult({
      authority: input.authority,
      subject: input.subject,
      proof_id: verification.proof_id,
      diagnostics: [{ code: "subject_binding_mismatch" }],
    });
  }
  if (
    verification.proof_root.root_certificate_id
    !== verification.explanation.root_certificate_id
  ) {
    return unavailableResult({
      authority: input.authority,
      subject: input.subject,
      proof_id: verification.proof_id,
      diagnostics: [{ code: "explanation_root_mismatch" }],
    });
  }

  const rootMatches = sameClaimRef(
    verification.proof_root.claim,
    input.authority.specification.expected_root,
  );
  if (verification.proof_root.expected_root_established !== rootMatches) {
    return unavailableResult({
      authority: input.authority,
      subject: input.subject,
      proof_id: verification.proof_id,
      diagnostics: [{ code: "expected_root_establishment_inconsistent" }],
    });
  }

  const coverage = requirementCoverage(input.authority, verification);
  if (!coverage.ok) {
    return unavailableResult({
      authority: input.authority,
      subject: input.subject,
      proof_id: verification.proof_id,
      diagnostics: [{ code: "requirement_coverage_invalid" }],
    });
  }
  const hasFailed = verification.requirements.some(
    (requirement) => requirement.status === "failed",
  );
  const hasUnresolved = verification.requirements.some(
    (requirement) => requirement.status === "unresolved",
  );
  if (verification.proof_root.expected_root_established && (hasFailed || hasUnresolved)) {
    return unavailableResult({
      authority: input.authority,
      subject: input.subject,
      proof_id: verification.proof_id,
      diagnostics: [{ code: "successful_root_conflicts_with_requirements" }],
    });
  }

  const positiveBasis = verification.proof_root.expected_root_established
    && !hasFailed
    && !hasUnresolved;
  const negativeBasis = !verification.proof_root.expected_root_established
    && hasFailed
    && !hasUnresolved;
  if (!positiveBasis && !negativeBasis) {
    return resolvedResult({
      authority: input.authority,
      subject: input.subject,
      verification,
      disposition: "could_not_check",
      findings: [],
      repair_guidance: [],
      diagnostics: [{ code: hasUnresolved ? "requirement_unresolved" : "conformance_basis_missing" }],
    });
  }
  if (verification.currentness.status === "unresolved") {
    return resolvedResult({
      authority: input.authority,
      subject: input.subject,
      verification,
      disposition: "could_not_check",
      findings: [],
      repair_guidance: [],
      diagnostics: [{ code: "currentness_unresolved" }],
    });
  }
  if (verification.currentness.status === "stale") {
    return resolvedResult({
      authority: input.authority,
      subject: input.subject,
      verification,
      disposition: "stale",
      findings: [],
      repair_guidance: [],
      diagnostics: [{ code: "proof_stale" }],
    });
  }
  if (negativeBasis) {
    return resolvedResult({
      authority: input.authority,
      subject: input.subject,
      verification,
      disposition: "does_not_conform",
      findings: coverage.findings,
      repair_guidance: coverage.repair_guidance,
    });
  }
  return resolvedResult({
    authority: input.authority,
    subject: input.subject,
    verification,
    disposition: "conforms",
    findings: [],
    repair_guidance: [],
  });
}

export function createApplicationUnavailableResult(input: {
  authority: ApplicationAuthority;
  subject: ApplicationSubjectRef;
  diagnostic_code: string;
  proof_id?: string;
}): ApplicationProjectionResult {
  assertApplicationAuthority(input.authority);
  assertSubjectRef(input.subject, "subject");
  return unavailableResult({
    authority: input.authority,
    subject: input.subject,
    ...(input.proof_id === undefined ? {} : { proof_id: input.proof_id }),
    status: "not_run",
    diagnostics: [{ code: input.diagnostic_code }],
  });
}

export function inspectApplicationResult(
  result: ApplicationProjectionResult,
  level: ApplicationInspectionLevel = "outcome",
): ApplicationInspectionView {
  if (level !== "outcome" && level !== "meaning" && level !== "audit") {
    throw new TypeError(`Unsupported application inspection level: ${String(level)}.`);
  }
  const outcome = {
    disposition: result.disposition,
    current: result.current,
    summary: result.summary,
    identity: {
      proof_id: result.identity.proof_id,
      specification: {
        id: result.identity.spec.id,
        version: result.identity.spec.version,
      },
      subject: {
        id: result.identity.subject.id,
        ...(result.identity.subject.kind === undefined
          ? {}
          : { kind: result.identity.subject.kind }),
      },
    },
  };
  if (level === "outcome") return cloneStructuredFrozen({ level, ...outcome });
  const meaning = {
    ...outcome,
    expected_root_established: result.expected_root_established,
    findings: result.findings,
    repair_guidance: result.repair_guidance,
    non_conclusions: result.non_conclusions,
  };
  if (level === "meaning") return cloneStructuredFrozen({ level, ...meaning });
  return cloneStructuredFrozen({
    level: "audit",
    ...meaning,
    binding: result.identity,
    expected_root: result.expected_root,
    observed_root: result.observed_root,
    diagnostics: result.diagnostics,
    verification: result.verification,
    explanation: result.explanation,
  });
}
