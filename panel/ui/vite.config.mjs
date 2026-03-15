import { resolve } from "node:path";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  root: resolve(process.cwd(), "panel/ui"),
  base: "./",
  server: {
    proxy: {
      "/bridge": {
        target: "http://127.0.0.1:43123",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bridge/, ""),
      },
    },
  },
  build: {
    outDir: resolve(process.cwd(), "panel/cep"),
    emptyOutDir: false,
  },
});
