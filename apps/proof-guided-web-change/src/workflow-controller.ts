export type ProofGuidedChangeDisposition =
  | "conforms"
  | "does_not_conform"
  | "stale"
  | "could_not_check";

export interface ProofGuidedChangeTaskDisplay {
  title: string;
  description: string;
  requirements: readonly string[];
}

export interface ProofGuidedChangeFinding {
  requirement_id: string;
  label: string;
  explanation: string;
  repair_guidance?: string;
}

export interface ProofGuidedChangeOutcomeView {
  level: "outcome";
  check_ref: string;
  candidate_ref: string;
  disposition: ProofGuidedChangeDisposition;
  current: boolean;
  headline: string;
  next_action: string;
}

export interface ProofGuidedChangeMeaningView
  extends Omit<ProofGuidedChangeOutcomeView, "level"> {
  level: "meaning";
  findings: readonly ProofGuidedChangeFinding[];
  non_conclusions: readonly string[];
}

/**
 * The minimum candidate surface owned by the workflow controller.
 *
 * Target resolution, proof transport, process ownership, and any
 * workflow-specific candidate fields remain outside this seam.
 */
export interface ProofGuidedChangeCandidate {
  candidate_ref: string;
  label: string;
  source_digest: string;
  revision: string;
  preview_url: string;
  readSourceBytes(): Uint8Array;
  close?(): Promise<void>;
}

export interface ProofGuidedChangeCandidateFactory<
  Candidate extends ProofGuidedChangeCandidate =
    ProofGuidedChangeCandidate,
> {
  create(input: {
    label: string;
    source_bytes: Uint8Array;
  }): Promise<Candidate>;
  closeAll(): Promise<void>;
}

export interface ProofGuidedChangeProofClient {
  check(input: {
    candidate_ref: string;
  }): Promise<ProofGuidedChangeOutcomeView>;
  inspect(
    checkRef: string,
    level?: "outcome" | "meaning" | "audit",
  ): unknown;
}

export interface ProofGuidedChangeAvailability {
  available: boolean;
  reason: string;
}

export interface ProofGuidedChangePolicyResult {
  source_bytes: Uint8Array;
  candidate_label: string;
  summary: string;
}

/**
 * A workflow-specific source-change capability.
 *
 * The policy receives only the immutable source snapshot, task display, and
 * checked findings. Audit material is deliberately absent from this
 * interface.
 */
export interface ProofGuidedChangePolicy {
  label: string;
  availability(
    check: ProofGuidedChangeCurrentCheck,
  ): ProofGuidedChangeAvailability;
  apply(input: {
    source_bytes: Uint8Array;
    task: ProofGuidedChangeTaskDisplay;
    findings: readonly ProofGuidedChangeFinding[];
  }):
    | Promise<ProofGuidedChangePolicyResult>
    | ProofGuidedChangePolicyResult;
}

export interface ProofGuidedChangeCurrentCheck {
  check_ref: string;
  candidate_ref: string;
  disposition: ProofGuidedChangeDisposition;
  current: boolean;
  headline: string;
  next_action: string;
  findings: readonly ProofGuidedChangeFinding[];
  non_conclusions: readonly string[];
}

export interface ProofGuidedChangeCheckHistoryEntry {
  check_ref: string;
  candidate_ref: string;
  revision: string;
  attempt: string;
  disposition: ProofGuidedChangeDisposition;
  current: boolean;
  headline: string;
  checked_at: string;
}

export interface ProofGuidedChangeRepairRecord {
  repair_ref: string;
  from_candidate_ref: string;
  to_candidate_ref: string;
  summary: string;
}

export interface ProofGuidedChangeFreshAttemptRecord {
  attempt_ref: string;
  from_candidate_ref: string;
  to_candidate_ref: string;
  revision: string;
  attempt: string;
  summary: string;
}

export interface ProofGuidedChangeActivity {
  kind: "repair" | "fresh_attempt";
  summary: string;
  revision: string;
  attempt: string;
}

export interface ProofGuidedChangeWorkflowSnapshot {
  task: ProofGuidedChangeTaskDisplay;
  candidate: {
    candidate_ref: string;
    label: string;
    revision: string;
    attempt: string;
    preview_url: string;
  };
  current_check: ProofGuidedChangeCurrentCheck | null;
  repair: {
    available: boolean;
    label: string;
    reason: string;
    last: ProofGuidedChangeRepairRecord | null;
  };
  retry: {
    available: boolean;
    label: string;
    reason: string;
    last: ProofGuidedChangeFreshAttemptRecord | null;
  };
  last_activity: ProofGuidedChangeActivity | null;
  history: readonly ProofGuidedChangeCheckHistoryEntry[];
  can_check: boolean;
  can_repair: boolean;
  can_retry: boolean;
}

export interface ProofGuidedChangeWorkflowController {
  snapshot(): ProofGuidedChangeWorkflowSnapshot;
  checkCurrent(): Promise<ProofGuidedChangeCurrentCheck>;
  applyRepair(): Promise<ProofGuidedChangeRepairRecord>;
  prepareFreshAttempt(): Promise<ProofGuidedChangeFreshAttemptRecord>;
  audit(checkRef: string): unknown;
  close(): Promise<void>;
}

export interface CreateProofGuidedChangeWorkflowControllerInput<
  Candidate extends ProofGuidedChangeCandidate =
    ProofGuidedChangeCandidate,
> {
  task: ProofGuidedChangeTaskDisplay;
  initial_candidate: Candidate;
  candidate_factory: ProofGuidedChangeCandidateFactory<Candidate>;
  register_candidate(candidate: Candidate): void;
  proof_client: ProofGuidedChangeProofClient;
  change_policy: ProofGuidedChangePolicy;
  now?: () => string;
}

interface CurrentCandidateState<
  Candidate extends ProofGuidedChangeCandidate,
> {
  candidate: Candidate;
  consumed: boolean;
  revision_number: number;
  attempt_number: number;
}

const DISPOSITIONS = new Set<ProofGuidedChangeDisposition>([
  "conforms",
  "does_not_conform",
  "stale",
  "could_not_check",
]);

const CONFIGURATION_KEYS = new Set([
  "task",
  "initial_candidate",
  "candidate_factory",
  "register_candidate",
  "proof_client",
  "change_policy",
  "now",
]);

const REQUIRED_CONFIGURATION_KEYS = [
  "task",
  "initial_candidate",
  "candidate_factory",
  "register_candidate",
  "proof_client",
  "change_policy",
] as const;

function nonempty(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${context} must be a non-empty string.`);
  }
  return value;
}

function exactOwnKeys(
  value: object,
  expected: readonly string[],
  context: string,
): void {
  const actual = Reflect.ownKeys(value);
  if (
    actual.some((key) => typeof key !== "string")
    || actual.length !== expected.length
    || expected.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new TypeError(
      `${context} accepts exactly ${expected.join(", ")}.`,
    );
  }
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function cloneBytes(value: Uint8Array): Uint8Array {
  return new Uint8Array(value);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function normalizeTask(
  unsafeTask: ProofGuidedChangeTaskDisplay,
): ProofGuidedChangeTaskDisplay {
  if (
    !unsafeTask
    || typeof unsafeTask !== "object"
    || Array.isArray(unsafeTask)
  ) {
    throw new TypeError("task must be an object.");
  }
  exactOwnKeys(
    unsafeTask,
    ["title", "description", "requirements"],
    "task",
  );
  const title = nonempty(unsafeTask.title, "task.title");
  const description = nonempty(
    unsafeTask.description,
    "task.description",
  );
  if (
    !Array.isArray(unsafeTask.requirements)
    || unsafeTask.requirements.length === 0
  ) {
    throw new TypeError(
      "task.requirements must be a non-empty array.",
    );
  }
  const requirements = unsafeTask.requirements.map(
    (requirement, index) =>
      nonempty(requirement, `task.requirements[${index}]`),
  );
  return Object.freeze({
    title,
    description,
    requirements: Object.freeze(requirements),
  });
}

function assertCandidate(
  value: unknown,
  context: string,
): asserts value is ProofGuidedChangeCandidate {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${context} must be a candidate object.`);
  }
  const candidate = value as Partial<ProofGuidedChangeCandidate>;
  nonempty(candidate.candidate_ref, `${context}.candidate_ref`);
  nonempty(candidate.label, `${context}.label`);
  nonempty(candidate.source_digest, `${context}.source_digest`);
  nonempty(candidate.revision, `${context}.revision`);
  nonempty(candidate.preview_url, `${context}.preview_url`);
  if (typeof candidate.readSourceBytes !== "function") {
    throw new TypeError(
      `${context}.readSourceBytes must be a function.`,
    );
  }
  if (
    candidate.close !== undefined
    && typeof candidate.close !== "function"
  ) {
    throw new TypeError(
      `${context}.close must be a function when present.`,
    );
  }
}

async function closeRejectedCandidate(value: unknown): Promise<void> {
  if (
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && typeof (value as { close?: unknown }).close === "function"
  ) {
    try {
      await (value as { close(): Promise<void> }).close();
    } catch {
      // Preserve the validation or registration failure that rejected it.
    }
  }
}

function readCandidateSource(
  candidate: ProofGuidedChangeCandidate,
): Uint8Array {
  const bytes = candidate.readSourceBytes();
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError(
      "candidate.readSourceBytes must return a Uint8Array.",
    );
  }
  return cloneBytes(bytes);
}

function assertOutcome(
  value: unknown,
  candidateRef: string,
): asserts value is ProofGuidedChangeOutcomeView {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("The proof client returned an invalid outcome.");
  }
  const candidate = value as Partial<ProofGuidedChangeOutcomeView>;
  const disposition =
    candidate.disposition as ProofGuidedChangeDisposition;
  if (
    candidate.level !== "outcome"
    || candidate.candidate_ref !== candidateRef
    || typeof candidate.check_ref !== "string"
    || candidate.check_ref.trim().length === 0
    || !DISPOSITIONS.has(disposition)
    || typeof candidate.current !== "boolean"
    || (
      (disposition === "conforms"
        || disposition === "does_not_conform")
      && candidate.current !== true
    )
    || (
      (disposition === "stale"
        || disposition === "could_not_check")
      && candidate.current !== false
    )
    || typeof candidate.headline !== "string"
    || candidate.headline.trim().length === 0
    || typeof candidate.next_action !== "string"
    || candidate.next_action.trim().length === 0
  ) {
    throw new TypeError("The proof client returned an invalid outcome.");
  }
}

function assertFinding(
  value: unknown,
  context: string,
): asserts value is ProofGuidedChangeFinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${context} must be a finding object.`);
  }
  const finding = value as Partial<ProofGuidedChangeFinding>;
  nonempty(finding.requirement_id, `${context}.requirement_id`);
  nonempty(finding.label, `${context}.label`);
  nonempty(finding.explanation, `${context}.explanation`);
  if (
    finding.repair_guidance !== undefined
    && (
      typeof finding.repair_guidance !== "string"
      || finding.repair_guidance.trim().length === 0
    )
  ) {
    throw new TypeError(
      `${context}.repair_guidance must be a non-empty string when present.`,
    );
  }
}

function assertMeaning(
  value: unknown,
  outcome: ProofGuidedChangeOutcomeView,
): asserts value is ProofGuidedChangeMeaningView {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("The proof client returned an invalid meaning view.");
  }
  const meaning = value as Partial<ProofGuidedChangeMeaningView>;
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
    assertFinding(finding, `meaning.findings[${index}]`);
  }
  for (const [index, boundary] of meaning.non_conclusions.entries()) {
    nonempty(boundary, `meaning.non_conclusions[${index}]`);
  }
}

function cloneFinding(
  finding: ProofGuidedChangeFinding,
): ProofGuidedChangeFinding {
  return {
    requirement_id: finding.requirement_id,
    label: finding.label,
    explanation: finding.explanation,
    ...(finding.repair_guidance === undefined
      ? {}
      : { repair_guidance: finding.repair_guidance }),
  };
}

function publicCheck(
  outcome: ProofGuidedChangeOutcomeView,
  meaning: ProofGuidedChangeMeaningView,
): ProofGuidedChangeCurrentCheck {
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

function displayRevision(
  state: CurrentCandidateState<ProofGuidedChangeCandidate>,
): string {
  return `Revision ${state.revision_number}`;
}

function displayAttempt(
  state: CurrentCandidateState<ProofGuidedChangeCandidate>,
): string {
  return `Attempt ${state.attempt_number}`;
}

function assertAvailability(
  value: unknown,
): asserts value is ProofGuidedChangeAvailability {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(
      "change_policy.availability must return an object.",
    );
  }
  exactOwnKeys(
    value,
    ["available", "reason"],
    "change_policy.availability result",
  );
  const availability = value as Partial<ProofGuidedChangeAvailability>;
  if (typeof availability.available !== "boolean") {
    throw new TypeError(
      "change_policy.availability.available must be a boolean.",
    );
  }
  nonempty(
    availability.reason,
    "change_policy.availability.reason",
  );
}

function assertChangeResult(
  value: unknown,
): asserts value is ProofGuidedChangePolicyResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(
      "The change policy returned an invalid change result.",
    );
  }
  exactOwnKeys(
    value,
    ["source_bytes", "candidate_label", "summary"],
    "change policy result",
  );
  const result = value as Partial<ProofGuidedChangePolicyResult>;
  if (!(result.source_bytes instanceof Uint8Array)) {
    throw new TypeError(
      "change policy result.source_bytes must be a Uint8Array.",
    );
  }
  nonempty(
    result.candidate_label,
    "change policy result.candidate_label",
  );
  nonempty(result.summary, "change policy result.summary");
}

function validateConfigurationShape(
  input: CreateProofGuidedChangeWorkflowControllerInput,
): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError(
      "Workflow controller configuration must be an object.",
    );
  }
  const keys = Reflect.ownKeys(input);
  if (
    keys.some((key) => typeof key !== "string")
    || keys.some(
      (key) =>
        typeof key !== "string" || !CONFIGURATION_KEYS.has(key),
    )
    || REQUIRED_CONFIGURATION_KEYS.some(
      (key) => !Object.hasOwn(input, key),
    )
  ) {
    throw new TypeError(
      "Workflow controller configuration accepts only task, initial_candidate, candidate_factory, register_candidate, proof_client, change_policy, and optional now.",
    );
  }
}

/**
 * Creates the application lifecycle shared by proof-guided source changes.
 *
 * Contract installation, candidate resolution, proof capture, and the actual
 * source-changing capability are injected. The controller owns one-shot
 * attempt consumption, immutable candidate succession, result history,
 * currentness retries, audit access, and operation serialization.
 */
export async function createProofGuidedChangeWorkflowController<
  Candidate extends ProofGuidedChangeCandidate,
>(
  input: CreateProofGuidedChangeWorkflowControllerInput<Candidate>,
): Promise<ProofGuidedChangeWorkflowController> {
  validateConfigurationShape(input);

  if (
    !input.candidate_factory
    || typeof input.candidate_factory !== "object"
    || typeof input.candidate_factory.create !== "function"
    || typeof input.candidate_factory.closeAll !== "function"
  ) {
    throw new TypeError(
      "candidate_factory must expose create and closeAll functions.",
    );
  }
  const candidateFactory = input.candidate_factory;

  try {
    const task = normalizeTask(input.task);
    assertCandidate(input.initial_candidate, "initial_candidate");
    const initialCandidate = input.initial_candidate;
    readCandidateSource(initialCandidate);

    if (typeof input.register_candidate !== "function") {
      throw new TypeError("register_candidate must be a function.");
    }
    const registerCandidate = input.register_candidate;

    if (
      !input.proof_client
      || typeof input.proof_client !== "object"
      || typeof input.proof_client.check !== "function"
      || typeof input.proof_client.inspect !== "function"
    ) {
      throw new TypeError(
        "proof_client must expose check and inspect functions.",
      );
    }
    const proofClient = input.proof_client;

    if (
      !input.change_policy
      || typeof input.change_policy !== "object"
      || typeof input.change_policy.availability !== "function"
      || typeof input.change_policy.apply !== "function"
    ) {
      throw new TypeError(
        "change_policy must expose label, availability, and apply.",
      );
    }
    const changePolicy = input.change_policy;
    const changeLabel = nonempty(
      changePolicy.label,
      "change_policy.label",
    );

    const now = input.now ?? (() => new Date().toISOString());
    if (typeof now !== "function") {
      throw new TypeError("now must be a function.");
    }

    registerCandidate(initialCandidate);

    let current: CurrentCandidateState<Candidate> = {
      candidate: initialCandidate,
      consumed: false,
      revision_number: 1,
      attempt_number: 1,
    };
    let currentCheck: ProofGuidedChangeCurrentCheck | null = null;
    let lastRepair: ProofGuidedChangeRepairRecord | null = null;
    let lastFreshAttempt:
      ProofGuidedChangeFreshAttemptRecord | null = null;
    let lastActivity: ProofGuidedChangeActivity | null = null;
    const history: ProofGuidedChangeCheckHistoryEntry[] = [];
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

    function repairAvailability(): ProofGuidedChangeAvailability {
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
          reason:
            "Check the current candidate before applying a repair.",
        };
      }
      if (!currentCheck.current) {
        return {
          available: false,
          reason:
            "Only a current completed check can authorize a change.",
        };
      }
      const unsafeAvailability =
        changePolicy.availability(cloneJson(currentCheck));
      assertAvailability(unsafeAvailability);
      return {
        available: unsafeAvailability.available,
        reason: unsafeAvailability.reason,
      };
    }

    function retryAvailability(): ProofGuidedChangeAvailability {
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

    function snapshot(): ProofGuidedChangeWorkflowSnapshot {
      const availability = repairAvailability();
      const retry = retryAvailability();
      return cloneJson({
        task,
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
          label: changeLabel,
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
      async checkCurrent(): Promise<ProofGuidedChangeCurrentCheck> {
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
          const outcome = await proofClient.check({
            candidate_ref: checkedCandidate.candidate_ref,
          });
          assertOutcome(outcome, checkedCandidate.candidate_ref);
          if (ownedCheckRefs.has(outcome.check_ref)) {
            throw new Error(
              `The proof client reused check reference ${outcome.check_ref}.`,
            );
          }
          const unsafeMeaning = proofClient.inspect(
            outcome.check_ref,
            "meaning",
          );
          assertMeaning(unsafeMeaning, outcome);
          const completed = publicCheck(outcome, unsafeMeaning);
          const checkedAtValue = checkedAt(now);
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
      async applyRepair(): Promise<ProofGuidedChangeRepairRecord> {
        assertOpen();
        const availability = repairAvailability();
        if (!availability.available || currentCheck === null) {
          throw new Error(availability.reason);
        }
        repairing = true;
        const baseCandidate = current.candidate;
        try {
          const baseSourceBytes = readCandidateSource(baseCandidate);
          const unsafeChangeOutput = await changePolicy.apply({
            source_bytes: cloneBytes(baseSourceBytes),
            task: cloneJson(task),
            findings: currentCheck.findings.map(cloneFinding),
          });
          assertChangeResult(unsafeChangeOutput);
          const changeOutput = unsafeChangeOutput;
          if (sameBytes(changeOutput.source_bytes, baseSourceBytes)) {
            throw new Error(
              "The repair must produce distinct source bytes.",
            );
          }
          let changedCandidate: Candidate | null = null;
          let acceptedCandidate = false;
          try {
            changedCandidate = await candidateFactory.create({
              label: changeOutput.candidate_label,
              source_bytes: cloneBytes(changeOutput.source_bytes),
            });
            assertCandidate(changedCandidate, "changed candidate");
            const changedSourceBytes =
              readCandidateSource(changedCandidate);
            if (
              !sameBytes(changedSourceBytes, changeOutput.source_bytes)
            ) {
              throw new Error(
                "The changed candidate does not contain the change policy source bytes.",
              );
            }
            if (
              changedCandidate.candidate_ref
                === baseCandidate.candidate_ref
              || changedCandidate.source_digest
                === baseCandidate.source_digest
              || changedCandidate.revision === baseCandidate.revision
              || changedCandidate.preview_url
                === baseCandidate.preview_url
            ) {
              throw new Error(
                "The repair must produce a distinct candidate, source identity, revision, and preview.",
              );
            }
            if (changedCandidate.label !== changeOutput.candidate_label) {
              throw new Error(
                "The changed candidate label does not match the change policy result.",
              );
            }
            registerCandidate(changedCandidate);
            acceptedCandidate = true;
          } catch (error) {
            if (!acceptedCandidate) {
              await closeRejectedCandidate(changedCandidate);
            }
            throw error;
          }
          repairOrdinal += 1;
          const repairRecord: ProofGuidedChangeRepairRecord = {
            repair_ref: `repair_${repairOrdinal}`,
            from_candidate_ref: baseCandidate.candidate_ref,
            to_candidate_ref: changedCandidate.candidate_ref,
            summary: changeOutput.summary,
          };
          lastRepair = repairRecord;
          current = {
            candidate: changedCandidate,
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
      async prepareFreshAttempt():
      Promise<ProofGuidedChangeFreshAttemptRecord> {
        assertOpen();
        const availability = retryAvailability();
        if (!availability.available) {
          throw new Error(availability.reason);
        }
        retrying = true;
        const base = current;
        try {
          const baseSourceBytes = readCandidateSource(base.candidate);
          let freshCandidate: Candidate | null = null;
          let acceptedCandidate = false;
          try {
            freshCandidate = await candidateFactory.create({
              label: base.candidate.label,
              source_bytes: cloneBytes(baseSourceBytes),
            });
            assertCandidate(freshCandidate, "fresh candidate");
            const freshSourceBytes =
              readCandidateSource(freshCandidate);
            if (!sameBytes(freshSourceBytes, baseSourceBytes)) {
              throw new Error(
                "A fresh attempt must retain the exact source bytes.",
              );
            }
            if (
              freshCandidate.candidate_ref
                === base.candidate.candidate_ref
              || freshCandidate.source_digest
                !== base.candidate.source_digest
              || freshCandidate.revision !== base.candidate.revision
              || freshCandidate.preview_url
                === base.candidate.preview_url
            ) {
              throw new Error(
                "A fresh attempt must retain the source revision while using a distinct candidate and preview.",
              );
            }
            if (freshCandidate.label !== base.candidate.label) {
              throw new Error(
                "A fresh attempt must retain the candidate label.",
              );
            }
            registerCandidate(freshCandidate);
            acceptedCandidate = true;
          } catch (error) {
            if (!acceptedCandidate) {
              await closeRejectedCandidate(freshCandidate);
            }
            throw error;
          }
          freshAttemptOrdinal += 1;
          attemptOrdinal += 1;
          const freshState: CurrentCandidateState<Candidate> = {
            candidate: freshCandidate,
            consumed: false,
            revision_number: base.revision_number,
            attempt_number: attemptOrdinal,
          };
          const record: ProofGuidedChangeFreshAttemptRecord = {
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
        return cloneJson(proofClient.inspect(checkedRef, "audit"));
      },
      async close(): Promise<void> {
        if (closed) return;
        if (checking || repairing || retrying) {
          throw new Error(
            "The application cannot close during an active operation.",
          );
        }
        closed = true;
        await candidateFactory.closeAll();
      },
    });
  } catch (error) {
    await candidateFactory.closeAll();
    throw error;
  }
}
