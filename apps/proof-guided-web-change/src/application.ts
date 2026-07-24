import {
  type FixedWebChangeContractIdentity,
  type ProjectCandidateResolver,
  createProjectCandidateResolver,
} from "./project-candidate-resolver.js";
import {
  createDeterministicDurableSettingRepairExecutor,
  durableSettingRepairSupportsFindings,
} from "./repair-executor.js";
import {
  ImmutableLoopbackSpecimenFactory,
  type LoopbackProofTargetAccess,
  pageOnlySpecimenSourceBytes,
} from "./specimen.js";
import {
  type ProofGuidedChangeActivity,
  type ProofGuidedChangeCheckHistoryEntry,
  type ProofGuidedChangeCurrentCheck,
  type ProofGuidedChangeDisposition,
  type ProofGuidedChangeFinding,
  type ProofGuidedChangeFreshAttemptRecord,
  type ProofGuidedChangeMeaningView,
  type ProofGuidedChangeOutcomeView,
  type ProofGuidedChangeRepairRecord,
  type ProofGuidedChangeTaskDisplay,
  type ProofGuidedChangeWorkflowController,
  type ProofGuidedChangeWorkflowSnapshot,
  createProofGuidedChangeWorkflowController,
} from "./workflow-controller.js";

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
  ProofGuidedChangeDisposition;
export type ProofClientOutcomeView =
  ProofGuidedChangeOutcomeView;
export type ProofClientMeaningView =
  ProofGuidedChangeMeaningView;
export type ApplicationFinding = ProofGuidedChangeFinding;
export type ApplicationCurrentCheck =
  ProofGuidedChangeCurrentCheck;
export type ApplicationCheckHistoryEntry =
  ProofGuidedChangeCheckHistoryEntry;
export type ApplicationRepairRecord =
  ProofGuidedChangeRepairRecord;
export type ApplicationFreshAttemptRecord =
  ProofGuidedChangeFreshAttemptRecord;
export type ApplicationActivity = ProofGuidedChangeActivity;
export type DurableSettingApplicationSnapshot =
  ProofGuidedChangeWorkflowSnapshot;
export type DurableSettingRepairApplication =
  ProofGuidedChangeWorkflowController;

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

export interface CreateDurableSettingRepairApplicationInput {
  client_factory: ProofGuidedWebChangeClientFactory;
  now?: () => string;
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

function validateInput(
  input: CreateDurableSettingRepairApplicationInput,
): void {
  if (!input || typeof input !== "object") {
    throw new TypeError("Application configuration must be an object.");
  }
  const keys = Object.keys(input);
  if (
    !Object.hasOwn(input, "client_factory")
    || keys.some(
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
  if (input.now !== undefined && typeof input.now !== "function") {
    throw new TypeError("now must be a function.");
  }
}

/**
 * Installs the durable-setting workflow around the shared attempt lifecycle.
 *
 * The durable contract, resolver, exact source variants, and deterministic
 * repair remain owned here. The shared controller receives only the already
 * configured proof client and a meaning-level source-change capability.
 */
export async function createDurableSettingRepairApplication(
  input: CreateDurableSettingRepairApplicationInput,
): Promise<DurableSettingRepairApplication> {
  validateInput(input);
  const specimenFactory = new ImmutableLoopbackSpecimenFactory();
  try {
    const resolver = createProjectCandidateResolver({
      expected_contract: FIXED_DURABLE_SETTING_CONTRACT,
    });
    const initialCandidate = await specimenFactory.create({
      label: "Page-only candidate",
      source_bytes: pageOnlySpecimenSourceBytes(),
    });
    const client = input.client_factory({
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
    const repairExecutor =
      createDeterministicDurableSettingRepairExecutor();

    return await createProofGuidedChangeWorkflowController({
      task: DURABLE_SETTING_TASK,
      initial_candidate: initialCandidate,
      candidate_factory: specimenFactory,
      register_candidate:
        resolver.register.bind(resolver),
      proof_client: client,
      change_policy: Object.freeze({
        label: "Apply server-backed persistence repair",
        availability(
          check: ProofGuidedChangeCurrentCheck,
        ) {
          if (
            check.disposition === "does_not_conform"
            && durableSettingRepairSupportsFindings(check.findings)
          ) {
            return {
              available: true,
              reason:
                "The current check found persistence problems this repair can address.",
            };
          }
          if (check.disposition === "does_not_conform") {
            return {
              available: false,
              reason:
                "The current failures are outside the owned persistence repair.",
            };
          }
          if (check.disposition === "conforms") {
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
        },
        async apply(changeInput: {
          source_bytes: Uint8Array;
          task: ProofGuidedChangeTaskDisplay;
          findings: readonly ProofGuidedChangeFinding[];
        }) {
          const output = await repairExecutor.repair({
            source_bytes: changeInput.source_bytes,
            task: changeInput.task,
            findings: changeInput.findings,
          });
          if (output.changed_surface !== "server.mjs") {
            throw new TypeError(
              "The durable repair changed an unowned surface.",
            );
          }
          return {
            source_bytes: output.source_bytes,
            candidate_label: "Server-backed repair",
            summary: output.summary,
          };
        },
      }),
      ...(input.now === undefined ? {} : { now: input.now }),
    });
  } catch (error) {
    await specimenFactory.closeAll();
    throw error;
  }
}
