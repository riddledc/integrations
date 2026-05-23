import { RiddleArtifact } from "./artifact";

export interface RiddleWorkerResult {
  job_id: string;
  success: boolean;
  data?: unknown;
  error?: string;
  artifacts?: RiddleArtifact[] | null;
  completed_at: string;
}
