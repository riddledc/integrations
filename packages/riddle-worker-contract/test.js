import fs from "node:fs";
import path from "node:path";
import { isRiddleRunnerManifest, isRiddleWorkerJobV2 } from "./dist/index.js";

const sampleJob = {
  job_id: "job_abc123",
  version: 2,
  task: {
    type: "playwright",
    artifact_cid: "cid:example-artifact",
    runtime_requirements: {
      cpu_cores: 1,
      mem_gb: 2,
      timeout_sec: 120,
    },
    io: {
      inputs: [
        { name: "url", cid: "cid:input-1" },
      ],
      output_contract: {
        kind: "json",
      },
    },
    determinism: { level: "stable_fp" },
    verification_rules: { mode: "none" },
    privacy: { policy: "plaintext" },
  },
};

if (!isRiddleWorkerJobV2(sampleJob)) {
  throw new Error("sample job failed contract validation");
}

const invalid = { ...sampleJob, task: { ...sampleJob.task, type: "invalid" } };
if (isRiddleWorkerJobV2(invalid)) {
  throw new Error("invalid task type passed contract validation");
}

const examplesBase = path.resolve(process.cwd(), "../../examples/runners");
const runnerPaths = ["web-to-dataset/runner.json", "playwright-basic/runner.json"].map((relative) => path.join(examplesBase, relative));

const exampleTaskTypes = new Set();

for (const runnerPath of runnerPaths) {
  const payload = JSON.parse(fs.readFileSync(runnerPath, "utf8"));
  if (!isRiddleRunnerManifest(payload)) {
    throw new Error(`invalid runner manifest: ${runnerPath}`);
  }
  for (const taskType of payload.task_types ?? []) {
    exampleTaskTypes.add(taskType);
  }
}

for (const taskType of exampleTaskTypes) {
  const runnerBackedJob = {
    ...sampleJob,
    task: {
      ...sampleJob.task,
      type: taskType,
    },
  };
  if (!isRiddleWorkerJobV2(runnerBackedJob)) {
    throw new Error(`task type ${taskType} is not accepted by riddle worker contract`);
  }
}

console.log("riddle-worker-contract smoke tests passed");
