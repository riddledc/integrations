export type RiddleOpenClawConfig = {
  baseUrl?: string;
  apiUrl?: string;
  token?: string;
};

export type OpenClawPlugin = {
  name: string;
  config: RiddleOpenClawConfig;
  init: (context?: unknown) => void | Promise<void>;
};

export function createRiddleOpenClawPlugin(config: RiddleOpenClawConfig): OpenClawPlugin {
  return {
    name: "riddledc",
    config,
    init: () => {
      // Placeholder: wire this into OpenClaw's plugin system in your app.
    }
  };
}
