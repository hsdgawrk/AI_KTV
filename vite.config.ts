import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    https: localHttpsOptions(),
    proxy: {
      "/media": "http://localhost:3000",
      "/ws": {
        target: "ws://localhost:3000",
        ws: true
      }
    }
  },
  build: {
    outDir: "dist/client"
  }
});

function localHttpsOptions() {
  if (process.env.AI_KTV_HTTPS !== "1") return undefined;

  const pfxPath = path.resolve(process.env.AI_KTV_HTTPS_PFX ?? ".cert/ai-ktv-local.pfx");
  if (!fs.existsSync(pfxPath)) {
    throw new Error(`Missing HTTPS certificate: ${pfxPath}. Run npm run cert:local first.`);
  }

  return {
    pfx: fs.readFileSync(pfxPath),
    passphrase: process.env.AI_KTV_HTTPS_PFX_PASSPHRASE ?? "ai-ktv-local-dev"
  };
}
