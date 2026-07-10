import type {
  RiddleProofProfileArtifactRef,
  RiddleProofProfileCheckResult,
  RiddleProofProfileResult,
  RiddleProofProfileStatus,
} from "./profile";
import { RIDDLE_PROOF_PROFILE_STATUSES } from "./profile";
import {
  createRiddleProofObservationReceipt,
  parseRiddleProofObservationReceipt,
  type RiddleProofObservationArtifact,
  type RiddleProofObservationReceipt,
  type RiddleProofExecutionTelemetry,
  type RiddleProofSourceIdentity,
} from "./receipts";
import type { JsonValue } from "./types";

export const RIDDLE_PROOF_CHANGE_CONTRACT_VERSION = "riddle-proof.change-contract.v1" as const;
export const RIDDLE_PROOF_CHANGE_RESULT_VERSION = "riddle-proof.change-result.v1" as const;
export const RIDDLE_PROOF_CHANGE_RECEIPT_V1_VERSION = "riddle-proof.change-receipt.v1" as const;
export const RIDDLE_PROOF_CHANGE_RECEIPT_VERSION = "riddle-proof.change-receipt.v2" as const;
export const RIDDLE_PROOF_HANDOFF_RECEIPT_VERSION = "riddle-proof.handoff-receipt.v1" as const;

export type RiddleProofChangeSide = "before" | "after";
export type RiddleProofChangeStatus = RiddleProofProfileStatus;
export type RiddleProofChangeDeltaStatus =
  | "passed"
  | "failed"
  | "proof_insufficient"
  | "configuration_error";
export type RiddleProofChangeProfileCheckStatus = RiddleProofProfileCheckResult["status"];

export interface RiddleProofChangeGroupContract {
  label?: string;
  required_status?: RiddleProofProfileStatus | RiddleProofProfileStatus[];
}

export interface RiddleProofChangeSourceBindingRequirement {
  preview_receipt_required?: boolean;
  expected_git_revision?: string;
  require_clean_source?: boolean;
  require_content_digest?: boolean;
}

export interface RiddleProofChangeSourceBindingContract {
  before?: RiddleProofChangeSourceBindingRequirement;
  after?: RiddleProofChangeSourceBindingRequirement;
}

export interface RiddleProofProfileStatusTransitionDelta {
  type: "profile_status_transition";
  label?: string;
  before_status?: RiddleProofProfileStatus | RiddleProofProfileStatus[];
  after_status?: RiddleProofProfileStatus | RiddleProofProfileStatus[];
}

export interface RiddleProofCheckStatusTransitionDelta {
  type: "check_status_transition";
  label?: string;
  check_label?: string;
  check_type?: string;
  before_status?: RiddleProofChangeProfileCheckStatus | RiddleProofChangeProfileCheckStatus[];
  after_status?: RiddleProofChangeProfileCheckStatus | RiddleProofChangeProfileCheckStatus[];
}

export type RiddleProofChangeDelta =
  | RiddleProofProfileStatusTransitionDelta
  | RiddleProofCheckStatusTransitionDelta;

export interface RiddleProofChangeContract {
  version?: typeof RIDDLE_PROOF_CHANGE_CONTRACT_VERSION;
  name: string;
  before?: RiddleProofChangeGroupContract;
  after?: RiddleProofChangeGroupContract;
  source_binding?: RiddleProofChangeSourceBindingContract;
  deltas: RiddleProofChangeDelta[];
  metadata?: Record<string, JsonValue>;
}

export interface RiddleProofChangeGroupResult {
  side: RiddleProofChangeSide;
  label: string;
  ok: boolean;
  profile_name?: string;
  status: RiddleProofProfileStatus | "missing";
  required_status: RiddleProofProfileStatus[];
  summary?: string;
  message?: string;
}

export interface RiddleProofChangeDeltaResult {
  type: RiddleProofChangeDelta["type"];
  label: string;
  status: RiddleProofChangeDeltaStatus;
  before_observed?: JsonValue;
  after_observed?: JsonValue;
  message?: string;
}

export type RiddleProofChangeSourceBindingStatus =
  | "not_required"
  | "matched"
  | "missing"
  | "mismatched"
  | "stale";

export interface RiddleProofChangeSourceBindingResult {
  side: RiddleProofChangeSide;
  required: boolean;
  ok: boolean;
  status: RiddleProofChangeSourceBindingStatus;
  expected_git_revision?: string;
  observed_git_revision?: string;
  content_digest?: string;
  preview_id?: string;
  preview_url?: string;
  target_url?: string;
  expires_at?: string;
  message?: string;
}

export interface RiddleProofChangeResult {
  version: typeof RIDDLE_PROOF_CHANGE_RESULT_VERSION;
  contract_name: string;
  status: RiddleProofChangeStatus;
  groups: {
    before: RiddleProofChangeGroupResult;
    after: RiddleProofChangeGroupResult;
  };
  deltas: RiddleProofChangeDeltaResult[];
  source_bindings: {
    before: RiddleProofChangeSourceBindingResult;
    after: RiddleProofChangeSourceBindingResult;
  };
  summary: string;
  metadata?: Record<string, JsonValue>;
}

export interface AssessRiddleProofChangeInput {
  before_result?: RiddleProofProfileResult;
  after_result?: RiddleProofProfileResult;
  before_observation?: RiddleProofObservationReceipt;
  after_observation?: RiddleProofObservationReceipt;
  expected_source_revisions?: Partial<Record<RiddleProofChangeSide, string>>;
  evaluated_at?: string;
}

export type RiddleProofChangeReceiptVerdict =
  | "mergeable"
  | "not_mergeable"
  | "environment_blocked"
  | "needs_human_review"
  | "configuration_error"
  | "proof_insufficient";

export type RiddleProofChangeReceiptArtifactKind = "image" | "data" | "artifact";

export interface RiddleProofChangeReceiptArtifact {
  side: RiddleProofChangeSide;
  name: string;
  kind: RiddleProofChangeReceiptArtifactKind;
  url?: string;
  path?: string;
  source?: string;
}

export interface RiddleProofChangeReceiptCheckCounts {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  needs_human_review: number;
}

export interface RiddleProofChangeReceiptSide {
  side: RiddleProofChangeSide;
  source: string;
  profile_name: string;
  status: RiddleProofProfileStatus;
  summary: string;
  route?: JsonValue;
  captured_at?: string;
  checks: RiddleProofChangeReceiptCheckCounts;
  screenshots: RiddleProofChangeReceiptArtifact[];
  artifacts: RiddleProofChangeReceiptArtifact[];
}

export interface RiddleProofChangeReceiptDelta {
  type: RiddleProofChangeDeltaResult["type"];
  label: string;
  status: RiddleProofChangeDeltaStatus;
  before_observed?: JsonValue;
  after_observed?: JsonValue;
  message?: string;
}

export interface RiddleProofLegacyChangeReceipt {
  version: typeof RIDDLE_PROOF_CHANGE_RECEIPT_V1_VERSION;
  contract_name: string;
  profile_name?: string;
  status: RiddleProofChangeStatus;
  verdict: RiddleProofChangeReceiptVerdict;
  summary: string;
  before: RiddleProofChangeReceiptSide;
  after: RiddleProofChangeReceiptSide;
  deltas: RiddleProofChangeReceiptDelta[];
  proves: string[];
  does_not_prove: string[];
  metadata?: Record<string, JsonValue>;
}

export interface RiddleProofChangeRecommendation {
  merge_recommended: boolean;
  verdict: RiddleProofChangeReceiptVerdict;
  label: string;
  reason: string;
}

export interface RiddleProofShippingAuthorization {
  status: "not_granted" | "granted";
  authorized: boolean;
  source: "none" | "human" | "automation";
  actor?: string;
  at?: string;
}

export interface RiddleProofChangeReceipt {
  version: typeof RIDDLE_PROOF_CHANGE_RECEIPT_VERSION;
  contract_name: string;
  profile_name?: string;
  status: RiddleProofChangeStatus;
  verdict: RiddleProofChangeReceiptVerdict;
  summary: string;
  before: RiddleProofObservationReceipt;
  after: RiddleProofObservationReceipt;
  groups: RiddleProofChangeResult["groups"];
  source_bindings: RiddleProofChangeResult["source_bindings"];
  deltas: RiddleProofChangeReceiptDelta[];
  recommendation: RiddleProofChangeRecommendation;
  shipping_authorization: RiddleProofShippingAuthorization;
  proves: string[];
  does_not_prove: string[];
  metadata?: Record<string, JsonValue>;
}

export interface RiddleProofHandoffReceipt {
  version: typeof RIDDLE_PROOF_HANDOFF_RECEIPT_VERSION;
  change: RiddleProofChangeReceipt;
  verdict: RiddleProofChangeReceiptVerdict;
  recommendation: RiddleProofChangeRecommendation;
  shipping_authorization: RiddleProofShippingAuthorization;
  canonical_pair: {
    before?: RiddleProofObservationArtifact;
    after?: RiddleProofObservationArtifact;
  };
  created_at: string;
}

export interface CreateRiddleProofChangeReceiptInput {
  contract: RiddleProofChangeContract;
  result: RiddleProofChangeResult;
  before_result?: RiddleProofProfileResult;
  after_result?: RiddleProofProfileResult;
  before_source?: string;
  after_source?: string;
  before_observation?: RiddleProofObservationReceipt;
  after_observation?: RiddleProofObservationReceipt;
  before_source_identity?: RiddleProofSourceIdentity;
  after_source_identity?: RiddleProofSourceIdentity;
  shipping_authorization?: RiddleProofShippingAuthorization;
  profile_name?: string;
}

const DEFAULT_BEFORE_STATUSES: RiddleProofProfileStatus[] = ["passed", "product_regression"];
const DEFAULT_AFTER_STATUSES: RiddleProofProfileStatus[] = ["passed"];
const DEFAULT_PROFILE_STATUS_TRANSITION_BEFORE: RiddleProofProfileStatus[] = ["product_regression"];
const DEFAULT_PROFILE_STATUS_TRANSITION_AFTER: RiddleProofProfileStatus[] = ["passed"];
const DEFAULT_CHECK_STATUS_TRANSITION_BEFORE: RiddleProofChangeProfileCheckStatus[] = ["failed"];
const DEFAULT_CHECK_STATUS_TRANSITION_AFTER: RiddleProofChangeProfileCheckStatus[] = ["passed"];

function listValue<T>(value: T | T[] | undefined, fallback: T[]): T[] {
  if (Array.isArray(value)) return value;
  if (value === undefined) return fallback;
  return [value];
}

function includesValue<T extends string>(allowed: T[], observed: T | undefined): boolean {
  return observed !== undefined && allowed.includes(observed);
}

function groupResult(
  side: RiddleProofChangeSide,
  contract: RiddleProofChangeGroupContract | undefined,
  result: RiddleProofProfileResult | undefined,
): RiddleProofChangeGroupResult {
  const fallback = side === "before" ? DEFAULT_BEFORE_STATUSES : DEFAULT_AFTER_STATUSES;
  const requiredStatus = listValue(contract?.required_status, fallback);
  const label = contract?.label || side;
  if (!result) {
    return {
      side,
      label,
      ok: false,
      status: "missing",
      required_status: requiredStatus,
      message: `${label} profile result is missing.`,
    };
  }
  const ok = includesValue(requiredStatus, result.status);
  return {
    side,
    label,
    ok,
    profile_name: result.profile_name,
    status: result.status,
    required_status: requiredStatus,
    summary: result.summary,
    message: ok
      ? undefined
      : `${label} profile status ${result.status} did not match required status ${requiredStatus.join(", ")}.`,
  };
}

function findCheck(
  result: RiddleProofProfileResult,
  delta: RiddleProofCheckStatusTransitionDelta,
): RiddleProofProfileCheckResult | undefined {
  return result.checks.find((check) => {
    if (delta.check_label && check.label !== delta.check_label) return false;
    if (delta.check_type && check.type !== delta.check_type) return false;
    return Boolean(delta.check_label || delta.check_type);
  });
}

function profileStatusTransitionResult(
  delta: RiddleProofProfileStatusTransitionDelta,
  before: RiddleProofProfileResult | undefined,
  after: RiddleProofProfileResult | undefined,
): RiddleProofChangeDeltaResult {
  const label = delta.label || "profile-status-transition";
  if (!before || !after) {
    return {
      type: delta.type,
      label,
      status: "proof_insufficient",
      before_observed: before?.status,
      after_observed: after?.status,
      message: `${label} needs both before and after profile results.`,
    };
  }
  const beforeAllowed = listValue(delta.before_status, DEFAULT_PROFILE_STATUS_TRANSITION_BEFORE);
  const afterAllowed = listValue(delta.after_status, DEFAULT_PROFILE_STATUS_TRANSITION_AFTER);
  const passed = includesValue(beforeAllowed, before.status) && includesValue(afterAllowed, after.status);
  return {
    type: delta.type,
    label,
    status: passed ? "passed" : "failed",
    before_observed: before.status,
    after_observed: after.status,
    message: passed
      ? undefined
      : `${label} expected before ${beforeAllowed.join(", ")} and after ${afterAllowed.join(", ")}, got ${before.status} -> ${after.status}.`,
  };
}

function checkStatusTransitionResult(
  delta: RiddleProofCheckStatusTransitionDelta,
  before: RiddleProofProfileResult | undefined,
  after: RiddleProofProfileResult | undefined,
): RiddleProofChangeDeltaResult {
  const label = delta.label || delta.check_label || delta.check_type || "check-status-transition";
  if (!delta.check_label && !delta.check_type) {
    return {
      type: delta.type,
      label,
      status: "configuration_error",
      message: `${label} needs check_label or check_type.`,
    };
  }
  if (!before || !after) {
    return {
      type: delta.type,
      label,
      status: "proof_insufficient",
      before_observed: before?.status,
      after_observed: after?.status,
      message: `${label} needs both before and after profile results.`,
    };
  }
  const beforeCheck = findCheck(before, delta);
  const afterCheck = findCheck(after, delta);
  if (!beforeCheck || !afterCheck) {
    return {
      type: delta.type,
      label,
      status: "proof_insufficient",
      before_observed: beforeCheck?.status,
      after_observed: afterCheck?.status,
      message: `${label} was not present in ${!beforeCheck && !afterCheck ? "before or after" : !beforeCheck ? "before" : "after"} profile checks.`,
    };
  }
  const beforeAllowed = listValue(delta.before_status, DEFAULT_CHECK_STATUS_TRANSITION_BEFORE);
  const afterAllowed = listValue(delta.after_status, DEFAULT_CHECK_STATUS_TRANSITION_AFTER);
  const passed = includesValue(beforeAllowed, beforeCheck.status) && includesValue(afterAllowed, afterCheck.status);
  return {
    type: delta.type,
    label,
    status: passed ? "passed" : "failed",
    before_observed: beforeCheck.status,
    after_observed: afterCheck.status,
    message: passed
      ? undefined
      : `${label} expected before ${beforeAllowed.join(", ")} and after ${afterAllowed.join(", ")}, got ${beforeCheck.status} -> ${afterCheck.status}.`,
  };
}

function assessDelta(
  delta: RiddleProofChangeDelta,
  before: RiddleProofProfileResult | undefined,
  after: RiddleProofProfileResult | undefined,
): RiddleProofChangeDeltaResult {
  if (delta.type === "profile_status_transition") {
    return profileStatusTransitionResult(delta, before, after);
  }
  return checkStatusTransitionResult(delta, before, after);
}

function profileResultFromObservation(observation: RiddleProofObservationReceipt | undefined) {
  return observation?.proof?.result;
}

function previewReceiptCoversTarget(previewUrl: string, targetUrl: string) {
  try {
    const preview = new URL(previewUrl);
    const target = new URL(targetUrl);
    const previewPath = preview.pathname.replace(/\/+$/u, "");
    return preview.origin === target.origin
      && (target.pathname === previewPath || target.pathname.startsWith(`${previewPath}/`));
  } catch {
    return false;
  }
}

function sourceBindingResult(
  side: RiddleProofChangeSide,
  requirement: RiddleProofChangeSourceBindingRequirement | undefined,
  observation: RiddleProofObservationReceipt | undefined,
  expectedRevision: string | undefined,
  evaluatedAt: string,
): RiddleProofChangeSourceBindingResult {
  const expected = expectedRevision || requirement?.expected_git_revision;
  const required = Boolean(
    requirement?.preview_receipt_required ||
    requirement?.require_clean_source ||
    requirement?.require_content_digest ||
    requirement?.expected_git_revision ||
    expected,
  );
  if (!required) return { side, required: false, ok: true, status: "not_required" };

  if (!observation) {
    return {
      side,
      required: true,
      ok: false,
      status: "missing",
      expected_git_revision: expected,
      message: `${side} source binding requires an Observation receipt.`,
    };
  }

  const preview = observation.target.preview;
  if (requirement?.preview_receipt_required && !preview) {
    return {
      side,
      required: true,
      ok: false,
      status: "missing",
      expected_git_revision: expected,
      message: `${side} source binding requires a Preview receipt.`,
    };
  }

  if (preview && !previewReceiptCoversTarget(preview.url, observation.target.url)) {
    return {
      side,
      required: true,
      ok: false,
      status: "mismatched",
      expected_git_revision: expected,
      observed_git_revision: preview.source.git_revision || observation.source.git_revision,
      content_digest: preview.content_digest,
      preview_id: preview.preview_id,
      preview_url: preview.url,
      target_url: observation.target.url,
      message: `${side} observation target is not contained by Preview ${preview.preview_id}.`,
    };
  }

  const observed = preview?.source.git_revision || observation.source.git_revision;
  const digestRequired = requirement?.require_content_digest === true || requirement?.preview_receipt_required === true;
  if (digestRequired && !preview?.content_digest) {
    return {
      side,
      required: true,
      ok: false,
      status: "missing",
      expected_git_revision: expected,
      observed_git_revision: observed,
      preview_id: preview?.preview_id,
      preview_url: preview?.url,
      target_url: observation.target.url,
      message: `${side} Preview receipt is missing a content digest.`,
    };
  }

  if (expected && !observed) {
    return {
      side,
      required: true,
      ok: false,
      status: "missing",
      expected_git_revision: expected,
      content_digest: preview?.content_digest,
      preview_id: preview?.preview_id,
      preview_url: preview?.url,
      target_url: observation.target.url,
      message: `${side} evidence is missing its source Git revision.`,
    };
  }

  if (expected && observed !== expected) {
    return {
      side,
      required: true,
      ok: false,
      status: "mismatched",
      expected_git_revision: expected,
      observed_git_revision: observed,
      content_digest: preview?.content_digest,
      preview_id: preview?.preview_id,
      preview_url: preview?.url,
      target_url: observation.target.url,
      message: `${side} evidence came from Git revision ${observed}, not expected revision ${expected}.`,
    };
  }

  const cleanRequired = requirement?.require_clean_source === true || requirement?.preview_receipt_required === true;
  const dirty = preview?.source.dirty ?? observation.source.dirty;
  if (cleanRequired && dirty !== false) {
    return {
      side,
      required: true,
      ok: false,
      status: dirty === true ? "mismatched" : "missing",
      expected_git_revision: expected,
      observed_git_revision: observed,
      content_digest: preview?.content_digest,
      preview_id: preview?.preview_id,
      preview_url: preview?.url,
      target_url: observation.target.url,
      message: dirty === true
        ? `${side} evidence was built from a dirty worktree and is not bound only to its Git revision.`
        : `${side} evidence does not record whether its source worktree was clean.`,
    };
  }

  const evaluatedMs = Date.parse(evaluatedAt);
  const expiresMs = preview?.expires_at ? Date.parse(preview.expires_at) : Number.NaN;
  if (preview && Number.isFinite(evaluatedMs) && Number.isFinite(expiresMs) && expiresMs <= evaluatedMs) {
    return {
      side,
      required: true,
      ok: false,
      status: "stale",
      expected_git_revision: expected,
      observed_git_revision: observed,
      content_digest: preview.content_digest,
      preview_id: preview.preview_id,
      preview_url: preview.url,
      target_url: observation.target.url,
      expires_at: preview.expires_at,
      message: `${side} Preview receipt expired at ${preview.expires_at}.`,
    };
  }

  return {
    side,
    required: true,
    ok: true,
    status: "matched",
    expected_git_revision: expected,
    observed_git_revision: observed,
    content_digest: preview?.content_digest,
    preview_id: preview?.preview_id,
    preview_url: preview?.url,
    target_url: observation.target.url,
    expires_at: preview?.expires_at,
  };
}

function collapsedChangeStatus(
  groups: RiddleProofChangeResult["groups"],
  deltas: RiddleProofChangeDeltaResult[],
  sourceBindings: RiddleProofChangeResult["source_bindings"],
): RiddleProofChangeStatus {
  const groupResults = [groups.before, groups.after];
  if (groupResults.some((group) => group.status === "environment_blocked")) return "environment_blocked";
  if (groupResults.some((group) => group.status === "configuration_error")) return "configuration_error";
  if (deltas.some((delta) => delta.status === "configuration_error")) return "configuration_error";
  if (groupResults.some((group) => group.status === "needs_human_review")) return "needs_human_review";
  if (groupResults.some((group) => group.status === "missing" || group.status === "proof_insufficient")) return "proof_insufficient";
  if ([sourceBindings.before, sourceBindings.after].some((binding) => binding.required && !binding.ok)) return "proof_insufficient";
  if (!deltas.length || deltas.some((delta) => delta.status === "proof_insufficient")) return "proof_insufficient";
  if (groupResults.some((group) => !group.ok)) return "product_regression";
  if (deltas.some((delta) => delta.status === "failed")) return "product_regression";
  return "passed";
}

function changeSummary(name: string, status: RiddleProofChangeStatus, deltas: RiddleProofChangeDeltaResult[]): string {
  if (status === "passed") return `${name} passed ${deltas.length} change delta(s).`;
  if (status === "environment_blocked") return `${name} could not compare reliable evidence because an environment was blocked.`;
  if (status === "configuration_error") return `${name} has an invalid change proof contract.`;
  if (status === "needs_human_review") return `${name} needs human review before the change proof can pass.`;
  if (status === "proof_insufficient") return `${name} did not produce enough before/after evidence for a change proof.`;
  return `${name} failed ${deltas.filter((delta) => delta.status === "failed").length} change delta(s).`;
}

export function assessRiddleProofChange(
  contract: RiddleProofChangeContract,
  input: AssessRiddleProofChangeInput,
): RiddleProofChangeResult {
  const beforeResult = input.before_result || profileResultFromObservation(input.before_observation);
  const afterResult = input.after_result || profileResultFromObservation(input.after_observation);
  const groups = {
    before: groupResult("before", contract.before, beforeResult),
    after: groupResult("after", contract.after, afterResult),
  };
  const deltas = (contract.deltas || []).map((delta) => assessDelta(delta, beforeResult, afterResult));
  const evaluatedAt = input.evaluated_at || new Date().toISOString();
  const sourceBindings = {
    before: sourceBindingResult(
      "before",
      contract.source_binding?.before,
      input.before_observation,
      input.expected_source_revisions?.before,
      evaluatedAt,
    ),
    after: sourceBindingResult(
      "after",
      contract.source_binding?.after,
      input.after_observation,
      input.expected_source_revisions?.after,
      evaluatedAt,
    ),
  };
  const status = collapsedChangeStatus(groups, deltas, sourceBindings);
  return {
    version: RIDDLE_PROOF_CHANGE_RESULT_VERSION,
    contract_name: contract.name,
    status,
    groups,
    deltas,
    source_bindings: sourceBindings,
    summary: changeSummary(contract.name, status, deltas),
    metadata: contract.metadata,
  };
}

function changeReceiptVerdict(status: RiddleProofChangeStatus): RiddleProofChangeReceiptVerdict {
  if (status === "passed") return "mergeable";
  if (status === "environment_blocked") return "environment_blocked";
  if (status === "configuration_error") return "configuration_error";
  if (status === "needs_human_review") return "needs_human_review";
  if (status === "proof_insufficient") return "proof_insufficient";
  return "not_mergeable";
}

function profileCheckCounts(result: RiddleProofProfileResult): RiddleProofChangeReceiptCheckCounts {
  const counts: RiddleProofChangeReceiptCheckCounts = {
    total: result.checks.length,
    passed: 0,
    failed: 0,
    skipped: 0,
    needs_human_review: 0,
  };
  for (const check of result.checks) {
    if (check.status === "passed") counts.passed += 1;
    if (check.status === "failed") counts.failed += 1;
    if (check.status === "skipped") counts.skipped += 1;
    if (check.status === "needs_human_review") counts.needs_human_review += 1;
  }
  return counts;
}

function artifactKind(ref: Pick<RiddleProofProfileArtifactRef, "name" | "url" | "path" | "kind" | "content_type">): RiddleProofChangeReceiptArtifactKind {
  const text = [ref.name, ref.url, ref.path, ref.kind, ref.content_type].filter(Boolean).join(" ").toLowerCase();
  if (/\bimage\b/.test(text) || /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/.test(text)) return "image";
  if (/\bjson\b|\btext\b|\bmarkdown\b|\bhtml\b|\blog\b/.test(text) || /\.(json|md|txt|html|log|har)(\?|#|$)/.test(text)) return "data";
  return "artifact";
}

function receiptArtifactFromRef(side: RiddleProofChangeSide, ref: RiddleProofProfileArtifactRef): RiddleProofChangeReceiptArtifact {
  return {
    side,
    name: ref.name,
    kind: artifactKind(ref),
    url: ref.url,
    path: ref.path,
    source: ref.source,
  };
}

function comparableArtifactName(value: string | undefined) {
  return (value || "")
    .split(/[/?#]/)
    .pop()
    ?.toLowerCase()
    .replace(/\.(png|jpe?g|gif|webp|avif|svg)$/u, "")
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "";
}

function artifactMatchesScreenshotLabel(artifact: RiddleProofChangeReceiptArtifact, screenshot: string) {
  const screenshotName = comparableArtifactName(screenshot);
  if (!screenshotName) return false;
  return [artifact.name, artifact.url, artifact.path]
    .map(comparableArtifactName)
    .some((name) => name === screenshotName || name.endsWith(`-${screenshotName}`));
}

function collectReceiptArtifacts(side: RiddleProofChangeSide, result: RiddleProofProfileResult): RiddleProofChangeReceiptArtifact[] {
  const artifacts: RiddleProofChangeReceiptArtifact[] = [];
  const seen = new Set<string>();
  const add = (artifact: RiddleProofChangeReceiptArtifact) => {
    const key = artifact.url || artifact.path || `${artifact.kind}:${artifact.name}`;
    if (!artifact.name || seen.has(key)) return;
    seen.add(key);
    artifacts.push(artifact);
  };
  for (const ref of result.artifacts.riddle_artifacts || []) {
    add(receiptArtifactFromRef(side, ref));
  }
  for (const screenshot of result.artifacts.screenshots || []) {
    if (artifacts.some((artifact) => artifactMatchesScreenshotLabel(artifact, screenshot))) continue;
    add({
      side,
      name: screenshot,
      kind: "image",
    });
  }
  return artifacts;
}

function artifactIsScreenshot(artifact: RiddleProofChangeReceiptArtifact) {
  if (artifact.kind !== "image") return false;
  return /screenshot|\.png|\.jpe?g|\.webp|\.gif|\.avif|\.svg/i.test([artifact.name, artifact.url, artifact.path].filter(Boolean).join(" "));
}

function receiptSide(
  side: RiddleProofChangeSide,
  source: string,
  result: RiddleProofProfileResult,
): RiddleProofChangeReceiptSide {
  const artifacts = collectReceiptArtifacts(side, result);
  return {
    side,
    source,
    profile_name: result.profile_name,
    status: result.status,
    summary: result.summary,
    route: result.route as unknown as JsonValue,
    captured_at: result.captured_at,
    checks: profileCheckCounts(result),
    screenshots: artifacts.filter(artifactIsScreenshot),
    artifacts,
  };
}

function metadataStringList(metadata: Record<string, JsonValue> | undefined, key: string): string[] {
  const value = metadata?.[key];
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function changeRecommendation(verdict: RiddleProofChangeReceiptVerdict): RiddleProofChangeRecommendation {
  if (verdict === "mergeable") {
    return {
      merge_recommended: true,
      verdict,
      label: "Merge recommended",
      reason: "The declared before/after delta contract passed with sufficient bound evidence.",
    };
  }
  const reason = verdict === "not_mergeable"
    ? "The declared change delta did not pass."
    : verdict === "environment_blocked"
      ? "The environment blocked reliable evidence collection."
      : verdict === "needs_human_review"
        ? "The evidence requires human review."
        : verdict === "configuration_error"
          ? "The change contract is invalid."
          : "The change proof did not produce sufficient bound evidence.";
  return { merge_recommended: false, verdict, label: "Merge not recommended", reason };
}

function noShippingAuthorization(): RiddleProofShippingAuthorization {
  return { status: "not_granted", authorized: false, source: "none" };
}

function recommendationMatches(
  actual: RiddleProofChangeRecommendation | undefined,
  expected: RiddleProofChangeRecommendation,
) {
  return actual?.merge_recommended === expected.merge_recommended
    && actual.verdict === expected.verdict
    && actual.label === expected.label
    && actual.reason === expected.reason;
}

function assertShippingAuthorizationConsistent(
  authorization: RiddleProofShippingAuthorization | undefined,
  receiptName: string,
) {
  if (!authorization) throw new Error(`${receiptName} shipping authorization is required.`);
  if (authorization.status !== "not_granted" && authorization.status !== "granted") {
    throw new Error(`${receiptName} shipping authorization status is invalid.`);
  }
  if (authorization.source !== "none" && authorization.source !== "human" && authorization.source !== "automation") {
    throw new Error(`${receiptName} shipping authorization source is invalid.`);
  }
  const granted = authorization.status === "granted";
  if (authorization.authorized !== granted) {
    throw new Error(`${receiptName} shipping authorization status and authorized flag must agree.`);
  }
  if ((authorization.source === "none") === granted) {
    throw new Error(`${receiptName} shipping authorization source must identify an authorizer only when granted.`);
  }
}

function observationArtifactMatches(
  actual: RiddleProofObservationArtifact | undefined,
  expected: RiddleProofObservationArtifact | undefined,
) {
  if (!actual || !expected) return actual === expected;
  return actual.name === expected.name
    && actual.role === expected.role
    && actual.url === expected.url
    && actual.path === expected.path
    && actual.kind === expected.kind
    && actual.content_type === expected.content_type
    && actual.source === expected.source;
}

function observationExecutor(result: RiddleProofProfileResult) {
  return result.runner === "local-playwright"
    ? { kind: "local_playwright" as const, runner: result.runner }
    : {
      kind: "riddle_hosted" as const,
      runner: result.runner,
      job_id: result.riddle?.job_id,
    };
}

function observationForReceiptSide(
  side: RiddleProofChangeSide,
  result: RiddleProofProfileResult | undefined,
  source: string | undefined,
  sourceIdentity: RiddleProofSourceIdentity | undefined,
) {
  if (!result) throw new Error(`${side}_result or ${side}_observation is required.`);
  if (!source) throw new Error(`${side}_source or ${side}_observation is required.`);
  return createRiddleProofObservationReceipt({
    comparison_role: side,
    executor: observationExecutor(result),
    target: { kind: "url", url: source },
    source: sourceIdentity,
    profile_result: result,
    execution: result.riddle?.execution as unknown as RiddleProofExecutionTelemetry | undefined,
    publication: source.startsWith("http")
      ? { kind: result.runner === "local-playwright" ? "other" : "riddle_cdn", url: source }
      : { kind: "local", path: source },
  });
}

export function createRiddleProofChangeReceipt(input: CreateRiddleProofChangeReceiptInput): RiddleProofChangeReceipt {
  const before = input.before_observation
    ? parseRiddleProofObservationReceipt(input.before_observation)
    : observationForReceiptSide("before", input.before_result, input.before_source, input.before_source_identity);
  const after = input.after_observation
    ? parseRiddleProofObservationReceipt(input.after_observation)
    : observationForReceiptSide("after", input.after_result, input.after_source, input.after_source_identity);
  const verdict = changeReceiptVerdict(input.result.status);
  const shippingAuthorization = input.shipping_authorization || noShippingAuthorization();
  assertShippingAuthorizationConsistent(shippingAuthorization, "Change receipt");
  return {
    version: RIDDLE_PROOF_CHANGE_RECEIPT_VERSION,
    contract_name: input.result.contract_name,
    profile_name: input.profile_name,
    status: input.result.status,
    verdict,
    summary: input.result.summary,
    before,
    after,
    groups: input.result.groups,
    source_bindings: input.result.source_bindings,
    deltas: input.result.deltas.map((delta) => ({
      type: delta.type,
      label: delta.label,
      status: delta.status,
      before_observed: delta.before_observed,
      after_observed: delta.after_observed,
      message: delta.message,
    })),
    recommendation: changeRecommendation(verdict),
    shipping_authorization: shippingAuthorization,
    proves: metadataStringList(input.contract.metadata, "required_receipts"),
    does_not_prove: metadataStringList(input.contract.metadata, "does_not_prove"),
    metadata: input.result.metadata,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function migratedObservationFromLegacySide(side: RiddleProofChangeSide, legacy: RiddleProofChangeReceiptSide) {
  const legacyArtifacts: RiddleProofObservationArtifact[] = legacy.artifacts.map((artifact) => ({
    name: artifact.name,
    url: artifact.url,
    path: artifact.path,
    source: artifact.source,
    kind: artifact.kind,
    role: legacy.screenshots[0] && artifactTarget(artifact) === artifactTarget(legacy.screenshots[0])
      ? "canonical_screenshot"
      : artifact.kind === "image" ? "diagnostic" : artifact.kind === "data" ? "data" : "artifact",
  }));
  const canonicalScreenshot = legacyArtifacts.find((artifact) => artifact.role === "canonical_screenshot");
  return {
    version: "riddle-proof.observation-receipt.v1" as const,
    observation_id: `obs_${side}_migrated`,
    comparison_role: side,
    executor: { kind: "other" as const, runner: "legacy-change-receipt" },
    target: { kind: "url" as const, url: legacy.source },
    source: {},
    captured_at: legacy.captured_at || new Date(0).toISOString(),
    artifacts: legacyArtifacts,
    canonical_screenshot: canonicalScreenshot,
    profile_summary: {
      profile_name: legacy.profile_name,
      status: legacy.status,
      summary: legacy.summary,
      route: legacy.route,
      checks: legacy.checks,
    },
    metadata: { migrated_from: RIDDLE_PROOF_CHANGE_RECEIPT_V1_VERSION },
  } satisfies RiddleProofObservationReceipt;
}

export function migrateRiddleProofChangeReceipt(
  legacy: RiddleProofLegacyChangeReceipt,
): RiddleProofChangeReceipt {
  const recommendation = changeRecommendation(legacy.verdict);
  return {
    version: RIDDLE_PROOF_CHANGE_RECEIPT_VERSION,
    contract_name: legacy.contract_name,
    profile_name: legacy.profile_name,
    status: legacy.status,
    verdict: legacy.verdict,
    summary: legacy.summary,
    before: migratedObservationFromLegacySide("before", legacy.before),
    after: migratedObservationFromLegacySide("after", legacy.after),
    groups: {
      before: {
        side: "before",
        label: "before",
        ok: legacy.before.status === "passed" || legacy.before.status === "product_regression",
        profile_name: legacy.before.profile_name,
        status: legacy.before.status,
        required_status: DEFAULT_BEFORE_STATUSES,
        summary: legacy.before.summary,
      },
      after: {
        side: "after",
        label: "after",
        ok: legacy.after.status === "passed",
        profile_name: legacy.after.profile_name,
        status: legacy.after.status,
        required_status: DEFAULT_AFTER_STATUSES,
        summary: legacy.after.summary,
      },
    },
    source_bindings: {
      before: { side: "before", required: false, ok: true, status: "not_required" },
      after: { side: "after", required: false, ok: true, status: "not_required" },
    },
    deltas: legacy.deltas,
    recommendation,
    shipping_authorization: noShippingAuthorization(),
    proves: legacy.proves,
    does_not_prove: legacy.does_not_prove,
    metadata: legacy.metadata,
  };
}

export function parseRiddleProofChangeReceipt(value: unknown): RiddleProofChangeReceipt {
  if (!isRecord(value)) throw new Error("Change receipt must be an object.");
  if (value.version === RIDDLE_PROOF_CHANGE_RECEIPT_V1_VERSION) {
    return migrateRiddleProofChangeReceipt(value as unknown as RiddleProofLegacyChangeReceipt);
  }
  if (value.version !== RIDDLE_PROOF_CHANGE_RECEIPT_VERSION) {
    throw new Error(`Unsupported Change receipt version ${String(value.version || "missing")}.`);
  }
  const receipt = value as unknown as RiddleProofChangeReceipt;
  if (!(RIDDLE_PROOF_PROFILE_STATUSES as readonly string[]).includes(receipt.status)) {
    throw new Error(`Unsupported Change receipt status ${String(receipt.status || "missing")}.`);
  }
  parseRiddleProofObservationReceipt(receipt.before);
  parseRiddleProofObservationReceipt(receipt.after);
  if (receipt.before.comparison_role !== "before" || receipt.after.comparison_role !== "after") {
    throw new Error("Change receipt observations must preserve their before and after comparison roles.");
  }
  const expectedVerdict = changeReceiptVerdict(receipt.status);
  if (receipt.verdict !== expectedVerdict) {
    throw new Error("Change receipt verdict must match its evaluated status.");
  }
  if (!recommendationMatches(receipt.recommendation, changeRecommendation(expectedVerdict))) {
    throw new Error("Change receipt recommendation must be derived from the Change receipt verdict.");
  }
  assertShippingAuthorizationConsistent(receipt.shipping_authorization, "Change receipt");
  return receipt;
}

export function createRiddleProofHandoffReceipt(
  changeReceipt: RiddleProofChangeReceipt,
  options: { created_at?: string; shipping_authorization?: RiddleProofShippingAuthorization } = {},
): RiddleProofHandoffReceipt {
  const change = parseRiddleProofChangeReceipt(changeReceipt);
  const authorization = options.shipping_authorization || change.shipping_authorization;
  assertShippingAuthorizationConsistent(authorization, "Handoff receipt");
  return {
    version: RIDDLE_PROOF_HANDOFF_RECEIPT_VERSION,
    change,
    verdict: change.verdict,
    recommendation: change.recommendation,
    shipping_authorization: authorization,
    canonical_pair: {
      before: change.before.canonical_screenshot,
      after: change.after.canonical_screenshot,
    },
    created_at: options.created_at || new Date().toISOString(),
  };
}

export function parseRiddleProofHandoffReceipt(value: unknown): RiddleProofHandoffReceipt {
  if (!isRecord(value) || value.version !== RIDDLE_PROOF_HANDOFF_RECEIPT_VERSION) {
    throw new Error(`Unsupported Handoff receipt version ${String(isRecord(value) ? value.version || "missing" : "missing")}.`);
  }
  const receipt = value as unknown as RiddleProofHandoffReceipt;
  if (!Number.isFinite(Date.parse(receipt.created_at))) {
    throw new Error("Handoff receipt created_at must be a valid timestamp.");
  }
  const change = parseRiddleProofChangeReceipt(receipt.change);
  if (receipt.verdict !== change.verdict || !recommendationMatches(receipt.recommendation, change.recommendation)) {
    throw new Error("Handoff receipt must preserve the Change receipt verdict and recommendation.");
  }
  if (!observationArtifactMatches(receipt.canonical_pair?.before, change.before.canonical_screenshot)
      || !observationArtifactMatches(receipt.canonical_pair?.after, change.after.canonical_screenshot)) {
    throw new Error("Handoff receipt canonical pair must project the Change receipt observations.");
  }
  assertShippingAuthorizationConsistent(receipt.shipping_authorization, "Handoff receipt");
  return receipt;
}

function markdownInlineCode(value: unknown, maxLength = 220) {
  const raw = String(value ?? "");
  const truncated = raw.length > maxLength ? `${raw.slice(0, maxLength - 1)}...` : raw;
  return `\`${truncated.replace(/`/g, "\\`")}\``;
}

function markdownTableCell(value: unknown) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function artifactTarget(artifact: RiddleProofChangeReceiptArtifact) {
  return artifact.url || artifact.path;
}

function observationArtifactKind(artifact: RiddleProofObservationArtifact): RiddleProofChangeReceiptArtifactKind {
  if (artifact.role === "canonical_screenshot" || artifact.role === "setup_screenshot" || artifact.kind === "image") return "image";
  if (artifact.role === "data" || /\.(json|md|txt|html|log|har)(\?|#|$)/i.test(artifact.name)) return "data";
  return "artifact";
}

function receiptSideView(side: RiddleProofChangeSide, observation: RiddleProofObservationReceipt): RiddleProofChangeReceiptSide {
  const artifacts = observation.artifacts.map((artifact) => ({
    side,
    name: artifact.name,
    kind: observationArtifactKind(artifact),
    url: artifact.url,
    path: artifact.path,
    source: artifact.source,
  }));
  const summary = observation.profile_summary;
  const canonical = observation.canonical_screenshot;
  const screenshots = artifacts.filter(artifactIsScreenshot);
  if (canonical) {
    const canonicalTarget = canonical.url || canonical.path;
    screenshots.sort((left, right) => {
      const leftCanonical = (left.url || left.path) === canonicalTarget || left.name === canonical.name;
      const rightCanonical = (right.url || right.path) === canonicalTarget || right.name === canonical.name;
      return Number(rightCanonical) - Number(leftCanonical);
    });
  }
  return {
    side,
    source: observation.target.url,
    profile_name: summary?.profile_name || observation.proof?.profile_name || "profile",
    status: (summary?.status || observation.proof?.result.status || "proof_insufficient") as RiddleProofProfileStatus,
    summary: summary?.summary || observation.proof?.result.summary || "No profile summary recorded.",
    route: summary?.route,
    captured_at: observation.captured_at,
    checks: summary?.checks || (observation.proof ? profileCheckCounts(observation.proof.result) : {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      needs_human_review: 0,
    }),
    screenshots,
    artifacts,
  };
}

function markdownLink(label: string, target: string) {
  return `[${label.replace(/\]/g, "\\]")}](${target})`;
}

function appendMarkdownArtifacts(lines: string[], title: string, artifacts: RiddleProofChangeReceiptArtifact[]) {
  lines.push(`### ${title}`, "");
  if (!artifacts.length) {
    lines.push("- No screenshot artifacts recorded.", "");
    return;
  }
  for (const artifact of artifacts.slice(0, 6)) {
    const target = artifactTarget(artifact);
    if (target && artifact.kind === "image") {
      lines.push(`![${artifact.name.replace(/\]/g, "\\]")}](${target})`);
    } else if (target) {
      lines.push(`- ${markdownLink(artifact.name, target)}`);
    } else {
      lines.push(`- ${artifact.name}`);
    }
  }
  if (artifacts.length > 6) lines.push(`- ${artifacts.length - 6} more artifact(s) omitted`);
  lines.push("");
}

export function riddleProofChangeReceiptMarkdown(receipt: RiddleProofChangeReceipt): string {
  const before = receiptSideView("before", receipt.before);
  const after = receiptSideView("after", receipt.after);
  const lines = [
    "# Riddle Proof Change Receipt",
    "",
    `**Verdict:** ${receipt.verdict}`,
    `**Status:** ${receipt.status}`,
    `**Contract:** ${receipt.contract_name}`,
    receipt.profile_name ? `**Profile:** ${receipt.profile_name}` : "",
    `**Recommendation:** ${receipt.recommendation.label}`,
    `**Shipping authorization:** ${receipt.shipping_authorization.status}`,
    "",
    receipt.summary,
    "",
    "## Evidence Pair",
    "",
    "| Side | Source | Status | Checks |",
    "| --- | --- | --- | --- |",
    `| Before | ${markdownTableCell(before.source)} | ${before.status}${receipt.groups.before.ok ? " (matched baseline)" : " (baseline mismatch)"} | ${before.checks.passed} passed / ${before.checks.failed} failed |`,
    `| After | ${markdownTableCell(after.source)} | ${after.status} | ${after.checks.passed} passed / ${after.checks.failed} failed |`,
    "",
    "## Source Binding",
    "",
    "| Side | Status | Git revision | Preview | Digest |",
    "| --- | --- | --- | --- | --- |",
    `| Before | ${receipt.source_bindings.before.status} | ${markdownTableCell(receipt.source_bindings.before.observed_git_revision || "not recorded")} | ${markdownTableCell(receipt.source_bindings.before.preview_id || "not required")} | ${markdownTableCell(receipt.source_bindings.before.content_digest || "not required")} |`,
    `| After | ${receipt.source_bindings.after.status} | ${markdownTableCell(receipt.source_bindings.after.observed_git_revision || "not recorded")} | ${markdownTableCell(receipt.source_bindings.after.preview_id || "not required")} | ${markdownTableCell(receipt.source_bindings.after.content_digest || "not required")} |`,
    "",
    "## Delta Checks",
    "",
    "| Delta | Status | Before | After |",
    "| --- | --- | --- | --- |",
  ].filter(Boolean);

  for (const delta of receipt.deltas) {
    lines.push(`| ${markdownTableCell(delta.label)} | ${delta.status} | ${markdownTableCell(delta.before_observed)} | ${markdownTableCell(delta.after_observed)} |`);
    if (delta.message) lines.push(`| ${markdownTableCell(`${delta.label} message`)} | ${markdownTableCell(delta.message)} |  |  |`);
  }
  lines.push("");
  appendMarkdownArtifacts(lines, "Before Canonical Screenshot", before.screenshots.slice(0, 1));
  appendMarkdownArtifacts(lines, "After Canonical Screenshot", after.screenshots.slice(0, 1));

  if (receipt.proves.length) {
    lines.push("## What This Proves", "");
    for (const claim of receipt.proves) lines.push(`- ${claim}`);
    lines.push("");
  }
  if (receipt.does_not_prove.length) {
    lines.push("## What This Does Not Prove", "");
    for (const claim of receipt.does_not_prove) lines.push(`- ${claim}`);
    lines.push("");
  }

  const linkedArtifacts = [...before.artifacts, ...after.artifacts]
    .filter((artifact) => artifactTarget(artifact))
    .slice(0, 24);
  if (linkedArtifacts.length) {
    lines.push("## Artifacts", "");
    for (const artifact of linkedArtifacts) {
      lines.push(`- ${artifact.side}: ${markdownLink(artifact.name, artifactTarget(artifact) || "")}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlArtifactCard(artifact: RiddleProofChangeReceiptArtifact) {
  const target = artifactTarget(artifact);
  if (!target) return `<p>${escapeHtml(artifact.name)}</p>`;
  if (artifact.kind === "image") {
    return `<figure><img src="${escapeHtml(target)}" alt="${escapeHtml(artifact.name)}"><figcaption>${escapeHtml(artifact.name)}</figcaption></figure>`;
  }
  return `<p><a href="${escapeHtml(target)}">${escapeHtml(artifact.name)}</a></p>`;
}

function htmlArtifactLink(artifact: RiddleProofChangeReceiptArtifact) {
  const target = artifactTarget(artifact);
  if (!target) return escapeHtml(artifact.name);
  return `<a href="${escapeHtml(target)}">${escapeHtml(artifact.name)}</a>`;
}

function htmlList(items: string[], emptyText: string) {
  if (!items.length) return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

export function riddleProofChangeReceiptHtml(receipt: RiddleProofChangeReceipt): string {
  const before = receiptSideView("before", receipt.before);
  const after = receiptSideView("after", receipt.after);
  const artifactLinks = [...before.artifacts, ...after.artifacts]
    .filter((artifact) => artifactTarget(artifact))
    .slice(0, 32);
  const deltaRows = receipt.deltas.map((delta) => `
      <tr>
        <td>${escapeHtml(delta.label)}</td>
        <td><span class="status ${escapeHtml(delta.status)}">${escapeHtml(delta.status)}</span></td>
        <td>${escapeHtml(delta.before_observed)}</td>
        <td>${escapeHtml(delta.after_observed)}</td>
      </tr>
      ${delta.message ? `<tr><td class="muted">${escapeHtml(delta.label)} message</td><td colspan="3">${escapeHtml(delta.message)}</td></tr>` : ""}`).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(receipt.contract_name)} - Riddle Proof Change Receipt</title>
  <style>
    :root { color-scheme: light dark; --bg: #0f141b; --panel: #171f29; --text: #eef4f8; --muted: #aebbc8; --border: #314152; --ok: #69d089; --bad: #ff7a7a; --warn: #ffd166; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
    main { max-width: 1120px; margin: 0 auto; padding: 32px 20px 48px; }
    header, section { border: 1px solid var(--border); background: var(--panel); border-radius: 8px; padding: 20px; margin: 0 0 18px; }
    h1, h2, h3, p { margin-top: 0; }
    h1 { font-size: clamp(1.6rem, 3vw, 2.4rem); }
    h2 { font-size: 1.1rem; margin-bottom: 14px; }
    .muted { color: var(--muted); }
    .verdict { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 999px; border: 1px solid var(--border); font-weight: 700; }
    .mergeable, .passed { color: var(--ok); }
    .not_mergeable, .failed, .product_regression { color: var(--bad); }
    .proof_insufficient, .environment_blocked, .needs_human_review, .configuration_error { color: var(--warn); }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .side { border: 1px solid var(--border); border-radius: 8px; padding: 14px; min-width: 0; }
    code { overflow-wrap: anywhere; color: var(--muted); }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid var(--border); padding: 10px 8px; text-align: left; vertical-align: top; }
    figure { margin: 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: #0b1017; }
    img { display: block; width: 100%; height: auto; }
    figcaption { padding: 8px 10px; color: var(--muted); font-size: 0.9rem; }
    ul { margin-bottom: 0; }
    a { color: #8bc7ff; }
    @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } main { padding: 18px 12px 32px; } }
  </style>
</head>
<body>
<main>
  <header>
    <p class="verdict ${escapeHtml(receipt.verdict)}">${escapeHtml(receipt.verdict)}</p>
    <h1>${escapeHtml(receipt.contract_name)}</h1>
    <p>${escapeHtml(receipt.summary)}</p>
    <p class="muted">Status: ${escapeHtml(receipt.status)}${receipt.profile_name ? ` | Profile: ${escapeHtml(receipt.profile_name)}` : ""}</p>
    <p>${escapeHtml(receipt.recommendation.label)}. Shipping authorization: ${escapeHtml(receipt.shipping_authorization.status)}.</p>
  </header>
  <section>
    <h2>Evidence Pair</h2>
    <div class="grid">
      <div class="side">
        <h3>Before</h3>
        <p><code>${escapeHtml(before.source)}</code></p>
        <p>Status: <strong class="${escapeHtml(before.status)}">${escapeHtml(before.status)}</strong>${receipt.groups.before.ok ? " (matched baseline)" : " (baseline mismatch)"}</p>
        <p>${escapeHtml(before.summary)}</p>
        <p class="muted">${before.checks.passed} passed / ${before.checks.failed} failed checks</p>
      </div>
      <div class="side">
        <h3>After</h3>
        <p><code>${escapeHtml(after.source)}</code></p>
        <p>Status: <strong class="${escapeHtml(after.status)}">${escapeHtml(after.status)}</strong></p>
        <p>${escapeHtml(after.summary)}</p>
        <p class="muted">${after.checks.passed} passed / ${after.checks.failed} failed checks</p>
      </div>
    </div>
  </section>
  <section>
    <h2>Source Binding</h2>
    <table>
      <thead><tr><th>Side</th><th>Status</th><th>Git revision</th><th>Preview</th><th>Digest</th></tr></thead>
      <tbody>
        <tr><td>Before</td><td>${escapeHtml(receipt.source_bindings.before.status)}</td><td>${escapeHtml(receipt.source_bindings.before.observed_git_revision || "not recorded")}</td><td>${escapeHtml(receipt.source_bindings.before.preview_id || "not required")}</td><td>${escapeHtml(receipt.source_bindings.before.content_digest || "not required")}</td></tr>
        <tr><td>After</td><td>${escapeHtml(receipt.source_bindings.after.status)}</td><td>${escapeHtml(receipt.source_bindings.after.observed_git_revision || "not recorded")}</td><td>${escapeHtml(receipt.source_bindings.after.preview_id || "not required")}</td><td>${escapeHtml(receipt.source_bindings.after.content_digest || "not required")}</td></tr>
      </tbody>
    </table>
  </section>
  <section>
    <h2>Delta Checks</h2>
    <table>
      <thead><tr><th>Delta</th><th>Status</th><th>Before</th><th>After</th></tr></thead>
      <tbody>${deltaRows}</tbody>
    </table>
  </section>
  <section>
    <h2>Screenshots</h2>
    <div class="grid">
      <div>${before.screenshots.slice(0, 1).map(htmlArtifactCard).join("") || `<p class="muted">No canonical before screenshot recorded.</p>`}</div>
      <div>${after.screenshots.slice(0, 1).map(htmlArtifactCard).join("") || `<p class="muted">No canonical after screenshot recorded.</p>`}</div>
    </div>
  </section>
  <section>
    <h2>What This Proves</h2>
    ${htmlList(receipt.proves, "No explicit proof claims were recorded in contract metadata.")}
  </section>
  <section>
    <h2>What This Does Not Prove</h2>
    ${htmlList(receipt.does_not_prove, "No explicit limits were recorded in contract metadata.")}
  </section>
  <section>
    <h2>Artifacts</h2>
    ${artifactLinks.length ? `<ul>${artifactLinks.map((artifact) => `<li>${escapeHtml(artifact.side)}: ${htmlArtifactLink(artifact)}</li>`).join("")}</ul>` : `<p class="muted">No linked artifacts recorded.</p>`}
  </section>
</main>
</body>
</html>
`;
}
