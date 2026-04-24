import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  RiddleProofAgentAdapter,
  RiddleProofAgentPayload,
  RiddleProofBlocker,
  RiddleProofEngineHarnessContext,
} from "@riddledc/riddle-proof";

export interface CodexExecAgentConfig {
  codexCommand?: string;
  codexHome?: string;
  codexModel?: string;
  codexTimeoutMs?: number;
  codexSandbox?: "read-only" | "workspace-write" | "danger-full-access";
  codexFullAuto?: boolean;
}

export interface CodexJsonRequest {
  purpose: string;
  workdir: string;
  prompt: string;
  schema: Record<string, unknown>;
}

export interface CodexJsonResult {
  ok: boolean;
  json?: Record<string, unknown>;
  stdout?: string;
  stderr?: string;
  blocker?: RiddleProofBlocker;
}

export type CodexJsonRunner = (request: CodexJsonRequest) => Promise<CodexJsonResult> | CodexJsonResult;

const REFINED_INPUTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["server_path", "wait_for_selector", "reference"],
  properties: {
    server_path: { type: ["string", "null"] },
    wait_for_selector: { type: ["string", "null"] },
    reference: { enum: ["before", "prod", "both", null] },
  },
};

const BASELINE_UNDERSTANDING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "reference",
    "target_route",
    "before_evidence_url",
    "visible_before_state",
    "relevant_elements",
    "requested_change",
    "proof_focus",
    "stop_condition",
    "quality_risks",
  ],
  properties: {
    reference: { type: "string", enum: ["before", "prod", "both", "unknown"] },
    target_route: { type: "string" },
    before_evidence_url: { type: "string" },
    visible_before_state: { type: "string" },
    relevant_elements: { type: "array", items: { type: "string" } },
    requested_change: { type: "string" },
    proof_focus: { type: "string" },
    stop_condition: { type: "string" },
    quality_risks: { type: "array", items: { type: "string" } },
  },
};

const RECON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "decision",
    "summary",
    "baseline_understanding",
    "continue_with_stage",
    "escalation_target",
    "refined_inputs",
    "reasons",
    "source",
  ],
  properties: {
    decision: { type: "string", enum: ["retry_recon", "ready_for_author", "recon_stuck"] },
    summary: { type: "string" },
    baseline_understanding: BASELINE_UNDERSTANDING_SCHEMA,
    continue_with_stage: { type: "string", enum: ["recon", "author"] },
    escalation_target: { type: "string", enum: ["agent", "human"] },
    refined_inputs: REFINED_INPUTS_SCHEMA,
    reasons: { type: "array", items: { type: "string" } },
    source: { type: "string", enum: ["supervising_agent"] },
  },
};

const AUTHOR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "proof_plan",
    "capture_script",
    "baseline_understanding_used",
    "refined_inputs",
    "rationale",
    "confidence",
    "summary",
  ],
  properties: {
    proof_plan: { type: "string" },
    capture_script: { type: "string" },
    baseline_understanding_used: BASELINE_UNDERSTANDING_SCHEMA,
    refined_inputs: REFINED_INPUTS_SCHEMA,
    rationale: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    summary: { type: "string" },
  },
};

const IMPLEMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "implementation_notes", "changed_files", "tests_run", "blockers"],
  properties: {
    summary: { type: "string" },
    implementation_notes: { type: "string" },
    changed_files: { type: "array", items: { type: "string" } },
    tests_run: { type: "array", items: { type: "string" } },
    blockers: { type: "array", items: { type: "string" } },
  },
};

const PROOF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "decision",
    "summary",
    "recommended_stage",
    "continue_with_stage",
    "escalation_target",
    "reasons",
    "source",
  ],
  properties: {
    decision: {
      type: "string",
      enum: [
        "ready_to_ship",
        "needs_richer_proof",
        "revise_capture",
        "needs_recon",
        "needs_implementation",
      ],
    },
    summary: { type: "string" },
    recommended_stage: { type: "string", enum: ["ship", "author", "implement", "recon", "verify"] },
    continue_with_stage: { type: "string", enum: ["ship", "author", "implement", "recon", "verify"] },
    escalation_target: { type: "string", enum: ["agent", "human"] },
    reasons: { type: "array", items: { type: "string" } },
    source: { type: "string", enum: ["supervising_agent"] },
  },
};

const PROMPT_STRING_LIMIT = 2_000;
const PROMPT_ARRAY_LIMIT = 12;
const PROMPT_OBJECT_KEY_LIMIT = 70;
const PROMPT_BLOCK_LIMIT = 120_000;

const PROMPT_KEY_PRIORITY = [
  "ok",
  "status",
  "stage",
  "checkpoint",
  "summary",
  "state_path",
  "repo",
  "branch",
  "change_request",
  "context",
  "success_criteria",
  "verification_mode",
  "reference",
  "server_path",
  "wait_for_selector",
  "before_cdn",
  "prod_cdn",
  "after_cdn",
  "before_baseline",
  "prod_baseline",
  "recon_assessment",
  "baseline_understanding",
  "supervisor_author_packet",
  "proof_plan",
  "capture_script",
  "implementation_status",
  "implementation_summary",
  "implementation_notes",
  "changed_files",
  "verify_status",
  "verify_summary",
  "proof_assessment",
  "proof_assessment_request",
  "semantic_context",
  "visual_delta",
  "proof_evidence_present",
  "proof_evidence_sample",
  "artifacts",
  "assertions",
  "checkpointContract",
  "shipGate",
  "last_error",
  "errors",
  "events",
];

const PROMPT_PRIORITY_INDEX = new Map(PROMPT_KEY_PRIORITY.map((key, index) => [key, index]));

function truncatePromptString(value: string, limit = PROMPT_STRING_LIMIT) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n...[truncated ${value.length - limit} chars]`;
}

function compactPromptValue(value: unknown, depth = 0, key = ""): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    const lowerKey = key.toLowerCase();
    const looksLikeUrl = /^https?:\/\//.test(value);
    if (!looksLikeUrl && (lowerKey.includes("base64") || lowerKey.includes("data_url") || lowerKey.includes("screenshot_blob"))) {
      return `[omitted ${value.length} chars from ${key || "large artifact"}]`;
    }
    const limit = looksLikeUrl ? 1_000 : depth <= 1 ? PROMPT_STRING_LIMIT : 1_200;
    return truncatePromptString(value, limit);
  }
  if (Array.isArray(value)) {
    const lowerKey = key.toLowerCase();
    const items = lowerKey.includes("event") || lowerKey.includes("histor") || lowerKey.includes("retry")
      ? value.slice(-PROMPT_ARRAY_LIMIT)
      : value.slice(0, PROMPT_ARRAY_LIMIT);
    const compacted = items.map((item) => compactPromptValue(item, depth + 1, key));
    if (value.length > items.length) {
      const omitted = value.length - items.length;
      return lowerKey.includes("event") || lowerKey.includes("histor") || lowerKey.includes("retry")
        ? [{ omittedEarlierItems: omitted }, ...compacted]
        : [...compacted, { omittedItems: omitted }];
    }
    return compacted;
  }
  if (!value || typeof value !== "object") return String(value);

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => {
      const leftPriority = PROMPT_PRIORITY_INDEX.get(left) ?? 1_000;
      const rightPriority = PROMPT_PRIORITY_INDEX.get(right) ?? 1_000;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return left.localeCompare(right);
    });
  const result: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of entries.slice(0, PROMPT_OBJECT_KEY_LIMIT)) {
    result[entryKey] = compactPromptValue(entryValue, depth + 1, entryKey);
  }
  if (entries.length > PROMPT_OBJECT_KEY_LIMIT) {
    result.__omitted_keys = entries.length - PROMPT_OBJECT_KEY_LIMIT;
  }
  return result;
}

function jsonBlock(label: string, value: unknown) {
  let json = JSON.stringify(compactPromptValue(value), null, 2);
  if (json.length > PROMPT_BLOCK_LIMIT) {
    json = `${json.slice(0, PROMPT_BLOCK_LIMIT)}\n...[truncated ${json.length - PROMPT_BLOCK_LIMIT} chars from compacted ${label}]`;
  }
  return `${label}:\n${json}`;
}

function resolveWorkdir(context: RiddleProofEngineHarnessContext, fallback = "/tmp") {
  const after = typeof context.fullRiddleState?.after_worktree === "string"
    ? context.fullRiddleState.after_worktree.trim()
    : "";
  return after || fallback;
}

function basePrompt(context: RiddleProofEngineHarnessContext, role: string) {
  return [
    role,
    "",
    "You are the supervising Codex worker inside the Riddle Proof harness.",
    "Return only JSON matching the provided output schema.",
    "Do not ask the human to manually continue. If blocked, encode the blocker in the JSON fields allowed by the schema.",
    "Large raw artifacts are summarized before this prompt. Use preserved state summaries, URLs, file paths, and proof evidence samples instead of expecting full raw logs or binary artifacts inline.",
    "",
    jsonBlock("Original request", context.request),
    jsonBlock("Riddle checkpoint result", context.engineResult),
    jsonBlock("Full riddle state", context.fullRiddleState || {}),
  ].join("\n");
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
}

function isHarnessVerificationOnlyBlocker(blocker: string) {
  const text = blocker.toLowerCase();
  return (
    (text.includes("erofs") || text.includes("read-only file system")) &&
    text.includes("node_modules") &&
    (text.includes(".vite-temp") || text.includes("vite.config"))
  );
}

export function createCodexExecJsonRunner(config: CodexExecAgentConfig = {}): CodexJsonRunner {
  return (request: CodexJsonRequest): CodexJsonResult => {
    if (!request.workdir || !existsSync(request.workdir)) {
      return {
        ok: false,
        blocker: {
          code: "codex_workdir_missing",
          message: `Codex workdir does not exist for ${request.purpose}.`,
          details: { workdir: request.workdir },
        },
      };
    }

    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "riddle-proof-codex-"));
    const schemaPath = path.join(tmpDir, "schema.json");
    const lastMessagePath = path.join(tmpDir, "last-message.json");
    writeFileSync(schemaPath, JSON.stringify(request.schema, null, 2));

    const args = [
      "exec",
      "--json",
      "--output-schema",
      schemaPath,
      "--output-last-message",
      lastMessagePath,
      "--cd",
      request.workdir,
      "--sandbox",
      config.codexSandbox || "workspace-write",
      "--skip-git-repo-check",
    ];
    if (config.codexFullAuto !== false) args.push("--full-auto");
    if (config.codexModel) args.push("-m", config.codexModel);
    args.push("-");

    const env = { ...process.env };
    if (config.codexHome) env.CODEX_HOME = config.codexHome;
    delete env.OPENAI_API_KEY;

    try {
      const proc = spawnSync(config.codexCommand || "codex", args, {
        input: request.prompt,
        encoding: "utf-8",
        timeout: Number(config.codexTimeoutMs || 600_000),
        maxBuffer: 10 * 1024 * 1024,
        env,
      });

      if (proc.error) {
        const timedOut = (proc.error as NodeJS.ErrnoException).code === "ETIMEDOUT";
        return {
          ok: false,
          stdout: proc.stdout || "",
          stderr: proc.stderr || "",
          blocker: {
            code: timedOut ? "codex_timeout" : "codex_exec_error",
            message: timedOut
              ? `Codex timed out during ${request.purpose}.`
              : `Codex failed to start or complete ${request.purpose}.`,
            details: { error: proc.error.message },
          },
        };
      }

      if (proc.status !== 0) {
        return {
          ok: false,
          stdout: proc.stdout || "",
          stderr: proc.stderr || "",
          blocker: {
            code: "codex_nonzero_exit",
            message: `Codex exited with status ${proc.status} during ${request.purpose}.`,
            details: { stdout: proc.stdout || "", stderr: proc.stderr || "" },
          },
        };
      }

      const finalText = existsSync(lastMessagePath)
        ? readFileSync(lastMessagePath, "utf-8")
        : String(proc.stdout || "");
      const parsed = parseJsonObject(finalText);
      if (!parsed) {
        return {
          ok: false,
          stdout: proc.stdout || "",
          stderr: proc.stderr || "",
          blocker: {
            code: "codex_invalid_json",
            message: `Codex completed ${request.purpose}, but did not return valid JSON.`,
            details: { finalText, stdout: proc.stdout || "", stderr: proc.stderr || "" },
          },
        };
      }

      return {
        ok: true,
        json: parsed,
        stdout: proc.stdout || "",
        stderr: proc.stderr || "",
      };
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  };
}

async function callRunner(runner: CodexJsonRunner, request: CodexJsonRequest): Promise<CodexJsonResult> {
  return runner(request);
}

function payloadOrBlocker(raw: CodexJsonResult, checkpoint: string): RiddleProofAgentPayload {
  if (!raw.ok || !raw.json) {
    const blocker = raw.blocker || {
      code: "codex_runner_failed",
      message: "Codex runner failed without a detailed blocker.",
      details: { stdout: raw.stdout || "", stderr: raw.stderr || "" },
    };
    return {
      ok: false,
      blocker: {
        ...blocker,
        checkpoint,
      },
    };
  }
  return {
    ok: true,
    payload: raw.json,
    summary: typeof raw.json.summary === "string" ? raw.json.summary : undefined,
  };
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function createCodexExecAgentAdapter(
  config: CodexExecAgentConfig = {},
  runner: CodexJsonRunner = createCodexExecJsonRunner(config),
): RiddleProofAgentAdapter {
  return {
    async assessRecon(context) {
      const raw = await callRunner(runner, {
        purpose: "recon assessment",
        workdir: resolveWorkdir(context),
        schema: RECON_SCHEMA,
        prompt: [
          basePrompt(context, "Judge the latest recon packet."),
          "Decide whether recon should retry, continue to author, or escalate to the human.",
          "This is the first intelligent before-evidence gate. It runs before proof authoring and before any code edits.",
          "Prefer ready_for_author only when the baseline evidence is trustworthy for the requested change.",
          "Do not approve recon just because telemetry_ready is true or a screenshot URL exists.",
          "Inspect the baseline evidence in the state: screenshot URLs, structured pageState details, visible_text_sample, headings, buttons, links, canvas_count, large_visible_elements, observed_path, and route candidates.",
          "Fill baseline_understanding with concrete observations about what the before/prod evidence shows, what exact user request it anchors, what proof should focus on, and what stop condition would satisfy the request.",
          "If you cannot write a specific baseline_understanding from the current evidence, choose retry_recon or recon_stuck; do not choose ready_for_author.",
          "Reject blank, banner-only, app-shell-only, loading-only, generic landing, source-import path, or wrong-feature baselines; retry recon with a better server_path or selector instead.",
          "Your summary must say what is visibly present in the approved baseline or why the current baseline is not good enough.",
          "Always include refined_inputs; use null values for server_path, wait_for_selector, or reference when no refinement is needed.",
        ].join("\n"),
      });
      return payloadOrBlocker(raw, context.checkpoint);
    },

    async authorProofPacket(context) {
      const raw = await callRunner(runner, {
        purpose: "proof packet authoring",
        workdir: resolveWorkdir(context),
        schema: AUTHOR_SCHEMA,
        prompt: [
          basePrompt(context, "Author the proof packet."),
          "Write a proof_plan and capture_script that will verify the exact user-facing change.",
          "Use recon_assessment.baseline_understanding as the source of truth. Do not author a proof plan unless it names the observed before state and the requested delta from that state.",
          "Use the recon-approved route and baseline context; make the plan name the concrete target, expected before state, expected after state, and stop condition.",
          "Choose the evidence modality from verification_mode and success_criteria: screenshots for visual/UI proof, interactions plus screenshots for interaction proof, structured metrics/logs/JSON/audio analysis for non-visual proof.",
          "For structured proof, collect meaningful measurements inside page.evaluate and set window.__riddleProofEvidence in that browser page context to a JSON-serializable object. Screenshots are optional supporting context for data/audio/log/metric/custom modes.",
          "Do not assign globalThis.__riddleProofEvidence, window.__riddleProofEvidence, or self.__riddleProofEvidence outside page.evaluate; the Riddle worker context may not expose those globals safely.",
          "When checking visible copy, normalize text before exact matching: const normalizedText = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim(); Avoid raw innerText.includes(exact sentence) because browser line wrapping can split copy.",
          "Prefer success-oriented evidence booleans such as newCopyVisible: true and oldCopyAbsent: true. If a positive assertion is false while screenshots/text samples look right, fix the capture script instead of leaving contradictory proof evidence.",
          "Include a short matchedSnippet or normalizedTextSample when proofing copy so assertion mismatches are diagnosable.",
          "For visual/UI proof, include saveScreenshot('after-proof') exactly once.",
          "Avoid generic proof language. The packet should be specific enough that verify can tell whether the requested change actually happened.",
          "Echo the baseline understanding you used in baseline_understanding_used so later stages can detect drift.",
          "Use refined_inputs for server_path, wait_for_selector, or reference when useful; use null values when no refinement is needed.",
        ].join("\n"),
      });
      return payloadOrBlocker(raw, context.checkpoint);
    },

    async implementChange(context) {
      if (!context.workdir || !existsSync(context.workdir)) {
        return {
          ok: false,
          blocker: {
            code: "implementation_workdir_missing",
            checkpoint: context.checkpoint,
            message: "The Riddle Proof state does not include an after worktree that exists on disk.",
            details: { workdir: context.workdir || null },
          },
        };
      }

      const raw = await callRunner(runner, {
        purpose: "implementation",
        workdir: context.workdir,
        schema: IMPLEMENT_SCHEMA,
        prompt: [
          basePrompt(context, "Implement the requested code change in the after worktree."),
          "Make the code changes directly in this repository.",
          "Use the recon-approved baseline understanding in the state to decide exactly what prior UI/state is being changed.",
          "Run focused checks when practical.",
          "If a focused check is blocked only by the harness sandbox writing Vite temp config into a shared/symlinked node_modules path (for example EROFS on node_modules/.vite-temp/vite.config...), do not treat that as an implementation blocker when the requested git diff exists. Record it in tests_run or implementation_notes instead so the harness can advance to its own verify stage.",
          "Leave a real git diff in the after worktree. Do not commit or push.",
          "Return changed_files, implementation_notes, tests_run, and blockers if any.",
          "Use empty arrays for tests_run or blockers when none apply.",
        ].join("\n"),
      });
      if (!raw.ok || !raw.json) return payloadOrBlocker(raw, context.checkpoint);

      const changedFiles = stringArray(raw.json.changed_files);
      const blockers = stringArray(raw.json.blockers);
      const testsRun = stringArray(raw.json.tests_run);
      const softVerificationBlockers = changedFiles.length
        ? blockers.filter(isHarnessVerificationOnlyBlocker)
        : [];
      const hardBlockers = blockers.filter((item) => !softVerificationBlockers.includes(item));
      const implementationNotesRaw = typeof raw.json.implementation_notes === "string" ? raw.json.implementation_notes : "";
      const agentDetails = {
        agent_summary: typeof raw.json.summary === "string" ? raw.json.summary : "",
        agent_changed_files: changedFiles,
        agent_tests_run: testsRun,
        agent_blockers: blockers,
      };
      if (hardBlockers.length) {
        return {
          ok: false,
          blocker: {
            code: "codex_implementation_blocked",
            checkpoint: context.checkpoint,
            message: String(raw.json.summary || "Codex reported implementation blockers."),
            details: {
              blockers: hardBlockers,
              changedFiles,
              testsRun,
              implementationNotes: implementationNotesRaw,
              ...agentDetails,
            },
          },
        };
      }

      const implementationNotes = [
        implementationNotesRaw,
        ...softVerificationBlockers.map((item) => `Harness verification note: ${item}`),
      ].filter(Boolean).join("\n");
      return {
        ok: true,
        summary: typeof raw.json.summary === "string" ? raw.json.summary : undefined,
        implementationNotes: implementationNotes || undefined,
        changedFiles,
        testsRun,
        details: {
          ...agentDetails,
          implementation_notes: implementationNotes || implementationNotesRaw || "",
          soft_verification_blockers: softVerificationBlockers,
          hard_blocker_count: hardBlockers.length,
        },
      };
    },

    async assessProof(context) {
      const raw = await callRunner(runner, {
        purpose: "proof assessment",
        workdir: resolveWorkdir(context),
        schema: PROOF_SCHEMA,
        prompt: [
          basePrompt(context, "Judge the proof bundle."),
          "Decide whether the evidence is ready_to_ship or which internal stage should run next.",
          "Only use ready_to_ship when the before/prod and after evidence actually prove the requested change.",
          "Do not assume screenshots are required for every verification_mode. For data/audio/log/metric/custom proof, inspect the structured evidence bundle, proof_evidence_sample, artifacts, assertions, and success criteria directly.",
          "Use semantic_context.route, headings, buttons, and text anchors to ground route/content judgment before calling screenshot evidence wrong-route or unrelated.",
          "If structured proof evidence contains failed positive assertions, such as newCopyVisible: false or hasExpectedText: false, do not choose ready_to_ship until the evidence is reconciled or a richer proof is produced.",
          "For visual/UI proof, screenshots and route/page-state quality still matter, but capture success alone is not proof.",
          "For visual/UI polish, reject changes that are technically different but not legible to a reviewer. If visual_delta.status is measured and visual_delta.passed is false, choose needs_implementation or needs_richer_proof, not ready_to_ship.",
          "If visual_delta is unmeasured, only choose ready_to_ship when you can name a clear visible before/after delta from the screenshots and page-state details. If the delta is subtle or ambiguous, request a stronger implementation or richer proof.",
          "Do not ship if the baseline is blank, shell-only, generic, or unrelated to the requested feature.",
          "Your summary must name the concrete change, the target that was tested, what changed between baseline and after evidence, and why the stop condition is satisfied.",
        ].join("\n"),
      });
      return payloadOrBlocker(raw, context.checkpoint);
    },
  };
}

function git(args: string[], workdir: string) {
  return execFileSync("git", args, {
    cwd: workdir,
    encoding: "utf-8",
    timeout: 10_000,
  });
}

export async function runCodexExecAgentDoctor(
  config: CodexExecAgentConfig = {},
  runner: CodexJsonRunner = createCodexExecJsonRunner(config),
) {
  const workdir = mkdtempSync(path.join(os.tmpdir(), "riddle-proof-codex-doctor-"));
  const targetPath = path.join(workdir, "target.txt");
  writeFileSync(targetPath, "color=red\n");
  try {
    git(["init", "-b", "main"], workdir);
    git(["config", "user.email", "doctor@example.com"], workdir);
    git(["config", "user.name", "Riddle Proof Doctor"], workdir);
    git(["add", "target.txt"], workdir);
    git(["commit", "-m", "initial doctor fixture"], workdir);
  } catch (error) {
    return {
      ok: false,
      status: "blocked",
      blocker: {
        code: "doctor_git_setup_failed",
        message: "Could not create the temporary doctor git fixture.",
        details: { error: error instanceof Error ? error.message : String(error), workdir },
      },
    };
  }

  const raw = await callRunner(runner, {
    purpose: "codex exec doctor implementation",
    workdir,
    schema: IMPLEMENT_SCHEMA,
    prompt: [
      "You are running a Riddle Proof Codex exec doctor check.",
      "In this temporary git repository, edit target.txt so it says exactly: color=blue",
      "Do not commit. Leave a git diff.",
      "Return JSON matching the schema with changed_files containing target.txt.",
      "Use empty arrays for tests_run and blockers.",
    ].join("\n"),
  });

  if (!raw.ok || !raw.json) {
    return {
      ok: false,
      status: "blocked",
      blocker: {
        ...(raw.blocker || {
          code: "doctor_codex_failed",
          message: "Codex doctor runner failed.",
          details: { stdout: raw.stdout || "", stderr: raw.stderr || "" },
        }),
        details: {
          ...(raw.blocker?.details || {}),
          workdir,
        },
      },
    };
  }

  const content = readFileSync(targetPath, "utf-8");
  const status = git(["status", "--porcelain"], workdir);
  const changedFiles = stringArray(raw.json.changed_files);
  const ok = content.trim() === "color=blue" && status.includes("target.txt");

  return {
    ok,
    status: ok ? "passed" : "blocked",
    workdir,
    changedFiles,
    implementationSummary: raw.json.summary || null,
    implementationNotes: raw.json.implementation_notes || null,
    gitStatus: status,
    targetContent: content,
    blocker: ok ? null : {
      code: "doctor_diff_missing_or_wrong",
      message: "Codex doctor completed, but target.txt was not changed to color=blue with a git diff.",
      details: { workdir, changedFiles, gitStatus: status, targetContent: content },
    },
  };
}
