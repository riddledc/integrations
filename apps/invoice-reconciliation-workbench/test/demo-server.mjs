import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  auditFor,
  checkedConformingState,
  checkedFailingState,
  correctedReadyState,
  readyState,
} from "./fixtures.mjs";

const host = "127.0.0.1";
const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/view-model.js", ["view-model.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
]);

let state = readyState();

function json(response, status, value) {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

async function emptyJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  const parsed = body ? JSON.parse(body) : {};
  return (
    parsed
    && typeof parsed === "object"
    && !Array.isArray(parsed)
    && Object.keys(parsed).length === 0
  );
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}`);
  if (request.method === "GET" && staticFiles.has(url.pathname)) {
    const [filename, contentType] = staticFiles.get(url.pathname);
    const body = await readFile(path.join(publicDirectory, filename));
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-security-policy": [
        "default-src 'self'",
        "base-uri 'none'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "img-src 'self' data:",
        "object-src 'none'",
        "script-src 'self'",
        "style-src 'self'",
      ].join("; "),
      "content-type": contentType,
      "content-length": body.byteLength,
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    });
    response.end(body);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/state") {
    json(response, 200, state);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/audit") {
    const audit = auditFor(url.searchParams.get("check_ref"));
    if (audit === null) {
      json(response, 404, {
        error: { message: "No audit exists for that check." },
      });
      return;
    }
    json(response, 200, audit);
    return;
  }

  if (
    request.method === "POST"
    && (
      url.pathname === "/api/check"
      || url.pathname === "/api/correct"
    )
  ) {
    try {
      if (!(await emptyJsonBody(request))) {
        json(response, 400, {
          error: { message: "This operation accepts no caller fields." },
        });
        return;
      }
    } catch {
      json(response, 400, {
        error: { message: "The request must be an empty JSON object." },
      });
      return;
    }

    if (url.pathname === "/api/check") {
      if (!state.can_check) {
        json(response, 409, {
          error: { message: "The current attempt was already checked." },
        });
        return;
      }
      state = state.record_set.revision === "Revision 1"
        ? checkedFailingState()
        : checkedConformingState();
      json(response, 200, state);
      return;
    }

    if (!state.can_correct) {
      json(response, 409, {
        error: { message: "No exact invoice correction is available." },
      });
      return;
    }
    state = correctedReadyState();
    json(response, 200, state);
    return;
  }

  json(response, 404, { error: { message: "Not found." } });
});

server.listen(0, host, () => {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Fixture server has no TCP address.");
  }
  process.stdout.write(`http://${host}:${address.port}/\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
