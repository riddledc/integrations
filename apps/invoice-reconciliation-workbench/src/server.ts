import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

import type {
  InvoiceReconciliationWorkbench,
} from "./application.js";

export interface StartInvoiceWorkbenchServerInput {
  application: InvoiceReconciliationWorkbench;
  public_directory?: string;
  host?: "127.0.0.1";
  port?: number;
}

export interface RunningInvoiceWorkbenchServer {
  host: string;
  port: number;
  url: string;
  launch_url: string;
  close(): Promise<void>;
}

const DEFAULT_HOST = "127.0.0.1";
const CAPABILITY_HEADER = "x-riddle-invoice-run";
const MAX_REQUEST_BODY_BYTES = 1_024;
const STATIC_FILES = new Map<string, readonly [string, string]>([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/view-model.js", ["view-model.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
]);

function defaultPublicDirectory(): string {
  const sourceAdjacent = fileURLToPath(new URL("../public/", import.meta.url));
  const compiledFallback = fileURLToPath(
    new URL("../../public/", import.meta.url),
  );
  return existsSync(sourceAdjacent) ? sourceAdjacent : compiledFallback;
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  value: unknown,
  extraHeaders: Readonly<Record<string, string>> = {},
): void {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": String(Buffer.byteLength(body)),
    ...extraHeaders,
  });
  response.end(body);
}

function writeError(
  response: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
  extraHeaders: Readonly<Record<string, string>> = {},
): void {
  writeJson(response, statusCode, { error: { code, message } }, extraHeaders);
}

function writeStatic(
  response: ServerResponse,
  publicDirectory: string,
  pathname: string,
): boolean {
  const entry = STATIC_FILES.get(pathname);
  if (!entry) return false;
  const [filename, contentType] = entry;
  const filePath = join(publicDirectory, filename);
  if (!existsSync(filePath)) {
    writeError(response, 500, "asset_unavailable", "A local interface asset is unavailable.");
    return true;
  }
  const body = readFileSync(filePath);
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-security-policy": [
      "default-src 'self'",
      "base-uri 'none'",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data:",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
    ].join("; "),
    "content-type": contentType,
    "content-length": String(body.byteLength),
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
  response.end(body);
  return true;
}

function expectedAuthority(request: IncomingMessage): string | null {
  const port = request.socket.localPort;
  return Number.isInteger(port) && (port ?? 0) > 0
    ? `${DEFAULT_HOST}:${port}`
    : null;
}

function requestAuthorityAllowed(request: IncomingMessage): boolean {
  const expected = expectedAuthority(request);
  return expected !== null
    && request.headers.host === expected
    && request.socket.localAddress === DEFAULT_HOST
    && request.socket.remoteAddress === DEFAULT_HOST;
}

function sameSecret(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.byteLength === rightBytes.byteLength
    && timingSafeEqual(leftBytes, rightBytes);
}

function requestHasCapability(
  request: IncomingMessage,
  token: string,
): boolean {
  const supplied = request.headers[CAPABILITY_HEADER];
  return typeof supplied === "string" && sameSecret(supplied, token);
}

function requestOriginAllowed(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  const authority = expectedAuthority(request);
  if (typeof origin !== "string" || authority === null) return false;
  try {
    const parsed = new URL(origin);
    return origin === `http://${authority}`
      && parsed.protocol === "http:"
      && parsed.hostname === DEFAULT_HOST
      && parsed.host === authority;
  } catch {
    return false;
  }
}

async function assertEmptyBody(request: IncomingMessage): Promise<void> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as Uint8Array);
    length += bytes.byteLength;
    if (length > MAX_REQUEST_BODY_BYTES) throw new TypeError("body_too_large");
    chunks.push(bytes);
  }
  if (length === 0) return;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new TypeError("body_invalid");
  }
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.keys(value).length !== 0
  ) {
    throw new TypeError("body_not_empty");
  }
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((done, reject) => {
    server.close((error) => error ? reject(error) : done());
  });
}

function createInvoiceWorkbenchServer(
  application: InvoiceReconciliationWorkbench,
  publicDirectory: string,
  token: string,
): Server {
  let operation: "check" | "correct" | null = null;
  return createServer(async (request, response) => {
    if (!requestAuthorityAllowed(request)) {
      writeError(response, 403, "invalid_request", "Use the exact loopback workbench address.");
      return;
    }
    const method = request.method ?? "GET";
    let url: URL;
    try {
      url = new URL(request.url ?? "/", "http://invoice-workbench.local");
    } catch {
      writeError(response, 400, "invalid_request", "Invalid request URL.");
      return;
    }
    const launchRequest = method === "GET"
      && url.pathname === "/"
      && url.searchParams.size === 1
      && url.searchParams.has("run")
      && sameSecret(url.searchParams.get("run") ?? "", token);
    const auditRequest = method === "GET"
      && url.pathname === "/api/audit"
      && url.searchParams.size === 1
      && url.searchParams.has("check_ref");
    if (url.search && !launchRequest && !auditRequest) {
      writeError(response, 400, "invalid_request", "Unexpected query parameters.");
      return;
    }
    if (method === "GET" && writeStatic(
      response,
      publicDirectory,
      url.pathname,
    )) {
      return;
    }
    if (!requestHasCapability(request, token)) {
      writeError(response, 401, "unauthorized", "The local run capability is required.");
      return;
    }
    if (method === "GET" && url.pathname === "/api/state") {
      writeJson(response, 200, await application.snapshot());
      return;
    }
    if (auditRequest) {
      try {
        writeJson(
          response,
          200,
          await application.audit(url.searchParams.get("check_ref") ?? ""),
        );
      } catch {
        writeError(response, 404, "not_found", "No audit exists for that check.");
      }
      return;
    }
    if (
      method === "POST"
      && (url.pathname === "/api/check" || url.pathname === "/api/correct")
    ) {
      if (!requestOriginAllowed(request)) {
        writeError(response, 403, "invalid_request", "Cross-origin operations are not allowed.");
        return;
      }
      try {
        await assertEmptyBody(request);
      } catch {
        writeError(response, 400, "invalid_request", "This operation accepts no caller-selected fields.");
        return;
      }
      if (operation !== null) {
        writeError(
          response,
          409,
          "operation_in_progress",
          "Another local operation is running.",
          { "retry-after": "1" },
        );
        return;
      }
      const state = await application.snapshot();
      if (url.pathname === "/api/check" && !state.can_check) {
        writeError(response, 409, "check_unavailable", "The current record set is already checked.");
        return;
      }
      if (url.pathname === "/api/correct" && !state.can_correct) {
        writeError(response, 409, "correction_unavailable", "No current typed correction is available.");
        return;
      }
      operation = url.pathname === "/api/check" ? "check" : "correct";
      try {
        const next = operation === "check"
          ? await application.checkCurrent()
          : await application.applyCorrection();
        writeJson(response, 200, next);
      } catch {
        writeError(response, 500, "operation_failed", "The local operation did not complete.");
      } finally {
        operation = null;
      }
      return;
    }
    if (url.pathname.startsWith("/api/") || STATIC_FILES.has(url.pathname)) {
      writeError(response, 405, "method_not_allowed", "That method is not allowed.");
      return;
    }
    writeError(response, 404, "not_found", "Not found.");
  });
}

export async function startInvoiceWorkbenchServer(
  input: StartInvoiceWorkbenchServerInput,
): Promise<RunningInvoiceWorkbenchServer> {
  const host = input.host ?? DEFAULT_HOST;
  const port = input.port ?? 0;
  if (host !== DEFAULT_HOST) {
    throw new TypeError("The local invoice workbench may bind only to 127.0.0.1.");
  }
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new TypeError("port must be an integer from 0 through 65535.");
  }
  const token = randomBytes(32).toString("base64url");
  const server = createInvoiceWorkbenchServer(
    input.application,
    resolve(input.public_directory ?? defaultPublicDirectory()),
    token,
  );
  await new Promise<void>((done, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      done();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("The local invoice workbench did not receive an address.");
  }
  let closed = false;
  return {
    host,
    port: address.port,
    url: `http://${host}:${address.port}/`,
    launch_url: `http://${host}:${address.port}/?run=${token}`,
    async close() {
      if (closed) return;
      closed = true;
      await closeServer(server);
      await input.application.close();
    },
  };
}
