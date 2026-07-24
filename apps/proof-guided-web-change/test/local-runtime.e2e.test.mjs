import assert from "node:assert/strict";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  createLocalDurableSettingApplication,
} from "../dist/local-runtime.js";
import {
  startProofGuidedWebChangeShell,
} from "../dist/server.js";

function filesBelow(directory) {
  return readdirSync(directory, {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function previewCapabilityHeader(previewUrl) {
  const runToken = new URL(previewUrl).searchParams.get("run");
  assert.match(runToken ?? "", /^[A-Za-z0-9_-]{43}$/u);
  return runToken;
}

async function createTestBrowserSession() {
  const { createPlaywrightBrowserSession } = await import(new URL(
    "../../../packages/riddle-proof-runner-playwright/dist/browser.js",
    import.meta.url,
  ));
  return createPlaywrightBrowserSession({
    browser: "chromium",
    headless: true,
  });
}

test("the local runtime rejects permissive and symlinked artifact roots", async () => {
  const parent = mkdtempSync(
    path.join(tmpdir(), "riddle-proof-web-change-root-policy-"),
  );
  try {
    const permissive = path.join(parent, "permissive");
    mkdirSync(permissive, { mode: 0o700 });
    chmodSync(permissive, 0o755);
    await assert.rejects(
      createLocalDurableSettingApplication({
        artifacts_directory: permissive,
      }),
      /must not grant group or world permissions/u,
    );
    assert.deepEqual(readdirSync(permissive), []);

    const owned = path.join(parent, "owned");
    mkdirSync(owned, { mode: 0o700 });
    const linked = path.join(parent, "linked");
    symlinkSync(owned, linked);
    await assert.rejects(
      createLocalDurableSettingApplication({
        artifacts_directory: linked,
      }),
      /real local directory|symbolic links/u,
    );
    assert.deepEqual(readdirSync(owned), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("the real local app repairs a new candidate and proves it under the unchanged contract", async () => {
  const artifacts = mkdtempSync(
    path.join(tmpdir(), "riddle-proof-web-change-app-"),
  );
  const attempts = [];
  const timestamps = [
    "2026-07-24T13:00:00.000Z",
    "2026-07-24T13:01:00.000Z",
  ];
  let application;
  let shell;
  let browserSession;

  try {
    application = await createLocalDurableSettingApplication({
      artifacts_directory: artifacts,
      now: () => timestamps.shift(),
      on_attempt(attempt) {
        attempts.push(attempt);
      },
    });
    shell = await startProofGuidedWebChangeShell({
      application,
    });
    browserSession = await createTestBrowserSession();
    const page = browserSession.page;
    await page.goto(shell.launch_url);
    const initial = application.snapshot();
    assert.equal(initial.candidate.revision, "Revision 1");
    assert.equal(initial.candidate.attempt, "Attempt 1");
    assert.equal(initial.current_check, null);
    assert.equal(initial.can_check, true);
    assert.doesNotMatch(
      JSON.stringify(initial),
      /\b(?:sha256|nonce|signature|certificate|authority|proof_id)\b/iu,
    );
    assert.doesNotMatch(
      JSON.stringify(initial),
      /\b[0-9a-f]{64}\b/iu,
      "ordinary state hides content-derived revision identities",
    );

    await page.getByRole("button", {
      name: "Check current candidate",
    }).click();
    await page.getByRole("heading", {
      level: 2,
      name: "This candidate is not yet in spec.",
    }).waitFor();
    const failed = application.snapshot().current_check;
    assert.ok(failed);
    assert.equal(failed.disposition, "does_not_conform");
    assert.deepEqual(
      failed.findings.map((finding) => finding.requirement_id),
      [
        "transition_survived_reload",
        "transition_visible_in_fresh_context",
      ],
    );
    assert.ok(failed.non_conclusions.length >= 3);
    assert.ok(
      failed.non_conclusions.some((boundary) =>
        /outside the four pinned browser profiles/u.test(boundary)),
    );
    const failedAudit = application.audit(failed.check_ref);
    assert.equal(
      new URL(failedAudit.expected_root.parameters.target).search,
      "",
      "the semantic proof target contains no live bearer",
    );
    assert.doesNotMatch(
      JSON.stringify(failedAudit),
      /\?run=/u,
      "audit identity must not retain a proof-target bearer",
    );
    assert.equal(
      failedAudit.observed_root.claim_id,
      "riddle-proof.browser.transition-check-report",
    );
    assert.equal(
      failedAudit.expected_root.claim_id,
      "riddle-proof.browser.durable-state-transition-observed",
    );

    await page.getByRole("button", {
      name: "Apply server-backed persistence repair",
    }).click();
    await page.getByRole("status").getByText(
      "The repaired candidate is ready to check.",
    ).waitFor();
    const repaired = application.snapshot();
    const repair = repaired.repair.last;
    assert.ok(repair);
    assert.equal(repaired.candidate.revision, "Revision 2");
    assert.equal(repaired.candidate.attempt, "Attempt 2");
    assert.equal(repaired.current_check, null);
    assert.equal(repaired.history.length, 1);
    assert.equal(repaired.can_check, true);
    assert.equal(repaired.can_repair, false);
    assert.equal(repair.from_candidate_ref, "candidate_0001");
    assert.equal(repair.to_candidate_ref, "candidate_0002");

    const previewOrigin = new URL(repaired.candidate.preview_url).origin;
    const previewMutation = await fetch(
      new URL("/state", repaired.candidate.preview_url),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-riddle-preview-run": previewCapabilityHeader(
            repaired.candidate.preview_url,
          ),
          origin: previewOrigin,
        },
        body: JSON.stringify({
          value: "preview state must not enter the proof attempt",
        }),
      },
    );
    assert.equal(previewMutation.status, 200);

    await page.getByRole("button", {
      name: "Check current candidate",
    }).click();
    await page.getByRole("heading", {
      level: 2,
      name: "This candidate matches the requested change.",
    }).waitFor();
    const passed = application.snapshot().current_check;
    assert.ok(passed);
    assert.equal(passed.disposition, "conforms");
    const passedAudit = application.audit(passed.check_ref);
    assert.equal(
      passedAudit.observed_root.claim_id,
      "riddle-proof.browser.durable-state-transition-observed",
    );
    assert.equal(
      passedAudit.observed_root.claim_id,
      passedAudit.expected_root.claim_id,
    );
    assert.equal(
      passedAudit.contract.digest,
      failedAudit.contract.digest,
      "repair reuses the installed contract",
    );
    assert.notEqual(
      passedAudit.subject.digest,
      failedAudit.subject.digest,
      "the repaired source and preview are a new exact subject",
    );
    assert.notEqual(
      passedAudit.authority.authority_digest,
      failedAudit.authority.authority_digest,
      "the old attempt authority is not reused",
    );
    assert.notEqual(
      passedAudit.proof_id,
      failedAudit.proof_id,
      "the repaired result is a new proof, not a rewritten failure",
    );

    assert.deepEqual(
      attempts.map(({ statuses }) => statuses),
      [
        {
          before: "passed",
          action: "passed",
          reload: "product_regression",
          fresh_context: "product_regression",
        },
        {
          before: "passed",
          action: "passed",
          reload: "passed",
          fresh_context: "passed",
        },
      ],
    );
    const authority = JSON.parse(
      readFileSync(path.join(artifacts, "run-authority.json"), "utf8"),
    );
    assert.equal(
      authority.contract.digest,
      failedAudit.contract.digest,
    );
    assert.equal(
      Object.hasOwn(authority.signing_key, "private_key_pkcs8_base64"),
      false,
      "the private signing key is never retained",
    );
    const artifactFiles = filesBelow(artifacts);
    assert.ok(
      artifactFiles.filter((filename) =>
        filename.endsWith("proof.json")).length >= 8,
      "both four-profile attempts retain their proof artifacts",
    );
    assert.ok(
      artifactFiles.some((filename) =>
        filename.endsWith("normalized-profile.json")),
    );
    assert.ok(
      artifactFiles.some((filename) =>
        filename.endsWith("observation-receipt.json")),
    );
    for (const filename of artifactFiles.filter((entry) =>
      /\.(?:json|md|txt)$/u.test(entry))) {
      const contents = readFileSync(filename, "utf8");
      assert.doesNotMatch(
        contents,
        /http:\/\/127\.0\.0\.1:[0-9]+\/\?run=/u,
        "proof artifacts must not retain a run capability in their target",
      );
      for (const absoluteRoot of new Set([
        artifacts,
        application.artifacts_directory,
      ])) {
        assert.equal(
          contents.includes(absoluteRoot),
          false,
          `${path.relative(artifacts, filename)} must not retain an absolute workstation path`,
        );
      }
      assert.equal(
        lstatSync(filename).mode & 0o077,
        0,
        `${path.relative(artifacts, filename)} must remain private`,
      );
    }
    for (const receiptFilename of artifactFiles.filter((filename) =>
      filename.endsWith("observation-receipt.json"))) {
      const receipt = JSON.parse(readFileSync(receiptFilename, "utf8"));
      assert.deepEqual(receipt.publication, {
        kind: "local",
        path: ".",
      });
    }
  } finally {
    try {
      await browserSession?.browser.close();
    } finally {
      try {
        if (shell) {
          await shell.close();
        } else {
          await application?.close();
        }
      } finally {
        rmSync(artifacts, { recursive: true, force: true });
      }
    }
  }
});
