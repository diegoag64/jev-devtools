import { defineConfig } from "vite";
import { jevInspectorServer } from "./server/plugin.ts";

export default defineConfig(({ mode }) => ({
  plugins: [
    // Complete capture comparisons must not depend on observing traces before eviction.
    jevInspectorServer(mode === "capture-verification" ? 200 : undefined),
  ],
  server: { host: "127.0.0.1", port: 4182, strictPort: true },
  build: { outDir: "dist" },
}));
