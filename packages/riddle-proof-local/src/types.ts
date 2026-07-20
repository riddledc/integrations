export const DOCUMENT_SNAPSHOT_RECEIPT_VERSION = "riddle.document-snapshot-receipt.v1" as const;
export const DOCUMENT_SNAPSHOT_VERSION = "riddle.document-snapshot.v1" as const;
export const DOCUMENT_SNAPSHOT_OBSERVATION_VERSION =
  "riddle.document-snapshot-observation.v1" as const;
export const DOCUMENT_SNAPSHOT_CAPTURE_METHOD =
  "stable_file_descriptor_set_pre_read_post_stat.v1" as const;
export const DOCUMENT_SNAPSHOT_CURRENTNESS_VERSION =
  "riddle-proof.snapshot-currentness-witness.v1" as const;

export const DOCUMENT_SNAPSHOT_CURRENTNESS_ERROR_CODES = {
  roleSetMismatch: "selection_role_set_mismatch",
  recaptureFailed: "snapshot_recapture_failed",
} as const;

export type DocumentArtifactPolicy = "digest_only" | "minimal" | "full";

export interface DocumentFileSelection {
  /** Stable client-defined role such as source, working, or rendered. */
  role: string;
  /** Explicit local path. It is never copied into a receipt as an absolute path. */
  path: string;
  mediaType?: string;
}

export type DocumentArtifactReference =
  | { kind: "opaque"; id: string }
  | { kind: "relative"; path: string };

export interface DocumentSnapshotArtifact {
  role: string;
  media_type: string;
  byte_length: number;
  digest: string;
  reference: DocumentArtifactReference;
  source_name?: string;
  content_base64?: string;
}

export interface DocumentSnapshotManifest {
  version: typeof DOCUMENT_SNAPSHOT_VERSION;
  snapshot_id: string;
  manifest_digest: string;
  artifacts: DocumentSnapshotArtifact[];
}

export interface DocumentSnapshotReceipt {
  version: typeof DOCUMENT_SNAPSHOT_RECEIPT_VERSION;
  kind: "document_snapshot";
  receipt_id: string;
  captured_at: string;
  label?: string;
  artifact_policy: DocumentArtifactPolicy;
  capture_method: typeof DOCUMENT_SNAPSHOT_CAPTURE_METHOD;
  source_documents_mutated: false;
  snapshot: DocumentSnapshotManifest;
}

export interface CaptureDocumentSnapshotInput {
  files: [DocumentFileSelection, ...DocumentFileSelection[]];
  artifactPolicy?: DocumentArtifactPolicy;
  /** When supplied, minimal/full receipts may use paths relative to this root. */
  referenceRoot?: string;
  label?: string;
  /** Injectable for reproducible tests. Defaults to the current time. */
  capturedAt?: string;
  /** Per-file limit. Defaults to 64 MiB. */
  maxFileBytes?: number;
}

export interface DocumentSnapshotVerification {
  ok: boolean;
  errors: string[];
}

export interface DocumentSnapshotComparison {
  status: "unchanged" | "changed";
  added_roles: string[];
  removed_roles: string[];
  changed_roles: string[];
}

export interface RecaptureDocumentSnapshotCurrentnessInput {
  expectedReceipt: DocumentSnapshotReceipt;
  files: [DocumentFileSelection, ...DocumentFileSelection[]];
  /** The instant at which the selected sources are reread and compared. */
  checkedAt: string;
  /** Per-file limit. Defaults to 64 MiB. */
  maxFileBytes?: number;
}

export type DocumentSnapshotCurrentnessErrorCode =
  (typeof DOCUMENT_SNAPSHOT_CURRENTNESS_ERROR_CODES)[keyof typeof DOCUMENT_SNAPSHOT_CURRENTNESS_ERROR_CODES];

export interface DocumentSnapshotCurrentness {
  version: typeof DOCUMENT_SNAPSHOT_CURRENTNESS_VERSION;
  status: "current" | "changed" | "unresolved";
  expected_snapshot_id: string;
  expected_manifest_digest: string;
  checked_at: string;
  observed_snapshot_id?: string;
  observed_manifest_digest?: string;
  comparison?: DocumentSnapshotComparison;
  error_code?: DocumentSnapshotCurrentnessErrorCode;
}

export interface DocumentSnapshotObservation {
  version: typeof DOCUMENT_SNAPSHOT_OBSERVATION_VERSION;
  snapshot_id: string;
  manifest_digest: string;
  artifact_policy: DocumentArtifactPolicy;
  capture: {
    method: typeof DOCUMENT_SNAPSHOT_CAPTURE_METHOD;
    stable: true;
    source_documents_mutated: false;
  };
  artifacts: Array<{
    role: string;
    media_type: string;
    byte_length: number;
    digest: string;
  }>;
}

/** Structural match for the grounded-evidence capture artifact input. */
export interface DocumentSnapshotGroundingArtifact {
  artifact_id: string;
  role: string;
  media_type: "application/json";
  bytes_base64: string;
}

export interface DocumentSnapshotGroundingRecipe {
  observation: DocumentSnapshotObservation;
  observation_json: string;
  artifacts: [DocumentSnapshotGroundingArtifact];
  verifier_definition: {
    verifier_id: string;
    verifier_version: string;
    program: {
      artifact: {
        artifact_id: string;
        role: string;
        media_type: "application/json";
      };
      pointer: "";
    };
  };
  contract_definition: {
    contract_id: string;
    contract_version: string;
    label: string;
    claim: {
      claim_id: string;
      claim_version: string;
      label: string;
      parameters: {
        snapshot_id: string;
        manifest_digest: string;
      };
    };
    program: {
      all: Array<
        | { op: "exists"; source: "observation"; pointer: string }
        | {
            op: "equals";
            source: "observation";
            pointer: string;
            value: string | boolean;
          }
        | {
            op: "type_is";
            source: "observation";
            pointer: string;
            type: "string" | "array";
          }
      >;
    };
  };
}

export interface DocumentSnapshotCurrentnessGroundingRecipe {
  observation: DocumentSnapshotCurrentness;
  observation_json: string;
  artifacts: [DocumentSnapshotGroundingArtifact];
  verifier_definition: {
    verifier_id: string;
    verifier_version: string;
    program: {
      artifact: {
        artifact_id: string;
        role: string;
        media_type: "application/json";
      };
      pointer: "";
    };
  };
  contract_definition: {
    contract_id: string;
    contract_version: string;
    label: string;
    claim: {
      claim_id: string;
      claim_version: string;
      label: string;
      parameters: {
        snapshot_id: string;
        manifest_digest: string;
        checked_at: string;
      };
    };
    program: {
      all: Array<
        | { op: "exists"; source: "observation"; pointer: string }
        | {
            op: "equals";
            source: "observation";
            pointer: string;
            value: string | boolean | [];
          }
        | {
            op: "type_is";
            source: "observation";
            pointer: string;
            type: "string" | "array";
          }
      >;
    };
  };
}
