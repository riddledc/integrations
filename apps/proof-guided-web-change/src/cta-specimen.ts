import { createHash } from "node:crypto";

const UTF8 = new TextEncoder();
const MAX_SOURCE_BYTES = 1024 * 1024;
const OWNED_CTA_CANDIDATES = new WeakSet<object>();

export const INITIAL_PRIMARY_CTA = Object.freeze({
  text: "Explore features",
  href: "/features",
});

export const REQUESTED_PRIMARY_CTA = Object.freeze({
  text: "View pricing",
  href: "/pricing",
});

function primaryCtaDeclaration(input: {
  text: string;
  href: string;
}): string {
  return `const PRIMARY_CTA = Object.freeze(${JSON.stringify(input)});`;
}

export const INITIAL_PRIMARY_CTA_DECLARATION =
  primaryCtaDeclaration(INITIAL_PRIMARY_CTA);

export const REQUESTED_PRIMARY_CTA_DECLARATION =
  primaryCtaDeclaration(REQUESTED_PRIMARY_CTA);

const SOURCE_PREFIX = [
  'import { randomBytes, timingSafeEqual } from "node:crypto";',
  'import { createServer } from "node:http";',
  "",
].join("\n");

const SOURCE_SUFFIX = `

const ROUTES = Object.freeze([
  Object.freeze({
    name: "Home",
    path: "/",
    title: "Make the next change legible",
    body: "A small synthetic site for testing proof-guided changes.",
  }),
  Object.freeze({
    name: "Features",
    path: "/features",
    title: "Features",
    body: "Pinned contracts, fresh evidence, and visible outcomes.",
  }),
  Object.freeze({
    name: "Pricing",
    path: "/pricing",
    title: "Pricing",
    body: "A stable route that the requested primary CTA should reach.",
  }),
]);

const PAGE_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "content-security-policy": "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'none'; frame-ancestors http://127.0.0.1:*; object-src 'none'; script-src 'self'; style-src 'unsafe-inline'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
});

const JSON_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function routeFor(pathname) {
  return ROUTES.find((route) => route.path === pathname) ?? null;
}

function navHtml() {
  return ROUTES.map((route) =>
    '<a data-proof-route href="' + escapeHtml(route.path) + '">'
      + escapeHtml(route.name)
      + "</a>"
  ).join("");
}

function renderPage(route) {
  const homeAttributes = route.path === "/"
    ? ' data-testid="home-page"'
    : "";
  const primaryCta = route.path === "/"
    ? '<a class="primary-cta" data-testid="primary-cta" href="'
      + escapeHtml(PRIMARY_CTA.href)
      + '">'
      + escapeHtml(PRIMARY_CTA.text)
      + "</a>"
    : "";
  return \`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>\${escapeHtml(route.title)} · Northstar</title>
    <style>
      :root {
        color-scheme: light;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
        color: #18233a;
        background: #f6f4ee;
      }
      * { box-sizing: border-box; }
      body {
        min-width: 0;
        min-height: 100vh;
        margin: 0;
        background:
          radial-gradient(circle at 85% 0%, rgba(52, 98, 255, 0.16), transparent 34rem),
          #f6f4ee;
      }
      header {
        display: flex;
        width: min(100% - 2rem, 70rem);
        margin: 0 auto;
        padding: 1.25rem 0;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }
      .brand {
        color: inherit;
        font-family: Georgia, "Times New Roman", serif;
        font-size: 1.25rem;
        font-weight: 700;
        text-decoration: none;
      }
      nav {
        display: flex;
        min-width: 0;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 0.45rem;
      }
      nav a {
        padding: 0.55rem 0.75rem;
        border-radius: 999px;
        color: #33415f;
        font-size: 0.9rem;
        font-weight: 700;
        text-decoration: none;
      }
      nav a:hover { background: rgba(255, 255, 255, 0.72); }
      main {
        display: grid;
        width: min(100% - 2rem, 70rem);
        min-width: 0;
        min-height: min(42rem, calc(100vh - 6rem));
        margin: 0 auto;
        padding: clamp(3rem, 9vw, 8rem) 0;
        align-content: center;
      }
      .eyebrow {
        margin: 0 0 1rem;
        color: #3557d5;
        font-size: 0.75rem;
        font-weight: 850;
        letter-spacing: 0.13em;
        text-transform: uppercase;
      }
      h1 {
        max-width: 12ch;
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        font-size: clamp(2.5rem, 9vw, 6.75rem);
        font-weight: 500;
        letter-spacing: -0.055em;
        line-height: 0.94;
        overflow-wrap: break-word;
      }
      p {
        max-width: 36rem;
        margin: 1.5rem 0 0;
        color: #526078;
        font-size: clamp(1rem, 2vw, 1.2rem);
        line-height: 1.65;
      }
      .primary-cta {
        justify-self: start;
        margin-top: 2rem;
        padding: 0.9rem 1.2rem;
        border-radius: 0.7rem;
        background: #1d3fa3;
        box-shadow: 0 12px 30px rgba(29, 63, 163, 0.24);
        color: white;
        font-weight: 800;
        text-decoration: none;
      }
      @media (max-width: 36rem) {
        header { align-items: flex-start; }
        nav { max-width: 14rem; }
        main { padding-top: 4rem; align-content: start; }
      }
    </style>
  </head>
  <body>
    <header>
      <a class="brand" href="/">Northstar</a>
      <nav data-testid="site-nav" aria-label="Primary">\${navHtml()}</nav>
    </header>
    <main data-testid="route-page">
      <div\${homeAttributes}>
        <p class="eyebrow">Proof-guided web change</p>
        <h1>\${escapeHtml(route.title)}</h1>
        <p>\${escapeHtml(route.body)}</p>
        \${primaryCta}
      </div>
    </main>
    <script src="/client.js" defer></script>
  </body>
</html>\`;
}

const CLIENT_SOURCE = \`const run = new URL(location.href).searchParams.get("run");
if (run && /^[A-Za-z0-9_-]{43}$/.test(run)) {
  for (const link of document.querySelectorAll("a[href^='/']")) {
    const href = link.getAttribute("href");
    if (href && !href.includes("?")) {
      link.setAttribute("href", href + "?run=" + encodeURIComponent(run));
    }
  }
}\`;

function expectedAuthority(request) {
  const port = request.socket.localPort;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return "127.0.0.1:" + port;
}

function exactHost(request) {
  const expected = expectedAuthority(request);
  return expected !== null
    && request.headers.host === expected
    && request.socket.localAddress === "127.0.0.1"
    && request.socket.remoteAddress === "127.0.0.1";
}

function sameSecret(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string") return false;
  const actualBytes = Buffer.from(actual, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return actualBytes.length === expectedBytes.length
    && timingSafeEqual(actualBytes, expectedBytes);
}

function writeJson(response, status, value) {
  response.writeHead(status, JSON_HEADERS);
  response.end(JSON.stringify(value));
}

export async function startPreview() {
  const runToken = randomBytes(32).toString("base64url");
  const server = createServer((request, response) => {
    if (!exactHost(request)) {
      writeJson(response, 403, { error: "invalid_host" });
      return;
    }
    let requestUrl;
    try {
      requestUrl = new URL(
        request.url ?? "/",
        "http://" + expectedAuthority(request),
      );
    } catch {
      writeJson(response, 400, { error: "invalid_url" });
      return;
    }
    const route = routeFor(requestUrl.pathname);
    const launchCapability = (
      request.method === "GET"
      && route !== null
      && requestUrl.searchParams.size === 1
      && sameSecret(requestUrl.searchParams.get("run"), runToken)
    );
    const requestCapability = sameSecret(
      request.headers["x-riddle-preview-run"],
      runToken,
    );
    if (requestUrl.search !== "" && !launchCapability) {
      writeJson(response, 400, { error: "query_not_allowed" });
      return;
    }
    if (request.method === "GET" && requestUrl.pathname === "/favicon.ico") {
      response.writeHead(204, PAGE_HEADERS);
      response.end();
      return;
    }
    if (request.method === "GET" && requestUrl.pathname === "/client.js") {
      response.writeHead(200, {
        ...PAGE_HEADERS,
        "content-type": "text/javascript; charset=utf-8",
      });
      response.end(CLIENT_SOURCE);
      return;
    }
    if (!launchCapability && !requestCapability) {
      writeJson(response, 401, { error: "missing_run_capability" });
      return;
    }
    if (request.method === "GET" && route !== null) {
      response.writeHead(200, {
        ...PAGE_HEADERS,
        "content-type": "text/html; charset=utf-8",
      });
      response.end(renderPage(route));
      return;
    }
    response.writeHead(404, PAGE_HEADERS);
    response.end("not found");
  });

  return await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address !== "object") {
        reject(new Error("loopback_preview_address_unavailable"));
        return;
      }
      resolve({
        preview_url:
          "http://127.0.0.1:" + address.port + "/?run=" + runToken,
        proof_target_url: "http://127.0.0.1:" + address.port + "/",
        proof_request_headers: {
          "x-riddle-preview-run": runToken,
        },
        async close() {
          await new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) closeReject(error);
              else closeResolve();
            });
          });
        },
      });
    });
  });
}
`;

function specimenSourceText(input: {
  text: string;
  href: string;
}): string {
  return `${SOURCE_PREFIX}${primaryCtaDeclaration(input)}${SOURCE_SUFFIX}`;
}

export const INITIAL_CTA_SPECIMEN_SOURCE_TEXT =
  specimenSourceText(INITIAL_PRIMARY_CTA);

export const REQUESTED_CTA_SPECIMEN_SOURCE_TEXT =
  specimenSourceText(REQUESTED_PRIMARY_CTA);

const INITIAL_CTA_SPECIMEN_SOURCE_BYTES =
  UTF8.encode(INITIAL_CTA_SPECIMEN_SOURCE_TEXT);

const REQUESTED_CTA_SPECIMEN_SOURCE_BYTES =
  UTF8.encode(REQUESTED_CTA_SPECIMEN_SOURCE_TEXT);

export function initialCtaSpecimenSourceBytes(): Uint8Array {
  return copyCtaSourceBytes(INITIAL_CTA_SPECIMEN_SOURCE_BYTES);
}

export function requestedCtaSpecimenSourceBytes(): Uint8Array {
  return copyCtaSourceBytes(REQUESTED_CTA_SPECIMEN_SOURCE_BYTES);
}

export function copyCtaSourceBytes(sourceBytes: Uint8Array): Uint8Array {
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
    sourceBytesEqual(sourceBytes, INITIAL_CTA_SPECIMEN_SOURCE_BYTES)
    || sourceBytesEqual(sourceBytes, REQUESTED_CTA_SPECIMEN_SOURCE_BYTES)
  );
}

export function ctaSourceDigest(sourceBytes: Uint8Array): string {
  return `sha256:${createHash("sha256")
    .update(sourceBytes)
    .digest("hex")}`;
}

export function ctaContentDerivedRevision(
  sourceBytes: Uint8Array,
): string {
  return `source-${ctaSourceDigest(sourceBytes).slice("sha256:".length)}`;
}

export interface CtaLoopbackPreviewRuntime {
  preview_url: string;
  proof_target_url: string;
  proof_request_headers: Readonly<Record<string, string>>;
  close(): Promise<void>;
}

export interface CtaLoopbackProofTargetAccess {
  binding_preview_url: string;
  target_url: string;
  extra_http_headers: Readonly<Record<string, string>>;
}

interface CtaLoopbackPreviewModule {
  startPreview(): Promise<CtaLoopbackPreviewRuntime>;
}

export interface ImmutableCtaLoopbackPreviewCandidate {
  readonly candidate_ref: string;
  readonly label: string;
  readonly source_digest: string;
  readonly revision: string;
  readonly preview_url: string;
  readSourceBytes(): Uint8Array;
  proofTargetAccess(): Promise<CtaLoopbackProofTargetAccess>;
  close(): Promise<void>;
}

export function assertOwnedCtaLoopbackPreviewCandidate(
  value: unknown,
): asserts value is ImmutableCtaLoopbackPreviewCandidate {
  if (
    !value
    || typeof value !== "object"
    || !OWNED_CTA_CANDIDATES.has(value)
  ) {
    throw new TypeError(
      "The CTA candidate must be an app-created immutable loopback specimen.",
    );
  }
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
      "The owned CTA preview must use an exact ephemeral 127.0.0.1 HTTP target.",
    );
  }
  return parsed.href;
}

function checkedProofTargetAccess(
  runtime: CtaLoopbackPreviewRuntime,
): CtaLoopbackProofTargetAccess {
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
      "The owned CTA proof target must use an exact token-free loopback URL and one out-of-band run header.",
    );
  }
  return Object.freeze({
    binding_preview_url: previewUrl.href,
    target_url: targetUrl.href,
    extra_http_headers: Object.freeze({
      "x-riddle-preview-run": headers["x-riddle-preview-run"],
    }),
  });
}

async function loadPreviewModule(
  sourceBytes: Uint8Array,
  candidateRef: string,
): Promise<CtaLoopbackPreviewModule> {
  const encoded = Buffer.from(sourceBytes).toString("base64");
  const moduleUrl =
    `data:text/javascript;base64,${encoded}#${candidateRef}`;
  const loaded =
    await import(moduleUrl) as Partial<CtaLoopbackPreviewModule>;
  if (typeof loaded.startPreview !== "function") {
    throw new TypeError(
      "The CTA candidate source must export an async startPreview function.",
    );
  }
  return loaded as CtaLoopbackPreviewModule;
}

export async function createImmutableCtaLoopbackPreviewCandidate(
  input: {
    candidate_ref: string;
    label: string;
    source_bytes: Uint8Array;
  },
): Promise<ImmutableCtaLoopbackPreviewCandidate> {
  if (!input || typeof input !== "object") {
    throw new TypeError("CTA loopback preview input must be an object.");
  }
  const candidateRef = nonempty(input.candidate_ref, "candidate_ref");
  assertOpaqueCandidateRef(candidateRef);
  const label = nonempty(input.label, "label");
  assertSourceBytes(input.source_bytes);
  const ownedSourceBytes = copyCtaSourceBytes(input.source_bytes);
  if (!sourceIsAppOwnedVariant(ownedSourceBytes)) {
    throw new TypeError(
      "The CTA preview refuses source bytes outside its exact app-owned variants.",
    );
  }
  const digest = ctaSourceDigest(ownedSourceBytes);
  const revision = ctaContentDerivedRevision(ownedSourceBytes);
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
      "The CTA loopback preview must return preview_url and close().",
    );
  }
  let previewUrl: string;
  try {
    previewUrl = assertLoopbackPreviewUrl(displayRuntime.preview_url);
  } catch (error) {
    await displayRuntime.close();
    throw error;
  }
  let proofRuntime: CtaLoopbackPreviewRuntime | null = null;
  let proofAccess: CtaLoopbackProofTargetAccess | null = null;
  let proofTargetPromise:
    Promise<CtaLoopbackProofTargetAccess> | null = null;
  let closed = false;

  const candidate = Object.freeze({
    candidate_ref: candidateRef,
    label,
    source_digest: digest,
    revision,
    preview_url: previewUrl,
    readSourceBytes(): Uint8Array {
      return copyCtaSourceBytes(ownedSourceBytes);
    },
    async proofTargetAccess(): Promise<CtaLoopbackProofTargetAccess> {
      if (closed) {
        throw new Error("The CTA loopback candidate is closed.");
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
              "The CTA proof target must return preview_url and close().",
            );
          }
          let access: CtaLoopbackProofTargetAccess;
          try {
            assertLoopbackPreviewUrl(started.preview_url);
            access = checkedProofTargetAccess(started);
          } catch (error) {
            await started.close();
            throw error;
          }
          if (closed) {
            await started.close();
            throw new Error(
              "The CTA candidate closed while preparing proof.",
            );
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
        targets.push(
          proofTargetPromise
            .then(async () => {
              await proofRuntime?.close();
            })
            .catch(() => {}),
        );
      }
      const results = await Promise.allSettled(targets);
      const failed = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (failed) throw failed.reason;
    },
  });
  OWNED_CTA_CANDIDATES.add(candidate);
  return candidate;
}

export class ImmutableCtaLoopbackSpecimenFactory {
  readonly #candidates = new Map<
    string,
    ImmutableCtaLoopbackPreviewCandidate
  >();
  #ordinal = 0;

  async create(input: {
    label: string;
    source_bytes: Uint8Array;
  }): Promise<ImmutableCtaLoopbackPreviewCandidate> {
    this.#ordinal += 1;
    const candidateRef =
      `candidate_${String(this.#ordinal).padStart(4, "0")}`;
    const candidate =
      await createImmutableCtaLoopbackPreviewCandidate({
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
