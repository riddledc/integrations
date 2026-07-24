import {
  type WebChangeAuditView,
  type WebChangeDisposition,
  type WebChangeInspectionLevel,
  type WebChangeInspectionView,
  type WebChangeMeaningFinding,
  type WebChangeMeaningView,
  type WebChangeOutcomeView,
  type WebChangeCheckRecord,
} from "./types.js";

function headlineFor(disposition: WebChangeDisposition): string {
  switch (disposition) {
    case "conforms":
      return "The browser target matches the requested change.";
    case "does_not_conform":
      return "The browser target is not yet in spec.";
    case "stale":
      return "The prior browser check is out of date.";
    case "could_not_check":
      return "The browser target could not be checked.";
  }
}

function nextActionFor(record: WebChangeCheckRecord): string {
  const disposition = record.projection?.disposition ?? "could_not_check";
  switch (disposition) {
    case "conforms":
      return "No repair is needed for this pinned change.";
    case "does_not_conform":
      return record.projection?.repair_guidance[0]
        ?? "Repair the failed requirement, then run the same pinned check again.";
    case "stale":
      return "Run the same pinned check again against the current candidate.";
    case "could_not_check":
      return "Restore the capture or verification environment, then run the same pinned check again.";
  }
}

function dispositionFor(record: WebChangeCheckRecord): WebChangeDisposition {
  return record.projection?.disposition ?? "could_not_check";
}

function outcome(record: WebChangeCheckRecord): WebChangeOutcomeView {
  const disposition = dispositionFor(record);
  return {
    level: "outcome",
    check_ref: record.check_ref,
    candidate_ref: record.candidate_ref,
    disposition,
    current: record.projection?.current ?? false,
    headline: headlineFor(disposition),
    next_action: nextActionFor(record),
  };
}

function meaningFindings(
  record: WebChangeCheckRecord,
): WebChangeMeaningFinding[] {
  return (record.projection?.findings ?? []).map((finding) => ({
    requirement_id: finding.requirement_id,
    label: finding.label,
    explanation: finding.failure_summary,
    ...(finding.repair_guidance === undefined
      ? {}
      : { repair_guidance: finding.repair_guidance }),
  }));
}

function meaning(record: WebChangeCheckRecord): WebChangeMeaningView {
  return {
    ...outcome(record),
    level: "meaning",
    findings: meaningFindings(record),
    non_conclusions: record.projection?.non_conclusions
      ?? record.contract.non_conclusions,
  };
}

function audit(record: WebChangeCheckRecord): WebChangeAuditView {
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
    profile_digests: record.candidate === null
      ? {}
      : {
          before: record.candidate.profiles.before.profile_digest,
          action: record.candidate.profiles.action.profile_digest,
          reload: record.candidate.profiles.reload.profile_digest,
          fresh_context:
            record.candidate.profiles.fresh_context.profile_digest,
        },
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

export function presentWebChangeCheck(
  record: WebChangeCheckRecord,
  level: WebChangeInspectionLevel = "outcome",
): WebChangeInspectionView {
  switch (level) {
    case "outcome":
      return outcome(record);
    case "meaning":
      return meaning(record);
    case "audit":
      return audit(record);
  }
}
