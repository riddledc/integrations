import assert from "node:assert/strict";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, parse } from "node:path";

import {
  approvedPrivateDirectoryRecordIssue,
  prepareApprovedOutputRoot,
  validateApprovedOutputRootPath,
} from "../examples/private-workbench-transfer/admin/provision.mjs";

const temporaryRoot = realpathSync(
  mkdtempSync(join(tmpdir(), "riddle-proof-provisioning-safety-")),
);

function mode(filename) {
  return lstatSync(filename).mode & 0o777;
}

function makeExistingOutput(filename, rootMode = 0o700) {
  mkdirSync(filename, { mode: 0o700 });
  mkdirSync(join(filename, "machine"), { mode: 0o700 });
  mkdirSync(join(filename, "privileged"), { mode: 0o700 });
  chmodSync(filename, rootMode);
}

try {
  const workbenchRoot = join(temporaryRoot, "company", "workbench");
  const outputContainer = join(temporaryRoot, "company", "outputs");
  mkdirSync(workbenchRoot, { recursive: true, mode: 0o700 });
  mkdirSync(outputContainer, { recursive: true, mode: 0o700 });
  chmodSync(join(temporaryRoot, "company"), 0o700);
  chmodSync(workbenchRoot, 0o700);
  chmodSync(outputContainer, 0o700);

  const filesystemRoot = parse(temporaryRoot).root;
  const rootModeBefore = mode(filesystemRoot);
  assert.throws(() => prepareApprovedOutputRoot({
    approved_output_root: filesystemRoot,
    workbench_root: workbenchRoot,
  }), /filesystem or broad root/u);
  assert.equal(mode(filesystemRoot), rootModeBefore,
    "hostile filesystem-root validation must be non-mutating");
  assert.throws(() => validateApprovedOutputRootPath({
    approved_output_root: join(filesystemRoot, "tmp"),
    workbench_root: workbenchRoot,
  }), /filesystem or broad root/u);
  assert.throws(() => validateApprovedOutputRootPath({
    approved_output_root: join(workbenchRoot, "private-output"),
    workbench_root: workbenchRoot,
  }), /must not overlap/u);

  const newOutput = join(outputContainer, "new-riddle-proof-output");
  assert.equal(prepareApprovedOutputRoot({
    approved_output_root: newOutput,
    workbench_root: workbenchRoot,
  }), newOutput);
  assert.equal(mode(newOutput), 0o700);
  assert.equal(mode(join(newOutput, "machine")), 0o700);
  assert.equal(mode(join(newOutput, "privileged")), 0o700);

  const preservedReceipt = join(newOutput, "machine", "receipt.json");
  writeFileSync(preservedReceipt, "{}\n", { mode: 0o600 });
  prepareApprovedOutputRoot({
    approved_output_root: newOutput,
    workbench_root: workbenchRoot,
  });
  assert.equal(readFileSync(preservedReceipt, "utf8"), "{}\n",
    "a valid existing dedicated output must be accepted without rewriting its contents");

  const wrongMode = join(outputContainer, "wrong-mode-output");
  makeExistingOutput(wrongMode, 0o755);
  assert.throws(() => prepareApprovedOutputRoot({
    approved_output_root: wrongMode,
    workbench_root: workbenchRoot,
  }), /admin-owned 0700/u);
  assert.equal(mode(wrongMode), 0o755,
    "an existing wrong-mode directory must be rejected without chmod");

  const sharedOutput = join(outputContainer, "shared-output");
  makeExistingOutput(sharedOutput, 0o770);
  assert.throws(() => prepareApprovedOutputRoot({
    approved_output_root: sharedOutput,
    workbench_root: workbenchRoot,
  }), /admin-owned 0700/u);
  assert.equal(mode(sharedOutput), 0o770,
    "an existing shared directory must be rejected without chmod");

  const symlinkTarget = join(outputContainer, "symlink-target");
  const symlinkOutput = join(outputContainer, "symlink-output");
  makeExistingOutput(symlinkTarget);
  symlinkSync(symlinkTarget, symlinkOutput);
  assert.throws(() => prepareApprovedOutputRoot({
    approved_output_root: symlinkOutput,
    workbench_root: workbenchRoot,
  }), /admin-owned 0700/u);

  const unexpectedLayout = join(outputContainer, "unexpected-layout");
  makeExistingOutput(unexpectedLayout);
  writeFileSync(join(unexpectedLayout, "unrelated.txt"), "do not touch\n", { mode: 0o600 });
  assert.throws(() => prepareApprovedOutputRoot({
    approved_output_root: unexpectedLayout,
    workbench_root: workbenchRoot,
  }), /not a dedicated workbench directory/u);
  assert.equal(readFileSync(join(unexpectedLayout, "unrelated.txt"), "utf8"), "do not touch\n");

  assert.equal(approvedPrivateDirectoryRecordIssue({
    kind: "directory",
    is_symbolic_link: false,
    uid: 9001,
    mode: 0o700,
  }, 9002), "wrong_owner", "a different owner must not count as administrative ownership");

  console.log(JSON.stringify({
    ok: true,
    suite: "private-workbench-provisioning-safety",
    filesystem_root_non_mutating: true,
    broad_roots_rejected: true,
    workbench_overlap_rejected: true,
    new_leaf_only: true,
    existing_wrong_mode_non_mutating: true,
    existing_shared_non_mutating: true,
    existing_symlink_rejected: true,
    existing_layout_exact: true,
    administrative_ownership_required: true,
  }));
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
