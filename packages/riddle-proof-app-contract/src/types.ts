export const RIDDLE_PROOF_APP_CONTRACT_VERSION = "riddle-proof.app-contract.v1" as const;

export type RiddleProofContractValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, unknown>
  | unknown[];

export type RiddleProofAppContractState = Record<string, unknown>;

export interface RiddleProofAppContractPayload {
  version: string;
  route?: string;
  state?: RiddleProofAppContractState;
  user?: string;
  metadata?: Record<string, unknown>;
}

export interface RiddleProofAppContractInstallOptions {
  globalName?: string;
  force?: boolean;
  redactedPaths?: readonly string[];
}

export interface InstallRiddleProofContractInput {
  version?: string;
  route?: string;
  getState?: () => RiddleProofAppContractState | undefined;
  user?: string;
  metadata?: Record<string, unknown>;
  globalName?: string;
  force?: boolean;
  redactedPaths?: readonly string[];
}

export interface RiddleProofContractDefinition {
  version: string;
  route?: string;
  user?: string;
  state?: RiddleProofAppContractState;
  metadata?: Record<string, unknown>;
}

export interface RiddleProofRedactionOptions {
  sensitivePaths?: readonly string[];
  maxStringLength?: number;
}
