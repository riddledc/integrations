import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
} from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assessRiddleProofProfileEvidence,
  createRiddleProofSignedCaptureBundle,
} from "@riddledc/riddle-proof-core";
import {
  createRiddleProofBrowserSealedProtocol,
  runProfileLocal,
} from "@riddledc/riddle-proof-runner-playwright";

import {
  PINNED_CTA_CHANGE_CONTRACT,
  createCtaStatusReport,
  createResolvedCtaCandidate,
  replayCtaStatusReport,
} from "../dist/src/index.js";

const COLLECTOR = {
  collector_id: "cta-status-report-adversarial-test",
  collector_version: "1",
  implementation_digest: `sha256:${"8".repeat(64)}`,
};

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function plusMilliseconds(timestamp, milliseconds) {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function page(route) {
  const title = route === "/"
    ? "Home"
    : route === "/features"
      ? "Features"
      : "Pricing";
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
    <main data-testid="route-page">
      <section${route === "/" ? ' data-testid="home-page"' : ""}>
        <h1>${title}</h1>
        ${route === "/"
          ? '<a data-testid="primary-cta" href="/pricing">View pricing</a>'
          : `<p>${title} route</p>`}
      </section>
    </main>
  </body>
</html>`;
}

async function startSite() {
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
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    });
    response.end(page(route));
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

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeIdleConnections();
    server.closeAllConnections();
  });
}

function artifactsFromBundle(bundle, replacementResult) {
  const inlineById = new Map(
    bundle.inline_artifacts.map((artifact) => [
      artifact.artifact_id,
      artifact,
    ]),
  );
  return bundle.statement.artifacts.map((manifest) => {
    const inline = inlineById.get(manifest.artifact_id);
    assert.ok(inline, `missing inline artifact ${manifest.artifact_id}`);
    return {
      artifact_id: manifest.artifact_id,
      role: manifest.role,
      media_type: manifest.media_type,
      bytes_base64: manifest.artifact_id === "profile-result.json"
        ? Buffer.from(
            JSON.stringify(replacementResult, null, 2),
            "utf8",
          ).toString("base64")
        : inline.bytes_base64,
    };
  });
}

function resultFromBundle(bundle) {
  const manifest = bundle.statement.artifacts.find(
    ({ role }) => role === "derived_result",
  );
  assert.ok(manifest);
  const inline = bundle.inline_artifacts.find(
    ({ artifact_id }) => artifact_id === manifest.artifact_id,
  );
  assert.ok(inline);
  return JSON.parse(
    Buffer.from(inline.bytes_base64, "base64").toString("utf8"),
  );
}

function bindPrimaryTargetSensor({
  bundle,
  target,
  privateKeyBase64,
}) {
  const result = createRiddleProofSignedCaptureBundle({
    scope: bundle.statement.scope,
    nonce: bundle.statement.nonce,
    captured_at: bundle.statement.captured_at,
    collector: bundle.statement.collector,
    sensor: {
      ...bundle.statement.sensor,
      observed_target: target,
      metadata: {
        ...bundle.statement.sensor.metadata,
        requested_url: target,
        observed_url: target,
        auxiliary_terminal_url:
          bundle.statement.sensor.metadata?.observed_url,
      },
    },
    verifier: bundle.statement.verifier,
    artifacts: artifactsFromBundle(bundle, resultFromBundle(bundle)),
    signing_key: {
      key_id: bundle.provenance.key_id,
      private_key_pkcs8_base64: privateKeyBase64,
    },
  });
  assert.equal(
    result.ok,
    true,
    result.ok ? undefined : result.error.message,
  );
  return result.bundle;
}

function resignResult({
  bundle,
  result,
  privateKeyBase64,
}) {
  const created = createRiddleProofSignedCaptureBundle({
    scope: bundle.statement.scope,
    nonce: bundle.statement.nonce,
    captured_at: bundle.statement.captured_at,
    collector: bundle.statement.collector,
    sensor: bundle.statement.sensor,
    verifier: bundle.statement.verifier,
    artifacts: artifactsFromBundle(bundle, result),
    signing_key: {
      key_id: bundle.provenance.key_id,
      private_key_pkcs8_base64: privateKeyBase64,
    },
  });
  assert.equal(
    created.ok,
    true,
    created.ok ? undefined : created.error.message,
  );
  return created.bundle;
}

function authorityFor({
  bundle,
  publicKeyBytes,
  publicKeyBase64,
  verificationTime,
}) {
  return {
    policy: {
      expected_scope: bundle.statement.scope,
      expected_nonce: bundle.statement.nonce,
      expected_collector: bundle.statement.collector,
      expected_sensor: bundle.statement.sensor,
      expected_verifier: bundle.statement.verifier,
      expected_signer: {
        key_id: bundle.provenance.key_id,
        public_key_spki_sha256: sha256(publicKeyBytes),
      },
      verification_time: verificationTime,
      max_capture_age_ms: 10 * 60 * 1000,
      max_future_skew_ms: 0,
      required_artifact_roles: [
        "profile_contract",
        "derived_result",
      ],
    },
    trusted_signers: [{
      key_id: bundle.provenance.key_id,
      public_key_spki_base64: publicKeyBase64,
    }],
  };
}

function createReport({
  bundle,
  authority,
  scope,
  profileName,
  profileDigest,
  rootIssuedAt,
}) {
  return createCtaStatusReport({
    bundle,
    authority,
    expected_scope: scope,
    expected_profile_name: profileName,
    expected_profile_digest: profileDigest,
    root_issued_at: rootIssuedAt,
  });
}

function replayReport(fixture, overrides = {}) {
  return replayCtaStatusReport({
    checked_closure: jsonClone(fixture.report.checked_closure),
    authority: jsonClone(fixture.authority),
    expected_root_certificate_id:
      fixture.report.root_certificate.certificate_id,
    expected_scope: jsonClone(fixture.scope),
    expected_profile_name: fixture.profileName,
    expected_profile_digest: fixture.profileDigest,
    ...overrides,
  });
}

function assertRejected(result, message) {
  assert.equal(result.ok, false, message);
}

async function createFixture() {
  const site = await startSite();
  const artifactRoot = mkdtempSync(
    path.join(os.tmpdir(), "riddle-cta-status-adversarial-"),
  );
  chmodSync(artifactRoot, 0o700);
  try {
    return await createFixtureFrom(site, artifactRoot);
  } catch (error) {
    await closeServer(site.server);
    rmSync(artifactRoot, { recursive: true, force: true });
    throw error;
  }
}

async function createFixtureFrom(site, artifactRoot) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyBytes = privateKey.export({
    format: "der",
    type: "pkcs8",
  });
  const publicKeyBytes = publicKey.export({
    format: "der",
    type: "spki",
  });
  const candidate = createResolvedCtaCandidate({
    contract: PINNED_CTA_CHANGE_CONTRACT,
    candidate_ref: "cta-status-adversarial-candidate",
    scope: {
      repository: "synthetic/cta-status-adversarial",
      revision: "revision-1",
      environment: "local-test",
      target: site.target,
    },
  });
  const normalizedProfile = candidate.profile.normalized_profile;
  const profileDigest = candidate.profile.profile_digest;
  const scope = candidate.scope;
  const protocolResult = createRiddleProofBrowserSealedProtocol({
    expected_scope: scope,
    expected_profile_name: normalizedProfile.name,
    expected_profile_digest: profileDigest,
  });
  assert.equal(
    protocolResult.ok,
    true,
    protocolResult.ok ? undefined : protocolResult.error.message,
  );
  const nonce = Buffer.alloc(32, 7).toString("base64url");
  const output = await runProfileLocal({
    profile: normalizedProfile,
    outputDir: artifactRoot,
    url: site.target,
    source: {
      repository: scope.repository,
      git_revision: scope.revision,
      dirty: false,
      label: "CTA status adversarial fixture",
    },
    groundedCapture: {
      scope,
      nonce,
      collector: COLLECTOR,
      verifier: protocolResult.protocol.verifier.verifier_ref,
      signingKey: {
        key_id: "cta-status-adversarial-key",
        private_key_pkcs8_base64: privateKeyBytes.toString("base64"),
      },
    },
  });
  assert.ok(
    output.groundedCaptureBundle,
    output.groundedCaptureError?.message,
  );
  const profileManifest = output.groundedCaptureBundle.statement.artifacts.find(
    ({ artifact_id }) => artifact_id === "normalized-profile.json",
  );
  assert.ok(profileManifest);
  assert.equal(profileManifest.artifact_digest, profileDigest);
  const bundle = bindPrimaryTargetSensor({
    bundle: output.groundedCaptureBundle,
    target: site.target,
    privateKeyBase64: privateKeyBytes.toString("base64"),
  });
  const verificationTime = plusMilliseconds(
    bundle.statement.captured_at,
    1_000,
  );
  const authority = authorityFor({
    bundle,
    publicKeyBytes,
    publicKeyBase64: publicKeyBytes.toString("base64"),
    verificationTime,
  });
  const rootIssuedAt = plusMilliseconds(verificationTime, 1);
  const report = createReport({
    bundle,
    authority,
    scope,
    profileName: normalizedProfile.name,
    profileDigest,
    rootIssuedAt,
  });
  assert.equal(report.ok, true, report.ok ? undefined : report.error.message);
  return {
    site,
    artifactRoot,
    bundle,
    authority,
    report,
    scope,
    normalizedProfile,
    profileName: normalizedProfile.name,
    profileDigest,
    rootIssuedAt,
    privateKeyBase64: privateKeyBytes.toString("base64"),
  };
}

test("CTA status replay rejects vector, authority, profile, and closure tampering", {
  timeout: 180_000,
}, async (context) => {
  const fixture = await createFixture();
  context.after(async () => {
    await closeServer(fixture.site.server);
    rmSync(fixture.artifactRoot, { recursive: true, force: true });
  });

  await context.test("the untouched exact report replays", () => {
    const replayed = replayReport(fixture);
    assert.equal(
      replayed.ok,
      true,
      replayed.ok ? undefined : replayed.error.message,
    );
    assert.deepEqual(
      Object.fromEntries(Object.entries(replayed.requirements).map(
        ([requirementId, requirement]) => [
          requirementId,
          requirement.status,
        ],
      )),
      {
        "primary-cta-correct": "satisfied",
        "routes-preserved": "satisfied",
        "responsive-layout-healthy": "satisfied",
        "runtime-healthy": "satisfied",
      },
    );
  });

  const exactResult = resultFromBundle(fixture.bundle);
  const vectorMutations = [
    {
      name: "check count",
      mutate(result) {
        result.checks.pop();
      },
    },
    {
      name: "check order",
      mutate(result) {
        [result.checks[0], result.checks[1]] = [
          result.checks[1],
          result.checks[0],
        ];
      },
    },
    {
      name: "check label",
      mutate(result) {
        result.checks[0].label = "substituted setup label";
      },
    },
    {
      name: "check type",
      mutate(result) {
        result.checks[0].type = "selector_visible";
      },
    },
    {
      name: "check status",
      mutate(result) {
        result.checks[0].status = "failed";
      },
    },
  ];
  for (const mutation of vectorMutations) {
    await context.test(
      `a valid signature cannot bless substituted ${mutation.name}`,
      () => {
        const changedResult = jsonClone(exactResult);
        mutation.mutate(changedResult);
        const changedBundle = resignResult({
          bundle: fixture.bundle,
          result: changedResult,
          privateKeyBase64: fixture.privateKeyBase64,
        });
        assertRejected(
          createReport({
            ...fixture,
            bundle: changedBundle,
          }),
          `${mutation.name} must be rejected`,
        );
      },
    );
  }

  await context.test("an explicit partial DOM capture cannot satisfy runtime health", () => {
    const partialEvidence = jsonClone(exactResult.evidence);
    partialEvidence.dom_summary.partial = true;
    const partialResult = assessRiddleProofProfileEvidence(
      fixture.normalizedProfile,
      partialEvidence,
      { runner: "local-playwright" },
    );
    const partialBundle = resignResult({
      bundle: fixture.bundle,
      result: partialResult,
      privateKeyBase64: fixture.privateKeyBase64,
    });
    const partialReport = createReport({
      ...fixture,
      bundle: partialBundle,
    });
    assert.equal(
      partialReport.ok,
      true,
      partialReport.ok ? undefined : partialReport.error.message,
    );
    assert.equal(
      partialReport.requirements["runtime-healthy"].status,
      "unresolved",
    );
    assert.equal(
      partialReport.requirements["runtime-healthy"].diagnostic_code,
      "browser_dom_capture_incomplete",
    );
  });

  await context.test("independent scope and profile substitutions are rejected", () => {
    assertRejected(
      replayReport(fixture, {
        expected_scope: {
          ...jsonClone(fixture.scope),
          revision: "substituted-revision",
        },
      }),
      "scope substitution must be rejected",
    );
    assertRejected(
      replayReport(fixture, {
        expected_profile_name: "substituted-profile",
      }),
      "profile-name substitution must be rejected",
    );
    assertRejected(
      replayReport(fixture, {
        expected_profile_digest: `sha256:${"0".repeat(64)}`,
      }),
      "profile-digest substitution must be rejected",
    );
  });

  await context.test("authority and signer substitutions are rejected", () => {
    const changedAuthority = jsonClone(fixture.authority);
    changedAuthority.policy.expected_nonce =
      Buffer.alloc(32, 9).toString("base64url");
    assertRejected(
      replayReport(fixture, { authority: changedAuthority }),
      "authority substitution must be rejected",
    );

    const { publicKey: attackerPublicKey } =
      generateKeyPairSync("ed25519");
    const changedSigner = jsonClone(fixture.authority);
    changedSigner.trusted_signers[0].public_key_spki_base64 =
      attackerPublicKey.export({
        format: "der",
        type: "spki",
      }).toString("base64");
    assertRejected(
      replayReport(fixture, { authority: changedSigner }),
      "signer substitution must be rejected",
    );
  });

  await context.test("dropped and rewritten requirement leaves are rejected", () => {
    const dropped = jsonClone(fixture.report.checked_closure);
    const certificates =
      dropped.grounded_closure.closure.certificates;
    const leafIndex = certificates.findIndex(
      ({ claim }) =>
        claim.claim_id
          === "riddle-proof.browser.cta-requirement-status",
    );
    assert.notEqual(leafIndex, -1);
    certificates.splice(leafIndex, 1);
    assertRejected(
      replayReport(fixture, { checked_closure: dropped }),
      "a dropped requirement leaf must be rejected",
    );

    const rewritten = jsonClone(fixture.report.checked_closure);
    const leaf = rewritten.grounded_closure.closure.certificates.find(
      ({ claim }) =>
        claim.claim_id
          === "riddle-proof.browser.cta-requirement-status",
    );
    assert.ok(leaf);
    leaf.claim.parameters.status = "failed";
    assertRejected(
      replayReport(fixture, { checked_closure: rewritten }),
      "a rewritten requirement leaf must be rejected",
    );
  });
});
