import { createHash, randomUUID } from "node:crypto";
import type {
  JsonValue,
  RiddleProofVisualSession,
  RiddleProofVisualSessionFingerprintBasis,
} from "./types";

export const RIDDLE_PROOF_VISUAL_SESSION_VERSION = "riddle-proof.visual-session.v1" as const;
export const RIDDLE_PROOF_VISUAL_SESSION_FINGERPRINT_VERSION = "riddle-proof.visual-session.fingerprint.v1" as const;

export interface BuildVisualProofSessionInput {
  run_id?: string;
  parent?: RiddleProofVisualSession | null;
  repo?: string;
  branch?: string;
  route?: string;
  observed_after_path?: string;
  reference?: string;
  verification_mode?: string;
  target_image_url?: string;
  target_image_hash?: string;
  viewport_matrix?: JsonValue;
  deterministic_setup?: JsonValue;
  proof_plan?: string;
  capture_script?: string;
  wait_for_selector?: string;
  assertions?: JsonValue;
  artifacts?: RiddleProofVisualSession["artifacts"];
  evidence?: RiddleProofVisualSession["evidence"];
  status?: string;
}

export interface VisualProofSessionMismatch {
  key: string;
  expected: JsonValue | undefined;
  actual: JsonValue | undefined;
}

function trim(value?: string | null): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function hashString(value?: string | null): string | undefined {
  const text = trim(value);
  if (!text) return undefined;
  return createHash("sha256").update(text).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function withoutUndefined<T extends Record<string, unknown>>(record: T): T {
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key];
  }
  return record;
}

export function visualSessionFingerprintBasis(input: BuildVisualProofSessionInput): RiddleProofVisualSessionFingerprintBasis {
  return withoutUndefined({
    version: RIDDLE_PROOF_VISUAL_SESSION_FINGERPRINT_VERSION,
    repo: trim(input.repo),
    route: trim(input.route),
    wait_for_selector: trim(input.wait_for_selector),
    reference: trim(input.reference),
    verification_mode: trim(input.verification_mode)?.toLowerCase(),
    target_image_url: trim(input.target_image_url),
    target_image_hash: trim(input.target_image_hash),
    viewport_matrix: input.viewport_matrix,
    deterministic_setup: input.deterministic_setup,
    assertions: input.assertions,
    capture_script_hash: hashString(input.capture_script),
  });
}

export function visualSessionFingerprint(input: BuildVisualProofSessionInput | RiddleProofVisualSessionFingerprintBasis): string {
  const basis = (input as RiddleProofVisualSessionFingerprintBasis).version === RIDDLE_PROOF_VISUAL_SESSION_FINGERPRINT_VERSION
    ? input as RiddleProofVisualSessionFingerprintBasis
    : visualSessionFingerprintBasis(input as BuildVisualProofSessionInput);
  return createHash("sha256").update(stableJson(basis)).digest("hex");
}

export function buildVisualProofSession(input: BuildVisualProofSessionInput): RiddleProofVisualSession {
  const basis = visualSessionFingerprintBasis(input);
  const fingerprint = visualSessionFingerprint(basis);
  const session: RiddleProofVisualSession = {
    version: RIDDLE_PROOF_VISUAL_SESSION_VERSION,
    session_id: `rps_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${randomUUID().slice(0, 8)}`,
    run_id: trim(input.run_id),
    parent_session_id: input.parent?.session_id || null,
    parent_fingerprint: input.parent?.fingerprint || null,
    created_at: new Date().toISOString(),
    fingerprint,
    fingerprint_basis: basis,
    repo: trim(input.repo),
    branch: trim(input.branch),
    route: withoutUndefined({
      path: trim(input.route),
      observed_after_path: trim(input.observed_after_path),
    }),
    reference: trim(input.reference),
    verification_mode: trim(input.verification_mode),
    target_image: withoutUndefined({
      url: trim(input.target_image_url),
      hash: trim(input.target_image_hash),
    }),
    viewport_matrix: input.viewport_matrix,
    deterministic_setup: input.deterministic_setup,
    capture: withoutUndefined({
      proof_plan: trim(input.proof_plan),
      capture_script: trim(input.capture_script),
      wait_for_selector: trim(input.wait_for_selector),
    }),
    assertions: input.assertions,
    artifacts: input.artifacts,
    evidence: input.evidence,
    status: trim(input.status),
  };
  return JSON.parse(JSON.stringify(session));
}

export function parseVisualProofSession(value: unknown): RiddleProofVisualSession {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object") throw new Error("proof session must be a JSON object");
  const session = parsed as RiddleProofVisualSession;
  if (session.version !== RIDDLE_PROOF_VISUAL_SESSION_VERSION) {
    throw new Error(`unsupported proof session version: ${String((session as { version?: unknown }).version || "")}`);
  }
  if (!session.session_id) throw new Error("proof session missing session_id");
  if (!session.fingerprint) throw new Error("proof session missing fingerprint");
  return session;
}

export function compareVisualProofSessionFingerprint(
  parent: RiddleProofVisualSession,
  input: BuildVisualProofSessionInput,
): VisualProofSessionMismatch[] {
  const actual = visualSessionFingerprintBasis(input);
  const expected = parent.fingerprint_basis || {};
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  const expectedRecord = expected as unknown as Record<string, JsonValue | undefined>;
  const actualRecord = actual as unknown as Record<string, JsonValue | undefined>;
  const mismatches: VisualProofSessionMismatch[] = [];
  for (const key of keys) {
    const expectedValue = expectedRecord[key];
    const actualValue = actualRecord[key];
    if (stableJson(expectedValue) !== stableJson(actualValue)) {
      mismatches.push({ key, expected: expectedValue, actual: actualValue });
    }
  }
  return mismatches;
}
