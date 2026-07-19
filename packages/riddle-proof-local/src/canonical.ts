import { createHash } from "node:crypto";

type CanonicalJson = null | boolean | number | string | CanonicalJson[] | {
  [key: string]: CanonicalJson;
};

function normalize(value: unknown, seen: Set<object>): CanonicalJson {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON cannot contain a non-finite number.");
    return value;
  }
  if (typeof value !== "object") throw new TypeError("Canonical JSON contains unsupported data.");
  if (seen.has(value)) throw new TypeError("Canonical JSON cannot contain cycles.");
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((entry) => normalize(entry, seen));
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON requires plain objects.");
    }
    const result: Record<string, CanonicalJson> = Object.create(null);
    for (const key of Object.keys(value).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry === undefined) throw new TypeError("Canonical JSON cannot contain undefined.");
      result[key] = normalize(entry, seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value, new Set()));
}

export function sha256Bytes(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function sha256Canonical(domain: string, value: unknown): string {
  return sha256Bytes(Buffer.from(`${domain}\u0000${canonicalJson(value)}`, "utf8"));
}

export function digestToken(digest: string): string {
  return Buffer.from(digest.slice("sha256:".length), "hex").toString("base64url");
}
