import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createRiddleProofRuleTrustRoot } from "@riddledc/riddle-proof-core/rule-trust-root";

import { canonicalJson } from "../shared/integrity.mjs";

function parseArgs(argv) {
  const flags = [
    "--definitions", "--trust-root-id", "--trust-root-version", "--bundle-out",
    "--reference-out", "--packet-rule-out",
  ];
  const result = new Map();
  if (argv.length !== flags.length * 2) throw new Error("invalid arguments");
  for (let index = 0; index < argv.length; index += 2) {
    if (!flags.includes(argv[index]) || result.has(argv[index])) throw new Error("invalid arguments");
    result.set(argv[index], argv[index + 1]);
  }
  if (result.size !== flags.length) throw new Error("missing arguments");
  return result;
}

function safeWrite(filename, value) {
  writeFileSync(filename, `${canonicalJson(value)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(filename, 0o600);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const definitions = JSON.parse(readFileSync(resolve(args.get("--definitions")), "utf8"));
  if (!definitions || definitions.version !== "riddle-proof.rule-definitions.v1"
    || !Array.isArray(definitions.rules) || definitions.rules.length < 1) {
    throw new Error("invalid rule definitions");
  }
  const created = createRiddleProofRuleTrustRoot({
    trust_root_id: args.get("--trust-root-id"),
    trust_root_version: args.get("--trust-root-version"),
    rule_definitions: definitions.rules,
  });
  if (!created.ok) throw new Error("rule trust root creation failed");
  const packetRule = created.bundle.rules.find((rule) => (
    rule.rule_id === "riddle-proof.amendment-review-packet-complete.procedural"
    && rule.rule_version === "1"
  ));
  if (!packetRule) throw new Error("packet-complete rule absent");
  const { definition: _definition, ...packetRuleRef } = packetRule;
  safeWrite(resolve(args.get("--bundle-out")), created.bundle);
  safeWrite(resolve(args.get("--reference-out")), created.trust_root);
  safeWrite(resolve(args.get("--packet-rule-out")), packetRuleRef);
  process.stdout.write(`${JSON.stringify({ ok: true, code: "RULE_TRUST_ROOT_CREATED" })}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write(`${JSON.stringify({ ok: false, code: "RULE_TRUST_ROOT_CREATION_FAILED" })}\n`);
    process.exitCode = 1;
  });
}
