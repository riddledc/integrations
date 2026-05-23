export interface RiddleArtifact {
  name: string;
  size?: number;
  content_type?: string;
  s3_key?: string;
  url?: string;
  cid?: string;
  checksum?: string;
  metadata?: Record<string, unknown>;
  completed_at?: string;
}
