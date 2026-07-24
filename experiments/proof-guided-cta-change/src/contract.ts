import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { normalizeRiddleProofProfile } from "@riddledc/riddle-proof-core";
import {
  RIDDLE_PROOF_BROWSER_SEALED_CLAIMS,
} from "@riddledc/riddle-proof-runner-playwright";

import { canonicalDigest, deepFreeze, sha256Bytes } from "./digest.js";
import {
  CTA_REQUIREMENT_IDS,
  PROOF_GUIDED_CTA_CHANGE_CONTRACT_VERSION,
  PROOF_GUIDED_CTA_CHANGE_PROTOCOL_VERSION,
  type CtaRequirementDefinition,
  type PinnedCtaChangeContract,
} from "./types.js";

const PROFILE_URL = new URL("../profiles/cta-conformance.json", import.meta.url);

const REQUIREMENTS: readonly CtaRequirementDefinition[] = [
  {
    requirement_id: "primary-cta-correct",
    label: "Primary CTA matches the requested destination and wording",
    failure_summary:
      "The one visible primary CTA did not use the exact pinned /pricing destination and “View pricing” wording.",
    repair_guidance:
      "Change only the primary CTA so its href is /pricing and its visible text is View pricing.",
  },
  {
    requirement_id: "routes-preserved",
    label: "Pinned routes remain present and healthy",
    failure_summary:
      "The home, features, or pricing route surface no longer matched the pinned route inventory and health checks.",
    repair_guidance:
      "Restore the exact Home, Features, and Pricing route inventory and make every pinned route load successfully.",
  },
  {
    requirement_id: "responsive-layout-healthy",
    label: "Declared mobile and desktop layouts remain within horizontal bounds",
    failure_summary:
      "The page exceeded the pinned horizontal-overflow tolerance at a declared viewport.",
    repair_guidance:
      "Remove the horizontal overflow without weakening the pinned mobile or desktop viewport contract.",
  },
  {
    requirement_id: "runtime-healthy",
    label: "Captured browser runtime remains complete and free of fatal errors",
    failure_summary:
      "The browser capture contained a fatal console/page error or incomplete DOM evidence.",
    repair_guidance:
      "Fix the runtime error and rerun the unchanged pinned profile with complete DOM evidence.",
  },
] as const;

function profileSource(): string {
  return readFileSync(fileURLToPath(PROFILE_URL), "utf8");
}

function buildContract(): PinnedCtaChangeContract {
  const sourceJson = profileSource();
  const parsed = JSON.parse(sourceJson) as unknown;
  const normalized = normalizeRiddleProofProfile(parsed);
  const profile = {
    profile_name: normalized.name,
    source_json: sourceJson,
    source_digest: sha256Bytes(Buffer.from(sourceJson, "utf8")),
  };
  const body = {
    contract_format: PROOF_GUIDED_CTA_CHANGE_CONTRACT_VERSION,
    id: "riddle-proof.cta-route-layout-runtime-conformance",
    version: "1",
    protocol_version: PROOF_GUIDED_CTA_CHANGE_PROTOCOL_VERSION,
    profile,
    expected_root: {
      claim_id:
        RIDDLE_PROOF_BROWSER_SEALED_CLAIMS.sealed_profile_satisfied.claim_id,
      claim_version:
        RIDDLE_PROOF_BROWSER_SEALED_CLAIMS.sealed_profile_satisfied.claim_version,
    },
    requirements: REQUIREMENTS,
    non_conclusions: [
      "This check establishes only the exact pinned CTA, route, viewport-overflow, and captured-runtime requirements.",
      "It does not establish design quality, business effectiveness, accessibility beyond declared checks, or the truth of content not encoded in the profile.",
      "A successful proof describes the exact captured candidate and becomes stale when that candidate changes.",
    ],
  } as const;
  return deepFreeze({
    ...body,
    digest: canonicalDigest(body),
  });
}

export function createPinnedCtaChangeContract(): PinnedCtaChangeContract {
  return buildContract();
}

export const PINNED_CTA_CHANGE_CONTRACT = createPinnedCtaChangeContract();

export function assertPinnedCtaChangeContract(
  value: PinnedCtaChangeContract,
): void {
  const expected = buildContract();
  if (!isDeepStrictEqual(value, expected)) {
    throw new TypeError(
      "CTA-change contract must equal the exact installed profile and requirement trust root.",
    );
  }
  if (
    !isDeepStrictEqual(
      value.requirements.map(({ requirement_id }) => requirement_id),
      CTA_REQUIREMENT_IDS,
    )
  ) {
    throw new TypeError("CTA-change contract requirement order is invalid.");
  }
}
