import fs from "node:fs";
import {
  isRiddleWorkerJobV2,
} from "./dist/job-v2.js";

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

console.log("riddle-worker-contract smoke tests passed");
fs.writeFileSync("/tmp/riddle-worker-contract-test.json", JSON.stringify(sampleJob, null, 2));
