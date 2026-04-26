import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET = process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:18787";

const API_PROXY = {
  "/api": {
    target: API_TARGET,
    changeOrigin: true,
    ws: true,
  },
} as const;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: "127.0.0.1",
    proxy: { ...API_PROXY },
  },
  /** 与 dev 一致，避免 `npm run preview` 时 /api 落到静态服务导致 404。 */
  preview: {
    port: 4173,
    host: "127.0.0.1",
    proxy: { ...API_PROXY },
  },
});
