import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const dependencyPackageName = "@riddledc/riddle-proof";

type PackageJson = {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function readPackageJson(packageJsonPath: string): PackageJson | null {
  if (!existsSync(packageJsonPath)) return null;
  return JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;
}

function dependencySpec(packageJson: PackageJson | null, packageName: string) {
  return packageJson?.dependencies?.[packageName]
    ?? packageJson?.peerDependencies?.[packageName]
    ?? packageJson?.devDependencies?.[packageName]
    ?? null;
}

const pluginPackageJson = readPackageJson(join(packageRoot, "package.json"));
const dependencyPackageJson = readPackageJson(join(packageRoot, "..", "riddle-proof", "package.json"));

const packageMetadata = {
  plugin_package: pluginPackageJson?.name ?? "@riddledc/openclaw-riddle-proof",
  plugin_version: pluginPackageJson?.version ?? null,
  dependency_package: dependencyPackageJson?.name ?? dependencyPackageName,
  dependency_version: dependencyPackageJson?.version ?? dependencySpec(pluginPackageJson, dependencyPackageName),
};

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  outDir: "dist",
  clean: true,
  define: {
    __RIDDLE_PROOF_PACKAGE_METADATA__: JSON.stringify(packageMetadata),
  },
});
