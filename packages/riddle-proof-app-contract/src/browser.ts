import { redactObject } from "./redaction";
import type { InstallRiddleProofContractInput, RiddleProofAppContractInstallOptions, RiddleProofContractDefinition } from "./types";

const DEFAULT_GLOBAL_NAME = "__riddleProofContract";

function isBrowserLike() {
  return typeof globalThis === "object" && "window" in globalThis;
}

function globalTarget(): Record<string, unknown> | null {
  if (!isBrowserLike()) return null;
  return globalThis as unknown as Record<string, unknown>;
}

function createPayload(input: InstallRiddleProofContractInput): RiddleProofContractDefinition {
  const version = input.version ?? "riddle-proof.app-contract.v1";
  const route = normalizeRoute(input.route) ?? normalizeRoute((globalThis as { location?: { pathname?: string } })?.location?.pathname);

  return {
    version,
    route,
    user: input.user,
    state: redactObject(input.getState?.() ?? {}, { sensitivePaths: input.redactedPaths }) as Record<string, unknown> | undefined,
    metadata: input.metadata,
  };
}

function normalizeRoute(route?: string): string | undefined {
  if (!route || typeof route !== "string") return undefined;
  const trimmed = route.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

export function installRiddleProofContract(input: InstallRiddleProofContractInput = {}): RiddleProofContractDefinition {
  const isBrowser = typeof globalThis === "object" && "window" in globalThis;
  if (!isBrowser) {
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
  const definition = createPayload(input);

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

export function readRiddleProofContract(globalName?: string): RiddleProofContractDefinition | null {
  const target = globalTarget();
  if (!target) return null;

  const resolved = target[globalName || DEFAULT_GLOBAL_NAME];
  if (!resolved || typeof resolved !== "object") return null;
  return resolved as RiddleProofContractDefinition;
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
