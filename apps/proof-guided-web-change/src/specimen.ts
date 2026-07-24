import { createHash } from "node:crypto";

const UTF8 = new TextEncoder();
const MAX_SOURCE_BYTES = 1024 * 1024;

const PAGE_PREFIX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Durable setting repair</title>
    <style>
      :root {
        color-scheme: light;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
        color: #17221d;
        background: #f5f1e8;
      }
      * { box-sizing: border-box; }
      body {
        display: grid;
        min-height: 100vh;
        margin: 0;
        padding: 2rem;
        place-items: center;
      }
      main {
        display: grid;
        width: min(100%, 32rem);
        gap: 0.75rem;
        padding: 2rem;
        border: 1px solid #d4d9d1;
        border-radius: 1rem;
        background: white;
        box-shadow: 0 18px 50px rgba(34, 50, 42, 0.1);
      }
      h1 {
        margin: 0 0 0.75rem;
        font-family: Georgia, "Times New Roman", serif;
        font-size: clamp(1.8rem, 6vw, 2.8rem);
        font-weight: 500;
        letter-spacing: -0.04em;
        line-height: 1;
      }
      label {
        color: #536159;
        font-size: 0.78rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      input {
        width: 100%;
        min-height: 2.8rem;
        padding: 0.65rem 0.75rem;
        border: 1px solid #bbc5bd;
        border-radius: 0.55rem;
        font: inherit;
      }
      button {
        justify-self: start;
        min-height: 2.7rem;
        padding: 0.65rem 1rem;
        border: 0;
        border-radius: 0.55rem;
        background: #155c46;
        color: white;
        font: inherit;
        font-weight: 750;
        cursor: pointer;
      }
      output {
        display: block;
        margin-top: 0.5rem;
        padding: 0.85rem 1rem;
        border-radius: 0.6rem;
        background: #f0f3ef;
        overflow-wrap: anywhere;
      }
      output::before {
        display: block;
        margin-bottom: 0.2rem;
        color: #647169;
        content: "Current saved value";
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
    </style>
  </head>
  <body>
    <main id="state-app">
      <h1>Durable setting repair</h1>
      <label for="value">Value</label>
      <input id="value">
      <button id="save" type="button">Save</button>
      <output id="current">`;

const PAGE_SUFFIX = `</output>
    </main>
    <script src="/client.js" defer></script>
  </body>
</html>`;

const CLIENT_PREFIX = `const current = document.querySelector("#current");
const input = document.querySelector("#value");
const runCapability = new URL(location.href).searchParams.get("run");
input.value = current.textContent;
document.querySelector("#save").addEventListener("click", async () => {
`;

const CLIENT_SUFFIX = `
});`;

export const PAGE_ONLY_SAVE_IMPLEMENTATION = [
  "  current.textContent = input.value;",
  '  document.body.dataset.saved = "page-only";',
].join("\n");

export const SERVER_BACKED_SAVE_IMPLEMENTATION = [
  '  const response = await fetch("/state", {',
  '    method: "POST",',
  '    headers: {',
  '      "content-type": "application/json",',
  '      ...(runCapability ? { "x-riddle-preview-run": runCapability } : {}),',
  "    },",
  "    body: JSON.stringify({ value: input.value }),",
  "  });",
  '  if (!response.ok) throw new Error("save_failed");',
  "  const payload = await response.json();",
  "  current.textContent = payload.value;",
  '  document.body.dataset.saved = "server-backed";',
].join("\n");

export const PAGE_ONLY_SAVE_DECLARATION =
  `const SAVE_IMPLEMENTATION = ${JSON.stringify(
    PAGE_ONLY_SAVE_IMPLEMENTATION,
  )};`;

export const SERVER_BACKED_SAVE_DECLARATION =
  `const SAVE_IMPLEMENTATION = ${JSON.stringify(
    SERVER_BACKED_SAVE_IMPLEMENTATION,
  )};`;

export const STATE_ENDPOINT_INSERTION_ANCHOR =
  '    if (request.method === "GET" && requestUrl.pathname === "/") {';

export const SERVER_STATE_ENDPOINT_IMPLEMENTATION = [
  '    if (request.method === "POST" && request.url === "/state") {',
  "      if (!sameOrigin(request)) {",
  '        writeJson(response, 403, { error: "forbidden_origin" });',
  "        return;",
  "      }",
  '      if (request.headers["content-type"] !== "application/json") {',
  '        writeJson(response, 415, { error: "unsupported_media_type" });',
  "        return;",
  "      }",
  '      let body = "";',
  "      let bodyBytes = 0;",
  "      let rejected = false;",
  '      request.setEncoding("utf8");',
  '      request.on("data", (chunk) => {',
  "        if (rejected) return;",
  '        bodyBytes += Buffer.byteLength(chunk, "utf8");',
  "        if (bodyBytes > 4096) {",
  "          rejected = true;",
  '          writeJson(response, 413, { error: "request_too_large" });',
  "          return;",
  "        }",
  "        body += chunk;",
  "      });",
  '      request.on("end", () => {',
  "        if (rejected) return;",
  "        try {",
  "          const payload = JSON.parse(body);",
  "          if (",
  "            !payload",
  '            || typeof payload !== "object"',
  "            || Array.isArray(payload)",
  '            || Object.keys(payload).length !== 1',
  '            || !Object.hasOwn(payload, "value")',
  '            || typeof payload.value !== "string"',
  "            || payload.value.length > 256",
  "          ) {",
  '            throw new Error("invalid_value");',
  "          }",
  "          persistedValue = payload.value;",
  "          writeJson(response, 200, { value: persistedValue });",
  "        } catch {",
  '          writeJson(response, 400, { error: "invalid_json" });',
  "        }",
  "      });",
  "      return;",
  "    }",
].join("\n");

const SOURCE_LINES = [
  'import { randomBytes, timingSafeEqual } from "node:crypto";',
  'import { createServer } from "node:http";',
  "",
  `const PAGE_PREFIX = ${JSON.stringify(PAGE_PREFIX)};`,
  `const PAGE_SUFFIX = ${JSON.stringify(PAGE_SUFFIX)};`,
  `const CLIENT_PREFIX = ${JSON.stringify(CLIENT_PREFIX)};`,
  `const CLIENT_SUFFIX = ${JSON.stringify(CLIENT_SUFFIX)};`,
  PAGE_ONLY_SAVE_DECLARATION,
  "",
  "const PAGE_HEADERS = {",
  '  "cache-control": "no-store",',
  `  "content-security-policy": "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'none'; frame-ancestors http://127.0.0.1:*; object-src 'none'; script-src 'self'; style-src 'unsafe-inline'",`,
  '  "referrer-policy": "no-referrer",',
  '  "x-content-type-options": "nosniff",',
  "};",
  "",
  "const JSON_HEADERS = {",
  '  "cache-control": "no-store",',
  '  "content-type": "application/json; charset=utf-8",',
  '  "referrer-policy": "no-referrer",',
  '  "x-content-type-options": "nosniff",',
  "};",
  "",
  "function escapeHtml(value) {",
  "  return String(value)",
  '    .replaceAll("&", "&amp;")',
  '    .replaceAll("<", "&lt;")',
  '    .replaceAll(">", "&gt;")',
  '    .replaceAll("\\\"", "&quot;")',
  `    .replaceAll("'", "&#39;");`,
  "}",
  "",
  "function renderPage(value) {",
  "  return PAGE_PREFIX",
  "    + escapeHtml(value)",
  "    + PAGE_SUFFIX;",
  "}",
  "",
  "function renderClient() {",
  "  return CLIENT_PREFIX + SAVE_IMPLEMENTATION + CLIENT_SUFFIX;",
  "}",
  "",
  "function expectedAuthority(request) {",
  "  const port = request.socket.localPort;",
  "  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;",
  '  return "127.0.0.1:" + port;',
  "}",
  "",
  "function exactHost(request) {",
  "  const expected = expectedAuthority(request);",
  "  return expected !== null",
  "    && request.headers.host === expected",
  '    && request.socket.localAddress === "127.0.0.1"',
  '    && request.socket.remoteAddress === "127.0.0.1";',
  "}",
  "",
  "function sameOrigin(request) {",
  "  const expected = expectedAuthority(request);",
  "  return expected !== null",
  '    && request.headers.origin === "http://" + expected',
  "    && request.headers.host === expected;",
  "}",
  "",
  "function sameSecret(actual, expected) {",
  '  if (typeof actual !== "string" || typeof expected !== "string") return false;',
  '  const actualBytes = Buffer.from(actual, "utf8");',
  '  const expectedBytes = Buffer.from(expected, "utf8");',
  "  return actualBytes.length === expectedBytes.length",
  "    && timingSafeEqual(actualBytes, expectedBytes);",
  "}",
  "",
  "function writeJson(response, status, value) {",
  "  response.writeHead(status, JSON_HEADERS);",
  "  response.end(JSON.stringify(value));",
  "}",
  "",
  "export async function startPreview() {",
  '  const runToken = randomBytes(32).toString("base64url");',
  '  let persistedValue = "unset";',
  "  const server = createServer((request, response) => {",
  "    if (!exactHost(request)) {",
  '      writeJson(response, 403, { error: "invalid_host" });',
  "      return;",
  "    }",
  "    let requestUrl;",
  "    try {",
  '      requestUrl = new URL(request.url ?? "/", "http://" + expectedAuthority(request));',
  "    } catch {",
  '      writeJson(response, 400, { error: "invalid_url" });',
  "      return;",
  "    }",
  "    const launchCapability = (",
  '      request.method === "GET"',
  '      && requestUrl.pathname === "/"',
  "      && requestUrl.searchParams.size === 1",
  '      && sameSecret(requestUrl.searchParams.get("run"), runToken)',
  "    );",
  '    const requestCapability = sameSecret(request.headers["x-riddle-preview-run"], runToken);',
  '    if (requestUrl.search !== "" && !launchCapability) {',
  '      writeJson(response, 400, { error: "query_not_allowed" });',
  "      return;",
  "    }",
  '    if (request.method === "GET" && requestUrl.pathname === "/favicon.ico") {',
  "      response.writeHead(204, PAGE_HEADERS);",
  "      response.end();",
  "      return;",
  "    }",
  '    if (request.method === "GET" && requestUrl.pathname === "/client.js") {',
  "      response.writeHead(200, {",
  "        ...PAGE_HEADERS,",
  '        "content-type": "text/javascript; charset=utf-8",',
  "      });",
  "      response.end(renderClient());",
  "      return;",
  "    }",
  "    if (!launchCapability && !requestCapability) {",
  '      writeJson(response, 401, { error: "missing_run_capability" });',
  "      return;",
  "    }",
  STATE_ENDPOINT_INSERTION_ANCHOR,
  "      response.writeHead(200, {",
  "        ...PAGE_HEADERS,",
  '        "content-type": "text/html; charset=utf-8",',
  "      });",
  "      response.end(renderPage(persistedValue));",
  "      return;",
  "    }",
  "    response.writeHead(404, PAGE_HEADERS);",
  '    response.end("not found");',
  "  });",
  "",
  "  return await new Promise((resolve, reject) => {",
  '    server.once("error", reject);',
  '    server.listen(0, "127.0.0.1", () => {',
  "      const address = server.address();",
  '      if (!address || typeof address !== "object") {',
  '        reject(new Error("loopback_preview_address_unavailable"));',
  "        return;",
  "      }",
  "      resolve({",
  '        preview_url: "http://127.0.0.1:" + address.port + "/?run=" + runToken,',
  '        proof_target_url: "http://127.0.0.1:" + address.port + "/",',
  '        proof_request_headers: { "x-riddle-preview-run": runToken },',
  "        async close() {",
  "          await new Promise((closeResolve, closeReject) => {",
  "            server.close((error) => {",
  "              if (error) closeReject(error);",
  "              else closeResolve();",
  "            });",
  "          });",
  "        },",
  "      });",
  "    });",
  "  });",
  "}",
];

export const PAGE_ONLY_SPECIMEN_SOURCE_TEXT =
  `${SOURCE_LINES.join("\n")}\n`;

const PAGE_ONLY_SPECIMEN_SOURCE_BYTES =
  UTF8.encode(PAGE_ONLY_SPECIMEN_SOURCE_TEXT);

function replaceOwnedSourceSeam(
  source: string,
  expected: string,
  replacement: string,
  context: string,
): string {
  const first = source.indexOf(expected);
  if (first < 0 || source.indexOf(expected, first + expected.length) >= 0) {
    throw new Error(
      `The app-owned ${context} seam was not present exactly once.`,
    );
  }
  return `${source.slice(0, first)}${replacement}${source.slice(
    first + expected.length,
  )}`;
}

export const SERVER_BACKED_SPECIMEN_SOURCE_TEXT =
  replaceOwnedSourceSeam(
    replaceOwnedSourceSeam(
      PAGE_ONLY_SPECIMEN_SOURCE_TEXT,
      PAGE_ONLY_SAVE_DECLARATION,
      SERVER_BACKED_SAVE_DECLARATION,
      "page-only save",
    ),
    STATE_ENDPOINT_INSERTION_ANCHOR,
    `${SERVER_STATE_ENDPOINT_IMPLEMENTATION}\n${STATE_ENDPOINT_INSERTION_ANCHOR}`,
    "server state endpoint",
  );

const SERVER_BACKED_SPECIMEN_SOURCE_BYTES =
  UTF8.encode(SERVER_BACKED_SPECIMEN_SOURCE_TEXT);

export function pageOnlySpecimenSourceBytes(): Uint8Array {
  return copySourceBytes(PAGE_ONLY_SPECIMEN_SOURCE_BYTES);
}

export function serverBackedSpecimenSourceBytes(): Uint8Array {
  return copySourceBytes(SERVER_BACKED_SPECIMEN_SOURCE_BYTES);
}

export function copySourceBytes(sourceBytes: Uint8Array): Uint8Array {
  return new Uint8Array(sourceBytes);
}

function sourceBytesEqual(
  left: Uint8Array,
  right: Uint8Array,
): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function sourceIsAppOwnedVariant(sourceBytes: Uint8Array): boolean {
  return (
    sourceBytesEqual(sourceBytes, PAGE_ONLY_SPECIMEN_SOURCE_BYTES)
    || sourceBytesEqual(sourceBytes, SERVER_BACKED_SPECIMEN_SOURCE_BYTES)
  );
}

export function sourceDigest(sourceBytes: Uint8Array): string {
  return `sha256:${createHash("sha256")
    .update(sourceBytes)
    .digest("hex")}`;
}

export function contentDerivedRevision(sourceBytes: Uint8Array): string {
  const hexadecimalDigest = sourceDigest(sourceBytes).slice("sha256:".length);
  return `source-${hexadecimalDigest}`;
}

export interface LoopbackPreviewRuntime {
  preview_url: string;
  proof_target_url: string;
  proof_request_headers: Readonly<Record<string, string>>;
  close(): Promise<void>;
}

export interface LoopbackProofTargetAccess {
  target_url: string;
  extra_http_headers: Readonly<Record<string, string>>;
}

interface LoopbackPreviewModule {
  startPreview(): Promise<LoopbackPreviewRuntime>;
}

export interface ImmutableLoopbackPreviewCandidate {
  readonly candidate_ref: string;
  readonly label: string;
  readonly source_digest: string;
  readonly revision: string;
  readonly preview_url: string;
  readSourceBytes(): Uint8Array;
  proofTargetAccess(): Promise<LoopbackProofTargetAccess>;
  close(): Promise<void>;
}

export interface CreateLoopbackPreviewCandidateInput {
  candidate_ref: string;
  label: string;
  source_bytes: Uint8Array;
}

function nonempty(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${context} must be a non-empty string.`);
  }
  return value;
}

function assertOpaqueCandidateRef(candidateRef: string): void {
  if (!/^candidate_[0-9]{4}$/u.test(candidateRef)) {
    throw new TypeError(
      "candidate_ref must be an app-issued opaque candidate reference.",
    );
  }
}

function assertSourceBytes(sourceBytes: Uint8Array): void {
  if (!(sourceBytes instanceof Uint8Array)) {
    throw new TypeError("source_bytes must be a Uint8Array.");
  }
  if (
    sourceBytes.byteLength === 0
    || sourceBytes.byteLength > MAX_SOURCE_BYTES
  ) {
    throw new TypeError(
      `source_bytes must contain between 1 and ${MAX_SOURCE_BYTES} bytes.`,
    );
  }
}

function assertLoopbackPreviewUrl(value: unknown): string {
  const previewUrl = nonempty(value, "preview_url");
  const parsed = new URL(previewUrl);
  const runToken = parsed.searchParams.get("run");
  if (
    parsed.protocol !== "http:"
    || parsed.hostname !== "127.0.0.1"
    || parsed.pathname !== "/"
    || parsed.searchParams.size !== 1
    || typeof runToken !== "string"
    || !/^[A-Za-z0-9_-]{43}$/u.test(runToken)
    || parsed.hash !== ""
  ) {
    throw new TypeError(
      "The owned preview must use an exact ephemeral 127.0.0.1 HTTP target.",
    );
  }
  return parsed.href;
}

function proofTargetAccess(
  runtime: LoopbackPreviewRuntime,
): LoopbackProofTargetAccess {
  const previewUrl = new URL(
    assertLoopbackPreviewUrl(runtime.preview_url),
  );
  const targetUrl = new URL(
    nonempty(runtime.proof_target_url, "proof_target_url"),
  );
  const runToken = previewUrl.searchParams.get("run");
  const headers = runtime.proof_request_headers;
  if (
    targetUrl.protocol !== "http:"
    || targetUrl.hostname !== "127.0.0.1"
    || targetUrl.origin !== previewUrl.origin
    || targetUrl.pathname !== "/"
    || targetUrl.search !== ""
    || targetUrl.hash !== ""
    || !headers
    || typeof headers !== "object"
    || Array.isArray(headers)
    || Object.getPrototypeOf(headers) !== Object.prototype
    || Object.keys(headers).length !== 1
    || headers["x-riddle-preview-run"] !== runToken
  ) {
    throw new TypeError(
      "The owned proof target must use an exact token-free loopback URL and one out-of-band run header.",
    );
  }
  return Object.freeze({
    target_url: targetUrl.href,
    extra_http_headers: Object.freeze({
      "x-riddle-preview-run": headers["x-riddle-preview-run"],
    }),
  });
}

async function loadPreviewModule(
  sourceBytes: Uint8Array,
  candidateRef: string,
): Promise<LoopbackPreviewModule> {
  const encoded = Buffer.from(sourceBytes).toString("base64");
  const moduleUrl =
    `data:text/javascript;base64,${encoded}#${candidateRef}`;
  const loaded = await import(moduleUrl) as Partial<LoopbackPreviewModule>;
  if (typeof loaded.startPreview !== "function") {
    throw new TypeError(
      "The candidate source must export an async startPreview function.",
    );
  }
  return loaded as LoopbackPreviewModule;
}

/**
 * Starts the exact supplied source bytes as an immutable loopback preview.
 *
 * Metadata is frozen and readSourceBytes always returns a defensive copy. The
 * HTTP state is intentionally not reset: the application must use each
 * candidate for at most one proof attempt.
 */
export async function createImmutableLoopbackPreviewCandidate(
  input: CreateLoopbackPreviewCandidateInput,
): Promise<ImmutableLoopbackPreviewCandidate> {
  if (!input || typeof input !== "object") {
    throw new TypeError("Loopback preview input must be an object.");
  }
  const candidateRef = nonempty(input.candidate_ref, "candidate_ref");
  assertOpaqueCandidateRef(candidateRef);
  const label = nonempty(input.label, "label");
  assertSourceBytes(input.source_bytes);
  const ownedSourceBytes = copySourceBytes(input.source_bytes);
  if (!sourceIsAppOwnedVariant(ownedSourceBytes)) {
    throw new TypeError(
      "The preview refuses source bytes outside its exact app-owned variants.",
    );
  }
  const digest = sourceDigest(ownedSourceBytes);
  const revision = contentDerivedRevision(ownedSourceBytes);
  const previewModule = await loadPreviewModule(
    ownedSourceBytes,
    candidateRef,
  );
  const displayRuntime = await previewModule.startPreview();
  if (
    !displayRuntime
    || typeof displayRuntime !== "object"
    || typeof displayRuntime.close !== "function"
  ) {
    throw new TypeError(
      "The loopback preview must return preview_url and close().",
    );
  }
  let previewUrl: string;
  try {
    previewUrl = assertLoopbackPreviewUrl(displayRuntime.preview_url);
  } catch (error) {
    await displayRuntime.close();
    throw error;
  }
  let proofRuntime: LoopbackPreviewRuntime | null = null;
  let proofAccess: LoopbackProofTargetAccess | null = null;
  let proofTargetPromise: Promise<LoopbackProofTargetAccess> | null = null;
  let closed = false;

  return Object.freeze({
    candidate_ref: candidateRef,
    label,
    source_digest: digest,
    revision,
    preview_url: previewUrl,
    readSourceBytes(): Uint8Array {
      return copySourceBytes(ownedSourceBytes);
    },
    async proofTargetAccess(): Promise<LoopbackProofTargetAccess> {
      if (closed) {
        throw new Error("The loopback candidate is closed.");
      }
      if (proofRuntime !== null && proofAccess !== null) {
        return proofAccess;
      }
      if (proofTargetPromise === null) {
        proofTargetPromise = (async () => {
          const started = await previewModule.startPreview();
          if (
            !started
            || typeof started !== "object"
            || typeof started.close !== "function"
          ) {
            throw new TypeError(
              "The loopback proof target must return preview_url and close().",
            );
          }
          let access: LoopbackProofTargetAccess;
          try {
            assertLoopbackPreviewUrl(started.preview_url);
            access = proofTargetAccess(started);
          } catch (error) {
            await started.close();
            throw error;
          }
          if (closed) {
            await started.close();
            throw new Error("The loopback candidate closed while preparing proof.");
          }
          proofRuntime = started;
          proofAccess = access;
          return access;
        })();
      }
      try {
        return await proofTargetPromise;
      } catch (error) {
        proofTargetPromise = null;
        throw error;
      }
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      const targets: Promise<void>[] = [displayRuntime.close()];
      if (proofRuntime !== null) {
        targets.push(proofRuntime.close());
      } else if (proofTargetPromise !== null) {
        targets.push(proofTargetPromise.then(async () => {
          await proofRuntime?.close();
        }).catch(() => {}));
      }
      const results = await Promise.allSettled(targets);
      const failed = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (failed) throw failed.reason;
    },
  });
}

export class ImmutableLoopbackSpecimenFactory {
  readonly #candidates = new Map<
    string,
    ImmutableLoopbackPreviewCandidate
  >();
  #ordinal = 0;

  async create(input: {
    label: string;
    source_bytes: Uint8Array;
  }): Promise<ImmutableLoopbackPreviewCandidate> {
    this.#ordinal += 1;
    const candidateRef =
      `candidate_${String(this.#ordinal).padStart(4, "0")}`;
    const candidate = await createImmutableLoopbackPreviewCandidate({
      candidate_ref: candidateRef,
      label: input.label,
      source_bytes: input.source_bytes,
    });
    this.#candidates.set(candidateRef, candidate);
    return candidate;
  }

  async closeAll(): Promise<void> {
    const candidates = [...this.#candidates.values()];
    this.#candidates.clear();
    const results = await Promise.allSettled(
      candidates.map(async (candidate) => candidate.close()),
    );
    const failed = results.find(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected",
    );
    if (failed) throw failed.reason;
  }
}
