import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CTA_AGENT_PROTOCOL_VERSION,
  CTA_MUTATION_KIND,
  CTA_MUTATION_POLICY_DIGEST,
  createCtaAgentChangeExecutor,
  createReviewedFixtureCtaChangeAgent,
  createSubprocessCtaChangeAgent,
} from "../dist/cta-agent.js";
import {
  INITIAL_PRIMARY_CTA,
  REQUESTED_PRIMARY_CTA,
  ctaSourceDigest,
  createImmutableCtaLoopbackPreviewCandidate,
  initialCtaSpecimenSourceBytes,
  requestedCtaSpecimenSourceBytes,
} from "../dist/cta-specimen.js";

const TASK = {
  title: "Change the primary CTA",
  description:
    "Change only the primary CTA copy and destination while preserving the site.",
  requirements: [
    "The primary CTA says View pricing and links to /pricing",
    "The declared routes remain available",
    "The declared responsive layouts remain usable",
    "The captured browser runtime remains clean",
  ],
};

const FINDINGS = [{
  requirement_id: "primary-cta-correct",
  label: "The requested primary CTA is present",
  explanation: "The current primary CTA does not match the request.",
  repair_guidance:
    "Change only the primary CTA text and destination.",
}];

function sourceBytesEqual(left, right) {
  return (
    left.byteLength === right.byteLength
    && left.every((byte, index) => byte === right[index])
  );
}

test("the reviewed fixture agent produces only the exact app-owned CTA revision", async () => {
  const executor = createCtaAgentChangeExecutor({
    agent: createReviewedFixtureCtaChangeAgent(),
  });
  const base = initialCtaSpecimenSourceBytes();
  const changed = await executor.change({
    source_bytes: base,
    task: TASK,
    findings: FINDINGS,
  });

  assert.equal(changed.changed_surface, "primary_cta");
  assert.equal(changed.proposal.agent_id, "reviewed-fixture-cta-agent");
  assert.equal(changed.proposal.base_source_digest, ctaSourceDigest(base));
  assert.equal(
    changed.proposal.proposed_source_digest,
    ctaSourceDigest(changed.source_bytes),
  );
  assert.equal(
    changed.proposal.mutation_policy_digest,
    CTA_MUTATION_POLICY_DIGEST,
  );
  assert.notEqual(
    changed.proposal.base_source_digest,
    changed.proposal.proposed_source_digest,
  );
  assert.ok(
    sourceBytesEqual(
      changed.source_bytes,
      requestedCtaSpecimenSourceBytes(),
    ),
  );
});

test("the subprocess protocol gives an external agent no proof authority", async () => {
  const fixturePath = fileURLToPath(
    new URL("./fixtures/cta-agent.mjs", import.meta.url),
  );
  const isolatedCwd = mkdtempSync(
    path.join(tmpdir(), "riddle-cta-agent-"),
  );
  const previousSentinel =
    process.env.RIDDLE_PROOF_SENTINEL_SECRET;
  process.env.RIDDLE_PROOF_SENTINEL_SECRET =
    "must-not-reach-child";
  try {
    const executor = createCtaAgentChangeExecutor({
      agent: createSubprocessCtaChangeAgent({
        agent_id: "external-fixture-agent",
        command: process.execPath,
        cwd: isolatedCwd,
        args: [fixturePath],
        timeout_ms: 10_000,
      }),
    });
    const changed = await executor.change({
      source_bytes: initialCtaSpecimenSourceBytes(),
      task: TASK,
      findings: FINDINGS,
    });
    assert.equal(
      changed.proposal.agent_id,
      "external-fixture-agent",
    );
    assert.equal(
      changed.summary,
      "External fixture agent changed only the requested primary CTA.",
    );
    assert.ok(
      sourceBytesEqual(
        changed.source_bytes,
        requestedCtaSpecimenSourceBytes(),
      ),
    );
  } finally {
    if (previousSentinel === undefined) {
      delete process.env.RIDDLE_PROOF_SENTINEL_SECRET;
    } else {
      process.env.RIDDLE_PROOF_SENTINEL_SECRET =
        previousSentinel;
    }
    rmSync(isolatedCwd, { recursive: true, force: true });
  }
});

test("subprocess stderr cannot enter ordinary agent errors", async () => {
  const isolatedCwd = mkdtempSync(
    path.join(tmpdir(), "riddle-cta-agent-error-"),
  );
  try {
    const executor = createCtaAgentChangeExecutor({
      agent: createSubprocessCtaChangeAgent({
        agent_id: "failing-external-agent",
        command: process.execPath,
        cwd: isolatedCwd,
        args: [
          "-e",
          "process.stdin.resume(); process.stdin.on('end', () => { process.stderr.write('privileged specimen text'); process.exit(7); });",
        ],
        timeout_ms: 10_000,
      }),
    });
    await assert.rejects(
      executor.change({
        source_bytes: initialCtaSpecimenSourceBytes(),
        task: TASK,
        findings: FINDINGS,
      }),
      (error) => {
        assert.match(
          error.message,
          /CTA agent exited unsuccessfully \(7\)/u,
        );
        assert.doesNotMatch(
          error.message,
          /privileged specimen text/u,
        );
        return true;
      },
    );
  } finally {
    rmSync(isolatedCwd, { recursive: true, force: true });
  }
});

test("agent output cannot inject authority, change a different field, or rebind the base", async () => {
  const base = initialCtaSpecimenSourceBytes();
  const cases = [
    {
      name: "authority injection",
      proposal(request) {
        return {
          version: CTA_AGENT_PROTOCOL_VERSION,
          proposal_ref: request.proposal_ref,
          base_source_digest: request.base_source_digest,
          mutation: {
            kind: CTA_MUTATION_KIND,
            text: REQUESTED_PRIMARY_CTA.text,
            href: REQUESTED_PRIMARY_CTA.href,
          },
          summary: "attempted injection",
          contract: { digest: "attacker-selected" },
        };
      },
      expected: /may contain only/u,
    },
    {
      name: "wrong target",
      proposal(request) {
        return {
          version: CTA_AGENT_PROTOCOL_VERSION,
          proposal_ref: request.proposal_ref,
          base_source_digest: request.base_source_digest,
          mutation: {
            kind: CTA_MUTATION_KIND,
            text: "Delete account",
            href: "/pricing",
          },
          summary: "wrong copy",
        };
      },
      expected: /does not match the requested CTA values/u,
    },
    {
      name: "wrong base",
      proposal(request) {
        return {
          version: CTA_AGENT_PROTOCOL_VERSION,
          proposal_ref: request.proposal_ref,
          base_source_digest: `sha256:${"0".repeat(64)}`,
          mutation: {
            kind: CTA_MUTATION_KIND,
            text: REQUESTED_PRIMARY_CTA.text,
            href: REQUESTED_PRIMARY_CTA.href,
          },
          summary: "wrong base",
        };
      },
      expected: /not bound to the exact base source/u,
    },
  ];

  for (const scenario of cases) {
    const executor = createCtaAgentChangeExecutor({
      agent: {
        agent_id: `malicious-${scenario.name}`,
        propose: scenario.proposal,
      },
    });
    await assert.rejects(
      executor.change({
        source_bytes: base,
        task: TASK,
        findings: FINDINGS,
      }),
      scenario.expected,
      scenario.name,
    );
  }
});

test("the agent is not invoked for unrelated findings or a changed base source", async () => {
  let calls = 0;
  const executor = createCtaAgentChangeExecutor({
    agent: {
      agent_id: "must-not-run",
      async propose() {
        calls += 1;
        throw new Error("must not run");
      },
    },
  });
  await assert.rejects(
    executor.change({
      source_bytes: initialCtaSpecimenSourceBytes(),
      task: TASK,
      findings: [{
        ...FINDINGS[0],
        requirement_id: "routes-preserved",
      }],
    }),
    /do not authorize/u,
  );
  await assert.rejects(
    executor.change({
      source_bytes: requestedCtaSpecimenSourceBytes(),
      task: TASK,
      findings: FINDINGS,
    }),
    /outside its exact base revision/u,
  );
  assert.equal(calls, 0);
});

test("the CTA specimen exposes distinct immutable previews with out-of-band proof access", async () => {
  const initial = await createImmutableCtaLoopbackPreviewCandidate({
    candidate_ref: "candidate_0001",
    label: "Initial CTA",
    source_bytes: initialCtaSpecimenSourceBytes(),
  });
  const requested = await createImmutableCtaLoopbackPreviewCandidate({
    candidate_ref: "candidate_0002",
    label: "Requested CTA",
    source_bytes: requestedCtaSpecimenSourceBytes(),
  });
  try {
    assert.notEqual(initial.source_digest, requested.source_digest);
    assert.notEqual(initial.revision, requested.revision);
    assert.notEqual(initial.preview_url, requested.preview_url);

    const initialHtml = await fetch(initial.preview_url)
      .then((response) => response.text());
    assert.match(initialHtml, new RegExp(INITIAL_PRIMARY_CTA.text, "u"));
    assert.match(
      initialHtml,
      new RegExp(`href="${INITIAL_PRIMARY_CTA.href}"`, "u"),
    );

    const requestedHtml = await fetch(requested.preview_url)
      .then((response) => response.text());
    assert.match(
      requestedHtml,
      new RegExp(REQUESTED_PRIMARY_CTA.text, "u"),
    );
    assert.match(
      requestedHtml,
      new RegExp(`href="${REQUESTED_PRIMARY_CTA.href}"`, "u"),
    );
    assert.match(requestedHtml, /data-testid="site-nav"/u);
    assert.equal(
      (requestedHtml.match(/data-proof-route/gu) ?? []).length,
      3,
    );

    const access = await requested.proofTargetAccess();
    assert.equal(new URL(access.target_url).search, "");
    assert.equal((await fetch(access.target_url)).status, 401);
    assert.equal(
      (await fetch(access.target_url, {
        headers: access.extra_http_headers,
      })).status,
      200,
    );
    for (const route of ["/", "/features", "/pricing"]) {
      const response = await fetch(
        new URL(route, access.target_url),
        { headers: access.extra_http_headers },
      );
      assert.equal(response.status, 200, route);
      assert.match(await response.text(), /data-testid="route-page"/u);
    }
    assert.doesNotMatch(
      JSON.stringify({
        candidate_ref: requested.candidate_ref,
        label: requested.label,
        source_digest: requested.source_digest,
        revision: requested.revision,
        preview_url: requested.preview_url,
      }),
      new RegExp(
        access.extra_http_headers["x-riddle-preview-run"],
        "u",
      ),
    );
  } finally {
    await initial.close();
    await requested.close();
  }
});
