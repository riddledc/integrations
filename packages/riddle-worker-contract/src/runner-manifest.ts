export interface RiddleRunnerManifest {
  schema: "riddle.runner.manifest@1";
  key: string;
  name: string;
  version: string;
  task_types: string[];
  entry: string;
  env?: Record<string, string>;
  capabilities?: Record<string, unknown>;
  resource_requirements?: RiddleRunnerResourceRequirements;
  platform?: RiddleRunnerPlatform;
  hash?: string;
  checksum?: string;
  created_at?: string;
  updated_at?: string;
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPlatform(value: unknown): boolean {
  return isRecordLike(value)
    && typeof value.os === "string"
    && value.os.trim().length > 0
    && typeof value.arch === "string"
    && value.arch.trim().length > 0;
}

function isResourceRequirements(value: unknown): boolean {
  return isRecordLike(value)
    && Number.isFinite(Number(value.cpu_cores))
    && Number(value.cpu_cores) > 0
    && Number.isFinite(Number(value.mem_gb))
    && Number(value.mem_gb) > 0
    && Number.isInteger(Number(value.timeout_sec))
    && Number(value.timeout_sec) > 0;
}

export function isRiddleRunnerManifest(value: unknown): value is RiddleRunnerManifest {
  return isRecordLike(value)
    && value.schema === "riddle.runner.manifest@1"
    && typeof value.key === "string"
    && value.key.trim().length > 0
    && typeof value.name === "string"
    && value.name.trim().length > 0
    && typeof value.version === "string"
    && value.version.trim().length > 0
    && Array.isArray(value.task_types)
    && value.task_types.every((taskType) => typeof taskType === "string" && taskType.length > 0)
    && typeof value.entry === "string"
    && value.entry.trim().length > 0
    && (value.env === undefined || isRecordLike(value.env))
    && (value.resource_requirements === undefined || isResourceRequirements(value.resource_requirements))
    && (value.platform === undefined || isPlatform(value.platform));
}

export function isRiddleRunnerManifestSchema(value: unknown): value is Pick<RiddleRunnerManifest, "schema" | "key"> {
  return isRecordLike(value) && value.schema === "riddle.runner.manifest@1" && typeof value.key === "string";
}

export interface RiddleRunnerResourceRequirements {
  cpu_cores: number;
  mem_gb: number;
  timeout_sec: number;
}

export interface RiddleRunnerPlatform {
  os: string;
  arch: string;
}
