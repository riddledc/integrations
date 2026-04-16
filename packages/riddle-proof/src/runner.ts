import { createRunResult } from "./result";
import { appendRunEvent, createRunState, setRunStatus } from "./state";
import type {
  ImplementationAdapter,
  ImplementationAdapterResult,
  JudgeAdapter,
  NotificationAdapter,
  ProofAdapter,
  RiddleProofAssessment,
  RiddleProofBlocker,
  RiddleProofEvidenceBundle,
  RiddleProofRunParams,
  RiddleProofRunResult,
  RiddleProofRunState,
  RiddleProofStage,
  RiddleProofTerminalMetadata,
  SetupAdapter,
  ShipAdapter,
} from "./types";

export interface RiddleProofRunnerAdapters {
  setup?: SetupAdapter;
  implementation?: ImplementationAdapter;
  proof?: ProofAdapter;
  judge?: JudgeAdapter;
  ship?: ShipAdapter;
  notification?: NotificationAdapter;
}

export interface RunRiddleProofInput {
  request: RiddleProofRunParams;
  adapters: RiddleProofRunnerAdapters;
  state?: RiddleProofRunState;
  state_path?: string;
  workdir?: string;
  max_iterations?: number;
}

function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return { message: String(error) };
}

function adapterBlocker(
  code: string,
  message: string,
  checkpoint: string,
  details?: Record<string, unknown>,
): RiddleProofBlocker {
  return {
    code,
    message,
    checkpoint,
    details,
  };
}

function blockRun(input: {
  state: RiddleProofRunState;
  blocker: RiddleProofBlocker;
  stage?: RiddleProofStage;
  evidence_bundle?: RiddleProofEvidenceBundle;
  raw?: Record<string, unknown>;
}): RiddleProofRunResult {
  input.state.blocker = input.blocker;
  appendRunEvent(input.state, {
    kind: "run.blocked",
    checkpoint: input.blocker.checkpoint,
    stage: input.stage,
    summary: input.blocker.message,
    details: {
      code: input.blocker.code,
      ...input.blocker.details,
    },
  });
  setRunStatus(input.state, "blocked");
  return createRunResult({
    state: input.state,
    status: "blocked",
    last_summary: input.blocker.message,
    evidence_bundle: input.evidence_bundle,
    raw: input.raw,
  });
}

function shouldIterate(assessment: RiddleProofAssessment): boolean {
  const nextStage = assessment.continue_with_stage || assessment.recommended_stage;
  return nextStage === "implement" || nextStage === "author";
}

async function notifyIfConfigured(input: {
  state: RiddleProofRunState;
  result: RiddleProofRunResult;
  notification?: NotificationAdapter;
}): Promise<RiddleProofRunResult> {
  if (!input.notification) return input.result;

  try {
    const notification = await input.notification.notify({
      state: input.state,
      result: input.result,
    });
    input.state.notification = notification;
    appendRunEvent(input.state, {
      kind: "notification.completed",
      checkpoint: "notification_completed",
      stage: "notify",
      summary: "Integration notification completed.",
    });
  } catch (error) {
    appendRunEvent(input.state, {
      kind: "notification.failed",
      checkpoint: "notification_failed",
      stage: "notify",
      summary: "Integration notification failed.",
      details: errorDetails(error),
    });
  }

  return createRunResult({
    state: input.state,
    status: input.state.status,
    last_summary: input.result.last_summary,
    evidence_bundle: input.result.evidence_bundle,
    raw: input.result.raw,
  });
}

export async function runRiddleProof(input: RunRiddleProofInput): Promise<RiddleProofRunResult> {
  const state = input.state || createRunState({
    request: input.request,
    state_path: input.state_path,
  });
  const adapters = input.adapters || {};
  const maxIterations = Math.max(1, Math.trunc(input.max_iterations ?? 1));

  appendRunEvent(state, {
    kind: "run.started",
    checkpoint: "run_started",
    stage: "setup",
    summary: "Riddle Proof run started.",
    details: {
      max_iterations: maxIterations,
      ship_mode: state.request.ship_mode || "none",
    },
  });

  let workdir = input.workdir;
  let evidenceContext: RiddleProofEvidenceBundle | undefined;

  if (adapters.setup) {
    appendRunEvent(state, {
      kind: "setup.started",
      checkpoint: "setup_started",
      stage: "setup",
      summary: "Riddle Proof setup adapter started.",
    });

    try {
      const setup = await adapters.setup.setup({ request: state.request, state });
      if (!setup.ok) {
        return blockRun({
          state,
          stage: "setup",
          blocker: adapterBlocker(
            "setup_failed",
            "The setup adapter did not complete successfully.",
            "setup_failed",
            { blockers: setup.blockers },
          ),
          raw: { setup },
        });
      }
      workdir = setup.workdir || workdir;
      evidenceContext = setup.evidence_context;
      appendRunEvent(state, {
        kind: "setup.completed",
        checkpoint: "setup_completed",
        stage: "setup",
        summary: "Riddle Proof setup adapter completed.",
        details: {
          has_workdir: Boolean(workdir),
          has_evidence_context: Boolean(evidenceContext),
        },
      });
    } catch (error) {
      return blockRun({
        state,
        stage: "setup",
        blocker: adapterBlocker("setup_exception", "The setup adapter threw an exception.", "setup_failed", errorDetails(error)),
      });
    }
  }

  const changeRequest = state.request.change_request?.trim();
  if (!changeRequest) {
    return blockRun({
      state,
      stage: "setup",
      blocker: adapterBlocker("change_request_required", "A change request is required before implementation.", "request_invalid"),
    });
  }

  if (!workdir) {
    return blockRun({
      state,
      stage: "setup",
      blocker: adapterBlocker("workdir_not_configured", "A workdir or setup adapter result is required before implementation.", "setup_required"),
    });
  }

  if (!adapters.implementation) {
    return blockRun({
      state,
      stage: "implement",
      blocker: adapterBlocker("implementation_adapter_not_configured", "An implementation adapter is required to change code.", "implementation_required"),
    });
  }

  if (!adapters.proof) {
    return blockRun({
      state,
      stage: "prove",
      blocker: adapterBlocker("proof_adapter_not_configured", "A proof adapter is required to capture evidence.", "proof_required"),
    });
  }

  if (!adapters.judge) {
    return blockRun({
      state,
      stage: "verify",
      blocker: adapterBlocker("judge_adapter_not_configured", "A judge adapter is required to assess proof.", "judge_required"),
    });
  }

  let implementation: ImplementationAdapterResult | undefined;
  let evidenceBundle: RiddleProofEvidenceBundle | undefined;
  let assessment: RiddleProofAssessment | undefined;

  for (let attempt = 0; attempt < maxIterations; attempt += 1) {
    state.iterations += 1;
    appendRunEvent(state, {
      kind: "implementation.started",
      checkpoint: "implementation_started",
      stage: "implement",
      summary: "Implementation adapter started.",
      details: { iteration: state.iterations },
    });

    try {
      implementation = await adapters.implementation.implement({
        workdir,
        change_request: changeRequest,
        evidence_context: evidenceContext,
        state,
      });
    } catch (error) {
      return blockRun({
        state,
        stage: "implement",
        blocker: adapterBlocker("implementation_exception", "The implementation adapter threw an exception.", "implementation_failed", errorDetails(error)),
        evidence_bundle: evidenceBundle,
      });
    }

    if (!implementation.ok) {
      return blockRun({
        state,
        stage: "implement",
        blocker: adapterBlocker(
          "implementation_failed",
          "The implementation adapter did not complete successfully.",
          "implementation_failed",
          { blockers: implementation.blockers },
        ),
        evidence_bundle: evidenceBundle,
        raw: { implementation },
      });
    }

    appendRunEvent(state, {
      kind: "implementation.completed",
      checkpoint: "implementation_completed",
      stage: "implement",
      summary: "Implementation adapter completed.",
      details: {
        changed_files: implementation.changed_files,
        tests_run: implementation.tests_run,
      },
    });

    appendRunEvent(state, {
      kind: "proof.started",
      checkpoint: "proof_started",
      stage: "prove",
      summary: "Proof adapter started.",
    });

    try {
      const proof = await adapters.proof.prove({
        state,
        implementation,
        evidence_context: evidenceContext,
      });
      if (!proof.ok || !proof.evidence_bundle) {
        return blockRun({
          state,
          stage: "prove",
          blocker: adapterBlocker(
            "proof_failed",
            "The proof adapter did not produce a usable evidence bundle.",
            "proof_failed",
            { blockers: proof.blockers },
          ),
          raw: { proof },
        });
      }
      evidenceBundle = proof.evidence_bundle;
      appendRunEvent(state, {
        kind: "proof.completed",
        checkpoint: "proof_completed",
        stage: "prove",
        summary: "Proof adapter completed.",
        details: {
          verification_mode: evidenceBundle.verification_mode,
          artifact_count: evidenceBundle.artifacts?.length ?? 0,
        },
      });
    } catch (error) {
      return blockRun({
        state,
        stage: "prove",
        blocker: adapterBlocker("proof_exception", "The proof adapter threw an exception.", "proof_failed", errorDetails(error)),
      });
    }

    appendRunEvent(state, {
      kind: "judge.started",
      checkpoint: "judge_started",
      stage: "verify",
      summary: "Judge adapter started.",
    });

    try {
      assessment = await adapters.judge.assessProof({ state, evidence_bundle: evidenceBundle });
      state.proof_decision = assessment.decision;
      appendRunEvent(state, {
        kind: "judge.completed",
        checkpoint: "judge_completed",
        stage: "verify",
        summary: assessment.summary,
        details: {
          decision: assessment.decision,
          recommended_stage: assessment.recommended_stage,
          continue_with_stage: assessment.continue_with_stage,
          reasons: assessment.reasons,
        },
      });
    } catch (error) {
      return blockRun({
        state,
        stage: "verify",
        blocker: adapterBlocker("judge_exception", "The judge adapter threw an exception.", "judge_failed", errorDetails(error)),
        evidence_bundle: evidenceBundle,
      });
    }

    if (assessment.decision === "ready_to_ship") break;

    if (attempt + 1 < maxIterations && shouldIterate(assessment)) {
      evidenceContext = evidenceBundle;
      appendRunEvent(state, {
        kind: "run.iterating",
        checkpoint: "iteration_requested",
        stage: "implement",
        summary: "Judge requested another implementation iteration.",
        details: {
          decision: assessment.decision,
          next_iteration: state.iterations + 1,
        },
      });
      continue;
    }

    return blockRun({
      state,
      stage: "verify",
      blocker: adapterBlocker(
        "proof_not_ready",
        assessment.summary || "Proof is not ready to ship.",
        "judge_completed",
        {
          decision: assessment.decision,
          recommended_stage: assessment.recommended_stage,
          continue_with_stage: assessment.continue_with_stage,
          reasons: assessment.reasons,
        },
      ),
      evidence_bundle: evidenceBundle,
      raw: { assessment },
    });
  }

  if (!assessment || !evidenceBundle) {
    return blockRun({
      state,
      stage: "verify",
      blocker: adapterBlocker("runner_incomplete", "The runner ended without proof assessment.", "runner_incomplete"),
    });
  }

  if (state.request.ship_mode !== "ship") {
    setRunStatus(state, "ready_to_ship");
    const result = createRunResult({
      state,
      status: "ready_to_ship",
      last_summary: assessment.summary,
      evidence_bundle: evidenceBundle,
      raw: { implementation, assessment },
    });
    return notifyIfConfigured({ state, result, notification: adapters.notification });
  }

  if (!adapters.ship) {
    return blockRun({
      state,
      stage: "ship",
      blocker: adapterBlocker("ship_adapter_not_configured", "A ship adapter is required when ship_mode is ship.", "ship_required"),
      evidence_bundle: evidenceBundle,
      raw: { implementation, assessment },
    });
  }

  appendRunEvent(state, {
    kind: "ship.started",
    checkpoint: "ship_started",
    stage: "ship",
    summary: "Ship adapter started.",
  });

  let metadata: RiddleProofTerminalMetadata;
  try {
    metadata = await adapters.ship.ship({ state, assessment });
  } catch (error) {
    return blockRun({
      state,
      stage: "ship",
      blocker: adapterBlocker("ship_exception", "The ship adapter threw an exception.", "ship_failed", errorDetails(error)),
      evidence_bundle: evidenceBundle,
      raw: { implementation, assessment },
    });
  }

  appendRunEvent(state, {
    kind: "ship.completed",
    checkpoint: "ship_completed",
    stage: "ship",
    summary: "Ship adapter completed.",
    details: {
      pr_url: metadata.pr_url,
      marked_ready: metadata.marked_ready,
      finalized: metadata.finalized,
    },
  });
  setRunStatus(state, "shipped");

  const result = createRunResult({
    state,
    status: "shipped",
    last_summary: "Riddle Proof shipped.",
    metadata,
    evidence_bundle: evidenceBundle,
    raw: { implementation, assessment },
  });
  return notifyIfConfigured({ state, result, notification: adapters.notification });
}
