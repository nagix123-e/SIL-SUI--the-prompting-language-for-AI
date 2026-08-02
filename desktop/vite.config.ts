import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: path.resolve(import.meta.dirname),
  publicDir: path.resolve(import.meta.dirname, "../public"),
  server: { port: 1420, strictPort: true },
  build: { outDir: path.resolve(import.meta.dirname, "dist"), emptyOutDir: true },
});
