import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const packagesDir = join(repoRoot, "..", "packages");
const packageNames = await readdir(packagesDir, { withFileTypes: true });
const mismatches = [];
let checked = 0;

for (const entry of packageNames) {
  if (!entry.isDirectory()) continue;
  const packageDir = join(packagesDir, entry.name);
  const packageJsonPath = join(packageDir, "package.json");
  const manifestPath = join(packageDir, "openclaw.plugin.json");

  let packageJson;
  let manifest;
  try {
    packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") continue;
    throw error;
  }

  checked += 1;
  if (packageJson.version !== manifest.version) {
    mismatches.push(`${entry.name}: package.json=${packageJson.version} openclaw.plugin.json=${manifest.version}`);
  }
}

if (mismatches.length > 0) {
  console.error("OpenClaw plugin manifest version mismatch:");
  for (const mismatch of mismatches) console.error(`- ${mismatch}`);
  process.exit(1);
}

console.log(`OpenClaw plugin manifest versions match (${checked} checked).`);
