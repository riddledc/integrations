export const RIDDLE_PROOF_APP_CONTRACT_VERSION = "riddle-proof.app-contract.v1" as const;

export type RiddleProofAppContractState = Record<string, unknown> | undefined;

export interface RiddleProofAppContractPayload {
  version: string;
  state?: RiddleProofAppContractState;
  route?: string;
  user?: string;
  metadata?: Record<string, unknown>;
}

export interface RiddleProofAppContractInstallOptions {
  globalName?: string;
  force?: boolean;
}

export interface RiddleProofAppContractDefinition {
  version: string;
  route?: string;
  state?: RiddleProofAppContractState;
  user?: string;
  metadata?: Record<string, unknown>;
  capture?: {
    getState?: () => RiddleProofAppContractState;
    getRoute?: () => string | null;
  };
}

export type RiddleProofAppContractInstallError = Error & {
  code?: "missing-runtime" | "invalid-payload" | "unsupported-environment";
};
