import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

const serverUrl = process.env.PETITIONU_SERVER_URL ?? "http://127.0.0.1:4100"

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
    // Match esbuild's order so `./app` resolves to app.tsx, not the LiveView app.js.
    extensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".mts", ".json"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/rpc": serverUrl,
      "/api/auth": serverUrl,
      "/healthz": serverUrl,
    },
  },
})
