"use strict";

const { syncBuiltinESMExports } = require("node:module");

function denied() {
  throw new Error("RIDDLE_PROOF_RUNTIME_NETWORK_DENIED");
}

globalThis.fetch = denied;
globalThis.WebSocket = class NetworkDeniedWebSocket {
  constructor() {
    denied();
  }
};

for (const module of [require("node:http"), require("node:https")]) {
  module.request = denied;
  module.get = denied;
}
const net = require("node:net");
for (const name of ["connect", "createConnection", "createServer"]) net[name] = denied;
net.Socket.prototype.connect = denied;
const tls = require("node:tls");
for (const name of ["connect", "createServer"]) tls[name] = denied;
const dns = require("node:dns");
for (const name of Object.keys(dns)) {
  if (typeof dns[name] === "function"
    && (name === "lookup" || name.startsWith("resolve") || name.startsWith("reverse"))) {
    dns[name] = denied;
  }
}
require("node:dgram").createSocket = denied;
syncBuiltinESMExports();
