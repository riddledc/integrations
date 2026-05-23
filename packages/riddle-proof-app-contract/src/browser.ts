import { redactObject } from "./redaction";
import type {
  InstallRiddleProofContractInput,
  RiddleProofAppContractInstallOptions,
  RiddleProofCaptureDiagnostic,
  RiddleProofContractDefinition,
} from "./types";

const DEFAULT_GLOBAL_NAME = "__riddleProofContract";

function isBrowserLike() {
  return typeof globalThis === "object" && "window" in globalThis;
}

function globalTarget(): Record<string, unknown> | null {
  if (!isBrowserLike()) return null;
  return globalThis as unknown as Record<string, unknown>;
}

function normalizeRoute(route?: string): string | undefined {
  if (!route || typeof route !== "string") return undefined;
  const trimmed = route.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

function normalizeInputRoute(inputRoute?: string): string | undefined {
  return normalizeRoute(inputRoute)
    || normalizeRoute((globalThis as { location?: { pathname?: string } })?.location?.pathname);
}

function createCaptureDiagnostic(
  version: string,
  route: () => string | undefined,
  getState: () => ReturnType<RiddleProofContractDefinition["getState"]>,
): RiddleProofCaptureDiagnostic {
  return {
    version: "riddle-proof.capture-diagnostic.v1",
    route: route(),
    state: getState(),
  };
}

function createContractDefinition(input: InstallRiddleProofContractInput): RiddleProofContractDefinition {
  const version = input.version ?? "riddle-proof.app-contract.v1";
  const options: RiddleProofAppContractInstallOptions = {
    globalName: input.globalName,
    force: input.force,
    redactedPaths: input.redactedPaths,
    includeDefaultSensitivePaths: input.includeDefaultSensitivePaths,
  };

  const readRoute = () => normalizeInputRoute(input.route);
  const readState = () => redactObject(input.getState?.() ?? {}, {
    sensitivePaths: options.redactedPaths,
    includeDefaultSensitivePaths: options.includeDefaultSensitivePaths,
  });

  return {
    get version() {
      return version;
    },
    get route() {
      return readRoute();
    },
    get user() {
      return input.user;
    },
    get metadata() {
      return input.metadata;
    },
    getState: () => readState(),
    captureDiagnostic: () => createCaptureDiagnostic(version, readRoute, readState),
  };
}

export function installRiddleProofContract(input: InstallRiddleProofContractInput = {}): RiddleProofContractDefinition {
  if (!isBrowserLike()) {
    throw new Error("installRiddleProofContract must run in a browser context.");
  }

  const target = globalTarget();
  if (!target) {
    throw new Error("installRiddleProofContract must run in a browser context.");
  }

  const options: RiddleProofAppContractInstallOptions = {
    globalName: input.globalName,
    force: input.force,
  };

  const globalName = options.globalName || DEFAULT_GLOBAL_NAME;
  const definition = createContractDefinition(input);

  if (!options.force && typeof target[globalName] !== "undefined") {
    const error = new Error(
      `Contract already installed as globalName=${globalName}. Use { force: true } to overwrite.`,
    ) as Error & { code: "already-present" };
    error.code = "already-present";
    throw error;
  }

  Object.defineProperty(target, globalName, {
    value: definition,
    configurable: true,
    writable: true,
  });

  return definition;
}

function resolveCandidate(candidate: Record<string, unknown>): RiddleProofContractDefinition | null {
  const version = typeof candidate.version === "string" ? candidate.version : "";
  if (!version) return null;

  const getState = () => {
    if (typeof candidate.getState === "function") {
      const state = candidate.getState();
      return state && typeof state === "object" ? state as Record<string, unknown> : undefined;
    }
    if (candidate.state && typeof candidate.state === "object" && !Array.isArray(candidate.state)) {
      return candidate.state as Record<string, unknown>;
    }
    return undefined;
  };

  const routeValue = typeof candidate.route === "function"
    ? candidate.route()
    : candidate.route;
  const route = normalizeRoute(String(routeValue ?? ""));
  const captureDiagnostic = () => {
    const fallback = typeof candidate.captureDiagnostic === "function"
      ? candidate.captureDiagnostic()
      : ({
          version: "riddle-proof.capture-diagnostic.v1",
          route,
          state: getState(),
        });
    return fallback as RiddleProofCaptureDiagnostic;
  };

  return {
    get version() {
      return version;
    },
    get route() {
      return normalizeRoute(typeof candidate.route === "function" ? candidate.route() : candidate.route as string | undefined) ?? route;
    },
    get user() {
      return typeof candidate.user === "string" ? candidate.user : undefined;
    },
    get metadata() {
      return typeof candidate.metadata === "object" && candidate.metadata !== null
        ? candidate.metadata as Record<string, unknown>
        : undefined;
    },
    getState,
    captureDiagnostic,
  };
}

export function readRiddleProofContract(globalName?: string): RiddleProofContractDefinition | null {
  const target = globalTarget();
  if (!target) return null;

  const resolved = target[globalName || DEFAULT_GLOBAL_NAME];
  if (!resolved || typeof resolved !== "object") return null;

  const candidate = resolved as Record<string, unknown>;
  if (typeof candidate.getState === "function" || typeof candidate.captureDiagnostic === "function" || "state" in candidate) {
    return resolveCandidate(candidate);
  }

  return null;
}

export function uninstallRiddleProofContract(globalName?: string): void {
  const target = globalTarget();
  if (!target) return;
  const key = globalName || DEFAULT_GLOBAL_NAME;
  try {
    delete target[key];
  } catch {
    target[key] = undefined;
  }
}

export { normalizeRoute };
export const RIDDLE_PROOF_APP_CONTRACT_VERSION = "riddle-proof.app-contract.v1" as const;
export const READABLE_CAPTURE_DIAGNOSTIC_VERSION = "riddle-proof.capture-diagnostic.v1" as const;
