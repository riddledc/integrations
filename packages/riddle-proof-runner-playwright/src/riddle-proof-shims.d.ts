declare module "@riddledc/riddle-proof" {
  export type RiddleProofProfileViewport = {
    name: string;
    width: number;
    height: number;
  };

  export type RiddleProofProfileSetupAction = {
    type: string;
    label?: string;
    selector?: string;
    value?: unknown;
    key?: string;
    ms?: number;
    timeout_ms?: number;
    script?: string;
    optional?: boolean;
  };

  export type RiddleProofProfile = {
    version?: string;
    name: string;
    target: {
      viewports: RiddleProofProfileViewport[];
      route?: string;
      url?: string;
      wait_for_selector?: string;
      setup_actions?: RiddleProofProfileSetupAction[];
      auth?: unknown;
    };
    checks?: unknown[];
    [key: string]: unknown;
  };

  export type RiddleProofProfileRunner = "local-playwright" | string;

  export type RiddleProofProfileEvidence = Record<string, unknown>;

  export type RiddleProofProfileResult = {
    status: string;
    profile_name: string;
    captured_at: string;
    artifacts: {
      proof_json?: string;
      console?: string;
      dom_summary?: string;
      screenshots?: string[];
      riddle_artifacts?: string[];
      [key: string]: unknown;
    };
    route?: {
      requested: string;
      observed: string;
      matched: boolean;
      error?: string;
    };
    summary?: string;
    version?: string;
    runner?: RiddleProofProfileRunner;
    evidence?: RiddleProofProfileEvidence;
    [key: string]: unknown;
  };

  export function buildRiddleProofProfileScript(profile: RiddleProofProfile): string;
  export function collectRiddleProfileArtifactRefs(artifacts: unknown[]): string[];
  export function createRiddleProofProfileEnvironmentBlockedResult(
    input: { profile: RiddleProofProfile; runner?: RiddleProofProfileRunner } & Record<string, unknown>,
  ): RiddleProofProfileResult;
  export function createRiddleProofProfileInsufficientResult(
    input: { profile: RiddleProofProfile; runner?: RiddleProofProfileRunner } & Record<string, unknown>,
  ): RiddleProofProfileResult;
  export function extractRiddleProofProfileResult(value: unknown): RiddleProofProfileResult;
  export function normalizeRiddleProofProfile(profile: unknown, overrides?: Record<string, unknown>): RiddleProofProfile;
  export function resolveRiddleProofProfileTargetUrl(profile: RiddleProofProfile): string;
  export function resolveRiddleProofProfileTimeoutSec(profile: RiddleProofProfile, overrideSeconds?: number): number | undefined;
  export function assessRiddleProofProfileEvidence(
    profile: RiddleProofProfile,
    evidence: RiddleProofProfileEvidence,
    options?: { runner?: string },
  ): unknown;
  export function collectRiddleProofProfileArtifactRefs(artifacts: unknown[]): string[];
  export function makeLocalRiddleProofResultTemplate(
    profile: RiddleProofProfile,
    runner?: RiddleProofProfileRunner,
  ): RiddleProofProfileResult;
  export function collectRiddleProofProfileEvidence(
    profile: RiddleProofProfile,
    page: unknown,
    options?: Record<string, unknown>,
  ): Promise<RiddleProofProfileEvidence>;
}

