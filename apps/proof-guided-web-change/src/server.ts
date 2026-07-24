import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export type ProofGuidedWebChangeShellApplication = {
  snapshot(): unknown | Promise<unknown>;
  checkCurrent(): unknown | Promise<unknown>;
  applyRepair(): unknown | Promise<unknown>;
  prepareFreshAttempt(): unknown | Promise<unknown>;
  audit(checkRef: string): unknown | Promise<unknown>;
  close(): void | Promise<void>;
};

export type ProofGuidedWebChangeShellServerOptions = {
  application: ProofGuidedWebChangeShellApplication;
  publicDirectory?: string;
};

export type StartProofGuidedWebChangeShellOptions =
  ProofGuidedWebChangeShellServerOptions & {
    host?: "127.0.0.1";
    port?: number;
  };

export type RunningProofGuidedWebChangeShell = {
  host: string;
  port: number;
  url: string;
  launch_url: string;
  close(): Promise<void>;
};

type ShellErrorCode =
  | "not_found"
  | "unauthorized"
  | "method_not_allowed"
  | "invalid_request"
  | "operation_in_progress"
  | "check_unavailable"
  | "repair_unavailable"
  | "retry_unavailable"
  | "operation_failed";

const DEFAULT_HOST = "127.0.0.1";
const CAPABILITY_HEADER = "x-riddle-web-change-run";
const MAX_REQUEST_BODY_BYTES = 1_024;
const STATIC_FILES = new Map<string, {
  filename: string;
  contentType: string;
}>([
  ["/", {
    filename: "index.html",
    contentType: "text/html; charset=utf-8",
  }],
  ["/index.html", {
    filename: "index.html",
    contentType: "text/html; charset=utf-8",
  }],
  ["/app.js", {
    filename: "app.js",
    contentType: "text/javascript; charset=utf-8",
  }],
  ["/view-model.js", {
    filename: "view-model.js",
    contentType: "text/javascript; charset=utf-8",
  }],
  ["/styles.css", {
    filename: "styles.css",
    contentType: "text/css; charset=utf-8",
  }],
]);

function exactApplication(
  application: ProofGuidedWebChangeShellApplication,
): void {
  if (!application || typeof application !== "object") {
    throw new TypeError("application must be an object.");
  }
  for (const method of [
    "snapshot",
    "checkCurrent",
    "applyRepair",
    "prepareFreshAttempt",
    "audit",
    "close",
  ] as const) {
    if (typeof application[method] !== "function") {
      throw new TypeError(`application.${method} must be a function.`);
    }
  }
}

function defaultPublicDirectory(): string {
  const sourceAdjacent = fileURLToPath(
    new URL("../public/", import.meta.url),
  );
  const compiledFallback = fileURLToPath(
    new URL("../../public/", import.meta.url),
  );
  if (existsSync(sourceAdjacent)) return sourceAdjacent;
  if (existsSync(compiledFallback)) return compiledFallback;
  return sourceAdjacent;
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
    "content-length": Buffer.byteLength(body).toString(),
    ...extraHeaders,
  });
  response.end(body);
}

function writeError(
  response: ServerResponse,
  statusCode: number,
  code: ShellErrorCode,
  message: string,
  extraHeaders: Readonly<Record<string, string>> = {},
): void {
  writeJson(response, statusCode, {
    error: {
      code,
      message,
    },
  }, extraHeaders);
}

function writeStatic(
  response: ServerResponse,
  publicDirectory: string,
  pathname: string,
): boolean {
  const asset = STATIC_FILES.get(pathname);
  if (!asset) return false;
  const filePath = path.join(publicDirectory, asset.filename);
  if (!existsSync(filePath)) {
    writeError(
      response,
      500,
      "operation_failed",
      "The local interface assets are unavailable.",
    );
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
      "frame-src http://127.0.0.1:* http://localhost:*",
      "img-src 'self' data:",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
    ].join("; "),
    "content-type": asset.contentType,
    "content-length": body.byteLength.toString(),
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
  response.end(body);
  return true;
}

function expectedLoopbackAuthority(
  request: IncomingMessage,
): string | null {
  const localPort = request.socket.localPort;
  if (
    typeof localPort !== "number"
    || !Number.isInteger(localPort)
    || localPort < 1
    || localPort > 65_535
  ) {
    return null;
  }
  return `127.0.0.1:${localPort}`;
}

function requestAuthorityIsAllowed(
  request: IncomingMessage,
): boolean {
  const expectedAuthority = expectedLoopbackAuthority(request);
  return (
    expectedAuthority !== null
    && request.headers.host === expectedAuthority
    && request.socket.localAddress === DEFAULT_HOST
    && request.socket.remoteAddress === DEFAULT_HOST
  );
}

function sameSecret(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return (
    leftBytes.byteLength === rightBytes.byteLength
    && timingSafeEqual(leftBytes, rightBytes)
  );
}

function requestHasCapability(
  request: IncomingMessage,
  runToken: string,
): boolean {
  const supplied = request.headers[CAPABILITY_HEADER];
  return typeof supplied === "string" && sameSecret(supplied, runToken);
}

function requestOriginIsAllowed(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  const expectedAuthority = expectedLoopbackAuthority(request);
  if (
    typeof origin !== "string"
    || expectedAuthority === null
  ) {
    return false;
  }
  try {
    const parsed = new URL(origin);
    return (
      origin === `http://${expectedAuthority}`
      && parsed.protocol === "http:"
      && parsed.hostname === "127.0.0.1"
      && parsed.host === expectedAuthority
      && parsed.origin === origin
      && request.headers.host === expectedAuthority
    );
  } catch {
    return false;
  }
}

async function assertEmptyRequestBody(
  request: IncomingMessage,
): Promise<void> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as Uint8Array);
    bytes += buffer.byteLength;
    if (bytes > MAX_REQUEST_BODY_BYTES) {
      throw new TypeError("Request body is too large.");
    }
    chunks.push(buffer);
  }
  if (bytes === 0) return;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new TypeError("Request body must be empty or an empty JSON object.");
  }
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.keys(value).length !== 0
  ) {
    throw new TypeError(
      "This operation does not accept caller-selected inputs.",
    );
  }
}

function repairIsAvailable(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return false;
  }
  const record = snapshot as Record<string, unknown>;
  const current = record.current_check;
  const repair = record.repair;
  if (
    !current
    || typeof current !== "object"
    || Array.isArray(current)
    || !repair
    || typeof repair !== "object"
    || Array.isArray(repair)
  ) {
    return false;
  }
  return (
    (current as Record<string, unknown>).disposition
      === "does_not_conform"
    && (repair as Record<string, unknown>).available === true
  );
}

function checkIsAvailable(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return false;
  }
  return (snapshot as Record<string, unknown>).can_check === true;
}

function retryIsAvailable(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return false;
  }
  const record = snapshot as Record<string, unknown>;
  const retry = record.retry;
  return (
    record.can_retry === true
    && retry !== null
    && typeof retry === "object"
    && !Array.isArray(retry)
    && (retry as Record<string, unknown>).available === true
  );
}

function checkRefFromPathname(pathname: string): string | null {
  const prefix = "/api/audit/";
  if (!pathname.startsWith(prefix)) return null;
  const encoded = pathname.slice(prefix.length);
  if (!encoded || encoded.includes("/")) return null;
  try {
    const decoded = decodeURIComponent(encoded);
    if (
      decoded.trim().length === 0
      || decoded.length > 256
      || /[\u0000-\u001f\u007f]/u.test(decoded)
    ) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function closeHttpServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

/**
 * Creates the local shell HTTP server around an injected application.
 *
 * The mutating API accepts no request fields. Candidate, target, contract,
 * profile, and repair authority remain inside the injected application.
 */
function createProofGuidedWebChangeShellServer(
  options: ProofGuidedWebChangeShellServerOptions,
  runToken: string,
): Server {
  exactApplication(options.application);
  const application = options.application;
  const publicDirectory = path.resolve(
    options.publicDirectory ?? defaultPublicDirectory(),
  );
  let operation: "check" | "repair" | "retry" | null = null;

  const server = createServer(async (request, response) => {
    const method = request.method ?? "GET";
    if (!requestAuthorityIsAllowed(request)) {
      writeError(
        response,
        403,
        "invalid_request",
        "Requests must use the exact loopback workbench address.",
      );
      return;
    }
    let requestUrl: URL;
    try {
      requestUrl = new URL(
        request.url ?? "/",
        "http://proof-guided-web-change.local",
      );
    } catch {
      writeError(response, 400, "invalid_request", "Invalid request URL.");
      return;
    }
    const pathname = requestUrl.pathname;
    const launchRequest = (
      method === "GET"
      && pathname === "/"
      && requestUrl.searchParams.size === 1
      && requestUrl.searchParams.has("run")
      && sameSecret(requestUrl.searchParams.get("run") ?? "", runToken)
    );
    if (requestUrl.search !== "" && !launchRequest) {
      writeError(
        response,
        400,
        "invalid_request",
        "Query parameters are not accepted.",
      );
      return;
    }
    if (method === "GET" && writeStatic(
      response,
      publicDirectory,
      pathname,
    )) {
      return;
    }
    if (!requestHasCapability(request, runToken)) {
      writeError(
        response,
        401,
        "unauthorized",
        "This local workbench requires its run capability.",
      );
      return;
    }

    if (method === "GET" && pathname === "/api/health") {
      writeJson(response, 200, { ok: true });
      return;
    }

    if (method === "GET" && pathname === "/api/snapshot") {
      try {
        writeJson(response, 200, await application.snapshot());
      } catch {
        writeError(
          response,
          500,
          "operation_failed",
          "The current application state could not be loaded.",
        );
      }
      return;
    }

    const auditCheckRef = checkRefFromPathname(pathname);
    if (method === "GET" && auditCheckRef !== null) {
      try {
        writeJson(response, 200, await application.audit(auditCheckRef));
      } catch {
        writeError(
          response,
          404,
          "not_found",
          "No audit record exists for that check.",
        );
      }
      return;
    }

    if (
      method === "POST"
      && (
        pathname === "/api/check"
        || pathname === "/api/repair"
        || pathname === "/api/retry"
      )
    ) {
      if (!requestOriginIsAllowed(request)) {
        writeError(
          response,
          403,
          "invalid_request",
          "Cross-origin operations are not allowed.",
        );
        return;
      }
      try {
        await assertEmptyRequestBody(request);
      } catch {
        writeError(
          response,
          400,
          "invalid_request",
          "This operation accepts no caller-selected inputs.",
        );
        return;
      }
      if (operation !== null) {
        writeError(
          response,
          409,
          "operation_in_progress",
          "Another check or repair is already running.",
          { "retry-after": "1" },
        );
        return;
      }

      operation = pathname === "/api/check"
        ? "check"
        : pathname === "/api/repair"
          ? "repair"
          : "retry";
      try {
        let snapshot: unknown;
        try {
          snapshot = await application.snapshot();
        } catch {
          writeError(
            response,
            500,
            "operation_failed",
            operation === "check"
              ? "Check availability could not be established."
              : operation === "repair"
                ? "Repair availability could not be established."
                : "Fresh-attempt availability could not be established.",
          );
          return;
        }
        if (operation === "check") {
          if (!checkIsAvailable(snapshot)) {
            writeError(
              response,
              409,
              "check_unavailable",
              "The current candidate cannot be checked again.",
            );
            return;
          }
        } else if (operation === "repair" && !repairIsAvailable(snapshot)) {
          writeError(
            response,
            409,
            "repair_unavailable",
            "No explicit repair is available for the current result.",
          );
          return;
        } else if (operation === "retry" && !retryIsAvailable(snapshot)) {
          writeError(
            response,
            409,
            "retry_unavailable",
            "No fresh attempt is available for the current result.",
          );
          return;
        }
        if (operation === "check") {
          await application.checkCurrent();
        } else if (operation === "repair") {
          await application.applyRepair();
        } else {
          await application.prepareFreshAttempt();
        }
        writeJson(response, 200, await application.snapshot());
      } catch {
        writeError(
          response,
          500,
          "operation_failed",
          operation === "check"
            ? "The browser check did not complete."
            : operation === "repair"
              ? "The repair did not complete."
              : "The fresh attempt could not be prepared.",
        );
      } finally {
        operation = null;
      }
      return;
    }

    if (
      STATIC_FILES.has(pathname)
      || pathname.startsWith("/api/")
    ) {
      writeError(
        response,
        405,
        "method_not_allowed",
        "That method is not allowed.",
        { allow: pathname.startsWith("/api/audit/") ? "GET" : "GET, POST" },
      );
      return;
    }

    writeError(response, 404, "not_found", "Not found.");
  });
  return server;
}

export async function startProofGuidedWebChangeShell(
  options: StartProofGuidedWebChangeShellOptions,
): Promise<RunningProofGuidedWebChangeShell> {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? 0;
  if (host !== DEFAULT_HOST) {
    throw new TypeError(
      "The local shell may bind only to 127.0.0.1.",
    );
  }
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new TypeError("port must be an integer from 0 through 65535.");
  }
  const runToken = randomBytes(32).toString("base64url");
  const server = createProofGuidedWebChangeShellServer(
    options,
    runToken,
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeHttpServer(server);
    throw new Error("The local shell did not receive a TCP address.");
  }
  let closed = false;
  return {
    host,
    port: address.port,
    url: `http://${host}:${address.port}/`,
    launch_url:
      `http://${host}:${address.port}/?run=${runToken}`,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      await closeHttpServer(server);
      await options.application.close();
    },
  };
}
