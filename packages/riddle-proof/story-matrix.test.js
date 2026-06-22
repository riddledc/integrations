import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  summarizeRiddleProofAgentSummarySurface,
  summarizeRiddleProofHostedProofViewSurface,
} from "./dist/public-state.js";

const matrix = JSON.parse(readFileSync(new URL("./examples/story-matrices/riddle-proof-bounded-loop.json", import.meta.url), "utf8"));
const uxCoverageCsv = readFileSync(new URL("./examples/story-matrices/riddle-proof-ux-coverage.csv", import.meta.url), "utf8");
const neutralPublicStateFixtures = JSON.parse(readFileSync(new URL("./examples/story-matrices/riddle-proof-neutral-public-state-fixtures.json", import.meta.url), "utf8"));
const neutralPassProfile = JSON.parse(readFileSync(new URL("./examples/profiles/neutral-fixture-pass.json", import.meta.url), "utf8"));
const neutralRegressionProfile = JSON.parse(readFileSync(new URL("./examples/profiles/neutral-fixture-product-regression.json", import.meta.url), "utf8"));

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        field += "\"";
        index += 1;
        continue;
      }
      if (char === "\"") {
        quoted = false;
        continue;
      }
      field += char;
      continue;
    }
    if (char === "\"") {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (char !== "\r") field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [headers, ...records] = rows.filter((csvRow) => csvRow.some((value) => value.trim()));
  return records.map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] || ""])));
}

assert.equal(matrix.version, "riddle-proof.story-matrix.v1");
assert.equal(matrix.matrix_id, "riddle-proof-bounded-loop-2026-06");
assert.ok(Array.isArray(matrix.operating_rules));
assert.ok(matrix.operating_rules.length >= 3);

const allowedStatuses = new Set(matrix.status_values);
const allowedFailureClasses = new Set(matrix.failure_classes);
const allowedReceiptTypes = new Set(matrix.evidence_receipt_types);
const stories = matrix.stories;
assert.ok(Array.isArray(stories));
assert.ok(stories.length >= 10);

const ids = new Set();
const batches = new Set();
const requiredRecurringStories = new Set([
  "rp-story-cold-start-does-not-duplicate-too-soon",
  "rp-story-local-core-trust-boundary",
  "rp-story-formal-kernel-matches-runtime-contract",
  "rp-story-neutral-fixture-local-pass",
  "rp-story-neutral-fixture-negative-control",
  "rp-story-neutral-fixture-hosted-pass",
  "rp-story-neutral-fixture-hosted-negative-control",
  "rp-story-neutral-fixture-public-state-blockers",
]);

for (const story of stories) {
  assert.equal(typeof story.id, "string", "story id must be a string");
  assert.match(story.id, /^rp-story-[a-z0-9-]+$/, `${story.id} must use the rp-story-* id shape`);
  assert.equal(ids.has(story.id), false, `duplicate story id ${story.id}`);
  ids.add(story.id);

  for (const field of [
    "batch",
    "surface",
    "user_story",
    "expected_behavior",
    "primary_runner",
    "command",
    "expected_verdict",
    "status",
  ]) {
    assert.equal(typeof story[field], "string", `${story.id} missing ${field}`);
    assert.ok(story[field].trim().length > 0, `${story.id} has blank ${field}`);
  }
  batches.add(story.batch);

  assert.equal(allowedStatuses.has(story.status), true, `${story.id} has unknown status ${story.status}`);
  assert.equal(Array.isArray(story.evidence_required), true, `${story.id} evidence_required must be an array`);
  assert.ok(story.evidence_required.length >= 2, `${story.id} needs at least two evidence requirements`);
  assert.equal(Array.isArray(story.receipt_types), true, `${story.id} receipt_types must be an array`);
  assert.ok(story.receipt_types.length > 0, `${story.id} needs at least one receipt type`);
  for (const receiptType of story.receipt_types) {
    assert.equal(allowedReceiptTypes.has(receiptType), true, `${story.id} has unknown receipt type ${receiptType}`);
  }
  assert.equal(Array.isArray(story.failure_classes), true, `${story.id} failure_classes must be an array`);
  assert.ok(story.failure_classes.length > 0, `${story.id} needs at least one failure class`);
  for (const failureClass of story.failure_classes) {
    assert.equal(allowedFailureClasses.has(failureClass), true, `${story.id} has unknown failure class ${failureClass}`);
  }
}

for (const storyId of requiredRecurringStories) {
  assert.equal(ids.has(storyId), true, `required recurring story missing ${storyId}`);
}

for (const batch of ["local-core", "hosted-profile", "reporting", "artifact-publication", "formal-contract", "neutral-fixture"]) {
  assert.equal(batches.has(batch), true, `expected batch missing ${batch}`);
}

const hostedStories = stories.filter((story) => story.primary_runner === "hosted-riddle");
assert.ok(hostedStories.length >= 3, "matrix should keep hosted Riddle stories visible");
assert.ok(hostedStories.some((story) => story.expected_verdict === "product_regression"), "matrix needs at least one hosted negative control");

const uxRows = parseCsv(uxCoverageCsv);
const uxHeaders = uxCoverageCsv.split(/\r?\n/, 1)[0].split(",");
assert.deepEqual(uxHeaders, [
  "area",
  "user_story_id",
  "user_story",
  "expected_behavior",
  "surface",
  "runner",
  "evidence_required",
  "last_result",
  "last_run",
  "artifact_or_pr",
  "finding",
  "next_action",
  "priority",
  "failure_class",
]);
assert.ok(uxRows.length >= 12, "UX coverage should track enough product-experience surfaces");

const allowedUxResults = new Set([
  "passed",
  "product_regression_expected",
  "found_fixed",
  "ready_to_run",
  "needs_product_hook",
  "blocked_external",
]);
const allowedPriorities = new Set(["P0", "P1", "P2", "P3"]);
const storyIds = new Set(stories.map((story) => story.id));
const uxIds = new Set();
for (const row of uxRows) {
  assert.match(row.user_story_id, /^rp-(story|ux)-[a-z0-9-]+$/, `${row.user_story_id} must use a stable rp-* id`);
  assert.equal(uxIds.has(row.user_story_id), false, `duplicate UX row ${row.user_story_id}`);
  uxIds.add(row.user_story_id);
  for (const field of ["area", "user_story", "expected_behavior", "surface", "runner", "evidence_required", "last_result", "finding", "next_action", "priority", "failure_class"]) {
    assert.ok(row[field].trim(), `${row.user_story_id} missing ${field}`);
  }
  assert.equal(allowedUxResults.has(row.last_result), true, `${row.user_story_id} has unknown result ${row.last_result}`);
  assert.equal(allowedPriorities.has(row.priority), true, `${row.user_story_id} has unknown priority ${row.priority}`);
  assert.equal(allowedFailureClasses.has(row.failure_class), true, `${row.user_story_id} has unknown failure class ${row.failure_class}`);
  if (row.user_story_id.startsWith("rp-story-")) {
    assert.equal(storyIds.has(row.user_story_id), true, `${row.user_story_id} should be present in the bounded story matrix`);
  }
  if (["passed", "product_regression_expected", "found_fixed"].includes(row.last_result)) {
    assert.ok(row.last_run, `${row.user_story_id} with result ${row.last_result} needs last_run`);
    assert.ok(row.artifact_or_pr, `${row.user_story_id} with result ${row.last_result} needs artifact_or_pr`);
  }
}

for (const requiredUxId of [
  "rp-story-pr-comment-renders-only-evidence-backed-status",
  "rp-ux-local-playwright-runner-smoke",
  "rp-ux-hosted-proof-view-contract-passed",
  "rp-ux-hosted-proof-view-contract-product-regression",
  "rp-ux-hosted-proof-view-contract-proof-insufficient",
  "rp-ux-hosted-proof-view-product-renderer-imports-contract",
  "rp-ux-agent-summary-contract-proof-insufficient",
  "rp-ux-agent-summary-contract-environment-blocked",
  "rp-ux-agent-summary-contract-human-review",
  "rp-ux-agent-summary-product-wiring-uses-contract",
  "rp-ux-neutral-fixture-public-state-blockers",
  "rp-ux-neutral-fixture-local-pass",
  "rp-ux-neutral-fixture-negative-control",
  "rp-ux-neutral-fixture-hosted-pass",
  "rp-ux-neutral-fixture-hosted-negative-control",
  "rp-ux-release-publish-flow",
]) {
  assert.equal(uxIds.has(requiredUxId), true, `UX coverage missing ${requiredUxId}`);
}

assert.equal(
  uxRows.some((row) => row.user_story_id === "rp-story-hosted-proof-view-uses-contract"),
  false,
  "hosted proof view coverage should stay split into concrete contract and product-wiring rows",
);
assert.equal(
  uxRows.some((row) => row.user_story_id === "rp-ux-agent-summary-uses-contract"),
  false,
  "agent summary coverage should stay split into concrete contract and product-wiring rows",
);

assert.equal(neutralPassProfile.version, "riddle-proof.profile.v1");
assert.equal(neutralPassProfile.name, "neutral-fixture-pass");
assert.equal(neutralPassProfile.target.route, "/pass.html");
assert.equal(
  neutralPassProfile.checks.some((check) => check.type === "selector_text_absent" && check.text === "Product-specific Riddle docs"),
  true,
  "neutral pass profile should explicitly avoid Riddle-docs-specific copy",
);
assert.equal(neutralRegressionProfile.version, "riddle-proof.profile.v1");
assert.equal(neutralRegressionProfile.name, "neutral-fixture-product-regression");
assert.equal(
  neutralRegressionProfile.checks.some((check) => check.selector === "[data-rp-fixture=\"missing-required-control\"]"),
  true,
  "neutral regression profile should contain the deliberate missing selector",
);

assert.equal(neutralPublicStateFixtures.version, "riddle-proof.neutral-public-state-fixtures.v1");
assert.equal(Array.isArray(neutralPublicStateFixtures.fixtures), true);
assert.ok(neutralPublicStateFixtures.fixtures.length >= 5, "neutral public-state fixture set should cover pass plus blockers");
assert.doesNotMatch(
  JSON.stringify(neutralPublicStateFixtures),
  /riddledc\.com\/docs\/riddle-proof|examples\/riddle-proof/,
  "neutral public-state fixtures should not depend on the Riddle Proof docs target",
);
for (const fixture of neutralPublicStateFixtures.fixtures) {
  assert.match(fixture.id, /^rp-fixture-neutral-[a-z0-9-]+$/, `${fixture.id} must use the neutral fixture id shape`);
  assert.equal(typeof fixture.title, "string", `${fixture.id} missing title`);
  assert.equal(typeof fixture.input, "object", `${fixture.id} missing input`);
  assert.equal(typeof fixture.expected, "object", `${fixture.id} missing expected`);
  assert.ok(String(fixture.input?.target?.url || "").startsWith("https://neutral-fixture.invalid/"), `${fixture.id} should target the neutral fixture origin`);

  for (const surface of [
    summarizeRiddleProofHostedProofViewSurface(fixture.input),
    summarizeRiddleProofAgentSummarySurface(fixture.input),
  ]) {
    assert.ok(["hosted_proof_view", "agent_summary"].includes(surface.kind), `${fixture.id} unexpected surface kind ${surface.kind}`);
    assert.equal(surface.policy_state, fixture.expected.policy_state, `${fixture.id} ${surface.kind} policy_state`);
    assert.equal(surface.result_label, fixture.expected.result_label, `${fixture.id} ${surface.kind} result_label`);
    for (const [claim, expected] of Object.entries(fixture.expected.claims)) {
      assert.equal(surface.claims[claim], expected, `${fixture.id} ${surface.kind} claim ${claim}`);
    }
    assert.equal(surface.handoff.merge_recommendation ?? null, fixture.expected.handoff_merge_recommendation, `${fixture.id} ${surface.kind} merge recommendation`);
    for (const disclosure of fixture.expected.required_disclosures) {
      assert.equal(surface.disclosures.required.includes(disclosure), true, `${fixture.id} ${surface.kind} missing disclosure ${disclosure}`);
    }
    for (const prohibitedClaim of fixture.expected.prohibited_claims) {
      assert.equal(surface.disclosures.prohibited_claims.includes(prohibitedClaim), true, `${fixture.id} ${surface.kind} missing prohibited claim ${prohibitedClaim}`);
    }
  }
}

console.log(JSON.stringify({
  ok: true,
  suite: "riddle-proof.story-matrix",
  matrix_id: matrix.matrix_id,
  story_count: stories.length,
  batch_count: batches.size,
  ux_coverage_count: uxRows.length,
  neutral_fixture_count: neutralPublicStateFixtures.fixtures.length,
}));
