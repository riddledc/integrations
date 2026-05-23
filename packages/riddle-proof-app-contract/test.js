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
  const payload = installRiddleProofContract({
    getState() {
      return {
        route: "/dashboard",
        user: {
          token: "abc-123",
          displayName: "Ada",
        },
        nested: { secret: "s", nested: { api_key: "key" } },
      };
    },
  });

  assert.equal(payload.version, "riddle-proof.app-contract.v1");
  assert.equal(payload.route, "/dashboard");

  const redacted = payload.state;
  if (!redacted || typeof redacted !== "object") {
    throw new Error("Expected contract state payload to exist.");
  }
  assert.ok(redacted && typeof redacted === "object");
  assert.equal(redacted.user && typeof redacted.user === "object" ? redacted.user.token : undefined, "[redacted]");
  assert.equal(redacted.nested && typeof redacted.nested === "object" ? redacted.nested.secret : undefined, "[redacted]");

  const readBack = readRiddleProofContract();
  assert.equal(readBack?.route, "/dashboard");

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
  assert.equal(scrubbed.token, "abcdef");
  assert.equal(scrubbed.nested?.auth_token ?? null, "[redacted]");
  assert.equal(scrubbed.nestedSafe, "value");
  assert.equal(scrubbed.nested?.profile?.api_key, "x");
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
