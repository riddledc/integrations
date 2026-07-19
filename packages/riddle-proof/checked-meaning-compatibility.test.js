import assert from "node:assert/strict";
import { createRequire } from "node:module";

import * as core from "../riddle-proof-core/dist/checked-meaning.js";
import * as facadeRoot from "./dist/index.js";
import * as facadeSubpath from "./dist/checked-meaning.js";

const require = createRequire(import.meta.url);
const coreCjs = require("../riddle-proof-core/dist/checked-meaning.cjs");
const facadeRootCjs = require("./dist/index.cjs");
const facadeSubpathCjs = require("./dist/checked-meaning.cjs");

for (const name of [
  "assessRiddleProofCheckedMeaningClosure",
  "createRiddleProofCheckedMeaningRule",
  "createRiddleProofCheckedMeaningAtomicClosure",
  "composeRiddleProofCheckedMeaningClosures",
  "validateRiddleProofCheckedMeaningClosure",
  "replayRiddleProofCheckedMeaningClosure",
  "matchRiddleProofCheckedMeaningClosure",
]) {
  assert.equal(facadeSubpath[name], core[name], `${name} ESM subpath identity`);
  assert.equal(facadeRoot[name], core[name], `${name} ESM root identity`);
  assert.equal(facadeSubpathCjs[name], coreCjs[name], `${name} CJS subpath identity`);
  assert.equal(facadeRootCjs[name], coreCjs[name], `${name} CJS root identity`);
}

console.log("riddle proof checked-meaning facade compatibility passed");
