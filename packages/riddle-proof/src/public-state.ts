export type RiddleProofPublicPolicyState =
  | "awaiting_checkpoint"
  | "proof_blocked"
  | "proof_failed"
  | "proof_complete_ship_disabled"
  | "proof_passed_ship_held"
  | "ship_authorized"
  | "proof_passed"
  | "proof_in_progress"
  | "unknown";

export interface RiddleProofPublicCheckpointSummary {
  pending?: boolean;
  accepted_response_count: number;
  rejected_response_count: number;
  ignored_response_count: number;
  duplicate_response_count: number;
  latest_decision?: string;
  audit_disclosure_required: boolean;
}

export interface RiddleProofPublicStateSummary {
  status?: string;
  ok: boolean | null;
  policy_state: RiddleProofPublicPolicyState;
  result_label: string;
  proof_complete: boolean;
  proof_passed: boolean;
  ship_held: boolean;
  shipping_disabled: boolean;
  ship_authorized: boolean;
  merge_ready: boolean;
  sync_allowed: boolean;
  checkpoint_summary?: RiddleProofPublicCheckpointSummary;
  required_disclosures: string[];
  prohibited_claims: string[];
}

export type RiddleProofPublicConsumerSurfaceKind =
  | "run_status"
  | "run_result"
  | "run_card"
  | "pr_comment"
  | "hosted_proof_view"
  | "agent_summary"
  | (string & {});

export interface RiddleProofPublicConsumerSurface {
  kind: RiddleProofPublicConsumerSurfaceKind;
  status?: string;
  result_label: string;
  policy_state: RiddleProofPublicPolicyState;
  proof_complete: boolean;
  claims: {
    proof_passed: boolean;
    ship_authorized: boolean;
    merge_ready: boolean;
    sync_allowed: boolean;
    all_checkpoint_responses_accepted: boolean;
  };
  ship_control: {
    ship_held: boolean;
    shipping_disabled: boolean;
    ship_authorized: boolean;
  };
  handoff: {
    merge_ready: boolean;
    sync_allowed: boolean;
    merge_recommendation?: string;
  };
  checkpoint_audit?: RiddleProofPublicCheckpointSummary;
  disclosures: {
    ship_control: boolean;
    checkpoint_audit: boolean;
    required: string[];
    prohibited_claims: string[];
  };
  public_state: RiddleProofPublicStateSummary;
}

export interface RiddleProofPublicConsumerSurfaceOptions {
  kind?: RiddleProofPublicConsumerSurfaceKind;
  merge_recommendation?: string;
}

export function riddleProofPublicStateAllowsClaim(
  summary: RiddleProofPublicStateSummary | undefined,
  claim: string,
) {
  return !summary?.prohibited_claims.includes(claim);
}

export function riddleProofPublicStateAllowsMergeRecommendation(
  summary: RiddleProofPublicStateSummary | undefined,
) {
  return riddleProofPublicStateAllowsClaim(summary, "merge_ready") &&
    riddleProofPublicStateAllowsClaim(summary, "sync_allowed");
}

export function riddleProofPublicStateMergeRecommendation(
  summary: RiddleProofPublicStateSummary | undefined,
  recommendation: string | undefined,
) {
  return recommendation && riddleProofPublicStateAllowsMergeRecommendation(summary)
    ? recommendation
    : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function firstStringValue(...values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value);
    if (text) return text;
  }
  return undefined;
}

function firstBooleanValue(...values: unknown[]) {
  for (const value of values) {
    const bool = booleanValue(value);
    if (typeof bool === "boolean") return bool;
  }
  return undefined;
}

function firstRecordValue(...values: unknown[]) {
  for (const value of values) {
    const record = asRecord(value);
    if (Object.keys(record).length) return record;
  }
  return undefined;
}

function countValue(value: unknown) {
  const number = numberValue(value);
  return typeof number === "number" && number > 0 ? Math.trunc(number) : 0;
}

function checkpointSummaryFrom(...values: unknown[]): RiddleProofPublicCheckpointSummary | undefined {
  const record = firstRecordValue(...values);
  if (!record) return undefined;
  const accepted = countValue(record.response_count);
  const rejected = countValue(record.rejected_response_count);
  const ignored = countValue(record.ignored_response_count);
  const duplicate = countValue(record.duplicate_response_count);
  const summary: RiddleProofPublicCheckpointSummary = {
    pending: booleanValue(record.pending),
    accepted_response_count: accepted,
    rejected_response_count: rejected,
    ignored_response_count: ignored,
    duplicate_response_count: duplicate,
    latest_decision: stringValue(record.latest_decision),
    audit_disclosure_required: rejected > 0 || ignored > 0 || duplicate > 0,
  };
  return Object.values(summary).some((value) => typeof value !== "undefined") ? summary : undefined;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function statusIsProofFailed(status: string | undefined) {
  return status === "failed" ||
    status === "product_regression";
}

function statusIsProofBlocked(status: string | undefined) {
  return status === "blocked" ||
    status === "proof_insufficient" ||
    status === "environment_blocked" ||
    status === "configuration_error" ||
    status === "needs_human_review";
}

function statusRequiresDisclosure(status: string | undefined) {
  if (status === "proof_insufficient") return "proof_insufficient";
  if (status === "environment_blocked") return "environment_blocked";
  if (status === "configuration_error") return "configuration_error";
  if (status === "needs_human_review") return "human_review_required";
  return undefined;
}

export function summarizeRiddleProofPublicState(input: unknown): RiddleProofPublicStateSummary {
  const record = asRecord(input);
  const runCard = asRecord(record.run_card);
  const stopCondition = asRecord(runCard.stop_condition);
  const raw = asRecord(record.raw);
  const request = asRecord(record.request);
  const requestMetadata = asRecord(record.request_metadata);
  const prState = asRecord(record.pr_state);
  const handoff = asRecord(record.pr_handoff_policy);
  const handoffState = stringValue(handoff.state);
  const status = firstStringValue(record.status, stopCondition.status);
  const ok = booleanValue(record.ok) ?? null;
  const shipMode = firstStringValue(request.ship_mode, requestMetadata.ship_mode, record.ship_mode, handoff.ship_mode);
  const explicitShippingDisabled = firstBooleanValue(
    record.shipping_disabled,
    stopCondition.shipping_disabled,
    raw.shipping_disabled,
    handoff.shipping_disabled,
  );
  const shippingDisabled = explicitShippingDisabled === true ||
    shipMode === "none" ||
    handoffState === "proof_complete_ship_disabled";
  const explicitShipAuthorized = firstBooleanValue(
    record.ship_authorized,
    stopCondition.ship_authorized,
    raw.ship_authorized,
  );
  const authorizationEvidence = Boolean(
    status === "shipped" ||
      record.marked_ready === true ||
      stringValue(prState.status) === "merged" ||
      record.merge_commit ||
      record.merged_at,
  );
  const shipAuthorizedBeforeHold = explicitShipAuthorized ?? authorizationEvidence;
  const explicitShipHeld = firstBooleanValue(record.ship_held, stopCondition.ship_held, raw.ship_held);
  const inferredHeld = status === "ready_to_ship" && shippingDisabled && !shipAuthorizedBeforeHold;
  const shipHeld = explicitShipHeld === true || inferredHeld;
  const shipAuthorized = shipHeld ? false : shipAuthorizedBeforeHold === true;
  const proofComplete = Boolean(
    status === "ready_to_ship" ||
      status === "shipped" ||
      status === "completed" ||
      status === "passed" ||
      ok === true ||
      handoff.proof_complete === true,
  );
  const checkpointSummary = checkpointSummaryFrom(
    record.checkpoint_summary,
    stopCondition.checkpoint_summary,
    asRecord(record.details).checkpoint_summary,
    asRecord(raw.details).checkpoint_summary,
  );
  const blockedOrWaiting = statusIsProofBlocked(status) ||
    statusIsProofFailed(status) ||
    status === "awaiting_checkpoint" ||
    handoffState === "proof_blocked" ||
    handoffState === "proof_review_required" ||
    handoffState === "proof_failed" ||
    handoffState === "proof_checkpoint_required";
  const proofPassed = Boolean(proofComplete && !blockedOrWaiting);
  const explicitMergeReady = firstBooleanValue(record.merge_ready, stopCondition.merge_ready, raw.merge_ready, handoff.merge_ready);
  const normalPrAllowed = firstBooleanValue(record.normal_pr_allowed, raw.normal_pr_allowed, handoff.normal_pr_allowed);
  const baseHandoffAllowed = !blockedOrWaiting && !shipHeld && !shippingDisabled;
  const mergeReady = baseHandoffAllowed && normalPrAllowed !== false && (explicitMergeReady ?? shipAuthorized);
  const syncAllowed = mergeReady;

  let policyState: RiddleProofPublicPolicyState = "unknown";
  if (status === "awaiting_checkpoint" || handoffState === "proof_checkpoint_required") policyState = "awaiting_checkpoint";
  else if (statusIsProofFailed(status) || handoffState === "proof_failed") policyState = "proof_failed";
  else if (statusIsProofBlocked(status) || handoffState === "proof_blocked" || handoffState === "proof_review_required") policyState = "proof_blocked";
  else if (handoffState === "proof_complete_ship_disabled") policyState = "proof_complete_ship_disabled";
  else if (proofComplete && shipHeld && !shipAuthorized) policyState = "proof_passed_ship_held";
  else if (proofComplete && shippingDisabled && !shipAuthorized) policyState = "proof_complete_ship_disabled";
  else if (shipAuthorized) policyState = "ship_authorized";
  else if (proofPassed) policyState = "proof_passed";
  else if (status === "running") policyState = "proof_in_progress";

  const requiredDisclosures: string[] = [];
  if (shipHeld) requiredDisclosures.push("ship_held");
  if (shippingDisabled) requiredDisclosures.push("shipping_disabled");
  if (checkpointSummary?.audit_disclosure_required) requiredDisclosures.push("checkpoint_audit_counters");
  if (status === "awaiting_checkpoint" || handoffState === "proof_checkpoint_required") requiredDisclosures.push("checkpoint_required");
  const statusDisclosure = statusRequiresDisclosure(status);
  if (statusDisclosure) requiredDisclosures.push(statusDisclosure);

  const prohibitedClaims: string[] = [];
  if (!shipAuthorized || shipHeld || shippingDisabled) prohibitedClaims.push("ship_authorized", "shipped");
  if (!mergeReady) prohibitedClaims.push("merge_ready");
  if (!syncAllowed) prohibitedClaims.push("sync_allowed");
  if (blockedOrWaiting) {
    prohibitedClaims.push("proof_passed", "ready_to_ship");
  }
  if (checkpointSummary?.audit_disclosure_required) {
    prohibitedClaims.push("all_checkpoint_responses_accepted");
  }

  const resultLabel =
    status === "product_regression" ? "product_regression" :
    status === "proof_insufficient" ? "proof_insufficient" :
    status === "environment_blocked" ? "environment_blocked" :
    status === "configuration_error" ? "configuration_error" :
    status === "needs_human_review" ? "needs_human_review" :
    policyState === "awaiting_checkpoint" ? "checkpoint required" :
    policyState === "proof_blocked" ? "blocked" :
    policyState === "proof_failed" ? "failed" :
    policyState === "proof_complete_ship_disabled" ? "proof complete; shipping disabled" :
    policyState === "proof_passed_ship_held" ? "proof passed; ship held" :
    policyState === "ship_authorized" ? (status === "shipped" ? "shipped" : "ship authorized") :
    policyState === "proof_passed" ? "passed" :
    policyState === "proof_in_progress" ? "running" :
    status || "recorded";

  return {
    status,
    ok,
    policy_state: policyState,
    result_label: resultLabel,
    proof_complete: proofComplete,
    proof_passed: proofPassed,
    ship_held: shipHeld,
    shipping_disabled: shippingDisabled,
    ship_authorized: shipAuthorized,
    merge_ready: mergeReady,
    sync_allowed: syncAllowed,
    checkpoint_summary: checkpointSummary,
    required_disclosures: uniqueStrings(requiredDisclosures),
    prohibited_claims: uniqueStrings(prohibitedClaims),
  };
}

export function summarizeRiddleProofPublicConsumerSurface(
  input: unknown,
  options: RiddleProofPublicConsumerSurfaceOptions = {},
): RiddleProofPublicConsumerSurface {
  const record = asRecord(input);
  const runCard = asRecord(record.run_card);
  const stopCondition = asRecord(runCard.stop_condition);
  const raw = asRecord(record.raw);
  const publicState = summarizeRiddleProofPublicState(input);
  const checkpointAudit = publicState.checkpoint_summary;
  const mergeRecommendation = riddleProofPublicStateMergeRecommendation(
    publicState,
    firstStringValue(
      options.merge_recommendation,
      record.merge_recommendation,
      stopCondition.merge_recommendation,
      raw.merge_recommendation,
    ),
  );
  const checkpointAuditRequired = publicState.required_disclosures.includes("checkpoint_audit_counters");

  return {
    kind: options.kind || "run_result",
    status: publicState.status,
    result_label: publicState.result_label,
    policy_state: publicState.policy_state,
    proof_complete: publicState.proof_complete,
    claims: {
      proof_passed: publicState.proof_passed,
      ship_authorized: publicState.ship_authorized,
      merge_ready: publicState.merge_ready,
      sync_allowed: publicState.sync_allowed,
      all_checkpoint_responses_accepted: checkpointAudit ? !checkpointAudit.audit_disclosure_required : false,
    },
    ship_control: {
      ship_held: publicState.ship_held,
      shipping_disabled: publicState.shipping_disabled,
      ship_authorized: publicState.ship_authorized,
    },
    handoff: {
      merge_ready: publicState.merge_ready,
      sync_allowed: publicState.sync_allowed,
      merge_recommendation: mergeRecommendation,
    },
    checkpoint_audit: checkpointAudit,
    disclosures: {
      ship_control: true,
      checkpoint_audit: !checkpointAuditRequired || Boolean(checkpointAudit),
      required: [...publicState.required_disclosures],
      prohibited_claims: [...publicState.prohibited_claims],
    },
    public_state: publicState,
  };
}

export function summarizeRiddleProofHostedProofViewSurface(
  input: unknown,
  options: Omit<RiddleProofPublicConsumerSurfaceOptions, "kind"> = {},
) {
  return summarizeRiddleProofPublicConsumerSurface(input, {
    ...options,
    kind: "hosted_proof_view",
  });
}

export function summarizeRiddleProofAgentSummarySurface(
  input: unknown,
  options: Omit<RiddleProofPublicConsumerSurfaceOptions, "kind"> = {},
) {
  return summarizeRiddleProofPublicConsumerSurface(input, {
    ...options,
    kind: "agent_summary",
  });
}
