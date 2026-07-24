import {
  PAGE_ONLY_SAVE_DECLARATION,
  SERVER_BACKED_SAVE_DECLARATION,
  SERVER_STATE_ENDPOINT_IMPLEMENTATION,
  STATE_ENDPOINT_INSERTION_ANCHOR,
  copySourceBytes,
  pageOnlySpecimenSourceBytes,
  serverBackedSpecimenSourceBytes,
  sourceDigest,
} from "./specimen.js";

const UTF8_DECODER = new TextDecoder("utf8", { fatal: true });
const UTF8_ENCODER = new TextEncoder();

const REPAIRABLE_REQUIREMENTS = new Set([
  "transition_survived_reload",
  "transition_visible_in_fresh_context",
]);

export interface DurableSettingTaskContext {
  title: string;
  description: string;
  requirements: readonly string[];
}

export interface RepairMeaningFinding {
  requirement_id: string;
  label: string;
  explanation: string;
  repair_guidance?: string;
}

export interface DurableSettingRepairInput {
  source_bytes: Uint8Array;
  task: DurableSettingTaskContext;
  findings: readonly RepairMeaningFinding[];
}

export interface DurableSettingRepairOutput {
  source_bytes: Uint8Array;
  summary: string;
  changed_surface: "server.mjs";
}

export interface DurableSettingRepairExecutor {
  repair(
    input: DurableSettingRepairInput,
  ): Promise<DurableSettingRepairOutput>;
}

export function durableSettingRepairSupportsFindings(
  findings: readonly {
    requirement_id: string;
  }[],
): boolean {
  return (
    Array.isArray(findings)
    && findings.length > 0
    && findings.every(
      (finding) =>
        finding
        && typeof finding === "object"
        && REPAIRABLE_REQUIREMENTS.has(finding.requirement_id),
    )
  );
}

function exactKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Repair input must contain only reviewed data.");
  }
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  if (
    keys.length < required.length
    || required.some((key) => !Object.hasOwn(value, key))
    || keys.some((key) => !allowed.has(key))
  ) {
    throw new TypeError("Repair input must contain only reviewed data.");
  }
}

function nonempty(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${context} must be a non-empty string.`);
  }
  return value;
}

function assertRepairInput(
  input: DurableSettingRepairInput,
): DurableSettingRepairInput {
  exactKeys(input, ["source_bytes", "task", "findings"]);
  if (!(input.source_bytes instanceof Uint8Array)) {
    throw new TypeError("source_bytes must be a Uint8Array.");
  }
  exactKeys(input.task, ["title", "description", "requirements"]);
  nonempty(input.task.title, "task.title");
  nonempty(input.task.description, "task.description");
  if (
    !Array.isArray(input.task.requirements)
    || input.task.requirements.length === 0
    || input.task.requirements.some(
      (requirement) =>
        typeof requirement !== "string"
        || requirement.trim().length === 0,
    )
  ) {
    throw new TypeError(
      "task.requirements must contain non-empty requirement labels.",
    );
  }
  if (!Array.isArray(input.findings) || input.findings.length === 0) {
    throw new TypeError(
      "A deterministic repair requires meaning-level failed requirements.",
    );
  }
  for (const [index, finding] of input.findings.entries()) {
    exactKeys(
      finding,
      ["requirement_id", "label", "explanation"],
      ["repair_guidance"],
    );
    nonempty(
      finding.requirement_id,
      `findings[${index}].requirement_id`,
    );
    nonempty(finding.label, `findings[${index}].label`);
    nonempty(finding.explanation, `findings[${index}].explanation`);
    if (finding.repair_guidance !== undefined) {
      nonempty(
        finding.repair_guidance,
        `findings[${index}].repair_guidance`,
      );
    }
  }
  if (!durableSettingRepairSupportsFindings(input.findings)) {
    throw new TypeError(
      "The checked findings do not authorize the durable-setting repair.",
    );
  }
  return input;
}

function replaceExactlyOnce(
  source: string,
  expected: string,
  replacement: string,
  context: string,
): string {
  const first = source.indexOf(expected);
  if (first < 0 || source.indexOf(expected, first + expected.length) >= 0) {
    throw new Error(
      `The exact ${context} seam was not present exactly once.`,
    );
  }
  return `${source.slice(0, first)}${replacement}${source.slice(
    first + expected.length,
  )}`;
}

export const PAGE_ONLY_SPECIMEN_SOURCE_DIGEST = sourceDigest(
  pageOnlySpecimenSourceBytes(),
);

/**
 * The repair implementation owns its expected base digest. The application
 * supplies bytes and meaning-level findings only; it cannot override the base
 * identity or pass proof/audit material through this input.
 */
export function createDeterministicDurableSettingRepairExecutor(): DurableSettingRepairExecutor {
  return Object.freeze({
    async repair(
      unsafeInput: DurableSettingRepairInput,
    ): Promise<DurableSettingRepairOutput> {
      const input = assertRepairInput(unsafeInput);
      const ownedSourceBytes = copySourceBytes(input.source_bytes);
      if (
        sourceDigest(ownedSourceBytes)
        !== PAGE_ONLY_SPECIMEN_SOURCE_DIGEST
      ) {
        throw new Error(
          "The repair refused source bytes that do not match its exact base source digest.",
        );
      }

      let sourceText: string;
      try {
        sourceText = UTF8_DECODER.decode(ownedSourceBytes);
      } catch {
        throw new Error("The exact base source must be valid UTF-8.");
      }
      sourceText = replaceExactlyOnce(
        sourceText,
        PAGE_ONLY_SAVE_DECLARATION,
        SERVER_BACKED_SAVE_DECLARATION,
        "page-only save",
      );
      sourceText = replaceExactlyOnce(
        sourceText,
        STATE_ENDPOINT_INSERTION_ANCHOR,
        `${SERVER_STATE_ENDPOINT_IMPLEMENTATION}\n${STATE_ENDPOINT_INSERTION_ANCHOR}`,
        "server state endpoint",
      );
      const repairedSourceBytes = UTF8_ENCODER.encode(sourceText);
      if (
        sourceDigest(repairedSourceBytes)
        === PAGE_ONLY_SPECIMEN_SOURCE_DIGEST
      ) {
        throw new Error(
          "The deterministic repair did not produce a distinct source identity.",
        );
      }
      const expectedRepairedSourceBytes =
        serverBackedSpecimenSourceBytes();
      if (
        repairedSourceBytes.byteLength
          !== expectedRepairedSourceBytes.byteLength
        || repairedSourceBytes.some(
          (byte, index) => byte !== expectedRepairedSourceBytes[index],
        )
      ) {
        throw new Error(
          "The deterministic repair diverged from the exact app-owned repaired source.",
        );
      }

      return Object.freeze({
        source_bytes: copySourceBytes(expectedRepairedSourceBytes),
        summary:
          "Replaced page-only Save behavior with server-backed persistence.",
        changed_surface: "server.mjs" as const,
      });
    },
  });
}
