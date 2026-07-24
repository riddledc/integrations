import {
  type FixedWebChangeContractIdentity,
  type ProjectCandidateResolver,
  createProjectCandidateResolver,
} from "./project-candidate-resolver.js";
import {
  type RepairMeaningFinding,
  createDeterministicDurableSettingRepairExecutor,
  durableSettingRepairSupportsFindings,
} from "./repair-executor.js";
import {
  type ImmutableLoopbackPreviewCandidate,
  ImmutableLoopbackSpecimenFactory,
  type LoopbackProofTargetAccess,
  pageOnlySpecimenSourceBytes,
  sourceDigest,
} from "./specimen.js";

export const FIXED_DURABLE_SETTING_CONTRACT:
Readonly<FixedWebChangeContractIdentity> = Object.freeze({
  id: "riddle-proof.web-change.durable-text-transition",
  version: "1",
  digest:
    "sha256:27fe6fb61925fbe9ee9f3d2104131ca79976beefc83ce824c71eacf9fe1f9d24",
  protocol_version: "riddle-proof.browser-transition-protocol.v3",
  transition_id: "browser-transition-marker-7c83",
});

export const DURABLE_SETTING_TASK = Object.freeze({
  title: "Make the saved setting durable",
  description:
    "Replace page-only Save behavior so the value remains after reload and in a fresh browser context.",
  requirements: Object.freeze([
    "The requested browser change appears immediately",
    "The changed state survives reload",
    "The changed state appears in a fresh browser context",
  ]),
});

export type ApplicationDisposition =
  | "conforms"
  | "does_not_conform"
  | "stale"
  | "could_not_check";

export interface ProofClientOutcomeView {
  level: "outcome";
  check_ref: string;
  candidate_ref: string;
  disposition: ApplicationDisposition;
  current: boolean;
  headline: string;
  next_action: string;
}

export interface ProofClientMeaningView
  extends Omit<ProofClientOutcomeView, "level"> {
  level: "meaning";
  findings: readonly RepairMeaningFinding[];
  non_conclusions: readonly string[];
}

/**
 * Structural seam implemented by createProofGuidedWebChangeClient from the
 * private proof-guided-web-change experiment. The application does not
 * reproduce its report provider, replay, projection, or cryptography.
 */
export interface ProofGuidedWebChangeClient {
  readonly contract: FixedWebChangeContractIdentity;
  check(input: {
    candidate_ref: string;
  }): Promise<ProofClientOutcomeView>;
  inspect(
    checkRef: string,
    level?: "outcome" | "meaning" | "audit",
  ): unknown;
}

export interface ProofGuidedWebChangeClientFactory {
  (input: {
    candidate_resolver: Pick<ProjectCandidateResolver, "resolve">;
    proof_transport_for(input: {
      candidate_ref: string;
      target: string;
    }): Promise<LoopbackProofTargetAccess>;
  }): ProofGuidedWebChangeClient;
}

export interface ApplicationFinding {
  requirement_id: string;
  label: string;
  explanation: string;
  repair_guidance?: string;
}

export interface ApplicationCurrentCheck {
  check_ref: string;
  candidate_ref: string;
  disposition: ApplicationDisposition;
  current: boolean;
  headline: string;
  next_action: string;
  findings: readonly ApplicationFinding[];
  non_conclusions: readonly string[];
}

export interface ApplicationCheckHistoryEntry {
  check_ref: string;
  candidate_ref: string;
  revision: string;
  attempt: string;
  disposition: ApplicationDisposition;
  current: boolean;
  headline: string;
  checked_at: string;
}

export interface ApplicationRepairRecord {
  repair_ref: string;
  from_candidate_ref: string;
  to_candidate_ref: string;
  summary: string;
}

export interface ApplicationFreshAttemptRecord {
  attempt_ref: string;
  from_candidate_ref: string;
  to_candidate_ref: string;
  revision: string;
  attempt: string;
  summary: string;
}

export interface ApplicationActivity {
  kind: "repair" | "fresh_attempt";
  summary: string;
  revision: string;
  attempt: string;
}

export interface DurableSettingApplicationSnapshot {
  task: {
    title: string;
    description: string;
    requirements: readonly string[];
  };
  candidate: {
    candidate_ref: string;
    label: string;
    revision: string;
    attempt: string;
    preview_url: string;
  };
  current_check: ApplicationCurrentCheck | null;
  repair: {
    available: boolean;
    label: string;
    reason: string;
    last: ApplicationRepairRecord | null;
  };
  retry: {
    available: boolean;
    label: string;
    reason: string;
    last: ApplicationFreshAttemptRecord | null;
  };
  last_activity: ApplicationActivity | null;
  history: readonly ApplicationCheckHistoryEntry[];
  can_check: boolean;
  can_repair: boolean;
  can_retry: boolean;
}

export interface DurableSettingRepairApplication {
  snapshot(): DurableSettingApplicationSnapshot;
  checkCurrent(): Promise<ApplicationCurrentCheck>;
  applyRepair(): Promise<ApplicationRepairRecord>;
  prepareFreshAttempt(): Promise<ApplicationFreshAttemptRecord>;
  audit(checkRef: string): unknown;
  close(): Promise<void>;
}

export interface CreateDurableSettingRepairApplicationInput {
  client_factory: ProofGuidedWebChangeClientFactory;
  now?: () => string;
}

interface CurrentCandidateState {
  candidate: ImmutableLoopbackPreviewCandidate;
  consumed: boolean;
  revision_number: number;
  attempt_number: number;
}

const DISPOSITIONS = new Set<ApplicationDisposition>([
  "conforms",
  "does_not_conform",
  "stale",
  "could_not_check",
]);

function nonempty(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${context} must be a non-empty string.`);
  }
  return value;
}

function assertClientContract(
  actual: FixedWebChangeContractIdentity,
): void {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    throw new TypeError(
      "The proof-guided client must expose its installed contract.",
    );
  }
  for (const field of [
    "id",
    "version",
    "digest",
    "protocol_version",
    "transition_id",
  ] as const) {
    if (actual[field] !== FIXED_DURABLE_SETTING_CONTRACT[field]) {
      throw new Error(
        `The application refuses a changed proof contract at ${field}.`,
      );
    }
  }
}

function assertOutcome(
  value: unknown,
  candidateRef: string,
): asserts value is ProofClientOutcomeView {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("The proof client returned an invalid outcome.");
  }
  const candidate = value as Partial<ProofClientOutcomeView>;
  if (
    candidate.level !== "outcome"
    || candidate.candidate_ref !== candidateRef
    || typeof candidate.check_ref !== "string"
    || candidate.check_ref.trim().length === 0
    || !DISPOSITIONS.has(candidate.disposition as ApplicationDisposition)
    || typeof candidate.current !== "boolean"
    || typeof candidate.headline !== "string"
    || candidate.headline.trim().length === 0
    || typeof candidate.next_action !== "string"
    || candidate.next_action.trim().length === 0
  ) {
    throw new TypeError("The proof client returned an invalid outcome.");
  }
}

function assertMeaning(
  value: unknown,
  outcome: ProofClientOutcomeView,
): asserts value is ProofClientMeaningView {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("The proof client returned an invalid meaning view.");
  }
  const meaning = value as Partial<ProofClientMeaningView>;
  if (
    meaning.level !== "meaning"
    || meaning.check_ref !== outcome.check_ref
    || meaning.candidate_ref !== outcome.candidate_ref
    || meaning.disposition !== outcome.disposition
    || meaning.current !== outcome.current
    || !Array.isArray(meaning.findings)
    || !Array.isArray(meaning.non_conclusions)
  ) {
    throw new TypeError("The proof client returned an invalid meaning view.");
  }
  for (const [index, finding] of meaning.findings.entries()) {
    if (
      !finding
      || typeof finding !== "object"
      || Array.isArray(finding)
      || typeof finding.requirement_id !== "string"
      || finding.requirement_id.trim().length === 0
      || typeof finding.label !== "string"
      || finding.label.trim().length === 0
      || typeof finding.explanation !== "string"
      || finding.explanation.trim().length === 0
      || (
        finding.repair_guidance !== undefined
        && (
          typeof finding.repair_guidance !== "string"
          || finding.repair_guidance.trim().length === 0
        )
      )
    ) {
      throw new TypeError(
        `The proof client returned an invalid finding at index ${index}.`,
      );
    }
  }
  for (const [index, boundary] of meaning.non_conclusions.entries()) {
    if (typeof boundary !== "string" || boundary.trim().length === 0) {
      throw new TypeError(
        `The proof client returned an invalid non-conclusion at index ${index}.`,
      );
    }
  }
}

function cloneFinding(
  finding: RepairMeaningFinding,
): ApplicationFinding {
  return {
    requirement_id: finding.requirement_id,
    label: finding.label,
    explanation: finding.explanation,
    ...(finding.repair_guidance === undefined
      ? {}
      : { repair_guidance: finding.repair_guidance }),
  };
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function checkedAt(now: () => string): string {
  const timestamp = nonempty(now(), "checked_at");
  let normalized: string;
  try {
    normalized = new Date(timestamp).toISOString();
  } catch {
    throw new TypeError("checked_at must be a valid ISO timestamp.");
  }
  if (normalized !== timestamp) {
    throw new TypeError("checked_at must be a normalized ISO timestamp.");
  }
  return timestamp;
}

function displayRevision(state: CurrentCandidateState): string {
  return `Revision ${state.revision_number}`;
}

function displayAttempt(state: CurrentCandidateState): string {
  return `Attempt ${state.attempt_number}`;
}

function publicCheck(
  outcome: ProofClientOutcomeView,
  meaning: ProofClientMeaningView,
): ApplicationCurrentCheck {
  return {
    check_ref: outcome.check_ref,
    candidate_ref: outcome.candidate_ref,
    disposition: outcome.disposition,
    current: outcome.current,
    headline: outcome.headline,
    next_action: outcome.next_action,
    findings: meaning.findings.map(cloneFinding),
    non_conclusions: [...meaning.non_conclusions],
  };
}

/**
 * Creates the owned durable-setting application.
 *
 * client_factory is the only integration point with the proof experiment.
 * Its closure installs the existing fixed contract and report provider. This
 * controller supplies only its resolver and later sends only candidate_ref to
 * check(). Audit material is available solely through the explicit audit()
 * method and is never an input to the repair executor.
 */
export async function createDurableSettingRepairApplication(
  input: CreateDurableSettingRepairApplicationInput,
): Promise<DurableSettingRepairApplication> {
  if (!input || typeof input !== "object") {
    throw new TypeError("Application configuration must be an object.");
  }
  const inputKeys = Object.keys(input);
  if (
    !Object.hasOwn(input, "client_factory")
    || inputKeys.some(
      (key) => key !== "client_factory" && key !== "now",
    )
  ) {
    throw new TypeError(
      "Application configuration accepts only client_factory and optional now.",
    );
  }
  if (typeof input.client_factory !== "function") {
    throw new TypeError("client_factory must be a function.");
  }
  const repairExecutor =
    createDeterministicDurableSettingRepairExecutor();
  const now = input.now ?? (() => new Date().toISOString());
  if (typeof now !== "function") {
    throw new TypeError("now must be a function.");
  }

  const specimenFactory = new ImmutableLoopbackSpecimenFactory();
  const resolver = createProjectCandidateResolver({
    expected_contract: FIXED_DURABLE_SETTING_CONTRACT,
  });
  const initialCandidate = await specimenFactory.create({
    label: "Page-only candidate",
    source_bytes: pageOnlySpecimenSourceBytes(),
  });
  resolver.register(initialCandidate);

  let client: ProofGuidedWebChangeClient;
  try {
    client = input.client_factory({
      candidate_resolver: Object.freeze({
        resolve: resolver.resolve.bind(resolver),
      }),
      proof_transport_for:
        resolver.proofTransportFor.bind(resolver),
    });
    if (
      !client
      || typeof client !== "object"
      || typeof client.check !== "function"
      || typeof client.inspect !== "function"
    ) {
      throw new TypeError(
        "client_factory must return a proof-guided web-change client.",
      );
    }
    assertClientContract(client.contract);
  } catch (error) {
    await specimenFactory.closeAll();
    throw error;
  }

  let current: CurrentCandidateState = {
    candidate: initialCandidate,
    consumed: false,
    revision_number: 1,
    attempt_number: 1,
  };
  let currentCheck: ApplicationCurrentCheck | null = null;
  let lastRepair: ApplicationRepairRecord | null = null;
  let lastFreshAttempt: ApplicationFreshAttemptRecord | null = null;
  let lastActivity: ApplicationActivity | null = null;
  const history: ApplicationCheckHistoryEntry[] = [];
  const ownedCheckRefs = new Set<string>();
  let repairOrdinal = 0;
  let freshAttemptOrdinal = 0;
  let attemptOrdinal = 1;
  let checking = false;
  let repairing = false;
  let retrying = false;
  let closed = false;

  function assertOpen(): void {
    if (closed) throw new Error("The application is closed.");
  }

  function canCheck(): boolean {
    return (
      !closed
      && !checking
      && !repairing
      && !retrying
      && !current.consumed
    );
  }

  function repairAvailability(): {
    available: boolean;
    reason: string;
  } {
    if (closed) {
      return {
        available: false,
        reason: "The application is closed.",
      };
    }
    if (checking || repairing || retrying) {
      return {
        available: false,
        reason: "Another application operation is running.",
      };
    }
    if (!current.consumed || currentCheck === null) {
      return {
        available: false,
        reason: "Check the current candidate before applying a repair.",
      };
    }
    if (
      currentCheck.disposition === "does_not_conform"
      && durableSettingRepairSupportsFindings(currentCheck.findings)
    ) {
      return {
        available: true,
        reason:
          "The current check found persistence problems this repair can address.",
      };
    }
    if (currentCheck.disposition === "does_not_conform") {
      return {
        available: false,
        reason:
          "The current failures are outside the owned persistence repair.",
      };
    }
    if (currentCheck.disposition === "conforms") {
      return {
        available: false,
        reason: "The current candidate already conforms.",
      };
    }
    return {
      available: false,
      reason:
        "An unresolved or stale check does not authorize a source repair.",
    };
  }

  function retryAvailability(): {
    available: boolean;
    reason: string;
  } {
    if (closed) {
      return {
        available: false,
        reason: "The application is closed.",
      };
    }
    if (checking || repairing || retrying) {
      return {
        available: false,
        reason: "Another application operation is running.",
      };
    }
    if (!current.consumed) {
      return {
        available: false,
        reason: "The current attempt has not been checked.",
      };
    }
    if (currentCheck === null) {
      return {
        available: true,
        reason:
          "The previous check did not complete. Prepare a fresh attempt from the unchanged source.",
      };
    }
    if (
      currentCheck.disposition === "stale"
      || currentCheck.disposition === "could_not_check"
    ) {
      return {
        available: true,
        reason:
          "This result cannot be reused. Prepare a fresh attempt from the unchanged source.",
      };
    }
    return {
      available: false,
      reason:
        "A fresh attempt is available only after an incomplete or unusable check.",
    };
  }

  function snapshot(): DurableSettingApplicationSnapshot {
    const availability = repairAvailability();
    const retry = retryAvailability();
    return cloneJson({
      task: DURABLE_SETTING_TASK,
      candidate: {
        candidate_ref: current.candidate.candidate_ref,
        label: current.candidate.label,
        revision: displayRevision(current),
        attempt: displayAttempt(current),
        preview_url: current.candidate.preview_url,
      },
      current_check: currentCheck,
      repair: {
        available: availability.available,
        label: "Apply server-backed persistence repair",
        reason: availability.reason,
        last: lastRepair,
      },
      retry: {
        available: retry.available,
        label: "Prepare fresh attempt",
        reason: retry.reason,
        last: lastFreshAttempt,
      },
      last_activity: lastActivity,
      history,
      can_check: canCheck(),
      can_repair: availability.available,
      can_retry: retry.available,
    });
  }

  return Object.freeze({
    snapshot,
    async checkCurrent(): Promise<ApplicationCurrentCheck> {
      assertOpen();
      if (!canCheck()) {
        throw new Error(
          "The current candidate is one-shot and cannot be checked again.",
        );
      }
      checking = true;
      current.consumed = true;
      const checkedCandidate = current.candidate;
      try {
        const outcome = await client.check({
          candidate_ref: checkedCandidate.candidate_ref,
        });
        assertOutcome(outcome, checkedCandidate.candidate_ref);
        if (ownedCheckRefs.has(outcome.check_ref)) {
          throw new Error(
            `The proof client reused check reference ${outcome.check_ref}.`,
          );
        }
        const unsafeMeaning = client.inspect(
          outcome.check_ref,
          "meaning",
        );
        assertMeaning(unsafeMeaning, outcome);
        const meaning = unsafeMeaning;
        const checkedAtValue = checkedAt(now);
        const completed = publicCheck(outcome, meaning);
        currentCheck = completed;
        ownedCheckRefs.add(completed.check_ref);
        history.push({
          check_ref: completed.check_ref,
          candidate_ref: completed.candidate_ref,
          revision: displayRevision(current),
          attempt: displayAttempt(current),
          disposition: completed.disposition,
          current: completed.current,
          headline: completed.headline,
          checked_at: checkedAtValue,
        });
        return cloneJson(completed);
      } finally {
        checking = false;
      }
    },
    async applyRepair(): Promise<ApplicationRepairRecord> {
      assertOpen();
      const availability = repairAvailability();
      if (!availability.available || currentCheck === null) {
        throw new Error(availability.reason);
      }
      repairing = true;
      const baseCandidate = current.candidate;
      const baseSourceDigest = baseCandidate.source_digest;
      try {
        const repairOutput = await repairExecutor.repair({
          source_bytes: baseCandidate.readSourceBytes(),
          task: {
            title: DURABLE_SETTING_TASK.title,
            description: DURABLE_SETTING_TASK.description,
            requirements: [...DURABLE_SETTING_TASK.requirements],
          },
          findings: currentCheck.findings.map(cloneFinding),
        });
        if (
          !repairOutput
          || typeof repairOutput !== "object"
          || !(repairOutput.source_bytes instanceof Uint8Array)
          || typeof repairOutput.summary !== "string"
          || repairOutput.summary.trim().length === 0
          || repairOutput.changed_surface !== "server.mjs"
        ) {
          throw new TypeError(
            "The repair executor returned an invalid repair result.",
          );
        }
        if (
          sourceDigest(repairOutput.source_bytes)
          === baseSourceDigest
        ) {
          throw new Error(
            "The repair must produce a distinct source identity.",
          );
        }
        const repairedCandidate = await specimenFactory.create({
          label: "Server-backed repair",
          source_bytes: repairOutput.source_bytes,
        });
        if (
          repairedCandidate.candidate_ref === baseCandidate.candidate_ref
          || repairedCandidate.revision === baseCandidate.revision
          || repairedCandidate.preview_url === baseCandidate.preview_url
        ) {
          await repairedCandidate.close();
          throw new Error(
            "The repair must produce a distinct candidate, revision, and preview.",
          );
        }
        resolver.register(repairedCandidate);
        repairOrdinal += 1;
        const repairRecord: ApplicationRepairRecord = {
          repair_ref: `repair_${repairOrdinal}`,
          from_candidate_ref: baseCandidate.candidate_ref,
          to_candidate_ref: repairedCandidate.candidate_ref,
          summary: repairOutput.summary,
        };
        lastRepair = repairRecord;
        current = {
          candidate: repairedCandidate,
          consumed: false,
          revision_number: current.revision_number + 1,
          attempt_number: attemptOrdinal + 1,
        };
        attemptOrdinal += 1;
        lastActivity = {
          kind: "repair",
          summary: repairRecord.summary,
          revision: displayRevision(current),
          attempt: displayAttempt(current),
        };
        currentCheck = null;
        return cloneJson(repairRecord);
      } finally {
        repairing = false;
      }
    },
    async prepareFreshAttempt(): Promise<ApplicationFreshAttemptRecord> {
      assertOpen();
      const availability = retryAvailability();
      if (!availability.available) {
        throw new Error(availability.reason);
      }
      retrying = true;
      const base = current;
      try {
        const freshCandidate = await specimenFactory.create({
          label: base.candidate.label,
          source_bytes: base.candidate.readSourceBytes(),
        });
        if (
          freshCandidate.candidate_ref === base.candidate.candidate_ref
          || freshCandidate.revision !== base.candidate.revision
          || freshCandidate.preview_url === base.candidate.preview_url
        ) {
          await freshCandidate.close();
          throw new Error(
            "A fresh attempt must retain the source revision while using a distinct candidate and preview.",
          );
        }
        resolver.register(freshCandidate);
        freshAttemptOrdinal += 1;
        attemptOrdinal += 1;
        const freshState: CurrentCandidateState = {
          candidate: freshCandidate,
          consumed: false,
          revision_number: base.revision_number,
          attempt_number: attemptOrdinal,
        };
        const record: ApplicationFreshAttemptRecord = {
          attempt_ref: `fresh_attempt_${freshAttemptOrdinal}`,
          from_candidate_ref: base.candidate.candidate_ref,
          to_candidate_ref: freshCandidate.candidate_ref,
          revision: displayRevision(freshState),
          attempt: displayAttempt(freshState),
          summary:
            "Prepared a fresh proof attempt from the unchanged source.",
        };
        current = freshState;
        currentCheck = null;
        lastFreshAttempt = record;
        lastActivity = {
          kind: "fresh_attempt",
          summary: record.summary,
          revision: record.revision,
          attempt: record.attempt,
        };
        return cloneJson(record);
      } finally {
        retrying = false;
      }
    },
    audit(checkRef: string): unknown {
      assertOpen();
      const checkedRef = nonempty(checkRef, "check_ref");
      if (!ownedCheckRefs.has(checkedRef)) {
        throw new Error(
          `No application check exists for ${checkedRef}.`,
        );
      }
      return cloneJson(client.inspect(checkedRef, "audit"));
    },
    async close(): Promise<void> {
      if (closed) return;
      if (checking || repairing || retrying) {
        throw new Error(
          "The application cannot close during an active operation.",
        );
      }
      closed = true;
      await specimenFactory.closeAll();
    },
  });
}
