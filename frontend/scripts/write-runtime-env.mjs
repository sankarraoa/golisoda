/**
 * Writes dist/runtime-env.js from process.env so production preview can override
 * API URLs without rebuilding (Railpack/build-cache friendly).
 */
import { existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "..", "dist");
const outFile = join(distDir, "runtime-env.js");

const KEYS = [
  "VITE_API_BASE_URL",
  "VITE_TEMPLATE_API_BASE_URL",
  "VITE_PUBLIC_FEEDBACK_API_URL",
  "VITE_PLATFORM_API_BASE_URL",
];

if (!existsSync(distDir)) {
  console.warn("[write-runtime-env] dist/ not found — skipping (run vite build first).");
  process.exit(0);
}

const env = {};
for (const key of KEYS) {
  const raw = process.env[key];
  if (typeof raw === "string" && raw.trim() !== "") {
    env[key] = raw.trim();
  }
}

const serialized = JSON.stringify(env);
const body = `window.__GOLI_RUNTIME_ENV__=Object.assign({},window.__GOLI_RUNTIME_ENV__||{},${serialized});`;

writeFileSync(outFile, body, "utf8");
