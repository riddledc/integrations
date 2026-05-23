import assert from "node:assert/strict";
import {
  installRiddleProofContract,
  readRiddleProofContract,
  uninstallRiddleProofContract,
  redactObject,
} from "./dist/index.js";

const previousWindow = globalThis.window;
const previousLocation = globalThis.location;
const previousDefinition = globalThis.__riddleProofContract;

globalThis.window = globalThis;
Object.defineProperty(globalThis, "location", {
  configurable: true,
  value: { pathname: "/dashboard" },
});

try {
  let state = {
    user: {
      token: "abc-123",
      displayName: "Ada",
    },
    nested: { secret: "s", nested: { api_key: "key" } },
  };
  const payload = installRiddleProofContract({
    getState() {
      return state;
    },
  });

  assert.equal(payload.version, "riddle-proof.app-contract.v1");
  assert.equal(payload.route, "/dashboard");
  assert.equal(typeof payload.getState, "function");

  const readBack = readRiddleProofContract();
  assert.equal(readBack?.route, "/dashboard");
  const readState = readBack?.getState?.();
  if (!readState || typeof readState !== "object") {
    throw new Error("Expected contract state getter to exist.");
  }
  assert.equal(readState.user && typeof readState.user === "object" ? readState.user.token : undefined, "[redacted]");
  assert.equal(readState.nested && typeof readState.nested === "object" ? readState.nested.secret : undefined, "[redacted]");
  const capture = readBack?.captureDiagnostic?.();
  assert.equal(capture?.version, "riddle-proof.capture-diagnostic.v1");
  assert.equal(capture?.route, "/dashboard");

  state = { ...state, route: "/new" };
  const secondRead = readRiddleProofContract();
  assert.equal(secondRead?.getState?.()?.route, "/new");

  uninstallRiddleProofContract();
  assert.equal(readRiddleProofContract(), null);

  const scrubbed = redactObject(
    {
      token: "abcdef",
      user: { password: "pw" },
      nested: { auth_token: "abc", profile: { api_key: "x" } },
      nestedSafe: "value",
      tokenList: ["a", "b"],
    },
    { sensitivePaths: ["nested.auth_token"] },
  );
  assert.equal(scrubbed.token, "[redacted]");
  assert.equal(scrubbed.nested?.auth_token ?? null, "[redacted]");
  assert.equal(scrubbed.nestedSafe, "value");
  assert.equal(scrubbed.nested?.profile?.api_key ?? null, "[redacted]");
} finally {
  if (previousDefinition === undefined) {
    delete globalThis.__riddleProofContract;
  } else {
    globalThis.__riddleProofContract = previousDefinition;
  }
  if (previousWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = previousWindow;
  }
  if (previousLocation === undefined) {
    delete globalThis.location;
  } else {
    globalThis.location = previousLocation;
  }

  // cleanup intentionally no-op for this smoke test.
}
