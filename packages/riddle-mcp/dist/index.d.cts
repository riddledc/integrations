type RiddleMcpConfig = {
    baseUrl?: string;
    apiUrl?: string;
    token?: string;
};
type RiddleEnvNames = {
    baseUrl: string;
    apiUrl: string;
    token: string;
};
declare function loadConfigFromEnv(envNames?: Partial<RiddleEnvNames>): RiddleMcpConfig;
declare function redactSecrets(config: RiddleMcpConfig): RiddleMcpConfig;

export { type RiddleEnvNames, type RiddleMcpConfig, loadConfigFromEnv, redactSecrets };
