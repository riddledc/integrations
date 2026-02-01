// src/index.ts
var DEFAULT_ENV_NAMES = {
  baseUrl: "RIDDLE_BASE_URL",
  apiUrl: "RIDDLE_API_URL",
  token: "RIDDLE_TOKEN"
};
function loadConfigFromEnv(envNames = {}) {
  const names = { ...DEFAULT_ENV_NAMES, ...envNames };
  return {
    baseUrl: process.env[names.baseUrl],
    apiUrl: process.env[names.apiUrl],
    token: process.env[names.token]
  };
}
function redactSecrets(config) {
  return {
    baseUrl: config.baseUrl,
    apiUrl: config.apiUrl,
    token: config.token ? "[REDACTED]" : void 0
  };
}
export {
  loadConfigFromEnv,
  redactSecrets
};
