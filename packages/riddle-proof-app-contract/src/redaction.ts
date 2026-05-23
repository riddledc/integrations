import type { RiddleProofRedactionOptions } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pathSegments(path: string): string[] {
  return path
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function createDefaultSensitivePaths(): readonly string[] {
  return [
    "token",
    "auth_token",
    "idToken",
    "accessToken",
    "refreshToken",
    "bearerToken",
    "sessionToken",
    "clientSecret",
    "jwtToken",
    "access_token",
    "refresh_token",
    "api_key",
    "apiKey",
    "secret",
    "password",
    "auth",
    "session",
    "cookie",
    "localStorage",
    "localstorage",
    "csrf",
    "jwt",
    "credentials",
    "credential",
  ];
}

export function redactPath(object: unknown, path: string): unknown {
  if (!isRecord(object)) return object;
  const segments = pathSegments(path);
  if (segments.length === 0) return object;
  const [head, ...rest] = segments;

  const output = { ...(object as Record<string, unknown>) };
  if (rest.length === 0) {
    output[head] = "[redacted]";
    return output;
  }

  if (!isRecord(output[head])) {
    output[head] = "[redacted]";
    return output;
  }

  output[head] = redactPath(output[head], rest.join(".")) as Record<string, unknown>;
  return output;
}

function maxTruncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 6))}[red...]`;
}

export function redactObject<T extends object>(value: T, options: RiddleProofRedactionOptions = {}): T {
  const includeDefaults = options.includeDefaultSensitivePaths !== false;
  const sensitive = new Set([
    ...(includeDefaults ? createDefaultSensitivePaths() : []),
    ...(options.sensitivePaths ?? []),
  ].map((path) => path.toLowerCase()));
  const maxStringLength = options.maxStringLength ?? 2048;

  const seen = new WeakMap<object, object>();

  function walk(input: unknown, at?: string[]): unknown {
    if (input === null || input === undefined) return input;

    if (typeof input === "string") {
      return maxStringLength > 0 ? maxTruncate(input, maxStringLength) : input;
    }

    if (typeof input !== "object") return input;

    if (Array.isArray(input)) {
      return input.map((item) => walk(item, at));
    }

    const key = at ? at.join(".").toLowerCase() : "";
    if (sensitive.has(key)) {
      return "[redacted]";
    }

    if (seen.has(input)) return "[circular]";
    seen.set(input, {} as object);

    const output: Record<string, unknown> = {};
    for (const [field, nested] of Object.entries(input as Record<string, unknown>)) {
      const nextPath = [...(at ?? []), field];
      const fullPath = nextPath.join(".").toLowerCase();
      if (sensitive.has(field.toLowerCase()) || sensitive.has(fullPath)) {
        output[field] = "[redacted]";
      } else {
        output[field] = walk(nested, nextPath);
      }
    }

    return output as T;
  }

  return walk(value) as T;
}
