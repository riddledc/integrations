import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync,
  constants,
  lstatSync,
  realpathSync,
} from "node:fs";
import path from "node:path";

import {
  INITIAL_PRIMARY_CTA,
  INITIAL_PRIMARY_CTA_DECLARATION,
  REQUESTED_PRIMARY_CTA,
  REQUESTED_PRIMARY_CTA_DECLARATION,
  copyCtaSourceBytes,
  ctaSourceDigest,
  initialCtaSpecimenSourceBytes,
  requestedCtaSpecimenSourceBytes,
} from "./cta-specimen.js";

export const CTA_AGENT_PROTOCOL_VERSION =
  "riddle-proof.cta-change-agent.v1" as const;

export const CTA_MUTATION_KIND =
  "primary_cta_text_and_href" as const;

export const CTA_MUTATION_POLICY_DIGEST =
  `sha256:${createHash("sha256")
    .update(JSON.stringify({
      protocol_version: CTA_AGENT_PROTOCOL_VERSION,
      mutation_kind: CTA_MUTATION_KIND,
      current_primary_cta: INITIAL_PRIMARY_CTA,
      requested_primary_cta: REQUESTED_PRIMARY_CTA,
      base_source_digest:
        ctaSourceDigest(initialCtaSpecimenSourceBytes()),
      reviewed_source_digest:
        ctaSourceDigest(requestedCtaSpecimenSourceBytes()),
      enforcement: [
        "base-source-must-match",
        "only-primary-cta-text-and-href",
        "requested-values-must-match",
        "app-reconstructs-reviewed-source",
      ],
    }))
    .digest("hex")}`;

const MAX_AGENT_OUTPUT_BYTES = 64 * 1024;
const DEFAULT_AGENT_TIMEOUT_MS = 60_000;
const REPAIRABLE_REQUIREMENT = "primary-cta-correct";

export interface CtaAgentFinding {
  requirement_id: string;
  label: string;
  explanation: string;
  repair_guidance?: string;
}

export interface CtaAgentRequest {
  version: typeof CTA_AGENT_PROTOCOL_VERSION;
  proposal_ref: string;
  base_source_digest: string;
  task: {
    title: string;
    description: string;
    requirements: readonly string[];
  };
  findings: readonly CtaAgentFinding[];
  current_primary_cta: {
    text: string;
    href: string;
  };
  requested_primary_cta: {
    text: string;
    href: string;
  };
  permitted_mutation: typeof CTA_MUTATION_KIND;
}

export interface CtaAgentProposal {
  version: typeof CTA_AGENT_PROTOCOL_VERSION;
  proposal_ref: string;
  base_source_digest: string;
  mutation: {
    kind: typeof CTA_MUTATION_KIND;
    text: string;
    href: string;
  };
  summary: string;
}

export interface CtaChangeAgent {
  readonly agent_id: string;
  propose(request: CtaAgentRequest): Promise<unknown>;
}

export interface CtaAgentChangeInput {
  source_bytes: Uint8Array;
  task: CtaAgentRequest["task"];
  findings: readonly CtaAgentFinding[];
}

export interface CtaAgentChangeOutput {
  source_bytes: Uint8Array;
  summary: string;
  changed_surface: "primary_cta";
  proposal: {
    proposal_ref: string;
    agent_id: string;
    base_source_digest: string;
    proposed_source_digest: string;
    mutation_policy_digest: string;
  };
}

export interface CtaAgentChangeExecutor {
  change(input: CtaAgentChangeInput): Promise<CtaAgentChangeOutput>;
}

function nonempty(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${context} must be a non-empty string.`);
  }
  return value;
}

function exactKeys(
  value: unknown,
  expected: readonly string[],
  context: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${context} must be an object.`);
  }
  const keys = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (
    keys.length !== allowed.length
    || keys.some((key, index) => key !== allowed[index])
  ) {
    throw new TypeError(
      `${context} may contain only ${expected.join(", ")}.`,
    );
  }
}

function assertNoNul(value: string, context: string): string {
  if (value.includes("\0")) {
    throw new TypeError(`${context} must not contain a NUL byte.`);
  }
  return value;
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function checkedFinding(
  value: unknown,
  index: number,
): CtaAgentFinding {
  exactKeys(
    value,
    [
      "requirement_id",
      "label",
      "explanation",
      ...(
        (value as { repair_guidance?: unknown }).repair_guidance
          === undefined
          ? []
          : ["repair_guidance"]
      ),
    ],
    `findings[${index}]`,
  );
  const finding = value as unknown as CtaAgentFinding;
  const checked: CtaAgentFinding = {
    requirement_id: nonempty(
      finding.requirement_id,
      `findings[${index}].requirement_id`,
    ),
    label: nonempty(finding.label, `findings[${index}].label`),
    explanation: nonempty(
      finding.explanation,
      `findings[${index}].explanation`,
    ),
    ...(finding.repair_guidance === undefined
      ? {}
      : {
          repair_guidance: nonempty(
            finding.repair_guidance,
            `findings[${index}].repair_guidance`,
          ),
        }),
  };
  return checked;
}

function checkedTask(
  value: unknown,
): CtaAgentRequest["task"] {
  exactKeys(
    value,
    ["title", "description", "requirements"],
    "task",
  );
  const task = value as unknown as CtaAgentRequest["task"];
  if (
    !Array.isArray(task.requirements)
    || task.requirements.length === 0
  ) {
    throw new TypeError(
      "task.requirements must contain non-empty strings.",
    );
  }
  return {
    title: nonempty(task.title, "task.title"),
    description: nonempty(task.description, "task.description"),
    requirements: task.requirements.map((requirement, index) =>
      nonempty(requirement, `task.requirements[${index}]`)),
  };
}

function checkedChangeInput(
  value: CtaAgentChangeInput,
): CtaAgentChangeInput {
  exactKeys(value, ["source_bytes", "task", "findings"], "change input");
  if (!(value.source_bytes instanceof Uint8Array)) {
    throw new TypeError("source_bytes must be a Uint8Array.");
  }
  if (!Array.isArray(value.findings) || value.findings.length === 0) {
    throw new TypeError(
      "The CTA agent requires meaning-level failed requirements.",
    );
  }
  const findings = value.findings.map(checkedFinding);
  if (
    findings.some(
      (finding) =>
        finding.requirement_id !== REPAIRABLE_REQUIREMENT,
    )
  ) {
    throw new TypeError(
      "The current findings do not authorize the bounded CTA change.",
    );
  }
  return {
    source_bytes: copyCtaSourceBytes(value.source_bytes),
    task: checkedTask(value.task),
    findings,
  };
}

function checkedProposal(
  value: unknown,
  request: CtaAgentRequest,
): CtaAgentProposal {
  exactKeys(
    value,
    [
      "version",
      "proposal_ref",
      "base_source_digest",
      "mutation",
      "summary",
    ],
    "agent proposal",
  );
  const proposal = value as Partial<CtaAgentProposal>;
  if (proposal.version !== CTA_AGENT_PROTOCOL_VERSION) {
    throw new TypeError("The agent proposal protocol version changed.");
  }
  if (proposal.proposal_ref !== request.proposal_ref) {
    throw new TypeError(
      "The agent proposal is not bound to the issued proposal reference.",
    );
  }
  if (proposal.base_source_digest !== request.base_source_digest) {
    throw new TypeError(
      "The agent proposal is not bound to the exact base source.",
    );
  }
  exactKeys(
    proposal.mutation,
    ["kind", "text", "href"],
    "agent proposal.mutation",
  );
  const mutation =
    proposal.mutation as CtaAgentProposal["mutation"];
  if (mutation.kind !== CTA_MUTATION_KIND) {
    throw new TypeError(
      "The agent proposed a mutation outside the pinned CTA policy.",
    );
  }
  if (
    mutation.text !== REQUESTED_PRIMARY_CTA.text
    || mutation.href !== REQUESTED_PRIMARY_CTA.href
  ) {
    throw new TypeError(
      "The agent proposal does not match the requested CTA values.",
    );
  }
  return Object.freeze({
    version: CTA_AGENT_PROTOCOL_VERSION,
    proposal_ref: request.proposal_ref,
    base_source_digest: request.base_source_digest,
    mutation: Object.freeze({
      kind: CTA_MUTATION_KIND,
      text: mutation.text,
      href: mutation.href,
    }),
    summary: nonempty(proposal.summary, "agent proposal.summary"),
  });
}

function sourceBytesEqual(
  left: Uint8Array,
  right: Uint8Array,
): boolean {
  return (
    left.byteLength === right.byteLength
    && left.every((byte, index) => byte === right[index])
  );
}

function exactReviewedCtaChange(
  baseSource: Uint8Array,
  proposal: CtaAgentProposal,
): Uint8Array {
  const base = Buffer.from(baseSource).toString("utf8");
  const first = base.indexOf(INITIAL_PRIMARY_CTA_DECLARATION);
  if (
    first < 0
    || base.indexOf(
      INITIAL_PRIMARY_CTA_DECLARATION,
      first + INITIAL_PRIMARY_CTA_DECLARATION.length,
    ) >= 0
  ) {
    throw new Error(
      "The exact app-owned primary CTA seam was not present once.",
    );
  }
  const replacement = primaryCtaDeclarationFromProposal(proposal);
  const changed = Buffer.from(
    `${base.slice(0, first)}${replacement}${base.slice(
      first + INITIAL_PRIMARY_CTA_DECLARATION.length,
    )}`,
    "utf8",
  );
  const expected = requestedCtaSpecimenSourceBytes();
  if (!sourceBytesEqual(changed, expected)) {
    throw new Error(
      "The proposed CTA change diverged from the exact reviewed source variant.",
    );
  }
  return copyCtaSourceBytes(expected);
}

function primaryCtaDeclarationFromProposal(
  proposal: CtaAgentProposal,
): string {
  const declaration =
    `const PRIMARY_CTA = Object.freeze(${JSON.stringify({
      text: proposal.mutation.text,
      href: proposal.mutation.href,
    })});`;
  if (declaration !== REQUESTED_PRIMARY_CTA_DECLARATION) {
    throw new Error(
      "The proposed CTA declaration changed outside the reviewed seam.",
    );
  }
  return declaration;
}

export function ctaAgentSupportsFindings(
  findings: readonly { requirement_id: string }[],
): boolean {
  return (
    Array.isArray(findings)
    && findings.length > 0
    && findings.every(
      (finding) =>
        finding
        && typeof finding === "object"
        && finding.requirement_id === REPAIRABLE_REQUIREMENT,
    )
  );
}

export function createReviewedFixtureCtaChangeAgent(): CtaChangeAgent {
  return Object.freeze({
    agent_id: "reviewed-fixture-cta-agent",
    async propose(
      request: CtaAgentRequest,
    ): Promise<CtaAgentProposal> {
      return {
        version: CTA_AGENT_PROTOCOL_VERSION,
        proposal_ref: request.proposal_ref,
        base_source_digest: request.base_source_digest,
        mutation: {
          kind: CTA_MUTATION_KIND,
          text: request.requested_primary_cta.text,
          href: request.requested_primary_cta.href,
        },
        summary:
          "Changed the primary CTA copy and destination to the requested pricing action.",
      };
    },
  });
}

export function createSubprocessCtaChangeAgent(input: {
  agent_id: string;
  command: string;
  cwd: string;
  args?: readonly string[];
  env?: Readonly<Record<string, string>>;
  timeout_ms?: number;
}): CtaChangeAgent {
  exactKeys(
    input,
    [
      "agent_id",
      "command",
      "cwd",
      ...(input.args === undefined ? [] : ["args"]),
      ...(input.env === undefined ? [] : ["env"]),
      ...(input.timeout_ms === undefined ? [] : ["timeout_ms"]),
    ],
    "subprocess agent configuration",
  );
  const agentId = assertNoNul(
    nonempty(input.agent_id, "agent_id"),
    "agent_id",
  );
  const unsafeCommand = assertNoNul(
    nonempty(input.command, "command"),
    "command",
  );
  if (!path.isAbsolute(unsafeCommand)) {
    throw new TypeError(
      "command must be an absolute executable path.",
    );
  }
  const commandStats = lstatSync(unsafeCommand);
  if (!commandStats.isFile() || commandStats.isSymbolicLink()) {
    throw new TypeError(
      "command must be an explicit real executable file, not a symbolic link.",
    );
  }
  accessSync(unsafeCommand, constants.X_OK);
  const command = realpathSync(unsafeCommand);
  const unsafeCwd = path.resolve(
    assertNoNul(nonempty(input.cwd, "cwd"), "cwd"),
  );
  const cwdStats = lstatSync(unsafeCwd);
  if (!cwdStats.isDirectory() || cwdStats.isSymbolicLink()) {
    throw new TypeError(
      "cwd must be an explicit real directory, not a symbolic link.",
    );
  }
  const cwd = realpathSync(unsafeCwd);
  const args = (input.args ?? []).map((argument, index) =>
    assertNoNul(
      nonempty(argument, `args[${index}]`),
      `args[${index}]`,
    ));
  const timeoutMs =
    input.timeout_ms ?? DEFAULT_AGENT_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(timeoutMs)
    || timeoutMs <= 0
    || timeoutMs > 10 * 60_000
  ) {
    throw new TypeError(
      "timeout_ms must be a positive safe integer no greater than ten minutes.",
    );
  }
  let env: NodeJS.ProcessEnv = {};
  if (input.env !== undefined) {
    if (
      !input.env
      || typeof input.env !== "object"
      || Array.isArray(input.env)
      || Object.getPrototypeOf(input.env) !== Object.prototype
    ) {
      throw new TypeError(
        "subprocess agent env must be a plain explicit string map.",
      );
    }
    env = Object.fromEntries(
      Object.entries(input.env).map(([key, value]) => [
        assertNoNul(nonempty(key, "env key"), "env key"),
        assertNoNul(value, `env.${key}`),
      ]),
    );
  }

  return Object.freeze({
    agent_id: agentId,
    async propose(request: CtaAgentRequest): Promise<unknown> {
      return await new Promise((resolve, reject) => {
        const child = spawn(command, args, {
          cwd,
          env,
          shell: false,
          stdio: ["pipe", "pipe", "ignore"],
          windowsHide: true,
        });
        const stdout: Buffer[] = [];
        let stdoutBytes = 0;
        let settled = false;
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          finish(new Error("The CTA agent proposal timed out."));
        }, timeoutMs);
        timer.unref();

        function finish(
          error: Error | null,
          value?: unknown,
        ): void {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(value);
        }

        child.once("error", (error) => finish(error));
        child.stdout.on("data", (chunk: Buffer) => {
          stdoutBytes += chunk.byteLength;
          if (stdoutBytes > MAX_AGENT_OUTPUT_BYTES) {
            child.kill("SIGKILL");
            finish(
              new Error(
                "The CTA agent stdout exceeded the protocol limit.",
              ),
            );
            return;
          }
          stdout.push(Buffer.from(chunk));
        });
        child.once("close", (code, signal) => {
          if (settled) return;
          if (code !== 0) {
            finish(
              new Error(
                `The CTA agent exited unsuccessfully (${String(
                  code ?? signal,
                )}).`,
              ),
            );
            return;
          }
          const output = Buffer.concat(stdout).toString("utf8").trim();
          if (!output) {
            finish(new Error("The CTA agent returned no proposal."));
            return;
          }
          try {
            finish(null, JSON.parse(output));
          } catch {
            finish(
              new Error(
                "The CTA agent stdout must be exactly one JSON value.",
              ),
            );
          }
        });
        child.stdin.once("error", (error) => finish(error));
        child.stdin.end(`${JSON.stringify(request)}\n`);
      });
    },
  });
}

export function createCtaAgentChangeExecutor(input: {
  agent: CtaChangeAgent;
}): CtaAgentChangeExecutor {
  exactKeys(input, ["agent"], "CTA change executor configuration");
  if (
    !input.agent
    || typeof input.agent !== "object"
    || typeof input.agent.propose !== "function"
  ) {
    throw new TypeError("agent.propose must be a function.");
  }
  const agentId = nonempty(input.agent.agent_id, "agent.agent_id");
  const propose = input.agent.propose.bind(input.agent);
  let proposalOrdinal = 0;

  return Object.freeze({
    async change(
      unsafeInput: CtaAgentChangeInput,
    ): Promise<CtaAgentChangeOutput> {
      const checked = checkedChangeInput(unsafeInput);
      const expectedBase = initialCtaSpecimenSourceBytes();
      if (!sourceBytesEqual(checked.source_bytes, expectedBase)) {
        throw new Error(
          "The CTA agent refused source bytes outside its exact base revision.",
        );
      }
      const baseSourceDigest = ctaSourceDigest(checked.source_bytes);
      proposalOrdinal += 1;
      const request: CtaAgentRequest = Object.freeze({
        version: CTA_AGENT_PROTOCOL_VERSION,
        proposal_ref:
          `cta_proposal_${String(proposalOrdinal).padStart(4, "0")}`,
        base_source_digest: baseSourceDigest,
        task: Object.freeze({
          ...checked.task,
          requirements: Object.freeze([...checked.task.requirements]),
        }),
        findings: Object.freeze(
          checked.findings.map((finding) => Object.freeze({ ...finding })),
        ),
        current_primary_cta: INITIAL_PRIMARY_CTA,
        requested_primary_cta: REQUESTED_PRIMARY_CTA,
        permitted_mutation: CTA_MUTATION_KIND,
      });
      const unsafeProposal = await propose(cloneJson(request));
      const proposal = checkedProposal(unsafeProposal, request);
      const changedSource = exactReviewedCtaChange(
        checked.source_bytes,
        proposal,
      );
      if (ctaSourceDigest(changedSource) === baseSourceDigest) {
        throw new Error(
          "The CTA proposal did not produce a distinct source identity.",
        );
      }
      return Object.freeze({
        source_bytes: changedSource,
        summary: proposal.summary,
        changed_surface: "primary_cta" as const,
        proposal: Object.freeze({
          proposal_ref: proposal.proposal_ref,
          agent_id: agentId,
          base_source_digest: baseSourceDigest,
          proposed_source_digest: ctaSourceDigest(changedSource),
          mutation_policy_digest: CTA_MUTATION_POLICY_DIGEST,
        }),
      });
    },
  });
}
