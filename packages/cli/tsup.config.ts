import { defineConfig } from "tsup";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: true,
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
  },
  external: [
    "@nimblebrain/mpak-sdk",
    "@nimblebrain/mpak-schemas",
  ],
});
