import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const matrix = JSON.parse(readFileSync(new URL("./examples/story-matrices/riddle-proof-bounded-loop.json", import.meta.url), "utf8"));
const uxCoverageCsv = readFileSync(new URL("./examples/story-matrices/riddle-proof-ux-coverage.csv", import.meta.url), "utf8");

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

for (const batch of ["local-core", "hosted-profile", "reporting", "artifact-publication", "formal-contract"]) {
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
  "rp-story-hosted-proof-view-uses-contract",
  "rp-ux-agent-summary-uses-contract",
  "rp-ux-release-publish-flow",
]) {
  assert.equal(uxIds.has(requiredUxId), true, `UX coverage missing ${requiredUxId}`);
}

console.log(JSON.stringify({
  ok: true,
  suite: "riddle-proof.story-matrix",
  matrix_id: matrix.matrix_id,
  story_count: stories.length,
  batch_count: batches.size,
  ux_coverage_count: uxRows.length,
}));
