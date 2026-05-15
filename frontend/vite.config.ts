/// <reference types="vitest" />

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const devPort = 5173;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const previewPort = Number(process.env.PORT) || 4173;

  if (mode === "production" && !(env.VITE_API_BASE_URL ?? "").trim()) {
    console.warn(
      "[vite] VITE_API_BASE_URL missing at build time — bundle embeds localhost unless dist/runtime-env.js is rewritten at container start (npm run preview runs scripts/write-runtime-env.mjs).",
    );
  }

  return {
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
    /**
     * Vite 8 defaults to Lightning CSS minify; it currently rejects some valid `@keyframes`
     * blocks (e.g. in public-feedback-jewelry-card.css), failing `npm run build` on Railway.
     */
    build: {
      cssMinify: "esbuild",
    },
    test: {
      environment: "jsdom",
    },
  } as any;
});
