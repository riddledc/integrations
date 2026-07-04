import type {
  RiddleProofProfileCheckResult,
  RiddleProofProfileResult,
  RiddleProofProfileStatus,
} from "./profile";
import type { JsonValue } from "./types";

export const RIDDLE_PROOF_CHANGE_CONTRACT_VERSION = "riddle-proof.change-contract.v1" as const;
export const RIDDLE_PROOF_CHANGE_RESULT_VERSION = "riddle-proof.change-result.v1" as const;

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

export interface RiddleProofChangeResult {
  version: typeof RIDDLE_PROOF_CHANGE_RESULT_VERSION;
  contract_name: string;
  status: RiddleProofChangeStatus;
  groups: {
    before: RiddleProofChangeGroupResult;
    after: RiddleProofChangeGroupResult;
  };
  deltas: RiddleProofChangeDeltaResult[];
  summary: string;
  metadata?: Record<string, JsonValue>;
}

export interface AssessRiddleProofChangeInput {
  before_result?: RiddleProofProfileResult;
  after_result?: RiddleProofProfileResult;
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

function collapsedChangeStatus(
  groups: RiddleProofChangeResult["groups"],
  deltas: RiddleProofChangeDeltaResult[],
): RiddleProofChangeStatus {
  const groupResults = [groups.before, groups.after];
  if (groupResults.some((group) => group.status === "environment_blocked")) return "environment_blocked";
  if (groupResults.some((group) => group.status === "configuration_error")) return "configuration_error";
  if (deltas.some((delta) => delta.status === "configuration_error")) return "configuration_error";
  if (groupResults.some((group) => group.status === "needs_human_review")) return "needs_human_review";
  if (groupResults.some((group) => group.status === "missing" || group.status === "proof_insufficient")) return "proof_insufficient";
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
  const groups = {
    before: groupResult("before", contract.before, input.before_result),
    after: groupResult("after", contract.after, input.after_result),
  };
  const deltas = (contract.deltas || []).map((delta) => assessDelta(delta, input.before_result, input.after_result));
  const status = collapsedChangeStatus(groups, deltas);
  return {
    version: RIDDLE_PROOF_CHANGE_RESULT_VERSION,
    contract_name: contract.name,
    status,
    groups,
    deltas,
    summary: changeSummary(contract.name, status, deltas),
    metadata: contract.metadata,
  };
}
