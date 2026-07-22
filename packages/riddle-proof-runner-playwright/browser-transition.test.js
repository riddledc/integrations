import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

import {
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

function commonProfile(name, setupActions, checks) {
  return {
    version: "riddle-proof.profile.v1",
    name,
    target: {
      viewports: [{ name: "desktop", width: 960, height: 720 }],
      wait_for_selector: "#state-app",
      setup_actions: setupActions,
    },
    checks: [
      { type: "route_loaded", expected_path: "/" },
      { type: "selector_visible", selector: "#state-app" },
      ...checks,
      { type: "no_fatal_console_errors" },
    ],
    artifacts: ["screenshot", "console", "dom_summary", "proof_json"],
    baseline_policy: "invariant_only",
    failure_policy: {
      product_regression: "fail",
      proof_insufficient: "fail",
      environment_blocked: "fail",
    },
  };
}

const transitionId = "browser-transition-marker-7c83";
let persistedValue = "unset";
const server = createServer((request, response) => {
  if (request.method === "POST" && request.url === "/state") {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        persistedValue = String(parsed.value || "");
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ value: persistedValue }));
      } catch {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "invalid_json" }));
      }
    });
    return;
  }
  if (request.method === "GET" && request.url === "/") {
    const initialValue = JSON.stringify(persistedValue);
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
            const result = await fetch('/state', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ value: input.value }),
            });
            const payload = await result.json();
            current.textContent = payload.value;
            document.body.dataset.saved = 'true';
          });
        </script>
      </body></html>`);
    return;
  }
  response.writeHead(404);
  response.end("not found");
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address();
assert.ok(address && typeof address === "object");
const targetUrl = `http://127.0.0.1:${address.port}/`;
const workspace = mkdtempSync(path.join(tmpdir(), "riddle-proof-browser-transition-"));

const beforeProfile = commonProfile(
  "transition-before-state",
  [{ type: "wait_for_text", selector: "#current", text: "unset", timeout_ms: 5_000 }],
  [{ type: "selector_text_visible", selector: "#current", text: "unset" }],
);
const actionProfile = commonProfile(
  "transition-action-and-after",
  [
    { type: "fill", selector: "#value", value: transitionId },
    { type: "click", selector: "#save" },
    { type: "wait_for_text", selector: "#current", text: transitionId, timeout_ms: 5_000 },
  ],
  [{ type: "selector_text_visible", selector: "#current", text: transitionId }],
);
const reloadProfile = commonProfile(
  "transition-reload-readback",
  [
    { type: "clear_storage", storage: "both", reload: true },
    { type: "wait_for_text", selector: "#current", text: transitionId, timeout_ms: 5_000 },
  ],
  [{ type: "selector_text_visible", selector: "#current", text: transitionId }],
);
const freshProfile = commonProfile(
  "transition-fresh-context-readback",
  [{ type: "wait_for_text", selector: "#current", text: transitionId, timeout_ms: 5_000 }],
  [{ type: "selector_text_visible", selector: "#current", text: transitionId }],
);

const scope = {
  repository: "https://github.com/riddledc/integrations.git",
  revision: "browser-transition-e2e-revision",
  environment: "local-playwright-synthetic-state-server",
  target: targetUrl,
  proof_attempt: transitionId,
};
const profiles = {
  before: {
    profile_name: beforeProfile.name,
    profile_digest: profileDigest(beforeProfile, targetUrl),
  },
  action: {
    profile_name: actionProfile.name,
    profile_digest: profileDigest(actionProfile, targetUrl),
  },
  reload: {
    profile_name: reloadProfile.name,
    profile_digest: profileDigest(reloadProfile, targetUrl),
  },
  fresh_context: {
    profile_name: freshProfile.name,
    profile_digest: profileDigest(freshProfile, targetUrl),
  },
};

const transitionProtocolResult = createRiddleProofBrowserTransitionProtocol({
  expected_scope: scope,
  transition_id: transitionId,
  profiles,
});
assert.equal(
  transitionProtocolResult.ok,
  true,
  transitionProtocolResult.ok ? undefined : transitionProtocolResult.error.message,
);
const transitionProtocol = transitionProtocolResult.protocol;

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

async function captureRole(role, profile, ordinal, protocol = transitionProtocol.sealed_protocols[role]) {
  const nonce = Buffer.alloc(32, ordinal).toString("base64url");
  const output = await runProfileLocal({
    profile,
    url: targetUrl,
    outputDir: path.join(workspace, `${role}-${ordinal}`),
    groundedCapture: {
      scope,
      nonce,
      collector,
      verifier: protocol.verifier.verifier_ref,
      signingKey: {
        key_id: keyId,
        private_key_pkcs8_base64: privateKeyBytes.toString("base64"),
      },
    },
  });
  assert.equal(output.result.status, "passed", JSON.stringify(output.result, null, 2));
  assert.ok(output.groundedCaptureBundle, output.groundedCaptureError?.message);
  const normalizedArtifact = output.groundedCaptureBundle.statement.artifacts.find(
    (artifact) => artifact.artifact_id === "normalized-profile.json",
  );
  assert.equal(normalizedArtifact?.artifact_digest, profileDigest(profile, targetUrl));
  return { role, profile, nonce, output, protocol };
}

function authorityFor(capture, verificationTime) {
  return {
    policy: {
      expected_scope: scope,
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

function createCheckpoint(capture, profileSpec, leafIssuedAt) {
  const authority = authorityFor(capture, leafIssuedAt);
  const created = createRiddleProofBrowserSealedProof({
    bundle: capture.output.groundedCaptureBundle,
    expected_scope: scope,
    expected_profile_name: profileSpec.profile_name,
    expected_profile_digest: profileSpec.profile_digest,
    authority,
    protocol: capture.protocol,
    leaf_issued_at: leafIssuedAt,
    target_issued_at: plusMilliseconds(leafIssuedAt, 1),
    behavior_issued_at: plusMilliseconds(leafIssuedAt, 1),
    root_issued_at: plusMilliseconds(leafIssuedAt, 2),
  });
  assert.equal(created.ok, true, created.ok ? undefined : created.error.message);
  return { ...created, authority };
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
  const beforeCapture = await captureRole("before", beforeProfile, 11);
  const actionCapture = await captureRole("action", actionProfile, 12);
  assert.equal(persistedValue, transitionId, "the visible browser action changed server state");
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

  const weakerFreshProfile = commonProfile(
    freshProfile.name,
    [{ type: "wait_for_selector", selector: "#state-app" }],
    [{ type: "selector_visible", selector: "#current" }],
  );
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

  persistedValue = "unset";
  const lateBeforeCapture = await captureRole("before", beforeProfile, 17);
  persistedValue = transitionId;
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

  console.log("riddle-proof-runner-playwright browser transition tests passed");
} finally {
  await new Promise((resolve) => server.close(resolve));
  rmSync(workspace, { recursive: true, force: true });
}
