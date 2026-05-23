export type RiddleProofContractValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, unknown>
  | unknown[];

export type RiddleProofAppContractState = Record<string, unknown>;

export interface RiddleProofCaptureDiagnostic {
  version: "riddle-proof.capture-diagnostic.v1";
  route?: string;
  state?: RiddleProofAppContractState;
}

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
  includeDefaultSensitivePaths?: boolean;
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
  includeDefaultSensitivePaths?: boolean;
}

export interface RiddleProofContractCaptureDiagnostic extends RiddleProofCaptureDiagnostic {}

export interface RiddleProofContractDefinition {
  version: string;
  route?: string;
  user?: string;
  metadata?: Record<string, unknown>;
  getState: () => RiddleProofAppContractState | undefined;
  captureDiagnostic: () => RiddleProofCaptureDiagnostic;
}

export interface RiddleProofRedactionOptions {
  sensitivePaths?: readonly string[];
  maxStringLength?: number;
  includeDefaultSensitivePaths?: boolean;
}
