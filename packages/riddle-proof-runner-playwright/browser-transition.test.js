import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  assessRiddleProofCheckedMeaningClosure,
  composeRiddleProofCheckedMeaningClosures,
  explainRiddleProofCheckedMeaningClosure,
  normalizeRiddleProofProfile,
} from "@riddledc/riddle-proof-core";
import {
  RIDDLE_PROOF_BROWSER_TRANSITION_CLAIMS,
  createRiddleProofBrowserSealedProof,
  createRiddleProofBrowserTransition,
  createRiddleProofBrowserTransitionProtocol,
  replayRiddleProofBrowserTransition,
  runProfileLocal,
} from "./dist/index.js";

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const member of Object.values(value)) deepFreeze(member);
  }
  return value;
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function plusMilliseconds(timestamp, milliseconds) {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
}

function maxTimestamp(timestamps) {
  return new Date(Math.max(...timestamps.map((timestamp) => Date.parse(timestamp)))).toISOString();
}

function assertRejected(result, stage) {
  assert.equal(result.ok, false);
  if (stage !== undefined) assert.equal(result.error.stage, stage);
}

function profileDigest(profile, url) {
  const normalized = normalizeRiddleProofProfile(profile, { url });
  return sha256(Buffer.from(JSON.stringify(normalized, null, 2)));
}

const transitionId = "browser-transition-marker-7c83";
const proofSuitePaths = {
  before: new URL(
    "../../experiments/semantic-compaction/browser-transition-suite/before.json",
    import.meta.url,
  ),
  action: new URL(
    "../../experiments/semantic-compaction/browser-transition-suite/action.json",
    import.meta.url,
  ),
  reload: new URL(
    "../../experiments/semantic-compaction/browser-transition-suite/reload.json",
    import.meta.url,
  ),
  fresh_context: new URL(
    "../../experiments/semantic-compaction/browser-transition-suite/fresh-context.json",
    import.meta.url,
  ),
};
const proofSuiteBytes = Object.fromEntries(Object.entries(proofSuitePaths).map(
  ([role, fixtureUrl]) => [role, readFileSync(fixtureUrl)],
));
const proofSuiteRawDigests = Object.fromEntries(Object.entries(proofSuiteBytes).map(
  ([role, bytes]) => [role, sha256(bytes)],
));
const BROWSER_TRANSITION_PROOF_SUITE = deepFreeze(
  Object.fromEntries(Object.entries(proofSuiteBytes).map(
    ([role, bytes]) => [role, JSON.parse(bytes.toString("utf8"))],
  )),
);
const proofSuiteDefinitionDigests = Object.fromEntries(
  Object.entries(BROWSER_TRANSITION_PROOF_SUITE).map(
    ([role, profile]) => [role, sha256(Buffer.from(JSON.stringify(profile)))],
  ),
);
const {
  before: beforeProfile,
  action: actionProfile,
  reload: reloadProfile,
  fresh_context: freshProfile,
} = BROWSER_TRANSITION_PROOF_SUITE;

function createSpecimenServer(behavior) {
  const state = { persistedValue: "unset" };
  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.method === "POST" && request.url === "/state") {
      if (behavior !== "durable") {
        response.writeHead(409, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "persistence_not_supported" }));
        return;
      }
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          state.persistedValue = String(parsed.value || "");
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ value: state.persistedValue }));
        } catch {
          response.writeHead(400, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "invalid_json" }));
        }
      });
      return;
    }
    if (request.method === "GET" && request.url === "/") {
      const initialValue = JSON.stringify(
        behavior === "durable" ? state.persistedValue : "unset",
      );
      const saveImplementation = behavior === "broken"
        ? "document.body.dataset.saved = 'false';"
        : behavior === "transient"
          ? `
            current.textContent = input.value;
            document.body.dataset.saved = 'transient';`
          : `
            const result = await fetch('/state', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ value: input.value }),
            });
            const payload = await result.json();
            current.textContent = payload.value;
            document.body.dataset.saved = 'true';`;
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
      <html><body>
        <main id="state-app">
          <label>Value <input id="value" /></label>
          <button id="save" type="button">Save</button>
          <output id="current"></output>
        </main>
        <script>
          const current = document.querySelector('#current');
          const input = document.querySelector('#value');
          current.textContent = ${initialValue};
          input.value = ${initialValue};
          document.querySelector('#save').addEventListener('click', async () => {
            ${saveImplementation}
          });
        </script>
      </body></html>`);
      return;
    }
    response.writeHead(404);
    response.end("not found");
  });
  return { behavior, server, state };
}

const specimenServers = {
  s0: createSpecimenServer("broken"),
  s1: createSpecimenServer("transient"),
  s2: createSpecimenServer("durable"),
};
await Promise.all(Object.values(specimenServers).map(({ server }) =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  })));

const workspace = mkdtempSync(path.join(tmpdir(), "riddle-proof-browser-transition-"));

function createScenario(name, specimen) {
  const address = specimen.server.address();
  assert.ok(address && typeof address === "object");
  const targetUrl = `http://127.0.0.1:${address.port}/`;
  const scope = {
    repository: "https://github.com/riddledc/integrations.git",
    revision: `browser-transition-e2e-${name}`,
    environment: "local-playwright-synthetic-state-server",
    target: targetUrl,
    proof_attempt: transitionId,
  };
  const profiles = Object.fromEntries(Object.entries(BROWSER_TRANSITION_PROOF_SUITE).map(
    ([role, profile]) => [role, {
      profile_name: profile.name,
      profile_digest: profileDigest(profile, targetUrl),
    }],
  ));
  const protocolResult = createRiddleProofBrowserTransitionProtocol({
    expected_scope: scope,
    transition_id: transitionId,
    profiles,
  });
  assert.equal(
    protocolResult.ok,
    true,
    protocolResult.ok ? undefined : protocolResult.error.message,
  );
  return {
    name,
    profiles,
    scope,
    specimen,
    targetUrl,
    transitionProtocol: protocolResult.protocol,
  };
}

const scenarios = {
  s0: createScenario("s0", specimenServers.s0),
  s1: createScenario("s1", specimenServers.s1),
  s2: createScenario("s2", specimenServers.s2),
};
for (const role of Object.keys(BROWSER_TRANSITION_PROOF_SUITE)) {
  assert.equal(
    new Set(Object.values(scenarios).map(
      (scenario) => scenario.profiles[role].profile_digest,
    )).size,
    3,
    `${role} normalization binds the unchanged fixture to each target URL`,
  );
}
const {
  profiles,
  scope,
  targetUrl,
  transitionProtocol,
} = scenarios.s2;

const leanBrowserTransition = readFileSync(
  new URL(
    "../../formal/riddle-proof-kernel/RiddleProofKernel/BrowserTransition.lean",
    import.meta.url,
  ),
  "utf8",
);
for (const claim of Object.values(RIDDLE_PROOF_BROWSER_TRANSITION_CLAIMS)) {
  assert.ok(
    leanBrowserTransition.includes(`"${claim.claim_id}"`),
    `Lean browser transition uses runtime claim id ${claim.claim_id}`,
  );
}
assert.match(leanBrowserTransition, /ruleVersion := "1"/u);

const repeatedProfileProtocol = createRiddleProofBrowserTransitionProtocol({
  expected_scope: scope,
  transition_id: transitionId,
  profiles: {
    before: profiles.before,
    action: profiles.before,
    reload: profiles.before,
    fresh_context: profiles.before,
  },
});
assertRejected(repeatedProfileProtocol, "profiles_not_independent");

const ungroundedTransitionIdProtocol = createRiddleProofBrowserTransitionProtocol({
  expected_scope: scope,
  transition_id: "arbitrary-unbound-transition-label",
  profiles,
});
assertRejected(ungroundedTransitionIdProtocol, "transition_id_scope");

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyBytes = privateKey.export({ format: "der", type: "pkcs8" });
const publicKeyBytes = publicKey.export({ format: "der", type: "spki" });
const keyId = "browser-transition-e2e-key";
const collector = {
  collector_id: "@riddledc/riddle-proof-runner-playwright",
  collector_version: "browser-transition-e2e",
  implementation_digest: `sha256:${"8".repeat(64)}`,
};

async function captureRole(
  role,
  profile,
  ordinal,
  protocol = transitionProtocol.sealed_protocols[role],
  scenario = scenarios.s2,
  expectedStatus = "passed",
) {
  const nonce = Buffer.alloc(32, ordinal).toString("base64url");
  const output = await runProfileLocal({
    profile,
    url: scenario.targetUrl,
    outputDir: path.join(workspace, `${scenario.name}-${role}-${ordinal}`),
    groundedCapture: {
      scope: scenario.scope,
      nonce,
      collector,
      verifier: protocol.verifier.verifier_ref,
      signingKey: {
        key_id: keyId,
        private_key_pkcs8_base64: privateKeyBytes.toString("base64"),
      },
    },
  });
  assert.equal(output.result.status, expectedStatus, JSON.stringify(output.result, null, 2));
  assert.ok(output.groundedCaptureBundle, output.groundedCaptureError?.message);
  const normalizedArtifact = output.groundedCaptureBundle.statement.artifacts.find(
    (artifact) => artifact.artifact_id === "normalized-profile.json",
  );
  assert.equal(
    normalizedArtifact?.artifact_digest,
    profileDigest(profile, scenario.targetUrl),
  );
  return {
    role,
    profile,
    nonce,
    output,
    protocol,
    scenario,
    scope: scenario.scope,
  };
}

function authorityFor(capture, verificationTime) {
  return {
    policy: {
      expected_scope: capture.scope,
      expected_nonce: capture.nonce,
      expected_collector: collector,
      expected_sensor: capture.output.groundedCaptureBundle.statement.sensor,
      expected_verifier: capture.protocol.verifier.verifier_ref,
      expected_signer: {
        key_id: keyId,
        public_key_spki_sha256: sha256(publicKeyBytes),
      },
      verification_time: verificationTime,
      max_capture_age_ms: 5 * 60 * 1000,
      max_future_skew_ms: 1_000,
      required_artifact_roles: [
        "profile_contract",
        "derived_result",
      ],
    },
    trusted_signers: [{
      key_id: keyId,
      public_key_spki_base64: publicKeyBytes.toString("base64"),
    }],
  };
}

function attemptCheckpoint(capture, profileSpec, leafIssuedAt) {
  const authority = authorityFor(capture, leafIssuedAt);
  const created = createRiddleProofBrowserSealedProof({
    bundle: capture.output.groundedCaptureBundle,
    expected_scope: capture.scope,
    expected_profile_name: profileSpec.profile_name,
    expected_profile_digest: profileSpec.profile_digest,
    authority,
    protocol: capture.protocol,
    leaf_issued_at: leafIssuedAt,
    target_issued_at: plusMilliseconds(leafIssuedAt, 1),
    behavior_issued_at: plusMilliseconds(leafIssuedAt, 1),
    root_issued_at: plusMilliseconds(leafIssuedAt, 2),
  });
  return { authority, created };
}

function createCheckpoint(capture, profileSpec, leafIssuedAt) {
  const attempted = attemptCheckpoint(capture, profileSpec, leafIssuedAt);
  const { created } = attempted;
  assert.equal(created.ok, true, created.ok ? undefined : created.error.message);
  return { ...created, authority: attempted.authority };
}

function checkpointAuthorities(checkpoints) {
  return {
    before: checkpoints.before.authority,
    action: checkpoints.action.authority,
    reload: checkpoints.reload.authority,
    fresh_context: checkpoints.fresh_context.authority,
  };
}

function transitionTrust(protocol) {
  const rule_registry = [
    protocol.sealed_protocols.before.rules.target_confirmed.registration,
    protocol.sealed_protocols.before.rules.behavior_confirmed.registration,
    protocol.sealed_protocols.before.rules.sealed_profile_satisfied.registration,
    protocol.rules.transition_observed.registration,
    protocol.rules.transition_survived_reload.registration,
    protocol.rules.transition_visible_in_fresh_context.registration,
    protocol.rules.durable_state_transition_observed.registration,
  ];
  return {
    rule_registry,
    trusted_rules: rule_registry.map((registration) => ({
      rule_id: registration.rule_id,
      rule_version: registration.rule_version,
      engine: registration.engine,
      implementation_digest: registration.implementation_digest,
    })),
  };
}

try {
  // This is one fixed suite applied to three separately identified browser
  // specimens. S0 cannot update immediately; S1 updates only the live DOM; S2
  // implements the complete durable behavior. Nothing rewrites the profiles
  // between runs.
  const s0ActionCapture = await captureRole(
    "action",
    actionProfile,
    1,
    scenarios.s0.transitionProtocol.sealed_protocols.action,
    scenarios.s0,
    "product_regression",
  );
  const s0ActionAttempt = attemptCheckpoint(
    s0ActionCapture,
    scenarios.s0.profiles.action,
    plusMilliseconds(s0ActionCapture.output.result.captured_at, 1_000),
  );
  assertRejected(
    s0ActionAttempt.created,
    "leaf:riddle-proof.browser.declared-profile-passed",
  );
  assert.match(s0ActionAttempt.created.error.message, /contract rejected/u);

  const s1BeforeCapture = await captureRole(
    "before",
    beforeProfile,
    2,
    scenarios.s1.transitionProtocol.sealed_protocols.before,
    scenarios.s1,
  );
  const s1ActionCapture = await captureRole(
    "action",
    actionProfile,
    3,
    scenarios.s1.transitionProtocol.sealed_protocols.action,
    scenarios.s1,
  );
  const s1ReloadCapture = await captureRole(
    "reload",
    reloadProfile,
    4,
    scenarios.s1.transitionProtocol.sealed_protocols.reload,
    scenarios.s1,
    "product_regression",
  );
  const s1FreshCapture = await captureRole(
    "fresh_context",
    freshProfile,
    5,
    scenarios.s1.transitionProtocol.sealed_protocols.fresh_context,
    scenarios.s1,
    "product_regression",
  );
  const s1TimelineBase = plusMilliseconds(
    maxTimestamp([
      s1BeforeCapture,
      s1ActionCapture,
      s1ReloadCapture,
      s1FreshCapture,
    ].map((capture) => capture.output.result.captured_at)),
    1_000,
  );
  const s1Before = createCheckpoint(
    s1BeforeCapture,
    scenarios.s1.profiles.before,
    s1TimelineBase,
  );
  const s1Action = createCheckpoint(
    s1ActionCapture,
    scenarios.s1.profiles.action,
    plusMilliseconds(s1TimelineBase, 10),
  );
  const s1ReloadAttempt = attemptCheckpoint(
    s1ReloadCapture,
    scenarios.s1.profiles.reload,
    plusMilliseconds(s1TimelineBase, 20),
  );
  const s1FreshAttempt = attemptCheckpoint(
    s1FreshCapture,
    scenarios.s1.profiles.fresh_context,
    plusMilliseconds(s1TimelineBase, 30),
  );
  assertRejected(
    s1ReloadAttempt.created,
    "leaf:riddle-proof.browser.declared-profile-passed",
  );
  assert.match(s1ReloadAttempt.created.error.message, /contract rejected/u);
  assertRejected(
    s1FreshAttempt.created,
    "leaf:riddle-proof.browser.declared-profile-passed",
  );
  assert.match(s1FreshAttempt.created.error.message, /contract rejected/u);

  const s1DurableRootAttempt = createRiddleProofBrowserTransition({
    expected_scope: scenarios.s1.scope,
    transition_id: transitionId,
    profiles: scenarios.s1.profiles,
    protocol: scenarios.s1.transitionProtocol,
    checkpoints: {
      before: s1Before,
      action: s1Action,
      reload: s1Action,
      fresh_context: s1Action,
    },
    authorities: {
      before: s1Before.authority,
      action: s1Action.authority,
      reload: s1Action.authority,
      fresh_context: s1Action.authority,
    },
    transition_issued_at: plusMilliseconds(s1TimelineBase, 15),
    reload_issued_at: plusMilliseconds(s1TimelineBase, 25),
    fresh_context_issued_at: plusMilliseconds(s1TimelineBase, 35),
    root_issued_at: plusMilliseconds(s1TimelineBase, 40),
  });
  assertRejected(s1DurableRootAttempt, "checkpoint:reload");

  specimenServers.s2.state.persistedValue = "unset";
  const beforeCapture = await captureRole("before", beforeProfile, 11);
  const actionCapture = await captureRole("action", actionProfile, 12);
  assert.equal(
    specimenServers.s2.state.persistedValue,
    transitionId,
    "the S2 browser action changed durable server state",
  );
  const reloadCapture = await captureRole("reload", reloadProfile, 13);
  const freshCapture = await captureRole("fresh_context", freshProfile, 14);

  const captures = [beforeCapture, actionCapture, reloadCapture, freshCapture];
  const timelineBase = plusMilliseconds(
    maxTimestamp(captures.map((capture) => capture.output.result.captured_at)),
    1_000,
  );
  const before = createCheckpoint(beforeCapture, profiles.before, timelineBase);
  const action = createCheckpoint(actionCapture, profiles.action, plusMilliseconds(timelineBase, 10));
  const reload = createCheckpoint(reloadCapture, profiles.reload, plusMilliseconds(timelineBase, 20));
  const fresh = createCheckpoint(freshCapture, profiles.fresh_context, plusMilliseconds(timelineBase, 30));

  const checkpoints = { before, action, reload, fresh_context: fresh };
  const creationInput = {
    expected_scope: scope,
    transition_id: transitionId,
    profiles,
    protocol: transitionProtocol,
    checkpoints,
    authorities: checkpointAuthorities(checkpoints),
    transition_issued_at: plusMilliseconds(timelineBase, 15),
    reload_issued_at: plusMilliseconds(timelineBase, 25),
    fresh_context_issued_at: plusMilliseconds(timelineBase, 35),
    root_issued_at: plusMilliseconds(timelineBase, 40),
  };
  const created = createRiddleProofBrowserTransition(creationInput);
  assert.equal(created.ok, true, created.ok ? undefined : created.error.message);
  assert.equal(
    created.root_certificate.claim.claim_id,
    RIDDLE_PROOF_BROWSER_TRANSITION_CLAIMS.durable_state_transition_observed.claim_id,
  );

  const crossSpecimenAction = createRiddleProofBrowserTransition({
    ...creationInput,
    checkpoints: { ...checkpoints, action: s1Action },
    authorities: {
      ...creationInput.authorities,
      action: s1Action.authority,
    },
  });
  assertRejected(crossSpecimenAction, "checkpoint:action");

  const repeatedCheckpoint = createRiddleProofBrowserTransition({
    ...creationInput,
    checkpoints: { before, action: before, reload, fresh_context: fresh },
  });
  assertRejected(repeatedCheckpoint, "checkpoint:action");

  const replayInput = {
    checked_closure: jsonClone(created.checked_closure),
    authorities: jsonClone(creationInput.authorities),
    protocol: jsonClone(transitionProtocol),
    expected_root_certificate_id: created.root_certificate.certificate_id,
    expected_scope: jsonClone(scope),
    transition_id: transitionId,
    profiles: jsonClone(profiles),
  };
  const replayed = replayRiddleProofBrowserTransition(replayInput);
  assert.equal(replayed.ok, true, replayed.ok ? undefined : replayed.error.message);
  assert.equal(replayed.root_certificate.certificate_id, created.root_certificate.certificate_id);

  const duplicateBundleClaim = jsonClone(created.checked_closure);
  const firstBundleId = duplicateBundleClaim.grounded_closure.groundings[0].receipt.bundle_id;
  for (const grounding of duplicateBundleClaim.grounded_closure.groundings) {
    grounding.receipt.bundle_id = firstBundleId;
  }
  assert.equal(
    replayRiddleProofBrowserTransition({
      ...replayInput,
      checked_closure: duplicateBundleClaim,
    }).ok,
    false,
    "final replay rejects a closure that claims one capture bundle supplied every checkpoint",
  );

  const trust = transitionTrust(transitionProtocol);
  const explained = explainRiddleProofCheckedMeaningClosure({
    checked_closure: jsonClone(created.checked_closure),
    replay_contexts: replayed.replay_contexts,
    ...jsonClone(trust),
  });
  assert.equal(explained.ok, true, explained.ok ? undefined : explained.error.message);
  assert.equal(explained.explanation.root_certificate_id, created.root_certificate.certificate_id);
  assert.equal(explained.explanation.grounded_leaf_count, 16);
  assert.equal(explained.explanation.checked_composition_count, 16);
  assert.equal(explained.explanation.node_count, 32);
  assert.equal(explained.explanation.grounded_frontier.length, 16);

  const assessedForApplication = assessRiddleProofCheckedMeaningClosure({
    checked_closure: jsonClone(created.checked_closure),
    replay_contexts: replayed.replay_contexts,
    ...jsonClone(trust),
    consumption_time: plusMilliseconds(timelineBase, 41),
    max_grounded_age_ms: 60 * 60 * 1000,
    max_future_skew_ms: 0,
  });
  assert.equal(
    assessedForApplication.disposition,
    "checked",
    assessedForApplication.disposition === "unresolved"
      ? assessedForApplication.error.message
      : undefined,
  );

  if (process.env.RIDDLE_PROOF_APPLICATION_PROJECTION_INTEGRATION === "1") {
    const [
      application,
      browserExample,
      checkedMeaningExample,
    ] = await Promise.all([
      import("../../experiments/application-projection/dist/src/index.js"),
      import("../../experiments/application-projection/dist/examples/browser-publishing.js"),
      import("../../experiments/application-projection/dist/examples/checked-meaning.js"),
    ]);
    const applicationAuthority = browserExample.createBrowserPublishingAuthority({
      authority_digest: sha256(Buffer.from(JSON.stringify({
        example: "browser-publishing",
        protocol: transitionProtocol,
      }))),
      specification_digest: sha256(Buffer.from(JSON.stringify(transitionProtocol))),
      expected_root_parameters: transitionProtocol.expected_root_claim.parameters,
    });
    const applicationSubject = browserExample.createBrowserPublishingSubject({
      repository: scope.repository,
      revision: scope.revision,
      target: scope.target,
      digest: sha256(Buffer.from(JSON.stringify({ scope, profiles }))),
    });
    const applicationVerification =
      checkedMeaningExample.applicationVerificationFromCheckedMeaning({
        authority: application.applicationAuthorityRef(applicationAuthority),
        specification: applicationAuthority.specification.ref,
        expected_root: applicationAuthority.specification.expected_root,
        subject: applicationSubject,
        replayed_at: plusMilliseconds(timelineBase, 41),
        replay: replayed,
        assessment: assessedForApplication,
        explanation: explained,
        requirement_claims:
          browserExample.BROWSER_PUBLISHING_REQUIREMENT_CLAIMS,
      });
    const projected = application.projectApplicationResult({
      authority: applicationAuthority,
      subject: applicationSubject,
      verification: applicationVerification,
    });
    assert.equal(projected.disposition, "conforms");
    assert.equal(projected.identity.proof_id, created.root_certificate.certificate_id);
    assert.equal(projected.findings.length, 0);
    const meaningView = application.inspectApplicationResult(projected, "meaning");
    const auditView = application.inspectApplicationResult(projected, "audit");
    assert.deepEqual(meaningView.identity, auditView.identity);
    assert.equal(
      auditView.explanation.root_certificate_id,
      created.root_certificate.certificate_id,
    );
    assert.deepEqual(
      auditView.binding.authority,
      application.applicationAuthorityRef(applicationAuthority),
    );
    assert.equal(auditView.explanation.grounded_frontier.length, 16);
  }

  const transitionNodeId = created.branches.transition_observed.certificate.certificate_id;
  const transitionNode = explained.explanation.nodes.find(
    (node) => node.certificate_id === transitionNodeId,
  );
  assert.ok(transitionNode);
  assert.equal(
    explained.explanation.nodes.filter((node) => node.certificate_id === transitionNodeId).length,
    1,
    "the shared transition checkpoint is retained once in the expanded DAG",
  );
  const reloadNode = explained.explanation.nodes.find(
    (node) => node.certificate_id === created.branches.transition_survived_reload.certificate.certificate_id,
  );
  const freshNode = explained.explanation.nodes.find(
    (node) => node.certificate_id === created.branches.transition_visible_in_fresh_context.certificate.certificate_id,
  );
  assert.ok(reloadNode.premise_certificate_ids.includes(transitionNodeId));
  assert.ok(freshNode.premise_certificate_ids.includes(transitionNodeId));

  const replacementFreshCapture = await captureRole("fresh_context", freshProfile, 15);
  const replacementBase = plusMilliseconds(replacementFreshCapture.output.result.captured_at, 1_000);
  const replacementFresh = createCheckpoint(
    replacementFreshCapture,
    profiles.fresh_context,
    replacementBase,
  );
  const selectivelyRecomposed = createRiddleProofBrowserTransition({
    ...creationInput,
    checkpoints: { before, action, reload, fresh_context: replacementFresh },
    authorities: {
      ...creationInput.authorities,
      fresh_context: replacementFresh.authority,
    },
    fresh_context_issued_at: plusMilliseconds(replacementBase, 5),
    root_issued_at: plusMilliseconds(replacementBase, 10),
  });
  assert.equal(
    selectivelyRecomposed.ok,
    true,
    selectivelyRecomposed.ok ? undefined : selectivelyRecomposed.error.message,
  );
  assert.equal(
    selectivelyRecomposed.branches.transition_observed.certificate.certificate_id,
    created.branches.transition_observed.certificate.certificate_id,
  );
  assert.equal(
    selectivelyRecomposed.branches.transition_survived_reload.certificate.certificate_id,
    created.branches.transition_survived_reload.certificate.certificate_id,
  );
  assert.notEqual(
    selectivelyRecomposed.branches.transition_visible_in_fresh_context.certificate.certificate_id,
    created.branches.transition_visible_in_fresh_context.certificate.certificate_id,
  );
  assert.notEqual(
    selectivelyRecomposed.root_certificate.certificate_id,
    created.root_certificate.certificate_id,
  );

  const originalIds = new Set(
    created.checked_closure.grounded_closure.closure.certificates.map(
      (certificate) => certificate.certificate_id,
    ),
  );
  const replacementIds = new Set(
    selectivelyRecomposed.checked_closure.grounded_closure.closure.certificates.map(
      (certificate) => certificate.certificate_id,
    ),
  );
  for (const preserved of [
    before.root_certificate.certificate_id,
    action.root_certificate.certificate_id,
    reload.root_certificate.certificate_id,
    created.branches.transition_observed.certificate.certificate_id,
    created.branches.transition_survived_reload.certificate.certificate_id,
  ]) {
    assert.ok(originalIds.has(preserved) && replacementIds.has(preserved));
  }

  const weakerFreshProfile = {
    ...jsonClone(freshProfile),
    target: {
      ...jsonClone(freshProfile.target),
      setup_actions: [{ type: "wait_for_selector", selector: "#state-app" }],
    },
    checks: [
      { type: "route_loaded", expected_path: "/" },
      { type: "selector_visible", selector: "#state-app" },
      { type: "selector_visible", selector: "#current" },
      { type: "no_fatal_console_errors" },
    ],
  };
  const weakerProfiles = {
    ...profiles,
    fresh_context: {
      profile_name: weakerFreshProfile.name,
      profile_digest: profileDigest(weakerFreshProfile, targetUrl),
    },
  };
  assert.notEqual(weakerProfiles.fresh_context.profile_digest, profiles.fresh_context.profile_digest);
  const weakerProtocolResult = createRiddleProofBrowserTransitionProtocol({
    expected_scope: scope,
    transition_id: transitionId,
    profiles: weakerProfiles,
  });
  assert.equal(weakerProtocolResult.ok, true);
  const weakerCapture = await captureRole(
    "fresh_context",
    weakerFreshProfile,
    16,
    weakerProtocolResult.protocol.sealed_protocols.fresh_context,
  );
  const weakerFresh = createCheckpoint(
    weakerCapture,
    weakerProfiles.fresh_context,
    plusMilliseconds(weakerCapture.output.result.captured_at, 1_000),
  );
  const weakerSubstitution = createRiddleProofBrowserTransition({
    ...creationInput,
    checkpoints: { before, action, reload, fresh_context: weakerFresh },
  });
  assertRejected(weakerSubstitution, "checkpoint:fresh_context");

  const weakerBase = plusMilliseconds(weakerCapture.output.result.captured_at, 1_000);
  const weakerTransition = createRiddleProofBrowserTransition({
    ...creationInput,
    profiles: weakerProfiles,
    protocol: weakerProtocolResult.protocol,
    checkpoints: { before, action, reload, fresh_context: weakerFresh },
    authorities: {
      ...creationInput.authorities,
      fresh_context: weakerFresh.authority,
    },
    fresh_context_issued_at: plusMilliseconds(weakerBase, 5),
    root_issued_at: plusMilliseconds(weakerBase, 10),
  });
  assert.equal(
    weakerTransition.ok,
    true,
    weakerTransition.ok ? undefined : weakerTransition.error.message,
  );
  const falselyClaimedStrongProfileReplay = replayRiddleProofBrowserTransition({
    checked_closure: jsonClone(weakerTransition.checked_closure),
    authorities: jsonClone({
      ...creationInput.authorities,
      fresh_context: weakerFresh.authority,
    }),
    protocol: jsonClone(transitionProtocol),
    expected_root_certificate_id: weakerTransition.root_certificate.certificate_id,
    expected_scope: jsonClone(scope),
    transition_id: transitionId,
    profiles: jsonClone(profiles),
  });
  assert.equal(
    falselyClaimedStrongProfileReplay.ok,
    false,
    "final transition replay rejects a same-name weaker profile presented as the expected profile digest",
  );

  specimenServers.s2.state.persistedValue = "unset";
  const lateBeforeCapture = await captureRole("before", beforeProfile, 17);
  specimenServers.s2.state.persistedValue = transitionId;
  assert.ok(
    Date.parse(lateBeforeCapture.output.groundedCaptureBundle.statement.captured_at)
      > Date.parse(actionCapture.output.groundedCaptureBundle.statement.captured_at),
    "the hostile before observation was signed after the action observation",
  );
  const hostileBase = plusMilliseconds(
    maxTimestamp([
      lateBeforeCapture.output.groundedCaptureBundle.statement.captured_at,
      actionCapture.output.groundedCaptureBundle.statement.captured_at,
      reloadCapture.output.groundedCaptureBundle.statement.captured_at,
      freshCapture.output.groundedCaptureBundle.statement.captured_at,
    ]),
    1_000,
  );
  const lateBefore = createCheckpoint(lateBeforeCapture, profiles.before, hostileBase);
  const earlyAction = createCheckpoint(
    actionCapture,
    profiles.action,
    plusMilliseconds(hostileBase, 10),
  );
  const earlyReload = createCheckpoint(
    reloadCapture,
    profiles.reload,
    plusMilliseconds(hostileBase, 20),
  );
  const earlyFresh = createCheckpoint(
    freshCapture,
    profiles.fresh_context,
    plusMilliseconds(hostileBase, 30),
  );
  const signedChronologyInput = {
    ...creationInput,
    checkpoints: {
      before: lateBefore,
      action: earlyAction,
      reload: earlyReload,
      fresh_context: earlyFresh,
    },
    authorities: checkpointAuthorities({
      before: lateBefore,
      action: earlyAction,
      reload: earlyReload,
      fresh_context: earlyFresh,
    }),
    transition_issued_at: plusMilliseconds(hostileBase, 15),
    reload_issued_at: plusMilliseconds(hostileBase, 25),
    fresh_context_issued_at: plusMilliseconds(hostileBase, 35),
    root_issued_at: plusMilliseconds(hostileBase, 40),
  };
  assertRejected(
    createRiddleProofBrowserTransition(signedChronologyInput),
    "signed_capture_chronology",
  );

  const rawTransitionContexts = [
    ...lateBefore.replay_contexts,
    ...earlyAction.replay_contexts,
  ];
  const rawReloadContexts = [...rawTransitionContexts, ...earlyReload.replay_contexts];
  const rawFreshContexts = [...rawTransitionContexts, ...earlyFresh.replay_contexts];
  const rawRootContexts = [...rawReloadContexts, ...earlyFresh.replay_contexts];
  const rawTransition = composeRiddleProofCheckedMeaningClosures({
    expected_rule: transitionProtocol.rules.transition_observed.rule_ref,
    closures: [lateBefore.checked_closure, earlyAction.checked_closure],
    issued_at: signedChronologyInput.transition_issued_at,
    replay_contexts: rawTransitionContexts,
    ...trust,
  });
  assert.equal(rawTransition.ok, true, rawTransition.ok ? undefined : rawTransition.error.message);
  const rawReload = composeRiddleProofCheckedMeaningClosures({
    expected_rule: transitionProtocol.rules.transition_survived_reload.rule_ref,
    closures: [rawTransition.checked_closure, earlyReload.checked_closure],
    issued_at: signedChronologyInput.reload_issued_at,
    replay_contexts: rawReloadContexts,
    ...trust,
  });
  assert.equal(rawReload.ok, true, rawReload.ok ? undefined : rawReload.error.message);
  const rawFresh = composeRiddleProofCheckedMeaningClosures({
    expected_rule: transitionProtocol.rules.transition_visible_in_fresh_context.rule_ref,
    closures: [rawTransition.checked_closure, earlyFresh.checked_closure],
    issued_at: signedChronologyInput.fresh_context_issued_at,
    replay_contexts: rawFreshContexts,
    ...trust,
  });
  assert.equal(rawFresh.ok, true, rawFresh.ok ? undefined : rawFresh.error.message);
  const rawRoot = composeRiddleProofCheckedMeaningClosures({
    expected_rule: transitionProtocol.rules.durable_state_transition_observed.rule_ref,
    closures: [rawReload.checked_closure, rawFresh.checked_closure],
    issued_at: signedChronologyInput.root_issued_at,
    replay_contexts: rawRootContexts,
    ...trust,
  });
  assert.equal(rawRoot.ok, true, rawRoot.ok ? undefined : rawRoot.error.message);
  assertRejected(
    replayRiddleProofBrowserTransition({
      checked_closure: jsonClone(rawRoot.checked_closure),
      authorities: jsonClone(signedChronologyInput.authorities),
      protocol: jsonClone(transitionProtocol),
      expected_root_certificate_id: rawRoot.certificate.certificate_id,
      expected_scope: jsonClone(scope),
      transition_id: transitionId,
      profiles: jsonClone(profiles),
    }),
    "signed_capture_chronology",
  );

  const backwardsChronology = createRiddleProofBrowserTransition({
    ...creationInput,
    transition_issued_at: plusMilliseconds(timelineBase, 5),
  });
  assertRejected(backwardsChronology, "transition_observed_composition");

  const missingFresh = jsonClone(created.checked_closure);
  missingFresh.grounded_closure.closure.certificates =
    missingFresh.grounded_closure.closure.certificates.filter(
      (certificate) => certificate.certificate_id !== fresh.root_certificate.certificate_id,
    );
  const missingFreshReplay = replayRiddleProofBrowserTransition({
    ...replayInput,
    checked_closure: missingFresh,
  });
  assert.equal(missingFreshReplay.ok, false);

  const wrongScopeReplay = replayRiddleProofBrowserTransition({
    ...replayInput,
    expected_scope: { ...scope, revision: "substituted-revision" },
  });
  assertRejected(wrongScopeReplay, "protocol_trust_root");

  const substitutedRuleProtocol = jsonClone(transitionProtocol);
  substitutedRuleProtocol.rules.transition_observed.registration.definition.label =
    "Substituted browser transition meaning";
  const substitutedRuleReplay = replayRiddleProofBrowserTransition({
    ...replayInput,
    protocol: substitutedRuleProtocol,
  });
  assertRejected(substitutedRuleReplay, "protocol_trust_root");

  assert.deepEqual(
    Object.fromEntries(Object.entries(BROWSER_TRANSITION_PROOF_SUITE).map(
      ([role, profile]) => [role, sha256(Buffer.from(JSON.stringify(profile)))],
    )),
    proofSuiteDefinitionDigests,
    "the deeply frozen proof-suite definitions remain unchanged after all target applications",
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(proofSuitePaths).map(
      ([role, fixtureUrl]) => [role, sha256(readFileSync(fixtureUrl))],
    )),
    proofSuiteRawDigests,
    "the proof-suite fixture bytes remain unchanged after all target applications",
  );

  console.log("riddle-proof-runner-playwright browser transition tests passed");
} finally {
  await Promise.all(Object.values(specimenServers).map(({ server }) =>
    new Promise((resolve) => server.close(resolve))));
  rmSync(workspace, { recursive: true, force: true });
}
