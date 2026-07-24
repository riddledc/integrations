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
  DURABLE_TEXT_TRANSITION_CONTRACT,
  createLocalBrowserReportProvider,
  createProofGuidedWebChangeClient,
  type LocalBrowserReportAttempt,
  type LocalBrowserReportSigningKey,
} from "riddle-proof-guided-web-change-experiment";

import {
  type DurableSettingRepairApplication,
  createDurableSettingRepairApplication,
} from "./application.js";

const COLLECTOR_IMPLEMENTATION =
  "riddle-proof.proof-guided-web-change-app.local-playwright-adapter.v1\0";

export interface LocalDurableSettingApplication
  extends DurableSettingRepairApplication {
  readonly artifacts_directory: string;
}

export interface CreateLocalDurableSettingApplicationInput {
  artifacts_directory: string;
  signing_key?: LocalBrowserReportSigningKey;
  now?: () => string;
  on_attempt?: (attempt: LocalBrowserReportAttempt) => void;
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

function createSigningKey(): LocalBrowserReportSigningKey {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicBytes = publicKey.export({
    format: "der",
    type: "spki",
  });
  return {
    key_id:
      `local-web-change-${sha256(publicBytes).slice("sha256:".length, 24)}`,
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
 * Assembles the private local application from its explicit capabilities.
 *
 * The app owns candidate resolution and repair. The existing experiment owns
 * the pinned contract, browser capture/replay, and deterministic projection.
 * The generated private key remains process-local; only its public half and
 * content-light run metadata are retained with the browser artifacts.
 */
export async function createLocalDurableSettingApplication(
  input: CreateLocalDurableSettingApplicationInput,
): Promise<LocalDurableSettingApplication> {
  if (!input || typeof input !== "object") {
    throw new TypeError(
      "Local durable-setting application configuration must be an object.",
    );
  }
  const inputKeys = Object.keys(input);
  if (
    !Object.hasOwn(input, "artifacts_directory")
    || inputKeys.some(
      (key) =>
        key !== "artifacts_directory"
        && key !== "signing_key"
        && key !== "now"
        && key !== "on_attempt",
    )
  ) {
    throw new TypeError(
      "Local configuration accepts only artifacts_directory, signing_key, now, and on_attempt.",
    );
  }
  const artifactsDirectory = prepareArtifactsDirectory(
    input.artifacts_directory,
  );
  const signingKey = input.signing_key ?? createSigningKey();
  const collector = {
    collector_id: "@riddledc/riddle-proof-runner-playwright",
    collector_version: "proof-guided-web-change-app",
    implementation_digest: sha256(COLLECTOR_IMPLEMENTATION),
  };
  writeFileSync(
    path.join(artifactsDirectory, "run-authority.json"),
    `${JSON.stringify({
      version: "riddle-proof.proof-guided-web-change-local-run.v1",
      contract: {
        id: DURABLE_TEXT_TRANSITION_CONTRACT.id,
        version: DURABLE_TEXT_TRANSITION_CONTRACT.version,
        digest: DURABLE_TEXT_TRANSITION_CONTRACT.digest,
      },
      collector,
      signing_key: {
        key_id: signingKey.key_id,
        public_key_spki_base64: signingKey.public_key_spki_base64,
      },
    }, null, 2)}\n`,
    {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    },
  );

  const application = await createDurableSettingRepairApplication({
    client_factory({
      candidate_resolver: candidateResolver,
      proof_transport_for: proofTransportFor,
    }) {
      const reportProvider = createLocalBrowserReportProvider({
        artifacts_directory: artifactsDirectory,
        signing_key: signingKey,
        collector,
        source_for({ candidate }) {
          return {
            repository: candidate.scope.repository,
            git_revision: candidate.scope.revision,
            dirty: false,
            label: "owned durable-setting candidate",
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
      return createProofGuidedWebChangeClient({
        contract: DURABLE_TEXT_TRANSITION_CONTRACT,
        candidate_resolver: candidateResolver,
        report_provider: reportProvider,
      });
    },
    ...(input.now === undefined ? {} : { now: input.now }),
  });
  return Object.freeze({
    artifacts_directory: artifactsDirectory,
    snapshot: application.snapshot.bind(application),
    checkCurrent: application.checkCurrent.bind(application),
    applyRepair: application.applyRepair.bind(application),
    prepareFreshAttempt:
      application.prepareFreshAttempt.bind(application),
    audit: application.audit.bind(application),
    close: application.close.bind(application),
  });
}
