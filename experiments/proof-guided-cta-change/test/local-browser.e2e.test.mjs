import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { chmodSync, mkdtempSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PINNED_CTA_CHANGE_CONTRACT,
  createLocalCtaBrowserReportProvider,
  createProofGuidedCtaChangeClient,
} from "../dist/src/index.js";

function page(route, corrected) {
  const isHome = route === "/";
  const title = route === "/" ? "Home" : route === "/features"
    ? "Features"
    : "Pricing";
  const cta = corrected
    ? '<a data-testid="primary-cta" href="/pricing">View pricing</a>'
    : '<a data-testid="primary-cta" href="/features">Start now</a>';
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="data:,">
    <title>${title}</title>
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; max-width: 100%; overflow-x: hidden; }
      body { font-family: system-ui, sans-serif; padding: 24px; }
      nav { display: flex; flex-wrap: wrap; gap: 12px; }
      main { width: min(100%, 960px); margin: 32px auto; }
      a { display: inline-block; padding: 10px 14px; }
    </style>
  </head>
  <body>
    <nav data-testid="site-nav">
      <a data-proof-route href="/">Home</a>
      <a data-proof-route href="/features">Features</a>
      <a data-proof-route href="/pricing">Pricing</a>
    </nav>
    <main data-testid="route-page"${isHome
      ? ' data-home="true"'
      : ""}>
      ${isHome ? '<section data-testid="home-page">' : "<section>"}
        <h1>${title}</h1>
        ${isHome ? cta : `<p>${title} route</p>`}
      </section>
    </main>
  </body>
</html>`;
}

async function startSite(corrected) {
  const server = http.createServer((request, response) => {
    const route = new URL(
      request.url ?? "/",
      "http://127.0.0.1",
    ).pathname;
    if (route === "/favicon.ico") {
      response.writeHead(204, { "cache-control": "no-store" });
      response.end();
      return;
    }
    if (!["/", "/features", "/pricing"].includes(route)) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
      return;
    }
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(page(route, corrected));
  });
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    server,
    target: `http://127.0.0.1:${address.port}/`,
  };
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

test("real local browser run proves fail then fresh conforming CTA candidate", {
  timeout: 180_000,
}, async (context) => {
  const initial = await startSite(false);
  const corrected = await startSite(true);
  context.after(async () => {
    await Promise.all([close(initial.server), close(corrected.server)]);
  });

  const artifactRoot = mkdtempSync(
    path.join(os.tmpdir(), "riddle-cta-e2e-"),
  );
  chmodSync(artifactRoot, 0o700);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const attempts = [];
  const provider = createLocalCtaBrowserReportProvider({
    artifacts_directory: artifactRoot,
    signing_key: {
      key_id: "cta-e2e-key",
      private_key_pkcs8_base64: privateKey.export({
        format: "der",
        type: "pkcs8",
      }).toString("base64"),
      public_key_spki_base64: publicKey.export({
        format: "der",
        type: "spki",
      }).toString("base64"),
    },
    collector: {
      collector_id: "cta-e2e-local-playwright",
      collector_version: "1",
      implementation_digest: `sha256:${"8".repeat(64)}`,
    },
    source_for({ candidate }) {
      return {
        repository: candidate.scope.repository,
        git_revision: candidate.scope.revision,
        dirty: false,
        label: "synthetic CTA e2e specimen",
      };
    },
    on_attempt(attempt) {
      attempts.push(attempt);
    },
  });
  const candidates = new Map([
    ["initial", {
      candidate_ref: "initial",
      scope: {
        repository: "synthetic/cta-site",
        revision: "initial-revision",
        environment: "local-e2e",
        target: initial.target,
      },
    }],
    ["corrected", {
      candidate_ref: "corrected",
      scope: {
        repository: "synthetic/cta-site",
        revision: "corrected-revision",
        environment: "local-e2e",
        target: corrected.target,
      },
    }],
  ]);
  const client = createProofGuidedCtaChangeClient({
    contract: PINNED_CTA_CHANGE_CONTRACT,
    candidate_resolver: {
      async resolve({ candidate_ref }) {
        const candidate = candidates.get(candidate_ref);
        if (!candidate) throw new Error("unknown candidate");
        return candidate;
      },
    },
    report_provider: provider,
  });

  const first = await client.check({ candidate_ref: "initial" });
  assert.equal(
    first.disposition,
    "does_not_conform",
    JSON.stringify(client.inspect(first.check_ref, "audit"), null, 2),
  );
  const firstMeaning = client.inspect(first.check_ref, "meaning");
  assert.deepEqual(
    firstMeaning.findings.map(({ requirement_id }) => requirement_id),
    ["primary-cta-correct"],
  );
  assert.match(firstMeaning.next_action, /href is \/pricing/);
  assert.deepEqual(attempts[0].statuses, {
    "primary-cta-correct": "failed",
    "routes-preserved": "satisfied",
    "responsive-layout-healthy": "satisfied",
    "runtime-healthy": "satisfied",
  });
  assert.equal(attempts[0].profile_status, "product_regression");
  assert.equal(attempts[0].sealed_root_id, null);

  const second = await client.check({ candidate_ref: "corrected" });
  assert.equal(
    second.disposition,
    "conforms",
    JSON.stringify(client.inspect(second.check_ref, "audit"), null, 2),
  );
  const secondAudit = client.inspect(second.check_ref, "audit");
  assert.equal(secondAudit.verification.status, "verified");
  assert.equal(secondAudit.observed_root.claim_id,
    "riddle-proof.browser.sealed-profile-satisfied");
  assert.notEqual(attempts[1].sealed_root_id, null);
  assert.deepEqual(attempts[1].statuses, {
    "primary-cta-correct": "satisfied",
    "routes-preserved": "satisfied",
    "responsive-layout-healthy": "satisfied",
    "runtime-healthy": "satisfied",
  });

  assert.equal(
    client.inspect(first.check_ref, "meaning").disposition,
    "does_not_conform",
    "the earlier immutable check remains inspectable",
  );
  assert.notEqual(
    client.inspect(first.check_ref, "audit").subject.digest,
    secondAudit.subject.digest,
  );
});
