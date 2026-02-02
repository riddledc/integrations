import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const pkgPath = path.join(repoRoot, "package.json");
const pluginPath = path.join(repoRoot, "openclaw.plugin.json");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const plugin = JSON.parse(fs.readFileSync(pluginPath, "utf8"));

if (!pkg.version) throw new Error("package.json missing version");
if (!plugin.id) throw new Error("openclaw.plugin.json missing id");

plugin.version = pkg.version;

fs.writeFileSync(pluginPath, JSON.stringify(plugin, null, 2) + "\n", "utf8");
console.log(`Synced openclaw.plugin.json version -> ${pkg.version}`);
