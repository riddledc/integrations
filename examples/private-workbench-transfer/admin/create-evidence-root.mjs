import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createRiddleProofEvidenceTrustRoot } from "@riddledc/riddle-proof-core/evidence-trust-root";

import { canonicalJson } from "../shared/integrity.mjs";

function parseArgs(argv) {
  const flags = [
    "--templates", "--trust-root-id", "--trust-root-version", "--bundle-out",
    "--reference-out",
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
  const templates = JSON.parse(readFileSync(resolve(args.get("--templates")), "utf8"));
  if (!templates || templates.version !== "riddle-proof.evidence-profile-templates.v1"
    || !Array.isArray(templates.profile_templates) || templates.profile_templates.length < 1) {
    throw new Error("invalid evidence profile templates");
  }
  const created = createRiddleProofEvidenceTrustRoot({
    trust_root_id: args.get("--trust-root-id"),
    trust_root_version: args.get("--trust-root-version"),
    profile_templates: templates.profile_templates,
  });
  if (!created.ok) throw new Error("evidence trust root creation failed");
  safeWrite(resolve(args.get("--bundle-out")), created.bundle);
  safeWrite(resolve(args.get("--reference-out")), created.trust_root);
  process.stdout.write(`${JSON.stringify({ ok: true, code: "EVIDENCE_TRUST_ROOT_CREATED" })}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write(`${JSON.stringify({ ok: false, code: "EVIDENCE_TRUST_ROOT_CREATION_FAILED" })}\n`);
    process.exitCode = 1;
  });
}
