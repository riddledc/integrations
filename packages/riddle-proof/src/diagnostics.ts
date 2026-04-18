import type { EvidenceArtifact, JsonValue } from "./types";

export const RIDDLE_PROOF_CAPTURE_DIAGNOSTIC_VERSION = "riddle-proof.capture-diagnostic.v1" as const;
export const DEFAULT_DIAGNOSTIC_STRING_LIMIT = 2000;
export const DEFAULT_DIAGNOSTIC_ARRAY_LIMIT = 50;
export const DEFAULT_DIAGNOSTIC_HISTORY_LIMIT = 20;

const DEFAULT_REDACTED_VALUE = "[redacted]";
const DEFAULT_SENSITIVE_KEY_PATTERN = /authorization|api_?key|apikey|cookie|header|localstorage|password|secret|token/i;

export interface RiddleProofDiagnosticRedactionOptions {
  string_limit?: number;
  array_limit?: number;
  redacted_value?: string;
  sensitive_key_pattern?: RegExp;
}

export interface RiddleProofArtifactSummary {
  name: string;
  kind?: string;
  role?: string;
  url?: string;
  path?: string;
  content_type?: string;
  size_bytes?: number;
  metadata_keys?: string[];
  source?: "outputs" | "screenshots" | "artifacts" | (string & {});
}

export interface RiddleProofCaptureArtifactSummary {
  outputs: RiddleProofArtifactSummary[];
  screenshots: RiddleProofArtifactSummary[];
  artifacts: RiddleProofArtifactSummary[];
  result_keys: string[];
  artifact_json: string[];
  artifact_errors: Record<string, string>;
  proof_script_error: boolean;
  console_summary?: JsonValue;
}

export interface RiddleProofCaptureDiagnostic {
  version: typeof RIDDLE_PROOF_CAPTURE_DIAGNOSTIC_VERSION;
  label?: string;
  tool?: string;
  captured_at: string;
  ok?: boolean;
  timeout?: boolean;
  error?: string;
  route?: string;
  preview_url?: string;
  wait_for_selector?: string;
  args?: JsonValue;
  artifact_summary: RiddleProofCaptureArtifactSummary;
  evidence?: JsonValue;
  notes?: string[];
}

export interface CreateCaptureDiagnosticInput {
  label?: string;
  tool?: string;
  captured_at?: string;
  ok?: boolean;
  timeout?: boolean;
  error?: unknown;
  args?: unknown;
  payload?: unknown;
  evidence?: unknown;
  route?: string;
  preview_url?: string;
  wait_for_selector?: string;
  notes?: string[];
  redaction?: RiddleProofDiagnosticRedactionOptions;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSensitiveKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9_]/g, "").replace(/_/g, "");
}

function isSensitiveKey(key: string, pattern: RegExp): boolean {
  pattern.lastIndex = 0;
  const rawMatch = pattern.test(key);
  pattern.lastIndex = 0;
  return rawMatch || pattern.test(normalizeSensitiveKey(key));
}

function truncateString(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}... [truncated]`;
}

function sortedKeys(value: unknown): string[] {
  return isRecord(value) ? Object.keys(value).sort() : [];
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function artifactItems(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function artifactSummary(item: Record<string, unknown>, source: RiddleProofArtifactSummary["source"]): RiddleProofArtifactSummary {
  const artifact = item as Partial<EvidenceArtifact> & Record<string, unknown>;
  const metadata = isRecord(artifact.metadata) ? artifact.metadata : undefined;
  return {
    name: stringValue(artifact.name) || "",
    kind: stringValue(artifact.kind),
    role: stringValue(artifact.role),
    url: stringValue(artifact.url),
    path: stringValue(artifact.path),
    content_type: stringValue(artifact.content_type),
    size_bytes: numberValue(artifact.size_bytes),
    metadata_keys: metadata ? Object.keys(metadata).sort() : undefined,
    source,
  };
}

function artifactErrorMap(value: unknown, redaction?: RiddleProofDiagnosticRedactionOptions): Record<string, string> {
  if (!isRecord(value)) return {};
  const entries: [string, string][] = Object.entries(value)
    .map(([key, child]) => {
      const redacted = redactForProofDiagnostics(child, redaction);
      return [key, typeof redacted === "string" ? redacted : JSON.stringify(redacted)] as [string, string];
    })
    .sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(entries);
}

export function redactForProofDiagnostics(
  value: unknown,
  options: RiddleProofDiagnosticRedactionOptions = {},
): JsonValue {
  const stringLimit = Math.max(1, options.string_limit ?? DEFAULT_DIAGNOSTIC_STRING_LIMIT);
  const arrayLimit = Math.max(0, options.array_limit ?? DEFAULT_DIAGNOSTIC_ARRAY_LIMIT);
  const redactedValue = options.redacted_value || DEFAULT_REDACTED_VALUE;
  const sensitiveKeyPattern = options.sensitive_key_pattern || DEFAULT_SENSITIVE_KEY_PATTERN;
  const seen = new WeakSet<object>();

  function redact(child: unknown): JsonValue {
    if (child === null || child === undefined) return null;
    if (typeof child === "string") return truncateString(child, stringLimit);
    if (typeof child === "number") return Number.isFinite(child) ? child : null;
    if (typeof child === "boolean") return child;
    if (typeof child === "bigint" || typeof child === "symbol" || typeof child === "function") {
      return truncateString(String(child), stringLimit);
    }
    if (Array.isArray(child)) {
      return child.slice(0, arrayLimit).map((item) => redact(item));
    }
    if (isRecord(child)) {
      if (seen.has(child)) return "[circular]";
      seen.add(child);
      const entries: [string, JsonValue][] = [];
      for (const [key, nested] of Object.entries(child)) {
        entries.push([
          key,
          isSensitiveKey(key, sensitiveKeyPattern) ? redactedValue : redact(nested),
        ]);
      }
      return Object.fromEntries(entries);
    }
    return truncateString(String(child), stringLimit);
  }

  return redact(value);
}

export function summarizeCaptureArtifacts(payload: unknown): RiddleProofCaptureArtifactSummary {
  const record = isRecord(payload) ? payload : {};
  const artifactJson = isRecord(record._artifact_json) ? record._artifact_json : {};
  const proofJson = isRecord(record._proof_json)
    ? record._proof_json
    : isRecord(artifactJson["proof.json"])
      ? artifactJson["proof.json"]
      : {};
  const consoleJson = isRecord(record.console)
    ? record.console
    : isRecord(artifactJson["console.json"])
      ? artifactJson["console.json"]
      : {};
  const result = isRecord(record.result)
    ? record.result
    : isRecord(proofJson.result)
      ? proofJson.result
      : isRecord(proofJson.script_result)
        ? proofJson.script_result
        : isRecord(proofJson.return_value)
          ? proofJson.return_value
          : isRecord(proofJson.value)
            ? proofJson.value
            : {};
  const consoleSummary = isRecord(consoleJson.summary)
    ? redactForProofDiagnostics(consoleJson.summary, { string_limit: 500 })
    : undefined;

  return {
    outputs: artifactItems(record.outputs).slice(0, 20).map((item) => artifactSummary(item, "outputs")),
    screenshots: artifactItems(record.screenshots).slice(0, 10).map((item) => artifactSummary(item, "screenshots")),
    artifacts: artifactItems(record.artifacts).slice(0, 20).map((item) => artifactSummary(item, "artifacts")),
    result_keys: sortedKeys(result),
    artifact_json: sortedKeys(artifactJson),
    artifact_errors: artifactErrorMap(record._artifact_errors),
    proof_script_error: Boolean(proofJson.script_error),
    console_summary: consoleSummary,
  };
}

export function createCaptureDiagnostic(input: CreateCaptureDiagnosticInput): RiddleProofCaptureDiagnostic {
  const payload = isRecord(input.payload) ? input.payload : {};
  const redaction = input.redaction;
  const error =
    input.error ??
    payload.error ??
    payload.stderr ??
    payload.message ??
    "";

  return {
    version: RIDDLE_PROOF_CAPTURE_DIAGNOSTIC_VERSION,
    label: input.label,
    tool: input.tool,
    captured_at: input.captured_at || new Date().toISOString(),
    ok: typeof input.ok === "boolean" ? input.ok : typeof payload.ok === "boolean" ? payload.ok : undefined,
    timeout: typeof input.timeout === "boolean" ? input.timeout : Boolean(payload.timeout),
    error: truncateString(String(error ?? ""), redaction?.string_limit ?? DEFAULT_DIAGNOSTIC_STRING_LIMIT),
    route: input.route,
    preview_url: input.preview_url,
    wait_for_selector: input.wait_for_selector,
    args: redactForProofDiagnostics(input.args === undefined ? {} : input.args, redaction),
    artifact_summary: summarizeCaptureArtifacts(input.payload),
    evidence: input.evidence === undefined ? undefined : redactForProofDiagnostics(input.evidence, redaction),
    notes: input.notes?.map((note) => note.trim()).filter(Boolean),
  };
}

export function appendCaptureDiagnostic<T extends { capture_diagnostics?: RiddleProofCaptureDiagnostic[] }>(
  state: T,
  input: CreateCaptureDiagnosticInput,
  historyLimit = DEFAULT_DIAGNOSTIC_HISTORY_LIMIT,
): RiddleProofCaptureDiagnostic {
  const diagnostic = createCaptureDiagnostic(input);
  const existing = Array.isArray(state.capture_diagnostics) ? state.capture_diagnostics : [];
  state.capture_diagnostics = [...existing, diagnostic].slice(-Math.max(1, historyLimit));
  return diagnostic;
}
