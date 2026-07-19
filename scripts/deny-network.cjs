"use strict";

const { syncBuiltinESMExports } = require("node:module");

function denied() {
  throw new Error("RIDDLE_PROOF_TEST_NETWORK_DENIED");
}

globalThis.fetch = denied;
globalThis.WebSocket = class NetworkDeniedWebSocket {
  constructor() {
    denied();
  }
};

const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const tls = require("node:tls");
const dns = require("node:dns");
const dgram = require("node:dgram");

for (const module of [http, https]) {
  module.request = denied;
  module.get = denied;
}
for (const name of ["connect", "createConnection", "createServer"]) net[name] = denied;
net.Socket.prototype.connect = denied;
for (const name of ["connect", "createServer"]) tls[name] = denied;
for (const name of Object.keys(dns)) {
  if (typeof dns[name] === "function" && (name === "lookup" || name.startsWith("resolve") || name.startsWith("reverse"))) {
    dns[name] = denied;
  }
}
dgram.createSocket = denied;

syncBuiltinESMExports();
