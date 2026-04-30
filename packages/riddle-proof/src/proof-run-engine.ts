import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  WORKFLOW_STAGE_ORDER,
  buildCheckpointContract,
  buildSetupArgs,
  checkpointContinueStage,
  clearStageDecisionRequest,
  ensureAction,
  invalidateVerifyEvidence,
  mergeStateFromParams,
  readState,
  recordStageAttempt,
  resolveConfig,
  setStageDecisionRequest,
  summarizeState,
  validateShipGate,
  workflowFile,
  writeState,
  type WorkflowAction,
  type WorkflowParams,
  type WorkflowStage,
  type PluginConfig,
} from "./proof-run-core.js";

function snapshotFor(statePath: string) {
  return summarizeState(readState(statePath));
}

function authorReady(state: any) {
  return state?.author_status === "ready" || state?.proof_plan_status === "ready";
}

function implementationReady(state: any) {
  return ["changes_detected", "completed"].includes(state?.implementation_status || "");
}

function stageAfterAuthor(state: any): WorkflowStage {
  return implementationReady(state) ? "verify" : "implement";
}

function latestReconAttempt(state: any) {
  const history = Array.isArray(state?.recon_results?.attempt_history) ? state.recon_results.attempt_history : [];
  return history.length ? history[history.length - 1] : null;
}

function latestReconCapturedBaselines(state: any) {
  const latest = latestReconAttempt(state);
  if (latest?.captured_baselines && typeof latest.captured_baselines === "object") return latest.captured_baselines;
  if (latest?.baselines && typeof latest.baselines === "object") return latest.baselines;
  return state?.recon_results?.baselines || {};
}

function requiredReconBaselineLabels(state: any) {
  const labels: string[] = [];
  const reference = state?.requested_reference || state?.reference || "before";
  if (reference === "before" || reference === "both") labels.push("before");
  if ((reference === "prod" || reference === "both") && String(state?.prod_url || "").trim()) labels.push("prod");
  return labels;
}

function latestReconHasRequiredBaselines(state: any) {
  const baselines = latestReconCapturedBaselines(state);
  return requiredReconBaselineLabels(state).every((label) => Boolean((baselines?.[label]?.url || "").trim()));
}

function hasReconBaselineUnderstanding(state: any) {
  const understanding = state?.recon_assessment?.baseline_understanding || state?.recon_baseline_understanding || {};
  return Boolean(
    String(understanding?.visible_before_state || "").trim()
    && String(understanding?.requested_change || "").trim()
    && String(understanding?.proof_focus || "").trim()
    && String(understanding?.stop_condition || "").trim(),
  );
}

function promoteLatestReconBaselines(state: any) {
  const baselines = latestReconCapturedBaselines(state);
  state.recon_results = state.recon_results || {};
  state.recon_results.baselines = baselines;
  state.recon_results.selected_attempt = latestReconAttempt(state) || {};
  state.before_cdn = (baselines?.before?.url || "").trim();
  state.prod_cdn = (baselines?.prod?.url || "").trim();
  return baselines;
}

function hasSupervisorReconAssessment(state: any) {
  const reconAssessment = state?.recon_assessment || {};
  const source = String(reconAssessment?.source || state?.recon_assessment_source || "").trim().toLowerCase();
  if (!reconAssessment?.decision) return false;
  return source === "supervising_agent" || source === "supervisor";
}

function reconAssessment(state: any) {
  const assessment = state?.recon_assessment || {};
  const decision = assessment?.decision || null;
  const continueWithStage = assessment?.continue_with_stage || assessment?.recommended_stage || (decision === "ready_for_author" ? "author" : "recon");
  return {
    decision,
    summary: assessment?.summary || state?.recon_assessment_request?.summary || state?.recon_summary || null,
    recommendedStage: assessment?.recommended_stage || continueWithStage || null,
    continueWithStage: continueWithStage || null,
    escalationTarget: assessment?.escalation_target || "agent",
    reasons: Array.isArray(assessment?.reasons) ? assessment.reasons : [],
    raw: assessment,
    source: String(assessment?.source || state?.recon_assessment_source || "").trim() || null,
  };
}

function updateState(statePath: string, mutate: (state: any) => void) {
  const state = readState(statePath) || {};
  mutate(state);
  writeState(statePath, state);
  return state;
}

interface WorkflowStepResult {
  ok: boolean;
  step: WorkflowStage;
  haltedForApproval?: boolean;
  autoApproved?: boolean;
  approval?: unknown;
  raw?: unknown;
  error?: string | null;
  stdout?: string;
  stderr?: string;
  duration_ms?: number;
  started_at?: string;
  finished_at?: string;
}

interface RuntimeStepTimer {
  startedAt: string;
  startedMs: number;
}

const RUNTIME_EVENT_LIMIT = 100;

function nowIso() {
  return new Date().toISOString();
}

function appendRuntimeEventToState(state: any, event: Record<string, unknown>) {
  const events = Array.isArray(state.runtime_events) ? state.runtime_events : [];
  state.runtime_events = [...events, event].slice(-RUNTIME_EVENT_LIMIT);
  state.runtime_updated_at = event.ts;
}

function beginRuntimeStep(
  statePath: string,
  action: WorkflowAction,
  step: WorkflowStage,
  workflowPath: string,
): RuntimeStepTimer {
  const timer = {
    startedAt: nowIso(),
    startedMs: Date.now(),
  };
  updateState(statePath, (state) => {
    const current = {
      step,
      action,
      status: "running",
      started_at: timer.startedAt,
      workflow_file: path.basename(workflowPath),
    };
    state.current_runtime_step = current;
    appendRuntimeEventToState(state, {
      ts: timer.startedAt,
      kind: "workflow.step.started",
      step,
      action,
      summary: `Started ${step} workflow step.`,
      details: {
        workflow_file: path.basename(workflowPath),
      },
    });
  });
  return timer;
}

function finishRuntimeStep(
  statePath: string,
  action: WorkflowAction,
  result: WorkflowStepResult,
  timer: RuntimeStepTimer,
): WorkflowStepResult {
  const finishedAt = nowIso();
  const durationMs = Date.now() - timer.startedMs;
  const summary =
    result.haltedForApproval ? `${result.step} halted for approval.` :
      result.ok ? `Finished ${result.step} workflow step.` :
        `${result.step} workflow step failed.`;

  updateState(statePath, (state) => {
    const completed = {
      step: result.step,
      action,
      status: result.haltedForApproval ? "approval_required" : result.ok ? "completed" : "failed",
      started_at: timer.startedAt,
      finished_at: finishedAt,
      duration_ms: durationMs,
      ok: result.ok,
      halted_for_approval: result.haltedForApproval || false,
      auto_approved: result.autoApproved || false,
      error: result.error || null,
    };
    state.current_runtime_step = null;
    state.last_runtime_step = completed;
    appendRuntimeEventToState(state, {
      ts: finishedAt,
      kind: "workflow.step.finished",
      step: result.step,
      action,
      summary,
      details: completed,
    });
  });

  return {
    ...result,
    started_at: timer.startedAt,
    finished_at: finishedAt,
    duration_ms: durationMs,
  };
}

function executedStep(res: WorkflowStepResult, extra: Record<string, unknown> = {}) {
  const output: Record<string, unknown> = {
    step: res.step,
    ok: res.ok,
    haltedForApproval: res.haltedForApproval || false,
    autoApproved: res.autoApproved || false,
    ...extra,
  };
  if (typeof res.duration_ms === "number") output.duration_ms = res.duration_ms;
  return output;
}

function stageAdvanceOptionsFrom(stage: WorkflowStage) {
  const currentIndex = WORKFLOW_STAGE_ORDER.indexOf(stage);
  return WORKFLOW_STAGE_ORDER.slice(currentIndex);
}

function hasSupervisorProofAssessment(state: any) {
  const proofAssessment = state?.proof_assessment || {};
  const source = String(proofAssessment?.source || state?.proof_assessment_source || "").trim().toLowerCase();
  if (!proofAssessment?.decision) return false;
  return source === "supervising_agent" || source === "supervisor";
}

function verifyAssessment(state: any) {
  const proofAssessment = state?.proof_assessment || {};
  const verifyDecision = state?.verify_decision_request || {};
  if (hasSupervisorProofAssessment(state)) {
    return {
      decision: proofAssessment?.decision || null,
      summary: proofAssessment?.summary || verifyDecision?.summary || null,
      recommendedStage: proofAssessment?.continue_with_stage || proofAssessment?.recommended_stage || verifyDecision?.continue_with_stage || verifyDecision?.recommended_stage || null,
      continueWithStage: proofAssessment?.continue_with_stage || verifyDecision?.continue_with_stage || proofAssessment?.recommended_stage || verifyDecision?.recommended_stage || null,
      escalationTarget: proofAssessment?.escalation_target || "agent",
      reasons: Array.isArray(proofAssessment?.reasons) ? proofAssessment.reasons : [],
      raw: proofAssessment,
      source: "supervising_agent",
    };
  }
  if (state?.verify_status === "capture_incomplete") {
    return {
      decision: verifyDecision?.capture_quality?.decision || "revise_capture",
      summary: verifyDecision?.summary || "Verify needs another internal capture iteration before the evidence can be judged.",
      recommendedStage: verifyDecision?.continue_with_stage || verifyDecision?.recommended_stage || "author",
      continueWithStage: verifyDecision?.continue_with_stage || verifyDecision?.recommended_stage || "author",
      escalationTarget: "agent",
      reasons: Array.isArray(verifyDecision?.capture_quality?.reasons) ? verifyDecision.capture_quality.reasons : [],
      raw: verifyDecision?.capture_quality || verifyDecision,
      source: "workflow_capture",
    };
  }
  return {
    decision: null,
    summary: verifyDecision?.summary || "Verify captured evidence and is waiting for supervising-agent proof assessment.",
    recommendedStage: null,
    continueWithStage: null,
    escalationTarget: "agent",
    reasons: [],
    raw: proofAssessment,
    source: "awaiting_supervisor",
  };
}

function nonConvergenceSignals(state: any, assessment = verifyAssessment(state)) {
  const verifyAttempts = Number(state?.stage_attempts?.verify?.count || 0);
  const authorAttempts = Number(state?.stage_attempts?.author?.count || 0);
  const reconAttempts = Number(state?.stage_attempts?.recon?.count || 0);
  const continueStage = assessment.continueWithStage || assessment.recommendedStage || null;
  return {
    verifyAttempts,
    authorAttempts,
    reconAttempts,
    continueStage,
    warning:
      verifyAttempts >= 4
      || (continueStage === "author" && verifyAttempts >= 2 && authorAttempts >= 2)
      || (continueStage === "recon" && verifyAttempts >= 2 && reconAttempts >= 2)
      || (continueStage === "implement" && verifyAttempts >= 2),
  };
}

function shouldEscalateVerifyToHuman(_state: any, assessment = verifyAssessment(_state)) {
  return assessment.escalationTarget === "human";
}

function recommendedAdvanceStage(state: any): WorkflowStage | null {
  if (!state?.workspace_ready) return "setup";
  if (!state?.recon_results || ["needs_agent_decision", "needs_supervisor_judgment"].includes(state?.recon_status || "")) return "recon";
  if (!authorReady(state)) return "author";
  if (!implementationReady(state)) return "implement";
  if (state?.verify_status === "capture_incomplete") return verifyAssessment(state).continueWithStage || verifyAssessment(state).recommendedStage || "author";
  if (state?.verify_status === "evidence_captured") return verifyAssessment(state).continueWithStage || verifyAssessment(state).recommendedStage;
  if (!(state?.after_cdn || "").trim()) return "verify";
  return null;
}

function normalizeStageRequest(state: any, requestedAdvanceStage: WorkflowStage | null): WorkflowStage | null {
  if (requestedAdvanceStage) return requestedAdvanceStage;
  if (!state?.workspace_ready) return null;
  if (!state?.recon_results || ["needs_agent_decision", "needs_supervisor_judgment"].includes(state?.recon_status || "")) return "recon";
  return null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function commandResult(command: string, args: string[], cwd: string, timeout = 60_000) {
  try {
    return {
      ok: true,
      stdout: execFileSync(command, args, { cwd, encoding: "utf-8", timeout, stdio: ["ignore", "pipe", "pipe"] }),
      stderr: "",
    };
  } catch (error: any) {
    return {
      ok: false,
      stdout: String(error?.stdout || ""),
      stderr: String(error?.stderr || error?.message || ""),
    };
  }
}

function repoDirForSync(state: any) {
  const candidates = [
    state?.repo_dir,
    state?.after_worktree,
    state?.before_worktree,
  ].map(stringValue).filter(Boolean);
  return candidates.find((candidate) => existsSync(path.join(candidate, ".git"))) || "";
}

function parseWorktreeList(output: string) {
  const entries: Array<Record<string, string>> = [];
  let current: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) {
      if (current.worktree) entries.push(current);
      current = {};
      continue;
    }
    const [key, ...rest] = line.split(" ");
    const value = rest.join(" ").trim();
    if (key === "worktree" || key === "HEAD" || key === "branch" || key === "detached") current[key] = value;
  }
  if (current.worktree) entries.push(current);
  return entries;
}

function gitStdout(cwd: string, args: string[], timeout = 60_000) {
  const result = commandResult("git", args, cwd, timeout);
  return result.ok ? result.stdout.trim() : "";
}

function shortBranch(ref: string) {
  return ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
}

function safeInteger(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function baseCheckoutReport(repoDir: string, baseBranch: string, updateRequested: boolean, updateAllowed: boolean) {
  const remoteRef = `origin/${baseBranch}`;
  const report: Record<string, unknown> = {
    requested: updateRequested,
    repo_dir: repoDir,
    base_branch: baseBranch,
    remote_ref: remoteRef,
    updated: false,
  };

  const listed = commandResult("git", ["worktree", "list", "--porcelain"], repoDir, 60_000);
  if (!listed.ok) {
    report.update_skipped = "worktree_list_failed";
    report.error = listed.stderr.slice(0, 300);
    return report;
  }

  const worktrees = parseWorktreeList(listed.stdout);
  const baseRef = `refs/heads/${baseBranch}`;
  const selected =
    worktrees.find((entry) => entry.branch === baseRef) ||
    worktrees.find((entry) => path.resolve(entry.worktree || "") === path.resolve(repoDir) && shortBranch(entry.branch || "") === baseBranch);
  if (!selected?.worktree) {
    report.worktrees_seen = worktrees.map((entry) => ({
      path: entry.worktree || null,
      branch: entry.branch ? shortBranch(entry.branch) : null,
      detached: Boolean(entry.detached),
    }));
    report.update_skipped = "base_worktree_not_found";
    return report;
  }

  const baseDir = selected.worktree;
  const branch = shortBranch(selected.branch || "");
  const status = commandResult("git", ["status", "--porcelain"], baseDir, 60_000);
  const clean = status.ok && !status.stdout.trim();
  const localHead = gitStdout(baseDir, ["rev-parse", "HEAD"]);
  const remoteHead = gitStdout(baseDir, ["rev-parse", "--verify", remoteRef]);
  const counts = remoteHead ? gitStdout(baseDir, ["rev-list", "--left-right", "--count", `HEAD...${remoteRef}`]) : "";
  const [aheadRaw, behindRaw] = counts.split(/\s+/);

  Object.assign(report, {
    base_worktree: baseDir,
    branch: branch || null,
    clean,
    local_head: localHead || null,
    remote_head: remoteHead || null,
    ahead: safeInteger(aheadRaw || ""),
    behind: safeInteger(behindRaw || ""),
  });

  if (!updateRequested) {
    report.update_skipped = "update_not_requested";
    return report;
  }
  if (!updateAllowed) {
    report.update_skipped = "fetch_failed";
    return report;
  }
  if (branch !== baseBranch) {
    report.update_skipped = "base_worktree_not_on_base_branch";
    return report;
  }
  if (!status.ok) {
    report.update_skipped = "status_failed";
    report.status_error = status.stderr.slice(0, 300);
    return report;
  }
  if (!clean) {
    report.update_skipped = "base_worktree_dirty";
    return report;
  }
  if (!remoteHead) {
    report.update_skipped = "remote_ref_missing";
    return report;
  }
  if (localHead && localHead === remoteHead) {
    report.update_skipped = "already_current";
    return report;
  }

  const merge = commandResult("git", ["merge", "--ff-only", remoteRef], baseDir, 120_000);
  if (!merge.ok) {
    report.update_skipped = "fast_forward_failed";
    report.update_error = merge.stderr.slice(0, 500);
    return report;
  }

  const updatedHead = gitStdout(baseDir, ["rev-parse", "HEAD"]);
  const updatedCounts = gitStdout(baseDir, ["rev-list", "--left-right", "--count", `HEAD...${remoteRef}`]);
  const [updatedAheadRaw, updatedBehindRaw] = updatedCounts.split(/\s+/);
  report.updated = true;
  report.local_head = updatedHead || report.local_head;
  report.ahead = safeInteger(updatedAheadRaw || "");
  report.behind = safeInteger(updatedBehindRaw || "");
  report.update_summary = merge.stdout.trim().slice(0, 500);
  return report;
}

function normalizeGhPrStatus(value: unknown) {
  const status = stringValue(value).toLowerCase();
  if (status === "merged") return "merged";
  if (status === "open") return "open";
  if (status === "closed") return "closed";
  return status || "unknown";
}

function prRefFromState(state: any) {
  return stringValue(state?.pr_number) || stringValue(state?.pr_url);
}

function prNumberFromUrl(url: string) {
  const match = url.match(/\/pull\/(\d+)(?:$|[?#])/);
  return match?.[1] || "";
}

function normalizePrState(raw: any, state: any, checkedAt = new Date().toISOString()): any {
  const mergeCommit = typeof raw?.mergeCommit === "object" && raw.mergeCommit
    ? stringValue(raw.mergeCommit.oid)
    : stringValue(raw?.mergeCommit);
  const url = stringValue(raw?.url) || stringValue(state?.pr_url);
  return {
    status: normalizeGhPrStatus(raw?.state),
    pr_url: url || null,
    pr_number: String(raw?.number || state?.pr_number || prNumberFromUrl(url) || ""),
    repo: stringValue(state?.repo) || null,
    head_branch: stringValue(raw?.headRefName) || stringValue(state?.target_branch) || stringValue(state?.branch) || null,
    base_branch: stringValue(raw?.baseRefName) || stringValue(state?.base_branch) || "main",
    merge_commit: mergeCommit || null,
    merged_at: stringValue(raw?.mergedAt) || null,
    closed_at: stringValue(raw?.closedAt) || null,
    checked_at: checkedAt,
    source: "gh",
  };
}

function cleanupMergedProofRun(state: any, repoDir: string, params: WorkflowParams, prState: any) {
  const cleanup: Record<string, unknown> = {
    requested: params.cleanup_merged_pr !== false,
    fetch_base: params.fetch_base !== false,
    update_base_checkout: params.update_base_checkout !== false,
    repo_dir: repoDir,
    worktrees_removed: [],
    worktree_remove_errors: [],
    branches_deleted: [],
    branch_delete_errors: [],
    pruned: false,
  };

  const baseBranch = stringValue(prState.base_branch) || stringValue(state?.base_branch) || "main";
  let fetchedBase = params.fetch_base === false;
  if (params.fetch_base !== false && baseBranch) {
    const fetch = commandResult("git", ["fetch", "origin", baseBranch], repoDir, 120_000);
    cleanup.fetch = fetch.ok ? { ok: true, base_branch: baseBranch } : { ok: false, base_branch: baseBranch, error: fetch.stderr.slice(0, 300) };
    if (fetch.ok) {
      fetchedBase = true;
      state.base_synced_at = new Date().toISOString();
      state.base_branch = baseBranch;
    }
  }
  cleanup.base_checkout = baseCheckoutReport(repoDir, baseBranch, params.update_base_checkout !== false, fetchedBase);

  if (params.cleanup_merged_pr === false) {
    cleanup.skipped = "cleanup_disabled";
    return cleanup;
  }

  const removed: string[] = [];
  const removeErrors: Array<Record<string, string>> = [];
  for (const candidate of [state?.before_worktree, state?.after_worktree].map(stringValue).filter(Boolean)) {
    if (!existsSync(candidate) || path.resolve(candidate) === path.resolve(repoDir)) continue;
    const remove = commandResult("git", ["worktree", "remove", "--force", candidate], repoDir, 120_000);
    if (remove.ok) {
      removed.push(candidate);
    } else {
      removeErrors.push({ path: candidate, error: remove.stderr.slice(0, 300) });
    }
  }
  cleanup.worktrees_removed = removed;
  cleanup.worktree_remove_errors = removeErrors;

  const afterBranch = stringValue(state?.after_worktree_branch);
  if (afterBranch.startsWith("riddle-proof/")) {
    const deleted = commandResult("git", ["branch", "-D", afterBranch], repoDir, 60_000);
    if (deleted.ok) {
      cleanup.branches_deleted = [afterBranch];
    } else {
      cleanup.branch_delete_errors = [{ branch: afterBranch, error: deleted.stderr.slice(0, 300) }];
    }
  }

  const prune = commandResult("git", ["worktree", "prune"], repoDir, 60_000);
  cleanup.pruned = prune.ok;
  if (!prune.ok) cleanup.prune_error = prune.stderr.slice(0, 300);
  return cleanup;
}

function syncPrLifecycle(statePath: string, params: WorkflowParams) {
  const state = readState(statePath);
  if (!state) {
    return {
      ok: false,
      action: "sync",
      state_path: statePath,
      checkpoint: "pr_sync_not_found",
      summary: "No readable Riddle Proof state exists at state_path.",
      state: null,
      nextAction: "Check the wrapper state_path or run riddle_proof_status first.",
    };
  }

  const repoDir = repoDirForSync(state);
  const prRef = prRefFromState(state);
  if (!repoDir || !prRef) {
    const missingPr = !prRef;
    const orphanSummary = "Riddle Proof state exists, but this run is not recoverable through PR sync because no PR URL or PR number was linked before it stopped.";
    const orphanNextAction = "Treat this as an orphaned proof run: update the base checkout directly if needed, then clean stale proof worktrees or riddle-proof/* branches outside normal PR sync.";
    const prState = {
      status: missingPr ? "orphaned" : "unavailable",
      pr_url: state.pr_url || null,
      pr_number: String(state.pr_number || prNumberFromUrl(stringValue(state.pr_url)) || ""),
      repo: state.repo || null,
      head_branch: state.target_branch || state.branch || null,
      base_branch: state.base_branch || "main",
      checked_at: new Date().toISOString(),
      source: repoDir ? "state" : "local_state",
      sync_recoverable: !missingPr,
      sync_blocker: missingPr ? "missing_pr_linkage" : "missing_local_repo",
      next_action: missingPr
        ? orphanNextAction
        : "State has a PR but no readable local git repo/worktree; restore repo access and rerun sync.",
    };
    state.pr_state = prState;
    if (missingPr) state.pr_sync_summary = orphanSummary;
    writeState(statePath, state);
    return {
      ok: false,
      action: "sync",
      state_path: statePath,
      checkpoint: missingPr ? "pr_sync_no_pr" : "pr_sync_unavailable",
      summary: missingPr ? orphanSummary : prState.next_action,
      state: summarizeState(state).state,
      pr_state: prState,
      nextAction: prState.next_action,
    };
  }

  const viewed = commandResult("gh", ["pr", "view", prRef, "--json", "state,mergedAt,closedAt,mergeCommit,headRefName,baseRefName,url,number"], repoDir, 60_000);
  if (!viewed.ok) {
    const prState = {
      status: "unavailable",
      pr_url: state.pr_url || null,
      pr_number: String(state.pr_number || prNumberFromUrl(stringValue(state.pr_url)) || ""),
      repo: state.repo || null,
      head_branch: state.target_branch || state.branch || null,
      base_branch: state.base_branch || "main",
      checked_at: new Date().toISOString(),
      source: "gh",
      next_action: "GitHub PR state is unavailable; fix gh auth/repo access and rerun riddle_proof_sync.",
    };
    state.pr_state = prState;
    state.cleanup_report = { requested: params.cleanup_merged_pr !== false, skipped: "pr_state_unavailable", error: viewed.stderr.slice(0, 300) };
    writeState(statePath, state);
    return {
      ok: false,
      action: "sync",
      state_path: statePath,
      checkpoint: "pr_sync_unavailable",
      summary: prState.next_action,
      state: summarizeState(state).state,
      pr_state: prState,
      cleanup: state.cleanup_report,
      nextAction: prState.next_action,
    };
  }

  let rawPr: any;
  try {
    rawPr = JSON.parse(viewed.stdout);
  } catch {
    rawPr = {};
  }

  const prState = normalizePrState(rawPr, state);
  let cleanup: Record<string, unknown> | null = null;
  let checkpoint = "pr_sync_open";
  let ok = true;
  let summary = "PR is still open; no merge cleanup was performed.";
  let nextAction = "Wait for the PR to merge, then rerun riddle_proof_sync.";

  if (prState.status === "merged") {
    cleanup = cleanupMergedProofRun(state, repoDir, params, prState);
    prState.cleanup = cleanup;
    prState.next_action = "The PR is merged; sync recorded proof cleanup and the local base checkout refresh status.";
    state.finalized = true;
    state.merge_commit = prState.merge_commit || state.merge_commit || "";
    state.merged_at = prState.merged_at || state.merged_at || "";
    state.cleanup_report = cleanup;
    checkpoint = "pr_sync_merged";
    summary = "PR is merged and Riddle Proof state has been reconciled.";
    nextAction = "Start the next proof run from the recorded base checkout; inspect cleanup.base_checkout only if it reports a skipped or failed fast-forward.";
  } else if (prState.status === "closed") {
    prState.next_action = "The PR is closed without a merge; inspect the PR before reusing or deleting the branch.";
    checkpoint = "pr_sync_closed";
    summary = "PR is closed without a merge; no merge cleanup was performed.";
    nextAction = prState.next_action;
  } else if (prState.status !== "open") {
    ok = false;
    prState.next_action = "PR state was not recognized; inspect gh pr view output and rerun sync.";
    checkpoint = "pr_sync_unavailable";
    summary = prState.next_action;
    nextAction = prState.next_action;
  }

  state.pr_state = prState;
  state.pr_url = prState.pr_url || state.pr_url;
  state.pr_number = prState.pr_number || state.pr_number;
  state.target_branch = prState.head_branch || state.target_branch || state.branch;
  state.branch = prState.head_branch || state.branch;
  state.base_branch = prState.base_branch || state.base_branch;
  writeState(statePath, state);
  const snapshot = summarizeState(state);
  return {
    ok,
    action: "sync",
    state_path: statePath,
    checkpoint,
    summary,
    state: snapshot.state,
    pr_state: prState,
    cleanup,
    nextAction,
  };
}

export async function executeWorkflow(
  params: WorkflowParams,
  pluginConfig: any,
  resolvedConfig?: ReturnType<typeof resolveConfig>,
) {
  const config = resolvedConfig || resolveConfig(pluginConfig, params);
  const action = ensureAction(params.action);

  if (!existsSync(config.riddleProofDir)) {
    throw new Error(`riddle-proof runtime directory not found: ${config.riddleProofDir}`);
  }

  if (action === "status") {
    return {
      state_path: config.statePath,
      ...summarizeState(readState(config.statePath)),
    };
  }

  if (action === "sync") {
    return syncPrLifecycle(config.statePath, params);
  }

  const stateKey = path.basename(config.statePath).replace(/[^A-Za-z0-9_.-]/g, "-");
  const lobsterStateDir = path.join(path.dirname(config.statePath), "riddle-proof-lobster-state", stateKey);
  mkdirSync(lobsterStateDir, { recursive: true });
  const env = {
    ...process.env,
    RIDDLE_PROOF_DIR: config.riddleProofDir,
    RIDDLE_PROOF_STATE_FILE: config.statePath,
    RIDDLE_PROOF_ARGS_FILE: config.argsPath,
    LOBSTER_STATE_DIR: lobsterStateDir,
  };
  const lobsterCommand = process.env.RIDDLE_PROOF_LOBSTER_COMMAND || "lobster";
  const lobsterPrefix = process.env.RIDDLE_PROOF_LOBSTER_SCRIPT
    ? [process.env.RIDDLE_PROOF_LOBSTER_SCRIPT]
    : [];

  const runOne = (step: WorkflowStage): WorkflowStepResult => {
    const args = step === "setup" ? buildSetupArgs(params, config) : {};
    const stepWorkflowFile = workflowFile(config.riddleProofDir, step);
    const timer = beginRuntimeStep(config.statePath, action, step, stepWorkflowFile);
    let output: any;
    try {
      output = JSON.parse(
        execFileSync(lobsterCommand, [...lobsterPrefix, "run", "--file", stepWorkflowFile, "--args-json", JSON.stringify(args)], {
          encoding: "utf-8",
          env,
        }),
      );
    } catch (error: any) {
      return finishRuntimeStep(config.statePath, action, {
        ok: false,
        step,
        error: error?.message || String(error),
        stdout: String(error?.stdout || ""),
        stderr: String(error?.stderr || ""),
      }, timer);
    }
    if (output?.status === "needs_approval") {
      if (!params.auto_approve) {
        return finishRuntimeStep(config.statePath, action, {
          ok: false,
          haltedForApproval: true,
          step,
          approval: output.requiresApproval || null,
          raw: output,
        }, timer);
      }
      const token = output?.requiresApproval?.resumeToken;
      if (!token) {
        return finishRuntimeStep(config.statePath, action, {
          ok: false,
          step,
          error: `${step} requested approval without a resume token.`,
          raw: output,
        }, timer);
      }
      let resumed: any;
      try {
        resumed = JSON.parse(
          execFileSync(lobsterCommand, [...lobsterPrefix, "resume", "--token", token, "--approve", "yes"], {
            encoding: "utf-8",
            env,
          }),
        );
      } catch (error: any) {
        return finishRuntimeStep(config.statePath, action, {
          ok: false,
          step,
          autoApproved: true,
          error: error?.message || String(error),
          stdout: String(error?.stdout || ""),
          stderr: String(error?.stderr || ""),
        }, timer);
      }
      return finishRuntimeStep(config.statePath, action, {
        ok: resumed?.ok !== false,
        step,
        autoApproved: true,
        raw: resumed,
      }, timer);
    }
    return finishRuntimeStep(config.statePath, action, {
      ok: output?.ok !== false,
      step,
      raw: output,
    }, timer);
  };

  let effectiveAdvanceStage: WorkflowStage | null = params.advance_stage || null;

  const recordAttempt = (
    stage: WorkflowStage,
    status: string,
    summary: string,
    extra: {
      checkpoint?: string | null;
      haltedForApproval?: boolean;
      autoApproved?: boolean;
      retryable?: boolean;
      checkpointDisposition?: string | null;
      error?: string | null;
      details?: Record<string, unknown>;
    } = {},
  ) => {
    updateState(config.statePath, (state) => {
      recordStageAttempt(state, stage, {
        status,
        summary,
        checkpoint: extra.checkpoint || null,
        requestedAdvanceStage: effectiveAdvanceStage || null,
        haltedForApproval: extra.haltedForApproval,
        autoApproved: extra.autoApproved,
        retryable: extra.retryable,
        checkpointDisposition: extra.checkpointDisposition || null,
        error: extra.error || null,
        details: extra.details || {},
      });
    });
  };

  const checkpoint = (
    stage: WorkflowStage,
    name: string,
    summary: string,
    extra: {
      ok?: boolean;
      nextActions?: string[];
      advanceOptions?: WorkflowStage[];
      recommendedAdvanceStage?: WorkflowStage | null;
      continueWithStage?: WorkflowStage | null;
      blocking?: boolean;
      details?: Record<string, unknown>;
      [key: string]: unknown;
    } = {},
  ) => {
    const decision = updateState(config.statePath, (state) => {
      const checkpointContract = buildCheckpointContract(state, {
        statePath: config.statePath,
        stage,
        checkpoint: name,
        summary,
        nextActions: extra.nextActions,
        advanceOptions: extra.advanceOptions,
        recommendedAdvanceStage: extra.recommendedAdvanceStage,
        continueWithStage: extra.continueWithStage,
        blocking: extra.blocking,
      });
      setStageDecisionRequest(state, {
        stage,
        checkpoint: name,
        summary,
        nextActions: extra.nextActions,
        advanceOptions: extra.advanceOptions,
        recommendedAdvanceStage: extra.recommendedAdvanceStage,
        continueWithStage: extra.continueWithStage,
        blocking: extra.blocking,
        details: extra.details,
        checkpointContract,
      });
    }).stage_decision_request;
    const snapshot = snapshotFor(config.statePath);
    return {
      ok: extra.ok ?? true,
      action,
      state_path: config.statePath,
      stage: snapshot.stage,
      checkpoint: name,
      summary,
      state: snapshot.state,
      decisionRequest: decision,
      checkpointContract: decision?.checkpoint_contract || null,
      ...extra,
    };
  };

  const primaryShipGateNextAction = (shipGate: ReturnType<typeof validateShipGate>) => {
    const reasons = shipGate.reasons || [];
    if (reasons.some((reason) => reason.includes("proof_assessment"))) {
      return "resume with riddle_proof_review using decision=ready_to_ship only after the screenshots and semantic evidence visibly prove the request; otherwise choose needs_implementation or needs_richer_proof";
    }
    if (reasons.some((reason) => reason.includes("visual_delta"))) {
      return "rerun verify with a measured before/after visual delta, or choose needs_richer_proof instead of ready_to_ship for this visual proof";
    }
    if (reasons.some((reason) => reason.includes("after_cdn") || reason.includes("verify_status"))) {
      return "rerun verify with stronger proof framing so after evidence is captured before shipping";
    }
    if (reasons.some((reason) => reason.includes("before_cdn") || reason.includes("prod_cdn") || reason.includes("prod_url"))) {
      return "return to recon and capture the missing required baseline before shipping";
    }
    return "inspect the ship gate details, repair the missing invariant, then resume the run";
  };

  const shipGateBlocked = (
    state: any,
    executed: any[],
    details: Record<string, unknown> = {},
  ) => {
    const shipGate = validateShipGate(state);
    const nextAction = primaryShipGateNextAction(shipGate);
    return checkpoint(
      "verify",
      "ship_gate_blocked",
      `Ship is blocked until the proof bundle satisfies the hard ship gate. Next action: ${nextAction}.`,
      {
        ok: false,
        nextActions: ["inspect_ship_gate", "advance_run_to_verify", "supply_proof_assessment_json", "return_to_recon_if_baseline_is_missing"],
        advanceOptions: ["verify", "author", "implement", "recon"],
        recommendedAdvanceStage: "verify",
        continueWithStage: "verify",
        blocking: true,
        details: { ...details, shipGate, next_action: nextAction, executed },
        nextAction,
        shipGate,
        verifyStatus: state?.verify_status || null,
        mergeRecommendation: state?.merge_recommendation || null,
        afterCdn: state?.after_cdn || null,
        proofAssessment: state?.proof_assessment || null,
        proofAssessmentRequest: state?.proof_assessment_request || null,
        executed,
      },
    );
  };

  const failedRun = (
    stage: WorkflowStage,
    summary: string,
    res: any,
    extra: { checkpoint?: string; blocking?: boolean; details?: Record<string, unknown>; [key: string]: unknown } = {},
  ) => {
    recordAttempt(stage, res?.haltedForApproval ? "approval_required" : "failed", summary, {
      checkpoint: extra.checkpoint || null,
      haltedForApproval: res?.haltedForApproval || false,
      autoApproved: res?.autoApproved || false,
      error: res?.error || null,
      details: extra.details,
    });
    const snapshot = snapshotFor(config.statePath);
    return {
      ok: false,
      action,
      state_path: config.statePath,
      stage: snapshot.stage,
      summary,
      state: snapshot.state,
      approval: res?.approval || null,
      error: res?.error || null,
      checkpoint: extra.checkpoint || null,
      ...extra,
    };
  };

  if (action !== "setup") {
    mergeStateFromParams(config.statePath, params);
  }

  if (action === "run") {
    const executed: any[] = [];
    let state = readState(config.statePath);

    if (!state || !state.workspace_ready || params.advance_stage === "setup") {
      const setupRes = runOne("setup");
      executed.push(executedStep(setupRes));
      if (!setupRes.ok || setupRes.haltedForApproval) {
        return failedRun("setup", setupRes.haltedForApproval ? "setup halted for approval" : "setup failed", setupRes, {
          checkpoint: "setup_blocked",
        });
      }
      recordAttempt("setup", "completed", "Setup completed and state/worktrees are ready.", {
        checkpoint: params.advance_stage === "setup" ? "setup_review" : null,
        autoApproved: setupRes.autoApproved || false,
      });
      state = readState(config.statePath);
      if (params.advance_stage === "setup") {
        return checkpoint(
          "setup",
          "setup_review",
          "Setup completed. Inspect the prepared workspace and explicitly advance to recon when ready.",
          {
            nextActions: ["inspect_setup_state", "advance_run_to_recon"],
            advanceOptions: ["recon", "setup"],
            recommendedAdvanceStage: "recon",
            details: { executed },
            executed,
          },
        );
      }
    }

    state = readState(config.statePath);
    const continuedStage = params.continue_from_checkpoint ? checkpointContinueStage(state) : null;
    if (params.continue_from_checkpoint && !params.advance_stage && !continuedStage) {
      const recommended = recommendedAdvanceStage(state);
      return checkpoint(
        (state?.active_checkpoint_stage as WorkflowStage | null) || recommended || "recon",
        "continue_unavailable",
        "This run call asked to continue from a checkpoint, but the current state has no resumable checkpoint. Inspect status or set advance_stage explicitly.",
        {
          ok: false,
          nextActions: ["inspect_state", "set_advance_stage", "resume_run"],
          advanceOptions: ["recon", "author", "implement", "verify", "ship"],
          recommendedAdvanceStage: null,
          blocking: true,
          details: {
            executed,
            activeCheckpoint: state?.active_checkpoint || null,
            suggestedAdvanceStage: recommended || null,
          },
          suggestedAdvanceStage: recommended || null,
          executed,
        },
      );
    }
    effectiveAdvanceStage = params.advance_stage || continuedStage || null;
    if (effectiveAdvanceStage) {
      updateState(config.statePath, (state) => {
        clearStageDecisionRequest(state);
        state.last_requested_advance_stage = effectiveAdvanceStage;
      });
      state = readState(config.statePath);
    }
    let requestedStage = normalizeStageRequest(state, effectiveAdvanceStage);
    const reconCheckpointActive = ["needs_agent_decision", "needs_supervisor_judgment"].includes(state?.recon_status || "")
      || state?.active_checkpoint === "recon_supervisor_judgment";

    if (requestedStage === "recon" && reconCheckpointActive) {
      const latestAttempt = latestReconAttempt(state);
      const latestCapturedBaselines = latestReconCapturedBaselines(state);
      const latestAssessment = reconAssessment(state);
      const reconAssessmentRequest = state?.recon_assessment_request || state?.recon_decision_request || null;
      const reconDetails = {
        executed,
        latestAttempt,
        latestCapturedBaselines,
        reconAssessmentRequest,
        reconAssessment: latestAssessment.raw,
      };

      if (!hasSupervisorReconAssessment(state)) {
        return checkpoint(
          "recon",
          "recon_supervisor_judgment",
          "Recon gathered route hints, candidate paths, baseline captures, and observations. The supervising agent should now judge whether the latest baseline is trustworthy, whether recon should retry/reframe, and whether recon is done.",
          {
            nextActions: ["inspect_recon_packet", "supply_recon_assessment_json", "continue_internal_loop_with_checkpoint"],
            advanceOptions: ["recon", "author"],
            recommendedAdvanceStage: "recon",
            continueWithStage: "recon",
            blocking: false,
            details: reconDetails,
            reconAssessmentRequest,
            reconDecisionRequest: state?.recon_decision_request || null,
            executed,
          },
        );
      }

      if (latestAssessment.decision === "recon_stuck" && latestAssessment.escalationTarget === "human") {
        const summary = latestAssessment.summary || "The supervising agent concluded recon is genuinely stuck and should escalate to the human.";
        recordAttempt("recon", "escalated", summary, {
          checkpoint: "recon_human_escalation",
          details: reconDetails,
        });
        return checkpoint(
          "recon",
          "recon_human_escalation",
          summary,
          {
            ok: false,
            nextActions: ["inspect_recon_history", "summarize_failed_baselines", "ask_human_for_direction"],
            advanceOptions: ["recon", "author"],
            recommendedAdvanceStage: null,
            continueWithStage: null,
            blocking: true,
            details: reconDetails,
            reconAssessment: latestAssessment.raw,
            reconAssessmentRequest,
            executed,
          },
        );
      }

      if ((latestAssessment.decision === "ready_for_author" || latestAssessment.continueWithStage === "author") && latestReconHasRequiredBaselines(state) && hasReconBaselineUnderstanding(state)) {
        updateState(config.statePath, (currentState) => {
          promoteLatestReconBaselines(currentState);
          currentState.recon_status = "ready_for_proof_plan";
          currentState.recon_results = currentState.recon_results || {};
          currentState.recon_results.status = "ready_for_proof_plan";
          currentState.recon_assessment_request = {};
          currentState.recon_decision_request = {};
          if ((currentState.proof_plan || "").trim() && (currentState.capture_script || "").trim()) {
            currentState.author_status = "ready";
            currentState.proof_plan_status = "ready";
          } else if (!authorReady(currentState)) {
            currentState.author_status = "needs_authoring";
            currentState.proof_plan_status = "needs_authoring";
          }
        });
        state = readState(config.statePath);
        const approvedSummary = latestAssessment.summary || "The supervising agent approved the latest recon baseline and selected the route for proof authoring.";
        if (params.advance_stage === "recon") {
          recordAttempt("recon", "completed", approvedSummary, {
            checkpoint: "recon_review",
            details: {
              ...reconDetails,
              promotedBaselines: latestReconCapturedBaselines(state),
            },
          });
          return checkpoint(
            "recon",
            "recon_review",
            approvedSummary,
            {
              nextActions: ["inspect_recon_baseline", "continue_internal_loop_with_checkpoint", "advance_run_to_author"],
              advanceOptions: ["author", "recon", "implement"],
              recommendedAdvanceStage: "author",
              continueWithStage: "author",
              blocking: false,
              details: {
                ...reconDetails,
                promotedBaselines: latestReconCapturedBaselines(state),
              },
              reconAssessment: latestAssessment.raw,
              executed,
            },
          );
        }
        recordAttempt("recon", "completed", approvedSummary, {
          checkpoint: "recon_auto_continue",
          details: {
            ...reconDetails,
            promotedBaselines: latestReconCapturedBaselines(state),
          },
        });
        effectiveAdvanceStage = "author";
        updateState(config.statePath, (currentState) => {
          currentState.last_requested_advance_stage = "author";
        });
        state = readState(config.statePath);
        requestedStage = normalizeStageRequest(state, effectiveAdvanceStage);
      } else if (latestAssessment.decision === "ready_for_author") {
        const missingUnderstanding = latestReconHasRequiredBaselines(state) && !hasReconBaselineUnderstanding(state);
        return checkpoint(
          "recon",
          "recon_supervisor_judgment",
          missingUnderstanding
            ? "The supervising agent tried to approve recon, but did not provide a concrete baseline_understanding. The before evidence must be understood before proof authoring or code edits begin."
            : "The supervising agent tried to approve recon, but the latest attempt is still missing one or more required baseline screenshots. Retry recon with a better plan or declare the loop genuinely stuck.",
          {
            ok: false,
            nextActions: ["inspect_recon_packet", "refine_recon_plan", "continue_internal_loop_with_checkpoint"],
            advanceOptions: ["recon", "author"],
            recommendedAdvanceStage: "recon",
            continueWithStage: "recon",
            blocking: false,
            details: reconDetails,
            reconAssessment: latestAssessment.raw,
            reconAssessmentRequest,
            executed,
          },
        );
      } else {
        updateState(config.statePath, (currentState) => {
          currentState.recon_status = "";
          currentState.recon_assessment = {};
          currentState.recon_assessment_source = null;
          currentState.recon_assessment_request = {};
          currentState.recon_decision_request = {};
          currentState.before_cdn = "";
          currentState.prod_cdn = "";
          currentState.recon_results = currentState.recon_results || {};
          currentState.recon_results.baselines = {};
          currentState.recon_results.selected_attempt = {};
          currentState.recon_results.status = "retry_requested";
        });
        state = readState(config.statePath);
      }
    }

    if (!state?.recon_results || state?.stage === "setup" || state?.stage === "preflight" || ["needs_agent_decision", "needs_supervisor_judgment"].includes(state?.recon_status || "") || requestedStage === "recon") {
      const reconRes = runOne("recon");
      executed.push(executedStep(reconRes));
      if (!reconRes.ok || reconRes.haltedForApproval) {
        return failedRun("recon", reconRes.haltedForApproval ? "recon halted for approval" : "recon failed", reconRes, {
          checkpoint: "recon_failed",
          details: { executed },
          executed,
        });
      }
      state = readState(config.statePath);
      if (["needs_agent_decision", "needs_supervisor_judgment"].includes(state?.recon_status || "")) {
        const reconAssessmentRequest = state?.recon_assessment_request || state?.recon_decision_request || null;
        const summary = "Recon gathered route hints, candidate paths, baseline captures, and observations. The supervising agent should now judge whether the latest baseline is trustworthy, whether recon should retry/reframe, and whether recon is done.";
        const reconDetails = {
          executed,
          latestAttempt: latestReconAttempt(state),
          latestCapturedBaselines: latestReconCapturedBaselines(state),
          reconAssessmentRequest,
        };
        recordAttempt("recon", "checkpoint", summary, {
          autoApproved: reconRes.autoApproved || false,
          checkpoint: "recon_supervisor_judgment",
          details: reconDetails,
        });
        return checkpoint(
          "recon",
          "recon_supervisor_judgment",
          summary,
          {
            nextActions: ["inspect_recon_packet", "supply_recon_assessment_json", "continue_internal_loop_with_checkpoint"],
            advanceOptions: ["recon", "author"],
            recommendedAdvanceStage: "recon",
            continueWithStage: "recon",
            blocking: false,
            details: reconDetails,
            reconAssessmentRequest,
            reconDecisionRequest: state?.recon_decision_request || null,
            executed,
          },
        );
      }
      recordAttempt("recon", "completed", "Recon completed and promoted an approved baseline context.", {
        autoApproved: reconRes.autoApproved || false,
        details: { executed },
      });
    }

    state = readState(config.statePath);
    if (!authorReady(state) || effectiveAdvanceStage === "author") {
      const authorRes = runOne("author");
      executed.push(executedStep(authorRes));
      if (!authorRes.ok || authorRes.haltedForApproval) {
        return failedRun("author", authorRes.haltedForApproval ? "author halted for approval" : "author failed", authorRes, {
          checkpoint: "author_failed",
          details: { executed },
          executed,
        });
      }
      state = readState(config.statePath);
      if (!authorReady(state)) {
        recordAttempt("author", "checkpoint", "Author prepared a supervisor judgment request instead of delegating proof authoring to an internal model.", {
          autoApproved: authorRes.autoApproved || false,
          checkpoint: "author_supervisor_judgment",
          details: {
            executed,
            authorSummary: state?.author_summary || null,
            authorRequest: state?.author_request || null,
            serverPath: state?.server_path || null,
            waitForSelector: state?.wait_for_selector || null,
          },
        });
        return checkpoint(
          "author",
          "author_supervisor_judgment",
          "Author distilled recon into a proof-authoring request. The supervising agent should supply the proof packet, then resume the workflow.",
          {
            nextActions: ["inspect_author_request", "supply_author_packet_json_or_proof_plan", "continue_internal_loop_with_checkpoint"],
            advanceOptions: ["author", "recon", "implement", "verify"],
            recommendedAdvanceStage: "author",
            continueWithStage: "author",
            details: {
              executed,
              authorSummary: state?.author_summary || null,
              authorRequest: state?.author_request || null,
              proofPlanDraft: state?.author_request?.fallback_defaults?.proof_plan || null,
              captureScriptDraft: state?.author_request?.fallback_defaults?.capture_script || null,
              serverPathDraft: state?.author_request?.fallback_defaults?.server_path || null,
              waitForSelectorDraft: state?.author_request?.fallback_defaults?.wait_for_selector || null,
            },
            authorSummary: state?.author_summary || null,
            authorRequest: state?.author_request || null,
            proofPlanDraft: state?.author_request?.fallback_defaults?.proof_plan || null,
            captureScriptDraft: state?.author_request?.fallback_defaults?.capture_script || null,
            serverPathDraft: state?.author_request?.fallback_defaults?.server_path || null,
            waitForSelectorDraft: state?.author_request?.fallback_defaults?.wait_for_selector || null,
            executed,
          },
        );
      }
      const authorNextStage = stageAfterAuthor(state);
      const explicitAuthorDebug = params.advance_stage === "author";
      recordAttempt("author", "completed", "Author applied the supervising agent's proof packet to recon observations.", {
        autoApproved: authorRes.autoApproved || false,
        checkpoint: explicitAuthorDebug ? "author_review" : "author_auto_continue",
        details: {
          executed,
          authorSummary: state?.author_summary || null,
          authorModel: state?.author_model || null,
          authorRuntimeModelHint: state?.author_runtime_model_hint || null,
          serverPath: state?.server_path || null,
          waitForSelector: state?.wait_for_selector || null,
        },
      });
      if (explicitAuthorDebug) {
        return checkpoint(
          "author",
          "author_review",
          authorNextStage === "verify"
            ? "Author applied the supervising agent's proof packet. Because implementation is already recorded, you can continue straight into verify."
            : "Author applied the supervising agent's proof packet. Inspect it if needed, then continue into implement.",
          {
            nextActions: authorNextStage === "verify"
              ? ["inspect_proof_packet", "advance_run_to_verify", "rerun_author"]
              : ["inspect_proof_packet", "advance_run_to_implement", "rerun_author"],
            advanceOptions: authorNextStage === "verify"
              ? ["author", "verify", "recon"]
              : ["author", "implement", "recon"],
            recommendedAdvanceStage: authorNextStage,
            continueWithStage: authorNextStage,
            details: {
              executed,
              authorSummary: state?.author_summary || null,
              authorModel: state?.author_model || null,
              authorRuntimeModelHint: state?.author_runtime_model_hint || null,
              proofPlan: state?.proof_plan || null,
              serverPath: state?.server_path || null,
              waitForSelector: state?.wait_for_selector || null,
            },
            authorSummary: state?.author_summary || null,
            authorModel: state?.author_model || null,
            authorRuntimeModelHint: state?.author_runtime_model_hint || null,
            proofPlan: state?.proof_plan || null,
            serverPath: state?.server_path || null,
            waitForSelector: state?.wait_for_selector || null,
            executed,
          },
        );
      }
      effectiveAdvanceStage = authorNextStage;
      updateState(config.statePath, (currentState) => {
        currentState.last_requested_advance_stage = authorNextStage;
      });
      state = readState(config.statePath);
    }

    if (!effectiveAdvanceStage) {
      const recommended = recommendedAdvanceStage(state);
      return checkpoint(
        recommended || "implement",
        "awaiting_stage_advance",
        "Proof authoring is ready. The wrapper will not guess the next stage from here, explicitly choose whether to revisit recon/author, validate implementation, capture verify evidence, or ship.",
        {
          nextActions: ["inspect_state", "set_advance_stage", "resume_run"],
          advanceOptions: ["recon", "author", "implement", "verify", "ship"],
          recommendedAdvanceStage: recommended,
          details: { executed },
          executed,
        },
      );
    }

    if (effectiveAdvanceStage === "implement") {
      const implementRes = runOne("implement");
      executed.push(executedStep(implementRes));
      if (implementRes.haltedForApproval) {
        return failedRun("implement", "implement halted for approval", implementRes, {
          checkpoint: "implement_blocked",
          details: { executed },
          executed,
        });
      }
      if (!implementRes.ok) {
        const implementError = `${implementRes.error || ""}\n${implementRes.stdout || ""}\n${implementRes.stderr || ""}`;
        if (implementError.includes("No implementation detected")) {
          const implementationState = readState(config.statePath) || {};
          const implementationSummary = stringValue(implementationState?.implementation_summary) || null;
          const implementationDetectionSummary = stringValue(implementationState?.implementation_detection_summary) || null;
          const implementationDetection =
            implementationState?.implementation_detection &&
            typeof implementationState.implementation_detection === "object" &&
            !Array.isArray(implementationState.implementation_detection)
              ? implementationState.implementation_detection as Record<string, unknown>
              : null;
          recordAttempt("implement", "checkpoint", "Implementation checkpoint found no material code changes yet.", {
            checkpoint: "implement_changes_missing",
            error: implementRes.error || null,
            retryable: true,
            checkpointDisposition: "retryable_implementation_gap",
            details: {
              executed,
              implementationSummary,
              implementationDetectionSummary,
              implementationDetection,
            },
          });
          return checkpoint(
            "implement",
            "implement_changes_missing",
            "Proof plan is ready, but code changes are not recorded yet. Make the implementation changes on the after worktree, then resume run.",
            {
              nextActions: ["make_code_changes", "rerun_implement"],
              advanceOptions: ["implement", "author", "recon"],
              recommendedAdvanceStage: "implement",
              blocking: true,
              retryable: true,
              checkpointDisposition: "retryable_implementation_gap",
              details: {
                executed,
                implementationSummary,
                implementationDetectionSummary,
                implementationDetection,
              },
              implementationSummary,
              implementationDetectionSummary,
              implementationDetection,
              executed,
            },
          );
        }
        return failedRun("implement", "implement failed", implementRes, {
          checkpoint: "implement_failed",
          details: { executed },
          executed,
        });
      }
      let invalidatedVerifyEvidence = false;
      updateState(config.statePath, (state) => {
        invalidatedVerifyEvidence = invalidateVerifyEvidence(state).invalidated;
      });
      recordAttempt("implement", "completed", "Implementation checkpoint recorded code changes on the after worktree.", {
        autoApproved: implementRes.autoApproved || false,
        checkpoint: "implement_review",
        details: { executed, invalidatedVerifyEvidence },
      });
      return checkpoint(
        "implement",
        "implement_review",
        invalidatedVerifyEvidence
          ? "Implementation changes were detected and prior verify evidence was invalidated. Inspect the branch diff or notes, then explicitly choose whether to iterate implementation again or advance to verify."
          : "Implementation changes were detected. Inspect the branch diff or notes, then explicitly choose whether to iterate implementation again or advance to verify.",
        {
          nextActions: ["inspect_branch_diff", "rerun_implement", "advance_run_to_verify"],
          advanceOptions: ["implement", "author", "verify", "recon"],
          recommendedAdvanceStage: "verify",
          details: {
            executed,
            implementationSummary: readState(config.statePath)?.implementation_summary || null,
            invalidatedVerifyEvidence,
          },
          implementationSummary: readState(config.statePath)?.implementation_summary || null,
          invalidatedVerifyEvidence,
          executed,
        },
      );
    }

    if (effectiveAdvanceStage === "verify") {
      state = readState(config.statePath);
      if (!["changes_detected", "completed"].includes(state?.implementation_status || "")) {
        return checkpoint(
          "implement",
          "implement_required",
          "Verify is blocked until implementation has been recorded. Run the implement stage after making code changes, then resume verify.",
          {
            ok: false,
            nextActions: ["make_code_changes", "advance_run_to_implement"],
            advanceOptions: ["implement", "author", "recon"],
            recommendedAdvanceStage: "implement",
            continueWithStage: "implement",
            blocking: true,
            details: { executed },
            executed,
          },
        );
      }

      const hasIncomingProofAssessment = typeof params.proof_assessment_json === "string" && params.proof_assessment_json.trim().length > 0;
      const canReuseVerifyEvidence =
        (params.advance_stage !== "verify" || hasIncomingProofAssessment)
        && state?.verify_status === "evidence_captured"
        && Boolean((state?.after_cdn || "").trim())
        && (state?.active_checkpoint === "verify_supervisor_judgment" || hasSupervisorProofAssessment(state));

      let verifyRes: any = { ok: true, step: "verify", reusedEvidence: canReuseVerifyEvidence };
      if (!canReuseVerifyEvidence) {
        verifyRes = runOne("verify");
        executed.push(executedStep(verifyRes));
        if (!verifyRes.ok || verifyRes.haltedForApproval) {
          return failedRun("verify", verifyRes.haltedForApproval ? "verify halted for approval" : "verify failed", verifyRes, {
            checkpoint: "verify_failed",
            details: { executed },
            executed,
          });
        }
      } else {
        executed.push(executedStep(verifyRes, { reusedEvidence: true }));
      }

      state = readState(config.statePath);
      const verifyStatus = state?.verify_status || ((state?.after_cdn || "").trim() ? "evidence_captured" : "capture_incomplete");
      const verifyDecisionRequest = state?.verify_decision_request || null;
      const verifySummary = state?.verify_summary || state?.proof_summary || null;
      const proofAssessment = verifyAssessment(state);
      const convergenceSignals = nonConvergenceSignals(state, proofAssessment);
      const verifyRecommendedStage = proofAssessment.recommendedStage || null;
      const verifyContinueWithStage = shouldEscalateVerifyToHuman(state, proofAssessment)
        ? null
        : (proofAssessment.continueWithStage || verifyRecommendedStage || null);
      const verifyDetails = {
        executed,
        verifyStatus,
        verifySummary,
        afterCdn: state?.after_cdn || null,
        mergeRecommendation: state?.merge_recommendation || null,
        verifyDecisionRequest,
        proofAssessment: proofAssessment.raw,
        proofAssessmentSource: proofAssessment.source || null,
        proofAssessmentRequest: state?.proof_assessment_request || null,
        verifyRecommendedStage,
        verifyContinueWithStage,
        convergenceSignals,
      };

      if (verifyStatus !== "evidence_captured") {
        if ((verifyContinueWithStage || verifyRecommendedStage || "author") === "author") {
          updateState(config.statePath, (currentState) => {
            currentState.author_status = "needs_authoring";
            currentState.proof_plan_status = "needs_authoring";
            currentState.supervisor_author_packet = null;
          });
          state = readState(config.statePath);
        }
        const checkpointName = "verify_capture_retry";
        const summary = "Verify ran, but the proof packet still needs internal capture-plan work before it should ship.";
        recordAttempt("verify", "checkpoint", summary, {
          autoApproved: verifyRes.autoApproved || false,
          checkpoint: checkpointName,
          details: verifyDetails,
        });
        return checkpoint(
          "verify",
          checkpointName,
          summary,
          {
            ok: true,
            nextActions: ["inspect_after_capture", "continue_internal_loop_with_checkpoint", "return_to_recon_if_baseline_is_wrong"],
            advanceOptions: ["author", "verify", "implement", "recon"],
            recommendedAdvanceStage: verifyRecommendedStage || "author",
            continueWithStage: verifyContinueWithStage || "author",
            blocking: false,
            details: verifyDetails,
            verifyStatus,
            verifySummary,
            afterCdn: state?.after_cdn || null,
            mergeRecommendation: state?.merge_recommendation || null,
            verifyDecisionRequest,
            proofAssessment: proofAssessment.raw,
            executed,
          },
        );
      }

      if (!hasSupervisorProofAssessment(state)) {
        const summary = "Verify captured usable evidence. The supervising agent should now assess whether the proof supports ship or more internal iteration, then resume the workflow with proof_assessment_json.";
        recordAttempt("verify", "checkpoint", summary, {
          autoApproved: verifyRes.autoApproved || false,
          checkpoint: "verify_supervisor_judgment",
          details: verifyDetails,
        });
        return checkpoint(
          "verify",
          "verify_supervisor_judgment",
          summary,
          {
            nextActions: ["inspect_evidence", "author_proof_assessment_json", "continue_internal_loop_with_checkpoint"],
            advanceOptions: ["verify", "author", "implement", "recon", "ship"],
            recommendedAdvanceStage: "verify",
            continueWithStage: "verify",
            blocking: false,
            details: verifyDetails,
            verifyStatus,
            verifySummary,
            afterCdn: state?.after_cdn || null,
            mergeRecommendation: state?.merge_recommendation || null,
            verifyDecisionRequest,
            proofAssessmentRequest: state?.proof_assessment_request || null,
            executed,
          },
        );
      }

      const shouldEscalate = shouldEscalateVerifyToHuman(state, proofAssessment);
      if (shouldEscalate) {
        const summary = "The supervising agent concluded the workflow hit a real wall and explicitly escalated the proof loop to the human.";
        recordAttempt("verify", "escalated", summary, {
          autoApproved: verifyRes.autoApproved || false,
          checkpoint: "verify_human_escalation",
          details: verifyDetails,
        });
        return checkpoint(
          "verify",
          "verify_human_escalation",
          summary,
          {
            ok: false,
            nextActions: ["inspect_retry_history", "summarize_internal_loop", "ask_human_for_direction"],
            advanceOptions: ["author", "implement", "ship", "verify", "recon"],
            recommendedAdvanceStage: null,
            continueWithStage: null,
            blocking: true,
            details: verifyDetails,
            verifyStatus,
            verifySummary,
            afterCdn: state?.after_cdn || null,
            mergeRecommendation: state?.merge_recommendation || null,
            verifyDecisionRequest,
            proofAssessment: proofAssessment.raw,
            executed,
          },
        );
      }

      const shouldAutoShip =
        verifyContinueWithStage === "ship" &&
        (params.ship_after_verify || params.continue_from_checkpoint || params.advance_stage !== "verify");

      if (shouldAutoShip) {
        const shipGate = validateShipGate(state);
        if (!shipGate.ok) {
          recordAttempt("verify", "checkpoint", "Verify cannot continue into ship because the hard ship gate is missing required evidence or approval.", {
            autoApproved: verifyRes.autoApproved || false,
            checkpoint: "ship_gate_blocked",
            details: { ...verifyDetails, shipGate },
          });
          return shipGateBlocked(state, executed, verifyDetails);
        }
        recordAttempt("verify", "checkpoint", "Verify captured a strong proof packet and is continuing directly into ship.", {
          autoApproved: verifyRes.autoApproved || false,
          checkpoint: "verify_then_ship",
          details: { ...verifyDetails, shipGate },
        });
        const shipRes = runOne("ship");
        executed.push(executedStep(shipRes));
        if (!shipRes.ok || shipRes.haltedForApproval) {
          const shipNextAction = shipRes?.error && String(shipRes.error).includes("temporary proof branch")
            ? "product bug: ship resolved a temporary proof branch; resolve the PR head branch before retrying ship"
            : "inspect the ship error, confirm the PR head branch and verified commit, then retry ship";
          return failedRun("ship", shipRes.haltedForApproval ? "ship halted for approval" : "ship failed", shipRes, {
            checkpoint: "ship_failed",
            details: { executed, next_action: shipNextAction },
            nextAction: shipNextAction,
            executed,
          });
        }
        recordAttempt("ship", "completed", "Ship updated the PR and posted proof artifacts after the supervising agent judged the proof strong enough.", {
          autoApproved: shipRes.autoApproved || false,
          checkpoint: "ship_review",
          details: { executed },
        });
        const snapshot = snapshotFor(config.statePath);
        const summary = "The supervising agent judged the proof strong enough, so the workflow shipped automatically and left the PR as the main human review surface.";
        const finalState = readState(config.statePath);
        const shipReport = finalState?.ship_report || snapshot.state?.ship_report || null;
        return {
          ok: true,
          action,
          state_path: config.statePath,
          stage: snapshot.stage,
          checkpoint: "ship_review",
          summary,
          state: snapshot.state,
          shipReport,
          checkpointContract: buildCheckpointContract(readState(config.statePath), {
            statePath: config.statePath,
            stage: "ship",
            checkpoint: "ship_review",
            summary,
            nextActions: ["inspect_pr", "rerun_ship_if_needed"],
            advanceOptions: ["ship", "verify", "author", "implement"],
            recommendedAdvanceStage: "ship",
          }),
          executed,
        };
      }

      if (proofAssessment.decision === "ready_to_ship") {
        const shipGate = validateShipGate(state);
        if (!shipGate.ok) {
          recordAttempt("verify", "checkpoint", "Verify cannot mark ship ready because the hard ship gate is missing required evidence or approval.", {
            autoApproved: verifyRes.autoApproved || false,
            checkpoint: "ship_gate_blocked",
            details: { ...verifyDetails, shipGate },
          });
          return shipGateBlocked(state, executed, verifyDetails);
        }
        recordAttempt("verify", "checkpoint", "Verify captured a strong proof packet and is ready to continue into ship.", {
          autoApproved: verifyRes.autoApproved || false,
          checkpoint: "verify_ship_ready",
          details: { ...verifyDetails, shipGate },
        });
        return checkpoint(
          "verify",
          "verify_ship_ready",
          "The supervising agent judged the proof strong enough to continue into ship.",
          {
            nextActions: ["inspect_evidence", "continue_internal_loop_with_checkpoint", "advance_run_to_ship_if_you_need_manual_control"],
            advanceOptions: ["ship", "verify", "author", "implement", "recon"],
            recommendedAdvanceStage: "ship",
            continueWithStage: "ship",
            blocking: false,
            details: { ...verifyDetails, shipGate },
            shipGate,
            verifyStatus,
            verifySummary,
            afterCdn: state?.after_cdn || null,
            mergeRecommendation: state?.merge_recommendation || null,
            verifyDecisionRequest,
            proofAssessment: proofAssessment.raw,
            executed,
          },
        );
      }

      if (verifyContinueWithStage === "author") {
        updateState(config.statePath, (currentState) => {
          currentState.author_status = "needs_authoring";
          currentState.proof_plan_status = "needs_authoring";
          currentState.supervisor_author_packet = null;
        });
        state = readState(config.statePath);
      }

      const unresolvedSummary = convergenceSignals.warning
        ? "The supervising agent kept the workflow in the internal loop, but retry history suggests it may not be converging yet. Keep iterating internally or explicitly escalate with escalation_target=human when you conclude it is genuinely stuck."
        : "The supervising agent judged that the workflow should keep iterating internally before it ships.";
      recordAttempt("verify", "checkpoint", unresolvedSummary, {
        autoApproved: verifyRes.autoApproved || false,
        checkpoint: "verify_agent_retry",
        details: verifyDetails,
      });
      return checkpoint(
        "verify",
        "verify_agent_retry",
        unresolvedSummary,
        {
          ok: true,
          nextActions: convergenceSignals.warning
            ? ["inspect_retry_history", "decide_whether_to_keep_iterating_or_escalate", "continue_internal_loop_with_checkpoint"]
            : ["inspect_proof_assessment", "continue_internal_loop_with_checkpoint", "return_to_implement_if_fix_failed"],
          advanceOptions: ["author", "implement", "ship", "verify", "recon"],
          recommendedAdvanceStage: verifyRecommendedStage,
          continueWithStage: verifyContinueWithStage,
          blocking: false,
          details: verifyDetails,
          verifyStatus,
          verifySummary,
          afterCdn: state?.after_cdn || null,
          mergeRecommendation: state?.merge_recommendation || null,
          verifyDecisionRequest,
          proofAssessment: proofAssessment.raw,
          executed,
        },
      );
    }

    if (effectiveAdvanceStage === "ship") {
      state = readState(config.statePath);
      const shipAssessment = verifyAssessment(state);
      const shipGate = validateShipGate(state);
      if (state?.verify_status !== "evidence_captured") {
        return checkpoint(
          "verify",
          "verify_required",
          "Ship is blocked until verify has captured a usable proof packet. Run verify, inspect the evidence, then explicitly advance to ship only if the proof supports success.",
          {
            ok: false,
            nextActions: ["advance_run_to_verify", "inspect_verify_state"],
            advanceOptions: ["verify", "author", "implement", "recon"],
            recommendedAdvanceStage: "verify",
            continueWithStage: "verify",
            blocking: true,
            details: {
              executed,
              shipGate,
              verifyStatus: state?.verify_status || null,
              mergeRecommendation: state?.merge_recommendation || null,
              afterCdn: state?.after_cdn || null,
            },
            shipGate,
            verifyStatus: state?.verify_status || null,
            mergeRecommendation: state?.merge_recommendation || null,
            afterCdn: state?.after_cdn || null,
            executed,
          },
        );
      }
      if (!hasSupervisorProofAssessment(state) || shipAssessment.decision !== "ready_to_ship") {
        return checkpoint(
          "verify",
          "verify_supervisor_judgment_required",
          "Ship is blocked until the supervising agent judges the current proof packet as ready_to_ship.",
          {
            ok: false,
            nextActions: ["inspect_evidence", "supply_proof_assessment_json", "continue_internal_loop_with_checkpoint"],
            advanceOptions: ["verify", "author", "implement", "recon", "ship"],
            recommendedAdvanceStage: "verify",
            continueWithStage: "verify",
            blocking: true,
            details: {
              executed,
              shipGate,
              verifyStatus: state?.verify_status || null,
              mergeRecommendation: state?.merge_recommendation || null,
              afterCdn: state?.after_cdn || null,
              proofAssessment: state?.proof_assessment || null,
              proofAssessmentRequest: state?.proof_assessment_request || null,
            },
            shipGate,
            verifyStatus: state?.verify_status || null,
            mergeRecommendation: state?.merge_recommendation || null,
            afterCdn: state?.after_cdn || null,
            proofAssessment: state?.proof_assessment || null,
            proofAssessmentRequest: state?.proof_assessment_request || null,
            executed,
          },
        );
      }
      if (!shipGate.ok) {
        return shipGateBlocked(state, executed, { shipAssessment: shipAssessment.raw });
      }
      const shipRes = runOne("ship");
      executed.push(executedStep(shipRes));
      if (!shipRes.ok || shipRes.haltedForApproval) {
        return failedRun("ship", shipRes.haltedForApproval ? "ship halted for approval" : "ship failed", shipRes, {
          checkpoint: "ship_failed",
          details: { executed },
          executed,
        });
      }
      recordAttempt("ship", "completed", "Ship updated the PR and posted proof artifacts.", {
        autoApproved: shipRes.autoApproved || false,
        checkpoint: "ship_review",
        details: { executed },
      });
      return checkpoint(
        "ship",
        "ship_review",
        "Ship completed. Review the PR, proof comment, and cleanup results. Re-run ship if you need to refresh the PR after more changes.",
        {
          nextActions: ["inspect_pr", "rerun_ship_if_needed"],
          advanceOptions: ["ship", "verify", "author", "implement"],
          recommendedAdvanceStage: "ship",
          details: {
            executed,
            prUrl: readState(config.statePath)?.pr_url || null,
          },
          prUrl: readState(config.statePath)?.pr_url || null,
          executed,
        },
      );
    }
  }

  if (action === "ship") {
    const state = readState(config.statePath);
    const shipGate = validateShipGate(state);
    if (state?.verify_status !== "evidence_captured") {
      return checkpoint(
        "verify",
        "verify_required",
        "Ship is blocked until verify has captured a usable proof packet. Run verify, inspect the evidence, then ship only if the proof supports success.",
        {
          ok: false,
          nextActions: ["run_verify", "inspect_verify_state"],
          advanceOptions: ["verify", "author", "implement", "recon"],
          recommendedAdvanceStage: "verify",
          continueWithStage: "verify",
          blocking: true,
          details: { shipGate },
          shipGate,
          verifyStatus: state?.verify_status || null,
          mergeRecommendation: state?.merge_recommendation || null,
          afterCdn: state?.after_cdn || null,
        },
      );
    }
    if (!hasSupervisorProofAssessment(state) || verifyAssessment(state).decision !== "ready_to_ship") {
      return checkpoint(
        "verify",
        "verify_supervisor_judgment_required",
        "Ship is blocked until the supervising agent judges the current proof packet as ready_to_ship.",
        {
          ok: false,
          nextActions: ["inspect_evidence", "supply_proof_assessment_json", "rerun_ship"],
          advanceOptions: ["verify", "author", "implement", "recon", "ship"],
          recommendedAdvanceStage: "verify",
          continueWithStage: "verify",
          blocking: true,
          details: { shipGate },
          shipGate,
          verifyStatus: state?.verify_status || null,
          mergeRecommendation: state?.merge_recommendation || null,
          afterCdn: state?.after_cdn || null,
          proofAssessment: state?.proof_assessment || null,
          proofAssessmentRequest: state?.proof_assessment_request || null,
        },
      );
    }
    if (!shipGate.ok) {
      return shipGateBlocked(state, [], {});
    }
  }

  const single = runOne(action as WorkflowStage);
  if (!single.ok || single.haltedForApproval) {
    return failedRun(action as WorkflowStage, single.haltedForApproval ? `${action} halted for approval` : `${action} failed`, single, {
      checkpoint: `${action}_failed`,
    });
  }
  let invalidatedVerifyEvidence = false;
  updateState(config.statePath, (state) => {
    if (action === "implement") {
      invalidatedVerifyEvidence = invalidateVerifyEvidence(state).invalidated;
    }
    clearStageDecisionRequest(state);
  });
  const singleSummary = action === "implement" && invalidatedVerifyEvidence
    ? "implement completed and invalidated prior verify evidence"
    : `${action} completed`;
  recordAttempt(action as WorkflowStage, "completed", singleSummary, {
    autoApproved: (single as any).autoApproved || false,
    details: action === "implement" ? { invalidatedVerifyEvidence } : {},
  });
  const snapshot = snapshotFor(config.statePath);
  return {
    ok: true,
    action,
    state_path: config.statePath,
    stage: snapshot.stage,
    summary: singleSummary,
    state: snapshot.state,
    approval: null,
    autoApproved: (single as any).autoApproved || false,
    error: null,
  };
}

export interface RiddleProofEngine {
  execute(params: WorkflowParams): Promise<Record<string, unknown>>;
  status(statePath?: string): Promise<Record<string, unknown>>;
  resolveConfig(params?: Partial<Pick<WorkflowParams, "action" | "state_path">>): ReturnType<typeof resolveConfig>;
}

export function createRiddleProofEngine(pluginConfig: PluginConfig = {}): RiddleProofEngine {
  return {
    execute(params: WorkflowParams) {
      const config = resolveConfig(pluginConfig, params);
      return executeWorkflow(params, pluginConfig, config);
    },
    status(statePath?: string) {
      const config = resolveConfig(pluginConfig, { action: "status", state_path: statePath });
      return executeWorkflow({ action: "status", state_path: statePath }, pluginConfig, config);
    },
    resolveConfig(params: Partial<Pick<WorkflowParams, "action" | "state_path">> = {}) {
      return resolveConfig(pluginConfig, params);
    },
  };
}
