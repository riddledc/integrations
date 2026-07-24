import type {
  ApplicationAuthority,
  ApplicationSubjectRef,
  JsonValue,
} from "../src/types.js";

export const BROWSER_PUBLISHING_ROOT = {
  claim_id: "riddle-proof.browser.durable-state-transition-observed",
  claim_version: "1",
} as const;

export const BROWSER_PUBLISHING_REQUIREMENT_CLAIMS = [
  {
    requirement_id: "declared_transition_observed",
    claim_id: "riddle-proof.browser.transition-observed",
    claim_version: "1",
  },
  {
    requirement_id: "transition_survived_reload",
    claim_id: "riddle-proof.browser.transition-survived-reload",
    claim_version: "1",
  },
  {
    requirement_id: "transition_visible_in_fresh_context",
    claim_id: "riddle-proof.browser.transition-visible-in-fresh-context",
    claim_version: "1",
  },
] as const;

export function createBrowserPublishingAuthority(input: {
  authority_digest: string;
  specification_digest: string;
  expected_root_parameters: Readonly<Record<string, JsonValue>>;
}): ApplicationAuthority {
  return {
    authority_id: "riddle-proof.example.browser-publishing",
    authority_version: "1",
    authority_digest: input.authority_digest,
    specification: {
      ref: {
        id: "riddle-proof.example.browser-publishing.durable-transition",
        version: "1",
        digest: input.specification_digest,
      },
      expected_root: {
        ...BROWSER_PUBLISHING_ROOT,
        parameters: input.expected_root_parameters,
      },
      requirements: [
        {
          requirement_id: "declared_transition_observed",
          label: "The declared transition was observed from its before state through its immediate result",
          failure_summary: "The declared transition did not produce its required immediate result.",
          repair_guidance: "Repair the action or its immediate result, then capture the pinned before and action profiles again.",
        },
        {
          requirement_id: "transition_survived_reload",
          label: "The resulting state survived reload",
          failure_summary: "The resulting state did not survive reload.",
          repair_guidance: "Persist the state beyond the current page and rerun the pinned reload profile.",
        },
        {
          requirement_id: "transition_visible_in_fresh_context",
          label: "The resulting state was visible in a fresh browser context",
          failure_summary: "The resulting state was not visible in a fresh browser context.",
          repair_guidance: "Persist the state outside the original browser context and rerun the pinned fresh-context profile.",
        },
      ],
      non_conclusions: [
        "database truth",
        "metaphysical causation",
        "correctness of features outside the pinned profiles",
        "future availability",
      ],
    },
  };
}

export function createBrowserPublishingSubject(input: {
  repository: string;
  revision: string;
  target: string;
  digest: string;
}): ApplicationSubjectRef {
  return {
    id: `${input.repository}@${input.revision}:${input.target}`,
    digest: input.digest,
    kind: "published_browser_revision",
  };
}
