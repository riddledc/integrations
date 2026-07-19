import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as directEsm from "@riddledc/riddle-proof-riddle-client/client";
import * as facadeEsm from "./dist/riddle-client.js";
import * as rootEsm from "./dist/index.js";
import * as runtimeEsm from "./dist/runtime/riddle-client.js";

const require = createRequire(import.meta.url);
const directCjs = require("@riddledc/riddle-proof-riddle-client/client");
const facadeCjs = require("./dist/riddle-client.cjs");
const rootCjs = require("./dist/index.cjs");
const runtimeCjs = require("./dist/runtime/riddle-client.cjs");

for (const entry of [facadeEsm, rootEsm, runtimeEsm]) {
  assert.equal(entry.RiddleApiError, directEsm.RiddleApiError);
  assert.equal(entry.createRiddleApiClient, directEsm.createRiddleApiClient);
  assert.equal(entry.getRiddleJobArtifacts, directEsm.getRiddleJobArtifacts);
  assert.equal(entry.RIDDLE_BALANCE_ENDPOINT_PATH, directEsm.RIDDLE_BALANCE_ENDPOINT_PATH);
}
for (const entry of [facadeCjs, rootCjs, runtimeCjs]) {
  assert.equal(entry.RiddleApiError, directCjs.RiddleApiError);
  assert.equal(entry.createRiddleApiClient, directCjs.createRiddleApiClient);
  assert.equal(entry.getRiddleJobArtifacts, directCjs.getRiddleJobArtifacts);
  assert.equal(entry.RIDDLE_BALANCE_ENDPOINT_PATH, directCjs.RIDDLE_BALANCE_ENDPOINT_PATH);
}

const esmError = new facadeEsm.RiddleApiError("/fixture", 418, "teapot");
assert.ok(esmError instanceof directEsm.RiddleApiError);
assert.equal(esmError.status, 418);
assert.equal(esmError.path, "/fixture");

const cjsError = new facadeCjs.RiddleApiError("/fixture", 429, "busy");
assert.ok(cjsError instanceof directCjs.RiddleApiError);
assert.equal(cjsError.status, 429);

const legacySource = readFileSync(new URL("./src/riddle-client.ts", import.meta.url), "utf8");
const legacyRuntime = readFileSync(new URL("./runtime/lib/riddle_core_call.mjs", import.meta.url), "utf8");
const legacyCli = readFileSync(new URL("./src/cli.ts", import.meta.url), "utf8");
for (const [label, source] of [["TypeScript facade", legacySource], ["runtime launcher", legacyRuntime], ["compatibility CLI", legacyCli]]) {
  assert.equal(source.includes("https://api.riddledc.com"), false, `${label} must not own the hosted endpoint`);
  assert.equal(source.includes("process.env.RIDDLE_API_KEY"), false, `${label} must not implement hosted credential lookup`);
  assert.equal(/\/v1(?:\/|["'`])/u.test(source), false, `${label} must not own hosted API path literals`);
}

console.log("hosted client compatibility ownership tests passed");
