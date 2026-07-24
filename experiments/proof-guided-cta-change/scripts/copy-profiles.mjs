import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(root, "dist", "profiles");
mkdirSync(destination, { recursive: true });
cpSync(
  path.join(root, "profiles", "cta-conformance.json"),
  path.join(destination, "cta-conformance.json"),
);
