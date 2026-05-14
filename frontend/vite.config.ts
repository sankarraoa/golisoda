/// <reference types="vitest" />

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const devPort = 5173;
const previewPort = Number(process.env.PORT) || 4173;

export default defineConfig({
  plugins: [react()],
  server: {
    port: devPort,
  },
  /**
   * Railway runs `vite preview` in prod and probes with Host `healthcheck.railway.app`.
   * Without `allowedHosts`, Vite rejects those requests (503). Bind `0.0.0.0` and use `$PORT`.
   */
  preview: {
    host: "0.0.0.0",
    port: previewPort,
    strictPort: true,
    allowedHosts: true,
  },
  test: {
    environment: "jsdom",
  },
} as any);
