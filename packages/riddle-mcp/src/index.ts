export type RiddleMcpConfig = {
  baseUrl?: string;
  apiUrl?: string;
  token?: string;
};

export type RiddleEnvNames = {
  baseUrl: string;
  apiUrl: string;
  token: string;
};

const DEFAULT_ENV_NAMES: RiddleEnvNames = {
  baseUrl: "RIDDLE_BASE_URL",
  apiUrl: "RIDDLE_API_URL",
  token: "RIDDLE_TOKEN"
};

export function loadConfigFromEnv(envNames: Partial<RiddleEnvNames> = {}): RiddleMcpConfig {
  const names: RiddleEnvNames = { ...DEFAULT_ENV_NAMES, ...envNames };
  return {
    baseUrl: process.env[names.baseUrl],
    apiUrl: process.env[names.apiUrl],
    token: process.env[names.token]
  };
}

export function redactSecrets(config: RiddleMcpConfig): RiddleMcpConfig {
  return {
    baseUrl: config.baseUrl,
    apiUrl: config.apiUrl,
    token: config.token ? "[REDACTED]" : undefined
  };
}
