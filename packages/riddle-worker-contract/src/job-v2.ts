export type RiddleCid = `cid:${string}`;

export interface RiddleWorkerJobV2 {
  job_id: string;
  version: 2;
  task: RiddleWorkerTask;
  pricing?: RiddleTaskPricing;
  cu_estimate?: RiddleTaskComputeEstimate;
  mapreduce?: RiddleMapReduce;
  metadata?: Record<string, unknown>;
}

export interface RiddleWorkerTask {
  type: "wasm_component" | "playwright" | "container" | "tfjs";
  artifact_cid: RiddleCid;
  entry?: string;
  runtime_requirements: RiddleTaskRuntimeRequirements;
  io: RiddleTaskIO;
  determinism: RiddleTaskDeterminism;
  verification_rules: RiddleTaskVerification;
  privacy: RiddleTaskPrivacy;
  action?: string;
  options?: Record<string, unknown>;
}

export interface RiddleTaskRuntimeRequirements {
  cpu_cores: number;
  mem_gb: number;
  timeout_sec: number;
  wasi_worlds?: string[];
  accelerators?: string[];
}

export interface RiddleTaskInput {
  name: string;
  cid: RiddleCid;
  hint?: string;
}

export interface RiddleTaskOutputContract {
  kind: string;
  schema_cid?: RiddleCid;
  max_bytes?: number;
}

export interface RiddleTaskIO {
  inputs: RiddleTaskInput[];
  output_contract: RiddleTaskOutputContract;
}

export interface RiddleTaskDeterminism {
  level: "strict" | "stable_fp" | "best_effort";
  seed?: string;
  notes?: string;
}

export interface RiddleTaskVerification {
  mode: "none" | "quorum" | "tee" | "zk";
  params?: Record<string, unknown>;
}

export interface RiddleTaskPrivacy {
  policy: "plaintext" | "tee_gated";
  key_policy_cid?: RiddleCid;
}

export interface RiddleTaskPricing {
  model: "fixed" | "market";
  amount?: number;
  currency?: string;
}

export interface RiddleTaskComputeEstimate {
  cpu_ms: number;
  mem_gb_sec?: number;
  bytes_in?: number;
  bytes_out?: number;
}

export interface RiddleMapReduce {
  strategy?: "fanout" | "single";
  reduce_artifact_cid?: RiddleCid;
  combine?: string;
}

function isArrayOf(obj: unknown, validator: (value: unknown) => boolean): boolean {
  return Array.isArray(obj) && obj.every(validator);
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRiddleCid(value: unknown): value is RiddleCid {
  return typeof value === "string" && /^cid:[A-Za-z0-9+=:/._-]+$/.test(value);
}

function isTaskInput(value: unknown): value is RiddleTaskInput {
  return isRecordLike(value)
    && typeof value.name === "string"
    && isRiddleCid(value.cid)
    && (value.hint === undefined || typeof value.hint === "string");
}

function isOutputContract(value: unknown): value is RiddleTaskOutputContract {
  return isRecordLike(value)
    && typeof value.kind === "string"
    && (value.schema_cid === undefined || isRiddleCid(value.schema_cid))
    && (value.max_bytes === undefined || (Number.isFinite(Number(value.max_bytes)) && Number(value.max_bytes) > 0));
}

function isRuntimeRequirements(value: unknown): value is RiddleTaskRuntimeRequirements {
  return isRecordLike(value)
    && Number.isFinite(Number(value.cpu_cores)) && Number(value.cpu_cores) > 0
    && Number.isFinite(Number(value.mem_gb)) && Number(value.mem_gb) > 0
    && Number.isInteger(Number(value.timeout_sec)) && Number(value.timeout_sec) > 0
    && (value.wasi_worlds === undefined || isArrayOf(value.wasi_worlds, (v) => typeof v === "string"))
    && (value.accelerators === undefined || isArrayOf(value.accelerators, (v) => typeof v === "string"));
}

function isTaskIO(value: unknown): value is RiddleTaskIO {
  return isRecordLike(value)
    && isArrayOf(value.inputs, isTaskInput)
    && isOutputContract(value.output_contract);
}

function isTaskDeterminism(value: unknown): value is RiddleTaskDeterminism {
  return isRecordLike(value)
    && ["strict", "stable_fp", "best_effort"].includes(String(value.level))
    && (value.seed === undefined || typeof value.seed === "string")
    && (value.notes === undefined || typeof value.notes === "string");
}

function isTaskVerification(value: unknown): value is RiddleTaskVerification {
  return isRecordLike(value)
    && ["none", "quorum", "tee", "zk"].includes(String(value.mode))
    && (value.params === undefined || isRecordLike(value.params));
}

function isTaskPrivacy(value: unknown): value is RiddleTaskPrivacy {
  return isRecordLike(value)
    && ["plaintext", "tee_gated"].includes(String(value.policy))
    && (value.key_policy_cid === undefined || isRiddleCid(value.key_policy_cid));
}

function isTask(value: unknown): value is RiddleWorkerTask {
  return isRecordLike(value)
    && ["wasm_component", "playwright", "container", "tfjs"].includes(String(value.type))
    && isRiddleCid(value.artifact_cid)
    && (typeof value.entry === "undefined" || typeof value.entry === "string")
    && isRuntimeRequirements(value.runtime_requirements)
    && isTaskIO(value.io)
    && isTaskDeterminism(value.determinism)
    && isTaskVerification(value.verification_rules)
    && isTaskPrivacy(value.privacy)
    && (typeof value.action === "undefined" || typeof value.action === "string")
    && (value.options === undefined || isRecordLike(value.options));
}

export function isRiddleWorkerJobV2(value: unknown): value is RiddleWorkerJobV2 {
  return isRecordLike(value)
    && typeof value.job_id === "string"
    && Number(value.version) === 2
    && isTask(value.task)
    && (value.pricing === undefined || isRecordLike(value.pricing))
    && (value.cu_estimate === undefined || isRecordLike(value.cu_estimate))
    && (value.mapreduce === undefined || isRecordLike(value.mapreduce))
    && (value.metadata === undefined || isRecordLike(value.metadata));
}
