import path from "node:path";
import { fileURLToPath } from "node:url";

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;

const request = JSON.parse(input);
const serialized = JSON.stringify(request);
const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url));
if (
  /\b(?:contract|profile|disposition|current_check|audit|nonce|signature|proof_id)\b/iu
    .test(serialized)
  || process.env.RIDDLE_PROOF_SENTINEL_SECRET !== undefined
  || process.cwd() === fixtureDirectory
) {
  process.stderr.write("agent received ambient authority\n");
  process.exitCode = 2;
} else {
  process.stdout.write(JSON.stringify({
    version: request.version,
    proposal_ref: request.proposal_ref,
    base_source_digest: request.base_source_digest,
    mutation: {
      kind: request.permitted_mutation,
      text: request.requested_primary_cta.text,
      href: request.requested_primary_cta.href,
    },
    summary:
      "External fixture agent changed only the requested primary CTA.",
  }));
}
