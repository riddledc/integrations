import { createHash } from "node:crypto";

export type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJson[]
  | { readonly [key: string]: CanonicalJson };

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) {
    throw new TypeError("Canonical JSON does not support undefined values.");
  }
  return encoded;
}

export function sha256Bytes(value: Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function canonicalDigest(value: unknown): string {
  return sha256Bytes(Buffer.from(stableJson(value), "utf8"));
}

export function digestToken(digest: string): string {
  if (!/^sha256:[0-9a-f]{64}$/u.test(digest)) {
    throw new TypeError("A full lowercase SHA-256 digest is required.");
  }
  return Buffer.from(digest.slice("sha256:".length), "hex")
    .toString("base64url");
}

export function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function deepFreeze<T>(value: T): T {
  if (
    value !== null
    && typeof value === "object"
    && !Object.isFrozen(value)
  ) {
    Object.freeze(value);
    for (const entry of Object.values(value as Record<string, unknown>)) {
      deepFreeze(entry);
    }
  }
  return value;
}

export function canonicalPrettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
