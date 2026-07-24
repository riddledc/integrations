import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  CTA_MUTATION_POLICY_DIGEST,
} from "../dist/cta-agent.js";
import {
  createLocalCtaChangeApplication,
} from "../dist/cta-local-runtime.js";

const ALL_SATISFIED = {
  "primary-cta-correct": "satisfied",
  "routes-preserved": "satisfied",
  "responsive-layout-healthy": "satisfied",
  "runtime-healthy": "satisfied",
};

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const child = path.join(directory, entry.name);
      return entry.isDirectory() ? filesBelow(child) : [child];
    });
}

test("the local CTA runtime rejects permissive, symlinked, and expanded configuration", async () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "riddle-cta-app-boundary-"),
  );
  try {
    const permissive = path.join(root, "permissive");
    mkdirSync(permissive, { mode: 0o755 });
    await assert.rejects(
      createLocalCtaChangeApplication({
        artifacts_directory: permissive,
      }),
      /must not grant group or world permissions/u,
    );

    const privateDirectory = path.join(root, "private");
    mkdirSync(privateDirectory, { mode: 0o700 });
    const linked = path.join(root, "linked");
    symlinkSync(privateDirectory, linked, "dir");
    await assert.rejects(
      createLocalCtaChangeApplication({
        artifacts_directory: linked,
      }),
      /real local directory/u,
    );

    await assert.rejects(
      createLocalCtaChangeApplication({
        artifacts_directory: privateDirectory,
        contract: { digest: "caller-selected" },
      }),
      /accepts only/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a pre-planted candidate artifact symlink cannot redirect a CTA capture", async () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "riddle-cta-app-symlink-"),
  );
  const artifactRoot = path.join(root, "artifacts");
  const escapedRoot = path.join(root, "escaped");
  mkdirSync(artifactRoot, { mode: 0o700 });
  mkdirSync(escapedRoot, { mode: 0o700 });
  const candidateDirectoryName = createHash("sha256")
    .update("candidate_0001")
    .digest("hex");
  symlinkSync(
    escapedRoot,
    path.join(artifactRoot, candidateDirectoryName),
    "dir",
  );
  let application;
  try {
    application = await createLocalCtaChangeApplication({
      artifacts_directory: artifactRoot,
    });
    const outcome = await application.checkCurrent();
    assert.equal(outcome.disposition, "could_not_check");
    assert.equal(outcome.current, false);
    assert.deepEqual(readdirSync(escapedRoot), []);
    assert.deepEqual(
      application.audit(outcome.check_ref).diagnostics,
      [{ code: "report_provider_failed" }],
    );
  } finally {
    await application?.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("the complete local workflow proves fail, bounded agent change, and fresh pass", {
  timeout: 180_000,
}, async () => {
  const artifactRoot = mkdtempSync(
    path.join(os.tmpdir(), "riddle-cta-app-e2e-"),
  );
  chmodSync(artifactRoot, 0o700);
  const attempts = [];
  const proposals = [];
  let application;
  try {
    application = await createLocalCtaChangeApplication({
      artifacts_directory: artifactRoot,
      on_attempt(attempt) {
        attempts.push(structuredClone(attempt));
      },
      on_proposal(proposal) {
        proposals.push(structuredClone(proposal));
      },
    });

    const initialSnapshot = application.snapshot();
    const first = await application.checkCurrent();
    assert.equal(first.disposition, "does_not_conform");
    assert.equal(first.current, true);
    assert.deepEqual(
      first.findings.map(({ requirement_id }) => requirement_id),
      ["primary-cta-correct"],
    );
    assert.deepEqual(attempts[0].statuses, {
      ...ALL_SATISFIED,
      "primary-cta-correct": "failed",
    });
    assert.equal(attempts[0].profile_status, "product_regression");
    assert.equal(attempts[0].sealed_root_id, null);
    const firstAudit = application.audit(first.check_ref);
    assert.equal(firstAudit.verification.status, "verified");
    assert.equal(
      firstAudit.observed_root.claim_id,
      "riddle-proof.browser.cta-status-report",
    );
    assert.notDeepEqual(
      firstAudit.observed_root,
      firstAudit.expected_root,
    );

    const repair = await application.applyRepair();
    const proposal = application.proposalAudit(repair.repair_ref);
    assert.deepEqual(proposals, [proposal]);
    assert.equal(
      proposal.mutation_policy_digest,
      CTA_MUTATION_POLICY_DIGEST,
    );
    assert.equal(
      proposal.from_candidate_ref,
      initialSnapshot.candidate.candidate_ref,
    );
    const changedSnapshot = application.snapshot();
    assert.equal(
      proposal.to_candidate_ref,
      changedSnapshot.candidate.candidate_ref,
    );
    assert.notEqual(
      changedSnapshot.candidate.revision,
      initialSnapshot.candidate.revision,
    );
    assert.notEqual(
      changedSnapshot.candidate.preview_url,
      initialSnapshot.candidate.preview_url,
    );
    assert.equal(changedSnapshot.current_check, null);
    assert.equal(changedSnapshot.history.length, 1);

    const second = await application.checkCurrent();
    assert.equal(second.disposition, "conforms");
    assert.equal(second.current, true);
    assert.deepEqual(second.findings, []);
    assert.deepEqual(attempts[1].statuses, ALL_SATISFIED);
    assert.equal(attempts[1].profile_status, "passed");
    assert.notEqual(attempts[1].sealed_root_id, null);
    const secondAudit = application.audit(second.check_ref);
    assert.equal(secondAudit.verification.status, "verified");
    assert.equal(
      secondAudit.observed_root.claim_id,
      "riddle-proof.browser.sealed-profile-satisfied",
    );
    assert.deepEqual(
      secondAudit.observed_root,
      secondAudit.expected_root,
    );
    assert.notEqual(
      firstAudit.subject.digest,
      secondAudit.subject.digest,
    );
    assert.equal(
      application.audit(first.check_ref).disposition,
      "does_not_conform",
      "the failed proof remains immutable history and is not reused",
    );

    const authorityPath = path.join(
      artifactRoot,
      "run-authority.json",
    );
    assert.equal(statSync(authorityPath).mode & 0o777, 0o600);
    const authority = JSON.parse(
      readFileSync(authorityPath, "utf8"),
    );
    assert.match(authority.contract.digest, /^sha256:[0-9a-f]{64}$/u);
    assert.equal(
      authority.collector.collector_id,
      "@riddledc/riddle-proof-runner-playwright",
    );
    assert.equal(
      Object.hasOwn(authority.signing_key, "private_key_pkcs8_base64"),
      false,
    );

    const retainedFiles = filesBelow(artifactRoot);
    assert.equal(
      retainedFiles.filter(
        (file) => path.basename(file) === "grounded-capture-bundle.json",
      ).length,
      2,
    );
    for (const file of retainedFiles) {
      assert.equal(
        statSync(file).mode & 0o777,
        0o600,
        `${path.relative(artifactRoot, file)} is private`,
      );
      if (/\.(?:json|md)$/u.test(file)) {
        assert.doesNotMatch(
          readFileSync(file, "utf8"),
          new RegExp(artifactRoot.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"),
          `${path.relative(artifactRoot, file)} is portable`,
        );
      }
    }
    const observations = retainedFiles
      .filter(
        (file) => path.basename(file) === "observation-receipt.json",
      )
      .map((file) => JSON.parse(readFileSync(file, "utf8")));
    assert.equal(observations.length, 2);
    assert.ok(observations.every(
      ({ publication }) =>
        publication.kind === "local" && publication.path === ".",
    ));
    const persistedBundles = retainedFiles
      .filter(
        (file) => path.basename(file) === "grounded-capture-bundle.json",
      )
      .map((file) => JSON.parse(readFileSync(file, "utf8")));
    assert.ok(persistedBundles.every(({ statement }) =>
      statement.sensor.metadata.observed_url
        === statement.sensor.observed_target
      && statement.sensor.metadata.auxiliary_terminal_url
        .endsWith("/pricing")));
  } finally {
    await application?.close();
    rmSync(artifactRoot, { recursive: true, force: true });
  }
});
