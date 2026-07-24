import { projectApplicationResult } from "riddle-proof-application-projection-experiment";

import {
  assertCtaCandidateResolution,
  createResolvedCtaCandidate,
  deriveCtaAttemptAuthority,
} from "./authority.js";
import {
  assertPinnedCtaChangeContract,
  createPinnedCtaChangeContract,
} from "./contract.js";
import { cloneJson, deepFreeze } from "./digest.js";
import { presentCtaCheck } from "./presentation.js";
import type {
  CtaAttemptAuthority,
  CtaCheckRecord,
  CtaInspectionLevel,
  CtaInspectionView,
  CtaOutcomeView,
  CtaProjectionResult,
  ProofGuidedCtaChangeClient,
  ProofGuidedCtaChangeClientConfiguration,
  ResolvedCtaCandidate,
} from "./types.js";

function assertRequest(
  value: unknown,
): asserts value is { candidate_ref: string } {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.keys(value).length !== 1
    || !Object.hasOwn(value, "candidate_ref")
    || typeof (value as { candidate_ref?: unknown }).candidate_ref !== "string"
    || !(value as { candidate_ref: string }).candidate_ref.trim()
  ) {
    throw new TypeError(
      "CTA-change request may contain only a non-empty candidate_ref.",
    );
  }
}

function unavailable(input: {
  check_ref: string;
  candidate_ref: string;
  contract: ReturnType<typeof createPinnedCtaChangeContract>;
  diagnostic_code: string;
  candidate?: ResolvedCtaCandidate;
  authority?: CtaAttemptAuthority;
}): CtaCheckRecord {
  return deepFreeze({
    check_ref: input.check_ref,
    candidate_ref: input.candidate_ref,
    contract: input.contract,
    candidate: input.candidate ?? null,
    authority: input.authority ?? null,
    projection: null,
    diagnostics: [{ code: input.diagnostic_code }],
  });
}

export function createProofGuidedCtaChangeClient(
  configuration: ProofGuidedCtaChangeClientConfiguration,
): ProofGuidedCtaChangeClient {
  assertPinnedCtaChangeContract(configuration.contract);
  if (
    !configuration.candidate_resolver
    || typeof configuration.candidate_resolver.resolve !== "function"
    || !configuration.report_provider
    || typeof configuration.report_provider.check !== "function"
  ) {
    throw new TypeError(
      "CTA client requires candidate_resolver.resolve and report_provider.check.",
    );
  }
  const contract = createPinnedCtaChangeContract();
  const resolve = configuration.candidate_resolver.resolve.bind(
    configuration.candidate_resolver,
  );
  const report = configuration.report_provider.check.bind(
    configuration.report_provider,
  );
  const records = new Map<string, CtaCheckRecord>();
  let ordinal = 0;

  function save(record: CtaCheckRecord): CtaOutcomeView {
    records.set(record.check_ref, record);
    return presentCtaCheck(record, "outcome") as CtaOutcomeView;
  }

  return Object.freeze({
    contract,
    async check(request: { candidate_ref: string }): Promise<CtaOutcomeView> {
      assertRequest(request);
      ordinal += 1;
      const checkRef = `ctacheck_${ordinal}`;
      const candidateRef = request.candidate_ref;
      let candidate: ResolvedCtaCandidate;
      try {
        const resolution = await resolve({
          candidate_ref: candidateRef,
          contract,
        });
        assertCtaCandidateResolution({
          candidate_ref: candidateRef,
          resolution,
        });
        candidate = deepFreeze(cloneJson(createResolvedCtaCandidate({
          contract,
          candidate_ref: candidateRef,
          scope: resolution.scope,
        })));
      } catch {
        return save(unavailable({
          check_ref: checkRef,
          candidate_ref: candidateRef,
          contract,
          diagnostic_code: "candidate_resolution_failed",
        }));
      }
      let authority: CtaAttemptAuthority;
      try {
        authority = deriveCtaAttemptAuthority({ contract, candidate });
      } catch {
        return save(unavailable({
          check_ref: checkRef,
          candidate_ref: candidateRef,
          contract,
          candidate,
          diagnostic_code: "attempt_authority_derivation_failed",
        }));
      }
      let projection: CtaProjectionResult;
      try {
        const verification = await report({
          contract,
          candidate,
          authority,
        });
        projection = projectApplicationResult({
          authority,
          subject: candidate.subject,
          verification,
        });
      } catch {
        return save(unavailable({
          check_ref: checkRef,
          candidate_ref: candidateRef,
          contract,
          candidate,
          authority,
          diagnostic_code: "report_provider_failed",
        }));
      }
      return save(deepFreeze({
        check_ref: checkRef,
        candidate_ref: candidateRef,
        contract,
        candidate,
        authority,
        projection,
        diagnostics: [],
      }));
    },
    inspect(
      checkRef: string,
      level: CtaInspectionLevel = "outcome",
    ): CtaInspectionView {
      if (typeof checkRef !== "string" || !checkRef.trim()) {
        throw new TypeError("check_ref must be a non-empty string.");
      }
      const record = records.get(checkRef);
      if (!record) throw new Error(`No CTA check exists for ${checkRef}.`);
      return presentCtaCheck(record, level);
    },
  });
}
