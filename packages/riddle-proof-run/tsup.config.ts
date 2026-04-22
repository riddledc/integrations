import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/core.ts", "src/engine.ts"],
  format: ["esm"],
  clean: true,
  sourcemap: false,
  dts: false,
  outDir: "dist",
  target: "node20",
});
