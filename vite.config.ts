import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  root: "frontend",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./frontend", import.meta.url)),
    },
  },
  build: {
    outDir: "../ui",
    emptyOutDir: true,
    // DBX embeds the UI in srcdoc with script-src 'unsafe-inline' blob:.
    // External chunks (including dynamic imports) cannot load in that sandbox.
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
