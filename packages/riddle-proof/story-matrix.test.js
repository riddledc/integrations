import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const matrix = JSON.parse(readFileSync(new URL("./examples/story-matrices/riddle-proof-bounded-loop.json", import.meta.url), "utf8"));

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

console.log(JSON.stringify({
  ok: true,
  suite: "riddle-proof.story-matrix",
  matrix_id: matrix.matrix_id,
  story_count: stories.length,
  batch_count: batches.size,
}));
