import {
  projectApplicationResult,
} from "riddle-proof-application-projection-experiment";

import {
  assertResolvedWebChangeCandidate,
  assertWebChangeCandidateResolution,
  createResolvedWebChangeCandidate,
  deriveWebChangeAttemptAuthority,
} from "./authority.js";
import {
  assertPinnedWebChangeContract,
  createPinnedWebChangeContract,
} from "./contract.js";
import { presentWebChangeCheck } from "./presentation.js";
import {
  type ProofGuidedWebChangeClient,
  type ProofGuidedWebChangeClientConfiguration,
  type ResolvedWebChangeCandidate,
  type WebChangeAttemptAuthority,
  type WebChangeCheckRecord,
  type WebChangeCheckRequest,
  type WebChangeInspectionLevel,
  type WebChangeInspectionView,
  type WebChangeOutcomeView,
  type WebChangeProjectionResult,
} from "./types.js";

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

function exactRequest(value: unknown): asserts value is WebChangeCheckRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Web-change check request must be an object.");
  }
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "candidate_ref") {
    throw new TypeError(
      "Web-change check request may contain only candidate_ref.",
    );
  }
  const candidateRef = (value as Record<string, unknown>).candidate_ref;
  if (
    typeof candidateRef !== "string"
    || candidateRef.trim().length === 0
  ) {
    throw new TypeError("candidate_ref must be a non-empty string.");
  }
}

function assertCapability(
  value: unknown,
  method: string,
  context: string,
): void {
  if (!value || typeof value !== "object") {
    throw new TypeError(`${context} must be an object.`);
  }
  if (typeof (value as Record<string, unknown>)[method] !== "function") {
    throw new TypeError(`${context}.${method} must be a function.`);
  }
}

function cloneContract(
  configuration: ProofGuidedWebChangeClientConfiguration,
) {
  assertPinnedWebChangeContract(configuration.contract);
  return createPinnedWebChangeContract({
    id: configuration.contract.id,
    version: configuration.contract.version,
    protocol_version: configuration.contract.protocol_version,
    transition_id: configuration.contract.transition_id,
    expected_root: configuration.contract.expected_root,
    profiles: configuration.contract.profiles,
    requirements: configuration.contract.requirements,
    non_conclusions: configuration.contract.non_conclusions,
  });
}

function unavailableRecord(input: {
  check_ref: string;
  candidate_ref: string;
  contract: ReturnType<typeof cloneContract>;
  diagnostic_code: string;
  candidate?: ResolvedWebChangeCandidate;
  authority?: WebChangeAttemptAuthority;
}): WebChangeCheckRecord {
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

/**
 * Creates the application-facing website-change client.
 *
 * The installed contract, resolver, and report provider are environmental
 * authority. An ordinary request can name only an opaque candidate reference.
 */
export function createProofGuidedWebChangeClient(
  configuration: ProofGuidedWebChangeClientConfiguration,
): ProofGuidedWebChangeClient {
  if (!configuration || typeof configuration !== "object") {
    throw new TypeError("Web-change client configuration must be an object.");
  }
  assertCapability(
    configuration.candidate_resolver,
    "resolve",
    "candidate_resolver",
  );
  assertCapability(
    configuration.report_provider,
    "check",
    "report_provider",
  );
  const contract = cloneContract(configuration);
  const resolveCandidate =
    configuration.candidate_resolver.resolve.bind(
      configuration.candidate_resolver,
    );
  const checkReport = configuration.report_provider.check.bind(
    configuration.report_provider,
  );
  const records = new Map<string, WebChangeCheckRecord>();
  let ordinal = 0;

  function save(record: WebChangeCheckRecord): WebChangeOutcomeView {
    records.set(record.check_ref, record);
    return presentWebChangeCheck(record, "outcome") as WebChangeOutcomeView;
  }

  return Object.freeze({
    contract,
    async check(
      request: WebChangeCheckRequest,
    ): Promise<WebChangeOutcomeView> {
      exactRequest(request);
      const candidateRef = request.candidate_ref;
      ordinal += 1;
      const checkRef = `webcheck_${ordinal}`;

      let candidate: ResolvedWebChangeCandidate;
      try {
        const resolution = await resolveCandidate({
          candidate_ref: candidateRef,
          contract,
        });
        assertWebChangeCandidateResolution({
          candidate_ref: candidateRef,
          resolution,
        });
        const resolved = createResolvedWebChangeCandidate({
          contract,
          candidate_ref: resolution.candidate_ref,
          scope: resolution.scope,
        });
        assertResolvedWebChangeCandidate({
          contract,
          candidate_ref: candidateRef,
          candidate: resolved,
        });
        candidate = deepFreeze(cloneJson(resolved));
      } catch {
        return save(unavailableRecord({
          check_ref: checkRef,
          candidate_ref: candidateRef,
          contract,
          diagnostic_code: "candidate_resolution_failed",
        }));
      }

      let authority: WebChangeAttemptAuthority;
      try {
        authority = deriveWebChangeAttemptAuthority({
          contract,
          candidate,
        });
      } catch {
        return save(unavailableRecord({
          check_ref: checkRef,
          candidate_ref: candidateRef,
          contract,
          candidate,
          diagnostic_code: "attempt_authority_derivation_failed",
        }));
      }

      let projection: WebChangeProjectionResult;
      try {
        const verification = await checkReport({
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
        return save(unavailableRecord({
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
      level: WebChangeInspectionLevel = "outcome",
    ): WebChangeInspectionView {
      if (typeof checkRef !== "string" || checkRef.trim().length === 0) {
        throw new TypeError("check_ref must be a non-empty string.");
      }
      const record = records.get(checkRef);
      if (!record) {
        throw new Error(`No web-change check exists for ${checkRef}.`);
      }
      return presentWebChangeCheck(record, level);
    },
  });
}
