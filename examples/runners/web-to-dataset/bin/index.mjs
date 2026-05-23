#!/usr/bin/env node
/**
 * CLI entry point for the web-to-dataset runner.
 * Called by the lease worker: node bin/index.mjs --job /path/to/job.json
 *
 * Reads a job v2 JSON file, dispatches to the appropriate handler,
 * writes result.json to LOCAL_ARTIFACT_DIR.
 */
import fs from "node:fs";
import path from "node:path";
import { handleTask } from "../index.js";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--job" && argv[i + 1]) {
      args.job = argv[i + 1];
      i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.job) {
    console.error("Usage: node bin/index.mjs --job /path/to/job.json");
    process.exit(1);
  }

  const jobRaw = fs.readFileSync(args.job, "utf-8");
  const job = JSON.parse(jobRaw);

  const task = job.job_v2?.task || job.task;
  if (!task) {
    console.error("Invalid job: no task field found");
    process.exit(1);
  }

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      service: "web-to-dataset-runner",
      message: "Job received",
      job_id: job.job_id || job.job_v2?.job_id,
      task_type: task.type,
      action: task.action,
    })
  );

  const result = await handleTask(task);

  // Write result to LOCAL_ARTIFACT_DIR if available, otherwise to job directory
  const artifactDir =
    process.env.LOCAL_ARTIFACT_DIR || path.dirname(args.job);
  const resultPath = path.join(artifactDir, "result.json");

  fs.writeFileSync(
    resultPath,
    JSON.stringify(
      {
        job_id: job.job_id || job.job_v2?.job_id,
        success: result.success,
        data: result.data,
        error: result.error || undefined,
        completed_at: new Date().toISOString(),
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      service: "web-to-dataset-runner",
      message: "Job completed",
      job_id: job.job_id || job.job_v2?.job_id,
      success: result.success,
      result_path: resultPath,
    })
  );

  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      service: "web-to-dataset-runner",
      message: "Runner crashed",
      error: err.message,
      stack: err.stack,
    })
  );
  process.exit(1);
});
