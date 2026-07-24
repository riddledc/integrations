import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  RIDDLE_PROOF_BROWSER_TRANSITION_PROTOCOL_VERSION,
} from "@riddledc/riddle-proof-runner-playwright";

import {
  PROOF_GUIDED_WEB_CHANGE_CONTRACT_VERSION,
  type PinnedWebChangeContract,
  type WebChangeContractDefinition,
  type WebChangeJsonValue,
  type WebChangeProfileRole,
} from "./types.js";

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const PROFILE_ROLES = [
  "before",
  "action",
  "reload",
  "fresh_context",
] as const satisfies readonly WebChangeProfileRole[];

function nonempty(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${context} must be a non-empty string.`);
  }
  return value;
}

function digest(value: unknown, context: string): string {
  const checked = nonempty(value, context);
  if (!SHA256.test(checked)) {
    throw new TypeError(`${context} must be a full lowercase sha256 digest.`);
  }
  return checked;
}

function sourceDigest(sourceJson: string): string {
  return `sha256:${createHash("sha256").update(
    Buffer.from(sourceJson, "utf8"),
  ).digest("hex")}`;
}

function plainJsonObject(
  sourceJson: string,
  context: string,
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(sourceJson);
  } catch {
    throw new TypeError(`${context} must be valid JSON.`);
  }
  if (
    parsed === null
    || typeof parsed !== "object"
    || Array.isArray(parsed)
  ) {
    throw new TypeError(`${context} must encode a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function canonicalJson(
  value: unknown,
  context = "value",
): WebChangeJsonValue {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${context} contains a non-finite number.`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    const ownKeys = Reflect.ownKeys(value).filter((key) => key !== "length");
    if (
      ownKeys.length !== value.length
      || ownKeys.some((key, index) => key !== String(index))
    ) {
      throw new TypeError(
        `${context} must be a dense JSON array without extra properties.`,
      );
    }
    return Array.from(value, (member, index) =>
      canonicalJson(member, `${context}[${index}]`));
  }
  if (typeof value !== "object") {
    throw new TypeError(`${context} must contain only JSON data.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${context} must be a plain JSON object.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).some((key) => typeof key !== "string")
    || Object.values(descriptors).some(
      (descriptor) => !descriptor.enumerable || !("value" in descriptor),
    )
  ) {
    throw new TypeError(
      `${context} must contain only enumerable JSON data properties.`,
    );
  }
  const output = Object.create(null) as Record<
    string,
    WebChangeJsonValue
  >;
  for (const key of Object.keys(descriptors).sort()) {
    const member = descriptors[key]!.value as unknown;
    if (member === undefined) {
      throw new TypeError(`${context}.${key} must not be undefined.`);
    }
    output[key] = canonicalJson(member, `${context}.${key}`);
  }
  return output;
}

export function canonicalWebChangeDigest(value: unknown): string {
  const encoded = JSON.stringify(canonicalJson(value));
  return `sha256:${createHash("sha256").update(encoded).digest("hex")}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const member of Object.values(value)) {
      deepFreeze(member);
    }
  }
  return value;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function validateDefinition(
  value: WebChangeContractDefinition,
): WebChangeContractDefinition {
  const requirementIds = new Set<string>();
  const requirements = value.requirements.map((requirement, index) => {
    const requirementId = nonempty(
      requirement.requirement_id,
      `contract.requirements[${index}].requirement_id`,
    );
    if (requirementIds.has(requirementId)) {
      throw new TypeError(
        `contract requirement ${requirementId} must be unique.`,
      );
    }
    requirementIds.add(requirementId);
    return {
      requirement_id: requirementId,
      label: nonempty(
        requirement.label,
        `contract.requirements[${index}].label`,
      ),
      failure_summary: nonempty(
        requirement.failure_summary,
        `contract.requirements[${index}].failure_summary`,
      ),
      repair_guidance: nonempty(
        requirement.repair_guidance,
        `contract.requirements[${index}].repair_guidance`,
      ),
    };
  });
  if (requirements.length !== 3) {
    throw new TypeError(
      "The durable browser transition contract requires exactly three requirements.",
    );
  }

  const profiles = Object.fromEntries(PROFILE_ROLES.map((role) => {
    const profile = value.profiles[role];
    if (!profile) {
      throw new TypeError(`contract.profiles.${role} is required.`);
    }
    const profileName = nonempty(
      profile.profile_name,
      `contract.profiles.${role}.profile_name`,
    );
    const claimedSourceDigest = digest(
      profile.source_digest,
      `contract.profiles.${role}.source_digest`,
    );
    const sourceJson = nonempty(
      profile.source_json,
      `contract.profiles.${role}.source_json`,
    );
    const actualSourceDigest = sourceDigest(sourceJson);
    if (actualSourceDigest !== claimedSourceDigest) {
      throw new TypeError(
        `contract.profiles.${role}.source_digest does not match the exact pinned profile JSON bytes.`,
      );
    }
    const parsed = plainJsonObject(
      sourceJson,
      `contract.profiles.${role}.source_json`,
    );
    if (parsed.name !== profileName) {
      throw new TypeError(
        `contract.profiles.${role}.profile_name does not match the pinned profile JSON name.`,
      );
    }
    return [role, {
      profile_name: profileName,
      source_digest: claimedSourceDigest,
      source_json: sourceJson,
    }];
  })) as unknown as WebChangeContractDefinition["profiles"];

  const profileNames = PROFILE_ROLES.map((role) =>
    profiles[role].profile_name);
  const sourceDigests = PROFILE_ROLES.map((role) =>
    profiles[role].source_digest);
  if (new Set(profileNames).size !== PROFILE_ROLES.length) {
    throw new TypeError("Pinned profile names must be distinct.");
  }
  if (new Set(sourceDigests).size !== PROFILE_ROLES.length) {
    throw new TypeError("Pinned profile source digests must be distinct.");
  }

  if (value.non_conclusions.length === 0) {
    throw new TypeError(
      "contract.non_conclusions must state at least one proof boundary.",
    );
  }

  const protocolVersion = nonempty(
    value.protocol_version,
    "contract.protocol_version",
  );
  if (
    protocolVersion !== RIDDLE_PROOF_BROWSER_TRANSITION_PROTOCOL_VERSION
  ) {
    throw new TypeError(
      `contract.protocol_version must be ${RIDDLE_PROOF_BROWSER_TRANSITION_PROTOCOL_VERSION}.`,
    );
  }

  return {
    id: nonempty(value.id, "contract.id"),
    version: nonempty(value.version, "contract.version"),
    protocol_version: protocolVersion,
    transition_id: nonempty(value.transition_id, "contract.transition_id"),
    expected_root: {
      claim_id: nonempty(
        value.expected_root.claim_id,
        "contract.expected_root.claim_id",
      ),
      claim_version: nonempty(
        value.expected_root.claim_version,
        "contract.expected_root.claim_version",
      ),
    },
    profiles,
    requirements,
    non_conclusions: value.non_conclusions.map((boundary, index) =>
      nonempty(boundary, `contract.non_conclusions[${index}]`)),
  };
}

export function createPinnedWebChangeContract(
  definition: WebChangeContractDefinition,
): PinnedWebChangeContract {
  const checked = validateDefinition(cloneJson(definition));
  const pinned: PinnedWebChangeContract = {
    contract_format: PROOF_GUIDED_WEB_CHANGE_CONTRACT_VERSION,
    ...checked,
    digest: canonicalWebChangeDigest({
      contract_format: PROOF_GUIDED_WEB_CHANGE_CONTRACT_VERSION,
      ...checked,
    }),
  };
  return deepFreeze(pinned);
}

export function assertPinnedWebChangeContract(
  value: PinnedWebChangeContract,
): void {
  if (
    value.contract_format !== PROOF_GUIDED_WEB_CHANGE_CONTRACT_VERSION
  ) {
    throw new TypeError("Unsupported proof-guided web-change contract format.");
  }
  const recreated = createPinnedWebChangeContract({
    id: value.id,
    version: value.version,
    protocol_version: value.protocol_version,
    transition_id: value.transition_id,
    expected_root: value.expected_root,
    profiles: value.profiles,
    requirements: value.requirements,
    non_conclusions: value.non_conclusions,
  });
  if (recreated.digest !== value.digest) {
    throw new TypeError(
      "Pinned web-change contract digest does not match its definition.",
    );
  }
}

export const DURABLE_TEXT_TRANSITION_CONTRACT =
  createPinnedWebChangeContract({
    id: "riddle-proof.web-change.durable-text-transition",
    version: "1",
    protocol_version: "riddle-proof.browser-transition-protocol.v3",
    transition_id: "browser-transition-marker-7c83",
    expected_root: {
      claim_id: "riddle-proof.browser.durable-state-transition-observed",
      claim_version: "1",
    },
    profiles: {
      before: {
        profile_name: "transition-before-state",
        source_digest:
          "sha256:1f5d16858d36eddbf123740097ce3849a3fb842246c4b1f0900d4f1c6312710b",
        source_json: readFileSync(
          new URL("../profiles/before.json", import.meta.url),
          "utf8",
        ),
      },
      action: {
        profile_name: "transition-action-and-after",
        source_digest:
          "sha256:5a77332f4a546d995237745bfcdc2a4992a5126c0d40386b0670f66d538f413d",
        source_json: readFileSync(
          new URL("../profiles/action.json", import.meta.url),
          "utf8",
        ),
      },
      reload: {
        profile_name: "transition-reload-readback",
        source_digest:
          "sha256:9c183fb0b7b5c3e7e29d145665b21a94395e20aa5f6c8d961a0f4ef3693343d4",
        source_json: readFileSync(
          new URL("../profiles/reload.json", import.meta.url),
          "utf8",
        ),
      },
      fresh_context: {
        profile_name: "transition-fresh-context-readback",
        source_digest:
          "sha256:a309954ff7c145ec3312bd4a95f1af890254664ea4e07842497c7e823f240080",
        source_json: readFileSync(
          new URL("../profiles/fresh-context.json", import.meta.url),
          "utf8",
        ),
      },
    },
    requirements: [
      {
        requirement_id: "declared_transition_observed",
        label: "The requested browser change appears immediately",
        failure_summary:
          "The requested browser change did not produce its required immediate result.",
        repair_guidance:
          "Repair the action or its immediate result, then run the same pinned check again.",
      },
      {
        requirement_id: "transition_survived_reload",
        label: "The changed state survives reload",
        failure_summary:
          "The changed state did not survive a browser reload.",
        repair_guidance:
          "Persist the changed state beyond the current page, then run the same pinned check again.",
      },
      {
        requirement_id: "transition_visible_in_fresh_context",
        label: "The changed state appears in a fresh browser context",
        failure_summary:
          "The changed state was not visible in a fresh browser context.",
        repair_guidance:
          "Persist the changed state outside the original browser context, then run the same pinned check again.",
      },
    ],
    non_conclusions: [
      "The check does not establish why the target changed or which actor caused it.",
      "The check does not establish correctness outside the four pinned browser profiles.",
      "The check does not establish future availability.",
    ],
  });
