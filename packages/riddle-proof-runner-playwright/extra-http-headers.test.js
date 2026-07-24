import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { readdirSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

import { createPlaywrightBrowserSession } from "./dist/browser.js";
import {
  createRiddleProofBrowserProfileResultVerifier,
  runProfileLocal,
} from "./dist/index.js";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
  });
}

const workspace = mkdtempSync(path.join(tmpdir(), "riddle-proof-extra-http-headers-"));
const outputDir = path.join(workspace, "artifacts");
const secret = `runtime-only-${randomBytes(24).toString("base64url")}`;
const secretHeaderName = "x-riddle-runtime-secret";
let authorizedRequests = 0;

const server = createServer((request, response) => {
  if (request.headers[secretHeaderName] !== secret) {
    response.writeHead(401, { "content-type": "text/plain; charset=utf-8" });
    response.end("Unauthorized");
    return;
  }
  authorizedRequests += 1;
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'",
    "content-type": "text/html; charset=utf-8",
  });
  response.end("<!doctype html><html><body><main id=\"private-target\">Authorized local target</main></body></html>");
});

try {
  await listen(server);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const targetUrl = `http://127.0.0.1:${address.port}/`;

  const unauthenticated = await fetch(targetUrl);
  assert.equal(unauthenticated.status, 401);

  const verifier = createRiddleProofBrowserProfileResultVerifier();
  assert.equal(verifier.ok, true, verifier.ok ? undefined : verifier.error.message);
  const { privateKey } = generateKeyPairSync("ed25519");
  const output = await runProfileLocal({
    profile: {
      version: "riddle-proof.profile.v1",
      name: "runtime-header-capability",
      target: {
        viewports: [{ name: "desktop", width: 800, height: 600 }],
        auth: "none",
        wait_for_selector: "#private-target",
        setup_actions: [],
      },
      checks: [
        { type: "text_visible", text: "Authorized local target" },
        { type: "selector_visible", selector: "#private-target" },
      ],
    },
    outputDir,
    url: targetUrl,
    extraHTTPHeaders: {
      [secretHeaderName]: secret,
    },
    groundedCapture: {
      scope: {
        repository: "https://github.com/riddledc/integrations.git",
        revision: "runtime-header-capability-test",
        environment: "local-playwright-test",
        target: targetUrl,
        proof_attempt: "runtime-header-capability-test",
      },
      nonce: randomBytes(32).toString("base64url"),
      collector: {
        collector_id: "@riddledc/riddle-proof-runner-playwright",
        collector_version: "0.6.0",
        implementation_digest: `sha256:${"1".repeat(64)}`,
      },
      verifier: verifier.verifier_ref,
      signingKey: {
        key_id: "runtime-header-capability-test",
        private_key_pkcs8_base64: privateKey.export({
          format: "der",
          type: "pkcs8",
        }).toString("base64"),
      },
    },
  });

  assert.equal(output.result.status, "passed");
  assert.ok(output.groundedCaptureBundle);
  assert.ok(authorizedRequests > 0);
  assert.equal(JSON.stringify(output).includes(secret), false);

  const secretBytes = Buffer.from(secret);
  const retainedFiles = collectFiles(outputDir);
  assert.ok(retainedFiles.length > 0);
  for (const artifactPath of retainedFiles) {
    assert.equal(
      readFileSync(artifactPath).includes(secretBytes),
      false,
      `runtime header secret must not be retained in ${path.relative(outputDir, artifactPath)}`,
    );
  }

  const invalidSecret = `invalid-${randomBytes(16).toString("base64url")}`;
  await assert.rejects(
    () => createPlaywrightBrowserSession({
      extraHTTPHeaders: {
        [secretHeaderName]: `${invalidSecret}\r\nx-injected: true`,
      },
    }),
    (error) => {
      assert.match(String(error), /invalid header value/u);
      assert.equal(String(error).includes(invalidSecret), false);
      return true;
    },
  );
  await assert.rejects(
    () => createPlaywrightBrowserSession({
      extraHTTPHeaders: {
        "X-Duplicate": "one",
        "x-duplicate": "two",
      },
    }),
    /invalid or duplicate header name/u,
  );
  await assert.rejects(
    () => createPlaywrightBrowserSession({
      extraHTTPHeaders: new (class HeaderBag {
        [secretHeaderName] = "not-a-plain-object";
      })(),
    }),
    /must be a plain object/u,
  );
} finally {
  if (server.listening) await close(server);
  rmSync(workspace, { recursive: true, force: true });
}

console.log("extraHTTPHeaders runtime capability test passed");
