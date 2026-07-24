import {
  createHash,
  generateKeyPairSync,
} from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  createLocalCtaBrowserReportProvider,
  createPinnedCtaChangeContract,
  createProofGuidedCtaChangeClient,
  type LocalCtaBrowserReportAttempt,
  type LocalCtaBrowserReportSigningKey,
} from "riddle-proof-guided-cta-change-experiment";

import {
  type CtaChangeAgent,
  createReviewedFixtureCtaChangeAgent,
} from "./cta-agent.js";
import {
  type CtaChangeApplication,
  type CtaProposalRecord,
  createCtaChangeApplication,
} from "./cta-application.js";

const COLLECTOR_IMPLEMENTATION =
  "riddle-proof.proof-guided-cta-change-app.local-playwright-adapter.v1\0";

export interface LocalCtaChangeApplication
  extends CtaChangeApplication {
  readonly artifacts_directory: string;
}

export interface CreateLocalCtaChangeApplicationInput {
  artifacts_directory: string;
  signing_key?: LocalCtaBrowserReportSigningKey;
  agent?: CtaChangeAgent;
  now?: () => string;
  on_attempt?: (attempt: LocalCtaBrowserReportAttempt) => void;
  on_proposal?: (proposal: CtaProposalRecord) => void;
}

function nonempty(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${context} must be a non-empty string.`);
  }
  return value;
}

function sha256(bytes: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function createSigningKey(): LocalCtaBrowserReportSigningKey {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicBytes = publicKey.export({
    format: "der",
    type: "spki",
  });
  return {
    key_id:
      `local-cta-change-${
        sha256(publicBytes).slice("sha256:".length, 31)
      }`,
    private_key_pkcs8_base64: privateKey.export({
      format: "der",
      type: "pkcs8",
    }).toString("base64"),
    public_key_spki_base64: publicBytes.toString("base64"),
  };
}

function prepareArtifactsDirectory(directory: string): string {
  const resolved = path.resolve(
    nonempty(directory, "artifacts_directory"),
  );
  if (existsSync(resolved)) {
    const existing = lstatSync(resolved);
    if (!existing.isDirectory() || existing.isSymbolicLink()) {
      throw new TypeError(
        "artifacts_directory must resolve to a real local directory.",
      );
    }
  } else {
    mkdirSync(resolved, {
      recursive: true,
      mode: 0o700,
    });
  }
  const stats = lstatSync(resolved);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new TypeError(
      "artifacts_directory must resolve to a real local directory.",
    );
  }
  if ((stats.mode & 0o077) !== 0) {
    throw new TypeError(
      "artifacts_directory must not grant group or world permissions.",
    );
  }
  if (
    typeof process.getuid === "function"
    && stats.uid !== process.getuid()
  ) {
    throw new TypeError(
      "artifacts_directory must be owned by the current user.",
    );
  }
  return realpathSync(resolved);
}

/**
 * Assembles the local CTA client around app-owned authority.
 *
 * The caller may choose the effectful agent implementation, but cannot
 * replace the installed contract, candidate resolver, browser profile, proof
 * provider, or mutation policy. The default agent is a deterministic reviewed
 * fixture so the demo is reproducible without a model credential.
 */
export async function createLocalCtaChangeApplication(
  input: CreateLocalCtaChangeApplicationInput,
): Promise<LocalCtaChangeApplication> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError(
      "Local CTA-change application configuration must be an object.",
    );
  }
  const allowed = new Set([
    "artifacts_directory",
    "signing_key",
    "agent",
    "now",
    "on_attempt",
    "on_proposal",
  ]);
  const inputKeys = Object.keys(input);
  if (
    !Object.hasOwn(input, "artifacts_directory")
    || inputKeys.some((key) => !allowed.has(key))
  ) {
    throw new TypeError(
      "Local configuration accepts only artifacts_directory, signing_key, agent, now, on_attempt, and on_proposal.",
    );
  }
  const artifactsDirectory = prepareArtifactsDirectory(
    input.artifacts_directory,
  );
  const signingKey = input.signing_key ?? createSigningKey();
  const contract = createPinnedCtaChangeContract();
  const collector = {
    collector_id: "@riddledc/riddle-proof-runner-playwright",
    collector_version: "proof-guided-cta-change-app",
    implementation_digest: sha256(COLLECTOR_IMPLEMENTATION),
  };
  writeFileSync(
    path.join(artifactsDirectory, "run-authority.json"),
    `${JSON.stringify({
      version: "riddle-proof.proof-guided-cta-change-local-run.v1",
      contract: {
        id: contract.id,
        version: contract.version,
        digest: contract.digest,
      },
      collector,
      signing_key: {
        key_id: signingKey.key_id,
        public_key_spki_base64:
          signingKey.public_key_spki_base64,
      },
    }, null, 2)}\n`,
    {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    },
  );

  const application = await createCtaChangeApplication({
    agent: input.agent ?? createReviewedFixtureCtaChangeAgent(),
    client_factory({
      candidate_resolver: candidateResolver,
      proof_transport_for: proofTransportFor,
    }) {
      const reportProvider = createLocalCtaBrowserReportProvider({
        artifacts_directory: artifactsDirectory,
        signing_key: signingKey,
        collector,
        source_for({ candidate }) {
          return {
            repository: candidate.scope.repository,
            git_revision: candidate.scope.revision,
            dirty: false,
            label: "owned primary-CTA candidate",
          };
        },
        async extra_http_headers_for({ candidate }) {
          const transport = await proofTransportFor({
            candidate_ref: candidate.candidate_ref,
            target: candidate.scope.target,
          });
          return transport.extra_http_headers;
        },
        ...(input.on_attempt === undefined
          ? {}
          : { on_attempt: input.on_attempt }),
      });
      return createProofGuidedCtaChangeClient({
        contract,
        candidate_resolver: candidateResolver,
        report_provider: reportProvider,
      });
    },
    ...(input.now === undefined ? {} : { now: input.now }),
    ...(input.on_proposal === undefined
      ? {}
      : { on_proposal: input.on_proposal }),
  });

  return Object.freeze({
    artifacts_directory: artifactsDirectory,
    snapshot: application.snapshot.bind(application),
    checkCurrent: application.checkCurrent.bind(application),
    applyRepair: application.applyRepair.bind(application),
    prepareFreshAttempt:
      application.prepareFreshAttempt.bind(application),
    audit: application.audit.bind(application),
    proposalAudit: application.proposalAudit.bind(application),
    close: application.close.bind(application),
  });
}
