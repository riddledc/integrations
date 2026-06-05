export const RIDDLE_PROOF_PR_COMMENT_MARKER = "<!-- riddle-proof:pr-comment:v1 -->";

export type RiddleProofPrCommentArtifactKind = "image" | "data" | "artifact";

export interface RiddleProofPrCommentArtifact {
  name: string;
  url: string;
  kind: RiddleProofPrCommentArtifactKind;
  size_bytes?: number;
}

export interface RiddleProofPrCommentPageSummary {
  route: string;
  passed: number;
  failed: number;
}

export interface RiddleProofPrCommentSummary {
  ok: boolean | null;
  status?: string;
  job_id?: string;
  duration_ms?: number;
  proof_url?: string;
  preview_id?: string;
  preview_url?: string;
  preview_publish_recovered?: boolean;
  preview_publish_error?: string;
  passed_checks: number;
  failed_checks: number;
  pages: RiddleProofPrCommentPageSummary[];
  artifacts: RiddleProofPrCommentArtifact[];
  primary_image?: RiddleProofPrCommentArtifact;
}

export interface RiddleProofPrCommentInput {
  title?: string;
  goal?: string;
  successCriteria?: string;
  runResponse?: unknown;
  result?: unknown;
  source?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function artifactKind(name: string, url: string): RiddleProofPrCommentArtifactKind {
  const target = `${name} ${url}`.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/.test(target)) return "image";
  if (/\.(json|har|txt|md|html|log)(\?|#|$)/.test(target)) return "data";
  return "artifact";
}

function artifactDisplayName(value: unknown, fallback: string) {
  const raw = stringValue(value);
  if (raw) return raw;
  return fallback;
}

function collectArtifacts(runResponse: Record<string, unknown>) {
  const proofResult = asRecord(runResponse.proofResult);
  const outputs = asArray(proofResult.outputs);
  const artifacts: RiddleProofPrCommentArtifact[] = [];
  const seen = new Set<string>();
  for (const [index, item] of outputs.entries()) {
    const artifact = asRecord(item);
    const url = stringValue(artifact.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const name = artifactDisplayName(artifact.name, `artifact-${index + 1}`);
    artifacts.push({
      name,
      url,
      kind: artifactKind(name, url),
      size_bytes: numberValue(artifact.size),
    });
  }
  return artifacts;
}

function pageSummaries(result: Record<string, unknown>) {
  const pages: RiddleProofPrCommentPageSummary[] = [];
  for (const page of asArray(result.pages)) {
    const record = asRecord(page);
    const route = stringValue(record.route) || stringValue(record.url) || "page";
    const checks = asRecord(record.checks);
    let passed = 0;
    let failed = 0;
    for (const value of Object.values(checks)) {
      if (value === true) passed += 1;
      if (value === false) failed += 1;
    }
    pages.push({ route, passed, failed });
  }
  return pages;
}

function summarizeExplicitChecks(value: unknown) {
  let passed = 0;
  let failed = 0;
  const visit = (current: unknown, inChecks = false) => {
    if (current === true && inChecks) {
      passed += 1;
      return;
    }
    if (current === false && inChecks) {
      failed += 1;
      return;
    }
    if (Array.isArray(current)) {
      for (const item of current) visit(item, inChecks);
      return;
    }
    if (current && typeof current === "object") {
      for (const [key, item] of Object.entries(current as Record<string, unknown>)) {
        visit(item, inChecks || key === "checks");
      }
    }
  };
  visit(value);
  return { passed, failed };
}

function selectPrimaryImage(artifacts: RiddleProofPrCommentArtifact[]) {
  const images = artifacts.filter((artifact) => artifact.kind === "image");
  return (
    images.find((artifact) => /after|proof|screenshot/i.test(artifact.name)) ||
    images[0]
  );
}

export function summarizeRiddleProofPrComment(input: RiddleProofPrCommentInput): RiddleProofPrCommentSummary {
  const runResponse = asRecord(input.runResponse);
  const result = asRecord(input.result);
  const proofResult = asRecord(runResponse.proofResult);
  const preview = asRecord(runResponse.preview);
  const artifacts = collectArtifacts(runResponse);
  const pages = pageSummaries(result);
  const checkSource = { ...result };
  delete checkSource.ok;
  const nestedChecks = summarizeExplicitChecks(checkSource);
  const ok = booleanValue(result.ok) ?? booleanValue(runResponse.ok) ?? null;
  return {
    ok,
    status: stringValue(proofResult.status),
    job_id: stringValue(proofResult.job_id),
    duration_ms: numberValue(proofResult.duration_ms),
    proof_url: stringValue(runResponse.proofUrl),
    preview_id: stringValue(preview.id),
    preview_url: stringValue(preview.preview_url) || stringValue(preview.url),
    preview_publish_recovered: booleanValue(preview.publish_recovered),
    preview_publish_error: stringValue(preview.publish_error),
    passed_checks: nestedChecks.passed,
    failed_checks: nestedChecks.failed,
    pages,
    artifacts,
    primary_image: selectPrimaryImage(artifacts),
  };
}

function formatDuration(ms: number | undefined) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "";
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m${String(remainder).padStart(2, "0")}s` : `${seconds}s`;
}

function markdownLink(label: string, url: string) {
  return `[${label.replace(/\]/g, "\\]")}](${url})`;
}

function resultLabel(summary: RiddleProofPrCommentSummary) {
  if (summary.ok === true) return "passed";
  if (summary.ok === false) return "failed";
  return summary.status || "recorded";
}

function artifactRank(artifact: RiddleProofPrCommentArtifact) {
  const name = artifact.name.toLowerCase();
  if (name === "proof.json") return 0;
  if (name === "result.json") return 1;
  if (name.includes("proof") && name.endsWith(".json") && !name.includes("layout")) return 2;
  if (name === "console.json") return 3;
  if (artifact.kind === "data") return 10;
  if (artifact.kind === "image") return 20;
  return 30;
}

export function buildRiddleProofPrCommentMarkdown(input: RiddleProofPrCommentInput) {
  const summary = summarizeRiddleProofPrComment(input);
  const title = input.title?.trim() || "Riddle Proof Evidence";
  const lines = [
    RIDDLE_PROOF_PR_COMMENT_MARKER,
    `## ${title}`,
    "",
    `**Result:** ${resultLabel(summary)}`,
  ];

  if (input.goal?.trim()) lines.push(`**Goal:** ${input.goal.trim()}`);
  if (input.successCriteria?.trim()) lines.push(`**Success criteria:** ${input.successCriteria.trim()}`);
  if (summary.status) lines.push(`**Riddle job status:** ${summary.status}`);
  if (summary.job_id) lines.push(`**Riddle job:** \`${summary.job_id}\``);
  if (summary.duration_ms) lines.push(`**Duration:** ${formatDuration(summary.duration_ms)}`);
  if (summary.proof_url) lines.push(`**Proof URL:** ${markdownLink(summary.proof_url, summary.proof_url)}`);
  if (summary.preview_id || summary.preview_url) {
    const previewLabel = summary.preview_id ? `\`${summary.preview_id}\`` : "preview";
    lines.push(`**Preview:** ${summary.preview_url ? markdownLink(previewLabel, summary.preview_url) : previewLabel}`);
  }
  if (summary.preview_publish_recovered) {
    const detail = summary.preview_publish_error ? `: ${summary.preview_publish_error}` : "";
    lines.push(`**Preview publish recovery:** recovered after publish error${detail}`);
  }
  lines.push(`**Checks:** ${summary.passed_checks} passed / ${summary.failed_checks} failed`);
  lines.push("");

  if (summary.primary_image) {
    lines.push("### Screenshot");
    lines.push(`![${summary.primary_image.name}](${summary.primary_image.url})`);
    lines.push("");
  }

  if (summary.pages.length) {
    lines.push("### Page Checks");
    for (const page of summary.pages.slice(0, 12)) {
      lines.push(`- \`${page.route}\`: ${page.passed} passed / ${page.failed} failed`);
    }
    if (summary.pages.length > 12) lines.push(`- ${summary.pages.length - 12} more page(s) omitted`);
    lines.push("");
  }

  const linkedArtifacts = summary.artifacts
    .filter((artifact) => artifact.url !== summary.primary_image?.url)
    .sort((left, right) => artifactRank(left) - artifactRank(right) || left.name.localeCompare(right.name))
    .slice(0, 20);
  if (linkedArtifacts.length) {
    lines.push("### Artifacts");
    for (const artifact of linkedArtifacts) {
      lines.push(`- ${markdownLink(artifact.name, artifact.url)}`);
    }
    if (summary.artifacts.length - (summary.primary_image ? 1 : 0) > linkedArtifacts.length) {
      lines.push(`- ${summary.artifacts.length - (summary.primary_image ? 1 : 0) - linkedArtifacts.length} more artifact(s) omitted`);
    }
    lines.push("");
  }

  if (input.source?.trim()) {
    lines.push(`_Source: ${input.source.trim()}_`);
  } else {
    lines.push("_Updated by `riddle-proof-loop pr-comment`._");
  }
  return `${lines.join("\n").trim()}\n`;
}
