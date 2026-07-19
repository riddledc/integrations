/**
 * Compatibility facade for the hosted Riddle API client.
 *
 * The implementation intentionally lives in
 * `@riddledc/riddle-proof-riddle-client`; importing this legacy path is
 * therefore explicitly network-capable.
 */
export {
  DEFAULT_RIDDLE_API_BASE_URL,
  DEFAULT_RIDDLE_API_KEY_FILE,
  RIDDLE_BALANCE_ENDPOINT_PATH,
  RIDDLE_UNSUBMITTED_WAKE_HINT,
  RiddleApiError,
  collectRiddlePreviewDeployWarnings,
  createRiddleApiClient,
  deployRiddlePreview,
  deployRiddleStaticPreview,
  detectRiddlePreviewSource,
  getRiddleBalance,
  getRiddleJobArtifacts,
  isTerminalRiddleJobStatus,
  parseRiddleViewport,
  pollRiddleJob,
  resolveRiddleApiKey,
  resolveRiddleApiKeySource,
  riddleRequestJson,
  runRiddleScript,
  runRiddleServerPreview,
} from "@riddledc/riddle-proof-riddle-client/client";

export type {
  RiddleApiKeySource,
  RiddleBalanceResult,
  RiddleClientConfig,
  RiddleFetch,
  RiddlePollJobOptions,
  RiddlePollJobResult,
  RiddlePollProgressSnapshot,
  RiddlePollSummary,
  RiddlePreviewDeployOptions,
  RiddlePreviewDeployProgressSnapshot,
  RiddlePreviewDeployResult,
  RiddlePreviewDeployStage,
  RiddlePreviewFramework,
  RiddleRunScriptInput,
  RiddleServerPreviewInput,
  RiddleServerPreviewResult,
} from "@riddledc/riddle-proof-riddle-client/client";
