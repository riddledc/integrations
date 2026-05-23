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

export interface RiddleRunnerResourceRequirements {
  cpu_cores: number;
  mem_gb: number;
  timeout_sec: number;
}

export interface RiddleRunnerPlatform {
  os: string;
  arch: string;
}
