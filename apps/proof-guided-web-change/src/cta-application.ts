import {
  createPinnedCtaChangeContract,
} from "riddle-proof-guided-cta-change-experiment";

import {
  type CtaAgentChangeOutput,
  type CtaChangeAgent,
  createCtaAgentChangeExecutor,
  ctaAgentSupportsFindings,
} from "./cta-agent.js";
import {
  type CtaProjectCandidateResolver,
  type FixedCtaChangeContractIdentity,
  createCtaProjectCandidateResolver,
} from "./cta-project-candidate-resolver.js";
import {
  type CtaLoopbackProofTargetAccess,
  ImmutableCtaLoopbackSpecimenFactory,
  initialCtaSpecimenSourceBytes,
} from "./cta-specimen.js";
import {
  type ProofGuidedChangeCurrentCheck,
  type ProofGuidedChangeFinding,
  type ProofGuidedChangeOutcomeView,
  type ProofGuidedChangeRepairRecord,
  type ProofGuidedChangeTaskDisplay,
  type ProofGuidedChangeWorkflowController,
  type ProofGuidedChangeWorkflowSnapshot,
  createProofGuidedChangeWorkflowController,
} from "./workflow-controller.js";

const PINNED_CTA_CHANGE_CONTRACT =
  createPinnedCtaChangeContract();

export const FIXED_CTA_CHANGE_CONTRACT:
Readonly<FixedCtaChangeContractIdentity> = Object.freeze({
  id: PINNED_CTA_CHANGE_CONTRACT.id,
  version: PINNED_CTA_CHANGE_CONTRACT.version,
  digest: PINNED_CTA_CHANGE_CONTRACT.digest,
  protocol_version:
    PINNED_CTA_CHANGE_CONTRACT.protocol_version,
});

export const CTA_CHANGE_TASK = Object.freeze({
  title: "Change the primary CTA",
  description:
    "Change only the primary CTA to View pricing → /pricing while preserving the declared routes, responsive layout, and captured runtime health.",
  requirements: Object.freeze([
    "The primary CTA says View pricing and links to /pricing",
    "The Home, Features, and Pricing routes remain present and healthy",
    "The declared mobile and desktop layouts remain within horizontal bounds",
    "The captured browser runtime remains free of fatal errors",
  ]),
});

export interface ProofGuidedCtaChangeClient {
  readonly contract: FixedCtaChangeContractIdentity;
  check(input: {
    candidate_ref: string;
  }): Promise<ProofGuidedChangeOutcomeView>;
  inspect(
    checkRef: string,
    level?: "outcome" | "meaning" | "audit",
  ): unknown;
}

export interface ProofGuidedCtaChangeClientFactory {
  (input: {
    candidate_resolver: Pick<
      CtaProjectCandidateResolver,
      "resolve"
    >;
    proof_transport_for(input: {
      candidate_ref: string;
      target: string;
    }): Promise<CtaLoopbackProofTargetAccess>;
  }): ProofGuidedCtaChangeClient;
}

export interface CtaProposalRecord {
  repair_ref: string;
  from_candidate_ref: string;
  to_candidate_ref: string;
  proposal_ref: string;
  agent_id: string;
  base_source_digest: string;
  proposed_source_digest: string;
  mutation_policy_digest: string;
}

export interface CreateCtaChangeApplicationInput {
  client_factory: ProofGuidedCtaChangeClientFactory;
  agent: CtaChangeAgent;
  now?: () => string;
  on_proposal?: (proposal: CtaProposalRecord) => void;
}

export type CtaChangeApplicationSnapshot =
  ProofGuidedChangeWorkflowSnapshot;
export interface CtaChangeApplication
  extends ProofGuidedChangeWorkflowController {
  proposalAudit(repairRef: string): CtaProposalRecord;
}

function assertClientContract(
  actual: FixedCtaChangeContractIdentity,
): void {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    throw new TypeError(
      "The CTA proof client must expose its installed contract.",
    );
  }
  for (const field of [
    "id",
    "version",
    "digest",
    "protocol_version",
  ] as const) {
    if (actual[field] !== FIXED_CTA_CHANGE_CONTRACT[field]) {
      throw new Error(
        `The CTA application refuses a changed proof contract at ${field}.`,
      );
    }
  }
}

function validateInput(
  input: CreateCtaChangeApplicationInput,
): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError(
      "CTA application configuration must be an object.",
    );
  }
  const allowed = new Set([
    "client_factory",
    "agent",
    "now",
    "on_proposal",
  ]);
  const keys = Object.keys(input);
  if (
    !Object.hasOwn(input, "client_factory")
    || !Object.hasOwn(input, "agent")
    || keys.some((key) => !allowed.has(key))
  ) {
    throw new TypeError(
      "CTA application configuration accepts only client_factory, agent, optional now, and optional on_proposal.",
    );
  }
  if (typeof input.client_factory !== "function") {
    throw new TypeError("client_factory must be a function.");
  }
  if (
    !input.agent
    || typeof input.agent !== "object"
    || typeof input.agent.propose !== "function"
  ) {
    throw new TypeError("agent.propose must be a function.");
  }
  if (input.now !== undefined && typeof input.now !== "function") {
    throw new TypeError("now must be a function.");
  }
  if (
    input.on_proposal !== undefined
    && typeof input.on_proposal !== "function"
  ) {
    throw new TypeError("on_proposal must be a function.");
  }
}

function emitProposal(
  callback: CreateCtaChangeApplicationInput["on_proposal"],
  proposal: CtaProposalRecord,
): void {
  try {
    callback?.(structuredClone(proposal));
  } catch {
    // Proposal observation is non-authoritative audit telemetry.
  }
}

export async function createCtaChangeApplication(
  input: CreateCtaChangeApplicationInput,
): Promise<CtaChangeApplication> {
  validateInput(input);
  const specimenFactory =
    new ImmutableCtaLoopbackSpecimenFactory();
  try {
    const resolver = createCtaProjectCandidateResolver({
      expected_contract: FIXED_CTA_CHANGE_CONTRACT,
    });
    const initialCandidate = await specimenFactory.create({
      label: "Current CTA candidate",
      source_bytes: initialCtaSpecimenSourceBytes(),
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
        "client_factory must return a proof-guided CTA-change client.",
      );
    }
    assertClientContract(client.contract);
    const changeExecutor = createCtaAgentChangeExecutor({
      agent: input.agent,
    });
    const proposalState: {
      pending: CtaAgentChangeOutput["proposal"] | null;
    } = { pending: null };
    const pendingProposal = ():
    CtaAgentChangeOutput["proposal"] | null =>
      proposalState.pending;

    const controller =
      await createProofGuidedChangeWorkflowController({
      task: CTA_CHANGE_TASK,
      initial_candidate: initialCandidate,
      candidate_factory: specimenFactory,
      register_candidate:
        resolver.register.bind(resolver),
      proof_client: client,
      change_policy: Object.freeze({
        label: "Ask agent to apply the bounded CTA change",
        availability(
          check: ProofGuidedChangeCurrentCheck,
        ) {
          if (
            check.disposition === "does_not_conform"
            && ctaAgentSupportsFindings(check.findings)
          ) {
            return {
              available: true,
              reason:
                "The current check found only the primary CTA mismatch this agent is allowed to change.",
            };
          }
          if (check.disposition === "does_not_conform") {
            return {
              available: false,
              reason:
                "The current failures extend beyond the bounded primary CTA change.",
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
              "An unresolved or stale check does not authorize an agent change.",
          };
        },
        async apply(changeInput: {
          source_bytes: Uint8Array;
          task: ProofGuidedChangeTaskDisplay;
          findings: readonly ProofGuidedChangeFinding[];
        }) {
          const output = await changeExecutor.change({
            source_bytes: changeInput.source_bytes,
            task: changeInput.task,
            findings: changeInput.findings,
          });
          if (output.changed_surface !== "primary_cta") {
            throw new TypeError(
              "The CTA agent changed an unowned surface.",
            );
          }
          proposalState.pending =
            structuredClone(output.proposal);
          return {
            source_bytes: output.source_bytes,
            candidate_label: "Agent-proposed CTA change",
            summary: output.summary,
          };
        },
      }),
      ...(input.now === undefined ? {} : { now: input.now }),
    });
    const proposalsByRepair = new Map<
      string,
      CtaProposalRecord
    >();
    let applyingRepair = false;
    let closed = false;

    return Object.freeze({
      snapshot: controller.snapshot.bind(controller),
      checkCurrent: controller.checkCurrent.bind(controller),
      async applyRepair():
      Promise<ProofGuidedChangeRepairRecord> {
        if (applyingRepair) {
          throw new Error(
            "Another application operation is running.",
          );
        }
        applyingRepair = true;
        proposalState.pending = null;
        try {
          const repair = await controller.applyRepair();
          const committedProposal = pendingProposal();
          if (committedProposal === null) {
            throw new Error(
              "The committed CTA change is missing its bounded agent proposal.",
            );
          }
          const proposal: CtaProposalRecord = Object.freeze({
            repair_ref: repair.repair_ref,
            from_candidate_ref: repair.from_candidate_ref,
            to_candidate_ref: repair.to_candidate_ref,
            ...committedProposal,
          });
          proposalsByRepair.set(repair.repair_ref, proposal);
          emitProposal(input.on_proposal, proposal);
          return repair;
        } finally {
          proposalState.pending = null;
          applyingRepair = false;
        }
      },
      prepareFreshAttempt:
        controller.prepareFreshAttempt.bind(controller),
      audit: controller.audit.bind(controller),
      proposalAudit(repairRef: string): CtaProposalRecord {
        if (closed) {
          throw new Error("The application is closed.");
        }
        if (
          typeof repairRef !== "string"
          || repairRef.trim().length === 0
        ) {
          throw new TypeError(
            "repair_ref must be a non-empty string.",
          );
        }
        const proposal = proposalsByRepair.get(repairRef);
        if (proposal === undefined) {
          throw new Error(
            `No CTA agent proposal exists for ${repairRef}.`,
          );
        }
        return structuredClone(proposal);
      },
      async close(): Promise<void> {
        if (applyingRepair) {
          throw new Error(
            "The application cannot close during an active operation.",
          );
        }
        await controller.close();
        closed = true;
      },
    });
  } catch (error) {
    await specimenFactory.closeAll();
    throw error;
  }
}
