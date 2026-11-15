import { resolve } from "node:path";
import { createAssetServer } from "remix/assets";
export function createAssets() {
  return createAssetServer({
    rootDir: resolve(import.meta.dirname, "../../.."),
    basePath: "/assets",
    mounts: {
      ui: "apps/ui/app/public",
      hui: "packages/ui",
      npm: "node_modules",
    },
    allowFiles: [
      "apps/ui/app/public/**",
      "packages/ui/*.ts",
      "packages/ui/*.tsx",
      "packages/ui/fonts.css",
      "packages/ui/fonts/*.woff2",
    ],
    allowPackages: [
      "remix",
      "@harrhy/ui",
      "@chenglou/pretext",
      "@shikijs/core",
      "@shikijs/engine-javascript",
      "@shikijs/langs",
      "@shikijs/themes",
    ],
    files: { extensions: [".woff2"] },
    denyFiles: ["**/__tests__/**", "**/*.server.*"],
    watch: false,
  });
}
