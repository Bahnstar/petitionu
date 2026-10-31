import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

const serverUrl = process.env.PETITIONU_SERVER_URL ?? "http://127.0.0.1:4100"

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
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
