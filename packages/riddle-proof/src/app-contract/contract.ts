import type {
  RiddleProofAppContractDefinition,
  RiddleProofAppContractInstallOptions,
  RiddleProofAppContractPayload,
} from "./types";

const DEFAULT_GLOBAL_NAME = "__riddleProofContract";

export function createRiddleProofContractPayload(input?: {
  route?: string;
  state?: Record<string, unknown>;
  user?: string;
  metadata?: Record<string, unknown>;
  version?: string;
}): RiddleProofAppContractPayload {
  return {
    version: input?.version || "riddle-proof.app-contract.v1",
    route: input?.route,
    user: input?.user,
    state: input?.state,
    metadata: input?.metadata,
  };
}

function isBrowserLike() {
  return typeof globalThis === "object" && "window" in globalThis;
}

function globalTarget() {
  if (!isBrowserLike()) return null;
  return globalThis as unknown as Record<string, unknown>;
}

export function resolveRiddleProofContract(
  globalName = DEFAULT_GLOBAL_NAME,
): RiddleProofAppContractDefinition | null {
  const target = globalTarget();
  if (!target) return null;
  const raw = target[globalName];
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;
  const version = typeof candidate.version === "string" ? candidate.version : "";
  if (!version) return null;

  return {
    version,
    route: typeof candidate.route === "string" ? candidate.route : undefined,
    state: typeof candidate.state === "object" && candidate.state !== null
      ? (candidate.state as Record<string, unknown>)
      : undefined,
    user: typeof candidate.user === "string" ? candidate.user : undefined,
    metadata: typeof candidate.metadata === "object" && candidate.metadata !== null
      ? (candidate.metadata as Record<string, unknown>)
      : undefined,
  };
}

export function installRiddleProofContract(
  payload: RiddleProofAppContractPayload,
  options: RiddleProofAppContractInstallOptions = {},
): RiddleProofAppContractDefinition {
  const target = globalTarget();
  if (!target) {
    const error = new Error("Riddle proof contract install requires a browser-like global.");
    throw Object.assign(error, { code: "unsupported-environment" });
  }

  const globalName = options.globalName || DEFAULT_GLOBAL_NAME;
  if (!options.force && typeof target[globalName] !== "undefined") {
    const error = new Error(`Contract already installed as globalName=${globalName}. Use { force: true } to overwrite.`);
    throw Object.assign(error, { code: "missing-runtime" });
  }

  if (!payload || typeof payload.version !== "string" || !payload.version.trim()) {
    const error = new Error("Riddle proof contract payload must include a non-empty version.");
    throw Object.assign(error, { code: "invalid-payload" });
  }

  const definition: RiddleProofAppContractDefinition = {
    version: payload.version,
    route: payload.route,
    state: payload.state,
    user: payload.user,
    metadata: payload.metadata,
  };
  Object.defineProperty(target, globalName, {
    value: definition,
    configurable: true,
    writable: true,
  });
  return definition;
}

export function uninstallRiddleProofContract(globalName = DEFAULT_GLOBAL_NAME): void {
  const target = globalTarget();
  if (!target) return;
  try {
    delete target[globalName];
  } catch {
    target[globalName] = undefined;
  }
}
