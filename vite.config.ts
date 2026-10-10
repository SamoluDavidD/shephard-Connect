import vue from "@vitejs/plugin-vue"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"
import { defineConfig } from "vite"

export default defineConfig(({ mode }) => ({
  base: "/",
  build: {
    sourcemap: mode === "development" ? "inline" : false,
    minify: mode !== "development",
  },
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT || 8443),
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://127.0.0.1:3000",
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.PORT || 8443),
  },
}))
