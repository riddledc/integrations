import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import * as core from "./dist/index.js";

assert.equal(typeof core.normalizeRiddleProofProfile, "function");
assert.equal(typeof core.createRiddleProofObservationReceipt, "function");
assert.equal(typeof core.composeRiddleProofSemanticCertificateClosures, "function");
assert.equal(typeof core.verifyRiddleProofSignedCaptureBundle, "function");

const capabilities = JSON.parse(readFileSync(new URL("./capabilities.json", import.meta.url), "utf8"));
assert.equal(capabilities.capabilities.network, false);
assert.equal(capabilities.capabilities.filesystem, false);
assert.equal(capabilities.capabilities.hosted_riddle, false);

process.stdout.write(`${JSON.stringify({ ok: true, package: "@riddledc/riddle-proof-core" })}\n`);
