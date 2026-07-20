import { createHash } from "node:crypto";

export type ProtocolRecord = Record<string, unknown>;

export function isProtocolRecord(value: unknown): value is ProtocolRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function assertProtocolRecord(value: unknown, context: string): asserts value is ProtocolRecord {
  if (!isProtocolRecord(value)) throw new Error(`${context} must be a plain object.`);
}

export function assertProtocolKeys(
  value: ProtocolRecord,
  required: readonly string[],
  optional: readonly string[] = [],
  context = "value",
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      throw new Error(`${context} contains an unsupported field.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || descriptor.get || descriptor.set) {
      throw new Error(`${context}.${key} must be an enumerable data field.`);
    }
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new Error(`${context}.${key} is required.`);
    }
  }
}

export function protocolField(value: ProtocolRecord, key: string, context: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !descriptor.enumerable || descriptor.get || descriptor.set) {
    throw new Error(`${context}.${key} is required as an enumerable data field.`);
  }
  return descriptor.value;
}

export function protocolOptionalField(value: ProtocolRecord, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return undefined;
  if (!descriptor.enumerable || descriptor.get || descriptor.set) {
    throw new Error(`${key} must be an enumerable data field.`);
  }
  return descriptor.value;
}

export function protocolString(
  value: unknown,
  context: string,
  maximum = 256,
  pattern?: RegExp,
): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maximum
    || value.trim() !== value
    || (pattern !== undefined && !pattern.test(value))
  ) {
    throw new Error(`${context} is invalid.`);
  }
  return value;
}

export function protocolCode(value: unknown, context: string): string {
  return protocolString(value, context, 256, /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]*$/u);
}

export function protocolDigest(value: unknown, context: string): string {
  return protocolString(value, context, 71, /^sha256:[0-9a-f]{64}$/u);
}

export function protocolTimestamp(value: unknown, context: string): string {
  const text = protocolString(value, context, 32);
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== text) {
    throw new Error(`${context} must be a canonical UTC timestamp.`);
  }
  return text;
}

export function protocolInteger(
  value: unknown,
  context: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${context} must be an integer from ${minimum} through ${maximum}.`);
  }
  return value as number;
}

export function protocolArray(
  value: unknown,
  context: string,
  maximum: number,
): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(`${context} must be a plain array.`);
  }
  if (value.length > maximum) throw new Error(`${context} exceeds ${maximum} entries.`);
  const entries: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new Error(`${context} must not be sparse.`);
    }
    entries.push(value[index]);
  }
  if (Reflect.ownKeys(value).length !== value.length + 1) {
    throw new Error(`${context} contains unsupported array fields.`);
  }
  return entries;
}

export function canonicalProtocolJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalProtocolJson).join(",")}]`;
  if (isProtocolRecord(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalProtocolJson(value[key])}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Value is not canonical JSON data.");
  return encoded;
}

export function protocolSha256(domain: string, value: unknown): string {
  return `sha256:${createHash("sha256").update(domain).update(canonicalProtocolJson(value)).digest("hex")}`;
}

export function protocolBytesSha256(domain: string, value: Uint8Array): string {
  return `sha256:${createHash("sha256").update(domain).update(value).digest("hex")}`;
}

export function protocolErrorMessage(error: unknown): string {
  try {
    return error instanceof Error ? error.message : String(error);
  } catch {
    return "unprintable error";
  }
}
