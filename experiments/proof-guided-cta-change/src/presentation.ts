import type {
  CtaAuditView,
  CtaCheckRecord,
  CtaDisposition,
  CtaInspectionLevel,
  CtaInspectionView,
  CtaMeaningView,
  CtaOutcomeView,
} from "./types.js";

function disposition(record: CtaCheckRecord): CtaDisposition {
  return record.projection?.disposition ?? "could_not_check";
}

function headline(value: CtaDisposition): string {
  switch (value) {
    case "conforms":
      return "This CTA change is in spec.";
    case "does_not_conform":
      return "This CTA change is not yet in spec.";
    case "stale":
      return "The last CTA check is out of date.";
    case "could_not_check":
      return "This CTA change could not be checked.";
  }
}

function nextAction(record: CtaCheckRecord): string {
  switch (disposition(record)) {
    case "conforms":
      return "No further change is required by this pinned contract.";
    case "does_not_conform":
      return record.projection?.repair_guidance[0]
        ?? "Repair the failed requirement, then check a fresh candidate.";
    case "stale":
      return "Check a fresh capture of the unchanged candidate.";
    case "could_not_check":
      return "Restore the check environment, then check a fresh candidate.";
  }
}

function outcome(record: CtaCheckRecord): CtaOutcomeView {
  const value = disposition(record);
  return {
    level: "outcome",
    check_ref: record.check_ref,
    candidate_ref: record.candidate_ref,
    disposition: value,
    current: record.projection?.current ?? false,
    headline: headline(value),
    next_action: nextAction(record),
  };
}

function meaning(record: CtaCheckRecord): CtaMeaningView {
  return {
    ...outcome(record),
    level: "meaning",
    findings: (record.projection?.findings ?? []).map((finding) => ({
      requirement_id: finding.requirement_id,
      label: finding.label,
      explanation: finding.failure_summary,
      ...(finding.repair_guidance === undefined
        ? {}
        : { repair_guidance: finding.repair_guidance }),
    })),
    non_conclusions:
      record.projection?.non_conclusions ?? record.contract.non_conclusions,
  };
}

function audit(record: CtaCheckRecord): CtaAuditView {
  return {
    ...meaning(record),
    level: "audit",
    contract: {
      id: record.contract.id,
      version: record.contract.version,
      digest: record.contract.digest,
    },
    subject: record.candidate?.subject ?? null,
    authority: record.authority === null
      ? null
      : {
          authority_id: record.authority.authority_id,
          authority_version: record.authority.authority_version,
          authority_digest: record.authority.authority_digest,
        },
    specification: record.authority?.specification.ref ?? null,
    profile_digest: record.candidate?.profile.profile_digest ?? null,
    proof_id: record.projection?.identity.proof_id ?? null,
    root_certificate_id:
      record.projection?.identity.root_certificate_id ?? null,
    observed_root: record.projection?.observed_root ?? null,
    expected_root:
      record.projection?.expected_root
      ?? record.authority?.specification.expected_root
      ?? null,
    verification: record.projection?.verification ?? null,
    diagnostics: [
      ...record.diagnostics,
      ...(record.projection?.diagnostics ?? []),
    ],
  };
}

export function presentCtaCheck(
  record: CtaCheckRecord,
  level: CtaInspectionLevel = "outcome",
): CtaInspectionView {
  if (level === "outcome") return outcome(record);
  if (level === "meaning") return meaning(record);
  return audit(record);
}
