import { defineConfig } from "vite";
export default defineConfig({
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    target: "esnext",
    outDir: "dist/client",
    rolldownOptions: { output: { chunkFileNames: "assets/[name]-[hash].js" } },
    lib: {
      entry: { boot: "app/entry.ts", world: "app/canvas.tsx" },
      formats: ["es"],
      fileName: (_format, name) => `assets/${name}.js`,
    },
  },
});
