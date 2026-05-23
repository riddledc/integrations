import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRiddleApiClient, isTerminalRiddleJobStatus, parseRiddleViewport, resolveRiddleApiKeySource } from "./dist/index.js";

const keyDir = mkdtempSync(join(tmpdir(), "riddle-proof-riddle-client-"));
const keyFile = join(keyDir, "key.txt");
writeFileSync(keyFile, "test-key\n");

if (!isTerminalRiddleJobStatus("completed")) {
  throw new Error("Terminal status helper should treat completed as terminal.");
}

if (parseRiddleViewport("1280x720")?.width !== 1280) {
  throw new Error("Viewport parsing failed.");
}

const resolved = resolveRiddleApiKeySource({ apiKey: "test-key", apiKeyFile: keyFile });
if (resolved.source !== "option" || resolved.file) {
  throw new Error("API key source resolution failed.");
}

const _client = createRiddleApiClient({ apiKeyFile: keyFile });
console.log("riddle proof riddle client smoke tests passed", {
  terminalStatus: true,
  viewport: parseRiddleViewport("320x240"),
  hasClient: !!_client,
});
