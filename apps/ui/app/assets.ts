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
    ],
    allowPackages: ["remix", "@harrhy/ui"],
    denyFiles: ["**/__tests__/**", "**/*.server.*"],
    watch: false,
  });
}
