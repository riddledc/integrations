import type {
  RiddleProofProfileArtifactRef,
  RiddleProofProfileCheckResult,
  RiddleProofProfileResult,
  RiddleProofProfileStatus,
} from "./profile";
import type { JsonValue } from "./types";

export const RIDDLE_PROOF_CHANGE_CONTRACT_VERSION = "riddle-proof.change-contract.v1" as const;
export const RIDDLE_PROOF_CHANGE_RESULT_VERSION = "riddle-proof.change-result.v1" as const;
export const RIDDLE_PROOF_CHANGE_RECEIPT_VERSION = "riddle-proof.change-receipt.v1" as const;

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

export interface RiddleProofChangeReceipt {
  version: typeof RIDDLE_PROOF_CHANGE_RECEIPT_VERSION;
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

export interface CreateRiddleProofChangeReceiptInput {
  contract: RiddleProofChangeContract;
  result: RiddleProofChangeResult;
  before_result: RiddleProofProfileResult;
  after_result: RiddleProofProfileResult;
  before_source: string;
  after_source: string;
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

export function createRiddleProofChangeReceipt(input: CreateRiddleProofChangeReceiptInput): RiddleProofChangeReceipt {
  return {
    version: RIDDLE_PROOF_CHANGE_RECEIPT_VERSION,
    contract_name: input.result.contract_name,
    profile_name: input.profile_name,
    status: input.result.status,
    verdict: changeReceiptVerdict(input.result.status),
    summary: input.result.summary,
    before: receiptSide("before", input.before_source, input.before_result),
    after: receiptSide("after", input.after_source, input.after_result),
    deltas: input.result.deltas.map((delta) => ({
      type: delta.type,
      label: delta.label,
      status: delta.status,
      before_observed: delta.before_observed,
      after_observed: delta.after_observed,
      message: delta.message,
    })),
    proves: metadataStringList(input.contract.metadata, "required_receipts"),
    does_not_prove: metadataStringList(input.contract.metadata, "does_not_prove"),
    metadata: input.result.metadata,
  };
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
  const lines = [
    "# Riddle Proof Change Receipt",
    "",
    `**Verdict:** ${receipt.verdict}`,
    `**Status:** ${receipt.status}`,
    `**Contract:** ${receipt.contract_name}`,
    receipt.profile_name ? `**Profile:** ${receipt.profile_name}` : "",
    "",
    receipt.summary,
    "",
    "## Evidence Pair",
    "",
    "| Side | Source | Status | Checks |",
    "| --- | --- | --- | --- |",
    `| Before | ${markdownTableCell(receipt.before.source)} | ${receipt.before.status} | ${receipt.before.checks.passed} passed / ${receipt.before.checks.failed} failed |`,
    `| After | ${markdownTableCell(receipt.after.source)} | ${receipt.after.status} | ${receipt.after.checks.passed} passed / ${receipt.after.checks.failed} failed |`,
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
  appendMarkdownArtifacts(lines, "Before Screenshot", receipt.before.screenshots);
  appendMarkdownArtifacts(lines, "After Screenshot", receipt.after.screenshots);

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

  const linkedArtifacts = [...receipt.before.artifacts, ...receipt.after.artifacts]
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
  const artifactLinks = [...receipt.before.artifacts, ...receipt.after.artifacts]
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
  </header>
  <section>
    <h2>Evidence Pair</h2>
    <div class="grid">
      <div class="side">
        <h3>Before</h3>
        <p><code>${escapeHtml(receipt.before.source)}</code></p>
        <p>Status: <strong class="${escapeHtml(receipt.before.status)}">${escapeHtml(receipt.before.status)}</strong></p>
        <p>${escapeHtml(receipt.before.summary)}</p>
        <p class="muted">${receipt.before.checks.passed} passed / ${receipt.before.checks.failed} failed checks</p>
      </div>
      <div class="side">
        <h3>After</h3>
        <p><code>${escapeHtml(receipt.after.source)}</code></p>
        <p>Status: <strong class="${escapeHtml(receipt.after.status)}">${escapeHtml(receipt.after.status)}</strong></p>
        <p>${escapeHtml(receipt.after.summary)}</p>
        <p class="muted">${receipt.after.checks.passed} passed / ${receipt.after.checks.failed} failed checks</p>
      </div>
    </div>
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
      <div>${receipt.before.screenshots.slice(0, 4).map(htmlArtifactCard).join("") || `<p class="muted">No before screenshots recorded.</p>`}</div>
      <div>${receipt.after.screenshots.slice(0, 4).map(htmlArtifactCard).join("") || `<p class="muted">No after screenshots recorded.</p>`}</div>
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
