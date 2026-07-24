"use strict";

const { syncBuiltinESMExports } = require("node:module");

function isHostedRiddle(hostname) {
  const normalized = String(hostname ?? "").toLowerCase().replace(/\.$/u, "");
  return normalized === "riddledc.com" || normalized.endsWith(".riddledc.com");
}

function hostnameFromRequest(input, options) {
  if (input instanceof URL) return input.hostname;
  if (typeof input === "string") {
    try {
      return new URL(input).hostname;
    } catch {
      return options?.hostname ?? options?.host;
    }
  }
  return input?.hostname ?? input?.host ?? options?.hostname ?? options?.host;
}

function denyIfHosted(hostname) {
  if (isHostedRiddle(hostname)) {
    throw new Error("RIDDLE_PROOF_TEST_HOSTED_RIDDLE_DENIED");
  }
}

const originalFetch = globalThis.fetch;
if (typeof originalFetch === "function") {
  globalThis.fetch = function hostedRiddleDeniedFetch(input, init) {
    const url = input instanceof Request ? input.url : String(input);
    denyIfHosted(new URL(url).hostname);
    return originalFetch(input, init);
  };
}

for (const module of [require("node:http"), require("node:https")]) {
  const originalRequest = module.request;
  const originalGet = module.get;
  module.request = function hostedRiddleDeniedRequest(input, options, callback) {
    denyIfHosted(hostnameFromRequest(input, options));
    return originalRequest.call(this, input, options, callback);
  };
  module.get = function hostedRiddleDeniedGet(input, options, callback) {
    denyIfHosted(hostnameFromRequest(input, options));
    return originalGet.call(this, input, options, callback);
  };
}

syncBuiltinESMExports();
