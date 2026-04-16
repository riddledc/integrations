import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJsonPath = join(root, "package.json");
const manifestPath = join(root, "openclaw.plugin.json");

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

manifest.version = packageJson.version;

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Synced openclaw.plugin.json version -> ${packageJson.version}`);
